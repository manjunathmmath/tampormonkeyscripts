import { describe, expect, it } from 'vitest';
import { StrikeService } from '../src/marketdata/strikes.js';

const mkBook = () => {
  const rows: unknown[] = [];
  let t = 1;
  for (const k of [23800, 23900, 24000, 24100, 24200, 24300]) for (const type of ['CE', 'PE']) rows.push({ token: t++, symbol: `NIFTY26NOV${k}${type}`, expiry: '2026-11-26', strike: k, type, lotSize: 75 });
  return { options: () => rows } as never;
};

const mk = (outcome: string, price: Record<string, number | null> = {}) =>
  new StrikeService({
    book: mkBook,
    history: { candles: async (q) => (price[String(q.token)] == null && Object.keys(price).length ? [] : [['t', 0, 0, 0, price[String(q.token)] ?? 50, 0]]) as never },
    oi: { analyse: async () => ({ ltp: 24010 }) as never },
    consensus: { load: async () => ({ outcome, agree: 4, voting: 5 }) as never },
    verdict: { load: async () => ({ inputs: { indiaVix: 15 } }) as never },
    isMcx: () => false,
    settings: { num: (k) => ({ margin: 1000000, risk_pct_per_trade: 1, hedge_diff_nifty: 200 } as Record<string, number>)[k] ?? null },
    expiryPref: () => undefined,
  });

describe('StrikeService', () => {
  it('a LONG consensus gives a bull call spread on listed strikes with a payoff', async () => {
    const s = await mk('GO LONG', { '5': 100, '11': 40 }).load({ name: 'NIFTY 50', day: '2026-11-20' });
    expect(s.strategy).toBe('bull_call');
    expect(s.atm).toBe(24000);
    expect(s.legs.map((l) => `${l.side} ${l.type} ${l.strike}`)).toEqual(['BUY CE 24000', 'SELL CE 24300']);
    expect(s.payoff.netCredit).toBe(-60);
    expect(s.perLot?.maxLoss).toBe(60 * 75);
    expect(s.lotsAtRisk).toBe(Math.floor(10000 / 4500));
    expect(s.dte).toBe(6);
  });
  it('no direction gives an iron condor and your pick overrides', async () => {
    const a = await mk('WAIT').load({ name: 'NIFTY 50', day: '2026-11-20' });
    expect(a.suggested).toBe('iron_condor');
    expect(a.legs.length).toBe(4);
    const b = await mk('WAIT').load({ name: 'NIFTY 50', day: '2026-11-20' }, 'long_put');
    expect(b.strategy).toBe('long_put');
    expect(b.suggested).toBe('iron_condor');
  });
  it('a leg that has not traded makes the payoff unavailable and warns', async () => {
    const s = await mk('GO LONG', { '5': 100 }).load({ name: 'NIFTY 50', day: '2026-11-20' });
    expect(s.payoff.ok).toBe(false);
    expect(s.warnings.join(' ')).toContain('has not traded');
  });
});
