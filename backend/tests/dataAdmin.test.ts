import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileStore } from '../src/store/fileStore.js';
import { DataAdmin } from '../src/system/dataAdmin.js';

describe('DataAdmin', () => {
  const make = () => {
    const dir = mkdtempSync(join(tmpdir(), 'dataadmin-'));
    mkdirSync(join(dir, 'candles'));
    for (const f of ['instruments-2026-11-20.csv', 'strike-steps-2026-11-20.csv', 'score_series_X_2026-11-20.json', 'scan915-2026-11-20.json', 'index-weights.json', 'settings.json', 'kite-token.json', 'macro_in10y.json', 'macro_hist_INGS.json', 'holidays.json', 'candles/1_5minute_px_a_b.json']) writeFileSync(join(dir, f), '{}');
    const calls: string[] = [];
    const a = new DataAdmin({ dataDir: dir, store: new FileStore(dir), reloadInstruments: async () => void calls.push('inst'), reloadWeights: async () => void calls.push('w'), refresh: () => void calls.push('r') });
    return { dir, a, calls };
  };
  it('counts each kind and keeps settings, login, macro and holidays out of every group', () => {
    const { a } = make();
    const inv = Object.fromEntries(a.inventory().map((g) => [g.id, g.files]));
    expect(inv).toEqual({ instruments: 2, candles: 1, saved: 2, weights: 1 });
  });
  it('clears one kind at a time and never the protected files', async () => {
    const { a, dir, calls } = make();
    expect((await a.clear('saved')).removed).toBe(2);
    expect(existsSync(join(dir, 'scan915-2026-11-20.json'))).toBe(false);
    expect(existsSync(join(dir, 'candles/1_5minute_px_a_b.json'))).toBe(true);
    await a.clear('candles');
    expect(existsSync(join(dir, 'candles/1_5minute_px_a_b.json'))).toBe(false);
    await a.clear('instruments');
    expect(calls).toContain('inst');
    await a.clear('weights');
    expect(calls).toContain('w');
    for (const keep of ['settings.json', 'kite-token.json', 'macro_in10y.json', 'macro_hist_INGS.json', 'holidays.json']) expect(existsSync(join(dir, keep))).toBe(true);
  });
});
