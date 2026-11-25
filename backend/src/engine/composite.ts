/**
 * The composite score of `setScore` (grootTradeBot.js): the sum of the 9:15, advance / decline and futures trend scores (the leading parts) and, unless
 * "Include lagging" is switched off, the OI/OBV (capped at +-3 each), max pain, IV skew and component scores, rounded to 2 decimals.
 */
export interface CompositeParts {
  nine15: { all: number; nifty50: number; bank: number; gift: number; sensex: number; reliance: number; hdfcbank: number };
  ad: { all: number; nifty50: number; bank: number };
  fut: { all: number; nifty50: number; bank: number };
  /** per instrument: NIFTY 50, NIFTY BANK, RELIANCE, HDFCBANK, ICICIBANK */
  oiObv: number[];
  maxPain: number[];
  ivSkew: number[];
  component: { nifty50: number; bank: number };
}

const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);

/** The leading part of the score (9:15 + advance / decline + futures), which `getMarketSignal` uses to decide whether futures or the score is lagging. */
export function leadingScore(p: CompositeParts): number {
  const n = p.nine15;
  return n.all + n.nifty50 + n.bank + n.gift + n.sensex + n.reliance + n.hdfcbank + p.ad.all + p.ad.nifty50 + p.ad.bank + p.fut.all + p.fut.nifty50 + p.fut.bank;
}

export function compositeScore(p: CompositeParts, includeLagging = true): number {
  let score = leadingScore(p);
  if (includeLagging) score += sum(p.oiObv) + sum(p.maxPain) + sum(p.ivSkew) + p.component.nifty50 + p.component.bank;
  return parseFloat(score.toFixed(2));
}
