/** TTL cache that also shares one in-flight request between callers asking for the same key. */
export class TtlCache {
  private values = new Map<string, { at: number; v: unknown }>();
  private inflight = new Map<string, Promise<unknown>>();
  constructor(private readonly now: () => number = Date.now) {}

  async getOrLoad<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const hit = this.values.get(key);
    if (hit && this.now() - hit.at < ttlMs) return hit.v as T;
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;
    const p = loader()
      .then((v) => {
        this.values.set(key, { at: this.now(), v });
        return v;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  invalidate(prefix = ''): void {
    for (const k of [...this.values.keys()]) if (k.startsWith(prefix)) this.values.delete(k);
  }
}
