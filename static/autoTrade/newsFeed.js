// ─────────────────────────────────────────────────────────────────────────────────────────────
// News feed side panel (v29.499). Headlines only (source, time, link), pulled from free RSS feeds with GM_xmlhttpRequest:
// Google News RSS search queries (one per topic tab) plus a few publisher feeds. Nothing here scores a headline or feeds the
// consensus / verdict: it is a panel to read. Impact tags and the measured price reaction are a later step.
// Opened from the topbar newspaper icon (#gtb-news-toggle) or the All Tools tile 'show-news-feed'.
// ─────────────────────────────────────────────────────────────────────────────────────────────

var _NF_TABS = [['all', 'All'], ['breaking', 'Breaking'], ['india', 'India'], ['us', 'US'], ['global', 'Global'], ['cb', 'Central banks'], ['comm', 'Commodities']];
var _NF_REFRESH_MS = 5 * 60 * 1000;
var _NF_MAX_AGE_MS = 36 * 3600 * 1000;      // headlines older than this are dropped
var _NF_BREAKING_MS = 30 * 60 * 1000;       // "Breaking" tab = published in the last 30 minutes
var _NF_KW_DEFAULT = 'election, fed, tariff, opec, war, rbi, rate cut, rate hike, sanction, default';

function _nfGq(q) { return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:1d') + '&hl=en-IN&gl=IN&ceid=IN:en'; }
// id, label, url, tabs the feed's items belong to
var _NF_SOURCES = [
    { id: 'g-india',  label: 'Google News: India markets',   url: _nfGq('Sensex OR Nifty OR RBI OR SEBI OR "Indian stock market"'),                                tabs: ['india'] },
    { id: 'g-us',     label: 'Google News: US markets',      url: _nfGq('"Wall Street" OR "Dow Jones" OR Nasdaq OR "US election" OR "US economy"'),                tabs: ['us'] },
    { id: 'g-global', label: 'Google News: global markets',  url: _nfGq('"global markets" OR "stock market" OR tariffs OR sanctions OR geopolitics'),               tabs: ['global'] },
    { id: 'g-cb',     label: 'Google News: central banks',   url: _nfGq('"Federal Reserve" OR RBI OR ECB OR "Bank of Japan" OR "interest rate decision"'),         tabs: ['cb'] },
    { id: 'g-comm',   label: 'Google News: commodities',     url: _nfGq('"crude oil" OR OPEC OR "gold price" OR "silver price" OR "natural gas"'),                 tabs: ['comm'] },
    { id: 'et',       label: 'Economic Times Markets',       url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',                           tabs: ['india'] },
    { id: 'mc',       label: 'Moneycontrol',                 url: 'https://www.moneycontrol.com/rss/marketreports.xml',                                             tabs: ['india'] },
    { id: 'mint',     label: 'Mint Markets',                 url: 'https://www.livemint.com/rss/markets',                                                           tabs: ['india'] },
    { id: 'cnbc',     label: 'CNBC Finance',                 url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html',                                           tabs: ['us', 'global'] },
    { id: 'yf',       label: 'Yahoo Finance (S&P 500)',      url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US',                  tabs: ['us', 'global'] },
    { id: 'mw',       label: 'MarketWatch',                  url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',                                                     tabs: ['us', 'global'] },
    { id: 'bbc',      label: 'BBC Business',                 url: 'https://feeds.bbci.co.uk/news/business/rss.xml',                                                 tabs: ['global'] }
];

var _NF = { items: {}, tab: 'all', q: '', lv: {}, view: '', lastFetch: 0, lastViewed: 0, loading: false, status: {}, timer: null, open: false };
try { _NF.lastViewed = parseInt(localStorage.getItem('GTB_NEWS_VIEWED') || '0', 10) || 0; } catch (e) {}
try { (JSON.parse(localStorage.getItem('GTB_NEWS_LV') || '[]') || []).forEach(function (k) { _NF.lv[k] = 1; }); } catch (e) {}
var _NF_LEVELS = [['HIGH', 'HIGH'], ['MEDIUM', 'MED'], ['LOW', 'LOW'], ['NONE', 'Other']];

function _nfEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _nfKey(title) { return String(title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70); }
function _nfKeywords() {
    var raw = ''; try { raw = localStorage.getItem('GTB_NEWS_KW'); } catch (e) {}
    if (raw == null) raw = _NF_KW_DEFAULT;
    return String(raw).split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
}
function _nfAgo(ms) {
    var m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    var h = Math.floor(m / 60);
    return h < 24 ? h + ' h ago' : Math.floor(h / 24) + ' d ago';
}

// ── Step 2: impact tags (rule of thumb) ─────────────────────────────────────────────────────────────────────
// Each rule: a category, the instruments it usually touches, a HIGH pattern (a decision / event / big move) and a MEDIUM pattern (the topic is in the
// headline). A headline gets the highest level any rule gives it. The tag says WHAT TO WATCH and why, never up or down. Rules were written from real
// headlines in the feeds; they are keyword matches, not understanding, so a headline can be mis-tagged (the tooltip lists the words that matched).
var _NF_RULES = [
    { id: 'cb',    label: 'Central bank', watch: ['NIFTY BANK', 'NIFTY 50', 'USDINR', 'GOLDM'],
      hi: /\b(rate (hike|hikes|cut|cuts|decision|pause|hold|rise|increase)|(holds?|raises?|cuts?|hikes?|lifts?|keeps?|leaves?) (interest )?rates?|(policy|repo) (rate|statement|decision)|fomc (meeting|statement|decision|minutes)|emergency (rate|meeting)|rate (tightening|easing)|(new )?(fed|fomc|rbi|ecb) (policy )?(statement|decision|minutes))\b/i,
      md: /\b(fed|federal reserve|fomc|rbi|reserve bank|ecb|bank of japan|boj|bank of england|powell|lagarde|central bank|monetary policy)\b/i },
    { id: 'data',  label: 'Economic data', watch: ['NIFTY 50', 'USDINR', 'GOLDM'],
      hi: /\b(non-?farm|payrolls)\b|\b(inflation|cpi) (hits|surges|jumps|spikes|soars|falls|drops|cools|rises|rose|eases)\b/i,
      md: /\b(inflation|cpi|ppi|gdp|payrolls|unemployment|jobless|pmi|retail sales|trade deficit|iip)\b/i },
    { id: 'geo',   label: 'War / geopolitics', watch: ['CRUDEOILM', 'GOLDM', 'NIFTY 50', 'USDINR'],
      hi: /\b(war|ceasefire|cease-fire|missiles?|air ?strikes?|invasion|invades|attacks?|attacked|peace (deal|talks|hopes)|hormuz|blockade|nuclear)\b/i,
      md: /\b(iran|israel|gaza|ukraine|russia|taiwan|north korea|houthi|red sea|middle east|west asia)\b/i },
    { id: 'pol',   label: 'Politics / trade', watch: ['NIFTY 50', 'USDINR', 'GOLDM', 'CRUDEOILM'],
      hi: /\b((election|midterm)s? results?|(election|midterm)s? (win|victory|victories|outcome|wave|tsunami)|wins? (the )?(election|congress|senate|majority)|landslide|exit polls?|tariffs?|sanctions?|trade (deal|war)|embargo|shutdown|impeach\w*)\b/i,
      md: /\b(election|midterms?|congress|senate|parliament|white house|trump|biden|modi|union budget|gst)\b/i },
    { id: 'oil',   label: 'Crude / energy', watch: ['CRUDEOILM', 'USDINR', 'NIFTY 50'],
      hi: /\b(opec\+?|crude|brent|wti|oil prices?)\b.*\b(crash\w*|plung\w*|plummet\w*|surg\w*|soar\w*|spik\w*|slump\w*|tumbl\w*|tank\w*|output|production|cuts?)\b|\b(crash|plung|plummet|surg|soar|spik|slump|tumbl)\w*\b.*\b(crude|brent|wti|oil)\b/i,
      md: /\b(crude|brent|wti|oil prices?|opec\+?|natural gas|lng|oil futures)\b/i },
    { id: 'metal', label: 'Gold / silver', watch: ['GOLDM', 'SILVERM', 'USDINR'],
      hi: /\b(gold|silver|bullion)\b.*\b(record|surg\w*|soar\w*|crash\w*|plung\w*|tumbl\w*|spik\w*)\b/i,
      md: /\b(gold|silver|bullion|xau|xag)\b/i },
    { id: 'fx',    label: 'Currency / yields', watch: ['USDINR', 'NIFTY 50'],
      hi: null,
      md: /\b(rupee|dollar index|dxy|treasury yields?|bond yields?|10-year yield|us dollar|dollar (falls|rises|slides|edges|jumps))\b/i },
    { id: 'mkt',   label: 'Market move', watch: ['NIFTY 50', 'NIFTY BANK'],
      hi: null,
      md: /\b(sensex|nifty|dow|nasdaq|s&p ?500|wall street|dalal street|kospi|nikkei|stocks?|markets?)\b.*\b(crash\w*|plung\w*|tumbl\w*|surg\w*|soar\w*|rall(y|ies|ied)|slump\w*|sink\w*|sinks|jump\w*|tank\w*|bloodbath|circuit)\b|\b(gap[\s\-\u2011]?(up|down)|lakh crore)\b/i },
    { id: 'flow',  label: 'India policy / flows', watch: ['NIFTY 50', 'NIFTY BANK'],
      hi: null,
      md: /\b(sebi|fii|fpi|dii|foreign (institutional|portfolio) investors?|fiscal deficit|disinvestment)\b/i },
    { id: 'co',    label: 'Company', watch: [],
      hi: null, lo: true,
      md: /\b(q[1-4]|results|earnings|profit|net income|dividend|ipo|stake|merger|acquisition|downgrade|upgrade|target price|block deal)\b/i }
];
function _nfBigMove(t) {
    // 5% or more, or 1,000+ index points: a move big enough to matter for the day
    var m = String(t).match(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{3,5}(?:\.\d+)?)\s*(?:points?|pts)\b/i);
    if (m && parseFloat(m[1].replace(/,/g, '')) >= 1000) return true;
    var p = String(t).match(/(\d{1,2}(?:\.\d+)?)\s?%/);
    return !!(p && parseFloat(p[1]) >= 5);
}
function _nfImpact(it) {
    if (it.imp && it.imp.v === 1) return it.imp;
    var t = it.title, cats = [], watch = [], level = 'NONE', hits = [], rank = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
    var big = _nfBigMove(t);
    _NF_RULES.forEach(function (r) {
        var m = r.hi && t.match(r.hi), lv = null;
        if (m) { lv = 'HIGH'; hits.push(m[0]); }
        else { m = r.md.exec(t); if (m) { lv = r.lo ? 'LOW' : 'MEDIUM'; hits.push(m[0]); } }
        if (lv === 'MEDIUM' && big && (r.id === 'oil' || r.id === 'metal' || r.id === 'mkt' || r.id === 'fx')) lv = 'HIGH';
        if (!lv) return;
        if (rank[lv] > rank[level]) level = lv;
        cats.push({ label: r.label, lv: lv });
        if (lv !== 'LOW') r.watch.forEach(function (w) { if (watch.indexOf(w) === -1) watch.push(w); });
    });
    cats.sort(function (a, b) { return rank[b.lv] - rank[a.lv]; });
    it.imp = { v: 1, level: level, cats: cats.filter(function (c) { return level === 'LOW' || c.lv !== 'LOW'; }).slice(0, 2).map(function (c) { return c.label; }), watch: watch.slice(0, 4), hits: hits.slice(0, 4) };
    return it.imp;
}

// ── Step 3: measured reaction since the headline ────────────────────────────────────────────────────────
// For HIGH / MEDIUM headlines published in the last 24 h, the move of each instrument it usually touches from the last completed 5-minute candle
// before the headline to the latest price. Read from the 5-minute candles of the last 4 days (the live candle cache answers today's part). If the
// market was closed when the headline came out the move includes the gap to the next open, and the tooltip says so. It is what happened, not a forecast,
// and other news moves prices too, so a move after a headline is not proof the headline caused it.
var _NFR = { candles: {}, at: 0, loading: false, noToken: {} };
function _nfCandleMs(s) { return typeof s === 'number' ? s : Date.parse(String(s).replace(/([+-]\d\d)(\d\d)$/, '$1:$2')); }
async function _nfReactEnsure(force) {
    if (_NFR.loading) return;
    if (!force && Date.now() - _NFR.at < 4 * 60 * 1000) return;
    var need = {}, now = Date.now();
    Object.keys(_NF.items).forEach(function (k) {
        var it = _NF.items[k]; if (now - it.t > 24 * 3600 * 1000) return;
        var im = _nfImpact(it); if (im.level !== 'HIGH' && im.level !== 'MEDIUM') return;
        im.watch.forEach(function (w) { need[w] = 1; });
    });
    try { _nfEvents().forEach(function (e) { if (e.t <= now && now - e.t <= 24 * 3600 * 1000) { var ei = _nfEvImpact(e); if (ei.ind !== 'LOW') ei.watch.forEach(function (w) { need[w] = 1; }); } }); } catch (e) {}
    var names = Object.keys(need); if (!names.length) return;
    if (typeof getHistoricalDataUsingPromise !== 'function' || typeof _gtbTokenForName !== 'function') return;
    _NFR.loading = true;
    var from = moment().subtract(4, 'days').format('YYYY-MM-DD'), to = moment().format('YYYY-MM-DD');
    await Promise.all(names.map(async function (nm) {
        try {
            var tok = _gtbTokenForName(nm);
            if (!tok) { _NFR.noToken[nm] = 1; return; }
            var res = await getHistoricalDataUsingPromise(tok, from, to, '5minute');
            var c = (res && res.data && res.data.candles) || [];
            if (c.length) _NFR.candles[nm] = c.map(function (x) { return [_nfCandleMs(x[0]), parseFloat(x[1]), parseFloat(x[2]), parseFloat(x[3]), parseFloat(x[4])]; }).filter(function (x) { return isFinite(x[0]) && isFinite(x[4]); });
        } catch (e) {}
    }));
    _NFR.at = Date.now(); _NFR.loading = false;
    _nfLogUpdate();
    _nfRender();
    try { if (typeof _fbRender === 'function') _fbRender(); } catch (e) {}
}
function _nfReaction(nm, t) {
    var c = _NFR.candles[nm];
    if (!c || !c.length) return _NFR.noToken[nm] ? { none: 'no price source for ' + nm } : null;
    var END = 5 * 60000, last = c[c.length - 1], p0 = null, p0end = 0;
    for (var i = c.length - 1; i >= 0; i--) { if (c[i][0] + END <= t) { p0 = c[i][4]; p0end = c[i][0] + END; break; } }
    if (p0 == null) return { none: 'no earlier trade in the loaded range' };
    if (last[0] + END <= t) return { pending: true, none: 'no trading since the headline yet' };
    return { pct: (last[4] / p0 - 1) * 100, p0: p0, p0end: p0end, now: last[4], nowAt: last[0] + END, gap: t - p0end > 90 * 60000 };
}
function _nfHm(ms) { return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function _nfReactChips(it, im) {
    if (im.level !== 'HIGH' && im.level !== 'MEDIUM') return '';
    if (Date.now() - it.t > 24 * 3600 * 1000 || !im.watch.length) return '';
    return im.watch.map(function (nm) {
        var r = _nfReaction(nm, it.t);
        if (!r) return '<span class="gtb-nf-chip" title="' + _nfEsc(nm + ': price not loaded yet') + '">' + _nfEsc(nm) + ' &hellip;</span>';
        if (r.none) return '<span class="gtb-nf-chip" title="' + _nfEsc(nm + ': ' + r.none) + '">' + _nfEsc(nm) + ' &ndash;</span>';
        var cls = Math.abs(r.pct) < 0.1 ? '' : r.pct > 0 ? ' up' : ' dn';
        var tip = nm + ' ' + r.p0.toFixed(2) + ' (close at ' + _nfHm(r.p0end) + ', before the headline) to ' + r.now.toFixed(2) + ' (latest, ' + _nfHm(r.nowAt) + ')'
            + (r.gap ? '. The market was closed when this came out, so this includes the gap to the next open.' : '') + '. What happened, not a forecast; other news also moves prices.';
        return '<span class="gtb-nf-chip' + cls + '" title="' + _nfEsc(tip) + '">' + _nfEsc(nm) + ' ' + (r.pct > 0 ? '+' : '') + r.pct.toFixed(2) + '%' + (r.gap ? ' <i class="bi bi-moon-fill"></i>' : '') + '</span>';
    }).join('');
}

// ── Tag outcome log (v29.505) ───────────────────────────────────────────────────────────────────────────
// For every HIGH / MED headline, how far each watched instrument had moved (in either direction) 30 and 60 minutes after the headline, kept in GTB_NEWS_LOG.
// Compared with how far the same instruments move in ANY 30 / 60 minutes (the average over the candles loaded), so "HIGH headlines are followed by bigger moves
// than usual" can be checked instead of assumed. Headlines published while the market was closed are left out (the opening gap would dominate). Absolute moves:
// this measures whether the tag picks out times when prices move, not whether it gets the direction right. A few days prove nothing.
function _nfPriceAt(c, ms) {      // close of the last candle that completed at or before ms, or null
    var END = 5 * 60000, p = null;
    for (var i = c.length - 1; i >= 0; i--) { if (c[i][0] + END <= ms) { p = c[i][4]; break; } }
    return p;
}
function _nfReactAt(nm, t, min) {
    var c = _NFR.candles[nm]; if (!c || !c.length) return null;
    var END = 5 * 60000, target = t + min * 60000;
    if (c[c.length - 1][0] + END < target) return null;           // not that far yet
    var p0 = null, p0end = 0;
    for (var i = c.length - 1; i >= 0; i--) { if (c[i][0] + END <= t) { p0 = c[i][4]; p0end = c[i][0] + END; break; } }
    if (p0 == null || t - p0end > 90 * 60000) return null;       // closed when it came out, or no earlier price
    var p1 = _nfPriceAt(c, target); if (p1 == null || p1 === p0) return p1 === p0 ? 0 : null;
    return (p1 / p0 - 1) * 100;
}
function _nfBase(nm, min) {
    var k = nm + '|' + min; _NFR.base = _NFR.base || {};
    var c = _NFR.candles[nm]; if (!c || c.length < 30) return null;
    var cached = _NFR.base[k]; if (cached && cached.n === c.length) return cached.v;
    var idx = {}; c.forEach(function (x, i) { idx[x[0]] = i; });
    var sum = 0, n = 0, step = min * 60000;
    c.forEach(function (x) { var j = idx[x[0] + step]; if (j != null) { sum += Math.abs(c[j][4] / x[4] - 1) * 100; n++; } });
    var v = n >= 20 ? sum / n : null; _NFR.base[k] = { n: c.length, v: v };
    return v;
}
function _nfLogLoad() { try { return JSON.parse(localStorage.getItem('GTB_NEWS_LOG') || '{}') || {}; } catch (e) { return {}; } }
function _nfLogUpdate() {
    try {
        var log = _nfLogLoad(), now = Date.now(), changed = false;
        Object.keys(_NF.items).forEach(function (k) {
            var it = _NF.items[k]; if (now - it.t > 24 * 3600 * 1000 || now - it.t < 30 * 60000) return;
            var im = _nfImpact(it); if (im.level !== 'HIGH' && im.level !== 'MEDIUM') return;
            var e = log[k] || (log[k] = { t: it.t, lv: im.level, cats: im.cats, obs: {} });
            im.watch.forEach(function (nm) {
                var o = e.obs[nm] || (e.obs[nm] = {});
                [30, 60].forEach(function (m) { if (o['m' + m] === undefined) { var r = _nfReactAt(nm, it.t, m); if (r !== null) { o['m' + m] = Math.round(r * 1000) / 1000; changed = true; } } });
            });
        });
        Object.keys(log).forEach(function (k) { if (now - log[k].t > 21 * 24 * 3600 * 1000) { delete log[k]; changed = true; } });
        if (changed) { var v = JSON.stringify(log); if (typeof _gtbLsSet === 'function') _gtbLsSet('GTB_NEWS_LOG', v); else localStorage.setItem('GTB_NEWS_LOG', v); }
    } catch (e) {}
}
function _nfLogHtml() {
    var log = _nfLogLoad(), agg = { HIGH: {}, MEDIUM: {} }, base = {};
    Object.keys(log).forEach(function (k) {
        var e = log[k], a = agg[e.lv]; if (!a) return;
        Object.keys(e.obs).forEach(function (nm) {
            [30, 60].forEach(function (m) {
                var v = e.obs[nm]['m' + m]; if (v === undefined) return;
                var b = _nfBase(nm, m); if (b == null) return;
                var s2 = a[m] || (a[m] = { n: 0, abs: 0, base: 0 }); s2.n++; s2.abs += Math.abs(v); s2.base += b;
            });
        });
    });
    var row = function (lv, label) {
        var cell = function (m) { var s2 = agg[lv][m]; if (!s2 || !s2.n) return '<td colspan="3" style="color:var(--gtb-muted);">no data yet</td>'; var av = s2.abs / s2.n, bs = s2.base / s2.n, r = av / bs; return '<td style="font-family:var(--gtb-mono);">' + av.toFixed(2) + '%</td><td style="font-family:var(--gtb-mono);color:var(--gtb-muted);">' + bs.toFixed(2) + '%</td><td style="font-weight:800;color:' + (r >= 1.3 ? 'var(--gtb-green)' : r <= 0.8 ? 'var(--gtb-red)' : 'var(--gtb-amber)') + ';">' + r.toFixed(1) + 'x <span style="font-weight:400;color:var(--gtb-muted);">(' + s2.n + ')</span></td>'; };
        return '<tr style="border-top:1px solid var(--gtb-border);"><td style="padding:3px 4px;font-weight:700;">' + label + '</td>' + cell(30) + cell(60) + '</tr>';
    };
    return '<div style="padding:10px;font-size:.62rem;">'
        + '<div style="font-weight:800;margin-bottom:6px;">Do the tags pick out busy times?</div>'
        + '<div style="color:var(--gtb-muted);font-size:.54rem;margin-bottom:6px;">Average size of the move (either direction) of the watched instruments 30 and 60 minutes after a tagged headline, against the normal size of a move over the same time. The ratio is the tag\'s move divided by the normal move; the count is headline-instrument pairs.</div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:.58rem;"><thead><tr style="color:var(--gtb-muted);font-size:.48rem;text-align:left;"><th></th><th colspan="3">AFTER 30 MIN (after / normal / ratio)</th><th colspan="3">AFTER 60 MIN</th></tr></thead><tbody>' + row('HIGH', 'HIGH') + row('MEDIUM', 'MED') + '</tbody></table>'
        + '<div style="color:var(--gtb-muted);font-size:.5rem;margin-top:8px;">Only headlines published while the market was open are counted. Headlines overlap (one event, many headlines), and other news moves prices too, so a ratio above 1 over a few days is a hint, not proof. Direction is not tested.</div>'
        + '<button id="gtb-nf-logback" class="gtb-nf-btn" style="margin-top:10px;">Back to headlines</button></div>';
}

// ── Telegram alerts for HIGH headlines (off by default) ──
function _nfTgOn() { try { return localStorage.getItem('GTB_NEWS_TG') === '1'; } catch (e) { return false; } }
function _nfTgSent() { try { return JSON.parse(localStorage.getItem('GTB_NEWS_TG_SENT') || '[]') || []; } catch (e) { return []; } }
function _nfTgMark(keys) { try { var a = _nfTgSent().concat(keys).slice(-500); localStorage.setItem('GTB_NEWS_TG_SENT', JSON.stringify(a)); } catch (e) {} }
function _nfTgEsc(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
async function _nfTgCheck() {
    if (!_nfTgOn()) return;
    var sent = {}; _nfTgSent().forEach(function (k) { sent[k] = 1; });
    var now = Date.now(), fresh = [];
    Object.keys(_NF.items).forEach(function (k) {
        var it = _NF.items[k]; if (sent[k] || now - it.t > 60 * 60000) return;
        if (_nfImpact(it).level === 'HIGH') fresh.push({ k: k, it: it });
    });
    if (!fresh.length) return;
    fresh.sort(function (a, b) { return b.it.t - a.it.t; });
    _nfTgMark(fresh.map(function (f) { return f.k; }));
    var token = (typeof g_config !== 'undefined' ? g_config.get('telegram_bot_token') : '') || '', chatId = (typeof g_config !== 'undefined' ? g_config.get('telegram_chat_id') : '') || '';
    if (!token || !chatId || typeof _psTelegramSendOne !== 'function') { try { _gtbToast('News Telegram alert: set the Telegram bot token and chat id in Settings.', 'error'); } catch (e) {} return; }
    var top = fresh.slice(0, 5);
    var text = '<b>HIGH impact news</b>\n' + top.map(function (f) {
        var im = _nfImpact(f.it);
        return '\n' + _nfTgEsc(f.it.title) + '\n' + _nfTgEsc(f.it.src) + ' &middot; ' + _nfAgo(f.it.t) + (im.cats.length ? ' &middot; ' + _nfTgEsc(im.cats.join(' / ')) : '') + (im.watch.length ? '\nWatch: ' + _nfTgEsc(im.watch.join(', ')) : '') + '\n<a href="' + _nfTgEsc(f.it.link) + '">link</a>';
    }).join('\n') + (fresh.length > top.length ? '\n\n+' + (fresh.length - top.length) + ' more in the News panel' : '') + '\n\nKeyword tag, a rule of thumb: it says what to watch, not up or down.';
    try { await _psTelegramSendOne(token, chatId, text); } catch (e) { try { _gtbToast('News Telegram alert failed: ' + e, 'error'); } catch (e2) {} }
}

// ── Upcoming events (v29.507) ───────────────────────────────────────────────────────────────────────────
// A separate "Upcoming" view: what is scheduled, so a policy decision or a vote is not a surprise. Three sources, all shown in IST:
//   1. An economic calendar feed (Forex Factory weekly JSON, the current week only): central-bank decisions, US jobs and inflation data, elections.
//      It covers the US, euro area, UK, Japan, China, Australia, NZ, Canada and Switzerland; it has NO India events. High and Medium impact only.
//   2. A built-in list of dates that are published in advance and that matter most here (_NF_SCHEDULE): RBI policy decisions and the Fed decision.
//   3. Events you add yourself (GTB_NEWS_EVENTS): an election, a budget, a result date, anything.
// A HIGH event gives a toast and a beep 15 minutes before it (and a Telegram message when the Telegram button is on). Nothing here is a forecast.
var _NF_CAL_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
var _NF_CC = { USD: 'US', EUR: 'Euro area', GBP: 'UK', JPY: 'Japan', CNY: 'China', AUD: 'Australia', NZD: 'New Zealand', CAD: 'Canada', CHF: 'Switzerland' };
// Dates taken from the issuers' own published calendars (RBI MPC schedule for FY2026-27; Fed FOMC 2026 calendar, which the Fed calls tentative until confirmed).
var _NF_SCHEDULE = [
    { t: Date.parse('2026-12-04T10:00:00+05:30'), title: 'RBI Monetary Policy Committee decision', country: 'India', impact: 'HIGH', note: 'MPC meets 2-4 Dec; the repo rate decision is announced on the last day (RBI FY27 calendar).' },
    { t: Date.parse('2027-02-05T10:00:00+05:30'), title: 'RBI Monetary Policy Committee decision', country: 'India', impact: 'HIGH', note: 'MPC meets 3-5 Feb 2027 (RBI FY27 calendar).' },
    { t: Date.parse('2026-12-09T14:00:00-05:00'), title: 'US Fed (FOMC) rate decision', country: 'US', impact: 'HIGH', note: 'FOMC meets 8-9 Dec with projections and the dot plot. The Fed keeps meeting dates tentative until confirmed.' }
];
var _NF_CAL = { events: [], at: 0 };
try { var _c0 = JSON.parse(localStorage.getItem('GTB_NEWS_CAL') || 'null'); if (_c0 && _c0.events) _NF_CAL = _c0; } catch (e) {}
_NF.evLv = { HIGH: 1, MEDIUM: 1 }; _NF.evRegion = ''; _NF.evForm = false; _NF.evOpen = {};
try { _NF.evIndia = localStorage.getItem('GTB_NEWS_EV_INDIA') !== '0'; } catch (e) { _NF.evIndia = true; }

function _nfManual() { try { return JSON.parse(localStorage.getItem('GTB_NEWS_EVENTS') || '[]') || []; } catch (e) { return []; } }
function _nfManualSave(a) { try { localStorage.setItem('GTB_NEWS_EVENTS', JSON.stringify(a)); } catch (e) {} }

var _NF_CAL_TRY = 0;
function _nfCalRefresh(force) {
    if (!force && Date.now() - (_NF_CAL.at || 0) < 55 * 60000) return;
    try { var lt = parseInt(localStorage.getItem('GTB_NEWS_CAL_TRY') || '0', 10) || 0; if (lt > _NF_CAL_TRY) _NF_CAL_TRY = lt; } catch (e) {}
    if (Date.now() - _NF_CAL_TRY < 15 * 60000) return;            // the feed answers HTTP 429 when asked too often
    _NF_CAL_TRY = Date.now(); try { localStorage.setItem('GTB_NEWS_CAL_TRY', String(_NF_CAL_TRY)); } catch (e) {}
    if (typeof GM_xmlhttpRequest === 'undefined') return;
    GM_xmlhttpRequest({
        method: 'GET', url: _NF_CAL_URL, timeout: 20000,
        onload: function (res) {
            try {
                if (res.status === 429) throw new Error('rate limited by the calendar host (HTTP 429); it will retry in 15 minutes');
                if (res.status < 200 || res.status >= 300) throw new Error('HTTP ' + res.status);
                var arr; try { arr = JSON.parse(res.responseText); } catch (pe) { throw new Error('the calendar host returned a page instead of data (usually a rate limit)'); }
                if (!Array.isArray(arr) || !arr.length) throw new Error('no events in the feed');
                var ev = [];
                arr.forEach(function (e) {
                    var imp = e.impact === 'High' ? 'HIGH' : e.impact === 'Medium' ? 'MEDIUM' : null, t = Date.parse(e.date);
                    if (!imp || !isFinite(t)) return;
                    ev.push({ id: 'cal|' + e.country + '|' + e.title + '|' + e.date, t: t, title: e.title, country: _NF_CC[e.country] || e.country, impact: imp, forecast: e.forecast || '', previous: e.previous || '', src: 'calendar' });
                });
                _NF_CAL = { events: ev, at: Date.now() };
                try { localStorage.setItem('GTB_NEWS_CAL', JSON.stringify(_NF_CAL)); } catch (e2) {}
                try { _gtbApiOk('news-calendar'); } catch (e2) {}
                _nfRender();
            } catch (er) { try { _gtbApiFail('news-calendar', 'News: economic calendar', er.message || String(er), 'Upcoming data events (jobs, inflation, central banks) are not updated; RBI / Fed dates and your own events still show.'); } catch (e2) {} }
        },
        onerror: function () { try { _gtbApiFail('news-calendar', 'News: economic calendar', 'network error', 'Upcoming data events are not updated.'); } catch (e2) {} },
        ontimeout: function () { try { _gtbApiFail('news-calendar', 'News: economic calendar', 'timed out', 'Upcoming data events are not updated.'); } catch (e2) {} }
    });
}
function _nfEvents() {
    var now = Date.now(), all = [];
    _NF_CAL.events.forEach(function (e) { all.push(e); });
    _NF_SCHEDULE.forEach(function (e, i) { all.push({ id: 'sch|' + i + '|' + e.t, t: e.t, title: e.title, country: e.country, impact: e.impact, note: e.note, src: 'schedule' }); });
    _nfManual().forEach(function (e) { all.push({ id: e.id, t: e.t, title: e.title, country: e.country || 'Mine', impact: e.impact || 'MEDIUM', note: e.note || '', src: 'manual' }); });
    return all.filter(function (e) { return e.t >= now - 3 * 3600000 && e.t <= now + 150 * 86400000; }).sort(function (a, b) { return a.t - b.t; });
}
function _nfIn(ms) {
    var d = ms - Date.now(), a = Math.abs(d), m = Math.round(a / 60000), txt;
    if (m < 60) txt = m + ' min'; else if (m < 48 * 60) txt = Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : ''); else txt = Math.round(m / 1440) + ' days';
    return d >= 0 ? 'in ' + txt : txt.trim() + ' ago';
}
function _nfIst(ms, opts) { return new Date(ms).toLocaleString('en-IN', Object.assign({ timeZone: 'Asia/Kolkata' }, opts)); }
function _nfDayLabel(ms) {
    var d = _nfIst(ms, { day: '2-digit', month: 'short', year: 'numeric' }), today = _nfIst(Date.now(), { day: '2-digit', month: 'short', year: 'numeric' }), tom = _nfIst(Date.now() + 86400000, { day: '2-digit', month: 'short', year: 'numeric' });
    var wd = _nfIst(ms, { weekday: 'short' });
    return (d === today ? 'Today' : d === tom ? 'Tomorrow' : wd) + ' · ' + _nfIst(ms, { day: '2-digit', month: 'short' });
}
function _nfEventsHtml() {
    var evs = _nfEvents().filter(function (e) { return _NF.evLv[e.impact] && (!_NF.evRegion || e.country === _NF.evRegion) && (!_NF.evIndia || _nfEvImpact(e).ind !== 'LOW'); });
    var regions = {}; _nfEvents().forEach(function (e) { regions[e.country] = 1; });
    var head = '<div class="gtb-nf-evbar"><span class="gtb-nf-lvl">Impact</span>'
        + ['HIGH', 'MEDIUM'].map(function (k) { return '<button class="gtb-nf-evlv ' + k.toLowerCase() + (_NF.evLv[k] ? ' on' : '') + '" data-lv="' + k + '">' + (k === 'MEDIUM' ? 'MED' : k) + '</button>'; }).join('')
        + '<select id="gtb-nf-evreg" class="gtb-nf-sel"><option value="">All regions</option>' + Object.keys(regions).sort().map(function (r) { return '<option value="' + _nfEsc(r) + '"' + (_NF.evRegion === r ? ' selected' : '') + '>' + _nfEsc(r) + '</option>'; }).join('') + '</select>'
        + '<label class="gtb-nf-evchk" title="Hide events that have little direct link to Indian markets (for example Canadian or Australian data)"><input type="checkbox" id="gtb-nf-evindia"' + (_NF.evIndia ? ' checked' : '') + '> hide low India impact</label>'
        + '<button id="gtb-nf-evadd" class="gtb-nf-btn">+ Add event</button></div>';
    var form = '';
    if (_NF.evForm) {
        var dflt = new Date(Date.now() + 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        form = '<div class="gtb-nf-evform"><input id="gtb-nf-evtitle" type="text" placeholder="Event, e.g. Bihar election result" autocomplete="off">'
            + '<div><input id="gtb-nf-evwhen" type="datetime-local" value="' + dflt + '"><select id="gtb-nf-evimp" class="gtb-nf-sel"><option value="HIGH">HIGH</option><option value="MEDIUM" selected>MED</option></select></div>'
            + '<input id="gtb-nf-evnote" type="text" placeholder="Note (optional)" autocomplete="off">'
            + '<div><button id="gtb-nf-evsave" class="gtb-nf-btn">Save event</button> <span class="gtb-nf-evhint">Time is read in this computer\'s time zone and shown in IST.</span></div></div>';
    }
    var out = '', lastDay = '';
    evs.forEach(function (e) {
        var day = _nfDayLabel(e.t);
        if (day !== lastDay) { out += '<div class="gtb-nf-evday">' + _nfEsc(day) + '</div>'; lastDay = day; }
        var past = e.t < Date.now(), soon = !past && e.t - Date.now() <= 15 * 60000;
        var ei = _nfEvImpact(e), open = !!_NF.evOpen[e.id];
        var chips = past && Date.now() - e.t <= 24 * 3600 * 1000 && ei.ind !== 'LOW' ? _nfReactChips({ t: e.t }, { level: 'HIGH', watch: ei.watch }) : '';
        out += '<div class="gtb-nf-ev' + (past ? ' past' : '') + (e.impact === 'HIGH' ? ' hi' : '') + '" data-id="' + _nfEsc(e.id) + '">'
            + '<div class="gtb-nf-evt">' + _nfEsc(_nfIst(e.t, { hour: '2-digit', minute: '2-digit', hour12: false })) + '</div>'
            + '<div class="gtb-nf-evb"><div><span class="gtb-nf-lv ' + e.impact.toLowerCase() + '">' + (e.impact === 'MEDIUM' ? 'MED' : e.impact) + '</span> <span class="gtb-nf-chip">' + _nfEsc(e.country) + '</span> <b>' + _nfEsc(e.title) + '</b></div>'
            + '<div class="gtb-nf-meta"><span' + (soon ? ' class="gtb-nf-hit"' : '') + '>' + _nfIn(e.t) + '</span>'
            + (e.forecast ? ' &middot; forecast ' + _nfEsc(e.forecast) : '') + (e.previous ? ' &middot; previous ' + _nfEsc(e.previous) : '')
            + (e.src === 'manual' ? ' &middot; yours <a class="gtb-nf-evdel" data-id="' + _nfEsc(e.id) + '" href="#" title="Delete this event">delete</a>' : '')
            + (e.note ? '<div>' + _nfEsc(e.note) + '</div>' : '') + '</div>'
            + '<div class="gtb-nf-ind"><span class="gtb-nf-lv ' + ei.ind.toLowerCase() + '" title="How much this event usually matters to Indian markets. A rule of thumb by event type, not a prediction.">INDIA ' + (ei.ind === 'MEDIUM' ? 'MED' : ei.ind) + '</span> <span class="gtb-nf-indwhy">' + _nfEsc(ei.why) + '</span></div>'
            + (ei.ind !== 'LOW' ? _nfVerdictHtml(e, ei) : '')
            + (open ? '<div class="gtb-nf-scen">'
                + (ei.up ? '<div><b class="gtb-nf-up">Stronger / more hawkish than expected:</b> ' + _nfEsc(ei.up) + '</div>' : '')
                + (ei.down ? '<div><b class="gtb-nf-dn">Weaker / more dovish than expected:</b> ' + _nfEsc(ei.down) + '</div>' : '')
                + '<div class="gtb-nf-evhint">' + _nfEsc(_nfEvWhen(e.t)) + (ei.watch.length ? ' Watch: ' + _nfEsc(ei.watch.join(', ')) + '.' : '') + ' General macro reasoning, not a prediction: what moves prices is the surprise against the forecast, and other news arrives at the same time.</div></div>' : '')
            + (chips ? '<div class="gtb-nf-imp">' + chips + '</div>' : '')
            + '<a href="#" class="gtb-nf-evmore" data-id="' + _nfEsc(e.id) + '">' + (open ? 'less' : 'what it can mean for India') + '</a></div></div>';
    });
    if (!out) out = '<div class="gtb-nf-empty">' + (_NF_CAL.at ? 'No upcoming events match these filters.' : 'Loading the economic calendar&hellip;') + '</div>';
    var foot = '<div class="gtb-nf-evfoot">Calendar: ' + (_NF_CAL.at ? 'updated ' + _nfHm(_NF_CAL.at) : 'not loaded') + ' (this week only, US / euro area / UK / Japan / China and others; no India events). RBI and Fed decision dates come from their published calendars. Add anything else (elections, budget, results) with + Add event. A HIGH event gives an alert 15 minutes before it.</div>';
    return head + form + '<div class="gtb-nf-evlist">' + out + '</div>' + foot;
}
function _nfNextStrip() {
    var now = Date.now(), n = _nfEvents().filter(function (e) { return e.impact === 'HIGH' && e.t > now && e.t - now <= 48 * 3600000; })[0];
    if (!n) return '';
    return '<div id="gtb-nf-nextbar" class="gtb-nf-next" title="Open the Upcoming view"><i class="bi bi-calendar-event"></i> Next HIGH: <b>' + _nfEsc(n.title) + '</b> (' + _nfEsc(n.country) + ') ' + _nfEsc(_nfDayLabel(n.t).split(' · ')[0]) + ' ' + _nfEsc(_nfIst(n.t, { hour: '2-digit', minute: '2-digit', hour12: false })) + ' IST, ' + _nfIn(n.t) + '</div>';
}
function _nfEvAlertTick() {
    try {
        var now = Date.now(), done = []; try { done = JSON.parse(localStorage.getItem('GTB_NEWS_EV_ALERTED') || '[]') || []; } catch (e) {}
        var fire = _nfEvents().filter(function (e) { return e.impact === 'HIGH' && e.t > now && e.t - now <= 15 * 60000 && done.indexOf(e.id) === -1; });
        if (!fire.length) return;
        done = done.concat(fire.map(function (e) { return e.id; })).slice(-300);
        try { localStorage.setItem('GTB_NEWS_EV_ALERTED', JSON.stringify(done)); } catch (e) {}
        fire.forEach(function (e) { try { _gtbToast('In ' + Math.max(1, Math.round((e.t - now) / 60000)) + ' min: ' + e.title + ' (' + e.country + ')', 'info'); } catch (er) {} });
        try { if (typeof _gtbSqzBeepBurst === 'function') _gtbSqzBeepBurst(); } catch (e) {}
        if (_nfTgOn()) {
            var token = (typeof g_config !== 'undefined' ? g_config.get('telegram_bot_token') : '') || '', chatId = (typeof g_config !== 'undefined' ? g_config.get('telegram_chat_id') : '') || '';
            if (token && chatId && typeof _psTelegramSendOne === 'function') _psTelegramSendOne(token, chatId, '<b>HIGH impact event soon</b>\n' + fire.map(function (e) { return _nfTgEsc(e.title) + ' (' + _nfTgEsc(e.country) + ') ' + _nfIst(e.t, { hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST, ' + _nfIn(e.t); }).join('\n')).catch(function () {});
        }
    } catch (e) {}
}

// ── India impact of each upcoming event (v29.508) ───────────────────────────────────────────────────────
// For each event: how much it usually matters to the Indian market (HIGH / MED / LOW), why, which instruments to watch, and the usual reading if the
// result comes out stronger / more hawkish than expected versus weaker / more dovish. This is general macro reasoning written as rules from the event type;
// it is NOT a prediction: what moves the market is the surprise against what was expected, and other news arrives at the same time. The first matching rule wins.
var _NF_EVRULES = [
    { id: 'rbi', test: function (t, c) { return /\b(rbi|reserve bank of india)\b/i.test(t) && /(monetary policy|mpc|repo|rate)/i.test(t); }, ind: 'HIGH',
      why: 'India\'s own rate decision. It sets borrowing costs, bank margins and the rupee; the stance and guidance matter as much as the rate.',
      up: 'Higher rate than expected or a hawkish stance: pressure on rate-sensitive stocks (banks, NBFCs, realty, autos); the rupee can firm.',
      down: 'A rate cut or a dovish stance: supportive for banks, NBFCs, realty and autos; the rupee can soften.', watch: ['NIFTY BANK', 'NIFTY 50', 'USDINR'] },
    { id: 'fed', test: function (t, c) { return /(fomc|federal funds rate|\bfed (funds|rate|decision)|us fed)/i.test(t); }, ind: 'HIGH',
      why: 'The Fed sets US yields and the dollar, which drive foreign investor flows into India, the rupee, IT stocks and gold.',
      up: 'More hawkish than expected (higher rate, fewer cuts): dollar and US yields up, foreign selling and rupee weakness are likely, pressure on NIFTY and rate-sensitive stocks, gold usually softer.',
      down: 'More dovish than expected (cut, or more cuts signalled): dollar and yields down, foreign inflows and a firmer rupee are likely, supportive for NIFTY, gold usually firmer.', watch: ['NIFTY 50', 'NIFTY BANK', 'USDINR', 'GOLDM'] },
    { id: 'jobs', test: function (t, c) { return c === 'US' && /(non-?farm|nfp|employment change|unemployment rate|average hourly earnings|adp)/i.test(t); }, ind: 'HIGH',
      why: 'US jobs data moves the market\'s view of Fed rate cuts, so it moves US yields and the dollar, and with them foreign flows into India and the rupee.',
      up: 'Stronger jobs and wages than expected: fewer Fed cuts priced, dollar and yields up, pressure on the rupee and foreign flows, gold softer.',
      down: 'Weaker jobs than expected: more Fed cuts priced, dollar and yields down, supportive for flows and the rupee (a very weak number can also raise recession worries).', watch: ['NIFTY 50', 'USDINR', 'GOLDM'] },
    { id: 'usinfl', test: function (t, c) { return c === 'US' && /\b(cpi|core cpi|ppi|pce|core pce)\b/i.test(t); }, ind: 'HIGH',
      why: 'US inflation decides how fast the Fed can cut, so it moves US yields, the dollar and foreign flows into India.',
      up: 'Hotter than expected: fewer cuts, higher yields and dollar, pressure on NIFTY and the rupee, gold softer.',
      down: 'Cooler than expected: more cuts, lower yields and dollar, supportive for NIFTY and the rupee, gold firmer.', watch: ['NIFTY 50', 'USDINR', 'GOLDM'] },
    { id: 'boj', test: function (t, c) { return /(\bboj\b|bank of japan)/i.test(t) && /(rate|policy|statement|press|ueda|speaks)/i.test(t); }, ind: 'MEDIUM',
      why: 'The yen is a funding currency: a hawkish BOJ can unwind carry trades and hit global risk assets, including Indian stocks.',
      up: 'Hawkish (rate rise, faster tightening): stronger yen, risk-off in global equities, a risk for foreign flows into India.',
      down: 'Dovish (no change, slower tightening): carry trades stay in place, little effect on India.', watch: ['NIFTY 50', 'USDINR'] },
    { id: 'cb', test: function (t, c) { return c !== 'Australia' && c !== 'New Zealand' && c !== 'Canada' && c !== 'Switzerland' && /(\becb\b|\bboe\b|official bank rate|bank rate|main refinancing|monetary policy (report|summary)|mpc official)/i.test(t) && !/speaks/i.test(t); }, ind: 'MEDIUM',
      why: 'A rate decision by a major central bank moves its currency and global yields. The direct link to India is smaller than the Fed\'s, but it shifts global risk appetite.',
      up: 'A hike or hawkish tone: stronger local currency, firmer global yields, mild pressure on risk assets.',
      down: 'A cut or dovish tone: weaker local currency, softer yields, mildly supportive for risk assets.', watch: ['NIFTY 50', 'USDINR'] },
    { id: 'speech', test: function (t, c) { return /(speaks|testifies|press conference)/i.test(t) && /(fed|powell|fomc|lagarde|ecb|bailey|boe|ueda|boj)/i.test(t); }, ind: 'MEDIUM',
      why: 'A central bank head\'s tone can reprice rate expectations, especially at a press conference. The risk is a surprise in wording, not the event itself.',
      up: 'More hawkish than expected: yields and the local currency up, risk assets pressured.', down: 'More dovish than expected: yields and the local currency down, risk assets supported.', watch: ['NIFTY 50', 'USDINR'] },
    { id: 'elec', test: function (t, c) { return /election/i.test(t) && (c === '' || c === 'US' || c === 'India' || c === 'China' || c === 'UK' || c === 'Euro area'); }, ind: 'MEDIUM',
      why: 'Election results change expectations on trade policy, tariffs, taxes and spending, and so risk sentiment, the dollar and sectors like IT, pharma and metals.',
      up: 'A result the market reads as pro-growth or lower-uncertainty: usually supportive for risk assets.', down: 'A result that raises policy uncertainty (tariffs, sanctions, instability): usually risk-off.', watch: ['NIFTY 50', 'USDINR', 'GOLDM', 'CRUDEOILM'] },
    { id: 'oil', test: function (t, c) { return /(crude oil inventories|\beia\b|opec|oil)/i.test(t); }, ind: 'MEDIUM',
      why: 'India imports most of its oil: crude moves the import bill, the rupee, inflation and oil marketing, aviation and paint stocks.',
      up: 'Crude up (a larger draw, supply cuts): negative for India\'s import bill and the rupee, OMCs, aviation and paints under pressure; crude-linked MCX up.',
      down: 'Crude down (a larger build, more supply): positive for India, OMCs, aviation and paints supported; crude-linked MCX down.', watch: ['CRUDEOILM', 'USDINR', 'NIFTY 50'] },
    { id: 'china', test: function (t, c) { return c === 'China' && /(gdp|pmi|cpi|ppi|trade balance|industrial|retail|caixin|loan|pboc|rate)/i.test(t); }, ind: 'MEDIUM',
      why: 'China is the main driver of global metals and commodity demand and of emerging-market sentiment; a weak China can push foreign money toward India, a strong China can pull it away.',
      up: 'Stronger than expected: metals and commodities firmer, metal stocks supported; some foreign money may rotate toward China.', down: 'Weaker than expected: metals softer, metal stocks pressured; relative flows can favour India.', watch: ['NIFTY 50', 'SILVERM'] },
    { id: 'usgdp', test: function (t, c) { return c === 'US' && /(gdp|ism|retail sales|consumer confidence|jolts|unemployment claims|jobless claims|durable|housing|trade balance|treasury|auction)/i.test(t); }, ind: 'MEDIUM',
      why: 'US growth data feeds the Fed outlook, US yields and the dollar, but a single release rarely moves India on its own.',
      up: 'Stronger than expected: fewer rate cuts priced, firmer dollar and yields, mild pressure on the rupee and flows.', down: 'Weaker than expected: more cuts priced, softer dollar and yields, mildly supportive for flows.', watch: ['NIFTY 50', 'USDINR'] },
    { id: 'incpi', test: function (t, c) { return (c === 'India' || /\bindia\b/i.test(t)) && /(cpi|inflation|wpi)/i.test(t); }, ind: 'HIGH',
      why: 'India\'s inflation decides how much room the RBI has to cut rates, so it moves rate-sensitive stocks and bond yields.',
      up: 'Hotter than expected: fewer RBI cuts likely, pressure on banks, NBFCs, realty and autos.', down: 'Cooler than expected: more room for RBI cuts, supportive for rate-sensitive stocks.', watch: ['NIFTY BANK', 'NIFTY 50', 'USDINR'] },
    { id: 'ingdp', test: function (t, c) { return (c === 'India' || /\bindia\b/i.test(t)) && /(gdp|iip|industrial production|pmi|gst|core sector|trade deficit|exports)/i.test(t); }, ind: 'MEDIUM',
      why: 'Indian growth data shows how the economy and corporate earnings are tracking.',
      up: 'Stronger than expected: supportive for earnings and the market.', down: 'Weaker than expected: raises earnings and growth worries.', watch: ['NIFTY 50', 'NIFTY BANK'] },
    { id: 'inbudget', test: function (t, c) { return /(union budget|india.*budget|budget.*india|interim budget)/i.test(t) || (c === 'India' && /budget/i.test(t)); }, ind: 'HIGH',
      why: 'The Budget sets taxes (including on market gains), government borrowing and capital spending, and so affects banks, infrastructure, defence, consumption and the market overall.',
      up: 'Fiscal discipline with a capital spending push and no new market taxes: read as pro-growth.', down: 'Higher borrowing, or tax hikes on market gains (such as STT or capital gains): negative for the market.', watch: ['NIFTY 50', 'NIFTY BANK', 'USDINR'] },
    { id: 'ginfl', test: function (t, c) { return (c === 'Euro area' || c === 'UK' || c === 'Japan') && /\b(cpi|ppi|inflation)\b/i.test(t); }, ind: 'MEDIUM',
      why: 'Inflation there decides how hawkish that central bank stays, which moves global yields and risk appetite. The direct link to India is mild.',
      up: 'Hotter than expected: a more hawkish central bank, firmer yields, a mild weight on risk assets.', down: 'Cooler than expected: a softer central bank, easier yields, mildly supportive.', watch: ['NIFTY 50', 'USDINR'] },
    { id: 'ggrowth', test: function (t, c) { return (c === 'Euro area' || c === 'UK' || c === 'Japan') && /(gdp|pmi|retail sales|employment|unemployment|trade balance|industrial production)/i.test(t); }, ind: 'MEDIUM',
      why: 'Growth data from a major economy shifts global risk appetite and demand for exports. The direct link to India is mild.',
      up: 'Stronger than expected: better global growth outlook, mildly supportive for risk assets.', down: 'Weaker than expected: weaker global growth outlook, a mild weight on risk assets.', watch: ['NIFTY 50'] },
    { id: 'in', test: function (t, c) { return c === 'India'; }, ind: 'HIGH',
      why: 'An Indian event: it affects the Indian market directly.', up: '', down: '', watch: ['NIFTY 50', 'NIFTY BANK', 'USDINR'] }
];
function _nfEvImpact(e) {
    if (e.src === 'manual') {
        // your own event keeps the impact you gave it; if its title matches a known event type (for example "India CPI" or "Union Budget") it also gets that type's verdict
        for (var j = 0; j < _NF_EVRULES.length; j++) { var rr = _NF_EVRULES[j]; if (rr.id === 'in') continue; try { if (rr.test(e.title, e.country === 'Mine' ? '' : e.country)) return { ind: e.impact === 'HIGH' ? 'HIGH' : 'MEDIUM', why: e.note || rr.why, up: rr.up, down: rr.down, watch: rr.watch, rule: rr.id, own: true }; } catch (er) {} }
        return { ind: e.impact === 'HIGH' ? 'HIGH' : 'MEDIUM', why: e.note || 'Your event.', up: '', down: '', watch: ['NIFTY 50', 'NIFTY BANK'], own: true };
    }
    for (var i = 0; i < _NF_EVRULES.length; i++) { var r = _NF_EVRULES[i]; try { if (r.test(e.title, e.country)) return { ind: r.ind, why: r.why, up: r.up, down: r.down, watch: r.watch, rule: r.id }; } catch (er) {} }
    return { ind: 'LOW', why: 'Little direct link to India; it moves the local currency and local assets more than Indian markets.', up: '', down: '', watch: [], rule: 'low' };
}
function _nfEvWhen(t) {
    var d = new Date(t + 19800000), wd = d.getUTCDay(), mins = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (wd === 0 || wd === 6) return 'Weekend: Indian markets react at Monday\'s open (GIFT Nifty trades earlier).';
    if (mins >= 555 && mins <= 930) return 'During NSE hours: the market can react straight away.';
    if (mins < 555) return 'Before the NSE open: shows at the open (GIFT Nifty trades earlier).';
    return 'After the NSE close' + (mins <= 1435 ? ' (MCX is still trading)' : '') + ': Indian shares react at the next open (GIFT Nifty trades earlier).';
}

// ── Verdict for the Indian market (v29.511) ────────────────────────────────────────────────────────────
// Per event type: what the usual reading is for NIFTY, BANK NIFTY, the rupee, gold and crude if the result lands on the "strong" side (S: higher data where higher
// means stronger, a hawkish decision, a crude-positive surprise) and on the "weak" side (W). Arrows give the usual direction of the move; mild = a weaker, less
// reliable link. The strong side is the HIGHER number for most data, but the LOWER number for unemployment and jobless claims and for oil inventories (a build is
// crude-negative), see _nfSHigh. It is general macro reasoning by event type, not a prediction and not tested: what moves prices is the surprise against the
// forecast, and an in-line result usually moves little.
var _NF_VERDICTS = {
    rbi:    { sLabel: 'More hawkish than expected (higher rate or tougher guidance)', wLabel: 'More dovish than expected (cut or softer guidance)', numeric: false,
              S: { v: 'NEGATIVE', m: [['NIFTY 50', -1], ['NIFTY BANK', -1], ['Rupee', 1]], tx: 'Rate-sensitive stocks (banks, NBFCs, realty, autos) come under pressure; the rupee tends to firm.' },
              W: { v: 'POSITIVE', m: [['NIFTY 50', 1], ['NIFTY BANK', 1], ['Rupee', -1]], tx: 'Banks, NBFCs, realty and autos tend to be supported; the rupee tends to soften.' } },
    fed:    { sLabel: 'More hawkish than expected (higher rate or fewer cuts)', wLabel: 'More dovish than expected (cut or more cuts signalled)', numeric: false,
              S: { v: 'NEGATIVE', m: [['NIFTY 50', -1], ['NIFTY BANK', -1], ['Rupee', -1], ['GOLDM', -1]], tx: 'Dollar and US yields rise, foreign investors tend to sell Indian shares, the rupee weakens.' },
              W: { v: 'POSITIVE', m: [['NIFTY 50', 1], ['NIFTY BANK', 1], ['Rupee', 1], ['GOLDM', 1]], tx: 'Dollar and US yields fall, foreign money tends to come in, the rupee firms.' } },
    jobs:   { numeric: true, sStrong: 'Stronger', wStrong: 'Weaker',
              S: { v: 'NEGATIVE', m: [['NIFTY 50', -1], ['NIFTY BANK', -1], ['Rupee', -1], ['GOLDM', -1]], tx: 'Fewer Fed cuts priced: dollar and yields up, foreign flows and the rupee under pressure.' },
              W: { v: 'POSITIVE', m: [['NIFTY 50', 1], ['NIFTY BANK', 1], ['Rupee', 1], ['GOLDM', 1]], tx: 'More Fed cuts priced: dollar and yields down, supportive for flows and the rupee. A very weak number can raise recession worries and turn this around.' } },
    usinfl: { numeric: true, sStrong: 'Hotter', wStrong: 'Cooler',
              S: { v: 'NEGATIVE', m: [['NIFTY 50', -1], ['NIFTY BANK', -1], ['Rupee', -1], ['GOLDM', -1]], tx: 'Fewer Fed cuts priced: dollar and yields up, pressure on NIFTY and the rupee.' },
              W: { v: 'POSITIVE', m: [['NIFTY 50', 1], ['NIFTY BANK', 1], ['Rupee', 1], ['GOLDM', 1]], tx: 'More Fed cuts priced: dollar and yields down, supportive for NIFTY and the rupee.' } },
    boj:    { sLabel: 'More hawkish than expected (rate rise, faster tightening)', wLabel: 'More dovish than expected (no change, slower tightening)', numeric: false,
              S: { v: 'NEGATIVE', mild: true, m: [['NIFTY 50', -1], ['Rupee', -1]], tx: 'A stronger yen can unwind carry trades and hit global risk assets, including Indian shares.' },
              W: { v: 'LITTLE', m: [], tx: 'Carry trades stay in place; little effect on India.' } },
    cb:     { sLabel: 'More hawkish than expected (hike or tougher tone)', wLabel: 'More dovish than expected (cut or softer tone)', numeric: false,
              S: { v: 'NEGATIVE', mild: true, m: [['NIFTY 50', -1]], tx: 'Firmer global yields; a mild weight on risk assets.' },
              W: { v: 'POSITIVE', mild: true, m: [['NIFTY 50', 1]], tx: 'Softer global yields; mildly supportive for risk assets.' } },
    speech: { sLabel: 'More hawkish tone than expected', wLabel: 'More dovish tone than expected', numeric: false,
              S: { v: 'NEGATIVE', mild: true, m: [['NIFTY 50', -1], ['Rupee', -1]], tx: 'Rate expectations move up: yields and the dollar firm, risk assets are pressured.' },
              W: { v: 'POSITIVE', mild: true, m: [['NIFTY 50', 1], ['Rupee', 1]], tx: 'Rate expectations move down: yields and the dollar ease, risk assets are supported.' } },
    elec:   { sLabel: 'Result read as pro-growth or lower uncertainty', wLabel: 'Result raises policy uncertainty (tariffs, sanctions, instability)', numeric: false,
              S: { v: 'POSITIVE', mild: true, m: [['NIFTY 50', 1], ['GOLDM', -1]], tx: 'Risk appetite improves; safe-haven demand eases.' },
              W: { v: 'NEGATIVE', mild: true, m: [['NIFTY 50', -1], ['Rupee', -1], ['GOLDM', 1]], tx: 'Risk-off: foreign selling, a softer rupee, safe-haven demand for gold.' } },
    oil:    { sLabel: 'Crude-positive surprise (bigger draw, supply cut)', wLabel: 'Crude-negative surprise (bigger build, more supply)', numeric: true,
              S: { v: 'NEGATIVE', m: [['NIFTY 50', -1], ['Rupee', -1], ['CRUDEOILM', 1]], tx: 'India\'s import bill and inflation worry rise; oil marketing, aviation and paint stocks come under pressure.' },
              W: { v: 'POSITIVE', m: [['NIFTY 50', 1], ['Rupee', 1], ['CRUDEOILM', -1]], tx: 'Lower import bill and inflation worry; oil marketing, aviation and paint stocks tend to be supported.' } },
    china:  { numeric: true, sStrong: 'Stronger', wStrong: 'Weaker',
              S: { v: 'MIXED', mild: true, m: [['SILVERM', 1], ['NIFTY 50', -1]], tx: 'Metals firm and metal stocks gain, but some foreign money may rotate toward China.' },
              W: { v: 'MIXED', mild: true, m: [['SILVERM', -1], ['NIFTY 50', 1]], tx: 'Metals soften and metal stocks lag, but relative flows can favour India.' } },
    incpi:  { numeric: true, sStrong: 'Hotter', wStrong: 'Cooler',
              S: { v: 'NEGATIVE', m: [['NIFTY BANK', -1], ['NIFTY 50', -1]], tx: 'Fewer RBI rate cuts likely: pressure on banks, NBFCs, realty and autos.' },
              W: { v: 'POSITIVE', m: [['NIFTY BANK', 1], ['NIFTY 50', 1]], tx: 'More room for RBI cuts: supportive for rate-sensitive stocks.' } },
    ingdp:  { numeric: true, sStrong: 'Stronger', wStrong: 'Weaker',
              S: { v: 'POSITIVE', m: [['NIFTY 50', 1], ['NIFTY BANK', 1]], tx: 'Supportive for earnings and the market.' },
              W: { v: 'NEGATIVE', m: [['NIFTY 50', -1], ['NIFTY BANK', -1]], tx: 'Raises growth and earnings worries.' } },
    inbudget: { sLabel: 'Pro-growth Budget (fiscal discipline, capex push, no new market taxes)', wLabel: 'Budget negative for markets (higher borrowing or tax hikes on market gains)', numeric: false,
              S: { v: 'POSITIVE', m: [['NIFTY 50', 1], ['NIFTY BANK', 1], ['Rupee', 1]], tx: 'Infrastructure, defence, consumption and banks tend to be supported.' },
              W: { v: 'NEGATIVE', m: [['NIFTY 50', -1], ['NIFTY BANK', -1], ['Rupee', -1]], tx: 'The market tends to sell off on new taxes or heavier borrowing.' } },
    ginfl:  { numeric: true, sStrong: 'Hotter', wStrong: 'Cooler',
              S: { v: 'NEGATIVE', mild: true, m: [['NIFTY 50', -1]], tx: 'A more hawkish central bank and firmer global yields weigh mildly on risk assets.' },
              W: { v: 'POSITIVE', mild: true, m: [['NIFTY 50', 1]], tx: 'A softer central bank and easier yields help risk assets mildly.' } },
    ggrowth: { numeric: true, sStrong: 'Stronger', wStrong: 'Weaker',
              S: { v: 'POSITIVE', mild: true, m: [['NIFTY 50', 1]], tx: 'A better global growth outlook helps risk appetite mildly.' },
              W: { v: 'NEGATIVE', mild: true, m: [['NIFTY 50', -1]], tx: 'A weaker global growth outlook weighs on risk appetite mildly.' } },
    usgdp:  { numeric: true, sStrong: 'Stronger', wStrong: 'Weaker',
              S: { v: 'NEGATIVE', mild: true, m: [['NIFTY 50', -1], ['Rupee', -1]], tx: 'Fewer Fed cuts priced; a firmer dollar and yields weigh mildly on flows.' },
              W: { v: 'POSITIVE', mild: true, m: [['NIFTY 50', 1], ['Rupee', 1]], tx: 'More Fed cuts priced; a softer dollar and yields help flows mildly.' } }
};
// Is the HIGHER number the "strong" side? Yes for most data; no for unemployment, jobless claims and oil inventories (a higher number = a build = weaker / crude-negative).
function _nfSHigh(title) { return !/(unemployment|jobless|claims|inventor|stockpile)/i.test(title); }
function _nfArrows(list) {
    return list.map(function (a) {
        var nm = a[0] === 'Rupee' ? 'Rupee' : a[0] === 'NIFTY 50' ? 'NIFTY' : a[0] === 'NIFTY BANK' ? 'BANK NIFTY' : a[0] === 'GOLDM' ? 'Gold' : a[0] === 'SILVERM' ? 'Silver' : a[0] === 'CRUDEOILM' ? 'Crude' : a[0];
        var up = a[1] > 0, word = a[0] === 'Rupee' ? (up ? 'firmer' : 'weaker') : (up ? '&#9650;' : '&#9660;');
        return '<span class="gtb-nf-arr ' + (up ? 'up' : 'dn') + '">' + nm + ' ' + word + '</span>';
    }).join('');
}
function _nfVerdictShort(e, ei) {
    var V = ei.rule && _NF_VERDICTS[ei.rule]; if (!V) return '';
    var sHigh = _nfSHigh(e.title), f = e.forecast || '', sTxt, wTxt;
    if (V.numeric && V.sStrong) { sTxt = (sHigh ? 'above ' : 'below ') + (f || 'forecast'); wTxt = (sHigh ? 'below ' : 'above ') + (f || 'forecast'); }
    else { sTxt = V.sLabel.split(' (')[0]; wTxt = V.wLabel.split(' (')[0]; }
    var c = function (v) { return v === 'NEGATIVE' ? 'var(--gtb-red)' : v === 'POSITIVE' ? 'var(--gtb-green)' : 'var(--gtb-amber)'; };
    var mk = function (t, o) { return '<span><i>' + _nfEsc(t) + '</i> &rarr; <b style="color:' + c(o.v) + ';">' + o.v + (o.mild && o.v !== 'LITTLE' ? ' (mild)' : '') + '</b> ' + _nfArrows(o.m) + '</span>'; };
    return mk(sTxt, V.S) + mk(wTxt, V.W);
}
function _nfVerdictHtml(e, ei) {
    var V = ei.rule && _NF_VERDICTS[ei.rule]; if (!V) return '';
    var col = function (v) { return v === 'NEGATIVE' ? 'var(--gtb-red)' : v === 'POSITIVE' ? 'var(--gtb-green)' : 'var(--gtb-amber)'; };
    var line = function (label, o) {
        return '<div class="gtb-nf-vrow"><div class="gtb-nf-vif">' + _nfEsc(label) + '</div><div><span class="gtb-nf-vv" style="color:' + col(o.v) + ';border-color:' + col(o.v) + ';">' + o.v + (o.mild && o.v !== 'LITTLE' ? ' (mild)' : '') + ' FOR INDIA</span> ' + _nfArrows(o.m) + '<div class="gtb-nf-vtx">' + _nfEsc(o.tx) + '</div></div></div>';
    };
    var sHigh = _nfSHigh(e.title), fv = e.forecast ? e.forecast : '', sLabel, wLabel;
    if (V.numeric && V.sStrong) {
        sLabel = V.sStrong + ' than forecast: ' + (sHigh ? 'above ' : 'below ') + (fv || 'the forecast');
        wLabel = V.wStrong + ' than forecast: ' + (sHigh ? 'below ' : 'above ') + (fv || 'the forecast');
    } else if (V.numeric) { sLabel = V.sLabel + (fv ? ' (forecast ' + fv + ')' : ''); wLabel = V.wLabel; }
    else { sLabel = V.sLabel; wLabel = V.wLabel; }
    var rows = [[sLabel, V.S], [wLabel, V.W]];
    var inline = V.numeric ? '<div class="gtb-nf-vrow"><div class="gtb-nf-vif">In line with the forecast</div><div class="gtb-nf-vtx">Little change expected from the number itself; the market then follows the next headline.</div></div>' : '';
    return '<div class="gtb-nf-verdict"><div class="gtb-nf-vhead">VERDICT FOR THE INDIAN MARKET</div>' + line(rows[0][0], rows[0][1]) + line(rows[1][0], rows[1][1]) + inline
        + '<div class="gtb-nf-vfoot">Usual reading by event type, not a prediction: the move depends on the surprise against what was expected.</div></div>';
}

// Parse one RSS body into [{title, link, t, src}] (RSS 2.0 <item>; Atom <entry> as a fallback)
function _nfParse(xml) {
    var out = [];
    try {
        var doc = new DOMParser().parseFromString(xml, 'text/xml');
        if (doc.querySelector('parsererror')) return null;
        var nodes = doc.querySelectorAll('item');
        var atom = false;
        if (!nodes.length) { nodes = doc.querySelectorAll('entry'); atom = true; }
        Array.prototype.forEach.call(nodes, function (n) {
            var g = function (sel) { var e = n.querySelector(sel); return e ? (e.textContent || '').trim() : ''; };
            var title = g('title'), link = g('link'), when = g('pubDate') || g('published') || g('updated');
            if (atom) { var le = n.querySelector('link'); if (le && le.getAttribute('href')) link = le.getAttribute('href'); }
            var src = g('source');
            if (src && title.slice(-(src.length + 3)) === ' - ' + src) title = title.slice(0, -(src.length + 3));   // Google News appends " - Publisher"
            var t = Date.parse(when);
            if (!title || !/^https?:\/\//i.test(link) || !isFinite(t)) return;
            out.push({ title: title, link: link, t: t, src: src });
        });
    } catch (e) { return null; }
    return out;
}

function _nfFetchOne(s) {
    return new Promise(function (resolve) {
        if (typeof GM_xmlhttpRequest === 'undefined') { resolve({ s: s, err: 'GM_xmlhttpRequest unavailable' }); return; }
        GM_xmlhttpRequest({
            method: 'GET', url: s.url, timeout: 15000,
            onload: function (res) {
                if (res.status < 200 || res.status >= 300) { resolve({ s: s, err: 'HTTP ' + res.status }); return; }
                var items = _nfParse(res.responseText);
                if (items === null) { resolve({ s: s, err: 'not a readable feed' }); return; }
                if (!items.length) { resolve({ s: s, err: 'no headlines in the feed' }); return; }
                resolve({ s: s, items: items });
            },
            onerror: function () { resolve({ s: s, err: 'network error' }); },
            ontimeout: function () { resolve({ s: s, err: 'timed out' }); }
        });
    });
}

function _nfPublisher(s) { return s.id.indexOf('g-') === 0 ? '' : s.label; }

async function _nfRefresh(force) {
    if (_NF.loading) return;
    if (!force && Date.now() - _NF.lastFetch < _NF_REFRESH_MS - 5000) { _nfRender(); return; }
    _NF.loading = true; _nfRenderStatus();
    var results = await Promise.all(_NF_SOURCES.map(_nfFetchOne));
    var now = Date.now(), added = 0, ok = 0;
    results.forEach(function (r) {
        var key = 'news-' + r.s.id;
        if (r.err) {
            _NF.status[r.s.id] = r.err;
            try { _gtbApiFail(key, 'News: ' + r.s.label, r.err, 'Headlines from this source are not updated.'); } catch (e) {}
            return;
        }
        ok++; delete _NF.status[r.s.id];
        try { _gtbApiOk(key); } catch (e) {}
        r.items.forEach(function (it) {
            if (now - it.t > _NF_MAX_AGE_MS || it.t > now + 3600 * 1000) return;
            var k = _nfKey(it.title);
            var cur = _NF.items[k];
            var src = it.src || _nfPublisher(r.s) || 'news';
            if (!cur) { _NF.items[k] = { title: it.title, link: it.link, t: it.t, src: src, tabs: r.s.tabs.slice(), seen: now, srcs: [src] }; added++; }
            else {
                r.s.tabs.forEach(function (tb) { if (cur.tabs.indexOf(tb) === -1) cur.tabs.push(tb); });
                if (cur.srcs.indexOf(src) === -1) cur.srcs.push(src);
                if (it.t < cur.t) cur.t = it.t;     // the earliest report is when the story broke
            }
        });
    });
    Object.keys(_NF.items).forEach(function (k) { if (now - _NF.items[k].t > _NF_MAX_AGE_MS) delete _NF.items[k]; });
    if (ok) _NF.lastFetch = now;
    _NF.loading = false;
    _nfSave();
    _nfRender(); _nfBadge();
    try { _nfReactEnsure(true); } catch (e) {}
    try { _nfTgCheck(); } catch (e) {}
}

function _nfSave() {
    try {
        var arr = Object.keys(_NF.items).map(function (k) { return _NF.items[k]; }).sort(function (a, b) { return b.t - a.t; }).slice(0, 200);
        var v = JSON.stringify(arr);
        if (typeof _gtbLsSet === 'function') _gtbLsSet('GTB_NEWS_CACHE', v); else localStorage.setItem('GTB_NEWS_CACHE', v);
    } catch (e) {}
}
function _nfLoadCache() {
    try {
        var arr = JSON.parse(localStorage.getItem('GTB_NEWS_CACHE') || '[]'), now = Date.now();
        arr.forEach(function (it) { if (it && it.title && now - it.t <= _NF_MAX_AGE_MS) _NF.items[_nfKey(it.title)] = it; });
    } catch (e) {}
}

function _nfList(ignoreLv) {
    var now = Date.now(), q = (_NF.q || '').toLowerCase().trim(), tab = _NF.tab;
    return Object.keys(_NF.items).map(function (k) { return _NF.items[k]; }).filter(function (it) {
        if (tab === 'breaking') { if (now - it.t > _NF_BREAKING_MS) return false; }
        else if (tab !== 'all' && it.tabs.indexOf(tab) === -1) return false;
        if (q && it.title.toLowerCase().indexOf(q) === -1 && String(it.src).toLowerCase().indexOf(q) === -1) return false;
        if (!ignoreLv && Object.keys(_NF.lv).length && !_NF.lv[_nfImpact(it).level]) return false;
        return true;
    }).sort(function (a, b) { return b.t - a.t; });
}
function _nfUnread() {
    var n = 0; Object.keys(_NF.items).forEach(function (k) { if (_NF.items[k].seen > _NF.lastViewed && Date.now() - _NF.items[k].t < 6 * 3600 * 1000) n++; });
    return n;
}
function _nfBadge() {
    var n = _nfUnread(), $b = jQ('#gtb-news-badge');
    if (!$b.length) return;
    $b.text(n > 99 ? '99+' : String(n)).toggle(n > 0 && !_NF.open);
}

function _nfItemHtml(it, kws) {
    var isNew = it.seen > _NF.lastViewed, low = it.title.toLowerCase();
    var hit = kws.filter(function (k) { return low.indexOf(k) !== -1; });
    var others = it.srcs && it.srcs.length > 1 ? ' +' + (it.srcs.length - 1) + ' more' : '';
    var im = _nfImpact(it);
    var tag = '';
    if (im.level !== 'NONE') {
        var tip = 'Rule-of-thumb tag from these words: ' + (im.hits.join(', ') || '-') + '. It says what to watch, not whether prices go up or down. Keyword match, not tested; it can be wrong.';
        tag = '<div class="gtb-nf-imp"><span class="gtb-nf-lv ' + im.level.toLowerCase() + '" title="' + _nfEsc(tip) + '">' + (im.level === 'MEDIUM' ? 'MED' : im.level) + '</span>'
            + '<span class="gtb-nf-cat">' + _nfEsc(im.cats.join(' / ')) + '</span>'
            + (im.cats.indexOf('Market move') !== -1 ? '<span class="gtb-nf-past" title="This headline reports a market move that has already happened, so the % since it was published is small. It does not mean nothing moved.">already moved</span>' : '')
            + _nfReactChips(it, im) + '</div>';
    }
    return '<a class="gtb-nf-item' + (hit.length ? ' gtb-nf-kw' : '') + (im.level === 'HIGH' ? ' gtb-nf-hi' : '') + '" href="' + _nfEsc(it.link) + '" target="_blank" rel="noopener noreferrer" title="' + _nfEsc(new Date(it.t).toLocaleString()) + '">'
        + '<div class="gtb-nf-title">' + _nfEsc(it.title) + '</div>' + tag
        + '<div class="gtb-nf-meta">' + (isNew ? '<span class="gtb-nf-new">NEW</span>' : '') + _nfEsc(it.src) + _nfEsc(others) + ' &middot; ' + _nfAgo(it.t)
        + (hit.length ? ' &middot; <span class="gtb-nf-hit">' + _nfEsc(hit.slice(0, 3).join(', ')) + '</span>' : '') + '</div></a>';
}

function _nfRenderStatus() {
    var $s = jQ('#gtb-nf-status'); if (!$s.length) return;
    var failed = Object.keys(_NF.status).length;
    $s.html((_NF.loading ? '<i class="bi bi-arrow-repeat gtb-nf-spin"></i> updating&hellip; ' : '')
        + (_NF.lastFetch ? 'updated ' + new Date(_NF.lastFetch).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'not loaded yet')
        + (failed ? ' &middot; <span class="gtb-nf-bad" title="' + _nfEsc(Object.keys(_NF.status).map(function (id) { return id + ': ' + _NF.status[id]; }).join('\n')) + '">' + failed + ' source' + (failed > 1 ? 's' : '') + ' failed</span>' : ''));
}

function _nfRender() {
    if (!jQ('#gtb-news-panel').length) return;
    _nfRenderStatus();
    jQ('#gtb-nf-tg').toggleClass('on', _nfTgOn());
    var nHigh = _nfEvents().filter(function (e) { return e.impact === 'HIGH' && e.t > Date.now() && e.t - Date.now() <= 7 * 86400000; }).length;
    jQ('#gtb-nf-views').html('<button class="gtb-nf-vw' + (_NF.view !== 'events' ? ' on' : '') + '" data-view="">News</button><button class="gtb-nf-vw' + (_NF.view === 'events' ? ' on' : '') + '" data-view="events">Upcoming <span>' + nHigh + ' HIGH this week</span></button>');
    jQ('#gtb-nf-next').html(_NF.view === 'events' ? '' : _nfNextStrip());
    if (_NF.view === 'events') { jQ('#gtb-nf-tabs, #gtb-nf-lv, .gtb-nf-search').hide(); jQ('#gtb-nf-list').html(_nfEventsHtml()); return; }
    if (_NF.view === 'log') { jQ('#gtb-nf-tabs, #gtb-nf-lv, .gtb-nf-search').hide(); jQ('#gtb-nf-list').html(_nfLogHtml()); return; }
    jQ('#gtb-nf-tabs, #gtb-nf-lv').show(); jQ('.gtb-nf-search').css('display', 'flex');
    var list = _nfList(), kws = _nfKeywords();
    var lvCounts = {};
    _nfList(true).forEach(function (it) { var l = _nfImpact(it).level; lvCounts[l] = (lvCounts[l] || 0) + 1; });
    jQ('#gtb-nf-lv').html('<span class="gtb-nf-lvl">Impact</span>' + _NF_LEVELS.map(function (l) { return '<button class="gtb-nf-lvb ' + l[0].toLowerCase() + (_NF.lv[l[0]] ? ' on' : '') + '" data-lv="' + l[0] + '">' + l[1] + ' <span>' + (lvCounts[l[0]] || 0) + '</span></button>'; }).join('') + (Object.keys(_NF.lv).length ? '<button class="gtb-nf-lvb clear" data-lv="" title="Show every impact level">clear</button>' : ''));
    var counts = {};
    var now = Date.now();
    Object.keys(_NF.items).forEach(function (k) { var it = _NF.items[k]; it.tabs.forEach(function (tb) { counts[tb] = (counts[tb] || 0) + 1; }); if (now - it.t <= _NF_BREAKING_MS) counts.breaking = (counts.breaking || 0) + 1; counts.all = (counts.all || 0) + 1; });
    jQ('#gtb-nf-tabs').html(_NF_TABS.map(function (t) { return '<button class="gtb-nf-tab' + (_NF.tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + ' <span>' + (counts[t[0]] || 0) + '</span></button>'; }).join(''));
    var html = list.slice(0, 120).map(function (it) { return _nfItemHtml(it, kws); }).join('');
    if (!html) html = '<div class="gtb-nf-empty">' + (_NF.loading ? 'Loading headlines&hellip;' : Object.keys(_NF.items).length ? 'No headlines match this tab or search.' : (_NF.lastFetch ? 'No headlines came back. Check the failed sources above.' : 'No headlines yet. Press refresh.')) + '</div>';
    var $l = jQ('#gtb-nf-list'), top = $l.scrollTop();
    $l.html(html).scrollTop(top);
}

function _nfSyncTheme() { jQ('#gtb-news-panel').toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light'); }

function _nfBuild() {
    if (jQ('#gtb-news-panel').length) return;
    jQ('body').append('<div id="gtb-news-panel">'
        + '<div class="gtb-nf-head"><span class="gtb-nf-h1"><i class="bi bi-newspaper"></i> NEWS</span>'
        +   '<span id="gtb-nf-status" class="gtb-nf-status"></span>'
        +   '<button id="gtb-nf-tg" class="gtb-nf-btn" title="Telegram alert for new HIGH impact headlines (off by default; needs the Telegram bot token and chat id in Settings)"><i class="bi bi-telegram"></i></button>'
        +   '<button id="gtb-nf-logbtn" class="gtb-nf-btn" title="Do the tags pick out busy times? (log)"><i class="bi bi-clipboard-data"></i></button>'
        +   '<button id="gtb-nf-refresh" class="gtb-nf-btn" title="Refresh now"><i class="bi bi-arrow-clockwise"></i></button>'
        +   '<button id="gtb-nf-close" class="gtb-nf-btn" title="Close"><i class="bi bi-x-lg"></i></button></div>'
        + '<div id="gtb-nf-views" class="gtb-nf-views"></div><div id="gtb-nf-next"></div>'
        + '<div id="gtb-nf-tabs" class="gtb-nf-tabs"></div>'
        + '<div id="gtb-nf-lv" class="gtb-nf-lvrow"></div>'
        + '<div class="gtb-nf-search"><input id="gtb-nf-q" type="text" placeholder="Filter headlines or source" autocomplete="off">'
        +   '<button id="gtb-nf-kwbtn" class="gtb-nf-btn" title="Highlight words: ' + _nfEsc(_nfKeywords().join(', ')) + '"><i class="bi bi-highlighter"></i></button></div>'
        + '<div id="gtb-nf-list" class="gtb-nf-list"></div>'
        + '<div class="gtb-nf-foot">Headlines from free RSS feeds (a few minutes late). HIGH / MED tags are keyword rules of thumb that say what to watch, not up or down. The % chips are what each price did since the headline. Not a signal.</div>'
        + '</div>');
    _nfSyncTheme();
}

function _nfOpen() {
    _nfBuild(); _nfSyncTheme();
    _NF.open = true;
    jQ('#gtb-news-panel').addClass('gtb-nf-open');
    jQ('#gtb-nf-q').val(_NF.q);
    _nfRender(); _nfBadge();
    _nfRefresh(false);
    try { _nfReactEnsure(false); } catch (e) {}
    // headlines seen while the panel is open count as read once it closes (the NEW markers stay visible meanwhile)
}
function _nfClose() {
    _NF.open = false;
    jQ('#gtb-news-panel').removeClass('gtb-nf-open');
    _NF.lastViewed = Date.now();
    try { localStorage.setItem('GTB_NEWS_VIEWED', String(_NF.lastViewed)); } catch (e) {}
    _nfBadge();
}
function _nfToggle() { if (_NF.open) _nfClose(); else _nfOpen(); }

jQ(document).on('click', '#gtb-news-toggle', function (e) { e.preventDefault(); _nfToggle(); });
jQ(document).on('click', '#gtb-nf-close', function () { _nfClose(); });
jQ(document).on('click', '#gtb-nf-tg', function () {
    if (_nfTgOn()) { try { localStorage.setItem('GTB_NEWS_TG', '0'); } catch (e) {} }
    else {
        try { localStorage.setItem('GTB_NEWS_TG', '1'); } catch (e) {}
        _nfTgMark(Object.keys(_NF.items));      // only headlines that arrive from now on are sent
        try { _gtbToast('Telegram alerts for HIGH impact news are on (new headlines only).', 'success'); } catch (e) {}
    }
    _nfRender();
});
jQ(document).on('click', '.gtb-nf-vw', function () { _NF.view = jQ(this).attr('data-view') || ''; if (_NF.view === 'events') _nfCalRefresh(false); _nfRender(); });
jQ(document).on('click', '#gtb-nf-nextbar', function () { _NF.view = 'events'; _nfRender(); });
jQ(document).on('click', '.gtb-nf-evlv', function () { var k = jQ(this).attr('data-lv'); _NF.evLv[k] = _NF.evLv[k] ? 0 : 1; _nfRender(); });
jQ(document).on('change', '#gtb-nf-evreg', function () { _NF.evRegion = jQ(this).val(); _nfRender(); });
jQ(document).on('click', '.gtb-nf-evmore', function (e) { e.preventDefault(); var id = jQ(this).attr('data-id'); _NF.evOpen[id] = !_NF.evOpen[id]; _nfRender(); });
jQ(document).on('change', '#gtb-nf-evindia', function () { _NF.evIndia = this.checked; try { localStorage.setItem('GTB_NEWS_EV_INDIA', this.checked ? '1' : '0'); } catch (e) {} _nfRender(); });
jQ(document).on('click', '#gtb-nf-evadd', function () { _NF.evForm = !_NF.evForm; _nfRender(); });
jQ(document).on('click', '#gtb-nf-evsave', function () {
    var title = jQ('#gtb-nf-evtitle').val().trim(), when = jQ('#gtb-nf-evwhen').val(), t = Date.parse(when);
    if (!title || !isFinite(t)) { try { _gtbToast('Give the event a title and a date and time.', 'error'); } catch (e) {} return; }
    var a = _nfManual(); a.push({ id: 'man|' + Date.now(), t: t, title: title, impact: jQ('#gtb-nf-evimp').val(), note: jQ('#gtb-nf-evnote').val().trim(), country: 'Mine' });
    _nfManualSave(a); _NF.evForm = false; _nfRender();
});
jQ(document).on('click', '.gtb-nf-evdel', function (e) { e.preventDefault(); var id = jQ(this).attr('data-id'); _nfManualSave(_nfManual().filter(function (x) { return x.id !== id; })); _nfRender(); });
jQ(document).on('click', '#gtb-nf-logbtn', function () { _NF.view = _NF.view === 'log' ? '' : 'log'; _nfLogUpdate(); _nfRender(); });
jQ(document).on('click', '#gtb-nf-logback', function () { _NF.view = ''; _nfRender(); });
jQ(document).on('click', '#gtb-nf-refresh', function () { _nfRefresh(true); });
jQ(document).on('click', '.gtb-nf-tab', function () { _NF.tab = jQ(this).attr('data-tab'); _nfRender(); });
jQ(document).on('click', '.gtb-nf-lvb', function () {
    var k = jQ(this).attr('data-lv');
    if (!k) _NF.lv = {}; else if (_NF.lv[k]) delete _NF.lv[k]; else _NF.lv[k] = 1;
    try { localStorage.setItem('GTB_NEWS_LV', JSON.stringify(Object.keys(_NF.lv))); } catch (e) {}
    _nfRender();
});
jQ(document).on('input', '#gtb-nf-q', function () { _NF.q = jQ(this).val(); _nfRender(); });
jQ(document).on('click', '#gtb-nf-kwbtn', function () {
    var cur = _nfKeywords().join(', ');
    var v = window.prompt('Words to highlight in headlines (comma separated):', cur);
    if (v === null) return;
    try { localStorage.setItem('GTB_NEWS_KW', v); } catch (e) {}
    jQ(this).attr('title', 'Highlight words: ' + v); _nfRender();
});
jQ(document).on('keydown', function (e) { if (e.key === 'Escape' && _NF.open && !jQ(e.target).is('input,textarea')) _nfClose(); });

// Styles live here (self-contained); colours come from the --gtb-* variables the container lists in common.css define for #gtb-news-panel
GM_addStyle(''
    + '#gtb-news-panel{position:fixed;top:0;right:0;bottom:0;width:390px;max-width:92vw;z-index:99150;display:flex;flex-direction:column;background:var(--gtb-bg);color:var(--gtb-text);border-left:1px solid var(--gtb-border);box-shadow:-8px 0 24px rgba(0,0,0,.35);transform:translateX(105%);transition:transform .2s ease;font-size:12px;}'
    + '#gtb-news-panel.gtb-nf-open{transform:translateX(0);}'
    + '#gtb-news-panel .gtb-nf-head{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--gtb-surface);border-bottom:1px solid var(--gtb-border);}'
    + '#gtb-news-panel .gtb-nf-h1{font-weight:800;letter-spacing:.06em;font-size:.72rem;}'
    + '#gtb-news-panel .gtb-nf-status{flex:1;color:var(--gtb-muted);font-size:.58rem;text-align:right;}'
    + '#gtb-news-panel .gtb-nf-bad{color:var(--gtb-red);cursor:help;}'
    + '#gtb-news-panel .gtb-nf-btn{background:transparent;border:1px solid var(--gtb-border);color:var(--gtb-text);padding:2px 7px;cursor:pointer;}'
    + '#gtb-news-panel .gtb-nf-btn.on{border-color:var(--gtb-green);color:var(--gtb-green);}'
    + '#gtb-news-panel .gtb-nf-btn:hover{border-color:var(--gtb-accent);color:var(--gtb-accent);}'
    + '#gtb-news-panel .gtb-nf-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:6px 8px;border-bottom:1px solid var(--gtb-border);}'
    + '#gtb-news-panel .gtb-nf-tab{background:transparent;border:1px solid var(--gtb-border);color:var(--gtb-muted);font-size:.58rem;padding:2px 7px;cursor:pointer;}'
    + '#gtb-news-panel .gtb-nf-tab span{opacity:.7;margin-left:2px;}'
    + '#gtb-news-panel .gtb-nf-tab.on{border-color:var(--gtb-accent);color:var(--gtb-accent);font-weight:800;}'
    + '#gtb-news-panel .gtb-nf-lvrow{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:5px 8px;border-bottom:1px solid var(--gtb-border);}'
    + '#gtb-news-panel .gtb-nf-lvl{font-size:.5rem;color:var(--gtb-muted);letter-spacing:.06em;text-transform:uppercase;margin-right:2px;}'
    + '#gtb-news-panel .gtb-nf-lvb{background:transparent;border:1px solid var(--gtb-border);color:var(--gtb-muted);font-size:.56rem;font-weight:700;padding:1px 8px;cursor:pointer;}'
    + '#gtb-news-panel .gtb-nf-lvb span{opacity:.7;font-weight:400;}'
    + '#gtb-news-panel .gtb-nf-lvb.high.on{background:var(--gtb-red);border-color:var(--gtb-red);color:#fff;}'
    + '#gtb-news-panel .gtb-nf-lvb.medium.on{background:var(--gtb-amber);border-color:var(--gtb-amber);color:#1a1205;}'
    + '#gtb-news-panel .gtb-nf-lvb.low.on,#gtb-news-panel .gtb-nf-lvb.none.on{background:var(--gtb-border);color:var(--gtb-text);}'
    + '#gtb-news-panel .gtb-nf-lvb.clear{border-style:dashed;}'
    + '#gtb-news-panel .gtb-nf-search{box-sizing:border-box;width:100%;display:flex;gap:6px;padding:6px 8px;border-bottom:1px solid var(--gtb-border);}'
    + '#gtb-news-panel .gtb-nf-search input{flex:1 1 0;min-width:0;background:var(--gtb-surface2);border:1px solid var(--gtb-border);color:var(--gtb-text);padding:3px 7px;font-size:.62rem;}'
    + '#gtb-news-panel .gtb-nf-list{flex:1 1 0;min-height:0;overflow-y:auto;}'
    + '#gtb-news-panel .gtb-nf-item{display:block;padding:8px 10px;border-bottom:1px solid var(--gtb-border);text-decoration:none;color:var(--gtb-text);border-left:3px solid transparent;}'
    + '#gtb-news-panel .gtb-nf-item:hover{background:var(--gtb-surface);}'
    + '#gtb-news-panel .gtb-nf-item.gtb-nf-kw{border-left-color:var(--gtb-amber);}'
    + '#gtb-news-panel .gtb-nf-title{font-size:.68rem;font-weight:600;line-height:1.3;}'
    + '#gtb-news-panel .gtb-nf-meta{margin-top:3px;color:var(--gtb-muted);font-size:.54rem;}'
    + '#gtb-news-panel .gtb-nf-new{background:var(--gtb-accent);color:#fff;font-weight:800;font-size:.46rem;padding:0 4px;margin-right:5px;}'
    + '#gtb-news-panel .gtb-nf-hit{color:var(--gtb-amber);font-weight:700;}'
    + '#gtb-news-panel .gtb-nf-empty{padding:18px 12px;color:var(--gtb-muted);text-align:center;}'
    + '#gtb-news-panel .gtb-nf-foot{padding:5px 10px;color:var(--gtb-muted);font-size:.5rem;border-top:1px solid var(--gtb-border);}'
    + '#gtb-news-panel .gtb-nf-spin{display:inline-block;animation:gtbNfSpin 1s linear infinite;}'
    + '@keyframes gtbNfSpin{to{transform:rotate(360deg);}}'
    + '#gtb-news-panel .gtb-nf-item.gtb-nf-hi{background:rgba(229,72,77,.06);}'
    + '#gtb-news-panel .gtb-nf-imp{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:4px;}'
    + '#gtb-news-panel .gtb-nf-lv{font-size:.46rem;font-weight:800;padding:1px 5px;color:#fff;cursor:help;}'
    + '#gtb-news-panel .gtb-nf-lv.high{background:var(--gtb-red);}'
    + '#gtb-news-panel .gtb-nf-lv.medium{background:var(--gtb-amber);color:#1a1205;}'
    + '#gtb-news-panel .gtb-nf-lv.low{background:var(--gtb-border);color:var(--gtb-muted);}'
    + '#gtb-news-panel .gtb-nf-cat{font-size:.52rem;color:var(--gtb-muted);margin-right:4px;}'
    + '#gtb-news-panel .gtb-nf-past{font-size:.46rem;color:var(--gtb-amber);border:1px dashed var(--gtb-amber);padding:0 4px;cursor:help;}'
    + '#gtb-news-panel .gtb-nf-chip{font-size:.5rem;font-family:var(--gtb-mono,monospace);border:1px solid var(--gtb-border);padding:0 4px;color:var(--gtb-muted);white-space:nowrap;cursor:help;}'
    + '#gtb-news-panel .gtb-nf-chip.up{color:var(--gtb-green);border-color:var(--gtb-green);}'
    + '#gtb-news-panel .gtb-nf-chip.dn{color:var(--gtb-red);border-color:var(--gtb-red);}'
    + '#gtb-news-panel .gtb-nf-views{display:flex;gap:4px;padding:6px 8px 0;}'
    + '#gtb-news-panel .gtb-nf-vw{flex:1;background:transparent;border:1px solid var(--gtb-border);color:var(--gtb-muted);font-size:.62rem;font-weight:700;padding:4px 6px;cursor:pointer;}'
    + '#gtb-news-panel .gtb-nf-vw span{font-weight:400;opacity:.8;margin-left:4px;font-size:.52rem;}'
    + '#gtb-news-panel .gtb-nf-vw.on{border-color:var(--gtb-accent);color:var(--gtb-accent);}'
    + '#gtb-news-panel .gtb-nf-next{margin:6px 8px 0;padding:4px 8px;border:1px solid var(--gtb-red);color:var(--gtb-text);font-size:.58rem;cursor:pointer;background:rgba(229,72,77,.08);}'
    + '#gtb-news-panel .gtb-nf-evbar{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:6px 8px;border-bottom:1px solid var(--gtb-border);}'
    + '#gtb-news-panel .gtb-nf-evlv{background:transparent;border:1px solid var(--gtb-border);color:var(--gtb-muted);font-size:.56rem;font-weight:700;padding:1px 8px;cursor:pointer;}'
    + '#gtb-news-panel .gtb-nf-evlv.high.on{background:var(--gtb-red);border-color:var(--gtb-red);color:#fff;}'
    + '#gtb-news-panel .gtb-nf-evlv.medium.on{background:var(--gtb-amber);border-color:var(--gtb-amber);color:#1a1205;}'
    + '#gtb-news-panel .gtb-nf-sel{background:var(--gtb-surface2);border:1px solid var(--gtb-border);color:var(--gtb-text);font-size:.56rem;padding:1px 4px;}'
    + '#gtb-news-panel .gtb-nf-evform{display:flex;flex-direction:column;gap:5px;padding:8px;border-bottom:1px solid var(--gtb-border);background:var(--gtb-surface);}'
    + '#gtb-news-panel .gtb-nf-evform input{background:var(--gtb-surface2);border:1px solid var(--gtb-border);color:var(--gtb-text);padding:3px 6px;font-size:.6rem;}'
    + '#gtb-news-panel .gtb-nf-evhint{color:var(--gtb-muted);font-size:.5rem;}'
    + '#gtb-news-panel .gtb-nf-evday{padding:5px 10px;background:var(--gtb-surface);color:var(--gtb-muted);font-size:.54rem;font-weight:800;letter-spacing:.05em;border-bottom:1px solid var(--gtb-border);}'
    + '#gtb-news-panel .gtb-nf-ev{display:flex;gap:10px;padding:7px 10px;border-bottom:1px solid var(--gtb-border);}'
    + '#gtb-news-panel .gtb-nf-ev.hi{background:rgba(229,72,77,.05);}'
    + '#gtb-news-panel .gtb-nf-ev.past{opacity:.5;}'
    + '#gtb-news-panel .gtb-nf-evt{font-family:var(--gtb-mono,monospace);font-size:.64rem;font-weight:700;min-width:38px;}'
    + '#gtb-news-panel .gtb-nf-evb{flex:1;font-size:.64rem;}'
    + '#gtb-news-panel .gtb-nf-evfoot{padding:8px 10px;color:var(--gtb-muted);font-size:.5rem;}'
    + '#gtb-news-panel .gtb-nf-evdel{color:var(--gtb-red);}'
    + '#gtb-news-panel .gtb-nf-ind{margin-top:4px;font-size:.56rem;line-height:1.35;}'
    + '#gtb-news-panel .gtb-nf-indwhy{color:var(--gtb-muted);}'
    + '#gtb-news-panel .gtb-nf-scen{margin-top:5px;padding:5px 7px;background:var(--gtb-surface);border-left:2px solid var(--gtb-accent);font-size:.56rem;line-height:1.4;display:flex;flex-direction:column;gap:3px;}'
    + '#gtb-news-panel .gtb-nf-up{color:var(--gtb-green);}'
    + '#gtb-news-panel .gtb-nf-dn{color:var(--gtb-red);}'
    + '#gtb-news-panel .gtb-nf-evmore{display:inline-block;margin-top:3px;font-size:.52rem;color:var(--gtb-accent);}'
    + '#gtb-news-panel .gtb-nf-evchk{font-size:.52rem;color:var(--gtb-muted);display:flex;align-items:center;gap:3px;cursor:pointer;}'
    + '#gtb-news-panel .gtb-nf-verdict{margin-top:5px;border:1px solid var(--gtb-border);background:var(--gtb-surface);}'
    + '#gtb-news-panel .gtb-nf-vhead{font-size:.46rem;font-weight:800;letter-spacing:.07em;color:var(--gtb-muted);padding:3px 7px;border-bottom:1px solid var(--gtb-border);}'
    + '#gtb-news-panel .gtb-nf-vrow{padding:4px 7px;border-bottom:1px solid var(--gtb-border);font-size:.56rem;line-height:1.4;}'
    + '#gtb-news-panel .gtb-nf-vif{font-weight:700;margin-bottom:2px;}'
    + '#gtb-news-panel .gtb-nf-vv{font-size:.46rem;font-weight:800;border:1px solid;padding:0 5px;margin-right:4px;}'
    + '#gtb-news-panel .gtb-nf-arr{font-size:.52rem;font-weight:700;margin-right:6px;white-space:nowrap;}'
    + '#gtb-news-panel .gtb-nf-arr.up{color:var(--gtb-green);}'
    + '#gtb-news-panel .gtb-nf-arr.dn{color:var(--gtb-red);}'
    + '#gtb-news-panel .gtb-nf-vtx{color:var(--gtb-muted);margin-top:2px;}'
    + '#gtb-news-panel .gtb-nf-vfoot{padding:3px 7px;color:var(--gtb-muted);font-size:.46rem;}'
    + '#gtb-news-toggle{position:relative;}'
    + '#gtb-news-badge{display:none;position:absolute;top:-5px;right:-7px;min-width:14px;height:14px;line-height:14px;text-align:center;background:var(--gtb-red,#e5484d);color:#fff;font-size:.48rem;font-weight:800;border-radius:7px;padding:0 3px;}'
);

// Background polling so the unread badge works with the panel closed; first pull shortly after load
_nfLoadCache();
setTimeout(function () { try { _nfCalRefresh(false); } catch (e) {} }, 20000);
setInterval(function () { try { _nfCalRefresh(false); } catch (e) {} }, 30 * 60000);
setInterval(_nfEvAlertTick, 60000);
setTimeout(function () { try { _nfRefresh(true); } catch (e) {} }, 15000);
_NF.timer = setInterval(function () { try { _nfRefresh(true); } catch (e) {} }, _NF_REFRESH_MS);
setTimeout(_nfBadge, 4000);
