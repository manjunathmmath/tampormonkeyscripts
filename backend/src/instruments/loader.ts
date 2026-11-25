import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { InstrumentBook, parseInstrumentsCsv } from './book.js';

export interface InstrumentSource {
  instruments(exchange?: string): Promise<string>;
}

const FILE_RE = /^instruments-(\d{4}-\d{2}-\d{2})\.csv$/;

/** Date in IST as YYYY-MM-DD (instruments change once a day, in the morning IST). */
export function istDay(nowMs: number): string {
  return new Date(nowMs + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Loads today's instruments: from the saved copy when there is one for today, else from Kite (and saves it).
 * Older copies are removed so the folder does not grow.
 */
export async function loadInstruments(source: InstrumentSource, dataDir: string, nowMs = Date.now()): Promise<InstrumentBook> {
  mkdirSync(dataDir, { recursive: true });
  const day = istDay(nowMs);
  const file = join(dataDir, `instruments-${day}.csv`);
  let text: string;
  if (existsSync(file)) text = readFileSync(file, 'utf8');
  else {
    text = await source.instruments();
    writeFileSync(file, text, 'utf8');
    for (const f of readdirSync(dataDir)) {
      const m = FILE_RE.exec(f);
      if (m && m[1] !== day) unlinkSync(join(dataDir, f));
    }
  }
  return new InstrumentBook(parseInstrumentsCsv(text), day);
}
