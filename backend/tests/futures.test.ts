import { describe, it, expect } from 'vitest';
import { classifyFutures, computeFuturesSignals, computeIntradayVwap, futuresTrendScore, remarkFromSignals, type FutCandle } from '../src/engine/futures.js';
import { FuturesService, nearestFuture } from '../src/marketdata/futures.js';
import { InstrumentBook, parseInstrumentsCsv } from '../src/instruments/book.js';
import type { Candle } from '../src/kite/client.js';

const fc = (close: number, volume: number, oi?: number): FutCandle => ({ date: '09:15', open: close, high: close + 0.5, low: close - 0.5, close, volume, oi });
const quoteOf = (cs: FutCandle[]) => ({ high: Math.max(...cs.map((c) => c.high)), low: Math.min(...cs.map((c) => c.low)), close: cs[cs.length - 1]!.close, volume: cs.reduce((s, c) => s + c.volume, 0), oi: cs[cs.length - 1]!.oi });

describe('VWAP', () => {
  it('weights the typical price by volume, rounds to 2 decimals, and is 0 without volume', () => {
    expect(computeIntradayVwap([fc(100, 100), fc(110, 300)])).toBe(107.5);
    expect(computeIntradayVwap([fc(100, 0)])).toBe(0);
    expect(computeIntradayVwap([])).toBe(0);
  });
});

describe('futures remark (cases from the userscript notes)', () => {
  it('real intraday covering reads SHOT_COVERING even when OI is up against yesterday', () => {
    // price rising above VWAP; OI +3% vs yesterday but -1.5% since the day opened
    const cs = [100, 101, 102, 103, 104, 105].map((p, i) => fc(p, 100, i === 0 ? 1000 : i === 5 ? 985 : 995));
    const r = classifyFutures(quoteOf(cs), { high: 99, low: 99, close: 99, volume: 1000, oi: 956 }, 1, cs);
    expect(r.signals.price).toBe('+');
    expect(r.signals.intradayOiPct).toBeCloseTo(-1.5, 6);
    expect(r.signals.oi).toBe('-');
    expect(r.signals.shortCoveringOrLongUnwinding).toBe(true);
    expect(r.remark).toBe('SHOT_COVERING');
    expect(r.dir).toBe(1);
  });
  it('a dip inside strength (above VWAP) is not "shorts building"', () => {
    const cs = [fc(100, 10000, 1000), fc(110, 100), fc(109, 100), fc(108, 100), fc(107, 100), fc(106, 100, 1020)];
    const r = classifyFutures(quoteOf(cs), { high: 100, low: 100, close: 100, volume: 1000, oi: 1000 }, 1, cs);
    expect(r.signals).toMatchObject({ aboveVwap: true, recentBearish: true, price: '+-', oi: '+' });
    expect(r.remark).toBe('CAUTION_WRITES_ERODING_PREMIUM');
    expect(r.remark).not.toBe('SHORT');
  });
  it('price below VWAP and falling with OI building is SHORT (fresh shorts)', () => {
    const cs = [fc(120, 10000, 1000), fc(110, 100), fc(109, 100), fc(108, 100), fc(107, 100), fc(106, 100, 1020)];
    const r = classifyFutures(quoteOf(cs), { high: 120, low: 120, close: 120, volume: 1000, oi: 1000 }, 1, cs);
    expect(r.signals).toMatchObject({ aboveVwap: false, price: '-', oi: '+' });
    expect(r.remark).toBe('SHORT');
    expect(r.dir).toBe(-1);
  });
  it('without intraday OI it falls back to the day-over-day change', () => {
    const cs = [100, 101, 102, 103, 104, 105].map((p) => fc(p, 100)); // no OI on the candles
    const q = { ...quoteOf(cs), oi: 103 };
    const r = classifyFutures(q, { high: 99, low: 99, close: 99, volume: 1000, oi: 100 }, 1, cs);
    expect(r.signals.intradayOiPct).toBeNull();
    expect(r.signals.oi).toBe('+');
    expect(r.remark).toBe('LONG');
  });
  it('an unclear read is NO_CLEAR_SIGNAL with score 0 (flat price, flat OI)', () => {
    const cs = [100, 100, 100, 100, 100, 100].map((p, i) => fc(p, 100, 1000));
    const r = classifyFutures(quoteOf(cs), { high: 100, low: 100, close: 100, volume: 1000, oi: 1000 }, 1, cs);
    expect(r.remark).toBe('NO_CLEAR_SIGNAL');
    expect(r.dir).toBe(0);
  });
  it('a high India VIX widens the thresholds', () => {
    const cs = [100, 100, 100, 100, 100, 100].map((p, i) => fc(p, 100, i === 5 ? 1008 : 1000)); // OI +0.8% today
    const prev = { high: 100, low: 100, close: 100, volume: 1000, oi: 1000 };
    expect(classifyFutures(quoteOf(cs), prev, 1, cs, { vix: 13, baselineVix: 13 }).signals.oi).toBe('+'); // 0.8 >= 0.5
    const wide = classifyFutures(quoteOf(cs), prev, 1, cs, { vix: 26, baselineVix: 13 });
    expect(wide.signals.volScale).toBe(2);
    expect(wide.signals.oi).toBe('+-'); // 0.8 < 1.0
    expect(computeFuturesSignals(cs, 100, 100, 0, '0', '0', { vix: 100, baselineVix: 13 }).volScale).toBe(2.5); // capped
    expect(computeFuturesSignals(cs, 100, 100, 0, '0', '0', { vix: 1, baselineVix: 13 }).volScale).toBe(0.6); // floored
  });
});

describe('remark table and score', () => {
  const sig = (price: '+' | '-' | '+-', oi: '+' | '-' | '+-', sc = false, av = true) => ({ price, oi, shortCoveringOrLongUnwinding: sc, aboveVwap: av });
  it('maps price / OI combinations', () => {
    expect(remarkFromSignals(sig('+', '+'), 0)).toBe('LONG');
    expect(remarkFromSignals(sig('-', '+'), 0)).toBe('SHORT');
    expect(remarkFromSignals(sig('+', '-', true), 0)).toBe('SHOT_COVERING');
    expect(remarkFromSignals(sig('-', '-', true), 0)).toBe('LONG_UNWINDING');
    expect(remarkFromSignals(sig('-', '-', false), 0)).toBe('BEARS_COMING_SELL_ON_RISE');
    expect(remarkFromSignals(sig('+-', '+', false, true), 12)).toBe('GAMBLING_BUY_NEWS_AND_EVENTS');
    expect(remarkFromSignals(sig('+-', '+', false, true), 3)).toBe('CAUTION_WRITES_ERODING_PREMIUM');
    expect(remarkFromSignals(sig('+', '+-'), 0)).toBe('BULLS_CONSOLIDATING');
    expect(remarkFromSignals(sig('-', '+-'), 0)).toBe('BEARS_CONSOLIDATING');
    expect(remarkFromSignals(sig('+-', '+', false, false), 0)).toBe('NO_CLEAR_SIGNAL'); // rising OI below VWAP, price mixed
    expect(remarkFromSignals(sig('+', '-', false), 0)).toBe('NO_CLEAR_SIGNAL'); // OI falling but not covering
  });
  it('scores the names the userscript way (covering is bullish, unwinding is bearish)', () => {
    expect(['LONG', 'SHOT_COVERING', 'BULLS_CONSOLIDATING', 'GAMBLING_BUY_NEWS_AND_EVENTS', 'DEFENCE_BUY_ON_DECLINE'].map(futuresTrendScore)).toEqual([1, 1, 1, 1, 1]);
    expect(['SHORT', 'LONG_UNWINDING', 'BEARS_COMING_SELL_ON_RISE', 'BEARS_CONSOLIDATING', 'CAUTION_WRITES_ERODING_PREMIUM'].map(futuresTrendScore)).toEqual([-1, -1, -1, -1, -1]);
    expect([futuresTrendScore('NO_CLEAR_SIGNAL'), futuresTrendScore('anything else')]).toEqual([0, 0]);
  });
});

describe('futures service', () => {
  const D = '2026-11-20';
  const CSV = [
    'instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange',
    '9001,1,NIFTY26NOVFUT,"NIFTY",0,2026-11-19,0,0.05,75,FUT,NFO-FUT,NFO', // already expired
    '9002,2,NIFTY26DECFUT,"NIFTY",0,2026-12-29,0,0.05,75,FUT,NFO-FUT,NFO',
    '9003,3,NIFTY27JANFUT,"NIFTY",0,2027-01-26,0,0.05,75,FUT,NFO-FUT,NFO',
    '9101,4,SENSEX26NOVFUT,"SENSEX",0,2026-11-27,0,0.05,20,FUT,BFO-FUT,BFO',
  ].join('\n');
  const book = new InstrumentBook(parseInstrumentsCsv(CSV), D);
  const row = (hm: string, c: number, v: number, oi: number): Candle => [`${D}T${hm}:00+0530`, c, c + 0.5, c - 0.5, c, v, oi];
  const mk = (cur: Candle[]) => {
    const calls: string[] = [];
    return {
      calls,
      svc: new FuturesService({
        book: () => book,
        tokens: () => ({ 'INDIA VIX': 264969 }),
        now: () => Date.parse(`${D}T09:41:00+05:30`),
        history: {
          candles: async (q) => {
            calls.push(`${q.token}:${q.interval}`);
            if (q.token === 264969) return [[`${D}T09:15:00+0530`, 13, 13, 13, 13, 0] as Candle];
            if (q.interval === 'day') return [['2026-11-19T00:00:00+0530', 99, 99, 99, 99, 1000, 956] as Candle];
            return cur;
          },
        },
      }),
    };
  };
  const cur = [row('09:15', 100, 100, 1000), row('09:20', 101, 100, 995), row('09:25', 102, 100, 995), row('09:30', 103, 100, 995), row('09:35', 104, 100, 995), row('09:40', 105, 100, 985)];
  it('uses the nearest unexpired contract and drops the forming candle on a live read', async () => {
    expect(nearestFuture(book, 'NIFTY 50', D)?.symbol).toBe('NIFTY26DECFUT'); // the Nov contract expired on the 19th
    expect(nearestFuture(book, 'SENSEX', D)?.symbol).toBe('SENSEX26NOVFUT'); // BFO
    const { svc } = mk(cur);
    const r = await svc.load({ name: 'NIFTY 50', day: D });
    expect(r.symbol).toBe('NIFTY26DECFUT');
    expect(r.lotSize).toBe(75);
    expect(r.candles).toBe(5); // the 09:40 candle is only 1 minute old at 09:41: dropped
    expect(r.vix).toBe(13);
    expect(r.prevDay).toBe('2026-11-19');
  });
  it('keeps every candle for a replay cut and reads the remark', async () => {
    const { svc } = mk(cur);
    const r = await svc.load({ name: 'NIFTY 50', day: D, asOf: '09:41' });
    expect(r.candles).toBe(6);
    expect(r.remark).toBe('SHOT_COVERING'); // price up, intraday OI 1000 -> 985 (-1.5%)
    expect(r.quote.close).toBe(105);
  });
  it('explains what is missing', async () => {
    await expect(mk([]).svc.load({ name: 'NIFTY 50', day: D, asOf: '09:41' })).rejects.toThrow(/No futures candles/);
    await expect(mk(cur).svc.load({ name: 'NOSUCH', day: D })).rejects.toThrow(/No futures contract/);
  });
});
