import { futuresRemarkSeries, reconstructFutAccuracy, type AccMap, type RemarkPoint } from '../engine/futAccuracy.js';
import type { FutCandle, FutQuote } from '../engine/futures.js';

type Req = { name: string; day: string; asOf?: string };

export interface FutAccDeps {
  futures: { series(r: Req): Promise<{ intraday: FutCandle[]; prev: FutQuote; lot: number; vix: number }> };
  now?: () => number;
}

/** How reliable each futures remark of an instrument has been today (win rate on the next 5-minute move). Recomputed at most once per 5-minute slot. */
export class FutAccuracyService {
  private cache = new Map<string, { slot: number; v: AccMap }>();

  invalidate(): void {
    this.cache.clear();
    this.seriesCache.clear();
  }
  constructor(private readonly d: FutAccDeps) {}

  /** the remark after each candle of the day, cached per 5-minute slot */
  private seriesCache = new Map<string, { slot: number; v: RemarkPoint[] }>();
  async remarks(req: Req): Promise<RemarkPoint[]> {
    const nowMs = (this.d.now ?? Date.now)();
    const slot = req.asOf ? 0 : Math.floor(nowMs / 300000);
    const key = `${req.name}|${req.day}|${req.asOf ?? ''}`;
    const hit = this.seriesCache.get(key);
    if (hit && hit.slot === slot) return hit.v;
    const s = await this.d.futures.series(req);
    const v = futuresRemarkSeries(s.intraday, s.prev, s.lot, s.vix);
    this.seriesCache.set(key, { slot, v });
    return v;
  }

  async load(req: Req): Promise<AccMap> {
    const nowMs = (this.d.now ?? Date.now)();
    const slot = req.asOf ? 0 : Math.floor(nowMs / 300000);
    const key = `${req.name}|${req.day}|${req.asOf ?? ''}`;
    const hit = this.cache.get(key);
    if (hit && hit.slot === slot) return hit.v;
    const s = await this.d.futures.series(req);
    const v = reconstructFutAccuracy(s.intraday, s.prev, s.lot, s.vix, {});
    this.cache.set(key, { slot, v });
    return v;
  }
}
