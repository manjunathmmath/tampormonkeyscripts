export interface ProgressTask {
  key: string;
  label: string;
  phase: string;
  done: number;
  total: number;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
}

/**
 * What the backend is busy with, for the screens: a heavy read (the whole-market read of the first request of a day, the constituents' option chains)
 * reports its phase and how many names are done, so the screen can show progress instead of a bare "loading".
 */
export class Progress {
  private tasks = new Map<string, ProgressTask>();
  constructor(private readonly now: () => number = Date.now) {}

  start(key: string, label: string, phase = 'starting', total = 0): void {
    this.tasks.set(key, { key, label, phase, done: 0, total, startedAt: this.now(), finishedAt: null, error: null });
  }

  /** moves to a new phase (done restarts at 0) */
  phase(key: string, phase: string, total = 0): void {
    const t = this.tasks.get(key);
    if (t) Object.assign(t, { phase, done: 0, total });
  }

  tick(key: string): void {
    const t = this.tasks.get(key);
    if (t) t.done++;
  }

  end(key: string, error: string | null = null): void {
    const t = this.tasks.get(key);
    if (t) Object.assign(t, { finishedAt: this.now(), error });
  }

  /** running tasks, plus the ones that finished in the last 10 seconds (so a screen can show "done") */
  active(): (ProgressTask & { elapsedSec: number })[] {
    const n = this.now();
    return [...this.tasks.values()]
      .filter((t) => t.finishedAt === null || n - t.finishedAt < 10000)
      .map((t) => ({ ...t, elapsedSec: Math.round(((t.finishedAt ?? n) - t.startedAt) / 1000) }));
  }
}
