import { describe, expect, it } from 'vitest';
import { TrackingService, wallsOf } from '../src/marketdata/tracking.js';

const zones = [
  { price: 1000, items: [{ src: 'OI wall R1' }] },
  { price: 950, items: [{ src: 'Max pain' }] },
  { price: 900, items: [{ src: 'OI wall S1' }] },
];

describe('wallsOf', () => {
  it('keeps only the OI walls with their side and distance', () => {
    const w = wallsOf(990, zones);
    expect(w.map((x) => x.label)).toEqual(['S1', 'R1']);
    expect(w[1]!.distPct).toBeCloseTo(-1, 5);
  });
});

describe('stage', () => {
  it('approaching only from the approach side, at either side', () => {
    expect(TrackingService.stage('R', 995, 1000)).toBe('APPROACHING');
    expect(TrackingService.stage('R', 1010, 1000)).toBeNull();
    expect(TrackingService.stage('R', 1001, 1000)).toBe('AT');
    expect(TrackingService.stage('S', 905, 900)).toBe('APPROACHING');
    expect(TrackingService.stage('S', 890, 900)).toBeNull();
    expect(TrackingService.stage('S', 899, 900)).toBe('AT');
    expect(TrackingService.stage('R', 900, 1000)).toBeNull();
  });
});

describe('TrackingService', () => {
  const mk = (prices: number[]) => {
    const mem = new Map<string, unknown>();
    const raised: string[] = [];
    let i = 0;
    const svc = new TrackingService({
      store: { get: (k: string) => mem.get(k), set: (k: string, v: unknown) => void mem.set(k, v), delete: (k: string) => void mem.delete(k) } as never,
      levels: async () => ({ spot: prices[Math.min(i++, prices.length - 1)]!, zones }),
      today: () => '2026-11-23',
      open: () => true,
      raise: (a) => void raised.push(a.kind),
    });
    svc.add('infy');
    return { svc, raised };
  };
  it('raises near, then at, once each, and not again while price stays there', async () => {
    const { svc, raised } = mk([994, 994, 999.5, 999.5, 999.5]);
    for (let k = 0; k < 5; k++) await svc.tick();
    expect(raised).toEqual(['LEVEL_NEAR', 'LEVEL_AT']);
  });
  it('arms the level again after price moves 1.2% away', async () => {
    const { svc, raised } = mk([994, 960, 994]);
    for (let k = 0; k < 3; k++) await svc.tick();
    expect(raised).toEqual(['LEVEL_NEAR', 'LEVEL_NEAR']);
  });
  it('cleans and de-duplicates names', () => {
    const { svc } = mk([990]);
    expect(svc.add(' infy ')).toEqual(['INFY']);
    expect(svc.remove('INFY')).toEqual([]);
  });
});
