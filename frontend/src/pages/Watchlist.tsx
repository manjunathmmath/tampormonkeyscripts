import { useEffect, useMemo, useRef, useState } from 'react';
import { Info } from '../components/Info';
import { api, universe } from '../api';
import { useLiveTicks, type LiveTick } from '../lib/live';
import { nf, nfi, signed, tone } from '../lib/format';
import { Loading } from './DashboardPanels';
import { IconButton } from '../components/IconButton';
import { TrackBell, useTracked } from '../components/TrackBell';

interface Item { token: number; label: string; sub?: string }
interface Group { id: string; name: string; items: Item[]; live?: boolean }
interface InstRow { symbol: string; name: string; exchange: string; type: string; expiry: string; strike: number; lot: number; token: number }
interface QuoteRow { instrument_token: number; last_price: number; volume?: number; oi?: number; net_change?: number; ohlc: { open: number; high: number; low: number; close: number } }

const SORTS = ['List order', 'Name', 'Change %', 'LTP'] as const;
type Sort = (typeof SORTS)[number];
const KEY_G = 'groot.watch.group';
const KEY_S = 'groot.watch.sort';

const pctOf = (t: { ltp: number; prevClose: number } | undefined): number | null => (t && t.prevClose ? ((t.ltp - t.prevClose) / t.prevClose) * 100 : null);

function Flash({ v, children }: { v: number | undefined; children: React.ReactNode }) {
  const prev = useRef<number | undefined>(v);
  const [cls, setCls] = useState('');
  useEffect(() => {
    if (prev.current !== undefined && v !== undefined && v !== prev.current) {
      setCls(v > prev.current ? 'fl-up' : 'fl-dn');
      const t = window.setTimeout(() => setCls(''), 600);
      prev.current = v;
      return () => window.clearTimeout(t);
    }
    prev.current = v;
    return undefined;
  }, [v]);
  return <span className={`wl-flash ${cls}`}>{children}</span>;
}

/** Day range: where the price sits between the day's low and high. */
function RangeBar({ t }: { t: { ltp: number; high: number; low: number } | undefined }) {
  if (!t || !(t.high > t.low)) return <span className="muted">—</span>;
  const p = Math.max(0, Math.min(100, ((t.ltp - t.low) / (t.high - t.low)) * 100));
  return (
    <span className="wl-range" title={`Low ${nf(t.low)} · High ${nf(t.high)}`}>
      <i style={{ left: `${p}%` }} />
    </span>
  );
}

function Add({ onAdd, have }: { onAdd: (r: InstRow) => void; have: Set<number> }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'cash' | 'fut' | 'opt'>('cash');
  const [rows, setRows] = useState<InstRow[] | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) {
      setRows(null);
      return;
    }
    const t = setTimeout(() => {
      api<{ rows: InstRow[] }>(`/data/instruments?q=${encodeURIComponent(q)}&kind=${kind}`).then((r) => setRows(r.rows.slice(0, 40))).catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, kind]);
  return (
    <div className="wl-add">
      <input type="search" placeholder="Search to add, e.g. infy, nifty fut, gold" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search instruments to add" />
      <div className="chips" role="group" aria-label="Kind">
        {([['cash', 'Stocks, indices'], ['fut', 'Futures'], ['opt', 'Options']] as const).map(([k, l]) => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{l}</button>)}
      </div>
      {rows && (
        <ul className="wl-results">
          {rows.map((r) => (
            <li key={r.token}>
              <span><b>{r.symbol}</b> <small className="muted">{r.exchange} {r.type !== 'EQ' && r.type ? r.type : ''} {r.expiry}</small></span>
              <IconButton icon={have.has(r.token) ? 'check' : 'plus'} label={have.has(r.token) ? `${r.symbol} is already in the group` : `Add ${r.symbol}`} on={have.has(r.token)} disabled={have.has(r.token)} onClick={() => onAdd(r)} />
            </li>
          ))}
          {!rows.length && <li className="muted">No match.</li>}
        </ul>
      )}
    </div>
  );
}

/** A live watchlist (like Kite's marketwatch): groups of instruments, prices from the ticker stream, quick actions per row. */
export function Watchlist({ go }: { go: (p: string) => void }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [custom, setCustom] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [gid, setGid] = useState<string>(() => localStorage.getItem(KEY_G) ?? '');
  const [sort, setSort] = useState<Sort>(() => (localStorage.getItem(KEY_S) as Sort) || 'List order');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [names, setNames] = useState<Record<string, number>>({});
  const [quotes, setQuotes] = useState<Record<number, QuoteRow>>({});

  useEffect(() => {
    api<{ groups: Group[]; custom: boolean }>('/watchlist').then((r) => { setGroups(r.groups); setCustom(r.custom); }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    universe().then((u) => setNames(u.names)).catch(() => undefined);
  }, []);
  const group = groups?.find((g) => g.id === gid) ?? groups?.[0];
  useEffect(() => { if (group) try { localStorage.setItem(KEY_G, group.id); } catch { /* kept for this visit */ } }, [group?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(KEY_S, sort); } catch { /* kept for this visit */ } }, [sort]);

  const tokens = useMemo(() => (group ? group.items.map((i) => i.token).slice(0, 200) : []), [group]);
  const { ticks, state } = useLiveTicks(tokens, tokens.length > 0);
  // a first price for every row, also when the market is closed and no tick arrives
  useEffect(() => {
    if (!tokens.length) return;
    api<Record<string, QuoteRow>>(`/kite/quote?i=${tokens.slice(0, 100).join(',')}`)
      .then((q) => setQuotes((old) => ({ ...old, ...Object.fromEntries(Object.values(q).map((v) => [v.instrument_token, v])) })))
      .catch(() => undefined);
  }, [tokens]);

  const view = (it: Item): { ltp: number; prev: number; high: number; low: number; vol: number | null; oi: number | null } | undefined => {
    const t: LiveTick | undefined = ticks[it.token];
    if (t) return { ltp: t.ltp, prev: t.prevClose, high: t.high, low: t.low, vol: t.volume, oi: t.oi };
    const q = quotes[it.token];
    return q ? { ltp: q.last_price, prev: q.ohlc.close, high: q.ohlc.high, low: q.ohlc.low, vol: q.volume ?? null, oi: q.oi ?? null } : undefined;
  };

  const persist = async (next: Group[]): Promise<void> => {
    setGroups(next);
    setCustom(true);
    try {
      await api('/watchlist', { method: 'PUT', body: { groups: next } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const edit = (f: (g: Group) => Group): void => {
    if (groups && group) void persist(groups.map((g) => (g.id === group.id ? f(g) : g)));
  };
  const addGroup = (): void => {
    const name = window.prompt('Name of the new group');
    if (!name?.trim() || !groups) return;
    const g: Group = { id: `g${Date.now().toString(36)}`, name: name.trim().slice(0, 40), items: [] };
    void persist([...groups, g]);
    setGid(g.id);
  };
  const rename = (): void => {
    const name = group && window.prompt('Rename the group', group.name);
    if (name?.trim()) edit((g) => ({ ...g, name: name.trim().slice(0, 40) }));
  };
  const del = (): void => {
    if (!groups || !group || groups.length < 2) return;
    if (window.confirm(`Delete the group "${group.name}"?`)) {
      void persist(groups.filter((g) => g.id !== group.id));
      setGid('');
    }
  };
  const reset = async (): Promise<void> => {
    if (!window.confirm('Go back to the built-in groups? Your own groups are removed.')) return;
    const r = await api<{ groups: Group[]; custom: boolean }>('/watchlist/reset', { method: 'POST', body: {} });
    setGroups(r.groups);
    setCustom(false);
    setGid('');
  };

  const rows = useMemo(() => {
    if (!group) return [];
    const r = group.items.map((it) => ({ it, v: view(it) }));
    if (sort === 'Name') r.sort((a, b) => a.it.label.localeCompare(b.it.label));
    if (sort === 'Change %') r.sort((a, b) => (pctOf(b.v && { ltp: b.v.ltp, prevClose: b.v.prev }) ?? -999) - (pctOf(a.v && { ltp: a.v.ltp, prevClose: a.v.prev }) ?? -999));
    if (sort === 'LTP') r.sort((a, b) => (b.v?.ltp ?? 0) - (a.v?.ltp ?? 0));
    return r;
  }, [group, ticks, quotes, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const adv = rows.filter((r) => r.v && r.v.ltp > r.v.prev).length;
  const dec = rows.filter((r) => r.v && r.v.ltp < r.v.prev).length;

  if (!groups) return <div className="page"><Loading what="the watchlist" err={err} /></div>;
  return (
    <div className="page watch-page">
      <header className="page-head">
        <div><h1>Watchlist</h1><p className="sub">Live prices from the ticker for the group you are looking at. {state === 'live' ? 'Streaming.' : state === 'off' ? '' : 'Connecting to the live feed…'}</p></div>
        <div className="head-actions"><IconButton icon={adding ? 'close' : 'plus'} label={adding ? 'Close the search' : group?.live ? 'This group follows the index weights and cannot be changed' : 'Add an instrument'} on={adding} disabled={!!group?.live} onClick={() => setAdding(!adding)} /></div>
      </header>
      <div className="chips wl-tabs" role="tablist" aria-label="Groups">
        {groups.map((g) => <button key={g.id} role="tab" aria-selected={group?.id === g.id} className={`chip ${group?.id === g.id ? 'on' : ''}`} onClick={() => setGid(g.id)}>{g.name} <small>{g.items.length}</small></button>)}
        <button className="chip" onClick={addGroup}>+ New group</button>
      </div>
      {adding && group && <Add have={new Set(group.items.map((i) => i.token))} onAdd={(r) => edit((g) => ({ ...g, items: [...g.items, { token: r.token, label: r.symbol, sub: `${r.exchange} ${r.type}${r.expiry ? ' ' + r.expiry : ''}${r.strike ? ' ' + r.strike : ''}`.trim() }].slice(0, 200) }))} />}
      {group && (
        <section className="card">
          <div className="wl-bar">
            <div className="wl-breadth" title={`${adv} up, ${dec} down`}>
              <span className="up">{adv} ▲</span>
              <span className="wl-bb"><i style={{ width: `${adv + dec ? (adv / (adv + dec)) * 100 : 50}%` }} /></span>
              <span className="dn">{dec} ▼</span>
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">{SORTS.map((s) => <option key={s}>{s}</option>)}</select>
            <IconButton icon="pencil" label="Rename the group" onClick={rename} disabled={!!group.live} />
            <IconButton icon="trash" label="Delete the group" onClick={del} disabled={groups.length < 2 || !!group.live} />
            {custom && <IconButton icon="refresh" label="Back to the built-in groups" onClick={() => void reset()} />}
          </div>
          {!group.items.length ? (
            <p className="muted">This group is empty. Use + Add instrument.</p>
          ) : (
            <div className="tablewrap">
              <table className="tbl wl-tbl">
                <thead><tr><th>Instrument</th><th className="num wl-hide">Change</th><th className="num">%</th><th className="num">LTP</th><th className="wl-hide">Day range</th><th className="num wl-hide">Volume</th><th className="num wl-hide">OI</th></tr></thead>
                <tbody>
                  {rows.map(({ it, v }) => {
                    const chg = v ? v.ltp - v.prev : null;
                    const pct = v && v.prev ? (chg! / v.prev) * 100 : null;
                    const known = names[it.label] != null;
                    return (
                      <>
                        <tr key={it.token} className={`wl-row ${tone(chg)}`} onClick={() => setOpen(open === it.token ? null : it.token)}>
                          <td><b>{it.label}</b>{it.sub && <small className="muted block">{it.sub}</small>}</td>
                          <td className={`num wl-hide ${tone(chg)}`}>{chg != null ? signed(chg, 2) : '—'}</td>
                          <td className={`num ${tone(chg)}`}>{pct != null ? `${signed(pct, 2)}%` : '—'}</td>
                          <td className="num"><Flash v={v?.ltp}><b>{v ? nf(v.ltp) : '—'}</b></Flash></td>
                          <td className="wl-hide"><RangeBar t={v} /></td>
                          <td className="num wl-hide">{v?.vol != null ? nfi(v.vol) : '—'}</td>
                          <td className="num wl-hide">{v?.oi ? nfi(v.oi) : '—'}</td>
                        </tr>
                        {open === it.token && (
                          <tr className="wl-actions"><td colSpan={7}>
                            {known && <IconButton icon="chart" label={`Open ${it.label} in the Chart View`} onClick={() => go(`chart/${encodeURIComponent(it.label)}`)} />}
                            {known && <IconButton icon="eye" label={`Detail of ${it.label}`} onClick={() => go(`instrument/${encodeURIComponent(it.label)}`)} />}
                            {known && <TrackBell name={it.label} />}
                            <IconButton icon="options" label="Option strikes (Trade)" onClick={() => go('strikes')} />
                            {!group.live && <IconButton icon="trash" label={`Remove ${it.label} from the group`} onClick={() => edit((g) => ({ ...g, items: g.items.filter((x) => x.token !== it.token) }))} />}
                          </td></tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="small-note">Tap a row for Chart, Detail, Strikes and Remove. The list is saved on the server, so it is the same on your phone. Only the group on screen is subscribed to the ticker (up to 200 instruments).</p>
        </section>
      )}
      <TrackingCard />
      {err && <p className="small-note warn-note">{err}</p>}
    </div>
  );
}

interface TrackItem { name: string; spot: number | null; nearestR: { price: number; label: string; distPct: number } | null; nearestS: { price: number; label: string; distPct: number } | null; error?: string; today: { at: number; stage: string; label: string; level: number }[] }

/** The tracked stocks: price, the nearest OI resistance and support wall, and what has already alerted today. */
function TrackingCard() {
  const { names, toggle } = useTracked();
  const [items, setItems] = useState<TrackItem[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = (): void => void api<{ items: TrackItem[] }>('/tracking').then((r) => live && setItems(r.items)).catch(() => undefined);
    load();
    const t = window.setInterval(load, 60000);
    return () => { live = false; window.clearInterval(t); };
  }, [names.join(',')]);
  return (
    <section className="card">
      <div className="card-head"><h2>Tracking</h2><Info k="Tracking" /><span className="muted">{names.length} stocks</span></div>
      <p className="small-note">Tap the bell on a stock (tap its row, then Track). While NSE is open you get an alert when its price comes within 0.6% of an OI support or resistance wall, and again when it is at it. The walls are option positioning, not a forecast.</p>
      {!names.length ? <p className="muted">No stocks tracked yet.</p> : !items ? <p className="muted">Reading the walls…</p> : (
        <ul className="trk-list">
          {items.map((t) => (
            <li key={t.name} className="trk">
              <div className="trk-top"><b>{t.name}</b><span className="num">{t.spot != null ? nf(t.spot) : '—'}</span><span className="muted">{t.error ?? ''}</span><span style={{ marginLeft: 'auto' }}><IconButton icon="close" label={`Stop tracking ${t.name}`} onClick={() => void toggle(t.name)} /></span></div>
              {t.nearestR && <div className="trk-lv"><span className="dn">R {t.nearestR.label} {nf(t.nearestR.price)}</span><span className="muted">{Math.abs(t.nearestR.distPct).toFixed(2)}% away</span></div>}
              {t.nearestS && <div className="trk-lv"><span className="up">S {t.nearestS.label} {nf(t.nearestS.price)}</span><span className="muted">{Math.abs(t.nearestS.distPct).toFixed(2)}% away</span></div>}
              {!t.error && !t.nearestR && !t.nearestS && <span className="muted">No OI walls found (the option chain may not be loaded yet).</span>}
              {t.today.map((a, i) => <div key={i} className="trk-al">{new Date(a.at).toLocaleTimeString('en-IN', { hour12: false })} · {a.stage === 'AT' ? 'at' : 'near'} {a.label} {Math.round(a.level)}</div>)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
