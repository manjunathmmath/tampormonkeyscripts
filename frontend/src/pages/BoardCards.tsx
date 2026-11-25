import { useState } from 'react';
import { Gauge } from '../components/Gauge';
import { asOfQuery, signed, tradingDayNow } from '../lib/format';
import { Card, Loading, useLive } from './DashboardPanels';

interface Sig { key: string; label: string; dir: 'bull' | 'bear' | 'neutral'; weight: number; strength: number; value: string }
export interface TrendRow { name: string; signals: Sig[]; vix: { label: string; value: number; modifier: number }; bullPct: number; bearPct: number; confidence: number; verdict: string }
export interface WtcData { index: string; netScore: number; label: string; rows: { name: string; weight: number; score: number }[]; totalW: number }
export interface SqueezeRow { name: string; active: boolean; type: string; remark: string | null; setup: number | null; daysToExpiry: number | null; pcr: number | null; extreme: boolean; watch: { willBe: string; streak: number; badge: string } | null; note: string }
export interface BoardsLite { trend: TrendRow[]; wtc: WtcData[]; squeeze: SqueezeRow[] }

export const useBoards = () => useLive<BoardsLite>(`/boards?day=${tradingDayNow()}${asOfQuery()}`, 300000);
const dirTone = (d: string): string => (d === 'bull' ? 'up' : d === 'bear' ? 'dn' : 'flat');

/** How strongly four signals (9:15, futures, OI/OBV, composite) agree, pulled towards 50% when volatility is high. Not a measured probability. */
export function TrendProbCard() {
  const { data: b, err, at, changedAt } = useBoards();
  const [sel, setSel] = useState('NIFTY 50');
  const t = b?.trend.find((x) => x.name === sel) ?? b?.trend[0];
  return (
    <Card at={at} changedAt={changedAt} title="Trend probability" sub={t ? t.verdict : undefined}>
      {!b ? (
        <Loading what="the trend probability" err={err} />
      ) : !t ? (
        <p className="muted">Not available yet.</p>
      ) : (
        <>
          <div className="chips" role="tablist" aria-label="Index">
            {b.trend.map((x) => <button key={x.name} role="tab" aria-selected={t.name === x.name} className={`chip sm ${t.name === x.name ? 'on' : ''}`} onClick={() => setSel(x.name)}>{x.name}</button>)}
          </div>
          <div className="tp-stack">
            <div className="tp-gauge"><Gauge value={(t.bullPct - 50) * 0.8} label={t.verdict} /></div>
            <span className={`call big ${t.bullPct >= 52 ? 'up' : t.bullPct <= 48 ? 'dn' : 'flat'}`}>{t.verdict}</span>
            <div className="tp-split" role="img" aria-label={`${t.bullPct}% bull, ${t.bearPct}% bear`}>
              <div className="tp-bar"><i className="up" style={{ width: `${t.bullPct}%` }} /><i className="dn" style={{ width: `${t.bearPct}%` }} /></div>
              <div className="tp-bl num"><span className="up">{t.bullPct}% bull</span><span className="dn">{t.bearPct}% bear</span></div>
            </div>
            <div className="tp-facts">
              <span className="tp-fact" title="How many of the signals agree, out of 100"><small>Confidence</small><b className="num">{t.confidence}</b><i className="tp-meter"><u style={{ width: `${t.confidence}%` }} /></i></span>
              <span className="tp-fact" title="A high volatility reading pulls the result towards 50%"><small>{t.vix.label}</small><b className="num">{t.vix.value ? t.vix.value.toFixed(1) : '—'}</b><em className="muted num">×{t.vix.modifier.toFixed(2)}</em></span>
            </div>
          </div>
          <ul className="tp-sigs">
            {t.signals.map((s) => (
              <li key={s.key}>
                <span>{s.label}</span>
                <span className="db-track" aria-hidden="true"><i className={s.dir === 'bull' ? 'up' : s.dir === 'bear' ? 'dn' : ''} style={{ width: `${s.dir === 'neutral' ? 4 : Math.max(8, s.strength * 50)}%`, [s.dir === 'bear' ? 'right' : 'left']: '50%' }} /></span>
                <b className={dirTone(s.dir)}>{s.dir === 'bull' ? '▲' : s.dir === 'bear' ? '▼' : '●'} {String(s.value).replace('NO CLEAR SIGNAL', 'no signal')}</b>
              </li>
            ))}
          </ul>
          <p className="small-note">The 9:15 signal reads only ASO and BSO closes as a direction (an AST or BST close counts neutral), as the old gauge did. A high volatility reading pulls the result towards 50%.</p>
        </>
      )}
    </Card>
  );
}

/** The weight-averaged score of an index's heaviest stocks: do the stocks that carry the index confirm its move? */
export function WtcCards() {
  const { data: b, err, at, changedAt } = useBoards();
  return (
    <Card at={at} changedAt={changedAt} title="Weighted trend confirmation" sub="heaviest stocks of each index">
      {!b ? (
        <Loading what="the weighted trend" err={err} />
      ) : (
        <div className="wtc-grid">
          {b.wtc.map((w) => {
            const bull = Math.max(0, Math.min(100, 50 + w.netScore * 5));
            const t = w.netScore > 4 ? 'up' : w.netScore < -4 ? 'dn' : 'flat';
            return (
              <div key={w.index} className="wtc">
                <div className="wtc-head"><b>{w.index}</b><span className={`${t} num`}>{signed(w.netScore, 2)}</span></div>
                <div className={`call ${t}`}>{w.label}</div>
                <div className="conf-bar"><i className="up" style={{ width: `${bull}%` }} /><i className="dn" style={{ width: `${100 - bull}%` }} /></div>
                <p className="small-note">{w.rows.length} components, {w.totalW.toFixed(0)}% of the index weight. Top drivers:</p>
                <ul className="tt-list">
                  {w.rows.slice(0, 4).map((r) => <li key={r.name} className={r.score >= 0 ? 'up' : 'dn'}><b>{r.name}</b><span className="muted num">{r.weight.toFixed(1)}%</span><span className="num">{signed(r.score, 2)}</span><span /></li>)}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** Every name with an active short covering / long unwinding, or a build-up that could become one. */
export function SqueezeBoard({ rows }: { rows: SqueezeRow[] }) {
  if (rows.length === 0) return <p className="muted">No name has an active squeeze or a building watch right now.</p>;
  const active = rows.filter((r) => r.active);
  const watch = rows.filter((r) => !r.active);
  const row = (r: SqueezeRow) => (
    <li key={r.name} className={`sq-row ${r.type === 'SHORT_COVERING' ? 'sc' : 'lu'}`}>
      <div className="sq-top">
        <a href={`#/instrument/${encodeURIComponent(r.name)}`}><b>{r.name}</b></a>
        {r.active ? <span className="tag dn">{r.type === 'SHORT_COVERING' ? 'SHORT COVERING' : 'LONG UNWINDING'}</span> : <span className="tag flat">{r.watch?.willBe ?? 'WATCH'}</span>}
        {r.setup != null && <span className="muted num">setup {r.setup}</span>}
        {r.daysToExpiry != null && <span className="muted">{r.daysToExpiry}d to expiry</span>}
      </div>
      <p className="small-note">{r.active ? `${r.type === 'SHORT_COVERING' ? 'Exit shorts and puts' : 'Exit longs and calls'}${r.pcr != null ? ` · PCR ${r.pcr}` : ''}${r.extreme ? ' · one-sided positioning' : ''}.` : `${r.watch?.streak ?? 0} same-direction futures readings in a row: ${r.watch?.badge ?? ''}. Not a squeeze yet.`}</p>
    </li>
  );
  return (
    <div className="board-groups">
      {active.length > 0 && <section className="bg-group"><h4 className="dn">Active <small>{active.length}</small></h4><ul className="sq-list">{active.map(row)}</ul></section>}
      {watch.length > 0 && <section className="bg-group"><h4>Pre-squeeze watch <small>{watch.length}</small></h4><ul className="sq-list">{watch.map(row)}</ul></section>}
      <p className="small-note">The setup number is a hand-weighted ranking (expiry, one-sided positioning, the remark's accuracy), not a probability. The watch only means a same-direction streak; many streaks never become a squeeze.</p>
    </div>
  );
}
