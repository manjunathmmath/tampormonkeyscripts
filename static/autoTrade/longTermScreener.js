// ═══════════════════════════════════════════════════════════════════════════
// Long-term screener — a second mode inside the Positional Screener (positionalScreener.js).
//
// Scans a whole NSE index list (NIFTY 50 / 100 / 200 / 500, downloaded from NSE's index CSV files) on DAILY candles,
// not just F&O stocks. Reuses the screener's own pure functions (_psFetchDaily, _psPrimaryRead = Minervini trend
// template + Weinstein stage, _psMomentum = Clenow momentum, _psSmaArr, _psSma) and adds long-term measures: price vs the
// 200-day average and its slope, distance from the 52-week high, strength against NIFTY 50 over 6 and 12 months,
// and a liquidity read. All price based: the app has no fundamentals data, so this says nothing about earnings or
// valuation. A heuristic checklist, NOT back-tested, not investment advice.
//
// ISOLATION: own cache (_LT_CACHE), nothing is written to _PS_CACHE, so the swing screener, its dashboard cards, Telegram
// and basket features are unaffected. Needs the Kite instruments list loaded (Data Load) to turn symbols into tokens.
// ═══════════════════════════════════════════════════════════════════════════

var _LT_BASE = 'https://nsearchives.nseindia.com/content/indices/';
var _LT_UNIVERSES = {
    nifty50:  { label: 'NIFTY 50',  file: 'ind_nifty50list.csv' },
    nifty100: { label: 'NIFTY 100', file: 'ind_nifty100list.csv' },
    nifty200: { label: 'NIFTY 200', file: 'ind_nifty200list.csv' },
    nifty500: { label: 'NIFTY 500', file: 'ind_nifty500list.csv' }
};
var _LT_CACHE = {};                     // symbol -> analysed row
var _LT_META = { universe: '', total: 0, scanned: 0, noToken: [], noData: [], at: '' };
var _LT_STATE = { universe: 'nifty100', filter: 'all', timing: 'all', shortlist: false, sort: 'rank', scanning: false, stop: false, search: '' };
var _LT_LOOKBACK_DAYS = 560;            // calendar days of daily candles, about 380 sessions: enough for the 200-day average and 12-month strength
var _LT_EARLY_PCT = 30;                // gain since the uptrend began below this = EARLY
var _LT_LATE_PCT = 80;                 // gain since the uptrend began at or above this = LATE
var _LT_PULLBACK_MIN = 8;              // pulled back at least this % from the 52-week high, uptrend intact = PULLBACK
var _LT_SHORTLIST_MAX_RISK = 25;        // SHORTLIST: risk to the review level at or below this %
var _LT_BASKET_SELECTED = {};          // symbol -> true, ticked in the table for Add to Basket
var _LT_POOL = 6;
var _LT_TIPS = {
    all: 'Every analysed stock.', top20: 'The top fifth of the analysed list by 12-month return against NIFTY 50: the one measure that held up in the backtest.', good: 'Score 5 or more and not in a downtrend: a healthy long-term chart.', strong: 'Score 7 or more: the strongest charts.',
    neutral: 'Score 3 to 5: mixed, not yet convincing.', weak: 'Score under 3: little going for it.', avoid: 'Downtrend (Stage 4, or below a falling 200-day average). Keep away whatever the score.',
    EARLY: 'Up under 30% since the uptrend began: most of the move may still be ahead.', MID: 'Up 30 to 80% since the uptrend began.',
    PULLBACK: 'Uptrend intact but 8 to 25% below the 52-week high: often a better price than buying at the high.',
    LATE: 'Up 80% or more, or more than 25% above the 50-day average: wait for a pullback.', 'NO UPTREND': 'Below the 200-day average, or the average is falling.'
};
// One-click shortlist: a healthy chart, bought early or on a pullback, liquid, with a review level that is not too far away.
// SHORTLIST = the strength rank first (the one measure that held up in the backtest): top 20% by 12-month strength, above a rising
// 200-day average, and not thin. A risk cap on the review level (tested earlier) cost about 2 to 7 points of return without a smaller
// worst fall, so the risk to the review level is shown but not used to exclude names.
function _ltIsShortlist(r) {
    return r.rank != null && r.rankN > 0 && r.rank / r.rankN <= 0.2 && r.vs200 != null && r.vs200 > 0 && r.slope200 != null && r.slope200 > 0 && !r.thin;
}
// the earlier rule (verdict + timing); the backtest still reports it, as Old SHORTLIST, for comparison
function _ltIsShortlistOld(r) {
    return (r.verdict === 'STRONG' || r.verdict === 'GOOD') && (r.timing === 'EARLY' || r.timing === 'PULLBACK') && !r.thin && r.riskPct != null && r.riskPct <= _LT_SHORTLIST_MAX_RISK;
}                       // stocks fetched at the same time (the shared history queue still limits the real request rate)

if (typeof GTB_INFO !== 'undefined') {
    GTB_INFO['lt-filters'] = { icon: 'bi-funnel', title: 'Filters and the best combination',
        body: '<b>Verdict filter</b>: STRONG + GOOD (score 5 or more, healthy chart), STRONG only (7 or more), NEUTRAL (3-5, mixed), WEAK (under 3), AVOID (downtrend, keep away). <b>Timing filter</b>: EARLY (up under 30% since the uptrend began), MID (30-80%), PULLBACK (uptrend intact, 8-25% below the 52-week high), LATE (80% or more, or stretched above the 50-day average), NO UPTREND. <br><br><b>Top 20% by 12m strength</b>: the top fifth of the list by 12-month return against NIFTY 50 (the default sort is this rank). It is the only measure that held up in the backtest.<br><br><b>Best combination: the SHORTLIST button</b> = top 20% by 12-month strength + above a rising 200-day average + not THIN (at least about 1 crore traded a day). In the backtests (NIFTY 100 and NIFTY 200, today members only) the top 20% by strength beat NIFTY by about 30 to 39 points over the next 12 months against about 19 to 23 for all stocks, and the trend and liquidity conditions made little difference: they are there to avoid broken charts and thin stocks, not because they raised the result. A risk cap on the review level was tested and removed because it cost return without a smaller worst fall; the risk column is still shown for sizing. Read the buy zone: if the price is above it, wait. The earlier rule (verdict + timing) did not beat the whole list. <br><br><b>Other useful views</b>: STRONG + LATE = good stocks to put on a watch list and buy on a pullback. STRONG + MID = leaders that already ran, with a higher risk. AVOID = what to keep away from. These are rules of thumb, not back-tested, and they say nothing about the business: check earnings and valuation yourself.' };
    GTB_INFO['lt-levels'] = { icon: 'bi-bullseye', title: 'Buy zone and review level',
        body: 'No target is shown: a long-term holding has no sensible target price. <b>Buy zone</b>: from 3% below the 50-day average up to 5% above it, never above the current price. <b>in zone</b> means the price is already inside it, otherwise it shows how far above the zone the price is (a LATE stock usually has to pull back to it). <b>Review level</b>: the higher (nearer) of the 200-day average and the lowest close of the last 6 months. A close below it breaks the long-term picture, so it is a point to reconsider, not an automatic stop. <b>Risk %</b> is the distance from the current price down to the review level. The tooltip turns it into a position size using your risk % setting: the size at which a fall to the review level loses that share of your capital. That is only arithmetic, not a recommendation, and it ignores gaps, costs and the business itself. For exits, a trailing rule such as a close below the 200-day average, or the stage turning to 3 or 4, fits better than a target. Mechanical levels, not back-tested.' };
    GTB_INFO['lt-timing'] = { icon: 'bi-clock-history', title: 'Is it a good time to invest?',
        body: 'Where the stock is in its uptrend. The uptrend is taken to have started when the price last closed above its 200-day average. <b>EARLY</b>: up less than 30% since then and not stretched, most of the move may still be ahead. <b>MID</b>: up 30-80%. <b>LATE</b>: up 80% or more, or more than 25% above the 50-day average, so a pullback is usually a better entry than chasing. <b>PULLBACK</b>: uptrend intact (above a rising 200-day average) but 8-25% below the 52-week high, often a better price than buying at the high. <b>NO UPTREND</b>: below its 200-day average or the average is falling. The days and the gain since the start are in the row. A rule of thumb, not back-tested: strong stocks can stay LATE for a long time, and an EARLY stock can still fall.' };
    GTB_INFO['lt-overview'] = { icon: 'bi-hourglass-split', title: 'Long-term screener',
        body: 'Scans a whole NSE index list on daily candles to find stocks in a healthy long-term uptrend. <b>Score (0-9)</b> adds: trend template pass (3) or Stage 2 forming (2); price above the 200-day average (1); 200-day average rising (1); within 15% of the 52-week high (1) or within 25% (half); stronger than NIFTY 50 over 6 months (1) and 12 months (1); positive Clenow momentum (1). <b>STRONG</b> 7 or more, <b>GOOD</b> 5-6.9, <b>NEUTRAL</b> 3-4.9, <b>WEAK</b> under 3. A downtrend (Stage 4, or below a falling 200-day average) is <b>AVOID</b> whatever the score. <b>EXTENDED</b> means more than 25% above the 50-day average: a pullback is usually a better entry than chasing. All price based: there is no earnings or valuation data here, so check the business separately. <br><br><b>Backtest result</b> (NIFTY 50 and NIFTY 100, about 4 years, today members only): the chart-health verdict and score did not separate winners from losers, while the stocks in the top 20% by 12-month strength beat the bottom 20% by roughly 8 to 10 points over the following year, in both rising and falling markets. That is suggestive, not proven (survivorship bias, overlapping windows, few independent episodes). Use the strength rank to sort and filter, and treat the verdict as a checklist. A heuristic checklist, not investment advice.' };
    GTB_INFO['lt-score'] = { icon: 'bi-123', title: 'Long-term score',
        body: 'Out of 9. Trend template pass 3 (or Stage 2 forming 2) + above the 200-day average 1 + 200-day average rising 1 + within 15% of the 52-week high 1 (within 25% gives half) + stronger than NIFTY 50 over 6 months 1 + stronger over 12 months 1 + positive Clenow momentum 1. Hover a row score to see which items counted.' };
}

// ── Universe (NSE index CSV) ────────────────────────────────────────────────────────────────────────────────────────
function _ltFetchUniverse(key) {
    var def = _LT_UNIVERSES[key];
    var ckey = 'GTB_LT_UNIV_' + key;
    var today = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? CURRENT_DAY : moment().format('YYYY-MM-DD');
    var saved = null; try { saved = JSON.parse(localStorage.getItem(ckey) || 'null'); } catch (e) {}
    if (saved && saved.day === today && saved.rows && saved.rows.length) return Promise.resolve(saved.rows);
    var req = new Promise(function (resolve, reject) {
        GM_xmlhttpRequest({
            method: 'GET', url: _LT_BASE + def.file, timeout: 45000,
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
            onload: function (res) {
                if (res.status !== 200) { reject('HTTP ' + res.status); return; }
                try { resolve(_ltParseUniverse(res.responseText)); } catch (e) { reject('could not read the list: ' + e.message); }
            },
            onerror: function () { reject('network error'); },
            ontimeout: function () { reject('timed out'); }
        });
    });
    return req.then(function (rows) {
        if (!rows.length) throw new Error('the list was empty');
        try { localStorage.setItem(ckey, JSON.stringify({ day: today, rows: rows })); } catch (e) {}
        try { _gtbApiOk('lt-univ-' + key); } catch (e) {}
        return rows;
    }).catch(function (err) {
        try { _gtbApiFail('lt-univ-' + key, 'NSE ' + def.label + ' list', String(err && err.message ? err.message : err), saved && saved.rows ? 'The last saved list is used.' : 'The long-term screener cannot scan this index until it loads.'); } catch (e) {}
        if (saved && saved.rows && saved.rows.length) return saved.rows;
        throw err;
    });
}
function _ltParseUniverse(text) {
    var lines = String(text || '').split(/\r?\n/).filter(function (l) { return l && l.trim(); });
    if (lines.length < 2) return [];
    var head = _dlSplitCsvLine(lines[0]).map(function (h) { return h.trim().toLowerCase(); });
    var iSym = head.indexOf('symbol'), iCo = head.indexOf('company name'), iInd = head.indexOf('industry');
    if (iSym < 0) throw new Error('no Symbol column');
    var out = [];
    for (var i = 1; i < lines.length; i++) {
        var c = _dlSplitCsvLine(lines[i]);
        var sym = (c[iSym] || '').trim();
        if (sym) out.push({ symbol: sym, company: iCo >= 0 ? (c[iCo] || '').trim() : '', industry: iInd >= 0 ? (c[iInd] || '').trim() : '' });
    }
    return out;
}

// symbol -> Kite instrument token: NSE equities from the Kite instruments list (Data Load), with the app own tokens as a fallback
function _ltTokenMap() {
    var map = {};
    if (typeof _DL_INSTRUMENTS !== 'undefined' && _DL_INSTRUMENTS.length) {
        _DL_INSTRUMENTS.forEach(function (r) { if (r.exchange === 'NSE' && r.instrument_type === 'EQ' && r.token) map[r.tradingsymbol] = r.token; });
    }
    if (typeof INSTRUMENT_TOKENS !== 'undefined') Object.keys(INSTRUMENT_TOKENS).forEach(function (k) { if (!map[k]) map[k] = INSTRUMENT_TOKENS[k]; });
    return map;
}

// ── One stock ─────────────────────────────────────────────────────────────────────────────────────────────────────
function _ltAnalyse(meta, candles, niftyCloses) {
    var n = candles ? candles.length : 0;
    if (n < 200) return { symbol: meta.symbol, company: meta.company, industry: meta.industry, short: true, nCandles: n };
    var closes = candles.map(function (c) { return parseFloat(c[4]); });
    var ltp = closes[n - 1];
    var sma50 = _psSma(closes, 50), sma200 = _psSma(closes, 200);
    var sma200arr = _psSmaArr(closes, 200);
    var past = sma200arr[n - 1 - 25];
    var slope200 = (past && sma200arr[n - 1]) ? (sma200arr[n - 1] - past) / past * 100 : null;
    var win = closes.slice(Math.max(0, n - 252));
    var hi52 = Math.max.apply(null, win), lo52 = Math.min.apply(null, win);
    var fromHigh = (ltp / hi52 - 1) * 100;                 // 0 or negative
    var fromLow = (ltp / lo52 - 1) * 100;
    var ret = function (arr, k) { var m = arr.length; return (m > k && arr[m - 1 - k] > 0) ? (arr[m - 1] / arr[m - 1 - k] - 1) * 100 : null; };
    var r6 = ret(closes, 126), r12 = ret(closes, 252), nr6 = niftyCloses ? ret(niftyCloses, 126) : null, nr12 = niftyCloses ? ret(niftyCloses, 252) : null;
    var rs6 = (r6 != null && nr6 != null) ? r6 - nr6 : null, rs12 = (r12 != null && nr12 != null) ? r12 - nr12 : null;
    var primary = null, mom = null;
    try { primary = _psPrimaryRead(candles, niftyCloses); } catch (e) {}
    try { mom = _psMomentum(candles); } catch (e) {}
    var dir = primary && primary.ok ? primary.dir : null;
    var stageLabel = primary && primary.ok ? primary.label : 'no stage read';
    var ext50 = sma50 ? (ltp / sma50 - 1) * 100 : null;
    // average traded value over the last 50 sessions, in crores
    var tv = 0, tn = 0;
    for (var i = Math.max(0, n - 50); i < n; i++) { var v = parseFloat(candles[i][5]); if (v > 0) { tv += v * closes[i]; tn++; } }
    var valueCr = tn ? tv / tn / 1e7 : null;

    // timing: how far the uptrend has run since price last closed above the 200-day average
    var startIdx = n - 1;
    while (startIdx > 0 && sma200arr[startIdx - 1] != null && closes[startIdx - 1] > sma200arr[startIdx - 1]) startIdx--;
    var wholeHistory = startIdx === 0 || sma200arr[startIdx - 1] == null;
    var upDays = n - startIdx, gainSince = closes[startIdx] > 0 ? (ltp / closes[startIdx] - 1) * 100 : null;
    var upNow = sma200 != null && ltp > sma200 && slope200 != null && slope200 > 0;
    var timing, timingWhy;
    if (!upNow) { timing = 'NO UPTREND'; timingWhy = 'below the 200-day average or the average is not rising'; }
    else if ((ext50 != null && ext50 > 25) || (gainSince != null && gainSince >= _LT_LATE_PCT)) { timing = 'LATE'; timingWhy = (ext50 != null && ext50 > 25 ? ext50.toFixed(0) + '% above the 50-day average' : 'up ' + gainSince.toFixed(0) + '% since the uptrend began'); }
    else if (fromHigh <= -_LT_PULLBACK_MIN && fromHigh >= -25) { timing = 'PULLBACK'; timingWhy = Math.abs(fromHigh).toFixed(0) + '% below the 52-week high with the uptrend intact'; }
    else if (wholeHistory) { timing = 'MID'; timingWhy = 'above the 200-day average for the whole history loaded, start unknown'; }
    else if (gainSince != null && gainSince < _LT_EARLY_PCT) { timing = 'EARLY'; timingWhy = 'up ' + gainSince.toFixed(0) + '% since the uptrend began'; }
    else { timing = 'MID'; timingWhy = 'up ' + (gainSince != null ? gainSince.toFixed(0) : '?') + '% since the uptrend began'; }

    // buy zone and review level (no target: a long-term holding has none)
    var zoneLo = null, zoneHi = null, zoneState = null, review = null, reviewWhy = null, riskPct = null;
    if (timing !== 'NO UPTREND' && sma50) {
        zoneHi = Math.min(ltp, sma50 * 1.05);
        zoneLo = Math.min(zoneHi, sma50 * 0.97);
        if (zoneLo >= zoneHi) zoneLo = zoneHi * 0.97;
        zoneState = ltp <= sma50 * 1.05 ? 'in zone' : (ltp / (sma50 * 1.05) - 1) * 100;
    }
    if (sma200) {
        var low6m = Math.min.apply(null, closes.slice(-130));
        review = Math.max(sma200, low6m);
        reviewWhy = review === sma200 ? '200-day average' : '6-month low close';
        riskPct = (ltp - review) / ltp * 100;
    }

    var pts = 0, notes = [];
    var add = function (p, why) { pts += p; notes.push((p > 0 ? '+' : '') + p + ' ' + why); };
    if (dir === 1) add(3, 'trend template pass'); else if (dir === 0.5) add(2, 'Stage 2 forming'); else notes.push('0 no Stage 2 / trend template pass');
    if (sma200 && ltp > sma200) add(1, 'above the 200-day average'); else notes.push('0 below the 200-day average');
    if (slope200 != null && slope200 > 0) add(1, '200-day average rising'); else notes.push('0 200-day average not rising');
    if (fromHigh >= -15) add(1, 'within 15% of the 52-week high'); else if (fromHigh >= -25) add(0.5, 'within 25% of the 52-week high'); else notes.push('0 more than 25% below the 52-week high');
    if (rs6 != null && rs6 > 0) add(1, 'stronger than NIFTY 50 over 6 months'); else notes.push('0 not stronger than NIFTY 50 over 6 months');
    if (rs12 != null && rs12 > 0) add(1, 'stronger than NIFTY 50 over 12 months'); else notes.push('0 not stronger than NIFTY 50 over 12 months');
    if (mom && mom.ok && mom.score > 0) add(1, 'positive Clenow momentum'); else notes.push('0 momentum not positive');

    var down = (dir != null && dir < 0) || (sma200 && ltp < sma200 && slope200 != null && slope200 < 0);
    var verdict, tone;
    if (down) { verdict = 'AVOID'; tone = 'red'; }
    else if (pts >= 7) { verdict = 'STRONG'; tone = 'green'; }
    else if (pts >= 5) { verdict = 'GOOD'; tone = 'green'; }
    else if (pts >= 3) { verdict = 'NEUTRAL'; tone = 'amber'; }
    else { verdict = 'WEAK'; tone = 'muted'; }
    return { symbol: meta.symbol, token: meta.token, company: meta.company, industry: meta.industry, ltp: ltp, sma200: sma200, vs200: sma200 ? (ltp / sma200 - 1) * 100 : null,
        slope200: slope200, hi52: hi52, fromHigh: fromHigh, fromLow: fromLow, rs6: rs6, rs12: rs12, r12: r12, stage: stageLabel, dir: dir,
        momentum: (mom && mom.ok) ? mom.annualizedPct : null, momScore: (mom && mom.ok) ? mom.score : null, ext50: ext50, extended: ext50 != null && ext50 > 25,
        valueCr: valueCr, thin: valueCr != null && valueCr < 1, timing: timing, timingWhy: timingWhy, zoneLo: zoneLo, zoneHi: zoneHi, zoneState: zoneState, review: review, reviewWhy: reviewWhy, riskPct: riskPct, upDays: upDays, gainSince: gainSince, wholeHistory: wholeHistory, score: pts, notes: notes, verdict: verdict, tone: tone, nCandles: n };
}

// ── Scan ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function _ltRunScan() {
    if (_LT_STATE.scanning) return;
    var key = _LT_STATE.universe, def = _LT_UNIVERSES[key];
    var setProg = function (t) { jQ('#lt-progress').text(t); };
    var tokens = _ltTokenMap();
    var haveInstr = (typeof _DL_INSTRUMENTS !== 'undefined' && _DL_INSTRUMENTS.length);
    if (!haveInstr) { setProg('Load the Kite instruments first: Data Load, then Load Instruments. Without them only the stocks the app already knows can be scanned.'); }
    _LT_STATE.scanning = true; _LT_STATE.stop = false;
    jQ('#lt-scan-btn').prop('disabled', true); jQ('#lt-stop-btn').show();
    try {
        setProg('Downloading the ' + def.label + ' list from NSE…');
        var list = await _ltFetchUniverse(key);
        var nTok = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS['NIFTY 50'] : null;
        var niftyCloses = null;
        var niftyDates = null;
        if (nTok) { try { var nc = await _psFetchDaily(nTok, _LT_LOOKBACK_DAYS); niftyCloses = nc.map(function (c) { return parseFloat(c[4]); }); niftyDates = nc.map(function (c) { return String(c[0]).slice(0, 10); }); } catch (e) {} }
        _LT_CACHE = {};
        _LT_META = { universe: key, total: list.length, scanned: 0, noToken: [], noData: [], at: moment().format('YYYY-MM-DD HH:mm'), asOf: (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? CURRENT_DAY : moment().format('YYYY-MM-DD') };
        try { _LT_META.mkt = _ltMarketState(niftyCloses, niftyDates); } catch (e) {}
        var todo = [];
        list.forEach(function (m) { if (tokens[m.symbol]) todo.push(m); else _LT_META.noToken.push(m.symbol); });
        var done = 0;
        var work = async function (m) {
            try {
                var candles = await _psFetchDaily(tokens[m.symbol], _LT_LOOKBACK_DAYS);
                m.token = tokens[m.symbol];
                var row = _ltAnalyse(m, candles, niftyCloses);
                if (row.short) _LT_META.noData.push(m.symbol + ' (' + row.nCandles + ' days)'); else _LT_CACHE[m.symbol] = row;
            } catch (e) { _LT_META.noData.push(m.symbol + ' (fetch failed)'); }
            done++; _LT_META.scanned = done;
            if (done % 20 === 0 || done === todo.length) { setProg('Scanning ' + done + ' / ' + todo.length + '…'); _ltRender(); }
        };
        var idx = 0, workers = [];
        for (var w = 0; w < _LT_POOL; w++) workers.push((async function () { while (idx < todo.length && !_LT_STATE.stop) { var it = todo[idx++]; await work(it); } })());
        await Promise.all(workers);
        setProg((_LT_STATE.stop ? 'Stopped at ' : 'Done: ') + Object.keys(_LT_CACHE).length + ' stocks analysed' + (_LT_META.noToken.length ? ', ' + _LT_META.noToken.length + ' without a Kite token' : '') + (_LT_META.noData.length ? ', ' + _LT_META.noData.length + ' without enough history' : '') + '.');
        try { localStorage.setItem('GTB_LT_SCAN_' + key, JSON.stringify({ at: _LT_META.at, meta: _LT_META, rows: _LT_CACHE })); } catch (e) {}
    } catch (e) {
        setProg('Scan failed: ' + (e && e.message ? e.message : e));
    }
    _LT_STATE.scanning = false; jQ('#lt-scan-btn').prop('disabled', false); jQ('#lt-stop-btn').hide();
    _ltRender();
}
function _ltRestore(key) {
    try {
        var s = JSON.parse(localStorage.getItem('GTB_LT_SCAN_' + key) || 'null');
        if (s && s.rows) { _LT_CACHE = s.rows; _LT_META = s.meta || _LT_META; jQ('#lt-progress').text('Last scan ' + s.at + ' (saved in this browser). Scan again for fresh data.'); return true; }
    } catch (e) {}
    return false;
}

// ── View ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function _ltContentHtml() {
    var opts = Object.keys(_LT_UNIVERSES).map(function (k) { return '<option value="' + k + '"' + (k === _LT_STATE.universe ? ' selected' : '') + '>' + _LT_UNIVERSES[k].label + '</option>'; }).join('');
    return '<div class="ps-controls">'
        + '<span style="font-size:0.6rem;font-weight:800;letter-spacing:0.05em;">LONG-TERM</span>' + (typeof _ii === 'function' ? _ii('lt-overview') : '')
        + '<select id="lt-universe" class="sv-pill-btn">' + opts + '</select>'
        + '<button id="lt-scan-btn" class="sv-load-btn" type="button"><i class="bi bi-play-fill"></i> SCAN</button>'
        + '<button id="lt-stop-btn" class="sv-pill-btn" type="button" style="display:none;"><i class="bi bi-stop-fill"></i> Stop</button>'
        + '<span id="lt-progress" class="ps-progress"></span>'
        + '<span id="lt-summary" class="ps-summary" style="margin-left:auto;"></span>'
        + '<button id="lt-backtest-btn" class="sv-pill-btn" type="button" title="Replay this scoring at past month-ends on the selected index and see how each verdict and timing group did over the next 3, 6 and 12 months against NIFTY 50."><i class="bi bi-clock-history"></i> BACKTEST</button>'
        + '<button id="lt-fwtest-btn" class="sv-pill-btn" type="button" title="Take the stocks as they stood on the scan date (the app date), enter at that day close and see how the table as shown, the SHORTLIST and the strength groups did over the next 5 to 20 sessions against NIFTY 50."><i class="bi bi-fast-forward"></i> FORWARD TEST</button>'
        + '<button id="lt-screentest-btn" class="sv-pill-btn" type="button" title="Apply the screen as it is set now (SHORTLIST or the filters) point in time on many past dates and see how its picks did over the next 5 to 20 sessions against NIFTY 50 and against all analysed stocks."><i class="bi bi-calendar-range"></i> SCREEN TEST</button>'
        + '<button id="lt-basket-btn" class="sv-pill-btn" type="button" title="Add the ticked stocks to a Kite basket as CNC delivery BUY orders. Quantity = your Long-term margin setting divided by the price (Settings)."><i class="bi bi-cart-plus"></i> Add to Basket (<span id="lt-basket-count">0</span>)</button>'
        + '<button id="lt-shortlist-btn" class="sv-pill-btn' + (_LT_STATE.shortlist ? ' sv-seg-active' : '') + '" type="button" title="One-click shortlist: top 20% by 12-month strength, above a rising 200-day average, and not thin. Built on the one measure that held up in the backtests (NIFTY 50, 100 and 200)."><i class="bi bi-bookmark-star"></i> SHORTLIST</button>'
        + (typeof _ii === 'function' ? _ii('lt-filters') : '')
        + '<select id="lt-filter" class="sv-pill-btn"' + (_LT_STATE.shortlist ? ' disabled' : '') + '>'
        +   ['all:All', 'top20:Top 20% by 12m strength', 'good:STRONG + GOOD', 'strong:STRONG only', 'neutral:NEUTRAL', 'weak:WEAK', 'avoid:AVOID'].map(function (o) { var i = o.indexOf(':'), v = o.slice(0, i); return '<option value="' + v + '" title="' + (_LT_TIPS[v] || '') + '"' + (v === _LT_STATE.filter ? ' selected' : '') + '>' + o.slice(i + 1) + '</option>'; }).join('')
        + '</select>'
        + '<select id="lt-timing" class="sv-pill-btn" title="Where the stock is in its uptrend"' + (_LT_STATE.shortlist ? ' disabled' : '') + '>'
        +   ['all:Any timing', 'EARLY:EARLY', 'MID:MID', 'PULLBACK:PULLBACK', 'LATE:LATE', 'NO UPTREND:NO UPTREND'].map(function (o) { var i = o.indexOf(':'), v = o.slice(0, i); return '<option value="' + v + '" title="' + (_LT_TIPS[v] || '') + '"' + (v === _LT_STATE.timing ? ' selected' : '') + '>' + o.slice(i + 1) + '</option>'; }).join('')
        + '</select>'
        + '<select id="lt-sort" class="sv-pill-btn">'
        +   ['rank:Sort: 12m strength rank', 'score:Sort: Score', 'name:Sort: Name', 'high:Sort: Near 52w high', 'rs12:Sort: 12m strength', 'mom:Sort: Momentum', 'value:Sort: Liquidity', 'timing:Sort: Timing (early first)'].map(function (o) { var i = o.indexOf(':'), v = o.slice(0, i); return '<option value="' + v + '"' + (v === _LT_STATE.sort ? ' selected' : '') + '>' + o.slice(i + 1) + '</option>'; }).join('')
        + '</select>'
        + '<input type="text" id="lt-search" class="dl-search" style="width:130px;margin:0;" placeholder="Search…" value="' + (_LT_STATE.search || '') + '">'
        + '</div>'
        + '<div id="lt-mkt" style="padding:5px 8px;font-size:0.54rem;line-height:1.5;border-bottom:1px solid var(--gtb-border);"></div>'
        + '<div id="lt-table-wrap" class="ps-table-wrap" style="flex:0 0 auto;height:60vh;max-height:none;overflow:auto;"><div class="sv-empty-state"><i class="bi bi-hourglass-split"></i><span>Choose an index and click SCAN. It needs the Kite instruments loaded (Data Load).</span></div></div>';
}

// Arithmetic only: the position size (share of capital) at which a fall to the review level loses the risk-per-trade share of capital.
function _ltSizeTip(riskPct) {
    if (riskPct == null || !(riskPct > 0)) return 'Distance from the current price to the review level.';
    var budget = (typeof RISK_PCT_PER_TRADE !== 'undefined') ? parseFloat(RISK_PCT_PER_TRADE) : NaN;
    if (!(budget > 0)) return 'Distance from the current price to the review level.';
    var size = Math.min(100, budget / riskPct * 100);
    return 'Distance to the review level. With a risk budget of ' + budget + '% of capital, a fall to it loses that share when the position is about ' + size.toFixed(0) + '% of capital. Arithmetic only, not a recommendation.';
}
// Sizes the table area in pixels from the real height of the popup (or Dashboard tab) minus what sits above it, so it fills the
// window and scrolls inside. The flex chain does not give this area a height here (the swing table uses a viewport ceiling instead).
function _ltFit() {
    var $w = jQ('#lt-table-wrap');
    if (!$w.length || !$w.is(':visible')) return;
    var $c = $w.closest('.popupwindow_content');
    if (!$c.length) $c = $w.closest('#gtb-pane-positional');
    var h = $c.length ? $c.innerHeight() - ($w.offset().top - $c.offset().top) - 6 : window.innerHeight * 0.7;
    $w.css({ height: Math.max(200, Math.floor(h)) + 'px', flex: '0 0 auto', maxHeight: 'none', overflow: 'auto' });
    if ($c.length && !$c.data('ltWatch') && typeof ResizeObserver !== 'function') $c.data('ltWatch', 1);
    else if ($c.length && !$c.data('ltWatch')) { $c.data('ltWatch', 1); try { new ResizeObserver(function () { _ltFit(); }).observe($c[0]); } catch (e) {} }
}
jQ(window).on('resize', function () { try { _ltFit(); } catch (e) {} });
function _ltChartUrl(r) { return 'https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/' + encodeURIComponent(r.symbol) + '/' + r.token; }
// ── Market state line ───────────────────────────────────────────────────────────────────────────────────────────────
// Where NIFTY 50 stands against its own 200-day average on the scan date, so a shortlist is never read without the market behind it.
// Computed from the NIFTY closes the scan already loads (no extra fetch) and saved with the scan in _LT_META.mkt. Information only:
// no rule in the screener uses it, and "do not buy while below" has not been tested.
function _ltMarketState(closes, dates) {
    if (!closes || closes.length < 215) return null;
    var n = closes.length, last = n - 1, sma = _psSmaArr(closes, 200);
    if (sma[last] == null) return null;
    var above = closes[last] > sma[last], streak = 0;
    for (var i = last; i >= 0 && sma[i] != null && ((closes[i] > sma[i]) === above); i--) streak++;
    var hi = Math.max.apply(null, closes.slice(Math.max(0, n - 250)));
    var slope = sma[last - 20] != null ? (sma[last] / sma[last - 20] - 1) * 100 : null;
    return { date: dates ? dates[last] : '', close: closes[last], sma: sma[last], vs: (closes[last] / sma[last] - 1) * 100, above: above, streak: streak, fromHigh: (closes[last] / hi - 1) * 100, slope: slope };
}
function _ltRenderMarket() {
    var $m = jQ('#lt-mkt'); if (!$m.length) return;
    var G = 'var(--gtb-green)', R = 'var(--gtb-red)', A = 'var(--gtb-amber)', M = 'var(--gtb-muted)';
    var m = _LT_META && _LT_META.mkt;
    if (!m) { $m.html('<span style="color:' + M + ';">Market state: scan again to see where NIFTY 50 stands against its 200-day average.</span>'); return; }
    var near = Math.abs(m.vs) < 1;
    var col = near ? A : (m.above ? G : R);
    var word = near ? 'AT ITS 200-DAY AVERAGE' : (m.above ? 'ABOVE ITS 200-DAY AVERAGE' : 'BELOW ITS 200-DAY AVERAGE');
    var pc = function (x) { return (x >= 0 ? '+' : '') + x.toFixed(1) + '%'; };
    $m.html('<b style="color:' + col + ';">MARKET: NIFTY 50 ' + word + '</b> <span style="color:' + M + ';">as of ' + (m.date || (_LT_META.asOf || '')) + ': ' + m.close.toFixed(0) + ' vs ' + m.sma.toFixed(0) + ' (' + pc(m.vs) + '), '
        + (m.above ? 'above' : 'below') + ' it for ' + m.streak + ' sessions, 200-day average ' + (m.slope == null ? '' : (m.slope >= 0 ? 'rising' : 'falling') + ' (' + pc(m.slope) + ' in 20 sessions), ') + pc(m.fromHigh) + ' from its 1-year high. '
        + 'Information only: no filter here uses it. Screen results in the tests moved with the market.</span>');
}
function _ltRender() {
    var $w = jQ('#lt-table-wrap'); if (!$w.length) return;
    _ltRenderMarket();
    var G = 'var(--gtb-green)', R = 'var(--gtb-red)', A = 'var(--gtb-amber)', M = 'var(--gtb-muted)';
    var tone = function (t) { return t === 'green' ? G : t === 'red' ? R : t === 'amber' ? A : M; };
    var all = Object.keys(_LT_CACHE).map(function (k) { return _LT_CACHE[k]; });
    if (!all.length) { return; }
    // 12-month strength rank among the analysed stocks (1 = strongest against NIFTY 50)
    var rk = all.filter(function (r) { return r.rs12 != null; }).sort(function (a, b) { return b.rs12 - a.rs12; });
    all.forEach(function (r) { r.rank = null; r.rankN = rk.length; });
    rk.forEach(function (r, i) { r.rank = i + 1; });
    var count = function (v) { return all.filter(function (r) { return r.verdict === v; }).length; };
    jQ('#lt-summary').html('<span style="color:' + G + ';">STRONG ' + count('STRONG') + '</span><span style="color:' + G + ';">GOOD ' + count('GOOD') + '</span><span style="color:' + A + ';">NEUTRAL ' + count('NEUTRAL') + '</span><span style="color:' + M + ';">WEAK ' + count('WEAK') + '</span><span style="color:' + R + ';">AVOID ' + count('AVOID') + '</span>');
    jQ('#lt-summary').append('<span style="color:var(--gtb-accent);">SHORTLIST ' + all.filter(_ltIsShortlist).length + '</span>');
    var f = _LT_STATE.filter, q = (_LT_STATE.search || '').toUpperCase();
    var rows = all.filter(function (r) {
        if (_LT_STATE.shortlist) {
            if (!_ltIsShortlist(r)) return false;
            if (q && (r.symbol + ' ' + r.company + ' ' + r.industry).toUpperCase().indexOf(q) < 0) return false;
            return true;
        }
        if (f === 'top20' && !(r.rank && r.rank / r.rankN <= 0.2)) return false;
        if (f === 'good' && !(r.verdict === 'STRONG' || r.verdict === 'GOOD')) return false;
        if (f === 'strong' && r.verdict !== 'STRONG') return false;
        if (f === 'neutral' && r.verdict !== 'NEUTRAL') return false;
        if (f === 'weak' && r.verdict !== 'WEAK') return false;
        if (f === 'avoid' && r.verdict !== 'AVOID') return false;
        if (_LT_STATE.timing !== 'all' && r.timing !== _LT_STATE.timing) return false;
        if (q && (r.symbol + ' ' + r.company + ' ' + r.industry).toUpperCase().indexOf(q) < 0) return false;
        return true;
    });
    var s = _LT_STATE.sort, num = function (x) { return x == null ? -1e9 : x; };
    rows.sort(function (a, b) {
        if (s === 'name') return a.symbol < b.symbol ? -1 : 1;
        if (s === 'rank') return ((a.rank || 1e9) - (b.rank || 1e9)) || (b.score - a.score);
        if (s === 'high') return num(b.fromHigh) - num(a.fromHigh);
        if (s === 'rs12') return num(b.rs12) - num(a.rs12);
        if (s === 'mom') return num(b.momentum) - num(a.momentum);
        if (s === 'value') return num(b.valueCr) - num(a.valueCr);
        if (s === 'timing') { var ord = { 'EARLY': 0, 'PULLBACK': 1, 'MID': 2, 'LATE': 3, 'NO UPTREND': 4 }; return (ord[a.timing] - ord[b.timing]) || (b.score - a.score); }
        return b.score - a.score || num(b.rs12) - num(a.rs12);
    });
    _LT_VIEW = rows.map(function (r) { return r.symbol; });
    var pc = function (x, d) { return x == null ? '-' : (x >= 0 ? '+' : '') + x.toFixed(d == null ? 1 : d) + '%'; };
    var cc = function (x) { return x == null ? M : x > 0 ? G : x < 0 ? R : M; };
    var th = 'padding:3px 8px;text-align:right;font-size:0.46rem;letter-spacing:0.04em;color:var(--gtb-muted);position:sticky;top:0;background:var(--gtb-surface);';
    var td = 'padding:3px 8px;text-align:right;border-top:1px solid var(--gtb-border);font-family:var(--gtb-mono);white-space:nowrap;';
    var tdl = 'padding:3px 8px;text-align:left;border-top:1px solid var(--gtb-border);white-space:nowrap;';
    var tokMap = null;   // rows saved by an earlier version have no token: look it up now so the chart link still shows
    var body = rows.map(function (r) {
        if (!r.token) { if (!tokMap) tokMap = _ltTokenMap(); r.token = tokMap[r.symbol]; }
        var tip = r.notes.join('\n').replace(/"/g, '&quot;');
        return '<tr>'
            + '<td style="' + tdl + '"><input type="checkbox" class="lt-basket-chk" data-sym="' + r.symbol + '"' + (_LT_BASKET_SELECTED[r.symbol] ? ' checked' : '') + '></td>'
            + '<td style="' + tdl + 'font-weight:700;" title="' + (r.company || '').replace(/"/g, '&quot;') + '">' + (r.token ? '<a href="' + _ltChartUrl(r) + '" target="_blank" rel="noopener" title="Open the ' + r.symbol + ' chart in Kite" style="color:inherit;text-decoration:underline dotted;">' + r.symbol + '</a> <a href="' + _ltChartUrl(r) + '" target="_blank" rel="noopener" title="Open the ' + r.symbol + ' chart in Kite" style="color:var(--gtb-accent);">&#128200;</a>' : r.symbol) + ' <span style="font-weight:400;color:' + M + ';font-size:0.46rem;">' + (r.industry || '') + '</span></td>'
            + '<td style="' + td + 'color:' + (r.rank == null ? M : r.rank / r.rankN <= 0.2 ? G : r.rank / r.rankN > 0.8 ? R : 'var(--gtb-text)') + ';font-weight:' + (r.rank != null && r.rank / r.rankN <= 0.2 ? 800 : 400) + ';" title="12-month return vs NIFTY 50: ' + (r.rs12 == null ? 'n/a' : (r.rs12 >= 0 ? '+' : '') + r.rs12.toFixed(1) + ' points') + '. Rank among the ' + r.rankN + ' analysed stocks, 1 = strongest.">' + (r.rank == null ? '-' : '#' + r.rank + ' <span style="font-weight:400;color:' + M + ';font-size:0.46rem;">of ' + r.rankN + '</span>') + '</td>'
            + '<td style="' + tdl + 'color:' + tone(r.tone) + ';font-weight:800;">' + r.verdict + (r.extended && r.verdict !== 'AVOID' ? ' <span style="color:' + A + ';font-weight:600;" title="More than 25% above the 50-day average: a pullback is usually a better entry than chasing.">EXTENDED</span>' : '') + (r.thin ? ' <span style="color:' + M + ';font-weight:400;" title="Under about 1 crore traded per day: thin.">THIN</span>' : '') + '</td>'
            + '<td style="' + td + 'color:' + tone(r.tone) + ';" title="' + tip + '">' + r.score.toFixed(1) + ' / 9</td>'
            + '<td style="' + tdl + 'color:' + (r.timing === 'EARLY' || r.timing === 'PULLBACK' ? G : r.timing === 'MID' ? A : r.timing === 'LATE' ? R : M) + ';font-weight:700;" title="' + (r.timingWhy || '').replace(/"/g, '&quot;') + '">' + r.timing + (r.gainSince != null && r.timing !== 'NO UPTREND' ? ' <span style="font-weight:400;color:' + M + ';font-size:0.46rem;">' + (r.wholeHistory ? '>' : '') + r.upDays + 'd &middot; ' + (r.gainSince >= 0 ? '+' : '') + r.gainSince.toFixed(0) + '%</span>' : '') + '</td>'
            + '<td style="' + td + '">' + r.ltp.toFixed(1) + '</td>'
            + '<td style="' + td + '">' + (r.zoneLo == null ? '<span style="color:' + M + ';">-</span>' : r.zoneLo.toFixed(1) + ' - ' + r.zoneHi.toFixed(1) + ' <span style="color:' + (r.zoneState === 'in zone' ? G : A) + ';font-size:0.46rem;">' + (r.zoneState === 'in zone' ? 'in zone' : r.zoneState.toFixed(0) + '% above') + '</span>') + '</td>'
            + '<td style="' + td + '" title="' + (r.reviewWhy || '') + '">' + (r.review == null ? '-' : r.review.toFixed(1)) + '</td>'
            + '<td style="' + td + 'color:' + (r.riskPct == null ? M : r.riskPct <= 15 ? G : r.riskPct <= 25 ? A : R) + ';" title="' + _ltSizeTip(r.riskPct) + '">' + (r.riskPct == null ? '-' : r.riskPct.toFixed(0) + '%') + '</td>'
            + '<td style="' + td + 'color:' + cc(r.vs200) + ';">' + pc(r.vs200) + '</td>'
            + '<td style="' + td + 'color:' + (r.fromHigh >= -15 ? G : r.fromHigh >= -25 ? A : R) + ';">' + pc(r.fromHigh) + '</td>'
            + '<td style="' + td + 'color:' + cc(r.rs6) + ';">' + pc(r.rs6) + '</td>'
            + '<td style="' + td + 'color:' + cc(r.rs12) + ';">' + pc(r.rs12) + '</td>'
            + '<td style="' + tdl + 'color:' + (r.dir >= 0.5 ? G : r.dir < 0 ? R : M) + ';">' + (r.stage || '-') + '</td>'
            + '<td style="' + td + 'color:' + cc(r.momentum) + ';">' + pc(r.momentum, 0) + '</td>'
            + '<td style="' + td + '">' + (r.valueCr == null ? '-' : r.valueCr.toFixed(1)) + '</td></tr>';
    }).join('');
    var head = '<tr><th style="' + th + 'text-align:left;"><input type="checkbox" id="lt-select-all" title="Tick every stock shown"></th><th style="' + th + 'text-align:left;">STOCK</th><th style="' + th + '" title="12-month return against NIFTY 50, ranked among the analysed stocks. The one measure that held up in the backtest.">STRENGTH RANK (12M)</th><th style="' + th + 'text-align:left;" title="The chart-health checklist. In the backtest it did not separate winners from losers, so do not read it as a prediction.">CHART HEALTH</th><th style="' + th + '">SCORE' + (typeof _ii === 'function' ? _ii('lt-score') : '') + '</th><th style="' + th + 'text-align:left;">TIMING' + (typeof _ii === 'function' ? _ii('lt-timing') : '') + '</th><th style="' + th + '">LTP</th><th style="' + th + '">BUY ZONE' + (typeof _ii === 'function' ? _ii('lt-levels') : '') + '</th><th style="' + th + '">REVIEW LEVEL</th><th style="' + th + '">RISK TO IT</th><th style="' + th + '">VS 200-DAY</th><th style="' + th + '">FROM 52W HIGH</th><th style="' + th + '">6M VS NIFTY</th><th style="' + th + '">12M VS NIFTY</th><th style="' + th + 'text-align:left;">STAGE</th><th style="' + th + '">MOMENTUM (ANNUAL)</th><th style="' + th + '">TRADED CR / DAY</th></tr>';
    var note = '<div class="oss-desc" style="padding:6px 8px;">Showing ' + rows.length + ' of ' + all.length + ' analysed' + (_LT_META.total ? ' (' + _LT_META.total + ' in the list' + (_LT_META.noToken.length ? ', ' + _LT_META.noToken.length + ' without a Kite token' : '') + ')' : '') + '. Price based only: nothing here covers earnings or valuation. What the tests found (today\'s index members, so flattering): the verdict, score and timing labels did not predict returns, and screens built on them had no edge over 2 to 4 weeks; the 12-month strength rank beat the whole list over 3 to 12 months on a small number of dates, with an edge that shrank recently. Nothing here predicts or guarantees a return, and single stocks fell 12 to 25% in these tests. Use it to pick stocks to research, not as a buy signal. Not investment advice.'
        + (_LT_META.noToken.length ? '<br>No Kite token: ' + _LT_META.noToken.slice(0, 30).join(', ') + (_LT_META.noToken.length > 30 ? ' and ' + (_LT_META.noToken.length - 30) + ' more' : '') : '') + '</div>';
    $w.html('<table style="width:100%;border-collapse:collapse;font-size:0.56rem;"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>' + note);
    _ltFit();
    _ltUpdateBasketCount();
}

// ── Add to Basket ───────────────────────────────────────────────────────────────────────────────────────────────────
// Quantity = Long-term margin (Settings) divided by the price, rounded down, one CNC (delivery) BUY MARKET order per ticked stock.
// Each stock is sized against the full margin figure on its own, so ticking several uses that amount for each of them.
// Reuses the swing screener basket helpers (_psBasketFetch, _psFetchBaskets, _psCreateBasket) for the Kite calls.
function _ltMargin() { return (typeof LONG_TERM_MARGIN !== 'undefined' ? parseFloat(LONG_TERM_MARGIN) : NaN) || 0; }
function _ltQty(r) { var m = _ltMargin(); return (m > 0 && r && r.ltp > 0) ? Math.floor(m / r.ltp) : 0; }
function _ltBasketNames() { return Object.keys(_LT_BASKET_SELECTED).filter(function (k) { return _LT_BASKET_SELECTED[k] && _LT_CACHE[k]; }); }
function _ltUpdateBasketCount() { jQ('#lt-basket-count').text(_ltBasketNames().length); }
function _ltBasketPickerHtml() {
    var names = _ltBasketNames(), m = _ltMargin(), total = 0;
    var lines = names.map(function (k) {
        var r = _LT_CACHE[k], q = _ltQty(r), amt = q * r.ltp; total += amt;
        return '<tr><td style="padding:2px 6px;font-weight:700;">' + k + '</td><td style="padding:2px 6px;text-align:right;font-family:var(--gtb-mono);">' + r.ltp.toFixed(1) + '</td>'
            + '<td style="padding:2px 6px;text-align:right;font-family:var(--gtb-mono);color:' + (q > 0 ? 'var(--gtb-text)' : 'var(--gtb-red)') + ';">' + (q > 0 ? q : 'margin too small') + '</td>'
            + '<td style="padding:2px 6px;text-align:right;font-family:var(--gtb-mono);color:var(--gtb-muted);">' + (q > 0 ? Math.round(amt).toLocaleString('en-IN') : '-') + '</td></tr>';
    }).join('');
    return '<div id="lt-basket-wrap" style="padding:12px;font-size:0.66rem;color:var(--gtb-text);">'
        + '<div style="color:var(--gtb-muted);margin-bottom:6px;">CNC delivery BUY, market orders. Long-term margin per stock: <b style="color:var(--gtb-text);">&#8377;' + m.toLocaleString('en-IN') + '</b> (Settings). Quantity = margin / price, rounded down.</div>'
        + '<div style="max-height:150px;overflow:auto;margin-bottom:8px;"><table style="width:100%;border-collapse:collapse;"><thead><tr style="font-size:0.5rem;color:var(--gtb-muted);"><th style="text-align:left;padding:2px 6px;">STOCK</th><th style="text-align:right;padding:2px 6px;">PRICE</th><th style="text-align:right;padding:2px 6px;">QTY</th><th style="text-align:right;padding:2px 6px;">AMOUNT</th></tr></thead><tbody>' + lines + '</tbody></table></div>'
        + '<div style="color:var(--gtb-muted);margin-bottom:8px;">Total about &#8377;' + Math.round(total).toLocaleString('en-IN') + ' for ' + names.length + ' stock(s). Prices are the last scan close; the order fills at the market price.</div>'
        + '<div id="lt-basket-list"><i class="bi bi-hourglass-split"></i> Loading baskets…</div>'
        + '<div style="margin-top:10px;display:flex;gap:6px;"><input type="text" id="lt-basket-new-name" placeholder="New basket name…" style="flex:1;padding:5px 8px;background:var(--gtb-surface2);color:var(--gtb-text);border:1px solid var(--gtb-border);">'
        + '<button id="lt-basket-new-btn" class="sv-pill-btn" type="button"><i class="bi bi-plus-circle"></i> Create &amp; Add</button></div>'
        + '<div id="lt-basket-status" style="margin-top:8px;color:var(--gtb-muted);"></div></div>';
}
function _ltRenderBasketList(baskets) {
    if (!baskets.length) { jQ('#lt-basket-list').html('<span style="color:var(--gtb-muted);">No baskets yet. Create one below.</span>'); return; }
    jQ('#lt-basket-list').html(baskets.map(function (b) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--gtb-border2);"><span>' + b.name + ' <span style="color:var(--gtb-muted);">(' + (b.items ? b.items.length : 0) + ' items)</span></span>'
            + '<button class="sv-pill-btn lt-basket-pick" data-id="' + b.id + '" data-name="' + String(b.name).replace(/"/g, '&quot;') + '" type="button">Add Here</button></div>';
    }).join(''));
}
async function _ltRunBasketAdd(basketId, basketName) {
    var $s = jQ('#lt-basket-status'), names = _ltBasketNames(), ok = 0, failed = [];
    for (var i = 0; i < names.length; i++) {
        var r = _LT_CACHE[names[i]], qty = _ltQty(r);
        if (qty < 1) { failed.push(names[i] + ': the margin is smaller than one share'); continue; }
        $s.html('<i class="bi bi-hourglass-split"></i> Adding ' + (i + 1) + ' / ' + names.length + ' ' + names[i] + '…');
        var params = { transaction_type: 'BUY', product: 'CNC', order_type: 'MARKET', validity: 'DAY', validity_ttl: 1, variety: 'regular', quantity: qty, price: 0, trigger_price: 0, disclosed_quantity: 0, tags: [] };
        try { await _psBasketFetch(BASE_URL + '/api/baskets/' + basketId + '/items', 'POST', { tradingsymbol: names[i], exchange: 'NSE', weight: 0, params: JSON.stringify(params) }); ok++; }
        catch (e) { failed.push(names[i] + ': ' + e); }
        await new Promise(function (res) { setTimeout(res, 350); });
    }
    if (ok) { names.forEach(function (k) { delete _LT_BASKET_SELECTED[k]; }); _ltRender(); }
    $s.html('<b style="color:' + (failed.length ? 'var(--gtb-amber)' : 'var(--gtb-green)') + ';">Added ' + ok + ' / ' + names.length + ' to "' + basketName + '"</b>' + (failed.length ? '<br><span style="color:var(--gtb-red);">' + failed.join('<br>') + '</span>' : ''));
    try { _gtbToast(ok + ' stock(s) added to basket "' + basketName + '"' + (failed.length ? ' (' + failed.length + ' failed)' : ''), failed.length ? 'error' : 'success'); } catch (e) {}
}
jQ(document).on('change', '.lt-basket-chk', function () {
    var k = jQ(this).attr('data-sym');
    if (this.checked) _LT_BASKET_SELECTED[k] = true; else delete _LT_BASKET_SELECTED[k];
    _ltUpdateBasketCount();
});
jQ(document).on('change', '#lt-select-all', function () {
    var on = this.checked;
    jQ('.lt-basket-chk').prop('checked', on).each(function () { var k = jQ(this).attr('data-sym'); if (on) _LT_BASKET_SELECTED[k] = true; else delete _LT_BASKET_SELECTED[k]; });
    _ltUpdateBasketCount();
});
jQ(document).on('click', '#lt-basket-btn', function () {
    var names = _ltBasketNames();
    if (!names.length) { try { _gtbToast('Tick at least one stock first (checkbox column, left of the symbol).', 'error'); } catch (e) {} return; }
    if (!(_ltMargin() > 0)) { try { _gtbToast('Set the Long-term margin per stock in Settings first.', 'error'); } catch (e) {} return; }
    showPopUpWindow('lt-basket-picker', _ltBasketPickerHtml(), 'Add ' + names.length + ' stock(s) to basket', 480, 460);
    var cls = 'popup-custom-style-lt-basket-picker';
    var title = '<div style="display:flex;align-items:center;gap:6px;width:100%;"><span style="font-weight:800;font-size:0.7rem;">ADD ' + names.length + ' STOCK(S) TO BASKET</span>' + popupWinControls(cls) + '</div>';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html(title);
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
    _psFetchBaskets().then(_ltRenderBasketList, function (err) { jQ('#lt-basket-list').html('<span style="color:var(--gtb-red);">' + err + '</span>'); });
});
jQ(document).on('click', '.lt-basket-pick', function () { _ltRunBasketAdd(jQ(this).attr('data-id'), jQ(this).attr('data-name')); });
jQ(document).on('click', '#lt-basket-new-btn', function () {
    var name = (jQ('#lt-basket-new-name').val() || '').trim();
    if (!name) { try { _gtbToast('Enter a basket name first', 'error'); } catch (e) {} return; }
    var $s = jQ('#lt-basket-status'); $s.html('<i class="bi bi-hourglass-split"></i> Creating basket…');
    _psCreateBasket(name).then(function (b) { _ltRunBasketAdd(b.id, b.name); }, function (err) { $s.html('<span style="color:var(--gtb-red);">' + err + '</span>'); });
});

// ── Backtest ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Replays the scoring at past month-ends on the selected index list, using only the candles up to each date (point in time), then
// measures what each stock did over the next 3, 6 and 12 months against NIFTY 50. Groups: verdict, timing, old SHORTLIST, and the strength combinations.
// Limits, stated in the result: the list is TODAY'S index members (survivorship bias flatters the result), price-based only,
// no costs or taxes, overlapping windows. A description of what happened, not a forecast.
var _LT_BT_DAYS = 1900;                 // calendar days of daily candles fetched per stock (Kite allows up to 2000 per request)
var _LT_BT_MIN_HIST = 300;              // sessions of history needed before the first test date
var _LT_BT_STEP = 21;                   // sessions between test dates (about monthly)
var _LT_BT_H = [10, 63, 126, 252];      // forward horizons in sessions: 10 (two weeks), then about 3, 6 and 12 months
var _LT_BT = { running: false, stop: false };
function _ltIdxAtDate(dates, ds) {      // last index whose date is on or before ds (ISO strings compare correctly)
    var lo = 0, hi = dates.length - 1, ans = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (dates[mid] <= ds) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
}
// groups: { label: predicate(obs) }; default = ALL, SHORTLIST, verdicts, timings
function _ltBtGroupsDefault() {
    var g = { 'ALL': function () { return true; }, 'Old SHORTLIST (verdict + timing)': function (o) { return o.shortlist; } };
    ['STRONG', 'GOOD', 'NEUTRAL', 'WEAK', 'AVOID'].forEach(function (v) { g['Verdict ' + v] = function (o) { return o.verdict === v; }; });
    ['EARLY', 'PULLBACK', 'MID', 'LATE', 'NO UPTREND'].forEach(function (t) { g['Timing ' + t] = function (o) { return o.timing === t; }; });
    return g;
}
// each score item on its own: with the item vs without it, plus a plain 12-month strength ranking per test date
// strength rank combined with the trend condition, and the proposed shortlist (top 20% strength, above a rising 200-day average, liquid, review level within the limit)
function _ltBtAddCombos(g) {
    var up = function (o) { return o.it.above200 === true && o.it.rising200 === true; };
    g['Top 20% strength + above a rising 200-day average'] = function (o) { return o.rsRank === 'top' && up(o); };
    g['Top 20% strength + NOT above a rising 200-day average'] = function (o) { return o.rsRank === 'top' && !up(o); };
    g['STRONG or GOOD + PULLBACK (the verdict and timing screen)'] = function (o) { return (o.verdict === 'STRONG' || o.verdict === 'GOOD') && o.timing === 'PULLBACK'; };
    g['Top 20% strength + PULLBACK'] = function (o) { return o.rsRank === 'top' && o.timing === 'PULLBACK'; };
    g['SHORTLIST now: top 20% strength + uptrend + not thin'] = function (o) { return o.rsRank === 'top' && up(o) && !o.thin; };
    g['Earlier shortlist: the same + risk to review level within ' + _LT_SHORTLIST_MAX_RISK + '%'] = function (o) { return o.rsRank === 'top' && up(o) && !o.thin && o.risk != null && o.risk <= _LT_SHORTLIST_MAX_RISK; };
    var prop = function (o) { return o.rsRank === 'top' && up(o) && !o.thin; };
    g['SHORTLIST now, excluding Stage 3 (topping)'] = function (o) { return prop(o) && !o.topping; };
    g['SHORTLIST now, Stage 3 (topping) only'] = function (o) { return prop(o) && o.topping; };
    return g;
}
function _ltBtGroupsItems() {
    var g = { 'ALL': function () { return true; } };
    var pair = function (label, key) { g[label + ': YES'] = function (o) { return o.it[key] === true; }; g[label + ': NO'] = function (o) { return o.it[key] === false; }; };
    pair('Above the 200-day average', 'above200');
    pair('200-day average rising', 'rising200');
    pair('Within 15% of the 52-week high', 'near15');
    pair('Stronger than NIFTY over 6 months', 'rs6');
    pair('Stronger than NIFTY over 12 months', 'rs12');
    pair('Positive Clenow momentum', 'mom');
    pair('Stage 2 / trend template pass', 'stage2');
    pair('More than 25% above the 50-day average', 'ext');
    g['12m strength: top 20% of the list that month'] = function (o) { return o.rsRank === 'top'; };
    g['12m strength: bottom 20% of the list that month'] = function (o) { return o.rsRank === 'bottom'; };
    return _ltBtAddCombos(g);
}
// the same groups, shown separately for test dates when NIFTY 50 was above / below its own 200-day average
function _ltBtGroupsRegime() {
    var g = { 'ALL': function () { return true; }, 'Old SHORTLIST (verdict + timing)': function (o) { return o.shortlist; } };
    ['STRONG', 'AVOID'].forEach(function (v) { g['Verdict ' + v] = function (o) { return o.verdict === v; }; });
    ['EARLY', 'PULLBACK', 'LATE'].forEach(function (t) { g['Timing ' + t] = function (o) { return o.timing === t; }; });
    g['Above the 200-day average: YES'] = function (o) { return o.it.above200 === true; };
    g['Above the 200-day average: NO'] = function (o) { return o.it.above200 === false; };
    g['12m strength: top 20% of the list that month'] = function (o) { return o.rsRank === 'top'; };
    g['12m strength: bottom 20% of the list that month'] = function (o) { return o.rsRank === 'bottom'; };
    return _ltBtAddCombos(g);
}
function _ltBtAggregate(obs, groups) {
    groups = groups || _ltBtGroupsDefault();
    var out = [];
    Object.keys(groups).forEach(function (g) {
        var row = { group: g, h: {} };
        _LT_BT_H.forEach(function (h) {
            var list = obs.filter(function (o) { return groups[g](o) && o.f[h]; });
            if (!list.length) { row.h[h] = null; return; }
            var sum = function (k) { return list.reduce(function (a, o) { return a + o.f[h][k]; }, 0) / list.length; };
            row.h[h] = { n: list.length, ret: sum('ret'), ex: sum('ex'), hit: list.filter(function (o) { return o.f[h].ex > 0; }).length / list.length * 100, fall: sum('fall') };
        });
        out.push(row);
    });
    return out;
}
function _ltBtTableHtml(rows) {
    var G = 'var(--gtb-green)', R = 'var(--gtb-red)', M = 'var(--gtb-muted)';
    var pc = function (x) { return (x >= 0 ? '+' : '') + x.toFixed(1) + '%'; };
    var col = function (x) { return x > 0.05 ? G : x < -0.05 ? R : M; };
    var th = 'padding:2px 6px;text-align:right;font-size:0.46rem;letter-spacing:0.04em;color:var(--gtb-muted);position:sticky;top:0;background:var(--gtb-surface);';
    var td = 'padding:3px 6px;text-align:right;border-top:1px solid var(--gtb-border);font-family:var(--gtb-mono);white-space:nowrap;';
    var hl = { 10: '10 SESSIONS', 63: '3 MONTHS', 126: '6 MONTHS', 252: '12 MONTHS' };
    var head1 = '<tr><th style="' + th + 'text-align:left;" rowspan="2">GROUP</th>' + _LT_BT_H.map(function (h) { return '<th style="' + th + 'text-align:center;border-left:1px solid var(--gtb-border);" colspan="4">' + hl[h] + ' AHEAD</th>'; }).join('') + '<th style="' + th + '" rowspan="2">AVG WORST FALL (12M)</th></tr>';
    var head2 = '<tr>' + _LT_BT_H.map(function () { return ['N', 'AVG RETURN', 'VS NIFTY', 'BEAT NIFTY'].map(function (t, i) { return '<th style="' + th + (i === 0 ? 'border-left:1px solid var(--gtb-border);' : '') + '">' + t + '</th>'; }).join(''); }).join('') + '</tr>';
    var body = rows.map(function (r) {
        var strong = (r.group === 'ALL' || /shortlist/i.test(r.group));
        var cells = _LT_BT_H.map(function (h) {
            var c = r.h[h]; if (!c) return '<td style="' + td + 'border-left:1px solid var(--gtb-border);color:' + M + ';" colspan="4">no data</td>';
            return '<td style="' + td + 'border-left:1px solid var(--gtb-border);color:' + M + ';">' + c.n + '</td><td style="' + td + 'color:' + col(c.ret) + ';">' + pc(c.ret) + '</td><td style="' + td + 'color:' + col(c.ex) + ';font-weight:700;">' + pc(c.ex) + '</td><td style="' + td + 'color:' + (c.hit >= 55 ? G : c.hit <= 45 ? R : M) + ';">' + c.hit.toFixed(0) + '%</td>';
        }).join('');
        var f = r.h[252];
        return '<tr style="' + (strong ? 'background:var(--gtb-surface2);' : '') + '"><td style="padding:3px 6px;text-align:left;border-top:1px solid var(--gtb-border);font-weight:' + (strong ? 800 : 600) + ';">' + r.group + '</td>' + cells + '<td style="' + td + 'color:' + (f ? R : M) + ';">' + (f ? pc(f.fall) : '-') + '</td></tr>';
    }).join('');
    return '<div style="overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.54rem;"><thead>' + head1 + head2 + '</thead><tbody>' + body + '</tbody></table></div>';
}
function _ltBtHtml(res) {
    var sub = 'font-size:0.52rem;font-weight:800;letter-spacing:0.05em;color:var(--gtb-muted);margin:10px 0 3px;';
    return '<div style="font-size:0.56rem;color:var(--gtb-text);margin-bottom:6px;line-height:1.5;"><b>' + res.label + '</b>: ' + res.nStocks + ' stocks, ' + res.nDates + ' test dates (about monthly) from ' + res.first + ' to ' + res.last + ', ' + res.nObs + ' stock-date observations. Return is the price change over the window; VS NIFTY is the stock return minus NIFTY 50 over the same window; BEAT NIFTY is the share of observations that beat it.</div>'
        + '<div style="' + sub + 'margin-top:0;">BY VERDICT, TIMING AND SHORTLIST</div>' + _ltBtTableHtml(res.rows)
        + '<div style="' + sub + '">EACH SCORE ITEM ON ITS OWN (with the item against without it) AND A PLAIN 12-MONTH STRENGTH RANKING</div>' + _ltBtTableHtml(res.rowsItems)
        + '<div style="' + sub + '">WHEN NIFTY 50 WAS ABOVE ITS 200-DAY AVERAGE (a rising market) &middot; ' + res.datesUp + ' test dates</div>' + _ltBtTableHtml(res.rowsUp)
        + '<div style="' + sub + '">WHEN NIFTY 50 WAS BELOW ITS 200-DAY AVERAGE (a falling market) &middot; ' + res.datesDown + ' test dates' + (res.datesDown < 8 ? ' <span style="color:var(--gtb-amber);">(very few dates: treat this table as anecdote)</span>' : '') + '</div>' + _ltBtTableHtml(res.rowsDown)
        + '<div style="margin-top:8px;padding:6px 8px;border:1px solid var(--gtb-amber);color:var(--gtb-text);font-size:0.52rem;line-height:1.5;"><b style="color:var(--gtb-amber);">Read this first.</b> The stock list is <b>today\'s</b> ' + res.label + ' members. Stocks that left the index or were delisted over these years are missing, so the results look better than a real investor would have seen (survivorship bias, usually the biggest distortion, and it favours stocks that fell and then recovered). It tests the chart rules only: no earnings, valuation, costs or taxes. Monthly test dates give overlapping 12-month windows, so the observations are not independent, and a few years is a small sample. Compare YES with NO and each group with ALL; small differences are noise. A description of what happened, not a forecast and not investment advice.</div>';
}
async function _ltRunBacktest() {
    if (_LT_BT.running) return;
    var key = _LT_STATE.universe, def = _LT_UNIVERSES[key];
    var tokens = _ltTokenMap();
    if (!(typeof _DL_INSTRUMENTS !== 'undefined' && _DL_INSTRUMENTS.length)) { try { _gtbToast('Load the Kite instruments first (Data Load).', 'error'); } catch (e) {} return; }
    showPopUpWindow('lt-backtest', '<div style="padding:12px;"><div id="lt-bt-head" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><b style="font-size:0.66rem;">' + def.label + ' backtest</b><button id="lt-bt-stop" class="sv-pill-btn" type="button"><i class="bi bi-stop-fill"></i> Stop</button><span id="lt-bt-progress" class="ps-progress"></span></div><div id="lt-bt-out"></div></div>', 'Long-term backtest', 1060, 600);
    var cls = 'popup-custom-style-lt-backtest';
    var title = '<div style="display:flex;align-items:center;gap:6px;width:100%;"><span style="font-weight:800;font-size:0.7rem;">LONG-TERM BACKTEST</span>' + popupWinControls(cls) + '</div>';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html(title);
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
    var prog = function (t) { jQ('#lt-bt-progress').text(t); };
    _LT_BT.running = true; _LT_BT.stop = false;
    jQ('#lt-backtest-btn').prop('disabled', true);
    try {
        prog('Downloading the ' + def.label + ' list…');
        var list = await _ltFetchUniverse(key);
        var nTok = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS['NIFTY 50'] : null;
        if (!nTok) throw new Error('NIFTY 50 token not found');
        prog('Loading NIFTY 50 history…');
        var nc = await _psFetchDaily(nTok, _LT_BT_DAYS);
        var nd = nc.map(function (c) { return String(c[0]).slice(0, 10); }), ncl = nc.map(function (c) { return parseFloat(c[4]); });
        var maxH = Math.max.apply(null, _LT_BT_H), minH = Math.min.apply(null, _LT_BT_H);
        var nsma = _psSmaArr(ncl, 200);
        var tDates = [];
        for (var t = _LT_BT_MIN_HIST; t <= nd.length - 1 - minH; t += _LT_BT_STEP) tDates.push(t);
        if (!tDates.length) throw new Error('not enough NIFTY history for a backtest');
        var todo = list.filter(function (m) { return tokens[m.symbol]; });
        var obs = [], done = 0, used = 0;
        var work = async function (m) {
            var candles = null;
            try { candles = await _psFetchDaily(tokens[m.symbol], _LT_BT_DAYS); } catch (e) {}
            done++;
            if (!candles || candles.length < 250) return;
            var sd = candles.map(function (c) { return String(c[0]).slice(0, 10); }), scl = candles.map(function (c) { return parseFloat(c[4]); });
            var any = false;
            for (var k = 0; k < tDates.length; k++) {
                var ti = tDates[k], i0 = _ltIdxAtDate(sd, nd[ti]);
                if (i0 < 199 || sd[i0] < nd[Math.max(0, ti - 5)]) continue;          // too little history yet, or no recent trading on that date
                var row = _ltAnalyse({ symbol: m.symbol, company: m.company, industry: m.industry }, candles.slice(0, i0 + 1), ncl.slice(0, ti + 1));
                if (row.short) continue;
                var f = {};
                _LT_BT_H.forEach(function (h) {
                    if (ti + h > nd.length - 1) return;
                    var j = _ltIdxAtDate(sd, nd[ti + h]);
                    if (j <= i0 || sd[j] < nd[Math.max(0, ti + h - 5)]) return;      // the stock stopped trading before the window ended
                    var ret = (scl[j] / scl[i0] - 1) * 100, bench = (ncl[ti + h] / ncl[ti] - 1) * 100;
                    var lo = scl[i0]; for (var q = i0; q <= j; q++) { if (scl[q] < lo) lo = scl[q]; }
                    f[h] = { ret: ret, ex: ret - bench, fall: (lo / scl[i0] - 1) * 100 };
                });
                obs.push({ topping: row.dir === -0.3, thin: row.thin, risk: row.riskPct, t: ti, reg: (nsma[ti] != null && ncl[ti] > nsma[ti]) ? 'UP' : 'DOWN', rs12: row.rs12, verdict: row.verdict, timing: row.timing, shortlist: _ltIsShortlistOld(row), f: f,
                    it: { above200: row.vs200 != null ? row.vs200 > 0 : null, rising200: row.slope200 != null ? row.slope200 > 0 : null, near15: row.fromHigh >= -15, rs6: row.rs6 != null ? row.rs6 > 0 : null, rs12: row.rs12 != null ? row.rs12 > 0 : null, mom: row.momentum != null ? row.momScore > 0 : null, stage2: row.dir != null ? row.dir > 0 : null, ext: row.ext50 != null ? row.ext50 > 25 : null } });
                any = true;
            }
            if (any) used++;
            if (done % 5 === 0) { prog('Stocks ' + done + ' / ' + todo.length + ', ' + obs.length + ' observations…'); await new Promise(function (r) { setTimeout(r, 0); }); }
        };
        var idx = 0, workers = [];
        for (var w = 0; w < _LT_POOL; w++) workers.push((async function () { while (idx < todo.length && !_LT_BT.stop) { var it = todo[idx++]; await work(it); } })());
        await Promise.all(workers);
        var byT = {}; obs.forEach(function (o) { if (o.rs12 != null) (byT[o.t] = byT[o.t] || []).push(o); });
        Object.keys(byT).forEach(function (k) {
            var l = byT[k].slice().sort(function (x, y) { return y.rs12 - x.rs12; }), q = Math.max(1, Math.floor(l.length / 5));
            if (l.length < 10) return;
            for (var z = 0; z < q; z++) { l[z].rsRank = 'top'; l[l.length - 1 - z].rsRank = 'bottom'; }
        });
        var res = { label: def.label, nStocks: used, nDates: tDates.length, nObs: obs.length, first: nd[tDates[0]], last: nd[tDates[tDates.length - 1]], rows: _ltBtAggregate(obs), rowsItems: _ltBtAggregate(obs, _ltBtGroupsItems()),
            rowsUp: _ltBtAggregate(obs.filter(function (o) { return o.reg === 'UP'; }), _ltBtGroupsRegime()), rowsDown: _ltBtAggregate(obs.filter(function (o) { return o.reg === 'DOWN'; }), _ltBtGroupsRegime()),
            datesUp: tDates.filter(function (ti) { return nsma[ti] != null && ncl[ti] > nsma[ti]; }).length, datesDown: tDates.filter(function (ti) { return !(nsma[ti] != null && ncl[ti] > nsma[ti]); }).length };
        _LT_BT.last = res;
        prog(_LT_BT.stop ? 'Stopped, showing what was tested.' : 'Done.');
        jQ('#lt-bt-out').html(_ltBtHtml(res));
    } catch (e) {
        prog('Backtest failed: ' + (e && e.message ? e.message : e));
    }
    _LT_BT.running = false; jQ('#lt-backtest-btn').prop('disabled', false);
}
jQ(document).on('click', '#lt-backtest-btn', function () { _ltRunBacktest(); });
jQ(document).on('click', '#lt-bt-stop', function () { _LT_BT.stop = true; });

// ── Forward test ──────────────────────────────────────────────────────────────────────────────────────────────────
// Takes the stocks as they stood on the scan date (the app date, Settings current_day_date), enters at THAT day's close and measures the next
// N sessions against NIFTY 50: for the table as shown (your filters), the SHORTLIST, the strength groups and all analysed stocks.
// Candles are fetched past the app date on purpose (the scan itself never sees them). Limits are stated in the popup: one window is one
// market episode, a filter chosen after seeing how stocks did is not a test, today's members only, no costs.
var _LT_FW = { running: false, stop: false, res: null };
var _LT_VIEW = [];                       // symbols the table showed when it was last drawn (set in _ltRender)
var _LT_FW_AFTER_DAYS = 60;              // calendar days after the scan date to fetch (covers 20 sessions with room)
function _ltAsOf() { return (_LT_META && _LT_META.asOf) || ((typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? CURRENT_DAY : moment().format('YYYY-MM-DD')); }
async function _ltFwCandles(token, fromIso, toIso) {
    var raw = await getHistoricalDataUsingPromise(token, fromIso + ' 09:00:00', toIso + ' 15:30:00', 'day');
    return (raw && raw.data && raw.data.candles) ? raw.data.candles : [];
}
function _ltFwGroups(view) {
    var vs = {}; view.forEach(function (s) { vs[s] = true; });
    var g = {};
    if (view.length) g['YOUR SCREEN: the table as shown (' + view.length + ')'] = function (r) { return !!vs[r.symbol]; };
    g['SHORTLIST: top 20% strength + uptrend + not thin'] = function (r) { return _ltIsShortlist(r); };
    g['STRONG or GOOD + PULLBACK'] = function (r) { return (r.verdict === 'STRONG' || r.verdict === 'GOOD') && r.timing === 'PULLBACK'; };
    g['Top 20% by 12m strength'] = function (r) { return r.rank != null && r.rank / r.rankN <= 0.2; };
    g['Bottom 20% by 12m strength'] = function (r) { return r.rank != null && r.rank / r.rankN > 0.8; };
    g['ALL analysed stocks'] = function () { return true; };
    return g;
}
function _ltFwMeasure(s, res, n) {
    var exitDate = res.nd[n];
    var j = _ltIdxAtDate(s.d, exitDate);
    if (j < 1 || s.d[j] < res.nd[Math.max(1, n - 2)]) return null;           // no price within 2 sessions of the exit date (stopped trading)
    var c0 = s.c[0], lo = c0, hi = c0;
    for (var q = 0; q <= j; q++) { if (s.c[q] < lo) lo = s.c[q]; if (s.c[q] > hi) hi = s.c[q]; }
    var ret = (s.c[j] / c0 - 1) * 100, bench = (res.nc[n] / res.nc[0] - 1) * 100;
    return { ret: ret, ex: ret - bench, fall: (lo / c0 - 1) * 100, rise: (hi / c0 - 1) * 100, exitPx: s.c[j] };
}
function _ltFwRender() {
    var res = _LT_FW.res; if (!res) return;
    var G = 'var(--gtb-green)', R = 'var(--gtb-red)', M = 'var(--gtb-muted)', A = 'var(--gtb-amber)';
    var pc = function (x) { return x == null ? '-' : (x >= 0 ? '+' : '') + x.toFixed(1) + '%'; };
    var col = function (x) { return x == null ? M : x > 0.05 ? G : x < -0.05 ? R : M; };
    var want = parseInt(jQ('#lt-fw-n').val(), 10) || 10, n = Math.min(want, res.nAvail);
    if (n < 1) { jQ('#lt-fw-out').html('<div style="color:' + A + ';font-size:0.6rem;">There is no trading session after ' + res.entryDate + ' yet, so there is nothing to measure.</div>'); return; }
    var th = 'padding:2px 6px;text-align:right;font-size:0.46rem;letter-spacing:0.04em;color:var(--gtb-muted);position:sticky;top:0;background:var(--gtb-surface);';
    var td = 'padding:3px 6px;text-align:right;border-top:1px solid var(--gtb-border);font-family:var(--gtb-mono);white-space:nowrap;';
    var tdl = 'padding:3px 6px;text-align:left;border-top:1px solid var(--gtb-border);white-space:nowrap;';
    var meas = res.stocks.map(function (s) { return { s: s, m: _ltFwMeasure(s, res, n) }; }).filter(function (x) { return x.m; });
    var bench = (res.nc[n] / res.nc[0] - 1) * 100;
    var groups = _ltFwGroups(res.view), rows = '';
    var med = function (a) { if (!a.length) return null; var b = a.slice().sort(function (x, y) { return x - y; }), k = b.length >> 1; return b.length % 2 ? b[k] : (b[k - 1] + b[k]) / 2; };
    Object.keys(groups).forEach(function (gk) {
        var list = meas.filter(function (x) { return groups[gk](x.s.row); });
        if (!list.length) { rows += '<tr><td style="' + tdl + 'font-weight:600;">' + gk + '</td><td style="' + td + 'color:' + M + ';" colspan="8">no stocks</td></tr>'; return; }
        var avg = function (k) { return list.reduce(function (a, x) { return a + x.m[k]; }, 0) / list.length; };
        var ex = list.map(function (x) { return x.m.ex; });
        var strong = /^(YOUR|SHORTLIST|ALL)/.test(gk);
        rows += '<tr style="' + (strong ? 'background:var(--gtb-surface2);' : '') + '"><td style="' + tdl + 'font-weight:' + (strong ? 800 : 600) + ';">' + gk + '</td>'
            + '<td style="' + td + 'color:' + M + ';">' + list.length + '</td>'
            + '<td style="' + td + 'color:' + col(avg('ret')) + ';">' + pc(avg('ret')) + '</td>'
            + '<td style="' + td + 'color:' + col(avg('ex')) + ';font-weight:700;">' + pc(avg('ex')) + '</td>'
            + '<td style="' + td + 'color:' + col(med(ex)) + ';">' + pc(med(ex)) + '</td>'
            + '<td style="' + td + 'color:' + (list.filter(function (x) { return x.m.ex > 0; }).length / list.length * 100 >= 55 ? G : M) + ';">' + (list.filter(function (x) { return x.m.ex > 0; }).length / list.length * 100).toFixed(0) + '%</td>'
            + '<td style="' + td + '">' + (list.filter(function (x) { return x.m.ret > 0; }).length / list.length * 100).toFixed(0) + '%</td>'
            + '<td style="' + td + 'color:' + R + ';">' + pc(avg('fall')) + '</td>'
            + '<td style="' + td + 'color:' + G + ';">' + pc(avg('rise')) + '</td></tr>';
    });
    var head = '<tr><th style="' + th + 'text-align:left;">GROUP</th><th style="' + th + '">N</th><th style="' + th + '">AVG RETURN</th><th style="' + th + '">VS NIFTY (AVG)</th><th style="' + th + '">VS NIFTY (MEDIAN)</th><th style="' + th + '">BEAT NIFTY</th><th style="' + th + '">UP (> 0%)</th><th style="' + th + '">AVG WORST FALL</th><th style="' + th + '">AVG BEST RISE</th></tr>';
    // the stocks of the first group (your screen when there is one, else the shortlist), best first
    var firstKey = Object.keys(groups)[0];
    var detail = meas.filter(function (x) { return groups[firstKey](x.s.row); }).sort(function (a, b) { return b.m.ret - a.m.ret; });
    var drows = detail.map(function (x) {
        var r = x.s.row;
        return '<tr><td style="' + tdl + 'font-weight:700;">' + r.symbol + ' <span style="font-weight:400;color:' + M + ';font-size:0.46rem;">' + (r.industry || '') + '</span></td>'
            + '<td style="' + td + 'color:' + M + ';">' + (r.rank == null ? '-' : '#' + r.rank) + '</td>'
            + '<td style="' + tdl + 'color:' + M + ';">' + r.verdict + ' / ' + r.timing + '</td>'
            + '<td style="' + td + '">' + x.s.c[0].toFixed(1) + '</td><td style="' + td + '">' + x.m.exitPx.toFixed(1) + '</td>'
            + '<td style="' + td + 'color:' + col(x.m.ret) + ';font-weight:700;">' + pc(x.m.ret) + '</td>'
            + '<td style="' + td + 'color:' + col(x.m.ex) + ';">' + pc(x.m.ex) + '</td>'
            + '<td style="' + td + 'color:' + R + ';">' + pc(x.m.fall) + '</td></tr>';
    }).join('');
    var dhead = '<tr><th style="' + th + 'text-align:left;">STOCK</th><th style="' + th + '">RANK</th><th style="' + th + 'text-align:left;">CHART HEALTH / TIMING</th><th style="' + th + '">ENTRY</th><th style="' + th + '">EXIT</th><th style="' + th + '">RETURN</th><th style="' + th + '">VS NIFTY</th><th style="' + th + '">WORST FALL</th></tr>';
    var sub = 'font-size:0.52rem;font-weight:800;letter-spacing:0.05em;color:var(--gtb-muted);margin:10px 0 3px;';
    var warn = n < want ? '<div style="color:' + A + ';font-size:0.56rem;margin-bottom:4px;">Only ' + res.nAvail + ' sessions exist after ' + res.entryDate + ', so the window is ' + n + ' sessions, not ' + want + '.</div>' : '';
    jQ('#lt-fw-out').html(
        '<div style="font-size:0.56rem;color:var(--gtb-text);margin-bottom:6px;line-height:1.5;">Entry = close of <b>' + res.entryDate + '</b>, exit = close of <b>' + res.nd[n] + '</b> (' + n + ' sessions). NIFTY 50 over the same window: <b style="color:' + col(bench) + ';">' + pc(bench) + '</b>. ' + meas.length + ' of ' + res.stocks.length + ' stocks had prices on both dates.</div>' + warn
        + '<div style="overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.54rem;"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>'
        + '<div style="' + sub + '">' + firstKey.replace(/\s*\(\d+\)$/, '').toUpperCase() + ', STOCK BY STOCK</div>'
        + '<div style="max-height:260px;overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.54rem;"><thead>' + dhead + '</thead><tbody>' + drows + '</tbody></table></div>'
        + '<div style="margin-top:8px;padding:6px 8px;border:1px solid var(--gtb-amber);color:var(--gtb-text);font-size:0.52rem;line-height:1.5;"><b style="color:var(--gtb-amber);">Read this first.</b> One window is one market episode: if the whole market rose, ALL analysed stocks rose too, so judge each group against ALL and against NIFTY, not against zero. A screen chosen after seeing how these stocks did is not a test of the screen; run it on another date (change the app date, scan, run this again) or use the BACKTEST, which now includes a 10-session horizon and your STRONG / GOOD + PULLBACK screen across many dates. The list is today\'s index members, entry is the close of the scan day (you could not necessarily buy at it), and costs and taxes are ignored. A description of what happened, not a forecast and not investment advice.</div>');
}
async function _ltRunForward() {
    if (_LT_FW.running) return;
    var all = Object.keys(_LT_CACHE).map(function (k) { return _LT_CACHE[k]; });
    if (!all.length) { try { _gtbToast('Scan first, then run the forward test.', 'error'); } catch (e) {} return; }
    var nTok = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS['NIFTY 50'] : null;
    if (!nTok) { try { _gtbToast('NIFTY 50 token not found.', 'error'); } catch (e) {} return; }
    var asOf = _ltAsOf(), tokens = _ltTokenMap();
    var view = _LT_VIEW.slice();
    showPopUpWindow('lt-forward', '<div style="padding:12px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;"><b style="font-size:0.66rem;">Forward test from ' + asOf + '</b><label style="font-size:0.56rem;color:var(--gtb-muted);">Window <select id="lt-fw-n" class="sv-pill-btn"><option value="5">5 sessions</option><option value="10" selected>10 sessions</option><option value="15">15 sessions</option><option value="20">20 sessions</option></select></label><button id="lt-fw-stop" class="sv-pill-btn" type="button"><i class="bi bi-stop-fill"></i> Stop</button><span id="lt-fw-progress" class="ps-progress"></span></div><div id="lt-fw-out"></div></div>', 'Forward test', 1000, 620);
    var cls = 'popup-custom-style-lt-forward';
    var title = '<div style="display:flex;align-items:center;gap:6px;width:100%;"><span style="font-weight:800;font-size:0.7rem;">LONG-TERM FORWARD TEST</span>' + popupWinControls(cls) + '</div>';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html(title);
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
    var prog = function (t) { jQ('#lt-fw-progress').text(t); };
    _LT_FW.running = true; _LT_FW.stop = false; _LT_FW.res = null;
    jQ('#lt-fwtest-btn').prop('disabled', true);
    try {
        var from = moment(asOf).subtract(10, 'days').format('YYYY-MM-DD'), to = moment(asOf).add(_LT_FW_AFTER_DAYS, 'days').format('YYYY-MM-DD');
        prog('Loading NIFTY 50 prices after ' + asOf + '…');
        var nc = await _ltFwCandles(nTok, from, to);
        var nd = nc.map(function (c) { return String(c[0]).slice(0, 10); }), ncl = nc.map(function (c) { return parseFloat(c[4]); });
        var ni0 = _ltIdxAtDate(nd, asOf);
        if (ni0 < 0) throw new Error('no NIFTY 50 candles around ' + asOf);
        var res = { entryDate: nd[ni0], nd: nd.slice(ni0), nc: ncl.slice(ni0), nAvail: nd.length - 1 - ni0, view: view, stocks: [] };
        var todo = all.filter(function (r) { return r.token || tokens[r.symbol]; }), done = 0, idx = 0;
        var work = async function (r) {
            try {
                var cs = await _ltFwCandles(r.token || tokens[r.symbol], from, to);
                var sd = cs.map(function (c) { return String(c[0]).slice(0, 10); }), scl = cs.map(function (c) { return parseFloat(c[4]); });
                var i0 = _ltIdxAtDate(sd, res.entryDate);
                if (i0 >= 0 && sd[i0] === res.entryDate) res.stocks.push({ row: r, d: sd.slice(i0), c: scl.slice(i0) });
            } catch (e) {}
            done++;
            if (done % 10 === 0 || done === todo.length) prog('Stocks ' + done + ' / ' + todo.length + '…');
        };
        var workers = [];
        for (var w = 0; w < _LT_POOL; w++) workers.push((async function () { while (idx < todo.length && !_LT_FW.stop) { var it = todo[idx++]; await work(it); } })());
        await Promise.all(workers);
        res.nTotal = todo.length;
        _LT_FW.res = res;
        prog(_LT_FW.stop ? 'Stopped, showing what was loaded.' : 'Done.');
        _ltFwRender();
    } catch (e) {
        prog('Forward test failed: ' + (e && e.message ? e.message : e));
    }
    _LT_FW.running = false; jQ('#lt-fwtest-btn').prop('disabled', false);
}
jQ(document).on('click', '#lt-fwtest-btn', function () { _ltRunForward(); });
jQ(document).on('click', '#lt-fw-stop', function () { _LT_FW.stop = true; });
jQ(document).on('change', '#lt-fw-n', function () { _ltFwRender(); });

// ── Screen test over many dates ─────────────────────────────────────────────────────────────────────────────────────
// Applies the screen as it is set NOW (SHORTLIST, or the verdict / timing / top-20% filters) to many past dates, point in time: on each
// date only the candles up to it are used, the screen picks its stocks, and the next N sessions are measured against NIFTY 50 and
// against ALL analysed stocks. Dates are N sessions apart so the windows do not overlap. Same limits as the backtest: today's members,
// no costs, a description of what happened.
var _LT_ST = { running: false, stop: false, res: null };
function _ltScreenLabel() {
    if (_LT_STATE.shortlist) return 'SHORTLIST (top 20% strength + uptrend + not thin)';
    var p = [];
    var fl = { top20: 'Top 20% by 12m strength', good: 'STRONG or GOOD', strong: 'STRONG', neutral: 'NEUTRAL', weak: 'WEAK', avoid: 'AVOID' };
    if (_LT_STATE.filter !== 'all' && fl[_LT_STATE.filter]) p.push(fl[_LT_STATE.filter]);
    if (_LT_STATE.timing !== 'all') p.push(_LT_STATE.timing);
    return p.length ? p.join(' + ') : 'every stock (no filter set)';
}
// the same pass rule the table applies (search text excluded), for a row that carries rank / rankN
function _ltPassScreen(r, st) {
    if (st.shortlist) return _ltIsShortlist(r);
    var f = st.filter;
    if (f === 'top20' && !(r.rank && r.rank / r.rankN <= 0.2)) return false;
    if (f === 'good' && !(r.verdict === 'STRONG' || r.verdict === 'GOOD')) return false;
    if (f === 'strong' && r.verdict !== 'STRONG') return false;
    if (f === 'neutral' && r.verdict !== 'NEUTRAL') return false;
    if (f === 'weak' && r.verdict !== 'WEAK') return false;
    if (f === 'avoid' && r.verdict !== 'AVOID') return false;
    if (st.timing !== 'all' && r.timing !== st.timing) return false;
    return true;
}
function _ltStHtml(res) {
    var G = 'var(--gtb-green)', R = 'var(--gtb-red)', M = 'var(--gtb-muted)', A = 'var(--gtb-amber)';
    var pc = function (x) { return x == null ? '-' : (x >= 0 ? '+' : '') + x.toFixed(1) + '%'; };
    var col = function (x) { return x == null ? M : x > 0.05 ? G : x < -0.05 ? R : M; };
    var th = 'padding:2px 6px;text-align:right;font-size:0.46rem;letter-spacing:0.04em;color:var(--gtb-muted);position:sticky;top:0;background:var(--gtb-surface);';
    var td = 'padding:3px 6px;text-align:right;border-top:1px solid var(--gtb-border);font-family:var(--gtb-mono);white-space:nowrap;';
    var tdl = 'padding:3px 6px;text-align:left;border-top:1px solid var(--gtb-border);white-space:nowrap;';
    var sub = 'font-size:0.52rem;font-weight:800;letter-spacing:0.05em;color:var(--gtb-muted);margin:10px 0 3px;';
    var avg = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; };
    var sumRow = function (label, dates) {
        var d = dates.filter(function (x) { return x.nScreen >= res.minPicks; });
        if (!d.length) return '<tr><td style="' + tdl + 'font-weight:700;">' + label + '</td><td style="' + td + 'color:' + M + ';" colspan="8">no dates with at least ' + res.minPicks + ' picks</td></tr>';
        var exN = avg(d.map(function (x) { return x.scrEx; })), exA = avg(d.map(function (x) { return x.allEx; })), diff = avg(d.map(function (x) { return x.scrRet - x.allRet; }));
        var beatN = d.filter(function (x) { return x.scrEx > 0; }).length / d.length * 100, beatA = d.filter(function (x) { return x.scrRet > x.allRet; }).length / d.length * 100;
        return '<tr><td style="' + tdl + 'font-weight:700;">' + label + '</td><td style="' + td + 'color:' + M + ';">' + d.length + '</td><td style="' + td + 'color:' + M + ';">' + avg(d.map(function (x) { return x.nScreen; })).toFixed(0) + '</td>'
            + '<td style="' + td + 'color:' + col(avg(d.map(function (x) { return x.scrRet; }))) + ';">' + pc(avg(d.map(function (x) { return x.scrRet; }))) + '</td>'
            + '<td style="' + td + 'color:' + col(exN) + ';font-weight:700;">' + pc(exN) + '</td>'
            + '<td style="' + td + 'color:' + col(exA) + ';">' + pc(exA) + '</td>'
            + '<td style="' + td + 'color:' + col(diff) + ';font-weight:700;">' + pc(diff) + '</td>'
            + '<td style="' + td + 'color:' + (beatN >= 55 ? G : beatN <= 45 ? R : M) + ';">' + beatN.toFixed(0) + '%</td>'
            + '<td style="' + td + 'color:' + (beatA >= 55 ? G : beatA <= 45 ? R : M) + ';">' + beatA.toFixed(0) + '%</td></tr>';
    };
    var shead = '<tr><th style="' + th + 'text-align:left;">MARKET AT THE TIME</th><th style="' + th + '">DATES</th><th style="' + th + '">AVG PICKS</th><th style="' + th + '">AVG RETURN</th><th style="' + th + '">SCREEN VS NIFTY</th><th style="' + th + '">ALL VS NIFTY</th><th style="' + th + '">SCREEN MINUS ALL</th><th style="' + th + '">DATES BEATING NIFTY</th><th style="' + th + '">DATES BEATING ALL</th></tr>';
    var up = res.dates.filter(function (x) { return x.reg === 'UP'; }), dn = res.dates.filter(function (x) { return x.reg === 'DOWN'; });
    var drows = res.dates.slice().reverse().map(function (x) {
        var ok = x.nScreen >= res.minPicks;
        return '<tr style="' + (ok ? '' : 'opacity:0.5;') + '"><td style="' + tdl + '">' + x.date + '</td><td style="' + tdl + 'color:' + (x.reg === 'UP' ? G : R) + ';">' + (x.reg === 'UP' ? 'rising' : 'falling') + '</td>'
            + '<td style="' + td + 'color:' + col(x.bench) + ';">' + pc(x.bench) + '</td><td style="' + td + 'color:' + M + ';">' + x.nScreen + '</td>'
            + '<td style="' + td + 'color:' + col(x.scrRet) + ';">' + (x.nScreen ? pc(x.scrRet) : '-') + '</td><td style="' + td + 'color:' + col(x.scrEx) + ';font-weight:700;">' + (x.nScreen ? pc(x.scrEx) : '-') + '</td>'
            + '<td style="' + td + 'color:' + col(x.allRet) + ';">' + pc(x.allRet) + '</td><td style="' + td + 'color:' + col(x.allEx) + ';">' + pc(x.allEx) + '</td>'
            + '<td style="' + td + 'color:' + col(x.nScreen ? x.scrRet - x.allRet : null) + ';">' + (x.nScreen ? pc(x.scrRet - x.allRet) : '-') + '</td></tr>';
    }).join('');
    var dhead = '<tr><th style="' + th + 'text-align:left;">AS-OF DATE</th><th style="' + th + 'text-align:left;">MARKET</th><th style="' + th + '">NIFTY</th><th style="' + th + '">PICKS</th><th style="' + th + '">SCREEN RETURN</th><th style="' + th + '">SCREEN VS NIFTY</th><th style="' + th + '">ALL RETURN</th><th style="' + th + '">ALL VS NIFTY</th><th style="' + th + '">SCREEN MINUS ALL</th></tr>';
    return '<div style="font-size:0.56rem;color:var(--gtb-text);margin-bottom:6px;line-height:1.5;"><b>Screen:</b> ' + res.screen + '. <b>' + res.label + '</b>, ' + res.nStocks + ' stocks, ' + res.dates.length + ' as-of dates from ' + res.dates[0].date + ' to ' + res.dates[res.dates.length - 1].date + ', each ' + res.n + ' sessions apart and measured over the next ' + res.n + ' sessions (windows do not overlap). Dates with fewer than ' + res.minPicks + ' picks are greyed and left out of the summary.</div>'
        + '<div style="overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.54rem;"><thead>' + shead + '</thead><tbody>' + sumRow('All dates', res.dates) + sumRow('NIFTY above its 200-day average (rising)', up) + sumRow('NIFTY below its 200-day average (falling)', dn) + '</tbody></table></div>'
        + '<div style="' + sub + '">DATE BY DATE (newest first)</div><div style="max-height:260px;overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.54rem;"><thead>' + dhead + '</thead><tbody>' + drows + '</tbody></table></div>'
        + '<div style="margin-top:8px;padding:6px 8px;border:1px solid var(--gtb-amber);color:var(--gtb-text);font-size:0.52rem;line-height:1.5;"><b style="color:var(--gtb-amber);">Read this first.</b> "Screen minus ALL" is the number that matters: it takes the market out. If it is near zero or the share of dates beating ALL is near 50%, the screen adds nothing over buying the whole list. The list is <b>today\'s</b> ' + res.label + ' members (survivorship bias flatters every number), entries are scan-day closes, costs and taxes are ignored, and a few dozen dates in one or two market phases is a small sample. A screen set after seeing results was tuned on this same data. A description of what happened, not a forecast and not investment advice.</div>';
}
async function _ltRunScreenTest() {
    if (_LT_ST.running) return;
    var key = _LT_STATE.universe, def = _LT_UNIVERSES[key], tokens = _ltTokenMap();
    if (!(typeof _DL_INSTRUMENTS !== 'undefined' && _DL_INSTRUMENTS.length)) { try { _gtbToast('Load the Kite instruments first (Data Load).', 'error'); } catch (e) {} return; }
    var st = { shortlist: _LT_STATE.shortlist, filter: _LT_STATE.filter, timing: _LT_STATE.timing };
    var screen = _ltScreenLabel();
    showPopUpWindow('lt-screentest', '<div style="padding:12px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;"><b style="font-size:0.66rem;">Screen test: ' + screen + '</b><label style="font-size:0.56rem;color:var(--gtb-muted);">Window <select id="lt-st-n" class="sv-pill-btn"><option value="5">5 sessions</option><option value="10" selected>10 sessions</option><option value="20">20 sessions</option><option value="63">63 sessions (3 months)</option><option value="126">126 sessions (6 months)</option><option value="252">252 sessions (12 months)</option></select></label><label style="font-size:0.56rem;color:var(--gtb-muted);">Span <select id="lt-st-span" class="sv-pill-btn"><option value="250">last 1 year</option><option value="500" selected>last 2 years</option><option value="0">all history</option></select></label><button id="lt-st-run" class="sv-load-btn" type="button"><i class="bi bi-play-fill"></i> RUN</button><button id="lt-st-stop" class="sv-pill-btn" type="button"><i class="bi bi-stop-fill"></i> Stop</button><span id="lt-st-progress" class="ps-progress"></span></div><div id="lt-st-out"></div></div>', 'Screen test', 1060, 620);
    var cls = 'popup-custom-style-lt-screentest';
    var title = '<div style="display:flex;align-items:center;gap:6px;width:100%;"><span style="font-weight:800;font-size:0.7rem;">LONG-TERM SCREEN TEST</span>' + popupWinControls(cls) + '</div>';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html(title);
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
    _LT_ST.ctx = { key: key, def: def, tokens: tokens, st: st, screen: screen };
}
async function _ltScreenTestGo() {
    if (_LT_ST.running || !_LT_ST.ctx) return;
    var c = _LT_ST.ctx, def = c.def, tokens = c.tokens, st = c.st;
    var N = parseInt(jQ('#lt-st-n').val(), 10) || 10, span = parseInt(jQ('#lt-st-span').val(), 10) || 0, minPicks = 3;
    var prog = function (t) { jQ('#lt-st-progress').text(t); };
    _LT_ST.running = true; _LT_ST.stop = false;
    jQ('#lt-st-run').prop('disabled', true);
    try {
        prog('Downloading the ' + def.label + ' list…');
        var list = await _ltFetchUniverse(c.key);
        var nTok = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS['NIFTY 50'] : null;
        if (!nTok) throw new Error('NIFTY 50 token not found');
        prog('Loading NIFTY 50 history…');
        var nc = await _psFetchDaily(nTok, _LT_BT_DAYS);
        var nd = nc.map(function (x) { return String(x[0]).slice(0, 10); }), ncl = nc.map(function (x) { return parseFloat(x[4]); });
        var nsma = _psSmaArr(ncl, 200);
        var lastT = nd.length - 1 - N, firstT = _LT_BT_MIN_HIST;
        if (span > 0) firstT = Math.max(firstT, lastT - span);
        var tDates = [];
        for (var t = lastT; t >= firstT; t -= N) tDates.unshift(t);
        if (!tDates.length) throw new Error('not enough NIFTY history');
        var todo = list.filter(function (m) { return tokens[m.symbol]; });
        var obs = [], done = 0, used = 0;
        var work = async function (m) {
            var candles = null;
            try { candles = await _psFetchDaily(tokens[m.symbol], _LT_BT_DAYS); } catch (e) {}
            done++;
            if (!candles || candles.length < 250) return;
            var sd = candles.map(function (x) { return String(x[0]).slice(0, 10); }), scl = candles.map(function (x) { return parseFloat(x[4]); });
            var any = false;
            for (var k = 0; k < tDates.length; k++) {
                var ti = tDates[k], i0 = _ltIdxAtDate(sd, nd[ti]);
                if (i0 < 199 || sd[i0] < nd[Math.max(0, ti - 5)]) continue;
                var j = _ltIdxAtDate(sd, nd[ti + N]);
                if (j <= i0 || sd[j] < nd[Math.max(ti + 1, ti + N - 2)]) continue;           // the stock had no price near the exit date
                var row = _ltAnalyse({ symbol: m.symbol, company: m.company, industry: m.industry }, candles.slice(0, i0 + 1), ncl.slice(0, ti + 1));
                if (row.short) continue;
                var ret = (scl[j] / scl[i0] - 1) * 100, bench = (ncl[ti + N] / ncl[ti] - 1) * 100;
                obs.push({ t: ti, r: { symbol: m.symbol, verdict: row.verdict, timing: row.timing, rs12: row.rs12, vs200: row.vs200, slope200: row.slope200, thin: row.thin, rank: null, rankN: 0 }, ret: ret, ex: ret - bench });
                any = true;
            }
            if (any) used++;
            if (done % 5 === 0) { prog('Stocks ' + done + ' / ' + todo.length + ', ' + obs.length + ' observations…'); await new Promise(function (rs) { setTimeout(rs, 0); }); }
        };
        var idx = 0, workers = [];
        for (var w = 0; w < _LT_POOL; w++) workers.push((async function () { while (idx < todo.length && !_LT_ST.stop) { var it = todo[idx++]; await work(it); } })());
        await Promise.all(workers);
        var byT = {}; obs.forEach(function (o) { (byT[o.t] = byT[o.t] || []).push(o); });
        var dates = [];
        Object.keys(byT).map(Number).sort(function (a, b) { return a - b; }).forEach(function (ti) {
            var l = byT[ti];
            var rk = l.filter(function (o) { return o.r.rs12 != null; }).sort(function (a, b) { return b.r.rs12 - a.r.rs12; });
            l.forEach(function (o) { o.r.rankN = rk.length; });
            rk.forEach(function (o, i) { o.r.rank = i + 1; });
            if (l.length < 20) return;                                                         // too few stocks on that date to rank
            var pick = l.filter(function (o) { return _ltPassScreen(o.r, st); });
            var av = function (a, k) { return a.length ? a.reduce(function (s, o) { return s + o[k]; }, 0) / a.length : null; };
            dates.push({ date: nd[ti], reg: (nsma[ti] != null && ncl[ti] > nsma[ti]) ? 'UP' : 'DOWN', bench: (ncl[ti + N] / ncl[ti] - 1) * 100,
                nScreen: pick.length, scrRet: av(pick, 'ret'), scrEx: av(pick, 'ex'), allRet: av(l, 'ret'), allEx: av(l, 'ex') });
        });
        if (!dates.length) throw new Error('no usable dates');
        _LT_ST.res = { label: def.label, screen: c.screen, n: N, nStocks: used, dates: dates, minPicks: minPicks };
        prog(_LT_ST.stop ? 'Stopped, showing what was tested.' : 'Done.');
        jQ('#lt-st-out').html(_ltStHtml(_LT_ST.res));
    } catch (e) {
        prog('Screen test failed: ' + (e && e.message ? e.message : e));
    }
    _LT_ST.running = false; jQ('#lt-st-run').prop('disabled', false);
}
jQ(document).on('click', '#lt-screentest-btn', function () { _ltRunScreenTest(); });
jQ(document).on('click', '#lt-st-run', function () { _ltScreenTestGo(); });
jQ(document).on('click', '#lt-st-stop', function () { _LT_ST.stop = true; });

// ── Events ────────────────────────────────────────────────────────────────────────────────────────────────────────
jQ(document).on('click', '#lt-scan-btn', function () { _ltRunScan(); });
jQ(document).on('click', '#lt-stop-btn', function () { _LT_STATE.stop = true; });
jQ(document).on('change', '#lt-universe', function () {
    _LT_STATE.universe = jQ(this).val(); _LT_CACHE = {}; _LT_META = { universe: _LT_STATE.universe, total: 0, scanned: 0, noToken: [], noData: [], at: '' };
    jQ('#lt-summary').empty();
    if (!_ltRestore(_LT_STATE.universe)) { jQ('#lt-progress').text(''); jQ('#lt-table-wrap').html('<div class="sv-empty-state"><i class="bi bi-hourglass-split"></i><span>Click SCAN to analyse ' + _LT_UNIVERSES[_LT_STATE.universe].label + '.</span></div>'); }
    else _ltRender();
});
jQ(document).on('click', '#lt-shortlist-btn', function () {
    _LT_STATE.shortlist = !_LT_STATE.shortlist;
    jQ(this).toggleClass('sv-seg-active', _LT_STATE.shortlist);
    jQ('#lt-filter, #lt-timing').prop('disabled', _LT_STATE.shortlist);
    if (_LT_STATE.shortlist) { _LT_STATE.sort = 'rank'; jQ('#lt-sort').val('rank'); }
    _ltRender();
});
jQ(document).on('change', '#lt-filter', function () { _LT_STATE.filter = jQ(this).val(); _ltRender(); });
jQ(document).on('change', '#lt-timing', function () { _LT_STATE.timing = jQ(this).val(); _ltRender(); });
jQ(document).on('change', '#lt-sort', function () { _LT_STATE.sort = jQ(this).val(); _ltRender(); });
jQ(document).on('input', '#lt-search', function () { _LT_STATE.search = jQ(this).val(); _ltRender(); });
// Swing / Long-term switch at the top of the Positional Screener (popup and Dashboard tab share the same markup)
jQ(document).on('click', '.ps-mode-btn', function () {
    var mode = jQ(this).attr('data-mode');
    var $wrap = jQ(this).closest('.ps-wrap');
    $wrap.find('.ps-mode-btn').removeClass('sv-seg-active');
    jQ(this).addClass('sv-seg-active');
    $wrap.find('#ps-swing-panel').css('display', mode === 'swing' ? 'flex' : 'none');
    $wrap.find('#ps-lt-panel').css('display', mode === 'lt' ? 'flex' : 'none');
    if (mode === 'lt') {
        if (!Object.keys(_LT_CACHE).length) _ltRestore(_LT_STATE.universe);
        _ltRender();
        _ltFit();
    }
});
