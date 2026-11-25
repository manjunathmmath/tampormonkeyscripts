import { useEffect, useState } from 'react';
import { api } from '../api';
import { IndexPanels } from './Dashboard';
import { FocusBody } from './Focus';
import { nf, signed, tone } from '../lib/format';
import { q, useLive } from './DashboardPanels';

interface Cmd {
  ltp: number; open: number; prevClose: number; zone: string; symbol: string; expiry: string;
  vol: { key: string; value: number | null };
  strikeMap: { bstrikeOne: number; bstrikeTwo: number; ustrikeOne: number; ustrikeTwo: number; vixDDUpper: number; vixDDLower: number };
  trend: { change: string };
}

/** Where the price stands inside the expected day range (VIXL to VIXU), with the 9:15 levels as ticks. */
function CommodityStrip({ name }: { name: string }) {
  const { data: c } = useLive<Cmd>(`/commodity?${q(name)}`);
  if (!c) return null;
  const lo = Math.min(c.strikeMap.vixDDLower, c.strikeMap.bstrikeTwo);
  const hi = Math.max(c.strikeMap.vixDDUpper, c.strikeMap.ustrikeTwo);
  const pos = (v: number): string => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo || 1)) * 100)).toFixed(1)}%`;
  const ticks: [string, number, string][] = [['VIXL', c.strikeMap.vixDDLower, 'dn'], ['BST', c.strikeMap.bstrikeTwo, 'dn'], ['BSO', c.strikeMap.bstrikeOne, 'dn'], ['Open', c.open, 'flat'], ['ASO', c.strikeMap.ustrikeOne, 'up'], ['AST', c.strikeMap.ustrikeTwo, 'up'], ['VIXU', c.strikeMap.vixDDUpper, 'up']];
  const chg = parseFloat(c.trend.change);
  return (
    <section className="cmd-strip" aria-label={`${name} today`}>
      <div className="cmd-main">
        <span className="cmd-name">{name}</span>
        <span className="cmd-px num">{nf(c.ltp)}</span>
        <span className={`cmd-chg num ${tone(chg)}`}>{signed(chg, 2)}%</span>
      </div>
      <div className="cmd-facts">
        <span className="pill">9:15 zone <b>{c.zone}</b></span>
        <span className="pill">{c.vol.key === 'FIXED' ? 'Fixed range' : c.vol.key} <b className="num">{c.vol.value?.toFixed(1) ?? '—'}</b></span>
        {(c.ltp < c.strikeMap.vixDDLower || c.ltp > c.strikeMap.vixDDUpper) && <span className="pill warn">Price is {c.ltp < c.strikeMap.vixDDLower ? 'below' : 'above'} the expected day range</span>}
        <span className="pill">{c.symbol} · expires {c.expiry}</span>
        <a className="pill" href={`#/focus`}>Trade Focus →</a>
      </div>
      <div className="crange" role="img" aria-label="Price within the expected day range">
        <div className="crange-track" />
        {ticks.map(([l, v, t], i) => (
          <span key={l} className={`crange-tick ${t}`} style={{ left: pos(v) }} data-alt={i % 3}>
            <i />
            <em>{l}</em>
          </span>
        ))}
        <span className="crange-px" style={{ left: pos(c.ltp) }}><b className="num">{nf(c.ltp)}</b></span>
      </div>
    </section>
  );
}


const KEY = 'groot.commodity';

/** Commodities (MCX): one commodity at a time with the same panels as an index, plus its day levels, wall verdict and (crude) the global cross-check. */
export function Commodities() {
  const [names, setNames] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string>(() => {
    try {
      return localStorage.getItem(KEY) || 'GOLDM';
    } catch {
      return 'GOLDM';
    }
  });
  useEffect(() => {
    api<{ names: string[] }>('/commodities')
      .then((r) => setNames(r.names))
      .catch((e: Error) => setErr(e.message));
  }, []);
  const pick = (n: string): void => {
    setSel(n);
    try {
      localStorage.setItem(KEY, n);
    } catch {
      /* not remembered */
    }
  };
  const order = ['GOLDM', 'SILVERM', 'CRUDEOILM'];
  const list = [...order.filter((n) => names.includes(n)), ...names.filter((n) => !order.includes(n))];
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Commodities</h1>
          <p className="sub">MCX futures and options: levels from the open, expected range from the CBOE volatility index, and the same signals as the indices</p>
        </div>
      </header>
      {err && <p className="banner err">{err}</p>}
      <div className="chips" role="tablist" aria-label="Commodity">
        {list.map((n) => (
          <button key={n} role="tab" aria-selected={sel === n} className={`chip ${sel === n ? 'on' : ''}`} onClick={() => pick(n)}>
            {n}
          </button>
        ))}
      </div>
      {list.length > 0 && <CommodityStrip key={`s${sel}`} name={list.includes(sel) ? sel : list[0]!} />}
      {list.length > 0 && <section className="cmd-focus" aria-label="Focus gates"><FocusBody key={`f${sel}`} name={list.includes(sel) ? sel : list[0]!} /></section>}
      {list.length > 0 && <IndexPanels key={sel} name={list.includes(sel) ? sel : list[0]!} commodity />}
    </div>
  );
}
