import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, parseDotEnv } from '../src/config/index.js';
import { isAuthorized } from '../src/auth/appAuth.js';
import { checksum, lastTokenCutoff, tokenState, KiteTokenStore, exchangeRequestToken, KiteLoginError } from '../src/auth/kiteAuth.js';
import { FileStore } from '../src/store/fileStore.js';
import { RateLimiter } from '../src/kite/rateLimiter.js';
import { TtlCache } from '../src/kite/cache.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'groot-'));
const IST = (iso: string) => Date.parse(iso + '+05:30');

describe('config', () => {
  it('parses a .env file and lets real env win', () => {
    expect(parseDotEnv('# c\nA=1\nB="two"\nC=\'3\'\n')).toEqual({ A: '1', B: 'two', C: '3' });
    const dir = tmp();
    const f = join(dir, '.env');
    writeFileSync(f, 'APP_SECRET=a-secret-that-is-long-enough-1\nPORT=5000\n');
    const c = loadConfig({ PORT: '6000' } as NodeJS.ProcessEnv, f);
    expect(c.PORT).toBe(6000);
    expect(c.APP_SECRET).toBe('a-secret-that-is-long-enough-1');
  });
  it('rejects a short secret', () => {
    expect(() => loadConfig({ APP_SECRET: 'short' } as NodeJS.ProcessEnv, '/nonexistent/.env')).toThrow(/APP_SECRET/);
  });
});

describe('app auth', () => {
  it('accepts only the right bearer secret', () => {
    expect(isAuthorized('Bearer s3cret', 's3cret')).toBe(true);
    expect(isAuthorized('Bearer nope', 's3cret')).toBe(false);
    expect(isAuthorized(undefined, 's3cret')).toBe(false);
    expect(isAuthorized('s3cret', 's3cret')).toBe(false);
    expect(isAuthorized('Bearer ', 's3cret')).toBe(false);
  });
});

describe('kite auth', () => {
  it('computes the sha256 checksum of key + request token + secret', () => {
    // sha256("abc") = ba7816bf...; here key="a", token="b", secret="c"
    expect(checksum('a', 'b', 'c')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('treats a token as expired after 06:00 IST', () => {
    const saved = IST('2026-11-20T09:20:00');
    const rec = { accessToken: 't', userId: 'u', savedAt: saved };
    expect(tokenState(rec, IST('2026-11-20T15:00:00'))).toBe('valid');
    expect(tokenState(rec, IST('2026-11-21T05:59:00'))).toBe('valid');
    expect(tokenState(rec, IST('2026-11-21T06:01:00'))).toBe('expired');
    expect(tokenState(undefined, saved)).toBe('missing');
  });
  it('cutoff is the latest 06:00 IST not after now', () => {
    expect(lastTokenCutoff(IST('2026-11-21T05:00:00'))).toBe(IST('2026-11-20T06:00:00'));
    expect(lastTokenCutoff(IST('2026-11-21T06:00:00'))).toBe(IST('2026-11-21T06:00:00'));
  });
  it('stores and returns a valid token only', () => {
    let t = IST('2026-11-20T09:00:00');
    const ts = new KiteTokenStore(new FileStore(tmp()), () => t);
    expect(ts.state()).toBe('missing');
    ts.save('abc', 'AB1234');
    expect(ts.validToken()).toBe('abc');
    t = IST('2026-11-21T07:00:00');
    expect(ts.validToken()).toBeUndefined();
    expect(ts.state()).toBe('expired');
  });
  it('exchanges a request token and reports a refusal clearly', async () => {
    let body = '';
    const ok = await exchangeRequestToken('k', 's', 'rt', async (_u, init) => {
      body = init?.body ?? '';
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'success', data: { access_token: 'AT', user_id: 'U1' } }) };
    });
    expect(ok).toEqual({ accessToken: 'AT', userId: 'U1' });
    expect(body).toContain('checksum=' + checksum('k', 'rt', 's'));
    await expect(
      exchangeRequestToken('k', 's', 'bad', async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ status: 'error', error_type: 'TokenException', message: 'Invalid checksum' }) })),
    ).rejects.toThrow(KiteLoginError);
  });
});

describe('file store', () => {
  it('round-trips, replaces atomically and rejects bad keys', () => {
    const dir = tmp();
    const s = new FileStore(dir);
    s.set('a.b', { x: 1 });
    expect(new FileStore(dir).get('a.b')).toEqual({ x: 1 });
    s.set('a.b', { x: 2 });
    expect(new FileStore(dir).get('a.b')).toEqual({ x: 2 });
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(() => s.set('../evil', 1)).toThrow();
    s.delete('a.b');
    expect(new FileStore(dir).get('a.b')).toBeUndefined();
  });
});

describe('rate limiter', () => {
  it('spaces calls in one bucket and leaves other buckets alone', async () => {
    let now = 0;
    const clock = { now: () => now, sleep: async (ms: number) => { now += ms; } };
    const rl = new RateLimiter({ history: 350, quote: 1000, default: 100 }, clock);
    const starts: number[] = [];
    await Promise.all([1, 2, 3].map(() => rl.schedule('history', async () => { starts.push(now); })));
    expect(starts).toEqual([0, 350, 700]);
    const q: number[] = [];
    await rl.schedule('quote', async () => { q.push(now); });
    expect(q[0]).toBe(700); // the quote bucket had no earlier call, so it was not delayed by history
  });
  it('keeps running after a failed call', async () => {
    const clock = { now: () => 0, sleep: async () => undefined };
    const rl = new RateLimiter({ history: 0, quote: 0, default: 0 }, clock);
    await expect(rl.schedule('default', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(rl.schedule('default', async () => 7)).resolves.toBe(7);
  });
});

describe('ttl cache', () => {
  it('shares one in-flight load and expires', async () => {
    let t = 0;
    let calls = 0;
    const c = new TtlCache(() => t);
    const load = async () => { calls++; return calls; };
    const [a, b] = await Promise.all([c.getOrLoad('k', 1000, load), c.getOrLoad('k', 1000, load)]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
    t = 500;
    expect(await c.getOrLoad('k', 1000, load)).toBe(1);
    t = 1500;
    expect(await c.getOrLoad('k', 1000, load)).toBe(2);
  });
});
