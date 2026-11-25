import { describe, expect, it } from 'vitest';
import { ScoreSeriesService, slots } from '../src/marketdata/scoreSeries.js';

describe('slots', () => {
  it('NSE every 5 minutes, MCX every 15, never past the limit', () => {
    expect(slots(false, null)[0]).toBe('09:20');
    expect(slots(false, null).at(-1)).toBe('15:25');
    expect(slots(false, null).length).toBe(74);
    expect(slots(false, '09:30')).toEqual(['09:20', '09:25', '09:30']);
    expect(slots(true, null).length).toBe(59);
  });
});

describe('ScoreSeriesService', () => {
  const mem = new Map<string, unknown>();
  const store = { get: (k: string) => mem.get(k), set: (k: string, v: unknown) => void mem.set(k, v) } as never;
  it('reads each slot once and saves a finished past day', async () => {
    let calls = 0;
    const s = new ScoreSeriesService({
      store,
      isMcx: () => false,
      now: () => Date.parse('2026-11-23T10:00:00+05:30'),
      score: { load: async (r) => { calls++; return { score: { total: Number(r.asOf!.slice(3)) / 10, nine_fifteen: 1, current_trend: 0, futures_trend: 0, oi_obv: 0, max_pain: 0, iv_skew: 0 } } as never; } },
    });
    const a = await s.load({ name: 'NIFTY 50', day: '2026-11-20' });
    expect(a.length).toBe(74);
    expect(calls).toBe(74);
    await s.load({ name: 'NIFTY 50', day: '2026-11-20' });
    expect(calls).toBe(74);
    expect(mem.has('score_series_NIFTY_50_2026-11-20')).toBe(true);
  });
});
