import { useState } from 'react';
import { Info } from '../components/Info';
import { Card, SignalsCard, q, useLive } from './DashboardPanels';
import { asOfQuery, nf, tradingDayNow } from '../lib/format';
import { PayoffChart } from '../components/Charts';

interface Leg { type: 'CE' | 'PE'; side: 'BUY' | 'SELL'; strike: number; symbol: string; premium: number | null }
type Money = number | 'unlimited' | null;
interface Res {
  name: string; strategy: string; label: string; view: string; suggested: string; why: string; expiry: string; dte: number; spot: number; atm: number; step: number; offset: number; wing: number; lotSize: number;
  legs: Leg[];
  payoff: { ok: boolean; netCredit: number | null; maxProfit: Money; maxLoss: Money; breakevens: number[] };
  perLot: { maxProfit: Money; maxLoss: Money; netCredit: number | null } | null;
  lotsAtRisk: number | null;
  warnings: string[];
  strategies: { key: string; label: string; view: string }[];
}

const ZONE_ORDER: [string, string][] = [['AST', 'AST: closed above the second level'], ['ASO', 'ASO: above the first level'], ['B/W', 'B/W: between the levels'], ['BSO', 'BSO: below the first level'], ['BST', 'BST: below the second level']];
const QUICK: { label: string; names: string[] }[] = [
  { label: 'Indices', names: ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'NIFTY FIN SERVICE', 'NIFTY MID SELECT'] },
  { label: 'MCX', names: ['CRUDEOILM', 'CRUDEOIL', 'GOLDM', 'GOLD', 'SILVERM', 'SILVER', 'NATGASMINI', 'NATURALGAS', 'COPPER', 'ZINC', 'USDINR'] },
];

/** The 9:15 breakout board: every name by where its first 5-minute candle closed; a click loads that name's strikes below. */
function Board915({ sel, onPick }: { sel: string; onPick: (n: string) => void }) {
  const { data } = useLive<{ items: Record<string, { zone: string }> }>(`/scan915?day=${tradingDayNow()}${asOfQuery()}`, 600000);
  const [open, setOpen] = useState<Record<string, boolean>>({ 'B/W': false });
  if (!data) return null;
  const by: Record<string, string[]> = {};
  for (const [n, it] of Object.entries(data.items)) (by[it.zone] ??= []).push(n);
  return (
    <section className="card board915" aria-label="9:15 breakout board">
      <div className="card-head"><h2>9:15 breakout</h2><Info k="9:15 breakout" /><span className="muted">click a stock to get its option strikes and a suggested strategy</span></div>
      <div className="b915-cols">
        {ZONE_ORDER.map(([z, hint]) => {
          const names = (by[z] ?? []).sort();
          const shut = open[z] === false;
          return (
            <div key={z} className={`b915 z-${z.replace('/', '')}`}>
              <button className="b915-h" title={hint} aria-expanded={!shut} onClick={() => setOpen({ ...open, [z]: shut })}>{z} <small>{names.length}</small> <i>{shut ? '▸' : '▾'}</i></button>
              {!shut && <div className="b915-chips">{names.map((n) => <button key={n} className={`b915-chip${sel === n ? ' on' : ''}`} onClick={() => onPick(n)}>{n}</button>)}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const BASE = ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'GOLDM', 'SILVERM', 'CRUDEOILM'];
const money = (m: Money): string => (m == null ? '—' : m === 'unlimited' ? 'Unlimited' : `₹${Math.round(m).toLocaleString('en-IN')}`);

/** Option Strike Search: a strategy for the consensus direction (or your pick) with its legs, last premiums and the expiry payoff. It reads only; no order is placed. */
export function Strikes() {
  const [sel, setSel] = useState<string>(() => {
    try {
      return localStorage.getItem('groot.focus') || 'NIFTY 50';
    } catch {
      return 'NIFTY 50';
    }
  });
  const [strategy, setStrategy] = useState('');
  const [offset, setOffset] = useState('');
  const [wing, setWing] = useState('');
  const [typed, setTyped] = useState('');
  const path = `/strikes?${q(sel)}${strategy ? `&strategy=${strategy}` : ''}${offset ? `&offset=${encodeURIComponent(offset)}` : ''}${wing ? `&wing=${encodeURIComponent(wing)}` : ''}`;
  const { data, err } = useLive<Res>(path, 60000);
  const pick = (n: string): void => {
    setSel(n);
    setStrategy('');
    try {
      localStorage.setItem('groot.focus', n);
    } catch {
      /* not remembered */
    }
  };
  const { data: wts } = useLive<{ full: Record<string, Record<string, number>> } | null>('/data/weights', 3600000);
  const byWeight = (ix: string): string[] => Object.entries(wts?.full?.[ix] ?? {}).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const nifty = byWeight('NIFTY 50');
  const bank = byWeight('NIFTY BANK');
  const credit = data?.payoff.netCredit ?? null;
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Trade</h1>
          <p className="sub">Pick a stock from the 9:15 board or the quick lists, see whether the signals agree and whether now is a good time, then the strategy, strikes and what it can make or lose at expiry. Reads only; it places nothing.</p>
        </div>
      </header>
      <Board915 sel={sel} onPick={pick} />
      <section className="card quick-picks" aria-label="Quick picks">
        {[...QUICK.slice(0, 1), { label: 'NIFTY 50', names: nifty }, { label: 'BANK NIFTY', names: bank }, ...QUICK.slice(1)].map((r) => r.names.length > 0 && (
          <div key={r.label} className="qp-row"><span className="qp-l">{r.label}</span><div className="qp-chips">{r.names.map((n) => <button key={n} className={`chip sm ${sel === n ? 'on' : ''}`} onClick={() => pick(n)}>{n}</button>)}</div></div>
        ))}
      <div className="chips" role="group" aria-label="Search">
        <form className="focus-search" onSubmit={(e) => { e.preventDefault(); const v = typed.trim().toUpperCase(); if (v) { pick(v); setTyped(''); } }}>
          <input aria-label="Any F&O stock" placeholder="Any F&O stock" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </form>
      </div>
      </section>
      {err && <p className="banner err" role="alert">{err}</p>}
      {!data && !err && <p className="muted">Reading the option chain for {sel}…</p>}
      {data && (
        <>
          <section className="strike-hero">
            <div>
              <span className="fh-name">{data.view} · expires {data.expiry} ({data.dte} day{data.dte === 1 ? '' : 's'})</span>
              <div className="fh-word st-word">{data.label}</div>
              <p className="fh-line">{data.why}{data.strategy !== data.suggested ? ' You picked a different strategy from the suggested one.' : ''}</p>
            </div>
            <div className="st-controls">
              <label>Strategy
                <select value={strategy || data.strategy} onChange={(e) => setStrategy(e.target.value === data.suggested ? '' : e.target.value)}>
                  {data.strategies.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.view}){s.key === data.suggested ? ' ★' : ''}</option>)}
                </select>
              </label>
              <label>Distance of sold strikes
                <input inputMode="decimal" placeholder={`auto (${nf(data.offset)})`} value={offset} onChange={(e) => setOffset(e.target.value)} />
              </label>
              <label>Wing / hedge width
                <input inputMode="decimal" placeholder={`auto (${nf(data.wing)})`} value={wing} onChange={(e) => setWing(e.target.value)} />
              </label>
            </div>
          </section>
          <SignalsCard name={sel} />

          <div className="pgrid">
            <Card title="Legs" sub={`${data.name} at ${nf(data.spot)} · ATM ${nf(data.atm)} · lot ${data.lotSize}`}>
              <table className="legs num">
                <thead><tr><th>Side</th><th className="hide-sm">Contract</th><th>Strike</th><th>Last price</th></tr></thead>
                <tbody>
                  {data.legs.map((l) => (
                    <tr key={l.symbol}>
                      <td><span className={`side ${l.side === 'BUY' ? 'up' : 'dn'}`}>{l.side}</span></td>
                      <td className="hide-sm">{l.symbol}</td>
                      <td><b>{nf(l.strike)}</b> {l.type}</td>
                      <td>{l.premium == null ? '—' : nf(l.premium)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="small-note">Prices are the last traded close of each contract{data.legs.some((l) => l.premium == null) ? '; a dash means it has not traded' : ''}. Not the price you will get.</p>
            </Card>
            <Card title="At expiry" sub={credit == null ? undefined : credit >= 0 ? `Net credit ${nf(credit)} per share` : `Net debit ${nf(-credit)} per share`}>
              {!data.payoff.ok || !data.perLot ? (
                <p className="muted">Needs a price for every leg.</p>
              ) : (
                <>
                <PayoffChart legs={data.legs} spot={data.spot} lot={data.lotSize} breakevens={data.payoff.breakevens} fmt={(n) => Math.round(n).toLocaleString('en-IN')} />
                <div className="st-grid">
                  <div className="st-box up"><span>Best case, per lot</span><b className="num">{money(data.perLot.maxProfit)}</b></div>
                  <div className="st-box dn"><span>Worst case, per lot</span><b className="num">{money(data.perLot.maxLoss)}</b></div>
                  <div className="st-box"><span>Break-even{data.payoff.breakevens.length === 1 ? '' : 's'}</span><b className="num">{data.payoff.breakevens.length ? data.payoff.breakevens.map((b) => nf(b)).join(' · ') : '—'}</b></div>
                  <div className="st-box"><span>Lots within your risk</span><b className="num">{data.lotsAtRisk == null ? (data.perLot.maxLoss === 'unlimited' ? 'not possible' : '—') : data.lotsAtRisk}</b></div>
                </div>
                </>
              )}
              <p className="small-note">Expiry payoff only: no margin, brokerage, taxes or slippage. Lots use your Account capital and Risk % in Settings.</p>
            </Card>
          </div>
          {data.warnings.length > 0 && (
            <ul className="banner st-warn">{data.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          )}
        </>
      )}
    </div>
  );
}
