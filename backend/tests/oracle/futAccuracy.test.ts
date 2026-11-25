import { describe, it, expect } from 'vitest';
import { futAccuracyOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { reconstructFutAccuracy, type AccMap } from '../../src/engine/futAccuracy.js';
import type { FutCandle } from '../../src/engine/futures.js';

describe('futures remark accuracy: the port equals _gtbReconstructFutAccuracy', () => {
  const o = futAccuracyOracle();
  it('on 300 random days (remarks, hit counts, points, move to the close), several instruments sharing one map', () => {
    const r = rng(2468);
    const remarks = new Set<string>();
    for (let k = 0; k < 300; k++) {
      const oldMap: Record<string, unknown> = {};
      const mine: AccMap = {};
      const vix = r.pick([0, 11, 13, 17, 24]);
      for (let inst = 0; inst < 3; inst++) {
        const n = r.int(2, 75);
        const lot = r.pick([25, 75, 250, 1500]);
        let px = r.range(100, 25000);
        let oi = r.range(1e6, 5e6);
        const intr: FutCandle[] = Array.from({ length: n }, (_, i) => {
          const o2 = px;
          px *= 1 + r.range(-0.003, 0.003);
          oi *= 1 + r.range(-0.006, 0.006);
          return { date: `${String(9 + Math.floor((15 + i * 5) / 60)).padStart(2, '0')}:${String((15 + i * 5) % 60).padStart(2, '0')}`, open: o2, high: Math.max(o2, px) * 1.0005, low: Math.min(o2, px) * 0.9995, close: px, volume: r.int(500, 90000), oi: r.chance(0.05) ? undefined : Math.round(oi) };
        });
        const base = intr[0]!.open;
        const prev = { high: base * 1.01, low: base * 0.99, close: base, volume: r.int(50000, 900000), oi: r.pick([0, Math.round(oi * 0.97)]) };
        o.call('_gtbReconstructFutAccuracy', { intraday: plain(intr), prevDay: plain(prev), lotSize: lot }, vix, oldMap);
        reconstructFutAccuracy(intr, prev, lot, vix, mine);
      }
      expect(plain(mine), `case ${k}`).toEqual(plain(oldMap));
      Object.keys(mine).forEach((x) => remarks.add(x));
    }
    expect(remarks.size).toBeGreaterThan(5);
  });
});
