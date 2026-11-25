import { api } from '../api';
import { useEffect, useState } from 'react';
import { asOfQuery, isNseHoliday, marketState, nseQuietNow, tradingDayNow } from '../lib/format';
import { useRefresh } from '../lib/refresh';

const win = (): string => {
  const d = new Date(Date.now() + 19800000);
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  const wk = d.getUTCDay();
  if (wk === 0 || wk === 6 || m < 555 || isNseHoliday(d.toISOString().slice(0, 10)) || nseQuietNow()) return 'CLOSED';
  if (m < 585) return 'AVOID';
  if (m < 690) return 'PRIME';
  if (m < 780) return 'OK';
  if (m < 840) return 'AVOID';
  if (m < 900) return 'OK';
  return m < 915 ? 'AVOID' : 'CLOSED';
};

/** The market signal and the trading window in the top bar, as on the old dashboard. */
export function TopSignal() {
  const { tick } = useRefresh();
  const [sig, setSig] = useState<string | null>(null);
  useEffect(() => {
    api<{ market: { signal: string } }>(`/overview?day=${tradingDayNow()}${asOfQuery()}`).then((o) => setSig(o.market.signal)).catch(() => undefined);
  }, [tick]);
  const w0 = win();
  const mcxOpen = marketState(Date.now(), true).open;
  const w = w0 === 'CLOSED' && mcxOpen ? 'MCX OPEN' : w0;
  const t = sig ? (/BUY/.test(sig) ? 'ok' : /SELL/.test(sig) ? 'bad' : 'warn') : '';
  return (
    <div className="top-signal">
      <span className={`pill ${w === 'PRIME' || w === 'OK' || w === 'MCX OPEN' ? 'ok' : w === 'AVOID' ? 'bad' : ''}`} title="Trading window (09:45 to 11:30 is the best; the first 30 minutes and lunch are avoided). After the NSE close it says MCX OPEN while commodities are still trading.">{w}</span>
      {sig && <span className={`pill ${t}`} title="Market signal from the composite score">{sig}</span>}
    </div>
  );
}
