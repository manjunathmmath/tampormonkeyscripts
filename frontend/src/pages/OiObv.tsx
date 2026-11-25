import { useEffect, useMemo, useState } from 'react';
import type { OiAnalysis } from '../api';
import { IconButton } from '../components/IconButton';
import { OiObvBars } from '../components/OiObvBars';
import { anyMarketOpen, getSnapshot, nf } from '../lib/format';
import { useRefresh } from '../lib/refresh';
import { Card, Loading, q, useLive } from './DashboardPanels';

const KEY = 'groot.oiobv.sel';
const MAX = 12;
const AUTO_KEY = 'groot.oiobv.auto';
const SLOT_MS = 5 * 60 * 1000;
/** a few seconds after each 5-minute close, so the new candle is there when the page reads it */
const nextSlot = (now: number): number => Math.floor(now / SLOT_MS) * SLOT_MS + SLOT_MS + 6000;
const hms = (ms: number): string => new Date(ms + 19800000).toISOString().slice(11, 19);
const mmss = (ms: number): string => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
const INDICES = ['NIFTY 50', 'NIFTY BANK', 'SENSEX'];
const MCX = ['CRUDEOILM', 'CRUDEOIL', 'GOLDM', 'GOLD', 'SILVERM', 'SILVER', 'NATGASMINI', 'NATURALGAS'];

const readSel = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as string[] | null;
    return Array.isArray(v) ? v : ['NIFTY 50', 'NIFTY BANK'];
  } catch {
    return ['NIFTY 50', 'NIFTY BANK'];
  }
};

function OiCard({ name, strikes, onRemove }: { name: string; strikes: number; onRemove: () => void }) {
  const { data: o, err, at, changedAt } = useLive<OiAnalysis>(`/oi?${q(name)}&strikes=${strikes}`, 300000);
  const sub = o ? `${nf(o.spot)} · PCR ${o.pcr} · OI score ${o.oiScore > 0 ? '+' : ''}${o.oiScore.toFixed(1)} · ${o.expiry}` : undefined;
  return (
    <Card title={name} sub={sub} at={at} changedAt={changedAt}>
      {!o ? (
        <Loading what={`${name}'s option chain`} err={err} />
      ) : (
        <>
          <OiObvBars rows={o.rows} />
          <p className="small-note">
            Calls red, puts green; solid = built up, faded = reduced. The shaded strike is the at-the-money one.
            {o.walls.resistance[0] ? ` Call wall ${o.walls.resistance[0].strike}.` : ''}
            {o.walls.support[0] ? ` Put wall ${o.walls.support[0].strike}.` : ''}
          </p>
        </>
      )}
      <IconButton icon="trash" label={`Remove ${name}`} onClick={onRemove} />
    </Card>
  );
}

/** OI / OBV: the strike-by-strike OI change and OBV flow of every instrument you tick, side by side. */
export function OiObv() {
  const [sel, setSel] = useState<string[]>(readSel);
  const [strikes, setStrikes] = useState(5);
  const [filter, setFilter] = useState('');
  const { data: wts } = useLive<{ full: Record<string, Record<string, number>> } | null>('/data/weights', 3600000);
  const groups = useMemo(() => {
    const byW = (ix: string): string[] => Object.entries(wts?.full?.[ix] ?? {}).sort((a, b) => b[1] - a[1]).map(([n]) => n);
    return [
      { label: 'Indices', names: INDICES },
      { label: 'NIFTY 50', names: byW('NIFTY 50') },
      { label: 'BANK NIFTY', names: byW('NIFTY BANK') },
      { label: 'MCX', names: MCX },
    ];
  }, [wts]);
  const save = (n: string[]): void => {
    setSel(n);
    try {
      localStorage.setItem(KEY, JSON.stringify(n));
    } catch {
      /* not remembered */
    }
  };
  const toggle = (n: string): void => save(sel.includes(n) ? sel.filter((x) => x !== n) : sel.length >= MAX ? sel : [...sel, n]);
  const wt = (ix: string, n: string): number | null => wts?.full?.[ix]?.[n] ?? null;
  /** the index itself and its ten heaviest stocks (the live weighted constituents): one click instead of eleven ticks */
  const weighted = (ix: 'NIFTY 50' | 'NIFTY BANK'): string[] => [ix, ...Object.entries(wts?.full?.[ix] ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n]) => n)];
  // refresh on its own after every 5-minute close while the market is open (not with a snapshot time set: nothing moves then)
  const { refresh, lastAt, refreshing } = useRefresh();
  const [auto, setAuto] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTO_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [now, setNow] = useState(Date.now());
  const [due, setDue] = useState(() => nextSlot(Date.now()));
  const open = anyMarketOpen() && !getSnapshot();
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (!auto || !open || now < due) return;
    void refresh();
    setDue(nextSlot(now));
  }, [now, due, auto, open, refresh]);
  const toggleAuto = (): void => {
    const on = !auto;
    setAuto(on);
    setDue(nextSlot(Date.now()));
    try {
      localStorage.setItem(AUTO_KEY, on ? '1' : '0');
    } catch {
      /* not remembered */
    }
  };
  const needle = filter.trim().toLowerCase();
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>OI / OBV</h1>
          <p className="sub">Open interest change and volume flow by strike. Tick as many instruments as you like (up to {MAX}); each gets its own chart.</p>
        </div>
        <div className="oiobv-timer" role="status">
          <IconButton icon="clock" label={auto ? 'Auto refresh is on (every 5 minutes): turn it off' : 'Turn on auto refresh (every 5 minutes)'} on={auto} onClick={toggleAuto} />
          <span className="num">
            {!auto ? 'Auto off' : getSnapshot() ? 'Snapshot: no auto refresh' : !open ? 'Market closed' : refreshing ? 'Refreshing…' : `Next in ${mmss(Math.max(0, due - now))}`}
          </span>
          <IconButton icon="refresh" label="Refresh now" disabled={refreshing} onClick={() => void refresh()} />
          <span className="muted num">{lastAt ? `Updated ${hms(lastAt)}` : 'Not refreshed yet'}</span>
        </div>
      </header>
      <section className="card oiobv-sel" aria-label="Choose instruments">
        <div className="chips">
          <input type="search" placeholder="Filter the list" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter instruments" />
          <button className="chip" onClick={() => save(INDICES)}>Indices only</button>
          <button className="chip" onClick={() => save([])} disabled={!sel.length}>Clear ({sel.length})</button>
          <label className="field-inline">
            Strikes each side
            <select value={strikes} onChange={(e) => setStrikes(Number(e.target.value))}>
              {[3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <div className="oiobv-grp oiobv-presets">
          <span>Weighted</span>
          <div className="oiobv-chips">
            <button className="chip" disabled={!wts?.full?.['NIFTY 50']} onClick={() => save(weighted('NIFTY 50'))} title="NIFTY 50 and its ten heaviest stocks, in order of weight">NIFTY 50 + top 10</button>
            <button className="chip" disabled={!wts?.full?.['NIFTY BANK']} onClick={() => save(weighted('NIFTY BANK'))} title="NIFTY BANK and its ten heaviest stocks, in order of weight">BANK NIFTY + top 10</button>
            <button className="chip" disabled={!wts?.full?.['NIFTY 50']} onClick={() => save([...new Set([...weighted('NIFTY 50').slice(0, 6), ...weighted('NIFTY BANK').slice(0, 6)])].slice(0, MAX))} title="Both indices with their five heaviest stocks each">Both indices + top 5</button>
          </div>
        </div>
        {groups.map((g) => g.names.length > 0 && (
          <div key={g.label} className="oiobv-grp">
            <span>{g.label}</span>
            <div className="oiobv-chips">
              {g.names.filter((n) => !needle || n.toLowerCase().includes(needle) || sel.includes(n)).map((n) => (
                <label key={n} className={`oiobv-chip${sel.includes(n) ? ' on' : ''}`}>
                  <input type="checkbox" checked={sel.includes(n)} onChange={() => toggle(n)} /> {n}{(g.label === 'NIFTY 50' || g.label === 'BANK NIFTY') && wt(g.label === 'BANK NIFTY' ? 'NIFTY BANK' : 'NIFTY 50', n) != null ? <small className="oiobv-w">{wt(g.label === 'BANK NIFTY' ? 'NIFTY BANK' : 'NIFTY 50', n)!.toFixed(1)}%</small> : null}
                </label>
              ))}
            </div>
          </div>
        ))}
        {sel.length >= MAX && <p className="small-note warn-note">That is the limit of {MAX}. Untick one to add another.</p>}
      </section>
      {!sel.length ? (
        <p className="muted">Tick an instrument above to see its OI and OBV bars.</p>
      ) : (
        <div className="oiobv-grid">
          {sel.map((n) => <OiCard key={`${n}${strikes}`} name={n} strikes={strikes} onRemove={() => toggle(n)} />)}
        </div>
      )}
    </div>
  );
}
