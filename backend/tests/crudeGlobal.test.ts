import { describe, it, expect } from 'vitest';
import { crudeSignal } from '../src/engine/crudeGlobal.js';

const base = { wtiCur: 85, wtiPrev: 84, usdInr: 93, mcxLtp: 7905, usdScore: 0, ovx: 30, giftChg: 0 };

describe('crude global context (hand-checked cases of _cmdRenderGlobalContext)', () => {
  it('fair value is WTI x USD/INR rounded, gap is the MCX premium or discount', () => {
    const r = crudeSignal(base);
    expect(r.fairValue).toBe(7905);
    expect(r.gap).toBeCloseTo(0, 6);
    const dear = crudeSignal({ ...base, mcxLtp: 8100 });
    expect(dear.gap).toBeCloseTo(((8100 - 7905) / 7905) * 100, 6);
    expect(dear.reasons.some((x) => x.startsWith('MCX premium +2.5%'))).toBe(true);
  });
  it('two bullish votes and no bearish one is BUY CE; the mirror is BUY PE', () => {
    expect(crudeSignal({ ...base, usdScore: 1 }).signal).toBe('BUY CE'); // WTI up + rupee
    expect(crudeSignal({ ...base, wtiCur: 83, wtiPrev: 84, usdScore: -1 }).signal).toBe('BUY PE');
  });
  it('conflicting votes lean the way of the larger side, equal votes wait', () => {
    expect(crudeSignal({ ...base, usdScore: -1 }).signal).toBe('WAIT'); // WTI up, rupee down
    expect(crudeSignal({ ...base, usdScore: -1, giftChg: -0.5 }).signal).toBe('LEAN LONG'); // + GIFT down
    expect(crudeSignal({ ...base, usdScore: 1, giftChg: 0.5 }).signal).toBe('LEAN LONG'.replace('LONG', 'LONG')); // WTI+USD bull, GIFT bear: 2 vs 1
  });
  it('a discount of more than 1% votes bullish, GIFT NIFTY moves under 0.1% do not vote', () => {
    const r = crudeSignal({ ...base, mcxLtp: 7700, wtiCur: 84, wtiPrev: 84.0, giftChg: 0.05 });
    expect(r.gap).toBeLessThan(-1);
    expect(r.reasons.join(' ')).toContain('catch-up potential');
    expect(r.reasons.join(' ')).not.toContain('GIFT');
  });
  it('without WTI it asks for it; OVX at 35 or more only warns', () => {
    expect(crudeSignal({ ...base, wtiCur: 0 }).signal).toBe('ENTER WTI');
    const r = crudeSignal({ ...base, ovx: 36, usdScore: 1 });
    expect(r.signal).toBe('BUY CE');
    expect(r.reasons[0]).toContain('OVX ELEVATED (36.0)');
  });
});
