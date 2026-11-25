import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Candle } from '../src/kite/client.js';
import { HistoryService } from '../src/marketdata/history.js';
import { LiveMarket } from '../src/marketdata/live.js';
import { nearStrikes } from '../src/marketdata/liveSubs.js';
import type { Tick } from '../src/marketdata/ticks.js';

// 2026-11-23 10:07 IST
const NOW = Date.parse('2026-11-23T10:07:00+05:30');
const DAY = '2026-11-23';
const tick = (token: number, ltp: number, volume: number, oi?: number): Tick => ({ token, ltp, open: ltp, high: ltp, low: ltp, close: ltp, change: 0, tradable: true, volume, oi, ts: Math.floor(NOW / 1000) });
const c = (t: string, o: number, h: number, l: number, cl: number, v: number, oi?: number): Candle => (oi === undefined ? [`${DAY}T${t}:00+0530`, o, h, l, cl, v] : [`${DAY}T${t}:00+0530`, o, h, l, cl, v, oi]);

function setup(epoch = { v: 1 }, healthy = { v: true }) {
  const live = new LiveMarket({ epoch: () => epoch.v, healthy: () => healthy.v, now: () => NOW });
  let calls = 0;
  const kite = { historical: async (): Promise<Candle[]> => { calls++; return [c('09:15', 100, 105, 99, 104, 1000), c('10:05', 104, 106, 103, 105, 400)]; } };
  const history = new HistoryService({ kite, dataDir: mkdtempSync(join(tmpdir(), 'live-')), now: () => NOW, live });
  return { live, history, calls: () => calls, epoch, healthy };
}
const q = { token: 7, interval: '5minute' as const, from: DAY, to: DAY };

describe('history reads of today are answered from tick-built candles', () => {
  it('reads Kite once, then serves from memory and keeps the forming candle current from ticks', async () => {
    const s = setup();
    const first = await s.history.candles(q);
    expect(first).toHaveLength(2);
    expect(s.calls()).toBe(1);
    s.live.onTicks([tick(7, 107, 1500)], NOW); // baseline volume
    s.live.onTicks([tick(7, 108, 1560)], NOW); // +60 volume in the 10:05 candle
    const again = await s.history.candles(q);
    expect(s.calls()).toBe(1);
    expect(again[1]![4]).toBe(108);
    expect(again[1]![5]).toBe(460);
    expect(s.live.served).toBe(1);
  });
  it('goes back to Kite after a reconnect (ticks were missed) and re-seeds', async () => {
    const s = setup();
    await s.history.candles(q);
    s.epoch.v = 2;
    await s.history.candles(q);
    expect(s.calls()).toBe(2);
    expect(s.live.fallback['stale (reconnect)']).toBe(1);
    await s.history.candles(q);
    expect(s.calls()).toBe(2);
  });
  it('never serves while the feed is down, and does not seed a read that straddled a reconnect', async () => {
    const s = setup();
    s.healthy.v = false;
    await s.history.candles(q);
    await s.history.candles(q);
    expect(s.calls()).toBe(2);
    expect(s.live.fallback['feed down']).toBeGreaterThan(0);
  });
  it('asks Kite for a range that starts earlier than the series, and for open interest the series lacks', async () => {
    const s = setup();
    await s.history.candles(q);
    await s.history.candles({ ...q, from: '2026-11-20' });
    expect(s.calls()).toBe(2);
    expect(s.live.fallback['range earlier']).toBe(1);
    await s.history.candles({ ...q, oi: true });
    expect(s.live.fallback['oi mismatch']).toBe(1);
  });
  it('leaves past days and snapshot reads to the normal path', async () => {
    const s = setup();
    await s.history.candles({ ...q, from: '2026-11-20', to: '2026-11-20' });
    await s.history.candles({ ...q, asOf: '10:00' });
    expect(s.live.served + s.live.seeds).toBe(0);
  });
});

describe('strike picking', () => {
  const rows = [22000, 22050, 22100, 22150, 22200, 22250, 22300].flatMap((k) => [{ strike: k, type: 'CE' }, { strike: k, type: 'PE' }]) as never[];
  it('keeps the strikes nearest the price, both sides, CE and PE', () => {
    const r = nearStrikes(rows, 22140, 1);
    expect([...new Set(r.map((x) => x.strike))]).toEqual([22100, 22150, 22200]);
    expect(r).toHaveLength(6);
  });
});

import { LiveEngine } from '../src/marketdata/liveEngine.js';
import { LiveSubs } from '../src/marketdata/liveSubs.js';

describe('engine pre-seed and accuracy check', () => {
  it('reads each followed contract once in the background, and the check compares with Kite', async () => {
    const live = new LiveMarket({ epoch: () => 1, healthy: () => true, now: () => NOW });
    const kiteCalls: number[] = [];
    const rest = async (): Promise<Candle[]> => [c('09:15', 100, 105, 99, 104, 1000), c('10:05', 104, 106, 103, 105, 400)];
    const history = new HistoryService({ kite: { historical: async (t) => { kiteCalls.push(t); return rest(); } }, dataDir: mkdtempSync(join(tmpdir(), 'live-')), now: () => NOW, live });
    const subs = new LiveSubs({ book: () => undefined, universe: () => ({}), commodities: () => [], heavyweights: () => [], live, subscribe: () => undefined, now: () => NOW });
    // two followed contracts, injected through plan()
    subs.plan = () => new Map([[7, { token: 7, group: 'Spot and indices' as const, label: 'NIFTY 50' }], [8, { token: 8, group: 'Futures' as const, label: 'NIFTY26NOVFUT' }]]);
    subs.sync();
    const eng = new LiveEngine({
      live, subs, book: () => undefined, ticker: () => ({ state: 'connected', subscribedCount: 2, reconnects: 0, connectedAt: 1, lastTickAt: NOW }), limiter: () => ({}),
      historical: async () => rest(), read: (q) => history.candles(q), background: (f) => f(), canRun: () => true, now: () => NOW,
    });
    await eng.preseed();
    expect(kiteCalls.sort()).toEqual([7, 8]);
    expect(live.info(7).fresh && live.info(8).fresh).toBe(true);
    await eng.preseed();
    expect(kiteCalls).toHaveLength(2);
    await eng.runCheck();
    const st = eng.status() as { check: { rows: { exact: number; matched: number }[] }; preseed: { done: number } };
    expect(st.preseed.done).toBe(2);
    expect(st.check.rows.length).toBe(2);
    expect(st.check.rows[0]!.exact).toBe(st.check.rows[0]!.matched);
  });
});

describe('patching closed candles with Kite\'s own', () => {
  it('replaces closed candles but never the forming one', () => {
    const live = new LiveMarket({ epoch: () => 1, healthy: () => true, now: () => NOW });
    live.watch(9, false, [c('09:15', 100, 105, 99, 104, 0), c('09:20', 104, 106, 103, 105, 0), c('09:25', 105, 105, 105, 105, 0)]);
    const n = live.patch(9, [c('09:15', 100, 105.5, 98.5, 104, 0), c('09:20', 104, 106, 103, 105, 0), c('09:25', 1, 1, 1, 1, 0)]);
    expect(n).toBe(1);
    const got = live.candles(9)!;
    expect(got[0]![2]).toBe(105.5);
    expect(got[2]![4]).toBe(105);
  });
});

describe('mover strikes are followed ahead of time', () => {
  it('adds a mover stock\'s strikes around its price, not heavyweights twice', () => {
    const live = new LiveMarket({ epoch: () => 1, healthy: () => true, now: () => NOW });
    live.onTicks([tick(500, 1000, 1)], NOW);
    const opt = (token: number, strike: number, type: string) => ({ token, symbol: `ACME26NOV${strike}${type}`, strike, type, expiry: '2026-11-24', name: 'ACME', segment: 'NFO-OPT', exchange: 'NFO', exchangeToken: 0, tickSize: 0.05, lotSize: 1 });
    const rows = [940, 960, 980, 1000, 1020, 1040, 1060].flatMap((k, i) => [opt(1000 + i * 2, k, 'CE'), opt(1001 + i * 2, k, 'PE')]);
    const book = { futures: () => [], expiries: () => ['2026-11-24'], options: () => rows } as never;
    const got: number[] = [];
    const subs = new LiveSubs({ book: () => book, universe: () => ({ ACME: 500 }), commodities: () => [], heavyweights: () => [], movers: () => ['ACME'], live, subscribe: (t) => got.push(...t), now: () => NOW });
    subs.sync();
    expect(subs.count('Stock options')).toBe(14); // 4 strikes either side of 1000, but only 7 exist: all of them, CE and PE
  });
});

describe('a chart stream watching a token must not shadow the day\'s candles', () => {
  it('serves nothing from a tick-only series, and a real seed replaces it', async () => {
    const live = new LiveMarket({ epoch: () => 1, healthy: () => true, now: () => NOW });
    live.watch(42, false); // what /stream does: no seed
    live.onTicks([tick(42, 100, 10)], NOW);
    expect(live.serve({ token: 42, from: DAY, to: DAY })).toBeNull();
    const real = [c('09:15', 1, 2, 1, 2, 5), c('10:05', 2, 3, 2, 3, 5)];
    live.watch(42, true, real); // the option chain's seed arrives later
    expect(live.candles(42)).toHaveLength(2);
    expect(live.serve({ token: 42, from: DAY, to: DAY })).toHaveLength(2);
  });
});

import { defaultMcxDay } from '../src/marketdata/days.js';
import { defaultScanDay } from '../src/scan915/scan.js';

describe('an NSE holiday', () => {
  const hol = new Set(['2026-11-24']);
  it('shows the previous trading day for NSE, all day', () => {
    expect(defaultScanDay(Date.parse('2026-11-24T11:00:00+05:30'), hol)).toBe('2026-11-23');
    expect(defaultScanDay(Date.parse('2026-11-25T08:00:00+05:30'), hol)).toBe('2026-11-23');
    expect(defaultScanDay(Date.parse('2026-11-25T10:00:00+05:30'), hol)).toBe('2026-11-25');
  });
  it('keeps the commodity market on the previous day until its evening session opens at 17:00', () => {
    expect(defaultMcxDay(Date.parse('2026-11-24T11:00:00+05:30'), hol)).toBe('2026-11-23');
    expect(defaultMcxDay(Date.parse('2026-11-24T17:05:00+05:30'), hol)).toBe('2026-11-24');
    expect(defaultMcxDay(Date.parse('2026-11-26T10:00:00+05:30'), hol)).toBe('2026-11-26');
  });
});
