import { describe, expect, it } from 'vitest';
import { scoreboard } from '../src/engine/scoreboard.js';
import type { CompositeParts } from '../src/engine/composite.js';

const parts = (o: Partial<CompositeParts> = {}): CompositeParts => ({
  nine15: { all: 0, nifty50: 0, bank: 0, gift: 0, sensex: 0, reliance: 0, hdfcbank: 0 },
  ad: { all: 0, nifty50: 0, bank: 0 },
  fut: { all: 0, nifty50: 0, bank: 0 },
  oiObv: [0, 0, 0, 0, 0],
  maxPain: [0, 0, 0, 0, 0],
  ivSkew: [0, 0, 0, 0, 0],
  component: { nifty50: 0, bank: 0 },
  ...o,
});

describe('scoreboard', () => {
  it('splits the total into groups and counts each only up to its cap', () => {
    const s = scoreboard(parts({ nine15: { all: 0.5, nifty50: 2, bank: 2, gift: 1, sensex: 2, reliance: 0, hdfcbank: 0 }, oiObv: [3, 3, 3, 3, 3] }));
    expect(s.groups.find((g) => g.key === 'nine15')!.sum).toBe(7.5);
    expect(s.groups.find((g) => g.key === 'oiObv')!.sum).toBe(15);
    expect(s.total).toBe(22.5);
    expect(s.dir).toBe(1);
    // 7 (capped from 7.5) + 10 (capped from 15) out of 38
    expect(s.confidence).toBe(Math.round((17 / 38) * 100));
  });
  it('flags a lopsided score and handles the flat case', () => {
    const s = scoreboard(parts({ oiObv: [9, 0, 0, 0, 0], fut: { all: 1, nifty50: 0, bank: 0 } }));
    expect(s.dominant?.key).toBe('oiObv');
    const f = scoreboard(parts());
    expect(f.dir).toBe(0);
    expect(f.confidence).toBe(0);
    expect(f.dominant).toBeNull();
  });
  it('a bearish total counts bearish groups', () => {
    const s = scoreboard(parts({ ad: { all: -1, nifty50: -1, bank: -1 }, fut: { all: -1, nifty50: -1, bank: 0 } }));
    expect(s.dir).toBe(-1);
    expect(s.leading).toBe(-5);
    expect(s.confidence).toBe(Math.round((5 / 38) * 100));
  });
});
