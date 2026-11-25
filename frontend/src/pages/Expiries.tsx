import { useEffect, useState } from 'react';
import { api } from '../api';
import { Info } from '../components/Info';

interface Chip { expiry: string; contracts: number; symbol?: string }
interface Row { name: string; exchange: string; lot: number | null; futures: Chip[]; options: Chip[]; usedOptions: string | null; usedFutures: string | null; source: 'settings' | 'nearest' | null }
interface View {
  today: string; nseDay: string; mcxDay: string; listDay: string | null;
  indices: Row[]; mcx: Row[];
  stocks: { count: number; futures: Chip[]; options: Chip[]; usedOptions: string | null; usedFutures: string | null; source: 'settings' | 'nearest' | null };
  one: Row | null;
}

const daysTo = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const short = (d: string): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Chips({ list, used, today, max = 6 }: { list: Chip[]; used: string | null; today: string; max?: number }) {
  if (!list.length) return <span className="muted">none listed</span>;
  return (
    <span className="exp-chips">
      {list.slice(0, max).map((c) => {
        const n = daysTo(today, c.expiry);
        return (
          <span key={c.expiry} className={`exp-chip${c.expiry === used ? ' used' : ''}${n <= 1 ? ' soon' : ''}`} title={`${c.expiry} · ${n === 0 ? 'expires today' : n < 0 ? 'expired' : `${n} day${n === 1 ? '' : 's'} left`} · ${c.contracts} contract${c.contracts === 1 ? '' : 's'}${c.symbol ? ` · ${c.symbol}` : ''}`}>
            {short(c.expiry)}<small>{n === 0 ? 'today' : `${n}d`}</small>
          </span>
        );
      })}
      {list.length > max && <span className="muted small-note">+{list.length - max} more</span>}
    </span>
  );
}

function Table({ rows, today }: { rows: Row[]; today: string }) {
  return (
    <div className="table-wrap"><table className="eng-table exp-table">
      <thead><tr><th>Underlying</th><th>Futures</th><th>Options</th><th>Used now</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.exchange + r.name}>
          <td><b>{r.name}</b><br /><small className="muted">{r.exchange}{r.lot ? ` · lot ${r.lot}` : ''}</small></td>
          <td><Chips list={r.futures} used={r.usedFutures} today={today} /></td>
          <td><Chips list={r.options} used={r.usedOptions} today={today} /></td>
          <td className="num">{r.usedOptions ? <>{r.usedOptions}<br /><small className="muted">{r.source === 'settings' ? 'from Settings' : 'nearest listed'}</small></> : '—'}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

/** Every futures and options expiry in Kite's instrument list, and the one the app uses now. */
export function Expiries() {
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [find, setFind] = useState('');
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      api<View>(`/data/expiries${find.trim() ? `?name=${encodeURIComponent(find.trim())}` : ''}`).then((r) => live && (setV(r), setErr(null))).catch((e: Error) => live && setErr(e.message));
    }, find ? 300 : 0);
    return () => { live = false; window.clearTimeout(t); };
  }, [find]);
  return (
    <div className="page eng-page">
      <header className="page-head">
        <div>
          <h1>Expiries <Info text="The futures and options expiries in Kite's instrument list, by underlying. The highlighted one is what the app uses now: the expiry you picked in Settings, otherwise the nearest listed one on or after the day shown. Kite removes a contract once it has expired, so an expired expiry is not listed here, and a screen for a day that used it cannot be rebuilt." /></h1>
          <p className="sub">What is listed, when it expires, and which expiry the app is using.</p>
        </div>
      </header>
      {err && <p className="banner err">{err}</p>}
      {!v && !err && <p className="muted">Loading…</p>}
      {v && (
        <>
          <section className="card">
            <p className="small-note">Instrument list of <b>{v.listDay ?? '—'}</b> · today <b>{v.today}</b> · NSE shows <b>{v.nseDay}</b> · MCX shows <b>{v.mcxDay}</b>.{' '}
              {v.listDay && v.listDay < v.today ? 'The list is older than today, so contracts that expired since are still shown.' : 'Contracts that have expired are no longer listed.'}</p>
            <div className="learn-bar"><input type="search" placeholder="Look up any name, e.g. RELIANCE, HDFCBANK, GOLDM" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Look up a name" /></div>
            {find.trim() && (v.one ? <Table rows={[v.one]} today={v.today} /> : <p className="muted">No futures or options are listed for "{find}".</p>)}
          </section>
          <section className="card">
            <div className="card-head"><h2>Indices</h2><Info text="Weekly and monthly expiries are listed together. The highlighted chip is the one in use." /></div>
            <Table rows={v.indices} today={v.today} />
          </section>
          <section className="card">
            <div className="card-head"><h2>F&amp;O stocks</h2><span className="muted">{v.stocks.count} stocks share these expiries</span></div>
            <div className="table-wrap"><table className="eng-table exp-table">
              <thead><tr><th>Futures</th><th>Options</th><th>Used now</th></tr></thead>
              <tbody><tr>
                <td><Chips list={v.stocks.futures} used={v.stocks.usedFutures} today={v.today} /></td>
                <td><Chips list={v.stocks.options} used={v.stocks.usedOptions} today={v.today} /></td>
                <td className="num">{v.stocks.usedOptions ?? '—'}<br /><small className="muted">{v.stocks.source === 'settings' ? 'from Settings' : 'nearest listed'}</small></td>
              </tr></tbody>
            </table></div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Commodities (MCX)</h2></div>
            {v.mcx.length ? <Table rows={v.mcx} today={v.today} /> : <p className="muted">No commodity contracts are listed.</p>}
          </section>
          <p className="small-note muted">Chips show the date and the days left; a red chip expires today or tomorrow. Hover a chip for the contract count and symbol. To use a different expiry, pick it in Settings.</p>
        </>
      )}
    </div>
  );
}
