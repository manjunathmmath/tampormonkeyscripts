/**
 * Weighted constituents: the Index Impact ranking of `_gtbSigOiWtdColHtml` (grootTradeBot.js). Impact = weight% x change% / 100, the tier of each stock
 * comes from the impact ranking (first 50% of the cumulative |impact| = driver, up to 80% = contributor, the rest negligible), and a CAUTION appears when the
 * slice nets the other way from the real index.
 */
export interface WtdInput {
  name: string;
  /** weight in percent */
  weight: number;
  /** change vs the previous close, percent */
  change: number;
}

export type Tier = 'driver' | 'contributor' | 'negligible';

export interface WtdRow extends WtdInput {
  impact: number;
  tier: Tier;
  /** cumulative share of the total |impact| in the displayed order, whole percent */
  cumPct: number;
  /** from the sign of the impact */
  dir: 'Up' | 'Down' | 'Flat';
}

export interface WtdResult {
  rows: WtdRow[];
  coverage: number;
  netImpact: number;
  indexChange: number;
  driverNames: string[];
  /** share of the |impact| carried by the drivers, whole percent */
  driverShare: number;
  /** the slice nets the other way from the index (the move comes from outside it) */
  disagrees: boolean;
}

export function weightedTable(inputs: WtdInput[], indexChange: number, coverage: number, sort: 'impact' | 'weight' = 'impact'): WtdResult {
  const rows = inputs.map((i) => ({ ...i, impact: (i.weight * i.change) / 100 }));
  const netImpact = rows.reduce((s, r) => s + r.impact, 0);
  const totalAbs = rows.reduce((s, r) => s + Math.abs(r.impact), 0) || 1;
  const tiers = new Map<string, Tier>();
  const driverNames: string[] = [];
  let cumBefore = 0;
  for (const r of rows.slice().sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))) {
    const before = cumBefore / totalAbs;
    if (before < 0.5) {
      tiers.set(r.name, 'driver');
      driverNames.push(r.name);
    } else tiers.set(r.name, before < 0.8 ? 'contributor' : 'negligible');
    cumBefore += Math.abs(r.impact);
  }
  const driverAbs = rows.filter((r) => tiers.get(r.name) === 'driver').reduce((s, r) => s + Math.abs(r.impact), 0);
  const driverShare = driverNames.length ? Math.round((driverAbs / totalAbs) * 100) : 0;
  rows.sort(sort === 'impact' ? (a, b) => Math.abs(b.impact) - Math.abs(a.impact) : (a, b) => b.weight - a.weight);
  let cum = 0;
  const out: WtdRow[] = rows.map((r) => {
    cum += Math.abs(r.impact);
    return { ...r, tier: tiers.get(r.name)!, cumPct: Math.round((cum / totalAbs) * 100), dir: r.impact > 0.001 ? 'Up' : r.impact < -0.001 ? 'Down' : 'Flat' };
  });
  const disagrees = Math.abs(indexChange) > 0.02 && ((indexChange > 0 && netImpact < -0.01) || (indexChange < 0 && netImpact > 0.01));
  return { rows: out, coverage, netImpact, indexChange, driverNames, driverShare, disagrees };
}
