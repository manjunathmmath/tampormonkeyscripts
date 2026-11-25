import { describe, it, expect } from 'vitest';
import { SqueezeService } from '../src/marketdata/squeeze.js';
import type { KeyValueStore } from '../src/store/fileStore.js';
import type { FutCandle } from '../src/engine/futures.js';

const mem = (): KeyValueStore => {
  const m = new Map<string, unknown>();
  return { get: <T>(k: string) => m.get(k) as T | undefined, set: (k, v) => void m.set(k, v), delete: (k) => void m.delete(k) };
};

const candles = (n: number, drift: number): FutCandle[] => {
  let px = 24000;
  return Array.from({ length: n }, (_, i) => {
    const o = px;
    px *= 1 + drift;
    return { date: `09:${String(15 + i * 5).padStart(2, '0')}`, open: o, high: Math.max(o, px) * 1.0004, low: Math.min(o, px) * 0.9996, close: px, volume: 5000 + i, oi: 1_000_000 - i * 3000 };
  });
};

describe('SqueezeService', () => {
  it('reports the live signal, the watch and the study state, and caches the finished study', async () => {
    let historyCalls = 0;
    const store = mem();
    const svc = new SqueezeService({
      futures: {
        load: async () => ({ remark: 'SHOT_COVERING', token: 1, lotSize: 75, expiry: '2026-11-21' }),
        series: async () => ({ intraday: candles(20, 0.0008), prev: { high: 24100, low: 23800, close: 23900, volume: 400000, oi: 1_050_000 }, lot: 75, vix: 14 }),
      },
      futAcc: { load: async () => ({ SHOT_COVERING: { hits: 9, total: 10, pts: 0, eodPts: 100 } }) },
      oi: { analyse: async () => ({ pcr: '1.5', changePct: 0.8, ltp: 24100 }) },
      history: {
        candles: async () => {
          historyCalls++;
          return [];
        },
      },
      store,
    });
    const a = await svc.load({ name: 'NIFTY 50', day: '2026-11-20' });
    expect(a.signal.active).toBe(true);
    expect(a.signal.type).toBe('SHORT_COVERING');
    expect(a.signal.nearExpiry).toBe(true); // 1 day to expiry
    expect(a.signal.extremePositioning).toBe(true); // PCR 1.5
    expect(a.signal.probability).toBe(40 + 25 + 15 + 10); // base + expiry + PCR + remark accuracy
    expect(['loading', 'ready']).toContain(a.study.state);
    await new Promise((r) => setTimeout(r, 20));
    const b = await svc.load({ name: 'NIFTY 50', day: '2026-11-20' });
    expect(b.study.state).toBe('ready');
    expect(b.study.data?.days).toBe(0); // no past sessions in the stub
    await svc.load({ name: 'NIFTY 50', day: '2026-11-20' });
    expect(historyCalls).toBe(1); // the study is built once
  });
});
