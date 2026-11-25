import { describe, expect, it } from 'vitest';
import { Watchlist } from '../src/marketdata/watchlist.js';

const mk = () => {
  const mem = new Map<string, unknown>();
  const store = { get: (k: string) => mem.get(k), set: (k: string, v: unknown) => void mem.set(k, v), delete: (k: string) => void mem.delete(k) } as never;
  return new Watchlist({ store, book: () => undefined, universe: () => ({ 'NIFTY 50': 256265, 'NIFTY BANK': 260105, INFY: 408065 }), indexNames: (ix) => (ix === 'NIFTY 50' ? ['INFY', 'NOPE'] : []) });
};

describe('Watchlist', () => {
  it('builds the default groups from what is known and skips unknown names', () => {
    const g = mk().get();
    expect(g.custom).toBe(false);
    expect(g.groups.map((x) => x.name)).toEqual(['Indices', 'NIFTY 50']);
    expect(g.groups[1]!.items.map((i) => i.label)).toEqual(['INFY']);
  });
  it('saves a cleaned list (duplicates and bad tokens dropped) and can reset', () => {
    const w = mk();
    const out = w.save([{ id: 'a', name: ' Mine ', items: [{ token: 1, label: 'X' }, { token: 1, label: 'dup' }, { token: -5, label: 'bad' }, { token: 'x' }] }]);
    expect(out[0]!.items).toEqual([{ token: 1, label: 'X' }]);
    expect(w.get().custom).toBe(true);
    w.reset();
    expect(w.get().custom).toBe(false);
  });
  it('has the weighted groups, in weight order, in the defaults and next to a saved list, and never saves them', () => {
    const mem = new Map<string, unknown>();
    const store = { get: (k: string) => mem.get(k), set: (k: string, v: unknown) => void mem.set(k, v), delete: (k: string) => void mem.delete(k) } as never;
    const w = new Watchlist({ store, book: () => undefined, universe: () => ({ 'NIFTY 50': 1, INFY: 2, TCS: 3 }), indexNames: () => [], topWeights: () => [{ name: 'INFY', weight: 6 }, { name: 'TCS', weight: 4 }] });
    const d = w.get();
    const g = d.groups.find((x) => x.id === 'wtd50')!;
    expect(g.live).toBe(true);
    expect(g.items.map((i) => i.label)).toEqual(['NIFTY 50', 'INFY', 'TCS']);
    expect(g.items[1]!.sub).toBe('6.00% of NIFTY 50');
    w.save([{ id: 'mine', name: 'Mine', items: [{ token: 9, label: 'X' }] }, { ...g }]);
    const after = w.get();
    expect(after.custom).toBe(true);
    expect(after.groups.map((x) => x.id)).toEqual(['mine', 'wtd50', 'wtdbank']);
    expect((mem.get('watchlist') as { id: string }[]).map((x) => x.id)).toEqual(['mine']);
  });
  it('rejects a group with no name', () => {
    expect(() => mk().save([{ id: 'a', name: ' ', items: [] }])).toThrow('name');
  });
});
