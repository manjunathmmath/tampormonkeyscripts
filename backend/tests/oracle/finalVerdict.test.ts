import { describe, it, expect } from 'vitest';
import { finalVerdictOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { applyLiveContext, finalVerdictCore, type FvConsensus } from '../../src/engine/finalVerdict.js';
import type { Decision } from '../../src/engine/levelDecision.js';

describe('Final Verdict: the port equals the original _gtbFinalVerdictCore', () => {
  const o = finalVerdictOracle();

  const cons = (r: ReturnType<typeof rng>): FvConsensus => {
    const outcome = r.pick(['GO LONG', 'GO SHORT', 'WAIT', 'WAIT — No Data']);
    const dz = r.pick([null, null, { lo: 23950, hi: 24050, loName: 'put wall', hiName: 'call wall' }]);
    const broken = r.pick([null, null, { lo: 23950, hi: 24050, broken: { dir: r.pick(['up', 'down'] as const), at: '10:25' } }]);
    return { outcome, net: r.range(-1, 1), agree: r.int(0, 6), voting: r.int(0, 6), thin: r.chance(0.2), dzConflict: r.chance(0.15), deadZone: dz, deadZoneBroken: broken };
  };
  const dec = (r: ReturnType<typeof rng>, side: string): Decision | null => {
    if (r.chance(0.15)) return null;
    const buy = side === 'support';
    const action = r.pick(['SKIP', 'AT_LEVEL', 'WAIT', 'TREND'] as const);
    const title = r.pick([
      `DON'T ${buy ? 'BUY' : 'SELL'} — the level has broken`,
      `NO ${buy ? 'BUY' : 'SELL'} NOW — plan is to ${buy ? 'buy' : 'sell'} at ${buy ? 'BSO' : 'ASO'} 24,050; price is 80 pts ${buy ? 'above' : 'below'} it and has not reached it`,
      `DON'T CHASE — confirmed, but no nearby ${buy ? 'support' : 'resistance'} to enter on`,
      `${buy ? 'BUY' : 'SELL'} NOW — price is at ${buy ? 'BSO' : 'ASO'} 24050`,
      `TREND ENTRY — ${buy ? 'buy' : 'sell'} a ${buy ? 'dip' : 'rally'} to 24,010, not at market`,
      `WAIT for ${buy ? 'BSO' : 'ASO'} 24050 — then ${buy ? 'buy' : 'sell'}`,
    ]);
    return {
      action,
      title,
      why: ['first reason', 'second reason', 'last reason'],
      plan: action === 'TREND' && r.chance(0.7) ? { entry: 24010, stop: 23990, validUntil: '11:00' } : null,
      spot: 24000,
      level: 24050,
      awaySteps: 1,
      atMiss: action === 'AT_LEVEL' && r.chance(0.5) ? ['only 5/10 checks agree', 'futures not bullish'] : [],
    };
  };

  it('on 5,000 random states (guard, dead zone, no direction, no plan, counter-plan, every Level Decision outcome)', () => {
    const r = rng(60606);
    const heads = new Set<string>();
    for (let k = 0; k < 5000; k++) {
      const nm = r.pick(['NIFTY 50', 'NIFTY BANK']);
      const c50 = cons(r);
      const cbk = cons(r);
      const cn = nm === 'NIFTY 50' ? c50 : cbk; // this index
      const cb = nm === 'NIFTY 50' ? cbk : c50; // its partner
      const sig = r.pick([null, 'NO TRADE', 'BUY', 'SELL', 'WAIT', 'STRONG BUY']);
      const score = r.pick([null, 5.5, -6.2]);
      const strat = r.pick([null, { outcome: 'Buy', level: 'at BSO/BST' }, { outcome: 'Sell', level: 'at ASO/AST' }, { outcome: 'Buy/Sell', level: 'both' }, { outcome: 'Sideways', level: 'No trade' }]);
      const decS = dec(r, 'support');
      const decR = dec(r, 'resistance');
      const hu = r.pick([null, 'NIFTY short covering is active']);
      const spot = r.pick([0, 24020, 23990]);
      const aso = r.pick([null, 24050]);
      const bso = r.pick([null, 23950]);

      o.ctx['__cn'] = plain(c50);
      o.ctx['__cb'] = plain(cbk);
      Object.assign(o.ctx, { __hl: { ms: sig ? { signal: sig, reason: 'guard reason' } : null, score }, __dec: { support: decS, resistance: decR }, __huText: hu, __spot: spot });
      (o.ctx['window'] as { _GTB_LC: unknown })._GTB_LC = strat ? { strat } : {};
      (o.ctx['__store'] as Record<string, string>)['VALID_BREAKOUT_NINE_FIFTEEN'] = JSON.stringify({ [nm]: { ...(aso ? { aso } : {}), ...(bso ? { bso } : {}) } });

      const old = plain<Record<string, unknown> | null>(o.call('_gtbFinalVerdictCore', nm));
      const mine = plain<Record<string, unknown>>(
        finalVerdictCore({
          name: nm,
          consensus: cn,
          partner: cb,
          signal: sig ? { signal: sig, reason: 'guard reason' } : null,
          score,
          strat,
          decisionFor: (side) => (side === 'support' ? decS : decR),
          spot: spot || null,
          aso,
          bso,
          squeezeHeadsUp: () => hu,
        }),
      );
      const strip = (d: Record<string, unknown> | null): unknown => (d ? Object.fromEntries(Object.entries(d).filter(([kk]) => kk !== 'col')) : d);
      expect(strip(mine), `case ${k}`).toEqual(strip(old));
      heads.add(String(mine['headline']).replace(/[\d,]+/g, '#').slice(0, 28));
    }
    expect(heads.size).toBeGreaterThan(12);
  });

  it('the Live Context step: STALE turns a call into WAIT, WEAKENING lowers the confidence', () => {
    const o2 = finalVerdictOracle();
    const r = rng(9);
    for (let k = 0; k < 600; k++) {
      const call = r.pick(['LONG', 'SHORT', 'WAIT', 'NO TRADE']);
      const conf = r.pick([null, 'LOW', 'MEDIUM', 'HIGH']);
      const lx = r.pick([null, { status: 'STALE', against: 3, agree: 1 }, { status: 'WEAKENING', against: 2, agree: 2 }, { status: 'VALID', against: 0, agree: 4 }]);
      const v = { call, headline: 'H', action: 'A', conf, why: [], warn: [], consensus: {}, dir: call === 'LONG' ? 1 : call === 'SHORT' ? -1 : 0, col: 'x' };
      o2.ctx['_gtbFinalVerdictCore'] = () => plain(v);
      o2.ctx['_lxCompute'] = () => lx;
      const old = plain<Record<string, unknown>>(o2.call('_gtbFinalVerdict', 'NIFTY 50'));
      const mine = plain<Record<string, unknown>>(applyLiveContext(plain(v) as never, lx));
      for (const key of ['call', 'headline', 'action', 'conf', 'warn']) expect(mine[key], `${key} ${k}`).toEqual(old[key]);
    }
  });
});
