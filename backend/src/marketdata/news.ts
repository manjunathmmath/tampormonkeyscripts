import { createHash } from 'node:crypto';
import type { KeyValueStore } from '../store/fileStore.js';
import { parseFeed, type LearnSource } from './learn.js';

// ───────────────────────────── headlines

export interface NewsSource { id: string; name: string; url: string }
/** Publisher feeds (public RSS). Each url is the FINAL address, with no redirect. */
export const NEWS_SOURCES: NewsSource[] = [
  { id: 'et', name: 'Economic Times', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
  { id: 'mc', name: 'Moneycontrol', url: 'https://www.moneycontrol.com/rss/marketreports.xml' },
  { id: 'mint', name: 'Mint', url: 'https://www.livemint.com/rss/markets' },
  { id: 'cnbc', name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { id: 'bs', name: 'Business Standard', url: 'https://www.business-standard.com/rss/markets-106.rss' },
  { id: 'inv', name: 'Investing.com', url: 'https://www.investing.com/rss/news.rss' },
  { id: 'mw', name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { id: 'bbc', name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
];

export type Level = 'HIGH' | 'MED' | 'LOW';
interface Rule { cat: string; high: RegExp; med: RegExp; watch: string[] }
const W = { nifty: 'NIFTY 50', bank: 'NIFTY BANK', crude: 'CRUDEOILM', gold: 'GOLDM', silver: 'SILVERM' };
const RULES: Rule[] = [
  { cat: 'Central bank', high: /\b(rate (cut|hike|decision)|cuts? rates?|hikes? rates?|holds? rates?|keeps? rates? (unchanged|steady)|raises? (interest )?rates?|policy (decision|statement)|fomc|rate-setting)\b/i, med: /\b(rbi|fed(eral reserve)?|ecb|boj|bank of (england|japan)|central bank|monetary policy|powell|governor)\b/i, watch: [W.nifty, W.bank, W.gold] },
  { cat: 'Economic data', high: /\b(cpi|inflation|jobs report|payrolls|non-?farm|gdp|unemployment)\b.*\b(rises?|falls?|jumps?|surges?|slows?|beats?|misses?|hotter|cooler|higher|lower|than expected)\b/i, med: /\b(cpi|inflation|payrolls|gdp|iip|pmi|jobless|retail sales|trade deficit|gst collections?)\b/i, watch: [W.nifty, W.gold] },
  { cat: 'War / geopolitics', high: /\b(war|missile|airstrike|invasion|ceasefire|attack on|strikes? on|escalat\w+|blockade|nuclear)\b/i, med: /\b(tensions?|conflict|military|sanctions?|geopolitic\w+|embargo)\b/i, watch: [W.crude, W.gold, W.nifty] },
  { cat: 'Politics / trade', high: /\b(tariffs?|trade deal|trade war|election results?|elections?|budget|union budget|shutdown)\b/i, med: /\b(trump|modi|congress|parliament|policy|reform|export ban|import duty)\b/i, watch: [W.nifty, W.bank] },
  { cat: 'Crude oil', high: /\b(opec\+?|oil (prices? )?(surges?|jumps?|plunges?|crash\w*|tumbles?)|crude (surges?|jumps?|plunges?|crash\w*|tumbles?))\b/i, med: /\b(crude|brent|wti|oil prices?|natural gas|petroleum)\b/i, watch: [W.crude, W.nifty] },
  { cat: 'Gold / silver', high: /\b(gold|silver)\b.*\b(record|all-time|surges?|jumps?|plunges?|tumbles?|crash\w*)\b/i, med: /\b(gold|silver|bullion)\b/i, watch: [W.gold, W.silver] },
  { cat: 'Currency / yields', high: /\b(rupee|dollar|yen)\b.*\b(record|all-time|surges?|plunges?|crash\w*|tumbles?|slumps?)\b/i, med: /\b(rupee|dollar index|treasury yields?|bond yields?|10-year yield|forex)\b/i, watch: [W.nifty, W.bank, W.gold] },
  { cat: 'Market move', high: /\b(sensex|nifty|dow|s&p 500|nasdaq)\b.*\b(crash\w*|plunges?|tumbles?|surges?|soars?|rall(y|ies)|tank\w*|bloodbath)\b/i, med: /\b(sensex|nifty|dow jones|s&p 500|nasdaq|stocks?|markets?|wall street)\b/i, watch: [W.nifty, W.bank] },
  { cat: 'India policy / flows', high: /\b(sebi (bans?|orders?|probe)|fii|fpi|foreign (portfolio )?investors?)\b.*\b(sell|sold|dump|pull|outflows?|inflows?|record)\b/i, med: /\b(sebi|fii|fpi|dii|ipo|rbi|nse|bse|f&o)\b/i, watch: [W.nifty, W.bank] },
  { cat: 'Company', high: /\b(results?|earnings|profit|loss|guidance|merger|acquisition|takeover|bankruptcy|fraud)\b.*\b(beats?|misses?|plunges?|jumps?|surges?|slumps?|warns?|record)\b/i, med: /\b(results?|earnings|quarterly|q[1-4]|dividend|buyback|stake)\b/i, watch: [W.nifty] },
];
const BIG_MOVE = /(\b\d{1,2}(\.\d+)?\s?%|\b[1-9],?\d{3}\s+points?)/;

export interface Tag { level: Level; cats: string[]; watch: string[]; why: string }
/** Impact tag of a headline: what it is about and what it usually touches. It says what to watch, never up or down. */
export function tagHeadline(title: string): Tag {
  let level: Level = 'LOW';
  const cats: string[] = [];
  const watch = new Set<string>();
  const why: string[] = [];
  for (const r of RULES) {
    const h = r.high.exec(title);
    const m = h ?? r.med.exec(title);
    if (!m) continue;
    const lv: Level = h ? 'HIGH' : 'MED';
    cats.push(r.cat);
    why.push(`${r.cat}: "${m[0].toLowerCase()}"`);
    r.watch.forEach((w) => watch.add(w));
    if (lv === 'HIGH' || (lv === 'MED' && level === 'LOW')) level = lv;
    if (lv === 'MED' && BIG_MOVE.test(title) && !/(in|over|within)\s+(the\s+)?(last\s+|past\s+)?(\w+\s+)?(months?|years?|weeks?)/i.test(title) && (['Crude oil', 'Gold / silver', 'Currency / yields'].includes(r.cat) || (r.cat === 'Market move' && /(sensex|nifty|dow|s&p|nasdaq)/i.test(title)))) level = 'HIGH';
  }
  return { level, cats: cats.slice(0, 3), watch: [...watch].slice(0, 5), why: why.slice(0, 3).join('; ') };
}

const TOPICS: [string, RegExp][] = [
  ['India', /\b(india|indian|rbi|sebi|sensex|nifty|rupee|nse|bse|modi|mumbai|dalal)\b/i],
  ['US', /\b(u\.?s\.?|wall street|dow|nasdaq|s&p|fed|federal reserve|treasury|trump|white house)\b/i],
  ['Central banks', /\b(rbi|fed|federal reserve|ecb|boj|bank of (england|japan)|central bank|rate (cut|hike|decision)|powell|monetary policy|fomc)\b/i],
  ['Commodities', /\b(crude|oil|opec|brent|wti|gold|silver|copper|natural gas|bullion|commodit\w+)\b/i],
];
export function topicsOf(title: string, sourceId: string): string[] {
  const t = TOPICS.filter(([, re]) => re.test(title)).map(([n]) => n);
  if (['et', 'mc', 'mint', 'bs'].includes(sourceId) && !t.includes('India')) t.unshift('India');
  if (['cnbc', 'inv', 'mw'].includes(sourceId) && !t.includes('US')) t.push('US');
  if (['bbc', 'cnbc'].includes(sourceId)) t.push('Global');
  return [...new Set(t.length ? t : ['Global'])];
}

export interface Headline { id: string; title: string; link: string; ts: number; sources: string[]; topics: string[]; tag: Tag; kw: boolean }
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const DEFAULT_KW = ['election', 'fed', 'tariff', 'opec', 'war', 'rbi', 'rate cut', 'rate hike', 'sanction', 'default'];

// ───────────────────────────── calendar and events

export interface CalEvent {
  id: string; ts: number; title: string; country: string; impact: 'High' | 'Medium' | 'Low'; forecast: string; previous: string; own?: boolean;
}
export interface Arrows { nifty: string; bank: string; inr: string; gold: string; silver: string; crude: string }
export interface Side { label: string; call: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'LITTLE'; mild?: boolean; arrows: Arrows }
interface VRule { id: string; test: (t: string, c: string) => boolean; level: Level; why: string; lowStrong?: boolean; strong: Side; weak: Side; note: string }
const A = (nifty: string, bank: string, inr: string, gold: string, silver: string, crude: string): Arrows => ({ nifty, bank, inr, gold, silver, crude });
const rx = (re: RegExp) => (t: string): boolean => re.test(t);
/** General macro reasoning by event type, in order (first match wins). Not predictions: the move depends on the surprise against the forecast. */
const VRULES: VRule[] = [
  { id: 'rbi', test: rx(/\b(rbi|reserve bank of india|repo rate)\b/i), level: 'HIGH', why: 'The RBI sets the rates banks and borrowers in India live with.', strong: { label: 'More hawkish than expected (no cut, tighter stance)', call: 'NEGATIVE', arrows: A('▼', '▼▼', '▲', '▼', '▼', '–') }, weak: { label: 'More dovish than expected (cut or softer stance)', call: 'POSITIVE', arrows: A('▲', '▲▲', '▼', '▲', '▲', '–') }, note: 'Banks and rate-sensitive stocks react most; the stance and guidance often matter more than the rate itself.' },
  { id: 'fed', test: (t, c) => c === 'USD' && /\b(fomc|federal funds|fed chair|powell|fed interest|rate statement)\b/i.test(t), level: 'HIGH', why: 'US rates drive the dollar and foreign flows into Indian stocks.', strong: { label: 'More hawkish than expected', call: 'NEGATIVE', arrows: A('▼', '▼', '▼', '▼', '▼', '▼') }, weak: { label: 'More dovish than expected', call: 'POSITIVE', arrows: A('▲', '▲', '▲', '▲', '▲', '▲') }, note: 'Usually lands after Indian hours, so India reacts at the next open.' },
  { id: 'usjobs', test: (t, c) => c === 'USD' && /\b(non-?farm|unemployment rate|average hourly|adp|employment change|jobless claims)\b/i.test(t), level: 'HIGH', why: 'Strong US jobs lift rate expectations and the dollar.', strong: { label: 'Stronger jobs than forecast', call: 'NEGATIVE', mild: true, arrows: A('▼', '▼', '▼', '▼', '▼', '▲') }, weak: { label: 'Weaker jobs than forecast', call: 'POSITIVE', mild: true, arrows: A('▲', '▲', '▲', '▲', '▲', '▼') }, note: 'Good news for the US economy can be bad news for Indian markets through rates.' },
  { id: 'usinfl', test: (t, c) => c === 'USD' && /\b(cpi|ppi|pce|core inflation)\b/i.test(t), level: 'HIGH', why: 'Hotter US inflation means higher US rates for longer.', strong: { label: 'Hotter than forecast', call: 'NEGATIVE', arrows: A('▼', '▼', '▼', '▼', '▼', '–') }, weak: { label: 'Cooler than forecast', call: 'POSITIVE', arrows: A('▲', '▲', '▲', '▲', '▲', '–') }, note: 'A big surprise either way moves global markets within minutes.' },
  { id: 'budget', test: rx(/\bunion budget\b|\bbudget\b.*\bindia\b/i), level: 'HIGH', why: 'The Budget sets taxes, spending and borrowing for the year.', strong: { label: 'Pro-growth, fiscal discipline kept', call: 'POSITIVE', arrows: A('▲', '▲', '▲', '–', '–', '–') }, weak: { label: 'Tax surprises or wider deficit', call: 'NEGATIVE', arrows: A('▼', '▼', '▼', '–', '–', '–') }, note: 'Expect large intraday swings; capital gains and F&O tax changes matter for traders.' },
  { id: 'inflation-in', test: (t) => /\bindia\b|\bwpi\b/i.test(t) && /\b(cpi|wpi|inflation)\b/i.test(t), level: 'MED', why: 'Hotter Indian inflation means fewer RBI cuts.', strong: { label: 'Hotter than forecast', call: 'NEGATIVE', mild: true, arrows: A('▼', '▼', '–', '–', '–', '–') }, weak: { label: 'Cooler than forecast', call: 'POSITIVE', mild: true, arrows: A('▲', '▲', '–', '–', '–', '–') }, note: 'Bank and rate-sensitive stocks feel it first.' },
  { id: 'growth-in', test: (t) => /\bindia\b/i.test(t) && /\b(gdp|iip|pmi|gst|core sector|trade balance|industrial)\b/i.test(t), level: 'MED', why: 'Growth data shapes earnings expectations.', strong: { label: 'Stronger than forecast', call: 'POSITIVE', mild: true, arrows: A('▲', '▲', '▲', '–', '–', '–') }, weak: { label: 'Weaker than forecast', call: 'NEGATIVE', mild: true, arrows: A('▼', '▼', '▼', '–', '–', '–') }, note: 'Usually a small move unless the surprise is large.' },
  { id: 'cb', test: (t, c) => c !== 'USD' && /\b(rate statement|rate decision|interest rate|monetary policy|official bank rate|cash rate|main refinancing)\b/i.test(t), level: 'MED', why: 'Other central banks move the dollar and global risk mood.', strong: { label: 'More hawkish than expected', call: 'MIXED', mild: true, arrows: A('▼', '▼', '–', '▼', '▼', '–') }, weak: { label: 'More dovish than expected', call: 'MIXED', mild: true, arrows: A('▲', '▲', '–', '▲', '▲', '–') }, note: 'The effect on India is indirect, through the dollar and global risk appetite.' },
  { id: 'speech', test: rx(/\b(speaks|speech|testifies|press conference)\b/i), level: 'MED', why: 'Central bank speakers can change rate expectations.', strong: { label: 'Hawkish tone', call: 'MIXED', mild: true, arrows: A('▼', '▼', '–', '▼', '▼', '–') }, weak: { label: 'Dovish tone', call: 'MIXED', mild: true, arrows: A('▲', '▲', '–', '▲', '▲', '–') }, note: 'The words matter more than any number.' },
  { id: 'oil', test: rx(/\b(crude oil inventories|opec|oil)\b/i), level: 'MED', why: 'India imports most of its oil, so crude prices hit the rupee and costs.', lowStrong: true, strong: { label: 'Bigger stock draw (crude-positive)', call: 'NEGATIVE', mild: true, arrows: A('▼', '–', '▼', '–', '–', '▲') }, weak: { label: 'Bigger stock build (crude-negative)', call: 'POSITIVE', mild: true, arrows: A('▲', '–', '▲', '–', '–', '▼') }, note: 'Higher crude is generally a headwind for India; CRUDEOILM moves the other way to Nifty.' },
  { id: 'china', test: (t, c) => c === 'CNY', level: 'MED', why: 'China drives metals demand and Asian risk mood.', strong: { label: 'Stronger than forecast', call: 'MIXED', mild: true, arrows: A('▲', '▲', '–', '–', '▲', '▲') }, weak: { label: 'Weaker than forecast', call: 'MIXED', mild: true, arrows: A('▼', '▼', '–', '–', '▼', '▼') }, note: 'The link to India is indirect.' },
  { id: 'usother', test: (_t, c) => c === 'USD', level: 'MED', why: 'US data moves the dollar and rate expectations.', strong: { label: 'Stronger than forecast', call: 'MIXED', mild: true, arrows: A('▼', '▼', '▼', '▼', '▼', '–') }, weak: { label: 'Weaker than forecast', call: 'MIXED', mild: true, arrows: A('▲', '▲', '▲', '▲', '▲', '–') }, note: 'A small effect unless the surprise is big.' },
];

export interface EventView extends CalEvent {
  india: { level: Level; why: string };
  verdict: { higher: Side; lower: Side; note: string } | null;
  untilMin: number;
}

export function viewEvent(e: CalEvent, now: number): EventView {
  const r = VRULES.find((x) => x.test(e.title, e.country));
  const lowStrong = r ? (r.lowStrong ?? false) || /unemployment|jobless/i.test(e.title) : false;
  const verdict = r ? { higher: lowStrong ? r.weak : r.strong, lower: lowStrong ? r.strong : r.weak, note: r.note } : null;
  const level: Level = e.own ? (e.impact === 'High' ? 'HIGH' : e.impact === 'Medium' ? 'MED' : 'LOW') : r ? r.level : 'LOW';
  return { ...e, india: { level, why: r?.why ?? 'Little direct link to Indian markets.' }, verdict, untilMin: Math.round((e.ts - now) / 60000) };
}

/** Dates from the issuers' published calendars. The Fed calls its dates tentative until confirmed. Add more here. */
const SCHEDULE: { date: string; time: string; title: string; country: string; impact: CalEvent['impact'] }[] = [
  { date: '2026-12-04', time: '10:00', title: 'RBI MPC decision (repo rate)', country: 'INR', impact: 'High' },
  { date: '2027-02-05', time: '10:00', title: 'RBI MPC decision (repo rate)', country: 'INR', impact: 'High' },
  { date: '2026-12-09', time: '00:30', title: 'FOMC rate decision (US Fed)', country: 'USD', impact: 'High' },
];
const istMs = (date: string, time: string): number => Date.parse(`${date}T${time}:00+05:30`);
const evId = (s: string): string => createHash('sha1').update(s).digest('hex').slice(0, 12);

interface Saved<T> { at: number; data: T }
const CAL_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const CAL_GAP = 15 * 60000;

export interface NewsDeps {
  store: KeyValueStore;
  get?: (url: string) => Promise<string>;
  now?: () => number;
  /** price move of an instrument from just before `ts` to now, or null */
  move?: (name: string, ts: number) => Promise<{ from: number; to: number; closed: boolean } | null>;
  /** raise an in-app (and Telegram) alert */
  push?: (a: { name: string; kind: 'NEWS' | 'EVENT'; title: string; text: string }) => void;
}

/** Headlines from public feeds with impact tags, the economic calendar with the India reading of each event, and your own events. Read only; never feeds a score. */
export class NewsService {
  private items: Headline[] = [];
  private at = 0;
  private busy: Promise<void> | null = null;
  private cal: CalEvent[] = [];
  private calAt = 0;
  private calTry = 0;
  errors: Record<string, string> = {};
  calError: string | null = null;
  private readonly now: () => number;
  private readonly get: (url: string) => Promise<string>;
  private moves = new Map<string, { at: number; v: unknown }>();
  constructor(private readonly d: NewsDeps) {
    this.now = d.now ?? Date.now;
    this.get = d.get ?? (async (u) => {
      const r = await fetch(u, { headers: { Accept: '*/*', 'User-Agent': 'Mozilla/5.0 (compatible; reader)' }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    });
    const c = d.store.get<Saved<CalEvent[]>>('news.cal');
    if (c) { this.cal = c.data; this.calAt = c.at; }
    this.items = d.store.get<Saved<Headline[]>>('news.items')?.data ?? [];
  }

  keywords(): string[] { return this.d.store.get<string[]>('news.kw') ?? DEFAULT_KW; }
  setKeywords(k: string[]): void { this.d.store.set('news.kw', k.map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 40)); }
  alertsOn(): boolean { return this.d.store.get<boolean>('news.alerts') === true; }
  setAlerts(on: boolean): void { this.d.store.set('news.alerts', on); }

  async refresh(force = false): Promise<void> {
    if (this.busy) return this.busy;
    if (!force && this.items.length && this.now() - this.at < 4 * 60000) return;
    this.busy = (async () => {
      const found: Headline[] = [];
      const errors: Record<string, string> = {};
      await Promise.all(NEWS_SOURCES.map(async (s) => {
        const attempt = async (): Promise<void> => {
          const { items } = parseFeed(await this.get(s.url), { ...s, topic: 'India' } as LearnSource);
          if (!items.length) throw new Error('no headlines in the feed');
          for (const i of items) {
            if (!i.ts || this.now() - i.ts > 36 * 3600000) continue;
            found.push({ id: '', title: i.title, link: i.link, ts: i.ts, sources: [s.name], topics: topicsOf(i.title, s.id), tag: tagHeadline(i.title), kw: false });
          }
        };
        try { await attempt(); } catch { try { await new Promise((r) => setTimeout(r, 3000)); await attempt(); } catch (e) { errors[s.id] = (e as Error).message; } }
      }));
      if (found.length) {
        const by = new Map<string, Headline>();
        for (const h of found.sort((a, b) => a.ts - b.ts)) {
          const k = norm(h.title).slice(0, 90);
          const have = by.get(k);
          if (have) { if (!have.sources.includes(h.sources[0]!)) have.sources.push(h.sources[0]!); } else { h.id = evId(h.link); by.set(k, h); }
        }
        const kw = this.keywords();
        this.items = [...by.values()].map((h) => ({ ...h, kw: kw.some((w) => norm(h.title).includes(w)) })).sort((a, b) => b.ts - a.ts).slice(0, 250);
        this.at = this.now();
        this.d.store.set('news.items', { at: this.at, data: this.items.slice(0, 120) } satisfies Saved<Headline[]>);
        this.alertHeadlines();
      }
      this.errors = errors;
    })().finally(() => { this.busy = null; });
    return this.busy;
  }

  async headlines(force = false): Promise<{ items: Headline[]; errors: Record<string, string>; at: number; sources: string[]; alerts: boolean; keywords: string[] }> {
    await this.refresh(force);
    return { items: this.items, errors: this.errors, at: this.at, sources: NEWS_SOURCES.map((s) => s.name), alerts: this.alertsOn(), keywords: this.keywords() };
  }

  /** the price move of the watched instruments since a headline */
  async reaction(id: string): Promise<{ name: string; from: number; to: number; pct: number; closed: boolean }[]> {
    const h = this.items.find((x) => x.id === id);
    if (!h || !this.d.move || this.now() - h.ts > 24 * 3600000) return [];
    const out: { name: string; from: number; to: number; pct: number; closed: boolean }[] = [];
    for (const name of h.tag.watch.length ? h.tag.watch : ['NIFTY 50']) {
      const key = `${name}|${h.ts}`;
      const c = this.moves.get(key);
      let m = c && this.now() - c.at < 4 * 60000 ? (c.v as Awaited<ReturnType<NonNullable<NewsDeps['move']>>>) : undefined;
      if (m === undefined) { try { m = await this.d.move(name, h.ts); } catch { m = null; } this.moves.set(key, { at: this.now(), v: m }); }
      if (m) out.push({ name, from: m.from, to: m.to, pct: ((m.to - m.from) / m.from) * 100, closed: m.closed });
    }
    return out;
  }

  // calendar
  private fromFeed(json: unknown): CalEvent[] {
    if (!Array.isArray(json)) throw new Error('unexpected calendar format');
    const out: CalEvent[] = [];
    for (const r of json as { title?: string; country?: string; date?: string; impact?: string; forecast?: string; previous?: string }[]) {
      if (!r.title || !r.date || (r.impact !== 'High' && r.impact !== 'Medium')) continue;
      const ts = Date.parse(r.date);
      if (!Number.isFinite(ts)) continue;
      out.push({ id: evId(`${r.title}|${r.country}|${r.date}`), ts, title: r.title, country: r.country ?? '', impact: r.impact, forecast: r.forecast ?? '', previous: r.previous ?? '' });
    }
    return out;
  }

  /** the calendar feed rate-limits quickly: never more than one call per 15 minutes, the saved copy otherwise */
  async refreshCalendar(): Promise<void> {
    const n = this.now();
    if (n - this.calTry < CAL_GAP || (this.cal.length && n - this.calAt < 55 * 60000)) return;
    this.calTry = n;
    try {
      const txt = await this.get(CAL_URL);
      if (txt.trim()[0] !== '[') throw new Error('rate limited (the feed answered with a page, not data)');
      this.cal = this.fromFeed(JSON.parse(txt));
      this.calAt = n;
      this.calError = null;
      this.d.store.set('news.cal', { at: n, data: this.cal } satisfies Saved<CalEvent[]>);
    } catch (e) {
      this.calError = (e as Error).message;
    }
  }

  own(): CalEvent[] { return this.d.store.get<CalEvent[]>('news.events') ?? []; }
  addEvent(x: { title: string; date: string; time: string; impact: CalEvent['impact']; country?: string }): CalEvent {
    const ts = istMs(x.date, x.time);
    if (!Number.isFinite(ts) || !x.title.trim()) throw new Error('title, date (YYYY-MM-DD) and time (HH:MM, IST) are required');
    const e: CalEvent = { id: evId(`own|${x.title}|${ts}`), ts, title: x.title.trim().slice(0, 120), country: (x.country ?? '').slice(0, 4), impact: x.impact, forecast: '', previous: '', own: true };
    this.d.store.set('news.events', [...this.own().filter((o) => o.id !== e.id), e].slice(-100));
    return e;
  }
  removeEvent(id: string): void { this.d.store.set('news.events', this.own().filter((o) => o.id !== id)); }

  async events(): Promise<{ items: EventView[]; error: string | null; at: number; now: number }> {
    await this.refreshCalendar();
    const now = this.now();
    const sched: CalEvent[] = SCHEDULE.map((s) => ({ id: evId(`s|${s.title}|${s.date}`), ts: istMs(s.date, s.time), title: s.title, country: s.country, impact: s.impact, forecast: '', previous: '' }));
    const all = [...this.cal, ...sched, ...this.own()].filter((e) => e.ts > now - 24 * 3600000 && e.ts < now + 21 * 86400000);
    const seen = new Set<string>();
    const items = all.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))).sort((a, b) => a.ts - b.ts).map((e) => viewEvent(e, now));
    return { items, error: this.calError, at: this.calAt, now };
  }

  // alerts
  private alertedKeys(): Set<string> { return new Set(this.d.store.get<string[]>('news.alerted') ?? []); }
  private mark(k: string): void { this.d.store.set('news.alerted', [...this.alertedKeys(), k].slice(-300)); }
  private alertHeadlines(): void {
    if (!this.alertsOn() || !this.d.push) return;
    const done = this.alertedKeys();
    const fresh = this.items.filter((h) => h.tag.level === 'HIGH' && this.now() - h.ts < 3600000 && !done.has(`h|${h.id}`)).slice(0, 5);
    if (!fresh.length) return;
    for (const h of fresh) this.mark(`h|${h.id}`);
    this.d.push({ name: 'News', kind: 'NEWS', title: `HIGH impact: ${fresh.length} headline${fresh.length > 1 ? 's' : ''}`, text: fresh.map((h) => `${h.title} (${h.sources[0]}; watch ${h.tag.watch.join(', ') || 'the market'})`).join('\n') });
  }
  /** a HIGH India-impact event within 15 minutes gets one alert */
  async eventTick(): Promise<void> {
    if (!this.alertsOn() || !this.d.push) return;
    const { items } = await this.events();
    const done = this.alertedKeys();
    for (const e of items) {
      if (e.india.level !== 'HIGH' || e.untilMin < 0 || e.untilMin > 15 || done.has(`e|${e.id}`)) continue;
      this.mark(`e|${e.id}`);
      this.d.push({ name: 'Event', kind: 'EVENT', title: `In ${e.untilMin} min: ${e.title}`, text: `${e.country} · forecast ${e.forecast || '—'} · previous ${e.previous || '—'}. India impact ${e.india.level}: ${e.india.why}` });
    }
  }
}
