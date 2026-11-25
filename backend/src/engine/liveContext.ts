/**
 * Live Context: "is the morning view still valid?" A faithful port of `_lxChecks`, `_lxViewDir`, `_lxCompute` and `_lxGateFor` (liveContext.js).
 * The composite score is built mostly from things set at the open, so this reads what price is doing now and sets it beside the morning view.
 * It changes no score; the Final Verdict turns a STALE view into WAIT. Rules of thumb, not back-tested. Everything the browser read from globals is passed in.
 */

export interface LxCandle {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface LxSnap {
  m?: string;
  t: number;
  px?: number;
  f: number;
  oi: number;
  up?: number | null;
  dn?: number | null;
}

export interface LxCheck {
  key: string;
  label: string;
  sig: number;
  w: number;
  text: string;
  price: boolean;
  state?: 'agree' | 'against' | 'neutral' | 'info';
}

export interface LxInputs {
  name: string;
  /** today's 5-minute spot candles, in order */
  candles: LxCandle[];
  /** live price (the last close when there is none), the day open and the previous close */
  px: number;
  open: number;
  prev: number;
  /** the index futures (live feed): last price, VWAP, open interest */
  fut: { ltp: number; vwap: number; oi: number } | null;
  /** earlier snapshots of the day, oldest first */
  hist: LxSnap[];
  nowMs: number;
  levels: { aso: number; ast: number; bso: number; bst: number } | null;
  walls: { resistance: { strike: number }[]; support: { strike: number }[] } | null;
  /** the OI/OBV score now and an hour ago (NIFTY 50 only) */
  oi: { now: number; then: number; nowT: string; thenT: string } | null;
  breadth: { up: number; dn: number };
  /** GIFT NIFTY change since its open in percent */
  gift: number | null;
  /** net contribution of the top-10 weights, in index percent (NIFTY 50 / BANK NIFTY only) */
  heavy: number | null;
  /** the direction to judge against (the verdict direction), or null to use the composite score / 9:15 plan */
  forcedDir?: number | null;
  compositeScore: number | null;
  /** the outcome of today's 9:15 plan: Buy / Sell / other */
  strat: string | null;
}

export interface LxResult {
  name: string;
  px: number;
  view: { dir: number; src: string };
  checks: LxCheck[];
  agree: number;
  against: number;
  live: number;
  status: 'NO VIEW' | 'STALE' | 'WEAKENING' | 'VALID';
  snap: { px: number; f: number; oi: number; up: number; dn: number };
  hhmm: string;
}

const F = (n: number): string => Math.round(n).toLocaleString('en-IN');
const P = (n: number): string => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
const sgn = (n: number, dead: number): number => (n > dead ? 1 : n < -dead ? -1 : 0);
const minOf = (hhmm: string): number => {
  const p = String(hhmm).split(':');
  return parseInt(p[0]!, 10) * 60 + parseInt(p[1]!, 10);
};

interface Ctx extends LxInputs {
  avg?: number;
  dayH?: number;
  dayL?: number;
  idxChg: number;
  idxChgPrev: number;
  nowSnap: { t: number; f: number; oi: number };
}

/** `_lxChecks`. Each check: sig +1 bullish / -1 bearish / 0 none, weight in the live view, and whether it counts toward the price gate. */
export function lxChecks(name: string, ctx: Ctx & { oiDelta: number | null }): LxCheck[] {
  const out: LxCheck[] = [];
  const cs = ctx.candles;
  const px = ctx.px;
  const n = cs.length;
  const add = (key: string, label: string, sig: number, w: number, text: string, price: boolean): void => void out.push({ key, label, sig, w, text, price: !!price });

  // 1. price vs the day average (and for how long)
  if (n >= 3) {
    let cum = 0;
    const avgs: number[] = [];
    cs.forEach((k, i) => {
      cum += (k.h + k.l + k.c) / 3;
      avgs.push(cum / (i + 1));
    });
    const avg = avgs[n - 1]!;
    const side = cs[n - 1]!.c >= avg ? 1 : -1;
    let run = 0;
    for (let i = n - 1; i >= 0; i--) {
      if ((cs[i]!.c >= avgs[i]! ? 1 : -1) === side) run++;
      else break;
    }
    const mins = run * 5;
    const gap = ((px - avg) / avg) * 100;
    ctx.avg = avg;
    add('avg', 'Price vs day average', Math.abs(gap) < 0.03 ? 0 : side, mins >= 30 ? 2 : 1, `price ${F(px)} is ${side > 0 ? 'above' : 'below'} the day average ${F(avg)} (${P(gap)}) for ${mins} min`, true);
  }
  // 1b. futures vs VWAP
  const ff = ctx.fut;
  if (ff && ff.vwap) {
    const vg = ((ff.ltp - ff.vwap) / ff.vwap) * 100;
    add('vwap', 'Futures vs VWAP', Math.abs(vg) < 0.03 ? 0 : vg > 0 ? 1 : -1, 1, `futures ${F(ff.ltp)} vs VWAP ${F(ff.vwap)} (${P(vg)})`, true);
  }
  // 2. price vs the day open
  if (ctx.open) {
    const og = ((px - ctx.open) / ctx.open) * 100;
    add('open', 'Price vs day open', Math.abs(og) < 0.15 ? 0 : og > 0 ? 1 : -1, 1, `price ${F(px)} vs open ${F(ctx.open)} (${P(og)})`, true);
  }
  // 3. structure: last 6 candles against the 6 before
  if (n >= 8) {
    const k2 = n >= 12 ? 6 : Math.floor(n / 2);
    const A = cs.slice(n - k2);
    const B = cs.slice(n - 2 * k2, n - k2);
    const hA = Math.max(...A.map((x) => x.h));
    const hB = Math.max(...B.map((x) => x.h));
    const lA = Math.min(...A.map((x) => x.l));
    const lB = Math.min(...B.map((x) => x.l));
    const st = hA > hB && lA > lB ? 1 : hA < hB && lA < lB ? -1 : 0;
    add('struct', 'Trend structure', st, 2, st > 0 ? `higher highs and higher lows over the last ${k2 * 5} min` : st < 0 ? `lower highs and lower lows over the last ${k2 * 5} min` : `mixed: no clean higher-high / lower-low pattern over the last ${k2 * 5} min`, true);
  }
  // 4. distance from the day high / low
  if (n >= 3) {
    const dH = Math.max(...cs.map((x) => x.h));
    const dL = Math.min(...cs.map((x) => x.l));
    ctx.dayH = dH;
    ctx.dayL = dL;
    if (dH > dL) {
      const pos = (px - dL) / (dH - dL);
      const offL = ((px - dL) / dL) * 100;
      const offH = ((dH - px) / dH) * 100;
      const ps = pos >= 0.65 ? 1 : pos <= 0.35 ? -1 : 0;
      add('range', 'Place in the day range', ps, 1, `price is ${P(offL).replace('+', '')} above the day low ${F(dL)} and ${offH.toFixed(2)}% below the day high ${F(dH)} (${Math.round(pos * 100)}% of the range)`, false);
    }
  }
  // 5. failed breakdown / breakout and closes beyond ASO / BSO
  const lv = ctx.levels;
  if (lv && n >= 3) {
    const last = cs[n - 1]!;
    const dL2 = ctx.dayL!;
    const dH2 = ctx.dayH!;
    let fm: { sig: number; text: string } | null = null;
    (
      [
        ['BSO', lv.bso],
        ['BST', lv.bst],
      ] as [string, number][]
    ).forEach((p) => {
      if (fm || !p[1]) return;
      if (dL2 < p[1] && last.c > p[1] && px > p[1]) {
        const ct = cs.filter((x) => x.l < p[1])[0];
        fm = { sig: 1, text: `failed breakdown: went below ${p[0]} ${F(p[1])} (low ${F(dL2)}${ct ? ' at ' + ct.t : ''}) and is back above it` };
      }
    });
    (
      [
        ['ASO', lv.aso],
        ['AST', lv.ast],
      ] as [string, number][]
    ).forEach((p) => {
      if (fm || !p[1]) return;
      if (dH2 > p[1] && last.c < p[1] && px < p[1]) {
        const ct = cs.filter((x) => x.h > p[1])[0];
        fm = { sig: -1, text: `failed breakout: went above ${p[0]} ${F(p[1])} (high ${F(dH2)}${ct ? ' at ' + ct.t : ''}) and is back below it` };
      }
    });
    const fmv = fm as { sig: number; text: string } | null;
    add('failed', 'Failed breakdown / breakout', fmv ? fmv.sig : 0, 2, fmv ? fmv.text : 'no level was broken and reclaimed today', true);
    let upRun = 0;
    let dnRun = 0;
    let i2: number;
    for (i2 = n - 1; i2 >= 0 && lv.aso && cs[i2]!.c > lv.aso; i2--) upRun++;
    for (i2 = n - 1; i2 >= 0 && lv.bso && cs[i2]!.c < lv.bso; i2--) dnRun++;
    const hs = upRun >= 2 ? 1 : dnRun >= 2 ? -1 : 0;
    add('hold', 'Closes beyond ASO / BSO', hs, 2, hs > 0 ? `the last ${upRun} candles closed above ASO ${F(lv.aso)} (the sell level has been reclaimed)` : hs < 0 ? `the last ${dnRun} candles closed below BSO ${F(lv.bso)} (the buy level has been lost)` : `price is between BSO ${F(lv.bso || 0)} and ASO ${F(lv.aso || 0)} or has only just touched them`, true);
  }
  // 6. OI walls: held or broken
  if (ctx.walls && n >= 3) {
    const lastC = cs[n - 1]!.c;
    const wall = (w: { strike: number } | undefined, isRes: boolean): void => {
      if (!w) return;
      const R = w.strike;
      const touched = isRes ? ctx.dayH! >= R * 0.9985 : ctx.dayL! <= R * 1.0015;
      const broken = isRes ? lastC > R * 1.0005 : lastC < R * 0.9995;
      const held = touched && !broken && (isRes ? px < R * 0.9985 : px > R * 1.0015);
      const sg = isRes ? (held ? -1 : broken ? 1 : 0) : held ? 1 : broken ? -1 : 0;
      add(isRes ? 'rwall' : 'swall', (isRes ? 'Call wall ' : 'Put wall ') + F(R), sg, 1, `${isRes ? 'resistance' : 'support'} ${F(R)}: ${broken ? `broken, price closed ${isRes ? 'above' : 'below'} it` : held ? 'touched and held, price turned back' : touched ? 'being tested now' : 'not tested today'}`, false);
    };
    wall(ctx.walls.resistance && ctx.walls.resistance[0], true);
    wall(ctx.walls.support && ctx.walls.support[0], false);
  }
  // 7. futures over the last ~hour (needs the live feed: price and open interest)
  const hist = ctx.hist;
  const nowSnap = ctx.nowSnap;
  let past: LxSnap | null = null;
  if (nowSnap && nowSnap.f) {
    for (let h = hist.length - 1; h >= 0; h--) {
      const dt = (nowSnap.t - hist[h]!.t) / 60000;
      if (dt >= 30 && hist[h]!.f) {
        past = hist[h]!;
        if (dt >= 60) break;
      }
    }
  }
  if (past && nowSnap.f && past.oi && nowSnap.oi) {
    const fp = ((nowSnap.f - past.f) / past.f) * 100;
    const fo = ((nowSnap.oi - past.oi) / past.oi) * 100;
    const mins2 = Math.round((nowSnap.t - past.t) / 60000);
    const fs = Math.abs(fp) < 0.1 ? 0 : fp > 0 ? 1 : -1;
    const kind = fs === 0 ? 'flat' : fp > 0 ? (fo < -0.3 ? 'short covering' : 'fresh longs') : fo > 0.3 ? 'fresh shorts' : 'long unwinding';
    add('futwin', `Futures, last ${mins2} min`, fs, 2, `futures ${P(fp)}, open interest ${P(fo)}: ${kind}`, false);
  } else add('futwin', 'Futures, last hour', 0, 2, ff ? 'collecting: needs about 30 minutes of snapshots' : 'not available: needs the live price feed', false);
  // 8. OI/OBV over the last hour
  if (ctx.oi && ctx.oiDelta != null) {
    const d = ctx.oiDelta;
    const os = d >= 2 ? 1 : d <= -2 ? -1 : 0;
    add('oiwin', 'OI/OBV, last hour', os, 1, `the OI/OBV score moved from ${ctx.oi.then.toFixed(1)} (${ctx.oi.thenT}) to ${ctx.oi.now.toFixed(1)} (${ctx.oi.nowT}), ${d >= 0 ? '+' : ''}${d.toFixed(1)}; the day total is ${ctx.oi.now.toFixed(1)}`, false);
  }
  // 9. breadth shift
  if (ctx.breadth && ctx.breadth.up + ctx.breadth.dn >= 20) {
    const b = ctx.breadth;
    const net = (b.up - b.dn) / (b.up + b.dn);
    let pastB: LxSnap | null = null;
    for (let h2 = hist.length - 1; h2 >= 0; h2--) {
      const d2 = (nowSnap.t - hist[h2]!.t) / 60000;
      const hh = hist[h2]!;
      if (d2 >= 30 && hh.up != null && hh.up + (hh.dn ?? 0) >= 20) {   // a missing down count counts as 0, like the userscript
        pastB = hh;
        if (d2 >= 60) break;
      }
    }
    const pn = pastB ? (pastB.up! - (pastB.dn ?? 0)) / (pastB.up! + (pastB.dn ?? 0)) : null;
    const bs = Math.abs(net) >= 0.3 ? (net > 0 ? 1 : -1) : pn != null ? sgn(net - pn, 0.2) : 0;
    add('breadth', 'Breadth (NIFTY 50 stocks)', bs, 1, `${b.up} up / ${b.dn} down now${pastB ? `, was ${pastB.up} / ${pastB.dn} at ${pastB.m}` : ''}`, false);
  }
  // 10. GIFT NIFTY since its open
  if (ctx.gift != null) add('gift', 'GIFT NIFTY since its open', Math.abs(ctx.gift) < 0.3 ? 0 : ctx.gift > 0 ? 1 : -1, 1, `GIFT NIFTY ${P(ctx.gift)} since its open, ${name} ${P(ctx.idxChg)} since its open`, false);
  // 11. do the heavyweights back the index move? (information only)
  if (ctx.heavy != null) {
    const hv = ctx.heavy;
    const ic = ctx.idxChgPrev;
    const backs = Math.abs(ic) < 0.05 || Math.abs(hv) < 0.03 || hv > 0 === ic > 0;
    add('heavy', 'Heavyweights vs index', 0, 0, `top-10 net contribution ${hv >= 0 ? '+' : ''}${hv.toFixed(2)} pts vs the index ${P(ic)}${backs ? ': they back the move' : ': the move is coming from outside the top-10'}`, false);
  }
  return out;
}

/** `_lxViewDir`: the morning view's direction. */
export function lxViewDir(forced: number | null | undefined, compositeScore: number | null, strat: string | null): { dir: number; src: string } {
  if (forced != null) return { dir: forced, src: 'the verdict direction' };
  const sc = typeof compositeScore === 'number' ? compositeScore : null;
  if (sc != null && Math.abs(sc) >= 1.5) return { dir: sc > 0 ? 1 : -1, src: `the composite score ${sc > 0 ? '+' : ''}${sc.toFixed(2)}` };
  if (strat === 'Sell') return { dir: -1, src: 'the 9:15 strategy (Sell)' };
  if (strat === 'Buy') return { dir: 1, src: 'the 9:15 strategy (Buy)' };
  return { dir: 0, src: 'no morning view (score near zero)' };
}

/** `_lxCompute`: null with fewer than 3 candles. Status: STALE = 3 or more checks against and more against than for; WEAKENING = 2 against and at least as many against as for. */
export function lxCompute(i: LxInputs): LxResult | null {
  const cs = i.candles;
  if (cs.length < 3) return null;
  const idxChg = i.open ? ((i.px - i.open) / i.open) * 100 : 0;
  const idxChgPrev = i.prev ? ((i.px - i.prev) / i.prev) * 100 : 0;
  const nowSnap = { t: i.nowMs, f: i.fut ? i.fut.ltp : 0, oi: i.fut ? i.fut.oi : 0 };
  const ctx = { ...i, idxChg, idxChgPrev, nowSnap, oiDelta: i.oi ? i.oi.now - i.oi.then : null } as Ctx & { oiDelta: number | null };
  const checks = lxChecks(i.name, ctx);
  const view = lxViewDir(i.forcedDir, i.compositeScore, i.strat);
  let agree = 0;
  let against = 0;
  let live = 0;
  for (const c of checks) {
    c.state = view.dir === 0 ? 'info' : c.sig === 0 ? 'neutral' : c.sig === view.dir ? 'agree' : 'against';
    if (c.state === 'agree') agree++;
    else if (c.state === 'against') against++;
    live += c.sig * c.w;
  }
  live = Math.max(-10, Math.min(10, Math.round(live)));
  const status = view.dir === 0 ? 'NO VIEW' : against >= 3 && against > agree ? 'STALE' : against >= 2 && against >= agree ? 'WEAKENING' : 'VALID';
  return { name: i.name, px: i.px, view, checks, agree, against, live, status, snap: { px: i.px, f: nowSnap.f, oi: nowSnap.oi, up: i.breadth.up, dn: i.breadth.dn }, hhmm: cs[cs.length - 1]!.t };
}

/** `_lxGateFor`: a price-confirmation gate for a call in direction dir; only the price checks count. Not confirmed when two are against it, or the plan level was reclaimed. */
export function lxGate(i: LxInputs, dir: number): { ok: boolean; against: LxCheck[]; agree: LxCheck[]; res: LxResult; hhmm: string } | null {
  const r = lxCompute({ ...i, forcedDir: dir });
  if (!r) return null;
  const pc = r.checks.filter((c) => c.price);
  const against = pc.filter((c) => c.sig === -dir);
  const agree = pc.filter((c) => c.sig === dir);
  const hold = against.filter((c) => c.key === 'hold' || c.key === 'failed').length > 0;
  const ok = !(against.length >= 2 || hold) && agree.length >= 1;
  return { ok, against, agree, res: r, hhmm: r.hhmm };
}

export { minOf };
