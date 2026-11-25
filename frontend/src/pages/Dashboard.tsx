import { useState, type ReactNode } from 'react';
import { NextEvent } from './News';
import { Info } from '../components/Info';
import { DivBars, OiButterfly } from '../components/Charts';
import { api, type ConsensusResult, type LevelProbResult, type OiAnalysis, type ScoreResult } from '../api';
import { asOfQuery, dayFor, nf, nfi, signed, tone } from '../lib/format';
import { usePoll } from '../lib/hooks';
import { useOnDemand } from '../lib/refresh';
import { CommodityGlobalCard, CommodityLevelsCard, CommodityVerdictCard } from './CommodityCards';
import { PositionalCard } from './PositionalCard';
import { ScoreHero, FuturesStrip, FuturesAccuracy, BreadthCard } from './Overview';
import { PriceActionGrid } from './PriceAction';
import { IndexSummary } from './IndexSummary';
import { TrendProbCard, WtcCards } from './BoardCards';
import { TradeNowCard, PillarsCard, TopTradesCard, ScoreDetailCard } from './TradePanel';
import { BreakoutStrip, FuturesCard, LevelDecisionCard } from './DecisionCards';
import { FinalVerdictCard, LiveContextCard, PredictCard, OutlookCard, OutlookGroup, SignalsCard, SupportResistanceCard, MacroCard, FearGreedCard, WeightedCard, SqueezeCard, CurveCard, OrderFlowCard } from './DashboardPanels';

const NAMES = ['NIFTY 50', 'NIFTY BANK'] as const;
type Name = (typeof NAMES)[number];

interface DeadZoneBand {
  lo: number;
  hi: number;
  loName: string;
  hiName: string;
  text: string;
  broken: { dir: string; at: string } | null;
}
type Cons = ConsensusResult & { deadZoneBand: DeadZoneBand | null };

interface Data {
  cons: Cons | null;
  oi: OiAnalysis | null;
  lp: LevelProbResult | null;
  err: string | null;
}

const PARTS: [keyof ScoreResult['score'], string][] = [
  ['nine_fifteen', '9:15 zone'],
  ['current_trend', 'Price vs levels'],
  ['futures_trend', 'Futures'],
  ['oi_obv', 'OI / OBV'],
  ['max_pain', 'Max pain'],
  ['iv_skew', 'IV skew'],
];

/** One metric = one panel. A new metric is a new Panel in the list below. */
function Panel({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel card">
      <header className="panel-head">
        <h3>{title}</h3><Info k={title} />
        {sub && <span className="muted">{sub}</span>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

const Wait = ({ what }: { what: string }) => <p className="muted">Loading {what}…</p>;

function SummaryPanel({ c }: { c: Cons }) {
  const call = c.outcome;
  const t = call.includes('LONG') ? 'up' : call.includes('SHORT') ? 'dn' : 'flat';
  const px = c.score.trend;
  return (
    <Panel title="Summary" sub={c.score.zone ? `9:15 zone ${c.score.zone}` : undefined}>
      <div className="sum">
        <span className={`call big ${t}`}>{call}</span>
        {px && (
          <span className="num sum-px">
            {nf(px.ltp)} <small className={tone(Number(px.change))}>{signed(Number(px.change))}%</small>
          </span>
        )}
      </div>
      <p className="muted">
        score <b className={`num ${tone(c.score.score.total)}`}>{signed(c.score.score.total, 2)}</b> · {c.agree} of {c.voting} signal groups agree{c.thin ? ' (thin)' : ''}
      </p>
      {c.deadZoneBand && !c.deadZoneBand.broken && <p className="muted small-note">Dead zone: {c.deadZoneBand.text}</p>}
    </Panel>
  );
}

function ConsensusPanel({ c }: { c: Cons }) {
  return (
    <Panel title="Master consensus" sub={`net ${signed(c.net, 2)}`}>
      <DivBars
        dec={1}
        max={3}
        rows={c.rows.map((x) => ({ key: x.label, label: x.label, value: x.dir * x.weight, dim: !x.hasData || x.dir === 0, title: x.note ?? '' }))}
      />
      {c.unavailable.length > 0 && <p className="muted small-note">Not built yet (counted as no data): {c.unavailable.join(', ')}</p>}
    </Panel>
  );
}

function ScorePanel({ s }: { s: ScoreResult }) {
  return (
    <Panel title="Instrument score" sub={signed(s.score.total, 2)}>
      <DivBars
        dec={1}
        rows={PARTS.map(([k, label]) => ({ key: k, label, value: s.score[k], dim: s.missing.includes(k) }))}
      />
      {s.missing.length > 0 && <p className="muted small-note">Not readable: {s.missing.join(', ')}</p>}
      {s.futures && <p className="muted small-note">Futures remark: {s.futures.remark}</p>}
    </Panel>
  );
}

function ProbPanel({ p }: { p: LevelProbResult }) {
  const row = (label: string, v: number | null, cls: string) => (
    <div className="prob-row" key={label}>
      <span>{label}</span>
      <div className="prob-bar">
        <i className={cls} style={{ width: `${v ?? 0}%` }} />
      </div>
      <b className="num">{v ?? '—'}%</b>
    </div>
  );
  return (
    <Panel title="Level probability" sub={p.ok ? `lean ${signed(p.netDir, 2)}` : undefined}>
      {!p.ok ? (
        <p className="muted">Not enough data yet.</p>
      ) : (
        <>
          {row('ASO', p.pASO, 'up')}
          {row('AST', p.pAST, 'up')}
          {row('VIXU', p.pVIXU, 'up')}
          {row('BSO', p.pBSO, 'dn')}
          {row('BST', p.pBST, 'dn')}
          {row('VIXL', p.pVIXL, 'dn')}
          <p className="muted small-note">A live-signal likelihood of reaching each level today, not a fitted probability.</p>
        </>
      )}
    </Panel>
  );
}

function LevelsPanel({ s }: { s: ScoreResult }) {
  const l = s.trend?.levels;
  return (
    <Panel title="9:15 levels" sub={s.zone ?? undefined}>
      {!l ? (
        <p className="muted">Levels not available yet.</p>
      ) : (
        <div className="kv">
          <span>AST</span><b className="num up">{nf(l.ast)}</b>
          <span>ASO</span><b className="num up">{nf(l.aso)}</b>
          <span>Open</span><b className="num">{nf(s.trend!.open)}</b>
          <span>BSO</span><b className="num dn">{nf(l.bso)}</b>
          <span>BST</span><b className="num dn">{nf(l.bst)}</b>
          <span>Price flags</span><b>{s.trend!.trends.join(' ') || '—'}</b>
        </div>
      )}
    </Panel>
  );
}

function OptionsPanel({ o }: { o: OiAnalysis }) {
  return (
    <Panel title="Option chain" sub={o.expiry}>
      <div className="kv">
        <span>PCR / change PCR</span><b className="num">{o.pcr} / {o.chPcr}</b>
        <span>Max pain</span><b className="num">{o.maxPain ? nfi(o.maxPain.maxPainK) : '—'}</b>
        <span>ATM IV</span><b className="num">{o.atmIV != null ? o.atmIV.toFixed(1) : '—'}</b>
        {o.walls.resistance.map((x, i) => (
          <span key={`r${i}`} className="kvrow dn">Call wall R{i + 1}<b className="num">{nfi(x.strike)}</b></span>
        ))}
        {o.walls.support.map((x, i) => (
          <span key={`s${i}`} className="kvrow up">Put wall S{i + 1}<b className="num">{nfi(x.strike)}</b></span>
        ))}
      </div>
      <OiButterfly rows={o.rows.map((r) => ({ strike: Number(r.strike), ce: parseFloat(r.chgCE) || 0, pe: parseFloat(r.chgPE) || 0, atm: r.atm }))} />
    </Panel>
  );
}

function useIndexData(name: string): Data {
  const [d, setD] = useState<Data & { name: string | null }>({ name: null, cons: null, oi: null, lp: null, err: null });
  const day = dayFor(name);
  useOnDemand(async () => {
    const q = `name=${encodeURIComponent(name)}&day=${day}${asOfQuery()}`;
    try {
      const [cons, oi, lp] = await Promise.all([api<Cons>(`/consensus?${q}`), api<OiAnalysis>(`/oi?${q}`).catch(() => null), api<LevelProbResult>(`/levelprob?${q}`).catch(() => null)]);
      setD({ name, cons, oi, lp, err: null });
    } catch (e) {
      setD((x) => ({ ...x, name: x.name, err: e instanceof Error ? e.message : String(e) }));
    }
  }, [name, day]);
  return d.name === name ? d : { cons: null, oi: null, lp: null, err: d.err };
}

function Group({ title, first, children }: { title: string; first?: boolean; children: ReactNode }) {
  return (
    <section className={`pgroup${first ? ' first' : ''}`} aria-label={title}>
      <h3 className="pgroup-title">{title}</h3>
      <div className="pgrid">{children}</div>
    </section>
  );
}

export function IndexPanels({ name, commodity = false }: { name: string; commodity?: boolean }) {
  const d = useIndexData(name);
  return (
    <div className="panels">
      <h2 className="panels-title">
        {commodity ? 'Signals' : 'Detail'} <a className="link-chart" href={`#/chart/${encodeURIComponent(name)}`}>Open in Chart View</a>
      </h2>
      {d.err && <p className="banner err">{d.err}</p>}
      {commodity ? (
        <>
          <Group title="Decision" first>
            <OutlookCard name={name} />
            <CommodityVerdictCard name={name} />
          </Group>
          <Group title="Levels">
            <SupportResistanceCard name={name} />
            <CommodityLevelsCard name={name} />
            {d.lp && <ProbPanel p={d.lp} />}
            {d.oi && <OptionsPanel o={d.oi} />}
          </Group>
          <Group title="Signals and flow">
            <SignalsCard name={name} />
            <FuturesCard name={name} />
            <SqueezeCard name={name} />
            <CurveCard name={name} />
            <CommodityGlobalCard name={name} />
            <OrderFlowCard name={name} />
          </Group>
        </>
      ) : (
        <>
          <Group title="Decision" first>
            <div className="pfull"><FinalVerdictCard name={name} /></div>
            <OutlookCard name={name} />
            <LevelDecisionCard name={name} />
            <LiveContextCard name={name} />
          </Group>
          <Group title="Levels">
            <SupportResistanceCard name={name} />
            {d.cons && <LevelsPanel s={d.cons.score} />}
            {d.oi && <OptionsPanel o={d.oi} />}
          </Group>
          <Group title="Signals and flow">
            <SignalsCard name={name} />
            <FuturesCard name={name} />
            <SqueezeCard name={name} />
            <CurveCard name={name} />
            <OrderFlowCard name={name} />
            {d.lp && <ProbPanel p={d.lp} />}
          </Group>
        </>
      )}
      <Group title="Consensus and score">
        {d.cons ? <SummaryPanel c={d.cons} /> : !d.err && <Wait what={name} />}
        {d.cons && <ConsensusPanel c={d.cons} />}
        {d.cons && <ScorePanel s={d.cons.score} />}
      </Group>
    </div>
  );
}

const JUMPS: [string, string][] = [['dash-score', 'Score'], ['dash-trade', 'Trade now'], ['dash-breadth', 'Breadth'], ['dash-indices', 'Indices'], ['dash-lean', 'Lean'], ['dash-pillars', 'Pillars'], ['dash-rel', 'Reliability'], ['dash-pos', 'Positional']];
const OPEN_KEY = 'groot.dash.open';
const readOpen = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
};

/** A collapsible group of cards; the open state is remembered. */
function Fold({ id, title, children, dflt = true }: { id: string; title: string; children: React.ReactNode; dflt?: boolean }) {
  const [open, setOpen] = useState<boolean>(() => readOpen()[id] ?? dflt);
  return (
    <details id={id} className="pgroup fold" open={open} onToggle={(e) => {
      const o = (e.currentTarget as HTMLDetailsElement).open;
      setOpen(o);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify({ ...readOpen(), [id]: o }));
      } catch {
        /* not remembered */
      }
    }}>
      <summary className="pgroup-title">{title}</summary>
      {children}
    </details>
  );
}

/** The market-wide picture: the score and what it is made of, the three indices at a glance, price action, breadth, futures and the broad drivers. Each index's own detail is on its page. */
export function Dashboard() {
  const jump = (id: string): void => {
    const el = document.getElementById(id);
    if (el) {
      if (el instanceof HTMLDetailsElement) el.open = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  return (
    <div className="dash">
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">The market first: score, breadth, the trade, then the detail.</p>
        </div>
      </header>
      <NextEvent />
      <nav className="dash-jump" aria-label="Jump to">
        {JUMPS.map(([id, l]) => <button key={id} className="chip" onClick={() => jump(id)}>{l}</button>)}
      </nav>
      <div id="dash-score"><ScoreHero /></div>
      <div id="dash-trade" className="dash-stack">
        <TradeNowCard />
        <OutlookGroup names={['NIFTY 50', 'NIFTY BANK', 'SENSEX']} />
      </div>
      <div id="dash-breadth" className="dash-stack"><BreadthCard /><BreakoutStrip /></div>
      <FuturesStrip />
      <div id="dash-indices" className="dash-stack"><IndexSummary /><PriceActionGrid /></div>
      <Fold id="dash-lean" title="Lean and drivers">
        <div className="market-cards"><PredictCard /><TrendProbCard /><MacroCard /><FearGreedCard /></div>
      </Fold>
      <Fold id="dash-pillars" title="Pillars, stocks and score history">
        <div className="market-cards"><PillarsCard /><TopTradesCard /><ScoreDetailCard /></div>
      </Fold>
      <Fold id="dash-rel" title="Reliability and breadth">
        <div className="market-cards"><FuturesAccuracy /></div>
        <WtcCards />
        <WeightedCard />
      </Fold>
      <Fold id="dash-pos" title="Positional screener" dflt={false}>
        <PositionalCard />
      </Fold>
    </div>
  );
}
