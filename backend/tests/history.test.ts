import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HistoryService, dateWindows, dropFormingCandle, previousTradingDay, sliceAsOf, stripPrevDay, trimCandles, trimCandlesTail, CHUNK_DAYS } from '../src/marketdata/history.js';
import type { Candle } from '../src/kite/client.js';

const c = (t: string, o: number, h: number, l: number, cl: number, v: number, oi?: number): Candle => (oi === undefined ? [t, o, h, l, cl, v] : [t, o, h, l, cl, v, oi]);
const D1 = '2026-11-19';
const D2 = '2026-11-20';
const cs: Candle[] = [
  c(`${D1}T15:25:00+0530`, 1, 2, 1, 2, 10, 100),
  c(`${D2}T09:15:00+0530`, 10, 12, 9, 11, 500, 200),
  c(`${D2}T09:20:00+0530`, 11, 13, 10, 12, 400, 210),
  c(`${D2}T09:25:00+0530`, 12, 14, 11, 13, 300, 220),
];

describe('userscript candle helpers (ported)', () => {
  it('strips earlier days and trims to the snapshot end time', () => {
    expect(stripPrevDay(cs, D2).map((x) => x[0].slice(11, 16))).toEqual(['09:15', '09:20', '09:25']);
    expect(trimCandles(cs, D2, '09:20').map((x) => x[0].slice(11, 16))).toEqual(['09:15', '09:20']);
    expect(trimCandles(cs, D2, null)).toHaveLength(3);
    expect(trimCandlesTail(cs, D2, '09:15').map((x) => x[0].slice(0, 16))).toEqual([`${D1}T15:25`, `${D2}T09:15`]);
  });
  it('drops a candle that is still forming, never the only one', () => {
    const now = Date.parse(`${D2}T09:27:00+05:30`);
    expect(dropFormingCandle(cs, '5minute', now)).toHaveLength(3); // 09:25 candle is 2 minutes old: forming -> dropped from 4 to 3
    expect(dropFormingCandle(cs, '5minute', Date.parse(`${D2}T09:31:00+05:30`))).toHaveLength(4);
    expect(dropFormingCandle([cs[0]!], '5minute', now)).toHaveLength(1);
  });
});

describe('as-of cut (the replay rule, no look-ahead)', () => {
  it('keeps completed candles, shows the just-started one as its open only, drops the rest', () => {
    const r = sliceAsOf(cs, D2, '09:21', 5);
    expect(r.map((x) => x[0].slice(11, 16))).toEqual(['15:25', '09:15', '09:20']);
    expect(r[1]).toEqual(cs[1]); // 09:15 completed by 09:20
    expect(r[2]).toEqual([`${D2}T09:20:00+0530`, 11, 11, 11, 11, 0, 200]); // just started: open only, OI carried from the previous COMPLETED candle (09:15)
    expect(sliceAsOf(cs, D2, '09:20', 5).map((x) => x[0].slice(11, 16))).toEqual(['15:25', '09:15', '09:20']);
    expect(sliceAsOf(cs, D2, '09:14', 5)).toHaveLength(1); // only the previous day's candle
  });
  it('carries the previous candle OI into the open-only candle', () => {
    const r = sliceAsOf(cs, D2, '09:26', 5);
    expect(r.at(-1)).toEqual([`${D2}T09:25:00+0530`, 12, 12, 12, 12, 0, 210]);
    expect(r.at(-2)?.[6]).toBe(210);
  });
});

describe('calendar helpers', () => {
  it('finds the previous trading day around weekends and holidays', () => {
    expect(previousTradingDay('2026-11-23')).toBe('2026-11-20'); // Monday -> Friday
    expect(previousTradingDay('2026-11-23', new Set(['2026-11-20']))).toBe('2026-11-19');
    expect(previousTradingDay('2026-11-20')).toBe('2026-11-19');
  });
  it('splits long ranges into windows without gaps or overlaps', () => {
    const w = dateWindows('2026-01-01', '2026-06-30', 90);
    expect(w[0]).toEqual(['2026-01-01', '2026-03-31']);
    expect(w.at(-1)?.[1]).toBe('2026-06-30');
    for (let i = 1; i < w.length; i++) expect(Date.parse(w[i]![0] + 'T00:00:00Z') - Date.parse(w[i - 1]![1] + 'T00:00:00Z')).toBe(86400000);
    expect(dateWindows('2026-11-20', '2026-11-20', 90)).toEqual([['2026-11-20', '2026-11-20']]);
    expect(CHUNK_DAYS['5minute']).toBeLessThanOrEqual(95);
  });
});

describe('history service', () => {
  const mkKite = (calls: [string, string][]) => ({
    historical: async (_t: number, _i: string, from: string, to: string): Promise<Candle[]> => {
      calls.push([from, to]);
      return [c(`${from}T09:15:00+0530`, 1, 2, 1, 2, 3, 4)];
    },
  });
  it('fetches a finished range once, then serves it from disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'groot-h-'));
    const calls: [string, string][] = [];
    const now = Date.parse('2026-11-21T10:00:00+05:30');
    const h = new HistoryService({ kite: mkKite(calls), dataDir: dir, now: () => now });
    const q = { token: 1, interval: '5minute' as const, from: '2026-10-01', to: '2026-11-20', oi: true };
    const a = await h.candles(q);
    const b = await h.candles(q);
    expect(a).toEqual(b);
    expect(calls).toHaveLength(1); // one window (50 days <= 90), second call from disk
    expect(readdirSync(join(dir, 'candles')).some((f) => f.includes('_oi_'))).toBe(true);
  });
  it('does not save a range that includes today, and splits a long range into windows', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'groot-h-'));
    const calls: [string, string][] = [];
    const now = Date.parse('2026-11-20T11:00:00+05:30');
    const h = new HistoryService({ kite: mkKite(calls), dataDir: dir, now: () => now });
    await h.candles({ token: 1, interval: '5minute', from: '2026-11-19', to: '2026-11-20' });
    await h.candles({ token: 1, interval: '5minute', from: '2026-11-19', to: '2026-11-20' });
    expect(calls).toHaveLength(2); // today is live: no disk reuse
    expect(readdirSync(join(dir, 'candles'))).toEqual([]);
    calls.length = 0;
    await h.candles({ token: 2, interval: '5minute', from: '2026-01-01', to: '2026-06-30' });
    expect(calls.length).toBe(3);
  });
  it('applies the as-of cut on the day asked for', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'groot-h-'));
    const h = new HistoryService({
      kite: { historical: async () => cs },
      dataDir: dir,
      now: () => Date.parse('2026-11-21T10:00:00+05:30'),
    });
    const r = await h.candles({ token: 3, interval: '5minute', from: D1, to: D2, oi: true, asOf: '09:21' });
    expect(r.map((x) => x[0].slice(11, 16))).toEqual(['15:25', '09:15', '09:20']);
  });
});
