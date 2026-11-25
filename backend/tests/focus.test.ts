import { describe, expect, it } from 'vitest';
import { buildFocus, nearestWall, whereWhen, type FocusIn } from '../src/engine/focus.js';

const base = (o: Partial<FocusIn> = {}): FocusIn => ({
  name: 'NIFTY 50', label: 'NIFTY 50', mcx: false, isIdx: true, live: true, notLive: '', inSession: true, loaded: true,
  ltp: 24000,
  vd: { label: 'LONG', trade: { entry: 23990, stop: 23900 }, context: { label: 'Bullish', lines: [] }, location: { label: 'at support', lines: [] }, confirmation: { label: 'ok', lines: [] } },
  cn: { outcome: 'GO LONG', net: 0.6, agree: 4, voting: 5, thin: false, deadZone: null, families: [], rows: [] },
  lx: null, partnerDir: 0, partnerLabel: 'BANK NIFTY', walls: null, range: null, dz: null, marketGuard: null, indiaVix: 14, dte: null, expiryToday: [],
  agreement: { agree: 8, total: 10, pct: 80 }, timing: { pct: 75, label: 'GOOD' },
  risk: { capital: 5000000, riskPct: 1, lot: { lot: 75, src: 'futures' }, pair: { entry: 24000, stop: 23900 } },
  exit: { mode: 'nifty', trend: 1, fut: 1, n50Fut: 1, bnFut: 1, squeezeActive: false },
  plan915: null,
  ...o,
});

describe('whereWhen', () => {
  it('enters now near the wall, waits for a pullback above, waits for a close back under', () => {
    expect(whereWhen(1, 100, 100.1, 99.6)?.st).toBe('now');
    expect(whereWhen(1, 100, 101, 99.6)?.st).toBe('pullback');
    expect(whereWhen(1, 100, 99, 99.6)?.st).toBe('under');
    expect(whereWhen(-1, 100, 99.9, 100.4)?.st).toBe('now');
    expect(whereWhen(0, 100, 100, 99)).toBeNull();
  });
});

describe('nearestWall', () => {
  it('picks the closest wall and flags at-the-wall within 0.35%', () => {
    const w = nearestWall({ support: [{ strike: 23900, tier: 'S1' }, { strike: 23980, tier: 'S2' }], resistance: [] }, 1, 24000);
    expect(w?.strike).toBe(23980);
    expect(w?.at).toBe(true);
    expect(nearestWall(null, 1, 24000)).toBeNull();
  });
});

describe('buildFocus', () => {
  it('an actionable LONG with everything lined up is green on direction, entry, risk, exit', () => {
    const r = buildFocus(base());
    expect(r.v.call).toBe('LONG');
    expect(r.v.conf).toBe('HIGH');
    expect(r.rows.map((x) => x.tone)).toEqual(['good', 'good', 'good', 'good', 'good']);
    expect(r.rows[3]!.line).toContain('lots fit');
  });
  it('a stale morning view turns a LONG into WAIT and caps confidence', () => {
    const r = buildFocus(base({ lx: { status: 'STALE', against: 3 } }));
    expect(r.v.call).toBe('WAIT');
    expect(r.v.conf).toBe('LOW');
  });
  it('flat consensus is NO TRADE; a dead-zone lean is WAIT', () => {
    const flat = buildFocus(base({ cn: { outcome: 'WAIT', net: 0.05, agree: 1, voting: 4, thin: false, deadZone: null, families: [], rows: [] } }));
    expect(flat.v.call).toBe('NO TRADE');
    const dz = buildFocus(base({ cn: { outcome: 'WAIT', net: 0.4, agree: 2, voting: 4, thin: false, deadZone: { lo: 1, hi: 2 }, families: [], rows: [] } }));
    expect(dz.v.call).toBe('WAIT');
    expect(dz.rows[1]!.tone).toBe('warn');
  });
  it('an index exit fires when the trend turns or a squeeze is active', () => {
    expect(buildFocus(base({ exit: { mode: 'nifty', trend: -1, fut: 1, n50Fut: 1, bnFut: 1, squeezeActive: false } })).rows[4]!.tone).toBe('bad');
    expect(buildFocus(base({ exit: { mode: 'nifty', trend: 1, fut: 1, n50Fut: 1, bnFut: 1, squeezeActive: true } })).rows[4]!.tone).toBe('bad');
    expect(buildFocus(base({ exit: { mode: 'single', trend: 1, fut: -1, n50Fut: 0, bnFut: 0, squeezeActive: false } })).rows[4]!.tone).toBe('bad');
  });
  it('risk warns when no lot fits and when capital is missing', () => {
    expect(buildFocus(base({ risk: { capital: 1000, riskPct: 1, lot: { lot: 75, src: 'futures' }, pair: { entry: 24000, stop: 23900 } } })).rows[3]!.line).toContain('not even 1 lot');
    expect(buildFocus(base({ risk: { capital: 0, riskPct: 1, lot: { lot: 75, src: 'futures' }, pair: { entry: 24000, stop: 23900 } } })).rows[3]!.tone).toBe('warn');
  });
  it('not live: tradeable gate is none', () => {
    expect(buildFocus(base({ live: false, notLive: 'snapshot' })).rows[0]!.tone).toBe('none');
  });
  it('past the expected range warns on the tradeable gate', () => {
    const r = buildFocus(base({ range: { lo: 23500, hi: 23900 } }));
    expect(r.rows[0]!.tone).toBe('warn');
    expect(r.rows[0]!.line).toContain('VIXU');
  });
  it('commodity vol gate is bad and not live MCX session is none', () => {
    expect(buildFocus(base({ mcx: true, isIdx: false, inSession: false })).rows[0]!.tone).toBe('none');
  });
});
