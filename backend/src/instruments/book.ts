/** One row of Kite's instruments dump. */
export interface Instrument {
  token: number;
  exchangeToken: number;
  symbol: string; // tradingsymbol, e.g. "NIFTY 50", "RELIANCE", "NIFTY26NOV24000CE"
  name: string; // underlying for derivatives, e.g. "NIFTY"
  expiry: string; // YYYY-MM-DD or ''
  strike: number;
  tickSize: number;
  lotSize: number;
  type: string; // EQ, FUT, CE, PE, ...
  segment: string; // NSE, INDICES, NFO-FUT, NFO-OPT, MCX-FUT, MCX-OPT, ...
  exchange: string; // NSE, NFO, BFO, MCX, ...
}

/** Splits one CSV line, honouring double-quoted fields (the "name" column is quoted). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const COLUMNS = ['instrument_token', 'exchange_token', 'tradingsymbol', 'name', 'last_price', 'expiry', 'strike', 'tick_size', 'lot_size', 'instrument_type', 'segment', 'exchange'];

export function parseInstrumentsCsv(text: string): Instrument[] {
  const lines = text.split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? '');
  const idx = Object.fromEntries(COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<string, number>;
  for (const c of COLUMNS) if (idx[c] === -1) throw new Error(`Instruments CSV is missing the column "${c}"`);
  const out: Instrument[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = splitCsvLine(line);
    const token = Number(f[idx.instrument_token!]);
    if (!Number.isFinite(token)) continue;
    out.push({
      token,
      exchangeToken: Number(f[idx.exchange_token!]),
      symbol: f[idx.tradingsymbol!] ?? '',
      name: f[idx.name!] ?? '',
      expiry: f[idx.expiry!] ?? '',
      strike: Number(f[idx.strike!]) || 0,
      tickSize: Number(f[idx.tick_size!]) || 0,
      lotSize: Number(f[idx.lot_size!]) || 0,
      type: f[idx.instrument_type!] ?? '',
      segment: f[idx.segment!] ?? '',
      exchange: f[idx.exchange!] ?? '',
    });
  }
  return out;
}

/** Lookup tables over one day's instruments dump. */
export class InstrumentBook {
  private byToken = new Map<number, Instrument>();
  private bySym = new Map<string, Instrument>();
  private derivs = new Map<string, Instrument[]>();
  constructor(readonly rows: Instrument[], readonly day: string) {
    for (const r of rows) {
      this.byToken.set(r.token, r);
      this.bySym.set(`${r.exchange}:${r.symbol}`, r);
      if (r.type === 'FUT' || r.type === 'CE' || r.type === 'PE') {
        const k = `${r.exchange}:${r.name}`;
        const l = this.derivs.get(k);
        if (l) l.push(r);
        else this.derivs.set(k, [r]);
      }
    }
  }
  get size(): number {
    return this.rows.length;
  }
  token(token: number): Instrument | undefined {
    return this.byToken.get(token);
  }
  /** e.g. symbol("NSE", "NIFTY 50") for the index, symbol("NSE", "RELIANCE") for the equity. */
  symbol(exchange: string, symbol: string): Instrument | undefined {
    return this.bySym.get(`${exchange}:${symbol}`);
  }
  /** Futures of an underlying on a derivatives exchange (NFO, BFO, MCX), soonest expiry first. */
  futures(exchange: string, underlying: string): Instrument[] {
    return (this.derivs.get(`${exchange}:${underlying}`) ?? []).filter((r) => r.type === 'FUT').sort((a, b) => a.expiry.localeCompare(b.expiry));
  }
  /** Options of an underlying, optionally for one expiry and one side, ordered by expiry then strike. */
  options(exchange: string, underlying: string, expiry?: string, side?: 'CE' | 'PE'): Instrument[] {
    return (this.derivs.get(`${exchange}:${underlying}`) ?? [])
      .filter((r) => (r.type === 'CE' || r.type === 'PE') && (!expiry || r.expiry === expiry) && (!side || r.type === side))
      .sort((a, b) => a.expiry.localeCompare(b.expiry) || a.strike - b.strike);
  }
  /** Distinct option expiries of an underlying, soonest first. */
  expiries(exchange: string, underlying: string): string[] {
    return [...new Set(this.options(exchange, underlying).map((r) => r.expiry))].sort();
  }
}
