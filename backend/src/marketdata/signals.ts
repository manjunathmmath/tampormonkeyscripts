import { agreement, STRATEGY_VIEW, suggestedKey, timing, wantOf, type Agreement, type StrategyKey, type Suggestion, type Timing } from '../engine/signalAgreement.js';
import type { ConsensusResult } from './consensus.js';
import type { FuturesResult } from './futures.js';
import type { LevelProbResult } from './levelProb.js';
import type { MarketResult } from './market.js';
import type { OiAnalysis } from './oi.js';
import type { ScoreResult } from './score.js';
import { nowMinutes } from './decisions.js';

type Req = { name: string; day: string; asOf?: string };

export interface SignalDeps {
  score: { load(r: Req): Promise<ScoreResult> };
  market: { load(r: { day: string; asOf?: string }): Promise<MarketResult> };
  consensus: { load(r: Req): Promise<ConsensusResult> };
  levelProb: { load(r: Req): Promise<LevelProbResult> };
  futures: { load(r: Req): Promise<FuturesResult> };
  oi: { analyse(r: Req): Promise<OiAnalysis> };
  finalVerdict: (r: Req) => Promise<{ call: string; dir: number; headline: string; conf: string | null; entryBlocked?: boolean } | null>;
  /** the VIX last price (0 when unknown) */
  indiaVix?: (r: Req) => Promise<number>;
  now?: () => number;
}

export interface SignalView {
  name: string;
  day: string;
  asOf: string | null;
  suggestion: Suggestion | null;
  strategy: StrategyKey | null;
  view: string | null;
  agreement: Agreement | null;
  timing: Timing | null;
  /** days to the option expiry used for the timing checks */
  dte: number | null;
  unavailable: string[];
}

const INDEXES = new Set(['NIFTY 50', 'NIFTY BANK', 'SENSEX']);

/** The Signal agreement + Entry timing read of one name: the suggested strategy, how many independent signals back it, and whether now is a good moment. */
export class SignalService {
  constructor(private readonly d: SignalDeps) {}

  async load(req: Req, strategy?: StrategyKey): Promise<SignalView> {
    const { name, day, asOf } = req;
    const isIndex = INDEXES.has(name);
    const [score, mkt, fv, oi, lp, cons, fut, vix] = await Promise.all([
      this.d.score.load(req),
      this.d.market.load({ day, asOf }).catch(() => null),
      isIndex ? this.d.finalVerdict(req).catch(() => null) : Promise.resolve(null),
      this.d.oi.analyse(req).catch(() => null),
      this.d.levelProb.load(req).catch(() => null),
      this.d.consensus.load(req).catch(() => null),
      this.d.futures.load(req).catch(() => null),
      this.d.indiaVix ? this.d.indiaVix(req).catch(() => 0) : Promise.resolve(0),
    ]);
    // the suggestion skips the market gate, as the Dashboard card and the scan do
    const suggestion = suggestedKey({ isIndex, skipMarketGate: true, marketSignal: mkt?.signal ?? null, finalVerdict: fv, scoreTotal: score.score.total, indiaVix: vix });
    const key = strategy ?? suggestion?.key ?? null;
    const view = key ? STRATEGY_VIEW[key] : null;
    const want = view ? wantOf(view) : null;
    const ag = want === null ? null : agreement({ want, parts: score.score, marketSignal: mkt?.signal ?? null, finalVerdict: fv });

    let dte: number | null = null;
    if (oi?.expiry) dte = Math.max(0, Math.round((Date.parse(oi.expiry + 'T00:00:00Z') - Date.parse(day + 'T00:00:00Z')) / 86400000));
    const tr = score.trend;
    const tm =
      want === null || !tr
        ? null
        : timing({
            want,
            stratKey: key,
            dte,
            trend: { ltp: tr.ltp, open: tr.open, aso: tr.levels.aso, ast: tr.levels.ast, vixRange: tr.vixRange ?? 0 },
            futuresTrend: score.futures?.dir,
            futuresRemark: score.futures?.remark ?? '',
            avwap: fut?.vwapPrice ?? null,
            levelProb: lp ? { ok: lp.ok, pASO: lp.pASO, pBSO: lp.pBSO } : null,
            deadZone: cons?.deadZoneBand && !cons.deadZoneBand.broken ? { lo: cons.deadZoneBand.lo, hi: cons.deadZoneBand.hi } : null,
            nowMin: nowMinutes(day, asOf, (this.d.now ?? Date.now)()),
          });
    return { name, day, asOf: asOf ?? null, suggestion, strategy: key, view, agreement: ag, timing: tm, dte, unavailable: ['Positional vote', 'Swing timing', 'Detail View prediction (single stocks use the instrument score)'] };
  }
}
