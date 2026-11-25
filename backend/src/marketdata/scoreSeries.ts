import type { ScoreResult } from './score.js';
import type { KeyValueStore } from '../store/fileStore.js';

type Req = { name: string; day: string; asOf?: string };

export interface ScorePoint {
  t: string;
  total: number;
  parts: { nine_fifteen: number; current_trend: number; futures_trend: number; oi_obv: number; max_pain: number; iv_skew: number };
}

export interface ScoreSeriesDeps {
  score: { load(r: Req): Promise<ScoreResult> };
  isMcx: (name: string) => boolean;
  store: KeyValueStore;
  now?: () => number;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const hm = (m: number): string => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const toMin = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** the time slots of a day to score: NSE every 5 minutes from 09:20 to 15:25, MCX every 15 minutes from 09:15 to 23:45, never later than the limit */
export function slots(mcx: boolean, limit: string | null): string[] {
  const out: string[] = [];
  const [a, b, step] = mcx ? [9 * 60 + 15, 23 * 60 + 45, 15] : [9 * 60 + 20, 15 * 60 + 25, 5];
  for (let m = a; m <= b; m += step) if (!limit || m <= toMin(limit)) out.push(hm(m));
  return out;
}

/**
 * The score of one instrument after each time slot of the day (the SCORE strip under the chart): the same instrument score the dashboard shows, read at every slot
 * with its own snapshot time. Slots are read two at a time and kept, so a refresh only computes the slots that are new; a finished past day is saved. Not a forecast.
 */
export class ScoreSeriesService {
  private mem = new Map<string, Map<string, ScorePoint>>();
  constructor(private readonly d: ScoreSeriesDeps) {}

  invalidate(): void {
    this.mem.clear();
  }

  async load(req: Req): Promise<ScorePoint[]> {
    const nowMs = (this.d.now ?? Date.now)();
    const today = new Date(nowMs + 19800000).toISOString().slice(0, 10);
    const nowHm = new Date(nowMs + 19800000).toISOString().slice(11, 16);
    const past = req.day < today;
    const limit = req.asOf ?? (req.day === today ? nowHm : null);
    const mcx = this.d.isMcx(req.name);
    const key = `${req.name}|${req.day}`;
    const saveKey = `score_series_${req.name.replace(/\W/g, '_')}_${req.day}`;
    const saved = past ? this.d.store.get<ScorePoint[]>(saveKey) : null;
    const have = this.mem.get(key) ?? new Map<string, ScorePoint>();
    if (saved && !this.mem.has(key)) for (const p of saved) have.set(p.t, p);
    this.mem.set(key, have);
    const want = slots(mcx, limit);
    // on the live day the last slot is read again, so the newest point is never stale
    const todo = want.filter((t) => !have.has(t) || (req.day === today && !req.asOf && t === want[want.length - 1]));
    let i = 0;
    await Promise.all(
      Array.from({ length: Math.min(2, todo.length) }, async () => {
        while (i < todo.length) {
          const t = todo[i++]!;
          try {
            const s = await this.d.score.load({ name: req.name, day: req.day, asOf: t });
            have.set(t, { t, total: s.score.total, parts: { nine_fifteen: s.score.nine_fifteen, current_trend: s.score.current_trend, futures_trend: s.score.futures_trend, oi_obv: s.score.oi_obv, max_pain: s.score.max_pain, iv_skew: s.score.iv_skew } });
          } catch {
            /* a slot that cannot be read is left out */
          }
        }
      }),
    );
    const out = want.map((t) => have.get(t)).filter((x): x is ScorePoint => !!x);
    if (past && out.length >= want.length * 0.9) this.d.store.set(saveKey, out);
    return out;
  }
}
