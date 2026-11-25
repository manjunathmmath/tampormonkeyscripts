import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, getSecret, setSecret, type Health } from './api';
import { Icon } from './components/Icon';
import { ChartView } from './pages/ChartView';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { setDayOverride, setHolidays, setMcxDayOverride, setMcxNames, setSession } from './lib/format';
import { Commodities } from './pages/Commodities';
import { Focus } from './pages/Focus';
import { Strikes } from './pages/Strikes';
import { Boards } from './pages/Boards';
import { Instrument } from './pages/Instrument';
import { TopTickers } from './components/TopTickers';
import { TopSignal } from './components/TopSignal';
import { Scanner } from './pages/Scanner';
import { Positional } from './pages/Positional';
import { Data } from './pages/Data';
import { ClockChip, StatusBar } from './components/StatusBar';
import { OiObv } from './pages/OiObv';
import { Watchlist } from './pages/Watchlist';
import { System } from './pages/System';
import { Help } from './pages/Help';
import { Learn } from './pages/Learn';
import { Engine } from './pages/Engine';
import { Expiries } from './pages/Expiries';
import { McxCalc } from './pages/McxCalc';
import { Heatmap } from './pages/Heatmap';
import { Positions } from './pages/Positions';
import { News } from './pages/News';
import { TradeShorts } from './pages/TradeShorts';
import { RefreshControls, RefreshProvider } from './lib/refresh';
import { SettingsWarnPill } from './components/SettingsWarnPill';
import { AlertBanner } from './components/AlertBanner';
import { ProgressStrip } from './components/ProgressStrip';
import { ErrorBoundary } from './components/ErrorBoundary';
import { usePoll, useOnline, useRoute, useTheme } from './lib/hooks';

function Login({ onDone, error }: { onDone: () => void; error: string | null }) {
  const [v, setV] = useState('');
  return (
    <main className="login">
      <div className="login-card card">
        <div className="brand-mark" aria-hidden="true">
          <Icon name="chart" size={26} />
        </div>
        <h1>Groot</h1>
        <p className="muted">Enter the app secret from the backend's <code>.env</code> file (<code>APP_SECRET</code>). It stays in this browser.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSecret(v.trim());
            onDone();
          }}
        >
          <label htmlFor="secret">App secret</label>
          <input id="secret" type="password" autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
          <button className="btn primary wide" type="submit" disabled={!v.trim()}>
            Continue
          </button>
        </form>
        {error && (
          <p className="banner err" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}

/** `main` items stay in the phone's bottom bar; the others live in the More sheet (all of them show in the side rail on wide screens) */
const KNOWN = ['dashboard', 'focus', 'strikes', 'boards', 'instrument', 'commodities', 'scanner', 'positional', 'watchlist', 'oiobv', 'data', 'chart', 'options', 'settings', 'system', 'help', 'shorts', 'learn', 'news', 'engine', 'expiries', 'mcxcalc', 'heatmap', 'positions'];
const NAV = [
  // across both markets: what you trade from, in the order you reach for it
  { page: 'dashboard', label: 'Dashboard', icon: 'dashboard', main: true, group: 'Trade' },
  { page: 'focus', label: 'Trade Focus', short: 'Focus', icon: 'focus', main: true, group: 'Trade' },
  { page: 'watchlist', label: 'Watchlist', short: 'Watch', icon: 'markets', main: true, group: 'Trade' },
  { page: 'chart', label: 'Chart View', short: 'Charts', icon: 'chart', main: true, group: 'Trade' },
  { page: 'positions', label: 'Positions', short: 'Positions', icon: 'table', main: false, group: 'Trade' },
  { page: 'news', label: 'News & events', short: 'News', icon: 'bell', main: false, group: 'Trade' },
  // the equity and index market
  { page: 'heatmap', label: 'Heatmap', icon: 'markets', main: false, group: 'NSE' },
  { page: 'positional', label: 'Positional', icon: 'table', main: false, group: 'NSE' },
  { page: 'scanner', label: '9:15 Scanner', icon: 'scanner', main: false, group: 'NSE' },
  { page: 'boards', label: 'Boards', icon: 'table', main: false, group: 'NSE' },
  { page: 'oiobv', label: 'OI / OBV', icon: 'options', main: false, group: 'NSE' },
  { page: 'strikes', label: 'Trade', icon: 'options', main: false, group: 'NSE' },
  { page: 'shorts', label: 'Trade Shorts', short: 'Shorts', icon: 'cards', main: false, group: 'NSE' },
  // commodities
  { page: 'commodities', label: 'Commodities', short: 'MCX', icon: 'commodity', main: false, group: 'MCX' },
  { page: 'mcxcalc', label: 'MCX calculator', short: 'MCX calc', icon: 'commodity', main: false, group: 'MCX' },
  // reading and help
  { page: 'learn', label: 'Learn & ideas', short: 'Learn', icon: 'book', main: false, group: 'Learning' },
  { page: 'help', label: 'Help', icon: 'info', main: false, group: 'Learning' },
  // set up and look after
  { page: 'settings', label: 'Settings', icon: 'sliders', main: false, group: 'Setup' },
  { page: 'data', label: 'Data', icon: 'table', main: false, group: 'Setup' },
  { page: 'expiries', label: 'Expiries', icon: 'clock', main: false, group: 'Setup' },
  { page: 'system', label: 'System', icon: 'system', main: false, group: 'Setup' },
  { page: 'engine', label: 'Data engine', short: 'Engine', icon: 'panel', main: false, group: 'Setup' },
] as const;
const groupStart = (i: number): boolean => i > 0 && NAV[i]!.group !== NAV[i - 1]!.group;

export function App() {
  const [authed, setAuthed] = useState(Boolean(getSecret()));
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [theme, setTheme, effective] = useTheme();
  const { page, arg, go } = useRoute();
  // the checklist now lives inside Trade Focus
  useEffect(() => {
    if (page === 'checklist') go('focus');
  }, [page, go]);
  const online = useOnline();
  const [more, setMore] = useState(false);
  // the side menu can shrink to icons only (desktop), which gives the screens the full width; the choice is remembered
  const [slim, setSlim] = useState<boolean>(() => {
    try {
      return localStorage.getItem('groot.navSlim') === '1';
    } catch {
      return false;
    }
  });
  const toggleSlim = (): void => {
    const next = !slim;
    setSlim(next);
    try {
      localStorage.setItem('groot.navSlim', next ? '1' : '0');
    } catch {
      /* not remembered */
    }
  };
  useEffect(() => setMore(false), [page, arg]);

  const loadHealth = useCallback(async () => {
    try {
      setHealth(await api<Health>('/health'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && e.message === 'unauthorized') {
        setAuthed(false);
        setAuthErr('That secret was not accepted.');
      } else setHealth(null);
    }
  }, []);
  usePoll(loadHealth, 20000, authed);
  // the Settings trading day is read before any screen asks for data, so the first fetch already uses it
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!authed) return;
    const val = (r: { groups: { fields: { key: string; value: unknown }[] }[] }, k: string): string | null => {
      const v = r.groups.flatMap((g) => g.fields).find((f) => f.key === k)?.value;
      return typeof v === 'string' && v ? v : null;
    };
    Promise.all([
      api<{ groups: { fields: { key: string; value: unknown }[] }[] }>('/settings')
        .then((r) => {
          setDayOverride(val(r, 'current_day_date'));
          setMcxDayOverride(val(r, 'mcx_current_day_date'));
        })
        .catch(() => undefined),
      api<{ names: string[] }>('/commodities')
        .then((r) => setMcxNames(r.names))
        .catch(() => undefined),
      api<{ nse: { day: string; ticking: boolean; source: string }; mcx: { day: string; ticking: boolean; source: string } }>('/session')
        .then((r) => setSession(r))
        .catch(() => undefined),
      api<{ dates?: { holidays: { date: string }[] } }>('/system')
        .then((r) => setHolidays((r.dates?.holidays ?? []).map((h) => h.date)))
        .catch(() => undefined),
    ]).finally(() => setReady(true));
  }, [authed]);

  // the server's data decides each market's day and whether it is trading: keep it current
  useEffect(() => {
    if (!authed) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') api<{ nse: { day: string; ticking: boolean; source: string }; mcx: { day: string; ticking: boolean; source: string } }>('/session').then((r) => setSession(r)).catch(() => undefined);
    }, 30000);
    return () => window.clearInterval(t);
  }, [authed]);

  if (!authed) return <Login error={authErr} onDone={() => { setAuthErr(null); setAuthed(true); }} />;

  const cycle = () => setTheme(theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system');
  const status = !health ? { cls: 'bad', text: 'Backend unreachable' } : health.status === 'ok' ? { cls: 'ok', text: 'Connected' } : { cls: 'warn', text: 'Needs attention' };
  const chartArg = arg ? arg.split('/') : [];

  return (
    <RefreshProvider>
    <div className={`app page-${page}${slim ? ' nav-slim' : ''}`}>
      <header className="topbar">
        <a className="brand" href="#/dashboard" aria-label="Groot home">
          <span className="brand-mark sm" aria-hidden="true">
            <Icon name="chart" size={18} />
          </span>
          <span className="brand-name">Groot</span>
        </a>
        <h1 className="top-title">{NAV.find((n) => n.page === page)?.label ?? (page === 'instrument' ? (arg ? decodeURIComponent(arg) : 'Index detail') : 'Groot')}</h1>
        <TopTickers />
        <TopSignal />
        <div className="top-right">
          <ClockChip />
          <RefreshControls />
          <SettingsWarnPill />
          <a href="#/system" className={`pill ${status.cls}`} title={health?.problems.join('; ') || 'Open the System screen'}>
            <i className="dot" />
            <span className="status-text">{status.text}</span>
          </a>
          {health && health.kite.token !== 'valid' && <span className="pill warn">Kite login needed</span>}
          <AlertBanner />
          <button className="icon-btn desk-only" onClick={cycle} aria-label={`Theme: ${theme}. Change theme`} title={`Theme: ${theme}`}>
            <Icon name={theme === 'system' ? 'auto' : effective === 'dark' ? 'moon' : 'sun'} size={18} />
          </button>
          <button className="icon-btn desk-only" onClick={() => { setSecret(''); setAuthed(false); }} aria-label="Sign out" title="Sign out">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </header>

      <nav className="nav" aria-label="Main">
        {NAV.flatMap((n, i) => [
          ...(i === 0 || groupStart(i) ? [<div key={`s-${n.group}`} className="nav-sec" aria-hidden="true">{n.group}</div>] : []),
          <a key={n.page} href={`#/${n.page}`} title={n.label} aria-label={n.label} className={`${page === n.page ? 'active' : ''}${n.main ? '' : ' secondary'}${groupStart(i) ? ' grp-start' : ''}`} aria-current={page === n.page ? 'page' : undefined}>
            <Icon name={n.icon} size={22} />
            <span>{'short' in n ? n.short : n.label}</span>
          </a>,
        ])}
        <button type="button" className="nav-fold" onClick={toggleSlim} title={slim ? 'Show the menu names' : 'Show icons only'} aria-label={slim ? 'Show the menu names' : 'Show icons only'}>
          <Icon name={slim ? 'right' : 'left'} size={18} />
        </button>
        <button className={`more-btn${NAV.some((n) => !n.main && n.page === page) ? ' active' : ''}`} onClick={() => setMore(true)} aria-label="More screens" aria-expanded={more}>
          <Icon name="more" size={22} />
          <span>More</span>
        </button>
      </nav>
      {more && createPortal(
        <div className="more-backdrop" onClick={() => setMore(false)}>
          <div className="more-sheet" role="dialog" aria-label="More screens" onClick={(e) => e.stopPropagation()}>
            <div className="more-grip" aria-hidden="true" />
            <div className="more-grid">
              {NAV.filter((n) => !n.main).flatMap((n, i, arr) => [
                ...(i === 0 || arr[i - 1]!.group !== n.group ? [<p key={`h-${n.group}`} className="more-h">{n.group}</p>] : []),
                <a key={n.page} href={`#/${n.page}`} className={page === n.page ? 'active' : ''}>
                  <Icon name={n.icon} size={24} />
                  <span>{n.label}</span>
                </a>,
              ])}
              <button onClick={cycle}><Icon name={theme === 'system' ? 'auto' : effective === 'dark' ? 'moon' : 'sun'} size={24} /><span>Theme: {theme}</span></button>
              <button onClick={() => { setSecret(''); setAuthed(false); }}><Icon name="logout" size={24} /><span>Sign out</span></button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <main className="main" id="main">
        <ProgressStrip />
        {health && health.kite.token !== 'valid' && (
          <p className="banner" role="status">
            Kite token is {health.kite.token}. Open <code>/auth/kite/start</code> on the backend, log in, then reload.
          </p>
        )}
        {!online && (
          <p className="banner err" role="status">
            You are offline. What you see may be out of date, and it will refresh when the connection returns.
          </p>
        )}
        {ready && <ErrorBoundary resetKey={page}>
          {page === 'dashboard' && <Dashboard />}
          {page === 'focus' && <Focus />}
          {page === 'strikes' && <Strikes />}
          {page === 'boards' && <Boards />}
          {page === 'instrument' && <Instrument name={arg ? decodeURIComponent(arg) : null} go={go} />}
          {page === 'commodities' && <Commodities />}
          {page === 'scanner' && <Scanner go={go} />}
          {page === 'positional' && <Positional go={go} />}
          {(page === 'chart' || page === 'options') && <ChartView name={chartArg[0] ?? null} day={chartArg[1] ?? null} go={go} dark={effective === 'dark'} />}
          {page === 'settings' && <Settings />}
          {page === 'system' && <System go={go} />}
          {page === 'data' && <Data />}
          {page === 'oiobv' && <OiObv />}
          {page === 'help' && <Help />}
          {page === 'learn' && <Learn />}
          {page === 'engine' && <Engine />}
          {page === 'expiries' && <Expiries />}
          {page === 'mcxcalc' && <McxCalc />}
          {page === 'heatmap' && <Heatmap />}
          {page === 'positions' && <Positions />}
          {page === 'news' && <News />}
          {page === 'shorts' && <TradeShorts />}
          {page === 'watchlist' && <Watchlist go={go} />}
          {!KNOWN.includes(page) && <Dashboard />}
        </ErrorBoundary>}
        <StatusBar />
      </main>
    </div>
    </RefreshProvider>
  );
}
