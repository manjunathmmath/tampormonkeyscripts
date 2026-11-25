import type { KeyValueStore } from '../store/fileStore.js';

export interface WallLevel {
  price: number;
  /** R = call wall above (resistance), S = put wall below (support) */
  side: 'R' | 'S';
  label: string;
  /** distance of the price from the level, percent of the level (positive = price above it) */
  distPct: number;
}

export interface TrackedView {
  name: string;
  spot: number | null;
  walls: WallLevel[];
  nearestR: WallLevel | null;
  nearestS: WallLevel | null;
  error?: string;
  /** alerts already raised today for this name */
  today: { at: number; stage: 'APPROACHING' | 'AT'; level: number; side: 'R' | 'S'; label: string }[];
}

export interface TrackingDeps {
  store: KeyValueStore;
  /** the support / resistance zones of a name (the same read the Strong support and resistance card uses) */
  levels: (name: string, day: string) => Promise<{ spot: number; zones: { price: number; items: { src: string }[] }[] } | null>;
  today: () => string;
  /** the day the app is showing (the last trading day when the market is closed): used for the read, never for alerts */
  viewDay?: () => string;
  now?: () => number;
  /** is the NSE session open (alerts only while it is) */
  open: (now: number) => boolean;
  /** raises an alert (banner and Telegram) */
  raise: (a: { name: string; kind: 'LEVEL_NEAR' | 'LEVEL_AT'; title: string; text: string }) => void;
}

/** price within this share of a wall, on the approach side, raises the first alert; within the second share (either side) the second */
export const NEAR_PCT = 0.6;
export const AT_PCT = 0.15;
/** a level is armed again once price is this far from it */
export const REARM_PCT = 1.2;
const MAX_TRACKED = 40;

/** The OI walls of a zone list: the ranked call / put writing walls the OI charts label R1 / R2 / S1 / S2. */
export function wallsOf(spot: number, zones: { price: number; items: { src: string }[] }[]): WallLevel[] {
  const out: WallLevel[] = [];
  for (const z of zones) {
    for (const it of z.items) {
      const m = /^OI wall ([RS]\d)/.exec(it.src);
      if (!m) continue;
      out.push({ price: z.price, side: m[1]!.startsWith('R') ? 'R' : 'S', label: m[1]!, distPct: ((spot - z.price) / z.price) * 100 });
      break;
    }
  }
  return out.sort((a, b) => a.price - b.price);
}

/**
 * Stock tracking alerts: for each tracked name, watch the price against its OI support and resistance walls and raise an alert when it nears one
 * (within 0.6% on the approach side) and again when it is at it (within 0.15%). One alert per level and stage per day; a level arms again once price is 1.2% away.
 * It only tells you; it never touches an order.
 */
export class TrackingService {
  private fired = new Map<string, 'APPROACHING' | 'AT'>();
  private firedDay = '';
  private log: (TrackedView['today'][number] & { name: string })[] = [];
  constructor(private readonly d: TrackingDeps) {}

  names(): string[] {
    return this.d.store.get<string[]>('tracking') ?? [];
  }

  add(name: string): string[] {
    const n = String(name).toUpperCase().replace(/[^A-Z0-9&_-]/g, '').slice(0, 30);
    if (!n) throw new Error('name is required');
    const cur = this.names();
    if (cur.includes(n)) return cur;
    if (cur.length >= MAX_TRACKED) throw new Error(`track up to ${MAX_TRACKED} names`);
    const next = [...cur, n];
    this.d.store.set('tracking', next);
    return next;
  }

  remove(name: string): string[] {
    const next = this.names().filter((x) => x !== name);
    this.d.store.set('tracking', next);
    return next;
  }

  private resetDay(): void {
    const day = this.d.today();
    if (day !== this.firedDay) {
      this.firedDay = day;
      this.fired.clear();
      this.log = [];
    }
  }

  /** the pure decision for one level: what stage the price is in, or null */
  static stage(side: 'R' | 'S', spot: number, level: number): 'APPROACHING' | 'AT' | null {
    const d = ((spot - level) / level) * 100;
    if (Math.abs(d) <= AT_PCT) return 'AT';
    if (side === 'R' && d < 0 && -d <= NEAR_PCT) return 'APPROACHING';
    if (side === 'S' && d > 0 && d <= NEAR_PCT) return 'APPROACHING';
    return null;
  }

  /** one pass over the tracked names; returns how many alerts it raised */
  async tick(): Promise<number> {
    const now = (this.d.now ?? Date.now)();
    if (!this.d.open(now)) return 0;
    this.resetDay();
    let n = 0;
    for (const name of this.names()) {
      let r: Awaited<ReturnType<TrackingDeps['levels']>>;
      try {
        r = await this.d.levels(name, this.d.today());
      } catch {
        continue;
      }
      if (!r) continue;
      const walls = wallsOf(r.spot, r.zones);
      const others = walls.map((w) => `${w.label} ${Math.round(w.price)}`).join(', ');
      for (const w of walls) {
        const key = `${name}|${w.label}|${Math.round(w.price)}`;
        const st = TrackingService.stage(w.side, r.spot, w.price);
        const prev = this.fired.get(key);
        if (!st) {
          if (Math.abs(w.distPct) >= REARM_PCT) this.fired.delete(key);
          continue;
        }
        if (prev === 'AT' || prev === st) continue;
        this.fired.set(key, st);
        const res = w.side === 'R';
        const gap = Math.abs(w.distPct).toFixed(2);
        const title = `${st === 'AT' ? 'AT' : 'NEAR'} ${res ? 'RESISTANCE' : 'SUPPORT'}: ${name}`;
        const text = `${name} at ${r.spot.toFixed(2)} is ${st === 'AT' ? 'at' : `${gap}% from`} its OI ${res ? 'call-writing resistance' : 'put-writing support'} wall ${w.label} (${Math.round(w.price)}). Other walls: ${others || 'none'}. Option positioning, not a forecast; nothing is traded.`;
        this.log.push({ name, at: now, stage: st, level: w.price, side: w.side, label: w.label });
        this.d.raise({ name, kind: st === 'AT' ? 'LEVEL_AT' : 'LEVEL_NEAR', title, text });
        n++;
      }
    }
    return n;
  }

  /** the tracked names with their price and nearest walls (a read, no alerts) */
  async view(): Promise<TrackedView[]> {
    const out: TrackedView[] = [];
    this.resetDay();
    for (const name of this.names()) {
      const today = this.log.filter((l) => l.name === name).map(({ name: _n, ...rest }) => rest);
      try {
        const r = await this.d.levels(name, this.d.viewDay?.() ?? this.d.today());
        if (!r) {
          out.push({ name, spot: null, walls: [], nearestR: null, nearestS: null, error: 'no option chain loaded yet', today });
          continue;
        }
        const walls = wallsOf(r.spot, r.zones);
        const above = walls.filter((w) => w.price >= r.spot).sort((a, b) => a.price - b.price);
        const below = walls.filter((w) => w.price < r.spot).sort((a, b) => b.price - a.price);
        out.push({ name, spot: r.spot, walls, nearestR: above.find((w) => w.side === 'R') ?? null, nearestS: below.find((w) => w.side === 'S') ?? null, today });
      } catch (e) {
        out.push({ name, spot: null, walls: [], nearestR: null, nearestS: null, error: e instanceof Error ? e.message : String(e), today });
      }
    }
    return out;
  }
}
