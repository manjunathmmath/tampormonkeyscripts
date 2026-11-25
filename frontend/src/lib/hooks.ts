import { useCallback, useEffect, useRef, useState } from 'react';

/** Runs `fn` now and then every `ms` while the tab is visible and `enabled`. */
export function usePoll(fn: () => void | Promise<void>, ms: number, enabled = true): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let t: number | undefined;
    const tick = async () => {
      if (stop) return;
      if (document.visibilityState === 'visible') {
        try {
          await ref.current();
        } catch {
          /* the caller reports its own errors */
        }
      }
      if (!stop) t = window.setTimeout(tick, ms);
    };
    void tick();
    const vis = () => document.visibilityState === 'visible' && void ref.current();
    document.addEventListener('visibilitychange', vis);
    return () => {
      stop = true;
      if (t) window.clearTimeout(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [ms, enabled]);
}

export type ThemeChoice = 'system' | 'dark' | 'light';
const KEY = 'groot.theme';
export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void, 'dark' | 'light'] {
  const read = (): ThemeChoice => {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'dark' || v === 'light' ? v : 'system';
    } catch {
      return 'system';
    }
  };
  const [choice, setChoice] = useState<ThemeChoice>(read);
  const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [sysDark, setSysDark] = useState(mq?.matches ?? true);
  useEffect(() => {
    if (!mq) return;
    const f = () => setSysDark(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [mq]);
  const effective: 'dark' | 'light' = choice === 'system' ? (sysDark ? 'dark' : 'light') : choice;
  useEffect(() => {
    document.documentElement.dataset.theme = effective;
    document.documentElement.style.colorScheme = effective;
    const m = document.querySelector('meta[name="theme-color"]');
    m?.setAttribute('content', effective === 'dark' ? '#0b0e14' : '#f3f5f9');
  }, [effective]);
  const set = useCallback((t: ThemeChoice) => {
    setChoice(t);
    try {
      if (t === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      /* storage blocked */
    }
  }, []);
  return [choice, set, effective];
}

/** Tiny hash router: "#/dashboard", "#/scanner", "#/chart/NIFTY%2050". */
export function useRoute(): { page: string; arg: string | null; go: (path: string) => void } {
  const parse = () => {
    const h = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
    const [page = 'dashboard', ...rest] = h.split('/');
    return { page: page || 'dashboard', arg: rest.length ? rest.join('/') : null };
  };
  const [r, setR] = useState(parse);
  useEffect(() => {
    const f = () => setR(parse());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const go = useCallback((path: string) => {
    window.location.hash = '#/' + path.replace(/^\/+/, '');
  }, []);
  return { ...r, go };
}

/** True while the browser reports a network connection. */
export function useOnline(): boolean {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
}
