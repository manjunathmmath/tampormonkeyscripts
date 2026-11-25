import { useEffect, useRef, useState } from 'react';
import { BASE, getSecret } from '../api';

/** One live price update from the backend stream. */
export interface LiveTick {
  token: number;
  ltp: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number | null;
  oi: number | null;
  ts: number;
}

export type LiveState = 'off' | 'connecting' | 'live' | 'reconnecting';

/** Parses server-sent-event text into events; returns the events and the unread remainder. */
export function parseSse(buffer: string): { events: { event: string; data: string }[]; rest: string } {
  const events: { event: string; data: string }[] = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  for (const block of parts) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (data.length) events.push({ event, data: data.join('\n') });
  }
  return { events, rest };
}

/**
 * Live ticks for a list of instrument tokens, from the backend's /stream. It is read with fetch (not EventSource) because the request needs the
 * bearer header. Reconnects with back-off, and pauses while the tab is hidden. Returns the latest tick per token and the connection state.
 */
export function useLiveTicks(tokens: number[], enabled = true): { ticks: Record<number, LiveTick>; state: LiveState } {
  const [ticks, setTicks] = useState<Record<number, LiveTick>>({});
  const [state, setState] = useState<LiveState>('off');
  const key = [...tokens].sort((a, b) => a - b).join(',');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!enabled || !key) {
      setState('off');
      return;
    }
    let ctl: AbortController | null = null;
    let timer: number | undefined;
    let delay = 1500;

    const connect = async (): Promise<void> => {
      if (!alive.current) return;
      if (document.visibilityState === 'hidden') {
        timer = window.setTimeout(connect, 2000);
        return;
      }
      ctl = new AbortController();
      setState((s) => (s === 'live' ? 'reconnecting' : 'connecting'));
      try {
        const res = await fetch(`${BASE}/stream?tokens=${key}`, { headers: { Authorization: `Bearer ${getSecret()}` }, signal: ctl.signal });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const { events, rest } = parseSse(buf);
          buf = rest;
          for (const ev of events) {
            if (ev.event === 'ready') {
              delay = 1500;
              setState('live');
            } else if (ev.event === 'ticks') {
              const batch = JSON.parse(ev.data) as LiveTick[];
              setTicks((prev) => {
                const next = { ...prev };
                for (const t of batch) next[t.token] = t;
                return next;
              });
            }
          }
        }
      } catch {
        /* dropped or refused: retry below */
      }
      if (!alive.current) return;
      setState('reconnecting');
      timer = window.setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30000);
    };
    void connect();

    // leaving the tab and coming back: restart at once instead of waiting for the back-off
    const vis = (): void => {
      if (document.visibilityState === 'visible' && alive.current) {
        ctl?.abort();
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      alive.current = false;
      if (timer) window.clearTimeout(timer);
      ctl?.abort();
      document.removeEventListener('visibilitychange', vis);
    };
  }, [key, enabled]);

  return { ticks, state };
}
