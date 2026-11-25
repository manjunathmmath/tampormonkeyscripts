import { describe, expect, it } from 'vitest';
import { Watchdog } from '../src/marketdata/watchdog.js';

describe('watchdog', () => {
  it('alerts once when the feed goes quiet, reminds every 15 minutes, and says when it is back', () => {
    let now = 1_000_000;
    const out: string[] = [];
    const st = { connected: true, lastTickAt: now };
    const w = new Watchdog({ now: () => now, active: () => true, tokenOk: () => true, feed: () => st, push: (a) => void out.push(a.title) });
    w.tick();
    expect(out).toHaveLength(0);
    now += 130000;
    w.tick();
    expect(out).toEqual(['Live feed is down']);
    now += 60000;
    w.tick();
    expect(out).toHaveLength(1);
    now += 15 * 60000;
    w.tick();
    expect(out[1]).toBe('Live feed is down (still)');
    st.lastTickAt = now;
    w.tick();
    expect(out[2]).toBe('Live feed is back');
  });
  it('reports an expired token instead of the feed, and stays quiet outside market hours', () => {
    let active = false;
    let tokenOk = false;
    const out: string[] = [];
    const w = new Watchdog({ now: () => 5, active: () => active, tokenOk: () => tokenOk, feed: () => ({ connected: false, lastTickAt: 0 }), push: (a) => void out.push(a.title) });
    w.tick();
    expect(out).toHaveLength(0);
    active = true;
    w.tick();
    expect(out).toEqual(['Kite login expired']);
    tokenOk = true;
    w.tick();
    expect(out).toEqual(['Kite login expired', 'Kite login is back', 'Live feed is down']);
  });
});
