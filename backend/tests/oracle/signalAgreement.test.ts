import { describe, it, expect } from 'vitest';
import { signalOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { agreement, STRATEGY_VIEW, suggestedKey, timing, wantOf, type StrategyKey } from '../../src/engine/signalAgreement.js';

describe('signal agreement and entry timing: the ports equal optionStrikeSearch.js', () => {
  const o = signalOracle();

  it('the suggested strategy on 4,000 random states (market gate, every Final Verdict outcome, the VIX upgrade, single stocks)', () => {
    const r = rng(1212);
    const keys = new Set<string>();
    for (let k = 0; k < 4000; k++) {
      const isIndex = r.chance(0.7);
      const name = isIndex ? 'NIFTY 50' : 'RELIANCE';
      const sig = r.pick([null, 'BUY', 'SELL', 'SIDEWAYS', 'NO TRADE', 'WAIT']);
      const reason = r.pick(['', 'Score bullish but index futures lean bearish. Conflicting signals — no trade.', 'Mild bullish lean.']);
      const call = r.pick(['LONG', 'SHORT', 'WAIT', 'NO TRADE']);
      const dir = r.pick([1, -1, 0]);
      const headline = r.pick(['LONG NOW — buy at BSO 24050', 'WAIT — NIFTY is in a dead zone', 'NO TRADE — market guard', 'NO TRADE — sell only at ASO', 'NO TRADE — no clear direction', 'SHORT bias — WAIT for ASO 24100', 'NO TRADE — no nearby support to enter on']);
      const conf = r.pick([null, 'LOW', 'MEDIUM', 'HIGH']);
      const entryBlocked = r.chance(0.3);
      const fv = r.chance(0.9) ? { call, dir, headline, conf, entryBlocked } : null;
      const total = r.pick([null, 2.5, -3, 0.4]);
      const vix = r.pick([0, 11.2, 12.9, 13, 18]);
      const skip = r.chance(0.3);
      Object.assign(o.ctx, { __hl: { ms: sig ? { signal: sig, reason } : null, score: null }, __fv: fv, __cs: total === null ? null : { total } });
      (o.ctx['__store'] as Record<string, string>)['INSTRUMENT_LTP_PRICE'] = JSON.stringify({ 'INDIA VIX': { ltp: vix } });
      const old = plain(o.call('_ossSuggestedKey', name, skip ? { skipMarketGate: true } : undefined));
      const mine = plain(suggestedKey({ isIndex, skipMarketGate: skip, marketSignal: sig ? { signal: sig, reason } : null, finalVerdict: fv, scoreTotal: total, indiaVix: vix }));
      expect(mine, `case ${k}`).toEqual(old);
      keys.add(String((old as { key: string | null } | null)?.key));
    }
    expect([...keys].sort()).toEqual(['bearput', 'bullcall', 'condor', 'longce', 'longpe', 'null', 'undefined']); // undefined = nothing could be read
  });

  it('the agreement tally on 3,000 states (every strategy view, missing parts)', () => {
    const r = rng(77);
    const labels = new Set<string>();
    const views = Object.entries(STRATEGY_VIEW) as [StrategyKey, string][];
    for (let k = 0; k < 3000; k++) {
      const [, view] = r.pick(views);
      const want = wantOf(view);
      if (want === null) continue;
      const cs = r.pick([null, { nine_fifteen: r.pick([-2, 0, 1]), current_trend: r.pick([-1, 0, 2]), futures_trend: r.pick([-1, 0, 1]), oi_obv: r.pick([-4, 0, 3]) }]);
      const sig = r.pick([null, 'BUY', 'SELL', 'SIDEWAYS']);
      const isIndex = r.chance(0.7);
      const fv = isIndex && r.chance(0.8) ? { call: r.pick(['LONG', 'SHORT', 'WAIT', 'NO TRADE']), dir: r.pick([1, -1, 0]) } : null;
      Object.assign(o.ctx, { __cs: cs, __hl: { ms: sig ? { signal: sig } : null, score: null }, __fv: fv });
      o.call('_ossAgreement', isIndex ? 'NIFTY 50' : 'RELIANCE', view);
      const old = plain<Record<string, unknown> | null>(o.ctx['_OSS_AGREE_LAST']);
      const mine = agreement({ want, parts: cs, marketSignal: sig ? { signal: sig } : null, finalVerdict: fv });
      if (!old) expect(mine, `case ${k}`).toBeNull();
      else {
        const { label: _l, ...rest } = plain<Record<string, unknown>>(mine); // the tone label is derived for the caller; the userscript stores only the numbers
        void _l;
        expect(rest, `case ${k}`).toEqual(old);
        labels.add(mine!.label);
      }
    }
    expect([...labels].sort()).toEqual(['FAVOURABLE', 'MIXED', 'UNFAVOURABLE']);
  });

  it('entry timing on 4,000 states (directional and range checklists)', () => {
    const r = rng(9090);
    const labels = new Set<string>();
    const keyList: StrategyKey[] = ['longce', 'longpe', 'bullcall', 'bearput', 'bullput', 'condor', 'ironfly'];
    for (let k = 0; k < 4000; k++) {
      const want = r.pick([1, -1, 0]);
      const stratKey = r.pick(keyList);
      const dte = r.pick([null, 0, 1, 3, 6, 12]);
      const open = 24000;
      const hasTr = r.chance(0.9);
      const tr = hasTr ? { ltp: open + r.range(-220, 220), open, aso: open + 50, ast: open + 100, vixRange: r.pick([0, 150, 300]) } : null;
      const fut = r.pick([undefined, null, 1, 0, -1]);
      const rem = r.pick(['', 'SHOT_COVERING', 'LONG_UNWINDING', 'LONG']);
      const avwap = r.pick([undefined, open + r.range(-100, 100)]);
      const lp = r.pick([null, { ok: false, pASO: null, pBSO: null }, { ok: true, pASO: r.int(0, 100), pBSO: r.int(0, 100) }]);
      const dz = r.pick([null, null, { lo: 23950, hi: 24050 }]);
      const nowMin = r.int(9 * 60, 15 * 60 + 30);

      const sm: Record<string, unknown> = {};
      if (fut !== undefined) sm['futures_trend'] = fut;
      if (rem) sm['futures_trend_remark'] = rem;
      if (avwap) sm['avwap'] = avwap;
      (o.ctx['INSTRUMENT_SCORE_MAP'] as Record<string, unknown>)['X'] = sm;
      Object.assign(o.ctx, { __tr: tr ? { ltp: String(tr.ltp), open: String(tr.open), strikeData: { ustrikeOne: String(tr.aso), ustrikeTwo: String(tr.ast) }, vix: { vixDDRange: String(tr.vixRange) } } : null, __lp: lp, __dz: dz, __nowMin: nowMin });
      o.call('_ossTimingFor', 'X', want, stratKey, dte);
      const old = plain<Record<string, unknown> | null>(o.ctx['_OSS_TIMING_LAST']);
      const mine = timing({ want, stratKey, dte, trend: tr, futuresTrend: fut as number | null | undefined, futuresRemark: rem, avwap, levelProb: lp, deadZone: dz, nowMin });
      if (!old) expect(mine, `case ${k}`).toBeNull();
      else {
        expect(plain(mine), `case ${k}`).toEqual(old);
        labels.add(mine!.label);
      }
    }
    expect(labels.size).toBe(4);
  });
});
