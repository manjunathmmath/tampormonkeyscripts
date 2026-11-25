import { masterConsensus, type Consensus } from '../engine/consensus.js';
import { deadZoneRaw, deadZoneText, type DeadZone, type DzLatch } from '../engine/deadZone.js';
import type { Candle } from '../kite/client.js';
import { trimCandles } from './history.js';
import type { LevelProbResult } from './levelProb.js';
import type { OiAnalysis } from './oi.js';
import type { ScoreResult } from './score.js';

export interface ConsensusDeps {
  score: { load(req: { name: string; day: string; asOf?: string }): Promise<ScoreResult> };
  oi?: { analyse(req: { name: string; day: string; asOf?: string }): Promise<OiAnalysis> };
  levelProb?: { load(req: { name: string; day: string; asOf?: string }): Promise<LevelProbResult> };
  /** the remark accuracy of the instrument today (weights the futures vote) */
  futAcc?: { load(req: { name: string; day: string; asOf?: string }): Promise<Record<string, { hits: number; total: number; pts: number }>> };
  history?: { candles(q: { token: number; interval: '5minute'; from: string; to: string; asOf?: string }): Promise<Candle[]> };
  tokens?: () => Record<string, number>;
  /** live order-flow imbalance of a name (null when not subscribed / no tick yet); only a live day has one */
  orderFlow?: { read(name: string, day: string): { dir: number } | null };
  /** the contract curve read (near versus far futures); its vote is left out when absent */
  curve?: { load(req: { name: string; day: string; asOf?: string }): Promise<{ dir: number; lean: string } | null> };
  now?: () => number;
}

export interface ConsensusResult extends Consensus {
  name: string;
  day: string;
  asOf: string | null;
  /** the dead zone band (also while released: see `broken`), with a sentence on where price stands */
  deadZoneBand: (DeadZone & { text: string }) | null;
  /** engines whose inputs are not built in this backend yet (they vote as "no data") */
  unavailable: string[];
  score: ScoreResult;
}

/** Master Consensus of a name at a moment, from the inputs the backend has. order flow is live only. */
export class ConsensusService {
  private readonly latch: DzLatch = {};
  constructor(private readonly d: ConsensusDeps) {}

  async load(req: { name: string; day: string; asOf?: string }): Promise<ConsensusResult> {
    const { name, day, asOf } = req;
    const score = await this.d.score.load(req);
    const wall = await this.d.oi?.analyse(req).then((o) => o.walls).catch(() => null);
    let candles: Candle[] = [];
    const token = this.d.tokens?.()[name];
    if (token && this.d.history) {
      try {
        candles = trimCandles(await this.d.history.candles({ token, interval: '5minute', from: day, to: day, asOf }), day, asOf ?? null);
      } catch {
        candles = [];
      }
    }
    const lp = await this.d.levelProb?.load(req).catch(() => null);
    const accMap = await this.d.futAcc?.load(req).catch(() => null);
    const cv = await this.d.curve?.load(req).catch(() => null);
    // live only: resting orders of the moment mean nothing for a past day or a snapshot time
    const isLive = !asOf && day === new Date((this.d.now?.() ?? Date.now()) + 19800000).toISOString().slice(0, 10);
    const of = isLive ? this.d.orderFlow?.read(name, day) ?? null : null;
    const remarkNow = score.futures?.remark ?? null;
    const now = this.d.now?.() ?? Date.now();
    const raw = deadZoneRaw(
      {
        scoreTotal: score.score.total,
        supportWall: wall?.support[0]?.strike ?? null,
        resistanceWall: wall?.resistance[0]?.strike ?? null,
        bso: score.trend?.levels.bso ?? null,
        aso: score.trend?.levels.aso ?? null,
        candles,
        // a past day or a snapshot time has no forming candle: judge it as of the last candle
        nowMs: asOf || day !== new Date(now + 19800000).toISOString().slice(0, 10) ? Number.MAX_SAFE_INTEGER : now,
        key: `${name}|${day}|${asOf ?? ''}`,
      },
      this.latch,
    );
    const c = masterConsensus({ cs: score.score, zone: score.zone, remark: remarkNow, futAcc: remarkNow && accMap ? accMap[remarkNow] ?? null : null, levelProb: lp ?? null, deadZone: raw, curve: cv ? { dir: cv.dir, lean: cv.lean } : null, orderFlow: of ? { dir: of.dir } : null });
    const spot = score.trend?.ltp ?? null;
    return {
      ...c,
      name,
      day,
      asOf: asOf ?? null,
      deadZoneBand: raw ? { ...raw, text: deadZoneText(name, raw, spot) } : null,
      unavailable: [...(this.d.orderFlow && isLive ? [] : ['Order Flow']), ...(this.d.curve ? [] : ['Curve Structure'])],
      score,
    };
  }
}
