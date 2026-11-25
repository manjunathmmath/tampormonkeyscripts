import { describe, it, expect } from 'vitest';
import { ScoreService } from '../src/marketdata/score.js';
import type { Candle } from '../src/kite/client.js';

const D = '2026-11-20';
const P = '2026-11-19';
const c = (day: string, hm: string, o: number, h: number, l: number, cl: number, v = 0): Candle => [`${day}T${hm}:00+0530`, o, h, l, cl, v];

const deps = (over: Record<string, unknown> = {}) => ({
  history: {
    candles: async (q: { token: number; interval: string }) => {
      if (q.token === 264969) return [c(P, '00:00', 15, 15, 15, 16)]; // India VIX previous close 16
      if (q.interval === 'day') return [c(P, '00:00', 24000, 24050, 23950, 24000)]; // previous close 24000
      return [c(D, '09:15', 24000, 24080, 23990, 24070), c(D, '09:20', 24070, 24100, 24060, 24090)]; // open 24000, last 24090
    },
  },
  tokens: () => ({ 'NIFTY 50': 256265, 'INDIA VIX': 264969 }),
  strikeDiffs: () => ({ 'NIFTY 50': '50,50' }),
  scanZone: () => undefined,
  futures: { load: async () => ({ remark: 'LONG', dir: 1 }) as never },
  oi: { analyse: async () => ({ oiScore: 5.5, maxPainScore: -1, ivSkewScore: 0, ivSkew: 1 }) as never },
  ...over,
});

describe('score service', () => {
  it('sums the six parts: 9:15 zone from the first candle, price vs levels, futures, OI/OBV capped at 3, max pain, skew', async () => {
    const r = await new ScoreService(deps()).load({ name: 'NIFTY 50', day: D });
    // levels from the open 24000 with step 50/50: ASO 24050, AST 24100, BSO 23950, BST 23900
    expect(r.zone).toBe('ASO'); // first candle close 24070: at or above ASO, below AST
    expect(r.trend?.trends).toContain('ASO'); // last price 24090 is above ASO and below AST
    expect(r.trend?.trends).not.toContain('AST');
    expect(r.trend?.change).toBe('0.38'); // (24090 - 24000) / 24000
    expect(r.score).toMatchObject({ nine_fifteen: 1, current_trend: 1, futures_trend: 1, oi_obv: 5.5, max_pain: -1, iv_skew: 0 });
    expect(r.score.total).toBe(1 + 1 + 1 + 3 + -1 + 0); // OI/OBV counts at most 3 in the total
    expect(r.missing).toEqual([]);
  });
  it('uses the saved 9:15 scan zone when there is one', async () => {
    const r = await new ScoreService(deps({ scanZone: () => 'BST' })).load({ name: 'NIFTY 50', day: D });
    expect(r.zone).toBe('BST');
    expect(r.score.nine_fifteen).toBe(-2);
  });
  it('a part that cannot be read counts as zero and is listed', async () => {
    const r = await new ScoreService(deps({ futures: { load: async () => { throw new Error('no futures'); } }, oi: { analyse: async () => { throw new Error('no chain'); } } })).load({ name: 'NIFTY 50', day: D });
    expect(r.missing).toEqual(['futures_trend', 'oi_obv', 'max_pain', 'iv_skew']);
    expect(r.score).toMatchObject({ futures_trend: 0, oi_obv: 0, max_pain: 0, iv_skew: 0, total: 2 }); // only 9:15 (+1) and trend (+1)
    const unknown = await new ScoreService(deps()).load({ name: 'NOSUCH', day: D });
    expect(unknown.missing).toContain('trend');
    expect(unknown.zone).toBeNull();
  });
});
