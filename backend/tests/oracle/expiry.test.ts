import { describe, it, expect } from 'vitest';
import { expiryOracle } from './oracle.js';
import { rng } from './rng.js';
import { expiryContext, expiryWarning } from '../../src/engine/expiry.js';

describe('expiry-day context equals grootTradeBot.js', () => {
  const o = expiryOracle();
  it('on 2,000 random charts (walls above and below, missing max pain, missing spot)', () => {
    const r = rng(41);
    const seen = { text: 0, nul: 0 };
    for (let k = 0; k < 2000; k++) {
      const spot = r.pick([0, r.range(1000, 60000)]);
      const mp = r.pick([null, { spot, maxPainK: r.range(900, 61000), maxPainPct: r.range(-3, 3) }]);
      const wall = () => ({ strike: Math.round(r.range(900, 61000)), tier: r.pick(['primary', 'secondary']) });
      const resistance = Array.from({ length: r.int(0, 3) }, wall);
      const support = Array.from({ length: r.int(0, 3) }, wall);
      const up = r.chance(0.5);
      o.ctx['__mp'] = mp;
      o.ctx['__walls'] = { resistance, support };
      o.ctx['__ltp'] = spot;
      const old = o.call('_gtbExpiryContext', 'NIFTY 50', up) as string | null;
      const mine = expiryContext('NIFTY 50', up, { spot: mp ? mp.spot : spot, maxPain: mp ? { maxPainK: mp.maxPainK, maxPainPct: mp.maxPainPct } : null, resistance, support });
      expect(mine, `case ${k}`).toBe(old);
      if (old) seen.text++;
      else seen.nul++;
    }
    expect(seen.text).toBeGreaterThan(500);
    expect(seen.nul).toBeGreaterThan(50);
  });
  it('the warning wording', () => {
    expect(expiryWarning(['NIFTY 50', 'SENSEX'], [])).toBe('Expiry day — NIFTY 50 + SENSEX options expire today; moves can be sharp and one-way, so size smaller. No OI chain loaded yet for the walls and max pain.');
    expect(expiryWarning(['NIFTY 50'], ['A.'])).toContain('A. On an expiry day the realistic pullback target is max pain');
  });
});
