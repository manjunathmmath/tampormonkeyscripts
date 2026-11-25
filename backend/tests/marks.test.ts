import { describe, expect, it } from 'vitest';
import { MarksService } from '../src/marketdata/marks.js';

describe('MarksService', () => {
  it('reads each name once per slot and leaves out a failing one', async () => {
    let calls = 0;
    const s = new MarksService({ now: () => 0, focus: { load: async (r) => { calls++; if (r.name === 'BAD') throw new Error('x'); return { v: { call: 'LONG', conf: 'HIGH', dir: 1, headline: 'h' } }; } } });
    const a = await s.load(['A', 'B', 'BAD', 'A'], { day: '2026-11-20' });
    expect(a.map((m) => m.name)).toEqual(['A', 'B']);
    expect(calls).toBe(3);
    await s.load(['A', 'B'], { day: '2026-11-20' });
    expect(calls).toBe(3);
  });
});
