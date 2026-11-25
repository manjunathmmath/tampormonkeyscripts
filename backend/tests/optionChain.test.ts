import { describe, it, expect } from 'vitest';
import { bsPrice, buildChain, calcIV, calculateIVSeries, calculateOBV, chainInstrument, expiryEndMs, normCDF, resolveExpiry, selectStrikes, type OptionRow } from '../src/engine/optionChain.js';
import { OptionChainService } from '../src/marketdata/optionChain.js';
import { InstrumentBook, parseInstrumentsCsv } from '../src/instruments/book.js';
import type { Candle } from '../src/kite/client.js';

const D = '2026-11-20';
const P = '2026-11-19';
const c = (day: string, hm: string, o: number, h: number, l: number, cl: number, v: number, oi?: number): Candle => (oi === undefined ? [`${day}T${hm}:00+0530`, o, h, l, cl, v] : [`${day}T${hm}:00+0530`, o, h, l, cl, v, oi]);

describe('Black-Scholes and IV', () => {
  it('normal CDF and price behave', () => {
    expect(normCDF(0)).toBeCloseTo(0.5, 6);
    expect(normCDF(1.96)).toBeCloseTo(0.975, 3);
    const call = bsPrice(100, 100, 0.25, 0.065, 0.2, true);
    const put = bsPrice(100, 100, 0.25, 0.065, 0.2, false);
    expect(call).toBeCloseTo(4.81, 2);
    // put-call parity: C - P = S - K e^{-rT}
    expect(call - put).toBeCloseTo(100 - 100 * Math.exp(-0.065 * 0.25), 4);
    expect(bsPrice(100, 100, 0, 0.065, 0.2, true)).toBe(0);
  });
  it('recovers the volatility it was priced with and rejects bad input', () => {
    for (const sigma of [0.12, 0.25, 0.6]) {
      const p = bsPrice(24000, 24100, 0.05, 0.065, sigma, true);
      expect(calcIV(p, 24000, 24100, 0.05, 0.065, true)).toBeCloseTo(sigma, 2);
    }
    expect(calcIV(0, 100, 100, 0.1, 0.065, true)).toBeNull();
    expect(calcIV(1, 100, 80, 0.1, 0.065, true)).toBeNull(); // below intrinsic (20)
    expect(calcIV(5, 100, 100, 0, 0.065, true)).toBeNull();
  });
  it('builds an IV series in percent with the spot of the same timestamp, carrying the last spot forward', () => {
    const expiry = '24-11-2026';
    const spot = [c(D, '09:15', 24000, 24010, 23990, 24000, 0), c(D, '09:20', 24000, 24020, 24000, 24010, 0)];
    const T = (hm: string) => Math.max((expiryEndMs(expiry) - Date.parse(`${D}T${hm}:00+05:30`)) / (365 * 24 * 3600 * 1000), 1 / (365 * 24));
    const px = (hm: string, s: number) => bsPrice(s, 24100, T(hm), 0.065, 0.2, true);
    const opt = [c(D, '09:15', 0, 0, 0, px('09:15', 24000), 1), c(D, '09:20', 0, 0, 0, px('09:20', 24010), 1), c(D, '09:25', 0, 0, 0, px('09:25', 24010), 1)];
    const iv = calculateIVSeries(opt, 24100, true, expiry, spot);
    expect(iv.map((x) => x.iv)).toEqual([20, 20, 20]); // 09:25 has no spot candle: the last spot is carried
    expect(calculateIVSeries(opt, 24100, true, expiry, [])[0]?.iv).toBeNull();
  });
});

describe('OBV', () => {
  it('adds volume on up closes, subtracts on down closes, starting from the previous daily close, in lakhs with one decimal', () => {
    const prev = [c(P, '15:30', 0, 0, 0, 100, 0, 0)];
    const cur = [c(D, '09:15', 0, 0, 0, 101, 200000), c(D, '09:20', 0, 0, 0, 101, 500000), c(D, '09:25', 0, 0, 0, 99, 300000)];
    expect(calculateOBV(prev, cur).map((x) => x.obv)).toEqual(['2.0', '2.0', '-1.0']);
    expect(() => calculateOBV([], cur)).toThrow();
  });
});

describe('strike selection', () => {
  const rows = (strikes: number[]): OptionRow[] => strikes.flatMap((s) => (['CE', 'PE'] as const).map((t) => ({ strike: s, type: t, token: s * 10 + (t === 'CE' ? 1 : 2), expiry: '24-11-2026', symbol: `X${s}${t}` })));
  it('takes ATM (first strike at or above the price) and n strikes each side', () => {
    const { strikeData, atmStrike } = selectStrikes(24037, rows([23900, 23950, 24000, 24050, 24100, 24150, 24200]), 2);
    expect(atmStrike).toBe(24050);
    expect(strikeData.map((s) => s.STRIKE)).toEqual([23950, 24000, 24050, 24100, 24150]);
    expect(strikeData.find((s) => s.ATM_STRIKE === true)?.STRIKE).toBe(24050);
  });
  it('an exact strike is the ATM, and no strike at or above gives ATM 0', () => {
    expect(selectStrikes(24000, rows([23950, 24000, 24050]), 1).atmStrike).toBe(24000);
    const r = selectStrikes(99999, rows([100, 200]), 1);
    expect(r.atmStrike).toBe(0);
    expect(r.strikeData.some((s) => s.STRIKE === 0 && s.ATM_STRIKE === true)).toBe(true);
  });
  it('maps display names to the underlying and the strike count', () => {
    expect(chainInstrument('NIFTY 50')).toEqual({ instrument: 'NIFTY', strikesToShow: 3 });
    expect(chainInstrument('NIFTY BANK')).toEqual({ instrument: 'BANKNIFTY', strikesToShow: 3 });
    expect(chainInstrument('SENSEX')).toEqual({ instrument: 'SENSEX', strikesToShow: 3 });
    expect(chainInstrument('RELIANCE')).toEqual({ instrument: 'RELIANCE', strikesToShow: 2 });
    expect(chainInstrument('RELIANCE', 4)).toEqual({ instrument: 'RELIANCE', strikesToShow: 4 });
  });
  it('resolves the expiry like the userscript', () => {
    const ex = ['2026-11-24', '2026-12-01', '2026-11-17'];
    expect(resolveExpiry('2026-12-01', ex, '2026-11-20')).toBe('2026-12-01'); // configured and real
    expect(resolveExpiry('2026-12-09', ex, '2026-11-20')).toBe('2026-11-24'); // configured but not real: nearest live
    expect(resolveExpiry('', ex, '2026-11-24')).toBe('2026-11-24'); // expiring today still counts
    expect(resolveExpiry('', ['2026-11-10'], '2026-11-20')).toBe('2026-11-10'); // all passed: the first
  });
});

describe('chain table', () => {
  const mk = (strike: number, oiCE: number, prevCE: number, oiPE: number, prevPE: number) => ({
    prevDataCE: [c(P, '00:00', 0, 0, 0, 50, 1000, prevCE)],
    prevDataPE: [c(P, '00:00', 0, 0, 0, 50, 1000, prevPE)],
    currDataCE: [c(P, '15:25', 1, 1, 1, 1, 1, 1), c(D, '09:15', 50, 52, 49, 51, 400000, oiCE - 100000), c(D, '09:20', 51, 53, 50, 52, 100000, oiCE)],
    currDataPE: [c(D, '09:15', 50, 52, 49, 49, 200000, oiPE - 100000), c(D, '09:20', 49, 50, 47, 48, 300000, oiPE)],
    CE: { strike, type: 'CE' as const, token: 1, expiry: '24-11-2026', symbol: `C${strike}` },
    PE: { strike, type: 'PE' as const, token: 2, expiry: '24-11-2026', symbol: `P${strike}` },
  });
  it('computes OI, change in OI, OBV, volumes, PCR and drops a strike it cannot compute', () => {
    const strikeData = [{ STRIKE: 24000, ATM_STRIKE: '' as const }, { STRIKE: 24050, ATM_STRIKE: true as const }, { STRIKE: 24100, ATM_STRIKE: '' as const }];
    const fetched = { '24000': mk(24000, 2000000, 1000000, 3000000, 2000000), '24050': mk(24050, 4000000, 3000000, 1000000, 500000), '24100': { ...mk(24100, 1, 1, 1, 1), currDataCE: [], prevDataCE: [] } };
    const ch = buildChain({ strikeData, fetched, spotCandles: [], expiryDDMMYYYY: null, day: D, asOf: null, intervalStr: '5minute', nowMs: Date.parse(`${D}T10:00:00+05:30`) });
    expect(ch.tableData.map((r) => r.STRIKE)).toEqual(['24000', '24050']); // 24100 had no candles at all: dropped
    const r = ch.tableData[0]!;
    expect(r).toMatchObject({ OI_CE: '20.0', CHG_OI_CE: '10.0', OI_PE: '30.0', CHG_OI_PE: '10.0', VOL_CE: '5.0', VOL_PE: '5.0', PREV_VOL_CE: '0.0', ATM_STRIKE: '' });
    expect(r.CE_OBV.map((x) => x.obv)).toEqual(['4.0', '5.0']); // prev close 50: 51 up (+4.0 lakh), 52 up (+1.0)
    expect(r.PE_OBV.map((x) => x.obv)).toEqual(['-2.0', '-5.0']);
    expect(ch.tableData[1]?.ATM_STRIKE).toBe(true);
    expect(ch.pcr).toBe('0.67'); // PE 4,000,000 / CE 6,000,000
    expect(ch.chPcr).toBe('0.75'); // dPE 1,500,000 / dCE 2,000,000
    expect(ch.totalVolCE).toBe(10);
    expect(ch.ivSkew).toBeNull();
    expect(ch.oiConcentration).toBe(100); // two rows, both within ATM +- 1
  });
  it('trims to the snapshot time and falls back to the previous day when today has no candles', () => {
    const strikeData = [{ STRIKE: 24050, ATM_STRIKE: true as const }];
    const base = mk(24050, 4000000, 3000000, 1000000, 500000);
    const early = buildChain({ strikeData, fetched: { '24050': base }, spotCandles: [], expiryDDMMYYYY: null, day: D, asOf: '09:15', intervalStr: '5minute', nowMs: Date.parse(`${D}T10:00:00+05:30`) });
    expect(early.tableData[0]?.currDataCE).toHaveLength(1); // only 09:15
    expect(early.tableData[0]?.OI_CE).toBe('39.0'); // OI of the 09:15 candle (4,000,000 - 100,000)
    const none = buildChain({ strikeData, fetched: { '24050': { ...base, currDataCE: [], currDataPE: [] } }, spotCandles: [], expiryDDMMYYYY: null, day: D, asOf: null, intervalStr: '5minute', nowMs: 0 });
    expect(none.tableData[0]?.OI_CE).toBe('30.0'); // previous day's OI is used
    expect(none.tableData[0]?.CHG_OI_CE).toBe('0.0');
  });
});

describe('option chain service', () => {
  const CSV = [
    'instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange',
    ...[24000, 24050, 24100, 24150, 23950, 23900, 24200].flatMap((s) => [
      `${s},1,NIFTY26N24${s}CE,"NIFTY",0,2026-11-24,${s},0.05,75,CE,NFO-OPT,NFO`.replace(/^\d+/, String(s * 10 + 1)),
      `${s},1,NIFTY26N24${s}PE,"NIFTY",0,2026-11-24,${s},0.05,75,PE,NFO-OPT,NFO`.replace(/^\d+/, String(s * 10 + 2)),
    ]),
    `${24000 * 10 + 1 - 1},1,NIFTY26DEC24000CE,"NIFTY",0,2026-12-01,24000,0.05,75,CE,NFO-OPT,NFO`.replace(/^\d+/, '777'),
  ].join('\n');
  it('picks the nearest expiry, anchors on the last spot close, and reads four series per strike', async () => {
    const book = new InstrumentBook(parseInstrumentsCsv(CSV), D);
    const calls: string[] = [];
    const history = {
      candles: async (q: { token: number; interval: string; from: string; to: string; oi?: boolean }) => {
        calls.push(`${q.token}:${q.interval}`);
        if (q.token === 256265) return [c(D, '09:15', 24020, 24060, 24010, 24040, 0), c(D, '09:20', 24040, 24070, 24030, 24044, 0)];
        if (q.interval === 'day') return [c(P, '00:00', 50, 50, 50, 50, 10, 1000000)];
        return [c(D, '09:15', 50, 52, 49, 51, 200000, 1500000), c(D, '09:20', 51, 53, 50, 52, 100000, 1600000)];
      },
    };
    const svc = new OptionChainService({ history, book: () => book, tokens: () => ({ 'NIFTY 50': 256265 }), now: () => Date.parse(`${D}T11:00:00+05:30`) });
    const r = await svc.load({ name: 'NIFTY 50', day: D });
    expect(r.expiry).toBe('2026-11-24');
    expect(r.anchorPrice).toBe(24044);
    expect(r.atmStrike).toBe(24050);
    expect(r.chain.tableData.map((x) => x.STRIKE)).toEqual(['23900', '23950', '24000', '24050', '24100', '24150', '24200']);
    expect(r.chain.tableData.find((x) => x.ATM_STRIKE === true)?.STRIKE).toBe('24050');
    expect(calls.filter((x) => x.endsWith(':day'))).toHaveLength(14); // 7 strikes x CE + PE
    expect(r.chain.tableData[0]).toMatchObject({ OI_CE: '16.0', CHG_OI_CE: '6.0' });
    expect(r.prevDay).toBe('2026-11-19');
    const open = await svc.load({ name: 'NIFTY 50', day: D, anchor: 'open', strikesToShow: 1 });
    expect(open.anchorPrice).toBe(24020);
    expect(open.atmStrike).toBe(24050);
    expect(open.chain.tableData).toHaveLength(7); // for the indices the strike count is always 3 each side (the userscript ignores an override)
    await expect(svc.load({ name: 'NOSUCH', day: D })).rejects.toThrow(/No option contracts/);
  });
});
