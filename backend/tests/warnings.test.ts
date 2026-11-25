import { describe, it, expect } from 'vitest';
import { checkSettings, type WarnInput } from '../src/settings/warnings.js';

// Sunday 22 Nov 2026, 11:00 IST. The latest NSE session is Friday 20 Nov; NSE holiday on Thursday 19 Nov (made up for the test).
const NOW = Date.parse('2026-11-22T11:00:00+05:30');
const HOLIDAYS = new Set(['2026-11-19']);

const mk = (values: Record<string, string | number | boolean>, choices: Record<string, string[]> = {}): WarnInput => ({
  value: (k) => values[k] ?? '',
  now: NOW,
  holidays: HOLIDAYS,
  choices: (k) => choices[k] ?? null,
  expiryKeys: Object.keys(choices).filter((k) => k.startsWith('mcx_')),
});
const texts = (v: Record<string, string | number | boolean>, c?: Record<string, string[]>): string[] => checkSettings(mk(v, c)).map((w) => `${w.key}:${w.level}`);

describe('settings warnings: dates', () => {
  it('nothing to say when nothing is set', () => {
    expect(checkSettings(mk({}))).toEqual([]);
  });

  it('a current day in the future is an error; on a weekend or an NSE holiday a warning', () => {
    expect(texts({ current_day_date: '2026-11-25' })).toContain('current_day_date:error');
    const wk = checkSettings(mk({ current_day_date: '2026-11-21' })).find((w) => w.level === 'warn')!;
    expect(wk.text).toContain('Saturday');
    const hol = checkSettings(mk({ current_day_date: '2026-11-19' })).find((w) => w.level === 'warn')!;
    expect(hol.text).toContain('NSE holiday');
    // the same day is not a holiday for MCX
    expect(checkSettings(mk({ mcx_current_day_date: '2026-11-19' })).some((w) => w.level === 'warn' && w.key === 'mcx_current_day_date')).toBe(false);
  });

  it('a day left on from earlier says how old it is (a reminder, not an error)', () => {
    const w = checkSettings(mk({ current_day_date: '2026-11-18' })).find((x) => x.key === 'current_day_date' && x.level === 'info')!;
    expect(w.text).toContain('2 days before the latest session (2026-11-20)');
    expect(checkSettings(mk({ current_day_date: '2026-11-20' })).some((x) => x.key === 'current_day_date')).toBe(false); // the latest session: nothing
  });

  it('the previous day: needs the current day, must be earlier, flags a weekend / holiday / not-the-day-before', () => {
    expect(texts({ previous_day_date: '2026-11-18' })).toContain('previous_day_date:warn'); // no current day
    expect(texts({ current_day_date: '2026-11-18', previous_day_date: '2026-11-18' })).toContain('previous_day_date:error');
    expect(checkSettings(mk({ current_day_date: '2026-11-20', previous_day_date: '2026-11-15' })).find((w) => w.key === 'previous_day_date')!.text).toContain('Sunday');
    expect(checkSettings(mk({ current_day_date: '2026-11-20', previous_day_date: '2026-11-19' })).find((w) => w.key === 'previous_day_date')!.text).toContain('NSE holiday');
    const off = checkSettings(mk({ current_day_date: '2026-11-20', previous_day_date: '2026-11-17' })).find((w) => w.key === 'previous_day_date')!;
    expect(off.level).toBe('info');
    expect(off.text).toContain('2026-11-18'); // the calendar's previous NSE session (19 Nov is a holiday)
    // the right previous day gives no message
    expect(checkSettings(mk({ current_day_date: '2026-11-20', previous_day_date: '2026-11-18' })).filter((w) => w.key === 'previous_day_date')).toEqual([]);
  });

  it('MCX uses the weekday calendar: the day before 20 Nov is 19 Nov even though NSE was closed', () => {
    const w = checkSettings(mk({ mcx_current_day_date: '2026-11-20', mcx_previous_day_date: '2026-11-18' })).find((x) => x.key === 'mcx_previous_day_date')!;
    expect(w.text).toContain('2026-11-19');
    expect(checkSettings(mk({ mcx_current_day_date: '2026-11-20' })).find((x) => x.key === 'mcx_previous_day_date')!.text).toContain('MCX holidays are not known');
  });
});

describe('settings warnings: expiries and numbers', () => {
  const choices = { nifty_expiry_date: ['2026-11-24', '2026-12-01', '2026-12-29'], mcx_expiry_goldm: ['2026-11-30', '2026-12-04'] };

  it('an expiry that is not listed is ignored (and says so); one that has passed; one far from the nearest', () => {
    expect(checkSettings(mk({ nifty_expiry_date: '2026-11-10' }, choices)).find((w) => w.key === 'nifty_expiry_date')!.text).toContain('not a listed');
    const past = checkSettings(mk({ nifty_expiry_date: '2026-11-17' }, { nifty_expiry_date: ['2026-11-17', '2026-11-24'] })).find((w) => w.key === 'nifty_expiry_date')!;
    expect(past.text).toContain('already passed');
    const far = checkSettings(mk({ nifty_expiry_date: '2026-12-29' }, choices)).find((w) => w.key === 'nifty_expiry_date')!;
    expect(far.level).toBe('info');
    expect(far.text).toContain('5 weeks');
    expect(checkSettings(mk({ nifty_expiry_date: '2026-11-24' }, choices))).toEqual([]);
    expect(checkSettings(mk({ nifty_expiry_date: '2026-12-01' }, choices))).toEqual([]); // 1 week out is fine
  });

  it('commodity expiries are checked with the commodity named', () => {
    expect(checkSettings(mk({ mcx_expiry_goldm: '2027-01-01' }, choices)).find((w) => w.key === 'mcx_expiry_goldm')!.text).toContain('GOLDM futures expiry');
  });

  it('numbers that look like typos', () => {
    expect(texts({ OVX: 500 })).toContain('OVX:warn');
    expect(texts({ GVZ: 2 })).toContain('GVZ:warn');
    expect(texts({ OVX: 45, GVZ: 25, VXSLV: 40, VIX: 18 })).toEqual([]);
    expect(texts({ vol_extreme_ovx: 5 })).toContain('vol_extreme_ovx:warn');
    expect(texts({ margin: 0 })).toContain('margin:warn');
    expect(texts({ risk_pct_per_trade: 12 })).toContain('risk_pct_per_trade:warn');
    expect(texts({ level_room_mult: 9 })).toContain('level_room_mult:warn');
    expect(texts({ margin: 100000, risk_pct_per_trade: 1, level_room_mult: 1.5, vol_extreme_ovx: 35 })).toEqual([]);
  });
});
