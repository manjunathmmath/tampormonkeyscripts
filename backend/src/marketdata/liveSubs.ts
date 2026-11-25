import type { InstrumentBook, Instrument } from '../instruments/book.js';
import type { LiveMarket } from './live.js';

export type Group = 'Spot and indices' | 'Futures' | 'Index options' | 'Stock options' | 'MCX';
export const GROUPS: Group[] = ['Spot and indices', 'Futures', 'Index options', 'Stock options', 'MCX'];
export interface Sub { token: number; group: Group; label: string }

export interface SubsDeps {
  book: () => InstrumentBook | undefined;
  /** name -> token of the NSE universe (indices and stocks) */
  universe: () => Record<string, number>;
  /** MCX commodity names (GOLDM, SILVERM ...) */
  commodities: () => string[];
  /** the heaviest stocks of NIFTY 50 and BANK NIFTY: their option strikes are kept live */
  heavyweights: () => string[];
  /** names on the 9:15 board that closed outside the middle (AST, ASO, BSO, BST): their strikes are followed ahead of time */
  movers?: () => string[];
  live: LiveMarket;
  subscribe: (tokens: number[]) => void;
  now?: () => number;
}

/** A hard ceiling: one Kite connection takes 3,000 instruments. */
export const MAX_SUBS = 2800;
const IDX_OPT: { under: string; ex: 'NFO' | 'BFO'; spot: string; each: number; expiries: number }[] = [
  { under: 'NIFTY', ex: 'NFO', spot: 'NIFTY 50', each: 20, expiries: 2 },
  { under: 'BANKNIFTY', ex: 'NFO', spot: 'NIFTY BANK', each: 20, expiries: 2 },
  { under: 'SENSEX', ex: 'BFO', spot: 'SENSEX', each: 20, expiries: 2 },
];
const IDX_FUT: { under: string; ex: 'NFO' | 'BFO' }[] = [
  { under: 'NIFTY', ex: 'NFO' }, { under: 'BANKNIFTY', ex: 'NFO' }, { under: 'FINNIFTY', ex: 'NFO' }, { under: 'MIDCPNIFTY', ex: 'NFO' }, { under: 'SENSEX', ex: 'BFO' },
];
const STOCK_EACH = 6;
const MOVER_EACH = 4;
const MCX_EACH = 8;

/** The strikes of one expiry nearest to `spot`: `each` either side. */
export function nearStrikes(rows: Instrument[], spot: number, each: number): Instrument[] {
  const strikes = [...new Set(rows.map((r) => r.strike))].sort((a, b) => a - b);
  if (!strikes.length) return [];
  let at = 0;
  for (let i = 0; i < strikes.length; i++) if (Math.abs(strikes[i]! - spot) < Math.abs(strikes[at]! - spot)) at = i;
  const keep = new Set(strikes.slice(Math.max(0, at - each), at + each + 1));
  return rows.filter((r) => keep.has(r.strike));
}

/**
 * Decides which contracts the ticker follows, so their prices, open interest and volume arrive live: every spot / index, every futures contract
 * (nearest expiry), the index option strikes around the money (two expiries), the heavyweight stocks' strikes, and the MCX contracts. It subscribes only;
 * candles for a token are built once the token has been read from Kite (the seed). Strikes follow the price, so the list is rebuilt every few minutes.
 * Stock options outside the heavyweight set are not kept live (about 8,000 contracts): they are subscribed when you open that name.
 */
export class LiveSubs {
  private subs = new Map<number, Sub>();
  lastSync = 0;
  lastError: string | null = null;
  private readonly now: () => number;
  constructor(private readonly d: SubsDeps) {
    this.now = d.now ?? Date.now;
  }

  list(): Sub[] {
    return [...this.subs.values()];
  }
  get(token: number): Sub | undefined {
    return this.subs.get(token);
  }
  count(g: Group): number {
    let n = 0;
    for (const s of this.subs.values()) if (s.group === g) n++;
    return n;
  }

  private add(into: Map<number, Sub>, token: number, group: Group, label: string): void {
    if (into.size < MAX_SUBS && !into.has(token)) into.set(token, { token, group, label });
  }

  private spotOf(token: number | undefined): number | null {
    if (!token) return null;
    const t = this.d.live.lastTick(token);
    return t && t.ltp > 0 ? t.ltp : null;
  }

  /** the wanted set right now */
  plan(): Map<number, Sub> {
    const book = this.d.book();
    const out = new Map<number, Sub>();
    if (!book) return out;
    const uni = this.d.universe();
    for (const [name, token] of Object.entries(uni)) this.add(out, token, 'Spot and indices', name);
    // futures: the nearest contract of every stock and index
    const stockNames = Object.keys(uni).filter((n) => !/^(NIFTY|INDIA VIX|GIFT|SENSEX|BANKEX)/.test(n));
    for (const n of stockNames) {
      const f = book.futures('NFO', n)[0];
      if (f) this.add(out, f.token, 'Futures', f.symbol);
    }
    for (const x of IDX_FUT) {
      const f = book.futures(x.ex, x.under)[0];
      if (f) this.add(out, f.token, 'Futures', f.symbol);
    }
    // index options around the money
    for (const x of IDX_OPT) {
      const spot = this.spotOf(uni[x.spot]);
      if (!spot) continue;
      for (const ex of book.expiries(x.ex, x.under).slice(0, x.expiries)) {
        for (const r of nearStrikes(book.options(x.ex, x.under, ex), spot, x.each)) this.add(out, r.token, 'Index options', r.symbol);
      }
    }
    // heavyweight stocks
    for (const n of this.d.heavyweights()) {
      const spot = this.spotOf(uni[n]);
      const ex = book.expiries('NFO', n)[0];
      if (!spot || !ex) continue;
      for (const r of nearStrikes(book.options('NFO', n, ex), spot, STOCK_EACH)) this.add(out, r.token, 'Stock options', r.symbol);
    }
    // names that opened outside the middle of their range on the 9:15 board: the ones people open next
    const heavy = new Set(this.d.heavyweights());
    for (const n of this.d.movers?.() ?? []) {
      if (heavy.has(n)) continue;
      const spot = this.spotOf(uni[n]);
      const ex = book.expiries('NFO', n)[0];
      if (!spot || !ex) continue;
      for (const r of nearStrikes(book.options('NFO', n, ex), spot, MOVER_EACH)) this.add(out, r.token, 'Stock options', r.symbol);
    }
    // MCX
    for (const c of this.d.commodities()) {
      const f = book.futures('MCX', c)[0];
      if (f) {
        this.add(out, f.token, 'MCX', f.symbol);
        const spot = this.spotOf(f.token);
        const ex = book.expiries('MCX', c)[0];
        if (spot && ex) for (const r of nearStrikes(book.options('MCX', c, ex), spot, MCX_EACH)) this.add(out, r.token, 'MCX', r.symbol);
      }
    }
    return out;
  }

  /** subscribe what is wanted and not yet followed (nothing is ever unsubscribed during the day: strikes that fell out of range keep ticking, harmlessly) */
  sync(): { added: number; total: number } {
    try {
      const want = this.plan();
      const fresh: number[] = [];
      for (const [t, s] of want) if (!this.subs.has(t)) { this.subs.set(t, s); fresh.push(t); }
      if (fresh.length) {
        this.d.subscribe(fresh);
        this.d.live.log('subscribe', `${fresh.length} contracts added (${[...new Set(fresh.map((t) => want.get(t)!.group))].join(', ')}); ${this.subs.size} followed in all`);
      }
      this.lastSync = this.now();
      this.lastError = null;
      return { added: fresh.length, total: this.subs.size };
    } catch (e) {
      this.lastError = (e as Error).message;
      this.d.live.log('error', `subscription plan failed: ${this.lastError}`);
      return { added: 0, total: this.subs.size };
    }
  }

  /** a new trading day: forget yesterday's strikes (the ticker keeps its own list until it restarts; harmless) */
  reset(): void {
    this.subs.clear();
  }
}
