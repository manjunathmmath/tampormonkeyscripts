import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseFrame, divisorForToken } from '../src/marketdata/ticks.js';
import { applyTick, bucketOf, newSeries, dayOf, tickMs } from '../src/marketdata/candles.js';
import { LiveMarket } from '../src/marketdata/live.js';
import { KiteTicker, type SocketLike } from '../src/kite/ticker.js';
import { createLogger } from '../src/logger.js';
import type { Candle } from '../src/kite/client.js';

const IST = (iso: string) => Date.parse(iso + '+05:30');

// ---------- binary frames ----------
function frame(packets: Uint8Array[]): Uint8Array {
  const total = 2 + packets.reduce((a, p) => a + 2 + p.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, packets.length);
  let o = 2;
  for (const p of packets) {
    dv.setUint16(o, p.length);
    out.set(p, o + 2);
    o += 2 + p.length;
  }
  return out;
}
function ltpPacket(token: number, ltp100: number): Uint8Array {
  const p = new Uint8Array(8);
  const dv = new DataView(p.buffer);
  dv.setUint32(0, token);
  dv.setUint32(4, ltp100);
  return p;
}
function fullPacket(token: number, o: { ltp: number; vol: number; oi: number; ts: number; avg: number }): Uint8Array {
  const p = new Uint8Array(184);
  const dv = new DataView(p.buffer);
  dv.setUint32(0, token);
  dv.setUint32(4, Math.round(o.ltp * 100));
  dv.setUint32(12, Math.round(o.avg * 100));
  dv.setUint32(16, o.vol);
  dv.setUint32(20, 111);
  dv.setUint32(24, 222);
  dv.setUint32(28, 10000); // open
  dv.setUint32(32, 10100);
  dv.setUint32(36, 9900);
  dv.setUint32(40, 10050); // close
  dv.setUint32(48, o.oi);
  dv.setUint32(60, o.ts);
  dv.setInt32(64, 500); // best bid qty
  dv.setInt32(68, 12345); // best bid price x100
  dv.setInt16(72, 7);
  dv.setInt32(64 + 60, 400); // best ask qty
  dv.setInt32(64 + 60 + 4, 12355);
  return p;
}

describe('tick parser', () => {
  it('reads an ltp packet, a full packet with OI, depth and timestamp, and ignores the heartbeat', () => {
    const FUT = 15736578; // segment byte 0x02 -> divisor 100
    const ticks = parseFrame(frame([ltpPacket(256265, 2580060), fullPacket(FUT, { ltp: 25766.2, vol: 53885, oi: 8556405, ts: 1795248000, avg: 25770.5 })]));
    expect(ticks).toHaveLength(2);
    expect(ticks[0]).toMatchObject({ token: 256265, ltp: 25800.6, tradable: false }); // index token (segment byte 9): not tradable
    const f = ticks[1]!;
    expect(f).toMatchObject({ token: FUT, ltp: 25766.2, volume: 53885, oi: 8556405, ts: 1795248000, avgPrice: 25770.5, totalBuyQty: 111, totalSellQty: 222 });
    expect(f.depth?.buy[0]).toEqual({ qty: 500, price: 123.45, orders: 7 });
    expect(f.depth?.sell[0]?.price).toBe(123.55);
    expect(parseFrame(new Uint8Array([0]))).toEqual([]);
    expect(parseFrame(new Uint8Array(0))).toEqual([]);
  });
  it('stops safely on a truncated frame and uses the currency divisor', () => {
    const good = frame([ltpPacket(256265, 100)]);
    expect(parseFrame(good.slice(0, good.length - 3))).toEqual([]);
    expect(divisorForToken(0x1003)).toBe(10000000);
    expect(divisorForToken(0x1002)).toBe(100);
  });
});

// ---------- candle builder ----------
describe('candle builder', () => {
  const T0 = IST('2026-11-20T09:15:00');
  it('buckets by IST 5-minute slot and prefers the exchange timestamp', () => {
    expect(bucketOf(T0)).toBe('2026-11-20T09:15:00+0530');
    expect(bucketOf(T0 + 4 * 60000 + 59000)).toBe('2026-11-20T09:15:00+0530');
    expect(bucketOf(T0 + 5 * 60000)).toBe('2026-11-20T09:20:00+0530');
    expect(dayOf(Date.parse('2026-11-20T20:00:00Z'))).toBe('2026-11-21');
    expect(tickMs({ ts: (T0 + 1000) / 1000 }, T0)).toBe(T0 + 1000);
    expect(tickMs({ ts: (T0 - 600000) / 1000 }, T0)).toBe(T0); // exchange time 10 minutes off: use arrival time
  });
  it('builds OHLC, volume from the cumulative, OI carry, and ignores a late tick', () => {
    const st = newSeries(true);
    const tick = (ms: number, ltp: number, vol: number, oi: number | null) => applyTick(st, { ltp, volume: vol, oi: oi as number, ts: 0 }, ms);
    tick(T0 + 1000, 100, 1000, 50); // first tick: volume baseline only
    tick(T0 + 60000, 103, 1500, 51);
    tick(T0 + 120000, 99, 1800, null);
    tick(T0 + 300000 + 1000, 101, 2000, null); // next candle: no OI on the tick -> carried
    tick(T0 + 120000, 150, 2100, 60); // late tick for an older bucket: ignored
    expect(st.candles).toEqual([
      ['2026-11-20T09:15:00+0530', 100, 103, 99, 99, 800, 51],
      ['2026-11-20T09:20:00+0530', 101, 101, 101, 101, 200, 51],
    ]);
  });
  it('does not add volume when the cumulative goes down (new session baseline)', () => {
    const st = newSeries(false);
    applyTick(st, { ltp: 1, volume: 500, ts: 0 }, T0);
    applyTick(st, { ltp: 2, volume: 100, ts: 0 }, T0 + 1000);
    applyTick(st, { ltp: 3, volume: 160, ts: 0 }, T0 + 2000);
    expect(st.candles[0]).toEqual(['2026-11-20T09:15:00+0530', 1, 3, 1, 3, 60]);
  });
});

// ---------- parity with the recorded candles ----------
/** Breaks a recorded candle into ticks that must rebuild it: open, then the extreme first reached, the other extreme, then the close. */
function ticksFor(c: Candle, prevCum: number, cum: number, hasOi: boolean): { ms: number; ltp: number; volume: number; oi?: number }[] {
  const t = Date.parse(c[0].replace('+0530', '+05:30'));
  const [, o, h, l, cl] = c;
  const oi = hasOi ? c[6] : undefined;
  const path = [o, h, l, cl];
  const span = cum - prevCum;
  return path.map((ltp, i) => ({ ms: t + 10000 * (i + 1), ltp, volume: prevCum + Math.round((span * (i + 1)) / path.length), oi }));
}

describe('parity with recorded candles (data/candles)', () => {
  const root = resolve(__dirname, '../../data/candles');
  const days = existsSync(root) ? readdirSync(root).sort() : [];
  const files: string[] = [];
  for (const d of days.slice(0, 2)) for (const f of readdirSync(join(root, d))) if (f.includes('_5minute_')) files.push(join(root, d, f));

  it.skipIf(files.length === 0)('rebuilds recorded 5-minute candles from ticks exactly', () => {
    let compared = 0;
    for (const f of files.slice(0, 60)) {
      const j = JSON.parse(readFileSync(f, 'utf8')) as { candles: Candle[] };
      const byDay = new Map<string, Candle[]>();
      for (const c of j.candles) byDay.set(c[0].slice(0, 10), [...(byDay.get(c[0].slice(0, 10)) ?? []), c]);
      for (const cs of byDay.values()) {
        if (cs.length < 10) continue;
        const hasOi = cs.some((c) => (c[6] ?? 0) > 0);
        // keep only candles whose OHLC is internally consistent so the tick path is well defined
        const good = cs.filter((c) => c[2] >= Math.max(c[1], c[4]) && c[3] <= Math.min(c[1], c[4]));
        if (good.length !== cs.length) continue;
        const st = newSeries(hasOi);
        let cum = 0;
        // opening baseline tick: sets the cumulative without counting a volume
        const first = good[0]!;
        applyTick(st, { ltp: first[1], volume: 0, oi: hasOi ? first[6] : undefined, ts: 0 }, Date.parse(first[0].replace('+0530', '+05:30')));
        for (const c of good) {
          const target = cum + (c[5] ?? 0);
          for (const tk of ticksFor(c, cum, target, hasOi)) applyTick(st, { ltp: tk.ltp, volume: tk.volume, oi: tk.oi as number, ts: 0 }, tk.ms);
          cum = target;
        }
        expect(st.candles).toHaveLength(good.length);
        good.forEach((c, i) => {
          const r = st.candles[i]!;
          expect(r.slice(0, 5)).toEqual(c.slice(0, 5));
          expect(r[5]).toBe(c[5] ?? 0);
          if (hasOi) expect(r[6]).toBe(c[6]);
        });
        compared += good.length;
      }
    }
    expect(compared).toBeGreaterThan(100);
  });
});

// ---------- live market + ticker ----------
describe('live market', () => {
  it('builds candles only for watched tokens and keeps the last tick', () => {
    const m = new LiveMarket();
    m.watch(1, false);
    const now = IST('2026-11-20T09:16:00');
    m.onTicks([{ token: 1, ltp: 10, open: 0, high: 0, low: 0, close: 0, change: 0, tradable: true, volume: 5 }, { token: 2, ltp: 20, open: 0, high: 0, low: 0, close: 0, change: 0, tradable: true }], now);
    expect(m.candles(1)?.length).toBe(1);
    expect(m.candles(2)).toBeUndefined();
    expect(m.lastTick(2)?.ltp).toBe(20);
  });
});

class FakeSocket implements SocketLike {
  handlers: Record<string, (...a: any[]) => void> = {};
  sent: string[] = [];
  closed = false;
  on(ev: string, fn: (...a: any[]) => void) { this.handlers[ev] = fn; return this; }
  send(d: string) { this.sent.push(d); }
  close() { this.closed = true; }
  terminate() { this.closed = true; }
}

describe('ticker', () => {
  const log = createLogger('silent');
  it('subscribes on open, resubscribes after a reconnect and backs off', async () => {
    const sockets: FakeSocket[] = [];
    const ticks: number[] = [];
    let t = 1000;
    const tk = new KiteTicker({ apiKey: 'K', getAccessToken: () => 'TOK', logger: log, now: () => t, minDelayMs: 5, maxDelayMs: 20, staleMs: 1000,
      makeSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; }, onTicks: (x) => ticks.push(...x.map((y) => y.token)) });
    tk.subscribe([11, 12], 'full'); // before connecting: remembered
    tk.start();
    sockets[0]!.handlers.open!();
    expect(sockets[0]!.sent.map((s) => JSON.parse(s))).toEqual([{ a: 'subscribe', v: [11, 12] }, { a: 'mode', v: ['full', [11, 12]] }]);
    tk.subscribe([13], 'ltp');
    expect(JSON.parse(sockets[0]!.sent.at(-1)!)).toEqual({ a: 'mode', v: ['ltp', [13]] });
    sockets[0]!.handlers.message!(Buffer.from(frame([ltpPacket(256265, 100)])), true);
    sockets[0]!.handlers.message!('{"type":"error"}', false);
    expect(ticks).toEqual([256265]);
    sockets[0]!.handlers.close!(); // dropped
    expect(tk.state).toBe('reconnecting');
    await new Promise((r) => setTimeout(r, 30));
    expect(sockets).toHaveLength(2);
    sockets[1]!.handlers.open!();
    const resub = sockets[1]!.sent.map((s) => JSON.parse(s));
    expect(resub.filter((m) => m.a === 'subscribe').flatMap((m) => m.v).sort()).toEqual([11, 12, 13]);
    expect(tk.reconnects).toBe(1);
    // silence: the watchdog drops it
    t += 5000;
    (tk as unknown as { checkStale(): void }).checkStale();
    expect(sockets[1]!.closed).toBe(true);
    tk.stop();
    expect(tk.state).toBe('stopped');
  });
  it('waits instead of connecting without a token', async () => {
    const sockets: FakeSocket[] = [];
    const tk = new KiteTicker({ apiKey: 'K', getAccessToken: () => undefined, logger: log, minDelayMs: 5, makeSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; }, onTicks: () => undefined });
    tk.start();
    expect(sockets).toHaveLength(0);
    expect(tk.state).toBe('reconnecting');
    tk.stop();
  });
});
