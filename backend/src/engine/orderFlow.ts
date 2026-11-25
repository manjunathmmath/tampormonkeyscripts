/**
 * Live order-flow imbalance: port of `_gtbOrderFlowImbalance` (grootTradeBot.js). The one signal that reads the CURRENT resting order book: total buy against sell
 * quantity from the ticker's full-mode packet. Wide dead zone (+-15%) because the totals are noisy, cumulative-for-the-day figures. Live only; never back-tested.
 */
export const OF_THRESH = 0.15;

export interface OrderFlow {
  dir: 1 | 0 | -1;
  /** -1 (all sell) .. +1 (all buy) */
  imb: number;
  buy: number;
  sell: number;
  label: string;
  text: string;
}

/** `isIndexProxy`: an index has no order book of its own, so the flow is its futures contract's. */
export function imbalance(buy: number | null | undefined, sell: number | null | undefined, isIndexProxy: boolean): OrderFlow | null {
  if (buy == null || sell == null) return null;
  if (buy + sell === 0) return null;
  const imb = (buy - sell) / (buy + sell);
  const dir = imb > OF_THRESH ? 1 : imb < -OF_THRESH ? -1 : 0;
  const src = isIndexProxy ? ' (futures)' : '';
  return {
    dir,
    imb,
    buy,
    sell,
    label: (dir > 0 ? 'Buy-heavy order flow' : dir < 0 ? 'Sell-heavy order flow' : 'Order flow balanced') + src,
    text: `Live order flow${src}: buy ${buy.toLocaleString()} vs sell ${sell.toLocaleString()} (${imb >= 0 ? '+' : ''}${(imb * 100).toFixed(0)}%).`,
  };
}

/** `_gtbOrderFlowCheck`: whether the flow confirms the direction of a plan ('weak' = a sell side plan). */
export function orderFlowCheck(of: OrderFlow | null, direction: 'weak' | 'strong'): { ok: false; reason: string } | { ok: true; confirmed: boolean; text: string } {
  if (!of) return { ok: false, reason: 'WebSocket not connected' };
  const confirmed = direction === 'weak' ? of.dir < 0 : of.dir > 0;
  return { ok: true, confirmed, text: `${of.label} (${of.imb >= 0 ? '+' : ''}${(of.imb * 100).toFixed(0)}%)` };
}
