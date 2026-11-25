import type { KeyValueStore } from '../store/fileStore.js';

/** `_iwParse`: the leaf entries of the niftyindices.com JSONP file: {"label":"SYMBOL 4.14%","weight":4.14,"id":"1","date":"30-10-2026"}. */
export function parseWeights(text: string): { weights: Record<string, number>; date: string | null } {
  const out: Record<string, number> = {};
  const re = /"label":"([A-Z0-9&\-]+) [\d.]+%","weight":([\d.]+),"id":"[^"]*","date":"([^"]*)"/g;
  let m: RegExpExecArray | null;
  let date: string | null = null;
  while ((m = re.exec(text))) {
    out[m[1]!] = parseFloat(m[2]!);
    date = m[3]!;
  }
  return { weights: out, date };
}

export interface IndexWeights {
  /** every constituent with its weight in percent */
  full: { 'NIFTY 50': Record<string, number>; 'NIFTY BANK': Record<string, number> };
  /** all constituents, alphabetical (`NIFTY_50_LIST` / `NIFTY_BANK_LIST`) */
  nifty50: string[];
  bank: string[];
  /** the live top 10 by weight of each index (`NIFTY_50_WEIGHTED_STOCKS` / `NIFTY_BANK_WEIGHTED_STOCKS`) */
  top10: { 'NIFTY 50': Record<string, number>; 'NIFTY BANK': Record<string, number> };
  asOf: string | null;
  /** set when the download failed and a saved copy (or nothing) is being used */
  error: string | null;
}

interface Saved {
  fetched: string;
  asOf: string | null;
  full: IndexWeights['full'];
}

const URL_FOR = (ix: string): string => `https://liveindexsa.niftyindices.com/jsonfiles/Sector/SectorialIndexData${encodeURIComponent(ix)}_Sector.js?_=${Date.now()}`;

export function shape(full: IndexWeights['full'], asOf: string | null, error: string | null): IndexWeights {
  const top = (F: Record<string, number>): Record<string, number> => Object.fromEntries(Object.keys(F).sort((a, b) => F[b]! - F[a]!).slice(0, 10).map((s) => [s, F[s]!]));
  return { full, nifty50: Object.keys(full['NIFTY 50']).sort(), bank: Object.keys(full['NIFTY BANK']).sort(), top10: { 'NIFTY 50': top(full['NIFTY 50']), 'NIFTY BANK': top(full['NIFTY BANK']) }, asOf, error };
}

/** Live constituents and weights of NIFTY 50 and NIFTY BANK, downloaded once a day and saved; a failed download falls back to the saved copy. */
export class IndexWeightsService {
  private cur: IndexWeights | null = null;
  constructor(
    private readonly store: KeyValueStore,
    private readonly fetchText: (url: string) => Promise<string> = async (u) => {
      const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    },
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {}

  get(): IndexWeights | null {
    return this.cur;
  }

  async load(force = false): Promise<IndexWeights> {
    const saved = this.store.get<Saved>('index-weights');
    if (!force && saved && saved.fetched === this.today() && Object.keys(saved.full?.['NIFTY 50'] ?? {}).length) return (this.cur = shape(saved.full, saved.asOf, null));
    try {
      const full = { 'NIFTY 50': {}, 'NIFTY BANK': {} } as IndexWeights['full'];
      let asOf: string | null = null;
      for (const ix of ['NIFTY 50', 'NIFTY BANK'] as const) {
        const p = parseWeights(await this.fetchText(URL_FOR(ix)));
        if (Object.keys(p.weights).length < 5) throw new Error(`${ix}: the response had no constituent list`);
        full[ix] = p.weights;
        asOf = p.date || asOf;
      }
      this.store.set<Saved>('index-weights', { fetched: this.today(), asOf, full });
      return (this.cur = shape(full, asOf, null));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (saved?.full) return (this.cur = shape(saved.full, saved.asOf, msg));
      return (this.cur = shape({ 'NIFTY 50': {}, 'NIFTY BANK': {} }, null, msg));
    }
  }
}
