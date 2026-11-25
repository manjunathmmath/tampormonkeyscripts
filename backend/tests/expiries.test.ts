import { describe, expect, it } from 'vitest';
import { InstrumentBook, type Instrument } from '../src/instruments/book.js';
import { expiryOverview } from '../src/marketdata/expiries.js';

let tok = 1;
const row = (exchange: string, name: string, type: string, expiry: string, strike = 0): Instrument => ({ token: tok++, exchangeToken: 0, symbol: `${name}${expiry}${type}${strike}`, name, expiry, strike, tickSize: 0.05, lotSize: 75, type, segment: `${exchange}-${type === 'FUT' ? 'FUT' : 'OPT'}`, exchange });
const book = new InstrumentBook([
  row('NFO', 'NIFTY', 'FUT', '2026-12-29'),
  ...['2026-12-01', '2026-12-08'].flatMap((e) => [row('NFO', 'NIFTY', 'CE', e, 25000), row('NFO', 'NIFTY', 'PE', e, 25000)]),
  row('NFO', 'HDFCBANK', 'FUT', '2026-12-29'), row('NFO', 'HDFCBANK', 'CE', '2026-12-29', 800), row('NFO', 'RELIANCE', 'FUT', '2026-12-29'),
  row('MCX', 'GOLDM', 'FUT', '2026-12-04'), row('MCX', 'GOLDM', 'CE', '2026-12-26', 125000),
], '2026-11-24');
const base = { today: '2026-11-24', nseDay: '2026-11-23', mcxDay: '2026-11-23', mcxNames: ['GOLDM'], pref: () => undefined as string | undefined };

describe('expiry overview', () => {
  it('lists each underlying\'s futures and option expiries and the one in use', () => {
    const v = expiryOverview(book, base);
    const n = v.indices.find((r) => r.name === 'NIFTY')!;
    expect(n.futures.map((c) => c.expiry)).toEqual(['2026-12-29']);
    expect(n.options.map((c) => [c.expiry, c.contracts])).toEqual([['2026-12-01', 2], ['2026-12-08', 2]]);
    expect(n.usedOptions).toBe('2026-12-01'); // nothing earlier is listed: a past day falls to the next expiry
    expect(n.source).toBe('nearest');
    expect(v.mcx[0]!.usedOptions).toBe('2026-12-26');
    expect(v.listDay).toBe('2026-11-24');
  });
  it('summarises the stocks, which share their expiries, and honours a Settings expiry', () => {
    const v = expiryOverview(book, { ...base, pref: (u) => (u === 'NIFTY' ? '2026-12-08' : undefined) });
    expect(v.stocks.count).toBe(2);
    expect(v.stocks.futures).toEqual([{ expiry: '2026-12-29', contracts: 2, symbol: expect.any(String) }]);
    expect(v.indices.find((r) => r.name === 'NIFTY')!.usedOptions).toBe('2026-12-08');
    expect(v.indices.find((r) => r.name === 'NIFTY')!.source).toBe('settings');
  });
  it('looks up one name', () => {
    const v = expiryOverview(book, { ...base, name: 'reliance' });
    expect(v.one?.name).toBe('RELIANCE');
    expect(v.one?.options).toEqual([]);
  });
});
