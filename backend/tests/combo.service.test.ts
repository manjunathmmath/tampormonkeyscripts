import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../src/store/fileStore.js';
import { ComboService, PredictService } from '../src/marketdata/combo.js';
import type { Candle } from '../src/kite/client.js';

const TODAY = '2026-11-20';
const NOW = Date.parse(`${TODAY}T10:00:00+05:30`);
const weekdays = (n: number): string[] => {
  const out: string[] = [];
  const d = new Date(Date.parse(`${TODAY}T00:00:00Z`) - 86400000);
  while (out.length < n) {
    if (![0, 6].includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out.reverse();
};
const day5 = (d: string, up: boolean): Candle[] =>
  Array.from({ length: 30 }, (_, i) => {
    const m = 15 + i * 5;
    const base = 24000 + (up ? 1 : -1) * i * 6;
    return [`${d}T${String(9 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00+0530`, base, base + 8, base - 8, base + (up ? 5 : -5), 0] as unknown as Candle;
  });

describe('combo backtest service', () => {
  it('builds the day-wise rows once a day, saves them, and summarises each combo', async () => {
    const calls: string[] = [];
    const ds = weekdays(12);
    const store = new FileStore(mkdtempSync(join(tmpdir(), 'groot-combo-')));
    const svc = new ComboService({
      history: {
        candles: async (q) => {
          calls.push(`${q.token}|${q.interval}`);
          if (q.interval === 'day') return ds.map((d) => [`${d}T00:00:00+0530`, 14, 14, 14, 14, 0] as unknown as Candle);
          return ds.flatMap((d, i) => day5(d, i % 2 === 0));
        },
      },
      tokens: () => ({ 'NIFTY 50': 1, SENSEX: 2, 'NIFTY BANK': 3, 'GIFT NIFTY': 4, 'INDIA VIX': 5 }),
      strikeDiffs: () => ({ 'NIFTY 50': '50,50', SENSEX: '50,50', 'NIFTY BANK': '50,50', 'GIFT NIFTY': '50,50' }),
      store,
      now: () => NOW,
    });
    const rows = await svc.rows(250);
    expect(rows).toHaveLength(12);
    expect(rows[0]!.date > rows[1]!.date).toBe(true); // newest first
    const n = calls.length;
    await svc.rows(250);
    expect(calls.length).toBe(n); // the second call of the day reads the saved rows
    const again = new ComboService({ history: { candles: async () => { throw new Error('should not fetch'); } }, tokens: () => ({}), strikeDiffs: () => ({}), store, now: () => NOW });
    expect(await again.rows(250)).toHaveLength(12); // and so does a new process
    const t = await svc.table(250);
    expect(t.days).toBe(12);
    expect(t.combos.reduce((a, c) => a + c.days, 0)).toBe(12);
    expect(t.combos.every((c) => c.key.split('-').length === 3)).toBe(true);
  });
});

describe('predict service', () => {
  it('uses the backtest win rate of the combo when there is one, and says unvalidated when there is not', async () => {
    const mk = (stats: { winPct: number } | null) =>
      new PredictService({
        combo: { statsFor: async () => stats as never },
        market: { load: async () => ({ parts: { nine15: { all: 0.5, nifty50: 1, bank: 1, gift: 1, sensex: 1, reliance: 0, hdfcbank: 0 }, ad: { all: 0.3, nifty50: 0.2, bank: 0.1 }, fut: { all: 1, nifty50: 1, bank: 1 }, oiObv: [2, 1], maxPain: [0, 0], ivSkew: [0, 0], component: { nifty50: 0.4, bank: 0.2 } } }) as never },
        score: { load: async (r) => ({ zone: 'ASO', futures: { dir: 1 }, trend: { ltp: 24020, trends: ['ASO'], levels: { aso: 24050, ast: 24100, bso: 23950, bst: 23900 } }, name: r.name }) as never },
        oi: { analyse: async () => ({ pcr: '1.0' }) as never },
        futures: { load: async () => ({ vwapPrice: 24000 }) as never },
        indiaVix: async () => 14,
      });
    const withStats = await mk({ winPct: 20 }).load({ day: TODAY }); // a weak record lowers the base lean (62 -> 18)
    expect(withStats.unvalidated).toBe(false);
    expect(withStats.strat.outcome).toBe('Buy');
    const noStats = await mk(null).load({ day: TODAY });
    expect(noStats.unvalidated).toBe(true);
    expect(withStats.bullP).not.toBe(noStats.bullP); // the backtest changes the base lean
    expect(['BUY CE', 'BUY PE', 'WAIT / IRON CONDOR', 'NO TRADE']).toContain(noStats.tradeAction);
  });
});
