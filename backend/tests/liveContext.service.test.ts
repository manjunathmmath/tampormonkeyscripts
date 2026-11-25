import { describe, it, expect } from 'vitest';
import { LiveContextService } from '../src/marketdata/liveContext.js';

const day = '2026-11-20';
const cs = Array.from({ length: 12 }, (_, i) => {
  const m = 15 + i * 5;
  const px = 24000 + i * 10;
  return [`${day}T${String(9 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00+0530`, px, px + 8, px - 8, px + 5, 100, 0];
});

const trend = (ltp: number, open: number) => ({ ltp, open, prevPrice: open, change: '0.1', trends: [], levels: { ast: open + 100, aso: open + 50, bso: open - 50, bst: open - 100 }, vixRange: 0, vixUpper: 0, vixLower: 0 });

const mk = (gift: boolean) =>
  new LiveContextService({
    score: {
      load: async (r: { name: string }) => {
        if (r.name === 'GIFT NIFTY') {
          if (!gift) throw new Error('no token');
          return { zone: 'B/W', trend: trend(24150, 24000) } as never;
        }
        return { zone: 'B/W', trend: trend(24055, 24000) } as never;
      },
    },
    oi: { chainRaw: async () => ({ rows: [], spotCandles: cs as never }), analyse: async () => ({ oiScore: 0 }) as never },
    futures: { load: async () => Promise.reject(new Error('none')) },
    market: { load: async () => ({ score: 5, weighted50: [], breadth50: { up: 36, dn: 12 } }) as never },
    now: () => Date.parse(`${day}T10:30:00+05:30`),
  });

describe('Live Context: breadth and GIFT NIFTY', () => {
  it('adds the breadth and GIFT checks and no longer lists them as unavailable', async () => {
    const r = await mk(true).read({ name: 'NIFTY 50', day, asOf: '10:30' });
    expect(r).not.toBeNull();
    const keys = r!.checks.map((c) => c.key);
    expect(keys).toContain('breadth');
    expect(keys).toContain('gift');
    expect(r!.unavailable).toEqual([]);
    const gift = r!.checks.find((c) => c.key === 'gift')!;
    expect(gift.sig).toBe(1); // +0.625% since its open
    expect(gift.text).toContain('GIFT NIFTY');
    expect(r!.snap.up).toBe(36);
    expect(r!.snap.dn).toBe(12);
  });

  it('leaves the GIFT check out when GIFT NIFTY cannot be read', async () => {
    const r = await mk(false).read({ name: 'NIFTY 50', day, asOf: '10:30' });
    expect(r!.checks.map((c) => c.key)).not.toContain('gift');
    expect(r!.checks.map((c) => c.key)).toContain('breadth');
  });
});
