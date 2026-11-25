import type { Candle } from '../kite/client.js';
import { classifyFutures, type FutCandle, type FutQuote } from '../engine/futures.js';
import type { AccMap } from '../engine/futAccuracy.js';
import { SQZ_STUDY_DAYS, analyseDays, fuelBadge, preSqueezeScore, shortCoveringSignal, trailingStreak, type PreSqueeze, type SqueezeSignal, type StudyResult } from '../engine/squeeze.js';
import type { KeyValueStore } from '../store/fileStore.js';

type Req = { name: string; day: string; asOf?: string };

export interface SqueezeDeps {
  futures: {
    load(r: Req): Promise<{ remark: string; token: number; lotSize: number; expiry: string }>;
    series(r: Req): Promise<{ intraday: FutCandle[]; prev: FutQuote; lot: number; vix: number }>;
  };
  futAcc: { load(r: Req): Promise<AccMap> };
  oi: { analyse(r: Req): Promise<{ pcr: string; changePct: number | null; ltp: number }> };
  history: { candles(q: { token: number; interval: '5minute'; from: string; to: string; oi?: boolean }): Promise<Candle[]> };
  store: KeyValueStore;
}

export interface SqueezeRead {
  name: string;
  day: string;
  signal: SqueezeSignal;
  watch: (PreSqueeze & { badge: { label: string; tone: string } }) | null;
  study: { state: 'ready' | 'loading' | 'error'; data?: StudyResult; error?: string };
  /** the squeeze happening now compared with the past legs: the study rank is left to the screen */
  note: string;
}

const shift = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** Short covering / long unwinding for one futures contract: the live signal, the pre-squeeze watch and the contract's own past-episode study. */
export class SqueezeService {
  private readonly jobs = new Map<string, { state: 'loading' | 'ready' | 'error'; data?: StudyResult; error?: string }>();
  constructor(private readonly d: SqueezeDeps) {}

  /** the finished study of the day, from the saved copy only (never starts a fetch) */
  cachedStudy(name: string, day: string): StudyResult | null {
    return this.d.store.get<StudyResult>(`sqz_study_${name.replace(/\W/g, '_')}_${day}_v3`) ?? null;
  }

  private study(name: string, day: string, token: number, lot: number, vix: number): { state: 'loading' | 'ready' | 'error'; data?: StudyResult; error?: string } {
    const key = `sqz_study_${name.replace(/\W/g, '_')}_${day}_v3`;
    const saved = this.d.store.get<StudyResult>(key);
    if (saved) return { state: 'ready', data: saved };
    const hit = this.jobs.get(key);
    if (hit) return hit;
    const job: { state: 'loading' | 'ready' | 'error'; data?: StudyResult; error?: string } = { state: 'loading' };
    this.jobs.set(key, job);
    void (async () => {
      try {
        const raw = await this.d.history.candles({ token, interval: '5minute', from: shift(day, -SQZ_STUDY_DAYS), to: shift(day, -1), oi: true });
        const byDay = new Map<string, FutCandle[]>();
        for (const c of raw) {
          const dd = String(c[0]).slice(0, 10);
          if (dd >= day) continue;
          if (!byDay.has(dd)) byDay.set(dd, []);
          byDay.get(dd)!.push({ date: String(c[0]).slice(11, 16), open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5], oi: c[6] });
        }
        const order = [...byDay.keys()].sort().map((date) => ({ date, intr: byDay.get(date)! }));
        const data = analyseDays(order, lot, vix, (q, p, l, up, o) => classifyFutures(q, p, l, up, o));
        this.d.store.set(key, data);
        job.state = 'ready';
        job.data = data;
      } catch (e) {
        job.state = 'error';
        job.error = (e as Error).message;
        setTimeout(() => this.jobs.delete(key), 120000).unref();
      }
    })();
    return job;
  }

  async load(r: Req): Promise<SqueezeRead> {
    const [f, s, acc, oi] = await Promise.all([this.d.futures.load(r), this.d.futures.series(r), this.d.futAcc.load(r).catch(() => ({}) as AccMap), this.d.oi.analyse(r).catch(() => null)]);
    const remarks: (string | null)[] = s.intraday.map(() => null);
    let hi = 0;
    let lo = Infinity;
    let vol = 0;
    for (let i = 0; i < s.intraday.length; i++) {
      const c = s.intraday[i]!;
      hi = Math.max(hi, c.high);
      lo = Math.min(lo, c.low);
      vol += c.volume || 0;
      if (i < 1) continue;
      try {
        remarks[i] = classifyFutures({ high: hi, low: lo, close: c.close, volume: vol, oi: c.oi }, s.prev, s.lot, s.intraday.slice(0, i + 1), { vix: s.vix, baselineVix: 13 }).remark;
      } catch {
        remarks[i] = null;
      }
    }
    const days = daysBetween(r.day, f.expiry);
    const pcr = oi && oi.pcr !== undefined && oi.pcr !== '' && Number.isFinite(parseFloat(oi.pcr)) ? parseFloat(oi.pcr) : null;
    const signal = shortCoveringSignal({ remark: f.remark, daysToExpiry: days, pcr, todayChgPct: oi?.changePct ?? 0, ltp: oi?.ltp ?? 0, acc: acc[f.remark] });
    const pre = preSqueezeScore(trailingStreak(remarks), pcr, days, (rm) => acc[rm]);
    const study = this.study(r.name, r.day, f.token, f.lotSize, s.vix);
    const badge = pre ? fuelBadge(study.data ?? null, pre.willBe === 'SHORT_COVERING') : null;
    return {
      name: r.name,
      day: r.day,
      signal,
      watch: pre && badge ? { ...pre, badge: study.state === 'loading' ? { label: 'CHECKING', tone: 'flat' } : badge } : null,
      study,
      note: 'The remark is detected, not predicted. The setup number is a hand-weighted ranking, not a probability.',
    };
  }
}
