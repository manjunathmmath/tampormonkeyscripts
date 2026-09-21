// ─── stockViewer.js ────────────────────────────────────────────────────────────
// Stock viewer popup — same row layout as main instrument panel.
// ─────────────────────────────────────────────────────────────────────────────

var _SV_SUFFIX = '-stock-viewer';

jQ(document).on("click", "#show-stock-viewer", function (e) {
    e.preventDefault();
    showStockViewer();
});

// ── Theme sync ────────────────────────────────────────────────────────────────
function _svSyncTheme() {
    var isLight = jQ('#main-trade-bot-container').hasClass('gtb-light');
    jQ('.popup-custom-style-stock-viewer-scanner').toggleClass('gtb-light', isLight);
}
jQ(document).on('click', '.gtb-theme-btn', function() { setTimeout(_svSyncTheme, 50); });

// ── Popup shell ───────────────────────────────────────────────────────────────
function showStockViewer() {
    let scriptData  = generateTrends();
    let breakOut915 = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN")) || {};
    let counts = { all: 0, aso: 0, bso: 0, nine15: 0 };
    jQ.each(INSTRUMENT_TOKENS, function (name) {
        let trends = scriptData[name] ? scriptData[name]['trends'] : [];
        let c915   = breakOut915[name] && breakOut915[name]['CLOSE_9_15'];
        counts.all++;
        if (jQ.inArray("ASO", trends) !== -1) counts.aso++;
        if (jQ.inArray("BSO", trends) !== -1) counts.bso++;
        if (c915 === 'ASO' || c915 === 'BSO') counts.nine15++;
    });

    let html = '';

    // ── Filter bar ───────────────────────────────────────────────────────────
    html += '<div id="sv-filter-row">';
    html += '<div class="sv-seg-group">';
    html += _svSegBtn('all',    'ALL',        counts.all,    '');
    html += _svSegBtn('aso',    'ASO',        counts.aso,    'green');
    html += _svSegBtn('bso',    'BSO',        counts.bso,    'red');
    html += _svSegBtn('nine15', '9:15',       counts.nine15, 'gold');
    html += _svSegBtn('n50',    'NIFTY 50',   null,          '');
    html += _svSegBtn('bank',   'BANK NIFTY', null,          '');
    html += _svSegBtn('weight', 'WEIGHTED',   null,          '');
    html += '</div>';
    // Confidence filter — reads the .sv-predict-compact card's own data-confidence
    // (set once at LOAD time, same source as what's shown on the card), so it filters
    // whatever's already loaded rather than requiring a re-fetch.
    html += '<select id="sv-conf-filter" class="sv-pill-btn" style="margin-left:8px;" title="Only show rows at or above this Prediction confidence">';
    html +=   '<option value="0">All confidence</option>';
    html +=   '<option value="65">HIGH only (&ge;65%)</option>';
    html +=   '<option value="45">MODERATE+ (&ge;45%)</option>';
    html += '</select>';
    // Auto-refresh: re-runs the same LOAD pipeline for whatever's currently loaded on
    // an interval, and after each refresh checks every loaded instrument's LTP against
    // its R1/R2/S1/S2 OI walls (_gtbFindWalls — the same wall ranking the OI Matrix
    // column already labels), toasting + beeping once per wall as price enters range.
    html += '<div class="sv-autoref-group" style="margin-left:8px;">';
    html +=   '<button id="sv-autoref-start" class="sv-pill-btn sv-autoref-btn" type="button" title="Start auto-refresh"><i class="bi bi-play-fill"></i> Start</button>';
    html +=   '<button id="sv-autoref-stop" class="sv-pill-btn sv-autoref-btn" type="button" disabled title="Stop auto-refresh"><i class="bi bi-stop-fill"></i> Stop</button>';
    html +=   '<select id="sv-autoref-interval" class="sv-pill-btn">';
    html +=     '<option value="1">Every 1 min</option>';
    html +=     '<option value="3">Every 3 min</option>';
    html +=     '<option value="5" selected>Every 5 min</option>';
    html +=     '<option value="10">Every 10 min</option>';
    html +=     '<option value="15">Every 15 min</option>';
    html +=   '</select>';
    html +=   '<span id="sv-autoref-status" class="sv-autoref-status"><i class="bi bi-circle"></i> Stopped</span>';
    html += '</div>';
    html += '</div>';

    // ── Chip panel ────────────────────────────────────────────────────────────
    html += '<div id="sv-chip-panel">';
    html += '<div id="sv-chip-controls">';
    html += '  <span id="sv-chip-label">SELECT INSTRUMENTS</span>';
    html += '  <div style="display:flex;gap:4px;">';
    html += '    <button id="sv-chip-select-all"  class="sv-pill-btn" type="button">All</button>';
    html += '    <button id="sv-chip-select-none" class="sv-pill-btn" type="button">None</button>';
    html += '  </div>';
    html += '  <button id="sv-load-selected" class="sv-load-btn" type="button"><i class="bi bi-play-fill"></i> LOAD</button>';
    html += '</div>';
    html += '<div id="sv-chip-list"></div>';
    html += '</div>';

    // ── Row area (header injected dynamically on load) ────────────────────────
    html += '<div id="sv-card-area"><div class="sv-empty-state"><i class="bi bi-funnel"></i><span>Choose a filter above to load instruments</span></div></div>';

    let title = '<div class="sv-titlebar">'
        + '<span class="sv-titlebar-brand"><i class="bi bi-bar-chart-steps"></i> STOCK VIEWER</span>'
        + '<span id="sv-titlebar-count" class="sv-titlebar-count"></span>'
        + popupWinControls("popup-custom-style-stock-viewer-scanner")
        + '</div>';

    showPopUpWindow('stock-viewer-scanner', html, "STOCK VIEWER", 1300, 700);
    jQ(".popup-custom-style-stock-viewer-scanner").find(".popupwindow_titlebar_text").html(title);
    hideNativePopupButtons("popup-custom-style-stock-viewer-scanner");
    setTimeout(_svSyncTheme, 30);
}

function _svSegBtn(filter, label, count, color) {
    var countHtml = count != null ? '<span class="sv-seg-count">' + count + '</span>' : '';
    return '<button class="sv-seg-btn" data-svfilter="' + filter + '" data-color="' + color + '" type="button">'
        + '<span class="sv-seg-label">' + label + '</span>' + countHtml + '</button>';
}

// ── Instrument list builder ────────────────────────────────────────────────────
function _svBuildList(type) {
    let list = [], scriptData = generateTrends();
    let breakOut915 = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN")) || {};
    jQ.each(INSTRUMENT_TOKENS, function (name) {
        let trends = scriptData[name] ? scriptData[name]['trends'] : [];
        let c915   = breakOut915[name] && breakOut915[name]['CLOSE_9_15'];
        if (type === 'all')                                                    { list.push(name); return; }
        if (type === 'aso'    && jQ.inArray("ASO", trends) !== -1)             list.push(name);
        if (type === 'bso'    && jQ.inArray("BSO", trends) !== -1)             list.push(name);
        if (type === 'nine15' && (c915 === 'ASO' || c915 === 'BSO'))           list.push(name);
        if (type === 'n50'    && jQ.inArray(name, NIFTY_50_LIST) !== -1)       list.push(name);
        if (type === 'bank'   && jQ.inArray(name, NIFTY_BANK_LIST) !== -1)     list.push(name);
        if (type === 'weight' && jQ.inArray(name, WEIGHTED_STOCKS) !== -1)     list.push(name);
    });
    return list;
}

// ── Chip panel ────────────────────────────────────────────────────────────────
function _svShowChipPanel(list) {
    let scriptData  = generateTrends();
    let breakOut915 = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN")) || {};
    let chipsHtml   = '';
    list.forEach(function (name) {
        let trends = scriptData[name] ? scriptData[name]['trends'] : [];
        let c915   = (breakOut915[name] || {})['CLOSE_9_15'];
        let isASO  = jQ.inArray("ASO", trends) !== -1;
        let isBSO  = jQ.inArray("BSO", trends) !== -1;
        let trendClass = isASO ? 'sv-chip-aso' : isBSO ? 'sv-chip-bso' : '';
        let show915 = c915 && ((c915 === 'ASO' && !isASO) || (c915 === 'BSO' && !isBSO) || (c915 !== 'ASO' && c915 !== 'BSO'));
        let c915html = show915 ? '<span class="sv-chip-915 ' + (c915 === 'ASO' ? 'green' : c915 === 'BSO' ? 'red' : '') + '">★</span>' : '';
        chipsHtml += '<div class="sv-chip sv-chip-selected ' + trendClass + '" data-name="' + name + '">'
            + '<span class="sv-chip-name">' + name + '</span>' + c915html + '</div>';
    });
    jQ('#sv-chip-list').html(chipsHtml);
    jQ('#sv-chip-panel').show();
    jQ('#sv-card-area').html('<div class="sv-empty-state"><i class="bi bi-play-circle"></i><span>Click LOAD to fetch selected instruments</span></div>');
    _svUpdateLoadCount();
}

function _svUpdateLoadCount() {
    let n = jQ('.sv-chip.sv-chip-selected').length;
    jQ('#sv-load-selected').html('<i class="bi bi-play-fill"></i> LOAD ' + (n ? '(' + n + ')' : ''));
}

// ── Event handlers ────────────────────────────────────────────────────────────
jQ(document).on("click", ".sv-seg-btn", function () {
    jQ('.sv-seg-btn').removeClass('sv-seg-active');
    jQ(this).addClass('sv-seg-active');
    _svShowChipPanel(_svBuildList(jQ(this).attr("data-svfilter")));
});
jQ(document).on("click", ".sv-chip", function () { jQ(this).toggleClass("sv-chip-selected"); _svUpdateLoadCount(); });
jQ(document).on("click", "#sv-chip-select-all",  function () { jQ('.sv-chip').addClass("sv-chip-selected");    _svUpdateLoadCount(); });
jQ(document).on("click", "#sv-chip-select-none", function () { jQ('.sv-chip').removeClass("sv-chip-selected"); _svUpdateLoadCount(); });

jQ(document).on("click", "#sv-load-selected", async function () {
    let selected = [];
    jQ('.sv-chip.sv-chip-selected').each(function () { selected.push(jQ(this).attr("data-name")); });
    if (!selected.length) return;
    jQ(this).prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Loading…');
    try { await _svLoadCards(selected); } catch(e) { console.log(e); }
    jQ(this).prop('disabled', false);
    _svUpdateLoadCount();
});

jQ(document).on("click", "#sv-card-area .refresh-chart", async function () {
    var name = jQ(this).attr("data-name");
    if (!name) return;
    var tid = name.replace(/ /g, '-').replace(/&/g, '-');
    jQ(this).html('<i class="bi bi-hourglass-split"></i>');
    try { await showTopChart(name, tid + '-chart' + _SV_SUFFIX); } catch(e) {}
    jQ(this).html('<i class="bi bi-arrow-clockwise"></i>');
});

jQ(document).on("click", ".refresh-oi-stock-viewer", async function () {
    var name = jQ(this).attr("data-name");
    if (!name) return;
    jQ(this).html('<i class="bi bi-hourglass-split"></i>');
    try {
        await showPrictionProbabilty(name);
        showOIOBVBarChart(name, _SV_SUFFIX);
        _gtbRenderOIMatrix(name, _SV_SUFFIX);
        var sc = computeInstrumentScore(name);
        if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
        INSTRUMENT_SCORE_MAP[name].score = sc;
        _gtbUpdateWeightBars(name, _SV_SUFFIX);
        _svRenderScoreConfidence(name, sc, _SV_SUFFIX);
        _gtbRefreshAllPredictCards(name);
        _gtbRefreshAllOIOBVCharts(name);
        _svApplyConfFilter();
    } catch(e) {}
    jQ(this).html('<i class="bi bi-bar-chart-fill"></i>');
});

// ── Score confidence + level suggestion ──────────────────────────────────────
function _svRenderScoreConfidence(name, sc, suffix) {
    var tid = name.replace(/ /g, '-').replace(/&/g, '-');
    // Target the confidence sub-div to preserve the SL row above it
    var el  = document.getElementById(tid + '-confidence' + suffix)
           || document.getElementById(tid + '-detail' + suffix);
    if (!el) return;

    var scores = [sc.nine_fifteen, sc.current_trend, sc.futures_trend, sc.oi_obv];
    var bulls  = scores.filter(function(v){ return v > 0; }).length;
    var bears  = scores.filter(function(v){ return v < 0; }).length;
    var total  = sc.total || 0;

    // If price action (9:15 + current trend) actually disagrees with the direction the
    // total implies, the total's sign is being carried by a MINORITY of the 4 sub-signals
    // — almost always a single large OI/OBV swing outweighing the rest (OI/OBV is noisier/
    // lower-liquidity per-stock than index options, see [[trade-signal-priority]]-style
    // reasoning). The confidence number below (bulls or bears / 4) already reflects this,
    // but a bold "STRONG SHORT/LONG" banner reads as confident regardless of that number —
    // demote to a plain WAIT with an explicit conflict note instead of showing a strong
    // directional call that the majority of independent signals don't actually support.
    var conflict = (total > 0 && bears > bulls) || (total < 0 && bulls > bears);

    var direction, conf, color, bg, icon;
    if (conflict) {
        direction = 'WAIT'; conf = Math.round(Math.min(bulls, bears) / 4 * 100);
        color = '#d29922'; bg = 'rgba(210,153,34,0.08)'; icon = 'bi-exclamation-triangle-fill';
    }
    else if (total >= 4)  { direction = 'STRONG LONG';  conf = Math.round(bulls/4*100); color = '#3fb950'; bg = 'rgba(63,185,80,0.12)';  icon = 'bi-arrow-up-circle-fill'; }
    else if (total > 0)   { direction = 'LONG';          conf = Math.round(bulls/4*100); color = '#3fb950'; bg = 'rgba(63,185,80,0.08)';  icon = 'bi-arrow-up-circle'; }
    else if (total <= -4) { direction = 'STRONG SHORT'; conf = Math.round(bears/4*100); color = '#f85149'; bg = 'rgba(248,81,73,0.12)';  icon = 'bi-arrow-down-circle-fill'; }
    else if (total < 0)   { direction = 'SHORT';         conf = Math.round(bears/4*100); color = '#f85149'; bg = 'rgba(248,81,73,0.08)';  icon = 'bi-arrow-down-circle'; }
    else                  { direction = 'WAIT';           conf = 0;                       color = '#d29922'; bg = 'rgba(210,153,34,0.08)'; icon = 'bi-dash-circle'; }

    var totalColor = total > 0 ? '#3fb950' : total < 0 ? '#f85149' : '#d29922';

    // ── Level analysis — built from INSTRUMENT_LIST_GLOBAL + VIX_QUOTE directly
    //    so it works for ALL instruments (stocks AND indices), not just those
    //    whose LTP is in INSTRUMENT_LTP_PRICE (only tab-0 watchlist gets LTP).
    var lvlHtml = '';
    try {
        var _instList  = JSON.parse(localStorage.getItem('INSTRUMENT_LIST_GLOBAL') || '{}');
        var _vixStore  = JSON.parse(localStorage.getItem('VIX_QUOTE') || 'null');
        var _instData  = _instList[name] || {};
        var _prevClose = parseFloat(_instData.prevPrice);
        var _dayOpen   = parseFloat(_instData.price);

        // LTP: prefer INSTRUMENT_LTP_PRICE (live), fall back to DOM element written by showTopChart
        var _ltpStore  = JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}');
        var _ltpEntry  = _ltpStore[name];
        var _ltpDom    = parseFloat((document.getElementById(tid + '-ltp' + suffix) || {}).innerText || 'NaN');
        var ltp = _ltpEntry ? parseFloat(_ltpEntry.ltp) : _ltpDom;

        // Strike levels from today's open price (no LTP needed)
        var _sdObj = { price: _dayOpen };
        var sd   = (!isNaN(_dayOpen) && getStrikeDetails) ? getStrikeDetails(_sdObj, name) : {};
        var aso  = parseFloat(sd.ustrikeOne);   // bullish entry level
        var ast  = parseFloat(sd.ustrikeTwo);   // strong bullish
        var bso  = parseFloat(sd.bstrikeOne);   // bearish entry level
        var bst  = parseFloat(sd.bstrikeTwo);   // strong bearish

        // VIXU / VIXL from prevClose × India VIX (works for any instrument)
        var vixu = NaN, vixl = NaN;
        if (!isNaN(_prevClose) && _vixStore && _vixStore.data && _vixStore.data.candles && _vixStore.data.candles[0]) {
            var _vr = getVixRange(_prevClose, parseFloat(_vixStore.data.candles[0][4]));
            vixu = parseFloat(_vr.vixDDUpper);
            vixl = parseFloat(_vr.vixDDLower);
        }

        // Determine level context
        var levelMsg, levelColor, levelIcon, levelSub;

        var aboveVIXU = ltp >= vixu;
        var belowVIXL = ltp <= vixl;
        var nearASO   = !isNaN(aso) && Math.abs(ltp - aso) / aso < 0.003;   // within 0.3%
        var nearBSO   = !isNaN(bso) && Math.abs(ltp - bso) / bso < 0.003;
        var aboveASO  = !isNaN(aso) && ltp > aso;
        var belowBSO  = !isNaN(bso) && ltp < bso;

        if (total > 0) {
            // Looking for LONG
            if (aboveVIXU) {
                levelMsg = 'AVOID LONG'; levelColor = '#f85149'; levelIcon = 'bi-shield-x';
                levelSub = 'At VIXU ' + (isNaN(vixu) ? '—' : vixu.toFixed(0)) + ' — range exhausted';
            } else if (nearASO || aboveASO) {
                var room = isNaN(vixu) ? null : (vixu - ltp).toFixed(0);
                levelMsg = 'LONG OK'; levelColor = '#3fb950'; levelIcon = 'bi-check-circle';
                levelSub = 'ASO ' + (isNaN(aso) ? '—' : aso.toFixed(0))
                    + (room ? ' · room to VIXU +' + room : '');
            } else {
                levelMsg = 'WAIT FOR ASO'; levelColor = '#d29922'; levelIcon = 'bi-arrow-right-circle';
                levelSub = 'Entry at ' + (isNaN(aso) ? '—' : aso.toFixed(0)) + ' · now ' + ltp.toFixed(0);
            }
        } else if (total < 0) {
            // Looking for SHORT
            if (belowVIXL) {
                levelMsg = 'AVOID SHORT'; levelColor = '#f85149'; levelIcon = 'bi-shield-x';
                levelSub = 'At VIXL ' + (isNaN(vixl) ? '—' : vixl.toFixed(0)) + ' — range exhausted';
            } else if (nearBSO || belowBSO) {
                var room2 = isNaN(vixl) ? null : (ltp - vixl).toFixed(0);
                levelMsg = 'SHORT OK'; levelColor = '#f85149'; levelIcon = 'bi-check-circle';
                levelSub = 'BSO ' + (isNaN(bso) ? '—' : bso.toFixed(0))
                    + (room2 ? ' · room to VIXL −' + room2 : '');
            } else {
                levelMsg = 'WAIT FOR BSO'; levelColor = '#d29922'; levelIcon = 'bi-arrow-right-circle';
                levelSub = 'Entry at ' + (isNaN(bso) ? '—' : bso.toFixed(0)) + ' · now ' + ltp.toFixed(0);
            }
        } else {
            levelMsg = 'NO SETUP'; levelColor = '#7d8590'; levelIcon = 'bi-dash-circle';
            levelSub = 'ASO ' + (isNaN(aso) ? '—' : aso.toFixed(0))
                + ' | BSO ' + (isNaN(bso) ? '—' : bso.toFixed(0));
        }

        // VIXU / VIXL band row
        var bandHtml = '';
        if (!isNaN(vixu) && !isNaN(vixl)) {
            bandHtml = '<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;">'
                + '<span style="font-size:0.42rem;padding:1px 5px;border-radius:3px;background:rgba(248,81,73,0.1);color:#f85149;font-weight:700;">VIXU ' + vixu.toFixed(0) + '</span>'
                + '<span style="font-size:0.42rem;padding:1px 5px;border-radius:3px;background:rgba(63,185,80,0.1);color:#3fb950;font-weight:700;">VIXL ' + vixl.toFixed(0) + '</span>'
                + '</div>';
        }

        lvlHtml = '<div style="border-top:1px solid var(--gtb-border2);margin-top:5px;padding-top:5px;">'
            + '<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">'
            +   '<i class="bi ' + levelIcon + '" style="color:' + levelColor + ';font-size:0.65rem;"></i>'
            +   '<span style="font-size:0.54rem;font-weight:900;color:' + levelColor + ';letter-spacing:0.05em;">' + levelMsg + '</span>'
            + '</div>'
            + '<div style="font-size:0.44rem;color:var(--gtb-muted);line-height:1.5;">' + levelSub + '</div>'
            + bandHtml
            + '</div>';
    } catch(e) {}

    el.innerHTML = '<div style="padding:4px 6px;">'
        + '<div style="display:flex;align-items:center;gap:4px;margin-bottom:5px;">'
        +   '<i class="bi ' + icon + '" style="color:' + color + ';font-size:0.75rem;"></i>'
        +   '<span style="font-size:0.56rem;font-weight:900;color:' + color + ';background:' + bg
        +     ';padding:2px 7px;border-radius:4px;border:1px solid ' + color + '44;letter-spacing:0.06em;">' + direction + '</span>'
        + '</div>'
        + (conflict ? '<div style="font-size:0.42rem;color:' + color + ';line-height:1.4;margin-bottom:5px;">'
            + '⚠ Price action (9:15' + (bulls > bears ? '+Trend bullish' : '+Trend bearish') + ') disagrees with the OI-driven score — demoted from a ' + (total > 0 ? 'LONG' : 'SHORT') + ' call, wait for signals to agree.'
            + '</div>' : '')
        + '<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">'
        +   '<span style="font-size:0.44rem;color:var(--gtb-muted);min-width:50px;">Confidence</span>'
        +   '<div style="flex:1;height:4px;background:var(--gtb-surface2);border-radius:3px;overflow:hidden;">'
        +     '<div style="width:' + conf + '%;height:100%;background:' + color + ';border-radius:3px;"></div>'
        +   '</div>'
        +   '<span style="font-size:0.46rem;font-weight:800;color:' + color + ';min-width:22px;text-align:right;">' + conf + '%</span>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:4px;">'
        +   '<span style="font-size:0.44rem;color:var(--gtb-muted);min-width:50px;">Score</span>'
        +   '<span style="font-size:0.6rem;font-weight:900;color:' + totalColor + ';">' + (total > 0 ? '+' : '') + parseFloat(total).toFixed(1) + '</span>'
        +   '<span style="font-size:0.4rem;color:var(--gtb-muted);">(' + bulls + '↑ ' + bears + '↓)</span>'
        + '</div>'
        + lvlHtml
        + '</div>';
}

// ── Build one row HTML — exact copy of main panel row, all IDs suffixed ──────
function _svRowHtml(name, scriptData, breakOut915) {
    var tid  = name.replace(/ /g, '-').replace(/&/g, '-');
    var s    = _SV_SUFFIX;
    var kiteLink = 'https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/' + name + '/' + INSTRUMENT_TOKENS[name];
    var hasFut = (name !== 'GIFT NIFTY' && name !== 'SENSEX');

    var h = '<div class="gtb-row cat-stock" id="sv-pane-' + tid + '">';

    // col 1 — identity
    h += '<div class="gtb-row-id">';
    h +=   '<div class="gtb-row-name"><a class="gtb-instr-link" href="' + kiteLink + '" target="_blank">' + name + '</a></div>';
    h +=   '<div class="gtb-row-ltp" id="' + tid + '-ltp' + s + '"></div>';
    h +=   '<div class="gtb-row-id-actions">';
    h +=     '<button class="sv-icon-btn refresh-chart" data-name="' + name + '" title="Refresh chart"><i class="bi bi-arrow-clockwise"></i></button>';
    h +=     '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="chart" title="Maximize chart"><i class="bi bi-fullscreen"></i></button>';
    if (hasFut) {
        h += '<button class="sv-icon-btn refresh-oi-stock-viewer" data-name="' + name + '" title="Refresh OI"><i class="bi bi-bar-chart-fill"></i></button>';
        h += '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="oi" title="Maximize OI"><i class="bi bi-graph-up"></i></button>';
    }
    h +=   '</div>';
    h += '</div>';

    // col 2 — prediction (always-visible condensed card, click for full popup)
    h += '<div class="gtb-row-predict" id="' + tid + '-predict' + s + '"><span class="gtb-row-na" style="margin:auto">—</span></div>';

    // col 3 — OI/OBV
    h += '<div class="gtb-row-oiobv">';
    if (hasFut) {
        h += '<div class="gtb-oiobv-lbl">OI</div>';
        h += '<div id="' + tid + '-oi' + s + '" class="gtb-chart-oi"></div>';
        h += '<div id="' + tid + '-oi-signal-row' + s + '" style="display:none;"></div>';
        h += '<div class="gtb-oiobv-lbl">OBV</div>';
        h += '<div id="' + tid + '-obv' + s + '" class="gtb-chart-oi"></div>';
        h += '<div id="' + tid + '-oiobv-xaxis' + s + '" class="gtb-oiobv-xaxis"></div>';
    } else {
        h += '<span class="gtb-row-na" style="margin:auto">—</span>';
    }
    h += '</div>';

    // col 4 — chart
    h += '<div class="gtb-row-col-chart">';
    h +=   '<div id="' + tid + '-chart-levels' + s + '" class="gtb-chart-levels"></div>';
    h +=   '<div id="' + tid + '-chart' + s + '" class="gtb-chart-mini gtb-row-chart"></div>';
    h += '</div>';

    // col 5 — 9:15
    h += '<div class="gtb-row-col gtb-row-915">';
    h +=   '<span class="gtb-915-badge" id="' + tid + '-915-badge' + s + '"></span>';
    h +=   '<button class="gtb-prob-btn" data-name="' + name + '" title="Strike-level probability"><i class="bi bi-percent"></i></button>';
    h += '</div>';

    // col 6 — futures
    h += '<div class="gtb-row-col gtb-row-fut">';
    if (hasFut) {
        h +=   '<span id="' + tid + '-futures-premium' + s + '" class="gtb-cell-premium-chip"></span>';
        h +=   '<div id="' + tid + '-futures' + s + '" class="gtb-cell-fut-signals"></div>';
        h +=   '<div id="' + tid + '-futures-trend' + s + '" class="gtb-cell-fut-remark"></div>';
    } else {
        h +=   '<span class="gtb-row-na">—</span>';
    }
    h += '</div>';

    // col 7 — OI matrix
    h += '<div class="gtb-row-oimatrix" id="' + tid + '-oimatrix' + s + '">';
    if (!hasFut) h += '<span class="gtb-row-na">—</span>';
    h += '</div>';

    // col 8 — weights (sub-score bars)
    var subRows = [
        { lbl:'9:15',  id: tid + '-sub-915'  + s },
        { lbl:'Trend', id: tid + '-sub-trend' + s },
        { lbl:'Fut',   id: tid + '-sub-fut'   + s },
        { lbl:'OI',    id: tid + '-sub-oi'    + s },
        { lbl:'Total', id: tid + '-sub-total' + s },
    ];
    h += '<div class="gtb-row-weights" id="' + tid + '-weights' + s + '">';
    if (hasFut) {
        subRows.forEach(function(sr) {
            h += '<div class="gtb-wt-row">'
               + '<span class="gtb-wt-name">' + sr.lbl + '</span>'
               + '<div class="gtb-wt-bar"><b id="' + sr.id + '-bar" style="width:0%;background:var(--gtb-muted)"></b></div>'
               + '<span class="gtb-wt-score" id="' + sr.id + '">—</span>'
               + '</div>';
        });
    } else {
        h += '<span class="gtb-row-na" style="margin:auto">—</span>';
    }
    h += '</div>';

    // col 9 — detail: SL row (persistent) + confidence panel (overwritten by _svRenderScoreConfidence)
    h += '<div class="gtb-row-detail" id="' + tid + '-detail' + s + '">';
    if (hasFut) {
        h += '<div class="gtb-det-row"><div id="' + tid + '-atr-sl' + s + '" class="gtb-cell-sl-wrap" style="margin-left:0"></div></div>';
        h += '<div id="' + tid + '-confidence' + s + '"></div>';
    } else {
        h += '<span class="gtb-row-na" style="margin:auto">—</span>';
    }
    h += '</div>';

    h += '</div>'; // .gtb-row
    return h;
}

// ── Load selected instruments ─────────────────────────────────────────────────
async function _svLoadCards(list) {
    let scriptData  = generateTrends();
    let breakOut915 = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN")) || {};

    // Column header inside card area — same 8 columns as #gtb-rows-head
    let header = '<div id="sv-rows-head">'
        + '<span class="gtb-rh-instr">INSTRUMENT</span>'
        + '<span class="gtb-rh-predict"><i class="bi bi-lightbulb-fill"></i> PREDICT</span>'
        + '<span class="gtb-rh-oiobv">OI / OBV</span>'
        + '<span class="gtb-rh-chart">PRICE ACTION</span>'
        + '<span class="gtb-rh-915">9:15</span>'
        + '<span class="gtb-rh-fut">FUTURES</span>'
        + '<span class="gtb-rh-oi">OI MATRIX</span>'
        + '<span class="gtb-rh-weights">SCORE</span>'
        + '<span class="gtb-rh-detail">DETAIL</span>'
        + '</div>';

    let html = header;
    list.forEach(function (name) { html += _svRowHtml(name, scriptData, breakOut915); });
    jQ('#sv-card-area').html(html);
    jQ('#sv-titlebar-count').text(list.length + ' instruments');
    _SV_LOADED_LIST = list.slice();

    for (let i = 0; i < list.length; i++) {
        let name = list[i];
        let tid  = name.replaceAll(' ', '-').replaceAll('&', '-');
        try { await showTopChart(name, tid + '-chart' + _SV_SUFFIX); } catch(e) { console.log(e); }
        try { let res = await showFutureDetails(name); setFutureDetails(name, res, _SV_SUFFIX); } catch(e) { console.log(e); }
        try {
            await showPrictionProbabilty(name);
            showOIOBVBarChart(name, _SV_SUFFIX);
            _gtbRenderOIMatrix(name, _SV_SUFFIX);
            try {
                var sc = computeInstrumentScore(name);
                if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
                INSTRUMENT_SCORE_MAP[name].score = sc;
                _gtbUpdateWeightBars(name, _SV_SUFFIX);
                _svRenderScoreConfidence(name, sc, _SV_SUFFIX);
            } catch(e2) { console.log(e2); }
        } catch(e) { console.log(e); }
        try { _gtbRefreshAllPredictCards(name); } catch(e3) { console.log(e3); }
        try { _gtbRefreshAllOIOBVCharts(name); } catch(e4) { console.log(e4); }
        _svApplyConfFilter();
    }
}

// Hides/shows loaded rows by the Prediction confidence % already on their
// .sv-predict-compact card (data-confidence) — no re-fetch, just a display filter.
// IMPORTANT: .gtb-row's CSS declares `display: grid` — jQuery's .show()/.hide()/.toggle()
// don't know that and fall back to a guessed default ('block'), which breaks the row's
// column layout (columns stack vertically instead of side-by-side) the moment this runs.
// Set style.display directly instead: '' removes the inline override and lets the
// stylesheet's `display: grid` apply; 'none' hides it same as jQuery would.
function _svApplyConfFilter() {
    var min = parseInt(jQ('#sv-conf-filter').val() || '0', 10);
    document.querySelectorAll('#sv-card-area .gtb-row').forEach(function (row) {
        if (!min) { row.style.display = ''; return; }
        var pred = row.querySelector('.sv-predict-compact[data-confidence]');
        // Not loaded yet (still mid-LOAD, hasn't reached this instrument) — leave it
        // visible rather than hiding it. Hiding here was the bug: with a threshold
        // already selected, every row this call hadn't reached yet vanished, so the
        // grid looked like it emptied out row-by-row as the batch loaded instead of
        // filtering only once each row's real confidence was known.
        if (!pred) { row.style.display = ''; return; }
        var conf = parseInt(pred.getAttribute('data-confidence'), 10);
        row.style.display = (!isNaN(conf) && conf >= min) ? '' : 'none';
    });
}
jQ(document).on('change', '#sv-conf-filter', _svApplyConfFilter);

async function showStockAnalyzer(type) { _svShowChipPanel(_svBuildList(type)); }

// ── Auto-refresh (Start/Stop/interval) + R1/R2/S1/S2 wall proximity alerts ──────
var _SV_LOADED_LIST = [];
var _SV_AUTO_TIMER = null;
var _SV_AUTO_TICKING = false;
var _SV_WALL_PROXIMITY_PCT = 0.003; // 0.3% — same "near level" threshold used elsewhere in this app
var _SV_ACTIVE_WALL_ALERTS = {};    // key "name|R1|strike" -> true while price is still within range, so re-entry re-alerts but sitting still doesn't spam every tick

function _svSetAutoRefreshUI(running) {
    jQ('#sv-autoref-start').prop('disabled', running);
    jQ('#sv-autoref-stop').prop('disabled', !running);
    jQ('#sv-autoref-interval').prop('disabled', running);
    jQ('#sv-autoref-status').toggleClass('sv-autoref-running', running)
        .html(running
            ? '<i class="bi bi-record-circle-fill"></i> Running'
            : '<i class="bi bi-circle"></i> Stopped');
}

function _svStartAutoRefresh() {
    if (_SV_AUTO_TIMER) return;
    var mins = parseFloat(jQ('#sv-autoref-interval').val() || '5');
    _SV_AUTO_TIMER = setInterval(_svAutoRefreshTick, mins * 60 * 1000);
    _svSetAutoRefreshUI(true);
    _gtbToast('Stock Viewer auto-refresh started — every ' + mins + ' min', 'success');
}

function _svStopAutoRefresh() {
    if (_SV_AUTO_TIMER) { clearInterval(_SV_AUTO_TIMER); _SV_AUTO_TIMER = null; }
    _svSetAutoRefreshUI(false);
}

async function _svAutoRefreshTick() {
    if (_SV_AUTO_TICKING || !_SV_LOADED_LIST.length) return;
    _SV_AUTO_TICKING = true;
    try {
        await _svLoadCards(_SV_LOADED_LIST);
        _svCheckWallProximityAlerts(_SV_LOADED_LIST);
    } catch (e) { console.log('[sv-autorefresh]', e); }
    _SV_AUTO_TICKING = false;
}

// Short two-tone beep via Web Audio — no dependency on the (unused) alertSound.js resource.
function _svBeep() {
    try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        [880, 660].forEach(function (freq, i) {
            var osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.frequency.value = freq; osc.type = 'sine';
            osc.connect(gain); gain.connect(ctx.destination);
            var t0 = ctx.currentTime + i * 0.16;
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
            osc.start(t0); osc.stop(t0 + 0.16);
        });
    } catch (e) {}
}

function _svCheckWallProximityAlerts(list) {
    var ltpMap = {}; try { ltpMap = JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}'); } catch (e) {}
    var seenKeys = {};

    list.forEach(function (name) {
        var sm = INSTRUMENT_SCORE_MAP[name];
        var oiData = sm && sm.oiData;
        var tableData = oiData && oiData.tableData;
        if (!tableData || !tableData.length) return;

        var tid = name.replace(/ /g, '-').replace(/&/g, '-');
        var ltp = (ltpMap[name] && parseFloat(ltpMap[name].ltp)) || parseFloat(sm.mcxLtp)
            || parseFloat((document.getElementById(tid + '-ltp' + _SV_SUFFIX) || {}).innerText);
        if (!ltp || isNaN(ltp)) return;

        var walls;
        try { walls = _gtbFindWalls(tableData, 0, ltp); } catch (e) { return; }

        function _check(arr, side) {
            (arr || []).forEach(function (w, i) {
                var label = side + (i + 1); // R1/R2 or S1/S2
                var distPct = Math.abs(ltp - w.strike) / ltp;
                var key = name + '|' + label + '|' + w.strike;
                if (distPct <= _SV_WALL_PROXIMITY_PCT) {
                    seenKeys[key] = true;
                    if (!_SV_ACTIVE_WALL_ALERTS[key]) {
                        _SV_ACTIVE_WALL_ALERTS[key] = true;
                        var dir = side === 'R' ? 'resistance' : 'support';
                        _gtbToast(name + ' near ' + label + ' ' + dir + ' wall (' + w.strike + ') — LTP ' + ltp.toFixed(1), 'warn');
                        _svBeep();
                    }
                }
            });
        }
        _check(walls.resistance, 'R');
        _check(walls.support, 'S');
    });

    // Clear alerts for walls price has moved away from, so a later re-entry alerts again.
    Object.keys(_SV_ACTIVE_WALL_ALERTS).forEach(function (key) { if (!seenKeys[key]) delete _SV_ACTIVE_WALL_ALERTS[key]; });
}

// Wall-building is now shown directly on the OI/OBV chart (a pulsing marker at the
// forming strike, drawn in showOIOBVBarChart via _gtbWallVelocity) instead of firing a
// toast — visible for as long as the buildup lasts rather than a one-shot notification.

jQ(document).on('click', '#sv-autoref-start', _svStartAutoRefresh);
jQ(document).on('click', '#sv-autoref-stop', _svStopAutoRefresh);
// Popup close (native + custom close button) should stop the timer, not leave it running
// in the background firing full reloads against a closed/gone card area.
jQ(document).on('click', '.popup-custom-style-stock-viewer-scanner .popupwindow_titlebar_button_close, .popup-custom-style-stock-viewer-scanner .gtb-popup-close', _svStopAutoRefresh);
