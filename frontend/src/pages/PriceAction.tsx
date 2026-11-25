import { useState } from 'react';
import { api, history, universe, type ScanState } from '../api';
import { asOfQuery, getSnapshot, nf, signed, tone, tradingDayNow, dayFor } from '../lib/format';
import { useOnDemand } from '../lib/refresh';
import { Card } from './DashboardPanels';

interface Lv { vixu?: number | null; vixl?: number | null; open: number; aso: number | null; ast: number | null; bso: number | null; bst: number | null }
interface Tile { name: string; closes: number[]; prev: number | null; ltp: number | null; lv: Lv | null }

const NAMES = ['GIFT NIFTY', 'NIFTY 50', 'NIFTY BANK', 'SENSEX', 'HDFCBANK', 'RELIANCE', 'ICICIBANK', 'CRUDEOILM'];

/** The close line of the day with the 9:15 levels drawn across it. */
function MiniChart({ t }: { t: Tile }) {
  const W = 220;
  const H = 96;
  const lv = t.lv;
  const lines: [string, number | null, string][] = lv ? [['VIXU', lv.vixu ?? null, 'var(--warn)'], ['VIXL', lv.vixl ?? null, 'var(--warn)'], ['AST', lv.ast, 'var(--up)'], ['ASO', lv.aso, 'var(--up)'], ['Open', lv.open, 'var(--accent)'], ['BSO', lv.bso, 'var(--dn)'], ['BST', lv.bst, 'var(--dn)']] : [];
  const vals = [...t.closes, ...lines.map((l) => l[1]).filter((v): v is number => v != null)];
  if (t.closes.length < 2) return <div className="mini-empty muted">No candles</div>;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const y = (v: number): number => 6 + (1 - (v - lo) / (hi - lo || 1)) * (H - 12);
  const x = (i: number): number => (i / (t.closes.length - 1)) * W;
  const path = t.closes.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const up = t.prev != null ? t.closes[t.closes.length - 1]! >= t.prev : true;
  return (
    <svg className="mini" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {lines.map(([l, v, c]) => (v == null ? null : <line key={l} x1="0" x2={W} y1={y(v)} y2={y(v)} stroke={c} strokeWidth="1" strokeDasharray={l === 'Open' ? '2 3' : l === 'ASO' || l === 'BSO' ? '5 3' : undefined} opacity="0.7" vectorEffect="non-scaling-stroke" />))}
      <path d={path} fill="none" stroke={up ? 'var(--up)' : 'var(--dn)'} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Small price charts of the instruments that matter, each with its 9:15 levels. One chart per name; the big chart is on Chart View. */
export function PriceActionGrid() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const day = tradingDayNow();
  useOnDemand(async () => {
    try {
      const [u, scan] = await Promise.all([universe(), api<ScanState>(`/scan915?day=${day}`).catch(() => null)]);
      const out: Tile[] = [];
      for (const name of NAMES) {
        const isCmd = name === 'CRUDEOILM';
        const d = dayFor(name);
        let token = u.names[name];
        let lv: Lv | null = null;
        if (isCmd) {
          const c = await api<{ token: number; strikeMap: { ustrikeOne: number; ustrikeTwo: number; bstrikeOne: number; bstrikeTwo: number; vixDDUpper: number; vixDDLower: number }; open: number }>(`/commodity?name=${name}&day=${d}${asOfQuery()}`).catch(() => null);
          if (c) {
            token = c.token;
            lv = { open: c.open, aso: c.strikeMap.ustrikeOne, ast: c.strikeMap.ustrikeTwo, bso: c.strikeMap.bstrikeOne, bst: c.strikeMap.bstrikeTwo, vixu: c.strikeMap.vixDDUpper, vixl: c.strikeMap.vixDDLower };
          }
        } else {
          const it = scan?.items[name];
          if (it) {
            const tr = await api<{ trend: { vixUpper: number; vixLower: number } | null }>(`/score?name=${encodeURIComponent(name)}&day=${d}${asOfQuery()}`).catch(() => null);
            lv = { open: it.anchor, aso: it.aso, ast: it.ast, bso: it.bso, bst: it.bst, vixu: tr?.trend?.vixUpper ?? null, vixl: tr?.trend?.vixLower ?? null };
          }
        }
        if (!token) continue;
        const from = new Date(Date.parse(`${d}T00:00:00Z`) - 5 * 86400000).toISOString().slice(0, 10);
        const c = await history(token, `${from} 09:00:00`, `${d} 23:59:00`).catch(() => []);
        // with a snapshot time set, the day stops there (the candle list is a full session)
        const snap = getSnapshot();
        const closes = c.filter((k) => String(k[0]).slice(0, 10) === d && (!snap || String(k[0]).slice(11, 16) <= snap)).map((k) => Number(k[4]));
        const before = c.filter((k) => String(k[0]).slice(0, 10) < d);
        const prev = before.length ? Number(before[before.length - 1]![4]) : null;
        out.push({ name, closes, prev, ltp: closes[closes.length - 1] ?? null, lv });
        setTiles([...out]);
      }
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [day]);
  return (
    <Card title="Price action" sub="Today's candles with the 9:15 levels">
      {err && <p className="banner err">{err}</p>}
      <div className="pa-grid">
        {tiles.map((t) => {
          const chg = t.ltp != null && t.prev ? ((t.ltp - t.prev) / t.prev) * 100 : null;
          return (
            <a key={t.name} className="pa-tile" href={`#/chart/${encodeURIComponent(t.name)}`}>
              <div className="pa-top"><b>{t.name}</b>{chg != null && <span className={`num ${tone(chg)}`}>{signed(chg)}%</span>}</div>
              <MiniChart t={t} />
              <div className="pa-kv num">
                <span>LTP</span><b>{t.ltp != null ? nf(t.ltp) : '—'}</b>
                {t.lv && <><span>Open</span><b>{nf(t.lv.open)}</b><span className="up">AST</span><b>{t.lv.ast != null ? nf(t.lv.ast) : '—'}</b><span className="up">ASO</span><b>{t.lv.aso != null ? nf(t.lv.aso) : '—'}</b><span className="dn">BSO</span><b>{t.lv.bso != null ? nf(t.lv.bso) : '—'}</b><span className="dn">BST</span><b>{t.lv.bst != null ? nf(t.lv.bst) : '—'}</b>{t.lv.vixu != null && <><span className="muted">VIXU</span><b>{nf(t.lv.vixu)}</b><span className="muted">VIXL</span><b>{nf(t.lv.vixl ?? 0)}</b></>}</>}
              </div>
            </a>
          );
        })}
        {tiles.length === 0 && !err && <p className="muted">Loading the charts…</p>}
      </div>
    </Card>
  );
}
