/**
 * Level Probability: a faithful port of `_gtbLevelProb` (grootTradeBot.js), NSE branch.
 * A live-signal likelihood that price reaches each strike-derived level today (ASO / AST / VIXU up, BSO / BST / VIXL down).
 * Reasoned estimates, not fitted probabilities: composite score (50%), raw OBV flow (25%) and OI wall pressure (25%) give a lean in -1..1,
 * pushed through a sigmoid at a higher threshold for each outer level; the VIX levels shrink as the expected day range is used up.
 */
import type { Walls, Wall } from './oi.js';

export interface LevelProbInputs {
  /** last price, day open (the 9:15 anchor) and the expected one-day VIX range (vixDDRange) */
  ltp: number;
  open: number;
  vixRange: number;
  /** instrument score total; 0 when it could not be computed */
  scoreTotal: number;
  /** oiData.obvFlow */
  obvFlow: number;
  /** walls found with `findWalls(rows, change, ltp)`; null when no option chain is loaded */
  walls: Walls | null;
}

export interface LevelProb {
  pASO: number | null;
  pAST: number | null;
  pVIXU: number | null;
  pBSO: number | null;
  pBST: number | null;
  pVIXL: number | null;
  netDir: number;
  netDirNoScore?: number;
  ok: boolean;
}

const clamp1 = (x: number): number => Math.max(-1, Math.min(1, x));
const sig = (x: number): number => 1 / (1 + Math.exp(-x));

function pressure(w: Wall[] | undefined, ltp: number): number {
  if (!w || !w.length) return 0;
  let p = 0;
  for (const x of w) {
    const distPct = (Math.abs(x.strike - ltp) / ltp) * 100;
    const prox = Math.max(0, 1 - distPct / 2); // fades out beyond ~2% away
    const strength = x.tier === 'primary' ? 1 : 0.6;
    p = Math.max(p, prox * strength);
  }
  return p;
}

export function levelProb(inp: LevelProbInputs): LevelProb {
  const out: LevelProb = { pASO: null, pAST: null, pVIXU: null, pBSO: null, pBST: null, pVIXL: null, netDir: 0, ok: false };
  const { ltp, open } = inp;
  if (!ltp || !open) return out;

  const s1 = clamp1(inp.scoreTotal / 8);
  const s2 = clamp1((inp.obvFlow || 0) / 4);
  let wallBias = 0;
  if (inp.walls) {
    const resP = pressure(inp.walls.resistance, ltp); // dampens upside
    const supP = pressure(inp.walls.support, ltp); // dampens downside / supports upside
    wallBias = supP - resP;
  }
  const netDir = 0.5 * s1 + 0.25 * s2 + 0.25 * wallBias;
  out.netDir = netDir;
  out.netDirNoScore = (0.25 * s2 + 0.25 * wallBias) / 0.5; // OBV flow + OI walls only: the composite-score term is already voted elsewhere

  const vr = inp.vixRange || 0;
  const roomUp = vr ? Math.max(0, (ltp - open) / vr) : 0;
  const roomDown = vr ? Math.max(0, (open - ltp) / vr) : 0;
  const k = 2.6;
  out.pASO = Math.round(sig(k * (netDir - 0.0)) * 100);
  out.pAST = Math.round(sig(k * (netDir - 0.4)) * 100);
  out.pVIXU = Math.round(sig(k * (netDir - 0.55)) * (1 - Math.min(1, roomUp) * 0.5) * 100);
  out.pBSO = Math.round(sig(k * (-netDir - 0.0)) * 100);
  out.pBST = Math.round(sig(k * (-netDir - 0.4)) * 100);
  out.pVIXL = Math.round(sig(k * (-netDir - 0.55)) * (1 - Math.min(1, roomDown) * 0.5) * 100);
  out.ok = true;
  return out;
}
