import { OutlookCard } from './DashboardPanels';
import { Info } from '../components/Info';
import { Checklist } from './Checklist';
import { useState } from 'react';
import { Card, q, useLive } from './DashboardPanels';

type Tone = 'good' | 'warn' | 'bad' | 'none';
interface Row { key: string; n: number; title: string; tone: Tone; line: string; detail: string[] }
interface FocusRes {
  name: string; day: string; rows: Row[]; greens: number; judged: number; live: boolean;
  v: { call: string; headline: string; tone: Tone; conf: string | null; dir: number };
}

const KEY = 'groot.focus';
const BASE = ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'GOLDM', 'SILVERM', 'CRUDEOILM'];
const WORD: Record<Tone, string> = { good: 'Green', warn: 'Amber', bad: 'Red', none: 'n/a' };

/** Trade Focus: five gates for one name. Each is a traffic light and one sentence; click a row for the evidence. A green gate is not a trade instruction. */
/** The five gates and the verdict hero of one name: used by the Focus page and by the Chart View inspector. */
export function FocusBody({ name }: { name: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { data, err } = useLive<FocusRes>(`/focus?${q(name)}`, 60000);
  const sel = name;
  return (
    <>
      {err && <p className="banner err" role="alert">{err}</p>}
      {!data && !err && <p className="muted">Reading the gates for {sel}…</p>}
      {data && (
        <>
          <section className={`focus-hero ${data.v.tone}`} aria-label="Verdict">
            <div className="fh-call">
              <span className="fh-name">{data.name}{data.live ? '' : ' · not live'}</span>
              <span className="fh-word">{data.v.call}</span>
              {data.v.conf && <span className="fh-conf" title={`${data.v.conf} confidence`}>{[1, 2, 3].map((i) => <i key={i} className={i <= (data.v.conf === 'HIGH' ? 3 : data.v.conf === 'MEDIUM' ? 2 : 1) ? 'on' : ''} />)}<em>{data.v.conf}</em></span>}
            </div>
            <p className="fh-line">{data.v.headline}</p>
            <div className="fh-gates" aria-label={`${data.greens} of ${data.judged} gates green`}>
              {data.rows.map((r) => (
                <span key={r.key} className={`fh-pill ${r.tone}`} title={r.line}><span className={`gdot ${r.tone}`} />{({ tradeable: 'Today', direction: 'Direction', entry: 'Entry', risk: 'Risk', exit: 'Exit' } as Record<string, string>)[r.key] ?? r.title}</span>
              ))}
            </div>
          </section>
          <Card title="The five gates" sub="Click a row for the evidence">
            <ul className="gates">
              {data.rows.map((r) => (
                <li key={r.key} className={`gate ${r.tone}`}>
                  <button className="gate-head" aria-expanded={!!open[r.key]} onClick={() => setOpen((o) => ({ ...o, [r.key]: !o[r.key] }))}>
                    <span className={`gdot ${r.tone}`} aria-label={WORD[r.tone]} />
                    <b>{r.title}</b>
                    <span className="gate-line">{r.line}</span>
                  </button>
                  {open[r.key] && r.detail.length > 0 && (
                    <ul className="gate-detail">
                      {r.detail.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <p className="small-note">Rule-based and not back-tested. Risk is arithmetic on your capital and risk % in Settings; margin and brokerage are not included.</p>
          </Card>
        </>
      )}
    </>
  );
}

export function Focus() {
  const [sel, setSel] = useState<string>(() => {
    try {
      return localStorage.getItem(KEY) || 'NIFTY 50';
    } catch {
      return 'NIFTY 50';
    }
  });
  const [typed, setTyped] = useState('');
  const pick = (n: string): void => {
    setSel(n);
    try {
      localStorage.setItem(KEY, n);
    } catch {
      /* not remembered */
    }
  };
  const chips = BASE.includes(sel) ? BASE : [...BASE, sel];
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Trade Focus</h1>
          <p className="sub">Five questions before a trade: is today tradeable, which way, where and when to enter, how much is at risk, and when to get out. Reads only; it places nothing.</p>
        </div>
      </header>
      <div className="chips" role="tablist" aria-label="Instrument">
        {chips.map((n) => (
          <button key={n} role="tab" aria-selected={sel === n} className={`chip ${sel === n ? 'on' : ''}`} onClick={() => pick(n)}>{n}</button>
        ))}
        <form
          className="focus-search"
          onSubmit={(e) => {
            e.preventDefault();
            const v = typed.trim().toUpperCase();
            if (v) {
              pick(v);
              setTyped('');
            }
          }}
        >
          <input aria-label="Any F&O stock" placeholder="Any F&O stock" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </form>
      </div>
      <FocusBody name={sel} />
      <details className="pgroup fold" aria-label="Pre-trade checklist">
        <summary className="pgroup-title">Pre-trade checklist: seven questions before you enter</summary>
        <Checklist embedded />
      </details>
      <section className="pgroup" aria-label="Probable trade">
        <h3 className="pgroup-title">Probable trade from today's metrics <Info k="Probable trade" /></h3>
        <div className="market-cards"><OutlookCard name={sel} /></div>
      </section>
    </div>
  );
}
