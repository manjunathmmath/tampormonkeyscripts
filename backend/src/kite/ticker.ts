import WebSocket from 'ws';
import type { Logger } from '../logger.js';
import { parseFrame, type Tick } from '../marketdata/ticks.js';

export type FeedState = 'stopped' | 'connecting' | 'connected' | 'reconnecting';
export type Mode = 'ltp' | 'quote' | 'full';

export interface SocketLike {
  on(ev: 'open' | 'close' | 'error' | 'message', fn: (...a: any[]) => void): unknown;
  send(data: string): void;
  close(): void;
  terminate?(): void;
}

export interface TickerDeps {
  apiKey: string;
  getAccessToken: () => string | undefined;
  logger: Logger;
  onTicks: (ticks: Tick[], now: number) => void;
  makeSocket?: (url: string) => SocketLike;
  now?: () => number;
  /** reconnect delays: starts at minDelayMs, doubles to maxDelayMs, resets after a successful connection */
  minDelayMs?: number;
  maxDelayMs?: number;
  /** a connected socket that delivers nothing for this long is dropped and reconnected */
  staleMs?: number;
}

/**
 * Kite WebSocket ticker. Subscriptions are remembered and sent again after every reconnect.
 * Reconnects with back-off; a watchdog drops a connection that has gone silent. Read-only feed.
 */
export class KiteTicker {
  state: FeedState = 'stopped';
  lastTickAt = 0;
  connectedAt = 0;
  reconnects = 0;
  private ws: SocketLike | null = null;
  private subs = new Map<number, Mode>();
  private delay: number;
  private timer: NodeJS.Timeout | null = null;
  private watchdog: NodeJS.Timeout | null = null;
  private wanted = false;
  private readonly now: () => number;
  private readonly minDelay: number;
  private readonly maxDelay: number;
  private readonly staleMs: number;

  constructor(private readonly d: TickerDeps) {
    this.now = d.now ?? Date.now;
    this.minDelay = d.minDelayMs ?? 2000;
    this.maxDelay = d.maxDelayMs ?? 60000;
    this.staleMs = d.staleMs ?? 50000;
    this.delay = this.minDelay;
  }

  get subscribedCount(): number {
    return this.subs.size;
  }

  start(): void {
    if (this.wanted) return;
    this.wanted = true;
    this.connect();
    this.watchdog = setInterval(() => this.checkStale(), 2000);
    this.watchdog.unref?.();
  }

  stop(): void {
    this.wanted = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.watchdog) clearInterval(this.watchdog);
    this.timer = this.watchdog = null;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.state = 'stopped';
  }

  /** Adds tokens (or changes their mode) and tells the exchange now if connected. */
  subscribe(tokens: number[], mode: Mode = 'full'): void {
    const fresh: number[] = [];
    for (const t of tokens) {
      if (!this.subs.has(t)) fresh.push(t);
      this.subs.set(t, mode);
    }
    if (this.state === 'connected') this.sendSubs(tokens, mode, fresh.length > 0);
  }

  unsubscribe(tokens: number[]): void {
    for (const t of tokens) this.subs.delete(t);
    if (this.state === 'connected') this.send({ a: 'unsubscribe', v: tokens });
  }

  private send(msg: unknown): void {
    try {
      this.ws?.send(JSON.stringify(msg));
    } catch (e) {
      this.d.logger.warn({ err: { message: (e as Error).message } }, 'ticker send failed');
    }
  }

  private sendSubs(tokens: number[], mode: Mode, subscribe: boolean): void {
    // 250 tokens per message keeps each frame small
    for (let i = 0; i < tokens.length; i += 250) {
      const chunk = tokens.slice(i, i + 250);
      if (subscribe) this.send({ a: 'subscribe', v: chunk });
      this.send({ a: 'mode', v: [mode, chunk] });
    }
  }

  private connect(): void {
    if (!this.wanted) return;
    const tok = this.d.getAccessToken();
    if (!tok || !this.d.apiKey) {
      this.d.logger.warn('ticker: no valid Kite token, will retry');
      this.scheduleReconnect();
      return;
    }
    this.state = this.reconnects ? 'reconnecting' : 'connecting';
    const url = `wss://ws.kite.trade?api_key=${encodeURIComponent(this.d.apiKey)}&access_token=${encodeURIComponent(tok)}`;
    const ws = this.d.makeSocket ? this.d.makeSocket(url) : (new WebSocket(url) as unknown as SocketLike);
    this.ws = ws;
    ws.on('open', () => {
      if (this.ws !== ws) return;
      this.state = 'connected';
      this.connectedAt = this.now();
      this.lastTickAt = this.now();
      this.delay = this.minDelay;
      this.d.logger.info({ subscribed: this.subs.size }, 'ticker connected');
      const byMode = new Map<Mode, number[]>();
      for (const [t, m] of this.subs) byMode.set(m, [...(byMode.get(m) ?? []), t]);
      for (const [m, list] of byMode) this.sendSubs(list, m, true);
    });
    ws.on('message', (data: unknown, isBinary?: boolean) => {
      if (this.ws !== ws) return;
      this.lastTickAt = this.now();
      if (isBinary === false || typeof data === 'string') return; // text frames: errors / order postbacks, not market data
      const buf = data as Buffer | ArrayBuffer;
      const u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      const ticks = parseFrame(u8);
      if (ticks.length) this.d.onTicks(ticks, this.now());
    });
    ws.on('error', (e: Error) => this.d.logger.warn({ err: { message: e?.message } }, 'ticker error'));
    ws.on('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (!this.wanted) return;
    this.state = 'reconnecting';
    this.reconnects++;
    const wait = this.delay;
    this.delay = Math.min(this.delay * 2, this.maxDelay);
    this.d.logger.info({ inMs: wait }, 'ticker reconnecting');
    this.timer = setTimeout(() => this.connect(), wait);
    this.timer.unref?.();
  }

  private checkStale(): void {
    if (this.state !== 'connected' || !this.ws) return;
    if (this.now() - this.lastTickAt > this.staleMs) {
      this.d.logger.warn('ticker silent too long, reconnecting');
      const ws = this.ws;
      this.ws = null;
      try {
        (ws.terminate ?? ws.close).call(ws);
      } catch {
        /* ignore */
      }
      this.scheduleReconnect();
    }
  }
}
