import { describe, it, expect } from 'vitest';
import { weightedTable } from '../src/engine/weightedOi.js';

describe('weighted constituents (Index Impact)', () => {
  const inputs = [
    { name: 'HDFCBANK', weight: 13, change: -1.0 }, // -0.13
    { name: 'RELIANCE', weight: 9, change: 0.5 }, // +0.045
    { name: 'ICICIBANK', weight: 8, change: -0.5 }, // -0.04
    { name: 'INFY', weight: 5, change: 0.2 }, // +0.01
    { name: 'TCS', weight: 4, change: 0.1 }, // +0.004
  ];

  it('impact = weight x change / 100, tiers by cumulative share, cumulative in display order', () => {
    const t = weightedTable(inputs, -0.3, 39);
    expect(t.rows.map((r) => r.name)).toEqual(['HDFCBANK', 'RELIANCE', 'ICICIBANK', 'INFY', 'TCS']);
    expect(t.rows[0]!.impact).toBeCloseTo(-0.13, 10);
    // total |impact| = 0.229; HDFCBANK alone is 56.8% -> driver; the next starts at 56.8% (<80) -> contributor
    expect(t.rows.map((r) => r.tier)).toEqual(['driver', 'contributor', 'contributor', 'negligible', 'negligible']);
    expect(t.driverNames).toEqual(['HDFCBANK']);
    expect(t.driverShare).toBe(57);
    expect(t.rows.map((r) => r.cumPct)).toEqual([57, 76, 94, 98, 100]);
    expect(t.rows[0]!.dir).toBe('Down');
    expect(t.netImpact).toBeCloseTo(-0.111, 10);
    expect(t.disagrees).toBe(false);
  });

  it('cautions when the slice nets the other way from the index, and not inside the 0.02% noise band', () => {
    expect(weightedTable(inputs, 0.4, 39).disagrees).toBe(true);
    expect(weightedTable(inputs, 0.01, 39).disagrees).toBe(false);
  });

  it('sort by weight keeps the tiers of the impact ranking', () => {
    const t = weightedTable([{ name: 'A', weight: 2, change: 5 }, { name: 'B', weight: 20, change: 0.1 }], 0, 22, 'weight');
    expect(t.rows.map((r) => r.name)).toEqual(['B', 'A']);
    expect(t.rows.find((r) => r.name === 'A')!.tier).toBe('driver');
    expect(t.rows.find((r) => r.name === 'B')!.tier).toBe('negligible');
  });

  it('an empty slice does not divide by zero', () => {
    const t = weightedTable([], 1, 0);
    expect(t.rows).toEqual([]);
    expect(t.driverShare).toBe(0);
  });
});
