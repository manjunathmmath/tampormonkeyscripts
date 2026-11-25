/**
 * On-demand refresh: every service that keeps a per-slot or short-lived copy registers a function that drops it. `run()` calls them all, so the next read of
 * each card recomputes from the live feed and Kite now instead of waiting for the next 5-minute slot. Finished-day data on disk and the live tick-built
 * candles are not touched.
 */
export class Refresher {
  private readonly fns: { name: string; fn: () => void }[] = [];
  lastAt: number | null = null;
  constructor(private readonly now: () => number = Date.now) {}

  register(name: string, fn: () => void): void {
    this.fns.push({ name, fn });
  }

  run(): { at: number; cleared: string[]; failed: string[] } {
    const cleared: string[] = [];
    const failed: string[] = [];
    for (const { name, fn } of this.fns) {
      try {
        fn();
        cleared.push(name);
      } catch {
        failed.push(name);
      }
    }
    this.lastAt = this.now();
    return { at: this.lastAt, cleared, failed };
  }
}
