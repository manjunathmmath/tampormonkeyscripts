import { describe, it, expect } from 'vitest';
import { plain, scoreOracle } from './oracle.js';
import { rng } from './rng.js';
import { table } from './gen.js';
import { calculateVixRange, getVixRange, makeTrend } from '../../src/engine/trend.js';
import { currentTrendScore, instrumentScore, mcxTrendScore, nineFifteenScore } from '../../src/engine/score.js';
import { strikeDetails as getStrikeDetails } from '../../src/engine/levels.js';
import { computeMaxPainGEX, ivSkewScore, maxPainScore } from '../../src/engine/oi.js';

describe('VIX range: the port equals the original', () => {
  const o = scoreOracle();
  it('daily, weekly and monthly bands for random prices and VIX values', () => {
    const r = rng(11);
    for (let k = 0; k < 500; k++) {
      const prev = r.range(50, 90000);
      const vix = r.range(8, 40);
      for (const t of ['DAILY', 'WEEKLY', 'MONTHLY'] as const) expect(calculateVixRange(t, prev, vix)).toEqual(plain(o.call('calculateVixRange', t, prev, vix)));
      expect(getVixRange(prev, vix)).toEqual(plain(o.call('getVixRange', prev, vix)));
    }
    expect(getVixRange('24000', '16')).toEqual(plain(o.call('getVixRange', '24000', '16'))); // strings, as stored
  });
});

describe('trend flags and change figures: the port equals the original generateTrend', () => {
  const o = scoreOracle();
  const store = (k: string, v: unknown): void => void (o.ctx['__store'] as Record<string, string>)[k]!; // type helper only
  void store;
  const setState = (name: string, ltp: number, open: number, prev: number, vixPrev: number, diff: string): void => {
    const s = o.ctx['__store'] as Record<string, string>;
    s['INSTRUMENT_LTP_PRICE'] = JSON.stringify({ [name]: { ltp } });
    s['INSTRUMENT_LIST_GLOBAL'] = JSON.stringify({ [name]: { price: open, prevPrice: prev, perc: 0 } });
    s['VIX_QUOTE'] = JSON.stringify({ data: { candles: [['t', 1, 1, 1, vixPrev]] } });
    (o.ctx['NSE_STRIKE_DIFF'] as Record<string, string>)[name] = diff;
  };

  it('on 2,000 random prices (levels, VIX bands, at-or-beyond ties, change %)', () => {
    const r = rng(2026);
    const seen = new Set<string>();
    for (let k = 0; k < 2000; k++) {
      const open = r.range(100, 70000);
      const prev = open * (1 + r.range(-0.02, 0.02));
      const diff = r.pick(['50,50', '100,100', '10,20', '5,10', '25,25']);
      const parts = diff.split(',').map(Number);
      const levels = [open + parts[0]!, open + parts[0]! + parts[1]!, open - parts[0]!, open - parts[0]! - parts[1]!];
      // prices spread over the whole ladder, sometimes exactly on a level
      const ltp = r.chance(0.2) ? r.pick(levels) : open * (1 + r.range(-0.012, 0.012));
      const vixPrev = r.range(9, 30);
      setState('X', ltp, open, prev, vixPrev, diff);
      const old = plain<{ trends: string[]; change: string; open_perc: string; strikeData: Record<string, string>; vix: unknown; ltp: number }>(o.call('generateTrend', 'X'));
      const mine = makeTrend({ ltp, open, prevPrice: prev, strikeData: getStrikeDetails(open, diff), prevVixClose: vixPrev });
      expect(mine.trends, `trends ${k}`).toEqual(old.trends);
      expect(mine.change).toBe(old.change);
      expect(mine.open_perc).toBe(old.open_perc);
      expect(mine.vix).toEqual(old.vix);
      expect(mine.strikeData.aso).toBe(parseFloat(old.strikeData['ustrikeOne']!));
      expect(mine.strikeData.ast).toBe(parseFloat(old.strikeData['ustrikeTwo']!));
      expect(mine.strikeData.bso).toBe(parseFloat(old.strikeData['bstrikeOne']!));
      expect(mine.strikeData.bst).toBe(parseFloat(old.strikeData['bstrikeTwo']!));
      old.trends.forEach((t) => seen.add(t));
    }
    expect([...seen].sort()).toEqual(['AST', 'ASO', 'BSO', 'BST', 'VIXL', 'VIXU'].sort());
  });
});

describe('instrument score: the port equals the original computeInstrumentScore', () => {
  const o = scoreOracle();
  it('on 1,500 random instruments (zone, trend, futures, OI/OBV cap, max pain, skew)', () => {
    const r = rng(8080);
    const totals = new Set<number>();
    for (let k = 0; k < 1500; k++) {
      const { rows } = table(r);
      const s = o.ctx['__store'] as Record<string, string>;
      const map = o.ctx['INSTRUMENT_SCORE_MAP'] as Record<string, unknown>;
      const zone = r.pick([undefined, 'AST', 'ASO', 'B/W', 'BSO', 'BST', 'weird']);
      s['VALID_BREAKOUT_NINE_FIFTEEN'] = JSON.stringify(zone === undefined ? {} : { X: { CLOSE_9_15: zone } });
      const open = r.range(500, 60000);
      const prev = open * (1 + r.range(-0.015, 0.015));
      const diff = r.pick(['50,50', '100,100', '10,20']);
      const parts = diff.split(',').map(Number);
      const ltp = open * (1 + r.range(-0.01, 0.01));
      s['INSTRUMENT_LTP_PRICE'] = JSON.stringify({ X: { ltp } });
      s['INSTRUMENT_LIST_GLOBAL'] = JSON.stringify({ X: { price: open, prevPrice: prev, perc: 0 } });
      const vixOk = r.chance(0.95);
      s['VIX_QUOTE'] = vixOk ? JSON.stringify({ data: { candles: [['t', 1, 1, 1, r.range(9, 30)]] } }) : 'null';
      (o.ctx['NSE_STRIKE_DIFF'] as Record<string, string>)['X'] = diff;
      const fut = r.pick([undefined, 1, 0, -1]);
      const oiObv = r.pick([undefined, 0, 1.75, -2.5, 6, -9, 13.5, 0.3]);
      const skew = r.pick([null, 0, 3, -3, 1]);
      const entry: Record<string, unknown> = { oiData: { tableData: plain(rows) }, oiExtras: { ivSkew: skew } };
      if (fut !== undefined) entry['futures_trend'] = fut;
      if (oiObv !== undefined) entry['oi_obv'] = oiObv;
      map['X'] = entry;
      const old = plain(o.call('computeInstrumentScore', 'X'));

      // the port: the parts are computed with the already-verified functions, then summed
      let trends: readonly string[] | undefined;
      if (vixOk) {
        const vixPrev = JSON.parse(s['VIX_QUOTE']!).data.candles[0][4] as number;
        trends = makeTrend({ ltp, open, prevPrice: prev, strikeData: getStrikeDetails(open, diff), prevVixClose: vixPrev }).trends;
      }
      const mp = computeMaxPainGEX(rows);
      const mine = instrumentScore({ zone, trends, futuresTrend: fut, oiObv, maxPain: maxPainScore(mp), ivSkew: ivSkewScore(skew) });
      expect(plain(mine), `case ${k}`).toEqual(old);
      totals.add(mine.total);
      void parts;
    }
    expect(totals.size).toBeGreaterThan(15); // the cases produce many different totals
  });

  it('small helpers: zone score, trend priority, commodity levels and the +-3 cap', () => {
    expect([nineFifteenScore('AST'), nineFifteenScore('ASO'), nineFifteenScore('B/W'), nineFifteenScore('BSO'), nineFifteenScore('BST'), nineFifteenScore(undefined)]).toEqual([2, 1, 0, -1, -2, 0]);
    expect(currentTrendScore(['ASO', 'AST'])).toBe(2);
    expect(currentTrendScore(['BSO', 'BST', 'VIXL'])).toBe(-2);
    expect(currentTrendScore(['VIXU'])).toBe(0);
    expect(currentTrendScore(undefined)).toBe(0);
    const m = { ustrikeOne: '101', ustrikeTwo: '102', bstrikeOne: '99', bstrikeTwo: '98' };
    expect([mcxTrendScore(102, m), mcxTrendScore(101.5, m), mcxTrendScore(100, m), mcxTrendScore(99, m), mcxTrendScore(97, m)]).toEqual([2, 1, 0, -1, -2]);
    expect(mcxTrendScore(105, { ...m, ustrikeTwo: 'x' })).toBe(1); // a missing level is skipped
    expect(instrumentScore({ oiObv: 13.5 }).total).toBe(3); // capped contribution
    expect(instrumentScore({ oiObv: 13.5 }).oi_obv).toBe(13.5); // the field itself stays raw
  });
});

describe('MCX trend variant (the original block)', () => {
  const o = scoreOracle();
  it('matches the original for commodities', () => {
    const r = rng(5);
    for (let k = 0; k < 300; k++) {
      const m = { ustrikeOne: r.range(100, 110), ustrikeTwo: r.range(110, 120), bstrikeOne: r.range(90, 100), bstrikeTwo: r.range(80, 90) };
      const px = r.range(78, 122);
      o.ctx['__mcx'] = true;
      const s = o.ctx['__store'] as Record<string, string>;
      s['VALID_BREAKOUT_NINE_FIFTEEN'] = '{}';
      (o.ctx['INSTRUMENT_SCORE_MAP'] as Record<string, unknown>)['C'] = { strikeMap: m, mcxLtp: px };
      const old = plain<{ current_trend: number }>(o.call('computeInstrumentScore', 'C'));
      expect(mcxTrendScore(px, m)).toBe(old.current_trend);
    }
    o.ctx['__mcx'] = false;
  });
});
