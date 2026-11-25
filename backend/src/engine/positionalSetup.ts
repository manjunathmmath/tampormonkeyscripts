/**
 * Positional screener, overlay and plan: ports of positionalScreener.js `_psComputeSetup`, `_psComputeConviction` and `_psAttachTradePlan`.
 * The same-day overlay (trend, 20-day breakout, relative strength, futures OI build-up, curve) never flips the direction the primary read set;
 * conviction is a count of how many of the scanner's own checks line up, not a back-tested probability.
 */
import { longLevels, shortLevels, type DCandle, type PrimaryRead } from './positional.js';

export type CurveInfo = { ok: true; dir: number; state: string; annualizedPct: number } | { ok: false; reason: string } | null | undefined;

const closesOf = (c: DCandle[]): number[] => c.map((x) => x[4]);
const sma = (closes: number[], period: number): number | null => (closes.length < period ? null : closes.slice(closes.length - period).reduce((a, b) => a + b, 0) / period);

export interface Setup {
  ltp: number;
  pctChg20: number;
  sma20: number | null;
  sma50: number | null;
  high20: number;
  low20: number;
  trendScore: number;
  trendLabel: string;
  breakoutScore: number;
  breakoutLabel: string;
  relStrength: number;
  oiScore: number;
  oiLabel: string;
  curveScore: number;
  curveLabel: string;
  overlayTotal: number;
  overlayVerdict: string;
  total: number;
  primary: PrimaryRead | null;
  agree: boolean;
  disagree: boolean;
  verdict: string;
  entry?: number | null;
  target?: number | null;
  stop?: number | null;
  riskReward?: number | null;
  levelsSource?: string;
  exitCriteria?: string;
  extensionNote?: string;
  pctAboveSma50?: number | null;
  pctBelowSma50?: number | null;
  convictionPct?: number | null;
}

export function computeSetup(
  candles: DCandle[] | null | undefined,
  futCandles: DCandle[] | null | undefined,
  niftyPctChg20: number | null | undefined,
  futToken: number | null | undefined,
  daysToExpiry: number | null | undefined,
  curveInfo: CurveInfo,
  primary: PrimaryRead | null | undefined,
): Setup | null {
  if (!candles || candles.length < 25) return null;
  const closes = closesOf(candles);
  const ltp = closes[closes.length - 1]!;
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, Math.min(50, closes.length));
  let trendScore = 0;
  let trendLabel = 'SIDEWAYS';
  if (sma20 != null && sma50 != null) {
    if (ltp > sma20 && sma20 > sma50) {
      trendScore = 1;
      trendLabel = 'UPTREND';
    } else if (ltp < sma20 && sma20 < sma50) {
      trendScore = -1;
      trendLabel = 'DOWNTREND';
    }
  }
  const last20 = candles.slice(-21, -1);
  const high20 = Math.max(...last20.map((c) => c[2]));
  const low20 = Math.min(...last20.map((c) => c[3]));
  let breakoutScore = 0;
  let breakoutLabel = 'INSIDE RANGE';
  if (ltp >= high20) {
    breakoutScore = 1;
    breakoutLabel = 'BREAKOUT (20d high)';
  } else if (ltp <= low20) {
    breakoutScore = -1;
    breakoutLabel = 'BREAKDOWN (20d low)';
  }
  const pctChg20 = closes.length > 20 ? ((ltp - closes[closes.length - 21]!) / closes[closes.length - 21]!) * 100 : 0;
  const relStrength = pctChg20 - (niftyPctChg20 || 0);
  const rsScore = relStrength > 2 ? 1 : relStrength < -2 ? -1 : 0;

  const ROLLOVER_WINDOW_DAYS = 3;
  const inRollover = daysToExpiry != null && daysToExpiry >= 0 && daysToExpiry <= ROLLOVER_WINDOW_DAYS;
  let oiScore = 0;
  let oiLabel: string;
  if (!futToken) oiLabel = 'NO FUT TOKEN';
  else if (inRollover) oiLabel = `ROLLOVER (${daysToExpiry}d to expiry)`;
  else if (!futCandles || !futCandles.length) oiLabel = 'FETCH EMPTY';
  else if (futCandles.length < 6) oiLabel = `TOO FEW CANDLES (${futCandles.length})`;
  else oiLabel = 'NO DATA';
  if (!inRollover && futCandles && futCandles.length >= 6) {
    const oiNow = Number(futCandles[futCandles.length - 1]![6]) || 0;
    const oiPrev = Number(futCandles[futCandles.length - 6]![6]) || 0;
    const priceNow = futCandles[futCandles.length - 1]![4];
    const pricePrev = futCandles[futCandles.length - 6]![4];
    const oiUp = oiNow > oiPrev * 1.02;
    const oiDown = oiNow < oiPrev * 0.98;
    const priceUp = priceNow > pricePrev;
    const priceDown = priceNow < pricePrev;
    if (oiUp && priceUp) {
      oiScore = 1;
      oiLabel = 'LONG BUILDUP';
    } else if (oiUp && priceDown) {
      oiScore = -1;
      oiLabel = 'SHORT BUILDUP';
    } else if (oiDown && priceUp) {
      oiScore = 0.5;
      oiLabel = 'SHORT COVERING';
    } else if (oiDown && priceDown) {
      oiScore = -0.5;
      oiLabel = 'LONG UNWINDING';
    } else oiLabel = 'FLAT OI';
  }
  let curveScore = 0;
  let curveLabel = 'NO DATA';
  if (curveInfo) {
    if (!curveInfo.ok) curveLabel = curveInfo.reason;
    else {
      curveScore = curveInfo.dir;
      curveLabel = `${curveInfo.state} (${curveInfo.annualizedPct >= 0 ? '+' : ''}${curveInfo.annualizedPct.toFixed(1)}%/yr)`;
    }
  }
  const overlayTotal = trendScore * 2 + breakoutScore * 1.5 + rsScore * 1 + oiScore * 1.5 + curveScore * 1;
  let overlayVerdict = 'NEUTRAL';
  if (overlayTotal >= 3) overlayVerdict = 'STRONGLY BULLISH';
  else if (overlayTotal >= 1.5) overlayVerdict = 'BULLISH';
  else if (overlayTotal <= -3) overlayVerdict = 'STRONGLY BEARISH';
  else if (overlayTotal <= -1.5) overlayVerdict = 'BEARISH';

  const dir = primary && primary.ok ? primary.dir : null;
  const agree = dir != null && ((dir > 0 && overlayTotal >= 1.5) || (dir < 0 && overlayTotal <= -1.5));
  const disagree = dir != null && ((dir >= 0.5 && overlayTotal <= -1.5) || (dir <= -0.5 && overlayTotal >= 1.5));
  let verdict: string;
  if (dir == null) {
    verdict = overlayTotal >= 3 ? 'BUY (overlay only — no trend history)' : overlayTotal >= 1.5 ? 'WATCH (overlay only)' : overlayTotal <= -3 ? 'SELL (overlay only — no trend history)' : 'WATCH (overlay only)';
  } else if (dir >= 1) verdict = agree ? 'STRONG BUY' : disagree ? 'BUY — overlay disagrees (caution)' : 'BUY (awaiting overlay confirmation)';
  else if (dir <= -1) verdict = agree ? 'STRONG SELL' : disagree ? 'SELL — overlay disagrees (caution)' : 'SELL (awaiting overlay confirmation)';
  else if (dir === 0.5) verdict = disagree ? 'WATCH — LONG forming, overlay bearish (caution)' : 'WATCH — LONG forming (Stage 2)';
  else if (dir === 0) verdict = 'WATCH — NO TRADE, basing (Stage 1)';
  else if (dir === -0.3) verdict = 'CAUTION — NO SHORT, trim longs (Stage 3 topping)';
  else verdict = disagree ? 'WATCH — SHORT forming, overlay bullish (caution)' : 'WATCH — SHORT forming (Stage 4)';

  const setup: Setup = {
    ltp, pctChg20, sma20, sma50, high20, low20, trendScore, trendLabel, breakoutScore, breakoutLabel, relStrength, oiScore, oiLabel, curveScore, curveLabel,
    overlayTotal, overlayVerdict, total: overlayTotal, primary: primary || null, agree, disagree, verdict,
  };
  attachTradePlan(setup, candles);
  return setup;
}

export function computeConviction(setup: Setup): number | null {
  const p = setup.primary;
  if (!p || !p.ok || p.dir == null || p.dir === 0 || p.dir === -0.3) return null;
  const dir = p.dir;
  const isLong = dir > 0;
  const rulesObj = isLong ? p.tt : p.st;
  let pts = 0;
  if (rulesObj && rulesObj.ok) pts += (rulesObj.rulesPassed / rulesObj.rulesTotal) * 40;
  else pts += 20;
  pts += Math.abs(dir) === 1 ? 25 : 12.5;
  if (setup.agree) pts += 20;
  else if (setup.disagree) pts -= 20;
  const mom = p.mom;
  if (mom && mom.ok) {
    const momDir = mom.score > 0 ? 1 : mom.score < 0 ? -1 : 0;
    const expectedDir = isLong ? 1 : -1;
    if (momDir === expectedDir) pts += (mom.gapFlagged ? 5 : 10) * mom.r2;
    else if (momDir === -expectedDir) pts -= 5;
  }
  const ext = setup.extensionNote || '';
  if (ext.indexOf('EXTENDED') !== -1) pts -= 5;
  else if (ext && (ext.indexOf('not extended') !== -1 || ext.indexOf('buy zone') !== -1 || ext.indexOf('sell zone') !== -1)) pts += 5;
  return Math.max(0, Math.min(100, Math.round(pts)));
}

export function attachTradePlan(setup: Setup, candles: DCandle[]): void {
  const range20 = setup.high20 - setup.low20;
  const dir = setup.primary && setup.primary.ok ? setup.primary.dir : null;
  const noPlan = { entry: null, target: null, stop: null, riskReward: null };
  if (dir == null) {
    const isBuy = setup.overlayTotal >= 1.5;
    const isSell = setup.overlayTotal <= -1.5;
    setup.levelsSource = 'fallback (20-day range) — not enough trading days yet for the trend-template read';
    if (isBuy) {
      setup.entry = setup.ltp;
      setup.target = setup.ltp + range20 * 0.75;
      setup.stop = Math.max(setup.sma20 != null ? setup.sma20 : setup.low20, setup.low20);
      setup.exitCriteria = `Exit on a daily close below SMA20 (${setup.sma20 != null ? setup.sma20.toFixed(1) : '—'}) or below the 20d low (${setup.low20.toFixed(1)}) — whichever is hit first.`;
    } else if (isSell) {
      setup.entry = setup.ltp;
      setup.target = setup.ltp - range20 * 0.75;
      setup.stop = Math.min(setup.sma20 != null ? setup.sma20 : setup.high20, setup.high20);
      setup.exitCriteria = `Exit on a daily close above SMA20 (${setup.sma20 != null ? setup.sma20.toFixed(1) : '—'}) or above the 20d high (${setup.high20.toFixed(1)}) — whichever is hit first.`;
    } else {
      Object.assign(setup, noPlan);
      setup.convictionPct = null;
      setup.exitCriteria = "No trade — not enough history for a trend read, and today's overlay is not decisive either.";
      return;
    }
    setup.riskReward = setup.entry != null && setup.stop != null ? Math.abs(setup.target! - setup.entry) / Math.max(0.01, Math.abs(setup.entry - setup.stop)) : null;
    setup.convictionPct = null;
    return;
  }
  if (dir === 0 || dir === -0.3) {
    Object.assign(setup, noPlan);
    setup.convictionPct = null;
    setup.levelsSource = 'no plan by design — ' + setup.primary!.label;
    setup.exitCriteria =
      dir === 0
        ? 'No trade — Stage 1 basing has no established direction yet. Watch for a Stage 2 breakout (price reclaiming the 30-week MA with the MA itself turning up).'
        : 'No trade — Stage 3 topping calls for trimming/exiting existing longs, not a new short (that only applies once Stage 4 is confirmed). ';
    return;
  }
  const tt = setup.primary!.tt;
  const st = setup.primary!.st;
  if (dir > 0) {
    const price = tt && tt.ok ? tt.price : setup.ltp;
    const sma50 = tt && tt.ok ? tt.sma50 : setup.sma50;
    const L = longLevels(candles, price, sma50);
    setup.entry = L.entry;
    setup.target = L.target;
    setup.stop = L.stop;
    setup.riskReward = L.rr;
    setup.levelsSource = 'ATR(14) 1.5x/2.5x — groot-research convention' + (tt && tt.ok ? '' : ` (SMA50 only — Trend Template needs 210+ days, have ${candles.length})`);
    setup.extensionNote = L.note;
    setup.pctAboveSma50 = L.pctAbove;
    setup.exitCriteria = `Structural stop at ${L.stop != null ? L.stop.toFixed(1) : '—'} (entry &minus; 1.5&times;ATR14). ${L.note || ''}. Also downgrade/exit if the overlay flips to LONG UNWINDING/SHORT BUILDUP or the next scan drops the Stage 2 read.`;
  } else {
    const price = st && st.ok ? st.price : setup.ltp;
    const sma50 = st && st.ok ? st.sma50 : setup.sma50;
    const S = shortLevels(candles, price, sma50);
    setup.entry = S.entry;
    setup.target = S.target;
    setup.stop = S.stop;
    setup.riskReward = S.rr;
    setup.levelsSource = 'ATR(14) 1.5x/2.5x — groot-research convention' + (st && st.ok ? '' : ` (SMA50 only — Short Template needs 210+ days, have ${candles.length})`);
    setup.extensionNote = S.note;
    setup.pctBelowSma50 = S.pctBelow;
    setup.exitCriteria = `Structural stop at ${S.stop != null ? S.stop.toFixed(1) : '—'} (entry + 1.5&times;ATR14). ${S.note || ''}. Also downgrade/exit if the overlay flips to SHORT COVERING/LONG BUILDUP or the next scan drops the Stage 4 read.`;
  }
  setup.convictionPct = computeConviction(setup);
}
