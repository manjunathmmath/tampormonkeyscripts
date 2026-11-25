import { useEffect, useState } from 'react';

const hms = (ms: number): string => new Date(ms + 19800000).toISOString().slice(11, 19);

/** When a card's data was last fetched and when it last actually changed. Flashes when a fetch brought new numbers. */
export function Stamp({ at, changedAt }: { at?: number; changedAt?: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!changedAt || Date.now() - changedAt > 3000) return;
    const t = window.setTimeout(() => tick((n) => n + 1), 3200);
    return () => window.clearTimeout(t);
  }, [changedAt, at]);
  if (!at) return null;
  const fresh = !!changedAt && Date.now() - changedAt < 3000;
  const age = Math.round((Date.now() - at) / 1000);
  return (
    <span className={`stamp${fresh ? ' flash' : ''}`} title={`Fetched ${hms(at)}${changedAt ? ` · the numbers last changed at ${hms(changedAt)}` : ''}`}>
      <i aria-hidden="true" />{hms(at).slice(0, 8)}
      {changedAt && changedAt !== at && <small>changed {hms(changedAt).slice(0, 5)}</small>}
      {age > 300 && <small className="old">{Math.round(age / 60)} min old</small>}
    </span>
  );
}
