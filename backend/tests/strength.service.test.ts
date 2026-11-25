import { describe, it, expect } from 'vitest';
import { StrengthService, rankStrength } from '../src/marketdata/strength.js';

describe('strongest and weakest index', () => {
  it('ranks by today change, drops indices with no price, and reports the spread', async () => {
    const chg: Record<string, string> = { 'NIFTY 50': '0.30', 'NIFTY BANK': '-0.40', SENSEX: '0.10', BANKEX: '0.55' };
    const s = new StrengthService({
      score: {
        load: async (r) => {
          const c = chg[r.name];
          if (!c) throw new Error('no price');
          return { score: { total: 2 }, zone: 'ASO', trend: { change: c, ltp: 100 } } as never;
        },
      },
    });
    const r = await s.load({ day: '2026-11-20' });
    expect(r.rows.map((x) => x.name)).toEqual(['BANKEX', 'NIFTY 50', 'SENSEX', 'NIFTY BANK']);
    expect(r.strongest?.name).toBe('BANKEX');
    expect(r.weakest?.name).toBe('NIFTY BANK');
    expect(r.spread).toBeCloseTo(0.95, 10);
    expect(r.rows.find((x) => x.name === 'BANKEX')?.score).toBeNull(); // only the three main indices carry an instrument score
    expect(r.rows.find((x) => x.name === 'SENSEX')?.score).toBe(2);
  });
  it('with fewer than two indices there is no weakest and no spread', async () => {
    const s = new StrengthService({ score: { load: async (r) => { if (r.name !== 'NIFTY 50') throw new Error('x'); return { score: { total: 1 }, zone: null, trend: { change: '0.1', ltp: 1 } } as never; } } });
    const r = await s.load({ day: '2026-11-20' });
    expect(r.weakest).toBeNull();
    expect(r.spread).toBeNull();
    expect(rankStrength([{ name: 'a', chg: Number.NaN, ltp: 1, score: null, zone: null }])).toEqual([]);
  });
});
