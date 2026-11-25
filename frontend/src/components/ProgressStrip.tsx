import { useRef, useState } from 'react';
import { api } from '../api';
import { usePoll } from '../lib/hooks';

interface Task {
  key: string;
  label: string;
  phase: string;
  done: number;
  total: number;
  finishedAt: number | null;
  error: string | null;
  elapsedSec: number;
}

/** What the backend is doing right now (the first whole-market read of a day, the constituents' option chains): phase, names done of total, seconds. */
export function ProgressStrip() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const busy = useRef(false);
  // quick while something runs, relaxed when idle; a Refresh press (or a load) shows up within a few seconds
  usePoll(async () => {
    try {
      const t = (await api<{ tasks: Task[] }>('/progress')).tasks;
      busy.current = t.length > 0;
      setTasks(t);
    } catch {
      setTasks([]);
    }
  }, 2500);
  // floating, so it never moves the page: only work in progress (and failures) show; a finished read is not announced
  const shown = tasks.filter((t) => t.finishedAt === null || t.error);
  if (!shown.length) return null;
  const main = shown.find((t) => t.finishedAt === null);
  const mainPct = main && main.total > 0 ? Math.min(100, Math.round((main.done / main.total) * 100)) : null;
  return (
    <>
      {main && <div className="progress-top" aria-hidden="true">{mainPct === null ? <i className="indeterminate" /> : <i style={{ width: `${mainPct}%` }} />}</div>}
      <div className="progress-strip" role="status" aria-live="polite">
        {shown.map((t) => {
          const pct = t.total > 0 ? Math.min(100, Math.round((t.done / t.total) * 100)) : null;
          return (
            <div key={t.key} className={`progress-task ${t.error ? 'err' : ''}`} title={`${t.label}: ${t.phase}`}>
              <div className="progress-line">
                <b>{t.label}</b>
                <span>{t.error ? `failed: ${t.error}` : `${t.total > 0 ? `${t.done} of ${t.total} · ` : ''}${t.elapsedSec}s`}</span>
              </div>
              {!t.error && <div className="progress-bar">{pct === null ? <i className="indeterminate" /> : <i style={{ width: `${pct}%` }} />}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
