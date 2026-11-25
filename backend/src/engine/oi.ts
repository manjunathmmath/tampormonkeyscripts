/**
 * OI / OBV scoring. Faithful port of grootTradeBot.js: `scoreOIStrikeForSignal`, `computeOIScoreFromData`, `_gtbOiPriceChange`, `_gtbIsITM`,
 * `_gtbFindWalls`, `_gtbObvVelocityInfo`, `_gtbWallVelocity`, `_gtbWallErosion`, `_gtbComputeMaxPainGEX` (the pure part), `_gtbMaxPainScore`
 * and `_gtbIVSkewScore`. Pure functions. Row values keep the userscript's types (strings from toFixed); the rules and constants are unchanged.
 * The stateful part of `_gtbComputeOIExtras` (OI velocity and max-pain convergence from stored snapshots) is not here.
 */
import type { Candle } from '../kite/client.js';

export interface ObvPt {
  date?: string;
  obv: string;
}
export interface IvPt {
  date?: string;
  iv: number | null;
}

/** The fields of one chain row that the scoring reads. */
export interface OiRow {
  STRIKE: string | number;
  ATM_STRIKE: boolean | '';
  OI_CE: string;
  OI_PE: string;
  CHG_OI_CE: string;
  CHG_OI_PE: string;
  CE_OBV: ObvPt[];
  PE_OBV: ObvPt[];
  CE_IV?: IvPt[];
  PE_IV?: IvPt[];
}

/** `_gtbIsITM`: below spot a call is in the money, above spot a put is. A zero spot means unknown (never ITM). */
export function isITM(side: 'CE' | 'PE', strike: number, spot: number): boolean {
  if (!spot) return false;
  return side === 'CE' ? strike < spot : strike > spot;
}

export interface StrikeSignal {
  score: number;
  ceLabel: string;
  peLabel: string;
  wall: number;
  obvFlow: number;
  conflict: boolean;
}

const lastIvPair = (list: IvPt[]): [number | null, number | null] => {
  let curr: number | null = null;
  let prev: number | null = null;
  for (let i = list.length - 1; i >= 0 && curr === null; i--) if (list[i]!.iv !== null) curr = list[i]!.iv;
  for (let i = list.length - 2; i >= 0 && prev === null; i--) if (list[i]!.iv !== null) prev = list[i]!.iv;
  return [curr, prev];
};

/**
 * `scoreOIStrikeForSignal`: one strike. OBV decides the label (WRITE / BUY / COV / UNWIND); IV only scales the weight (agree x1, disagree x0.5);
 * price is a last-resort fallback (x0.3) when OBV is flat; ATM counts double, ITM halves. The standing OI wall is returned as context, not scored.
 * Throws (like the userscript) when a strike has no OBV points.
 */
export function scoreOIStrike(item: OiRow, isATM: boolean, priceChange: number | string, spot: number): StrikeSignal {
  let score = 0;
  const w = isATM ? 2 : 1;
  const strike = parseFloat(String(item.STRIKE));
  const ceITM = spot ? isITM('CE', strike, spot) : false;
  const peITM = spot ? isITM('PE', strike, spot) : false;

  const pc = parseFloat(String(priceChange)) || 0;
  const priceUp = pc > 0.1;
  const priceDown = pc < -0.1;

  const chgCE = parseFloat(item.CHG_OI_CE);
  const chgPE = parseFloat(item.CHG_OI_PE);
  const oiCE = parseFloat(item.OI_CE);
  const oiPE = parseFloat(item.OI_PE);

  const ceObvList = item.CE_OBV;
  const peObvList = item.PE_OBV;
  const ceObvCumulative = parseFloat(ceObvList[ceObvList.length - 1]!.obv);
  const peObvCumulative = parseFloat(peObvList[peObvList.length - 1]!.obv);
  const obvCEUp = ceObvCumulative > 0;
  const obvCEDown = ceObvCumulative < 0;
  const obvPEUp = peObvCumulative > 0;
  const obvPEDown = peObvCumulative < 0;

  const ceIvList = item.CE_IV || [];
  const peIvList = item.PE_IV || [];
  let ivCEUp: boolean | null = null;
  let ivCEDown: boolean | null = null;
  let ivPEUp: boolean | null = null;
  let ivPEDown: boolean | null = null;
  if (ceIvList.length >= 2) {
    const [curr, prev] = lastIvPair(ceIvList);
    if (curr !== null && prev !== null) {
      ivCEUp = curr > prev + 0.3;
      ivCEDown = curr < prev - 0.3;
    }
  }
  if (peIvList.length >= 2) {
    const [curr, prev] = lastIvPair(peIvList);
    if (curr !== null && prev !== null) {
      ivPEUp = curr > prev + 0.3;
      ivPEDown = curr < prev - 0.3;
    }
  }

  // CE side
  let ceLabel = 'CE NEUTRAL';
  let ceDir = 0;
  let ceW = 0;
  if (chgCE > 0) {
    if (obvCEDown) { ceLabel = 'CE WRITE'; ceDir = -1; ceW = w; }
    else if (obvCEUp) { ceLabel = 'CE BUY'; ceDir = 1; ceW = w; }
    else if (priceDown) { ceLabel = 'CE WRITE'; ceDir = -1; ceW = w * 0.3; }
    else if (priceUp) { ceLabel = 'CE BUY'; ceDir = 1; ceW = w * 0.3; }
  } else if (chgCE < 0) {
    if (obvCEUp) { ceLabel = 'CE COV'; ceDir = 1; ceW = w; }
    else if (obvCEDown) { ceLabel = 'CE UNWIND'; ceDir = -1; ceW = w; }
    else if (priceUp) { ceLabel = 'CE COV'; ceDir = 1; ceW = w * 0.3; }
    else if (priceDown) { ceLabel = 'CE UNWIND'; ceDir = -1; ceW = w * 0.3; }
  }
  if (ceDir !== 0 && (ivCEUp === true || ivCEDown === true)) {
    const agrees = (ceDir > 0 && ivCEUp) || (ceDir < 0 && ivCEDown);
    ceW *= agrees ? 1 : 0.5;
  }
  if (ceITM) ceW *= 0.5;
  score += ceDir * ceW;

  // PE side
  let peLabel = 'PE NEUTRAL';
  let peDir = 0;
  let peW = 0;
  if (chgPE > 0) {
    if (obvPEDown) { peLabel = 'PE WRITE'; peDir = 1; peW = w; }
    else if (obvPEUp) { peLabel = 'PE BUY'; peDir = -1; peW = w; }
    else if (priceUp) { peLabel = 'PE WRITE'; peDir = 1; peW = w * 0.3; }
    else if (priceDown) { peLabel = 'PE BUY'; peDir = -1; peW = w * 0.3; }
  } else if (chgPE < 0) {
    // v29.474: put OI falling with the put price rising (OBV up) = writers buying back = COV, bearish; with the price falling (OBV down) = UNWIND, mildly bullish
    if (obvPEUp) { peLabel = 'PE COV'; peDir = -1; peW = w; }
    else if (obvPEDown) { peLabel = 'PE UNWIND'; peDir = 1; peW = w * 0.5; }
    else if (priceDown) { peLabel = 'PE COV'; peDir = -1; peW = w * 0.3; }
    else if (priceUp) { peLabel = 'PE UNWIND'; peDir = 1; peW = w * 0.3; }
  }
  if (peDir !== 0 && (ivPEUp === true || ivPEDown === true)) {
    const agrees = (peDir > 0 && ivPEDown) || (peDir < 0 && ivPEUp);
    peW *= agrees ? 1 : 0.5;
  }
  if (peITM) peW *= 0.5;
  score += peDir * peW;

  const wall = oiPE > oiCE ? 0.5 : oiCE > oiPE ? -0.5 : 0;
  const obvFlow = (obvCEUp ? 1 : obvCEDown ? -1 : 0) + (obvPEDown ? 1 : obvPEUp ? -1 : 0);
  const ceConflict = ivCEUp !== null && ((ivCEUp && obvCEDown) || (ivCEDown && obvCEUp));
  const peConflict = ivPEUp !== null && ((ivPEUp && obvPEDown) || (ivPEDown && obvPEUp));
  return { score, ceLabel, peLabel, wall, obvFlow, conflict: Boolean(ceConflict || peConflict) };
}

/** `_gtbOiPriceChange`: the change vs the previous close when known, else the move since the open from the spot candles, else 0. */
export function oiPriceChange(changeVsPrevClose: number | null | undefined, spotCandles?: Candle[]): number {
  if (changeVsPrevClose != null && Number.isFinite(changeVsPrevClose)) return changeVsPrevClose;
  const sc = spotCandles;
  if (sc && sc.length) {
    const o = parseFloat(String(sc[0]![1]));
    const l = parseFloat(String(sc[sc.length - 1]![4]));
    if (o > 0 && Number.isFinite(l)) return (l / o - 1) * 100;
  }
  return 0;
}

export interface OiScore {
  /** the chain's OI/OBV score (per-strike scores plus the change-PCR term), 2 decimals */
  score: number;
  obvFlow: number;
  oiWall: number;
  oiConflicts: number;
}

/**
 * `computeOIScoreFromData`: sums the strike scores (spot anchored to the ATM row's own strike) and adds the change-PCR term
 * (+0.5 above 1.3, +0.25 from 1.0, -0.25 from 0.7, else -0.5). Standing PCR and the wall are not scored (v26.31).
 * `priceChange` is `oiData.priceChange || _gtbOiPriceChange(...)`, so a zero falls back to the helper, as in the userscript.
 */
export function computeOIScore(tableData: OiRow[], priceChange: number): OiScore {
  if (!tableData || tableData.length === 0) return { score: 0, obvFlow: 0, oiWall: 0, oiConflicts: 0 };
  let score = 0;
  let obvFlow = 0;
  let wallTot = 0;
  let conflicts = 0;
  let spot = 0;
  for (const item of tableData) if (item.ATM_STRIKE) spot = parseFloat(String(item.STRIKE)) || 0;
  for (const item of tableData) {
    const r = scoreOIStrike(item, !!item.ATM_STRIKE, priceChange, spot);
    score += r.score;
    obvFlow += r.obvFlow;
    wallTot += r.wall;
    if (r.conflict) conflicts++;
  }
  let weightedChPEOI = 0;
  let weightedChCEOI = 0;
  for (const item of tableData) {
    const w = item.ATM_STRIKE ? 3 : 1;
    weightedChPEOI += parseFloat(item.CHG_OI_PE) * w;
    weightedChCEOI += parseFloat(item.CHG_OI_CE) * w;
  }
  const chPcr = weightedChCEOI > 0 ? weightedChPEOI / weightedChCEOI : 1;
  if (!isNaN(chPcr)) {
    if (chPcr > 1.3) score += 0.5;
    else if (chPcr >= 1.0) score += 0.25;
    else if (chPcr >= 0.7) score -= 0.25;
    else score -= 0.5;
  }
  return { score: parseFloat(score.toFixed(2)), obvFlow, oiWall: parseFloat(wallTot.toFixed(2)), oiConflicts: conflicts };
}

// ───────────────────────── OI walls ─────────────────────────

export interface Wall {
  tier: 'primary' | 'secondary';
  index: number;
  strike: number;
  mag: number;
}
export interface Walls {
  resistance: Wall[];
  support: Wall[];
}

/**
 * `_gtbFindWalls`: OTM call-writing strikes are resistance candidates and OTM put-writing strikes support candidates, ranked by the size of their
 * OBV. The biggest is primary; the next one only counts when it is at least 25% of the biggest (secondary from 60%).
 */
export function findWalls(tableData: OiRow[], priceChange: number | string, spot: number): Walls {
  type Cand = { index: number; strike: number; mag: number };
  const resAll: Cand[] = [];
  const supAll: Cand[] = [];
  (tableData || []).forEach((item, i) => {
    const strike = parseFloat(String(item.STRIKE));
    let sig: StrikeSignal;
    try {
      sig = scoreOIStrike(item, !!item.ATM_STRIKE, priceChange, spot);
    } catch {
      return;
    }
    if (sig.ceLabel === 'CE WRITE' && !isITM('CE', strike, spot)) {
      const c = item.CE_OBV;
      resAll.push({ index: i, strike, mag: Math.abs(parseFloat(c[c.length - 1]!.obv)) || 0 });
    }
    if (sig.peLabel === 'PE WRITE' && !isITM('PE', strike, spot)) {
      const p = item.PE_OBV;
      supAll.push({ index: i, strike, mag: Math.abs(parseFloat(p[p.length - 1]!.obv)) || 0 });
    }
  });
  const rank = (all: Cand[]): Wall[] => {
    all.sort((a, b) => b.mag - a.mag);
    if (!all.length) return [];
    const out: Wall[] = [{ tier: 'primary', ...all[0]! }];
    if (all.length > 1 && all[1]!.mag >= all[0]!.mag * 0.25) {
      const tier = all[1]!.mag >= all[0]!.mag * 0.6 ? 'secondary' : 'weak';
      if (tier !== 'weak') out.push({ tier: 'secondary', ...all[1]! });
    }
    return out;
  };
  return { resistance: rank(resAll), support: rank(supAll) };
}

export const OBV_BASELINE_SAMPLES = 8;

/** `_gtbObvVelocityInfo`: the OBV change over the last `lookback` candles and a baseline (the average swing of the windows just before it, at least 1). */
export function obvVelocityInfo(arr: ObvPt[] | undefined, lookback: number): { velocity: number; baseline: number } | null {
  if (!arr || arr.length <= lookback) return null;
  const now = parseFloat(arr[arr.length - 1]!.obv) || 0;
  const prev = parseFloat(arr[arr.length - 1 - lookback]!.obv) || 0;
  const velocity = now - prev;
  const samples: number[] = [];
  for (let k = 1; k <= OBV_BASELINE_SAMPLES; k++) {
    const endIdx = arr.length - 1 - k;
    const startIdx = endIdx - lookback;
    if (startIdx < 0) break;
    samples.push(Math.abs((parseFloat(arr[endIdx]!.obv) || 0) - (parseFloat(arr[startIdx]!.obv) || 0)));
  }
  const baseline = Math.max(1, samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 1);
  return { velocity, baseline };
}

export interface Building {
  strike: number;
  side: 'R' | 'S';
  velocity: number;
  baseline: number;
  multiple: number;
}

/** `_gtbWallVelocity`: OTM strikes where writers are accelerating (OBV velocity negative and at least `multiplier` x its own recent pace). */
export function wallVelocity(tableData: OiRow[], spot: number, lookback = 3, multiplier = 2): { building: Building[] } {
  const out: Building[] = [];
  for (const item of tableData || []) {
    const strike = parseFloat(String(item.STRIKE));
    if (!isITM('CE', strike, spot)) {
      const i = obvVelocityInfo(item.CE_OBV, lookback);
      if (i && i.velocity < 0 && Math.abs(i.velocity) >= i.baseline * multiplier) out.push({ strike, side: 'R', velocity: i.velocity, baseline: i.baseline, multiple: Math.abs(i.velocity) / i.baseline });
    }
    if (!isITM('PE', strike, spot)) {
      const i = obvVelocityInfo(item.PE_OBV, lookback);
      if (i && i.velocity < 0 && Math.abs(i.velocity) >= i.baseline * multiplier) out.push({ strike, side: 'S', velocity: i.velocity, baseline: i.baseline, multiple: Math.abs(i.velocity) / i.baseline });
    }
  }
  out.sort((a, b) => Math.abs(b.velocity) - Math.abs(a.velocity));
  return { building: out };
}

export interface Eroding extends Building {
  tier: string;
}

/** `_gtbWallErosion`: ranked walls whose OBV velocity turned positive and at least `multiplier` x the strike's own pace (the writers are buying back). */
export function wallErosion(tableData: OiRow[], walls: Walls | null | undefined, lookback = 3, multiplier = 2): { eroding: Eroding[] } {
  const out: Eroding[] = [];
  const check = (list: Wall[] | undefined, side: 'R' | 'S', field: 'CE_OBV' | 'PE_OBV'): void => {
    for (const w of list || []) {
      const item = tableData[w.index];
      if (!item) continue;
      const info = obvVelocityInfo(item[field], lookback);
      if (info && info.velocity > 0 && info.velocity >= info.baseline * multiplier) out.push({ strike: w.strike, side, tier: w.tier, velocity: info.velocity, baseline: info.baseline, multiple: info.velocity / info.baseline });
    }
  };
  check(walls?.resistance, 'R', 'CE_OBV');
  check(walls?.support, 'S', 'PE_OBV');
  out.sort((a, b) => Math.abs(b.velocity) - Math.abs(a.velocity));
  return { eroding: out };
}

// ───────────────────────── max pain, gamma exposure, scores ─────────────────────────

export interface MaxPain {
  spot: number;
  maxPainK: number;
  maxPainDist: number;
  maxPainPct: number;
  gex: number[];
  strikes: number[];
  oiCE: number[];
  oiPE: number[];
  flipZones: number[];
  netGEX: number;
}

/** `_gtbComputeMaxPainGEX`: the strike where option writers lose least, plus a gamma-weighted CE-minus-PE exposure (bell curve, sigma 15% of spot). Null without rows. */
export function computeMaxPainGEX(tableData: OiRow[] | null | undefined): MaxPain | null {
  const td = tableData;
  if (!td || !td.length) return null;
  let spot = 0;
  for (const r of td) {
    if (r.ATM_STRIKE) {
      spot = parseFloat(String(r.STRIKE));
      break;
    }
  }
  if (!spot) spot = parseFloat(String(td[Math.floor(td.length / 2)]!.STRIKE));
  const strikes = td.map((r) => parseFloat(String(r.STRIKE)));
  const oiCE = td.map((r) => parseFloat(r.OI_CE) || 0);
  const oiPE = td.map((r) => parseFloat(r.OI_PE) || 0);

  let maxPainK = strikes[0]!;
  let minPain = Infinity;
  strikes.forEach((K) => {
    let pain = 0;
    strikes.forEach((S, si) => {
      if (S < K) pain += (K - S) * oiCE[si]!;
      if (S > K) pain += (S - K) * oiPE[si]!;
    });
    if (pain < minPain) {
      minPain = pain;
      maxPainK = K;
    }
  });

  const sigma = spot * 0.15;
  const gex = strikes.map((K, i) => {
    const g = Math.exp(-0.5 * Math.pow((K - spot) / sigma, 2));
    return (oiCE[i]! - oiPE[i]!) * g;
  });
  const flipZones: number[] = [];
  for (let j = 1; j < gex.length; j++) if (gex[j - 1]! >= 0 !== gex[j]! >= 0) flipZones.push(strikes[j]!);
  const netGEX = gex.reduce((a, b) => a + b, 0);
  const maxPainDist = maxPainK - spot;
  return { spot, maxPainK, maxPainDist, maxPainPct: spot ? (maxPainDist / spot) * 100 : 0, gex, strikes, oiCE, oiPE, flipZones, netGEX };
}

/** `_gtbMaxPainScore`: +1 when max pain is above spot, -1 below, 0 within 0.3% (or no data). */
export function maxPainScore(mp: MaxPain | null): 1 | 0 | -1 {
  if (!mp) return 0;
  if (Math.abs(mp.maxPainPct) < 0.3) return 0;
  return mp.maxPainDist > 0 ? 1 : -1;
}

/** `_gtbIVSkewScore`: put skew above 2 points = -1 (bearish pressure), call skew below -2 = +1, else 0. */
export function ivSkewScore(ivSkew: number | null | undefined): 1 | 0 | -1 {
  if (ivSkew === null || ivSkew === undefined) return 0;
  if (ivSkew > 2) return -1;
  if (ivSkew < -2) return 1;
  return 0;
}
