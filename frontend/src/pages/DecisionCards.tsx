import { useState } from 'react';
import { Info } from '../components/Info';
import { api, type ScanState } from '../api';
import { nf, signed, tone, tradingDayNow, asOfQuery } from '../lib/format';
import { Card, Loading, q, useLive } from './DashboardPanels';
import { useOnDemand } from '../lib/refresh';

interface Check { ok: boolean | null; confirmed?: boolean; text?: string }
interface Side {
  side: 'support' | 'resistance';
  decision: { action: string; title: string; why: string[]; level: number; spot: number } | null;
  tally: { conf: number; total: number } | null;
  checks: Check[];
}
interface LD { levels: { aso: number; ast: number; bso: number; bst: number }; support: Side; resistance: Side }

const actTone = (a: string): string => (a === 'AT_LEVEL' || a === 'TREND' ? 'up' : a === 'SKIP' ? 'dn' : 'flat');
const clean = (s: string): string => s;

function SideBox({ s, label, level }: { s: Side; label: string; level: number }) {
  const [open, setOpen] = useState(false);
  const d = s.decision;
  const pct = s.tally && s.tally.total ? Math.round((s.tally.conf / s.tally.total) * 100) : 0;
  return (
    <div className="ld-side">
      <div className="ld-head"><b>{label}</b><span className="muted num">at {nf(level)}</span></div>
      {d ? <div className={`ld-act ${actTone(d.action)}`}>{clean(d.title)}</div> : <p className="muted">No decision yet.</p>}
      {s.tally && (
        <div className="ld-tally" title="Level Confirmation checks that agree">
          <div className="prob-bar"><i className={pct >= 75 ? 'up' : pct >= 50 ? 'flat' : 'dn'} style={{ width: `${pct}%` }} /></div>
          <b className="num">{s.tally.conf}/{s.tally.total}</b>
        </div>
      )}
      {d && d.why.length > 0 && <ul className="ld-why">{d.why.slice(0, 3).map((w, i) => <li key={i}>{clean(w)}</li>)}</ul>}
      {s.checks.length > 0 && (
        <>
          <button className="link-btn" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} the {s.checks.length} checks</button>
          {open && <ul className="ld-checks">{s.checks.map((c, i) => <li key={i} className={c.confirmed ? 'up' : 'dn'}>{c.confirmed ? '✓' : '✗'} {clean(c.text ?? (c.confirmed ? 'confirmed' : 'not confirmed'))}</li>)}</ul>}
        </>
      )}
    </div>
  );
}

/** Level Confirmation and Level Decision: for the 9:15 entry level on each side (buy at BSO, sell at ASO), does the evidence back it, and what to do now. */
export function LevelDecisionCard({ name }: { name: string }) {
  const { data: d, err, at, changedAt } = useLive<LD>(`/leveldecision?${q(name)}`, 300000);
  return (
    <Card at={at} changedAt={changedAt} title="Level decision" sub={d ? `ASO ${nf(d.levels.aso)} · BSO ${nf(d.levels.bso)}` : undefined}>
      {!d ? (
        <Loading what="the level decision" err={err} />
      ) : (
        <div className="ld-grid">
          <SideBox s={d.support} label="Buy at BSO" level={d.levels.bso} />
          <SideBox s={d.resistance} label="Sell at ASO" level={d.levels.aso} />
        </div>
      )}
    </Card>
  );
}

interface Fut { remark: string; dir: number; vwapPrice: number; symbol: string; expiry: string; quote: { close: number; oi?: number }; prev: { close: number; oi?: number }; signals: { aboveVwap: boolean; upCandles: number; downCandles: number; nCandles: number; intradayOiPct: number }; pChange: number }

/** The futures read of one name: the remark, why it was given, price against VWAP and the open interest change. */
export function FuturesCard({ name }: { name: string }) {
  const { data: f, err, at, changedAt } = useLive<Fut>(`/futures?${q(name)}`, 300000);
  const t = f ? (f.dir > 0 ? 'up' : f.dir < 0 ? 'dn' : 'flat') : 'flat';
  return (
    <Card at={at} changedAt={changedAt} title="Futures" sub={f ? `${f.symbol} · expires ${f.expiry}` : undefined}>
      {!f ? (
        <Loading what="the futures" err={err} />
      ) : (
        <>
          <div className="sum"><span className={`call big ${t}`}>{f.remark.replace(/_/g, ' ')}</span></div>
          <p className="small-note">
            Price {f.signals.aboveVwap ? 'above' : 'below'} VWAP ({nf(f.vwapPrice)}) · {f.signals.upCandles} up / {f.signals.downCandles} down of the last {f.signals.nCandles} candles · OI {signed(f.signals.intradayOiPct, 1)}% today · day {signed(f.pChange, 2)}%
          </p>
          <div className="stat-row num"><span><em>Last</em>{nf(f.quote.close)}</span><span><em>Prev close</em>{nf(f.prev.close)}</span><span className={tone(f.quote.close - f.prev.close)}><em>Change</em>{signed(f.quote.close - f.prev.close)}</span></div>
        </>
      )}
    </Card>
  );
}

const ZONES = ['AST', 'ASO', 'B/W', 'BSO', 'BST'] as const;

/** Where every scanned name's 9:15 candle closed, as counts and a bar: the breadth of the open. */
export function BreakoutStrip() {
  const [scan, setScan] = useState<ScanState | null>(null);
  const day = tradingDayNow();
  useOnDemand(async () => {
    setScan(await api<ScanState>(`/scan915?day=${day}${asOfQuery()}`).catch(() => null));
  }, [day]);
  const counts: Record<string, number> = { AST: 0, ASO: 0, 'B/W': 0, BSO: 0, BST: 0 };
  Object.values(scan?.items ?? {}).forEach((i) => (counts[i.zone] = (counts[i.zone] ?? 0) + 1));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!scan || total === 0) return null;
  const bull = counts.AST! * 2 + counts.ASO!;
  const bear = counts.BST! * 2 + counts.BSO!;
  const ratio = bull + bear ? (bull - bear) / (bull + bear) : 0;
  return (
    <section className="card" aria-label="9:15 breakout">
      <div className="card-head"><h2>9:15 breakout</h2><Info k="9:15 breakout" /><span className={`call ${ratio > 0.1 ? 'up' : ratio < -0.1 ? 'dn' : 'flat'}`}>{ratio > 0.1 ? 'Bullish open' : ratio < -0.1 ? 'Bearish open' : 'Balanced open'} · {signed(ratio, 2)}</span></div>
      <div className="zonebar" role="img" aria-label={ZONES.map((z) => `${z} ${counts[z]}`).join(', ')}>
        {ZONES.map((z) => (counts[z] ? <i key={z} className={`zb z-${z.replace('/', '')}`} style={{ flexGrow: counts[z] }} /> : null))}
      </div>
      <div className="zonelegend">{ZONES.map((z) => <span key={z}><i className={`zb z-${z.replace('/', '')}`} />{z} <b className="num">{counts[z]}</b></span>)}</div>
      <p className="small-note">Weighted ratio of bullish against bearish 9:15 closes across {total} names (AST and BST count double).</p>
    </section>
  );
}
