import { describe, expect, it } from 'vitest';
import { heatColor, squarify } from './treemap';

describe('squarify', () => {
  it('fills the rectangle with tiles in proportion to their value', () => {
    const r = squarify([{ key: 'a', value: 6 }, { key: 'b', value: 3 }, { key: 'c', value: 2 }, { key: 'd', value: 1 }], 400, 300);
    expect(r).toHaveLength(4);
    const area = r.reduce((s, t) => s + t.w * t.h, 0);
    expect(area).toBeCloseTo(400 * 300, 3);
    const a = r.find((t) => t.key === 'a')!;
    expect(a.w * a.h).toBeCloseTo((6 / 12) * 400 * 300, 3);
    for (const t of r) { expect(t.x).toBeGreaterThanOrEqual(-1e-6); expect(t.x + t.w).toBeLessThanOrEqual(400 + 1e-6); expect(t.y + t.h).toBeLessThanOrEqual(300 + 1e-6); }
  });
  it('drops empty items and copes with an empty list', () => {
    expect(squarify([], 100, 100)).toEqual([]);
    expect(squarify([{ key: 'x', value: 0 }], 100, 100)).toEqual([]);
  });
});

describe('heatColor', () => {
  it('is greener the more it is up, redder the more it is down', () => {
    const up = heatColor(3).match(/\d+/g)!.map(Number);
    const dn = heatColor(-3).match(/\d+/g)!.map(Number);
    expect(up[1]!).toBeGreaterThan(up[0]!);
    expect(dn[0]!).toBeGreaterThan(dn[1]!);
    expect(heatColor(null)).toContain('120');
  });
});
