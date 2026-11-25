import { createHash } from 'node:crypto';

export interface LearnSource { id: string; name: string; url: string; topic: 'India' | 'Investing' | 'Trading & quant' }

/** Reading material for waiting time: public blogs and learning sites, read from their own RSS / Atom feeds. Not news, not scored, nothing here feeds a signal. */
export const LEARN_SOURCES: LearnSource[] = [
  { id: 'varsity', name: 'Zerodha Varsity', url: 'https://zerodha.com/varsity/feed/', topic: 'India' },
  { id: 'zconnect', name: 'Z-Connect', url: 'https://zerodha.com/z-connect/feed', topic: 'India' },
  { id: 'freefincal', name: 'Freefincal', url: 'https://freefincal.com/feed/', topic: 'India' },
  { id: 'capitalmind', name: 'Capitalmind', url: 'https://www.capitalmind.in/feed/', topic: 'India' },
  { id: 'damodaran', name: 'Aswath Damodaran', url: 'https://aswathdamodaran.blogspot.com/feeds/posts/default', topic: 'Investing' },
  { id: 'wealthcs', name: 'A Wealth of Common Sense', url: 'https://awealthofcommonsense.com/feed/', topic: 'Investing' },
  { id: 'ofdollars', name: 'Of Dollars And Data', url: 'https://ofdollarsanddata.com/feed/', topic: 'Investing' },
  { id: 'reformed', name: 'The Reformed Broker', url: 'https://thereformedbroker.com/feed/', topic: 'Investing' },
  { id: 'farnam', name: 'Farnam Street', url: 'https://fs.blog/feed/', topic: 'Investing' },
  { id: 'meb', name: 'Meb Faber', url: 'https://mebfaber.com/feed/', topic: 'Trading & quant' },
  { id: 'alpha', name: 'Alpha Architect', url: 'https://alphaarchitect.com/feed/', topic: 'Trading & quant' },
];

export interface LearnItem { id: string; source: string; sourceName: string; topic: string; title: string; link: string; ts: number; summary: string }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cdata = (s: string): string => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');

function tag(block: string, name: string): string {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? cdata(m[1]!).trim() : '';
}

/** Plain text of an HTML fragment. */
export function plain(html: string): string {
  return decode(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const OK = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'strong', 'b', 'em', 'i', 'code', 'pre', 'br', 'a']);
/** Keeps paragraphs, headings, lists, quotes, bold / italic / code and plain http links; everything else (images, scripts, styles, tables, attributes) is dropped and the text kept. */
export function cleanHtml(html: string): string {
  const src = html.replace(/<(script|style|iframe|noscript|svg|figure|form)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, '');
  let out = '';
  let last = 0;
  const re = /<(\/?)([a-z][a-z0-9]*)([^>]*)>/gi;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    out += esc(decode(src.slice(last, m.index)));
    last = m.index + m[0].length;
    const name = m[2]!.toLowerCase();
    if (!OK.has(name)) continue;
    if (m[1]) { out += `</${name}>`; continue; }
    if (name === 'br') { out += '<br>'; continue; }
    if (name === 'a') {
      const h = /href\s*=\s*["']([^"']+)["']/i.exec(m[3]!);
      const url = h ? decode(h[1]!) : '';
      out += /^https?:\/\//i.test(url) ? `<a href="${esc(url).replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">` : '<a>';
      continue;
    }
    out += `<${name}>`;
  }
  out += esc(decode(src.slice(last)));
  return out.replace(/<(p|li|h[1-4])>\s*<\/\1>/g, '').replace(/(<br>\s*){3,}/g, '<br><br>').trim();
}

const when = (s: string): number => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
};

/** RSS 2.0 and Atom, read by pattern (no XML library): the items with title, link, date, a short summary and the full cleaned text when the feed carries it. */
export function parseFeed(xml: string, src: LearnSource): { items: LearnItem[]; full: Map<string, string> } {
  const items: LearnItem[] = [];
  const full = new Map<string, string>();
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
  for (const b of blocks.slice(0, 30)) {
    const title = plain(tag(b, 'title'));
    let link = tag(b, 'link');
    if (!link || /^\s*$/.test(link)) {
      const alt = /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(b) ?? /<link[^>]*href=["']([^"']+)["']/i.exec(b);
      link = alt ? decode(alt[1]!) : '';
    }
    link = decode(link).trim();
    if (!title || !/^https?:\/\//i.test(link)) continue;
    const ts = when(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    const encoded = tag(b, 'content:encoded') || tag(b, 'content');
    const desc = tag(b, 'description') || tag(b, 'summary');
    const body = encoded || desc;
    const id = createHash('sha1').update(`${src.id}|${link}`).digest('hex').slice(0, 12);
    items.push({ id, source: src.id, sourceName: src.name, topic: src.topic, title, link, ts, summary: plain(desc || encoded).slice(0, 360) });
    if (encoded) full.set(id, cleanHtml(encoded.includes('<') ? encoded : decode(encoded)));
    else if (body) full.set(id, '');
  }
  return { items, full };
}

const TTL = 3600000;

/** Reads every feed (one failing never blocks the others), keeps the newest items and the full text of those that carry it, refreshed at most hourly. */
export class LearnService {
  private items: LearnItem[] = [];
  private full = new Map<string, string>();
  private at = 0;
  private busy: Promise<void> | null = null;
  errors: Record<string, string> = {};
  constructor(private readonly get: (url: string) => Promise<string> = async (u) => {
    const r = await fetch(u, { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml', 'User-Agent': 'Mozilla/5.0 (compatible; reader)' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  }, private readonly now: () => number = Date.now) {}

  async refresh(force = false): Promise<void> {
    if (this.busy) return this.busy;
    if (!force && this.items.length && this.now() - this.at < TTL) return;
    this.busy = (async () => {
      const all: LearnItem[] = [];
      const errors: Record<string, string> = {};
      await Promise.all(LEARN_SOURCES.map(async (s) => {
        try {
          const { items, full } = parseFeed(await this.get(s.url), s);
          if (!items.length) throw new Error('no articles found in the feed');
          all.push(...items);
          for (const [k, v] of full) this.full.set(k, v);
        } catch (e) {
          errors[s.id] = (e as Error).message;
        }
      }));
      if (all.length) {
        this.items = all.sort((a, b) => b.ts - a.ts);
        this.at = this.now();
      }
      this.errors = errors;
    })().finally(() => { this.busy = null; });
    return this.busy;
  }

  async list(force = false): Promise<{ items: LearnItem[]; sources: LearnSource[]; errors: Record<string, string>; at: number }> {
    await this.refresh(force);
    return { items: this.items, sources: LEARN_SOURCES, errors: this.errors, at: this.at };
  }

  /** The cleaned full text, or an empty string when the feed only sent a summary. */
  article(id: string): { item: LearnItem; html: string } | null {
    const item = this.items.find((i) => i.id === id);
    return item ? { item, html: this.full.get(id) ?? '' } : null;
  }
}
