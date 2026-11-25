import { describe, it, expect } from 'vitest';
import { OrderFlowService } from '../src/marketdata/orderFlow.js';
import type { Instrument, InstrumentBook } from '../src/instruments/book.js';
import type { Tick } from '../src/marketdata/ticks.js';

const fut: Instrument = { token: 500, exchangeToken: 5, symbol: 'NIFTY26NOVFUT', name: 'NIFTY', expiry: '2026-11-26', strike: 0, tickSize: 0.05, lotSize: 75, type: 'FUT', segment: 'NFO-FUT', exchange: 'NFO' };
const book = { futures: (ex: string, u: string) => (ex === 'NFO' && u === 'NIFTY' ? [fut] : []) } as unknown as InstrumentBook;
const tick = (token: number, buy: number, sell: number): Tick => ({ token, ltp: 1, open: 1, high: 1, low: 1, close: 1, change: 0, volume: 1, tradable: true, totalBuyQty: buy, totalSellQty: sell, depth: undefined, avgPrice: 0, oi: 0, oiHigh: 0, oiLow: 0, ts: 0 }) as unknown as Tick;

describe('OrderFlowService', () => {
  it('subscribes on the first request, then reads the totals; an index uses its futures contract', () => {
    const subs: number[] = [];
    let now = 1_000_000;
    const svc = new OrderFlowService({ book: () => book, tokens: () => ({ RELIANCE: 11 }), subscribe: (t) => subs.push(t), now: () => now });
    expect(svc.read('NIFTY 50', '2026-11-20')).toBeNull();
    expect(subs).toEqual([500]);
    svc.record([tick(500, 700, 300), tick(11, 100, 100)], now);
    now += 5000;
    const a = svc.read('NIFTY 50', '2026-11-20')!;
    expect(a.dir).toBe(1);
    expect(a.label).toBe('Buy-heavy order flow (futures)');
    expect(a.imb).toBeCloseTo(0.4, 10);
    expect(a.ageSec).toBe(5);
    const b = svc.read('RELIANCE', '2026-11-20')!;
    expect(b.dir).toBe(0);
    expect(b.label).toBe('Order flow balanced');
    expect(svc.read('UNKNOWN', '2026-11-20')).toBeNull();
  });

  it('ignores packets without totals and an empty book', () => {
    const svc = new OrderFlowService({ book: () => book, tokens: () => ({ RELIANCE: 11 }), subscribe: () => undefined });
    svc.record([{ token: 11, ltp: 1 } as unknown as Tick, tick(11, 0, 0)]);
    expect(svc.read('RELIANCE', '2026-11-20')).toBeNull();
  });
});
