import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INDEX_STRIKE_DIFF, type StrikeDiffMap } from '../engine/levels.js';
import { splitCsvLine } from '../instruments/book.js';

export const STRIKE_CSV_URL = 'https://nsearchives.nseindia.com/content/fo/NSE_FO_SosScheme.csv';

/** symbol -> month type (M1, M2...) -> list of step values. Port of `_dlParseStrikeCsv` (first two lines are a date and the header). */
export function parseStrikeCsv(text: string): Record<string, Record<string, number[]>> {
  const lines = text.split('\n');
  const out: Record<string, Record<string, number[]>> = {};
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const c = splitCsvLine(line);
    if (c.length < 4) continue;
    const symbol = (c[0] ?? '').trim();
    const monthType = (c[1] ?? '').trim();
    const step = parseFloat(c[3] ?? '');
    if (!symbol || !monthType || isNaN(step)) continue;
    ((out[symbol] ??= {})[monthType] ??= []).push(step);
  }
  return out;
}

/** `_dlStrikeDiffString`: "min,max", or just "min" when min equals max. */
export function strikeDiffString(steps: number[] | undefined): string | null {
  if (!steps || !steps.length) return null;
  const min = Math.min(...steps);
  const max = Math.max(...steps);
  return min === max ? String(min) : `${min},${max}`;
}

/** `_dlBestStrikeDiff`: prefers M1, then M2, M3, then any other month type present. */
export function bestStrikeDiff(entry: Record<string, number[]> | undefined): string | null {
  if (!entry) return null;
  const order = ['M1', 'M2', 'M3', ...Object.keys(entry).filter((k) => k !== 'M1' && k !== 'M2' && k !== 'M3')];
  for (const m of order) {
    const d = strikeDiffString(entry[m]);
    if (d) return d;
  }
  return null;
}

/** NSE_STRIKE_DIFF: stock steps from the NSE file merged with the hand-maintained index steps (indices win). */
export function buildStrikeDiffMap(parsed: Record<string, Record<string, number[]>>): StrikeDiffMap {
  const stock: StrikeDiffMap = {};
  for (const s of Object.keys(parsed)) {
    const best = bestStrikeDiff(parsed[s]);
    if (best) stock[s] = best;
  }
  return { ...stock, ...INDEX_STRIKE_DIFF };
}

const FILE_RE = /^strike-steps-(\d{4}-\d{2}-\d{2})\.csv$/;

/** Loads today's NSE strike-step file: the saved copy when there is one for `day`, else downloads it (and removes older copies). Falls back to the newest saved copy if the download fails. */
export async function loadStrikeSteps(
  dataDir: string,
  day: string,
  fetchText: (url: string) => Promise<string> = defaultFetch,
): Promise<{ map: StrikeDiffMap; symbols: string[]; source: 'saved' | 'downloaded' | 'older-copy' }> {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, `strike-steps-${day}.csv`);
  let text: string | undefined;
  let source: 'saved' | 'downloaded' | 'older-copy' = 'saved';
  if (existsSync(file)) text = readFileSync(file, 'utf8');
  else {
    try {
      text = await fetchText(STRIKE_CSV_URL);
      if (!text || text.split('\n').length < 10) throw new Error('empty or too short');
      writeFileSync(file, text, 'utf8');
      source = 'downloaded';
      for (const f of readdirSync(dataDir)) {
        const m = FILE_RE.exec(f);
        if (m && m[1] !== day) unlinkSync(join(dataDir, f));
      }
    } catch (e) {
      const older = readdirSync(dataDir).filter((f) => FILE_RE.test(f)).sort().at(-1);
      if (!older) throw new Error(`Could not get the NSE strike-step file (${(e as Error).message}) and no saved copy exists`);
      text = readFileSync(join(dataDir, older), 'utf8');
      source = 'older-copy';
    }
  }
  const parsed = parseStrikeCsv(text);
  return { map: buildStrikeDiffMap(parsed), symbols: Object.keys(parsed), source };
}

async function defaultFetch(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' }, signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
