import type { InstrumentBook } from '../instruments/book.js';
import type { Tick } from './ticks.js';
import { imbalance, type OrderFlow } from '../engine/orderFlow.js';
import { nearestFuture } from './futures.js';

export interface OrderFlowDeps {
  book: () => InstrumentBook | undefined;
  tokens: () => Record<string, number>;
  /** subscribe a token on the ticker in full mode (a no-op when it already is) */
  subscribe: (token: number) => void;
  now?: () => number;
}

export interface OrderFlowRead extends OrderFlow {
  name: string;
  token: number;
  /** seconds since the tick that carried these totals */
  ageSec: number;
}

const INDEX_NAMES = new Set(['NIFTY 50', 'NIFTY BANK', 'NIFTY FIN SERVICE', 'NIFTY MID SELECT']);
const isMcx = (b: InstrumentBook, n: string): boolean => b.futures('MCX', n).length > 0;

/**
 * Live resting-order imbalance per name. Totals come from the ticker's full-mode packets and exist only for names subscribed in this session; an index uses its
 * futures contract (`_gtbTokenForName`). The first request for a name subscribes it, so it answers "not subscribed yet" until a tick arrives.
 */
export class OrderFlowService {
  private readonly last = new Map<number, { buy: number; sell: number; at: number }>();
  constructor(private readonly d: OrderFlowDeps) {}

  /** called with every tick batch from the ticker */
  record(ticks: Tick[], nowMs: number = (this.d.now ?? Date.now)()): void {
    for (const t of ticks) if (t.totalBuyQty != null && t.totalSellQty != null) this.last.set(t.token, { buy: t.totalBuyQty, sell: t.totalSellQty, at: nowMs });
  }

  /** the token whose order book stands for a name: the futures contract for an index or commodity, the spot token otherwise */
  tokenFor(name: string, day: string): { token: number; proxy: boolean } | null {
    const b = this.d.book();
    if (b && (INDEX_NAMES.has(name) || isMcx(b, name))) {
      const f = nearestFuture(b, name, day) ?? b.futures('MCX', name).find((x) => x.expiry >= day);
      if (f) return { token: f.token, proxy: INDEX_NAMES.has(name) };
    }
    const t = this.d.tokens()[name];
    return t ? { token: t, proxy: false } : null;
  }

  /** null when nothing has been received for the name (the first call also subscribes it) */
  read(name: string, day: string): OrderFlowRead | null {
    const t = this.tokenFor(name, day);
    if (!t) return null;
    const tick = this.last.get(t.token);
    if (!tick) {
      this.d.subscribe(t.token);
      return null;
    }
    const of = imbalance(tick.buy, tick.sell, t.proxy);
    return of ? { ...of, name, token: t.token, ageSec: Math.round(((this.d.now ?? Date.now)() - tick.at) / 1000) } : null;
  }
}
