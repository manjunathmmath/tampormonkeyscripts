import { describe, it, expect } from 'vitest';
import { fearGreedOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { components, label, outcome, niftyMomentum } from '../../src/engine/fearGreed.js';

const strip = (h: string): string => h.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\'/g, "'");

describe('fear and greed equals grootTradeBot.js', () => {
  const o = fearGreedOracle();
  it('components, label and outcome on 3,000 random readings', () => {
    const r = rng(77);
    const labels = new Set<string>();
    for (let k = 0; k < 3000; k++) {
      const universe = r.pick([0, 180, 200]);
      const input = { breadth: r.pick([0, r.range(-1, 1)]), sample: universe ? r.int(0, universe) : 0, universe, vix: r.pick([0, r.range(8, 40)]), momentum: r.pick([null, r.range(-1, 1)]) };
      o.ctx['ALL_ADVANCE_DECLINE_SCORE'] = input.breadth;
      o.ctx['ALL_ADVANCE_DECLINE_SAMPLE'] = input.sample;
      o.ctx['ALL_ADVANCE_DECLINE_UNIVERSE'] = input.universe;
      o.ctx['__vix'] = input.vix;
      o.ctx['_GTB_FG_MOMENTUM'] = input.momentum === null ? { value: null, date: null } : { value: input.momentum, date: new Date().toLocaleDateString('en-CA') };
      const old = plain<{ parts: { label: string; score: number | null; detail?: string | null }[]; composite: number | null }>(o.call('_gtbFearGreedComponents'));
      const mine = components(input);
      expect(plain(mine), `components ${k}`).toEqual(old);
      const lb = plain<{ label: string }>(o.call('_gtbFearGreedLabel', mine.composite));
      expect(label(mine.composite).label).toBe(lb.label);
      const oc = plain<{ text: string } | null>(o.call('_gtbFearGreedOutcome', mine.composite));
      const my = outcome(mine.composite);
      expect(my ? my.text : null).toBe(oc ? strip(oc.text) : null);
      labels.add(lb.label);
    }
    expect([...labels].sort()).toEqual(['EXTREME FEAR', 'EXTREME GREED', 'FEAR', 'GREED', 'NEUTRAL', 'PENDING'].filter((x) => labels.has(x)));
    expect(labels.size).toBeGreaterThanOrEqual(5);
  });
  it('momentum clamps at +-5% from the 20-day average and needs 10 candles', () => {
    expect(niftyMomentum([1, 2, 3])).toBeNull();
    expect(niftyMomentum(Array(19).fill(100).concat([120]))).toBe(1);
    expect(niftyMomentum(Array(20).fill(100))).toBe(0);
  });
});
