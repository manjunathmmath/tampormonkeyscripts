import type { Candle } from '../kite/client.js';
import type { OiRow } from '../engine/oi.js';
import { outlook, srLevels, type HoldMap, type Outlook, type SrResult } from '../engine/outlook.js';
import { previousDayFor, trimCandles } from './history.js';
import type { ConsensusResult } from './consensus.js';
import type { ScoreResult } from './score.js';

type Req = { name: string; day: string; asOf?: string };

export interface OutlookDeps {
  score: { load(r: Req): Promise<ScoreResult> };
  oi: { chainRaw(r: Req): Promise<{ rows: OiRow[]; spotCandles: Candle[] }> };
  history: { candles(q: { token: number; interval: 'day'; from: string; to: string }): Promise<Candle[]> };
  tokens: () => Record<string, number>;
  consensus: { load(r: Req): Promise<ConsensusResult> };
  /** the Final Verdict direction and confidence, used to cap the plan confidence for the three indices */
  finalVerdict?: (r: Req) => Promise<{ dir: number; conf: string | null } | null>;
  /** today's 9:15 combo plan (context only, never a driver) */
  strat?: (r: Req) => Promise<{ outcome: string; level: string } | null>;
  liveContext?: (name: string, dir: number, r: Req) => Promise<{ status: string } | null>;
  holidays?: () => ReadonlySet<string>;
  now?: () => number;
}

export interface SrResultView extends SrResult {
  name: string;
  day: string;
  asOf: string | null;
}

export interface OutlookView extends Outlook {
  day: string;
  asOf: string | null;
  unavailable: string[];
}

const INDEXES = new Set(['NIFTY 50', 'NIFTY BANK', 'SENSEX']);

/** Strong support and resistance zones, and the Probable trade built from them. NSE names. */
export class OutlookService {
  private readonly hold: HoldMap = {};
  constructor(private readonly d: OutlookDeps) {}

  private async inputs(req: Req): Promise<{ sr: SrResult; score: ScoreResult; rows: OiRow[]; candles: Candle[] } | null> {
    const score = await this.d.score.load(req);
    const tr = score.trend;
    if (!tr) return null;
    let rows: OiRow[] = [];
    let spotCandles: Candle[] = [];
    try {
      const raw = await this.d.oi.chainRaw(req);
      rows = raw.rows;
      spotCandles = raw.spotCandles;
    } catch {
      /* no option chain: the zones come from the other sources */
    }
    let prev: { hi: number; lo: number; cl: number } | null = null;
    const token = this.d.tokens()[req.name];
    if (token) {
      try {
        const pd = previousDayFor(req.name, req.day, this.d.holidays?.() ?? new Set());
        const c = await this.d.history.candles({ token, interval: 'day', from: pd, to: pd });
        if (c.length) prev = { hi: c[0]![2], lo: c[0]![3], cl: c[0]![4] };
      } catch {
        prev = null;
      }
    }
    const candles = trimCandles(spotCandles, req.day, req.asOf ?? null);
    const sr = srLevels({ spot: tr.ltp, pc: parseFloat(tr.change) || 0, rows: rows.length ? rows : null, strike: tr.levels, candles, prev });
    return sr ? { sr, score, rows, candles } : null;
  }

  async levels(req: Req): Promise<SrResultView | null> {
    const i = await this.inputs(req);
    return i ? { ...i.sr, name: req.name, day: req.day, asOf: req.asOf ?? null } : null;
  }

  async plan(req: Req, forceDir?: number): Promise<OutlookView | { ok: false; why: string }> {
    const i = await this.inputs(req);
    if (!i) return { ok: false, why: `Waiting for ${req.name} price and OI data.` };
    const cn = await this.d.consensus.load(req);
    const dirNow = cn.net > 0.2 ? 1 : cn.net < -0.2 ? -1 : 0;
    const dir = dirNow || forceDir || 0;
    const lx = dir && this.d.liveContext ? await this.d.liveContext(req.name, dir, req).catch(() => null) : null;
    const fv = INDEXES.has(req.name) && this.d.finalVerdict ? await this.d.finalVerdict(req).catch(() => null) : null;
    const nowMs = (this.d.now ?? Date.now)();
    const ist = new Date(nowMs + 19800000).toISOString().slice(0, 10);
    // the plan hold needs a real clock: not with a snapshot time or on a past day
    const active = !req.asOf && req.day === ist;
    const tr = i.score.trend!;
    const o = outlook({
      name: req.name,
      sr: i.sr,
      consensus: { net: cn.net, voting: cn.voting, thin: cn.thin },
      forceDir,
      lx,
      finalVerdict: fv,
      isIndex: INDEXES.has(req.name),
      candles: i.candles,
      vix: tr.vixLower && tr.vixUpper ? { lo: tr.vixLower, hi: tr.vixUpper } : null,
      strat: (await this.d.strat?.(req).catch(() => null)) ?? undefined,
      hold: { map: this.hold, now: nowMs, active },
    });
    return { ...o, day: req.day, asOf: req.asOf ?? null, unavailable: ['Live Context'] };
  }
}
