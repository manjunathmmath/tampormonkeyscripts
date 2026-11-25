import { describe, it, expect } from 'vitest';
import { positionalOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { primaryRead, type DCandle } from '../../src/engine/positional.js';
import { computeConviction, computeSetup, type Setup } from '../../src/engine/positionalSetup.js';

type R = ReturnType<typeof rng>;

/** A daily series: drift + noise + occasional gaps, so every regime (rising, falling, basing, topping) and a few gap flags appear. */
const series = (r: R, n: number, drift: number, vol: number): DCandle[] => {
  let px = r.range(50, 3000);
  const out: DCandle[] = [];
  for (let i = 0; i < n; i++) {
    const o = px;
    let ch = drift + r.range(-vol, vol);
    if (r.chance(0.01)) ch += r.range(-0.18, 0.18);
    px = Math.max(1, px * (1 + ch));
    out.push([`2025-01-${String((i % 28) + 1).padStart(2, '0')}`, o, Math.max(o, px) * (1 + r.range(0, 0.01)), Math.min(o, px) * (1 - r.range(0, 0.01)), px, r.int(1000, 90000), r.int(1000, 90000)]);
  }
  return out;
};

describe('positional screener maths equals positionalScreener.js', () => {
  const o = positionalOracle();

  it('the primary read on 600 random series (every regime and history length)', () => {
    const r = rng(51);
    const dirs = new Set<number | null>();
    for (let k = 0; k < 600; k++) {
      const n = r.pick([20, 90, 160, 180, 215, 260, 400]);
      const c = series(r, n, r.range(-0.004, 0.004), r.range(0.002, 0.02));
      const nifty = r.pick([null, series(r, r.pick([60, 260]), 0.0005, 0.005).map((x) => x[4])]);
      const old = plain<{ dir: number | null; label: string }>(o.call('_psPrimaryRead', plain(c), nifty));
      const mine = primaryRead(c, nifty);
      expect(plain(mine), `primary ${k}`).toEqual(old);
      dirs.add(mine.dir);
    }
    for (const d of [1, 0.5, 0, -0.3, -0.5, -1, null]) expect(dirs.has(d), `regime ${d} not reached`).toBe(true);
  });

  it('the overlay, verdict, trade plan and conviction on 1,500 random inputs', () => {
    const r = rng(52);
    const verdicts = new Set<string>();
    for (let k = 0; k < 1500; k++) {
      const n = r.pick([24, 30, 90, 180, 230, 300, 420]);
      const c = series(r, n, r.range(-0.004, 0.004), r.range(0.002, 0.02));
      const nifty = r.pick([null, series(r, 260, 0.0005, 0.005).map((x) => x[4])]);
      const fut = r.pick([null, [], series(r, 3, 0, 0.01), series(r, r.int(6, 40), r.range(-0.01, 0.01), 0.01).map((x, i) => [...x.slice(0, 6), 50000 * (1 + (i / 40) * r.range(-0.5, 0.5))] as unknown as DCandle)]);
      const futToken = r.pick([0, 123]);
      const days = r.pick([null, 0, 2, 3, 4, 20]);
      const curve = r.pick([null, { ok: false as const, reason: 'one contract' }, { ok: true as const, dir: r.pick([-1, 0, 1]), state: 'BACKWARDATION', annualizedPct: r.range(-9, 14) }]);
      const nPct = r.pick([null, 0, r.range(-8, 8)]);
      const primary = primaryRead(c, nifty);
      const oldPrimary = plain(o.call('_psPrimaryRead', plain(c), nifty));
      const old = plain<Record<string, unknown>>(o.call('_psComputeSetup', plain(c), fut, nPct, futToken, days, curve, oldPrimary));
      const mine = computeSetup(c, fut, nPct, futToken, days, curve, primary) as Setup | null;
      if (old === null || old === undefined) {
        expect(mine).toBeNull();
        continue;
      }
      const m = plain<Record<string, unknown>>(mine);
      delete old['overlayColor'];
      delete old['verdictColor'];
      expect(m, `setup ${k}`).toEqual(old);
      verdicts.add(String(old['verdict']).split(' — ')[0]!.split(' (')[0]!);
      // conviction recomputed from the finished setup equals the stored one
      if (mine && mine.convictionPct != null) expect(computeConviction(mine)).toBe(mine.convictionPct);
    }
    expect(verdicts.size).toBeGreaterThanOrEqual(5);
  });
});
