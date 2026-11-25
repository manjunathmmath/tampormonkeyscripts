import type { Candle } from '../kite/client.js';
import type { InstrumentBook } from '../instruments/book.js';
import { crudeSignal, type CrudeSignal } from '../engine/crudeGlobal.js';
import { MCX_FUTURE_STRIKE_DIFF, dominantGap, strikeMap, trendFlags, volKeyFor, zone915, type McxStrikeMap, type McxZone } from '../engine/mcx.js';
import { nearestFuture } from './futures.js';
import { previousDayFor, trimCandles } from './history.js';
import type { VolIndexService, VolValue } from './volIndex.js';

type Req = { name: string; day: string; asOf?: string };

export interface CommodityDeps {
  book: () => InstrumentBook | undefined;
  history: { candles(q: { token: number; interval: '5minute' | 'day'; from: string; to: string; oi?: boolean; asOf?: string }): Promise<Candle[]> };
  vol: Pick<VolIndexService, 'get'>;
}

export interface CommodityLevels {
  name: string;
  day: string;
  asOf: string | null;
  token: number;
  symbol: string;
  expiry: string;
  lotSize: number;
  open: number;
  prevClose: number;
  ltp: number;
  /** close of the first candle of the day (the 9:15 candle of the userscript) */
  firstClose: number;
  vol: { key: string; value: number | null; source: string; asOf: string | null };
  strikeMap: McxStrikeMap;
  zone: McxZone;
  /** the NSE-shaped trend the score and the engines read */
  trend: { ltp: number; open: number; prevPrice: number; change: string; trends: string[]; levels: { ast: number; aso: number; bso: number; bst: number }; vixRange: number; vixUpper: number; vixLower: number };
  candles: number;
}

const r2 = (x: number): number => Math.round(x * 100) / 100;
const shift = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** True for a commodity with futures on MCX in the instrument list. */
export const isCommodity = (book: InstrumentBook | undefined, name: string): boolean => !!book && book.futures("MCX", name).length > 0;

/**
 * A commodity's day, the way `showTopChartMCX` builds it: the nearest futures contract is the price, the first candle's open gives the 9:15 levels, the previous
 * session's close and the commodity's CBOE volatility index give the expected range. The previous session is the last daily candle before the day, so an MCX
 * holiday needs no calendar.
 */
export class CommodityService {
  constructor(private readonly d: CommodityDeps) {}

  names(): string[] {
    const b = this.d.book();
    return b ? Object.keys(MCX_FUTURE_STRIKE_DIFF).filter((n) => b.futures('MCX', n).length > 0) : [];
  }

  async levels(req: Req): Promise<CommodityLevels> {
    const book = this.d.book();
    if (!book) throw new Error('Instruments are not loaded yet');
    const fut = nearestFuture(book, req.name, req.day);
    if (!fut) throw new Error(`No MCX futures contract for ${req.name}`);
    const [raw, daily] = await Promise.all([
      this.d.history.candles({ token: fut.token, interval: '5minute', from: req.day, to: req.day, oi: true, asOf: req.asOf }),
      this.d.history.candles({ token: fut.token, interval: 'day', from: shift(req.day, -12), to: shift(req.day, -1) }),
    ]);
    const cs = trimCandles(raw, req.day, req.asOf ?? null);
    if (!cs.length) throw new Error(`No candles for ${req.name} on ${req.day} (the contract may not trade yet)`);
    // the Settings / calendar previous day when that session has a candle, else the last session before the day (an MCX holiday needs no calendar)
    const before = daily.filter((c) => String(c[0]).slice(0, 10) < req.day);
    const want = previousDayFor(req.name, req.day);
    const prev = before.find((c) => String(c[0]).slice(0, 10) === want) ?? before.pop();
    if (!prev) throw new Error(`No previous-session candle for ${req.name}`);
    const open = cs[0]![1];
    const ltp = cs[cs.length - 1]![4];
    const prevClose = prev[4];
    const key = volKeyFor(req.name);
    const volv: VolValue | null = key === 'FIXED' ? null : await this.d.vol.get({ key, day: req.day });
    const proxy = key === 'VIX' || key === 'FIXED' ? (volv?.value ?? null) : (await this.d.vol.get({ key: 'VIX', day: req.day }))?.value ?? null;
    // the step comes from the real option strikes of the nearest expiry (as Data Load does), else the kept constant
    const exp = book.expiries('MCX', req.name)[0];
    const gap = exp ? dominantGap(book.options('MCX', req.name, exp).map((o) => o.strike)) : null;
    const sm = strikeMap(req.name, open, prevClose, volv?.value ?? null, proxy, gap ? `${gap},${gap}` : null);
    const zone = zone915(cs[0]![4], sm);
    return {
      name: req.name,
      day: req.day,
      asOf: req.asOf ?? null,
      token: fut.token,
      symbol: fut.symbol,
      expiry: fut.expiry,
      lotSize: fut.lotSize,
      open,
      prevClose,
      ltp,
      firstClose: cs[0]![4],
      vol: key === 'FIXED' ? { key: 'FIXED', value: 4.85, source: 'fixed', asOf: null } : volv ? { key, value: volv.value, source: volv.source, asOf: volv.asOf } : { key, value: proxy, source: proxy ? 'VIX proxy' : 'none', asOf: null },
      strikeMap: sm,
      zone,
      trend: {
        ltp,
        open,
        prevPrice: prevClose,
        change: (((ltp - prevClose) / prevClose) * 100).toFixed(2),
        trends: trendFlags(ltp, sm),
        levels: { ast: sm.ustrikeTwo, aso: sm.ustrikeOne, bso: sm.bstrikeOne, bst: sm.bstrikeTwo },
        vixRange: sm.vixDDUpper - prevClose,
        vixUpper: sm.vixDDUpper,
        vixLower: sm.vixDDLower,
      },
      candles: cs.length,
    };
  }
}

export interface GlobalDeps {
  levels: (r: Req) => Promise<CommodityLevels>;
  macro: { load(day?: string): Promise<{ rows: { key: string; last: number; prev: number }[] }> };
  score: { load(r: Req): Promise<{ score: { current_trend: number; futures_trend: number }; trend: { change: string } | null }> };
}

/** Crude's global cross-check: WTI x USD/INR fair value against the MCX price and the signal built from it (crude only: WTI is its benchmark). */
export class CommodityGlobalService {
  constructor(private readonly d: GlobalDeps) {}

  async load(req: Req): Promise<(CrudeSignal & { name: string; wti: { cur: number; prev: number } | null; usdInr: number | null; mcxLtp: number; ovx: number | null }) | { name: string; unavailable: string }> {
    if (req.name !== 'CRUDEOIL' && req.name !== 'CRUDEOILM') return { name: req.name, unavailable: 'The global fair-value check is only wired up for crude oil (WTI is its benchmark); gold and silver would need XAU/USD and XAG/USD.' };
    const [lv, macro] = await Promise.all([this.d.levels(req), this.d.macro.load(req.day)]);
    const wti = macro.rows.find((r) => r.key === 'WTI');
    const fx = macro.rows.find((r) => r.key === 'USDINR');
    let usdScore = 0;
    try {
      const u = await this.d.score.load({ ...req, name: 'USDINR' });
      usdScore = u.score.current_trend || u.score.futures_trend || 0;
    } catch {
      usdScore = 0;
    }
    let giftChg = 0;
    try {
      giftChg = parseFloat((await this.d.score.load({ ...req, name: 'GIFT NIFTY' })).trend?.change ?? '0') || 0;
    } catch {
      giftChg = 0;
    }
    const ovx = lv.vol.key === 'OVX' ? lv.vol.value : null;
    const sig = crudeSignal({ wtiCur: r2(wti?.last ?? 0), wtiPrev: r2(wti?.prev ?? 0), usdInr: r2(fx?.last ?? 0), mcxLtp: lv.ltp, usdScore, ovx: ovx ?? 0, giftChg });
    return { ...sig, name: req.name, wti: wti ? { cur: r2(wti.last), prev: r2(wti.prev) } : null, usdInr: fx ? r2(fx.last) : null, mcxLtp: lv.ltp, ovx };
  }
}
