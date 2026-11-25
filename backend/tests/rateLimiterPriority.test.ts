import { describe, expect, it } from 'vitest';
import { RateLimiter, runBackground, type Clock } from '../src/kite/rateLimiter.js';

describe('RateLimiter priority', () => {
  it('runs a person-triggered call before queued background calls, and keeps the order inside each lane', async () => {
    let t = 0;
    const clock: Clock = { now: () => t, sleep: async (ms) => void (t += ms) };
    const rl = new RateLimiter({ history: 100, quote: 100, default: 100 }, clock);
    const order: string[] = [];
    const job = (n: string) => async (): Promise<void> => void order.push(n);
    const first = runBackground(() => rl.schedule('history', job('bg1')));
    const more = [runBackground(() => rl.schedule('history', job('bg2'))), runBackground(() => rl.schedule('history', job('bg3')))];
    const user = rl.schedule('history', job('chart'));
    const user2 = rl.schedule('history', job('chart2'));
    await Promise.all([first, ...more, user, user2]);
    expect(order[0]).toBe('bg1');
    expect(order.slice(1)).toEqual(['chart', 'chart2', 'bg2', 'bg3']);
  });
});
