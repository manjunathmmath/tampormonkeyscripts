import { describe, it, expect } from 'vitest';
import { orderFlowOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { imbalance, orderFlowCheck } from '../../src/engine/orderFlow.js';

describe('order flow equals grootTradeBot.js', () => {
  const o = orderFlowOracle();
  it('imbalance, label, text and the confirmation check on 2,000 random books', () => {
    const r = rng(81);
    const dirs = new Set<number>();
    for (let k = 0; k < 2000; k++) {
      const proxy = r.chance(0.4);
      const buy = r.pick([null, 0, r.int(0, 9_000_000)]);
      const sell = r.pick([null, 0, r.int(0, 9_000_000)]);
      o.ctx['_DL_INDEX_NAME_TO_DISPLAY'] = proxy ? { NIFTY: 'X' } : {};
      o.ctx['_QW_LAST_TICK'] = { 7: buy === null && sell === null ? undefined : { totalBuyQty: buy, totalSellQty: sell } };
      const old = plain<Record<string, unknown> | null>(o.call('_gtbOrderFlowImbalance', 'X'));
      const mine = imbalance(buy, sell, proxy);
      expect(plain(mine), `case ${k}`).toEqual(old);
      if (mine) dirs.add(mine.dir);
      for (const direction of ['weak', 'strong'] as const) {
        expect(plain(orderFlowCheck(mine, direction)), `check ${k}`).toEqual(plain(o.call('_gtbOrderFlowCheck', 'X', direction)));
      }
    }
    expect([...dirs].sort()).toEqual([-1, 0, 1]);
  });
});
