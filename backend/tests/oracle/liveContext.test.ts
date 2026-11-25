import { describe, it, expect } from 'vitest';
import { liveContextOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { lxChecks, lxCompute, lxViewDir, type LxCandle, type LxInputs, type LxSnap } from '../../src/engine/liveContext.js';

const slot = (i: number): string => {
  const m = 15 + i * 5;
  return `${String(9 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const mkCandles = (r: ReturnType<typeof rng>, n: number, base: number, drift: number): LxCandle[] => {
  let p = base;
  return Array.from({ length: n }, (_, i) => {
    const o = p;
    p += r.range(-25, 25) + drift;
    return { t: slot(i), o, h: Math.max(o, p) + r.range(0, 12), l: Math.min(o, p) - r.range(0, 12), c: p };
  });
};

describe('Live Context: the ports equal liveContext.js', () => {
  const o = liveContextOracle();

  it('the checks on 3,000 random contexts (average, VWAP, open, structure, range, failed breakouts, holds, walls, futures window, OI window, breadth, GIFT, heavyweights)', () => {
    const r = rng(3030);
    const keys = new Set<string>();
    for (let k = 0; k < 3000; k++) {
      const n = r.pick([0, 2, 3, 5, 8, 11, 14, 30]);
      const base = 24000;
      const candles = mkCandles(r, n, base, r.range(-6, 6));
      const px = (candles[n - 1]?.c ?? base) + r.range(-10, 10);
      const open = r.pick([0, base, base + 30]);
      const prev = r.pick([0, base - 40, base + 60]);
      const fut = r.pick([null, { ltp: px + r.range(-40, 40), vwap: r.pick([0, px + r.range(-60, 60)]), oi: r.range(1e6, 2e6) }]);
      const nowT = 1_000_000_000;
      const hist: LxSnap[] = Array.from({ length: r.int(0, 6) }, (_, j) => ({ m: slot(j), t: nowT - (6 - j) * 15 * 60000, f: r.pick([0, px + r.range(-80, 80)]), oi: r.pick([0, r.range(1e6, 2e6)]), up: r.pick([null, r.int(0, 40)]), dn: r.pick([null, r.int(0, 40)]) }));
      const lv = r.pick([null, { aso: base + 50, ast: base + 100, bso: base - 50, bst: base - 100 }, { aso: base + r.range(-20, 20), ast: base + 60, bso: base - r.range(0, 30), bst: base - 80 }]);
      const walls = r.pick([null, { resistance: [{ strike: base + 120 }], support: [{ strike: base - 120 }] }, { resistance: [], support: [{ strike: px + r.range(-15, 15) }] }]);
      const oi = r.pick([null, { now: r.range(-8, 8), then: r.range(-8, 8), nowT: '12:00', thenT: '11:00' }]);
      const breadth = { up: r.int(0, 40), dn: r.int(0, 40) };
      const gift = r.pick([null, 0.1, 0.5, -0.6]);
      const heavy = r.pick([null, 0.2, -0.3, 0.01]);
      const name = r.pick(['NIFTY 50', 'NIFTY BANK']);

      const oiWithDelta = oi ? { ...oi, delta: oi.now - oi.then } : null;
      const nowSnap = { t: nowT, f: fut ? fut.ltp : 0, oi: fut ? fut.oi : 0 };
      const idxChg = open ? ((px - open) / open) * 100 : 0;
      const idxChgPrev = prev ? ((px - prev) / prev) * 100 : 0;
      const origCtx = { candles, px, open, fut, hist, nowSnap, levels: lv, walls, oi: oiWithDelta, breadth, gift, idxChg, idxChgPrev, heavy };
      const old = plain<unknown[]>(o.call('_lxChecks', name, plain(origCtx)));
      const mine = plain<unknown[]>(lxChecks(name, { name, candles, px, open, prev, fut, hist, nowMs: nowT, levels: lv, walls, oi, breadth, gift, heavy, compositeScore: null, strat: null, idxChg, idxChgPrev, nowSnap, oiDelta: oi ? oi.now - oi.then : null } as never));
      expect(mine, `case ${k}`).toEqual(old);
      for (const c of old as { key: string }[]) keys.add(c.key);
    }
    expect([...keys].sort()).toEqual(['avg', 'breadth', 'failed', 'futwin', 'gift', 'heavy', 'hold', 'oiwin', 'open', 'range', 'rwall', 'struct', 'swall', 'vwap']);
  });

  it('the morning view direction', () => {
    const table: [number | null | undefined, number | null, string | null][] = [];
    for (const f of [undefined, null, 1, -1, 0]) for (const sc of [null, 0.5, 1.5, -2.2]) for (const st of [null, 'Buy', 'Sell', 'Sideways']) table.push([f, sc, st]);
    for (const [f, sc, st] of table) {
      o.ctx['window'] = { _GTB_LAST_SCORE: sc };
      o.ctx['GTB_STRAT_LOOKUP'] = { 'ASO-ASO-ASO': { outcome: st ?? 'Sideways' } };
      (o.ctx['__store'] as Record<string, string>)['VALID_BREAKOUT_NINE_FIFTEEN'] = JSON.stringify({ 'NIFTY 50': { CLOSE_9_15: 'ASO' }, SENSEX: { CLOSE_9_15: 'AST' }, 'NIFTY BANK': { CLOSE_9_15: 'ASO' } });
      const old = plain(o.call('_lxViewDir', 'NIFTY 50', f));
      expect(plain(lxViewDir(f, sc, st))).toEqual(old);
    }
  });

  it('the whole read (status, agree / against, live number) on 1,500 random days of one index', () => {
    const r = rng(4040);
    const statuses = new Set<string>();
    for (let k = 0; k < 1500; k++) {
      const n = r.int(2, 40);
      const base = 24000;
      const candles = mkCandles(r, n, base, r.range(-8, 8));
      const iso = (i: number): string => `2026-11-20T${slot(i)}:00+0530`;
      const spotCandles = candles.map((c, i) => [iso(i), c.o, c.h, c.l, c.c, 0]);
      const ltp = candles[n - 1]!.c + r.range(-8, 8);
      const open = base + r.range(-30, 30);
      const prev = base + r.range(-50, 50);
      const score = r.pick([null, 0.4, 3, -3.5]);
      const forced = r.pick([undefined, undefined, 1, -1]);
      o.ctx['__now'] = Date.parse('2026-11-20T12:00:00+05:30');
      o.ctx['window'] = { _GTB_LAST_SCORE: score };
      Object.assign(o.ctx, { INSTRUMENT_SCORE_MAP: { 'NIFTY BANK': { oiData: { spotCandles } } }, __trend: null, _LX_HIST_DAY: '', _LX_HIST: [] });
      (o.ctx['__store'] as Record<string, string>)['INSTRUMENT_LTP_PRICE'] = JSON.stringify({ 'NIFTY BANK': { ltp } });
      (o.ctx['__store'] as Record<string, string>)['INSTRUMENT_LIST_GLOBAL'] = JSON.stringify({ 'NIFTY BANK': { price: open, prevPrice: prev } });
      (o.ctx['__store'] as Record<string, string>)['VALID_BREAKOUT_NINE_FIFTEEN'] = '{}';
      const old = plain<Record<string, unknown> | null>(o.call('_lxCompute', 'NIFTY BANK', forced));
      const inp: LxInputs = { name: 'NIFTY BANK', candles, px: ltp, open, prev, fut: null, hist: [], nowMs: Date.parse('2026-11-20T12:00:00+05:30'), levels: null, walls: null, oi: null, breadth: { up: 0, dn: 0 }, gift: null, heavy: null, forcedDir: forced, compositeScore: score, strat: null };
      const mine = plain<Record<string, unknown> | null>(lxCompute(inp));
      if (!old) {
        expect(mine).toBeNull();
        continue;
      }
      for (const key of ['name', 'px', 'view', 'checks', 'agree', 'against', 'live', 'status', 'snap', 'hhmm']) expect(mine![key], `${key} case ${k}`).toEqual(old[key]);
      statuses.add(String(old['status']));
    }
    expect([...statuses].sort()).toEqual(['NO VIEW', 'STALE', 'VALID', 'WEAKENING']);
  });
});
