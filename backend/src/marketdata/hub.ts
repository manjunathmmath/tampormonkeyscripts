import type { Tick } from './ticks.js';

/** What a client receives per instrument: the latest price and the day figures, kept small on purpose. */
export interface LiveTick {
  token: number;
  ltp: number;
  open: number;
  high: number;
  low: number;
  /** previous day's close (Kite's "close" in a quote packet) */
  prevClose: number;
  volume: number | null;
  oi: number | null;
  /** exchange timestamp, unix seconds (0 when absent) */
  ts: number;
}

export const toLiveTick = (t: Tick): LiveTick => ({
  token: t.token,
  ltp: t.ltp,
  open: t.open,
  high: t.high,
  low: t.low,
  prevClose: t.close,
  volume: t.volume ?? null,
  oi: t.oi ?? null,
  ts: t.ts ?? 0,
});

export interface Subscriber {
  /** called with a batch of the latest ticks (at most one per token) */
  send(batch: LiveTick[]): void;
}

interface Client {
  tokens: Set<number>;
  sub: Subscriber;
  pending: Map<number, LiveTick>;
}

/**
 * Fan-out of ticks to connected clients. Each client says which tokens it wants; ticks are coalesced so a client gets at most one message per
 * token per flush interval (the newest one), which keeps a phone on a slow network from being flooded. A client that throws is dropped.
 */
export class TickHub {
  private clients = new Set<Client>();
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly flushMs = 400) {}

  get clientCount(): number {
    return this.clients.size;
  }

  /** Registers a client; returns a function that removes it. */
  add(sub: Subscriber, tokens: number[]): () => void {
    const c: Client = { sub, tokens: new Set(tokens), pending: new Map() };
    this.clients.add(c);
    this.ensureTimer();
    return () => {
      this.clients.delete(c);
      if (!this.clients.size && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  /** Called with every tick batch from the ticker. */
  publish(ticks: Tick[]): void {
    if (!this.clients.size) return;
    for (const t of ticks) {
      let lt: LiveTick | undefined;
      for (const c of this.clients) {
        if (!c.tokens.has(t.token)) continue;
        lt ??= toLiveTick(t);
        c.pending.set(t.token, lt);
      }
    }
  }

  /** Sends what has accumulated (exposed so tests do not need to wait for the timer). */
  flush(): void {
    for (const c of [...this.clients]) {
      if (!c.pending.size) continue;
      const batch = [...c.pending.values()];
      c.pending.clear();
      try {
        c.sub.send(batch);
      } catch {
        this.clients.delete(c);
      }
    }
  }

  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), this.flushMs);
    this.timer.unref?.();
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.clients.clear();
  }
}
