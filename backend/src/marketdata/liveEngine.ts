import type { Candle } from '../kite/client.js';
import type { InstrumentBook } from '../instruments/book.js';
import { dayOf } from './candles.js';
import type { LiveMarket } from './live.js';
import { GROUPS, type LiveSubs } from './liveSubs.js';

export interface EngineDeps {
  live: LiveMarket;
  subs: LiveSubs;
  book: () => InstrumentBook | undefined;
  ticker: () => { state: string; subscribedCount: number; reconnects: number; connectedAt: number; lastTickAt: number };
  limiter: () => Record<string, { queued: number; background: number; total: number; lastMinute: number; lastAt: number | null }>;
  historical: (token: number, from: string, to: string, oi: boolean) => Promise<Candle[]>;
  /** the shared history read (it seeds the tick-built series); run in the background lane */
  read?: (q: { token: number; interval: '5minute'; from: string; to: string; oi: boolean }) => Promise<unknown>;
  background?: <T>(fn: () => T) => T;
  /** is it a day and time when the market is (about to be) open */
  canRun?: () => boolean;
  /** limit the start-of-day load and the reconcile to these groups (an NSE holiday: the commodity groups only); null = all */
  onlyGroups?: () => string[] | null;
  /** more names whose spot and futures are reconciled each slot (the heavyweight stocks) */
  keyNames?: () => string[];
  pulse?: () => unknown;
  now?: () => number;
}

export interface CheckRow { label: string; group: string; matched: number; exact: number; onlyKite: number; maxPriceDiff: number; volumeRatio: number | null; verdict: string }

export interface VerifyResult {
  token: number; label: string; day: string; hasOi: boolean; live: number; kite: number; matched: number; onlyLive: number; onlyKite: number;
  exact: number; maxPriceDiff: number; volumeLive: number; volumeKite: number; volumeRatio: number | null; oiLast: { live: number | null; kite: number | null } | null;
  rows: { time: string; live: number[]; kite: number[]; note: string }[];
  verdict: string;
}

/** Everything the "Data engine" page shows: what the ticker follows, what is built from ticks, what still goes to Kite, and a check of tick-built candles against Kite's own. */
export class LiveEngine {
  private samples: { t: number; n: number }[] = [];
  private readonly now: () => number;
  private timer: NodeJS.Timeout | null = null;
  private pre = { running: false, total: 0, done: 0, failed: 0, startedAt: 0, finishedAt: 0, day: '' };
  private stopPre = false;
  private tried = new Map<number, string>();
  private check: { at: number; rows: CheckRow[]; running: boolean; day: string } = { at: 0, rows: [], running: false, day: '' };
  constructor(private readonly d: EngineDeps) {
    this.now = d.now ?? Date.now;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sample(), 2000);
    this.timer.unref();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  sample(): void {
    this.samples.push({ t: this.now(), n: this.d.live.ticksSeen });
    if (this.samples.length > 15) this.samples.shift();
  }
  private rate(): number {
    const a = this.samples[0];
    const b = this.samples[this.samples.length - 1];
    return a && b && b.t > a.t ? ((b.n - a.n) / (b.t - a.t)) * 1000 : 0;
  }

  /** Read every followed contract's candles from Kite once (background lane) so the first screen of the day already finds them in memory. */
  async preseed(): Promise<void> {
    if (this.pre.running || !this.d.read || !this.d.background) return;
    if (this.d.canRun && !this.d.canRun()) return;
    const day = dayOf(this.now());
    const from = dayOf(this.now() - 6 * 86400000);
    const order = ['Spot and indices', 'Futures', 'Index options', 'MCX', 'Stock options'];
    const epoch = `${day}|${this.d.ticker().connectedAt}`;
    const only = this.d.onlyGroups?.() ?? null;
    const todo = this.d.subs.list().filter((s) => (!only || only.includes(s.group)) && !this.d.live.info(s.token).fresh && this.tried.get(s.token) !== epoch).sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
    if (!todo.length) return;
    this.pre = { running: true, total: todo.length, done: 0, failed: 0, startedAt: this.now(), finishedAt: 0, day };
    this.stopPre = false;
    this.d.live.log('preseed', `reading ${todo.length} contracts from Kite once (background)`);
    const reasons = new Map<string, number>();
    try {
      for (const s of todo) {
        if (this.stopPre) break;
        this.tried.set(s.token, epoch);
        try {
          await this.d.background!(() => this.d.read!({ token: s.token, interval: '5minute', from, to: day, oi: s.group !== 'Spot and indices' }));
        } catch (e) {
          this.pre.failed++;
          const why = String((e as Error).message ?? e).slice(0, 90);
          reasons.set(why, (reasons.get(why) ?? 0) + 1);
        }
        this.pre.done++;
      }
    } finally {
      this.pre.running = false;
      this.pre.finishedAt = this.now();
      this.d.live.log('preseed', `done: ${this.pre.done - this.pre.failed} read, ${this.pre.failed} failed`);
      for (const [why, n] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 4)) this.d.live.log('preseed', `failed ×${n}: ${why}`);
    }
  }
  stopPreseed(): void { this.stopPre = true; }
  preseedRunning(): boolean { return this.pre.running; }

  private reconSlot = -1;
  private recon = { at: 0, tokens: 0, patched: 0, failed: 0 };
  /** After each 5-minute close, read Kite's own candles for the few contracts everything leans on (spot indices, VIX, futures) and put them over the tick-built ones. */
  async reconcile(): Promise<void> {
    if (!this.d.background || (this.d.canRun && !this.d.canRun())) return;
    const now = this.now();
    const slot = Math.floor(now / 300000);
    if (slot === this.reconSlot || now - slot * 300000 < 25000) return;
    this.reconSlot = slot;
    const day = dayOf(now);
    const keys = new Set(['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'INDIA VIX', 'GIFT NIFTY', 'NIFTY FIN SERVICE', 'NIFTY MID SELECT']);
    for (const n of this.d.keyNames?.() ?? []) keys.add(n);
    const heavy = [...keys].filter((k) => !/ /.test(k));
    const only = this.d.onlyGroups?.() ?? null;
    const todo = this.d.subs.list().filter((s) => (!only || only.includes(s.group)) && ((s.group === 'Spot and indices' && keys.has(s.label)) || (s.group === 'Futures' && heavy.some((h) => s.label.startsWith(h) && /FUT$/.test(s.label))) || ((s.group === 'Futures' || s.group === 'MCX') && /FUT$/.test(s.label) && /^(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY|SENSEX|GOLDM|SILVERM|CRUDEOILM|GOLD|SILVER|CRUDEOIL)/.test(s.label))));
    this.recon = { at: now, tokens: todo.length, patched: 0, failed: 0 };
    for (const s of todo) {
      if (!this.d.live.info(s.token).fresh) continue;
      try {
        const hasOi = s.group !== 'Spot and indices';
        const official = await this.d.background(() => this.d.historical(s.token, day, day, hasOi));
        this.recon.patched += this.d.live.patch(s.token, official);
      } catch {
        this.recon.failed++;
      }
    }
    if (this.recon.patched) this.d.live.log('reconcile', `${this.recon.patched} closed candles of ${todo.length} key contracts replaced by Kite's own`);
  }

  /** Compare a sample of tick-built series with Kite's own (one per group, up to 12) and keep the result. */
  async runCheck(): Promise<void> {
    if (this.check.running) return;
    this.check = { ...this.check, running: true };
    const rows: CheckRow[] = [];
    try {
      const picked: { token: number; group: string }[] = [];
      for (const g of GROUPS) {
        const inGroup = this.d.subs.list().filter((s) => s.group === g && this.d.live.info(s.token).fresh);
        const step = Math.max(1, Math.floor(inGroup.length / 3));
        for (let i = 0; i < inGroup.length && picked.filter((p) => p.group === g).length < 3; i += step) picked.push({ token: inGroup[i]!.token, group: g });
      }
      for (const p of picked.slice(0, 12)) {
        const r = await this.verify(p.token);
        if ('error' in r) continue;
        rows.push({ label: r.label, group: p.group, matched: r.matched, exact: r.exact, onlyKite: r.onlyKite, maxPriceDiff: r.maxPriceDiff, volumeRatio: r.volumeRatio, verdict: r.verdict });
      }
    } finally {
      this.check = { at: this.now(), rows, running: false, day: dayOf(this.now()) };
      const ok = rows.filter((r) => r.onlyKite === 0 && r.maxPriceDiff < 1e-6).length;
      this.d.live.log('check', `accuracy check: ${ok} of ${rows.length} sampled contracts match Kite on every price`);
    }
  }
  checkDone(day: string): boolean { return this.check.day === day || this.check.running; }

  status(): Record<string, unknown> {
    const now = this.now();
    const tk = this.d.ticker();
    const live = this.d.live;
    const groups = GROUPS.map((g) => {
      let followed = 0, seeded = 0, fresh = 0, ticking = 0;
      for (const s of this.d.subs.list()) {
        if (s.group !== g) continue;
        followed++;
        const i = live.info(s.token);
        if (i.meta) { seeded++; if (i.fresh) fresh++; }
        if (i.tick) ticking++;
      }
      return { group: g, followed, seeded, fresh, stale: seeded - fresh, ticking, waiting: followed - ticking };
    });
    const c = live.counts();
    const lim = this.d.limiter();
    const kiteCalls = Object.values(lim).reduce((a, b) => a + b.total, 0);
    return {
      now,
      ticker: { state: tk.state, subscribedCount: tk.subscribedCount, reconnects: tk.reconnects, connectedAt: tk.connectedAt, lastTickAt: tk.lastTickAt, ticksSeen: live.ticksSeen, ticksPerSec: Math.round(this.rate() * 10) / 10, lastTickAgeSec: tk.lastTickAt ? Math.round((now - tk.lastTickAt) / 1000) : null },
      subs: { followed: this.d.subs.list().length, lastSync: this.d.subs.lastSync || null, error: this.d.subs.lastError, ceiling: 2800 },
      series: c,
      groups,
      pulse: this.d.pulse?.() ?? null,
      reconcile: this.recon,
      preseed: this.pre,
      check: this.check,
      history: { served: live.served, servedLastMinute: live.servedLastMinute(), seeds: live.seeds, fallback: live.fallback, kiteCalls, limiter: lim },
    };
  }

  events(n = 150): unknown[] {
    return this.d.live.recent(n);
  }

  series(opts: { group?: string; q?: string; only?: string; limit?: number }): { rows: Record<string, unknown>[]; total: number } {
    const now = this.now();
    const rows: Record<string, unknown>[] = [];
    const seen = new Set<number>();
    const push = (token: number, group: string, label: string): void => {
      seen.add(token);
      const i = this.d.live.info(token);
      rows.push({
        token, label, group, followed: true,
        seeded: !!i.meta, fresh: i.fresh, src: i.meta?.src ?? null, candles: i.candles, lastCandle: i.lastCandle,
        ticks: i.meta?.ticks ?? 0, tickAgeSec: i.meta?.lastTickAt ? Math.round((now - i.meta.lastTickAt) / 1000) : null,
        ltp: i.tick?.ltp ?? null, oi: i.tick?.oi ?? null, volume: i.tick?.volume ?? null, vwap: i.tick?.avgPrice ?? null, hasTick: !!i.tick,
      });
    };
    for (const s of this.d.subs.list()) push(s.token, s.group, s.label);
    const book = this.d.book();
    for (const t of this.d.live.watched()) if (!seen.has(t)) push(t, 'Opened on demand', book?.token(t)?.symbol ?? String(t));
    let out = rows;
    if (opts.group && opts.group !== 'All') out = out.filter((r) => r.group === opts.group);
    if (opts.only === 'stale') out = out.filter((r) => r.seeded && !r.fresh);
    if (opts.only === 'unseeded') out = out.filter((r) => !r.seeded);
    if (opts.only === 'silent') out = out.filter((r) => !r.hasTick);
    const q = (opts.q ?? '').trim().toLowerCase();
    if (q) out = out.filter((r) => String(r.label).toLowerCase().includes(q));
    out.sort((a, b) => String(a.group).localeCompare(String(b.group)) || String(a.label).localeCompare(String(b.label)));
    return { rows: out.slice(0, opts.limit ?? 200), total: out.length };
  }

  /** Compare a token's tick-built candles of today with Kite's own for the same range. */
  async verify(token: number): Promise<VerifyResult | { error: string }> {
    const i = this.d.live.info(token);
    if (!i.meta) return { error: 'This instrument has no tick-built candles yet (it is read from Kite the first time a screen asks for it).' };
    const liveC = this.d.live.candles(token);
    if (!liveC) return { error: 'The tick-built series is stale (the feed reconnected); it is rebuilt the next time a screen reads it.' };
    const day = dayOf(this.now());
    const kite = await this.d.historical(token, day, day, i.meta.hasOi);
    const key = (c: Candle): string => String(c[0]).slice(0, 16);
    const km = new Map(kite.map((c) => [key(c), c]));
    const lm = new Map(liveC.filter((c) => String(c[0]).slice(0, 10) === day).map((c) => [key(c), c]));
    const rows: VerifyResult['rows'] = [];
    let matched = 0, exact = 0, maxPrice = 0, vl = 0, vk = 0;
    for (const [k, l] of lm) {
      vl += l[5] || 0;
      const r = km.get(k);
      if (!r) { rows.push({ time: k.slice(11), live: l.slice(1, 7) as number[], kite: [], note: 'only in the tick-built series' }); continue; }
      matched++;
      const dp = Math.max(Math.abs(l[1] - r[1]), Math.abs(l[2] - r[2]), Math.abs(l[3] - r[3]), Math.abs(l[4] - r[4]));
      maxPrice = Math.max(maxPrice, dp);
      const same = dp < 1e-6 && (l[5] || 0) === (r[5] || 0) && (!i.meta.hasOi || (l[6] ?? 0) === (r[6] ?? 0));
      if (same) exact++;
      else if (rows.length < 12) rows.push({ time: k.slice(11), live: l.slice(1, 7) as number[], kite: r.slice(1, 7) as number[], note: dp >= 1e-6 ? `price differs by ${dp.toFixed(2)}` : (l[5] || 0) !== (r[5] || 0) ? 'volume differs' : 'open interest differs' });
    }
    let onlyKite = 0;
    for (const [k, r] of km) { vk += r[5] || 0; if (!lm.has(k)) { onlyKite++; if (rows.length < 12) rows.push({ time: k.slice(11), live: [], kite: r.slice(1, 7) as number[], note: 'missing from the tick-built series' }); } }
    const onlyLive = lm.size - matched;
    const ll = liveC[liveC.length - 1], kl = kite[kite.length - 1];
    const pct = matched ? Math.round((exact / matched) * 100) : 0;
    const verdict = !kite.length ? 'Kite returned no candles for today to compare against.' : onlyKite === 0 && maxPrice < 1e-6 ? `Prices match Kite on all ${matched} candles${exact === matched ? ', volume and open interest too' : '; volume or open interest differ slightly (ticks are sampled)'}.` : `${pct}% of candles match exactly; ${onlyKite} missing, largest price difference ${maxPrice.toFixed(2)}.`;
    return {
      token, label: this.d.book()?.token(token)?.symbol ?? String(token), day, hasOi: i.meta.hasOi, live: lm.size, kite: kite.length, matched, onlyLive, onlyKite, exact,
      maxPriceDiff: maxPrice, volumeLive: vl, volumeKite: vk, volumeRatio: vk ? vl / vk : null,
      oiLast: i.meta.hasOi ? { live: ll?.[6] ?? null, kite: kl?.[6] ?? null } : null, rows, verdict,
    };
  }
}
