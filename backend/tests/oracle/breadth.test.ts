import { describe, it, expect } from 'vitest';
import { breadthOracle, futuresOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { advanceDeclineScores, futuresTrendScores, all915Score, cappedOiObv, componentScore, type AdStock, type FutStock } from '../../src/engine/breadth.js';
import { remarkOfCandle } from '../../src/engine/futures.js';

const slot = (i: number): string => {
  const m = 15 + i * 5;
  return `${String(9 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const iso = (i: number): string => `2026-11-20T${slot(i)}:00+0530`;

describe('remark of one candle: the port equals showTableAiNiftyPrediction', () => {
  const o = breadthOracle();
  it('on 4,000 random candles (VWAP blend, missing volume, OI base of zero)', () => {
    const r = rng(2026);
    const seen = new Set<string>();
    for (let k = 0; k < 4000; k++) {
      const base = r.range(100, 5000);
      const q = { open: base, high: base * 1.01, low: base * 0.99, close: base * (1 + r.range(-0.012, 0.012)), volume: r.pick([0, 10, 5000, 120000]), oi: r.pick([undefined, 0, 1000000, 3000000]) };
      const p = { open: base, high: base * 1.015, low: base * 0.985, close: base * (1 + r.range(-0.01, 0.01)), volume: r.pick([0, 20, 90000]), oi: r.pick([0, 1500000, 2500000, 2000000]) };
      const lot = r.pick([1, 25, 250, 1500]);
      const old = plain<{ REMARK: string }>(o.call('showTableAiNiftyPrediction', { ...q }, { ...p }, lot));
      const mine = remarkOfCandle(q, p, lot);
      expect(mine, `case ${k}`).toBe(old.REMARK);
      seen.add(mine);
    }
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe('market-wide scores: the port equals the original scanners', () => {
  const o = breadthOracle();
  it('advance / decline and futures trend on 60 random markets of 12 stocks', async () => {
    const r = rng(777);
    const outcomes = new Set<string>();
    for (let k = 0; k < 60; k++) {
      const names = Array.from({ length: 12 }, (_, i) => `S${i}`);
      const nifty = new Set(names.filter(() => r.chance(0.5)));
      const bank = new Set(names.filter(() => r.chance(0.3)));
      const nCandles = r.int(2, 20);
      const hist: Record<string, unknown> = {};
      const levels: Record<string, unknown> = {};
      const futList: unknown[] = [];
      const adStocks: AdStock[] = [];
      const futStocks: FutStock[] = [];
      const allNames = [...names, 'NIFTY 50', 'NIFTY BANK'];
      allNames.forEach((n, idx) => {
        const token = 1000 + idx;
        const open = r.range(200, 3000);
        const aso = open * 1.003;
        const bso = open * 0.997;
        levels[n] = { ustrikeOne: String(aso), bstrikeOne: String(bso) };
        (o.ctx['INSTRUMENT_TOKENS'] as Record<string, number>)[n] = token;
        // some stocks skip a slot or miss entirely, like a thinly traded name
        const slots = Array.from({ length: nCandles }, (_, i) => i).filter((i) => idx === 0 || r.chance(0.92));
        let px = open;
        const candles = slots.map((i) => {
          px *= 1 + r.range(-0.004, 0.004);
          return [iso(i), px, px * 1.001, px * 0.999, px, r.int(100, 9000), 0];
        });
        hist[`${token}|5minute`] = candles;
        const fut = names.includes(n) || n === 'NIFTY 50' || n === 'NIFTY BANK';
        const ftoken = 5000 + idx;
        const lot = r.pick([25, 250, 1500]);
        futList.push({ name: n === 'NIFTY 50' ? 'NIFTY' : n === 'NIFTY BANK' ? 'BANKNIFTY' : n, instrument_token: ftoken, lot_size: lot });
        const prevOi = r.pick([1500000, 2000000, 0]);
        hist[`${ftoken}|day`] = [['2026-11-19T00:00:00+0530', open, open * 1.01, open * 0.99, open, r.int(50000, 900000), prevOi]];
        let fpx = open;
        let oi = prevOi || 1000000;
        const fc = slots.map((i) => {
          fpx *= 1 + r.range(-0.004, 0.004);
          oi *= 1 + r.range(-0.01, 0.01);
          return [iso(i), fpx, fpx * 1.001, fpx * 0.999, fpx, r.int(2000, 90000), Math.round(oi)];
        });
        hist[`${ftoken}|5minute`] = fc;
        void fut;
        if (names.includes(n)) {
          adStocks.push({ name: n, inNifty50: nifty.has(n), inBank: bank.has(n), aso, bso, candles: candles.map((c) => ({ time: slot(slots[candles.indexOf(c)]!), close: c[4] as number })) });
        }
        const prev = { high: open * 1.01, low: open * 0.99, close: open, volume: (hist[`${ftoken}|day`] as number[][])[0]![5]!, oi: prevOi };
        futStocks.push({
          name: n,
          inNifty50: nifty.has(n),
          inBank: bank.has(n),
          remarks: fc.map((c, ci) => ({ time: slot(slots[ci]!), remark: remarkOfCandle({ open: c[1] as number, high: c[2] as number, low: c[3] as number, close: c[4] as number, volume: c[5] as number, oi: c[6] as number }, prev, lot) })),
        });
      });
      Object.assign(o.ctx, { __hist: hist, __levels: levels, __scan: names, NIFTY_50_LIST: [...nifty], NIFTY_BANK_LIST: [...bank], FUTURE_INTRUMENT_LIST: futList });
      for (const nme of ['ALL_ADVANCE_DECLINE_SCORE', 'NIFTY_50_ADVANCE_DECLINE_SCORE', 'NIFTY_BANK_ADVANCE_DECLINE_SCORE', 'ALL_FUTURES_TREND_SCORE', 'NIFTY_50_FUTURES_TREND_SCORE', 'NIFTY_BANK_FUTURES_TREND_SCORE']) o.ctx[nme] = 0;

      try {
        await (o.call('showAdvacenDeclineScanner') as Promise<unknown>);
      } catch {
        /* the drawing after the scores is not run */
      }
      try {
        await (o.call('showFuturesTrend') as Promise<unknown>);
      } catch {
        /* same */
      }

      const ad = advanceDeclineScores(adStocks);
      expect(ad.all, `ad all ${k}`).toBe(o.ctx['ALL_ADVANCE_DECLINE_SCORE']);
      expect(ad.nifty, `ad nifty ${k}`).toBe(o.ctx['NIFTY_50_ADVANCE_DECLINE_SCORE']);
      expect(ad.bank, `ad bank ${k}`).toBe(o.ctx['NIFTY_BANK_ADVANCE_DECLINE_SCORE']);
      const ft = futuresTrendScores(futStocks);
      expect(ft.all, `ft all ${k}`).toBe(o.ctx['ALL_FUTURES_TREND_SCORE']);
      expect(ft.nifty, `ft nifty ${k}`).toBe(o.ctx['NIFTY_50_FUTURES_TREND_SCORE']);
      expect(ft.bank, `ft bank ${k}`).toBe(o.ctx['NIFTY_BANK_FUTURES_TREND_SCORE']);
      outcomes.add(`${ad.all}/${ft.all}`);
    }
    expect(outcomes.size).toBeGreaterThan(2);
  });

  it('small score helpers', () => {
    expect(all915Score({ A: 'AST', B: 'ASO', C: 'BSO', D: 'B/W' })).toBe(0.5); // (2 + 1 - 1) / (2 + 1 + 1)
    expect(all915Score({})).toBe(0);
    expect(cappedOiObv(13.5)).toBe(3);
    expect(cappedOiObv(-9)).toBe(-3);
    expect(cappedOiObv(undefined)).toBe(0);
    expect(componentScore([{ total: 4, weight: 10 }, { total: -2, weight: 5 }])).toBe(0.3);
  });
});

// the futures oracle is imported so a missing export fails loudly if the loader is renamed
void futuresOracle;
