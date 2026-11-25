import { useSyncExternalStore } from 'react';

let n = 0;
const subs = new Set<() => void>();
const emit = (): void => subs.forEach((f) => f());

/** how many card requests are in flight right now: the Refresh button keeps spinning until they have all come back */
export const inflightBegin = (): void => { n++; emit(); };
export const inflightEnd = (): void => { n = Math.max(0, n - 1); emit(); };
export const useInflight = (): number => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => n);
