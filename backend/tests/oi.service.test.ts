import { describe, it, expect } from 'vitest';
import { OiService } from '../src/marketdata/oi.js';
import { OptionChainService } from '../src/marketdata/optionChain.js';
import { InstrumentBook, parseInstrumentsCsv } from '../src/instruments/book.js';
import type { Candle } from '../src/kite/client.js';

const D = '2026-11-20';
const P = '2026-11-19';
const c = (day: string, hm: string, o: number, h: number, l: number, cl: number, v: number, oi?: number): Candle => (oi === undefined ? [`${day}T${hm}:00+0530`, o, h, l, cl, v] : [`${day}T${hm}:00+0530`, o, h, l, cl, v, oi]);

const strikes = [23900, 23950, 24000, 24050, 24100, 24150, 24200];
const CSV = [
  'instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange',
  ...strikes.flatMap((s) => [`${s * 10 + 1},1,NIFTY26N24${s}CE,"NIFTY",0,2026-11-24,${s},0.05,75,CE,NFO-OPT,NFO`, `${s * 10 + 2},1,NIFTY26N24${s}PE,"NIFTY",0,2026-11-24,${s},0.05,75,PE,NFO-OPT,NFO`]),
].join('\n');

describe('OI service', () => {
  it('derives the score, walls, max pain and per-strike labels from a chain', async () => {
    const book = new InstrumentBook(parseInstrumentsCsv(CSV), D);
    const history = {
      candles: async (q: { token: number; interval: string; oi?: boolean }) => {
        if (q.token === 256265) {
          if (q.interval === 'day') return [c(P, '00:00', 24000, 24050, 23950, 24000, 0)]; // previous close 24000
          return [c(D, '09:15', 24020, 24060, 24010, 24040, 0), c(D, '09:20', 24040, 24070, 24030, 24044, 0)];
        }
        const isCE = q.token % 10 === 1;
        if (q.interval === 'day') return [c(P, '00:00', 50, 50, 50, 50, 10, 1000000)];
        // call OI grows and call price falls (call writing); put OI grows and put price falls (put writing)
        return [c(D, '09:15', 50, 52, 49, 50, 200000, 1500000), c(D, '09:20', 50, 50, 44, isCE ? 45 : 44, 300000, 1900000)];
      },
    };
    const chains = new OptionChainService({ history, book: () => book, tokens: () => ({ 'NIFTY 50': 256265 }), now: () => Date.parse(`${D}T11:00:00+05:30`) });
    const oi = new OiService({ chains, history, tokens: () => ({ 'NIFTY 50': 256265 }) });
    const r = await oi.analyse({ name: 'NIFTY 50', day: D });
    expect(r.prevClose).toBe(24000);
    expect(r.ltp).toBe(24044);
    expect(r.changePct).toBe(0.18); // (24044 - 24000) / 24000 = 0.1833%
    expect(r.spot).toBe(24050); // the ATM row
    expect(r.rows).toHaveLength(7);
    // every strike has CE and PE writing (OI up, OBV down): the labels say so
    expect(r.rows.every((x) => x.ceLabel === 'CE WRITE' && x.peLabel === 'PE WRITE')).toBe(true);
    expect(r.walls.resistance.length + r.walls.support.length).toBeGreaterThan(0);
    expect(typeof r.oiScore).toBe('number');
    expect(r.maxPain?.maxPainK).toBeGreaterThan(0);
    expect(r.pcr).toBe('1.00');
    expect([1, 0, -1]).toContain(r.maxPainScore);
  });
});
