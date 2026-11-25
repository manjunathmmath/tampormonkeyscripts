import type { Candle } from '../kite/client.js';
import { findWalls, type OiRow } from '../engine/oi.js';
import { lxCompute, lxGate, type LxCandle, type LxInputs, type LxResult, type LxSnap } from '../engine/liveContext.js';
import { tradeSignal } from '../engine/marketSignal.js';
import type { FuturesResult } from './futures.js';
import type { MarketResult } from './market.js';
import type { OiAnalysis } from './oi.js';
import type { ScoreResult } from './score.js';
import { trimCandles } from './history.js';

type Req = { name: string; day: string; asOf?: string };

export interface LiveContextDeps {
  score: { load(r: Req): Promise<ScoreResult> };
  oi: { chainRaw(r: Req): Promise<{ rows: OiRow[]; spotCandles: Candle[] }>; analyse(r: Req): Promise<OiAnalysis> };
  futures: { load(r: Req): Promise<FuturesResult> };
  market: { load(r: { day: string; asOf?: string }): Promise<MarketResult> };
  now?: () => number;
}

export interface LiveContextView extends LxResult {
  day: string;
  asOf: string | null;
  /** the checks that need data this backend does not have yet; they are simply absent from the list */
  unavailable: string[];
}

const toCandles = (cs: Candle[]): LxCandle[] =>
  cs
    .map((k) => ({ t: String(k[0]).slice(11, 16), o: k[1], h: k[2], l: k[3], c: k[4] }))
    .filter((k) => [k.o, k.h, k.l, k.c].every(Number.isFinite));

/**
 * Live Context of an index: is the morning view still valid? Price checks come from today's candles; the futures window needs snapshots taken over the last
 * hour, so it fills in as the backend is asked repeatedly. Breadth (the 50 stocks against their previous close, compared with an hour ago once snapshots exist) and GIFT NIFTY since its open are built from the market read and the GIFT NIFTY score.
 */
export class LiveContextService {
  private hist: { key: string; snaps: LxSnap[] } = { key: '', snaps: [] };
  constructor(private readonly d: LiveContextDeps) {}

  private async inputs(req: Req, forcedDir?: number | null): Promise<LxInputs | null> {
    const { name, day, asOf } = req;
    const nowMs = (this.d.now ?? Date.now)();
    const score = await this.d.score.load(req);
    const tr = score.trend;
    if (!tr) return null;
    const raw = await this.d.oi.chainRaw(req).catch(() => ({ rows: [] as OiRow[], spotCandles: [] as Candle[] }));
    const candles = toCandles(trimCandles(raw.spotCandles, day, asOf ?? null));
    if (candles.length < 3) return null;
    const fut = await this.d.futures.load(req).catch(() => null);
    let spot = 0;
    for (const r of raw.rows) if (r.ATM_STRIKE) spot = parseFloat(String(r.STRIKE)) || 0;
    const walls = raw.rows.length ? findWalls(raw.rows, 0, spot) : null;

    // OI/OBV last hour (NIFTY 50): the chain scored at the last candle and an hour earlier
    let oi: LxInputs['oi'] = null;
    const lastT = candles[candles.length - 1]!.t;
    const mins = (h: string): number => parseInt(h.slice(0, 2), 10) * 60 + parseInt(h.slice(3, 5), 10);
    if (name === 'NIFTY 50' && mins(lastT) - mins(candles[0]!.t) >= 60) {
      const m = Math.max(0, mins(lastT) - 60);
      const thenT = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      try {
        const [a, b] = await Promise.all([this.d.oi.analyse({ ...req, asOf: lastT }), this.d.oi.analyse({ ...req, asOf: thenT })]);
        oi = { now: a.oiScore, then: b.oiScore, nowT: lastT, thenT };
      } catch {
        oi = null;
      }
    }
    // heavyweights: the top-10 weights x their change, for NIFTY 50
    let heavy: number | null = null;
    if (name === 'NIFTY 50') {
      const mk = await this.d.market.load({ day, asOf }).catch(() => null);
      if (mk && mk.weighted50.length >= 5) heavy = mk.weighted50.reduce((s, w) => s + (w.weight * w.change) / 100, 0);
    }
    const mk2 = await this.d.market.load({ day, asOf }).catch(() => null);
    const [n, s, b] = await Promise.all(['NIFTY 50', 'SENSEX', 'NIFTY BANK'].map((nm) => this.d.score.load({ ...req, name: nm }).then((r) => r.zone).catch(() => null)));
    const strat = n || s || b ? tradeSignal(n ?? undefined, s ?? undefined, b ?? undefined).outcome : null;

    // snapshots are only taken for a live day and kept for the day
    const key = `${name}|${day}`;
    if (this.hist.key !== key) this.hist = { key, snaps: [] };
    const live = !asOf && day === new Date(nowMs + 19800000).toISOString().slice(0, 10);
    const last = this.hist.snaps[this.hist.snaps.length - 1];
    const breadth = mk2?.breadth50 ?? { up: 0, dn: 0 };
    // GIFT NIFTY since its open (`ctx.gift`): its last price against its day open, left out when either is missing
    let gift: number | null = null;
    try {
      const g = (await this.d.score.load({ ...req, name: 'GIFT NIFTY' })).trend;
      if (g && g.ltp && g.open) gift = ((g.ltp - g.open) / g.open) * 100;
    } catch {
      gift = null;
    }
    const snap: LxSnap = { m: lastT, t: nowMs, px: tr.ltp, f: fut?.quote.close ?? 0, oi: fut?.quote.oi ?? 0, up: breadth.up, dn: breadth.dn };
    if (live && (!last || nowMs - last.t >= 4 * 60000)) this.hist.snaps.push(snap);

    return {
      name,
      candles,
      px: tr.ltp,
      open: candles[0]!.o,
      prev: tr.prevPrice,
      fut: fut ? { ltp: fut.quote.close, vwap: fut.vwapPrice, oi: fut.quote.oi ?? 0 } : null,
      hist: this.hist.snaps.filter((x) => x !== snap),
      nowMs,
      levels: tr.levels,
      walls,
      oi,
      breadth,
      gift,
      heavy,
      forcedDir,
      compositeScore: mk2?.score ?? null,
      strat,
    };
  }

  async read(req: Req, forcedDir?: number | null): Promise<LiveContextView | null> {
    const i = await this.inputs(req, forcedDir);
    const r = i ? lxCompute(i) : null;
    return r ? { ...r, day: req.day, asOf: req.asOf ?? null, unavailable: [] } : null;
  }

  /** the price-confirmation gate used by the Predict card: only the price checks count */
  async gate(req: Req, dir: number): Promise<ReturnType<typeof lxGate>> {
    const i = await this.inputs(req, dir);
    return i ? lxGate(i, dir) : null;
  }
}
