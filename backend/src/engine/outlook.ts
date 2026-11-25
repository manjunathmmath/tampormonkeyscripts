/**
 * Strong support and resistance zones and the Probable trade: faithful ports of `_gtbSrLevels`, `_gtbOutlook` and the plan-hold rule `_gtbOlStabilise`
 * (grootTradeBot.js), NSE branch. Level sources already computed elsewhere are stacked and merged into zones; the plan takes entry, stop and targets from them.
 * Rules of thumb, not back-tested; nothing places an order.
 */
import { computeMaxPainGEX, findWalls, wallErosion, type OiRow } from './oi.js';
import { marketProfile } from './verdict.js';

export const SR_TOL = 0.12;
export const OL_NEAR_PCT = 0.15;
export const OL_STOP_BUF_PCT = 0.12;
export const OL_MIN_STRENGTH = 2;
export const OL_HOLD_MIN = 4;
export const OL_HOLD_TOL_PCT = 0.15;
export const FV_HIGH_NET = 0.5;
export const FV_HIGH_GROUPS = 4;
export const FV_MED_NET = 0.3;
export const FV_MED_GROUPS = 3;

export interface SrItem {
  price: number;
  src: string;
  w: number;
  note: string;
}

export interface Zone {
  items: SrItem[];
  loP: number;
  hiP: number;
  strength: number;
  price: number;
  n: number;
  hasWall: boolean;
  dist: number;
}

export interface SrInputs {
  spot: number;
  /** change vs the previous close in percent */
  pc: number;
  rows: OiRow[] | null;
  /** the 9:15 levels from the day open */
  strike: { aso: number; ast: number; bso: number; bst: number } | null;
  candles: readonly (readonly (string | number | undefined)[])[] | null;
  prev: { hi: number; lo: number; cl: number } | null;
}

export interface SrResult {
  spot: number;
  zones: Zone[];
}

/** `_gtbSrLevels`: OI walls (weight 3 primary / 2 secondary, halved when eroding), max pain and the 9:15, profile, day and previous-day levels (weight 1) merged into zones. */
export function srLevels(i: SrInputs): SrResult | null {
  const { spot, pc } = i;
  if (!spot) return null;
  const L: SrItem[] = [];
  const add = (price: number | string | null | undefined, src: string, w: number, note = ''): void => {
    const p = parseFloat(String(price));
    if (Number.isFinite(p) && p > 0) L.push({ price: p, src, w, note });
  };
  const td = i.rows;
  if (td && td.length) {
    const walls = findWalls(td, pc, spot);
    const eroding: Record<string, number> = {};
    try {
      for (const e of wallErosion(td, walls).eroding || []) eroding[e.side + e.strike] = 1;
    } catch {
      /* no erosion read */
    }
    (walls.resistance || []).forEach((w, k) => {
      const er = !!eroding['R' + w.strike];
      add(w.strike, `OI wall R${k + 1}${er ? ' (eroding)' : ''}`, (w.tier === 'primary' ? 3 : 2) * (er ? 0.5 : 1), 'Call writing above price');
    });
    (walls.support || []).forEach((w, k) => {
      const er = !!eroding['S' + w.strike];
      add(w.strike, `OI wall S${k + 1}${er ? ' (eroding)' : ''}`, (w.tier === 'primary' ? 3 : 2) * (er ? 0.5 : 1), 'Put writing below price');
    });
    const mp = computeMaxPainGEX(td);
    if (mp && mp.maxPainK) add(mp.maxPainK, 'Max pain', 1, 'A pull level');
  }
  if (i.strike) {
    add(i.strike.aso, '9:15 ASO', 1);
    add(i.strike.ast, '9:15 AST', 1);
    add(i.strike.bso, '9:15 BSO', 1);
    add(i.strike.bst, '9:15 BST', 1);
  }
  const cs = i.candles;
  if (cs && cs.length) {
    const mpf = marketProfile(cs);
    if (mpf) {
      add(mpf.poc, 'Profile POC', 1);
      add(mpf.vah, 'Value area high', 1);
      add(mpf.val, 'Value area low', 1);
    }
    let hi = -Infinity;
    let lo = Infinity;
    for (const c of cs) {
      hi = Math.max(hi, parseFloat(String(c[2])));
      lo = Math.min(lo, parseFloat(String(c[3])));
    }
    add(hi, 'Day high', 1);
    add(lo, 'Day low', 1);
  }
  if (i.prev) {
    add(i.prev.hi, 'Prev-day high', 1);
    add(i.prev.lo, 'Prev-day low', 1);
    add(i.prev.cl, 'Prev-day close', 1);
  }
  L.sort((a, b) => a.price - b.price);
  const zones: Zone[] = [];
  const tol = (spot * SR_TOL) / 100;
  for (const x of L) {
    const z = zones[zones.length - 1];
    if (z && x.price - z.loP <= tol) {
      z.items.push(x);
      z.hiP = x.price;
    } else zones.push({ items: [x], loP: x.price, hiP: x.price, strength: 0, price: 0, n: 0, hasWall: false, dist: 0 });
  }
  for (const z of zones) {
    z.strength = z.items.reduce((a, x) => a + x.w, 0);
    z.price = z.items.reduce((a, x) => a + x.price * x.w, 0) / (z.strength || 1);
    z.n = z.items.length;
    z.hasWall = z.items.some((x) => x.src.indexOf('OI wall') === 0);
    z.dist = z.price - spot;
  }
  return { spot, zones };
}

export interface PlanZone {
  price: number;
  items?: SrItem[];
  n?: number;
  strength?: number;
  loP: number;
  hiP: number;
}

export interface Plan {
  long: boolean;
  ent: Zone;
  atLevel: boolean;
  entryPx: number;
  stop: number;
  t1: PlanZone | null;
  t2: PlanZone | null;
  risk: number;
  reward: number | null;
  rr: number | null;
  widened?: boolean;
  capped?: boolean;
  held?: { since: number; pending: { zonePx: number; due: number } | null };
  heldNote?: string;
}

export interface Hold {
  dir: number;
  zonePx: number;
  entryPx: number;
  stop: number;
  t1: PlanZone | null;
  t2: PlanZone | null;
  risk: number;
  reward: number | null;
  rr: number | null;
  ent: Zone;
  widened?: boolean;
  capped?: boolean;
  at: number;
  cand: { zonePx: number; t0: number } | null;
  pendingNote?: { zonePx: number; due: number } | null;
}

export type HoldMap = Record<string, Hold>;

export interface Outlook {
  ok: true;
  forced: boolean;
  nm: string;
  spot: number;
  dir: number;
  rank: number;
  rankNote: string;
  plan: Plan | null;
  range: { sup: Zone | null; res: Zone | null } | null;
  vix?: { lo: number; hi: number };
  strat?: { outcome: string; level: string };
}

export interface OutlookInputs {
  name: string;
  sr: SrResult;
  /** Master Consensus of the name */
  consensus: { net: number; voting: number; thin: boolean };
  forceDir?: number;
  /** Live Context status of the name in the plan direction (null when not available) */
  lx: { status: string } | null;
  /** the Final Verdict of the name (dir and conf), used to cap the confidence for the three indices */
  finalVerdict?: { dir: number; conf: string | null } | null;
  isIndex: boolean;
  /** the 5-minute candles of the day, for the average range */
  candles: readonly (readonly (string | number | undefined)[])[] | null;
  vix?: { lo: number; hi: number } | null;
  strat?: { outcome: string; level: string } | null;
  /** the plan hold: its memory, the clock, and whether it applies (not with a snapshot time or on a past day) */
  hold?: { map: HoldMap; now: number; active: boolean };
}

/** `_gtbOlStabilise`: the first plan of the day for a name and direction is held until price reaches its stop or target 1, the direction flips, or a different entry zone has shown for OL_HOLD_MIN minutes. */
export function stabilise(name: string, plan: Plan, forced: boolean, spot: number, near: number, hold: { map: HoldMap; now: number; active: boolean }): void {
  if (!hold.active) return;
  const key = `${name}|${forced ? 'f' : 'n'}`;
  const now = hold.now;
  let H = hold.map[key];
  const dir = plan.long ? 1 : -1;
  const tol = (spot * OL_HOLD_TOL_PCT) / 100;
  const zonePx = plan.ent ? plan.ent.price : plan.entryPx;
  const take = (): Hold => ({ dir, zonePx, entryPx: plan.entryPx, stop: plan.stop, t1: plan.t1, t2: plan.t2, risk: plan.risk, reward: plan.reward, rr: plan.rr, ent: plan.ent, widened: plan.widened, capped: plan.capped, at: now, cand: null });
  let why = '';
  if (H) {
    if (H.dir !== dir) why = 'the direction changed';
    else if (dir > 0 ? spot <= H.stop : spot >= H.stop) why = 'price reached the stop of the previous plan';
    else if (H.t1 && (dir > 0 ? spot >= H.t1.price : spot <= H.t1.price)) why = 'price reached target 1 of the previous plan';
  }
  if (!H || why) {
    hold.map[key] = H = take();
    if (why) plan.heldNote = `New plan: ${why}.`;
    plan.held = { since: now, pending: null };
    return;
  }
  if (Math.abs(zonePx - H.zonePx) > tol) {
    let c = H.cand;
    if (!c || Math.abs(c.zonePx - zonePx) > tol) H.cand = c = { zonePx, t0: now };
    if (now - c.t0 >= OL_HOLD_MIN * 60000) {
      hold.map[key] = H = take();
      plan.heldNote = `Plan updated: a different entry zone held for ${OL_HOLD_MIN} minutes.`;
      plan.held = { since: now, pending: null };
      return;
    }
    H.pendingNote = { zonePx, due: c.t0 + OL_HOLD_MIN * 60000 };
  } else {
    H.cand = null;
    H.pendingNote = null;
  }
  plan.entryPx = H.entryPx;
  plan.stop = H.stop;
  plan.t1 = H.t1;
  plan.t2 = H.t2;
  plan.risk = H.risk;
  plan.reward = H.reward;
  plan.rr = H.rr;
  plan.ent = H.ent || plan.ent;
  plan.widened = H.widened;
  plan.capped = H.capped;
  plan.atLevel = Math.abs(spot - H.entryPx) <= near;
  plan.held = { since: H.at, pending: H.pendingNote || null };
}

/** `_gtbOutlook`: direction and confidence from the consensus, entry / stop / targets from the zones. */
export function outlook(i: OutlookInputs): Outlook {
  const d = i.sr;
  const spot = d.spot;
  const cn = i.consensus;
  let dir = cn.net > 0.2 ? 1 : cn.net < -0.2 ? -1 : 0;
  const natural = dir;
  if (!dir && i.forceDir) dir = i.forceDir;
  let rank = Math.abs(cn.net) >= FV_HIGH_NET && cn.voting >= FV_HIGH_GROUPS && !cn.thin ? 3 : Math.abs(cn.net) >= FV_MED_NET && cn.voting >= FV_MED_GROUPS && !cn.thin ? 2 : 1;
  const lx = i.lx;
  const near = (spot * OL_NEAR_PCT) / 100;
  const buf = (spot * OL_STOP_BUF_PCT) / 100;
  const tol = (spot * 0.03) / 100;
  const strong = (z: Zone | PlanZone): boolean => ((z as Zone).strength ?? 0) >= OL_MIN_STRENGTH;
  const below = d.zones.filter((z) => z.price <= spot + tol).sort((a, b) => b.price - a.price);
  const above = d.zones.filter((z) => z.price >= spot - tol).sort((a, b) => a.price - b.price);
  let rankNote = '';
  if (dir !== 0 && lx && lx.status === 'STALE' && rank > 1) {
    rank = 1;
    rankNote = 'Confidence lowered to LOW: Live Context is STALE.';
  } else if (dir !== 0 && lx && lx.status === 'WEAKENING' && rank > 1) {
    rank--;
    rankNote = 'Confidence lowered one level: Live Context is WEAKENING.';
  }
  if (dir !== 0 && !i.forceDir && i.isIndex) {
    const fvc = i.finalVerdict;
    const ordc: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
    if (fvc && fvc.dir === dir && fvc.conf && ordc[fvc.conf] && ordc[fvc.conf]! < rank) {
      rank = ordc[fvc.conf]!;
      rankNote = `Confidence lowered to ${fvc.conf} to match the Final Verdict (it also weighs the other index and the 9:15 plan).`;
    }
  }
  const out: Outlook = { ok: true, forced: !natural && !!dir, nm: i.name, spot, dir, rank, rankNote, plan: null, range: null };
  if (dir !== 0) {
    const long = dir > 0;
    const ent = long ? below.filter(strong)[0] || below[0] : above.filter(strong)[0] || above[0];
    if (ent) {
      const atLevel = Math.abs(spot - ent.price) <= near;
      const entryPx = atLevel ? spot : ent.price;
      const stop = long ? ent.loP - buf : ent.hiP + buf;
      const tg = d.zones.filter((z) => (long ? z.price > entryPx + near : z.price < entryPx - near)).sort((a, b) => (long ? a.price - b.price : b.price - a.price));
      const t1 = tg.filter(strong)[0] || tg[0] || null;
      const t2 = t1 ? tg.filter((z) => z !== t1 && (long ? z.price > t1.price : z.price < t1.price))[0] || null : null;
      const risk = Math.abs(entryPx - stop);
      const reward = t1 ? Math.abs(t1.price - entryPx) : null;
      const P: Plan = { long, ent, atLevel, entryPx, stop, t1, t2, risk, reward, rr: reward != null && risk > 0 ? reward / risk : null };
      out.plan = P;
      // sanity pass: a stop closer than one average 5-minute range is widened to one range; a first target farther than 4 x the risk is pulled in
      const ocs = i.candles;
      const on = ocs ? Math.min(14, ocs.length) : 0;
      if (ocs && on >= 3) {
        let atr = 0;
        for (let k = ocs.length - on; k < ocs.length; k++) atr += parseFloat(String(ocs[k]![2])) - parseFloat(String(ocs[k]![3]));
        atr /= on;
        if (atr > 0 && P.risk < atr) {
          P.stop = long ? entryPx - atr : entryPx + atr;
          P.risk = atr;
          P.widened = true;
        }
        if (P.t1 && P.risk > 0 && Math.abs(P.t1.price - entryPx) > 4 * P.risk) {
          const nz = tg.filter((z) => {
            const dd = Math.abs(z.price - entryPx);
            return dd >= 1.5 * P.risk && dd <= 4 * P.risk;
          });
          const mk = (px: number): PlanZone => ({ price: px, items: [], n: 0, strength: 0, loP: px, hiP: px });
          P.t1 = nz[0] || mk(long ? entryPx + 2 * P.risk : entryPx - 2 * P.risk);
          P.t2 = nz[1] || mk(long ? entryPx + 3 * P.risk : entryPx - 3 * P.risk);
          P.capped = true;
        }
        if (P.t1) {
          P.reward = Math.abs(P.t1.price - entryPx);
          P.rr = P.risk > 0 ? P.reward / P.risk : null;
        }
      }
      if (i.hold) stabilise(i.name, P, !!i.forceDir && !natural, spot, near, i.hold);
    }
  } else {
    out.range = { sup: below.filter(strong)[0] || below[0] || null, res: above.filter(strong)[0] || above[0] || null };
  }
  if (i.vix) out.vix = i.vix;
  if (i.strat) out.strat = i.strat;
  return out;
}
