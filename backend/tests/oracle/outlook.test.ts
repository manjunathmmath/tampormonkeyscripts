import { describe, it, expect } from 'vitest';
import { outlookOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { table } from './gen.js';
import { outlook, srLevels, type HoldMap } from '../../src/engine/outlook.js';

const iso = (min: number): string => `2026-11-20T${String(9 + Math.floor((15 + min) / 60)).padStart(2, '0')}:${String((15 + min) % 60).padStart(2, '0')}:00+0530`;

describe('strong support / resistance and the probable trade: the ports equal the originals', () => {
  const o = outlookOracle();

  it('zones on 1,500 random states (walls with erosion, max pain, 9:15 levels, profile, day and previous-day levels)', () => {
    const r = rng(5150);
    const widths = new Set<number>();
    for (let k = 0; k < 1500; k++) {
      const { rows, spot } = table(r);
      const ltp = spot + r.range(-80, 80);
      const pc = r.pick([0, 0.3, -0.3]);
      const cands = r.chance(0.8)
        ? Array.from({ length: r.int(3, 40) }, (_, i) => {
            const b = spot + r.range(-150, 150);
            return [iso(i * 5), b, b + r.range(0, 30), b - r.range(0, 30), b, r.int(100, 9000)];
          })
        : null;
      const sd = r.chance(0.9) ? { ustrikeOne: String(spot + 40), ustrikeTwo: String(spot + 90), bstrikeOne: String(spot - 40), bstrikeTwo: String(spot - 90) } : null;
      const pv = r.chance(0.7) ? { hi: spot + 120, lo: spot - 130, cl: spot - 10 } : null;
      Object.assign(o.ctx, { __trend: { ltp: String(ltp), change: String(pc) }, __sd: sd, __pv: pv });
      (o.ctx['INSTRUMENT_SCORE_MAP'] as Record<string, unknown>)['X'] = { oiData: { tableData: r.chance(0.9) ? plain(rows) : [], spotCandles: cands } };
      (o.ctx['INSTRUMENT_LIST_GLOBAL'] as { name: string; price: number }[])[0] = { name: 'X', price: spot };
      const hasRows = ((o.ctx['INSTRUMENT_SCORE_MAP'] as Record<string, { oiData: { tableData: unknown[] } }>)['X']!.oiData.tableData as unknown[]).length > 0;
      const old = plain(o.call('_gtbSrLevels', 'X'));
      const mine = plain(srLevels({ spot: ltp, pc, rows: hasRows ? rows : null, strike: sd ? { aso: parseFloat(sd.ustrikeOne), ast: parseFloat(sd.ustrikeTwo), bso: parseFloat(sd.bstrikeOne), bst: parseFloat(sd.bstrikeTwo) } : null, candles: cands, prev: pv }));
      expect(mine, `case ${k}`).toEqual(old);
      widths.add(((old as { zones: unknown[] } | null)?.zones ?? []).length);
    }
    expect(widths.size).toBeGreaterThan(5);
  });

  it('the probable trade on 3,000 random states, with the plan hold running over a sequence of refreshes', () => {
    const r = rng(7777);
    o.ctx['CURRENT_DAY'] = '2026-11-20'; // the stubbed clock is on this day, so the hold applies
    const kinds = new Set<string>();
    let myHold: HoldMap = {};
    let nowMs = Date.parse('2026-11-20T10:00:00+05:30');
    for (let k = 0; k < 3000; k++) {
      if (k % 30 === 0) {
        myHold = {};
        o.ctx['_GTB_OL_HOLD'] = null;
        o.ctx['__store'] = {};
        nowMs = Date.parse('2026-11-20T10:00:00+05:30');
      }
      nowMs += r.pick([20_000, 60_000, 180_000, 300_000]);
      o.ctx['__now'] = nowMs;
      const { rows, spot } = table(r);
      const drift = (k % 30) * r.range(-6, 6);
      const ltp = spot + r.range(-60, 60) + drift * 0.2;
      const pc = r.pick([0, 0.2, -0.2]);
      const cands = Array.from({ length: r.int(0, 30) }, (_, i) => {
        const b = spot + r.range(-100, 100);
        return [iso(i * 5), b, b + r.range(0, 25), b - r.range(0, 25), b, r.int(100, 9000)];
      });
      const sd = { ustrikeOne: String(spot + 40), ustrikeTwo: String(spot + 90), bstrikeOne: String(spot - 40), bstrikeTwo: String(spot - 90) };
      const pv = r.pick([null, { hi: spot + 120, lo: spot - 130, cl: spot - 10 }]);
      const net = r.pick([0.1, 0.25, -0.25, 0.45, -0.6, 0.8, r.range(-1, 1)]);
      const voting = r.int(0, 6);
      const thin = r.chance(0.2);
      const forceDir = r.pick([undefined, undefined, 1, -1]);
      const lx = r.pick([null, null, { status: 'STALE' }, { status: 'WEAKENING' }, { status: 'VALID' }]);
      const nm = r.pick(['NIFTY 50', 'NIFTY BANK', 'RELIANCE']);
      const isIndex = nm !== 'RELIANCE';
      const dirOf = net > 0.2 ? 1 : net < -0.2 ? -1 : 0;
      const fv = r.pick([null, { dir: dirOf, conf: r.pick(['LOW', 'MEDIUM', 'HIGH']) }]);
      const strat = r.pick([null, { outcome: 'Buy', level: 'at BSO/BST' }]);
      const vixRange = { vixDDLower: String(spot - 250), vixDDUpper: String(spot + 250) };

      Object.assign(o.ctx, { __trend: { ltp: String(ltp), change: String(pc), vix: vixRange }, __sd: sd, __pv: pv, __cn: { net, voting, thin }, __lx: lx, __fv: fv });
      (o.ctx['window'] as { _GTB_LC: unknown })._GTB_LC = strat ? { strat } : {};
      (o.ctx['INSTRUMENT_SCORE_MAP'] as Record<string, unknown>)[nm] = { oiData: { tableData: plain(rows), spotCandles: cands } };
      (o.ctx['INSTRUMENT_LIST_GLOBAL'] as { name: string; price: number }[])[0] = { name: nm, price: spot };

      const old = plain<Record<string, unknown>>(o.call('_gtbOutlook', nm, forceDir));
      const sr = srLevels({ spot: ltp, pc, rows, strike: { aso: spot + 40, ast: spot + 90, bso: spot - 40, bst: spot - 90 }, candles: cands, prev: pv });
      const mine = plain<Record<string, unknown>>(
        outlook({
          name: nm, sr: sr!, consensus: { net, voting, thin }, forceDir, lx, finalVerdict: fv, isIndex, candles: cands,
          vix: { lo: spot - 250, hi: spot + 250 }, strat, hold: { map: myHold, now: nowMs, active: true },
        }),
      );
      // the original also returns the consensus, Live Context and dead zone objects it was given; they are inputs, not results
      for (const key of ['forced', 'nm', 'spot', 'dir', 'rank', 'rankNote', 'plan', 'range', 'vix', 'strat']) expect(mine[key] ?? null, `${key} case ${k}`).toEqual(old[key] ?? null);
      const plan = mine['plan'] as { held?: { pending: unknown }; heldNote?: string; widened?: boolean; capped?: boolean } | null;
      if (plan?.heldNote) kinds.add('replaced');
      if (plan?.held?.pending) kinds.add('pending');
      if (plan?.widened) kinds.add('widened');
      if (plan?.capped) kinds.add('capped');
    }
    expect([...kinds].sort()).toEqual(['capped', 'pending', 'replaced', 'widened']);
  });
});
