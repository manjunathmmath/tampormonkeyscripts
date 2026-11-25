/**
 * Curve structure: the near-versus-far futures read of `_dvLoadCurveStructure` (NSE) and `_cmdLoadCurveStructure` (MCX) in grootTradeBot.js.
 * The gap between the two nearest contracts, annualised, gives a state and a lean. NSE: only backwardation beyond -2% a year votes (bullish), a steep
 * contango (> +10%) is financing cost and casts no vote. MCX: backwardation beyond -3% is bullish and contango beyond +8% is bearish / caution.
 */
export interface CurveRead {
  state: 'CONTANGO' | 'BACKWARDATION' | 'FLAT';
  diffPct: number;
  annualizedPct: number;
  daysGap: number;
  lean: string;
  tone: 'good' | 'bad' | 'warn' | 'flat';
  note: string;
  /** the Master Consensus vote: 1 bullish, -1 bearish, 0 none */
  dir: 1 | 0 | -1;
}

const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** `label` names the instrument in the explanatory text (the symbol for NSE, the commodity's own label for MCX). */
export function curveRead(nearLtp: number, farLtp: number, nearExpiry: string, farExpiry: string, mcx: boolean, label: string): CurveRead {
  const diffPct = nearLtp ? ((farLtp - nearLtp) / nearLtp) * 100 : 0;
  const daysGap = Math.max(1, daysBetween(nearExpiry, farExpiry));
  const annualizedPct = diffPct * (365 / daysGap);
  const state = diffPct > 0.05 ? 'CONTANGO' : diffPct < -0.05 ? 'BACKWARDATION' : 'FLAT';
  let lean: string;
  let tone: CurveRead['tone'];
  let note: string;
  let dir: CurveRead['dir'];
  if (!mcx) {
    if (annualizedPct < -2) {
      lean = 'BULLISH LEAN (check dividend calendar)';
      tone = 'good';
      note = `Backwardated — near contract trading at a premium to far month. For an NSE future this is usually a dividend/ex-date or rollover-flow effect rather than physical tightness — check ${label}'s upcoming ex-dividend date before reading this as pure bullish conviction.`;
    } else if (annualizedPct > 10) {
      lean = 'STEEP CONTANGO (no vote)';
      tone = 'warn';
      note = 'Far month priced above near by more than a typical cost-of-carry gap. For NSE stock/index futures that mostly reflects financing cost and long positioning (mildly bullish at most), or a thinly-traded far contract distorting the price — so it is NOT scored as bearish and casts no vote. (The bearish reading of a steep contango is a commodity-supply idea and only applies to MCX.)';
    } else {
      lean = 'NEUTRAL';
      tone = 'flat';
      note = `Within normal cost-of-carry range for a ${daysGap}-day gap — not a directional signal on its own.`;
    }
    dir = annualizedPct < -2 ? 1 : 0;
  } else {
    if (annualizedPct < -3) {
      lean = 'BULLISH LEAN';
      tone = 'good';
      note = `Backwardated — near contract trading at a premium to far month, consistent with physical tightness/urgency for ${label}.`;
    } else if (annualizedPct > 8) {
      lean = 'BEARISH / CAUTION';
      tone = 'bad';
      note = 'Steep contango — far month priced well above near, consistent with ample supply/no urgency. A weak backdrop to trust an aggressive long in.';
    } else {
      lean = 'NEUTRAL';
      tone = 'flat';
      note = `Within normal carry-cost range for a ${daysGap}-day gap — not a directional signal on its own.`;
    }
    dir = annualizedPct < -3 ? 1 : annualizedPct > 8 ? -1 : 0;
  }
  return { state, diffPct, annualizedPct, daysGap, lean, tone, note, dir };
}
