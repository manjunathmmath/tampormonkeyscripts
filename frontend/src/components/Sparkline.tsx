import { useId } from 'react';

/** Small area line chart for a list of numbers. `tone` picks the up / down colour. */
export function Sparkline({ values, tone, height = 44, base }: { values: number[]; tone: 'up' | 'dn' | 'flat'; height?: number; base?: number }) {
  const id = useId();
  if (values.length < 2) return <div className="spark-empty" style={{ height }} />;
  const w = 140;
  const lo = Math.min(...values, base ?? Infinity);
  const hi = Math.max(...values, base ?? -Infinity);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => height - 3 - ((v - lo) / span) * (height - 6);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${w} ${height} L0 ${height} Z`;
  return (
    <svg className={`spark ${tone}`} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" height={height} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {base != null && <line x1="0" x2={w} y1={y(base)} y2={y(base)} className="spark-base" />}
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
