import type { Candle } from '../kite/client.js';
import { components, label, niftyMomentum, outcome } from '../engine/fearGreed.js';

type Req = { day: string; asOf?: string };

export interface FearGreedDeps {
  market: { load(r: Req): Promise<{ parts: { ad: { all: number } }; coverage: { adSample: number; adUniverse: number } }> };
  indiaVix: (r: Req) => Promise<number>;
  history: { candles(q: { token: number; interval: 'day'; from: string; to: string }): Promise<Candle[]> };
  tokens: () => Record<string, number>;
}

const shift = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Fear & Greed from the market's breadth, India VIX and NIFTY 50's distance from its 20-day average. */
export class FearGreedService {
  constructor(private readonly d: FearGreedDeps) {}

  async load(r: Req) {
    const m = await this.d.market.load(r);
    const vix = await this.d.indiaVix(r).catch(() => 0);
    let momentum: number | null = null;
    const t = this.d.tokens()['NIFTY 50'];
    if (t) {
      try {
        const cs = await this.d.history.candles({ token: t, interval: 'day', from: shift(r.day, -35), to: r.day });
        momentum = niftyMomentum(cs.filter((c) => String(c[0]).slice(0, 10) <= r.day).map((c) => Number(c[4])));
      } catch {
        momentum = null;
      }
    }
    const c = components({ breadth: m.parts.ad.all, sample: m.coverage.adSample, universe: m.coverage.adUniverse, vix, momentum });
    return { score: c.composite, ...label(c.composite), parts: c.parts, outcome: outcome(c.composite) };
  }
}
