import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { getDayOverrides, getSnapshot, setSnapshot } from './format';
import { useInflight } from './inflight';

interface RefreshState {
  /** increases on every refresh; cards fetch again when it changes */
  tick: number;
  /** when the data on screen was last asked for fresh (ms), null until the first refresh */
  lastAt: number | null;
  refreshing: boolean;
  /** every 5 minutes on its own (off by default, remembered) */
  auto: boolean;
  setAuto: (on: boolean) => void;
  refresh: () => Promise<void>;
  /** the snapshot end time typed in the top bar (applied by Refresh) and the one in force */
  snapDraft: string;
  setSnapDraft: (t: string) => void;
  snap: string;
}

const KEY = 'groot.autoLive';
const SNAP_KEY = 'groot.snapshot';
const Ctx = createContext<RefreshState>({ tick: 0, lastAt: null, refreshing: false, auto: false, setAuto: () => undefined, refresh: async () => undefined, snapDraft: '', setSnapDraft: () => undefined, snap: '' });

/** On-demand refresh: pressing Refresh clears the backend's per-slot copies (POST /refresh) and every card fetches again. Nothing polls unless Auto is on. */
export function RefreshProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [snapDraft, setSnapDraft] = useState<string>(() => {
    try {
      const t = localStorage.getItem(SNAP_KEY) || '';
      setSnapshot(t);
      return getSnapshot();
    } catch {
      return '';
    }
  });
  const [snap, setSnapApplied] = useState<string>(() => getSnapshot());
  const [auto, setAutoState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) !== '0';
    } catch {
      return false;
    }
  });
  const setAuto = useCallback((on: boolean) => {
    setAutoState(on);
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      /* private mode: the choice just is not remembered */
    }
  }, []);
  const snapDraftRef = useRef(snapDraft);
  snapDraftRef.current = snapDraft;
  const refresh = useCallback(async () => {
    setRefreshing(true);
    // the snapshot end time typed in the top bar takes effect with this refresh
    setSnapshot(snapDraftRef.current);
    setSnapApplied(getSnapshot());
    try {
      localStorage.setItem(SNAP_KEY, getSnapshot());
    } catch {
      /* not remembered */
    }
    try {
      await api('/refresh', { method: 'POST' });
    } catch {
      /* the cards still fetch again; they report their own errors */
    }
    setLastAt(Date.now());
    setTick((t) => t + 1);
    window.setTimeout(() => setRefreshing(false), 1200);
  }, []);
  // Auto: follow the server's pulse. While the market is open the server rebuilds the market read about once a minute from live ticks and raises a counter;
  // each time it goes up, every card fetches again (no cache clearing, nothing to wait for). Off when a snapshot time is set: nothing moves then.
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!auto || snap) { seen.current = null; return; }
    let live = true;
    const poll = (): void => {
      if (document.visibilityState !== 'visible') return;
      api<{ seq: number }>('/engine/pulse').then((r) => {
        if (!live) return;
        if (seen.current !== null && r.seq > seen.current) { setLastAt(Date.now()); setTick((t) => t + 1); }
        seen.current = r.seq;
      }).catch(() => undefined);
    };
    poll();
    const t = window.setInterval(poll, 10000);
    return () => { live = false; window.clearInterval(t); };
  }, [auto, snap]);
  const value = useMemo(() => ({ tick, lastAt, refreshing, auto, setAuto, refresh, snapDraft, setSnapDraft, snap }), [tick, lastAt, refreshing, auto, setAuto, refresh, snapDraft, snap]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useRefresh = (): RefreshState => useContext(Ctx);

/** Top bar: the snapshot end time, the Refresh button and the time of the last refresh. With Auto (Settings) on there is no button: it refreshes by itself. */
export function RefreshControls() {
  const { refresh, refreshing: pressed, lastAt, auto, snapDraft, setSnapDraft, snap } = useRefresh();
  // the button keeps spinning until every card has its answer, not just until the request was sent
  const loading = useInflight();
  const refreshing = pressed || loading > 0;
  const time = lastAt ? new Date(lastAt).toLocaleTimeString('en-IN', { hour12: false }) : null;
  const ov = getDayOverrides();
  // "replay" is for an earlier day or time. A Settings day equal to today is not a replay, but it will stay on that date tomorrow, so it is said plainly.
  const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
  const replay = Boolean(snap || (ov.nse && ov.nse !== today) || (ov.mcx && ov.mcx !== today));
  const pinned = !replay && Boolean(ov.nse || ov.mcx);
  const pending = snapDraft !== snap;
  const [snapOpen, setSnapOpen] = useState(false);
  return (
    <div className="refresh-controls">
      {replay && (
        <span className="pill warn replay-pill" title="You are looking at an earlier day or time, not the live market. Change it in Settings (days) or the time box (snapshot).">
          replay<span className="rp-detail">{ov.nse ? ` · NSE ${ov.nse}` : ''}{ov.mcx ? ` · MCX ${ov.mcx}` : ''}{snap ? ` · until ${snap}` : ''}</span>
        </span>
      )}
      {pinned && (
        <a className="pill replay-pill pinned-pill" href="#/settings" title="Settings has today's date typed in. It stays on this date tomorrow, so the app will not follow the new day: clear the current-day fields in Settings.">
          date pinned<span className="rp-detail"> · clear in Settings</span>
        </a>
      )}
      <button className={`icon-btn snap-toggle${snap || snapDraft ? ' on' : ''}`} onClick={() => setSnapOpen(!snapOpen)} aria-label="Snapshot time" aria-expanded={snapOpen} title="Snapshot end time">
        <span aria-hidden="true">◷</span>
      </button>
      <label className={`snap-box${snapOpen ? ' open' : ''}`} title="Snapshot end time: every screen stops at this time of the day (blank = live). It takes effect with Refresh.">
        <span className="muted">until</span>
        <input type="time" value={snapDraft} onChange={(e) => setSnapDraft(e.target.value)} aria-label="Snapshot end time" />
        {snapDraft && (
          <button className="link-btn" onClick={() => setSnapDraft('')} title="Back to live (then press Refresh)">
            clear
          </button>
        )}
      </label>
      {auto ? (
        pending && (
          <button className="pill refresh-btn" onClick={() => void refresh()} title="Apply the snapshot time now">
            Apply
          </button>
        )
      ) : (
        <button className="pill refresh-btn" onClick={() => void refresh()} disabled={refreshing} title="Recompute everything now (and apply the snapshot time)">
          <span className={refreshing ? 'spin' : ''} aria-hidden="true">⟳</span><span className="rb-text"> {refreshing ? (loading > 0 ? `Updating ${loading}…` : 'Refreshing…') : pending ? 'Refresh · apply time' : 'Refresh'}</span>
        </button>
      )}
      {auto && !pending && <span className="muted refresh-time" title="Auto: the screens follow the server, which recomputes about every minute while the market is open">auto · live</span>}
      {!auto && time && <span className="muted refresh-time">updated {time}</span>}
    </div>
  );
}

/** The Auto switch, on the System screen. */
export function AutoRefreshSetting() {
  const { auto, setAuto } = useRefresh();
  return (
    <div className="card">
      <div className="card-head">
        <h2>Refresh</h2>
      </div>
      <label className="auto-toggle" style={{ fontSize: '0.95rem' }}>
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Follow the live market automatically
      </label>
      <p className="small-note">On by default. Off: the numbers refresh only when you press Refresh in the top bar. While the market is open the server recomputes the market read about once a minute from live ticks, and every card fetches again each time it does (the Refresh button is hidden). Outside market hours or with a snapshot time set, nothing moves.</p>
    </div>
  );
}

/** Runs `fn` on mount, when `keys` change and on every Refresh press; on its own every 5 minutes only when Auto is on. */
export function useOnDemand(fn: () => void | Promise<void>, keys: unknown[] = []): void {
  const { tick, auto } = useRefresh();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    void ref.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...keys]);
  useEffect(() => {
    if (!auto) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void ref.current();
    }, 300000);
    return () => window.clearInterval(t);
  }, [auto]);
}
