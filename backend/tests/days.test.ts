import { describe, it, expect, afterEach } from 'vitest';
import { defaultMcxDay } from '../src/marketdata/days.js';
import { previousDayFor, previousTradingDay, setDayRules } from '../src/marketdata/history.js';

afterEach(() => setDayRules(null));
const ist = (iso: string): number => Date.parse(`${iso}+05:30`);

describe('MCX session day', () => {
  it('weekday from 09:00, else the previous weekday; weekends are the Friday', () => {
    expect(defaultMcxDay(ist('2026-11-20T09:05:00'))).toBe('2026-11-20'); // Friday, MCX is open before NSE (09:15)
    expect(defaultMcxDay(ist('2026-11-20T08:30:00'))).toBe('2026-11-19');
    expect(defaultMcxDay(ist('2026-11-21T11:00:00'))).toBe('2026-11-20'); // Saturday
    expect(defaultMcxDay(ist('2026-11-22T20:00:00'))).toBe('2026-11-20'); // Sunday
    expect(defaultMcxDay(ist('2026-11-23T08:59:00'))).toBe('2026-11-20'); // Monday before the open
    expect(defaultMcxDay(ist('2026-11-23T21:00:00'))).toBe('2026-11-23'); // Monday evening session
  });
});

describe('previous day by market', () => {
  const holidays = new Set(['2026-11-19']); // an NSE holiday
  it('NSE skips weekends and NSE holidays, MCX skips weekends only (it trades on an NSE holiday)', () => {
    expect(previousTradingDay('2026-11-20', holidays, 'NSE')).toBe('2026-11-18');
    expect(previousTradingDay('2026-11-20', holidays, 'MCX')).toBe('2026-11-19');
    expect(previousTradingDay('2026-11-23', holidays, 'MCX')).toBe('2026-11-20');
  });
  it('a Settings previous day applies only to its own market and its own current day', () => {
    setDayRules({
      isMcx: (n) => n === 'GOLDM',
      override: (m, day) => (m === 'MCX' && day === '2026-11-20' ? '2026-11-18' : m === 'NSE' && day === '2026-11-23' ? '2026-11-19' : undefined),
    });
    expect(previousDayFor('GOLDM', '2026-11-20', holidays)).toBe('2026-11-18'); // commodity, MCX override
    expect(previousDayFor('NIFTY 50', '2026-11-20', holidays)).toBe('2026-11-18'); // NSE rule (holiday skipped), no NSE override that day
    expect(previousDayFor('NIFTY 50', '2026-11-23', holidays)).toBe('2026-11-19'); // NSE override
    expect(previousDayFor('GOLDM', '2026-11-23', holidays)).toBe('2026-11-20'); // not overridden by the NSE pair
    expect(previousTradingDay('2026-11-20', holidays)).toBe('2026-11-18'); // default market is NSE
  });
});
