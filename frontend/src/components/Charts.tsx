import type { ReactNode } from 'react';

/** Rows of bars that grow left (negative, red) or right (positive, green) from a centre line. The longest bar fills its half. */
export function DivBars({ rows, unit = '', dec = 1, max, stack = false }: { rows: { key: string; label: ReactNode; value: number; right?: ReactNode; dim?: boolean; title?: string }[]; unit?: string; dec?: number; max?: number; stack?: boolean }) {
  const m = max ?? Math.max(...rows.map((r) => Math.abs(r.value)), 0.0001);
  return (
    <ul className={`dbars${stack ? ' stack' : ''}`}>
      {rows.map((r) => (
        <li key={r.key} className={r.dim ? 'dim' : ''} title={r.title}>
          <span className="db-l">{r.label}</span>
          <span className="db-track" aria-hidden="true">
            <i className={r.value >= 0 ? 'up' : 'dn'} style={{ width: `${(Math.abs(r.value) / m) * 50}%`, [r.value >= 0 ? 'left' : 'right']: '50%' }} />
          </span>
          <b className={`num ${r.value > 0 ? 'up' : r.value < 0 ? 'dn' : ''}`}>{r.value > 0 ? '+' : ''}{r.value.toFixed(dec)}{unit}</b>
          {r.right && <span className="db-r muted">{r.right}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Percent bars (0 to 100) with a marker at 50: above it the thing works more often than not. */
export function WinBars({ rows }: { rows: { key: string; label: ReactNode; pct: number; sub?: ReactNode; dim?: boolean }[] }) {
  return (
    <ul className="wbars">
      {rows.map((r) => (
        <li key={r.key} className={r.dim ? 'dim' : ''}>
          <div className="wb-top"><span className="wb-l">{r.label}</span><b className={`num ${r.pct >= 55 ? 'up' : r.pct <= 45 ? 'dn' : ''}`}>{r.pct}%</b></div>
          <div className="wb-track"><i className={r.pct >= 55 ? 'up' : r.pct <= 45 ? 'dn' : 'flat'} style={{ width: `${Math.min(100, r.pct)}%` }} /><s /></div>
          {r.sub && <div className="wb-sub muted">{r.sub}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Open interest change by strike: calls grow to the left (red), puts to the right (green), the at-the-money strike is highlighted. */
export function OiButterfly({ rows }: { rows: { strike: number; ce: number; pe: number; atm?: boolean }[] }) {
  const m = Math.max(...rows.flatMap((r) => [Math.abs(r.ce), Math.abs(r.pe)]), 0.0001);
  return (
    <div className="oib" role="img" aria-label="Open interest change by strike">
      <div className="oib-head"><span className="dn">Calls</span><span>Strike</span><span className="up">Puts</span></div>
      {rows.map((r) => (
        <div key={r.strike} className={`oib-row${r.atm ? ' atm' : ''}`}>
          <span className="oib-l"><i className={r.ce >= 0 ? 'dn' : 'flat'} style={{ width: `${(Math.abs(r.ce) / m) * 100}%` }} /><em className="num">{r.ce}</em></span>
          <b className="num">{r.strike}</b>
          <span className="oib-r"><i className={r.pe >= 0 ? 'up' : 'flat'} style={{ width: `${(Math.abs(r.pe) / m) * 100}%` }} /><em className="num">{r.pe}</em></span>
        </div>
      ))}
    </div>
  );
}

export interface Rung { key: string; price: number; label: ReactNode; kind: 'res' | 'sup'; strength: number; title?: string }

/** A price ladder: resistance above, support below, the current price as a marker line between, strength as bar length. */
export function LevelLadder({ rungs, spot, fmt }: { rungs: Rung[]; spot: number; fmt: (n: number) => string }) {
  const up = rungs.filter((r) => r.kind === 'res').sort((a, b) => b.price - a.price);
  const dn = rungs.filter((r) => r.kind === 'sup').sort((a, b) => b.price - a.price);
  const row = (r: Rung) => (
    <li key={r.key} className={r.kind} title={r.title}>
      <b className="num">{fmt(r.price)}</b>
      <span className="ll-bar"><i style={{ width: `${Math.min(100, (r.strength / 5) * 100)}%` }} /></span>
      <span className="ll-l muted">{r.label}</span>
    </li>
  );
  return (
    <ul className="ladder2">
      {up.map(row)}
      <li className="spot"><b className="num">{fmt(spot)}</b><span className="ll-bar"><i style={{ width: '100%' }} /></span><span className="ll-l">price now</span></li>
      {dn.map(row)}
    </ul>
  );
}

/** A ring showing a percent with a word under it. */
export function Ring({ pct, label, sub, tone }: { pct: number; label: string; sub?: string; tone: 'up' | 'dn' | 'flat' }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" role="img" aria-label={`${label} ${pct}%`}>
      <svg viewBox="0 0 64 64" width="72" height="72">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--surface2)" strokeWidth="7" />
        <circle cx="32" cy="32" r={r} fill="none" className={`ring-${tone}`} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(Math.max(0, Math.min(100, pct)) / 100) * c} ${c}`} transform="rotate(-90 32 32)" />
        <text x="32" y="36" textAnchor="middle" className="ring-n">{pct}%</text>
      </svg>
      <b>{label}</b>
      {sub && <span className="muted">{sub}</span>}
    </div>
  );
}

/** A trade plan on one price line: stop, entry and the targets in their real proportions, with the current price as a marker. */
export function PlanRuler({ stop, entry, t1, t2, spot, fmt }: { stop: number; entry: number; t1: number | null; t2: number | null; spot: number | null; fmt: (n: number) => string }) {
  const pts: [string, number, string][] = [['Stop', stop, 'dn'], ['Entry', entry, 'acc'], ...(t1 != null ? [['T1', t1, 'up'] as [string, number, string]] : []), ...(t2 != null ? [['T2', t2, 'up'] as [string, number, string]] : [])];
  const vals = [...pts.map((p) => p[1]), ...(spot != null ? [spot] : [])];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pos = (v: number): string => `${6 + ((v - lo) / (hi - lo || 1)) * 88}%`;
  const a = Math.min(stop, entry);
  const b = Math.max(stop, entry);
  const e = Math.max(...pts.map((p) => p[1]));
  const f = Math.min(...pts.map((p) => p[1]));
  return (
    <div className="ruler" role="img" aria-label="Trade plan on a price line">
      <div className="ruler-line">
        <i className="risk" style={{ left: pos(a), width: `calc(${pos(b)} - ${pos(a)})` }} />
        <i className="reward" style={{ left: pos(Math.min(entry, e)), width: `calc(${pos(Math.max(entry, e))} - ${pos(Math.min(entry, e))})`, display: e === entry ? 'none' : undefined }} />
        <i className="reward" style={{ left: pos(f), width: `calc(${pos(entry)} - ${pos(f)})`, display: f === entry ? 'none' : undefined }} />
        {pts.map(([l, v, t]) => (
          <span key={l} className={`rk-pt ${t}`} style={{ left: pos(v) }}><u /><em>{l}</em><b className="num">{fmt(v)}</b></span>
        ))}
        {spot != null && <span className="rk-spot" style={{ left: pos(spot) }} title="price now" />}
      </div>
    </div>
  );
}

export interface PayLeg { type: 'CE' | 'PE'; side: 'BUY' | 'SELL'; strike: number; premium: number | null }

const legPnl = (l: PayLeg, s: number): number => {
  const intrinsic = l.type === 'CE' ? Math.max(s - l.strike, 0) : Math.max(l.strike - s, 0);
  const p = l.premium ?? 0;
  return l.side === 'BUY' ? intrinsic - p : p - intrinsic;
};

/** The profit or loss at expiry across a range of prices, per lot: green above the zero line, red below, with the price now and the break-evens marked. */
export function PayoffChart({ legs, spot, lot, breakevens, fmt }: { legs: PayLeg[]; spot: number; lot: number; breakevens: number[]; fmt: (n: number) => string }) {
  const W = 320;
  const H = 150;
  const ks = legs.map((l) => l.strike);
  const lo = Math.min(spot, ...ks) * 0.97;
  const hi = Math.max(spot, ...ks) * 1.03;
  const N = 80;
  const xs = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N);
  const ys = xs.map((x) => legs.reduce((a, l) => a + legPnl(l, x), 0) * lot);
  const top = Math.max(...ys, 1);
  const bot = Math.min(...ys, -1);
  const X = (v: number): number => ((v - lo) / (hi - lo)) * W;
  const Y = (v: number): number => 8 + (1 - (v - bot) / (top - bot)) * (H - 22);
  const y0 = Y(0);
  const line = xs.map((x, i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(ys[i]!).toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${y0.toFixed(1)} L0 ${y0.toFixed(1)} Z`;
  const id = `pay${Math.round(spot)}`;
  return (
    <svg className="payoff" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Profit or loss at expiry">
      <defs>
        <clipPath id={`${id}u`}><rect x="0" y="0" width={W} height={y0} /></clipPath>
        <clipPath id={`${id}d`}><rect x="0" y={y0} width={W} height={H - y0} /></clipPath>
      </defs>
      <path d={area} fill="var(--up)" opacity="0.28" clipPath={`url(#${id}u)`} />
      <path d={area} fill="var(--dn)" opacity="0.28" clipPath={`url(#${id}d)`} />
      <line x1="0" x2={W} y1={y0} y2={y0} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3" />
      <path d={line} fill="none" stroke="var(--text)" strokeWidth="2" strokeLinejoin="round" />
      <line x1={X(spot)} x2={X(spot)} y1="4" y2={H - 14} stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 3" />
      <text x={X(spot)} y="10" textAnchor="middle" className="pay-t acc">now {fmt(spot)}</text>
      {breakevens.map((b) => <g key={b}><circle cx={X(b)} cy={y0} r="4" fill="var(--surface)" stroke="var(--text)" strokeWidth="1.8" /><text x={X(b)} y={H - 2} textAnchor="middle" className="pay-t">{`BE ${fmt(b)}`}</text></g>)}
      <text x="4" y={Y(top) + 10} className="pay-t up">+{Math.round(top).toLocaleString('en-IN')}</text>
      <text x="4" y={Y(bot) - 3} className="pay-t dn">{Math.round(bot).toLocaleString('en-IN')}</text>
    </svg>
  );
}
