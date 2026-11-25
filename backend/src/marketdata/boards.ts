import type { ConsensusResult } from './consensus.js';
import type { LevelProbResult } from './levelProb.js';
import type { OiAnalysis } from './oi.js';
import type { SignalView } from './signals.js';
import type { ScoreResult } from './score.js';
import type { VerdictResult } from './verdict.js';
import type { SqueezeRead } from './squeeze.js';
import { trendProb, weightedTrend, type WtcRow } from '../engine/trendProb.js';

type Req = { name: string; day: string; asOf?: string };

export interface BoardDeps {
  consensus: { load(r: Req): Promise<ConsensusResult> };
  levelProb: { load(r: Req): Promise<LevelProbResult> };
  oi: { analyse(r: Req): Promise<OiAnalysis> };
  signals: { load(r: Req): Promise<SignalView> };
  /** the heaviest stocks of NIFTY 50 and NIFTY BANK */
  score: { load(r: Req): Promise<ScoreResult> };
  verdict: { load(r: Req): Promise<VerdictResult> };
  squeeze: { load(r: Req): Promise<SqueezeRead> };
  /** the weights (percent) of an index's heaviest stocks */
  weights: (index: string) => Record<string, number>;
  topStocks: () => string[];
  mcxNames: () => string[];
  now?: () => number;
}

const INDICES = ['NIFTY 50', 'NIFTY BANK', 'SENSEX'];
const r2 = (x: number): number => Math.round(x * 100) / 100;

/** the sentence under Max Pain: where the pull is, and whether gamma will soften or sharpen a move */
export function maxPainOutcome(spot: number, mp: number, pct: number, netGEX: number, flips: number[]): string {
  const below = mp < spot;
  const near = Math.abs(pct) < 0.1;
  const flipNear = flips.some((f) => Math.abs(f - spot) / spot <= 0.005);
  const pull = near ? `Max Pain (${mp}) is at spot, so there is little pull either way.` : `Max Pain (${mp}) is ${Math.abs(pct).toFixed(1)}% ${below ? 'below' : 'above'} spot: gravity pulls price ${below ? 'downward' : 'upward'} into expiry${netGEX > 0 ? ', so the drift will be slow' : ''}.`;
  const gex = netGEX > 0 ? 'GEX is positive (stabilising): dealers dampen moves.' : 'GEX is negative (trending): dealers can amplify a move.';
  const flip = flipNear ? ' A GEX flip zone is near spot: a break through it could turn the drift into a sharper move.' : '';
  return `${pull} ${gex}${flip}`;
}

/**
 * Cross-instrument boards of the old dashboard: Signal agreement + Entry timing for the indices and the heaviest stocks, the OI heatmap (ATM -2 to +2 with the
 * score of each strike), Max Pain and gamma exposure, the Master Consensus of every name and Level Probability. Each name is read on its own so one failure
 * leaves the others, and the whole board is cached for the 5-minute slot. Rule-based and not back-tested.
 */
export class BoardService {
  private cache = new Map<string, { slot: number; v: unknown }>();
  constructor(private readonly d: BoardDeps) {}

  invalidate(): void {
    this.cache.clear();
  }

  private async pool<T>(names: string[], n: number, f: (name: string) => Promise<T | null>): Promise<T[]> {
    const out: (T | null)[] = new Array(names.length).fill(null);
    let i = 0;
    await Promise.all(
      Array.from({ length: Math.min(n, names.length) }, async () => {
        while (i < names.length) {
          const k = i++;
          out[k] = await f(names[k]!).catch(() => null);
        }
      }),
    );
    return out.filter((x): x is T => x !== null);
  }

  async load(req: { day: string; asOf?: string }) {
    const now = (this.d.now ?? Date.now)();
    const slot = req.asOf ? 0 : Math.floor(now / 300000);
    const key = `${req.day}|${req.asOf ?? ''}`;
    const hit = this.cache.get(key);
    if (hit && hit.slot === slot) return hit.v as Awaited<ReturnType<BoardService['build']>>;
    const v = await this.build(req);
    this.cache.set(key, { slot, v });
    return v;
  }

  private async build(req: { day: string; asOf?: string }) {
    const R = (name: string): Req => ({ ...req, name });
    const stocks = this.d.topStocks();
    const nse = [...INDICES, ...stocks];
    const oiNames = [...INDICES, ...stocks.slice(0, 3), ...this.d.mcxNames().filter((n) => ['CRUDEOILM', 'GOLDM', 'SILVERM'].includes(n))];

    const [signals, consensus, levelProb, oiRows] = await Promise.all([
      this.pool(nse, 3, async (name) => {
        const s = await this.d.signals.load(R(name));
        const pct = s.agreement?.pct ?? null;
        const view = s.view ?? null;
        const trend = !s.strategy ? 'No pick' : pct != null && pct < 45 && view !== 'Range-bound' ? `${view} (weak)` : view ?? 'No pick';
        return { name, kind: INDICES.includes(name) ? 'index' : 'stock', trend, strategy: s.strategy, agreement: s.agreement ? { agree: s.agreement.agree, total: s.agreement.total, pct: s.agreement.pct, label: s.agreement.label } : null, timing: s.timing ? { pct: s.timing.pct, label: s.timing.label } : null, why: s.suggestion?.why ?? null };
      }),
      this.pool(nse, 3, async (name) => {
        const c = await this.d.consensus.load(R(name));
        return { name, outcome: c.outcome, net: r2(c.net), agree: c.agree, voting: c.voting, thin: c.thin };
      }),
      this.pool(nse, 3, async (name) => {
        const l = await this.d.levelProb.load(R(name));
        return l.ok ? { name, pASO: l.pASO, pAST: l.pAST, pVIXU: l.pVIXU, pBSO: l.pBSO, pBST: l.pBST, pVIXL: l.pVIXL, lean: r2(l.netDir) } : null;
      }),
      this.pool(oiNames, 3, async (name) => {
        const o = await this.d.oi.analyse(R(name));
        const i = o.rows.findIndex((r) => r.atm);
        const cells = i < 0 ? [] : o.rows.slice(Math.max(0, i - 2), i + 3).map((r) => ({ strike: Number(r.strike), score: r.score, atm: r.atm }));
        const mp = o.maxPain;
        return {
          name,
          ltp: o.ltp,
          oiScore: o.oiScore,
          pcr: parseFloat(o.pcr) || null,
          cells,
          rows: o.rows.map((r) => ({ strike: Number(r.strike), atm: r.atm, ce: parseFloat(r.chgCE) || 0, pe: parseFloat(r.chgPE) || 0, obvCE: r.obvCE, obvPE: r.obvPE, score: r.score })),
          maxPain: mp ? { spot: o.spot, maxPain: mp.maxPainK, dist: mp.maxPainDist, pct: mp.maxPainPct, netGEX: mp.netGEX, regime: mp.netGEX > 0 ? 'Stabilising' : 'Trending', flips: mp.flipZones, outcome: maxPainOutcome(o.spot, mp.maxPainK, mp.maxPainPct, mp.netGEX, mp.flipZones) } : null,
        };
      }),
    ]);
    // trend probability of the three indices
    const trend = await this.pool(INDICES, 3, async (name) => {
      const [sc, vd] = await Promise.all([this.d.score.load(R(name)), this.d.verdict.load(R(name)).catch(() => null)]);
      const t = trendProb({ zone: sc.zone, futuresScore: sc.futures?.dir ?? 0, futuresLabel: sc.futures?.remark?.replace(/_/g, ' '), oiScore: sc.score.oi_obv, scoreTotal: sc.score.total, vix: vd?.inputs.indiaVix ?? 0, vixLabel: 'India VIX' });
      return { name, ...t };
    });
    // weighted trend confirmation of NIFTY 50 and NIFTY BANK
    const wtc = (
      await Promise.all(
        ['NIFTY 50', 'NIFTY BANK'].map(async (index) => {
          const w = this.d.weights(index);
          const parts: WtcRow[] = [];
          for (const [name, weight] of Object.entries(w)) {
            try {
              parts.push({ name, weight, score: (await this.d.score.load(R(name))).score.total });
            } catch {
              /* a stock with no data is left out */
            }
          }
          return weightedTrend(index, parts);
        }),
      )
    ).filter((x) => x !== null);
    // short covering / long unwinding: names with an active squeeze or a building watch
    const sqNames = [...INDICES, ...stocks, ...this.d.mcxNames().filter((n) => ['GOLDM', 'SILVERM'].includes(n))];
    const squeeze = await this.pool(sqNames, 3, async (name) => {
      const q = await this.d.squeeze.load(R(name));
      const sig = q.signal;
      if (!sig.active && !q.watch) return null;
      return { name, active: sig.active, type: sig.type, remark: sig.remark ?? null, setup: (sig as unknown as { probability?: number }).probability ?? null, daysToExpiry: sig.daysToExpiry, pcr: sig.pcr, extreme: sig.extremePositioning, watch: q.watch ? { willBe: q.watch.willBe, streak: q.watch.streak, badge: q.watch.badge.label } : null, note: q.note };
    });
    return {
      day: req.day,
      asOf: req.asOf ?? null,
      trend,
      wtc,
      squeeze,
      signals,
      consensus,
      levelProb,
      oi: oiRows.map((o) => ({ name: o.name, ltp: o.ltp, oiScore: o.oiScore, pcr: o.pcr, cells: o.cells, rows: o.rows })),
      maxPain: oiRows.filter((o) => o.maxPain).map((o) => ({ name: o.name, ...o.maxPain! })),
    };
  }
}
