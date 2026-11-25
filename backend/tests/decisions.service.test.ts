import { describe, it, expect } from 'vitest';
import { DecisionService, nowMinutes } from '../src/marketdata/decisions.js';

const D = '2026-11-20';
const score = (zone: string, fut = 1) =>
  ({
    score: { total: 4, oi_obv: 2, iv_skew: 1, max_pain: 0 },
    zone,
    futures: { dir: fut, remark: fut > 0 ? 'LONG' : 'SHORT' },
    trend: { ltp: 24060, open: 24000, change: '0.25', levels: { aso: 24050, ast: 24100, bso: 23950, bst: 23900 }, trends: ['ASO'], vixUpper: 24300, vixLower: 23700 },
  }) as never;
const market = {
  signal: { signal: 'BUY', reason: 'r', tradeSignal: { outcome: 'Buy', level: 'at BSO/BST' } },
  score: 5,
  parts: { ad: { all: 0.2, nifty50: 0.4, bank: -0.1 }, oiObv: [2, 1, 0, 0, 0], component: { nifty50: 0.5, bank: 0 } },
  weighted50: [{ name: 'A', weight: 10, change: 0.3 }, { name: 'B', weight: 8, change: 0.2 }],
} as never;
const cons = (outcome: string) => ({ outcome, net: 0.6, agree: 4, voting: 4, thin: false, dzConflict: false, deadZone: null, deadZoneBand: null, deadZoneBroken: null, score: score('ASO') }) as never;

const mk = (outcome = 'GO LONG') =>
  new DecisionService({
    score: { load: async (r) => score(r.name === 'SENSEX' ? 'ASO' : 'ASO') },
    market: { load: async () => market },
    levelProb: { load: async () => ({ ok: true, netDir: 0.5, pASO: 80, pBSO: 20 }) as never },
    consensus: { load: async () => cons(outcome) },
    oi: { chainRaw: async () => ({ rows: [], spotCandles: [] }) },
    futures: { load: async () => ({ vwapPrice: 24020 }) as never },
    now: () => Date.parse(`${D}T10:00:00+05:30`),
  });

describe('decision service', () => {
  it('the clock: snapshot time, end of session for a past day, else the IST clock', () => {
    expect(nowMinutes(D, '09:25', 0)).toBe(9 * 60 + 25);
    expect(nowMinutes('2026-11-19', undefined, Date.parse(`${D}T11:00:00+05:30`))).toBe(15 * 60 + 30);
    expect(nowMinutes(D, undefined, Date.parse(`${D}T11:07:00+05:30`))).toBe(11 * 60 + 7);
  });

  it('gives a Level Decision for both sides from the levels, the tally and the market signal', async () => {
    const r = await mk().levelDecision({ name: 'NIFTY 50', day: D });
    expect(r.levels).toEqual({ aso: 24050, ast: 24100, bso: 23950, bst: 23900 });
    // price 24060 is past ASO (a sell level) and well above BSO (a buy level)
    expect(r.resistance.decision?.action).toBeTruthy();
    expect(r.support.decision?.action).toBeTruthy();
    expect(r.support.tally.total).toBeGreaterThan(3);
    expect(r.unavailable).toContain('Order flow');
  });

  it('the Final Verdict combines the consensus, the 9:15 plan and the matching Level Decision', async () => {
    const v = await mk('GO LONG').finalVerdict({ name: 'NIFTY 50', day: D });
    expect(['LONG', 'WAIT', 'NO TRADE']).toContain(v.call);
    expect(v.consensus.outcome).toBe('GO LONG');
    expect(v.marketSignal).toBe('BUY');
    expect(v.why[0]).toContain('Consensus (NIFTY 50): GO LONG');
    const flat = await mk('WAIT').finalVerdict({ name: 'NIFTY 50', day: D });
    expect(flat.headline).toBe('NO TRADE — no clear direction');
  });

  it('adds the expiry-day caution (with max pain and walls) and the squeeze study line, without changing the call', async () => {
    const base = await mk('GO LONG').finalVerdict({ name: 'NIFTY 50', day: D });
    const svc = new DecisionService({
      score: { load: async (r) => ({ ...(score('ASO', 1) as object), futures: { dir: 1, remark: r.name === 'NIFTY BANK' ? 'SHOT_COVERING' : 'LONG' } }) as never },
      market: { load: async () => market },
      levelProb: { load: async () => ({ ok: true, netDir: 0.5, pASO: 80, pBSO: 20 }) as never },
      consensus: { load: async () => cons('GO LONG') },
      oi: { chainRaw: async () => ({ rows: [], spotCandles: [] }) },
      futures: { load: async () => ({ vwapPrice: 24020 }) as never },
      now: () => Date.parse(`${D}T10:00:00+05:30`),
      expiryDay: (day) => (day === D ? ['NIFTY 50'] : []),
      expiryInput: async () => ({ spot: 24050, maxPain: { maxPainK: 24000, maxPainPct: -0.2 }, resistance: [{ strike: 24200, tier: 'primary' }], support: [{ strike: 23900, tier: 'secondary' }] }),
      squeezeStudy: async () => " (0.40% off the day's low, further than 60% of past legs; the median leg ran 0.50%)",
    });
    const v = await svc.finalVerdict({ name: 'NIFTY 50', day: D });
    expect(v.call).toBe(base.call);
    const w = v.warn.find((x) => x.startsWith('Expiry day'))!;
    expect(w).toContain('NIFTY 50 options expire today');
    expect(w).toContain('max pain 24,000');
    expect(w).toContain('nearest call wall 24,200 (+150 pts, primary)');
    expect(w).toContain('nearest put wall 23,900 (-150 pts, secondary)');
    const none = await svc.finalVerdict({ name: 'NIFTY 50', day: '2026-11-19' });
    expect(none.warn.some((x) => x.startsWith('Expiry day'))).toBe(false);
  });
});
