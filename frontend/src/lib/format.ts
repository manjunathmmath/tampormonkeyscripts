export const nf = (n: number | null | undefined, d = 2): string => (n == null || Number.isNaN(n) ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const nfi = (n: number | null | undefined): string => (n == null || Number.isNaN(n) ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 }));
export const sign = (n: number): string => (n > 0 ? '+' : n < 0 ? '−' : '');
export const signed = (n: number | null | undefined, d = 2): string => (n == null || Number.isNaN(n) ? '—' : `${sign(n)}${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
export const tone = (n: number | null | undefined): 'up' | 'dn' | 'flat' => (n == null || n === 0 || Number.isNaN(n) ? 'flat' : n > 0 ? 'up' : 'dn');

const IST = 5.5 * 3600 * 1000;
/** IST wall clock for a timestamp. */
export function istParts(ms = Date.now()): { day: string; minutes: number; weekday: number } {
  const d = new Date(ms + IST);
  return { day: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday: d.getUTCDay() };
}
/** NSE cash session: weekdays 09:15 to 15:30 IST (holidays are not known to the app yet). */
interface SessionInfo { nse: { day: string; ticking: boolean; source: string }; mcx: { day: string; ticking: boolean; source: string }; at: number }
let session: SessionInfo | null = null;
/** what the server's data says: each market's session day and whether it is ticking right now (decides the day and open state before any calendar does) */
export function setSession(s: { nse: SessionInfo['nse']; mcx: SessionInfo['mcx'] } | null): void {
  session = s ? { ...s, at: Date.now() } : null;
}
const sessionFresh = (): SessionInfo | null => (session && Date.now() - session.at < 180000 ? session : null);
let nseHolidays = new Set<string>();
/** the NSE trading holidays (from the backend): NSE shows the previous trading day on them, and commodities only trade in the evening */
export function setHolidays(days: string[]): void {
  nseHolidays = new Set(days);
}
export const isNseHoliday = (day: string): boolean => nseHolidays.has(day);
/** true once the server's data says NSE is not trading although it is past the opening time (a holiday or an early close) */
export const nseQuietNow = (): boolean => { const ss = sessionFresh(); const p = istParts(Date.now()); return !!ss && !ss.nse.ticking && p.minutes >= 9 * 60 + 20; };

export function marketState(ms = Date.now(), mcx = false): { open: boolean; label: string } {
  const p = istParts(ms);
  const ss = ms === undefined || Math.abs(ms - Date.now()) < 5000 ? sessionFresh() : null;
  if (ss) {
    const t = mcx ? ss.mcx.ticking : ss.nse.ticking;
    return t ? { open: true, label: mcx ? 'MCX open' : 'Market open' } : { open: false, label: mcx ? 'MCX closed' : 'Closed' };
  }
  if (p.weekday === 0 || p.weekday === 6) return { open: false, label: 'Closed · weekend' };
  if (!mcx && nseHolidays.has(p.day)) return { open: false, label: 'Closed · NSE holiday' };
  // commodities (MCX) trade from 09:00 until late evening (23:55 is used so the winter 23:30 close and the summer 23:55 close are both covered)
  if (mcx) return p.minutes >= (nseHolidays.has(p.day) ? 17 * 60 : 9 * 60) && p.minutes <= 23 * 60 + 55 ? { open: true, label: 'MCX open' } : { open: false, label: 'MCX closed' };
  if (p.minutes < 9 * 60) return { open: false, label: 'Closed · opens 09:15' };
  if (p.minutes < 9 * 60 + 15) return { open: false, label: 'Pre-open' };
  if (p.minutes <= 15 * 60 + 30) return { open: true, label: 'Market open' };
  return { open: false, label: 'Closed' };
}
/** is anything trading right now: NSE, or the commodity market in the evening */
export const anyMarketOpen = (ms = Date.now()): boolean => marketState(ms).open || marketState(ms, true).open;
export const addDays = (day: string, n: number): string => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
/** the previous weekday that is not an NSE holiday */
function prevTradingWeekday(day: string): string {
  let d = prevWeekday(day);
  for (let i = 0; i < 10 && nseHolidays.has(d); i++) d = prevWeekday(d);
  return d;
}
/** Previous weekday (holidays unknown). */
export function prevWeekday(day: string): string {
  let d = addDays(day, -1);
  while ([0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay())) d = addDays(d, -1);
  return d;
}
export function nextWeekday(day: string): string {
  let d = addDays(day, 1);
  while ([0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay())) d = addDays(d, 1);
  return d;
}
export const prettyDay = (day: string): string => new Date(day + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

let dayOverride: string | null = null;
/** the Settings trading day (blank = follow today); every screen reads it through `tradingDayNow()` */
export function setDayOverride(d: string | null): void {
  dayOverride = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

let mcxOverride: string | null = null;
/** the Settings MCX trading day (blank = follow the latest MCX session) */
export function setMcxDayOverride(d: string | null): void {
  mcxOverride = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}
export const getDayOverrides = (): { nse: string | null; mcx: string | null } => ({ nse: dayOverride, mcx: mcxOverride });

/** The MCX session day: today from 09:00 IST on a weekday (MCX opens before NSE and runs into the night), else the previous weekday. */
export function mcxDayNow(ms?: number): string {
  if (ms === undefined && mcxOverride) return mcxOverride;
  if (ms === undefined && sessionFresh()) return sessionFresh()!.mcx.day;
  const p = istParts(ms ?? Date.now());
  if (p.weekday === 0 || p.weekday === 6) return prevWeekday(p.day);
  if (nseHolidays.has(p.day)) return p.minutes < 17 * 60 ? prevWeekday(p.day) : p.day; // an NSE holiday: only the commodity evening session trades
  return p.minutes < 9 * 60 ? prevWeekday(p.day) : p.day;
}

let mcxNames = new Set<string>();
/** the names that trade on MCX (from the backend), so each screen uses its own market's day */
export function setMcxNames(n: string[]): void {
  mcxNames = new Set(n);
}
export const isMcxName = (n: string): boolean => mcxNames.has(n);
/** the day a name's screens show: its own market's */
export const dayFor = (name: string, ms?: number): string => (mcxNames.has(name) ? mcxDayNow(ms) : tradingDayNow(ms));

let snapshot = '';
/** the snapshot end time (HH:MM): every read stops there, as the userscript's snapshot picker did; blank = live */
export function setSnapshot(t: string): void {
  snapshot = /^\d{2}:\d{2}$/.test(t) ? t : '';
}
export const getSnapshot = (): string => snapshot;
/** `&asOf=HH:MM` when a snapshot time is set */
export const asOfQuery = (): string => (snapshot ? `&asOf=${snapshot}` : '');

/** The trading day the app should show now: the Settings day when one is set, else today during/after the session, else the previous weekday. */
export function tradingDayNow(ms?: number): string {
  if (ms === undefined && dayOverride) return dayOverride;
  if (ms === undefined && sessionFresh()) return sessionFresh()!.nse.day;
  const p = istParts(ms ?? Date.now());
  const weekend = p.weekday === 0 || p.weekday === 6;
  if (weekend) return prevTradingWeekday(p.day);
  if (p.minutes < 9 * 60 + 15 || nseHolidays.has(p.day)) return prevTradingWeekday(p.day);
  return p.day;
}

/** "5 s", "12 min", "3 h 05 min", "2 d 4 h": how long ago (or how long a duration is), for the System screen. */
export function span(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${String(m % 60).padStart(2, '0')} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}
