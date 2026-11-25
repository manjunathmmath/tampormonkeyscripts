import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runParity } from '../scripts/parity-futures.js';

const DATA = resolve(__dirname, '../../data');
const have = existsSync(resolve(DATA, 'snapshots/2026-11-05_NSE.jsonl')) && existsSync(resolve(DATA, 'candles/2026-11-05'));

describe('futures parity with the recorded snapshots (data/, skipped when absent)', () => {
  it.skipIf(!have)('rebuilds the same candles (intraday VWAP matches every recorded slot) and the same SENSEX remark', () => {
    const { rows } = runParity(['2026-11-05', '2026-11-06']);
    expect(rows.length).toBeGreaterThan(3);
    for (const r of rows) expect(r.vwapMatch, `${r.day} ${r.name} vwap`).toBe(r.slots); // identical candle inputs
    // the ORIGINAL userscript classifier, run on the same candles, equals the port on every slot (this is the proof of a faithful port)
    for (const r of rows) expect(r.oraclePort, `${r.day} ${r.name} original vs port`).toBe(r.slots);
    for (const r of rows.filter((x) => x.name === 'SENSEX')) expect(r.remarkMatch, `${r.day} SENSEX remark`).toBe(r.slots);
    // the saved NIFTY 50 / NIFTY BANK remarks are not what the original function produces from these candles (docs/port-findings.md #7)
    for (const r of rows.filter((x) => x.name !== 'SENSEX')) expect(r.oracleStored).toBe(r.remarkMatch);
  }, 60000);
});
