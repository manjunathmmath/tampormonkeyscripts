/**
 * Trade Focus: the five gates of tradeFocus.js (`_tfComputeStock`, `_tfComputeMcx`, `_tfRiskRow`, `_tfExitRow`, `_tfWhereWhen`, `_tfMcxWall`) as one pure builder.
 * Gates: TRADEABLE TODAY?, DIRECTION, ENTRY & TIMING, RISK, EXIT. Nothing new is calculated here: every input is something the other engines already produce.
 * Rule-based, not back-tested, never places an order. A green gate is not a trade instruction.
 */
export type Tone = 'good' | 'warn' | 'bad' | 'none';

export interface FocusRow {
  key: 'tradeable' | 'direction' | 'entry' | 'risk' | 'exit';
  n: number;
  title: string;
  tone: Tone;
  line: string;
  detail: string[];
}

export interface FVerdict {
  label: string;
  trade: { dir?: string; entry: number; stop: string | number; target?: string | number } | null;
  context?: { label: string; lines: string[] } | null;
  location?: { label: string; lines: string[] } | null;
  confirmation?: { label: string; lines: string[] } | null;
  volWarn?: { label: string; value: number; limit: number } | null;
  ovxGate?: unknown;
}

export interface FCons {
  outcome: string;
  net: number;
  agree: number;
  voting: number;
  thin: boolean;
  deadZone: unknown;
  families: { name: string; dir: number }[];
  rows: { label: string; dir: number; note: string | null }[];
}

export interface Wall {
  strike: number;
  tier: string;
}

export interface FocusIn {
  name: string;
  label: string;
  mcx: boolean;
  isIdx: boolean;
  live: boolean;
  notLive: string;
  /** commodity session open (or not applicable) */
  inSession: boolean;
  /** the option chain is loaded */
  loaded: boolean;
  /** the commodity's data is still loading */
  loading?: boolean;
  ltp: number;
  vd: FVerdict | null;
  cn: FCons | null;
  /** Live Context of the morning view */
  lx: { status: string; against: number } | null;
  /** another index's direction, for the cross-check (indices only) */
  partnerDir: number;
  partnerLabel: string;
  walls: { support: Wall[]; resistance: Wall[] } | null;
  /** the expected day range (India VIX band for NSE, the commodity's volatility band for MCX) */
  range: { lo: number; hi: number } | null;
  dz: { lo: number; hi: number } | null;
  marketGuard: string | null;
  indiaVix: number | null;
  dte: number | null;
  expiryToday: string[];
  agreement: { agree: number; total: number; pct: number } | null;
  timing: { pct: number; label: string } | null;
  risk: { capital: number; riskPct: number; lot: { lot: number; src: 'mcx' | 'futures' | 'options' | '' }; pair: { entry: number; stop: number } | null };
  exit: { mode: 'nifty' | 'single'; trend: number; fut: number; n50Fut: number; bnFut: number; squeezeActive: boolean };
  plan915: { outcome: string; level: string } | null;
}

export interface FocusOut {
  name: string;
  rows: FocusRow[];
  greens: number;
  judged: number;
  live: boolean;
  v: { call: string; headline: string; tone: Tone; conf: string | null; dir: number };
}

const fN = (x: number): string => (!Number.isFinite(x) ? '-' : Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-IN') : x.toFixed(2));
const fmt = (n: number): string => Math.round(n).toLocaleString('en-IN');

/** `_tfWhereWhen`: turns an actionable wall entry and the live price into one instruction. The 0.15% band and the close-back step are rules of thumb. */
export function whereWhen(dir: number, wall: number, ltp: number, stop: number): { st: 'under' | 'now' | 'pullback'; txt: string } | null {
  if (!dir || !Number.isFinite(wall) || !Number.isFinite(ltp) || !wall || !ltp) return null;
  const long = dir > 0;
  const side = long ? 'support' : 'resistance';
  const word = long ? 'above' : 'below';
  const other = long ? 'below' : 'above';
  const d = ((long ? ltp - wall : wall - ltp) / wall) * 100;
  const pts = Math.abs(ltp - wall);
  const W = fN(wall);
  const stp = Number.isFinite(stop) ? `, stop ${fN(stop)}` : '';
  if (d < -0.03) return { st: 'under', txt: `WAIT: price is ${other} its ${side} wall (${fN(pts)} pts). Enter if a 5-minute candle closes back ${word} ${W}${stp}. If it keeps ${long ? 'falling' : 'rising'}, skip.` };
  if (d <= 0.15) return { st: 'now', txt: `ENTER NOW: ${long ? 'buy' : 'sell'} around ${W}${d > 0.03 ? ` to ${fN(ltp)}` : ''}${stp}.` };
  return { st: 'pullback', txt: `WAIT for a pullback to ${W} (${fN(pts)} pts ${long ? 'below' : 'above'} price); do not chase${stp}.` };
}

/** `_tfMcxWall`: the nearest ranked OI wall for a direction (support for a LONG, resistance for a SHORT); "at" = within 0.35% of price. */
export function nearestWall(walls: FocusIn['walls'], dir: number, ltp: number): { strike: number; distPct: number; tier: string; at: boolean } | null {
  if (!walls || !ltp) return null;
  const list = (dir > 0 ? walls.support : walls.resistance) ?? [];
  let best: { strike: number; distPct: number; tier: string; at: boolean } | null = null;
  for (const x of list) {
    const d = (Math.abs(x.strike - ltp) / ltp) * 100;
    if (!best || d < best.distPct) best = { strike: x.strike, distPct: d, tier: x.tier, at: d <= 0.35 };
  }
  return best;
}

const FAM_LABEL: Record<string, string> = { zone: '9:15', trend: 'price vs levels', futures: 'futures', options: 'OI/OBV flow', orderflow: 'order flow', curve: 'curve' };

export function buildFocus(i: FocusIn): FocusOut {
  const { cn, vd, ltp, label } = i;
  const dir = cn ? (cn.outcome === 'GO LONG' ? 1 : cn.outcome === 'GO SHORT' ? -1 : 0) : 0;
  const word = dir > 0 ? 'LONG' : dir < 0 ? 'SHORT' : '';
  let rank = !cn ? 0 : Math.abs(cn.net) >= 0.5 && cn.voting >= 4 && !cn.thin ? 3 : Math.abs(cn.net) >= 0.3 && cn.voting >= 3 && !cn.thin ? 2 : 1;
  const stale = !!dir && i.lx?.status === 'STALE';
  const weak = !!dir && i.lx?.status === 'WEAKENING';
  const lxNote = stale ? `price check: view STALE (${i.lx!.against} checks against)` : weak ? `price check: view WEAKENING (${i.lx!.against} checks against)` : '';
  if (stale) rank = Math.min(rank, 1);
  else if (weak && rank > 1) rank--;
  let partnerNote = '';
  if (i.isIdx && dir && i.partnerDir && i.partnerDir !== dir) {
    partnerNote = `${i.partnerLabel} consensus points the other way`;
    if (rank > 1) rank--;
  }
  const conf = ['', 'LOW', 'MEDIUM', 'HIGH'][rank] || null;

  const vdFlat = !!(vd && !vd.ovxGate && vd.context && /No directional edge/.test(String(vd.context.label)));
  const loc = vdFlat && dir && ltp ? nearestWall(i.walls, dir, ltp) : null;
  const rangePos = i.range && ltp ? (ltp >= i.range.hi ? 1 : ltp <= i.range.lo ? -1 : 0) : 0;

  // the headline: the wall verdict, never louder than the consensus direction
  let call = 'NO TRADE';
  let headline = 'NO TRADE';
  let tone: Tone = 'none';
  if (vd && vd.ovxGate) {
    const vl = vd.context?.label ? String(vd.context.label) : 'volatility too high';
    headline = /^NO TRADE/.test(vl) ? vl : `NO TRADE — ${vl}`;
    tone = 'bad';
  } else if (!i.loaded || i.loading) {
    call = 'WAIT';
    tone = 'warn';
    headline = i.loading ? `WAIT — loading ${label}…` : `WAIT — ${label} data not loaded yet (press Refresh)`;
  } else if (!dir) {
    const fb: string[] = [];
    const fs: string[] = [];
    for (const g of cn?.families ?? []) {
      const lb = FAM_LABEL[g.name] ?? g.name;
      if (g.dir > 0) fb.push(lb);
      else if (g.dir < 0) fs.push(lb);
    }
    const split = fb.length && fs.length ? ` (split: bullish ${fb.join(', ')} vs bearish ${fs.join(', ')})` : '';
    if (!i.mcx && cn && cn.deadZone && Math.abs(cn.net) > 0.2) {
      call = 'WAIT';
      tone = 'warn';
      headline = `WAIT — ${cn.net > 0 ? 'LONG' : 'SHORT'} lean, but ${label} is in a dead zone${split}`;
    } else headline = (cn && cn.voting === 0 ? 'WAIT — not enough data yet' : 'NO TRADE — no clear direction') + split;
  } else if (vd && (vd.label === 'LONG' || vd.label === 'SHORT') && (vd.label === 'LONG') === dir > 0) {
    call = word;
    tone = dir > 0 ? 'good' : 'bad';
    headline = `${word} — OI wall entry ${vd.trade ? `at ${vd.trade.entry}` : 'nearby'}`;
  } else if (vdFlat) {
    const wn = loc ? `${Math.round(loc.strike).toLocaleString('en-IN')} ${dir > 0 ? 'put' : 'call'} wall` : '';
    call = 'WAIT';
    tone = 'warn';
    if (loc && loc.at) headline = `${word} lean at the ${wn} — verdict not actionable (composite score flat)`;
    else if (loc) headline = `${word} lean — WAIT for the ${wn} (${loc.distPct.toFixed(1)}% away); verdict not actionable`;
    else headline = `${word} lean — WAIT (no OI wall found); verdict not actionable`;
  } else if (vd && /^(LONG|SHORT) bias/.test(String(vd.label)) && /^LONG/.test(vd.label) !== dir > 0) {
    call = 'WAIT';
    tone = 'warn';
    headline = `WAIT — signals disagree: consensus ${word}, verdict ${/^LONG/.test(vd.label) ? 'LONG' : 'SHORT'} bias${vd.location?.label ? ` (${vd.location.label})` : ''}`;
  } else {
    call = 'WAIT';
    tone = 'warn';
    headline = `${word} bias — WAIT${vd?.location?.label ? ` (${vd.location.label})` : ''}`;
  }
  if (stale && call === word && word) {
    call = 'WAIT';
    tone = 'warn';
    headline = `WAIT — ${word} signals, but price is moving against it`;
  }
  const v = { call, headline, tone, conf: dir ? conf : null, dir };
  const rows: FocusRow[] = [];

  // 1. Tradeable
  {
    const r: FocusRow = { key: 'tradeable', n: 1, title: 'TRADEABLE TODAY?', tone: 'good', line: '', detail: [] };
    if (!i.live) {
      r.tone = 'none';
      r.line = `Not live: ${i.notLive}`;
      r.detail.push('The screens show an earlier moment or day, so the live gates do not apply.');
    } else if (i.mcx && !i.inSession) {
      r.tone = 'none';
      r.line = 'The MCX session is closed (09:00 to 23:55, Monday to Friday)';
    } else if (!i.loaded && !i.mcx) {
      r.tone = 'warn';
      r.line = `${i.name} has no option chain loaded yet: press Refresh to load it`;
    } else {
      const bad: string[] = [];
      const warn: string[] = [];
      const ok: string[] = [];
      if (!i.mcx) {
        if (i.marketGuard) bad.push(`Market guard: ${i.marketGuard}`);
        else ok.push('Market guard clear');
      }
      if (vd?.volWarn) warn.push(`${vd.volWarn.label} ${vd.volWarn.value.toFixed(1)} is above ${vd.volWarn.limit}: high volatility, widen the stop and cut size (warning only)`);
      else if (i.mcx && vd?.context?.lines?.[0]) ok.push(vd.context.lines[0]);
      else if (!i.mcx && i.indiaVix) {
        if (i.indiaVix > 18) warn.push(`India VIX ${i.indiaVix.toFixed(1)} is ${i.indiaVix > 25 ? 'HIGH' : 'ELEVATED'}: widen the stop, cut size`);
        else ok.push(`VIX ${i.indiaVix.toFixed(1)}`);
      }
      if (i.mcx && !ltp) warn.push(`No live price for ${label} yet`);
      if (i.dz) warn.push(`${label} is in a dead zone (${i.dz.lo} – ${i.dz.hi}): signals too weak to commit`);
      if (rangePos && i.range) warn.push(`${label} is past ${rangePos > 0 ? `VIXU ${Math.round(i.range.hi)}` : `VIXL ${Math.round(i.range.lo)}`} (the expected day range): momentum, not a reversal signal, so do not fade it${i.mcx ? '' : ', and a new entry in its direction is chasing'}`);
      if (i.dte != null && i.dte <= 1) warn.push(`The contract expires in ${i.dte} day${i.dte === 1 ? '' : 's'}: thin liquidity and sharp moves near expiry`);
      if (i.isIdx && i.expiryToday.length) warn.push(`Options expire today (${i.expiryToday.join(', ')}): moves can be sharp and one-way, size smaller`);
      r.tone = bad.length ? 'bad' : warn.length ? 'warn' : 'good';
      const all = bad.concat(warn);
      r.line = all.length ? all[0] + (all.length > 1 ? ` (+${all.length - 1} more)` : '') : ok.join(' · ') || 'No blocking conditions found';
      r.detail = all.length ? all.concat(ok) : ok;
    }
    rows.push(r);
  }

  // 2. Direction
  {
    const r: FocusRow = { key: 'direction', n: 2, title: 'DIRECTION', tone: 'none', line: '', detail: [] };
    if (!cn) r.line = `Consensus not available yet: load ${label}`;
    else {
      const nF = (x: number): string => (x >= 0 ? '+' : '') + x.toFixed(2);
      const stat = `consensus net ${nF(cn.net)}, ${cn.agree} of ${cn.voting} signal groups agree${cn.thin ? ' (thin)' : ''}`;
      const vBias = vd?.context ? vd.context.label : '';
      if (!dir && !i.mcx && cn.deadZone && Math.abs(cn.net) > 0.2) {
        r.tone = 'warn';
        r.line = `${cn.net > 0 ? 'LONG' : 'SHORT'} lean, held back by the dead zone: ${stat}`;
      } else if (!dir) {
        r.tone = 'bad';
        r.line = `No clear direction: ${stat}`;
      } else {
        const conflict = (/LONG bias/.test(vBias) && dir < 0) || (/SHORT bias/.test(vBias) && dir > 0);
        r.tone = rank >= 2 && !conflict && !partnerNote ? 'good' : 'warn';
        r.line = `${word} (${conf} confidence): ${stat}${conflict ? `; the ${i.mcx ? 'commodity' : 'wall'} verdict says ${vBias}` : ''}${partnerNote ? `; ${partnerNote}` : ''}${lxNote ? ` · ${lxNote}` : ''}`;
      }
      for (const x of cn.rows) if (x.dir !== 0) r.detail.push(`${x.dir > 0 ? 'Long: ' : 'Short: '}${x.label}${x.note ? ` (${x.note})` : ''}`);
    }
    rows.push(r);
  }

  // 3. Entry and timing
  {
    const r: FocusRow = { key: 'entry', n: 3, title: 'ENTRY & TIMING', tone: 'none', line: '', detail: [] };
    if (!dir) r.line = 'No direction, so nothing to time';
    else if (!vd) r.line = 'Verdict not available yet';
    else {
      const parts: string[] = [];
      if (i.agreement && i.agreement.pct != null) parts.push(`signals agree ${i.agreement.agree}/${i.agreement.total} (${i.agreement.pct}%)`);
      const tmTxt = i.timing ? `${call === word && word ? 'timing ' : 'timing if entered now: '}${i.timing.pct}% ${i.timing.label}` : '';
      if (tmTxt) parts.push(tmTxt);
      r.tone = vd.ovxGate ? 'bad' : call === word && word ? 'good' : 'warn';
      if (vdFlat) {
        r.line = headline + (i.mcx ? (tmTxt ? ` · ${tmTxt}` : '') : parts.length ? ` · ${parts.join(' · ')}` : '');
        r.detail.push(`The ${i.mcx ? 'commodity' : 'wall'} verdict is not actionable: its composite score is within +-3, so it has no bias of its own and its wall check is skipped. It reads LONG / SHORT only when the score is outside +-3, a wall is within 0.35% of price and futures and OI/OBV agree. The consensus direction (${word}) is only looked at against the nearest ranked OI ${dir > 0 ? 'put (support)' : 'call (resistance)'} wall, for information: this row stays amber.`);
        if (loc) r.detail.push(`Nearest ${dir > 0 ? 'support' : 'resistance'} wall: ${Math.round(loc.strike).toLocaleString('en-IN')} (${loc.tier}), ${loc.distPct.toFixed(2)}% from ${Math.round(ltp).toLocaleString('en-IN')}${loc.at ? ' (at the wall)' : ''}.`);
        else r.detail.push(`No ranked ${dir > 0 ? 'put-writing' : 'call-writing'} wall was found in the option chain loaded, so there is no level to enter at.`);
        for (const x of vd.context?.lines ?? []) r.detail.push(x);
        if (tmTxt) r.detail.push(`The timing figure is the entry-timing checklist for a ${word}; it does not know about the wall check above, so a high timing with an amber row means the level is not there yet.`);
      } else {
        if (i.mcx) {
          r.line = `${vd.label}${vd.location?.label ? ` · ${vd.location.label}` : ''}${vd.confirmation?.label && vd.confirmation.label !== 'N/A' ? ` · ${vd.confirmation.label}` : ''}${tmTxt ? ` · ${tmTxt}` : ''}`;
          const wk = vd.trade && vd.trade.entry != null ? Number(vd.trade.entry) : NaN;
          if (Number.isFinite(wk) && ltp) {
            const dpts = ltp - wk;
            const pt = ` · price ${fmt(ltp)}${Math.abs(dpts) < 0.5 ? ' (at the wall)' : ` (${fmt(Math.abs(dpts))} pts ${dpts < 0 ? 'below' : 'above'} the wall)`}`;
            r.line = r.line.includes(' · timing') ? r.line.replace(' · timing', `${pt} · timing`) : r.line + pt;
            r.detail.push('The verdict measures "at the wall" from the at-the-money strike, so its distance can read 0.00% while the live price is up to about half a strike step away. The price shown above is the live price, and the Actionable condition itself is unchanged.');
          }
        } else r.line = headline + (parts.length ? ` · ${parts.join(' · ')}` : '');
        if (rangePos && rangePos === dir && !i.mcx && i.range) {
          r.line += ' · already past the expected day range (chasing)';
          r.detail.push(`${i.name} is already past ${rangePos > 0 ? `VIXU ${Math.round(i.range.hi)}` : `VIXL ${Math.round(i.range.lo)}`}, the edge of the expected day range from the India VIX. A ${word} now follows a move that has used up its usual range: it can run on, but it is momentum, not a fresh start. The colour above is unchanged; this is a warning.`);
        }
        if (call === word && word && vd.trade) {
          const ww = whereWhen(dir, Number(vd.trade.entry), ltp, Number(vd.trade.stop));
          if (ww) {
            r.line += ` · ${ww.txt}`;
            r.detail.unshift(`Where and when: ${ww.txt} The entry is the wall itself, not a breakout above or below it; the stop is 0.4% beyond the wall. The 0.15% band and the close-back step are rules of thumb, not tested.`);
          }
        }
        for (const p of [vd.context, vd.location, vd.confirmation]) for (const x of p?.lines ?? []) r.detail.push(x);
        if (i.isIdx && i.plan915?.outcome) {
          r.line += ` · 9:15 plan (context): ${i.plan915.outcome}${i.plan915.level ? ` ${String(i.plan915.level).split(/\s[—–-]\s/)[0]}` : ''}`;
          r.detail.push(`9:15 plan (context only, does not decide this gate): ${i.plan915.outcome}${i.plan915.level ? `, ${i.plan915.level}` : ''}.`);
        }
        if (parts.length || tmTxt) r.detail.push('Signal agreement and Entry timing are the Option Strike Search checklists; timing is for entering right now and is not a signal on its own.');
      }
    }
    rows.push(r);
  }

  rows.push(riskRow(i, dir, word, vd));
  rows.push(exitRow(i, dir, word));
  const judged = rows.filter((x) => x.tone !== 'none').length;
  return { name: i.name, rows, greens: rows.filter((x) => x.tone === 'good').length, judged, live: i.live, v };
}

/** `_tfRiskRow`: the stop in points and %, and the lots that fit the risk budget (arithmetic on your own capital and risk %; margin and brokerage are not included). */
function riskRow(i: FocusIn, dir: number, word: string, vd: FVerdict | null): FocusRow {
  const r: FocusRow = { key: 'risk', n: 4, title: 'RISK', tone: 'none', line: '', detail: [] };
  if (!dir) {
    r.line = 'No direction, so no stop to size against';
    return r;
  }
  const cands: { kind: 'verdict' | 'pair'; src: string; entry: number; stop: number }[] = [];
  if (vd?.trade && Number(vd.trade.stop)) cands.push({ kind: 'verdict', src: 'the wall verdict stop', entry: Number(vd.trade.entry), stop: Number(vd.trade.stop) });
  if (i.risk.pair) cands.push({ kind: 'pair', src: `the 9:15 ${dir > 0 ? 'BSO/BST' : 'ASO/AST'} level pair`, entry: i.risk.pair.entry, stop: i.risk.pair.stop });
  if (!cands.length) {
    r.line = i.mcx ? `No stop level yet: load ${i.label}` : `No stop level for ${i.name} yet: run the 9:15 scan`;
    return r;
  }
  const prefer = i.isIdx ? 'pair' : 'verdict';
  const prim = cands.find((c) => c.kind === prefer) ?? cands[0]!;
  const other = cands.find((c) => c !== prim) ?? null;
  const { capital: cap, riskPct: pct } = i.risk;
  const lot = i.risk.lot.lot;
  const budget = (cap * pct) / 100;
  const size = (c: { entry: number; stop: number }): { step: number; pctp: number; perLot: number; lots: number | null } => {
    const step = Math.abs(c.entry - c.stop);
    const perLot = lot ? step * lot : 0;
    return { step, pctp: c.entry ? (step / c.entry) * 100 : 0, perLot, lots: perLot && budget ? Math.floor(budget / perLot) : null };
  };
  const sp = size(prim);
  const base = `Stop ${fN(prim.stop)}, ${fN(sp.step)} pts (${sp.pctp.toFixed(2)}%) from ${fN(prim.entry)}`;
  r.detail.push(`The stop above comes from ${prim.src}. A dip or rally entry would use a nearer stop; this is the reference.`);
  if (other) {
    const so = size(other);
    r.detail.push(`The other reference, ${other.src}: stop ${fN(other.stop)}, ${fN(so.step)} pts (${so.pctp.toFixed(2)}%) from ${fN(other.entry)}${so.lots != null ? ` · ${so.lots >= 1 ? `${so.lots} lot${so.lots > 1 ? 's' : ''} fit` : 'not even 1 lot fits'}` : ''}.`);
  }
  if (!cap || !lot) {
    r.tone = 'warn';
    r.line = base + (!cap ? '. Set Account capital in Settings to see the rupee risk.' : `. The lot size for ${i.name} is not known.`);
    return r;
  }
  r.tone = sp.lots != null && sp.lots >= 1 ? 'good' : 'warn';
  r.line = `${base} · risk budget ₹${fmt(budget)} (${pct}% of ₹${fmt(cap)}) · ${sp.lots != null && sp.lots >= 1 ? `${sp.lots} lot${sp.lots > 1 ? 's' : ''} fit` : 'not even 1 lot fits'} (futures-equivalent, ${i.risk.lot.src === 'mcx' ? `₹${lot} per 1.00 move per lot` : `lot ${lot}${i.risk.lot.src === 'options' ? ', from the option rows' : ''}`})`;
  r.detail.push(`One lot loses about ₹${fmt(sp.perLot)} to that stop${i.risk.lot.src === 'mcx' ? " (the per-point value is assumed from the MCX contract size: check it against your broker's margin calculator)" : ''}. Arithmetic on your own Settings (Account capital and risk % per trade), not sizing advice; margin and brokerage are not included.`);
  void word;
  return r;
}

/** `_tfExitRow`: NIFTY 50 keeps the index rule (trend, or both index futures); every other name uses its own trend and futures remark. A squeeze against the direction is an exit too. */
function exitRow(i: FocusIn, dir: number, word: string): FocusRow {
  const r: FocusRow = { key: 'exit', n: 5, title: 'EXIT', tone: 'none', line: '', detail: [] };
  if (!dir) {
    r.line = 'No direction, so no exit to watch';
    return r;
  }
  const advTxt = dir < 0 ? 'short covering' : 'long unwinding';
  const e = i.exit;
  if (e.mode === 'nifty') {
    const exit = dir > 0 ? e.trend < 0 || (e.n50Fut < 0 && e.bnFut < 0) : e.trend > 0 || (e.n50Fut > 0 && e.bnFut > 0);
    if (exit || e.squeezeActive) {
      r.tone = 'bad';
      const why: string[] = [];
      if (exit) why.push(`trend or both index futures have turned against a ${word}`);
      if (e.squeezeActive) why.push(`${advTxt} is active on the indices`);
      r.line = `Exit signal for a ${word}: ${why.join('; ')}`;
    } else {
      r.tone = 'good';
      r.line = `No exit signal for a ${word} (trend intact, futures not both against it, no ${advTxt})`;
    }
    r.detail.push('Exit rule: a LONG exits when NIFTY is below BSO/BST or both index futures turn bearish; a SHORT exits when NIFTY is above ASO/ AST or both turn bullish. BANK NIFTY, SENSEX, stocks and commodities use their own trend and futures remark instead.');
    r.detail.push('A squeeze against the direction (short covering for a SHORT, long unwinding for a LONG) is a fast one-way move.');
    return r;
  }
  const exit = dir > 0 ? e.trend < 0 || e.fut < 0 : e.trend > 0 || e.fut > 0;
  if (exit || e.squeezeActive) {
    r.tone = 'bad';
    const why: string[] = [];
    if (e.trend * dir < 0) why.push(`price has crossed against the ${word}`);
    if (e.fut * dir < 0) why.push('the futures remark has turned against it');
    if (e.squeezeActive) why.push(`${advTxt} is active on ${i.name}`);
    r.line = `Exit signal for a ${word}: ${why.join('; ')}`;
  } else {
    r.tone = 'good';
    r.line = `No exit signal for a ${word} (trend intact, futures not against it, no ${advTxt})`;
  }
  r.detail.push('Exit rule (single instrument): a LONG exits when the trend is below BSO/BST or the futures remark turns bearish; a SHORT exits when the trend is above ASO/AST or the remark turns bullish. This is more sensitive than the NIFTY 50 rule, which waits for both index futures.');
  return r;
}

/** rupees per 1.00 price move per lot, from the MCX contract sizes (assumed, not read from Kite): GOLDM 100 g quoted per 10 g, SILVERM 5 kg per kg, CRUDEOILM 10 bbl, ... */
export const MCX_MULT: Record<string, number> = { GOLDM: 10, GOLD: 100, SILVERM: 5, SILVER: 30, SILVERMIC: 1, CRUDEOILM: 10, CRUDEOIL: 100, NATGASMINI: 250, NATURALGAS: 1250 };
