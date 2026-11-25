import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type ScanItem, type ScanState, type Zone } from '../api';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { nf, nfi, prettyDay, prevWeekday, nextWeekday, signed, tone, tradingDayNow } from '../lib/format';
import { usePoll } from '../lib/hooks';

const ZONES: { key: Zone; label: string; hint: string }[] = [
  { key: 'AST', label: 'AST', hint: 'Closed at or beyond the second strike above the open' },
  { key: 'ASO', label: 'ASO', hint: 'Closed at or beyond the first strike above the open' },
  { key: 'B/W', label: 'B/W', hint: 'Closed between BSO and ASO' },
  { key: 'BSO', label: 'BSO', hint: 'Closed at or beyond the first strike below the open' },
  { key: 'BST', label: 'BST', hint: 'Closed at or beyond the second strike below the open' },
];
const zc = (z: Zone): string => `z-${z.replace('/', '')}`;
const move = (i: ScanItem): number => (i.anchor ? ((i.close - i.anchor) / i.anchor) * 100 : 0);

/** Where the 9:15 close sits between the lowest and highest level the name has (0 to 100). */
function gaugePos(i: ScanItem): number {
  const lo = i.bst ?? i.bso;
  const hi = i.ast ?? i.aso;
  return hi > lo ? Math.min(100, Math.max(0, ((i.close - lo) / (hi - lo)) * 100)) : 50;
}

function Gauge({ i }: { i: ScanItem }) {
  const lo = i.bst ?? i.bso;
  const hi = i.ast ?? i.aso;
  const open = hi > lo ? Math.min(100, Math.max(0, ((i.anchor - lo) / (hi - lo)) * 100)) : null;
  return (
    <div className="gauge" aria-hidden="true">
      <span className="g-seg g-dn" />
      <span className="g-seg g-mid" />
      <span className="g-seg g-up" />
      {open != null && <b className="g-open" style={{ left: `${open}%` }} />}
      <i className="g-dot" style={{ left: `${gaugePos(i)}%` }} />
    </div>
  );
}

function Ladder({ i }: { i: ScanItem }) {
  type Row = { key: string; label: string; v: number | null; kind: string };
  const rows: Row[] = [
    { key: 'ast', label: 'AST', v: i.ast, kind: 'up2' },
    { key: 'aso', label: 'ASO', v: i.aso, kind: 'up1' },
    { key: 'open', label: 'Open (anchor)', v: i.anchor, kind: 'open' },
    { key: 'bso', label: 'BSO', v: i.bso, kind: 'dn1' },
    { key: 'bst', label: 'BST', v: i.bst, kind: 'dn2' },
    { key: 'close', label: '9:15 close', v: i.close, kind: 'close' },
  ];
  const list = rows.filter((r) => r.v != null).sort((a, b) => (b.v as number) - (a.v as number) || (a.kind === 'close' ? -1 : 1));
  return (
    <ol className="ladder">
      {list.map((r) => (
        <li key={r.key} className={`rung ${r.kind}`}>
          <span className="rung-l">{r.label}</span>
          <span className="rung-line" />
          <span className="rung-v num">{nf(r.v)}</span>
        </li>
      ))}
    </ol>
  );
}

export function Scanner({ go }: { go: (p: string) => void }) {
  const [scan, setScan] = useState<ScanState | null>(null);
  const [day, setDay] = useState<string>(tradingDayNow());
  const [sel, setSel] = useState<Record<Zone, boolean>>({ AST: true, ASO: true, 'B/W': false, BSO: true, BST: true });
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'move' | 'name'>('move');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (d: string) => {
    try {
      const s = await api<ScanState>(`/scan915?day=${d}`);
      setScan(s);
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError || e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    setLoaded(false);
    void load(day);
  }, [day, load]);
  usePoll(() => load(day), 1500, Boolean(scan?.running));

  const run = async (force: boolean) => {
    setBusy(true);
    try {
      setScan(await api<ScanState>('/scan915/run', { method: 'POST', body: { day, force } }));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const items = scan?.items ?? {};
  const total = Object.keys(items).length;
  const counts = useMemo(() => {
    const c: Record<Zone, number> = { AST: 0, ASO: 0, 'B/W': 0, BSO: 0, BST: 0 };
    for (const it of Object.values(items)) c[it.zone]++;
    return c;
  }, [items]);
  const groups = useMemo(() => {
    const needle = q.trim().toUpperCase();
    return ZONES.filter((z) => sel[z.key]).map((z) => {
      const names = Object.keys(items).filter((n) => items[n]!.zone === z.key && (!needle || n.toUpperCase().includes(needle)));
      names.sort(sort === 'name' ? (a, b) => a.localeCompare(b) : (a, b) => Math.abs(move(items[b]!)) - Math.abs(move(items[a]!)));
      return { ...z, names };
    });
  }, [items, sel, q, sort]);
  const it = open ? items[open] : undefined;
  const lean = total ? ((counts.AST + counts.ASO) - (counts.BSO + counts.BST)) / total : 0;
  const today = tradingDayNow();

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>9:15 Scanner</h1>
          <p className="sub">Where each name's first 5-minute candle closed against its strike levels</p>
        </div>
        <div className="head-actions">
          <div className="daynav" role="group" aria-label="Trading day">
            <button className="icon-btn" onClick={() => setDay(prevWeekday(day))} aria-label="Previous day">
              <Icon name="left" size={18} />
            </button>
            <label className="daypick">
              <span>{prettyDay(day)}</span>
              <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Pick a day" />
            </label>
            <button className="icon-btn" onClick={() => setDay(nextWeekday(day))} disabled={day >= today} aria-label="Next day">
              <Icon name="right" size={18} />
            </button>
          </div>
          <button className="btn primary" onClick={() => run(total > 0)} disabled={busy || Boolean(scan?.running)}>
            <Icon name={total > 0 ? 'refresh' : 'play'} size={16} />
            {scan?.running ? 'Scanning...' : total > 0 ? 'Re-scan' : 'Run scan'}
          </button>
        </div>
      </header>

      {err && (
        <p className="banner err" role="alert">
          {err}
        </p>
      )}
      {scan?.message && !scan.running && (
        <p className="banner" role="status">
          {scan.message}
        </p>
      )}

      {scan?.running && (
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={scan.total} aria-valuenow={scan.done}>
          <div style={{ width: `${scan.total ? (scan.done / scan.total) * 100 : 0}%` }} />
          <span>
            Scanning {scan.done} of {scan.total}
            {scan.current ? ` - ${scan.current}` : ''}
          </span>
        </div>
      )}

      {!loaded && (
        <div className="grid tiles" aria-busy="true">
          {Array.from({ length: 12 }, (_, k) => (
            <div key={k} className="tile sk-tile">
              <div className="sk sk-m" />
              <div className="sk sk-l" />
            </div>
          ))}
        </div>
      )}

      {loaded && total === 0 && !scan?.running && (
        <section className="empty card">
          <Icon name="scanner" size={30} />
          <h2>No scan for {prettyDay(day)} yet</h2>
          <p className="muted">It reads each name's first 5-minute candle from Kite. The whole universe takes about 80 seconds.</p>
          <button className="btn primary" onClick={() => run(false)} disabled={busy}>
            <Icon name="play" size={16} />
            Run scan
          </button>
        </section>
      )}

      {total > 0 && (
        <>
          <section className="card dist" aria-label="Zone summary">
            <div className="zonebar" role="img" aria-label={ZONES.map((z) => `${z.key} ${counts[z.key]}`).join(', ')}>
              {ZONES.map((z) => (counts[z.key] ? <i key={z.key} className={`zb ${zc(z.key)}`} style={{ flexGrow: counts[z.key] }} title={`${z.key}: ${counts[z.key]}`} /> : null))}
            </div>
            <div className="scan-lean">
              <span className={`lean-word ${Math.abs(lean) < 0.08 ? 'flat' : lean > 0 ? 'up' : 'dn'}`}>{Math.abs(lean) < 0.08 ? 'Balanced open' : lean > 0 ? 'Bullish open' : 'Bearish open'}</span>
              <span className="muted">{Math.round(Math.abs(lean) * 100)}% net of {total} names · {counts.AST + counts.ASO} above, {counts.BSO + counts.BST} below, {counts['B/W']} between</span>
              <span className="lean-idx">
                {['NIFTY 50', 'NIFTY BANK', 'SENSEX'].map((n) => (items[n] ? <button key={n} className={`pill zp ${zc(items[n]!.zone)}`} onClick={() => setOpen(n)} title={`${n} closed in ${items[n]!.zone}`}>{n.replace('NIFTY ', 'N ')} <b>{items[n]!.zone}</b></button> : null))}
              </span>
            </div>
            <div className="chips" role="group" aria-label="Show zones">
              {ZONES.map((z) => (
                <button key={z.key} className={`chip ${zc(z.key)} ${sel[z.key] ? 'on' : ''}`} aria-pressed={sel[z.key]} title={z.hint} onClick={() => setSel((s) => ({ ...s, [z.key]: !s[z.key] }))}>
                  {z.label}
                  <b className="num">{counts[z.key]}</b>
                </button>
              ))}
            </div>
          </section>

          <div className="toolbar">
            <label className="search">
              <Icon name="search" size={16} />
              <input type="search" placeholder="Find a name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a name" />
            </label>
            <div className="seg" role="group" aria-label="Sort">
              <button className={sort === 'move' ? 'on' : ''} onClick={() => setSort('move')}>
                Biggest move
              </button>
              <button className={sort === 'name' ? 'on' : ''} onClick={() => setSort('name')}>
                A-Z
              </button>
            </div>
          </div>

          {groups.map((g) => (
            <section key={g.key} className="group" aria-label={`${g.label} names`}>
              <h3 className={zc(g.key)}>
                <i className={`zb ${zc(g.key)}`} />
                {g.label}
                <small>{g.names.length}</small>
              </h3>
              {g.names.length === 0 ? (
                <p className="muted">No names.</p>
              ) : (
                <div className="grid tiles">
                  {g.names.map((n) => {
                    const i = items[n]!;
                    const m = move(i);
                    return (
                      <button key={n} className={`tile ${zc(i.zone)} ${open === n ? 'sel' : ''}`} onClick={() => setOpen(open === n ? null : n)}>
                        <span className="tile-top">
                          <span className="tile-name">{n}</span>
                          <span className={`tile-move num ${tone(m)}`}>{signed(m)}%</span>
                        </span>
                        <span className="tile-px num">{nfi(i.close)}</span>
                        <Gauge i={i} />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </>
      )}

      {scan && scan.errors.length > 0 && (
        <details className="muted errs">
          <summary>{scan.errors.length} names could not be read</summary>
          {scan.errors.map((e) => (
            <div key={e.name}>
              {e.name}: {e.error}
            </div>
          ))}
        </details>
      )}

      <Sheet
        open={Boolean(open && it)}
        onClose={() => setOpen(null)}
        title={
          <>
            {open} {it && <span className={`zone-badge ${zc(it.zone)}`}>{it.zone}</span>}
          </>
        }
      >
        {it && open && (
          <>
            <div className="sheet-stats">
              <div>
                <span>9:15 close</span>
                <b className="num">{nf(it.close)}</b>
              </div>
              <div>
                <span>Move from open</span>
                <b className={`num ${tone(move(it))}`}>{signed(move(it))}%</b>
              </div>
            </div>
            <Ladder i={it} />
            {(it.ast == null || it.bst == null) && <p className="note">AST and BST are not available for this name. NSE gives it a single strike step, and the existing app cannot build the second level from it.</p>}
            {!it.stepKnown && <p className="note warn">No strike step found for this name. The 100 / 100 placeholder was used, so these levels are probably wrong.</p>}
            <button className="btn wide" onClick={() => { try { localStorage.setItem('groot.focus', open); } catch { /* ignore */ } go('focus'); }}>
              <Icon name="focus" size={16} />
              Trade Focus
            </button>
            <button className="btn primary wide" onClick={() => go(`chart/${encodeURIComponent(open)}/${day}`)}>
              <Icon name="chart" size={16} />
              Open chart
            </button>
          </>
        )}
      </Sheet>
    </div>
  );
}
