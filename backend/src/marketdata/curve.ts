import type { Candle } from '../kite/client.js';
import type { Instrument, InstrumentBook } from '../instruments/book.js';
import { curveRead, type CurveRead } from '../engine/curve.js';
import { previousDayFor, trimCandles } from './history.js';

type Req = { name: string; day: string; asOf?: string };

export interface CurveDeps {
  book: () => InstrumentBook | undefined;
  history: { candles(q: { token: number; interval: '5minute'; from: string; to: string; asOf?: string }): Promise<Candle[]> };
  holidays?: () => ReadonlySet<string>;
}

export interface CurveResult extends CurveRead {
  name: string;
  day: string;
  near: { symbol: string; expiry: string; ltp: number };
  far: { symbol: string; expiry: string; ltp: number };
}

const UNDERLYING: Record<string, string> = { 'NIFTY 50': 'NIFTY', 'NIFTY BANK': 'BANKNIFTY', 'NIFTY FIN SERVICE': 'FINNIFTY', 'NIFTY MID SELECT': 'MIDCPNIFTY' };

/** The contract curve of a name: the first two listed contracts that traded on the day, their last prices up to the snapshot time and the read. */
export class CurveService {
  private readonly cache = new Map<string, { at: number; v: CurveResult | null }>();

  invalidate(): void {
    this.cache.clear();
  }
  constructor(private readonly d: CurveDeps) {}

  private contracts(name: string, day: string): { list: Instrument[]; mcx: boolean } {
    const book = this.d.book();
    if (!book) return { list: [], mcx: false };
    const mcxList = book.futures('MCX', name);
    if (mcxList.length) return { list: mcxList.filter((c) => c.expiry >= day), mcx: true };
    const u = UNDERLYING[name] ?? name;
    const ex = u === 'SENSEX' || u === 'BANKEX' ? 'BFO' : 'NFO';
    return { list: book.futures(ex, u).filter((c) => c.expiry >= day), mcx: false };
  }

  /** null when fewer than two contracts traded that day (the userscript says "no far-month contract" / "contracts not trading yet"). */
  async load(req: Req): Promise<CurveResult | null> {
    const key = `${req.name}|${req.day}|${req.asOf ?? ''}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 300000) return hit.v;
    const { list, mcx } = this.contracts(req.name, req.day);
    const cands = list.slice(0, 4);
    if (cands.length < 2) return this.keep(key, null);
    const from = previousDayFor(req.name, req.day, this.d.holidays?.() ?? new Set());
    const got = await Promise.all(
      cands.map(async (c) => {
        try {
          const raw = await this.d.history.candles({ token: c.token, interval: '5minute', from, to: req.day, asOf: req.asOf });
          const cs = trimCandles(raw, req.day, req.asOf ?? null).filter((x) => String(x[0]).slice(0, 10) === req.day);
          return cs.length ? { c, ltp: cs[cs.length - 1]![4] } : null;
        } catch {
          return null;
        }
      }),
    );
    const traded = got.filter((g): g is NonNullable<typeof g> => !!g);
    if (traded.length < 2) return this.keep(key, null);
    const [n, f] = traded as [(typeof traded)[number], (typeof traded)[number]];
    const r = curveRead(n.ltp, f.ltp, n.c.expiry, f.c.expiry, mcx, req.name);
    return this.keep(key, { ...r, name: req.name, day: req.day, near: { symbol: n.c.symbol, expiry: n.c.expiry, ltp: n.ltp }, far: { symbol: f.c.symbol, expiry: f.c.expiry, ltp: f.ltp } });
  }

  private keep(key: string, v: CurveResult | null): CurveResult | null {
    this.cache.set(key, { at: Date.now(), v });
    return v;
  }
}
