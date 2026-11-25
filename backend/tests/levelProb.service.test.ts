import { describe, it, expect } from 'vitest';
import { LevelProbService } from '../src/marketdata/levelProb.js';

const score = (trend: unknown, total = 4) => ({ load: async () => ({ score: { total }, trend }) as never });

describe('level probability service', () => {
  const trend = { ltp: 24100, open: 24000, change: '0.4', vixRange: 300 };
  it('combines the score, the OBV flow and the walls found with the live price as spot', async () => {
    let seen: { change: number; spot: number } | null = null;
    const s = new LevelProbService({
      score: score(trend),
      oi: {
        analyse: async () => ({ obvFlow: 3 }) as never,
        wallsAt: async (_r, change, spot) => {
          seen = { change, spot };
          return { resistance: [{ tier: 'primary', index: 0, strike: 24200, mag: 1 }], support: [] };
        },
      },
    });
    const r = await s.load({ name: 'NIFTY 50', day: '2026-11-20' });
    expect(seen).toEqual({ change: 0.4, spot: 24100 });
    expect(r.ok).toBe(true);
    expect(r.pASO!).toBeGreaterThan(r.pBSO!); // bullish score and flow
    expect(r.inputs.obvFlow).toBe(3);
  });
  it('without an option chain the OBV and wall terms count as zero', async () => {
    const s = new LevelProbService({ score: score(trend), oi: { analyse: async () => { throw new Error('no chain'); }, wallsAt: async () => null } });
    const r = await s.load({ name: 'NIFTY 50', day: '2026-11-20' });
    expect(r.ok).toBe(true);
    expect(r.inputs).toMatchObject({ obvFlow: 0, walls: null });
  });
  it('says not ok when the price levels cannot be read', async () => {
    const s = new LevelProbService({ score: score(null, 0), oi: { analyse: async () => ({}) as never, wallsAt: async () => null } });
    expect((await s.load({ name: 'X', day: '2026-11-20' })).ok).toBe(false);
  });
});
