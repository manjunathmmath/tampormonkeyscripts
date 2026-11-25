/**
 * Trend Probability (`_cmdTrendProb`) and Weighted Trend Confirmation (`_gtbWeightedTrendConfirmation`) of the old dashboard.
 * Trend Probability weighs four signals (9:15 close, futures, OI/OBV, composite score) and lets the volatility regime pull the result towards 50%: it is the
 * agreement of the signals, not a measured probability. Rule-based and not back-tested.
 */
export interface TrendSignal {
  key: 'nine15' | 'fut' | 'oiobv' | 'score';
  label: string;
  dir: 'bull' | 'bear' | 'neutral';
  weight: number;
  /** 0 to 1 */
  strength: number;
  value: string;
}

export interface TrendProbIn {
  /** the 9:15 close zone; only ASO and BSO give a direction here, as in the old gauge (AST and BST read neutral) */
  zone: string | null;
  futuresScore: number;
  futuresLabel?: string;
  oiScore: number;
  scoreTotal: number;
  /** volatility index reading, 0 when unknown */
  vix: number;
  vixLabel?: string;
}

export interface TrendProb {
  signals: TrendSignal[];
  vix: { label: string; value: number; modifier: number };
  bullPct: number;
  bearPct: number;
  /** 0 to 100 */
  confidence: number;
  verdict: 'STRONGLY BULLISH' | 'BULLISH' | 'MILDLY BULLISH' | 'NEUTRAL' | 'MILDLY BEARISH' | 'BEARISH' | 'STRONGLY BEARISH';
}

const sg = (x: number, a: number, b: number): 'bull' | 'bear' | 'neutral' => (x > a ? 'bull' : x < b ? 'bear' : 'neutral');
const r1 = (x: number): number => Math.round(x * 10) / 10;

export function trendProb(i: TrendProbIn): TrendProb {
  const z = i.zone ?? 'B/W';
  const signals: TrendSignal[] = [
    { key: 'nine15', label: '9:15 breakout', dir: z === 'ASO' ? 'bull' : z === 'BSO' ? 'bear' : 'neutral', weight: 2, strength: z === 'ASO' || z === 'BSO' ? 0.8 : 0, value: z },
    { key: 'fut', label: 'Futures', dir: sg(i.futuresScore, 0, 0), weight: 3, strength: Math.min(1, Math.abs(i.futuresScore)), value: i.futuresLabel ?? (i.futuresScore > 0 ? 'Long buildup' : i.futuresScore < 0 ? 'Short buildup' : 'Neutral') },
    { key: 'oiobv', label: 'OI / OBV', dir: sg(i.oiScore, 0, 0), weight: 2, strength: Math.min(1, Math.abs(i.oiScore) / 3), value: `${i.oiScore > 0 ? '+' : ''}${r1(i.oiScore)}` },
    { key: 'score', label: 'Composite score', dir: i.scoreTotal >= 2 ? 'bull' : i.scoreTotal <= -2 ? 'bear' : 'neutral', weight: 2, strength: Math.min(1, Math.abs(i.scoreTotal) / 8), value: `${i.scoreTotal > 0 ? '+' : ''}${r1(i.scoreTotal)}` },
  ];
  const vix = i.vix;
  const mod = vix < 13 ? 1.15 : vix < 18 ? 1.0 : vix < 25 ? 0.85 : 0.65;
  let bW = 0;
  let rW = 0;
  for (const s of signals) {
    const w = s.weight * (0.5 + s.strength * 0.5);
    if (s.dir === 'bull') bW += w;
    else if (s.dir === 'bear') rW += w;
    else {
      bW += s.weight * 0.25;
      rW += s.weight * 0.25;
    }
  }
  const raw = bW + rW > 0 ? bW / (bW + rW) : 0.5;
  const bull = Math.max(0.05, Math.min(0.95, 0.5 + (raw - 0.5) * mod));
  const verdict: TrendProb['verdict'] =
    bull >= 0.7 ? 'STRONGLY BULLISH' : bull >= 0.58 ? 'BULLISH' : bull >= 0.52 ? 'MILDLY BULLISH' : bull >= 0.48 ? 'NEUTRAL' : bull >= 0.42 ? 'MILDLY BEARISH' : bull >= 0.3 ? 'BEARISH' : 'STRONGLY BEARISH';
  return {
    signals,
    vix: { label: i.vixLabel ?? 'VIX', value: vix, modifier: mod },
    bullPct: Math.round(bull * 100),
    bearPct: Math.round((1 - bull) * 100),
    confidence: Math.round(Math.abs(bull - 0.5) * 200),
    verdict,
  };
}

export interface WtcRow {
  name: string;
  weight: number;
  score: number;
}

export interface Wtc {
  index: string;
  netScore: number;
  label: 'STRONG BULLISH LEAN' | 'BULLISH LEAN' | 'NEUTRAL / MIXED' | 'BEARISH LEAN' | 'STRONG BEARISH LEAN';
  rows: WtcRow[];
  totalW: number;
}

/** the weight-averaged instrument score of an index's heaviest stocks; the drivers are the largest weight x |score| contributors */
export function weightedTrend(index: string, parts: WtcRow[]): Wtc | null {
  const rows = parts.filter((p) => p.weight > 0 && Number.isFinite(p.score));
  const totalW = rows.reduce((a, r) => a + r.weight, 0);
  if (!totalW) return null;
  const net = rows.reduce((a, r) => a + r.weight * r.score, 0) / totalW;
  const label: Wtc['label'] = net > 8 ? 'STRONG BULLISH LEAN' : net > 4 ? 'BULLISH LEAN' : net < -8 ? 'STRONG BEARISH LEAN' : net < -4 ? 'BEARISH LEAN' : 'NEUTRAL / MIXED';
  return { index, netScore: Math.round(net * 100) / 100, label, rows: [...rows].sort((a, b) => Math.abs(b.weight * b.score) - Math.abs(a.weight * a.score)), totalW: Math.round(totalW * 10) / 10 };
}
