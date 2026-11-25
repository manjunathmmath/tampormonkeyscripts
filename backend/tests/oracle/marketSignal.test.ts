import { describe, it, expect } from 'vitest';
import { marketSignalOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { GTB_STRAT_LOOKUP, marketSignal, tradeSignal } from '../../src/engine/marketSignal.js';

const ZONES = ['AST', 'ASO', 'B/W', 'BSO', 'BST', undefined, 'weird'];

describe('market signal: the port equals the original', () => {
  const o = marketSignalOracle();

  it('the 9:15 combo table is the original one, and the plan lookup matches for every combination', () => {
    expect(Object.keys(GTB_STRAT_LOOKUP)).toHaveLength(27);
    for (const a of ZONES)
      for (const b of ZONES)
        for (const c of ZONES) expect(plain(tradeSignal(a, b, c))).toEqual(plain(o.call('getTradeSignal', a, b, c)));
  });

  it('on 5,000 random states (score bands, VIX guard, futures conflicts, leading score, 9:15 cross-check)', () => {
    const r = rng(1357);
    const signals = new Set<string>();
    for (let k = 0; k < 5000; k++) {
      const score = r.pick([-12, -8, -6, -4.01, -4, -2, -1.5, 0, 1.5, 3, 4, 4.01, 6, 8, 11, r.range(-14, 14)]);
      const n915 = r.pick(ZONES.filter((z) => z !== undefined && z !== 'weird'));
      const sx915 = r.pick(ZONES.filter((z) => z !== undefined && z !== 'weird'));
      const bn915 = r.pick(ZONES.filter((z) => z !== undefined && z !== 'weird'));
      const n50Fut = r.pick([-1, 0, 1]);
      const bnFut = r.pick([-1, 0, 1]);
      // the seven 9:15 score globals and the six A/D and futures globals add up to the leading score
      const parts = Array.from({ length: 13 }, () => r.pick([-2, -1, 0, 1, 2, 0.5, -0.5]));
      const names = [
        'ALL_9_15_CLOSE_SCORE', 'NIFTY_50_9_15_CLOSE_SCORE', 'NIFTY_BANK_9_15_CLOSE_SCORE', 'GIFT_NIFTY_9_15_CLOSE_SCORE', 'SENSEX_9_15_CLOSE_SCORE', 'RELIANCE_9_15_CLOSE_SCORE', 'HDFCBANK_9_15_CLOSE_SCORE',
        'ALL_ADVANCE_DECLINE_SCORE', 'NIFTY_50_ADVANCE_DECLINE_SCORE', 'NIFTY_BANK_ADVANCE_DECLINE_SCORE', 'ALL_FUTURES_TREND_SCORE', 'NIFTY_50_FUTURES_TREND_SCORE', 'NIFTY_BANK_FUTURES_TREND_SCORE',
      ];
      names.forEach((n, i) => (o.ctx[n] = parts[i]));
      const leadingScore = parts.reduce((a, b) => a + b, 0);
      const flag = r.pick([[], [], [], ['ASO'], ['VIXU'], ['VIXL']]);
      const ltp = 24000 + r.range(-300, 300);
      const band = r.pick([{ U: 24200, L: 23800 }, { U: 24200, L: 24200 }, { U: NaN, L: NaN }]);
      const hasTrend = r.chance(0.9);
      o.ctx['__trend'] = hasTrend ? { trends: flag, ltp: String(ltp), vix: { vixDDUpper: String(band.U), vixDDLower: String(band.L) } } : null;
      o.ctx['INSTRUMENT_SCORE_MAP'] = { 'NIFTY 50': { futures_trend: n50Fut }, 'NIFTY BANK': { futures_trend: bnFut } };
      const b9 = { 'NIFTY 50': { CLOSE_9_15: n915 }, SENSEX: { CLOSE_9_15: sx915 }, 'NIFTY BANK': { CLOSE_9_15: bn915 } };

      const old = plain<Record<string, unknown>>(o.call('getMarketSignal', score, b9));
      const mine = plain<Record<string, unknown>>(
        marketSignal({
          score, n915, sx915, bn915, n50Fut, bnFut, leadingScore,
          nifty: hasTrend ? { trends: flag, ltp, vixDDUpper: band.U, vixDDLower: band.L } : null,
        }),
      );
      expect(mine['signal'], `signal ${k}`).toBe(old['signal']);
      expect(mine['reason'], `reason ${k}`).toBe(old['reason']);
      expect(mine['tradeSignal'], `plan ${k}`).toEqual(old['tradeSignal']);
      signals.add(String(mine['signal']));
    }
    expect([...signals].sort()).toEqual(['BUY', 'NO TRADE', 'SELL', 'SIDEWAYS', 'STRONG BUY', 'STRONG SELL', 'WAIT']);
  });
});
