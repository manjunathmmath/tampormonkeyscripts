import { describe, it, expect } from 'vitest';
import { oiOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { table } from './gen.js';
import { computeMaxPainGEX, computeOIScore, findWalls, isITM, ivSkewScore, maxPainScore, obvVelocityInfo, oiPriceChange, scoreOIStrike, wallErosion, wallVelocity } from '../../src/engine/oi.js';

const attempt = (f: () => unknown): { ok: true; v: unknown } | { ok: false } => {
  try {
    return { ok: true, v: plain(f()) };
  } catch {
    return { ok: false };
  }
};

describe('OI / OBV scoring: the port equals the original', () => {
  const o = oiOracle();

  it('ITM rule and the per-strike score (labels, weights, IV agreement, wall, flow, conflict) on 3,000 strikes', () => {
    const r = rng(1234);
    const labels = new Set<string>();
    for (let k = 0; k < 3000; k++) {
      const { rows, spot } = table(r, { allowEmpty: true });
      const item = rows[r.int(0, rows.length - 1)]!;
      const pc = r.pick([0, 0.05, -0.05, 0.3, -0.3, 1.2, -1.2, '0.4', '', 'x']);
      const isATM = !!item.ATM_STRIKE;
      const old = attempt(() => o.call('scoreOIStrikeForSignal', plain(item), isATM, pc, spot));
      const mine = attempt(() => scoreOIStrike(item, isATM, pc as number, spot));
      expect(mine, `case ${k}`).toEqual(old);
      if (old.ok) {
        const v = old.v as { ceLabel: string; peLabel: string };
        labels.add(v.ceLabel);
        labels.add(v.peLabel);
      }
      const strike = parseFloat(String(item.STRIKE));
      for (const side of ['CE', 'PE'] as const) expect(isITM(side, strike, spot)).toBe(o.call('_gtbIsITM', side, strike, spot));
    }
    expect(labels.size).toBeGreaterThanOrEqual(10); // the cases reach WRITE / BUY / COV / UNWIND on both sides
  });

  it('chain score, flow, wall total and conflicts, with the change-PCR term and the price-change fallback', () => {
    const r = rng(777);
    for (let k = 0; k < 600; k++) {
      const { rows } = table(r);
      const chg = r.chance(0.3) ? null : r.pick([0, 0.4, -0.7, 2]);
      const spotCandles = r.chance(0.5) ? [['t', 100, 101, 99, 100, 1], ['t', 100, 101, 99, 100 * (1 + r.range(-0.02, 0.02)), 1]] : undefined;
      (o.ctx as Record<string, unknown>)['__chg'] = chg;
      const oiData = { tableData: plain(rows), spotCandles: plain(spotCandles) } as Record<string, unknown>;
      const old = attempt(() => {
        const s = o.call('computeOIScoreFromData', oiData, 'X') as number;
        return { score: s, obvFlow: oiData['obvFlow'], oiWall: oiData['oiWall'], oiConflicts: oiData['oiConflicts'] };
      });
      const mine = attempt(() => computeOIScore(rows, oiPriceChange(chg, spotCandles as never)));
      expect(mine, `case ${k}`).toEqual(old);
    }
    expect(computeOIScore([], 0)).toEqual({ score: 0, obvFlow: 0, oiWall: 0, oiConflicts: 0 });
  });

  it('walls (ranking, tiers), build-up and erosion', () => {
    const r = rng(2468);
    let someWalls = 0;
    for (let k = 0; k < 800; k++) {
      const { rows, spot } = table(r);
      const pc = r.pick([0, 0.5, -0.5]);
      const oldW = plain<{ resistance: unknown[]; support: unknown[] }>(o.call('_gtbFindWalls', plain(rows), pc, spot));
      const mineW = findWalls(rows, pc, spot);
      expect(plain(mineW), `walls ${k}`).toEqual(oldW);
      if (oldW.resistance.length || oldW.support.length) someWalls++;
      expect(plain(wallVelocity(rows, spot, 3, 2)), `velocity ${k}`).toEqual(plain(o.call('_gtbWallVelocity', plain(rows), spot, 3, 2)));
      expect(plain(wallVelocity(rows, spot)), `velocity default ${k}`).toEqual(plain(o.call('_gtbWallVelocity', plain(rows), spot)));
      expect(plain(wallErosion(rows, mineW, 3, 2)), `erosion ${k}`).toEqual(plain(o.call('_gtbWallErosion', plain(rows), plain(oldW), 3, 2)));
      expect(plain(wallErosion(rows, mineW, 2, 1.5)), `erosion b ${k}`).toEqual(plain(o.call('_gtbWallErosion', plain(rows), plain(oldW), 2, 1.5)));
      const arr = rows[0]!.CE_OBV;
      expect(plain(obvVelocityInfo(arr, 3))).toEqual(plain(o.call('_gtbObvVelocityInfo', plain(arr), 3)));
    }
    expect(someWalls).toBeGreaterThan(300);
  });

  it('max pain, gamma exposure, flip zones and the two small scores', () => {
    const r = rng(135);
    for (let k = 0; k < 500; k++) {
      const { rows } = table(r);
      const map = o.ctx['INSTRUMENT_SCORE_MAP'] as Record<string, unknown>;
      const skew = r.pick([null, 0, 1.9, 2.1, -2.1, -1.9, 5, -5]);
      map['X'] = { oiData: { tableData: plain(rows) }, oiExtras: { ivSkew: skew } };
      const old = plain(o.call('_gtbComputeMaxPainGEX', 'X'));
      const mp = computeMaxPainGEX(rows);
      expect(plain(mp), `maxpain ${k}`).toEqual(old);
      expect(maxPainScore(mp)).toBe(o.call('_gtbMaxPainScore', 'X'));
      expect(ivSkewScore(skew)).toBe(o.call('_gtbIVSkewScore', 'X'));
    }
    expect(computeMaxPainGEX([])).toBeNull();
    expect(maxPainScore(null)).toBe(0);
  });
});
