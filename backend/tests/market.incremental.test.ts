import { describe, it, expect } from 'vitest';
import { MarketService } from '../src/marketdata/market.js';
import { InstrumentBook } from '../src/instruments/book.js';
import type { Candle } from '../src/kite/client.js';

const D = '2026-11-20';
const c = (hm: string, o: number, h: number, l: number, cl: number, v = 0, oi?: number): Candle => [`${D}T${hm}:00+0530`, o, h, l, cl, v, ...(oi === undefined ? [] : [oi])] as unknown as Candle;
const book = {
  rows: [{ type: 'FUT', exchange: 'NFO', name: 'AAA', token: 501, symbol: 'AAAFUT', expiry: '2026-11-26', lotSize: 100, segment: 'NFO-FUT' }],
  futures: (_e: string, u: string) => (u === 'AAA' ? [{ token: 501, symbol: 'AAAFUT', expiry: '2026-11-26', lotSize: 100 }] : []),
} as unknown as InstrumentBook;
const scoreOf = { score: { total: 2, oi_obv: 5, max_pain: 1, iv_skew: 0, futures_trend: 1 }, trend: { trends: ['ASO'], ltp: 24100, vixUpper: 24400, vixLower: 23600 } } as never;

describe('market service: load once, then one calculation per 5-minute slot', () => {
  const mk = (clock: { t: number }) => {
    const calls: string[] = [];
    const ticked = new Map<number, Candle[]>();
    const svc = new MarketService({
      history: {
        candles: async (q) => {
          calls.push(`${q.token}|${q.interval}`);
          if (q.token === 1) return [c('09:15', 100, 101, 99, 100), c('09:20', 100, 106, 100, 105)];
          if (q.token === 501 && q.interval === 'day') return [c('00:00', 100, 102, 98, 100, 90000, 2000000)];
          if (q.token === 501) return [c('09:15', 100, 101, 99, 100.5, 5000, 2100000), c('09:20', 100.5, 103, 100.4, 102.8, 8000, 2150000)];
          return [];
        },
      },
      book: () => book,
      tokens: () => ({ AAA: 1 }),
      strikeDiffs: () => ({ AAA: '2,2' }),
      zones: () => ({ AAA: 'AST' }),
      weights: () => ({ full: { 'NIFTY 50': {}, 'NIFTY BANK': {} }, nifty50: ['AAA'], bank: [], top10: { 'NIFTY 50': {}, 'NIFTY BANK': {} }, asOf: null, error: null }),
      score: { load: async () => scoreOf },
      now: () => clock.t,
      live: {
        candles: (t) => ticked.get(t),
        watch: (t, _oi, seed) => {
          if (!ticked.has(t)) ticked.set(t, [...seed]);
        },
      },
    });
    return { svc, calls, ticked };
  };

  it('a second request in the same slot makes no history call at all, and concurrent requests share one run', async () => {
    const clock = { t: Date.parse(`${D}T10:02:00+05:30`) };
    const { svc, calls } = mk(clock);
    const [a, b] = await Promise.all([svc.load({ day: D }), svc.load({ day: D })]);
    expect(a).toBe(b);
    const first = calls.length;
    expect(first).toBe(4); // spot + futures 5-minute + the futures previous-day candle + the stock previous close (breadth), once
    clock.t += 60_000; // 10:03, same slot
    await svc.load({ day: D });
    expect(calls.length).toBe(first);
  });

  it('the next slot reads the tick-built candles: no more history calls, and the new candle is counted', async () => {
    const clock = { t: Date.parse(`${D}T10:02:00+05:30`) };
    const { svc, calls, ticked } = mk(clock);
    const r1 = await svc.load({ day: D });
    const after = calls.length;
    // the ticker has since built a new spot candle (a close above the stock's ASO)
    ticked.get(1)!.push(c('09:25', 105, 109, 104, 108));
    clock.t = Date.parse(`${D}T10:07:00+05:30`); // the next slot
    const r2 = await svc.load({ day: D });
    expect(calls.length).toBe(after); // no new REST request
    expect(r2).not.toBe(r1);
    expect(r2.coverage.adStocks).toBe(1);
  });

  it('a snapshot time or a past day is cached for good (it can never change)', async () => {
    const clock = { t: Date.parse(`${D}T10:02:00+05:30`) };
    const { svc, calls } = mk(clock);
    await svc.load({ day: D, asOf: '09:25' });
    const n = calls.length;
    clock.t += 3_600_000;
    await svc.load({ day: D, asOf: '09:25' });
    expect(calls.length).toBe(n);
  });
});
