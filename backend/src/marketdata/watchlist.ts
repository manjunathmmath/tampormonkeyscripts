import type { InstrumentBook } from '../instruments/book.js';
import type { KeyValueStore } from '../store/fileStore.js';

export interface WatchItem {
  token: number;
  /** what to show: the trading symbol or the app's name for it */
  label: string;
  /** a short second line, e.g. "NFO FUT 2026-11-26" */
  sub?: string;
}
export interface WatchGroup {
  id: string;
  name: string;
  items: WatchItem[];
  /** built from the live index weights, so it follows them: not saved and not editable */
  live?: boolean;
}

export interface WatchlistDeps {
  store: KeyValueStore;
  book: () => InstrumentBook | undefined;
  /** the app's name -> token map of spot instruments (indices and stocks) */
  universe: () => Record<string, number>;
  /** constituents of NIFTY 50 / NIFTY BANK, heaviest first when known */
  indexNames: (ix: 'NIFTY 50' | 'NIFTY BANK') => string[];
  /** the heaviest stocks of an index with their weights, heaviest first */
  topWeights?: (ix: 'NIFTY 50' | 'NIFTY BANK', n: number) => { name: string; weight: number }[];
}

const INDICES = ['INDIA VIX', 'GIFT NIFTY', 'NIFTY 50', 'NIFTY BANK', 'SENSEX', 'BANKEX', 'NIFTY FIN SERVICE', 'NIFTY MID SELECT'];
const COMMODITIES = ['GOLDM', 'SILVERM', 'CRUDEOILM', 'NATGASMINI', 'GOLD', 'SILVER', 'CRUDEOIL', 'COPPER', 'ZINC', 'USDINR'];
const MAX_GROUPS = 20;
const MAX_ITEMS = 200;

/**
 * The watchlist: groups of instruments with their live prices (the prices come from the ticker stream, the page subscribes to the group it shows).
 * Until the user changes it the groups are built from what the app knows; a saved list replaces them.
 */
export class Watchlist {
  constructor(private readonly d: WatchlistDeps) {}

  /** the index and its ten heaviest stocks, in order of weight, with the weight shown under each */
  private weighted(): WatchGroup[] {
    const u = this.d.universe();
    const mk = (id: string, name: string, ix: 'NIFTY 50' | 'NIFTY BANK'): WatchGroup | null => {
      const top = this.d.topWeights?.(ix, 10) ?? [];
      const items: WatchItem[] = [];
      if (u[ix]) items.push({ token: u[ix]!, label: ix });
      for (const t of top) if (u[t.name]) items.push({ token: u[t.name]!, label: t.name, sub: `${t.weight.toFixed(2)}% of ${ix}` });
      return items.length > 1 ? { id, name, items, live: true } : null;
    };
    return [mk('wtd50', 'NIFTY 50 top 10', 'NIFTY 50'), mk('wtdbank', 'BANK NIFTY top 10', 'NIFTY BANK')].filter((g): g is WatchGroup => g !== null);
  }

  defaults(): WatchGroup[] {
    const u = this.d.universe();
    const book = this.d.book();
    const spot = (names: string[]): WatchItem[] => names.flatMap((n) => (u[n] ? [{ token: u[n]!, label: n }] : []));
    const fut = (ex: string, names: string[]): WatchItem[] =>
      names.flatMap((n) => {
        const f = book?.futures(ex, n)[0];
        return f ? [{ token: f.token, label: f.symbol, sub: `${f.exchange} FUT ${f.expiry}` }] : [];
      });
    return [
      { id: 'indices', name: 'Indices', items: spot(INDICES) },
      ...this.weighted(),
      { id: 'nifty50', name: 'NIFTY 50', items: spot(this.d.indexNames('NIFTY 50')) },
      { id: 'bank', name: 'BANK NIFTY', items: spot(this.d.indexNames('NIFTY BANK')) },
      { id: 'commodities', name: 'Commodities', items: fut('MCX', COMMODITIES) },
      { id: 'futures', name: 'Index futures', items: fut('NFO', ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']).concat(fut('BFO', ['SENSEX', 'BANKEX'])) },
    ].filter((g) => g.items.length);
  }

  get(): { groups: WatchGroup[]; custom: boolean } {
    const saved = this.d.store.get<WatchGroup[]>('watchlist');
    if (!saved?.length) return { groups: this.defaults(), custom: false };
    // your own groups stay as saved; the two weighted groups are always there and always current
    return { groups: [...saved.filter((g) => !g.live && g.id !== 'wtd50' && g.id !== 'wtdbank'), ...this.weighted()], custom: true };
  }

  /** validates and saves; throws a plain message for a bad list */
  save(input: unknown): WatchGroup[] {
    if (!Array.isArray(input) || input.length > MAX_GROUPS) throw new Error(`send up to ${MAX_GROUPS} groups`);
    const seen = new Set<string>();
    const out: WatchGroup[] = input.filter((g) => !(g as Partial<WatchGroup>).live).map((g, i) => {
      const o = g as Partial<WatchGroup>;
      const name = String(o.name ?? '').trim().slice(0, 40);
      if (!name) throw new Error('every group needs a name');
      let id = String(o.id ?? `g${i}`).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) || `g${i}`;
      while (seen.has(id)) id += 'x';
      seen.add(id);
      const items = Array.isArray(o.items) ? o.items : [];
      if (items.length > MAX_ITEMS) throw new Error(`a group holds up to ${MAX_ITEMS} instruments`);
      const clean: WatchItem[] = [];
      const tok = new Set<number>();
      for (const it of items) {
        const x = it as Partial<WatchItem>;
        if (!Number.isInteger(x.token) || (x.token as number) <= 0 || tok.has(x.token as number)) continue;
        tok.add(x.token as number);
        clean.push({ token: x.token as number, label: String(x.label ?? x.token).slice(0, 40), ...(x.sub ? { sub: String(x.sub).slice(0, 60) } : {}) });
      }
      return { id, name, items: clean };
    });
    this.d.store.set('watchlist', out);
    return out;
  }

  reset(): void {
    this.d.store.delete('watchlist');
  }
}
