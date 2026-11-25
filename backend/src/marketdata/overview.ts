import { scoreboard, type Scoreboard } from '../engine/scoreboard.js';
import type { AccMap } from '../engine/futAccuracy.js';
import type { FuturesResult } from './futures.js';
import type { MarketResult } from './market.js';
import type { ScoreResult } from './score.js';

type Req = { name: string; day: string; asOf?: string };

export interface OverviewDeps {
  market: { load(r: { day: string; asOf?: string }): Promise<MarketResult> };
  futures: { load(r: Req): Promise<FuturesResult> };
  futAcc: { load(r: Req): Promise<AccMap> };
  score: { load(r: Req): Promise<ScoreResult> };
  isMcx: (name: string) => boolean;
  /** the last price of a commodity (its futures contract) */
  commodityLtp: (r: Req) => Promise<number | null>;
  includeLagging: () => boolean;
}

export interface StripRow {
  name: string;
  remark: string | null;
  dir: number;
  vwap: number | null;
  fut: number | null;
  spot: number | null;
  /** futures minus spot, in points and percent of spot */
  premium: number | null;
  premiumPct: number | null;
}

export interface AccRow {
  remark: string;
  samples: number;
  winRate: number;
  avgPts: number;
}

export interface Overview {
  day: string;
  asOf: string | null;
  market: { score: number; leading: number; signal: string; reason: string; includeLagging: boolean; breadth50: { up: number; dn: number }; adCounts: MarketResult['adCounts']; adWeighted: MarketResult['adWeighted']; breakout: MarketResult['breakout']; coverage: MarketResult['coverage']; skipped: number };
  scoreboard: Scoreboard;
  strip: StripRow[];
  accuracy: { rows: AccRow[]; names: string[] };
}

const STRIP = ['NIFTY 50', 'NIFTY BANK', 'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'CRUDEOILM'];
const ACC = ['NIFTY 50', 'NIFTY BANK', 'RELIANCE', 'HDFCBANK', 'ICICIBANK'];
const r2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * The market-wide dashboard numbers: the composite score with its Range Scoreboard groups, the futures strip (remark, VWAP and premium over spot) and the futures
 * remark accuracy over the five names the old dashboard replays. Each piece is read on its own, so one failing name leaves the others in place.
 */
export class OverviewService {
  constructor(private readonly d: OverviewDeps) {}

  async load(req: { day: string; asOf?: string }): Promise<Overview> {
    const [mk, strip, acc] = await Promise.all([this.d.market.load(req), Promise.all(STRIP.map((n) => this.row({ ...req, name: n }))), this.accuracy(req)]);
    return {
      day: req.day,
      asOf: req.asOf ?? null,
      market: { score: mk.score, leading: mk.leading, signal: mk.signal.signal, reason: mk.signal.reason, includeLagging: this.d.includeLagging(), breadth50: mk.breadth50, adCounts: mk.adCounts, adWeighted: mk.adWeighted, breakout: mk.breakout, coverage: mk.coverage, skipped: mk.skipped?.length ?? 0 },
      scoreboard: scoreboard(mk.parts),
      strip,
      accuracy: acc,
    };
  }

  private async row(r: Req): Promise<StripRow> {
    const empty: StripRow = { name: r.name, remark: null, dir: 0, vwap: null, fut: null, spot: null, premium: null, premiumPct: null };
    try {
      const f = await this.d.futures.load(r);
      const spot = this.d.isMcx(r.name) ? await this.d.commodityLtp(r) : (await this.d.score.load(r).catch(() => null))?.trend?.ltp ?? null;
      const fut = f.quote.close;
      return {
        name: r.name,
        remark: f.remark,
        dir: f.dir,
        vwap: f.vwapPrice || null,
        fut,
        spot,
        premium: spot ? r2(fut - spot) : null,
        premiumPct: spot ? r2(((fut - spot) / spot) * 100) : null,
      };
    } catch {
      return empty;
    }
  }

  private async accuracy(req: { day: string; asOf?: string }): Promise<Overview['accuracy']> {
    const tot = new Map<string, { hits: number; total: number; pts: number }>();
    const used: string[] = [];
    for (const n of ACC) {
      try {
        const m = await this.d.futAcc.load({ ...req, name: n });
        used.push(n);
        for (const [k, v] of Object.entries(m)) {
          const t = tot.get(k) ?? { hits: 0, total: 0, pts: 0 };
          t.hits += v.hits;
          t.total += v.total;
          t.pts += v.pts;
          tot.set(k, t);
        }
      } catch {
        /* a name that cannot be replayed is left out */
      }
    }
    const rows = [...tot.entries()]
      .filter(([, t]) => t.total > 0)
      .map(([remark, t]) => ({ remark, samples: t.total, winRate: Math.round((t.hits / t.total) * 100), avgPts: r2(t.pts / t.total) }))
      .sort((a, b) => b.samples - a.samples);
    return { rows, names: used };
  }
}
