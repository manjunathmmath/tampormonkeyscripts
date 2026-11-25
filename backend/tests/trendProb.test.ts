import { describe, expect, it } from 'vitest';
import { trendProb, weightedTrend } from '../src/engine/trendProb.js';

describe('trendProb', () => {
  it('all four signals bullish at normal volatility is strongly bullish', () => {
    const t = trendProb({ zone: 'ASO', futuresScore: 1, oiScore: 3, scoreTotal: 8, vix: 15 });
    expect(t.verdict).toBe('STRONGLY BULLISH');
    expect(t.bullPct).toBe(95);
    expect(t.confidence).toBe(90);
  });
  it('high volatility pulls the result towards 50%', () => {
    const calm = trendProb({ zone: 'ASO', futuresScore: 1, oiScore: 2, scoreTotal: 5, vix: 15 });
    const wild = trendProb({ zone: 'ASO', futuresScore: 1, oiScore: 2, scoreTotal: 5, vix: 30 });
    expect(wild.vix.modifier).toBe(0.65);
    expect(wild.bullPct).toBeLessThan(calm.bullPct);
    expect(wild.bullPct).toBeGreaterThan(50);
  });
  it('a flat read is neutral and AST reads neutral as in the old gauge', () => {
    expect(trendProb({ zone: 'B/W', futuresScore: 0, oiScore: 0, scoreTotal: 0, vix: 15 }).verdict).toBe('NEUTRAL');
    expect(trendProb({ zone: 'AST', futuresScore: 0, oiScore: 0, scoreTotal: 0, vix: 15 }).signals[0]!.dir).toBe('neutral');
  });
  it('bearish mirror', () => {
    const t = trendProb({ zone: 'BSO', futuresScore: -1, oiScore: -3, scoreTotal: -8, vix: 15 });
    expect(t.verdict).toBe('STRONGLY BEARISH');
    expect(t.bearPct).toBe(95);
  });
});

describe('weightedTrend', () => {
  it('weight-averages the scores and ranks drivers by weight times score', () => {
    const w = weightedTrend('NIFTY 50', [{ name: 'A', weight: 10, score: 5 }, { name: 'B', weight: 30, score: 1 }, { name: 'C', weight: 10, score: -1 }, { name: 'D', weight: 0, score: 9 }])!;
    expect(w.netScore).toBe(1.4);
    expect(w.label).toBe('NEUTRAL / MIXED');
    expect(w.rows.map((r) => r.name)).toEqual(['A', 'B', 'C']);
    expect(w.totalW).toBe(50);
    expect(weightedTrend('x', [])).toBeNull();
    expect(weightedTrend('x', [{ name: 'A', weight: 1, score: 9 }])!.label).toBe('STRONG BULLISH LEAN');
  });
});
