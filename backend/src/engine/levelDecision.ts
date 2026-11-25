/**
 * Level Confirmation checks and the Level Decision: faithful ports of `_gtbLevelWallCheck`, `_gtbRoomToTargetCheck`, `_gtbLevelHistory`,
 * the small tally checks (`_gtbFuturesTrendCheck`, `_gtbIvSkewCheck`, `_gtbWeakStrongIndexCheck`, `_gtbComponentsCheck`, `_gtbBroadBasedCheck`,
 * the Level Probability one), `_gtbLevelDecisionCore` and the trend-entry window wrapper `_gtbLevelDecision` (grootTradeBot.js).
 * Everything the browser read from globals is passed in.
 */
import { findWalls, wallErosion, wallVelocity, type OiRow } from './oi.js';

export const DEC_AT_LEVEL_STEPS = 0.5;
export const DEC_WAIT_UNTIL_MIN = 10 * 60 + 30;
export const DEC_MIN_PLEVEL = 25;
export const DEC_MIN_TALLY = 0.75;
export const DEC_TREND_WINDOW_MIN = 30;
export const DEFAULT_LEVEL_ROOM_MULT = 1.5;

export type Side = 'support' | 'resistance';

export interface Check {
  ok: boolean;
  confirmed?: boolean;
  text?: string;
  reason?: string;
  strike?: number;
  [k: string]: unknown;
}

/** `_gtbLevelWallCheck`: is there a ranked OI wall at the level, and is it intact (not eroding)? */
export function levelWallCheck(name: string, rows: OiRow[] | null | undefined, spot: number, pc: number, side: Side, levelPrice?: number | null): Check {
  if (!rows || !rows.length) return { ok: false, reason: `No cached OI/OBV data for ${name}` };
  const walls = findWalls(rows, pc, spot);
  const erosion = wallErosion(rows, walls);
  const list = side === 'resistance' ? walls.resistance : walls.support;
  if (!list || !list.length) return { ok: true, confirmed: false, text: `No ranked ${side} wall found` };
  let top;
  if (levelPrice) {
    const PROX_PCT = 1.5;
    const near = list.filter((w) => (Math.abs(w.strike - levelPrice) / spot) * 100 <= PROX_PCT);
    near.sort((a, b) => Math.abs(a.strike - levelPrice) - Math.abs(b.strike - levelPrice));
    if (!near.length) return { ok: true, confirmed: false, text: `No ranked ${side} wall near ${levelPrice} (nearest is ${list[0]!.strike})` };
    top = near[0]!;
  } else top = list[0]!;
  const sideTag = side === 'resistance' ? 'R' : 'S';
  const eroding = (erosion.eroding || []).some((e) => e.side === sideTag && e.strike === top.strike);
  let building = false;
  try {
    const vel = wallVelocity(rows, spot, 3, 2);
    building = (vel.building || []).some((b) => b.side === sideTag && b.strike === top.strike);
  } catch {
    /* no velocity read */
  }
  return {
    ok: true,
    confirmed: !eroding,
    strike: top.strike,
    tier: top.tier,
    eroding,
    building,
    text: eroding ? `Wall at ${top.strike} is eroding — writers unwinding` : `${top.tier === 'primary' ? 'Primary' : 'Secondary'} wall at ${top.strike}${building ? ' — actively building 🔥' : ' intact'}`,
  };
}

/** `_gtbRoomToTargetCheck`: once in, is a ranked wall standing in the way within LEVEL_ROOM_MULT x the stop distance? */
export function roomToTargetCheck(name: string, rows: OiRow[] | null | undefined, spot: number, pc: number, side: Side, entry: number | null | undefined, stopLevel: number | null | undefined, mult = DEFAULT_LEVEL_ROOM_MULT): Check {
  if (!entry) return { ok: false, reason: '9:15 levels not loaded yet' };
  if (!rows || !rows.length) return { ok: false, reason: `No cached OI/OBV data for ${name}` };
  const m = mult > 0 ? mult : 1.5;
  let risk = stopLevel ? Math.abs(stopLevel - entry) : 0;
  if (!risk) risk = entry * 0.003;
  const reach = risk * m;
  const buy = side === 'support';
  const past = buy ? spot - entry : entry - spot;
  const passed = past > reach;
  const anchor = passed ? spot : entry;
  const from = passed ? `the current price ${spot.toFixed(0)} (already ${past.toFixed(0)} pts / ${(past / risk).toFixed(1)}× the stop past the ${entry} entry)` : String(entry);
  const walls = findWalls(rows, pc, spot);
  const list = (buy ? walls.resistance : walls.support) || [];
  const sideTag = buy ? 'R' : 'S';
  const kind = buy ? 'resistance' : 'support';
  const dirWord = buy ? 'above' : 'below';
  const ahead = list.filter((w) => (buy ? w.strike > anchor : w.strike < anchor)).sort((a, b) => Math.abs(a.strike - anchor) - Math.abs(b.strike - anchor));
  const near = ahead.filter((w) => Math.abs(w.strike - anchor) <= reach)[0];
  if (!near) {
    const nxt = ahead[0];
    return {
      ok: true,
      confirmed: true,
      reach,
      passed,
      text: `No ranked ${kind} wall within ${m}× the stop distance (${reach.toFixed(0)} pts) ${dirWord} ${from}` + (nxt ? ` — nearest is ${nxt.strike} (${(Math.abs(nxt.strike - anchor) / risk).toFixed(1)}×)` : ' — none on the chain'),
    };
  }
  const dist = Math.abs(near.strike - anchor);
  const rMult = dist / risk;
  const erosion = wallErosion(rows, walls);
  const eroding = (erosion.eroding || []).some((e) => e.side === sideTag && e.strike === near.strike);
  const tier = near.tier === 'primary' ? 'Primary' : 'Secondary';
  if (eroding) return { ok: true, confirmed: true, strike: near.strike, eroding: true, text: `${tier} ${kind} wall at ${near.strike} is eroding — writers unwinding, the path is opening` };
  return { ok: true, confirmed: false, strike: near.strike, tier: near.tier, rMult, passed, text: `${tier} ${kind} wall at ${near.strike} is only ${dist.toFixed(0)} pts (${rMult.toFixed(1)}× the stop) ${dirWord} ${from} — little room before it` };
}

/** `_gtbFuturesTrendCheck` (direction "weak" = confirming a sell, "strong" = confirming a buy). */
export function futuresTrendCheck(futuresTrend: number | null | undefined, remark: string | undefined, direction: 'weak' | 'strong', acc?: { total: number; hits: number } | null): Check {
  if (futuresTrend === undefined || futuresTrend === null) return { ok: false, reason: 'no futures data yet' };
  const confirmed = direction === 'weak' ? futuresTrend < 0 : futuresTrend > 0;
  const r = remark || '—';
  const accTxt = acc && acc.total >= 5 ? ` (${Math.round((acc.hits / acc.total) * 100)}% accurate today, n=${acc.total})` : '';
  return { ok: true, confirmed, text: r + accTxt };
}

/** `_gtbIvSkewCheck`. */
export function ivSkewCheck(score: number | undefined, direction: 'weak' | 'strong'): Check {
  if (score === undefined) return { ok: false, reason: 'no IV skew data' };
  const confirmed = direction === 'weak' ? score < 0 : score > 0;
  return { ok: true, confirmed, text: `${score < 0 ? 'Put skew (bearish pressure)' : score > 0 ? 'Call skew (bullish pressure)' : 'Flat'} (${score >= 0 ? '+' : ''}${score})` };
}

/** the Level Probability check inside `_gtbIdxTally`. */
export function levelProbCheck(lp: { ok: boolean; netDir: number } | null, direction: 'weak' | 'strong'): Check {
  if (!lp || !lp.ok) return { ok: false };
  return { ok: true, confirmed: direction === 'weak' ? lp.netDir < -0.1 : lp.netDir > 0.1 };
}

/** `_gtbWeakStrongIndexCheck`: scores are A/D + OI/OBV of NIFTY 50 and BANK NIFTY (market-wide values supplied by the caller). */
export function weakStrongIndexCheck(direction: 'weak' | 'strong', n50: number, bank: number): Check {
  const which = direction === 'weak' ? (n50 <= bank ? 'NIFTY 50' : 'NIFTY BANK') : n50 >= bank ? 'NIFTY 50' : 'NIFTY BANK';
  const val = which === 'NIFTY 50' ? n50 : bank;
  const confirmed = direction === 'weak' ? val < 0 : val > 0;
  return { ok: true, confirmed, which, val, text: `${which} is ${confirmed ? '' : 'only mildly '}${direction === 'weak' ? 'weakest' : 'strongest'} (A/D+OI/OBV ${val >= 0 ? '+' : ''}${val.toFixed(1)})` };
}

/** `_gtbComponentsCheck`. */
export function componentsCheck(direction: 'weak' | 'strong', cs: number): Check {
  const confirmed = direction === 'weak' ? cs <= 0 : cs >= 0;
  return { ok: true, confirmed, val: cs, text: `NIFTY 50 components ${direction === 'weak' ? (confirmed ? 'fading' : 'still driving the move up') : confirmed ? 'accelerating' : 'not yet confirming'} (${cs >= 0 ? '+' : ''}${cs.toFixed(1)})` };
}

/** `_gtbBroadBasedCheck`: weight x change of the weighted stocks (weights in %, change in %). */
export function broadBasedCheck(direction: 'weak' | 'strong', stocks: { name: string; weight: number; change: number }[]): Check {
  if (!stocks.length) return { ok: false, reason: 'no data' };
  const rows = stocks.map((s) => ({ name: s.name, impact: (s.weight * s.change) / 100 }));
  const netImpact = rows.reduce((a, r) => a + r.impact, 0);
  const totalAbs = rows.reduce((a, r) => a + Math.abs(r.impact), 0) || 1;
  const top = rows.slice().sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))[0]!;
  const topShare = Math.round((Math.abs(top.impact) / totalAbs) * 100);
  const dirConfirmed = direction === 'weak' ? netImpact < 0 : netImpact > 0;
  const broad = topShare < 50;
  return {
    ok: true,
    confirmed: dirConfirmed && broad,
    netImpact,
    topShare,
    topName: top.name,
    text: (dirConfirmed ? `Net impact ${netImpact >= 0 ? '+' : ''}${netImpact.toFixed(2)} agrees` : `Net impact ${netImpact >= 0 ? '+' : ''}${netImpact.toFixed(2)} disagrees`) + (broad ? ', broad-based' : `, but ${top.name} alone is ${topShare}% of it`),
  };
}

/** The tally of `_gtbIdxTally`: how many of the checks that could be read confirm. */
export function tally(checks: Check[]): { conf: number; total: number } {
  const ok = checks.filter((c) => c && c.ok);
  return { conf: ok.filter((c) => c.confirmed).length, total: ok.length };
}

export interface LevelHistory {
  reached: boolean;
  first: string | null;
  last: string | null;
  extreme: number;
  through: boolean;
  n: number;
  gap: number;
  back: number;
  skippedFirst: string;
}

/** `_gtbLevelHistory`: what today's candles say about a plan level. buy = a support level price falls to. The first candle of the day is skipped. */
export function levelHistory(candles: readonly (readonly (string | number | undefined)[])[] | null | undefined, level: number, buy: boolean): LevelHistory | null {
  if (!candles || !candles.length) return null;
  const day = String(candles[candles.length - 1]![0]).slice(0, 10);
  let today = candles.filter((c) => String(c[0]).slice(0, 10) === day);
  if (!today.length) return null;
  let first: string | null = null;
  let lastT: string | null = null;
  let ext = buy ? Infinity : -Infinity;
  const spot = parseFloat(String(today[today.length - 1]![4]));
  const firstT = String(today[0]![0]).slice(11, 16);
  today = today.slice(1);
  if (!today.length) return { reached: false, first: null, last: null, extreme: spot, through: buy ? spot <= level : spot >= level, n: 0, gap: Math.abs(spot - level), back: 0, skippedFirst: firstT };
  for (const c of today) {
    const hi = parseFloat(String(c[2]));
    const lo = parseFloat(String(c[3]));
    const t = String(c[0]).slice(11, 16);
    if (buy) {
      if (lo < ext) ext = lo;
      if (lo <= level) {
        if (!first) first = t;
        lastT = t;
      }
    } else {
      if (hi > ext) ext = hi;
      if (hi >= level) {
        if (!first) first = t;
        lastT = t;
      }
    }
  }
  const reached = !!first;
  const through = buy ? spot <= level : spot >= level;
  return { reached, first, last: lastT, extreme: ext, through, n: today.length, gap: buy ? ext - level : level - ext, back: reached ? (buy ? spot - ext : ext - spot) : 0, skippedFirst: firstT };
}

export interface Decision {
  action: 'SKIP' | 'AT_LEVEL' | 'WAIT' | 'TREND' | null;
  title: string;
  why: string[];
  plan: { level?: number; stop?: number | null; entry?: number; validUntil?: string } | null;
  spot: number;
  level: number;
  awaySteps: number;
  history?: LevelHistory | null;
  levelState?: 'TOUCHED_LEFT' | 'NOT_REACHED' | 'UNKNOWN';
  atMiss?: string[];
}

export interface DecisionInputs {
  side: Side;
  level: number | null | undefined;
  stopLevel: number | null | undefined;
  tallyConf: number;
  tallyTotal: number;
  /** the instrument and its partner index (NIFTY 50 <-> NIFTY BANK) */
  name: string;
  spot: number;
  pc: number;
  nowMin: number;
  /** the dashboard market signal and its score (null when not available) */
  signal: { signal?: string; reason?: string } | null;
  score: number | null;
  fut: number;
  futBank: number;
  remark: string;
  remarkAt?: string;
  partnerRemark?: string;
  partnerRemarkAt?: string;
  /** names with an active short covering (buy) or long unwinding (sell) squeeze */
  squeezeNames: string[];
  /** Level Probability of reaching the level (pBSO for a buy, pASO for a sell), or null */
  pLevel: number | null;
  deadZone: boolean;
  history: LevelHistory | null;
  rows: OiRow[] | null;
  /** the opposite 9:15 level and the futures VWAP, for the dip / rally entry */
  oppositeLevel?: number | null;
  avwap?: number | null;
  mult?: number;
}

const fmtN = (x: number): string => Math.round(x).toLocaleString('en-IN');

/** `_gtbLevelDecisionCore`: wait for the level, enter now, take a trend entry, or skip. Heuristic thresholds, not back-tested. */
export function levelDecisionCore(i: DecisionInputs): Decision | null {
  const nm = i.name || 'NIFTY 50';
  const lbl = nm === 'NIFTY 50' ? 'NIFTY' : nm;
  const partner = nm === 'NIFTY 50' ? 'NIFTY BANK' : 'NIFTY 50';
  const plbl = partner === 'NIFTY 50' ? 'NIFTY' : 'BANK';
  const buy = i.side === 'support';
  const sign = buy ? 1 : -1;
  const word = buy ? 'buy' : 'sell';
  const WORD = buy ? 'BUY' : 'SELL';
  const lvlName = buy ? 'BSO' : 'ASO';
  const level = i.level;
  if (!level) return null;
  const spot = i.spot;
  if (!spot) return null;
  const stopLevel = i.stopLevel;
  const step = stopLevel ? Math.abs(stopLevel - level) : level * 0.003;
  if (!step) return null;
  const mult = (i.mult ?? 0) > 0 ? i.mult! : DEFAULT_LEVEL_ROOM_MULT;
  const away = sign * (spot - level);
  const awaySteps = away / step;
  const nowMin = i.nowMin;
  const hhmm = ('0' + Math.floor(nowMin / 60)).slice(-2) + ':' + ('0' + (nowMin % 60)).slice(-2);
  const tallyConf = i.tallyConf;
  const tallyTotal = i.tallyTotal;
  const tallyPct = tallyTotal ? tallyConf / tallyTotal : 0;
  const ms = i.signal;
  const sig = ms && ms.signal;
  const score = i.score;
  const fut50 = i.fut || 0;
  const futBank = i.futBank || 0;
  const remark = i.remark || '';
  const pLevel = i.pLevel;
  const pts = (x: number): string => Math.round(Math.abs(x)).toLocaleString('en-IN');
  const sc = score != null && Number.isFinite(score) ? score.toFixed(1) : '—';
  const why: string[] = [];
  const d: Decision = { action: null, title: '', why, plan: null, spot, level, awaySteps };
  const hist = i.history;
  const lvlFmt = fmtN(level);
  d.history = hist;

  // 1. hard stops
  const against = buy ? sig === 'SELL' || sig === 'STRONG SELL' : sig === 'BUY' || sig === 'STRONG BUY';
  if (sig === 'NO TRADE') {
    d.action = 'SKIP';
    d.title = `DON'T ${WORD} — market guard says NO TRADE`;
    why.push((ms && ms.reason) || "India VIX / range guard is on, so the day's range is likely used up.");
  } else if (against) {
    d.action = 'SKIP';
    d.title = `DON'T ${WORD} — the market signal is ${sig}`;
    why.push(`The dashboard's composite score (${sc}) points the other way from this ${word} bias.`);
  } else if (stopLevel && sign * (spot - stopLevel) < 0) {
    d.action = 'SKIP';
    d.title = `DON'T ${WORD} — the level has broken`;
    why.push(`${lbl} ${spot.toFixed(0)} is already beyond the stop level ${stopLevel} (${buy ? 'BST' : 'AST'}); the thesis failed.`);
  } else if (tallyTotal && tallyPct < 0.5) {
    d.action = 'SKIP';
    d.title = `DON'T ${WORD} — most signals disagree`;
    why.push(`Only ${tallyConf} of ${tallyTotal} Level Confirmation checks agree.`);
  }
  if (d.action) return d;

  // 2. price is at the level
  if (awaySteps <= DEC_AT_LEVEL_STEPS) {
    const atMiss: string[] = [];
    const futOk0 = buy ? fut50 > 0 : fut50 < 0;
    const futBankOk0 = buy ? futBank >= 0 : futBank <= 0;
    const sigOk0 = buy ? sig === 'BUY' || sig === 'STRONG BUY' : sig === 'SELL' || sig === 'STRONG SELL';
    if (!tallyTotal) atMiss.push('the Level Confirmation checks are not loaded yet');
    else if (tallyPct < DEC_MIN_TALLY) atMiss.push(`only ${tallyConf}/${tallyTotal} checks agree`);
    if (!sigOk0) atMiss.push(`composite signal is ${sig || 'unavailable'} (${sc}), not ${WORD}`);
    if (!futOk0) atMiss.push(`${lbl} futures are not ${buy ? 'bullish' : 'bearish'}`);
    if (!futBankOk0) atMiss.push(`${plbl} futures are against a ${word}`);
    if (i.deadZone) atMiss.push(`${lbl} is in a dead zone`);
    d.action = 'AT_LEVEL';
    d.title = `${WORD} NOW — price is at ${lvlName} ${level}`;
    why.push(`${lbl} ${spot.toFixed(0)} is ${awaySteps <= 0 ? 'at/through' : `within ${pts(away)} pts of`} ${lvlName}; stop ${stopLevel}.`);
    why.push(atMiss.length ? `Not fully confirmed — ${atMiss.join('; ')} — size down or wait.` : `Signals agree (${tallyConf}/${tallyTotal}), futures agree, no dead zone.`);
    d.atMiss = atMiss;
    return d;
  }

  // 3. price has moved away: wait, or stop waiting
  const sqNames = i.squeezeNames;
  const close = awaySteps <= mult;
  const early = nowMin < DEC_WAIT_UNTIL_MIN;
  const plausible = (pLevel == null || pLevel >= DEC_MIN_PLEVEL) && !sqNames.length;
  if (close && early && plausible) {
    d.action = 'WAIT';
    d.title = `${hist && hist.reached ? 'WAIT for a second touch of ' : 'WAIT for '}${lvlName} ${level} — then ${word}`;
    why.push(`${lbl} ${spot.toFixed(0)} is ${pts(away)} pts (${awaySteps.toFixed(1)}× the stop) from the level; close enough that a pullback is still plausible.`);
    why.push(`Valid until 10:30 (it is ${hhmm}) and while price stays within ${mult}× the stop (${pts(step * mult)} pts).`);
    if (pLevel != null) why.push(`Live signals give ${pLevel}% for price reaching ${lvlName} today.`);
    d.plan = { level, stop: stopLevel };
    return d;
  }
  const reasons: string[] = [];
  if (!close) reasons.push(`${lbl} ${spot.toFixed(0)} is still ${pts(away)} pts ${buy ? 'above' : 'below'} ${lvlName} ${level} (${awaySteps.toFixed(1)}× the stop distance), so it has not reached the level and is not close`);
  if (!early) reasons.push(`it is past 10:30 (${hhmm})`);
  if (sqNames.length) reasons.push(`${sqNames.join(' + ')}${buy ? ' short covering' : ' long unwinding'} is active — that flow pushes price away from ${lvlName}`);
  else if (!plausible) reasons.push(`live signals give only ${pLevel}% for reaching ${lvlName}`);
  if (hist)
    why.push(
      hist.reached
        ? `Candles today: ${lvlName} ${lvlFmt} WAS touched at ${hist.first}${hist.last !== hist.first ? ` (last at ${hist.last})` : ''} (${buy ? 'low ' : 'high '}${fmtN(hist.extreme)}), and price has since moved ${pts(hist.back)} pts away. The planned entry has already been available once.`
        : `Candles today: ${lvlName} ${lvlFmt} has NOT been reached yet (the day ${buy ? 'low' : 'high'} so far is ${fmtN(hist.extreme)}, ${pts(hist.gap)} pts short of it).`,
    );
  else why.push(`Candles for today are not loaded, so it is unknown whether ${lvlName} was touched earlier.`);
  if (pLevel != null) why.push(`Level Probability (live signals) for ${hist && hist.reached ? 'price coming back to ' : 'reaching '}${lvlName} today: ${pLevel}%.`);
  d.levelState = hist ? (hist.reached ? 'TOUCHED_LEFT' : 'NOT_REACHED') : 'UNKNOWN';
  why.push(`Not waiting for ${lvlName} because: ${reasons.join('; ')}.`);

  // 4. is the bias confirmed enough to enter anyway?
  const sigOk = buy ? sig === 'BUY' || sig === 'STRONG BUY' : sig === 'SELL' || sig === 'STRONG SELL';
  const futOk = buy ? fut50 > 0 : fut50 < 0;
  const futBankOk = buy ? futBank >= 0 : futBank <= 0;
  const dz = i.deadZone;
  const confirmed = sigOk && futOk && futBankOk && tallyPct >= DEC_MIN_TALLY && !dz;
  const miss: string[] = [];
  if (!sigOk) miss.push(`composite signal is ${sig || 'unavailable'} (${sc}), not ${WORD}`);
  const fmt = (rem: string | undefined, s: number, at?: string): string => `${rem ? String(rem).toLowerCase().replace(/_/g, ' ') : 'no remark'}, ${s > 0 ? 'bullish' : s < 0 ? 'bearish' : 'neutral'} (${s > 0 ? '+1' : s < 0 ? '-1' : '0'})${at ? `, read at ${at}` : ''}`;
  if (!futOk) miss.push(`${lbl} futures read ${fmt(remark, fut50, i.remarkAt)}, a ${word} needs ${buy ? 'bullish' : 'bearish'}`);
  if (!futBankOk) miss.push(`${plbl} futures read ${fmt(i.partnerRemark, futBank, i.partnerRemarkAt)}, which is against a ${word}`);
  if (tallyPct < DEC_MIN_TALLY) miss.push(`only ${tallyConf}/${tallyTotal} checks agree`);
  if (dz) miss.push(`${lbl} is in a dead zone`);
  if (!confirmed) {
    d.action = 'SKIP';
    d.title =
      hist && hist.reached
        ? `NO ${WORD} NOW — ${lvlName} ${lvlFmt} was touched at ${hist.first} and price has moved ${pts(hist.back)} pts away (plan: ${word} only at ${lvlName})`
        : `NO ${WORD} NOW — plan is to ${word} at ${lvlName} ${lvlFmt}; price is ${pts(away)} pts ${buy ? 'above' : 'below'} it and has not reached it`;
    why.push(`Not confirmed enough to ${word} away from the level: ${miss.join('; ')}.`);
    return d;
  }

  // dip (buy) / rally (sell) level to enter on, instead of chasing
  const cands: { v: number; why: string }[] = [];
  if (i.rows && i.rows.length) {
    try {
      const w = findWalls(i.rows, i.pc, spot);
      for (const x of (buy ? w.support : w.resistance) || []) cands.push({ v: x.strike, why: `${buy ? 'S' : 'R'} wall ${x.strike} (${x.tier})` });
    } catch {
      /* no walls */
    }
  }
  const opp = i.oppositeLevel;
  if (opp) cands.push({ v: opp, why: `${buy ? 'ASO' : 'BSO'} ${opp} (broken level, now ${buy ? 'support' : 'resistance'})` });
  const vw = i.avwap;
  if (vw) cands.push({ v: vw, why: `VWAP ${vw.toFixed(0)}` });
  const reach = step * mult;
  const ok = cands.filter((c) => (buy ? c.v < spot && spot - c.v <= reach : c.v > spot && c.v - spot <= reach)).sort((a, b) => (buy ? b.v - a.v : a.v - b.v));
  if (!ok.length) {
    d.action = 'SKIP';
    d.title = `DON'T CHASE — confirmed, but no nearby ${buy ? 'support' : 'resistance'} to enter on`;
    why.push(`The bias is confirmed (${tallyConf}/${tallyTotal}, ${sig}), but there is no wall, broken level or VWAP within ${pts(reach)} pts of price to put a stop behind. Wait for one to form.`);
    return d;
  }
  const dip = ok[0]!;
  const stop = buy ? dip.v - step * 0.5 : dip.v + step * 0.5;
  d.action = 'TREND';
  d.title = `TREND ENTRY — ${word} a ${buy ? 'dip' : 'rally'} to ${fmtN(dip.v)}, not at market`;
  why.push(`Bias confirmed: signal ${sig} (${sc}), futures agree, ${tallyConf}/${tallyTotal} checks.`);
  why.push(`Enter near ${dip.why}; stop ${fmtN(stop)} (half a stop-distance beyond it). Size from that stop.`);
  const squeeze = (buy && remark === 'SHOT_COVERING') || (!buy && remark === 'LONG_UNWINDING');
  if (squeeze) why.push(`${buy ? 'Short covering' : 'Long unwinding'} is active, so much of the move may already be done — keep size modest.`);
  d.plan = { entry: dip.v, stop };
  return d;
}

/** Remembers when a trend entry was first seen, per name, side, day and snapshot time. One object per process. */
export type TrendSeen = Record<string, number>;

/** `_gtbLevelDecision`: the core decision plus the trend-entry window (valid until the later of 10:30 and 30 minutes after it was first seen). */
export function levelDecision(i: DecisionInputs, key: string, seen: TrendSeen): Decision | null {
  const d = levelDecisionCore(i);
  if (!d || d.action !== 'TREND') {
    delete seen[key];
    return d;
  }
  const now = i.nowMin;
  let s = seen[key];
  if (s == null || now < s) s = seen[key] = now;
  const until = Math.max(DEC_WAIT_UNTIL_MIN, s + DEC_TREND_WINDOW_MIN);
  const f = (m: number): string => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
  const buy = i.side === 'support';
  const WORD = buy ? 'BUY' : 'SELL';
  if (now > until) {
    d.why.push(`The ${buy ? 'dip' : 'rally'} entry was first valid at ${f(s)} and was open until ${f(until)}; that window has ended.`);
    d.action = 'SKIP';
    d.plan = null;
    d.title = `NO ${WORD} NOW — the trend-entry window ended at ${f(until)} (the ${buy ? 'dip' : 'rally'} did not come)`;
  } else {
    d.why.push(`Entry window: first valid at ${f(s)}, open until ${f(until)} (later of 10:30 and ${DEC_TREND_WINDOW_MIN} minutes after first valid).`);
    if (d.plan) d.plan.validUntil = f(until);
  }
  return d;
}
