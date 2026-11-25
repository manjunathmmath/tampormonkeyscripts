import { describe, it, expect } from 'vitest';
import { compositeScore, leadingScore, type CompositeParts } from '../src/engine/composite.js';

const parts = (): CompositeParts => ({
  nine15: { all: 0.5, nifty50: 1, bank: 2, gift: -1, sensex: 1, reliance: 0, hdfcbank: -2 },
  ad: { all: 0.3, nifty50: -0.2, bank: 0.1 },
  fut: { all: 1, nifty50: 1, bank: -1 },
  oiObv: [3, -3, 1, 0, 2],
  maxPain: [1, -1, 0, 1, 1],
  ivSkew: [0, 1, -1, 0, 0],
  component: { nifty50: 0.45, bank: -0.12 },
});

describe('composite score', () => {
  it('adds the leading parts, and the lagging parts unless they are switched off', () => {
    const p = parts();
    expect(leadingScore(p)).toBeCloseTo(0.5 + 1 + 2 - 1 + 1 + 0 - 2 + 0.3 - 0.2 + 0.1 + 1 + 1 - 1, 10);
    expect(compositeScore(p, false)).toBe(2.7);
    expect(compositeScore(p, true)).toBe(8.03); // 2.7 + OI/OBV 3 + max pain 2 + skew 0 + components 0.33
  });
});
