// ─── positionalScreener.js ──────────────────────────────────────────────────
// Swing/positional screener — scans all F&O stocks on DAILY candles (not the
// 5-min intraday series every other tool in this app uses) for multi-day setups:
// trend structure (price vs SMA20/50), 20-day breakout/breakdown, relative
// strength vs NIFTY 50, and multi-day futures OI buildup (rising OI + rising
// price = long buildup, rising OI + falling price = short buildup, etc.).
//
// ISOLATION: standalone file, only reads existing globals (FO_LIST,
// INSTRUMENT_TOKENS, FUTURE_INTRUMENT_LIST, getHistoricalDataUsingPromise) —
// never writes INSTRUMENT_SCORE_MAP or any other live-shared cache, and never
// calls any of the existing intraday scoring functions. Nothing in the rest of
// the app is touched or behaves any differently with this file absent.
// ─────────────────────────────────────────────────────────────────────────────

var _PS_CACHE = {}; // _PS_CACHE[name] = { candles, futCandles, ...computed fields }

jQ(document).on('click', '#show-positional-screener', function (e) {
    e.preventDefault();
    _psShowPopup();
});

// ── Content HTML — shared by the standalone popup AND the "Positional" dashboard tab.
// All ids are global (not container-scoped), same as the rest of this app's popups —
// only one of {popup, tab} is expected to be on-screen at a time in normal use.
// Selection UI mirrors Stock Viewer's own filter bar + chip panel exactly (same
// classes/UX: category segment buttons open a chip panel, chips toggle selected) — plus
// a search+autocomplete box (same pattern as backtest.js's instrument picker) to add any
// symbol directly regardless of which category filter is active, for genuine multi-select.
function _psContentHtml() {
    var counts = _psCategoryCounts();
    return '<div class="ps-wrap">'
        // ── Filter bar ───────────────────────────────────────────────────────
        + '<div id="ps-filter-row">'
        +   '<div class="sv-seg-group">'
        +     _psSegBtn('all',    'ALL',        counts.all,    '')
        +     _psSegBtn('aso',    'ASO',        counts.aso,    'green')
        +     _psSegBtn('bso',    'BSO',        counts.bso,    'red')
        +     _psSegBtn('nine15', '9:15',       counts.nine15, 'gold')
        +     _psSegBtn('n50',    'NIFTY 50',   null,          '')
        +     _psSegBtn('bank',   'BANK NIFTY', null,          '')
        +     _psSegBtn('weight', 'WEIGHTED',   null,          '')
        +     _psSegBtn('idx',    'INDEX + MCX', null,         '')
        +   '</div>'
        + '</div>'
        // ── Chip panel: search-autocomplete add + category chip list ───────────
        + '<div id="ps-chip-panel">'
        +   '<div id="ps-chip-controls">'
        +     '<span id="ps-chip-label">SELECT INSTRUMENTS</span>'
        +     '<div class="bt-bk-search" style="min-width:200px;flex:0 0 auto;">'
        +       '<input type="text" id="ps-add-input" placeholder="Add symbol…" autocomplete="off">'
        +       '<button id="ps-add-btn" class="fsig-add-btn"><i class="bi bi-plus-circle"></i> Add</button>'
        +       '<div id="ps-add-ac-drop" class="fsig-ac-drop" style="position:fixed;"></div>'
        +     '</div>'
        +     '<div style="display:flex;gap:4px;">'
        +       '<button id="ps-chip-select-all" class="sv-pill-btn" type="button">All</button>'
        +       '<button id="ps-chip-select-none" class="sv-pill-btn" type="button">None</button>'
        +     '</div>'
        +     '<button id="ps-scan-btn" class="sv-load-btn" type="button"><i class="bi bi-play-fill"></i> SCAN</button>'
        +   '</div>'
        +   '<div id="ps-chip-list"></div>'
        + '</div>'
        // ── Results controls + table ────────────────────────────────────────────
        + '<div class="ps-controls">'
        +   '<span id="ps-progress" class="ps-progress"></span>'
        +   '<span id="ps-summary" class="ps-summary"></span>'
        +   '<select id="ps-filter" class="sv-pill-btn">'
        +     '<option value="all">All</option>'
        +     '<option value="buy">BUY / STRONG BUY</option>'
        +     '<option value="sell">SELL / STRONG SELL</option>'
        +     '<option value="watch">WATCH</option>'
        +   '</select>'
        +   '<select id="ps-sort" class="sv-pill-btn">'
        +     '<option value="score">Sort: Score</option>'
        +     '<option value="name">Sort: Name</option>'
        +     '<option value="rs">Sort: Rel Strength</option>'
        +   '</select>'
        +   '<input type="text" id="ps-search" class="dl-search" style="width:140px;margin:0;" placeholder="Search results…">'
        + '</div>'
        + '<div id="ps-table-wrap" class="ps-table-wrap">'
        +   '<div class="sv-empty-state"><i class="bi bi-funnel-fill"></i><span>Choose a filter above, or add symbols by search, then click SCAN</span></div>'
        + '</div>'
        + '</div>';
}

function _psShowPopup() {
    showPopUpWindow('positional-screener', _psContentHtml(), 'Positional Screener', 1150, 700);
    var cls = 'popup-custom-style-positional-screener';
    var title = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<i class="bi bi-funnel-fill"></i><span style="font-weight:800;font-size:0.7rem;">POSITIONAL SCREENER (SWING)</span>'
        + (typeof _ii === 'function' ? _ii('ps-overview') : '')
        + popupWinControls(cls)
        + '</div>';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html(title);
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + cls).find('.popupwindow_content').css({ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '0', position: 'relative' });
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');

    if (Object.keys(_PS_CACHE).length) _psRenderTable(); // restore last scan, if any, without re-fetching
}

// ── Dashboard tab entry point — renders the SAME content into the tab pane instead of a
// popup window. Only builds once (matches the app's own "manages its own DOM" convention
// for tabs like Trade/Dashboard — see _GTB_PANE_GRIDS) so switching away and back doesn't
// reset the chip selection or wipe a scan already in progress/completed.
function _psRenderInPane() {
    var $pane = jQ('#gtb-pane-positional');
    if (!$pane.length) return;
    if (!$pane.find('.ps-wrap').length) {
        $pane.html(_psContentHtml());
    }
    if (Object.keys(_PS_CACHE).length) _psRenderTable(); // keep results in sync on every tab activation
}

function _psSegBtn(filter, label, count, color) {
    var countHtml = count != null ? '<span class="sv-seg-count">' + count + '</span>' : '';
    return '<button class="sv-seg-btn ps-seg-btn" data-psfilter="' + filter + '" data-color="' + color + '" type="button">'
        + '<span class="sv-seg-label">' + label + '</span>' + countHtml + '</button>';
}

// ── Instrument list builder — scoped to what this screener actually supports (F&O
// stocks + the always-available indices/MCX), NOT the full INSTRUMENT_TOKENS universe
// Stock Viewer's own _svBuildList reads, since a non-F&O name has no futures OI to score.
function _psCategoryCounts() {
    var out = { all: (typeof FO_LIST !== 'undefined' ? FO_LIST.length : 0), aso: 0, bso: 0, nine15: 0 };
    try {
        var scriptData = generateTrends();
        var breakOut915 = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN')) || {};
        (typeof FO_LIST !== 'undefined' ? FO_LIST : []).forEach(function (name) {
            var trends = scriptData[name] ? scriptData[name]['trends'] : [];
            var c915 = breakOut915[name] && breakOut915[name]['CLOSE_9_15'];
            if (jQ.inArray('ASO', trends) !== -1) out.aso++;
            if (jQ.inArray('BSO', trends) !== -1) out.bso++;
            if (c915 === 'ASO' || c915 === 'BSO') out.nine15++;
        });
    } catch (e) {}
    return out;
}

function _psBuildList(type) {
    if (type === 'idx') return _PS_EXTRA_INSTRUMENTS.slice();
    var list = [];
    var scriptData = generateTrends();
    var breakOut915 = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN')) || {};
    (typeof FO_LIST !== 'undefined' ? FO_LIST : []).forEach(function (name) {
        var trends = scriptData[name] ? scriptData[name]['trends'] : [];
        var c915 = breakOut915[name] && breakOut915[name]['CLOSE_9_15'];
        if (type === 'all') { list.push(name); return; }
        if (type === 'aso' && jQ.inArray('ASO', trends) !== -1) list.push(name);
        if (type === 'bso' && jQ.inArray('BSO', trends) !== -1) list.push(name);
        if (type === 'nine15' && (c915 === 'ASO' || c915 === 'BSO')) list.push(name);
        if (type === 'n50' && typeof NIFTY_50_LIST !== 'undefined' && jQ.inArray(name, NIFTY_50_LIST) !== -1) list.push(name);
        if (type === 'bank' && typeof NIFTY_BANK_LIST !== 'undefined' && jQ.inArray(name, NIFTY_BANK_LIST) !== -1) list.push(name);
        if (type === 'weight' && typeof WEIGHTED_STOCKS !== 'undefined' && jQ.inArray(name, WEIGHTED_STOCKS) !== -1) list.push(name);
    });
    return list;
}

// ── Chip panel ────────────────────────────────────────────────────────────────
function _psShowChipPanel(list) {
    var chipsHtml = list.map(function (name) {
        return '<div class="sv-chip sv-chip-selected" data-name="' + name + '"><span class="sv-chip-name">' + name + '</span></div>';
    }).join('');
    jQ('#ps-chip-list').html(chipsHtml);
    jQ('#ps-chip-panel').show();
    _psUpdateScanCount();
}
jQ(document).on('click', '.ps-seg-btn', function () {
    jQ('.ps-seg-btn').removeClass('sv-seg-active');
    jQ(this).addClass('sv-seg-active');
    _psShowChipPanel(_psBuildList(jQ(this).attr('data-psfilter')));
});
jQ(document).on('click', '#ps-chip-panel .sv-chip', function () { jQ(this).toggleClass('sv-chip-selected'); _psUpdateScanCount(); });
jQ(document).on('click', '#ps-chip-select-all', function () { jQ('#ps-chip-panel .sv-chip').addClass('sv-chip-selected'); _psUpdateScanCount(); });
jQ(document).on('click', '#ps-chip-select-none', function () { jQ('#ps-chip-panel .sv-chip').removeClass('sv-chip-selected'); _psUpdateScanCount(); });

function _psUpdateScanCount() {
    var n = jQ('#ps-chip-panel .sv-chip.sv-chip-selected').length;
    jQ('#ps-scan-btn').html('<i class="bi bi-play-fill"></i> SCAN' + (n ? ' (' + n + ')' : ''));
}

// ── Search + autocomplete "Add" — lets a symbol be added regardless of which category
// filter is active, e.g. add one stock from outside NIFTY 50 while that filter is shown.
function _psAllNames() {
    var seen = {}, list = [];
    function add(n) { n = (n || '').trim().toUpperCase(); if (n && !seen[n]) { seen[n] = 1; list.push(n); } }
    (typeof FO_LIST !== 'undefined' ? FO_LIST : []).forEach(add);
    _PS_EXTRA_INSTRUMENTS.forEach(add);
    return list.sort();
}
function _psAddChip(name) {
    if (!jQ('#ps-chip-panel').is(':visible')) jQ('#ps-chip-panel').show();
    var $existing = jQ('#ps-chip-list .sv-chip[data-name="' + name + '"]');
    if ($existing.length) { $existing.addClass('sv-chip-selected'); }
    else { jQ('#ps-chip-list').append('<div class="sv-chip sv-chip-selected" data-name="' + name + '"><span class="sv-chip-name">' + name + '</span></div>'); }
    _psUpdateScanCount();
}
jQ(document).on('input', '#ps-add-input', function () {
    var q = jQ(this).val().trim().toUpperCase();
    var $drop = jQ('#ps-add-ac-drop');
    if (!q) { $drop.empty().hide(); return; }
    var items = _psAllNames().filter(function (n) { return n.indexOf(q) !== -1; }).slice(0, 12);
    if (!items.length) { $drop.empty().hide(); return; }
    var html = items.map(function (n) { return '<div class="fsig-ac-item" data-name="' + n + '">' + n + '</div>'; }).join('');
    var rect = this.getBoundingClientRect();
    $drop.html(html).css({ top: (rect.bottom + 2) + 'px', left: rect.left + 'px', width: rect.width + 'px' }).show();
});
jQ(document).on('click', '#ps-add-ac-drop .fsig-ac-item', function () {
    _psAddChip(jQ(this).attr('data-name'));
    jQ('#ps-add-input').val('');
    jQ('#ps-add-ac-drop').empty().hide();
});
jQ(document).on('click', '#ps-add-btn', function () {
    var name = jQ('#ps-add-input').val().trim().toUpperCase();
    if (name) _psAddChip(name);
    jQ('#ps-add-input').val('');
    jQ('#ps-add-ac-drop').empty().hide();
});
jQ(document).on('keydown', '#ps-add-input', function (e) { if (e.key === 'Enter') jQ('#ps-add-btn').click(); });
jQ(document).on('click', function (e) {
    if (!jQ(e.target).closest('#ps-add-ac-drop, #ps-add-input').length) jQ('#ps-add-ac-drop').empty().hide();
});

// ── Data fetch (daily candles, rate-limited via the app's existing hist queue) ──
// NOT d.toISOString() — that converts to UTC first, and IST is UTC+5:30, so any run
// between midnight and 5:30 AM IST would silently resolve "today" to the previous
// calendar day. Use local date components directly instead.
function _psDateStr(d) {
    var y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
}

async function _psFetchDaily(token, days) {
    // "Today" here is Tampermonkey's configured CURRENT_DAY (Settings → current_day_date),
    // the same convention every other historical fetch in this app uses (_gtbCurrDay()) —
    // NOT the real wall-clock date. CURRENT_DAY defaults to today but can be overridden,
    // e.g. to review a specific past session; new Date() would silently ignore that.
    var to = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? new Date(CURRENT_DAY + 'T00:00:00') : new Date();
    var from = new Date(to); from.setDate(from.getDate() - days);
    // Respect the app-wide snapshot-time picker (#gtb-hist-time / _gtbHistTime()) the same
    // way every other historical fetch does — a 'day'-interval candle for TODAY reflects
    // the true live intraday state and can't be truncated mid-session by date alone, so
    // this only actually matters for today's own (last) candle; every earlier day in the
    // series is a completed session regardless. Falls back to market close (15:30) when
    // no snapshot time is set, same as before.
    var histTime = (typeof _gtbHistTime === 'function') ? _gtbHistTime() : null;
    var toTime = histTime || '15:30';
    var raw = await getHistoricalDataUsingPromise(token, _psDateStr(from) + ' 09:00:00', _psDateStr(to) + ' ' + toTime + ':00', 'day');
    return (raw && raw.data && raw.data.candles) ? raw.data.candles : [];
}

// Indices/MCX use different naming + token sources than F&O stocks — same mapping
// convention as backtest.js/optionStrikeSearch.js (display name -> exchange-native name).
var _PS_INDEX_NAMES = { 'NIFTY 50': 'NIFTY', 'NIFTY BANK': 'BANKNIFTY' };
var _PS_MCX_NAMES = ['CRUDEOILM'];
// Scanned alongside FO_LIST — indices/MCX have no daily "trend" of their own the way a
// stock does in the strictest sense, but the same SMA/breakout/RS/OI math applies fine to
// their own price series.
var _PS_EXTRA_INSTRUMENTS = ['NIFTY 50', 'NIFTY BANK', 'CRUDEOILM'];

// Spot/price token for the daily candle fetch. Stocks (INSTRUMENT_TOKENS) unchanged;
// NIFTY 50/NIFTY BANK also come from INSTRUMENT_TOKENS (already carries indices); MCX
// names have no separate spot instrument at all — the near-month FUT contract itself is
// what's traded, so its own token doubles as both price AND OI source.
function _psPriceTokenFor(name) {
    if (_PS_MCX_NAMES.indexOf(name) !== -1) return _psFutTokenFor(name);
    return (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS[name] : null;
}

function _psFutEntryFor(name) {
    var exchName = _PS_INDEX_NAMES[name] || name;
    if (_PS_MCX_NAMES.indexOf(name) !== -1) {
        if (typeof COMMODITIES_FUTURE_INSTRUMENT_LIST === 'undefined') return null;
        return COMMODITIES_FUTURE_INSTRUMENT_LIST.find(function (r) { return r.name === exchName; }) || null;
    }
    if (typeof FUTURE_INTRUMENT_LIST === 'undefined') return null;
    return FUTURE_INTRUMENT_LIST.find(function (r) { return r.name === exchName; }) || null;
}
function _psFutTokenFor(name) {
    var e = _psFutEntryFor(name);
    return e ? e.instrument_token : null;
}

// Trading days remaining to the near-month contract's expiry, as of CURRENT_DAY — near-
// month futures OI structurally DECLINES in the last few sessions before expiry as
// positions roll into the next month, regardless of actual bullish/bearish conviction.
// That rollover effect swamps the 5-day OI comparison below, making almost every stock
// read as OI-down (SHORT COVERING / LONG UNWINDING only, never a genuine buildup) — this
// is what the buildup classification needs to detect and flag rather than silently report.
// expiry format from Kite is "DD-MM-YYYY" or "YYYY-MM-DD" depending on source list; handle both.
function _psDaysToExpiry(expiryStr) {
    if (!expiryStr) return null;
    var d;
    if (/^\d{4}-\d{2}-\d{2}/.test(expiryStr)) {
        d = new Date(expiryStr.slice(0, 10) + 'T00:00:00');
    } else if (/^\d{2}-\d{2}-\d{4}/.test(expiryStr)) {
        var parts = expiryStr.slice(0, 10).split('-');
        d = new Date(parts[2] + '-' + parts[1] + '-' + parts[0] + 'T00:00:00');
    } else return null;
    var today = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? new Date(CURRENT_DAY + 'T00:00:00') : new Date();
    return Math.round((d - today) / 86400000);
}

// Kite chart link needs the right exchange segment + token per instrument class.
function _psChartLink(name, token) {
    var exch = _PS_MCX_NAMES.indexOf(name) !== -1 ? 'MCX'
        : (name === 'NIFTY 50' || name === 'NIFTY BANK') ? 'NSE' : 'NSE';
    return 'https://kite.zerodha.com/markets/ext/chart/web/tvc/' + exch + '/' + name + '/' + (token || '');
}

// ── Pure scoring math (daily candles in, verdict out — no live-cache reads) ────
function _psSma(closes, period) {
    if (closes.length < period) return null;
    var slice = closes.slice(closes.length - period);
    return slice.reduce(function (a, b) { return a + b; }, 0) / period;
}

function _psComputeSetup(candles, futCandles, niftyPctChg20, futToken, daysToExpiry) {
    if (!candles || candles.length < 25) return null;
    var closes = candles.map(function (c) { return parseFloat(c[4]); });
    var ltp = closes[closes.length - 1];
    var sma20 = _psSma(closes, 20);
    var sma50 = _psSma(closes, Math.min(50, closes.length));

    // ── Trend structure ─────────────────────────────────────────────────────
    var trendScore = 0, trendLabel = 'SIDEWAYS';
    if (sma20 != null && sma50 != null) {
        if (ltp > sma20 && sma20 > sma50) { trendScore = 1; trendLabel = 'UPTREND'; }
        else if (ltp < sma20 && sma20 < sma50) { trendScore = -1; trendLabel = 'DOWNTREND'; }
    }

    // ── 20-day breakout / breakdown ──────────────────────────────────────────
    var last20 = candles.slice(-21, -1); // excludes today, so today can "break" it
    var high20 = Math.max.apply(null, last20.map(function (c) { return parseFloat(c[2]); }));
    var low20 = Math.min.apply(null, last20.map(function (c) { return parseFloat(c[3]); }));
    var breakoutScore = 0, breakoutLabel = 'INSIDE RANGE';
    if (ltp >= high20) { breakoutScore = 1; breakoutLabel = 'BREAKOUT (20d high)'; }
    else if (ltp <= low20) { breakoutScore = -1; breakoutLabel = 'BREAKDOWN (20d low)'; }

    // ── Relative strength vs NIFTY 50 over the same 20-day window ───────────
    var pctChg20 = closes.length > 20 ? ((ltp - closes[closes.length - 21]) / closes[closes.length - 21]) * 100 : 0;
    var relStrength = pctChg20 - (niftyPctChg20 || 0);
    var rsScore = relStrength > 2 ? 1 : relStrength < -2 ? -1 : 0;

    // ── Multi-day futures OI buildup (classic price/OI quadrant, on daily data) ─
    // "NO DATA" used to be one label for three different causes (no futures token
    // resolved at all, the fetch coming back empty, or genuinely too few candles yet —
    // e.g. a contract that just rolled over). Split so it's actually diagnosable instead
    // of a dead end.
    // Rollover week: near-month OI structurally declines into expiry as EVERY stock's
    // positions roll to the next month, independent of actual conviction — that swamps the
    // 5-day OI comparison and makes almost everything read as OI-down (SHORT COVERING /
    // LONG UNWINDING only, never a genuine buildup). Neutralize instead of reporting a
    // misleading directional read once inside that window. 3 trading days ≈ Wed onward of
    // expiry week for a Thursday/last-Thursday expiry — matches when rollover volume
    // typically dominates fresh positioning.
    var ROLLOVER_WINDOW_DAYS = 3;
    var inRollover = daysToExpiry != null && daysToExpiry >= 0 && daysToExpiry <= ROLLOVER_WINDOW_DAYS;

    var oiScore = 0, oiLabel;
    if (!futToken) oiLabel = 'NO FUT TOKEN';
    else if (inRollover) oiLabel = 'ROLLOVER (' + daysToExpiry + 'd to expiry)';
    else if (!futCandles || !futCandles.length) oiLabel = 'FETCH EMPTY';
    else if (futCandles.length < 6) oiLabel = 'TOO FEW CANDLES (' + futCandles.length + ')';
    else oiLabel = 'NO DATA';
    if (!inRollover && futCandles && futCandles.length >= 6) {
        var oiNow = parseFloat(futCandles[futCandles.length - 1][6]) || 0;
        var oiPrev = parseFloat(futCandles[futCandles.length - 6][6]) || 0; // ~5 trading days back
        var priceNow = parseFloat(futCandles[futCandles.length - 1][4]);
        var pricePrev = parseFloat(futCandles[futCandles.length - 6][4]);
        var oiUp = oiNow > oiPrev * 1.02, oiDown = oiNow < oiPrev * 0.98;
        var priceUp = priceNow > pricePrev, priceDown = priceNow < pricePrev;
        if (oiUp && priceUp) { oiScore = 1; oiLabel = 'LONG BUILDUP'; }
        else if (oiUp && priceDown) { oiScore = -1; oiLabel = 'SHORT BUILDUP'; }
        else if (oiDown && priceUp) { oiScore = 0.5; oiLabel = 'SHORT COVERING'; }
        else if (oiDown && priceDown) { oiScore = -0.5; oiLabel = 'LONG UNWINDING'; }
        else { oiLabel = 'FLAT OI'; }
    }

    // ── Composite ─────────────────────────────────────────────────────────────
    var total = trendScore * 2 + breakoutScore * 1.5 + rsScore * 1 + oiScore * 1.5;
    var verdict = 'WATCH', verdictColor = 'var(--gtb-amber)';
    if (total >= 3) { verdict = 'STRONG BUY'; verdictColor = 'var(--gtb-green)'; }
    else if (total >= 1.5) { verdict = 'BUY'; verdictColor = 'var(--gtb-green)'; }
    else if (total <= -3) { verdict = 'STRONG SELL'; verdictColor = 'var(--gtb-red)'; }
    else if (total <= -1.5) { verdict = 'SELL'; verdictColor = 'var(--gtb-red)'; }

    var setup = {
        ltp: ltp, pctChg20: pctChg20, sma20: sma20, sma50: sma50, high20: high20, low20: low20,
        trendScore: trendScore, trendLabel: trendLabel,
        breakoutScore: breakoutScore, breakoutLabel: breakoutLabel,
        relStrength: relStrength, oiScore: oiScore, oiLabel: oiLabel,
        total: total, verdict: verdict, verdictColor: verdictColor,
    };
    _psAttachTradePlan(setup);
    return setup;
}

// ── Trade plan (entry / target / stop / exit) — derived from the SAME daily levels the
// score already computed (SMA20, 20-day high/low), not a new data source. This is a
// starting structural plan (a measured-move target off the 20-day range, a structural
// stop at SMA20/the opposite side of that range), not a guarantee — same caveat as the
// score itself: it's a lean, not a certainty, and should be sized/adjusted with your own
// risk rules.
function _psAttachTradePlan(setup) {
    var range20 = setup.high20 - setup.low20;
    var isBuy = setup.verdict === 'BUY' || setup.verdict === 'STRONG BUY';
    var isSell = setup.verdict === 'SELL' || setup.verdict === 'STRONG SELL';

    if (isBuy) {
        setup.entry = setup.ltp;
        setup.target = setup.ltp + range20 * 0.75; // 75% of the 20d range projected forward
        // "Whichever is hit first" as price falls means the CLOSER level to entry, i.e. the
        // HIGHER of the two (Math.max) — using Math.min here would pick the further/wider
        // level, contradicting both this comment and the exit-criteria text below.
        setup.stop = Math.max(setup.sma20 != null ? setup.sma20 : setup.low20, setup.low20);
        setup.exitCriteria = 'Exit on a daily close below SMA20 (' + (setup.sma20 != null ? setup.sma20.toFixed(1) : '—')
            + ') or below the 20d low (' + setup.low20.toFixed(1) + ') — whichever is hit first. '
            + 'Also exit if the futures OI reading flips to LONG UNWINDING/SHORT BUILDUP on a later scan.';
    } else if (isSell) {
        setup.entry = setup.ltp;
        setup.target = setup.ltp - range20 * 0.75;
        // Same fix mirrored for shorts: the closer level as price rises is the LOWER of the
        // two (Math.min), not the further one.
        setup.stop = Math.min(setup.sma20 != null ? setup.sma20 : setup.high20, setup.high20);
        setup.exitCriteria = 'Exit on a daily close above SMA20 (' + (setup.sma20 != null ? setup.sma20.toFixed(1) : '—')
            + ') or above the 20d high (' + setup.high20.toFixed(1) + ') — whichever is hit first. '
            + 'Also exit if the futures OI reading flips to SHORT COVERING/LONG BUILDUP on a later scan.';
    } else {
        setup.entry = null; setup.target = null; setup.stop = null;
        setup.exitCriteria = 'No trade — WATCH means trend/breakout/OI aren\'t aligned yet. Wait for the verdict to move to BUY/SELL before entering.';
    }

    if (setup.entry != null && setup.stop != null) {
        setup.riskReward = Math.abs(setup.target - setup.entry) / Math.max(0.01, Math.abs(setup.entry - setup.stop));
    } else {
        setup.riskReward = null;
    }
}

// ── Scan orchestration ───────────────────────────────────────────────────────
var _PS_SCANNING = false;

jQ(document).on('click', '#ps-scan-btn', async function () {
    if (_PS_SCANNING) return;
    _PS_SCANNING = true;
    var $btn = jQ(this).prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Scanning…');
    _PS_CACHE = {};

    try {
        var universe = jQ('#ps-chip-panel .sv-chip.sv-chip-selected').map(function () { return jQ(this).attr('data-name'); }).get();
        if (!universe.length) { _gtbToast('Pick a filter above (or add symbols by search) before scanning.', 'error'); return; }

        // NIFTY 50's own 20-day % change, fetched once, shared as the relative-strength baseline.
        var niftyToken = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS['NIFTY 50'] : null;
        var niftyPctChg20 = 0;
        if (niftyToken) {
            try {
                var niftyCandles = await _psFetchDaily(niftyToken, 70);
                if (niftyCandles.length > 20) {
                    var nc = niftyCandles.map(function (c) { return parseFloat(c[4]); });
                    niftyPctChg20 = ((nc[nc.length - 1] - nc[nc.length - 21]) / nc[nc.length - 21]) * 100;
                }
            } catch (e) {}
        }

        var done = 0;
        for (var i = 0; i < universe.length; i++) {
            var name = universe[i];
            jQ('#ps-progress').text('Scanning ' + (i + 1) + ' / ' + universe.length + ' — ' + name);
            try {
                var token = _psPriceTokenFor(name);
                if (!token) continue;
                var candles = await _psFetchDaily(token, 70);
                var futEntry = _psFutEntryFor(name);
                var futToken = futEntry ? futEntry.instrument_token : null;
                var daysToExpiry = futEntry ? _psDaysToExpiry(futEntry.expiry) : null;
                var futCandles = futToken ? await _psFetchDaily(futToken, 15) : null;
                if (!futToken) console.log('[positional-screener]', name, 'no futures token resolved (check FUTURE_INTRUMENT_LIST/COMMODITIES_FUTURE_INSTRUMENT_LIST)');
                else if (daysToExpiry != null && daysToExpiry <= 3) console.log('[positional-screener]', name, 'in rollover window —', daysToExpiry, 'days to expiry, OI buildup read suppressed');
                else if (!futCandles || futCandles.length < 6) console.log('[positional-screener]', name, 'futures token', futToken, 'returned', (futCandles || []).length, 'candles');
                var setup = _psComputeSetup(candles, futCandles, niftyPctChg20, futToken, daysToExpiry);
                if (setup) { setup.name = name; _PS_CACHE[name] = setup; done++; }
            } catch (e) { console.log('[positional-screener]', name, e); }
            if (i % 10 === 0) _psRenderTable(); // incremental render so results appear while scanning
        }
        _psRenderTable();
        jQ('#ps-progress').text('Done — ' + done + ' / ' + universe.length + ' scanned');
        _gtbToast('Positional scan complete (' + done + ' stocks)', 'success');
    } finally {
        _PS_SCANNING = false;
        $btn.prop('disabled', false);
        _psUpdateScanCount();
    }
});

// ── Top Picks strip — always ranks the FULL scanned universe (_PS_CACHE), independent
// of whatever filter/sort/search is currently applied to the table below, so it stays a
// stable "best of this scan" reference rather than shifting with the table's own view.
function _psTopPicksHtml() {
    var all = Object.values(_PS_CACHE);
    if (!all.length) return '';
    var buys = all.filter(function (r) { return r.verdict.indexOf('BUY') !== -1; })
        .sort(function (a, b) { return b.total - a.total; }).slice(0, 5);
    var sells = all.filter(function (r) { return r.verdict.indexOf('SELL') !== -1; })
        .sort(function (a, b) { return a.total - b.total; }).slice(0, 5);
    if (!buys.length && !sells.length) return '';

    function _chip(r) {
        var kiteLink = _psChartLink(r.name, _psPriceTokenFor(r.name));
        return '<a href="' + kiteLink + '" target="_blank" rel="noopener" class="ps-pick-chip" style="border-color:' + r.verdictColor + ';color:' + r.verdictColor + ';" title="' + r.verdict + ' — score ' + r.total.toFixed(1) + '">'
            + r.name + ' <span class="ps-pick-score">' + (r.total >= 0 ? '+' : '') + r.total.toFixed(1) + '</span></a>';
    }

    var html = '<div class="ps-top-picks">';
    if (buys.length) html += '<div class="ps-top-picks-row"><span class="ps-top-picks-label" style="color:var(--gtb-green);">TOP BUY</span>' + buys.map(_chip).join('') + '</div>';
    if (sells.length) html += '<div class="ps-top-picks-row"><span class="ps-top-picks-label" style="color:var(--gtb-red);">TOP SELL</span>' + sells.map(_chip).join('') + '</div>';
    html += '</div>';
    return html;
}

// Total BUY/SELL/WATCH counts across the full scanned set (_PS_CACHE) — independent of
// whatever filter/sort/search is applied to the table below, same convention as the Top
// Picks strip, so it always reads "how many across the whole scan," not "how many shown."
function _psRenderSummary() {
    var all = Object.values(_PS_CACHE);
    if (!all.length) { jQ('#ps-summary').empty(); return; }
    var buy = all.filter(function (r) { return r.verdict === 'BUY' || r.verdict === 'STRONG BUY'; }).length;
    var sell = all.filter(function (r) { return r.verdict === 'SELL' || r.verdict === 'STRONG SELL'; }).length;
    var watch = all.length - buy - sell;
    jQ('#ps-summary').html(
        '<span class="ps-summary-buy">' + buy + ' BUY</span>'
        + '<span class="ps-summary-sell">' + sell + ' SELL</span>'
        + '<span class="ps-summary-watch">' + watch + ' WATCH</span>'
        + '<span class="ps-summary-total">(' + all.length + ' scanned)</span>'
    );
}

// ── Render ────────────────────────────────────────────────────────────────────
function _psRenderTable() {
    _psRenderSummary();
    var rows = Object.values(_PS_CACHE);
    var filter = jQ('#ps-filter').val() || 'all';
    var sort = jQ('#ps-sort').val() || 'score';
    var q = (jQ('#ps-search').val() || '').trim().toUpperCase();

    if (filter === 'buy') rows = rows.filter(function (r) { return r.verdict === 'BUY' || r.verdict === 'STRONG BUY'; });
    else if (filter === 'sell') rows = rows.filter(function (r) { return r.verdict === 'SELL' || r.verdict === 'STRONG SELL'; });
    else if (filter === 'watch') rows = rows.filter(function (r) { return r.verdict === 'WATCH'; });
    if (q) rows = rows.filter(function (r) { return r.name.indexOf(q) !== -1; });

    if (sort === 'name') rows.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    else if (sort === 'rs') rows.sort(function (a, b) { return b.relStrength - a.relStrength; });
    else rows.sort(function (a, b) { return b.total - a.total; });

    if (!rows.length) {
        jQ('#ps-table-wrap').html('<div class="sv-empty-state"><i class="bi bi-search"></i><span>No results' + (q ? ' for "' + q + '"' : '') + '.</span></div>');
        return;
    }

    var _iiSafe = typeof _ii === 'function' ? _ii : function () { return ''; };
    var html = _psTopPicksHtml() + '<table class="ps-table">'
        + '<thead><tr>'
        + '<th>Symbol</th><th>LTP</th><th>20d Chg%</th><th>Trend</th><th>Breakout</th>'
        + '<th>Rel. Strength</th><th>Futures OI (5d)' + _iiSafe('ps-signals') + '</th><th>Score</th><th>Verdict</th>'
        + '<th>Entry</th><th>Target</th><th>Stop</th><th>R:R' + _iiSafe('ps-tradeplan') + '</th><th></th><th></th>'
        + '</tr></thead><tbody>'
        + rows.map(function (r) {
            var kiteLink = _psChartLink(r.name, _psPriceTokenFor(r.name));
            var chgColor = r.pctChg20 >= 0 ? 'var(--gtb-green)' : 'var(--gtb-red)';
            var trendColor = r.trendScore > 0 ? 'var(--gtb-green)' : r.trendScore < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
            var breakoutColor = r.breakoutScore > 0 ? 'var(--gtb-green)' : r.breakoutScore < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
            var rsColor = r.relStrength > 0 ? 'var(--gtb-green)' : r.relStrength < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
            var oiColor = r.oiScore > 0 ? 'var(--gtb-green)' : r.oiScore < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
            var rowTint = r.verdict.indexOf('BUY') !== -1 ? 'rgba(63,185,80,0.06)' : r.verdict.indexOf('SELL') !== -1 ? 'rgba(248,81,73,0.06)' : 'transparent';
            var hasPlan = r.entry != null;
            return '<tr style="background:' + rowTint + ';">'
                + '<td class="ps-cell-strong">' + r.name + '</td>'
                + '<td>' + r.ltp.toFixed(1) + '</td>'
                + '<td style="color:' + chgColor + ';">' + (r.pctChg20 >= 0 ? '+' : '') + r.pctChg20.toFixed(1) + '%</td>'
                + '<td style="color:' + trendColor + ';">' + r.trendLabel + '</td>'
                + '<td style="color:' + breakoutColor + ';">' + r.breakoutLabel + '</td>'
                + '<td style="color:' + rsColor + ';">' + (r.relStrength >= 0 ? '+' : '') + r.relStrength.toFixed(1) + '%</td>'
                + '<td style="color:' + oiColor + ';">' + r.oiLabel + '</td>'
                + '<td class="ps-cell-strong">' + r.total.toFixed(1) + '</td>'
                + '<td><span class="ps-verdict" style="color:' + r.verdictColor + ';border-color:' + r.verdictColor + ';">' + r.verdict + '</span></td>'
                + '<td>' + (hasPlan ? r.entry.toFixed(1) : '—') + '</td>'
                + '<td style="color:var(--gtb-green);">' + (hasPlan ? r.target.toFixed(1) : '—') + '</td>'
                + '<td style="color:var(--gtb-red);">' + (hasPlan ? r.stop.toFixed(1) : '—') + '</td>'
                + '<td>' + (r.riskReward != null ? '1:' + r.riskReward.toFixed(1) : '—') + '</td>'
                + '<td><i class="bi bi-info-circle ps-exit-icon" title="' + r.exitCriteria.replace(/"/g, '&quot;') + '"></i></td>'
                + '<td><a href="' + kiteLink + '" target="_blank" rel="noopener" class="oss-chart-link" title="Open chart"><i class="bi bi-graph-up"></i></a></td>'
                + '</tr>';
        }).join('')
        + '</tbody></table>';
    jQ('#ps-table-wrap').html(html);
}
jQ(document).on('change', '#ps-filter, #ps-sort', _psRenderTable);

// ─── Pre-Market Brief ───────────────────────────────────────────────────────
// Live-fetches everything on one button click — no reliance on whatever happens to
// already be cached, and no deferral to the 9:15 combo. Two inputs feed one combined
// trend verdict:
//   1. Global cues — GIFT NIFTY, CRUDEOILM, USDINR: each freshly fetched via
//      _psFetchDaily's 'day'-interval candles, whose LAST candle (today) always reflects
//      the true live state (same property documented for scanLtpPrice elsewhere in this
//      app) — so candles[len-1].close = live price, candles[len-2].close = prior close,
//      with no dependency on any other tab/popup having been opened first.
//   2. OI Carryover Shortlist — reuses _psComputeSetup (positionalScreener.js's own pure
//      scoring function, same one the main Positional Screener uses) to find NIFTY 50/BANK
//      NIFTY top-10 weighted constituents carrying a LONG BUILDUP or SHORT BUILDUP futures
//      OI read vs ~5 trading days ago.
// Combined trend: GIFT NIFTY's % change (weight 2, the primary global cue) plus the net
// buildup count (long stocks minus short stocks, weight 0.5 each) — simple, transparent,
// shown with its own components broken out rather than a hidden black-box number.
function _gtbShowPreMarketBrief() {
    var _cls = 'popup-custom-style-premarket-brief';
    var html = '<div id="pmb-wrap" style="height:100%;overflow:auto;padding:10px;background:var(--gtb-bg);color:var(--gtb-text);font-size:0.65rem;">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
        + '<span style="font-size:0.5rem;color:var(--gtb-muted);">Fetches GIFT NIFTY/Crude/USDINR live + scans NIFTY 50/BANK NIFTY top-10 for OI carryover.</span>'
        + '<button id="pmb-scan-btn" style="margin-left:auto;padding:4px 14px;font-size:0.65rem;background:var(--gtb-accent,#58a6ff);color:#fff;border:none;border-radius:3px;cursor:pointer;font-weight:700;"><i class="bi bi-lightning-fill"></i> Fetch Live</button>'
        + '</div>'
        + '<div id="pmb-progress" style="font-size:0.55rem;color:var(--gtb-muted);min-height:16px;margin-bottom:6px;"></div>'
        + '<div id="pmb-trend"></div>'
        + '<div id="pmb-cues"><div style="padding:16px;text-align:center;color:var(--gtb-muted);">Click <b>Fetch Live</b> to load today\'s pre-market read.</div></div>'
        + '<div style="display:flex;align-items:center;gap:8px;margin:12px 0 6px;">'
        + '<span style="font-size:0.6rem;font-weight:800;color:var(--gtb-muted);letter-spacing:0.05em;"><i class="bi bi-arrow-repeat"></i> OI CARRYOVER SHORTLIST</span>'
        + '</div>'
        + '<div id="pmb-results"></div>'
        + '</div>';

    showPopUpWindow('premarket-brief', html, 'Pre-Market Brief', 640, 620);
    var _title = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<i class="bi bi-sunrise-fill" style="font-size:0.75rem;"></i>'
        + '<span style="font-weight:800;font-size:0.7rem;">PRE-MARKET BRIEF</span>'
        + popupWinControls(_cls) + '</div>';
    jQ('.' + _cls).find('.popupwindow_titlebar_text').html(_title);
    hideNativePopupButtons(_cls);
    jQ('.' + _cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + _cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
}

// Live change% for any NSE/MCX instrument via a fresh 'day'-interval fetch — candles[len-1]
// is today (always live for a 'day' candle), candles[len-2] is the prior close.
async function _pmbLiveChange(token) {
    if (!token) return null;
    var candles = await _psFetchDaily(token, 6);
    if (!candles || candles.length < 2) return null;
    // Kite only returns a 'day' candle for today once that exchange's session has actually
    // started — before that, candles[last] is silently still YESTERDAY's candle, which
    // would otherwise get misread as "today's live move" (a real gap found while explaining
    // this to the user: checking before MCX/CDS session start, or before GIFT NIFTY's own
    // session opens, would compare yesterday-vs-day-before and call it today with no
    // indication anything was off). Verify the last candle's own date before trusting it.
    var todayStr = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? CURRENT_DAY : moment().format('YYYY-MM-DD');
    var lastDateStr = moment(candles[candles.length - 1][0]).format('YYYY-MM-DD');
    if (lastDateStr !== todayStr) {
        return { notOpen: true, lastDate: lastDateStr, lastClose: parseFloat(candles[candles.length - 1][4]) };
    }
    var todayClose = parseFloat(candles[candles.length - 1][4]);
    var prevClose = parseFloat(candles[candles.length - 2][4]);
    if (!prevClose) return null;
    return { chg: (todayClose - prevClose) / prevClose * 100, ltp: todayClose };
}

jQ(document).on('click', '#pmb-scan-btn', async function () {
    var $btn = jQ(this).prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Fetching…');

    // ── 1. Global cues — live ────────────────────────────────────────────────
    jQ('#pmb-progress').text('Fetching GIFT NIFTY / Crude / USDINR…');
    var giftTok = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS['GIFT NIFTY'] : null;
    var crudeEntry = _psFutEntryFor('CRUDEOILM');
    var usdinrEntry = _psFutEntryFor('USDINR');
    var gift = null, crude = null, usdinr = null;
    try { gift = await _pmbLiveChange(giftTok); } catch (e) {}
    try { crude = await _pmbLiveChange(crudeEntry && crudeEntry.instrument_token); } catch (e) {}
    try { usdinr = await _pmbLiveChange(usdinrEntry && usdinrEntry.instrument_token); } catch (e) {}

    function _cueRow(label, r, note) {
        if (!r) return '<div style="display:flex;justify-content:space-between;padding:5px 8px;border-bottom:1px solid var(--gtb-border);"><span style="color:var(--gtb-muted);">' + label + '</span><span style="color:var(--gtb-muted);">No data</span></div>';
        if (r.notOpen) {
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-bottom:1px solid var(--gtb-border);">'
                + '<span>' + label + '</span>'
                + '<span style="font-size:0.46rem;color:var(--gtb-amber);" title="Last available candle is dated ' + r.lastDate + ', not today — this market/session hasn\'t started yet"><i class="bi bi-clock-history"></i> Not open yet (last: ' + r.lastClose.toFixed(2) + ' on ' + r.lastDate + ')</span>'
                + '</div>';
        }
        var col = r.chg > 0.05 ? 'var(--gtb-green)' : r.chg < -0.05 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
        var arrow = r.chg > 0.05 ? '▲' : r.chg < -0.05 ? '▼' : '—';
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-bottom:1px solid var(--gtb-border);">'
            + '<span>' + label + (note ? ' <span style="font-size:0.46rem;color:var(--gtb-muted);">' + note + '</span>' : '') + '</span>'
            + '<span style="font-weight:800;font-family:var(--gtb-mono);color:' + col + ';">' + arrow + ' ' + (r.chg >= 0 ? '+' : '') + r.chg.toFixed(2) + '% <span style="color:var(--gtb-muted);font-weight:400;">(' + r.ltp.toFixed(2) + ')</span></span>'
            + '</div>';
    }
    jQ('#pmb-cues').html('<div style="background:var(--gtb-surface);border:1px solid var(--gtb-border);">'
        + _cueRow('GIFT NIFTY', gift, '— global cue for NIFTY\'s likely gap')
        + _cueRow('CRUDEOILM', crude)
        + _cueRow('USDINR', usdinr)
        + '</div>');

    // ── 2. OI carryover shortlist — live ─────────────────────────────────────
    var names = Object.keys(Object.assign({}, (typeof NIFTY_50_WEIGHTED_STOCKS !== 'undefined' ? NIFTY_50_WEIGHTED_STOCKS : {}),
                                              (typeof NIFTY_BANK_WEIGHTED_STOCKS !== 'undefined' ? NIFTY_BANK_WEIGHTED_STOCKS : {})));
    var results = [];
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        jQ('#pmb-progress').text('Scanning ' + name + ' (' + (i + 1) + '/' + names.length + ')…');
        try {
            var priceTok = _psPriceTokenFor(name);
            var futEntry = _psFutEntryFor(name);
            if (!priceTok || !futEntry) continue;
            var daysToExp = _psDaysToExpiry(futEntry.expiry);
            var candlesP = await _psFetchDaily(priceTok, 40);
            var futCandlesP = await _psFetchDaily(futEntry.instrument_token, 40);
            var setup = _psComputeSetup(candlesP, futCandlesP, 0, futEntry.instrument_token, daysToExp);
            if (setup && (setup.oiLabel === 'LONG BUILDUP' || setup.oiLabel === 'SHORT BUILDUP')) {
                results.push({ name: name, oiLabel: setup.oiLabel, oiScore: setup.oiScore, ltp: setup.ltp });
            }
        } catch (e) {}
    }
    jQ('#pmb-progress').text('Done — ' + results.length + ' of ' + names.length + ' showing fresh OI buildup.');
    $btn.prop('disabled', false).html('<i class="bi bi-lightning-fill"></i> Fetch Live');

    var longs = results.filter(function (r) { return r.oiLabel === 'LONG BUILDUP'; });
    var shorts = results.filter(function (r) { return r.oiLabel === 'SHORT BUILDUP'; });

    function _list(rows, color) {
        if (!rows.length) return '<div style="font-size:0.5rem;color:var(--gtb-muted);padding:4px 0;">None</div>';
        return rows.map(function (r) {
            var link = _psChartLink(r.name, _psPriceTokenFor(r.name));
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 6px;border-bottom:1px solid var(--gtb-border);">'
                + '<a href="' + link + '" target="_blank" rel="noopener" style="color:' + color + ';font-weight:700;">' + r.name + '</a>'
                + '<span style="font-family:var(--gtb-mono);color:var(--gtb-muted);">' + r.ltp.toFixed(1) + '</span>'
                + '</div>';
        }).join('');
    }
    jQ('#pmb-results').html(
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
        + '<div><div style="font-size:0.52rem;font-weight:800;color:var(--gtb-green);margin-bottom:4px;">▲ LONG BUILDUP (' + longs.length + ')</div>' + _list(longs, 'var(--gtb-green)') + '</div>'
        + '<div><div style="font-size:0.52rem;font-weight:800;color:var(--gtb-red);margin-bottom:4px;">▼ SHORT BUILDUP (' + shorts.length + ')</div>' + _list(shorts, 'var(--gtb-red)') + '</div>'
        + '</div>'
    );

    // ── 3. Combined trend verdict ─────────────────────────────────────────────
    // netScore = GIFT NIFTY change% × 2 (primary global cue) + (long count − short count) × 0.5
    // Purely a weighted sum of the two components above — shown broken out, not hidden.
    // GIFT NIFTY not open yet -> no live cue to weigh in; net score falls back to the
    // buildup count alone rather than silently treating "no data" as "flat/0%".
    var giftOpen = gift && !gift.notOpen;
    var giftChg = giftOpen ? gift.chg : 0;
    var netScore = giftChg * 2 + (longs.length - shorts.length) * 0.5;
    var trendLabel, trendCol;
    if (netScore >= 1.5) { trendLabel = 'BULLISH'; trendCol = 'var(--gtb-green)'; }
    else if (netScore <= -1.5) { trendLabel = 'BEARISH'; trendCol = 'var(--gtb-red)'; }
    else { trendLabel = 'MIXED / NEUTRAL'; trendCol = 'var(--gtb-amber)'; }

    // Deliberately NOT gated on "is NSE cash open right now" — GIFT NIFTY trades an extended
    // ~21-hour session specifically so it can serve as a forward cue for the NEXT session at
    // any time of day, and once today's OI buildup candle finalizes at close, that's the
    // COMPLETE carryover picture into tomorrow, not stale data. So this is always framed as
    // "cue for the next session," whether that's in 5 minutes or in 16 hours — GIFT NIFTY's
    // own change vs ITS OWN previous close (via _pmbLiveChange) is what makes that valid
    // continuously, not a fixed market-hours cutoff.
    jQ('#pmb-trend').html(
        '<div style="background:var(--gtb-surface);border-left:4px solid ' + trendCol + ';padding:10px 12px;margin-bottom:10px;">'
        + '<div style="font-size:0.5rem;color:var(--gtb-muted);margin-bottom:2px;">TREND FOR THE NEXT TRADING SESSION</div>'
        + '<div style="font-size:1rem;font-weight:900;color:' + trendCol + ';margin-bottom:4px;">' + trendLabel + '</div>'
        + '<div style="font-size:0.48rem;color:var(--gtb-muted);">GIFT NIFTY ' + (giftOpen ? ((giftChg >= 0 ? '+' : '') + giftChg.toFixed(2) + '% ×2') : '<span style="color:var(--gtb-amber);">not open yet — excluded</span>') + ' &nbsp;+&nbsp; Buildup net ' + (longs.length - shorts.length >= 0 ? '+' : '') + (longs.length - shorts.length) + ' (' + longs.length + ' long − ' + shorts.length + ' short) ×0.5 &nbsp;=&nbsp; <b style="color:' + trendCol + ';">' + (netScore >= 0 ? '+' : '') + netScore.toFixed(2) + '</b></div>'
        + '<div style="font-size:0.44rem;color:var(--gtb-muted);margin-top:4px;">GIFT NIFTY\'s change is always vs its OWN previous close, so this stays a forward cue for the next session at any time of day — not a validated signal, just a live-computed lean.</div>'
        + '</div>'
    );
});
jQ(document).on('input', '#ps-search', _psRenderTable);

// ── Level Fade Scanner ───────────────────────────────────────────────────────
// Two-part workflow the user runs by hand at two points in the day:
//   1. EOD SCAN (run after market close) — for every instrument with cached OI/OBV data
//      (INSTRUMENT_SCORE_MAP[name].oiData from today's last refresh), checks whether today's
//      CLOSE sits right on a ranked OI wall (_gtbFindWalls, OBV-ranked, not just nearest
//      strike) and that wall is still intact (_gtbWallErosion says the writers behind it
//      haven't started unwinding). Close near an intact support -> tradable LONG for the next
//      session; close near an intact resistance -> tradable SHORT. Saved to localStorage keyed
//      by date so it survives into tomorrow.
//   2. PRE-MARKET CHECK (run next session, once today's open print exists) — reloads
//      yesterday's saved shortlist and compares TODAY's open against the SAME wall level:
//      still holding near it -> CONFIRMED; gapped through it -> INVALIDATED; gapped away from
//      it -> flagged stale rather than silently carried over.
// Deliberately reuses the existing wall-ranking/erosion primitives (already built for the
// dashboard's chart annotations) instead of re-deriving support/resistance from scratch —
// same reasoning as every other scanner in this app: one source of truth for "what is a wall."
var _LVS_PROX_PCT = 0.4; // % distance from a wall to count as "price is AT this level"

// Pure, cache-only: does `name`'s current spot sit on an intact OI wall? Returns null if no
// cached OI data, no wall within range, or the nearby wall is actively eroding (writers
// covering — don't fade a wall that's already failing).
function _lvsWallCheck(name) {
    var sm = (typeof INSTRUMENT_SCORE_MAP !== 'undefined') ? INSTRUMENT_SCORE_MAP[name] : null;
    if (!sm || !sm.oiData || !sm.oiData.tableData || !sm.oiData.tableData.length) return null;
    var td = sm.oiData.tableData;

    // spot MUST be the real live/last-traded price, not the ATM-strike row's own strike —
    // the two can disagree by a wide margin whenever the option chain's ATM was picked off a
    // stale INSTRUMENT_LTP_PRICE (e.g. from earlier in the session, before the EOD scan's own
    // fresh scanLtpPrice() call), and even with a fresh LTP the strike itself is only the
    // nearest listed strike (₹10+ gaps on names like HDFCBANK) — using it as "spot" silently
    // rounds every distance-to-wall calc and mislabels the row's displayed "Close" price.
    var priceChange = 0, spot = 0;
    try { var t = generateTrend(name); spot = parseFloat(t.ltp) || 0; priceChange = t.change || 0; } catch (e) {}
    if (!spot) {
        // Fallback only if live LTP truly isn't available for this name.
        td.forEach(function (item) { if (item['ATM_STRIKE']) spot = parseFloat(item['STRIKE']) || 0; });
    }
    if (!spot) return null;

    var walls, erosion;
    try {
        walls = _gtbFindWalls(td, priceChange, spot);
        erosion = _gtbWallErosion(td, walls);
    } catch (e) { return null; }

    function _nearest(list) {
        var best = null;
        (list || []).forEach(function (w) {
            var dist = Math.abs(spot - w.strike) / spot * 100;
            if (dist <= _LVS_PROX_PCT && (!best || dist < best.dist)) best = { strike: w.strike, dist: dist, tier: w.tier };
        });
        return best;
    }
    var nearRes = _nearest(walls.resistance);
    var nearSup = _nearest(walls.support);
    if (!nearRes && !nearSup) return null;

    var side, pick;
    if (nearSup && (!nearRes || nearSup.dist <= nearRes.dist)) { side = 'S'; pick = nearSup; }
    else { side = 'R'; pick = nearRes; }

    var eroding = (erosion.eroding || []).some(function (e) { return e.side === side && e.strike === pick.strike; });
    if (eroding) {
        return { name: name, spot: spot, side: side === 'S' ? 'support' : 'resistance', wallStrike: pick.strike,
            distPct: pick.dist, tier: pick.tier, bias: null, eroding: true,
            reason: (side === 'S' ? 'Support' : 'Resistance') + ' ' + pick.strike + ' is eroding — writers unwinding, no trade' };
    }
    var bias = side === 'S' ? 'LONG' : 'SHORT';
    return { name: name, spot: spot, side: side === 'S' ? 'support' : 'resistance', wallStrike: pick.strike,
        distPct: pick.dist, tier: pick.tier, bias: bias, eroding: false,
        reason: 'Closed near ' + (side === 'S' ? 'support' : 'resistance') + ' ' + pick.strike
            + ' (' + pick.dist.toFixed(2) + '% away), wall intact' };
}

// Full universe for the EOD scan: every F&O stock (FO_LIST, populated by dataLoad.js from
// Kite's real instrument list — the ~200+ names the user actually wants covered, not just
// whatever happens to already be sitting in cache) plus the core indices/stocks that don't
// live in FO_LIST under the same name. _gtbAllOIInstruments() (cache-only) was the wrong tool
// here — it only reports what SOME popup happened to fetch earlier in the session, silently
// skipping any of the 200+ stocks nobody clicked into today.
function _lvsFullUniverse() {
    var list = [];
    try { list = (typeof FO_LIST !== 'undefined' && FO_LIST.length) ? FO_LIST.slice() : []; } catch (e) {}
    ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'RELIANCE', 'HDFCBANK', 'ICICIBANK'].forEach(function (n) {
        if (list.indexOf(n) === -1) list.push(n);
    });
    return list;
}

// Actively fetches OI/OBV for every name in `names` (ATM ±2 strikes — same trade-off already
// used by fetchWeightedStocksOIScore: enough signal without a full-width fetch per stock),
// writing straight into INSTRUMENT_SCORE_MAP[name].oiData/oi_obv/pcr/chPcr so _lvsWallCheck can
// read it immediately after. Needs INSTRUMENT_LIST_GLOBAL/INSTRUMENT_LTP_PRICE already populated
// for these names (i.e. run this AFTER the normal end-of-day "Load Prices" + refresh has
// completed for the full ~215-217 instrument universe) — showTrendingOI's generateTrend() call
// depends on that, same precondition every other OI fetch in this app has.
// CONC=4 matches fetchWeightedStocksOIScore's own concurrency choice (balances speed vs Kite
// rate limits) — with 200+ names this still takes a few minutes, which is fine run once after
// close, not time-critical the way an intraday refresh is.
async function _lvsActiveFetchOI(names, onProgress) {
    var CONC = 4;
    var done = 0;
    async function _scanOne(name) {
        try {
            var oiData = await showTrendingOI(name, 2);
            done++;
            if (onProgress) onProgress(name, done, names.length);
            if (!oiData || !oiData.tableData) return;
            if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
            INSTRUMENT_SCORE_MAP[name].oi_obv = computeOIScoreFromData(oiData);
            INSTRUMENT_SCORE_MAP[name].pcr    = oiData.pcr;
            INSTRUMENT_SCORE_MAP[name].chPcr  = oiData.chPcr;
            INSTRUMENT_SCORE_MAP[name].oiData = oiData;
            try { _gtbComputeOIExtras(name, oiData); } catch (e2) {}
        } catch (e) {
            done++;
            if (onProgress) onProgress(name, done, names.length);
        }
    }
    for (var i = 0; i < names.length; i += CONC) {
        await Promise.all(names.slice(i, i + CONC).map(_scanOne));
    }
}

async function _gtbRunEodLevelScan(onProgress, onPhase) {
    // Force a fresh LTP snapshot for the WHOLE instrument universe right before fetching OI —
    // otherwise showTrendingOI() (via generateTrend) picks the ATM strike off whatever
    // INSTRUMENT_LTP_PRICE happened to be last written, which can be an hour or more stale if
    // scanLtpPrice() hasn't run since. Real bug hit while building this: a stock's "Close" in
    // the shortlist showed a price from ~12:15 (last LTP refresh) while the actual 15:10 close
    // was ~1.4% away — not just ATM-strike rounding, an outright stale-cache read.
    if (onPhase) onPhase('Refreshing LTP for all instruments…');
    try { await scanLtpPrice(); } catch (e) { console.log('EOD level scan: LTP refresh failed', e); }

    var universe = _lvsFullUniverse();
    if (onPhase) onPhase('Fetching OI/OBV for ' + universe.length + ' instruments…');

    // Wall-check each name RIGHT AFTER its own OI/OBV fetch completes (inside the progress
    // callback), instead of waiting for the whole 200+ universe to finish and looping again
    // afterward — that's what let results appear one-by-one as the scan runs instead of all
    // at once at the very end. onProgress gets the incremental result (if any) plus the
    // running results array so the caller can re-render live.
    var results = [];
    await _lvsActiveFetchOI(universe, function (name, done, total) {
        var r = _lvsWallCheck(name);
        if (r && r.bias) results.push(r);
        if (onProgress) onProgress(name, done, total, (r && r.bias) ? r : null, results);
    });

    var dateStr = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? CURRENT_DAY : _psDateStr(new Date());
    localStorage.setItem('GTB_LEVEL_SCAN_' + dateStr, JSON.stringify({ date: dateStr, results: results, savedAt: Date.now() }));
    return { date: dateStr, results: results };
}

// Most recent saved EOD scan strictly before `dateStr` (ISO date keys sort lexically).
function _lvsFindLatestScanBefore(dateStr) {
    var prefix = 'GTB_LEVEL_SCAN_';
    var keys = Object.keys(localStorage).filter(function (k) { return k.indexOf(prefix) === 0; });
    var before = keys.filter(function (k) { return k.slice(prefix.length) < dateStr; }).sort();
    if (!before.length) return null;
    try { return JSON.parse(localStorage.getItem(before[before.length - 1])); } catch (e) { return null; }
}

// Turns a resolved openPx into the same CONFIRMED/INVALIDATED/STALE verdict either data
// source (WebSocket tick or historical day-candle) produces — kept as one function so the
// two sources can never silently drift into different thresholds.
function _lvsVerdictFor(r, openPx) {
    var distPct = Math.abs(openPx - r.wallStrike) / r.wallStrike * 100;
    var holding = distPct <= _LVS_PROX_PCT * 2;
    var throughLevel = r.bias === 'LONG' ? (openPx < r.wallStrike) : (openPx > r.wallStrike);
    if (throughLevel) return { status: 'INVALIDATED — gapped through ' + r.side, statusCol: 'var(--gtb-red)' };
    if (holding) return { status: 'CONFIRMED — open holding near ' + r.side, statusCol: 'var(--gtb-green)' };
    return { status: 'STALE — gapped away (' + distPct.toFixed(2) + '%), thesis no longer at the level', statusCol: 'var(--gtb-muted)' };
}

// Reads today's open straight off the live ticker (quoteWs.js) instead of a historical
// 'day'-candle fetch. Per live observation, the WebSocket's 'full' mode packet already
// carries a real Open during the 9:00-9:08 pre-open session (screenshot showed SENSEX/NIFTY
// 50/NIFTY FIN SERVICE all populated well before 9:15) — the historical day-candle approach
// can't do that (Kite's day-candle for "today" doesn't exist until the regular session has
// actually started, same limitation _pmbLiveChange documents for GIFT NIFTY/Crude/USDINR).
// Whether the plain REST Quote API also reflects pre-open is unconfirmed here, so this reads
// the ticker the user already verified works, not the Quote API.
// Requires the WebSocket Subscribe popup to have been connected at least once and LEFT OPEN
// (closing it disconnects — see showWebSocketPopup's close.popupwindow handler) — _QW_WS/
// _QW_SUBSCRIBED/_QW_LAST_TICK are module-level globals in quoteWs.js, so they stay valid
// even while that popup isn't the frontmost window, as long as it hasn't been closed.
function _lvsReadFromWs(names) {
    if (typeof _QW_WS === 'undefined' || !_QW_WS || _QW_WS.readyState !== WebSocket.OPEN) return null;

    // Seed the WebSocket popup's own full default list (INDICES + all weighted constituents)
    // FIRST if nothing is subscribed yet — otherwise adding just this shortlist's handful of
    // names here leaves _QW_SUBSCRIBED non-empty, which then silently blocks
    // showWebSocketPopup()'s own "seed default list if empty" check the next time that popup
    // is opened, stranding the user with only 2-3 tickers instead of the full default set.
    var subscribedNew = false;
    if (!Object.keys(_QW_SUBSCRIBED).length && typeof _qwDefaultSubscribeList === 'function') {
        _qwDefaultSubscribeList();
        subscribedNew = true; // _qwDefaultSubscribeList only populates the local map — still needs sending below
    }

    names.forEach(function (name) {
        var tok = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS[name] : null;
        if (tok && !_QW_SUBSCRIBED[tok]) { _QW_SUBSCRIBED[tok] = name; subscribedNew = true; }
    });
    if (subscribedNew) _qwWsSubscribeAll();
    var out = {};
    names.forEach(function (name) {
        var tok = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS[name] : null;
        var tick = tok ? _QW_LAST_TICK[tok] : null;
        out[name] = (tick && tick.open) ? { open: tick.open, justSubscribed: subscribedNew } : null;
    });
    return out;
}

// Compares yesterday's saved shortlist against TODAY's open — WebSocket tick first (works
// pre-9:15, see _lvsReadFromWs), falling back to the historical day-candle fetch (only valid
// once the regular session has started) when the WS isn't connected.
async function _gtbRunPreMarketLevelCheck() {
    var today = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? CURRENT_DAY : _psDateStr(new Date());
    var prev = _lvsFindLatestScanBefore(today);
    if (!prev || !prev.results || !prev.results.length) return { date: prev ? prev.date : null, rows: [] };

    var names = prev.results.map(function (r) { return r.name; });
    var wsData = _lvsReadFromWs(names);
    var usedWs = !!wsData;

    var rows = await Promise.all(prev.results.map(async function (r) {
        var openPx = null, waitingForTick = false;
        if (usedWs) {
            var w = wsData[r.name];
            if (w) openPx = w.open;
            else waitingForTick = true;
        } else {
            try {
                var token = _psPriceTokenFor(r.name);
                var candles = await _psFetchDaily(token, 3);
                if (candles && candles.length) {
                    var last = candles[candles.length - 1];
                    var lastDateStr = moment(last[0]).format('YYYY-MM-DD');
                    if (lastDateStr === today) openPx = parseFloat(last[1]);
                }
            } catch (e) {}
        }

        if (openPx == null) {
            var msg = usedWs ? 'WAITING FOR TICK' + (waitingForTick ? ' (just subscribed)' : '') : 'NOT OPEN YET';
            return Object.assign({}, r, { openPx: null, status: msg, statusCol: 'var(--gtb-amber)' });
        }
        var verdict = _lvsVerdictFor(r, openPx);
        return Object.assign({}, r, { openPx: openPx, status: verdict.status, statusCol: verdict.statusCol });
    }));
    return { date: prev.date, rows: rows, usedWs: usedWs };
}

function _lvsRowHtml(r, showOpen) {
    var link = _psChartLink(r.name, _psPriceTokenFor(r.name));
    var biasCol = r.bias === 'LONG' ? 'var(--gtb-green)' : 'var(--gtb-red)';
    var priceCell = showOpen
        ? (r.openPx != null ? 'Open ' + r.openPx.toFixed(2) : '—') + ' <span style="color:var(--gtb-muted);">vs wall ' + r.wallStrike + '</span>'
        : 'Close ' + r.spot.toFixed(2) + ' <span style="color:var(--gtb-muted);">vs wall ' + r.wallStrike + '</span>';
    var statusHtml = showOpen
        ? '<span style="color:' + r.statusCol + ';font-weight:700;">' + r.status + '</span>'
        : '<span style="color:var(--gtb-muted);">' + r.reason + '</span>';
    return '<div style="display:grid;grid-template-columns:110px 55px 1fr 1fr;gap:6px;align-items:center;padding:4px 6px;border-bottom:1px solid var(--gtb-border);font-size:0.5rem;">'
        + '<a href="' + link + '" target="_blank" rel="noopener" style="font-weight:800;color:var(--gtb-text);">' + r.name + '</a>'
        + '<span style="font-weight:800;color:' + biasCol + ';">' + r.bias + '</span>'
        + '<span style="font-family:var(--gtb-mono);">' + priceCell + '</span>'
        + statusHtml
        + '</div>';
}

// Splits a shortlist into NIFTY 50 / BANK NIFTY / Other F&O — using the same top-10 weighted
// membership lists (constants.js) already used everywhere else in this app for this kind of
// grouping (Pre-Market Brief's OI Carryover Shortlist, Signals tab weighted-OI tables, etc.).
// There's no full 50/12-constituent list anywhere in the codebase, only the top-10-by-weight
// ones — so a stock outside both (the vast majority of the 200+ FO_LIST universe) lands in
// "Other F&O". A stock CAN legitimately appear in both NIFTY 50 and BANK NIFTY groups
// (HDFCBANK, ICICIBANK, SBIN, AXISBANK, KOTAKBANK are top-10 weighted in both indices) —
// that's intentional, not a de-dup bug, since it really is a constituent of both.
function _lvsGroupByIndex(rows) {
    var nifty = [], bank = [], other = [];
    rows.forEach(function (r) {
        var inNifty = r.name === 'NIFTY 50' || (typeof NIFTY_50_WEIGHTED_STOCKS !== 'undefined' && NIFTY_50_WEIGHTED_STOCKS[r.name] !== undefined);
        var inBank  = r.name === 'NIFTY BANK' || (typeof NIFTY_BANK_WEIGHTED_STOCKS !== 'undefined' && NIFTY_BANK_WEIGHTED_STOCKS[r.name] !== undefined);
        if (inNifty) nifty.push(r);
        if (inBank) bank.push(r);
        if (!inNifty && !inBank) other.push(r);
    });
    return { nifty: nifty, bank: bank, other: other };
}

// Shared renderer for both the EOD results panel and the Pre-Market Check panel — filters by
// the instrument search box, then segregates into NIFTY 50 / BANK NIFTY / Other F&O sections.
function _lvsRenderGrouped(containerSel, rows, showOpen, filterText) {
    var f = (filterText || '').toUpperCase().trim();
    var filtered = f ? rows.filter(function (r) { return r.name.indexOf(f) !== -1; }) : rows;
    if (!filtered.length) {
        jQ(containerSel).html('<div style="padding:10px;text-align:center;color:var(--gtb-muted);">'
            + (rows.length ? 'No instrument matches "' + f + '".' : 'No setups.') + '</div>');
        return;
    }
    var groups = _lvsGroupByIndex(filtered);
    function _section(title, list, col) {
        if (!list.length) return '';
        return '<div style="font-size:0.5rem;font-weight:800;color:' + col + ';letter-spacing:0.04em;margin:8px 0 3px;">' + title + ' (' + list.length + ')</div>'
            + '<div style="background:var(--gtb-surface);border:1px solid var(--gtb-border);">'
            + list.map(function (r) { return _lvsRowHtml(r, showOpen); }).join('')
            + '</div>';
    }
    jQ(containerSel).html(
        _section('NIFTY 50', groups.nifty, 'var(--gtb-blue,#58a6ff)')
        + _section('BANK NIFTY', groups.bank, 'var(--gtb-accent,#a371f7)')
        + _section('OTHER F&O', groups.other, 'var(--gtb-muted)')
    );
}

function _gtbShowLevelFadeScanner() {
    var _cls = 'popup-custom-style-level-fade-scanner';
    var html = '<div id="lvs-wrap" style="height:100%;overflow:auto;padding:10px;background:var(--gtb-bg);color:var(--gtb-text);font-size:0.65rem;">'
        + '<div style="font-size:0.5rem;color:var(--gtb-muted);margin-bottom:8px;">Fades price sitting on an intact OI wall (OBV-ranked support/resistance, not just the nearest strike) — skips a wall that\'s already eroding.</div>'
        + '<input id="lvs-filter" type="text" placeholder="Filter instrument…" style="width:100%;padding:4px 8px;margin-bottom:10px;font-size:0.6rem;background:var(--gtb-surface);color:var(--gtb-text);border:1px solid var(--gtb-border);box-sizing:border-box;" />'

        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
        + '<span style="font-size:0.58rem;font-weight:800;color:var(--gtb-muted);letter-spacing:0.05em;"><i class="bi bi-moon-stars-fill"></i> 1 · EOD SCAN — full F&amp;O (run after close)</span>'
        + '<button id="lvs-eod-btn" style="margin-left:auto;padding:4px 12px;font-size:0.6rem;background:var(--gtb-accent,#58a6ff);color:#fff;border:none;border-radius:3px;cursor:pointer;font-weight:700;"><i class="bi bi-play-fill"></i> Run EOD Scan</button>'
        + '</div>'
        + '<div style="font-size:0.46rem;color:var(--gtb-muted);margin-bottom:4px;">Actively fetches OI/OBV for every FO_LIST stock (200+), not just whatever\'s already cached — takes a few minutes. Run "Load Prices" + a refresh first so today\'s open/LTP is populated for all of them.</div>'
        + '<div id="lvs-eod-progress" style="font-size:0.5rem;color:var(--gtb-muted);min-height:14px;margin-bottom:4px;"></div>'
        + '<div id="lvs-eod-results" style="margin-bottom:14px;"></div>'

        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
        + '<span style="font-size:0.58rem;font-weight:800;color:var(--gtb-muted);letter-spacing:0.05em;"><i class="bi bi-sunrise-fill"></i> 2 · PRE-MARKET CHECK (run next session)</span>'
        + '<button id="lvs-pm-btn" style="margin-left:auto;padding:4px 12px;font-size:0.6rem;background:var(--gtb-accent,#58a6ff);color:#fff;border:none;border-radius:3px;cursor:pointer;font-weight:700;"><i class="bi bi-play-fill"></i> Check vs Today\'s Open</button>'
        + '</div>'
        + '<div style="font-size:0.46rem;color:var(--gtb-muted);margin-bottom:4px;">Reads today\'s open from the live WebSocket ticker if connected (works pre-9:15) — open <b>WebSocket Subscribe</b> and click Connect first, then leave it open. Falls back to a historical fetch (post-9:15 only) if not connected.</div>'
        + '<div id="lvs-pm-results"></div>'
        + '</div>';

    showPopUpWindow('level-fade-scanner', html, 'Level Fade Scanner', 640, 560);
    var _title = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<i class="bi bi-water" style="font-size:0.75rem;"></i>'
        + '<span style="font-weight:800;font-size:0.7rem;">LEVEL FADE SCANNER</span>'
        + popupWinControls(_cls) + '</div>';
    jQ('.' + _cls).find('.popupwindow_titlebar_text').html(_title);
    hideNativePopupButtons(_cls);
    jQ('.' + _cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + _cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');

    // Restore today's already-run EOD scan (if any) without re-running it.
    var todayStr = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? CURRENT_DAY : _psDateStr(new Date());
    _LVS_LAST_EOD = null;
    _LVS_LAST_PM = null;
    try {
        var cached = JSON.parse(localStorage.getItem('GTB_LEVEL_SCAN_' + todayStr));
        if (cached && cached.results) _lvsRenderEodResults(cached);
    } catch (e) {}
}

// Last-rendered datasets, kept so the filter box can re-render without re-fetching.
var _LVS_LAST_EOD = null; // { date, results }
var _LVS_LAST_PM = null;  // { date, rows, usedWs }

function _lvsRenderEodResults(scan) {
    _LVS_LAST_EOD = scan;
    var filterText = jQ('#lvs-filter').val();
    if (!scan.results.length) {
        jQ('#lvs-eod-results').html('<div style="padding:10px;text-align:center;color:var(--gtb-muted);">No instrument closed on an intact OI wall today.</div>');
        return;
    }
    var longs = scan.results.filter(function (r) { return r.bias === 'LONG'; });
    var shorts = scan.results.filter(function (r) { return r.bias === 'SHORT'; });
    jQ('#lvs-eod-results').html('<div id="lvs-eod-summary" style="font-size:0.46rem;color:var(--gtb-muted);margin-bottom:4px;">Saved for ' + scan.date + ' — ' + longs.length + ' long / ' + shorts.length + ' short setups.</div>'
        + '<div id="lvs-eod-grouped"></div>');
    _lvsRenderGrouped('#lvs-eod-grouped', scan.results, false, filterText);
}

function _lvsRenderPmResults(out) {
    _LVS_LAST_PM = out;
    var filterText = jQ('#lvs-filter').val();
    var srcNote = out.usedWs
        ? '<span style="color:var(--gtb-green);">live WebSocket ticker</span>'
        : '<span style="color:var(--gtb-amber);">historical fetch (WebSocket not connected — open/Connect it first for pre-9:15 reads)</span>';
    jQ('#lvs-pm-results').html('<div id="lvs-pm-summary" style="font-size:0.46rem;color:var(--gtb-muted);margin-bottom:4px;">Comparing vs EOD scan saved on ' + out.date + ' — source: ' + srcNote + '.</div>'
        + '<div id="lvs-pm-grouped"></div>');
    _lvsRenderGrouped('#lvs-pm-grouped', out.rows, true, filterText);
}

// Re-applies the current filter text to whichever datasets are already loaded, without
// re-running either scan — so typing in the filter box is instant.
jQ(document).on('input', '#lvs-filter', function () {
    var filterText = jQ(this).val();
    if (_LVS_LAST_EOD && _LVS_LAST_EOD.results.length) _lvsRenderGrouped('#lvs-eod-grouped', _LVS_LAST_EOD.results, false, filterText);
    if (_LVS_LAST_PM && _LVS_LAST_PM.rows.length) _lvsRenderGrouped('#lvs-pm-grouped', _LVS_LAST_PM.rows, true, filterText);
});

jQ(document).on('click', '#lvs-eod-btn', async function () {
    var $btn = jQ(this).prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Scanning…');
    jQ('#lvs-eod-progress').text('Starting full F&O scan…');
    // Empty the results area up front and fill it in live as each stock's wall check
    // completes, instead of only writing to the DOM once the whole 200+ scan is done.
    jQ('#lvs-eod-results').html('<div id="lvs-eod-summary" style="font-size:0.46rem;color:var(--gtb-muted);margin-bottom:4px;"></div><div id="lvs-eod-grouped"></div>');

    var scan = await _gtbRunEodLevelScan(function (name, done, total, r, resultsSoFar) {
        jQ('#lvs-eod-progress').text('OI/OBV: ' + done + '/' + total + ' (' + name + ') — ' + resultsSoFar.length + ' setup' + (resultsSoFar.length === 1 ? '' : 's') + ' so far');
        if (r) {
            var longsSoFar = resultsSoFar.filter(function (x) { return x.bias === 'LONG'; }).length;
            jQ('#lvs-eod-summary').text('Scanning… ' + longsSoFar + ' long / ' + (resultsSoFar.length - longsSoFar) + ' short so far (' + done + '/' + total + ' scanned).');
            _lvsRenderGrouped('#lvs-eod-grouped', resultsSoFar, false, jQ('#lvs-filter').val());
        }
    }, function (phase) {
        jQ('#lvs-eod-progress').text(phase);
    });
    jQ('#lvs-eod-progress').text('Done — scanned ' + _lvsFullUniverse().length + ' instruments, ' + scan.results.length + ' setups found.');
    _lvsRenderEodResults(scan);
    $btn.prop('disabled', false).html('<i class="bi bi-play-fill"></i> Run EOD Scan');
});

jQ(document).on('click', '#lvs-pm-btn', async function () {
    var $btn = jQ(this).prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Checking…');
    var out = await _gtbRunPreMarketLevelCheck();
    $btn.prop('disabled', false).html('<i class="bi bi-play-fill"></i> Check vs Today\'s Open');
    if (!out.date) {
        jQ('#lvs-pm-results').html('<div style="padding:10px;text-align:center;color:var(--gtb-muted);">No saved EOD scan from a prior session yet — run step 1 after today\'s close first.</div>');
        return;
    }
    if (!out.rows.length) {
        jQ('#lvs-pm-results').html('<div style="padding:10px;text-align:center;color:var(--gtb-muted);">Last saved scan (' + out.date + ') had no setups.</div>');
        return;
    }
    _lvsRenderPmResults(out);
});
