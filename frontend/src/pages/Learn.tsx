import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { Info } from '../components/Info';
import { IDEAS, TIPS } from './learnContent';

interface Item { id: string; source: string; sourceName: string; topic: string; title: string; link: string; ts: number; summary: string }
interface List { items: Item[]; sources: { id: string; name: string; topic: string }[]; errors: Record<string, string>; at: number }
interface Article { item: Item; html: string }

const READ_KEY = 'groot.learn.read';
const SAVE_KEY = 'groot.learn.saved';
const TOPICS = ['All', 'India', 'Investing', 'Trading & quant'] as const;

const load = (k: string): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(k) ?? '[]') as string[]); } catch { return new Set(); }
};
const store = (k: string, s: Set<string>): void => {
  try { localStorage.setItem(k, JSON.stringify([...s].slice(-600))); } catch { /* not remembered */ }
};
const ago = (ts: number): string => {
  if (!ts) return '';
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  const d = Math.round(m / 1440);
  return d < 31 ? `${d} d ago` : new Date(ts).toISOString().slice(0, 10);
};
const mins = (html: string): number => Math.max(1, Math.round(html.replace(/<[^>]+>/g, ' ').split(/\s+/).length / 220));

function Reader({ item, saved, onSave, onBack }: { item: Item; saved: boolean; onSave: () => void; onBack: () => void }) {
  const [a, setA] = useState<Article | null | 'err'>(null);
  useEffect(() => {
    let live = true;
    setA(null);
    api<Article>(`/learn/article?id=${item.id}`).then((r) => live && setA(r)).catch(() => live && setA('err'));
    return () => { live = false; };
  }, [item.id]);
  return (
    <article className="learn-reader">
      <div className="learn-rbar">
        <button className="ibtn" aria-label="Back to the list" title="Back" onClick={onBack}><Icon name="left" size={18} /></button>
        <button className={`ibtn${saved ? ' on' : ''}`} aria-label={saved ? 'Remove from saved' : 'Save for later'} title={saved ? 'Saved' : 'Save for later'} onClick={onSave}><Icon name="pin" size={18} /></button>
        <a className="ibtn" href={item.link} target="_blank" rel="noopener noreferrer" aria-label="Open the original" title="Open the original"><Icon name="right" size={18} /></a>
      </div>
      <h2>{item.title}</h2>
      <p className="muted small-note">{item.sourceName} · {ago(item.ts)}{a && a !== 'err' && a.html ? ` · ${mins(a.html)} min read` : ''}</p>
      {a === null ? <p className="muted">Loading…</p> : a === 'err' ? <p className="muted">Could not load the text. Use the arrow to open the original.</p> : a.html ? (
        <div className="learn-body" dangerouslySetInnerHTML={{ __html: a.html }} />
      ) : (
        <>
          <p>{item.summary}</p>
          <p className="muted small-note">This site only shares a summary in its feed. <a href={item.link} target="_blank" rel="noopener noreferrer">Open the original</a> for the full article.</p>
        </>
      )}
    </article>
  );
}

/** Shuffled, no repeats until every entry has been shown. */
function useDeck(n: number): [number, () => void] {
  const [order, setOrder] = useState<number[]>(() => shuffle(n));
  const [pos, setPos] = useState(0);
  const next = (): void => {
    if (pos + 1 >= order.length) { setOrder(shuffle(n)); setPos(0); } else setPos(pos + 1);
  };
  return [order[pos] ?? 0, next];
}
function shuffle(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

function Ideas() {
  const [t, nextTip] = useDeck(TIPS.length);
  const [d, nextIdea] = useDeck(IDEAS.length);
  const [all, setAll] = useState(false);
  const tip = TIPS[t]!;
  return (
    <div className="learn-ideas">
      <section className="card">
        <div className="card-head"><h2>Did you know</h2><button className="ibtn" aria-label="Another one" title="Another one" onClick={nextTip}><Icon name="refresh" size={18} /></button></div>
        <h3>{tip.title}</h3>
        <p>{tip.body}</p>
        <p className="small-note muted">{tip.source}</p>
      </section>
      <section className="card">
        <div className="card-head"><h2>An idea to try</h2><Info text="Process ideas for studying your own trading. They are not signals." /><button className="ibtn" aria-label="Another one" title="Another one" onClick={nextIdea}><Icon name="refresh" size={18} /></button></div>
        <p>{IDEAS[d]}</p>
      </section>
      <button className="btn" onClick={() => setAll(!all)}>{all ? 'Hide the full list' : `Show all ${TIPS.length} concepts and ${IDEAS.length} ideas`}</button>
      {all && (
        <section className="card learn-all">
          <h3>Concepts</h3>
          <ul>{TIPS.map((x) => <li key={x.title}><b>{x.title}.</b> {x.body} <span className="muted small-note">{x.source}</span></li>)}</ul>
          <h3>Ideas</h3>
          <ul>{IDEAS.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      )}
      <p className="small-note muted">The concepts are written in our own words with a pointer to where they are covered in depth; they have not been checked line by line against those books, so verify a figure before you rely on it.</p>
    </div>
  );
}

/** Reading material for waiting time: articles from public blogs plus short concepts and ideas. Nothing here is a signal. */
export function Learn() {
  const [tab, setTab] = useState<'articles' | 'ideas'>('articles');
  const [data, setData] = useState<List | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [topic, setTopic] = useState<(typeof TOPICS)[number] | 'Saved'>('All');
  const [find, setFind] = useState('');
  const [read, setRead] = useState<Set<string>>(() => load(READ_KEY));
  const [saved, setSaved] = useState<Set<string>>(() => load(SAVE_KEY));
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pull = (force: boolean): void => {
    setBusy(true);
    api<List>(`/learn/articles${force ? '?force=1' : ''}`).then((r) => { setData(r); setErr(null); }).catch((e: Error) => setErr(e.message)).finally(() => setBusy(false));
  };
  useEffect(() => { pull(false); }, []);

  const items = useMemo(() => {
    const n = find.trim().toLowerCase();
    return (data?.items ?? []).filter((i) => (topic === 'All' || (topic === 'Saved' ? saved.has(i.id) : i.topic === topic)) && (!n || `${i.title} ${i.sourceName} ${i.summary}`.toLowerCase().includes(n)));
  }, [data, topic, find, saved]);
  const unread = (data?.items ?? []).filter((i) => !read.has(i.id)).length;
  const open = openId ? data?.items.find((i) => i.id === openId) : undefined;
  const mark = (id: string): void => { const s = new Set(read).add(id); setRead(s); store(READ_KEY, s); };
  const toggleSave = (id: string): void => { const s = new Set(saved); if (s.has(id)) s.delete(id); else s.add(id); setSaved(s); store(SAVE_KEY, s); };
  const failed = Object.entries(data?.errors ?? {});

  return (
    <div className="page learn-page">
      <header className="page-head">
        <div>
          <h1>Learn &amp; ideas <Info text="Reading for waiting time: articles from public blogs (Zerodha Varsity, Freefincal, Capitalmind, Damodaran and others), short concepts and process ideas. Separate from the News panel; nothing here is scored or sent anywhere." /></h1>
          <p className="sub">Articles from public blogs, short concepts and ideas to study your own trading.</p>
        </div>
      </header>
      <div className="seg" role="tablist" aria-label="Learn sections">
        <button role="tab" aria-selected={tab === 'articles'} className={tab === 'articles' ? 'on' : ''} onClick={() => setTab('articles')}>Articles{unread ? ` · ${unread}` : ''}</button>
        <button role="tab" aria-selected={tab === 'ideas'} className={tab === 'ideas' ? 'on' : ''} onClick={() => setTab('ideas')}>Ideas &amp; facts</button>
      </div>
      {tab === 'ideas' ? <Ideas /> : open ? (
        <Reader item={open} saved={saved.has(open.id)} onSave={() => toggleSave(open.id)} onBack={() => setOpenId(null)} />
      ) : (
        <>
          <div className="learn-bar">
            <div className="shorts-bar" role="group" aria-label="Topic">
              {[...TOPICS, 'Saved' as const].map((t) => <button key={t} className={`chip${topic === t ? ' on' : ''}`} onClick={() => setTopic(t)}>{t}{t === 'Saved' ? ` ${saved.size}` : ''}</button>)}
            </div>
            <input type="search" placeholder="Search articles" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Search articles" />
            <button className="ibtn" aria-label="Reload the feeds" title="Reload" disabled={busy} onClick={() => pull(true)}><Icon name="refresh" size={18} /></button>
            <button className="ibtn" aria-label="Mark all as read" title="Mark all read" onClick={() => { const s = new Set([...read, ...(data?.items ?? []).map((i) => i.id)]); setRead(s); store(READ_KEY, s); }}><Icon name="eye" size={18} /></button>
          </div>
          {err && <p className="banner err">{err}</p>}
          {failed.length > 0 && <p className="small-note warn-note">Could not read: {failed.map(([k, v]) => `${data?.sources.find((s) => s.id === k)?.name ?? k} (${v})`).join(', ')}.</p>}
          {!data && !err && <p className="muted">Loading the feeds… the first read takes a few seconds.</p>}
          {data && !items.length && <p className="muted">{topic === 'Saved' ? 'Nothing saved yet. Open an article and use the pin.' : 'No articles match.'}</p>}
          <ul className="learn-list">
            {items.map((i) => (
              <li key={i.id} className={read.has(i.id) ? 'read' : 'unread'}>
                <button onClick={() => { setOpenId(i.id); mark(i.id); }}>
                  <b>{i.title}</b>
                  <span className="muted small-note">{i.sourceName} · {ago(i.ts)}{saved.has(i.id) ? ' · saved' : ''}</span>
                  {i.summary && <span className="learn-sum">{i.summary}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
