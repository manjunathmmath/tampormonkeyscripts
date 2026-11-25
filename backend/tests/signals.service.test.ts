import { describe, it, expect } from 'vitest';
import { SignalService } from '../src/marketdata/signals.js';

const D = '2026-11-20';
const score = {
  score: { total: 4, nine_fifteen: 1, current_trend: 1, futures_trend: 1, oi_obv: 2, max_pain: 0, iv_skew: 0 },
  futures: { dir: 1, remark: 'LONG' },
  trend: { ltp: 24020, open: 24000, change: '0.1', levels: { aso: 24050, ast: 24100, bso: 23950, bst: 23900 }, vixRange: 300 },
} as never;

const mk = (call: string) =>
  new SignalService({
    score: { load: async () => score },
    market: { load: async () => ({ signal: { signal: 'BUY' } }) as never },
    consensus: { load: async () => ({ deadZoneBand: null }) as never },
    levelProb: { load: async () => ({ ok: true, pASO: 70, pBSO: 20 }) as never },
    futures: { load: async () => ({ vwapPrice: 24005 }) as never },
    oi: { analyse: async () => ({ expiry: '2026-11-26' }) as never },
    finalVerdict: async () => ({ call, dir: call === 'LONG' ? 1 : 0, headline: `${call} NOW`, conf: 'MEDIUM' }),
    now: () => Date.parse(`${D}T10:30:00+05:30`),
  });

describe('signal service', () => {
  it('suggests the strategy from the Final Verdict, tallies the agreeing signals and scores the timing', async () => {
    const r = await mk('LONG').load({ name: 'NIFTY 50', day: D });
    expect(r.strategy).toBe('bullcall');
    expect(r.view).toBe('Bullish');
    expect(r.agreement).toMatchObject({ total: 6, agree: 6, label: 'FAVOURABLE' });
    expect(r.dte).toBe(6);
    expect(r.timing?.n).toBeGreaterThanOrEqual(4);
    expect(['GOOD TIME TO ENTER', 'ACCEPTABLE, enter with care', 'WAIT for a better entry', 'POOR TIMING, do not chase']).toContain(r.timing?.label);
  });
  it('a range day gets a range strategy and the quiet-market checklist; a single stock follows its score', async () => {
    const range = await mk('WAIT').load({ name: 'NIFTY 50', day: D });
    expect(range.strategy).toBe('condor');
    expect(range.timing?.checks.some((c) => c.label === 'Inside 9:15 band')).toBe(true);
    const stock = await mk('WAIT').load({ name: 'TCS', day: D });
    expect(stock.suggestion?.why).toContain('Instrument score');
    expect(stock.strategy).toBe('bullcall');
  });
});
