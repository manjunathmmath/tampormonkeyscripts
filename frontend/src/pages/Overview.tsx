import { Gauge } from '../components/Gauge';
import { Stamp } from '../components/Stamp';
import { Info } from '../components/Info';
import { WinBars } from '../components/Charts';
import { asOfQuery, nf, signed, tone, tradingDayNow } from '../lib/format';
import { Card, Loading, useLive } from './DashboardPanels';

interface BO { up: number; dn: number; wtUp: number | null; wtDn: number | null }
interface Group { key: string; label: string; lead: 'leading' | 'lagging'; sum: number; cap: number }
interface StripRow { name: string; remark: string | null; dir: number; vwap: number | null; fut: number | null; premium: number | null; premiumPct: number | null }
interface Ov {
  market: { adCounts: Record<'all' | 'nifty' | 'bank', { a: number; d: number; n: number; net: number }>; adWeighted: { nifty: { up: number; dn: number } | null; bank: { up: number; dn: number } | null }; breakout: { nifty: BO; bank: BO; all: { up: number; dn: number } }; score: number; leading: number; signal: string; reason: string; includeLagging: boolean; breadth50: { up: number; dn: number }; coverage?: { adStocks: number; adUniverse: number }; skipped?: number };
  scoreboard: { groups: Group[]; total: number; leading: number; dir: number; confidence: number; dominant: { label: string; share: number } | null };
  strip: StripRow[];
  accuracy: { rows: { remark: string; samples: number; winRate: number; avgPts: number }[]; names: string[] };
}

const useOverview = () => useLive<Ov>(`/overview?day=${tradingDayNow()}${asOfQuery()}`, 300000);
const callTone = (c: string): string => (/BUY|LONG/.test(c) ? 'up' : /SELL|SHORT/.test(c) ? 'dn' : 'flat');
const remarkTone = (d: number): string => (d > 0 ? 'up' : d < 0 ? 'dn' : 'flat');

/** The composite score with its signal, the Range Scoreboard (the score split into its groups) and the breadth of the 50. */
export function ScoreHero() {
  const { data: o, err, at, changedAt } = useOverview();
  if (!o) return <Card at={at} changedAt={changedAt} title="Market score"><Loading what="the market (the first read of the day can take a few minutes)" err={err} /></Card>;
  const { market: m, scoreboard: s } = o;
  const breadth = m.breadth50.up + m.breadth50.dn;
  const upPct = breadth ? Math.round((m.breadth50.up / breadth) * 100) : 0;
  return (
    <section className="score-hero" aria-label="Market score">
      <Stamp at={at} changedAt={changedAt} />
      <div className="sh-gauge">
        <Gauge value={m.score} label={m.signal} />
        <div className="sh-num num">{signed(m.score, 2)}</div>
        <span className="sh-cap muted">{m.includeLagging ? 'leading + lagging signals' : 'leading signals only'} · leading {signed(m.leading, 2)}</span>
      </div>
      <div className="sh-verdict">
        <span className="fh-name">Market verdict</span>
        <span className={`call big ${callTone(m.signal)}`}>{m.signal}</span>
        <p className="small-note">{m.reason}</p>
        <div className="sh-breadth" title="NIFTY 50 stocks above and below their previous close">
          <span className="muted">NIFTY 50 stocks</span>
          <div className="prob-bar"><i className="up" style={{ width: `${upPct}%` }} /></div>
          <b className="num">{m.breadth50.up} up · {m.breadth50.dn} down</b>
        </div>
      </div>
      <div className="sh-board">
        <div className="card-head"><h3>Range scoreboard</h3><Info k="Range scoreboard" /><span className="muted num">confidence {s.confidence}%</span></div>
        <ul className="board">
          {s.groups.map((g) => {
            const w = Math.min(100, (Math.abs(g.sum) / g.cap) * 100);
            return (
              <li key={g.key} className={g.lead}>
                <span className="b-label">{g.label}{g.lead === 'lagging' ? <small>lagging</small> : null}</span>
                <span className="b-track"><i className={g.sum >= 0 ? 'up' : 'dn'} style={{ width: `${w / 2}%`, [g.sum >= 0 ? 'left' : 'right']: '50%' }} /></span>
                <b className={`num ${tone(g.sum)}`}>{signed(g.sum, 1)}</b>
              </li>
            );
          })}
        </ul>
        {s.dominant && <p className="small-note warn-note">One-sided: {s.dominant.label} is {s.dominant.share}% of this score.</p>}
      </div>
    </section>
  );
}

/** The index futures read with its VWAP and premium over spot. */
export function FuturesStrip() {
  const { data: o, at, changedAt } = useOverview();
  if (!o) return null;
  return (
    <section className="fut-strip" aria-label="Futures">
      <Stamp at={at} changedAt={changedAt} />
      {o.strip.map((r) => (
        <div key={r.name} className="fs-item">
          <b>{r.name}</b>
          <span className={`fs-remark ${remarkTone(r.dir)}`}>{r.remark ? r.remark.replace(/_/g, ' ') : '—'}</span>
          <span className="muted num">VWAP {r.vwap ? nf(r.vwap) : '—'}</span>
          <span className="muted num">PREM {r.premium == null ? '—' : `${signed(r.premium, 1)} (${signed(r.premiumPct ?? 0, 2)}%)`}</span>
        </div>
      ))}
    </section>
  );
}

/** How often each futures remark was followed by a move its way, replayed over today's 5-minute candles of five names. */
export function FuturesAccuracy() {
  const { data: o, err, at, changedAt } = useOverview();
  return (
    <Card at={at} changedAt={changedAt} title="Futures accuracy" sub={o ? `${o.accuracy.names.length} names, today's candles` : undefined}>
      {!o ? (
        <Loading what="the accuracy" err={err} />
      ) : o.accuracy.rows.length === 0 ? (
        <p className="muted">No remarks to score yet today.</p>
      ) : (
        <>
          <WinBars
            rows={o.accuracy.rows.map((r) => ({
              key: r.remark,
              label: r.remark.replace(/_/g, ' '),
              pct: r.winRate,
              dim: r.samples < 8,
              sub: `${r.samples} samples · avg ${signed(r.avgPts, 1)} pts per 5-min`,
            }))}
          />
          <p className="small-note">A higher win rate and positive average points mean the remark is more reliable. Rows with fewer than 8 samples are dimmed: too few to trust.</p>
        </>
      )}
    </Card>
  );
}

/** The breadth of the market in numbers: how the 9:15 candles closed and how many stocks are above their ASO or below their BSO, by index. */
export function BreadthCard() {
  const { data: o, err, at, changedAt } = useOverview();
  if (!o) return <Card at={at} changedAt={changedAt} title="Breadth"><Loading what="the breadth" err={err} /></Card>;
  const m = o.market;
  const rows: { key: string; label: string; bo: { up: number; dn: number; wtUp?: number | null; wtDn?: number | null }; ad: { a: number; d: number; n: number; net: number }; wt: { up: number; dn: number } | null }[] = [
    { key: 'n', label: 'NIFTY 50', bo: m.breakout.nifty, ad: m.adCounts.nifty, wt: m.adWeighted.nifty },
    { key: 'b', label: 'BANK NIFTY', bo: m.breakout.bank, ad: m.adCounts.bank, wt: m.adWeighted.bank },
    { key: 'a', label: 'All F&O', bo: m.breakout.all, ad: m.adCounts.all, wt: null },
  ];
  return (
    <Card at={at} changedAt={changedAt} title="Breadth" sub="9:15 closes and advance / decline">
      {m.coverage && m.coverage.adUniverse > 0 && m.coverage.adStocks < m.coverage.adUniverse * 0.8 && (
        <p className="small-note warn-note">Only {m.coverage.adStocks} of {m.coverage.adUniverse} stocks could be read{m.skipped ? ` (${m.skipped} failed)` : ''}, so the advance / decline counts and the score below are incomplete. Check that the Kite login is valid on System, then press Refresh.</p>
      )}
      <div className="tablewrap">
        <table className="tbl bt">
          <thead><tr><th>Universe</th><th>9:15 closes</th><th>Advance / decline now</th><th>Share of weight up</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td><b>{r.label}</b></td>
                <td className="num"><span className="up">{r.bo.up} ▲</span> / <span className="dn">{r.bo.dn} ▼</span>{r.bo.wtUp != null && <span className="muted"> · wt {r.bo.wtUp}% ▲ {r.bo.wtDn}% ▼</span>}</td>
                <td className="num"><span className="up">A:{r.ad.a}</span> <span className="dn">D:{r.ad.d}</span> N:{r.ad.n} <b className={tone(r.ad.net)}>({signed(r.ad.net, 0)})</b></td>
                <td className="num">{r.wt ? <span><span className="up">{r.wt.up}% ▲</span> <span className="dn">{r.wt.dn}% ▼</span></span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small-note">A stock counts as an advance at or above its own ASO and a decline at or below its BSO. The weight share is how much of the index weight is up against down versus the previous close.</p>
    </Card>
  );
}
