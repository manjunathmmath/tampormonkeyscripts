import { buildFocus, MCX_MULT, type FocusIn, type FocusOut } from '../engine/focus.js';
import type { ConsensusResult } from './consensus.js';
import type { FuturesResult } from './futures.js';
import type { LiveContextView } from './liveContext.js';
import type { MarketResult } from './market.js';
import type { OiAnalysis } from './oi.js';
import type { ScoreResult } from './score.js';
import type { SignalView } from './signals.js';
import type { SqueezeRead } from './squeeze.js';
import type { VerdictResult } from './verdict.js';

type Req = { name: string; day: string; asOf?: string };
const INDICES = ['NIFTY 50', 'NIFTY BANK', 'SENSEX'];

export interface FocusDeps {
  consensus: { load(r: Req): Promise<ConsensusResult> };
  verdict: { load(r: Req): Promise<VerdictResult> };
  score: { load(r: Req): Promise<ScoreResult> };
  oi: { analyse(r: Req): Promise<OiAnalysis> };
  futures: { load(r: Req): Promise<FuturesResult> };
  signals: { load(r: Req): Promise<SignalView> };
  squeeze: { load(r: Req): Promise<SqueezeRead> };
  market: { load(r: { day: string; asOf?: string }): Promise<MarketResult> };
  liveContext: { read(r: Req): Promise<LiveContextView | null> };
  isMcx: (name: string) => boolean;
  settings: { num(k: string): number | null };
  /** the real calendar day of a market (a day that is not this one, or any snapshot time, is not live) */
  today: (mcx: boolean) => string;
  now?: () => number;
}

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/** Is the MCX session open: Monday to Friday 09:00 to 23:55 IST. */
export function mcxOpen(nowMs: number): boolean {
  const ist = new Date(nowMs + 330 * 60000);
  const dow = ist.getUTCDay();
  const m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return dow >= 1 && dow <= 5 && m >= 9 * 60 && m <= 23 * 60 + 55;
}

/**
 * Trade Focus of one name: the five gates (tradeable today, direction, entry and timing, risk, exit) gathered from the services that already compute each input
 * (`_tfComputeStock` / `_tfComputeMcx`). Rule-based and not back-tested; it reads only, and places nothing.
 */
export class FocusService {
  constructor(private readonly d: FocusDeps) {}

  async load(req: Req): Promise<FocusOut & { day: string; asOf: string | null; chips: string[] }> {
    const { name } = req;
    const mcx = this.d.isMcx(name);
    const isIdx = INDICES.includes(name);
    const now = (this.d.now ?? Date.now)();
    const live = !req.asOf && req.day === this.d.today(mcx);
    const notLive = req.asOf ? `a snapshot at ${req.asOf} is shown` : `${req.day} is not today`;

    const [oi, cn, vd, sc, fut, sg, sq, mk, lx] = await Promise.all([
      safe(this.d.oi.analyse(req)),
      safe(this.d.consensus.load(req)),
      safe(this.d.verdict.load(req)),
      safe(this.d.score.load(req)),
      safe(this.d.futures.load(req)),
      safe(this.d.signals.load(req)),
      safe(this.d.squeeze.load(req)),
      mcx ? Promise.resolve(null) : safe(this.d.market.load({ day: req.day, asOf: req.asOf })),
      safe(this.d.liveContext.read(req)),
    ]);

    // the other index, for the cross-check (indices only)
    let partnerDir = 0;
    const partner = name === 'NIFTY 50' ? 'NIFTY BANK' : isIdx ? 'NIFTY 50' : '';
    if (partner) {
      const pc = await safe(this.d.consensus.load({ ...req, name: partner }));
      partnerDir = pc ? (pc.outcome === 'GO LONG' ? 1 : pc.outcome === 'GO SHORT' ? -1 : 0) : 0;
    }

    const tr = sc?.trend ?? null;
    const ltp = oi?.ltp || tr?.ltp || 0;
    const walls = oi ? { support: oi.walls.support.map((w) => ({ strike: w.strike, tier: w.tier })), resistance: oi.walls.resistance.map((w) => ({ strike: w.strike, tier: w.tier })) } : null;
    const dzBand = cn?.deadZoneBand && !cn.deadZoneBand.broken ? { lo: cn.deadZoneBand.lo, hi: cn.deadZoneBand.hi } : null;

    // the exit rule: NIFTY 50 keeps the index rule (its trend or both index futures); every other name uses its own
    let n50Fut = 0;
    let bnFut = 0;
    if (name === 'NIFTY 50') {
      n50Fut = sc?.futures?.dir ?? 0;
      const b = await safe(this.d.score.load({ ...req, name: 'NIFTY BANK' }));
      bnFut = b?.futures?.dir ?? 0;
    }
    const dir = cn ? (cn.outcome === 'GO LONG' ? 1 : cn.outcome === 'GO SHORT' ? -1 : 0) : 0;
    const sqType = sq?.signal.active ? sq.signal.type : 'NONE';
    const squeezeActive = !!dir && ((dir > 0 && sqType === 'LONG_UNWINDING') || (dir < 0 && sqType === 'SHORT_COVERING'));

    // the 9:15 level pair is the stop reference besides the wall verdict
    const lv = tr?.levels;
    const pair = lv && dir ? (dir > 0 ? { entry: lv.bso, stop: lv.bst } : { entry: lv.aso, stop: lv.ast }) : null;
    const mult = MCX_MULT[name];
    const lot = mcx ? { lot: mult ?? 0, src: 'mcx' as const } : fut?.lotSize ? { lot: fut.lotSize, src: 'futures' as const } : { lot: 0, src: '' as const };

    const input: FocusIn = {
      name,
      label: name,
      mcx,
      isIdx,
      live,
      notLive,
      inSession: mcx ? mcxOpen(now) : true,
      loaded: !!oi && oi.rows.length > 0,
      ltp,
      vd: vd as unknown as FocusIn['vd'],
      cn: cn as unknown as FocusIn['cn'],
      lx: lx ? { status: lx.status, against: lx.against } : null,
      partnerDir,
      partnerLabel: partner,
      walls,
      range: tr && tr.vixUpper && tr.vixLower ? { lo: tr.vixLower, hi: tr.vixUpper } : null,
      dz: dzBand,
      marketGuard: mk && mk.signal.signal === 'NO TRADE' ? mk.signal.reason : null,
      indiaVix: vd?.inputs.indiaVix ?? null,
      dte: sg?.dte ?? null,
      expiryToday: [],
      agreement: sg?.agreement ? { agree: sg.agreement.agree, total: sg.agreement.total, pct: sg.agreement.pct } : null,
      timing: sg?.timing ? { pct: sg.timing.pct, label: sg.timing.label } : null,
      risk: { capital: this.d.settings.num('margin') ?? 0, riskPct: this.d.settings.num('risk_pct_per_trade') ?? 0, lot, pair },
      exit: { mode: name === 'NIFTY 50' ? 'nifty' : 'single', trend: sc?.score.current_trend ?? 0, fut: sc?.futures?.dir ?? 0, n50Fut, bnFut, squeezeActive },
      plan915: null,
    };
    const out = buildFocus(input);
    return { ...out, day: req.day, asOf: req.asOf ?? null, chips: [...INDICES] };
  }
}
