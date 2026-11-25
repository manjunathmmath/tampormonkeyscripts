/**
 * Futures remark accuracy: a faithful port of `_gtbReconstructFutAccuracy` (grootTradeBot.js). It replays today's 5-minute futures candles one by one, classifies
 * each with the same remark logic, and checks the direction against the NEXT 5-minute move (and the move to the last close). The Master Consensus trusts a
 * remark's weight more (3) or less (0.5) according to this record once it has at least 8 samples.
 */
import { classifyFutures, type FutCandle, type FutQuote } from './futures.js';

export interface AccEntry {
  hits: number;
  total: number;
  pts: number;
  eodPts: number;
}

export type AccMap = Record<string, AccEntry>;

/** Adds today's candles of one instrument to `accMap` (several instruments can share one map). Candles are needed on both sides of the one classified, so the first and last are skipped. */
export function reconstructFutAccuracy(intr: FutCandle[], prevDay: FutQuote, lot: number, vix: number, accMap: AccMap): AccMap {
  if (!intr.length) return accMap;
  const lastClose = intr[intr.length - 1]!.close;
  for (let i = 1; i < intr.length - 1; i++) {
    const upTo = intr.slice(0, i + 1);
    let hi = 0;
    let lo = Infinity;
    let vol = 0;
    for (let j = 0; j <= i; j++) {
      hi = Math.max(hi, intr[j]!.high);
      lo = Math.min(lo, intr[j]!.low);
      vol += intr[j]!.volume || 0;
    }
    const synth = { date: intr[i]!.date, open: intr[0]!.open, high: hi, low: lo, close: intr[i]!.close, volume: vol, oi: intr[i]!.oi };
    const res = classifyFutures(synth as FutQuote, prevDay, lot, upTo, { vix, baselineVix: 13 });
    const dir = res.dir;
    if (dir === 0) continue;
    const realized = intr[i + 1]!.close - intr[i]!.close;
    const eodMove = lastClose - intr[i]!.close;
    const a = accMap[res.remark] || { hits: 0, total: 0, pts: 0, eodPts: 0 };
    a.total++;
    if ((dir > 0 && realized > 0) || (dir < 0 && realized < 0)) a.hits++;
    a.pts += dir > 0 ? realized : -realized;
    a.eodPts += dir > 0 ? eodMove : -eodMove;
    accMap[res.remark] = a;
  }
  return accMap;
}


export interface RemarkPoint {
  /** HH:MM of the candle */
  t: string;
  remark: string;
  dir: number;
}

/** the futures remark after each 5-minute candle of the day, classified the way the accuracy replay does (the strip under the chart) */
export function futuresRemarkSeries(intr: FutCandle[], prevDay: FutQuote, lot: number, vix: number): RemarkPoint[] {
  const out: RemarkPoint[] = [];
  let hi = 0;
  let lo = Infinity;
  let vol = 0;
  for (let i = 0; i < intr.length; i++) {
    hi = Math.max(hi, intr[i]!.high);
    lo = Math.min(lo, intr[i]!.low);
    vol += intr[i]!.volume || 0;
    const synth = { date: intr[i]!.date, open: intr[0]!.open, high: hi, low: lo, close: intr[i]!.close, volume: vol, oi: intr[i]!.oi };
    const res = classifyFutures(synth as FutQuote, prevDay, lot, intr.slice(0, i + 1), { vix, baselineVix: 13 });
    out.push({ t: String(intr[i]!.date), remark: res.remark, dir: res.dir });
  }
  return out;
}
