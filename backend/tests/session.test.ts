import { describe, expect, it } from 'vitest';
import { SessionService } from '../src/marketdata/session.js';
import type { Tick } from '../src/marketdata/ticks.js';

const tick = (token: number): Tick => ({ token, ltp: 1, open: 1, high: 1, low: 1, close: 1, change: 0, tradable: true });

function make(nowIso: string, nse: string[], mcx: string[]) {
  let now = Date.parse(nowIso);
  const s = new SessionService({
    nseToken: () => 1, mcxTokens: () => new Set([9]),
    days: async (t) => (t === 1 ? nse : mcx),
    fallback: { nse: () => '2000-01-01', mcx: () => '2000-01-01' },
    now: () => now,
  });
  return { s, at: (iso: string) => { now = Date.parse(iso); } };
}

describe('session by data, not calendar', () => {
  it('shows today once the market has a candle for it, else its latest session (a holiday has none)', async () => {
    const hol = make('2026-11-24T11:00:00+05:30', ['2026-11-20', '2026-11-23'], ['2026-11-20', '2026-11-23']);
    await hol.s.refresh();
    expect(hol.s.nseDay()).toBe('2026-11-23');
    expect(hol.s.mcxDay()).toBe('2026-11-23');
    const evening = make('2026-11-24T17:10:00+05:30', ['2026-11-20', '2026-11-23'], ['2026-11-20', '2026-11-23', '2026-11-24']);
    await evening.s.refresh();
    expect(evening.s.nseDay()).toBe('2026-11-23'); // NSE never traded today
    expect(evening.s.mcxDay()).toBe('2026-11-24'); // MCX did, in the evening
    expect(evening.s.state().mcx.source).toBe('data');
  });
  it('uses the calendar answer only until the data has been read', () => {
    const { s } = make('2026-11-24T11:00:00+05:30', [], []);
    expect(s.nseDay()).toBe('2000-01-01');
    expect(s.state().nse.source).toBe('calendar');
  });
  it('knows a market is trading from its reference instrument ticking, and quiet after a while', () => {
    const { s, at } = make('2026-11-24T17:10:00+05:30', [], []);
    expect(s.mcxTicking()).toBe(false);
    s.onTicks([tick(9)], Date.parse('2026-11-24T17:10:00+05:30'));
    expect(s.mcxTicking()).toBe(true);
    expect(s.nseTicking()).toBe(false);
    at('2026-11-24T17:15:00+05:30');
    expect(s.mcxTicking()).toBe(false);
  });
  it('keeps the last answer when a read fails', async () => {
    let fail = false;
    const s = new SessionService({ nseToken: () => 1, mcxTokens: () => new Set(), days: async () => { if (fail) throw new Error('down'); return ['2026-11-23']; }, fallback: { nse: () => 'x', mcx: () => 'x' }, now: () => Date.parse('2026-11-24T11:00:00+05:30') });
    await s.refresh();
    fail = true;
    await s.refresh();
    expect(s.nseDay()).toBe('2026-11-23');
    expect(s.error).toContain('down');
  });
});
