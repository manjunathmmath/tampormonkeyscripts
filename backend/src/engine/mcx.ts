/**
 * Commodity (MCX) day levels: port of the maths in `showTopChartMCX` and the MCX branch of `computeInstrumentScore` (commodities.js, grootTradeBot.js).
 * MCX names have no cash spot, so the futures contract is the price; the 9:15 levels are the first candle's open +- the commodity's own strike steps; the
 * expected daily range uses the commodity's CBOE volatility index (OVX crude, GVZ gold, VXSLV silver, the CBOE VIX proxy for the rest, 4.85 for USD/INR).
 */
export const MCX_FUTURE_STRIKE_DIFF: Record<string, string> = {
  CRUDEOIL: '50,50',
  CRUDEOILM: '50,50',
  GOLD: '500,500',
  GOLDM: '500,500',
  NATGASMINI: '5,5',
  NATURALGAS: '5,5',
  SILVER: '500,500',
  SILVERM: '500,500',
  USDINR: '0.25,0.25',
};

export type VolKey = 'OVX' | 'GVZ' | 'VXSLV' | 'VIX' | 'FIXED';

/** which volatility index a commodity uses (`showTopChartMCX`); the CBOE VIX is the proxy for everything without its own */
export function volKeyFor(name: string): VolKey {
  if (name === 'CRUDEOIL' || name === 'CRUDEOILM') return 'OVX';
  if (name === 'GOLDM' || name === 'GOLD') return 'GVZ';
  if (name === 'SILVER' || name === 'SILVERM') return 'VXSLV';
  if (name === 'USDINR') return 'FIXED';
  return 'VIX';
}

/** the strike step the option chain really uses: the most common gap between consecutive strikes (Data Load derives it the same way, and it wins over the hand-kept constant) */
export function dominantGap(strikes: number[]): number | null {
  const s = [...new Set(strikes.filter((x) => Number.isFinite(x)))].sort((a, b) => a - b);
  const counts = new Map<number, number>();
  for (let i = 1; i < s.length; i++) {
    const g = Math.round((s[i]! - s[i - 1]!) * 100) / 100;
    if (g > 0) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let best: number | null = null;
  let n = 0;
  for (const [g, c] of counts) if (c > n) { best = g; n = c; }
  return best;
}

const r2 = (x: number): number => parseFloat(x.toFixed(2));

export interface McxStrikeMap {
  strikeDiff: number;
  bstrikeOne: number;
  bstrikeTwo: number;
  ustrikeOne: number;
  ustrikeTwo: number;
  vixDDUpper: number;
  vixDDLower: number;
}

/**
 * `showTopChartMCX`: levels from the open, the expected-range band from the previous close. `vol` is the volatility index value in percent; a missing / zero
 * value falls back to `vixProxy` (the CBOE VIX), as the userscript does so the band never collapses to zero width.
 */
export function strikeMap(name: string, open: number, prevClose: number, vol: number | null | undefined, vixProxy: number | null | undefined, derivedDiff?: string | null): McxStrikeMap {
  const diff = (derivedDiff ?? MCX_FUTURE_STRIKE_DIFF[name] ?? '100,100').split(',');
  const one = parseFloat(diff[0]!);
  const two = parseFloat(diff[1]!);
  const key = volKeyFor(name);
  let v = key === 'FIXED' ? 4.85 : vol ?? 0;
  if (!(v > 0)) v = vixProxy ?? 0;
  const u1 = open + one;
  const u2 = u1 + two;
  const b1 = open - one;
  const b2 = b1 - two;
  const range = (prevClose * (v / Math.sqrt(365 - 104 - 15))) / 100;
  return {
    strikeDiff: r2(parseFloat(diff[0]!)),
    bstrikeOne: r2(b1),
    bstrikeTwo: r2(b2),
    ustrikeOne: r2(u1),
    ustrikeTwo: r2(u2),
    vixDDUpper: r2(prevClose + range),
    vixDDLower: r2(prevClose - range),
  };
}

export type McxZone = 'AST' | 'ASO' | 'B/W' | 'BSO' | 'BST';

/** the 9:15 zone: the first candle's close against the levels (at-or-beyond rule) */
export function zone915(close: number, m: McxStrikeMap): McxZone {
  if (close >= m.ustrikeTwo) return 'AST';
  if (close >= m.ustrikeOne) return 'ASO';
  if (close <= m.bstrikeTwo) return 'BST';
  if (close <= m.bstrikeOne) return 'BSO';
  return 'B/W';
}

/** the price-vs-levels score of a commodity (`computeInstrumentScore`, MCX branch): +2 / +1 / -1 / -2 */
export function trendScore(px: number, m: McxStrikeMap): number {
  if (px >= m.ustrikeTwo) return 2;
  if (px >= m.ustrikeOne) return 1;
  if (px <= m.bstrikeTwo) return -2;
  if (px <= m.bstrikeOne) return -1;
  return 0;
}

/** the flags a trend carries, in the NSE shape ('AST' 'ASO' 'BSO' 'BST' that the price is at or beyond) */
export function trendFlags(px: number, m: McxStrikeMap): string[] {
  const out: string[] = [];
  if (px >= m.ustrikeOne) out.push('ASO');
  if (px >= m.ustrikeTwo) out.push('AST');
  if (px <= m.bstrikeOne) out.push('BSO');
  if (px <= m.bstrikeTwo) out.push('BST');
  return out;
}
