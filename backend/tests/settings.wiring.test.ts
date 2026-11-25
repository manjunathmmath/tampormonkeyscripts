import { describe, it, expect } from 'vitest';
import { nearestFuture, setMcxFutureExpiryPref } from '../src/marketdata/futures.js';
import { OptionChainService } from '../src/marketdata/optionChain.js';
import { InstrumentBook, parseInstrumentsCsv } from '../src/instruments/book.js';
import type { Candle } from '../src/kite/client.js';

const D = '2026-11-20';
const c = (hm: string, o: number, h: number, l: number, cl: number, v: number, oi?: number): Candle => (oi === undefined ? [`${D}T${hm}:00+0530`, o, h, l, cl, v] : [`${D}T${hm}:00+0530`, o, h, l, cl, v, oi]);

const CSV = [
  'instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange',
  '9001,1,GOLDM26NOVFUT,"GOLDM",0,2026-11-30,0,1,1,FUT,MCX-FUT,MCX',
  '9002,1,GOLDM26DECFUT,"GOLDM",0,2026-12-04,0,1,1,FUT,MCX-FUT,MCX',
  ...[24000, 24050, 24100].flatMap((s) => [`${s * 10 + 1},1,N1${s}CE,"NIFTY",0,2026-11-24,${s},0.05,75,CE,NFO-OPT,NFO`, `${s * 10 + 2},1,N1${s}PE,"NIFTY",0,2026-11-24,${s},0.05,75,PE,NFO-OPT,NFO`, `${s * 10 + 3},1,N2${s}CE,"NIFTY",0,2026-12-01,${s},0.05,75,CE,NFO-OPT,NFO`, `${s * 10 + 4},1,N2${s}PE,"NIFTY",0,2026-12-01,${s},0.05,75,PE,NFO-OPT,NFO`]),
].join('\n');

describe('settings reach the engines', () => {
  const book = new InstrumentBook(parseInstrumentsCsv(CSV), D);

  it('a commodity futures expiry setting picks that contract, blank is the nearest', () => {
    setMcxFutureExpiryPref(null);
    expect(nearestFuture(book, 'GOLDM', D)?.expiry).toBe('2026-11-30');
    setMcxFutureExpiryPref((n) => (n === 'GOLDM' ? '2026-12-04' : undefined));
    expect(nearestFuture(book, 'GOLDM', D)?.expiry).toBe('2026-12-04');
    setMcxFutureExpiryPref(() => '2030-01-01'); // not listed: falls back
    expect(nearestFuture(book, 'GOLDM', D)?.expiry).toBe('2026-11-30');
    setMcxFutureExpiryPref(null);
  });

  const mk = (opts: { expiryPref?: (u: string, m: boolean) => string | undefined; anchor?: () => 'ltp' | 'open' }) => {
    const history = {
      candles: async (q: { token: number; interval: string }) => {
        if (q.token === 256265) return [c('09:15', 24000, 24060, 23990, 24010, 0), c('09:20', 24010, 24130, 24000, 24120, 0)];
        if (q.interval === 'day') return [[`2026-11-19T00:00:00+0530`, 50, 50, 50, 50, 10, 1000000] as Candle];
        return [c('09:15', 50, 52, 49, 51, 200000, 1500000)];
      },
    };
    return new OptionChainService({ history, book: () => book, tokens: () => ({ 'NIFTY 50': 256265 }), now: () => Date.parse(`${D}T11:00:00+05:30`), ...opts });
  };

  it('the NIFTY options expiry setting selects that expiry', async () => {
    expect((await mk({}).load({ name: 'NIFTY 50', day: D })).expiry).toBe('2026-11-24');
    expect((await mk({ expiryPref: (u) => (u === 'NIFTY' ? '2026-12-01' : undefined) }).load({ name: 'NIFTY 50', day: D })).expiry).toBe('2026-12-01');
  });

  it('the strike anchor setting: last price or day open', async () => {
    const ltp = await mk({ anchor: () => 'ltp' }).load({ name: 'NIFTY 50', day: D });
    const open = await mk({ anchor: () => 'open' }).load({ name: 'NIFTY 50', day: D });
    expect(ltp.anchorPrice).toBe(24120);
    expect(open.anchorPrice).toBe(24000);
  });
});
