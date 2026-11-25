import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GapLog, analyseGaps, type GapPoint } from '../src/marketdata/gapLog.js';

const T0 = Date.parse('2026-11-25T18:00:00+05:30');
const pt = (min: number, mcx: number, gap: number, age = 60, name = 'GOLDM'): GapPoint => ({ t: T0 + min * 60000, name, mcx, est: mcx * (1 + gap / 100), gap, age });

describe('gap log', () => {
  it('writes readings to a file per day and reads them back', () => {
    const log = new GapLog(mkdtempSync(join(tmpdir(), 'gap-')));
    log.append([pt(0, 125000, 0.4), pt(2, 125100, 0.35)]);
    log.append([pt(4, 125200, 0.3)]);
    const r = log.read();
    expect(r).toHaveLength(3);
    expect(log.days()).toEqual(['2026-11-25']);
    expect(r[1]).toMatchObject({ name: 'GOLDM', mcx: 125100, gap: 0.35 });
  });
});

describe('does MCX move towards the global-implied price?', () => {
  it('counts hits and covered gaps, in the direction the gap pointed', () => {
    // a +0.4% gap (MCX cheap); 15 minutes later MCX is up 0.3%: it covered most of the gap
    const pts = [pt(0, 100000, 0.4), pt(15, 100300, 0.1), pt(30, 100300, 0.1)];
    const { stats } = analyseGaps(pts);
    const s = stats.find((x) => x.name === 'GOLDM' && x.threshold === 0.3 && x.horizon === 15)!;
    expect(s.n).toBe(1);
    expect(s.avgMove).toBeCloseTo(0.3, 3);
    expect(s.hitPct).toBe(100);
    expect(s.closedPct).toBe(100);
  });
  it('reads a negative gap the other way round', () => {
    const pts = [pt(0, 100000, -0.5), pt(15, 99600, -0.1)]; // MCX rich, then it fell 0.4%
    const s = analyseGaps(pts).stats.find((x) => x.threshold === 0.3 && x.horizon === 15)!;
    expect(s.avgMove).toBeCloseTo(0.4, 3);
    expect(s.closedPct).toBe(100);
  });
  it('leaves out readings whose global quote was old, and does not look across days', () => {
    const old = analyseGaps([pt(0, 100000, 0.5, 900), pt(15, 100500, 0.1, 900)]);
    expect(old.stale).toBe(2);
    expect(old.stats).toEqual([]);
    const nextDay = analyseGaps([pt(0, 100000, 0.5), { ...pt(0, 100500, 0.1), t: T0 + 86400000 + 15 * 60000 }]);
    expect(nextDay.stats.find((x) => x.threshold === 0.3 && x.horizon === 15)!.n).toBe(0);
  });
  it('reports the plain noise of the horizon for comparison', () => {
    const s = analyseGaps([pt(0, 100000, 0.4), pt(15, 100200, 0.1), pt(30, 100000, 0.1)]).stats.find((x) => x.threshold === 0.15 && x.horizon === 15)!;
    expect(s.noise).toBeCloseTo(0.2, 2);
  });
});
