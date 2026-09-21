// ─── backtest.js ────────────────────────────────────────────────────────────
// F&O stock backtesting popup — pick a past "current day + time" snapshot and a
// "previous date", select instruments, and see the same Instrument / Predict /
// OI-OBV / Price Action / Futures row layout Stock Viewer uses, but computed
// entirely from historical candles for the dates you chose.
//
// ISOLATION CONTRACT (do not violate when editing this file):
//   - Never read or write INSTRUMENT_SCORE_MAP, INSTRUMENT_LTP_PRICE,
//     INSTRUMENT_LIST_GLOBAL, VALID_BREAKOUT_NINE_FIFTEEN, or any other live
//     cache. All backtest state lives in BT_CACHE (declared below), a totally
//     separate object.
//   - Never call the live orchestration functions that read/write those caches
//     (showPrictionProbabilty, showOIOBVBarChart, showFutureDetails,
//     computeInstrumentScore, generateTrend, _svComputePrediction, ...).
//   - DO reuse the small set of already-pure helpers that only take data as
//     parameters and return a value / draw into a given container: getStrikeDetails,
//     getVixRange, _gtbClassify915, _gtbClassifyFutures, scoreOIStrikeForSignal,
//     _gtbFindWalls, calculateOBVFiveMinutesInterval, _renderLWChart,
//     _gtbRemarkChip, _gtbVwapChip, getFuturesTrendScore, _oiBarColor,
//     _gtbDimForITM, _gtbIsITM, getHistoricalDataUsingPromise. These are safe
//     because they don't touch global state — verified before this file was written.
// ─────────────────────────────────────────────────────────────────────────────

var BT_CACHE = {}; // BT_CACHE[name] = { ...everything computed for that instrument }
var BT_SUFFIX = '-bt';

jQ(document).on('click', '#show-backtest-popup', function (e) {
    e.preventDefault();
    _btShowPopup();
});

function _btDefaultDates() {
    var today = moment().format('YYYY-MM-DD');
    var prev = moment().subtract(1, 'days');
    // Skip back over a weekend for the default previous-date suggestion — user can
    // still override manually (dates are picked manually per the isolation design).
    while (prev.day() === 0 || prev.day() === 6) prev.subtract(1, 'days');
    return { current: today, time: '09:20', prev: prev.format('YYYY-MM-DD') };
}

function _btShowPopup() {
    var d = _btDefaultDates();
    // Single flex-shrink:0 header block (controls + chips + status all inside one
    // container) so there are only TWO flex children in .bt-bk-wrap total — header
    // and rows-wrap — leaving no room for stray flex distribution to open gaps.
    var html = '<div class="bt-bk-wrap">'
        + '<div class="bt-bk-header">'
        +   '<div class="bt-bk-controls">'
        +     '<label>Current day <input type="date" id="bt-bk-curdate" value="' + d.current + '"></label>'
        +     '<label>Time <input type="time" id="bt-bk-curtime" value="' + d.time + '"></label>'
        +     '<label>Previous date <input type="date" id="bt-bk-prevdate" value="' + d.prev + '"></label>'
        +     '<div class="bt-bk-search">'
        +       '<input type="text" id="bt-bk-input" placeholder="Search F&amp;O symbol…" autocomplete="off">'
        +       '<button id="bt-bk-add" class="fsig-add-btn"><i class="bi bi-plus-circle"></i> Add</button>'
        +       '<div id="bt-bk-ac-drop" class="fsig-ac-drop" style="position:fixed;"></div>'
        +     '</div>'
        +     '<button id="bt-bk-load" class="sv-load-btn"><i class="bi bi-play-fill"></i> LOAD</button>'
        +   '</div>'
        +   '<div class="fsig-chip-box bt-bk-chip-box" id="bt-bk-chip-box"><input id="bt-bk-chip-input" type="text" placeholder="Selected instruments…" readonly style="pointer-events:none;width:0;"></div>'
        +   '<div id="bt-bk-status" class="bt-bk-status"></div>'
        + '</div>'
        + '<div id="bt-bk-rows-wrap" class="bt-bk-rows-wrap">'
        +   '<div class="sv-empty-state"><i class="bi bi-clock-history"></i><span>Pick dates + instruments, then LOAD</span></div>'
        + '</div>'
        + '</div>';

    var winW = window.innerWidth || document.documentElement.clientWidth;
    var winH = window.innerHeight || document.documentElement.clientHeight;
    var pw = Math.min(winW - 40, 1400), ph = Math.min(winH - 60, 800);

    showPopUpWindow('backtest-popup', html, 'F&O Backtest', pw, ph);
    var cls = 'popup-custom-style-backtest-popup';
    var title = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<i class="bi bi-clock-history"></i><span style="font-weight:800;font-size:0.7rem;">F&amp;O BACKTEST</span>'
        + popupWinControls(cls)
        + '</div>';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html(title);
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + cls).find('.popupwindow_content').css({
        display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
        padding: '0', position: 'relative',
    });
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
}

// ── Symbol search / chip picker (search-only, no live-breakout filter chips —
// ASO/BSO/9:15 filters describe TODAY's state and don't apply to a past date) ──
// Restricted to F&O-eligible underlyings (OPTION_STRIKE_LIST names, mapped back to
// this app's display names) — this is an F&O backtest tool, cash-only names can
// never get OI/OBV data so they're excluded from the picker entirely.
var _BT_OPT_TO_DISPLAY = { 'NIFTY': 'NIFTY 50', 'BANKNIFTY': 'NIFTY BANK', 'FINNIFTY': 'NIFTY FIN SERVICE', 'MIDCPNIFTY': 'NIFTY MID SELECT' };
function _btAllNames() {
    var seen = {}, list = [];
    function add(n) { n = (n || '').trim().toUpperCase(); n = _BT_OPT_TO_DISPLAY[n] || n; if (n && !seen[n]) { seen[n] = 1; list.push(n); } }
    if (typeof OPTION_STRIKE_LIST !== 'undefined') OPTION_STRIKE_LIST.forEach(function (r) { add(r.name); });
    return list.sort();
}
jQ(document).on('input', '#bt-bk-input', function () {
    var q = jQ(this).val().trim().toUpperCase();
    var $drop = jQ('#bt-bk-ac-drop');
    if (!q) { $drop.empty().hide(); return; }
    var items = _btAllNames().filter(function (n) { return n.indexOf(q) !== -1; }).slice(0, 12);
    if (!items.length) { $drop.empty().hide(); return; }
    $drop.empty();
    items.forEach(function (n) { $drop.append('<div class="fsig-ac-item" data-name="' + n + '">' + n + '</div>'); });
    var rect = document.getElementById('bt-bk-input').getBoundingClientRect();
    $drop.css({ top: (rect.bottom + 2) + 'px', left: rect.left + 'px', width: rect.width + 'px' }).show();
});
jQ(document).on('click', '.fsig-ac-item', function () {
    var $box = jQ(this).closest('body').find('#bt-bk-chip-box');
    if (!$box.length) return; // click belongs to a different popup's autocomplete
    _btAddChip(jQ(this).data('name'));
    jQ('#bt-bk-ac-drop').empty().hide();
    jQ('#bt-bk-input').val('');
});
function _btAddChip(name) {
    name = (name || '').trim().toUpperCase();
    if (!name || jQ('#bt-bk-chip-box .fsig-chip[data-name="' + name + '"]').length) return;
    var chip = jQ('<span class="fsig-chip" data-name="' + name + '">' + name + '<i class="bi bi-x fsig-chip-x"></i></span>');
    jQ('#bt-bk-chip-input').before(chip);
}
jQ(document).on('click', '#bt-bk-add', function () {
    var raw = jQ('#bt-bk-input').val().trim().toUpperCase();
    if (raw) _btAddChip(raw);
    jQ('#bt-bk-input').val('');
    jQ('#bt-bk-ac-drop').empty().hide();
});
jQ(document).on('click', '#bt-bk-chip-box .fsig-chip-x', function (e) {
    e.stopPropagation();
    jQ(this).closest('.fsig-chip').remove();
});

// ── LOAD button — fetch + render every selected instrument ────────────────────
jQ(document).on('click', '#bt-bk-load', async function () {
    var names = jQ('#bt-bk-chip-box .fsig-chip').map(function () { return jQ(this).data('name'); }).get();
    if (!names.length) { jQ('#bt-bk-status').text('Add at least one instrument first.'); return; }
    var curDate = jQ('#bt-bk-curdate').val(), curTime = jQ('#bt-bk-curtime').val(), prevDate = jQ('#bt-bk-prevdate').val();
    if (!curDate || !curTime || !prevDate) { jQ('#bt-bk-status').text('Pick all three date/time fields first.'); return; }

    var $btn = jQ(this);
    $btn.prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Loading…');

    var header = '<div id="bt-bk-rows-head">'
        + '<span class="gtb-rh-instr">INSTRUMENT</span>'
        + '<span class="gtb-rh-predict"><i class="bi bi-lightbulb-fill"></i> PREDICT</span>'
        + '<span class="gtb-rh-oiobv">OI / OBV</span>'
        + '<span class="gtb-rh-chart">PRICE ACTION</span>'
        + '<span class="gtb-rh-fut">FUTURES</span>'
        + '</div>';
    var html = header;
    names.forEach(function (name) { html += _btRowShellHtml(name); });
    jQ('#bt-bk-rows-wrap').html(html);
    jQ('#bt-bk-status').text('Loading ' + names.length + ' instrument(s)…');

    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        jQ('#bt-bk-status').text('Loading ' + name + ' (' + (i + 1) + '/' + names.length + ')…');
        try {
            await _btLoadOneInstrument(name, curDate, curTime, prevDate);
        } catch (e) { console.log('[backtest]', name, e); }
    }
    jQ('#bt-bk-status').text('Done — ' + names.length + ' instrument(s) as of ' + curDate + ' ' + curTime + ' (prev: ' + prevDate + ')');
    $btn.prop('disabled', false).html('<i class="bi bi-play-fill"></i> LOAD');
});

// ── One row's static shell (identity/placeholders) — filled in as data lands ──
function _btRowShellHtml(name) {
    var tid = name.replace(/ /g, '-').replace(/&/g, '-');
    return '<div class="gtb-row cat-stock" id="bt-bk-row-' + tid + '">'
        + '<div class="gtb-row-id">'
        +   '<div class="gtb-row-name">' + name + '</div>'
        +   '<div class="gtb-row-ltp" id="' + tid + '-ltp' + BT_SUFFIX + '">…</div>'
        +   '<div id="' + tid + '-zone' + BT_SUFFIX + '" style="font-size:0.48rem;font-weight:700;"></div>'
        + '</div>'
        + '<div class="gtb-row-predict" id="' + tid + '-predict' + BT_SUFFIX + '"><span class="gtb-row-na" style="margin:auto">—</span></div>'
        + '<div class="gtb-row-oiobv">'
        +   '<div class="gtb-oiobv-lbl">OI</div>'
        +   '<div id="' + tid + '-oi' + BT_SUFFIX + '" style="height:70px;"></div>'
        +   '<div class="gtb-oiobv-lbl">OBV</div>'
        +   '<div id="' + tid + '-obv' + BT_SUFFIX + '" style="height:70px;"></div>'
        +   '<div id="' + tid + '-oiobv-xaxis' + BT_SUFFIX + '" class="gtb-oiobv-xaxis"></div>'
        + '</div>'
        + '<div class="gtb-row-col-chart">'
        +   '<div id="' + tid + '-chart' + BT_SUFFIX + '" class="gtb-chart-mini gtb-row-chart"></div>'
        + '</div>'
        + '<div class="gtb-row-col gtb-row-fut" id="' + tid + '-fut' + BT_SUFFIX + '"><span class="gtb-row-na">—</span></div>'
        + '</div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH + COMPUTE PIPELINE — everything below reads only its own parameters and
// writes only into BT_CACHE[name] / this popup's own DOM ids. Nothing here ever
// touches INSTRUMENT_SCORE_MAP or any other live cache.
// ─────────────────────────────────────────────────────────────────────────────

async function _btLoadOneInstrument(name, curDate, curTime, prevDate) {
    var tid = name.replace(/ /g, '-').replace(/&/g, '-');
    var bt = { name: name };
    BT_CACHE[name] = bt;

    var token = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS[name] : null;
    if (!token) {
        jQ('#' + tid + '-ltp' + BT_SUFFIX).text('No token');
        return;
    }

    // ── Spot candles: prevDate 09:00 through curDate+curTime, one request ──────
    var fromDt = prevDate + ' 09:00:00';
    var toDt = curDate + ' ' + curTime + ':00';
    var raw = await getHistoricalDataUsingPromise(token, fromDt, toDt, '5minute');
    var candles = (raw && raw.data && raw.data.candles) ? raw.data.candles : [];
    var prevCandles = candles.filter(function (c) { return c[0].indexOf(prevDate) === 0; });
    var todayCandles = candles.filter(function (c) { return c[0].indexOf(curDate) === 0; });

    if (!prevCandles.length || !todayCandles.length) {
        jQ('#' + tid + '-ltp' + BT_SUFFIX).text('No data');
        jQ('#' + tid + '-zone' + BT_SUFFIX).html('<span style="color:var(--gtb-red);">no candles for these dates</span>');
        return;
    }

    var prevClose = parseFloat(prevCandles[prevCandles.length - 1][4]);
    var dayOpen = parseFloat(todayCandles[0][1]);
    var ltp = parseFloat(todayCandles[todayCandles.length - 1][4]);
    var change = prevClose ? ((ltp - prevClose) / prevClose * 100) : 0;

    // generateTrend()'s res['open'] (what live's ATM-strike selection actually reads —
    // oiAnalyzer.js:246) comes from INSTRUMENT_LIST_GLOBAL, itself populated by a
    // 'day'-interval fetch's own open field (loadOpenPrice()) — NOT the 09:15 5-minute
    // candle's open used above for strike levels/9:15 zone. The two can differ by a few
    // points depending on how Kite buckets the opening tick across interval granularities,
    // which is enough to flip which strike is "≥ price" and therefore ATM. Fetch the same
    // 'day' candle live uses so ATM selection matches exactly instead of approximating it
    // from the 5-min series.
    var dayOpenForATM = dayOpen;
    try {
        var dayRaw = await getHistoricalDataUsingPromise(token, prevDate + ' 09:00:00', curDate + ' 15:30:00', 'day');
        var dayCandles = (dayRaw && dayRaw.data && dayRaw.data.candles) ? dayRaw.data.candles : [];
        var todayDayCandle = dayCandles.filter(function (c) { return c[0].indexOf(curDate) === 0; })[0];
        if (todayDayCandle) dayOpenForATM = parseFloat(todayDayCandle[1]);
    } catch (e) {}

    var strikeData = null, zone915 = 'B/W';
    try {
        strikeData = getStrikeDetails({ price: dayOpen }, name);
        // 9:15 candle = first candle of today (fromDt starts at 09:00, so [0] is 09:15 once
        // the market's own candle boundaries are applied by Kite — if curTime is before
        // 09:20 there simply isn't a completed 9:15 candle yet).
        if (todayCandles.length >= 1) {
            var close915 = parseFloat(todayCandles[0][4]);
            zone915 = _gtbClassify915(name, dayOpen, close915);
        }
    } catch (e) {}

    // ── India VIX, for VIXU/VIXL context only (not used to gate anything here) ──
    var vixRange = null;
    try {
        var vixToken = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS['INDIA VIX'] : null;
        if (vixToken) {
            var vixRaw = await getHistoricalDataUsingPromise(vixToken, fromDt, toDt, '5minute');
            var vixCandles = (vixRaw && vixRaw.data && vixRaw.data.candles) ? vixRaw.data.candles : [];
            var vixToday = vixCandles.filter(function (c) { return c[0].indexOf(curDate) === 0; });
            if (vixToday.length) {
                var vixLtp = parseFloat(vixToday[vixToday.length - 1][4]);
                var vr = getVixRange(prevClose, vixLtp);
                vixRange = { vixu: parseFloat(vr.vixDDUpper), vixl: parseFloat(vr.vixDDLower), vixVal: vixLtp };
            }
        }
    } catch (e) {}

    bt.prevClose = prevClose; bt.dayOpen = dayOpen; bt.ltp = ltp; bt.change = change;
    bt.strikeData = strikeData; bt.zone915 = zone915; bt.vixRange = vixRange;
    bt.spotCandles = todayCandles;

    // ── Identity strip ──────────────────────────────────────────────────────────
    jQ('#' + tid + '-ltp' + BT_SUFFIX).text(ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 }));
    var zc = (zone915 === 'AST' || zone915 === 'ASO') ? 'var(--gtb-green)' : (zone915 === 'BST' || zone915 === 'BSO') ? 'var(--gtb-red)' : 'var(--gtb-muted)';
    jQ('#' + tid + '-zone' + BT_SUFFIX).html('<span style="color:' + zc + ';">' + zone915 + ' · ' + (change > 0 ? '+' : '') + change.toFixed(2) + '%</span>');

    // ── Price Action chart (reuses the live app's own pure chart renderer) ──────
    try {
        var refLines = [];
        if (strikeData) {
            refLines.push({ key: 'OPEN', value: dayOpen });
            refLines.push({ key: 'ASO', value: parseFloat(strikeData.ustrikeOne) });
            refLines.push({ key: 'AST', value: parseFloat(strikeData.ustrikeTwo) });
            refLines.push({ key: 'BSO', value: parseFloat(strikeData.bstrikeOne) });
            refLines.push({ key: 'BST', value: parseFloat(strikeData.bstrikeTwo) });
        }
        if (vixRange) {
            refLines.push({ key: 'VIXU', value: vixRange.vixu });
            refLines.push({ key: 'VIXL', value: vixRange.vixl });
        }
        _renderLWChart('#' + tid + '-chart' + BT_SUFFIX, todayCandles, refLines, null, { hideLegend: false });
    } catch (e) {}

    // ── Futures (REMARK + VWAP-trend badge) ──────────────────────────────────────
    var futInfo = await _btFetchFutures(name, fromDt, toDt, curDate, prevDate);
    bt.futures = futInfo;
    if (futInfo) {
        var remarkHtml = _gtbRemarkChip(futInfo.remark);
        var vwapHtml = _gtbVwapChip(futInfo.trendHtml, futInfo.remark);
        jQ('#' + tid + '-fut' + BT_SUFFIX).html(remarkHtml + ' ' + vwapHtml);
    } else {
        jQ('#' + tid + '-fut' + BT_SUFFIX).html('<span class="gtb-row-na">no futures data</span>');
    }

    // ── OI/OBV (current-month expiry only — see file header) ────────────────────
    // ATM strike selection mirrors showTrendingOI()'s own currentPrice choice
    // (oiAnalyzer.js:246-249) — a user-configurable MonkeyConfig setting, not a fixed
    // rule, so the backtest has to read the same flag rather than hardcode day-open.
    var atmPrice = (typeof USE_LTP_FOR_STRIKE !== 'undefined' && USE_LTP_FOR_STRIKE) ? ltp : dayOpenForATM;
    var oiInfo = await _btFetchOI(name, atmPrice, fromDt, toDt, curDate);
    bt.oi = oiInfo;
    if (oiInfo && oiInfo.tableData.length) {
        _btRenderOIOBV(tid, oiInfo, change, dayOpen);
    } else {
        jQ('#' + tid + '-oi' + BT_SUFFIX).html('<span class="gtb-row-na" style="font-size:0.46rem;">no OI data (expiry likely rolled)</span>');
        jQ('#' + tid + '-obv' + BT_SUFFIX).empty();
    }

    // ── Score + Prediction (pure re-derivation of the live formula) ─────────────
    var score = _btComputeScore(bt, oiInfo, futInfo);
    bt.score = score;
    var pred = _btComputePrediction(name, bt, score);
    bt.prediction = pred;
    jQ('#' + tid + '-predict' + BT_SUFFIX).html(_btPredictCompactHtml(pred));
}

// ── Futures fetch + classification (mirrors live REMARK logic, purely) ────────
async function _btFetchFutures(name, fromDt, toDt, curDate, prevDate) {
    try {
        if (typeof FUTURE_INTRUMENT_LIST === 'undefined') return null;
        var futName = name === 'NIFTY 50' ? 'NIFTY' : name === 'NIFTY BANK' ? 'BANKNIFTY' : name;
        var entry = FUTURE_INTRUMENT_LIST.find(function (f) { return f.name === futName; });
        if (!entry) return null;
        var raw = await getHistoricalDataUsingPromise(entry.instrument_token, fromDt, toDt, '5minute');
        var candles = (raw && raw.data && raw.data.candles) ? raw.data.candles : [];
        var prevC = candles.filter(function (c) { return c[0].indexOf(prevDate) === 0; });
        var todayC = candles.filter(function (c) { return c[0].indexOf(curDate) === 0; });
        if (!prevC.length || !todayC.length) return null;

        var prevQuote = { open: prevC[0][1], high: Math.max.apply(null, prevC.map(function (c) { return c[2]; })),
            low: Math.min.apply(null, prevC.map(function (c) { return c[3]; })), close: prevC[prevC.length - 1][4],
            volume: prevC.reduce(function (s, c) { return s + (c[5] || 0); }, 0), oi: prevC[prevC.length - 1][6] || 0 };
        var quote = { open: todayC[0][1], high: Math.max.apply(null, todayC.map(function (c) { return c[2]; })),
            low: Math.min.apply(null, todayC.map(function (c) { return c[3]; })), close: todayC[todayC.length - 1][4],
            volume: todayC.reduce(function (s, c) { return s + (c[5] || 0); }, 0), oi: todayC[todayC.length - 1][6] || 0 };
        var intradayCandles = todayC.map(function (c) { return { time: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5], oi: c[6] }; });

        var lotSize = entry.lot_size || 1;
        var result = _gtbClassifyFutures(quote, prevQuote, lotSize, intradayCandles, {});
        // trendHtml mimics getFutureDirection()'s badge text so _gtbVwapChip can parse it —
        // reuse the same VWAP-vs-price comparison it does, expressed as a plain label.
        var vwapBull = quote.close >= result.vwap;
        var trendHtml = '<span>' + (vwapBull ? 'BUY' : 'SELL') + '</span>';
        return { remark: result.remark, dir: result.dir, vwap: result.vwap, trendHtml: trendHtml, vwapBull: vwapBull };
    } catch (e) { console.log('[backtest] futures fetch', name, e); return null; }
}

// ── OI/OBV fetch — ATM±2 strikes from the CURRENTLY listed expiry only ────────
async function _btFetchOI(name, dayOpen, fromDt, toDt, curDate) {
    try {
        if (typeof OPTION_STRIKE_LIST === 'undefined') return null;
        var optName = name === 'NIFTY 50' ? 'NIFTY' : name === 'NIFTY BANK' ? 'BANKNIFTY'
            : name === 'NIFTY FIN SERVICE' ? 'FINNIFTY' : name === 'NIFTY MID SELECT' ? 'MIDCPNIFTY' : name;
        var matches = OPTION_STRIKE_LIST.filter(function (r) { return r.name === optName; });
        if (!matches.length) return null;

        var strikes = matches.map(function (r) { return parseFloat(r.strike); })
            .filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
        var atmStrike = strikes.find(function (s) { return s >= dayOpen; }) || strikes[strikes.length - 1];
        var atmIdx = strikes.indexOf(atmStrike);
        var picked = strikes.slice(Math.max(0, atmIdx - 2), atmIdx + 3);

        // Every picked strike gets a column, even if its historical fetch comes back
        // empty (e.g. a deep OTM strike with no trades yet that early in the session) —
        // it renders as a flat/neutral bar instead of silently vanishing, so the ATM±2
        // window always matches the live app's column count and stays comparable.
        var tableData = [];
        for (var i = 0; i < picked.length; i++) {
            var strike = picked[i];
            var ceEntry = matches.find(function (r) { return parseFloat(r.strike) === strike && r.instrument_type === 'CE'; });
            var peEntry = matches.find(function (r) { return parseFloat(r.strike) === strike && r.instrument_type === 'PE'; });

            var row = { STRIKE: strike, ATM_STRIKE: strike === atmStrike,
                OI_CE: '0.0', CHG_OI_CE: '0.0', OI_PE: '0.0', CHG_OI_PE: '0.0',
                CE_OBV: [{ obv: 0 }], PE_OBV: [{ obv: 0 }], CE_IV: [], PE_IV: [] };

            if (ceEntry && peEntry) {
                var ceRaw = await getHistoricalDataUsingPromise(ceEntry.instrument_token, fromDt, toDt, '5minute');
                var peRaw = await getHistoricalDataUsingPromise(peEntry.instrument_token, fromDt, toDt, '5minute');
                var ceAll = (ceRaw && ceRaw.data && ceRaw.data.candles) ? ceRaw.data.candles : [];
                var peAll = (peRaw && peRaw.data && peRaw.data.candles) ? peRaw.data.candles : [];
                var cePrev = ceAll.filter(function (c) { return c[0].indexOf(curDate) !== 0; });
                var ceToday = ceAll.filter(function (c) { return c[0].indexOf(curDate) === 0; });
                var pePrev = peAll.filter(function (c) { return c[0].indexOf(curDate) !== 0; });
                var peToday = peAll.filter(function (c) { return c[0].indexOf(curDate) === 0; });

                if (cePrev.length && ceToday.length && pePrev.length && peToday.length) {
                    var ceOI = ceToday[ceToday.length - 1][6] || 0, ceOIPrev = cePrev[cePrev.length - 1][6] || 0;
                    var peOI = peToday[peToday.length - 1][6] || 0, peOIPrev = pePrev[pePrev.length - 1][6] || 0;
                    row.OI_CE = (ceOI / 100000).toFixed(1); row.CHG_OI_CE = ((ceOI - ceOIPrev) / 100000).toFixed(1);
                    row.OI_PE = (peOI / 100000).toFixed(1); row.CHG_OI_PE = ((peOI - peOIPrev) / 100000).toFixed(1);
                    row.CE_OBV = calculateOBVFiveMinutesInterval(cePrev, ceToday);
                    row.PE_OBV = calculateOBVFiveMinutesInterval(pePrev, peToday);
                }
            }
            tableData.push(row);
        }
        return { tableData: tableData, atmStrike: atmStrike };
    } catch (e) { console.log('[backtest] OI fetch', name, e); return null; }
}

function _btRenderOIOBV(tid, oiInfo, priceChange, spot) {
    var data = oiInfo.tableData;
    var atmIdx = data.findIndex(function (r) { return r.ATM_STRIKE; });
    var walls = _gtbFindWalls(data, priceChange, spot);
    var ceColors = [], peColors = [];
    data.forEach(function (item) {
        var strike = parseFloat(item.STRIKE);
        var sig = scoreOIStrikeForSignal(item, item.ATM_STRIKE, priceChange, spot);
        var ceITM = _gtbIsITM('CE', strike, spot), peITM = _gtbIsITM('PE', strike, spot);
        ceColors.push(_gtbDimForITM(_oiBarColor(sig.ceLabel, 'CE'), ceITM));
        peColors.push(_gtbDimForITM(_oiBarColor(sig.peLabel, 'PE'), peITM));
    });

    _btSvgMiniBar('#' + tid + '-oi' + BT_SUFFIX, [
        { label: 'CH CE OI', color: '#dc3545', values: data.map(function (r) { return r.CHG_OI_CE; }), colors: ceColors },
        { label: 'CH PE OI', color: '#28a745', values: data.map(function (r) { return r.CHG_OI_PE; }), colors: peColors },
    ], atmIdx, walls);
    _btSvgMiniBar('#' + tid + '-obv' + BT_SUFFIX, [
        { label: 'CE OBV', color: '#dc3545', values: data.map(function (r) { var l = r.CE_OBV; return l[l.length - 1].obv; }), colors: ceColors },
        { label: 'PE OBV', color: '#28a745', values: data.map(function (r) { var l = r.PE_OBV; return l[l.length - 1].obv; }), colors: peColors },
    ], atmIdx, walls);

    var axEl = document.getElementById(tid + '-oiobv-xaxis' + BT_SUFFIX);
    if (axEl) {
        var W = 300, n = data.length, slotW = W / n;
        var svg = '<svg viewBox="0 0 ' + W + ' 18" width="100%" height="18" xmlns="http://www.w3.org/2000/svg" style="display:block;" preserveAspectRatio="none">';
        data.forEach(function (r, i) {
            var cx = i * slotW + slotW / 2;
            svg += '<text x="' + cx + '" y="13" text-anchor="middle" font-size="' + (r.ATM_STRIKE ? '9' : '8.5') + '" '
                + 'fill="' + (r.ATM_STRIKE ? '#fbbf24' : '#7d8590') + '" font-weight="' + (r.ATM_STRIKE ? '700' : '400') + '">' + r.STRIKE + '</text>';
        });
        svg += '</svg>';
        axEl.innerHTML = svg;
    }
}

// Small standalone SVG bar renderer — deliberately NOT the live app's _svgMiniBar
// (that one is a closure private to showOIOBVBarChart), a lean re-implementation
// of the same correctly-signed rendering logic so this file has zero dependency
// on live rendering internals.
function _btSvgMiniBar(containerId, seriesList, atmIdx, wallsArg) {
    var el = document.getElementById(containerId.replace(/^#/, ''));
    if (!el) return;
    var W = 300, H = 56;
    var n = seriesList[0].values.length;
    if (!n) { el.innerHTML = '<span style="color:#7d8590;font-size:0.5rem;padding:2px;">no data</span>'; return; }
    var maxV = 0;
    seriesList.forEach(function (s) { s.values.forEach(function (v) { var a = Math.abs(parseFloat(v) || 0); if (a > maxV) maxV = a; }); });
    if (!maxV) maxV = 1;
    var ns = seriesList.length, slotW = W / n, gap = 0.5;
    var barW = Math.max(1, (slotW * 0.6 - gap * (ns - 1)) / ns);
    var groupW = barW * ns + gap * (ns - 1);
    var midY = H / 2;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" xmlns="http://www.w3.org/2000/svg" style="display:block;" preserveAspectRatio="none">';
    svg += '<line x1="0" y1="' + midY + '" x2="' + W + '" y2="' + midY + '" stroke="#30363d" stroke-width="0.5"/>';
    for (var i = 0; i < n; i++) {
        var slotCx = i * slotW + slotW / 2, groupX = slotCx - groupW / 2;
        if (i === atmIdx) svg += '<rect x="' + (i * slotW) + '" y="0" width="' + slotW + '" height="' + H + '" fill="#fbbf2418" rx="1"/>';
        var wHit = wallsArg ? _gtbWallAt(wallsArg, i) : null;
        if (wHit) {
            var wCol = wHit.side === 'R' ? '#dc3545' : '#28a745', isPrim = wHit.tier === 'primary';
            svg += '<line x1="' + slotCx + '" y1="0" x2="' + slotCx + '" y2="' + H + '" stroke="' + wCol + '" stroke-width="' + (isPrim ? 1 : 0.6) + '" stroke-dasharray="' + (isPrim ? 'none' : '2,1.5') + '" opacity="' + (isPrim ? 0.8 : 0.55) + '"/>';
        }
        seriesList.forEach(function (s, si) {
            var v = parseFloat(s.values[i]) || 0;
            var bh = Math.max(1, Math.abs(v) / maxV * (midY - 2));
            var by = v >= 0 ? midY - bh : midY;
            var bx = groupX + si * (barW + gap);
            var barColor = (s.colors && s.colors[i]) ? s.colors[i] : s.color;
            svg += '<rect x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + bh + '" fill="' + barColor + '" opacity="0.85" rx="0.5"/>';
        });
    }
    svg += '</svg>';
    el.innerHTML = svg;
}

// ── Score — pure re-derivation of computeInstrumentScore()'s formula ──────────
// Max Pain and IV Skew are omitted (they need a full option-chain IV surface /
// Black-Scholes inversion across ALL strikes, out of scope for this backtest tool)
// rather than faked — those two nudges are simply left at 0.
function _btComputeScore(bt, oiInfo, futInfo) {
    var s = { nine_fifteen: 0, current_trend: 0, futures_trend: 0, oi_obv: 0, max_pain: 0, iv_skew: 0, total: 0 };
    var z = bt.zone915;
    if (z === 'AST') s.nine_fifteen = 2; else if (z === 'ASO') s.nine_fifteen = 1;
    else if (z === 'BST') s.nine_fifteen = -2; else if (z === 'BSO') s.nine_fifteen = -1;

    if (bt.strikeData) {
        var ltp = bt.ltp, sd = bt.strikeData;
        if (ltp >= parseFloat(sd.ustrikeTwo)) s.current_trend = 2;
        else if (ltp >= parseFloat(sd.ustrikeOne)) s.current_trend = 1;
        else if (ltp <= parseFloat(sd.bstrikeTwo)) s.current_trend = -2;
        else if (ltp <= parseFloat(sd.bstrikeOne)) s.current_trend = -1;
    }

    if (futInfo) s.futures_trend = futInfo.dir;

    if (oiInfo && oiInfo.tableData.length) {
        var total = 0;
        oiInfo.tableData.forEach(function (item) {
            var sig = scoreOIStrikeForSignal(item, item.ATM_STRIKE, bt.change, bt.dayOpen);
            var w = item.ATM_STRIKE ? 2 : 1;
            total += sig.score * w;
        });
        s.oi_obv = total;
    }

    s.total = s.nine_fifteen + s.current_trend + s.futures_trend + s.oi_obv + s.max_pain + s.iv_skew;
    return s;
}

// ── Prediction — same 3-layer model as _svComputePrediction, minus the signals
// that need live-only data (VWAP-trend nudge reuses the futures-derived vwapBull;
// level-probability/Max-Pain/IV-skew nudges are omitted rather than faked). ───
function _btComputePrediction(name, bt, score) {
    var bullBase = 33, bearBase = 33, sidewaysBase = 34;
    if (bt.zone915 === 'AST') { bullBase = 66; bearBase = 14; sidewaysBase = 20; }
    else if (bt.zone915 === 'ASO') { bullBase = 55; bearBase = 20; sidewaysBase = 25; }
    else if (bt.zone915 === 'BST') { bearBase = 66; bullBase = 14; sidewaysBase = 20; }
    else if (bt.zone915 === 'BSO') { bearBase = 55; bullBase = 20; sidewaysBase = 25; }

    var nudges = [], totalNudge = 0;
    function add(label, raw, weight) { var n = raw * weight; nudges.push({ label: label, raw: raw, weight: weight, nudge: n }); totalNudge += n; }
    add('9:15 breakout zone', score.nine_fifteen || 0, 2.0);
    add('Current trend', score.current_trend || 0, 2.5);
    add('Futures REMARK', score.futures_trend || 0, 3.0);
    if (bt.futures) add('VWAP price trend', bt.futures.vwapBull ? 1 : -1, 1.5);
    add('OI/OBV score', score.oi_obv || 0, 1.0);
    // NOT added: OBV flow (1.0), Level probability (1.5), Max Pain (0.6), IV Skew (0.8) —
    // intentionally omitted (file header). Their weight still counts toward the
    // denominator below so the shift is dampened the same way live's model dampens it
    // when those signals sit neutral, instead of the missing signals silently vanishing
    // from the math and letting the 5 present ones swing the outcome harder than they
    // would live (this previously caused e.g. ABB to read BULL 69%/BUY CE here vs the
    // live dashboard's BULL 47%/WAIT for the same instrument+time).
    var maxNudge = 2.0 + 2.5 + 3.0 + 1.5 + 1.0 + 1.0 + 1.5 + 0.6 + 0.8; // = 13.9, matches _svComputePrediction's full 9-signal weight sum
    var shift = Math.max(-40, Math.min(40, (totalNudge / maxNudge) * 40));
    var bullP = Math.max(5, Math.min(88, bullBase + shift));
    var bearP = Math.max(5, Math.min(88, bearBase - shift));
    var sidewaysP = Math.max(4, 100 - bullP - bearP);
    var tot = bullP + bearP + sidewaysP;
    bullP = Math.round(bullP / tot * 100); bearP = Math.round(bearP / tot * 100); sidewaysP = Math.max(0, 100 - bullP - bearP);

    var primaryBull = bullP > bearP && bullP > sidewaysP;
    var primaryBear = bearP > bullP && bearP > sidewaysP;
    var agreed = 0;
    // Denominator is nudges.length (only the 5 signals this backtest actually computes),
    // NOT live's full 9. A fixed-9 denominator was tried and rejected: it caps this
    // backtest's confidence at ~56% forever (5/9), so it could never show HIGH even when
    // every available signal agreed — a different, equally misleading bias than
    // overstating. There's no denominator that makes this number equivalent to live's,
    // since live has 4 signals (OBV flow, level-probability, Max Pain, IV skew) this tool
    // genuinely cannot compute — so the label below says "(5-signal)" to make clear this
    // is a narrower reading, not a mismatched copy of the live confidence number.
    var totalSigs = nudges.length || 1;
    nudges.forEach(function (n) {
        if (primaryBull && n.nudge > 0) agreed++;
        else if (primaryBear && n.nudge < 0) agreed++;
        else if (!primaryBull && !primaryBear && Math.abs(n.nudge) < 0.5) agreed++;
    });
    var confidence = Math.round((agreed / totalSigs) * 100);
    var lowConfidence = confidence < 45;

    var tradeAction = 'WAIT / RANGE', tradeColor = 'var(--gtb-amber)';
    if (primaryBull && bullP >= 52) { tradeAction = 'BUY CE'; tradeColor = 'var(--gtb-green)'; }
    else if (primaryBear && bearP >= 52) { tradeAction = 'BUY PE'; tradeColor = 'var(--gtb-red)'; }

    var scenarios;
    if (primaryBull) scenarios = [{ prob: bullP, label: 'BULL TREND', col: 'var(--gtb-green)' }, { prob: sidewaysP, label: 'RANGE DAY', col: 'var(--gtb-muted)' }, { prob: bearP, label: 'REVERSAL', col: 'var(--gtb-red)' }];
    else if (primaryBear) scenarios = [{ prob: bearP, label: 'BEAR TREND', col: 'var(--gtb-red)' }, { prob: sidewaysP, label: 'RANGE DAY', col: 'var(--gtb-muted)' }, { prob: bullP, label: 'REVERSAL', col: 'var(--gtb-green)' }];
    else scenarios = [{ prob: sidewaysP, label: 'SIDEWAYS', col: 'var(--gtb-muted)' }, { prob: bullP, label: 'BULL BREAK', col: 'var(--gtb-green)' }, { prob: bearP, label: 'BEAR BREAK', col: 'var(--gtb-red)' }];

    return {
        name: name, tradeAction: tradeAction, tradeColor: tradeColor, lowConfidence: lowConfidence,
        confidence: confidence, confLabel: lowConfidence ? 'LOW' : confidence >= 65 ? 'HIGH' : 'MODERATE',
        confColor: lowConfidence ? 'var(--gtb-red)' : confidence >= 65 ? 'var(--gtb-green)' : 'var(--gtb-amber)',
        primaryScenario: scenarios[0], scenarios: scenarios, nudges: nudges,
    };
}

function _btPredictCompactHtml(d) {
    var headlineColor = d.lowConfidence ? 'var(--gtb-amber)' : d.tradeColor;
    var sc = d.primaryScenario;
    return '<div style="padding:4px 6px;display:flex;flex-direction:column;gap:3px;height:100%;justify-content:center;">'
        + '<span style="font-size:0.5rem;font-weight:900;color:' + headlineColor + ';border:1px solid ' + headlineColor + ';padding:1px 5px;border-radius:3px;width:fit-content;">' + d.tradeAction + '</span>'
        + '<div style="font-size:0.46rem;font-weight:800;color:' + sc.col + ';">' + sc.label + ' <span style="font-family:var(--gtb-mono);">' + sc.prob + '%</span></div>'
        + '<div style="position:relative;height:5px;background:var(--gtb-border);border-radius:2px;"><div style="height:5px;width:' + sc.prob + '%;background:' + sc.col + ';border-radius:2px;"></div></div>'
        + '<div style="font-size:0.4rem;color:var(--gtb-muted);" title="Based on the 5 signals this backtest can compute (9:15, trend, futures, VWAP, OI/OBV) — not directly comparable to the live dashboard\'s 9-signal confidence, which also includes OBV flow, level-probability, Max Pain and IV skew.">Conf (5-sig) <b style="color:' + d.confColor + ';">' + d.confLabel + ' ' + d.confidence + '%</b></div>'
        + '</div>';
}
