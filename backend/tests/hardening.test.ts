import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TickHub, toLiveTick, type LiveTick } from '../src/marketdata/hub.js';
import { SlidingLimiter } from '../src/api/limits.js';
import { buildApp } from '../src/api/app.js';
import { KiteClient } from '../src/kite/client.js';
import { KiteTokenStore } from '../src/auth/kiteAuth.js';
import { FileStore } from '../src/store/fileStore.js';
import { createLogger } from '../src/logger.js';
import type { Tick } from '../src/marketdata/ticks.js';

const tick = (token: number, ltp: number): Tick => ({ token, ltp, open: 1, high: 2, low: 0.5, close: 1.2, change: 0, tradable: true, volume: 10, oi: null, ts: 5 });

describe('tick hub', () => {
  it('sends each client only its tokens, coalescing to the newest tick per token', () => {
    const hub = new TickHub(10_000);
    const a: LiveTick[][] = [];
    const b: LiveTick[][] = [];
    const offA = hub.add({ send: (x) => a.push(x) }, [1, 2]);
    hub.add({ send: (x) => b.push(x) }, [2]);
    hub.publish([tick(1, 10), tick(2, 20), tick(1, 11), tick(3, 30)]);
    hub.flush();
    expect(a).toHaveLength(1);
    expect(a[0]!.map((x) => [x.token, x.ltp]).sort()).toEqual([[1, 11], [2, 20]]);
    expect(b[0]!.map((x) => x.token)).toEqual([2]);
    hub.flush();
    expect(a).toHaveLength(1); // nothing new: nothing sent
    offA();
    hub.publish([tick(1, 12)]);
    hub.flush();
    expect(a).toHaveLength(1);
    expect(hub.clientCount).toBe(1);
    hub.close();
  });
  it('drops a client whose send throws, and maps a tick to the small live shape', () => {
    const hub = new TickHub(10_000);
    hub.add({ send: () => { throw new Error('gone'); } }, [1]);
    hub.publish([tick(1, 1)]);
    hub.flush();
    expect(hub.clientCount).toBe(0);
    expect(toLiveTick(tick(7, 9.5))).toEqual({ token: 7, ltp: 9.5, open: 1, high: 2, low: 0.5, prevClose: 1.2, volume: 10, oi: null, ts: 5 });
    hub.close();
  });
});

describe('sliding limiter', () => {
  it('allows up to the limit inside the window and recovers after it', () => {
    let t = 0;
    const l = new SlidingLimiter(3, 1000, () => t);
    expect([l.hit('a'), l.hit('a'), l.hit('a'), l.hit('a')]).toEqual([true, true, true, false]);
    expect(l.blocked('a')).toBe(true);
    expect(l.blocked('b')).toBe(false);
    t = 1500;
    expect(l.blocked('a')).toBe(false);
    expect(l.hit('a')).toBe(true);
    l.reset('a');
    expect(l.blocked('a')).toBe(false);
  });
});

const fast = { schedule: <T,>(_b: string, fn: () => Promise<T>) => fn() } as never;
const mkApp = (staticDir?: string) => {
  const t = Date.parse('2026-11-20T10:00:00+05:30');
  const tokens = new KiteTokenStore(new FileStore(mkdtempSync(join(tmpdir(), 'groot-h-'))), () => t);
  tokens.save('TOK', 'U');
  const kite = new KiteClient({ apiKey: 'K', getAccessToken: () => 'TOK', limiter: fast, fetchImpl: async () => ({ ok: true, status: 200, text: async () => '{"status":"success","data":{}}' }) });
  const hub = new TickHub(5);
  const watched: number[] = [];
  const app = buildApp({
    appSecret: 'x'.repeat(24), apiKey: 'K', apiSecret: 'S', tokens, kite, getInstruments: () => undefined, reloadInstruments: async () => undefined, logger: createLogger('silent'), now: () => t, hub, staticDir,
    feed: { status: () => ({ state: 'connected', subscribed: 0, watched: 0, ticksSeen: 0, lastTickAt: null, connectedAt: null, reconnects: 0 }), watch: (l) => watched.push(...l.map((x) => x.token)), candles: () => undefined },
  });
  return { app, hub, watched };
};
const auth = { authorization: 'Bearer ' + 'x'.repeat(24) };

describe('api hardening', () => {
  it('blocks an address after 10 wrong secrets, and the right secret is also refused while blocked', async () => {
    const { app } = mkApp();
    for (let i = 0; i < 10; i++) expect((await app.inject({ url: '/health', headers: { authorization: 'Bearer nope' } })).statusCode).toBe(401);
    const r = await app.inject({ url: '/health', headers: auth });
    expect(r.statusCode).toBe(429);
    expect(r.headers['retry-after']).toBe('60');
  });
  it('adds security headers to every response', async () => {
    const { app } = mkApp();
    const r = await app.inject('/health/ping');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
  });
});

describe('static frontend', () => {
  const dir = mkdtempSync(join(tmpdir(), 'groot-w-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<html>app</html>');
  writeFileSync(join(dir, 'assets', 'a-123.js'), 'console.log(1)');
  writeFileSync(join(dir, 'sw.js'), 'self');
  const { app } = mkApp(dir);
  it('serves files, falls back to index.html for client routes, and needs no secret', async () => {
    const js = await app.inject('/assets/a-123.js');
    expect(js.statusCode).toBe(200);
    expect(js.headers['content-type']).toContain('javascript');
    expect(js.headers['cache-control']).toContain('immutable');
    const home = await app.inject('/');
    expect(home.body).toContain('app');
    expect(home.headers['cache-control']).toBe('no-cache');
    expect((await app.inject('/some/client/route')).body).toContain('app');
    expect((await app.inject('/sw.js')).headers['cache-control']).toBe('no-cache');
  });
  it('404s a missing asset, never leaves the folder, and keeps the API behind the secret', async () => {
    expect((await app.inject('/assets/missing.js')).statusCode).toBe(404);
    const trav = await app.inject('/..%2f..%2fetc%2fpasswd');
    expect([403, 200]).toContain(trav.statusCode);
    expect(trav.body).not.toContain('root:');
    expect((await app.inject('/health')).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/nothing' })).statusCode).toBe(404);
  });
});

describe('live stream', () => {
  it('streams ticks for the requested tokens as server-sent events', async () => {
    const { app, hub, watched } = mkApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as { port: number }).port;
    const ctl = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/stream?tokens=256265,260105`, { headers: auth, signal: ctl.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(watched.sort()).toEqual([256265, 260105]);
    hub.publish([tick(256265, 25800.6), tick(999, 1)]);
    const reader = res.body!.getReader();
    let text = '';
    const dec = new TextDecoder();
    for (let i = 0; i < 20 && !text.includes('"ltp":25800.6'); i++) {
      const { value, done } = await reader.read();
      if (done) break;
      text += dec.decode(value);
    }
    expect(text).toContain('event: ready');
    expect(text).toContain('event: ticks');
    expect(text).toContain('"token":256265');
    expect(text).not.toContain('"token":999');
    ctl.abort();
    await new Promise((r) => setTimeout(r, 30));
    expect(hub.clientCount).toBe(0);
    expect((await fetch(`http://127.0.0.1:${port}/stream`, { headers: auth })).status).toBe(400);
    await app.close();
    hub.close();
  });
});
