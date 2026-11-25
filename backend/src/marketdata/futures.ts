import type { Candle } from '../kite/client.js';
import type { InstrumentBook, Instrument } from '../instruments/book.js';
import { classifyFutures, computeIntradayVwap, type Classified, type FutCandle, type FutQuote } from '../engine/futures.js';
import { dropFormingCandle, previousDayFor, trimCandles } from './history.js';

export interface FuturesHistory {
  candles(q: { token: number; interval: '5minute' | 'day'; from: string; to: string; oi?: boolean; asOf?: string }): Promise<Candle[]>;
}

export interface FuturesDeps {
  history: FuturesHistory;
  book: () => InstrumentBook | undefined;
  tokens: () => Record<string, number>;
  holidays?: () => ReadonlySet<string>;
  now?: () => number;
}

export interface FuturesRequest {
  /** display name: "NIFTY 50", "NIFTY BANK", "SENSEX", "RELIANCE" ... */
  name: string;
  /** trading day, YYYY-MM-DD */
  day: string;
  /** snapshot end time "HH:mm" (replay cut) or undefined for live */
  asOf?: string;
}

export interface FuturesResult extends Classified {
  name: string;
  day: string;
  prevDay: string;
  token: number;
  symbol: string;
  expiry: string;
  lotSize: number;
  candles: number;
  vwapPrice: number;
  vix: number;
  quote: { open: number; high: number; low: number; close: number; volume: number; oi: number | undefined };
  prev: { close: number; oi: number | undefined; volume: number };
}

const UNDERLYING: Record<string, string> = { 'NIFTY 50': 'NIFTY', 'NIFTY BANK': 'BANKNIFTY', 'NIFTY FIN SERVICE': 'FINNIFTY', 'NIFTY MID SELECT': 'MIDCPNIFTY' };
const exchangeFor = (u: string): string => (u === 'SENSEX' || u === 'BANKEX' ? 'BFO' : 'NFO');

const toFut = (c: Candle): FutCandle => ({ date: String(c[0]).slice(11, 16), open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5], oi: c[6] });

let mcxExpiryPref: ((name: string) => string | undefined) | null = null;
/** the Settings expiry of a commodity's futures (blank = the nearest) */
export function setMcxFutureExpiryPref(f: ((name: string) => string | undefined) | null): void {
  mcxExpiryPref = f;
}

/** The futures contract the dashboard uses for a name: the soonest expiry that has not passed `day`. */
export function nearestFuture(book: InstrumentBook, name: string, day: string): Instrument | undefined {
  const u = UNDERLYING[name] ?? name;
  const mcx = book.futures('MCX', u);
  const list = mcx.length ? mcx : book.futures(exchangeFor(u), u);
  const pref = mcx.length ? mcxExpiryPref?.(u) : undefined;
  return (pref ? list.find((f) => f.expiry === pref) : undefined) ?? list.find((f) => f.expiry >= day) ?? list[0];
}

/**
 * Loads the futures of a name the way `showFutureDetails` does: previous day's daily candle and today's 5-minute candles (trimmed to the snapshot
 * time, forming candle dropped on a live read), then the remark. India VIX scales the thresholds (baseline 13), as in the userscript.
 */
export class FuturesService {
  private readonly now: () => number;
  constructor(private readonly d: FuturesDeps) {
    this.now = d.now ?? Date.now;
  }

  async load(req: FuturesRequest): Promise<FuturesResult> {
    const book = this.d.book();
    if (!book) throw new Error('Instruments are not loaded yet');
    const fut = nearestFuture(book, req.name, req.day);
    if (!fut) throw new Error(`No futures contract for ${req.name}`);
    const prevDay = previousDayFor(req.name, req.day, this.d.holidays?.() ?? new Set());

    const [prevRaw, curRaw] = await Promise.all([
      this.d.history.candles({ token: fut.token, interval: 'day', from: prevDay, to: prevDay, oi: true }),
      this.d.history.candles({ token: fut.token, interval: '5minute', from: req.day, to: req.day, oi: true, asOf: req.asOf }),
    ]);
    let cur = trimCandles(curRaw, req.day, req.asOf ?? null);
    // live: the forming candle keeps changing tick by tick, so it is left out (a replay cut keeps the open-only candle, as the userscript's replay does)
    const mcx = book.futures('MCX', req.name).length > 0;
    // a commodity keeps the forming candle (showFutureDetailsMCX does; the 5-minute squeeze scan is what drops it)
    if (!req.asOf && !mcx) cur = dropFormingCandle(cur, '5minute', this.now());
    if (!cur.length) throw new Error(`No futures candles for ${req.name} on ${req.day}`);
    if (!prevRaw.length) throw new Error(`No previous-day candle for ${req.name} on ${prevDay}`);

    const intraday = cur.map(toFut);
    const prevC = toFut(prevRaw[prevRaw.length - 1]!);
    const first = intraday[0]!;
    const last = intraday[intraday.length - 1]!;
    const quote = {
      open: first.open,
      high: Math.max(...intraday.map((c) => c.high)),
      low: Math.min(...intraday.map((c) => c.low)),
      close: last.close,
      volume: intraday.reduce((s, c) => s + c.volume, 0),
      oi: last.oi,
    };

    // a commodity passes no volatility scaling (showFutureDetailsMCX: thresholds stay at their baseline)
    const vix = mcx ? 0 : await this.vix(req);
    const res = classifyFutures(quote, prevC, fut.lotSize, intraday, mcx ? {} : { vix, baselineVix: 13 });
    return {
      ...res,
      name: req.name,
      day: req.day,
      prevDay,
      token: fut.token,
      symbol: fut.symbol,
      expiry: fut.expiry,
      lotSize: fut.lotSize,
      candles: intraday.length,
      vwapPrice: intraday.length > 1 ? computeIntradayVwap(intraday) : res.vwap,
      vix,
      quote,
      prev: { close: prevC.close, oi: prevC.oi, volume: prevC.volume },
    };
  }

  /** the day's candles, the previous-day candle and the lot size of the contract, for engines that replay the day candle by candle (the remark accuracy) */
  async series(req: FuturesRequest): Promise<{ intraday: FutCandle[]; prev: FutQuote; lot: number; vix: number }> {
    const book = this.d.book();
    if (!book) throw new Error('Instruments are not loaded yet');
    const f = nearestFuture(book, req.name, req.day);
    if (!f) throw new Error(`No futures contract for ${req.name}`);
    const prevDay = previousDayFor(req.name, req.day, this.d.holidays?.() ?? new Set());
    const [prevRaw, curRaw] = await Promise.all([
      this.d.history.candles({ token: f.token, interval: 'day', from: prevDay, to: prevDay, oi: true }),
      this.d.history.candles({ token: f.token, interval: '5minute', from: req.day, to: req.day, oi: true, asOf: req.asOf }),
    ]);
    let cur = trimCandles(curRaw, req.day, req.asOf ?? null);
    if (!req.asOf) cur = dropFormingCandle(cur, '5minute', this.now());
    const p = prevRaw[prevRaw.length - 1];
    if (!cur.length || !p) throw new Error(`No futures candles for ${req.name} on ${req.day}`);
    return { intraday: cur.map(toFut), prev: toFut(p), lot: f.lotSize, vix: await this.vix(req) };
  }

  private async vix(req: FuturesRequest): Promise<number> {
    const tok = this.d.tokens()['INDIA VIX'];
    if (!tok) return 0;
    try {
      const c = await this.d.history.candles({ token: tok, interval: '5minute', from: req.day, to: req.day, asOf: req.asOf });
      const t = trimCandles(c, req.day, req.asOf ?? null);
      return t.length ? t[t.length - 1]![4] : 0;
    } catch {
      return 0;
    }
  }
}
