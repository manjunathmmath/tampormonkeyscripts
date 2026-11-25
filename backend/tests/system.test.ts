import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActivityLog } from '../src/system/activity.js';
import { createLogger } from '../src/logger.js';
import { buildApp } from '../src/api/app.js';
import { KiteClient } from '../src/kite/client.js';
import { KiteTokenStore } from '../src/auth/kiteAuth.js';
import { FileStore } from '../src/store/fileStore.js';

const fast = { schedule: <T,>(_b: string, fn: () => Promise<T>) => fn() } as never;

describe('activity log', () => {
  it('keeps the newest lines, filters by level and never stores a redacted secret', () => {
    const a = new ActivityLog(5);
    const log = createLogger('info', a.stream());
    log.info('first');
    log.warn({ n: 1 }, 'second');
    log.error({ err: { message: 'boom' } }, 'third');
    log.info({ cfg: { apiSecret: 'TOPSECRET', ok: 1 } }, 'fourth');
    for (let i = 0; i < 4; i++) log.info(`filler ${i}`);
    const all = a.list(20, 'info');
    expect(all.length).toBe(5); // capped at 5, oldest dropped
    expect(all[0]!.msg).toBe('filler 3'); // newest first
    expect(JSON.stringify(a.list(20, 'debug'))).not.toContain('TOPSECRET');
    const b = new ActivityLog();
    const l2 = createLogger('info', b.stream());
    l2.info('i');
    l2.warn('w');
    l2.error('e');
    expect(b.list(10, 'warn').map((x) => x.msg)).toEqual(['e', 'w']);
    expect(b.list(10, 'error').map((x) => x.level)).toEqual(['error']);
    expect(JSON.stringify(b.list(10, 'info'))).not.toContain('pid');
    l2.info({ cfg: { apiSecret: 'TOPSECRET' } }, 'x');
    expect(JSON.stringify(b.list(10, 'info'))).not.toContain('TOPSECRET');
  });
});

describe('system endpoints', () => {
  const auth = { authorization: 'Bearer ' + 'x'.repeat(24) };
  const mk = (ltp: () => Promise<unknown>) => {
    const t = Date.parse('2026-11-21T10:00:00+05:30');
    const tokens = new KiteTokenStore(new FileStore(mkdtempSync(join(tmpdir(), 'groot-sys-'))), () => t);
    tokens.save('TOK', 'AB1234');
    const kite = new KiteClient({ apiKey: 'K', getAccessToken: () => 'TOK', limiter: fast, fetchImpl: async () => ({ ok: true, status: 200, text: async () => '{}' }) });
    (kite as unknown as { ltp: () => Promise<unknown> }).ltp = ltp;
    const activity = new ActivityLog();
    activity.push({ t: t - 1000, level: 'warn', msg: 'something happened' });
    let reloads = 0;
    const app = buildApp({
      appSecret: 'x'.repeat(24), apiKey: 'K', apiSecret: 'S', tokens, kite, getInstruments: () => undefined, reloadInstruments: async () => { reloads++; },
      logger: createLogger('silent'), now: () => t, activity, info: { version: '1.2.3', startedAt: t - 90_000, host: '127.0.0.1', port: 4000, dataDir: '/data' },
      feed: { status: () => ({ state: 'connected', subscribed: 4, watched: 4, ticksSeen: 10, lastTickAt: t - 500, connectedAt: t - 60_000, reconnects: 0 }), watch: () => undefined, candles: () => undefined },
      scan: { defaultDay: () => '2026-11-20', state: () => ({ running: false, done: 226, total: 226, finishedAt: t - 5000, items: { A: {}, B: {} } }), start: () => ({}), stop: () => undefined },
    });
    return { app, reloads: () => reloads };
  };

  it('summarises the process, the Kite token, the feed, the scan and the recent activity, behind the secret', async () => {
    const { app } = mk(async () => ({}));
    expect((await app.inject('/system')).statusCode).toBe(401);
    const j = (await app.inject({ url: '/system', headers: auth })).json();
    expect(j.app).toMatchObject({ version: '1.2.3', uptimeSec: 90, port: 4000, frontendServed: false });
    expect(j.kite).toMatchObject({ configured: true, token: 'valid', userId: 'AB1234' });
    expect(j.feed).toMatchObject({ state: 'connected', subscribed: 4 });
    expect(j.scan).toMatchObject({ day: '2026-11-20', done: 226, names: 2, running: false });
    expect(j.activity[0].msg).toBe('something happened');
    expect(JSON.stringify(j)).not.toContain('TOK"'); // the access token is never in the summary
  });

  it('tests the Kite connection and reports failures as data, and reloads instruments', async () => {
    const ok = mk(async () => ({ 'NSE:NIFTY 50': { last_price: 25800.6 } }));
    const r = (await ok.app.inject({ method: 'POST', url: '/system/test-kite', headers: auth })).json();
    expect(r).toMatchObject({ ok: true, ltp: 25800.6 });
    const bad = mk(async () => { throw new Error('Kite rejected the token'); });
    const f = (await bad.app.inject({ method: 'POST', url: '/system/test-kite', headers: auth })).json();
    expect(f).toMatchObject({ ok: false, error: 'Kite rejected the token' });
    const rl = (await ok.app.inject({ method: 'POST', url: '/system/reload-instruments', headers: auth })).json();
    expect(ok.reloads()).toBe(1);
    expect(rl.ok).toBe(false); // no instruments in this fake setup: reported honestly
  });
});
