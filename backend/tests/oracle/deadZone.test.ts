import { describe, it, expect } from 'vitest';
import { deadZoneOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { deadZone, deadZoneRaw, deadZoneText, type DzLatch } from '../../src/engine/deadZone.js';

const iso = (min: number): string => `2026-11-20T${String(9 + Math.floor((15 + min) / 60)).padStart(2, '0')}:${String((15 + min) % 60).padStart(2, '0')}:00+0530`;

describe('dead zone: the port equals the original', () => {
  const o = deadZoneOracle();
  const origLatch = o.ctx['_GTB_DZ_LATCH'] as Record<string, unknown>;
  it('on 4,000 random steps (bands, walls, release latch, re-arm, forming candle, text)', () => {
    const r = rng(4242);
    let myLatch: DzLatch = {};
    let sawBroken = 0;
    let sawRearm = 0;
    let wasBroken = false;
    for (let k = 0; k < 4000; k++) {
      // a short day that grows candle by candle, so the latch carries over between calls
      if (k % 40 === 0) {
        Object.keys(origLatch).forEach((x) => delete origLatch[x]);
        myLatch = {};
        wasBroken = false;
      }
      const step = k % 40;
      const base = 24000;
      const total = r.pick([null, 0, 1.5, -2.9, 3, -4, 2.2]);
      o.ctx['__cs'] = total === null ? null : { total };
      const sup = r.pick([null, 23900, 23950, 23800]);
      const res = r.pick([null, 24100, 24060, 24300]);
      o.ctx['__walls'] = { support: sup === null ? [] : [{ strike: sup }], resistance: res === null ? [] : [{ strike: res }] };
      const bso = r.pick([undefined, 23950, 23975]);
      const aso = r.pick([undefined, 24050, 24025]);
      o.ctx['__trend'] = bso === undefined || aso === undefined ? null : { ltp: base, strikeData: { bstrikeOne: String(bso), ustrikeOne: String(aso) } };
      const candles: (string | number)[][] = [];
      let p = base;
      for (let i = 0; i <= step; i++) {
        p += r.range(-40, 40);
        candles.push([iso(i * 5), p, p + 5, p - 5, p, 0]);
      }
      const nowMs = Date.parse(iso(step * 5)) + (r.chance(0.5) ? 90_000 : 400_000);
      o.ctx['__now'] = nowMs;
      (o.ctx['INSTRUMENT_SCORE_MAP'] as Record<string, unknown>)['X'] = { oiData: { tableData: [], spotCandles: candles } };

      const inp = { scoreTotal: total, supportWall: sup, resistanceWall: res, bso: bso ?? null, aso: aso ?? null, candles, nowMs, key: 'X|D|' };
      const old = plain(o.call('_gtbDeadZoneRaw', 'X'));
      const mine = deadZoneRaw(inp, myLatch);
      expect(plain(mine), `step ${k}`).toEqual(old);
      expect(plain(deadZone(inp, myLatch))).toEqual(plain(o.call('_gtbDeadZone', 'X')));
      if (mine?.broken) {
        sawBroken++;
        wasBroken = true;
      } else if (wasBroken && mine) {
        sawRearm++;
        wasBroken = false;
      }
      if (mine) {
        const spot = r.pick([0, mine.lo - 30, mine.hi + 30, (mine.lo + mine.hi) / 2, mine.lo + 5]);
        o.ctx['__trend'] = { ltp: String(spot), strikeData: { bstrikeOne: '1', ustrikeOne: '2' } };
        expect(deadZoneText('NIFTY 50', mine, spot || null)).toBe(o.call('_gtbDeadZoneText', 'NIFTY 50', mine));
      }
    }
    expect(sawBroken).toBeGreaterThan(50);
    expect(sawRearm).toBeGreaterThan(3);
  });
});
