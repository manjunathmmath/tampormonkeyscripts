import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../src/store/fileStore.js';
import { IndexWeightsService, parseWeights } from '../src/marketdata/indexWeights.js';

const sample = (syms: string[]): string => 'var data = [' + syms.map((s, i) => `{"label":"${s} ${(20 - i).toFixed(2)}%","weight":${20 - i},"id":"${i}","date":"30-10-2026"}`).join(',') + '];';
const NIFTY = ['HDFCBANK', 'RELIANCE', 'ICICIBANK', 'INFY', 'TCS', 'ITC', 'LT', 'BHARTIARTL', 'AXISBANK', 'SBIN', 'M&M', 'BAJAJ-AUTO'];

describe('index weights', () => {
  it('reads the leaf entries, keeps symbols such as M&M and BAJAJ-AUTO, and takes the date', () => {
    const p = parseWeights(sample(NIFTY));
    expect(Object.keys(p.weights)).toHaveLength(12);
    expect(p.weights['M&M']).toBe(10);
    expect(p.weights['BAJAJ-AUTO']).toBe(9);
    expect(p.weights['HDFCBANK']).toBe(20);
    expect(p.date).toBe('30-10-2026');
  });
  it('downloads once a day, shapes the lists and the live top 10, and falls back to the saved copy when the download fails', async () => {
    const store = new FileStore(mkdtempSync(join(tmpdir(), 'groot-iw-')));
    let calls = 0;
    let fail = false;
    const svc = new IndexWeightsService(store, async () => { calls++; if (fail) throw new Error('boom'); return sample(NIFTY); }, () => '2026-11-20');
    const a = await svc.load();
    expect(calls).toBe(2);
    expect(a.nifty50[0]).toBe('AXISBANK'); // alphabetical
    expect(Object.keys(a.top10['NIFTY 50'])).toHaveLength(10);
    expect(a.top10['NIFTY 50']['HDFCBANK']).toBe(20);
    await svc.load(); // same day: no new download
    expect(calls).toBe(2);
    fail = true;
    const b = await new IndexWeightsService(store, async () => { throw new Error('boom'); }, () => '2026-11-21').load();
    expect(b.error).toBe('boom');
    expect(b.nifty50.length).toBe(12); // the saved copy is still used
    const empty = await new IndexWeightsService(new FileStore(mkdtempSync(join(tmpdir(), 'groot-iw2-'))), async () => { throw new Error('no net'); }).load();
    expect(empty.nifty50).toEqual([]);
    expect(empty.error).toBe('no net');
  });
});
