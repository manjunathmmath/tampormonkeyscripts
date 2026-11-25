import { Icon } from '../components/Icon';
import { Info } from '../components/Info';
import { IconButton } from '../components/IconButton';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type ScanState } from '../api';
import { asOfQuery, nf, tradingDayNow } from '../lib/format';
import { useRefresh } from '../lib/refresh';
import { ChartPage, LAYERS_KEY, LAYER_DEFS, type Layers } from './ChartPage';
import { FocusBody } from './Focus';
import { OutlookCard, SignalsCard, SupportResistanceCard } from './DashboardPanels';
import { Card, Loading, useLive } from './DashboardPanels';

interface Mark { name: string; call: string; conf: string | null; dir: number; headline: string }
type Marks = Record<string, Mark>;
type Preset = 'Clean' | 'Standard' | 'Full';

const PANES_KEY = 'groot.cv.panes';
const LAYOUT_KEY = 'groot.cv.layout';
const PINS_KEY = 'groot.cv.pins';
const BOARD_KEY = 'groot.cv.board';
const INSP_KEY = 'groot.cv.insp';
const DEFAULT_PANES = ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'GOLDM', 'SILVERM', 'CRUDEOILM'];
const SETS_KEY = 'groot.cv.sets';
interface ChartSet { label: string; names: string[] }
/** Ready-made groups of charts; the layout is the number of names. */
const BUILT_IN: ChartSet[] = [
  { label: 'Index + Metals', names: ['NIFTY 50', 'NIFTY BANK', 'GOLDM', 'SILVERM'] },
  { label: 'Index', names: ['NIFTY 50', 'NIFTY BANK'] },
  { label: 'All indices', names: ['NIFTY 50', 'NIFTY BANK', 'SENSEX'] },
  { label: 'Metals', names: ['GOLDM', 'SILVERM'] },
  { label: 'Energy', names: ['CRUDEOILM', 'NATGASMINI'] },
  { label: 'MCX', names: ['GOLDM', 'SILVERM', 'CRUDEOILM', 'NATGASMINI'] },
];
const ZONES = ['AST', 'ASO', 'B/W', 'BSO', 'BST'] as const;
const NONE: Layers = { levels: false, walls: false, flow: false, range: false, dead: false, zones: false, trade: false, prob: false, fut: false, score: false };
const PRESETS: Record<Preset, Layers> = {
  Clean: { ...NONE, levels: true },
  Standard: { ...NONE, levels: true, walls: true, range: true, dead: true, zones: true, trade: true, prob: true },
  Full: { levels: true, walls: true, flow: true, range: true, dead: true, zones: true, trade: true, prob: true, fut: true, score: true },
};

const rd = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const wr = (k: string, v: unknown): void => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* not remembered */
  }
};

const badge = (m?: Mark): string => (!m ? '' : `${m.call === 'LONG' ? '▲' : m.call === 'SHORT' ? '▼' : m.call === 'WAIT' ? '◆' : '–'}${m.conf ? m.conf[0] : ''}`);
const markTone = (m?: Mark): string => (!m ? '' : m.call === 'LONG' ? 'up' : m.call === 'SHORT' ? 'dn' : 'flat');

/** The 9:15 board: every scanned name by where its first candle closed, with the Trade Focus call of the ones you have scanned, pinned names and filters. */
function Board({ onPick, current, marks, setMarks, narrow }: { onPick: (n: string) => void; current: string; marks: Marks; setMarks: (f: (m: Marks) => Marks) => void; narrow: boolean }) {
  const day = tradingDayNow();
  const { data: scan } = useLive<ScanState>(`/scan915?day=${day}${asOfQuery()}`, 600000);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'All' | 'HIGH' | 'Long' | 'Short'>('All');
  const [pins, setPins] = useState<string[]>(() => rd(PINS_KEY, [] as string[]));
  const [open, setOpen] = useState<Record<string, boolean>>({ AST: true, ASO: true, BSO: true, BST: true, 'B/W': false });
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const stop = useRef(false);
  const items = scan?.items ?? {};
  const needle = q.trim().toUpperCase();
  const pass = (n: string): boolean => {
    if (needle && !n.toUpperCase().includes(needle)) return false;
    if (show === 'All') return true;
    const m = marks[n];
    if (!m) return false;
    return show === 'HIGH' ? m.conf === 'HIGH' && (m.call === 'LONG' || m.call === 'SHORT') : show === 'Long' ? m.call === 'LONG' : m.call === 'SHORT';
  };
  const byZone = (z: string): string[] => Object.keys(items).filter((n) => items[n]!.zone === z && pass(n)).sort();
  const pinToggle = (n: string): void => {
    const next = pins.includes(n) ? pins.filter((x) => x !== n) : [...pins, n];
    setPins(next);
    wr(PINS_KEY, next);
  };
  const scanNames = async (names: string[]): Promise<void> => {
    stop.current = false;
    const todo = names.filter((n) => !marks[n]);
    setProg({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length && !stop.current; i += 6) {
      const batch = todo.slice(i, i + 6);
      try {
        const r = await api<{ marks: Mark[] }>(`/marks?names=${encodeURIComponent(batch.join(','))}&day=${day}${asOfQuery()}`);
        setMarks((m) => ({ ...m, ...Object.fromEntries(r.marks.map((x) => [x.name, x])) }));
      } catch {
        /* a failed batch is skipped */
      }
      setProg({ done: Math.min(todo.length, i + batch.length), total: todo.length });
    }
    setProg(null);
  };
  const movers = [...ZONES.filter((z) => z !== 'B/W')].flatMap((z) => Object.keys(items).filter((n) => items[n]!.zone === z)).slice(0, 40);
  const chip = (n: string) => {
    const m = marks[n];
    return (
      <span key={n} className={`bchip-wrap${current === n ? ' cur' : ''}`}>
        <button className={`bchip ${markTone(m)}`} onClick={() => onPick(n)} title={m ? `${m.call}${m.conf ? ` (${m.conf})` : ''}: ${m.headline}` : `Open ${n}`}>
          {m && <i className="bmark">{badge(m)}</i>}
          {n}
        </button>
      </span>
    );
  };
  return (
    <aside className={`cv-board${narrow ? ' drawer' : ''}`} aria-label="9:15 board">
      <h3>9:15 board</h3><Info k="9:15 board" />
      <input className="set-search" placeholder="Find a name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a name" />
      <div className="seg" role="group" aria-label="Show">
        {(['All', 'HIGH', 'Long', 'Short'] as const).map((s) => <button key={s} className={show === s ? 'on' : ''} onClick={() => setShow(s)}>{s}</button>)}
      </div>
      <div className="cv-scan">
        {prog ? (
          <>
            <span className="muted num">{prog.done} of {prog.total}</span>
            <IconButton icon="stop" label="Stop the scan" tone="dn" onClick={() => { stop.current = true; }} />
          </>
        ) : (
          <>
            <IconButton icon="play" label="Scan movers: read the Trade Focus call of the names that closed outside the middle zone (about 40)" onClick={() => void scanNames(movers)} />
            <IconButton icon="scanner" label="Scan all names (several minutes)" onClick={() => void scanNames(Object.keys(items))} />
          </>
        )}
        <span className="muted">{Object.keys(marks).length} read</span>
      </div>
      {pins.length > 0 && (
        <section>
          <h4>Pinned <small>{pins.length}</small></h4>
          <div className="bchips">{pins.map((n) => <span key={n} className="pin-row">{chip(n)}<button className="link-btn" onClick={() => pinToggle(n)} aria-label={`Unpin ${n}`}>×</button></span>)}</div>
        </section>
      )}
      {ZONES.map((z) => {
        const list = byZone(z);
        return (
          <section key={z}>
            <button className={`bz z-${z.replace('/', '')}`} onClick={() => setOpen((o) => ({ ...o, [z]: !o[z] }))} aria-expanded={!!open[z] || !!needle}><span>{open[z] || needle ? '▾' : '▸'} {z}</span><small>{list.length}</small></button>
            {(open[z] || needle) && <div className="bchips">{list.map((n) => chip(n))}</div>}
          </section>
        );
      })}
      <IconButton icon="pin" label={pins.includes(current) ? `Unpin ${current}` : `Pin ${current}`} on={pins.includes(current)} onClick={() => pinToggle(current)} />
    </aside>
  );
}

/** The preset menu: the ready-made groups, and your own saved from the charts on screen. */
function SetMenu({ shown, onPick }: { shown: string[]; onPick: (names: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState<ChartSet[]>(() => rd(SETS_KEY, [] as ChartSet[]));
  const [label, setLabel] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: Event): void => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', out);
    return () => document.removeEventListener('pointerdown', out);
  }, [open]);
  const key = shown.join('|');
  const current = [...BUILT_IN, ...own].find((s) => s.names.join('|') === key)?.label;
  const keep = (next: ChartSet[]): void => { setOwn(next); wr(SETS_KEY, next); };
  const save = (): void => {
    const l = label.trim();
    if (!l) return;
    keep([...own.filter((s) => s.label !== l), { label: l, names: shown }]);
    setLabel('');
  };
  const row = (s: ChartSet) => (
    <button type="button" role="menuitem" className={`cv-set${current === s.label ? ' on' : ''}`} onClick={() => { onPick(s.names); setOpen(false); }}>
      <b>{s.label}</b><small>{s.names.join(' · ')}</small>
    </button>
  );
  return (
    <div className="cv-layers" ref={box}>
      <button type="button" className={`ibtn ibtn-count${open ? ' on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} title="Chart presets" aria-label="Chart presets"><Icon name="cards" size={18} /><b>{current ?? 'Presets'}</b></button>
      {open && (
        <div className="cv-menu cv-sets" role="menu">
          {BUILT_IN.map((s) => <div key={s.label} className="cv-set-row">{row(s)}</div>)}
          {own.map((s) => <div key={`own-${s.label}`} className="cv-set-row">{row(s)}<IconButton icon="trash" label={`Delete the preset ${s.label}`} onClick={() => keep(own.filter((x) => x.label !== s.label))} /></div>)}
          <form className="cv-set-save" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <input className="set-search" placeholder="Name these charts" value={label} maxLength={24} onChange={(e) => setLabel(e.target.value)} aria-label="Name for a new preset" />
            <button type="submit" className="btn" disabled={!label.trim()}>Save</button>
          </form>
        </div>
      )}
    </div>
  );
}

const TABS = ['Gates', 'Trade', 'Levels', 'Agreement', 'Positional'] as const;

function Inspector({ name }: { name: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>(() => rd('groot.cv.itab', 'Gates') as (typeof TABS)[number]);
  const pick = (t: (typeof TABS)[number]): void => {
    setTab(t);
    wr('groot.cv.itab', t);
  };
  return (
    <aside className="cv-insp" aria-label="Inspector">
      <h3>{name}</h3>
      <div className="chips" role="tablist">{TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={`chip sm ${tab === t ? 'on' : ''}`} onClick={() => pick(t)}>{t}</button>)}</div>
      {tab === 'Gates' && <FocusBody name={name} />}
      {tab === 'Trade' && <OutlookCard name={name} />}
      {tab === 'Levels' && <SupportResistanceCard name={name} />}
      {tab === 'Agreement' && <SignalsCard name={name} />}
      {tab === 'Positional' && <PositionalTab name={name} />}
    </aside>
  );
}

function PositionalTab({ name }: { name: string }) {
  const { data: p, err } = useLive<{ rows?: { name: string; verdict: string; convictionPct: number | null; entry: number | null; stop: number | null; target: number | null; riskReward: number | null; since: { label: string; days: number } | null; primary: { label: string } | null }[] }>('/positional', 120000);
  const r = p?.rows?.find((x) => x.name === name);
  return (
    <Card title="Positional (swing, daily candles)">
      {!p ? <Loading what="the positional read" err={err} /> : !r ? (
        <p className="muted">{name} has not been scanned. Run the Positional screener on the <a href="#/dashboard">Dashboard</a> (it scans the two indices and the heaviest stocks, or every F&O stock).</p>
      ) : (
        <ul className="srlist">
          <li><b>Verdict</b><span>{r.verdict}{r.convictionPct != null ? ` · ${r.convictionPct}%` : ''}</span></li>
          {r.primary && <li><b>View</b><span>{r.primary.label}</span></li>}
          {r.since && <li><b>Since</b><span>{r.since.label} · {r.since.days} d</span></li>}
          {r.entry != null && <li><b>Entry / stop / target</b><span className="num">{nf(r.entry)} / {r.stop != null ? nf(r.stop) : '—'} / {r.target != null ? nf(r.target) : '—'}</span></li>}
          {r.riskReward != null && <li><b>Reward : risk</b><span className="num">{r.riskReward.toFixed(1)}</span></li>}
        </ul>
      )}
    </Card>
  );
}

/** The Chart View of the old dashboard: 1, 2, 3, 4 or 6 charts at once, the 9:15 board with the Trade Focus marks and pinned names, view presets and an inspector with the gates, plan, levels, agreement and positional read of the selected chart. */
export function ChartView({ name, day, go, dark }: { name: string | null; day: string | null; go: (p: string) => void; dark: boolean }) {
  const { refresh } = useRefresh();
  const narrow = typeof window !== 'undefined' && window.innerWidth < 900;
  const [layout, setLayout] = useState<number>(() => (narrow ? 1 : rd(LAYOUT_KEY, 1)));
  const [panes, setPanes] = useState<string[]>(() => rd(PANES_KEY, DEFAULT_PANES));
  const [act, setAct] = useState(0);
  const [layers, setLayers] = useState<Layers>(() => ({ ...PRESETS.Standard, ...rd<Partial<Layers>>(LAYERS_KEY, {}) }));
  // a wide, tall window docks the side panels and fills the height; anything smaller (a laptop, an iPad) gives the charts the room and opens the panels as drawers
  const [size, setSize] = useState(() => ({ w: typeof window === 'undefined' ? 1600 : window.innerWidth, h: typeof window === 'undefined' ? 900 : window.innerHeight }));
  useEffect(() => {
    const f = (): void => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', f);
    window.addEventListener('orientationchange', f);
    return () => { window.removeEventListener('resize', f); window.removeEventListener('orientationchange', f); };
  }, []);
  const wide = size.w >= 1500 && size.h >= 760;
  const [boardDocked, setBoardDocked] = useState<boolean>(() => rd(BOARD_KEY, true));
  const [inspDocked, setInspDocked] = useState<boolean>(() => rd(INSP_KEY, false));
  const [drawer, setDrawer] = useState<'board' | 'insp' | null>(null);
  const board = wide ? boardDocked : drawer === 'board';
  const insp = wide ? inspDocked : drawer === 'insp';
  const toggleBoard = (): void => { if (wide) { setBoardDocked(!boardDocked); wr(BOARD_KEY, !boardDocked); } else setDrawer(drawer === 'board' ? null : 'board'); };
  const toggleInsp = (): void => { if (wide) { setInspDocked(!inspDocked); wr(INSP_KEY, !inspDocked); } else setDrawer(drawer === 'insp' ? null : 'insp'); };
  // the OI / OBV bars under each chart: on where there is room, off on smaller screens until asked for (the choice is remembered)
  const [oiPref, setOiPref] = useState<boolean | null>(() => rd<boolean | null>('groot.cv.oi', null));
  const showOi = oiPref ?? wide;
  // full screen: only the toolbar and the charts, for the most room on a tablet
  const [full, setFull] = useState(false);
  useEffect(() => {
    document.body.classList.toggle('cv-full', full);
    if (!full) return () => document.body.classList.remove('cv-full');
    const esc = (e: KeyboardEvent): void => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('keydown', esc); document.body.classList.remove('cv-full'); };
  }, [full]);
  const [layerMenu, setLayerMenu] = useState(false);
  const dayKey = `${tradingDayNow()}|${asOfQuery()}`;
  const [allMarks, setAllMarks] = useState<Record<string, Marks>>(() => rd('groot.cv.marks', {} as Record<string, Marks>));
  const marks = allMarks[dayKey] ?? {};
  const setMarks = (f: (m: Marks) => Marks): void =>
    setAllMarks((all) => {
      const next = { [dayKey]: f(all[dayKey] ?? {}) };
      wr('groot.cv.marks', next);
      return next;
    });
  // a name in the address opens in the selected chart
  useEffect(() => {
    if (!name) return;
    setPanes((p) => {
      const n = [...p];
      n[act] = name;
      wr(PANES_KEY, n);
      return n;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  const setLay = (l: Layers): void => {
    setLayers(l);
    wr(LAYERS_KEY, l);
  };
  const preset = useMemo(() => (Object.keys(PRESETS) as Preset[]).find((k) => JSON.stringify(PRESETS[k]) === JSON.stringify(layers)) ?? null, [layers]);
  const pickLayout = (n: number): void => {
    setLayout(n);
    wr(LAYOUT_KEY, n);
    setAct((a) => Math.min(a, n - 1));
  };
  const setName = (i: number, n: string): void =>
    setPanes((p) => {
      const nx = [...p];
      nx[i] = n;
      wr(PANES_KEY, nx);
      return nx;
    });
  // a preset fills the first charts and sets how many are shown; the other panes keep their names
  const pickSet = (names: string[]): void => {
    setPanes((p) => {
      const nx = [...names, ...p.slice(names.length)];
      wr(PANES_KEY, nx);
      return nx;
    });
    pickLayout(names.length);
    setAct(0);
  };
  const cur = panes[act] ?? 'NIFTY 50';
  const layouts = narrow ? [1, 2] : [1, 2, 3, 4, 6];
  const phone = typeof window !== 'undefined' && window.innerWidth < 760;
  // on a wide screen the view is as tall as the space left under whatever sits above it (banners come and go), so the charts never run below the window
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fit = (): void => {
      const e = root.current;
      if (!e) return;
      if (!(window.innerWidth >= 1500 && window.innerHeight >= 760) || document.body.classList.contains('cv-full')) { e.style.height = ''; return; }
      const top = e.getBoundingClientRect().top + window.scrollY;
      e.style.height = `${Math.max(560, window.innerHeight - top - 54)}px`;
    };
    fit();
    const t = window.setInterval(fit, 600);
    window.addEventListener('resize', fit);
    return () => { window.clearInterval(t); window.removeEventListener('resize', fit); };
  }, []);
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridW, setGridW] = useState(0);
  useEffect(() => {
    const e = gridRef.current;
    if (!e) return;
    const f = (): void => setGridW(e.clientWidth);
    f();
    const ro = new ResizeObserver(f);
    ro.observe(e);
    return () => ro.disconnect();
  }, []);
  const wanted = layout === 1 || (phone && layout <= 2) ? 1 : layout === 2 ? 2 : layout === 4 ? 2 : 3;
  // never squeeze a chart below about 440px: fewer columns instead (the charts then stack and the page scrolls)
  const cols = gridW ? Math.max(1, Math.min(wanted, Math.floor((gridW + 10) / 450))) : wanted;
  return (
    <div className={`chartview ${wide && !full ? 'wide' : 'compact'}${full ? ' full' : ''}`} ref={root}>
      <div className="cv-bar">
        <div className="seg" role="group" aria-label="Charts">
          <span className="seg-l">Charts</span>
          {layouts.map((n) => <button key={n} className={layout === n ? 'on' : ''} onClick={() => pickLayout(n)}>{n}</button>)}
        </div>
        <SetMenu shown={panes.slice(0, layout)} onPick={pickSet} />
        <div className="seg" role="group" aria-label="View">
          <span className="seg-l">View</span>
          {(Object.keys(PRESETS) as Preset[]).map((k) => <button key={k} className={preset === k ? 'on' : ''} onClick={() => setLay(PRESETS[k])}>{k}</button>)}
        </div>
        <div className="cv-layers">
          <button type="button" className={`ibtn ibtn-count${layerMenu ? ' on' : ''}`} onClick={() => setLayerMenu(!layerMenu)} aria-expanded={layerMenu} title="Layers on the chart" aria-label="Layers on the chart"><Icon name="sliders" size={18} /><b>{LAYER_DEFS.filter(([k]) => layers[k]).length}</b></button>
          {layerMenu && (
            <div className="cv-menu" role="menu">
              {LAYER_DEFS.map(([k, l]) => <label key={k}><input type="checkbox" checked={layers[k]} onChange={() => setLay({ ...layers, [k]: !layers[k] })} /> {l}</label>)}
            </div>
          )}
        </div>
        <IconButton icon="board" label="9:15 board" on={board} onClick={toggleBoard} />
        <IconButton icon="panel" label="Inspector (gates, trade, levels)" on={insp} onClick={toggleInsp} />
        <IconButton icon="options" label="OI / OBV bars under each chart" on={showOi} onClick={() => { setOiPref(!showOi); wr('groot.cv.oi', !showOi); }} />
        <IconButton icon="expand" label={full ? 'Leave full screen (Esc)' : 'Full screen charts'} on={full} onClick={() => setFull(!full)} />
        <IconButton icon="refresh" label="Refresh all charts" onClick={() => void refresh()} />
      </div>
      <div className="cv-body">
        {!wide && drawer && <div className="cv-backdrop" onClick={() => setDrawer(null)} aria-hidden="true" />}
        {board && <Board onPick={(n) => { setName(act, n); if (!wide) setDrawer(null); }} current={cur} marks={marks} setMarks={setMarks} narrow={narrow} />}
        <div className={`cv-grid${layout === 3 && cols === 2 ? ' odd' : ''}`} ref={gridRef} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, ['--cvh' as string]: `max(${narrow ? 300 : 280}px, calc((100dvh - ${narrow ? 300 : 260}px) / ${Math.ceil(layout / cols)}))` }}>
          {panes.slice(0, layout).map((n, i) => (
            <ChartPage key={i} name={n} day={day} go={go} dark={dark} embedded showOi={showOi} layersIn={layers} onName={(x) => setName(i, x)} active={layout > 1 && act === i} onActive={() => setAct(i)} />
          ))}
        </div>
        {insp && <Inspector name={cur} />}
      </div>
      <p className="small-note cv-foot">Selected chart: <b>{cur}</b>{marks[cur] ? ` · Trade Focus: ${marks[cur]!.call}${marks[cur]!.conf ? ` (${marks[cur]!.conf})` : ''}` : ''}. Levels, walls and plans are where several sources agree; they are not a forecast and nothing here places an order.</p>
    </div>
  );
}
