import { describe, expect, it } from 'vitest';
import { cleanHtml, LearnService, parseFeed, LEARN_SOURCES } from '../src/marketdata/learn.js';

const src = LEARN_SOURCES[0]!;
const rss = `<rss><channel><item><title>Hello &amp; welcome</title><link>https://a.example/p1</link><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Short <b>summary</b></p>]]></description><content:encoded><![CDATA[<p>Full text</p><script>x()</script><img src="a.png"><a href="https://b.example" onclick="x()">link</a>]]></content:encoded></item></channel></rss>`;
const atom = `<feed><entry><title>Atom one</title><link rel="alternate" href="https://c.example/1"/><published>2026-11-03T08:00:00Z</published><summary>Plain summary</summary></entry></feed>`;

describe('learn feed', () => {
  it('reads RSS with full text and cleans it', () => {
    const { items, full } = parseFeed(rss, src);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('Hello & welcome');
    expect(items[0]!.summary).toBe('Short summary');
    const html = full.get(items[0]!.id)!;
    expect(html).toContain('<p>Full text</p>');
    expect(html).not.toMatch(/script|img|onclick/);
    expect(html).toContain('<a href="https://b.example"');
  });
  it('reads Atom and notes a summary-only feed', () => {
    const { items, full } = parseFeed(atom, src);
    expect(items[0]!.link).toBe('https://c.example/1');
    expect(items[0]!.ts).toBe(Date.parse('2026-11-03T08:00:00Z'));
    expect(full.get(items[0]!.id)).toBe('');
  });
  it('drops javascript links and unknown tags', () => {
    expect(cleanHtml('<a href="javascript:alert(1)">x</a><table><tr><td>t</td></tr></table>')).toBe('<a>x</a>t');
  });
  it('one failing feed does not block the others', async () => {
    const svc = new LearnService(async (u) => { if (u === LEARN_SOURCES[0]!.url) throw new Error('HTTP 403'); return rss; });
    const r = await svc.list();
    expect(r.errors[LEARN_SOURCES[0]!.id]).toBe('HTTP 403');
    expect(r.items.length).toBeGreaterThan(0);
  });
});
