/**
 * Dead zone: a faithful port of `_gtbDeadZoneRaw` / `_gtbDeadZone` / `_gtbDeadZoneText` (grootTradeBot.js).
 * A price band where the signals are too weak for conviction. It is bounded by the nearest primary OI walls, or the 9:15 BSO..ASO band.
 * `broken` is set once a completed 5-minute candle closed beyond an edge; the release is latched until it closes back inside twice in a row.
 */
export const DZ_BUFFER_PCT = 0.05;
export const DZ_REARM_CLOSES = 2;
export const DZ_WIDE_X = 1.5;

export interface Broken {
  dir: 'up' | 'down';
  close: number;
  at: string;
}

export interface DeadZone {
  lo: number;
  hi: number;
  loName: string;
  hiName: string;
  broken: Broken | null;
  wideNote: string;
}

/** The release state, per name, day and snapshot time. Keep one object per process. */
export type DzLatch = Record<string, Broken>;

export interface DeadZoneInputs {
  /** instrument score total; null when it could not be computed */
  scoreTotal: number | null;
  /** strike of the first (primary) support and resistance wall, if any */
  supportWall?: number | null;
  resistanceWall?: number | null;
  /** the 9:15 BSO (bstrikeOne) and ASO (ustrikeOne) levels */
  bso?: number | null;
  aso?: number | null;
  /** 5-minute candles of the day: [time ISO+0530, o, h, l, c, ...] */
  candles?: readonly (readonly (string | number | undefined)[])[] | null;
  nowMs: number;
  /** key of the latch entry: name|day|snapshot time */
  key: string;
}

export function deadZoneRaw(inp: DeadZoneInputs, latch: DzLatch): DeadZone | null {
  if (inp.scoreTotal === null || Math.abs(inp.scoreTotal) >= 3) return null;
  let lo: number | null = null;
  let hi: number | null = null;
  let loName = '';
  let hiName = '';
  if (inp.supportWall != null) {
    lo = inp.supportWall;
    loName = 'put wall';
  }
  if (inp.resistanceWall != null) {
    hi = inp.resistanceWall;
    hiName = 'call wall';
  }
  const nLo = inp.bso ?? NaN;
  const nHi = inp.aso ?? NaN;
  const haveNine = Number.isFinite(nLo) && Number.isFinite(nHi) && nLo < nHi;
  let wideNote = '';
  if (lo == null || hi == null) {
    if (haveNine) {
      lo = nLo;
      hi = nHi;
      loName = 'BSO';
      hiName = 'ASO';
    } else {
      lo = null;
      hi = null;
    }
  } else if (haveNine && hi - lo > DZ_WIDE_X * (nHi - nLo)) {
    wideNote = `OI walls ${Math.round(lo)} – ${Math.round(hi)} were too far apart`;
    lo = nLo;
    hi = nHi;
    loName = 'BSO';
    hiName = 'ASO';
  }
  if (lo == null || hi == null || Number.isNaN(lo) || Number.isNaN(hi) || lo >= hi) return null;

  let broken: Broken | null = null;
  const c5 = inp.candles;
  if (c5 && c5.length) {
    let li = c5.length - 1;
    const t5 = Date.parse(String(c5[li]![0]).replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
    if (Number.isFinite(t5) && inp.nowMs - t5 < 5 * 60000 && li > 0) li--; // the last candle is still forming: use the one before
    const cls: { cl: number; at: string }[] = [];
    for (let k = li; k >= 0 && cls.length < DZ_REARM_CLOSES; k--) cls.push({ cl: parseFloat(String(c5[k]![4])), at: String(c5[k]![0]).slice(11, 16) });
    const buf = (((lo + hi) / 2) * DZ_BUFFER_PCT) / 100;
    const now0 = cls[0];
    const cur = latch[inp.key];
    const L = lo;
    const H = hi;
    if (now0 && Number.isFinite(now0.cl)) {
      if (now0.cl > H + buf) latch[inp.key] = cur && cur.dir === 'up' ? cur : { dir: 'up', close: now0.cl, at: now0.at };
      else if (now0.cl < L - buf) latch[inp.key] = cur && cur.dir === 'down' ? cur : { dir: 'down', close: now0.cl, at: now0.at };
      else if (cur && cls.length >= DZ_REARM_CLOSES && cls.every((c) => Number.isFinite(c.cl) && c.cl >= L && c.cl <= H)) delete latch[inp.key];
    }
    const l = latch[inp.key];
    if (l) broken = { dir: l.dir, close: l.close, at: l.at };
  }
  return { lo, hi, loName, hiName, broken, wideNote };
}

/** The same band, or null once it has been broken. */
export function deadZone(inp: DeadZoneInputs, latch: DzLatch): DeadZone | null {
  const z = deadZoneRaw(inp, latch);
  return z && !z.broken ? z : null;
}

const f = (x: number): string => Math.round(x).toLocaleString('en-IN');

/** Where price is against the band, in words. `spot` is the last price (0 or null when unknown). */
export function deadZoneText(name: string, dz: Pick<DeadZone, 'lo' | 'hi' | 'loName' | 'hiName'>, spot: number | null): string {
  const lbl = name === 'NIFTY 50' ? 'NIFTY' : name;
  const band = f(dz.lo) + (dz.loName ? ` (${dz.loName})` : '') + ' – ' + f(dz.hi) + (dz.hiName ? ` (${dz.hiName})` : '');
  if (!spot) return `The dead zone is ${band}`;
  if (spot < dz.lo) return `${lbl} ${f(spot)} is ${f(dz.lo - spot)} pts below the dead zone ${band}`;
  if (spot > dz.hi) return `${lbl} ${f(spot)} is ${f(spot - dz.hi)} pts above the dead zone ${band}`;
  const dl = spot - dz.lo;
  const dh = dz.hi - spot;
  return `${lbl} ${f(spot)} is inside ${band}, ${f(dl <= dh ? dl : dh)} pts ${dl <= dh ? 'above the lower edge' : 'below the upper edge'}`;
}
