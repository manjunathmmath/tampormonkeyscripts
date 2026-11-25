import type { KeyValueStore } from '../store/fileStore.js';

export interface Holiday {
  /** YYYY-MM-DD */
  date: string;
  desc: string;
}

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

/** NSE writes dates as "26-Jan-2026"; returns YYYY-MM-DD, or null when it cannot be read. */
export function parseNseDate(s: string): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(String(s).trim());
  if (!m || !MONTHS[m[2]!.toLowerCase()]) return null;
  return `${m[3]}-${MONTHS[m[2]!.toLowerCase()]}-${m[1]!.padStart(2, '0')}`;
}

/** The trading-holiday part of NSE's holiday-master answer (the FO segment, else CM). */
export function parseHolidayMaster(json: unknown): Holiday[] {
  const j = json as Record<string, { tradingDate?: string; description?: string }[] | undefined>;
  const seg = j?.['FO'] ?? j?.['CM'] ?? [];
  const out: Holiday[] = [];
  for (const h of seg) {
    const d = parseNseDate(h.tradingDate ?? '');
    if (d) out.push({ date: d, desc: h.description ?? '' });
  }
  return out;
}

interface Saved {
  ts: number;
  data: Holiday[];
}

const WEEK = 7 * 86400000;
const RETRY = 6 * 3600000;

/**
 * The NSE trading-holiday list, refreshed weekly and saved. NSE often blocks scripted calls, so a failed refresh keeps the saved list (retried every 6 hours);
 * the list is a calendar year, so a saved copy stays useful. Weekends are not holidays here: the date helpers handle them.
 */
export class HolidayService {
  private cur: Holiday[] = [];
  private lastTry = 0;
  error: string | null = null;
  constructor(
    private readonly store: KeyValueStore,
    private readonly fetchJson: (url: string) => Promise<unknown> = async (u) => {
      const r = await fetch(u, { headers: { Accept: 'application/json', Referer: 'https://www.nseindia.com/', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    private readonly now: () => number = Date.now,
  ) {
    const s = store.get<Saved>('holidays');
    if (s?.data) this.cur = s.data;
  }

  list(): Holiday[] {
    return this.cur;
  }

  set(): ReadonlySet<string> {
    return new Set(this.cur.map((h) => h.date));
  }

  isHoliday(day: string): boolean {
    return this.cur.some((h) => h.date === day);
  }

  async load(force = false): Promise<Holiday[]> {
    const saved = this.store.get<Saved>('holidays');
    const t = this.now();
    if (!force && saved && t - saved.ts < WEEK && saved.data.length) return (this.cur = saved.data);
    if (!force && saved?.data.length && t - this.lastTry < RETRY) return (this.cur = saved.data);
    this.lastTry = t;
    try {
      const list = parseHolidayMaster(await this.fetchJson('https://www.nseindia.com/api/holiday-master?type=trading'));
      if (!list.length) throw new Error('NSE returned an empty holiday list');
      this.store.set<Saved>('holidays', { ts: t, data: list });
      this.error = null;
      return (this.cur = list);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      if (saved?.data) this.cur = saved.data;
      return this.cur;
    }
  }
}
