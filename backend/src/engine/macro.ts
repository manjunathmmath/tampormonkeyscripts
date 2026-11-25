/**
 * Macro backdrop: faithful ports of `_MC_DRIVERS`, `_mcAnalyse`, `_mcRead` and `_mcVerdict` (macro.js). Each global driver (oil, US yield, Fed proxy, rupee, India yield,
 * dollar) scores -1..+1 toward "impact on Indian equities" from its 5-day trend (70%) and 1-day move (30%); the verdict adds them up (oil counted once).
 * Descriptive reading of global moves, not back-tested; it is a tie-breaker, never a trigger.
 */
export interface Driver {
  key: string;
  label: string;
  sym: string;
  unit: string;
  dec: number;
  mode: 'pct' | 'abs';
  t5: number;
  t1: number;
  sign: 1 | -1;
  group: string;
  manual?: boolean;
  accumulate?: boolean;
  info?: string;
}

export const MC_DRIVERS: Driver[] = [
  { key: 'BRENT', label: 'Brent Crude', sym: 'BZ=F', unit: '$', dec: 2, mode: 'pct', t5: 3.0, t1: 1.2, sign: -1, group: 'Oil' },
  { key: 'WTI', label: 'WTI Crude', sym: 'CL=F', unit: '$', dec: 2, mode: 'pct', t5: 3.0, t1: 1.2, sign: -1, group: 'Oil', info: 'MCX Crude settles against WTI' },
  { key: 'US10Y', label: 'US 10Y Yield', sym: '^TNX', unit: '%', dec: 3, mode: 'abs', t5: 0.1, t1: 0.04, sign: -1, group: 'Bond Yield' },
  { key: 'FED', label: 'Fed rate (13-wk T-bill proxy)', sym: '^IRX', unit: '%', dec: 3, mode: 'abs', t5: 0.05, t1: 0.02, sign: -1, group: 'Fed rates' },
  { key: 'USDINR', label: 'USD / INR', sym: 'USDINR=X', unit: '₹', dec: 3, mode: 'pct', t5: 0.35, t1: 0.15, sign: -1, group: 'Rupee' },
  { key: 'IN10Y', label: 'India 10Y G-Sec Yield', sym: 'India 10Y', unit: '%', dec: 3, mode: 'abs', t5: 0.08, t1: 0.03, sign: -1, group: 'India Bond', manual: true, info: 'Actual 10Y benchmark yield from data you paste in Data Load → Macro Data (Investing.com historical-data table). Yahoo has no India yield.' },
  { key: 'INGS', label: 'India 10Y G-Sec (Nifty GS 10Y index)', sym: 'NIFTYGS10YR.NS', unit: '', dec: 2, mode: 'pct', t5: 0.6, t1: 0.2, sign: 1, group: 'India Bond', accumulate: true, info: 'A bond PRICE index, not a yield: rising = Indian yields falling (good for banks/rate-sensitives). Yahoo only returns the latest value, so this app stores one value per day and the trend appears as history builds.' },
  { key: 'DXY', label: 'Dollar Index', sym: 'DX-Y.NYB', unit: '', dec: 2, mode: 'pct', t5: 0.7, t1: 0.3, sign: -1, group: 'Dollar' },
];

export interface Point {
  d: string;
  c: number;
}

export interface MacroRow {
  def: Driver;
  last: number;
  prev: number;
  c1: number;
  c5: number;
  c20: number;
  score: number;
  thin?: boolean;
  days: number;
  spark: number[];
  asOf: string;
  isReplay: boolean;
}

const clamp = (x: number): number => Math.max(-1, Math.min(1, x));

/** `_mcAnalyse`: moves over 1, 5 and 20 days and the score. `snapDay` is the day shown (earlier than `today` = a replay: the live quote is not used). */
export function analyse(def: Driver, raw: { pts: Point[]; live?: number | null }, snapDay: string, today: string): MacroRow {
  const isReplay = snapDay < today;
  let pts = raw.pts.filter((p) => p.d <= snapDay);
  if (pts.length < 3) pts = raw.pts;
  let n = pts.length;
  let last = pts[n - 1]!.c;
  if (n < 2) {
    pts = [pts[0]!, pts[0]!];
    n = 2;
  }
  if (!isReplay && raw.live && Number.isFinite(raw.live)) last = raw.live;
  const prev = pts[n - 2]!.c;
  const p5 = pts[Math.max(0, n - 6)]!.c;
  const p20 = pts[Math.max(0, n - 21)]!.c;
  const chg = (a: number, b: number): number => (def.mode === 'pct' ? ((a - b) / b) * 100 : a - b);
  const c1 = chg(last, prev);
  const c5 = chg(last, p5);
  const c20 = chg(last, p20);
  const s5 = clamp(c5 / def.t5 / 2);
  const s1 = clamp(c1 / def.t1 / 2);
  const rawS = clamp(s5 * 0.7 + s1 * 0.3) * def.sign;
  const thin = def.accumulate && raw.pts.length < 6;
  const score = Math.abs(rawS) < 0.15 || thin ? 0 : Math.round(rawS * 10) / 10;
  return { def, last, prev, c1, c5, c20, score, thin, days: raw.pts.length, spark: pts.slice(-30).map((p) => p.c), asOf: pts[n - 1]!.d, isReplay };
}

const fmtChg = (r: MacroRow, v: number): string => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(r.def.mode === 'pct' ? 2 : 3) + (r.def.mode === 'pct' ? '%' : ' pts');

/** `_mcRead`: the plain-English reading of one driver. `manualFed` is the Fed rate set by hand (null when not set). */
export function read(r: MacroRow, manualFed: number | null = null): string {
  const d = r.def;
  const up5 = r.score !== 0 ? r.score * r.def.sign > 0 : r.c5 > 0;
  const big = Math.abs(r.score) >= 0.5;
  const flat = r.score === 0;
  const mv = `${fmtChg(r, r.c5)} over 5 days (${fmtChg(r, r.c1)} today)`;
  switch (d.key) {
    case 'BRENT':
    case 'WTI':
      if (flat) return `${d.label} is steady (${mv}) — no oil pressure on India right now.`;
      return up5
        ? `${d.label} is rising (${mv}). ` + (big ? "Costlier crude widens the import bill and feeds inflation — a headwind for Nifty, especially OMCs, paints, airlines and consumer names; supportive for MCX Crude and upstream (ONGC, Oil India)." : "Mild upward pressure on India's import bill.")
        : `${d.label} is falling (${mv}). ` + (big ? 'Cheaper crude eases inflation and the import bill — a tailwind for Nifty, OMCs and consumption; bearish bias for MCX Crude.' : "Mild relief for India's import bill.");
    case 'US10Y':
      if (flat) return `US 10Y yield is stable (${mv}) — no fresh pressure on emerging-market flows.`;
      return up5
        ? `US 10Y yield is rising (${mv}). ` + (big ? 'Higher US yields pull money out of emerging markets (FII selling), pressure valuations of growth/IT names and tighten global liquidity — a headwind.' : 'A small tightening in global liquidity.')
        : `US 10Y yield is falling (${mv}). ` + (big ? 'Lower US yields encourage FII inflows into India and ease valuation pressure — a tailwind.' : 'A small easing in global liquidity.');
    case 'FED': {
      const base = `The market-implied policy rate (13-week T-bill${manualFed !== null ? `; you set the actual Fed rate at ${manualFed.toFixed(2)}%` : ''}) is ${r.last.toFixed(2)}%.`;
      if (flat) return `${base} It is steady (${mv}) — no change in rate expectations.`;
      return up5
        ? `${base} It is rising (${mv}), i.e. markets are pricing tighter policy. Tighter Fed policy strengthens the dollar and drains EM liquidity — a headwind, most for rate-sensitive and high-valuation stocks.`
        : `${base} It is falling (${mv}), i.e. markets are pricing easier policy. Easier Fed policy weakens the dollar and lifts EM inflows — a tailwind.`;
    }
    case 'USDINR':
      if (flat) return `The rupee is steady at ${r.last.toFixed(2)} (${mv}) — no currency pressure.`;
      return up5
        ? `The rupee is weakening — USD/INR ${r.last.toFixed(2)} (${mv}). ` + (big ? 'A falling rupee usually accompanies FII outflows and imported inflation — a headwind for the index, though IT and pharma exporters benefit.' : 'Mild rupee weakness; exporters gain slightly, importers lose.')
        : `The rupee is strengthening — USD/INR ${r.last.toFixed(2)} (${mv}). ` + (big ? 'A firmer rupee reflects inflows and lower imported inflation — a tailwind for the index (IT exporters lose a little margin).' : 'Mild rupee strength.');
    case 'IN10Y':
      if (flat) return `India 10Y G-Sec yield is steady at ${r.last.toFixed(3)}% (${mv}) — no domestic rate pressure.`;
      return up5
        ? `India 10Y yield is rising to ${r.last.toFixed(3)}% (${mv}). ` + (big ? 'Higher domestic yields raise borrowing costs and mark down bank bond portfolios — a headwind for banks, NBFCs and rate-sensitive stocks; often follows US yields or inflation/fiscal worries.' : 'A mild rise in domestic borrowing costs.')
        : `India 10Y yield is falling to ${r.last.toFixed(3)}% (${mv}). ` + (big ? 'Falling domestic yields are a tailwind for banks (bond gains), NBFCs, real estate and autos.' : 'A mild easing in domestic borrowing costs.');
    case 'INGS':
      if (r.thin) return `Latest value ${r.last.toFixed(2)}. Only ${r.days} day(s) of history stored so far — the trend and score start to mean something after about 6 sessions of the app running.`;
      if (flat) return `The India 10Y G-Sec index is steady (${mv}) — no move in Indian yields.`;
      return up5
        ? `The India 10Y G-Sec index is rising (${mv}), i.e. Indian bond yields are falling. Falling domestic yields are a tailwind for the bond books of banks, NBFCs, real estate and rate-sensitive stocks.`
        : `The India 10Y G-Sec index is falling (${mv}), i.e. Indian bond yields are rising. Higher domestic yields raise borrowing costs and mark down bank bond portfolios — a headwind for banks and rate-sensitive stocks.`;
    case 'DXY':
      if (flat) return `The Dollar Index is flat (${mv}).`;
      return up5
        ? `The Dollar Index is rising (${mv}). A strong dollar pressures emerging-market currencies and flows — a headwind for India and for commodities priced in dollars.`
        : `The Dollar Index is falling (${mv}). A weaker dollar supports emerging-market flows and commodities — a tailwind.`;
  }
  return '';
}

export interface MacroVerdict {
  score: number;
  label: string;
  tone: 'good' | 'bad' | 'warn';
  advice: string;
}

/** `_mcVerdict`: the sum of the driver scores, with Brent and WTI counted once (their average). */
export function verdict(rows: MacroRow[]): MacroVerdict {
  let sc = rows.reduce((a, r) => a + r.score, 0);
  const oil = rows.filter((r) => r.def.group === 'Oil');
  if (oil.length === 2) sc -= (oil[0]!.score + oil[1]!.score) / 2;
  sc = Math.round(sc * 10) / 10;
  if (sc >= 1.5) return { score: sc, label: 'TAILWIND', tone: 'good', advice: 'Global macro is supportive for Indian equities. Long setups get a confidence lift; be less eager to short into strength. Size normally.' };
  if (sc >= 0.5) return { score: sc, label: 'MILD TAILWIND', tone: 'good', advice: 'Macro leans slightly supportive. It does not override the intraday signals — use it as a tie-breaker in favour of longs.' };
  if (sc <= -1.5) return { score: sc, label: 'HEADWIND', tone: 'bad', advice: 'Global macro is a drag on Indian equities. Long setups need extra confirmation and smaller size; rallies are more likely to be sold; shorts have a tailwind.' };
  if (sc <= -0.5) return { score: sc, label: 'MILD HEADWIND', tone: 'bad', advice: 'Macro leans slightly against risk. Use as a tie-breaker in favour of shorts and be quicker to book long profits.' };
  return { score: sc, label: 'NEUTRAL', tone: 'warn', advice: 'No clear macro push either way (drivers offset or are flat). Trade the intraday signals on their own.' };
}

/** `_mcParseYieldText`: pasted rows like "25-09-2026<TAB>7.120<TAB>..." (date, price first) from an Investing.com history table. */
export function parseYieldText(text: string): { rows: Point[]; bad: number } {
  const out: Point[] = [];
  let bad = 0;
  for (let line of String(text || '').split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    const m = line.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\s+([0-9.,]+)/);
    if (!m) {
      if (/^\d/.test(line)) bad++;
      continue;
    }
    const c = parseFloat(m[4]!.replace(/,/g, ''));
    if (!Number.isFinite(c) || c <= 0 || c > 60) {
      bad++;
      continue;
    }
    out.push({ d: `${m[3]}-${('0' + m[2]).slice(-2)}-${('0' + m[1]).slice(-2)}`, c });
  }
  return { rows: out, bad };
}
