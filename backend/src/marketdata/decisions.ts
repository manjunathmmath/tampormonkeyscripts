import type { Candle } from '../kite/client.js';
import type { OiRow } from '../engine/oi.js';
import {
  broadBasedCheck, componentsCheck, futuresTrendCheck, ivSkewCheck, levelDecision, levelHistory, levelProbCheck, levelWallCheck, roomToTargetCheck, tally, weakStrongIndexCheck,
  type Check, type Decision, type Side, type TrendSeen,
} from '../engine/levelDecision.js';
import { applyLiveContext, finalVerdictCore, type FinalVerdict, type FvConsensus, type LiveContextRead } from '../engine/finalVerdict.js';
import { tradeSignal } from '../engine/marketSignal.js';
import { expiryContext, expiryWarning, type ExpiryInput } from '../engine/expiry.js';
import type { ConsensusResult } from './consensus.js';
import type { FuturesResult } from './futures.js';
import type { LevelProbResult } from './levelProb.js';
import type { MarketResult } from './market.js';
import type { ScoreResult } from './score.js';

type Req = { name: string; day: string; asOf?: string };

export interface DecisionDeps {
  score: { load(r: Req): Promise<ScoreResult> };
  market: { load(r: { day: string; asOf?: string }): Promise<MarketResult> };
  levelProb: { load(r: Req): Promise<LevelProbResult> };
  consensus: { load(r: Req): Promise<ConsensusResult> };
  oi: { chainRaw(r: Req): Promise<{ rows: OiRow[]; spotCandles: Candle[] }> };
  futures: { load(r: Req): Promise<FuturesResult> };
  /** Settings LEVEL_ROOM_MULT (default 1.5) */
  roomMult?: () => number;
  now?: () => number;
  /** optional Live Context read (not built here yet); returns null when unavailable */
  liveContext?: (name: string, dir: number, r: Req) => Promise<LiveContextRead | null>;
  /** the indices (NIFTY 50 / NIFTY BANK / SENSEX) whose options expire on `day` */
  expiryDay?: (day: string) => string[];
  /** max pain and the ranked walls of an index, for the expiry-day line (null when no chain is loaded) */
  expiryInput?: (name: string, r: Req) => Promise<ExpiryInput | null>;
  /** ' (x% off the day's low, further than y% of past legs; the median leg ran z%)' for an active squeeze, from the cached study only; null when not available */
  squeezeStudy?: (name: string, up: boolean, r: Req) => Promise<string | null>;
}

export interface SideDecision {
  side: Side;
  decision: Decision | null;
  tally: { conf: number; total: number };
  checks: Check[];
}

export interface LevelDecisionResult {
  name: string;
  day: string;
  asOf: string | null;
  levels: { aso: number | null; ast: number | null; bso: number | null; bst: number | null };
  support: SideDecision;
  resistance: SideDecision;
  /** checks of the Level Confirmation tally that are not built here yet */
  unavailable: string[];
}

const PARTNER: Record<string, string> = { 'NIFTY 50': 'NIFTY BANK', 'NIFTY BANK': 'NIFTY 50' };

/** minutes since midnight IST: the snapshot time when one is set, the end of the session for a past day, else the clock */
export function nowMinutes(day: string, asOf: string | undefined, nowMs: number): number {
  if (asOf && /^\d{1,2}:\d{2}/.test(asOf)) return parseInt(asOf.split(':')[0]!, 10) * 60 + parseInt(asOf.split(':')[1]!, 10);
  const ist = new Date(nowMs + 19800000);
  const today = ist.toISOString().slice(0, 10);
  if (day < today) return 15 * 60 + 30;
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/**
 * The Level Confirmation tally and the Level Decision for both sides of one index. The tally here is `_gtbIdxTally` (the checks it makes for BANK NIFTY and SENSEX):
 * the GIFT NIFTY check and the live order-flow check are not built, so they are left out of the count (the userscript does the same when their data is missing).
 */
export class DecisionService {
  private readonly seen: TrendSeen = {};
  private cache = new Map<string, { at: number; v: MarketResult }>();

  invalidate(): void {
    this.cache.clear();
  }
  constructor(private readonly d: DecisionDeps) {}

  /** the market-wide read is heavy, so it is reused for a minute */
  private async market(day: string, asOf?: string): Promise<MarketResult> {
    const key = `${day}|${asOf ?? ''}`;
    const now = (this.d.now ?? Date.now)();
    const hit = this.cache.get(key);
    if (hit && now - hit.at < 60_000) return hit.v;
    const v = await this.d.market.load({ day, asOf });
    this.cache.set(key, { at: now, v });
    return v;
  }

  async levelDecision(req: Req): Promise<LevelDecisionResult> {
    const { name, day, asOf } = req;
    const partner = PARTNER[name] ?? 'NIFTY 50';
    const [score, partnerScore, mkt, lp, cons, chain, fut] = await Promise.all([
      this.d.score.load(req),
      this.d.score.load({ ...req, name: partner }).catch(() => null),
      this.market(day, asOf),
      this.d.levelProb.load(req),
      this.d.consensus.load(req),
      this.d.oi.chainRaw(req).catch(() => ({ rows: [] as OiRow[], spotCandles: [] as Candle[] })),
      this.d.futures.load(req).catch(() => null),
    ]);
    const tr = score.trend;
    const lv = tr?.levels;
    const spot = tr?.ltp ?? 0;
    const pc = parseFloat(tr?.change ?? '0') || 0;
    const rows = chain.rows;
    const nowMin = nowMinutes(day, asOf, (this.d.now ?? Date.now)());
    const mult = this.d.roomMult?.() ?? 1.5;

    // squeeze names: NIFTY 50 / BANK / SENSEX whose futures remark is short covering (buy) or long unwinding (sell)
    const sq = await Promise.all(['NIFTY 50', 'NIFTY BANK', 'SENSEX'].map((n) => this.d.score.load({ ...req, name: n }).then((s) => ({ n, remark: s.futures?.remark ?? '' })).catch(() => ({ n, remark: '' }))));
    const squeezeNames = (buy: boolean): string[] => sq.filter((x) => x.remark === (buy ? 'SHOT_COVERING' : 'LONG_UNWINDING')).map((x) => x.n);

    const nOi = mkt.parts.oiObv[0] ?? 0;
    const bOi = mkt.parts.oiObv[1] ?? 0;
    const unavailable = ['GIFT NIFTY level check', 'Order flow'];
    const side = (s: Side): SideDecision => {
      const buy = s === 'support';
      const direction = s === 'resistance' ? 'weak' : 'strong';
      const level = buy ? lv?.bso : lv?.aso;
      const stop = buy ? lv?.bst : lv?.ast;
      const checks: Check[] = [
        levelWallCheck(name, rows, spot, pc, s, level),
        roomToTargetCheck(name, rows, spot, pc, s, level, stop, mult),
        futuresTrendCheck(score.futures?.dir, score.futures?.remark, direction),
        weakStrongIndexCheck(direction, mkt.parts.ad.nifty50 + nOi, mkt.parts.ad.bank + bOi),
        broadBasedCheck(direction, mkt.weighted50),
        levelProbCheck(lp.ok ? { ok: true, netDir: lp.netDir } : null, direction),
        componentsCheck(direction, mkt.parts.component.nifty50),
        ivSkewCheck(score.score.iv_skew, direction),
      ];
      const t = tally(checks);
      const dz = !!cons.deadZoneBand && !cons.deadZoneBand.broken;
      const decision = levelDecision(
        {
          side: s, level, stopLevel: stop, tallyConf: t.conf, tallyTotal: t.total, name, spot, pc, nowMin,
          signal: mkt.signal, score: mkt.score,
          fut: score.futures?.dir ?? 0, futBank: partnerScore?.futures?.dir ?? 0,
          remark: score.futures?.remark ?? '', partnerRemark: partnerScore?.futures?.remark ?? '',
          squeezeNames: squeezeNames(buy),
          pLevel: lp.ok ? (buy ? lp.pBSO : lp.pASO) : null,
          deadZone: dz,
          history: level ? levelHistory(chain.spotCandles as never, level, buy) : null,
          rows,
          oppositeLevel: buy ? lv?.aso : lv?.bso,
          avwap: fut?.vwapPrice ?? null,
          mult,
        },
        `${name}|${s}|${day}|${asOf ?? ''}`,
        this.seen,
      );
      return { side: s, decision, tally: t, checks };
    };
    return {
      name, day, asOf: asOf ?? null,
      levels: { aso: lv?.aso ?? null, ast: lv?.ast ?? null, bso: lv?.bso ?? null, bst: lv?.bst ?? null },
      support: side('support'),
      resistance: side('resistance'),
      unavailable,
    };
  }

  /** The Final Verdict of an index. Adds the expiry-day caution and, from the cached study, where today's squeeze leg sits among past legs. */
  async finalVerdict(req: Req): Promise<FinalVerdict & { name: string; day: string; asOf: string | null; marketSignal: string; unavailable: string[] }> {
    const { name, day, asOf } = req;
    const partner = PARTNER[name] ?? 'NIFTY 50';
    const [ld, cn, cb, mkt] = await Promise.all([this.levelDecision(req), this.d.consensus.load(req), this.d.consensus.load({ ...req, name: partner }), this.market(day, asOf)]);
    const toFv = (c: ConsensusResult): FvConsensus => ({
      outcome: c.outcome, net: c.net, agree: c.agree, voting: c.voting, thin: c.thin, dzConflict: c.dzConflict,
      deadZone: c.deadZone as FvConsensus['deadZone'], deadZoneBroken: c.deadZoneBroken as FvConsensus['deadZoneBroken'],
    });
    const sq = await Promise.all(['NIFTY 50', 'NIFTY BANK', 'SENSEX'].map((n) => this.d.score.load({ ...req, name: n }).then((s) => ({ n, remark: s.futures?.remark ?? '' })).catch(() => ({ n, remark: '' }))));
    const zones = (cn.score.zone ? { [name]: cn.score.zone } : {}) as Record<string, string>;
    void zones;
    // where today's leg sits among past legs, from the cached study only (never starts a fetch)
    const extras: Record<string, string> = {};
    if (this.d.squeezeStudy) {
      for (const x of sq) {
        for (const up of [true, false]) {
          if (x.remark !== (up ? 'SHOT_COVERING' : 'LONG_UNWINDING')) continue;
          const t = await this.d.squeezeStudy(x.n, up, req).catch(() => null);
          if (t) extras[`${x.n}|${up ? 1 : 0}`] = t;
        }
      }
    }
    const strat = await this.strat(req);
    const v = finalVerdictCore({
      name,
      consensus: toFv(cn),
      partner: toFv(cb),
      signal: mkt.signal,
      score: mkt.score,
      strat,
      decisionFor: (s) => (s === 'support' ? ld.support.decision : ld.resistance.decision),
      spot: cn.score.trend?.ltp ?? null,
      aso: ld.levels.aso,
      bso: ld.levels.bso,
      squeezeHeadsUp: (dN) => {
        const up = dN > 0;
        const names = sq.filter((x) => x.remark === (up ? 'SHOT_COVERING' : 'LONG_UNWINDING')).map((x) => x.n);
        return names.length ? names.map((n) => `${n}${up ? ' short covering' : ' long unwinding'} is active${extras[`${n}|${up ? 1 : 0}`] ?? ''}`).join('; ') + '.' : null;
      },
    });
    let lx: LiveContextRead | null = null;
    if (this.d.liveContext && (v.call === 'LONG' || v.call === 'SHORT')) lx = await this.d.liveContext(name, v.dir, req).catch(() => null);
    applyLiveContext(v, lx);
    // expiry day: an index whose options expire today (context only, never changes the call)
    const ex = this.d.expiryDay?.(day) ?? [];
    if (ex.length && this.d.expiryInput) {
      const up = v.dir > 0;
      const lines: string[] = [];
      for (const n of ex) {
        const inp = await this.d.expiryInput(n, req).catch(() => null);
        const l = inp ? expiryContext(n, up, inp) : null;
        if (l) lines.push(l);
      }
      v.warn.push(expiryWarning(ex, lines));
    }
    return { ...v, name, day, asOf: asOf ?? null, marketSignal: mkt.signal.signal, unavailable: [] };
  }

  /** today's 9:15 plan from the NIFTY 50 - SENSEX - BANK NIFTY combo (the 9:15 zones of the scan) */
  private async strat(req: Req): Promise<{ outcome: string; level: string } | null> {
    const [n, s, b] = await Promise.all(['NIFTY 50', 'SENSEX', 'NIFTY BANK'].map((nm) => this.d.score.load({ ...req, name: nm }).then((r) => r.zone).catch(() => null)));
    if (!n && !s && !b) return null;
    return tradeSignal(n ?? undefined, s ?? undefined, b ?? undefined);
  }
}
