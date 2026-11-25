/**
 * Crude oil global context: port of the signal in `_cmdRenderGlobalContext` (grootTradeBot.js). MCX Crude settles against NYMEX WTI, so the fair value is
 * WTI x USD/INR; a gap of more than 1% either way is a reversion tilt. WTI direction, the rupee, the gap and GIFT NIFTY (inverse correlation with crude in the
 * userscript's own check) each vote bull or bear. OVX at or above 35 only adds a warning. A reasoned signal, not back-tested.
 */
export interface CrudeInput {
  wtiCur: number;
  wtiPrev: number;
  usdInr: number;
  /** the MCX crude price */
  mcxLtp: number;
  /** the rupee score: the trend part of USDINR's instrument score, else its futures trend; 0 when unknown */
  usdScore: number;
  ovx: number;
  /** GIFT NIFTY change in percent */
  giftChg: number;
}

export interface CrudeSignal {
  fairValue: number;
  /** MCX price against the fair value, percent (null when either is missing) */
  gap: number | null;
  signal: 'ENTER WTI' | 'BUY CE' | 'BUY PE' | 'LEAN LONG' | 'LEAN SHORT' | 'WAIT';
  tone: 'good' | 'bad' | 'warn' | 'flat';
  reasons: string[];
}

export function crudeSignal(i: CrudeInput): CrudeSignal {
  const fairValue = i.wtiCur && i.usdInr ? Math.round(i.wtiCur * i.usdInr) : 0;
  const gap = fairValue && i.mcxLtp ? ((i.mcxLtp - fairValue) / fairValue) * 100 : null;
  const wtiDir = i.wtiCur && i.wtiPrev ? (i.wtiCur > i.wtiPrev ? 1 : i.wtiCur < i.wtiPrev ? -1 : 0) : 0;
  const reasons: string[] = [];
  if (!i.wtiCur || !i.wtiPrev) return { fairValue, gap, signal: 'ENTER WTI', tone: 'flat', reasons: ['Enter WTI current and previous close to compute signal'] };
  if (i.ovx >= 35) reasons.push(`OVX ELEVATED (${i.ovx.toFixed(1)}) — warning: widen SL / cut size`);
  let gapBias = 0;
  if (gap !== null) {
    if (gap > 1.0) {
      gapBias = -1;
      reasons.push(`MCX premium +${gap.toFixed(1)}% vs WTI — reversion drag`);
    } else if (gap < -1.0) {
      gapBias = 1;
      reasons.push(`MCX discount ${gap.toFixed(1)}% vs WTI — catch-up potential`);
    }
  }
  let bull = 0;
  let bear = 0;
  if (wtiDir > 0) {
    bull++;
    reasons.push(`WTI bullish (${i.wtiPrev}→${i.wtiCur})`);
  }
  if (wtiDir < 0) {
    bear++;
    reasons.push(`WTI bearish (${i.wtiPrev}→${i.wtiCur})`);
  }
  if (i.usdScore > 0) {
    bull++;
    reasons.push('USD/INR bullish — MCX amplified');
  }
  if (i.usdScore < 0) {
    bear++;
    reasons.push('USD/INR bearish — MCX drag');
  }
  bull += gapBias > 0 ? 1 : 0;
  bear += gapBias < 0 ? 1 : 0;
  if (i.giftChg < -0.1) {
    bull++;
    reasons.push(`GIFT NIFTY down ${i.giftChg.toFixed(2)}% — inverse correlation favors crude up`);
  }
  if (i.giftChg > 0.1) {
    bear++;
    reasons.push(`GIFT NIFTY up ${i.giftChg.toFixed(2)}% — inverse correlation favors crude down`);
  }
  if (bull >= 2 && bear === 0) return { fairValue, gap, signal: 'BUY CE', tone: 'good', reasons };
  if (bear >= 2 && bull === 0) return { fairValue, gap, signal: 'BUY PE', tone: 'bad', reasons };
  if (bull > bear) {
    reasons.push('Conflicting signals — lean long, confirm with OBV');
    return { fairValue, gap, signal: 'LEAN LONG', tone: 'good', reasons };
  }
  if (bear > bull) {
    reasons.push('Conflicting signals — lean short, confirm with OBV');
    return { fairValue, gap, signal: 'LEAN SHORT', tone: 'bad', reasons };
  }
  reasons.push('WTI and USD/INR conflict — no edge');
  return { fairValue, gap, signal: 'WAIT', tone: 'warn', reasons };
}
