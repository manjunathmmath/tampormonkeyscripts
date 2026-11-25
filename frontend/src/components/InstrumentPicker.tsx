import { useEffect, useMemo, useRef, useState } from 'react';

const RECENT_KEY = 'groot.recent';
const readRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};

/**
 * A searchable instrument picker: one button showing the current name; it opens a small panel with a search box, the names you used lately and the
 * matches (a bottom sheet on a phone). Replaces a native dropdown of several hundred names.
 */
export function InstrumentPicker({ value, options, onChange, quick = [] }: { value: string; options: string[]; onChange: (n: string) => void; quick?: string[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setHi(0);
    const t = window.setTimeout(() => input.current?.focus(), 30);
    const onDoc = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const needle = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return [];
    const starts = options.filter((n) => n.toLowerCase().startsWith(needle));
    const has = options.filter((n) => !n.toLowerCase().startsWith(needle) && n.toLowerCase().includes(needle));
    return [...starts, ...has].slice(0, 60);
  }, [needle, options]);
  const shortlist = useMemo(() => {
    const seen = new Set<string>();
    return [...quick, ...recent].filter((n) => options.includes(n) && !seen.has(n) && seen.add(n)).slice(0, 12);
  }, [quick, recent, options]);
  const list = needle ? matches : shortlist;

  const pick = (n: string): void => {
    const next = [n, ...recent.filter((x) => x !== n)].slice(0, 8);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* not remembered */
    }
    setOpen(false);
    if (n !== value) onChange(n);
  };

  return (
    <div className="ipick" ref={box}>
      <button type="button" className="ipick-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{value}</span>
        <i aria-hidden="true">▾</i>
      </button>
      {open && (
        <div className="ipick-pop" role="dialog" aria-label="Choose an instrument">
          <input
            ref={input}
            type="search"
            placeholder="Search a name, e.g. nifty, gold, infy"
            value={q}
            onChange={(e) => { setQ(e.target.value); setHi(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
              else if (e.key === 'Enter' && list[hi]) { e.preventDefault(); pick(list[hi]!); }
            }}
            aria-label="Search instruments"
          />
          {!needle && shortlist.length > 0 && <p className="ipick-h">Recent and common</p>}
          {needle && <p className="ipick-h">{matches.length ? `${matches.length}${matches.length === 60 ? '+' : ''} match${matches.length === 1 ? '' : 'es'}` : 'No match'}</p>}
          {!needle && !shortlist.length && <p className="ipick-h">Type to search {options.length} names</p>}
          <ul role="listbox">
            {list.map((n, i) => (
              <li key={n} role="option" aria-selected={n === value} className={`${i === hi ? 'hi' : ''}${n === value ? ' cur' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => pick(n)}>
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
