import { useState } from 'react';
import { api } from '../api';
import { Icon } from './Icon';
import { Info } from './Info';

const KINDS: [string, string, string][] = [
  ['morning', 'Morning brief', 'about 08:45: whether the markets trade today, GIFT NIFTY, India VIX, expiries, the day\'s events and HIGH impact headlines'],
  ['open', 'NSE open snapshot', 'about 09:20: open prices, 9:15 zones and levels, breadth, the market score and the plans'],
  ['close', 'NSE close summary', 'about 15:35: index changes, the score, how the plans did and the heavyweights that moved'],
  ['mcxopen', 'MCX open', 'when commodities start trading: open prices, zones, levels and plans'],
  ['mcxclose', 'MCX close', 'late evening: where each commodity ended'],
];

/** The Telegram updates: what each one is, and buttons to preview it here or send it now. Each can be switched off in Settings. */
export function TelegramUpdates() {
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<{ kind: string; text: string; note: string } | null>(null);
  const run = (kind: string, preview: boolean): void => {
    setBusy(kind + (preview ? 'p' : 's'));
    api<{ text: string; sent: boolean; why?: string }>('/digest/send', { method: 'POST', body: { kind, preview } })
      .then((r) => setOut({ kind, text: r.text, note: preview ? 'Preview (not sent)' : r.sent ? 'Sent to Telegram' : `Not sent: ${r.why ?? 'unknown reason'}` }))
      .catch((e: Error) => setOut({ kind, text: '', note: e.message }))
      .finally(() => setBusy(null));
  };
  return (
    <section className="card">
      <div className="card-head"><h2>Telegram updates</h2><Info text="Updates are sent once a day each, when the market has actually opened (decided by the data, so holidays are covered). Switch each one on or off in Settings, under API & authentication. They need the Telegram bot token, chat id and the alerts switch." /></div>
      <ul className="tg-list">
        {KINDS.map(([k, label, what]) => (
          <li key={k}>
            <div><b>{label}</b><span className="muted small-note">{what}</span></div>
            <button className="ibtn" aria-label={`Preview ${label}`} title="Preview here" disabled={busy !== null} onClick={() => run(k, true)}><Icon name="eye" size={18} /></button>
            <button className="ibtn" aria-label={`Send ${label} now`} title="Send to Telegram now" disabled={busy !== null} onClick={() => run(k, false)}><Icon name="bell" size={18} /></button>
          </li>
        ))}
      </ul>
      {busy && <p className="muted small-note">Building the message…</p>}
      {out && (
        <div className="tg-out">
          <p className="small-note"><b>{KINDS.find((x) => x[0] === out.kind)?.[1]}</b> · {out.note}</p>
          {out.text && <pre>{out.text}</pre>}
        </div>
      )}
    </section>
  );
}
