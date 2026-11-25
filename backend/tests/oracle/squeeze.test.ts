import { describe, it, expect } from 'vitest';
import { squeezeOracle, plain } from './oracle.js';
import { rng } from './rng.js';
import { analyseDays, episodesForDay, fuelBadge, fuelForDay, fuelStats, preSqueezeScore, shortCoveringSignal, stats, trailingStreak } from '../../src/engine/squeeze.js';
import { classifyFutures } from '../../src/engine/futures.js';
import type { FutCandle } from '../../src/engine/futures.js';

const REMARKS = ['SHORT', 'LONG', 'SHOT_COVERING', 'LONG_UNWINDING', 'NO_CLEAR_SIGNAL', 'BULLS_CONSOLIDATING', null];

describe('squeeze equals grootTradeBot.js', () => {
  const o = squeezeOracle();

  it('the live signal on random states', () => {
    const r = rng(31);
    for (let k = 0; k < 1500; k++) {
      const remark = r.pick(REMARKS) ?? undefined;
      const days = r.pick([null, 0, 1, 2, 3, 9]);
      const pcr = r.pick([null, r.range(0.3, 2)]);
      const chg = r.range(-2, 2);
      const ltp = r.range(100, 50000);
      const acc = r.pick([null, { hits: r.int(0, 30), total: r.int(1, 30), eodPts: r.range(-200, 200) }]);
      if (acc && acc.hits > acc.total) acc.hits = acc.total;
      o.ctx['INSTRUMENT_SCORE_MAP'] = { X: { futures_trend_remark: remark, oiData: pcr === null ? {} : { pcr: String(pcr) }, futAccMap: acc && remark ? { [remark]: acc } : {} } };
      o.ctx['__chg'] = String(chg);
      o.ctx['__ltp'] = String(ltp);
      o.ctx['__days'] = days;
      const old = plain<Record<string, unknown>>(o.call('_gtbShortCoveringSignal', 'X'));
      const mine = shortCoveringSignal({ remark, daysToExpiry: days, pcr: pcr === null ? null : parseFloat(String(pcr)), todayChgPct: parseFloat(String(chg)) || 0, ltp: parseFloat(String(ltp)) || 0, acc: remark ? acc : null });
      const m = plain<Record<string, unknown>>(mine);
      // the original leaves `acc` out of the result when there is no record and pcr as parsed; compare field by field
      expect(m['type'], `type ${k}`).toBe(old['type']);
      expect(m['active']).toBe(old['active']);
      expect(m['probability'], `prob ${k}`).toBe(old['probability']);
      expect(m['extremePositioning']).toBe(old['extremePositioning']);
      expect(m['nearExpiry']).toBe(old['nearExpiry']);
      expect(m['acc'] ?? null).toEqual(old['acc'] ?? null);
    }
  });

  it('the pre-squeeze score on random streaks', () => {
    const r = rng(32);
    for (let k = 0; k < 1500; k++) {
      const remark = r.pick(['SHORT', 'LONG'] as const);
      const streak = r.int(1, 9);
      const pcr = r.pick([null, r.range(0.3, 2)]);
      const days = r.pick([null, 0, 1, 2, 3, 5]);
      const acc = { hits: r.int(0, 30), total: r.int(0, 30) };
      if (acc.hits > acc.total) acc.hits = acc.total;
      const willBe = remark === 'SHORT' ? 'SHOT_COVERING' : 'LONG_UNWINDING';
      void willBe;
      const key = remark === 'SHORT' ? 'SHORT_COVERING' : 'LONG_UNWINDING';
      o.ctx['_GTB_SQUEEZE_STREAK'] = { X: { remark, streak } };
      o.ctx['INSTRUMENT_SCORE_MAP'] = { X: { oiData: pcr === null ? {} : { pcr: String(pcr) }, futAccMap: { [key]: acc } } };
      o.ctx['__days'] = days;
      const old = plain<{ score: number; willBe: string; pcrExtreme: boolean } | null>(o.call('_gtbPreSqueezeScore', 'X'));
      const mine = preSqueezeScore({ remark, streak }, pcr === null ? null : parseFloat(String(pcr)), days, (rm) => (rm === key ? acc : undefined));
      expect(mine?.score ?? null, `score ${k}`).toBe(old?.score ?? null);
      expect(mine?.willBe).toBe(old?.willBe);
      expect(mine?.pcrExtreme).toBe(old?.pcrExtreme);
    }
  });

  it('episodes, fuel streak statistics and percentiles on random remark days', () => {
    const r = rng(33);
    const fuelOld: unknown[] = [];
    const fuelMine = [] as ReturnType<typeof fuelForDay>[];
    for (let k = 0; k < 400; k++) {
      const n = r.int(25, 75);
      let px = r.range(100, 1000);
      const intr: FutCandle[] = Array.from({ length: n }, (_, i) => {
        const o1 = px;
        px *= 1 + r.range(-0.004, 0.004);
        return { date: `${String(9 + Math.floor((i * 5 + 15) / 60)).padStart(2, '0')}:${String((i * 5 + 15) % 60).padStart(2, '0')}`, open: o1, high: Math.max(o1, px) * 1.001, low: Math.min(o1, px) * 0.999, close: px, volume: r.int(100, 9000), oi: r.int(1000, 90000) };
      });
      const remarks = intr.map(() => r.pick(REMARKS));
      const old = plain<unknown[]>(o.call('_gtbSqzEpisodesForDay', plain(intr), remarks));
      expect(plain(episodesForDay(intr, remarks)), `episodes ${k}`).toEqual(old);
      fuelOld.push(o.call('_gtbSqzFuelForDay', remarks, 'SHORT', 'SHOT_COVERING'));
      fuelMine.push(fuelForDay(remarks, 'SHORT', 'SHOT_COVERING'));
      expect(plain(fuelMine[k])).toEqual(plain(fuelOld[k]));
    }
    expect(plain(fuelStats(fuelMine))).toEqual(plain(o.call('_gtbSqzFuelStats', fuelOld)));
    const xs = Array.from({ length: 37 }, () => r.range(-3, 5));
    expect(plain(stats(xs))).toEqual(plain(o.call('_gtbSqzStats', xs)));
  });

  it('the whole study with the real futures classifier matches the original', async () => {
    const r = rng(34);
    const mk = (date: string): { date: string; intr: FutCandle[] } => {
      let px = 24000;
      const intr: FutCandle[] = Array.from({ length: 75 }, (_, i) => {
        const o1 = px;
        px *= 1 + r.range(-0.003, 0.0035);
        return { date: `${String(9 + Math.floor((i * 5 + 15) / 60)).padStart(2, '0')}:${String((i * 5 + 15) % 60).padStart(2, '0')}`, open: o1, high: Math.max(o1, px) * 1.0006, low: Math.min(o1, px) * 0.9994, close: px, volume: r.int(1000, 90000), oi: 1_000_000 + r.int(-9000, 9000) * (i + 1) };
      });
      return { date, intr };
    };
    const days = Array.from({ length: 12 }, (_, i) => mk(`2026-10-${String(i + 1).padStart(2, '0')}`));
    const classify = (q: never, p: never, lot: number, up: FutCandle[], opts: { vix: number; baselineVix: number }) => classifyFutures(q, p, lot, up, opts);
    const mine = analyseDays(days, 75, 14, classify as never);
    o.ctx['_gtbClassifyFutures'] = undefined;
    const oldRes = await (o.call('_gtbSqzAnalyseDays', plain(days), 75, 14, (q: unknown, p: unknown, lot: number, up: unknown, opts: unknown) => classifyFutures(q as never, p as never, lot, up as never, opts as never)) as Promise<unknown>);
    expect(plain(mine)).toEqual(plain(oldRes));
    expect(mine.days).toBe(11);
  });

  it('streak and badge helpers', () => {
    expect(trailingStreak(['LONG', 'SHORT', 'SHORT', 'SHORT'])).toEqual({ remark: 'SHORT', streak: 3 });
    expect(trailingStreak(['SHORT', 'NO_CLEAR_SIGNAL'])).toBeNull();
    expect(fuelBadge(null, true).label).toBe('NO HISTORY');
    const base = { days: 5, episodes: 0, up: { n: 0, mfe: null, close: null, leg: null, dur: null }, down: { n: 0, mfe: null, close: null, leg: null, dur: null } };
    expect(fuelBadge({ ...base, fuel: { up: { trig: 3, days: 5 }, down: { trig: 0, days: 5 } } }, true).label).toBe('TOO FEW CASES');
    expect(fuelBadge({ ...base, fuel: { up: { trig: 20, days: 5, hitDay: 0.8, baseDay: 0.4, hitH: 0.3, baseH: 0.2, liftDay: 2, zDay: 3 }, down: { trig: 0, days: 5 } } }, true).label).toBe('HAS WORKED');
    expect(fuelBadge({ ...base, fuel: { up: { trig: 20, days: 5, hitDay: 0, baseDay: 0.4, hitH: 0, baseH: 0.2, liftDay: 0, zDay: -3 }, down: { trig: 0, days: 5 } } }, true).label).toBe('NO SIGNAL');
  });
});
