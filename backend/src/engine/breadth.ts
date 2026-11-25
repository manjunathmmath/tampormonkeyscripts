/**
 * Market-wide breadth: the advance / decline scores and the futures trend scores that feed the composite score, ported from `showAdvacenDeclineScanner`
 * and `showFuturesTrend` (grootTradeBot.js), plus the 9:15 close score, the capped OI/OBV score and the weighted component scores of `setScore`.
 *
 * The userscript counts, for every stock and every 5-minute candle of the day, whether the close is at or beyond that stock's ASO (advance) or BSO
 * (decline). The time slots are those of the first stock's candles; a candle of another stock with a time outside that list is not counted.
 */
import { futuresTrendScore, type Remark } from './futures.js';

export interface AdStock {
  name: string;
  inNifty50: boolean;
  inBank: boolean;
  aso: number;
  bso: number;
  /** 5-minute candle times (HH:MM) and closes of the day, in order */
  candles: { time: string; close: number }[];
}

const ratio = (a: number, d: number): number => (a + d > 0 ? parseFloat(((a - d) / (a + d)).toFixed(2)) : 0);

/** The three advance / decline scores (-1..1): all stocks, NIFTY 50 stocks, BANK NIFTY stocks. */
export function advanceDeclineScores(stocks: AdStock[]): { all: number; nifty: number; bank: number; sample: number } {
  const times = new Set((stocks[0]?.candles ?? []).map((c) => c.time));
  let aA = 0;
  let aD = 0;
  let nA = 0;
  let nD = 0;
  let bA = 0;
  let bD = 0;
  for (const s of stocks) {
    for (const c of s.candles) {
      if (!times.has(c.time)) continue;
      if (c.close >= s.aso) {
        aA++;
        if (s.inNifty50) nA++;
        if (s.inBank) bA++;
      }
      if (c.close <= s.bso) {
        aD++;
        if (s.inNifty50) nD++;
        if (s.inBank) bD++;
      }
    }
  }
  return { all: ratio(aA, aD), nifty: ratio(nA, nD), bank: ratio(bA, bD), sample: aA + aD };
}

export interface AdCount {
  a: number;
  d: number;
  n: number;
  /** advances minus declines */
  net: number;
}

/** the advance / decline counts of the latest candle: a stock is an advance at or above its ASO, a decline at or below its BSO, else neutral (the "A:20 D:0 N:30" text) */
export function advanceDeclineCounts(stocks: AdStock[]): { all: AdCount; nifty: AdCount; bank: AdCount } {
  const mk = (): AdCount => ({ a: 0, d: 0, n: 0, net: 0 });
  const out = { all: mk(), nifty: mk(), bank: mk() };
  for (const s of stocks) {
    const last = s.candles[s.candles.length - 1];
    if (!last) continue;
    const k: 'a' | 'd' | 'n' = last.close >= s.aso ? 'a' : last.close <= s.bso ? 'd' : 'n';
    out.all[k]++;
    if (s.inNifty50) out.nifty[k]++;
    if (s.inBank) out.bank[k]++;
  }
  for (const v of Object.values(out)) v.net = v.a - v.d;
  return out;
}

export interface FutStock {
  name: string;
  inNifty50: boolean;
  inBank: boolean;
  /** the remark of every 5-minute candle of the day (time HH:MM), in order; empty when the futures could not be read */
  remarks: { time: string; remark: Remark | string }[];
}

type Counts = { long: number; sc: number; gamb: number; short: number; lu: number; bears: number };
const zero = (): Counts => ({ long: 0, sc: 0, gamb: 0, short: 0, lu: 0, bears: 0 });

/**
 * The three futures trend scores (+1 / -1 / 0). The userscript adds the RUNNING bull / bear count of a time slot to a total after every single
 * (stock, candle) it processes, so a slot counts again for each later stock: reproduced here exactly.
 */
export function futuresTrendScores(stocks: FutStock[]): { all: number; nifty: number; bank: number } {
  const times = new Set((stocks[0]?.remarks ?? []).map((r) => r.time));
  const all = new Map<string, Counts>();
  const nif = new Map<string, Counts>();
  const bnk = new Map<string, Counts>();
  for (const t of times) {
    all.set(t, zero());
    nif.set(t, zero());
    bnk.set(t, zero());
  }
  let adv = 0;
  let dec = 0;
  let nAdv = 0;
  let nDec = 0;
  let bAdv = 0;
  let bDec = 0;
  const bump = (c: Counts, remark: string): void => {
    if (remark === 'LONG') c.long++;
    else if (remark === 'SHORT') c.short++;
    else if (remark === 'SHOT_COVERING') c.sc++;
    else if (remark === 'GAMBLING_BUY_NEWS_AND_EVENTS') c.gamb++;
    else if (remark === 'LONG_UNWINDING') c.lu++;
    else if (remark === 'BEARS_COMING_SELL_ON_RISE') c.bears++;
  };
  for (const s of stocks) {
    for (const r of s.remarks) {
      const a = all.get(r.time);
      if (!a) continue;
      bump(a, r.remark);
      if (s.inNifty50) bump(nif.get(r.time)!, r.remark);
      if (s.inBank) bump(bnk.get(r.time)!, r.remark);
      const bull = (c: Counts): number => c.long + c.sc + c.gamb;
      const bear = (c: Counts): number => c.short + c.lu + c.bears;
      adv += bull(a);
      dec += bear(a);
      nAdv += bull(nif.get(r.time)!);
      nDec += bear(nif.get(r.time)!);
      bAdv += bull(bnk.get(r.time)!);
      bDec += bear(bnk.get(r.time)!);
    }
  }
  const sgn = (a: number, d: number): number => (a > d ? 1 : d > a ? -1 : 0);
  return { all: sgn(adv, dec), nifty: sgn(nAdv, nDec), bank: sgn(bAdv, bDec) };
}

/** `get915Score`. */
export const nineFifteenScoreOf = (zone: string | undefined | null): number => (zone === 'AST' ? 2 : zone === 'ASO' ? 1 : zone === 'BST' ? -2 : zone === 'BSO' ? -1 : 0);

/** ALL_9_15_CLOSE_SCORE: weighted ratio of bullish to bearish 9:15 closes across every scanned name (AST / BST count double). */
export function all915Score(zones: Record<string, string | undefined>): number {
  let bull = 0;
  let bear = 0;
  for (const z of Object.values(zones)) {
    const s = nineFifteenScoreOf(z);
    if (s > 0) bull += s;
    else if (s < 0) bear += Math.abs(s);
  }
  const t = bull + bear;
  return t > 0 ? parseFloat(((bull - bear) / t).toFixed(2)) : 0;
}

/** `getOIScore` of setScore: the raw OI/OBV score capped at +-3. */
export const cappedOiObv = (raw: number | undefined | null): number => Math.max(-3, Math.min(3, raw || 0));

/** `computeComponentScores`: the weighted sum of the constituent scores (weights in percent), 2 decimals. */
export function componentScore(items: { total: number; weight: number }[]): number {
  let s = 0;
  for (const i of items) s += i.total * (i.weight / 100);
  return parseFloat(s.toFixed(2));
}

export { futuresTrendScore };
