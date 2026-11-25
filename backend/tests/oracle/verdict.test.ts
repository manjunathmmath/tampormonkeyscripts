import { describe, it, expect } from 'vitest';
import { verdictOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { table } from './gen.js';
import { buildVerdict, isHighConviction, marketProfile } from '../../src/engine/verdict.js';
import { computeMaxPainGEX } from '../../src/engine/oi.js';

describe('wall verdict: the port equals the original _cmdBuildVerdict', () => {
  const o = verdictOracle();

  it('market profile on random candles', () => {
    const r = rng(5);
    for (let k = 0; k < 400; k++) {
      const n = r.int(0, 40);
      const cs = Array.from({ length: n }, (_, i) => {
        const base = 24000 + r.range(-80, 80);
        return ['t' + i, base, base + r.range(0, 30), base - r.range(0, 30), base + r.range(-10, 10), r.chance(0.1) ? 0 : r.int(100, 9000)];
      });
      // the original keeps the sandbox realm; compare through plain()
      const old = plain(o.call('_gtbMarketProfile', cs));
      expect(plain(marketProfile(cs)), `case ${k}`).toEqual(old);
    }
  });

  it('on 3,000 random states (bias, wall distance, value area upgrade, conflicts, max pain, order flow, volatility warning)', () => {
    const r = rng(31337);
    const labels = new Set<string>();
    let actionable = 0;
    let upgraded = 0;
    for (let k = 0; k < 3000; k++) {
      const { rows } = table(r);
      const mpd = r.chance(0.85) ? computeMaxPainGEX(rows) : null;
      const total = r.pick([0, 2.9, 3, -3, 4.5, -5.5, 7, -2]);
      const fut = r.pick([undefined, 1, 0, -1]);
      const oiObv = r.pick([undefined, 0, 2.5, -2.5, 6, -9, 0.5]);
      const vix = r.pick([0, 12, 18, 29.9, 30, 33]);
      const spotBase = mpd?.spot ?? 24000;
      const candles =
        r.chance(0.7)
          ? Array.from({ length: r.int(3, 30) }, (_, i) => {
              const base = spotBase + r.range(-120, 120);
              return ['t' + i, base, base + r.range(0, 40), base - r.range(0, 40), base, r.int(100, 9000)];
            })
          : null;
      const ofi = r.pick([null, null, { dir: 1, text: 'Order flow buy.' }, { dir: -1, text: 'Order flow sell.' }, { dir: 0, text: 'Order flow flat.' }]);
      const pc = r.pick([0, 0.2, -0.2, 1]);
      const trendLtp = r.pick([null, spotBase]);

      o.ctx['__cs'] = { total };
      o.ctx['__vix'] = vix;
      o.ctx['__ofi'] = ofi;
      o.ctx['__trendLtp'] = trendLtp;
      const entry: Record<string, unknown> = {};
      if (fut !== undefined) entry['futures_trend'] = fut;
      if (oiObv !== undefined) entry['oi_obv'] = oiObv;
      (o.ctx['INSTRUMENT_SCORE_MAP'] as Record<string, unknown>)['X'] = entry;

      const oiData = { tableData: plain(rows), spotCandles: candles };
      const old = plain<Record<string, unknown>>(o.call('_cmdBuildVerdict', 'X', oiData, pc, plain(mpd)));
      const mine = plain<Record<string, unknown>>(
        buildVerdict({ name: 'X', vol: { label: 'India VIX', value: vix }, csTotal: total, futuresTrend: fut, oiObv, rows, spotCandles: candles, priceChange: pc, mpd, trendLtp, orderFlow: ofi }),
      );
      for (const key of ['label', 'lines', 'trade', 'context', 'location', 'confirmation', 'raw', 'volWarn']) {
        expect(mine[key] ?? null, `${key} case ${k}`).toEqual(old[key] ?? null);
      }
      labels.add(String(mine['label']));
      if (mine['trade']) actionable++;
      if (/Value Area/.test(String((mine['location'] as { label: string }).label))) upgraded++;
    }
    expect([...labels].sort()).toEqual(['LONG', 'LONG bias — WAIT', 'SHORT', 'SHORT bias — WAIT', 'WAIT']);
    expect(actionable).toBeGreaterThan(30);
    expect(upgraded).toBeGreaterThan(5);
  });

  it('the high conviction screen needs a strong score, spot at the wall, and live order flow agreeing', () => {
    const base = { name: 'X', vol: { label: 'India VIX', value: 12 }, csTotal: 6, futuresTrend: 1, oiObv: 3, rows: [], priceChange: 0, mpd: null };
    expect(isHighConviction(buildVerdict(base))).toBe(false); // no wall in an empty chain, so no trade
  });
});
