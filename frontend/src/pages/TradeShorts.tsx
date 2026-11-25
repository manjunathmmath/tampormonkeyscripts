import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { Info } from '../components/Info';
import { asOfQuery, nfi, tradingDayNow } from '../lib/format';
import { useRefresh } from '../lib/refresh';
import { PlanBox, q, type Outlook } from './DashboardPanels';

const ZONES = ['AST', 'ASO', 'BSO', 'BST', 'B/W'] as const;
const ZKEY = 'groot.shorts.zones';
const OKEY = 'groot.shorts.only';
const AUTO_MS = 12000;
const R0 = (n: number): string => nfi(Math.round(n));

interface Scan { items: Record<string, { zone: string }> }

/** One name's idea: read when it is shown (the plan needs its option chain, which loads on demand). */
function useIdea(name: string | undefined, tick: number): { o: Outlook | null; err: string | null } {
  const [r, setR] = useState<{ name: string; o: Outlook | null; err: string | null } | null>(null);
  useEffect(() => {
    if (!name) return;
    let live = true;
    api<Outlook>(`/outlook?${q(name)}`).then((o) => live && setR({ name, o, err: null })).catch((e: Error) => live && setR({ name, o: null, err: e.message }));
    return () => { live = false; };
  }, [name, tick]);
  return r && r.name === name ? { o: r.o, err: r.err } : { o: null, err: null };
}

const hasPlan = (o: Outlook | null): boolean => !!(o?.ok && o.plan && !o.forced);

/** Trade ideas as full-height cards you swipe through, one at a time, like short videos. */
export function TradeShorts() {
  const { tick } = useRefresh();
  const [scan, setScan] = useState<Scan | null>(null);
  const [zones, setZones] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(ZKEY) ?? 'null');
      if (Array.isArray(v)) return v as string[];
    } catch {
      /* default */
    }
    return ['AST', 'ASO', 'BSO', 'BST'];
  });
  const [only, setOnly] = useState<boolean>(() => {
    try {
      return localStorage.getItem(OKEY) === '1';
    } catch {
      return false;
    }
  });
  const [idx, setIdx] = useState(0);
  const [auto, setAuto] = useState(false);
  const [skips, setSkips] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let live = true;
    api<Scan>(`/scan915?day=${tradingDayNow()}${asOfQuery()}`).then((s) => live && setScan(s)).catch(() => live && setScan({ items: {} }));
    return () => { live = false; };
  }, [tick]);

  const list = useMemo(() => {
    const items = scan?.items ?? {};
    return Object.entries(items)
      .filter(([, v]) => zones.includes(v.zone))
      .sort((a, b) => ZONES.indexOf(a[1].zone as (typeof ZONES)[number]) - ZONES.indexOf(b[1].zone as (typeof ZONES)[number]) || a[0].localeCompare(b[0]))
      .map(([n, v]) => ({ n, z: v.zone }));
  }, [scan, zones]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of Object.values(scan?.items ?? {})) c[v.zone] = (c[v.zone] ?? 0) + 1;
    return c;
  }, [scan]);

  const at = Math.min(idx, Math.max(0, list.length - 1));
  const cur = list[at];
  const { o, err } = useIdea(cur?.n, tick);

  const go = useCallback((d: number) => {
    setSkips(0);
    setIdx((i) => Math.max(0, Math.min(list.length - 1, i + d)));
    setProgress(0);
  }, [list.length]);

  // "Actionable only": step past names with no plan, up to the end of the list
  useEffect(() => {
    if (!only || !o || hasPlan(o) || !cur) return;
    if (at < list.length - 1 && skips < 60) {
      setSkips((s) => s + 1);
      setIdx(at + 1);
    }
  }, [only, o, cur, at, list.length, skips]);

  useEffect(() => { setIdx(0); setSkips(0); }, [zones, only]);

  // auto-advance with a bar
  useEffect(() => {
    if (!auto) return;
    const t0 = Date.now();
    const t = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / AUTO_MS);
      setProgress(p);
      if (p >= 1) {
        window.clearInterval(t);
        if (at < list.length - 1) go(1);
        else setAuto(false);
      }
    }, 200);
    return () => window.clearInterval(t);
  }, [auto, at, list.length, go]);

  // keys
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement;
      if (/INPUT|SELECT|TEXTAREA/.test(t.tagName)) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [go]);
  const touch = useRef<number | null>(null);
  const wheelAt = useRef(0);

  const toggleZone = (z: string): void => {
    const next = zones.includes(z) ? zones.filter((x) => x !== z) : [...zones, z];
    setZones(next);
    try { localStorage.setItem(ZKEY, JSON.stringify(next)); } catch { /* not remembered */ }
  };
  const toggleOnly = (): void => {
    setOnly(!only);
    try { localStorage.setItem(OKEY, only ? '0' : '1'); } catch { /* not remembered */ }
  };

  const p = o?.plan;
  const risk = p ? (p.risk ?? Math.abs(p.entryPx - p.stop)) : null;
  return (
    <div className="page shorts-page">
      <header className="page-head">
        <div>
          <h1>Trade Shorts <Info text="One idea at a time, from the day's 9:15 scan. Swipe up or down, press the arrow keys, or use Auto. Each idea is the Probable trade plan of that name (entry zone, stop, targets). Rule-based and not back-tested; it never places an order." /></h1>
          <p className="sub">Swipe through the day's ideas. Each card loads when you reach it.</p>
        </div>
      </header>
      <div className="shorts-head">
      <div className="shorts-bar" role="group" aria-label="9:15 zones">
        {ZONES.map((z) => (
          <button key={z} className={`chip z-${z.replace('/', '')}${zones.includes(z) ? ' on' : ''}`} onClick={() => toggleZone(z)}>{z} <span className="num">{counts[z] ?? 0}</span></button>
        ))}
        <button className={`chip${only ? ' on' : ''}`} onClick={toggleOnly} title="Skip names that have no plan">Actionable only</button>
      </div>
      <div className="shorts-ctl">
        <button className="ibtn" aria-label="Previous idea" title="Previous" disabled={at <= 0} onClick={() => go(-1)}><Icon name="up" size={20} /></button>
        <button className={`ibtn${auto ? ' on' : ''}`} aria-label={auto ? 'Stop auto-advance' : 'Auto-advance every 12 seconds'} title={auto ? 'Stop auto' : 'Auto'} onClick={() => { setAuto(!auto); setProgress(0); }}><Icon name={auto ? 'stop' : 'clock'} size={20} /></button>
        <button className="ibtn" aria-label="Next idea" title="Next" disabled={at >= list.length - 1} onClick={() => go(1)}><Icon name="down" size={20} /></button>
      </div>
      </div>
      <div
        className="shorts-stage"
        onTouchStart={(e) => { touch.current = e.touches[0]!.clientY; }}
        onTouchEnd={(e) => {
          if (touch.current == null) return;
          const d = touch.current - e.changedTouches[0]!.clientY;
          touch.current = null;
          if (Math.abs(d) > 50) go(d > 0 ? 1 : -1);
        }}
        onWheel={(e) => {
          const n = Date.now();
          if (n - wheelAt.current < 600 || Math.abs(e.deltaY) < 20) return;
          wheelAt.current = n;
          go(e.deltaY > 0 ? 1 : -1);
        }}
      >
        {!scan ? (
          <p className="muted">Loading the 9:15 scan…</p>
        ) : !list.length ? (
          <p className="muted">No names in the chosen zones. {Object.keys(scan.items).length ? 'Tick another zone above.' : 'The 9:15 scan has no result yet; run it from the 9:15 Scanner (after 9:20 on a live day).'}</p>
        ) : cur && (
          <article className={`short-card${p ? (p.long ? ' long' : ' short') : ''}`} aria-live="polite">
            <div className="short-top">
              <span className="muted num">{at + 1} of {list.length}</span>
              <span className={`chip z-${cur.z.replace('/', '')} on`}>{cur.z}</span>
              {auto && <i className="short-timer" style={{ width: `${progress * 100}%` }} />}
            </div>
            <h2 className="short-name">{cur.n}</h2>
            {!o ? (
              <p className="muted">{err ?? 'Loading the plan…'}</p>
            ) : !o.ok ? (
              <p className="muted">{o.why}</p>
            ) : !p ? (
              <p className="muted">No clear direction{o.range ? `. Range: support ${o.range.sup ? nfi(o.range.sup.price) : '—'} to resistance ${o.range.res ? nfi(o.range.res.price) : '—'}.` : '.'}</p>
            ) : (
              <>
                <div className="short-call">
                  <b className={p.long ? 'up' : 'dn'}>{o.forced ? 'LEAN ' : ''}{p.long ? 'LONG' : 'SHORT'}</b>
                  <span className={`ol-badge r${o.rank}`}>{['', 'LOW', 'MEDIUM', 'HIGH'][o.rank]}</span>
                  {o.spot != null && <span className="num short-px">{nfi(o.spot)}</span>}
                </div>
                <PlanBox plan={p} spot={o.spot} />
                <dl className="short-levels num">
                  <div><dt>Entry{p.atLevel ? ' · now' : ''}</dt><dd>{R0(p.entryPx)}</dd></div>
                  <div><dt>Stop</dt><dd className="dn">{R0(p.stop)}</dd></div>
                  <div><dt>Target 1</dt><dd className="up">{p.t1 ? R0(p.t1.price) : '—'}</dd></div>
                  <div><dt>Target 2</dt><dd className="up">{p.t2 ? R0(p.t2.price) : '—'}</dd></div>
                  <div><dt>Reward : risk</dt><dd>{p.rr != null ? `${p.rr.toFixed(1)} : 1` : '—'}</dd></div>
                  <div><dt>Risk</dt><dd>{risk != null && o.spot ? `${R0(risk)} pts · ${((risk / o.spot) * 100).toFixed(2)}%` : '—'}</dd></div>
                </dl>
                {o.rankNote && <p className="small-note warn-note">{o.rankNote}</p>}
                {p.widened && <p className="small-note warn-note">The stop was widened to one average 5-minute range.</p>}
                {p.heldNote && <p className="small-note">{p.heldNote}</p>}
              </>
            )}
            <a className="ibtn short-chart" title="Open in Chart View" aria-label="Open in Chart View" href={`#/chart/${encodeURIComponent(cur.n)}`}><Icon name="chart" size={18} /></a>
          </article>
        )}
      </div>
      <p className="small-note">Rule-based, not back-tested. It never places an order.</p>
    </div>
  );
}
