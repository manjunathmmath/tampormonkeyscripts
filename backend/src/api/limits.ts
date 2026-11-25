/**
 * Small in-memory limits, no dependency. `SlidingLimiter` counts events per key in a time window; it is used for
 * (1) failed secret attempts per client address (brute-force protection) and (2) a generous request ceiling per address.
 */
export class SlidingLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs: number, private readonly now: () => number = Date.now) {}

  /** Records one event and returns true while the key is still within its limit. */
  hit(key: string): boolean {
    const t = this.now();
    const arr = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    arr.push(t);
    this.hits.set(key, arr);
    if (this.hits.size > 5000) this.sweep(t);
    return arr.length <= this.max;
  }

  /** True when the key has already used up its limit (without recording a new event). */
  blocked(key: string): boolean {
    const t = this.now();
    const arr = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    return arr.length >= this.max;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private sweep(t: number): void {
    for (const [k, v] of this.hits) if (!v.some((x) => t - x < this.windowMs)) this.hits.delete(k);
  }
}
