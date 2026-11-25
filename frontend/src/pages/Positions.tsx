import { useEffect, useState } from 'react';
import { api } from '../api';
import { Info } from '../components/Info';

interface Plan { long: boolean; entry: number; stop: number; t1: number | null; rank: number; forced: boolean }
interface Row {
  symbol: string; exchange: string; product: string; qty: number; open: boolean; stance: 'bullish' | 'bearish';
  avg: number | null; ltp: number | null; pnl: number; pnlPct: number | null;
  underlying: string | null; underlyingLtp: number | null; plan: Plan | null; vs: 'with the plan' | 'against the plan' | 'no plan'; toStop: number | null; toT1: number | null;
}
interface Res { at: number; open: Row[]; closed: Row[]; totals: { pnl: number; open: number; closed: number; against: number } }

const inr = (x: number | null | undefined, d = 0): string => (x == null ? '—' : x.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }));
const money = (x: number): string => `${x >= 0 ? '+' : '−'}₹${Math.abs(x).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const RANK = ['', 'LOW', 'MEDIUM', 'HIGH'];

function Card({ r }: { r: Row }) {
  const p = r.plan;
  const warn = r.vs === 'against the plan';
  return (
    <article className={`pos-card ${r.pnl >= 0 ? 'win' : 'loss'}${warn ? ' warn' : ''}`}>
      <div className="pos-head">
        <div><b>{r.symbol}</b><span className="muted small-note"> {r.exchange} · {r.product || '—'}</span></div>
        <b className={`num ${r.pnl >= 0 ? 'up' : 'dn'}`}>{money(r.pnl)}{r.pnlPct != null ? <small> {r.pnlPct >= 0 ? '+' : '−'}{Math.abs(r.pnlPct).toFixed(1)}%</small> : null}</b>
      </div>
      <div className="pos-row num">
        <span>{r.qty > 0 ? 'Long' : 'Short'} {Math.abs(r.qty)}</span>
        <span>avg {inr(r.avg, 2)}</span>
        <span>last {inr(r.ltp, 2)}</span>
        <span className={`pos-stance ${r.stance === 'bullish' ? 'up' : 'dn'}`}>{r.stance}</span>
      </div>
      {r.underlying && (
        <div className="pos-plan">
          <div className="small-note"><b>{r.underlying === 'NIFTY BANK' ? 'BANK NIFTY' : r.underlying}</b>{r.underlyingLtp != null ? ` ${inr(r.underlyingLtp, 2)}` : ''} · <span className={r.vs === 'with the plan' ? 'up' : warn ? 'dn' : 'muted'}>{r.vs}</span></div>
          {p ? (
            <div className="small-note muted">
              Plan {p.forced ? 'lean ' : ''}{p.long ? 'LONG' : 'SHORT'} ({RANK[p.rank]}): entry {inr(p.entry)} · stop {inr(p.stop)}{p.t1 != null ? ` · T1 ${inr(p.t1)}` : ''}
              {r.toStop != null ? <> · <span className={r.toStop <= 0 ? 'dn' : ''}>{r.toStop <= 0 ? `${inr(Math.abs(r.toStop))} pts beyond the stop` : `${inr(r.toStop)} pts from the stop`}</span></> : null}
              {r.toT1 != null && r.toT1 > 0 ? ` · ${inr(r.toT1)} pts to T1` : ''}
            </div>
          ) : null}
          {warn && <div className="small-note dn">This position bets {r.stance} while the plan for {r.underlying === 'NIFTY BANK' ? 'BANK NIFTY' : r.underlying} is {p?.long ? 'LONG' : 'SHORT'}.</div>}
        </div>
      )}
    </article>
  );
}

/** Your positions from Kite (read only), with how each sits against the Probable trade of its underlying. Nothing here places or closes an order. */
export function Positions() {
  const [d, setD] = useState<Res | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = (): void => { api<Res>('/positions').then((r) => live && (setD(r), setErr(null))).catch((e: Error) => live && setErr(e.message)); };
    load();
    const t = window.setInterval(load, 10000);
    return () => { live = false; window.clearInterval(t); };
  }, []);
  return (
    <div className="page eng-page">
      <header className="page-head">
        <div>
          <h1>Positions <Info text="Your net positions as Kite reports them, with P&L. For indices and commodities each position is set against the Probable trade of its underlying: a long call or short put counts as bullish, a long put or short call as bearish, and the card says whether the plan agrees, how far the underlying is from the plan's stop and from target 1, and flags a position that bets against the plan. Read only: the app never places, changes or closes an order." /></h1>
          <p className="sub">What you hold, and how it sits against today's plan.</p>
        </div>
      </header>
      {err && <p className="banner err">{err}</p>}
      {!d && !err && <p className="muted">Reading your positions from Kite…</p>}
      {d && (
        <>
          <section className="card pos-sum">
            <div className="eng-stats">
              <div className={`eng-stat ${d.totals.pnl >= 0 ? 'ok' : 'warn'}`}><span className="muted">Day P&amp;L (all positions)</span><b className="num">{money(d.totals.pnl)}</b></div>
              <div className="eng-stat"><span className="muted">Open positions</span><b className="num">{d.totals.open}</b><small className="muted">{d.totals.closed} closed today</small></div>
              <div className={`eng-stat ${d.totals.against ? 'warn' : ''}`}><span className="muted">Against the plan</span><b className="num">{d.totals.against}</b><small className="muted">bets opposite to the Probable trade</small></div>
            </div>
          </section>
          <h3 className="pgroup-title">Open</h3>
          {d.open.length ? <div className="pos-grid">{d.open.map((r) => <Card key={r.exchange + r.symbol + r.product} r={r} />)}</div> : <p className="muted">No open positions.</p>}
          {d.closed.length > 0 && (
            <>
              <h3 className="pgroup-title">Closed today</h3>
              <div className="pos-grid">{d.closed.map((r) => (
                <article key={r.exchange + r.symbol + r.product} className={`pos-card ${r.pnl >= 0 ? 'win' : 'loss'}`}>
                  <div className="pos-head"><div><b>{r.symbol}</b><span className="muted small-note"> {r.exchange} · {r.product || '—'}</span></div><b className={`num ${r.pnl >= 0 ? 'up' : 'dn'}`}>{money(r.pnl)}</b></div>
                </article>
              ))}</div>
            </>
          )}
          <p className="small-note muted">Updates every 10 seconds. Plans are rule-based and not a forecast.</p>
        </>
      )}
    </div>
  );
}
