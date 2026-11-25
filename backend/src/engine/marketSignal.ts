/**
 * The market-wide signal: faithful ports of `getTradeSignal` (the 9:15 combo plan, `GTB_STRAT_LOOKUP`) and `getMarketSignal` (the composite score turned
 * into STRONG BUY ... STRONG SELL, with the VIX guard, the futures conflict rules and the 9:15 cross-check) from grootTradeBot.js.
 */

export interface StratEntry {
  outcome: string;
  level: string;
}

/** Key = norm(NIFTY)-norm(SENSEX)-norm(BANK) where AST becomes ASO and BST becomes BSO. */
export const GTB_STRAT_LOOKUP: Record<string, StratEntry> = {
  'ASO-ASO-ASO': { outcome: 'Buy', level: 'at BSO/BST' },
  'ASO-ASO-BSO': { outcome: 'Buy/Sell', level: 'at BSO/BST for long, at ASO/AST for short' },
  'ASO-ASO-B/W': { outcome: 'Buy', level: 'at BSO/BST' },
  'ASO-BSO-ASO': { outcome: 'Buy', level: 'at BSO/BST — Sensex lag, Nifty+Bank agree' },
  'ASO-BSO-BSO': { outcome: 'Sell', level: 'at ASO/AST — bank sector leading down' },
  'ASO-BSO-B/W': { outcome: 'Buy/Sell', level: 'at BSO/BST for long, at ASO/AST for short' },
  'ASO-B/W-ASO': { outcome: 'Buy', level: 'at BSO/BST' },
  'ASO-B/W-BSO': { outcome: 'Buy/Sell', level: 'at BSO/BST for long, at ASO/AST for short' },
  'ASO-B/W-B/W': { outcome: 'Buy', level: 'at BSO/BST — Nifty leading, wait for others' },
  'BSO-ASO-ASO': { outcome: 'Buy/Sell', level: 'at BSO/BST for long, at ASO/AST for short' },
  'BSO-ASO-BSO': { outcome: 'Sell', level: 'at ASO/AST — Nifty+Bank down, Sensex lagging' },
  'BSO-ASO-B/W': { outcome: 'Sell', level: 'at ASO/AST' },
  'BSO-BSO-ASO': { outcome: 'Sell', level: 'at ASO/AST — bank sector resilient but outvoted' },
  'BSO-BSO-BSO': { outcome: 'Sell', level: 'at ASO/AST' },
  'BSO-BSO-B/W': { outcome: 'Sell', level: 'at ASO/AST' },
  'BSO-B/W-ASO': { outcome: 'Buy/Sell', level: 'at BSO/BST for long, at ASO/AST for short' },
  'BSO-B/W-BSO': { outcome: 'Sell', level: 'at ASO/AST' },
  'BSO-B/W-B/W': { outcome: 'Sell', level: 'at ASO/AST' },
  'B/W-ASO-ASO': { outcome: 'Buy', level: 'at BSO/BST — Nifty indecisive but both others confirm' },
  'B/W-ASO-BSO': { outcome: 'Buy/Sell', level: 'at BSO/BST for long, at ASO/AST for short' },
  'B/W-ASO-B/W': { outcome: 'Buy/Sell', level: 'at BSO/BST for long, at ASO/AST for short' },
  'B/W-BSO-ASO': { outcome: 'Buy/Sell', level: 'at BSO/BST for long, at ASO/AST for short' },
  'B/W-BSO-BSO': { outcome: 'Sell', level: 'at ASO/AST — both Sensex+Bank confirm down' },
  'B/W-BSO-B/W': { outcome: 'Sell', level: 'at ASO/AST' },
  'B/W-B/W-ASO': { outcome: 'Buy', level: 'at BSO/BST — Bank Nifty leading' },
  'B/W-B/W-BSO': { outcome: 'Sell', level: 'at ASO/AST — Bank Nifty leading down' },
  'B/W-B/W-B/W': { outcome: 'Sell', level: 'at ASO/AST — all indices in range, bearish bias' },
};

export const norm915 = (v: string | null | undefined): string => (v === 'AST' ? 'ASO' : v === 'BST' ? 'BSO' : v || 'B/W');

/** `getTradeSignal`: the 9:15 plan of the NIFTY - SENSEX - BANK NIFTY combo. */
export function tradeSignal(nifty: string | null | undefined, sensex: string | null | undefined, bank: string | null | undefined): StratEntry {
  const key = `${norm915(nifty)}-${norm915(sensex)}-${norm915(bank)}`;
  return GTB_STRAT_LOOKUP[key] || { outcome: 'Sideways', level: 'No trade' };
}

export interface NiftyVixView {
  /** flags of the NIFTY 50 price trend (contains VIXU / VIXL when price is at or past a band edge) */
  trends: readonly string[];
  ltp: number | string;
  vixDDUpper: number | string;
  vixDDLower: number | string;
}

/** `_gtbVixGuardText`: how far past the daily VIX band price is, in points and in expected daily ranges. */
export function vixGuardText(tr: NiftyVixView, upper: boolean): string {
  const tail = upper ? 'daily range exhausted on upside. Wait for pullback.' : 'daily range exhausted on downside. Wait for bounce.';
  const U = parseFloat(String(tr.vixDDUpper));
  const L = parseFloat(String(tr.vixDDLower));
  const lt = parseFloat(String(tr.ltp));
  const half = (U - L) / 2;
  const mid = (U + L) / 2;
  const edge = upper ? U : L;
  const past = upper ? lt - edge : edge - lt;
  if (!Number.isFinite(past) || !Number.isFinite(half) || half <= 0) return `NIFTY at ${upper ? 'VIXU' : 'VIXL'} — ${tail}`;
  if (past < 1) return `NIFTY at ${upper ? 'VIXU' : 'VIXL'} ${Math.round(edge)} — ${tail}`;
  const fromClose = Math.abs(lt - mid) / half;
  return `NIFTY ${Math.round(lt).toLocaleString('en-IN')} is ${Math.round(past)} pts ${upper ? 'above VIXU ' : 'below VIXL '}${Math.round(edge).toLocaleString('en-IN')} — ${fromClose.toFixed(1)}× the expected daily range from the previous close; ${tail}`;
}

export interface MarketSignal {
  signal: string;
  reason: string;
  tradeSignal: StratEntry;
}

export interface MarketSignalInputs {
  /** the composite score */
  score: number;
  /** 9:15 close zones of NIFTY 50, SENSEX and NIFTY BANK (undefined = not scanned, treated as B/W) */
  n915?: string;
  sx915?: string;
  bn915?: string;
  /** NIFTY 50 price flags and VIX band; null when the trend could not be read */
  nifty: NiftyVixView | null;
  /** the futures scores (-1, 0, 1) of NIFTY 50 and NIFTY BANK */
  n50Fut: number;
  bnFut: number;
  /** the sum of the leading score globals: 9:15 (7 of them) + advance/decline (3) + futures trend (3) */
  leadingScore: number;
}

const futW = (v: number): string => (v > 0 ? 'bullish' : v < 0 ? 'bearish' : 'neutral');

/** `getMarketSignal`. Display only: it modifies no score. */
export function marketSignal(i: MarketSignalInputs): MarketSignal {
  const n915 = i.n915 ?? 'B/W';
  const sx915 = i.sx915 ?? 'B/W';
  const bn915 = i.bn915 ?? 'B/W';
  // VIX guard: NIFTY at the daily VIX boundary means the statistical edge is exhausted
  if (i.nifty) {
    const trends = i.nifty.trends || [];
    if (trends.indexOf('VIXU') !== -1) return { signal: 'NO TRADE', reason: vixGuardText(i.nifty, true), tradeSignal: { outcome: 'Sideways', level: 'No trade — VIX upper boundary hit' } };
    if (trends.indexOf('VIXL') !== -1) return { signal: 'NO TRADE', reason: vixGuardText(i.nifty, false), tradeSignal: { outcome: 'Sideways', level: 'No trade — VIX lower boundary hit' } };
  }
  const ts = tradeSignal(n915, sx915, bn915);
  const SCORE = i.score;
  const indexFuturesScore = i.n50Fut + i.bnFut;

  let signal: string;
  let reason: string;
  if (SCORE >= 8) {
    signal = 'STRONG BUY';
    reason = 'All pillars bullish: 9:15 breakout, advance/decline, futures trend, OI/OBV and components aligned.';
  } else if (SCORE >= 4) {
    signal = 'BUY';
    reason = 'Majority of signals bullish. Trade long at pullbacks to BSO/BST.';
  } else if (SCORE >= 1.5) {
    signal = 'WAIT';
    reason = 'Mild bullish lean but not enough confirmation. Wait for score to improve or price to reach key level.';
  } else if (SCORE >= -1.5) {
    signal = 'SIDEWAYS';
    reason = 'Signals balanced. Market is range-bound between BSO and ASO. Trade the range.';
  } else if (SCORE >= -4) {
    signal = 'WAIT';
    reason = 'Mild bearish lean but not enough confirmation. Wait for score to worsen or price to reach key level.';
  } else if (SCORE >= -8) {
    signal = 'SELL';
    reason = 'Majority of signals bearish. Trade short at rallies to ASO/AST.';
  } else {
    signal = 'STRONG SELL';
    reason = 'All pillars bearish: 9:15 breakdown, advance/decline negative, futures short, OI/OBV and components all down.';
  }

  const leading = i.leadingScore;
  if (SCORE > 4 && indexFuturesScore < 0) {
    const nBear = n915 === 'BSO' || n915 === 'BST';
    const bBear = bn915 === 'BSO' || bn915 === 'BST';
    if (leading < 0 && nBear && bBear) {
      signal = 'SELL';
      reason = `Score bullish (${SCORE.toFixed(2)}) but lagging — leading indicators (9:15 + A/D + futures) all bearish. Trust futures: trade short.`;
    } else if (leading < 0) {
      signal = 'WAIT';
      reason = `Score bullish (${SCORE.toFixed(2)}) but futures + leading score bearish. 9:15 not fully confirming — wait for alignment.`;
    } else {
      signal = 'WAIT';
      reason = `Score bullish (${SCORE.toFixed(2)}) but index futures lean bearish (NIFTY ${futW(i.n50Fut)}, BANK NIFTY ${futW(i.bnFut)}). Conflicting signals — no trade.`;
    }
  } else if (SCORE < -4 && indexFuturesScore > 0) {
    const nBull = n915 === 'ASO' || n915 === 'AST';
    const bBull = bn915 === 'ASO' || bn915 === 'AST';
    if (leading > 0 && nBull && bBull) {
      signal = 'BUY';
      reason = `Score bearish (${SCORE.toFixed(2)}) but lagging — leading indicators (9:15 + A/D + futures) all bullish. Trust futures: trade long.`;
    } else if (leading > 0) {
      signal = 'WAIT';
      reason = `Score bearish (${SCORE.toFixed(2)}) but futures + leading score bullish. 9:15 not fully confirming — wait for alignment.`;
    } else {
      signal = 'WAIT';
      reason = `Score bearish (${SCORE.toFixed(2)}) but index futures lean bullish (NIFTY ${futW(i.n50Fut)}, BANK NIFTY ${futW(i.bnFut)}). Conflicting signals — no trade.`;
    }
  }

  // 9:15 pattern cross-check
  if ((signal === 'BUY' || signal === 'STRONG BUY') && ts.outcome === 'Sell') {
    signal = 'WAIT';
    reason = 'Score bullish but 9:15 index pattern says Sell. Wait for alignment.';
  } else if ((signal === 'SELL' || signal === 'STRONG SELL') && ts.outcome === 'Buy') {
    signal = 'WAIT';
    reason = 'Score bearish but 9:15 index pattern says Buy. Wait for alignment.';
  }
  return { signal, reason, tradeSignal: ts };
}
