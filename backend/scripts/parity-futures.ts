/**
 * Parity check: the ported futures REMARK against the userscript's own remark recorded in data/snapshots, slot by slot.
 * For each recorded NSE day it rebuilds the futures candles from the replay candle cache (data/candles/<day>), cuts them at the slot time with the
 * replay rule, runs the ported classifier and compares remark and the intraday VWAP with what the old app stored.
 *   npx tsx scripts/parity-futures.ts [day ...]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { classifyFutures, computeIntradayVwap, type FutCandle } from '../src/engine/futures.js';
import { sliceAsOf, trimCandles } from '../src/marketdata/history.js';
import type { Candle } from '../src/kite/client.js';
import { futuresOracle, plain } from '../tests/oracle/oracle.js';

const DATA = resolve(import.meta.dirname ?? __dirname, '../../data');
const SPOT: Record<string, number> = { 'NIFTY 50': 256265, 'NIFTY BANK': 260105, SENSEX: 265 };
const toFut = (c: Candle): FutCandle => ({ date: String(c[0]).slice(11, 16), open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5], oi: c[6] });

const readCandles = (f: string): Candle[] => (JSON.parse(readFileSync(f, 'utf8')) as { candles: Candle[] }).candles;

function futuresFor(day: string, spotFirst: number, files: string[], dir: string): { token: string; cs: Candle[] } | undefined {
  let best: { token: string; cs: Candle[]; vol: number } | undefined;
  for (const f of files) {
    if (!f.includes('_5minute_')) continue;
    const token = f.split('_')[0]!;
    if (Number(token) < 100000) continue;
    let cs: Candle[];
    try {
      cs = readCandles(join(dir, f));
    } catch {
      continue;
    }
    const today = cs.filter((c) => String(c[0]).startsWith(day));
    if (today.length < 60 || !today.some((c) => (c[6] ?? 0) > 0)) continue;
    const first = today[0]!;
    if (Math.abs(first[1] / spotFirst - 1) > 0.012) continue; // a futures series trades within about a percent of its spot
    const vol = today.reduce((s, c) => s + c[5], 0);
    if (!best || vol > best.vol) best = { token, cs, vol };
  }
  return best;
}

export interface ParityRow {
  day: string;
  name: string;
  slots: number;
  remarkMatch: number;
  vwapMatch: number;
  /** the ORIGINAL userscript classifier on the same candles: how often it equals the port, and how often it equals the stored remark */
  oraclePort: number;
  oracleStored: number;
}

export function runParity(days: string[], vixMode: 'snapshot' | 'zero' | number = 'snapshot'): { rows: ParityRow[]; diffs: string[] } {
  const oracle = futuresOracle();
  const rows: ParityRow[] = [];
  const diffs: string[] = [];
  for (const day of days) {
    const dir = join(DATA, 'candles', day);
    const snapFile = join(DATA, 'snapshots', `${day}_NSE.jsonl`);
    if (!existsSync(dir) || !existsSync(snapFile)) continue;
    const files = readdirSync(dir);
    const snaps = readFileSync(snapFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { slot: string; inst: Record<string, { fut?: { remark?: string; avwap?: number } }>; mkt?: { vix?: number } });
    for (const name of Object.keys(SPOT)) {
      const spotFile = files.find((f) => f.startsWith(`${SPOT[name]}_5minute_`));
      if (!spotFile) continue;
      const spot = readCandles(join(dir, spotFile)).filter((c) => String(c[0]).startsWith(day));
      if (!spot.length) continue;
      const fut = futuresFor(day, spot[0]![1], files, dir);
      if (!fut) continue;
      const dayFile = files.find((f) => f.startsWith(`${fut.token}_day_`));
      if (!dayFile) continue;
      const daily = readCandles(join(dir, dayFile)).filter((c) => String(c[0]).slice(0, 10) < day);
      const prevRaw = daily[daily.length - 1];
      if (!prevRaw) continue;
      const prev = toFut(prevRaw);
      const row: ParityRow = { day, name, slots: 0, remarkMatch: 0, vwapMatch: 0, oraclePort: 0, oracleStored: 0 };
      for (const s of snaps) {
        const stored = s.inst[name]?.fut;
        if (!stored?.remark) continue;
        const cur = trimCandles(sliceAsOf(fut.cs, day, s.slot, 5), day, s.slot);
        if (!cur.length) continue;
        const intra = cur.map(toFut);
        const q = { high: Math.max(...intra.map((c) => c.high)), low: Math.min(...intra.map((c) => c.low)), close: intra[intra.length - 1]!.close, volume: intra.reduce((a, c) => a + c.volume, 0), oi: intra[intra.length - 1]!.oi };
        const r = classifyFutures(q, prev, 1, intra, { vix: typeof vixMode === 'number' ? vixMode : vixMode === 'zero' ? 0 : s.mkt?.vix ?? 0, baselineVix: 13 });
        const vw = computeIntradayVwap(intra);
        row.slots++;
        const old = plain<{ remark: string }>(oracle.call('_gtbClassifyFutures', plain(q), plain({ high: prev.high, low: prev.low, close: prev.close, volume: prev.volume, oi: prev.oi }), 1, plain(intra), { vix: typeof vixMode === 'number' ? vixMode : vixMode === 'zero' ? 0 : s.mkt?.vix ?? 0, baselineVix: 13 }));
        if (old.remark === r.remark) row.oraclePort++;
        if (old.remark === stored.remark) row.oracleStored++;
        const vwapOk = stored.avwap == null || Math.abs(vw - stored.avwap) < 0.02;
        if (vwapOk) row.vwapMatch++;
        if (r.remark === stored.remark) row.remarkMatch++;
        else if (diffs.length < 25) diffs.push(`${day} ${s.slot} ${name}: old ${stored.remark} new ${r.remark} (vwap ${vw}, old ${stored.avwap}) price ${r.signals.price} oi ${r.signals.oi} eff ${r.signals.effOiPct.toFixed(2)}`);
      }
      rows.push(row);
    }
  }
  return { rows, diffs };
}

if (process.argv[1]?.includes('parity-futures')) {
  const args = process.argv.slice(2);
  const days = args.length ? args : readdirSync(join(DATA, 'snapshots')).filter((f) => f.endsWith('_NSE.jsonl')).map((f) => f.slice(0, 10));
  const { rows, diffs } = runParity(days, process.env.VIX_FIXED ? Number(process.env.VIX_FIXED) : process.env.VIX_MODE === 'zero' ? 'zero' : 'snapshot');
  for (const r of rows) console.log(`${r.day} ${r.name.padEnd(11)} remark(port vs stored) ${r.remarkMatch}/${r.slots}  vwap ${r.vwapMatch}/${r.slots}  original-code vs port ${r.oraclePort}/${r.slots}  original-code vs stored ${r.oracleStored}/${r.slots}`);
  const tot = (k: 'slots' | 'remarkMatch' | 'vwapMatch' | 'oraclePort' | 'oracleStored') => rows.reduce((a, r) => a + r[k], 0);
  console.log(`\nTOTAL remark ${tot('remarkMatch')}/${tot('slots')}  vwap ${tot('vwapMatch')}/${tot('slots')}`);
  for (const d of diffs) console.log(d);
}
