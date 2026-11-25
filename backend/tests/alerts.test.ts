import { describe, expect, it } from 'vitest';
import { AlertService, inWindow } from '../src/marketdata/alerts.js';

const mon10 = Date.parse('2026-11-23T10:30:00+05:30');

describe('inWindow', () => {
  it('NSE 09:20-15:30 weekdays, MCX to 23:55, never weekends', () => {
    expect(inWindow(false, mon10)).toBe(true);
    expect(inWindow(false, Date.parse('2026-11-23T16:00:00+05:30'))).toBe(false);
    expect(inWindow(true, Date.parse('2026-11-23T21:00:00+05:30'))).toBe(true);
    expect(inWindow(false, Date.parse('2026-11-22T10:30:00+05:30'))).toBe(false);
  });
});

describe('AlertService', () => {
  it('alerts once on entry, clears on exit, re-fires on return', async () => {
    const sent: string[] = [];
    const seq = [{ active: true, type: 'SHORT_COVERING' }, { active: true, type: 'SHORT_COVERING' }, { active: false, type: 'NONE' }, { active: true, type: 'LONG_UNWINDING' }];
    let i = 0;
    const s = new AlertService({
      squeeze: { load: async () => ({ signal: seq[Math.min(i++, seq.length - 1)] }) },
      today: () => '2026-11-23',
      now: () => mon10,
      notify: async (t) => void sent.push(t),
      names: { nse: ['NIFTY 50'], mcx: [] },
    });
    expect((await s.tick()).length).toBe(1);
    expect((await s.tick()).length).toBe(0);
    await s.tick();
    expect(s.since(0)[0]!.clearedAt).not.toBeNull();
    expect((await s.tick()).length).toBe(1);
    expect(s.since(1).length).toBe(1);
    expect(sent.length).toBe(2);
    expect(sent[0]).toContain('SHORT COVERING');
  });
  it('a failed read keeps state and raises nothing', async () => {
    const s = new AlertService({ squeeze: { load: async () => { throw new Error('x'); } }, today: () => 'd', now: () => mon10, names: { nse: ['NIFTY 50'], mcx: [] } });
    expect(await s.tick()).toEqual([]);
  });
});

describe('entry zone alert', () => {
  const mk = (on: boolean, spot: number) =>
    new AlertService({
      squeeze: { load: async () => ({ signal: { active: false, type: 'NONE' } }) },
      today: () => '2026-11-23',
      now: () => mon10,
      outlookOn: () => on,
      outlook: async () => ({ ok: true, spot, plan: { long: true, entryPx: 24000, stop: 23950 } }),
    });
  it('alerts once when price is within 0.15% of the entry zone, and only when switched on', async () => {
    const s = mk(true, 24010);
    expect((await s.entryTick()).length).toBe(3);
    expect((await s.entryTick()).length).toBe(0);
    expect((await mk(false, 24010).entryTick()).length).toBe(0);
    expect((await mk(true, 24200).entryTick()).length).toBe(0);
  });
});


describe('holding a name that keeps flipping', () => {
  const SC = { active: true, type: 'SHORT_COVERING' };
  const LU = { active: true, type: 'LONG_UNWINDING' };
  function make(seq: { active: boolean; type: string }[], hold: number) {
    let now = mon10;
    let i = 0;
    const sent: string[] = [];
    const s = new AlertService({ squeeze: { load: async () => ({ signal: seq[Math.min(i++, seq.length - 1)] }) }, today: () => '2026-11-23', now: () => now, notify: async (t) => void sent.push(t), names: { nse: ['NIFTY 50'], mcx: [] }, holdMin: () => hold });
    return { s, sent, advance: (min: number) => { now += min * 60000; } };
  }
  it('raises the first alert, holds the flips after it, and counts them', async () => {
    const m = make([SC, LU, SC, LU], 15);
    expect((await m.s.tick()).length).toBe(1);
    m.advance(5);
    expect((await m.s.tick()).length).toBe(0); // flipped to unwinding: held
    m.advance(5);
    expect((await m.s.tick()).length).toBe(0); // flipped back: held
    expect(m.s.since(0)).toHaveLength(1);
  });
  it('raises a held state once the hold is over and the name is still in it', async () => {
    const m = make([SC, LU, LU, LU], 15);
    await m.s.tick();
    m.advance(5);
    await m.s.tick();
    m.advance(5);
    expect((await m.s.tick()).length).toBe(0); // still inside the hold
    m.advance(10);
    const fresh = await m.s.tick();
    expect(fresh).toHaveLength(1);
    expect(fresh[0]!.kind).toBe('LONG_UNWINDING');
    expect(fresh[0]!.text).toContain('held back');
  });
  it('does nothing different with the hold off', async () => {
    const m = make([SC, LU, SC], 0);
    let n = 0;
    for (let k = 0; k < 3; k++) { n += (await m.s.tick()).length; m.advance(2); }
    expect(n).toBe(3);
  });
});
