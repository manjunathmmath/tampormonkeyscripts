import { describe, it, expect } from 'vitest';
import { comboOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { buildRows, classify915, comboStats, dayMap, legsFor, simLeg, type DayData } from '../../src/engine/combo.js';

const NAMES = ['NIFTY 50', 'SENSEX', 'NIFTY BANK', 'GIFT NIFTY'];
const DIFFS: Record<string, string> = { 'NIFTY 50': '50,50', SENSEX: '100,100', 'NIFTY BANK': '100,100', 'GIFT NIFTY': '50,50' };

/** weekdays going back from yesterday */
const days = (n: number): string[] => {
  const out: string[] = [];
  const d = new Date(Date.now() - 86400000);
  while (out.length < n) {
    if (![0, 6].includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out.reverse();
};
const ts = (day: string, i: number): string => `${day}T${String(9 + Math.floor((15 + i * 5) / 60)).padStart(2, '0')}:${String((15 + i * 5) % 60).padStart(2, '0')}:00+0530`;

describe('9:15 combo backtest: the ports equal the original', () => {
  const o = comboOracle();
  Object.assign(o.ctx['NSE_STRIKE_DIFF'] as Record<string, string>, DIFFS);

  it('classification, legs and one simulated leg on 3,000 random days', () => {
    const r = rng(915);
    const kinds = new Set<string>();
    for (let k = 0; k < 3000; k++) {
      const name = r.pick(NAMES);
      const open = r.range(500, 60000);
      const step = parseInt(DIFFS[name]!.split(',')[0]!, 10);
      const close = open + r.range(-3.2, 3.2) * step;
      expect(classify915(name, open, close, DIFFS)).toBe(o.call('_gtbClassify915', name, open, close));
      const n = r.int(1, 45);
      let p = open;
      const cands = Array.from({ length: n }, (_, i) => {
        const o2 = p;
        p += r.range(-1.4, 1.4) * step;
        return [ts('2026-11-18', i), o2, Math.max(o2, p) + r.range(0, step * 0.4), Math.min(o2, p) - r.range(0, step * 0.4), p, 0];
      });
      const dir = r.pick(['long', 'short'] as const);
      const cut = r.pick([12, 12, 10, 15]);
      const old = plain(o.call('_gtbSimLeg', dir, plain(cands), open, name, cut));
      const mine = plain(simLeg(dir, cands, open, name, DIFFS, cut));
      expect(mine, `leg ${k}`).toEqual(old);
      if (mine) kinds.add(`${(mine as { entryType: string }).entryType}/${(mine as { tpsl: string }).tpsl}`);
    }
    for (const out of ['Buy', 'Sell', 'Buy/Sell', 'Sideways', 'x']) expect(legsFor(out)).toEqual(plain(o.call('_gtbLegsFor', out)));
    expect(kinds.size).toBeGreaterThan(4);
  });

  it('the day-wise table on 20 random years of four instruments (zones, combos, legs, VIX bands, GIFT legs)', async () => {
    const r = rng(2026);
    const combos = new Set<string>();
    for (let k = 0; k < 20; k++) {
      const ds = days(r.int(6, 30));
      const hist: Record<string, unknown[]> = {};
      const mineBy: Record<string, Record<string, DayData>> = {};
      const vix: Record<string, number> = {};
      const vixCandles: unknown[] = [];
      for (const d of ds) {
        const v = r.range(10, 28);
        vix[d] = v;
        vixCandles.push([`${d}T00:00:00+0530`, v, v, v, v]);
      }
      const mkTok = (name: string): number => 100 + NAMES.indexOf(name);
      for (const name of NAMES) {
        (o.ctx['INSTRUMENT_TOKENS'] as Record<string, number>)[name] = mkTok(name);
        let base = name === 'NIFTY BANK' ? 52000 : name === 'SENSEX' ? 80000 : 24000;
        const step = parseInt(DIFFS[name]!.split(',')[0]!, 10);
        const all: unknown[][] = [];
        for (const d of ds) {
          if (name === 'GIFT NIFTY' && r.chance(0.1)) continue; // a day without GIFT data
          let p = base * (1 + r.range(-0.006, 0.006));
          const n = r.int(3, 46);
          for (let i = 0; i < n; i++) {
            const o2 = p;
            p += r.range(-1.2, 1.2) * step;
            all.push([ts(d, i), o2, Math.max(o2, p) + r.range(0, step * 0.3), Math.min(o2, p) - r.range(0, step * 0.3), p, 0]);
          }
          base = p;
        }
        hist[`${mkTok(name)}|5minute`] = all;
        mineBy[name] = dayMap(name, all as never, DIFFS);
      }
      hist['264969|day'] = vixCandles;
      (o.ctx['INSTRUMENT_TOKENS'] as Record<string, number>)['INDIA VIX'] = 264969;
      o.ctx['__hist'] = hist;
      o.ctx['__store'] = {};
      const lookback = r.pick([5, 250]);
      const old = plain<unknown[]>(await (o.call('_gtbBuild915Trend', lookback) as Promise<unknown>));
      const mine = plain<unknown[]>(buildRows(mineBy, vix, lookback, DIFFS));
      expect(mine, `case ${k}`).toEqual(old);
      for (const row of old as { key: string }[]) combos.add(row.key);
    }
    expect(combos.size).toBeGreaterThan(8);
  });

  it('combo statistics split by entry type', () => {
    const rows = [
      { key: 'A', legs: [{ win: true, entryType: 'level' }, { win: false, entryType: 'trend' }] },
      { key: 'A', legs: [{ win: true, entryType: 'trend' }] },
      { key: 'B', legs: [] },
    ] as never;
    expect(comboStats(rows, 'A')).toEqual({ legs: 3, win: 2, winPct: 67, lvlLegs: 1, lvlPct: 100, trdLegs: 2, trdPct: 50 });
    expect(comboStats(rows, 'B')).toBeNull();
  });
});
