import { describe, expect, it } from 'vitest';
import { addDays, asOfQuery, dayFor, istParts, marketState, mcxDayNow, nextWeekday, nf, prevWeekday, setDayOverride, setMcxDayOverride, setMcxNames, setSnapshot, signed, tone, tradingDayNow } from './format';
import { parseSse } from './live';

const at = (iso: string): number => Date.parse(iso + '+05:30');

describe('number formatting', () => {
  it('formats prices the Indian way, with a real minus sign and a dash for missing values', () => {
    expect(nf(25800.6)).toBe('25,800.60');
    expect(nf(1234567.5)).toBe('12,34,567.50');
    expect(nf(null)).toBe('—');
    expect(nf(Number.NaN)).toBe('—');
    expect(signed(286.3)).toBe('+286.30');
    expect(signed(-1.5)).toBe('−1.50');
    expect(signed(0)).toBe('0.00');
  });
  it('picks a tone from the sign', () => {
    expect([tone(1), tone(-1), tone(0), tone(null)]).toEqual(['up', 'dn', 'flat', 'flat']);
  });
});

describe('market clock (IST)', () => {
  it('knows when the cash session is open', () => {
    expect(marketState(at('2026-11-20T09:14:00')).open).toBe(false); // Friday, pre-open
    expect(marketState(at('2026-11-20T09:15:00')).open).toBe(true);
    expect(marketState(at('2026-11-20T15:30:00')).open).toBe(true);
    expect(marketState(at('2026-11-20T15:31:00')).open).toBe(false);
    expect(marketState(at('2026-11-21T11:00:00')).label).toMatch(/weekend/); // Saturday
  });
  it('reads the IST date even when the machine is in another zone', () => {
    expect(istParts(Date.parse('2026-11-20T20:00:00Z')).day).toBe('2026-11-21'); // 01:30 IST next day
  });
  it('moves across weekends and picks the day to show', () => {
    expect(prevWeekday('2026-11-23')).toBe('2026-11-20');
    expect(nextWeekday('2026-11-20')).toBe('2026-11-23');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(tradingDayNow(at('2026-11-21T11:00:00'))).toBe('2026-11-20'); // Saturday shows Friday
    expect(tradingDayNow(at('2026-11-23T08:00:00'))).toBe('2026-11-20'); // Monday before the open shows Friday
    expect(tradingDayNow(at('2026-11-23T10:00:00'))).toBe('2026-11-23');
  });
});

describe('server-sent events parser', () => {
  it('returns complete events and keeps the unfinished tail', () => {
    const a = parseSse('retry: 3000\nevent: ready\ndata: {"tokens":2}\n\nevent: ticks\ndata: [{"token":1');
    expect(a.events).toEqual([{ event: 'ready', data: '{"tokens":2}' }]);
    expect(a.rest).toBe('event: ticks\ndata: [{"token":1');
    const b = parseSse(a.rest + ',"ltp":10}]\n\n: ping\n\n');
    expect(b.events).toEqual([{ event: 'ticks', data: '[{"token":1,"ltp":10}]' }]);
    expect(b.rest).toBe('');
  });
  it('ignores comments and joins multi-line data', () => {
    expect(parseSse(': ping\n\n').events).toEqual([]);
    expect(parseSse('data: a\ndata: b\n\n').events).toEqual([{ event: 'message', data: 'a\nb' }]);
  });
});

describe('separate NSE and MCX days and the snapshot time', () => {
  const at = (iso: string): number => Date.parse(`${iso}+05:30`);
  it('MCX opens at 09:00, before NSE, and has its own default day', () => {
    expect(mcxDayNow(at('2026-11-23T09:05:00'))).toBe('2026-11-23');
    expect(tradingDayNow(at('2026-11-23T09:05:00'))).toBe('2026-11-20'); // NSE not open yet
    expect(mcxDayNow(at('2026-11-21T11:00:00'))).toBe('2026-11-20');
  });
  it('each name uses its own market day, and each market can be set to any day', () => {
    setMcxNames(['GOLDM']);
    setDayOverride('2026-11-18');
    setMcxDayOverride('2026-11-19');
    expect(dayFor('NIFTY 50')).toBe('2026-11-18');
    expect(dayFor('GOLDM')).toBe('2026-11-19');
    setMcxDayOverride(null);
    expect(dayFor('GOLDM')).toBe(mcxDayNow());
    setDayOverride(null);
    setMcxNames([]);
  });
  it('the snapshot time adds asOf to requests; bad values are ignored', () => {
    setSnapshot('10:30');
    expect(asOfQuery()).toBe('&asOf=10:30');
    setSnapshot('25-bad');
    expect(asOfQuery()).toBe('');
  });
});
