/**
 * The Final Verdict: a faithful port of `_gtbFinalVerdictCore` and the public wrapper `_gtbFinalVerdict` (grootTradeBot.js).
 * Direction comes from the Master Consensus (independent signal groups); the entry method comes from today's 9:15 plan and the Level Decision of the
 * side that matches the direction. Order: market guard, dead zone, no clear direction, no 9:15 plan, plan vs direction, the Level Decision.
 * Heuristic, not back-tested. Everything the browser read from globals is passed in.
 */
import type { Decision } from './levelDecision.js';
import { deadZoneText } from './deadZone.js';

export const FV_HIGH_NET = 0.5;
export const FV_HIGH_GROUPS = 4;
export const FV_MED_NET = 0.3;
export const FV_MED_GROUPS = 3;
export const DZ_BUFFER_PCT = 0.05;

export interface FvConsensus {
  outcome: string;
  net: number;
  agree: number;
  voting: number;
  thin: boolean;
  dzConflict: boolean;
  /** the dead zone band while active */
  deadZone: { lo: number; hi: number; loName: string; hiName: string } | null;
  /** the band with `broken` set once a completed candle closed outside it */
  deadZoneBroken: { lo: number; hi: number; broken?: { dir: 'up' | 'down'; at: string } | null } | null;
}

export interface FinalVerdict {
  call: string;
  headline: string;
  action: string;
  conf: string | null;
  why: string[];
  warn: string[];
  consensus: FvConsensus;
  dir: number;
  entryBlocked?: boolean;
}

export interface FvInputs {
  name: string;
  /** consensus of the index and of its partner (NIFTY 50 <-> NIFTY BANK) */
  consensus: FvConsensus;
  partner: FvConsensus;
  /** the dashboard market signal and score; signal null when not available */
  signal: { signal?: string; reason?: string } | null;
  score: number | null;
  /** today's 9:15 plan (outcome Buy / Sell / Buy/Sell / Sideways and its level text); null when not scanned */
  strat: { outcome: string; level: string } | null;
  /** the Level Decision for the side that matches the direction; called with 'support' (buy) or 'resistance' (sell) */
  decisionFor: (side: 'support' | 'resistance') => Decision | null;
  /** last price and this index's 9:15 ASO / BSO (for the distance text); null when unknown */
  spot: number | null;
  aso: number | null;
  bso: number | null;
  /** short-covering / long-unwinding heads-up text for the direction, when one applies */
  squeezeHeadsUp: (dir: number) => string | null;
  /** whether the Level Decision for the wanted side is available before the counter-plan check (NIFTY 50 builds it first) */
  ensureDecision?: (side: 'support' | 'resistance') => void;
}

const nF = (x: number): string => (x >= 0 ? '+' : '') + x.toFixed(2);
const CONF = ['', 'LOW', 'MEDIUM', 'HIGH'];

export function finalVerdictCore(i: FvInputs): FinalVerdict {
  const nm = i.name || 'NIFTY 50';
  const plbl = nm === 'NIFTY 50' ? 'BANK' : 'NIFTY';
  const cn = i.consensus;
  const cb = i.partner;
  const dirOf = (c: FvConsensus): number => (c.outcome === 'GO LONG' ? 1 : c.outcome === 'GO SHORT' ? -1 : 0);
  const dN = dirOf(cn);
  const dB = dirOf(cb);
  const ms = i.signal;
  const strat = i.strat;
  const plan = strat ? strat.outcome : null;
  const planSides: ('support' | 'resistance')[] = plan === 'Buy' ? ['support'] : plan === 'Sell' ? ['resistance'] : plan === 'Buy/Sell' ? ['support', 'resistance'] : [];
  const out: FinalVerdict = { call: 'NO TRADE', headline: '', action: '', conf: null, why: [], warn: [], consensus: cn, dir: dN };

  if (cn.deadZoneBroken && cn.deadZoneBroken.broken) {
    const dzb = cn.deadZoneBroken;
    out.warn.push(`Dead zone released: a 5-minute candle closed ${dzb.broken!.dir === 'up' ? 'above ' + Math.round(dzb.hi) : 'below ' + Math.round(dzb.lo)} at ${dzb.broken!.at}, so the WAIT for a dead zone no longer applies.`);
  }
  const line =
    `Consensus (${nm}): ${cn.outcome} — net ${nF(cn.net)}, ${cn.agree} of ${cn.voting} independent signal groups agree` +
    (cn.dzConflict ? ' ⚠ the dead zone says no conviction while the groups agree strongly: the dead zone wins until a candle closes outside it' : '') +
    (cn.thin ? ' (thin)' : cn.voting <= 2 ? ` (low sample: only ${cn.voting} groups voting)` : '') +
    '.';

  // 1. market guard
  if (ms && ms.signal === 'NO TRADE') {
    out.call = 'NO TRADE';
    out.headline = 'NO TRADE — market guard';
    out.action = ms.reason || 'The VIX range guard is on.';
    out.why.push(line);
    out.why.push('While the guard is on, direction and entry rules are not used.');
    return out;
  }
  // 2. dead zone
  if (cn.deadZone) {
    out.call = 'WAIT';
    out.headline = `WAIT — ${nm === 'NIFTY 50' ? 'NIFTY' : nm} is in a dead zone`;
    out.action =
      `Signals are too weak to commit. ${deadZoneText(nm, cn.deadZone, i.spot)}. The call stays WAIT until a 5-minute candle closes beyond either edge by more than ${DZ_BUFFER_PCT}% of price.` +
      (dN !== 0 ? ` Consensus leans ${dN > 0 ? 'LONG' : 'SHORT'} (net ${nF(cn.net)}, ${cn.agree} of ${cn.voting} signal groups agree${cn.thin ? ', thin' : ''}), but the signals are too weak to act on.` : '');
    out.why.push(line);
    return out;
  }
  // 3. no clear direction
  if (dN === 0) {
    out.call = cn.voting === 0 ? 'WAIT' : 'NO TRADE';
    out.headline = cn.voting === 0 ? 'WAIT — not enough data yet' : 'NO TRADE — no clear direction';
    out.action = cn.voting === 0 ? 'Run a full refresh so the engines have data.' : 'The engines are split or flat. ' + (planSides.length ? `The 9:15 plan is ${plan} (${strat!.level}), but nothing confirms it yet.` : 'Treat it as a range day.');
    out.why.push(line);
    return out;
  }
  const word = dN > 0 ? 'LONG' : 'SHORT';
  const verb = dN > 0 ? 'buy' : 'sell';
  const VERB = dN > 0 ? 'BUY' : 'SELL';
  const wantSide: 'support' | 'resistance' = dN > 0 ? 'support' : 'resistance';

  // confidence from agreement, one level lower if the partner index points the other way
  let rank = Math.abs(cn.net) >= FV_HIGH_NET && cn.voting >= FV_HIGH_GROUPS && !cn.thin ? 3 : Math.abs(cn.net) >= FV_MED_NET && cn.voting >= FV_MED_GROUPS && !cn.thin ? 2 : 1;
  if (dB !== 0 && dB !== dN) {
    rank = Math.max(1, rank - 1);
    out.warn.push(`${plbl} consensus is ${cb.outcome} — the two indices disagree.`);
  }
  const addHeadsUp = (): void => {
    const hu = i.squeezeHeadsUp(dN);
    if (hu) out.warn.push(`Heads-up: ${hu} A squeeze is a flow event, not a trend call on its own — if the composite signal reaches ${VERB} and NIFTY futures agree, the trend-entry rule would then apply.`);
  };

  // 4. no 9:15 level plan today
  if (!planSides.length) {
    const sigNow = ms && ms.signal;
    const sigAgainst = dN > 0 ? sigNow === 'SELL' || sigNow === 'STRONG SELL' : sigNow === 'BUY' || sigNow === 'STRONG BUY';
    if (rank >= 2 && sigAgainst) {
      out.call = 'NO TRADE';
      out.headline = 'NO TRADE — composite signal points the other way';
      out.action = `The consensus leans ${word} (${cn.outcome}) but the dashboard composite signal is ${sigNow} (score ${i.score != null && Number.isFinite(i.score) ? i.score.toFixed(1) : '—'}), and there is no 9:15 level plan to decide between them. Wait until they agree.`;
      out.conf = null;
    } else if (rank >= 2) {
      out.call = word;
      out.headline = `LEAN ${word} — no 9:15 entry level today`;
      out.action = `The 9:15 combo gives no level plan (${strat ? plan : 'not scanned'}). Only ${verb} a pullback to nearby ${dN > 0 ? 'support' : 'resistance'}, small size — do not chase.`;
      out.conf = CONF[rank - 1 || 1]!;
      out.warn.push(`Confidence is shown one level below the consensus rank (${CONF[rank]} → ${out.conf}) because there is no 9:15 level to enter on.`);
    } else {
      out.call = 'NO TRADE';
      out.headline = 'NO TRADE — range day, weak lean';
      addHeadsUp();
      out.action = `The 9:15 combo gives no entry level and the consensus lean (${cn.outcome}) is not strong enough on its own.`;
      out.conf = null;
    }
    out.why.push(line);
    return out;
  }
  // 5. does the plan have a side that matches the direction?
  let counterPlan = false;
  if (planSides.indexOf(wantSide) === -1) {
    let planGap = '';
    const lvlN = planSides[0] === 'resistance' ? i.aso : i.bso;
    if (i.spot && lvlN) planGap = ` ${nm === 'NIFTY 50' ? 'NIFTY' : nm} ${Math.round(i.spot)} is ${Math.round(Math.abs(lvlN - i.spot))} pts from ${planSides[0] === 'resistance' ? 'ASO' : 'BSO'} ${Math.round(lvlN)}.`;
    if (rank >= 2) {
      i.ensureDecision?.(wantSide);
      if (i.decisionFor(wantSide)) {
        counterPlan = true;
        out.warn.push(`The 9:15 plan is ${plan} (${strat!.level}) but the consensus is ${cn.outcome} (${CONF[rank]} confidence), so that level may never be reached.${planGap} The ${word} is judged on its own level and the trend-entry rules instead.`);
      }
    }
    if (!counterPlan) {
      out.call = 'NO TRADE';
      out.headline = 'NO TRADE — plan and consensus disagree';
      out.action = `The 9:15 plan is ${plan} (${strat!.level}), but the consensus says ${cn.outcome}${rank < 2 ? ' with only LOW confidence' : ''}. Stay out until they agree.${planGap}`;
      out.why.push(line);
      return out;
    }
  }
  // 6. the Level Decision of the matching side
  const dec = i.decisionFor(wantSide);
  out.why.push(line);
  if (!dec) {
    out.call = word;
    out.headline = `LEAN ${word} — plan: ${plan}`;
    out.action = `Level Decision not available yet; follow the 9:15 plan (${strat!.level}).`;
    out.conf = CONF[rank]!;
    return out;
  }
  out.why.push(
    (counterPlan ? `Counter-plan (${word} vs 9:15 ${plan}) — ` : `9:15 plan: ${plan} (${strat!.level}) — `) +
      (counterPlan ? dec.title.replace(/plan is to (buy|sell) at ([A-Z]+ [\d,]+)/, `a $1 would be at $2 (the 9:15 plan is ${plan})`) : dec.title) +
      '.',
  );
  dec.why.slice(0, 2).forEach((x) => out.why.push(x));
  if (dec.action === 'SKIP') {
    out.call = 'NO TRADE';
    out.entryBlocked = true;
    let dt = dec.title.replace(/^(DON'T (BUY|SELL|CHASE)|NO (BUY|SELL) NOW)\s*—\s*/, '');
    if (counterPlan) dt = dt.replace(/plan is to (buy|sell) at ([A-Z]+ [\d,]+)/, `a $1 would be at $2 (the 9:15 plan is ${plan})`);
    out.headline = `NO TRADE — ${dt}`;
    out.action = `The direction (${word}) is clear, but the entry is not: ${dec.why[dec.why.length - 1]}`;
    addHeadsUp();
    return out;
  }
  out.call = word;
  out.conf = CONF[rank]!;
  if (dec.action === 'AT_LEVEL' && dec.atMiss && dec.atMiss.length) {
    rank = Math.max(1, rank - 1);
    out.conf = CONF[rank]!;
    out.warn.push(`The entry level is live but not fully confirmed: ${dec.atMiss.join('; ')}. Confidence is one level lower.`);
  }
  if (dec.action === 'AT_LEVEL') {
    out.headline = `${word} NOW — ${verb} at ${dN > 0 ? 'BSO' : 'ASO'} ${dec.level}`;
    out.action = dec.why[0]!;
  } else if (dec.action === 'TREND') {
    out.headline = `${word} — ${verb} the ${dN > 0 ? 'dip' : 'rally'}, not at market`;
    out.action = dec.title.replace(/^TREND ENTRY — /, '') + (dec.plan && dec.plan.validUntil ? `. Entry valid until ${dec.plan.validUntil}.` : '');
  } else {
    out.call = 'WAIT';
    out.headline = `${word} bias — WAIT for ${dN > 0 ? 'BSO' : 'ASO'} ${dec.level}`;
    out.action = `Then ${verb}. ${dec.why[1]}`;
  }
  if (out.call === 'WAIT') addHeadsUp();
  return out;
}

export interface LiveContextRead {
  status: 'VALID' | 'WEAKENING' | 'STALE' | string;
  against: number;
  agree: number;
}

/**
 * `_gtbFinalVerdict`'s Live Context step: a LONG / SHORT whose morning view price has turned against (STALE) becomes WAIT, a WEAKENING one keeps the call and
 * loses one confidence level. The expiry-day caution is added by the caller (it needs the option chain).
 */
export function applyLiveContext(v: FinalVerdict, lx: LiveContextRead | null): FinalVerdict {
  if ((v.call === 'LONG' || v.call === 'SHORT') && v.dir && lx) {
    if (lx.status === 'STALE') {
      const was = v.headline;
      const w = v.call;
      v.call = 'WAIT';
      v.conf = null;
      v.headline = `WAIT — ${w} signals, but price is moving against it`;
      v.action = `Live Context is STALE for this ${w}: ${lx.against} price checks are against it and ${lx.agree} agree. Before this check the call was "${was}". Wait for price to confirm the ${w} again.`;
      v.warn.push(`Live Context turned this ${w} into WAIT (see the Live Context card for the checks).`);
    } else if (lx.status === 'WEAKENING' && v.conf) {
      const order = ['LOW', 'MEDIUM', 'HIGH'];
      const ix = order.indexOf(v.conf);
      if (ix > 0) {
        v.conf = order[ix - 1]!;
        v.warn.push(`Live Context is WEAKENING for this ${v.call} (${lx.against} price checks against, ${lx.agree} for), so confidence is one level lower.`);
      }
    }
  }
  return v;
}
