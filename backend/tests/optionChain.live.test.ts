import { describe, it, expect } from 'vitest';
import { OptionChainService } from '../src/marketdata/optionChain.js';
import { LiveMarket } from '../src/marketdata/live.js';
import { InstrumentBook, parseInstrumentsCsv } from '../src/instruments/book.js';
import type { Candle } from '../src/kite/client.js';
import type { Tick } from '../src/marketdata/ticks.js';

const D = '2026-11-20';
const P = '2026-11-19';
const c = (day: string, hm: string, o: number, h: number, l: number, cl: number, v: number, oi?: number): Candle => (oi === undefined ? [`${day}T${hm}:00+0530`, o, h, l, cl, v] : [`${day}T${hm}:00+0530`, o, h, l, cl, v, oi]);

const CSV = [
  'instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,segment,exchange',
  ...[24000, 24050, 24100].flatMap((s) => [`${s * 10 + 1},1,N${s}CE,"NIFTY",0,2026-11-24,${s},0.05,75,CE,NFO-OPT,NFO`, `${s * 10 + 2},1,N${s}PE,"NIFTY",0,2026-11-24,${s},0.05,75,PE,NFO-OPT,NFO`]),
].join('\n');

describe('option chain on the live feed', () => {
  const mk = () => {
    const book = new InstrumentBook(parseInstrumentsCsv(CSV), D);
    const calls: string[] = [];
    const subs: number[] = [];
    const live = new LiveMarket();
    const history = {
      candles: async (q: { token: number; interval: string; oi?: boolean }) => {
        calls.push(`${q.token}:${q.interval}`);
        if (q.token === 256265) return [c(D, '09:15', 24020, 24060, 24010, 24040, 0), c(D, '09:20', 24040, 24070, 24030, 24044, 0)];
        if (q.interval === 'day') return [c(P, '00:00', 50, 50, 50, 50, 10, 1000000)];
        return [c(D, '09:15', 50, 52, 49, 51, 200000, 1500000), c(D, '09:20', 51, 53, 50, 52, 100000, 1600000)];
      },
    };
    const svc = new OptionChainService({
      history,
      book: () => book,
      tokens: () => ({ 'NIFTY 50': 256265 }),
      now: () => Date.parse(`${D}T09:21:00+05:30`),
      live: {
        candles: (t) => live.candles(t),
        watch: (t, hasOi, seed) => {
          live.watch(t, hasOi, seed);
          subs.push(t);
        },
      },
    });
    return { svc, calls, subs, live };
  };
  const intraday = (calls: string[]): number => calls.filter((x) => x.endsWith(':5minute') && !x.startsWith('256265')).length;
  const daily = (calls: string[]): number => calls.filter((x) => x.endsWith(':day')).length;

  it('reads each contract once, subscribes it, then makes no contract history calls', async () => {
    const { svc, calls, subs } = mk();
    await svc.load({ name: 'NIFTY 50', day: D });
    expect(intraday(calls)).toBe(6); // 3 strikes x CE + PE
    expect(daily(calls)).toBe(6);
    expect(subs).toHaveLength(6);
    const after = calls.length;
    await svc.load({ name: 'NIFTY 50', day: D });
    expect(intraday(calls.slice(after))).toBe(0);
    expect(daily(calls.slice(after))).toBe(0);
    expect(subs).toHaveLength(6); // not subscribed again
  });

  it('a tick for a contract shows up in the next load without a history call', async () => {
    const { svc, calls, live } = mk();
    const a = await svc.load({ name: 'NIFTY 50', day: D });
    const row = a.chain.tableData.find((x) => x.STRIKE === '24050')!;
    const oiBefore = row.OI_CE;
    const token = 24050 * 10 + 1;
    const tick = { token, ltp: 60, volume: 300000, oi: 1700000, ts: Date.parse(`${D}T09:21:00+05:30`) / 1000 } as unknown as Tick;
    live.onTicks([tick], Date.parse(`${D}T09:21:00+05:30`));
    const before = calls.length;
    const b = await svc.load({ name: 'NIFTY 50', day: D });
    expect(calls.slice(before).filter((x) => !x.startsWith('256265'))).toHaveLength(0);
    const rowAfter = b.chain.tableData.find((x) => x.STRIKE === '24050')!;
    expect(rowAfter.OI_CE).not.toBe(oiBefore); // the new open interest of the live candle is used
  });

  it('a past day or a snapshot time still reads history every time', async () => {
    const { svc, calls, subs } = mk();
    await svc.load({ name: 'NIFTY 50', day: D, asOf: '09:20' });
    const n = intraday(calls);
    await svc.load({ name: 'NIFTY 50', day: D, asOf: '09:20' });
    expect(intraday(calls)).toBe(n * 2);
    expect(subs).toHaveLength(0);
  });
});
