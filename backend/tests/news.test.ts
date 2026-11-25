import { describe, expect, it } from 'vitest';
import { NewsService, tagHeadline, viewEvent, topicsOf } from '../src/marketdata/news.js';
import type { KeyValueStore } from '../src/store/fileStore.js';

const mem = (): KeyValueStore => { const m = new Map<string, unknown>(); return { get: <T,>(k: string) => m.get(k) as T | undefined, set: (k, v) => void m.set(k, v), delete: (k) => void m.delete(k) }; };

describe('headline tags', () => {
  it('tags a rate decision HIGH with instruments to watch', () => {
    const t = tagHeadline('RBI holds rates unchanged, keeps stance neutral');
    expect(t.level).toBe('HIGH');
    expect(t.cats).toContain('Central bank');
    expect(t.watch).toContain('NIFTY BANK');
  });
  it('lifts a crude move with a big percentage to HIGH, plain mention stays MED', () => {
    expect(tagHeadline('Crude oil prices fall 6% on demand worries').level).toBe('HIGH');
    expect(tagHeadline('Brent crude edges higher in Asian trade').level).toBe('MED');
    expect(tagHeadline('Local bakery wins award').level).toBe('LOW');
  });
  it('puts India and commodity headlines on their tabs', () => {
    expect(topicsOf('Sensex ends higher', 'bbc')).toContain('India');
    expect(topicsOf('Gold hits record', 'bbc')).toContain('Commodities');
  });
});

describe('events', () => {
  const ev = (title: string, country: string) => viewEvent({ id: 'x', ts: 2e12, title, country, impact: 'High', forecast: '', previous: '' }, 2e12 - 600000);
  it('reads the unemployment rate the other way round', () => {
    const v = ev('Unemployment Rate', 'USD');
    expect(v.verdict?.higher.call).toBe('POSITIVE');
    expect(v.untilMin).toBe(10);
  });
  it('knows RBI and US CPI, and gives a LOW event no verdict', () => {
    expect(ev('RBI MPC decision (repo rate)', 'INR').india.level).toBe('HIGH');
    expect(ev('CPI m/m', 'USD').verdict?.higher.call).toBe('NEGATIVE');
    expect(ev('Retail Sales', 'AUD').verdict).toBeNull();
  });
});

describe('service', () => {
  const rss = (t: string, when: number) => `<rss><channel><item><title>${t}</title><link>https://x.example/${encodeURIComponent(t)}</link><pubDate>${new Date(when).toUTCString()}</pubDate></item></channel></rss>`;
  it('merges duplicates across sources and survives a failing one', async () => {
    const now = Date.parse('2026-11-20T10:00:00Z');
    let n = 0;
    const svc = new NewsService({ store: mem(), now: () => now, get: async (u) => { if (u.includes('bbci')) throw new Error('HTTP 500'); n++; return rss('Fed cuts rates by 25 bps', now - 600000); } });
    const r = await svc.headlines(true);
    expect(n).toBeGreaterThan(1);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.sources.length).toBeGreaterThan(1);
    expect(r.items[0]!.tag.level).toBe('HIGH');
    expect(r.errors['bbc']).toBe('HTTP 500');
  });
  it('adds and removes your own events and alerts once 15 minutes before a HIGH event', async () => {
    const now = Date.parse('2026-11-20T04:00:00Z');
    const pushed: string[] = [];
    const svc = new NewsService({ store: mem(), now: () => now, get: async () => { throw new Error('offline'); }, push: (a) => void pushed.push(a.title) });
    svc.setAlerts(true);
    svc.addEvent({ title: 'RBI governor speech', date: '2026-11-20', time: '09:40', impact: 'High' });
    await svc.eventTick();
    await svc.eventTick();
    expect(pushed).toHaveLength(1);
    const id = (await svc.events()).items.find((e) => e.own)!.id;
    svc.removeEvent(id);
    expect((await svc.events()).items.find((e) => e.own)).toBeUndefined();
  });
});
