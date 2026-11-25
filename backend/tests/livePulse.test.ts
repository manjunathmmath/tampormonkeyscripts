import { describe, expect, it } from 'vitest';
import { LiveMarket } from '../src/marketdata/live.js';
import { LivePulse } from '../src/marketdata/livePulse.js';

describe('live pulse', () => {
  it('recomputes once per minute while active and raises the counter each time', async () => {
    let now = Date.parse('2026-11-23T10:00:05+05:30');
    let runs = 0;
    let active = true;
    const p = new LivePulse({ live: new LiveMarket(), now: () => now, active: () => active, recompute: async () => { runs++; } });
    expect(await p.tick()).toBe(true);
    expect(await p.tick()).toBe(false); // same minute
    now += 30000;
    expect(await p.tick()).toBe(false);
    now += 60000;
    expect(await p.tick()).toBe(true);
    expect(p.state().seq).toBe(2);
    expect(runs).toBe(2);
    active = false;
    now += 120000;
    expect(await p.tick()).toBe(false);
    expect(p.state().seq).toBe(2);
  });
  it('keeps going after a failed recompute and says why', async () => {
    let now = Date.parse('2026-11-23T10:00:05+05:30');
    let fail = true;
    const p = new LivePulse({ live: new LiveMarket(), now: () => now, active: () => true, recompute: async () => { if (fail) throw new Error('boom'); } });
    await p.tick();
    expect(p.state().failures).toBe(1);
    expect(p.state().lastError).toBe('boom');
    expect(p.state().seq).toBe(0);
    fail = false;
    await p.tick();
    expect(p.state().seq).toBe(1);
  });
});
