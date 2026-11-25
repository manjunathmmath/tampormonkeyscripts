import { Progress } from './progress.js';
import type { Candle } from '../kite/client.js';
import type { InstrumentBook } from '../instruments/book.js';
import { foStockSymbols } from '../instruments/universe.js';
import { advanceDeclineCounts, advanceDeclineScores, all915Score, cappedOiObv, componentScore, futuresTrendScores, nineFifteenScoreOf, type AdStock, type FutStock } from '../engine/breadth.js';
import { compositeScore, leadingScore, type CompositeParts } from '../engine/composite.js';
import { remarkOfCandle } from '../engine/futures.js';
import { getStrikeDiff, strikeDetails, type StrikeDiffMap } from '../engine/levels.js';
import { marketSignal, type MarketSignal } from '../engine/marketSignal.js';
import { makeTrend } from '../engine/trend.js';
import { nearestFuture } from './futures.js';
import { previousTradingDay, trimCandles } from './history.js';
import type { IndexWeights } from './indexWeights.js';
import type { ScoreResult } from './score.js';

export interface MarketDeps {
  /** minutes in one result slot while live: 5 normally, 1 when the tick-built candles make a recompute cheap */
  slotMinutes?: () => number;
  /** reports the phases of a heavy read (the first read of a day) */
  progress?: Progress;
  history: { candles(q: { token: number; interval: '5minute' | 'day'; from: string; to: string; oi?: boolean; asOf?: string }): Promise<Candle[]> };
  book: () => InstrumentBook | undefined;
  tokens: () => Record<string, number>;
  strikeDiffs: () => StrikeDiffMap;
  /** the 9:15 zone of every scanned name for a day */
  zones: (day: string) => Record<string, string | undefined>;
  weights: () => IndexWeights | null;
  score: { load(req: { name: string; day: string; asOf?: string }): Promise<ScoreResult> };
  holidays?: () => ReadonlySet<string>;
  /** the Settings switch "Include lagging" (default on) */
  includeLagging?: () => boolean;
  /** live 5-minute candles built from ticks; when present a live day is read from history ONCE per name and then kept up to date by the ticker */
  live?: { candles(token: number): Candle[] | undefined; watch(token: number, hasOi: boolean, seed: Candle[]): void };
  now?: () => number;
}

export interface MarketResult {
  day: string;
  asOf: string | null;
  score: number;
  /** the leading part alone (9:15 + advance / decline + futures) */
  leading: number;
  signal: MarketSignal;
  parts: CompositeParts;
  /** how much of the universe each market-wide number was built from */
  coverage: { adSample: number; adUniverse: number; adStocks: number; futuresStocks: number; zones: number; components: number };
  /** names whose data could not be read (they are left out of the counts, like a failed fetch in the userscript) */
  skipped: string[];
  missing: string[];
  /** the top-10 NIFTY 50 stocks with weight and change (for the broad-based check of Level Confirmation) */
  weighted50: { name: string; weight: number; change: number }[];
  /** NIFTY 50 stocks trading above / below their previous close (the breadth check of Live Context) */
  breadth50: { up: number; dn: number };
  /** advance / decline counts of the latest candle (all F&O, NIFTY 50, NIFTY BANK) */
  adCounts: { all: { a: number; d: number; n: number; net: number }; nifty: { a: number; d: number; n: number; net: number }; bank: { a: number; d: number; n: number; net: number } };
  /** share of each index's weight that is up and down against the previous close, percent (null without weights) */
  adWeighted: { nifty: { up: number; dn: number } | null; bank: { up: number; dn: number } | null };
  /** the 9:15 closes by index: stocks above ASO or AST, below BSO or BST, and their share of the index weight */
  breakout: { nifty: { up: number; dn: number; wtUp: number | null; wtDn: number | null }; bank: { up: number; dn: number; wtUp: number | null; wtDn: number | null }; all: { up: number; dn: number } };
}

const IDX_FUT: Record<string, string> = { 'NIFTY 50': 'NIFTY BANK' };
void IDX_FUT;

async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>, onDone?: () => void): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await f(items[k]!);
        onDone?.();
      }
    }),
  );
  return out;
}

const hm = (c: Candle): string => String(c[0]).slice(11, 16);

/**
 * The market-wide layer: the advance / decline and futures trend scores over the whole F&O universe, the 9:15 breadth, the weighted component scores, the
 * composite score and the market signal (STRONG BUY ... STRONG SELL). Reads about three history requests per stock, so a first read takes minutes; a finished day
 * is cached by the history service.
 */
export class MarketService {
  private readonly seeded = new Set<number>();
  private readonly prevDay = new Map<string, Candle | undefined>();
  private cache = new Map<string, { slot: string; v: MarketResult; z: number }>();

  /** forget the per-slot results (an on-demand refresh); the previous-day figures never change and stay */
  invalidate(): void {
    this.cache.clear();
  }
  private inflight = new Map<string, Promise<MarketResult>>();
  constructor(private readonly d: MarketDeps) {}

  /** 5-minute slot label of a moment (IST), so a live result is recomputed once per slot and not on every request */
  private slotOf(ms: number): string {
    const t = new Date(ms + 19800000);
    return `${t.toISOString().slice(0, 10)}T${String(t.getUTCHours()).padStart(2, '0')}:${String(Math.floor(t.getUTCMinutes() / (this.d.slotMinutes?.() ?? 5)) * (this.d.slotMinutes?.() ?? 5)).padStart(2, '0')}`;
  }

  /** a name's 5-minute candles of the day: for a live day, REST once to seed the tick-built series, then no more REST calls */
  private async series(token: number, hasOi: boolean, day: string, asOf: string | undefined, live: boolean): Promise<Candle[]> {
    const fetchIt = (): Promise<Candle[]> => this.d.history.candles({ token, interval: '5minute', from: day, to: day, oi: hasOi, asOf });
    if (live && this.d.live) {
      const have = this.seeded.has(token) ? this.d.live.candles(token) : undefined;
      if (have && have.length) return have;
      const seed = await fetchIt();
      this.d.live.watch(token, hasOi, seed);
      this.seeded.add(token);
      return seed;
    }
    return fetchIt();
  }

  /** a stock's previous close never changes during the day: read it once */
  private async prevClose(token: number, prevDay: string): Promise<number | undefined> {
    const key = `px|${token}|${prevDay}`;
    if (this.prevDay.has(key)) return this.prevDay.get(key)?.[4];
    const c = await this.d.history.candles({ token, interval: 'day', from: prevDay, to: prevDay });
    const p = c[c.length - 1];
    this.prevDay.set(key, p);
    return p?.[4];
  }

  /** the previous day's daily candle of a future never changes during the day: read it once */
  private async prevOf(token: number, prevDay: string): Promise<Candle | undefined> {
    const key = `${token}|${prevDay}`;
    if (this.prevDay.has(key)) return this.prevDay.get(key);
    const c = await this.d.history.candles({ token, interval: 'day', from: prevDay, to: prevDay, oi: true });
    const p = c[c.length - 1];
    this.prevDay.set(key, p);
    return p;
  }

  /** Cached per 5-minute slot on a live day (a finished day or a snapshot time is cached for good), and concurrent calls share one run. */
  async load(req: { day: string; asOf?: string }): Promise<MarketResult> {
    const nowMs = (this.d.now ?? Date.now)();
    const live = !req.asOf && req.day === new Date(nowMs + 19800000).toISOString().slice(0, 10);
    const key = `${req.day}|${req.asOf ?? ''}`;
    const slot = live ? this.slotOf(nowMs) : 'final';
    const hit = this.cache.get(key);
    // a read made before the 9:15 scan existed has empty 9:15 counts: it is recomputed once the scan is there
    const zonesNow = Object.keys(this.d.zones(req.day)).length;
    if (hit && hit.slot === slot && (hit.z > 0 || zonesNow === 0)) return hit.v;
    const running = this.inflight.get(key);
    if (running) return running;
    const pk = `market|${key}`;
    this.d.progress?.start(pk, `Market read ${req.day}${req.asOf ? ' ' + req.asOf : ''}`, 'starting');
    const p = this.compute(req, live, pk).then(
      (v) => {
        // a read that could not load most stocks (a lapsed login, the rate limit) is not kept: the next request tries again instead of showing zeros until a refresh
        const failed = v.coverage.adUniverse > 0 && v.coverage.adStocks < v.coverage.adUniverse * 0.5;
        if (!failed) this.cache.set(key, { slot, v, z: Object.keys(this.d.zones(req.day)).length });
        this.d.progress?.end(pk);
        return v;
      },
      (e: Error) => {
        this.d.progress?.end(pk, e.message);
        throw e;
      },
    );
    this.inflight.set(key, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(key);
    }
  }

  private async compute(req: { day: string; asOf?: string }, live: boolean, pk = ''): Promise<MarketResult> {
    const pr = this.d.progress;
    const { day, asOf } = req;
    const book = this.d.book();
    const w = this.d.weights();
    const tokens = this.d.tokens();
    const zones = this.d.zones(day);
    const missing: string[] = [];
    const skipped: string[] = [];
    if (!book) throw new Error('Instruments are not loaded yet');
    // one cheap look first: a day with no NIFTY 50 candles (an NSE holiday, or before the open) has no market to read, and reading 220 stocks for it would only use up Kite's rate limit
    const ref = tokens['NIFTY 50'];
    if (ref) {
      const probe = await this.series(ref, false, day, asOf, live).catch(() => null);
      if (probe && !trimCandles(probe, day, asOf ?? null).length) throw new Error(`NSE has no candles for ${day}${asOf ? ` up to ${asOf}` : ''} (a holiday, or before the market opened)`);
    }
    if (!w || !w.nifty50.length) missing.push('index weights');
    const nifty = new Set(w?.nifty50 ?? []);
    const bank = new Set(w?.bank ?? []);
    const prevDay = previousTradingDay(day, this.d.holidays?.() ?? new Set());
    const stocks = foStockSymbols(book).filter((s) => tokens[s]);

    // advance / decline: every stock's 5-minute closes against its own ASO and BSO
    const diffs = this.d.strikeDiffs();
    pr?.phase(pk, 'advance / decline: each stock against its 9:15 levels', stocks.length);
    const adRaw = await pool(stocks, 4, async (name): Promise<AdStock | null> => {
      try {
        const cs = trimCandles(await this.series(tokens[name]!, false, day, asOf, live), day, asOf ?? null);
        if (!cs.length) return null;
        const lv = strikeDetails(cs[0]![1], getStrikeDiff(name, diffs).diff);
        return { name, inNifty50: nifty.has(name), inBank: bank.has(name), aso: lv.aso, bso: lv.bso, candles: cs.map((c) => ({ time: hm(c), close: c[4] })) };
      } catch {
        skipped.push(name);
        return null;
      }
    }, () => pr?.tick(pk));
    const adStocks = adRaw.filter((x): x is AdStock => x !== null);
    const ad = advanceDeclineScores(adStocks);
    // breadth of the 50: last price against the previous close (`_lxBreadth`), a stock with no price or no previous close is left out
    const breadth50 = { up: 0, dn: 0 };
    pr?.phase(pk, 'breadth of the NIFTY 50 (previous closes)', adStocks.filter((a) => a.inNifty50 && a.candles.length).length);
    const wts = this.d.weights()?.full;
    const upW = { nifty: 0, bank: 0 };
    const dnW = { nifty: 0, bank: 0 };
    const upD = (n: number | undefined): number => n ?? 0;
    await pool(adStocks.filter((a) => (a.inNifty50 || a.inBank) && a.candles.length), 4, async (a) => {
      const pc = await this.prevClose(tokens[a.name]!, prevDay).catch(() => undefined);
      const px = a.candles[a.candles.length - 1]!.close;
      if (!pc || !px) return;
      const dir = px > pc ? 1 : px < pc ? -1 : 0;
      if (a.inNifty50) {
        if (dir > 0) breadth50.up++;
        else if (dir < 0) breadth50.dn++;
        if (dir > 0) upW.nifty += upD(wts?.['NIFTY 50'][a.name]);
        else if (dir < 0) dnW.nifty += upD(wts?.['NIFTY 50'][a.name]);
      }
      if (a.inBank) {
        if (dir > 0) upW.bank += upD(wts?.['NIFTY BANK'][a.name]);
        else if (dir < 0) dnW.bank += upD(wts?.['NIFTY BANK'][a.name]);
      }
    }, () => pr?.tick(pk));
    const adCounts = advanceDeclineCounts(adStocks);
    const share = (u: number, dn: number): { up: number; dn: number } | null => (u + dn > 0 ? { up: Math.round((u / (u + dn)) * 100), dn: Math.round((dn / (u + dn)) * 100) } : null);
    const adWeighted = { nifty: wts ? share(upW.nifty, dnW.nifty) : null, bank: wts ? share(upW.bank, dnW.bank) : null };
    // 9:15 breakout by index
    const zs = this.d.zones(day);
    const bo = (members: Set<string>, w: Record<string, number> | undefined) => {
      let up = 0;
      let dn = 0;
      let wu = 0;
      let wd = 0;
      for (const [n, z] of Object.entries(zs)) {
        if (!members.has(n)) continue;
        if (z === 'AST' || z === 'ASO') {
          up++;
          wu += w?.[n] ?? 0;
        } else if (z === 'BST' || z === 'BSO') {
          dn++;
          wd += w?.[n] ?? 0;
        }
      }
      const tot = w ? Object.values(w).reduce((a, b) => a + b, 0) : 0;
      return { up, dn, wtUp: w && tot ? Math.round((wu / tot) * 100) : null, wtDn: w && tot ? Math.round((wd / tot) * 100) : null };
    };
    const allUp = Object.values(zs).filter((z) => z === 'AST' || z === 'ASO').length;
    const allDn = Object.values(zs).filter((z) => z === 'BST' || z === 'BSO').length;
    const breakout = { nifty: bo(nifty, wts?.['NIFTY 50']), bank: bo(bank, wts?.['NIFTY BANK']), all: { up: allUp, dn: allDn } };

    // futures trend: the remark of every 5-minute candle of every future against the previous day's candle (stocks, then the two index futures)
    const futNames = [...stocks, 'NIFTY 50', 'NIFTY BANK'];
    pr?.phase(pk, 'futures trend: each stock future against yesterday', futNames.length);
    const futRaw = await pool(futNames, 4, async (name): Promise<FutStock | null> => {
      try {
        const fut = nearestFuture(book, name, day);
        if (!fut) return null;
        const [p, curRaw] = await Promise.all([this.prevOf(fut.token, prevDay), this.series(fut.token, true, day, asOf, live)]);
        const cs = trimCandles(curRaw, day, asOf ?? null);
        if (!cs.length || !p) return null;
        const prev = { high: p[2], low: p[3], close: p[4], volume: p[5], oi: p[6] };
        return {
          name,
          inNifty50: nifty.has(name),
          inBank: bank.has(name),
          remarks: cs.map((c) => ({ time: hm(c), remark: remarkOfCandle({ open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5], oi: c[6] }, prev, fut.lotSize) })),
        };
      } catch {
        skipped.push(`${name} (futures)`);
        return null;
      }
    }, () => pr?.tick(pk));
    const futStocks = futRaw.filter((x): x is FutStock => x !== null);
    const ft = futuresTrendScores(futStocks);

    // 9:15 scores
    const z = (n: string): number => nineFifteenScoreOf(zones[n]);
    // component scores: the weighted instrument scores of the live top 10 of each index
    const top = w?.top10 ?? { 'NIFTY 50': {}, 'NIFTY BANK': {} };
    const compNames = [...new Set([...Object.keys(top['NIFTY 50']), ...Object.keys(top['NIFTY BANK'])])];
    const five = ['NIFTY 50', 'NIFTY BANK', 'RELIANCE', 'HDFCBANK', 'ICICIBANK'];
    const need = [...new Set([...compNames, ...five])];
    const scores: Record<string, ScoreResult | null> = {};
    pr?.phase(pk, 'instrument scores of the index heavyweights (option chains)', need.length);
    await pool(
      need,
      3,
      async (n) => {
        try {
          scores[n] = await this.d.score.load({ name: n, day, asOf });
        } catch {
          scores[n] = null;
        }
      },
      () => pr?.tick(pk),
    );
    pr?.phase(pk, 'combining the signals');
    const comp = (m: Record<string, number>): number => componentScore(Object.entries(m).filter(([n]) => scores[n]).map(([n, wt]) => ({ total: scores[n]!.score.total, weight: wt })));

    const parts: CompositeParts = {
      nine15: { all: all915Score(zones), nifty50: z('NIFTY 50'), bank: z('NIFTY BANK'), gift: z('GIFT NIFTY'), sensex: z('SENSEX'), reliance: z('RELIANCE'), hdfcbank: z('HDFCBANK') },
      ad: { all: ad.all, nifty50: ad.nifty, bank: ad.bank },
      fut: { all: ft.all, nifty50: ft.nifty, bank: ft.bank },
      oiObv: five.map((n) => cappedOiObv(scores[n]?.score.oi_obv)),
      maxPain: five.map((n) => scores[n]?.score.max_pain ?? 0),
      ivSkew: five.map((n) => scores[n]?.score.iv_skew ?? 0),
      component: { nifty50: comp(top['NIFTY 50']), bank: comp(top['NIFTY BANK']) },
    };
    const total = compositeScore(parts, this.d.includeLagging?.() ?? true);
    const lead = leadingScore(parts);

    // the market signal: NIFTY 50's price flags and VIX band, the two index futures and the 9:15 combo
    const n50 = scores['NIFTY 50'];
    let nifty50Trend: Parameters<typeof marketSignal>[0]['nifty'] = null;
    if (n50?.trend) {
      const t = n50.trend;
      nifty50Trend = { trends: t.trends, ltp: t.ltp, vixDDUpper: t.vixUpper ?? 0, vixDDLower: t.vixLower ?? 0 };
    }
    void makeTrend;
    const signal = marketSignal({
      score: total,
      n915: zones['NIFTY 50'],
      sx915: zones['SENSEX'],
      bn915: zones['NIFTY BANK'],
      nifty: nifty50Trend,
      n50Fut: n50?.score.futures_trend ?? 0,
      bnFut: scores['NIFTY BANK']?.score.futures_trend ?? 0,
      leadingScore: lead,
    });
    if (!n50) missing.push('NIFTY 50 score');
    return {
      day,
      asOf: asOf ?? null,
      score: total,
      leading: lead,
      signal,
      parts,
      adCounts,
      adWeighted,
      breakout,
      coverage: { adSample: ad.sample, adUniverse: stocks.length, adStocks: adStocks.length, futuresStocks: futStocks.length, zones: Object.keys(zones).length, components: compNames.filter((n) => scores[n]).length },
      skipped,
      missing,
      breadth50,
      weighted50: Object.entries(top['NIFTY 50']).map(([n, wt]) => ({ name: n, weight: wt, change: parseFloat(scores[n]?.trend?.change ?? '0') || 0 })),
    };
  }
}
