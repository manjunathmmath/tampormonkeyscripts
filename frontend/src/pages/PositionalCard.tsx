import { useEffect, useState } from 'react';
import { api } from '../api';
import { getSnapshot, signed, tone } from '../lib/format';
import { Card, Loading, useLive } from './DashboardPanels';

interface Row {
  name: string;
  verdict: string;
  convictionPct: number | null;
  ltp: number;
  entry: number | null;
  stop: number | null;
  target: number | null;
  riskReward: number | null;
  tradeable: boolean;
  primary: { label: string } | null;
  since: { label: string; days: number; favPct: number | null; advice: string } | null;
  extensionNote?: string;
  exitCriteria?: string;
}
interface State {
  state?: string;
  running: boolean;
  total: number;
  done: number;
  current: string | null;
  error: string | null;
  rows: Row[];
  market: { buy: number; sell: number; watch: number; scanned: number; label: string };
}

const verdictTone = (v: string): string => (v.includes('BUY') || v.includes('LONG') ? 'up' : v.includes('SELL') || v.includes('SHORT') ? 'dn' : 'flat');

/** The swing screener: a scan of the two indices and the top-10 stocks (or every F&O stock) on daily candles, with its market view and the tradeable names. */
export function PositionalCard() {
  const [fast, setFast] = useState(false);
  const { data: s, err } = useLive<State>('/positional', 3000, fast);
  useEffect(() => setFast(!!s && !s.state && s.running), [s]);
  const { data: nm } = useLive<{ names: string[] }>('/positional/names', 600000);
  const [busy, setBusy] = useState(false);
  const [only, setOnly] = useState(true);
  const scan = async (scope: 'dashboard'): Promise<void> => {
    setBusy(true);
    try {
      await api('/positional/scan', { method: 'POST', body: { scope, fresh: true, ...(getSnapshot() ? { asOf: getSnapshot() } : {}) } });
    } finally {
      setBusy(false);
    }
  };
  const scanned = !!s && !s.state;
  const inScope = (r: Row): boolean => !nm || nm.names.includes(r.name);
  const rows = scanned ? (only ? s.rows.filter((r) => r.tradeable && inScope(r)) : s.rows.filter(inScope)).slice().sort((a, b) => (b.convictionPct ?? -1) - (a.convictionPct ?? -1)) : [];
  return (
    <Card title="Positional screener (swing, daily candles)" sub={scanned ? `${s.market.label} · ${s.market.buy} buy / ${s.market.sell} sell / ${s.market.watch} watch` : undefined}>
      <div className="chips">
        <button className="chip" disabled={busy || (scanned && !!s?.running)} onClick={() => void scan('dashboard')}>Scan indices + weighted stocks</button>
        <a className="chip" href="#/positional">Open the full scanner (all F&amp;O, filters)</a>
        <button className={`chip ${only ? 'on' : ''}`} onClick={() => setOnly(!only)}>Tradeable only</button>
      </div>
      {!s ? (
        <Loading what="the screener" err={err} />
      ) : !scanned ? (
        <p className="muted">Not scanned yet. Pick a scan above.</p>
      ) : (
        <>
          {s.running && <p className="small-note">Scanning {s.done} of {s.total}{s.current ? ` — ${s.current}` : ''}…</p>}
          {s.error && <p className="small-note warn-note">{s.error}</p>}
          <div className="tablewrap">
            <table className="tbl">
              <thead>
                <tr><th>Name</th><th>Verdict</th><th>Conv.</th><th>LTP</th><th>Entry</th><th>Stop</th><th>Target</th><th>R:R</th><th>Timing</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} title={`${r.primary?.label ?? ''}\n${r.extensionNote ?? ''}\n${r.since?.advice ?? ''}`}>
                    <td><b>{r.name}</b></td>
                    <td className={verdictTone(r.verdict)}>{r.verdict}</td>
                    <td className="num">{r.convictionPct ?? '—'}</td>
                    <td className="num">{r.ltp.toFixed(1)}</td>
                    <td className="num">{r.entry?.toFixed(1) ?? '—'}{r.entry != null && Math.abs(r.entry / r.ltp - 1) >= 0.005 ? ' *' : ''}</td>
                    <td className="num">{r.stop?.toFixed(1) ?? '—'}</td>
                    <td className="num">{r.target?.toFixed(1) ?? '—'}</td>
                    <td className="num">{r.riskReward?.toFixed(1) ?? '—'}</td>
                    <td className={tone(r.since?.favPct ?? 0)}>{r.since ? `${r.since.label} · ${r.since.days}d · ${signed(r.since.favPct ?? 0, 1)}%` : '—'}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={9} className="muted">{only ? 'No tradeable names in this scan.' : 'No rows.'}</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="small-note">* the entry is a pullback or bounce level, not the current price. Conviction counts how many of the scanner's own checks line up (not a back-tested probability); Minervini, Weinstein and Clenow rules with ATR stops, rule of thumb.</p>
        </>
      )}
    </Card>
  );
}
