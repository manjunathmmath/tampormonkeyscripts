import type { Candle } from '../kite/client.js';
import { computeMaxPainGEX, computeOIScore, findWalls, ivSkewScore, maxPainScore, oiPriceChange, scoreOIStrike, wallErosion, wallVelocity, type MaxPain, type OiRow, type Walls } from '../engine/oi.js';
import type { ChainRequest, ChainResult } from './optionChain.js';
import { previousDayFor } from './history.js';

export interface OiDeps {
  chains: { load(req: ChainRequest): Promise<ChainResult> };
  history: { candles(q: { token: number; interval: 'day'; from: string; to: string; oi?: boolean }): Promise<Candle[]> };
  tokens: () => Record<string, number>;
  holidays?: () => ReadonlySet<string>;
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

export interface OiAnalysis {
  name: string;
  day: string;
  expiry: string;
  /** latest spot price and its change vs the previous close (2 decimals), as the userscript's generateTrend gives them */
  ltp: number;
  prevClose: number | null;
  changePct: number | null;
  /** the strike used as "spot" for ITM rules and walls (the ATM row) */
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
  maxPain: Pick<MaxPain, 'maxPainK' | 'maxPainDist' | 'maxPainPct' | 'netGEX' | 'flipZones'> | null;
  maxPainScore: number;
  walls: Walls;
  eroding: ReturnType<typeof wallErosion>['eroding'];
  building: ReturnType<typeof wallVelocity>['building'];
  rows: OiStrikeView[];
}

const last = <T>(a: T[]): T | undefined => a[a.length - 1];

/** Everything the userscript derives from an option chain's OI / OBV: the per-strike labels, the chain score, walls, build-up, erosion, max pain and the skew score. */
export class OiService {
  constructor(private readonly d: OiDeps) {}

  /** The raw chain rows and the spot candles of the day, for engines that run their own scoring on them (the wall verdict). */
  async chainRaw(req: ChainRequest): Promise<{ rows: OiRow[]; spotCandles: Candle[] }> {
    const res = await this.d.chains.load(req);
    return { rows: res.chain.tableData as unknown as OiRow[], spotCandles: res.chain.spotCandles };
  }

  /** Walls the way _gtbLevelProb finds them: with the live price as spot and the change vs the previous close (not the ATM strike). */
  async wallsAt(req: ChainRequest, change: number, spot: number): Promise<Walls | null> {
    const res = await this.d.chains.load(req);
    const rows = res.chain.tableData as unknown as OiRow[];
    return rows && rows.length ? findWalls(rows, change, spot) : null;
  }

  async analyse(req: ChainRequest): Promise<OiAnalysis> {
    const res = await this.d.chains.load(req);
    const rows = res.chain.tableData as unknown as OiRow[];
    const spotCandles = res.chain.spotCandles;
    const ltp = last(spotCandles)?.[4] ?? res.anchorPrice;

    // change vs the previous close, rounded to 2 decimals like generateTrend().change
    let prevClose: number | null = null;
    const token = this.d.tokens()[res.name];
    if (token) {
      try {
        const prevDay = previousDayFor(req.name, req.day, this.d.holidays?.() ?? new Set());
        const dc = await this.d.history.candles({ token, interval: 'day', from: prevDay, to: prevDay });
        prevClose = last(dc)?.[4] ?? null;
      } catch {
        prevClose = null;
      }
    }
    const changePct = prevClose ? parseFloat((((ltp - prevClose) / prevClose) * 100).toFixed(2)) : null;
    const pc = oiPriceChange(changePct, spotCandles);

    let spot = 0;
    for (const r of rows) if (r.ATM_STRIKE) spot = parseFloat(String(r.STRIKE)) || 0;

    const score = computeOIScore(rows, pc);
    const walls = findWalls(rows, pc, spot);
    const mp = computeMaxPainGEX(rows);
    const view: OiStrikeView[] = rows.map((r) => {
      let ceLabel = '';
      let peLabel = '';
      let sc = 0;
      try {
        const s = scoreOIStrike(r, !!r.ATM_STRIKE, pc, spot);
        ceLabel = s.ceLabel;
        peLabel = s.peLabel;
        sc = s.score;
      } catch {
        /* a strike with no OBV is shown without a label */
      }
      const lo = (a: { obv: string }[]): number | null => (a.length ? parseFloat(a[a.length - 1]!.obv) : null);
      const li = (a: { iv: number | null }[] | undefined): number | null => (a && a.length ? a[a.length - 1]!.iv : null);
      return { strike: String(r.STRIKE), atm: Boolean(r.ATM_STRIKE), oiCE: r.OI_CE, oiPE: r.OI_PE, chgCE: r.CHG_OI_CE, chgPE: r.CHG_OI_PE, obvCE: lo(r.CE_OBV), obvPE: lo(r.PE_OBV), ivCE: li(r.CE_IV), ivPE: li(r.PE_IV), ceLabel, peLabel, score: sc };
    });

    return {
      name: res.name,
      day: res.day,
      expiry: res.expiry,
      ltp,
      prevClose,
      changePct,
      spot,
      oiScore: score.score,
      obvFlow: score.obvFlow,
      oiWall: score.oiWall,
      oiConflicts: score.oiConflicts,
      pcr: res.chain.pcr,
      chPcr: res.chain.chPcr,
      ivSkew: res.chain.ivSkew,
      ivSkewScore: ivSkewScore(res.chain.ivSkew),
      atmIV: res.chain.atmIV,
      oiConcentration: res.chain.oiConcentration,
      maxPain: mp ? { maxPainK: mp.maxPainK, maxPainDist: mp.maxPainDist, maxPainPct: mp.maxPainPct, netGEX: mp.netGEX, flipZones: mp.flipZones } : null,
      maxPainScore: maxPainScore(mp),
      walls,
      eroding: wallErosion(rows, walls).eroding,
      building: wallVelocity(rows, spot).building,
      rows: view,
    };
  }
}
export type { Walls };
