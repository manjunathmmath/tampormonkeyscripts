import { useEffect, useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { Info } from '../components/Info';

interface Row {
  name: string;
  global: { label: string; sym: string; usdUnit: string; per: string; unit: number };
  mcx: { last: number | null; at: number | null; open: boolean };
  usd: { now: number | null; at: number | null; atMcxClose: number | null; changePct: number | null };
  fx: { now: number | null; atMcxClose: number | null };
  parity: number | null;
  basis: number | null;
  basisAt: number | null;
  basisSource: string | null;
  estimate: number | null;
  gap: number | null;
  gapPct: number | null;
  note: string;
}
interface Res { at: number; rows: Row[]; errors: string[] }

const IST = 19800000;
const hm = (ms: number | null): string => (ms ? new Date(ms + IST).toISOString().slice(5, 16).replace('T', ' ') : '—');
const n0 = (x: number | null | undefined): string => (x == null ? '—' : x.toLocaleString('en-IN', { maximumFractionDigits: 0 }));
const n2 = (x: number | null | undefined): string => (x == null ? '—' : x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const sg = (x: number | null | undefined, d = 2): string => (x == null ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`);
const age = (ms: number | null, now: number): string => {
  if (!ms) return '—';
  const m = Math.max(0, Math.round((now - ms) / 60000));
  return m < 1 ? 'now' : m < 90 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

function WhatIf({ rows }: { rows: Row[] }) {
  const [name, setName] = useState('');
  const [usd, setUsd] = useState('');
  const [fx, setFx] = useState('');
  const r = rows.find((x) => x.name === (name || rows[0]?.name));
  // blank fields use the live values, so the box starts at the current estimate and changes as you type
  const u = usd.trim() ? parseFloat(usd) : r?.usd.now ?? NaN;
  const f = (fx.trim() ? parseFloat(fx) : r?.fx.now) || 0;
  const est = r && r.basis && Number.isFinite(u) && u > 0 && f ? r.basis * u * f * r.global.unit : null;
  return (
    <section className="card">
      <div className="card-head"><h2>What if</h2><Info text="Leave the boxes empty to see the estimate at the live global price and rupee. Type a COMEX / NYMEX price (for example gold in $ per ounce, such as 3,650) and optionally USDINR to see the MCX price it implies, using the premium MCX is carrying." /></div>
      {!rows.length ? <p className="muted">No commodities yet.</p> : (
        <div className="mc-whatif">
          <select value={r?.name ?? ''} onChange={(e) => setName(e.target.value)} aria-label="Commodity">{rows.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}</select>
          <label>{r?.global.label} ({r?.global.usdUnit})<input inputMode="decimal" value={usd} placeholder={r?.usd.now ? String(r.usd.now) : ''} onChange={(e) => setUsd(e.target.value)} /></label>
          <label>USDINR<input inputMode="decimal" value={fx} placeholder={r?.fx.now ? r.fx.now.toFixed(3) : ''} onChange={(e) => setFx(e.target.value)} /></label>
          <div className="mc-out"><span className="muted">MCX equivalent{!usd.trim() && !fx.trim() ? ' (live)' : ''}</span><b className="num">{est != null ? n0(est) : '—'}</b>{est != null && r?.mcx.last ? <small className={est >= r.mcx.last ? 'up' : 'dn'}>{sg(((est / r.mcx.last) - 1) * 100)}% vs MCX last {n0(r.mcx.last)}</small> : null}</div>
        </div>
      )}
    </section>
  );
}


interface GStat { name: string; threshold: number; horizon: number; n: number; avgMove: number | null; medianMove: number | null; hitPct: number | null; closedPct: number | null; avgGap: number | null; noise: number | null }
interface GRes { days: string[]; stats: GStat[]; used: number; stale: number }

/** Did MCX move towards the global-implied price after a gap showed? Built from the readings written down every two minutes while MCX is open. */
function GapLog() {
  const [g, setG] = useState<GRes | null>(null);
  const [th, setTh] = useState(0.3);
  const [h, setH] = useState(15);
  useEffect(() => {
    let live = true;
    const load = (): void => { api<GRes>('/mcxcalc/gaplog').then((r) => live && setG(r)).catch(() => undefined); };
    load();
    const t = window.setInterval(load, 120000);
    return () => { live = false; window.clearInterval(t); };
  }, []);
  const rows = (g?.stats ?? []).filter((x) => x.threshold === th && x.horizon === h);
  return (
    <section className="card">
      <div className="card-head"><h2>Gap log</h2><Info text="While MCX is open, the gap between its price and the global-implied price is written down every two minutes (readings whose global quote was more than 6 minutes old are left out). For each reading with a gap of at least the chosen size, the log checks what MCX did over the next 15 or 30 minutes: did it move towards the estimate, and did it cover at least half of the gap? Compare the average move with the plain noise of that horizon. Readings overlap, so the counts are a rough guide, and a few days prove little." /></div>
      <div className="shorts-bar" role="group" aria-label="Gap size and horizon">
        {[0.15, 0.3, 0.5].map((x) => <button key={x} className={`chip${th === x ? ' on' : ''}`} onClick={() => setTh(x)}>gap ≥ {x}%</button>)}
        {[15, 30].map((x) => <button key={x} className={`chip${h === x ? ' on' : ''}`} onClick={() => setH(x)}>next {x} min</button>)}
      </div>
      {!g ? <p className="muted">Loading…</p> : !g.days.length ? (
        <p className="muted">Nothing recorded yet. The log starts when MCX is open and the server is running; it needs several days to say anything.</p>
      ) : (
        <>
          <p className="small-note muted">{g.days.length} day{g.days.length === 1 ? '' : 's'} recorded ({g.days[0]} to {g.days[g.days.length - 1]}) · {g.used} readings used{g.stale ? `, ${g.stale} left out for an old global quote` : ''}.</p>
          <div className="table-wrap"><table className="eng-table">
            <thead><tr><th>Commodity</th><th className="num">Readings</th><th className="num">Avg gap</th><th className="num">MCX moved (towards the gap)</th><th className="num">Median</th><th className="num">Moved the right way</th><th className="num">Covered half</th><th className="num">Plain noise</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.name} className={r.n < 30 ? 'muted' : ''}>
                <td><b>{r.name}</b>{r.n < 30 && <small className="muted"> few readings</small>}</td>
                <td className="num">{r.n}</td>
                <td className="num">{r.avgGap == null ? '—' : `${r.avgGap.toFixed(2)}%`}</td>
                <td className={`num ${r.avgMove == null ? '' : r.avgMove > (r.noise ?? 0) * 0.5 ? 'up' : ''}`}>{r.avgMove == null ? '—' : `${r.avgMove >= 0 ? '+' : '−'}${Math.abs(r.avgMove).toFixed(3)}%`}</td>
                <td className="num">{r.medianMove == null ? '—' : `${r.medianMove >= 0 ? '+' : '−'}${Math.abs(r.medianMove).toFixed(3)}%`}</td>
                <td className="num">{r.hitPct == null ? '—' : `${r.hitPct.toFixed(0)}%`}</td>
                <td className="num">{r.closedPct == null ? '—' : `${r.closedPct.toFixed(0)}%`}</td>
                <td className="num">{r.noise == null ? '—' : `${r.noise.toFixed(3)}%`}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <p className="small-note muted">"Moved the right way" near 50% is what chance gives. A gap only means something if MCX moved towards it clearly more often than not, by more than the plain noise.</p>
        </>
      )}
    </section>
  );
}

/** MCX prices estimated from the live COMEX / NYMEX price and USDINR, with the premium MCX carries measured from its own last price. */
export function McxCalc() {
  const [d, setD] = useState<Res | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let live = true;
    const load = (): void => { api<Res>('/mcxcalc').then((r) => live && (setD(r), setErr(null), setNow(Date.now()))).catch((e: Error) => live && setErr(e.message)); };
    load();
    const t = window.setInterval(load, 30000);
    return () => { live = false; window.clearInterval(t); };
  }, []);
  return (
    <div className="page eng-page">
      <header className="page-head">
        <div>
          <h1>MCX calculator <Info text="Estimates an MCX price from the live COMEX / NYMEX price and USDINR. The plain conversion ignores import duty, local premium and the contract month, so the app measures the premium MCX was trading at when it last closed (its last price against the global price at that moment) and carries it onto the live global price. An estimate for planning, not an order price. Global quotes come from Yahoo Finance and can be a few minutes late." /></h1>
          <p className="sub">Where MCX would trade now, from COMEX / NYMEX and the rupee.</p>
        </div>
      </header>
      {err && <p className="banner err">{err}</p>}
      {d?.errors.length ? <p className="small-note warn-note">{d.errors.join('; ')}. The numbers below use what could be read.</p> : null}
      {!d && !err && <p className="muted">Reading the global prices…</p>}
      {d && (
        <>
          <div className="mc-grid">
            {d.rows.map((r) => (
              <section key={r.name} className={`card mc-card${r.mcx.open ? ' open' : ''}`}>
                <div className="card-head"><h2>{r.name}</h2><span className={`pill ${r.mcx.open ? 'ok' : ''}`}>{r.mcx.open ? 'MCX open' : 'MCX closed'}</span></div>
                <div className="mc-est">
                  <span className="muted">{r.mcx.open ? 'Global-implied price' : 'Estimated open'}</span>
                  <b className="num">{n0(r.estimate)}</b>
                  {r.gapPct != null && <small className={r.gapPct >= 0 ? 'up' : 'dn'}>{sg(r.gap, 0)} pts · {sg(r.gapPct)}% {r.mcx.open ? 'vs MCX now' : 'vs MCX last close'}</small>}
                </div>
                <p className="small-note">{r.note}</p>
                <dl className="mc-dl">
                  <div><dt>MCX last</dt><dd className="num">{n0(r.mcx.last)}<small className="muted"> {age(r.mcx.at, now)}</small></dd></div>
                  <div><dt>{r.global.label}</dt><dd className="num">{n2(r.usd.now)}<small className="muted"> {r.global.usdUnit}</small></dd></div>
                  <div><dt>Since MCX close</dt><dd className={`num ${r.usd.changePct == null ? '' : r.usd.changePct >= 0 ? 'up' : 'dn'}`}>{sg(r.usd.changePct)}%</dd></div>
                  <div><dt>USDINR</dt><dd className="num">{r.fx.now ? r.fx.now.toFixed(3) : '—'}</dd></div>
                  <div><dt>Parity (no premium)</dt><dd className="num">{n0(r.parity)}<small className="muted"> per {r.global.per}</small></dd></div>
                  <div><dt>MCX premium</dt><dd className="num">{r.basis ? sg((r.basis - 1) * 100) + '%' : '—'}<small className="muted"> {r.basisSource ?? ''}{r.basisAt ? ` · ${hm(r.basisAt)}` : ''}</small></dd></div>
                </dl>
                <p className="small-note muted">Global price time: {hm(r.usd.at)} IST</p>
              </section>
            ))}
          </div>
          {!d.rows.length && <p className="muted">None of the loaded commodities has a global price to convert from.</p>}
          <WhatIf rows={d.rows} />
          <GapLog />
          <p className="small-note muted"><Icon name="clock" size={14} /> Refreshes every 30 seconds. Prices are estimates; the premium is measured from MCX's last price, so it is only as good as that price.</p>
        </>
      )}
    </div>
  );
}
