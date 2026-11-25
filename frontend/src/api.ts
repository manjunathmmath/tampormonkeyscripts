// One place that talks to the backend. The secret is kept in this browser only (localStorage) and sent as a bearer token.
const SECRET_KEY = 'groot.secret';

/** In development Vite forwards /api to the backend; in production the backend serves this app itself, so its routes are at the root. */
export const BASE: string = import.meta.env.DEV ? '/api' : '';

export const getSecret = (): string => {
  try {
    return localStorage.getItem(SECRET_KEY) ?? '';
  } catch {
    return '';
  }
};
export const setSecret = (s: string): void => {
  try {
    localStorage.setItem(SECRET_KEY, s);
  } catch {
    /* storage blocked: the secret lives for this page only */
  }
};

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly body?: unknown) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    signal: init?.signal,
    method: init?.method ?? 'GET',
    headers: { Authorization: `Bearer ${getSecret()}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let body: unknown;
    try {
      const j = (await res.json()) as { message?: string; error?: string };
      body = j;
      msg = j.message ?? j.error ?? msg;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, msg, body);
  }
  return (await res.json()) as T;
}

export type Zone = 'AST' | 'ASO' | 'B/W' | 'BSO' | 'BST';

export interface ScanItem {
  zone: Zone;
  /** null when the name has a single strike step (the userscript's NaN case) */
  ast: number | null;
  aso: number;
  bso: number;
  bst: number | null;
  anchor: number;
  close: number;
  stepKnown: boolean;
}

export interface ScanState {
  defaultDay: string;
  day: string;
  running: boolean;
  total: number;
  done: number;
  current: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  items: Record<string, ScanItem>;
  errors: { name: string; error: string }[];
  stepsSource: string | null;
  message: string | null;
}

export interface Health {
  status: 'ok' | 'degraded';
  problems: string[];
  kite: { token: string; userId: string | null };
  instruments: { loaded: boolean; count: number };
  feed: { state: string };
}

/** [time ISO+0530, open, high, low, close, volume, oi?] */
export type Candle = [string, number, number, number, number, number, number?];

export interface Quote {
  instrument_token: number;
  last_price: number;
  net_change?: number;
  volume?: number;
  ohlc: { open: number; high: number; low: number; close: number };
}

export const quotes = (symbols: string[]): Promise<Record<string, Quote>> => api(`/kite/quote?i=${encodeURIComponent(symbols.join(','))}`);

export async function history(token: number, from: string, to: string, interval = '5minute'): Promise<Candle[]> {
  const r = await api<{ candles: Candle[] }>(`/kite/history?token=${token}&interval=${interval}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  return r.candles;
}

export const universe = (): Promise<{ names: Record<string, number> }> => api('/universe');

export interface ActivityEntry {
  t: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  msg: string;
  data?: Record<string, unknown>;
}

export interface SystemDates {
  today: string;
  nseDay: string | null;
  nsePrev: string | null;
  mcxDay: string | null;
  mcxPrev: string | null;
  holidays: { date: string; desc: string }[];
  holidayError: string | null;
  lastRefreshAt: number | null;
}

export interface SystemInfo {
  dates?: SystemDates;
  app: { version: string; node: string; startedAt: number | null; uptimeSec: number | null; host: string | null; port: number | null; dataDir: string | null; memoryMb: number; frontendServed: boolean; now: number };
  kite: { configured: boolean; token: 'missing' | 'valid' | 'expired'; userId: string | null; savedAt: number | null };
  feed: { state: string; subscribed?: number; watched?: number; ticksSeen?: number; lastTickAt?: number | null; connectedAt?: number | null; reconnects?: number; clients?: number };
  instruments: { loaded: boolean; count: number; day: string | null };
  scan: { day: string; running: boolean; done: number; total: number; finishedAt: number | null; names: number } | null;
  activity: ActivityEntry[];
}

export interface ActionResult {
  ok: boolean;
  ms: number;
  error?: string;
  ltp?: number | null;
  count?: number;
  day?: string | null;
}

export interface OiStrikeView {
  strike: string;
  atm: boolean;
  oiCE: string;
  oiPE: string;
  chgCE: string;
  chgPE: string;
  obvCE: number | null;
  obvPE: number | null;
  ivCE: number | null;
  ivPE: number | null;
  ceLabel: string;
  peLabel: string;
  score: number;
}

export interface WallInfo {
  tier: 'primary' | 'secondary';
  index: number;
  strike: number;
  mag: number;
}

export interface OiAnalysis {
  name: string;
  day: string;
  expiry: string;
  ltp: number;
  prevClose: number | null;
  changePct: number | null;
  spot: number;
  oiScore: number;
  obvFlow: number;
  oiWall: number;
  oiConflicts: number;
  pcr: string;
  chPcr: string;
  ivSkew: number | null;
  ivSkewScore: number;
  atmIV: number | null;
  oiConcentration: number | null;
  maxPain: { maxPainK: number; maxPainDist: number; maxPainPct: number; netGEX: number; flipZones: number[] } | null;
  maxPainScore: number;
  walls: { resistance: WallInfo[]; support: WallInfo[] };
  eroding: { strike: number; side: 'R' | 'S' }[];
  building: { strike: number; side: 'R' | 'S' }[];
  rows: OiStrikeView[];
}

export interface ScoreResult {
  name: string;
  day: string;
  score: { nine_fifteen: number; current_trend: number; futures_trend: number; oi_obv: number; max_pain: number; iv_skew: number; total: number };
  missing: string[];
  zone: string | null;
  trend: { ltp: number; open: number; prevPrice: number; change: string; trends: string[]; levels: { ast: number; aso: number; bso: number; bst: number }; vixRange?: number; vixUpper?: number; vixLower?: number } | null;
  futures: { remark: string; dir: number } | null;
}

export interface ConsensusRow {
  label: string;
  dir: number;
  weight: number;
  weightClass: string;
  note: string | null;
  hasData: boolean;
  family?: string;
}

export interface ConsensusResult {
  name: string;
  day: string;
  outcome: string;
  net: number;
  agree: number;
  voting: number;
  thin: boolean;
  dzConflict: boolean;
  rows: ConsensusRow[];
  unavailable: string[];
  score: ScoreResult;
}

export interface LevelProbResult {
  name: string;
  ok: boolean;
  netDir: number;
  pASO: number | null;
  pAST: number | null;
  pVIXU: number | null;
  pBSO: number | null;
  pBST: number | null;
  pVIXL: number | null;
}
