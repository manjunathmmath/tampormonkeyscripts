import { describe, it, expect } from 'vitest';
import { strikeMap, trendFlags, trendScore, volKeyFor, zone915 } from '../src/engine/mcx.js';
import { VolIndexService } from '../src/marketdata/volIndex.js';
import type { KeyValueStore } from '../src/store/fileStore.js';

const mem = (): KeyValueStore => {
  const m = new Map<string, unknown>();
  return { get: <T>(k: string) => m.get(k) as T | undefined, set: (k, v) => void m.set(k, v), delete: (k) => void m.delete(k) };
};

describe('commodity day levels', () => {
  it('levels from the open, range from the previous close and the volatility index (sqrt 246)', () => {
    const m = strikeMap('GOLDM', 100000, 99000, 20, 15);
    expect(m).toMatchObject({ ustrikeOne: 100500, ustrikeTwo: 101000, bstrikeOne: 99500, bstrikeTwo: 99000, strikeDiff: 500 });
    const range = (99000 * (20 / Math.sqrt(246))) / 100; // 1262.4...
    expect(m.vixDDUpper).toBeCloseTo(99000 + range, 1);
    expect(m.vixDDLower).toBeCloseTo(99000 - range, 1);
  });

  it('a missing volatility value falls back to the VIX proxy, USDINR is fixed at 4.85, an unknown name uses 100/100', () => {
    const a = strikeMap('GOLDM', 100000, 100000, 0, 18);
    const b = strikeMap('GOLDM', 100000, 100000, 18, 99);
    expect(a.vixDDUpper).toBe(b.vixDDUpper);
    const u = strikeMap('USDINR', 90, 90, 50, 50);
    expect(u.vixDDUpper).toBeCloseTo(90 + (90 * (4.85 / Math.sqrt(246))) / 100, 2);
    expect(u.ustrikeOne).toBe(90.25);
    expect(strikeMap('ZINC', 300, 300, 20, 20).ustrikeOne).toBe(400);
  });

  it('which index each commodity uses', () => {
    expect([volKeyFor('CRUDEOILM'), volKeyFor('GOLD'), volKeyFor('SILVERM'), volKeyFor('NATGASMINI'), volKeyFor('USDINR'), volKeyFor('COPPER')]).toEqual(['OVX', 'GVZ', 'VXSLV', 'VIX', 'FIXED', 'VIX']);
  });

  it('zone and trend use the at-or-beyond rule', () => {
    const m = strikeMap('GOLDM', 100000, 100000, 20, 20);
    expect(zone915(101000, m)).toBe('AST');
    expect(zone915(100500, m)).toBe('ASO');
    expect(zone915(100100, m)).toBe('B/W');
    expect(zone915(99500, m)).toBe('BSO');
    expect(zone915(99000, m)).toBe('BST');
    expect([trendScore(101000, m), trendScore(100500, m), trendScore(100000, m), trendScore(99500, m), trendScore(98000, m)]).toEqual([2, 1, 0, -1, -2]);
    expect(trendFlags(101200, m)).toEqual(['ASO', 'AST']);
  });
});

describe('VolIndexService', () => {
  it('today: CBOE previous close; a past day: the Yahoo close before that day; failures fall back to the saved value', async () => {
    const now = Date.parse('2026-11-23T10:00:00+05:30');
    const store = mem();
    const rows = [{ d: '2026-11-18', c: 40 }, { d: '2026-11-19', c: 41 }, { d: '2026-11-20', c: 42 }];
    let cboeOk = true;
    const svc = new VolIndexService({ store, now: () => now, cboe: async () => { if (!cboeOk) throw new Error('blocked'); return 58.01; }, yahoo: async () => rows });
    expect((await svc.get({ key: 'OVX', day: '2026-11-23' }))?.value).toBe(58.01);
    expect((await svc.get({ key: 'OVX', day: '2026-11-20' }))).toMatchObject({ value: 41, source: 'yahoo', asOf: '2026-11-19' });
    svc.invalidate();
    cboeOk = false;
    expect((await svc.get({ key: 'OVX', day: '2026-11-23' }))).toMatchObject({ value: 42, source: 'yahoo' }); // CBOE blocked: Yahoo's latest close
    const dead = new VolIndexService({ store, now: () => now, cboe: async () => { throw new Error('x'); }, yahoo: async () => { throw new Error('y'); } });
    expect((await dead.get({ key: 'OVX', day: '2026-11-23' }))).toMatchObject({ value: 42, source: 'saved' });
    const manual = new VolIndexService({ store, now: () => now, manual: () => 33 });
    expect((await manual.get({ key: 'OVX', day: '2026-11-23' }))).toMatchObject({ value: 33, source: 'manual' });
  });
});
