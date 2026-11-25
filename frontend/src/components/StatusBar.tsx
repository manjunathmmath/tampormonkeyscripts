import { useEffect, useState } from 'react';
import { api, type SystemInfo } from '../api';
import { getSnapshot } from '../lib/format';
import { useRefresh } from '../lib/refresh';

const ist = (ms: number): string => new Date(ms + 19800000).toISOString().slice(11, 19);

/** The clock of the exchange (IST), shown in the top bar. */
export function ClockChip() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return <span className="clock-chip num" title="Indian time (IST)">{ist(now)}</span>;
}

/** A slim line at the bottom: the day on screen, the previous day, the next market holiday and when the data was last refreshed. */
export function StatusBar() {
  const [s, setS] = useState<SystemInfo['dates'] | null>(null);
  const { lastAt } = useRefresh();
  useEffect(() => {
    let live = true;
    const load = (): void => void api<SystemInfo>('/system').then((r) => live && setS(r.dates ?? null)).catch(() => undefined);
    load();
    const t = window.setInterval(load, 60000);
    return () => { live = false; window.clearInterval(t); };
  }, []);
  if (!s) return null;
  const next = s.holidays.find((h) => h.date >= s.today);
  const snap = getSnapshot();
  const last = lastAt ?? s.lastRefreshAt;
  return (
    <footer className="statusbar" aria-label="Status">
      <span title="The day the screens show">Today <b className="num">{s.nseDay ?? s.today}</b></span>
      <span title="The previous trading day">Prev <b className="num">{s.nsePrev ?? '—'}</b></span>
      {next && <span className="sb-hol" title="Next NSE trading holiday">Next holiday <b className="num">{next.date}</b> {next.desc}</span>}
      <span>{snap ? <>Snapshot <b className="num">{snap}</b></> : 'Live'}</span>
      <span className="sb-last" title="The last refresh">{last ? `Refreshed ${ist(last)}` : 'Not refreshed yet'}</span>
    </footer>
  );
}
