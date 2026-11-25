import { Writable } from 'node:stream';

export interface ActivityEntry {
  /** epoch ms */
  t: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  msg: string;
  /** a few useful fields of the log line (never secrets: the logger redacts them before they get here) */
  data?: Record<string, unknown>;
}

const LEVELS: Record<number, ActivityEntry['level']> = { 10: 'debug', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'error' };
const SKIP = new Set(['level', 'time', 'pid', 'hostname', 'msg', 'v']);

/** The most recent log lines, kept in memory for the System screen. Oldest entries drop off. */
export class ActivityLog {
  private items: ActivityEntry[] = [];
  constructor(private readonly max = 300) {}

  push(e: ActivityEntry): void {
    this.items.push(e);
    if (this.items.length > this.max) this.items.splice(0, this.items.length - this.max);
  }

  /** Newest first. */
  list(limit = 100, minLevel: ActivityEntry['level'] = 'info'): ActivityEntry[] {
    const rank = { debug: 0, info: 1, warn: 2, error: 3 } as const;
    const out: ActivityEntry[] = [];
    for (let i = this.items.length - 1; i >= 0 && out.length < limit; i--) {
      const e = this.items[i]!;
      if (rank[e.level] >= rank[minLevel]) out.push(e);
    }
    return out;
  }

  /** A writable stream for pino: every JSON log line becomes an entry. */
  stream(): Writable {
    return new Writable({
      write: (chunk: Buffer, _enc, cb) => {
        for (const line of chunk.toString('utf8').split('\n')) {
          if (!line.trim()) continue;
          try {
            const j = JSON.parse(line) as Record<string, unknown>;
            const data: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(j)) if (!SKIP.has(k)) data[k] = v;
            this.push({ t: typeof j.time === 'number' ? j.time : Date.now(), level: LEVELS[Number(j.level)] ?? 'info', msg: String(j.msg ?? ''), data: Object.keys(data).length ? data : undefined });
          } catch {
            /* not a JSON line */
          }
        }
        cb();
      },
    });
  }
}
