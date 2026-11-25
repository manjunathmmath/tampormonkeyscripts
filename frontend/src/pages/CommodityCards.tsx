import { nf, signed, tone } from '../lib/format';
import { Card, Loading, q, useLive } from './DashboardPanels';

const callTone = (c: string): string => (c.includes('LONG') || c.includes('BUY') ? 'up' : c.includes('SHORT') || c.includes('SELL') ? 'dn' : 'flat');

interface CmdLevels {
  ltp: number;
  open: number;
  prevClose: number;
  zone: string;
  symbol: string;
  expiry: string;
  vol: { key: string; value: number | null; source: string; asOf: string | null };
  strikeMap: { bstrikeOne: number; bstrikeTwo: number; ustrikeOne: number; ustrikeTwo: number; vixDDUpper: number; vixDDLower: number };
  trend: { change: string; trends: string[] };
}

/** A commodity's day: price, the 9:15 levels, the expected range from its CBOE volatility index. */
export function CommodityLevelsCard({ name }: { name: string }) {
  const { data: c, err, at, changedAt } = useLive<CmdLevels>(`/commodity?${q(name)}`);
  const rows: [string, number, string][] = c
    ? [
        ['VIXU (expected range, upper)', c.strikeMap.vixDDUpper, 'dn'],
        ['AST', c.strikeMap.ustrikeTwo, 'up'],
        ['ASO', c.strikeMap.ustrikeOne, 'up'],
        ['Open', c.open, 'flat'],
        ['BSO', c.strikeMap.bstrikeOne, 'dn'],
        ['BST', c.strikeMap.bstrikeTwo, 'dn'],
        ['VIXL (expected range, lower)', c.strikeMap.vixDDLower, 'up'],
      ]
    : [];
  return (
    <Card at={at} changedAt={changedAt} title="Day levels and volatility" sub={c ? `${c.symbol} · 9:15 zone ${c.zone}` : undefined}>
      {!c ? (
        <Loading what="the commodity" err={err} />
      ) : (
        <>
          <div className="sum">
            <span className="sum-px num">{nf(c.ltp)}</span>
            <span className={`sum-chg ${tone(parseFloat(c.trend.change))}`}>{signed(parseFloat(c.trend.change), 2)}%</span>
          </div>
          <ul className="srlist">
            {rows
              .sort((a, b) => b[1] - a[1])
              .map(([l, v, t]) => (
                <li key={l} className={t}>
                  <b>{l}</b>
                  <span className="num">{nf(v)}</span>
                </li>
              ))}
          </ul>
          <p className="small-note">
            Expected range uses {c.vol.key === 'FIXED' ? 'a fixed 4.85% (USD/INR)' : `${c.vol.key} ${c.vol.value?.toFixed(2) ?? '—'} (${c.vol.source}${c.vol.asOf ? `, close of ${c.vol.asOf}` : ''})`}. Previous close {nf(c.prevClose)}. Price flags: {c.trend.trends.join(' ') || 'none'}.
          </p>
        </>
      )}
    </Card>
  );
}

interface CmdVerdict {
  label: string;
  lines: { ok: boolean | null; text: string }[];
  trade: { dir: string; entry: number; stop: string; target: string } | null;
  volWarn?: { text: string };
}

/** The wall verdict of a commodity: LONG or SHORT only when a wall at price, the futures and the OI/OBV flow all agree. */
export function CommodityVerdictCard({ name }: { name: string }) {
  const { data: v, err, at, changedAt } = useLive<CmdVerdict>(`/verdict?${q(name)}`);
  return (
    <Card at={at} changedAt={changedAt} title="Verdict" sub={v?.label}>
      {!v ? (
        <Loading what="the verdict" err={err} />
      ) : (
        <>
          <div className="sum">
            <span className={`call big ${callTone(v.label)}`}>{v.label}</span>
          </div>
          {v.volWarn && <p className="small-note warn-note">{v.volWarn.text}</p>}
          <ul className="srlist">
            {v.lines.map((l, i) => (
              <li key={i} className={l.ok === true ? 'up' : l.ok === false ? 'dn' : 'flat'}>
                <span>
                  {l.ok === true ? '✓ ' : l.ok === false ? '✗ ' : '• '}
                  {l.text}
                </span>
              </li>
            ))}
          </ul>
          {v.trade && (
            <p>
              <b>Trade:</b> {v.trade.dir} at {nf(v.trade.entry)}, stop {v.trade.stop}, target {v.trade.target}
            </p>
          )}
          <p className="small-note">Actionable only when a wall is at price and the futures and OI/OBV agree; everything else reads WAIT. A rule-based read, not back-tested.</p>
        </>
      )}
    </Card>
  );
}

interface CmdGlobal {
  unavailable?: string;
  signal?: string;
  fairValue?: number;
  gap?: number | null;
  reasons?: string[];
  wti?: { cur: number; prev: number } | null;
  usdInr?: number | null;
  mcxLtp?: number;
}

/** Crude only: WTI x USD/INR fair value against the MCX price and the signal built from it. */
export function CommodityGlobalCard({ name }: { name: string }) {
  const { data: g, err, at, changedAt } = useLive<CmdGlobal>(`/commodity/global?${q(name)}`);
  if (g?.unavailable) return null;
  return (
    <Card at={at} changedAt={changedAt} title="Global context (crude)" sub={g?.signal}>
      {!g ? (
        <Loading what="the global context" err={err} />
      ) : (
        <>
          <ul className="srlist">
            <li>
              <b>WTI now / previous</b>
              <span className="num">{g.wti ? `${g.wti.cur.toFixed(2)} / ${g.wti.prev.toFixed(2)}` : '—'}</span>
            </li>
            <li>
              <b>USD / INR</b>
              <span className="num">{g.usdInr?.toFixed(2) ?? '—'}</span>
            </li>
            <li>
              <b>Fair value (WTI × USD/INR)</b>
              <span className="num">{g.fairValue ? nf(g.fairValue) : '—'}</span>
            </li>
            <li>
              <b>MCX price</b>
              <span className="num">
                {g.mcxLtp ? nf(g.mcxLtp) : '—'}
                {g.gap != null ? ` (${signed(g.gap, 1)}%)` : ''}
              </span>
            </li>
          </ul>
          {(g.reasons ?? []).map((r, i) => (
            <p key={i} className="small-note">
              {r}
            </p>
          ))}
          <p className="small-note">A gap of a few percent is normal (import duty and costs are not in the formula). Reasoned signal, not back-tested.</p>
        </>
      )}
    </Card>
  );
}
