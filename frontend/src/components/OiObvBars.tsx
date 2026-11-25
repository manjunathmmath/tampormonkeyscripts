import { useEffect, useRef, useState } from 'react';
import type { OiStrikeView } from '../api';

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const short = (n: number): string => {
  const a = Math.abs(n);
  const s = a >= 10000000 ? `${(a / 10000000).toFixed(1)}Cr` : a >= 100000 ? `${(a / 100000).toFixed(1)}L` : a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : String(Math.round(a));
  return `${n < 0 ? '−' : ''}${s}`;
};

/** One panel: a pair of bars per strike (calls red, puts green), up for a gain and down for a fall, with the at-the-money strike shaded and the biggest values labelled. */
function Panel({ title, rows, ce, pe, h, colW }: { title: string; rows: OiStrikeView[]; ce: (r: OiStrikeView) => number; pe: (r: OiStrikeView) => number; h: number; colW: number }) {
  const max = Math.max(...rows.flatMap((r) => [Math.abs(ce(r)), Math.abs(pe(r))]), 1e-9);
  const mid = h / 2 + 4;
  const room = h / 2 - 14;
  const bw = Math.min(26, Math.max(7, colW * 0.34));
  const label = colW >= 40;
  return (
    <g>
      {rows.map((r, i) => {
        const x = i * colW;
        const c = ce(r);
        const p = pe(r);
        const hc = (Math.abs(c) / max) * room;
        const hp = (Math.abs(p) / max) * room;
        const cx = x + colW / 2;
        return (
          <g key={r.strike}>
            {r.atm && <rect x={x + 1} y="14" width={colW - 2} height={h - 14} className="ob-atm" rx="3" />}
            <rect x={cx - bw - 1} y={c >= 0 ? mid - hc : mid} width={bw} height={Math.max(1.5, hc)} className="ob-ce" opacity={c >= 0 ? 1 : 0.5} rx="1.5">
              <title>{`${r.strike} calls ${c.toLocaleString('en-IN')}`}</title>
            </rect>
            <rect x={cx + 1} y={p >= 0 ? mid - hp : mid} width={bw} height={Math.max(1.5, hp)} className="ob-pe" opacity={p >= 0 ? 1 : 0.5} rx="1.5">
              <title>{`${r.strike} puts ${p.toLocaleString('en-IN')}`}</title>
            </rect>
            {label && hc > 14 && <text x={cx - bw / 2 - 1} y={c >= 0 ? mid - hc - 2 : mid + hc + 9} textAnchor="middle" className="ob-v ce">{short(c)}</text>}
            {label && hp > 14 && <text x={cx + bw / 2 + 1} y={p >= 0 ? mid - hp - 2 : mid + hp + 9} textAnchor="middle" className="ob-v pe">{short(p)}</text>}
          </g>
        );
      })}
      <line x1="0" x2={rows.length * colW} y1={mid} y2={mid} className="ob-axis" />
      <text x={rows.length * colW - 2} y="10" textAnchor="end" className="ob-title">{title}</text>
    </g>
  );
}

/**
 * The strike-by-strike OI change and OBV flow as vertical bars, one column per strike around the money (the userscript's OI / OBV matrix):
 * calls red, puts green, solid for a build-up and faded for a reduction, the at-the-money strike shaded. It stretches to the width of its box.
 */
export function OiObvBars({ rows, half = 120 }: { rows: OiStrikeView[]; half?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const f = (): void => setW(el.clientWidth);
    f();
    const ro = new ResizeObserver(f);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!rows.length) return <p className="muted">No option chain rows yet.</p>;
  const colW = Math.max(34, Math.min(92, (w || 360) / rows.length));
  const W = rows.length * colW;
  const H = half;
  return (
    <div className="ob-box" ref={box}>
      <div className="ob-legend"><span><i className="ob-ce" /> Calls</span><span><i className="ob-pe" /> Puts</span><span className="muted">solid = built up · faded = reduced · shaded = at the money</span></div>
      <div className="ob-wrap">
        <svg className="ob" viewBox={`0 0 ${W} ${H * 2 + 26}`} width={Math.max(W, w || W)} height={H * 2 + 26} role="img" aria-label="Open interest change and OBV by strike">
          <Panel title="OI CHANGE" rows={rows} ce={(r) => num(r.chgCE)} pe={(r) => num(r.chgPE)} h={H} colW={colW} />
          <g transform={`translate(0 ${H + 2})`}>
            <Panel title="OBV" rows={rows} ce={(r) => num(r.obvCE)} pe={(r) => num(r.obvPE)} h={H} colW={colW} />
          </g>
          {rows.map((r, i) => (
            <text key={r.strike} x={i * colW + colW / 2} y={H * 2 + 20} textAnchor="middle" className={`ob-k${r.atm ? ' atm' : ''}`}>{r.strike}</text>
          ))}
        </svg>
      </div>
    </div>
  );
}
