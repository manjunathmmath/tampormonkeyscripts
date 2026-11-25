import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { KeyValueStore } from '../store/fileStore.js';

export type ClearWhat = 'instruments' | 'candles' | 'saved' | 'weights';

export interface DataAdminDeps {
  dataDir: string;
  store: KeyValueStore;
  /** deletes nothing itself: reloads the contract list (and strike steps) after the files were removed */
  reloadInstruments: () => Promise<void>;
  /** re-downloads the index constituents and weights */
  reloadWeights: () => Promise<void>;
  /** drops the in-memory slot caches */
  refresh: () => void;
}

interface Group {
  id: ClearWhat | 'kept';
  label: string;
  note: string;
  test: (name: string) => boolean;
}

/** Saved results that can be recomputed from history: past-day score series, 9:15 scans, squeeze studies, combo rows, long-term scans. */
const SAVED = /^(score_series_|score_hist_|scan915-|sqz_study_|combo-rows-|lt_scan_|lt_univ_)/;

const GROUPS: Group[] = [
  { id: 'instruments', label: 'Instruments and strike steps', note: 'Kite contract list and NSE strike intervals, one file per day. Re-downloaded at once.', test: (n) => /^(instruments|strike-steps)-.*\.csv$/.test(n) },
  { id: 'saved', label: 'Saved results', note: 'Past-day scores, 9:15 scans, squeeze studies and long-term scans. Recomputed from history when next viewed.', test: (n) => SAVED.test(n) },
  { id: 'weights', label: 'Index weights', note: 'NIFTY 50 and BANK NIFTY constituents and weights. Re-downloaded at once.', test: (n) => n === 'index-weights.json' },
];

const fileSize = (p: string): number => {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
};

/** What the backend keeps on disk, and clearing each kind separately. Settings, pins and the Kite login are never touched. */
export class DataAdmin {
  constructor(private readonly d: DataAdminDeps) {}

  private candlesDir(): string {
    return join(this.d.dataDir, 'candles');
  }

  inventory(): { id: string; label: string; note: string; files: number; bytes: number }[] {
    const top = existsSync(this.d.dataDir) ? readdirSync(this.d.dataDir) : [];
    const out = GROUPS.map((g) => {
      const names = top.filter((n) => g.test(n));
      return { id: g.id, label: g.label, note: g.note, files: names.length, bytes: names.reduce((a, n) => a + fileSize(join(this.d.dataDir, n)), 0) };
    });
    const cd = existsSync(this.candlesDir()) ? readdirSync(this.candlesDir()) : [];
    out.splice(1, 0, {
      id: 'candles',
      label: 'Candle history',
      note: 'Finished-day candles kept so Kite is not asked again. Clearing it makes every chart and score fetch from Kite again (slow: about 3 calls a second).',
      files: cd.length,
      bytes: cd.reduce((a, n) => a + fileSize(join(this.candlesDir(), n)), 0),
    });
    return out;
  }

  async clear(what: ClearWhat): Promise<{ removed: number }> {
    let removed = 0;
    const rm = (p: string): void => {
      try {
        unlinkSync(p);
        removed++;
      } catch {
        /* a file that is gone or locked is left */
      }
    };
    if (what === 'candles') {
      if (existsSync(this.candlesDir())) for (const n of readdirSync(this.candlesDir())) if (n.endsWith('.json')) rm(join(this.candlesDir(), n));
    } else {
      const g = GROUPS.find((x) => x.id === what);
      if (!g) throw new Error('unknown cache');
      for (const n of readdirSync(this.d.dataDir)) {
        if (!g.test(n)) continue;
        if (n.endsWith('.json')) {
          // through the store so its in-memory copy goes too
          try {
            this.d.store.delete(n.slice(0, -5));
            removed++;
            continue;
          } catch {
            /* fall through to a plain delete */
          }
        }
        rm(join(this.d.dataDir, n));
      }
    }
    if (what === 'instruments') await this.d.reloadInstruments();
    if (what === 'weights') await this.d.reloadWeights();
    this.d.refresh();
    return { removed };
  }
}
