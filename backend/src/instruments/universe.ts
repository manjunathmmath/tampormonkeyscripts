import type { InstrumentBook } from './book.js';

/** The app's own index list (constants.js INDICES). */
export const INDICES = ['NIFTY 50', 'NIFTY BANK', 'NIFTY FIN SERVICE', 'NIFTY MID SELECT', 'BANKEX', 'SENSEX', 'GIFT NIFTY', 'INDIA VIX'];

/** Kite's underlying code of the indices that have derivatives (dataLoad.js _DL_INDEX_CODES). */
export const INDEX_CODES = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX']);

/** F&O stock symbols: underlyings of NFO futures that are not index codes (dataLoad.js _dlFoStockSymbolsFromInstruments). */
export function foStockSymbols(book: InstrumentBook): string[] {
  const seen = new Set<string>();
  for (const r of book.rows) {
    if (r.type !== 'FUT' || r.exchange !== 'NFO' || !r.name) continue;
    if (INDEX_CODES.has(r.name)) continue;
    seen.add(r.name);
  }
  return [...seen].sort();
}

/**
 * INSTRUMENT_TOKENS: F&O stocks (NSE cash EQ rows) plus only the app's own indices. `extraFoSymbols` is the NSE strike-step file's symbol list,
 * unioned in like the userscript does, so a symbol counts as F&O if either source says so.
 */
export function buildUniverse(book: InstrumentBook, extraFoSymbols: string[] = []): Record<string, number> {
  const fo = new Set([...foStockSymbols(book), ...extraFoSymbols.filter((s) => !INDEX_CODES.has(s))]);
  const idx = new Set(INDICES);
  const out: Record<string, number> = {};
  for (const r of book.rows) {
    if (r.exchange === 'NSE' && r.segment === 'NSE' && r.type === 'EQ' && fo.has(r.symbol)) out[r.symbol] = r.token;
    else if (r.segment === 'INDICES' && idx.has(r.symbol)) out[r.symbol] = r.token;
  }
  return out;
}
