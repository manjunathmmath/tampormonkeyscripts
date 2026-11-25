import type { Candle } from '../kite/client.js';
import { buildRows, comboStats, dayMap, type ComboRow, type ComboStats, type DayData } from '../engine/combo.js';
import type { StrikeDiffMap } from '../engine/levels.js';
import { predict, type Prediction } from '../engine/predict.js';
import { norm915 } from '../engine/marketSignal.js';
import type { KeyValueStore } from '../store/fileStore.js';
import type { FuturesResult } from './futures.js';
import { trimCandles } from './history.js';
import type { MarketResult } from './market.js';
import type { OiAnalysis } from './oi.js';
import type { ScoreResult } from './score.js';

type Req = { day: string; asOf?: string };
const NAMES = ['NIFTY 50', 'SENSEX', 'NIFTY BANK', 'GIFT NIFTY'];

export interface ComboDeps {
  history: { candles(q: { token: number; interval: '5minute' | 'day'; from: string; to: string }): Promise<Candle[]> };
  tokens: () => Record<string, number>;
  strikeDiffs: () => StrikeDiffMap;
  store: KeyValueStore;
  now?: () => number;
}

export interface ComboTableRow {
  key: string;
  outcome: string;
  days: number;
  legs: number;
  winPct: number | null;
  stats: ComboStats | null;
}

const addDays = (day: string, n: number): string => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

/**
 * The 9:15 combo backtest of the last ~year: for each day the combo of NIFTY 50 / SENSEX / NIFTY BANK 9:15 closes, the legs it implies and how they did to 12:00.
 * Rebuilt once a day (a finished day never changes) and saved. Descriptive history of a hand-authored plan: not a forecast, and one year of one market.
 */
export class ComboService {
  private mem = new Map<string, ComboRow[]>();
  constructor(private readonly d: ComboDeps) {}

  private today(): string {
    return new Date((this.d.now ?? Date.now)() + 19800000).toISOString().slice(0, 10);
  }

  /** the rows, newest first; the first call of a day fetches about a year of 5-minute candles for four instruments */
  async rows(lookback = 250): Promise<ComboRow[]> {
    const day = this.today();
    const key = `combo-rows-${day}-${lookback}`;
    const hit = this.mem.get(key) ?? this.d.store.get<ComboRow[]>(key);
    if (hit) {
      this.mem.set(key, hit);
      return hit;
    }
    const tokens = this.d.tokens();
    const diffs = this.d.strikeDiffs();
    const from = addDays(day, -(Math.ceil(lookback * 1.5) + 10));
    const byInstr: Record<string, Record<string, DayData>> = {};
    await Promise.all(
      NAMES.map(async (name) => {
        const tok = tokens[name];
        if (!tok) {
          byInstr[name] = {};
          return;
        }
        const c = await this.d.history.candles({ token: tok, interval: '5minute', from, to: day });
        byInstr[name] = dayMap(name, c as never, diffs);
      }),
    );
    const vixMap: Record<string, number> = {};
    const vt = tokens['INDIA VIX'];
    if (vt) {
      try {
        for (const c of await this.d.history.candles({ token: vt, interval: 'day', from, to: day })) vixMap[String(c[0]).slice(0, 10)] = c[1];
      } catch {
        /* no VIX: the bands stay empty */
      }
    }
    const rows = buildRows(byInstr, vixMap, lookback, diffs);
    this.d.store.set(key, rows);
    this.mem.set(key, rows);
    return rows;
  }

  /** the per-combo table: days seen, legs and the win rate of the legs, with the level / trend entry split */
  async table(lookback = 250): Promise<{ asOf: string; days: number; combos: ComboTableRow[] }> {
    const rows = await this.rows(lookback);
    const byKey = new Map<string, ComboRow[]>();
    for (const r of rows) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
    const combos = [...byKey.entries()]
      .map(([key, rs]) => {
        const st = comboStats(rows, key);
        return { key, outcome: rs[0]!.outcome, days: rs.length, legs: st?.legs ?? 0, winPct: st?.winPct ?? null, stats: st };
      })
      .sort((a, b) => b.days - a.days);
    return { asOf: this.today(), days: rows.length, combos };
  }

  async statsFor(comboKey: string): Promise<ComboStats | null> {
    return comboStats(await this.rows(), comboKey);
  }
}

export interface PredictDeps {
  combo: { statsFor(key: string): Promise<ComboStats | null> };
  market: { load(r: Req): Promise<MarketResult> };
  score: { load(r: Req & { name: string }): Promise<ScoreResult> };
  oi: { analyse(r: Req & { name: string }): Promise<OiAnalysis> };
  futures: { load(r: Req & { name: string }): Promise<FuturesResult> };
  indiaVix: (r: Req) => Promise<number>;
  includeLagging?: () => boolean;
  /** the Live Context price gate for NIFTY 50 */
  lxGate?: (r: Req, dir: number) => Promise<{ ok: boolean } | null>;
}

export interface PredictionView extends Prediction {
  day: string;
  asOf: string | null;
  /** true when no backtest matches today's combo: the percentages are then a hand-set lean, not measured odds */
  unvalidated: boolean;
  unavailable: string[];
}

/** The Predict card: today's 9:15 combo gives a base lean (the backtested win rate when there is one), ten live signals nudge it. */
export class PredictService {
  constructor(private readonly d: PredictDeps) {}

  async load(req: Req): Promise<PredictionView> {
    const { day, asOf } = req;
    const [mkt, n50, bank, oi, fut, vix] = await Promise.all([
      this.d.market.load(req),
      this.d.score.load({ ...req, name: 'NIFTY 50' }),
      this.d.score.load({ ...req, name: 'NIFTY BANK' }).catch(() => null),
      this.d.oi.analyse({ ...req, name: 'NIFTY 50' }).catch(() => null),
      this.d.futures.load({ ...req, name: 'NIFTY 50' }).catch(() => null),
      this.d.indiaVix(req).catch(() => 0),
    ]);
    const zones = { nifty: n50.zone, sensex: null as string | null, bank: bank?.zone ?? null, gift: null as string | null };
    // SENSEX and GIFT NIFTY zones come from the market read's 9:15 scores
    const p = mkt.parts;
    const fromScore = (s: number): string | null => (s === 2 ? 'AST' : s === 1 ? 'ASO' : s === -1 ? 'BSO' : s === -2 ? 'BST' : null);
    zones.sensex = fromScore(p.nine15.sensex);
    zones.gift = fromScore(p.nine15.gift);
    const comboKey = `${norm915(zones.nifty)}-${norm915(zones.sensex)}-${norm915(zones.bank)}`;
    const stats = await this.d.combo.statsFor(comboKey).catch(() => null);
    const tr = n50.trend;
    const lead = p.nine15.all + p.nine15.nifty50 + p.nine15.bank + p.nine15.gift + p.nine15.sensex + p.ad.all + p.ad.nifty50 + p.ad.bank + p.fut.all + p.fut.nifty50 + p.fut.bank;
    const gate = this.d.lxGate;
    const pre = predict({
      zones,
      comboStats: stats,
      leadScore: lead,
      n50Fut: n50.futures?.dir ?? 0,
      bnFut: bank?.futures?.dir ?? 0,
      adAll: p.ad.all,
      futAll: p.fut.all,
      n50Avwap: fut?.vwapPrice ?? 0,
      n50Ltp: tr?.ltp ?? 0,
      oiNet: (p.oiObv[0] ?? 0) + (p.oiObv[1] ?? 0),
      mpNet: (p.maxPain[0] ?? 0) + (p.maxPain[1] ?? 0),
      ivNet: (p.ivSkew[0] ?? 0) + (p.ivSkew[1] ?? 0),
      pcr50: parseFloat(oi?.pcr ?? '1') || 1,
      compN50: p.component.nifty50,
      compBN: p.component.bank,
      indiaVix: vix,
      n50Trends: tr?.trends ?? [],
      strike: tr ? tr.levels : null,
      includeLagging: this.d.includeLagging?.() ?? true,
      lxGate: null,
    });
    // the Live Context gate is asynchronous here, so it is applied after the numbers (same rule: a BUY / SELL waits while price is not confirming)
    let out = pre;
    if (gate && (pre.tradeAction === 'BUY CE' || pre.tradeAction === 'BUY PE')) {
      const g = await gate(req, pre.tradeAction === 'BUY CE' ? 1 : -1).catch(() => null);
      out = { ...pre, priceGate: g, tradeAction: g && !g.ok ? 'WAIT: PRICE NOT CONFIRMING' : pre.tradeAction };
    }
    return { ...out, day, asOf: asOf ?? null, unvalidated: !stats, unavailable: ['GIFT NIFTY zone is read from the 9:15 scan score'] };
  }
}

/** India VIX last price of the day up to the snapshot time (0 when unknown) */
export function indiaVixReader(history: { candles(q: { token: number; interval: '5minute'; from: string; to: string; asOf?: string }): Promise<Candle[]> }, tokens: () => Record<string, number>): (r: Req) => Promise<number> {
  return async (r) => {
    const t = tokens()['INDIA VIX'];
    if (!t) return 0;
    const c = trimCandles(await history.candles({ token: t, interval: '5minute', from: r.day, to: r.day, asOf: r.asOf }), r.day, r.asOf ?? null);
    return c.length ? c[c.length - 1]![4] : 0;
  };
}
