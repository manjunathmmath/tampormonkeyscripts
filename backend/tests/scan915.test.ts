import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyZone, getStrikeDiff, strikeDetails } from '../src/engine/levels.js';
import { bestStrikeDiff, buildStrikeDiffMap, loadStrikeSteps, parseStrikeCsv, strikeDiffString } from '../src/marketdata/strikeSteps.js';
import { buildUniverse, foStockSymbols } from '../src/instruments/universe.js';
import { InstrumentBook, parseInstrumentsCsv } from '../src/instruments/book.js';
import { Scan915, defaultScanDay } from '../src/scan915/scan.js';
import type { Candle } from '../src/kite/client.js';

describe('strike levels (ported)', () => {
  it('builds ASO / AST / BSO / BST from the open and the step', () => {
    expect(strikeDetails(25400, '50,50')).toEqual({ aso: 25450, ast: 25500, bso: 25350, bst: 25300 });
    expect(strikeDetails(1000.5, '10,20')).toEqual({ aso: 1010.5, ast: 1030.5, bso: 990.5, bst: 970.5 });
  });
  it('keeps the userscript behaviour for a single step value: AST and BST are NaN', () => {
    const l = strikeDetails(1000, '50');
    expect(l.aso).toBe(1050);
    expect(l.bso).toBe(950);
    expect(Number.isNaN(l.ast)).toBe(true);
    expect(Number.isNaN(l.bst)).toBe(true);
    // consequence: such a name can never be classified AST or BST
    expect(classifyZone(5000, l)).toBe('ASO');
    expect(classifyZone(10, l)).toBe('BSO');
  });
  it('classifies at-or-beyond a level, checking AST, ASO, BST, BSO in order', () => {
    const l = { aso: 110, ast: 120, bso: 90, bst: 80 };
    expect(classifyZone(120, l)).toBe('AST');
    expect(classifyZone(119.99, l)).toBe('ASO');
    expect(classifyZone(110, l)).toBe('ASO');
    expect(classifyZone(100, l)).toBe('B/W');
    expect(classifyZone(90, l)).toBe('BSO');
    expect(classifyZone(80, l)).toBe('BST');
    expect(classifyZone(79, l)).toBe('BST');
  });
  it('uses 100,100 for an unknown name and strips spaces', () => {
    expect(getStrikeDiff('XYZ', {})).toEqual({ diff: '100,100', known: false });
    expect(getStrikeDiff('A', { A: '10, 20' })).toEqual({ diff: '10,20', known: true });
  });
});

const SOS = `20112026
Symbol,Month type,Symbol Type,Step Value,No. of Strikes Provided (ITM),No. of Strikes Provided (ATM),No. of Strikes Provided (OTM),Total ITM,ATM,Total OTM
ALKEM,M1,EQUITY,50,10,1,10,30,1,30
ALKEM,M1,EQUITY,100,8,1,8,24,1,24
ALKEM,M2,EQUITY,50,10,1,10,30,1,30
ONLYTWO,M2,EQUITY,5,10,1,10,30,1,30
SAME,M1,EQUITY,20,10,1,10,30,1,30
RELIANCE,M1,EQUITY,10,12,1,12,36,1,36
RELIANCE,M1,EQUITY,20,9,1,9,27,1,27
`;

describe('strike step file', () => {
  it('parses it, prefers M1 and gives min,max or a single value', () => {
    const p = parseStrikeCsv(SOS);
    expect(Object.keys(p).sort()).toEqual(['ALKEM', 'ONLYTWO', 'RELIANCE', 'SAME']);
    expect(strikeDiffString([10, 20])).toBe('10,20');
    expect(strikeDiffString([20])).toBe('20');
    expect(bestStrikeDiff(p.ALKEM)).toBe('50,100');
    expect(bestStrikeDiff(p.ONLYTWO)).toBe('5'); // no M1: falls to M2
    const m = buildStrikeDiffMap(p);
    expect(m.RELIANCE).toBe('10,20');
    expect(m.SAME).toBe('20');
    expect(m['NIFTY 50']).toBe('50,50'); // index steps merged in
  });
  it('saves the downloaded file, reuses it and falls back to an older copy', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'groot-s-'));
    let calls = 0;
    const text = SOS + 'X'.repeat(0) + Array.from({ length: 12 }, (_, i) => `S${i},M1,EQUITY,5,1,1,1,1,1,1`).join('\n') + '\n';
    const r1 = await loadStrikeSteps(dir, '2026-11-20', async () => { calls++; return text; });
    const r2 = await loadStrikeSteps(dir, '2026-11-20', async () => { calls++; return text; });
    expect([r1.source, r2.source, calls]).toEqual(['downloaded', 'saved', 1]);
    expect(existsSync(join(dir, 'strike-steps-2026-11-20.csv'))).toBe(true);
    const r3 = await loadStrikeSteps(dir, '2026-11-21', async () => { throw new Error('blocked'); });
    expect(r3.source).toBe('older-copy');
    await expect(loadStrikeSteps(mkdtempSync(join(tmpdir(), 'groot-s-')), '2026-11-21', async () => { throw new Error('blocked'); })).rejects.toThrow(/no saved copy/);
  });
});

const CSV = [
  'instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange',
  '256265,1001,NIFTY 50,"NIFTY 50",0,,0,0,0,EQ,INDICES,NSE',
  '260105,1017,NIFTY BANK,"NIFTY BANK",0,,0,0,0,EQ,INDICES,NSE',
  '264969,1035,INDIA VIX,"INDIA VIX",0,,0,0,0,EQ,INDICES,NSE',
  '999,9,NIFTY IT,"NIFTY IT",0,,0,0,0,EQ,INDICES,NSE',
  '738561,2885,RELIANCE,"RELIANCE INDUSTRIES",0,,0,0.05,1,EQ,NSE,NSE',
  '2,5,ALKEM,"ALKEM LAB",0,,0,0.05,1,EQ,NSE,NSE',
  '3,6,NOFNO,"NO FNO LTD",0,,0,0.05,1,EQ,NSE,NSE',
  '9001,35,RELIANCE26NOVFUT,"RELIANCE",0,2026-11-24,0,0.1,250,FUT,NFO-FUT,NFO',
  '9002,36,NIFTY26NOVFUT,"NIFTY",0,2026-11-24,0,0.1,75,FUT,NFO-FUT,NFO',
].join('\n');

describe('universe', () => {
  const book = new InstrumentBook(parseInstrumentsCsv(CSV), '2026-11-20');
  it('has F&O stocks plus only the app indices (not every index row, not non-F&O stocks)', () => {
    expect(foStockSymbols(book)).toEqual(['RELIANCE']);
    const u = buildUniverse(book, ['ALKEM']);
    expect(Object.keys(u).sort()).toEqual(['ALKEM', 'INDIA VIX', 'NIFTY 50', 'NIFTY BANK', 'RELIANCE']);
    expect(u['NIFTY IT']).toBeUndefined();
    expect(u.NOFNO).toBeUndefined();
  });
});

describe('scan 9:15', () => {
  const day = '2026-11-20';
  const cd = (t: string, o: number, c: number): Candle => [`${day}T${t}:00+0530`, o, Math.max(o, c), Math.min(o, c), c, 100];
  const candles: Record<number, Candle[]> = {
    256265: [cd('09:15', 25400, 25460), cd('09:20', 25460, 25470)], // +60 vs ASO 25450: ASO
    260105: [cd('09:15', 58000, 57750)], // step 100: BSO 57900, BST 57800 -> close 57750 <= BST
    738561: [cd('09:15', 1000, 1005)], // step 10,20: ASO 1010 -> B/W
    2: [], // no candles: skipped
  };
  const make = (history?: any) => {
    const dir = mkdtempSync(join(tmpdir(), 'groot-sc-'));
    const scan = new Scan915({
      history: history ?? { candles: async (q: { token: number }) => candles[q.token] ?? [] },
      universe: () => ({ 'NIFTY 50': 256265, 'NIFTY BANK': 260105, RELIANCE: 738561, ALKEM: 2 }),
      strikeDiffs: () => ({ 'NIFTY 50': '50,50', 'NIFTY BANK': '100,100', RELIANCE: '10,20' }),
      dataDir: dir,
      now: () => Date.parse('2026-11-21T10:00:00+05:30'),
    });
    return { scan, dir };
  };
  const wait = async (scan: Scan915) => { for (let i = 0; i < 200 && scan.isRunning(); i++) await new Promise((r) => setTimeout(r, 5)); };

  it('classifies each name from its first candle and saves the result', async () => {
    const { scan, dir } = make();
    scan.start(day, false);
    await wait(scan);
    const s = scan.state(day);
    expect(s.items['NIFTY 50']).toMatchObject({ zone: 'ASO', aso: 25450, bso: 25350, anchor: 25400, close: 25460, stepKnown: true });
    expect(s.items['NIFTY BANK']?.zone).toBe('BST');
    expect(s.items.RELIANCE?.zone).toBe('B/W');
    expect(s.items.ALKEM).toBeUndefined(); // no candles
    expect(s.items.RELIANCE?.stepKnown).toBe(true);
    expect(s.done).toBe(4);
    expect(existsSync(join(dir, `scan915-${day}.json`))).toBe(true);
    // a second instance reads the saved scan
    const again = new Scan915({ history: { candles: async () => [] }, universe: () => ({}), strikeDiffs: () => ({}), dataDir: dir, now: () => 0 });
    expect(again.state(day).items['NIFTY 50']?.zone).toBe('ASO');
  });
  it('uses the day\'s first candle, and the 09:15 candle for GIFT NIFTY', async () => {
    const early: Candle[] = [[`${day}T06:30:00+0530`, 25000, 25000, 25000, 25000, 1], cd('09:15', 25400, 25520)];
    const dir = mkdtempSync(join(tmpdir(), 'groot-sc-'));
    const scan = new Scan915({ history: { candles: async () => early }, universe: () => ({ 'GIFT NIFTY': 1, 'NIFTY 50': 2 }), strikeDiffs: () => ({ 'GIFT NIFTY': '50,50', 'NIFTY 50': '50,50' }), dataDir: dir, now: () => Date.parse('2026-11-21T10:00:00+05:30') });
    scan.start(day, true);
    await wait(scan);
    const s = scan.state(day);
    expect(s.items['GIFT NIFTY']?.anchor).toBe(25400); // its own 09:15 candle
    expect(s.items['NIFTY 50']?.anchor).toBe(25000); // candles[0], like the userscript
  });
  it('does not scan today before 09:20 and records errors per name', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'groot-sc-'));
    const early = new Scan915({ history: { candles: async () => [] }, universe: () => ({ A: 1 }), strikeDiffs: () => ({}), dataDir: dir, now: () => Date.parse('2026-11-20T09:10:00+05:30') });
    expect(early.start('2026-11-20', false).message).toMatch(/09:20/);
    const bad = make({ candles: async (q: { token: number }) => { if (q.token === 260105) throw new Error('boom'); return candles[q.token] ?? []; } });
    bad.scan.start(day, true);
    await wait(bad.scan);
    const s = bad.scan.state(day);
    expect(s.errors).toEqual([{ name: 'NIFTY BANK', error: 'boom' }]);
    expect(s.items['NIFTY 50']).toBeDefined();
  });
  it('picks a sensible default day', () => {
    expect(defaultScanDay(Date.parse('2026-11-21T10:00:00+05:30'))).toBe('2026-11-20'); // Saturday -> Friday
    expect(defaultScanDay(Date.parse('2026-11-23T08:00:00+05:30'))).toBe('2026-11-20'); // Monday before 09:20 -> Friday
    expect(defaultScanDay(Date.parse('2026-11-23T10:00:00+05:30'))).toBe('2026-11-23');
  });
});
