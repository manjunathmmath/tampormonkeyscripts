import { describe, it, expect } from 'vitest';
import { macroOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { MC_DRIVERS, analyse, parseYieldText, read, verdict, type MacroRow, type Point } from '../../src/engine/macro.js';

const today = (): string => new Date().toLocaleDateString('en-CA');
const dayN = (i: number): string => new Date(Date.now() - (60 - i) * 86400000).toLocaleDateString('en-CA');

describe('macro: the ports equal macro.js', () => {
  const o = macroOracle();

  it('the driver table is the original one', () => {
    expect(plain(MC_DRIVERS)).toEqual(plain(o.ctx['_MC_DRIVERS']));
  });

  it('analysis, readings and the verdict on 2,000 random markets (live and replay, thin history, flat and big moves)', () => {
    const r = rng(2468);
    const labels = new Set<string>();
    for (let k = 0; k < 2000; k++) {
      const rows: MacroRow[] = [];
      const oldRows: unknown[] = [];
      const fed = r.pick([null, 5.25]);
      const replay = r.chance(0.3);
      const snap = replay ? dayN(r.int(20, 55)) : today();
      o.ctx['__snap'] = snap;
      o.ctx['__fed'] = fed;
      for (const def of MC_DRIVERS) {
        if (r.chance(0.1)) continue; // a driver that could not be fetched
        const n = def.accumulate ? r.int(1, 12) : r.int(2, 62);
        let v = def.mode === 'pct' ? r.range(20, 120) : r.range(2, 8);
        const pts: Point[] = Array.from({ length: n }, (_, i) => {
          v *= def.mode === 'pct' ? 1 + r.range(-0.012, 0.012) : 1;
          if (def.mode === 'abs') v += r.range(-0.06, 0.06);
          return { d: dayN(60 - n + i), c: Math.max(0.1, v) };
        });
        const live = r.pick([null, pts[pts.length - 1]!.c * (1 + r.range(-0.02, 0.02))]);
        const raw = { pts, live };
        const old = plain<MacroRow>(o.call('_mcAnalyse', plain(def), plain(raw)));
        const mine = analyse(def, raw, snap, today());
        expect(plain(mine), `${def.key} case ${k}`).toEqual(old);
        expect(read(mine, fed), `read ${def.key} case ${k}`).toBe(o.call('_mcRead', plain(old)));
        rows.push(mine);
        oldRows.push(old);
      }
      if (!rows.length) continue;
      const v = verdict(rows);
      expect(plain(v), `verdict ${k}`).toEqual(plain(o.call('_mcVerdict', plain(oldRows))));
      labels.add(v.label);
    }
    expect([...labels].sort()).toEqual(['HEADWIND', 'MILD HEADWIND', 'MILD TAILWIND', 'NEUTRAL', 'TAILWIND']);
  });

  it('parses pasted yield history like the original', () => {
    const text = 'Date\tPrice\n25-09-2026\t7.120\t7.141\n24/09/2026 7,095\n23.09.2026\t99\n22-09-2026\tabc\n\n21-09-2026\t7.05';
    expect(plain(parseYieldText(text))).toEqual(plain(o.call('_mcParseYieldText', text)));
    expect(parseYieldText(text).rows).toHaveLength(2);
  });
});
