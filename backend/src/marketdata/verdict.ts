import { computeMaxPainGEX, type OiRow } from '../engine/oi.js';
import { buildVerdict, isHighConviction, type Verdict } from '../engine/verdict.js';
import type { Candle } from '../kite/client.js';
import { trimCandles } from './history.js';
import type { ScoreResult } from './score.js';

export interface VerdictDeps {
  score: { load(req: { name: string; day: string; asOf?: string }): Promise<ScoreResult> };
  oi: { chainRaw(req: { name: string; day: string; asOf?: string }): Promise<{ rows: OiRow[]; spotCandles: Candle[] }> };
  history: { candles(q: { token: number; interval: '5minute'; from: string; to: string; asOf?: string }): Promise<Candle[]> };
  tokens: () => Record<string, number>;
  /** Settings: the warning level of each CBOE index (OVX) */
  volExtreme?: () => Record<string, number>;
  /** commodities use their own CBOE volatility index instead of India VIX */
  commodity?: { is(name: string): boolean; levels(req: { name: string; day: string; asOf?: string }): Promise<{ vol: { key: string; value: number | null; source: string } }> };
}

export interface VerdictResult extends Verdict {
  name: string;
  day: string;
  asOf: string | null;
  highConviction: boolean;
  /** engines not built here yet: the live order-flow read */
  unavailable: string[];
  inputs: { csTotal: number; indiaVix: number | null; spot: number | null };
}

/** The wall verdict (LONG / SHORT / WAIT with entry, stop and target) of a name at a moment. A commodity reads its own volatility index (OVX, GVZ, VXSLV, the VIX proxy, USDINR fixed). */
export class VerdictService {
  constructor(private readonly d: VerdictDeps) {}

  async load(req: { name: string; day: string; asOf?: string }): Promise<VerdictResult> {
    const { name, day, asOf } = req;
    const score = await this.d.score.load(req);
    let rows: OiRow[] = [];
    let spotCandles: Candle[] = [];
    try {
      const raw = await this.d.oi.chainRaw(req);
      rows = raw.rows;
      spotCandles = raw.spotCandles;
    } catch {
      /* no option chain: the verdict has no wall to look at and says so */
    }
    let vix = 0;
    let volLabel = 'India VIX';
    const vt = this.d.tokens()['INDIA VIX'];
    if (this.d.commodity?.is(name)) {
      try {
        const lv = (await this.d.commodity.levels(req)).vol;
        vix = lv.value ?? 0;
        volLabel = lv.key === 'FIXED' ? 'USDINR (fixed)' : lv.source === 'VIX proxy' || lv.key === 'VIX' ? 'VIX (proxy)' : lv.key;
      } catch {
        vix = 0;
      }
    } else if (vt) {
      try {
        const cs = trimCandles(await this.d.history.candles({ token: vt, interval: '5minute', from: day, to: day, asOf }), day, asOf ?? null);
        vix = cs[cs.length - 1]?.[4] ?? 0;
      } catch {
        vix = 0;
      }
    }
    const mpd = computeMaxPainGEX(rows);
    const v = buildVerdict({
      name,
      vol: { label: volLabel, value: vix },
      volExtreme: this.d.volExtreme?.(),
      csTotal: score.score.total,
      futuresTrend: score.futures?.dir,
      oiObv: score.score.oi_obv,
      rows,
      spotCandles,
      priceChange: parseFloat(score.trend?.change ?? '0') || 0,
      mpd,
      trendLtp: score.trend?.ltp ?? null,
      orderFlow: null,
    });
    return { ...v, name, day, asOf: asOf ?? null, highConviction: isHighConviction(v), unavailable: ['Order Flow'], inputs: { csTotal: score.score.total, indiaVix: vix || null, spot: mpd?.spot ?? score.trend?.ltp ?? null } };
  }
}
