import { describe, it, expect } from 'vitest';
import { Refresher } from '../src/marketdata/refresh.js';
import { CurveService } from '../src/marketdata/curve.js';
import type { Instrument, InstrumentBook } from '../src/instruments/book.js';

describe('Refresher', () => {
  it('runs every registered function, survives one that throws, and records the time', () => {
    let t = 1000;
    const r = new Refresher(() => t);
    const hits: string[] = [];
    r.register('a', () => hits.push('a'));
    r.register('bad', () => {
      throw new Error('x');
    });
    r.register('b', () => hits.push('b'));
    expect(r.lastAt).toBeNull();
    t = 2000;
    const out = r.run();
    expect(hits).toEqual(['a', 'b']);
    expect(out).toEqual({ at: 2000, cleared: ['a', 'b'], failed: ['bad'] });
    expect(r.lastAt).toBe(2000);
  });
});

const fut = (symbol: string, expiry: string, token: number): Instrument => ({ token, exchangeToken: token, symbol, name: 'X', expiry, strike: 0, tickSize: 0.05, lotSize: 1, type: 'FUT', segment: 'NFO-FUT', exchange: 'NFO' });

describe('invalidate makes the next read recompute', () => {
  it('a cached curve is read again after invalidate()', async () => {
    const list = [fut('XNOV', '2026-11-26', 1), fut('XDEC', '2026-12-31', 2)];
    const book = { futures: (ex: string) => (ex === 'NFO' ? list : []) } as unknown as InstrumentBook;
    let calls = 0;
    const svc = new CurveService({
      book: () => book,
      history: {
        candles: async () => {
          calls++;
          return [['2026-11-20T09:15:00+0530', 1, 1, 1, 1, 1, 0]] as never;
        },
      },
    });
    await svc.load({ name: 'X', day: '2026-11-20' });
    const first = calls;
    await svc.load({ name: 'X', day: '2026-11-20' });
    expect(calls).toBe(first); // served from the copy
    svc.invalidate();
    await svc.load({ name: 'X', day: '2026-11-20' });
    expect(calls).toBeGreaterThan(first);
  });
});
