import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/** One short explanation per section, found by the section's own title (case and punctuation ignored). */
const INFO: Record<string, string> = {
  'range scoreboard': 'Adds up every score group (9:15, advance/decline, futures, OI/OBV, max pain, IV skew, components). The verdict follows the total; confidence counts each group only up to its own scale. A one-sided warning means one group is most of the score.',
  '9:15 breakout': 'Where each name\'s first 5-minute candle closed against its own levels: AST and ASO above the open, BSO and BST below, B/W in between. Click a name to open it.',
  '9:15 board': 'Every name grouped by where its first candle closed. Click one to load it into the selected chart.',
  'market score': 'The composite of all signal groups. Above +8 strong buy, +4 buy, below −4 sell, below −8 strong sell, in between wait.',
  'score': 'The composite of all signal groups for the market. Leading signals are the 9:15 close, breadth and futures; lagging are OI/OBV, max pain and IV skew.',
  'probable trade': 'A plan from today\'s numbers: direction from the consensus, entry at the nearest strong support or resistance zone, stop just beyond it, targets at the next zones. Not an order.',
  'probable trade from today\'s metrics': 'A plan from today\'s numbers: direction from the consensus, entry at the nearest strong support or resistance zone, stop just beyond it, targets at the next zones. Not an order.',
  'oi / obv by strike': 'Today\'s change in open interest (top) and volume flow (bottom) for each strike. Calls red, puts green; solid = built up, faded = reduced; the shaded strike is at the money.',
  'tracking': 'Stocks you track. An alert fires when price is within 0.6% of an OI wall, and again within 0.15%.',
  'backend': 'The server this screen talks to and how long it has been running.',
  'kite': 'Kite login state. The access token expires every day; log in again each morning.',
  'live feed': 'The Kite ticker connection that streams prices. If it is down, prices refresh on Refresh instead.',
  'instruments': 'The list of tradable contracts loaded from Kite. Needed for strikes, futures and tokens.',
  '9:15 scan': 'The first-candle classification of every F&O stock for the day shown.',
  'trading dates and holidays': 'The day on screen, the day before it, and the NSE holidays. A blank date means the latest trading day.',
  'recent activity': 'The latest requests the server handled, newest first.',
  'nifty 50 and bank nifty constituents': 'Index weights from NSE. They decide which stocks make up the "top 10" groups and how much each moves the index.',
  'india 10-year government bond yield': 'Pasted by hand because there is no free feed. The Macro view uses it as one driver.',
  'strong support and resistance': 'Levels from several sources (OI walls, max pain, 9:15 levels, value area, day and previous-day high/low) merged when close together. More agreeing sources = a stronger zone.',
  'signal agreement': 'How many independent checks back the suggested view, and whether now is a good moment to enter.',
  'level probability': 'Live-signal estimate of reaching each level today. A ranking of likelihood, not a measured probability.',
  'futures': 'Price against VWAP and open interest, read as a word such as short covering or long unwinding.',
  'fear and greed': 'A mood gauge built from the market\'s own breadth and volatility. Context only.',
  'macro': 'Global drivers (oil, dollar, yields, rupee). Each scores −1 to +1; the total is the backdrop for India.',
};

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9/:' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** A small "i" that opens a one-paragraph explanation. Give it the section title, or your own text. Shows nothing when there is no entry. */
export function Info({ k, text }: { k?: string; text?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const body = text ?? (k ? INFO[norm(k)] : undefined);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  if (!body) return null;
  return (
    <span className="info" ref={box}>
      <button type="button" className="info-btn" aria-label="What is this?" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        <Icon name="info" size={15} />
      </button>
      {open && <span className="info-pop" role="note">{body}</span>}
    </span>
  );
}
