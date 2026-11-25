/**
 * The left panel of the old dashboard: Entry / Trade confluence (`getEntryConfluence`), Now Trade (`_gtbRenderNowTrade`), Pillars (`renderPillars`),
 * the position exit check (`checkExitSignal` / `renderExitBanner`) and the trading window (`getTradingWindow`). Rule-based, never places an order.
 */
export type Window = 'PRIME' | 'OK' | 'AVOID' | 'CLOSED';

/** the trading window of a time of day: the first 30 minutes and lunch are AVOID, 09:45 to 11:30 is PRIME */
export function tradingWindow(mins: number): Window {
  if (mins < 9 * 60 + 15) return 'CLOSED';
  if (mins < 9 * 60 + 45) return 'AVOID';
  if (mins < 11 * 60 + 30) return 'PRIME';
  if (mins < 13 * 60) return 'OK';
  if (mins < 14 * 60) return 'AVOID';
  if (mins < 15 * 60) return 'OK';
  if (mins < 15 * 60 + 15) return 'AVOID';
  return 'CLOSED';
}

export interface PanelIn {
  /** NIFTY 50 instrument score parts */
  n50: { nine_fifteen: number; current_trend: number; futures_trend: number; oi_obv: number; max_pain: number; iv_skew: number; total: number };
  /** futures trend scores (-1, 0, 1) of NIFTY 50 and NIFTY BANK */
  n50Fut: number;
  bnFut: number;
  /** OI/OBV scores of NIFTY 50 and NIFTY BANK */
  oiN50: number;
  oiBN: number;
  /** advance / decline: all F&O plus NIFTY 50 */
  adNet: number;
  comp: { nifty50: number; bank: number };
  /** put-call ratio of NIFTY 50 (1 when unknown) */
  pcr: number;
  /** minutes since midnight of the time shown */
  mins: number;
}

export interface Confluence {
  direction: 'LONG' | 'SHORT' | 'WAIT';
  bullish: number;
  bearish: number;
  window: Window;
  reasons: string[];
  pcrWarning: string;
  pcr: number;
}

/** five pillars (9:15, trend, futures, OI/OBV, breadth) count bullish or bearish; four or more with at most one against gives LONG / SHORT; AVOID and CLOSED windows force WAIT */
export function entryConfluence(i: PanelIn): Confluence {
  const window = tradingWindow(i.mins);
  const reasons: string[] = [];
  let bullish = 0;
  let bearish = 0;
  const vote = (v: number, label: string): void => {
    if (v > 0) {
      bullish++;
      reasons.push(`${label} ↑`);
    } else if (v < 0) {
      bearish++;
      reasons.push(`${label} ↓`);
    }
  };
  vote(i.n50.nine_fifteen, '9:15');
  vote(i.n50.current_trend, 'Trend');
  vote(i.n50Fut + i.bnFut, 'Futures');
  vote(i.oiN50 + i.oiBN, 'OI/OBV');
  vote(i.adNet, 'A/D');
  const pcrWarning = i.pcr > 1.3 ? `PCR ${i.pcr.toFixed(2)} (extreme puts — contrarian bullish)` : i.pcr < 0.7 ? `PCR ${i.pcr.toFixed(2)} (extreme calls — contrarian bearish)` : '';
  let direction: Confluence['direction'] = 'WAIT';
  if (bullish >= 4 && bearish <= 1) direction = 'LONG';
  else if (bearish >= 4 && bullish <= 1) direction = 'SHORT';
  if (window === 'AVOID' || window === 'CLOSED') direction = 'WAIT';
  return { direction, bullish, bearish, window, reasons, pcrWarning, pcr: i.pcr };
}

export interface Pillar {
  label: string;
  value: number;
}

/** the eight pillar rows of the panel */
export function pillars(i: PanelIn): Pillar[] {
  return [
    { label: '9:15 breakout', value: i.n50.nine_fifteen },
    { label: 'Current trend', value: i.n50.current_trend },
    { label: 'Futures trend', value: i.n50Fut + i.bnFut },
    { label: 'OI / OBV (NIFTY 50)', value: i.oiN50 },
    { label: 'OI / OBV (BANK NIFTY)', value: i.oiBN },
    { label: 'A/D breadth', value: i.adNet },
    { label: 'N50 components', value: i.comp.nifty50 },
    { label: 'BN components', value: i.comp.bank },
  ];
}

export interface NowTradeIn {
  n50: PanelIn['n50'];
  ltp: number;
  levels: { aso: number; ast: number; bso: number; bst: number } | null;
  vixu: number | null;
  vixl: number | null;
  /** anchored VWAP of the NIFTY futures */
  avwap: number | null;
}

export interface NowTrade {
  dir: 'LONG' | 'SHORT' | 'WAIT';
  total: number;
  /** how many of the six sub-scores agree with the direction */
  conf: number;
  subs: { label: string; value: number }[];
  levels: { entry: number; stop: number; t1: number; t2: number } | null;
  triggered: boolean;
  option: string | null;
  avwap: { value: number; above: boolean | null } | null;
}

/** NIFTY 50's own composite decides the direction (at least 3 either way), the 9:15 strike levels give entry, stop and targets, and the six sub-scores give the confluence */
export function nowTrade(i: NowTradeIn): NowTrade {
  const s = i.n50;
  const subs = [
    { label: '9:15', value: s.nine_fifteen },
    { label: 'Trend', value: s.current_trend },
    { label: 'Fut', value: s.futures_trend },
    { label: 'OI', value: s.oi_obv },
    { label: 'MP', value: s.max_pain },
    { label: 'IV', value: s.iv_skew },
  ];
  const dir: NowTrade['dir'] = s.total >= 3 ? 'LONG' : s.total <= -3 ? 'SHORT' : 'WAIT';
  const bull = subs.filter((x) => x.value > 0).length;
  const bear = subs.filter((x) => x.value < 0).length;
  const conf = dir === 'LONG' ? bull : dir === 'SHORT' ? bear : 0;
  const avwap = i.avwap ? { value: i.avwap, above: i.ltp ? i.ltp > i.avwap : null } : null;
  if (dir === 'WAIT' || !i.levels) return { dir, total: s.total, conf, subs, levels: null, triggered: false, option: null, avwap };
  const long = dir === 'LONG';
  const l = i.levels;
  const entry = long ? l.aso : l.bso;
  return {
    dir,
    total: s.total,
    conf,
    subs,
    levels: { entry, stop: long ? l.bso : l.aso, t1: long ? l.ast : l.bst, t2: long ? i.vixu ?? l.ast : i.vixl ?? l.bst },
    triggered: !!i.ltp && (long ? i.ltp >= entry : i.ltp <= entry),
    option: long ? `${l.aso} CE` : `${l.bso} PE`,
    avwap,
  };
}

export interface ExitCheck {
  /** exit when the trend turned against the position, or both index futures did */
  exit: boolean;
  reasons: string[];
}

/** `checkExitSignal`: a LONG exits when NIFTY's trend is bearish or both index futures are; a SHORT mirrored */
export function exitCheck(dir: 'LONG' | 'SHORT', trend: number, n50Fut: number, bnFut: number): ExitCheck {
  const reasons: string[] = [];
  if (dir === 'LONG') {
    if (trend < 0) reasons.push(`trend bearish (${trend})`);
    if (n50Fut < 0 && bnFut < 0) reasons.push('N50 and BN futures bearish');
  } else {
    if (trend > 0) reasons.push(`trend bullish (${trend})`);
    if (n50Fut > 0 && bnFut > 0) reasons.push('N50 and BN futures bullish');
  }
  return { exit: reasons.length > 0, reasons };
}
