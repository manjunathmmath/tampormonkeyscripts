import { TelegramUpdates } from '../components/TelegramUpdates';
import { AutoRefreshSetting } from '../lib/refresh';
import { Info } from '../components/Info';
import { useState } from 'react';
import { api, BASE, type ActionResult, type ActivityEntry, type SystemInfo } from '../api';
import { Icon } from '../components/Icon';
import { getSnapshot, marketState, nfi, span } from '../lib/format';
import { usePoll } from '../lib/hooks';

type Tone = 'ok' | 'warn' | 'bad' | 'idle';

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`pill ${tone === 'ok' ? 'ok' : tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : ''}`}>
      <i className="dot" />
      {children}
    </span>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <b className="num">{v}</b>
    </div>
  );
}

const time = (t: number): string => new Date(t).toLocaleTimeString('en-IN', { hour12: false });

function ActivityRow({ e }: { e: ActivityEntry }) {
  const [open, setOpen] = useState(false);
  const has = e.data && Object.keys(e.data).length > 0;
  return (
    <li className={`act ${e.level}`}>
      <button className="act-line" onClick={() => has && setOpen(!open)} aria-expanded={has ? open : undefined} disabled={!has}>
        <i className={`dot lvl-${e.level}`} aria-hidden="true" />
        <span className="act-t num">{time(e.t)}</span>
        <span className="act-msg">{e.msg}</span>
        {has && <span className="act-more">{open ? 'hide' : 'details'}</span>}
      </button>
      {open && has && <pre className="act-data">{JSON.stringify(e.data, null, 2)}</pre>}
    </li>
  );
}

export function System({ go }: { go: (p: string) => void }) {
  const [s, setS] = useState<SystemInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ what: string; r: ActionResult } | null>(null);
  const [level, setLevel] = useState<'info' | 'warn'>('info');

  usePoll(async () => {
    try {
      setS(await api<SystemInfo>('/system'));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, 5000);

  const act = async (what: string, path: string) => {
    setBusy(what);
    try {
      const r = await api<ActionResult>(path, { method: 'POST' });
      setResult({ what, r });
      setS(await api<SystemInfo>('/system'));
    } catch (e) {
      setResult({ what, r: { ok: false, ms: 0, error: e instanceof Error ? e.message : String(e) } });
    } finally {
      setBusy(null);
    }
  };

  const ms = marketState();
  const now = s?.app.now ?? Date.now();
  const problems: { tone: Tone; text: string }[] = [];
  if (err) problems.push({ tone: 'bad', text: `The backend did not answer: ${err}` });
  if (s) {
    if (!s.kite.configured) problems.push({ tone: 'bad', text: 'KITE_API_KEY and KITE_API_SECRET are not set in the backend .env file.' });
    else if (s.kite.token !== 'valid') problems.push({ tone: 'warn', text: s.kite.token === 'expired' ? 'The Kite token has expired (tokens last until about 06:00 IST each day). Log in again.' : 'No Kite token yet. Log in to Kite to start.' });
    if (s.kite.token === 'valid' && !s.instruments.loaded) problems.push({ tone: 'warn', text: 'Instruments are not loaded yet. Press "Reload instruments".' });
    if (s.kite.token === 'valid' && ms.open && s.feed.state !== 'connected') problems.push({ tone: 'warn', text: `The live feed is ${s.feed.state.replace('_', ' ')} while the market is open.` });
  }

  const tokenTone: Tone = !s ? 'idle' : s.kite.token === 'valid' ? 'ok' : s.kite.token === 'expired' ? 'warn' : 'bad';
  const feedTone: Tone = !s ? 'idle' : s.feed.state === 'connected' ? 'ok' : s.feed.state === 'stopped' || s.feed.state === 'not_started' ? 'idle' : 'warn';
  const lastTickAge = s?.feed.lastTickAt ? now - s.feed.lastTickAt : null;
  const acts = (s?.activity ?? []).filter((a) => level === 'info' || a.level === 'warn' || a.level === 'error');

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>System</h1>
          <p className="sub">The backend, the Kite connection and the live feed at a glance</p>
        </div>
        <div className="head-actions">
          <a className="btn primary" href={`${BASE}/auth/kite/start`} target="_blank" rel="noreferrer">
            <Icon name="logout" size={16} />
            Log in to Kite
          </a>
        </div>
      </header>

      {problems.length === 0 && s && (
        <p className="banner ok" role="status">
          <Icon name="check" size={16} /> Everything is running.
        </p>
      )}
      {problems.map((p) => (
        <p key={p.text} className={`banner ${p.tone === 'bad' ? 'err' : ''}`} role="status">
          <Icon name="alert" size={16} /> {p.text}
        </p>
      ))}

      <section className="grid sys-grid" aria-label="Refresh setting">
        <AutoRefreshSetting />
        <TelegramUpdates />
      </section>

      <section className="grid sys-grid" aria-label="Status">
        <div className="card">
          <div className="card-head">
            <h2>Backend</h2><Info k="Backend" />
            <Pill tone={err ? 'bad' : s ? 'ok' : 'idle'}>{err ? 'Unreachable' : s ? 'Running' : 'Checking'}</Pill>
          </div>
          <Row k="Version" v={s?.app.version ?? '—'} />
          <Row k="Up for" v={s?.app.uptimeSec != null ? span(s.app.uptimeSec * 1000) : '—'} />
          <Row k="Memory" v={s ? `${s.app.memoryMb} MB` : '—'} />
          <Row k="Node" v={s?.app.node ?? '—'} />
          <Row k="Address" v={s?.app.host ? `${s.app.host}:${s.app.port}` : '—'} />
          <Row k="App served by it" v={s ? (s.app.frontendServed ? 'yes' : 'no (dev server)') : '—'} />
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Kite</h2><Info k="Kite" />
            <Pill tone={tokenTone}>{!s ? 'Checking' : s.kite.token === 'valid' ? 'Token valid' : s.kite.token === 'expired' ? 'Token expired' : 'No token'}</Pill>
          </div>
          <Row k="Credentials" v={s ? (s.kite.configured ? 'set' : 'missing') : '—'} />
          <Row k="User" v={s?.kite.userId ?? '—'} />
          <Row k="Logged in" v={s?.kite.savedAt ? `${span(now - s.kite.savedAt)} ago` : '—'} />
          <div className="card-actions">
            <button className="btn" onClick={() => act('Kite connection test', '/system/test-kite')} disabled={busy !== null || !s?.kite.configured}>
              <Icon name="refresh" size={16} />
              {busy === 'Kite connection test' ? 'Testing…' : 'Test connection'}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Live feed</h2><Info k="Live feed" />
            <Pill tone={feedTone}>{!s ? 'Checking' : s.feed.state === 'connected' ? 'Connected' : s.feed.state.replace('_', ' ')}</Pill>
          </div>
          <Row k="Subscribed" v={nfi(s?.feed.subscribed)} />
          <Row k="Ticks received" v={nfi(s?.feed.ticksSeen)} />
          <Row k="Last tick" v={lastTickAge != null ? `${span(lastTickAge)} ago` : '—'} />
          <Row k="Reconnects" v={nfi(s?.feed.reconnects)} />
          <Row k="Apps listening" v={nfi(s?.feed.clients)} />
          {!ms.open && <p className="note">The market is closed ({ms.label.toLowerCase()}): the feed sends little or nothing now.</p>}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Instruments</h2><Info k="Instruments" />
            <Pill tone={!s ? 'idle' : s.instruments.loaded ? 'ok' : 'warn'}>{!s ? 'Checking' : s.instruments.loaded ? 'Loaded' : 'Not loaded'}</Pill>
          </div>
          <Row k="Contracts" v={nfi(s?.instruments.count)} />
          <Row k="Day" v={s?.instruments.day ?? '—'} />
          <div className="card-actions">
            <button className="btn" onClick={() => act('Reload instruments', '/system/reload-instruments')} disabled={busy !== null || s?.kite.token !== 'valid'}>
              <Icon name="refresh" size={16} />
              {busy === 'Reload instruments' ? 'Reloading…' : 'Reload instruments'}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>9:15 scan</h2><Info k="9:15 scan" />
            <Pill tone={!s?.scan ? 'idle' : s.scan.running ? 'warn' : s.scan.names ? 'ok' : 'idle'}>{!s?.scan ? '—' : s.scan.running ? 'Running' : s.scan.names ? 'Done' : 'Not run'}</Pill>
          </div>
          <Row k="Day" v={s?.scan?.day ?? '—'} />
          <Row k="Names" v={s?.scan ? (s.scan.running ? `${s.scan.done} of ${s.scan.total}` : nfi(s.scan.names)) : '—'} />
          <Row k="Finished" v={s?.scan?.finishedAt ? `${span(now - s.scan.finishedAt)} ago` : '—'} />
          <div className="card-actions">
            <button className="btn" onClick={() => go('scanner')}>
              Open scanner
              <Icon name="right" size={16} />
            </button>
          </div>
        </div>
      </section>

      {result && (
        <p className={`banner ${result.r.ok ? 'ok' : 'err'}`} role="status">
          <b>{result.what}:</b>{' '}
          {result.r.ok
            ? result.r.ltp != null
              ? `worked in ${result.r.ms} ms (NIFTY 50 at ${nfi(result.r.ltp)}).`
              : result.r.count != null
                ? `${nfi(result.r.count)} contracts for ${result.r.day} in ${result.r.ms} ms.`
                : `done in ${result.r.ms} ms.`
            : `failed${result.r.error ? `: ${result.r.error}` : ''}.`}
        </p>
      )}

      {s?.dates && (
        <section className="card" aria-label="Trading dates and holidays">
          <div className="card-head">
            <h2>Trading dates and holidays</h2><Info k="Trading dates and holidays" />
            <Pill tone={s.dates.holidayError ? 'warn' : s.dates.holidays.length ? 'ok' : 'warn'}>{s.dates.holidayError ? 'Holiday list from the saved copy' : `${s.dates.holidays.length} NSE holidays`}</Pill>
          </div>
          <div className="grid sys-grid">
            <div>
              <Row k="Today (IST)" v={s.dates.today} />
              <Row k="NSE current day" v={s.dates.nseDay ?? '—'} />
              <Row k="NSE previous day" v={s.dates.nsePrev ?? '—'} />
              <Row k="MCX current day" v={s.dates.mcxDay ?? '—'} />
              <Row k="MCX previous day" v={s.dates.mcxPrev ?? '—'} />
              <Row k="Snapshot time" v={getSnapshot() || 'live'} />
              <Row k="Last full refresh" v={s.dates.lastRefreshAt ? `${time(s.dates.lastRefreshAt)} (${span(now - s.dates.lastRefreshAt)} ago)` : 'not since start'} />
            </div>
            <div>
              <p className="small-note">Upcoming NSE trading holidays</p>
              <ul className="hol-list">
                {s.dates.holidays.filter((h) => h.date >= s.dates!.today).slice(0, 8).map((h) => (
                  <li key={h.date}><b className="num">{h.date}</b> {h.desc}</li>
                ))}
                {!s.dates.holidays.some((h) => h.date >= s.dates!.today) && <li className="muted">None left in the saved list.</li>}
              </ul>
              {s.dates.holidayError && <p className="small-note warn-note">NSE refresh failed ({s.dates.holidayError}); the saved list is used.</p>}
            </div>
          </div>
          <p className="small-note">The current and previous days come from Settings (blank = the latest trading day). The rest of the settings are on the Settings page.</p>
        </section>
      )}

      <section className="card" aria-label="Recent activity">
        <div className="card-head">
          <h2>Recent activity</h2><Info k="Recent activity" />
          <div className="seg" role="group" aria-label="Show">
            <button className={level === 'info' ? 'on' : ''} onClick={() => setLevel('info')}>
              All
            </button>
            <button className={level === 'warn' ? 'on' : ''} onClick={() => setLevel('warn')}>
              Warnings and errors
            </button>
          </div>
        </div>
        {acts.length === 0 ? (
          <p className="muted">Nothing to show yet.</p>
        ) : (
          <ul className="acts">
            {acts.map((e, i) => (
              <ActivityRow key={`${e.t}-${i}`} e={e} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
