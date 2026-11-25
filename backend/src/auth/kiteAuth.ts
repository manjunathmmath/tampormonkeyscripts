import { createHash } from 'node:crypto';
import type { KeyValueStore } from '../store/fileStore.js';

export interface KiteTokenRecord {
  accessToken: string;
  userId: string;
  savedAt: number; // epoch ms
}

export type TokenState = 'missing' | 'valid' | 'expired';

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const TOKEN_KEY = 'kite-token';

export function loginUrl(apiKey: string): string {
  return `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(apiKey)}`;
}

/** Kite's checksum: sha256(api_key + request_token + api_secret) as hex. */
export function checksum(apiKey: string, requestToken: string, apiSecret: string): string {
  return createHash('sha256').update(apiKey + requestToken + apiSecret).digest('hex');
}

/**
 * Kite access tokens stop working at about 06:00 IST every day. The most recent 06:00 IST at or before `nowMs`
 * is the cutoff: a token saved before it is treated as expired.
 */
export function lastTokenCutoff(nowMs: number): number {
  const ist = nowMs + IST_OFFSET_MS;
  const day = Math.floor(ist / 86400000) * 86400000; // IST midnight, expressed on the shifted clock
  let cut = day + 6 * 3600 * 1000;
  if (cut > ist) cut -= 86400000;
  return cut - IST_OFFSET_MS;
}

export function tokenState(rec: KiteTokenRecord | undefined, nowMs: number): TokenState {
  if (!rec || !rec.accessToken) return 'missing';
  return rec.savedAt >= lastTokenCutoff(nowMs) ? 'valid' : 'expired';
}

export class KiteTokenStore {
  constructor(private readonly store: KeyValueStore, private readonly now: () => number = Date.now) {}
  get(): KiteTokenRecord | undefined {
    return this.store.get<KiteTokenRecord>(TOKEN_KEY);
  }
  save(accessToken: string, userId: string): KiteTokenRecord {
    const rec = { accessToken, userId, savedAt: this.now() };
    this.store.set(TOKEN_KEY, rec);
    return rec;
  }
  clear(): void {
    this.store.delete(TOKEN_KEY);
  }
  state(): TokenState {
    return tokenState(this.get(), this.now());
  }
  /** The access token if it is still valid, else undefined. */
  validToken(): string | undefined {
    const rec = this.get();
    return tokenState(rec, this.now()) === 'valid' ? rec?.accessToken : undefined;
  }
}

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export class KiteLoginError extends Error {}

/** Exchanges the request_token from the login redirect for today's access token. */
export async function exchangeRequestToken(
  apiKey: string,
  apiSecret: string,
  requestToken: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<{ accessToken: string; userId: string }> {
  const body = new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum: checksum(apiKey, requestToken, apiSecret) }).toString();
  const res = await fetchImpl('https://api.kite.trade/session/token', {
    method: 'POST',
    headers: { 'X-Kite-Version': '3', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  let json: { status?: string; message?: string; error_type?: string; data?: { access_token?: string; user_id?: string } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new KiteLoginError(`Kite answered with something that is not JSON (HTTP ${res.status})`);
  }
  if (!res.ok || json.status !== 'success' || !json.data?.access_token) {
    throw new KiteLoginError(`Kite refused the login: ${json.error_type ?? 'error'}: ${json.message ?? `HTTP ${res.status}`}`);
  }
  return { accessToken: json.data.access_token, userId: json.data.user_id ?? '' };
}
