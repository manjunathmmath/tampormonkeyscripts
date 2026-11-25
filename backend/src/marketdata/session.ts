import type { Tick } from './ticks.js';

export interface SessionDeps {
  /** a reference instrument per market: NIFTY 50 for NSE, a commodity future for MCX */
  nseToken: () => number | undefined;
  mcxTokens: () => Set<number>;
  /** the dates that have a daily candle for a token in a range, ascending (a day with no candle was no session) */
  days: (token: number, from: string, to: string) => Promise<string[]>;
  /** the calendar-based answer, used only until the data has been read (or when it cannot be) */
  fallback: { nse: () => string; mcx: () => string };
  now?: () => number;
  /** how long a market counts as ticking after its last tick */
  nseQuietMs?: number;
  mcxQuietMs?: number;
}

export interface SessionState {
  nse: { day: string; ticking: boolean; lastTickAt: number | null; source: 'data' | 'calendar'; recent: string[] };
  mcx: { day: string; ticking: boolean; lastTickAt: number | null; source: 'data' | 'calendar'; recent: string[] };
  at: number | null;
  error: string | null;
}

const IST = 19800000;
const dayOf = (ms: number): string => new Date(ms + IST).toISOString().slice(0, 10);
const addDays = (d: string, n: number): string => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Which day each market shows, and whether it is trading, decided by the data instead of a holiday list. The day is today if the market already has a daily
 * candle for today (it has traded), else its latest session; a holiday simply has no candle. A market is "ticking" when its reference instrument has ticked
 * recently. The calendar is only the answer before the data is read.
 */
export class SessionService {
  private nseDays: string[] = [];
  private mcxDays: string[] = [];
  private nseAt = 0;
  private mcxAt = 0;
  private lastNse = 0;
  private lastMcx = 0;
  private at: number | null = null;
  error: string | null = null;
  private readonly now: () => number;
  constructor(private readonly d: SessionDeps) {
    this.now = d.now ?? Date.now;
  }

  /** every tick batch: remember when each market last ticked */
  onTicks(ticks: Tick[], now: number): void {
    const n = this.d.nseToken();
    const m = this.d.mcxTokens();
    for (const t of ticks) {
      if (n !== undefined && t.token === n) this.lastNse = now;
      else if (m.has(t.token)) this.lastMcx = now;
    }
  }

  nseTicking(): boolean {
    return this.lastNse > 0 && this.now() - this.lastNse < (this.d.nseQuietMs ?? 90000);
  }
  mcxTicking(): boolean {
    return this.lastMcx > 0 && this.now() - this.lastMcx < (this.d.mcxQuietMs ?? 180000);
  }

  private pick(days: string[], fallback: string): { day: string; source: 'data' | 'calendar' } {
    if (!days.length) return { day: fallback, source: 'calendar' };
    const today = dayOf(this.now());
    if (days.includes(today)) return { day: today, source: 'data' };
    const before = days.filter((x) => x < today);
    return before.length ? { day: before[before.length - 1]!, source: 'data' } : { day: fallback, source: 'calendar' };
  }

  nseDay(): string {
    return this.pick(this.nseDays, this.d.fallback.nse()).day;
  }
  mcxDay(): string {
    return this.pick(this.mcxDays, this.d.fallback.mcx()).day;
  }

  /** read both markets' daily candles (one call each); a failure keeps the last answer */
  async refresh(): Promise<void> {
    const to = dayOf(this.now());
    const from = addDays(to, -20);
    const errs: string[] = [];
    const nt = this.d.nseToken();
    if (nt !== undefined) {
      try {
        this.nseDays = await this.d.days(nt, from, to);
        this.nseAt = this.now();
      } catch (e) {
        errs.push(`NSE: ${(e as Error).message}`);
      }
    }
    const mt = [...this.d.mcxTokens()][0];
    if (mt !== undefined) {
      try {
        this.mcxDays = await this.d.days(mt, from, to);
        this.mcxAt = this.now();
      } catch (e) {
        errs.push(`MCX: ${(e as Error).message}`);
      }
    }
    this.at = this.now();
    this.error = errs.length ? errs.join('; ') : null;
  }

  state(): SessionState {
    const n = this.pick(this.nseDays, this.d.fallback.nse());
    const m = this.pick(this.mcxDays, this.d.fallback.mcx());
    return {
      nse: { ...n, ticking: this.nseTicking(), lastTickAt: this.lastNse || null, recent: this.nseDays.slice(-4) },
      mcx: { ...m, ticking: this.mcxTicking(), lastTickAt: this.lastMcx || null, recent: this.mcxDays.slice(-4) },
      at: this.at,
      error: this.error,
    };
  }
}
