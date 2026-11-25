/**
 * Predict (9:15 combo): the numbers of `_gtbBuildPrediction` (grootTradeBot.js) as a pure function; the userscript's HTML is not ported.
 * Layer 1: today's 9:15 combo gives a base lean (hand-set 62/18/20 for Buy or Sell, 42/42/16 for Buy/Sell), replaced by the backtested win rate of that combo
 * when there is one. Layer 2: ten live signals nudge it (hand-weighted). Layer 3: the VIX regime and the VIXU / VIXL guard. Confidence is the share of
 * signals that point the way of the lean: agreement between signals, not how often the call is right. Heuristic weights, not back-tested (only layer 1 is).
 */
import { tradeSignal } from './marketSignal.js';
import { norm915 } from './marketSignal.js';
import type { ComboStats } from './combo.js';

export interface PredictInputs {
  /** 9:15 close zones (null = not scanned) */
  zones: { nifty: string | null; sensex: string | null; bank: string | null; gift: string | null };
  /** backtest stats of today's combo, or null when none */
  comboStats: ComboStats | null;
  /** the 11 leading scores summed by the userscript here: ALL 9:15, NIFTY 9:15, BANK 9:15, GIFT 9:15, SENSEX 9:15, then A/D (all, NIFTY, BANK) and futures (all, NIFTY, BANK) */
  leadScore: number;
  n50Fut: number;
  bnFut: number;
  adAll: number;
  futAll: number;
  /** NIFTY 50 futures VWAP and last price (0 when unknown) */
  n50Avwap: number;
  n50Ltp: number;
  /** OI/OBV (capped), max pain and IV skew scores of NIFTY 50 and BANK NIFTY, summed */
  oiNet: number;
  mpNet: number;
  ivNet: number;
  pcr50: number;
  compN50: number;
  compBN: number;
  indiaVix: number;
  /** NIFTY 50 price flags (VIXU / VIXL when at a band edge) */
  n50Trends: readonly string[];
  /** 9:15 levels of NIFTY 50 */
  strike: { aso: number; ast: number; bso: number; bst: number } | null;
  includeLagging: boolean;
  /** the Live Context price gate: ok false turns a BUY / SELL into WAIT */
  lxGate?: ((dir: number) => { ok: boolean } | null) | null;
}

export interface Nudge {
  label: string;
  rawVal: number;
  weight: number;
  nudge: number;
  note: string;
}

export interface Scenario {
  prob: number;
  label: string;
  detail: string;
}

export interface Prediction {
  comboKey: string;
  strat: { outcome: string; level: string };
  comboStats: ComboStats | null;
  nudges: Nudge[];
  bullP: number;
  bearP: number;
  sidewaysP: number;
  vixRegime: string;
  noTrade: boolean;
  atVIXU: boolean;
  atVIXL: boolean;
  confidence: number;
  leadLagConflict: boolean;
  tradeAction: string;
  tradeEntry: string;
  tradeTarget: string;
  tradeStop: string;
  priceGate: { ok: boolean } | null;
  scenarios: Scenario[];
  primary: 'BULL' | 'BEAR' | 'NONE';
}

export function predict(i: PredictInputs): Prediction {
  const n915raw = i.zones.nifty || 'B/W';
  const s915raw = i.zones.sensex || 'B/W';
  const b915raw = i.zones.bank || 'B/W';
  const gn915 = i.zones.gift || 'B/W';
  const comboKey = `${norm915(n915raw)}-${norm915(s915raw)}-${norm915(b915raw)}`;
  const strat = tradeSignal(n915raw, s915raw, b915raw);
  const comboStats = i.comboStats;

  // layer 1: base lean from the combo
  let bullBase = 33;
  let bearBase = 33;
  let sidewaysBase = 34;
  if (strat.outcome === 'Buy') {
    bullBase = 62;
    bearBase = 18;
    sidewaysBase = 20;
  } else if (strat.outcome === 'Sell') {
    bullBase = 18;
    bearBase = 62;
    sidewaysBase = 20;
  } else if (strat.outcome === 'Buy/Sell') {
    bullBase = 42;
    bearBase = 42;
    sidewaysBase = 16;
  }
  if (comboStats) {
    if (strat.outcome === 'Buy') {
      bullBase = Math.round(comboStats.winPct * 0.9);
      bearBase = Math.round((100 - comboStats.winPct) * 0.7);
      sidewaysBase = 100 - bullBase - bearBase;
    } else if (strat.outcome === 'Sell') {
      bearBase = Math.round(comboStats.winPct * 0.9);
      bullBase = Math.round((100 - comboStats.winPct) * 0.7);
      sidewaysBase = 100 - bullBase - bearBase;
    }
  }
  void sidewaysBase;

  // layer 2: signal nudges
  const nudges: Nudge[] = [];
  let totalNudge = 0;
  const addNudge = (label: string, rawVal: number, weight: number, note = ''): number => {
    const n = rawVal * weight;
    nudges.push({ label, rawVal, weight, nudge: n, note });
    return n;
  };
  totalNudge += addNudge('Leading score (9:15 + A/D + Futures)', i.leadScore, 2.0, 'fast signals; high weight');
  totalNudge += addNudge('NIFTY 50 futures REMARK', i.n50Fut, 3.5, 'index future is primary price discovery');
  totalNudge += addNudge('BANK NIFTY futures REMARK', i.bnFut, 3.0, 'sector confirmation');
  const gn915Score = norm915(gn915) === 'ASO' ? 1 : norm915(gn915) === 'BSO' ? -1 : 0;
  totalNudge += addNudge('GIFT NIFTY 9:15 zone', gn915Score, 2.5, 'global pre-market signal');
  const adFutAlign = i.adAll > 0 && i.futAll > 0 ? 1 : i.adAll < 0 && i.futAll < 0 ? -1 : 0;
  totalNudge += addNudge('A/D spot ↔ Futures alignment', adFutAlign, 2.0, 'both confirming = stronger signal');
  let avwapDir = 0;
  if (i.n50Avwap && i.n50Ltp) avwapDir = i.n50Ltp > i.n50Avwap ? 1 : -1;
  totalNudge += addNudge('NIFTY 50 AVWAP direction', avwapDir, 2.5, 'LTP above/below 9:15 anchored VWAP');
  const oiDir = i.oiNet > 0 ? 1 : i.oiNet < 0 ? -1 : 0;
  totalNudge += addNudge('OI/OBV direction (N50+BN)', oiDir, 1.0, 'lagging; reflects prior candle batch');
  totalNudge += addNudge('Max Pain gravity (N50+BN)', i.mpNet, 0.8, 'gravitational pull; low intraday weight');
  let pcrNudge = 0;
  let pcrNote = '';
  if (i.pcr50 > 1.3) {
    pcrNudge = 1;
    pcrNote = 'extreme puts → contrarian bullish';
  } else if (i.pcr50 < 0.7) {
    pcrNudge = -1;
    pcrNote = 'extreme calls → contrarian bearish';
  }
  totalNudge += addNudge('PCR contrarian signal', pcrNudge, 1.2, pcrNote || 'neutral PCR; no contrarian edge');
  totalNudge += addNudge('IV Skew (N50+BN)', i.ivNet, 0.8, 'put skew -1 (fear), call skew +1 (demand)');
  const compDir = i.compN50 + i.compBN > 0.5 ? 1 : i.compN50 + i.compBN < -0.5 ? -1 : 0;
  totalNudge += addNudge('Weighted component breadth', compDir, 1.5, 'weighted top-20 constituent alignment');

  const maxNudge = nudges.reduce((s, n) => s + Math.abs(n.weight), 0);
  const shift = Math.max(-40, Math.min(40, (totalNudge / maxNudge) * 40));
  let bullP = Math.max(5, Math.min(88, bullBase + shift));
  let bearP = Math.max(5, Math.min(88, bearBase - shift));
  let sidewaysP = Math.max(4, 100 - bullP - bearP);
  const tot = bullP + bearP + sidewaysP;
  bullP = Math.round((bullP / tot) * 100);
  bearP = Math.round((bearP / tot) * 100);
  sidewaysP = Math.round((sidewaysP / tot) * 100);

  // layer 3: VIX regime
  const vixVal = i.indiaVix;
  let vixRegime = 'NORMAL';
  let noTrade = false;
  if (vixVal > 0) {
    if (vixVal < 13) vixRegime = 'LOW';
    else if (vixVal < 18) vixRegime = 'NORMAL';
    else if (vixVal < 25) {
      vixRegime = 'ELEVATED';
      bullP = Math.round(bullP * 0.75 + 25 * 0.25);
      bearP = Math.round(bearP * 0.75 + 25 * 0.25);
      sidewaysP = 100 - bullP - bearP;
    } else vixRegime = 'HIGH';
  }
  const atVIXU = i.n50Trends.indexOf('VIXU') !== -1;
  const atVIXL = i.n50Trends.indexOf('VIXL') !== -1;
  if (atVIXU || atVIXL) noTrade = true;

  // confidence: how many signals point the way of the lean
  const primaryBull = bullP > bearP && bullP > sidewaysP;
  const primaryBear = bearP > bullP && bearP > sidewaysP;
  let agreed = 0;
  for (const n of nudges) {
    if (primaryBull && n.nudge > 0) agreed++;
    else if (primaryBear && n.nudge < 0) agreed++;
    else if (!primaryBull && !primaryBear && Math.abs(n.nudge) < 0.5) agreed++;
  }
  let confidence = Math.round((agreed / nudges.length) * 100);
  const laggingScore = i.oiNet;
  const leadLagConflict = i.includeLagging && ((i.leadScore > 2 && laggingScore < -1) || (i.leadScore < -2 && laggingScore > 1));
  if (leadLagConflict) confidence = Math.round(confidence * 0.7);

  // trade recommendation
  const n50 = i.strike;
  let tradeAction = '—';
  let tradeEntry = '';
  let tradeTarget = '';
  let tradeStop = '';
  if (noTrade) {
    tradeAction = 'NO TRADE';
    tradeEntry = atVIXU ? 'NIFTY at VIXU — past the expected day range. This is momentum, not a reversal signal; do not fade it unless the futures turn' : atVIXL ? 'NIFTY at VIXL — past the expected day range. This is momentum, not a reversal signal; do not fade it unless the futures turn' : 'VIX HIGH — wide unpredictable swings';
  } else if (primaryBull && bullP >= 52) {
    tradeAction = 'BUY CE';
    if (n50) {
      tradeEntry = `Entry: near BSO ${n50.bso.toFixed(0)}${atVIXL ? ' ★ at VIXL — high probability bounce' : ''}`;
      tradeTarget = `Target 1: ASO ${n50.aso.toFixed(0)} → Target 2: AST ${n50.ast.toFixed(0)}`;
      tradeStop = `Stop: below BST ${n50.bst.toFixed(0)}`;
    }
  } else if (primaryBear && bearP >= 52) {
    tradeAction = 'BUY PE';
    if (n50) {
      tradeEntry = `Entry: near ASO ${n50.aso.toFixed(0)}${atVIXU ? ' ★ at VIXU — high probability reversal' : ''}`;
      tradeTarget = `Target 1: BSO ${n50.bso.toFixed(0)} → Target 2: BST ${n50.bst.toFixed(0)}`;
      tradeStop = `Stop: above AST ${n50.ast.toFixed(0)}`;
    }
  } else {
    tradeAction = 'WAIT / IRON CONDOR';
    if (n50) {
      tradeEntry = `Range: BSO ${n50.bso.toFixed(0)} ↔ ASO ${n50.aso.toFixed(0)}`;
      tradeTarget = 'Condor body: collect premium between BSO and ASO';
      tradeStop = 'Exit if NIFTY breaks BST or AST';
    }
  }
  // price-confirmation gate (Live Context): a BUY / SELL waits while price is not doing what the call needs
  let priceGate: { ok: boolean } | null = null;
  if (i.lxGate && (tradeAction === 'BUY CE' || tradeAction === 'BUY PE')) {
    priceGate = i.lxGate(tradeAction === 'BUY CE' ? 1 : -1);
    if (priceGate && !priceGate.ok) tradeAction = 'WAIT: PRICE NOT CONFIRMING';
  }

  // outcome scenarios
  const scenarios: Scenario[] = [];
  if (primaryBull) {
    scenarios.push({ prob: bullP, label: 'BULL TREND', detail: 'Sustained move above ASO toward AST. Pullbacks to BSO are buying dips.' });
    scenarios.push({ prob: sidewaysP, label: 'RANGE DAY', detail: 'Oscillates between BSO and ASO. Both sides get a trade.' });
    scenarios.push({ prob: bearP, label: 'REVERSAL', detail: 'Fails at ASO, drops below BSO. Bearish trap for early CE buyers.' });
  } else if (primaryBear) {
    scenarios.push({ prob: bearP, label: 'BEAR TREND', detail: 'Sustained move below BSO toward BST. Rallies to ASO are shorting opportunities.' });
    scenarios.push({ prob: sidewaysP, label: 'RANGE DAY', detail: 'Oscillates between BSO and ASO. Both sides get a trade.' });
    scenarios.push({ prob: bullP, label: 'REVERSAL', detail: 'Fails at BSO, rallies above ASO. Bull trap for early PE buyers.' });
  } else {
    scenarios.push({ prob: sidewaysP, label: 'SIDEWAYS', detail: 'Choppy range between BSO and ASO. Option sellers favoured.' });
    scenarios.push({ prob: bullP, label: 'BULL BREAK', detail: 'Clear break above ASO — enter CE on pullback.' });
    scenarios.push({ prob: bearP, label: 'BEAR BREAK', detail: 'Break below BSO — enter PE on rally.' });
  }
  return { comboKey, strat, comboStats, nudges, bullP, bearP, sidewaysP, vixRegime, noTrade, atVIXU, atVIXL, confidence, leadLagConflict, tradeAction, tradeEntry, tradeTarget, tradeStop, priceGate, scenarios, primary: primaryBull ? 'BULL' : primaryBear ? 'BEAR' : 'NONE' };
}
