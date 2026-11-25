import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Small key/value store backed by one JSON file per key (atomic write: temp file then rename).
 * Phase 0 only needs tokens, settings and pins; candles and snapshots get their own files later.
 * The interface is the seam where SQLite can replace it without touching callers.
 */
export interface KeyValueStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
}

const KEY_RE = /^[A-Za-z0-9._-]{1,80}$/;

export class FileStore implements KeyValueStore {
  private cache = new Map<string, unknown>();
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }
  private path(key: string): string {
    if (!KEY_RE.test(key)) throw new Error(`Invalid store key: ${key}`);
    return join(this.dir, `${key}.json`);
  }
  get<T>(key: string): T | undefined {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    const p = this.path(key);
    if (!existsSync(p)) return undefined;
    try {
      const v = JSON.parse(readFileSync(p, 'utf8')) as T;
      this.cache.set(key, v);
      return v;
    } catch {
      return undefined;
    }
  }
  set<T>(key: string, value: T): void {
    const p = this.path(key);
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, p);
    this.cache.set(key, value);
  }
  delete(key: string): void {
    const p = this.path(key);
    this.cache.delete(key);
    if (existsSync(p)) unlinkSync(p);
  }
}
