import { describe, expect, it } from 'vitest';
import { dominantGap } from '../src/engine/mcx.js';

describe('dominantGap', () => {
  it('takes the most common gap between strikes', () => {
    expect(dominantGap([148000, 149000, 150000, 151000, 151500, 152000])).toBe(1000);
    expect(dominantGap([50, 100, 150])).toBe(50);
  });
  it('returns null with fewer than two strikes', () => {
    expect(dominantGap([100])).toBeNull();
    expect(dominantGap([])).toBeNull();
  });
});
