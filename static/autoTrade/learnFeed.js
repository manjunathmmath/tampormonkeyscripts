// ── Learn & ideas (v29.597) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Something to read while waiting during market hours. A popup (All Tools > Learn & ideas) with
//   - ARTICLES: free RSS feeds of trading and investing writers (Zerodha Varsity and Z-Connect, Freefincal, Capitalmind, Damodaran, Ben Carlson,
//     Of Dollars and Data, The Reformed Broker, Farnam Street, Meb Faber, Alpha Architect). Titles and a short summary list; click one to read it
//     inside the panel (the feed's own full text, cleaned to plain paragraphs) or open the original.
//   - IDEAS & FACTS: "On this day" in markets, "Did you know" trading and investing concepts, and trading / investing ideas (process ideas, not signals).
// A small reminder card (a toast at the bottom left) shows one of those every N minutes while the market is open (Settings in the popup, default 45,
// 0 = off; never in the first 10 minutes or the last 15, never while a squeeze banner or a refresh is running).
// Nothing here is advice, a signal or part of any score. The "On this day" list and the tips were written from general knowledge: check a fact
// before quoting it. Feeds were checked with curl on 2026-11-14; each needs its own @connect line (and a redirect target needs one too).
var _LN_SOURCES = [
    { id: 'varsity', label: 'Zerodha Varsity',      url: 'https://zerodha.com/varsity/feed/',                          group: 'india' },
    { id: 'zconn',   label: 'Z-Connect',            url: 'https://zerodha.com/z-connect/feed',                         group: 'india' },
    { id: 'freefin', label: 'Freefincal',           url: 'https://freefincal.com/feed/',                               group: 'india' },
    { id: 'capmind', label: 'Capitalmind',          url: 'https://premium.capitalmind.in/feed/',                       group: 'india' },
    { id: 'damo',    label: 'Aswath Damodaran',     url: 'https://aswathdamodaran.blogspot.com/feeds/posts/default',   group: 'invest' },
    { id: 'wealthcs', label: 'A Wealth of Common Sense', url: 'https://awealthofcommonsense.com/feed/',                group: 'invest' },
    { id: 'odad',    label: 'Of Dollars And Data',  url: 'https://ofdollarsanddata.com/feed/',                         group: 'invest' },
    { id: 'reformed', label: 'The Reformed Broker', url: 'https://thereformedbroker.com/feed/',                        group: 'invest' },
    { id: 'fs',      label: 'Farnam Street',        url: 'https://fs.blog/feed/',                                      group: 'invest' },
    { id: 'meb',     label: 'Meb Faber',            url: 'https://mebfaber.com/feed/',                                 group: 'trade' },
    { id: 'alpha',   label: 'Alpha Architect',      url: 'https://alphaarchitect.com/feed/',                           group: 'trade' }
];
var _LN_TABS = [['all', 'All'], ['india', 'India'], ['invest', 'Investing'], ['trade', 'Trading & quant'], ['ideas', 'Ideas & facts']];
var _LN = { items: {}, full: {}, tab: 'all', q: '', loading: false, status: {}, view: null, lastFetch: 0 };
var _LN_READ = {};
try { (JSON.parse(localStorage.getItem('GTB_LN_READ') || '[]') || []).forEach(function (k) { _LN_READ[k] = 1; }); } catch (e) {}

// ── content: "On this day" in markets (month, day, year, text). Written from general knowledge; verify before quoting. ───────────────────────
var _LN_OTD = [
    [1, 1, 1986, 'The BSE Sensex, base 100 for 1978-79, is launched as the benchmark of the Indian market.'],
    [1, 21, 2008, 'Indian markets crash: the Sensex falls about 1,400 points (roughly 7%) in one session on global recession fears.'],
    [1, 21, 2021, 'The Sensex crosses 50,000 for the first time.'],
    [1, 28, 2021, 'GameStop short squeeze: brokers restrict buying in GameStop and other heavily shorted "meme" stocks.'],
    [2, 5, 2018, '"Volmageddon": the Dow falls about 1,175 points and short-volatility products collapse as the VIX more than doubles in a day.'],
    [2, 26, 1995, 'Barings Bank, the oldest merchant bank in Britain, collapses after unauthorised trading losses by one trader.'],
    [3, 4, 2015, 'The Sensex crosses 30,000 for the first time.'],
    [3, 9, 2009, 'The S&P 500 closes at its financial-crisis low of about 677, more than 50% below its 2007 peak. It then began a bull market that ran for years.'],
    [3, 10, 2000, 'The Nasdaq Composite peaks above 5,000, the top of the dot-com bubble. It took about 15 years to get back to that level.'],
    [3, 11, 2020, 'The WHO declares COVID-19 a pandemic; global markets were already falling fast.'],
    [3, 23, 2020, 'The Sensex falls about 3,900 points (over 13%) in one day, the lowest close of the pandemic crash; the Nifty hits the lower circuit.'],
    [4, 2, 2025, 'The US announces broad "reciprocal" tariffs; global markets sell off over the following days.'],
    [4, 22, 1996, 'NSE launches the Nifty 50 index.'],
    [5, 6, 2010, 'The "flash crash": the Dow drops nearly 1,000 points within minutes and mostly recovers the same afternoon.'],
    [5, 17, 1792, 'The Buttonwood Agreement is signed by 24 brokers in New York: the roots of the New York Stock Exchange.'],
    [5, 18, 2009, 'Indian markets surge on the election result: the Sensex gains over 2,000 points (about 17%) and trading halts twice on upper circuits.'],
    [5, 30, 2019, 'The Sensex crosses 40,000 for the first time.'],
    [6, 4, 2024, 'Election result day: the Sensex closes about 4,400 points (5.7%) lower and the Nifty nearly 6% lower, the worst day since March 2020, after trading far higher at the open.'],
    [6, 12, 2000, 'NSE starts trading Nifty index futures: derivatives arrive in India (BSE had started Sensex futures three days earlier).'],
    [7, 4, 2024, 'The Sensex crosses 80,000 for the first time.'],
    [7, 9, 1875, 'The Bombay stock exchange (BSE) traces its start to this date as the Native Share and Stock Brokers Association.'],
    [7, 25, 1990, 'The Sensex crosses 1,000 for the first time.'],
    [7, 25, 2017, 'The Nifty crosses 10,000 for the first time.'],
    [8, 9, 2007, 'BNP Paribas freezes three funds because it cannot value their US mortgage holdings: often seen as the start of the financial crisis.'],
    [8, 15, 1971, 'President Nixon ends the dollar\'s convertibility into gold: the end of the Bretton Woods system.'],
    [8, 24, 2015, '"Black Monday" in India: the Sensex falls about 1,600 points (nearly 6%) on China growth fears.'],
    [9, 11, 2023, 'The Nifty crosses 20,000 for the first time.'],
    [9, 15, 2008, 'Lehman Brothers files for bankruptcy, the largest in US history, and the financial crisis becomes a global panic.'],
    [9, 16, 1992, '"Black Wednesday": Britain is forced out of the European exchange-rate mechanism and sterling plunges.'],
    [9, 24, 2021, 'The Sensex closes above 60,000 for the first time.'],
    [10, 9, 2007, 'The Dow Jones Industrial Average hits its pre-crisis peak, just over 14,100, before the 2008 crash.'],
    [10, 19, 1987, '"Black Monday": the Dow falls about 22.6% in one day, still the largest one-day percentage fall in its history.'],
    [10, 29, 1929, '"Black Tuesday": the Wall Street crash of 1929 deepens; the Dow lost almost 90% from its peak by 1932.'],
    [11, 8, 2016, 'Demonetisation: India announces that Rs 500 and Rs 1,000 notes stop being legal tender; markets fell sharply the next day.'],
    [12, 11, 2007, 'The Sensex crosses 20,000 for the first time.'],
    [12, 11, 2023, 'The Sensex crosses 70,000 for the first time.']
];

// ── content: "Did you know" (concepts) ──────────────────────────────────────────────────────────────────────────────────────────────────────
var _LN_TIPS = [
    'A 50% loss needs a 100% gain to get back to even; a 20% loss needs 25%. Losses are harder to recover than gains are to make, which is why capping the loss on every trade matters more than picking winners.',
    'Risking 1% of capital per trade means ten losses in a row cost about 9.6%, not 10%, because each loss is taken from a smaller balance. Risking 5% per trade, the same run costs about 40%.',
    'Position size = (account x risk %) divided by (entry price minus stop price). Decide the stop from the chart first, then let the size follow. Sizing first and placing the stop where it "fits" is how stops end up in noise.',
    'Expectancy per trade = win rate x average win - loss rate x average loss. A 40% win rate is profitable if the average win is more than 1.5 times the average loss. A 70% win rate can still lose money if the losses are large.',
    'R-multiple: measure every trade in units of the amount you risked. A trade that makes twice the risk is +2R. Thinking in R lets you compare trades of different sizes and see whether the system works across a few hundred trades.',
    'Slippage and brokerage are part of the stop. On a tight stop they can be a large share of the risk: a 5-point stop with 1.5 points of cost is really a 6.5-point stop.',
    'Options theta (time decay) is not constant: it accelerates in the last days to expiry, so a bought option loses value fastest exactly when expiry is close, while a sold option earns it fastest, with the largest swings in price risk (gamma).',
    'Implied volatility usually drops after a known event (results, a policy decision) even when the price moves the way you wanted. A bought option can lose money on a correct view because of that "IV crush".',
    'Max pain is the strike where option buyers collectively lose the most at expiry. It is a level where price sometimes gravitates, not a rule; strong trends ignore it, so treat it as one input.',
    'Put-call ratio (PCR) above 1 means more put than call open interest. Because writers (sellers) are the ones who hold the position, it is read as support where puts are written, but a very high PCR can also mean a crowded one-sided bet.',
    'Open interest rising with price rising usually means new buying (a trend with participation). Price rising with open interest falling usually means shorts covering, which tends to fade faster once the covering is done.',
    'VWAP (volume weighted average price) is where the average share of the day traded. Price above it means buyers are in control on average; many institutions use it as a benchmark for fills, which is why price often reacts around it.',
    'ATR (average true range) tells you how far an instrument normally moves in a candle. A stop closer than about one ATR is inside normal noise and is often hit by chance, not because the idea was wrong.',
    'The first 15 minutes of the day have the widest ranges and the widest spreads. Many experienced traders wait for the opening range to form before acting on it, and many opening breakouts fail.',
    'Gaps: a gap up that holds above the previous day\'s high is a different signal from a gap that fills in the first half hour. What price does at the first support or resistance after the gap matters more than the gap itself.',
    'Trend following loses small amounts often and wins big rarely; mean reversion wins small often and loses big rarely. Neither is better: the problem is using the wrong one for the market you are in, or abandoning one after a normal losing streak.',
    'Correlated positions are one position. Long NIFTY calls plus long BANKNIFTY calls plus long a heavyweight bank stock can all lose together; size the total exposure, not each trade alone.',
    'Overtrading is the most common beginner leak. Each trade has costs (brokerage, taxes, spread) and an emotional cost; fewer, better-planned trades are usually easier on both.',
    'A written trade plan before the entry (why, where, stop, target, size) turns a bad trade into a mistake you can study. Without it a loss is just a feeling.',
    'Revenge trading, trying to win back a loss immediately, is a size and discipline problem, not an analysis problem. A daily loss limit that ends the session is the usual cure.',
    'Recent results bias judgement: after a few wins most people take more risk, after a few losses they cut winners short. Reviewing a series of 30 or more trades says more than the last three.',
    'Time frames agree or disagree: a bounce on a 5-minute chart inside a downtrend on the daily chart is a counter-trend trade with a lower success rate. Know which trade you are taking.',
    'Support and resistance are zones, not exact prices. Where several independent sources agree (previous day high, OI wall, round number, VWAP) the zone is stronger.',
    'Round numbers (25,000 on the Nifty, 60,000 on the Sensex, 1,800 on Silver) attract orders and are often rejected or broken with a burst of volume. Stops and targets placed exactly on them are crowded.',
    'Volume confirms, price decides. A breakout on low volume often fails; a breakdown on heavy volume that does not follow through (a close back inside) often traps late sellers.',
    'The stock market is open for about 6 hours; the money is made or lost in much shorter periods. Most of the day is often noise. Knowing when not to trade is part of the edge.',
    'Index funds beat most active funds over long periods mainly because of costs. A 1% yearly fee on a 10% return is a tenth of the return every year, compounding against you for decades.',
    'Compounding needs time more than rate: 10,000 a month at 12% for 30 years is far more than twice what 15 years gives, because most of the growth comes in the final years.',
    'Diversification does not remove risk, it removes the risk of one name. In a market crash most equities fall together; what protects you is position size and having assets that do not all depend on equity.',
    'Rupee-cost averaging (SIP) is a behavioural tool as much as a mathematical one: it keeps you investing when the news is bad and you would otherwise stay out.',
    'Dividends are not free money: on the ex-date the price drops by about the dividend amount. A high yield can also mean the market expects the dividend to be cut.',
    'Price to earnings (P/E) means little alone: compare it with the company\'s own history, its growth rate, the sector and interest rates. A low P/E can be a cheap business or a business in decline.',
    'A circuit limit does not stop a stock falling or rising, it stops the trading at that price. You may be unable to exit at your stop in a stock stuck in the lower circuit.',
    'Stop-loss orders can slip: in a gap or a fast market the fill can be far from the trigger price. A stop-limit order avoids bad fills but may not fill at all.',
    'Margin multiplies the result both ways. With 5x intraday leverage a 1% adverse move is a 5% loss of capital. The leverage you can use is not the leverage you should use.',
    'Intraday and delivery are different businesses: intraday profits come from small moves repeated with discipline, delivery from the business growing. Mixing them (holding an intraday loser overnight "to recover") is a common mistake.',
    'Market breadth (how many stocks advance versus decline) can disagree with the index. An index rising on a few heavyweights while most stocks fall is a narrower, more fragile rally.',
    'The India VIX is an estimate of expected movement over the next 30 days, not a prediction of direction. A rising VIX with falling prices usually shows fear; a very low VIX shows complacency and cheaper options.',
    'Every strategy has a worst losing streak that is longer than people expect. If your system has a 50% win rate, a run of 7 losses in a row happens about once in every 128 sequences of 7 trades, so it will happen.'
];

// Where each tip's concept is covered, by position in _LN_TIPS. k: 'book' = a book that covers the concept (the wording of the tip is still mine, so check the book before quoting it),
// 'math' = plain arithmetic, 'other' = a published description, 'gen' = general market knowledge with no single source I am confident of.
var _LN_TIP_SRC = [
    { k: 'math', s: 'Arithmetic: the gain needed is 1 / (1 - loss) - 1.' },
    { k: 'math', s: 'Arithmetic: 0.99^10 and 0.95^10.' },
    { k: 'book', s: 'Van K. Tharp, Trade Your Way to Financial Freedom (position sizing by the risk per unit).' },
    { k: 'book', s: 'Van K. Tharp, Trade Your Way to Financial Freedom (expectancy).' },
    { k: 'book', s: 'Van K. Tharp, Trade Your Way to Financial Freedom (R-multiples).' },
    { k: 'gen', s: '' },
    { k: 'book', s: 'Sheldon Natenberg, Option Volatility and Pricing (the Greeks: theta and gamma).' },
    { k: 'book', s: 'Background: Sheldon Natenberg, Option Volatility and Pricing (implied volatility). "IV crush" itself is trader slang.' },
    { k: 'gen', s: '' },
    { k: 'gen', s: '' },
    { k: 'book', s: 'John J. Murphy, Technical Analysis of the Financial Markets (volume and open interest).' },
    { k: 'gen', s: '' },
    { k: 'book', s: 'J. Welles Wilder Jr., New Concepts in Technical Trading Systems (1978), where the average true range was introduced.' },
    { k: 'gen', s: '' },
    { k: 'gen', s: '' },
    { k: 'book', s: 'Background: Andreas Clenow, Following the Trend (the low hit rate and large winners of trend following).' },
    { k: 'gen', s: '' },
    { k: 'gen', s: '' },
    { k: 'book', s: 'Alexander Elder, The New Trading for a Living (the trading plan and the trader\'s diary).' },
    { k: 'book', s: 'Background: Alexander Elder, The New Trading for a Living (his 2% and 6% loss-limit rules).' },
    { k: 'book', s: 'Background: Daniel Kahneman, Thinking, Fast and Slow (biases in judgement).' },
    { k: 'book', s: 'Alexander Elder, The New Trading for a Living (the Triple Screen method, which uses several time frames).' },
    { k: 'book', s: 'Background: John J. Murphy, Technical Analysis of the Financial Markets (support and resistance).' },
    { k: 'gen', s: '' },
    { k: 'book', s: 'John J. Murphy, Technical Analysis of the Financial Markets (volume as confirmation).' },
    { k: 'gen', s: '' },
    { k: 'book', s: 'John C. Bogle, The Little Book of Common Sense Investing (why costs decide the result).' },
    { k: 'book', s: 'Morgan Housel, The Psychology of Money (the chapter on compounding and time), plus arithmetic.' },
    { k: 'book', s: 'Burton Malkiel, A Random Walk Down Wall Street (diversification).' },
    { k: 'gen', s: '' },
    { k: 'gen', s: '' },
    { k: 'book', s: 'Aswath Damodaran, Investment Valuation (earnings multiples such as the P/E ratio).' },
    { k: 'gen', s: '' },
    { k: 'gen', s: '' },
    { k: 'math', s: 'Arithmetic: the loss is the move times the leverage.' },
    { k: 'gen', s: '' },
    { k: 'book', s: 'John J. Murphy, Technical Analysis of the Financial Markets (market breadth and the advance-decline line).' },
    { k: 'other', s: 'NSE, India VIX methodology (expected volatility over the next 30 calendar days).' },
    { k: 'math', s: 'Arithmetic: 0.5^7 = 1/128.' }
];
function _lnSrcText(i) {
    var x = _LN_TIP_SRC.length === _LN_TIPS.length ? _LN_TIP_SRC[i] : null;
    if (!x) return '';
    return x.k === 'gen' ? 'General market knowledge, no single source.' : (x.k === 'book' ? 'Covered in: ' : x.k === 'other' ? 'Source: ' : '') + x.s;
}

// ── content: trading and investing ideas (process ideas, not signals) ─────────────────────────────────────────────────────────────────────
var _LN_IDEAS = [
    'Idea: tag the last 20 trades by the reason you took them (breakout, pullback, news, boredom). Add up the result per tag. Stop doing the tag with the worst average result.',
    'Idea: paper-trade a new setup 20 times with the exact rules you would use live before using real money. If you cannot write the rules, you do not have a setup yet.',
    'Idea: for one week, take only the first-hour trades and stop for the day by 11:00. Compare the result with your full-day trades.',
    'Idea: set a daily loss limit of 2R. When you reach it, close the platform. Track for a month how many days it saved you from a bad afternoon.',
    'Idea: write down, before each entry, the price at which the idea is wrong. If you cannot name it, do not enter.',
    'Idea: screenshot every trade at entry and at exit. A weekly review of 10 screenshots teaches more than a month of watching the price.',
    'Idea: keep a "not taken" list: setups you passed on and what happened. It shows whether your filters are protecting you or costing you.',
    'Idea: take the same setup in a smaller size when you are tired, after a loss or on an event day. Size is the easiest lever to pull without changing the plan.',
    'Idea: check the result of your trades separately for each weekday and time slot. Many people find one slot (for example 14:00 to 15:00) that loses money in total.',
    'Idea: compare your results with simply holding the index over the same days. If a month of work does not beat that, the extra risk is not paying you.',
    'Idea: build a one-page watchlist of 5 names you know well (their levels, their usual ranges, their news days) instead of scanning 200. Familiarity is an edge.',
    'Idea: before the open, write the three things that would make you stay out today (a big event, a gap beyond the expected range, an unclear direction). Being able to skip a day is a skill.',
    'Idea: after a losing streak, review only the process (did I follow the plan?), not the result. Losses with a correct process are the cost of the strategy; losses with a broken process are the thing to fix.',
    'Idea: pick one concept a week (for example VWAP, ATR or open interest) and watch how it behaves on 5 different days, without trading it. Knowing how an indicator behaves beats knowing its definition.',
    'Idea: for long-term investing, write a one-paragraph reason for owning each stock and the facts that would make you sell. Review it every quarter against the results.',
    'Idea: automate one monthly investment (SIP) and do not look at the balance for a quarter. Compare how you behave with that account against the one you trade.',
    'Idea: list your holdings by sector and find the one that is more than a quarter of the portfolio. Decide on purpose whether that concentration is what you want.',
    'Idea: read one company annual report cover to cover this month, starting with the notes to the accounts and the management discussion, before the price chart.',
    'Idea: look at the same stock on the daily, hourly and 5-minute chart before the entry. Take the trade only if the larger time frame is not against it.',
    'Idea: for options, record the implied volatility and days to expiry whenever you buy. After 20 trades check whether buying cheap volatility (and not near expiry) changes the results.'
];

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function _lnEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _lnAgo(ms) {
    var m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (m < 60) return (m < 1 ? 'just now' : m + ' min ago');
    var h = Math.round(m / 60); if (h < 24) return h + ' h ago';
    var d = Math.round(h / 24); if (d < 60) return d + ' day' + (d > 1 ? 's' : '') + ' ago';
    return Math.round(d / 30) + ' months ago';
}
function _lnIst() { return new Date(Date.now() + 19800000); }       // a Date whose UTC fields are the IST clock
function _lnText(html) { try { var d = new DOMParser().parseFromString(String(html || ''), 'text/html'); return (d.body.textContent || '').replace(/\s+/g, ' ').trim(); } catch (e) { return ''; } }

// Feed text -> a small safe subset of HTML (paragraphs, headings, lists, quotes, bold / italic, links). Scripts, styles, frames, forms, images and every attribute except href are removed.
function _lnClean(html) {
    try {
        var doc = new DOMParser().parseFromString(String(html || ''), 'text/html'), keep = { P: 1, H1: 1, H2: 1, H3: 1, H4: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1, B: 1, STRONG: 1, I: 1, EM: 1, A: 1, BR: 1, CODE: 1, PRE: 1 };
        doc.querySelectorAll('script,style,iframe,object,embed,form,input,button,svg,img,figure,noscript,video,audio,link,meta,table').forEach(function (n) { n.remove(); });
        var walk = function (node) {
            Array.prototype.slice.call(node.children).forEach(function (c) {
                walk(c);
                if (!keep[c.tagName]) { while (c.firstChild) node.insertBefore(c.firstChild, c); c.remove(); return; }
                Array.prototype.slice.call(c.attributes).forEach(function (a) { if (!(c.tagName === 'A' && a.name === 'href')) c.removeAttribute(a.name); });
                if (c.tagName === 'A') { var h = c.getAttribute('href') || ''; if (!/^https?:/i.test(h)) c.removeAttribute('href'); else { c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener noreferrer'); } }
            });
        };
        walk(doc.body);
        return doc.body.innerHTML.replace(/<p>\s*<\/p>/g, '');
    } catch (e) { return ''; }
}

// ── feeds ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function _lnParse(xml, src) {
    var out = [];
    try {
        var doc = new DOMParser().parseFromString(xml, 'text/xml');
        if (doc.querySelector('parsererror')) return out;
        var nodes = Array.prototype.slice.call(doc.querySelectorAll('item, entry'));
        var txt = function (n, sel) { var e = n.querySelector(sel); return e ? (e.textContent || '').trim() : ''; };
        nodes.forEach(function (n) {
            var title = txt(n, 'title'); if (!title) return;
            var link = txt(n, 'link'); if (!link) { var l = n.querySelector('link[href]'); link = l ? l.getAttribute('href') : ''; }
            var alt = n.querySelector('link[rel="alternate"][href]'); if (alt) link = alt.getAttribute('href');
            if (!/^https?:/i.test(link || '')) return;
            var when = txt(n, 'pubDate') || txt(n, 'published') || txt(n, 'updated') || txt(n, 'date');
            var ms = Date.parse(when); if (!isFinite(ms)) ms = Date.now();
            var full = '';
            Array.prototype.slice.call(n.childNodes).forEach(function (c) { var nm = (c.nodeName || '').toLowerCase(); if ((nm === 'content:encoded' || nm === 'content') && c.textContent) full = c.textContent; });
            var desc = txt(n, 'description') || txt(n, 'summary');
            var body = full || desc, sum = _lnText(desc || full).slice(0, 360);
            out.push({ id: link, src: src.id, group: src.group, label: src.label, title: _lnText(title), link: link, ms: ms, sum: sum, html: body });
        });
    } catch (e) {}
    return out;
}
function _lnFetchOne(src) {
    return new Promise(function (resolve) {
        try {
            GM_xmlhttpRequest({
                method: 'GET', url: src.url, timeout: 25000, headers: { Accept: 'application/rss+xml, application/atom+xml, text/xml, */*' },
                onload: function (r) {
                    if (r.status < 200 || r.status >= 300) { _LN.status[src.id] = 'HTTP ' + r.status; return resolve([]); }
                    var items = _lnParse(r.responseText || '', src);
                    _LN.status[src.id] = items.length ? 'ok' : 'no articles in the reply';
                    resolve(items);
                },
                onerror: function () { _LN.status[src.id] = 'network error'; resolve([]); },
                ontimeout: function () { _LN.status[src.id] = 'timed out'; resolve([]); }
            });
        } catch (e) { _LN.status[src.id] = 'error'; resolve([]); }
    });
}
function _lnSave() {
    try {
        var arr = Object.keys(_LN.items).map(function (k) { var x = _LN.items[k]; return { id: x.id, src: x.src, group: x.group, label: x.label, title: x.title, link: x.link, ms: x.ms, sum: x.sum }; }).sort(function (a, b) { return b.ms - a.ms; }).slice(0, 300);
        if (typeof _gtbLsSet === 'function') _gtbLsSet('GTB_LN_CACHE', JSON.stringify({ at: Date.now(), items: arr })); else localStorage.setItem('GTB_LN_CACHE', JSON.stringify({ at: Date.now(), items: arr }));
    } catch (e) {}
}
function _lnLoadCache() {
    try {
        var c = JSON.parse(localStorage.getItem('GTB_LN_CACHE') || 'null');
        if (c && c.items) { c.items.forEach(function (x) { if (!_LN.items[x.id]) _LN.items[x.id] = x; }); _LN.lastFetch = c.at || 0; }
    } catch (e) {}
}
async function _lnRefresh(force) {
    if (_LN.loading) return;
    if (!force && _LN.lastFetch && Date.now() - _LN.lastFetch < 60 * 60000) return;
    _LN.loading = true; _lnRenderStatus();
    try {
        var res = await Promise.all(_LN_SOURCES.map(_lnFetchOne)), cutoff = Date.now() - 120 * 86400000;
        res.forEach(function (list) { list.forEach(function (it) { if (it.ms < cutoff) return; var old = _LN.items[it.id]; _LN.items[it.id] = it; if (old && old.firstSeen) it.firstSeen = old.firstSeen; else it.firstSeen = Date.now(); _LN.full[it.id] = it.html; }); });
        _LN.lastFetch = Date.now();
        _lnSave();
    } finally { _LN.loading = false; }
    _lnRender();
}
function _lnMarkRead(id) { _LN_READ[id] = 1; try { localStorage.setItem('GTB_LN_READ', JSON.stringify(Object.keys(_LN_READ).slice(-400))); } catch (e) {} }

// ── "On this day", tips and ideas ───────────────────────────────────────────────────────────────────────────────────────────────────────
function _lnToday() { var d = _lnIst(); return { m: d.getUTCMonth() + 1, d: d.getUTCDate() }; }
function _lnOtdFor(m, d) { return _LN_OTD.filter(function (e) { return e[0] === m && e[1] === d; }); }
function _lnOtdNear(days) {      // the next few days that have an entry, for the list in the popup
    var out = [], base = _lnIst().getTime();
    for (var k = 0; k <= days; k++) { var x = new Date(base + k * 86400000), m = x.getUTCMonth() + 1, d = x.getUTCDate(); _lnOtdFor(m, d).forEach(function (e) { out.push({ k: k, e: e }); }); }
    return out;
}
function _lnYearsText(y) { var n = _lnIst().getUTCFullYear() - y; return n > 0 ? n + ' year' + (n > 1 ? 's' : '') + ' ago' : 'this year'; }
function _lnPick(kind) {
    // kind: 'tip' | 'idea'. A shuffled order without repeats until the list is used up (position remembered).
    var list = kind === 'tip' ? _LN_TIPS : _LN_IDEAS, key = 'GTB_LN_SEEN_' + kind, seen = [];
    try { seen = JSON.parse(localStorage.getItem(key) || '[]') || []; } catch (e) {}
    var left = list.map(function (_, i) { return i; }).filter(function (i) { return seen.indexOf(i) < 0; });
    if (!left.length) { seen = []; left = list.map(function (_, i) { return i; }); }
    var i = left[Math.floor(Math.random() * left.length)]; seen.push(i);
    try { localStorage.setItem(key, JSON.stringify(seen)); } catch (e) {}
    return { i: i, text: list[i] };
}

// ── reminder card ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function _lnEvery() { var v = null; try { v = localStorage.getItem('GTB_LN_EVERY'); } catch (e) {} v = parseInt(v, 10); return isFinite(v) ? v : 45; }
function _lnShowCard(kind, text, sub, src) {
    try {
        var head = kind === 'otd' ? 'On this day' : kind === 'tip' ? 'Did you know?' : 'Idea';
        var html = '<div style="max-width:420px;"><div style="font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#7aa2f7;margin-bottom:3px;"><i class="bi bi-lightbulb"></i> ' + head + (sub ? ' · ' + _lnEsc(sub) : '') + '</div>'
            + '<div style="font-size:13px;line-height:1.45;color:#e6edf3;">' + _lnEsc(text) + '</div>' + (src ? '<div style="font-size:10px;margin-top:4px;color:#7aa2f7;">' + _lnEsc(src) + '</div>' : '') + '<div style="font-size:10px;margin-top:3px;color:#8b949e;">Click to open Learn &amp; ideas · not advice</div></div>';
        Toastify({
            text: html, duration: 28000, gravity: 'bottom', position: 'left', escapeMarkup: false, close: true, stopOnFocus: true,
            style: { background: '#161b22', border: '1px solid #3b82f655', 'border-radius': '0', padding: '10px 14px', 'box-shadow': '0 4px 18px rgba(0,0,0,0.5)' },
            onClick: function () { try { _lnShowPopup('ideas'); } catch (e) {} }
        }).showToast();
    } catch (e) {}
}
function _lnNextCard(force) {
    var t = _lnToday(), otd = _lnOtdFor(t.m, t.d), done = ''; try { done = localStorage.getItem('GTB_LN_OTD_DAY') || ''; } catch (e) {}
    var key = t.m + '-' + t.d;
    if (otd.length && (force ? Math.random() < 0.5 : done !== key)) {
        var e = otd[Math.floor(Math.random() * otd.length)];
        try { localStorage.setItem('GTB_LN_OTD_DAY', key); } catch (x) {}
        return _lnShowCard('otd', e[3], e[2] + ' · ' + _lnYearsText(e[2]));
    }
    var n = 0; try { n = parseInt(localStorage.getItem('GTB_LN_N') || '0', 10) || 0; localStorage.setItem('GTB_LN_N', String(n + 1)); } catch (x) {}
    var isIdea = n % 3 === 2, p = _lnPick(isIdea ? 'idea' : 'tip');
    _lnShowCard(isIdea ? 'idea' : 'tip', p.text.replace(/^Idea:\s*/, ''), '', isIdea ? '' : _lnSrcText(p.i));
}
function _lnTick() {
    try {
        var every = _lnEvery(); if (!(every > 0)) return;
        var d = _lnIst(), dow = d.getUTCDay(), mins = d.getUTCHours() * 60 + d.getUTCMinutes();
        if (dow === 0 || dow === 6 || mins < 9 * 60 + 25 || mins > 15 * 60 + 15) return;
        if (typeof _gtbHistTime === 'function' && _gtbHistTime()) return;                                    // snapshot / replay: not a live session
        try { if (typeof _GTB_REFRESH_IN_PROGRESS !== 'undefined' && _GTB_REFRESH_IN_PROGRESS) return; } catch (e) {}
        if (jQ('#gtb-squeeze-banner:visible').length) return;
        var last = 0; try { last = parseInt(localStorage.getItem('GTB_LN_LAST') || '0', 10) || 0; } catch (e) {}
        if (Date.now() - last < every * 60000) return;
        try { localStorage.setItem('GTB_LN_LAST', String(Date.now())); } catch (e) {}
        _lnNextCard(false);
    } catch (e) {}
}

// ── popup ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function _lnRenderStatus() {
    var el = document.getElementById('ln-status'); if (!el) return;
    var bad = Object.keys(_LN.status).filter(function (k) { return _LN.status[k] !== 'ok'; });
    el.textContent = _LN.loading ? 'Loading articles...' : (_LN.lastFetch ? 'Updated ' + _lnAgo(_LN.lastFetch) : 'Not loaded yet') + (bad.length ? ' · ' + bad.length + ' source' + (bad.length > 1 ? 's' : '') + ' did not load' : '');
    el.title = bad.map(function (k) { var s = _LN_SOURCES.filter(function (x) { return x.id === k; })[0]; return (s ? s.label : k) + ': ' + _LN.status[k]; }).join('\n');
}
function _lnList() {
    var q = _LN.q.toLowerCase();
    return Object.keys(_LN.items).map(function (k) { return _LN.items[k]; }).filter(function (x) {
        if (_LN.tab !== 'all' && x.group !== _LN.tab) return false;
        return !q || (x.title + ' ' + x.label + ' ' + (x.sum || '')).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return b.ms - a.ms; });
}
function _lnCardsHtml() {
    var h = '', t = _lnToday(), todays = _lnOtdFor(t.m, t.d);
    var box = function (title, body, extra) { return '<div style="padding:10px 12px;margin-bottom:8px;background:var(--gtb-surface);border-left:4px solid var(--gtb-accent);"><div style="font-size:0.52rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:var(--gtb-accent);margin-bottom:4px;">' + title + '</div>' + body + (extra || '') + '</div>'; };
    h += box('On this day in markets · ' + t.d + '/' + t.m, todays.length ? todays.map(function (e) { return '<div style="font-size:0.72rem;line-height:1.5;margin-bottom:4px;"><b>' + e[2] + '</b> <span style="color:var(--gtb-muted);">(' + _lnYearsText(e[2]) + ')</span> ' + _lnEsc(e[3]) + '</div>'; }).join('') : '<div style="font-size:0.66rem;color:var(--gtb-muted);">Nothing on the list for today. Coming up:</div>'
        + (function () { var nx = _lnOtdNear(21).filter(function (x) { return x.k > 0; }).slice(0, 4); return nx.map(function (x) { return '<div style="font-size:0.66rem;line-height:1.45;margin-top:3px;"><span style="color:var(--gtb-muted);">' + x.e[1] + '/' + x.e[0] + '</span> <b>' + x.e[2] + '</b> ' + _lnEsc(x.e[3]) + '</div>'; }).join(''); })());
    var tp = _LN.tip || (_LN.tip = _lnPick('tip')), id = _LN.idea || (_LN.idea = _lnPick('idea'));
    h += box('Did you know', '<div style="font-size:0.74rem;line-height:1.55;">' + _lnEsc(tp.text) + '</div><div style="font-size:0.55rem;color:var(--gtb-accent);margin-top:4px;">' + _lnEsc(_lnSrcText(tp.i)) + '</div>', '<div style="margin-top:6px;"><button class="ln-next gtb-win-btn" data-k="tip" style="width:auto;font-size:0.55rem;padding:3px 12px;">Another one</button></div>');
    h += box('Trading and investing idea', '<div style="font-size:0.74rem;line-height:1.55;">' + _lnEsc(id.text.replace(/^Idea:\s*/, '')) + '</div>', '<div style="margin-top:6px;"><button class="ln-next gtb-win-btn" data-k="idea" style="width:auto;font-size:0.55rem;padding:3px 12px;">Another one</button></div>');
    h += '<div style="font-size:0.5rem;color:var(--gtb-muted);line-height:1.5;">Ideas are ways to study your own trading, not signals or advice. The wording of every tip is mine: "Covered in" names a book that covers the concept, so check the book before quoting it, and "On this day" entries were written from general knowledge. '
        + '<span class="ln-all" style="cursor:pointer;text-decoration:underline dotted;">Show every tip and idea</span></div><div id="ln-all-list" style="display:none;margin-top:6px;"></div>';
    return h;
}
function _lnRender() {
    var body = document.getElementById('ln-body'); if (!body) return;
    var tabs = document.getElementById('ln-tabs');
    if (tabs) tabs.innerHTML = _LN_TABS.map(function (t) {
        var on = _LN.tab === t[0], n = t[0] === 'ideas' ? '' : ' <span style="opacity:0.7;">' + Object.keys(_LN.items).filter(function (k) { return t[0] === 'all' || _LN.items[k].group === t[0]; }).length + '</span>';
        return '<button class="ln-tab gtb-win-btn" data-t="' + t[0] + '" style="width:auto;font-size:0.58rem;padding:3px 12px;' + (on ? 'background:var(--gtb-accent);color:#fff;font-weight:800;' : '') + '">' + t[1] + n + '</button>';
    }).join('');
    _lnRenderStatus();
    var q = document.getElementById('ln-q'); if (q && document.activeElement !== q) q.value = _LN.q;
    if (_LN.view) {
        var it = _LN.items[_LN.view]; if (!it) { _LN.view = null; return _lnRender(); }
        var html = _LN.full[it.id] ? _lnClean(_LN.full[it.id]) : '';
        var thin = _lnText(html).length < 400;
        body.innerHTML = '<div style="margin-bottom:8px;"><button class="ln-back gtb-win-btn" style="width:auto;font-size:0.58rem;padding:3px 12px;"><i class="bi bi-arrow-left"></i> Back to the list</button> '
            + '<a href="' + _lnEsc(it.link) + '" target="_blank" rel="noopener noreferrer" class="gtb-win-btn" style="width:auto;font-size:0.58rem;padding:3px 12px;text-decoration:none;display:inline-block;">Open the original <i class="bi bi-box-arrow-up-right"></i></a></div>'
            + '<div style="max-width:720px;"><div style="font-size:1rem;font-weight:800;line-height:1.35;margin-bottom:3px;">' + _lnEsc(it.title) + '</div>'
            + '<div style="font-size:0.55rem;color:var(--gtb-muted);margin-bottom:10px;">' + _lnEsc(it.label) + ' · ' + _lnAgo(it.ms) + '</div>'
            + '<div class="ln-article" style="font-size:0.78rem;line-height:1.65;">' + (html || '<p>' + _lnEsc(it.sum || '') + '</p>') + '</div>'
            + (thin ? '<div style="margin-top:10px;font-size:0.58rem;color:var(--gtb-amber);">This feed only sends a short summary: use "Open the original" for the full article.</div>' : '') + '</div>';
        body.scrollTop = 0; return;
    }
    if (_LN.tab === 'ideas') { body.innerHTML = _lnCardsHtml(); return; }
    var list = _lnList();
    if (!list.length) { body.innerHTML = '<div style="padding:18px;font-size:0.68rem;color:var(--gtb-muted);">' + (_LN.loading ? 'Loading articles...' : Object.keys(_LN.items).length ? 'No articles match.' : 'No articles yet. Press Refresh (the feeds need internet access from Tampermonkey).') + '</div>'; return; }
    body.innerHTML = list.slice(0, 120).map(function (x) {
        var unread = !_LN_READ[x.id];
        return '<div class="ln-item" data-id="' + _lnEsc(x.id) + '" style="cursor:pointer;padding:8px 12px;margin-bottom:5px;background:var(--gtb-surface);border-left:4px solid ' + (unread ? 'var(--gtb-accent)' : 'var(--gtb-border)') + ';">'
            + '<div style="font-size:0.78rem;font-weight:' + (unread ? '800' : '600') + ';line-height:1.35;' + (unread ? '' : 'color:var(--gtb-muted);') + '">' + _lnEsc(x.title) + '</div>'
            + '<div style="font-size:0.5rem;color:var(--gtb-muted);margin:2px 0;">' + _lnEsc(x.label) + ' · ' + _lnAgo(x.ms) + '</div>'
            + (x.sum ? '<div style="font-size:0.62rem;line-height:1.45;color:var(--gtb-muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + _lnEsc(x.sum) + '</div>' : '') + '</div>';
    }).join('');
}
function _lnShowPopup(tab) {
    if (tab) { _LN.tab = tab; _LN.view = null; }
    if (!Object.keys(_LN.items).length) _lnLoadCache();
    var every = _lnEvery();
    var html = '<div id="ln-wrap" style="position:absolute;inset:0;display:flex;flex-direction:column;background:var(--gtb-bg);color:var(--gtb-text);">'
        + '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:8px 12px;border-bottom:1px solid var(--gtb-border);">'
        +   '<span id="ln-tabs" style="display:flex;gap:4px;flex-wrap:wrap;"></span>'
        +   '<input id="ln-q" placeholder="Search articles" autocomplete="off" style="margin-left:auto;width:170px;font-size:0.6rem;padding:3px 8px;background:var(--gtb-surface);color:var(--gtb-text);border:1px solid var(--gtb-border);">'
        +   '<button id="ln-refresh" class="gtb-win-btn" style="width:auto;font-size:0.58rem;padding:3px 10px;" title="Fetch the feeds again"><i class="bi bi-arrow-repeat"></i> Refresh</button>'
        + '</div>'
        + '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:4px 12px;border-bottom:1px solid var(--gtb-border);font-size:0.52rem;color:var(--gtb-muted);">'
        +   '<span id="ln-status"></span><span style="margin-left:auto;">Reminder card every '
        +   '<select id="ln-every" style="font-size:0.55rem;background:var(--gtb-surface);color:var(--gtb-text);border:1px solid var(--gtb-border);">' + [0, 20, 30, 45, 60, 90].map(function (v) { return '<option value="' + v + '"' + (v === every ? ' selected' : '') + '>' + (v ? v + ' min' : 'off') + '</option>'; }).join('') + '</select>'
        +   ' while the market is open <button id="ln-now" class="gtb-win-btn" style="width:auto;font-size:0.52rem;padding:2px 8px;">Show one now</button></span></div>'
        + '<div id="ln-body" style="flex:1 1 0;min-height:0;overflow:auto;padding:10px 12px;"></div></div>';
    showPopUpWindow('learn', html, 'Learn & ideas', 820, 660);
    var cls = 'popup-custom-style-learn';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html('<div style="display:flex;align-items:center;gap:6px;width:100%;"><i class="bi bi-lightbulb"></i><span style="font-weight:800;font-size:0.7rem;">LEARN &amp; IDEAS</span>' + popupWinControls(cls) + '</div>');
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
    jQ('.' + cls).find('.popupwindow_content').css({ overflow: 'hidden', padding: 0, position: 'relative' });
    jQ(document).off('.ln')
        .on('click.ln', '.ln-tab', function () { _LN.tab = this.getAttribute('data-t'); _LN.view = null; _lnRender(); })
        .on('input.ln', '#ln-q', function () { _LN.q = this.value; _LN.view = null; if (_LN.tab === 'ideas') _LN.tab = 'all'; _lnRender(); })
        .on('click.ln', '#ln-refresh', function () { _lnRefresh(true); })
        .on('click.ln', '.ln-item', function () { var id = this.getAttribute('data-id'); _lnMarkRead(id); _LN.view = id; _lnRender(); })
        .on('click.ln', '.ln-back', function () { _LN.view = null; _lnRender(); })
        .on('click.ln', '.ln-next', function () { var k = this.getAttribute('data-k'); _LN[k] = _lnPick(k); _lnRender(); })
        .on('click.ln', '.ln-all', function () {
            var el = document.getElementById('ln-all-list'); if (!el) return;
            if (el.style.display === 'none') { el.innerHTML = '<ol style="margin:0 0 0 18px;padding:0;font-size:0.64rem;line-height:1.5;">' + _LN_TIPS.map(function (x, i) { return '<li style="margin-bottom:6px;">' + _lnEsc(x) + '<div style="font-size:0.9em;color:var(--gtb-accent);">' + _lnEsc(_lnSrcText(i)) + '</div></li>'; }).join('') + '</ol><div style="font-size:0.52rem;font-weight:800;margin:8px 0 3px;">Ideas</div><ol style="margin:0 0 0 18px;padding:0;font-size:0.64rem;line-height:1.5;">' + _LN_IDEAS.map(function (x) { return '<li style="margin-bottom:5px;">' + _lnEsc(x.replace(/^Idea:\s*/, '')) + '</li>'; }).join('') + '</ol>'; el.style.display = 'block'; }
            else el.style.display = 'none';
        })
        .on('change.ln', '#ln-every', function () { try { localStorage.setItem('GTB_LN_EVERY', this.value); } catch (e) {} })
        .on('click.ln', '#ln-now', function () { _lnNextCard(true); });
    _lnRender();
    _lnRefresh(false);
}

// reminder timer: one check a minute, nothing is fetched or shown outside market hours
setTimeout(function () { try { setInterval(_lnTick, 60000); } catch (e) {} }, 20000);
