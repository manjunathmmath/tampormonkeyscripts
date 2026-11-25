/**
 * Futures signals and the REMARK. Faithful port of grootTradeBot.js: `computeIntradayVwap`, `computeFuturesSignals`, `_gtbRemarkFromSignals`,
 * `_gtbClassifyFutures` and `getFuturesTrendScore`. Pure functions; values keep the userscript's types (OI changes are strings from toFixed).
 * Includes the v29.414 / v29.473 behaviour: intraday OI change decides when the day's OI is known, and an unclear read is NO_CLEAR_SIGNAL (score 0).
 */

export interface FutCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi: number | undefined;
}

/** A day (or day-so-far) candle: the daily summary the classifier reads. */
export interface FutQuote {
  high: number;
  low: number;
  close: number;
  volume: number;
  oi: number | undefined;
}

/** `computeIntradayVwap`: sum(typical price x volume) / sum(volume) over the candles, rounded to 2 decimals; 0 without volume. */
export function computeIntradayVwap(candles: FutCandle[]): number {
  if (!candles || candles.length === 0) return 0;
  let sumTP = 0;
  let sumVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    const vol = c.volume || 0;
    sumTP += tp * vol;
    sumVol += vol;
  }
  return sumVol > 0 ? parseFloat((sumTP / sumVol).toFixed(2)) : 0;
}

export interface SignalOpts {
  vix?: number;
  baselineVix?: number;
  dayOpenOI?: number | null;
  currOI?: number;
  premium?: number | null;
  prevPremium?: number | null;
}

export interface FuturesSignals {
  price: '+' | '-' | '+-';
  oi: '+' | '-' | '+-';
  shortCoveringOrLongUnwinding: boolean;
  aboveVwap: boolean;
  recentBullish: boolean;
  recentBearish: boolean;
  volScale: number;
  intradayOiPct: number | null;
  premiumTrend: number;
  upCandles: number;
  downCandles: number;
  effOiPct: number;
  nCandles: number;
}

/** `computeFuturesSignals`: the price signal (VWAP + last-5-candle trend with volume) and the OI signal (today's OI change when known). */
export function computeFuturesSignals(
  intradayCandles: FutCandle[],
  vwap: number | string,
  lastPrice: number | string,
  pChange: number,
  changeinOpenInterest: number | string,
  pchangeinOpenInterest: number | string,
  opts: SignalOpts = {},
): FuturesSignals {
  let volScale = 1;
  if (opts.vix && opts.baselineVix && opts.baselineVix > 0) volScale = Math.max(0.6, Math.min(2.5, opts.vix / opts.baselineVix));
  const oiThresh = 0.5 * volScale;
  const oiUnwind = 1.0 * volScale;
  const priceThresh = 0.1 * volScale;

  const last5 = intradayCandles && intradayCandles.length >= 2 ? intradayCandles.slice(-5) : [];
  let upCandles = 0;
  let downCandles = 0;
  let upVol = 0;
  let downVol = 0;
  for (let ci = 1; ci < last5.length; ci++) {
    const cc = last5[ci]!.close;
    const pp = last5[ci - 1]!.close;
    const vv = last5[ci]!.volume || 0;
    if (cc > pp) {
      upCandles++;
      upVol += vv;
    } else if (cc < pp) {
      downCandles++;
      downVol += vv;
    }
  }
  const recentBullish = upCandles >= 3 && upVol >= downVol;
  const recentBearish = downCandles >= 3 && downVol >= upVol;
  const aboveVwap = parseFloat(String(lastPrice)) >= parseFloat(String(vwap));

  let price: FuturesSignals['price'];
  if (aboveVwap && recentBullish) price = '+';
  else if (aboveVwap && pChange > priceThresh && !recentBearish) price = '+';
  else if (!aboveVwap && recentBearish) price = '-';
  else if (!aboveVwap && pChange < -priceThresh && !recentBullish) price = '-';
  else if (aboveVwap && recentBearish) price = '+-';
  else if (!aboveVwap && recentBullish) price = '+-';
  else price = '+-';

  const oiPct = parseFloat(String(pchangeinOpenInterest));
  const oiAbs = parseFloat(String(changeinOpenInterest));
  let intradayOiPct: number | null = null;
  if (opts.dayOpenOI && opts.currOI && opts.dayOpenOI > 0) intradayOiPct = ((opts.currOI - opts.dayOpenOI) / opts.dayOpenOI) * 100;
  let effOiPct = oiPct;
  if (intradayOiPct !== null) effOiPct = intradayOiPct;

  let oi: FuturesSignals['oi'];
  if (effOiPct >= oiThresh) oi = '+';
  else if (effOiPct <= -oiThresh) oi = '-';
  else oi = '+-';

  const shortCoveringOrLongUnwinding = intradayOiPct !== null ? intradayOiPct < -oiUnwind : oiAbs < 0 && Math.abs(oiPct) > oiUnwind;

  let premiumTrend = 0;
  if (opts.premium != null && opts.prevPremium != null) premiumTrend = opts.premium > opts.prevPremium ? 1 : opts.premium < opts.prevPremium ? -1 : 0;

  return {
    price,
    oi,
    shortCoveringOrLongUnwinding,
    aboveVwap,
    recentBullish,
    recentBearish,
    volScale,
    intradayOiPct,
    premiumTrend,
    upCandles,
    downCandles,
    effOiPct,
    nCandles: Math.max(last5.length - 1, 0),
  };
}

export type Remark =
  | 'LONG'
  | 'SHORT'
  | 'SHOT_COVERING'
  | 'LONG_UNWINDING'
  | 'BEARS_COMING_SELL_ON_RISE'
  | 'GAMBLING_BUY_NEWS_AND_EVENTS'
  | 'CAUTION_WRITES_ERODING_PREMIUM'
  | 'BULLS_CONSOLIDATING'
  | 'BEARS_CONSOLIDATING'
  | 'NO_CLEAR_SIGNAL'
  | 'DEFENCE_BUY_ON_DECLINE';

/** `_gtbRemarkFromSignals`: the price / OI combination to a named remark. Anything unclear is NO_CLEAR_SIGNAL. */
export function remarkFromSignals(s: Pick<FuturesSignals, 'price' | 'oi' | 'shortCoveringOrLongUnwinding' | 'aboveVwap'>, pChangeOIpct: number): Remark {
  const { price, oi, shortCoveringOrLongUnwinding: sc, aboveVwap: av } = s;
  if (price === '+' && oi === '+') return 'LONG';
  if (price === '-' && oi === '+') return 'SHORT';
  if (price === '+' && oi === '-' && sc) return 'SHOT_COVERING';
  if (price === '-' && oi === '-' && sc) return 'LONG_UNWINDING';
  if (price === '-' && oi === '-' && !sc) return 'BEARS_COMING_SELL_ON_RISE';
  if (price === '+-' && oi === '+' && !sc && av && pChangeOIpct >= 10) return 'GAMBLING_BUY_NEWS_AND_EVENTS';
  if (price === '+-' && oi === '+' && !sc && av && pChangeOIpct < 10) return 'CAUTION_WRITES_ERODING_PREMIUM';
  if (price === '+' && oi === '+-') return 'BULLS_CONSOLIDATING';
  if (price === '-' && oi === '+-') return 'BEARS_CONSOLIDATING';
  return 'NO_CLEAR_SIGNAL';
}

/**
 * `getFuturesTrendScore`: +1 / -1 / 0. NOTE the names: SHOT_COVERING is bullish (shorts exiting) and LONG_UNWINDING is bearish (longs exiting).
 * DEFENCE_BUY_ON_DECLINE is no longer produced but still scores +1 when an old value carries it.
 */
export function futuresTrendScore(remark: string): 1 | 0 | -1 {
  if (['LONG', 'SHOT_COVERING', 'BULLS_CONSOLIDATING', 'GAMBLING_BUY_NEWS_AND_EVENTS', 'DEFENCE_BUY_ON_DECLINE'].includes(remark)) return 1;
  if (['SHORT', 'LONG_UNWINDING', 'BEARS_COMING_SELL_ON_RISE', 'BEARS_CONSOLIDATING', 'CAUTION_WRITES_ERODING_PREMIUM'].includes(remark)) return -1;
  return 0;
}

export interface Classified {
  remark: Remark;
  dir: 1 | 0 | -1;
  signals: FuturesSignals;
  vwap: number;
  pChange: number;
}

/**
 * `_gtbClassifyFutures`: the day-so-far candle (`quote`), the previous day's candle, the lot size and the intraday candles to a remark.
 * VWAP is the intraday VWAP when there are at least two candles, else a two-day typical-price blend.
 */
export function classifyFutures(quote: FutQuote, prevQuote: FutQuote, lotSize: number, intradayCandles: FutCandle[], opts: { vix?: number; baselineVix?: number } = {}): Classified {
  let vwap: number;
  if (intradayCandles && intradayCandles.length > 1) vwap = computeIntradayVwap(intradayCandles);
  else {
    const pTP = (prevQuote.high + prevQuote.low + prevQuote.close) / 3;
    const cTP = (quote.high + quote.low + quote.close) / 3;
    const dv = quote.volume + prevQuote.volume;
    vwap = dv > 0 ? (cTP * quote.volume + pTP * prevQuote.volume) / dv : cTP;
  }
  const lastPrice = quote.close;
  const prevClose = prevQuote.close;
  const pChange = prevClose ? ((lastPrice - prevClose) / prevClose) * 100 : 0;
  const oiNow = (quote.oi ?? Number.NaN) / lotSize;
  const oiPrev = (prevQuote.oi ?? Number.NaN) / lotSize;
  const chgOI = (oiNow - oiPrev).toFixed(2);
  const pChgOI = oiPrev ? (((oiNow - oiPrev) / oiPrev) * 100).toFixed(2) : '0';
  const dayOpenOI = intradayCandles && intradayCandles.length && intradayCandles[0]!.oi ? (intradayCandles[0]!.oi as number) / lotSize : null;
  const signals = computeFuturesSignals(intradayCandles, vwap, lastPrice, pChange, chgOI, pChgOI, { vix: opts.vix, baselineVix: opts.baselineVix, dayOpenOI, currOI: oiNow });
  const remark = remarkFromSignals(signals, parseFloat(pChgOI));
  return { remark, dir: futuresTrendScore(remark), signals, vwap, pChange };
}

/**
 * The remark of ONE 5-minute futures candle against the previous day's daily candle, the way the Futures Trend scanner reads it (`showTableAiNiftyPrediction`
 * with no intraday candles): the VWAP is a two-point blend rounded to 2 decimals (the string "NaN" when there is no volume), and a missing OI base gives
 * "NaN" / "Infinity" percentages with no guard. Used for the market-wide futures counts; the per-instrument remark uses `classifyFutures`.
 */
export function remarkOfCandle(quote: { open: number; high: number; low: number; close: number; volume: number | string; oi: number | undefined }, prev: { high: number; low: number; close: number; volume: number | string; oi: number | undefined }, lotSize: number): Remark {
  const qVol = parseInt(String(quote.volume), 10);
  const vwapStr = ((((quote.high + quote.low + quote.close) / 3) * qVol + ((prev.high + prev.low + prev.close) / 3) * parseFloat(String(prev.volume))) / (qVol + parseInt(String(prev.volume), 10))).toFixed(2);
  const vwap = vwapStr ? vwapStr : 0;
  const lastPrice = quote.close;
  const previousClose = prev.close;
  const pChange = ((lastPrice - previousClose) / previousClose) * 100;
  const openInterest = (quote.oi as number) / lotSize;
  const previousOI = (prev.oi as number) / lotSize;
  const chg = (openInterest - previousOI).toFixed(2);
  const pchg = (((openInterest - previousOI) / previousOI) * 100).toFixed(2);
  const signals = computeFuturesSignals([], vwap, lastPrice, pChange, chg, pchg, { vix: undefined, baselineVix: undefined, dayOpenOI: null, currOI: openInterest });
  return remarkFromSignals(signals, Number(pchg));
}
