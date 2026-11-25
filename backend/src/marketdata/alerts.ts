export interface Alert {
  id: number;
  at: number;
  name: string;
  kind: 'SHORT_COVERING' | 'LONG_UNWINDING' | 'ENTRY_ZONE' | 'LEVEL_NEAR' | 'LEVEL_AT' | 'NEWS' | 'EVENT' | 'SYSTEM';
  title: string;
  /** what to do about it */
  text: string;
  /** set when the signal moved away */
  clearedAt: number | null;
  /** held back (not shown): the state is tracked but no alert was raised yet */
  silent?: boolean;
}

type SqueezeLite = { signal: { active: boolean; type: string } };

export interface AlertDeps {
  squeeze: { load(r: { name: string; day: string }): Promise<unknown> };
  /** the real calendar day of a market */
  today: (mcx: boolean) => string;
  now?: () => number;
  /** optional message sender (Telegram); never required */
  notify?: (text: string) => Promise<void>;
  names?: { nse: string[]; mcx: string[] };
  /** the Probable trade plan of an index (null / not ok when none); used only when `outlookOn` is true */
  outlook?: (name: string) => Promise<{ ok?: boolean; spot?: number; plan?: { long: boolean; entryPx: number; stop: number } | null } | null>;
  outlookOn?: () => boolean;
  /** minutes to hold a repeat squeeze alert for the same name (a name that keeps flipping between short covering and long unwinding); 0 = off */
  holdMin?: () => number;
}

const IST = 330 * 60000;
/** Is the market inside the window the old script scans (NSE 09:20 to 15:30, MCX 09:05 to 23:55), Monday to Friday. */
export function inWindow(mcx: boolean, nowMs: number): boolean {
  const d = new Date(nowMs + IST);
  const dow = d.getUTCDay();
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (dow < 1 || dow > 5) return false;
  return mcx ? m >= 9 * 60 + 5 && m <= 23 * 60 + 55 : m >= 9 * 60 + 20 && m <= 15 * 60 + 30;
}

/**
 * Squeeze alerts (the 5-minute squeeze scan of the old script). A name that newly shows short covering (exit SHORT / PE) or long unwinding
 * (exit LONG / CE) raises one alert, which clears when the signal moves away and can fire again if it returns. It only tells you; it never touches an order.
 */
export class AlertService {
  private list: Alert[] = [];
  private active = new Map<string, Alert>();
  private raisedAt = new Map<string, number>();
  private raisedKind = new Map<string, Alert['kind']>();
  private heldN = new Map<string, number>();
  private seq = 0;
  constructor(private readonly d: AlertDeps) {}

  private names(): { name: string; mcx: boolean }[] {
    const n = this.d.names ?? { nse: ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'RELIANCE', 'HDFCBANK', 'ICICIBANK'], mcx: ['GOLDM', 'SILVERM'] };
    return [...n.nse.map((name) => ({ name, mcx: false })), ...n.mcx.map((name) => ({ name, mcx: true }))];
  }

  /** one pass over the watched names; a failed read keeps the existing state of that name */
  async tick(): Promise<Alert[]> {
    const now = (this.d.now ?? Date.now)();
    const fresh: Alert[] = [];
    for (const { name, mcx } of this.names()) {
      if (!inWindow(mcx, now)) continue;
      let sig: SqueezeLite['signal'];
      try {
        sig = ((await this.d.squeeze.load({ name, day: this.d.today(mcx) })) as SqueezeLite).signal;
      } catch {
        continue;
      }
      const on = sig.active && (sig.type === 'SHORT_COVERING' || sig.type === 'LONG_UNWINDING');
      const cur = this.active.get(name);
      const holdMs = Math.max(0, this.d.holdMin?.() ?? 0) * 60000;
      const lastAt = this.raisedAt.get(name) ?? 0;
      const within = holdMs > 0 && lastAt > 0 && now - lastAt < holdMs;
      const raise = (a: Alert): void => {
        const n = this.heldN.get(name) ?? 0;
        if (n > 0) a.text += ` (${n} other change${n > 1 ? 's' : ''} on this name ${n > 1 ? 'were' : 'was'} held back in the last ${Math.round(holdMs / 60000)} minutes.)`;
        this.heldN.delete(name);
        this.raisedAt.set(name, now);
        this.raisedKind.set(name, a.kind);
        a.silent = false;
        this.list.push(a);
        fresh.push(a);
        if (this.d.notify) void this.d.notify(`${a.title}\n${a.text}`).catch(() => undefined);
      };
      if (on && (!cur || cur.kind !== sig.type)) {
        if (cur) cur.clearedAt = now;
        const kind = sig.type as Alert['kind'];
        const a: Alert = {
          id: ++this.seq,
          at: now,
          name,
          kind,
          title: kind === 'SHORT_COVERING' ? `SHORT COVERING: ${name}` : `LONG UNWINDING: ${name}`,
          text: kind === 'SHORT_COVERING' ? `Exit your SHORT / PE positions on ${name}: shorts are covering and price is rising fast.` : `Exit your LONG / CE positions on ${name}: longs are unwinding and price is falling fast.`,
          clearedAt: null,
        };
        this.active.set(name, a);
        if (within) {
          // the same name changed again a moment ago: keep the state, hold the alert (counted, and raised later if the state outlasts the hold)
          a.silent = true;
          this.heldN.set(name, (this.heldN.get(name) ?? 0) + 1);
        } else raise(a);
      } else if (on && cur?.silent && !within && this.raisedKind.get(name) !== cur.kind) {
        // the hold is over and the name is still in a state that was never announced
        cur.at = now;
        raise(cur);
      } else if (!on && cur) {
        cur.clearedAt = now;
        this.active.delete(name);
      }
    }
    this.list = this.list.slice(-100);
    return fresh;
  }

  private entrySeen = new Set<string>();

  /** Probable trade: one alert per index and plan when price comes within 0.15% of the entry zone (the plan, not an order) */
  async entryTick(): Promise<Alert[]> {
    const now = (this.d.now ?? Date.now)();
    if (!this.d.outlook || !this.d.outlookOn?.() || !inWindow(false, now)) return [];
    const fresh: Alert[] = [];
    for (const name of ['NIFTY 50', 'NIFTY BANK', 'SENSEX']) {
      try {
        const o = await this.d.outlook(name);
        const p = o?.ok && o.plan ? o.plan : null;
        if (!p || !o?.spot) continue;
        const key = `${this.d.today(false)}|${name}|${p.long ? 'L' : 'S'}|${Math.round(p.entryPx)}`;
        if (this.entrySeen.has(key) || Math.abs(o.spot - p.entryPx) / o.spot > 0.0015) continue;
        this.entrySeen.add(key);
        const a: Alert = { id: ++this.seq, at: now, name, kind: 'ENTRY_ZONE', title: `ENTRY ZONE: ${name}`, text: `Price ${Math.round(o.spot)} reached the ${p.long ? 'LONG' : 'SHORT'} entry zone ${Math.round(p.entryPx)} of the Probable trade (stop ${Math.round(p.stop)}). This is the plan's level, not an instruction to trade.`, clearedAt: null };
        this.list.push(a);
        fresh.push(a);
        if (this.d.notify) void this.d.notify(`${a.title}
${a.text}`).catch(() => undefined);
      } catch {
        /* a name with no plan is skipped */
      }
    }
    return fresh;
  }

  /** an alert raised by another service (stock tracking): added to the list and sent like the others */
  push(x: { name: string; kind: Alert['kind']; title: string; text: string }): Alert {
    const a: Alert = { id: ++this.seq, at: (this.d.now ?? Date.now)(), clearedAt: null, ...x };
    this.list.push(a);
    this.list = this.list.slice(-100);
    if (this.d.notify) void this.d.notify(`${a.title}
${a.text}`).catch(() => undefined);
    return a;
  }

  /** alerts newer than an id (0 = all kept), newest last */
  since(id = 0): Alert[] {
    return this.list.filter((a) => a.id > id);
  }
}
