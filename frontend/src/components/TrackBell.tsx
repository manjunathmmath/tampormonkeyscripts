import { useEffect, useState } from 'react';
import { api } from '../api';

let cache: string[] | null = null;
const subs = new Set<(n: string[]) => void>();
const publish = (n: string[]): void => {
  cache = n;
  subs.forEach((f) => f(n));
};

/** the names being tracked (alerts near their OI walls), shared by every bell on the page */
export function useTracked(): { names: string[]; toggle: (n: string) => Promise<void> } {
  const [names, setNames] = useState<string[]>(cache ?? []);
  useEffect(() => {
    subs.add(setNames);
    if (!cache) api<{ names: string[] }>('/tracking').then((r) => publish(r.names)).catch(() => undefined);
    return () => void subs.delete(setNames);
  }, []);
  const toggle = async (n: string): Promise<void> => {
    const on = (cache ?? []).includes(n);
    const r = await api<{ names: string[] }>('/tracking', { method: 'POST', body: { name: n, remove: on } });
    publish(r.names);
  };
  return { names, toggle };
}

/** A bell that starts or stops tracking a stock: alerts when its price nears an OI support or resistance wall. */
export function TrackBell({ name, label = false }: { name: string; label?: boolean }) {
  const { names, toggle } = useTracked();
  const on = names.includes(name.toUpperCase());
  return (
    <button
      type="button"
      className={`icon-btn track-bell${on ? ' on' : ''}`}
      aria-pressed={on}
      title={on ? `Stop tracking ${name}` : `Alert me when ${name} nears its OI support or resistance`}
      onClick={(e) => { e.stopPropagation(); void toggle(name.toUpperCase()).catch(() => undefined); }}
    >
      {on ? '🔔' : '🔕'}{label ? (on ? ' Tracking' : ' Track') : ''}
    </button>
  );
}
