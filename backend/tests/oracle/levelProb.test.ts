import { describe, it, expect } from 'vitest';
import { levelProbOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { levelProb } from '../../src/engine/levelProb.js';
import type { Walls } from '../../src/engine/oi.js';

describe('Level Probability: the port equals the original _gtbLevelProb', () => {
  const o = levelProbOracle();
  it('on 3,000 random states (score, OBV flow, wall pressure, room used, missing data)', () => {
    const r = rng(909);
    const seen = new Set<number>();
    for (let k = 0; k < 3000; k++) {
      const open = r.pick([24000, 52000, 80000]);
      const ltp = r.chance(0.03) ? 0 : open * (1 + r.range(-0.015, 0.015));
      const vixRange = r.pick([0, 120, 300, 700]);
      const score = r.pick([null, 0, 3.5, -6, 9, -11, 1.2]);
      const obv = r.pick([undefined, 0, 2, -3, 8, -9, 0.4]);
      const mkWall = (): { tier: 'primary' | 'secondary'; index: number; strike: number; mag: number }[] => {
        const n = r.int(0, 2);
        return Array.from({ length: n }, (_, i) => ({ tier: i === 0 ? ('primary' as const) : ('secondary' as const), index: i, strike: ltp + r.range(-600, 600), mag: 1 }));
      };
      const walls: Walls | null = r.chance(0.2) ? null : { resistance: mkWall(), support: mkWall() };
      const hasTable = walls !== null;

      o.ctx['__cs'] = score === null ? null : { total: score };
      o.ctx['__trend'] = { ltp: String(ltp), open: String(open), strikeData: {}, vix: { vixDDRange: String(vixRange) }, change: '0.1' };
      o.ctx['__walls'] = walls;
      (o.ctx['INSTRUMENT_SCORE_MAP'] as Record<string, unknown>)['X'] = { oiData: { obvFlow: obv, tableData: hasTable ? [{}] : [] } };

      const old = plain<Record<string, unknown>>(o.call('_gtbLevelProb', 'X'));
      const mine = plain<Record<string, unknown>>(levelProb({ ltp, open, vixRange, scoreTotal: score ?? 0, obvFlow: obv ?? 0, walls }));
      expect(mine, `case ${k}`).toEqual(old);
      if (old['ok']) seen.add(old['pASO'] as number);
    }
    expect(seen.size).toBeGreaterThan(20);
  });
  it('is a rough likelihood: an all-bullish lean puts ASO high and BSO low', () => {
    const p = levelProb({ ltp: 24100, open: 24000, vixRange: 300, scoreTotal: 8, obvFlow: 4, walls: null });
    expect(p.ok).toBe(true);
    expect(p.pASO!).toBeGreaterThan(80);
    expect(p.pBSO!).toBeLessThan(20);
    expect(levelProb({ ltp: 0, open: 24000, vixRange: 300, scoreTotal: 0, obvFlow: 0, walls: null }).ok).toBe(false);
  });
});
