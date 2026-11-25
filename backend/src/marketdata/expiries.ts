import type { Instrument, InstrumentBook } from '../instruments/book.js';
import { resolveExpiry } from '../engine/optionChain.js';

export interface ExpiryChip { expiry: string; contracts: number; symbol?: string }
export interface ExpiryRow {
  name: string;
  exchange: string;
  lot: number | null;
  futures: ExpiryChip[];
  options: ExpiryChip[];
  /** the expiry the app uses now for this underlying (Settings, else the nearest on or after the day shown) */
  usedOptions: string | null;
  usedFutures: string | null;
  source: 'settings' | 'nearest' | null;
}
export interface ExpiryView {
  today: string;
  nseDay: string;
  mcxDay: string;
  /** the date of the instrument list: Kite drops a contract once it has expired */
  listDay: string | null;
  indices: ExpiryRow[];
  mcx: ExpiryRow[];
  stocks: { count: number; futures: ExpiryChip[]; options: ExpiryChip[]; usedOptions: string | null; usedFutures: string | null; source: 'settings' | 'nearest' | null };
  one: ExpiryRow | null;
}

const INDEX_NAMES: [string, 'NFO' | 'BFO'][] = [['NIFTY', 'NFO'], ['BANKNIFTY', 'NFO'], ['FINNIFTY', 'NFO'], ['MIDCPNIFTY', 'NFO'], ['SENSEX', 'BFO'], ['BANKEX', 'BFO']];

function chips(rows: Instrument[], type: 'FUT' | 'OPT'): ExpiryChip[] {
  const by = new Map<string, { n: number; symbol?: string }>();
  for (const r of rows) {
    if (type === 'FUT' ? r.type !== 'FUT' : r.type !== 'CE' && r.type !== 'PE') continue;
    const e = by.get(r.expiry) ?? { n: 0 };
    e.n++;
    if (type === 'FUT') e.symbol = r.symbol;
    by.set(r.expiry, e);
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([expiry, v]) => ({ expiry, contracts: v.n, ...(v.symbol ? { symbol: v.symbol } : {}) }));
}

/** Every futures and options expiry the instrument list holds, by underlying, with the one the app uses now. Listed contracts only: an expired one is gone from Kite's list. */
export function expiryOverview(book: InstrumentBook, o: { today: string; nseDay: string; mcxDay: string; mcxNames: string[]; pref: (underlying: string, mcx: boolean) => string | undefined; name?: string }): ExpiryView {
  const rowFor = (name: string, exchange: string, day: string, mcx: boolean): ExpiryRow => {
    const all = [...book.futures(exchange, name), ...book.options(exchange, name)];
    const fut = chips(all, 'FUT');
    const opt = chips(all, 'OPT');
    const pref = o.pref(name, mcx);
    const optList = opt.map((c) => c.expiry);
    const usedO = optList.length ? resolveExpiry(pref ?? '', optList, day) ?? null : null;
    const usedF = fut.find((c) => c.expiry >= day)?.expiry ?? fut[0]?.expiry ?? null;
    return { name, exchange, lot: all[0]?.lotSize ?? null, futures: fut, options: opt, usedOptions: usedO, usedFutures: usedF, source: usedO ? (pref && pref === usedO ? 'settings' : 'nearest') : null };
  };
  const indices = INDEX_NAMES.map(([n, ex]) => rowFor(n, ex, o.nseDay, false)).filter((r) => r.futures.length || r.options.length);
  const mcx = o.mcxNames.map((n) => rowFor(n, 'MCX', o.mcxDay, true)).filter((r) => r.futures.length || r.options.length);
  // every other underlying on NFO is a stock: they share their expiries, so they are summarised
  const idx = new Set(INDEX_NAMES.map(([n]) => n));
  const stockRows = book.rows.filter((r) => r.exchange === 'NFO' && (r.type === 'FUT' || r.type === 'CE' || r.type === 'PE') && !idx.has(r.name));
  const stockNames = new Set(stockRows.map((r) => r.name));
  const sFut = chips(stockRows, 'FUT');
  const sOpt = chips(stockRows, 'OPT');
  const pref = o.pref('STOCK', false);
  const sOptList = sOpt.map((c) => c.expiry);
  const usedO = sOptList.length ? resolveExpiry(pref ?? '', sOptList, o.nseDay) ?? null : null;
  const stocks = { count: stockNames.size, futures: sFut.map((c) => ({ ...c, contracts: stockRows.filter((r) => r.type === 'FUT' && r.expiry === c.expiry).length })), options: sOpt, usedOptions: usedO, usedFutures: sFut.find((c) => c.expiry >= o.nseDay)?.expiry ?? null, source: (usedO ? (pref && pref === usedO ? 'settings' : 'nearest') : null) as 'settings' | 'nearest' | null };
  let one: ExpiryRow | null = null;
  if (o.name) {
    const nm = o.name.trim().toUpperCase();
    const hit = book.rows.find((r) => r.name.toUpperCase() === nm && (r.type === 'FUT' || r.type === 'CE' || r.type === 'PE'));
    if (hit) one = rowFor(hit.name, hit.exchange, hit.exchange === 'MCX' ? o.mcxDay : o.nseDay, hit.exchange === 'MCX');
  }
  return { today: o.today, nseDay: o.nseDay, mcxDay: o.mcxDay, listDay: book.day, indices, mcx, stocks, one };
}
