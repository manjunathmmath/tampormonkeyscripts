import type { KeyValueStore } from '../store/fileStore.js';
import type { VolKey } from '../engine/mcx.js';

type Req = { key: Exclude<VolKey, 'FIXED'>; day: string };

const CBOE_SYMBOL: Record<Exclude<VolKey, 'FIXED'>, string> = { OVX: '_OVX', GVZ: '_GVZ', VXSLV: '_VXSLV', VIX: '_VIX' };
const YAHOO_SYMBOL: Record<Exclude<VolKey, 'FIXED'>, string> = { OVX: '^OVX', GVZ: '^GVZ', VXSLV: '^VXSLV', VIX: '^VIX' };

export interface VolValue {
  key: string;
  /** percent, as the index is quoted */
  value: number;
  /** where it came from */
  source: 'cboe' | 'yahoo' | 'saved' | 'manual';
  /** the date the value belongs to (the close of the previous session) */
  asOf: string | null;
}

export interface VolDeps {
  store: KeyValueStore;
  /** CBOE delayed quote: the previous session's close of the index (`data.prev_day_close`) */
  cboe?: (symbol: string) => Promise<number>;
  /** Yahoo daily closes (date, close) of the index */
  yahoo?: (symbol: string) => Promise<{ d: string; c: number }[]>;
  /** a value typed in Settings, when the user set one (a later Settings screen) */
  manual?: (key: string) => number | null;
  now?: () => number;
}

async function defaultCboe(symbol: string): Promise<number> {
  const r = await fetch(`https://cdn-api.cboe.com/api/global/delayed_quotes/quotes/${symbol}.json`, { headers: { Accept: 'application/json, text/plain, */*', Referer: 'https://www.cboe.com/' }, signal: AbortSignal.timeout(15000) });
  const text = await r.text();
  if (/^\s*</.test(text)) throw new Error(`CBOE answered with a web page (HTTP ${r.status}), most likely its bot protection blocked the request`);
  const j = JSON.parse(text) as { data?: { prev_day_close?: number } };
  const v = j?.data?.prev_day_close;
  if (v == null || !Number.isFinite(Number(v))) throw new Error('no prev_day_close in the response');
  return Number(v);
}

async function defaultYahoo(symbol: string): Promise<{ d: string; c: number }[]> {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = (await r.json()) as { chart: { result: { timestamp?: number[]; indicators: { quote: { close?: (number | null)[] }[] } }[] } };
  const res = j.chart.result[0]!;
  const ts = res.timestamp ?? [];
  const cl = res.indicators.quote[0]?.close ?? [];
  const out: { d: string; c: number }[] = [];
  for (let i = 0; i < ts.length; i++) if (cl[i] != null && Number.isFinite(cl[i]!)) out.push({ d: new Date(ts[i]! * 1000 + 5.5 * 3600000).toISOString().slice(0, 10), c: cl[i]! });
  return out;
}

/**
 * The volatility index a commodity's expected daily range uses (OVX, GVZ, VXSLV, VIX): yesterday's close, which is what the userscript's Settings fields hold.
 * Order: a value set by hand, then CBOE (today), then Yahoo's daily close before the day (also what a replay of a past day needs), then the last saved value.
 */
export class VolIndexService {
  private readonly cache = new Map<string, { at: number; v: VolValue }>();
  constructor(private readonly d: VolDeps) {}

  invalidate(): void {
    this.cache.clear();
  }

  async get(req: Req): Promise<VolValue | null> {
    const m = this.d.manual?.(req.key);
    if (m != null && m > 0) return { key: req.key, value: m, source: 'manual', asOf: null };
    const ck = `${req.key}|${req.day}`;
    const hit = this.cache.get(ck);
    if (hit && (this.d.now ?? Date.now)() - hit.at < 3600000) return hit.v;
    const today = new Date((this.d.now ?? Date.now)() + 19800000).toISOString().slice(0, 10);
    let v: VolValue | null = null;
    if (req.day >= today) {
      try {
        v = { key: req.key, value: await (this.d.cboe ?? defaultCboe)(CBOE_SYMBOL[req.key]), source: 'cboe', asOf: null };
      } catch {
        v = null;
      }
    }
    if (!v) {
      try {
        const rows = await (this.d.yahoo ?? defaultYahoo)(YAHOO_SYMBOL[req.key]);
        const before = rows.filter((x) => x.d < req.day);
        const last = before[before.length - 1];
        if (last) v = { key: req.key, value: last.c, source: 'yahoo', asOf: last.d };
      } catch {
        v = null;
      }
    }
    const sk = `vol_${req.key}`;
    if (v) {
      this.d.store.set(sk, { value: v.value, asOf: v.asOf, savedFor: req.day });
      this.cache.set(ck, { at: (this.d.now ?? Date.now)(), v });
      return v;
    }
    const saved = this.d.store.get<{ value: number; asOf: string | null }>(sk);
    return saved ? { key: req.key, value: saved.value, source: 'saved', asOf: saved.asOf } : null;
  }
}
