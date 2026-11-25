import { describe, expect, it } from 'vitest';
import { analyse, expectedMove, legSpecs, snap, strikeStep, suggest, type PricedLeg } from '../src/engine/optionStrategy.js';

const priced = (specs: ReturnType<typeof legSpecs>, prem: number[]): PricedLeg[] => specs.map((s, i) => ({ ...s, strike: s.target, premium: prem[i]! }));

describe('strategy basics', () => {
  it('suggests by direction', () => {
    expect(suggest(1)).toBe('bull_call');
    expect(suggest(-1)).toBe('bear_put');
    expect(suggest(0)).toBe('iron_condor');
  });
  it('snaps to listed strikes and finds the step', () => {
    expect(snap([100, 150, 200], 160)).toBe(150);
    expect(strikeStep([100, 150, 200, 250, 275])).toBe(50);
    expect(expectedMove(24000, 15, 7)).toBeCloseTo(24000 * 0.15 * Math.sqrt(7 / 365), 6);
  });
});

describe('payoff', () => {
  it('bull call spread: capped profit and loss, one break-even', () => {
    const p = analyse(priced(legSpecs('bull_call', 24000, 0, 200), [150, 60]));
    expect(p.netCredit).toBe(-90);
    expect(p.maxLoss).toBe(90);
    expect(p.maxProfit).toBe(110);
    expect(p.breakevens).toEqual([24090]);
  });
  it('iron condor: credit is the max profit, two break-evens', () => {
    const p = analyse(priced(legSpecs('iron_condor', 24000, 300, 200), [40, 15, 38, 12]));
    expect(p.netCredit).toBe(51);
    expect(p.maxProfit).toBe(51);
    expect(p.maxLoss).toBe(149);
    expect(p.breakevens).toEqual([23649, 24351]);
  });
  it('long call: unlimited profit, loss is the premium', () => {
    const p = analyse(priced(legSpecs('long_call', 24000, 0, 0), [120]));
    expect(p.maxProfit).toBe('unlimited');
    expect(p.maxLoss).toBe(120);
    expect(p.breakevens).toEqual([24120]);
  });
  it('short straddle: unlimited loss', () => {
    const p = analyse(priced(legSpecs('short_straddle', 24000, 0, 0), [100, 110]));
    expect(p.maxLoss).toBe('unlimited');
    expect(p.maxProfit).toBe(210);
    expect(p.breakevens).toEqual([23790, 24210]);
  });
  it('a missing premium makes the read unavailable', () => {
    const l = priced(legSpecs('bull_call', 24000, 0, 200), [150, 60]);
    l[1]!.premium = null;
    expect(analyse(l).ok).toBe(false);
  });
});
