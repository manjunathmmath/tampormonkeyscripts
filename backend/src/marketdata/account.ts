export interface AccountDeps {
  kite: {
    margins(): Promise<{ equity?: { net?: number; available?: { live_balance?: number; cash?: number } }; commodity?: { net?: number; available?: { live_balance?: number; cash?: number } } }>;
    positions(): Promise<{ day?: { pnl?: number }[] }>;
  };
}

export interface Account {
  /** available balance by segment, rupees; null when Kite did not send it */
  equity: number | null;
  commodity: number | null;
  /** the sum of Kite's own pnl over today's positions */
  dayPnl: number | null;
  open: number;
}

/** Funds and the day's P&L, read from Kite (the official API, read-only). A failed call leaves that figure empty instead of failing the whole read. */
export class AccountService {
  constructor(private readonly d: AccountDeps) {}

  async load(): Promise<Account> {
    const [m, p] = await Promise.all([this.d.kite.margins().catch(() => null), this.d.kite.positions().catch(() => null)]);
    const day = p?.day ?? [];
    return {
      equity: m?.equity?.available?.live_balance ?? m?.equity?.net ?? null,
      commodity: m?.commodity?.available?.live_balance ?? m?.commodity?.net ?? null,
      dayPnl: p ? Math.round(day.reduce((a, x) => a + (x.pnl ?? 0), 0) * 100) / 100 : null,
      open: day.length,
    };
  }
}
