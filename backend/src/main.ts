import type { Candle } from './kite/client.js';
import { loadConfig } from './config/index.js';
import { createLogger } from './logger.js';
import { ActivityLog } from './system/activity.js';
import { readFileSync } from 'node:fs';
import { FileStore } from './store/fileStore.js';
import { KiteTokenStore } from './auth/kiteAuth.js';
import { KiteClient } from './kite/client.js';
import { buildApp } from './api/app.js';
import { loadInstruments, istDay } from './instruments/loader.js';
import type { InstrumentBook } from './instruments/book.js';
import { KiteTicker } from './kite/ticker.js';
import { LiveMarket } from './marketdata/live.js';
import { HistoryService } from './marketdata/history.js';
import { loadStrikeSteps } from './marketdata/strikeSteps.js';
import { buildUniverse } from './instruments/universe.js';
import { Scan915, defaultScanDay } from './scan915/scan.js';
import { TickHub } from './marketdata/hub.js';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { StrikeDiffMap } from './engine/levels.js';
import { OptionChainService } from './marketdata/optionChain.js';
import { FuturesService } from './marketdata/futures.js';
import { OiService } from './marketdata/oi.js';
import { ScoreService } from './marketdata/score.js';
import { ConsensusService } from './marketdata/consensus.js';
import { LevelProbService } from './marketdata/levelProb.js';
import { VerdictService } from './marketdata/verdict.js';
import { IndexWeightsService } from './marketdata/indexWeights.js';
import { MarketService } from './marketdata/market.js';
import { HolidayService } from './marketdata/holidays.js';
import { DecisionService } from './marketdata/decisions.js';
import { OutlookService } from './marketdata/outlook.js';
import { LiveContextService } from './marketdata/liveContext.js';
import { StrengthService } from './marketdata/strength.js';
import { MacroService } from './marketdata/macro.js';
import { NewsService } from './marketdata/news.js';
import { Watchdog } from './marketdata/watchdog.js';
import { DigestService, buildClose, buildMcxClose, buildMcxOpen, buildMorning, buildOpen, planOutcome, type DigestData, type IdxRow, type MarketRow, type McxRow, type PlanRow } from './marketdata/digest.js';
import { GapLog, analyseGaps } from './marketdata/gapLog.js';
import { PositionsService } from './marketdata/positions.js';
import { McxCalcService } from './marketdata/mcxCalc.js';
import { SessionService } from './marketdata/session.js';
import { LivePulse } from './marketdata/livePulse.js';
import { LiveSubs } from './marketdata/liveSubs.js';
import { LiveEngine } from './marketdata/liveEngine.js';
import { LearnService } from './marketdata/learn.js';
import { FearGreedService } from './marketdata/fearGreed.js';
import { WeightedOiService } from './marketdata/weightedOi.js';
import { SqueezeService } from './marketdata/squeeze.js';
import { CurveService } from './marketdata/curve.js';
import { PositionalService } from './marketdata/positional.js';
import { OrderFlowService } from './marketdata/orderFlow.js';
import { VolIndexService } from './marketdata/volIndex.js';
import { SettingsService } from './settings/settings.js';
import { defaultMcxDay } from './marketdata/days.js';
import { setDayRules } from './marketdata/history.js';
import { nearestFuture, setMcxFutureExpiryPref } from './marketdata/futures.js';
import { CommodityGlobalService, CommodityService, isCommodity } from './marketdata/commodity.js';
import { Progress } from './marketdata/progress.js';
import { Refresher } from './marketdata/refresh.js';
import { SignalService } from './marketdata/signals.js';
import { FocusService } from './marketdata/focus.js';
import { runBackground } from './kite/rateLimiter.js';
import { AlertService, inWindow } from './marketdata/alerts.js';
import { StrikeService } from './marketdata/strikes.js';
import { OverviewService } from './marketdata/overview.js';
import { PanelService } from './marketdata/panel.js';
import { BoardService } from './marketdata/boards.js';
import { AccountService } from './marketdata/account.js';
import { DataAdmin } from './system/dataAdmin.js';
import { Watchlist } from './marketdata/watchlist.js';
import { TrackingService, } from './marketdata/tracking.js';
import { MarksService } from './marketdata/marks.js';
import { ScoreSeriesService } from './marketdata/scoreSeries.js';
import { FutAccuracyService } from './marketdata/futAccuracy.js';
import { ComboService, PredictService, indiaVixReader } from './marketdata/combo.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const activity = new ActivityLog();
  const log = createLogger(cfg.LOG_LEVEL, activity.stream());
  let version = '0.0.0';
  try {
    version = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: string }).version ?? version;
  } catch {
    /* keep the default */
  }
  const startedAt = Date.now();
  const store = new FileStore(cfg.DATA_DIR);
  const tokens = new KiteTokenStore(store);
  const kite = new KiteClient({ apiKey: cfg.KITE_API_KEY, getAccessToken: () => tokens.validToken() });

  let book: InstrumentBook | undefined;
  let universe: Record<string, number> = {};
  let strikeDiffs: StrikeDiffMap = {};
  let stepsSource: string | null = null;
  const reloadInstruments = async (): Promise<void> => {
    if (!tokens.validToken()) return;
    book = await loadInstruments(kite, cfg.DATA_DIR);
    log.info({ count: book.size, day: book.day }, 'instruments loaded');
    try {
      const st = await loadStrikeSteps(cfg.DATA_DIR, book.day);
      strikeDiffs = st.map;
      stepsSource = st.source;
      universe = buildUniverse(book, st.symbols);
      log.info({ names: Object.keys(universe).length, steps: Object.keys(st.map).length, source: st.source }, 'universe built');
    } catch (e) {
      universe = buildUniverse(book);
      log.warn({ err: { message: (e as Error).message } }, 'strike steps not loaded: names without a known step use the 100,100 placeholder');
    }
  };
  await reloadInstruments().catch((e: Error) => log.warn({ err: { message: e.message } }, 'instruments not loaded at start'));

  // New trading day: reload the dump (a token for the day must exist by then).
  setInterval(() => {
    if (tokens.validToken() && book?.day !== istDay(Date.now())) {
      reloadInstruments().catch((e: Error) => log.warn({ err: { message: e.message } }, 'daily instruments reload failed'));
    }
  }, 10 * 60 * 1000).unref();

  let liveRef!: LiveMarket;
  const history = new HistoryService({
    kite,
    dataDir: cfg.DATA_DIR,
    live: { serve: (q) => liveRef.serve(q), prepare: (t) => liveRef.prepare(t), seed: (q, c) => liveRef.seed(q, c) },
  });
  const holidaySvc = new HolidayService(store);
  const holidays = (): ReadonlySet<string> => holidaySvc.set();
  void holidaySvc.load().then(() => (holidaySvc.error ? log.warn({ err: holidaySvc.error }, 'NSE holidays: refresh failed, using the saved list') : log.info({ n: holidaySvc.list().length }, 'NSE holidays loaded')));
  setInterval(() => void holidaySvc.load().catch(() => undefined), 6 * 3600 * 1000).unref();
  // commodities (MCX): the nearest futures contract stands for the price; their names are added to the token map the engines read (the 9:15 scan keeps the NSE universe only)
  let settings!: SettingsService;
  const volIndex = new VolIndexService({ store, manual: (k) => settings.num(k) });
  const commodity = new CommodityService({ book: () => book, history, vol: volIndex });
  // Settings: your values, kept in one file; the engines below read them on each use
  settings = new SettingsService({
    store,
    holidays,
    commodities: () => commodity.names(),
    choicesFor: (key) => {
      if (!book) return null;
      const iso = (a: string[]): string[] => [...new Set(a)].sort();
      if (key === 'nifty_expiry_date') return book.expiries('NFO', 'NIFTY');
      if (key === 'banknifty_expiry_date') return book.expiries('NFO', 'BANKNIFTY');
      if (key === 'sensex_expiry_date') return book.expiries('BFO', 'SENSEX');
      if (key === 'fo_stocks_expiry_date') return book.expiries('NFO', 'RELIANCE');
      if (key.startsWith('mcx_expiry_')) return iso(book.futures('MCX', key.slice('mcx_expiry_'.length).toUpperCase()).map((f) => f.expiry));
      if (key.startsWith('mcx_opt_expiry_')) return book.expiries('MCX', key.slice('mcx_opt_expiry_'.length).toUpperCase());
      return null;
    },
  });
  setMcxFutureExpiryPref((n) => settings.expiry(`mcx_expiry_${n.toLowerCase()}`));
  // NSE and MCX each have their own current and previous day (Settings); a name uses its own market's days
  setDayRules({
    isMcx: (n) => isCommodity(book, n),
    override: (market, day) => {
      const [cur, prev] = market === 'NSE' ? ['current_day_date', 'previous_day_date'] : ['mcx_current_day_date', 'mcx_previous_day_date'];
      return settings.get(cur) === day ? String(settings.get(prev) || '') || undefined : undefined;
    },
  });
  const mcxTokens = (): Record<string, number> => {
    if (!book) return {};
    const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
    const out: Record<string, number> = {};
    for (const n of commodity.names()) {
      const f = nearestFuture(book, n, today);
      if (f) out[n] = f.token;
    }
    return out;
  };
  const tokensAll = (): Record<string, number> => ({ ...universe, ...mcxTokens() });
  const scanSvc = new Scan915({ history, universe: () => universe, strikeDiffs: () => strikeDiffs, stepsSource: () => stepsSource, dataDir: cfg.DATA_DIR });
  // which day each market shows and whether it trades is decided by the data (a daily candle for the day, ticks on the reference instrument); the calendar is only the answer until that is read
  const sessionSvc = new SessionService({
    nseToken: () => universe['NIFTY 50'],
    mcxTokens: () => new Set(Object.values(mcxTokens())),
    // the sessions that exist: the days with a daily candle, plus the days with 5-minute candles (Kite adds a day's daily candle late, after its end-of-day run, so a
    // session that has just finished can be missing from the daily list while its 5-minute candles are already there)
    days: async (token, from, to) => {
      const back = new Date(Date.parse(`${to}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10);
      const [d, m] = await Promise.allSettled([
        history.candles({ token, interval: 'day', from, to }),
        history.candles({ token, interval: '5minute', from: back, to, noLive: true }),
      ]);
      if (d.status === 'rejected' && m.status === 'rejected') throw d.reason as Error;
      const all = [...(d.status === 'fulfilled' ? d.value : []), ...(m.status === 'fulfilled' ? m.value : [])];
      return [...new Set(all.map((c) => String(c[0]).slice(0, 10)))].sort();
    },
    fallback: { nse: () => defaultScanDay(Date.now(), holidays()), mcx: () => defaultMcxDay(Date.now(), holidays()) },
  });
  const refreshSessions = (): void => { if (tokens.validToken()) void runBackground(() => sessionSvc.refresh()).catch(() => undefined); };
  setTimeout(refreshSessions, 8000).unref();
  setInterval(refreshSessions, 60000).unref();
  const scan = { defaultDay: () => sessionSvc.nseDay(), state: (d: string) => scanSvc.state(d), start: (d: string, f: boolean) => scanSvc.start(d, f), stop: () => scanSvc.stop() };
  let liveStore!: LiveMarket;
  let tickerRef!: KiteTicker;
  // tick-built candles shared by the market read and the option chains: a contract is read from REST once, then kept current by the ticker
  const liveDep = {
    candles: (t: number) => liveStore.candles(t),
    watch: (t: number, hasOi: boolean, seed: Candle[]) => {
      liveStore.watch(t, hasOi, seed);
      tickerRef.subscribe([t], 'full');
    },
  };
  /** the expiry chosen in Settings for an underlying (blank = the nearest listed one); 'STOCK' stands for every F&O stock */
  const expiryPrefOf = (u: string, mcx: boolean): string | undefined => {
    if (mcx) return settings.expiry(`mcx_opt_expiry_${u.toLowerCase()}`);
    if (u === 'NIFTY') return settings.expiry('nifty_expiry_date');
    if (u === 'BANKNIFTY') return settings.expiry('banknifty_expiry_date');
    if (u === 'SENSEX') return settings.expiry('sensex_expiry_date');
    return ['FINNIFTY', 'MIDCPNIFTY', 'BANKEX'].includes(u) ? undefined : settings.expiry('fo_stocks_expiry_date');
  };
  const chains = new OptionChainService({
    history, book: () => book, tokens: tokensAll, holidays, live: liveDep,
    anchor: () => (settings.bool('use_ltp_for_strike') ? 'ltp' : 'open'),
    expiryPref: (u, mcx) => expiryPrefOf(u, mcx),
  });
  const futures = new FuturesService({ history, book: () => book, tokens: tokensAll, holidays });
  const oi = new OiService({ chains, history, tokens: tokensAll, holidays });
  const score = new ScoreService({ history, commodity: { is: (n) => isCommodity(book, n), levels: (r) => commodity.levels(r) }, tokens: tokensAll, strikeDiffs: () => strikeDiffs, scanZone: (day, name) => scanSvc.state(day).items[name]?.zone, futures, oi, holidays });
  const levelProb = new LevelProbService({ score, oi });
  const verdict = new VerdictService({ score, oi, history, tokens: tokensAll, volExtreme: () => ({ OVX: settings.num('vol_extreme_ovx') ?? 35 }), commodity: { is: (n) => isCommodity(book, n), levels: (r) => commodity.levels(r) } });
  const indexWeights = new IndexWeightsService(store);
  void indexWeights.load().then((w) => (w.error ? log.warn({ err: w.error }, 'index weights: download failed, using the saved copy') : log.info({ asOf: w.asOf, nifty50: w.nifty50.length, bank: w.bank.length }, 'index weights loaded')));
  setInterval(() => void indexWeights.load().catch(() => undefined), 6 * 3600 * 1000).unref();
  const progress = new Progress();
  let pulseOn = (): boolean => false;
  let pulseRef: LivePulse | undefined;
  const market = new MarketService({
    progress,
    includeLagging: () => settings.bool('include_lagging'),
    history,
    book: () => book,
    tokens: () => universe,
    strikeDiffs: () => strikeDiffs,
    zones: (day) => Object.fromEntries(Object.entries(scanSvc.state(day).items).map(([n, it]) => [n, (it as { zone?: string }).zone])),
    weights: () => indexWeights.get(),
    score,
    holidays,
    live: liveDep,
    slotMinutes: () => (pulseOn() ? 1 : 5),
  });
  const futAcc = new FutAccuracyService({ futures });
  const comboSvc = new ComboService({ history, tokens: () => universe, strikeDiffs: () => strikeDiffs, store });
  const orderFlow = new OrderFlowService({ book: () => book, tokens: tokensAll, subscribe: (t) => tickerRef.subscribe([t], 'full') });
  const curveSvc = new CurveService({ book: () => book, history, holidays });
  const consensusSvc = new ConsensusService({ score, oi, history, tokens: tokensAll, levelProb, futAcc, curve: curveSvc, orderFlow });
  const lxSvc = new LiveContextService({ score, oi, futures, market });
  const liveCtx = async (n: string, dir: number, r: { day: string; asOf?: string }) => {
    const v = await lxSvc.read({ name: n, day: r.day, asOf: r.asOf }, dir);
    return v ? { status: v.status, against: v.against, agree: v.agree } : null;
  };
  const squeezeSvc = new SqueezeService({ futures, futAcc, oi, history, store });
  // indices whose options expire on the day shown: the nearest listed expiry on or after the day equals the day
  const expiryDay = (day: string): string[] => {
    const b = book;
    if (!b) return [];
    return ([['NIFTY', 'NIFTY 50', 'NFO'], ['BANKNIFTY', 'NIFTY BANK', 'NFO'], ['SENSEX', 'SENSEX', 'BFO']] as const)
      .filter(([u, , ex]) => b.expiries(ex, u).find((e) => e >= day) === day)
      .map(([, n]) => n);
  };
  const decisions = new DecisionService({
    roomMult: () => settings.num('level_room_mult') ?? 1.5,
    score, market, levelProb, consensus: consensusSvc, oi, futures, liveContext: liveCtx,
    expiryDay,
    expiryInput: async (n, r) => {
      const a = await oi.analyse({ ...r, name: n });
      return { spot: a.maxPain ? a.spot : a.ltp, maxPain: a.maxPain ? { maxPainK: a.maxPain.maxPainK, maxPainPct: a.maxPain.maxPainPct } : null, resistance: a.walls.resistance, support: a.walls.support };
    },
    squeezeStudy: async (n, up, r) => {
      const d = squeezeSvc.cachedStudy(n, r.day)?.[up ? 'up' : 'down'];
      if (!d || d.n < 5 || !d.leg) return null;
      const raw = await oi.chainRaw({ ...r, name: n });
      const cs = raw.spotCandles.map((k) => ({ h: k[2], l: k[3], c: k[4] })).filter((k) => Number.isFinite(k.c));
      if (!cs.length) return null;
      const ext = up ? Math.min(...cs.map((k) => k.l)) : Math.max(...cs.map((k) => k.h));
      const ltp = cs[cs.length - 1]!.c;
      if (!ext || !ltp) return null;
      const pct = up ? ((ltp - ext) / ext) * 100 : ((ext - ltp) / ext) * 100;
      const rank = Math.round((d.leg.sorted.filter((x) => x <= pct).length / d.leg.sorted.length) * 100);
      return ` (${pct.toFixed(2)}% off the day's ${up ? 'low' : 'high'}, further than ${rank}% of past legs; the median leg ran ${d.leg.med!.toFixed(2)}%)`;
    },
  });
  const predictSvc = new PredictService({
      includeLagging: () => settings.bool('include_lagging'),
      combo: comboSvc, market, score, oi, futures,
      indiaVix: indiaVixReader(history, () => universe),
      lxGate: async (r, dir) => {
        const g = await lxSvc.gate({ name: 'NIFTY 50', day: r.day, asOf: r.asOf }, dir);
        return g ? { ok: g.ok } : null;
      },
    });
  const outlookSvc = new OutlookService({
    strat: async (r) => (await predictSvc.load(r).catch(() => null))?.strat ?? null,
    holidays, score, oi, history, tokens: tokensAll, consensus: consensusSvc, liveContext: liveCtx,
    finalVerdict: async (r) => {
      const v = await decisions.finalVerdict(r);
      return { dir: v.dir, conf: v.conf };
    },
  });

  const hub = new TickHub();

  // live feed: ticker -> candles built from ticks
  const inActiveHours = (ms: number): boolean => {
    const t = new Date(ms + 19800000);
    const wd = t.getUTCDay();
    const mins = t.getUTCHours() * 60 + t.getUTCMinutes();
    return wd > 0 && wd < 6 && mins >= 9 * 60 + 20 && mins <= 23 * 60 + 30;
  };
  const live = new LiveMarket({
    epoch: () => tickerRef?.connectedAt ?? 0,
    healthy: () => !!tickerRef && tickerRef.state === 'connected' && (!inActiveHours(Date.now()) || Date.now() - tickerRef.lastTickAt < 180000),
  });
  liveStore = live;
  liveRef = live;
  const ticker = new KiteTicker({ apiKey: cfg.KITE_API_KEY, getAccessToken: () => tokens.validToken(), logger: log, onTicks: (t, now) => { live.onTicks(t, now); sessionSvc.onTicks(t, now); hub.publish(t); orderFlow.record(t, now); } });
  const feed = {
    status: () => ({ state: ticker.state, subscribed: ticker.subscribedCount, watched: live.watched().length, ticksSeen: live.ticksSeen, lastTickAt: ticker.lastTickAt || null, connectedAt: ticker.connectedAt || null, reconnects: ticker.reconnects }),
    watch: (list: { token: number; hasOi: boolean }[]) => { for (const t of list) live.watch(t.token, t.hasOi); ticker.subscribe(list.map((t) => t.token), 'full'); },
    candles: (token: number) => live.candles(token),
  };
  // by default watch the main indices (spot candles have no OI)
  const watchDefaults = (): void => {
    if (!book) return;
    const names = ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'INDIA VIX'];
    const list = names.flatMap((n) => { const r = book!.symbol(n === 'SENSEX' ? 'BSE' : 'NSE', n); return r ? [{ token: r.token, hasOi: false }] : []; });
    if (list.length) feed.watch(list);
  };
  watchDefaults();
  tickerRef = ticker;
  const liveSubs = new LiveSubs({
    book: () => book,
    universe: () => universe,
    commodities: () => commodity.names(),
    heavyweights: () => [...new Set((['NIFTY 50', 'NIFTY BANK'] as const).flatMap((ix) => Object.entries(indexWeights.get()?.top10?.[ix] ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n]) => n)))],
    movers: () => Object.entries(scanSvc.state((settings.get('current_day_date') as string) || scan.defaultDay()).items).filter(([, it]) => ['AST', 'ASO', 'BSO', 'BST'].includes((it as { zone?: string }).zone ?? '')).map(([n]) => n).slice(0, 60),
    live,
    subscribe: (t) => ticker.subscribe(t, 'full'),
  });
  const engine = new LiveEngine({
    live, subs: liveSubs, book: () => book, ticker: () => ticker, limiter: () => kite.limiterStats(),
    historical: (token, from, to, oi) => kite.historical(token, '5minute', from, to, oi),
    pulse: () => pulseRef?.state(),
    keyNames: () => (['NIFTY 50', 'NIFTY BANK'] as const).flatMap((ix) => Object.entries(indexWeights.get()?.top10?.[ix] ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n]) => n)),
    read: (q) => history.candles(q),
    background: runBackground,
    canRun: () => {
      const t = new Date(Date.now() + 19800000);
      const mins = t.getUTCHours() * 60 + t.getUTCMinutes();
      return !!tokens.validToken() && tickerRef.state === 'connected' && t.getUTCDay() > 0 && t.getUTCDay() < 6 && mins >= 8 * 60 + 30 && mins <= 23 * 60 + 30;
    },
    // once NSE should have opened and is not ticking (a holiday), only the commodity contracts are worth loading
    onlyGroups: () => {
      const t = new Date(Date.now() + 19800000);
      return t.getUTCHours() * 60 + t.getUTCMinutes() >= 9 * 60 + 45 && !sessionSvc.nseTicking() ? ['MCX'] : null;
    },
  });
  engine.start();
  const pulse = new LivePulse({
    live,
    // while either market is ticking (the data decides, not a calendar)
    active: () => !!book && !!tokens.validToken() && (sessionSvc.nseTicking() || sessionSvc.mcxTicking()) && tickerRef.state === 'connected' && settings.bool('live_recompute'),
    recompute: async () => {
      const t = new Date(Date.now() + 19800000);
      if (!sessionSvc.nseTicking()) return; // NSE is not trading (a holiday, or the evening): only the commodity screens move, and they read the live candles on every request
      const shown = (settings.get('current_day_date') as string) || scan.defaultDay();
      market.invalidate();
      decisions.invalidate();
      await runBackground(() => market.load({ day: shown }));
    },
  });
  pulseRef = pulse;
  pulseOn = () => pulse.runs > 0 && Date.now() - pulse.at < 180000;
  pulse.start();
  let followDay = '';
  const followTick = (): void => {
    if (!book) return;
    const d = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
    if (d !== followDay) { followDay = d; liveSubs.reset(); live.log('day', `new day ${d}: the followed list is rebuilt`); }
    liveSubs.sync();
    void engine.preseed().catch(() => undefined);
    void engine.reconcile().catch(() => undefined);
    const t = new Date(Date.now() + 19800000);
    const mins = t.getUTCHours() * 60 + t.getUTCMinutes();
    if (mins >= 15 * 60 + 40 && mins <= 22 * 60 && !engine.checkDone(d) && tokens.validToken()) void engine.runCheck().catch(() => undefined);
  };
  setTimeout(followTick, 5000).unref();
  setInterval(followTick, 60000).unref();
  setInterval(() => void engine.reconcile().catch(() => undefined), 20000).unref();
  if (cfg.KITE_API_KEY && settings.bool('live_feed_auto')) ticker.start();
  settings.onChange((k, v) => {
    if (k !== 'live_feed_auto' || !cfg.KITE_API_KEY) return;
    if (v === true) ticker.start();
    else ticker.stop();
  });

  const macroSvc = new MacroService(store);
  const commodityGlobal = new CommodityGlobalService({ levels: (r) => commodity.levels(r), macro: macroSvc, score });
  const refresher = new Refresher();
  refresher.register('kite quotes and history', () => kite.invalidateCache());
  refresher.register('market read', () => market.invalidate());
  refresher.register('decisions', () => decisions.invalidate());
  refresher.register('futures accuracy', () => futAcc.invalidate());
  refresher.register('curve', () => curveSvc.invalidate());
  refresher.register('macro', () => macroSvc.invalidate());
  refresher.register('volatility indices', () => volIndex.invalidate());
  // a changed setting (expiry, strike anchor, lagging signals, volatility values ...) drops the per-slot copies so the next read uses it
  settings.onChange((k) => {
    if (k !== 'live_feed_auto') refresher.run();
  });

  const signalSvc = new SignalService({
    score, market, consensus: consensusSvc, levelProb, futures, oi,
    finalVerdict: async (r) => {
      const v = await decisions.finalVerdict(r);
      return { call: v.call, dir: v.dir, headline: v.headline, conf: v.conf, entryBlocked: v.entryBlocked };
    },
  });
  const focusSvc = new FocusService({
    consensus: consensusSvc, verdict, score, oi, futures, signals: signalSvc, squeeze: squeezeSvc, market, liveContext: lxSvc,
    isMcx: (n) => isCommodity(book, n),
    settings,
    today: (mcx) => (mcx ? new Date(Date.now() + 19800000).toISOString().slice(0, 10) : new Date(Date.now() + 19800000).toISOString().slice(0, 10)),
  });
  const overviewSvc = new OverviewService({
    market, futures, futAcc, score,
    isMcx: (n) => isCommodity(book, n),
    commodityLtp: async (r) => (await commodity.levels(r).catch(() => null))?.ltp ?? null,
    includeLagging: () => settings.bool('include_lagging'),
  });
  const panelSvc = new PanelService({
    market, score, oi, futures, store,
    topStocks: () => {
      const t = indexWeights.get()?.top10;
      return t ? [...new Set([...Object.keys(t['NIFTY 50']), ...Object.keys(t['NIFTY BANK'])])] : [];
    },
  });
  const scoreSeries = new ScoreSeriesService({ score, isMcx: (n) => isCommodity(book, n), store });
  refresher.register('score series', () => scoreSeries.invalidate());
  const marksSvc = new MarksService({ focus: focusSvc });
  refresher.register('marks', () => marksSvc.invalidate());
  const boardSvc = new BoardService({
    consensus: consensusSvc, levelProb, oi, signals: signalSvc, score, verdict, squeeze: squeezeSvc,
    weights: (index) => indexWeights.get()?.top10?.[index as 'NIFTY 50'] ?? {},
    topStocks: () => {
      const t = indexWeights.get()?.top10;
      return t ? [...new Set([...Object.keys(t['NIFTY 50']), ...Object.keys(t['NIFTY BANK'])])] : [];
    },
    mcxNames: () => commodity.names(),
  });
  refresher.register('boards', () => boardSvc.invalidate());
  const strikeSvc = new StrikeService({
    book: () => book, history, oi, consensus: consensusSvc, verdict,
    isMcx: (n) => isCommodity(book, n),
    settings,
    expiryPref: (n, mcx) => (mcx ? undefined : settings.expiry(n === 'NIFTY' ? 'nifty_expiry_date' : n === 'BANKNIFTY' ? 'banknifty_expiry_date' : n === 'SENSEX' ? 'sensex_expiry_date' : 'fo_stocks_expiry_date')),
  });
  const alertSvc = new AlertService({
    squeeze: squeezeSvc,
    today: () => new Date(Date.now() + 19800000).toISOString().slice(0, 10),
    outlookOn: () => settings.bool('outlook_alert'),
    holdMin: () => settings.num('alert_hold_min') ?? 15,
    outlook: async (name) => (await outlookSvc.plan({ name, day: new Date(Date.now() + 19800000).toISOString().slice(0, 10) })) as never,
    notify: async (text) => {
      const tok = String(settings.get('telegram_bot_token') || '');
      const chat = String(settings.get('telegram_chat_id') || '');
      if (!settings.bool('alerts_telegram') || !tok || !chat) return;
      await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) });
    },
  });
  const newsSvc = new NewsService({
    store,
    push: (a) => { alertSvc.push(a); },
    move: async (name, ts) => {
      const tok = tokensAll()[name];
      if (!tok || !tokens.validToken()) return null;
      const day = (ms: number): string => new Date(ms + 19800000).toISOString().slice(0, 10);
      const cs = await history.candles({ token: tok, interval: '5minute', from: day(ts - 4 * 86400000), to: day(Date.now()) });
      if (!cs.length) return null;
      const start = (c: (typeof cs)[number]): number => Date.parse(String(c[0]).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
      let before: (typeof cs)[number] | undefined;
      for (const c of cs) if (start(c) + 300000 <= ts) before = c;
      if (!before) return null;
      return { from: before[4], to: cs[cs.length - 1]![4], closed: ts - (start(before) + 300000) > 600000 };
    },
  });
  setTimeout(() => void newsSvc.refresh().catch(() => undefined), 15000).unref();
  setInterval(() => void newsSvc.refresh().catch(() => undefined), 5 * 60000).unref();
  setInterval(() => void newsSvc.eventTick().catch(() => undefined), 60000).unref();
  // keep the market read ready: once at start (for the day the app shows), then at the start of every 5-minute slot while NSE is open, so the Dashboard opens on a finished result
  let lastWarm = '';
  let scanWasRunning = false;
  const warm = (): void => {
    if (!book || !tokens.validToken()) return;
    const t = new Date(Date.now() + 19800000);
    const today = t.toISOString().slice(0, 10);
    const mins = t.getUTCHours() * 60 + t.getUTCMinutes();
    const wd = t.getUTCDay();
    const shown = (settings.get('current_day_date') as string) || scan.defaultDay();
    const liveNow = shown === today && sessionSvc.nseTicking() && mins <= 15 * 60 + 35;
    // the 9:15 scan runs by itself (after 09:20 on a live day, or when the shown day has none yet); when it finishes the market read is rebuilt with its zones
    const sc = scanSvc.state(shown);
    if (scanWasRunning && !sc.running) { scanWasRunning = false; lastWarm = ''; }
    if (!sc.running && !(sc.finishedAt && Object.keys(sc.items).length) && !(shown === today && mins < 9 * 60 + 20 && wd > 0 && wd < 6)) {
      log.info({ day: shown }, '9:15 scan: starting automatically');
      scanSvc.start(shown, false);
      scanWasRunning = true;
    } else if (sc.running) scanWasRunning = true;
    const slot = liveNow ? `${today}T${mins - (mins % 5)}` : `static|${shown}`;
    if (slot === lastWarm) return;
    lastWarm = slot;
    log.info({ slot }, 'market read: warming');
    runBackground(() => market.load({ day: shown })).then(() => log.info({ slot }, 'market read: ready')).catch((e: Error) => { lastWarm = ''; log.warn({ err: { message: e.message } }, 'market read: warm-up failed, will retry'); });
  };
  setTimeout(warm, 20_000).unref();
  setInterval(warm, 30_000).unref();

  const trackingSvc = new TrackingService({
    store,
    levels: async (name, day) => {
      const r = await outlookSvc.levels({ name, day });
      return r ? { spot: r.spot, zones: r.zones } : null;
    },
    today: () => new Date(Date.now() + 19800000).toISOString().slice(0, 10),
    viewDay: () => (settings.get('current_day_date') as string) || scan.defaultDay(),
    open: (now) => inWindow(false, now),
    raise: (a) => void alertSvc.push(a),
  });
  const watchdog = new Watchdog({
    // a weekday, in the hours anything might trade; whether a market is open is not guessed: only a dead connection or an expired login is reported
    active: () => {
      const t = new Date(Date.now() + 19800000);
      const mins = t.getUTCHours() * 60 + t.getUTCMinutes();
      return t.getUTCDay() > 0 && t.getUTCDay() < 6 && mins >= 8 * 60 + 45 && mins <= 23 * 60 + 25;
    },
    tokenOk: () => !!tokens.validToken(),
    // Kite sends a heartbeat every second even when nothing trades, so silence here means the connection is broken, not that the market is shut
    feed: () => ({ connected: ticker.state === 'connected', lastTickAt: ticker.lastTickAt }),
    push: (a) => { alertSvc.push(a); },
  });
  setInterval(() => watchdog.tick(), 30_000).unref();
  // ── Telegram updates: morning brief, NSE open snapshot, NSE close summary, MCX open and close ──
  const sendTelegram = async (text: string): Promise<{ ok: boolean; why?: string }> => {
    const tok = String(settings.get('telegram_bot_token') || '');
    const chat = String(settings.get('telegram_chat_id') || '');
    if (!settings.bool('alerts_telegram')) return { ok: false, why: 'The switch "Send squeeze alerts to Telegram" is off in Settings.' };
    if (!tok) return { ok: false, why: 'The Telegram bot token is not set in Settings.' };
    if (!chat) return { ok: false, why: 'The Telegram chat id is not set in Settings.' };
    try {
      const r = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000) }), signal: AbortSignal.timeout(15000) });
      if (r.ok) return { ok: true };
      const j = (await r.json().catch(() => null)) as { description?: string } | null;
      const d = j?.description ?? `HTTP ${r.status}`;
      const hint = /chat not found/i.test(d) ? ' Open your bot in Telegram and press Start (or send it any message) first, and check the chat id.' : r.status === 404 || r.status === 401 ? ' Telegram does not accept the bot token: a typo, a space at either end, a "bot" prefix, or a revoked token. Copy it again from BotFather (it looks like 123456789:AA...) and save it in Settings.' : '';
      return { ok: false, why: `Telegram answered: ${d}.${hint}` };
    } catch (e) {
      return { ok: false, why: `Could not reach Telegram from the server: ${(e as Error).message}` };
    }
  };
  const shiftDay = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const dayRow = async (name: string, day: string): Promise<IdxRow | null> => {
    const tok = universe[name];
    if (!tok) return null;
    try {
      const cs = await runBackground(() => history.candles({ token: tok, interval: 'day', from: shiftDay(day, -10), to: day }));
      const cur = cs.filter((c) => String(c[0]).slice(0, 10) === day).pop();
      const prev = cs.filter((c) => String(c[0]).slice(0, 10) < day).pop();
      return { name, open: cur ? cur[1] : null, ltp: cur ? cur[4] : prev ? prev[4] : null, prev: prev ? prev[4] : null };
    } catch {
      return null;
    }
  };
  const planRow = async (name: string, day: string): Promise<PlanRow | null> => {
    try {
      const o = (await runBackground(() => outlookSvc.plan({ name, day }))) as { ok?: boolean; plan?: { long: boolean; entryPx: number; stop: number; t1: { price: number } | null; t2: { price: number } | null; rr: number | null; atLevel: boolean } | null; rank?: number; forced?: boolean };
      if (!o.ok || !o.plan) return null;
      return { name, long: o.plan.long, rank: o.rank ?? 1, forced: !!o.forced, entry: o.plan.entryPx, stop: o.plan.stop, t1: o.plan.t1?.price ?? null, t2: o.plan.t2?.price ?? null, rr: o.plan.rr, atLevel: o.plan.atLevel };
    } catch {
      return null;
    }
  };
  const marketRow = async (day: string): Promise<{ row: MarketRow; weighted: { name: string; change: number }[] } | null> => {
    try {
      const m = await runBackground(() => market.load({ day }));
      return { row: { score: m.score, signal: m.signal.signal, reason: m.signal.reason, up: m.breakout.all.up, dn: m.breakout.all.dn, niftyUp: m.breakout.nifty.up, niftyDn: m.breakout.nifty.dn, bankUp: m.breakout.bank.up, bankDn: m.breakout.bank.dn }, weighted: m.weighted50.map((w) => ({ name: w.name, change: w.change })) };
    } catch {
      return null;
    }
  };
  const mcxRows = async (day: string, withPlan: boolean): Promise<McxRow[]> => {
    const out: McxRow[] = [];
    for (const name of ['GOLDM', 'SILVERM', 'CRUDEOILM']) {
      if (!commodity.names().includes(name)) continue;
      try {
        const l = await runBackground(() => commodity.levels({ name, day }));
        out.push({ name, open: l.open, prev: l.prevClose, ltp: l.ltp, zone: String(l.zone), aso: l.strikeMap.ustrikeOne, bso: l.strikeMap.bstrikeOne, vol: l.vol.value != null ? `${l.vol.key} ${l.vol.value}` : '', plan: withPlan ? await planRow(name, day) : null });
      } catch {
        /* the contract does not trade yet or has no data: left out */
      }
    }
    return out;
  };
  // ── MCX price calculator: COMEX / NYMEX x USDINR, calibrated on MCX's own last price ──
  const mcxCalc = new McxCalcService({
    store,
    names: () => commodity.names(),
    mcxOpen: () => sessionSvc.mcxTicking(),
    mcxLast: async (name) => {
      if (!book) return null;
      const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
      const fut = nearestFuture(book, name, today);
      if (!fut) return null;
      const cs = await runBackground(() => history.candles({ token: fut.token, interval: '5minute', from: shiftDay(today, -5), to: today, noLive: true }));
      const c = cs[cs.length - 1];
      return c ? { ltp: c[4], at: Date.parse(String(c[0]).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) + 300000 } : null;
    },
  });
  // the gap log: while MCX is open, once every two minutes, the gap between MCX and its global-implied price is written down, so it can later be checked against what MCX did next
  const gapLog = new GapLog(join(cfg.DATA_DIR, 'mcxgap'));
  gapLog.prune();
  setInterval(() => {
    if (!sessionSvc.mcxTicking()) return;
    void mcxCalc.load().then((r) => {
      const t = Date.now();
      gapLog.append(r.rows.filter((x) => x.mcx.open && x.basisSource === 'saved' && x.estimate != null && x.gapPct != null && x.mcx.last != null && x.usd.at != null).map((x) => ({ t, name: x.name, mcx: x.mcx.last!, est: x.estimate!, gap: x.gapPct!, age: Math.round((t - x.usd.at!) / 1000) })));
    }).catch(() => undefined);
  }, 120_000).unref();
  const INDICES = ['NIFTY 50', 'NIFTY BANK', 'SENSEX'];
  // ── Positions: your open positions and how each sits against the Probable trade of its underlying (read only) ──
  const APP_NAME: Record<string, string> = { NIFTY: 'NIFTY 50', BANKNIFTY: 'NIFTY BANK', SENSEX: 'SENSEX', FINNIFTY: 'NIFTY FIN SERVICE', MIDCPNIFTY: 'NIFTY MID SELECT', BANKEX: 'BANKEX' };
  const positionsSvc = new PositionsService({
    positions: () => kite.positions(),
    resolve: (exchange, symbol) => {
      const i = book?.symbol(exchange, symbol);
      if (!i) return { underlying: symbol, option: null };
      if (i.type === 'CE' || i.type === 'PE' || i.type === 'FUT') return { underlying: APP_NAME[i.name] ?? i.name, option: i.type === 'FUT' ? null : i.type };
      return { underlying: symbol, option: null };
    },
    ltp: (u) => {
      const tok = tokensAll()[u];
      const t = tok ? live.lastTick(tok) : undefined;
      return t && t.ltp > 0 ? t.ltp : null;
    },
    plan: async (u) => planRow(u, commodity.names().includes(u) ? sessionSvc.mcxDay() : sessionSvc.nseDay()),
    planNames: () => new Set([...INDICES, ...commodity.names()]),
  });
  const digestData: DigestData = {
    morning: async (today) => {
      const hol = holidays().has(today);
      const [gift, vix] = await Promise.all([dayRow('GIFT NIFTY', today), dayRow('INDIA VIX', today)]);
      const ev = await newsSvc.events().catch(() => null);
      const hd = await newsSvc.headlines().catch(() => null);
      const startMs = Date.parse(`${today}T06:00:00+05:30`);
      const endMs = Date.parse(`${today}T23:59:00+05:30`);
      const hm = (ms: number): string => new Date(ms + 19800000).toISOString().slice(11, 16);
      const expiry = book ? [['NIFTY', 'NFO'], ['BANKNIFTY', 'NFO'], ['SENSEX', 'BFO']].filter(([u, ex]) => book!.expiries(ex!, u!)[0] === today).map(([u]) => u!) : [];
      return buildMorning({
        day: today,
        nse: hol ? 'closed today (NSE holiday per the holiday list)' : 'opens 09:15',
        mcx: hol ? 'evening session only, from 17:00' : 'open 09:00 to late evening',
        gift, vix, expiry,
        events: (ev?.items ?? []).filter((e) => e.ts >= startMs && e.ts <= endMs && e.india.level !== 'LOW').map((e) => ({ time: hm(e.ts), title: e.title, india: e.india.level, forecast: e.forecast, previous: e.previous })),
        heads: (hd?.items ?? []).filter((h) => h.tag.level === 'HIGH' && Date.now() - h.ts < 12 * 3600000).map((h) => ({ title: h.title, source: h.sources[0] ?? '', watch: h.tag.watch })),
        kiteOk: !!tokens.validToken(),
        mcxEst: await mcxCalc.load().then((r) => r.rows.filter((x) => ['GOLDM', 'SILVERM', 'CRUDEOILM'].includes(x.name) && x.estimate != null && x.mcx.last != null && x.gapPct != null).map((x) => ({ name: x.name, estimate: x.estimate!, last: x.mcx.last!, pct: x.gapPct!, basisPct: x.basis ? (x.basis - 1) * 100 : 0 }))).catch(() => []),
      });
    },
    open: async (day) => {
      const items = scanSvc.state(day).items as Record<string, { zone?: string; anchor?: number; aso?: number; bso?: number; ast?: number; bst?: number }>;
      const rows = (await Promise.all(INDICES.map((n) => dayRow(n, day)))).filter((r): r is IdxRow => !!r).map((r) => {
        const it = items[r.name];
        return { ...r, open: r.open ?? it?.anchor ?? null, zone: it?.zone ?? null, aso: it?.aso ?? null, bso: it?.bso ?? null, ast: it?.ast ?? null, bst: it?.bst ?? null };
      });
      const mk = await marketRow(day);
      const plans = (await Promise.all(INDICES.map((n) => planRow(n, day)))).filter((p): p is PlanRow => !!p);
      const t = new Date(Date.now() + 19800000).toISOString().slice(11, 16);
      return { text: buildOpen({ day, time: t, rows, market: mk?.row ?? null, plans }), zones: Object.keys(items).length };
    },
    close: async (day) => {
      const rows = (await Promise.all(INDICES.map((n) => dayRow(n, day)))).filter((r): r is IdxRow => !!r);
      const mk = await marketRow(day);
      const plans: { plan: PlanRow; outcome: string }[] = [];
      for (const n of INDICES) {
        const p = await planRow(n, day);
        const tok = universe[n];
        if (!p || !tok) continue;
        const cs = await runBackground(() => history.candles({ token: tok, interval: '5minute', from: day, to: day })).catch(() => []);
        plans.push({ plan: p, outcome: planOutcome(p, cs.filter((c) => String(c[0]).slice(11, 16) >= '09:20').map((c) => ({ t: String(c[0]).slice(11, 16), o: c[1], h: c[2], l: c[3], c: c[4] }))) });
      }
      return buildClose({ day, rows, market: mk?.row ?? null, plans, movers: mk?.weighted ?? [] });
    },
    mcxopen: async (day) => buildMcxOpen({ day, time: new Date(Date.now() + 19800000).toISOString().slice(11, 16), rows: await mcxRows(day, true) }),
    mcxclose: async (day) => buildMcxClose({ day, rows: await mcxRows(day, false) }),
  };
  const digest = new DigestService({
    store,
    data: digestData,
    send: sendTelegram,
    enabled: (k) => settings.bool(`tg_${k}`),
    session: sessionSvc,
  });
  setInterval(() => void digest.tick().catch((e: Error) => log.warn({ err: { message: e.message } }, 'telegram update failed')), 30_000).unref();
  const alertTimer = setInterval(() => {
    void runBackground(() => alertSvc.tick()).catch(() => undefined);
    void runBackground(() => alertSvc.entryTick()).catch(() => undefined);
    void runBackground(() => trackingSvc.tick()).catch(() => undefined);
  }, 60_000);
  alertTimer.unref();
  const app = buildApp({
    appSecret: cfg.APP_SECRET,
    apiKey: cfg.KITE_API_KEY,
    apiSecret: cfg.KITE_API_SECRET,
    tokens,
    kite,
    getInstruments: () => book,
    reloadInstruments: async () => { await reloadInstruments(); watchDefaults(); },
    feed,
    scan,
    chains,
    futures,
    oi,
    score,
    consensus: consensusSvc,
    levelProb,
    verdict,
    market,
    decisions,
    outlook: outlookSvc,
    liveContext: lxSvc,
    strength: new StrengthService({ score }),
    macro: macroSvc,
    settings,
    defaultDay: () => (settings.get('current_day_date') as string) || scan.defaultDay(),
    mcxDefaultDay: () => (settings.get('mcx_current_day_date') as string) || sessionSvc.mcxDay(),
    commodity: { names: () => commodity.names(), levels: (r) => commodity.levels(r), global: (r) => commodityGlobal.load(r) },
    refresher,
    progress,
    orderFlow,
    positional: new PositionalService({
      book: () => book,
      indexNames: (ix) => (ix === 'NIFTY 50' ? indexWeights.get()?.nifty50 : indexWeights.get()?.bank) ?? [],
      tokens: () => universe,
      history,
      dashboardNames: () => {
        const t = indexWeights.get()?.top10;
        return t ? [...Object.keys(t['NIFTY 50']), ...Object.keys(t['NIFTY BANK'])] : [];
      },
    }),
    curve: curveSvc,
    squeeze: squeezeSvc,
    weightedOi: new WeightedOiService({ progress, oi, top10: () => indexWeights.get()?.top10 }),
    learn: new LearnService(),
    news: newsSvc,
    engine,
    pulse,
    session: sessionSvc,
    digest,
    mcxCalc,
    heatmap: () => {
      const w = indexWeights.get();
      const rows = Object.entries(universe).flatMap(([name, token]) => {
        const t = live.lastTick(token);
        if (!t || !(t.ltp > 0)) return [];
        return [{ name, ltp: t.ltp, open: t.open > 0 ? t.open : null, prev: t.close > 0 ? t.close : null, high: t.high > 0 ? t.high : null, low: t.low > 0 ? t.low : null, volume: t.volume ?? null }];
      });
      return { at: Date.now(), lastTickAt: tickerRef.lastTickAt || null, total: Object.keys(universe).length, rows, weights: { 'NIFTY 50': w?.full?.['NIFTY 50'] ?? {}, 'NIFTY BANK': w?.full?.['NIFTY BANK'] ?? {} } };
    },
    positionsSvc,
    gapStats: () => ({ days: gapLog.days(), ...analyseGaps(gapLog.read(), {}) }),
    expiryPref: expiryPrefOf,
    fearGreed: new FearGreedService({ market, indiaVix: indiaVixReader(history, () => universe), history, tokens: () => universe }),
    predict: predictSvc,
    combo: comboSvc,
    signals: signalSvc,
    focus: focusSvc,
    alerts: alertSvc,
    tracking: trackingSvc,
    strikes: strikeSvc,
    overview: overviewSvc,
    panel: panelSvc,
    boards: boardSvc,
    account: new AccountService({ kite }),
    marks: marksSvc,
    watchlist: new Watchlist({ store, book: () => book, universe: () => universe, topWeights: (ix, n) => Object.entries(indexWeights.get()?.top10?.[ix] ?? {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, weight]) => ({ name, weight })), indexNames: (ix) => (ix === 'NIFTY 50' ? indexWeights.get()?.nifty50 : indexWeights.get()?.bank) ?? [] }),
    dataAdmin: new DataAdmin({ dataDir: cfg.DATA_DIR, store, reloadInstruments, reloadWeights: async () => void (await indexWeights.load(true)), refresh: () => void refresher.run() }),
    stepsInfo: () => ({ map: strikeDiffs as Record<string, unknown>, source: stepsSource }),
    weightsInfo: () => { const w = indexWeights.get(); return w ? { asOf: w.asOf, error: w.error, nifty50: w.nifty50, bank: w.bank, full: w.full } : null; },
    holidayList: () => ({ list: holidaySvc.list(), error: holidaySvc.error }),
    scoreSeries,
    futSeries: futAcc,
    universe: () => universe,
    hub,
    activity,
    info: { version, startedAt, host: cfg.HOST, port: cfg.PORT, dataDir: cfg.DATA_DIR },
    staticDir: cfg.FRONTEND_DIR ? resolve(cfg.FRONTEND_DIR) : existsSync(resolve('../frontend/dist/index.html')) ? resolve('../frontend/dist') : undefined,
    logger: log,
  });
  await app.listen({ port: cfg.PORT, host: cfg.HOST });
  log.info({ port: cfg.PORT, host: cfg.HOST }, 'backend listening');
  let closing = false;
  const shutdown = async (sig: string): Promise<void> => {
    if (closing) return;
    closing = true;
    log.info({ sig }, 'shutting down');
    scanSvc.stop();
    ticker.stop();
    hub.close();
    const t = setTimeout(() => process.exit(0), 5000);
    t.unref();
    await app.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (e) => log.error({ err: { message: e instanceof Error ? e.message : String(e) } }, 'unhandled rejection'));
  process.on('uncaughtException', (e) => log.error({ err: { message: e.message } }, 'uncaught exception'));
  if (!cfg.KITE_API_KEY) log.warn('KITE_API_KEY is not set: Kite calls are disabled until it is');
  else if (tokens.state() !== 'valid') log.warn(`Kite token is ${tokens.state()}: open http://${cfg.HOST}:${cfg.PORT}/auth/kite/start in a browser to log in`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
