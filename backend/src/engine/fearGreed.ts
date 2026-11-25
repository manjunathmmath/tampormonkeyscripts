/**
 * Fear & Greed: ports of `_gtbFetchNiftyMomentum` (the maths), `_gtbFearGreedComponents`, `_gtbFearGreedLabel` and `_gtbFearGreedOutcome` (grootTradeBot.js).
 * A contrarian conviction modifier built from three inputs (momentum, breadth, volatility); it never picks a direction itself.
 */
export const FG_BREADTH_MIN_COVERAGE = 0.15;

/** NIFTY 50 momentum from daily closes: last close against its 20-day average, +-5% mapped to -1..+1 (null with fewer than 10 candles). */
export function niftyMomentum(closes: number[]): number | null {
  if (closes.length < 10) return null;
  const last20 = closes.slice(-20);
  const sma20 = last20.reduce((a, c) => a + c, 0) / last20.length;
  const ltp = closes[closes.length - 1]!;
  const pct = sma20 ? ((ltp - sma20) / sma20) * 100 : 0;
  return Math.max(-1, Math.min(1, pct / 5));
}

export interface FgPart {
  label: string;
  score: number | null;
  detail?: string | null;
}

export interface FgInput {
  /** ALL_ADVANCE_DECLINE_SCORE, -1..+1 */
  breadth: number;
  /** advances + declines */
  sample: number;
  /** stocks scanned */
  universe: number;
  vix: number;
  /** from niftyMomentum, -1..+1, or null */
  momentum: number | null;
}

export function components(i: FgInput): { parts: FgPart[]; composite: number | null } {
  const breadthRaw = Number.isFinite(i.breadth) ? i.breadth : 0;
  const breadthRawScore = Math.max(0, Math.min(100, ((breadthRaw + 1) / 2) * 100));
  const coverage = i.universe > 0 ? i.sample / i.universe : 0;
  const confidence = Math.max(0, Math.min(1, coverage / FG_BREADTH_MIN_COVERAGE));
  const breadthScore = 50 + (breadthRawScore - 50) * confidence;
  const breadthDetail = i.universe > 0 ? `${i.sample} / ${i.universe} stocks broken out${confidence < 1 ? ' (thin sample, shrunk toward neutral)' : ''}` : null;
  const vixScore = i.vix ? Math.max(0, Math.min(100, 100 - ((i.vix - 10) / 20) * 100)) : null;
  const momentumScore = i.momentum !== null ? Math.max(0, Math.min(100, ((i.momentum + 1) / 2) * 100)) : null;
  const parts: FgPart[] = [
    { label: 'Momentum (N50 vs 20d SMA)', score: momentumScore },
    { label: 'Breadth (Advance/Decline)', score: breadthScore, detail: breadthDetail },
    { label: 'Volatility (India VIX, inverted)', score: vixScore },
  ];
  const avail = parts.filter((p) => p.score !== null);
  const composite = avail.length ? avail.reduce((a, p) => a + (p.score as number), 0) / avail.length : null;
  return { parts, composite };
}

export function label(score: number | null): { label: string; tone: 'good' | 'warn' | 'flat' | 'bad' } {
  if (score === null) return { label: 'PENDING', tone: 'flat' };
  if (score < 25) return { label: 'EXTREME FEAR', tone: 'good' };
  if (score < 45) return { label: 'FEAR', tone: 'warn' };
  if (score <= 55) return { label: 'NEUTRAL', tone: 'flat' };
  if (score <= 75) return { label: 'GREED', tone: 'warn' };
  return { label: 'EXTREME GREED', tone: 'bad' };
}

export function outcome(score: number | null): { tone: 'good' | 'warn' | 'bad'; text: string } | null {
  if (score === null) return null;
  if (score < 25) return { tone: 'good', text: 'Extreme Fear zone (<25) — historically a favorable backdrop for fresh LONG positions: markets are often oversold here and prone to bounce. Still confirm direction with Master Consensus first — this is a "trust it more if it agrees" signal, not a standalone buy call.' };
  if (score < 45) return { tone: 'warn', text: 'Fear zone (25-45) — a mild version of the Extreme Fear lean: some caution against adding to shorts, but not yet the "coiled spring" read of a genuinely oversold market.' };
  if (score <= 55) return null;
  if (score <= 75) return { tone: 'warn', text: 'Greed zone (55-75) — a mild version of the Extreme Greed lean: some caution against aggressively adding to longs, but not yet the "everyone\'s already in" read of a genuinely overbought market.' };
  return { tone: 'bad', text: 'Extreme Greed zone (>75) — suggests caution opening fresh LONG positions: markets may be overbought here and prone to pull back. If Master Consensus says GO LONG anyway, consider smaller size and a tighter stop rather than skipping it outright.' };
}
