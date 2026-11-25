/**
 * Strike levels and the 9:15 zone rule. Faithful port of `getStrikeDiff` / `getStrikeDetails` (utils.js) and the zone classification inside
 * `scanNineFifteenCandle` (grootTradeBot.js). Logic is unchanged on purpose; known oddities are recorded in docs/port-findings.md.
 */

/** Hand-maintained index steps (constants.js INDEX_NSE_STRIKE_DIFF). */
export const INDEX_STRIKE_DIFF: Record<string, string> = {
  'NIFTY 50': '50,50',
  'NIFTY MID SELECT': '25,25',
  'NIFTY FIN SERVICE': '50,50',
  'NIFTY BANK': '100,100',
  BANKEX: '100,100',
  SENSEX: '100,100',
  'GIFT NIFTY': '50,50',
};

/** Same default the userscript uses when a name has no strike step ("N,N" shaped on purpose). */
export const DEFAULT_STRIKE_DIFF = '100,100';

export type StrikeDiffMap = Record<string, string>;

/** `getStrikeDiff`: "strikeOne,strikeTwo" for a name, spaces removed; 100,100 when unknown. */
export function getStrikeDiff(name: string, map: StrikeDiffMap): { diff: string; known: boolean } {
  const v = map[name];
  if (v) return { diff: v.replace(/ /g, ''), known: true };
  return { diff: DEFAULT_STRIKE_DIFF, known: false };
}

export interface StrikeDetails {
  /** ASO: open + strikeOne */
  aso: number;
  /** AST: ASO + strikeTwo */
  ast: number;
  /** BSO: open - strikeOne */
  bso: number;
  /** BST: BSO - strikeTwo */
  bst: number;
}

const r2 = (n: number): number => parseFloat(n.toFixed(2));

/**
 * `getStrikeDetails`: levels from an anchor price. NOTE (kept as is): the step string is split on "," and each part read with parseInt, so a
 * single value such as "50" (no comma) gives strikeTwo = NaN and AST / BST become NaN. The userscript has the same behaviour.
 */
export function strikeDetails(price: number, diff: string): StrikeDetails {
  const parts = diff.split(',');
  const one = parseInt(parts[0] as string, 10);
  const two = parseInt(parts[1] as string, 10); // NaN when there is no second part
  const aso = price + one;
  const ast = aso + two;
  const bso = price - one;
  const bst = bso - two;
  return { aso: r2(aso), ast: r2(ast), bso: r2(bso), bst: r2(bst) };
}

export type Zone = 'AST' | 'ASO' | 'B/W' | 'BSO' | 'BST';

/** At-or-beyond a level counts as that zone (>= for AST/ASO, <= for BST/BSO), checked AST, ASO, BST, BSO in that order. */
export function classifyZone(close: number, l: StrikeDetails): Zone {
  if (close >= l.ast) return 'AST';
  if (close >= l.aso) return 'ASO';
  if (close <= l.bst) return 'BST';
  if (close <= l.bso) return 'BSO';
  return 'B/W';
}
