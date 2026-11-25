import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/** One reading while MCX is open: the MCX price, the global-implied price and how old the global quote was. */
export interface GapPoint { t: number; name: string; mcx: number; est: number; gap: number; age: number }

export const THRESHOLDS = [0.15, 0.3, 0.5];
export const HORIZONS = [15, 30];
const KEEP_DAYS = 30;

const dayOf = (ms: number): string => new Date(ms + 19800000).toISOString().slice(0, 10);

/** Appends each reading to a file per day (no rewriting), and reads the recent days back. */
export class GapLog {
  constructor(private readonly dir: string, private readonly now: () => number = Date.now) {
    mkdirSync(dir, { recursive: true });
  }
  private file(day: string): string {
    return join(this.dir, `${day}.jsonl`);
  }
  append(points: GapPoint[]): void {
    if (!points.length) return;
    const day = dayOf(points[0]!.t);
    appendFileSync(this.file(day), points.map((p) => JSON.stringify([p.t, p.name, p.mcx, +p.est.toFixed(2), +p.gap.toFixed(4), p.age])).join('\n') + '\n', 'utf8');
  }
  /** drops files older than 30 days */
  prune(): void {
    const cut = dayOf(this.now() - KEEP_DAYS * 86400000);
    for (const f of readdirSync(this.dir)) if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(0, 10) < cut) unlinkSync(join(this.dir, f));
  }
  days(): string[] {
    return readdirSync(this.dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).map((f) => f.slice(0, 10)).sort();
  }
  read(days = KEEP_DAYS): GapPoint[] {
    const out: GapPoint[] = [];
    for (const d of this.days().slice(-days)) {
      const f = this.file(d);
      if (!existsSync(f)) continue;
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        if (!line) continue;
        try {
          const [t, name, mcx, est, gap, age] = JSON.parse(line) as [number, string, number, number, number, number];
          out.push({ t, name, mcx, est, gap, age });
        } catch {
          /* a half-written line */
        }
      }
    }
    return out;
  }
}

export interface GapStat {
  name: string;
  /** readings with |gap| at least this many percent */
  threshold: number;
  /** minutes ahead that MCX was looked at */
  horizon: number;
  n: number;
  /** average MCX move in the direction the gap pointed, percent (positive = MCX moved towards the estimate) */
  avgMove: number | null;
  medianMove: number | null;
  /** share of readings where MCX moved in the direction of the gap */
  hitPct: number | null;
  /** share where MCX covered at least half of the gap */
  closedPct: number | null;
  avgGap: number | null;
  /** the same horizon's average absolute MCX move over all readings: what plain noise would give */
  noise: number | null;
}

const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * Did MCX move towards the global-implied price after a gap showed? For every reading whose global quote was no older than `maxAgeSec`, the MCX price a
 * horizon later (same day) is compared with the price then. Readings overlap heavily (every couple of minutes), so the counts are a rough guide.
 */
export function analyseGaps(points: GapPoint[], o: { maxAgeSec?: number } = {}): { stats: GapStat[]; used: number; stale: number } {
  const maxAge = o.maxAgeSec ?? 360;
  const byName = new Map<string, GapPoint[]>();
  let stale = 0;
  let used = 0;
  for (const p of points) {
    if (p.age > maxAge) { stale++; continue; }
    used++;
    (byName.get(p.name) ?? byName.set(p.name, []).get(p.name)!).push(p);
  }
  const stats: GapStat[] = [];
  for (const [name, list] of [...byName].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => a.t - b.t);
    for (const h of HORIZONS) {
      // the reading about h minutes later on the same day (within 3 minutes of it)
      const fwd: (GapPoint | null)[] = list.map((p, i) => {
        const target = p.t + h * 60000;
        for (let j = i + 1; j < list.length; j++) {
          const q = list[j]!;
          if (dayOf(q.t) !== dayOf(p.t)) return null;
          if (q.t >= target) return q.t - target <= 180000 ? q : null;
        }
        return null;
      });
      const moves = list.map((p, i) => (fwd[i] ? (fwd[i]!.mcx / p.mcx - 1) * 100 : null));
      const noiseList = moves.filter((x): x is number => x != null).map(Math.abs);
      const noise = noiseList.length ? noiseList.reduce((a, b) => a + b, 0) / noiseList.length : null;
      for (const th of THRESHOLDS) {
        const dirMoves: number[] = [];
        const gaps: number[] = [];
        let hit = 0;
        let closed = 0;
        list.forEach((p, i) => {
          const mv = moves[i];
          if (mv == null || Math.abs(p.gap) < th) return;
          const dir = p.gap > 0 ? 1 : -1;
          const m = mv * dir;
          dirMoves.push(m);
          gaps.push(Math.abs(p.gap));
          if (m > 0) hit++;
          if (m >= Math.abs(p.gap) / 2) closed++;
        });
        const n = dirMoves.length;
        stats.push({
          name, threshold: th, horizon: h, n,
          avgMove: n ? dirMoves.reduce((a, b) => a + b, 0) / n : null,
          medianMove: n ? median(dirMoves) : null,
          hitPct: n ? (hit / n) * 100 : null,
          closedPct: n ? (closed / n) * 100 : null,
          avgGap: n ? gaps.reduce((a, b) => a + b, 0) / n : null,
          noise,
        });
      }
    }
  }
  return { stats, used, stale };
}
