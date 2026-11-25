import { describe, expect, it } from 'vitest';
import { OverviewService } from '../src/marketdata/overview.js';

const parts = { nine15: { all: 1, nifty50: 2, bank: 2, gift: 1, sensex: 2, reliance: 0, hdfcbank: 0 }, ad: { all: 1, nifty50: 1, bank: 0 }, fut: { all: 1, nifty50: 1, bank: 1 }, oiObv: [1, 0, 0, 0, 0], maxPain: [0, 0, 0, 0, 0], ivSkew: [0, 0, 0, 0, 0], component: { nifty50: 0, bank: 0 } };

const mk = () =>
  new OverviewService({
    market: { load: async () => ({ score: 14, leading: 13, signal: { signal: 'STRONG BUY', reason: 'r' }, parts, breadth50: { up: 30, dn: 20 }, adCounts: { all: {}, nifty: {}, bank: {} }, adWeighted: { nifty: null, bank: null }, breakout: { nifty: {}, bank: {}, all: { up: 1, dn: 1 } } }) as never },
    futures: { load: async (r) => { if (r.name === 'RELIANCE') throw new Error('x'); return ({ remark: 'LONG', dir: 1, vwapPrice: 24005, quote: { close: r.name === 'CRUDEOILM' ? 7800 : 24050 } }) as never; } },
    futAcc: { load: async (r) => (r.name === 'NIFTY 50' ? { LONG: { hits: 6, total: 10, pts: 20, eodPts: 0 } } : r.name === 'NIFTY BANK' ? { LONG: { hits: 4, total: 10, pts: 10, eodPts: 0 }, SHORT: { hits: 1, total: 4, pts: -8, eodPts: 0 } } : {}) as never },
    score: { load: async () => ({ trend: { ltp: 24000 } }) as never },
    isMcx: (n) => n === 'CRUDEOILM',
    commodityLtp: async () => 7790,
    includeLagging: () => true,
  });

describe('OverviewService', () => {
  it('builds the scoreboard, the futures strip and the pooled accuracy', async () => {
    const o = await mk().load({ day: '2026-11-20' });
    expect(o.market.signal).toBe('STRONG BUY');
    expect(o.scoreboard.groups.length).toBe(7);
    const nifty = o.strip.find((s) => s.name === 'NIFTY 50')!;
    expect(nifty.premium).toBe(50);
    expect(nifty.premiumPct).toBeCloseTo(0.21, 2);
    expect(o.strip.find((s) => s.name === 'RELIANCE')!.remark).toBeNull();
    expect(o.strip.find((s) => s.name === 'CRUDEOILM')!.premium).toBe(10);
    const long = o.accuracy.rows.find((r) => r.remark === 'LONG')!;
    expect(long.samples).toBe(20);
    expect(long.winRate).toBe(50);
    expect(long.avgPts).toBe(1.5);
  });
});
