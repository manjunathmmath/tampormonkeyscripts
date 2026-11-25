import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../src/store/fileStore.js';
import { HolidayService, parseHolidayMaster, parseNseDate } from '../src/marketdata/holidays.js';
import { previousTradingDay } from '../src/marketdata/history.js';

const sample = { FO: [{ tradingDate: '26-Jan-2026', description: 'Republic Day' }, { tradingDate: '08-Nov-2026', description: 'Diwali Laxmi Pujan' }, { tradingDate: 'bad', description: 'x' }] };

describe('NSE holidays', () => {
  it('reads NSE dates and the FO list, ignoring unreadable rows', () => {
    expect(parseNseDate('26-Jan-2026')).toBe('2026-01-26');
    expect(parseNseDate('5-Nov-2026')).toBe('2026-11-05');
    expect(parseNseDate('nonsense')).toBeNull();
    expect(parseHolidayMaster(sample)).toEqual([{ date: '2026-01-26', desc: 'Republic Day' }, { date: '2026-11-08', desc: 'Diwali Laxmi Pujan' }]);
    expect(parseHolidayMaster({ CM: [{ tradingDate: '01-May-2026', description: 'Maharashtra Day' }] })).toHaveLength(1);
    expect(parseHolidayMaster(null)).toEqual([]);
  });

  it('downloads weekly, keeps the saved list when NSE blocks the call, and feeds the previous-trading-day rule', async () => {
    const store = new FileStore(mkdtempSync(join(tmpdir(), 'groot-hol-')));
    let t = Date.parse('2026-11-20T10:00:00Z');
    let calls = 0;
    let fail = false;
    const svc = new HolidayService(store, async () => { calls++; if (fail) throw new Error('HTTP 403'); return sample; }, () => t);
    await svc.load();
    expect(calls).toBe(1);
    expect(svc.isHoliday('2026-01-26')).toBe(true);
    await svc.load();
    expect(calls).toBe(1); // within a week: no new call
    t += 8 * 86400000;
    fail = true;
    const l = await svc.load();
    expect(calls).toBe(2);
    expect(l).toHaveLength(2); // the saved list survives a blocked refresh
    expect(svc.error).toBe('HTTP 403');
    await svc.load();
    expect(calls).toBe(2); // not retried for 6 hours
    expect(new HolidayService(store).list()).toHaveLength(2); // a new process starts from the saved list
    // a holiday between two trading days is skipped
    expect(previousTradingDay('2026-01-27', svc.set())).toBe('2026-01-23'); // 26 Jan (Mon) is a holiday, 24-25 a weekend
  });
});
