import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { Info } from '../components/Info';
import { getSnapshot } from '../lib/format';
import { heatColor, squarify } from '../lib/treemap';

interface Row { name: string; ltp: number; open: number | null; prev: number | null; high: number | null; low: number | null; volume: number | null }
interface Res { at: number; lastTickAt: number | null; total: number; rows: Row[]; weights: { 'NIFTY 50': Record<string, number>; 'NIFTY BANK': Record<string, number> } }
type Mode = 'prev' | 'open';
type View = 'NIFTY 50' | 'NIFTY BANK' | 'All F&O';

const INDEX_NAMES = ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'NIFTY FIN SERVICE', 'NIFTY MID SELECT', 'BANKEX', 'GIFT NIFTY', 'INDIA VIX'];
const MODE_KEY = 'groot.heat.mode';
const VIEW_KEY = 'groot.heat.view';

const pctOf = (r: Row, mode: Mode): number | null => {
  const b = mode === 'prev' ? r.prev : r.open;
  return b ? ((r.ltp - b) / b) * 100 : null;
};
const sg = (x: number | null, d = 2): string => (x == null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}%`);
const n2 = (x: number): string => x.toLocaleString('en-IN', { maximumFractionDigits: 2 });

function useWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const f = (): void => setW(el.clientWidth);
    f();
    const ro = new ResizeObserver(f);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function Tree({ rows, weights, mode, height }: { rows: Row[]; weights: Record<string, number> | null; mode: Mode; height: number }) {
  const [ref, w] = useWidth();
  const items = useMemo(() => rows.map((r) => ({ key: r.name, value: weights ? weights[r.name] ?? 0 : 1 })), [rows, weights]);
  const rects = useMemo(() => squarify(items, w, height), [items, w, height]);
  const by = useMemo(() => new Map(rows.map((r) => [r.name, r])), [rows]);
  return (
    <div ref={ref} className="hm-tree" style={{ height }}>
      {rects.map((t) => {
        const r = by.get(t.key)!;
        const p = pctOf(r, mode);
        const big = t.w > 70 && t.h > 46;
        const mid = t.w > 44 && t.h > 28;
        return (
          <a key={t.key} className="hm-tile" href={`#/chart/${encodeURIComponent(t.key)}`} title={`${t.key}: ${n2(r.ltp)} (${sg(p)})${weights?.[t.key] ? ` · weight ${weights[t.key]!.toFixed(1)}%` : ''}`} style={{ left: t.x, top: t.y, width: t.w, height: t.h, background: heatColor(p) }}>
            {mid && <b>{t.key}</b>}
            {mid && <span>{sg(p)}</span>}
            {big && <small>{n2(r.ltp)}</small>}
          </a>
        );
      })}
    </div>
  );
}

/** Index and stock tiles coloured by the day's move. Prices come from the live feed (no Kite calls); the size of a tile is the stock's weight in the index. */
export function Heatmap() {
  const [d, setD] = useState<Res | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(() => { try { return localStorage.getItem(MODE_KEY) === 'open' ? 'open' : 'prev'; } catch { return 'prev'; } });
  const [view, setView] = useState<View>(() => { try { const v = localStorage.getItem(VIEW_KEY); return v === 'NIFTY BANK' || v === 'All F&O' ? v : 'NIFTY 50'; } catch { return 'NIFTY 50'; } });
  const [sort, setSort] = useState<'move' | 'az'>('move');
  const snap = getSnapshot();
  useEffect(() => {
    let live = true;
    const load = (): void => { api<Res>('/heatmap').then((r) => live && (setD(r), setErr(null))).catch((e: Error) => live && setErr(e.message)); };
    load();
    const t = window.setInterval(load, 5000);
    return () => { live = false; window.clearInterval(t); };
  }, []);
  const pick = (m: Mode): void => { setMode(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* not remembered */ } };
  const pickView = (v: View): void => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* not remembered */ } };

  const rows = d?.rows ?? [];
  const idx = INDEX_NAMES.map((n) => rows.find((r) => r.name === n)).filter((r): r is Row => !!r);
  const isIdx = new Set(INDEX_NAMES);
  const stocks = rows.filter((r) => !isIdx.has(r.name));
  const wts = view === 'All F&O' ? null : d?.weights[view] ?? null;
  const shown = view === 'All F&O' ? stocks : stocks.filter((r) => (wts?.[r.name] ?? 0) > 0);
  const moves = shown.map((r) => pctOf(r, mode)).filter((x): x is number => x != null);
  const up = moves.filter((x) => x > 0).length;
  const dn = moves.filter((x) => x < 0).length;
  const wMove = wts ? shown.reduce((a, r) => a + (pctOf(r, mode) ?? 0) * (wts[r.name] ?? 0), 0) / (shown.reduce((a, r) => a + (wts[r.name] ?? 0), 0) || 1) : null;
  const sorted = [...shown].sort((a, b) => (sort === 'az' ? a.name.localeCompare(b.name) : (pctOf(b, mode) ?? -99) - (pctOf(a, mode) ?? -99)));
  const age = d?.lastTickAt ? Math.round((Date.now() - d.lastTickAt) / 1000) : null;

  return (
    <div className="page eng-page">
      <header className="page-head">
        <div>
          <h1>Heatmap <Info text="Every index and stock coloured by how far it has moved: green up, red down, deeper the bigger (full colour at 3%, indices at 1.5%). In the index views the size of a tile is the stock's weight in that index, so the big tiles are the ones moving the index. Prices come from the live feed. Click a tile to open its chart." /></h1>
          <p className="sub">The day's move across the market, sized by weight.</p>
        </div>
      </header>
      {snap && <p className="small-note warn-note">A snapshot time is set ({snap}), but the heatmap shows live prices: it does not follow a snapshot.</p>}
      {err && <p className="banner err">{err}</p>}
      {!d && !err && <p className="muted">Reading the live prices…</p>}
      {d && !rows.length && <p className="muted">No live prices yet ({d.total} instruments are followed). The heatmap fills as soon as the live feed delivers; check Data engine if it stays empty.</p>}
      {d && rows.length > 0 && (
        <>
          <div className="learn-bar">
            <div className="shorts-bar" role="group" aria-label="Move measured from">
              <button className={`chip${mode === 'prev' ? ' on' : ''}`} onClick={() => pick('prev')}>vs previous close</button>
              <button className={`chip${mode === 'open' ? ' on' : ''}`} onClick={() => pick('open')}>since the open</button>
            </div>
            <span className="muted small-note">{age != null ? (age < 90 ? `live · last tick ${age}s ago` : `last tick ${Math.round(age / 60)} min ago`) : ''}</span>
          </div>
          <section className="card">
            <div className="card-head"><h2>Indices</h2></div>
            <div className="hm-idx">
              {idx.map((r) => {
                const p = pctOf(r, mode);
                return <a key={r.name} className="hm-itile" href={`#/chart/${encodeURIComponent(r.name)}`} style={{ background: r.name === 'INDIA VIX' ? heatColor(p == null ? null : -p, 6) : heatColor(p, 1.5) }}><b>{r.name === 'NIFTY BANK' ? 'BANK NIFTY' : r.name}</b><span>{sg(p)}</span><small>{n2(r.ltp)}</small></a>;
              })}
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Stocks</h2>
              <div className="shorts-bar" role="group" aria-label="Which stocks">
                {(['NIFTY 50', 'NIFTY BANK', 'All F&O'] as View[]).map((v) => <button key={v} className={`chip${view === v ? ' on' : ''}`} onClick={() => pickView(v)}>{v === 'NIFTY BANK' ? 'BANK NIFTY' : v}</button>)}
              </div>
            </div>
            <p className="small-note muted">{shown.length} stocks · <span className="up">{up} up</span> · <span className="dn">{dn} down</span>{wMove != null ? ` · weighted move ${sg(wMove)}` : ''}{view !== 'All F&O' && d.weights[view] && Object.keys(d.weights[view]).length === 0 ? ' · index weights are not loaded yet (tiles are equal)' : ''}</p>
            {wts && Object.keys(wts).length > 0 ? <Tree rows={shown} weights={wts} mode={mode} height={460} /> : <Tree rows={shown} weights={null} mode={mode} height={460} />}
            <div className="hm-legend" aria-hidden="true"><span>−3%</span><i style={{ background: `linear-gradient(90deg, ${heatColor(-3)}, ${heatColor(0)}, ${heatColor(3)})` }} /><span>+3%</span></div>
          </section>
          {view === 'All F&O' && (
            <section className="card">
              <div className="card-head"><h2>All stocks, in order</h2>
                <div className="shorts-bar"><button className={`chip${sort === 'move' ? ' on' : ''}`} onClick={() => setSort('move')}>biggest move</button><button className={`chip${sort === 'az' ? ' on' : ''}`} onClick={() => setSort('az')}>A to Z</button></div>
              </div>
              <div className="hm-grid">{sorted.map((r) => { const p = pctOf(r, mode); return <a key={r.name} className="hm-cell" href={`#/chart/${encodeURIComponent(r.name)}`} title={`${r.name} ${n2(r.ltp)}`} style={{ background: heatColor(p) }}><b>{r.name}</b><span>{sg(p)}</span></a>; })}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
