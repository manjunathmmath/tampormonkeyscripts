import { describe, it, expect } from 'vitest';
import { MacroService } from '../src/marketdata/macro.js';
import type { KeyValueStore } from '../src/store/fileStore.js';

const mem = (): KeyValueStore => {
  const m = new Map<string, unknown>();
  return { get: <T>(k: string) => m.get(k) as T | undefined, set: (k, v) => void m.set(k, v), delete: (k) => void m.delete(k) };
};
const NOW = Date.parse('2026-11-20T06:00:00Z');
const series = (start: number, step: number): { d: string; c: number }[] =>
  Array.from({ length: 30 }, (_, i) => ({ d: new Date(NOW - (29 - i) * 86400000).toISOString().slice(0, 10), c: start + step * i }));

describe('MacroService', () => {
  it('scores drivers, skips a failed one, accumulates the India index and caches for 5 minutes', async () => {
    let calls = 0;
    const svc = new MacroService(
      mem(),
      async (sym) => {
        calls++;
        if (sym === 'DX-Y.NYB') throw new Error('HTTP 429');
        if (sym === 'BZ=F' || sym === 'CL=F') return { pts: series(70, 1.5), live: 115 }; // crude rising fast = headwind
        if (sym === 'NIFTYGS10YR.NS') return { pts: series(100, 0).slice(-2), live: 100 };
        return { pts: series(100, 0), live: 100 };
      },
      () => NOW,
    );
    const a = await svc.load();
    expect(a.errors.some((e) => e.includes('Dollar Index'))).toBe(true);
    expect(a.errors.some((e) => e.includes('India 10Y G-Sec Yield'))).toBe(true); // manual, nothing pasted
    const brent = a.rows.find((r) => r.key === 'BRENT')!;
    expect(brent.score).toBeLessThan(0);
    expect(brent.reading).toContain('rising');
    expect(a.verdict.score).toBeLessThan(0);
    const ings = a.rows.find((r) => r.key === 'INGS')!;
    expect(ings.thin).toBe(true); // history only builds up over days
    const before = calls;
    await svc.load();
    expect(calls).toBe(before); // cached
  });

  it('keeps pasted India 10Y yield history and uses it', async () => {
    const store = mem();
    const svc = new MacroService(store, async () => ({ pts: series(100, 0), live: 100 }), () => NOW);
    const r = svc.saveManual('25-09-2026\t7.120\n26-09-2026\t7.200\n27-09-2026\t7.250\n28-09-2026\tx\n');
    expect(r).toEqual({ kept: 3, bad: 1, total: 3 });
    const a = await svc.load();
    expect(a.rows.find((x) => x.key === 'IN10Y')).toBeTruthy();
  });
});
