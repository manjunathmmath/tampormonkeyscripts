import { describe, it, expect } from 'vitest';
import { PositionalService } from '../src/marketdata/positional.js';
import type { Instrument, InstrumentBook } from '../src/instruments/book.js';
import type { Candle } from '../src/kite/client.js';

const day = '2026-11-20';
const date = (i: number): string => new Date(Date.parse('2024-01-01T00:00:00Z') + i * 86400000).toISOString().slice(0, 10);

/** a smooth uptrend of 420 sessions ending on `day`'s previous date, plus the day itself */
const rising = (n: number, start: number, step: number): Candle[] =>
  Array.from({ length: n }, (_, i) => {
    const c = start + step * i;
    return [`${i === n - 1 ? day : date(i)}T00:00:00+0530`, c - 0.2, c + 0.8, c - 0.8, c, 10000, 50000 + i * 100] as Candle;
  });

const fut = (symbol: string, expiry: string, token: number): Instrument => ({ token, exchangeToken: token, symbol, name: 'ABC', expiry, strike: 0, tickSize: 0.05, lotSize: 100, type: 'FUT', segment: 'NFO-FUT', exchange: 'NFO' });
const futs = [fut('ABC26NOVFUT', '2026-11-26', 11), fut('ABC26DECFUT', '2026-12-31', 12)];
const book = { futures: (ex: string, u: string) => (ex === 'NFO' && u === 'ABC' ? futs : []) } as unknown as InstrumentBook;

const mk = () =>
  new PositionalService({
    book: () => book,
    tokens: () => ({ ABC: 1, 'NIFTY 50': 2 }),
    history: {
      candles: async (q) => {
        if (q.interval !== 'day') return [];
        if (q.token === 1) return rising(420, 100, 0.5);
        if (q.token === 2) return rising(420, 20000, 3);
        if (q.token === 11) return rising(15, 200, 1);
        if (q.token === 12) return rising(15, 203, 1);
        return [];
      },
    },
  });

describe('PositionalService', () => {
  it('scans a smoothly rising stock: confirmed Stage 2, a plan, conviction, timing and the market view', async () => {
    const svc = mk();
    expect(svc.get()).toBeNull();
    svc.start({ day, names: ['ABC'] });
    for (let i = 0; i < 100 && svc.get()!.running; i++) await new Promise((r) => setTimeout(r, 20));
    const st = svc.get()!;
    expect(st.running).toBe(false);
    expect(st.done).toBe(1);
    const row = st.rows.find((r) => r.name === 'ABC')!;
    expect(row).toBeTruthy();
    expect(row.primary?.dir).toBeGreaterThan(0);
    expect(row.verdict).toMatch(/BUY|LONG forming/);
    expect(row.entry).not.toBeNull();
    expect(row.stop!).toBeLessThan(row.entry!);
    expect(row.target!).toBeGreaterThan(row.entry!);
    expect(row.convictionPct).toBeGreaterThan(40);
    expect(row.since).not.toBeNull();
    expect(row.stats?.days).toBeGreaterThan(100);
    expect(st.market.niftyStats).not.toBeNull();
  });

  it('names: the dashboard scope is the two indices plus the live top-10, a missing token is skipped', async () => {
    const svc = new PositionalService({ book: () => book, tokens: () => ({}), history: { candles: async () => [] }, dashboardNames: () => ['A', 'B'] });
    expect(svc.names('dashboard')).toEqual(['NIFTY 50', 'NIFTY BANK', 'A', 'B']);
    svc.start({ day, names: ['NOPE'] });
    for (let i = 0; i < 50 && svc.get()!.running; i++) await new Promise((r) => setTimeout(r, 10));
    expect(svc.get()!.rows).toEqual([]);
    expect(svc.get()!.done).toBe(1);
  });
});
