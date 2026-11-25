/**
 * Positional screener, timing and day rhythm: ports of positionalScreener.js `_psIsTradeable`, `_psDayStats`, `_psViewSign`, `_psBuildSince`, `_psViewEstimates`
 * and `_psMarketView`. EARLY / MID / LATE and the market-view bands are the app's own rules of thumb, not back-tested.
 */
import { atr14, primaryRead, type DCandle, type PrimaryRead } from './positional.js';
import type { Setup } from './positionalSetup.js';

export const TRADEABLE_MIN_CONV = 60;
export const TRADEABLE_AWAITING_MIN_CONV = 65;
export const STATS_WINDOW = 250;
export const SIGNAL_LOOKBACK = 120;
export const TIMING_EARLY_ATR = 2.5;
export const TIMING_LATE_ATR = 6;
export const EST_STEP = 2;
export const EST_MIN_RUNS = 4;
export const PACE_DAYS = 20;

export function isTradeable(r: { convictionPct: number | null | undefined; verdict: string }): boolean {
  if (r.convictionPct == null) return false;
  const v = r.verdict;
  if (v.indexOf('caution') !== -1) return false;
  if (v.indexOf('awaiting overlay') !== -1) return r.convictionPct >= TRADEABLE_AWAITING_MIN_CONV;
  if (r.convictionPct < TRADEABLE_MIN_CONV) return false;
  return v.indexOf('STRONG BUY') !== -1 || v.indexOf('STRONG SELL') !== -1 || v.indexOf('LONG forming') !== -1 || v.indexOf('SHORT forming') !== -1;
}

export interface DayStats {
  days: number;
  up: number;
  down: number;
  flat: number;
  upPct: number | null;
  avgUp: number | null;
  avgDown: number | null;
  upRuns: number;
  downRuns: number;
  maxUp: number;
  maxDown: number;
  cur: { dir: number; len: number };
  cont: { n: number; p: number } | null;
}

/** Up / down day counts, average run lengths, the current streak and how often such a streak went on one more day (finished runs only). */
export function dayStats(closes: number[] | null | undefined): DayStats | null {
  const c = (closes || []).slice(-(STATS_WINDOW + 1));
  if (c.length < 21) return null;
  let up = 0;
  let down = 0;
  let flat = 0;
  const runs: Record<string, number[]> = { '1': [], '-1': [] };
  let curDir = 0;
  let curLen = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i]! > c[i - 1]! ? 1 : c[i]! < c[i - 1]! ? -1 : 0;
    if (d === 1) up++;
    else if (d === -1) down++;
    else flat++;
    if (d !== 0 && d === curDir) {
      curLen++;
      continue;
    }
    if (curDir !== 0) runs[String(curDir)]!.push(curLen);
    curDir = d;
    curLen = d === 0 ? 0 : 1;
  }
  const avg = (a: number[]): number | null => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const max = (a: number[], extra: number): number => Math.max(...a.concat(extra ? [extra] : [0]));
  let cont: DayStats['cont'] = null;
  if (curDir !== 0) {
    const hist = runs[String(curDir)]!;
    const reached = hist.filter((l) => l >= curLen).length;
    const ext = hist.filter((l) => l >= curLen + 1).length;
    if (reached) cont = { n: reached, p: (ext / reached) * 100 };
  }
  return {
    days: c.length - 1, up, down, flat, upPct: up + down ? (up / (up + down)) * 100 : null,
    avgUp: avg(runs['1']!), avgDown: avg(runs['-1']!), upRuns: runs['1']!.length, downRuns: runs['-1']!.length,
    maxUp: max(runs['1']!, curDir === 1 ? curLen : 0), maxDown: max(runs['-1']!, curDir === -1 ? curLen : 0),
    cur: { dir: curDir, len: curLen }, cont,
  };
}

/** +1 long view, -1 short view, 0 none (Stage 3 topping is no trade view). */
export function viewSign(p: PrimaryRead | null | undefined): number {
  const d = p && p.ok ? p.dir : null;
  return d == null ? 0 : d > 0 ? 1 : d < 0 && d !== -0.3 ? -1 : 0;
}

export interface Since {
  days: number;
  startDate: string;
  startClose: number;
  atLeast: boolean;
  favPct: number | null;
  moveAtr: number | null;
  label: string;
  advice: string;
  confDays: number | null;
  confDate: string | null;
}

/** When the current view began (the primary read replayed on history cut back a day at a time) and how far price has moved since, in % and in ATR. */
export function buildSince(setup: Setup, candles: DCandle[], niftyCloses: number[] | null | undefined): Since | null {
  const primary = setup.primary;
  const sign = viewSign(primary);
  if (!sign || !candles || !candles.length) return null;
  const n = candles.length;
  let startK = 0;
  let confK: number | null = Math.abs(primary!.dir!) === 1 ? 0 : null;
  let confOpen = confK === 0;
  let truncated = false;
  let capped = false;
  for (let k = 1; k <= SIGNAL_LOOKBACK; k++) {
    const sub = candles.slice(0, n - k);
    if (sub.length < 175) {
      truncated = true;
      break;
    }
    const nSub = niftyCloses ? niftyCloses.slice(0, Math.max(0, niftyCloses.length - k)) : null;
    const pr = primaryRead(sub, nSub);
    if (viewSign(pr) !== sign) break;
    startK = k;
    if (confOpen) {
      if (pr.ok && Math.abs(pr.dir!) === 1) confK = k;
      else confOpen = false;
    }
    if (k === SIGNAL_LOOKBACK) capped = true;
  }
  const dateOf = (k: number): string => String(candles[n - 1 - k]![0]).slice(0, 10);
  const startClose = candles[n - 1 - startK]![4];
  const ltp = setup.ltp;
  const favPct = startClose ? ((sign * (ltp - startClose)) / startClose) * 100 : null;
  const atr = atr14(candles);
  const moveAtr = atr && startClose ? (sign * (ltp - startClose)) / atr : null;
  const extended = /EXTENDED/.test(setup.extensionNote || '');
  let label: string;
  if (moveAtr == null) label = 'UNKNOWN';
  else if (moveAtr < 0) label = 'NOT WORKING';
  else if (moveAtr < TIMING_EARLY_ATR && !extended) label = 'EARLY';
  else if (moveAtr < TIMING_LATE_ATR && !extended) label = 'MID';
  else label = 'LATE';
  const isLong = sign > 0;
  const targetPassed = setup.target != null && (isLong ? ltp >= setup.target : ltp <= setup.target);
  if (targetPassed && (label === 'EARLY' || label === 'MID')) label = 'LATE';
  const pullbackEntry = setup.entry != null && (isLong ? setup.entry < ltp * 0.995 : setup.entry > ltp * 1.005);
  let advice = (
    {
      EARLY: 'Good time — less than one planned target has been travelled since the view began, so most of the move is still ahead.',
      MID: 'Acceptable — a fair part of the move is done. Take it at the plan entry, not above it.',
      LATE: 'Late — price has already run well past the planned target distance (or is stretched from the 50-day line). Wait for a pullback rather than chase.',
      'NOT WORKING': 'The view is on, but price is back below where it began — it has not worked so far. Wait for it to prove itself.',
      UNKNOWN: 'Not enough data to judge the timing.',
    } as Record<string, string>
  )[label]!;
  if (targetPassed) {
    advice = `Late for this plan — price is already beyond the plan target (${setup.target!.toFixed(1)}), because the plan is a ${isLong ? 'pullback to' : 'bounce to'} ${setup.entry != null ? setup.entry.toFixed(1) : 'the entry'} and price is well ${isLong ? 'above' : 'below'} it. The view only began ${startK + 1} session(s) ago, so the move is not what is old; the plan is. Wait for the pullback, or treat the plan levels as not tradable now.`;
  }
  if (pullbackEntry && label !== 'UNKNOWN' && !targetPassed) advice += ` The plan entry (${setup.entry!.toFixed(1)}) is ${isLong ? 'below' : 'above'} the current price — it is a ${isLong ? 'pullback' : 'bounce'} entry, not a buy-now.`;
  return { days: startK + 1, startDate: dateOf(startK), startClose, atLeast: truncated || capped, favPct, moveAtr, label, advice, confDays: confK == null ? null : confK + 1, confDate: confK == null ? null : dateOf(confK) };
}

const median = (a: number[]): number | null => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export interface Estimates {
  runs: { n: number; tooFew: boolean; median: number | null; min: number | null; max: number | null; longer: number; remainMedian: number | null; age: number; historySessions: number } | null;
  pace: { dist: number; pace: number; sessions: number | null; reached: boolean; against: boolean } | null;
}

/** How long the move might still run, from this stock's own past runs of the same view and from the pace of the last 20 sessions. */
export function viewEstimates(setup: Setup & { since?: Since | null }, candles: DCandle[], niftyCloses: number[] | null | undefined): Estimates | null {
  const sign = viewSign(setup.primary);
  const since = setup.since;
  if (!sign || !since || !candles) return null;
  const n = candles.length;
  const est: Estimates = { runs: null, pace: null };
  const series: { i: number; s: number }[] = [];
  for (let i = 174; i < n; i += EST_STEP) {
    const pr = primaryRead(candles.slice(0, i + 1), niftyCloses ? niftyCloses.slice(0, Math.min(niftyCloses.length, i + 1)) : null);
    series.push({ i, s: viewSign(pr) });
  }
  const done: number[] = [];
  for (let a = 0; a < series.length; ) {
    let b = a;
    while (b + 1 < series.length && series[b + 1]!.s === series[a]!.s) b++;
    const leftCut = a === 0;
    const rightOpen = b === series.length - 1;
    if (series[a]!.s === sign && !leftCut && !rightOpen) done.push(series[b]!.i - series[a]!.i + EST_STEP);
    a = b + 1;
  }
  const age = since.days;
  const survivors = done.filter((d) => d > age);
  est.runs = {
    n: done.length, tooFew: done.length < EST_MIN_RUNS, median: median(done),
    min: done.length ? Math.min(...done) : null, max: done.length ? Math.max(...done) : null,
    longer: survivors.length, remainMedian: survivors.length >= 2 ? median(survivors.map((d) => d - age)) : null, age, historySessions: n,
  };
  if (setup.target != null && n > PACE_DAYS) {
    const c0 = candles[n - 1 - PACE_DAYS]![4];
    const c1 = setup.ltp;
    const pace = (sign * (c1 - c0)) / PACE_DAYS;
    const dist = sign * (setup.target - c1);
    est.pace = { dist, pace, sessions: dist > 0 && pace > 0 ? dist / pace : null, reached: dist <= 0, against: pace <= 0 };
  }
  return est;
}

/** Market lean from the number of BUY against SELL verdicts of the scanned stocks (indices and commodities left out by the caller). */
export function marketView(rows: { verdict: string }[]): { buy: number; sell: number; watch: number; scanned: number; net: number; label: string } {
  const buy = rows.filter((r) => r.verdict.indexOf('BUY') !== -1).length;
  const sell = rows.filter((r) => r.verdict.indexOf('SELL') !== -1).length;
  const total = buy + sell;
  const net = total ? (buy - sell) / total : 0;
  let label: string;
  if (total < 5) label = 'TOO FEW SIGNALS';
  else if (net >= 0.4) label = 'BULLISH';
  else if (net >= 0.15) label = 'MILD BULLISH';
  else if (net <= -0.4) label = 'BEARISH';
  else if (net <= -0.15) label = 'MILD BEARISH';
  else label = 'MIXED';
  return { buy, sell, watch: rows.length - total, scanned: rows.length, net, label };
}
