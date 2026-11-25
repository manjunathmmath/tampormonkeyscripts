import { weightedTable, type WtdResult } from '../engine/weightedOi.js';
import type { OiAnalysis } from './oi.js';
import type { Progress } from './progress.js';

type Req = { day: string; asOf?: string };

export interface WeightedOiDeps {
  progress?: Progress;
  oi: { analyse(r: { name: string; day: string; asOf?: string }): Promise<OiAnalysis> };
  /** the live top-10 weights per index (percent) */
  top10: () => Record<'NIFTY 50' | 'NIFTY BANK', Record<string, number>> | undefined;
}

export interface WtdStock {
  name: string;
  oiScore: number;
  pcr: string;
  /** ATM-2 .. ATM+2 */
  strikes: { strike: string; atm: boolean; ceLabel: string; peLabel: string; chgCE: string; chgPE: string; score: number }[];
}

export interface WeightedOiResult {
  groups: { index: 'NIFTY 50' | 'NIFTY BANK'; table: WtdResult; stocks: Record<string, WtdStock>; skipped: string[] }[];
}

/** The weighted-constituents OI table of the Signals tab: each top-10 stock with its OI view and Index Impact. */
export class WeightedOiService {
  constructor(private readonly d: WeightedOiDeps) {}

  async load(r: Req, sort: 'impact' | 'weight' = 'impact'): Promise<WeightedOiResult> {
    const top = this.d.top10();
    const pk = `weightedoi|${r.day}|${r.asOf ?? ''}`;
    this.d.progress?.start(pk, 'Weighted constituents', 'option chains of the top-10 stocks', Object.keys(top?.['NIFTY 50'] ?? {}).length + Object.keys(top?.['NIFTY BANK'] ?? {}).length);
    const groups: WeightedOiResult['groups'] = [];
    for (const index of ['NIFTY 50', 'NIFTY BANK'] as const) {
      const wm = top?.[index] ?? {};
      const stocks: Record<string, WtdStock> = {};
      const skipped: string[] = [];
      const inputs: { name: string; weight: number; change: number }[] = [];
      await Promise.all(
        Object.keys(wm).map(async (name) => {
          try {
            const a = await this.d.oi.analyse({ name, day: r.day, asOf: r.asOf });
            if (!a.rows.length) throw new Error('no chain');
            let i = a.rows.findIndex((x) => x.atm);
            if (i < 0) i = Math.floor(a.rows.length / 2);
            stocks[name] = {
              name,
              oiScore: a.oiScore,
              pcr: a.pcr,
              strikes: a.rows.slice(Math.max(0, i - 2), i + 3).map((x) => ({ strike: x.strike, atm: x.atm, ceLabel: x.ceLabel, peLabel: x.peLabel, chgCE: x.chgCE, chgPE: x.chgPE, score: x.score })),
            };
            inputs.push({ name, weight: wm[name]!, change: a.changePct ?? 0 });
          } catch {
            skipped.push(name);
          }
          this.d.progress?.tick(pk);
        }),
      );
      let ixChange = 0;
      try {
        ixChange = (await this.d.oi.analyse({ name: index, day: r.day, asOf: r.asOf })).changePct ?? 0;
      } catch {
        ixChange = 0;
      }
      const coverage = Object.values(wm).reduce((s, w) => s + w, 0);
      groups.push({ index, table: weightedTable(inputs, ixChange, coverage, sort), stocks, skipped });
    }
    this.d.progress?.end(pk);
    return { groups };
  }
}
