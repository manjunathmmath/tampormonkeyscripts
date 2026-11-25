import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-bucket pacing for Kite Connect. Calls in one bucket run one at a time, at least `minIntervalMs` apart
 * (history is limited to about 3 a second, quotes to 1 a second). Buckets do not block each other.
 * The clock and the sleep are injectable so the pacing can be tested without waiting.
 */
export type Bucket = 'history' | 'quote' | 'default';

export const DEFAULT_INTERVALS: Record<Bucket, number> = { history: 350, quote: 1050, default: 120 };

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** Work started inside `runBackground` (the warm-up, alert scans) waits behind anything a person asked for: a chart must not queue behind hundreds of background reads. */
const bg = new AsyncLocalStorage<boolean>();
export const runBackground = <T>(fn: () => T): T => bg.run(true, fn);
export const isBackground = (): boolean => bg.getStore() === true;

interface Job {
  run: () => Promise<void>;
}

export class RateLimiter {
  private queues = new Map<Bucket, { high: Job[]; low: Job[]; busy: boolean }>();
  private lastStart = new Map<Bucket, number>();
  private started = new Map<Bucket, number[]>();
  private total = new Map<Bucket, number>();
  /** for the status page: waiting jobs and how many calls started per bucket */
  stats(now = Date.now()): Record<string, { queued: number; background: number; total: number; lastMinute: number; lastAt: number | null }> {
    const out: Record<string, { queued: number; background: number; total: number; lastMinute: number; lastAt: number | null }> = {};
    for (const b of ['history', 'quote', 'default'] as Bucket[]) {
      const q = this.queues.get(b);
      const st = (this.started.get(b) ?? []).filter((t) => t > now - 60000);
      this.started.set(b, st);
      out[b] = { queued: q?.high.length ?? 0, background: q?.low.length ?? 0, total: this.total.get(b) ?? 0, lastMinute: st.length, lastAt: this.lastStart.get(b) ?? null };
    }
    return out;
  }
  constructor(private readonly intervals: Record<Bucket, number> = DEFAULT_INTERVALS, private readonly clock: Clock = realClock) {}

  schedule<T>(bucket: Bucket, fn: () => Promise<T>): Promise<T> {
    const low = isBackground();
    let q = this.queues.get(bucket);
    if (!q) {
      q = { high: [], low: [], busy: false };
      this.queues.set(bucket, q);
    }
    const queue = q;
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        run: async () => {
          const wait = (this.lastStart.get(bucket) ?? -Infinity) + this.intervals[bucket] - this.clock.now();
          if (wait > 0) await this.clock.sleep(wait);
          this.lastStart.set(bucket, this.clock.now());
          (this.started.get(bucket) ?? this.started.set(bucket, []).get(bucket)!).push(this.clock.now());
          this.total.set(bucket, (this.total.get(bucket) ?? 0) + 1);
          try {
            resolve(await fn());
          } catch (e) {
            reject(e);
          }
        },
      };
      (low ? queue.low : queue.high).push(job);
      void this.pump(queue);
    });
  }

  /** one job at a time, always the oldest high-priority job first, then the oldest background job */
  private async pump(q: { high: Job[]; low: Job[]; busy: boolean }): Promise<void> {
    if (q.busy) return;
    q.busy = true;
    try {
      for (;;) {
        const job = q.high.shift() ?? q.low.shift();
        if (!job) break;
        await job.run();
      }
    } finally {
      q.busy = false;
    }
  }
}
