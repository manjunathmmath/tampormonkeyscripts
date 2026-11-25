/**
 * Trading days for the two markets. NSE and MCX are separate because MCX trades when NSE is closed (an NSE holiday, the evening session, Diwali muhurat),
 * so each has its own "current day" and "previous day" (Settings), and a name uses the day of its own market.
 */
const IST_MS = 5.5 * 3600 * 1000;

const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const weekday = (day: string): number => new Date(`${day}T00:00:00Z`).getUTCDay();
const prevWeekday = (day: string): string => {
  let d = addDays(day, -1);
  while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, -1);
  return d;
};

/** the latest MCX session day: today from 09:00 IST on a weekday, else the previous weekday (MCX opens at 09:00, NSE at 09:15) */
export function defaultMcxDay(nowMs: number = Date.now(), nseHolidays: ReadonlySet<string> = new Set()): string {
  const ist = new Date(nowMs + IST_MS);
  const day = ist.toISOString().slice(0, 10);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const wd = weekday(day);
  if (wd === 0 || wd === 6) return prevWeekday(day);
  // on an NSE holiday the commodity morning session is closed and only the evening session (from 17:00) trades
  if (nseHolidays.has(day)) return minutes < 17 * 60 ? prevWeekday(day) : day;
  return minutes < 9 * 60 ? prevWeekday(day) : day;
}

export type Market = 'NSE' | 'MCX';

export interface DayRules {
  /** true for a commodity (a name with MCX futures) */
  isMcx(name: string): boolean;
  /** the Settings "previous day" of a market when `day` is that market's configured current day, else undefined */
  override(market: Market, day: string): string | undefined;
}
