export interface WatchdogDeps {
  now?: () => number;
  /** is it a trading day and a time when the feed should be delivering */
  active: () => boolean;
  tokenOk: () => boolean;
  feed: () => { connected: boolean; lastTickAt: number };
  push: (a: { name: string; kind: 'SYSTEM'; title: string; text: string }) => void;
  /** silence after the feed has been quiet this long */
  quietMs?: number;
  /** repeat a standing problem this often */
  repeatMs?: number;
}

type Kind = 'token' | 'feed';

/**
 * Tells you when the data stops: the Kite login has expired, or the live feed is down or silent for more than two minutes while the market is open.
 * One alert when it starts, a reminder every 15 minutes while it lasts, and one note when it is fixed. Nothing here touches an order.
 */
export class Watchdog {
  private since = new Map<Kind, { at: number; lastAlert: number }>();
  private readonly now: () => number;
  constructor(private readonly d: WatchdogDeps) {
    this.now = d.now ?? Date.now;
  }

  private problem(kind: Kind, bad: boolean, title: string, text: string): void {
    const n = this.now();
    const s = this.since.get(kind);
    if (bad) {
      if (!s) {
        this.since.set(kind, { at: n, lastAlert: n });
        this.d.push({ name: 'System', kind: 'SYSTEM', title, text });
      } else if (n - s.lastAlert >= (this.d.repeatMs ?? 15 * 60000)) {
        s.lastAlert = n;
        this.d.push({ name: 'System', kind: 'SYSTEM', title: `${title} (still)`, text: `${text} It has lasted ${Math.round((n - s.at) / 60000)} minutes.` });
      }
    } else if (s) {
      this.since.delete(kind);
      this.d.push({ name: 'System', kind: 'SYSTEM', title: kind === 'token' ? 'Kite login is back' : 'Live feed is back', text: `Fixed after ${Math.max(1, Math.round((n - s.at) / 60000))} minutes.` });
    }
  }

  tick(): void {
    if (!this.d.active()) return;
    const n = this.now();
    const tokenBad = !this.d.tokenOk();
    this.problem('token', tokenBad, 'Kite login expired', 'No prices or candles can be read until you log in: open System and press "Log in to Kite".');
    if (tokenBad) return; // the feed cannot work without it; one problem is enough
    const f = this.d.feed();
    const quiet = this.d.quietMs ?? 120000;
    this.problem('feed', !f.connected || n - f.lastTickAt > quiet, 'Live feed is down', `No live prices for over ${Math.round(quiet / 60000)} minutes; the screens fall back to Kite reads and may look stale. It reconnects by itself; if it does not, check System.`);
  }
}
