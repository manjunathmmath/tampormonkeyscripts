import { describe, expect, it } from 'vitest';
import { entryConfluence, exitCheck, nowTrade, pillars, tradingWindow, type PanelIn } from '../src/engine/panel.js';

const base = (o: Partial<PanelIn> = {}): PanelIn => ({
  n50: { nine_fifteen: 1, current_trend: 2, futures_trend: 1, oi_obv: 1, max_pain: 0, iv_skew: -1, total: 4 },
  n50Fut: 1, bnFut: 0, oiN50: 1, oiBN: 1, adNet: 2, comp: { nifty50: 1.5, bank: 0.5 }, pcr: 1, mins: 10 * 60, ...o,
});

describe('tradingWindow', () => {
  it('follows the old windows', () => {
    expect(tradingWindow(9 * 60)).toBe('CLOSED');
    expect(tradingWindow(9 * 60 + 40)).toBe('AVOID');
    expect(tradingWindow(10 * 60)).toBe('PRIME');
    expect(tradingWindow(12 * 60)).toBe('OK');
    expect(tradingWindow(13 * 60 + 30)).toBe('AVOID');
    expect(tradingWindow(14 * 60 + 30)).toBe('OK');
    expect(tradingWindow(15 * 60 + 20)).toBe('CLOSED');
  });
});

describe('entryConfluence', () => {
  it('five bullish pillars give LONG in a good window and WAIT in an avoid window', () => {
    const c = entryConfluence(base());
    expect(c.direction).toBe('LONG');
    expect(c.bullish).toBe(5);
    expect(c.reasons).toContain('Futures ↑');
    expect(entryConfluence(base({ mins: 13 * 60 + 10 })).direction).toBe('WAIT');
  });
  it('one against is still allowed, two against is WAIT', () => {
    expect(entryConfluence(base({ adNet: -1 })).direction).toBe('LONG');
    expect(entryConfluence(base({ adNet: -1, oiN50: -2, oiBN: 0 })).direction).toBe('WAIT');
  });
  it('flags extreme PCR', () => {
    expect(entryConfluence(base({ pcr: 1.5 })).pcrWarning).toContain('contrarian bullish');
    expect(entryConfluence(base({ pcr: 0.6 })).pcrWarning).toContain('contrarian bearish');
    expect(entryConfluence(base()).pcrWarning).toBe('');
  });
});

describe('pillars', () => {
  it('lists the eight rows', () => {
    const p = pillars(base());
    expect(p.length).toBe(8);
    expect(p[2]).toEqual({ label: 'Futures trend', value: 1 });
    expect(p[5]!.value).toBe(2);
  });
});

describe('nowTrade', () => {
  const levels = { aso: 24050, ast: 24100, bso: 23950, bst: 23900 };
  it('LONG uses ASO entry, BSO stop, AST and VIXU targets and says if it triggered', () => {
    const t = nowTrade({ n50: base().n50, ltp: 24060, levels, vixu: 24300, vixl: 23700, avwap: 24000 });
    expect(t.dir).toBe('LONG');
    expect(t.levels).toEqual({ entry: 24050, stop: 23950, t1: 24100, t2: 24300 });
    expect(t.triggered).toBe(true);
    expect(t.option).toBe('24050 CE');
    expect(t.conf).toBe(4);
    expect(t.avwap?.above).toBe(true);
  });
  it('SHORT mirrors and a weak composite waits', () => {
    const s = { ...base().n50, total: -4, nine_fifteen: -1, current_trend: -2, futures_trend: -1, oi_obv: -1, iv_skew: 1 };
    const t = nowTrade({ n50: s, ltp: 24000, levels, vixu: 24300, vixl: 23700, avwap: null });
    expect(t.dir).toBe('SHORT');
    expect(t.levels).toEqual({ entry: 23950, stop: 24050, t1: 23900, t2: 23700 });
    expect(t.triggered).toBe(false);
    expect(nowTrade({ n50: { ...s, total: 1 }, ltp: 24000, levels, vixu: null, vixl: null, avwap: null }).dir).toBe('WAIT');
  });
});

describe('exitCheck', () => {
  it('matches checkExitSignal', () => {
    expect(exitCheck('LONG', -1, 1, 0).exit).toBe(true);
    expect(exitCheck('LONG', 1, -1, -1).exit).toBe(true);
    expect(exitCheck('LONG', 1, -1, 0).exit).toBe(false);
    expect(exitCheck('SHORT', 1, 0, 0).reasons[0]).toContain('trend bullish');
    expect(exitCheck('SHORT', -1, 1, 1).exit).toBe(true);
    expect(exitCheck('SHORT', -1, 1, 0).exit).toBe(false);
  });
});
