import { describe, expect, it } from 'vitest';
import { DigestService, buildClose, buildMorning, buildOpen, planOutcome, type DigestData, type PlanRow } from '../src/marketdata/digest.js';
import type { KeyValueStore } from '../src/store/fileStore.js';

const mem = (): KeyValueStore => {
  const m = new Map<string, unknown>();
  return { get: <T,>(k: string) => m.get(k) as T | undefined, set: (k, v) => void m.set(k, v), delete: (k) => void m.delete(k) };
};
const plan = (over: Partial<PlanRow> = {}): PlanRow => ({ name: 'NIFTY 50', long: true, rank: 2, forced: false, entry: 25000, stop: 24900, t1: 25200, t2: 25300, rr: 2, atLevel: false, ...over });
const c = (h: number, l: number) => ({ t: '10:00', o: l, h, l, c: h });

describe('plan outcome', () => {
  it('reads not reached, open, target and stopped (stop first inside one candle)', () => {
    expect(planOutcome(plan(), [c(25100, 25050)])).toBe('entry not reached');
    expect(planOutcome(plan(), [c(25050, 24990), c(25100, 25010)])).toBe('entered, still open');
    expect(planOutcome(plan(), [c(25050, 24990), c(25250, 25100)])).toBe('entered, target 1 reached');
    expect(planOutcome(plan(), [c(25050, 24990), c(25250, 24890)])).toBe('entered, then stopped');
    expect(planOutcome(plan({ long: false, entry: 25100, stop: 25200, t1: 25000 }), [c(25150, 25090), c(25080, 24990)])).toBe('entered, target 1 reached');
  });
});

describe('messages', () => {
  it('the open snapshot names the zone, levels, breadth and plans', () => {
    const t = buildOpen({
      day: '2026-11-25', time: '09:21',
      rows: [{ name: 'NIFTY 50', open: 25610, ltp: 25620, prev: 25500, zone: 'ASO', aso: 25660, bso: 25560 }],
      market: { score: 4.2, signal: 'BUY', reason: '', up: 120, dn: 40, niftyUp: 31, niftyDn: 12, bankUp: 9, bankDn: 3 },
      plans: [plan()],
    });
    expect(t).toContain('NIFTY 50: open 25,610.00 (+0.43% vs prev close) · 9:15 ASO · ASO 25,660 / BSO 25,560');
    expect(t).toContain('120 up / 40 down');
    expect(t).toContain('LONG (MEDIUM) entry 25,000 · stop 24,900 · T1 25,200 · R:R 2.0');
  });
  it('the morning brief says when the login is missing and lists events', () => {
    const t = buildMorning({ day: '2026-11-24', nse: 'closed today (NSE holiday per the holiday list)', mcx: 'evening session only, from 17:00', gift: { name: 'GIFT NIFTY', open: null, ltp: 25492, prev: 25441 }, vix: null, expiry: ['NIFTY'], events: [{ time: '20:15', title: 'Flash PMI', india: 'MED', forecast: '54.5', previous: '56.0' }], heads: [], kiteOk: false });
    expect(t).toContain('closed today');
    expect(t).toContain('GIFT NIFTY 25,492 (+0.20%)');
    expect(t).toContain('Options expiry today: NIFTY');
    expect(t).toContain('20:15 Flash PMI');
    expect(t).toContain('Kite login is missing');
  });
  it('the close summary shows how each plan did', () => {
    const t = buildClose({ day: '2026-11-25', rows: [{ name: 'NIFTY BANK', open: 1, ltp: 62000, prev: 62500 }], market: null, plans: [{ plan: plan({ name: 'NIFTY BANK' }), outcome: 'entered, then stopped' }], movers: [{ name: 'HDFCBANK', change: -1.2 }, { name: 'ICICIBANK', change: 0.8 }] });
    expect(t).toContain('BANK NIFTY: 62,000.00 (−0.80%)');
    expect(t).toContain('LONG 25,000 → entered, then stopped');
    expect(t).toContain('Heavyweights down: HDFCBANK -1.20%');
  });
});

describe('the schedule', () => {
  function make(nowIso: string, over: { nseTicking?: boolean; mcxTicking?: boolean; nseDay?: string; mcxDay?: string; zones?: number; enabled?: boolean } = {}) {
    let now = Date.parse(nowIso);
    const sent: string[] = [];
    const data: DigestData = {
      morning: async () => 'M', open: async () => ({ text: 'O', zones: over.zones ?? 40 }), close: async () => 'C', mcxopen: async () => 'MO', mcxclose: async () => 'MC',
    };
    const d = new DigestService({
      store: mem(), data, now: () => now, send: async (t) => { sent.push(t); return { ok: true }; }, enabled: () => over.enabled ?? true,
      session: { nseDay: () => over.nseDay ?? '2026-11-25', mcxDay: () => over.mcxDay ?? '2026-11-25', nseTicking: () => over.nseTicking ?? true, mcxTicking: () => over.mcxTicking ?? true },
    });
    return { d, sent, at: (iso: string) => { now = Date.parse(iso); } };
  }
  it('sends each update once a day, only when its market has opened and traded today', async () => {
    const m = make('2026-11-25T08:50:00+05:30', { nseTicking: false, mcxTicking: false });
    await m.d.tick();
    expect(m.sent).toEqual(['M']);
    await m.d.tick();
    expect(m.sent).toEqual(['M']); // once
    const open = make('2026-11-25T09:25:00+05:30');
    await open.d.tick();
    expect(open.sent).toContain('O');
    const hol = make('2026-11-24T11:00:00+05:30', { nseTicking: false, nseDay: '2026-11-23', mcxTicking: false, mcxDay: '2026-11-23' });
    await hol.d.tick();
    expect(hol.sent).toEqual([]); // NSE holiday: no snapshot, no close
    const eve = make('2026-11-24T17:10:00+05:30', { nseTicking: false, nseDay: '2026-11-23', mcxTicking: true, mcxDay: '2026-11-24' });
    await eve.d.tick();
    expect(eve.sent).toEqual(['MO']);
  });
  it('waits for the 9:15 scan, then sends whatever there is at 09:45', async () => {
    const m = make('2026-11-25T09:25:00+05:30', { zones: 3, mcxTicking: false });
    await m.d.tick();
    expect(m.sent).toEqual(['M']); // the morning brief only: the snapshot waits for the scan
    m.at('2026-11-25T09:46:00+05:30');
    await m.d.tick();
    expect(m.sent).toEqual(['M', 'O']);
  });
  it('does nothing when a switch is off or at the weekend', async () => {
    const off = make('2026-11-25T09:25:00+05:30', { enabled: false });
    await off.d.tick();
    expect(off.sent).toEqual([]);
    const sat = make('2026-11-28T09:25:00+05:30');
    await sat.d.tick();
    expect(sat.sent).toEqual([]);
  });
  it('sends the close summary after 15:35 and the MCX close once MCX stops ticking', async () => {
    const c1 = make('2026-11-25T15:40:00+05:30');
    await c1.d.tick();
    expect(c1.sent).toContain('C');
    const c2 = make('2026-11-25T23:40:00+05:30', { mcxTicking: false });
    await c2.d.tick();
    expect(c2.sent).toContain('MC');
  });
});
