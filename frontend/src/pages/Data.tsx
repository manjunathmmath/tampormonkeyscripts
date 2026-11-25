import { IconButton } from '../components/IconButton';
import { Info } from '../components/Info';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { nfi } from '../lib/format';
import { Loading, useLive } from './DashboardPanels';

interface Inv {
  id: string;
  label: string;
  note: string;
  files: number;
  bytes: number;
}
interface Info {
  dataDir: string | null;
  inventory: Inv[];
  instruments: { count: number; day: string | null };
  steps: { count: number; source: string | null };
  weights: { asOf: string | null; error: string | null; nifty50: number; bank: number } | null;
}
interface InstRow { symbol: string; name: string; exchange: string; type: string; expiry: string; strike: number; lot: number; token: number }

const TABS = [['cache', 'Saved data'], ['instruments', 'Instruments'], ['steps', 'Strike steps'], ['weights', 'Index weights'], ['macro', 'India 10Y']] as const;
type Tab = (typeof TABS)[number][0];
const mb = (b: number): string => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(0, Math.round(b / 1024))} KB`);

function useSearch<T>(path: string, q: string): { data: T | null; err: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      api<T>(`${path}?q=${encodeURIComponent(q)}`).then((d) => { setData(d); setErr(null); }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [path, q]);
  return { data, err };
}

function Cache({ info, reload }: { info: Info; reload: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const clear = async (g: Inv): Promise<void> => {
    if (!window.confirm(`Clear "${g.label}" (${g.files} files, ${mb(g.bytes)})?\n\n${g.note}`)) return;
    setBusy(g.id);
    setMsg(null);
    try {
      const r = await api<{ ok: boolean; removed?: number; error?: string }>('/data/clear', { method: 'POST', body: { what: g.id } });
      setMsg(r.ok ? `${g.label}: ${r.removed} files removed.` : `${g.label}: ${r.error}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      reload();
    }
  };
  return (
    <div className="data-grid">
      {info.inventory.map((g) => (
        <section key={g.id} className="card">
          <div className="card-head"><h2>{g.label}</h2><span className="muted">{g.files} files · {mb(g.bytes)}</span></div>
          <p className="small-note">{g.note}</p>
          <div className="card-actions"><IconButton icon="trash" label={busy === g.id ? 'Clearing…' : `Clear ${g.label}`} disabled={!!busy || !g.files} onClick={() => void clear(g)} /></div>
        </section>
      ))}
      <p className="small-note data-note">Never cleared from here: Settings, pins, the Kite login, saved holidays and the macro history. {info.dataDir ? `Folder: ${info.dataDir}` : ''}</p>
      {msg && <p className="banner ok" role="status">{msg}</p>}
    </div>
  );
}

function Instruments() {
  const [q, setQ] = useState('');
  const { data, err } = useSearch<{ total: number; rows: InstRow[] }>('/data/instruments', q);
  return (
    <section className="card">
      <input type="search" placeholder="Search symbol or name, e.g. NIFTY, GOLDM, RELIANCE" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search instruments" />
      {!data ? <Loading what="the instruments" err={err} /> : (
        <>
          <div className="tablewrap"><table className="tbl"><thead><tr><th>Symbol</th><th>Name</th><th>Exch</th><th>Type</th><th>Expiry</th><th>Strike</th><th>Lot</th><th>Token</th></tr></thead>
            <tbody>{data.rows.map((r) => <tr key={r.token}><td><b>{r.symbol}</b></td><td>{r.name}</td><td>{r.exchange}</td><td>{r.type}</td><td>{r.expiry || '—'}</td><td className="num">{r.strike || '—'}</td><td className="num">{r.lot}</td><td className="num">{r.token}</td></tr>)}</tbody></table></div>
          <p className="small-note">Showing {data.rows.length} of {nfi(data.total)} matches. Narrow the search to see more.</p>
        </>
      )}
    </section>
  );
}

function Steps() {
  const [q, setQ] = useState('');
  const { data, err } = useSearch<{ source: string | null; total: number; rows: { name: string; steps: unknown }[] }>('/data/steps', q);
  return (
    <section className="card">
      <input type="search" placeholder="Search a name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search strike steps" />
      {!data ? <Loading what="the strike steps" err={err} /> : (
        <>
          <p className="small-note">{data.total} names · source: {data.source ?? 'none loaded (names without a step use 100 / 100)'}</p>
          <div className="tablewrap"><table className="tbl"><thead><tr><th>Name</th><th>Strike interval(s)</th></tr></thead>
            <tbody>{data.rows.map((r) => <tr key={r.name}><td><b>{r.name}</b></td><td className="num">{Array.isArray(r.steps) ? r.steps.join(' / ') : typeof r.steps === 'string' ? r.steps.replace(',', ' / ') : JSON.stringify(r.steps)}</td></tr>)}</tbody></table></div>
        </>
      )}
    </section>
  );
}

function Weights({ info, reload }: { info: Info; reload: () => void }) {
  const { data, err } = useLive<{ asOf: string | null; error: string | null; nifty50: string[]; bank: string[]; full: Record<string, Record<string, number>> } | null>('/data/weights', 600000);
  const [busy, setBusy] = useState(false);
  const w = info.weights;
  return (
    <section className="card">
      <div className="card-head"><h2>NIFTY 50 and BANK NIFTY constituents</h2><Info k="NIFTY 50 and BANK NIFTY constituents" /><span className="muted">data of {w?.asOf ?? '—'}</span></div>
      {w?.error && <p className="small-note warn-note">The last download failed ({w.error}); the saved copy is used.</p>}
      <div className="card-actions"><button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await api('/data/clear', { method: 'POST', body: { what: 'weights' } }); } finally { setBusy(false); reload(); } }}>{busy ? 'Downloading…' : 'Download again from niftyindices.com'}</button></div>
      {!data ? <Loading what="the weights" err={err} /> : (
        <div className="data-grid">
          {(['NIFTY 50', 'NIFTY BANK'] as const).map((ix) => {
            const m = data.full[ix] ?? {};
            const rows = Object.entries(m).sort((a, b) => b[1] - a[1]);
            return (
              <div key={ix}>
                <h3>{ix} <span className="muted">({rows.length})</span></h3>
                <div className="tablewrap"><table className="tbl"><tbody>{rows.map(([n, wt]) => <tr key={n}><td>{n}</td><td className="num">{wt.toFixed(2)}%</td></tr>)}</tbody></table></div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Macro() {
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (): Promise<void> => {
    try {
      const r = await api<{ kept: number; bad: number; total: number }>('/macro/in10y', { method: 'POST', body: { text, replace } });
      setMsg(`Saved ${r.kept} rows (${r.bad} lines unreadable); ${r.total} days held in all.`);
      setText('');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="card">
      <div className="card-head"><h2>India 10-year government bond yield</h2><Info k="India 10-year government bond yield" /></div>
      <p className="small-note">The free sources do not give this yield, so paste the history from Investing.com: one row per day, the date then the yield (for example <code>25-09-2026 7.120</code>), tab or space separated. It feeds the Macro backdrop.</p>
      <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="25-09-2026&#9;7.120" aria-label="India 10Y rows" />
      <label className="field-inline"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace what is saved (otherwise new days are added)</label>
      <div className="card-actions"><button className="btn primary" disabled={!text.trim()} onClick={() => void save()}>Save</button></div>
      {msg && <p className="banner ok" role="status">{msg}</p>}
    </section>
  );
}

/** What the backend keeps (the userscript's Data Load): the saved data with a clear button per kind, the instruments, strike steps, index weights and the India 10Y paste box. */
export function Data() {
  const { data: info, err } = useLive<Info>('/data', 15000, true);
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('groot.data.tab') as Tab) || 'cache');
  const [n, setN] = useState(0);
  const pick = (t: Tab): void => { setTab(t); try { localStorage.setItem('groot.data.tab', t); } catch { /* kept for this visit */ } };
  return (
    <div className="page">
      <header className="page-head"><div><h1>Data</h1><p className="sub">What the app keeps: instruments {info ? `(${nfi(info.instruments.count)} contracts, ${info.instruments.day ?? '—'})` : ''}, strike steps, index weights and saved results</p></div></header>
      <div className="chips" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => pick(k)}>{l}</button>)}</div>
      {!info ? <Loading what="the data" err={err} /> : tab === 'cache' ? <Cache key={n} info={info} reload={() => setN(n + 1)} /> : tab === 'instruments' ? <Instruments /> : tab === 'steps' ? <Steps /> : tab === 'weights' ? <Weights info={info} reload={() => setN(n + 1)} /> : <Macro />}
    </div>
  );
}
