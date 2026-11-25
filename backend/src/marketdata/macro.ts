import type { KeyValueStore } from '../store/fileStore.js';
import { MC_DRIVERS, analyse, parseYieldText, read, verdict, type Driver, type MacroRow, type MacroVerdict, type Point } from '../engine/macro.js';

const TTL = 5 * 60 * 1000;

export interface MacroRead {
  ts: number;
  verdict: MacroVerdict;
  rows: (Omit<MacroRow, 'def'> & { key: string; label: string; unit: string; dec: number; group: string; info?: string; reading: string })[];
  errors: string[];
}

type Fetcher = (sym: string, range: string) => Promise<{ pts: Point[]; live: number | null }>;

async function yahoo(sym: string, range: string): Promise<{ pts: Point[]; live: number | null }> {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=${range}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = (await r.json()) as { chart: { result: { timestamp?: number[]; meta: { regularMarketPrice?: number }; indicators: { quote: { close?: (number | null)[] }[] } }[] } };
  const res = j.chart.result[0]!;
  const ts = res.timestamp ?? [];
  const cl = res.indicators.quote[0]?.close ?? [];
  const pts: Point[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = cl[i];
    if (c !== null && c !== undefined && Number.isFinite(c)) pts.push({ d: new Date(ts[i]! * 1000 + 5.5 * 3600000).toISOString().slice(0, 10), c });
  }
  const live = Number(res.meta.regularMarketPrice);
  return { pts, live: Number.isFinite(live) ? live : null };
}

/** The Macro backdrop: Yahoo daily closes per driver (5-minute cache), the India 10Y index accumulated one value a day, and an India 10Y yield you paste in. */
export class MacroService {
  private cache: { ts: number; day: string; out: MacroRead } | null = null;
  private inflight: Promise<MacroRead> | null = null;

  invalidate(): void {
    this.cache = null;
  }
  constructor(
    private readonly store: KeyValueStore,
    private readonly fetcher: Fetcher = yahoo,
    private readonly now: () => number = Date.now,
  ) {}

  private today(): string {
    return new Date(this.now() + 5.5 * 3600000).toISOString().slice(0, 10);
  }

  private accumulate(key: string, pts: Point[], live: number | null): Point[] {
    const k = `macro_hist_${key}`;
    const st = this.store.get<Record<string, number>>(k) ?? {};
    for (const p of pts) st[p.d] = p.c;
    if (live && Number.isFinite(live)) st[this.today()] = live;
    const days = Object.keys(st).sort().slice(-90);
    const out: Record<string, number> = {};
    for (const d of days) out[d] = st[d]!;
    this.store.set(k, out);
    return days.map((d) => ({ d, c: out[d]! }));
  }

  manual(): Point[] {
    return this.store.get<Point[]>('macro_in10y') ?? [];
  }

  /** Paste rows like "25-09-2026<TAB>7.120..."; returns how many were kept and how many lines were unreadable. */
  saveManual(text: string, replace = false): { kept: number; bad: number; total: number } {
    const { rows, bad } = parseYieldText(text);
    const map = new Map<string, number>();
    if (!replace) for (const p of this.manual()) map.set(p.d, p.c);
    for (const p of rows) map.set(p.d, p.c);
    const all = [...map.keys()].sort().map((d) => ({ d, c: map.get(d)! }));
    this.store.set('macro_in10y', all);
    this.cache = null;
    return { kept: rows.length, bad, total: all.length };
  }

  private async fetchOne(def: Driver): Promise<{ def: Driver; pts: Point[]; live: number | null }> {
    if (def.manual) {
      const pts = this.manual();
      if (pts.length < 3) throw new Error('no data yet, paste the Investing.com history');
      return { def, pts, live: pts[pts.length - 1]!.c };
    }
    const raw = await this.fetcher(def.sym, '3mo');
    const pts = def.accumulate ? this.accumulate(def.key, raw.pts, raw.live) : raw.pts;
    if (pts.length < (def.accumulate ? 1 : 3)) throw new Error('too few data points');
    return { def, pts, live: raw.live };
  }

  async load(day?: string): Promise<MacroRead> {
    const snap = day ?? this.today();
    const c = this.cache;
    if (c && c.day === snap && this.now() - c.ts < TTL) return c.out;
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      const errors: string[] = [];
      const got = await Promise.all(MC_DRIVERS.map((d) => this.fetchOne(d).catch((e: Error) => (errors.push(`${d.label}: ${e.message}`), null))));
      const rows = got.filter((g): g is NonNullable<typeof g> => !!g).map((g) => analyse(g.def, { pts: g.pts, live: g.live }, snap, this.today()));
      const fed = this.store.get<number>('macro_fed_manual') ?? null;
      const out: MacroRead = {
        ts: this.now(),
        verdict: verdict(rows),
        rows: rows.map(({ def, ...r }) => ({ ...r, key: def.key, label: def.label, unit: def.unit, dec: def.dec, group: def.group, info: def.info, reading: read({ def, ...r }, fed) })),
        errors,
      };
      this.cache = { ts: this.now(), day: snap, out };
      return out;
    })().finally(() => (this.inflight = null));
    return this.inflight;
  }
}
