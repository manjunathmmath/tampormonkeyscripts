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
    } catch(e) {}
    jQ(this).html('<i class="bi bi-bar-chart-fill"></i>');
});

// ── Score confidence + level suggestion ──────────────────────────────────────
function _svRenderScoreConfidence(name, sc, suffix) {
    var tid = name.replace(/ /g, '-').replace(/&/g, '-');
    var el  = document.getElementById(tid + '-detail' + suffix);
    if (!el) return;

    var scores = [sc.nine_fifteen, sc.current_trend, sc.futures_trend, sc.oi_obv];
    var bulls  = scores.filter(function(v){ return v > 0; }).length;
    var bears  = scores.filter(function(v){ return v < 0; }).length;
    var total  = sc.total || 0;

    var direction, conf, color, bg, icon;
    if      (total >= 4)  { direction = 'STRONG LONG';  conf = Math.round(bulls/4*100); color = '#3fb950'; bg = 'rgba(63,185,80,0.12)';  icon = 'bi-arrow-up-circle-fill'; }
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

    // col 2 — chart
    h += '<div class="gtb-row-col-chart">';
    h +=   '<div id="' + tid + '-chart-levels' + s + '" class="gtb-chart-levels"></div>';
    h +=   '<div id="' + tid + '-chart' + s + '" class="gtb-chart-mini gtb-row-chart"></div>';
    h += '</div>';

    // col 3 — 9:15
    h += '<div class="gtb-row-col gtb-row-915">';
    h +=   '<span class="gtb-915-badge" id="' + tid + '-915-badge' + s + '"></span>';
    h +=   '<button class="gtb-prob-btn" data-name="' + name + '" title="Strike-level probability"><i class="bi bi-percent"></i></button>';
    h += '</div>';

    // col 4 — futures
    h += '<div class="gtb-row-col gtb-row-fut">';
    if (hasFut) {
        h +=   '<span id="' + tid + '-futures-premium' + s + '" class="gtb-cell-premium-chip"></span>';
        h +=   '<div id="' + tid + '-futures' + s + '" class="gtb-cell-fut-signals"></div>';
        h +=   '<div id="' + tid + '-futures-trend' + s + '" class="gtb-cell-fut-remark"></div>';
    } else {
        h +=   '<span class="gtb-row-na">—</span>';
    }
    h += '</div>';

    // col 5 — OI matrix
    h += '<div class="gtb-row-oimatrix" id="' + tid + '-oimatrix' + s + '">';
    if (!hasFut) h += '<span class="gtb-row-na">—</span>';
    h += '</div>';

    // col 6 — OI/OBV
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

    // col 7 — weights (sub-score bars)
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

    // col 8 — detail
    h += '<div class="gtb-row-detail" id="' + tid + '-detail' + s + '">';
    if (hasFut) {
        h += '<div class="gtb-det-row"><span class="gtb-det-lbl">SL</span><div id="' + tid + '-atr-sl' + s + '" class="gtb-cell-sl-wrap" style="margin-left:0"></div></div>';
        h += '<div class="gtb-det-row"><span class="gtb-det-lbl">PCR</span><span class="gtb-pcr-chip gtb-det-val" id="' + tid + '-pcr-probability' + s + '"></span></div>';
        h += '<div class="gtb-det-row"><span class="gtb-det-lbl">OI sc</span><span class="gtb-oi-score-chip gtb-det-val" id="' + tid + '-oi-score' + s + '"></span></div>';
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
        + '<span class="gtb-rh-chart">PRICE ACTION</span>'
        + '<span class="gtb-rh-915">9:15</span>'
        + '<span class="gtb-rh-fut">FUTURES</span>'
        + '<span class="gtb-rh-oi">OI MATRIX</span>'
        + '<span class="gtb-rh-oiobv">OI / OBV</span>'
        + '<span class="gtb-rh-weights">SCORE</span>'
        + '<span class="gtb-rh-detail">DETAIL</span>'
        + '</div>';

    let html = header;
    list.forEach(function (name) { html += _svRowHtml(name, scriptData, breakOut915); });
    jQ('#sv-card-area').html(html);
    jQ('#sv-titlebar-count').text(list.length + ' instruments');

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
    }
}

async function showStockAnalyzer(type) { _svShowChipPanel(_svBuildList(type)); }
