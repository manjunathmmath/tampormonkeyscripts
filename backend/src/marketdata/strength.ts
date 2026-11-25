import type { ScoreResult } from './score.js';

type Req = { day: string; asOf?: string };

/** The indices ranked on the Strongest / weakest card (`_GTB_STRENGTH_INDICES`). */
export const STRENGTH_INDICES = ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'NIFTY FIN SERVICE', 'NIFTY MID SELECT', 'BANKEX', 'GIFT NIFTY'];
const WITH_SCORE = new Set(['NIFTY 50', 'NIFTY BANK', 'SENSEX']);

export interface StrengthRow {
  name: string;
  /** change vs the previous close, percent */
  chg: number;
  ltp: number;
  /** instrument score total, for NIFTY 50 / NIFTY BANK / SENSEX */
  score: number | null;
  zone: string | null;
}

export interface StrengthResult {
  day: string;
  asOf: string | null;
  rows: StrengthRow[];
  strongest: StrengthRow | null;
  weakest: StrengthRow | null;
  /** strongest change minus weakest change, in percentage points */
  spread: number | null;
}

/** `_gtbStrengthRows`: the indices that have a price, ranked by today's change vs the previous close. Ranks today's move only, not a forecast. */
export function rankStrength(rows: StrengthRow[]): StrengthRow[] {
  return rows.filter((r) => Number.isFinite(r.chg)).sort((a, b) => b.chg - a.chg);
}

export class StrengthService {
  constructor(private readonly d: { score: { load(r: { name: string; day: string; asOf?: string }): Promise<ScoreResult> } }) {}

  async load(req: Req): Promise<StrengthResult> {
    const got = await Promise.all(
      STRENGTH_INDICES.map(async (name): Promise<StrengthRow | null> => {
        try {
          const s = await this.d.score.load({ ...req, name });
          if (!s.trend) return null;
          return { name, chg: parseFloat(s.trend.change), ltp: s.trend.ltp, score: WITH_SCORE.has(name) ? s.score.total : null, zone: s.zone };
        } catch {
          return null;
        }
      }),
    );
    const rows = rankStrength(got.filter((x): x is StrengthRow => x !== null));
    const strongest = rows[0] ?? null;
    const weakest = rows.length > 1 ? rows[rows.length - 1]! : null;
    return { day: req.day, asOf: req.asOf ?? null, rows, strongest, weakest, spread: strongest && weakest ? strongest.chg - weakest.chg : null };
  }
}
