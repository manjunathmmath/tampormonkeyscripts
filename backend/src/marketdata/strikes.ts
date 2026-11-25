import { resolveExpiry } from '../engine/optionChain.js';
import { analyse, expectedMove, legSpecs, snap, strikeStep, STRATEGIES, suggest, type Payoff, type PricedLeg, type StrategyKey } from '../engine/optionStrategy.js';
import type { InstrumentBook } from '../instruments/book.js';
import type { Candle } from '../kite/client.js';
import type { ConsensusResult } from './consensus.js';
import type { OiAnalysis } from './oi.js';
import type { VerdictResult } from './verdict.js';

type Req = { name: string; day: string; asOf?: string };

export interface StrikeDeps {
  book: () => InstrumentBook | undefined;
  history: { candles(q: { token: number; interval: '5minute'; from: string; to: string; asOf?: string }): Promise<Candle[]> };
  oi: { analyse(r: Req): Promise<OiAnalysis> };
  consensus: { load(r: Req): Promise<ConsensusResult> };
  verdict: { load(r: Req): Promise<VerdictResult> };
  isMcx: (name: string) => boolean;
  settings: { num(k: string): number | null };
  /** the configured option expiry of a name (ISO) or blank */
  expiryPref: (name: string, mcx: boolean) => string | undefined;
}

export interface StrikeLeg {
  type: 'CE' | 'PE';
  side: 'BUY' | 'SELL';
  strike: number;
  symbol: string;
  token: number;
  premium: number | null;
}

export interface StrikeResult {
  name: string;
  day: string;
  asOf: string | null;
  strategy: StrategyKey;
  label: string;
  view: string;
  suggested: StrategyKey;
  why: string;
  expiry: string;
  dte: number;
  spot: number;
  atm: number;
  step: number;
  offset: number;
  wing: number;
  lotSize: number;
  legs: StrikeLeg[];
  /** per share */
  payoff: Payoff;
  /** per lot, in rupees */
  perLot: { maxProfit: number | 'unlimited' | null; maxLoss: number | 'unlimited' | null; netCredit: number | null } | null;
  /** lots that keep the worst loss inside the risk budget (defined-risk strategies only) */
  lotsAtRisk: number | null;
  warnings: string[];
}

const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/**
 * Option Strike Search: a strategy for the consensus direction (or your choice), its legs on listed strikes of the chosen expiry, the last traded premium of each leg
 * up to the snapshot time, and the expiry payoff per lot. Arithmetic only: no margin, brokerage, taxes or slippage, and it never places an order.
 */
export class StrikeService {
  constructor(private readonly d: StrikeDeps) {}

  strategies(): { key: StrategyKey; label: string; view: string; kind: string }[] {
    return STRATEGIES.map((s) => ({ key: s.key, label: s.label, view: s.view, kind: s.kind }));
  }

  private hedgeFor(name: string, step: number): number {
    if (this.d.isMcx(name)) return step * 4;
    const k = name === 'NIFTY 50' ? 'hedge_diff_nifty' : name === 'NIFTY BANK' ? 'hedge_diff_banknifty' : /^(SENSEX|BANKEX)/.test(name) ? 'hedge_diff_nifty' : 'hedge_diff_stocks';
    return this.d.settings.num(k) ?? step * 4;
  }

  async load(req: Req, strategy?: StrategyKey, o: { offset?: number; wing?: number } = {}): Promise<StrikeResult> {
    const book = this.d.book();
    if (!book) throw new Error('Instruments are not loaded yet');
    const mcx = this.d.isMcx(req.name);
    const base = req.name === 'NIFTY 50' ? 'NIFTY' : req.name === 'NIFTY BANK' ? 'BANKNIFTY' : req.name;
    const exch = mcx ? 'MCX' : /^(SENSEX|BANKEX)/.test(base) ? 'BFO' : 'NFO';
    const all = book.options(exch, base);
    if (!all.length) throw new Error(`No option contracts found for ${req.name}`);
    const expiry = resolveExpiry(this.d.expiryPref(base, mcx) ?? '', [...new Set(all.map((r) => r.expiry))].sort(), req.day);
    if (!expiry) throw new Error(`No expiry found for ${req.name}`);
    const rows = all.filter((r) => r.expiry === expiry);
    const strikes = [...new Set(rows.map((r) => r.strike))].sort((a, b) => a - b);
    const step = strikeStep(strikes) || 1;

    const [oi, cn, vd] = await Promise.all([this.d.oi.analyse(req), this.d.consensus.load(req).catch(() => null), mcx ? Promise.resolve(null) : this.d.verdict.load(req).catch(() => null)]);
    const spot = oi.ltp;
    const atm = snap(strikes, spot);
    const dir = cn ? (cn.outcome === 'GO LONG' ? 1 : cn.outcome === 'GO SHORT' ? -1 : 0) : 0;
    const suggested = suggest(dir);
    const key = strategy && STRATEGIES.some((s) => s.key === strategy) ? strategy : suggested;
    const def = STRATEGIES.find((s) => s.key === key)!;
    const dte = Math.max(0, daysBetween(req.day, expiry));
    const warnings: string[] = [];

    // distance of the sold strikes: one expected move when the volatility is known, else three strikes
    const vix = vd?.inputs.indiaVix ?? null;
    const em = !mcx && vix ? expectedMove(spot, vix, dte) : 0;
    const autoOffset = em ? Math.max(step, Math.round(em / step) * step) : step * 3;
    const offset = o.offset && o.offset > 0 ? o.offset : autoOffset;
    const hedge = this.hedgeFor(req.name, step);
    // a debit spread is one expected move wide, never wider than 1.5 x the hedge distance and never under 2 strike steps (the old script's rule)
    const spreadWing = Math.min(Math.max(offset, step * 2), hedge * 1.5);
    const wing = o.wing && o.wing > 0 ? o.wing : key === 'bull_call' || key === 'bear_put' ? spreadWing : hedge;

    const specs = legSpecs(key, atm, offset, wing);
    const legs: StrikeLeg[] = [];
    for (const sp of specs) {
      const k = snap(strikes, sp.target);
      const ins = rows.find((r) => r.strike === k && r.type === sp.type);
      if (!ins) {
        warnings.push(`No ${sp.type} listed at ${k}`);
        continue;
      }
      let premium: number | null = null;
      try {
        const c = await this.d.history.candles({ token: ins.token, interval: '5minute', from: req.day, to: req.day, asOf: req.asOf });
        const last = c[c.length - 1];
        premium = last ? Number(last[4]) : null;
      } catch {
        premium = null;
      }
      if (premium == null) warnings.push(`${ins.symbol} has not traded${req.asOf ? ` by ${req.asOf}` : ' today'}: no price`);
      legs.push({ type: sp.type, side: sp.side, strike: k, symbol: ins.symbol, token: ins.token, premium });
    }
    const priced: PricedLeg[] = legs.map((l) => ({ type: l.type, side: l.side, target: l.strike, strike: l.strike, premium: l.premium }));
    const payoff = analyse(priced);
    const lot = rows[0]?.lotSize ?? 0;
    const perLot = payoff.ok && lot
      ? {
          maxProfit: payoff.maxProfit === 'unlimited' || payoff.maxProfit == null ? payoff.maxProfit : Math.round(payoff.maxProfit * lot),
          maxLoss: payoff.maxLoss === 'unlimited' || payoff.maxLoss == null ? payoff.maxLoss : Math.round(payoff.maxLoss * lot),
          netCredit: payoff.netCredit == null ? null : Math.round(payoff.netCredit * lot),
        }
      : null;
    const budget = ((this.d.settings.num('margin') ?? 0) * (this.d.settings.num('risk_pct_per_trade') ?? 0)) / 100;
    const lotsAtRisk = perLot && typeof perLot.maxLoss === 'number' && perLot.maxLoss > 0 && budget ? Math.floor(budget / perLot.maxLoss) : null;
    if (perLot?.maxLoss === 'unlimited') warnings.push('Unlimited loss: no hedge leg. Size it by your own stop, not by this table.');
    if (dte <= 1 && def.kind === 'debit') warnings.push(`Expires in ${dte} day${dte === 1 ? '' : 's'}: a bought option loses value fast near expiry.`);
    const why = !cn ? 'The consensus could not be read, so the neutral default is shown.' : dir === 0 ? `No clear direction (${cn.outcome}): a range strategy fits.` : `Consensus is ${dir > 0 ? 'LONG' : 'SHORT'} (${cn.agree} of ${cn.voting} signal groups agree).`;
    return {
      name: req.name, day: req.day, asOf: req.asOf ?? null, strategy: key, label: def.label, view: def.view, suggested, why, expiry, dte, spot, atm, step, offset, wing, lotSize: lot,
      legs, payoff, perLot, lotsAtRisk, warnings,
    };
  }
}
