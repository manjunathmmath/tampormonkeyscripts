import type { RawPosition } from '../marketdata/positions.js';
import type { FetchLike } from '../auth/kiteAuth.js';
import { TtlCache } from './cache.js';
import { RateLimiter, type Bucket } from './rateLimiter.js';

export class KiteTokenError extends Error {
  readonly code = 'TOKEN';
}
export class KiteApiError extends Error {
  constructor(readonly status: number, readonly errorType: string, message: string) {
    super(message);
  }
}
export class KiteNotConfiguredError extends Error {
  readonly code = 'NOT_CONFIGURED';
}

/** [time ISO+0530, open, high, low, close, volume, oi?] — the same candle shape the userscript works with. */
export type Candle = [string, number, number, number, number, number, number?];

export type HistoryInterval = 'minute' | '3minute' | '5minute' | '10minute' | '15minute' | '30minute' | '60minute' | 'day';

export interface KiteClientDeps {
  apiKey: string;
  getAccessToken: () => string | undefined;
  fetchImpl?: FetchLike;
  limiter?: RateLimiter;
  cache?: TtlCache;
  baseUrl?: string;
}

/**
 * The only place that talks to Kite Connect (REST). Read-only: there is deliberately no order method.
 * Calls are paced by the rate limiter and identical reads inside a short TTL share one response.
 */
export class KiteClient {
  private readonly fetchImpl: FetchLike;
  private readonly limiter: RateLimiter;
  private readonly cache: TtlCache;

  /** drops the short-lived copies of quotes and history (an on-demand refresh) */
  invalidateCache(): void {
    this.cache.invalidate();
  }
  private readonly base: string;
  constructor(private readonly deps: KiteClientDeps) {
    this.fetchImpl = deps.fetchImpl ?? (fetch as unknown as FetchLike);
    this.limiter = deps.limiter ?? new RateLimiter();
    this.cache = deps.cache ?? new TtlCache();
    this.base = deps.baseUrl ?? 'https://api.kite.trade';
  }

  private async raw(path: string, query: Record<string, string | string[]> | undefined, bucket: Bucket): Promise<string> {
    if (!this.deps.apiKey) throw new KiteNotConfiguredError('KITE_API_KEY is not set');
    const token = this.deps.getAccessToken();
    if (!token) throw new KiteTokenError('No valid Kite access token. Log in again (GET /auth/kite/login).');
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) for (const item of Array.isArray(v) ? v : [v]) qs.append(k, item);
    const url = `${this.base}${path}${qs.toString() ? `?${qs.toString()}` : ''}`;
    return this.limiter.schedule(bucket, async () => {
      const res = await this.fetchImpl(url, { headers: { 'X-Kite-Version': '3', Authorization: `token ${this.deps.apiKey}:${token}` } });
      const text = await res.text();
      if (res.ok) return text;
      let type = 'GeneralException';
      let message = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(text) as { error_type?: string; message?: string };
        type = j.error_type ?? type;
        message = j.message ?? message;
      } catch {
        /* not JSON */
      }
      if (type === 'TokenException' || res.status === 403) throw new KiteTokenError(`Kite rejected the token: ${message}`);
      throw new KiteApiError(res.status, type, message);
    });
  }

  private async json<T>(path: string, query: Record<string, string | string[]> | undefined, bucket: Bucket): Promise<T> {
    const text = await this.raw(path, query, bucket);
    const j = JSON.parse(text) as { status: string; data: T };
    return j.data;
  }

  /** Daily instruments dump (CSV text). Large (about 10 MB for all exchanges): call once a day. */
  instruments(exchange?: string): Promise<string> {
    return this.raw(exchange ? `/instruments/${exchange}` : '/instruments', undefined, 'default');
  }

  /** Last traded prices. `instruments` look like "NSE:NIFTY 50". Up to 1000 at a time. */
  ltp(instruments: string[]): Promise<Record<string, { instrument_token: number; last_price: number }>> {
    return this.cache.getOrLoad(`ltp:${instruments.join(',')}`, 800, () => this.json('/quote/ltp', { i: instruments }, 'quote'));
  }

  /** Full quotes (OHLC, volume, OI, depth). Up to 500 at a time. */
  quote(instruments: string[]): Promise<Record<string, unknown>> {
    return this.cache.getOrLoad(`quote:${instruments.join(',')}`, 800, () => this.json('/quote', { i: instruments }, 'quote'));
  }

  /** Account margins by segment (read-only). */
  margins(): Promise<{ equity?: { net?: number; available?: { live_balance?: number; cash?: number } }; commodity?: { net?: number; available?: { live_balance?: number; cash?: number } } }> {
    return this.cache.getOrLoad('margins', 10_000, () => this.json('/user/margins', undefined, 'default'));
  }

  /** Positions of the day (read-only): each carries Kite's own pnl. */
  positions(): Promise<{ day?: RawPosition[]; net?: RawPosition[] }> {
    return this.cache.getOrLoad('positions', 10_000, () => this.json('/portfolio/positions', undefined, 'default'));
  }

  /** Historical candles. `from` / `to` are "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD". Open interest included when `oi` is true. */
  limiterStats(): ReturnType<RateLimiter['stats']> {
    return this.limiter.stats();
  }

  async historical(token: number, interval: HistoryInterval, from: string, to: string, oi = false): Promise<Candle[]> {
    const data = await this.cache.getOrLoad(`hist:${token}:${interval}:${from}:${to}:${oi}`, 30_000, () =>
      this.json<{ candles: Candle[] }>(`/instruments/historical/${token}/${interval}`, { from, to, oi: oi ? '1' : '0' }, 'history'),
    );
    return data.candles;
  }
}
