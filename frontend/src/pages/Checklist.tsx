import { api, quotes, type ScanState } from '../api';
import { useState } from 'react';
import { asOfQuery, nf, signed, tradingDayNow } from '../lib/format';
import { useOnDemand } from '../lib/refresh';
import { Card, Loading, useLive } from './DashboardPanels';

type Dot = 'good' | 'warn' | 'bad' | 'none';
interface Ov {
  market: { score: number; signal: string; reason: string; adCounts: Record<'all' | 'nifty' | 'bank', { net: number }> };
  scoreboard: { groups: { key: string; label: string; sum: number; cap: number }[]; total: number; confidence: number };
  strip: { name: string; dir: number; remark: string | null }[];
}

const tone = (d: number, good = 0): Dot => (d > good ? 'good' : d < -good ? 'bad' : 'warn');
const ACTION = (sig: string): string =>
  /STRONG BUY/.test(sig) ? 'Buy calls on dips to the 9:15 buy levels; the market leans clearly up.' : /BUY/.test(sig) ? 'Look to buy calls; wait for price at the buy level.' : /STRONG SELL/.test(sig) ? 'Buy puts on bounces to the 9:15 sell levels; the market leans clearly down.' : /SELL/.test(sig) ? 'Look to buy puts; wait for price at the sell level.' : /NO TRADE/.test(sig) ? 'Stand aside: the market guard says the day range is used up.' : 'Wait. The signals do not agree enough for a directional trade.';

/** The seven questions asked before every trade, each answered from the numbers already on the dashboard. A guide, not a rule. */
export function Checklist({ embedded = false }: { embedded?: boolean }) {
  const day = tradingDayNow();
  const { data: o, err } = useLive<Ov>(`/overview?day=${day}${asOfQuery()}`, 300000);
  const [vix, setVix] = useState<number | null>(null);
  const [scan, setScan] = useState<ScanState | null>(null);
  useOnDemand(async () => {
    setScan(await api<ScanState>(`/scan915?day=${day}${asOfQuery()}`).catch(() => null));
    try {
      setVix((await quotes(['NSE:INDIA VIX']))['NSE:INDIA VIX']?.last_price ?? null);
    } catch {
      /* no VIX */
    }
  }, [day]);
  const grp = (k: string): { sum: number } | undefined => o?.scoreboard.groups.find((g) => g.key === k);
  const zone = (n: string): string | null => scan?.items[n]?.zone ?? null;
  const zd = (z: string | null): Dot => (z === 'AST' || z === 'ASO' ? 'good' : z === 'BST' || z === 'BSO' ? 'bad' : z ? 'warn' : 'none');
  const steps: { n: number; title: string; dot: Dot; line: string; detail?: string }[] = o
    ? [
        { n: 1, title: 'VIX regime', dot: vix == null ? 'none' : vix > 25 ? 'bad' : vix > 18 ? 'warn' : 'good', line: vix == null ? 'India VIX not available' : `${vix.toFixed(1)}: ${vix < 13 ? 'LOW' : vix <= 18 ? 'NORMAL' : vix <= 25 ? 'ELEVATED' : 'HIGH'}`, detail: 'Below 13 low, 13 to 18 normal, 18 to 25 elevated (widen the stop, cut size), above 25 high.' },
        { n: 2, title: '9:15 opening candle', dot: zd(zone('NIFTY 50')), line: ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'GIFT NIFTY'].map((n) => `${n.replace('NIFTY ', 'N ')} ${zone(n) ?? '—'}`).join(' · '), detail: 'Where each index closed its first 5-minute candle against its strike levels.' },
        { n: 3, title: 'Advance / decline', dot: tone(o.market.adCounts.all.net, 2), line: `All F&O ${signed(o.market.adCounts.all.net, 0)} · NIFTY 50 ${signed(o.market.adCounts.nifty.net, 0)} · BANK ${signed(o.market.adCounts.bank.net, 0)}`, detail: 'Advances minus declines, with each stock measured against its own ASO and BSO.' },
        { n: 4, title: 'Futures trend', dot: tone(grp('fut')?.sum ?? 0), line: o.strip.slice(0, 2).map((s) => `${s.name} ${(s.remark ?? '—').replace(/_/g, ' ').toLowerCase()}`).join(' · '), detail: 'The futures remark of the two index futures and the stock futures.' },
        { n: 5, title: 'OI / OBV', dot: tone(grp('oiObv')?.sum ?? 0, 1), line: `${signed(grp('oiObv')?.sum ?? 0, 1)} across five instruments`, detail: 'Option open interest and volume flow: puts being written is supportive, calls being written is resistance.' },
        { n: 6, title: 'Component weights', dot: tone(grp('comp')?.sum ?? 0, 1), line: `${signed(grp('comp')?.sum ?? 0, 1)} (the heaviest stocks of NIFTY 50 and BANK NIFTY)`, detail: 'Do the stocks that carry the indices agree with them?' },
        { n: 7, title: 'Composite score', dot: o.market.score >= 4 ? 'good' : o.market.score <= -4 ? 'bad' : 'warn', line: `${signed(o.market.score, 2)} · confidence ${o.scoreboard.confidence}%`, detail: 'The sum of all signals; 4 or more leans up, -4 or less leans down.' },
      ]
    : [];
  const greens = steps.filter((s) => s.dot === 'good').length;
  return (
    <div className={embedded ? 'checklist-embedded' : 'page'}>
      {!embedded && (
        <header className="page-head">
          <div>
            <h1>Checklist</h1>
            <p className="sub">Seven questions before a trade, answered from today's numbers</p>
          </div>
        </header>
      )}
      {!o ? (
        <Loading what="the market" err={err} />
      ) : (
        <>
          <section className={`focus-hero ${/BUY/.test(o.market.signal) ? 'good' : /SELL/.test(o.market.signal) ? 'bad' : 'warn'}`}>
            <span className="fh-name">Recommendation</span>
            <span className="fh-word">{o.market.signal}</span>
            <p className="fh-line">{ACTION(o.market.signal)}</p>
            <p className="small-note">{o.market.reason}</p>
            <div className="fh-gates"><span className="fh-pill"><span className="gdot good" />{greens} of {steps.length} green</span></div>
          </section>
          <Card title="The seven steps">
            <ul className="gates">
              {steps.map((s) => (
                <li key={s.n} className={`gate ${s.dot}`}>
                  <div className="gate-head static">
                    <span className={`gdot ${s.dot}`} aria-label={s.dot} />
                    <b>{s.n}. {s.title}</b>
                    <span className="gate-line">{s.line}{s.n === 1 && vix != null ? '' : ''}</span>
                  </div>
                  {s.detail && <p className="small-note ck-detail">{s.detail}</p>}
                </li>
              ))}
            </ul>
            <p className="small-note">Green means the step supports a trade, amber is mixed or unknown, red is against. Heuristic; it is not a back-tested rule and never places an order. India VIX {vix != null ? nf(vix) : '—'}.</p>
          </Card>
        </>
      )}
    </div>
  );
}
