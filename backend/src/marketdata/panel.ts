import { entryConfluence, exitCheck, nowTrade, pillars, type ExitCheck, type PanelIn } from '../engine/panel.js';
import type { FuturesResult } from './futures.js';
import type { MarketResult } from './market.js';
import type { OiAnalysis } from './oi.js';
import type { ScoreResult } from './score.js';
import type { KeyValueStore } from '../store/fileStore.js';

type Req = { name: string; day: string; asOf?: string };

export interface PanelDeps {
  market: { load(r: { day: string; asOf?: string }): Promise<MarketResult> };
  score: { load(r: Req): Promise<ScoreResult> };
  oi: { analyse(r: Req): Promise<OiAnalysis> };
  futures: { load(r: Req): Promise<FuturesResult> };
  /** the heaviest stocks of NIFTY 50 and NIFTY BANK (their option chains are loaded by the weighted table) */
  topStocks: () => string[];
  store: KeyValueStore;
  now?: () => number;
}

export interface HistoryPoint {
  t: string;
  score: number;
  leading: number;
  signal: string;
}

const NAMES5 = ['NIFTY 50', 'NIFTY BANK', 'RELIANCE', 'HDFCBANK', 'ICICIBANK'];
const hhmm = (ms: number): string => new Date(ms + 19800000).toISOString().slice(11, 16);
const mins = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * The left panel of the old dashboard in one read: Entry / Trade confluence, Now Trade, the pillars, the position exit check for both directions,
 * the stocks worth a look (Top Trades), the full score detail and the score history of the day. The history is recorded each time the panel is read for a live
 * day or a snapshot time, so it fills up as you refresh or step through a replay. Rule-based and not back-tested; it never places an order.
 */
export class PanelService {
  constructor(private readonly d: PanelDeps) {}

  async load(req: { day: string; asOf?: string }) {
    const now = (this.d.now ?? Date.now)();
    const live = req.day === new Date(now + 19800000).toISOString().slice(0, 10);
    // a past day without a snapshot time is read at the end of its session
    const at = req.asOf ?? (live ? hhmm(now) : '15:25');
    const R = (name: string): Req => ({ ...req, name });
    const [mk, n50, bn, oi, fut] = await Promise.all([
      this.d.market.load(req),
      this.d.score.load(R('NIFTY 50')),
      this.d.score.load(R('NIFTY BANK')),
      this.d.oi.analyse(R('NIFTY 50')).catch(() => null),
      this.d.futures.load(R('NIFTY 50')).catch(() => null),
    ]);
    const p = mk.parts;
    const pcr = oi ? parseFloat(oi.pcr) : 1;
    const input: PanelIn = {
      n50: n50.score,
      n50Fut: n50.futures?.dir ?? 0,
      bnFut: bn.futures?.dir ?? 0,
      oiN50: n50.score.oi_obv,
      oiBN: bn.score.oi_obv,
      adNet: p.ad.all + p.ad.nifty50,
      comp: p.component,
      pcr: Number.isFinite(pcr) && pcr > 0 ? pcr : 1,
      mins: mins(at),
    };
    const tr = n50.trend;
    const exits: Record<'LONG' | 'SHORT', ExitCheck> = {
      LONG: exitCheck('LONG', n50.score.current_trend, input.n50Fut, input.bnFut),
      SHORT: exitCheck('SHORT', n50.score.current_trend, input.n50Fut, input.bnFut),
    };

    // top trades: stocks whose own score is strong and points the way of the index futures
    const indexDir = input.n50Fut + input.bnFut >= 1 ? 1 : input.n50Fut + input.bnFut <= -1 ? -1 : 0;
    const top: { name: string; score: number; change: number; strong: boolean }[] = [];
    for (const name of this.d.topStocks()) {
      try {
        const s = await this.d.score.load(R(name));
        const total = s.score.total;
        if (indexDir !== 0 && Math.sign(total) !== indexDir) continue;
        top.push({ name, score: total, change: s.trend ? parseFloat(s.trend.change) || 0 : 0, strong: Math.abs(total) >= 3 });
      } catch {
        /* a stock with no data is left out */
      }
    }
    top.sort((a, b) => (a.strong !== b.strong ? (a.strong ? -1 : 1) : Math.abs(b.score) - Math.abs(a.score)));

    // score detail: every part of the composite, by instrument
    const n = p.nine15;
    const rows = (group: string, list: [string, number][]) => list.map(([label, value]) => ({ group, label, value }));
    const detail = [
      ...rows('9:15 candle', [['All F&O', n.all], ['NIFTY 50', n.nifty50], ['NIFTY BANK', n.bank], ['GIFT NIFTY', n.gift], ['SENSEX', n.sensex], ['RELIANCE', n.reliance], ['HDFCBANK', n.hdfcbank]]),
      ...rows('Advance / decline', [['All F&O', p.ad.all], ['NIFTY 50', p.ad.nifty50], ['NIFTY BANK', p.ad.bank]]),
      ...rows('Futures trend', [['All F&O', p.fut.all], ['NIFTY 50', p.fut.nifty50], ['NIFTY BANK', p.fut.bank]]),
      ...rows('OI / OBV', NAMES5.map((x, i) => [x, p.oiObv[i] ?? 0] as [string, number])),
      ...rows('Max pain', NAMES5.map((x, i) => [x, p.maxPain[i] ?? 0] as [string, number])),
      ...rows('IV skew', NAMES5.map((x, i) => [x, p.ivSkew[i] ?? 0] as [string, number])),
      ...rows('Component weights', [['NIFTY 50', p.component.nifty50], ['NIFTY BANK', p.component.bank]]),
    ];

    // history of the day: recorded for a live day or a snapshot time
    const key = `score_hist_${req.day}`;
    let history = this.d.store.get<HistoryPoint[]>(key) ?? [];
    if (live || req.asOf) {
      const pt: HistoryPoint = { t: at, score: mk.score, leading: mk.leading, signal: mk.signal.signal };
      history = [...history.filter((x) => x.t !== at), pt].sort((a, b) => a.t.localeCompare(b.t)).slice(-90);
      this.d.store.set(key, history);
    }
    // a snapshot time shows the day only up to that time (readings recorded later in the day, or at another snapshot, are not part of that moment)
    const shown = req.asOf ? history.filter((x) => x.t <= req.asOf!) : history;

    return {
      day: req.day,
      asOf: req.asOf ?? null,
      at,
      entry: entryConfluence(input),
      now: nowTrade({ n50: n50.score, ltp: tr?.ltp ?? 0, levels: tr?.levels ?? null, vixu: tr?.vixUpper ?? null, vixl: tr?.vixLower ?? null, avwap: fut?.vwapPrice || null }),
      pillars: pillars(input),
      exit: { trend: n50.score.current_trend, n50Fut: input.n50Fut, bnFut: input.bnFut, ...exits },
      top: top.slice(0, 8),
      indexDir,
      detail,
      history: shown,
    };
  }
}
