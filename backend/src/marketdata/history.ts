import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { Candle, HistoryInterval, KiteClient } from '../kite/client.js';
import { dayOf } from './candles.js';
import type { DayRules, Market } from './days.js';

/** Candle interval length in minutes (day = not time-sliced). */
export const INTERVAL_MINUTES: Record<HistoryInterval, number> = { minute: 1, '3minute': 3, '5minute': 5, '10minute': 10, '15minute': 15, '30minute': 30, '60minute': 60, day: 0 };

/** Calendar days one Kite request may span per interval (a little under Kite's caps; the userscript used 95 for 5-minute). */
export const CHUNK_DAYS: Record<HistoryInterval, number> = { minute: 55, '3minute': 90, '5minute': 90, '10minute': 90, '15minute': 170, '30minute': 170, '60minute': 330, day: 1900 };

const date = (c: Candle): string => String(c[0]).slice(0, 10);
const hhmm = (c: Candle): string => String(c[0]).slice(11, 16);
const minsOf = (s: string): number => parseInt(s.slice(11, 13), 10) * 60 + parseInt(s.slice(14, 16), 10);

// ───────────────────────── ports of the userscript's candle helpers (same rules) ─────────────────────────

/** `_gtbStripPrevDayCandles`: keeps candles dated on or after `refDay`. */
export function stripPrevDay(candles: Candle[], refDay: string): Candle[] {
  return candles.filter((c) => date(c) >= refDay);
}

/** `_gtbTrimCandles`: strips earlier days, then keeps candles at or before the snapshot end time ("HH:mm"), when one is set. */
export function trimCandles(candles: Candle[], refDay: string, endTime: string | null): Candle[] {
  const f = stripPrevDay(candles, refDay);
  if (!endTime || !f.length) return f;
  return f.filter((c) => hhmm(c) <= endTime);
}

/** `_gtbTrimCandlesTail`: multi-day arrays; only candles dated `refDay` after the end time are removed. */
export function trimCandlesTail(candles: Candle[], refDay: string, endTime: string | null): Candle[] {
  if (!endTime) return candles;
  return candles.filter((c) => date(c) !== refDay || hhmm(c) <= endTime);
}

/** `_gtbDropFormingCandle`: drops the last candle if its interval has not closed yet (never below one candle). */
export function dropFormingCandle(candles: Candle[], interval: string, nowMs: number): Candle[] {
  if (candles.length < 2) return candles;
  const m = /(\d+)/.exec(interval || '5minute');
  const mins = m ? parseInt(m[1]!, 10) : 5;
  const last = candles[candles.length - 1]!;
  const lastMs = Date.parse(String(last[0]).replace('+0530', '+05:30'));
  if ((nowMs - lastMs) / 60000 < mins) return candles.slice(0, -1);
  return candles;
}

/**
 * The replay's no-look-ahead cut (`_rpServe`): for the replay day, only candles completed by `asOf` ("HH:mm") are returned, and the candle
 * that has just started appears as it would at that moment (open price only, no volume, OI carried from the previous candle). Later candles are dropped.
 * Earlier days pass through untouched.
 */
export function sliceAsOf(candles: Candle[], day: string, asOf: string, intervalMinutes: number): Candle[] {
  const cm = parseInt(asOf.slice(0, 2), 10) * 60 + parseInt(asOf.slice(3, 5), 10);
  const out: Candle[] = [];
  let prevOi: number | null = null;
  for (const c of candles) {
    if (date(c) !== day) {
      out.push(c);
      if (c.length > 6 && c[6] != null) prevOi = c[6];
      continue;
    }
    const m = minsOf(String(c[0]));
    if (m + intervalMinutes <= cm) {
      out.push(c);
      if (c.length > 6 && c[6] != null) prevOi = c[6];
    } else if (m <= cm) {
      const p: Candle = [c[0], c[1], c[1], c[1], c[1], 0];
      if (c.length > 6) p.push(prevOi != null ? prevOi : c[6]);
      out.push(p);
      break;
    } else break;
  }
  return out;
}

// ───────────────────────── calendar helpers ─────────────────────────

const addDays = (day: string, n: number): string => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
export const isWeekend = (day: string): boolean => [0, 6].includes(new Date(day + 'T00:00:00Z').getUTCDay());

let dayRules: DayRules | null = null;
/** registers the Settings day rules (the "previous day" of each market and which names are commodities) */
export function setDayRules(r: DayRules | null): void {
  dayRules = r;
}

/**
 * The previous trading day before `day`. NSE skips weekends and the NSE holidays; MCX skips weekends only (it trades on many NSE holidays). When Settings
 * gives a previous day for the market's configured current day, that is used instead.
 */
export function previousTradingDay(day: string, holidays: ReadonlySet<string> = new Set(), market: Market = 'NSE'): string {
  const o = dayRules?.override(market, day);
  if (o && o < day) return o;
  let d = addDays(day, -1);
  while (isWeekend(d) || (market === 'NSE' && holidays.has(d))) d = addDays(d, -1);
  return d;
}

/** the previous trading day for a name: a commodity uses the MCX rule, everything else the NSE one */
export function previousDayFor(name: string, day: string, holidays: ReadonlySet<string> = new Set()): string {
  return previousTradingDay(day, holidays, dayRules?.isMcx(name) ? 'MCX' : 'NSE');
}

/** Splits [from, to] into windows of at most `chunk` calendar days (inclusive), in order. */
export function dateWindows(from: string, to: string, chunk: number): [string, string][] {
  const out: [string, string][] = [];
  let s = from;
  while (s <= to) {
    const e = addDays(s, chunk - 1);
    const end = e < to ? e : to;
    out.push([s, end]);
    s = addDays(end, 1);
  }
  return out;
}

// ───────────────────────── history service ─────────────────────────

export interface HistoryDeps {
  kite: Pick<KiteClient, 'historical'>;
  dataDir: string;
  now?: () => number;
  /** tick-built candles: a 5-minute read of today is answered from memory when a trustworthy series exists, and the Kite answer seeds one otherwise */
  live?: {
    serve(q: { token: number; from: string; to: string; oi?: boolean }): Candle[] | null;
    prepare(token: number): void;
    seed(q: { token: number; from: string; to: string; oi?: boolean }, candles: Candle[]): void;
  };
}

export interface CandleQuery {
  token: number;
  interval: HistoryInterval;
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD */
  to: string;
  oi?: boolean;
  /** snapshot end time "HH:mm" on the day `to`: the replay cut (no look-ahead) */
  asOf?: string;
  /** read Kite's own candles, never the tick-built ones (the 9:15 scan: its open sets the day's levels) */
  noLive?: boolean;
}

/**
 * Candles for any range, in the userscript's shape. Long ranges are split into Kite-sized windows. Ranges that end before today are final
 * and saved on disk (so a day is fetched from Kite once, ever); a range that includes today is fetched fresh (only the gateway's short cache applies).
 */
export class HistoryService {
  private readonly now: () => number;
  constructor(private readonly d: HistoryDeps) {
    this.now = d.now ?? Date.now;
    mkdirSync(join(d.dataDir, 'candles'), { recursive: true });
  }

  private file(q: CandleQuery): string {
    return join(this.d.dataDir, 'candles', `${q.token}_${q.interval}_${q.oi ? 'oi' : 'px'}_${q.from}_${q.to}.json`);
  }

  async candles(q: CandleQuery): Promise<Candle[]> {
    const today = dayOf(this.now());
    const final = q.to < today;
    const f = this.file(q);
    const liveRead = !!this.d.live && !final && q.interval === '5minute' && !q.asOf && q.to === today && !q.noLive;
    if (liveRead) {
      const hit = this.d.live!.serve(q);
      if (hit) return hit;
      this.d.live!.prepare(q.token);
    }
    let all: Candle[] | undefined;
    if (final && existsSync(f)) {
      try {
        all = JSON.parse(readFileSync(f, 'utf8')) as Candle[];
        if (!all.length) all = undefined; // an empty answer saved by an earlier version or a bad moment is never trusted: ask Kite again
      } catch {
        all = undefined;
      }
    }
    if (!all) {
      all = [];
      for (const [a, b] of dateWindows(q.from, q.to, CHUNK_DAYS[q.interval])) {
        const part = await this.d.kite.historical(q.token, q.interval, a, b, q.oi ?? false);
        all.push(...part);
      }
      if (final && all.length) {
        const tmp = `${f}.tmp`;
        writeFileSync(tmp, JSON.stringify(all), 'utf8');
        renameSync(tmp, f);
      }
    }
    if (liveRead) this.d.live!.seed(q, all);
    let out = all;
    if (q.asOf && INTERVAL_MINUTES[q.interval] > 0) out = sliceAsOf(out, q.to, q.asOf, INTERVAL_MINUTES[q.interval]);
    return out.map((c) => [...c] as Candle);
  }
}
