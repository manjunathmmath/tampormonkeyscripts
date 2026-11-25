import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Candle } from '../kite/client.js';
import { classifyZone, getStrikeDiff, strikeDetails, type StrikeDiffMap, type Zone } from '../engine/levels.js';
import { dayOf } from '../marketdata/candles.js';
import { isWeekend } from '../marketdata/history.js';

export interface ScanItem {
  zone: Zone;
  ast: number;
  aso: number;
  bso: number;
  bst: number;
  /** the first candle's open (the strike reference) */
  anchor: number;
  /** the first candle's close (the value that is classified) */
  close: number;
  /** false when the name had no strike step and the 100,100 placeholder was used */
  stepKnown: boolean;
}

export interface ScanState {
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

export interface ScanDeps {
  history: { candles(q: { token: number; interval: '5minute'; from: string; to: string; oi?: boolean; noLive?: boolean }): Promise<Candle[]> };
  /** name -> token (the app's universe) */
  universe: () => Record<string, number>;
  strikeDiffs: () => StrikeDiffMap;
  stepsSource?: () => string | null;
  dataDir: string;
  now?: () => number;
}

const empty = (day: string): ScanState => ({ day, running: false, total: 0, done: 0, current: null, startedAt: null, finishedAt: null, items: {}, errors: [], stepsSource: null, message: null });

/** The most recent weekday on or before today IST, as the day to scan when none is asked for (holidays are not known here). */
export function defaultScanDay(nowMs: number, holidays: ReadonlySet<string> = new Set()): string {
  const back = (d: string): string => new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  let d = dayOf(nowMs);
  const ist = new Date(nowMs + 5.5 * 3600 * 1000);
  if (ist.getUTCHours() * 60 + ist.getUTCMinutes() < 9 * 60 + 20) d = back(d); // today's first candle is not complete yet
  while (isWeekend(d) || holidays.has(d)) d = back(d);
  return d;
}

/**
 * The 9:15 scan. Port of `scanNineFifteenCandle`: for every name in the universe, take the day's first 5-minute candle, build ASO/AST/BSO/BST
 * from its OPEN and the name's strike step, and classify its CLOSE (>= AST, >= ASO, <= BST, <= BSO, else B/W). GIFT NIFTY is anchored to its own
 * 09:15 candle (its session starts earlier). A name with no candles is skipped.
 */
export class Scan915 {
  private states = new Map<string, ScanState>();
  private stopFlag = false;
  private readonly now: () => number;
  constructor(private readonly d: ScanDeps) {
    this.now = d.now ?? Date.now;
    mkdirSync(d.dataDir, { recursive: true });
  }

  private file(day: string): string {
    return join(this.d.dataDir, `scan915-${day}.json`);
  }

  state(day: string): ScanState {
    const mem = this.states.get(day);
    if (mem) return mem;
    const f = this.file(day);
    if (existsSync(f)) {
      try {
        const s = JSON.parse(readFileSync(f, 'utf8')) as ScanState;
        s.running = false;
        this.states.set(day, s);
        return s;
      } catch {
        /* fall through */
      }
    }
    return empty(day);
  }

  stop(): void {
    this.stopFlag = true;
  }

  isRunning(): boolean {
    return [...this.states.values()].some((s) => s.running);
  }

  /** Starts a scan in the background and returns its initial state. A scan already running is returned as is. */
  start(day: string, force = false): ScanState {
    const running = [...this.states.values()].find((s) => s.running);
    if (running) return running;
    const nowMs = this.now();
    const prev = this.state(day);
    if (!force && prev.finishedAt && Object.keys(prev.items).length) return prev;
    if (day === dayOf(nowMs)) {
      const ist = new Date(nowMs + 5.5 * 3600 * 1000);
      const hm = ist.getUTCHours() * 60 + ist.getUTCMinutes();
      if (hm < 9 * 60 + 20 && !isWeekend(day)) {
        const s = { ...empty(day), message: 'The 9:15 candle closes at 09:20: scan after that.' };
        this.states.set(day, s);
        return s;
      }
    }
    const names = Object.keys(this.d.universe());
    const s: ScanState = { ...empty(day), running: true, total: names.length, startedAt: nowMs, stepsSource: this.d.stepsSource?.() ?? null };
    this.states.set(day, s);
    this.stopFlag = false;
    void this.run(s);
    return s;
  }

  private async run(s: ScanState): Promise<void> {
    const uni = this.d.universe();
    const diffs = this.d.strikeDiffs();
    for (const name of Object.keys(uni)) {
      if (this.stopFlag) {
        s.message = 'Stopped.';
        break;
      }
      s.current = name;
      try {
        const candles = await this.d.history.candles({ token: uni[name]!, interval: '5minute', from: s.day, to: s.day, noLive: true });
        let anchor = candles[0];
        if (name === 'GIFT NIFTY') {
          const g = candles.find((c) => String(c[0]).slice(11, 16) === '09:15');
          if (g) anchor = g;
        }
        if (anchor) {
          const open = anchor[1];
          const close = anchor[4];
          const sd = getStrikeDiff(name, diffs);
          const lv = strikeDetails(open, sd.diff);
          s.items[name] = { zone: classifyZone(close, lv), ast: lv.ast, aso: lv.aso, bso: lv.bso, bst: lv.bst, anchor: open, close, stepKnown: sd.known };
        }
      } catch (e) {
        s.errors.push({ name, error: (e as Error).message });
        // a token problem will fail every remaining name: stop and say so
        if ((e as { code?: string }).code === 'TOKEN') {
          s.message = (e as Error).message;
          break;
        }
      }
      s.done++;
    }
    s.running = false;
    s.current = null;
    s.finishedAt = this.now();
    if (!s.message && !Object.keys(s.items).length) s.message = 'No candle data for this day.';
    if (Object.keys(s.items).length) {
      const f = this.file(s.day);
      const tmp = `${f}.tmp`;
      writeFileSync(tmp, JSON.stringify(s), 'utf8');
      renameSync(tmp, f);
    }
  }
}
