import { describe, it, expect } from 'vitest';
import { extractFunction, futuresOracle, optionsOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { classifyFutures, computeFuturesSignals, computeIntradayVwap, futuresTrendScore, remarkFromSignals, type FutCandle } from '../../src/engine/futures.js';
import { bsPrice, calcIV, calculateIVSeries, calculateOBV, normCDF } from '../../src/engine/optionChain.js';
import type { Candle } from '../../src/kite/client.js';

describe('oracle loader', () => {
  it('extracts a function with braces and quotes inside strings and comments', () => {
    const src = `var a = 1;\nfunction f(x, y) {\n  // a } in a comment\n  var s = "}{" + '{' + \`}\${x}\`;\n  if (x) { return { a: 1 }; }\n  return s;\n}\nfunction g() { return 2; }`;
    const body = extractFunction(src, 'f');
    expect(body.startsWith('function f(x, y)')).toBe(true);
    expect(body.endsWith('return s;\n}')).toBe(true);
    expect(() => extractFunction(src, 'nope')).toThrow(/not found/);
  });
  it('loads the real userscript functions and they run', () => {
    const o = futuresOracle();
    expect(o.call('getFuturesTrendScore', 'SHOT_COVERING')).toBe(1);
    expect(o.call('getFuturesTrendScore', 'LONG_UNWINDING')).toBe(-1);
    const p = optionsOracle();
    expect(p.call('_normCDF', 0)).toBeCloseTo(0.5, 6);
  });
});

// ───────────── futures: random cases, original code against the port ─────────────
const fcOf = (r: ReturnType<typeof rng>): { cs: FutCandle[]; prev: { high: number; low: number; close: number; volume: number; oi: number | undefined }; lot: number; vix: number } => {
  const n = r.int(1, 40);
  let p = r.range(500, 30000);
  let oi = r.range(1e5, 2e7);
  const hasOi = r.chance(0.85);
  const cs: FutCandle[] = [];
  for (let i = 0; i < n; i++) {
    const o = p;
    p = p * (1 + r.range(-0.004, 0.004));
    const high = Math.max(o, p) * (1 + r.range(0, 0.0015));
    const low = Math.min(o, p) * (1 - r.range(0, 0.0015));
    oi = oi * (1 + r.range(-0.02, 0.02));
    cs.push({ date: '', open: o, high, low, close: p, volume: r.chance(0.05) ? 0 : Math.round(r.range(1, 3e5)), oi: hasOi ? Math.round(oi) : undefined });
  }
  const prevClose = cs[0]!.open * (1 + r.range(-0.02, 0.02));
  return {
    cs,
    prev: { high: prevClose * 1.01, low: prevClose * 0.99, close: prevClose, volume: Math.round(r.range(1e5, 5e6)), oi: Math.round(oi * (1 + r.range(-0.1, 0.1))) },
    lot: r.pick([1, 25, 75, 250, 500, 1000]),
    vix: r.pick([0, 0, 8, 13, 16, 22, 35, 60]),
  };
};

describe('futures: the port equals the original on random cases', () => {
  const o = futuresOracle();
  it('classifier (remark, score, every signal, VWAP, change) on 1,500 cases', () => {
    const r = rng(20261121);
    let seen: Record<string, number> = {};
    for (let k = 0; k < 1500; k++) {
      const c = fcOf(r);
      const q = { high: Math.max(...c.cs.map((x) => x.high)), low: Math.min(...c.cs.map((x) => x.low)), close: c.cs[c.cs.length - 1]!.close, volume: c.cs.reduce((a, x) => a + x.volume, 0), oi: c.cs[c.cs.length - 1]!.oi };
      const old = plain<{ remark: string; dir: number; signals: Record<string, unknown>; vwap: number; pChange: number }>(o.call('_gtbClassifyFutures', plain(q), plain(c.prev), c.lot, plain(c.cs), { vix: c.vix, baselineVix: 13 }));
      const mine = plain<typeof old>(classifyFutures(q, c.prev, c.lot, c.cs, { vix: c.vix, baselineVix: 13 }));
      expect(mine, `case ${k}`).toEqual(old);
      seen[old.remark] = (seen[old.remark] ?? 0) + 1;
    }
    // the random cases must actually exercise several remarks, or the test proves little
    expect(Object.keys(seen).length).toBeGreaterThanOrEqual(5);
    seen = {};
  });
  it('VWAP, trend score and remark mapping', () => {
    const r = rng(7);
    for (let k = 0; k < 300; k++) {
      const c = fcOf(r);
      expect(computeIntradayVwap(c.cs)).toBe(o.call('computeIntradayVwap', plain(c.cs)));
    }
    for (const rem of ['LONG', 'SHORT', 'SHOT_COVERING', 'LONG_UNWINDING', 'BEARS_COMING_SELL_ON_RISE', 'GAMBLING_BUY_NEWS_AND_EVENTS', 'CAUTION_WRITES_ERODING_PREMIUM', 'BULLS_CONSOLIDATING', 'BEARS_CONSOLIDATING', 'NO_CLEAR_SIGNAL', 'DEFENCE_BUY_ON_DECLINE', 'x']) {
      expect(futuresTrendScore(rem)).toBe(o.call('getFuturesTrendScore', rem));
    }
    const prices = ['+', '-', '+-'] as const;
    for (const price of prices) for (const oi of prices) for (const sc of [true, false]) for (const av of [true, false]) for (const pc of [0, 5, 10, 25]) {
      const s = { price, oi, shortCoveringOrLongUnwinding: sc, aboveVwap: av };
      expect(remarkFromSignals(s, pc)).toBe(o.call('_gtbRemarkFromSignals', s, pc));
    }
  });
  it('signals alone, with the premium option', () => {
    const r = rng(99);
    for (let k = 0; k < 300; k++) {
      const c = fcOf(r);
      const last = c.cs[c.cs.length - 1]!.close;
      const args = [c.cs, last * r.range(0.99, 1.01), last, r.range(-1, 1), String(r.range(-500, 500).toFixed(2)), String(r.range(-8, 8).toFixed(2))] as const;
      const opts = { vix: c.vix, baselineVix: 13, dayOpenOI: r.chance(0.5) ? 1000 : null, currOI: r.range(900, 1100), premium: r.chance(0.3) ? 5 : null, prevPremium: r.chance(0.3) ? 4 : null };
      expect(plain(computeFuturesSignals(args[0], args[1], args[2], args[3], args[4], args[5], opts))).toEqual(plain(o.call('computeFuturesSignals', plain(args[0]), args[1], args[2], args[3], args[4], args[5], opts)));
    }
  });
});

// ───────────── Black-Scholes, IV, OBV ─────────────
describe('options maths: the port equals the original', () => {
  const o = optionsOracle();
  it('normal CDF, BS price and the IV solver (including bad input)', () => {
    const r = rng(31337);
    for (let k = 0; k < 600; k++) {
      const x = r.range(-6, 6);
      expect(normCDF(x)).toBe(o.call('_normCDF', x));
      const S = r.range(50, 30000);
      const K = S * r.range(0.9, 1.1);
      const T = r.range(0, 0.4);
      const sigma = r.range(0, 1.2);
      const call = r.chance(0.5);
      expect(bsPrice(S, K, T, 0.065, sigma, call)).toBe(o.call('_bsPrice', S, K, T, 0.065, sigma, call));
      const price = r.chance(0.8) ? bsPrice(S, K, Math.max(T, 0.002), 0.065, r.range(0.05, 0.9), call) : r.range(-5, S * 0.05);
      expect(calcIV(price, S, K, T, 0.065, call)).toBe(o.call('calcIV', price, S, K, T, 0.065, call));
    }
  });
  it('IV series and OBV on random candles', () => {
    const r = rng(424242);
    for (let k = 0; k < 120; k++) {
      const n = r.int(1, 60);
      const day = '2026-11-20';
      const mkc = (price: number, vol: number, i: number): Candle => {
        const m = 9 * 60 + 15 + i * 5;
        const t = `${day}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00+0530`;
        return [t, price, price, price, price, vol, 1000];
      };
      let spotP = r.range(20000, 26000);
      let optP = r.range(5, 400);
      const spot: Candle[] = [];
      const opt: Candle[] = [];
      for (let i = 0; i < n; i++) {
        spotP *= 1 + r.range(-0.002, 0.002);
        optP = Math.max(0.05, optP * (1 + r.range(-0.06, 0.06)));
        if (!r.chance(0.1)) spot.push(mkc(spotP, 0, i));
        opt.push(mkc(optP, Math.round(r.range(0, 5e5)), i));
      }
      const strike = Math.round(spotP / 50) * 50;
      const call = r.chance(0.5);
      const expiry = r.pick(['21-11-2026', '24-11-2026', '27-11-2026', '31-12-2026']);
      expect(plain(calculateIVSeries(opt, strike, call, expiry, spot))).toEqual(plain(o.call('calculateIVSeries', plain(opt), strike, call, expiry, plain(spot))));
      const prev: Candle[] = [['2026-11-19T00:00:00+0530', 1, 1, 1, r.range(5, 400), 1, 1]];
      expect(plain(calculateOBV(prev, opt))).toEqual(plain(o.call('calculateOBVFiveMinutesInterval', plain(prev), plain(opt))));
    }
  });
});
