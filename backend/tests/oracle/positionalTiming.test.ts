import { describe, it, expect } from 'vitest';
import { positionalOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { primaryRead, type DCandle } from '../../src/engine/positional.js';
import { computeSetup } from '../../src/engine/positionalSetup.js';
import { buildSince, dayStats, isTradeable, marketView, viewEstimates, viewSign, type Since } from '../../src/engine/positionalTiming.js';

type R = ReturnType<typeof rng>;
const series = (r: R, n: number, drift: number, vol: number): DCandle[] => {
  let px = r.range(50, 3000);
  const out: DCandle[] = [];
  for (let i = 0; i < n; i++) {
    const o = px;
    px = Math.max(1, px * (1 + drift + r.range(-vol, vol)));
    out.push([`2024-${String(1 + Math.floor(i / 28) % 12).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, o, Math.max(o, px) * (1 + r.range(0, 0.01)), Math.min(o, px) * (1 - r.range(0, 0.01)), px, r.int(1000, 90000), r.int(1000, 90000)]);
  }
  return out;
};

describe('positional timing equals positionalScreener.js', () => {
  const o = positionalOracle();

  it('tradeable rule and market view', () => {
    const r = rng(61);
    const verdicts = ['STRONG BUY', 'STRONG SELL', 'BUY (awaiting overlay confirmation)', 'SELL — overlay disagrees (caution)', 'WATCH — LONG forming (Stage 2)', 'WATCH — SHORT forming (Stage 4)', 'WATCH — NO TRADE, basing (Stage 1)', 'CAUTION — NO SHORT, trim longs (Stage 3 topping)'];
    for (let k = 0; k < 800; k++) {
      const row = { convictionPct: r.pick([null, r.int(0, 100)]), verdict: r.pick(verdicts) };
      expect(isTradeable(row), `tradeable ${k}`).toBe(o.call('_psIsTradeable', row));
    }
    for (let k = 0; k < 200; k++) {
      const rows = Array.from({ length: r.int(0, 30) }, (_, i) => ({ name: `S${i}`, verdict: r.pick(verdicts) }));
      o.ctx['_PS_CACHE'] = Object.fromEntries(rows.map((x) => [x.name, x]));
      const old = plain<Record<string, unknown>>(o.call('_psMarketView'));
      const mine = marketView(rows);
      for (const key of ['buy', 'sell', 'watch', 'scanned', 'net', 'label']) expect((plain(mine) as Record<string, unknown>)[key], `${key} ${k}`).toEqual(old[key]);
    }
  });

  it('day statistics on random closes', () => {
    const r = rng(62);
    for (let k = 0; k < 400; k++) {
      const n = r.pick([10, 21, 60, 260, 400]);
      let px = 100;
      const closes = Array.from({ length: n }, () => (px = r.chance(0.08) ? px : Math.max(1, px * (1 + r.range(-0.02, 0.02)))));
      expect(plain(dayStats(closes)), `stats ${k}`).toEqual(plain(o.call('_psDayStats', closes)));
    }
  });

  it('timing since the view began and the duration estimates on 150 random stocks', () => {
    const r = rng(63);
    const labels = new Set<string>();
    let withEst = 0;
    for (let k = 0; k < 150; k++) {
      const c = series(r, r.pick([200, 260, 330, 450]), r.range(-0.003, 0.004), r.range(0.003, 0.015));
      const nifty = r.pick([null, series(r, 450, 0.0005, 0.005).map((x) => x[4])]);
      const primary = primaryRead(c, nifty);
      const oldPrimary = plain(o.call('_psPrimaryRead', plain(c), nifty));
      const oldSetup = plain<Record<string, unknown>>(o.call('_psComputeSetup', plain(c), null, 0, 0, null, null, oldPrimary));
      const mine = computeSetup(c, null, 0, 0, null, null, primary)!;
      expect(viewSign(primary)).toBe(o.call('_psViewSign', oldPrimary));
      const oSince = plain<Since | null>(o.call('_psBuildSince', oldSetup, plain(c), nifty));
      const mSince = buildSince(mine, c, nifty);
      expect(plain(mSince), `since ${k}`).toEqual(oSince);
      if (!mSince) continue;
      labels.add(mSince.label);
      oldSetup['since'] = oSince;
      const oEst = plain(o.call('_psViewEstimates', oldSetup, plain(c), nifty));
      const mEst = viewEstimates({ ...mine, since: mSince }, c, nifty);
      expect(plain(mEst), `estimates ${k}`).toEqual(oEst);
      withEst++;
    }
    expect(withEst).toBeGreaterThan(30);
    expect(labels.size).toBeGreaterThanOrEqual(3);
  });
});
