import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KiteClient, KiteTokenError, KiteApiError } from '../src/kite/client.js';
import { RateLimiter } from '../src/kite/rateLimiter.js';
import { InstrumentBook, parseInstrumentsCsv, splitCsvLine } from '../src/instruments/book.js';
import { loadInstruments, istDay } from '../src/instruments/loader.js';
import { buildApp } from '../src/api/app.js';
import { KiteTokenStore } from '../src/auth/kiteAuth.js';
import { FileStore } from '../src/store/fileStore.js';
import { createLogger } from '../src/logger.js';

const CSV = [
  'instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange',
  '256265,1001,NIFTY 50,"NIFTY 50",0,,0,0,0,EQ,INDICES,NSE',
  '738561,2885,RELIANCE,"RELIANCE INDUSTRIES",0,,0,0.05,1,EQ,NSE,NSE',
  '9001,35,NIFTY26NOVFUT,"NIFTY",0,2026-11-24,0,0.1,75,FUT,NFO-FUT,NFO',
  '9002,36,NIFTY26DECFUT,"NIFTY",0,2026-12-29,0,0.1,75,FUT,NFO-FUT,NFO',
  '9003,37,NIFTY26N2424000CE,"NIFTY",0,2026-11-24,24000,0.05,75,CE,NFO-OPT,NFO',
  '9004,38,NIFTY26N2424000PE,"NIFTY",0,2026-11-24,24000,0.05,75,PE,NFO-OPT,NFO',
  '9005,39,NIFTY26N2424100CE,"NIFTY",0,2026-11-24,24100,0.05,75,CE,NFO-OPT,NFO',
].join('\n');

const okResp = (data: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify({ status: 'success', data }) });
const fast = new RateLimiter({ history: 0, quote: 0, default: 0 }, { now: () => 0, sleep: async () => undefined });

describe('kite client', () => {
  it('sends the token header and returns data', async () => {
    let seen: { url: string; headers?: Record<string, string> } | undefined;
    const k = new KiteClient({ apiKey: 'KEY', getAccessToken: () => 'TOK', limiter: fast, fetchImpl: async (url, init) => { seen = { url, headers: init?.headers }; return okResp({ 'NSE:NIFTY 50': { instrument_token: 256265, last_price: 24000 } }); } });
    const r = await k.ltp(['NSE:NIFTY 50']);
    expect(r['NSE:NIFTY 50']?.last_price).toBe(24000);
    expect(seen?.url).toContain('/quote/ltp?i=NSE%3ANIFTY+50');
    expect(seen?.headers?.Authorization).toBe('token KEY:TOK');
    expect(seen?.headers?.['X-Kite-Version']).toBe('3');
  });
  it('maps a token problem and other API errors', async () => {
    const mk = (status: number, type: string) => new KiteClient({ apiKey: 'K', getAccessToken: () => 'T', limiter: fast, fetchImpl: async () => ({ ok: false, status, text: async () => JSON.stringify({ status: 'error', error_type: type, message: 'm' }) }) });
    await expect(mk(403, 'TokenException').quote(['NSE:X'])).rejects.toThrow(KiteTokenError);
    await expect(mk(400, 'InputException').quote(['NSE:Y'])).rejects.toThrow(KiteApiError);
  });
  it('refuses to call without a token and parses history with OI', async () => {
    const noTok = new KiteClient({ apiKey: 'K', getAccessToken: () => undefined, limiter: fast, fetchImpl: async () => okResp({}) });
    await expect(noTok.ltp(['NSE:X'])).rejects.toThrow(KiteTokenError);
    let url = '';
    const k = new KiteClient({ apiKey: 'K', getAccessToken: () => 'T', limiter: fast, fetchImpl: async (u) => { url = u; return okResp({ candles: [['2026-11-20T09:15:00+0530', 1, 2, 0.5, 1.5, 100, 5000]] }); } });
    const c = await k.historical(9001, '5minute', '2026-11-20 09:15:00', '2026-11-20 15:30:00', true);
    expect(c[0]?.[6]).toBe(5000);
    expect(url).toContain('/instruments/historical/9001/5minute');
    expect(url).toContain('oi=1');
  });
});

describe('instruments', () => {
  it('splits quoted CSV fields', () => {
    expect(splitCsvLine('1,"A, B",x')).toEqual(['1', 'A, B', 'x']);
    expect(splitCsvLine('"say ""hi""",2')).toEqual(['say "hi"', '2']);
  });
  it('builds lookups', () => {
    const rows = parseInstrumentsCsv(CSV);
    expect(rows).toHaveLength(7);
    const b = new InstrumentBook(rows, '2026-11-21');
    expect(b.symbol('NSE', 'NIFTY 50')?.token).toBe(256265);
    expect(b.token(738561)?.symbol).toBe('RELIANCE');
    expect(b.futures('NFO', 'NIFTY').map((f) => f.expiry)).toEqual(['2026-11-24', '2026-12-29']);
    expect(b.expiries('NFO', 'NIFTY')).toEqual(['2026-11-24']);
    expect(b.options('NFO', 'NIFTY', '2026-11-24', 'CE').map((o) => o.strike)).toEqual([24000, 24100]);
    expect(b.symbol('NFO', 'NIFTY26N2424000PE')?.lotSize).toBe(75);
  });
  it('rejects a dump with a missing column', () => {
    expect(() => parseInstrumentsCsv('a,b\n1,2')).toThrow(/missing the column/);
  });
  it('saves today\'s dump and reuses it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'groot-i-'));
    writeFileSync(join(dir, 'instruments-2020-01-01.csv'), 'old');
    let calls = 0;
    const src = { instruments: async () => { calls++; return CSV; } };
    const now = Date.parse('2026-11-21T04:00:00Z');
    const b1 = await loadInstruments(src, dir, now);
    const b2 = await loadInstruments(src, dir, now);
    expect([b1.size, b2.size, calls]).toEqual([7, 7, 1]);
    expect(existsSync(join(dir, 'instruments-2020-01-01.csv'))).toBe(false);
    expect(istDay(Date.parse('2026-11-20T20:00:00Z'))).toBe('2026-11-21'); // 01:30 IST next day
  });
});

describe('api', () => {
  const build = (tokenFresh = true) => {
    const t = Date.parse('2026-11-20T10:00:00+05:30');
    const tokens = new KiteTokenStore(new FileStore(mkdtempSync(join(tmpdir(), 'groot-a-'))), () => t);
    if (tokenFresh) tokens.save('TOK', 'AB1234');
    const book = new InstrumentBook(parseInstrumentsCsv(CSV), '2026-11-20');
    const kite = new KiteClient({ apiKey: 'KEY', getAccessToken: () => tokens.validToken(), limiter: fast, fetchImpl: async () => okResp({ 'NSE:NIFTY 50': { instrument_token: 256265, last_price: 24100 } }) });
    let reloaded = 0;
    const app = buildApp({
      appSecret: 'x'.repeat(24), apiKey: 'KEY', apiSecret: 'SEC', tokens, kite,
      getInstruments: () => (tokenFresh ? book : undefined), reloadInstruments: async () => { reloaded++; },
      logger: createLogger('silent'), now: () => t,
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ status: 'success', data: { access_token: 'NEW', user_id: 'U9' } }) }),
    });
    return { app, tokens, reloaded: () => reloaded };
  };
  const auth = { authorization: 'Bearer ' + 'x'.repeat(24) };

  it('keeps everything but ping, start and callback behind the secret', async () => {
    const { app } = build();
    expect((await app.inject('/health/ping')).statusCode).toBe(200);
    expect((await app.inject('/health')).statusCode).toBe(401);
    expect((await app.inject({ url: '/health', headers: { authorization: 'Bearer wrong' } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/kite/ltp?i=NSE:NIFTY 50' })).statusCode).toBe(401);
    expect((await app.inject('/auth/kite/start')).statusCode).toBe(302);
  });
  it('reports health, degraded without a token', async () => {
    const ok = (await build().app.inject({ url: '/health', headers: auth })).json();
    expect(ok.status).toBe('ok');
    expect(ok.instruments).toEqual({ loaded: true, count: 7, day: '2026-11-20' });
    const bad = (await build(false).app.inject({ url: '/health', headers: auth })).json();
    expect(bad.status).toBe('degraded');
    expect(bad.problems.join(' ')).toMatch(/no Kite token/);
    expect(JSON.stringify(ok)).not.toContain('TOK');
  });
  it('serves a live price and an instrument lookup, and validates input', async () => {
    const { app } = build();
    const p = (await app.inject({ url: '/kite/ltp?i=NSE:NIFTY%2050', headers: auth })).json();
    expect(p['NSE:NIFTY 50'].last_price).toBe(24100);
    expect((await app.inject({ url: '/instruments/lookup?exchange=NSE&symbol=RELIANCE', headers: auth })).json().token).toBe(738561);
    expect((await app.inject({ url: '/instruments/lookup?exchange=NSE&symbol=NOPE', headers: auth })).statusCode).toBe(404);
    expect((await app.inject({ url: '/kite/ltp', headers: auth })).statusCode).toBe(400);
    expect((await app.inject({ url: '/kite/history?token=abc', headers: auth })).statusCode).toBe(400);
  });
  it('answers 401 kite_token when the Kite token is missing', async () => {
    const r = await build(false).app.inject({ url: '/kite/ltp?i=NSE:X', headers: auth });
    expect(r.statusCode).toBe(401);
    expect(r.json().error).toBe('kite_token');
  });
  it('saves the token from the Kite redirect', async () => {
    const { app, tokens, reloaded } = build(false);
    const r = await app.inject('/auth/kite/callback?request_token=RT&status=success&action=login');
    expect(r.statusCode).toBe(200);
    expect(tokens.validToken()).toBe('NEW');
    await new Promise((res) => setTimeout(res, 5));
    expect(reloaded()).toBe(1);
    expect((await app.inject('/auth/kite/callback?status=error')).statusCode).toBe(400);
  });
});

describe('api feed routes', () => {
  it('watches tokens and serves the live candles built from ticks', async () => {
    const { LiveMarket } = await import('../src/marketdata/live.js');
    const live = new LiveMarket();
    const t = Date.parse('2026-11-20T10:00:00+05:30');
    const tokens = new KiteTokenStore(new FileStore(mkdtempSync(join(tmpdir(), 'groot-f-'))), () => t);
    tokens.save('TOK', 'U');
    const kite = new KiteClient({ apiKey: 'K', getAccessToken: () => 'TOK', limiter: fast, fetchImpl: async () => okResp({}) });
    const app = buildApp({
      appSecret: 'x'.repeat(24), apiKey: 'K', apiSecret: 'S', tokens, kite, getInstruments: () => undefined, reloadInstruments: async () => undefined, logger: createLogger('silent'), now: () => t,
      feed: { status: () => ({ state: 'connected', subscribed: 1, watched: live.watched().length, ticksSeen: live.ticksSeen, lastTickAt: t, connectedAt: t, reconnects: 0 }),
        watch: (l) => l.forEach((x) => live.watch(x.token, x.hasOi)), candles: (tk) => live.candles(tk) },
    });
    const h = { authorization: 'Bearer ' + 'x'.repeat(24) };
    expect((await app.inject({ url: '/live/candles?token=5', headers: h })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/feed/watch', headers: h, payload: { tokens: [] } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/feed/watch', headers: h, payload: { tokens: [{ token: 5, hasOi: false }] } })).json()).toEqual({ watching: 1 });
    live.onTicks([{ token: 5, ltp: 10, open: 0, high: 0, low: 0, close: 0, change: 0, tradable: true, volume: 1 }], t);
    const c = (await app.inject({ url: '/live/candles?token=5', headers: h })).json().candles;
    expect(c).toHaveLength(1);
    expect(c[0][0]).toBe('2026-11-20T10:00:00+0530');
    expect((await app.inject({ url: '/feed/status', headers: h })).json().state).toBe('connected');
    expect((await app.inject({ method: 'POST', url: '/feed/watch', payload: { tokens: [{ token: 5 }] } })).statusCode).toBe(401);
  });
});
