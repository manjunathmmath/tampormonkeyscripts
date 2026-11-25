import type { OiRow } from '../../src/engine/oi.js';
import type { rng } from './rng.js';

type R = ReturnType<typeof rng>;

/** A random option-chain table shaped like the one the chain builder produces (strings from toFixed, OBV and IV series, sometimes empty). */
export function table(r: R, opts: { allowEmpty?: boolean } = {}): { rows: OiRow[]; spot: number } {
  const n = r.int(3, 9);
  const step = r.pick([50, 100, 10, 5]);
  const base = r.int(100, 600) * step;
  const atm = r.int(0, n - 1);
  const rows: OiRow[] = [];
  for (let i = 0; i < n; i++) {
    const series = (): { date: string; obv: string }[] => {
      const len = opts.allowEmpty && r.chance(0.05) ? 0 : r.int(1, 30);
      let v = 0;
      return Array.from({ length: len }, () => {
        v += r.range(-60, 60);
        return { date: 'x', obv: v.toFixed(1) };
      });
    };
    const iv = (): { date: string; iv: number | null }[] => {
      let v = r.range(8, 30);
      return Array.from({ length: r.int(0, 30) }, () => {
        v += r.range(-1.5, 1.5);
        return { date: 'x', iv: r.chance(0.15) ? null : parseFloat(v.toFixed(2)) };
      });
    };
    rows.push({
      STRIKE: String(base + i * step),
      ATM_STRIKE: i === atm ? true : '',
      OI_CE: r.range(0, 150).toFixed(1),
      OI_PE: r.range(0, 150).toFixed(1),
      CHG_OI_CE: r.range(-30, 30).toFixed(1),
      CHG_OI_PE: r.range(-30, 30).toFixed(1),
      CE_OBV: series(),
      PE_OBV: series(),
      CE_IV: iv(),
      PE_IV: iv(),
    });
  }
  return { rows, spot: r.chance(0.9) ? base + atm * step : 0 };
}
