import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { Info } from '../components/Info';
import { signed } from '../lib/format';

type Level = 'HIGH' | 'MED' | 'LOW';
interface Tag { level: Level; cats: string[]; watch: string[]; why: string }
interface Headline { id: string; title: string; link: string; ts: number; sources: string[]; topics: string[]; tag: Tag; kw: boolean }
interface Heads { items: Headline[]; errors: Record<string, string>; at: number; sources: string[]; alerts: boolean; keywords: string[] }
interface Arrows { nifty: string; bank: string; inr: string; gold: string; silver: string; crude: string }
interface Side { label: string; call: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'LITTLE'; mild?: boolean; arrows: Arrows }
interface Ev { id: string; ts: number; title: string; country: string; impact: string; forecast: string; previous: string; own?: boolean; india: { level: Level; why: string }; verdict: { higher: Side; lower: Side; note: string } | null; untilMin: number }
interface Evs { items: Ev[]; error: string | null; at: number; now: number }
interface Move { name: string; from: number; to: number; pct: number; closed: boolean }

const VIEWED = 'groot.news.viewed';
const LV = 'groot.news.levels';
const TABS = ['All', 'Breaking', 'India', 'US', 'Global', 'Central banks', 'Commodities'] as const;
const IST = 19800000;

const ago = (ts: number): string => {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const hm = (ts: number): string => new Date(ts + IST).toISOString().slice(11, 16);
const dayOf = (ts: number): string => new Date(ts + IST).toISOString().slice(0, 10);
const countdown = (min: number): string => (min < 0 ? `${Math.abs(min) < 60 ? Math.abs(min) + ' min' : Math.round(Math.abs(min) / 60) + ' h'} ago` : min < 60 ? `in ${min} min` : min < 2880 ? `in ${Math.floor(min / 60)} h ${min % 60} min` : `in ${Math.round(min / 1440)} days`);
/** where the event falls against NSE hours (09:15 to 15:30 IST) */
const against = (ts: number): string => {
  const d = new Date(ts + IST);
  const wd = d.getUTCDay();
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (wd === 0 || wd === 6) return 'on a weekend: India reacts at the next open';
  if (m >= 555 && m <= 930) return 'during NSE hours';
  return m < 555 ? 'before the NSE open' : 'after the NSE close: India reacts at the next open';
};
const callCls = (c: Side['call']): string => (c === 'POSITIVE' ? 'up' : c === 'NEGATIVE' ? 'dn' : 'flat');
const ARROW: [keyof Arrows, string][] = [['nifty', 'Nifty'], ['bank', 'Bank Nifty'], ['inr', 'Rupee'], ['gold', 'Gold'], ['silver', 'Silver'], ['crude', 'Crude']];

function Lvl({ l }: { l: Level }) { return <span className={`nlv nlv-${l}`}>{l}</span>; }

function Reaction({ id }: { id: string }) {
  const [m, setM] = useState<Move[] | null>(null);
  useEffect(() => {
    let live = true;
    api<{ moves: Move[] }>(`/news/reaction?id=${id}`).then((r) => live && setM(r.moves)).catch(() => live && setM([]));
    return () => { live = false; };
  }, [id]);
  if (!m) return <span className="muted small-note">checking the price move…</span>;
  if (!m.length) return null;
  return (
    <span className="nreact">
      {m.map((x) => <span key={x.name} className={x.pct > 0.02 ? 'up' : x.pct < -0.02 ? 'dn' : 'flat'} title={`${x.from} to ${x.to}${x.closed ? ' (the market was closed when it was published: includes the gap to the next open)' : ''}`}>{x.name === 'NIFTY BANK' ? 'Bank Nifty' : x.name} {signed(x.pct, 2)}%{x.closed ? ' ☾' : ''}</span>)}
      <span className="muted small-note"> since published</span>
    </span>
  );
}

function Headlines() {
  const [d, setD] = useState<Heads | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]>('All');
  const [find, setFind] = useState('');
  const [lv, setLv] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(LV) ?? '[]') as string[]; } catch { return []; } });
  const [open, setOpen] = useState<string | null>(null);
  const [kw, setKw] = useState('');
  const viewedBefore = useMemo(() => { try { return Number(localStorage.getItem(VIEWED) ?? 0); } catch { return 0; } }, []);

  const pull = (force: boolean): void => {
    setBusy(true);
    api<Heads>(`/news/headlines${force ? '?force=1' : ''}`).then((r) => { setD(r); setKw(r.keywords.join(', ')); setErr(null); }).catch((e: Error) => setErr(e.message)).finally(() => setBusy(false));
  };
  useEffect(() => {
    pull(false);
    const t = window.setInterval(() => pull(false), 120000);
    return () => { window.clearInterval(t); try { localStorage.setItem(VIEWED, String(Date.now())); } catch { /* not remembered */ } };
  }, []);

  const toggleLv = (x: string): void => {
    const n = lv.includes(x) ? lv.filter((y) => y !== x) : [...lv, x];
    setLv(n);
    try { localStorage.setItem(LV, JSON.stringify(n)); } catch { /* not remembered */ }
  };
  const base = useMemo(() => {
    const f = find.trim().toLowerCase();
    return (d?.items ?? []).filter((h) => (tab === 'All' || (tab === 'Breaking' ? Date.now() - h.ts < 30 * 60000 : h.topics.includes(tab))) && (!f || h.title.toLowerCase().includes(f)));
  }, [d, tab, find]);
  const shown = lv.length ? base.filter((h) => lv.includes(h.tag.level)) : base;
  const count = (l: Level): number => base.filter((h) => h.tag.level === l).length;
  const saveKw = (): void => { void api('/news/settings', { method: 'POST', body: { keywords: kw.split(',').map((x) => x.trim()).filter(Boolean) } }).then(() => pull(true)); };

  return (
    <div className="news-view">
      <div className="learn-bar">
        <div className="shorts-bar" role="group" aria-label="Topic">
          {TABS.map((t) => <button key={t} className={`chip${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
        </div>
        <input type="search" placeholder="Filter headlines" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Filter headlines" />
        <button className="ibtn" aria-label="Reload the feeds" title="Reload" disabled={busy} onClick={() => pull(true)}><Icon name="refresh" size={18} /></button>
      </div>
      <div className="shorts-bar" role="group" aria-label="Impact">
        {(['HIGH', 'MED', 'LOW'] as Level[]).map((l) => <button key={l} className={`chip nlvb-${l}${lv.includes(l) ? ' on' : ''}`} onClick={() => toggleLv(l)}>{l} <span className="num">{count(l)}</span></button>)}
        {lv.length > 0 && <button className="chip" onClick={() => { setLv([]); try { localStorage.setItem(LV, '[]'); } catch { /* */ } }}>clear</button>}
      </div>
      {err && <p className="banner err">{err}</p>}
      {d && Object.keys(d.errors).length > 0 && <p className="small-note warn-note">Could not read: {Object.entries(d.errors).map(([k, v]) => `${k} (${v})`).join(', ')}.</p>}
      {!d && !err && <p className="muted">Loading the feeds…</p>}
      <ul className="news-list">
        {shown.map((h) => {
          const isOpen = open === h.id;
          const fresh = h.ts > viewedBefore;
          return (
            <li key={h.id} className={`nlv-edge-${h.tag.level}${h.kw ? ' kw' : ''}`}>
              <div className="news-row">
                <Lvl l={h.tag.level} />
                <div className="news-main">
                  <a href={h.link} target="_blank" rel="noopener noreferrer" className="news-title">{h.title}</a>
                  <span className="muted small-note">
                    {fresh && <b className="news-new">NEW </b>}{h.sources[0]}{h.sources.length > 1 ? ` +${h.sources.length - 1} more` : ''} · {ago(h.ts)}
                    {h.tag.cats.length ? ` · ${h.tag.cats.join(', ')}` : ''}
                    {h.tag.cats.includes('Market move') && /\b(crash|plunge|surge|soar|rall)/i.test(h.title) ? ' · already moved' : ''}
                  </span>
                  {h.tag.watch.length > 0 && h.tag.level !== 'LOW' && <span className="small-note">Watch: {h.tag.watch.map((w) => (w === 'NIFTY BANK' ? 'Bank Nifty' : w)).join(', ')}</span>}
                  {isOpen && <Reaction id={h.id} />}
                </div>
                {h.tag.level !== 'LOW' && Date.now() - h.ts < 24 * 3600000 && <button className="ibtn" aria-label="Price move since this headline" title="Price move since published" onClick={() => setOpen(isOpen ? null : h.id)}><Icon name="up" size={18} /></button>}
              </div>
              {isOpen && h.tag.why && <p className="small-note muted">Tagged because: {h.tag.why}. A tag says what to watch, never which way.</p>}
            </li>
          );
        })}
      </ul>
      {d && !shown.length && <p className="muted">No headlines match.</p>}
      {d && (
        <details className="news-set">
          <summary>Alerts and highlight words</summary>
          <label className="small-note"><input type="checkbox" checked={d.alerts} onChange={(e) => { const on = e.target.checked; setD({ ...d, alerts: on }); void api('/news/settings', { method: 'POST', body: { alerts: on } }); }} /> Alert me (banner, and Telegram when it is on in Settings) for new HIGH impact headlines and 15 minutes before a HIGH event</label>
          <label className="small-note">Highlight words, comma separated
            <input value={kw} onChange={(e) => setKw(e.target.value)} onBlur={saveKw} />
          </label>
        </details>
      )}
    </div>
  );
}

function SideBox({ s, head }: { s: Side; head: string }) {
  return (
    <div className={`vside ${callCls(s.call)}`}>
      <b>{head}</b> {s.label}
      <div><span className={`vcall ${callCls(s.call)}`}>{s.call === 'LITTLE' ? 'LITTLE FOR INDIA' : s.call}{s.mild ? ' (mild)' : ''}</span></div>
      <div className="varrows">{ARROW.map(([k, n]) => s.arrows[k] !== '–' && <span key={k} className={s.arrows[k].startsWith('▲') ? 'up' : 'dn'}>{n} {s.arrows[k]}</span>)}</div>
    </div>
  );
}

function Events({ onChanged }: { onChanged: () => void }) {
  const [d, setD] = useState<Evs | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lowToo, setLowToo] = useState(false);
  const [only, setOnly] = useState<'ALL' | 'HIGH'>('ALL');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: '', date: dayOf(Date.now()), time: '10:00', impact: 'High' });
  const load = (): void => { api<Evs>('/news/events').then((r) => { setD(r); setErr(null); }).catch((e: Error) => setErr(e.message)); };
  useEffect(() => { load(); const t = window.setInterval(load, 60000); return () => window.clearInterval(t); }, []);

  const items = (d?.items ?? []).filter((e) => (lowToo || e.india.level !== 'LOW') && (only === 'ALL' || e.india.level === 'HIGH'));
  const days = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of items) { const k = dayOf(e.ts); m.set(k, [...(m.get(k) ?? []), e]); }
    return [...m.entries()];
  }, [items]);
  const add = (): void => {
    void api('/news/events', { method: 'POST', body: f }).then(() => { setAdding(false); setF({ ...f, title: '' }); load(); onChanged(); }).catch((e: Error) => setErr(e.message));
  };

  return (
    <div className="news-view">
      <div className="shorts-bar" role="group" aria-label="Events filter">
        <button className={`chip${only === 'HIGH' ? ' on' : ''}`} onClick={() => setOnly(only === 'HIGH' ? 'ALL' : 'HIGH')}>HIGH India impact only</button>
        <button className={`chip${lowToo ? ' on' : ''}`} onClick={() => setLowToo(!lowToo)}>Show low India impact</button>
        <button className="chip" onClick={() => setAdding(!adding)}><Icon name="plus" size={14} /> Add event</button>
      </div>
      {adding && (
        <div className="card news-add">
          <input placeholder="Event, e.g. India CPI release" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Event title" />
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Date" />
          <input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} aria-label="Time (IST)" />
          <select value={f.impact} onChange={(e) => setF({ ...f, impact: e.target.value })} aria-label="Impact"><option>High</option><option>Medium</option><option>Low</option></select>
          <button className="btn primary" disabled={!f.title.trim()} onClick={add}>Add</button>
          <p className="small-note muted">Time is Indian time (IST). Titles that match a known type (India CPI, Union Budget...) get its reading.</p>
        </div>
      )}
      {err && <p className="banner err">{err}</p>}
      {d?.error && <p className="small-note warn-note">The calendar feed could not be read ({d.error}); showing the saved copy. It only covers the current week and has no Indian releases, so add those with Add event.</p>}
      {!d && !err && <p className="muted">Loading…</p>}
      {d && !items.length && <p className="muted">No events in the next three weeks with this filter.</p>}
      {days.map(([day, list]) => (
        <section key={day} className="pgroup">
          <h3 className="pgroup-title">{new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })}</h3>
          <ul className="news-list">
            {list.map((e) => (
              <li key={e.id} className={`nlv-edge-${e.india.level}${e.untilMin < 0 ? ' past' : ''}`}>
                <div className="news-row">
                  <Lvl l={e.india.level} />
                  <div className="news-main">
                    <b className="news-title">{e.title}</b>
                    <span className="muted small-note num">{hm(e.ts)} IST · {countdown(e.untilMin)} · {e.country || 'own'}{e.forecast ? ` · forecast ${e.forecast}` : ''}{e.previous ? ` · previous ${e.previous}` : ''}</span>
                    <span className="small-note">India impact {e.india.level}: {e.india.why} <span className="muted">Lands {against(e.ts)}.</span></span>
                  </div>
                  {e.own && <button className="ibtn" aria-label="Delete this event" title="Delete" onClick={() => void api(`/news/events?id=${e.id}`, { method: 'DELETE' }).then(() => { load(); onChanged(); })}><Icon name="trash" size={18} /></button>}
                </div>
                {e.verdict && e.india.level !== 'LOW' && (
                  <div className="verdict">
                    <span className="small-note muted">Verdict for the Indian market</span>
                    <div className="vgrid">
                      <SideBox s={e.verdict.higher} head="If the number is higher than forecast:" />
                      <SideBox s={e.verdict.lower} head="If it is lower:" />
                    </div>
                    <p className="small-note muted">{e.verdict.note} An in-line result usually moves little; other news arrives at the same time. General reasoning, not a prediction.</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** A one-line strip with the next HIGH India-impact event inside 48 hours (used on the Dashboard). */
export function NextEvent() {
  const [e, setE] = useState<Ev | null>(null);
  useEffect(() => {
    const load = (): void => void api<Evs>('/news/events').then((r) => setE(r.items.find((x) => x.india.level === 'HIGH' && x.untilMin > -30 && x.untilMin < 2880) ?? null)).catch(() => undefined);
    load();
    const t = window.setInterval(load, 120000);
    return () => window.clearInterval(t);
  }, []);
  if (!e) return null;
  return <a className="next-event" href="#/news" title="Open News & events"><Icon name="bell" size={16} /> <b>Next HIGH event:</b> {e.title} · {hm(e.ts)} IST · {countdown(e.untilMin)} · {against(e.ts)}</a>;
}

/** Headlines with impact tags, and the economic calendar with the India reading of each event. */
export function News() {
  const [tab, setTab] = useState<'news' | 'events'>('news');
  const [, bump] = useState(0);
  return (
    <div className="page learn-page">
      <header className="page-head">
        <div>
          <h1>News &amp; events <Info text="Headlines from public feeds, each tagged HIGH, MED or LOW for how much it usually matters and which instruments to watch (a tag says what to watch, never which way). Upcoming lists scheduled events with the usual reading for Indian markets either way. Nothing here is scored or feeds a signal." /></h1>
          <p className="sub">Headlines tagged by impact, and the events coming up, with what they can mean for India.</p>
        </div>
      </header>
      <NextEvent key={String(bump)} />
      <div className="seg" role="tablist" aria-label="News sections">
        <button role="tab" aria-selected={tab === 'news'} className={tab === 'news' ? 'on' : ''} onClick={() => setTab('news')}>News</button>
        <button role="tab" aria-selected={tab === 'events'} className={tab === 'events' ? 'on' : ''} onClick={() => setTab('events')}>Upcoming</button>
      </div>
      {tab === 'news' ? <Headlines /> : <Events onChanged={() => bump((n) => n + 1)} />}
      <p className="small-note muted">General macro reasoning and keyword tags, not predictions and not back-tested. RSS feeds can be a few minutes late.</p>
    </div>
  );
}
