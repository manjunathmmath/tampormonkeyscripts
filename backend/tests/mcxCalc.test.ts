import { describe, expect, it } from 'vitest';
import { McxCalcService, basisOf, parity, priceAt, GLOBAL, type Series } from '../src/marketdata/mcxCalc.js';
import { buildMorning } from '../src/marketdata/digest.js';
import type { KeyValueStore } from '../src/store/fileStore.js';

const mem = (): KeyValueStore => {
  const m = new Map<string, unknown>();
  return { get: <T,>(k: string) => m.get(k) as T | undefined, set: (k, v) => void m.set(k, v), delete: (k) => void m.delete(k) };
};
const T0 = Date.parse('2026-11-23T23:30:00+05:30');
const ser = (pts: [number, number][], last: number): Series => ({ pts: pts.map(([t, c]) => ({ t, c })), last, lastAt: pts[pts.length - 1]![0] });

describe('conversion', () => {
  it('converts gold, silver and crude from the global quote', () => {
    expect(parity(2000, 85, GLOBAL.GOLDM!.unit)).toBeCloseTo(((2000 * 85) / 31.1035) * 10, 2);
    expect(parity(25, 85, GLOBAL.SILVERM!.unit)).toBeCloseTo(((25 * 85) / 31.1035) * 1000, 2);
    expect(parity(70, 85, GLOBAL.CRUDEOILM!.unit)).toBe(5950);
    expect(parity(4, 85, GLOBAL.COPPER!.unit)).toBeCloseTo(4 * 2.20462262 * 85, 3);
  });
  it('finds the value at or before a time', () => {
    const pts = [{ t: 1000, c: 1 }, { t: 2000, c: 2 }, { t: 3000, c: 3 }];
    expect(priceAt(pts, 2500)).toBe(2);
    expect(priceAt(pts, 3000)).toBe(3);
    expect(priceAt(pts, 500)).toBeNull();
  });
});

describe('the calculator', () => {
  const gold = GLOBAL.GOLDM!;
  const make = (open: boolean, usdNow: number, fxNow = 85) => {
    const usdPts: [number, number][] = [[T0 - 3600000, 2000], [T0, 2000], [T0 + 3 * 3600000, usdNow]];
    const fxPts: [number, number][] = [[T0 - 3600000, 85], [T0, 85], [T0 + 3 * 3600000, fxNow]];
    const mcxPrice = parity(2000, 85, gold.unit) * 1.06; // MCX trading 6% over parity
    const svc = new McxCalcService({
      store: mem(), names: () => ['GOLDM', 'FOO'], mcxOpen: () => open,
      mcxLast: async () => ({ ltp: mcxPrice, at: T0 }),
      fetchSeries: async (sym) => (sym === 'USDINR=X' ? ser(fxPts, fxNow) : ser(usdPts, usdNow)),
      now: () => T0 + 3 * 3600000,
    });
    return { svc, mcxPrice };
  };
  it('carries the premium MCX had at its close onto the live global price', async () => {
    const { svc, mcxPrice } = make(false, 2040); // gold +2% since the MCX close
    const r = (await svc.load()).rows;
    expect(r.map((x) => x.name)).toEqual(['GOLDM']); // a name with no global mapping is left out
    const g = r[0]!;
    expect(g.basis).toBeCloseTo(1.06, 4);
    expect(g.basisSource).toBe('last close');
    expect(g.estimate).toBeCloseTo(mcxPrice * 1.02, 2);
    expect(g.gapPct).toBeCloseTo(2, 3);
    expect(g.usd.changePct).toBeCloseTo(2, 3);
  });
  it('uses the saved premium while MCX is open and says whether MCX is rich or cheap', async () => {
    const closed = make(false, 2000);
    await closed.svc.load(); // saves the basis
    const store = (closed.svc as unknown as { d: { store: KeyValueStore } }).d.store;
    const open = new McxCalcService({
      store, names: () => ['GOLDM'], mcxOpen: () => true,
      mcxLast: async () => ({ ltp: closed.mcxPrice * 0.99, at: T0 + 3 * 3600000 }), // MCX is 1% under what the global price implies
      fetchSeries: async (sym) => ser([[T0 + 3 * 3600000, sym === 'USDINR=X' ? 85 : 2000]], sym === 'USDINR=X' ? 85 : 2000),
      now: () => T0 + 3 * 3600000,
    });
    const g = (await open.load()).rows[0]!;
    expect(g.basisSource).toBe('saved');
    expect(g.gapPct).toBeCloseTo(1.0101, 3);
    expect(g.note).toContain('cheap');
  });
  it('says so when the global quote cannot be read', async () => {
    const svc = new McxCalcService({ store: mem(), names: () => ['GOLDM'], mcxOpen: () => false, mcxLast: async () => ({ ltp: 125000, at: T0 }), fetchSeries: async () => { throw new Error('down'); }, now: () => T0 });
    const r = await svc.load();
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.rows[0]!.estimate).toBeNull();
  });
});

describe('the morning brief line', () => {
  it('adds the estimated MCX open', () => {
    const t = buildMorning({ day: '2026-11-25', nse: 'opens 09:15', mcx: 'open 09:00', gift: null, vix: null, expiry: [], events: [], heads: [], kiteOk: true, mcxEst: [{ name: 'GOLDM', estimate: 126900, last: 125900, pct: 0.79, basisPct: 6 }] });
    expect(t).toContain('MCX if it opened now');
    expect(t).toContain('GOLDM ~1,26,900 (+0.79% vs last 1,25,900)');
  });
});
