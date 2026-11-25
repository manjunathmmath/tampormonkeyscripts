import { describe, it, expect } from 'vitest';
import { VerdictService } from '../src/marketdata/verdict.js';

const D = '2026-11-20';
const c = (hm: string, cl: number) => [`${D}T${hm}:00+0530`, cl, cl, cl, cl, 0];
const score = (total: number, change = '0.2') => ({ load: async () => ({ score: { total, oi_obv: 1 }, futures: { dir: 1 }, trend: { ltp: 24000, change } }) as never });

describe('verdict service', () => {
  it('reads India VIX from the last 5-minute candle up to the time asked, and says WAIT without an edge', async () => {
    let asked: string | undefined;
    const s = new VerdictService({
      score: score(1),
      oi: { chainRaw: async () => ({ rows: [], spotCandles: [] }) },
      history: { candles: async (q) => { asked = q.asOf; return [c('09:15', 15), c('09:20', 31)] as never; } },
      tokens: () => ({ 'INDIA VIX': 264969 }),
    });
    const r = await s.load({ name: 'NIFTY 50', day: D, asOf: '09:25' });
    expect(asked).toBe('09:25');
    expect(r.label).toBe('WAIT');
    expect(r.inputs.indiaVix).toBe(31);
    expect(r.volWarn?.limit).toBe(30); // India VIX 31 is above 30: a warning, not a block
    expect(r.trade).toBeNull();
  });
  it('a missing option chain leaves a bias without a wall: LONG bias, WAIT', async () => {
    const s = new VerdictService({
      score: score(4),
      oi: { chainRaw: async () => { throw new Error('no chain'); } },
      history: { candles: async () => [] },
      tokens: () => ({}),
    });
    const r = await s.load({ name: 'NIFTY 50', day: D });
    expect(r.label).toBe('LONG bias — WAIT');
    expect(r.location.label).toBe('No wall nearby');
    expect(r.highConviction).toBe(false);
  });
});
