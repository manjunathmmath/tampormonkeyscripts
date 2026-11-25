/**
 * Short covering / long unwinding: ports of `_gtbShortCoveringSignal`, `_gtbPreSqueezeScore` and the past-episode study (`_gtbSqzEpisodesForDay`,
 * `_gtbSqzFuelForDay`, `_gtbSqzFuelStats`, `_gtbSqzAnalyseDays`, `_gtbSqzFuelBadgeInner`) from grootTradeBot.js.
 * The remark is DETECTED (price above VWAP and rising with OI falling), not predicted; the 0-100 number is a hand-weighted setup score, never a fitted probability.
 */
import type { FutCandle, FutQuote, Remark } from './futures.js';

export interface AccLite {
  hits: number;
  total: number;
  eodPts?: number;
}

export interface SqueezeSignal {
  ok: true;
  type: 'SHORT_COVERING' | 'LONG_UNWINDING' | 'NONE';
  remark: string | undefined;
  active: boolean;
  daysToExpiry: number | null;
  nearExpiry: boolean;
  pcr: number | null;
  extremePositioning: boolean;
  todayChgPct: number;
  acc: { winRate: number; samples: number; avgMove: number | null; avgMovePct: number | null } | null;
  probability: number;
}

/** `_gtbShortCoveringSignal`. `acc` is today's accuracy record of the current remark for this instrument. */
export function shortCoveringSignal(i: { remark: string | undefined; daysToExpiry: number | null; pcr: number | null; todayChgPct: number; ltp: number; acc?: AccLite | null }): SqueezeSignal {
  const isCovering = i.remark === 'SHOT_COVERING';
  const isUnwinding = i.remark === 'LONG_UNWINDING';
  const type = isCovering ? 'SHORT_COVERING' : isUnwinding ? 'LONG_UNWINDING' : 'NONE';
  const nearExpiry = i.daysToExpiry !== null && i.daysToExpiry <= 2;
  let extremePositioning = false;
  if (i.pcr !== null) {
    if (isCovering && i.pcr >= 1.4) extremePositioning = true;
    if (isUnwinding && i.pcr <= 0.7) extremePositioning = true;
  }
  let acc: SqueezeSignal['acc'] = null;
  if (i.acc && i.acc.total) {
    const avgMove = i.acc.eodPts !== undefined ? i.acc.eodPts / i.acc.total : null;
    acc = { winRate: Math.round((i.acc.hits / i.acc.total) * 100), samples: i.acc.total, avgMove, avgMovePct: avgMove !== null && i.ltp ? (avgMove / i.ltp) * 100 : null };
  }
  let prob = isCovering || isUnwinding ? 40 : 15;
  if (nearExpiry) prob += 25;
  if (extremePositioning) prob += 15;
  if (acc) {
    if (acc.winRate >= 60 && acc.samples >= 8) prob += 10;
    else if (acc.winRate <= 40 && acc.samples >= 8) prob -= 10;
  }
  prob = Math.max(5, Math.min(95, prob));
  return { ok: true, type, remark: i.remark, active: isCovering || isUnwinding, daysToExpiry: i.daysToExpiry, nearExpiry, pcr: i.pcr, extremePositioning, todayChgPct: i.todayChgPct, acc, probability: prob };
}

/** The unreversed run of fresh one-sided positioning at the end of the day's remarks (SHORT = fresh shorts, LONG = fresh longs); one reading per 5-minute scan. */
export function trailingStreak(remarks: (string | null)[]): { remark: 'SHORT' | 'LONG'; streak: number } | null {
  const last = remarks[remarks.length - 1];
  if (last !== 'SHORT' && last !== 'LONG') return null;
  let n = 0;
  for (let i = remarks.length - 1; i >= 0 && remarks[i] === last; i--) n++;
  return { remark: last, streak: n };
}

export interface PreSqueeze {
  willBe: 'SHORT_COVERING' | 'LONG_UNWINDING';
  streak: number;
  pcr: number | null;
  pcrExtreme: boolean;
  daysToExpiry: number | null;
  score: number;
}

/** `_gtbPreSqueezeScore`: fuel built up for a FUTURE squeeze (null under 3 readings). `accOf` returns the day's accuracy record of the eventual squeeze remark. */
export function preSqueezeScore(st: { remark: 'SHORT' | 'LONG'; streak: number } | null, pcr: number | null, daysToExpiry: number | null, accOf: (remark: string) => AccLite | undefined): PreSqueeze | null {
  if (!st || st.streak < 3) return null;
  const willBe = st.remark === 'SHORT' ? 'SHORT_COVERING' : 'LONG_UNWINDING';
  let pts = Math.min(40, st.streak * 8);
  const pcrExtreme = pcr !== null && ((willBe === 'SHORT_COVERING' && pcr >= 1.4) || (willBe === 'LONG_UNWINDING' && pcr <= 0.7));
  if (pcrExtreme) pts += 25;
  if (daysToExpiry !== null && daysToExpiry <= 3) pts += Math.max(5, 20 - daysToExpiry * 5);
  const a = accOf(willBe);
  if (a && a.total >= 8) {
    const wr = a.hits / a.total;
    if (wr >= 0.6) pts += 15;
    else if (wr <= 0.4) pts -= 10;
  }
  return { willBe, streak: st.streak, pcr, pcrExtreme, daysToExpiry, score: Math.max(5, Math.min(95, Math.round(pts))) };
}

// ── past-episode study ────────────────────────────────────────────────────────
export const SQZ_MERGE_GAP = 6;
export const SQZ_MIN_N = 5;
export const SQZ_STUDY_DAYS = 94;
export const SQZ_FUEL_STREAK = 3;
export const SQZ_FUEL_H = 12;
export const SQZ_FUEL_MIN_TRIG = 8;

export function pctile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export interface Stats {
  n: number;
  p25: number | null;
  med: number | null;
  p75: number | null;
  p90: number | null;
  sorted: number[];
}

export function stats(arr: number[]): Stats | null {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  return { n: s.length, p25: pctile(s, 0.25), med: pctile(s, 0.5), p75: pctile(s, 0.75), p90: pctile(s, 0.9), sorted: s };
}

export interface Episode {
  dir: 'up' | 'down';
  time: string;
  dur: number;
  mfePct: number;
  closePct: number;
  legPct: number;
  date?: string;
}

export function episodesForDay(intr: FutCandle[], remarks: (string | null)[]): Episode[] {
  const out: Episode[] = [];
  for (const [dir, want] of [['up', 'SHOT_COVERING'], ['down', 'LONG_UNWINDING']] as const) {
    const isUp = dir === 'up';
    const clusters: { f: number; l: number; cnt: number }[] = [];
    for (let i = 0; i < remarks.length; i++) {
      if (remarks[i] !== want) continue;
      const last = clusters[clusters.length - 1];
      if (last && i - last.l <= SQZ_MERGE_GAP) {
        last.l = i;
        last.cnt++;
      } else clusters.push({ f: i, l: i, cnt: 1 });
    }
    const dayClose = intr[intr.length - 1]!.close;
    for (const c of clusters) {
      const onset = intr[c.f]!.close;
      if (!onset) continue;
      let ext = onset;
      let pre = isUp ? Infinity : -Infinity;
      for (let k = 0; k < intr.length; k++) {
        const h = intr[k]!.high;
        const l = intr[k]!.low;
        if (k <= c.f) pre = isUp ? Math.min(pre, l) : Math.max(pre, h);
        if (k >= c.f) ext = isUp ? Math.max(ext, h) : Math.min(ext, l);
      }
      out.push({
        dir,
        time: intr[c.f]!.date,
        dur: c.l - c.f + 1,
        mfePct: isUp ? ((ext - onset) / onset) * 100 : ((onset - ext) / onset) * 100,
        closePct: isUp ? ((dayClose - onset) / onset) * 100 : ((onset - dayClose) / onset) * 100,
        legPct: isUp ? ((ext - pre) / pre) * 100 : ((pre - ext) / pre) * 100,
      });
    }
  }
  return out;
}

export interface FuelDay {
  n: number;
  hasDay: number[];
  hasH: number[];
  trig: number[];
}

export function fuelForDay(remarks: (string | null)[], fuelRemark: string, targetRemark: string): FuelDay {
  const n = remarks.length;
  const hasDay = new Array<number>(n).fill(0);
  const hasH = new Array<number>(n).fill(0);
  let nextT = Infinity;
  for (let i = n - 1; i >= 0; i--) {
    hasDay[i] = nextT !== Infinity ? 1 : 0;
    hasH[i] = nextT - i <= SQZ_FUEL_H ? 1 : 0;
    if (remarks[i] === targetRemark) nextT = i;
  }
  const trig: number[] = [];
  for (let s = 0; s < n; ) {
    if (remarks[s] !== fuelRemark) {
      s++;
      continue;
    }
    let e = s;
    while (e + 1 < n && remarks[e + 1] === fuelRemark) e++;
    if (e - s + 1 >= SQZ_FUEL_STREAK && s + SQZ_FUEL_STREAK - 1 < n - 1) trig.push(s + SQZ_FUEL_STREAK - 1);
    s = e + 1;
  }
  return { n, hasDay, hasH, trig };
}

export interface FuelStats {
  trig: number;
  days: number;
  hitDay?: number;
  baseDay?: number;
  hitH?: number;
  baseH?: number;
  liftDay?: number | null;
  zDay?: number;
  zH?: number;
}

export function fuelStats(entries: FuelDay[]): FuelStats {
  let maxN = 0;
  for (const e of entries) if (e.n > maxN) maxN = e.n;
  const cnt = new Array<number>(maxN).fill(0);
  const sd = new Array<number>(maxN).fill(0);
  const sh = new Array<number>(maxN).fill(0);
  for (const e of entries) {
    for (let i = 0; i < e.n; i++) {
      cnt[i]!++;
      sd[i]! += e.hasDay[i]!;
      sh[i]! += e.hasH[i]!;
    }
  }
  let trig = 0;
  let hitD = 0;
  let hitH = 0;
  let bD = 0;
  let bH = 0;
  for (const e of entries) {
    for (const t of e.trig) {
      trig++;
      hitD += e.hasDay[t]!;
      hitH += e.hasH[t]!;
      bD += sd[t]! / cnt[t]!;
      bH += sh[t]! / cnt[t]!;
    }
  }
  if (!trig) return { trig: 0, days: entries.length };
  const rate = hitD / trig;
  const base = bD / trig;
  const rateH = hitH / trig;
  const baseH = bH / trig;
  const z = (r: number, b: number): number => (r - b) / Math.sqrt(Math.max(b * (1 - b), 1e-9) / trig);
  return { trig, days: entries.length, hitDay: rate, baseDay: base, hitH: rateH, baseH, liftDay: base > 0 ? rate / base : null, zDay: z(rate, base), zH: z(rateH, baseH) };
}

export type Classify = (quote: FutQuote & { date: string; open: number }, prev: FutQuote & { open: number }, lot: number, upTo: FutCandle[], opts: { vix: number; baselineVix: number }) => { remark: Remark | string };

export interface StudyResult {
  days: number;
  episodes: number;
  fuel: { up: FuelStats; down: FuelStats };
  up: StudyDir;
  down: StudyDir;
}

export interface StudyDir {
  n: number;
  mfe: Stats | null;
  close: Stats | null;
  leg: Stats | null;
  dur: Stats | null;
}

/** `_gtbSqzAnalyseDays`: `days` are past sessions oldest to newest; the classifier is injected (the live futures classifier in the service). */
export function analyseDays(days: { date: string; intr: FutCandle[] }[], lot: number, vix: number, classify: Classify): StudyResult {
  const episodes: Episode[] = [];
  const fuelDays = { up: [] as FuelDay[], down: [] as FuelDay[] };
  for (let d = 1; d < days.length; d++) {
    const intr = days[d]!.intr;
    const p = days[d - 1]!.intr;
    if (intr.length < 20 || p.length < 20) continue;
    const prevDay = {
      open: p[0]!.open,
      high: Math.max(...p.map((c) => c.high)),
      low: Math.min(...p.map((c) => c.low)),
      close: p[p.length - 1]!.close,
      volume: p.reduce((s, c) => s + (c.volume || 0), 0),
      oi: p[p.length - 1]!.oi,
    };
    const remarks: (string | null)[] = new Array(intr.length).fill(null);
    let hi = 0;
    let lo = Infinity;
    let vol = 0;
    for (let i = 0; i < intr.length; i++) {
      hi = Math.max(hi, intr[i]!.high);
      lo = Math.min(lo, intr[i]!.low);
      vol += intr[i]!.volume || 0;
      if (i < 1) continue;
      try {
        const synth = { date: intr[i]!.date, open: intr[0]!.open, high: hi, low: lo, close: intr[i]!.close, volume: vol, oi: intr[i]!.oi };
        remarks[i] = classify(synth, prevDay, lot, intr.slice(0, i + 1), { vix, baselineVix: 13 }).remark;
      } catch {
        remarks[i] = null;
      }
    }
    for (const e of episodesForDay(intr, remarks)) episodes.push({ ...e, date: days[d]!.date });
    fuelDays.up.push(fuelForDay(remarks, 'SHORT', 'SHOT_COVERING'));
    fuelDays.down.push(fuelForDay(remarks, 'LONG', 'LONG_UNWINDING'));
  }
  const dirOf = (dir: 'up' | 'down'): StudyDir => {
    const pick = (f: 'mfePct' | 'closePct' | 'legPct' | 'dur'): number[] => episodes.filter((e) => e.dir === dir).map((e) => e[f]);
    return { n: pick('mfePct').length, mfe: stats(pick('mfePct')), close: stats(pick('closePct')), leg: stats(pick('legPct')), dur: stats(pick('dur')) };
  };
  return { days: Math.max(0, days.length - 1), episodes: episodes.length, fuel: { up: fuelStats(fuelDays.up), down: fuelStats(fuelDays.down) }, up: dirOf('up'), down: dirOf('down') };
}

/** `_gtbSqzFuelBadgeInner`: one tag for "has this build-up pattern ever been followed by the squeeze on this contract?". */
export function fuelBadge(study: StudyResult | null, isUp: boolean): { label: string; tone: 'good' | 'bad' | 'warn' | 'flat' } {
  if (!study) return { label: 'NO HISTORY', tone: 'flat' };
  const f = study.fuel[isUp ? 'up' : 'down'];
  if (!f) return { label: 'NO HISTORY', tone: 'flat' };
  if (f.trig < SQZ_FUEL_MIN_TRIG) return { label: 'TOO FEW CASES', tone: 'flat' };
  if (f.liftDay != null && f.liftDay >= 1.3 && (f.zDay as number) >= 1.64) return { label: 'HAS WORKED', tone: 'good' };
  if ((f.hitDay === 0 && f.hitH === 0) || (f.liftDay != null && f.liftDay < 1.1)) return { label: 'NO SIGNAL', tone: 'bad' };
  return { label: 'UNPROVEN', tone: 'warn' };
}
