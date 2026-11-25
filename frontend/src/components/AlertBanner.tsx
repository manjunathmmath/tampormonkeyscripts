import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { Icon } from './Icon';

interface Alert {
  id: number;
  at: number;
  name: string;
  kind: 'SHORT_COVERING' | 'LONG_UNWINDING' | 'ENTRY_ZONE' | 'LEVEL_NEAR' | 'LEVEL_AT' | 'NEWS' | 'EVENT' | 'SYSTEM';
  title: string;
  text: string;
  clearedAt: number | null;
}

/** three short beeps; browsers only allow sound after the first click on the page, so a failure is ignored */
function beep(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.28);
      o.stop(ctx.currentTime + i * 0.28 + 0.16);
    }
    window.setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* no sound */
  }
}

/** Alerts collapse into a bell button with a count (top bar), so they never cover the screen; the list opens on demand and each stays until dismissed (short covering: exit shorts and puts; long unwinding: exit longs and calls). It only tells you; nothing is traded. */
export function AlertBanner() {
  const [shown, setShown] = useState<Alert[]>([]);
  const last = useRef(0);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);
  useEffect(() => {
    let live = true;
    const poll = (): void => {
      api<{ alerts: Alert[] }>(`/alerts?since=${last.current}`)
        .then((r) => {
          if (!live || r.alerts.length === 0) return;
          const first = last.current === 0;
          last.current = Math.max(...r.alerts.map((a) => a.id));
          // on the first read only alerts that are still on and under 30 minutes old are worth a banner
          const fresh = first ? r.alerts.filter((a) => !a.clearedAt && Date.now() - a.at < 30 * 60000) : r.alerts;
          if (fresh.length) {
            setShown((s) => [...s, ...fresh]);
            setUnread(true);
            beep();
          }
        })
        .catch(() => undefined);
    };
    poll();
    const t = window.setInterval(poll, 30000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, []);
  if (shown.length === 0) return null;
  // the colour follows the most urgent alert held: an exit alert is red, an unwinding one amber
  const tone = shown.some((a) => a.kind === 'SHORT_COVERING' || a.kind === 'SYSTEM') ? 'sc' : shown.some((a) => a.kind === 'LONG_UNWINDING') ? 'lu' : 'ez';
  const latest = shown[shown.length - 1]!;
  const button = (extra: string) => (
    <button type="button" className={`alert-btn ${tone}${unread && !open ? ' unread' : ''}${extra}`} onClick={() => { setOpen(!open); setUnread(false); }} aria-expanded={open} aria-label={`${shown.length} alert${shown.length === 1 ? '' : 's'}. Latest: ${latest.title}`} title={latest.title}>
      <Icon name="bell" size={16} />
      <b>{shown.length}</b>
    </button>
  );
  return (
    <>
      {button('')}
      {createPortal(
        <>
          {/* full screen hides the top bar, so the button floats there instead */}
          {button(' floating')}
          <span className="sr-live" role="status">{latest.title}</span>
          {open && (
            <>
              <div className="alert-shade" onClick={() => setOpen(false)} aria-hidden="true" />
              <div className="alert-stack" role="dialog" aria-label="Alerts">
                <div className="alert-top">
                  <b>Alerts ({shown.length})</b>
                  <button type="button" className="chip" onClick={() => { setShown([]); setOpen(false); }}>Dismiss all</button>
                </div>
                {[...shown].reverse().map((a) => (
                  <div key={a.id} className={`alert-card ${a.kind === 'SHORT_COVERING' || a.kind === 'SYSTEM' ? 'sc' : a.kind === 'ENTRY_ZONE' || a.kind === 'LEVEL_NEAR' ? 'ez' : a.kind === 'LEVEL_AT' ? 'lv' : a.kind === 'NEWS' || a.kind === 'EVENT' ? 'ez' : 'lu'}`}>
                    <div>
                      <b>{a.title}</b>
                      <p>{a.text}</p>
                      <small>{new Date(a.at).toLocaleTimeString('en-IN')}</small>
                    </div>
                    <button className="icon-btn" aria-label="Dismiss" onClick={() => setShown((s) => s.filter((x) => x.id !== a.id))}>×</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>,
        document.body,
      )}
    </>
  );
}
