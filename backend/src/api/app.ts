import Fastify, { type FastifyInstance } from 'fastify';
import type { McxCalcService } from '../marketdata/mcxCalc.js';
import { expiryOverview } from '../marketdata/expiries.js';
import type { DigestKind, DigestService } from '../marketdata/digest.js';
import type { SessionService } from '../marketdata/session.js';
import type { LivePulse } from '../marketdata/livePulse.js';
import type { LiveEngine } from '../marketdata/liveEngine.js';
import type { NewsService } from '../marketdata/news.js';
import type { LearnService } from '../marketdata/learn.js';
import type { Logger } from '../logger.js';
import { isAuthorized } from '../auth/appAuth.js';
import { exchangeRequestToken, KiteLoginError, loginUrl, type FetchLike, type KiteTokenStore } from '../auth/kiteAuth.js';
import { KiteApiError, KiteNotConfiguredError, KiteTokenError, type KiteClient } from '../kite/client.js';
import type { InstrumentBook } from '../instruments/book.js';
import type { Candle } from '../kite/client.js';
import type { TickHub } from '../marketdata/hub.js';
import { SlidingLimiter } from './limits.js';
import { previousTradingDay } from '../marketdata/history.js';
import type { ActivityLog } from '../system/activity.js';
import { staticHandler } from './static.js';

export interface FeedControl {
  status(): { state: string; subscribed: number; watched: number; ticksSeen: number; lastTickAt: number | null; connectedAt: number | null; reconnects: number };
  watch(tokens: { token: number; hasOi: boolean }[]): void;
  candles(token: number): Candle[] | undefined;
}

export interface ScanControl {
  defaultDay(): string;
  state(day: string): unknown;
  start(day: string, force: boolean): unknown;
  stop(): void;
}

export interface ChainControl {
  load(req: { name: string; day: string; asOf?: string; expiry?: string; anchor?: 'ltp' | 'open'; strikesToShow?: number }): Promise<unknown>;
}

export interface FuturesControl {
  load(req: { name: string; day: string; asOf?: string }): Promise<unknown>;
}

export interface OiControl {
  analyse(req: { name: string; day: string; asOf?: string; expiry?: string; anchor?: 'ltp' | 'open'; strikesToShow?: number }): Promise<unknown>;
}

export interface SystemInfo {
  version: string;
  startedAt: number;
  host: string;
  port: number;
  dataDir: string;
}

export interface ScoreControl {
  load(req: { name: string; day: string; asOf?: string }): Promise<unknown>;
}

export interface ConsensusControl {
  load(req: { name: string; day: string; asOf?: string }): Promise<unknown>;
}

export interface LevelProbControl {
  load(req: { name: string; day: string; asOf?: string }): Promise<unknown>;
}

export interface VerdictControl {
  load(req: { name: string; day: string; asOf?: string }): Promise<unknown>;
}

export interface MarketControl {
  load(req: { day: string; asOf?: string }): Promise<unknown>;
}

export interface DecisionControl {
  levelDecision(req: { name: string; day: string; asOf?: string }): Promise<unknown>;
  finalVerdict(req: { name: string; day: string; asOf?: string }): Promise<unknown>;
}

export interface OutlookControl {
  levels(req: { name: string; day: string; asOf?: string }): Promise<unknown>;
  plan(req: { name: string; day: string; asOf?: string }, forceDir?: number): Promise<unknown>;
}

export interface LiveContextControl {
  read(req: { name: string; day: string; asOf?: string }, forcedDir?: number | null): Promise<unknown>;
}

export interface StrengthControl {
  load(req: { day: string; asOf?: string }): Promise<unknown>;
}

export interface MacroControl {
  load(day?: string): Promise<unknown>;
  saveManual(text: string, replace?: boolean): { kept: number; bad: number; total: number };
}

export interface FearGreedControl {
  load(req: { day: string; asOf?: string }): Promise<unknown>;
}

export interface WeightedOiControl {
  load(req: { day: string; asOf?: string }, sort?: 'impact' | 'weight'): Promise<unknown>;
}

export interface SqueezeControl {
  load(req: { name: string; day: string; asOf?: string }): Promise<unknown>;
}

export interface CurveControl {
  load(req: { name: string; day: string; asOf?: string }): Promise<unknown>;
}

export interface PositionalControl {
  get(): unknown;
  names(scope: 'dashboard' | 'all' | 'nifty50' | 'banknifty' | 'mcx' | string[]): string[];
  start(req: { day: string; asOf?: string; names: string[]; fresh?: boolean }): unknown;
  cancel(): void;
}

export interface OrderFlowControl {
  read(name: string, day: string): unknown;
}

export interface ProgressControl {
  active(): unknown;
}

export interface RefreshControl {
  run(): { at: number; cleared: string[]; failed: string[] };
  lastAt: number | null;
}

export interface CommodityControl {
  names(): string[];
  levels(req: { name: string; day: string; asOf?: string }): Promise<unknown>;
  global(req: { name: string; day: string; asOf?: string }): Promise<unknown>;
}

export interface SettingsControl {
  view(): unknown;
  warnings(): unknown;
  update(patch: Record<string, unknown>): { ok: boolean; errors: Record<string, string>; saved: string[] };
  reset(keys: string[]): string[];
}

export interface SignalControl {
  load(req: { name: string; day: string; asOf?: string }, strategy?: never): Promise<unknown>;
}

export interface PredictControl {
  load(req: { day: string; asOf?: string }): Promise<unknown>;
}

export interface ComboControl {
  table(lookback?: number): Promise<unknown>;
  rows(lookback?: number): Promise<unknown>;
}

export interface AppDeps {
  appSecret: string;
  apiKey: string;
  apiSecret: string;
  tokens: KiteTokenStore;
  kite: KiteClient;
  getInstruments: () => InstrumentBook | undefined;
  reloadInstruments: () => Promise<void>;
  /** live feed: ticker state, watched tokens and the candles built from ticks */
  feed?: FeedControl;
  /** the 9:15 scan */
  scan?: ScanControl;
  /** option chain loader (OI / OBV / IV per strike) */
  chains?: ChainControl;
  /** futures remark */
  futures?: FuturesControl;
  /** OI / OBV scoring of a chain */
  oi?: OiControl;
  /** instrument score (the six parts and their total) */
  score?: ScoreControl;
  /** Master Consensus */
  consensus?: ConsensusControl;
  /** Level Probability */
  levelProb?: LevelProbControl;
  /** the wall verdict */
  verdict?: VerdictControl;
  /** market-wide score and signal */
  market?: MarketControl;
  /** Level Decision and Final Verdict */
  decisions?: DecisionControl;
  /** strong support / resistance and the probable trade */
  outlook?: OutlookControl;
  /** Live Context: is the morning view still valid */
  liveContext?: LiveContextControl;
  /** strongest and weakest index */
  strength?: StrengthControl;
  /** signal agreement and entry timing */
  signals?: SignalControl;
  /** Macro backdrop (oil, yields, rupee, dollar) */
  macro?: MacroControl;
  /** saved settings */
  settings?: SettingsControl;
  /** commodities (MCX) */
  commodity?: CommodityControl;
  /** on-demand refresh */
  refresher?: RefreshControl;
  /** what the backend is busy with */
  progress?: ProgressControl;
  /** live order flow */
  orderFlow?: OrderFlowControl;
  /** the Data page: what is kept on disk and clearing each kind */
  dataAdmin?: { inventory(): unknown; clear(what: 'instruments' | 'candles' | 'saved' | 'weights'): Promise<{ removed: number }> };
  watchlist?: { get(): unknown; save(g: unknown): unknown; reset(): void };
  /** strike steps per name and where they came from */
  stepsInfo?: () => { map: Record<string, unknown>; source: string | null };
  weightsInfo?: () => { asOf: string | null; error: string | null; nifty50: string[]; bank: string[]; full: Record<string, Record<string, number>> } | null;
  /** the NSE trading-holiday list and the last refresh problem, for the System page */
  holidayList?: () => { list: { date: string; desc: string }[]; error: string | null };
  /** positional (swing) screener */
  positional?: PositionalControl;
  /** futures contract curve */
  curve?: CurveControl;
  /** short covering / long unwinding */
  squeeze?: SqueezeControl;
  /** Trade Focus: the five gates of a name */
  /** squeeze alerts raised so far */
  /** option strike search */
  strikes?: { strategies(): unknown[]; load(r: { name: string; day: string; asOf?: string }, strategy?: never, o?: { offset?: number; wing?: number }): Promise<unknown> };
  /** market-wide dashboard numbers */
  /** the left panel of the old dashboard */
  /** cross-instrument boards */
  /** funds and the day's P&L (read-only) */
  /** Trade Focus calls of many names (the Chart View board) */
  /** the instrument score after each slot of the day */
  scoreSeries?: { load(r: { name: string; day: string; asOf?: string }): Promise<unknown> };
  marks?: { load(names: string[], r: { day: string; asOf?: string }): Promise<unknown> };
  /** futures remark after each 5-minute candle */
  futSeries?: { remarks(r: { name: string; day: string; asOf?: string }): Promise<unknown> };
  account?: { load(): Promise<unknown> };
  boards?: { load(r: { day: string; asOf?: string }): Promise<unknown> };
  panel?: { load(r: { day: string; asOf?: string }): Promise<unknown> };
  overview?: { load(r: { day: string; asOf?: string }): Promise<unknown> };
  alerts?: { since(id?: number): unknown[] };
  tracking?: { names(): string[]; add(n: string): string[]; remove(n: string): string[]; view(): Promise<unknown[]> };
  focus?: { load(r: { name: string; day: string; asOf?: string }): Promise<unknown> };
  /** weighted constituents OI table */
  weightedOi?: WeightedOiControl;
  /** Fear & Greed */
  fearGreed?: FearGreedControl;
  learn?: LearnService;
  news?: NewsService;
  engine?: LiveEngine;
  pulse?: LivePulse;
  session?: SessionService;
  digest?: DigestService;
  mcxCalc?: McxCalcService;
  positionsSvc?: { load(): Promise<unknown> };
  heatmap?: () => unknown;
  gapStats?: () => unknown;
  /** the expiry chosen in Settings for an underlying (blank = nearest) */
  expiryPref?: (underlying: string, mcx: boolean) => string | undefined;
  /** Predict (9:15 combo) */
  predict?: PredictControl;
  /** the 9:15 combo backtest */
  combo?: ComboControl;
  defaultDay?: () => string;
  /** the default day of the commodity routes (the MCX day) */
  mcxDefaultDay?: () => string;
  /** live tick fan-out for /stream */
  hub?: TickHub;
  /** recent log lines and facts about this process, for the System screen */
  activity?: ActivityLog;
  info?: SystemInfo;
  /** directory of the built frontend; when set (and built) the app is served from / */
  staticDir?: string;
  /** name -> token of the app's universe (indices + F&O stocks) */
  universe?: () => Record<string, number>;
  logger: Logger;
  fetchImpl?: FetchLike;
  now?: () => number;
}

const PUBLIC = new Set(['/health/ping', '/auth/kite/start', '/auth/kite/callback']);
/** Paths that belong to the API. Everything else is the frontend (static files and client-side routes), which is public: it holds no data. */
const API_PREFIXES = ['/settings', '/commodity', '/commodities', '/refresh', '/progress', '/orderflow', '/positional', '/curve', '/scoreseries', '/data', '/watchlist', '/tracking', '/marks', '/account', '/boards', '/panel', '/overview', '/strikes', '/alerts', '/focus', '/squeeze', '/weightedoi', '/feargreed', '/learn', '/news', '/engine', '/session', '/digest', '/mcxcalc', '/positions', '/heatmap', '/macro', '/predict', '/combo915', '/signals', '/strength', '/livecontext', '/levels', '/outlook', '/leveldecision', '/finalverdict', '/market', '/verdict', '/levelprob', '/consensus', '/score', '/system', '/oi', '/futures', '/health', '/auth', '/instruments', '/kite', '/feed', '/live', '/scan915', '/chain', '/universe', '/stream'];
const isApiPath = (p: string): boolean => API_PREFIXES.some((x) => p === x || p.startsWith(x + '/'));

/** Builds the HTTP API. Read-only: there is no route that places or changes an order. */
export function buildApp(d: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 1_000_000 });
  const now = d.now ?? Date.now;

  // brute-force protection for the app secret and a generous request ceiling, both per client address
  const authFails = new SlidingLimiter(10, 60_000, now);
  const requests = new SlidingLimiter(600, 60_000, now);

  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    if (!isApiPath(path) || PUBLIC.has(path)) return;
    const ip = req.ip;
    if (authFails.blocked(ip)) return reply.code(429).header('Retry-After', '60').send({ error: 'too_many_attempts', message: 'Too many wrong secrets. Try again in a minute.' });
    if (!isAuthorized(req.headers.authorization, d.appSecret)) {
      authFails.hit(ip);
      return reply.code(401).send({ error: 'unauthorized' });
    }
    if (!requests.hit(ip)) return reply.code(429).header('Retry-After', '30').send({ error: 'rate_limited' });
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer').header('X-Frame-Options', 'DENY').header('Cross-Origin-Resource-Policy', 'same-origin');
    return payload;
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof KiteTokenError) return reply.code(401).send({ error: 'kite_token', message: err.message });
    if (err instanceof KiteNotConfiguredError) return reply.code(503).send({ error: 'kite_not_configured', message: err.message });
    if (err instanceof KiteApiError) return reply.code(502).send({ error: 'kite_api', type: err.errorType, message: err.message });
    d.logger.error({ err: { message: err.message, stack: String(err.stack ?? '').split(String.fromCharCode(10)).slice(0, 4).join(' | ') } }, 'unhandled error');
    // the app is private and every route is behind the secret: say what went wrong instead of a bare "internal", so a card can show the real reason
    return reply.code(500).send({ error: 'internal', message: String(err.message).slice(0, 240) });
  });

  app.get('/health/ping', async () => ({ ok: true }));

  app.get('/health', async () => {
    const rec = d.tokens.get();
    const book = d.getInstruments();
    const state = d.tokens.state();
    const problems: string[] = [];
    if (!d.apiKey) problems.push('KITE_API_KEY is not set');
    if (state !== 'valid') problems.push(state === 'missing' ? 'no Kite token: log in (GET /auth/kite/login)' : 'Kite token expired: log in again (GET /auth/kite/login)');
    if (state === 'valid' && !book) problems.push('instruments not loaded yet');
    return {
      status: problems.length ? 'degraded' : 'ok',
      problems,
      time: new Date(now()).toISOString(),
      kite: {
        configured: Boolean(d.apiKey && d.apiSecret),
        token: state,
        userId: rec?.userId ?? null,
        tokenAgeMinutes: rec ? Math.round((now() - rec.savedAt) / 60000) : null,
      },
      instruments: { loaded: Boolean(book), count: book?.size ?? 0, day: book?.day ?? null },
      feed: d.feed ? d.feed.status() : { state: 'not_started' },
    };
  });

  app.get('/auth/kite/login', async () => {
    if (!d.apiKey) throw new KiteNotConfiguredError('KITE_API_KEY is not set');
    return { url: loginUrl(d.apiKey), note: 'Open the url, log in, and Kite redirects to /auth/kite/callback.' };
  });

  // Browser-friendly start of the daily login: redirects to Kite's login page (the page only carries the public API key).
  app.get('/auth/kite/start', async (_req, reply) => {
    if (!d.apiKey) return reply.code(503).type('text/html').send('<p>KITE_API_KEY is not set on the server.</p>');
    return reply.redirect(loginUrl(d.apiKey), 302);
  });

  // Kite redirects the browser here with ?request_token=...&status=success. The token alone is useless without the API secret.
  app.get('/auth/kite/callback', async (req, reply) => {
    const q = req.query as { request_token?: string; status?: string; action?: string };
    reply.type('text/html');
    if (q.status !== 'success' || !q.request_token) return reply.code(400).send('<p>Kite login was not completed. Try again from /auth/kite/login.</p>');
    if (!d.apiKey || !d.apiSecret) return reply.code(503).send('<p>KITE_API_KEY and KITE_API_SECRET must be set on the server.</p>');
    try {
      const r = await exchangeRequestToken(d.apiKey, d.apiSecret, q.request_token, d.fetchImpl);
      d.tokens.save(r.accessToken, r.userId);
      d.logger.info({ userId: r.userId }, 'kite token saved');
      d.reloadInstruments().catch((e: Error) => d.logger.warn({ err: { message: e.message } }, 'instruments reload failed'));
      return reply.send('<p>Kite login done. You can close this tab.</p>');
    } catch (e) {
      const msg = e instanceof KiteLoginError ? e.message : 'unexpected error';
      d.logger.warn({ err: { message: msg } }, 'kite login failed');
      return reply.code(502).send(`<p>${msg.replace(/</g, '&lt;')}</p>`);
    }
  });

  app.get('/instruments/lookup', async (req, reply) => {
    const q = req.query as { exchange?: string; symbol?: string };
    const book = d.getInstruments();
    if (!book) return reply.code(503).send({ error: 'instruments_not_loaded' });
    if (!q.exchange || !q.symbol) return reply.code(400).send({ error: 'exchange and symbol are required' });
    const row = book.symbol(q.exchange, q.symbol);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return row;
  });

  app.get('/kite/ltp', async (req, reply) => {
    const q = req.query as { i?: string | string[] };
    const list = (Array.isArray(q.i) ? q.i : q.i ? [q.i] : []).slice(0, 100);
    if (!list.length) return reply.code(400).send({ error: 'pass one or more i=EXCHANGE:SYMBOL' });
    return d.kite.ltp(list);
  });

  app.get('/kite/quote', async (req, reply) => {
    const q = req.query as { i?: string | string[] };
    const list = (Array.isArray(q.i) ? q.i : q.i ? [q.i] : []).flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean).slice(0, 100);
    if (!list.length) return reply.code(400).send({ error: 'pass one or more i=EXCHANGE:SYMBOL' });
    return d.kite.quote(list);
  });

  app.get('/universe', async () => ({ names: d.universe ? d.universe() : {} }));

  app.get('/kite/history', async (req, reply) => {
    const q = req.query as { token?: string; interval?: string; from?: string; to?: string; oi?: string };
    const token = Number(q.token);
    const ok = ['minute', '3minute', '5minute', '10minute', '15minute', '30minute', '60minute', 'day'];
    if (!Number.isInteger(token) || !q.interval || !ok.includes(q.interval) || !q.from || !q.to) {
      return reply.code(400).send({ error: 'token, interval, from and to are required' });
    }
    const candles = await d.kite.historical(token, q.interval as never, q.from, q.to, q.oi === '1');
    return { candles };
  });

  app.get('/feed/status', async () => (d.feed ? d.feed.status() : { state: 'not_started' }));

  // Start building live 5-minute candles for these tokens (and subscribe them on the ticker). Body: {"tokens":[{"token":256265,"hasOi":false}]}
  app.post('/feed/watch', async (req, reply) => {
    if (!d.feed) return reply.code(503).send({ error: 'feed_not_available' });
    const body = req.body as { tokens?: { token?: number; hasOi?: boolean }[] } | undefined;
    const list = (body?.tokens ?? []).filter((t) => Number.isInteger(t.token)).slice(0, 500).map((t) => ({ token: t.token as number, hasOi: Boolean(t.hasOi) }));
    if (!list.length) return reply.code(400).send({ error: 'tokens: [{token, hasOi}] is required' });
    d.feed.watch(list);
    return { watching: list.length };
  });

  app.get('/live/candles', async (req, reply) => {
    const token = Number((req.query as { token?: string }).token);
    if (!Number.isInteger(token)) return reply.code(400).send({ error: 'token is required' });
    const c = d.feed?.candles(token);
    if (!c) return reply.code(404).send({ error: 'not_watched', message: 'POST /feed/watch for this token first' });
    return { candles: c };
  });

  const dayOk = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

  app.get('/scan915', async (req, reply) => {
    if (!d.scan) return reply.code(503).send({ error: 'scan_not_available' });
    const q = (req.query as { day?: string }).day;
    const day = dayOk(q) ? q : d.scan.defaultDay();
    return { defaultDay: d.scan.defaultDay(), ...(d.scan.state(day) as object) };
  });

  app.post('/scan915/run', async (req, reply) => {
    if (!d.scan) return reply.code(503).send({ error: 'scan_not_available' });
    const b = (req.body ?? {}) as { day?: string; force?: boolean };
    const day = dayOk(b.day) ? b.day : d.scan.defaultDay();
    return { defaultDay: d.scan.defaultDay(), ...(d.scan.start(day, Boolean(b.force)) as object) };
  });

  app.post('/scan915/stop', async (_req, reply) => {
    if (!d.scan) return reply.code(503).send({ error: 'scan_not_available' });
    d.scan.stop();
    return { ok: true };
  });

  app.get('/futures', async (req, reply) => {
    if (!d.futures) return reply.code(503).send({ error: 'futures_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    return d.futures.load({ name: q.name, day, asOf });
  });

  app.get('/oi', async (req, reply) => {
    if (!d.oi) return reply.code(503).send({ error: 'oi_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string; expiry?: string; anchor?: string; strikes?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    const n = q.strikes ? Number(q.strikes) : undefined;
    return d.oi.analyse({ name: q.name, day, asOf, expiry: dayOk(q.expiry) ? q.expiry : undefined, anchor: q.anchor === 'open' ? 'open' : 'ltp', strikesToShow: n !== undefined && Number.isInteger(n) && n >= 0 && n <= 10 ? n : undefined });
  });

  app.get('/system', async () => {
    const rec = d.tokens.get();
    const book = d.getInstruments();
    const defaultDay = d.defaultDay?.() ?? d.scan?.defaultDay();
    const scanState = defaultDay && d.scan ? (d.scan.state(defaultDay) as { running?: boolean; done?: number; total?: number; finishedAt?: number | null; items?: Record<string, unknown> }) : null;
    const mem = process.memoryUsage();
    return {
      app: {
        version: d.info?.version ?? '0.0.0',
        node: process.version,
        startedAt: d.info?.startedAt ?? null,
        uptimeSec: d.info ? Math.round((now() - d.info.startedAt) / 1000) : null,
        host: d.info?.host ?? null,
        port: d.info?.port ?? null,
        dataDir: d.info?.dataDir ?? null,
        memoryMb: Math.round(mem.rss / 1048576),
        frontendServed: Boolean(d.staticDir),
        now: now(),
      },
      kite: {
        configured: Boolean(d.apiKey && d.apiSecret),
        token: d.tokens.state(),
        userId: rec?.userId ?? null,
        savedAt: rec?.savedAt ?? null,
      },
      feed: d.feed ? { ...d.feed.status(), clients: d.hub?.clientCount ?? 0 } : { state: 'not_started' },
      instruments: { loaded: Boolean(book), count: book?.size ?? 0, day: book?.day ?? null },
      scan: scanState ? { day: defaultDay, running: Boolean(scanState.running), done: scanState.done ?? 0, total: scanState.total ?? 0, finishedAt: scanState.finishedAt ?? null, names: Object.keys(scanState.items ?? {}).length } : null,
      dates: (() => {
        const hs = d.holidayList?.();
        const set = new Set((hs?.list ?? []).map((h) => h.date));
        const nseDay = defaultDay ?? null;
        const mcxDay = d.mcxDefaultDay?.() ?? null;
        const today = new Date(now() + 19800000).toISOString().slice(0, 10);
        return {
          today,
          nseDay,
          nsePrev: nseDay ? previousTradingDay(nseDay, set) : null,
          mcxDay,
          mcxPrev: mcxDay ? previousTradingDay(mcxDay, set, 'MCX') : null,
          holidays: hs?.list ?? [],
          holidayError: hs?.error ?? null,
          lastRefreshAt: d.refresher?.lastAt ?? null,
        };
      })(),
      activity: d.activity ? d.activity.list(80, 'info') : [],
    };
  });

  // a real read through the gateway: shows whether the token and the Kite API work right now
  app.post('/system/test-kite', async () => {
    const t0 = Date.now();
    try {
      const r = await d.kite.ltp(['NSE:NIFTY 50']);
      const px = r['NSE:NIFTY 50']?.last_price ?? null;
      return { ok: true, ms: Date.now() - t0, ltp: px };
    } catch (e) {
      return { ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
    }
  });

  app.post('/system/reload-instruments', async () => {
    const t0 = Date.now();
    try {
      await d.reloadInstruments();
      const book = d.getInstruments();
      return { ok: Boolean(book), ms: Date.now() - t0, count: book?.size ?? 0, day: book?.day ?? null };
    } catch (e) {
      return { ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
    }
  });

  app.get('/score', async (req, reply) => {
    if (!d.score) return reply.code(503).send({ error: 'score_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    return d.score.load({ name: q.name, day, asOf });
  });

  app.get('/consensus', async (req, reply) => {
    if (!d.consensus) return reply.code(503).send({ error: 'consensus_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    return d.consensus.load({ name: q.name, day, asOf });
  });

  app.get('/levelprob', async (req, reply) => {
    if (!d.levelProb) return reply.code(503).send({ error: 'levelprob_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    return d.levelProb.load({ name: q.name, day, asOf });
  });

  app.get('/verdict', async (req, reply) => {
    if (!d.verdict) return reply.code(503).send({ error: 'verdict_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    return d.verdict.load({ name: q.name, day, asOf });
  });

  app.get('/market', async (req, reply) => {
    if (!d.market) return reply.code(503).send({ error: 'market_not_available' });
    const q = req.query as { day?: string; asOf?: string };
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    return d.market.load({ day, asOf });
  });

  app.get('/leveldecision', async (req, reply) => {
    if (!d.decisions) return reply.code(503).send({ error: 'decisions_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    return d.decisions.levelDecision({ name: q.name, day, asOf });
  });

  app.get('/finalverdict', async (req, reply) => {
    if (!d.decisions) return reply.code(503).send({ error: 'decisions_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    return d.decisions.finalVerdict({ name: q.name, day, asOf });
  });

  app.get('/levels', async (req, reply) => {
    if (!d.outlook) return reply.code(503).send({ error: 'outlook_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    return (await d.outlook.levels({ name: q.name, day, asOf })) ?? { zones: [], spot: null };
  });

  app.get('/outlook', async (req, reply) => {
    if (!d.outlook) return reply.code(503).send({ error: 'outlook_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string; force?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    const force = q.force === '1' ? 1 : q.force === '-1' ? -1 : undefined;
    return d.outlook.plan({ name: q.name, day, asOf }, force);
  });

  app.get('/livecontext', async (req, reply) => {
    if (!d.liveContext) return reply.code(503).send({ error: 'livecontext_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string; dir?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    const dir = q.dir === '1' ? 1 : q.dir === '-1' ? -1 : undefined;
    return (await d.liveContext.read({ name: q.name, day, asOf }, dir)) ?? { status: 'NO DATA', reason: 'needs at least 3 five-minute candles of the day' };
  });

  app.get('/strength', async (req, reply) => {
    if (!d.strength) return reply.code(503).send({ error: 'strength_not_available' });
    const q = req.query as { day?: string; asOf?: string };
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    return d.strength.load({ day, asOf });
  });

  app.get('/settings', async (_req, reply) => {
    if (!d.settings) return reply.code(503).send({ error: 'settings_not_available' });
    return { groups: d.settings.view(), warnings: d.settings.warnings() };
  });

  app.get('/settings/warnings', async (_req, reply) => {
    if (!d.settings) return reply.code(503).send({ error: 'settings_not_available' });
    return { warnings: d.settings.warnings() };
  });

  app.patch('/settings', async (req, reply) => {
    if (!d.settings) return reply.code(503).send({ error: 'settings_not_available' });
    const b = (req.body ?? {}) as { values?: Record<string, unknown> };
    if (!b.values || typeof b.values !== 'object') return reply.code(400).send({ error: 'values is required' });
    const r = d.settings.update(b.values);
    return reply.code(r.ok ? 200 : 422).send({ ...r, groups: d.settings.view(), warnings: d.settings.warnings() });
  });

  app.post('/settings/reset', async (req, reply) => {
    if (!d.settings) return reply.code(503).send({ error: 'settings_not_available' });
    const b = (req.body ?? {}) as { keys?: unknown };
    if (!Array.isArray(b.keys)) return reply.code(400).send({ error: 'keys is required' });
    const done = d.settings.reset(b.keys.filter((k): k is string => typeof k === 'string'));
    return { reset: done, groups: d.settings.view(), warnings: d.settings.warnings() };
  });

  app.get('/commodities', async (_req, reply) => {
    if (!d.commodity) return reply.code(503).send({ error: 'commodity_not_available' });
    return { names: d.commodity.names() };
  });

  app.get('/commodity', async (req, reply) => {
    if (!d.commodity) return reply.code(503).send({ error: 'commodity_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.mcxDefaultDay?.() ?? d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    try {
      return await d.commodity.levels({ name: q.name, day, asOf });
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
  });

  app.get('/commodity/global', async (req, reply) => {
    if (!d.commodity) return reply.code(503).send({ error: 'commodity_not_available' });
    const q = req.query as { name?: string; day?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.mcxDefaultDay?.() ?? d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    try {
      return await d.commodity.global({ name: q.name, day });
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
  });

  app.get('/refresh', async (_req, reply) => {
    if (!d.refresher) return reply.code(503).send({ error: 'refresh_not_available' });
    return { lastAt: d.refresher.lastAt };
  });

  app.post('/refresh', async (_req, reply) => {
    if (!d.refresher) return reply.code(503).send({ error: 'refresh_not_available' });
    return d.refresher.run();
  });

  app.get('/progress', async (_req, reply) => {
    if (!d.progress) return reply.code(503).send({ error: 'progress_not_available' });
    return { tasks: d.progress.active() };
  });

  app.get('/orderflow', async (req, reply) => {
    if (!d.orderFlow) return reply.code(503).send({ error: 'orderflow_not_available' });
    const q = req.query as { name?: string; day?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    return d.orderFlow.read(q.name, day) ?? { name: q.name, unavailable: 'no order-book tick received yet (the name is subscribed on the first request); live sessions only' };
  });

  app.get('/positional', async (_req, reply) => {
    if (!d.positional) return reply.code(503).send({ error: 'positional_not_available' });
    return d.positional.get() ?? { state: 'never_scanned' };
  });

  app.get('/watchlist', async (_req, reply) => {
    if (!d.watchlist) return reply.code(503).send({ error: 'watchlist_not_available' });
    return d.watchlist.get();
  });
  app.put('/watchlist', async (req, reply) => {
    if (!d.watchlist) return reply.code(503).send({ error: 'watchlist_not_available' });
    try {
      return { groups: d.watchlist.save((req.body as { groups?: unknown } | null)?.groups), custom: true };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });
  app.post('/watchlist/reset', async (_req, reply) => {
    if (!d.watchlist) return reply.code(503).send({ error: 'watchlist_not_available' });
    d.watchlist.reset();
    return d.watchlist.get();
  });

  app.get('/data', async () => {
    const book = d.getInstruments();
    const st = d.stepsInfo?.();
    const w = d.weightsInfo?.();
    return {
      dataDir: d.info?.dataDir ?? null,
      inventory: d.dataAdmin?.inventory() ?? [],
      instruments: { count: book?.size ?? 0, day: book?.day ?? null },
      steps: { count: st ? Object.keys(st.map).length : 0, source: st?.source ?? null },
      weights: w ? { asOf: w.asOf, error: w.error, nifty50: w.nifty50.length, bank: w.bank.length } : null,
    };
  });

  app.get('/data/instruments', async (req, reply) => {
    const book = d.getInstruments();
    if (!book) return reply.code(503).send({ error: 'instruments_not_loaded' });
    const qq = req.query as { q?: string; kind?: string };
    const q = String(qq.q ?? '').trim().toUpperCase().slice(0, 40);
    const kind = qq.kind === 'cash' || qq.kind === 'fut' || qq.kind === 'opt' ? qq.kind : 'all';
    const kindOk = (t: string): boolean => (kind === 'all' ? true : kind === 'cash' ? t === 'EQ' || t === '' : kind === 'fut' ? t === 'FUT' : t === 'CE' || t === 'PE');
    const base = book.rows.filter((r) => kindOk(r.type));
    const rows = q ? base.filter((r) => r.symbol.toUpperCase().includes(q) || r.name.toUpperCase().includes(q)).sort((x, y) => (x.symbol.toUpperCase() === q ? -1 : 0) - (y.symbol.toUpperCase() === q ? -1 : 0)) : base;
    return { total: rows.length, rows: rows.slice(0, 200).map((r) => ({ symbol: r.symbol, name: r.name, exchange: r.exchange, type: r.type, expiry: r.expiry, strike: r.strike, lot: r.lotSize, token: r.token })) };
  });

  app.get('/data/expiries', async (req, reply) => {
    const book = d.getInstruments();
    if (!book) return reply.code(503).send({ error: 'instruments_not_loaded' });
    const name = String((req.query as { name?: string }).name ?? '').slice(0, 30);
    const today = new Date(now() + 19800000).toISOString().slice(0, 10);
    return expiryOverview(book, {
      today,
      nseDay: d.defaultDay?.() ?? d.scan?.defaultDay() ?? today,
      mcxDay: d.mcxDefaultDay?.() ?? today,
      mcxNames: d.commodity?.names() ?? [],
      pref: d.expiryPref ?? (() => undefined),
      name: name || undefined,
    });
  });

  app.get('/data/steps', async (req) => {
    const q = String((req.query as { q?: string }).q ?? '').trim().toUpperCase().slice(0, 40);
    const st = d.stepsInfo?.();
    const rows = Object.entries(st?.map ?? {}).filter(([n]) => !q || n.toUpperCase().includes(q)).slice(0, 400).map(([name, v]) => ({ name, steps: v }));
    return { source: st?.source ?? null, total: Object.keys(st?.map ?? {}).length, rows };
  });

  app.get('/data/weights', async () => d.weightsInfo?.() ?? null);

  app.post('/data/clear', async (req, reply) => {
    if (!d.dataAdmin) return reply.code(503).send({ error: 'data_admin_not_available' });
    const what = String((req.body as { what?: string } | null)?.what ?? '');
    if (!['instruments', 'candles', 'saved', 'weights'].includes(what)) return reply.code(400).send({ error: 'what must be instruments, candles, saved or weights' });
    try {
      return { ok: true, ...(await d.dataAdmin.clear(what as 'instruments')) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  app.get('/positional/names', async (_req, reply) => {
    if (!d.positional) return reply.code(503).send({ error: 'positional_not_available' });
    return { names: d.positional.names('dashboard') };
  });

  app.post('/positional/scan', async (req, reply) => {
    if (!d.positional) return reply.code(503).send({ error: 'positional_not_available' });
    const b = (req.body ?? {}) as { scope?: string; names?: unknown; day?: string; asOf?: string; fresh?: boolean };
    const day = dayOk(b.day) ? b.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = b.asOf && /^\d{2}:\d{2}$/.test(b.asOf) ? b.asOf : undefined;
    const names = Array.isArray(b.names) ? b.names.filter((n): n is string => typeof n === 'string' && n.length < 40).slice(0, 400) : d.positional.names(b.scope === 'all' || b.scope === 'nifty50' || b.scope === 'banknifty' || b.scope === 'mcx' ? b.scope : 'dashboard');
    return d.positional.start({ day, asOf, names, fresh: !!b.fresh });
  });

  app.post('/positional/stop', async (_req, reply) => {
    if (!d.positional) return reply.code(503).send({ error: 'positional_not_available' });
    d.positional.cancel();
    return { ok: true };
  });

  app.get('/curve', async (req, reply) => {
    if (!d.curve) return reply.code(503).send({ error: 'curve_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    return (await d.curve.load({ name: q.name, day, asOf })) ?? { name: q.name, day, unavailable: 'fewer than two listed contracts traded that day' };
  });

  app.get('/scoreseries', async (req, reply) => {
    if (!d.scoreSeries) return reply.code(503).send({ error: 'scoreseries_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const mcx = d.commodity ? d.commodity.names().includes(q.name) : false;
    const day = dayOk(q.day) ? q.day : mcx ? d.mcxDefaultDay?.() ?? d.defaultDay?.() : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    try {
      return { points: await d.scoreSeries.load({ name: q.name, day, asOf }) };
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
  });

  app.get('/marks', async (req, reply) => {
    if (!d.marks) return reply.code(503).send({ error: 'marks_not_available' });
    const q = req.query as { names?: string; day?: string; asOf?: string };
    const names = String(q.names ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12);
    if (!names.length) return reply.code(400).send({ error: 'names is required (comma separated, at most 12)' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    return { marks: await d.marks.load(names, { day, asOf }) };
  });

  app.get('/futures/series', async (req, reply) => {
    if (!d.futSeries) return reply.code(503).send({ error: 'futures_series_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const mcx = d.commodity ? d.commodity.names().includes(q.name) : false;
    const day = dayOk(q.day) ? q.day : mcx ? d.mcxDefaultDay?.() ?? d.defaultDay?.() : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    try {
      return { points: await d.futSeries.remarks({ name: q.name, day, asOf }) };
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
  });

  app.get('/account', async (_req, reply) => {
    if (!d.account) return reply.code(503).send({ error: 'account_not_available' });
    try {
      return await d.account.load();
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message });
    }
  });

  app.get('/boards', async (req, reply) => {
    if (!d.boards) return reply.code(503).send({ error: 'boards_not_available' });
    const q = req.query as { day?: string; asOf?: string };
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    try {
      return await d.boards.load({ day, asOf });
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
  });

  app.get('/panel', async (req, reply) => {
    if (!d.panel) return reply.code(503).send({ error: 'panel_not_available' });
    const q = req.query as { day?: string; asOf?: string };
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    try {
      return await d.panel.load({ day, asOf });
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
  });

  app.get('/overview', async (req, reply) => {
    if (!d.overview) return reply.code(503).send({ error: 'overview_not_available' });
    const q = req.query as { day?: string; asOf?: string };
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    try {
      return await d.overview.load({ day, asOf });
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
  });

  app.get('/strikes', async (req, reply) => {
    if (!d.strikes) return reply.code(503).send({ error: 'strikes_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string; strategy?: string; offset?: string; wing?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const mcx = d.commodity ? d.commodity.names().includes(q.name) : false;
    const day = dayOk(q.day) ? q.day : mcx ? d.mcxDefaultDay?.() ?? d.defaultDay?.() : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    try {
      const r = await d.strikes.load({ name: q.name, day, asOf }, (q.strategy || undefined) as never, { offset: Number(q.offset) || undefined, wing: Number(q.wing) || undefined });
      return { ...(r as object), strategies: d.strikes.strategies() };
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
  });

  app.get('/alerts', async (req, reply) => {
    if (!d.alerts) return reply.code(503).send({ error: 'alerts_not_available' });
    const since = Number((req.query as { since?: string }).since) || 0;
    return { alerts: d.alerts.since(since) };
  });

  app.get('/tracking', async (_req, reply) => {
    if (!d.tracking) return reply.code(503).send({ error: 'tracking_not_available' });
    return { names: d.tracking.names(), items: await d.tracking.view() };
  });
  app.post('/tracking', async (req, reply) => {
    if (!d.tracking) return reply.code(503).send({ error: 'tracking_not_available' });
    const b = (req.body ?? {}) as { name?: string; remove?: boolean };
    if (typeof b.name !== 'string') return reply.code(400).send({ error: 'name is required' });
    try {
      return { names: b.remove ? d.tracking.remove(b.name.toUpperCase()) : d.tracking.add(b.name) };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get('/focus', async (req, reply) => {
    if (!d.focus) return reply.code(503).send({ error: 'focus_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string };
    const name = q.name || 'NIFTY 50';
    const mcx = d.commodity ? d.commodity.names().includes(name) : false;
    const day = dayOk(q.day) ? q.day : mcx ? d.mcxDefaultDay?.() ?? d.defaultDay?.() : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    try {
      return await d.focus.load({ name, day, asOf });
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
  });

  app.get('/squeeze', async (req, reply) => {
    if (!d.squeeze) return reply.code(503).send({ error: 'squeeze_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    try {
      return await d.squeeze.load({ name: q.name, day, asOf });
    } catch (e) {
      return reply.code(404).send({ error: (e as Error).message });
    }
  });

  app.get('/weightedoi', async (req, reply) => {
    if (!d.weightedOi) return reply.code(503).send({ error: 'weightedoi_not_available' });
    const q = req.query as { day?: string; asOf?: string; sort?: string };
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    return d.weightedOi.load({ day, asOf }, q.sort === 'weight' ? 'weight' : 'impact');
  });

  app.post('/digest/send', async (req, reply) => {
    if (!d.digest) return reply.code(503).send({ error: 'digest_not_available' });
    const b = (req.body ?? {}) as { kind?: string; preview?: boolean };
    const kinds = ['morning', 'open', 'close', 'mcxopen', 'mcxclose'];
    if (!b.kind || !kinds.includes(b.kind)) return reply.code(400).send({ error: 'kind must be one of ' + kinds.join(', ') });
    try {
      if (b.preview) return { text: await d.digest.preview(b.kind as DigestKind), sent: false };
      return await d.digest.sendNow(b.kind as DigestKind);
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message });
    }
  });
  app.get('/mcxcalc', async (_req, reply) => {
    if (!d.mcxCalc) return reply.code(503).send({ error: 'mcxcalc_not_available' });
    return d.mcxCalc.load();
  });
  app.get('/mcxcalc/gaplog', async (_req, reply) => {
    if (!d.gapStats) return reply.code(503).send({ error: 'gaplog_not_available' });
    return d.gapStats();
  });
  app.get('/positions', async (_req, reply) => {
    if (!d.positionsSvc) return reply.code(503).send({ error: 'positions_not_available' });
    return d.positionsSvc.load();
  });
  app.get('/heatmap', async (_req, reply) => {
    if (!d.heatmap) return reply.code(503).send({ error: 'heatmap_not_available' });
    return d.heatmap();
  });
  app.get('/session', async (_req, reply) => {
    if (!d.session) return reply.code(503).send({ error: 'session_not_available' });
    return d.session.state();
  });
  app.get('/engine/status', async (_req, reply) => {
    if (!d.engine) return reply.code(503).send({ error: 'engine_not_available' });
    return d.engine.status();
  });
  app.get('/engine/pulse', async () => d.pulse?.state() ?? { seq: 0, at: 0, lastMs: 0, runs: 0, failures: 0, lastError: null, running: false });
  app.get('/engine/events', async (_req, reply) => {
    if (!d.engine) return reply.code(503).send({ error: 'engine_not_available' });
    return { events: d.engine.events() };
  });
  app.get('/engine/series', async (req, reply) => {
    if (!d.engine) return reply.code(503).send({ error: 'engine_not_available' });
    const q = req.query as { group?: string; q?: string; only?: string; limit?: string };
    return d.engine.series({ group: q.group, q: q.q, only: q.only, limit: Math.min(500, Number(q.limit) || 200) });
  });
  app.post('/engine/check', async (_req, reply) => {
    if (!d.engine) return reply.code(503).send({ error: 'engine_not_available' });
    void d.engine.runCheck().catch(() => undefined);
    return { started: true };
  });
  app.post('/engine/preseed', async (_req, reply) => {
    if (!d.engine) return reply.code(503).send({ error: 'engine_not_available' });
    void d.engine.preseed().catch(() => undefined);
    return { started: true };
  });
  app.get('/engine/verify', async (req, reply) => {
    if (!d.engine) return reply.code(503).send({ error: 'engine_not_available' });
    const token = Number((req.query as { token?: string }).token);
    if (!Number.isInteger(token)) return reply.code(400).send({ error: 'token is required' });
    try { return await d.engine.verify(token); } catch (e) { return reply.code(502).send({ error: (e as Error).message }); }
  });

  app.get('/news/headlines', async (req, reply) => {
    if (!d.news) return reply.code(503).send({ error: 'news_not_available' });
    return d.news.headlines((req.query as { force?: string }).force === '1');
  });
  app.get('/news/reaction', async (req, reply) => {
    if (!d.news) return reply.code(503).send({ error: 'news_not_available' });
    return { moves: await d.news.reaction(String((req.query as { id?: string }).id ?? '')) };
  });
  app.get('/news/events', async (_req, reply) => {
    if (!d.news) return reply.code(503).send({ error: 'news_not_available' });
    return d.news.events();
  });
  app.post('/news/events', async (req, reply) => {
    if (!d.news) return reply.code(503).send({ error: 'news_not_available' });
    const b = (req.body ?? {}) as { title?: string; date?: string; time?: string; impact?: string; country?: string };
    if (!dayOk(b.date) || !/^\d{2}:\d{2}$/.test(b.time ?? '') || !['High', 'Medium', 'Low'].includes(b.impact ?? '')) return reply.code(400).send({ error: 'title, date (YYYY-MM-DD), time (HH:MM) and impact are required' });
    try { return d.news.addEvent({ title: b.title ?? '', date: b.date, time: b.time!, impact: b.impact as 'High' | 'Medium' | 'Low', country: b.country }); } catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
  });
  app.delete('/news/events', async (req, reply) => {
    if (!d.news) return reply.code(503).send({ error: 'news_not_available' });
    d.news.removeEvent(String((req.query as { id?: string }).id ?? ''));
    return { ok: true };
  });
  app.post('/news/settings', async (req, reply) => {
    if (!d.news) return reply.code(503).send({ error: 'news_not_available' });
    const b = (req.body ?? {}) as { alerts?: boolean; keywords?: string[] };
    if (typeof b.alerts === 'boolean') d.news.setAlerts(b.alerts);
    if (Array.isArray(b.keywords)) d.news.setKeywords(b.keywords.map(String));
    return { alerts: d.news.alertsOn(), keywords: d.news.keywords() };
  });

  app.get('/learn/articles', async (req, reply) => {
    if (!d.learn) return reply.code(503).send({ error: 'learn_not_available' });
    return d.learn.list((req.query as { force?: string }).force === '1');
  });

  app.get('/learn/article', async (req, reply) => {
    if (!d.learn) return reply.code(503).send({ error: 'learn_not_available' });
    const id = (req.query as { id?: string }).id ?? '';
    const a = /^[0-9a-f]{12}$/.test(id) ? d.learn.article(id) : null;
    if (!a) return reply.code(404).send({ error: 'article_not_found' });
    return a;
  });

  app.get('/feargreed', async (req, reply) => {
    if (!d.fearGreed) return reply.code(503).send({ error: 'feargreed_not_available' });
    const q = req.query as { day?: string; asOf?: string };
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    return d.fearGreed.load({ day, asOf });
  });

  app.get('/macro', async (req, reply) => {
    if (!d.macro) return reply.code(503).send({ error: 'macro_not_available' });
    const q = req.query as { day?: string };
    return d.macro.load(dayOk(q.day) ? q.day : undefined);
  });

  app.post('/macro/in10y', async (req, reply) => {
    if (!d.macro) return reply.code(503).send({ error: 'macro_not_available' });
    const b = (req.body ?? {}) as { text?: string; replace?: boolean };
    if (typeof b.text !== 'string' || b.text.length > 200000) return reply.code(400).send({ error: 'text is required' });
    return d.macro.saveManual(b.text, !!b.replace);
  });

  app.get('/signals', async (req, reply) => {
    if (!d.signals) return reply.code(503).send({ error: 'signals_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string; strategy?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    return d.signals.load({ name: q.name, day, asOf }, q.strategy as never);
  });

  app.get('/predict', async (req, reply) => {
    if (!d.predict) return reply.code(503).send({ error: 'predict_not_available' });
    const q = req.query as { day?: string; asOf?: string };
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    return d.predict.load({ day, asOf });
  });

  /** the 9:15 combo backtest: the per-combo table, or the day-wise rows with rows=1 */
  app.get('/combo915', async (req, reply) => {
    if (!d.combo) return reply.code(503).send({ error: 'combo_not_available' });
    const q = req.query as { rows?: string; lookback?: string };
    const lb = q.lookback ? Number(q.lookback) : undefined;
    const lookback = lb !== undefined && Number.isInteger(lb) && lb >= 5 && lb <= 400 ? lb : undefined;
    return q.rows === '1' ? d.combo.rows(lookback) : d.combo.table(lookback);
  });

  app.get('/chain', async (req, reply) => {
    if (!d.chains) return reply.code(503).send({ error: 'chain_not_available' });
    const q = req.query as { name?: string; day?: string; asOf?: string; expiry?: string; anchor?: string; strikes?: string };
    if (!q.name) return reply.code(400).send({ error: 'name is required' });
    const day = dayOk(q.day) ? q.day : d.defaultDay?.() ?? d.scan?.defaultDay();
    if (!day) return reply.code(400).send({ error: 'day is required' });
    const asOf = q.asOf && /^\d{2}:\d{2}$/.test(q.asOf) ? q.asOf : undefined;
    const n = q.strikes ? Number(q.strikes) : undefined;
    const r = await d.chains.load({ name: q.name, day, asOf, expiry: dayOk(q.expiry) ? q.expiry : undefined, anchor: q.anchor === 'open' ? 'open' : 'ltp', strikesToShow: n !== undefined && Number.isInteger(n) && n >= 0 && n <= 10 ? n : undefined });
    return r;
  });

  // Live ticks as server-sent events. Fetched with a bearer header (EventSource cannot send one), so the client reads the stream itself.
  app.get('/stream', async (req, reply) => {
    if (!d.hub) return reply.code(503).send({ error: 'stream_not_available' });
    const q = (req.query as { tokens?: string }).tokens ?? '';
    const tokens = q.split(',').map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0).slice(0, 200);
    if (!tokens.length) return reply.code(400).send({ error: 'tokens is required (comma-separated instrument tokens)' });
    d.feed?.watch(tokens.map((token) => ({ token, hasOi: false })));
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' });
    res.write(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ tokens: tokens.length })}\n\n`);
    const remove = d.hub.add({ send: (batch) => void res.write(`event: ticks\ndata: ${JSON.stringify(batch)}\n\n`) }, tokens);
    const keep = setInterval(() => res.write(': ping\n\n'), 15_000);
    const done = (): void => {
      clearInterval(keep);
      remove();
    };
    req.raw.on('close', done);
    res.on('error', done);
    return reply;
  });

  if (d.staticDir) app.setNotFoundHandler(staticHandler(d.staticDir));

  return app;
}
