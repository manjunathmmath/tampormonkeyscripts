import type { Candle } from '../kite/client.js';
import { applyTick, dayOf, newSeries, type SeriesState } from './candles.js';
import type { Tick } from './ticks.js';

export interface LiveEvent { at: number; kind: string; text: string }
export interface SeriesMeta {
  /** the real calendar day (IST) the series belongs to */
  day: string;
  /** first date the seeded candles cover */
  from: string;
  /** the ticker connection it was built under: a reconnect makes it stale (ticks were missed) */
  epoch: number;
  seededAt: number;
  hasOi: boolean;
  ticks: number;
  lastTickAt: number;
  /** who seeded it */
  src: 'history' | 'chain';
  /** built from ticks alone since it was watched, with no read of the day's earlier candles: never served in place of Kite */
  partial?: boolean;
}
export interface LiveDeps {
  /** a number that changes whenever the ticker reconnects */
  epoch: () => number;
  /** is the feed connected and delivering right now (a down feed means every read goes to Kite) */
  healthy: () => boolean;
  now?: () => number;
}
export interface ServeQuery { token: number; from: string; to: string; oi?: boolean }

const REASONS = ['feed down', 'not seeded', 'stale (reconnect)', 'other day', 'range earlier', 'oi mismatch'] as const;
export type Reason = (typeof REASONS)[number];

/**
 * Live 5-minute candles per instrument token, built from ticks. A series is created when a token's candles are first read from Kite (the seed)
 * or when the option chain watches a contract; from then on every tick for that token updates it, and reads of "today" are answered from memory
 * instead of asking Kite again. A series is only served while it is trustworthy: same day, same ticker connection (a reconnect loses ticks, so every
 * series is re-read once), covering the range asked, and the feed healthy. Also keeps the last tick per token for quote-style reads.
 */
export class LiveMarket {
  private series = new Map<number, SeriesState>();
  private meta = new Map<number, SeriesMeta>();
  private last = new Map<number, Tick>();
  private prep = new Map<number, number>();
  ticksSeen = 0;
  served = 0;
  seeds = 0;
  readonly fallback: Record<Reason, number> = { 'feed down': 0, 'not seeded': 0, 'stale (reconnect)': 0, 'other day': 0, 'range earlier': 0, 'oi mismatch': 0 };
  private events: LiveEvent[] = [];
  private servedStamps: number[] = [];
  private readonly now: () => number;

  constructor(private readonly d: LiveDeps = { epoch: () => 0, healthy: () => true }) {
    this.now = d.now ?? Date.now;
  }

  log(kind: string, text: string): void {
    this.events.push({ at: this.now(), kind, text });
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }
  recent(n = 150): LiveEvent[] {
    return this.events.slice(-n).reverse();
  }

  private today(): string {
    return dayOf(this.now());
  }

  /** Start building candles for a token (the option chain's path). A series that is stale is replaced by the new seed. */
  watch(token: number, hasOi: boolean, seed: Candle[] = []): void {
    const m = this.meta.get(token);
    if (this.series.has(token) && m && this.fresh(m) && !(m.partial && seed.length)) return;
    this.install(token, hasOi, seed, seed[0] ? String(seed[0][0]).slice(0, 10) : this.today(), 'chain');
    // a watch with nothing to start from (the chart's own stream) only collects ticks: it must not stand in for the day's candles
    if (!seed.length) this.meta.get(token)!.partial = true;
  }

  private fresh(m: SeriesMeta): boolean {
    return m.day === this.today() && m.epoch === this.d.epoch();
  }

  private install(token: number, hasOi: boolean, seed: Candle[], from: string, src: SeriesMeta['src'], epoch = this.d.epoch()): void {
    this.series.set(token, newSeries(hasOi, seed));
    this.meta.set(token, { day: this.today(), from, epoch, seededAt: this.now(), hasOi, ticks: 0, lastTickAt: 0, src });
    this.seeds++;
  }

  unwatch(token: number): void {
    this.series.delete(token);
    this.meta.delete(token);
    this.last.delete(token);
  }

  watched(): number[] {
    return [...this.series.keys()];
  }

  onTicks(ticks: Tick[], now: number): void {
    for (const t of ticks) {
      this.ticksSeen++;
      this.last.set(t.token, t);
      const st = this.series.get(t.token);
      if (st) {
        applyTick(st, t, now, true);
        const m = this.meta.get(t.token);
        if (m) { m.ticks++; m.lastTickAt = now; }
      }
    }
  }

  /** the series when it is trustworthy, else undefined (callers then read Kite and seed again) */
  candles(token: number): Candle[] | undefined {
    const m = this.meta.get(token);
    if (!m || !this.fresh(m)) return undefined;
    return this.series.get(token)?.candles.map((c) => [...c] as Candle);
  }

  lastTick(token: number): Tick | undefined {
    return this.last.get(token);
  }

  // ── the history service's side ──

  /** Called before a Kite read of today: remember the ticker connection the read starts under. */
  prepare(token: number): void {
    this.prep.set(token, this.d.epoch());
  }

  /** The candles for a read of today, from memory, or null (with the reason counted) when Kite must be asked. */
  serve(q: ServeQuery): Candle[] | null {
    const m = this.meta.get(q.token);
    const miss = (r: Reason): null => { this.fallback[r]++; return null; };
    if (!this.d.healthy()) return miss('feed down');
    if (!m || m.partial) return miss('not seeded');
    if (m.day !== this.today()) return miss('other day');
    if (m.epoch !== this.d.epoch()) return miss('stale (reconnect)');
    if (q.from < m.from) return miss('range earlier');
    if (!!q.oi !== m.hasOi && q.oi) return miss('oi mismatch');
    const st = this.series.get(q.token);
    if (!st) return miss('not seeded');
    this.served++;
    this.servedStamps.push(this.now());
    return st.candles.filter((c) => String(c[0]).slice(0, 10) >= q.from && String(c[0]).slice(0, 10) <= q.to).map((c) => [...c] as Candle);
  }

  /** Called with a Kite answer for today: build the series from it (unless the connection changed meanwhile). */
  seed(q: ServeQuery, candles: Candle[]): void {
    const was = this.prep.get(q.token);
    this.prep.delete(q.token);
    if (was === undefined || was !== this.d.epoch()) return;
    this.install(q.token, !!q.oi, candles, q.from, 'history', was);
  }

  /**
   * Replace tick-built candles with Kite's own for the candles that have closed (the forming one is left alone). Ticks are sampled, so a high, a low or an
   * open can differ by a few points; this is done each slot for the few contracts everything else leans on (indices, futures).
   */
  patch(token: number, official: Candle[]): number {
    const st = this.series.get(token);
    const m = this.meta.get(token);
    if (!st || !m || !this.fresh(m)) return 0;
    const lastKey = st.candles.length ? String(st.candles[st.candles.length - 1]![0]).slice(0, 16) : '';
    let n = 0;
    for (const o of official) {
      const k = String(o[0]).slice(0, 16);
      if (k >= lastKey) continue; // the forming candle keeps following ticks
      const i = st.candles.findIndex((c) => String(c[0]).slice(0, 16) === k);
      const copy = [...o] as Candle;
      if (!m.hasOi && copy.length > 6) copy.length = 6;
      if (i >= 0) { const a = st.candles[i]!; if (a.some((v, j) => v !== copy[j])) { st.candles[i] = copy; n++; } }
    }
    return n;
  }

  // ── for the status page ──

  servedLastMinute(): number {
    const cut = this.now() - 60000;
    while (this.servedStamps.length && this.servedStamps[0]! < cut) this.servedStamps.shift();
    return this.servedStamps.length;
  }

  info(token: number): { meta: SeriesMeta | null; candles: number; lastCandle: string | null; fresh: boolean; tick: Tick | undefined } {
    const m = this.meta.get(token) ?? null;
    const c = this.series.get(token)?.candles;
    return { meta: m, candles: c?.length ?? 0, lastCandle: c && c.length ? String(c[c.length - 1]![0]) : null, fresh: !!m && this.fresh(m), tick: this.last.get(token) };
  }

  counts(): { series: number; fresh: number; stale: number; lastTicks: number } {
    let fresh = 0;
    for (const m of this.meta.values()) if (this.fresh(m)) fresh++;
    return { series: this.series.size, fresh, stale: this.series.size - fresh, lastTicks: this.last.size };
  }

  /** drop everything (a new day, or the feed is switched off) */
  clear(): void {
    this.series.clear();
    this.meta.clear();
    this.last.clear();
    this.prep.clear();
  }
}
