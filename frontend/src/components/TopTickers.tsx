import { useState } from 'react';
import { api } from '../api';
import { quotes, type Quote } from '../api';
import { usePoll } from '../lib/hooks';
import { anyMarketOpen, nf, signed, tone } from '../lib/format';

const SYMS = [
  { sym: 'NSE:NIFTY 50', label: 'NIFTY' },
  { sym: 'NSE:NIFTY BANK', label: 'BANK' },
  { sym: 'BSE:SENSEX', label: 'SENSEX' },
  { sym: '291849', label: 'GIFT' },
  { sym: 'NSE:INDIA VIX', label: 'VIX' },
];

/** Live index prices and the VIX in the top bar, polled every few seconds while the market is open. */
interface Acct { equity: number | null; commodity: number | null; dayPnl: number | null; open: number }

/** Funds and the day's P&L from Kite, as the old top bar showed. */
function FundsChip() {
  const [a, setA] = useState<Acct | null>(null);
  usePoll(async () => {
    try {
      setA(await api<Acct>('/account'));
    } catch {
      /* the last figures stay */
    }
  }, 60000);
  if (!a) return null;
  const r = (n: number): string => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;
  return (
    <span className="tk funds" title="Available balance and the day's P&L, from Kite">
      <span className="tk-l">FUNDS</span><b className="num">{a.equity != null ? r(a.equity) : '—'}</b>
      <span className="tk-l">P&amp;L</span><em className={`num ${a.dayPnl == null ? '' : tone(a.dayPnl)}`}>{a.dayPnl == null ? '—' : `${a.dayPnl < 0 ? '−' : a.dayPnl > 0 ? '+' : ''}${r(a.dayPnl)}`}</em>
    </span>
  );
}

export function TopTickers() {
  const [q, setQ] = useState<Record<string, Quote>>({});
  const open = anyMarketOpen();
  usePoll(async () => {
    try {
      setQ(await quotes(SYMS.map((s) => s.sym)));
    } catch {
      /* the last prices stay */
    }
  }, open ? 5000 : 60000);
  return (
    <div className="tickers" aria-label="Index prices">
      {SYMS.map((s) => {
        const x = q[s.sym];
        const chg = x && x.ohlc.close ? ((x.last_price - x.ohlc.close) / x.ohlc.close) * 100 : null;
        return (
          <a key={s.sym} className="tk" href={s.label === 'VIX' || s.label === 'GIFT' ? '#/dashboard' : `#/chart/${encodeURIComponent(s.sym.split(':')[1]!)}`}>
            <span className="tk-l">{s.label}</span>
            <b className="num">{x ? nf(x.last_price) : '—'}</b>
            {chg != null && <em className={`num ${tone(s.label === 'VIX' ? -chg : chg)}`}>{signed(chg)}%</em>}
          </a>
        );
      })}
      <FundsChip />
    </div>
  );
}
