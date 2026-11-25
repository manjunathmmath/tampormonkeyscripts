import { IndexPanels } from './Dashboard';

const NAMES = ['NIFTY 50', 'NIFTY BANK', 'SENSEX'];

/** The full read of one index: decision, levels, signals and the consensus behind it. The Dashboard only summarises these; this is where the detail lives. */
export function Instrument({ name, go }: { name: string | null; go: (p: string) => void }) {
  const n = name && NAMES.includes(name) ? name : 'NIFTY 50';
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{n}</h1>
          <p className="sub">Everything the app reads about this index, grouped by what you do with it</p>
        </div>
      </header>
      <div className="chips" role="tablist" aria-label="Index">
        {NAMES.map((x) => (
          <button key={x} role="tab" aria-selected={n === x} className={`chip ${n === x ? 'on' : ''}`} onClick={() => go(`instrument/${encodeURIComponent(x)}`)}>{x}</button>
        ))}
      </div>
      <IndexPanels key={n} name={n} />
    </div>
  );
}
