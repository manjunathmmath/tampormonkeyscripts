/**
 * Checks of the Settings that catch a mistake before it shows up as an empty screen: dates in the future or on a weekend or a holiday, a "current day" left on
 * from an earlier day, a previous day that is not the day before, expiries that are no longer listed or have already passed, and numbers that look like typos.
 * Pure: the caller passes the current values and the calendar.
 */
export type Level = 'error' | 'warn' | 'info';

export interface Warning {
  /** the setting the message is about */
  key: string;
  level: Level;
  text: string;
}

export interface WarnInput {
  /** the effective value of every setting (blank = automatic) */
  value: (key: string) => string | number | boolean;
  /** milliseconds now */
  now: number;
  /** NSE holidays (YYYY-MM-DD) */
  holidays: ReadonlySet<string>;
  /** the listed expiries a select field may take; null when the list is not known */
  choices: (key: string) => string[] | null;
  /** the commodity expiry keys, so they can be checked too */
  expiryKeys: string[];
}

const IST_MS = 5.5 * 3600 * 1000;
const addDays = (d: string, n: number): string => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const weekday = (d: string): number => new Date(`${d}T00:00:00Z`).getUTCDay();
const isWeekend = (d: string): boolean => weekday(d) === 0 || weekday(d) === 6;
const dayName = (d: string): string => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday(d)]!;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** the day before, skipping weekends (and NSE holidays for NSE) */
function calendarPrev(day: string, market: 'NSE' | 'MCX', holidays: ReadonlySet<string>): string {
  let d = addDays(day, -1);
  while (isWeekend(d) || (market === 'NSE' && holidays.has(d))) d = addDays(d, -1);
  return d;
}

/** the latest session day of a market as of now */
function latestDay(now: number, market: 'NSE' | 'MCX', holidays: ReadonlySet<string>): string {
  const ist = new Date(now + IST_MS);
  let d = ist.toISOString().slice(0, 10);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (minutes < (market === 'NSE' ? 9 * 60 + 15 : 9 * 60)) d = addDays(d, -1);
  while (isWeekend(d) || (market === 'NSE' && holidays.has(d))) d = addDays(d, -1);
  return d;
}

const NAMES: Record<string, string> = {
  nifty_expiry_date: 'NIFTY options expiry',
  banknifty_expiry_date: 'BANK NIFTY options expiry',
  sensex_expiry_date: 'SENSEX options expiry',
  fo_stocks_expiry_date: 'F&O stocks options expiry',
};

function checkDays(w: Warning[], i: WarnInput, market: 'NSE' | 'MCX'): void {
  const [curKey, prevKey] = market === 'NSE' ? ['current_day_date', 'previous_day_date'] : ['mcx_current_day_date', 'mcx_previous_day_date'];
  const label = market === 'NSE' ? 'NSE' : 'MCX';
  const today = new Date(i.now + IST_MS).toISOString().slice(0, 10);
  const latest = latestDay(i.now, market, i.holidays);
  const cur = String(i.value(curKey) ?? '');
  const prev = String(i.value(prevKey) ?? '');

  if (cur && DATE_RE.test(cur)) {
    if (cur > today) w.push({ key: curKey, level: 'error', text: `${cur} is in the future: there is no data for it yet. Clear it to follow the latest ${label} session (${latest}).` });
    else {
      if (isWeekend(cur)) w.push({ key: curKey, level: 'warn', text: `${cur} is a ${dayName(cur)}: ${label} has no session that day, so the screens will be empty. The last session before it is ${calendarPrev(addDays(cur, 1), market, i.holidays)}.` });
      else if (market === 'NSE' && i.holidays.has(cur)) w.push({ key: curKey, level: 'warn', text: `${cur} is an NSE holiday: there are no NSE candles that day. (If MCX traded, set it under MCX DATES instead.)` });
      if (cur < latest) {
        const days = Math.round((Date.parse(`${latest}T00:00:00Z`) - Date.parse(`${cur}T00:00:00Z`)) / 86400000);
        w.push({ key: curKey, level: 'info', text: `You are looking at ${label} ${cur}, ${days} day${days === 1 ? '' : 's'} before the latest session (${latest}). Clear it to follow the live market.` });
      }
    }
  } else if (cur) w.push({ key: curKey, level: 'error', text: 'not a date (use YYYY-MM-DD)' });

  if (prev && DATE_RE.test(prev)) {
    if (!cur) w.push({ key: prevKey, level: 'warn', text: `The previous day is only used together with the ${label} current day; set that too, or clear this.` });
    else if (prev >= cur) w.push({ key: prevKey, level: 'error', text: `must be earlier than the ${label} current day (${cur}).` });
    else {
      const expected = calendarPrev(cur, market, i.holidays);
      if (isWeekend(prev)) w.push({ key: prevKey, level: 'warn', text: `${prev} is a ${dayName(prev)}: ${label} has no session that day, so its close does not exist.` });
      else if (market === 'NSE' && i.holidays.has(prev)) w.push({ key: prevKey, level: 'warn', text: `${prev} is an NSE holiday, so there is no NSE close for it.` });
      else if (prev !== expected) w.push({ key: prevKey, level: 'info', text: `The calendar's previous ${label} session before ${cur} is ${expected}; you set ${prev}. That is fine if ${expected} was a holiday or you want an older close.` });
    }
  } else if (prev) w.push({ key: prevKey, level: 'error', text: 'not a date (use YYYY-MM-DD)' });

  if (cur && !prev && DATE_RE.test(cur)) {
    const expected = calendarPrev(cur, market, i.holidays);
    w.push({ key: prevKey, level: 'info', text: `Not set: the previous ${label} day will be worked out as ${expected}${market === 'MCX' ? ' (MCX holidays are not known, so set it if that day was one)' : ''}.` });
  }
}

function checkExpiry(w: Warning[], i: WarnInput, key: string, label: string): void {
  const v = String(i.value(key) ?? '');
  if (!v) return;
  const list = i.choices(key);
  if (!list) return;
  if (!list.includes(v)) {
    w.push({ key, level: 'warn', text: `${v} is not a listed ${label}, so it is ignored and the nearest expiry is used. ${list.length ? `Listed: ${list.slice(0, 3).join(', ')}${list.length > 3 ? ' …' : ''}.` : ''}` });
    return;
  }
  const today = new Date(i.now + IST_MS).toISOString().slice(0, 10);
  const nearest = list.find((e) => e >= today) ?? list[0];
  if (v < today) w.push({ key, level: 'warn', text: `${v} has already passed (today is ${today}); the contract has expired.` });
  else if (nearest && v !== nearest) {
    const weeks = Math.round((Date.parse(`${v}T00:00:00Z`) - Date.parse(`${nearest}T00:00:00Z`)) / (7 * 86400000));
    if (weeks >= 4) w.push({ key, level: 'info', text: `${v} is ${weeks} weeks after the nearest expiry (${nearest}); far contracts trade thinly, so the option chain and futures read will be weaker.` });
  }
}

const RANGES: Record<string, [number, number, string]> = {
  OVX: [10, 120, 'crude oil volatility usually sits between 20 and 80'],
  GVZ: [5, 60, 'gold volatility usually sits between 10 and 40'],
  VXSLV: [10, 100, 'silver volatility usually sits between 20 and 60'],
  VIX: [8, 80, 'the CBOE VIX usually sits between 10 and 40'],
};

export function checkSettings(i: WarnInput): Warning[] {
  const w: Warning[] = [];
  checkDays(w, i, 'NSE');
  checkDays(w, i, 'MCX');

  for (const k of ['nifty_expiry_date', 'banknifty_expiry_date', 'sensex_expiry_date', 'fo_stocks_expiry_date']) checkExpiry(w, i, k, NAMES[k]!);
  for (const k of i.expiryKeys) {
    const isOpt = k.startsWith('mcx_opt_expiry_');
    const name = k.slice(isOpt ? 'mcx_opt_expiry_'.length : 'mcx_expiry_'.length).toUpperCase();
    checkExpiry(w, i, k, `${name} ${isOpt ? 'options' : 'futures'} expiry`);
  }

  const num = (k: string): number | null => {
    const v = i.value(k);
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) && String(v).trim() !== '' ? n : null;
  };
  for (const [k, [lo, hi, why]] of Object.entries(RANGES)) {
    const n = num(k);
    if (n !== null && (n < lo || n > hi)) w.push({ key: k, level: 'warn', text: `${n} looks off: ${why}. A wrong value skews that commodity's expected daily range. Clear it to use the automatic value.` });
  }
  const ovxLimit = num('vol_extreme_ovx');
  if (ovxLimit !== null && (ovxLimit < 20 || ovxLimit > 100)) w.push({ key: 'vol_extreme_ovx', level: 'warn', text: `${ovxLimit} is unusual for an OVX warning level (the default is 35): too low warns on every day, too high never warns.` });
  const margin = num('margin');
  if (margin !== null && margin <= 0) w.push({ key: 'margin', level: 'warn', text: 'Account capital is 0, so every position size will come out as zero.' });
  const risk = num('risk_pct_per_trade');
  if (risk !== null && risk > 5) w.push({ key: 'risk_pct_per_trade', level: 'warn', text: `${risk}% risk per trade is high (most traders keep it at 1-2%).` });
  if (risk !== null && risk <= 0) w.push({ key: 'risk_pct_per_trade', level: 'warn', text: 'Risk per trade is 0, so every position size will come out as zero.' });
  const room = num('level_room_mult');
  if (room !== null && (room < 0.5 || room > 5)) w.push({ key: 'level_room_mult', level: 'warn', text: `${room} is unusual for the room-to-target multiple (the default is 1.5): a very small value ignores walls in the way, a very large one blocks almost every entry.` });
  return w;
}
