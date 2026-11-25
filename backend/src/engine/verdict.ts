/**
 * The wall verdict (the strict LONG / SHORT read): a faithful port of `_cmdBuildVerdict` and the helpers it uses
 * (`_gtbMarketProfile`, `_gtbMaxPainOutcome`, `_gtbFlowVsPullConflict`, `_gtbFuturesOIConflict`) from grootTradeBot.js.
 *
 * Three parts: Context (is there a directional edge: composite score outside +-3, and the volatility warning), Location (is spot within 0.35% of an OI wall
 * that matches the bias; the Market Profile value area can upgrade an unconfirmed location) and Confirmation (futures vs OI/OBV, max pain, order flow).
 * It is Actionable only with a bias, a wall within 0.35% and futures and OI/OBV not disagreeing. The strict read is kept on purpose.
 */
import { scoreOIStrike, type MaxPain, type OiRow } from './oi.js';

export const DEAD_ZONE_PCT = 0.35;

export interface MarketProfile {
  poc: number;
  vah: number;
  val: number;
}

/** 30-bin volume-at-price profile of the day: POC and the 70% value area. Needs at least 5 candles with volume. */
export function marketProfile(candles: readonly (readonly (string | number | undefined)[])[] | null | undefined): MarketProfile | null {
  if (!candles || candles.length < 5) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    const l = parseFloat(String(c[3]));
    const h = parseFloat(String(c[2]));
    if (l < lo) lo = l;
    if (h > hi) hi = h;
  }
  if (!(hi > lo)) return null;
  const BINS = 30;
  const binSize = (hi - lo) / BINS;
  const vol = new Array<number>(BINS).fill(0);
  for (const c of candles) {
    const h = parseFloat(String(c[2]));
    const l = parseFloat(String(c[3]));
    const v = parseFloat(String(c[5])) || 0;
    if (!v) continue;
    const loBin = Math.max(0, Math.min(BINS - 1, Math.floor((l - lo) / binSize)));
    let hiBin = Math.max(0, Math.min(BINS - 1, Math.floor((h - lo) / binSize)));
    if (hiBin < loBin) hiBin = loBin;
    const vPerBin = v / (hiBin - loBin + 1);
    for (let b = loBin; b <= hiBin; b++) vol[b]! += vPerBin;
  }
  const totalVol = vol.reduce((a, b) => a + b, 0);
  if (!totalVol) return null;
  let pocIdx = 0;
  for (let i = 1; i < BINS; i++) if (vol[i]! > vol[pocIdx]!) pocIdx = i;
  let loIdx = pocIdx;
  let hiIdx = pocIdx;
  let covered = vol[pocIdx]!;
  while (covered < totalVol * 0.7 && (loIdx > 0 || hiIdx < BINS - 1)) {
    const belowVol = loIdx > 0 ? vol[loIdx - 1]! : -1;
    const aboveVol = hiIdx < BINS - 1 ? vol[hiIdx + 1]! : -1;
    if (aboveVol >= belowVol) {
      hiIdx++;
      covered += vol[hiIdx]!;
    } else {
      loIdx--;
      covered += vol[loIdx]!;
    }
  }
  return { poc: lo + (pocIdx + 0.5) * binSize, vah: lo + (hiIdx + 1) * binSize, val: lo + loIdx * binSize };
}

type Mpd = Pick<MaxPain, 'spot' | 'maxPainK' | 'maxPainDist' | 'maxPainPct' | 'netGEX' | 'flipZones'>;

/** `_gtbMaxPainOutcome`: max pain and gamma exposure as a short outcome label. */
export function maxPainOutcome(d: Mpd | null): { label: string } {
  if (!d) return { label: 'No data' };
  const absPct = Math.abs(d.maxPainPct);
  const pullUp = d.maxPainDist > 0;
  const bullGEX = d.netGEX > 0;
  const nearFlip = d.flipZones.length > 0 && d.flipZones.some((f) => Math.abs(f - d.spot) / d.spot < 0.005);
  if (absPct < 0.3) return { label: 'Expiry Pin' };
  if (bullGEX) return pullUp ? { label: nearFlip ? '↑ Pull + Flip Risk' : '↑ Gradual Drift Up' } : { label: nearFlip ? '↓ Pull + Flip Risk' : '↓ Gradual Drift Down' };
  return pullUp ? { label: nearFlip ? '⚡ Sharp Rally Risk' : '↑ Momentum Up' } : { label: nearFlip ? '⚡ Sharp Fall Risk' : '↓ Momentum Down' };
}

/** `_gtbFlowVsPullConflict`: today's flow (futures x2 + OI/OBV sign) against the pull of max pain. True when they disagree and max pain is not pinning. */
export function flowVsPullConflict(futuresTrend: number, oiObv: number, d: Mpd | null): boolean {
  if (!d) return false;
  const futDir = futuresTrend || 0;
  const oiDir = oiObv || 0;
  const flowScore = futDir * 2 + (oiDir > 0 ? 1 : oiDir < 0 ? -1 : 0);
  const flowDir = flowScore > 0 ? 1 : flowScore < 0 ? -1 : 0;
  if (flowDir === 0) return false;
  if (Math.abs(d.maxPainPct) < 0.3) return false;
  const pull = d.maxPainDist > 0 ? 1 : d.maxPainDist < 0 ? -1 : 0;
  return !(pull === 0 || pull === flowDir);
}

/** `_gtbFuturesOIConflict`: the futures trend and the OI/OBV flow point opposite ways (either one flat is no conflict). */
export function futuresOIConflict(futuresTrend: number | undefined, oiObv: number | undefined): boolean {
  const futDir = futuresTrend || 0;
  const oiDir = (oiObv ?? 0) > 0 ? 1 : (oiObv ?? 0) < 0 ? -1 : 0;
  if (futDir === 0 || oiDir === 0) return false;
  return futDir !== oiDir;
}

export interface VerdictLine {
  ok: boolean | null;
  text: string;
  warn?: boolean;
}

export interface VerdictPart {
  ok: boolean | null;
  label: string;
  lines: string[];
}

export interface Verdict {
  label: string;
  lines: VerdictLine[];
  trade: { dir: string; entry: number; stop: string; target: string } | null;
  context: VerdictPart;
  location: VerdictPart;
  confirmation: VerdictPart;
  raw: { csTotal: number; wallDistPct: number | null; fvo: boolean; ofiOk: boolean | null; ofiDir: number | null; mpPOC: number | null; mpVAH: number | null; mpVAL: number | null };
  volWarn?: { label: string; value: number; limit: number; text: string };
}

export interface VerdictInputs {
  name: string;
  /** the volatility reading and its label ("India VIX" for NSE names, "OVX" for crude, ...); value 0 when not known */
  vol: { label: string; value: number };
  /** Settings limits per label for the CBOE indices (default 35); India VIX is fixed at 30 */
  volExtreme?: Record<string, number>;
  /** the instrument score total and the raw parts the conflict checks read */
  csTotal: number;
  futuresTrend?: number;
  oiObv?: number;
  rows: OiRow[];
  spotCandles?: readonly (readonly (string | number | undefined)[])[] | null;
  priceChange: number | string;
  mpd: Mpd | null;
  /** last price, used as spot when there is no max pain read */
  trendLtp?: number | null;
  /** live order flow read (needs a tick subscription); null when not available */
  orderFlow?: { dir: number; text: string } | null;
}

export function buildVerdict(inp: VerdictInputs): Verdict {
  const out: Verdict = {
    label: 'WAIT',
    lines: [],
    trade: null,
    context: { ok: null, label: '', lines: [] },
    location: { ok: null, label: '', lines: [] },
    confirmation: { ok: null, label: '', lines: [] },
    raw: { csTotal: 0, wallDistPct: null, fvo: false, ofiOk: null, ofiDir: null, mpPOC: null, mpVAH: null, mpVAL: null },
  };

  // CONTEXT part 1: the volatility reading (a warning only, never a block)
  const ovxLabel = inp.vol.label;
  const ovx = inp.vol.value;
  const ovxExtreme = ovxLabel === 'India VIX' ? 30 : inp.volExtreme?.[ovxLabel] || 35;
  const volGated = ovxLabel === 'India VIX' || ovxLabel === 'OVX';
  let volWarnText: string | null = null;
  if (volGated && ovx >= ovxExtreme) {
    volWarnText =
      `${ovxLabel} ${ovx.toFixed(1)} is above ${ovxExtreme}: high volatility, so widen the stop and cut size. A warning only; the checks below still decide the verdict.` +
      (ovxLabel === 'OVX' ? ' If this is the normal level for OVX, raise the limit in Settings > Volatility indices.' : '');
    out.volWarn = { label: ovxLabel, value: ovx, limit: ovxExtreme, text: volWarnText };
    out.lines.push({ ok: false, warn: true, text: volWarnText });
  }

  // CONTEXT part 2: direction
  const csTotal = inp.csTotal;
  const bias = csTotal >= 3 ? 1 : csTotal <= -3 ? -1 : 0;
  const biasLbl = bias > 0 ? 'LONG bias' : bias < 0 ? 'SHORT bias' : 'No directional edge';
  const ctxTxt = `Composite score ${csTotal >= 0 ? '+' : ''}${csTotal.toFixed(1)} → ${biasLbl}.`;
  out.lines.push({ ok: bias !== 0, text: ctxTxt });
  out.context = {
    ok: bias !== 0,
    label: biasLbl,
    lines: [`${ovxLabel} ${ovx ? ovx.toFixed(1) : '—'}${volWarnText ? ` (above ${ovxExtreme}: warning only)` : volGated ? ' (not extreme)' : ` (context only, not a gate for ${inp.name})`}`, ctxTxt],
  };
  out.raw.csTotal = csTotal;

  const fvo = futuresOIConflict(inp.futuresTrend, inp.oiObv);
  out.raw.fvo = fvo;
  const confLines: VerdictLine[] = [];
  if (fvo) {
    out.lines.push({ ok: false, text: 'Futures vs OI/OBV disagree — unconfirmed, lower conviction.' });
    confLines.push({ ok: false, text: 'Futures vs OI/OBV disagree — unconfirmed.' });
  } else if (bias !== 0) {
    out.lines.push({ ok: true, text: 'Futures and OI/OBV agree — confirms the bias.' });
    confLines.push({ ok: true, text: 'Futures and OI/OBV agree.' });
  }

  // LOCATION: is spot near a wall that matches the bias?
  const mpd = inp.mpd;
  let spot: number | null = mpd ? mpd.spot : null;
  if (!spot) spot = inp.trendLtp ?? null;
  let wall: { strike: number; distPct: number } | null = null;
  if (bias !== 0 && inp.rows.length && spot) {
    for (const item of inp.rows) {
      let sig;
      try {
        sig = scoreOIStrike(item, !!item.ATM_STRIKE, inp.priceChange, spot);
      } catch {
        continue;
      }
      const strike = parseFloat(String(item.STRIKE));
      const matches = (bias > 0 && sig.peLabel === 'PE WRITE') || (bias < 0 && sig.ceLabel === 'CE WRITE');
      if (!matches) continue;
      const distPct = (Math.abs(strike - spot) / spot) * 100;
      if (!wall || distPct < wall.distPct) wall = { strike, distPct };
    }
  }
  if (bias !== 0) {
    if (!wall) {
      const t1 = 'No matching wall found nearby in the chain scanned — treat the bias as unconfirmed.';
      out.lines.push({ ok: false, text: t1 });
      out.location = { ok: false, label: 'No wall nearby', lines: [t1] };
    } else if (wall.distPct > DEAD_ZONE_PCT) {
      const passed = (bias < 0 && wall.strike < spot!) || (bias > 0 && wall.strike > spot!);
      const t2 = passed
        ? `Nearest matching wall is ${wall.strike} (${wall.distPct.toFixed(2)}% away) but price has already moved ${bias < 0 ? 'above' : 'below'} it, so it is a level price went through, not one it is approaching. No wall ${bias < 0 ? 'above' : 'below'} price to enter against.`
        : `Nearest matching wall is ${wall.strike} (${wall.distPct.toFixed(2)}% away) — spot is in a dead zone right now. Wait for price to reach it before entering.`;
      out.lines.push({ ok: false, text: t2 });
      out.location = { ok: false, label: passed ? `Price already past the ${wall.strike} wall (${wall.distPct.toFixed(1)}%)` : `Dead zone (${wall.distPct.toFixed(1)}% from ${wall.strike})`, lines: [t2] };
    } else {
      const t3 = `Spot is near the ${wall.strike} wall (${wall.distPct.toFixed(2)}% away) — this is where the ${bias > 0 ? 'support' : 'resistance'} actually is.`;
      out.lines.push({ ok: true, text: t3 });
      out.location = { ok: true, label: `At wall ${wall.strike} (${wall.distPct.toFixed(2)}%)`, lines: [t3] };
    }
    out.raw.wallDistPct = wall ? wall.distPct : null;

    // Market Profile value area: only upgrades an unconfirmed location
    const mp = marketProfile(inp.spotCandles);
    if (mp && spot && !out.location.ok) {
      const target = bias > 0 ? mp.val : mp.vah;
      const dist = (Math.abs(spot - target) / spot) * 100;
      if (dist <= DEAD_ZONE_PCT) {
        const tMp = `Not near an OI wall, but spot is near the Market Profile ${bias > 0 ? 'Value Area Low' : 'Value Area High'} (${target.toFixed(0)}, ${dist.toFixed(2)}% away) — where volume actually built up today. Treat as a secondary confirmation.`;
        out.lines.push({ ok: true, text: tMp });
        out.location = { ok: true, label: `At Value Area ${bias > 0 ? 'Low' : 'High'} ${target.toFixed(0)} (${dist.toFixed(2)}%)`, lines: out.location.lines.concat([tMp]) };
        out.raw.wallDistPct = dist;
      }
      out.raw.mpPOC = mp.poc;
      out.raw.mpVAH = mp.vah;
      out.raw.mpVAL = mp.val;
    }
  } else {
    out.location = { ok: null, label: 'N/A — no directional bias', lines: [] };
  }

  // CONFIRMATION: max pain / GEX (context and target, not a trigger)
  if (mpd) {
    const oc = maxPainOutcome(mpd);
    const t4 = `Max Pain: ${oc.label} (${mpd.maxPainK}, ${mpd.maxPainPct >= 0 ? '+' : ''}${mpd.maxPainPct.toFixed(2)}%) — expiry-horizon context, not a same-day trigger.`;
    out.lines.push({ ok: null, text: t4 });
    confLines.push({ ok: null, text: t4 });
    if (flowVsPullConflict(inp.futuresTrend ?? 0, inp.oiObv ?? 0, mpd)) {
      const t5 = `Flow vs Max Pain pull disagree — trust flow for direction, treat ${mpd.maxPainK} as a target level, not a reason to fight the flow.`;
      out.lines.push({ ok: false, text: t5 });
      confLines.push({ ok: false, text: t5 });
    }
  }

  // CONFIRMATION: live order flow, only when present
  const ofi = inp.orderFlow;
  if (ofi && bias !== 0) {
    const ofiOk = ofi.dir === 0 ? null : ofi.dir === bias;
    const t6 = ofi.text + (ofiOk === true ? ` Agrees with the ${biasLbl}.` : ofiOk === false ? ` Disagrees with the ${biasLbl} — live flow is fighting the setup.` : ' Balanced — no extra lean either way.');
    out.lines.push({ ok: ofiOk, text: t6 });
    confLines.push({ ok: ofiOk, text: t6 });
    out.raw.ofiOk = ofiOk;
    out.raw.ofiDir = ofi.dir;
  }
  const confOk = !fvo && !confLines.some((l) => l.ok === false && l.text.indexOf('Max Pain') === -1);
  out.confirmation = { ok: bias === 0 ? null : confOk, label: bias === 0 ? 'N/A' : confOk ? 'Signals agree' : 'Signals disagree', lines: confLines.map((l) => l.text) };

  // final label
  const actionable = bias !== 0 && wall !== null && wall.distPct <= DEAD_ZONE_PCT && !fvo;
  if (bias === 0) out.label = 'WAIT';
  else if (!actionable) {
    out.label = bias > 0 ? 'LONG bias — WAIT' : 'SHORT bias — WAIT';
    const why: string[] = [];
    if (!(wall && wall.distPct <= DEAD_ZONE_PCT)) why.push(`no OI wall within ${DEAD_ZONE_PCT}% of price${out.location.ok && /Value Area/.test(out.location.label || '') ? ' (the Value Area read confirms the location but does not replace a wall)' : ''}`);
    if (fvo) why.push('futures and OI/OBV disagree');
    if (why.length) out.lines.push({ ok: false, text: `Stays WAIT: ${why.join('; ')}. Actionable needs an OI wall at price, and futures and OI/OBV agreeing.` });
  } else {
    out.label = bias > 0 ? 'LONG' : 'SHORT';
    const entry = wall!.strike;
    const stopDist = Math.max(wall!.strike * 0.004, 1);
    const stop = bias > 0 ? entry - stopDist : entry + stopDist;
    const target = mpd && ((bias > 0 && mpd.maxPainK > entry) || (bias < 0 && mpd.maxPainK < entry)) ? mpd.maxPainK : bias > 0 ? entry + stopDist * 2 : entry - stopDist * 2;
    out.trade = { dir: out.label, entry, stop: stop.toFixed(0), target: target.toFixed(0) };
  }
  return out;
}

/** `_gtbIsHighConviction`: a stricter screen on the same verdict (score past 5, spot at the wall within 0.15%, live order flow agreeing). */
export function isHighConviction(v: Verdict | null): boolean {
  if (!v || !v.trade || !v.raw) return false;
  if (Math.abs(v.raw.csTotal) < 5) return false;
  if (v.raw.wallDistPct === null || v.raw.wallDistPct > 0.15) return false;
  if (v.raw.fvo) return false;
  if (v.raw.ofiOk !== true) return false;
  return true;
}
