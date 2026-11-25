import type { KeyValueStore } from '../store/fileStore.js';

export interface GlobalDef { sym: string; label: string; usdUnit: string; /** MCX units per one global unit, before the exchange rate */ unit: number; per: string }
const OZ = 31.1035;
const LB_PER_KG = 2.20462262;

/** Which global contract prices each MCX commodity, and how to convert it (price in USD x USDINR x unit = the MCX quote basis). */
export const GLOBAL: Record<string, GlobalDef> = {
  GOLD: { sym: 'GC=F', label: 'COMEX gold', usdUnit: '$/oz', unit: 10 / OZ, per: '10 g' },
  GOLDM: { sym: 'GC=F', label: 'COMEX gold', usdUnit: '$/oz', unit: 10 / OZ, per: '10 g' },
  SILVER: { sym: 'SI=F', label: 'COMEX silver', usdUnit: '$/oz', unit: 1000 / OZ, per: 'kg' },
  SILVERM: { sym: 'SI=F', label: 'COMEX silver', usdUnit: '$/oz', unit: 1000 / OZ, per: 'kg' },
  SILVERMIC: { sym: 'SI=F', label: 'COMEX silver', usdUnit: '$/oz', unit: 1000 / OZ, per: 'kg' },
  CRUDEOIL: { sym: 'CL=F', label: 'NYMEX WTI crude', usdUnit: '$/bbl', unit: 1, per: 'barrel' },
  CRUDEOILM: { sym: 'CL=F', label: 'NYMEX WTI crude', usdUnit: '$/bbl', unit: 1, per: 'barrel' },
  NATURALGAS: { sym: 'NG=F', label: 'NYMEX natural gas', usdUnit: '$/mmBtu', unit: 1, per: 'mmBtu' },
  NATGASMINI: { sym: 'NG=F', label: 'NYMEX natural gas', usdUnit: '$/mmBtu', unit: 1, per: 'mmBtu' },
  COPPER: { sym: 'HG=F', label: 'COMEX copper', usdUnit: '$/lb', unit: LB_PER_KG, per: 'kg' },
};
export const FX_SYM = 'USDINR=X';

export interface Pt { t: number; c: number }
export interface Series { pts: Pt[]; last: number | null; lastAt: number | null }

/** The last value at or before `t` (ms), when one lies within `tolMs`; else the closest earlier one, else null. */
export function priceAt(pts: Pt[], t: number, tolMs = 90 * 60000): number | null {
  let best: Pt | null = null;
  for (const p of pts) if (p.t <= t && (!best || p.t > best.t)) best = p;
  if (best && t - best.t <= tolMs) return best.c;
  return best ? best.c : null;
}

export const parity = (usd: number, fx: number, unit: number): number => usd * fx * unit;
export const basisOf = (mcx: number, usd: number, fx: number, unit: number): number => mcx / parity(usd, fx, unit);

export interface CalcRow {
  name: string;
  global: { label: string; sym: string; usdUnit: string; per: string; unit: number };
  mcx: { last: number | null; at: number | null; open: boolean };
  usd: { now: number | null; at: number | null; atMcxClose: number | null; changePct: number | null };
  fx: { now: number | null; atMcxClose: number | null };
  /** the conversion with no premium, and the premium MCX was trading at (1.06 = 6% above parity) */
  parity: number | null;
  basis: number | null;
  basisAt: number | null;
  basisSource: 'last close' | 'live' | 'saved' | null;
  estimate: number | null;
  gap: number | null;
  gapPct: number | null;
  /** with MCX open: how far its price is from the estimate (positive = MCX rich) */
  note: string;
}

export interface McxCalcDeps {
  store: KeyValueStore;
  names: () => string[];
  /** MCX's last traded price and its time (ms) for a commodity; null when unavailable */
  mcxLast: (name: string) => Promise<{ ltp: number; at: number } | null>;
  /** is the commodity market trading right now */
  mcxOpen: () => boolean;
  fetchSeries?: (sym: string) => Promise<Series>;
  now?: () => number;
}

async function yahooSeries(sym: string): Promise<Series> {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=5m&range=2d`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${sym}: HTTP ${r.status}`);
  const j = (await r.json()) as { chart: { result?: { timestamp?: number[]; meta: { regularMarketPrice?: number; regularMarketTime?: number }; indicators: { quote: { close?: (number | null)[] }[] } }[] } };
  const res = j.chart.result?.[0];
  if (!res) throw new Error(`${sym}: no data`);
  const ts = res.timestamp ?? [];
  const cl = res.indicators.quote[0]?.close ?? [];
  const pts: Pt[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = cl[i];
    if (c !== null && c !== undefined && Number.isFinite(c)) pts.push({ t: ts[i]! * 1000, c });
  }
  const live = Number(res.meta.regularMarketPrice);
  const at = Number(res.meta.regularMarketTime);
  const lastPt = pts[pts.length - 1];
  // the meta price is the freshest; the candle list is what lets us look back to the MCX close
  return { pts, last: Number.isFinite(live) ? live : lastPt?.c ?? null, lastAt: Number.isFinite(at) ? at * 1000 : lastPt?.t ?? null };
}

interface SavedBasis { basis: number; at: number; mcx: number; usd: number; fx: number }

/**
 * An estimate of an MCX price from the live COMEX / NYMEX price and USDINR. The conversion alone ignores import duty, local premium and the contract month,
 * so the premium MCX was trading at when it last closed (its last price against the global price at that same moment) is measured and carried forward:
 * estimate = basis x live global x USDINR x unit. While MCX is open the saved basis from its last close is used, so the gap shows when MCX is rich or cheap.
 */
export class McxCalcService {
  private cache = new Map<string, { at: number; s: Series }>();
  private readonly now: () => number;
  constructor(private readonly d: McxCalcDeps) {
    this.now = d.now ?? Date.now;
  }

  invalidate(): void {
    this.cache.clear();
  }

  private async series(sym: string): Promise<Series | null> {
    const hit = this.cache.get(sym);
    if (hit && this.now() - hit.at < 30000) return hit.s;
    try {
      const s = await (this.d.fetchSeries ?? yahooSeries)(sym);
      this.cache.set(sym, { at: this.now(), s });
      return s;
    } catch {
      return hit?.s ?? null;
    }
  }

  private saved(): Record<string, SavedBasis> {
    return this.d.store.get<Record<string, SavedBasis>>('mcxcalc.basis') ?? {};
  }

  async load(): Promise<{ at: number; rows: CalcRow[]; errors: string[] }> {
    const errors: string[] = [];
    const fx = await this.series(FX_SYM);
    if (!fx) errors.push('USDINR could not be read');
    const open = this.d.mcxOpen();
    const sv = this.saved();
    const rows: CalcRow[] = [];
    for (const name of this.d.names()) {
      const g = GLOBAL[name];
      if (!g) continue;
      const gs = await this.series(g.sym);
      if (!gs) errors.push(`${g.label} could not be read`);
      const mx = await this.d.mcxLast(name).catch(() => null);
      const usdNow = gs?.last ?? null;
      const fxNow = fx?.last ?? null;
      const par = usdNow && fxNow ? parity(usdNow, fxNow, g.unit) : null;
      let usdAtClose: number | null = null;
      let fxAtClose: number | null = null;
      let basis: number | null = null;
      let basisAt: number | null = null;
      let source: CalcRow['basisSource'] = null;
      if (mx && gs && fx) {
        usdAtClose = priceAt(gs.pts, mx.at);
        fxAtClose = priceAt(fx.pts, mx.at);
      }
      if (open) {
        // MCX is trading: judge it against the premium it had at its last close
        const s = sv[name];
        if (s) { basis = s.basis; basisAt = s.at; source = 'saved'; }
        else if (mx && usdNow && fxNow) { basis = basisOf(mx.ltp, usdNow, fxNow, g.unit); basisAt = mx.at; source = 'live'; }
      } else if (mx && usdAtClose && fxAtClose) {
        basis = basisOf(mx.ltp, usdAtClose, fxAtClose, g.unit);
        basisAt = mx.at;
        source = 'last close';
        if (!sv[name] || sv[name]!.at < mx.at) { sv[name] = { basis, at: mx.at, mcx: mx.ltp, usd: usdAtClose, fx: fxAtClose }; this.d.store.set('mcxcalc.basis', sv); }
      } else if (sv[name]) {
        basis = sv[name]!.basis; basisAt = sv[name]!.at; source = 'saved';
      }
      const est = basis && par ? basis * par : null;
      const gap = est != null && mx ? est - mx.ltp : null;
      const gapPct = est != null && mx && mx.ltp ? (est / mx.ltp - 1) * 100 : null;
      const chg = usdNow && usdAtClose ? (usdNow / usdAtClose - 1) * 100 : null;
      rows.push({
        name,
        global: { label: g.label, sym: g.sym, usdUnit: g.usdUnit, per: g.per, unit: g.unit },
        mcx: { last: mx?.ltp ?? null, at: mx?.at ?? null, open },
        usd: { now: usdNow, at: gs?.lastAt ?? null, atMcxClose: usdAtClose, changePct: chg },
        fx: { now: fxNow, atMcxClose: fxAtClose },
        parity: par, basis, basisAt, basisSource: source, estimate: est, gap, gapPct,
        note: !mx ? 'MCX price not available yet' : !basis ? 'calibrating: needs an MCX price and the global price at the same time' : open ? (gapPct != null && Math.abs(gapPct) < 0.15 ? 'MCX is trading in line with the global price' : gapPct != null && gapPct > 0 ? 'MCX is below the global-implied price (cheap)' : 'MCX is above the global-implied price (rich)') : 'MCX is closed: this is where it would trade if it opened now',
      });
    }
    return { at: this.now(), rows, errors: [...new Set(errors)] };
  }
}
