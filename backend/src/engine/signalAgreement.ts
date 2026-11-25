/**
 * Signal agreement and entry timing: faithful ports of `_ossSuggestedKey`, `_ossDirPick`, `_ossAgreement`, `_ossTimingFor` and `_ossTimingRangeChecks`
 * (optionStrikeSearch.js), NSE branch. The suggested strategy follows the Final Verdict; the agreement is a tally of independent signals pointing the same way as
 * the strategy; the timing is a checklist of "is now a good moment". Tallies and checklists, not probabilities of profit; none is back-tested.
 * Not ported: the Positional Screener vote and swing-timing check (need the daily scan), and the Detail View prediction used for single stocks (the instrument
 * score is used for them, which is the userscript's own fallback).
 */

export const OSS_LOW_VIX = 13;

export type StrategyKey = 'longce' | 'longpe' | 'bullcall' | 'bearput' | 'bullput' | 'bearcall' | 'condor' | 'ironfly' | 'shortstraddle' | 'shortstrangle' | 'longstraddle' | 'longstrangle' | 'reference';

/** the "view" of each strategy (`_OSS_STRATEGIES[].view`) */
export const STRATEGY_VIEW: Record<StrategyKey, string> = {
  reference: 'Reference',
  longce: 'Bullish',
  longpe: 'Bearish',
  bullcall: 'Bullish',
  bearput: 'Bearish',
  bullput: 'Mildly bullish',
  bearcall: 'Mildly bearish',
  shortstraddle: 'Range-bound',
  shortstrangle: 'Range-bound',
  ironfly: 'Range-bound',
  condor: 'Range-bound',
  longstraddle: 'Big move, either way',
  longstrangle: 'Big move, either way',
};

/** +1 bullish, -1 bearish, 0 range / reference, null when the view is none of those (a volatility strategy). */
export function wantOf(view: string): 1 | -1 | 0 | null {
  return /Bullish|Mildly bullish/.test(view) ? 1 : /Bearish|Mildly bearish/.test(view) ? -1 : /Range-bound|Reference/.test(view) ? 0 : null;
}

const sg = (x: number): 1 | -1 | 0 => (x > 0 ? 1 : x < 0 ? -1 : 0);

export interface Suggestion {
  key: StrategyKey | null;
  why: string;
}

export interface SuggestInputs {
  /** NIFTY 50 / NIFTY BANK / SENSEX follow the Final Verdict; every other name follows its instrument score */
  isIndex: boolean;
  skipMarketGate?: boolean;
  marketSignal: { signal?: string; reason?: string } | null;
  finalVerdict: { call: string; dir: number; headline: string; conf: string | null; entryBlocked?: boolean } | null;
  scoreTotal: number | null;
  /** India VIX last price (0 when unknown) */
  indiaVix: number;
}

/** `_ossDirPick`: a debit spread, or a plain long call / put when conviction is HIGH and India VIX is low (options are cheap). */
export function dirPick(bull: boolean, highConf: boolean, baseWhy: string, vix: number): Suggestion {
  if (highConf && vix > 0 && vix < OSS_LOW_VIX)
    return { key: bull ? 'longce' : 'longpe', why: `${baseWhy} High conviction and India VIX ${vix.toFixed(1)} (< ${OSS_LOW_VIX}, options cheap) → a plain Long ${bull ? 'Call' : 'Put'} keeps the full upside; risk is the premium paid.` };
  return { key: bull ? 'bullcall' : 'bearput', why: `${baseWhy} → a defined-risk ${bull ? 'bullish' : 'bearish'} debit spread.` };
}

/** `_ossSuggestedKey`. Null when nothing can be read. */
export function suggestedKey(i: SuggestInputs): Suggestion | null {
  const ms0 = i.marketSignal;
  if (!i.skipMarketGate && ms0 && ms0.signal && ((/WAIT/i.test(ms0.signal) && /conflict/i.test(ms0.reason || '')) || /NO TRADE/i.test(ms0.signal)))
    return { key: null, why: `Market verdict: ${ms0.signal} — ${ms0.reason || 'conflicting signals'}. No strategy suggested until the signals line up; pick one manually if you disagree.` };
  if (!i.isIndex) {
    const t = i.scoreTotal;
    if (t === null) return null;
    const tx = `Instrument score ${t > 0 ? '+' : ''}${t.toFixed(1)}`;
    if (t >= 1) return { key: 'bullcall', why: `${tx} (bullish) → a defined-risk bullish debit spread.` };
    if (t <= -1) return { key: 'bearput', why: `${tx} (bearish) → a defined-risk bearish debit spread.` };
    return { key: 'condor', why: `${tx} (no clear direction) → a defined-risk range strategy.` };
  }
  const v = i.finalVerdict;
  if (!v) return null;
  if (/dead zone/i.test(v.headline || '')) return { key: 'condor', why: `Final Verdict: ${v.headline} → price is expected to chop inside a band, so a defined-risk range strategy (Iron Condor) fits. Keep the short strikes outside the dead-zone band.` };
  if (/market guard/i.test(v.headline || '')) return { key: null, why: `The verdict is "${v.headline}" — no strategy suggested.` };
  const long = v.dir > 0;
  const short = v.dir < 0;
  if (v.call === 'LONG') return dirPick(true, v.conf === 'HIGH', `Final Verdict: ${v.headline}.`, i.indiaVix);
  if (v.call === 'SHORT') return dirPick(false, v.conf === 'HIGH', `Final Verdict: ${v.headline}.`, i.indiaVix);
  if (v.call === 'NO TRADE' && (long || short) && (v.entryBlocked || /only at|not confirmed|unlikely|no nearby|to enter on/i.test(v.headline || '')))
    return { key: long ? 'bullcall' : 'bearput', why: `Final Verdict: ${v.headline} → direction is ${long ? 'LONG' : 'SHORT'} but the entry level is not met; a defined-risk ${long ? 'bullish' : 'bearish'} spread fits only if you take the trade at the level.` };
  if (v.call === 'WAIT' && (long || short)) return { key: long ? 'bullcall' : 'bearput', why: `Final Verdict: ${v.headline} → prepare the spread, enter only when it turns to a call.` };
  return { key: 'condor', why: `Final Verdict: ${v.headline} → no directional edge; a defined-risk range strategy fits better than a directional one.` };
}

export interface Vote {
  label: string;
  v: number;
}

export interface Agreement {
  agree: number;
  total: number;
  pct: number;
  votes: Vote[];
  want: number;
  label: 'FAVOURABLE' | 'MIXED' | 'UNFAVOURABLE';
}

export interface AgreementInputs {
  want: number;
  /** the four parts of the instrument score (null when it could not be computed) */
  parts: { nine_fifteen: number; current_trend: number; futures_trend: number; oi_obv: number } | null;
  marketSignal: { signal?: string } | null;
  finalVerdict: { call: string; dir: number } | null;
}

/** `_ossAgreement`: how many independent signals point the same way as the strategy. Null when fewer than 3 signals are loaded. */
export function agreement(i: AgreementInputs): Agreement | null {
  const votes: Vote[] = [];
  const add = (label: string, v: number | null | undefined): void => {
    if (v !== null && v !== undefined && Number.isFinite(v)) votes.push({ label, v });
  };
  if (i.parts) {
    add('9:15 candle', sg(i.parts.nine_fifteen));
    add('Current trend', sg(i.parts.current_trend));
    add('Futures', sg(i.parts.futures_trend));
    add('OI/OBV', sg(i.parts.oi_obv));
  }
  if (i.marketSignal && i.marketSignal.signal) add('Market verdict', /BUY/.test(i.marketSignal.signal) ? 1 : /SELL/.test(i.marketSignal.signal) ? -1 : 0);
  if (i.finalVerdict) add('Final Verdict', i.finalVerdict.call === 'LONG' ? 1 : i.finalVerdict.call === 'SHORT' ? -1 : i.finalVerdict.dir ? sg(i.finalVerdict.dir) : 0);
  if (votes.length < 3) return null;
  const agree = votes.filter((x) => x.v === i.want).length;
  const pct = Math.round((agree / votes.length) * 100);
  return { agree, total: votes.length, pct, votes, want: i.want, label: pct >= 65 ? 'FAVOURABLE' : pct >= 45 ? 'MIXED' : 'UNFAVOURABLE' };
}

export interface TimingInputs {
  /** +1 bullish, -1 bearish, 0 range */
  want: number;
  stratKey?: string | null;
  /** days to expiry (null when unknown) */
  dte: number | null;
  /** the price trend: last price, open, ASO / AST of the 9:15 levels, expected one-day VIX range */
  trend: { ltp: number; open: number; aso: number; ast: number; vixRange: number } | null;
  futuresTrend?: number | null;
  futuresRemark?: string;
  /** futures VWAP */
  avwap?: number | null;
  levelProb: { ok: boolean; pASO: number | null; pBSO: number | null } | null;
  /** the dead zone band while active */
  deadZone: { lo: number; hi: number } | null;
  /** minutes since midnight (IST) */
  nowMin: number;
}

export interface TimingCheck {
  label: string;
  s: number;
  why: string;
}

export interface Timing {
  pct: number;
  label: string;
  n: number;
  bad: number;
  checks: TimingCheck[];
}

/** `_ossTimingRangeChecks`: range strategies want a quiet market. */
function rangeChecks(i: TimingInputs, add: (label: string, s: number, why: string) => void): void {
  const tr = i.trend;
  const ltp = tr ? tr.ltp : NaN;
  const open = tr ? tr.open : NaN;
  if (tr && ltp && open) {
    const s1 = tr.aso - open;
    if (s1 > 0) {
      const off = Math.abs(ltp - open) / s1;
      add('Inside 9:15 band', off < 0.6 ? 1 : off < 1 ? 0 : -1, off < 0.6 ? 'Price is well inside the 9:15 ASO/BSO band, the quiet zone a range strategy wants.' : off < 1 ? `Price is near the edge of the 9:15 band (${Math.round(off * 100)}% of the way to ${ltp > open ? 'ASO' : 'BSO'}).` : 'Price is already outside the 9:15 ASO/BSO band, so the range is breaking.');
    }
    const rng = tr.vixRange;
    if (rng > 0) {
      const used = Math.abs(ltp - open) / rng;
      add('Day range', used < 0.4 ? 1 : used < 0.8 ? 0 : -1, used < 0.4 ? `Only ${Math.round(used * 100)}% of the expected day range is used: the market is quiet.` : used < 0.8 ? `${Math.round(used * 100)}% of the expected day range is used.` : `The expected day range is already ${Math.round(used * 100)}% used: not a quiet market.`);
    }
  }
  if (i.futuresTrend !== undefined && i.futuresTrend !== null) {
    const f = sg(i.futuresTrend);
    add('Flow flat', f === 0 ? 1 : -1, f === 0 ? 'Futures flow is flat right now, which suits a range.' : `Futures flow is clearly ${f > 0 ? 'bullish' : 'bearish'}: a directional day is not a range day.`);
  }
  const rem = i.futuresRemark || '';
  if (rem) {
    const sq = rem === 'SHOT_COVERING' || rem === 'LONG_UNWINDING';
    add('No squeeze', sq ? -1 : 1, sq ? `A ${rem === 'SHOT_COVERING' ? 'short covering' : 'long unwinding'} squeeze is active: fast one-way moves hurt range sellers.` : 'No squeeze is active.');
  }
  if (i.avwap && ltp) {
    const rg = tr && tr.vixRange;
    const dist = Math.abs(ltp - i.avwap);
    const rel = rg && rg > 0 ? dist / rg : null;
    if (rel != null) add('Near VWAP', rel < 0.15 ? 1 : rel < 0.3 ? 0 : -1, rel < 0.15 ? 'Price is hugging futures VWAP.' : rel < 0.3 ? 'Price is a little away from futures VWAP.' : 'Price has moved well away from futures VWAP.');
  }
  const lp = i.levelProb;
  if (lp && lp.ok) {
    const hi = Math.max(lp.pASO!, lp.pBSO!);
    add('Level prob', hi < 35 ? 1 : hi < 50 ? 0 : -1, `Live-signal likelihood of reaching ASO is ${lp.pASO}% and BSO ${lp.pBSO}%${hi < 35 ? ': both unlikely.' : hi < 50 ? '.' : ': one side is likely, so the range may break.'}`);
  }
  if (i.deadZone) add('Dead zone', 1, `Signals are too weak for a trend: price is expected to chop between ${i.deadZone.lo} and ${i.deadZone.hi}.`);
  const tm = i.nowMin;
  add('Time of day', tm < 9 * 60 + 25 ? -1 : tm <= 13 * 60 + 30 ? 1 : tm <= 14 * 60 + 45 ? 0 : -1, tm < 9 * 60 + 25 ? 'Before 9:25 the opening candle has not settled.' : tm <= 13 * 60 + 30 ? 'Mid-session: the market has settled and there is time for decay to work.' : tm <= 14 * 60 + 45 ? 'Late session: little time left to collect premium.' : 'Last 45 minutes: a poor time to open a new position.');
  const dte = i.dte;
  if (dte != null) add('Expiry', dte <= 1 ? -1 : dte <= 7 ? 1 : 0, dte <= 1 ? 'Expiry is today or tomorrow: gamma risk is high, a small move can hurt a range position.' : dte <= 7 ? `${dte} days to expiry: decay works for a seller and there is room to adjust.` : `${dte} days to expiry: decay is slow, so the premium comes in slowly.`);
}

/** `_ossTimingFor`: is now a good moment to take the trade? Null with fewer than 4 checks. */
export function timing(i: TimingInputs): Timing | null {
  const checks: TimingCheck[] = [];
  const add = (label: string, s: number, why: string): void => void checks.push({ label, s, why });
  const want = i.want;
  const tr = i.trend;
  if (want === 0) rangeChecks(i, add);
  else {
    if (tr) {
      const ltp = tr.ltp;
      const open = tr.open;
      const s1 = tr.aso - open;
      const s2 = tr.ast - tr.aso;
      const d = want * (ltp - open);
      const near = want > 0 ? 'ASO' : 'BSO';
      const far = want > 0 ? 'AST' : 'BST';
      if (s1 > 0) {
        if (d <= -(s1 + s2)) add('Level', -1, 'Price is beyond the opposite 9:15 stop level, so the setup has failed.');
        else if (d <= -s1) add('Level', 0, 'Price is past the opposite 9:15 level, so the thesis is weakened.');
        else if (d <= 1.3 * s1) add('Level', 1, `Price is still near its entry zone (before or at ${near}), with room to run.`);
        else if (d <= s1 + s2) add('Level', 0, `Price is between ${near} and ${far}: the move is under way, not at the entry level.`);
        else add('Level', -1, `Price is already beyond ${far}: this is chasing an extended move.`);
      }
      const rng = tr.vixRange;
      if (rng > 0) {
        const used = d / rng;
        add('Day range', used >= 1 ? -1 : used < 0.5 ? 1 : 0, used >= 1 ? 'Price has already used the expected VIX range for the day in this direction.' : used < 0.5 ? 'Less than half of the expected day range is used in this direction.' : `About ${Math.round(used * 100)}% of the expected day range is used.`);
      }
    }
    if (i.futuresTrend !== undefined && i.futuresTrend !== null) {
      const f = sg(i.futuresTrend);
      add('Futures', f === want ? 1 : f === 0 ? 0 : -1, f === want ? 'Futures flow agrees with the direction right now.' : f === 0 ? 'Futures flow is flat right now.' : 'Futures flow is against the direction right now (short-term): wait for it to turn.');
    }
    if (i.avwap && tr) {
      const side = sg(want * (tr.ltp - i.avwap));
      add('VWAP', side > 0 ? 1 : -1, side > 0 ? 'Price is on the right side of futures VWAP.' : 'Price is on the wrong side of futures VWAP.');
    }
    const lp = i.levelProb;
    if (lp && lp.ok) {
      const pr = (want > 0 ? lp.pASO : lp.pBSO) as number;
      add('Level prob', pr >= 50 ? 1 : pr < 30 ? -1 : 0, `Live-signal likelihood of reaching ${want > 0 ? 'ASO' : 'BSO'} is ${pr}%.`);
    }
    const tm = i.nowMin;
    add('Time of day', tm < 9 * 60 + 25 ? -1 : tm <= 14 * 60 ? 1 : tm <= 14 * 60 + 45 ? 0 : -1, tm < 9 * 60 + 25 ? 'Before 9:25 the opening candle has not settled.' : tm <= 14 * 60 ? 'Mid-session: enough time for the move.' : tm <= 14 * 60 + 45 ? 'Late session: little time left for the move.' : 'Last 45 minutes: a poor time to open a new position.');
    if (/^(longce|longpe|bullcall|bearput)$/.test(i.stratKey || '') && i.dte != null) {
      const dte = i.dte;
      add('Expiry', dte <= 2 ? -1 : dte <= 5 ? 0 : 1, dte <= 2 ? `Only ${dte} day(s) to expiry: time decay works hard against a debit position.` : dte <= 5 ? `${dte} days to expiry: decay is noticeable.` : `${dte} days to expiry: enough time for the move.`);
    }
  }
  if (checks.length < 4) return null;
  const good = checks.filter((c) => c.s > 0).length;
  const neu = checks.filter((c) => c.s === 0).length;
  const pct = Math.round(((good + 0.5 * neu) / checks.length) * 100);
  const bad = checks.filter((c) => c.s < 0);
  const label = pct >= 70 ? 'GOOD TIME TO ENTER' : pct >= 50 ? 'ACCEPTABLE, enter with care' : pct >= 35 ? 'WAIT for a better entry' : 'POOR TIMING, do not chase';
  return { pct, label, n: checks.length, bad: bad.length, checks };
}
