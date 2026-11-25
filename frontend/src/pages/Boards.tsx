import { Fragment, useState } from 'react';
import { asOfQuery, nf, signed, tone, tradingDayNow } from '../lib/format';
import { Card, Loading, useLive } from './DashboardPanels';
import { OiButterfly } from '../components/Charts';
import { SqueezeBoard, type SqueezeRow } from './BoardCards';

interface SigRow { name: string; kind: string; trend: string; strategy: string | null; agreement: { agree: number; total: number; pct: number; label: string } | null; timing: { pct: number; label: string } | null; why: string | null }
interface ConsRow { name: string; outcome: string; net: number; agree: number; voting: number; thin: boolean }
interface LpRow { name: string; pASO: number | null; pAST: number | null; pVIXU: number | null; pBSO: number | null; pBST: number | null; pVIXL: number | null; lean: number }
interface OiRow { rows?: { strike: number; atm: boolean; ce: number; pe: number; obvCE: number | null; obvPE: number | null; score: number }[]; name: string; ltp: number; oiScore: number; pcr: number | null; cells: { strike: number; score: number; atm: boolean }[] }
interface MpRow { name: string; spot: number; maxPain: number; dist: number; pct: number; netGEX: number; regime: string; flips: number[]; outcome: string }
interface Boards { squeeze: SqueezeRow[]; signals: SigRow[]; consensus: ConsRow[]; levelProb: LpRow[]; oi: OiRow[]; maxPain: MpRow[] }

const TABS = [['signals', 'Signals'], ['oi', 'OI heatmap'], ['maxpain', 'Max pain'], ['consensus', 'Consensus'], ['levels', 'Level odds'], ['squeeze', 'Squeeze']] as const;
type Tab = (typeof TABS)[number][0];

const pctTone = (p: number, good: number, bad: number): string => (p >= good ? 'up' : p <= bad ? 'dn' : 'flat');
const gexFmt = (v: number): string => {
  const a = Math.abs(v);
  return `${v >= 0 ? '+' : '−'}${a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : a.toFixed(0)}`;
};
const cellStyle = (s: number): { background: string } => ({ background: s === 0 ? 'var(--surface2)' : `color-mix(in srgb, ${s > 0 ? 'var(--up)' : 'var(--dn)'} ${Math.min(70, 18 + Math.abs(s) * 16)}%, var(--surface))` });

function SignalsTab({ rows }: { rows: SigRow[] }) {
  const group = (r: SigRow): string => (r.trend === 'No pick' ? 'No pick' : r.trend.includes('weak') ? 'Weak lean' : r.trend);
  const order = ['Bullish', 'Bearish', 'Range-bound', 'Weak lean', 'No pick'];
  return (
    <div className="board-groups">
      {order.map((g) => {
        const list = rows.filter((r) => group(r) === g);
        if (!list.length) return null;
        return (
          <section key={g} className="bg-group">
            <h4 className={g === 'Bullish' ? 'up' : g === 'Bearish' ? 'dn' : ''}>{g} <small>{list.length} of {rows.length}</small></h4>
            <div className="tablewrap">
              <table className="tbl bt">
                <thead><tr><th>Name</th><th>Strategy</th><th>Agreement</th><th>Entry timing</th></tr></thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.name} title={r.why ?? ''}>
                      <td><a href={`#/instrument/${encodeURIComponent(r.name)}`}><b>{r.name}</b></a>{r.kind === 'stock' && <a className="mini-link" href={`#/chart/${encodeURIComponent(r.name)}`}> chart</a>}</td>
                      <td>{r.strategy ? r.strategy.replace(/_/g, ' ') : '—'}</td>
                      <td>{r.agreement ? <span className={`bar-cell ${pctTone(r.agreement.pct, 65, 45)}`}><i style={{ width: `${r.agreement.pct}%` }} /><b className="num">{r.agreement.agree}/{r.agreement.total} · {r.agreement.pct}%</b></span> : '—'}</td>
                      <td>{r.timing ? <span className={`bar-cell ${pctTone(r.timing.pct, 70, 50)}`}><i style={{ width: `${r.timing.pct}%` }} /><b className="num">{r.timing.pct}% {r.timing.label.toLowerCase()}</b></span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <p className="small-note">Strategy is the Option Strike Search suggestion; agreement is how many independent signals back it, timing is whether now is a good moment. Heuristic, not a probability of profit.</p>
    </div>
  );
}

function OiTab({ rows }: { rows: OiRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="tablewrap">
      <table className="tbl bt oim">
        <thead><tr><th>Name</th><th>OI score</th><th>PCR</th><th colSpan={5}>Strikes around the money (score of each)</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.name}>
              <tr className={open === r.name ? 'open-row' : ''}>
                <td><button className="link-btn" onClick={() => setOpen(open === r.name ? null : r.name)} aria-expanded={open === r.name}><b>{open === r.name ? '▾' : '▸'} {r.name}</b></button><div className="muted num">{nf(r.ltp)}</div></td>
                <td className={`num ${tone(r.oiScore)}`}>{signed(r.oiScore, 1)}</td>
                <td className={`num ${r.pcr != null && r.pcr > 1.3 ? 'up' : r.pcr != null && r.pcr < 0.7 ? 'dn' : ''}`}>{r.pcr ?? '—'}</td>
                {r.cells.map((c) => <td key={c.strike} className={`oim-cell${c.atm ? ' atm' : ''}`} style={cellStyle(c.score)}><span className="num">{c.strike}{c.atm ? '★' : ''}</span><b className="num">{signed(c.score, 1)}</b></td>)}
              </tr>
              {open === r.name && r.rows && (
                <tr>
                  <td colSpan={8}>
                    <div className="oi-full">
                      <div><h4>Open interest change by strike</h4><OiButterfly rows={r.rows.map((x) => ({ strike: x.strike, ce: x.ce, pe: x.pe, atm: x.atm }))} /></div>
                      <div><h4>Volume-weighted flow (OBV) by strike</h4><OiButterfly rows={r.rows.map((x) => ({ strike: x.strike, ce: Math.round((x.obvCE ?? 0) / 1000) / 10, pe: Math.round((x.obvPE ?? 0) / 1000) / 10, atm: x.atm }))} /></div>
                    </div>
                    <p className="small-note">Calls on the left (red), puts on the right (green). OBV is in lakhs of contracts-weighted volume, signed by price direction.</p>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MaxPainTab({ rows }: { rows: MpRow[] }) {
  return (
    <ul className="mp-list">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="mp-top">
            <b>{r.name}</b>
            <span className={`tag ${r.regime === 'Stabilising' ? 'up' : 'dn'}`}>{r.regime.toUpperCase()}</span>
            <span className="num muted">spot {nf(r.spot)}</span>
          </div>
          <div className="mp-stats num">
            <span><em>Max pain</em>{nf(r.maxPain)}</span>
            <span className={tone(r.dist)}><em>Distance</em>{signed(r.dist, 0)} ({signed(r.pct, 1)}%)</span>
            <span className={tone(r.netGEX)}><em>Net GEX</em>{gexFmt(r.netGEX)}</span>
            <span><em>Flip zones</em>{r.flips.length ? r.flips.join(', ') : '—'}</span>
          </div>
          <p className="small-note">{r.outcome}</p>
        </li>
      ))}
    </ul>
  );
}

function ConsensusTab({ rows }: { rows: ConsRow[] }) {
  const groups: [string, string][] = [['GO LONG', 'up'], ['GO SHORT', 'dn'], ['WAIT', 'flat']];
  return (
    <div className="board-groups">
      {groups.map(([g, t]) => {
        const list = rows.filter((r) => r.outcome === g);
        return (
          <section key={g} className="bg-group">
            <h4 className={t}>{g} <small>{list.length}</small></h4>
            {list.length === 0 ? <p className="muted">None.</p> : (
              <div className="chip-cloud">
                {list.map((r) => <a key={r.name} className={`cc ${t}`} href={`#/instrument/${encodeURIComponent(r.name)}`} title={`${r.agree} of ${r.voting} signal groups agree${r.thin ? ' (thin)' : ''}`}>{r.name} <b className="num">{signed(r.net, 2)}</b></a>)}
              </div>
            )}
          </section>
        );
      })}
      <p className="small-note">Master Consensus of each name from its independent signal groups. WAIT includes names with no clear direction and names held back by a dead zone.</p>
    </div>
  );
}

function LevelsTab({ rows }: { rows: LpRow[] }) {
  const up = rows.filter((r) => r.lean >= 0).sort((a, b) => b.lean - a.lean);
  const dn = rows.filter((r) => r.lean < 0).sort((a, b) => a.lean - b.lean);
  const cell = (v: number | null, up: boolean) => <td className={`num ${v == null ? '' : v >= 50 ? (up ? 'up' : 'dn') : ''}`}>{v == null ? '—' : `${v}%`}</td>;
  const block = (title: string, list: LpRow[]) => (
    <section className="bg-group">
      <h4>{title} <small>{list.length}</small></h4>
      <div className="tablewrap">
        <table className="tbl bt">
          <thead><tr><th>Name</th><th>ASO</th><th>AST</th><th>VIXU</th><th>BSO</th><th>BST</th><th>VIXL</th></tr></thead>
          <tbody>{list.map((r) => <tr key={r.name}><td><b>{r.name}</b></td>{cell(r.pASO, true)}{cell(r.pAST, true)}{cell(r.pVIXU, true)}{cell(r.pBSO, false)}{cell(r.pBST, false)}{cell(r.pVIXL, false)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
  return (
    <div className="board-groups">
      {block('ASO-leaning', up)}
      {block('BSO-leaning', dn)}
      <p className="small-note">A live-signal likelihood of reaching each level today, not a fitted probability. Green is the upside side, red the downside side, shown from 50%.</p>
    </div>
  );
}

/** The cross-instrument tables of the old dashboard, one tab each. Everything is read per name, so a name with no data is simply missing. */
export function Boards() {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return (localStorage.getItem('groot.boards') as Tab) || 'signals';
    } catch {
      return 'signals';
    }
  });
  const { data, err } = useLive<Boards>(`/boards?day=${tradingDayNow()}${asOfQuery()}`, 300000);
  const pick = (t: Tab): void => {
    setTab(t);
    try {
      localStorage.setItem('groot.boards', t);
    } catch {
      /* not remembered */
    }
  };
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Boards</h1>
          <p className="sub">The indices and the heaviest stocks side by side: signals, option flow, max pain, consensus and level odds</p>
        </div>
      </header>
      <div className="chips" role="tablist" aria-label="Board">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => pick(k)}>{l}</button>)}
      </div>
      <Card title={TABS.find((t) => t[0] === tab)![1]} sub={data ? `${tab === 'signals' ? data.signals.length : tab === 'oi' ? data.oi.length : tab === 'maxpain' ? data.maxPain.length : tab === 'consensus' ? data.consensus.length : tab === 'squeeze' ? data.squeeze.length : data.levelProb.length} names` : undefined}>
        {!data ? (
          <Loading what="the boards (the first read loads every name's option chain and can take a minute)" err={err} />
        ) : tab === 'signals' ? (
          <SignalsTab rows={data.signals} />
        ) : tab === 'oi' ? (
          <OiTab rows={data.oi} />
        ) : tab === 'maxpain' ? (
          <MaxPainTab rows={data.maxPain} />
        ) : tab === 'squeeze' ? (
          <SqueezeBoard rows={data.squeeze} />
        ) : tab === 'consensus' ? (
          <ConsensusTab rows={data.consensus} />
        ) : (
          <LevelsTab rows={data.levelProb} />
        )}
      </Card>
    </div>
  );
}
