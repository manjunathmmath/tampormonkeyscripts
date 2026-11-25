import type { KeyValueStore } from '../store/fileStore.js';

export type DigestKind = 'morning' | 'open' | 'close' | 'mcxopen' | 'mcxclose';
export const DIGEST_KINDS: DigestKind[] = ['morning', 'open', 'close', 'mcxopen', 'mcxclose'];

// ───────────────────────────── plain data the messages are built from

export interface IdxRow {
  name: string;
  open: number | null;
  ltp: number | null;
  prev: number | null;
  zone?: string | null;
  firstClose?: number | null;
  aso?: number | null;
  bso?: number | null;
  ast?: number | null;
  bst?: number | null;
}
export interface PlanRow {
  name: string;
  long: boolean;
  rank: number;
  forced: boolean;
  entry: number;
  stop: number;
  t1: number | null;
  t2: number | null;
  rr: number | null;
  atLevel: boolean;
}
export interface EventRow { time: string; title: string; india: string; forecast: string; previous: string }
export interface HeadRow { title: string; source: string; watch: string[] }
export interface MarketRow { score: number; signal: string; reason: string; up: number; dn: number; niftyUp: number; niftyDn: number; bankUp: number; bankDn: number }
export interface McxRow { name: string; open: number; prev: number; ltp: number; zone: string; aso: number; bso: number; vol: string; plan?: PlanRow | null }
export interface Candle5 { t: string; o: number; h: number; l: number; c: number }

const n2 = (x: number | null | undefined, d = 2): string => (x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }));
const n0 = (x: number | null | undefined): string => n2(x, 0);
const pct = (a: number | null | undefined, b: number | null | undefined): string => (a == null || b == null || !b ? '—' : `${a >= b ? '+' : '−'}${Math.abs(((a - b) / b) * 100).toFixed(2)}%`);
const rankWord = (r: number): string => ['', 'LOW', 'MEDIUM', 'HIGH'][r] ?? '';
const short = (name: string): string => (name === 'NIFTY BANK' ? 'BANK NIFTY' : name);
const dayName = (day: string): string => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** How a plan did against the day's 5-minute candles: not reached, entered and still open, hit target 1, or stopped (stop first when both fall in one candle). */
export function planOutcome(p: PlanRow, candles: Candle5[]): string {
  let entered = false;
  for (const c of candles) {
    if (!entered) {
      const reached = p.atLevel || (p.long ? c.l <= p.entry : c.h >= p.entry);
      if (!reached) continue;
      entered = true;
    }
    const stopHit = p.long ? c.l <= p.stop : c.h >= p.stop;
    const t1Hit = p.t1 != null && (p.long ? c.h >= p.t1 : c.l <= p.t1);
    if (stopHit) return 'entered, then stopped';
    if (t1Hit) return 'entered, target 1 reached';
  }
  return entered ? 'entered, still open' : 'entry not reached';
}

const planLine = (p: PlanRow): string =>
  `${short(p.name)}: ${p.forced ? 'LEAN ' : ''}${p.long ? 'LONG' : 'SHORT'} (${rankWord(p.rank)}) entry ${n0(p.entry)}${p.atLevel ? ' now' : ''} · stop ${n0(p.stop)} · T1 ${p.t1 != null ? n0(p.t1) : '—'}${p.rr != null ? ` · R:R ${p.rr.toFixed(1)}` : ''}`;

export interface McxEst { name: string; estimate: number; last: number; pct: number; basisPct: number }
export function buildMorning(a: { day: string; nse: string; mcx: string; gift: IdxRow | null; vix: IdxRow | null; expiry: string[]; events: EventRow[]; heads: HeadRow[]; kiteOk: boolean; mcxEst?: McxEst[] }): string {
  const L: string[] = [`Good morning · ${dayName(a.day)}`, ''];
  L.push(`NSE: ${a.nse}`, `MCX: ${a.mcx}`);
  if (a.gift) L.push(`GIFT NIFTY ${n0(a.gift.ltp)} (${pct(a.gift.ltp, a.gift.prev)})`);
  if (a.vix) L.push(`India VIX ${n2(a.vix.ltp)} (${pct(a.vix.ltp, a.vix.prev)})`);
  if (a.expiry.length) L.push(`Options expiry today: ${a.expiry.join(', ')}`);
  if (a.mcxEst?.length) L.push(`MCX if it opened now (COMEX / NYMEX x USDINR): ${a.mcxEst.map((m) => `${m.name} ~${n0(m.estimate)} (${m.pct >= 0 ? '+' : '−'}${Math.abs(m.pct).toFixed(2)}% vs last ${n0(m.last)})`).join(' · ')}`);
  if (a.events.length) {
    L.push('', 'Events today:');
    for (const e of a.events.slice(0, 6)) L.push(`• ${e.time} ${e.title} (India ${e.india})${e.forecast ? ` · forecast ${e.forecast}` : ''}${e.previous ? ` · prev ${e.previous}` : ''}`);
  }
  if (a.heads.length) {
    L.push('', 'HIGH impact headlines:');
    for (const h of a.heads.slice(0, 4)) L.push(`• ${h.title} (${h.source}${h.watch.length ? `; watch ${h.watch.join(', ')}` : ''})`);
  }
  if (!a.kiteOk) L.push('', 'Kite login is missing or expired: open System and log in so prices load.');
  return L.join('\n');
}

export function buildOpen(a: { day: string; time: string; rows: IdxRow[]; market: MarketRow | null; plans: PlanRow[] }): string {
  const L: string[] = [`NSE is open · ${dayName(a.day)} ${a.time}`, ''];
  for (const r of a.rows) {
    const z = r.zone ? ` · 9:15 ${r.zone}` : '';
    const lv = r.aso != null && r.bso != null ? ` · ASO ${n0(r.aso)} / BSO ${n0(r.bso)}` : '';
    L.push(`${short(r.name)}: open ${n2(r.open)} (${pct(r.open, r.prev)} vs prev close)${z}${lv}`);
  }
  if (a.market) {
    L.push('', `9:15 closes: ${a.market.up} up / ${a.market.dn} down (NIFTY 50 ${a.market.niftyUp}/${a.market.niftyDn}, BANK ${a.market.bankUp}/${a.market.bankDn})`);
    L.push(`Market score ${a.market.score >= 0 ? '+' : ''}${a.market.score.toFixed(2)} · ${a.market.signal}${a.market.reason ? ` (${a.market.reason})` : ''}`);
  }
  if (a.plans.length) { L.push('', 'Probable trade:'); for (const p of a.plans) L.push(planLine(p)); }
  L.push('', 'Levels and plans are rule-based, not a forecast. Nothing is traded.');
  return L.join('\n');
}

export function buildClose(a: { day: string; rows: IdxRow[]; market: MarketRow | null; plans: { plan: PlanRow; outcome: string }[]; movers: { name: string; change: number }[] }): string {
  const L: string[] = [`NSE close · ${dayName(a.day)}`, ''];
  for (const r of a.rows) L.push(`${short(r.name)}: ${n2(r.ltp)} (${pct(r.ltp, r.prev)})`);
  if (a.market) L.push('', `Market score ${a.market.score >= 0 ? '+' : ''}${a.market.score.toFixed(2)} · ${a.market.signal}`);
  if (a.plans.length) { L.push('', 'How today\'s plans did:'); for (const p of a.plans) L.push(`${short(p.plan.name)} ${p.plan.long ? 'LONG' : 'SHORT'} ${n0(p.plan.entry)} → ${p.outcome}`); }
  if (a.movers.length) {
    const up = a.movers.filter((m) => m.change > 0).sort((x, y) => y.change - x.change).slice(0, 3);
    const dn = a.movers.filter((m) => m.change < 0).sort((x, y) => x.change - y.change).slice(0, 3);
    if (up.length) L.push('', `Heavyweights up: ${up.map((m) => `${m.name} ${m.change >= 0 ? '+' : ''}${m.change.toFixed(2)}%`).join(', ')}`);
    if (dn.length) L.push(`Heavyweights down: ${dn.map((m) => `${m.name} ${m.change.toFixed(2)}%`).join(', ')}`);
  }
  return L.join('\n');
}

export function buildMcxOpen(a: { day: string; time: string; rows: McxRow[] }): string {
  const L: string[] = [`MCX is open · ${dayName(a.day)} ${a.time}`, ''];
  for (const r of a.rows) {
    L.push(`${r.name}: open ${n0(r.open)} (${pct(r.open, r.prev)} vs prev close) · 9:15 ${r.zone} · ASO ${n0(r.aso)} / BSO ${n0(r.bso)}${r.vol ? ` · ${r.vol}` : ''}`);
    if (r.plan) L.push(`  ${planLine(r.plan)}`);
  }
  L.push('', 'Levels and plans are rule-based, not a forecast. Nothing is traded.');
  return L.join('\n');
}

export function buildMcxClose(a: { day: string; rows: McxRow[] }): string {
  const L: string[] = [`MCX close · ${dayName(a.day)}`, ''];
  for (const r of a.rows) L.push(`${r.name}: ${n0(r.ltp)} (${pct(r.ltp, r.prev)} on the day, open ${n0(r.open)})`);
  return L.join('\n');
}

// ───────────────────────────── the scheduler

export interface DigestData {
  morning(day: string): Promise<string>;
  open(day: string): Promise<{ text: string; zones: number }>;
  close(day: string): Promise<string>;
  mcxopen(day: string): Promise<string>;
  mcxclose(day: string): Promise<string>;
}
export interface DigestDeps {
  store: KeyValueStore;
  data: DigestData;
  /** sends the message; says why when it could not (not set up, or what Telegram answered) */
  send: (text: string) => Promise<{ ok: boolean; why?: string }>;
  enabled: (k: DigestKind) => boolean;
  session: { nseDay(): string; mcxDay(): string; nseTicking(): boolean; mcxTicking(): boolean };
  now?: () => number;
}

const IST = 19800000;
const DEADLINE_OPEN_MIN = 9 * 60 + 45;

/**
 * Sends the day's updates to Telegram: a morning brief, a snapshot once NSE has opened, a close summary, and the same for MCX. Each goes out once a day
 * (remembered, so a restart does not repeat it), decided by the data: a market "has opened" when its reference instrument ticks and its session day is today.
 */
export class DigestService {
  private busy = false;
  private readonly now: () => number;
  constructor(private readonly d: DigestDeps) {
    this.now = d.now ?? Date.now;
  }

  private sent(): Record<string, number> {
    return this.d.store.get<Record<string, number>>('digest.sent') ?? {};
  }
  private mark(key: string): void {
    const s = this.sent();
    s[key] = this.now();
    const cut = this.now() - 14 * 86400000;
    for (const k of Object.keys(s)) if (s[k]! < cut) delete s[k];
    this.d.store.set('digest.sent', s);
  }
  private has(day: string, k: DigestKind): boolean {
    return `${day}|${k}` in this.sent();
  }

  /** the text of one update (built now; nothing is sent) */
  async preview(kind: DigestKind, day?: string): Promise<string> {
    const t = new Date(this.now() + IST).toISOString().slice(0, 10);
    const nse = day ?? this.d.session.nseDay();
    const mcx = day ?? this.d.session.mcxDay();
    switch (kind) {
      case 'morning': return this.d.data.morning(t);
      case 'open': return (await this.d.data.open(nse)).text;
      case 'close': return this.d.data.close(nse);
      case 'mcxopen': return this.d.data.mcxopen(mcx);
      case 'mcxclose': return this.d.data.mcxclose(mcx);
    }
  }

  async sendNow(kind: DigestKind): Promise<{ text: string; sent: boolean; why?: string }> {
    const text = await this.preview(kind);
    const r = await this.d.send(text);
    return { text, sent: r.ok, why: r.why };
  }

  /** one pass: send whatever is due and not yet sent today */
  async tick(): Promise<DigestKind[]> {
    if (this.busy) return [];
    this.busy = true;
    const out: DigestKind[] = [];
    try {
      const t = new Date(this.now() + IST);
      const today = t.toISOString().slice(0, 10);
      const mins = t.getUTCHours() * 60 + t.getUTCMinutes();
      const wd = t.getUTCDay();
      if (wd === 0 || wd === 6) return out;
      const s = this.d.session;
      const due = (k: DigestKind): boolean => this.d.enabled(k) && !this.has(today, k);
      const fire = async (k: DigestKind, build: () => Promise<string | null>): Promise<void> => {
        const text = await build();
        if (!text) return;
        if ((await this.d.send(text)).ok) { this.mark(`${today}|${k}`); out.push(k); }
      };
      if (due('morning') && mins >= 8 * 60 + 45 && mins < 9 * 60 + 30) await fire('morning', () => this.d.data.morning(today));
      if (due('open') && s.nseTicking() && s.nseDay() === today && mins >= 9 * 60 + 20 && mins <= 11 * 60) {
        await fire('open', async () => {
          const r = await this.d.data.open(today);
          return r.zones >= 10 || mins >= DEADLINE_OPEN_MIN ? r.text : null; // wait for the 9:15 scan, then send whatever there is
        });
      }
      if (due('close') && s.nseDay() === today && mins >= 15 * 60 + 35 && mins <= 18 * 60) await fire('close', () => this.d.data.close(today));
      if (due('mcxopen') && s.mcxTicking() && s.mcxDay() === today) await fire('mcxopen', () => this.d.data.mcxopen(today));
      if (due('mcxclose') && s.mcxDay() === today && mins >= 23 * 60 + 36 && (!s.mcxTicking() || mins >= 23 * 60 + 57)) await fire('mcxclose', () => this.d.data.mcxclose(today));
    } finally {
      this.busy = false;
    }
    return out;
  }
}
