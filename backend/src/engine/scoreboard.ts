import { compositeScore, type CompositeParts } from './composite.js';

export interface ScoreGroup {
  key: 'nine15' | 'ad' | 'fut' | 'oiObv' | 'maxPain' | 'ivSkew' | 'comp';
  label: string;
  /** what the group is made of */
  lead: 'leading' | 'lagging';
  sum: number;
  /** the most this group can add in one direction */
  cap: number;
}

export interface Scoreboard {
  groups: ScoreGroup[];
  /** every part added up, the number the Range Scoreboard shows */
  total: number;
  /** the leading groups alone */
  leading: number;
  dir: 1 | 0 | -1;
  /** 0 to 100: how much of the possible score, with each group counted only up to its own cap, points the same way as the total */
  confidence: number;
  /** a group that is 60% or more of the absolute score (one-sided reading), else null */
  dominant: { key: ScoreGroup['key']; label: string; share: number } | null;
}

const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);
const r2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * The Range Scoreboard of the old dashboard: the composite score split into its seven groups. Confidence counts each group only up to its own scale
 * (9:15 7, advance/decline 3, futures 3, OI/OBV 10, max pain 5, IV skew 5, component weights 5; 38 in all) in the direction of the total, so one
 * lopsided group cannot read as full confidence. The LONG / SHORT / WAIT call itself still comes from the market signal, not from this.
 */
export function scoreboard(p: CompositeParts): Scoreboard {
  const n = p.nine15;
  const groups: ScoreGroup[] = [
    { key: 'nine15', label: '9:15 candle', lead: 'leading', sum: r2(n.all + n.nifty50 + n.bank + n.gift + n.sensex + n.reliance + n.hdfcbank), cap: 7 },
    { key: 'ad', label: 'Advance / decline', lead: 'leading', sum: r2(p.ad.all + p.ad.nifty50 + p.ad.bank), cap: 3 },
    { key: 'fut', label: 'Futures trend', lead: 'leading', sum: r2(p.fut.all + p.fut.nifty50 + p.fut.bank), cap: 3 },
    { key: 'oiObv', label: 'OI / OBV', lead: 'lagging', sum: r2(sum(p.oiObv)), cap: 10 },
    { key: 'maxPain', label: 'Max pain', lead: 'lagging', sum: r2(sum(p.maxPain)), cap: 5 },
    { key: 'ivSkew', label: 'IV skew', lead: 'lagging', sum: r2(sum(p.ivSkew)), cap: 5 },
    { key: 'comp', label: 'Component weights', lead: 'lagging', sum: r2(p.component.nifty50 + p.component.bank), cap: 5 },
  ];
  const total = compositeScore(p, true);
  const dir = total > 0 ? 1 : total < 0 ? -1 : 0;
  const maxTotal = groups.reduce((a, g) => a + g.cap, 0);
  const aligned = dir === 0 ? 0 : groups.reduce((a, g) => a + Math.min(Math.max(g.sum * dir, 0), g.cap), 0);
  const abs = groups.reduce((a, g) => a + Math.abs(g.sum), 0);
  const top = [...groups].sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum))[0]!;
  const share = abs ? Math.abs(top.sum) / abs : 0;
  return {
    groups,
    total,
    leading: r2(groups.filter((g) => g.lead === 'leading').reduce((a, g) => a + g.sum, 0)),
    dir,
    confidence: Math.round((aligned / maxTotal) * 100),
    dominant: share >= 0.6 ? { key: top.key, label: top.label, share: Math.round(share * 100) } : null,
  };
}
