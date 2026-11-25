import { describe, it, expect } from 'vitest';
import { MarketService } from '../src/marketdata/market.js';
import { InstrumentBook } from '../src/instruments/book.js';

const D = '2026-11-20';
const c = (hm: string, o: number, h: number, l: number, cl: number, v = 0, oi?: number) => [`${D}T${hm}:00+0530`, o, h, l, cl, v, ...(oi === undefined ? [] : [oi])];

const book = {
  rows: [{ type: 'FUT', exchange: 'NFO', name: 'AAA', token: 501, symbol: 'AAAFUT', expiry: '2026-11-26', lotSize: 100, segment: 'NFO-FUT' }],
  futures: (_e: string, u: string) => (u === 'AAA' ? [{ token: 501, symbol: 'AAAFUT', expiry: '2026-11-26', lotSize: 100 }] : []),
} as unknown as InstrumentBook;

const scoreOf = (total: number) => ({ score: { total, oi_obv: 5, max_pain: 1, iv_skew: 0, futures_trend: 1 }, trend: { trends: ['ASO'], ltp: 24100, vixUpper: 24400, vixLower: 23600 } }) as never;

describe('market service', () => {
  const mk = (over: Record<string, unknown> = {}) =>
    new MarketService({
      history: {
        candles: async (q) => {
          if (q.token === 1) return [c('09:15', 100, 101, 99, 100), c('09:20', 100, 106, 100, 105), c('09:25', 105, 108, 104, 107)] as never; // AAA spot: opens 100, steps 50/50 default
          if (q.token === 501 && q.interval === 'day') return [c('00:00', 100, 102, 98, 100, 90000, 2000000)] as never;
          if (q.token === 501) return [c('09:15', 100, 101, 99, 100.5, 5000, 2100000), c('09:20', 100.5, 103, 100.4, 102.8, 8000, 2150000)] as never;
          return [] as never;
        },
      },
      book: () => book,
      tokens: () => ({ AAA: 1 }),
      strikeDiffs: () => ({ AAA: '2,2' }),
      zones: () => ({ 'NIFTY 50': 'ASO', SENSEX: 'ASO', 'NIFTY BANK': 'ASO', AAA: 'AST' }),
      weights: () => ({ full: { 'NIFTY 50': {}, 'NIFTY BANK': {} }, nifty50: ['AAA'], bank: [], top10: { 'NIFTY 50': { AAA: 10 }, 'NIFTY BANK': {} }, asOf: null, error: null }),
      score: { load: async () => scoreOf(2) },
      ...over,
    });

  it('builds the composite score and the market signal from the parts, counting each stock candle against its own ASO / BSO', async () => {
    const r = await mk().load({ day: D });
    // AAA: open 100, ASO 102: closes 100 (inside), 105 and 107 (advances) -> A/D score +1 for all and for the NIFTY 50 list
    expect(r.parts.ad).toEqual({ all: 1, nifty50: 1, bank: 0 });
    expect(r.parts.nine15.nifty50).toBe(1);
    expect(r.parts.nine15.all).toBe(1); // only AST / ASO closes among the scanned names
    expect(r.parts.component.nifty50).toBe(0.2); // score 2 x weight 10%
    expect(r.parts.oiObv.every((x) => x === 3)).toBe(true); // raw 5 is capped at 3
    expect(r.coverage).toMatchObject({ adStocks: 1, futuresStocks: 1, components: 1 });
    expect(typeof r.score).toBe('number');
    expect(['STRONG BUY', 'BUY', 'WAIT', 'SIDEWAYS', 'SELL', 'STRONG SELL', 'NO TRADE']).toContain(r.signal.signal);
  });

  it('a stock whose history cannot be read is left out and listed, and a missing index-weights file is reported', async () => {
    const r = await mk({ history: { candles: async () => { throw new Error('kite down'); } }, weights: () => null }).load({ day: D });
    expect(r.skipped).toContain('AAA');
    expect(r.missing).toContain('index weights');
    expect(r.parts.ad.all).toBe(0);
  });
});
