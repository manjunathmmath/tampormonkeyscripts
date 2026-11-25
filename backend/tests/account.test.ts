import { describe, expect, it } from 'vitest';
import { AccountService } from '../src/marketdata/account.js';

describe('AccountService', () => {
  it('sums the day pnl and reads the balances', async () => {
    const a = await new AccountService({ kite: { margins: async () => ({ equity: { available: { live_balance: 50000 } }, commodity: { net: 2000 } }), positions: async () => ({ day: [{ pnl: 100.5 }, { pnl: -40.25 }] }) } }).load();
    expect(a).toEqual({ equity: 50000, commodity: 2000, dayPnl: 60.25, open: 2 });
  });
  it('a failed call leaves its figure empty', async () => {
    const a = await new AccountService({ kite: { margins: async () => { throw new Error('x'); }, positions: async () => ({ day: [] }) } }).load();
    expect(a.equity).toBeNull();
    expect(a.dayPnl).toBe(0);
  });
});
