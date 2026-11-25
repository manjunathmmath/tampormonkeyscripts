import type { Candle } from '../kite/client.js';
import type { InstrumentBook } from '../instruments/book.js';
import { buildChain, chainInstrument, resolveExpiry, selectStrikes, type Chain, type FetchedStrike, type OptionRow } from '../engine/optionChain.js';
import { nearestFuture } from './futures.js';
import { previousDayFor, trimCandles } from './history.js';

export interface ChainHistory {
  candles(q: { token: number; interval: '5minute' | 'day'; from: string; to: string; oi?: boolean; asOf?: string }): Promise<Candle[]>;
}

export interface ChainDeps {
  history: ChainHistory;
  book: () => InstrumentBook | undefined;
  /** display name -> token (the app's universe), for the underlying's spot candles */
  tokens: () => Record<string, number>;
  /** NSE holidays (YYYY-MM-DD), when known, so the previous trading day skips them */
  holidays?: () => ReadonlySet<string>;
  /**
   * live 5-minute candles built from ticks. When present, a live day reads each option contract from REST ONCE (to seed the series), subscribes it on the
   * ticker, and every later load is answered from the tick-built series with no history call.
   */
  live?: { candles(token: number): Candle[] | undefined; watch(token: number, hasOi: boolean, seed: Candle[]): void };
  now?: () => number;
  /** Settings: the strike anchor when a request does not say (use the last price, or the day open) */
  anchor?: () => 'ltp' | 'open';
  /** Settings: the configured expiry of an underlying (blank / undefined = the nearest); `mcx` for a commodity's options */
  expiryPref?: (underlying: string, mcx: boolean) => string | undefined;
}

export interface ChainRequest {
  /** display name: "NIFTY 50", "NIFTY BANK", "RELIANCE" ... */
  name: string;
  /** trading day shown, YYYY-MM-DD */
  day: string;
  /** snapshot end time "HH:mm" (the replay cut) or undefined for live */
  asOf?: string;
  /** configured expiry (ISO) from settings; blank = nearest live expiry */
  expiry?: string;
  /** strike anchor: the latest price (the userscript's default, USE_LTP_FOR_STRIKE) or the day open */
  anchor?: 'ltp' | 'open';
  /** overrides the strike count each side */
  strikesToShow?: number;
}

export interface ChainResult {
  name: string;
  underlying: string;
  day: string;
  prevDay: string;
  expiry: string;
  anchorPrice: number;
  atmStrike: number;
  chain: Chain;
  /** names of strikes that could not be read (no contract or no data) */
  skipped: string[];
}

const toDDMMYYYY = (iso: string): string => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/** Display name -> the name Kite uses for the underlying (NIFTY 50 -> NIFTY ...). SENSEX and BANKEX trade on BFO, everything else on NFO. */
function exchangeFor(underlying: string): string {
  return underlying === 'SENSEX' || underlying === 'BANKEX' ? 'BFO' : 'NFO';
}

const DISPLAY_OF: Record<string, string> = { NIFTY: 'NIFTY 50', BANKNIFTY: 'NIFTY BANK', FINNIFTY: 'NIFTY FIN SERVICE', MIDCPNIFTY: 'NIFTY MID SELECT' };

/**
 * Loads the option chain of one name the way `showTrendingOI` does: resolve the expiry, take the spot candles of the day, pick ATM and the strikes
 * around it, then read each strike's CE and PE series (today's intraday plus the previous day's daily candle) and compute OI / OBV / IV.
 * All history goes through the history service (so the Kite queue, cache and as-of cut apply).
 */
export class OptionChainService {
  private readonly now: () => number;
  private readonly seeded = new Set<number>();
  /** the previous day's daily candle of a contract never changes: read it once */
  private readonly prevMemo = new Map<string, Promise<Candle[]>>();
  constructor(private readonly d: ChainDeps) {
    this.now = d.now ?? Date.now;
  }

  /** a contract's 5-minute candles (previous day and today, with open interest): tick-built after the first read of a live day, else from history */
  private async intraday(token: number, prevDay: string, req: ChainRequest, live: boolean): Promise<Candle[]> {
    const fetchIt = (): Promise<Candle[]> => this.d.history.candles({ token, interval: '5minute', from: prevDay, to: req.day, oi: true, asOf: req.asOf });
    if (live && this.d.live) {
      const have = this.seeded.has(token) ? this.d.live.candles(token) : undefined;
      if (have && have.length) return have;
      const seed = await fetchIt();
      this.d.live.watch(token, true, seed);
      this.seeded.add(token);
      return seed;
    }
    return fetchIt();
  }

  private prevDaily(token: number, prevDay: string): Promise<Candle[]> {
    const key = `${token}|${prevDay}`;
    let p = this.prevMemo.get(key);
    if (!p) {
      p = this.d.history.candles({ token, interval: 'day', from: prevDay, to: prevDay, oi: true }).catch((e) => {
        this.prevMemo.delete(key);
        throw e;
      });
      this.prevMemo.set(key, p);
    }
    return p;
  }

  async load(req: ChainRequest): Promise<ChainResult> {
    const book = this.d.book();
    if (!book) throw new Error('Instruments are not loaded yet');
    const mcx = book.options('MCX', req.name).length > 0;
    const chosen = chainInstrument(req.name, req.strikesToShow);
    // a commodity (`showTrendingOIMCX`): 4 strikes each side, open interest in thousands, the futures contract is the underlying
    const instrument = mcx ? req.name : chosen.instrument;
    const strikesToShow = mcx ? (req.strikesToShow ?? 4) : chosen.strikesToShow;
    const exch = mcx ? 'MCX' : exchangeFor(instrument);
    const all = book.options(exch, instrument);
    if (!all.length) throw new Error(`No option contracts found for ${req.name}`);

    const expiries = [...new Set(all.map((r) => r.expiry))].sort();
    const expiry = resolveExpiry(req.expiry ?? this.d.expiryPref?.(instrument, mcx) ?? '', expiries, req.day);
    if (!expiry) throw new Error(`No expiry found for ${req.name}`);
    const rows: OptionRow[] = all
      .filter((r) => r.expiry === expiry)
      .map((r) => ({ strike: r.strike, type: r.type as 'CE' | 'PE', token: r.token, expiry: toDDMMYYYY(r.expiry), symbol: r.symbol }));

    const prevDay = previousDayFor(req.name, req.day, this.d.holidays?.() ?? new Set());
    const live = !req.asOf && req.day === new Date(this.now() + 19800000).toISOString().slice(0, 10);
    const uTokenName = DISPLAY_OF[instrument] ?? instrument;
    let spotCandles: Candle[] = [];
    if (mcx) {
      const fut = nearestFuture(book, instrument, req.day);
      if (fut) spotCandles = await this.d.history.candles({ token: fut.token, interval: '5minute', from: prevDay, to: req.day, asOf: req.asOf });
    } else {
      const spotToken = this.d.tokens()[uTokenName];
      if (spotToken) {
        const raw = await this.d.history.candles({ token: spotToken, interval: '5minute', from: prevDay, to: req.day, asOf: req.asOf });
        spotCandles = trimCandles(raw, req.day, req.asOf ?? null);
      }
    }
    const openPx = spotCandles[0]?.[1];
    const lastPx = spotCandles[spotCandles.length - 1]?.[4];
    const anchorPrice = ((req.anchor ?? this.d.anchor?.()) === 'open' ? openPx : lastPx ?? openPx) ?? 0;
    if (!anchorPrice) throw new Error(`No spot price for ${req.name} on ${req.day}`);

    const { strikeData, atmStrike } = selectStrikes(anchorPrice, rows, strikesToShow);
    const fetched: Record<string, FetchedStrike> = {};
    const skipped: string[] = [];
    for (const sd of strikeData) {
      if (sd.STRIKE === 0) continue;
      const CE = rows.find((r) => r.strike === sd.STRIKE && r.type === 'CE');
      const PE = rows.find((r) => r.strike === sd.STRIKE && r.type === 'PE');
      if (!CE || !PE) {
        skipped.push(String(sd.STRIKE));
        continue;
      }
      try {
        const q = (token: number): Promise<Candle[]> => this.intraday(token, prevDay, req, live);
        const p = (token: number): Promise<Candle[]> => this.prevDaily(token, prevDay);
        const [prevDataCE, currDataCE, prevDataPE, currDataPE] = await Promise.all([p(CE.token), q(CE.token), p(PE.token), q(PE.token)]);
        fetched[String(sd.STRIKE)] = { prevDataCE, currDataCE, prevDataPE, currDataPE, CE, PE };
      } catch {
        skipped.push(String(sd.STRIKE)); // the userscript logs and drops a strike it cannot fetch
      }
    }

    const chain = buildChain({ strikeData, fetched, spotCandles, expiryDDMMYYYY: rows[0]?.expiry ?? null, day: req.day, asOf: req.asOf ?? null, intervalStr: '5minute', nowMs: this.now(), oiDivisor: mcx ? 1000 : undefined });
    return { name: req.name, underlying: instrument, day: req.day, prevDay, expiry, anchorPrice, atmStrike, chain, skipped };
  }
}
