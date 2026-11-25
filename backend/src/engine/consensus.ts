/**
 * Master Consensus: a faithful port of `_gtbMasterConsensus` (grootTradeBot.js).
 * Nine engines vote; engines that read the same data are grouped and vote once per group.
 * Inputs the browser read from globals are passed in. A missing input means "no data" for that row.
 */
import { futuresTrendScore } from './futures.js';
import type { InstrumentScore } from './score.js';

export type WeightClass = 'VALIDATED' | 'REASONED' | 'UNRELIABLE';

export interface VoteRow {
  label: string;
  dir: number;
  weight: number;
  weightClass: WeightClass;
  note: string | null;
  hasData: boolean;
  family?: string;
}

export interface FamilyGroup {
  name: string;
  sum: number;
  w: number;
  cap: number;
  members: number;
  strength: number;
  dir: number;
}

export interface ConsensusInputs {
  /** the instrument score (null when it could not be computed) */
  cs: InstrumentScore | null;
  /** the 9:15 close zone from the scan */
  zone?: string | null;
  /** futures REMARK and the accuracy replay entry for it */
  remark?: string | null;
  futAcc?: { total: number; hits: number; pts: number } | null;
  /** Level Probability result */
  levelProb?: { ok: boolean; netDir?: number; netDirNoScore?: number } | null;
  /** order flow read, null when not subscribed */
  orderFlow?: { dir: number } | null;
  /** curve structure read */
  curve?: { dir: number; lean: string } | null;
  /** dead zone: the band when active, `broken` set once a completed candle closed outside it */
  deadZone?: { broken?: unknown } | null;
}

export interface Consensus {
  rows: VoteRow[];
  net: number;
  agree: number;
  voting: number;
  votingRows: number;
  families: FamilyGroup[];
  dataCount: number;
  thin: boolean;
  dzConflict: boolean;
  outcome: string;
  deadZone: unknown;
  deadZoneBroken: unknown;
}

const FAM: [RegExp, string][] = [
  [/^9:15 Zone/, 'zone'],
  [/^Price vs strike/, 'trend'],
  [/^Futures Trend/, 'futures'],
  [/^OI\/OBV/, 'options'],
  [/^Max Pain/, 'options'],
  [/^IV Skew/, 'options'],
  [/^Level Probability/, 'options'],
  [/^Order Flow/, 'orderflow'],
  [/^Curve Structure/, 'curve'],
];

const sgn = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);

export function masterConsensus(inp: ConsensusInputs): Consensus {
  const rows: VoteRow[] = [];
  const vote = (label: string, dir: number, weight: number, weightClass: WeightClass, note: string | null, hasData = true): void => {
    rows.push({ label, dir, weight, weightClass, note, hasData });
  };
  const cs = inp.cs;

  // 1. 9:15 zone
  const zone = inp.zone || null;
  const zoneDir = zone === 'AST' || zone === 'ASO' ? 1 : zone === 'BST' || zone === 'BSO' ? -1 : 0;
  vote(`9:15 Zone (${zone || 'n/a'})`, zoneDir, 3, 'VALIDATED', zone ? null : 'no 9:15 scan cached yet', !!zone);

  // 2. price vs strike levels
  const trendSub = cs ? cs.current_trend : 0;
  vote(`Price vs strike levels (${cs ? (trendSub >= 0 ? '+' : '') + trendSub.toFixed(0) : 'n/a'})`, sgn(trendSub), 1.5, 'REASONED', cs ? 'the only part of the composite score that no other engine votes on' : 'no score data', !!cs);

  // 3. futures trend, weighted by this remark's own accuracy today
  const remark = inp.remark || null;
  let futDir = 0;
  let futWeight = 1;
  let futClass: WeightClass = 'REASONED';
  let futNote: string | null = null;
  if (remark) {
    futDir = sgn(futuresTrendScore(remark));
    const acc = inp.futAcc;
    if (acc && acc.total >= 8) {
      const win = acc.hits / acc.total;
      const avgPts = acc.pts / acc.total;
      if (win >= 0.55 && avgPts > 0) {
        futWeight = 3;
        futClass = 'VALIDATED';
        futNote = `today: ${Math.round(win * 100)}% win, +${avgPts.toFixed(1)} avg pts (n=${acc.total})`;
      } else {
        futWeight = 0.5;
        futClass = 'UNRELIABLE';
        futNote = `today: ${Math.round(win * 100)}% win, ${avgPts >= 0 ? '+' : ''}${avgPts.toFixed(1)} avg pts (n=${acc.total}) — not earning trust today`;
      }
    } else futNote = 'no accuracy replay yet for this REMARK — open the Futures Accuracy panel first';
  }
  vote(`Futures Trend (${remark || 'n/a'})`, futDir, futWeight, futClass, futNote, !!remark);

  // 4. OI/OBV
  const oiDir = cs ? (cs.oi_obv > 1 ? 1 : cs.oi_obv < -1 ? -1 : 0) : 0;
  vote(`OI/OBV (${cs ? (cs.oi_obv >= 0 ? '+' : '') + cs.oi_obv.toFixed(1) : 'n/a'})`, oiDir, 0.5, 'UNRELIABLE', 'this app’s own accuracy replay showed negative expectancy in every bucket tested — down-weighted, not trusted at face value', !!cs);

  // 5. Max Pain (context only)
  vote('Max Pain', cs ? sgn(cs.max_pain) : 0, 0.5, 'REASONED', 'informational target, not a primary driver by this app’s own convention', !!cs);

  // 6. IV skew
  vote('IV Skew', cs ? sgn(cs.iv_skew) : 0, 0.5, 'REASONED', cs ? null : 'no score data', !!cs);

  // 7. Level Probability (OBV flow + OI walls only)
  const lp = inp.levelProb;
  const lpOk = !!(lp && lp.ok);
  const lpNet = lpOk ? (lp!.netDirNoScore !== undefined ? lp!.netDirNoScore : (lp!.netDir ?? 0)) : 0;
  const lpDir = lpOk ? (lpNet > 0.15 ? 1 : lpNet < -0.15 ? -1 : 0) : 0;
  vote('Level Probability', lpDir, 1.5, 'REASONED', lpOk ? null : 'no data (needs OI fetch + strike levels first)', lpOk);

  // 8. Order flow
  const of = inp.orderFlow;
  vote('Order Flow (resting orders)', of ? of.dir : 0, 1, 'REASONED', of ? null : 'not subscribed on WebSocket this session', !!of);

  // 9. Curve structure
  const cst = inp.curve;
  const curveDir = cst ? cst.dir : 0;
  vote(`Curve Structure${cst ? ' (' + cst.lean.split(' ')[0] + ')' : ''}`, curveDir, 1, 'REASONED',
    cst ? (curveDir === 0 ? 'genuinely neutral reading, no vote' : 'not yet backtested, same caution as other REASONED engines') : 'no curve read cached yet — open the Curve Structure panel first', !!cst);

  let deadZone: unknown = null;
  let deadZoneBroken: unknown = null;
  if (inp.deadZone) {
    if (inp.deadZone.broken) deadZoneBroken = inp.deadZone;
    else deadZone = inp.deadZone;
  }

  // independent signal groups
  const famMap: Record<string, FamilyGroup> = {};
  for (const r of rows) {
    r.family = 'other:' + r.label;
    for (const f of FAM) if (f[0].test(r.label)) r.family = f[1];
    const g = (famMap[r.family] = famMap[r.family] ?? { name: r.family, sum: 0, w: 0, cap: 0, members: 0, strength: 0, dir: 0 });
    if (/^Max Pain/.test(r.label)) {
      r.note = (r.note ? r.note + '; ' : '') + 'shown for context, not counted in the option-flow vote';
      continue;
    }
    if (r.dir !== 0) {
      g.sum += r.dir * r.weight;
      g.w += r.weight;
      g.members++;
      if (r.weight > g.cap) g.cap = r.weight;
    }
  }
  const families = Object.keys(famMap).map((k) => {
    const g = famMap[k]!;
    g.strength = g.w ? g.sum / g.w : 0;
    g.dir = Math.abs(g.strength) >= 0.2 ? (g.strength > 0 ? 1 : -1) : 0;
    return g;
  });
  let totalWeight = 0;
  let weightedSum = 0;
  for (const g of families) {
    if (g.members) {
      g.cap = g.w / g.members;
      totalWeight += g.cap;
      weightedSum += g.strength * g.cap;
    }
  }
  const net = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const dataCount = rows.filter((r) => r.hasData).length;
  const votingRows = rows.filter((r) => r.dir !== 0).length;
  const voting = families.filter((g) => g.dir !== 0).length;
  const agree = families.filter((g) => g.dir !== 0 && ((net > 0 && g.dir > 0) || (net < 0 && g.dir < 0))).length;
  const thin = voting <= 1;

  let outcome: string;
  if (deadZone) outcome = 'WAIT — Dead Zone';
  else if (voting === 0) outcome = 'WAIT — No Data';
  else if (net > 0.2) outcome = 'GO LONG';
  else if (net < -0.2) outcome = 'GO SHORT';
  else outcome = 'WAIT';

  const dzConflict = !!(deadZone && voting >= 4 && Math.abs(net) >= 0.5);
  return { rows, net, agree, voting, votingRows, families, dataCount, thin, dzConflict, outcome, deadZone, deadZoneBroken };
}
