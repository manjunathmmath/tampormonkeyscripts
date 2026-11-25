import { useEffect, useMemo, useState } from 'react';
import { api, type ScanState } from '../api';
import { dayFor, getSnapshot, signed, tone } from '../lib/format';
import { Loading, useLive } from './DashboardPanels';
import { IconButton } from '../components/IconButton';
import { TrackBell } from '../components/TrackBell';

export interface PRow {
  name: string;
  verdict: string;
  convictionPct: number | null;
  ltp: number;
  entry: number | null;
  stop: number | null;
  target: number | null;
  riskReward: number | null;
  tradeable: boolean;
  pctChg20: number;
  trendLabel: string;
  breakoutLabel: string;
  relStrength: number;
  oiLabel: string;
  curveLabel: string;
  overlayTotal: number;
  primary: { label: string; dir?: number } | null;
  since: { label: string; days: number; favPct: number | null; advice: string; atLeast?: boolean } | null;
  extensionNote?: string;
  exitCriteria?: string;
}
export interface PState {
  state?: string;
  day?: string;
  running: boolean;
  total: number;
  done: number;
  current: string | null;
  error: string | null;
  rows: PRow[];
  market: { buy: number; sell: number; watch: number; scanned: number; net?: number; label: string };
}

type Scope = 'dashboard' | 'all' | 'nifty50' | 'banknifty' | 'mcx' | 'ASO' | 'BSO' | 'Z915';
const SCOPES: { id: Scope; label: string; tip: string }[] = [
  { id: 'all', label: 'ALL F&O', tip: 'Every F&O stock, the two indices and the MCX names (minutes)' },
  { id: 'ASO', label: 'ASO', tip: 'Names whose 9:15 candle closed in the ASO zone' },
  { id: 'BSO', label: 'BSO', tip: 'Names whose 9:15 candle closed in the BSO zone' },
  { id: 'Z915', label: '9:15', tip: 'Every name that closed outside the B/W zone at 9:15 (AST, ASO, BSO, BST)' },
  { id: 'nifty50', label: 'NIFTY 50', tip: 'The index and its 50 stocks' },
  { id: 'banknifty', label: 'BANK NIFTY', tip: 'The index and its stocks' },
  { id: 'dashboard', label: 'WEIGHTED', tip: 'The two indices and the live top-10 stocks of each' },
  { id: 'mcx', label: 'INDEX + MCX', tip: 'The two indices and the commodities' },
];

const GROUPS: { label: string; tabs: { id: string; label: string; match: (v: string) => boolean; tone: string }[] }[] = [
  { label: 'ALL', tabs: [{ id: 'ALL', label: 'ALL', match: () => true, tone: '' }] },
  {
    label: 'BULLISH',
    tabs: [
      { id: 'STRONG BUY', label: 'STRONG BUY', match: (v) => v.includes('STRONG BUY'), tone: 'up' },
      { id: 'BUY', label: 'BUY (ANY)', match: (v) => v.includes('BUY'), tone: 'up' },
    ],
  },
  {
    label: 'BEARISH',
    tabs: [
      { id: 'STRONG SELL', label: 'STRONG SELL', match: (v) => v.includes('STRONG SELL'), tone: 'dn' },
      { id: 'SELL', label: 'SELL (ANY)', match: (v) => v.includes('SELL'), tone: 'dn' },
    ],
  },
  {
    label: 'STAGE',
    tabs: [
      { id: 'LONGF', label: 'LONG forming', match: (v) => v.includes('LONG forming'), tone: 'up' },
      { id: 'SHORTF', label: 'SHORT forming', match: (v) => v.includes('SHORT forming'), tone: 'dn' },
      { id: 'BASING', label: 'BASING', match: (v) => v.includes('Basing'), tone: 'warn' },
      { id: 'TOPPING', label: 'TOPPING', match: (v) => v.includes('Topping'), tone: 'warn' },
    ],
  },
  { label: 'WATCH', tabs: [{ id: 'WATCH', label: 'WATCH', match: (v) => v.startsWith('WATCH'), tone: 'warn' }] },
];
const ALL_TABS = GROUPS.flatMap((g) => g.tabs);
const txt = (t: string): string => t.replace(/&times;/g, '×').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const verdictTone = (v: string): string => (v.includes('BUY') || v.includes('LONG') ? 'up' : v.includes('SELL') || v.includes('SHORT') ? 'dn' : 'flat');
const timingOf = (r: PRow): string => r.since?.label?.split(' ')[0]?.toUpperCase() ?? 'NO READ';
const TIMING_ORDER = ['EARLY', 'MID', 'LATE', 'NOT', 'NO READ'];
const TIMING_NOTE: Record<string, string> = {
  EARLY: 'under 2.5 ATR travelled: best time to look at the plan',
  MID: '2.5 to 6 ATR travelled: take it at the plan entry, not above it',
  LATE: '6 ATR or more travelled (or stretched from the 50-day line): wait for a pullback',
  NOT: 'price is behind where the view started: the view is not working',
  'NO READ': 'no view yet',
};
const SORTS: Record<string, (a: PRow, b: PRow) => number> = {
  Conviction: (a, b) => (b.convictionPct ?? -1) - (a.convictionPct ?? -1),
  Name: (a, b) => a.name.localeCompare(b.name),
  'R:R': (a, b) => (b.riskReward ?? -1) - (a.riskReward ?? -1),
  '20D move': (a, b) => Math.abs(b.pctChg20) - Math.abs(a.pctChg20),
};

const KEY = 'groot.pos';
const read = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(`${KEY}.${k}`);
    return v == null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
};
const save = (k: string, v: unknown): void => {
  try {
    localStorage.setItem(`${KEY}.${k}`, JSON.stringify(v));
  } catch {
    /* kept for this visit only */
  }
};

/** The full swing screener, as in the userscript: choose what to scan, filter by verdict, group by timing, scan one name again. */
export function Positional({ go }: { go: (p: string) => void }) {
  const [fast, setFast] = useState(false);
  const { data: s, err } = useLive<PState>('/positional', 3000, fast);
  useEffect(() => setFast(!!s && !s.state && s.running), [s]);
  const { data: zones } = useLive<ScanState>(`/scan915?day=${dayFor('NIFTY 50')}`, 60000);
  const [scope, setScope] = useState<Scope>(() => read<Scope>('scope', 'dashboard'));
  const [tab, setTab] = useState<string>(() => read('tab', 'ALL'));
  const [minConv, setMinConv] = useState<number>(() => read('min', 0));
  const [q, setQ] = useState('');
  const [grp, setGrp] = useState<boolean>(() => read('grp', true));
  const [only, setOnly] = useState(false);
  const [sort, setSort] = useState<string>(() => read('sort', 'Conviction'));
  const [busy, setBusy] = useState<string | null>(null);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const m = window.matchMedia('(max-width: 760px)');
    const f = (): void => setNarrow(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  useEffect(() => save('scope', scope), [scope]);
  useEffect(() => save('tab', tab), [tab]);
  useEffect(() => save('min', minConv), [minConv]);
  useEffect(() => save('grp', grp), [grp]);
  useEffect(() => save('sort', sort), [sort]);

  const scanned = !!s && !s.state;
  const running = scanned && s.running;
  const zoneNames = (zs: string[]): string[] => Object.entries(zones?.items ?? {}).filter(([, v]) => zs.includes(v.zone)).map(([n]) => n);
  const scopeNames = (sc: Scope): string[] | null => (sc === 'ASO' ? zoneNames(['ASO']) : sc === 'BSO' ? zoneNames(['BSO']) : sc === 'Z915' ? zoneNames(['AST', 'ASO', 'BSO', 'BST']) : null);

  const start = async (names: string[] | null, scp: Scope | null, label: string, fresh: boolean): Promise<void> => {
    setBusy(label);
    setMsg(null);
    try {
      const snap = getSnapshot();
      const body = { ...(names ? { names, fresh } : { scope: scp ?? 'dashboard', fresh }), ...(snap ? { asOf: snap } : {}) };
      await api('/positional/scan', { method: 'POST', body });
      setFast(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const scanScope = (): Promise<void> => {
    const names = scopeNames(scope);
    if (names && !names.length) {
      setMsg('No names in that 9:15 zone yet (the 9:15 scan has not run, or none closed there).');
      return Promise.resolve();
    }
    return start(names, names ? null : scope, 'scope', false);
  };
  const stop = (): Promise<unknown> => api('/positional/stop', { method: 'POST', body: {} }).catch(() => undefined);

  const rowsAll = scanned ? s.rows : [];
  const tabMatch = ALL_TABS.find((t) => t.id === tab)?.match ?? (() => true);
  const needle = q.trim().toLowerCase();
  // counts follow every filter except the verdict tab, so a tab's count is what it will show
  const base = useMemo(() => rowsAll.filter((r) => (r.convictionPct ?? 0) >= minConv && (!needle || r.name.toLowerCase().includes(needle)) && (!only || r.tradeable)), [rowsAll, minConv, needle, only]);
  const shown = useMemo(() => base.filter((r) => tabMatch(r.verdict)).sort(SORTS[sort] ?? SORTS.Conviction!), [base, tab, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = (m: (v: string) => boolean): number => base.filter((r) => m(r.verdict)).length;
  const topBuy = rowsAll.filter((r) => r.tradeable && verdictTone(r.verdict) === 'up').sort(SORTS.Conviction!).slice(0, 6);
  const topSell = rowsAll.filter((r) => r.tradeable && verdictTone(r.verdict) === 'dn').sort(SORTS.Conviction!).slice(0, 6);
  const groups = useMemo(() => {
    if (!grp) return [{ key: '', rows: shown }];
    return TIMING_ORDER.map((k) => ({ key: k, rows: shown.filter((r) => timingOf(r) === k) })).filter((g) => g.rows.length);
  }, [grp, shown]);

  const row = (r: PRow) => (
    <>
      <tr key={r.name} className={`prow ${verdictTone(r.verdict)} ${open === r.name ? 'open' : ''}`}>
        <td className="pname">
          <button className="chev" aria-label={`Details of ${r.name}`} aria-expanded={open === r.name} onClick={() => setOpen(open === r.name ? null : r.name)}>{open === r.name ? '⌄' : '›'}</button>
          <b>{r.name}</b>
          <span className="rowtools">
            <button className="icon-btn" title={`Scan ${r.name} again`} disabled={!!busy || running} onClick={() => void start([r.name], null, r.name, false)}>{busy === r.name ? '…' : '↻'}</button>
            <TrackBell name={r.name} />
            <button className="icon-btn" title={`Open ${r.name} in the Chart View`} onClick={() => go(`chart/${encodeURIComponent(r.name)}/${dayFor(r.name)}`)}>▤</button>
          </span>
        </td>
        <td><span className={`vchip ${verdictTone(r.verdict)}`}>{r.verdict}</span></td>
        <td className="num"><b>{r.convictionPct ?? '—'}</b>{r.convictionPct != null && '%'}</td>
        <td className="num">{r.ltp.toFixed(1)}</td>
        <td title={r.primary?.label}>{r.trendLabel}</td>
        <td className={`num ${tone(r.pctChg20)}`}>{signed(r.pctChg20, 1)}%</td>
        <td>{r.breakoutLabel}</td>
        <td className={`num ${tone(r.relStrength)}`}>{signed(r.relStrength, 1)}%</td>
        <td>{r.oiLabel}</td>
        <td>{r.curveLabel}</td>
        <td className={`num ${tone(r.overlayTotal)}`}>{r.overlayTotal.toFixed(1)}</td>
        <td className={tone(r.since?.favPct ?? 0)}>{r.since ? `${r.since.atLeast ? '≥' : ''}${r.since.days}d · ${signed(r.since.favPct ?? 0, 1)}% · ${timingOf(r)}` : '—'}</td>
        <td className="num">
          {r.entry != null ? r.entry.toFixed(1) : '—'}
          {r.entry != null && Math.abs(r.entry / r.ltp - 1) >= 0.005 && <small className="muted block">wait for {r.entry < r.ltp ? 'pullback' : 'bounce'} ({signed((r.entry / r.ltp - 1) * 100, 1)}%)</small>}
        </td>
        <td className="num">{r.target?.toFixed(1) ?? '—'}</td>
        <td className="num">{r.stop?.toFixed(1) ?? '—'}</td>
        <td className="num">{r.riskReward?.toFixed(1) ?? '—'}</td>
      </tr>
      {open === r.name && (
        <tr className="pdetail">
          <td colSpan={16}>
            <p><b>View:</b> {r.primary?.label ?? '—'}</p>
            {r.since && <p><b>Timing:</b> {txt(r.since.advice)}</p>}
            {r.extensionNote && <p><b>Stretch:</b> {txt(r.extensionNote)}</p>}
            {r.exitCriteria && <p><b>Exit:</b> {txt(r.exitCriteria)}</p>}
          </td>
        </tr>
      )}
    </>
  );

  const card = (r: PRow) => (
    <article key={r.name} className={`pcard ${verdictTone(r.verdict)}`}>
      <div className="pc-top">
        <b className="pc-name">{r.name}</b>
        <span className={`vchip ${verdictTone(r.verdict)}`}>{r.verdict.replace(/\(.*\)/, '').trim()}</span>
        <span className="pc-conv num">{r.convictionPct ?? '—'}{r.convictionPct != null && '%'}</span>
      </div>
      <div className="pc-meta num">
        <span>{r.ltp.toFixed(1)}</span>
        <span className={tone(r.pctChg20)}>20D {signed(r.pctChg20, 1)}%</span>
        <span className={tone(r.since?.favPct ?? 0)}>{r.since ? `${r.since.days}d · ${timingOf(r)}` : 'no read'}</span>
      </div>
      <div className="pc-plan num">
        <span><small>Entry</small>{r.entry != null ? r.entry.toFixed(1) : '—'}</span>
        <span><small>Target</small>{r.target?.toFixed(1) ?? '—'}</span>
        <span><small>Stop</small>{r.stop?.toFixed(1) ?? '—'}</span>
        <span><small>R:R</small>{r.riskReward?.toFixed(1) ?? '—'}</span>
      </div>
      {r.entry != null && Math.abs(r.entry / r.ltp - 1) >= 0.005 && <p className="pc-wait">wait for {r.entry < r.ltp ? 'a pullback' : 'a bounce'} to {r.entry.toFixed(1)} ({signed((r.entry / r.ltp - 1) * 100, 1)}%)</p>}
      <div className="pc-actions">
        <IconButton icon={open === r.name ? 'up' : 'down'} label={open === r.name ? 'Less detail' : 'More detail'} on={open === r.name} onClick={() => setOpen(open === r.name ? null : r.name)} />
        <IconButton icon="refresh" label={`Scan ${r.name} again`} disabled={!!busy || running} onClick={() => void start([r.name], null, r.name, false)} />
        <IconButton icon="chart" label={`Open ${r.name} in the Chart View`} onClick={() => go(`chart/${encodeURIComponent(r.name)}/${dayFor(r.name)}`)} />
        <TrackBell name={r.name} />
      </div>
      {open === r.name && (
        <dl className="pc-more">
          <dt>Trend</dt><dd>{r.trendLabel}</dd>
          <dt>Breakout</dt><dd>{r.breakoutLabel}</dd>
          <dt>Rel. strength</dt><dd className={tone(r.relStrength)}>{signed(r.relStrength, 1)}%</dd>
          <dt>Futures OI</dt><dd>{r.oiLabel}</dd>
          <dt>Curve</dt><dd>{r.curveLabel}</dd>
          <dt>Overlay</dt><dd>{r.overlayTotal.toFixed(1)}</dd>
          {r.primary && <><dt>View</dt><dd>{txt(r.primary.label)}</dd></>}
          {r.since && <><dt>Timing</dt><dd>{txt(r.since.advice)}</dd></>}
          {r.extensionNote && <><dt>Stretch</dt><dd>{txt(r.extensionNote)}</dd></>}
          {r.exitCriteria && <><dt>Exit</dt><dd>{txt(r.exitCriteria)}</dd></>}
        </dl>
      )}
    </article>
  );

  return (
    <div className="page positional-page">
      <header className="page-head">
        <div>
          <h1>Positional screener</h1>
          <p className="sub">Swing view on daily candles{s && !s.state && s.day ? ` · data as of ${s.day}` : ''}</p>
        </div>
      </header>

      <section className="card pos-controls">
        <div className="pos-scope" role="group" aria-label="What to scan">
          {SCOPES.map((o) => (
            <button key={o.id} className={`chip ${scope === o.id ? 'on' : ''}`} title={o.tip} onClick={() => setScope(o.id)}>{o.label}</button>
          ))}
          <button className="btn primary" disabled={!!busy || running} onClick={() => void scanScope()}>▸ Scan {SCOPES.find((x) => x.id === scope)?.label}</button>
          {running && <IconButton icon="stop" label="Stop the scan" tone="dn" onClick={() => void stop()} />}
          {scanned && s.rows.length > 0 && <IconButton icon="refresh" label={`Re-scan the ${s.rows.length} names shown`} disabled={!!busy || running} onClick={() => void start(s.rows.map((r) => r.name), null, 'rescan', true)} />}
        </div>
        {running && (
          <div className="pos-prog" role="status">
            <div className="bar"><i style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }} /></div>
            <span className="small-note">Scanning {s.done} of {s.total}{s.current ? ` — ${s.current}` : ''}.</span>
          </div>
        )}
        {(msg || (scanned && s.error)) && <p className="small-note warn-note">{msg ?? s?.error}</p>}
      </section>

      {!s ? (
        <Loading what="the screener" err={err} />
      ) : !scanned ? (
        <p className="muted">Not scanned yet. Pick what to scan above and press Scan.</p>
      ) : (
        <>
          <div className="pos-tabs" role="tablist" aria-label="Verdict">
            {GROUPS.map((g) => (
              <div key={g.label} className="pos-tabgrp">
                {g.label !== 'ALL' && <span className="pos-tabgrp-l">{g.label}</span>}
                {g.tabs.map((t) => (
                  <button key={t.id} role="tab" aria-selected={tab === t.id} className={`ptab ${t.tone} ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
                    {t.label} <small>{counts(t.match)}</small>
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="pos-filters">
            <span className="small-note"><b>Market:</b> {s.market.label} · {s.market.buy} buy · {s.market.sell} sell · {s.market.watch} watch ({s.market.scanned} scanned)</span>
            <label className="field-inline">Min conv % <input type="number" min={0} max={100} value={minConv} onChange={(e) => setMinConv(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} /></label>
            <input type="search" placeholder="Search results…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the results" />
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">{Object.keys(SORTS).map((k) => <option key={k}>{k}</option>)}</select>
            <button className={`chip ${only ? 'on' : ''}`} onClick={() => setOnly(!only)}>Tradeable</button>
            <label className="field-inline"><input type="checkbox" checked={grp} onChange={(e) => setGrp(e.target.checked)} /> Group by timing</label>
          </div>

          {(topBuy.length > 0 || topSell.length > 0) && (
            <div className="pos-top">
              {topBuy.length > 0 && <><span className="pos-top-l up">TOP BUY</span>{topBuy.map((r) => <button key={r.name} className="chip up" onClick={() => { setQ(r.name); setOpen(r.name); }}>{r.name} <b>{signed(r.overlayTotal, 1)}</b></button>)}</>}
              {topSell.length > 0 && <><span className="pos-top-l dn">TOP SELL</span>{topSell.map((r) => <button key={r.name} className="chip dn" onClick={() => { setQ(r.name); setOpen(r.name); }}>{r.name} <b>{signed(r.overlayTotal, 1)}</b></button>)}</>}
            </div>
          )}

          <div className="small-note pos-timing">
            Timing of the {shown.length} shown:{' '}
            {TIMING_ORDER.map((k) => ({ k, n: shown.filter((r) => timingOf(r) === k).length })).filter((x) => x.n).map((x) => <span key={x.k} className="pos-tcount">{x.k} <b>{x.n}</b></span>)}
          </div>

          {narrow ? (
            <div className="pos-cards">
              {groups.map((g) => (
                <div key={g.key || 'all'}>
                  {g.key && (
                    <button className="pc-group" onClick={() => setFolded({ ...folded, [g.key]: !folded[g.key] })} aria-expanded={!folded[g.key]}>
                      <b>{g.key}</b> {g.rows.length} · {TIMING_NOTE[g.key]} <span>{folded[g.key] ? '▸' : '▾'}</span>
                    </button>
                  )}
                  {!folded[g.key] && g.rows.map(card)}
                </div>
              ))}
              {!shown.length && <p className="muted">{rowsAll.length ? 'Nothing matches these filters.' : 'No rows yet.'}</p>}
            </div>
          ) : (
          <div className="tablewrap pos-table">
            <table className="tbl">
              <thead>
                <tr><th>Symbol</th><th>Verdict</th><th>Conv.</th><th>LTP</th><th>Trend / stage</th><th>20D</th><th>Breakout</th><th>Rel. strength</th><th>Futures OI</th><th>Curve</th><th>Overlay</th><th>View since · timing</th><th>Entry</th><th>Target</th><th>Stop</th><th>R:R</th></tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <GroupRows key={g.key || 'all'} g={g} folded={!!folded[g.key]} toggle={() => setFolded({ ...folded, [g.key]: !folded[g.key] })} total={shown.length} render={row} />
                ))}
                {!shown.length && <tr><td colSpan={16} className="muted">{rowsAll.length ? 'Nothing matches these filters.' : 'No rows yet.'}</td></tr>}
              </tbody>
            </table>
          </div>
          )}
          <p className="small-note">Conviction counts how many of the scanner's own checks line up (Minervini, Weinstein, Clenow rules with ATR stops). It is not a back-tested probability, and a slow multi-week view is not a same-day signal.</p>
        </>
      )}
    </div>
  );
}

function GroupRows({ g, folded, toggle, total, render }: { g: { key: string; rows: PRow[] }; folded: boolean; toggle: () => void; total: number; render: (r: PRow) => React.ReactNode }) {
  return (
    <>
      {g.key && (
        <tr className="pgroup-row" onClick={toggle}>
          <td colSpan={16}>
            <b>{g.key}</b> {g.rows.length} {g.rows.length === 1 ? 'stock' : 'stocks'} ({Math.round((g.rows.length / Math.max(1, total)) * 100)}% of shown) — {TIMING_NOTE[g.key]} <span className="muted">{folded ? '(folded)' : ''}</span>
          </td>
        </tr>
      )}
      {!folded && g.rows.map((r) => render(r))}
    </>
  );
}
