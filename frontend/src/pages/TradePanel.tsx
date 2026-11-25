import { useState } from 'react';
import { DivBars, PlanRuler } from '../components/Charts';
import { asOfQuery, nf, nfi, signed, tone, tradingDayNow } from '../lib/format';
import { Card, Loading, useLive } from './DashboardPanels';

interface Exit { exit: boolean; reasons: string[] }
interface Panel {
  at: string;
  entry: { direction: 'LONG' | 'SHORT' | 'WAIT'; bullish: number; bearish: number; window: string; reasons: string[]; pcrWarning: string; pcr: number };
  now: { dir: 'LONG' | 'SHORT' | 'WAIT'; total: number; conf: number; subs: { label: string; value: number }[]; levels: { entry: number; stop: number; t1: number; t2: number } | null; triggered: boolean; option: string | null; avwap: { value: number; above: boolean | null } | null };
  pillars: { label: string; value: number }[];
  exit: { trend: number; n50Fut: number; bnFut: number; LONG: Exit; SHORT: Exit };
  top: { name: string; score: number; change: number; strong: boolean }[];
  indexDir: number;
  detail: { group: string; label: string; value: number }[];
  history: { t: string; score: number; leading: number; signal: string }[];
}

const usePanel = () => useLive<Panel>(`/panel?day=${tradingDayNow()}${asOfQuery()}`, 300000);
const dirTone = (d: string): string => (d === 'LONG' ? 'up' : d === 'SHORT' ? 'dn' : 'flat');
const winTone = (w: string): string => (w === 'PRIME' ? 'ok' : w === 'OK' ? 'ok' : w === 'AVOID' ? 'warn' : '');

function Position({ p }: { p: Panel }) {
  const [dir, setDir] = useState<'NONE' | 'LONG' | 'SHORT'>(() => {
    try {
      const v = localStorage.getItem('GTB_TRADE_DIR');
      return v === 'LONG' || v === 'SHORT' ? v : 'NONE';
    } catch {
      return 'NONE';
    }
  });
  const pick = (d: 'NONE' | 'LONG' | 'SHORT'): void => {
    setDir(d);
    try {
      localStorage.setItem('GTB_TRADE_DIR', d);
    } catch {
      /* not remembered */
    }
  };
  const ex = dir === 'NONE' ? null : p.exit[dir];
  return (
    <div className="pos">
      <div className="seg" role="group" aria-label="Your position">
        {(['NONE', 'LONG', 'SHORT'] as const).map((d) => (
          <button key={d} className={dir === d ? 'on' : ''} onClick={() => pick(d)}>{d === 'NONE' ? 'No position' : d}</button>
        ))}
      </div>
      {dir === 'NONE' ? (
        <p className="pos-banner hold">No position set. Pick LONG or SHORT to be told when to exit.</p>
      ) : ex?.exit ? (
        <p className={`pos-banner exit ${dir === 'LONG' ? 'l' : 's'}`} role="alert">EXIT {dir}: {ex.reasons.join(', ')}</p>
      ) : (
        <p className="pos-banner hold ok">HOLD {dir}: trend {signed(p.exit.trend, 0)} · N50 futures {p.exit.n50Fut} · BN futures {p.exit.bnFut}</p>
      )}
    </div>
  );
}

/** Entry / Trade, Now Trade and your position in one card: is there a setup, where would it be entered, and when to leave a position you hold. */
export function TradeNowCard() {
  const { data: p, err, at, changedAt } = usePanel();
  return (
    <Card at={at} changedAt={changedAt} title="Trade now" sub={p ? `NIFTY 50 · ${p.at}` : undefined}>
      {!p ? (
        <Loading what="the trade panel" err={err} />
      ) : (
        <div className="tn-grid">
          <section className="tn-box" aria-label="Entry confluence">
            <div className="tn-head"><b>Entry confluence</b><span className={`pill ${winTone(p.entry.window)}`}>{p.entry.window}</span></div>
            <div className={`call big ${dirTone(p.entry.direction)}`}>{p.entry.direction}</div>
            <div className="conf-bar" title={`${p.entry.bullish} bullish, ${p.entry.bearish} bearish of 5 pillars`}>
              <i className="up" style={{ width: `${(p.entry.bullish / 5) * 100}%` }} />
              <i className="dn" style={{ width: `${(p.entry.bearish / 5) * 100}%` }} />
            </div>
            <div className="chk-chips">{p.entry.reasons.map((r) => <span key={r} className={r.includes('↑') ? 'up' : 'dn'}>{r}</span>)}</div>
            {p.entry.window === 'AVOID' || p.entry.window === 'CLOSED' ? <p className="small-note warn-note">The {p.entry.window.toLowerCase()} window blocks entries whatever the pillars say.</p> : null}
            {p.entry.pcrWarning && <p className="small-note warn-note">{p.entry.pcrWarning}</p>}
          </section>
          <section className="tn-box" aria-label="Now trade">
            <div className="tn-head"><b>Now trade</b>{p.now.levels && <span className={`tag ${p.now.triggered ? 'up' : 'flat'}`}>{p.now.triggered ? 'TRIGGERED' : 'WAITING'}</span>}<span className="muted num">{p.now.dir === 'WAIT' ? '' : `${p.now.conf}/6`}</span></div>
            <div className={`call big ${dirTone(p.now.dir)}`}>{p.now.dir}</div>
            {p.now.levels ? (
              <>
                <PlanRuler stop={p.now.levels.stop} entry={p.now.levels.entry} t1={p.now.levels.t1} t2={p.now.levels.t2} spot={null} fmt={nfi} />
                <p className="small-note">Buy <b>{p.now.option}</b>. Entry {p.now.dir === 'LONG' ? 'above ASO' : 'below BSO'}, stop at {p.now.dir === 'LONG' ? 'BSO' : 'ASO'}, targets {p.now.dir === 'LONG' ? 'AST then VIXU' : 'BST then VIXL'}.{p.now.avwap ? ` AVWAP ${nf(p.now.avwap.value)} ${p.now.avwap.above == null ? '' : p.now.avwap.above ? '(price above)' : '(price below)'}.` : ''}</p>
              </>
            ) : (
              <p className="small-note">NIFTY 50 composite {signed(p.now.total, 1)}: no clear edge (needs ±3).</p>
            )}
            <div className="chk-chips">{p.now.subs.map((s) => <span key={s.label} className={s.value > 0 ? 'up' : s.value < 0 ? 'dn' : 'flat'}>{s.label} {s.value > 0 ? '▲' : s.value < 0 ? '▼' : '—'}</span>)}</div>
          </section>
          <section className="tn-box tn-pos" aria-label="Position">
            <div className="tn-head"><b>Your position</b></div>
            <Position p={p} />
          </section>
        </div>
      )}
    </Card>
  );
}

/** The eight pillars the entry call is built from, as bars. */
export function PillarsCard() {
  const { data: p, err, at, changedAt } = usePanel();
  return (
    <Card at={at} changedAt={changedAt} title="Pillars" sub="NIFTY 50 and BANK NIFTY">
      {!p ? <Loading what="the pillars" err={err} /> : <DivBars dec={1} rows={p.pillars.map((x) => ({ key: x.label, label: x.label, value: x.value }))} />}
    </Card>
  );
}

/** Stocks whose own score is strong and points the way of the index futures. */
export function TopTradesCard() {
  const { data: p, err, at, changedAt } = usePanel();
  return (
    <Card at={at} changedAt={changedAt} title="Top trades" sub={p ? (p.indexDir > 0 ? 'with bullish index futures' : p.indexDir < 0 ? 'with bearish index futures' : 'index futures neutral') : undefined}>
      {!p ? (
        <Loading what="the stocks" err={err} />
      ) : p.top.length === 0 ? (
        <p className="muted">No stock lines up with the index futures right now.</p>
      ) : (
        <ul className="tt-list">
          {p.top.map((t) => (
            <li key={t.name} className={t.score > 0 ? 'up' : 'dn'}>
              <a href={`#/chart/${encodeURIComponent(t.name)}`}><b>{t.name}</b></a>
              {t.strong && <span className="tag up">STRONG</span>}
              <span className={`num score-chip ${tone(t.score)}`}>{signed(t.score, 1)}</span>
              <span className={`num ${tone(t.change)}`}>{signed(t.change, 2)}%</span>
            </li>
          ))}
        </ul>
      )}
      <p className="small-note">Heaviest stocks of NIFTY 50 and BANK NIFTY. STRONG means a score of 3 or more either way. The old panel also filtered on volume against average; this one does not.</p>
    </Card>
  );
}

/** Every part of the composite score by instrument, then how the score moved through the day. */
export function ScoreDetailCard() {
  const { data: p, err, at, changedAt } = usePanel();
  const groups = p ? [...new Set(p.detail.map((d) => d.group))] : [];
  const h = p?.history ?? [];
  const W = 320;
  const H = 110;
  const vals = h.map((x) => x.score);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals, 1);
  const X = (i: number): number => (h.length < 2 ? W / 2 : (i / (h.length - 1)) * (W - 12) + 6);
  const Y = (v: number): number => 8 + (1 - (v - lo) / (hi - lo || 1)) * (H - 22);
  return (
    <Card at={at} changedAt={changedAt} title="Score through the day" sub={p ? `${h.length} reading${h.length === 1 ? '' : 's'}` : undefined}>
      {!p ? (
        <Loading what="the score history" err={err} />
      ) : (
        <>
          {h.length >= 2 ? (
            <svg className="hist" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Composite score by time">
              <line x1="0" x2={W} y1={Y(0)} y2={Y(0)} stroke="var(--muted)" strokeDasharray="3 3" />
              <path d={h.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(x.score).toFixed(1)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
              {h.map((x, i) => <circle key={x.t} cx={X(i)} cy={Y(x.score)} r="3" fill={x.score >= 0 ? 'var(--up)' : 'var(--dn)'}><title>{`${x.t}: ${x.score} (${x.signal})`}</title></circle>)}
              <text x="4" y={H - 2} className="pay-t">{h[0]!.t}</text>
              <text x={W - 4} y={H - 2} textAnchor="end" className="pay-t">{h[h.length - 1]!.t}</text>
            </svg>
          ) : (
            <p className="muted">One reading so far ({h[0] ? `${h[0].t}: ${signed(h[0].score, 2)}` : 'none'}). The history fills each time you refresh, or as you step through snapshot times.</p>
          )}
          <details className="more-nums">
            <summary>Score detail by instrument</summary>
            {groups.map((g) => (
              <div key={g} className="sd-group">
                <h4>{g}</h4>
                <DivBars dec={1} rows={p.detail.filter((d) => d.group === g).map((d) => ({ key: d.label, label: d.label, value: d.value }))} />
              </div>
            ))}
          </details>
          {h.length > 0 && (
            <details className="more-nums">
              <summary>Readings</summary>
              <table className="tbl num"><thead><tr><th>Time</th><th>Score</th><th>Leading</th><th>Signal</th></tr></thead>
                <tbody>{[...h].reverse().map((x) => <tr key={x.t}><td>{x.t}</td><td className={tone(x.score)}>{signed(x.score, 2)}</td><td className={tone(x.leading)}>{signed(x.leading, 2)}</td><td>{x.signal}</td></tr>)}</tbody>
              </table>
            </details>
          )}
        </>
      )}
    </Card>
  );
}
