import type { Candle } from '../kite/client.js';
import { classifyZone, getStrikeDiff, strikeDetails, type StrikeDiffMap, type Zone } from '../engine/levels.js';
import { instrumentScore, type InstrumentScore } from '../engine/score.js';
import { makeTrend, type Trend } from '../engine/trend.js';
import type { FuturesResult } from './futures.js';
import type { OiAnalysis } from './oi.js';
import { previousDayFor, trimCandles } from './history.js';

export interface ScoreDeps {
  history: { candles(q: { token: number; interval: '5minute' | 'day'; from: string; to: string; oi?: boolean; asOf?: string }): Promise<Candle[]> };
  tokens: () => Record<string, number>;
  strikeDiffs: () => StrikeDiffMap;
  /** the saved 9:15 scan of a day, if any */
  scanZone: (day: string, name: string) => Zone | undefined;
  futures: { load(req: { name: string; day: string; asOf?: string }): Promise<FuturesResult> };
  oi: { analyse(req: { name: string; day: string; asOf?: string }): Promise<OiAnalysis> };
  holidays?: () => ReadonlySet<string>;
  /** commodities (MCX): their levels and trend come from the futures contract, the first candle's open and the CBOE volatility index */
  commodity?: { is(name: string): boolean; levels(r: { name: string; day: string; asOf?: string }): Promise<{ zone: string; trend: NonNullable<ScoreResult['trend']> }> };
}

export interface ScoreResult {
  name: string;
  day: string;
  asOf: string | null;
  score: InstrumentScore;
  /** which parts could not be read (they count as 0, like a missing value in the userscript) */
  missing: string[];
  zone: string | null;
  trend: { ltp: number; open: number; prevPrice: number; change: string; trends: string[]; levels: { ast: number; aso: number; bso: number; bst: number }; vixRange: number; vixUpper: number; vixLower: number } | null;
  futures: { remark: string; dir: number } | null;
  oi: { score: number; maxPainScore: number; ivSkewScore: number; ivSkew: number | null } | null;
}

const last = <T>(a: T[]): T | undefined => a[a.length - 1];

/**
 * The instrument score of a name at a moment: gathers the six parts the way the dashboard does (9:15 zone, price vs the 9:15 levels, futures remark,
 * OI/OBV, max pain, IV skew) and sums them with `instrumentScore`. A part that cannot be read counts as 0 and is listed in `missing`.
 */
export class ScoreService {
  constructor(private readonly d: ScoreDeps) {}

  async load(req: { name: string; day: string; asOf?: string }): Promise<ScoreResult> {
    const { name, day, asOf } = req;
    const missing: string[] = [];
    const token = this.d.tokens()[name];
    const prevDay = previousDayFor(name, day, this.d.holidays?.() ?? new Set());

    // price vs the 9:15 levels
    let trend: Trend | null = null;
    let zone: string | null = this.d.scanZone(day, name) ?? null;
    let mcxTrend: ScoreResult['trend'] = null;
    if (this.d.commodity?.is(name)) {
      try {
        const lv = await this.d.commodity.levels({ name, day, asOf });
        mcxTrend = lv.trend;
        zone = lv.zone;
      } catch {
        missing.push('trend');
      }
    } else if (token) {
      try {
        const raw = await this.d.history.candles({ token, interval: '5minute', from: day, to: day, asOf });
        const cs = trimCandles(raw, day, asOf ?? null);
        const first = cs[0];
        const lastC = last(cs);
        const [pd, vd] = await Promise.all([
          this.d.history.candles({ token, interval: 'day', from: prevDay, to: prevDay }),
          this.d.tokens()['INDIA VIX'] ? this.d.history.candles({ token: this.d.tokens()['INDIA VIX']!, interval: 'day', from: prevDay, to: prevDay }) : Promise.resolve([] as Candle[]),
        ]);
        const prevClose = last(pd)?.[4];
        const vixPrev = last(vd)?.[4];
        if (first && lastC && prevClose && vixPrev) {
          const diff = getStrikeDiff(name, this.d.strikeDiffs()).diff;
          const levels = strikeDetails(first[1], diff);
          trend = makeTrend({ ltp: lastC[4], open: first[1], prevPrice: prevClose, strikeData: levels, prevVixClose: vixPrev });
          if (!zone) zone = classifyZone(first[4], levels);
        } else missing.push('trend');
      } catch {
        missing.push('trend');
      }
    } else missing.push('trend');
    if (!zone) missing.push('nine_fifteen');

    let fut: FuturesResult | null = null;
    try {
      fut = await this.d.futures.load({ name, day, asOf });
    } catch {
      missing.push('futures_trend');
    }
    let oi: OiAnalysis | null = null;
    try {
      oi = await this.d.oi.analyse({ name, day, asOf });
    } catch {
      missing.push('oi_obv', 'max_pain', 'iv_skew');
    }

    const score = instrumentScore({ zone, trends: trend?.trends ?? mcxTrend?.trends, futuresTrend: fut?.dir, oiObv: oi?.oiScore, maxPain: oi?.maxPainScore, ivSkew: oi?.ivSkewScore });
    return {
      name,
      day,
      asOf: asOf ?? null,
      score,
      missing,
      zone,
      trend: mcxTrend ?? (trend ? { ltp: trend.ltp, open: trend.open, prevPrice: trend.prevPrice, change: trend.change, trends: [...trend.trends], levels: { ...trend.strikeData }, vixRange: parseFloat(trend.vix.vixDDRange) || 0, vixUpper: parseFloat(trend.vix.vixDDUpper) || 0, vixLower: parseFloat(trend.vix.vixDDLower) || 0 } : null),
      futures: fut ? { remark: fut.remark, dir: fut.dir } : null,
      oi: oi ? { score: oi.oiScore, maxPainScore: oi.maxPainScore, ivSkewScore: oi.ivSkewScore, ivSkew: oi.ivSkew } : null,
    };
  }
}
