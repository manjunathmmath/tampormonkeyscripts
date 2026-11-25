import type { Candle } from '../kite/client.js';
import type { Tick } from './ticks.js';

/**
 * 5-minute candle builder from ticks. Faithful port of `_lcApply` / `_lcBucket` / `_lcTickMs` in static/autoTrade/liveFeed.js:
 * - the bucket is the 5-minute slot (IST) of the tick's exchange timestamp when it is within 2 minutes of arrival, else of the arrival time;
 * - open = first tick, high / low tracked, close = last tick;
 * - volume of a candle = growth of the day's cumulative volume since the previous tick (a drop in the cumulative resets the baseline);
 * - open interest = the last tick's OI (carried from the previous candle when a tick has none); spot instruments have no OI column;
 * - a tick for an older bucket (late, across a boundary) is ignored; at most 900 candles are kept.
 */
export const MAX_CANDLES = 900;
const IST_MS = 5.5 * 3600 * 1000;

const pad = (n: number): string => (n < 10 ? '0' : '') + n;

export function bucketOf(ms: number): string {
  const d = new Date(ms + IST_MS);
  const m = Math.floor(d.getUTCMinutes() / 5) * 5;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(m)}:00+0530`;
}

export function dayOf(ms: number): string {
  const d = new Date(ms + IST_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function tickMs(t: Pick<Tick, 'ts'>, now: number): number {
  if (t.ts && Math.abs(t.ts * 1000 - now) < 120000) return t.ts * 1000;
  return now;
}

export interface SeriesState {
  candles: Candle[];
  hasOi: boolean;
  /** last cumulative day volume seen (null = none yet) */
  lastCum: number | null;
}

export function newSeries(hasOi: boolean, seed: Candle[] = []): SeriesState {
  return { candles: seed.map((c) => [...c] as Candle), hasOi, lastCum: null };
}

export function applyTick(st: SeriesState, t: Pick<Tick, 'ltp' | 'volume' | 'oi' | 'ts'>, now: number, countVol = true): void {
  const b = bucketOf(tickMs(t, now));
  let dv = 0;
  if (t.volume != null) {
    if (st.lastCum != null && t.volume >= st.lastCum) dv = t.volume - st.lastCum;
    st.lastCum = t.volume;
  }
  if (!countVol) dv = 0;
  const arr = st.candles;
  const last = arr[arr.length - 1];
  if (last && last[0].slice(0, 16) === b.slice(0, 16)) {
    if (t.ltp > last[2]) last[2] = t.ltp;
    if (t.ltp < last[3]) last[3] = t.ltp;
    last[4] = t.ltp;
    last[5] = (last[5] || 0) + dv;
    if (st.hasOi && t.oi != null) last[6] = t.oi;
  } else if (!last || b.slice(0, 16) > last[0].slice(0, 16)) {
    const c: Candle = [b, t.ltp, t.ltp, t.ltp, t.ltp, dv];
    if (st.hasOi) c.push(t.oi != null ? t.oi : last && last[6] != null ? last[6] : 0);
    arr.push(c);
    if (arr.length > MAX_CANDLES) arr.splice(0, arr.length - MAX_CANDLES);
  }
}
