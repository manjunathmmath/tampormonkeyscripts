export interface RawPosition {
  tradingsymbol: string;
  exchange: string;
  product?: string;
  quantity: number;
  average_price?: number;
  last_price?: number;
  pnl?: number;
  m2m?: number;
  day_buy_quantity?: number;
  day_sell_quantity?: number;
  multiplier?: number;
}

export interface PlanLite { long: boolean; entry: number; stop: number; t1: number | null; rank: number; forced: boolean }

export interface PositionRow {
  symbol: string;
  exchange: string;
  product: string;
  qty: number;
  open: boolean;
  /** what the position bets on: the underlying going up (long call, short put, long future / share) or down */
  stance: 'bullish' | 'bearish';
  avg: number | null;
  ltp: number | null;
  pnl: number;
  pnlPct: number | null;
  underlying: string | null;
  underlyingLtp: number | null;
  plan: PlanLite | null;
  /** how the plan sits against the position: with it, against it, or no plan for this underlying */
  vs: 'with the plan' | 'against the plan' | 'no plan';
  /** the underlying's distance to the plan's stop (towards the loss) and to target 1, in points, for the plan's own direction */
  toStop: number | null;
  toT1: number | null;
}

export interface PositionsView {
  at: number;
  open: PositionRow[];
  closed: PositionRow[];
  totals: { pnl: number; open: number; closed: number; against: number };
}

export interface PositionsDeps {
  positions(): Promise<{ net?: RawPosition[]; day?: RawPosition[] }>;
  /** the underlying behind a contract, in the app's own names (NIFTY 50, NIFTY BANK, SENSEX, GOLDM, RELIANCE ...), and the option side if it is one */
  resolve(exchange: string, symbol: string): { underlying: string; option: 'CE' | 'PE' | null } | null;
  /** the last price of an underlying (the live tick) */
  ltp(underlying: string): number | null;
  /** the Probable trade of an underlying, or null (only indices and commodities are asked) */
  plan(underlying: string): Promise<PlanLite | null>;
  planNames: () => Set<string>;
  now?: () => number;
}

const r2 = (x: number): number => Math.round(x * 100) / 100;

/** What bet a position makes on its underlying: a long call or a short put is bullish, a long put or a short call bearish, a future or a share by its sign. */
export function stanceOf(qty: number, option: 'CE' | 'PE' | null): 'bullish' | 'bearish' {
  const long = qty > 0;
  if (option === 'CE') return long ? 'bullish' : 'bearish';
  if (option === 'PE') return long ? 'bearish' : 'bullish';
  return long ? 'bullish' : 'bearish';
}

/** Your open positions with their P&L, and how each one sits against the Probable trade of its underlying. Read only: nothing is placed or closed. */
export class PositionsService {
  private readonly now: () => number;
  constructor(private readonly d: PositionsDeps) {
    this.now = d.now ?? Date.now;
  }

  async load(): Promise<PositionsView> {
    const raw = await this.d.positions();
    const list = (raw.net ?? raw.day ?? []).filter((p) => p && p.tradingsymbol);
    const plans = new Map<string, PlanLite | null>();
    const rows: PositionRow[] = [];
    for (const p of list) {
      const res = this.d.resolve(p.exchange, p.tradingsymbol);
      const under = res?.underlying ?? p.tradingsymbol;
      const qty = Math.round(p.quantity ?? 0);
      const stance = stanceOf(qty || (p.day_buy_quantity ?? 0) - (p.day_sell_quantity ?? 0), res?.option ?? null);
      let plan: PlanLite | null = null;
      if (qty !== 0 && this.d.planNames().has(under)) {
        if (!plans.has(under)) plans.set(under, await this.d.plan(under).catch(() => null));
        plan = plans.get(under) ?? null;
      }
      const uLtp = this.d.ltp(under);
      const cost = Math.abs(qty) * (p.average_price ?? 0);
      const planBull = plan ? plan.long : null;
      const vs: PositionRow['vs'] = !plan ? 'no plan' : (stance === 'bullish') === planBull ? 'with the plan' : 'against the plan';
      rows.push({
        symbol: p.tradingsymbol, exchange: p.exchange, product: p.product ?? '', qty, open: qty !== 0, stance,
        avg: p.average_price ?? null, ltp: p.last_price ?? null, pnl: r2(p.pnl ?? 0), pnlPct: cost > 0 ? r2(((p.pnl ?? 0) / cost) * 100) : null,
        underlying: res ? under : null, underlyingLtp: uLtp, plan, vs,
        toStop: plan && uLtp != null ? r2(plan.long ? uLtp - plan.stop : plan.stop - uLtp) : null,
        toT1: plan && plan.t1 != null && uLtp != null ? r2(plan.long ? plan.t1 - uLtp : uLtp - plan.t1) : null,
      });
    }
    const open = rows.filter((r) => r.open).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
    const closed = rows.filter((r) => !r.open);
    return { at: this.now(), open, closed, totals: { pnl: r2(rows.reduce((a, r) => a + r.pnl, 0)), open: open.length, closed: closed.length, against: open.filter((r) => r.vs === 'against the plan').length } };
  }
}
