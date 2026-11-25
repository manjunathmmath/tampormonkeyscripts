import { describe, it, expect } from 'vitest';
import { consensusOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { masterConsensus } from '../../src/engine/consensus.js';

describe('Master Consensus: the port equals the original _gtbMasterConsensus', () => {
  const o = consensusOracle();
  it('on 3,000 random states (rows, groups, net, agree, thin, outcome, dead zone)', () => {
    const r = rng(777);
    const outcomes = new Set<string>();
    for (let k = 0; k < 3000; k++) {
      const s = o.ctx['__store'] as Record<string, string>;
      const map = o.ctx['INSTRUMENT_SCORE_MAP'] as Record<string, unknown>;
      const zone = r.pick([undefined, 'AST', 'ASO', 'B/W', 'BSO', 'BST']);
      s['VALID_BREAKOUT_NINE_FIFTEEN'] = JSON.stringify(zone === undefined ? {} : { X: { CLOSE_9_15: zone } });
      const hasCs = r.chance(0.92);
      const cs = hasCs
        ? { nine_fifteen: 0, current_trend: r.pick([-2, -1, 0, 1, 2]), futures_trend: 0, oi_obv: r.pick([-9, -2.5, -1, -0.4, 0, 0.9, 1.75, 6, 13.5]), max_pain: r.pick([-1, 0, 1]), iv_skew: r.pick([-1, 0, 1]), total: 0 }
        : null;
      o.ctx['__cs'] = cs;
      const remark = r.pick([undefined, 'LONG', 'SHORT', 'SHOT_COVERING', 'LONG_UNWINDING', 'NO_CLEAR_SIGNAL', 'CONSOLIDATING']);
      const total = r.int(0, 30);
      const acc = r.chance(0.5) ? { total, hits: r.int(0, total), pts: r.range(-40, 40) * Math.max(total, 1) / 10 } : undefined;
      const entry: Record<string, unknown> = {};
      if (remark) entry['futures_trend_remark'] = remark;
      if (acc) entry['futAccMap'] = { [remark ?? 'LONG']: acc };
      const curve = r.pick([undefined, { dir: 1, lean: 'BACKWARDATION steep' }, { dir: -1, lean: 'CONTANGO x' }, { dir: 0, lean: 'NEUTRAL' }]);
      if (curve) entry['curveState'] = curve;
      map['X'] = entry;
      const lp = r.pick([null, { ok: false }, { ok: true, netDir: r.range(-1, 1) }, { ok: true, netDir: r.range(-1, 1), netDirNoScore: r.range(-1, 1) }, { ok: true, netDir: 0.9, netDirNoScore: 0 }]);
      o.ctx['__lp'] = lp;
      const of = r.pick([null, { dir: 1 }, { dir: -1 }, { dir: 0 }]);
      o.ctx['__of'] = of;
      const dz = r.pick([null, null, { lo: 1, hi: 2 }, { lo: 1, hi: 2, broken: { dir: 1 } }]);
      o.ctx['__dz'] = dz;

      const old = plain<Record<string, unknown>>(o.call('_gtbMasterConsensus', 'X'));
      const mine = plain<Record<string, unknown>>(
        masterConsensus({ cs: cs as never, zone, remark, futAcc: acc, levelProb: lp as never, orderFlow: of, curve, deadZone: dz as never }),
      );
      for (const key of ['rows', 'net', 'agree', 'voting', 'votingRows', 'families', 'dataCount', 'thin', 'dzConflict', 'outcome', 'deadZone', 'deadZoneBroken']) {
        expect(mine[key], `${key} case ${k}`).toEqual(old[key]);
      }
      outcomes.add(String(mine['outcome']));
    }
    expect(outcomes.size).toBeGreaterThanOrEqual(4);
  });
});
