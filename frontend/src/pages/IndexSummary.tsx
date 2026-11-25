import { asOfQuery, nf, signed, tone, tradingDayNow } from '../lib/format';
import { Card, useLive } from './DashboardPanels';
import { DivBars } from '../components/Charts';

interface Row { name: string; chg: number; ltp: number; score: number | null; zone: string | null }
interface Str { rows: Row[]; strongest: Row | null; weakest: Row | null; spread: number | null }
interface FV { call: string; headline: string; conf: string | null }

const NAMES = ['NIFTY 50', 'NIFTY BANK', 'SENSEX'];
const callTone = (c: string): string => (c.startsWith('LONG') ? 'up' : c.startsWith('SHORT') ? 'dn' : 'flat');

function One({ name, row, strongest, weakest }: { name: string; row?: Row; strongest: boolean; weakest: boolean }) {
  const { data: v } = useLive<FV>(`/finalverdict?name=${encodeURIComponent(name)}&day=${tradingDayNow()}${asOfQuery()}`, 300000);
  return (
    <a className="is-card" href={`#/instrument/${encodeURIComponent(name)}`}>
      <div className="is-top">
        <b>{name}</b>
        {strongest && <span className="tag up">STRONGEST</span>}
        {weakest && <span className="tag dn">WEAKEST</span>}
        {row?.zone && <span className="pill">9:15 {row.zone}</span>}
      </div>
      <div className="is-px num">{row ? nf(row.ltp) : '—'} {row && <span className={`is-chg ${tone(row.chg)}`}>{signed(row.chg)}%</span>}</div>
      <div className="is-call">
        {v ? <span className={`call ${callTone(v.call)}`}>{v.call}</span> : <span className="muted">reading…</span>}
        {row?.score != null && <span className={`num score-chip ${tone(row.score)}`}>score {signed(row.score, 1)}</span>}
      </div>
      {v && <p className="small-note">{v.headline}</p>}
      <span className="is-more">Open the full read →</span>
    </a>
  );
}

/** One compact card per index: price, the call and the score. The full set of cards for an index lives on its own page, not here. */
export function IndexSummary() {
  const { data: s } = useLive<Str>(`/strength?day=${tradingDayNow()}${asOfQuery()}`, 120000);
  return (
    <Card title="Indices" sub={s?.spread != null ? `${s.strongest?.name} leads ${s.weakest?.name} by ${s.spread.toFixed(2)} points` : undefined}>
      <div className="is-grid">
        {NAMES.map((n) => <One key={n} name={n} row={s?.rows.find((r) => r.name === n)} strongest={s?.strongest?.name === n} weakest={s?.weakest?.name === n} />)}
      </div>
      {s && s.rows.length > 3 && (
        <>
          <h4 className="is-sub">All indices, strongest to weakest today</h4>
          <DivBars dec={2} unit="%" rows={[...s.rows].sort((a, b) => b.chg - a.chg).map((r) => ({ key: r.name, label: r.name, value: r.chg, right: r.zone ? `9:15 ${r.zone}${r.score != null ? ` · score ${signed(r.score, 1)}` : ''}` : undefined }))} />
        </>
      )}
    </Card>
  );
}
