import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Info } from '../components/Info';
import { Stamp } from '../components/Stamp';
import { inflightBegin, inflightEnd } from '../lib/inflight';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { DivBars, LevelLadder, PlanRuler, Ring } from '../components/Charts';
import { asOfQuery, dayFor, nf, nfi, signed, tone, tradingDayNow } from '../lib/format';
import { useRefresh } from '../lib/refresh';

/** Polls one endpoint; each panel has its own, so a slow one (the market read) never holds up the others. */
export function useLive<T>(path: string, ms = 60000, always = false): { data: T | null; err: string | null; at?: number; changedAt?: number } {
  const [s, setS] = useState<{ path: string; data: T | null; err: string | null; at?: number; changedAt?: number }>({ path: '', data: null, err: null });
  const sig = useRef<{ path: string; h: string; changedAt: number }>({ path: '', h: '', changedAt: 0 });
  const { tick, auto } = useRefresh();
  const load = useRef<(signal?: AbortSignal) => Promise<void>>(async () => undefined);
  load.current = async (signal) => {
    inflightBegin();
    try {
      const data = await api<T>(path, { signal });
      const h = JSON.stringify(data);
      const now = Date.now();
      if (sig.current.path !== path || sig.current.h !== h) sig.current = { path, h, changedAt: now };
      setS({ path, data, err: null, at: now, changedAt: sig.current.changedAt });
    } catch (e) {
      if (signal?.aborted) return;
      setS((x) => ({ path, data: x.path === path ? x.data : null, err: e instanceof Error ? e.message : String(e), at: x.at, changedAt: x.changedAt }));
    } finally {
      inflightEnd();
    }
  };
  // on load, on a new path and on every Refresh press: not on a timer (unless Auto is on, and then every `ms`)
  // a request is cancelled when you leave the page or the path changes, so slow cards never hold the browser's connections for the next screen
  useEffect(() => {
    const ac = new AbortController();
    void load.current(ac.signal);
    return () => ac.abort();
  }, [path, tick]);
  useEffect(() => {
    if (!auto && !always) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load.current();
    }, always ? ms : Math.max(ms, 60000));
    return () => window.clearInterval(t);
  }, [auto, always, ms]);
  return s.path === path ? { data: s.data, err: s.err, at: s.at, changedAt: s.changedAt } : { data: null, err: null };
}

export const q = (name: string): string => `name=${encodeURIComponent(name)}&day=${dayFor(name)}${asOfQuery()}`;

export function Card({ title, sub, children, at, changedAt }: { title: string; sub?: ReactNode; children: ReactNode; at?: number; changedAt?: number }) {
  return (
    <section className="panel card">
      <header className="panel-head">
        <h3>{title}</h3><Info k={title} />
        {sub && <span className="muted">{sub}</span>}
        <Stamp at={at} changedAt={changedAt} />
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export const Loading = ({ what, err }: { what: string; err: string | null }) => (err ? <p className="muted">{what}: {err}</p> : <p className="muted">Loading {what}…</p>);
const callTone = (c: string): string => (c.includes('LONG') || c.includes('BUY') ? 'up' : c.includes('SHORT') || c.includes('SELL') ? 'dn' : 'flat');

interface Verdict { call: string; headline: string; action: string; conf: string | null; why: string[]; warn: string[]; marketSignal: string }
export function FinalVerdictCard({ name }: { name: string }) {
  const { data: v, err, at, changedAt } = useLive<Verdict>(`/finalverdict?${q(name)}`);
  return (
    <Card at={at} changedAt={changedAt} title="Final verdict" sub={v?.conf ? `${v.conf} confidence` : undefined}>
      {!v ? (
        <Loading what="the verdict" err={err} />
      ) : (
        <>
          <div className="sum">
            <span className={`call big ${callTone(v.call)}`}>{v.call}</span>
            <span className="sum-px">{v.headline}</span>
          </div>
          <p>{v.action}</p>
          {v.warn.map((w, i) => (
            <p key={i} className="small-note warn-note">{w}</p>
          ))}
          <details className="why"><summary>Why</summary>{v.why.map((w, i) => <p key={i} className="small-note">{w}</p>)}</details>
        </>
      )}
    </Card>
  );
}

interface Zone { price: number; loP: number; hiP: number; strength: number; n: number; dist: number; items: { src: string }[] }
export interface Plan { long: boolean; ent?: { price: number; items?: { src: string }[] }; entryPx: number; risk?: number; stop: number; t1: { price: number; items?: { src: string }[] } | null; t2: { price: number } | null; rr: number | null; atLevel: boolean; widened?: boolean; capped?: boolean; heldNote?: string; held?: { since: number } }
export interface Outlook { ok: boolean; why?: string; vix?: { lo: number; hi: number }; spot?: number; strat?: { outcome: string; level: string }; dir: number; rank: number; rankNote: string; plan: Plan | null; range: { sup: Zone | null; res: Zone | null } | null; forced: boolean }
function OutlookAlertToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ groups: { fields: { key: string; value: unknown }[] }[] }>('/settings').then((r) => setOn(r.groups.flatMap((g) => g.fields).find((f) => f.key === 'outlook_alert')?.value === true)).catch(() => setOn(false));
  }, []);
  if (on === null) return null;
  return (
    <label className="small-note alert-toggle">
      <input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); void api('/settings', { method: 'PATCH', body: { values: { outlook_alert: e.target.checked } } }).catch(() => setOn(!e.target.checked)); }} />
      {' '}Alert me when price reaches the entry zone (banner; Telegram too when it is on in Settings)
    </label>
  );
}

/** The plan drawn as the chart draws it: a green block from the entry to target 1 (a fainter one on to target 2), a red block from the entry to the stop, and the price. */
export function PlanBox({ plan, spot }: { plan: Plan; spot: number | null | undefined }) {
  const planVals = [plan.stop, plan.entryPx, plan.t1?.price, plan.t2?.price].filter((v): v is number => v != null);
  const span = Math.max(...planVals) - Math.min(...planVals) || 1;
  // a price far from the plan would squash it, so the price is only drawn to scale when it is near; otherwise it is noted with an arrow
  const near = spot != null && spot <= Math.max(...planVals) + span * 1.2 && spot >= Math.min(...planVals) - span * 1.2;
  const vals = near && spot != null ? [...planVals, spot] : planVals;
  const hi = Math.max(...vals);
  const lo = Math.min(...vals);
  const pad = (hi - lo) * 0.08 || 1;
  const H = 170;
  const y = (v: number): number => 8 + ((hi + pad - v) / (hi - lo + 2 * pad)) * (H - 16);
  const box = (a: number, b: number, cls: string): JSX.Element => <rect x="4" y={Math.min(y(a), y(b))} width="88" height={Math.max(2, Math.abs(y(a) - y(b)))} className={cls} />;
  // labels are spread apart so two close prices (the price and a target) never print on top of each other
  const labs: { v: number; text: string; cls: string }[] = [];
  if (plan.t2?.price != null) labs.push({ v: plan.t2.price, text: `T2 ${R0(plan.t2.price)}`, cls: 'pb-up' });
  if (plan.t1?.price != null) labs.push({ v: plan.t1.price, text: `T1 ${R0(plan.t1.price)}`, cls: 'pb-up' });
  labs.push({ v: plan.entryPx, text: `Entry ${R0(plan.entryPx)}`, cls: 'pb-ac' });
  labs.push({ v: plan.stop, text: `Stop ${R0(plan.stop)}`, cls: 'pb-dn' });
  if (near && spot != null) labs.push({ v: spot, text: `Price ${R0(spot)}`, cls: 'pb-spot-t' });
  const sorted = labs.map((l) => ({ ...l, ty: y(l.v) })).sort((p, q) => p.ty - q.ty);
  for (let i = 1; i < sorted.length; i++) if (sorted[i]!.ty - sorted[i - 1]!.ty < 11) sorted[i]!.ty = sorted[i - 1]!.ty + 11;
  const line = (v: number, cls: string, bold = false, dashed = false): JSX.Element => <line key={`${cls}${v}`} x1="4" x2="92" y1={y(v)} y2={y(v)} className={`pb-line ${cls}${dashed ? ' pb-spot' : ''}`} strokeWidth={bold ? 2 : 1} />;
  const t1 = plan.t1?.price;
  const t2 = plan.t2?.price;
  const r = t1 != null && plan.entryPx !== plan.stop ? Math.abs(t1 - plan.entryPx) / Math.abs(plan.entryPx - plan.stop) : null;
  return (
    <svg className="plan-box" viewBox={`0 0 190 ${H}`} role="img" aria-label="Entry, stop and targets of the plan">
      {t1 != null && t2 != null && box(t1, t2, 'pb-g2')}
      {t1 != null && box(plan.entryPx, t1, 'pb-g')}
      {box(plan.entryPx, plan.stop, 'pb-r')}
      {t2 != null && line(t2, 'pb-up')}
      {t1 != null && line(t1, 'pb-up')}
      {line(plan.entryPx, 'pb-ac', true)}
      {line(plan.stop, 'pb-dn')}
      {near && spot != null && <line x1="0" x2="92" y1={y(spot)} y2={y(spot)} className="pb-spot" />}
      {sorted.map((l) => <text key={l.text} x="96" y={l.ty + 3.5} className={`pb-t ${l.cls}`}>{l.text}</text>)}
      {!near && spot != null && <text x="96" y={spot > Math.max(...planVals) ? 10 : H - 4} className="pb-t pb-spot-t">Price {R0(spot)} {spot > Math.max(...planVals) ? '↑' : '↓'}</text>}
      {r != null && t1 != null && <text x="10" y={(y(plan.entryPx) + y(t1)) / 2 + 3} className="pb-rr">T1 {r.toFixed(1)}R</text>}
      <text x="10" y={(y(plan.entryPx) + y(plan.stop)) / 2 + 3} className="pb-rk">Risk</text>
    </svg>
  );
}

const R0 = (n: number): string => Math.round(n).toLocaleString('en-IN');

function OutlookRow({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const { data: o } = useLive<Outlook>(`/outlook?${q(name)}`);
  const cons = useLive<{ net: number; agree: number; voting: number }>(`/consensus?${q(name)}`, 300000).data;
  const label = name === 'NIFTY BANK' ? 'BANK NIFTY' : name;
  return (
    <li className="olr">
      <button className="olr-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b className="olr-name">{label}</b>
        {o?.ok && o.spot ? <span className="num olr-px">{R0(o.spot)}</span> : null}
        {!o ? <span className="muted">loading…</span> : !o.ok ? <span className="muted">{o.why}</span> : o.plan ? (
          <>
            <b className={`olr-call ${o.plan.long ? 'up' : 'dn'}`}>{o.forced ? 'LEAN' : 'PLAN'} ({['', 'low', 'medium', 'high'][o.rank]} confidence): {o.plan.long ? 'LONG' : 'SHORT'}</b>
            <span className={`ol-badge r${o.rank}`}>CONFIDENCE {['', 'LOW', 'MEDIUM', 'HIGH'][o.rank]}</span>
            {cons && <span className="muted olr-net">net {signed(cons.net, 2)} · {cons.agree} of {cons.voting} groups agree</span>}
          </>
        ) : <span className="muted">No clear direction</span>}
        <i className="olr-chev" aria-hidden="true">{open ? '▾' : '▸'}</i>
      </button>
      {open && <div className="olr-body"><OutlookCard name={name} /></div>}
    </li>
  );
}

/** The Probable trade of every index on one card: the headline of each, a click opens its full detail. */
export function OutlookGroup({ names }: { names: string[] }) {
  return (
    <Card title="Probable trade from today's metrics" sub="tap an index for the full plan">
      <ul className="olr-list">{names.map((n) => <OutlookRow key={n} name={n} />)}</ul>
    </Card>
  );
}

export function OutlookCard({ name }: { name: string }) {
  const { data: o, err, at, changedAt } = useLive<Outlook>(`/outlook?${q(name)}`);
  const cons = useLive<{ net: number; agree: number; voting: number; families: { name: string; dir: number }[] }>(`/consensus?${q(name)}`, 300000).data;
  return (
    <Card at={at} changedAt={changedAt} title={`Probable trade · ${name}`} sub={o?.ok && o.spot ? `price ${nfi(o.spot)}` : undefined}>
      {!o ? (
        <Loading what="the plan" err={err} />
      ) : !o.ok ? (
        <p className="muted">{o.why}</p>
      ) : o.plan ? (
        <>
          <div className="ol-head">
            <b className={`ol-title ${o.plan.long ? 'up' : 'dn'}`}>{o.forced ? 'LEAN' : 'PLAN'} ({['', 'low', 'medium', 'high'][o.rank]} confidence): {o.plan.long ? 'LONG' : 'SHORT'}</b>
            <span className={`ol-badge r${o.rank}`}>CONFIDENCE {['', 'LOW', 'MEDIUM', 'HIGH'][o.rank]}</span>
            {cons && <span className="muted ol-net">net {signed(cons.net, 2)} · {cons.agree} of {cons.voting} signal groups agree</span>}
          </div>
          <div className="ol-split">
          <PlanBox plan={o.plan} spot={o.spot} />
          <ul className="ol-lines">
            <li><b>Zone entry:</b> {o.plan.atLevel ? `at the ${o.plan.long ? 'support' : 'resistance'} zone ${R0(o.plan.entryPx)}` : `on a ${o.plan.long ? 'pullback to support' : 'rally to resistance'} ${R0(o.plan.entryPx)}${o.spot ? ` (${R0(Math.abs(o.spot - o.plan.entryPx))} pts away)` : ''}`}{o.plan.ent?.items?.length ? <span className="muted"> ({[...new Set(o.plan.ent.items.map((i) => i.src))].slice(0, 3).join(', ')})</span> : null}</li>
            <li><b>Stop:</b> {R0(o.plan.stop)} ({o.plan.widened ? 'one average 5-minute range beyond the zone' : `${o.plan.long ? 'below' : 'above'} that zone by 0.12% of price`}{o.plan.risk != null ? `, ${R0(o.plan.risk)} pts risk` : ''}) &nbsp;<b>Target 1:</b> {o.plan.t1 ? <>{R0(o.plan.t1.price)} <span className="muted">({R0(Math.abs(o.plan.t1.price - o.plan.entryPx))} pts{o.plan.t1.items?.length ? `, ${[...new Set(o.plan.t1.items.map((x) => x.src))].slice(0, 2).join(', ')}` : ''})</span></> : 'no level ahead'}{o.plan.t2 ? <> &nbsp;<b>Target 2:</b> {R0(o.plan.t2.price)}</> : ''}</li>
            <li><b>Reward : risk</b> {o.plan.rr != null ? `${o.plan.rr.toFixed(1)} : 1` : '—'}{o.plan.atLevel ? ' · entry now' : ''}</li>
            <li><b>Expect:</b> {o.plan.long ? `${name.replace(/^NIFTY BANK$/, 'BANK NIFTY')} ${o.spot ? R0(o.spot) + ' ' : ''}to hold above ${R0(o.plan.stop)}${o.plan.t1 ? ` and drift up toward ${R0(o.plan.t1.price)}` : ''}; the view is wrong if it closes below ${R0(o.plan.stop)}.` : `${name.replace(/^NIFTY BANK$/, 'BANK NIFTY')} ${o.spot ? R0(o.spot) + ' ' : ''}to stay below ${R0(o.plan.stop)}${o.plan.t1 ? ` and drift down toward ${R0(o.plan.t1.price)}` : ''}; the view is wrong if it closes above ${R0(o.plan.stop)}.`}</li>
            {cons && cons.families.length > 0 && <li className="small-note">Signal groups: {cons.families.map((f) => <span key={f.name} className={f.dir > 0 ? 'up' : f.dir < 0 ? 'dn' : 'muted'}>{f.dir > 0 ? '▲' : f.dir < 0 ? '▼' : '–'} {({ zone: '9:15 zone', trend: 'Price vs levels', futures: 'Futures', options: 'Option flow', orderflow: 'Order flow', curve: 'Curve' } as Record<string, string>)[f.name] ?? f.name} </span>)}</li>}
            {o.vix && o.plan.t1 && <li className="warn-note">Expected day range by VIX: {nfi(o.vix.lo)} – {nfi(o.vix.hi)}; target 1 is {o.plan.t1.price >= o.vix.lo && o.plan.t1.price <= o.vix.hi ? 'inside it' : 'outside it'}.</li>}
            <li><OutlookAlertToggle /></li>
            {o.strat && <li className="warn-note">9:15 plan for context: {o.strat.outcome} ({o.strat.level}). Not used as a driver here.</li>}
          </ul>
          </div>
          {o.rankNote && <p className="small-note warn-note">{o.rankNote}</p>}
          {o.plan.widened && <p className="small-note warn-note">The stop was widened to one average 5-minute range.</p>}
          {o.plan.capped && <p className="small-note warn-note">Target 1 was pulled in: the zone target was more than 4 times the risk away.</p>}
          {o.plan.heldNote && <p className="small-note">{o.plan.heldNote}</p>}
          <a className="ibtn" title="Open in Chart View" aria-label="Open in Chart View" href={`#/chart/${encodeURIComponent(name)}`}><Icon name="chart" size={18} /></a>
        </>
      ) : o.range ? (
        <p className="muted">No clear direction. Range: support {o.range.sup ? nfi(o.range.sup.price) : '—'} to resistance {o.range.res ? nfi(o.range.res.price) : '—'}.</p>
      ) : (
        <p className="muted">No plan.</p>
      )}
    </Card>
  );
}

interface LxCheck { key: string; label: string; sig: number; text: string; state?: string }
interface Lx { status: string; reason?: string; live: number; agree: number; against: number; view: { src: string }; checks: LxCheck[] }
export function LiveContextCard({ name }: { name: string }) {
  const { data: l, err, at, changedAt } = useLive<Lx>(`/livecontext?${q(name)}`, 120000);
  return (
    <Card at={at} changedAt={changedAt} title="Live context: is the morning view still valid?" sub={l?.status}>
      {!l ? (
        <Loading what="live context" err={err} />
      ) : l.reason ? (
        <p className="muted">{l.reason}</p>
      ) : (
        <>
          <DivBars max={10} dec={0} rows={[{ key: 'live', label: 'Live view', value: l.live }]} />
          <p className="small-note">Morning view from {l.view.src}: {l.agree} checks agree, {l.against} against.</p>
          <details className="more-nums">
            <summary>What each check says</summary>
            <ul className="lx-list">
              {l.checks.map((c) => <li key={c.key} className={c.state === 'agree' ? 'up' : c.state === 'against' ? 'dn' : 'flat'}><b>{c.state === 'agree' ? '✓' : c.state === 'against' ? '✗' : '–'} {c.label}</b><span className="muted">{c.text}</span></li>)}
            </ul>
          </details>
          <div className="chk-chips">
            {l.checks.map((c) => <span key={c.key} title={c.text} className={c.state === 'agree' ? 'up' : c.state === 'against' ? 'dn' : 'flat'}>{c.state === 'agree' ? '✓' : c.state === 'against' ? '✗' : '–'} {c.label}</span>)}
          </div>
        </>
      )}
    </Card>
  );
}

interface Sr { spot: number | null; zones: Zone[] }
export function SupportResistanceCard({ name }: { name: string }) {
  const { data: s, err, at, changedAt } = useLive<Sr>(`/levels?${q(name)}`);
  const spot = s?.spot ?? 0;
  const up = (s?.zones ?? []).filter((z) => z.price > spot).sort((a, b) => a.price - b.price).slice(0, 4);
  const dn = (s?.zones ?? []).filter((z) => z.price <= spot).sort((a, b) => b.price - a.price).slice(0, 4);
  const row = (z: Zone, cls: string) => (
    <li key={z.price} className={cls} title={z.items.map((i) => i.src).join(', ')}>
      <b className="num">{nfi(z.price)}</b>
      <span className="muted num">{signed(z.dist, 0)}</span>
      <span>{'●'.repeat(Math.min(5, Math.round(z.strength)))}{z.strength >= 3 ? ' STRONG' : ''}</span>
    </li>
  );
  return (
    <Card at={at} changedAt={changedAt} title="Strong support and resistance" sub={spot ? `price ${nf(spot)}` : undefined}>
      {!s ? (
        <Loading what="the levels" err={err} />
      ) : (
        <LevelLadder
          spot={spot}
          fmt={nfi}
          rungs={[
            ...up.map((z) => ({ key: `r${z.price}`, price: z.price, kind: 'res' as const, strength: z.strength, label: `${signed(z.dist, 0)} · ${[...new Set(z.items.map((i) => i.src))].slice(0, 2).join(', ')}${z.strength >= 3 ? ' · STRONG' : ''}`, title: z.items.map((i) => i.src).join(', ') })),
            ...dn.map((z) => ({ key: `s${z.price}`, price: z.price, kind: 'sup' as const, strength: z.strength, label: `${signed(z.dist, 0)} · ${[...new Set(z.items.map((i) => i.src))].slice(0, 2).join(', ')}${z.strength >= 3 ? ' · STRONG' : ''}`, title: z.items.map((i) => i.src).join(', ') })),
          ]}
        />
      )}
    </Card>
  );
}

interface Sig { strategy: string | null; view: string | null; suggestion: { why: string } | null; agreement: { agree: number; total: number; pct: number; label: string } | null; timing: { pct: number; label: string; checks: { label: string; s: number; why: string }[] } | null }
export function SignalsCard({ name }: { name: string }) {
  const { data: s, err, at, changedAt } = useLive<Sig>(`/signals?${q(name)}`);
  return (
    <Card at={at} changedAt={changedAt} title="Signal agreement and entry timing" sub={s?.strategy ?? undefined}>
      {!s ? (
        <Loading what="the signals" err={err} />
      ) : (
        <>
          {s.suggestion && <p className="small-note">{s.suggestion.why}</p>}
          <div className="rings">
            {s.agreement && <Ring pct={s.agreement.pct} label="Agreement" sub={`${s.agreement.agree} of ${s.agreement.total} · ${s.agreement.label.toLowerCase()}`} tone={s.agreement.pct >= 65 ? 'up' : s.agreement.pct >= 45 ? 'flat' : 'dn'} />}
            {s.timing && <Ring pct={s.timing.pct} label="Entry timing" sub={s.timing.label.toLowerCase()} tone={s.timing.pct >= 70 ? 'up' : s.timing.pct >= 50 ? 'flat' : 'dn'} />}
          </div>
          {s.timing && (
            <div className="chk-chips">
              {s.timing.checks.map((c) => <span key={c.label} title={c.why} className={c.s > 0 ? 'up' : c.s < 0 ? 'dn' : 'flat'}>{c.s > 0 ? '✓' : c.s < 0 ? '✗' : '–'} {c.label}</span>)}
            </div>
          )}
          {!s.agreement && !s.timing && <p className="muted">Not enough signals loaded yet.</p>}
        </>
      )}
    </Card>
  );
}

interface Mkt { score: number; leading: number; signal: { signal: string; reason: string; tradeSignal: { outcome: string; level: string } }; coverage: { adStocks: number; futuresStocks: number }; missing: string[] }
interface Pred { comboKey?: string; bullP: number; bearP: number; sidewaysP: number; confidence: number; tradeAction: string; tradeEntry: string; vixRegime: string; unvalidated: boolean; strat: { outcome: string; level: string }; comboStats: { winPct: number; legs: number } | null }
interface Strength { rows: { name: string; chg: number }[]; strongest: { name: string; chg: number } | null; weakest: { name: string; chg: number } | null }

/** Predict (9:15 combo): the day's lean from the three index zones and the backtest of that combo. The score, verdict and index ranking live in the Overview block. */
export function PredictCard() {
  const day = tradingDayNow();
  const p = useLive<Pred>(`/predict?day=${day}${asOfQuery()}`, 300000);
  const sc = useLive<{ items: Record<string, { zone: string }> }>(`/scan915?day=${day}${asOfQuery()}`, 600000);
  return (
      <Card title="Predict (9:15 combo)" sub={p.data ? p.data.strat.outcome : undefined}>
        {!p.data ? (
          <Loading what="Predict" err={p.err} />
        ) : (
          <>
            <div className="combo-head">
              <span className="muted">9:15 combo</span>
              <b className="num">{p.data.comboKey ?? '—'}</b>
              {p.data.unvalidated && <span className="tag flat" title="This exact combination has not occurred in the backtest window">UNVALIDATED</span>}
            </div>
            <div className="combo-zones">
              {([['NIFTY 50', 'NIFTY'], ['SENSEX', 'SENSEX'], ['NIFTY BANK', 'BANK']] as const).map(([n, l]) => {
                const z = sc.data?.items[n]?.zone;
                return z ? <span key={n} className={`pill zp z-${z.replace('/', '')}`}>{l} <b>{z}</b></span> : null;
              })}
            </div>
            <p className="combo-strat"><span className="muted">Strategy</span> <b className={callTone(p.data.strat.outcome)}>{p.data.strat.outcome}</b> — {p.data.strat.level}</p>
            <div className="prob-row"><span>Bull</span><div className="prob-bar"><i className="up" style={{ width: `${p.data.bullP}%` }} /></div><b className="num">{p.data.bullP}%</b></div>
            <div className="prob-row"><span>Range</span><div className="prob-bar"><i className="flat" style={{ width: `${p.data.sidewaysP}%` }} /></div><b className="num">{p.data.sidewaysP}%</b></div>
            <div className="prob-row"><span>Bear</span><div className="prob-bar"><i className="dn" style={{ width: `${p.data.bearP}%` }} /></div><b className="num">{p.data.bearP}%</b></div>
            <p><b className={callTone(p.data.tradeAction)}>{p.data.tradeAction}</b> · confidence {p.data.confidence}% (agreement between signals) · VIX {p.data.vixRegime}</p>
            <p className="small-note">{p.data.tradeEntry}</p>
            <p className="small-note warn-note">{p.data.unvalidated ? 'No backtest matches today’s combo: these percentages are a hand-set lean, not measured odds.' : `Backtest of this combo: ${p.data.comboStats?.winPct}% of ${p.data.comboStats?.legs} legs won (one year, one market).`}</p>
          </>
        )}
      </Card>
  );
}

interface MacroRowLite { key: string; label: string; last: number; dec: number; unit: string; c5: number; score: number; reading: string }
interface MacroLite { verdict: { score: number; label: string; tone: string; advice: string }; rows: MacroRowLite[]; errors: string[] }

export function MacroCard() {
  const day = tradingDayNow();
  const { data: m, err, at, changedAt } = useLive<MacroLite>(`/macro?day=${day}`, 300000);
  return (
    <Card at={at} changedAt={changedAt} title="Macro backdrop" sub={m ? `${m.verdict.label} · ${signed(m.verdict.score, 1)}` : undefined}>
      {!m ? (
        <Loading what="the macro drivers" err={err} />
      ) : (
        <>
          <p className="small-note">{m.verdict.advice}</p>
          <ul className="mc-rows">
            {m.rows.map((r) => (
              <li key={r.key} title={r.reading}>
                <span className="mc-l">{r.label}</span>
                <span className="mc-bar" aria-hidden="true"><i className={tone(r.score)} style={{ width: `${Math.min(50, Math.abs(r.score) * 50)}%`, [r.score >= 0 ? 'left' : 'right']: '50%' }} /></span>
                <span className="num mc-v">{r.last.toFixed(r.dec)}<small className={tone(r.c5)}> {signed(r.c5, 2)}</small></span>
              </li>
            ))}
          </ul>
          <p className="small-note">The bar is how much each driver helps (right, green) or hurts (left, red) Indian equities; the small figure is the 5-day change.</p>
          {m.errors.length > 0 && <p className="small-note warn-note">Left out: {m.errors.join('; ')}</p>}
        </>
      )}
    </Card>
  );
}

interface FgLite { score: number | null; label: string; tone: string; parts: { label: string; score: number | null; detail?: string | null }[]; outcome: { text: string } | null }

const FG_BANDS: [number, string, string][] = [[25, 'Extreme fear', 'var(--dn)'], [45, 'Fear', 'color-mix(in srgb, var(--dn) 55%, var(--warn))'], [55, 'Neutral', 'var(--warn)'], [75, 'Greed', 'color-mix(in srgb, var(--up) 55%, var(--warn))'], [101, 'Extreme greed', 'var(--up)']];
const fgColor = (v: number): string => FG_BANDS.find((b) => v < b[0])![2];

/** A half-circle dial, 0 (extreme fear) to 100 (extreme greed), with the needle at the score. */
function FgDial({ score }: { score: number }) {
  const R = 78;
  const pt = (v: number, r = R): [number, number] => {
    const a = Math.PI * (1 - v / 100);
    return [100 + r * Math.cos(a), 100 - r * Math.sin(a)];
  };
  const arc = (a: number, b: number): string => {
    const [x1, y1] = pt(a);
    const [x2, y2] = pt(b);
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  let from = 0;
  const [nx, ny] = pt(Math.max(0, Math.min(100, score)), R - 14);
  return (
    <svg viewBox="0 0 200 118" className="fg-dial" role="img" aria-label={`Fear and greed ${Math.round(score)} of 100`}>
      {FG_BANDS.map(([to, , col]) => {
        const d = arc(from, Math.min(to, 100) - (to > 100 ? 0 : 0.6));
        from = Math.min(to, 100);
        return <path key={to} d={d} stroke={col} strokeWidth="14" fill="none" />;
      })}
      <line x1="100" y1="100" x2={nx} y2={ny} stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="100" cy="100" r="6" fill="currentColor" />
      <text x="22" y="116" fontSize="9" fill="currentColor" opacity="0.6">0</text>
      <text x="170" y="116" fontSize="9" fill="currentColor" opacity="0.6">100</text>
    </svg>
  );
}

export function FearGreedCard() {
  const day = tradingDayNow();
  const { data: f, err, at, changedAt } = useLive<FgLite>(`/feargreed?day=${day}${asOfQuery()}`, 300000);
  return (
    <Card at={at} changedAt={changedAt} title="Fear & Greed" sub={f && f.score !== null ? `${Math.round(f.score)} · ${f.label}` : undefined}>
      {!f ? (
        <Loading what="Fear & Greed" err={err} />
      ) : (
        <>
          {f.score !== null && (
            <div className="fg-top">
              <FgDial score={f.score} />
              <div className="fg-read"><b className="num" style={{ color: fgColor(f.score) }}>{Math.round(f.score)}</b><span>{f.label}</span></div>
            </div>
          )}
          <ul className="fg-parts">
            {f.parts.map((p) => (
              <li key={p.label} title={p.detail ?? undefined}>
                <span className="fg-l">{p.label}</span>
                <span className="fg-bar"><i style={{ width: `${p.score ?? 0}%`, background: p.score == null ? 'transparent' : fgColor(p.score) }} /></span>
                <span className="num fg-v">{p.score === null ? 'pending' : Math.round(p.score)}</span>
              </li>
            ))}
          </ul>
          {f.outcome && <p className="small-note">{f.outcome.text}</p>}
          <p className="small-note">A contrarian modifier: it says how crowded the market is, never which way to trade.</p>
        </>
      )}
    </Card>
  );
}

interface WtdLite {
  groups: { index: string; table: { rows: { name: string; weight: number; change: number; impact: number; tier: string; cumPct: number; dir: string }[]; coverage: number; netImpact: number; indexChange: number; driverNames: string[]; driverShare: number; disagrees: boolean }; stocks: Record<string, { oiScore: number; pcr: string }>; skipped: string[] }[];
}

export function WeightedCard() {
  const day = tradingDayNow();
  const { data: w, err, at, changedAt } = useLive<WtdLite>(`/weightedoi?day=${day}${asOfQuery()}`, 300000);
  return (
    <Card at={at} changedAt={changedAt} title="Weighted constituents (index impact)">
      {!w ? (
        <Loading what="the top-10 stocks of each index (loads their option chains)" err={err} />
      ) : (
        w.groups.map((g) => (
          <div key={g.index} className="wtd">
            <p className="small-note">
              <b>{g.index}</b>: top {g.table.rows.length} stocks, {g.table.coverage.toFixed(0)}% of the index weight.{' '}
              {g.table.disagrees
                ? `CAUTION: this slice nets ${signed(g.table.netImpact, 3)} but ${g.index} is ${signed(g.table.indexChange, 2)}%, so the move comes from outside these stocks.`
                : g.table.driverNames.length
                  ? `${g.table.driverNames.join(', ')} ${g.table.driverNames.length > 1 ? 'are' : 'is'} driving it (~${g.table.driverShare}% of the slice's move).`
                  : ''}
            </p>
            <DivBars
              stack
              dec={3}
              rows={g.table.rows.map((r) => ({
                key: r.name,
                label: r.name,
                value: r.impact,
                dim: r.tier === 'negligible',
                right: `${r.weight.toFixed(1)}% weight · ${signed(r.change, 2)}% today · ${r.tier === 'driver' ? `driving ${r.dir}` : r.tier === 'contributor' ? 'contributing' : 'negligible'}`,
              }))}
            />
            <details className="more-nums">
              <summary>Show the numbers</summary>
              <div className="tablewrap">
                <table className="tbl">
                  <thead><tr><th>Stock</th><th>OI</th><th>PCR</th><th>Wt%</th><th>Chg%</th><th>Impact</th></tr></thead>
                  <tbody>
                    {g.table.rows.map((r) => (
                      <tr key={r.name}>
                        <td><b>{r.name}</b></td>
                        <td className={`num ${tone(g.stocks[r.name]?.oiScore ?? 0)}`}>{signed(g.stocks[r.name]?.oiScore ?? 0, 1)}</td>
                        <td className="num">{g.stocks[r.name]?.pcr ?? '—'}</td>
                        <td className="num">{r.weight.toFixed(2)}</td>
                        <td className={`num ${tone(r.change)}`}>{signed(r.change, 2)}</td>
                        <td className={`num ${tone(r.impact)}`}>{signed(r.impact, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            {g.skipped.length > 0 && <p className="small-note warn-note">No option chain for: {g.skipped.join(', ')}</p>}
          </div>
        ))
      )}
    </Card>
  );
}

interface SqzLite {
  signal: { active: boolean; type: string; remark?: string; probability: number; nearExpiry: boolean; daysToExpiry: number | null; pcr: number | null; extremePositioning: boolean; acc: { winRate: number; samples: number } | null };
  watch: { willBe: string; streak: number; score: number; badge: { label: string; tone: string } } | null;
  study: { state: string; error?: string; data?: { days: number; up: SqzDir; down: SqzDir } };
}
interface SqzDir { n: number; mfe: { med: number | null; p75: number | null; p90: number | null } | null }

export function SqueezeCard({ name }: { name: string }) {
  const { data: s, err, at, changedAt } = useLive<SqzLite>(`/squeeze?${q(name)}`, 120000);
  const dirs = s?.study.data;
  const d = s && dirs ? (s.signal.type === 'SHORT_COVERING' ? dirs.up : dirs.down) : null;
  const f = (v: number | null): string => (v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
  return (
    <Card at={at} changedAt={changedAt} title="Short covering / long unwinding" sub={s?.signal.active ? `${s.signal.type === 'SHORT_COVERING' ? 'SHORT COVERING' : 'LONG UNWINDING'} · setup ${s.signal.probability}` : undefined}>
      {!s ? (
        <Loading what="the futures squeeze read" err={err} />
      ) : (
        <>
          {s.signal.active ? (
            <p>
              <b className={s.signal.type === 'SHORT_COVERING' ? 'up' : 'dn'}>{s.signal.type === 'SHORT_COVERING' ? 'Short covering is on: exit shorts / PEs.' : 'Long unwinding is on: exit longs / CEs.'}</b>
              {s.signal.nearExpiry ? ` Expiry in ${s.signal.daysToExpiry} day(s).` : ''}
              {s.signal.extremePositioning ? ` One-sided positioning (PCR ${s.signal.pcr?.toFixed(2)}).` : ''}
              {s.signal.acc ? ` This remark was right ${s.signal.acc.winRate}% of ${s.signal.acc.samples} times today.` : ''}
            </p>
          ) : (
            <p className="muted">No active signal.</p>
          )}
          {s.watch && (
            <p className="small-note">
              Pre-squeeze watch: {s.watch.willBe === 'SHORT_COVERING' ? 'shorts building' : 'longs building'} for {s.watch.streak} scans, not covering yet. Setup {s.watch.score}.{' '}
              <b title="Has this build-up pattern been followed by the squeeze on this contract before?">{s.watch.badge.label}</b>
            </p>
          )}
          {s.signal.active && (
            <p className="small-note">
              {s.study.state === 'loading'
                ? 'Measuring this contract’s past squeezes (one-off)…'
                : s.study.state === 'error'
                  ? `Past-squeeze study unavailable: ${s.study.error}`
                  : d && d.n >= 5 && d.mfe
                    ? `${d.n} past episodes over ${dirs!.days} sessions: best move after the signal ${f(d.mfe.med)} median, ${f(d.mfe.p75)} at the 75th and ${f(d.mfe.p90)} at the 90th percentile. Descriptive, not a forecast.`
                    : `Only ${d?.n ?? 0} past episodes in ${dirs?.days ?? 0} sessions: too few to say how far they run.`}
            </p>
          )}
          <p className="small-note">The remark is detected, not predicted; the setup number is a hand-weighted ranking, not a probability.</p>
        </>
      )}
    </Card>
  );
}

interface CurveLite { state?: string; diffPct?: number; annualizedPct?: number; lean?: string; tone?: string; note?: string; near?: { symbol: string; expiry: string; ltp: number }; far?: { symbol: string; expiry: string; ltp: number }; unavailable?: string }

export function CurveCard({ name }: { name: string }) {
  const { data: c, err, at, changedAt } = useLive<CurveLite>(`/curve?${q(name)}`, 300000);
  return (
    <Card at={at} changedAt={changedAt} title="Curve structure" sub={c?.lean}>
      {!c ? (
        <Loading what="the futures curve" err={err} />
      ) : c.unavailable || !c.near || !c.far ? (
        <p className="muted">{c.unavailable ?? 'No curve for this name.'}</p>
      ) : (
        <>
          <ul className="srlist">
            <li><b>Near · {c.near.symbol}</b><span className="num">{nf(c.near.ltp)}</span></li>
            <li><b>Far · {c.far.symbol}</b><span className="num">{nf(c.far.ltp)}</span></li>
            <li><b>{c.state}</b><span className="num">{signed(c.diffPct ?? 0, 2)}% raw · {signed(c.annualizedPct ?? 0, 1)}% a year</span></li>
          </ul>
          <p className="small-note">{c.note}</p>
        </>
      )}
    </Card>
  );
}

interface OfLite { dir?: number; imb?: number; buy?: number; sell?: number; label?: string; ageSec?: number; unavailable?: string }

export function OrderFlowCard({ name }: { name: string }) {
  const { data: o, err, at, changedAt } = useLive<OfLite>(`/orderflow?${q(name)}`, 15000);
  return (
    <Card at={at} changedAt={changedAt} title="Live order flow" sub={o?.label}>
      {!o ? (
        <Loading what="the order book" err={err} />
      ) : o.unavailable || o.imb === undefined ? (
        <p className="muted">{o.unavailable ?? 'No reading.'}</p>
      ) : (
        <>
          <div className="prob-row"><span>Buy</span><div className="prob-bar"><i className="up" style={{ width: `${((o.buy ?? 0) / Math.max(1, (o.buy ?? 0) + (o.sell ?? 0))) * 100}%` }} /></div><b className="num">{nfi(o.buy ?? 0)}</b></div>
          <div className="prob-row"><span>Sell</span><div className="prob-bar"><i className="dn" style={{ width: `${((o.sell ?? 0) / Math.max(1, (o.buy ?? 0) + (o.sell ?? 0))) * 100}%` }} /></div><b className="num">{nfi(o.sell ?? 0)}</b></div>
          <p className="small-note">Imbalance {signed((o.imb ?? 0) * 100, 0)}% · read {o.ageSec}s ago. Resting buy and sell quantity of the moment (an index uses its futures); a lean under 15% counts as balanced. Live only, not back-tested.</p>
        </>
      )}
    </Card>
  );
}
