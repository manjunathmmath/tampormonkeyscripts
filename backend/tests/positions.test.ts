import { describe, expect, it } from 'vitest';
import { PositionsService, stanceOf, type PlanLite, type RawPosition } from '../src/marketdata/positions.js';

const plan = (over: Partial<PlanLite> = {}): PlanLite => ({ long: true, entry: 25000, stop: 24900, t1: 25200, rank: 2, forced: false, ...over });

describe('stance', () => {
  it('reads a long call or short put as bullish, a long put or short call as bearish', () => {
    expect(stanceOf(75, 'CE')).toBe('bullish');
    expect(stanceOf(-75, 'PE')).toBe('bullish');
    expect(stanceOf(75, 'PE')).toBe('bearish');
    expect(stanceOf(-75, 'CE')).toBe('bearish');
    expect(stanceOf(30, null)).toBe('bullish');
    expect(stanceOf(-30, null)).toBe('bearish');
  });
});

describe('positions against the plan', () => {
  const raw: RawPosition[] = [
    { tradingsymbol: 'NIFTY26DEC25000CE', exchange: 'NFO', product: 'NRML', quantity: 75, average_price: 100, last_price: 130, pnl: 2250 },
    { tradingsymbol: 'NIFTY26DEC25000PE', exchange: 'NFO', product: 'NRML', quantity: 75, average_price: 90, last_price: 60, pnl: -2250 },
    { tradingsymbol: 'RELIANCE', exchange: 'NSE', product: 'MIS', quantity: 10, average_price: 2500, last_price: 2510, pnl: 100 },
    { tradingsymbol: 'GOLDM26DECFUT', exchange: 'MCX', product: 'NRML', quantity: 0, average_price: 125000, last_price: 125500, pnl: 800 },
  ];
  const svc = new PositionsService({
    positions: async () => ({ net: raw }),
    resolve: (_ex, sym) => (sym.startsWith('NIFTY') ? { underlying: 'NIFTY 50', option: sym.endsWith('CE') ? 'CE' : 'PE' } : sym.startsWith('GOLDM') ? { underlying: 'GOLDM', option: null } : { underlying: sym, option: null }),
    ltp: (u) => (u === 'NIFTY 50' ? 25080 : null),
    plan: async (u) => (u === 'NIFTY 50' ? plan() : null),
    planNames: () => new Set(['NIFTY 50', 'GOLDM']),
    now: () => 1,
  });
  it('splits open from closed, totals the P&L and counts the ones against the plan', async () => {
    const v = await svc.load();
    expect(v.open.map((r) => r.symbol)).toEqual(['NIFTY26DEC25000CE', 'NIFTY26DEC25000PE', 'RELIANCE']);
    expect(v.closed.map((r) => r.symbol)).toEqual(['GOLDM26DECFUT']);
    expect(v.totals).toMatchObject({ pnl: 900, open: 3, closed: 1, against: 1 });
  });
  it('shows the distance of the underlying to the stop and target 1 for the plan\'s direction', async () => {
    const v = await svc.load();
    const call = v.open.find((r) => r.symbol.endsWith('CE'))!;
    expect(call.vs).toBe('with the plan');
    expect(call.toStop).toBe(180); // 25080 is 180 above the stop of a long plan
    expect(call.toT1).toBe(120);
    expect(call.pnlPct).toBeCloseTo(30, 1);
    const put = v.open.find((r) => r.symbol.endsWith('PE'))!;
    expect(put.vs).toBe('against the plan');
  });
  it('has no plan for a stock', async () => {
    const r = (await svc.load()).open.find((x) => x.symbol === 'RELIANCE')!;
    expect(r.vs).toBe('no plan');
    expect(r.plan).toBeNull();
  });
});
