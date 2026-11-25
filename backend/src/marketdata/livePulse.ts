import type { LiveMarket } from './live.js';

export interface PulseDeps {
  live: LiveMarket;
  /** is the live feed healthy and the market (NSE or MCX) open on a real trading day */
  active: () => boolean;
  /** recompute the market-wide read for the live day (the heavy part); resolves when it is ready */
  recompute: () => Promise<void>;
  /** a cheap clock for tests */
  now?: () => number;
  intervalSec?: number;
}

/**
 * The live recompute loop. While the feed is healthy and the market is open, the market-wide read is rebuilt about once a minute from the tick-built
 * candles (instead of once per 5-minute slot) and a counter ("pulse") goes up when it is ready. Screens that follow the pulse fetch again, so the numbers
 * move between 5-minute closes. Per-instrument metrics (OI/OBV, futures remark, max pain, consensus, plans) are computed from candles on every request,
 * so they are always current; this loop keeps the one expensive shared piece warm and tells the screens when to look again.
 */
export class LivePulse {
  seq = 0;
  at = 0;
  lastMs = 0;
  runs = 0;
  failures = 0;
  lastError: string | null = null;
  running = false;
  private timer: NodeJS.Timeout | null = null;
  private lastMinute = '';
  private readonly now: () => number;
  constructor(private readonly d: PulseDeps) {
    this.now = d.now ?? Date.now;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), (this.d.intervalSec ?? 20) * 1000);
    this.timer.unref();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** the minute the next recompute is due for: a slot that has not been computed yet */
  async tick(): Promise<boolean> {
    if (this.running || !this.d.active()) return false;
    const minute = new Date(this.now() + 19800000).toISOString().slice(0, 16);
    if (minute === this.lastMinute) return false;
    this.running = true;
    const t0 = this.now();
    try {
      await this.d.recompute();
      this.lastMinute = minute;
      this.seq++;
      this.at = this.now();
      this.runs++;
      this.lastError = null;
    } catch (e) {
      this.failures++;
      this.lastError = (e as Error).message;
      this.d.live.log('error', `live recompute failed: ${this.lastError}`);
    } finally {
      this.lastMs = this.now() - t0;
      this.running = false;
    }
    return true;
  }

  state(): { seq: number; at: number; lastMs: number; runs: number; failures: number; lastError: string | null; running: boolean } {
    return { seq: this.seq, at: this.at, lastMs: this.lastMs, runs: this.runs, failures: this.failures, lastError: this.lastError, running: this.running };
  }
}
