import type { Candle } from '../kite/client.js';
import type { InstrumentBook, Instrument } from '../instruments/book.js';
import { foStockSymbols } from '../instruments/universe.js';
import { curveRead } from '../engine/curve.js';
import { primaryRead, type DCandle } from '../engine/positional.js';
import { computeSetup, type CurveInfo, type Setup } from '../engine/positionalSetup.js';
import { buildSince, dayStats, isTradeable, marketView, viewEstimates, type DayStats, type Estimates, type Since } from '../engine/positionalTiming.js';

export const LOOKBACK_DAYS = 1000;
export const IDEA_WATCH_MIN_CONV = 40;
export const MCX_NAMES = ['CRUDEOIL', 'CRUDEOILM', 'GOLD', 'GOLDM', 'SILVER', 'SILVERM', 'NATURALGAS', 'NATGASMINI', 'ZINC', 'COPPER', 'USDINR'];
const INDEX_FUT: Record<string, string> = { 'NIFTY 50': 'NIFTY', 'NIFTY BANK': 'BANKNIFTY' };

export interface PositionalDeps {
  book: () => InstrumentBook | undefined;
  tokens: () => Record<string, number>;
  history: { candles(q: { token: number; interval: 'day' | '5minute'; from: string; to: string; oi?: boolean; asOf?: string }): Promise<Candle[]> };
  /** names scanned by default besides the indices: the live top-10 of both indices */
  dashboardNames?: () => string[];
  /** every constituent of NIFTY 50 / NIFTY BANK */
  indexNames?: (ix: 'NIFTY 50' | 'NIFTY BANK') => string[];
}

export interface PositionalRow extends Setup {
  name: string;
  stats: DayStats | null;
  since: Since | null;
  est?: Estimates | null;
  tradeable: boolean;
}

export interface PositionalState {
  day: string;
  asOf: string | null;
  running: boolean;
  total: number;
  done: number;
  current: string | null;
  error: string | null;
  rows: PositionalRow[];
  market: ReturnType<typeof marketView> & { niftyStats: DayStats | null };
}

const shift = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** The swing screener over daily candles: the primary read, same-day overlay, plan, timing and duration estimates per name, scanned in the background. */
export class PositionalService {
  private state: PositionalState | null = null;
  private job: Promise<void> | null = null;
  private stop = false;
  constructor(private readonly d: PositionalDeps) {}

  /** daily candles up to the day; with a snapshot time the last candle is rebuilt from the 5-minute candles up to that time (a day candle cannot be cut at a time of day) */
  private async daily(token: number, days: number, day: string, asOf: string | undefined, oi = false): Promise<Candle[]> {
    let c = await this.d.history.candles({ token, interval: 'day', from: shift(day, -days), to: day, oi });
    c = c.filter((x) => String(x[0]).slice(0, 10) <= day);
    if (asOf && asOf < '15:30' && c.length && String(c[c.length - 1]![0]).slice(0, 10) === day) {
      try {
        const m5 = (await this.d.history.candles({ token, interval: '5minute', from: day, to: day, asOf })).filter((x) => String(x[0]).slice(0, 10) === day && String(x[0]).slice(11, 16) <= asOf);
        const last = c[c.length - 1]!;
        if (!m5.length) c = c.slice(0, -1);
        else {
          let hi = -Infinity;
          let lo = Infinity;
          let vol = 0;
          for (const k of m5) {
            hi = Math.max(hi, k[2]);
            lo = Math.min(lo, k[3]);
            vol += k[5] || 0;
          }
          const lastK = m5[m5.length - 1]!;
          const nc: Candle = [last[0], m5[0]![1], hi, lo, lastK[4], vol];
          if (lastK.length > 6) nc.push(lastK[6]);
          else if (last.length > 6) nc.push(last[6]);
          c = c.slice(0, -1).concat([nc]);
        }
      } catch {
        // keep the whole-day candle when the 5-minute read fails
      }
    }
    return c;
  }

  private futOf(name: string, day: string): Instrument | undefined {
    const b = this.d.book();
    if (!b) return undefined;
    const mcx = MCX_NAMES.includes(name);
    const u = INDEX_FUT[name] ?? name;
    const list = mcx ? b.futures('MCX', u) : b.futures('NFO', u);
    return list.find((f) => f.expiry >= day) ?? list[0];
  }

  private async curve(name: string, day: string, asOf: string | undefined): Promise<CurveInfo> {
    const b = this.d.book();
    if (!b) return { ok: false, reason: 'No contracts listed (run Data Load)' };
    const mcx = MCX_NAMES.includes(name);
    const u = INDEX_FUT[name] ?? name;
    const list = (mcx ? b.futures('MCX', u) : b.futures('NFO', u)).filter((c) => !c.expiry || c.expiry >= day);
    if (list.length < 2) return { ok: false, reason: list.length ? 'Only 1 contract listed' : 'No contracts listed (run Data Load)' };
    const [near, far] = list as [Instrument, Instrument];
    try {
      const [nc, fc] = await Promise.all([this.daily(near.token, 5, day, asOf), this.daily(far.token, 5, day, asOf)]);
      if (!nc.length || !fc.length) return { ok: false, reason: `No candle data (${near.symbol}/${far.symbol} — try re-running Data Load if this contract just rolled over)` };
      const r = curveRead(nc[nc.length - 1]![4], fc[fc.length - 1]![4], near.expiry, far.expiry, mcx, name);
      return { ok: true, state: r.state, annualizedPct: r.annualizedPct, dir: r.dir };
    } catch {
      return { ok: false, reason: 'Fetch error' };
    }
  }

  names(scope: 'dashboard' | 'all' | 'nifty50' | 'banknifty' | 'mcx' | string[]): string[] {
    if (Array.isArray(scope)) return scope;
    const idx = ['NIFTY 50', 'NIFTY BANK'];
    if (scope === 'nifty50') return ['NIFTY 50', ...(this.d.indexNames?.('NIFTY 50') ?? [])];
    if (scope === 'banknifty') return ['NIFTY BANK', ...(this.d.indexNames?.('NIFTY BANK') ?? [])];
    if (scope === 'mcx') {
      const b = this.d.book();
      return [...idx, ...MCX_NAMES.filter((n) => b && b.futures('MCX', n).length)];
    }
    if (scope === 'dashboard') return [...new Set([...idx, ...(this.d.dashboardNames?.() ?? [])])];
    const b = this.d.book();
    return [...idx, ...(b ? foStockSymbols(b) : []), ...MCX_NAMES.filter((n) => b && b.futures('MCX', n).length)];
  }

  /** one name's full read: primary, overlay, plan, timing, and the duration estimate when it could make an ideas list */
  async scanOne(name: string, day: string, asOf: string | undefined, nifty: { closes: number[] | null; pct: number }): Promise<PositionalRow | null> {
    const mcx = MCX_NAMES.includes(name);
    const fut = this.futOf(name, day);
    const token = mcx ? fut?.token : this.d.tokens()[name];
    if (!token) return null;
    const candles = (await this.daily(token, LOOKBACK_DAYS, day, asOf)) as DCandle[];
    const futCandles = fut ? ((await this.daily(fut.token, 15, day, asOf, true).catch(() => [])) as DCandle[]) : null;
    const daysToExpiry = fut?.expiry ? daysBetween(day, fut.expiry) : null;
    const curveInfo = await this.curve(name, day, asOf);
    const primary = primaryRead(candles, nifty.closes);
    const setup = computeSetup(candles, futCandles, nifty.pct, fut?.token ?? null, daysToExpiry, curveInfo, primary);
    if (!setup) return null;
    const stats = dayStats(candles.map((c) => c[4]));
    let since: Since | null = null;
    try {
      since = buildSince(setup, candles, nifty.closes);
    } catch {
      since = null;
    }
    const row: PositionalRow = { ...setup, name, stats, since, tradeable: false };
    if (since && row.entry != null && row.convictionPct != null && row.convictionPct >= IDEA_WATCH_MIN_CONV) {
      try {
        row.est = viewEstimates({ ...row, since }, candles, nifty.closes);
      } catch {
        row.est = null;
      }
    }
    row.tradeable = isTradeable({ convictionPct: row.convictionPct, verdict: row.verdict });
    return row;
  }

  private summarise(rows: PositionalRow[], niftyStats: DayStats | null): PositionalState['market'] {
    const skip = new Set(['NIFTY 50', 'NIFTY BANK', ...MCX_NAMES]);
    return { ...marketView(rows.filter((r) => !skip.has(r.name))), niftyStats };
  }

  get(): PositionalState | null {
    return this.state;
  }

  /** Starts a background scan (replaces rows of the same day, keeps the others); returns at once. */
  start(req: { day: string; asOf?: string; names: string[]; fresh?: boolean }): PositionalState {
    if (this.job && this.state) return this.state;
    const prev = this.state && this.state.day === req.day && (this.state.asOf ?? '') === (req.asOf ?? '') && !req.fresh ? this.state.rows : [];
    const st: PositionalState = { day: req.day, asOf: req.asOf ?? null, running: true, total: req.names.length, done: 0, current: null, error: null, rows: prev.filter((r) => !req.names.includes(r.name)), market: { buy: 0, sell: 0, watch: 0, scanned: 0, net: 0, label: 'TOO FEW SIGNALS', niftyStats: null } };
    this.state = st;
    this.stop = false;
    this.job = (async () => {
      const nifty: { closes: number[] | null; pct: number } = { closes: null, pct: 0 };
      let niftyStats: DayStats | null = null;
      try {
        const t = this.d.tokens()['NIFTY 50'];
        if (t) {
          const nc = await this.daily(t, LOOKBACK_DAYS, req.day, req.asOf);
          if (nc.length > 20) {
            nifty.closes = nc.map((c) => c[4]);
            const n = nifty.closes.length;
            nifty.pct = ((nifty.closes[n - 1]! - nifty.closes[n - 21]!) / nifty.closes[n - 21]!) * 100;
            niftyStats = dayStats(nifty.closes);
          }
        }
      } catch {
        // the relative-strength part is simply left out
      }
      let i = 0;
      const work = async (): Promise<void> => {
        while (i < req.names.length && !this.stop) {
          const name = req.names[i++]!;
          st.current = name;
          try {
            const row = await this.scanOne(name, req.day, req.asOf, nifty);
            if (row) st.rows.push(row);
          } catch (e) {
            st.error = `${name}: ${(e as Error).message}`;
          }
          st.done++;
          st.market = this.summarise(st.rows, niftyStats);
        }
      };
      await Promise.all(Array.from({ length: 3 }, work));
      st.running = false;
      st.current = null;
      st.market = this.summarise(st.rows, niftyStats);
    })().finally(() => {
      this.job = null;
    });
    return st;
  }

  cancel(): void {
    this.stop = true;
  }
}
