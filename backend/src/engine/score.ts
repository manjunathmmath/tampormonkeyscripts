/**
 * Instrument score. Faithful port of `computeInstrumentScore` (grootTradeBot.js): the sum of six parts, each already computed elsewhere:
 *   nine_fifteen   +2 AST, +1 ASO, -1 BSO, -2 BST (the 9:15 close zone)
 *   current_trend  the live price against the 9:15 levels: AST +2, ASO +1, BST -2, BSO -1 (first match in that order)
 *   futures_trend  +1 / 0 / -1 from the futures remark
 *   oi_obv         the chain OI/OBV score; only its contribution to `total` is capped at +-3, the field itself stays raw
 *   max_pain       +1 / 0 / -1
 *   iv_skew        +1 / 0 / -1
 * Pure function; the parts are inputs.
 */
import type { TrendFlag } from './trend.js';

export interface InstrumentScoreParts {
  /** the 9:15 close zone, or undefined when the name has no scan entry */
  zone?: string | null;
  /** active level flags (from makeTrend), or undefined when the trend could not be calculated (the part then reads 0) */
  trends?: readonly TrendFlag[] | readonly string[] | null;
  futuresTrend?: number;
  oiObv?: number;
  maxPain?: number;
  ivSkew?: number;
}

export interface InstrumentScore {
  nine_fifteen: number;
  current_trend: number;
  futures_trend: number;
  oi_obv: number;
  max_pain: number;
  iv_skew: number;
  total: number;
}

export function nineFifteenScore(zone: string | null | undefined): number {
  if (zone === 'AST') return 2;
  if (zone === 'ASO') return 1;
  if (zone === 'BST') return -2;
  if (zone === 'BSO') return -1;
  return 0;
}

/** The trend part from the active flags: AST, then ASO, then BST, then BSO (the first one present decides). */
export function currentTrendScore(trends: readonly string[] | null | undefined): number {
  const t = trends ?? [];
  if (t.includes('AST')) return 2;
  if (t.includes('ASO')) return 1;
  if (t.includes('BST')) return -2;
  if (t.includes('BSO')) return -1;
  return 0;
}

/** The commodity variant: the live price against the commodity's own strike map, at-or-beyond rule, 0 when a level is missing (NaN). */
export function mcxTrendScore(px: number, m: { ustrikeOne: number | string; ustrikeTwo: number | string; bstrikeOne: number | string; bstrikeTwo: number | string }): number {
  const u1 = parseFloat(String(m.ustrikeOne));
  const u2 = parseFloat(String(m.ustrikeTwo));
  const b1 = parseFloat(String(m.bstrikeOne));
  const b2 = parseFloat(String(m.bstrikeTwo));
  if (Number.isFinite(u2) && px >= u2) return 2;
  if (Number.isFinite(u1) && px >= u1) return 1;
  if (Number.isFinite(b2) && px <= b2) return -2;
  if (Number.isFinite(b1) && px <= b1) return -1;
  return 0;
}

export function instrumentScore(p: InstrumentScoreParts): InstrumentScore {
  const nine_fifteen = nineFifteenScore(p.zone);
  const current_trend = currentTrendScore(p.trends);
  const futures_trend = p.futuresTrend !== undefined ? p.futuresTrend : 0;
  const oi_obv = p.oiObv !== undefined ? p.oiObv : 0;
  const max_pain = p.maxPain ?? 0;
  const iv_skew = p.ivSkew ?? 0;
  const oiObvCapped = Math.max(-3, Math.min(3, oi_obv));
  const total = nine_fifteen + current_trend + futures_trend + oiObvCapped + max_pain + iv_skew;
  return { nine_fifteen, current_trend, futures_trend, oi_obv, max_pain, iv_skew, total };
}
