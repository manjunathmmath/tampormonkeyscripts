/**
 * Price-vs-levels trend and the VIX range. Faithful port of utils.js: `calculateVixRange`, `getVixRange` and the trend flags + change figures of
 * `generateTrend` (the version that does not read localStorage: every input is passed in). Pure functions.
 */
import type { StrikeDetails } from './levels.js';

export type VixHorizon = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface VixBand {
  chg: string;
  range: string;
  lNift: string;
  uNift: string;
}

/** `calculateVixRange`: the expected move for a horizon from India VIX. DAILY divides VIX by sqrt(246), WEEKLY by sqrt(52), MONTHLY by sqrt(12). Values are 2-decimal strings. */
export function calculateVixRange(type: VixHorizon, prevClose: number | string, prevVixClose: number | string): VixBand {
  const v = parseFloat(String(prevVixClose));
  let chg = Number.NaN;
  if (type === 'DAILY') chg = v / Math.sqrt(365 - 104 - 15);
  if (type === 'MONTHLY') chg = v / Math.sqrt(12);
  if (type === 'WEEKLY') chg = v / Math.sqrt(52);
  const prev = parseFloat(String(prevClose));
  const range = (prev * chg) / 100;
  const lNift = prev - range;
  const uNift = prev + range;
  return { chg: chg.toFixed(2), range: range.toFixed(2), lNift: lNift.toFixed(2), uNift: uNift.toFixed(2) };
}

export interface VixRange {
  vixMMRange: string;
  vixMMLower: string;
  vixMMUpper: string;
  vixWWRange: string;
  vixWWLower: string;
  vixWWUpper: string;
  vixDDRange: string;
  vixDDLower: string;
  vixDDUpper: string;
}

/** `getVixRange`: the monthly, weekly and daily bands around the previous close. */
export function getVixRange(prevClose: number | string, prevVixClose: number | string): VixRange {
  const mm = calculateVixRange('MONTHLY', prevClose, prevVixClose);
  const ww = calculateVixRange('WEEKLY', prevClose, prevVixClose);
  const dd = calculateVixRange('DAILY', prevClose, prevVixClose);
  return { vixMMRange: mm.range, vixMMLower: mm.lNift, vixMMUpper: mm.uNift, vixWWRange: ww.range, vixWWLower: ww.lNift, vixWWUpper: ww.uNift, vixDDRange: dd.range, vixDDLower: dd.lNift, vixDDUpper: dd.uNift };
}

export type TrendFlag = 'AST' | 'ASO' | 'BST' | 'BSO' | 'VIXL' | 'VIXU';

export interface Trend {
  ltp: number;
  open: number;
  prevPrice: number;
  /** LTP vs previous close, percent, 2-decimal string */
  change: string;
  /** gap at the open vs previous close, percent, 2-decimal string */
  open_perc: string;
  strikeData: StrikeDetails;
  vix: VixRange;
  /** every active flag, in the userscript's order: AST, ASO, BST, BSO, VIXL, VIXU (more than one can be active) */
  trends: TrendFlag[];
}

/** `generateTrend`: the level flags for a live price. At-or-beyond a level counts. */
export function makeTrend(input: { ltp: number; open: number; prevPrice: number; strikeData: StrikeDetails; prevVixClose: number | string }): Trend {
  const { ltp, open, prevPrice, strikeData } = input;
  const vix = getVixRange(prevPrice, input.prevVixClose);
  const vixLower = parseFloat(vix.vixDDLower);
  const vixUpper = parseFloat(vix.vixDDUpper);
  const trends: TrendFlag[] = [];
  if (ltp >= strikeData.ast) trends.push('AST');
  if (ltp >= strikeData.aso) trends.push('ASO');
  if (ltp <= strikeData.bst) trends.push('BST');
  if (ltp <= strikeData.bso) trends.push('BSO');
  if (ltp <= vixLower) trends.push('VIXL');
  if (ltp >= vixUpper) trends.push('VIXU');
  return {
    ltp,
    open,
    prevPrice,
    change: parseFloat(String(((ltp - prevPrice) / prevPrice) * 100)).toFixed(2),
    open_perc: parseFloat(String(((open - prevPrice) / prevPrice) * 100)).toFixed(2),
    strikeData,
    vix,
    trends,
  };
}
