/** Semicircle score gauge from -max (left) to +max (right). Bands follow the old dashboard: red below -8, then amber and yellow-green towards green from +8. */
export function Gauge({ value, max = 40, label }: { value: number; max?: number; label?: string }) {
  const R = 78;
  const cx = 100;
  const cy = 96;
  const theta = (v: number): number => Math.PI + Math.PI * ((Math.max(-max, Math.min(max, v)) + max) / (2 * max));
  const at = (v: number, r: number): string => `${(cx + r * Math.cos(theta(v))).toFixed(1)} ${(cy + r * Math.sin(theta(v))).toFixed(1)}`;
  const arc = (v1: number, v2: number): string => `M${at(v1, R)} A${R} ${R} 0 0 1 ${at(v2, R)}`;
  const bands: [number, number, string][] = [
    [-max, -8, 'var(--dn)'], [-8, -4, '#d98a3a'], [-4, 0, 'var(--warn)'], [0, 4, '#c9b13a'], [4, 8, '#7fc15a'], [8, max, 'var(--up)'],
  ];
  return (
    <svg className="gauge-svg" viewBox="0 0 200 118" role="img" aria-label={`Score ${value}${label ? `, ${label}` : ''}`}>
      {bands.map(([v1, v2, c]) => <path key={v1} d={arc(v1, v2)} stroke={c} strokeWidth="13" fill="none" opacity="0.88" />)}
      <line x1={cx} y1={cy} x2={at(value, R - 16).split(' ')[0]} y2={at(value, R - 16).split(' ')[1]} stroke="var(--text)" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="6" fill="var(--text)" />
      <text x="12" y="112" className="g-end">-{max}</text>
      <text x={cx} y="112" textAnchor="middle" className="g-end">0</text>
      <text x="188" y="112" textAnchor="end" className="g-end">+{max}</text>
    </svg>
  );
}
