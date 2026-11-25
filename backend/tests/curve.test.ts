import { describe, it, expect } from 'vitest';
import { curveRead } from '../src/engine/curve.js';
import { CurveService } from '../src/marketdata/curve.js';
import type { Instrument, InstrumentBook } from '../src/instruments/book.js';

describe('curve structure maths (NSE and MCX thresholds)', () => {
  // 30-day gap: raw gap x 365/30
  const nse = (pct: number) => curveRead(100, 100 * (1 + pct / 100), '2026-11-26', '2026-12-26', false, 'RELIANCE');
  const mcx = (pct: number) => curveRead(100, 100 * (1 + pct / 100), '2026-11-26', '2026-12-26', true, 'Gold Mini');

  it('NSE: only backwardation beyond -2% a year votes; a steep contango is no vote', () => {
    expect(nse(-0.3).dir).toBe(1); // -0.3% x 12.17 = -3.65%/yr
    expect(nse(-0.3).state).toBe('BACKWARDATION');
    expect(nse(-0.1).dir).toBe(0); // -1.2%/yr
    expect(nse(1.2).lean).toBe('STEEP CONTANGO (no vote)'); // 14.6%/yr
    expect(nse(1.2).dir).toBe(0);
    expect(nse(0.3).lean).toBe('NEUTRAL');
    expect(nse(0.03).state).toBe('FLAT');
  });

  it('MCX: backwardation beyond -3% bullish, contango beyond +8% bearish', () => {
    expect(mcx(-0.3).dir).toBe(1);
    expect(mcx(-0.2).dir).toBe(0); // -2.4%/yr
    expect(mcx(0.8).dir).toBe(-1); // 9.7%/yr
    expect(mcx(0.8).lean).toBe('BEARISH / CAUTION');
    expect(mcx(0.5).dir).toBe(0); // 6.1%/yr
  });

  it('annualises by the real expiry gap and never divides by zero', () => {
    const r = curveRead(100, 101, '2026-11-26', '2027-02-24', false, 'X'); // 90 days
    expect(r.daysGap).toBe(90);
    expect(r.annualizedPct).toBeCloseTo(1 * (365 / 90), 10);
    expect(curveRead(100, 101, '2026-11-26', '2026-11-26', false, 'X').daysGap).toBe(1);
    expect(curveRead(0, 5, '2026-11-26', '2026-12-26', false, 'X').diffPct).toBe(0);
  });
});

const fut = (symbol: string, expiry: string, token: number): Instrument => ({ token, exchangeToken: token, symbol, name: 'RELIANCE', expiry, strike: 0, tickSize: 0.05, lotSize: 250, type: 'FUT', segment: 'NFO-FUT', exchange: 'NFO' });
const day = '2026-11-20';
const cd = (px: number): [string, number, number, number, number, number, number][] => [[`${day}T09:15:00+0530`, px, px, px, px, 100, 0], [`${day}T09:20:00+0530`, px, px, px, px, 100, 0]];

describe('CurveService', () => {
  const list = [fut('RELIANCE26NOVFUT', '2026-11-26', 1), fut('RELIANCE26DECFUT', '2026-12-31', 2), fut('RELIANCE26OCTFUT', '2026-10-29', 9)];
  const book = { futures: (ex: string) => (ex === 'NFO' ? list.sort((a, b) => a.expiry.localeCompare(b.expiry)) : []) } as unknown as InstrumentBook;

  it('uses the first two contracts that traded, skipping expired ones', async () => {
    const svc = new CurveService({
      book: () => book,
      history: { candles: async (q) => (q.token === 1 ? cd(1000) : q.token === 2 ? cd(1003) : []) as never },
    });
    const r = await svc.load({ name: 'RELIANCE', day });
    expect(r).not.toBeNull();
    expect(r!.near.symbol).toBe('RELIANCE26NOVFUT');
    expect(r!.far.symbol).toBe('RELIANCE26DECFUT');
    expect(r!.diffPct).toBeCloseTo(0.3, 10);
  });

  it('is null when the far contract has not traded yet', async () => {
    const svc = new CurveService({ book: () => book, history: { candles: async (q) => (q.token === 1 ? cd(1000) : []) as never } });
    expect(await svc.load({ name: 'RELIANCE', day })).toBeNull();
  });
});
