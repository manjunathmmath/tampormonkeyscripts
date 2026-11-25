import { describe, expect, it } from 'vitest';
import { advanceDeclineCounts } from '../src/engine/breadth.js';

const st = (name: string, close: number, n50 = true, bank = false) => ({ name, inNifty50: n50, inBank: bank, aso: 110, bso: 90, candles: [{ time: '09:20', close: 100 }, { time: '09:25', close }] });

describe('advanceDeclineCounts', () => {
  it('counts the latest candle against each stock ASO and BSO', () => {
    const c = advanceDeclineCounts([st('A', 120), st('B', 95), st('C', 80, true, true), st('D', 111, false, true), st('E', 100, false, false)]);
    expect(c.all).toEqual({ a: 2, d: 1, n: 2, net: 1 });
    expect(c.nifty).toEqual({ a: 1, d: 1, n: 1, net: 0 });
    expect(c.bank).toEqual({ a: 1, d: 1, n: 0, net: 0 });
  });
});
