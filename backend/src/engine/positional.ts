/**
 * Positional (swing) screener, primary layer: ports of positionalScreener.js `_psSmaArr`, `_psAtr14`, `_psTrendTemplate`, `_psShortTemplate`, `_psStage`,
 * `_psMomentum`, `_psLongLevels`, `_psShortLevels`, `_psPrimaryRead` (Minervini's Trend Template, Weinstein's Stage Analysis, Clenow's momentum, ATR levels).
 * Daily candles are arrays [time, open, high, low, close, volume, oi?].
 */
export type DCandle = readonly [string | number, number, number, number, number, ...unknown[]];

export function smaArr(closes: number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i]!;
    if (i >= window) sum -= closes[i - window]!;
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

export function atr14(candles: DCandle[] | null | undefined, window = 14): number | null {
  if (!candles || candles.length < window + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i]![2];
    const l = candles[i]![3];
    const pc = candles[i - 1]![4];
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const tail = trs.slice(-window);
  return tail.reduce((a, b) => a + b, 0) / tail.length;
}

export interface TemplateOk {
  ok: true;
  price: number;
  sma50: number | null;
  sma150: number | null;
  sma200: number | null;
  low52: number;
  high52: number;
  pctOffHigh52?: number;
  pctOffLow52?: number;
  rsPct: number | null;
  rulesPassed: number;
  rulesTotal: number;
  passes: boolean;
}
export interface NotOk {
  ok: false;
  reason: string;
}

const closesOf = (c: DCandle[]): number[] => c.map((x) => x[4]);

function template(candles: DCandle[] | null | undefined, niftyCloses: number[] | null | undefined, long: boolean): TemplateOk | NotOk {
  if (!candles || candles.length < 210) return { ok: false, reason: `Need 210+ trading days, got ${candles ? candles.length : 0}` };
  const c = closesOf(candles);
  const price = c[c.length - 1]!;
  const sma50 = smaArr(c, 50);
  const sma150 = smaArr(c, 150);
  const sma200 = smaArr(c, 200);
  const n = c.length;
  const rules: Record<string, boolean> = {};
  const win52 = c.slice(Math.max(0, n - 252));
  const low52 = Math.min(...win52);
  const high52 = Math.max(...win52);
  const s50 = sma50[n - 1]!;
  const s150 = sma150[n - 1]!;
  const s200 = sma200[n - 1]!;
  const past200 = sma200[n - 1 - 21];
  if (long) {
    rules['r1'] = price > s150 && price > s200;
    rules['r2'] = s150 > s200;
    rules['r3'] = n - 1 - 21 >= 0 && past200 != null && s200 > past200;
    rules['r4'] = s50 > s150 && s50 > s200;
    rules['r5'] = price > s50;
    rules['r6'] = price >= low52 * 1.3;
    rules['r7'] = price >= high52 * 0.75;
  } else {
    rules['r1'] = price < s150 && price < s200;
    rules['r2'] = s150 < s200;
    rules['r3'] = n - 1 - 21 >= 0 && past200 != null && s200 < past200;
    rules['r4'] = s50 < s150 && s50 < s200;
    rules['r5'] = price < s50;
    rules['r6'] = price <= high52 * 0.7;
    rules['r7'] = price <= low52 * 1.25;
  }
  let rsPct: number | null = null;
  if (niftyCloses && niftyCloses.length >= 127 && n >= 127) {
    const stockRet = c[n - 1]! / c[n - 127]! - 1;
    const nn = niftyCloses.length;
    const niftyRet = niftyCloses[nn - 1]! / niftyCloses[nn - 127]! - 1;
    rsPct = (stockRet - niftyRet) * 100;
    rules['r8'] = long ? rsPct > 0 : rsPct < 0;
  }
  const vals = Object.values(rules);
  const base = { ok: true as const, price, sma50: s50, sma150: s150, sma200: s200, low52, high52, rsPct, rulesPassed: vals.filter(Boolean).length, rulesTotal: vals.length, passes: vals.every(Boolean) };
  return long ? { ...base, pctOffHigh52: (price / high52 - 1) * 100 } : { ...base, pctOffLow52: (price / low52 - 1) * 100 };
}

/** Minervini's Trend Template: eight rules for a genuine Stage 2 uptrend. */
export const trendTemplate = (c: DCandle[] | null | undefined, n: number[] | null | undefined): TemplateOk | NotOk => template(c, n, true);
/** Mirror image for a confirmed Stage 4 downtrend. */
export const shortTemplate = (c: DCandle[] | null | undefined, n: number[] | null | undefined): TemplateOk | NotOk => template(c, n, false);

export const STAGE_LABELS: Record<number, string> = { 1: 'Stage 1 — Basing', 2: 'Stage 2 — Advancing', 3: 'Stage 3 — Topping', 4: 'Stage 4 — Declining' };

export type StageRead = { ok: true; stage: number; label: string; confirmed: boolean; ma: number; slopePct: number; rangePct: number } | NotOk;

/** Weinstein stage from the 150-day average and its slope over 25 sessions. */
export function stageOf(candles: DCandle[] | null | undefined): StageRead {
  const SMA_W = 150;
  const SLOPE_W = 25;
  const FLAT = 1.0;
  if (!candles || candles.length < SMA_W + SLOPE_W) return { ok: false, reason: `Need ${SMA_W + SLOPE_W}+ trading days, got ${candles ? candles.length : 0}` };
  const c = closesOf(candles);
  const n = c.length;
  const price = c[n - 1]!;
  const sma = smaArr(c, SMA_W);
  const maNow = sma[n - 1]!;
  const maPast = sma[n - 1 - SLOPE_W];
  const slopePct = maPast ? ((maNow - maPast) / maPast) * 100 : 0;
  const above = price > maNow;
  const win52 = c.slice(Math.max(0, n - 252));
  const low52 = Math.min(...win52);
  const high52 = Math.max(...win52);
  const rangePct = high52 > low52 ? (price - low52) / (high52 - low52) : 0.5;
  let stage: number;
  let confirmed = true;
  if (Math.abs(slopePct) <= FLAT) stage = rangePct < 0.5 ? 1 : 3;
  else if (slopePct > FLAT) {
    stage = 2;
    confirmed = above;
  } else {
    stage = 4;
    confirmed = !above;
  }
  return { ok: true, stage, label: STAGE_LABELS[stage]! + (confirmed ? '' : ' (unconfirmed)'), confirmed, ma: maNow, slopePct, rangePct: rangePct * 100 };
}

export type MomentumRead = { ok: true; annualizedPct: number; r2: number; score: number; maxGapPct: number; gapFlagged: boolean } | NotOk;

/** Clenow's momentum: regression of log closes over 90 sessions, annualised return times R squared. */
export function momentum(candles: DCandle[] | null | undefined, lookback = 90, gapPct = 15.0): MomentumRead {
  if (!candles || candles.length < lookback) return { ok: false, reason: `Need ${lookback}+ trading days, got ${candles ? candles.length : 0}` };
  const win = candles.slice(-lookback).map((x) => x[4]);
  if (win.some((v) => !(v > 0))) return { ok: false, reason: 'Non-positive close in window' };
  const logp = win.map(Math.log);
  const nL = logp.length;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < nL; i++) {
    sx += i;
    sy += logp[i]!;
    sxy += i * logp[i]!;
    sxx += i * i;
  }
  const slope = (nL * sxy - sx * sy) / (nL * sxx - sx * sx);
  const intercept = (sy - slope * sx) / nL;
  const meanY = sy / nL;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < nL; i++) {
    const fit = slope * i + intercept;
    ssRes += Math.pow(logp[i]! - fit, 2);
    ssTot += Math.pow(logp[i]! - meanY, 2);
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const annualizedPct = (Math.exp(slope * 252) - 1) * 100;
  let maxGap = 0;
  for (let i = 1; i < win.length; i++) maxGap = Math.max(maxGap, Math.abs(((win[i]! - win[i - 1]!) / win[i - 1]!) * 100));
  return { ok: true, annualizedPct, r2, score: annualizedPct * r2, maxGapPct: maxGap, gapFlagged: maxGap > gapPct };
}

export const ATR_STOP_MULT = 1.5;
export const ATR_TARGET_MULT = 2.5;
export const EXTENDED_PCT = 25.0;
export const MILD_EXT_PCT = 10.0;

export interface Levels {
  pctAbove?: number | null;
  pctBelow?: number | null;
  note: string;
  atr: number | null;
  entry: number;
  stop: number | null;
  target: number | null;
  rr: number | null;
}

/** Long side: single digits above a rising 50-day average is a buy zone; beyond 25% is extended and waits for a pullback. ATR(14) stop 1.5x and target 2.5x. */
export function longLevels(candles: DCandle[], price: number, sma50: number | null): Levels {
  const pctAbove = sma50 ? (price / sma50 - 1) * 100 : null;
  let note: string;
  let entry: number;
  if (pctAbove == null) {
    note = 'no 50-day SMA';
    entry = price;
  } else if (pctAbove <= MILD_EXT_PCT) {
    note = 'in buy zone (not extended)';
    entry = price;
  } else if (pctAbove <= EXTENDED_PCT) {
    note = 'mildly extended — a shallow pullback toward the 50-day SMA is lower-risk than chasing here';
    entry = sma50! * 1.03;
  } else {
    note = 'EXTENDED (>25% above 50-day SMA) — textbook move is to wait for a pullback to the 50-day line';
    entry = sma50!;
  }
  const atr = atr14(candles);
  if (atr == null || !entry) return { pctAbove, note, atr, entry, stop: null, target: null, rr: null };
  const stop = entry - ATR_STOP_MULT * atr;
  const target = entry + ATR_TARGET_MULT * atr;
  const risk = entry - stop;
  const reward = target - entry;
  return { pctAbove, note, atr, entry, stop, target, rr: risk > 0 ? reward / risk : null };
}

/** Short side mirror: entry on a bounce toward a falling 50-day average when already extended down. */
export function shortLevels(candles: DCandle[], price: number, sma50: number | null): Levels {
  const pctBelow = price ? ((sma50 as number) / price - 1) * 100 : null;
  let note: string;
  let entry: number;
  if (pctBelow == null) {
    note = 'no 50-day SMA';
    entry = price;
  } else if (pctBelow <= MILD_EXT_PCT) {
    note = 'in sell zone (not extended)';
    entry = price;
  } else if (pctBelow <= EXTENDED_PCT) {
    note = 'mildly extended down — a shallow bounce toward the 50-day SMA is lower-risk than chasing the decline';
    entry = (sma50 as number) * 0.97;
  } else {
    note = 'EXTENDED DOWN (>25% below 50-day SMA) — textbook move is to wait for a bounce to the 50-day line';
    entry = sma50 as number;
  }
  const atr = atr14(candles);
  if (atr == null || !entry) return { pctBelow, note, atr, entry, stop: null, target: null, rr: null };
  const stop = entry + ATR_STOP_MULT * atr;
  const target = entry - ATR_TARGET_MULT * atr;
  const risk = stop - entry;
  const reward = entry - target;
  return { pctBelow, note, atr, entry, stop, target, rr: risk > 0 ? reward / risk : null };
}

export interface PrimaryRead {
  ok: boolean;
  tt: TemplateOk | NotOk;
  st: TemplateOk | NotOk;
  stage: StageRead;
  mom: MomentumRead;
  /** +1 confirmed long, +0.5 Stage 2 forming, 0 basing, -0.3 topping, -0.5 Stage 4 forming, -1 confirmed short, null no history */
  dir: number | null;
  label: string;
}

export function primaryRead(candles: DCandle[] | null | undefined, niftyCloses: number[] | null | undefined): PrimaryRead {
  const tt = trendTemplate(candles, niftyCloses);
  const st = shortTemplate(candles, niftyCloses);
  const stage = stageOf(candles);
  const mom = momentum(candles);
  if (!tt.ok && !st.ok && !stage.ok) return { ok: false, tt, st, stage, mom, dir: null, label: 'INSUFFICIENT HISTORY' };
  let dir: number | null;
  let label: string;
  if (tt.ok && tt.passes) {
    dir = 1;
    label = `STAGE 2 CONFIRMED (Trend Template ${tt.rulesPassed}/${tt.rulesTotal})`;
  } else if (st.ok && st.passes) {
    dir = -1;
    label = `STAGE 4 CONFIRMED (Short Template ${st.rulesPassed}/${st.rulesTotal})`;
  } else if (stage.ok && stage.stage === 2) {
    dir = 0.5;
    label = stage.label + (tt.ok ? ` (${tt.rulesPassed}/${tt.rulesTotal} Trend Template rules)` : '');
  } else if (stage.ok && stage.stage === 1) {
    dir = 0;
    label = stage.label;
  } else if (stage.ok && stage.stage === 3) {
    dir = -0.3;
    label = stage.label;
  } else if (stage.ok && stage.stage === 4) {
    dir = -0.5;
    label = stage.label + (st.ok ? ` (${st.rulesPassed}/${st.rulesTotal} rules)` : '');
  } else {
    dir = null;
    label = 'INSUFFICIENT HISTORY';
  }
  return { ok: true, tt, st, stage, mom, dir, label };
}
