import { useEffect, useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { Info } from '../components/Info';

interface Lim { queued: number; background: number; total: number; lastMinute: number; lastAt: number | null }
interface Status {
  now: number;
  ticker: { state: string; subscribedCount: number; reconnects: number; connectedAt: number; lastTickAt: number; ticksSeen: number; ticksPerSec: number; lastTickAgeSec: number | null };
  subs: { followed: number; lastSync: number | null; error: string | null; ceiling: number };
  series: { series: number; fresh: number; stale: number; lastTicks: number };
  groups: { group: string; followed: number; seeded: number; fresh: number; stale: number; ticking: number; waiting: number }[];
  pulse: { seq: number; at: number; lastMs: number; runs: number; failures: number; lastError: string | null; running: boolean } | null;
  preseed: { running: boolean; total: number; done: number; failed: number; startedAt: number; finishedAt: number };
  check: { at: number; running: boolean; rows: { label: string; group: string; matched: number; exact: number; onlyKite: number; maxPriceDiff: number; volumeRatio: number | null; verdict: string }[] };
  history: { served: number; servedLastMinute: number; seeds: number; fallback: Record<string, number>; kiteCalls: number; limiter: Record<string, Lim> };
}
interface Row { token: number; label: string; group: string; seeded: boolean; fresh: boolean; src: string | null; candles: number; lastCandle: string | null; ticks: number; tickAgeSec: number | null; ltp: number | null; oi: number | null; volume: number | null; hasTick: boolean }
interface Ev { at: number; kind: string; text: string }
interface Verify { error?: string; label: string; day: string; live: number; kite: number; matched: number; onlyLive: number; onlyKite: number; exact: number; maxPriceDiff: number; volumeLive: number; volumeKite: number; volumeRatio: number | null; oiLast: { live: number | null; kite: number | null } | null; rows: { time: string; live: number[]; kite: number[]; note: string }[]; verdict: string }

const hms = (ms: number): string => new Date(ms + 19800000).toISOString().slice(11, 19);
const n0 = (n: number | null | undefined): string => (n == null ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 }));
const age = (s: number | null): string => (s == null ? '—' : s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`);
const STATE_TONE: Record<string, string> = { connected: 'ok', connecting: 'warn', reconnecting: 'warn', stopped: 'err' };
const GROUPS = ['All', 'Spot and indices', 'Futures', 'Index options', 'Stock options', 'MCX', 'Opened on demand'];

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return <div className={`eng-stat${tone ? ` ${tone}` : ''}`}><span className="muted">{label}</span><b className="num">{value}</b>{sub && <small className="muted">{sub}</small>}</div>;
}
function Bar({ part, of, cls }: { part: number; of: number; cls?: string }) {
  return <span className="eng-bar"><i className={cls} style={{ width: `${of ? Math.min(100, (part / of) * 100) : 0}%` }} /></span>;
}
function pill(r: Row): [string, string] {
  if (!r.seeded) return r.hasTick ? ['ticks only', 'warn'] : ['waiting', 'muted'];
  if (!r.fresh) return ['stale', 'err'];
  return r.hasTick ? ['live', 'ok'] : ['silent', 'warn'];
}

/** What the live data engine is doing behind the screens: the ticker, what it follows, what is served from ticks instead of Kite, and a check against Kite. */
export function Engine() {
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<{ rows: Row[]; total: number } | null>(null);
  const [ev, setEv] = useState<Ev[]>([]);
  const [group, setGroup] = useState('All');
  const [only, setOnly] = useState('');
  const [find, setFind] = useState('');
  const [ver, setVer] = useState<Verify | 'busy' | null>(null);
  const [ses, setSes] = useState<{ nse: { day: string; ticking: boolean; lastTickAt: number | null; source: string; recent?: string[] }; mcx: { day: string; ticking: boolean; lastTickAt: number | null; source: string; recent?: string[] }; error: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    const load = (): void => {
      api<Status>('/engine/status').then((r) => live && (setS(r), setErr(null))).catch((e: Error) => live && setErr(e.message));
      api<NonNullable<typeof ses>>('/session').then((r) => live && setSes(r)).catch(() => undefined);
      api<{ events: Ev[] }>('/engine/events').then((r) => live && setEv(r.events)).catch(() => undefined);
    };
    load();
    const t = window.setInterval(load, 3000);
    return () => { live = false; window.clearInterval(t); };
  }, []);
  useEffect(() => {
    let live = true;
    const load = (): void => {
      const p = new URLSearchParams({ group, only, q: find, limit: '150' });
      api<{ rows: Row[]; total: number }>(`/engine/series?${p}`).then((r) => live && setRows(r)).catch(() => undefined);
    };
    load();
    const t = window.setInterval(load, 4000);
    return () => { live = false; window.clearInterval(t); };
  }, [group, only, find]);

  const check = (token: number): void => {
    setVer('busy');
    api<Verify>(`/engine/verify?token=${token}`).then(setVer).catch((e: Error) => setVer({ error: e.message } as Verify));
  };
  const t = s?.ticker;
  const total = (s?.history.served ?? 0) + Object.values(s?.history.fallback ?? {}).reduce((a, b) => a + b, 0);
  const fb = Object.entries(s?.history.fallback ?? {}).filter(([, v]) => v > 0);

  return (
    <div className="page eng-page">
      <header className="page-head">
        <div>
          <h1>Data engine <Info text="What happens behind the screens. The server follows prices over Kite's live ticker. A contract's 5-minute candles are read from Kite once, then kept current from ticks, and every later read of today is answered from memory instead of asking Kite again. A reconnect makes every series stale, so it is read once more." /></h1>
          <p className="sub">The live feed, what it follows, and how much of the work no longer goes to Kite.</p>
        </div>
      </header>
      {err && <p className="banner err">{err}</p>}
      {!s && !err && <p className="muted">Loading…</p>}
      {s && t && (
        <>
          <section className="card">
            <div className="card-head"><h2>Live feed</h2><Info text="The WebSocket ticker. In full mode each tick carries price, volume, open interest, day VWAP and depth." /><span className={`pill ${STATE_TONE[t.state] ?? 'warn'}`}>{t.state}</span></div>
            <div className="eng-stats">
              <Stat label="Ticks per second" value={String(t.ticksPerSec)} sub={`${t.ticksSeen.toLocaleString('en-IN')} since start`} />
              <Stat label="Last tick" value={t.lastTickAgeSec == null ? '—' : `${t.lastTickAgeSec}s ago`} tone={t.lastTickAgeSec != null && t.lastTickAgeSec > 120 ? 'warn' : ''} />
              <Stat label="Following" value={`${s.subs.followed}`} sub={`of ${s.subs.ceiling} allowed · ticker has ${t.subscribedCount}`} />
              <Stat label="Reconnects" value={String(t.reconnects)} sub={t.connectedAt ? `connected ${hms(t.connectedAt)}` : 'not connected'} tone={t.reconnects > 3 ? 'warn' : ''} />
            </div>
            <Bar part={s.subs.followed} of={s.subs.ceiling} />
            {s.subs.error && <p className="small-note warn-note">Subscription plan failed: {s.subs.error}</p>}
          </section>

          {ses && (
            <section className="card">
              <div className="card-head"><h2>Market sessions</h2><Info text="Decided by the data, not a holiday list. A market shows today when it already has a daily candle for today (it has traded), otherwise its latest session, so holidays need no calendar. A market counts as trading while its reference instrument (NIFTY 50, a commodity future) is ticking." /></div>
              <div className="eng-stats">
                {([['NSE', ses.nse], ['MCX', ses.mcx]] as const).map(([n, m]) => (
                  <div key={n} className={`eng-stat ${m.ticking ? 'ok' : ''}`}>
                    <span className="muted">{n} · {m.ticking ? 'ticking now' : 'not ticking'}</span>
                    <b className="num">{m.day}</b>
                    <small className="muted">{m.source === 'data' ? 'day read from daily candles' : 'day from the calendar (data not read yet)'}{m.lastTickAt ? ` · last tick ${hms(m.lastTickAt)}` : ''}{m.recent?.length ? ` · latest sessions read: ${m.recent.join(', ')}` : ''}</small>
                  </div>
                ))}
              </div>
              {ses.error && <p className="small-note warn-note">Could not read a market's daily candles: {ses.error}. The calendar answer is used meanwhile.</p>}
            </section>
          )}

          <section className="card">
            <div className="card-head"><h2>Live recompute</h2><Info text="While the market is open the server rebuilds the market read about once a minute from the tick-built candles and raises a counter. Screens on Auto fetch again each time it goes up, so nothing waits for the 5-minute close. OI/OBV, the futures remark, max pain, consensus and plans are computed from the candles on every request, so they are always current." />
              <span className={`pill ${s.pulse?.running ? 'warn' : s.pulse && s.pulse.runs > 0 ? 'ok' : ''}`}>{s.pulse?.running ? 'computing' : s.pulse && s.pulse.runs > 0 ? 'running' : 'waiting'}</span></div>
            <div className="eng-stats">
              <Stat label="Last recompute" value={s.pulse?.at ? hms(s.pulse.at) : '—'} sub={s.pulse?.at ? `${((s.pulse.lastMs) / 1000).toFixed(1)} s to compute` : 'starts when the market is open and the feed is connected'} />
              <Stat label="Recomputes today" value={String(s.pulse?.runs ?? 0)} sub={`pulse ${s.pulse?.seq ?? 0}`} />
              <Stat label="Failures" value={String(s.pulse?.failures ?? 0)} tone={s.pulse?.failures ? 'warn' : ''} sub={s.pulse?.lastError ?? undefined} />
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Ticks instead of Kite</h2><Info text="Reads of today's 5-minute candles that were answered from tick-built series (no Kite call), against reads that had to go to Kite, and why." /></div>
            <div className="eng-stats">
              <Stat label="Answered from ticks" value={s.history.served.toLocaleString('en-IN')} sub={`${s.history.servedLastMinute} in the last minute`} tone="ok" />
              <Stat label="Read from Kite" value={s.history.kiteCalls.toLocaleString('en-IN')} sub={`${s.history.limiter['history']?.lastMinute ?? 0} history calls in the last minute`} />
              <Stat label="Share from ticks" value={total ? `${Math.round((s.history.served / total) * 100)}%` : '—'} sub="of today's 5-minute reads" />
              <Stat label="Series built" value={`${s.series.fresh}`} sub={`${s.series.stale} stale · ${s.history.seeds} seeds so far`} tone={s.series.stale ? 'warn' : ''} />
            </div>
            {fb.length > 0 && (
              <p className="small-note">Why a read went to Kite: {fb.map(([k, v]) => `${k} ${v}`).join(' · ')}</p>
            )}
            <p className="small-note muted">Kite queue: {Object.entries(s.history.limiter).map(([k, v]) => `${k} ${v.queued} waiting${v.background ? ` (+${v.background} background)` : ''}`).join(' · ')}</p>
          </section>

          <section className="card">
            <div className="card-head"><h2>Start-of-day load</h2><Info text="Reads each followed contract from Kite once, in the background and behind anything you ask for, so the first screens of the day already find them in memory. Runs by itself after the feed connects on a trading day; strikes that move into range are added as the price moves." />
              <button className="ibtn" aria-label="Load now" title="Load now" disabled={s.preseed.running} onClick={() => void api('/engine/preseed', { method: 'POST' })}><Icon name="refresh" size={16} /></button></div>
            {s.preseed.total === 0 ? <p className="muted">Not run yet today. It starts by itself once the feed is connected on a trading day.</p> : (
              <>
                <Bar part={s.preseed.done} of={s.preseed.total} cls="ok" />
                <p className="small-note">{s.preseed.running ? 'Reading' : 'Read'} {s.preseed.done} of {s.preseed.total} contracts{s.preseed.failed ? ` · ${s.preseed.failed} failed` : ''}{s.preseed.finishedAt ? ` · finished ${hms(s.preseed.finishedAt)}` : ''}</p>
              </>
            )}
          </section>

          <section className="card">
            <div className="card-head"><h2>Accuracy check</h2><Info text="A sample of tick-built series (three per group) compared with Kite's own candles for today. Runs by itself after the NSE close; press the button to run it now." />
              <button className="ibtn" aria-label="Run the check now" title="Run now" disabled={s.check.running} onClick={() => void api('/engine/check', { method: 'POST' })}><Icon name="eye" size={16} /></button></div>
            {s.check.running ? <p className="muted">Comparing with Kite…</p> : !s.check.rows.length ? <p className="muted">No check yet today.</p> : (
              <>
                <p className="small-note">{s.check.rows.filter((r) => r.onlyKite === 0 && r.maxPriceDiff < 1e-6).length} of {s.check.rows.length} sampled contracts match Kite on every price · {hms(s.check.at)}</p>
                <div className="table-wrap"><table className="eng-table"><thead><tr><th>Contract</th><th className="num">Identical</th><th className="num">Missing</th><th className="num">Volume</th><th>Result</th></tr></thead>
                  <tbody>{s.check.rows.map((r) => <tr key={r.label}><td>{r.label}<br /><small className="muted">{r.group}</small></td><td className="num">{r.exact} / {r.matched}</td><td className="num">{r.onlyKite}</td><td className="num">{r.volumeRatio == null ? '—' : `${(r.volumeRatio * 100).toFixed(1)}%`}</td><td>{r.verdict}</td></tr>)}</tbody></table></div>
              </>
            )}
          </section>

          <section className="card">
            <div className="card-head"><h2>What it follows</h2><Info text="Spot and index prices, the nearest futures of every stock, the index option strikes around the money (two expiries), the heavyweight stocks' strikes and the MCX contracts. Other stock options are subscribed when you open that name." /></div>
            <div className="table-wrap"><table className="eng-table">
              <thead><tr><th>Group</th><th className="num">Following</th><th className="num">Ticking</th><th className="num">Candles built</th><th className="num">Stale</th><th className="num">Waiting</th><th>Coverage</th></tr></thead>
              <tbody>{s.groups.map((g) => (
                <tr key={g.group}><td>{g.group}</td><td className="num">{g.followed}</td><td className="num">{g.ticking}</td><td className="num">{g.fresh}</td><td className={`num${g.stale ? ' dn' : ''}`}>{g.stale}</td><td className="num muted">{g.waiting}</td><td><Bar part={g.ticking} of={g.followed} cls="ok" /></td></tr>
              ))}</tbody>
            </table></div>
            <p className="small-note muted">"Candles built" are contracts whose candles were read from Kite once and are now kept current by ticks. Contracts nobody has asked for yet are followed (price, OI and volume arrive) but have no series until a screen needs them.</p>
          </section>

          <section className="card">
            <div className="card-head"><h2>Contracts</h2><span className="muted num">{rows ? `${rows.rows.length} of ${rows.total}` : ''}</span></div>
            <div className="learn-bar">
              <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Group">{GROUPS.map((g) => <option key={g}>{g}</option>)}</select>
              <select value={only} onChange={(e) => setOnly(e.target.value)} aria-label="Show"><option value="">All states</option><option value="stale">Stale only</option><option value="unseeded">Not read yet</option><option value="silent">No tick yet</option></select>
              <input type="search" placeholder="Search a contract, e.g. NIFTY, RELIANCE, 24000" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Search a contract" />
            </div>
            <div className="table-wrap"><table className="eng-table">
              <thead><tr><th>Contract</th><th>State</th><th className="num">Candles</th><th>Last candle</th><th className="num">Ticks</th><th className="num">Last tick</th><th className="num">LTP</th><th className="num">OI</th><th className="num">Volume</th><th /></tr></thead>
              <tbody>{(rows?.rows ?? []).map((r) => {
                const [label, tone] = pill(r);
                return (
                  <tr key={r.token}>
                    <td title={`${r.group} · token ${r.token}${r.src ? ` · seeded by ${r.src}` : ''}`}>{r.label}<br /><small className="muted">{r.group}</small></td>
                    <td><span className={`pill ${tone}`}>{label}</span></td>
                    <td className="num">{r.candles || '—'}</td>
                    <td className="num">{r.lastCandle ? r.lastCandle.slice(11, 16) : '—'}</td>
                    <td className="num">{r.ticks || '—'}</td>
                    <td className="num">{age(r.tickAgeSec)}</td>
                    <td className="num">{n0(r.ltp)}</td>
                    <td className="num">{n0(r.oi)}</td>
                    <td className="num">{n0(r.volume)}</td>
                    <td>{r.seeded && <button className="ibtn" aria-label={`Check ${r.label} against Kite`} title="Check against Kite" onClick={() => check(r.token)}><Icon name="eye" size={16} /></button>}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            {rows && !rows.rows.length && <p className="muted">Nothing matches.</p>}
          </section>

          {ver && (
            <section className="card">
              <div className="card-head"><h2>Check against Kite</h2><button className="ibtn" aria-label="Close" title="Close" onClick={() => setVer(null)}><Icon name="plus" size={16} /></button></div>
              {ver === 'busy' ? <p className="muted">Reading Kite's candles for comparison…</p> : ver.error ? <p className="banner err">{ver.error}</p> : (
                <>
                  <p><b>{ver.label}</b> · {ver.day}: {ver.verdict}</p>
                  <div className="eng-stats">
                    <Stat label="Candles" value={`${ver.live} / ${ver.kite}`} sub="tick-built / Kite" />
                    <Stat label="Identical" value={`${ver.exact} of ${ver.matched}`} sub="OHLC, volume, OI" tone={ver.exact === ver.matched ? 'ok' : 'warn'} />
                    <Stat label="Volume" value={ver.volumeRatio == null ? '—' : `${(ver.volumeRatio * 100).toFixed(1)}%`} sub={`${n0(ver.volumeLive)} vs ${n0(ver.volumeKite)}`} />
                    <Stat label="Open interest (last)" value={ver.oiLast ? `${n0(ver.oiLast.live)} vs ${n0(ver.oiLast.kite)}` : 'n/a'} />
                  </div>
                  {ver.rows.length > 0 && (
                    <div className="table-wrap"><table className="eng-table"><thead><tr><th>Time</th><th>Tick-built (O H L C V)</th><th>Kite (O H L C V)</th><th>Note</th></tr></thead>
                      <tbody>{ver.rows.map((r) => <tr key={r.time + r.note}><td className="num">{r.time}</td><td className="num">{r.live.join(' · ') || '—'}</td><td className="num">{r.kite.join(' · ') || '—'}</td><td>{r.note}</td></tr>)}</tbody></table></div>
                  )}
                  <p className="small-note muted">The candle still forming differs by nature. Volume and open interest can differ a little because ticks are sampled.</p>
                </>
              )}
            </section>
          )}

          <section className="card">
            <div className="card-head"><h2>What just happened</h2><Info text="Subscriptions, new days and errors, newest first." /></div>
            {!ev.length ? <p className="muted">Nothing yet.</p> : <ul className="eng-log">{ev.slice(0, 60).map((e, i) => <li key={i}><span className="num muted">{hms(e.at)}</span> <span className={`pill ${e.kind === 'error' ? 'err' : 'muted'}`}>{e.kind}</span> {e.text}</li>)}</ul>}
          </section>
        </>
      )}
    </div>
  );
}
