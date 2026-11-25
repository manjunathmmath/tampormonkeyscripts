import { describe, it, expect } from 'vitest';
import { levelDecisionOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { table } from './gen.js';
import {
  broadBasedCheck, componentsCheck, futuresTrendCheck, ivSkewCheck, levelDecision, levelHistory, levelProbCheck, levelWallCheck, roomToTargetCheck, tally, weakStrongIndexCheck,
  type Check, type TrendSeen,
} from '../../src/engine/levelDecision.js';

const iso = (min: number): string => `2026-11-20T${String(9 + Math.floor((15 + min) / 60)).padStart(2, '0')}:${String((15 + min) % 60).padStart(2, '0')}:00+0530`;
const attempt = (f: () => unknown): unknown => {
  try {
    return plain(f());
  } catch {
    return 'threw';
  }
};

describe('level confirmation checks: the ports equal the originals', () => {
  const o = levelDecisionOracle();
  const setTrend = (ltp: number, change: number): void => void (o.ctx['__trend'] = { ltp: String(ltp), change: String(change) });

  it('wall at the level and room to target, on 1,500 random chains', () => {
    const r = rng(2468);
    const confirmedSeen = new Set<string>();
    for (let k = 0; k < 1500; k++) {
      const { rows, spot } = table(r);
      const pc = r.pick([0, 0.3, -0.3]);
      const ltp = spot + r.range(-90, 90);
      setTrend(ltp, pc);
      const map = o.ctx['INSTRUMENT_SCORE_MAP'] as Record<string, unknown>;
      map['X'] = r.chance(0.05) ? {} : { oiData: { tableData: plain(rows) } };
      const side = r.pick(['support', 'resistance'] as const);
      const level = r.pick([null, undefined, spot - 100, spot + 100, spot + 40]);
      const stop = r.pick([null, spot - 150, spot + 150, spot + 80]);
      o.ctx['LEVEL_ROOM_MULT'] = r.pick([undefined, 0, 1.5, 3]);
      const rows2 = (map['X'] as { oiData?: unknown }).oiData ? rows : null;
      const old1 = attempt(() => o.call('_gtbLevelWallCheck', 'X', side, level));
      const mine1 = attempt(() => levelWallCheck('X', rows2, ltp, pc, side, level));
      expect(mine1, `wall ${k}`).toEqual(old1);
      const mult = o.ctx['LEVEL_ROOM_MULT'] as number | undefined;
      const old2 = attempt(() => o.call('_gtbRoomToTargetCheck', 'X', side, level, stop));
      const mine2 = attempt(() => roomToTargetCheck('X', rows2, ltp, pc, side, level, stop, mult ?? 1.5));
      expect(mine2, `room ${k}`).toEqual(old2);
      for (const v of [mine1, mine2]) if (v && typeof v === 'object') confirmedSeen.add(String((v as Check).confirmed));
    }
    expect(confirmedSeen.has('true') && confirmedSeen.has('false')).toBe(true);
  });

  it('small checks and the tally', () => {
    const r = rng(77);
    for (let k = 0; k < 400; k++) {
      const dir = r.pick(['weak', 'strong'] as const);
      const futs = r.pick([undefined, null, 1, 0, -1]);
      const acc = r.pick([undefined, { total: 3, hits: 1 }, { total: 9, hits: 5 }]);
      const rem = r.pick([undefined, 'SHORT', 'LONG']);
      o.ctx['INSTRUMENT_SCORE_MAP'] = { X: { ...(futs === undefined ? {} : { futures_trend: futs }), ...(rem ? { futures_trend_remark: rem, futAccMap: acc ? { [rem]: acc } : {} } : {}), score: { iv_skew: r.pick([undefined, -1, 0, 1]) } } };
      expect(plain(futuresTrendCheck(futs as number | undefined, rem, dir, rem ? acc : null)), 'fut').toEqual(plain(o.call('_gtbFuturesTrendCheck', 'X', dir)));
      const skew = (o.ctx['INSTRUMENT_SCORE_MAP'] as { X: { score: { iv_skew?: number } } }).X.score.iv_skew;
      expect(plain(ivSkewCheck(skew, dir)), 'skew').toEqual(plain(o.call('_gtbIvSkewCheck', 'X', dir)));
      const n = r.range(-6, 6);
      const b = r.range(-6, 6);
      Object.assign(o.ctx, { NIFTY_50_ADVANCE_DECLINE_SCORE: n, NIFTY_50_OI_OBV_SCORE: 0, NIFTY_BANK_ADVANCE_DECLINE_SCORE: b, NIFTY_BANK_OI_OBV_SCORE: 0, NIFTY_50_COMPONENT_SCORE: n });
      expect(plain(weakStrongIndexCheck(dir, n, b)), 'ws').toEqual(plain(o.call('_gtbWeakStrongIndexCheck', dir)));
      expect(plain(componentsCheck(dir, n)), 'comp').toEqual(plain(o.call('_gtbComponentsCheck', dir)));
    }
    expect(tally([{ ok: true, confirmed: true }, { ok: true, confirmed: false }, { ok: false }])).toEqual({ conf: 1, total: 2 });
    expect(levelProbCheck({ ok: true, netDir: -0.2 }, 'weak')).toEqual({ ok: true, confirmed: true });
    expect(levelProbCheck(null, 'strong')).toEqual({ ok: false });
    expect(broadBasedCheck('weak', []).ok).toBe(false);
  });

  it('level history on random candles', () => {
    const r = rng(11);
    for (let k = 0; k < 600; k++) {
      const n = r.int(0, 30);
      let p = 24000;
      const cs = Array.from({ length: n }, (_, i) => {
        p += r.range(-30, 30);
        return [iso(i * 5), p, p + r.range(0, 25), p - r.range(0, 25), p, 0];
      });
      const level = 24000 + r.range(-120, 120);
      const buy = r.chance(0.5);
      (o.ctx['INSTRUMENT_SCORE_MAP'] as Record<string, unknown>)['X'] = { oiData: { spotCandles: cs } };
      expect(plain(levelHistory(cs, level, buy)), `hist ${k}`).toEqual(plain(o.call('_gtbLevelHistory', 'X', level, buy)));
    }
  });

  it('the Level Decision on 4,000 random states (stops, at level, wait, skip, trend entry and its window)', () => {
    const r = rng(8642);
    const actions = new Set<string>();
    let mySeen: TrendSeen = {};
    for (let k = 0; k < 4000; k++) {
      if (k % 25 === 0) {
        mySeen = {};
        Object.keys(o.ctx['_GTB_DEC_TREND_SEEN'] as object).forEach((x) => delete (o.ctx['_GTB_DEC_TREND_SEEN'] as Record<string, unknown>)[x]);
      }
      const { rows } = table(r);
      const side = r.pick(['support', 'resistance'] as const);
      const buy = side === 'support';
      const base = 24000;
      const level = r.pick([base - 50, base + 50]) + (buy ? 0 : 0);
      const stopLevel = r.pick([null, level + (buy ? -50 : 50)]);
      const spot = level + r.range(-160, 160);
      const pc = r.pick([0, 0.2]);
      const nm = r.pick(['NIFTY 50', 'NIFTY BANK']);
      const partner = nm === 'NIFTY 50' ? 'NIFTY BANK' : 'NIFTY 50';
      const futs = r.pick([-1, 0, 1]);
      const futsB = r.pick([-1, 0, 1]);
      const remark = r.pick(['SHOT_COVERING', 'LONG_UNWINDING', 'SHORT', 'LONG', '']);
      const sig = r.pick([null, 'BUY', 'STRONG BUY', 'SELL', 'STRONG SELL', 'WAIT', 'NO TRADE']);
      const score = r.pick([null, 9, -9, 2.2]);
      const lp = r.pick([null, { ok: false }, { ok: true, pBSO: r.int(0, 100), pASO: r.int(0, 100) }]);
      const sq = r.pick([[], [], ['NIFTY 50']]);
      const dz = r.chance(0.2);
      const tConf = r.int(0, 10);
      const tTot = r.pick([0, 10, 12]);
      const nowMin = r.int(9 * 60 + 15, 15 * 60 + 30);
      const avwap = r.pick([undefined, level + r.range(-120, 120)]);
      const cands = Array.from({ length: r.int(0, 12) }, (_, i) => {
        const p = base + r.range(-120, 120);
        return [iso(i * 5), p, p + 8, p - 8, p, 0];
      });
      const mult = r.pick([undefined, 1.5, 2.5]);

      setTrend(spot, pc);
      Object.assign(o.ctx, { __hl: { ms: sig ? { signal: sig, reason: 'guard reason' } : null, score }, __lp: lp, __sq: sq, __dz: dz, __nowMin: nowMin, LEVEL_ROOM_MULT: mult });
      const map = o.ctx['INSTRUMENT_SCORE_MAP'] as Record<string, unknown>;
      map[nm] = { futures_trend: futs, futures_trend_remark: remark, futures_trend_at: r.pick([undefined, '09:25']), oiData: { tableData: plain(rows), spotCandles: cands }, ...(avwap ? { avwap } : {}) };
      map[partner] = { futures_trend: futsB, futures_trend_remark: r.pick(['LONG', 'SHORT', '']), futures_trend_at: r.pick([undefined, '09:30']) };
      (o.ctx['__store'] as Record<string, string>)['VALID_BREAKOUT_NINE_FIFTEEN'] = JSON.stringify({ [nm]: { aso: base + 50, bso: base - 50 } });

      const key = `${nm}|${side}|D|`;
      const old = plain<Record<string, unknown> | null>(o.call('_gtbLevelDecision', side, level, stopLevel, tConf, tTot, nm));
      const sm = map[nm] as { futures_trend_remark: string; futures_trend_at?: string };
      const pm = map[partner] as { futures_trend_remark: string; futures_trend_at?: string };
      const mine = plain<Record<string, unknown> | null>(
        levelDecision(
          {
            side, level, stopLevel, tallyConf: tConf, tallyTotal: tTot, name: nm, spot, pc, nowMin,
            signal: sig ? { signal: sig, reason: 'guard reason' } : null, score, fut: futs, futBank: futsB,
            remark, remarkAt: sm.futures_trend_at, partnerRemark: pm.futures_trend_remark, partnerRemarkAt: pm.futures_trend_at,
            squeezeNames: sq, pLevel: lp && (lp as { ok: boolean }).ok ? (buy ? (lp as { pBSO: number }).pBSO : (lp as { pASO: number }).pASO) : null,
            deadZone: dz, history: levelHistory(cands, level, buy), rows,
            oppositeLevel: buy ? base + 50 : base - 50, avwap: avwap ?? null, mult,
          },
          key,
          mySeen,
        ),
      );
      const strip = (d: Record<string, unknown> | null): unknown => (d ? Object.fromEntries(Object.entries(d).filter(([kk]) => kk !== 'col')) : d);
      expect(strip(mine), `case ${k}`).toEqual(strip(old));
      actions.add(String(mine?.['action']));
    }
    expect([...actions].sort()).toEqual(['AT_LEVEL', 'SKIP', 'TREND', 'WAIT', 'null'].sort().filter((x) => x !== 'null'));
  });
});
