/**
 * Option Strike Search, the leg builder and payoff maths: pick a strategy for a view, put its legs on listed strikes and work out the expiry payoff
 * per share (max profit, max loss, break-evens, net credit or debit). Premiums, brokerage, taxes and margin are not part of this; the numbers are arithmetic, not advice.
 */
export type StrategyKey = 'long_call' | 'long_put' | 'bull_call' | 'bear_put' | 'bull_put' | 'bear_call' | 'iron_condor' | 'iron_fly' | 'short_straddle' | 'long_straddle';

export interface StrategyDef {
  key: StrategyKey;
  label: string;
  view: 'Bullish' | 'Bearish' | 'Range-bound' | 'Big move';
  /** debit strategies pay a premium, credit strategies receive one */
  kind: 'debit' | 'credit';
}

export const STRATEGIES: StrategyDef[] = [
  { key: 'long_call', label: 'Long call', view: 'Bullish', kind: 'debit' },
  { key: 'long_put', label: 'Long put', view: 'Bearish', kind: 'debit' },
  { key: 'bull_call', label: 'Bull call spread', view: 'Bullish', kind: 'debit' },
  { key: 'bear_put', label: 'Bear put spread', view: 'Bearish', kind: 'debit' },
  { key: 'bull_put', label: 'Bull put spread', view: 'Bullish', kind: 'credit' },
  { key: 'bear_call', label: 'Bear call spread', view: 'Bearish', kind: 'credit' },
  { key: 'iron_condor', label: 'Iron condor', view: 'Range-bound', kind: 'credit' },
  { key: 'iron_fly', label: 'Iron fly', view: 'Range-bound', kind: 'credit' },
  { key: 'short_straddle', label: 'Short straddle', view: 'Range-bound', kind: 'credit' },
  { key: 'long_straddle', label: 'Long straddle', view: 'Big move', kind: 'debit' },
];

/** the suggested strategy for the consensus direction (the old script: LONG gives a bull call spread, SHORT a bear put spread, anything else an iron condor) */
export const suggest = (dir: number): StrategyKey => (dir > 0 ? 'bull_call' : dir < 0 ? 'bear_put' : 'iron_condor');

export interface LegSpec {
  type: 'CE' | 'PE';
  side: 'BUY' | 'SELL';
  /** the strike that was asked for, before it is moved to a listed one */
  target: number;
}

/** the legs of a strategy around the at-the-money strike: offset = distance of the sold strikes, wing = width of the hedge or spread */
export function legSpecs(key: StrategyKey, atm: number, offset: number, wing: number): LegSpec[] {
  const L = (type: 'CE' | 'PE', side: 'BUY' | 'SELL', target: number): LegSpec => ({ type, side, target });
  switch (key) {
    case 'long_call': return [L('CE', 'BUY', atm)];
    case 'long_put': return [L('PE', 'BUY', atm)];
    case 'bull_call': return [L('CE', 'BUY', atm), L('CE', 'SELL', atm + wing)];
    case 'bear_put': return [L('PE', 'BUY', atm), L('PE', 'SELL', atm - wing)];
    case 'bull_put': return [L('PE', 'SELL', atm - offset), L('PE', 'BUY', atm - offset - wing)];
    case 'bear_call': return [L('CE', 'SELL', atm + offset), L('CE', 'BUY', atm + offset + wing)];
    case 'iron_condor': return [L('PE', 'SELL', atm - offset), L('PE', 'BUY', atm - offset - wing), L('CE', 'SELL', atm + offset), L('CE', 'BUY', atm + offset + wing)];
    case 'iron_fly': return [L('CE', 'SELL', atm), L('PE', 'SELL', atm), L('CE', 'BUY', atm + wing), L('PE', 'BUY', atm - wing)];
    case 'short_straddle': return [L('CE', 'SELL', atm), L('PE', 'SELL', atm)];
    case 'long_straddle': return [L('CE', 'BUY', atm), L('PE', 'BUY', atm)];
  }
}

/** the listed strike nearest to a target */
export function snap(strikes: number[], target: number): number {
  let best = strikes[0] ?? target;
  for (const k of strikes) if (Math.abs(k - target) < Math.abs(best - target)) best = k;
  return best;
}

/** the usual strike gap of a chain (the most common difference between neighbouring strikes) */
export function strikeStep(strikes: number[]): number {
  const s = [...new Set(strikes)].sort((a, b) => a - b);
  const c = new Map<number, number>();
  for (let i = 1; i < s.length; i++) {
    const d = Math.round((s[i]! - s[i - 1]!) * 100) / 100;
    if (d > 0) c.set(d, (c.get(d) ?? 0) + 1);
  }
  let best = 0;
  let n = 0;
  for (const [d, k] of c) if (k > n || (k === n && d < best)) { best = d; n = k; }
  return best;
}

/** one expected move of the underlying to expiry: price x volatility % x sqrt(days / 365) */
export const expectedMove = (spot: number, volPct: number, days: number): number => (spot * (volPct / 100) * Math.sqrt(Math.max(days, 1) / 365));

export interface PricedLeg extends LegSpec {
  strike: number;
  premium: number | null;
}

export interface Payoff {
  /** per share; null premium on any leg makes the whole read unavailable */
  ok: boolean;
  /** positive = money received at the start, negative = paid */
  netCredit: number | null;
  maxProfit: number | 'unlimited' | null;
  maxLoss: number | 'unlimited' | null;
  breakevens: number[];
}

const leg = (l: PricedLeg, s: number): number => {
  const intrinsic = l.type === 'CE' ? Math.max(s - l.strike, 0) : Math.max(l.strike - s, 0);
  const p = l.premium ?? 0;
  return l.side === 'BUY' ? intrinsic - p : p - intrinsic;
};
const total = (legs: PricedLeg[], s: number): number => legs.reduce((a, l) => a + leg(l, s), 0);

/** the expiry payoff per share: evaluated at every strike and at far points on both sides, which is exact for sums of calls and puts */
export function analyse(legs: PricedLeg[]): Payoff {
  if (!legs.length || legs.some((l) => l.premium == null)) return { ok: false, netCredit: null, maxProfit: null, maxLoss: null, breakevens: [] };
  const ks = [...new Set(legs.map((l) => l.strike))].sort((a, b) => a - b);
  const far = ks[ks.length - 1]! * 4;
  const pts = [0, ...ks, far];
  const v = pts.map((s) => total(legs, s));
  const slopeUp = total(legs, far * 2) - total(legs, far);
  const best = Math.max(...v);
  const worst = Math.min(...v);
  const r = (x: number): number => Math.round(x * 100) / 100;
  const be: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = v[i - 1]!;
    const b = v[i]!;
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) be.push(r(pts[i - 1]! + ((0 - a) / (b - a)) * (pts[i]! - pts[i - 1]!)));
    else if (b === 0 && i < pts.length - 1) be.push(pts[i]!);
  }
  const credit = legs.reduce((a, l) => a + (l.side === 'SELL' ? 1 : -1) * (l.premium ?? 0), 0);
  return {
    ok: true,
    netCredit: r(credit),
    maxProfit: slopeUp > 1e-9 ? 'unlimited' : r(best),
    maxLoss: slopeUp < -1e-9 || total(legs, 0) < worst - 1e-9 ? 'unlimited' : r(-worst),
    breakevens: [...new Set(be)],
  };
}
