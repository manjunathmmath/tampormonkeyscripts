import { describe, it, expect } from 'vitest';
import { predictOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { predict } from '../../src/engine/predict.js';
import { comboStats, type ComboRow } from '../../src/engine/combo.js';
import { strikeDetails } from '../../src/engine/levels.js';

const ZONES = ['AST', 'ASO', 'B/W', 'BSO', 'BST'];
const today = (): string => new Date().toLocaleDateString('en-CA'); // the local date, as moment().format('YYYY-MM-DD') gives it

describe('Predict (9:15 combo): the port equals _gtbBuildPrediction', () => {
  const o = predictOracle();
  (o.ctx['NSE_STRIKE_DIFF'] as Record<string, string>)['NIFTY 50'] = '50,50';

  it('on 3,000 random days (every combo, backtest present or not, VIX regimes, VIXU / VIXL, lagging switch, price gate)', () => {
    const r = rng(1515);
    const actions = new Set<string>();
    const outcomes = new Set<string>();
    for (let k = 0; k < 3000; k++) {
      const zones = { nifty: r.pick([null, ...ZONES]), sensex: r.pick([null, ...ZONES]), bank: r.pick([null, ...ZONES]), gift: r.pick([null, ...ZONES]) };
      const nine = (z: string | null): number => (z === 'AST' ? 2 : z === 'ASO' ? 1 : z === 'BST' ? -2 : z === 'BSO' ? -1 : 0);
      const g = {
        ALL_9_15_CLOSE_SCORE: r.pick([-1, -0.4, 0, 0.5, 1]), NIFTY_50_9_15_CLOSE_SCORE: nine(zones.nifty), NIFTY_BANK_9_15_CLOSE_SCORE: nine(zones.bank), GIFT_NIFTY_9_15_CLOSE_SCORE: nine(zones.gift), SENSEX_9_15_CLOSE_SCORE: nine(zones.sensex),
        ALL_ADVANCE_DECLINE_SCORE: r.pick([-1, -0.3, 0, 0.4, 1]), NIFTY_50_ADVANCE_DECLINE_SCORE: r.pick([-0.5, 0, 0.5]), NIFTY_BANK_ADVANCE_DECLINE_SCORE: r.pick([-0.5, 0, 0.5]),
        ALL_FUTURES_TREND_SCORE: r.pick([-1, 0, 1]), NIFTY_50_FUTURES_TREND_SCORE: r.pick([-1, 0, 1]), NIFTY_BANK_FUTURES_TREND_SCORE: r.pick([-1, 0, 1]),
        NIFTY_50_OI_OBV_SCORE: r.pick([-3, -1, 0, 2, 3]), NIFTY_BANK_OI_OBV_SCORE: r.pick([-3, -1, 0, 3]), NIFTY_50_MAX_PAIN_SCORE: r.pick([-1, 0, 1]), NIFTY_BANK_MAX_PAIN_SCORE: r.pick([-1, 0, 1]),
        NIFTY_50_IV_SKEW_SCORE: r.pick([-1, 0, 1]), NIFTY_BANK_IV_SKEW_SCORE: r.pick([-1, 0, 1]), NIFTY_50_COMPONENT_SCORE: r.pick([-1.2, -0.2, 0, 0.3, 1.1]), NIFTY_BANK_COMPONENT_SCORE: r.pick([-0.9, 0, 0.7]),
      };
      Object.assign(o.ctx, g);
      const n50Fut = r.pick([-1, 0, 1]);
      const bnFut = r.pick([-1, 0, 1]);
      const open = 24000 + r.range(-60, 60);
      const ltp = open + r.range(-120, 120);
      const avwap = r.pick([0, open + r.range(-80, 80)]);
      const pcr = r.pick([undefined, 0.6, 1, 1.5]);
      const vix = r.pick([0, 11, 15, 20, 26]);
      const flags = r.pick([[], [], ['ASO'], ['VIXU'], ['VIXL']]);
      const lagging = r.chance(0.5);
      const gateOk = r.pick([null, true, false]);
      // a backtest of today's combos, when there is one
      const key = `${zones.nifty === 'AST' ? 'ASO' : zones.nifty === 'BST' ? 'BSO' : zones.nifty || 'B/W'}-${zones.sensex === 'AST' ? 'ASO' : zones.sensex === 'BST' ? 'BSO' : zones.sensex || 'B/W'}-${zones.bank === 'AST' ? 'ASO' : zones.bank === 'BST' ? 'BSO' : zones.bank || 'B/W'}`;
      const rows = r.chance(0.6) ? ([{ key, legs: Array.from({ length: r.int(0, 12) }, () => ({ win: r.chance(0.55), entryType: r.pick(['level', 'trend']) })) }] as unknown as ComboRow[]) : null;

      const store = o.ctx['__store'] as Record<string, string>;
      for (const kk of Object.keys(store)) delete store[kk];
      store['VALID_BREAKOUT_NINE_FIFTEEN'] = JSON.stringify({ ...(zones.nifty ? { 'NIFTY 50': { CLOSE_9_15: zones.nifty } } : {}), ...(zones.sensex ? { SENSEX: { CLOSE_9_15: zones.sensex } } : {}), ...(zones.bank ? { 'NIFTY BANK': { CLOSE_9_15: zones.bank } } : {}), ...(zones.gift ? { 'GIFT NIFTY': { CLOSE_9_15: zones.gift } } : {}) });
      if (rows) store[`GTB_915TREND_${today()}_250_v8`] = JSON.stringify(rows);
      store['INSTRUMENT_LTP_PRICE'] = JSON.stringify({ 'NIFTY 50': { ltp }, 'INDIA VIX': { ltp: vix } });
      store['INSTRUMENT_LIST_GLOBAL'] = JSON.stringify({ 'NIFTY 50': { price: open, prevPrice: open - 20 } });
      store['GTB_INCLUDE_LAGGING'] = lagging ? '1' : '0';
      (o.ctx['INSTRUMENT_SCORE_MAP'] as Record<string, unknown>)['NIFTY 50'] = { futures_trend: n50Fut, ...(avwap ? { avwap } : {}), ...(pcr ? { pcr } : {}) };
      (o.ctx['INSTRUMENT_SCORE_MAP'] as Record<string, unknown>)['NIFTY BANK'] = { futures_trend: bnFut };
      o.ctx['__trend'] = { trends: flags };
      o.ctx['__gate'] = gateOk === null ? null : () => ({ ok: gateOk });
      o.ctx['__PRED'] = null;
      try {
        o.call('_gtbBuildPrediction', false);
      } catch {
        /* the original stops here: only the numbers are wanted */
      }
      const old = plain<Record<string, unknown>>(o.ctx['__PRED']);

      const sd = strikeDetails(open, '50,50');
      const mine = plain<Record<string, unknown>>(
        predict({
          zones, comboStats: rows ? comboStats(rows, key) : null,
          leadScore: g.ALL_9_15_CLOSE_SCORE + g.NIFTY_50_9_15_CLOSE_SCORE + g.NIFTY_BANK_9_15_CLOSE_SCORE + g.GIFT_NIFTY_9_15_CLOSE_SCORE + g.SENSEX_9_15_CLOSE_SCORE + g.ALL_ADVANCE_DECLINE_SCORE + g.NIFTY_50_ADVANCE_DECLINE_SCORE + g.NIFTY_BANK_ADVANCE_DECLINE_SCORE + g.ALL_FUTURES_TREND_SCORE + g.NIFTY_50_FUTURES_TREND_SCORE + g.NIFTY_BANK_FUTURES_TREND_SCORE,
          n50Fut, bnFut, adAll: g.ALL_ADVANCE_DECLINE_SCORE, futAll: g.ALL_FUTURES_TREND_SCORE, n50Avwap: avwap, n50Ltp: ltp,
          oiNet: g.NIFTY_50_OI_OBV_SCORE + g.NIFTY_BANK_OI_OBV_SCORE, mpNet: g.NIFTY_50_MAX_PAIN_SCORE + g.NIFTY_BANK_MAX_PAIN_SCORE, ivNet: g.NIFTY_50_IV_SKEW_SCORE + g.NIFTY_BANK_IV_SKEW_SCORE,
          pcr50: pcr ?? 1, compN50: g.NIFTY_50_COMPONENT_SCORE, compBN: g.NIFTY_BANK_COMPONENT_SCORE, indiaVix: vix, n50Trends: flags, strike: sd, includeLagging: lagging,
          lxGate: gateOk === null ? null : () => ({ ok: gateOk }),
        }),
      );
      // the userscript keeps only legs / win / winPct here; the entry-type split is used by Level Confirmation
      const cs3 = mine['comboStats'] as { legs: number; win: number; winPct: number } | null;
      mine['comboStats'] = cs3 ? { legs: cs3.legs, win: cs3.win, winPct: cs3.winPct } : null;
      for (const key2 of ['comboKey', 'strat', 'comboStats', 'nudges', 'bullP', 'bearP', 'sidewaysP', 'vixRegime', 'noTrade', 'atVIXU', 'atVIXL', 'confidence', 'leadLagConflict', 'tradeAction', 'tradeEntry', 'tradeTarget', 'tradeStop']) {
        expect(mine[key2] ?? null, `${key2} case ${k}`).toEqual(old[key2] ?? null);
      }
      expect((mine['scenarios'] as { prob: number; label: string; detail: string }[]).map((s) => [s.prob, s.label, s.detail])).toEqual((old['scenarios'] as { prob: number; label: string; detail: string }[]).map((s) => [s.prob, s.label, s.detail]));
      actions.add(String(mine['tradeAction']));
      outcomes.add(String((mine['strat'] as { outcome: string }).outcome));
    }
    expect([...actions].sort()).toEqual(['BUY CE', 'BUY PE', 'NO TRADE', 'WAIT / IRON CONDOR', 'WAIT: PRICE NOT CONFIRMING']);
    expect([...outcomes].sort()).toEqual(['Buy', 'Buy/Sell', 'Sell']);
  });
});
