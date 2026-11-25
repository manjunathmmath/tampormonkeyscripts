/**
 * Option chain OI / OBV / IV computation. Faithful port of oiAnalyzer.js: `showTrendingOI` (strike selection), `showOITrendingDetails`
 * (per-strike series and chain summary), `calculateOBVFiveMinutesInterval`, `calculateIVSeries`, `calcIV`, `_bsPrice`, `_normCDF`.
 * Pure functions: the data (candles, rows) is passed in; nothing here fetches or reads a clock except the `nowMs` argument.
 * Values keep the userscript's types on purpose (STRIKE is a string key, OI / OBV figures are strings from toFixed).
 */
import type { Candle } from '../kite/client.js';
import { dropFormingCandle, trimCandles } from '../marketdata/history.js';

export const OI_DIVISOR = 100000;
const IST = '+05:30';

// ───────────────────────── Black-Scholes IV ─────────────────────────

/** Standard normal CDF (Abramowitz & Stegun polynomial, error < 1.5e-7). */
export function normCDF(x0: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x0 < 0 ? -1 : 1;
  const x = Math.abs(x0) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

/** Black-Scholes theoretical price. S spot, K strike, T years, r rate, sigma IV (decimal). */
export function bsPrice(S: number, K: number, T: number, r: number, sigma: number, isCall: boolean): number {
  if (T <= 0 || sigma <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  if (isCall) return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
  return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
}

/** Bisection IV solver (0.1% to 500%, 100 iterations). null when the inputs are invalid or the price is below intrinsic. */
export function calcIV(price: number, S: number, K: number, T: number, r: number, isCall: boolean): number | null {
  if (!price || price <= 0 || !S || S <= 0 || T <= 0) return null;
  const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
  if (price < intrinsic) return null;
  let lo = 0.001;
  let hi = 5.0;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const diff = bsPrice(S, K, T, r, mid, isCall) - price;
    if (Math.abs(diff) < 0.001) return mid;
    if (diff > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export interface IvPoint {
  date: string;
  iv: number | null;
}

/** "DD-MM-YYYY" expiry -> the end of that day in IST, in epoch ms. */
export function expiryEndMs(expiryDDMMYYYY: string): number {
  const [d, m, y] = expiryDDMMYYYY.split('-');
  return Date.parse(`${y}-${m}-${d}T23:59:59.999${IST}`);
}

/** `calculateIVSeries`: one IV (in %) per option candle, using the spot close at the same timestamp (carried forward when missing). */
export function calculateIVSeries(optionCandles: Candle[], strike: number | string, isCall: boolean, expiryDDMMYYYY: string, spotCandles: Candle[]): IvPoint[] {
  const RISK_FREE = 0.065;
  const expiryMs = expiryEndMs(expiryDDMMYYYY);
  const spotMap: Record<string, number> = {};
  for (const c of spotCandles) spotMap[c[0]] = c[4];
  let lastValidSpot = 0;
  const out: IvPoint[] = [];
  for (const c of optionCandles) {
    const candleTime = new Date(c[0]).getTime();
    const T = Math.max((expiryMs - candleTime) / (365 * 24 * 3600 * 1000), 1 / (365 * 24));
    const optionLTP = c[4];
    const spot = spotMap[c[0]] || lastValidSpot;
    if (spot > 0) lastValidSpot = spot;
    const iv = spot > 0 ? calcIV(optionLTP, spot, parseFloat(String(strike)), T, RISK_FREE, isCall) : null;
    out.push({ date: c[0], iv: iv !== null ? parseFloat((iv * 100).toFixed(2)) : null });
  }
  return out;
}

export interface ObvPoint {
  date: string;
  obv: string;
}

/** `calculateOBVFiveMinutesInterval`: OBV from the previous (daily) candle's close, in units of OI_DIVISOR, as strings with one decimal. */
export function calculateOBV(prevData: Candle[], currData: Candle[], divisor: number = OI_DIVISOR): ObvPoint[] {
  let prevLast = prevData[prevData.length - 1];
  if (!prevLast) throw new TypeError('no previous candle for OBV');
  let OBV = 0;
  const out: ObvPoint[] = [];
  for (const item of currData) {
    if (item[4] > prevLast[4]) OBV = OBV + item[5];
    if (item[4] < prevLast[4]) OBV = OBV - item[5];
    prevLast = item;
    out.push({ date: item[0], obv: parseFloat(String(OBV / divisor)).toFixed(1) });
  }
  return out;
}

// ───────────────────────── strike selection (showTrendingOI) ─────────────────────────

/** Display name -> underlying code and how many strikes each side to analyse (3 for the indices, 2 otherwise). */
export function chainInstrument(display: string, override?: number): { instrument: string; strikesToShow: number } {
  let strikesToShow = override !== undefined ? override : 2;
  let instrument = display;
  if (display === 'NIFTY 50') (instrument = 'NIFTY'), (strikesToShow = 3);
  else if (display === 'NIFTY BANK') (instrument = 'BANKNIFTY'), (strikesToShow = 3);
  else if (display === 'NIFTY FIN SERVICE') (instrument = 'FINNIFTY'), (strikesToShow = 3);
  else if (display === 'NIFTY MID SELECT') (instrument = 'MIDCPNIFTY'), (strikesToShow = 3);
  else if (display === 'SENSEX') strikesToShow = 3;
  return { instrument, strikesToShow };
}

/** One option contract of the chosen expiry. `expiry` is DD-MM-YYYY like the userscript's lists. */
export interface OptionRow {
  strike: number;
  type: 'CE' | 'PE';
  token: number;
  expiry: string;
  symbol: string;
}

export interface StrikeEntry {
  STRIKE: number;
  ATM_STRIKE: boolean | '';
}

/**
 * `showTrendingOI` strike picking: ATM = first listed strike at or above `price`; `strikesToShow` further strikes above and below it.
 * `rows` must already be filtered to the one resolved expiry. Result is sorted by strike. ATM_STRIKE 0 means no strike was at or above the price.
 */
export function selectStrikes(price: number, rows: OptionRow[], strikesToShow: number): { strikeData: StrikeEntry[]; atmStrike: number } {
  const sorted = [...rows].sort((a, b) => a.strike - b.strike);
  let atmStrike = 0;
  const upper: number[] = [];
  const lower: number[] = [];
  for (const item of sorted) {
    const strike = item.strike;
    if (strike >= price && !atmStrike) atmStrike = strike;
    if (strike >= price) {
      if (!upper.includes(strike)) upper.push(strike);
    } else if (!lower.includes(strike)) lower.push(strike);
  }
  const strikeData: StrikeEntry[] = [];
  for (let i = 1; i <= strikesToShow; i++) if (upper[i]) strikeData.push({ STRIKE: upper[i]!, ATM_STRIKE: '' });
  strikeData.push({ STRIKE: atmStrike, ATM_STRIKE: true });
  for (let i = 1; i <= strikesToShow; i++) if (lower[lower.length - i]) strikeData.push({ STRIKE: lower[lower.length - i]!, ATM_STRIKE: '' });
  strikeData.sort((a, b) => a.STRIKE - b.STRIKE);
  return { strikeData, atmStrike };
}

/** `_dlNearestLiveExpiry` / `_dlResolveExpiryFor`: the configured expiry if it is one of the real ones, else the first not before `today`, else the first. ISO dates. */
export function resolveExpiry(configured: string, availableISO: string[], today: string): string | undefined {
  const sorted = [...availableISO].sort();
  if (configured && sorted.includes(configured)) return configured;
  for (const e of sorted) if (e >= today) return e;
  return sorted[0];
}

// ───────────────────────── chain table (showOITrendingDetails) ─────────────────────────

export interface FetchedStrike {
  /** previous trading day's daily candle(s) of the CE / PE (OI baseline, OBV baseline) */
  prevDataCE: Candle[];
  prevDataPE: Candle[];
  /** current-day (and previous day) intraday candles as fetched, before trimming */
  currDataCE: Candle[];
  currDataPE: Candle[];
  CE?: OptionRow;
  PE?: OptionRow;
}

export interface ChainRow {
  OI_CE: string;
  CHG_OI_CE: string;
  STRIKE: string;
  OI_PE: string;
  CHG_OI_PE: string;
  ATM_STRIKE: boolean | '';
  CE: OptionRow | undefined;
  PE: OptionRow | undefined;
  currDataCE: Candle[];
  currDataPE: Candle[];
  prevDataCE: Candle[];
  prevDataPE: Candle[];
  CE_OBV: ObvPoint[];
  PE_OBV: ObvPoint[];
  VOL_CE: string;
  VOL_PE: string;
  PREV_VOL_CE: string;
  PREV_VOL_PE: string;
  CE_IV: IvPoint[];
  PE_IV: IvPoint[];
}

export interface Chain {
  tableData: ChainRow[];
  pcr: string;
  chPcr: string;
  totalVolCE: number;
  totalVolPE: number;
  prevVolCE: number;
  prevVolPE: number;
  ivSkew: number | null;
  atmIV: number | null;
  oiConcentration: number | null;
  spotCandles: Candle[];
}

export interface ChainInput {
  strikeData: StrikeEntry[];
  fetched: Record<string, FetchedStrike>;
  /** today's spot candles, already trimmed (shared by all strikes for IV) */
  spotCandles: Candle[];
  expiryDDMMYYYY: string | null;
  /** the trading day shown (YYYY-MM-DD): candles of earlier days are stripped from the current-day series */
  day: string;
  /** snapshot end time "HH:mm" or null */
  asOf: string | null;
  intervalStr: string;
  nowMs: number;
  /** units open interest is shown in: 100000 for NSE (the default), 1000 for MCX (`OI_DIVISOR` is set to 1000 by showTrendingOIMCX) */
  oiDivisor?: number;
}

const f1 = (n: number): string => parseFloat(String(n)).toFixed(1);

export function buildChain(inp: ChainInput): Chain {
  const { fetched, spotCandles, expiryDDMMYYYY } = inp;
  const DIV = inp.oiDivisor ?? OI_DIVISOR;
  const tableData: ChainRow[] = [];
  let totalCEOI = 0;
  let totalPEOI = 0;
  let chCEOI = 0;
  let chPEOI = 0;

  for (const key of Object.keys(fetched)) {
    const item = fetched[key]!;
    try {
      const currDataCE = trimCandles(item.currDataCE, inp.day, inp.asOf);
      const currDataPE = trimCandles(item.currDataPE, inp.day, inp.asOf);
      const prevDataCE = item.prevDataCE;
      const prevDataPE = item.prevDataPE;
      const oiCE = currDataCE.length ? currDataCE : prevDataCE;
      const oiPE = currDataPE.length ? currDataPE : prevDataPE;

      const OI_CE = oiCE[oiCE.length - 1]![6] as number;
      const OI_PE = oiPE[oiPE.length - 1]![6] as number;
      totalCEOI = totalCEOI + OI_CE;
      totalPEOI = totalPEOI + OI_PE;
      const PREV_OI_CE = prevDataCE[prevDataCE.length - 1]![6] as number;
      const PREV_OI_PE = prevDataPE[prevDataPE.length - 1]![6] as number;

      const atm = inp.strikeData.find((s) => String(s.STRIKE) === key)?.ATM_STRIKE ?? '';
      chCEOI = chCEOI + (OI_CE - PREV_OI_CE);
      chPEOI = chPEOI + (OI_PE - PREV_OI_PE);

      const obvIvCE = dropFormingCandle(oiCE, inp.intervalStr, inp.nowMs);
      const obvIvPE = dropFormingCandle(oiPE, inp.intervalStr, inp.nowMs);
      const sum = (a: Candle[]): number => a.reduce((s, c) => s + (c[5] || 0), 0);

      const row: ChainRow = {
        OI_CE: f1(OI_CE / DIV),
        CHG_OI_CE: f1((OI_CE - PREV_OI_CE) / DIV),
        STRIKE: key,
        OI_PE: f1(OI_PE / DIV),
        CHG_OI_PE: f1((OI_PE - PREV_OI_PE) / DIV),
        ATM_STRIKE: atm,
        CE: item.CE,
        PE: item.PE,
        currDataCE,
        currDataPE,
        prevDataCE,
        prevDataPE,
        CE_OBV: calculateOBV(prevDataCE, obvIvCE, DIV),
        PE_OBV: calculateOBV(prevDataPE, obvIvPE, DIV),
        VOL_CE: f1(sum(oiCE) / DIV),
        VOL_PE: f1(sum(oiPE) / DIV),
        PREV_VOL_CE: f1(sum(prevDataCE) / DIV),
        PREV_VOL_PE: f1(sum(prevDataPE) / DIV),
        CE_IV: [],
        PE_IV: [],
      };
      if (expiryDDMMYYYY && spotCandles.length) {
        row.CE_IV = calculateIVSeries(obvIvCE, key, true, expiryDDMMYYYY, spotCandles);
        row.PE_IV = calculateIVSeries(obvIvPE, key, false, expiryDDMMYYYY, spotCandles);
      }
      tableData.push(row);
    } catch {
      /* the userscript logs and drops a strike it cannot compute */
    }
  }

  const pcr = parseFloat(String(totalPEOI / totalCEOI)).toFixed(2);
  const chPcr = parseFloat(String(chPEOI / chCEOI)).toFixed(2);
  tableData.sort((a, b) => parseFloat(a.STRIKE) - parseFloat(b.STRIKE));

  let totalVolCE = 0, totalVolPE = 0, prevVolCE = 0, prevVolPE = 0;
  for (const r of tableData) {
    totalVolCE += parseFloat(r.VOL_CE) || 0;
    totalVolPE += parseFloat(r.VOL_PE) || 0;
    prevVolCE += parseFloat(r.PREV_VOL_CE) || 0;
    prevVolPE += parseFloat(r.PREV_VOL_PE) || 0;
  }

  // IV skew: PE OTM IV (ATM-2) minus CE OTM IV (ATM+2), in %
  let ivSkew: number | null = null;
  let atmIdx = tableData.findIndex((r) => Boolean(r.ATM_STRIKE));
  if (atmIdx < 0) atmIdx = Math.floor(tableData.length / 2);
  const peOTM = tableData[atmIdx - 2];
  const ceOTM = tableData[atmIdx + 2];
  if (peOTM && ceOTM) {
    const peIVLast = peOTM.PE_IV.length ? peOTM.PE_IV[peOTM.PE_IV.length - 1]!.iv : null;
    const ceIVLast = ceOTM.CE_IV.length ? ceOTM.CE_IV[ceOTM.CE_IV.length - 1]!.iv : null;
    if (peIVLast !== null && ceIVLast !== null) ivSkew = parseFloat((peIVLast - ceIVLast).toFixed(2));
  }
  let atmIV: number | null = null;
  const atmRow = tableData[atmIdx];
  if (atmRow) {
    const ceAtm = atmRow.CE_IV.length ? atmRow.CE_IV[atmRow.CE_IV.length - 1]!.iv : null;
    const peAtm = atmRow.PE_IV.length ? atmRow.PE_IV[atmRow.PE_IV.length - 1]!.iv : null;
    if (ceAtm !== null && peAtm !== null) atmIV = parseFloat(((ceAtm + peAtm) / 2).toFixed(2));
  }

  // OI concentration: share of OI sitting at ATM +- 1
  let totalOI = 0;
  let centralOI = 0;
  tableData.forEach((r, i) => {
    const oi = (parseFloat(r.OI_CE) || 0) + (parseFloat(r.OI_PE) || 0);
    totalOI += oi;
    if (Math.abs(i - atmIdx) <= 1) centralOI += oi;
  });
  const oiConcentration = totalOI > 0 ? parseFloat(((centralOI / totalOI) * 100).toFixed(1)) : null;

  return {
    tableData,
    pcr,
    chPcr,
    totalVolCE: parseFloat(totalVolCE.toFixed(1)),
    totalVolPE: parseFloat(totalVolPE.toFixed(1)),
    prevVolCE: parseFloat(prevVolCE.toFixed(1)),
    prevVolPE: parseFloat(prevVolPE.toFixed(1)),
    ivSkew,
    atmIV,
    oiConcentration,
    spotCandles,
  };
}
