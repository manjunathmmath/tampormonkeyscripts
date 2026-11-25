/**
 * Expiry-day lines of the Final Verdict: ports of `_gtbExpiryContext` and the warning built in `_gtbFinalVerdict` (grootTradeBot.js).
 * Context only, from the OI chain already loaded; none of it is back-tested and it never changes the call.
 */
export interface ExpiryWall {
  strike: number;
  tier: string;
}

export interface ExpiryInput {
  /** the strike used as spot (the ATM row) when max pain was computed, else the last price */
  spot: number;
  maxPain: { maxPainK: number; maxPainPct: number } | null;
  resistance: ExpiryWall[];
  support: ExpiryWall[];
}

const f = (n: number): string => Math.round(n).toLocaleString('en-IN');

/** `_gtbExpiryContext`: max pain and the nearest ranked call wall above / put wall below price, with distances. null with no spot or nothing to say. */
export function expiryContext(name: string, up: boolean, i: ExpiryInput): string | null {
  const spot = i.spot;
  if (!spot) return null;
  const above = i.resistance.filter((x) => x.strike > spot).sort((a, b) => a.strike - b.strike)[0];
  const below = i.support.filter((x) => x.strike < spot).sort((a, b) => b.strike - a.strike)[0];
  const parts: string[] = [];
  if (i.maxPain) parts.push(`max pain ${f(i.maxPain.maxPainK)} (spot ${f(spot)}, ${i.maxPain.maxPainPct >= 0 ? '+' : ''}${i.maxPain.maxPainPct.toFixed(2)}%)`);
  if (above) parts.push(`nearest call wall ${f(above.strike)} (+${f(above.strike - spot)} pts, ${above.tier})`);
  if (below) parts.push(`nearest put wall ${f(below.strike)} (-${f(spot - below.strike)} pts, ${below.tier})`);
  if (!parts.length) return null;
  const hint = up
    ? 'A short-covering push tends to stall near the call wall; pinning tends to pull price back toward max pain / the put wall into the close.'
    : 'Long unwinding tends to stall near the put wall; pinning tends to pull price back toward max pain / the call wall into the close.';
  return `${name}: ${parts.join('; ')}. ${hint}`;
}

/** The warning line added to the verdict when `names` have options expiring on the day shown (`lines` are their `expiryContext` results, nulls removed). */
export function expiryWarning(names: string[], lines: string[]): string {
  return `Expiry day — ${names.join(' + ')} options expire today; moves can be sharp and one-way, so size smaller. ${
    lines.length ? lines.join(' ') + ' On an expiry day the realistic pullback target is max pain / the nearest support wall, which can sit well above the 9:15 level.' : 'No OI chain loaded yet for the walls and max pain.'
  }`;
}
