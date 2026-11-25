import { describe, expect, it } from 'vitest';
import { BoardService, maxPainOutcome } from '../src/marketdata/boards.js';

describe('maxPainOutcome', () => {
  it('describes the pull and the gamma regime', () => {
    const t = maxPainOutcome(25850, 25750, -0.4, 22387, [25800]);
    expect(t).toContain('0.4% below spot');
    expect(t).toContain('downward');
    expect(t).toContain('stabilising');
    expect(t).toContain('flip zone is near spot');
    expect(maxPainOutcome(100, 100, 0, -5, [])).toContain('little pull');
    expect(maxPainOutcome(100, 102, 2, -5, [])).toContain('trending');
  });
});

const rows = [{ strike: '100', atm: false, score: 1 }, { strike: '110', atm: false, score: -1 }, { strike: '120', atm: true, score: 0.5 }, { strike: '130', atm: false, score: 0 }, { strike: '140', atm: false, score: 2 }, { strike: '150', atm: false, score: 3 }];
const mk = () =>
  new BoardService({
    consensus: { load: async (r) => { if (r.name === 'BAD') throw new Error('x'); return ({ outcome: 'GO LONG', net: 0.5, agree: 3, voting: 4, thin: false }) as never; } },
    levelProb: { load: async () => ({ ok: true, pASO: 60, pAST: 30, pVIXU: 10, pBSO: 40, pBST: 20, pVIXL: 5, netDir: 0.4 }) as never },
    oi: { analyse: async () => ({ ltp: 120, spot: 120, oiScore: 2, pcr: '0.8', rows, maxPain: { maxPainK: 110, maxPainDist: -10, maxPainPct: -8.3, netGEX: 5, flipZones: [] } }) as never },
    signals: { load: async () => ({ strategy: 'bull_call', view: 'Bullish', agreement: { agree: 2, total: 6, pct: 33, label: 'UNFAVOURABLE' }, timing: { pct: 60, label: 'ACCEPTABLE' }, suggestion: { why: 'w' } }) as never },
    score: { load: async () => ({ zone: 'ASO', futures: { dir: 1, remark: 'LONG' }, score: { oi_obv: 2, total: 5 } }) as never },
    verdict: { load: async () => ({ inputs: { indiaVix: 15 } }) as never },
    squeeze: { load: async (r) => ({ signal: { active: r.name === 'NIFTY 50', type: 'SHORT_COVERING', remark: 'SHOT_COVERING', daysToExpiry: 1, pcr: 0.5, extremePositioning: false }, watch: null, note: '' }) as never },
    weights: () => ({ HDFCBANK: 10, ICICIBANK: 5 }),
    topStocks: () => ['HDFCBANK', 'BAD'],
    mcxNames: () => ['CRUDEOILM'],
  });

describe('BoardService', () => {
  it('builds every board, leaving out a name that fails', async () => {
    const b = await mk().load({ day: '2026-11-20' });
    expect(b.signals.length).toBe(5);
    expect(b.signals[0]!.trend).toBe('Bullish (weak)');
    expect(b.consensus.length).toBe(4);
    expect(b.oi[0]!.cells.map((c) => c.strike)).toEqual([100, 110, 120, 130, 140]);
    expect(b.maxPain[0]!.regime).toBe('Stabilising');
    expect(b.levelProb[0]!.pASO).toBe(60);
    expect(b.trend.length).toBe(3);
    expect(b.trend[0]!.verdict).toContain('BULLISH');
    expect(b.wtc[0]!.netScore).toBe(5);
    expect(b.squeeze.map((x) => x.name)).toEqual(['NIFTY 50']);
  });
});
