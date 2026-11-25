import { InstrumentPicker } from '../components/InstrumentPicker';
import { Stamp } from '../components/Stamp';
import { Info } from '../components/Info';
import { OiObvBars } from '../components/OiObvBars';
import { useOnDemand } from '../lib/refresh';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { api, history, universe, type Candle, type OiAnalysis, type ScanItem, type ScanState, type ScoreResult } from '../api';
import { addDays, asOfQuery, dayFor, getSnapshot, marketState, nf, nfi, signed, tone, tradingDayNow } from '../lib/format';
import { usePoll } from '../lib/hooks';
import { useLiveTicks } from '../lib/live';

const DEFAULT_NAMES = ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'INDIA VIX'];
const IST_SEC = 19800;

/** lightweight-charts draws UTC, so the IST wall clock is added to show market time on the axis. */
const toTime = (iso: string): UTCTimestamp => (Math.floor(Date.parse(iso.replace('+0530', '+05:30')) / 1000) + IST_SEC) as UTCTimestamp;

const css = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

interface Legend {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  t: string;
}

interface PlanLite {
  long: boolean;
  entryPx: number;
  stop: number;
  t1: { price: number } | null;
  t2: { price: number } | null;
}
interface ZoneLite {
  price: number;
  strength: number;
}

interface ConsLite {
  outcome: string;
  deadZoneBand: { lo: number; hi: number; broken: unknown } | null;
  score: ScoreResult;
}

const LAYER_DEFS = [
  ['levels', '9:15 levels'],
  ['walls', 'OI walls'],
  ['flow', 'OI flow'],
  ['range', 'Day range'],
  ['dead', 'Dead zone'],
  ['zones', 'Support / resistance'],
  ['trade', 'Trade plan'],
  ['prob', 'Level odds'],
  ['fut', 'Futures strip'],
  ['score', 'Score strip'],
] as const;
type Layers = Record<(typeof LAYER_DEFS)[number][0], boolean>;
export type { Layers };
export { LAYER_DEFS };
export const LAYERS_KEY = 'groot.cv.layers';
function readLayers(): Layers {
  const all: Layers = { levels: true, walls: true, flow: true, range: true, dead: true, zones: true, trade: true, prob: true, fut: true, score: true };
  try {
    return { ...all, ...(JSON.parse(localStorage.getItem(LAYERS_KEY) ?? '{}') as Partial<Layers>) };
  } catch {
    return all;
  }
}

interface ExtraLine {
  price: number;
  title: string;
  color: string;
  dashed?: boolean;
}

export function ChartPage({ name, day: dayArg, go, dark, embedded = false, layersIn, onName, active = false, onActive, showOi = true }: { name: string | null; day: string | null; go: (p: string) => void; dark: boolean; embedded?: boolean; layersIn?: Layers; onName?: (n: string) => void; active?: boolean; onActive?: () => void; showOi?: boolean }) {
  const [oi, setOi] = useState<OiAnalysis | null>(null);
  const oiSig = useRef({ h: '', changedAt: 0 });
  const [oiStamp, setOiStamp] = useState<{ at: number; changedAt: number } | null>(null);
  const [cons, setCons] = useState<ConsLite | null>(null);
  const [plan, setPlan] = useState<PlanLite | null>(null);
  const [zones, setZones] = useState<ZoneLite[]>([]);
  const [ownLayers, setLayers] = useState<Layers>(readLayers);
  const layers = layersIn ?? ownLayers;
  const [cmds, setCmds] = useState<string[]>([]);
  const [lp, setLp] = useState<Record<string, number | null> | null>(null);
  const [fut, setFut] = useState<{ t: string; remark: string; dir: number }[]>([]);
  const futEl = useRef<HTMLCanvasElement>(null);
  const scEl = useRef<HTMLCanvasElement>(null);
  const rrEl = useRef<HTMLCanvasElement>(null);
  const [sc, setSc] = useState<{ t: string; total: number }[]>([]);
  const [clock, setClock] = useState(0);
  const flowEl = useRef<HTMLCanvasElement>(null);
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candleS = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volS = useRef<ISeriesApi<'Histogram'> | null>(null);
  const lines = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[]>([]);
  const labels = useRef<{ price: number; title: string; color: string }[]>([]);
  const lbEl = useRef<HTMLCanvasElement>(null);
  const lbWidth = useRef(0);
  const [lbVer, setLbVer] = useState(0);
  const [names, setNames] = useState<Record<string, number>>({});
  const [candles, setCandles] = useState<Candle[]>([]);
  const lastClose = useRef(0);
  lastClose.current = candles.length ? candles[candles.length - 1]![4] : 0;
  const [scanItem, setScanItem] = useState<ScanItem | null>(null);
  const [legend, setLegend] = useState<Legend | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const sym = name ?? 'NIFTY 50';
  const day = dayArg ?? dayFor(sym);
  const isCmd = cmds.includes(sym);
  const ms = marketState(Date.now(), isCmd); // a commodity chart keeps running through the evening session
  // a snapshot time freezes the chart: no live candles on top of it
  const live = ms.open && day === dayFor(sym) && !getSnapshot();
  const stream = useLiveTicks(names[sym] ? [names[sym]] : [], live);
  const tick = names[sym] ? stream.ticks[names[sym]!] : undefined;
  const lastC = useRef<{ time: UTCTimestamp; open: number; high: number; low: number; close: number } | null>(null);

  useEffect(() => {
    universe().then((u) => setNames(u.names)).catch(() => undefined);
    api<{ names: string[] }>('/commodities').then((r) => setCmds(r.names)).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!cmds.includes(sym) || names[sym]) return;
    api<{ token: number; zone: string; open: number; ltp: number; strikeMap: { ustrikeOne: number; ustrikeTwo: number; bstrikeOne: number; bstrikeTwo: number } }>(`/commodity?name=${encodeURIComponent(sym)}&day=${day}${asOfQuery()}`)
      .then((c) => {
        setNames((n) => ({ ...n, [sym]: c.token }));
        setScanItem({ zone: c.zone as ScanItem['zone'], ast: c.strikeMap.ustrikeTwo, aso: c.strikeMap.ustrikeOne, bso: c.strikeMap.bstrikeOne, bst: c.strikeMap.bstrikeTwo, anchor: c.open, close: c.ltp, stepKnown: true });
      })
      .catch(() => undefined);
  }, [cmds, sym, day, names]);
  const token = names[sym];
  const options = useMemo(() => {
    const all = Object.keys(names).sort();
    return [...DEFAULT_NAMES.filter((n) => names[n]), ...cmds, ...all.filter((n) => !DEFAULT_NAMES.includes(n) && !cmds.includes(n))];
  }, [names, cmds]);

  // the chart itself: created once, restyled when the theme changes
  useEffect(() => {
    if (!el.current) return;
    // The TradingView logo is off; the licence's attribution notice and link are on the Help page instead.
    // TradingView Lightweight Charts™ Copyright (c) 2023 TradingView, Inc. https://www.tradingview.com/
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: css('--muted'), attributionLogo: false, fontFamily: 'inherit', fontSize: window.innerWidth > 760 ? 12 : 9 },
      grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: css('--line') },
      timeScale: { borderColor: css('--line'), timeVisible: true, secondsVisible: false },
      handleScale: { axisPressedMouseMove: true },
    });
    chart.current = c;
    // in the multi-chart view the mouse wheel scrolls the page: without this, scrolling down zoomed whichever chart was under the pointer to a few huge candles. Ctrl + wheel (or a pinch on a trackpad) zooms.
    const host = el.current;
    const wheel = (e: WheelEvent): void => { if (embedded && !e.ctrlKey) e.stopPropagation(); };
    host.addEventListener('wheel', wheel, { capture: true, passive: true });
    candleS.current = c.addCandlestickSeries({ upColor: css('--up'), downColor: css('--dn'), borderVisible: false, wickUpColor: css('--up'), wickDownColor: css('--dn') });
    volS.current = c.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.68, bottom: 0.2 } });
    c.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: 0.26 } });
    c.subscribeCrosshairMove((p) => {
      const d = p.seriesData.get(candleS.current as ISeriesApi<'Candlestick'>) as { open: number; high: number; low: number; close: number } | undefined;
      if (!d || !p.time) return setLegend(null);
      const v = (p.seriesData.get(volS.current as ISeriesApi<'Histogram'>) as { value: number } | undefined)?.value ?? 0;
      const t = new Date((p.time as number) * 1000).toISOString().slice(11, 16); // the axis already carries the IST offset
      setLegend({ o: d.open, h: d.high, l: d.low, c: d.close, v, t });
    });
    return () => {
      host.removeEventListener('wheel', wheel, { capture: true });
      c.remove();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.applyOptions({ layout: { textColor: css('--muted') }, grid: { vertLines: { color: css('--grid') }, horzLines: { color: css('--grid') } }, rightPriceScale: { borderColor: css('--line') }, timeScale: { borderColor: css('--line') } });
    candleS.current?.applyOptions({ upColor: css('--up'), downColor: css('--dn'), wickUpColor: css('--up'), wickDownColor: css('--dn') });
  }, [dark]);

  const loadCandles = async () => {
    if (!token) return;
    try {
      let c = await history(token, `${addDays(day, -3)} 09:00:00`, `${day} ${isCmd ? '23:59:00' : '15:30:00'}`);
      const snap = getSnapshot();
      // a snapshot time stops the chart there too (candles of earlier days are untouched)
      if (snap) c = c.filter((k) => String(k[0]).slice(0, 10) < day || String(k[0]).slice(11, 16) <= snap);
      // one session on the chart (as the userscript's chart does); the earlier days only feed the levels
      const lastDay = c.length ? String(c[c.length - 1]![0]).slice(0, 10) : day;
      const one = c.filter((k) => String(k[0]).slice(0, 10) === lastDay);
      setCandles(one.length ? one : c);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setLoading(true);
    setCandles([]);
    // a price scale the user dragged stays fixed: a new instrument (a different price range) must start automatic again, or its candles sit off the screen
    chart.current?.priceScale('right').applyOptions({ autoScale: true });
  }, [sym, day]);
  usePoll(loadCandles, live ? (stream.state === 'live' ? 60000 : 10000) : 600000, Boolean(token));

  // everything drawn on the chart besides the candles: OI walls, max pain, OI flow, the dead zone and the day range (fetched on load and on Refresh)
  useOnDemand(async () => {
    void loadCandles();
    const q = `name=${encodeURIComponent(sym)}&day=${day}${asOfQuery()}`;
    const [o, c] = await Promise.all([api<OiAnalysis>(`/oi?${q}`).catch(() => null), api<ConsLite>(`/consensus?${q}`).catch(() => null)]);
    setOi(o && o.name === sym ? o : null);
    if (o) { const h = JSON.stringify(o.rows); const n = Date.now(); if (oiSig.current.h !== h) oiSig.current = { h, changedAt: n }; setOiStamp({ at: n, changedAt: oiSig.current.changedAt }); }
    setCons(c);
    const [ol, sr] = await Promise.all([api<{ ok: boolean; plan: PlanLite | null }>(`/outlook?${q}`).catch(() => null), api<{ zones: ZoneLite[] }>(`/levels?${q}`).catch(() => null)]);
    setPlan(ol && ol.ok ? ol.plan : null);
    setZones(sr?.zones ?? []);
    const [lv, fs] = await Promise.all([api<Record<string, number | null>>(`/levelprob?${q}`).catch(() => null), api<{ points: { t: string; remark: string; dir: number }[] }>(`/futures/series?${q}`).catch(() => null)]);
    setLp(lv);
    setFut(fs?.points ?? []);
    api<{ points: { t: string; total: number }[] }>(`/scoreseries?${q}`).then((r) => setSc(r.points)).catch(() => undefined);
  }, [sym, day]);
  useEffect(() => {
    setOi(null);
    setCons(null);
    setPlan(null);
    setZones([]);
    setLp(null);
    setFut([]);
    setSc([]);
    if (!cmds.includes(sym)) setScanItem(null);
  }, [sym, day]);
  const toggleLayer = (k: keyof Layers): void =>
    setLayers((l) => {
      const n = { ...l, [k]: !l[k] };
      try {
        localStorage.setItem(LAYERS_KEY, JSON.stringify(n));
      } catch {
        /* ignore */
      }
      return n;
    });
  const pctOf = (k: string): string => (layers.prob && lp && lp[k] != null ? ` ${lp[k]}%` : '');
  const extra = useMemo<ExtraLine[]>(() => {
    const out: ExtraLine[] = [];
    if (oi && layers.walls) {
      oi.walls.resistance.forEach((x, i) => out.push({ price: x.strike, title: `R${i + 1}`, color: css('--dn'), dashed: x.tier === 'secondary' }));
      oi.walls.support.forEach((x, i) => out.push({ price: x.strike, title: `S${i + 1}`, color: css('--up'), dashed: x.tier === 'secondary' }));
      if (oi.maxPain) out.push({ price: oi.maxPain.maxPainK, title: 'Max pain', color: css('--muted'), dashed: true });
    }
    const dz = cons?.deadZoneBand;
    if (dz && layers.dead) {
      out.push({ price: dz.lo, title: 'D↓', color: '#8b5cf6', dashed: true });
      out.push({ price: dz.hi, title: 'D↑', color: '#8b5cf6', dashed: true });
    }
    const t = cons?.score.trend;
    if (t && layers.range) {
      if (t.vixUpper) out.push({ price: t.vixUpper, title: `VIXU${pctOf('pVIXU')}`, color: css('--warn'), dashed: true });
      if (t.vixLower) out.push({ price: t.vixLower, title: `VIXL${pctOf('pVIXL')}`, color: css('--warn'), dashed: true });
      out.push({ price: t.prevPrice, title: 'Prev close', color: css('--muted'), dashed: true });
    }
    if (plan && layers.trade) {
      const c = plan.long ? css('--up') : css('--dn');
      out.push({ price: plan.entryPx, title: plan.long ? 'Entry (long)' : 'Entry (short)', color: c });
      out.push({ price: plan.stop, title: 'Stop', color: css('--dn'), dashed: true });
      if (plan.t1) out.push({ price: plan.t1.price, title: 'T1', color: css('--up'), dashed: true });
      if (plan.t2) out.push({ price: plan.t2.price, title: 'T2', color: css('--up'), dashed: true });
    }
    if (layers.zones) {
      // the strongest zones only (strength 3 or more), so the chart stays readable
      for (const z of zones) if (z.strength >= 3) out.push({ price: z.price, title: `Zone ${'●'.repeat(Math.min(5, Math.round(z.strength)))}`, color: css('--accent'), dashed: true });
    }
    return out;
  }, [oi, cons, plan, zones, lp, layers.prob, layers.walls, layers.dead, layers.range, layers.trade, layers.zones, dark]);

  // OI flow drawn on the chart: the change in call OI (red) and put OI (green) at each strike today, growing left from the price axis
  useEffect(() => {
    const cv = flowEl.current;
    const host = el.current;
    if (!cv || !host) return;
    let lastKey = '';
    const draw = (): void => {
      const cs = candleS.current;
      const c = chart.current;
      const g = cv.getContext('2d');
      if (!cs || !c || !g) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      const rows = layers.flow && oi ? oi.rows : [];
      const ys = rows.map((r) => cs.priceToCoordinate(parseFloat(r.strike)));
      const key = `${w}x${h}|${host.offsetTop}|${rows.length}|${ys.map((y) => (y == null ? 'n' : Math.round(y))).join(',')}|${dark}`;
      if (key === lastKey) return;
      lastKey = key;
      const dpr = window.devicePixelRatio || 1;
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      cv.style.top = `${host.offsetTop}px`; // the canvas sits over the chart, whatever is above it (the legend line)
      cv.style.left = `${host.offsetLeft}px`;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      if (!rows.length) return;
      const edge = w - c.priceScale('right').width();
      const maxLen = Math.min(140, edge * 0.28);
      const mag = Math.max(1e-9, ...rows.flatMap((r) => [Math.abs(parseFloat(r.chgCE) || 0), Math.abs(parseFloat(r.chgPE) || 0)]));
      const valid = ys.filter((y) => y != null).map(Number);
      const step = valid.length > 1 ? Math.abs(valid[0]! - valid[valid.length - 1]!) / (valid.length - 1) : 12;
      const bh = Math.max(2, Math.min(10, step * 0.38));
      rows.forEach((r, i) => {
        const y = ys[i];
        if (y == null || y < 0 || y > h) return;
        const ce = Math.abs(parseFloat(r.chgCE) || 0);
        const pe = Math.abs(parseFloat(r.chgPE) || 0);
        g.fillStyle = css('--dn-soft');
        g.fillRect(edge - (ce / mag) * maxLen, y - bh - 0.5, (ce / mag) * maxLen, bh);
        g.fillStyle = css('--up-soft');
        g.fillRect(edge - (pe / mag) * maxLen, y + 0.5, (pe / mag) * maxLen, bh);
      });
    };
    draw();
    const t = window.setInterval(draw, 300); // follows pan, zoom and rescaling of the price axis
    return () => window.clearInterval(t);
  }, [oi, layers.flow, dark]);

  // 9:15 levels of this name for the day
  useEffect(() => {
    if (cmds.includes(sym)) return;
    setScanItem(null);
    api<ScanState>(`/scan915?day=${day}`).then((s) => setScanItem(s.items[sym] ?? null)).catch(() => undefined);
  }, [sym, day, cmds]);

  // the futures remark after each candle, as a coloured strip above the time axis
  useEffect(() => {
    const cv = futEl.current;
    const host = el.current;
    if (!cv || !host) return;
    let lastKey = '';
    const draw = (): void => {
      const c = chart.current;
      const g = cv.getContext('2d');
      if (!c || !g) return;
      const w = host.clientWidth;
      const pts = layers.fut ? fut : [];
      const xs = pts.map((p) => c.timeScale().timeToCoordinate(toTime(`${day}T${p.t.length > 5 ? p.t.slice(-5) : p.t}:00+0530`)));
      const key = `${w}|${pts.length}|${xs.map((x) => (x == null ? 'n' : Math.round(x))).join(',')}|${dark}`;
      if (key === lastKey) return;
      lastKey = key;
      const dpr = window.devicePixelRatio || 1;
      cv.width = w * dpr;
      cv.height = 10 * dpr;
      cv.style.width = `${w}px`;
      cv.style.height = '10px';
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, 10);
      const sp = Math.max(2, c.timeScale().options().barSpacing ?? 6);
      pts.forEach((p, i) => {
        const x = xs[i];
        if (x == null || x < 0 || x > w) return;
        g.fillStyle = p.dir > 0 ? css('--up') : p.dir < 0 ? css('--dn') : css('--line');
        g.fillRect(x - sp / 2 + 0.5, 1, Math.max(1, sp - 1), 8);
      });
    };
    draw();
    const t = window.setInterval(draw, 300);
    return () => window.clearInterval(t);
  }, [fut, layers.fut, day, dark]);

  // the instrument score after each time slot (bars up for bullish, down for bearish), and the shaded risk / reward boxes
  useEffect(() => {
    const host = el.current;
    const sCv = scEl.current;
    const rCv = rrEl.current;
    if (!host || !sCv || !rCv) return;
    let lastKey = '';
    const size = (cv: HTMLCanvasElement, h: number): CanvasRenderingContext2D | null => {
      const w = host.clientWidth;
      if (cv === rCv) { cv.style.top = `${host.offsetTop}px`; cv.style.left = `${host.offsetLeft}px`; }
      const dpr = window.devicePixelRatio || 1;
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      const g = cv.getContext('2d');
      g?.setTransform(dpr, 0, 0, dpr, 0, 0);
      g?.clearRect(0, 0, w, h);
      return g;
    };
    const draw = (): void => {
      const c = chart.current;
      const cs = candleS.current;
      if (!c || !cs) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      const pts = layers.score ? sc : [];
      const xs = pts.map((p) => c.timeScale().timeToCoordinate(toTime(`${day}T${p.t}:00+0530`)));
      const ys = plan && layers.trade ? [plan.entryPx, plan.stop, plan.t1?.price, plan.t2?.price].map((v) => (v == null ? null : cs.priceToCoordinate(v))) : [];
      const key = `${w}|${h}|${host.offsetTop}|${Math.round(lbWidth.current)}|${pts.length}|${xs.map((x) => (x == null ? 'n' : Math.round(x))).join(',')}|${ys.map((y) => (y == null ? 'n' : Math.round(y))).join(',')}|${dark}`;
      if (key === lastKey) return;
      lastKey = key;
      const g = size(sCv, 26);
      if (g) {
        // one bar per score slot: as wide as the candles it covers (a 5-minute slot is one candle, a 15-minute MCX slot is three), with a gap between bars
        const mins = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
        const stepMin = pts.length > 1 ? Math.max(5, mins(pts[1]!.t) - mins(pts[0]!.t)) : 5;
        const sp = Math.max(2, (c.timeScale().options().barSpacing ?? 6) * (stepMin / 5));
        g.fillStyle = css('--line');
        g.fillRect(0, 13, w, 1);
        pts.forEach((p, i) => {
          const x = xs[i];
          if (x == null || x < -sp || x > w + sp) return;
          const hh = Math.min(12, (Math.abs(p.total) / 8) * 12);
          g.fillStyle = p.total > 0.5 ? css('--up') : p.total < -0.5 ? css('--dn') : css('--muted');
          g.fillRect(x - sp / 2 + 1, p.total >= 0 ? 13 - hh : 14, Math.max(1, sp - 2), Math.max(1, hh));
        });
      }
      const r = size(rCv, h);
      if (r && plan && ys[0] != null && ys[1] != null) {
        const [e, st, t1, t2] = ys as (number | null)[];
        const axisW = chart.current?.priceScale('right').width() ?? 0;
        const bw = Math.max(70, lbWidth.current + 8);
        const x0 = Math.max(0, w - axisW - bw - 4);
        const box = (a: number, b: number, color: string, label: string): void => {
          r.globalAlpha = 0.16;
          r.fillStyle = color;
          r.fillRect(x0, Math.min(a, b), bw, Math.abs(b - a));
          r.globalAlpha = 1;
          r.fillStyle = color;
          r.font = '600 10px system-ui, sans-serif';
          r.fillText(label, x0 + 6, Math.min(a, b) + 12);
        };
        const risk = Math.abs(plan.entryPx - plan.stop) || 1;
        box(e!, st!, css('--dn'), 'Risk');
        if (t1 != null && plan.t1) box(e!, t1, css('--up'), `T1 ${(Math.abs(plan.t1.price - plan.entryPx) / risk).toFixed(1)}R`);
        if (t2 != null && plan.t2) box(t1 ?? e!, t2, css('--up'), `T2 ${(Math.abs(plan.t2.price - plan.entryPx) / risk).toFixed(1)}R`);
      }
    };
    draw();
    const t = window.setInterval(draw, 300);
    return () => window.clearInterval(t);
  }, [sc, plan, layers.score, layers.trade, day, dark]);

  // seconds to the next 5-minute candle while the market is open
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setClock((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [live]);
  const nextIn = ((): string | null => {
    if (!live) return null;
    void clock;
    const left = 300 - (Math.floor(Date.now() / 1000) % 300);
    return `next candle ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  })();

  // price labels of the level lines: one column beside the price scale, pushed apart (never overlapping), with a short leader when moved
  useEffect(() => {
    const host = el.current;
    const cv = lbEl.current;
    if (!host || !cv) return;
    let lastKey = '';
    const draw = (): void => {
      const cs = candleS.current;
      const c = chart.current;
      if (!cs || !c) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      const axisW = c.priceScale('right').width();
      const items = labels.current
        .map((l) => ({ ...l, y: cs.priceToCoordinate(l.price) }))
        .filter((l) => l.y != null && l.y > 6 && l.y < h - 30)
        .map((l) => ({ ...l, y: l.y as number }))
        .sort((a, b) => a.y - b.y);
      // too many labels bury the candles: the plan labels always stay, the rest are the ones nearest the price (the other lines stay drawn, just unlabelled)
      const lastY = lastClose.current ? cs.priceToCoordinate(lastClose.current) : null;
      const cap = h < 420 ? 7 : 11;
      if (lastY != null && items.length > cap) {
        const must = new Set(['Stop', 'T1', 'T2', 'Entry (short)', 'Entry (long)']);
        const rest = items.filter((i) => !must.has(i.title)).sort((a, b) => Math.abs(a.y - lastY) - Math.abs(b.y - lastY));
        const room = Math.max(3, cap - items.filter((i) => must.has(i.title)).length);
        const keep = new Set(rest.slice(0, room));
        for (let i = items.length - 1; i >= 0; i--) if (!must.has(items[i]!.title) && !keep.has(items[i]!)) items.splice(i, 1);
      }
      const key = `${w}|${h}|${host.offsetTop}|${axisW}|${items.map((i) => `${i.title}${Math.round(i.y)}`).join(',')}|${dark}`;
      if (key === lastKey) return;
      lastKey = key;
      const dpr = window.devicePixelRatio || 1;
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      cv.style.top = `${host.offsetTop}px`;
      cv.style.left = `${host.offsetLeft}px`;
      const g = cv.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const GAP = 15;
      const pos = items.map((i) => i.y);
      for (let i = 1; i < pos.length; i++) if (pos[i]! - pos[i - 1]! < GAP) pos[i] = pos[i - 1]! + GAP;
      // if the pile ran off the bottom, pull it back up
      for (let i = pos.length - 2; i >= 0; i--) if (pos[i + 1]! - pos[i]! < GAP && pos[i + 1]! > h - 34) pos[i] = pos[i + 1]! - GAP;
      g.font = '600 10px system-ui, sans-serif';
      g.textBaseline = 'middle';
      // keep a blank column on the right for the labels, so they never cover the latest candles
      const widest = items.reduce((m, it) => Math.max(m, g.measureText(it.title).width + 10), 0);
      const sp = c.timeScale().options().barSpacing || 6;
      const want = Math.min(40, Math.ceil((widest + 14) / sp));
      if (Math.abs((c.timeScale().options().rightOffset ?? 0) - want) > 1) c.timeScale().applyOptions({ rightOffset: want });
      lbWidth.current = widest;
      items.forEach((it, i) => {
        const y = pos[i]!;
        const tw = g.measureText(it.title).width + 10;
        const x = w - axisW - tw - 6;
        if (Math.abs(y - it.y) > 1.5) {
          g.strokeStyle = it.color;
          g.globalAlpha = 0.6;
          g.beginPath();
          g.moveTo(x + tw, y);
          g.lineTo(w - axisW, it.y);
          g.stroke();
          g.globalAlpha = 1;
        }
        g.fillStyle = it.color;
        g.fillRect(x, y - 7, tw, 14);
        g.fillStyle = '#fff';
        g.fillText(it.title, x + 5, y + 0.5);
      });
    };
    draw();
    const t = window.setInterval(draw, 300);
    return () => window.clearInterval(t);
  }, [lbVer, dark]);

  // draw the data
  useEffect(() => {
    const cs = candleS.current;
    const vs = volS.current;
    if (!cs || !vs) return;
    cs.setData(candles.map((k) => ({ time: toTime(k[0]), open: k[1], high: k[2], low: k[3], close: k[4] })));
    const hasVol = candles.some((k) => k[5] > 0); // indices carry no volume: draw no volume bars
    vs.setData(hasVol ? candles.map((k) => ({ time: toTime(k[0]), value: k[5], color: k[4] >= k[1] ? css('--up-soft') : css('--dn-soft') })) : []);
    if (candles.length) chart.current?.timeScale().fitContent();
    const l = candles[candles.length - 1];
    lastC.current = l ? { time: toTime(l[0]), open: l[1], high: l[2], low: l[3], close: l[4] } : null;
  }, [candles, dark]);

  // a live tick moves the forming candle, or starts the next one
  useEffect(() => {
    const cs = candleS.current;
    const cur = lastC.current;
    if (!tick || !cs || !cur || !(tick.ltp > 0)) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const at = tick.ts && Math.abs(tick.ts - nowSec) < 120 ? tick.ts : nowSec;
    const bucket = (Math.floor((at + IST_SEC) / 300) * 300) as UTCTimestamp;
    if (bucket < cur.time) return;
    const next = bucket === cur.time ? { time: cur.time, open: cur.open, high: Math.max(cur.high, tick.ltp), low: Math.min(cur.low, tick.ltp), close: tick.ltp } : { time: bucket, open: tick.ltp, high: tick.ltp, low: tick.ltp, close: tick.ltp };
    lastC.current = next;
    cs.update(next);
  }, [tick]);

  // level lines
  useEffect(() => {
    const cs = candleS.current;
    if (!cs) return;
    lines.current.forEach((l) => cs.removePriceLine(l));
    lines.current = [];
    labels.current = [];
    // the labels are drawn by the overlay below, spread apart so they never sit on top of each other
    for (const x of extra ?? []) {
      lines.current.push(cs.createPriceLine({ price: x.price, color: x.color, lineWidth: 1, lineStyle: x.dashed ? LineStyle.Dashed : LineStyle.Solid, axisLabelVisible: false, title: '' }));
      labels.current.push({ price: x.price, title: x.title, color: x.color });
    }
    setLbVer((n) => n + 1);
    if (!scanItem || !layers.levels) return;
    const add = (price: number | null, title: string, color: string, style: LineStyle) => {
      if (price == null || Number.isNaN(price)) return;
      lines.current.push(cs.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: false, title: '' }));
      labels.current.push({ price, title, color });
    };
    add(scanItem.ast, `AST${pctOf('pAST')}`, css('--up'), LineStyle.Solid);
    add(scanItem.aso, `ASO${pctOf('pASO')}`, css('--up'), LineStyle.Dashed);
    add(scanItem.anchor, 'Open', css('--accent'), LineStyle.Dotted);
    add(scanItem.bso, `BSO${pctOf('pBSO')}`, css('--dn'), LineStyle.Dashed);
    add(scanItem.bst, `BST${pctOf('pBST')}`, css('--dn'), LineStyle.Solid);
    setLbVer((n) => n + 1);
  }, [scanItem, dark, candles.length, extra, layers.levels, lp, layers.prob]);

  const dayCandles = candles.filter((k) => k[0].slice(0, 10) === day);
  const last = dayCandles[dayCandles.length - 1];
  const first = dayCandles[0];
  const prevClose = candles.filter((k) => k[0].slice(0, 10) < day).slice(-1)[0]?.[4];
  const ref = prevClose ?? first?.[1];
  const px = tick && tick.ltp > 0 && live ? tick.ltp : last?.[4];
  const chg = px != null && ref != null ? px - ref : null;
  const pct = chg != null && ref ? (chg / ref) * 100 : null;

  return (
    <div className={`page chart-page${embedded ? ' embedded' : ''}${active ? ' active' : ''}`} onPointerDown={onActive}>
      <header className="page-head">
        <div title={`5-minute candles · ${day}${live ? (stream.state === 'live' ? ' · live' : ' · connecting') : ''}${nextIn ? ' · ' + nextIn : ''}`}>
          <InstrumentPicker value={sym} options={options.length ? options : DEFAULT_NAMES} quick={DEFAULT_NAMES} onChange={(n) => (onName ? onName(n) : go(`chart/${encodeURIComponent(n)}/${day}`))} />
          <p className="sub">
            5-minute candles · {day}
            {live ? (stream.state === 'live' ? ' · live' : ' · connecting to live prices') : ''}{nextIn ? ' · ' + nextIn : ''}
          </p>
        </div>
        <div className="cv-chips">
          {cons && <span className={`call ${cons.outcome.includes('LONG') ? 'up' : cons.outcome.includes('SHORT') ? 'dn' : 'flat'}`}>{cons.outcome}</span>}
          {cons && <span className={`num score-chip ${tone(cons.score.score.total)}`}>score {signed(cons.score.score.total, 2)}</span>}
          {cons?.deadZoneBand && !cons.deadZoneBand.broken && <span className="chip-dz">dead zone</span>}
        </div>
        <div className="quote-block">
          <div className="idx-price num">{px != null ? nf(px) : '—'}</div>
          <div className={`idx-chg num ${tone(chg)}`}>
            {chg != null ? `${signed(chg)}  (${signed(pct)}%)` : ''}
          </div>
        </div>
      </header>

      {err && (
        <p className="banner err" role="alert">
          {err} <button className="btn" onClick={() => { setLoading(true); void loadCandles(); }}>Try again</button>
        </p>
      )}

      <div className={`plan-line ${plan ? (plan.long ? 'up' : 'dn') : 'none'}`}>
        {plan ? (
          <>
            <b>{plan.long ? 'LONG' : 'SHORT'} plan</b>
            <span>Entry <b className="num">{nfi(plan.entryPx)}</b></span>
            <span>Stop <b className="num">{nfi(plan.stop)}</b></span>
            {plan.t1 && <span>T1 <b className="num">{nfi(plan.t1.price)}</b></span>}
            {plan.t2 && <span>T2 <b className="num">{nfi(plan.t2.price)}</b></span>}
            {plan.t1 && plan.entryPx !== plan.stop && <span className="muted">R:R {(Math.abs(plan.t1.price - plan.entryPx) / Math.abs(plan.entryPx - plan.stop)).toFixed(1)}</span>}
          </>
        ) : (
          <span className="muted">No trade plan for {sym} yet: it needs the option chain and a clear direction. It appears here and on the chart when ready.</span>
        )}
      </div>

      {!layersIn && (
      <div className="layer-chips" role="group" aria-label="Show on the chart">
        {LAYER_DEFS.map(([k, label]) => (
          <button key={k} className={layers[k] ? 'on' : ''} aria-pressed={layers[k]} onClick={() => toggleLayer(k)}>
            {label}
          </button>
        ))}
      </div>
      )}

      <section className="card chart-card">
        <div className="legend num" aria-live="off">
          {(legend ?? (last ? { o: last[1], h: last[2], l: last[3], c: last[4], v: last[5], t: last[0].slice(11, 16) } : null)) &&
            (() => {
              const l = legend ?? { o: last![1], h: last![2], l: last![3], c: last![4], v: last![5], t: last![0].slice(11, 16) };
              return (
                <>
                  <span>{l.t}</span>
                  <span>
                    O <b>{nf(l.o)}</b>
                  </span>
                  <span>
                    H <b>{nf(l.h)}</b>
                  </span>
                  <span>
                    L <b>{nf(l.l)}</b>
                  </span>
                  <span>
                    C <b>{nf(l.c)}</b>
                  </span>
                  <span>
                    Vol <b>{nfi(l.v)}</b>
                  </span>
                </>
              );
            })()}
        </div>
        <div ref={el} className="chart-host" title={embedded ? 'Ctrl + scroll to zoom, drag to move, double-click the time axis to reset' : undefined} />
        <canvas ref={flowEl} className="oi-flow" aria-hidden="true" />
        <canvas ref={rrEl} className="rr-cv" aria-hidden="true" />
        <canvas ref={lbEl} className="rr-cv lb-cv" aria-hidden="true" />
        <canvas ref={scEl} className="score-strip-cv" aria-hidden="true" />
        {layers.score && sc.length > 0 && <span className="fut-label score-label" title="Instrument score after each slot: green up bars bullish, red down bars bearish">SCORE</span>}
        <canvas ref={futEl} className="fut-strip-cv" aria-hidden="true" />
        {layers.fut && fut.length > 0 && <span className="fut-label" title="Futures remark after each candle: green bullish, red bearish, grey neutral">FUT</span>}
        {loading && <div className="chart-loading">Loading candles…</div>}
        {!loading && candles.length === 0 && !err && <div className="chart-loading">No candles for this day.</div>}
      </section>
      {(!embedded || showOi) && (
        <section className="card cv-oibars" aria-label="OI and OBV by strike">
          <div className="card-head"><h2>OI / OBV by strike</h2><Info k="OI / OBV by strike" /><span className="muted">{oi ? `${sym} · ${oi.expiry}` : ''}</span><Stamp at={oiStamp?.at} changedAt={oiStamp?.changedAt} /></div>
          {oi ? <OiObvBars rows={oi.rows} half={embedded ? 74 : 120} /> : <p className="muted">Reading the option chain…</p>}
        </section>
      )}

      {scanItem && !embedded && (
        <section className="card levels-card">
          <div className="card-head">
            <h2>
              9:15 levels <span className={`zone-badge z-${scanItem.zone.replace('/', '')}`}>{scanItem.zone}</span>
            </h2>
            <span className="cv-links">
              <a className="pill" href="#/focus" onClick={() => { try { localStorage.setItem('groot.focus', sym); } catch { /* ignore */ } }}>Trade Focus →</a>
            </span>
          </div>
          <ul className="lvl-list num">
            {([['AST', scanItem.ast, 'up'], ['ASO', scanItem.aso, 'up'], ['Open', scanItem.anchor, 'acc'], ['BSO', scanItem.bso, 'dn'], ['BST', scanItem.bst, 'dn']] as [string, number | null, string][])
              .filter((r): r is [string, number, string] => r[1] != null)
              .map(([l, v, t]) => {
                const d = px != null ? v - px : null;
                return (
                  <li key={l} className={t}>
                    <b>{l}</b>
                    <span>{nf(v)}</span>
                    <em className="muted">{d == null ? '' : Math.abs(d) < 0.005 * (px ?? 1) / 10 ? 'at price' : `${d > 0 ? '+' : '−'}${nf(Math.abs(d))} · ${d > 0 ? 'above' : 'below'}`}</em>
                  </li>
                );
              })}
          </ul>
        </section>
      )}
    </div>
  );
}
