import { levelProb, type LevelProb } from '../engine/levelProb.js';
import type { Walls } from '../engine/oi.js';
import type { OiAnalysis } from './oi.js';
import type { ScoreResult } from './score.js';

export interface LevelProbDeps {
  score: { load(req: { name: string; day: string; asOf?: string }): Promise<ScoreResult> };
  oi: {
    analyse(req: { name: string; day: string; asOf?: string }): Promise<OiAnalysis>;
    wallsAt(req: { name: string; day: string; asOf?: string }, change: number, spot: number): Promise<Walls | null>;
  };
}

export interface LevelProbResult extends LevelProb {
  name: string;
  day: string;
  asOf: string | null;
  inputs: { ltp: number | null; open: number | null; vixRange: number | null; scoreTotal: number; obvFlow: number; walls: Walls | null };
}

/** Level Probability of a name at a moment (NSE names; commodities are not ported yet). */
export class LevelProbService {
  constructor(private readonly d: LevelProbDeps) {}

  async load(req: { name: string; day: string; asOf?: string }): Promise<LevelProbResult> {
    const score = await this.d.score.load(req);
    const tr = score.trend;
    const base = { name: req.name, day: req.day, asOf: req.asOf ?? null };
    if (!tr) return { ...base, ...levelProb({ ltp: 0, open: 0, vixRange: 0, scoreTotal: 0, obvFlow: 0, walls: null }), inputs: { ltp: null, open: null, vixRange: null, scoreTotal: score.score.total, obvFlow: 0, walls: null } };
    let obvFlow = 0;
    let walls: Walls | null = null;
    try {
      obvFlow = (await this.d.oi.analyse(req)).obvFlow;
      walls = await this.d.oi.wallsAt(req, parseFloat(tr.change) || 0, tr.ltp);
    } catch {
      /* no option chain: the OBV and wall terms count as 0, like the userscript without oiData */
    }
    const inputs = { ltp: tr.ltp, open: tr.open, vixRange: tr.vixRange, scoreTotal: score.score.total, obvFlow, walls };
    return { ...base, ...levelProb({ ltp: tr.ltp, open: tr.open, vixRange: tr.vixRange, scoreTotal: score.score.total, obvFlow, walls }), inputs };
  }
}
