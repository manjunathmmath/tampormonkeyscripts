/**
 * The 9:15 combo backtest: faithful ports of `_gtbClassify915`, `_gtbLegsFor`, `_gtbSimLeg` and the row builder of `_gtbBuild915Trend` (grootTradeBot.js).
 * For each past day the 9:15 close zones of NIFTY 50, SENSEX and NIFTY BANK give a combo (GTB_STRAT_LOOKUP); the legs that combo implies (buy at BSO, sell at ASO)
 * are simulated on that day's 5-minute candles, held to 12:00 (a trade whose level was never reached is a trend entry at the open). Descriptive history of a
 * hand-authored plan, not a forecast; one year of one market.
 */
import { getStrikeDiff, strikeDetails, type StrikeDiffMap } from './levels.js';
import { GTB_STRAT_LOOKUP, norm915 } from './marketSignal.js';

export type Candle5 = readonly (string | number | undefined)[];

const hourOf = (ts: unknown): number => parseInt(String(ts).slice(11, 13), 10);
const hhmm = (ts: unknown): string => String(ts).slice(11, 16);
const dateOf = (ts: unknown): string => String(ts).slice(0, 10);
const num = (x: unknown): number => parseFloat(String(x));

/** `_gtbClassify915`: the zone of a 9:15 close against the levels of the day open (at-or-beyond a level is that zone). */
export function classify915(name: string, dayOpen: number, close: number, diffs: StrikeDiffMap): string {
  const sd = strikeDetails(dayOpen, getStrikeDiff(name, diffs).diff);
  if (close >= sd.ast) return 'AST';
  if (close >= sd.aso) return 'ASO';
  if (close <= sd.bst) return 'BST';
  if (close <= sd.bso) return 'BSO';
  return 'B/W';
}

/** `_gtbLegsFor`: Buy -> long only, Sell -> short only, Buy/Sell -> both, anything else none. */
export function legsFor(outcome: string): ('long' | 'short')[] {
  if (outcome === 'Buy') return ['long'];
  if (outcome === 'Sell') return ['short'];
  if (outcome === 'Buy/Sell') return ['long', 'short'];
  return [];
}

export interface Leg {
  dir: 'long' | 'short';
  entryType: 'level' | 'trend';
  entry: number;
  exit: number;
  pnl: number;
  pnlPct: number;
  win: boolean;
  mfe: number;
  mfePct: number;
  mae: number;
  maePct: number;
  tpsl: 'OPEN' | 'SL' | 'TP';
  target: number;
  stop: number;
  entryTime: string;
  peakTime: string;
  exitTime: string;
}

/**
 * `_gtbSimLeg`: one leg on a day's candles (the first candle is the anchor). Long enters at BSO, short at ASO; with no pullback it enters at the open (a trend
 * entry). Held to `cutoffHour` (12). Also max favourable / adverse excursion and a 1:1 target / stop of one strike step (stop checked first within a candle).
 */
export function simLeg(dir: 'long' | 'short', cands: readonly Candle5[], open: number, name: string, diffs: StrikeDiffMap, cutoffHour = 12): Leg | null {
  if (!cands || cands.length < 2 || !open) return null;
  const sd = strikeDetails(open, getStrikeDiff(name, diffs).diff);
  const ASO = sd.aso;
  const BSO = sd.bso;
  const isLong = dir === 'long';
  const level = isLong ? BSO : ASO;
  const openTs = cands[0]![0];
  let filled = false;
  let fillIdx = -1;
  let exit = open;
  let exitTs = openTs;
  let favOpen = 0;
  let favLevel = 0;
  let entryTs: unknown = null;
  let favOpenTs: unknown = openTs;
  let favLevelTs: unknown = null;
  for (let k = 1; k < cands.length; k++) {
    const ts = cands[k]![0];
    if (hourOf(ts) >= cutoffHour) break;
    const hi = num(cands[k]![2]);
    const lo = num(cands[k]![3]);
    exit = num(cands[k]![4]);
    exitTs = ts;
    const fO = isLong ? hi - open : open - lo;
    if (fO > favOpen) {
      favOpen = fO;
      favOpenTs = ts;
    }
    if (!filled && (isLong ? lo <= level : hi >= level)) {
      filled = true;
      entryTs = ts;
      fillIdx = k;
    }
    if (filled) {
      const fL = isLong ? hi - level : level - lo;
      if (fL > favLevel) {
        favLevel = fL;
        favLevelTs = ts;
      }
    }
  }
  const entry = filled ? level : open;
  const pnl = isLong ? exit - entry : entry - exit;
  const mfe = filled ? favLevel : favOpen;
  const sdiff = getStrikeDiff(name, diffs).diff.split(',');
  const s1 = parseInt(sdiff[0]!, 10) || 50;
  const target = s1;
  const stop = s1;
  const startK = filled ? fillIdx : 1;
  let maxAdv = 0;
  let tpsl: 'OPEN' | 'SL' | 'TP' = 'OPEN';
  for (let j = startK; j >= 1 && j < cands.length; j++) {
    if (hourOf(cands[j]![0]) >= cutoffHour) break;
    const hj = num(cands[j]![2]);
    const lj = num(cands[j]![3]);
    const favN = isLong ? hj - entry : entry - lj;
    const advN = isLong ? entry - lj : hj - entry;
    if (advN > maxAdv) maxAdv = advN;
    if (tpsl === 'OPEN') {
      if (advN >= stop) tpsl = 'SL';
      else if (favN >= target) tpsl = 'TP';
    }
  }
  const fmt = (t: unknown): string => (t ? hhmm(t) : '—');
  return {
    dir,
    entryType: filled ? 'level' : 'trend',
    entry,
    exit,
    pnl,
    pnlPct: entry ? (pnl / entry) * 100 : 0,
    win: pnl >= 0,
    mfe,
    mfePct: entry ? (mfe / entry) * 100 : 0,
    mae: maxAdv,
    maePct: entry ? (maxAdv / entry) * 100 : 0,
    tpsl,
    target,
    stop,
    entryTime: fmt(filled ? entryTs : openTs),
    peakTime: fmt(filled ? favLevelTs : favOpenTs),
    exitTime: fmt(exitTs),
  };
}

export interface DayData {
  open: number;
  close915: number;
  dayClose: number;
  close12: number;
  cls: string;
  cands: Candle5[];
}

/** Groups an instrument's 5-minute candles into days (the first candle of a day is the 9:15 candle), as `_gtbBuild915Trend` does. */
export function dayMap(name: string, candles: readonly Candle5[], diffs: StrikeDiffMap): Record<string, DayData> {
  const map: Record<string, DayData> = {};
  for (const c of candles) {
    const d = dateOf(c[0]);
    if (!map[d]) map[d] = { open: num(c[1]), close915: num(c[4]), dayClose: num(c[4]), close12: 0, cls: '', cands: [c] };
    else {
      map[d]!.dayClose = num(c[4]);
      map[d]!.cands.push(c);
    }
  }
  for (const d of Object.keys(map)) {
    const m = map[d]!;
    m.cls = classify915(name, m.open, m.close915, diffs);
    let c12 = m.close915;
    for (const c of m.cands) if (hourOf(c[0]) < 12) c12 = num(c[4]);
    m.close12 = c12;
  }
  return map;
}

export interface ComboRow {
  date: string;
  n: string;
  s: string;
  b: string;
  g: string;
  key: string;
  dayPct: number;
  mfePct: number;
  maePct: number;
  movePctE: number;
  dayPctE: number;
  mfePctE: number;
  maePctE: number;
  outcome: string;
  level: string;
  move: 'UP' | 'DOWN';
  movePct: number;
  legs: Leg[];
  giftLegs: Leg[];
  vix: number | null;
  vixu: number | null;
  vixl: number | null;
  vixu_bank: number | null;
  vixl_bank: number | null;
  vixu_gift: number | null;
  vixl_gift: number | null;
}

const SQRT252 = Math.sqrt(252);

/** The day-wise table of `_gtbBuild915Trend`: newest first, `lookback` days, for the days NIFTY 50, SENSEX and NIFTY BANK all have candles. */
export function buildRows(byInstr: Record<string, Record<string, DayData>>, vixMap: Record<string, number>, lookback: number, diffs: StrikeDiffMap): ComboRow[] {
  const nifty = byInstr['NIFTY 50'] ?? {};
  const allDates = Object.keys(nifty)
    .filter((d) => byInstr['SENSEX']?.[d] && byInstr['NIFTY BANK']?.[d])
    .sort();
  const niftyDates = allDates;
  return allDates
    .slice()
    .reverse()
    .slice(0, lookback)
    .map((d) => {
      const n = byInstr['NIFTY 50']![d]!;
      const s = byInstr['SENSEX']![d]!;
      const b = byInstr['NIFTY BANK']![d]!;
      const g = byInstr['GIFT NIFTY']?.[d];
      const key = `${norm915(n.cls)}-${norm915(s.cls)}-${norm915(b.cls)}`;
      const strat = GTB_STRAT_LOOKUP[key] || { outcome: 'Sideways', level: 'No trade' };
      const c12 = n.close12 !== undefined ? n.close12 : n.dayClose;
      const move: 'UP' | 'DOWN' = c12 >= n.open ? 'UP' : 'DOWN';
      const movePct = n.open ? ((c12 - n.open) / n.open) * 100 : 0;
      const legs = legsFor(strat.outcome).map((dir) => simLeg(dir, n.cands, n.open, 'NIFTY 50', diffs)).filter((x): x is Leg => x !== null);
      const vix = vixMap[d] != null && !Number.isNaN(vixMap[d]) ? vixMap[d]! : null;

      let giftLegs: Leg[] = [];
      if (g && g.cands && g.cands.length) {
        let gIdx915 = -1;
        for (let gi = 0; gi < g.cands.length; gi++) {
          const t = String(g.cands[gi]![0]);
          if (parseInt(t.slice(11, 13), 10) === 9 && parseInt(t.slice(14, 16), 10) === 15) {
            gIdx915 = gi;
            break;
          }
        }
        if (gIdx915 !== -1) {
          const from915 = g.cands.slice(gIdx915);
          const anchor = num(from915[0]![1]);
          giftLegs = legsFor(strat.outcome).map((dir) => simLeg(dir, from915, anchor, 'GIFT NIFTY', diffs)).filter((x): x is Leg => x !== null);
        }
      }

      let vixu: number | null = null;
      let vixl: number | null = null;
      let vixuBank: number | null = null;
      let vixlBank: number | null = null;
      let vixuGift: number | null = null;
      let vixlGift: number | null = null;
      const dIdx = niftyDates.indexOf(d);
      if (dIdx > 0 && vix != null) {
        const prevDay = niftyDates[dIdx - 1]!;
        const prevN = byInstr['NIFTY 50']![prevDay];
        const prevB = byInstr['NIFTY BANK']![prevDay];
        const prevG = byInstr['GIFT NIFTY']?.[prevDay];
        const band = (dayClose: number): [number, number] => {
          const rng = (dayClose * (vix / 100)) / SQRT252;
          return [parseFloat((dayClose + rng).toFixed(2)), parseFloat((dayClose - rng).toFixed(2))];
        };
        if (prevN) [vixu, vixl] = band(prevN.dayClose);
        if (prevB) [vixuBank, vixlBank] = band(prevB.dayClose);
        if (prevG) [vixuGift, vixlGift] = band(prevG.dayClose);
      }

      const dayPct = n.open ? ((n.dayClose - n.open) / n.open) * 100 : 0;
      let mfe = 0;
      let mae = 0;
      for (const c of n.cands) {
        if (n.open) {
          mfe = Math.max(mfe, ((num(c[2]) - n.open) / n.open) * 100);
          mae = Math.min(mae, ((num(c[3]) - n.open) / n.open) * 100);
        }
      }
      const e = n.close915;
      const mvE = e ? ((c12 - e) / e) * 100 : 0;
      const dayE = e ? ((n.dayClose - e) / e) * 100 : 0;
      let mfeE = 0;
      let maeE = 0;
      for (const c of n.cands.slice(1)) {
        if (e) {
          mfeE = Math.max(mfeE, ((num(c[2]) - e) / e) * 100);
          maeE = Math.min(maeE, ((num(c[3]) - e) / e) * 100);
        }
      }
      return {
        date: d, n: n.cls, s: s.cls, b: b.cls, g: g ? g.cls : '—', key,
        dayPct, mfePct: mfe, maePct: mae, movePctE: mvE, dayPctE: dayE, mfePctE: mfeE, maePctE: maeE,
        outcome: strat.outcome, level: strat.level, move, movePct, legs, giftLegs,
        vix, vixu, vixl, vixu_bank: vixuBank, vixl_bank: vixlBank, vixu_gift: vixuGift, vixl_gift: vixlGift,
      };
    });
}

export interface ComboStats {
  legs: number;
  win: number;
  winPct: number;
  lvlLegs: number;
  lvlPct: number | null;
  trdLegs: number;
  trdPct: number | null;
}

/** `_gtb915ComboStatsToday`: wins of every leg of a combo, split by entry type (a pullback to the level vs a trend entry at the open). Null when the combo has no legs. */
export function comboStats(rows: ComboRow[], comboKey: string): ComboStats | null {
  let legs = 0;
  let win = 0;
  const lvl = { legs: 0, win: 0 };
  const trd = { legs: 0, win: 0 };
  for (const r of rows) {
    if (r.key !== comboKey) continue;
    for (const lg of r.legs || []) {
      legs++;
      if (lg.win) win++;
      const b = lg.entryType === 'level' ? lvl : lg.entryType === 'trend' ? trd : null;
      if (b) {
        b.legs++;
        if (lg.win) b.win++;
      }
    }
  }
  if (!legs) return null;
  const pc = (b: { legs: number; win: number }): number | null => (b.legs ? Math.round((b.win / b.legs) * 100) : null);
  return { legs, win, winPct: Math.round((win / legs) * 100), lvlLegs: lvl.legs, lvlPct: pc(lvl), trdLegs: trd.legs, trdPct: pc(trd) };
}
