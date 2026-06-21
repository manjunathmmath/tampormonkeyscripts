// ─── grootTradeBot.js ──────────────────────────────────────────────────────────
// Main dashboard popup for the autoTrade Tampermonkey script.
//
// KEY RESPONSIBILITIES:
//   1. Dashboard popup — "GROOT" button opens the main panel with score gauges,
//      candlestick charts, futures strip, OI viewer, and advance/decline scanner.
//   2. Score system — composite score from multiple signals:
//        9:15 breakout score (ALL_9_15_CLOSE_SCORE, per-index scores)
//        Advance/decline score (NIFTY_50/BANK/ALL_ADVANCE_DECLINE_SCORE)
//        Futures trend score (NIFTY_50/BANK/ALL_FUTURES_TREND_SCORE)
//        OI/OBV score per instrument (NIFTY_50/NIFTY_BANK/RELIANCE/HDFCBANK/ICICIBANK_OI_OBV_SCORE)
//        Component scores (NIFTY_50_COMPONENT_SCORE, NIFTY_BANK_COMPONENT_SCORE)
//      Gauge colors: red < 0, orange 1–4, yellow 5–7, green ≥ 8
//   3. Strike scoring — scoreOIStrikeForSignal() uses OI Delta + IV (primary) / OBV (fallback)
//      to classify each strike as CE WRITE / CE BUY / PE WRITE / PE BUY and compute
//      a directional score. Strong resistance = CE WRITE + PE BUY. Strong support = CE BUY + PE WRITE.
//   4. Component scores — computeInstrumentScore() / computeComponentScores() iterate
//      NIFTY_50_WEIGHTED_STOCKS / NIFTY_BANK_WEIGHTED_STOCKS, score each constituent
//      on 9:15, trend, futures, OI/OBV, and weight by constituent weight %.
//   5. Maximize overlay — any chart, OI table, or futures panel can be expanded to
//      fullscreen via .maximize-component-btn buttons.
//   6. Chart rendering — _renderLWChart() wraps TradingView Lightweight Charts for
//      all candlestick panels. _buildATRBadges() computes ATR-based stop-loss levels.
//
// GLOBAL STATE:
//   globalFuturesTrend  — { instrumentName: { remark, premium, ... } } from last scan
//   stockTable          — DataTables instance for the OI viewer table
//   INSTRUMENT_SCORE_MAP — { name: { futures_trend, oi_obv, oiData, score: {...} } }
//   stock[]             — array of { TRADINGSYMBOL, DATA } used by OI renderer
// ─────────────────────────────────────────────────────────────────────────────

let globalFuturesTrend = {}
let stockTable = null;

// Shared OI/OBV chart color palette — used in all chart sizes and maximize overlay
const OI_COLORS = {
    CE_OI:  '#dc3545',   // CE OI change   — red
    PE_OI:  '#28a745',   // PE OI change   — green
    CE_OBV: '#dc3545',   // CE OBV delta   — red
    PE_OBV: '#28a745',   // PE OBV delta   — green
};
let componentColorHeader = {
    'NIFTY 50': '#e7cc00',
    'GIFT NIFTY': '#77e700',
    'NIFTY BANK': '#68e398',
    'SENSEX': '#ffbcb0',
}
// ── Maximize overlay ────────────────────────────────────────────────────────
jQ('body').append(
    '<div id="groot-maximize-overlay">'
  +   '<div id="groot-maximize-panel">'
  +     '<div id="groot-maximize-title"></div>'
  +     '<span id="groot-maximize-refresh" title="Refresh" style="display:none;">↺</span>'
  +     '<span id="groot-maximize-close" title="Close">✕</span>'
  +     '<div id="groot-maximize-body"></div>'
  +   '</div>'
  + '</div>'
);

// ── Chart Grid overlay (7-instrument full-screen view) ───────────────────────
jQ('body').append(
    '<div id="gtb-chartgrid-overlay" style="display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.94);backdrop-filter:blur(6px);flex-direction:column;">'
  + '<div id="gtb-chartgrid-header" style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid #30363d;flex-shrink:0;">'
  + '<span style="font-size:0.75rem;font-weight:700;color:#c9d1d9;letter-spacing:0.06em;"><i class="bi bi-grid-3x3-gap-fill"></i> CHART GRID</span>'
  + '<span id="gtb-chartgrid-status" style="font-size:0.65rem;color:#7d8590;margin-left:4px;"></span>'
  + '<span style="margin-left:auto;display:flex;gap:6px;">'
  + '<select id="gtb-chartgrid-interval" style="font-size:0.62rem;background:#161b22;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;padding:2px 6px;cursor:pointer;">'
  + '<option value="5minute">5 min</option><option value="15minute">15 min</option><option value="30minute">30 min</option><option value="60minute">1 hr</option>'
  + '</select>'
  + '<button id="gtb-chartgrid-refresh" style="font-size:0.62rem;background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;padding:2px 8px;cursor:pointer;"><i class="bi bi-arrow-clockwise"></i> Refresh</button>'
  + '<span id="gtb-chartgrid-close" style="cursor:pointer;color:#7d8590;font-size:1rem;padding:0 4px;line-height:1;" title="Close">✕</span>'
  + '</span></div>'
  + '<div id="gtb-chartgrid-body" style="flex:1;overflow:hidden;padding:8px;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(2,1fr);gap:6px;min-height:0;"></div>'
  + '</div>'
);

jQ(document).on('click', '#groot-maximize-close, #groot-maximize-overlay', function(e) {
    if (e.target.id === 'groot-maximize-overlay' || e.target.id === 'groot-maximize-close' || jQ(e.target).closest('#groot-maximize-close').length) {
        jQ('#groot-maximize-overlay').removeClass('active');
        jQ('#groot-maximize-body').html(''); // clear stale content so next open is clean
    }
});
jQ(document).on('click', '#groot-maximize-panel', function(e) { e.stopPropagation(); });

jQ(document).on('click', '#groot-maximize-refresh', async function() {
    if (!_gtbMaxRefreshFn) return;
    var btn = jQ(this);
    btn.css('opacity', '0.4').css('pointer-events', 'none');
    try { await _gtbMaxRefreshFn(); } catch(e) { console.log('maximize refresh error', e); }
    btn.css('opacity', '').css('pointer-events', '');
});

// ── Chart Grid ────────────────────────────────────────────────────────────────
var _gtbCGVisible = false;
var _gtbChartGridCharts = {};   // name → LW chart instance

var _GTB_CHARTGRID_INSTRUMENTS = [
    { name: 'GIFT NIFTY',  label: 'GIFT NIFTY',  mcx: false },
    { name: 'NIFTY 50',    label: 'NIFTY 50',    mcx: false },
    { name: 'NIFTY BANK',  label: 'BANK NIFTY',  mcx: false },
    { name: 'SENSEX',      label: 'SENSEX',       mcx: false },
    { name: 'HDFCBANK',    label: 'HDFC BANK',    mcx: false },
    { name: 'RELIANCE',    label: 'RELIANCE',     mcx: false },
    { name: 'ICICIBANK',   label: 'ICICI BANK',   mcx: false },
    { name: 'CRUDEOILM',   label: 'CRUDE OIL',    mcx: true  },
];

function _gtbChartGridSetStatus(msg) {
    jQ('#gtb-chartgrid-status').text(msg || '');
}

function _gtbChartGridOpen() {
    var isLight = jQ('#main-trade-bot-container').hasClass('gtb-light');
    jQ('#gtb-chartgrid-overlay').toggleClass('gtb-light', isLight).css('display', 'flex');
    _gtbCGVisible = true;
    _gtbChartGridLoad();
}

function _gtbChartGridClose() {
    jQ('#gtb-chartgrid-overlay').css('display', 'none');
    _gtbCGVisible = false;
    // Destroy all LW chart instances to free memory
    Object.keys(_gtbChartGridCharts).forEach(function(k) {
        try { _gtbChartGridCharts[k].remove(); } catch(e) {}
    });
    _gtbChartGridCharts = {};
    jQ('#gtb-chartgrid-body').empty();
}

async function _gtbChartGridLoad() {
    var body = jQ('#gtb-chartgrid-body');

    // Destroy existing LW instances before clearing DOM
    Object.keys(_gtbChartGridCharts).forEach(function(k) {
        try { _gtbChartGridCharts[k].remove(); } catch(e) {}
    });
    _gtbChartGridCharts = {};
    body.empty();

    var interval = jQ('#gtb-chartgrid-interval').val() || '5minute';

    // Build cell placeholders
    _GTB_CHARTGRID_INSTRUMENTS.forEach(function(inst) {
        var tid = inst.name.replace(/\s+/g, '-').replace(/&/g, '-');
        body.append(
            '<div class="gtb-cg-cell" id="gtb-cg-' + tid + '" style="'
          + 'background:var(--gtb-bg,#0d1117);border:1px solid var(--gtb-border,#21262d);border-radius:6px;'
          + 'display:flex;flex-direction:column;overflow:hidden;min-height:0;">'
          + '<div style="display:flex;align-items:center;gap:6px;padding:3px 8px;flex-shrink:0;'
          + 'border-bottom:1px solid var(--gtb-border,#21262d);">'
          + '<span style="font-size:0.58rem;font-weight:700;color:var(--gtb-muted,#7d8590);flex-shrink:0;">' + inst.label + '</span>'
          + '<span id="gtb-cg-levels-' + tid + '" style="display:flex;flex-wrap:nowrap;gap:4px;overflow:hidden;"></span>'
          + '</div>'
          + '<div id="gtb-cg-chart-' + tid + '" style="flex:1;min-height:0;position:relative;"></div>'
          + '</div>'
        );
    });

    _gtbChartGridSetStatus('Loading…');
    var done = 0, total = _GTB_CHARTGRID_INSTRUMENTS.length;

    // Fetch all candles in parallel
    var results = await Promise.all(_GTB_CHARTGRID_INSTRUMENTS.map(async function(inst) {
        try {
            var token = inst.mcx
                ? (COMMODITIES_FUTURE_INSTRUMENT_LIST.find(function(f){ return f.name === inst.name; }) || {}).instrument_token
                : INSTRUMENT_TOKENS[inst.name];
            if (!token) return { inst: inst, candles: [], err: 'No token' };

            var currDay  = inst.mcx ? _gtbMcxCurrDay()   : _gtbCurrDay();
            var currDayTo = inst.mcx ? _gtbMcxCurrDayTo() : _gtbCurrDayTo();
            var prevDay  = inst.mcx ? _gtbMcxPrevDay()   : null;

            // MCX: fetch intraday + prev-day close in parallel (need prevClose for VIX calc)
            var res, prevClose = null;
            if (inst.mcx && prevDay) {
                var fetches = await Promise.all([
                    getHistoricalDataUsingPromise(token, currDay, currDayTo, interval),
                    getHistoricalDataUsingPromise(token, prevDay, prevDay, 'day'),
                ]);
                res = fetches[0];
                var prevCandles = fetches[1] && fetches[1].data && fetches[1].data.candles;
                if (prevCandles && prevCandles.length) prevClose = parseFloat(prevCandles[0][4]);
            } else {
                res = await getHistoricalDataUsingPromise(token, currDay, currDayTo, interval);
            }

            var rawCandles = (res && res.data && res.data.candles) || [];
            var candles = inst.mcx ? _gtbTrimCandles(rawCandles, currDay) : _gtbTrimCandles(rawCandles);
            done++;
            _gtbChartGridSetStatus(done + ' / ' + total + ' loaded');
            return { inst: inst, candles: candles, prevClose: prevClose, err: null };
        } catch(e) {
            done++;
            _gtbChartGridSetStatus(done + ' / ' + total + ' loaded');
            return { inst: inst, candles: [], prevClose: null, err: e.message };
        }
    }));

    if (!_gtbCGVisible) return;   // closed while loading

    // Wait one animation frame so the grid cells have real dimensions
    await new Promise(function(resolve) { requestAnimationFrame(function() { setTimeout(resolve, 30); }); });

    results.forEach(function(r) {
        var tid = r.inst.name.replace(/\s+/g, '-').replace(/&/g, '-');
        var el = document.getElementById('gtb-cg-chart-' + tid);
        if (!el) return;

        if (r.err || !r.candles.length) {
            el.innerHTML = '<div style="color:var(--gtb-muted,#7d8590);font-size:0.58rem;padding:8px;">'
                + (r.err || 'No data') + '</div>';
            return;
        }

        // Use the same helper as the main panel charts (handles LW v5 API + IST offset)
        var refLines = [];
        var _levelMeta = [
            { key:'OPEN', short:'O',  color:'#ffbe0b' },
            { key:'VIXU', short:'V↑', color:'#38bdf8' },
            { key:'VIXL', short:'V↓', color:'#38bdf8' },
            { key:'AST',  short:'A+', color:'#3fb950' },
            { key:'ASO',  short:'A',  color:'#3fb950' },
            { key:'BSO',  short:'B',  color:'#f85149' },
            { key:'BST',  short:'B-', color:'#f85149' },
        ];
        try {
            if (r.inst.mcx) {
                // Compute strike + VIX levels directly from fetched candles (same logic as showTopChartMCX)
                var mcxOpen = r.candles.length ? parseFloat(r.candles[0][1]) : null;
                var mcxPrevClose = r.prevClose;
                var mcxDiff = (MCX_FUTURE_STRIKE_DIFF[r.inst.name] || '100,100').split(',');
                var mcxS1 = parseFloat(mcxDiff[0]), mcxS2 = parseFloat(mcxDiff[1]);
                if (mcxOpen) {
                    var mcxASO = mcxOpen + mcxS1, mcxAST = mcxASO + mcxS2;
                    var mcxBSO = mcxOpen - mcxS1, mcxBST = mcxBSO - mcxS2;
                    refLines.push({ key: 'OPEN', value: mcxOpen,  text: 'OPEN ' + mcxOpen.toFixed(2) });
                    refLines.push({ key: 'AST',  value: mcxAST,   text: 'AST '  + mcxAST.toFixed(2) });
                    refLines.push({ key: 'ASO',  value: mcxASO,   text: 'ASO '  + mcxASO.toFixed(2) });
                    refLines.push({ key: 'BSO',  value: mcxBSO,   text: 'BSO '  + mcxBSO.toFixed(2) });
                    refLines.push({ key: 'BST',  value: mcxBST,   text: 'BST '  + mcxBST.toFixed(2) });
                }
                if (mcxPrevClose) {
                    // VIX index per commodity: CRUDEOILM → OVX, others fall back to India VIX
                    var mcxVix = (r.inst.name === 'CRUDEOILM' || r.inst.name === 'CRUDEOIL') ? parseFloat(OVX)
                               : (r.inst.name === 'GOLDM'    || r.inst.name === 'GOLD')      ? parseFloat(GVZ)
                               : (r.inst.name === 'SILVERM'  || r.inst.name === 'SILVER')    ? parseFloat(VXSLV)
                               : (r.inst.name === 'USDINR')                                  ? 4.85
                               : parseFloat(VIX);
                    var mcxVixChg  = mcxVix / Math.sqrt(246);
                    var mcxVixRng  = mcxPrevClose * mcxVixChg / 100;
                    var mcxVIXU    = mcxPrevClose + mcxVixRng;
                    var mcxVIXL    = mcxPrevClose - mcxVixRng;
                    refLines.push({ key: 'VIXU', value: mcxVIXU, text: 'VIXU ' + mcxVIXU.toFixed(2) });
                    refLines.push({ key: 'VIXL', value: mcxVIXL, text: 'VIXL ' + mcxVIXL.toFixed(2) });
                }
            } else {
                var sd = generateTrend(r.inst.name);
                if (sd) {
                    if (sd.open)                     refLines.push({ key: 'OPEN', value: +sd.open,                        text: 'OPEN ' + sd.open });
                    if (sd.vix && sd.vix.vixDDUpper) refLines.push({ key: 'VIXU', value: +sd.vix.vixDDUpper,             text: 'VIXU ' + sd.vix.vixDDUpper });
                    if (sd.vix && sd.vix.vixDDLower) refLines.push({ key: 'VIXL', value: +sd.vix.vixDDLower,             text: 'VIXL ' + sd.vix.vixDDLower });
                    if (sd.strikeData) {
                        refLines.push({ key: 'AST', value: +sd.strikeData.ustrikeTwo, text: 'AST ' + sd.strikeData.ustrikeTwo });
                        refLines.push({ key: 'ASO', value: +sd.strikeData.ustrikeOne, text: 'ASO ' + sd.strikeData.ustrikeOne });
                        refLines.push({ key: 'BSO', value: +sd.strikeData.bstrikeOne, text: 'BSO ' + sd.strikeData.bstrikeOne });
                        refLines.push({ key: 'BST', value: +sd.strikeData.bstrikeTwo, text: 'BST ' + sd.strikeData.bstrikeTwo });
                    }
                }
            }
        } catch(e2) {}

        // Populate the levels strip in the title bar
        var levelsEl = document.getElementById('gtb-cg-levels-' + tid);
        if (levelsEl && refLines.length) {
            var fmt = function(v) {
                v = parseFloat(v);
                return v >= 1000 ? v.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : v.toFixed(1);
            };
            var metaMap = {};
            _levelMeta.forEach(function(m) { metaMap[m.key] = m; });
            levelsEl.innerHTML = refLines.map(function(rl) {
                var m = metaMap[rl.key] || { short: rl.key, color: '#7d8590' };
                return '<span style="display:inline-flex;align-items:center;gap:1px;white-space:nowrap;">'
                    + '<span style="font-size:0.44rem;font-weight:700;color:' + m.color + ';letter-spacing:0.02em;">' + m.short + '</span>'
                    + '<span style="font-size:0.44rem;color:var(--gtb-muted,#7d8590);">' + fmt(rl.value) + '</span>'
                    + '</span>';
            }).join('<span style="color:#30363d;font-size:0.4rem;"> · </span>');
        }

        _renderLWChart('gtb-cg-chart-' + tid, r.candles, refLines, null, { hideLegend: true });
        var lw = el._lwChart;
        if (lw) {
            _gtbChartGridCharts[r.inst.name] = lw;
            // Fit and resize to actual cell dimensions
            requestAnimationFrame(function() {
                var w = el.clientWidth, h = el.clientHeight;
                if (w > 0 && h > 0) { try { lw.resize(w, h); lw.timeScale().fitContent(); } catch(e3) {} }
            });
        }
    });

    _gtbChartGridSetStatus('');
}

jQ(document).on('click', '#show-chartgrid', function(e) {
    e.preventDefault();
    _gtbChartGridOpen();
});
jQ(document).on('click', '#gtb-chartgrid-close', function() { _gtbChartGridClose(); });
jQ(document).on('click', '#gtb-chartgrid-refresh', function() { _gtbChartGridLoad(); });
jQ(document).on('change', '#gtb-chartgrid-interval', function() { if (_gtbCGVisible) _gtbChartGridLoad(); });
// Escape key closes the grid
jQ(document).on('keydown', function(e) {
    if (e.key === 'Escape' && _gtbCGVisible) { _gtbChartGridClose(); }
});
// Resize LW charts when overlay is visible
jQ(window).on('resize', function() {
    if (!_gtbCGVisible) return;
    Object.keys(_gtbChartGridCharts).forEach(function(k) {
        var tid = k.replace(/\s+/g, '-').replace(/&/g, '-');
        var el = document.getElementById('gtb-cg-chart-' + tid);
        if (el && _gtbChartGridCharts[k]) {
            try { _gtbChartGridCharts[k].resize(el.clientWidth, el.clientHeight); } catch(e) {}
        }
    });
});

jQ(document).on('click', '.maximize-component-btn', function() {
    let name = jQ(this).attr('data-name');
    let type = jQ(this).attr('data-type');
    maximizeComponent(name, type);
});

var _gtbMaxRefreshFn = null;   // callback set by each maximize caller

function showMaximizeOverlay(title, bodyHtml, refreshFn) {
    jQ('#groot-maximize-title').html(title);
    jQ('#groot-maximize-body').html(bodyHtml);
    _gtbMaxRefreshFn = refreshFn || null;
    jQ('#groot-maximize-refresh').css('display', refreshFn ? 'flex' : 'none');
    // Match the current dashboard theme (overlay lives on <body>, not inside the container)
    var isLight = jQ('#main-trade-bot-container').hasClass('gtb-light');
    jQ('#groot-maximize-overlay').toggleClass('gtb-light', isLight).addClass('active');
}

function maximizeComponent(name, type) {
    if (type === 'oi')      maximizeOI(name);
    else if (type === 'chart')   maximizeChart(name);
    else if (type === 'futures') maximizeFutures(name);
}

function maximizeOI(name) {
    let tempName = name.replaceAll(' ', '-').replaceAll('&', '-');
    let oiData = INSTRUMENT_SCORE_MAP[name] && INSTRUMENT_SCORE_MAP[name].oiData;
    if (!oiData || !oiData.tableData || oiData.tableData.length === 0) {
        alert('OI data not loaded yet. Please wait for the scan to complete.');
        return;
    }
    function _renderOI() {
        let freshData = (INSTRUMENT_SCORE_MAP[name] && INSTRUMENT_SCORE_MAP[name].oiData) || oiData;
        let body = '';
        body += '<div id="max-' + tempName + '-oi" style="width:100%;"></div>';
        body += '<div id="max-' + tempName + '-oi-signal-row" style="padding:4px 0;"></div>';
        body += '<div id="max-' + tempName + '-obv" style="width:100%;"></div>';
        body += '<div id="max-' + tempName + '-oi-table" style="margin-top:8px;overflow-x:auto;"></div>';
        jQ('#groot-maximize-body').html(body);
        setTimeout(function() { renderOIOBVMaximized(name, tempName, freshData); }, 80);
    }
    async function _refreshOI() {
        try {
            await showPrictionProbabilty(name);
            showOIOBVBarChart(name);
        } catch(e) { console.log('OI refresh error', e); }
        _renderOI();
    }
    let body = '';
    body += '<div id="max-' + tempName + '-oi" style="width:100%;"></div>';
    body += '<div id="max-' + tempName + '-oi-signal-row" style="padding:4px 0;"></div>';
    body += '<div id="max-' + tempName + '-obv" style="width:100%;"></div>';
    body += '<div id="max-' + tempName + '-oi-table" style="margin-top:8px;overflow-x:auto;"></div>';
    showMaximizeOverlay(name + ' — OI / OBV', body, _refreshOI);

    // Re-render charts into the maximized divs using cached data
    setTimeout(function() { renderOIOBVMaximized(name, tempName, oiData); }, 80);
}

function renderOIOBVMaximized(name, tempName, oiData) {
    let priceChange = 0;
    try { priceChange = parseFloat(generateTrend(name).change) || 0; } catch(e) {
        if (INSTRUMENT_SCORE_MAP[name] && stock[0] && stock[0]['LTP'] && stock[0]['OPEN']) {
            let l = parseFloat(stock[0]['LTP']), o = parseFloat(stock[0]['OPEN']);
            priceChange = o > 0 ? (l - o) / o * 100 : 0;
        }
    }

    let x = ['x'], oiCECH = ['CH CE OI'], oiPECH = ['CH PE OI'];
    let oiCEOBV = ['CE OBV'], oiPEOBV = ['PE OBV'];
    let atmIndex = -1, strikeSignals = [];

    jQ.each(oiData.tableData, function(index, item) {
        x.push(item['STRIKE']);
        oiCECH.push(item['CHG_OI_CE']);
        oiPECH.push(item['CHG_OI_PE']);
        let ceObvList = item['CE_OBV'], peObvList = item['PE_OBV'];
        oiCEOBV.push(parseFloat(ceObvList[ceObvList.length-1]['obv']).toFixed(1));
        oiPEOBV.push(parseFloat(peObvList[peObvList.length-1]['obv']).toFixed(1));
        if (item['ATM_STRIKE']) atmIndex = index;
        let result = scoreOIStrikeForSignal(item, !!item['ATM_STRIKE'], priceChange);
        let s = result.score, color;
        if (s >= 2) color = '#28a745'; else if (s <= -2) color = '#dc3545'; else if (s > 0) color = '#85c785'; else if (s < 0) color = '#e08080'; else color = '#6c757d';
        let ceLabelColor = (result.ceLabel === 'CE WRITE' || result.ceLabel === 'CE UNWIND') ? '#dc3545' : (result.ceLabel === 'CE BUY' || result.ceLabel === 'CE COV') ? '#28a745' : '#6c757d';
        let peLabelColor = (result.peLabel === 'PE WRITE' || result.peLabel === 'PE UNWIND') ? '#28a745' : (result.peLabel === 'PE BUY' || result.peLabel === 'PE COV') ? '#dc3545' : '#6c757d';
        strikeSignals.push({ strike: item['STRIKE'], score: s, color: color, ceLabel: result.ceLabel, peLabel: result.peLabel, ceLabelColor: ceLabelColor, peLabelColor: peLabelColor, isATM: !!item['ATM_STRIKE'] });
    });

    let strikes = x.slice(1);
    _renderBarChart('#max-' + tempName + '-oi', {
        labels: strikes,
        series: [
            { label: 'CH CE OI', color: OI_COLORS.CE_OI, values: oiCECH.slice(1) },
            { label: 'CH PE OI', color: OI_COLORS.PE_OI, values: oiPECH.slice(1) },
        ],
        atm: atmIndex, height: 280,
    });
    _renderBarChart('#max-' + tempName + '-obv', {
        labels: strikes,
        series: [
            { label: 'CE OBV', color: OI_COLORS.CE_OBV, values: oiCEOBV.slice(1) },
            { label: 'PE OBV', color: OI_COLORS.PE_OBV, values: oiPEOBV.slice(1) },
        ],
        atm: atmIndex, height: 280,
    });

    // Signal row
    let srHtml = '<div style="display:flex;gap:3px;flex-wrap:nowrap;overflow-x:auto;padding:4px 0;">';
    for (let i = 0; i < strikeSignals.length; i++) {
        let s = strikeSignals[i];
        let border = s.isATM ? '2px solid #fbbf24' : '1px solid #30363d';
        let strikeColor = s.isATM ? '#fbbf24' : '#e6edf3';
        let ceLabelColor = (s.ceLabelColor === '#28a745' || s.ceLabelColor === '#85c785') ? '#3fb950' : (s.ceLabelColor === '#dc3545' || s.ceLabelColor === '#e08080') ? '#f85149' : '#7d8590';
        let peLabelColor = (s.peLabelColor === '#28a745' || s.peLabelColor === '#85c785') ? '#3fb950' : (s.peLabelColor === '#dc3545' || s.peLabelColor === '#e08080') ? '#f85149' : '#7d8590';
        let scoreColor = s.score > 0 ? '#3fb950' : s.score < 0 ? '#f85149' : '#7d8590';
        srHtml += '<div style="flex:1;min-width:80px;text-align:center;border:' + border + ';border-radius:5px;padding:5px 3px;background:#161b22;">';
        srHtml += '<div style="font-size:0.7rem;color:' + strikeColor + ';font-weight:' + (s.isATM ? '900' : '600') + ';">' + s.strike + (s.isATM ? ' ★' : '') + '</div>';
        srHtml += '<div style="font-size:0.68rem;color:' + ceLabelColor + ';">' + s.ceLabel + '</div>';
        srHtml += '<div style="font-size:0.68rem;color:' + peLabelColor + ';">' + s.peLabel + '</div>';
        srHtml += '<div style="font-size:0.7rem;color:' + scoreColor + ';font-weight:700;">' + (s.score > 0 ? '+' : '') + parseFloat(s.score).toFixed(2) + '</div>';
        srHtml += '</div>';
    }
    srHtml += '</div>';
    jQ('#max-' + tempName + '-oi-signal-row').html(srHtml);

    // Full OI table with IV — render into maximize body
    // Try main panel source first; fall back to re-rendering from oiData
    let mainTable = jQ('#' + tempName + '-component-oi-list-table');
    if (mainTable.length && mainTable.html() && mainTable.html().trim().length > 20) {
        jQ('#max-' + tempName + '-oi-table').html(mainTable.html());
    } else {
        // Stock viewer path: render directly into the max div
        var _origTarget = jQ('<div id="' + tempName + '-component-oi-list-table" style="display:none;"></div>').appendTo('body');
        try {
            if (stock[0] && stock[0]['DATA']) showComponentOITable(name, '');
            jQ('#max-' + tempName + '-oi-table').html(_origTarget.html());
        } catch(e) {}
        _origTarget.remove();
    }
}

async function maximizeChart(name) {
    let tempName = name.replaceAll(' ', '-').replaceAll('&', '-');
    let isMCX = (name === 'CRUDEOILM' || name === 'USDINR');

    function _buildBody() {
        let b = '';
        b += '<div id="max-' + tempName + '-chart" style="width:100%;min-width:0;height:520px;border-radius:8px;overflow:hidden;display:block;"></div>';
        b += '<div id="max-' + tempName + '-atr-sl" style="margin-top:8px;"></div>';
        return b;
    }

    async function _loadChart(delay) {
        return new Promise(function(resolve) {
            setTimeout(async function() {
                try {
                    let pane       = jQ('#gtb-pane-' + tempName);
                    let origAtrEl  = jQ('#' + tempName + '-atr-sl').detach();
                    let origChartEl = null;

                    jQ('#max-' + tempName + '-atr-sl').attr('id', tempName + '-atr-sl');

                    let maxChartEl;
                    if (isMCX) {
                        origChartEl = jQ('#' + tempName + '-chart').detach();
                        jQ('#max-' + tempName + '-chart').attr('id', tempName + '-chart');
                        await showTopChartMCX(name, 520);
                        maxChartEl = document.getElementById(tempName + '-chart');
                        jQ('#' + tempName + '-chart').attr('id', 'max-' + tempName + '-chart');
                    } else {
                        await showTopChart(name, '#max-' + tempName + '-chart', 520);
                        maxChartEl = document.getElementById('max-' + tempName + '-chart');
                    }

                    jQ('#' + tempName + '-atr-sl').attr('id', 'max-' + tempName + '-atr-sl');

                    if (origChartEl && origChartEl.length) {
                        pane.find('.gtb-grid-card-header').first().after(origChartEl);
                    }
                    if (origAtrEl.length) {
                        let chartArea = pane.find('.gtb-chart-area').first();
                        if (chartArea.length) chartArea.after(origAtrEl);
                    }

                    if (maxChartEl && maxChartEl._lwChart) {
                        requestAnimationFrame(function() {
                            let panel = document.getElementById('groot-maximize-panel');
                            let w = maxChartEl.clientWidth || (panel ? panel.clientWidth - 32 : 800);
                            maxChartEl._lwChart.resize(w, 520);
                            maxChartEl._lwChart.timeScale().fitContent();
                        });
                    }
                } catch(e) {
                    jQ('#max-' + tempName + '-chart').html('<div style="color:#7d8590;padding:20px;">Chart unavailable: ' + e.message + '</div>');
                }
                resolve();
            }, delay || 0);
        });
    }

    async function _refreshChart() {
        jQ('#groot-maximize-body').html(_buildBody());
        await _loadChart(80);
    }

    showMaximizeOverlay('<i class="bi bi-candlestick"></i> ' + name + ' — Candlestick Chart', _buildBody(), _refreshChart);
    await _loadChart(220);
}

function maximizeFutures(name) {
    let tempName = name.replaceAll(' ', '-').replaceAll('&', '-');

    function _buildFuturesBody() {
        let html = jQ('#' + tempName + '-futures-trend').html() || '';
        let vwap = jQ('#' + tempName + '-futures-vwap').html() || '';
        let prem = jQ('#' + tempName + '-futures-premium').html() || '';
        let b = '';
        b += '<div style="font-size:0.9rem;padding:4px 0 8px;">' + prem + '</div>';
        b += '<div style="margin-bottom:8px;">' + vwap + '</div>';
        b += '<div style="font-size:1rem;">' + html + '</div>';
        return b;
    }

    async function _refreshFutures() {
        try {
            let res = name === 'CRUDEOILM' || name === 'USDINR'
                ? await showFutureDetailsMCX(name)
                : await showFutureDetails(name);
            if (res) setFutureDetails(name, res);
        } catch(e) { console.log('futures refresh error', e); }
        jQ('#groot-maximize-body').html(_buildFuturesBody());
    }

    showMaximizeOverlay(name + ' — Futures', _buildFuturesBody(), _refreshFutures);
}
// ── End maximize overlay ─────────────────────────────────────────────────────

jQ(document).on("click", "#show-groot-trade-bot", function (e) {
    e.preventDefault();
    showGrootTradeBot();
});


async function showGrootTradeBot() {
    let html = '<div id="main-trade-bot-container"></div>';

    showPopUpWindow('groot-trade-bot', html, 'Groot', 950, 550);
    let divId = 'popup-custom-style-groot-trade-bot';
    jQ('.' + divId).find('.popupwindow_titlebar_button_maximize').trigger('click');

    // Hide the popup title bar and status bar — the new #gtb-topbar replaces both
    jQ('.' + divId).find('.popupwindow_titlebar').hide();
    jQ('.' + divId).find('.popupwindow_statusbar').hide();

    // Make the content fill 100% with no top gap
    jQ('.' + divId).find('.popupwindow_content').css({ top: '0', bottom: '0' });

    showCompoenentPlaceHolders();
}

jQ(document).on("click", "#data-load", function () {
    let html = '';
    html += '<div class="gtb-ds-panel">';

    // ── Trading Days section ────────────────────────────────────────────────
    html += '<div class="gtb-ds-section">';
    html += '<div class="gtb-ds-section-title"><i class="bi bi-calendar3"></i> Trading Days</div>';
    html += '<div class="gtb-ds-row">';
    html += '  <span class="gtb-ds-label">Previous Day</span>';
    html += '  <span class="sv-badge sv-badge-blue">' + PREVIOUS_DAY + '</span>';
    html += '</div>';
    html += '<div class="gtb-ds-row">';
    html += '  <span class="gtb-ds-label">Current Day</span>';
    html += '  <span class="sv-badge sv-badge-blue">' + CURRENT_DAY + '</span>';
    html += '</div>';
    html += '</div>';

    // ── Data Controls section ───────────────────────────────────────────────
    html += '<div class="gtb-ds-section">';
    html += '<div class="gtb-ds-section-title"><i class="bi bi-gear"></i> Data Controls</div>';
    html += '<div class="gtb-ds-actions">';
    html += '  <button id="clean-storage"  class="gtb-ds-btn gtb-ds-btn-danger"><i class="bi bi-trash3"></i> Clear Storage</button>';
    html += '  <button id="load-price"     class="gtb-ds-btn gtb-ds-btn-primary"><i class="bi bi-cloud-download"></i> Load Prices</button>';
    html += '  <button id="nine-fifteen-scan" class="gtb-ds-btn gtb-ds-btn-success"><i class="bi bi-clock-history"></i> 9:15 SCAN</button>';
    html += '  <button id="add-to-watch-list" class="gtb-ds-btn gtb-ds-btn-muted"><i class="bi bi-bookmark-plus"></i> Add Watchlist</button>';
    html += '</div>';
    html += '</div>';

    // ── External Links section ──────────────────────────────────────────────
    html += '<div class="gtb-ds-section">';
    html += '<div class="gtb-ds-section-title"><i class="bi bi-link-45deg"></i> External Links</div>';
    html += '<div class="gtb-ds-links">';
    html += '  <a class="gtb-ds-link" target="_blank" href="https://tradingeconomics.com/stocks"><i class="bi bi-globe2"></i> World Markets</a>';
    html += '  <a class="gtb-ds-link" target="_blank" href="https://in.investing.com/indices/cboe-crude-oil-volatility-historical-data"><i class="bi bi-droplet-fill"></i> OVX</a>';
    html += '  <a class="gtb-ds-link" target="_blank" href="https://www.investing.com/indices/cboe-gold-volatitity"><i class="bi bi-stars"></i> GVZ</a>';
    html += '  <a class="gtb-ds-link" target="_blank" href="https://in.investing.com/indices/volatility-s-p-500"><i class="bi bi-activity"></i> VIX</a>';
    html += '  <a class="gtb-ds-link" target="_blank" href="https://docs.google.com/spreadsheets/d/1mJyXOLNqSqIuDIiB1ip9-0kpNGU0pl_o/edit?gid=20807039#gid=20807039"><i class="bi bi-file-earmark-spreadsheet"></i> Past Analysis</a>';
    html += '</div>';
    html += '</div>';

    html += '</div>'; // gtb-ds-panel

    showPopUpWindow('data-settings', html, 'Data Settings', 380, 320);
    var divId = "popup-custom-style-data-settings";
    var dsTitle = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<span style="font-weight:800;font-size:0.7rem;white-space:nowrap;"><i class="bi bi-sliders"></i> DATA SETTINGS</span>'
        + popupWinControls(divId)
        + '</div>';
    jQ("." + divId).find(".popupwindow_titlebar_text").html(dsTitle);
    hideNativePopupButtons(divId);
});


GM_registerMenuCommand("Create AT ", function () {
    window.open("https://kite.zerodha.com/connect/login?v=3&api_key=" + g_config.get('api_key'), "_self");
}, "r");

jQ(document).on('click', '#nine-fifteen-scan', function (e) {
    scanNineFifteenCandle()
});

// ── 9:15 Candle Breakout Scanner ──────────────────────────────────────────────
// Scans every instrument in INSTRUMENT_TOKENS and records where the FIRST 5-min
// candle of the day (9:15–9:20) CLOSED relative to the open-day strike levels.
//
// Classification stored in VALID_BREAKOUT_NINE_FIFTEEN[name]['CLOSE_9_15']:
//   AST — closed above AST (strong bullish gap/open)
//   ASO — closed above ASO (mild bullish open)
//   BSO — closed below BSO (mild bearish open)
//   BST — closed below BST (strong bearish open)
//   B/W — between strikes (neutral, wait)
//
// Runs ONLY if VALID_BREAKOUT_NINE_FIFTEEN is not already cached in localStorage.
// This means it runs once per session (typically at market open after 9:15).
// Results feed into ALL_9_15_CLOSE_SCORE and per-index 9:15 scores.
async function scanNineFifteenCandle() {
    let scriptData = generateTrends()
    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));
    if (!breakOutNineFifteen) {
        breakOutNineFifteen = {}
        let instru = [];
        let checkInstr = []
        jQ.each(INSTRUMENT_TOKENS, function (index, item) {
            if (jQ.inArray(index, checkInstr) === -1) {
                instru.push(index)
                checkInstr.push(index)
            }
        });


        for (let i = 0; i < instru.length; i++) {
            let name = instru[i];
            _gtbProgress('Charts: ' + name + ' (' + (i+1) + '/' + instru.length + ')');
            try {
                let historical = await getHistoricalDataUsingPromise(INSTRUMENT_TOKENS[name], _gtbCurrDay(), _gtbCurrDayTo(), '5minute');
                let firstCandleClose = historical.data.candles[0][4]
                let astPrice = parseFloat(scriptData[name]['strikeData']['ustrikeTwo']);
                let asoPrice = parseFloat(scriptData[name]['strikeData']['ustrikeOne']);
                let bsoPrice = parseFloat(scriptData[name]['strikeData']['bstrikeOne']);
                let bstPrice = parseFloat(scriptData[name]['strikeData']['bstrikeTwo']);

                breakOutNineFifteen[name] = {};
                if (firstCandleClose > astPrice) {
                    breakOutNineFifteen[name]['CLOSE_9_15'] = 'AST';
                } else if (firstCandleClose > asoPrice) {
                    breakOutNineFifteen[name]['CLOSE_9_15'] = 'ASO';
                } else if (firstCandleClose < bstPrice) {
                    breakOutNineFifteen[name]['CLOSE_9_15'] = 'BST';
                } else if (firstCandleClose < bsoPrice) {
                    breakOutNineFifteen[name]['CLOSE_9_15'] = 'BSO';
                } else {
                    breakOutNineFifteen[name]['CLOSE_9_15'] = 'B/W';
                }
            } catch (e) {
                console.log(e)
            }
        }
        localStorage.setItem("VALID_BREAKOUT_NINE_FIFTEEN", JSON.stringify(breakOutNineFifteen));
    }
}

function commonMarkupPlaceHolder() {
    let h = '';
    // Info icon — click opens a styled popover explaining the section (see GTB_INFO map)
    function _ii(k) { return ' <i class="bi bi-info-circle gtb-info-i" data-info="' + k + '" title="What does this show?"></i>'; }

    // ── TOP BAR ──────────────────────────────────────────────────────────────
    h += '<div id="gtb-topbar">';
    h += '<span class="gtb-brand"><i class="bi bi-graph-up"></i> GROOT</span>';

    // Ticker placeholders (updated by showTopChart / generateTrend after load)
    let tickers = [
        { id: 'NIFTY-50',   label: 'NIFTY 50' },
        { id: 'NIFTY-BANK', label: 'BANK NIFTY' },
        { id: 'SENSEX',     label: 'SENSEX' },
        { id: 'GIFT-NIFTY', label: 'GIFT NIFTY' },
    ];
    tickers.forEach(function(t) {
        h += '<div class="gtb-ticker" id="gtb-ticker-' + t.id + '">';
        h += '<span class="tk-name">' + t.label + '</span>';
        h += '<span class="tk-ltp" id="gtb-ltp-' + t.id + '">—</span>';
        h += '<span class="tk-chg flat" id="gtb-chg-' + t.id + '">—</span>';
        h += '</div>';
    });
    h += '<div class="gtb-vix-badge"><div class="vix-label"><i class="bi bi-activity"></i> VIX</div><div class="vix-val" id="gtb-vix-val">—</div><div class="vix-chg flat" id="gtb-vix-chg">—</div></div>';

    h += '<div id="gtb-master-badge">';
    h += '<span class="gtb-window-pill closed" id="gtb-window-pill">LOADING</span>';
    h += '<span class="gtb-signal-pill wait" id="gtb-signal-pill"><i class="bi bi-hourglass-split"></i> LOADING</span>';
    h += '</div>';

    // ── Topbar controls (decluttered) ─────────────────────────────────────────
    var _savedHistTime = localStorage.getItem('GTB_HIST_TIME') || '';
    h += '<div class="gtb-topbar-controls">';

    // Primary: timer + refresh button (always visible)
    h += '<span id="refresh-loader" class="loader hide"></span>';
    h += '<span id="refresh-timer-one" class="gtb-timer-badge">00:00</span>';
    h += '<a id="start-auto-refresh" class="gtb-ctrl-link" title="Refresh now"><i class="bi bi-arrow-clockwise"></i> Refresh</a>';
    // Progress pill — shows current step during refresh, hidden at rest
    h += '<span id="gtb-progress-pill" style="visibility:hidden;display:inline-flex;align-items:center;gap:5px;'
       + 'font-size:0.6rem;color:#c9d1d9;background:#1f2937;border:1px solid #3b82f633;'
       + 'border-radius:10px;padding:2px 8px;width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;">'
       + '<span style="width:6px;height:6px;border-radius:50%;background:#3b82f6;flex-shrink:0;'
       + 'animation:gtb-pulse 1s ease-in-out infinite;" id="gtb-progress-dot"></span>'
       + '<span id="gtb-progress-text"></span>'
       + '</span>';

    // Time picker (compact, always visible — core feature)
    h += '<input type="time" id="gtb-hist-time" value="' + _savedHistTime + '" min="09:15" max="15:30" '
       + 'style="font-size:0.6rem;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;'
       + 'border-radius:4px;padding:2px 4px;cursor:pointer;width:76px;" title="Snapshot end time — empty = live">';

    // Tool launchers as icon-only buttons
    h += '<a id="show-915-backtest" class="gtb-ctrl-link" title="9:15 Trend — 1-year day-wise backtest (NIFTY/SENSEX/BANK)"><i class="bi bi-calendar-week"></i></a>';
    h += '<a id="show-all-oi" class="gtb-ctrl-link" title="OI Scan — all instruments incl. weighted constituents"><i class="bi bi-layers-fill"></i></a>';
    h += '<a id="show-fut-accuracy" class="gtb-ctrl-link" title="Futures remark accuracy (5-min reconstruction)"><i class="bi bi-bullseye"></i></a>';
    h += '<a id="show-futures-signal" class="gtb-ctrl-link" title="Futures signal — any instrument (NSE stocks / index / MCX)"><i class="bi bi-flag-fill"></i></a>';
    h += '<a id="show-commodities" class="gtb-ctrl-link" title="Commodities — GIFT NIFTY &amp; Crude (chart, OI, futures)"><i class="bi bi-droplet-fill"></i></a>';
    h += '<a id="show-oi-viewer" class="gtb-ctrl-link" title="OI Analyzer"><i class="bi bi-eye"></i></a>';
    h += '<a id="show-stock-viewer" class="gtb-ctrl-link" title="Stock Viewer"><i class="bi bi-list-ul"></i></a>';
    h += '<a id="show-market-quote-analyzer" class="gtb-ctrl-link" title="Quotes"><i class="bi bi-graph-up"></i></a>';
    h += '<a id="show-help" class="gtb-ctrl-link" title="Help"><i class="bi bi-question-circle-fill"></i></a>';

    // ⚙ Settings dropdown — secondary options
    h += '<div class="gtb-settings-wrap" style="position:relative;display:inline-block;">';
    h += '<a class="gtb-ctrl-link" id="gtb-settings-toggle" title="Settings"><i class="bi bi-gear-fill"></i></a>';
    h += '<div id="gtb-settings-menu" style="display:none;position:absolute;right:0;top:100%;margin-top:4px;'
       + 'background:#161b22;border:1px solid #30363d;border-radius:6px;padding:8px 10px;z-index:9999;'
       + 'min-width:190px;box-shadow:0 4px 16px #000a;">';

    h += '<div style="font-size:0.6rem;color:#7d8590;margin-bottom:6px;font-weight:600;letter-spacing:.04em;">SETTINGS</div>';

    // Auto-refresh
    h += '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.62rem;color:#c9d1d9;padding:3px 0;">'
       + '<input type="checkbox" id="enable-auto-refresh" style="cursor:pointer;">'
       + '<span>Auto-refresh</span></label>';

    // Weighted only
    h += '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.62rem;color:#c9d1d9;padding:3px 0;" '
       + 'title="Scan only weighted Nifty 50 + Bank Nifty stocks">'
       + '<input type="checkbox" id="scan-weighted-only" style="cursor:pointer;"'
       + (localStorage.getItem('GTB_SCAN_WEIGHTED') === '1' ? ' checked' : '') + '>'
       + '<span>Weighted only</span></label>';

    // Data settings
    h += '<div style="margin-top:4px;">';
    h += '<a id="data-load" class="gtb-ctrl-link" style="font-size:0.62rem;"><i class="bi bi-sliders"></i> Data settings</a>';
    h += '</div>';


    // Theme toggle (dark / light)
    var _savedTheme = localStorage.getItem('GTB_THEME') || 'dark';
    h += '<div style="margin-top:4px;padding-top:6px;border-top:1px solid #ffffff10;">';
    h += '<div style="font-size:0.6rem;color:#7d8590;margin-bottom:4px;font-weight:600;">THEME</div>';
    h += '<div style="display:flex;gap:4px;">';
    h += '<button class="gtb-theme-btn" data-theme="dark" style="flex:1;padding:3px 0;font-size:0.6rem;border:1px solid #30363d;cursor:pointer;background:' + (_savedTheme==='dark'?'#00b4d8':'transparent') + ';color:' + (_savedTheme==='dark'?'#fff':'#7d8590') + ';"><i class="bi bi-moon-stars-fill"></i> Dark</button>';
    h += '<button class="gtb-theme-btn" data-theme="light" style="flex:1;padding:3px 0;font-size:0.6rem;border:1px solid #30363d;cursor:pointer;background:' + (_savedTheme==='light'?'#00b4d8':'transparent') + ';color:' + (_savedTheme==='light'?'#fff':'#7d8590') + ';"><i class="bi bi-sun-fill"></i> Light</button>';
    h += '</div></div>';

    // Row height + column width sliders
    var _savedRowH = parseInt(localStorage.getItem('GTB_ROW_H') || '190');
    h += '<div style="margin-top:4px;">';
    h += '<div style="font-size:0.6rem;color:#7d8590;margin-bottom:4px;font-weight:600;">ROW HEIGHT <span id="gtb-grid-h-val">' + _savedRowH + '</span>px</div>';
    h += '<input type="range" id="gtb-grid-h-slider" min="120" max="320" step="10" value="' + _savedRowH + '" style="width:100%;cursor:pointer;accent-color:#00b4d8;">';
    h += '</div>';

    // Column width sliders (each sets a CSS var on the container)
    var _colDefs = [
        { key:'chart',  label:'CHART',      min:140, max:600, step:10, def:260 },
        { key:'fut',    label:'FUTURES',    min:120, max:400, step:10, def:190 },
        { key:'oi',     label:'OI MATRIX',  min:120, max:400, step:10, def:210 },
        { key:'oiobv',  label:'OI / OBV',   min:160, max:500, step:10, def:280 },
        { key:'wt',     label:'WEIGHTAGE',  min:100, max:300, step:10, def:170 },
        { key:'detail', label:'DETAILS',    min: 80, max:280, step:10, def:130 },
    ];
    h += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #ffffff10;">';
    h += '<div style="font-size:0.6rem;color:#7d8590;margin-bottom:4px;font-weight:600;letter-spacing:0.08em;">COLUMN WIDTHS</div>';
    _colDefs.forEach(function(c) {
        var saved = parseInt(localStorage.getItem('GTB_COL_' + c.key.toUpperCase()) || c.def);
        h += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">';
        h += '<span style="font-size:0.46rem;color:#7d8590;min-width:52px;font-weight:700;">' + c.label + '</span>';
        h += '<input type="range" class="gtb-col-slider" data-col="' + c.key + '" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '" value="' + saved + '" style="flex:1;cursor:pointer;accent-color:#00b4d8;">';
        h += '<span class="gtb-col-val" data-col="' + c.key + '" style="font-size:0.46rem;color:#7d8590;min-width:26px;text-align:right;">' + saved + '</span>';
        h += '</div>';
    });
    h += '</div>';

    // OI/OBV bar width
    var _savedBarW = parseInt(localStorage.getItem('GTB_OI_BAR_W') || '60');
    h += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #ffffff10;">';
    h += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">';
    h += '<span style="font-size:0.46rem;color:#7d8590;min-width:52px;font-weight:700;">OI BAR WIDTH</span>';
    h += '<input type="range" id="gtb-oi-bar-slider" min="20" max="100" step="5" value="' + _savedBarW + '" style="flex:1;cursor:pointer;accent-color:#00b4d8;">';
    h += '<span id="gtb-oi-bar-val" style="font-size:0.46rem;color:#7d8590;min-width:26px;text-align:right;">' + _savedBarW + '%</span>';
    h += '</div></div>';

    // Last refresh time
    h += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #ffffff10;">';
    h += '<span id="last-refresh-time" style="font-size:0.58rem;color:#7d8590;">—</span>';
    h += '</div>';

    h += '</div>'; // end settings menu
    h += '</div>'; // end settings wrap

    // Window controls — inside topbar-controls so they're always visible at right edge
    h += '<div class="gtb-win-controls">';
    h += '<button class="gtb-win-btn gtb-win-minimize" title="Minimize"><i class="bi bi-dash"></i></button>';
    h += '<button class="gtb-win-btn gtb-win-restore" title="Restore / Maximize"><i class="bi bi-fullscreen"></i></button>';
    h += '<button class="gtb-win-btn gtb-win-close" title="Close"><i class="bi bi-x-lg"></i></button>';
    h += '</div>';

    h += '</div>'; // end gtb-topbar-controls

    h += '</div>'; // end topbar

    h += '<div id="gtb-main">';

    // ── Instrument icon map ───────────────────────────────────────────────────
    var instrIcons = {
        'NIFTY 50':   'bi-graph-up', 'NIFTY BANK': 'bi-bank2',
        'GIFT NIFTY': 'bi-globe-asia-australia', 'SENSEX': 'bi-globe2',
        'CRUDEOILM':  'bi-droplet-fill',   'USDINR': 'bi-currency-exchange',
        'RELIANCE': 'bi-fuel-pump', 'HDFCBANK': 'bi-building', 'ICICIBANK': 'bi-credit-card'
    };

    // ════════════════════════════════════════════════════════════════
    // LEFT PANEL — Score, Signal, Pillars, Entry, History
    // ════════════════════════════════════════════════════════════════
    h += '<div id="gtb-left">';

    // Score gauge
    h += '<div class="gtb-card gtb-widget" id="gtb-score-gauge">';
    h += '<div class="gtb-card-header"><span class="gtb-card-title"><i class="bi bi-speedometer2"></i> SCORE' + _ii('score') + '</span>';
    h += '<button class="sv-icon-btn show-notes" title="Trading notes"><i class="bi bi-journal-text"></i></button></div>';
    h += '<div class="gtb-card-body gtb-widget-body" style="height:120px;">';
    h += '<div id="trend-scoreboard" style="height:110px;"></div>';
    h += '<div id="score-board-number" style="text-align:center;margin-top:-4px;"></div>';
    h += '</div>';
    h += '<div style="display:flex;flex-direction:column;gap:2px;padding:4px 8px 5px;border-top:1px solid #ffffff10;">';
    h += '<div id="gtb-adr-n50" style="font-size:0.58rem;color:#7d8590;">N50 A/D —</div>';
    h += '<div id="gtb-adr-bn"  style="font-size:0.58rem;color:#7d8590;">BN A/D —</div>';
    h += '</div></div>';

    // Signal + outcome
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header"><span class="gtb-card-title"><i class="bi bi-lightning-charge"></i> SIGNAL' + _ii('signal') + '</span></div>';
    h += '<div class="gtb-card-body gtb-widget-body" style="height:120px;overflow-y:auto;">';
    h += '<div id="market-final-signal"></div>';
    h += '<div id="trend-scoreboard-outcome" style="margin-top:4px;"></div>';
    h += '</div></div>';

    // Range Scoreboard
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header"><span class="gtb-card-title"><i class="bi bi-bar-chart-line-fill"></i> RANGE SCOREBOARD' + _ii('rangesb') + '</span></div>';
    h += '<div class="gtb-card-body gtb-widget-body" id="gtb-range-sb" style="padding:6px 8px;"></div>';
    h += '</div>';

    // Entry / Trade
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header"><span class="gtb-card-title"><i class="bi bi-crosshair"></i> ENTRY / TRADE' + _ii('entry') + '</span></div>';
    h += '<div class="gtb-card-body gtb-widget-body" style="height:100px;" id="entry-confluence-panel"></div>';
    h += '</div>';

    // Exit banner
    h += '<div class="gtb-exit-wrap">';
    h += '<div class="gtb-exit-dir-btns">';
    h += '<button class="gtb-dir-btn" data-dir="NONE">—</button>';
    h += '<button class="gtb-dir-btn bull" data-dir="LONG"><i class="bi bi-arrow-up-circle-fill"></i> LONG</button>';
    h += '<button class="gtb-dir-btn bear" data-dir="SHORT"><i class="bi bi-arrow-down-circle-fill"></i> SHORT</button>';
    h += '</div>';
    h += '<div id="gtb-exit-signal" class="gtb-exit-banner hold"><i class="bi bi-door-open"></i> No position set</div>';
    h += '</div>';

    // Pillars (collapsible)
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header gtb-collapse-toggle" data-target="gtb-pillars-body">';
    h += '<span class="gtb-card-title"><i class="bi bi-bar-chart-steps"></i> PILLARS' + _ii('pillars') + '</span>';
    h += '<span class="hdr-actions"><i class="bi bi-chevron-down gtb-caret"></i></span></div>';
    h += '<div id="gtb-pillars-body" class="gtb-collapse-body gtb-widget-body" style="height:200px;overflow-y:auto;">';
    h += '<div style="color:#64748b;font-size:0.6rem;text-align:center;padding:8px;">Refreshing…</div>';
    h += '</div></div>';

    // Top trades (collapsible)
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header gtb-collapse-toggle" data-target="gtb-top-trades-list">';
    h += '<span class="gtb-card-title"><i class="bi bi-stars"></i> TOP TRADES' + _ii('toptrades') + '</span>';
    h += '<span class="hdr-actions"><button class="sv-icon-btn refresh-scoreboard" title="Refresh"><i class="bi bi-arrow-clockwise"></i></button><i class="bi bi-chevron-down gtb-caret"></i></span></div>';
    h += '<div id="gtb-top-trades-list" class="gtb-collapse-body gtb-widget-body" style="height:160px;">';
    h += '<div class="gtb-empty-msg"><i class="bi bi-hourglass-split"></i> Refreshing…</div>';
    h += '</div></div>';

    // Score detail (collapsible)
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header gtb-collapse-toggle" data-target="gtb-score-detail">';
    h += '<span class="gtb-card-title"><i class="bi bi-table"></i> SCORE DETAIL' + _ii('scoredetail') + '</span>';
    h += '<span class="hdr-actions"><i class="bi bi-chevron-down gtb-caret"></i></span></div>';
    h += '<div id="gtb-score-detail" class="gtb-collapse-body gtb-widget-body" style="height:240px;overflow:auto;">';
    h += '<div id="trend-scoreboard-table" style="overflow:auto;"></div>';
    h += '</div></div>';

    // Score history (collapsible)
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header gtb-collapse-toggle" data-target="gtb-score-history">';
    h += '<span class="gtb-card-title"><i class="bi bi-clock-history"></i> SCORE HISTORY' + _ii('scorehistory') + '</span>';
    h += '<span class="hdr-actions"><i class="bi bi-chevron-down gtb-caret"></i></span></div>';
    h += '<div id="gtb-score-history" class="gtb-collapse-body gtb-widget-body" style="height:220px;overflow:auto;">';
    h += '<div id="gtb-score-history-table" style="font-size:0.62rem;color:#7d8590;padding:6px;">Waiting for refresh…</div>';
    h += '</div></div>';

    h += '</div>'; // end #gtb-left

    // ════════════════════════════════════════════════════════════════
    // RIGHT PANEL
    // TOP: 3×3 chart grid — all 9 instruments, fills height, no scroll
    // BOTTOM: detail sections — scrollable
    // ════════════════════════════════════════════════════════════════
    h += '<div id="gtb-right">';

    // All 9 instruments in declaration order (row1: markets, row2: stocks)
    var _allInstruments = [
        { name: 'GIFT NIFTY', mcx: false },
        { name: 'NIFTY 50',   mcx: false },
        { name: 'NIFTY BANK', mcx: false },
        { name: 'SENSEX',     mcx: false },
        { name: 'CRUDEOILM',  mcx: true  },
        { name: 'USDINR',     mcx: true  },
        { name: 'RELIANCE',   mcx: false },
        { name: 'HDFCBANK',   mcx: false },
        { name: 'ICICIBANK',  mcx: false },
    ];

    // ════════════════════════════════════════════════════════════════
    // OVERVIEW BANNER — answers "what is this dashboard telling me?"
    // ════════════════════════════════════════════════════════════════
    h += '<div id="gtb-overview">';

    // 1) Verdict block — big composite verdict + score
    h += '<div class="gtb-ov-block gtb-ov-verdict-block">';
    h +=   '<div class="gtb-ov-cap">MARKET VERDICT' + _ii('verdict') + '</div>';
    h +=   '<div class="gtb-ov-verdict" id="gtb-ov-verdict">—</div>';
    h +=   '<div class="gtb-ov-verdict-sub" id="gtb-ov-verdict-sub">Awaiting data…</div>';
    h += '</div>';

    // 2) Composite score dial
    h += '<div class="gtb-ov-block gtb-ov-score-block">';
    h +=   '<div class="gtb-ov-cap">COMPOSITE SCORE' + _ii('compscore') + '</div>';
    h +=   '<div class="gtb-ov-score" id="gtb-ov-score">—</div>';
    h +=   '<div class="gtb-ov-score-scale" id="gtb-ov-score-scale"><span>-40</span><span>0</span><span>+40</span></div>';
    h += '</div>';

    // 3) Breadth — bullish vs bearish instruments
    h += '<div class="gtb-ov-block gtb-ov-breadth-block">';
    h +=   '<div class="gtb-ov-cap">INSTRUMENT BREADTH' + _ii('breadth') + '</div>';
    h +=   '<div class="gtb-ov-breadth-bar" id="gtb-ov-breadth-bar">';
    h +=     '<div class="gtb-ov-breadth-fill bull" id="gtb-ov-breadth-bull" style="width:50%;"></div>';
    h +=     '<div class="gtb-ov-breadth-fill bear" id="gtb-ov-breadth-bear" style="width:50%;"></div>';
    h +=   '</div>';
    h +=   '<div class="gtb-ov-breadth-legend"><span id="gtb-ov-breadth-bull-n" class="bull">0 ▲</span>'
       +   '<span id="gtb-ov-breadth-bear-n" class="bear">0 ▼</span></div>';
    h += '</div>';

    // 4) 9:15 breakout counts — ASO vs BSO across constituents
    h += '<div class="gtb-ov-block gtb-ov-915-block">';
    h +=   '<div class="gtb-ov-cap">9:15 BREAKOUT' + _ii('ov915') + '</div>';
    h +=   '<div class="gtb-ov-915-row"><span class="gtb-ov-915-lbl">N50</span><span class="gtb-ov-915-val" id="gtb-ov-915-n50">—</span></div>';
    h +=   '<div class="gtb-ov-915-row"><span class="gtb-ov-915-lbl">BN</span><span class="gtb-ov-915-val" id="gtb-ov-915-bn">—</span></div>';
    h +=   '<div class="gtb-ov-915-row"><span class="gtb-ov-915-lbl">ALL</span><span class="gtb-ov-915-val" id="gtb-ov-915-all">—</span></div>';
    h += '</div>';

    // 5) Key stats — A/D + VIX
    h += '<div class="gtb-ov-block gtb-ov-stats-block">';
    h +=   '<div class="gtb-ov-cap">KEY STATS' + _ii('keystats') + '</div>';
    h +=   '<div class="gtb-ov-stat"><span class="gtb-ov-stat-lbl">N50 A/D</span><span class="gtb-ov-stat-val" id="gtb-ov-n50ad">—</span></div>';
    h +=   '<div class="gtb-ov-stat"><span class="gtb-ov-stat-lbl">BN A/D</span><span class="gtb-ov-stat-val" id="gtb-ov-bnad">—</span></div>';
    h +=   '<div class="gtb-ov-stat"><span class="gtb-ov-stat-lbl">INDIA VIX</span><span class="gtb-ov-stat-val" id="gtb-ov-vix">—</span></div>';
    h += '</div>';

    h += '</div>'; // end #gtb-overview

    // ════════════════════════════════════════════════════════════════
    // INSTRUMENT ROWS — sticky Instrument col + horizontal scroll
    //   NAME(sticky) | CHART | 9:15 | FUTURES | OI MATRIX | OI/OBV | WEIGHTAGE | DETAILS
    // ════════════════════════════════════════════════════════════════
    h += '<div id="gtb-rows-wrap">';
    h += '<div id="gtb-rows-head">';
    h +=   '<span class="gtb-rh-instr">INSTRUMENT' + _ii('col-instrument') + '<a id="show-chartgrid" title="Chart Grid — all instruments" style="margin-left:5px;cursor:pointer;color:var(--gtb-muted);font-size:0.72rem;line-height:1;opacity:0.7;flex-shrink:0;" ><i class="bi bi-grid-3x3-gap-fill"></i></a></span>';
    h +=   '<span class="gtb-rh-chart">PRICE ACTION' + _ii('col-price') + '</span>';
    h +=   '<span class="gtb-rh-915">9:15' + _ii('col-915') + '</span>';
    h +=   '<span class="gtb-rh-fut">FUTURES' + _ii('col-futures') + '</span>';
    h +=   '<span class="gtb-rh-oi">OI MATRIX' + _ii('col-oi') + '</span>';
    h +=   '<span class="gtb-rh-oiobv">OI / OBV' + _ii('col-oiobv') + '</span>';
    h +=   '<span class="gtb-rh-weights">WEIGHTAGE' + _ii('col-weights') + '</span>';
    h +=   '<span class="gtb-rh-detail">DETAILS' + _ii('col-detail') + '</span>';
    h += '</div>';

    h += '<div id="gtb-rows">';
    _allInstruments.forEach(function(item, idx) {
        var name = item.name;
        var tid  = name.replace(/ /g, '-').replace(/&/g, '-');
        var icon = instrIcons[name] || 'bi-bar-chart';
        var isMcx = !!item.mcx;
        var exchLink = isMcx ? 'MCX' : 'NSE';
        var mcxEntry = isMcx ? COMMODITIES_FUTURE_INSTRUMENT_LIST.find(function(f){ return f.name === name; }) : null;
        var linkToken  = mcxEntry ? mcxEntry.instrument_token : INSTRUMENT_TOKENS[name];
        var linkSymbol = mcxEntry ? mcxEntry.tradingsymbol    : name;
        var kiteLink   = 'https://kite.zerodha.com/markets/ext/chart/web/tvc/' + exchLink + '/' + linkSymbol + '/' + linkToken;

        // Category: index / commodity / stock — drives the left colour tab
        var cat = isMcx ? 'cmdty' : (idx <= 3 ? 'index' : 'stock');
        var hasFut = (name !== 'GIFT NIFTY' && name !== 'SENSEX');

        h += '<div class="gtb-row cat-' + cat + '" id="gtb-pane-' + tid + '">';

        // ── Identity: name + LTP + change ──────────────────────────────────
        h += '<div class="gtb-row-id">';
        h +=   '<div class="gtb-row-name"><i class="bi ' + icon + '"></i> <a class="gtb-instr-link" href="' + kiteLink + '" target="_blank">' + name + '</a></div>';
        h +=   '<div class="gtb-row-ltp" id="' + tid + '-ltp"></div>';
        h +=   '<div class="gtb-row-id-actions">';
        h +=     '<button class="sv-icon-btn refresh-chart" data-name="' + name + '" title="Refresh chart"><i class="bi bi-arrow-clockwise"></i></button>';
        h +=     '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="chart" title="Maximize chart"><i class="bi bi-fullscreen"></i></button>';
        if (hasFut) {
            h += '<button class="sv-icon-btn refresh-oi-obv" data-name="' + name + '" title="Refresh OI"><i class="bi bi-bar-chart-fill"></i></button>';
            h += '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="oi" title="Maximize OI"><i class="bi bi-graph-up"></i></button>';
        }
        h +=   '</div>';
        h += '</div>';

        // ── Wide candlestick chart ─────────────────────────────────────────
        h += '<div class="gtb-row-col-chart">';
        h +=   '<div id="' + tid + '-chart-levels" class="gtb-chart-levels"></div>';
        h +=   '<div id="' + tid + '-chart" class="gtb-chart-mini gtb-row-chart"></div>';
        h += '</div>';

        // ── 9:15 ───────────────────────────────────────────────────────────
        h += '<div class="gtb-row-col gtb-row-915"><span class="gtb-915-badge" id="' + tid + '-915-badge"></span>';
        h +=   '<button class="gtb-prob-btn" data-name="' + name + '" title="Strike-level probability (backtest)"><i class="bi bi-percent"></i></button>';
        h += '</div>';

        // ── Futures ────────────────────────────────────────────────────────
        h += '<div class="gtb-row-col gtb-row-fut">';
        if (hasFut) {
            h +=   '<span id="' + tid + '-futures-premium" class="gtb-cell-premium-chip"></span>';
            h +=   '<div id="' + tid + '-futures" class="gtb-cell-fut-signals"></div>';
            h +=   '<div id="' + tid + '-futures-trend" class="gtb-cell-fut-remark"></div>';
        } else {
            h +=   '<span class="gtb-row-na">—</span>';
        }
        h += '</div>';

        // ── OI Compare Matrix (same compact heatmap cells as the popup) ───
        h += '<div class="gtb-row-oimatrix" id="' + tid + '-oimatrix">';
        if (!hasFut) h += '<span class="gtb-row-na">—</span>';
        h += '</div>';

        // ── Inline OI/OBV — bar charts + signal row (col 6) ──────────────
        h += '<div class="gtb-row-oiobv">';
        if (hasFut) {
            h += '<div class="gtb-oiobv-lbl">OI</div>';
            h += '<div id="' + tid + '-oi" class="gtb-chart-oi"></div>';
            h += '<div id="' + tid + '-oi-signal-row" style="display:none;"></div>';
            h += '<div class="gtb-oiobv-lbl">OBV</div>';
            h += '<div id="' + tid + '-obv" class="gtb-chart-oi"></div>';
            h += '<div id="' + tid + '-oiobv-xaxis" class="gtb-oiobv-xaxis"></div>';
        } else {
            h += '<span class="gtb-row-na" style="margin:auto">—</span>';
        }
        h += '</div>';

        // ── Weightage / score breakdown strip (col 7) ──────────────────────
        // Index rows: top-6 weighted constituents with score bars
        // Stock rows: this instrument own sub-score breakdown (9:15/trend/futures/OI)
        var isNifty = (name === 'NIFTY 50');
        var isBank  = (name === 'NIFTY BANK');
        h += '<div class="gtb-row-weights" id="' + tid + '-weights">';
        if (isNifty || isBank) {
            var wMap = isNifty ? NIFTY_50_WEIGHTED_STOCKS : NIFTY_BANK_WEIGHTED_STOCKS;
            var topW = Object.entries(wMap).sort(function(a,b){return b[1]-a[1];}).slice(0,6);
            topW.forEach(function(kv) {
                var wname = kv[0];
                var wtid2 = wname.replace(/ /g,'-').replace(/&/g,'-');
                h += '<div class="gtb-wt-row">' +
                     '<span class="gtb-wt-name">' + wname + '</span>' +
                     '<div class="gtb-wt-bar"><b id="' + wtid2 + '-wt-bar" style="width:0%;background:var(--gtb-muted)"></b></div>' +
                     '<span class="gtb-wt-score" id="' + wtid2 + '-wt-score">—</span>' +
                     '</div>';
            });
        } else if (hasFut) {
            // Sub-score rows for this stock instrument
            var subRows = [
                { lbl:'9:15',  id: tid + '-sub-915'  },
                { lbl:'Trend', id: tid + '-sub-trend' },
                { lbl:'Fut',   id: tid + '-sub-fut'   },
                { lbl:'OI',    id: tid + '-sub-oi'    },
                { lbl:'Total', id: tid + '-sub-total' },
            ];
            subRows.forEach(function(sr) {
                h += '<div class="gtb-wt-row">' +
                     '<span class="gtb-wt-name">' + sr.lbl + '</span>' +
                     '<div class="gtb-wt-bar"><b id="' + sr.id + '-bar" style="width:0%;background:var(--gtb-muted)"></b></div>' +
                     '<span class="gtb-wt-score" id="' + sr.id + '">—</span>' +
                     '</div>';
            });
        } else {
            h += '<span class="gtb-row-na" style="margin:auto">—</span>';
        }
        h += '</div>';

        // ── Details: SL / PCR / OI score (col 8) ─────────────────────────
        h += '<div class="gtb-row-detail" id="' + tid + '-detail">';
        if (hasFut) {
            h += '<div class="gtb-det-row"><span class="gtb-det-lbl">SL</span><div id="' + tid + '-atr-sl" class="gtb-cell-sl-wrap" style="margin-left:0"></div></div>';
            h += '<div class="gtb-det-row"><span class="gtb-det-lbl">PCR</span><span class="gtb-pcr-chip gtb-det-val" id="' + tid + '-pcr-probability"></span></div>';
            h += '<div class="gtb-det-row"><span class="gtb-det-lbl">OI sc</span><span class="gtb-oi-score-chip gtb-det-val" id="' + tid + '-oi-score"></span></div>';
        } else {
            h += '<span class="gtb-row-na" style="margin:auto">—</span>';
        }
        h += '</div>';

        h += '</div>'; // end .gtb-row
    });
    h += '</div>'; // end #gtb-rows
    h += '</div>'; // end #gtb-rows-wrap

    // ── Detail sections — collapsed by default, toggled open ──────────
    h += '<div id="gtb-details-area">';
    h += '<div id="gtb-detail-toggle-bar" onclick="(function(){var a=document.getElementById(\&#39;gtb-detail-inner\&#39;);var open=a.style.display!==\&#39;none\&#39;;a.style.display=open?\&#39;none\&#39;:\&#39;\&#39;;document.getElementById(\&#39;gtb-detail-caret\&#39;).style.transform=open?\&#39;rotate(-90deg)\&#39;:\&#39;\&#39;;})();">';
    h += '<i class="bi bi-layers"></i> DETAILS — 9:15 / A/D / COMPONENTS' + _ii('details');
    h += '<span style="margin-left:auto;font-size:0.7rem;transition:transform 0.2s;" id="gtb-detail-caret">▾</span>';
    h += '</div>';
    h += '<div id="gtb-detail-inner" style="display:none;">';

    // ── 3-column layout: NIFTY 50 | NIFTY BANK | All-stocks + Components ──
    h += '<div id="gtb-detail-cols">';

    // ── NIFTY 50 column ───────────────────────────────────────────────────
    h += '<div class="gtb-detail-col" id="gtb-detail-NIFTY-50">';
    h += '<div class="gtb-detail-col-title">NIFTY 50</div>';
    h += '<div class="gtb-detail-toggle gtb-collapse-toggle" data-target="NIFTY-50-915-body">';
    h += '<span><i class="bi bi-clock-history"></i> 9:15 CLOSE</span>';
    h += '<span class="hdr-actions"><button class="sv-icon-btn refresh-nine-fifteen" data-name="NIFTY 50" title="Refresh 9:15"><i class="bi bi-arrow-clockwise"></i></button><i class="bi bi-chevron-down gtb-caret"></i></span></div>';
    h += '<div id="NIFTY-50-915-body" class="gtb-collapse-body">';
    h += '<div id="NIFTY-50-nine-fifteen-close" class="gtb-915-strip"></div>';
    h += '<div id="NIFTY-50-nine-fifteen-close-table" class="gtb-915-table"></div>';
    h += '</div>';
    h += '<div class="gtb-detail-toggle gtb-collapse-toggle" data-target="NIFTY-50-ad-body">';
    h += '<span><i class="bi bi-arrows-collapse-vertical"></i> A/D</span>';
    h += '<span class="hdr-actions"><button class="sv-icon-btn refresh-advance-decline" data-name="NIFTY 50" title="Spot A/D"><i class="bi bi-arrow-clockwise"></i> S</button><button class="sv-icon-btn refresh-advance-decline-futures" data-name="NIFTY 50" title="Futures A/D"><i class="bi bi-arrow-clockwise"></i> F</button><i class="bi bi-chevron-down gtb-caret"></i></span></div>';
    h += '<div id="NIFTY-50-ad-body" class="gtb-collapse-body">';
    h += '<div class="gtb-ad-label">SPOT <span id="NIFTY-50-advance-decline-adr" class="gtb-adr-val"></span></div>';
    h += '<div id="NIFTY-50-advance-decline" class="gtb-chart-ad"></div>';
    h += '<div class="gtb-ad-label" style="margin-top:4px;">FUTURES <span id="NIFTY-50-advance-decline-adr-future" class="gtb-adr-val"></span></div>';
    h += '<div id="NIFTY-50-advance-decline-future" class="gtb-chart-ad"></div>';
    h += '</div>';
    h += '</div>'; // end NIFTY 50 col

    // ── NIFTY BANK column ─────────────────────────────────────────────────
    h += '<div class="gtb-detail-col" id="gtb-detail-NIFTY-BANK">';
    h += '<div class="gtb-detail-col-title">NIFTY BANK</div>';
    h += '<div class="gtb-detail-toggle gtb-collapse-toggle" data-target="NIFTY-BANK-915-body">';
    h += '<span><i class="bi bi-clock-history"></i> 9:15 CLOSE</span>';
    h += '<span class="hdr-actions"><button class="sv-icon-btn refresh-nine-fifteen" data-name="NIFTY BANK" title="Refresh 9:15"><i class="bi bi-arrow-clockwise"></i></button><i class="bi bi-chevron-down gtb-caret"></i></span></div>';
    h += '<div id="NIFTY-BANK-915-body" class="gtb-collapse-body">';
    h += '<div id="NIFTY-BANK-nine-fifteen-close" class="gtb-915-strip"></div>';
    h += '<div id="NIFTY-BANK-nine-fifteen-close-table" class="gtb-915-table"></div>';
    h += '</div>';
    h += '<div class="gtb-detail-toggle gtb-collapse-toggle" data-target="NIFTY-BANK-ad-body">';
    h += '<span><i class="bi bi-arrows-collapse-vertical"></i> A/D</span>';
    h += '<span class="hdr-actions"><button class="sv-icon-btn refresh-advance-decline" data-name="NIFTY BANK" title="Spot A/D"><i class="bi bi-arrow-clockwise"></i> S</button><button class="sv-icon-btn refresh-advance-decline-futures" data-name="NIFTY BANK" title="Futures A/D"><i class="bi bi-arrow-clockwise"></i> F</button><i class="bi bi-chevron-down gtb-caret"></i></span></div>';
    h += '<div id="NIFTY-BANK-ad-body" class="gtb-collapse-body">';
    h += '<div class="gtb-ad-label">SPOT <span id="NIFTY-BANK-advance-decline-adr" class="gtb-adr-val"></span></div>';
    h += '<div id="NIFTY-BANK-advance-decline" class="gtb-chart-ad"></div>';
    h += '<div class="gtb-ad-label" style="margin-top:4px;">FUTURES <span id="NIFTY-BANK-advance-decline-adr-future" class="gtb-adr-val"></span></div>';
    h += '<div id="NIFTY-BANK-advance-decline-future" class="gtb-chart-ad"></div>';
    h += '</div>';
    h += '</div>'; // end NIFTY BANK col

    // ── All-stocks 9:15 + A/D column ──────────────────────────────────────
    h += '<div class="gtb-detail-col" id="gtb-detail-ALL" style="flex:2;">';
    h += '<div class="gtb-detail-col-title">ALL STOCKS</div>';
    h += '<div class="gtb-detail-toggle gtb-collapse-toggle" data-target="gtb-all-ad-body">';
    h += '<span><i class="bi bi-clock-history"></i> 9:15 &amp; A/D</span>';
    h += '<span class="hdr-actions"><button class="sv-icon-btn refresh-advance-decline" data-name="ALL" title="Refresh Spot A/D"><i class="bi bi-arrow-clockwise"></i></button>';
    h += '<span style="font-size:0.44rem;color:var(--gtb-muted);letter-spacing:0.04em;">SPO</span>';
    h += '<button class="sv-icon-btn refresh-advance-decline-futures" data-name="ALL" title="Refresh Futures A/D"><i class="bi bi-arrow-clockwise"></i></button>';
    h += '<span style="font-size:0.44rem;color:var(--gtb-muted);letter-spacing:0.04em;">FUT</span>';
    h += '<i class="bi bi-chevron-down gtb-caret"></i></span></div>';
    h += '<div id="gtb-all-ad-body" class="gtb-collapse-body">';
    h += '<div id="ALL-nine-fifteen-close" class="gtb-915-strip"></div>';
    h += '<div id="ALL-nine-fifteen-close-table" style="max-height:80px;overflow-y:auto;margin-top:4px;"></div>';
    h += '<div style="display:flex;gap:8px;margin-top:6px;">';
    h += '<div style="flex:1;"><div class="gtb-ad-label">SPOT <span id="all-advance-decline-adr" class="gtb-adr-val"></span></div><div id="advance-decline-trend" class="gtb-chart-ad"></div></div>';
    h += '<div style="flex:1;"><div class="gtb-ad-label">FUTURES <span id="all-advance-decline-adr-future" class="gtb-adr-val"></span></div><div id="advance-decline-futures-trend" class="gtb-chart-ad"></div></div>';
    h += '</div></div>';
    h += '</div>'; // end ALL col

    h += '</div>'; // end #gtb-detail-cols (3-col: NIFTY 50 | NIFTY BANK | ALL STOCKS)

    // ── Components & Instruments — full-width row below the 3 index columns ──
    h += '<div id="gtb-detail-bottom-row">';

    h += '<div class="gtb-detail-bottom-col">';
    h += '<div class="gtb-detail-toggle gtb-collapse-toggle" data-target="gtb-component-panel">';
    h += '<span><i class="bi bi-bar-chart-steps"></i> WEIGHTED COMPONENTS</span>';
    h += '<span class="hdr-actions"><i class="bi bi-chevron-down gtb-caret"></i></span></div>';
    h += '<div id="gtb-component-panel" class="gtb-collapse-body" style="max-height:180px;overflow:auto;">';
    h += '<div id="gtb-component-table" style="font-size:0.62rem;color:#7d8590;padding:6px;">Waiting for refresh…</div>';
    h += '</div>';
    h += '</div>';

    h += '<div class="gtb-detail-bottom-col">';
    h += '<div class="gtb-detail-toggle gtb-collapse-toggle" data-target="gtb-stock-list-body">';
    h += '<span><i class="bi bi-collection"></i> INSTRUMENTS</span>';
    h += '<span class="hdr-actions"><button class="sv-icon-btn refresh-stock-list" title="Refresh"><i class="bi bi-arrow-clockwise"></i></button><i class="bi bi-chevron-down gtb-caret"></i></span></div>';
    h += '<div id="gtb-stock-list-body" class="gtb-collapse-body" style="max-height:180px;overflow-y:auto;">';
    h += '<table class="table display nowrap" id="stock-list-table" style="width:100%;font-size:0.58rem;margin-bottom:0;"></table>';
    h += '</div>';
    h += '</div>';

    h += '</div>'; // end #gtb-detail-bottom-row

    h += '</div>'; // end #gtb-detail-inner
    h += '</div>'; // end #gtb-details-area

    h += '</div>'; // end #gtb-right

    h += '</div>'; // end #gtb-main

    // ── FUTURES STRIP (bottom) ────────────────────────────────────────────────
    h += '<div id="gtb-futures-strip">';
    ['NIFTY 50', 'NIFTY BANK', 'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'CRUDEOILM', 'USDINR'].forEach(function(name) {
        let tid = name.replace(/ /g, '-').replace(/&/g, '-');
        h += '<div class="gtb-fut-card" id="gtb-fut-strip-' + tid + '">';
        h += '<div class="gtb-fut-name"><i class="bi bi-lightning-fill"></i> ' + name + '</div>';
        h += '<div class="gtb-fut-remark other" id="gtb-strip-remark-' + tid + '">—</div>';
        h += '<div class="gtb-fut-meta">';
        h += '<span id="gtb-strip-vwap-' + tid + '">VWAP —</span>';
        h += '<span id="gtb-strip-prem-' + tid + '">PREM —</span>';
        h += '</div></div>';
    });
    h += '</div>'; // end futures strip

    // ── Refresh status bar ────────────────────────────────────────────────────
    h += '<div id="gtb-refresh-statusbar" style="'
       + 'font-size:0.6rem;color:#7d8590;padding:3px 10px;border-top:1px solid #ffffff10;'
       + 'background:#0d1117;display:flex;align-items:center;gap:4px;">'
       + '<i class="bi bi-hourglass-split" style="margin-right:3px;"></i>Waiting for refresh…'
       + '</div>';

    return h;
}

function showCompoenentPlaceHolders() {
    jQ("#main-trade-bot-container").html(commonMarkupPlaceHolder());
    _gtbApplyTheme(localStorage.getItem('GTB_THEME') || 'dark');
    _gtbApplyGridH(parseInt(localStorage.getItem('GTB_ROW_H') || '190'));
    // Restore saved column widths now that the container exists in the DOM
    var _cwDefs = { chart:260, fut:190, oi:210, oiobv:280, wt:170, detail:130 };
    Object.keys(_cwDefs).forEach(function(k) {
        var v = parseInt(localStorage.getItem('GTB_COL_' + k.toUpperCase()) || _cwDefs[k]);
        _gtbApplyColW(k, v);
    });
}

// ── Main Refresh Orchestrator ──────────────────────────────────────────────────
// Called every 5 minutes by startTimer() or manually via "Start Refresh" button.
// Executes the full scan cycle in order:
//   1. 9:15 breakout scores (show915Trend) for NIFTY 50, BANK, ALL
//   2. Candlestick charts (showTopChart) for NIFTY 50, NIFTY BANK, GIFT NIFTY, SENSEX etc.
//   3. Futures details (showFutureDetails → setFutureDetails) for all index instruments
//   4. OI/OBV + component scores (showPrictionProbabilty, showOIOBVBarChart)
//   5. Advance/decline scanner (showAdvacenDeclineScanner, showFuturesTrend)
//   6. Score gauge render (renderScoreGauge) with composite score from all sub-scores
// Resets all score globals (resetCount) at the start of each cycle.
// Show step text in the progress pill during a refresh.
// color: 'blue' (default), 'green' (done), 'orange' (warn)
function _gtbProgress(text, color) {
    var pill = jQ('#gtb-progress-pill');
    var dot  = jQ('#gtb-progress-dot');
    var txt  = jQ('#gtb-progress-text');
    if (!pill.length) return;
    var c = color === 'green' ? '#3fb950' : color === 'orange' ? '#fbbf24' : '#3b82f6';
    dot.css({ background: c });
    pill.css({ 'border-color': c + '55', visibility: 'visible' });
    txt.text(text || '');
}
function _gtbProgressHide() {
    jQ('#gtb-progress-pill').css('visibility', 'hidden');
    jQ('#gtb-progress-text').text('');
}

function _gtbToast(msg, type) {
    var color = type === 'success' ? '#3fb950' : type === 'error' ? '#f85149' : '#fbbf24';
    var icon  = type === 'success' ? 'check-circle-fill' : type === 'error' ? 'x-circle-fill' : 'exclamation-triangle-fill';
    Toastify({
        text: '<i class="bi bi-' + icon + '" style="margin-right:6px;color:' + color + ';"></i>' + msg,
        duration: 4000, gravity: 'bottom', position: 'right', escapeMarkup: false,
        style: { background: '#161b22', border: '1px solid ' + color + '44', 'border-radius': '6px',
                 'font-size': '0.7rem', color: '#c9d1d9', padding: '8px 14px' }
    }).showToast();
}

async function commonShowPopupWindow() {
    var _refreshStart = Date.now();
    resetCount()
    jQ("#refresh-loader").removeClass("hide");
    jQ("#start-auto-refresh").css('opacity', '0.45').css('pointer-events', 'none');
    _gtbProgress('Starting…');
    jQ("#last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
    jQ("#main-trade-bot-container").html(commonMarkupPlaceHolder());

    await callSleepForAWhile(200)

    // ── Phase 1: 9:15 breakout (reads localStorage only, no API) ─────────────
    show915Trend('NIFTY 50');
    show915Trend('NIFTY BANK');
    show915Trend('ALL');

    // ── Phase 2: All instruments in parallel ─────────────────────────────────
    // showPrictionProbabilty now builds its stock entry locally and only writes
    // stock[0] synchronously just before returning — so parallel calls are safe.
    _gtbProgress('Charts · Futures · OI…');
    async function _refreshNSE(name) {
        await Promise.all([
            showTopChart(name).catch(function(e) { console.log(name + ' chart', e); }),
            (async function() {
                try { var res = await showFutureDetails(name); setFutureDetails(name, res); } catch(e) { console.log(name + ' fut', e); }
            })(),
            (async function() {
                try { await showPrictionProbabilty(name); showOIOBVBarChart(name); } catch(e) { console.log(name + ' oi', e); }
            })(),
        ]);
    }
    async function _refreshMCX(name) {
        await Promise.all([
            showTopChartMCX(name).catch(function(e) { console.log(name + ' chart', e); }),
            (async function() {
                try {
                    var res = await showFutureDetailsMCX(name);
                    setFutureDetails(name, res);
                    if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
                    INSTRUMENT_SCORE_MAP[name].futures_trend = getFuturesTrendScore(res['REMARK']);
                    INSTRUMENT_SCORE_MAP[name].oi_obv = 0;
                    await showPrictionProbabiltyMCX(name, res);
                    showOIOBVBarChart(name);
                } catch(e) { console.log(name + ' mcx', e); }
            })(),
        ]);
    }

    await Promise.all([
        _refreshNSE('NIFTY 50'),
        _refreshNSE('NIFTY BANK'),
        _refreshNSE('RELIANCE'),
        _refreshNSE('HDFCBANK'),
        _refreshNSE('ICICIBANK'),
        showTopChart('GIFT NIFTY').catch(function(e) { console.log('GIFT NIFTY chart', e); }),
        showTopChart('SENSEX').catch(function(e) { console.log('SENSEX chart', e); }),
        _refreshMCX('CRUDEOILM'),
        _refreshMCX('USDINR'),
    ]);

    // ── Phase 3: Breadth scans ────────────────────────────────────────────────
    // A/D must complete before Futures Trend: showFuturesTrend merges per-interval
    // bull/bear counts into GTB_AD_INTERVAL_HISTORY (line 7354) which
    // showAdvacenDeclineScanner resets and populates. Running them in parallel
    // would merge into a partially-filled or empty array.
    // fetchWeightedStocksOIScore writes to different INSTRUMENT_SCORE_MAP[name]
    // keys (weighted stocks only) — safe to run in parallel with A/D.
    _gtbProgress('A/D · Weighted OI…');
    await Promise.all([
        showAdvacenDeclineScanner().catch(function(e) { console.log('A/D', e); }),
        fetchWeightedStocksOIScore().catch(function(e) { console.log('weighted OI', e); }),
    ]);
    _gtbProgress('Futures trend…');
    await showFuturesTrend().catch(function(e) { console.log('fut trend', e); });

    setScore()
    showStockList([]);
    try { updateTopBarTickers(); } catch(e) {}

    jQ("#refresh-loader").addClass("hide");
    jQ("#start-auto-refresh").css('opacity', '').css('pointer-events', '');
    _gtbProgress('Done', 'green');
    setTimeout(_gtbProgressHide, 2000);

    try { renderComponentPanel(); } catch(e) { console.warn('renderComponentPanel error', e); }
    try { renderScoreHistory(); } catch(e) { console.warn('renderScoreHistory error', e); }

    var _elapsed = ((Date.now() - _refreshStart) / 1000).toFixed(1);
    var _endTime = moment().format("HH:mm:ss");
    jQ("#gtb-refresh-statusbar").html(
        '<i class="bi bi-check-circle-fill" style="color:#3fb950;margin-right:4px;"></i>'
      + 'Refresh completed at <b>' + _endTime + '</b>'
      + ' &nbsp; * &nbsp; '
      + '<i class="bi bi-stopwatch" style="margin-right:3px;"></i>Total time: <b>' + _elapsed + 's</b>'
    );

}


function resetCount() {
    ALL_9_15_CLOSE_SCORE = 0;
    NIFTY_50_9_15_CLOSE_SCORE = 0;
    NIFTY_BANK_9_15_CLOSE_SCORE = 0;
    GIFT_NIFTY_9_15_CLOSE_SCORE = 0;
    SENSEX_9_15_CLOSE_SCORE = 0;
    RELIANCE_9_15_CLOSE_SCORE = 0;
    HDFCBANK_9_15_CLOSE_SCORE = 0;

    ALL_ADVANCE_DECLINE_SCORE = 0;
    NIFTY_50_ADVANCE_DECLINE_SCORE = 0;
    NIFTY_BANK_ADVANCE_DECLINE_SCORE = 0;

    ALL_FUTURES_TREND_SCORE = 0;
    NIFTY_50_FUTURES_TREND_SCORE = 0;
    NIFTY_BANK_FUTURES_TREND_SCORE = 0;

    NIFTY_50_OI_OBV_SCORE = 0;
    NIFTY_BANK_OI_OBV_SCORE = 0;
    RELIANCE_OI_OBV_SCORE = 0;
    HDFCBANK_OI_OBV_SCORE = 0;
    ICICIBANK_OI_OBV_SCORE = 0;
    NIFTY_50_COMPONENT_SCORE = 0;
    NIFTY_BANK_COMPONENT_SCORE = 0;
    INSTRUMENT_SCORE_MAP = {};
}
function getTradeSignal(nifty, sensex, bank) {
    // Normalize AST→ASO and BST→BSO: AST/BST are stronger versions of the same direction.
    // The map captures direction; strength is captured separately by the score system.
    function normalize(v) {
        if (v === 'AST') return 'ASO';
        if (v === 'BST') return 'BSO';
        return v || 'B/W';
    }
    nifty  = normalize(nifty);
    sensex = normalize(sensex);
    bank   = normalize(bank);

    const strategyMap = {
        // Nifty leads — treat it as primary signal, Sensex as global confirmation, Bank as sector
        "ASO-ASO-ASO": { outcome: "Buy",      level: "at BSO/BST" },
        "ASO-ASO-BSO": { outcome: "Buy/Sell", level: "at BSO/BST for long, at ASO/AST for short" },
        "ASO-ASO-B/W": { outcome: "Buy",      level: "at BSO/BST" },
        "ASO-BSO-ASO": { outcome: "Buy",      level: "at BSO/BST — Sensex lag, Nifty+Bank agree" },
        "ASO-BSO-BSO": { outcome: "Sell",     level: "at ASO/AST — bank sector leading down" },
        "ASO-BSO-B/W": { outcome: "Buy/Sell", level: "at BSO/BST for long, at ASO/AST for short" },
        "ASO-B/W-ASO": { outcome: "Buy",      level: "at BSO/BST" },
        "ASO-B/W-BSO": { outcome: "Buy/Sell", level: "at BSO/BST for long, at ASO/AST for short" },
        "ASO-B/W-B/W": { outcome: "Buy",      level: "at BSO/BST — Nifty leading, wait for others" },

        "BSO-ASO-ASO": { outcome: "Buy/Sell", level: "at BSO/BST for long, at ASO/AST for short" },
        "BSO-ASO-BSO": { outcome: "Sell",     level: "at ASO/AST — Nifty+Bank down, Sensex lagging" },
        "BSO-ASO-B/W": { outcome: "Sell",     level: "at ASO/AST" },
        "BSO-BSO-ASO": { outcome: "Sell",     level: "at ASO/AST — bank sector resilient but outvoted" },
        "BSO-BSO-BSO": { outcome: "Sell",     level: "at ASO/AST" },
        "BSO-BSO-B/W": { outcome: "Sell",     level: "at ASO/AST" },
        "BSO-B/W-ASO": { outcome: "Buy/Sell", level: "at BSO/BST for long, at ASO/AST for short" },
        "BSO-B/W-BSO": { outcome: "Sell",     level: "at ASO/AST" },
        "BSO-B/W-B/W": { outcome: "Sell",     level: "at ASO/AST" },

        "B/W-ASO-ASO": { outcome: "Buy",      level: "at BSO/BST — Nifty indecisive but both others confirm" },
        "B/W-ASO-BSO": { outcome: "Buy/Sell", level: "at BSO/BST for long, at ASO/AST for short" },
        "B/W-ASO-B/W": { outcome: "Buy/Sell", level: "at BSO/BST for long, at ASO/AST for short" },
        "B/W-BSO-ASO": { outcome: "Buy/Sell", level: "at BSO/BST for long, at ASO/AST for short" },
        "B/W-BSO-BSO": { outcome: "Sell",     level: "at ASO/AST — both Sensex+Bank confirm down" },
        "B/W-BSO-B/W": { outcome: "Sell",     level: "at ASO/AST" },
        "B/W-B/W-ASO": { outcome: "Buy",      level: "at BSO/BST — Bank Nifty leading" },
        "B/W-B/W-BSO": { outcome: "Sell",     level: "at ASO/AST — Bank Nifty leading down" },
        "B/W-B/W-B/W": { outcome: "Sideways", level: "No trade — all indices in range" }
    };

    const key = `${nifty}-${sensex}-${bank}`;
    return strategyMap[key] || { outcome: "Sideways", level: "No trade" };
}

// Derives the final actionable market signal from all computed scores.
// This is display-only — it does not modify any score globals.
// ─── Trading Window ───────────────────────────────────────────────────────────
// Returns 'PRIME' | 'OK' | 'AVOID' | 'CLOSED'
// AVOID windows have statistically poor signal quality (opening chaos, lunch lull, EOD chop).
function getTradingWindow() {
    let now  = new Date();
    let mins = now.getHours() * 60 + now.getMinutes();
    if (mins < 9 * 60 + 15)  return 'CLOSED';
    if (mins < 9 * 60 + 30)  return 'AVOID';  // pre-open auction — fake prices
    if (mins < 9 * 60 + 45)  return 'AVOID';  // first 15 min — stop-hunt zone
    if (mins < 11 * 60 + 30) return 'PRIME';  // best trending window
    if (mins < 13 * 60)      return 'OK';
    if (mins < 14 * 60)      return 'AVOID';  // lunch — thin volume, whipsaws
    if (mins < 15 * 60)      return 'OK';
    if (mins < 15 * 60 + 15) return 'AVOID';  // EOD squaring — reverse moves
    return 'CLOSED';
}

// ─── ATR (Average True Range) ─────────────────────────────────────────────────
// candles: array of {open, high, low, close} (5-min or day candles)
// Returns ATR over last `period` candles — used for dynamic SL/target sizing.
function computeATR(candles, period) {
    period = period || 14;
    if (!candles || candles.length < 2) return 0;
    let trs = [];
    for (let i = 1; i < candles.length; i++) {
        let c = candles[i], p = candles[i - 1];
        trs.push(Math.max(
            parseFloat(c[2]) - parseFloat(c[3]),                          // high - low
            Math.abs(parseFloat(c[2]) - parseFloat(p[4])),                // |high - prevClose|
            Math.abs(parseFloat(c[3]) - parseFloat(p[4]))                 // |low  - prevClose|
        ));
    }
    let slice = trs.slice(-period);
    return slice.reduce(function(a, b) { return a + b; }, 0) / slice.length;
}

// ─── Entry Confluence Check ───────────────────────────────────────────────────
// Returns { direction: 'LONG'|'SHORT'|'WAIT', bullish, bearish, window, reasons[] }
// Entry is only valid when 4+ of 5 pillars agree AND the trading window is PRIME/OK.
function getEntryConfluence(SCORE) {
    let window   = getTradingWindow();
    let reasons  = [];
    let bullish  = 0, bearish = 0;

    // Pillar 1: 9:15 breakout direction
    let n50score = computeInstrumentScore('NIFTY 50');
    if (n50score.nine_fifteen > 0)  { bullish++; reasons.push('9:15 ↑'); }
    else if (n50score.nine_fifteen < 0) { bearish++; reasons.push('9:15 ↓'); }

    // Pillar 2: current trend (AST/ASO/BST/BSO)
    if (n50score.current_trend > 0)  { bullish++; reasons.push('Trend ↑'); }
    else if (n50score.current_trend < 0) { bearish++; reasons.push('Trend ↓'); }

    // Pillar 3: futures trend (Nifty + BankNifty)
    let n50Fut = (INSTRUMENT_SCORE_MAP['NIFTY 50']  && INSTRUMENT_SCORE_MAP['NIFTY 50'].futures_trend)  || 0;
    let bnFut  = (INSTRUMENT_SCORE_MAP['NIFTY BANK'] && INSTRUMENT_SCORE_MAP['NIFTY BANK'].futures_trend) || 0;
    let futNet = n50Fut + bnFut;
    if (futNet > 0)  { bullish++; reasons.push('Futures ↑'); }
    else if (futNet < 0) { bearish++; reasons.push('Futures ↓'); }

    // Pillar 4: OI/OBV (Nifty + BankNifty combined)
    let oiNet = (INSTRUMENT_SCORE_MAP['NIFTY 50']  && INSTRUMENT_SCORE_MAP['NIFTY 50'].oi_obv  || 0)
              + (INSTRUMENT_SCORE_MAP['NIFTY BANK'] && INSTRUMENT_SCORE_MAP['NIFTY BANK'].oi_obv || 0);
    if (oiNet > 0)  { bullish++; reasons.push('OI/OBV ↑'); }
    else if (oiNet < 0) { bearish++; reasons.push('OI/OBV ↓'); }

    // Pillar 5: advance/decline breadth
    let adNet = ALL_ADVANCE_DECLINE_SCORE + NIFTY_50_ADVANCE_DECLINE_SCORE;
    if (adNet > 0)  { bullish++; reasons.push('A/D ↑'); }
    else if (adNet < 0) { bearish++; reasons.push('A/D ↓'); }

    // PCR contrarian filter: extreme PCR fades the signal
    let pcr = (INSTRUMENT_SCORE_MAP['NIFTY 50'] && INSTRUMENT_SCORE_MAP['NIFTY 50'].pcr) || 1;
    let pcrWarning = '';
    if      (pcr > 1.3) pcrWarning = 'PCR ' + pcr.toFixed(2) + ' (extreme puts — contrarian bullish)';
    else if (pcr < 0.7) pcrWarning = 'PCR ' + pcr.toFixed(2) + ' (extreme calls — contrarian bearish)';

    let direction = 'WAIT';
    if (bullish >= 4 && bearish <= 1) direction = 'LONG';
    else if (bearish >= 4 && bullish <= 1) direction = 'SHORT';

    // Block entry in AVOID/CLOSED windows regardless of signal
    if (window === 'AVOID' || window === 'CLOSED') direction = 'WAIT';

    return { direction: direction, bullish: bullish, bearish: bearish, window: window, reasons: reasons, pcrWarning: pcrWarning, pcr: pcr };
}

// ─── Stop Loss & Target ───────────────────────────────────────────────────────
// Given entry price, direction, and 5-min candles, returns SL and two targets.
// Uses 1.5× ATR for SL, 2.5× ATR for T1, 4× ATR for T2 (1:1.6 and 1:2.6 R:R).
function computeSLAndTarget(entryPrice, direction, candles) {
    let atr = computeATR(candles);
    if (atr === 0) return null;
    let ep = parseFloat(entryPrice);
    if (direction === 'LONG') {
        return {
            atr:    atr.toFixed(2),
            sl:     (ep - 1.5 * atr).toFixed(2),
            target1:(ep + 2.5 * atr).toFixed(2),
            target2:(ep + 4.0 * atr).toFixed(2),
            rr:     '1:1.6 / 1:2.6'
        };
    } else {
        return {
            atr:    atr.toFixed(2),
            sl:     (ep + 1.5 * atr).toFixed(2),
            target1:(ep - 2.5 * atr).toFixed(2),
            target2:(ep - 4.0 * atr).toFixed(2),
            rr:     '1:1.6 / 1:2.6'
        };
    }
}

// ─── Tradeable Stock Scanner ──────────────────────────────────────────────────
// Returns top 5 stocks from Nifty 50 + Bank Nifty constituents that have:
//   • |score| ≥ 3 (strong signal)
//   • volume ratio ≥ 1.3 (above-average volume — momentum confirmation)
//   • direction aligned with index futures direction
function getTradeableStocks() {
    let n50Dir = (INSTRUMENT_SCORE_MAP['NIFTY 50']  && INSTRUMENT_SCORE_MAP['NIFTY 50'].futures_trend)  || 0;
    let bnDir  = (INSTRUMENT_SCORE_MAP['NIFTY BANK'] && INSTRUMENT_SCORE_MAP['NIFTY BANK'].futures_trend) || 0;
    let indexDir = (n50Dir + bnDir >= 1) ? 1 : (n50Dir + bnDir <= -1) ? -1 : 0;

    let candidates = [];
    let allMaps = Object.assign({}, NIFTY_50_WEIGHTED_STOCKS, NIFTY_BANK_WEIGHTED_STOCKS);
    jQ.each(allMaps, function(name, weight) {
        let s = INSTRUMENT_SCORE_MAP[name] && INSTRUMENT_SCORE_MAP[name].score;
        if (!s) return;
        try {
            let trend    = generateTrend(name);
            let volume   = parseFloat(trend.volume) || 0;
            let avgVol   = parseFloat(trend.avg_volume) || 1;
            let volRatio = avgVol > 0 ? volume / avgVol : 0;
            let pChange  = parseFloat(trend.change) || 0;
            // Only include if index direction is neutral OR stock aligns with index
            if (indexDir !== 0 && Math.sign(s.total) !== indexDir) return;
            candidates.push({ name: name, score: s.total, volRatio: volRatio.toFixed(1), pChange: pChange.toFixed(2), weight: weight, strong: Math.abs(s.total) >= 3 && volRatio >= 1.3 });
        } catch(e) {}
    });
    // Sort: strong setups first, then by abs score
    candidates.sort(function(a, b) {
        if (a.strong !== b.strong) return a.strong ? -1 : 1;
        return Math.abs(b.score) - Math.abs(a.score);
    });
    return candidates.slice(0, 8);
}

// ─── Exit Signal ──────────────────────────────────────────────────────────────
// Returns 'EXIT' when trend has flipped against the entry direction.
// Call on each refresh cycle with the direction you entered ('LONG' or 'SHORT').
function checkExitSignal(entryDirection) {
    let s    = computeInstrumentScore('NIFTY 50');
    let n50Fut = (INSTRUMENT_SCORE_MAP['NIFTY 50']  && INSTRUMENT_SCORE_MAP['NIFTY 50'].futures_trend)  || 0;
    let bnFut  = (INSTRUMENT_SCORE_MAP['NIFTY BANK'] && INSTRUMENT_SCORE_MAP['NIFTY BANK'].futures_trend) || 0;
    if (entryDirection === 'LONG') {
        // Exit if trend OR futures flip negative
        if (s.current_trend < 0 || (n50Fut < 0 && bnFut < 0)) return 'EXIT';
    } else if (entryDirection === 'SHORT') {
        if (s.current_trend > 0 || (n50Fut > 0 && bnFut > 0)) return 'EXIT';
    }
    return 'HOLD';
}

// Call this after setScore() has populated all globals.
function getMarketSignal(SCORE, breakOutNineFifteen) {
    // --- VIX guard: if NIFTY 50 LTP is at daily VIX boundary, statistical edge is exhausted ---
    try {
        let niftyTrend = generateTrend('NIFTY 50');
        let trends = niftyTrend.trends || [];
        if (trends.indexOf('VIXU') !== -1) {
            return { signal: 'NO TRADE', color: 'bg-warning text-dark', reason: 'NIFTY at VIXU — daily range exhausted on upside. Wait for pullback.', tradeSignal: { outcome: 'Sideways', level: 'No trade — VIX upper boundary hit' } };
        }
        if (trends.indexOf('VIXL') !== -1) {
            return { signal: 'NO TRADE', color: 'bg-warning text-dark', reason: 'NIFTY at VIXL — daily range exhausted on downside. Wait for bounce.', tradeSignal: { outcome: 'Sideways', level: 'No trade — VIX lower boundary hit' } };
        }
    } catch(e) {}

    // --- 9:15 index pattern signal (independent of score) ---
    let n915   = breakOutNineFifteen['NIFTY 50']   ? breakOutNineFifteen['NIFTY 50']['CLOSE_9_15']   : 'B/W';
    let sx915  = breakOutNineFifteen['SENSEX']      ? breakOutNineFifteen['SENSEX']['CLOSE_9_15']      : 'B/W';
    let bn915  = breakOutNineFifteen['NIFTY BANK']  ? breakOutNineFifteen['NIFTY BANK']['CLOSE_9_15'] : 'B/W';
    let tradeSignal = getTradeSignal(n915, sx915, bn915);

    // --- Index futures conflict check ---
    // Use the actual Nifty 50 and Bank Nifty index futures REMARK (LONG/SHORT),
    // NOT NIFTY_50_FUTURES_TREND_SCORE which counts constituent stock breadth.
    let n50FutDir  = (INSTRUMENT_SCORE_MAP['NIFTY 50']  && INSTRUMENT_SCORE_MAP['NIFTY 50'].futures_trend)  || 0;
    let bnFutDir   = (INSTRUMENT_SCORE_MAP['NIFTY BANK'] && INSTRUMENT_SCORE_MAP['NIFTY BANK'].futures_trend) || 0;
    let indexFuturesScore = n50FutDir + bnFutDir;

    // --- Score → base signal ---
    let signal, color, reason;

    if (SCORE >= 12) {
        signal = 'STRONG BUY';  color = 'sv-badge-green';
        reason = 'All pillars bullish: 9:15 breakout, advance/decline, futures trend, OI/OBV and components aligned.';
    } else if (SCORE >= 6) {
        signal = 'BUY';         color = 'sv-badge-green';
        reason = 'Majority of signals bullish. Trade long at pullbacks to BSO/BST.';
    } else if (SCORE >= 2) {
        signal = 'WAIT';        color = 'sv-badge-amber';
        reason = 'Mild bullish lean but not enough confirmation. Wait for score to improve or price to reach key level.';
    } else if (SCORE >= -1) {
        signal = 'SIDEWAYS';    color = 'sv-badge-muted';
        reason = 'Signals balanced. Market is range-bound between BSO and ASO. Trade the range.';
    } else if (SCORE >= -5) {
        signal = 'WAIT';        color = 'sv-badge-amber';
        reason = 'Mild bearish lean but not enough confirmation. Wait for score to worsen or price to reach key level.';
    } else if (SCORE >= -11) {
        signal = 'SELL';        color = 'sv-badge-red';
        reason = 'Majority of signals bearish. Trade short at rallies to ASO/AST.';
    } else {
        signal = 'STRONG SELL'; color = 'sv-badge-red';
        reason = 'All pillars bearish: 9:15 breakdown, advance/decline negative, futures short, OI/OBV and components all down.';
    }

    // --- Conflict override: index futures contradicting score direction ---
    if (SCORE > 5 && indexFuturesScore < 0) {
        signal = 'WAIT'; color = 'sv-badge-amber';
        reason = 'Score bullish (' + SCORE + ') but both index futures are bearish. Conflicting signals — no trade.';
    } else if (SCORE < -5 && indexFuturesScore > 0) {
        signal = 'WAIT'; color = 'sv-badge-amber';
        reason = 'Score bearish (' + SCORE + ') but both index futures are bullish. Conflicting signals — no trade.';
    }

    // --- 9:15 pattern cross-check: if pattern directly contradicts the final signal, downgrade ---
    if ((signal === 'BUY' || signal === 'STRONG BUY') && tradeSignal.outcome === 'Sell') {
        signal = 'WAIT'; color = 'sv-badge-amber';
        reason = 'Score bullish but 9:15 index pattern says Sell. Wait for alignment.';
    } else if ((signal === 'SELL' || signal === 'STRONG SELL') && tradeSignal.outcome === 'Buy') {
        signal = 'WAIT'; color = 'sv-badge-amber';
        reason = 'Score bearish but 9:15 index pattern says Buy. Wait for alignment.';
    }

    return { signal: signal, color: color, reason: reason, tradeSignal: tradeSignal };
}


// ── Historical snapshot mode ──────────────────────────────────────────────────
// When GTB_HIST_DATE is set, all data fetches use it instead of CURRENT_DAY.
// GTB_HIST_TIME (HH:mm) trims candle arrays to that end time after fetch.
// Returns selected end time from topbar picker (HH:mm), with localStorage fallback.
function _gtbHistTime() {
    return (jQ('#gtb-hist-time').val() || localStorage.getItem('GTB_HIST_TIME') || '').trim() || null;
}

// from is always CURRENT_DAY
function _gtbCurrDay()    { return CURRENT_DAY; }
// to is CURRENT_DAY, with time appended when picker has a value
function _gtbCurrDayTo()  { var t = _gtbHistTime(); return t ? (CURRENT_DAY + ' ' + t + ':00') : CURRENT_DAY; }

function _gtbPrevDay()    { return PREVIOUS_DAY; }

// MCX — same pattern
function _gtbMcxCurrDay()   { return MCX_CURRENT_DAY; }
function _gtbMcxCurrDayTo() { var t = _gtbHistTime(); return t ? (MCX_CURRENT_DAY + ' ' + t + ':00') : MCX_CURRENT_DAY; }
function _gtbMcxPrevDay()   { return MCX_PREVIOUS_DAY; }

// Strips candles from a previous trading day (date < refDay).
// Call this on any intraday candle array fetched with from=PREVIOUS_DAY so the
// stray last-candle-of-previous-session doesn't pollute trend / ATR / score calcs.
// refDay defaults to CURRENT_DAY; pass MCX_CURRENT_DAY for commodity candles.
function _gtbStripPrevDayCandles(candles, refDay) {
    if (!candles || !candles.length) return candles;
    var day = refDay || CURRENT_DAY; // "YYYY-MM-DD"
    return candles.filter(function(c) {
        return moment(c[0]).format('YYYY-MM-DD') >= day;
    });
}

// Trims candle array to those at or before selected time (safety net for APIs that ignore time).
// Also strips any candles from a previous trading day.
function _gtbTrimCandles(candles, refDay) {
    var filtered = _gtbStripPrevDayCandles(candles, refDay);
    var endTime = _gtbHistTime();
    if (!endTime || !filtered || !filtered.length) return filtered;
    return filtered.filter(function(c) {
        return moment(c[0]).format('HH:mm') <= endTime;
    });
}

let ALL_9_15_CLOSE_SCORE = 0;
let NIFTY_50_9_15_CLOSE_SCORE = 0;
let NIFTY_BANK_9_15_CLOSE_SCORE = 0;
let GIFT_NIFTY_9_15_CLOSE_SCORE = 0;
let SENSEX_9_15_CLOSE_SCORE = 0;
let RELIANCE_9_15_CLOSE_SCORE = 0;
let HDFCBANK_9_15_CLOSE_SCORE = 0;

let ALL_ADVANCE_DECLINE_SCORE = 0;
let NIFTY_50_ADVANCE_DECLINE_SCORE = 0;
let NIFTY_BANK_ADVANCE_DECLINE_SCORE = 0;

let ALL_FUTURES_TREND_SCORE = 0;
let NIFTY_50_FUTURES_TREND_SCORE = 0;
let NIFTY_BANK_FUTURES_TREND_SCORE = 0;

let NIFTY_50_OI_OBV_SCORE = 0;
let NIFTY_BANK_OI_OBV_SCORE = 0;
let RELIANCE_OI_OBV_SCORE = 0;
let HDFCBANK_OI_OBV_SCORE = 0;
let ICICIBANK_OI_OBV_SCORE = 0;

// Weighted component composite scores: each stock's total signal × (weight/100), summed
let NIFTY_50_COMPONENT_SCORE = 0;
let NIFTY_BANK_COMPONENT_SCORE = 0;

// Per-instrument score cache populated during futures trend scan and setScore
let INSTRUMENT_SCORE_MAP = {};

// Per-interval A/D snapshot saved by showAdvacenDeclineScanner — used by renderScoreHistory()
// Format: [ { time: "HH:mm", nAdv, nDec, bnAdv, bnDec, allAdv, allDec } ]
let GTB_AD_INTERVAL_HISTORY = [];

// Candle close price per weighted constituent per interval — captured during A/D scanner.
// Format: { "HDFCBANK": { "09:20": 1820.5, "09:25": 1825.0, ... }, ... }
let GTB_COMPONENT_CLOSE_MAP = {};

// ─── Component Breakdown Panel ───────────────────────────────────────────────
// Shows per-stock score breakdown for all weighted Nifty 50 + Bank Nifty constituents.
// Called after setScore() so INSTRUMENT_SCORE_MAP[name].score is populated.
function renderComponentPanel() {
    var el = jQ('#gtb-component-table');
    if (!el.length) return;

    var b915   = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}');
    var opens  = JSON.parse(localStorage.getItem('INSTRUMENT_LIST_GLOBAL')      || '{}');
    var ltpMap = JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE')        || '{}');

    function _cell(v, pos, neg) {
        var c = v > 0 ? (pos || '#3fb950') : v < 0 ? (neg || '#f85149') : '#7d8590';
        var s = v > 0 ? '+' + v : '' + v;
        return '<td style="padding:2px 4px;text-align:center;color:' + c + ';font-weight:' + (v !== 0 ? '600' : '400') + ';">' + s + '</td>';
    }
    function _tag(label, color) {
        return '<span style="font-size:0.5rem;padding:1px 4px;border-radius:3px;background:' + color + '22;color:' + color + ';border:1px solid ' + color + '44;">' + label + '</span>';
    }
    function _scoreColor(s) {
        if (s >= 4)  return '#3fb950';
        if (s >= 2)  return '#d2a679';
        if (s >= 0)  return '#fbbf24';
        return '#f85149';
    }

    function _buildSection(title, weightMap) {
        var rows = '';
        var totalContrib = 0;

        jQ.each(weightMap, function(name, weight) {
            var sm = INSTRUMENT_SCORE_MAP[name];
            var sc = sm && sm.score;
            if (!sc) return;

            // 9:15 label
            var c915raw = (b915[name] || {})['CLOSE_9_15'] || 'B/W';
            var c915col = (c915raw === 'AST' || c915raw === 'ASO') ? '#3fb950' : (c915raw === 'BST' || c915raw === 'BSO') ? '#f85149' : '#7d8590';

            // current trend label (LTP vs strike)
            var ltpObj = ltpMap[name];
            var openObj = opens[name];
            var trendLabel = '—', trendCol = '#7d8590';
            if (ltpObj && openObj) {
                var ltp = parseFloat(ltpObj.ltp);
                var sd = getStrikeDetails({ price: openObj.price }, name);
                if      (ltp >= parseFloat(sd.ustrikeTwo)) { trendLabel = 'AST'; trendCol = '#3fb950'; }
                else if (ltp >= parseFloat(sd.ustrikeOne)) { trendLabel = 'ASO'; trendCol = '#3fb950'; }
                else if (ltp <= parseFloat(sd.bstrikeTwo)) { trendLabel = 'BST'; trendCol = '#f85149'; }
                else if (ltp <= parseFloat(sd.bstrikeOne)) { trendLabel = 'BSO'; trendCol = '#f85149'; }
                else                                        { trendLabel = 'B/W'; trendCol = '#7d8590'; }
            }

            // PCR
            var pcrVal = sm.pcr != null ? parseFloat(sm.pcr).toFixed(2) : '—';
            var pcrCol = sm.pcr > 1.2 ? '#3fb950' : sm.pcr < 0.8 ? '#f85149' : '#fbbf24';

            var contrib = parseFloat((sc.total * (weight / 100)).toFixed(2));
            totalContrib += contrib;
            var contribCol = _scoreColor(sc.total);

            rows += '<tr style="border-bottom:1px solid #ffffff08;">';
            rows += '<td style="padding:2px 4px;white-space:nowrap;">'
                  + '<span style="color:#c9d1d9;font-weight:500;">' + name + '</span>'
                  + '&nbsp;<span style="color:#7d8590;font-size:0.55rem;">' + weight + '%</span>'
                  + '</td>';
            rows += '<td style="padding:2px 4px;text-align:center;">' + _tag(c915raw, c915col) + '</td>';
            rows += '<td style="padding:2px 4px;text-align:center;">' + _tag(trendLabel, trendCol) + '</td>';
            rows += _cell(sc.futures_trend);
            rows += '<td style="padding:2px 4px;text-align:center;color:' + pcrCol + ';">' + pcrVal + '</td>';
            rows += _cell(sc.oi_obv);
            rows += '<td style="padding:2px 4px;text-align:center;color:' + contribCol + ';font-weight:600;">'
                  + (contrib > 0 ? '+' : '') + contrib + '</td>';
            rows += '</tr>';
        });

        var secContribCol = _scoreColor(totalContrib);
        return '<tr style="background:#161b22;">'
             + '<td colspan="7" style="padding:3px 4px;font-size:0.58rem;font-weight:600;color:#7d8590;letter-spacing:.04em;">'
             + title + '&nbsp;<span style="color:' + secContribCol + ';">' + (totalContrib > 0 ? '+' : '') + totalContrib.toFixed(2) + '</span>'
             + '</td></tr>'
             + rows;
    }

    var html = '<table style="width:100%;border-collapse:collapse;font-size:0.6rem;">';
    html += '<thead><tr style="color:#7d8590;border-bottom:1px solid #ffffff15;">'
         + '<th style="padding:3px 4px;text-align:left;">Stock</th>'
         + '<th style="padding:3px 4px;text-align:center;" title="9:15 candle position">9:15</th>'
         + '<th style="padding:3px 4px;text-align:center;" title="Current LTP vs strike">Trend</th>'
         + '<th style="padding:3px 4px;text-align:center;" title="Futures trend">FT</th>'
         + '<th style="padding:3px 4px;text-align:center;" title="Put-Call Ratio">PCR</th>'
         + '<th style="padding:3px 4px;text-align:center;" title="OI+OBV score">OI</th>'
         + '<th style="padding:3px 4px;text-align:center;" title="Weighted contribution">Wt.</th>'
         + '</tr></thead><tbody>';

    html += _buildSection('NIFTY 50', NIFTY_50_WEIGHTED_STOCKS);
    html += _buildSection('BANK NIFTY', NIFTY_BANK_WEIGHTED_STOCKS);

    html += '</tbody></table>';
    el.html(html);
}

// ─── Per-5min OI/OBV score reconstruction ─────────────────────────────────────
// Faithful reconstruction: re-runs scoreOIStrikeForSignal() at a past candle time T
// using the per-candle data already retained in oiData (raw option candles with OI[6],
// the cumulative CE_OBV/PE_OBV series, the CE_IV/PE_IV series, and underlying spot
// candles for priceChange@T). Returns the same scale as computeOIScoreFromData().
//
// The instruments that feed the main OI score (NIFTY 50, NIFTY BANK, RELIANCE,
// HDFCBANK, ICICIBANK) each store oiData in INSTRUMENT_SCORE_MAP[name].oiData.

var _GTB_OI_SCORED_INSTRUMENTS = ['NIFTY 50', 'NIFTY BANK', 'RELIANCE', 'HDFCBANK', 'ICICIBANK'];

// Index of the current-day candle at (or just before) "HH:mm".
// currData spans prev-day + current-day, so we restrict to the most recent day.
function _gtbCandleIdxAtTime(candles, hhmm) {
    if (!candles || !candles.length) return -1;
    var lastDay = moment(candles[candles.length - 1][0]).format('YYYY-MM-DD');
    var found = -1;
    for (var k = 0; k < candles.length; k++) {
        var m = moment(candles[k][0]);
        if (m.format('YYYY-MM-DD') !== lastDay) continue;
        var t = m.format('HH:mm');
        if (t === hhmm) { found = k; break; }
        if (t < hhmm) { found = k; }       // remember last candle before T
        else break;                         // passed T → stop
    }
    return found;
}

// Underlying % change at time T: (close@T − day-open) / day-open × 100.
function _gtbPriceChangeAtTime(spot, hhmm) {
    if (!spot || !spot.length) return 0;
    var lastDay = moment(spot[spot.length - 1][0]).format('YYYY-MM-DD');
    var dayOpen = null;
    for (var k = 0; k < spot.length; k++) {
        if (moment(spot[k][0]).format('YYYY-MM-DD') === lastDay) { dayOpen = parseFloat(spot[k][1]); break; }
    }
    var i = _gtbCandleIdxAtTime(spot, hhmm);
    if (i < 0 || dayOpen === null || dayOpen <= 0) return 0;
    return (parseFloat(spot[i][4]) - dayOpen) / dayOpen * 100;
}

// Reconstruct a single strike's `item` as it was at time T (shape that
// scoreOIStrikeForSignal expects: OI_CE/OI_PE/CHG_OI_CE/CHG_OI_PE/CE_OBV/PE_OBV/CE_IV/PE_IV).
function _gtbStrikeItemAtTime(item, hhmm) {
    var cc = item.currDataCE, cp = item.currDataPE;
    if (!cc || !cp || !cc.length || !cp.length) return null;
    var iCE = _gtbCandleIdxAtTime(cc, hhmm);
    var iPE = _gtbCandleIdxAtTime(cp, hhmm);
    if (iCE < 0 || iPE < 0) return null;
    var OID = (typeof OI_DIVISOR !== 'undefined') ? OI_DIVISOR : 100000;

    var oiCE = parseFloat(cc[iCE][6]) || 0;
    var oiPE = parseFloat(cp[iPE][6]) || 0;
    var prevOICE = parseFloat(item.prevDataCE[item.prevDataCE.length - 1][6]) || 0;
    var prevOIPE = parseFloat(item.prevDataPE[item.prevDataPE.length - 1][6]) || 0;

    // OBV / IV series align by index with their currData candles → slice up to T.
    var ceObv = (item.CE_OBV || []).slice(0, iCE + 1);
    var peObv = (item.PE_OBV || []).slice(0, iPE + 1);
    if (!ceObv.length || !peObv.length) return null;

    return {
        OI_CE:     (oiCE / OID).toFixed(1),
        OI_PE:     (oiPE / OID).toFixed(1),
        CHG_OI_CE: ((oiCE - prevOICE) / OID).toFixed(1),
        CHG_OI_PE: ((oiPE - prevOIPE) / OID).toFixed(1),
        ATM_STRIKE: item.ATM_STRIKE,
        CE_OBV: ceObv,
        PE_OBV: peObv,
        CE_IV: (item.CE_IV || []).slice(0, iCE + 1),
        PE_IV: (item.PE_IV || []).slice(0, iPE + 1),
    };
}

// Per-instrument OI score at time T — mirrors computeOIScoreFromData() exactly,
// but every strike is evaluated at candle T instead of the latest candle.
function _oiScoreAtTime(oiData, hhmm) {
    if (!oiData || !oiData.tableData || !oiData.tableData.length) return null;
    var priceChangeT = _gtbPriceChangeAtTime(oiData.spotCandles || [], hhmm);

    var score = 0, any = false;
    var wPE = 0, wCE = 0, wChPE = 0, wChCE = 0;
    jQ.each(oiData.tableData, function (idx, item) {
        var at = _gtbStrikeItemAtTime(item, hhmm);
        if (!at) return;
        any = true;
        score += scoreOIStrikeForSignal(at, !!item['ATM_STRIKE'], priceChangeT).score;
        var w = item['ATM_STRIKE'] ? 3 : 1;
        wPE   += parseFloat(at.OI_PE)     * w;
        wCE   += parseFloat(at.OI_CE)     * w;
        wChPE += parseFloat(at.CHG_OI_PE) * w;
        wChCE += parseFloat(at.CHG_OI_CE) * w;
    });
    if (!any) return null;

    // Weighted PCR bands — identical thresholds to computeOIScoreFromData()
    var pcr   = wCE   > 0 ? wPE   / wCE   : 1;
    var chPcr = wChCE > 0 ? wChPE / wChCE : 1;
    if      (pcr > 1.3)  score += 1;
    else if (pcr >= 1.0) score += 0.5;
    else if (pcr >= 0.7) score -= 0.5;
    else                 score -= 1;
    if (!isNaN(chPcr)) {
        if      (chPcr > 1.3)  score += 0.5;
        else if (chPcr >= 1.0) score += 0.25;
        else if (chPcr >= 0.7) score -= 0.25;
        else                   score -= 0.5;
    }
    return parseFloat(score.toFixed(2));
}

// Sum of per-interval OI scores across the 5 scored instruments at time T.
// Falls back to the instrument current (snapshot) oi_obv if its per-candle data
// is unavailable, so the total never silently drops a contributor.
function _oiScoreAllAtTime(hhmm) {
    var total = 0;
    _GTB_OI_SCORED_INSTRUMENTS.forEach(function (name) {
        var sm = INSTRUMENT_SCORE_MAP[name];
        if (!sm) return;
        var s = sm.oiData ? _oiScoreAtTime(sm.oiData, hhmm) : null;
        total += (s === null) ? (sm.oi_obv || 0) : s;
    });
    return parseFloat(total.toFixed(2));
}

// ─── Score History Table ──────────────────────────────────────────────────────
// Per-interval score reconstruction.
// Varying per interval  : A/D (all 3), Futures trend (all 3), OI/OBV (5 instruments),
//                         component scores — recomputed for each candle.
// Fixed (point-in-time) : 9:15 scores only — sealed at 9:20, identical all day.
// Must be called AFTER setScore() so all score globals are populated.
function renderScoreHistory() {
    var el = jQ('#gtb-score-history-table');
    if (!el.length) return;

    if (!GTB_AD_INTERVAL_HISTORY || !GTB_AD_INTERVAL_HISTORY.length) {
        el.html('<span style="color:#7d8590;font-size:0.62rem;">No interval data yet — run a full refresh first.</span>');
        return;
    }

    // ── Fixed components (don't vary per candle) ──────────────────────────────
    var fixed915 =
        (ALL_9_15_CLOSE_SCORE        || 0) +
        (NIFTY_50_9_15_CLOSE_SCORE   || 0) +
        (NIFTY_BANK_9_15_CLOSE_SCORE || 0) +
        (GIFT_NIFTY_9_15_CLOSE_SCORE || 0) +
        (SENSEX_9_15_CLOSE_SCORE     || 0) +
        (RELIANCE_9_15_CLOSE_SCORE   || 0) +
        (HDFCBANK_9_15_CLOSE_SCORE   || 0);

    // OI/OBV is now reconstructed per interval via _oiScoreAllAtTime(row.time)
    // (each instrument falls back to its snapshot oi_obv if per-candle data is missing).

    // Pre-load data needed for per-interval component score
    var _b915   = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN")) || {};
    var _opens  = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL"))      || {};


    // Per-interval component score: same as computeComponentScores() but uses
    // candle close from GTB_COMPONENT_CLOSE_MAP instead of live LTP.
    // futures_trend and oi_obv still from INSTRUMENT_SCORE_MAP (futures captured per-interval
    // separately in row.nFBull etc — but per-stock futures trend requires per-stock map
    // which isn't stored; use current INSTRUMENT_SCORE_MAP.futures_trend as best approximation).
    function _compScoreAtTime(time) {
        function _instrScore(name) {
            var close = (GTB_COMPONENT_CLOSE_MAP[name] || {})[time];
            if (!close) return 0;
            var openDetail = _opens[name];
            if (!openDetail) return 0;

            // 9:15 score (fixed)
            var c915 = (_b915[name] || {})['CLOSE_9_15'];
            var s915 = c915 === 'AST' ? 2 : c915 === 'ASO' ? 1 : c915 === 'BST' ? -2 : c915 === 'BSO' ? -1 : 0;

            // current_trend: candle close vs ASO/BSO strike at open price
            var sd = getStrikeDetails({ price: openDetail.price }, name);
            var aso = parseFloat(sd.ustrikeOne), ast = parseFloat(sd.ustrikeTwo);
            var bso = parseFloat(sd.bstrikeOne), bst = parseFloat(sd.bstrikeTwo);
            var sTrend = 0;
            if      (close >= ast) sTrend = 2;
            else if (close >= aso) sTrend = 1;
            else if (close <= bst) sTrend = -2;
            else if (close <= bso) sTrend = -1;

            // futures_trend and oi_obv from INSTRUMENT_SCORE_MAP (best available)
            var sFut = (INSTRUMENT_SCORE_MAP[name] || {}).futures_trend || 0;
            var sOI  = (INSTRUMENT_SCORE_MAP[name] || {}).oi_obv        || 0;

            return s915 + sTrend + sFut + sOI;
        }

        var n50 = 0, bn = 0;
        try {
            jQ.each(NIFTY_50_WEIGHTED_STOCKS, function(name, weight) {
                n50 += _instrScore(name) * (weight / 100);
            });
            jQ.each(NIFTY_BANK_WEIGHTED_STOCKS, function(name, weight) {
                bn += _instrScore(name) * (weight / 100);
            });
        } catch(e) {}
        return parseFloat((n50 + bn).toFixed(2));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    // A/D score: (adv-dec)/(adv+dec) — same formula as the globals
    function _adScore(adv, dec) {
        var t = adv + dec;
        return t > 0 ? parseFloat(((adv - dec) / t).toFixed(2)) : 0;
    }

    // Futures trend score: +1 / 0 / -1 — same as ALL/NIFTY/BANK_FUTURES_TREND_SCORE
    function _ftScore(bull, bear) {
        return bull > bear ? 1 : bear > bull ? -1 : 0;
    }

    function _scoreColor(s) {
        if (s >= 8) return '#3fb950';
        if (s >= 5) return '#d2a679';
        if (s >= 1) return '#fbbf24';
        return '#f85149';
    }

    function _bar(s) {
        var max = 15;
        var pct = Math.max(0, Math.min(100, ((s + max) / (max * 2)) * 100));
        var col = _scoreColor(s);
        return '<div style="width:55px;height:5px;background:#ffffff10;border-radius:3px;display:inline-block;vertical-align:middle;">'
             + '<div style="width:' + pct + '%;height:100%;background:' + col + ';border-radius:3px;"></div>'
             + '</div>';
    }

    function _signed(v) {
        var c = v > 0 ? '#3fb950' : v < 0 ? '#f85149' : '#7d8590';
        var s = v > 0 ? '+' + v : '' + v;
        return '<span style="color:' + c + ';">' + s + '</span>';
    }

    // ── Debug breakdown: LIVE panel vs latest history row, term by term ─────────
    // Pinpoints which sub-score (9:15 / A/D / Futures / OI / Component) diverges.
    var live = {
        n915: fixed915,
        ad:  (typeof ALL_ADVANCE_DECLINE_SCORE      !== 'undefined' ? ALL_ADVANCE_DECLINE_SCORE      : 0)
           + (typeof NIFTY_50_ADVANCE_DECLINE_SCORE !== 'undefined' ? NIFTY_50_ADVANCE_DECLINE_SCORE : 0)
           + (typeof NIFTY_BANK_ADVANCE_DECLINE_SCORE!== 'undefined'? NIFTY_BANK_ADVANCE_DECLINE_SCORE: 0),
        ft:  (typeof ALL_FUTURES_TREND_SCORE      !== 'undefined' ? ALL_FUTURES_TREND_SCORE      : 0)
           + (typeof NIFTY_50_FUTURES_TREND_SCORE !== 'undefined' ? NIFTY_50_FUTURES_TREND_SCORE : 0)
           + (typeof NIFTY_BANK_FUTURES_TREND_SCORE!== 'undefined'? NIFTY_BANK_FUTURES_TREND_SCORE: 0),
        oi:  (typeof NIFTY_50_OI_OBV_SCORE  !== 'undefined' ? NIFTY_50_OI_OBV_SCORE  : 0)
           + (typeof NIFTY_BANK_OI_OBV_SCORE!== 'undefined' ? NIFTY_BANK_OI_OBV_SCORE: 0)
           + (typeof RELIANCE_OI_OBV_SCORE  !== 'undefined' ? RELIANCE_OI_OBV_SCORE  : 0)
           + (typeof HDFCBANK_OI_OBV_SCORE  !== 'undefined' ? HDFCBANK_OI_OBV_SCORE  : 0)
           + (typeof ICICIBANK_OI_OBV_SCORE !== 'undefined' ? ICICIBANK_OI_OBV_SCORE : 0),
        comp:(typeof NIFTY_50_COMPONENT_SCORE  !== 'undefined' ? NIFTY_50_COMPONENT_SCORE  : 0)
           + (typeof NIFTY_BANK_COMPONENT_SCORE!== 'undefined' ? NIFTY_BANK_COMPONENT_SCORE: 0)
    };
    live.total = live.n915 + live.ad + live.ft + live.oi + live.comp;

    var lastRow = GTB_AD_INTERVAL_HISTORY[GTB_AD_INTERVAL_HISTORY.length - 1];
    var hb = null;
    if (lastRow) {
        var _had = _adScore(lastRow.nAdv, lastRow.nDec) + _adScore(lastRow.bnAdv, lastRow.bnDec) + _adScore(lastRow.allAdv, lastRow.allDec);
        var _hft = _ftScore(lastRow.allFBull||0, lastRow.allFBear||0) + _ftScore(lastRow.nFBull||0, lastRow.nFBear||0) + _ftScore(lastRow.bnFBull||0, lastRow.bnFBear||0);
        var _hoi = _oiScoreAllAtTime(lastRow.time);   // per-candle reconstruction
        var _hcomp = _compScoreAtTime(lastRow.time);
        hb = { time: lastRow.time, n915: fixed915, ad: _had, ft: _hft, oi: _hoi, comp: _hcomp,
               total: fixed915 + _had + _hft + _hoi + _hcomp };
    }
    function _bd(v) { v = parseFloat(v) || 0; var c = v > 0 ? '#3fb950' : v < 0 ? '#f85149' : '#7d8590'; return '<td style="text-align:right;padding:2px 8px;font-family:monospace;color:' + c + ';">' + (v >= 0 ? '+' : '') + v.toFixed(2) + '</td>'; }
    var html = '';
    if (hb) {
        html += '<div style="padding:5px 6px;border-bottom:1px solid #ffffff15;">';
        html += '<div style="font-size:0.55rem;color:#fbbf24;font-weight:700;margin-bottom:3px;"><i class="bi bi-bug"></i> SCORE BREAKDOWN — Live panel vs ' + hb.time + ' row</div>';
        html += '<table style="width:100%;border-collapse:collapse;font-size:0.58rem;color:#c9d1d9;">';
        html += '<thead><tr style="color:#7d8590;"><th style="text-align:left;padding:2px 8px;"></th><th style="text-align:right;padding:2px 8px;">9:15</th><th style="text-align:right;padding:2px 8px;">A/D</th><th style="text-align:right;padding:2px 8px;">FUT</th><th style="text-align:right;padding:2px 8px;">OI</th><th style="text-align:right;padding:2px 8px;">COMP</th><th style="text-align:right;padding:2px 8px;">TOTAL</th></tr></thead><tbody>';
        html += '<tr><td style="padding:2px 8px;color:#7d8590;">LIVE</td>' + _bd(live.n915) + _bd(live.ad) + _bd(live.ft) + _bd(live.oi) + _bd(live.comp) + _bd(live.total) + '</tr>';
        html += '<tr><td style="padding:2px 8px;color:#7d8590;">' + hb.time + '</td>' + _bd(hb.n915) + _bd(hb.ad) + _bd(hb.ft) + _bd(hb.oi) + _bd(hb.comp) + _bd(hb.total) + '</tr>';
        html += '<tr style="border-top:1px solid #ffffff15;"><td style="padding:2px 8px;color:#fbbf24;">Delta</td>'
              + _bd(hb.n915 - live.n915) + _bd(hb.ad - live.ad) + _bd(hb.ft - live.ft) + _bd(hb.oi - live.oi) + _bd(hb.comp - live.comp) + _bd(hb.total - live.total) + '</tr>';
        html += '</tbody></table></div>';
    }

    // ── Table ─────────────────────────────────────────────────────────────────
    html += '<div style="font-size:0.55rem;color:#7d8590;padding:3px 5px 2px;border-bottom:1px solid #ffffff10;">'
             + '<i class="bi bi-info-circle"></i>&nbsp;'
             + '9:15 fixed  *  A/D, Futures, OI/OBV &amp; Component reconstructed per interval (independent of the live Score panel)'
             + '</div>';

    html += '<table style="width:100%;border-collapse:collapse;font-size:0.6rem;">';
    html += '<thead><tr style="color:#7d8590;border-bottom:1px solid #ffffff15;">'
         + '<th style="padding:3px 5px;text-align:left;white-space:nowrap;">Time</th>'
         + '<th style="padding:3px 5px;text-align:right;white-space:nowrap;">N50 A/D</th>'
         + '<th style="padding:3px 5px;text-align:right;white-space:nowrap;">BN A/D</th>'
         + '<th style="padding:3px 5px;text-align:right;white-space:nowrap;">FT</th>'
         + '<th style="padding:3px 5px;text-align:right;white-space:nowrap;" title="OI/OBV score (5 instruments) reconstructed per candle (independent of the live panel)">OI</th>'
         + '<th style="padding:3px 5px;text-align:right;white-space:nowrap;">Score</th>'
         + '<th style="padding:3px 5px;min-width:60px;"></th>'
         + '</tr></thead><tbody>';

    // OI + Component reconstructed per interval (independent of the live snapshot
    // panel — the two are intentionally separate). A/D and Futures vary per interval too.
    var _prevOI = null;
    GTB_AD_INTERVAL_HISTORY.forEach(function(row) {
        // A/D scores
        var nAd  = _adScore(row.nAdv,   row.nDec);
        var bnAd = _adScore(row.bnAdv,  row.bnDec);
        var aAd  = _adScore(row.allAdv, row.allDec);

        // Futures trend scores (per-interval cumulative bull/bear)
        var allFt = _ftScore(row.allFBull || 0, row.allFBear || 0);
        var nFt   = _ftScore(row.nFBull   || 0, row.nFBear   || 0);
        var bnFt  = _ftScore(row.bnFBull  || 0, row.bnFBear  || 0);
        var ftTotal = allFt + nFt + bnFt;

        // OI/OBV score: per-candle reconstruction (falls back to snapshot if no data)
        var oiAtTime = _oiScoreAllAtTime(row.time);
        // Component score: per-candle using candle close for current_trend
        var compAtTime = _compScoreAtTime(row.time);

        var s = parseFloat((fixed915 + oiAtTime + compAtTime + nAd + bnAd + aAd + ftTotal).toFixed(2));
        var col = _scoreColor(s);

        // OI trend arrow vs previous interval
        var oiArrow = '';
        if (_prevOI !== null) {
            if      (oiAtTime > _prevOI + 0.01) oiArrow = '<span style="color:#3fb950;">▲</span>';
            else if (oiAtTime < _prevOI - 0.01) oiArrow = '<span style="color:#f85149;">▼</span>';
            else                                oiArrow = '<span style="color:#7d8590;"> * </span>';
        }
        _prevOI = oiAtTime;

        // N50 A/D compact
        function _ad2(adv, dec) {
            var diff = adv - dec;
            var c2 = diff > 0 ? '#3fb950' : diff < 0 ? '#f85149' : '#7d8590';
            return '<span style="color:#c9d1d9;">' + adv + '</span><span style="color:#7d8590;">/</span>'
                 + '<span style="color:#c9d1d9;">' + dec + '</span>'
                 + '&nbsp;<span style="color:' + c2 + ';">(' + (diff > 0 ? '+' : '') + diff + ')</span>';
        }

        html += '<tr style="border-bottom:1px solid #ffffff08;">'
             + '<td style="padding:2px 5px;color:#7d8590;white-space:nowrap;">' + row.time + '</td>'
             + '<td style="padding:2px 5px;text-align:right;white-space:nowrap;">' + _ad2(row.nAdv,   row.nDec)  + '</td>'
             + '<td style="padding:2px 5px;text-align:right;white-space:nowrap;">' + _ad2(row.bnAdv,  row.bnDec) + '</td>'
             + '<td style="padding:2px 5px;text-align:right;white-space:nowrap;">' + _signed(ftTotal) + '</td>'
             + '<td style="padding:2px 5px;text-align:right;white-space:nowrap;">' + oiArrow + '&nbsp;' + _signed(oiAtTime) + '</td>'
             + '<td style="padding:2px 5px;text-align:right;white-space:nowrap;color:' + col + ';font-weight:600;">' + s + '</td>'
             + '<td style="padding:2px 5px;">' + _bar(s) + '</td>'
             + '</tr>';
    });

    html += '</tbody></table>';
    el.html(html);
}

// ─── OI + IV/OBV Strike Scoring ───────────────────────────────────────────────
//
// HOW SUPPORT AND RESISTANCE IS DETERMINED USING OI + IV/OBV
// ───────────────────────────────────────────────────────────
//
// RESISTANCE (market likely to reverse down at this strike):
//   CE OI↑ + CE IV falling  → CE WRITE  — call writers are selling premium here,
//                               capping upside. IV falls because supply of calls
//                               increases (writers push price down). Score: −w
//   CE OI↑ + CE IV rising   → CE BUY    — buyers are paying higher premium to own
//                               calls, expecting a breakout above this strike.
//                               Bullish signal. Score: +w
//
// SUPPORT (market likely to reverse up at this strike):
//   PE OI↑ + PE IV falling  → PE WRITE  — put writers are selling premium here,
//                               building a floor. IV falls because supply of puts
//                               increases. Bullish (writers confident of support).
//                               Score: +w
//   PE OI↑ + PE IV rising   → PE BUY    — buyers are paying higher premium to own
//                               puts (protection/speculation on fall). Bearish.
//                               Score: −w
//
// STRONG RESISTANCE (highest conviction bearish signal at a strike):
//   CE OI↑ + CE IV falling + PE OI↑ + PE IV rising
//   → CE WRITE + PE BUY = both sides confirm resistance; call writers capping,
//     put buyers hedging against fall. getOISignal() returns 'SELL'.
//
// STRONG SUPPORT (highest conviction bullish signal at a strike):
//   CE OI↑ + CE IV rising + PE OI↑ + PE IV falling
//   → CE BUY + PE WRITE = both sides confirm support; call buyers expecting breakout,
//     put writers confident price won't fall. getOISignal() returns 'BUY'.
//
// SHORT SQUEEZE (forced move up):
//   CE OI↓ + CE IV rising   → CE COV    — trapped call writers buying back (covering).
//                               Reduces resistance. Score: +w
//   PE OI↓ + PE IV falling  → PE UNWIND — put buyers exiting (longs unwinding).
//                               Removes downward hedge. Score: +w
//
// LONG UNWINDING (forced move down):
//   CE OI↓ + CE IV falling  → CE UNWIND — call longs exiting, confidence fading.
//                               Score: −w
//   PE OI↓ + PE IV rising   → PE COV    — put writers buying back, expecting more
//                               downside. Score: −w
//
// SIGNAL PRIORITY (what overrides what):
//   1. IV change (most direct — reflects actual premium buying/selling intent)
//   2. OBV cumulative sign (proxy when IV unavailable — reflects volume pressure)
//   3. Price direction alone (weakest — can be misleading due to delta moves)
//
// WEIGHTS:
//   ATM strike: w=2 (most price-sensitive, highest gamma, most relevant)
//   All other strikes: w=1
//   Full weight (w): price + IV/OBV both agree
//   Half weight (w×0.5): only IV/OBV signals (price flat or conflicting)
//   Low weight (w×0.3): only price direction (IV unavailable, OBV flat)
//
// OI WALL (absolute OI, not change):
//   Total PE OI > Total CE OI at a strike → support wall (+0.5)
//   Total CE OI > Total PE OI at a strike → resistance wall (−0.5)
// ─────────────────────────────────────────────────────────────────────────────
function scoreOIStrikeForSignal(item, isATM, priceChange) {
    let score = 0;
    let w = isATM ? 2 : 1; // ATM weighted 2× — highest gamma, most price-sensitive strike

    // Underlying price direction — threshold +/-0.1% filters noise
    let pc = parseFloat(priceChange) || 0;
    let priceUp   = pc >  0.1; // underlying moved up meaningfully
    let priceDown = pc < -0.1; // underlying moved down meaningfully

    // OI change since previous day close — positive = new positions added, negative = positions closed
    let chgCE = parseFloat(item['CHG_OI_CE']); // call OI change: +ve = new CE positions, −ve = CE positions closed
    let chgPE = parseFloat(item['CHG_OI_PE']); // put  OI change: +ve = new PE positions, −ve = PE positions closed
    let oiCE  = parseFloat(item['OI_CE']);      // total call OI — large value = strong resistance wall
    let oiPE  = parseFloat(item['OI_PE']);      // total put  OI — large value = strong support floor

    // ── Step 1: OBV (fallback signal when IV is not available) ───────────────
    // Cumulative OBV sign across all 5-min candles today:
    //   CE OBV > 0 → more volume traded on up-ticks of CE price = net buying pressure in calls
    //   CE OBV < 0 → more volume traded on down-ticks of CE price = net selling/writing pressure in calls
    //   PE OBV > 0 → net buying pressure in puts (bearish for underlying)
    //   PE OBV < 0 → net writing pressure in puts (bullish for underlying — writers building support)
    // NOTE: Using cumulative sign, not delta between last two candles.
    //   Delta only reflects the most recent 5-min move; cumulative reflects the full days pressure.
    let ceObvList = item['CE_OBV'];
    let peObvList = item['PE_OBV'];
    let ceObvCumulative = parseFloat(ceObvList[ceObvList.length - 1]['obv']);
    let peObvCumulative = parseFloat(peObvList[peObvList.length - 1]['obv']);
    let obvCEUp   = ceObvCumulative > 0; // net call buying pressure today
    let obvCEDown = ceObvCumulative < 0; // net call writing/selling pressure today
    let obvPEUp   = peObvCumulative > 0; // net put buying pressure today (bearish signal)
    let obvPEDown = peObvCumulative < 0; // net put writing pressure today (bullish — support building)

    // ── Step 2: IV change (primary signal — overrides OBV when available) ────
    // IV is calculated from Black-Scholes inversion on each 5-min candle using underlying spot price.
    // IV change directly tells us WHO is active at this strike:
    //   CE IV rising  (▲) → call buyers paying higher premium  = BUYING intent  → CE BUY
    //   CE IV falling (▼) → call writers increasing supply     = WRITING intent → CE WRITE (resistance)
    //   PE IV rising  (▲) → put buyers paying higher premium   = BUYING intent  → PE BUY  (bearish)
    //   PE IV falling (▼) → put writers increasing supply      = WRITING intent → PE WRITE (support floor)
    // Threshold +/-0.3% filters out noise from small random tick movements.
    // OBV cannot distinguish delta-driven price moves from actual buying/writing;
    // IV change is model-based and independent of underlying direction.
    let ceIvList = item['CE_IV'] || [];
    let peIvList = item['PE_IV'] || [];
    let ivCEUp = null, ivCEDown = null, ivPEUp = null, ivPEDown = null;

    if (ceIvList.length >= 2) {
        // Find last two valid (non-null) IV values — nulls occur if spot data was missing for that candle
        let ceIvCurr = null, ceIvPrev = null;
        for (let _i = ceIvList.length - 1; _i >= 0 && ceIvCurr === null; _i--) if (ceIvList[_i].iv !== null) ceIvCurr = ceIvList[_i].iv;
        for (let _i = ceIvList.length - 2; _i >= 0 && ceIvPrev === null; _i--) if (ceIvList[_i].iv !== null) ceIvPrev = ceIvList[_i].iv;
        if (ceIvCurr !== null && ceIvPrev !== null) {
            ivCEUp   = ceIvCurr > ceIvPrev + 0.3; // CE IV ↑ >0.3% = call buyers paying up = BUY signal
            ivCEDown = ceIvCurr < ceIvPrev - 0.3; // CE IV ↓ >0.3% = call writers selling = WRITE signal (resistance)
        }
    }
    if (peIvList.length >= 2) {
        let peIvCurr = null, peIvPrev = null;
        for (let _i = peIvList.length - 1; _i >= 0 && peIvCurr === null; _i--) if (peIvList[_i].iv !== null) peIvCurr = peIvList[_i].iv;
        for (let _i = peIvList.length - 2; _i >= 0 && peIvPrev === null; _i--) if (peIvList[_i].iv !== null) peIvPrev = peIvList[_i].iv;
        if (peIvCurr !== null && peIvPrev !== null) {
            ivPEUp   = peIvCurr > peIvPrev + 0.3; // PE IV ↑ >0.3% = put buyers paying up = bearish (PE BUY)
            ivPEDown = peIvCurr < peIvPrev - 0.3; // PE IV ↓ >0.3% = put writers selling = bullish (PE WRITE = support)
        }
    }

    // IV overrides OBV when available — IV is direct (premium intent), OBV is indirect (price volume proxy)
    if (ivCEUp !== null) { obvCEUp = ivCEUp;   obvCEDown = ivCEDown; }
    if (ivPEUp !== null) { obvPEUp = ivPEUp;   obvPEDown = ivPEDown; }

    // ── Step 3: CE OI Classification ─────────────────────────────────────────
    // Determine if call positions are being written (resistance building) or bought (bullish breakout).
    //
    // When CE OI increases (chgCE > 0) — new call positions are being opened:
    //   CE OI↑ + IV↓ (or OBV↓) → CE WRITE — writers selling calls, capping upside = RESISTANCE. Score −w
    //   CE OI↑ + IV↑ (or OBV↑) → CE BUY   — buyers opening calls, expecting rally = BULLISH.  Score +w
    //   Only IV/OBV signal (price flat/conflicting) → half weight (+/-w×0.5)
    //   Only price signal (IV unavailable, OBV flat) → low weight (+/-w×0.3)
    //
    // When CE OI decreases (chgCE < 0) — existing call positions are being closed:
    //   CE OI↓ + price↑ + IV↑ → CE COV    — short-covering: trapped writers buying back = BULLISH SQUEEZE. Score +w
    //   CE OI↓ + price↓ + IV↓ → CE UNWIND — long-unwinding: call buyers exiting = bearish confidence fading. Score −w
    let ceLabel = 'CE NEUTRAL';
    if (chgCE > 0) {
        // New CE positions opened — writing or buying?
        if      (priceDown && obvCEDown) { ceLabel = 'CE WRITE';  score -= w;       } // CE OI↑ + price↓ + IV/OBV↓ = call writing = RESISTANCE ✓
        else if (priceUp   && obvCEUp)   { ceLabel = 'CE BUY';    score += w;       } // CE OI↑ + price↑ + IV/OBV↑ = call buying = BULLISH ✓
        else if (obvCEDown)              { ceLabel = 'CE WRITE';  score -= w * 0.5; } // CE OI↑ + IV/OBV↓ only = likely writing despite price flat
        else if (obvCEUp)                { ceLabel = 'CE BUY';    score += w * 0.5; } // CE OI↑ + IV/OBV↑ only = likely buying despite price flat
        else if (priceDown)              { ceLabel = 'CE WRITE';  score -= w * 0.3; } // CE OI↑ + price↓ only = weak write signal (IV not available)
        else if (priceUp)                { ceLabel = 'CE BUY';    score += w * 0.3; } // CE OI↑ + price↑ only = weak buy signal
    } else if (chgCE < 0) {
        // Existing CE positions closed — covering or unwinding?
        if      (priceUp   && obvCEUp)   { ceLabel = 'CE COV';    score += w;       } // CE OI↓ + price↑ + IV↑ = short covering = BULLISH SQUEEZE ✓
        else if (priceDown && obvCEDown) { ceLabel = 'CE UNWIND'; score -= w;       } // CE OI↓ + price↓ + IV↓ = long unwinding = bearish conviction ✓
        else if (obvCEUp)                { ceLabel = 'CE COV';    score += w * 0.5; } // CE OI↓ + IV↑ only = likely short covering
        else if (obvCEDown)              { ceLabel = 'CE UNWIND'; score -= w * 0.5; } // CE OI↓ + IV↓ only = likely unwinding
        else if (priceUp)                { ceLabel = 'CE COV';    score += w * 0.3; } // price signal only
        else if (priceDown)              { ceLabel = 'CE UNWIND'; score -= w * 0.3; } // price signal only
    }

    // ── Step 4: PE OI Classification ─────────────────────────────────────────
    // Determine if put positions are being written (support building) or bought (bearish hedge).
    //
    // When PE OI increases (chgPE > 0) — new put positions are being opened:
    //   PE OI↑ + IV↓ (or OBV↓) → PE WRITE — writers selling puts, building a support floor = BULLISH.   Score +w
    //   PE OI↑ + IV↑ (or OBV↑) → PE BUY   — buyers buying puts for protection/speculation = BEARISH.   Score −w
    //
    //   Strong RESISTANCE signal (both sides confirm):
    //     CE OI↑ + CE IV↓ (CE WRITE) + PE OI↑ + PE IV↑ (PE BUY) → getOISignal() = 'SELL'
    //     Interpretation: call writers capping the top + put buyers hedging against fall = double-confirmed resistance
    //
    //   Strong SUPPORT signal (both sides confirm):
    //     CE OI↑ + CE IV↑ (CE BUY) + PE OI↑ + PE IV↓ (PE WRITE) → getOISignal() = 'BUY'
    //     Interpretation: call buyers expecting breakout + put writers confident floor holds = double-confirmed support
    //
    // When PE OI decreases (chgPE < 0) — existing put positions are being closed:
    //   PE OI↓ + price↓ + IV↓ → PE COV    — put writers buying back (short covering), expecting more downside. Score −w
    //   PE OI↓ + price↑ + IV↑ → PE UNWIND — put longs exiting (long unwinding), bearish hedge removed = mildly bullish. Score +w×0.5
    let peLabel = 'PE NEUTRAL';
    if (chgPE > 0) {
        // New PE positions opened — writing (support) or buying (bearish hedge)?
        if      (priceUp   && obvPEDown) { peLabel = 'PE WRITE';  score += w;       } // PE OI↑ + price↑ + IV/OBV↓ = put writing = SUPPORT FLOOR ✓
        else if (priceDown && obvPEUp)   { peLabel = 'PE BUY';    score -= w;       } // PE OI↑ + price↓ + IV/OBV↑ = put buying = BEARISH (downside hedge) ✓
        else if (obvPEDown)              { peLabel = 'PE WRITE';  score += w * 0.5; } // PE OI↑ + IV/OBV↓ only = likely put writing (support)
        else if (obvPEUp)                { peLabel = 'PE BUY';    score -= w * 0.5; } // PE OI↑ + IV/OBV↑ only = likely put buying (bearish)
        else if (priceUp)                { peLabel = 'PE WRITE';  score += w * 0.3; } // price signal only = weak support signal
        else if (priceDown)              { peLabel = 'PE BUY';    score -= w * 0.3; } // price signal only = weak bearish signal
    } else if (chgPE < 0) {
        // Existing PE positions closed — covering or unwinding?
        if      (priceDown && obvPEDown) { peLabel = 'PE COV';    score -= w;       } // PE OI↓ + price↓ + IV↓ = put writers covering = more downside expected ✓
        else if (priceUp   && obvPEUp)   { peLabel = 'PE UNWIND'; score += w * 0.5; } // PE OI↓ + price↑ + IV↑ = put longs exiting = bearish hedge removed (mildly bullish) ✓
        else if (obvPEDown)              { peLabel = 'PE COV';    score -= w * 0.5; } // IV/OBV↓ only
        else if (obvPEUp)                { peLabel = 'PE UNWIND'; score += w * 0.3; } // IV/OBV↑ only
        else if (priceDown)              { peLabel = 'PE COV';    score -= w * 0.3; } // price signal only
        else if (priceUp)                { peLabel = 'PE UNWIND'; score += w * 0.3; } // price signal only
    }

    // ── Step 5: OI Wall (absolute OI, not change) ────────────────────────────
    // Even without any OI change today, a large standing OI creates a gravitational wall.
    // Large PE OI > CE OI at strike = strong support floor (many put writers defending this level). +0.5
    // Large CE OI > PE OI at strike = strong resistance ceiling (many call writers capping here). −0.5
    if      (oiPE > oiCE) score += 0.5; // PE wall > CE wall = support dominant
    else if (oiCE > oiPE) score -= 0.5; // CE wall > PE wall = resistance dominant

    return { score: score, ceLabel: ceLabel, peLabel: peLabel };
}

// Derives a score from a full OI dataset (tableData + weighted PCR).
// Scores each strike then adds a weighted PCR signal on top.
function computeOIScoreFromData(oiData) {
    if (!oiData || !oiData.tableData || oiData.tableData.length === 0) return 0;

    let score = 0;
    let priceChange = oiData.priceChange || 0;
    jQ.each(oiData.tableData, function (index, item) {
        score += scoreOIStrikeForSignal(item, !!item['ATM_STRIKE'], priceChange).score;
    });

    // ── PCR (Put-Call Ratio) signal ───────────────────────────────────────────
    // PCR = Total PE OI / Total CE OI across all scanned strikes.
    // PCR > 1.0 → more put OI than call OI = put writers dominating = bullish (support floor stronger than resistance ceiling)
    // PCR < 1.0 → more call OI than put OI = call writers dominating = bearish (resistance stronger than support)
    // PCR > 1.3 = strong bullish bias; PCR < 0.7 = strong bearish bias.
    //
    // Weighted PCR: ATM strike counts 3×, all others 1×.
    // Deep OTM options are often institutional hedges unrelated to intraday direction;
    // weighting ATM focuses the ratio on the strikes that actually matter for todays move.
    //
    // chPCR = same ratio but using OI change (todays new positions only, not standing OI).
    // chPCR rising intraday = fresh money flowing into puts = bearish bias building.
    // chPCR falling intraday = fresh money flowing into calls = bullish bias building.
    let weightedPEOI = 0, weightedCEOI = 0;
    let weightedChPEOI = 0, weightedChCEOI = 0;
    jQ.each(oiData.tableData, function (index, item) {
        let w = item['ATM_STRIKE'] ? 3 : 1;
        weightedPEOI   += parseFloat(item['OI_PE'])     * w;
        weightedCEOI   += parseFloat(item['OI_CE'])     * w;
        weightedChPEOI += parseFloat(item['CHG_OI_PE']) * w;
        weightedChCEOI += parseFloat(item['CHG_OI_CE']) * w;
    });
    let pcr   = weightedCEOI   > 0 ? weightedPEOI   / weightedCEOI   : 1; // standing PCR
    let chPcr = weightedChCEOI > 0 ? weightedChPEOI / weightedChCEOI : 1; // intraday change PCR

    // Standing PCR score: reflects where the majority of option writers have built walls
    if      (pcr > 1.3)              score += 1;    // PCR >1.3: strong put wall = bullish (support dominant)
    else if (pcr >= 1.0)             score += 0.5;  // PCR 1–1.3: mild put dominance = slight bullish
    else if (pcr >= 0.7)             score -= 0.5;  // PCR 0.7–1: call dominance = slight bearish
    else                             score -= 1;    // PCR <0.7: heavy call wall = bearish (resistance dominant)

    // Change PCR score: reflects fresh money direction TODAY
    if (!isNaN(chPcr)) {
        if      (chPcr > 1.3)        score += 0.5;  // New put OI >> new call OI = fresh bullish positions
        else if (chPcr >= 1.0)       score += 0.25;
        else if (chPcr >= 0.7)       score -= 0.25;
        else                         score -= 0.5;  // New call OI >> new put OI = fresh bearish positions
    }

    return parseFloat(score.toFixed(2));
}

// Fetches OI/OBV for all unique weighted stocks that don't already have a full
// OI computation (NIFTY 50, NIFTY BANK, RELIANCE, HDFCBANK, ICICIBANK are handled
// separately by showPrictionProbabilty).  Uses ATM +/-2 strikes (5 total) to
// balance signal quality against API call volume (~20 calls per stock).
async function fetchWeightedStocksOIScore() {
    const alreadyComputed = new Set(['NIFTY 50', 'NIFTY BANK', 'RELIANCE', 'HDFCBANK', 'ICICIBANK']);
    const weightedNames   = new Set([
        ...Object.keys(NIFTY_50_WEIGHTED_STOCKS),
        ...Object.keys(NIFTY_BANK_WEIGHTED_STOCKS)
    ]);

    var names = [...weightedNames].filter(function (n) { return !alreadyComputed.has(n); });
    var CONC = 4;   // scan 4 stocks concurrently — balances speed vs Kite rate limits
    var done = 0;

    async function _scanOne(name) {
        try {
            // strikToShowOverride = 2 → ATM-2, ATM-1, ATM, ATM+1, ATM+2 (5 strikes)
            let oiData = await showTrendingOI(name, 2);
            done++;
            _gtbProgress('OI: ' + name + ' (' + done + '/' + names.length + ')');
            if (!oiData || !oiData.tableData) return;
            let oiScore = computeOIScoreFromData(oiData);
            if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
            INSTRUMENT_SCORE_MAP[name].oi_obv = oiScore;
            INSTRUMENT_SCORE_MAP[name].pcr    = oiData.pcr;
            INSTRUMENT_SCORE_MAP[name].chPcr  = oiData.chPcr;
            INSTRUMENT_SCORE_MAP[name].oiData = oiData;
        } catch (e) {
            done++;
            console.log("OI score error for " + name, e);
        }
    }

    for (let i = 0; i < names.length; i += CONC) {
        await Promise.all(names.slice(i, i + CONC).map(_scanOne));
    }
    _gtbProgress('OI scan done', 'green');
}

// Maps futures REMARK type to a +1/0/-1 score signal
function getFuturesTrendScore(remark) {
    // Bullish set must match the futures A/D scanner's BULLISH list
    // (Long, Short-Covering, Gambling, Defence-Buy-On-Decline, Bulls).
    // Short-Covering is BULLISH (shorts exiting) and Long-Unwinding is BEARISH
    // (longs exiting) despite the names containing "Short"/"Long".
    if (remark === 'LONG' || remark === 'SHOT_COVERING' || remark === 'BULLS_CONSOLIDATING'
        || remark === 'GAMBLING_BUY_NEWS_AND_EVENTS' || remark === 'DEFENCE_BUY_ON_DECLINE') return 1;
    if (remark === 'SHORT' || remark === 'LONG_UNWINDING' || remark === 'BEARS_COMING_SELL_ON_RISE'
        || remark === 'BEARS_CONSOLIDATING' || remark === 'CAUTION_WRITES_ERODING_PREMIUM') return -1;
    return 0;
}

// ── Unified futures-signal fetcher (NSE stocks/indices + MCX commodities) ──────
// Auto-detects the instrument type and routes to the right futures loader.
function _gtbIsMcxFuture(name) {
    return (typeof COMMODITIES_FUTURE_INSTRUMENT_LIST !== 'undefined')
        && COMMODITIES_FUTURE_INSTRUMENT_LIST.some(function (f) { return f.name === name; });
}
function _gtbHasNseFuture(name) {
    var n = name === 'NIFTY 50' ? 'NIFTY' : name === 'NIFTY BANK' ? 'BANKNIFTY' : name;
    return (typeof FUTURE_INTRUMENT_LIST !== 'undefined')
        && FUTURE_INTRUMENT_LIST.some(function (f) { return f.name === n; });
}
// Returns the futures res object (REMARK, trend, vwap, premium, PLUS, MINUS, quote …) or null.
async function getFuturesSignal(name) {
    try {
        if (_gtbIsMcxFuture(name))  return await showFutureDetailsMCX(name);
        if (_gtbHasNseFuture(name)) return await showFutureDetails(name);
        console.log('No futures contract (NSE or MCX) for ' + name);
    } catch (e) { console.log('getFuturesSignal error for ' + name, e); }
    return null;
}
// Renders a futures-signal card for `res` (from getFuturesSignal) into containerId.
function renderFuturesSignalCard(name, res, containerId) {
    if (!res) { jQ('#' + containerId).html('<div class="cmd-load" style="color:var(--gtb-red);">No futures contract for ' + name + '</div>'); return; }
    var sent = getFuturesTrendScore(res.REMARK);
    var txt = sent > 0 ? 'BULLISH' : sent < 0 ? 'BEARISH' : 'NEUTRAL';
    var col = sent > 0 ? 'var(--gtb-green)' : sent < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
    var exch = _gtbIsMcxFuture(name) ? 'MCX' : 'NSE';
    var h = '<div class="fsig-card">'
        + '<div class="fsig-hd"><span class="fsig-name">' + name + '</span>'
        + '<span class="fsig-exch">' + exch + '</span>'
        + '<span class="fsig-sent" style="color:' + col + ';">' + txt + '</span>'
        + '<span class="fsig-remark">' + (res.REMARK || '') + '</span></div>'
        + '<div class="gtb-futures-signals"><div class="gtb-fut-row bull">' + (res.PLUS || '—') + '</div>'
        + '<div class="gtb-fut-row bear">' + (res.MINUS || '—') + '</div></div>'
        + '<div class="gtb-futures-meta">' + (res.trend || '') + ' &nbsp; ' + (res.vwap || '') + '</div>'
        + '</div>';
    jQ('#' + containerId).html(h);
}

// Futures-Signal popup — fetch the futures signal for any typed/picked instrument.
async function _gtbFetchFuturesSignalUI(name) {
    name = (name || '').trim();
    if (!name) return;
    var up = name.toUpperCase();
    if (up === 'NIFTY') up = 'NIFTY 50';
    if (up === 'BANKNIFTY' || up === 'BANK NIFTY') up = 'NIFTY BANK';
    name = up;
    jQ('#fsig-result').html('<div class="cmd-load"><i class="bi bi-hourglass-split"></i> Loading ' + name + '…</div>');
    try {
        var res = await getFuturesSignal(name);
        renderFuturesSignalCard(name, res, 'fsig-result');
    } catch (e) {
        jQ('#fsig-result').html('<div class="cmd-load" style="color:var(--gtb-red);">Error: ' + (e && e.message) + '</div>');
    }
}
jQ(document).on('click', '#show-futures-signal', function (e) {
    e.preventDefault();
    var picks = ['NIFTY 50', 'NIFTY BANK', 'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS', 'WIPRO', 'SBIN', 'CRUDEOILM', 'USDINR'];
    var body = '<div class="fsig-wrap">'
        + '<div class="fsig-bar"><input id="fsig-input" type="text" placeholder="Type an instrument — e.g. INFY, WIPRO, CRUDEOILM, NIFTY 50" autocomplete="off" />'
        + '<button id="fsig-go" class="oic-mode-btn"><i class="bi bi-search"></i> Get signal</button></div>'
        + '<div class="fsig-picks">' + picks.map(function (p) { return '<button class="fsig-pick" data-name="' + p + '">' + p + '</button>'; }).join('') + '</div>'
        + '<div id="fsig-result" class="fsig-result"><div class="cmd-load">Pick an instrument above or type any NSE F&O stock / index / MCX commodity.</div></div>'
        + '</div>';
    showMaximizeOverlay('<i class="bi bi-graph-up"></i> Futures Signal — any instrument (NSE / MCX)', body);
});
jQ(document).on('click', '#fsig-go', function () { _gtbFetchFuturesSignalUI(jQ('#fsig-input').val()); });
jQ(document).on('keydown', '#fsig-input', function (e) { if (e.key === 'Enter') _gtbFetchFuturesSignalUI(jQ(this).val()); });
jQ(document).on('click', '.fsig-pick', function () {
    var n = jQ(this).data('name');
    jQ('#fsig-input').val(n);
    _gtbFetchFuturesSignalUI(n);
});

// Computes a score breakdown for a single instrument using cached data (no API calls)
function computeInstrumentScore(name) {
    let score = { nine_fifteen: 0, current_trend: 0, futures_trend: 0, oi_obv: 0, total: 0 };

    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN")) || {};
    if (breakOutNineFifteen[name]) {
        let c915 = breakOutNineFifteen[name]['CLOSE_9_15'];
        if      (c915 === 'AST') score.nine_fifteen = 2;
        else if (c915 === 'ASO') score.nine_fifteen = 1;
        else if (c915 === 'BST') score.nine_fifteen = -2;
        else if (c915 === 'BSO') score.nine_fifteen = -1;
    }

    try {
        let trend = generateTrend(name);
        let trends = trend.trends || [];
        if (trends.indexOf('AST') !== -1) score.current_trend = 2;
        else if (trends.indexOf('ASO') !== -1) score.current_trend = 1;
        else if (trends.indexOf('BST') !== -1) score.current_trend = -2;
        else if (trends.indexOf('BSO') !== -1) score.current_trend = -1;
    } catch (e) {}

    if (INSTRUMENT_SCORE_MAP[name]) {
        if (INSTRUMENT_SCORE_MAP[name].futures_trend !== undefined) {
            score.futures_trend = INSTRUMENT_SCORE_MAP[name].futures_trend;
        }
        if (INSTRUMENT_SCORE_MAP[name].oi_obv !== undefined) {
            score.oi_obv = INSTRUMENT_SCORE_MAP[name].oi_obv;
        }
    }

    score.total = score.nine_fifteen + score.current_trend + score.futures_trend + score.oi_obv;
    return score;
}

// Aggregates weighted component scores for Nifty 50 and Bank Nifty top constituents
function computeComponentScores() {
    let n50Score = 0;
    let bnScore = 0;

    jQ.each(NIFTY_50_WEIGHTED_STOCKS, function (name, weight) {
        try {
            let s = computeInstrumentScore(name);
            if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
            INSTRUMENT_SCORE_MAP[name].score = s;
            n50Score += s.total * (weight / 100);
        } catch (e) {}
    });

    jQ.each(NIFTY_BANK_WEIGHTED_STOCKS, function (name, weight) {
        try {
            let s = computeInstrumentScore(name);
            if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
            INSTRUMENT_SCORE_MAP[name].score = s;
            bnScore += s.total * (weight / 100);
        } catch (e) {}
    });

    NIFTY_50_COMPONENT_SCORE = parseFloat(n50Score.toFixed(2));
    NIFTY_BANK_COMPONENT_SCORE = parseFloat(bnScore.toFixed(2));
}

// ── Overview banner renderer ──────────────────────────────────────────────
// Populates #gtb-overview from the composite SCORE + marketSignal + score map.
// Non-critical: wrapped in try/catch by the caller.
function _renderGtbOverview(score, marketSignal) {
    var sig = (marketSignal && marketSignal.signal) || 'WAIT';

    // Verdict colour class by signal
    var verdictCls = 'neutral';
    if (sig.indexOf('STRONG BUY') >= 0)  verdictCls = 'strong-buy';
    else if (sig.indexOf('BUY') >= 0)    verdictCls = 'buy';
    else if (sig.indexOf('STRONG SELL') >= 0) verdictCls = 'strong-sell';
    else if (sig.indexOf('SELL') >= 0)   verdictCls = 'sell';

    var ov = jQ('#gtb-ov-verdict');
    ov.text(sig).attr('class', 'gtb-ov-verdict ' + verdictCls);
    jQ('#gtb-ov-verdict-sub').text((marketSignal && marketSignal.reason) || '');

    // Composite score number + colour band
    var scoreCls = score < 0 ? 'red' : score < 5 ? 'orange' : score < 8 ? 'yellow' : 'green';
    jQ('#gtb-ov-score').text((score > 0 ? '+' : '') + parseFloat(score).toFixed(1))
        .attr('class', 'gtb-ov-score ' + scoreCls);

    // Instrument breadth — bullish vs bearish per score.total
    var names = ['GIFT NIFTY','NIFTY 50','NIFTY BANK','SENSEX','CRUDEOILM','USDINR','RELIANCE','HDFCBANK','ICICIBANK'];
    var bull = 0, bear = 0;
    names.forEach(function(n) {
        var sm = INSTRUMENT_SCORE_MAP[n] && INSTRUMENT_SCORE_MAP[n].score;
        var t = sm ? sm.total : (INSTRUMENT_SCORE_MAP[n] ? INSTRUMENT_SCORE_MAP[n].futures_trend : 0);
        if (t > 0) bull++; else if (t < 0) bear++;
    });
    var total = bull + bear || 1;
    jQ('#gtb-ov-breadth-bull').css('width', (bull / total * 100) + '%');
    jQ('#gtb-ov-breadth-bear').css('width', (bear / total * 100) + '%');
    jQ('#gtb-ov-breadth-bull-n').text(bull + ' ▲');
    jQ('#gtb-ov-breadth-bear-n').text(bear + ' ▼');

    // Mirror A/D + VIX from existing widgets (already populated elsewhere)
    var n50ad = jQ('#gtb-adr-n50').text().replace('N50 A/D', '').replace('N50', '').trim();
    var bnad  = jQ('#gtb-adr-bn').text().replace('BN A/D', '').replace('BN', '').trim();
    var vix   = jQ('#gtb-vix-val').text().trim();
    jQ('#gtb-ov-n50ad').text(n50ad || '—');
    jQ('#gtb-ov-bnad').text(bnad || '—');
    jQ('#gtb-ov-vix').text(vix || '—');

    // 9:15 breakout counts — ASO/AST (above) vs BSO/BST (below) across constituents
    try {
        var b915 = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}');
        function _count915(list) {
            var a = 0, b = 0;
            (list || []).forEach(function (nm) {
                var c = (b915[nm] || {})['CLOSE_9_15'];
                if (c === 'ASO' || c === 'AST') a++;
                else if (c === 'BSO' || c === 'BST') b++;
            });
            return { a: a, b: b };
        }
        function _fmt915(r) {
            return '<span style="color:var(--gtb-green);font-weight:800;">' + r.a + ' ▲</span>'
                 + '<span style="color:var(--gtb-muted);margin:0 3px;">/</span>'
                 + '<span style="color:var(--gtb-red);font-weight:800;">' + r.b + ' ▼</span>';
        }
        var _n50list = (typeof NIFTY_50_LIST   !== 'undefined') ? NIFTY_50_LIST   : [];
        var _bnlist  = (typeof NIFTY_BANK_LIST !== 'undefined') ? NIFTY_BANK_LIST : [];
        jQ('#gtb-ov-915-n50').html(_fmt915(_count915(_n50list)));
        jQ('#gtb-ov-915-bn').html(_fmt915(_count915(_bnlist)));
        jQ('#gtb-ov-915-all').html(_fmt915(_count915(Object.keys(b915))));
    } catch (e) {}
}

function setScore() {


    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));
    if (!breakOutNineFifteen) {
        breakOutNineFifteen = {}
    }

    // Compute 9:15 score for a single instrument including AST/BST levels
    function get915Score(name) {
        if (!breakOutNineFifteen[name]) return 0;
        let c = breakOutNineFifteen[name]['CLOSE_9_15'];
        if (c === 'AST') return 2;
        if (c === 'ASO') return 1;
        if (c === 'BST') return -2;
        if (c === 'BSO') return -1;
        return 0;
    }

    GIFT_NIFTY_9_15_CLOSE_SCORE  = get915Score('GIFT NIFTY');
    NIFTY_50_9_15_CLOSE_SCORE    = get915Score('NIFTY 50');
    NIFTY_BANK_9_15_CLOSE_SCORE  = get915Score('NIFTY BANK');
    SENSEX_9_15_CLOSE_SCORE      = get915Score('SENSEX');
    RELIANCE_9_15_CLOSE_SCORE    = get915Score('RELIANCE');
    HDFCBANK_9_15_CLOSE_SCORE    = get915Score('HDFCBANK');

    // ALL_9_15: weighted ratio of bullish vs bearish 9:15 candles across all stocks
    // AST/BST count double (score +/-2), ASO/BSO count once (+/-1)
    let bullishCount = 0, bearishCount = 0;
    jQ.each(breakOutNineFifteen, function (index, item) {
        let s = get915Score(index);
        if (s > 0) bullishCount += s;
        else if (s < 0) bearishCount += Math.abs(s);
    });
    let total915 = bullishCount + bearishCount;
    ALL_9_15_CLOSE_SCORE = total915 > 0
        ? parseFloat(((bullishCount - bearishCount) / total915).toFixed(2)) : 0;

    computeComponentScores();

    // Update OI matrix mini-tables and weightage bars in the instrument panel
    try { _gtbRenderOIMatrix('NIFTY 50'); } catch(e) {}
    try { _gtbRenderOIMatrix('NIFTY BANK'); } catch(e) {}
    try { _gtbRenderOIMatrix('RELIANCE'); } catch(e) {}
    try { _gtbRenderOIMatrix('HDFCBANK'); } catch(e) {}
    try { _gtbRenderOIMatrix('ICICIBANK'); } catch(e) {}
    try { _gtbUpdateWeightBars('NIFTY 50'); } catch(e) {}
    try { _gtbUpdateWeightBars('NIFTY BANK'); } catch(e) {}
    try { _gtbUpdateWeightBars('RELIANCE'); } catch(e) {}
    try { _gtbUpdateWeightBars('HDFCBANK'); } catch(e) {}
    try { _gtbUpdateWeightBars('ICICIBANK'); } catch(e) {}
    try { _gtbUpdateWeightBars('CRUDEOILM'); } catch(e) {}
    try { _gtbUpdateWeightBars('USDINR'); } catch(e) {}

    // Derive OI/OBV globals from INSTRUMENT_SCORE_MAP instead of accumulated mutation.
    // This prevents partial-refresh double-counting when setScore is called mid-cycle
    // (e.g., via the refresh button before all async OI fetches complete).
    function getOIScore(name) {
        return (INSTRUMENT_SCORE_MAP[name] && INSTRUMENT_SCORE_MAP[name].oi_obv) || 0;
    }
    NIFTY_50_OI_OBV_SCORE   = getOIScore('NIFTY 50');
    NIFTY_BANK_OI_OBV_SCORE = getOIScore('NIFTY BANK');
    RELIANCE_OI_OBV_SCORE   = getOIScore('RELIANCE');
    HDFCBANK_OI_OBV_SCORE   = getOIScore('HDFCBANK');
    ICICIBANK_OI_OBV_SCORE  = getOIScore('ICICIBANK');

    let SCORE = ALL_9_15_CLOSE_SCORE +
        NIFTY_50_9_15_CLOSE_SCORE +
        NIFTY_BANK_9_15_CLOSE_SCORE +
        GIFT_NIFTY_9_15_CLOSE_SCORE +
        SENSEX_9_15_CLOSE_SCORE +
        RELIANCE_9_15_CLOSE_SCORE +
        HDFCBANK_9_15_CLOSE_SCORE +
        ALL_ADVANCE_DECLINE_SCORE +
        NIFTY_50_ADVANCE_DECLINE_SCORE +
        NIFTY_BANK_ADVANCE_DECLINE_SCORE +
        ALL_FUTURES_TREND_SCORE +
        NIFTY_50_FUTURES_TREND_SCORE +
        NIFTY_BANK_FUTURES_TREND_SCORE +
        NIFTY_50_OI_OBV_SCORE +
        NIFTY_BANK_OI_OBV_SCORE +
        RELIANCE_OI_OBV_SCORE +
        HDFCBANK_OI_OBV_SCORE +
        ICICIBANK_OI_OBV_SCORE +
        NIFTY_50_COMPONENT_SCORE +
        NIFTY_BANK_COMPONENT_SCORE;

    SCORE = parseFloat(SCORE.toFixed(2));

    _renderGauge('#trend-scoreboard', SCORE, -40, 40);
    try { renderRangeScoreboard(); } catch(e) {}

    let pattern = ['#FF0000', '#F97600', '#F6C600', '#60B044']


    let scoreDisplay = parseFloat(SCORE).toFixed(2);
    if (SCORE < 0) {
        jQ("#score-board-number").html('<span class="badge" style="background-color:' + pattern[0] + ';font-size:0.85rem;padding:4px 10px;">' + scoreDisplay + '</span>');
    } else if (SCORE >= 1 && SCORE < 5) {
        jQ("#score-board-number").html('<span class="badge" style="background-color:' + pattern[1] + ';font-size:0.85rem;padding:4px 10px;">' + scoreDisplay + '</span>');
    } else if (SCORE >= 5 && SCORE < 8) {
        jQ("#score-board-number").html('<span class="badge" style="background-color:' + pattern[2] + ';font-size:0.85rem;padding:4px 10px;">' + scoreDisplay + '</span>');
    } else {
        jQ("#score-board-number").html('<span class="badge" style="background-color:' + pattern[3] + ';font-size:0.85rem;padding:4px 10px;">' + scoreDisplay + '</span>');
    }

    // --- Final market signal (score + VIX + futures conflict + 9:15 pattern) ---
    let marketSignal = getMarketSignal(SCORE, breakOutNineFifteen);

    // --- Overview banner (top of right panel) ---
    try { _renderGtbOverview(SCORE, marketSignal); } catch (e) { /* overview is non-critical */ }

    // ── Unified signal card render ────────────────────────────────────────────
    // Maps signal name → accent colour + icon
    const SIG_META = {
        'STRONG BUY':  { accent: '#3fb950', icon: 'bi-graph-up',  dimBg: 'rgba(63,185,80,0.12)'  },
        'BUY':         { accent: '#3fb950', icon: 'bi-arrow-up-circle-fill', dimBg: 'rgba(63,185,80,0.08)'  },
        'SELL':        { accent: '#f85149', icon: 'bi-arrow-down-circle-fill',dimBg: 'rgba(248,81,73,0.08)' },
        'STRONG SELL': { accent: '#f85149', icon: 'bi-exclamation-octagon-fill',dimBg:'rgba(248,81,73,0.12)'},
        'WAIT':        { accent: '#fbbf24', icon: 'bi-hourglass-split',      dimBg: 'rgba(251,191,36,0.08)' },
        'NO TRADE':    { accent: '#fbbf24', icon: 'bi-slash-circle-fill',    dimBg: 'rgba(251,191,36,0.08)' },
    };
    let sm   = SIG_META[marketSignal.signal] || { accent: '#7d8590', icon: 'bi-dash-circle', dimBg: 'rgba(125,133,144,0.08)' };
    let ts   = marketSignal.tradeSignal || { outcome: 'Sideways', level: 'No trade' };
    let outc = ts.outcome || 'Sideways';
    let outcAccent = outc === 'Buy' ? '#3fb950' : outc === 'Sell' ? '#f85149' : outc === 'Buy/Sell' ? '#fbbf24' : '#7d8590';

    let signalHtml = '<div style="background:' + sm.dimBg + ';border:1px solid ' + sm.accent + '33;border-radius:6px;padding:8px 10px;">'

    // Row 1: big signal badge + 9:15 pattern outcome pill on the right
    signalHtml += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">'
    signalHtml += '<span style="font-size:0.85rem;font-weight:900;color:' + sm.accent + ';letter-spacing:0.5px;">'
                + '<i class="bi ' + sm.icon + '" style="margin-right:5px;"></i>' + marketSignal.signal + '</span>'
    signalHtml += '<span style="font-size:0.65rem;font-weight:700;padding:2px 7px;border-radius:10px;background:' + outcAccent + '22;color:' + outcAccent + ';border:1px solid ' + outcAccent + '55;">'
                + outc + '</span>'
    signalHtml += '</div>'

    // Row 2: reason text
    signalHtml += '<div style="font-size:0.62rem;color:var(--gtb-muted,#7d8590);line-height:1.4;margin-bottom:6px;">' + marketSignal.reason + '</div>'

    // Row 3: divider
    signalHtml += '<div style="border-top:1px solid ' + sm.accent + '22;margin-bottom:6px;"></div>'

    // Row 4: entry level — derived from 9:15 close combo via inline strategyMap
    let n915   = breakOutNineFifteen['NIFTY 50']  ? breakOutNineFifteen['NIFTY 50']['CLOSE_9_15']  : 'B/W';
    let sx915  = breakOutNineFifteen['SENSEX']     ? breakOutNineFifteen['SENSEX']['CLOSE_9_15']    : 'B/W';
    let bn915  = breakOutNineFifteen['NIFTY BANK'] ? breakOutNineFifteen['NIFTY BANK']['CLOSE_9_15']: 'B/W';
    var _norm915 = _gtbNorm915;
    var _stratKey = _norm915(n915) + '-' + _norm915(sx915) + '-' + _norm915(bn915);
    var _stratLookup = GTB_STRAT_LOOKUP;   // shared map (see top-level definition)
    var _stratEntry = _stratLookup[_stratKey] || { outcome: 'Sideways', level: 'No trade' };
    var _stratLevel = _stratEntry.level;
    var _stratOutc  = _stratEntry.outcome;
    var _stratAccent = _stratOutc === 'Buy' ? '#3fb950' : _stratOutc === 'Sell' ? '#f85149' : _stratOutc === 'Buy/Sell' ? '#fbbf24' : '#7d8590';
    var levelIcon = _stratOutc === 'Buy' ? 'bi-arrow-up-circle' : _stratOutc === 'Sell' ? 'bi-arrow-down-circle' : _stratOutc === 'Buy/Sell' ? 'bi-arrow-left-right' : 'bi-dash-circle';

    // Level description — prominent, always shown
    signalHtml += '<div style="font-size:0.72rem;font-weight:700;color:' + _stratAccent + ';'
                + 'display:flex;align-items:flex-start;gap:5px;line-height:1.4;">'
                + '<i class="bi ' + levelIcon + '" style="margin-top:2px;flex-shrink:0;font-size:0.75rem;"></i>'
                + '<span>' + _stratLevel + '</span>'
                + '</div>'

    signalHtml += '</div>'
    jQ("#market-final-signal").html(signalHtml);
    jQ("#trend-scoreboard-outcome").html(''); // merged into market-final-signal above

    // ── SENSEX + GIFT NIFTY 9:15 badges on their own panels ─────────────────
    (function() {
        function _915badge(val) {
            var norm = (val === 'AST' || val === 'ASO') ? 'ASO'
                     : (val === 'BST' || val === 'BSO') ? 'BSO' : 'B/W';
            var raw  = val || 'B/W';
            var bull = (val === 'AST' || val === 'ASO');
            var bear = (val === 'BST' || val === 'BSO');
            var bg   = bull ? '#3fb95022' : bear ? '#f8514922' : '#ffffff0f';
            var col  = bull ? '#3fb950'   : bear ? '#f85149'   : '#7d8590';
            var bdr  = bull ? '#3fb95055' : bear ? '#f8514955' : '#ffffff20';
            var icon = bull ? 'bi-arrow-up-short' : bear ? 'bi-arrow-down-short' : 'bi-dash';
            return '<span style="display:inline-flex;align-items:center;gap:1px;'
                 + 'padding:1px 5px;border-radius:4px;background:' + bg + ';color:' + col
                 + ';border:1px solid ' + bdr + ';font-weight:600;">'
                 + '<i class="bi ' + icon + '"></i>' + raw
                 + '</span>';
        }
        var sx = (breakOutNineFifteen['SENSEX']     || {})['CLOSE_9_15'] || null;
        var gn = (breakOutNineFifteen['GIFT NIFTY'] || {})['CLOSE_9_15'] || null;
        jQ('#SENSEX-915-badge').html(sx ? _915badge(sx) : '');
        jQ('#GIFT-NIFTY-915-badge').html(gn ? _915badge(gn) : '');
    })();

    // Update top bar signal pill
    try { updateTopBarSignal(marketSignal.signal, getTradingWindow()); } catch(e) {}

    // --- Entry confluence panel (dark theme) ---
    (function() {
        let cf = getEntryConfluence(SCORE);
        let dirCls = cf.direction === 'LONG' ? 'long' : cf.direction === 'SHORT' ? 'short' : 'wait';
        let dirIcon = cf.direction === 'LONG' ? 'bi-arrow-up-circle-fill' : cf.direction === 'SHORT' ? 'bi-arrow-down-circle-fill' : 'bi-hourglass-split';

        let cfHtml = '<div class="gtb-trade-dir ' + dirCls + '"><i class="bi ' + dirIcon + '"></i>&nbsp;' + cf.direction + '</div>';
        cfHtml += '<div style="font-size:0.58rem;color:#64748b;margin-bottom:3px;">' + cf.reasons.join('  *  ') + '</div>';
        if (cf.pcrWarning) cfHtml += '<div style="font-size:0.58rem;color:#fbbf24;margin-bottom:3px;"><i class="bi bi-exclamation-triangle"></i> ' + cf.pcrWarning + '</div>';
        cfHtml += '<div style="font-size:0.55rem;color:#64748b;margin-bottom:4px;">';
        cfHtml += '<span style="color:#4ade80;"><i class="bi bi-check-circle"></i> ' + cf.bullish + ' bullish</span>';
        cfHtml += ' &nbsp; <span style="color:#f87171;"><i class="bi bi-x-circle"></i> ' + cf.bearish + ' bearish</span>';
        cfHtml += '</div>';

        // PCR badge
        if (cf.pcr && cf.pcr !== 1) {
            let pcrCls = cf.pcr > 1.3 ? '#4ade80' : cf.pcr < 0.7 ? '#f87171' : '#94a3b8';
            cfHtml += '<div style="font-size:0.6rem;font-weight:700;color:' + pcrCls + ';margin-bottom:4px;"><i class="bi bi-activity"></i> PCR ' + parseFloat(cf.pcr).toFixed(2) + '</div>';
        }

        jQ("#entry-confluence-panel").html(cfHtml);
    })();

    // Render left-panel auxiliary widgets
    try { renderPillars(); } catch(e) {}
    try { renderTopTradesPanel(); } catch(e) {}
    try { renderExitBanner(); } catch(e) {}
    try { updateTopBarTickers(); } catch(e) {}

    // trend-scoreboard-outcome is now merged into market-final-signal above

    html = ''
    html += '<table class="gtb-score-table" style="width:100%;">'
    html += '<thead><tr><th>Signal</th><th>Score</th><th>Info</th></tr></thead>'
    html += '<tbody>'

    function scoreRow(label, val, info) {
        let v = parseFloat(val);
        let bg = v > 0 ? 'background:var(--gtb-green-dim);' : v < 0 ? 'background:var(--gtb-red-dim);' : '';
        let vc = v > 0 ? 'color:var(--gtb-green);font-weight:900;' : v < 0 ? 'color:var(--gtb-red);font-weight:900;' : 'color:var(--gtb-muted);';
        let disp = isNaN(v) ? val : (v > 0 ? '+' : '') + v.toFixed(2);
        return '<tr style="' + bg + '"><td style="color:var(--gtb-text);">' + label + '</td><td style="' + vc + '">' + disp + '</td><td style="color:var(--gtb-muted);font-size:0.55rem;">' + (info || '') + '</td></tr>';
    }

    html += '<tr style="background:var(--gtb-surface2);"><td colspan="3" style="color:var(--gtb-muted);font-size:0.55rem;font-weight:800;letter-spacing:1px;">9:15 BREAKOUT</td></tr>'
    html += scoreRow('All stocks', ALL_9_15_CLOSE_SCORE)
    html += scoreRow('Nifty 50',   NIFTY_50_9_15_CLOSE_SCORE)
    html += scoreRow('Bank Nifty', NIFTY_BANK_9_15_CLOSE_SCORE)
    html += scoreRow('Gift Nifty', GIFT_NIFTY_9_15_CLOSE_SCORE)
    html += scoreRow('Sensex',     SENSEX_9_15_CLOSE_SCORE)
    html += scoreRow('Reliance',   RELIANCE_9_15_CLOSE_SCORE)
    html += scoreRow('HDFC Bank',  HDFCBANK_9_15_CLOSE_SCORE)

    html += '<tr style="background:var(--gtb-surface2);"><td colspan="3" style="color:var(--gtb-muted);font-size:0.55rem;font-weight:800;letter-spacing:1px;">ADVANCE / DECLINE</td></tr>'
    html += scoreRow('All',        ALL_ADVANCE_DECLINE_SCORE)
    html += scoreRow('Nifty 50',   NIFTY_50_ADVANCE_DECLINE_SCORE)
    html += scoreRow('Bank Nifty', NIFTY_BANK_ADVANCE_DECLINE_SCORE)

    html += '<tr style="background:var(--gtb-surface2);"><td colspan="3" style="color:var(--gtb-muted);font-size:0.55rem;font-weight:800;letter-spacing:1px;">FUTURES TREND</td></tr>'
    html += scoreRow('All',        ALL_FUTURES_TREND_SCORE)
    html += scoreRow('Nifty 50',   NIFTY_50_FUTURES_TREND_SCORE)
    html += scoreRow('Bank Nifty', NIFTY_BANK_FUTURES_TREND_SCORE)

    html += '<tr style="background:var(--gtb-surface2);"><td colspan="3" style="color:var(--gtb-muted);font-size:0.55rem;font-weight:800;letter-spacing:1px;">OI / OBV</td></tr>'
    html += scoreRow('Nifty 50',   NIFTY_50_OI_OBV_SCORE)
    html += scoreRow('Bank Nifty', NIFTY_BANK_OI_OBV_SCORE)
    html += scoreRow('Reliance',   RELIANCE_OI_OBV_SCORE)
    html += scoreRow('HDFC Bank',  HDFCBANK_OI_OBV_SCORE)
    html += scoreRow('ICICI Bank', ICICIBANK_OI_OBV_SCORE)

    // dummy continuation for the rest of the function that appended:
    html += '<tr style="display:none;"><td>ALL_ADVANCE_DECLINE_SCORE</td><td>' + ALL_ADVANCE_DECLINE_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>NIFTY_50_ADVANCE_DECLINE_SCORE</td>'
    html += '<td>' + NIFTY_50_ADVANCE_DECLINE_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>NIFTY_BANK_ADVANCE_DECLINE_SCORE</td>'
    html += '<td>' + NIFTY_BANK_ADVANCE_DECLINE_SCORE + '</td>'
    html += '</tr>'

    function scoreRowStyle(val) {
        let v = parseFloat(val);
        if (v > 0) return 'style="background:var(--gtb-green-dim);color:var(--gtb-green);"';
        if (v < 0) return 'style="background:var(--gtb-red-dim);color:var(--gtb-red);"';
        return '';
    }

    html += '<tr ' + scoreRowStyle(NIFTY_50_COMPONENT_SCORE) + '>'
    html += '<td><strong>N50 COMPONENT</strong> <small style="color:var(--gtb-muted)">(top-10 weighted)</small></td>'
    html += '<td><strong>' + parseFloat(NIFTY_50_COMPONENT_SCORE).toFixed(2) + '</strong></td><td></td>'
    html += '</tr>'

    html += '<tr ' + scoreRowStyle(NIFTY_BANK_COMPONENT_SCORE) + '>'
    html += '<td><strong>BN COMPONENT</strong> <small style="color:var(--gtb-muted)">(top-10 weighted)</small></td>'
    html += '<td><strong>' + parseFloat(NIFTY_BANK_COMPONENT_SCORE).toFixed(2) + '</strong></td><td></td>'
    html += '</tr>'

    function constituentRows(weightedMap, label) {
        let out = '<tr style="background:var(--gtb-surface2);"><td colspan="3" style="color:var(--gtb-muted);font-weight:800;font-size:0.58rem;letter-spacing:1px;">' + label + '</td></tr>'
        jQ.each(weightedMap, function (name, weight) {
            let s   = (INSTRUMENT_SCORE_MAP[name] && INSTRUMENT_SCORE_MAP[name].score) ? INSTRUMENT_SCORE_MAP[name].score : { nine_fifteen: '-', current_trend: '-', futures_trend: '-', oi_obv: '-', total: '-' };
            let pcr = INSTRUMENT_SCORE_MAP[name] ? (INSTRUMENT_SCORE_MAP[name].pcr || '-') : '-';
            let chP = INSTRUMENT_SCORE_MAP[name] ? (INSTRUMENT_SCORE_MAP[name].chPcr || '-') : '-';
            let totalNum = parseFloat(s.total);
            let rowBg = totalNum > 0 ? 'background:var(--gtb-green-dim);' : totalNum < 0 ? 'background:var(--gtb-red-dim);' : '';
            let valColor = totalNum > 0 ? 'color:var(--gtb-green);' : totalNum < 0 ? 'color:var(--gtb-red);' : 'color:var(--gtb-muted);';
            out += '<tr style="' + rowBg + '">'
            out += '<td style="font-size:0.58rem;' + valColor + 'font-weight:700;">' + name + ' <span style="color:var(--gtb-muted);font-weight:400;">(' + weight + '%)</span></td>'
            out += '<td style="font-size:0.58rem;color:var(--gtb-text);">9:<b>' + s.nine_fifteen + '</b> T:<b>' + s.current_trend + '</b> F:<b>' + s.futures_trend + '</b> OI:<b>' + s.oi_obv + '</b> <span style="' + valColor + 'font-weight:900;">=' + s.total + '</span></td>'
            out += '<td style="font-size:0.58rem;color:var(--gtb-muted);">' + pcr + ' | ' + chP + '</td>'
            out += '</tr>'
        });
        return out;
    }

    // Trading window + exit signal rows
    let tw = getTradingWindow();
    let twBg = tw === 'PRIME' ? 'background:var(--gtb-green-dim);color:var(--gtb-green);' : tw === 'OK' ? 'background:var(--gtb-amber-dim);color:var(--gtb-amber);' : 'background:var(--gtb-red-dim);color:var(--gtb-red);';
    html += '<tr style="' + twBg + '"><td><strong>TRADING WINDOW</strong></td><td><strong>' + tw + '</strong></td><td></td></tr>';

    let exitLong  = checkExitSignal('LONG');
    let exitShort = checkExitSignal('SHORT');
    let exitBg    = (exitLong === 'EXIT') ? 'background:var(--gtb-red-dim);color:var(--gtb-red);' : (exitShort === 'EXIT') ? 'background:var(--gtb-green-dim);color:var(--gtb-green);' : '';
    let exitInfo  = exitLong === 'EXIT' ? 'EXIT LONG (trend flipped bearish)' : exitShort === 'EXIT' ? 'EXIT SHORT (trend flipped bullish)' : 'HOLD — no flip yet';
    html += '<tr style="' + exitBg + '"><td><strong>EXIT SIGNAL</strong></td><td colspan="2"><strong>' + exitInfo + '</strong></td></tr>';

    html += constituentRows(NIFTY_50_WEIGHTED_STOCKS,   'NIFTY 50 — Top Constituent Scores');
    html += constituentRows(NIFTY_BANK_WEIGHTED_STOCKS, 'BANK NIFTY — Top Constituent Scores');

    html += '</tbody></table>'
    jQ("#trend-scoreboard-table").html(html);

}


function showStockComponent() {
    return ''; // table now lives in #gtb-right inside commonMarkupPlaceHolder
}

// Renders futures data returned by showFutureDetails() into the dashboard UI.
// Updates:
//   #{tempName}-futures       — LONG/SHORT signal badges (PLUS/MINUS)
//   #{tempName}-futures-premium — premium badge (green if contango/+ve, red if backwardation)
//   #{tempName}-futures-vwap  — VWAP trend label (price vs VWAP = bullish/bearish)
//   #{tempName}-futures-trend — futures REMARK badge (LONG/SHORT/UNWINDING etc.)
// Also stores remark in INSTRUMENT_SCORE_MAP[name].futures_trend for composite score.
function setFutureDetails(name, data, suffix) {
    suffix = suffix || '';
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    // Futures PLUS/MINUS are HTML strings of badge spans — render them as a compact 2-row layout.
    // Colour BOTH rows by the actual REMARK sentiment (not by position) so a bearish signal
    // like "Long Unwinding" never appears on a green/bullish row.
    var _sent = (typeof getFuturesTrendScore === 'function') ? getFuturesTrendScore(data['REMARK']) : 0;
    var _rowCls = _sent > 0 ? 'bull' : _sent < 0 ? 'bear' : 'neutral';
    let futHtml = '<div class="gtb-futures-signals">';
    futHtml += '<div class="gtb-fut-row ' + _rowCls + '">' + (data['PLUS'] || '—') + '</div>';
    futHtml += '<div class="gtb-fut-row ' + _rowCls + '">' + (data['MINUS'] || '—') + '</div>';
    futHtml += '</div>';
    jQ("#" + tempName + "-futures" + suffix).html(futHtml);

    if (name != "USDINR" && name != "CRUDEOILM") {
        let scriptData = generateTrend(name)
        let premium = parseFloat(parseFloat(data['quote']['close']) - parseFloat(scriptData['ltp']));
        let html = '';

        if (premium > 0) {
            html += '<span class="sv-badge sv-badge-green">+' + premium.toFixed(0) + '</span>';
        } else if (premium < 0) {
            html += '<span class="sv-badge sv-badge-red">' + premium.toFixed(0) + '</span>';
        } else {
            html += '<span class="sv-badge sv-badge-muted">' + premium.toFixed(0) + '</span>';
        }

        jQ("#" + tempName + "-futures-premium" + suffix).html(html);

        // Futures chart link — only on main panel (no suffix), not in stock viewer
        if (!suffix) {
            let html2 = '<a target="_blank" href="https://kite.zerodha.com/markets/ext/chart/web/tvc/NFO-FUT/' + data['tradingsymbol'] + '/' + data['instrument_token'] + '">FUTURES</a>';
            jQ("#futures-chart-" + tempName).html(html2);
        }
    }
    jQ("#" + tempName + "-futures-vwap" + suffix).html(data['vwap']);
    jQ("#" + tempName + "-futures-trend" + suffix).html(data['trend']);

    // Update futures strip at bottom — only on main panel
    if (!suffix) {
        try {
            let premium = 0;
            if (name !== 'USDINR' && name !== 'CRUDEOILM') {
                let scriptData = generateTrend(name);
                premium = parseFloat(data['quote']['close']) - parseFloat(scriptData['ltp']);
            }
            updateFuturesStrip(name, data['REMARK'], data['vwapPrice'] || data['vwap'], premium);
        } catch(e) {}
    }
}

function showAdvanceDecline() { return ''; }          // divs now inside tab panes
function showAdvanceDeclineFutures() { return ''; }   // divs now inside tab panes

function showTrendScoreBoard() {
    // Divs are now rendered inline inside commonMarkupPlaceHolder — this is a no-op stub.
    return '';
}

jQ(document).on("click", ".show-notes", function () {
    showNotes();
});

// Persist time picker value across topbar rebuilds
jQ(document).on("change", "#gtb-hist-time", function() {
    var t = jQ(this).val() || '';
    if (t) localStorage.setItem('GTB_HIST_TIME', t);
    else   localStorage.removeItem('GTB_HIST_TIME');
});

// Settings gear dropdown toggle
jQ(document).on("click", "#gtb-settings-toggle", function(e) {
    e.stopPropagation();
    var menu = jQ("#gtb-settings-menu");
    menu.toggle();
});
// Close settings menu when clicking outside
jQ(document).on("click", function(e) {
    if (!jQ(e.target).closest(".gtb-settings-wrap").length) {
        jQ("#gtb-settings-menu").hide();
    }
});


// ── Theme toggle (dark / light) ──────────────────────────────────────────────
function _gtbApplyTheme(theme) {
    // The maximize overlay is appended to <body>, outside #main-trade-bot-container,
    // so it needs the theme class applied directly to inherit the light palette.
    var container = jQ('#main-trade-bot-container').add('#groot-maximize-overlay');
    if (theme === 'light') container.addClass('gtb-light');
    else                    container.removeClass('gtb-light');
    localStorage.setItem('GTB_THEME', theme);
    // Reflect active state on the toggle buttons
    jQ('.gtb-theme-btn').each(function() {
        var active = jQ(this).data('theme') === theme;
        jQ(this).css({ background: active ? '#00b4d8' : 'transparent', color: active ? '#fff' : '#7d8590' });
    });
    // Live-recolour existing charts (no re-fetch) so they match the new theme
    _gtbRecolorCharts();
}

// Theme-aware LightweightCharts colours
function _gtbChartColors() {
    var light = jQ('#main-trade-bot-container').hasClass('gtb-light');
    return light
        ? { bg: '#ffffff', grid: '#e7edf4', bdr: '#c5d0de', text: '#5a6678' }
        : { bg: '#060a12', grid: '#122038', bdr: '#1b2d47', text: '#5c7499' };
}
// Recolour all live charts in place via applyOptions (no data re-fetch)
function _gtbRecolorCharts() {
    var c = _gtbChartColors();
    jQ('#gtb-rows .gtb-row-chart, [id$="-chart"]').each(function() {
        var ch = this._lwChart;
        if (!ch) return;
        try {
            ch.applyOptions({
                layout: { background: { color: c.bg }, textColor: c.text },
                grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
                rightPriceScale: { borderColor: c.bdr },
                timeScale: { borderColor: c.bdr },
            });
        } catch (e) {}
    });
}
jQ(document).on('click', '.gtb-theme-btn', function(e) {
    e.stopPropagation();
    _gtbApplyTheme(jQ(this).data('theme'));
});

// ── Row height slider — sets per-row min-height (taller = bigger charts) ──────
function _gtbApplyGridH(px) {
    jQ('#main-trade-bot-container')[0].style.setProperty('--gtb-row-h', px + 'px');
    jQ('#gtb-grid-h-val').text(px);
    localStorage.setItem('GTB_ROW_H', px);
    // Resize existing LW charts to match new row height
    jQ('#gtb-rows .gtb-row-chart').each(function() {
        if (this._lwChart) { try { this._lwChart.resize(this.clientWidth, this.clientHeight); } catch (e) {} }
    });
}
jQ(document).on('input', '#gtb-grid-h-slider', function() {
    _gtbApplyGridH(parseInt(jQ(this).val()));
});

// ── Column width sliders ────────────────────────────────────────────────────
function _gtbApplyColW(key, px) {
    var el = document.getElementById('main-trade-bot-container');
    if (el) el.style.setProperty('--gtb-col-' + key, px + 'px');
    jQ('.gtb-col-val[data-col="' + key + '"]').text(px);
    localStorage.setItem('GTB_COL_' + key.toUpperCase(), px);
    // Resize LW charts if chart column changed
    if (key === 'chart') {
        jQ('#gtb-rows .gtb-row-chart').each(function() {
            if (this._lwChart) { try { this._lwChart.resize(this.clientWidth, this.clientHeight); } catch(e) {} }
        });
    }
}
// Apply saved column widths on init
(function() {
    var cols = ['chart','fut','oi','oiobv','wt','detail'];
    var defs = { chart:260, fut:190, oi:210, oiobv:280, wt:170, detail:160 };
    cols.forEach(function(k) {
        var v = parseInt(localStorage.getItem('GTB_COL_' + k.toUpperCase()) || defs[k]);
        _gtbApplyColW(k, v);
    });
})();
jQ(document).on('input', '.gtb-col-slider', function() {
    _gtbApplyColW(jQ(this).data('col'), parseInt(jQ(this).val()));
});

// ── OI/OBV bar width slider ─────────────────────────────────────────────────
jQ(document).on('input', '#gtb-oi-bar-slider', function() {
    var pct = parseInt(jQ(this).val());
    localStorage.setItem('GTB_OI_BAR_W', pct);
    jQ('#gtb-oi-bar-val').text(pct + '%');
    // Re-render all OI/OBV bar charts using cached data (no API call)
    var _oiNames = ['NIFTY 50','NIFTY BANK','RELIANCE','HDFCBANK','ICICIBANK','CRUDEOILM','USDINR'];
    _oiNames.forEach(function(n) {
        try { showOIOBVBarChart(n); } catch(e) {}
    });
});

jQ(document).on("click", ".refresh-scoreboard", function () {
    let that = jQ(this);
    that.attr("disabled", true);
    setScore();
    that.attr("disabled", false);
});

// ── Generic popup window controls helper ────────────────────────────────────
/**
 * Returns HTML for minimize / maximize / close buttons for any popup window.
 * @param {string} popupClass  e.g. "popup-custom-style-oi-viewer-scanner"
 */
function popupWinControls(popupClass) {
    return '<span class="gtb-win-controls gtb-titlebar-win-controls" data-popup="' + popupClass + '" style="margin-left:auto;flex-shrink:0;">'
        + '<button class="gtb-win-btn popup-win-minimize" title="Minimize"><i class="bi bi-dash"></i></button>'
        + '<button class="gtb-win-btn popup-win-restore"  title="Maximize"><i class="bi bi-fullscreen"></i></button>'
        + '<button class="gtb-win-btn popup-win-close"    title="Close"><i class="bi bi-x-lg"></i></button>'
        + '</span>';
}

// After replacing a popup's titlebar text with our custom controls via popupWinControls(),
// call this to hide the native PopupWindow library buttons — otherwise both sets appear.
// The library adds individual buttons (.popupwindow_titlebar_button) — there is no
// wrapper container, so we target the shared base class that all four buttons carry.
function hideNativePopupButtons(popupClass) {
    jQ('.' + popupClass).find('.popupwindow_titlebar_button').hide();
}

jQ(document).on("click", ".popup-win-close", function () {
    let cls = jQ(this).closest('[data-popup]').data('popup');
    jQ('.' + cls).find('.popupwindow_titlebar_button_close').trigger('click');
});

jQ(document).on("click", ".popup-win-restore", function () {
    let btn   = jQ(this);
    let cls   = btn.closest('[data-popup]').data('popup');
    let popEl = jQ('.' + cls);
    let isMax = popEl.data('maximized') || false;
    popEl.find('.popupwindow_titlebar_button_maximize').trigger('click');
    // Toggle and persist maximized state so the next click goes the other way
    popEl.data('maximized', !isMax);
    if (isMax) {
        btn.find('i').removeClass('bi-fullscreen-exit').addClass('bi-fullscreen');
        btn.attr('title', 'Maximize').removeClass('is-active');
    } else {
        btn.find('i').removeClass('bi-fullscreen').addClass('bi-fullscreen-exit');
        btn.attr('title', 'Restore').addClass('is-active');
    }
    // Re-show content if it was collapsed by minimize
    let collapseTarget = popEl.find('.popup-win-content-area');
    if (collapseTarget.length) collapseTarget.show();
    btn.closest('[data-popup]').find('.popup-win-minimize')
        .removeClass('is-active').find('i').removeClass('bi-chevron-up').addClass('bi-dash');
    // Restore any height constraints imposed by minimize
    popEl.find('.popupwindow_content').show();
    popEl.css({ height: '', 'min-height': '', overflow: '' });
});

jQ(document).on("click", ".popup-win-minimize", function () {
    let btn   = jQ(this);
    let cls   = btn.closest('[data-popup]').data('popup');
    let popEl = jQ('.' + cls);
    let content = popEl.find('.popupwindow_content');
    if (content.is(':visible')) {
        content.hide();
        btn.find('i').removeClass('bi-dash').addClass('bi-chevron-up');
        btn.attr('title', 'Restore').addClass('is-active');
        popEl.css({ 'min-height': '0' });
    } else {
        content.show();
        btn.find('i').removeClass('bi-chevron-up').addClass('bi-dash');
        btn.attr('title', 'Minimize').removeClass('is-active');
        popEl.css({ 'min-height': '' });
    }
});

// ── Window control buttons ───────────────────────────────────────────────────
// Minimize: collapse the panel body, leaving only the topbar visible.
// This avoids the library's minimize which flows the popup to the bottom of
// the page and gets hidden behind the OS taskbar on Windows.
jQ(document).on("click", ".gtb-win-minimize", function () {
    let container = jQ('#main-trade-bot-container');
    let main      = container.find('#gtb-main');
    let btn       = jQ(this);
    let popupEl = jQ('.popup-custom-style-groot-trade-bot');
    if (main.is(':visible')) {
        main.hide();
        btn.find('i').removeClass('bi-dash').addClass('bi-chevron-up');
        btn.attr('title', 'Restore').addClass('is-active');
        popupEl.css({ height: '44px', 'min-height': '44px', overflow: 'hidden' });
    } else {
        main.show();
        btn.find('i').removeClass('bi-chevron-up').addClass('bi-dash');
        btn.attr('title', 'Minimise').removeClass('is-active');
        popupEl.css({ height: '', 'min-height': '', overflow: '' });
    }
});

// Maximize: trigger the library's maximize; update icon to reflect state.
jQ(document).on("click", ".gtb-win-restore", function () {
    let popupEl = jQ('.popup-custom-style-groot-trade-bot');
    let btn     = jQ(this);
    let isMaximized = popupEl.data('maximized') || false;
    popupEl.find('.popupwindow_titlebar_button_maximize').trigger('click');
    // Persist toggle state so next click goes the other way
    popupEl.data('maximized', !isMaximized);
    if (isMaximized) {
        btn.find('i').removeClass('bi-fullscreen-exit').addClass('bi-fullscreen');
        btn.attr('title', 'Maximise').removeClass('is-active');
    } else {
        btn.find('i').removeClass('bi-fullscreen').addClass('bi-fullscreen-exit');
        btn.attr('title', 'Restore').addClass('is-active');
    }
    // If panel was collapsed (minimized), restore it
    jQ('#gtb-main').show();
    jQ('.gtb-win-minimize').removeClass('is-active').find('i').removeClass('bi-chevron-up').addClass('bi-dash');
    popupEl.css({ height: '', 'min-height': '', overflow: '' });
});

// Close: trigger the library close button.
jQ(document).on("click", ".gtb-win-close", function () {
    jQ('.popup-custom-style-groot-trade-bot').find('.popupwindow_titlebar_button_close').trigger('click');
});

jQ(document).on("click", ".gtb-collapse-toggle", function (e) {
    // Don't collapse when clicking badges/buttons inside the header
    if (jQ(e.target).closest('.badge, button, a').length) return;
    let target = jQ(this).data("target");
    let body = jQ("#" + target);
    if (body.hasClass("hidden")) {
        body.removeClass("hidden");
        jQ(this).removeClass("collapsed");
    } else {
        body.addClass("hidden");
        jQ(this).addClass("collapsed");
    }
    // LightweightCharts canvas can blank when sibling sections change layout.
    // Re-trigger resize on all LW charts in the same column after collapse.
    let col = jQ(this).closest('.gtb-instr-col, .gtb-grid-card');
    col.find('.gtb-chart-area').each(function() {
        let lwc = this._lwChart;
        if (lwc) {
            setTimeout(function() {
                try { lwc.resize(col[0] ? col[0].clientWidth - 2 : 300, lwc.options().height || 150); } catch(err) {}
            }, 50);
        }
    });
});

// ── European Market Open Alert ────────────────────────────────────────────────
// European markets (Frankfurt/London) open ~09:00 CET/BST.
// In IST: winter (CET=UTC+1) → 13:30 IST; summer (CEST=UTC+2) → 12:30 IST.
// We alert at both 12:30 and 13:30 IST so it always fires on time regardless of DST.
(function startEuropeanMarketAlert() {
    let alerted = {};
    setInterval(function () {
        let now  = new Date();
        let h    = now.getHours();
        let m    = now.getMinutes();
        let key  = h + ':' + (m < 10 ? '0' + m : m);
        if (alerted[key]) return;
        if ((h === 12 && m === 30) || (h === 13 && m === 30)) {
            alerted[key] = true;
            let label = h === 12 ? 'Summer (CEST)' : 'Winter (CET)';
            let msg   = '<div style="display:flex;align-items:center;gap:8px;">'
                      + '<i class="bi bi-flag-fill" style="font-size:1.2rem;color:#60a5fa;"></i>'
                      + '<div>'
                      + '<div style="font-weight:800;font-size:0.8rem;">🇪🇺 European Market Open</div>'
                      + '<div style="font-size:0.7rem;color:#94a3b8;">' + label + ' session  *  ' + key + ' IST</div>'
                      + '</div>'
                      + '</div>';
            // Show as a styled overlay alert
            let alertEl = jQ('<div class="gtb-eu-alert">' + msg + '<button class="gtb-eu-alert-close"><i class="bi bi-x-lg"></i></button></div>');
            jQ('body').append(alertEl);
            setTimeout(function () { alertEl.addClass('gtb-eu-alert-visible'); }, 50);
            alertEl.find('.gtb-eu-alert-close').on('click', function () {
                alertEl.removeClass('gtb-eu-alert-visible');
                setTimeout(function () { alertEl.remove(); }, 400);
            });
            // Auto-dismiss after 2 minutes
            setTimeout(function () {
                alertEl.removeClass('gtb-eu-alert-visible');
                setTimeout(function () { alertEl.remove(); }, 400);
            }, 120000);
        }
    }, 30000); // check every 30s
})();

// ── Update top bar tickers from generateTrend ────────────────────────────────
function updateTopBarTickers() {
    try {
        let ltpPrices   = JSON.parse(localStorage.getItem("INSTRUMENT_LTP_PRICE")) || {};
        let openDetails = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL")) || {};

        let tickerMap = {
            'NIFTY-50':   'NIFTY 50',
            'NIFTY-BANK': 'NIFTY BANK',
            'SENSEX':     'SENSEX',
            'GIFT-NIFTY': 'GIFT NIFTY',
        };

        jQ.each(tickerMap, function(tid, name) {
            try {
                let ltpRaw = parseFloat((ltpPrices[name] || {}).ltp || 0);
                let prev   = parseFloat((openDetails[name] || {}).prevPrice || 0);
                if (!ltpRaw) return;
                let chg  = prev > 0 ? ((ltpRaw - prev) / prev * 100) : 0;
                let ltp  = ltpRaw.toLocaleString('en-IN', { maximumFractionDigits: 2 });
                let cls  = chg > 0.05 ? 'up' : chg < -0.05 ? 'down' : 'flat';
                let sign = chg > 0 ? '+' : '';
                jQ('#gtb-ltp-' + tid).text(ltp);
                jQ('#gtb-chg-' + tid).text(sign + chg.toFixed(2) + '%').removeClass('up down flat').addClass(cls);
            } catch(e) {}
        });

        // VIX — read live LTP directly from INSTRUMENT_LTP_PRICE ("INDIA VIX")
        // VIX_QUOTE holds prev-day close for % change calculation
        let vixLtp = parseFloat((ltpPrices['INDIA VIX'] || {}).ltp || 0);
        if (vixLtp > 0) {
            try {
                let stored  = JSON.parse(localStorage.getItem("VIX_QUOTE"));
                let prevVix = stored && stored.data && stored.data.candles && stored.data.candles.length
                              ? parseFloat(stored.data.candles[stored.data.candles.length - 1][4]) : 0;
                let chg  = prevVix > 0 ? ((vixLtp - prevVix) / prevVix * 100) : 0;
                let sign = chg > 0 ? '+' : '';
                let cls  = chg > 0.05 ? 'up' : chg < -0.05 ? 'down' : 'flat';
                jQ('#gtb-vix-val').text(vixLtp.toFixed(2));
                jQ('#gtb-vix-chg').text(sign + chg.toFixed(2) + '%').removeClass('up down flat').addClass(cls);
            } catch(e) { jQ('#gtb-vix-val').text(vixLtp.toFixed(2)); }
        }
    } catch(e) {}
}

// ── Update top bar master signal pill + window pill ──────────────────────────
function updateTopBarSignal(signal, window) {
    let pill = jQ('#gtb-signal-pill');
    let wpill = jQ('#gtb-window-pill');

    // Signal class
    let cls = signal.toLowerCase().replace(/ /g, '-').replace('_', '-');
    pill.attr('class', 'gtb-signal-pill ' + cls);
    let icon = signal.includes('BUY') ? 'bi-arrow-up-circle-fill'
             : signal.includes('SELL') ? 'bi-arrow-down-circle-fill'
             : signal === 'SIDEWAYS' ? 'bi-dash-circle-fill'
             : 'bi-hourglass-split';
    pill.html('<i class="bi ' + icon + '"></i> ' + signal);

    // Window class
    let wc = window === 'PRIME' ? 'prime' : window === 'OK' ? 'ok' : window === 'AVOID' ? 'avoid' : 'closed';
    wpill.attr('class', 'gtb-window-pill ' + wc).text(window);
}

// ── Render left-panel pillars ────────────────────────────────────────────────
function renderPillars() {
    let s = computeInstrumentScore('NIFTY 50');
    let oiN50 = (INSTRUMENT_SCORE_MAP['NIFTY 50']  && INSTRUMENT_SCORE_MAP['NIFTY 50'].oi_obv)  || 0;
    let oiBN  = (INSTRUMENT_SCORE_MAP['NIFTY BANK'] && INSTRUMENT_SCORE_MAP['NIFTY BANK'].oi_obv) || 0;
    let adNet = ALL_ADVANCE_DECLINE_SCORE + NIFTY_50_ADVANCE_DECLINE_SCORE;
    let futNet= (INSTRUMENT_SCORE_MAP['NIFTY 50'] && INSTRUMENT_SCORE_MAP['NIFTY 50'].futures_trend || 0)
              + (INSTRUMENT_SCORE_MAP['NIFTY BANK'] && INSTRUMENT_SCORE_MAP['NIFTY BANK'].futures_trend || 0);

    function pillarRow(label, val, icon) {
        let cls = val > 0 ? 'bull' : val < 0 ? 'bear' : 'flat';
        let sign = val > 0 ? '+' : '';
        return '<div class="gtb-pillar ' + cls + '"><span class="p-label"><i class="bi ' + icon + '"></i> ' + label + '</span><span class="p-val">' + sign + (typeof val === 'number' ? val.toFixed ? val.toFixed(2) : val : val) + '</span></div>';
    }

    let h = '';
    h += pillarRow('9:15 Breakout',  s.nine_fifteen,   'bi-clock-history');
    h += pillarRow('Current Trend',  s.current_trend,  'bi-graph-up');
    h += pillarRow('Futures Trend',  futNet,            'bi-graph-up');
    h += pillarRow('OI / OBV (N50)', oiN50,             'bi-bar-chart-fill');
    h += pillarRow('OI / OBV (BN)',  oiBN,              'bi-bar-chart');
    h += pillarRow('A/D Breadth',    adNet,             'bi-arrows-expand');
    h += pillarRow('N50 Component',  NIFTY_50_COMPONENT_SCORE,   'bi-pie-chart');
    h += pillarRow('BN Component',   NIFTY_BANK_COMPONENT_SCORE, 'bi-pie-chart-fill');

    // Confluence meter
    let cf = getEntryConfluence(0);
    let total = cf.bullish + cf.bearish;
    let pct   = total > 0 ? Math.round((Math.max(cf.bullish, cf.bearish) / total) * 100) : 0;
    let fillCls = cf.bullish >= cf.bearish ? 'bull' : 'bear';
    h += '<div style="margin-top:4px;">';
    h += '<div style="display:flex;justify-content:space-between;font-size:0.55rem;color:#64748b;margin-bottom:2px;">';
    h += '<span><i class="bi bi-check-circle"></i> ' + cf.bullish + ' bullish</span>';
    h += '<span>' + cf.bearish + ' bearish <i class="bi bi-x-circle"></i></span>';
    h += '</div>';
    h += '<div class="gtb-confluence-bar"><div class="gtb-confluence-fill ' + fillCls + '" style="width:' + pct + '%;"></div></div>';
    h += '</div>';

    jQ('#gtb-pillars-body').html(h);
}

// ── Render top-trades panel ──────────────────────────────────────────────────
function renderTopTradesPanel() {
    let stocks = getTradeableStocks();
    if (!stocks.length) {
        jQ('#gtb-top-trades-list').html('<div class="gtb-empty-msg"><i class="bi bi-hourglass-split"></i> Waiting for data…</div>');
        return;
    }
    let h = '';
    stocks.forEach(function(st) {
        let cls      = st.score > 0 ? 'bull' : st.score < 0 ? 'bear' : 'flat';
        let chgCls   = parseFloat(st.pChange) > 0 ? 'up' : parseFloat(st.pChange) < 0 ? 'down' : '';
        let scoreStr = (st.score > 0 ? '+' : '') + st.score;
        let volClass = parseFloat(st.volRatio) >= 1.3 ? 'vol-high' : 'vol-low';
        let strongDot = st.strong ? '<span class="tr-strong-dot" title="Strong setup"></span>' : '';
        let kiteToken = INSTRUMENT_TOKENS[st.name] || '';
        let kiteUrl   = 'https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/' + st.name + '/' + kiteToken;
        let sbUrl     = 'https://web.sensibull.com/option-strategy-builder?instrument_symbol=' + st.name;
        h += '<div class="gtb-trade-row ' + cls + '">';
        h += '<span class="tr-name">' + strongDot
            + '<a href="' + kiteUrl + '" target="_blank" class="oi-link" title="Kite chart" style="font-weight:700;">' + st.name + '</a>'
            + '<a href="' + sbUrl + '" target="_blank" class="oi-link" title="Sensibull Strategy Builder" style="margin-left:3px;font-size:0.58rem;">SB</a>'
            + '</span>';
        h += '<span class="tr-score">' + scoreStr + '</span>';
        h += '<span class="tr-vol ' + volClass + '" title="Volume vs avg">' + st.volRatio + 'x</span>';
        h += '<span class="tr-chg ' + chgCls + '">' + (parseFloat(st.pChange) > 0 ? '+' : '') + st.pChange + '%</span>';
        h += '</div>';
    });
    jQ('#gtb-top-trades-list').html(h);
}

// ── Render exit signal banner ────────────────────────────────────────────────
// Reads the user-selected direction from the LONG/SHORT/NONE buttons.
// Only checks exit for the direction the user says they are in.
let _gtbTradeDir = localStorage.getItem('GTB_TRADE_DIR') || 'NONE';

// Persist #scan-weighted-only state across refreshes (topbar is rebuilt each refresh)
jQ(document).on('change', '#scan-weighted-only', function () {
    localStorage.setItem('GTB_SCAN_WEIGHTED', jQ(this).is(':checked') ? '1' : '0');
});

jQ(document).on('click', '.gtb-dir-btn', function () {
    _gtbTradeDir = jQ(this).data('dir');
    localStorage.setItem('GTB_TRADE_DIR', _gtbTradeDir);
    jQ('.gtb-dir-btn').removeClass('active');
    jQ(this).addClass('active');
    renderExitBanner();
});

// Restore active state on load
jQ(document).ready(function () {
    _gtbTradeDir = localStorage.getItem('GTB_TRADE_DIR') || 'NONE';
    jQ('.gtb-dir-btn[data-dir="' + _gtbTradeDir + '"]').addClass('active');
});

function renderExitBanner() {
    let el  = jQ('#gtb-exit-signal');
    let dir = _gtbTradeDir;

    if (dir === 'NONE') {
        el.attr('class', 'gtb-exit-banner hold').html('<i class="bi bi-dash-circle"></i> No position — select LONG or SHORT above');
        return;
    }

    let result = checkExitSignal(dir);

    // Also show WHY the exit was triggered
    let s      = computeInstrumentScore('NIFTY 50');
    let n50Fut = (INSTRUMENT_SCORE_MAP['NIFTY 50']  && INSTRUMENT_SCORE_MAP['NIFTY 50'].futures_trend)  || 0;
    let bnFut  = (INSTRUMENT_SCORE_MAP['NIFTY BANK'] && INSTRUMENT_SCORE_MAP['NIFTY BANK'].futures_trend) || 0;

    if (result === 'EXIT') {
        let reasons = [];
        if (dir === 'LONG') {
            if (s.current_trend < 0)       reasons.push('trend bearish (' + s.current_trend + ')');
            if (n50Fut < 0 && bnFut < 0)   reasons.push('N50+BN futures bearish');
            el.attr('class', 'gtb-exit-banner exit-long')
              .html('<i class="bi bi-door-open-fill"></i> EXIT LONG — ' + reasons.join(', '));
        } else {
            if (s.current_trend > 0)       reasons.push('trend bullish (' + s.current_trend + ')');
            if (n50Fut > 0 && bnFut > 0)   reasons.push('N50+BN futures bullish');
            el.attr('class', 'gtb-exit-banner exit-short')
              .html('<i class="bi bi-door-open-fill"></i> EXIT SHORT — ' + reasons.join(', '));
        }
    } else {
        let trendVal = s.current_trend > 0 ? '+' + s.current_trend : s.current_trend;
        el.attr('class', 'gtb-exit-banner hold')
          .html('<i class="bi bi-shield-check"></i> HOLD ' + dir + ' — trend ' + trendVal + '  *  N50fut ' + n50Fut + '  *  BNfut ' + bnFut);
    }
}

// ── Update futures strip ─────────────────────────────────────────────────────
function updateFuturesStrip(name, remark, vwap, premium) {
    let tid = name.replace(/ /g, '-').replace(/&/g, '-');
    let remarkEl = jQ('#gtb-strip-remark-' + tid);
    if (!remarkEl.length) return;
    // Use the authoritative sentiment, not substring matching — "LONG_UNWINDING"
    // contains "LONG" but is bearish, so includes('LONG') wrongly flagged it bullish.
    let sent = (typeof getFuturesTrendScore === 'function') ? getFuturesTrendScore(remark) : 0;
    let cls  = sent > 0 ? 'long' : sent < 0 ? 'short' : 'other';
    let icon = sent > 0 ? '▲'    : sent < 0 ? '▼'     : '—';
    remarkEl.attr('class', 'gtb-fut-remark ' + cls).text(icon + ' ' + (remark || '—'));
    if (vwap)    jQ('#gtb-strip-vwap-' + tid).text('VWAP ' + parseFloat(vwap).toFixed(1));
    if (premium !== undefined) jQ('#gtb-strip-prem-' + tid).text('PREM ' + (premium > 0 ? '+' : '') + parseFloat(premium).toFixed(1));
}

jQ(document).on("click", ".refresh-stock-list", function () {
    let that = jQ(this);
    that.attr("disabled", true);
    showStockList([]);
    that.attr("disabled", false);
});

// ── Section info popovers ─────────────────────────────────────────────────────
// Each key maps to a short explanation shown when its (i) icon is clicked.
var GTB_INFO = {
    score:        { icon:'bi-speedometer2',     title:'Score Gauge',
        body:'The composite market score on a −40…+40 dial. It sums every signal: 9:15 breakouts, advance/decline breadth, futures trend, OI/OBV, and weighted index constituents. Gauge colour: <b style="color:#f85149">red &lt;0</b>, <b style="color:#d29922">orange 1–4</b>, <b style="color:#fbbf24">yellow 5–7</b>, <b style="color:#3fb950">green ≥8</b>. Below it: live N50 &amp; Bank-Nifty advance/decline counts.' },
    rangesb:      { icon:'bi-bar-chart-line-fill', title:'Range Scoreboard',
        body:'Each sub-score (9:15, Adv/Dec, Futures, OI/OBV, Component) is shown as a range bar spanning its min/max. The needle shows the live value. The bottom verdict (LONG / WAIT / SHORT) is based on the composite score: <b style="color:#3fb950">LONG ≥ 5</b>, <b style="color:#f85149">SHORT &lt; 0</b>, otherwise WAIT. Bar segments: red (bearish) → yellow (neutral) → green (bullish).' },
    signal:       { icon:'bi-lightning-charge', title:'Trade Signal',
        body:'The final call — STRONG BUY  *  BUY  *  WAIT  *  SELL  *  STRONG SELL  *  NO TRADE — derived from the composite score combined with VIX, any futures conflict, and the 9:15 candle pattern. The sub-line gives the suggested entry level (e.g. "at BSO/BST for long").' },
    entry:        { icon:'bi-crosshair',        title:'Entry / Trade',
        body:'Entry-confluence panel: how strongly 9:15, current trend, futures and OI agree, and the resulting bullish/bearish tilt that supports an entry here.' },
    pillars:      { icon:'bi-bar-chart-steps',  title:'Pillars',
        body:'The individual scoring pillars and each one contribution to the total: 9:15 close, advance/decline, futures trend, OI/OBV, and the weighted index components.' },
    toptrades:    { icon:'bi-stars',            title:'Top Trades',
        body:'The instruments ranked highest (and lowest) by composite score this cycle — your best long and short candidates right now.' },
    scoredetail:  { icon:'bi-table',            title:'Score Detail',
        body:'Full breakdown table: every score component and each weighted constituent contribution, so you can see exactly what drives the total.' },
    scorehistory: { icon:'bi-clock-history',    title:'Score History',
        body:'The composite score reconstructed at each 5-minute candle of the day (A/D, futures, OI/OBV and components recomputed per interval) so you can see how the score evolved.' },
    verdict:      { icon:'bi-flag-fill',        title:'Market Verdict',
        body:'The headline market call with a one-line reason. It blends the composite score, VIX state and the 9:15 pattern into a plain-English verdict.' },
    compscore:    { icon:'bi-123',              title:'Composite Score',
        body:'The total score number (−40…+40). The further from zero, the stronger the directional confluence. Positive = bullish, negative = bearish.' },
    breadth:      { icon:'bi-distribute-horizontal', title:'Instrument Breadth',
        body:'Of the 9 tracked instruments (GIFT NIFTY, NIFTY 50, NIFTY BANK, SENSEX, CRUDEOILM, USDINR, RELIANCE, HDFCBANK, ICICIBANK), how many are net-bullish ▲ vs net-bearish ▼ by their own composite score. The bar shows the split.' },
    ov915:        { icon:'bi-clock',            title:'9:15 Breakout Count',
        body:'How many constituents closed their 9:15 candle <b style="color:#00e5a0">above</b> their ASO/AST level (▲ bullish) vs <b style="color:#ff4d6a">below</b> their BSO/BST level (▼ bearish). Shown for NIFTY 50, BANK NIFTY, and ALL scanned stocks. A strong skew sets the days opening bias.' },
    keystats:     { icon:'bi-clipboard-data',   title:'Key Stats',
        body:'N50 &amp; Bank-Nifty advance/decline (A = above breakout, D = below, N = within range, net, and the A÷D ratio) plus the live India VIX.' },
    'col-instrument': { icon:'bi-tag',          title:'Instrument',
        body:'Name and live LTP of each tracked instrument. The coloured left tab marks its type: <b style="color:#00b4d8">cyan = index</b>, <b style="color:#ffbe0b">amber = commodity</b>, <b style="color:#38bdf8">blue = stock</b>.' },
    'col-price':  { icon:'bi-graph-up',         title:'Price Action',
        body:'Intraday candlestick chart with reference levels drawn as solid lines: OPEN, VIX upper/lower range, ASO/AST (breakout above) and BSO/BST (breakdown below).' },
    'col-915':    { icon:'bi-clock',            title:'9:15 Close',
        body:'Where the first 9:15 candle closed vs the strike levels: <b>AST/ASO</b> = above (bullish), <b>BSO/BST</b> = below (bearish), <b>B/W</b> = within range. Sealed at 9:20 and fixed all day.' },
    'col-futures':{ icon:'bi-graph-up',   title:'Futures',
        body:'Futures positioning: LONG / SHORT / Short-Covering / Long-Unwinding etc., the premium/discount vs spot, and a bull/bear tint. Long build-up &amp; short-covering are bullish; shorts &amp; long-unwinding are bearish.' },
    'col-oi':     { icon:'bi-bar-chart-fill',   title:'OI Matrix',
        body:'Inline option-chain mini-table for ATM+/-2 strikes. Each row shows CE DeltaOI  *  4-box signal  *  Strike  *  4-box signal  *  PE DeltaOI. <b>Long Buildup</b>=bulls adding, <b>Short Buildup</b>=bears adding, <b>Short Covering</b>=shorts exiting (bullish), <b>Long Unwinding</b>=bulls exiting (bearish). PCR and max-OI wall levels shown below.' },
    'col-oiobv':  { icon:'bi-bar-chart-fill',   title:'OI / OBV',
        body:'Inline bar charts: top = CE/PE Change-OI per strike (green=PE bullish, red=CE bearish), bottom = CE/PE OBV momentum. ATM strike highlighted. Signal row below bars shows CE/PE label and score per strike. Click maximize (fullscreen icon) to expand.' },
    'col-weights':{ icon:'bi-diagram-3',        title:'Weightage Stocks',
        body:'Top-6 weighted constituents for NIFTY 50 / NIFTY BANK. Bar = relative computed score (green=bullish, red=bearish). These drive the NIFTY_50_COMPONENT_SCORE and NIFTY_BANK_COMPONENT_SCORE in the left panel.' },
    'col-detail': { icon:'bi-info-circle',      title:'Details',
        body:'Per-instrument detail strip: SL/Target (ATR-based), PCR, OI score, and ADX regime label. Heavy analysis panels (full OI/OBV charts, futures deep-dive, 9:15, A/D) are in the collapsible DETAILS bar below.' },
    details:      { icon:'bi-layers',           title:'Details',
        body:'Deep-dive panels (click the bar to expand): full OI/OBV charts, futures, 9:15 tables, advance/decline, and the weighted-component breakdown per instrument.' },
};

// Build the popover element once, lazily
function _gtbInfoPop() {
    var el = document.getElementById('gtb-info-pop');
    if (!el) {
        el = document.createElement('div');
        el.id = 'gtb-info-pop';
        el.innerHTML = '<div class="gtb-info-pop-hd"><span class="gtb-info-pop-title"></span>'
            + '<i class="bi bi-x-lg gtb-info-pop-close"></i></div><div class="gtb-info-pop-body"></div>';
        document.body.appendChild(el);
    }
    return el;
}

jQ(document).on('click', '.gtb-info-i', function(e) {
    e.preventDefault(); e.stopPropagation();
    var key = jQ(this).data('info');
    var info = GTB_INFO[key];
    if (!info) return;
    var pop = _gtbInfoPop();
    // Theme match (overlay-style elements live on <body>)
    jQ(pop).toggleClass('gtb-light', jQ('#main-trade-bot-container').hasClass('gtb-light'));
    pop.querySelector('.gtb-info-pop-title').innerHTML = '<i class="bi ' + info.icon + '"></i> ' + info.title;
    pop.querySelector('.gtb-info-pop-body').innerHTML = info.body;
    pop.style.display = 'block';
    // Position near the icon, clamped to the viewport
    var r = this.getBoundingClientRect();
    var pw = 280, ph = pop.offsetHeight || 140;
    var left = Math.min(r.left, window.innerWidth - pw - 12);
    var top  = r.bottom + 8;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 8);
    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top  = top + 'px';
});
jQ(document).on('click', '.gtb-info-pop-close', function() { jQ('#gtb-info-pop').hide(); });
jQ(document).on('click', function(e) {
    if (!jQ(e.target).closest('#gtb-info-pop, .gtb-info-i').length) jQ('#gtb-info-pop').hide();
});

function showNotes() {
    var items = [
        { i:'bi-1-circle-fill',    t:'9:15 breakout count',  d:'Read the number of ASO/BSO and the 9:15 ASO/BSO together — that combo sets the days bias.' },
        { i:'bi-arrow-up-circle',  t:'2 ASO',               d:'Two ASO = strong uptrend.' },
        { i:'bi-arrow-down-circle',t:'2 BSO',               d:'Two BSO = strong downtrend.' },
        { i:'bi-dash-circle',      t:'Sensex weighting',    d:'Sensex ASO/BSO does not carry much weight — do not over-rely on it.' },
        { i:'bi-building',         t:'Heavyweights',        d:'Always check RELIANCE and HDFC BANK — they move the index.' },
        { i:'bi-bar-chart-fill',   t:'OI / OBV',            d:'Confirm with the OI/OBV read (support vs resistance walls).' },
        { i:'bi-activity',         t:'VIX direction',       d:'Check VIX −ve/+ve and whether price is inside the VIX range.' },
        { i:'bi-distribute-horizontal', t:'ADR',            d:'Check advance/decline breadth across constituents.' },
        { i:'bi-droplet-fill',     t:'Crude oil',           d:'Check CRUDE OIL for risk-on/off cues.' },
        { i:'bi-graph-up',   t:'Futures trend',       d:'Check the futures trend for positioning.' },
        { i:'bi-globe',            t:'Global markets',      d:'Check World / Europe markets around 12:45–1:00 PM.' },
    ];
    var body = '<div class="gtb-notes-grid">';
    items.forEach(function(n) {
        body += '<div class="gtb-note-card"><div class="gtb-note-ic"><i class="bi ' + n.i + '"></i></div>'
             +  '<div class="gtb-note-tx"><div class="gtb-note-t">' + n.t + '</div>'
             +  '<div class="gtb-note-d">' + n.d + '</div></div></div>';
    });
    body += '</div>';
    showMaximizeOverlay('<i class="bi bi-journal-text"></i> Trading Checklist', body);
}

// ── 9:15 strategy map (shared by setScore and the day-wise backtest) ──────────
// Key = norm(NIFTY)-norm(SENSEX)-norm(BANK) where AST→ASO and BST→BSO.
var _gtbNorm915 = function (v) { return (v === 'AST') ? 'ASO' : (v === 'BST') ? 'BSO' : (v || 'B/W'); };
var GTB_STRAT_LOOKUP = {
    'ASO-ASO-ASO': { outcome:'Buy',      level:'at BSO/BST' },
    'ASO-ASO-BSO': { outcome:'Buy/Sell', level:'at BSO/BST for long, at ASO/AST for short' },
    'ASO-ASO-B/W': { outcome:'Buy',      level:'at BSO/BST' },
    'ASO-BSO-ASO': { outcome:'Buy',      level:'at BSO/BST — Sensex lag, Nifty+Bank agree' },
    'ASO-BSO-BSO': { outcome:'Sell',     level:'at ASO/AST — bank sector leading down' },
    'ASO-BSO-B/W': { outcome:'Buy/Sell', level:'at BSO/BST for long, at ASO/AST for short' },
    'ASO-B/W-ASO': { outcome:'Buy',      level:'at BSO/BST' },
    'ASO-B/W-BSO': { outcome:'Buy/Sell', level:'at BSO/BST for long, at ASO/AST for short' },
    'ASO-B/W-B/W': { outcome:'Buy',      level:'at BSO/BST — Nifty leading, wait for others' },
    'BSO-ASO-ASO': { outcome:'Buy/Sell', level:'at BSO/BST for long, at ASO/AST for short' },
    'BSO-ASO-BSO': { outcome:'Sell',     level:'at ASO/AST — Nifty+Bank down, Sensex lagging' },
    'BSO-ASO-B/W': { outcome:'Sell',     level:'at ASO/AST' },
    'BSO-BSO-ASO': { outcome:'Sell',     level:'at ASO/AST — bank sector resilient but outvoted' },
    'BSO-BSO-BSO': { outcome:'Sell',     level:'at ASO/AST' },
    'BSO-BSO-B/W': { outcome:'Sell',     level:'at ASO/AST' },
    'BSO-B/W-ASO': { outcome:'Buy/Sell', level:'at BSO/BST for long, at ASO/AST for short' },
    'BSO-B/W-BSO': { outcome:'Sell',     level:'at ASO/AST' },
    'BSO-B/W-B/W': { outcome:'Sell',     level:'at ASO/AST' },
    'B/W-ASO-ASO': { outcome:'Buy',      level:'at BSO/BST — Nifty indecisive but both others confirm' },
    'B/W-ASO-BSO': { outcome:'Buy/Sell', level:'at BSO/BST for long, at ASO/AST for short' },
    'B/W-ASO-B/W': { outcome:'Buy/Sell', level:'at BSO/BST for long, at ASO/AST for short' },
    'B/W-BSO-ASO': { outcome:'Buy/Sell', level:'at BSO/BST for long, at ASO/AST for short' },
    'B/W-BSO-BSO': { outcome:'Sell',     level:'at ASO/AST — both Sensex+Bank confirm down' },
    'B/W-BSO-B/W': { outcome:'Sell',     level:'at ASO/AST' },
    'B/W-B/W-ASO': { outcome:'Buy',      level:'at BSO/BST — Bank Nifty leading' },
    'B/W-B/W-BSO': { outcome:'Sell',     level:'at ASO/AST — Bank Nifty leading down' },
    'B/W-B/W-B/W': { outcome:'Sell',     level:'at ASO/AST — all indices in range, bearish bias' }
};

// Classify a 9:15 close vs strike levels derived from the days open (same rules
// as scanNineFifteenCandle / setScore.get915Score).
function _gtbClassify915(name, dayOpen, closeNineFifteen) {
    var sd = getStrikeDetails({ price: dayOpen }, name);
    var ast = parseFloat(sd.ustrikeTwo), aso = parseFloat(sd.ustrikeOne);
    var bso = parseFloat(sd.bstrikeOne), bst = parseFloat(sd.bstrikeTwo);
    if (closeNineFifteen > ast) return 'AST';
    if (closeNineFifteen > aso) return 'ASO';
    if (closeNineFifteen < bst) return 'BST';
    if (closeNineFifteen < bso) return 'BSO';
    return 'B/W';
}

// Builds a day-wise 9:15 trend table for NIFTY 50 / SENSEX / NIFTY BANK over the
// last `lookback` trading days, resolving each days combo via GTB_STRAT_LOOKUP.
// Simulate one leg of the entry-level trade on a days intraday (5-min) candles.
//   long  → ideal entry at BSO (Buy bias / bullish)
//   short → ideal entry at ASO (Sell bias / bearish)
// Two cases, both evaluated (held to the days close):
//   • entryType 'level' — price reached the strike → entered there. P/L vs that level.
//   • entryType 'trend' — price NEVER reached the strike (no pullback) but the bias
//     still ran; treated as entering at the OPEN and riding the trend. P/L vs open.
//     (Sell that just closed below, or Buy that just closed above, still counts.)
// Returns { dir, entryType, entry, exit, pnl, pnlPct, win }.
function _gtbSimLeg(dir, cands, open) {
    if (!cands || cands.length < 2 || !open) return null;
    var sd = getStrikeDetails({ price: open }, 'NIFTY 50');
    var ASO = parseFloat(sd.ustrikeOne), BSO = parseFloat(sd.bstrikeOne);
    var isLong = dir === 'long';
    var level = isLong ? BSO : ASO;
    var openTs = cands[0][0];                             // the 9:15 candle timestamp
    var filled = false, fillIdx = -1, exit = open, exitTs = openTs, favOpen = 0, favLevel = 0;
    var entryTs = null, favOpenTs = openTs, favLevelTs = null;
    for (var k = 1; k < cands.length; k++) {            // after the 9:15 candle
        var ts = cands[k][0];
        if (moment(ts).hour() >= 12) break;              // morning session only — cutoff at 12:00 (pre-Europe)
        var hi = parseFloat(cands[k][2]), lo = parseFloat(cands[k][3]);
        exit = parseFloat(cands[k][4]); exitTs = ts;     // running close → ends at the 12:00 close
        // best favourable move from the open (used if it never pulls back → trend entry)
        var fO = isLong ? (hi - open) : (open - lo);
        if (fO > favOpen) { favOpen = fO; favOpenTs = ts; }
        if (!filled && (isLong ? (lo <= level) : (hi >= level))) { filled = true; entryTs = ts; fillIdx = k; }
        if (filled) {                                    // best favourable move from the strike level
            var fL = isLong ? (hi - level) : (level - lo);
            if (fL > favLevel) { favLevel = fL; favLevelTs = ts; }
        }
    }
    var entry = filled ? level : open;                   // no pullback → entered at open (trend)
    var pnl = isLong ? (exit - entry) : (entry - exit);
    var mfe = filled ? favLevel : favOpen;               // max favourable excursion from the actual entry

    // ── MAE (max adverse) + sequenced target/stop from the entry ────────────────
    // Target & stop = one strike step (s1) → a transparent 1:1 R bracket.
    var sdiff = getStrikeDiff('NIFTY 50').split(',');
    var s1 = parseInt(sdiff[0]) || 50;
    var target = s1, stop = s1;
    var startK = filled ? fillIdx : 1;
    var maxAdv = 0, tpsl = 'OPEN';
    for (var j = startK; j >= 1 && j < cands.length; j++) {
        if (moment(cands[j][0]).hour() >= 12) break;
        var hj = parseFloat(cands[j][2]), lj = parseFloat(cands[j][3]);
        var favN = isLong ? (hj - entry) : (entry - lj);
        var advN = isLong ? (entry - lj) : (hj - entry);
        if (advN > maxAdv) maxAdv = advN;
        if (tpsl === 'OPEN') {                            // SL checked first (same-candle = conservative)
            if (advN >= stop) tpsl = 'SL';
            else if (favN >= target) tpsl = 'TP';
        }
    }

    var fmt = function (t) { return t ? moment(t).format('HH:mm') : '—'; };
    return { dir: dir, entryType: filled ? 'level' : 'trend', entry: entry, exit: exit,
             pnl: pnl, pnlPct: entry ? (pnl / entry * 100) : 0, win: pnl >= 0,
             mfe: mfe, mfePct: entry ? (mfe / entry * 100) : 0,
             mae: maxAdv, maePct: entry ? (maxAdv / entry * 100) : 0,
             tpsl: tpsl, target: target, stop: stop,
             entryTime: fmt(filled ? entryTs : openTs),  // when the position was taken
             peakTime:  fmt(filled ? favLevelTs : favOpenTs), // when the max-favourable price occurred
             exitTime:  fmt(exitTs) };
}

// Which legs a strategy outcome implies (per the user's bias definitions):
//   Buy → long only  *  Sell → short only  *  Buy/Sell → both legs  *  Sideways → none
function _gtbLegsFor(outcome) {
    if (outcome === 'Buy')      return ['long'];
    if (outcome === 'Sell')     return ['short'];
    if (outcome === 'Buy/Sell') return ['long', 'short'];
    return [];
}

// Fetch 5-minute candles over an arbitrary range by chunking into ≤95-day windows
// (Kite caps the 5-minute interval at 100 days per request) and merging in order.
async function _gtbFetch5minRange(token, fromM, toM) {
    var all = [];
    var CHUNK = 95;
    var start = fromM.clone();
    while (start.isSameOrBefore(toM)) {
        var end = moment.min(start.clone().add(CHUNK - 1, 'days'), toM);
        var res = await getHistoricalDataUsingPromise(token, start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD'), '5minute');
        var c = (res && res.data && res.data.candles) ? res.data.candles : [];
        if (c.length) all = all.concat(c);
        start = end.clone().add(1, 'days');
    }
    return all;
}

async function _gtbBuild915Trend(lookback) {
    lookback = lookback || 250;   // ~1 year of trading days
    var instruments = ['NIFTY 50', 'SENSEX', 'NIFTY BANK', 'GIFT NIFTY'];
    // Computed rows are cacheable per day (past days don't change) — avoids re-fetching
    // ~16 chunked requests on every open.
    var ckey = 'GTB_915TREND_' + moment().format('YYYY-MM-DD') + '_' + lookback + '_v4';  // v4 = + vixu_bank/vixl_bank
    try { var cached = localStorage.getItem(ckey); if (cached) return JSON.parse(cached); } catch (e) {}

    var toM   = moment();
    // Calendar span to cover `lookback` trading days (~5 trading days per 7 calendar days).
    var fromM = moment().subtract(Math.ceil(lookback * 1.5) + 10, 'days');

    // India VIX (token 264969) daily — for VIX-regime classification of each day
    var vixMap = {};
    try {
        var vixTok = (typeof INSTRUMENT_TOKENS !== 'undefined' && INSTRUMENT_TOKENS['INDIA VIX']) || 264969;
        var vres = await getHistoricalDataUsingPromise(vixTok, fromM.format('YYYY-MM-DD'), toM.format('YYYY-MM-DD'), 'day');
        var vc = (vres && vres.data && vres.data.candles) ? vres.data.candles : [];
        vc.forEach(function (c) { vixMap[moment(c[0]).format('YYYY-MM-DD')] = parseFloat(c[1]); }); // day open VIX
    } catch (e) {}

    // Fetch each instrument chunked 5-min history in parallel (chunks stay
    // sequential within an instrument; the 4 instruments run concurrently).
    var byInstr = {};
    await Promise.all(instruments.map(async function (name) {
        var token = INSTRUMENT_TOKENS[name];
        if (!token) { byInstr[name] = {}; return; }
        var candles = await _gtbFetch5minRange(token, fromM, toM);
        var dayMap = {};
        candles.forEach(function (c) {
            var d = moment(c[0]).format('YYYY-MM-DD');
            if (!dayMap[d]) {
                dayMap[d] = { open: parseFloat(c[1]), close915: parseFloat(c[4]), dayClose: parseFloat(c[4]), cands: [c] };
            } else {
                dayMap[d].dayClose = parseFloat(c[4]);     // last candle close = day close
                dayMap[d].cands.push(c);                    // retain intraday path for trade sim
            }
        });
        Object.keys(dayMap).forEach(function (d) {
            dayMap[d].cls = _gtbClassify915(name, dayMap[d].open, dayMap[d].close915);
            // close at noon = last candle before 12:00 (pre-Europe morning session)
            var c12 = dayMap[d].close915;
            dayMap[d].cands.forEach(function (c) { if (moment(c[0]).hour() < 12) c12 = parseFloat(c[4]); });
            dayMap[d].close12 = c12;
        });
        byInstr[name] = dayMap;
    }));

    // Strategy needs NIFTY/SENSEX/BANK; GIFT NIFTY is an extra reference column.
    // Sort ascending to compute prev-day close, then reverse for display.
    var allDates = Object.keys(byInstr['NIFTY 50'] || {}).filter(function (d) {
        return byInstr['SENSEX'][d] && byInstr['NIFTY BANK'][d];
    }).sort();  // ascending — needed for prev-day lookup

    var _sqrt252 = Math.sqrt(252);   // VIX annualised → daily: ÷ sqrt(252)
    var niftyDates = allDates;       // ascending order

    var rows = allDates.slice().reverse().slice(0, lookback).map(function (d) {
        var n = byInstr['NIFTY 50'][d], s = byInstr['SENSEX'][d], b = byInstr['NIFTY BANK'][d];
        var g = (byInstr['GIFT NIFTY'] || {})[d];
        var key = _gtbNorm915(n.cls) + '-' + _gtbNorm915(s.cls) + '-' + _gtbNorm915(b.cls);
        var strat = GTB_STRAT_LOOKUP[key] || { outcome: 'Sideways', level: 'No trade' };
        var c12 = (n.close12 !== undefined) ? n.close12 : n.dayClose;
        var move = c12 >= n.open ? 'UP' : 'DOWN';
        var movePct = n.open ? ((c12 - n.open) / n.open * 100) : 0;
        var legs = _gtbLegsFor(strat.outcome).map(function (dir) { return _gtbSimLeg(dir, n.cands, n.open); }).filter(Boolean);
        var vix = (vixMap[d] != null && !isNaN(vixMap[d])) ? vixMap[d] : null;

        // VIXU / VIXL: computed from each instrument's own PREVIOUS day close × (VIX/100 / sqrt(252))
        var vixu = null, vixl = null, vixu_bank = null, vixl_bank = null;
        var dIdx = niftyDates.indexOf(d);
        if (dIdx > 0 && vix != null) {
            var prevDay = niftyDates[dIdx - 1];
            var prevN   = byInstr['NIFTY 50'][prevDay];
            var prevB   = byInstr['NIFTY BANK'][prevDay];
            if (prevN) {
                var _rng = prevN.dayClose * (vix / 100) / _sqrt252;
                vixu = parseFloat((prevN.dayClose + _rng).toFixed(2));
                vixl = parseFloat((prevN.dayClose - _rng).toFixed(2));
            }
            if (prevB) {
                var _rngB = prevB.dayClose * (vix / 100) / _sqrt252;
                vixu_bank = parseFloat((prevB.dayClose + _rngB).toFixed(2));
                vixl_bank = parseFloat((prevB.dayClose - _rngB).toFixed(2));
            }
        }

        return { date: d, n: n.cls, s: s.cls, b: b.cls, g: g ? g.cls : '—', key: key,
                 outcome: strat.outcome, level: strat.level, move: move, movePct: movePct, legs: legs,
                 vix: vix, vixu: vixu, vixl: vixl, vixu_bank: vixu_bank, vixl_bank: vixl_bank };
    });
    try { localStorage.setItem(ckey, JSON.stringify(rows)); } catch (e) {}
    return rows;
}

var GTB_LAST_FUT_REMARK = {};   // name → {remark, dir, ts} — futures-trend persistence (#5)
var _GTB_915_ROWS = [];   // last-built day rows, for the combo-charts popup
var _GTB_OIC_LIST = [];   // last OI-compare instrument list, for the detailed/compact toggle

function _render915Trend(rows) {
    if (!rows || !rows.length) {
        return '<div style="padding:24px;text-align:center;color:var(--gtb-muted);"><i class="bi bi-exclamation-triangle"></i> No data</div>';
    }
    _GTB_915_ROWS = rows;
    // Todays 9:15 combo (same classification the live dashboard uses) — for highlighting.
    var _tb915 = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}');
    var _t915n = (_tb915['NIFTY 50']   || {}).CLOSE_9_15;
    var _t915s = (_tb915['SENSEX']     || {}).CLOSE_9_15;
    var _t915b = (_tb915['NIFTY BANK'] || {}).CLOSE_9_15;
    // Normalized key (AST→ASO, BST→BSO) for the strategy-bucket combo table
    var todayKey = _gtbNorm915(_t915n) + '-' + _gtbNorm915(_t915s) + '-' + _gtbNorm915(_t915b);
    var hasToday = todayKey.indexOf('undefined') === -1;
    // Raw key (exact AST/ASO/BSO/BST/B-W) for day-by-day exact-match highlighting
    var todayKeyRaw = _t915n + '-' + _t915s + '-' + _t915b;
    var hasTodayRaw = !!(_t915n && _t915s && _t915b);
    // Aggregate per-leg P/L stats (each Buy/Sell day = 2 legs)
    var win = 0, loss = 0, levelN = 0, trendN = 0, legCount = 0, totPnl = 0, totMfe = 0, totMae = 0, tpN = 0, slN = 0;
    rows.forEach(function (r) {
        (r.legs || []).forEach(function (lg) {
            legCount++; totPnl += lg.pnl; totMfe += (lg.mfe || 0); totMae += (lg.mae || 0);
            if (lg.win) win++; else loss++;
            if (lg.tpsl === 'TP') tpN++; else if (lg.tpsl === 'SL') slN++;
            if (lg.entryType === 'level') levelN++; else trendN++;
        });
    });
    var winPct = legCount ? Math.round(win / legCount * 100) : 0;
    var avgPnl = legCount ? (totPnl / legCount) : 0;
    var avgMfe = legCount ? (totMfe / legCount) : 0;
    var avgMae = legCount ? (totMae / legCount) : 0;
    var tpslN  = tpN + slN;
    var tpPct  = tpslN ? Math.round(tpN / tpslN * 100) : 0;   // target-before-stop hit rate (1:1)

    // VIX-regime threshold = median day-open VIX across the sample (adaptive split)
    var _vv = rows.map(function (r) { return r.vix; }).filter(function (v) { return v != null && !isNaN(v); }).sort(function (a, b) { return a - b; });
    var vixThresh = _vv.length ? _vv[Math.floor(_vv.length / 2)] : null;

    // ── Per-combo performance (which 9:15 combos actually have an edge) ──────────
    var combo = {};
    rows.forEach(function (r) {
        if (!combo[r.key]) combo[r.key] = { key: r.key, outcome: r.outcome, level: r.level, days: 0, legs: 0, win: 0, pnl: 0, mfe: 0, loWin: 0, loLegs: 0, hiWin: 0, hiLegs: 0 };
        var c = combo[r.key]; c.days++;
        var regime = (vixThresh != null && r.vix != null) ? (r.vix <= vixThresh ? 'lo' : 'hi') : null;
        (r.legs || []).forEach(function (lg) {
            c.legs++; if (lg.win) c.win++; c.pnl += lg.pnl; c.mfe += (lg.mfe || 0);
            if (regime === 'lo') { c.loLegs++; if (lg.win) c.loWin++; }
            else if (regime === 'hi') { c.hiLegs++; if (lg.win) c.hiWin++; }
        });
    });
    var comboRows = Object.keys(combo).map(function (k) {
        var c = combo[k];
        c.winPct = c.legs ? Math.round(c.win / c.legs * 100) : 0;
        c.avgPnl = c.legs ? (c.pnl / c.legs) : 0;
        c.avgMfe = c.legs ? (c.mfe / c.legs) : 0;
        c.loPct  = c.loLegs ? Math.round(c.loWin / c.loLegs * 100) : null;
        c.hiPct  = c.hiLegs ? Math.round(c.hiWin / c.hiLegs * 100) : null;
        return c;
    }).sort(function (a, b) { return b.winPct - a.winPct || b.days - a.days; });

    function _cls(v) {
        var c = (v === 'AST' || v === 'ASO') ? 'up' : (v === 'BST' || v === 'BSO') ? 'down' : 'flat';
        return '<span class="gtb-t915-cls ' + c + '">' + v + '</span>';
    }
    function _out(o) {
        var c = o === 'Buy' ? 'up' : o === 'Sell' ? 'down' : o === 'Buy/Sell' ? 'mix' : 'flat';
        return '<span class="gtb-t915-out ' + c + '">' + o + '</span>';
    }
    function _leg(lg) {
        var tag = lg.dir === 'long' ? 'L' : 'S';
        var cls = lg.win ? 'up' : 'down';
        var sign = lg.pnl >= 0 ? '+' : '';
        var et = lg.entryType === 'level' ? 'lvl' : 'trd';   // lvl = filled at strike, trd = no-pullback (entered at open)
        return '<span class="gtb-t915-leg ' + cls + (lg.entryType === 'trend' ? ' trend' : '') + '">'
             + tag + ' ' + (lg.win ? '✓' : '✗') + ' ' + sign + lg.pnl.toFixed(1) + ' '
             + '<span class="gtb-t915-et">' + et + '</span></span>';
    }
    function _legMfe(lg) {
        var tag = lg.dir === 'long' ? 'L' : 'S';
        // MFE is the best favourable points from entry — always ≥ 0 (green if it gave a swing)
        var cls = lg.mfe > 0 ? 'up' : 'flat';
        return '<span class="gtb-t915-leg ' + cls + '">' + tag + ' +' + (lg.mfe || 0).toFixed(0)
             + ' <span class="gtb-t915-et">(' + (lg.mfePct || 0).toFixed(2) + '%)</span></span>';
    }
    function _legTime(lg, field) {
        var tag = lg.dir === 'long' ? 'L' : 'S';
        var c = lg.dir === 'long' ? 'up' : 'down';
        return '<span class="gtb-t915-leg ' + c + '">' + tag + ' ' + (lg[field] || '—') + '</span>';
    }
    function _legMae(lg) {            // max adverse (heat) — always shown red
        var tag = lg.dir === 'long' ? 'L' : 'S';
        return '<span class="gtb-t915-leg ' + ((lg.mae || 0) > 0 ? 'down' : 'flat') + '">' + tag + ' −' + (lg.mae || 0).toFixed(0)
             + ' <span class="gtb-t915-et">(' + (lg.maePct || 0).toFixed(2) + '%)</span></span>';
    }
    function _legTpsl(lg) {           // 1:1 target-vs-stop outcome
        var tag = lg.dir === 'long' ? 'L' : 'S';
        var m = lg.tpsl === 'TP' ? ['up', '✓ TP'] : lg.tpsl === 'SL' ? ['down', '✗ SL'] : ['flat', 'open'];
        return '<span class="gtb-t915-leg ' + m[0] + '">' + tag + ' ' + m[1] + '</span>';
    }

    var html = '<div class="gtb-t915-wrap">';
    html += '<div style="display:flex;justify-content:flex-end;margin-bottom:6px;">'
         +  '<button id="gtb-915-clear" class="oic-mode-btn" title="Clear the cached backtest data and rebuild from fresh candles"><i class="bi bi-arrow-clockwise"></i> Clear cache &amp; rebuild</button>'
         +  '</div>';
    html += '<div class="gtb-t915-sub">Daily 9:15 combo for <b>NIFTY  *  SENSEX  *  BANK</b> (with <b>GIFT NIFTY</b> reference) over the last <b>'
         +  rows.length + '</b> trading days. The <b>Result</b> enters NIFTY per bias — '
         +  '<b style="color:var(--gtb-green)">long @ BSO</b> (Buy), <b style="color:var(--gtb-red)">short @ ASO</b> (Sell), '
         +  'or <b>both</b> (Buy/Sell). If price reaches the level its an <b>lvl</b> entry; if it never pulled back but the bias '
         +  'still ran, its a <b>trd</b> entry taken at the open. Evaluated in the <b>morning session till 12:00</b> (pre-Europe); P/L marked at the 12:00 close. '
         +  '<b>Max Fav</b>/<b>Max Adv</b> are the best favourable (MFE) and worst adverse (MAE) swings from the entry; '
         +  '<b>1:1 TP/SL</b> is whether a one-strike-step (' + (rows[0] && rows[0].legs[0] ? rows[0].legs[0].target : 's1') + '-pt) target was hit before an equal stop.</div>';
    html += '<div class="gtb-t915-stats">'
         +  '<span class="gtb-t915-stat win">✓ ' + win + ' profit</span>'
         +  '<span class="gtb-t915-stat loss">✗ ' + loss + ' loss</span>'
         +  '<span class="gtb-t915-stat">Win-rate <b>' + winPct + '%</b></span>'
         +  '<span class="gtb-t915-stat">Avg P/L <b style="color:' + (avgPnl >= 0 ? 'var(--gtb-green)' : 'var(--gtb-red)') + '">'
         +  (avgPnl >= 0 ? '+' : '') + avgPnl.toFixed(1) + ' pts</b></span>'
         +  '<span class="gtb-t915-stat">Net <b style="color:' + (totPnl >= 0 ? 'var(--gtb-green)' : 'var(--gtb-red)') + '">'
         +  (totPnl >= 0 ? '+' : '') + totPnl.toFixed(0) + ' pts</b></span>'
         +  '<span class="gtb-t915-stat">Avg max-fav <b style="color:var(--gtb-green)">+' + avgMfe.toFixed(1) + '</b> / max-adv <b style="color:var(--gtb-red)">−' + avgMae.toFixed(1) + ' pts</b></span>'
         +  '<span class="gtb-t915-stat">1:1 target hit <b>' + tpPct + '%</b> (' + tpN + ' TP / ' + slN + ' SL)</span>'
         +  '<span class="gtb-t915-stat">' + levelN + ' lvl  *  ' + trendN + ' trd entries</span>'
         +  '</div>';

    // ── Per-combo edge table ────────────────────────────────────────────────────
    var vixTxt = vixThresh != null ? vixThresh.toFixed(2) : '—';
    html += '<div class="gtb-t915-combo-h"><i class="bi bi-trophy"></i> Per-combo edge '
         +  '<span style="font-weight:400;color:var(--gtb-muted);">(NIFTY-SENSEX-BANK  *  sorted by win-rate  *  low N = unreliable  *  VIX split at median ' + vixTxt + ')</span></div>';
    if (hasToday) html += '<div class="gtb-t915-today-note"><i class="bi bi-star-fill"></i> Today\&#39;s 9:15 combo: <b>' + todayKey + '</b> — highlighted below</div>';
    html += '<table class="gtb-t915-table gtb-t915-combo"><thead><tr>'
         +  '<th>Combo</th><th>Bias</th><th>Entry Level</th><th>Days</th><th>Win-rate</th>'
         +  '<th title="Win-rate on days with VIX ≤ ' + vixTxt + '">Low-VIX</th>'
         +  '<th title="Win-rate on days with VIX > ' + vixTxt + '">High-VIX</th>'
         +  '<th>Avg P/L</th><th>Avg Max-Fav</th></tr></thead><tbody>';
    function _vixCell(pct, n) {
        if (pct === null) return '<td class="gtb-t915-date" style="color:var(--gtb-muted);">—</td>';
        var col = pct >= 60 ? 'var(--gtb-green)' : pct <= 40 ? 'var(--gtb-red)' : 'var(--gtb-amber)';
        return '<td style="font-family:var(--gtb-mono);color:' + col + ';font-weight:700;">' + pct + '% <span style="color:var(--gtb-muted);font-weight:400;">(' + n + ')</span></td>';
    }
    comboRows.forEach(function (c) {
        var wc = c.winPct >= 60 ? 'var(--gtb-green)' : c.winPct <= 40 ? 'var(--gtb-red)' : 'var(--gtb-amber)';
        var isToday = hasToday && c.key === todayKey;
        var cls = 'gtb-combo-row' + (isToday ? ' gtb-t915-today' : '');
        var lowN = (!isToday && c.days < 4) ? ' style="opacity:0.5;"' : '';
        html += '<tr class="' + cls + '" data-key="' + c.key + '" title="Click to view the NIFTY chart for every day with this combo"' + lowN + '>'
            + '<td class="gtb-t915-date" style="font-family:var(--gtb-mono);">' + (isToday ? '★ ' : '') + c.key + ' <i class="bi bi-grid-3x3-gap" style="opacity:0.6;"></i></td>'
            + '<td>' + _out(c.outcome) + '</td>'
            + '<td class="gtb-t915-lvl">' + (c.level || '—') + '</td>'
            + '<td class="gtb-t915-date">' + c.days + '</td>'
            + '<td style="color:' + wc + ';font-weight:800;font-family:var(--gtb-mono);">' + c.winPct + '%</td>'
            + _vixCell(c.loPct, c.loLegs)
            + _vixCell(c.hiPct, c.hiLegs)
            + '<td style="color:' + (c.avgPnl >= 0 ? 'var(--gtb-green)' : 'var(--gtb-red)') + ';font-family:var(--gtb-mono);">'
            + (c.avgPnl >= 0 ? '+' : '') + c.avgPnl.toFixed(1) + '</td>'
            + '<td style="color:var(--gtb-green);font-family:var(--gtb-mono);">+' + c.avgMfe.toFixed(1) + '</td>'
            + '</tr>';
    });
    html += '</tbody></table>';

    var _matchN = hasTodayRaw ? rows.filter(function (r) { return (r.n + '-' + r.s + '-' + r.b) === todayKeyRaw; }).length : 0;
    html += '<div class="gtb-t915-combo-h"><i class="bi bi-calendar3"></i> Day-by-day'
         +  (hasTodayRaw ? '<span style="font-weight:400;color:var(--gtb-muted);"> — ★ ' + _matchN + ' day(s) exactly matched today\&#39;s 9:15 (' + todayKeyRaw + ')</span>' : '')
         +  '</div>';
    html += '<table class="gtb-t915-table"><thead><tr>'
         +  '<th>Date</th><th>GIFT</th><th>NIFTY</th><th>SENSEX</th><th>BANK</th><th>Strategy</th><th>Entry Level</th><th>Nifty →12pm</th>'
         +  '<th title="India VIX day-open">VIX</th>'
         +  '<th title="VIX upper band (prev close + daily range)">VIXU</th>'
         +  '<th title="VIX lower band (prev close − daily range)">VIXL</th>'
         +  '<th>Result (P/L)</th><th>Max Fav</th><th>Max Adv</th><th>1:1 TP/SL</th><th>Entry @</th><th>Peak @</th>'
         +  '</tr></thead><tbody>';
    rows.forEach(function (r) {
        var mvColor = r.move === 'UP' ? 'var(--gtb-green)' : 'var(--gtb-red)';
        var empty = '<span class="gtb-t915-leg flat">—</span>';
        var resHtml = (r.legs && r.legs.length) ? r.legs.map(_leg).join(' ') : empty;
        var mfeHtml = (r.legs && r.legs.length) ? r.legs.map(_legMfe).join(' ') : empty;
        var maeHtml = (r.legs && r.legs.length) ? r.legs.map(_legMae).join(' ') : empty;
        var tpslHtml= (r.legs && r.legs.length) ? r.legs.map(_legTpsl).join(' ') : empty;
        var entHtml = (r.legs && r.legs.length) ? r.legs.map(function (lg) { return _legTime(lg, 'entryTime'); }).join(' ') : empty;
        var pkHtml  = (r.legs && r.legs.length) ? r.legs.map(function (lg) { return _legTime(lg, 'peakTime'); }).join(' ') : empty;
        var rowMatch = hasTodayRaw && (r.n + '-' + r.s + '-' + r.b) === todayKeyRaw;

        // VIX band cells
        var vixCell = r.vix != null
            ? '<td style="font-family:var(--gtb-mono);font-size:0.58rem;color:var(--gtb-amber);">' + r.vix.toFixed(2) + '</td>'
            : '<td style="color:var(--gtb-muted);">—</td>';

        var vixuCell, vixlCell;
        if (r.vixu != null && r.vixl != null) {
            // Colour VIXU/VIXL by whether today's open is above/below/within band
            var nOpen = (function() {
                // Use NIFTY 9:15 open as a proxy for whether range was relevant
                return null; // just show the level values — no live open available in history
            })();
            vixuCell = '<td style="font-family:var(--gtb-mono);font-size:0.58rem;color:var(--gtb-red);">' + r.vixu.toFixed(2) + '</td>';
            vixlCell = '<td style="font-family:var(--gtb-mono);font-size:0.58rem;color:var(--gtb-green);">' + r.vixl.toFixed(2) + '</td>';
        } else {
            vixuCell = '<td style="color:var(--gtb-muted);">—</td>';
            vixlCell = '<td style="color:var(--gtb-muted);">—</td>';
        }

        html += '<tr' + (rowMatch ? ' class="gtb-t915-today"' : '') + '>'
            + '<td class="gtb-t915-date">' + (rowMatch ? '★ ' : '') + moment(r.date).format('DD MMM')
            + ' <button class="gtb-day-chart-btn" data-date="' + r.date + '" title="View NIFTY chart for this day"><i class="bi bi-bar-chart-line"></i></button></td>'
            + '<td>' + _cls(r.g) + '</td><td>' + _cls(r.n) + '</td><td>' + _cls(r.s) + '</td><td>' + _cls(r.b) + '</td>'
            + '<td>' + _out(r.outcome) + '</td>'
            + '<td class="gtb-t915-lvl">' + r.level + '</td>'
            + '<td style="color:' + mvColor + ';font-weight:700;font-family:var(--gtb-mono);">'
            + (r.move === 'UP' ? '▲' : '▼') + ' ' + (r.movePct >= 0 ? '+' : '') + r.movePct.toFixed(2) + '%</td>'
            + vixCell + vixuCell + vixlCell
            + '<td>' + resHtml + '</td>'
            + '<td>' + mfeHtml + '</td>'
            + '<td>' + maeHtml + '</td>'
            + '<td>' + tpslHtml + '</td>'
            + '<td>' + entHtml + '</td>'
            + '<td>' + pkHtml + '</td>'
            + '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
}

async function _gtbShow915Backtest() {
    showMaximizeOverlay('<i class="bi bi-calendar-week"></i> 9:15 Opening-Trend + Entry-Level P/L Backtest — 1-Year, till 12:00 (GIFT  *  NIFTY  *  SENSEX  *  BANK)',
        '<div style="padding:30px;text-align:center;color:var(--gtb-muted);font-size:0.85rem;">'
        + '<i class="bi bi-hourglass-split"></i> Building ~1 year of 9:15 trend (chunked 5-min fetch, may take ~20–30s)…</div>');
    try {
        var rows = await _gtbBuild915Trend(250);
        jQ('#groot-maximize-body').html(_render915Trend(rows));
    } catch (err) {
        jQ('#groot-maximize-body').html('<div style="padding:24px;color:var(--gtb-red);">Error: ' + (err && err.message) + '</div>');
    }
}
jQ(document).on('click', '#show-915-backtest', function (e) { e.preventDefault(); _gtbShow915Backtest(); });

// Clear cached backtest data (per-day rows + strike-prob) and rebuild fresh.
jQ(document).on('click', '#gtb-915-clear', function (e) {
    e.preventDefault(); e.stopPropagation();
    try {
        var keys = [];
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && (k.indexOf('GTB_915TREND_') === 0 || k.indexOf('GTB_STRIKEPROB_') === 0)) keys.push(k);
        }
        keys.forEach(function (k) { localStorage.removeItem(k); });
    } catch (er) {}
    _gtbShow915Backtest();   // rebuild from fresh candles
});

// ── Day chart popup (from the 9:15 day-by-day table) ──────────────────────────
function _gtbDayChartPopup() {
    var el = document.getElementById('gtb-daychart-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'gtb-daychart-overlay';
        el.innerHTML = '<div id="gtb-daychart-panel">'
            + '<div id="gtb-daychart-hd"><span class="gtb-daychart-title"></span>'
            + '<i class="bi bi-x-lg gtb-daychart-close"></i></div>'
            + '<div id="gtb-daychart-body"></div></div>';
        document.body.appendChild(el);
    }
    jQ(el).toggleClass('gtb-light', jQ('#main-trade-bot-container').hasClass('gtb-light'));
    return jQ(el);
}
jQ(document).on('click', '.gtb-daychart-close, #gtb-daychart-overlay', function (e) {
    if (e.target.id === 'gtb-daychart-overlay' || jQ(e.target).closest('.gtb-daychart-close').length) {
        jQ('#gtb-daychart-overlay').removeClass('active');
        jQ('#gtb-daychart-body').html('');
    }
});
jQ(document).on('click', '#gtb-daychart-panel', function (e) { e.stopPropagation(); });

// Render one instrument intraday chart (with its strike ref-lines) for a date.
async function _gtbRenderDayChart(name, date, containerId, height) {
    var token = INSTRUMENT_TOKENS[name];
    if (!token) { jQ('#' + containerId).html('<div class="cmd-load">no token</div>'); return; }
    var res = await getHistoricalDataUsingPromise(token, date, date, '5minute');
    var candles = (res && res.data && res.data.candles) ? res.data.candles : [];
    if (!candles.length) { jQ('#' + containerId).html('<div class="cmd-load" style="color:var(--gtb-red);">no data</div>'); return; }
    var open = parseFloat(candles[0][1]);
    var sd = getStrikeDetails({ price: open }, name);
    var refLines = [
        { key: 'OPEN', value: open },
        { key: 'AST', value: sd.ustrikeTwo }, { key: 'ASO', value: sd.ustrikeOne },
        { key: 'BSO', value: sd.bstrikeOne }, { key: 'BST', value: sd.bstrikeTwo },
    ];

    // Add VIXU / VIXL from the cached backtest rows — values use each instrument's own
    // PREVIOUS day close (not today's open), so the range is correct.
    var row915 = _GTB_915_ROWS && _GTB_915_ROWS.filter(function(r){ return r.date === date; })[0];
    if (row915) {
        var _vu = (name === 'NIFTY BANK') ? row915.vixu_bank : row915.vixu;
        var _vl = (name === 'NIFTY BANK') ? row915.vixl_bank : row915.vixl;
        if (_vu != null) refLines.push({ key: 'VIXU', value: _vu, text: 'VIXU ' + _vu.toFixed(0) });
        if (_vl != null) refLines.push({ key: 'VIXL', value: _vl, text: 'VIXL ' + _vl.toFixed(0) });
    }

    _renderLWChart(containerId, candles, refLines, height || 300, { topBar: true });
}

jQ(document).on('click', '.gtb-day-chart-btn', async function (e) {
    e.preventDefault(); e.stopPropagation();
    var date = jQ(this).data('date');
    var ov = _gtbDayChartPopup();
    ov.find('.gtb-daychart-title').html('<i class="bi bi-candlestick"></i> NIFTY 50 &amp; BANK NIFTY — ' + moment(date).format('ddd, DD MMM YYYY'));
    ov.find('#gtb-daychart-body').html(
        '<div class="gtb-daychart-pair">'
        + '<div><div class="aoi-chart-t">NIFTY 50</div><div id="gtb-daychart-n50" style="width:100%;height:340px;"></div></div>'
        + '<div><div class="aoi-chart-t">NIFTY BANK</div><div id="gtb-daychart-bn" style="width:100%;height:340px;"></div></div>'
        + '</div>');
    ov.addClass('active');
    try { await _gtbRenderDayChart('NIFTY 50', date, 'gtb-daychart-n50', 340); } catch (e1) {}
    try { await _gtbRenderDayChart('NIFTY BANK', date, 'gtb-daychart-bn', 340); } catch (e2) {}
});

// ── Combo charts popup — every days NIFTY chart for a given 9:15 combo ────────
function _gtbComboChartPopup() {
    var el = document.getElementById('gtb-combochart-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'gtb-combochart-overlay';
        el.innerHTML = '<div id="gtb-combochart-panel">'
            + '<div id="gtb-combochart-hd"><span class="gtb-combochart-title"></span>'
            + '<i class="bi bi-x-lg gtb-combochart-close"></i></div>'
            + '<div id="gtb-combochart-body"></div></div>';
        document.body.appendChild(el);
    }
    jQ(el).toggleClass('gtb-light', jQ('#main-trade-bot-container').hasClass('gtb-light'));
    return jQ(el);
}
jQ(document).on('click', '.gtb-combochart-close, #gtb-combochart-overlay', function (e) {
    if (e.target.id === 'gtb-combochart-overlay' || jQ(e.target).closest('.gtb-combochart-close').length) {
        jQ('#gtb-combochart-overlay').removeClass('active');
        jQ('#gtb-combochart-body').html('');
    }
});
jQ(document).on('click', '#gtb-combochart-panel', function (e) { e.stopPropagation(); });

jQ(document).on('click', '.gtb-combo-row', async function (e) {
    e.stopPropagation();
    var key = jQ(this).data('key');
    var matches = _GTB_915_ROWS.filter(function (r) { return r.key === key; });
    if (!matches.length) return;
    var CAP = 12;                                   // most-recent N charts to limit fetches
    var show = matches.slice(0, CAP);
    var ov = _gtbComboChartPopup();
    ov.find('.gtb-combochart-title').html('<i class="bi bi-grid-3x3-gap"></i> Combo ' + key + ' — ' + matches.length + ' day(s)'
        + (matches.length > CAP ? ' (showing recent ' + CAP + ')' : ''));
    ov.addClass('active');

    var grid = '<div class="gtb-combochart-grid">';
    show.forEach(function (r, i) {
        var mc = r.move === 'UP' ? 'var(--gtb-green)' : 'var(--gtb-red)';
        var res = (r.legs || []).map(function (lg) {
            var t = lg.dir === 'long' ? 'L' : 'S';
            return '<span style="color:' + (lg.win ? 'var(--gtb-green)' : 'var(--gtb-red)') + ';">' + t + ' ' + (lg.pnl >= 0 ? '+' : '') + lg.pnl.toFixed(0) + '</span>';
        }).join('  *  ');
        grid += '<div class="gtb-combochart-cell">'
            + '<div class="gtb-combochart-lbl"><b>' + moment(r.date).format('DD MMM YY') + '</b>'
            + ' <span style="color:' + mc + ';font-family:var(--gtb-mono);">' + (r.move === 'UP' ? '▲' : '▼') + ' ' + (r.movePct >= 0 ? '+' : '') + r.movePct.toFixed(2) + '%</span>'
            + (res ? ' &nbsp;' + res : '') + '</div>'
            + '<div class="gtb-combochart-sublbl">NIFTY 50</div><div id="gtb-cchart-' + i + '-n" class="gtb-combochart-canvas"></div>'
            + '<div class="gtb-combochart-sublbl">NIFTY BANK</div><div id="gtb-cchart-' + i + '-b" class="gtb-combochart-canvas"></div>'
            + '</div>';
    });
    grid += '</div>';
    ov.find('#gtb-combochart-body').html(grid);

    // Fetch + render each days NIFTY + BANK charts sequentially (avoids hammering the API)
    for (var j = 0; j < show.length; j++) {
        try { await _gtbRenderDayChart('NIFTY 50',   show[j].date, 'gtb-cchart-' + j + '-n', 175); } catch (e1) {}
        try { await _gtbRenderDayChart('NIFTY BANK', show[j].date, 'gtb-cchart-' + j + '-b', 175); } catch (e2) {}
    }
});

// ── Futures remark-accuracy (#6, reconstructed from 5-min intraday candles) ────
// Fetches an instrument NSE futures intraday candles and replays the analyzer at
// EVERY 5-min candle (calling it WITHOUT a name → no side-effects), scoring each
// remark against the NEXT candle's move. Builds the full days accuracy in one pass.
async function _gtbFetchFutCandles(name) {
    var instName = name === 'NIFTY 50' ? 'NIFTY' : name === 'NIFTY BANK' ? 'BANKNIFTY' : name;
    var fut = null;
    jQ.each(FUTURE_INTRUMENT_LIST, function (i, it) { if (it.name === instName) fut = it; });
    if (!fut) return null;
    var pres = await getHistoricalDataUsingPromise(fut.instrument_token, _gtbPrevDay(), _gtbPrevDay(), 'day');
    var cres = await getHistoricalDataUsingPromise(fut.instrument_token, _gtbCurrDay(), _gtbCurrDayTo(), '5minute');
    var map = function (it) { return { date: moment(it[0]).format('HH:mm'), open: it[1], high: it[2], low: it[3], close: it[4], volume: it[5], oi: it[6] }; };
    var intr = (cres && cres.data && cres.data.candles) ? _gtbTrimCandles(cres.data.candles).map(map) : [];
    var pcs  = (pres && pres.data && pres.data.candles) ? pres.data.candles.map(map) : [];
    if (intr.length < 3 || !pcs.length) return null;
    return { lotSize: fut.lot_size, prevDay: pcs[pcs.length - 1], intraday: intr };
}

function _gtbReconstructFutAccuracy(cd, vix, accMap) {
    var intr = cd.intraday, prevDay = cd.prevDay, lot = cd.lotSize;
    for (var i = 1; i < intr.length - 1; i++) {            // need prev (momentum) and next (outcome)
        var upTo = intr.slice(0, i + 1);
        var hi = 0, lo = Infinity, vol = 0;
        for (var j = 0; j <= i; j++) { hi = Math.max(hi, parseFloat(intr[j].high)); lo = Math.min(lo, parseFloat(intr[j].low)); vol += parseFloat(intr[j].volume) || 0; }
        var synth = { date: intr[i].date, open: intr[0].open, high: hi, low: lo, close: intr[i].close, volume: vol, oi: intr[i].oi };
        var res = _gtbClassifyFutures(synth, prevDay, lot, upTo, { vix: vix, baselineVix: 13 }); // pure, no HTML
        var dir = res.dir;
        if (dir === 0) continue;
        var realized = parseFloat(intr[i + 1].close) - parseFloat(intr[i].close);  // next 5-min move
        var a = accMap[res.remark] || { hits: 0, total: 0, pts: 0 };
        a.total++; if ((dir > 0 && realized > 0) || (dir < 0 && realized < 0)) a.hits++;
        a.pts += (dir > 0 ? realized : -realized);
        accMap[res.remark] = a;
    }
}

jQ(document).on('click', '#show-fut-accuracy', async function (e) {
    e.preventDefault();
    showMaximizeOverlay('<i class="bi bi-bullseye"></i> Futures Remark Accuracy — 5-min intraday reconstruction',
        '<div style="padding:30px;text-align:center;color:var(--gtb-muted);font-size:0.85rem;"><i class="bi bi-hourglass-split"></i> Replaying today\&#39;s 5-min candles…</div>');
    var instruments = ['NIFTY 50', 'NIFTY BANK', 'RELIANCE', 'HDFCBANK', 'ICICIBANK'];
    var vix = 0; try { vix = parseFloat((JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}')['INDIA VIX'] || {}).ltp) || 0; } catch (er) {}
    var accMap = {}, used = [];
    // Fetch all instruments' futures candles in parallel, then reconstruct (CPU) in order
    var cds = await Promise.all(instruments.map(function (nm) {
        return _gtbFetchFutCandles(nm).catch(function () { return null; });
    }));
    cds.forEach(function (cd, idx) {
        if (cd) { try { _gtbReconstructFutAccuracy(cd, vix, accMap); used.push(instruments[idx]); } catch (err) {} }
    });
    var rows = Object.keys(accMap).map(function (key) {
        var a = accMap[key];
        return { remark: key, total: a.total, hits: a.hits, win: a.total ? Math.round(a.hits / a.total * 100) : 0,
                 avgPts: a.total ? (a.pts / a.total) : 0, dir: getFuturesTrendScore(key) };
    }).sort(function (x, y) { return y.total - x.total; });

    var body;
    if (!rows.length) {
        body = '<div style="padding:24px;color:var(--gtb-red);">No intraday futures data available to reconstruct.</div>';
    } else {
        body = '<div class="gtb-t915-sub">Replayed every 5-min candle today across <b>' + used.join(', ') + '</b>. For each futures REMARK: how often its predicted direction matched the <b>next 5-min candle</b>. '
             + 'Higher win-rate + positive avg-pts = reliable; dimmed rows are low-sample.</div>';
        body += '<table class="gtb-t915-table"><thead><tr><th>Remark</th><th>Bias</th><th>Samples</th><th>Win-rate</th><th>Avg pts (5-min)</th></tr></thead><tbody>';
        rows.forEach(function (r) {
            var bc = r.dir > 0 ? 'up' : r.dir < 0 ? 'down' : 'flat';
            var wc = r.win >= 60 ? 'var(--gtb-green)' : r.win <= 40 ? 'var(--gtb-red)' : 'var(--gtb-amber)';
            body += '<tr' + (r.total < 8 ? ' style="opacity:0.55;"' : '') + '>'
                + '<td><span class="gtb-t915-out ' + bc + '">' + r.remark + '</span></td>'
                + '<td style="font-family:var(--gtb-mono);color:' + (r.dir > 0 ? 'var(--gtb-green)' : r.dir < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)') + ';">' + (r.dir > 0 ? '▲' : r.dir < 0 ? '▼' : '—') + '</td>'
                + '<td class="gtb-t915-date">' + r.total + '</td>'
                + '<td style="font-family:var(--gtb-mono);font-weight:800;color:' + wc + ';">' + r.win + '%</td>'
                + '<td style="font-family:var(--gtb-mono);color:' + (r.avgPts >= 0 ? 'var(--gtb-green)' : 'var(--gtb-red)') + ';">' + (r.avgPts >= 0 ? '+' : '') + r.avgPts.toFixed(1) + '</td>'
                + '</tr>';
        });
        body += '</tbody></table>';
    }
    jQ('#groot-maximize-body').html('<div class="gtb-t915-wrap">' + body + '</div>');
});

// ── OI Scan — all instruments (incl. weighted constituents) ───────────────────
// Reuses the OI data already cached in INSTRUMENT_SCORE_MAP[name].oiData (no fetch).
function _gtbAllOIInstruments() {
    var mainOrder = ['NIFTY 50', 'NIFTY BANK', 'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'CRUDEOILM', 'USDINR'];
    var seen = {}, list = [];
    function _has(n) { var od = INSTRUMENT_SCORE_MAP[n] && INSTRUMENT_SCORE_MAP[n].oiData; return od && od.tableData && od.tableData.length; }
    mainOrder.forEach(function (n) { if (_has(n)) { list.push({ name: n, group: 'Index / Stock' }); seen[n] = 1; } });
    // Weighted constituents (Nifty 50 + Bank Nifty), de-duped, sorted by name
    var w = Object.keys(NIFTY_50_WEIGHTED_STOCKS || {}).concat(Object.keys(NIFTY_BANK_WEIGHTED_STOCKS || {}));
    w.sort().forEach(function (n) { if (!seen[n] && _has(n)) { list.push({ name: n, group: 'Weighted constituent' }); seen[n] = 1; } });
    return list;
}

// Builds the compact OI list table HTML directly from oiData (works for any instrument).
function _gtbOITableHtml(oiData, pc) {
    var h = '<table class="aoi-tbl"><thead><tr>'
        + '<th>Strike</th><th>DeltaCE OI</th><th>CE OBV</th><th>DeltaPE OI</th><th>PE OBV</th><th>CE Signal</th><th>PE Signal</th><th>Score</th>'
        + '</tr></thead><tbody>';
    jQ.each(oiData.tableData, function (i, item) {
        var r = scoreOIStrikeForSignal(item, !!item['ATM_STRIKE'], pc);
        var c = item['CE_OBV'], p = item['PE_OBV'];
        var ceObv = parseFloat(c[c.length - 1].obv), peObv = parseFloat(p[p.length - 1].obv);
        var ceCh = parseFloat(item['CHG_OI_CE']), peCh = parseFloat(item['CHG_OI_PE']);
        var sc = r.score > 0 ? 'var(--gtb-green)' : r.score < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
        h += '<tr' + (item['ATM_STRIKE'] ? ' class="atm"' : '') + '>'
            + '<td><b>' + item['STRIKE'] + (item['ATM_STRIKE'] ? ' ★' : '') + '</b></td>'
            + '<td style="color:' + (ceCh > 0 ? 'var(--gtb-red)' : ceCh < 0 ? 'var(--gtb-green)' : 'inherit') + '">' + item['CHG_OI_CE'] + '</td>'
            + '<td style="color:' + (ceObv > 0 ? 'var(--gtb-red)' : ceObv < 0 ? 'var(--gtb-green)' : 'inherit') + '">' + ceObv.toFixed(1) + '</td>'
            + '<td style="color:' + (peCh > 0 ? 'var(--gtb-green)' : peCh < 0 ? 'var(--gtb-red)' : 'inherit') + '">' + item['CHG_OI_PE'] + '</td>'
            + '<td style="color:' + (peObv > 0 ? 'var(--gtb-green)' : peObv < 0 ? 'var(--gtb-red)' : 'inherit') + '">' + peObv.toFixed(1) + '</td>'
            + '<td>' + r.ceLabel + '</td><td>' + r.peLabel + '</td>'
            + '<td style="color:' + sc + ';font-weight:700;">' + (r.score > 0 ? '+' : '') + r.score.toFixed(2) + '</td>'
            + '</tr>';
    });
    h += '</tbody></table>';
    return h;
}

// One strike cell in the comparison matrix: CE/PE DeltaOI, OBV, CE/PE signal, score.
function _gtbOICell(item, pc, isATM) {
    if (!item) return '<td class="oic-cell empty">—</td>';
    var r = scoreOIStrikeForSignal(item, !!item['ATM_STRIKE'], pc);
    var c = item['CE_OBV'], p = item['PE_OBV'];
    var ceObv = parseFloat(c[c.length - 1].obv), peObv = parseFloat(p[p.length - 1].obv);
    var ceCh = parseFloat(item['CHG_OI_CE']), peCh = parseFloat(item['CHG_OI_PE']);
    var sc = r.score > 0 ? 'var(--gtb-green)' : r.score < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
    var ceLC = (r.ceLabel.indexOf('WRITE') >= 0 || r.ceLabel.indexOf('UNWIND') >= 0) ? 'var(--gtb-red)' : (r.ceLabel.indexOf('BUY') >= 0 || r.ceLabel.indexOf('COV') >= 0) ? 'var(--gtb-green)' : 'var(--gtb-muted)';
    var peLC = (r.peLabel.indexOf('WRITE') >= 0 || r.peLabel.indexOf('UNWIND') >= 0) ? 'var(--gtb-green)' : (r.peLabel.indexOf('BUY') >= 0 || r.peLabel.indexOf('COV') >= 0) ? 'var(--gtb-red)' : 'var(--gtb-muted)';
    return '<td class="oic-cell' + (isATM ? ' atm' : '') + '">'
        + '<div class="oic-strike">' + item['STRIKE'] + (isATM ? ' ★' : '') + '</div>'
        + '<div class="oic-kv"><span>CEDelta</span> <b style="color:' + (ceCh > 0 ? 'var(--gtb-red)' : ceCh < 0 ? 'var(--gtb-green)' : 'inherit') + '">' + item['CHG_OI_CE'] + '</b>'
        + ' &nbsp;<span>PEDelta</span> <b style="color:' + (peCh > 0 ? 'var(--gtb-green)' : peCh < 0 ? 'var(--gtb-red)' : 'inherit') + '">' + item['CHG_OI_PE'] + '</b></div>'
        + '<div class="oic-kv"><span>OBV</span> C<b style="color:' + (ceObv > 0 ? 'var(--gtb-red)' : ceObv < 0 ? 'var(--gtb-green)' : 'inherit') + '">' + ceObv.toFixed(0) + '</b>'
        + ' P<b style="color:' + (peObv > 0 ? 'var(--gtb-green)' : peObv < 0 ? 'var(--gtb-red)' : 'inherit') + '">' + peObv.toFixed(0) + '</b></div>'
        + '<div class="oic-sig"><span style="color:' + ceLC + '">' + r.ceLabel + '</span> / <span style="color:' + peLC + '">' + r.peLabel + '</span></div>'
        + '<div class="oic-score" style="color:' + sc + '">' + (r.score > 0 ? '+' : '') + r.score.toFixed(2) + '</div>'
        + '</td>';
}

// Compact cell — score-only heatmap (strike + score, background tinted by score).
function _gtbOICellCompact(item, pc, isATM) {
    if (!item) return '<td class="oic-cell-c empty">—</td>';
    var r = scoreOIStrikeForSignal(item, !!item['ATM_STRIKE'], pc);
    var s = r.score, mag = Math.min(1, Math.abs(s) / 4.5);
    var bg = s > 0 ? 'rgba(0,229,160,' + (0.12 + mag * 0.5).toFixed(2) + ')'
           : s < 0 ? 'rgba(255,77,106,' + (0.12 + mag * 0.5).toFixed(2) + ')' : 'transparent';
    var col = s > 0 ? 'var(--gtb-green)' : s < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
    return '<td class="oic-cell-c' + (isATM ? ' atm' : '') + '" style="background:' + bg + ';" '
        + 'title="' + item['STRIKE'] + '  *  CE ' + r.ceLabel + ' / PE ' + r.peLabel + '  *  DeltaCE ' + item['CHG_OI_CE'] + ' DeltaPE ' + item['CHG_OI_PE'] + '">'
        + '<div class="oic-c-strike">' + item['STRIKE'] + (isATM ? '★' : '') + '</div>'
        + '<div class="oic-c-score" style="color:' + col + '">' + (s > 0 ? '+' : '') + s.toFixed(1) + '</div></td>';
}

// Horizontal comparison matrix — one row per instrument, strike columns centred on ATM.
function _gtbOICompareTableHtml(list, mode) {
    var cellFn = (mode === 'compact') ? _gtbOICellCompact : _gtbOICell;
    var OFFS = [-2, -1, 0, 1, 2];
    var h = '<table class="oic-matrix"><thead><tr>'
        + '<th class="oic-sticky">Instrument</th><th>OI</th><th>PCR</th>'
        + OFFS.map(function (o) { return '<th>' + (o === 0 ? 'ATM' : 'ATM' + (o > 0 ? '+' + o : o)) + '</th>'; }).join('')
        + '</tr></thead><tbody>';
    var lastGroup = '';
    list.forEach(function (it) {
        if (it.group !== lastGroup) { h += '<tr class="oic-grouprow"><td colspan="' + (3 + OFFS.length) + '">' + it.group + '</td></tr>'; lastGroup = it.group; }
        var name = it.name, sm = INSTRUMENT_SCORE_MAP[name] || {}, oiData = sm.oiData;
        var td = oiData.tableData, atmIdx = -1;
        for (var i = 0; i < td.length; i++) { if (td[i]['ATM_STRIKE']) { atmIdx = i; break; } }
        if (atmIdx < 0) atmIdx = Math.floor(td.length / 2);
        var pc = 0; try { pc = parseFloat(generateTrend(name).change) || 0; } catch (e) {}
        var oiScore = (sm.oi_obv != null) ? sm.oi_obv : 0;
        var scColor = oiScore > 0 ? 'var(--gtb-green)' : oiScore < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
        h += '<tr><td class="oic-sticky"><b>' + name + '</b></td>'
            + '<td style="color:' + scColor + ';font-weight:700;font-family:var(--gtb-mono);">' + (oiScore > 0 ? '+' : '') + (typeof oiScore === 'number' ? oiScore.toFixed(1) : oiScore) + '</td>'
            + '<td style="font-family:var(--gtb-mono);">' + (oiData.pcr != null ? oiData.pcr : '—') + '</td>';
        OFFS.forEach(function (off) {
            var idx = atmIdx + off;
            h += cellFn((idx >= 0 && idx < td.length) ? td[idx] : null, pc, off === 0);
        });
        h += '</tr>';
    });
    h += '</tbody></table>';
    return h;
}

jQ(document).on('click', '#show-all-oi', function (e) {
    e.preventDefault();
    var list = _gtbAllOIInstruments();
    if (!list.length) {
        showMaximizeOverlay('<i class="bi bi-layers-fill"></i> OI Compare — All Instruments',
            '<div style="padding:30px;text-align:center;color:var(--gtb-muted);">No OI data scanned yet. Run a refresh (with OI scan) first.</div>');
        return;
    }
    _GTB_OIC_LIST = list;
    var mode = localStorage.getItem('GTB_OIC_MODE') || 'detailed';
    var html = '<div class="aoi-wrap">'
        + '<div class="oic-toolbar">'
        + '<span class="aoi-note" style="margin:0;"><i class="bi bi-info-circle"></i> ' + list.length
        + ' instruments  *  rows = instruments, columns = strikes around ATM (★).</span>'
        + '<div class="oic-modes">'
        + '<button class="oic-mode-btn' + (mode !== 'compact' ? ' active' : '') + '" data-mode="detailed"><i class="bi bi-table"></i> Detailed</button>'
        + '<button class="oic-mode-btn' + (mode === 'compact' ? ' active' : '') + '" data-mode="compact"><i class="bi bi-grid-3x3"></i> Compact</button>'
        + '</div></div>'
        + '<div id="oic-table-wrap" style="overflow:auto;">' + _gtbOICompareTableHtml(list, mode) + '</div></div>';
    showMaximizeOverlay('<i class="bi bi-layers-fill"></i> OI Compare Matrix — All Instruments (' + list.length + ')', html);
});

// Detailed / Compact toggle
jQ(document).on('click', '.oic-mode-btn', function () {
    var m = jQ(this).data('mode');
    localStorage.setItem('GTB_OIC_MODE', m);
    jQ('.oic-mode-btn').removeClass('active');
    jQ(this).addClass('active');
    jQ('#oic-table-wrap').html(_gtbOICompareTableHtml(_GTB_OIC_LIST, m));
});

// ── Commodities popup — GIFT NIFTY + Crude (chart, OI, futures) ────────────────
// Renders OI/OBV bar charts into the given containers from cached oiData.
function _cmdRenderOI(oiData, oiSel, obvSel) {
    var x = ['x'], ceCh = ['CH CE OI'], peCh = ['CH PE OI'], ceObv = ['CE OBV'], peObv = ['PE OBV'], atm = -1;
    jQ.each(oiData.tableData, function (i, item) {
        x.push(item['STRIKE']); ceCh.push(item['CHG_OI_CE']); peCh.push(item['CHG_OI_PE']);
        var c = item['CE_OBV'], p = item['PE_OBV'];
        ceObv.push(parseFloat(c[c.length - 1].obv).toFixed(1));
        peObv.push(parseFloat(p[p.length - 1].obv).toFixed(1));
        if (item['ATM_STRIKE']) atm = i;
    });
    var strikes = x.slice(1);
    _renderBarChart(oiSel,  { labels: strikes, atm: atm, height: 170, series: [
        { label: 'CH CE OI', color: OI_COLORS.CE_OI, values: ceCh.slice(1) },
        { label: 'CH PE OI', color: OI_COLORS.PE_OI, values: peCh.slice(1) } ] });
    _renderBarChart(obvSel, { labels: strikes, atm: atm, height: 170, series: [
        { label: 'CE OBV', color: OI_COLORS.CE_OBV, values: ceObv.slice(1) },
        { label: 'PE OBV', color: OI_COLORS.PE_OBV, values: peObv.slice(1) } ] });
}

jQ(document).on('click', '#show-commodities', function (e) {
    e.preventDefault();
    var body = ''
        + '<div class="cmd-grid">'
        + '<div class="cmd-cell"><div class="cmd-t"><i class="bi bi-globe-asia-australia"></i> GIFT NIFTY</div><div id="cmd-gift-chart" style="height:300px;"></div></div>'
        + '<div class="cmd-cell"><div class="cmd-t"><i class="bi bi-droplet-fill"></i> CRUDEOILM</div><div id="cmd-crude-chart" style="height:300px;"></div></div>'
        + '</div>'
        + '<div class="cmd-t"><i class="bi bi-bar-chart-fill"></i> CRUDEOILM — OI / OBV</div>'
        + '<div class="cmd-oi-charts"><div><div class="cmd-st">OI Change (CE/PE)</div><div id="cmd-crude-oi"></div></div>'
        + '<div><div class="cmd-st">OBV (CE/PE)</div><div id="cmd-crude-obv"></div></div></div>'
        + '<div id="cmd-crude-oi-table" style="overflow-x:auto;margin-top:6px;"><div class="cmd-load"><i class="bi bi-hourglass-split"></i> Loading OI…</div></div>'
        + '<div class="cmd-t"><i class="bi bi-graph-up"></i> CRUDEOILM — Futures Trend</div>'
        + '<div id="cmd-crude-fut" class="cmd-fut"><div class="cmd-load"><i class="bi bi-hourglass-split"></i> Loading futures…</div></div>';
    showMaximizeOverlay('<i class="bi bi-droplet-fill"></i> Commodities — GIFT NIFTY &amp; Crude', body);

    setTimeout(async function () {
        // Charts
        try { await showTopChart('GIFT NIFTY', '#cmd-gift-chart', 300); } catch (e1) {}
        try { await showTopChartMCX('CRUDEOILM', 300, '#cmd-crude-chart'); } catch (e2) {}

        // ── Load CRUDEOILM futures fresh ──────────────────────────────────────
        var fres = null;
        try {
            fres = await showFutureDetailsMCX('CRUDEOILM');
            setFutureDetails('CRUDEOILM', fres);
            if (!INSTRUMENT_SCORE_MAP['CRUDEOILM']) INSTRUMENT_SCORE_MAP['CRUDEOILM'] = {};
            INSTRUMENT_SCORE_MAP['CRUDEOILM'].futures_trend = getFuturesTrendScore(fres['REMARK']);
        } catch (e3) {}
        var prem  = jQ('#CRUDEOILM-futures-premium').html() || '';
        var fut   = jQ('#CRUDEOILM-futures').html() || '';
        var trend = jQ('#CRUDEOILM-futures-trend').html() || '';
        var vwap  = jQ('#CRUDEOILM-futures-vwap').html() || '';
        jQ('#cmd-crude-fut').html((prem || fut || trend || vwap)
            ? ('<div class="cmd-fut-prem">' + prem + '</div>' + fut + '<div class="cmd-fut-meta">' + trend + ' ' + vwap + '</div>')
            : '<div class="cmd-load" style="color:var(--gtb-red);">Futures unavailable.</div>');

        // ── Load CRUDEOILM OI fresh ───────────────────────────────────────────
        try {
            if (fres) await showPrictionProbabiltyMCX('CRUDEOILM', fres);
            showOIOBVBarChart('CRUDEOILM');   // populates INSTRUMENT_SCORE_MAP['CRUDEOILM'].oiData
        } catch (e4) {}
        var oiData = INSTRUMENT_SCORE_MAP['CRUDEOILM'] && INSTRUMENT_SCORE_MAP['CRUDEOILM'].oiData;
        if (oiData && oiData.tableData && oiData.tableData.length) {
            var pc = 0; try { pc = parseFloat(generateTrend('CRUDEOILM').change) || 0; } catch (e5) {}
            try { _cmdRenderOI(oiData, '#cmd-crude-oi', '#cmd-crude-obv'); } catch (e6) {}
            jQ('#cmd-crude-oi-table').html(_gtbOITableHtml(oiData, pc));
        } else {
            jQ('#cmd-crude-oi-table').html('<div class="cmd-load" style="color:var(--gtb-red);">CRUDEOILM OI unavailable.</div>');
        }
    }, 80);
});

// ── Strike-level probability backtest ─────────────────────────────────────────
// Backtests how price behaves once it touches each strike level, using daily OHLC.
// Levels are deterministic from the days open + fixed strike steps (NSE_STRIKE_DIFF):
//   ASO = open+s1, AST = open+s1+s2, BSO = open−s1, BST = open−s1−s2.
// For each past day we check if a level was *touched* (high≥ up-level / low≤ down-level)
// and whether the day *closed* on the bullish or bearish side of that level:
//   ASO/AST: Up% = close ≥ level (continued up),  Down% = close < level (reversed down)
//   BSO/BST: Up% = close > level (reversed up),   Down% = close ≤ level (continued down)
// "Up%" always = bullish outcome, "Down%" = bearish outcome, so it reads consistently.
async function _gtbStrikeProb(name, lookback) {
    lookback = lookback || 60;
    var ckey = 'GTB_STRIKEPROB_' + name + '_' + moment().format('YYYY-MM-DD') + '_' + lookback;
    try { var c = localStorage.getItem(ckey); if (c) return JSON.parse(c); } catch (e) {}

    var token = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS[name] : null;
    if (!token && typeof COMMODITIES_FUTURE_INSTRUMENT_LIST !== 'undefined') {
        var m = COMMODITIES_FUTURE_INSTRUMENT_LIST.find(function (f) { return f.name === name; });
        if (m) token = m.instrument_token;
    }
    if (!token) return { error: 'No instrument token for ' + name };

    var sd = getStrikeDiff(name).split(',');
    var s1 = parseInt(sd[0]) || 0, s2 = parseInt(sd[1]) || s1;
    if (!s1) return { error: 'No strike interval for ' + name };

    var to   = moment().format('YYYY-MM-DD');
    var from = moment().subtract(Math.ceil(lookback * 1.6) + 12, 'days').format('YYYY-MM-DD');
    var res  = await getHistoricalDataUsingPromise(token, from, to, 'day');
    var candles = (res && res.data && res.data.candles) ? res.data.candles : [];
    if (!candles.length) return { error: 'No historical data for ' + name };
    candles = candles.slice(-lookback);

    function mk() { return { n: 0, bull: 0, bear: 0 }; }
    var L = { ASO: mk(), AST: mk(), BSO: mk(), BST: mk() };
    candles.forEach(function (cd) {
        var open = parseFloat(cd[1]), high = parseFloat(cd[2]), low = parseFloat(cd[3]), close = parseFloat(cd[4]);
        if (!open) return;
        var ASO = open + s1, AST = open + s1 + s2, BSO = open - s1, BST = open - s1 - s2;
        if (high >= ASO) { L.ASO.n++; if (close >= ASO) L.ASO.bull++; else L.ASO.bear++; }
        if (high >= AST) { L.AST.n++; if (close >= AST) L.AST.bull++; else L.AST.bear++; }
        if (low  <= BSO) { L.BSO.n++; if (close >  BSO) L.BSO.bull++; else L.BSO.bear++; }
        if (low  <= BST) { L.BST.n++; if (close >  BST) L.BST.bull++; else L.BST.bear++; }
    });
    function row(x) {
        return { n: x.n, up: x.n ? Math.round(x.bull / x.n * 100) : 0, down: x.n ? Math.round(x.bear / x.n * 100) : 0 };
    }
    var out = { name: name, days: candles.length, s1: s1, s2: s2,
        ASO: row(L.ASO), AST: row(L.AST), BSO: row(L.BSO), BST: row(L.BST) };
    try { localStorage.setItem(ckey, JSON.stringify(out)); } catch (e) {}
    return out;
}

// Renders the probability result into the maximize overlay body.
function _renderStrikeProb(name, r) {
    if (!r || r.error) {
        return '<div style="padding:24px;text-align:center;color:var(--gtb-muted);font-size:0.8rem;">'
            + '<i class="bi bi-exclamation-triangle"></i> ' + ((r && r.error) || 'No data') + '</div>';
    }
    var meta = [
        { k: 'AST', label: 'AST', desc: 'open +' + (r.s1 + r.s2) + ' (2nd up)',  expect: 'reversal down' },
        { k: 'ASO', label: 'ASO', desc: 'open +' + r.s1 + ' (1st up)',           expect: 'continuation up' },
        { k: 'BSO', label: 'BSO', desc: 'open −' + r.s1 + ' (1st down)',         expect: 'continuation down' },
        { k: 'BST', label: 'BST', desc: 'open −' + (r.s1 + r.s2) + ' (2nd down)', expect: 'reversal up' },
    ];
    var html = '<div class="gtb-prob-wrap">';
    html += '<div class="gtb-prob-sub">Of the last <b>' + r.days + '</b> trading days, '
         +  'how price closed once each level was touched intraday. '
         +  '<b style="color:var(--gtb-green)">Up%</b> = bullish outcome, '
         +  '<b style="color:var(--gtb-red)">Down%</b> = bearish outcome.</div>';
    html += '<table class="gtb-prob-table"><thead><tr>'
         +  '<th>Level</th><th>Touched</th><th>▲ Up</th><th>▼ Down</th><th>Bias</th></tr></thead><tbody>';
    meta.forEach(function (mt) {
        var d = r[mt.k];
        var upWin = d.up >= d.down;
        var biasTxt = d.n === 0 ? '—' : (upWin ? 'UP ' + d.up + '%' : 'DOWN ' + d.down + '%');
        var biasCls = d.n === 0 ? 'flat' : (upWin ? 'up' : 'down');
        html += '<tr>'
            + '<td><span class="gtb-prob-lvl ' + mt.k.toLowerCase() + '">' + mt.label + '</span>'
            + '<div class="gtb-prob-desc">' + mt.desc + '</div></td>'
            + '<td class="gtb-prob-n">' + d.n + '</td>'
            + '<td><div class="gtb-prob-bar"><div class="gtb-prob-fill up" style="width:' + d.up + '%"></div></div>'
            + '<span class="gtb-prob-pct up">' + d.up + '%</span></td>'
            + '<td><div class="gtb-prob-bar"><div class="gtb-prob-fill down" style="width:' + d.down + '%"></div></div>'
            + '<span class="gtb-prob-pct down">' + d.down + '%</span></td>'
            + '<td><span class="gtb-prob-bias ' + biasCls + '">' + biasTxt + '</span></td>'
            + '</tr>';
    });
    html += '</tbody></table>';
    html += '<div class="gtb-prob-foot"><i class="bi bi-info-circle"></i> '
         +  'Low "Touched" counts = small sample, treat the % with caution. Levels use a fixed strike step ('
         +  r.s1 + '/' + r.s2 + '), computed from each days open.</div>';
    html += '</div>';
    return html;
}

jQ(document).on('click', '.gtb-prob-btn', async function (e) {
    e.preventDefault(); e.stopPropagation();
    var name = jQ(this).data('name');
    showMaximizeOverlay('<i class="bi bi-percent"></i> ' + name + ' — Strike-Level Probability (60-day backtest)',
        '<div style="padding:30px;text-align:center;color:var(--gtb-muted);font-size:0.85rem;">'
        + '<i class="bi bi-hourglass-split"></i> Backtesting last 60 days…</div>');
    try {
        var r = await _gtbStrikeProb(name, 60);
        jQ('#groot-maximize-body').html(_renderStrikeProb(name, r));
    } catch (err) {
        jQ('#groot-maximize-body').html('<div style="padding:24px;color:var(--gtb-red);">Error: ' + (err && err.message) + '</div>');
    }
});

function placeHolder(name) {
    let tempName = name.replaceAll(" ", "-")
    let html = ''
    html += '<div class="gc-col">'
    html += '<div class="gc-header"><span class="sv-section-label">PLACEHOLDER</span></div>'
    html += '<div class="gc-body"><div id="' + tempName + '-placeholder"></div></div>'
    html += '</div>'
    return html;
}

function showComponent915Close(name, column) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let html = ''
    html += '<div class="gc-col">'
    html += '<div class="gc-header"><span class="sv-section-label">9:15 CLOSE</span></div>'
    html += '<div class="gc-body">'
    html += '  <div id="' + tempName + '-nine-fifteen-close"></div>'
    html += '  <div id="' + tempName + '-nine-fifteen-close-table"></div>'
    html += '</div>'
    html += '</div>'
    return html;
}


function showComponenAdvanceDeclineTrend(name, column) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let html = ''
    html += '<div class="gc-col">'
    html += '<div class="gc-header">'
    html += '  <span class="sv-section-label">A/D INDEX</span>'
    html += '  <span class="gc-meta-badge" id="' + tempName + '-advance-decline-adr">ADR</span>'
    html += '</div>'
    html += '<div class="gc-body"><div id="' + tempName + '-advance-decline"></div></div>'
    html += '</div>'
    return html;
}

function showComponenAdvanceDeclineFutureTrend(name, column) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let html = ''
    html += '<div class="gc-col">'
    html += '<div class="gc-header">'
    html += '  <span class="sv-section-label">A/D FUTURES</span>'
    html += '  <span class="gc-meta-badge" id="' + tempName + '-advance-decline-adr-future">ADR</span>'
    html += '</div>'
    html += '<div class="gc-body"><div id="' + tempName + '-advance-decline-future"></div></div>'
    html += '</div>'
    return html;
}

function showComponentFutures(name, column) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let html = ''
    html += '<div class="gc-col">'
    html += '<div class="gc-header">'
    html += '  <span class="sv-section-label" id="futures-chart-' + tempName + '">FUTURES</span>'
    html += '  <span class="hdr-meta">'
    html += '    <span id="' + tempName + '-futures-premium" class="gc-premium-badge"></span>'
    html += '  </span>'
    html += '  <span class="hdr-actions">'
    html += '    <button class="sv-icon-btn refresh-futures" data-name="' + name + '" title="Refresh"><i class="bi bi-arrow-clockwise"></i></button>'
    html += '    <button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="futures" title="Maximize"><i class="bi bi-fullscreen"></i></button>'
    html += '  </span>'
    html += '</div>'
    html += '<div class="gc-body">'
    html += '  <div id="' + tempName + '-futures" class="gc-fut-signals"></div>'
    html += '  <div class="gc-fut-meta">'
    html += '    <span class="sv-meta-label">VWAP</span> <span id="' + tempName + '-futures-vwap" class="sv-meta-val"></span>'
    html += '    &nbsp;<span class="sv-meta-label">TREND</span> <span id="' + tempName + '-futures-trend" class="sv-meta-val"></span>'
    html += '  </div>'
    html += '</div>'
    html += '</div>'
    return html;
}

function showComponentOI(name) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let html = ''
    html += '<div class="gc-col gc-col-full">'
    html += '<div class="gc-header">'
    html += '  <span class="sv-section-label">OI / OBV</span>'
    html += '  <span class="hdr-meta">'
    html += '    <span id="' + tempName + '-oi-score" class="sv-score-val"></span>'
    html += '    <span id="' + tempName + '-pcr-probability" class="sv-pcr-val"></span>'
    html += '  </span>'
    html += '  <span class="hdr-actions">'
    html += '    <button class="sv-icon-btn refresh-oi-obv" data-name="' + name + '" title="Refresh OI"><i class="bi bi-arrow-clockwise"></i></button>'
    html += '    <button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="oi" title="Maximize"><i class="bi bi-fullscreen"></i></button>'
    html += '  </span>'
    html += '</div>'
    html += '<div class="gc-oi-body">'
    html += '  <div id="' + tempName + '-oi" class="sv-mini-chart"></div>'
    html += '  <div id="' + tempName + '-oi-signal-row" class="sv-signal-row"></div>'
    html += '  <div id="' + tempName + '-obv" class="sv-mini-chart"></div>'
    html += '  <div id="' + tempName + '-component-oi-list-table" class="sv-oi-table"></div>'
    html += '</div>'
    html += '</div>'
    return html;
}

function showComponentOITable(name, suffix) {
    suffix = suffix || '';
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let strikes = stock[0]['DATA']['tableData']
    let link = "https://kite.zerodha.com/markets/ext/chart/web/tvc/NFO-OPT/##INSTRUMENT##/##TOKEN##"

    // Determine which index is ATM from the data flag
    let atmIdx = -1;
    for (let i = 0; i < strikes.length; i++) {
        if (strikes[i]['ATM_STRIKE']) { atmIdx = i; break; }
    }
    // Fallback: middle index
    if (atmIdx === -1) atmIdx = Math.floor(strikes.length / 2);

    function strikeGroupClass(i) {
        let diff = i - atmIdx;
        if (diff === 0)  return 'atm-col-class';
        if (diff < 0)    return 'itm-col-class';
        return 'otm-col-class';
    }

    function strikeGroupLabel(i) {
        let diff = i - atmIdx;
        if (diff === 0)  return 'ATM ★';
        if (diff < 0)    return 'ITM ' + Math.abs(diff);
        return 'OTM ' + diff;
    }

    // ── IV cell helper — shows current IV% with ▲/▼ direction arrow ───────────
    function _ivCell(ivList) {
        if (!ivList || !ivList.length) return '<span style="color:#7d8590;">—</span>';
        let curr = null, prev = null;
        for (let _i = ivList.length - 1; _i >= 0 && curr === null; _i--) if (ivList[_i].iv !== null) curr = ivList[_i].iv;
        for (let _i = ivList.length - 2; _i >= 0 && prev === null; _i--) if (ivList[_i].iv !== null) prev = ivList[_i].iv;
        if (curr === null) return '<span style="color:#7d8590;">—</span>';
        let arrow = '', color = '#e6edf3';
        if (prev !== null) {
            let diff = curr - prev;
            if (diff > 0.3)       { arrow = '▲'; color = '#f85149'; }
            else if (diff < -0.3) { arrow = '▼'; color = '#3fb950'; }
        }
        return '<span style="color:' + color + ';">' + curr.toFixed(1) + arrow + '</span>';
    }

    // ── Build per-strike signal labels (CE/PE outcome interpretation) ──────────
    let priceChange = stock[0] && stock[0]['DATA'] ? (stock[0]['DATA'].priceChange || 0) : 0;
    let strikeSignalMap = {};
    strikes.forEach(function(s) {
        if (s) strikeSignalMap[s['STRIKE']] = scoreOIStrikeForSignal(s, !!s['ATM_STRIKE'], priceChange);
    });

    // ── Signal label cell ───────────────────────────────────────────────────────
    function _signalBadge(label) {
        if (!label || label === '—') return '<span style="color:#7d8590;font-size:0.65rem;">—</span>';
        let bg = '#444';
        if (label === 'CE WRITE' || label === 'CE UNWIND') bg = '#6b1a1a';      // bearish — resistance
        else if (label === 'CE BUY'   || label === 'CE COV')   bg = '#1a4a1a';  // bullish — breakout
        else if (label === 'PE WRITE' || label === 'PE UNWIND') bg = '#1a4a1a'; // bullish — support
        else if (label === 'PE BUY'   || label === 'PE COV')    bg = '#6b1a1a'; // bearish — put buyers
        let color = (bg === '#1a4a1a') ? '#3fb950' : (bg === '#6b1a1a') ? '#f85149' : '#aaa';
        return '<span style="font-size:0.62rem;padding:1px 4px;border-radius:3px;background:' + bg + ';color:' + color + ';white-space:nowrap;">' + label + '</span>';
    }

    // ── Per-group background — alternating subtle tints for vertical separation ──
    let groupBgs = ['rgba(255,255,255,0.02)', 'rgba(88,166,255,0.04)'];
    function _groupBg(i) { return i === atmIdx ? 'rgba(88,166,255,0.08)' : groupBgs[i % 2]; }

    // ── Separator style — 3px coloured left border on first col of each group ───
    function _sepStyle(i) {
        if (i === 0) return '';
        let color = i === atmIdx ? '#58a6ff' : '#3d444d';
        return 'border-left:3px solid ' + color + ';';
    }

    let html = '<div style="overflow-x:auto;">'
    html += '<table class="table display nowrap oi-strike-table" style="width:100%;border-collapse:separate;border-spacing:0;">'
    html += '<thead>'

    // Row 1 — Strike group label (ITM / ATM / OTM) with separator
    html += '<tr>'
    for (let i = 0; i < strikes.length; i++) {
        let gc = strikeGroupClass(i);
        let gl = strikeGroupLabel(i);
        let isATM = i === atmIdx;
        let extraStyle = (isATM ? 'font-weight:900;letter-spacing:0.5px;' : '') + _sepStyle(i) + 'background:' + _groupBg(i) + ';';
        html += '<th colspan="7" class="strike-colspan-class ' + gc + '" style="text-align:center;' + extraStyle + '">' + gl + '</th>'
    }
    html += '</tr>'

    // Row 2 — Column sub-headers with interpretation subtitle
    //   Layout per strike group: CE Delta | CE OBV | CE IV% | STRIKE | PE IV% | PE OBV | PE Delta
    let colDefs = [
        { label: 'CE Delta',   hint: 'OI Change',   hintColor: '#f85149',
          title: 'CE OI Change: +ve = new call positions (resistance). −ve = positions closed.' },
        { label: 'CE OBV', hint: 'Vol Pressure', hintColor: '#f85149',
          title: 'CE OBV: cumulative volume on up-ticks vs down-ticks today. +ve = call buying (bearish).' },
        { label: 'CE IV%', hint: 'Implied Vol',  hintColor: '#58a6ff',
          title: 'CE Implied Volatility %. ▲ = call buyers paying up (CE BUY / bullish). ▼ = call writers active (CE WRITE / resistance).' },
        { label: 'STRIKE', hint: '',             hintColor: '',
          title: 'Strike price. ATM = at-the-money.' },
        { label: 'PE IV%', hint: 'Implied Vol',  hintColor: '#58a6ff',
          title: 'PE Implied Volatility %. ▲ = put buyers paying up (PE BUY / bearish). ▼ = put writers active (PE WRITE / support floor).' },
        { label: 'PE OBV', hint: 'Vol Pressure', hintColor: '#3fb950',
          title: 'PE OBV: cumulative volume on up-ticks vs down-ticks today. +ve = put buying (bearish).' },
        { label: 'PE Delta',   hint: 'OI Change',   hintColor: '#3fb950',
          title: 'PE OI Change: +ve = new put positions (support). −ve = positions closed.' },
    ];
    html += '<tr>'
    for (let i = 0; i < strikes.length; i++) {
        let isATM = i === atmIdx;
        let atmCls = isATM ? 'oi-atm-subhdr' : '';
        let bg = _groupBg(i);
        // Bottom border colour matches the group's left-border colour — ties each header block together
        let hdrBorderColor = isATM ? '#58a6ff' : '#3d444d';
        colDefs.forEach(function(col, ci) {
            let leftSep = (ci === 0) ? _sepStyle(i) : '';
            let align = (col.label === 'STRIKE') ? 'center' : 'right';
            html += '<th class="' + atmCls + '" style="background:' + bg + ';text-align:' + align + ';padding:3px 5px;border-bottom:2px solid ' + hdrBorderColor + ';' + leftSep + '" title="' + col.title + '">'
                + '<div style="font-size:0.7rem;font-weight:700;">' + col.label + '</div>'
                + (col.hint ? '<div style="font-size:0.58rem;color:' + col.hintColor + ';font-weight:400;line-height:1.1;">' + col.hint + '</div>' : '')
                + '</th>'
        });
    }
    html += '</tr>'
    html += '</thead><tbody>'

    // Data row
    html += '<tr>'
    for (let i = 0; i < strikes.length; i++) {
        let s = strikes[i];
        let sep = _sepStyle(i);
        let bg = _groupBg(i);
        if (!s) { html += '<td colspan="7" style="background:' + bg + ';' + sep + '"></td>'; continue; }
        let isATM = i === atmIdx;
        let tdBase = 'background:' + bg + ';padding:4px 5px;font-size:0.72rem;vertical-align:middle;';

        let ceObvList = s['CE_OBV'], peObvList = s['PE_OBV'];
        let ceObv = parseFloat(ceObvList[ceObvList.length-1]['obv']);
        let peObv = parseFloat(peObvList[peObvList.length-1]['obv']);

        let ceChg = parseFloat(s['CHG_OI_CE']);
        let peChg = parseFloat(s['CHG_OI_PE']);
        let ceChgColor = ceChg > 0 ? '#f85149' : ceChg < 0 ? '#3fb950' : '#e6edf3';
        let peChgColor = peChg > 0 ? '#3fb950' : peChg < 0 ? '#f85149' : '#e6edf3';
        let ceObvColor = ceObv > 0 ? '#f85149' : ceObv < 0 ? '#3fb950' : '#e6edf3';
        let peObvColor = peObv > 0 ? '#3fb950' : peObv < 0 ? '#f85149' : '#e6edf3';

        let strikeHtml = '<div style="display:flex;gap:4px;justify-content:center;align-items:center;">'
            + '<span style="font-weight:' + (isATM ? '900' : '600') + ';font-size:0.75rem;">' + s['STRIKE'] + '</span>'
            + '<a href="' + link.replaceAll("##INSTRUMENT##", s.CE.tradingsymbol).replaceAll("##TOKEN##", s.CE.instrument_token) + '" target="_blank" class="oi-link">CE</a>'
            + '<a href="' + link.replaceAll("##INSTRUMENT##", s.PE.tradingsymbol).replaceAll("##TOKEN##", s.PE.instrument_token) + '" target="_blank" class="oi-link">PE</a>'
            + '</div>'

        let td = function(content, color, extraStyle) {
            return '<td style="' + tdBase + (extraStyle||'') + 'text-align:right;color:' + (color||'#e6edf3') + ';">' + content + '</td>';
        }
        html += td(s['CHG_OI_CE'], ceChgColor, sep)
        html += td(ceObv,              ceObvColor, '')
        html += td(_ivCell(s['CE_IV']), '', '')
        html += '<td style="' + tdBase + 'text-align:center;">' + strikeHtml + '</td>'
        html += td(_ivCell(s['PE_IV']), '', '')
        html += td(peObv,              peObvColor, '')
        html += td(s['CHG_OI_PE'], peChgColor, '')
    }
    html += '</tr>'

    // Signal outcome row — CE/PE signal badge + score per strike
    html += '<tr>'
    for (let i = 0; i < strikes.length; i++) {
        let s = strikes[i];
        let sep = _sepStyle(i);
        let bg = _groupBg(i);
        let tdBase = 'background:' + bg + ';padding:3px 5px;font-size:0.65rem;vertical-align:middle;border-top:1px dashed #30363d;';
        if (!s) { html += '<td colspan="7" style="' + tdBase + sep + '"></td>'; continue; }
        let sig = strikeSignalMap[s['STRIKE']] || {};
        let ceLabel = sig.ceLabel || '—';
        let peLabel = sig.peLabel || '—';
        let score   = sig.score   || 0;
        let scoreColor = score >= 2 ? '#3fb950' : score <= -2 ? '#f85149' : score > 0 ? '#85c785' : score < 0 ? '#e08080' : '#7d8590';

        html += '<td colspan="3" style="' + tdBase + sep + 'text-align:center;">' + _signalBadge(ceLabel) + '</td>'
        html += '<td style="' + tdBase + 'text-align:center;">'
            + '<span title="Strike score" style="font-size:0.65rem;font-weight:700;color:' + scoreColor + ';">' + (score > 0 ? '+' : '') + score + '</span>'
            + '</td>'
        html += '<td colspan="3" style="' + tdBase + 'text-align:center;">' + _signalBadge(peLabel) + '</td>'
    }
    html += '</tr>'

    html += '</tbody></table></div>'
    jQ("#" + tempName + "-component-oi-list-table" + suffix).html(html);
}

function showComponent(name, index) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));
    if (!breakOutNineFifteen) breakOutNineFifteen = {};

    let close915 = 'N/A';
    let nineClass = 'sv-badge sv-badge-muted';
    if (breakOutNineFifteen[name]) {
        close915 = breakOutNineFifteen[name]['CLOSE_9_15'] || 'N/A';
        if (close915 === 'ASO') nineClass = 'sv-badge sv-badge-green';
        else if (close915 === 'BSO') nineClass = 'sv-badge sv-badge-red';
        else if (close915 === 'B/W') nineClass = 'sv-badge sv-badge-blue';
    }

    let link = '<a class="sv-instr-link" target="_blank" href="https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/' + name + '/' + INSTRUMENT_TOKENS[name] + '">' + name + '</a>'

    let html = ''
    html += '<div class="gc-col">'
    html += '<div class="gc-header">'
    html += '  <div class="sv-header-left">'
    html += '    <button class="sv-icon-btn refresh-chart" data-index="' + index + '" data-name="' + name + '" title="Refresh"><i class="bi bi-arrow-clockwise"></i></button>'
    html += '    <button class="sv-icon-btn show-info" data-index="' + index + '" data-name="' + name + '" title="Info">i</button>'
    html += '    <button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="chart" title="Maximize"><i class="bi bi-fullscreen"></i></button>'
    html += '  </div>'
    html += '  <div class="sv-header-title">' + link + ' <span class="gc-ltp-inline" id="' + tempName + '-ltp"></span></div>'
    html += '  <div class="sv-header-right"><span class="' + nineClass + '">' + close915 + '</span></div>'
    html += '</div>'
    html += '<div class="sv-chart-area"><div id="' + tempName + '-chart"></div></div>'
    html += '</div>'
    return html;
}


jQ(document).on("click", ".refresh-chart", function () {
    let name = jQ(this).attr("data-name");
    let that = jQ(this)
    commonRefershChart(name, that)
})

async function commonRefershChart(name, that) {
    try {
        that.attr("disabled", true);
        if (name != 'USDINR' && name != 'CRUDEOILM') {
            await showTopChart(name);
        } else {
            await showTopChartMCX(name);
        }
        that.attr("disabled", false)
    } catch (e) {
        console.log(e)
    }
}

jQ(document).on("click", ".refresh-futures", function () {
    let name = jQ(this).attr("data-name");
    let that = jQ(this)
    commonRefershFutures(name, that)
})

async function commonRefershFutures(name, that) {
    try {
        that.attr("disabled", true);
        let res = {}
        if (name != 'USDINR' && name != 'CRUDEOILM') {
            res = await showFutureDetails(name);
            setFutureDetails(name, res);
        } else {
            res = await showFutureDetailsMCX(name);
            setFutureDetails(name, res);
        }
        that.attr("disabled", false)
    } catch (e) {
        console.log(e)
    }
}

jQ(document).on("click", ".refresh-oi-obv", function () {
    let name = jQ(this).attr("data-name");
    let that = jQ(this)
    commonRefershOIOBV(name, that)
})

async function commonRefershOIOBV(name, that) {
    try {
        that.attr("disabled", true);
        let res = {}
        if (name != 'USDINR' && name != 'CRUDEOILM') {
            await showPrictionProbabilty(name)
            showOIOBVBarChart(name);
        } else {
            res = await showFutureDetailsMCX(name);
            setFutureDetails(name, res);
            await showPrictionProbabiltyMCX(name, res)
            showOIOBVBarChart(name);
        }
        that.attr("disabled", false)
    } catch (e) {
        console.log(e)
    }
}

jQ(document).on("click", ".refresh-advance-decline", function () {
    let name = jQ(this).attr("data-name");
    let that = jQ(this)
    commonRefershAdvanceDecline(name, that)
})

async function commonRefershAdvanceDecline(name, that) {
    try {
        that.attr("disabled", true);
        await showAdvacenDeclineScanner();
        that.attr("disabled", false)
    } catch (e) {
        console.log(e)
    }
}

jQ(document).on("click", ".refresh-advance-decline-futures", function () {
    let name = jQ(this).attr("data-name");
    let that = jQ(this)
    commonRefershAdvanceDeclineFutures(name, that)
})

async function commonRefershAdvanceDeclineFutures(name, that) {
    try {
        that.attr("disabled", true);
        await showFuturesTrend();
        that.attr("disabled", false)
    } catch (e) {
        console.log(e)
    }
}


jQ(document).on("click", ".show-info", function () {
    let name = jQ(this).attr("data-name");
    let data = generateTrend(name);
    let html = ''
    html += '<div style="text-align:center;">'
    html += name
    html += '</div>'
    html += '<div>'
    html += '<div>'
    html += ' LTP : ' + parseFloat(data['ltp']);
    html += '</div>'
    html += ' OPEN : ' + parseFloat(data['open']);
    html += '</div>'
    html += '<div>'
    html += ' ASO : ' + parseFloat(data['strikeData']['ustrikeOne']);
    html += '</div>'
    html += '<div>'
    html += ' AST : ' + parseFloat(data['strikeData']['ustrikeTwo']);
    html += '</div>'
    html += ' BSO : ' + parseFloat(data['strikeData']['bstrikeOne']);
    html += '</div>'
    html += '<div>'
    html += '<div>'
    html += ' BST : ' + parseFloat(data['strikeData']['bstrikeTwo']);
    html += '</div>'
    html += '<div>'
    html += ' VIXU : ' + parseFloat(data['vix']['vixDDUpper']);
    html += '</div>'
    html += '<div>'
    html += ' VIXL : ' + parseFloat(data['vix']['vixDDLower']);
    html += '</div>'
    html += '<div>'
    html += ' TREND : ' + data['trends'].join(", ");
    html += '</div>'

    // Per-instrument score breakdown
    let instrScore = computeInstrumentScore(name);
    let scoreBadge = instrScore.total > 0
        ? '<span class="sv-badge sv-badge-green">' + instrScore.total + '</span>'
        : instrScore.total < 0
            ? '<span class="sv-badge sv-badge-red">' + instrScore.total + '</span>'
            : '<span class="sv-badge sv-badge-muted">' + instrScore.total + '</span>';
    html += '<div style="margin-top:.4rem;border-top:1px solid var(--gtb-border2);padding-top:.3rem;">'
    html += '<strong style="font-size:0.62rem;">SCORE: ' + scoreBadge + '</strong>'
    html += '<table style="width:100%;font-size:0.58rem;margin-top:.2rem;">'
    html += '<tr><td>9:15 Close</td><td>' + instrScore.nine_fifteen + '</td></tr>'
    html += '<tr><td>Current Trend (ASO/BSO/AST/BST)</td><td>' + instrScore.current_trend + '</td></tr>'
    html += '<tr><td>Futures Trend</td><td>' + instrScore.futures_trend + '</td></tr>'
    html += '<tr><td>OI / OBV</td><td>' + instrScore.oi_obv + '</td></tr>'
    html += '</table>'
    html += '</div>'

    callSackBarInfo(html)
});

// ── Candlestick chart helper (LightweightCharts v5) ─────────────────────────
function _renderLWChart(containerId, candles, refLines, chartHeight, opts) {
    let container = document.getElementById(containerId.replace('#', ''));
    if (!container) return;
    container.innerHTML = '';
    container.style.position = 'relative';

    var _lwc    = (typeof _gtbChartColors === 'function') ? _gtbChartColors() : { bg:'#060a12', grid:'#122038', bdr:'#1b2d47', text:'#5c7499' };
    var _lwBg   = _lwc.bg;
    var _lwGrid = _lwc.grid;
    var _lwBdr  = _lwc.bdr;
    var _lwText = _lwc.text;

    // When no explicit height is given, fill the container (row cells are short)
    var _chH = chartHeight || container.clientHeight || 150;
    let chart = LightweightCharts.createChart(container, {
        width: container.clientWidth || 300,
        height: _chH,
        layout: { background: { color: _lwBg }, textColor: _lwText },
        grid: { vertLines: { color: _lwGrid }, horzLines: { color: _lwGrid } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        rightPriceScale: { borderColor: _lwBdr, visible: true, scaleMargins: { top: 0.05, bottom: 0.05 }, minimumWidth: 52 },
        timeScale: { borderColor: _lwBdr, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: false, rightOffset: 5 },
        localization: {
            timeFormatter: function(t) {
                // Timestamps are pre-shifted by +19800s (IST offset) so UTC display = IST time
                var d = new Date(t * 1000);
                return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
            }
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: false } },
    });

    let candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
        upColor: '#3fb950', downColor: '#f85149',
        borderUpColor: '#3fb950', borderDownColor: '#f85149',
        wickUpColor: '#3fb950', wickDownColor: '#f85149',
    });

    let IST_OFFSET = 19800; // UTC+5:30 in seconds
    let lwData = candles.map(function(c) {
        return {
            // Add IST offset so LW's UTC display shows correct IST time on x-axis
            time: Math.floor(new Date(c[0]).getTime() / 1000) + IST_OFFSET,
            open: parseFloat(c[1]), high: parseFloat(c[2]),
            low: parseFloat(c[3]),  close: parseFloat(c[4]),
        };
    });
    candleSeries.setData(lwData);

    // Reference price lines — axis labels hidden to avoid cluttering the Y-axis.
    // Values are shown in an overlay legend instead (built below).
    let lineColors = {
        'OPEN': '#ffbe0b', 'VIXL': '#38bdf8', 'VIXU': '#38bdf8',
        'ASO': '#00e5a0', 'AST': '#00e5a0', 'BSO': '#ff4d6a', 'BST': '#ff4d6a',
    };
    var _shortLabel = { 'OPEN':'O', 'VIXL':'V↓', 'VIXU':'V↑', 'AST':'A+', 'ASO':'A', 'BSO':'B', 'BST':'B-' };
    (refLines || []).forEach(function(rl) {
        let key = rl.key || rl.text.split(':')[0].trim();
        candleSeries.createPriceLine({
            price: parseFloat(rl.value),
            color: lineColors[key] || '#7d8590',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Solid,
            axisLabelVisible: false,
            title: '',
        });
    });
    // opts.topBar  — horizontal strip overlaid at the top of the chart
    // opts.hideLegend — suppress the corner legend (used when caller has its own strip)
    if (refLines && refLines.length && opts && opts.topBar) {
        var _tbEl = document.createElement('div');
        _tbEl.className = 'lw-ref-topbar';
        _tbEl.innerHTML = (refLines || []).map(function(rl) {
            var key   = rl.key || rl.text.split(':')[0].trim();
            var label = _shortLabel[key] || key;
            var color = lineColors[key] || '#7d8590';
            var val   = parseFloat(rl.value);
            var valStr = val >= 1000 ? val.toLocaleString('en-IN', {maximumFractionDigits: 0}) : val.toFixed(1);
            return '<span class="lw-ref-tb-item">'
                + '<span class="lw-ref-tb-lbl" style="color:' + color + ';">' + label + '</span>'
                + '<span class="lw-ref-tb-val">' + valStr + '</span>'
                + '</span>';
        }).join('');
        container.appendChild(_tbEl);
    } else if (refLines && refLines.length && !(opts && opts.hideLegend)) {
        var _legendEl = document.createElement('div');
        _legendEl.className = 'lw-ref-legend';
        var _legendHtml = '';
        (refLines || []).forEach(function(rl) {
            var key = rl.key || rl.text.split(':')[0].trim();
            var label = _shortLabel[key] || key;
            var color = lineColors[key] || '#7d8590';
            var val = parseFloat(rl.value);
            var valStr = val >= 1000 ? val.toLocaleString('en-IN', {maximumFractionDigits: 1}) : val.toFixed(2);
            _legendHtml += '<div class="lw-ref-row"><span class="lw-ref-lbl" style="color:' + color + '">' + label + '</span>'
                + '<span class="lw-ref-val">' + valStr + '</span></div>';
        });
        _legendEl.innerHTML = _legendHtml;
        container.appendChild(_legendEl);
    }

    // ── Y-axis: include all ref lines so VIXU/BST are visible, but pad based on
    //    the candle range (not total range) so candles stay prominent and aren't
    //    squeezed into a thin band when ref lines are far above/below.
    if (lwData.length) {
        var candlePrices = [];
        lwData.forEach(function(c) { candlePrices.push(c.low, c.high); });
        var candleMin = Math.min.apply(null, candlePrices);
        var candleMax = Math.max.apply(null, candlePrices);
        var candleRange = candleMax - candleMin || 1;

        // Extend the visible range to include all ref lines
        var allPrices = candlePrices.slice();
        (refLines || []).forEach(function(rl) { allPrices.push(parseFloat(rl.value)); });
        var minP = Math.min.apply(null, allPrices);
        var maxP = Math.max.apply(null, allPrices);

        // Pad by 30% of the candle range so candles always fill a reasonable portion
        var pad = candleRange * 0.30;
        candleSeries.applyOptions({
            autoscaleInfoProvider: function() {
                return { priceRange: { minValue: minP - pad, maxValue: maxP + pad } };
            }
        });
    }

    chart.timeScale().fitContent();

    // ── Zoom / fit controls ──────────────────────────────────────────────────
    var ctrl = document.createElement('div');
    ctrl.className = 'lw-chart-controls';
    ctrl.innerHTML =
        '<button class="lw-chart-btn" data-action="zoom-in"  title="Zoom In">+</button>'  +
        '<button class="lw-chart-btn" data-action="zoom-out" title="Zoom Out">−</button>' +
        '<button class="lw-chart-btn" data-action="fit"      title="Fit All">⤢</button>';
    container.appendChild(ctrl);

    ctrl.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        e.stopPropagation();
        var ts = chart.timeScale();
        var action = btn.getAttribute('data-action');
        if (action === 'fit') {
            ts.fitContent();
        } else {
            var range = ts.getVisibleLogicalRange();
            if (!range) return;
            var span  = range.to - range.from;
            var mid   = (range.from + range.to) / 2;
            var factor = action === 'zoom-in' ? 0.6 : 1.6;
            var half   = (span * factor) / 2;
            ts.setVisibleLogicalRange({ from: mid - half, to: mid + half });
        }
    });

    // Responsive resize — guard against zero-width during collapse transitions
    let ro = new ResizeObserver(function() {
        let w = container.clientWidth;
        let hh = chartHeight || container.clientHeight || 150;
        if (w > 0) chart.resize(w, hh);
    });
    ro.observe(container);
    container._lwChart = chart;
    return chart;
}

function _buildATRBadges(ltp, name, candles) {
    let tempName = name.replaceAll(' ', '-').replaceAll('&', '-');
    try {
        let instrScore = computeInstrumentScore(name);
        let oiObv      = (INSTRUMENT_SCORE_MAP[name] && INSTRUMENT_SCORE_MAP[name].oi_obv) || 0;

        // ── Majority-vote direction ────────────────────────────────────────────
        // Each of the 4 pillars gets one vote. Raw-sum was wrong: a +2 trend score
        // (price at AST) could mask futures=SHORT + OI=SELL both pointing the other way.
        // Now each pillar casts exactly one vote regardless of magnitude.
        let votes = { bull: 0, bear: 0, labels: [] };
        function _vote(val, label) {
            if (val > 0) { votes.bull++; votes.labels.push({ l: label, v: 1  }); }
            else if (val < 0) { votes.bear++; votes.labels.push({ l: label, v: -1 }); }
            else { votes.labels.push({ l: label, v: 0 }); }
        }
        _vote(instrScore.nine_fifteen,  '9:15');
        _vote(instrScore.current_trend, 'Trend');
        _vote(instrScore.futures_trend, 'Fut');
        _vote(oiObv,                    'OI');

        // Direction: needs strict majority (3+ of 4). Tied = no direction.
        let dir = null;
        if (votes.bull >= 3) dir = 'LONG';
        else if (votes.bear >= 3) dir = 'SHORT';

        // Conflict: futures AND OI agree against the trend direction — flag it
        let futDir = instrScore.futures_trend > 0 ? 1 : instrScore.futures_trend < 0 ? -1 : 0;
        let oiDir  = oiObv > 0 ? 1 : oiObv < 0 ? -1 : 0;
        let trendDir = instrScore.current_trend > 0 ? 1 : instrScore.current_trend < 0 ? -1 : 0;
        let conflicted = (futDir !== 0 && oiDir !== 0 && futDir === oiDir && futDir !== trendDir && trendDir !== 0);

        // If no strict majority but futures+OI both agree, use their direction
        if (!dir && futDir !== 0 && futDir === oiDir) dir = futDir > 0 ? 'LONG' : 'SHORT';
        // Last fallback: 9:15 breakout
        if (!dir) dir = instrScore.nine_fifteen > 0 ? 'LONG' : instrScore.nine_fifteen < 0 ? 'SHORT' : null;

        // ── Signal dots: compact inline badges, one per pillar ────────────────
        function _dot(label, val) {
            let c = val > 0 ? '#3fb950' : val < 0 ? '#f85149' : '#7d8590';
            let sym = val > 0 ? '▲' : val < 0 ? '▼' : '—';
            return '<span style="font-size:0.55rem;color:' + c + ';background:' + c + '18;border:1px solid ' + c + '44;'
                 + 'border-radius:3px;padding:0px 3px;line-height:1.5;white-space:nowrap;" title="' + label + '">'
                 + label + '&nbsp;' + sym + '</span>';
        }
        // Build inline dots string (no wrapper div — stays in the flex strip)
        let dotsBadges = '';
        votes.labels.forEach(function(e) { dotsBadges += _dot(e.l, e.v); });

        let slHtml = '<div class="gtb-atr-strip">';

        // Inline conflict icon (no block div — keeps everything on one line)
        if (conflicted) {
            slHtml += '<span style="font-size:0.6rem;color:#fbbf24;flex-shrink:0;" '
                   + 'title="Conflict — Trend says ' + (trendDir > 0 ? 'LONG' : 'SHORT') + ' but Futures+OI say ' + (futDir > 0 ? 'LONG' : 'SHORT') + '">'
                   + '<i class="bi bi-exclamation-triangle-fill"></i></span>';
        }

        // Signal dots inline in strip
        slHtml += dotsBadges;

        if (dir) {
            let slData = computeSLAndTarget(ltp, dir, candles);
            if (slData) {
                let dc = dir === 'LONG' ? '#0d3320' : '#3d0d0d';
                let fc = dir === 'LONG' ? '#3fb950' : '#f85149';
                // Show vote tally on the direction badge: e.g. "LONG 3/4"
                let tally = dir === 'LONG' ? votes.bull : votes.bear;
                slHtml += '<span style="width:1px;height:14px;background:#ffffff20;flex-shrink:0;margin:0 2px;"></span>';
                slHtml += '<span class="gtb-sl-badge dir-badge" style="background:' + dc + ';color:' + fc + ';border-color:' + fc + ';" title="' + tally + ' of 4 signals agree">'
                       + dir + ' <span style="font-size:0.55rem;opacity:0.8;">' + tally + '/4</span></span>';
                slHtml += '<span class="gtb-sl-badge atr"><span class="sb-label">ATR</span><span class="sb-val">' + slData.atr + '</span></span>';
                slHtml += '<span class="gtb-sl-badge sl"><span class="sb-label">SL</span><span class="sb-val">' + slData.sl + '</span></span>';
                slHtml += '<span class="gtb-sl-badge t1"><span class="sb-label">T1</span><span class="sb-val">' + slData.target1 + '</span></span>';
                slHtml += '<span class="gtb-sl-badge t2"><span class="sb-label">T2</span><span class="sb-val">' + slData.target2 + '</span></span>';
                slHtml += '<span class="gtb-sl-badge atr"><span class="sb-label">R:R</span><span class="sb-val">' + slData.rr + '</span></span>';
            }
        } else {
            // No majority — show both scenarios side by side
            let slLong  = computeSLAndTarget(ltp, 'LONG',  candles);
            let slShort = computeSLAndTarget(ltp, 'SHORT', candles);
            slHtml += '<span style="width:1px;height:14px;background:#ffffff20;flex-shrink:0;margin:0 2px;"></span>';
            slHtml += '<span class="gtb-sl-badge atr"><span class="sb-label">ATR</span><span class="sb-val">' + slLong.atr + '</span></span>';
            slHtml += '<span class="atr-divider" style="color:#3fb950;">↑</span>';
            slHtml += '<span class="gtb-sl-badge sl"><span class="sb-label">SL</span><span class="sb-val">' + slLong.sl + '</span></span>';
            slHtml += '<span class="gtb-sl-badge t1"><span class="sb-label">T1</span><span class="sb-val">' + slLong.target1 + '</span></span>';
            slHtml += '<span class="atr-divider" style="color:#f85149;">↓</span>';
            slHtml += '<span class="gtb-sl-badge sl"><span class="sb-label">SL</span><span class="sb-val">' + slShort.sl + '</span></span>';
            slHtml += '<span class="gtb-sl-badge t1"><span class="sb-label">T1</span><span class="sb-val">' + slShort.target1 + '</span></span>';
        }
        slHtml += '</div>';
        let slDivId = '#' + tempName + '-atr-sl';
        if (jQ(slDivId).length) jQ(slDivId).html(slHtml);
    } catch(e) {}
}

// ── Candlestick Chart Renderer (NSE instruments) ───────────────────────────────
// Fetches intraday candles for an NSE instrument and renders a LightweightCharts
// candlestick chart with ASO/AST/BSO/BST/VIXL/VIXU/OPEN reference lines.
//
// Parameters:
//   name        — instrument display name (key in INSTRUMENT_TOKENS)
//   bindtoDivId — optional DOM id to render into (defaults to #{tempName}-chart)
//   chartHeight — pixel height (defaults to 150)
//
// Side effects:
//   Updates #{tempName}-ltp with formatted live price
//   Updates #{tempName}-atr-sl with ATR-based stop-loss badges (_buildATRBadges)
//   Caches previous day candle via savePreviousStockQuote (for OI change baseline)
async function showTopChart(name, bindtoDivId, chartHeight) {
    try {
        let tempName = name.replaceAll(' ', '-').replaceAll('&', '-');
        let data = await getHistoricalDataUsingPromise(INSTRUMENT_TOKENS[name], _gtbCurrDay(), _gtbCurrDayTo(), HISTORICAL_DATA_INTERVAL);
        await savePreviousStockQuote(tempName, INSTRUMENT_TOKENS[name]);
        let scriptData = generateTrend(name);

        let refLines = [
            { key: 'OPEN', value: scriptData['open'],                         text: 'OPEN ' + scriptData['open'] },
            { key: 'VIXL', value: scriptData['vix'].vixDDLower,               text: 'VIXL ' + scriptData['vix'].vixDDLower },
            { key: 'VIXU', value: scriptData['vix'].vixDDUpper,               text: 'VIXU ' + scriptData['vix'].vixDDUpper },
            { key: 'AST',  value: scriptData['strikeData'].ustrikeTwo,        text: 'AST '  + scriptData['strikeData'].ustrikeTwo },
            { key: 'ASO',  value: scriptData['strikeData'].ustrikeOne,        text: 'ASO '  + scriptData['strikeData'].ustrikeOne },
            { key: 'BSO',  value: scriptData['strikeData'].bstrikeOne,        text: 'BSO '  + scriptData['strikeData'].bstrikeOne },
            { key: 'BST',  value: scriptData['strikeData'].bstrikeTwo,        text: 'BST '  + scriptData['strikeData'].bstrikeTwo },
        ];

        let containerId = (bindtoDivId || ('#' + tempName + '-chart')).replace('#', '');
        let _chartCandles = _gtbTrimCandles(data.data.candles);
        // No explicit height → let _renderLWChart fill the row cell via clientHeight
        _renderLWChart(containerId, _chartCandles, refLines, chartHeight, { hideLegend: true });

        // Populate levels strip in the row title bar (if it exists)
        var _levelsRow = document.getElementById(tempName + '-chart-levels');
        if (_levelsRow) {
            var _lMeta = { OPEN:{s:'O',c:'#ffbe0b'}, VIXU:{s:'V↑',c:'#38bdf8'}, VIXL:{s:'V↓',c:'#38bdf8'},
                           AST:{s:'A+',c:'#3fb950'}, ASO:{s:'A',c:'#3fb950'}, BSO:{s:'B',c:'#f85149'}, BST:{s:'B-',c:'#f85149'} };
            var _fmt = function(v) { v=parseFloat(v); return v>=1000?v.toLocaleString('en-IN',{maximumFractionDigits:1}):v.toFixed(1); };
            _levelsRow.innerHTML = refLines.map(function(rl) {
                var m = _lMeta[rl.key] || {s:rl.key,c:'#7d8590'};
                return '<span style="display:inline-flex;align-items:center;gap:1px;white-space:nowrap;">'
                    + '<span style="font-size:0.44rem;font-weight:700;color:'+m.c+';letter-spacing:0.02em;">'+m.s+'</span>'
                    + '<span style="font-size:0.44rem;color:var(--gtb-muted,#7d8590);">'+_fmt(rl.value)+'</span></span>';
            }).join('<span style="color:#30363d;font-size:0.4rem;"> · </span>');
        }

        let ltp = _chartCandles[_chartCandles.length - 1][4];
        jQ('#' + tempName + '-ltp').html(parseFloat(ltp).toLocaleString('en-IN'));
        _buildATRBadges(ltp, name, _chartCandles);

        // 9:15 breakout badge
        try {
            let b915 = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN")) || {};
            let close915 = (b915[name] || {}).CLOSE_9_15;
            if (close915) {
                let isBull = (close915 === 'ASO' || close915 === 'AST');
                let isBear = (close915 === 'BSO' || close915 === 'BST');
                let cls = isBull ? 'gtb-915-bull' : isBear ? 'gtb-915-bear' : 'gtb-915-neutral';
                jQ('#' + tempName + '-915-badge').html('<span class="' + cls + '">' + close915 + '</span>');
            }
        } catch(e) {}
    } catch (error) {
        console.error('Error in showTopChart for ' + name, error);
    }
}

// showTopChartMCX is defined in commodities.js — uses COMMODITIES_FUTURE_INSTRUMENT_LIST for tokens

// ── Canvas chart helpers (replaces c3) ───────────────────────────────────────

function _renderBarChart(containerId, config) {
    let el = document.getElementById(containerId.replace(/^#/, ''));
    if (!el) return;
    el.innerHTML = '';
    let h = config.height || 110;
    let labels = config.labels || [];
    let series = config.series || [];
    let stacked = config.stacked || false;
    let timeFormat = config.timeFormat || false;
    let atm = config.atm != null ? config.atm : -1;

    let xLabels = labels.map(function(l) {
        return timeFormat ? moment(l).format('HH:mm') : String(l);
    });

    let apexSeries = series.map(function(s) {
        return { name: s.label, data: s.values, color: s.color };
    });

    let annotations = {};
    if (atm >= 0 && xLabels[atm]) {
        annotations.xaxis = [{
            x: xLabels[atm],
            borderColor: '#fbbf24',
            label: { text: 'ATM', style: { color: '#fbbf24', background: 'transparent', fontSize: '8px' } }
        }];
    }

    let chart = new ApexCharts(el, {
        series: apexSeries,
        chart: { type: 'bar', height: h, background: 'transparent', toolbar: { show: false }, animations: { enabled: false }, sparkline: { enabled: false } },
        plotOptions: { bar: { horizontal: false, columnWidth: stacked ? '80%' : '65%', dataLabels: { position: 'top' } } },
        dataLabels: { enabled: false },
        stroke: { show: false },
        stacked: stacked,
        xaxis: { categories: xLabels, labels: { show: config.showXLabels !== false, style: { colors: '#7d8590', fontSize: '7px' }, rotate: 0 }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis: { labels: { show: false } },
        grid: { borderColor: '#21262d', strokeDashArray: 3, yaxis: { lines: { show: true } }, xaxis: { lines: { show: false } } },
        legend: { show: false },
        theme: { mode: 'dark' },
        annotations: annotations,
        tooltip: { theme: 'dark', x: { show: true } },
    });
    chart.render();
    el._apexChart = chart;
}

// ── Range Scoreboard ──────────────────────────────────────────────────────────
// Renders one row: label | tri-color range bar with needle | signed value
function _rsbRow(label, val, min, max, unit) {
    var pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
    var zeroPct = Math.max(0, Math.min(100, ((0 - min) / (max - min)) * 100));
    var valColor = val > 0 ? '#3fb950' : val < 0 ? '#f85149' : '#7d8590';
    var signed = (val > 0 ? '+' : '') + (Number.isInteger(val) ? val : parseFloat(val).toFixed(1));

    // Three-segment gradient bar: left=red, center=yellow at zero, right=green
    var barHtml = '<div style="position:relative;height:6px;background:linear-gradient(to right,#f8514960 0%,#fbbf2460 '
        + zeroPct + '%,#3fb95060 100%);border-radius:3px;flex:1;">'
        // Zero line
        + '<div style="position:absolute;left:' + zeroPct + '%;top:-2px;width:1px;height:10px;background:#ffffff30;"></div>'
        // Needle
        + '<div style="position:absolute;left:' + pct + '%;top:-3px;width:3px;height:12px;background:' + valColor + ';border-radius:2px;transform:translateX(-50%);box-shadow:0 0 4px ' + valColor + '88;"></div>'
        + '</div>';

    return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;">'
        + '<span style="font-size:0.48rem;color:var(--gtb-muted);font-weight:700;width:46px;flex-shrink:0;text-transform:uppercase;letter-spacing:0.3px;">' + label + '</span>'
        + barHtml
        + '<span style="font-size:0.52rem;font-weight:700;color:' + valColor + ';width:30px;text-align:right;flex-shrink:0;">' + signed + (unit || '') + '</span>'
        + '</div>';
}

function renderRangeScoreboard() {
    var el = document.getElementById('gtb-range-sb');
    if (!el) return;

    // Gather sub-scores
    var s915 = (ALL_9_15_CLOSE_SCORE      || 0)
             + (NIFTY_50_9_15_CLOSE_SCORE || 0)
             + (NIFTY_BANK_9_15_CLOSE_SCORE || 0)
             + (GIFT_NIFTY_9_15_CLOSE_SCORE || 0)
             + (SENSEX_9_15_CLOSE_SCORE   || 0)
             + (RELIANCE_9_15_CLOSE_SCORE || 0)
             + (HDFCBANK_9_15_CLOSE_SCORE || 0);

    var sAD = (ALL_ADVANCE_DECLINE_SCORE       || 0)
            + (NIFTY_50_ADVANCE_DECLINE_SCORE  || 0)
            + (NIFTY_BANK_ADVANCE_DECLINE_SCORE|| 0);

    var sFT = (ALL_FUTURES_TREND_SCORE        || 0)
            + (NIFTY_50_FUTURES_TREND_SCORE   || 0)
            + (NIFTY_BANK_FUTURES_TREND_SCORE || 0);

    var sOI = (NIFTY_50_OI_OBV_SCORE  || 0)
            + (NIFTY_BANK_OI_OBV_SCORE|| 0)
            + (RELIANCE_OI_OBV_SCORE  || 0)
            + (HDFCBANK_OI_OBV_SCORE  || 0)
            + (ICICIBANK_OI_OBV_SCORE || 0);

    var sCOMP = (NIFTY_50_COMPONENT_SCORE  || 0)
              + (NIFTY_BANK_COMPONENT_SCORE || 0);

    var total = parseFloat((s915 + sAD + sFT + sOI + sCOMP).toFixed(2));

    // Verdict
    var verdict, vColor, vIcon, vBg;
    if (total >= 5) {
        verdict = 'LONG'; vColor = '#3fb950'; vIcon = 'bi-arrow-up-circle-fill'; vBg = 'rgba(63,185,80,0.12)';
    } else if (total < 0) {
        verdict = 'SHORT'; vColor = '#f85149'; vIcon = 'bi-arrow-down-circle-fill'; vBg = 'rgba(248,81,73,0.12)';
    } else {
        verdict = 'WAIT'; vColor = '#fbbf24'; vIcon = 'bi-hourglass-split'; vBg = 'rgba(251,191,36,0.08)';
    }

    // Confidence bar (0–100%) based on how far from 0
    var maxScore = 40;
    var confPct = Math.min(100, Math.round(Math.abs(total) / maxScore * 100));
    var html = '';
    html += _rsbRow('9:15',     s915,  -7,   7);
    html += _rsbRow('ADV/DEC',  sAD,   -3,   3);
    html += _rsbRow('FUTURES',  sFT,   -3,   3);
    html += _rsbRow('OI/OBV',   sOI,  -10,  10);
    html += _rsbRow('COMP WT',  sCOMP, -5,   5);

    // Divider
    html += '<div style="border-top:1px solid var(--gtb-border2);margin:4px 0 6px;"></div>';

    // Verdict panel
    html += '<div style="background:' + vBg + ';border:1px solid ' + vColor + '44;border-radius:6px;padding:5px 8px;'
          + 'display:flex;align-items:center;justify-content:space-between;gap:8px;">'
          // Left: icon + label
          + '<div style="display:flex;align-items:center;gap:5px;">'
          + '  <i class="bi ' + vIcon + '" style="font-size:1rem;color:' + vColor + ';"></i>'
          + '  <span style="font-size:0.9rem;font-weight:900;color:' + vColor + ';letter-spacing:0.5px;">' + verdict + '</span>'
          + '</div>'
          // Right: confidence bar + score
          + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">'
          + '  <span style="font-size:0.58rem;color:' + vColor + ';font-weight:700;">' + (total > 0 ? '+' : '') + total + '</span>'
          + '  <div style="width:60px;height:4px;background:#ffffff10;border-radius:2px;">'
          + '    <div style="width:' + confPct + '%;height:100%;background:' + vColor + ';border-radius:2px;"></div>'
          + '  </div>'
          + '  <span style="font-size:0.44rem;color:var(--gtb-muted);">confidence ' + confPct + '%</span>'
          + '</div>'
          + '</div>';

    el.innerHTML = html;
}

function _renderGauge(containerId, value, min, max) {
    let el = document.getElementById(containerId.replace(/^#/, ''));
    if (!el) return;
    el.innerHTML = '';
    let color = value < 0 ? '#f85149' : value < 5 ? '#d29922' : value < 8 ? '#e3b341' : '#3fb950';
    let pct = Math.round(((value - min) / (max - min)) * 100);

    let chart = new ApexCharts(el, {
        series: [pct],
        chart: { type: 'radialBar', height: 130, background: 'transparent', toolbar: { show: false }, animations: { enabled: false } },
        plotOptions: {
            radialBar: {
                startAngle: -135, endAngle: 135,
                hollow: { size: '55%' },
                track: { background: '#21262d', strokeWidth: '100%' },
                dataLabels: {
                    name: { show: false },
                    value: { show: true, fontSize: '22px', fontWeight: 900, color: color, offsetY: 8,
                        formatter: function() { return (value > 0 ? '+' : '') + value; } }
                }
            }
        },
        fill: { colors: [color] },
        stroke: { lineCap: 'round' },
        labels: ['Score'],
        theme: { mode: 'dark' },
    });
    chart.render();
    el._apexChart = chart;
}

function _renderDonut(containerId, slices, height) {
    let el = document.getElementById(containerId.replace(/^#/, ''));
    if (!el) return;
    el.innerHTML = '';
    height = height || 80;

    let chart = new ApexCharts(el, {
        series: slices.map(function(s) { return s.value; }),
        labels: slices.map(function(s) { return s.label; }),
        colors: slices.map(function(s) { return s.color; }),
        chart: { type: 'donut', height: height, background: 'transparent', toolbar: { show: false }, animations: { enabled: false } },
        plotOptions: { pie: { donut: { size: '55%', labels: { show: true, total: { show: true, showAlways: true, label: '', fontSize: '11px', fontWeight: 900,
            color: slices.reduce(function(a, b) { return a.value > b.value ? a : b; }).color,
            formatter: function(w) { return w.globals.seriesTotals.reduce(function(a, b, i) { return w.globals.series[i] > w.globals.series[a] ? i : a; }, 0) >= 0 ? w.globals.series[w.globals.seriesTotals.reduce(function(a, b, i) { return w.globals.series[i] > w.globals.series[a] ? i : a; }, 0)] : ''; }
        } } } } },
        dataLabels: { enabled: false },
        legend: { show: true, position: 'bottom', fontSize: '8px', markers: { size: 5 }, itemMargin: { horizontal: 4 } },
        stroke: { show: false },
        theme: { mode: 'dark' },
        tooltip: { theme: 'dark' },
    });
    chart.render();
    el._apexChart = chart;
}

function updateScoresOfOI(name, item, priceChange) {
    let result = scoreOIStrikeForSignal(item, !!item['ATM_STRIKE'], priceChange);
    let SCORE = result.score;

    // Accumulate per-strike scores into INSTRUMENT_SCORE_MAP only.
    // setScore() derives the display globals (NIFTY_50_OI_OBV_SCORE etc.) from the map,
    // so there is no risk of += double-counting when setScore is called multiple times.
    if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
    INSTRUMENT_SCORE_MAP[name].oi_obv = (INSTRUMENT_SCORE_MAP[name].oi_obv || 0) + SCORE;

    console.log("Score for " + name + " is " + SCORE + " STRIKE: " + item['STRIKE'])
    return SCORE;

}

// ─── Final OI Signal from ATM Labels + Net Score ──────────────────────────────
//
// LABEL MEANING REFERENCE:
//   CE BUY    — call buyers active, expecting rally                  → bullish
//   CE WRITE  — call writers capping upside (resistance building)    → bearish
//   CE COV    — call writers covering (short squeeze underway)       → bullish
//   CE UNWIND — call buyers exiting (bullish conviction fading)      → bearish
//   PE WRITE  — put writers building support floor                   → bullish
//   PE BUY    — put buyers hedging/speculating on a fall             → bearish
//   PE UNWIND — put longs exiting (bearish hedge removed)            → mildly bullish
//   PE COV    — put writers buying back (expecting more downside)    → bearish
//
// ATM COMBO PRIORITY (highest conviction signals — both CE + PE agree):
//   CE COV  + PE WRITE → STRONG BUY  — trapped writers covering + put writers building floor
//                         = double-forced squeeze. Both sides confirm support.
//   CE BUY  + PE WRITE → BUY         — call buyers + put writers = both sides bullish
//                         CE IV↑ + PE IV↓ = buyers paying up for calls, writers confident of support.
//   CE WRITE + PE COV  → STRONG SELL — call writers capping + put writers buying back
//                         = double-confirmed breakdown. Resistance + no support below.
//   CE WRITE + PE BUY  → SELL        — call writers (resistance) + put buyers (bearish hedge)
//                         CE IV↓ + PE IV↑ = strong resistance signal. See scoreOIStrikeForSignal comments.
//   CE COV  + PE BUY   → WAIT        — mixed: writers covering (bullish) but put buyers active (bearish)
//   CE BUY  + PE COV   → WAIT        — mixed: calls bought but put writers exiting (uncertain)
//
// FALLBACK: if ATM combo not decisive, use net score across all strikes:
//   score ≥ +6 = STRONG BUY, ≥ +2 = BUY, ≤ −6 = STRONG SELL, ≤ −2 = SELL, else NEUTRAL
// ─────────────────────────────────────────────────────────────────────────────
function getOISignal(score, atmCeLabel, atmPeLabel) {
    // Count bullish vs bearish signals from ATM CE and PE labels
    let atmBullish = 0, atmBearish = 0;
    // Bullish labels: call buyers/covering (upside expected) + put writers/unwinding (support confirmed)
    let bullishLabels = { 'CE BUY': 1, 'CE COV': 1, 'PE WRITE': 1, 'PE UNWIND': 1 };
    // Bearish labels: call writers (resistance) + put buyers/covering (downside expected)
    let bearishLabels = { 'CE WRITE': 1, 'CE UNWIND': 1, 'PE BUY': 1, 'PE COV': 1 };
    if (atmCeLabel && bullishLabels[atmCeLabel]) atmBullish++;
    if (atmCeLabel && bearishLabels[atmCeLabel]) atmBearish++;
    if (atmPeLabel && bullishLabels[atmPeLabel]) atmBullish++;
    if (atmPeLabel && bearishLabels[atmPeLabel]) atmBearish++;

    let atmNet = atmBullish - atmBearish; // +2=both bullish, −2=both bearish, 0=mixed/neutral

    // High-conviction ATM combos checked first (both CE and PE agree = strongest signal)
    // Short squeeze: call writers forced to cover + put writers actively building floor
    if (atmCeLabel === 'CE COV'   && atmPeLabel === 'PE WRITE') return { signal: 'STRONG BUY',  color: '#155724', bg: '#d4edda' };
    // CE IV↑ (call buying) + PE IV↓ (put writing) = both sides confirm support at ATM
    if (atmCeLabel === 'CE BUY'   && atmPeLabel === 'PE WRITE') return { signal: 'BUY',          color: '#155724', bg: '#d4edda' };
    // Breakdown: call writers force market down + put writers buying back (no support)
    if (atmCeLabel === 'CE WRITE' && atmPeLabel === 'PE COV')   return { signal: 'STRONG SELL',  color: '#721c24', bg: '#f8d7da' };
    // CE IV↓ (call writing = resistance) + PE IV↑ (put buying = bearish hedge) = double resistance confirmation
    if (atmCeLabel === 'CE WRITE' && atmPeLabel === 'PE BUY')   return { signal: 'SELL',          color: '#721c24', bg: '#f8d7da' };
    // Mixed: short covering (bullish) but put buyers active (bearish hedge) = wait for clarity
    if (atmCeLabel === 'CE COV'   && atmPeLabel === 'PE BUY')   return { signal: 'WAIT',          color: '#856404', bg: '#fff3cd' };
    // Mixed: call buyers active (bullish) but put writers exiting (support base weakening)
    if (atmCeLabel === 'CE BUY'   && atmPeLabel === 'PE COV')   return { signal: 'WAIT',          color: '#856404', bg: '#fff3cd' };

    // Fallback: ATM combo inconclusive — use net score across all scanned strikes
    if      (score >=  6) return { signal: 'STRONG BUY',  color: '#155724', bg: '#d4edda' };
    else if (score >=  2) return { signal: 'BUY',          color: '#155724', bg: '#d4edda' };
    else if (score <= -6) return { signal: 'STRONG SELL',  color: '#721c24', bg: '#f8d7da' };
    else if (score <= -2) return { signal: 'SELL',          color: '#721c24', bg: '#f8d7da' };
    else                  return { signal: 'NEUTRAL',       color: '#383d41', bg: '#e2e3e5' };
}

function updateScoresOfTrend(name, score, atmCeLabel, atmPeLabel, suffix) {
    suffix = suffix || '';
    let sig = getOISignal(score, atmCeLabel, atmPeLabel);
    let scoreCls = score > 0 ? 'sv-badge sv-badge-green' : 'sv-badge sv-badge-red';
    let signalCls = sig.signal === 'BUY' || sig.signal === 'STRONG BUY' ? 'sv-badge sv-badge-green'
                  : sig.signal === 'SELL' || sig.signal === 'STRONG SELL' ? 'sv-badge sv-badge-red'
                  : 'sv-badge sv-badge-amber';
    let scoreHtml = '<span class="' + scoreCls + '"><i class="bi bi-speedometer"></i> ' + (score > 0 ? '+' : '') + parseFloat(score).toFixed(2) + '</span>'
    scoreHtml += '<span class="' + signalCls + '">' + sig.signal + '</span>'
    jQ("#" + name.replaceAll(" ", "-").replaceAll("&", "-") + "-oi-score" + suffix).html(scoreHtml)
}

// ── OI Compare Matrix inline render ────────────────────────────────────────
// Uses _gtbOICellCompact — same compact heatmap cells as the popup OI matrix.
// ATM-2 to ATM+2 as horizontal columns inside the instrument row.
function _gtbRenderOIMatrix(name, suffix) {
    suffix = suffix || '';
    var entry = INSTRUMENT_SCORE_MAP[name];
    if (!entry || !entry.oiData || !entry.oiData.tableData || !entry.oiData.tableData.length) return;
    var oiData = entry.oiData, td = oiData.tableData;
    var tid = name.replace(/ /g, '-').replace(/&/g, '-');

    var atmIdx = -1;
    for (var i = 0; i < td.length; i++) { if (td[i]['ATM_STRIKE']) { atmIdx = i; break; } }
    if (atmIdx < 0) atmIdx = Math.floor(td.length / 2);

    var pc = 0; try { pc = parseFloat(generateTrend(name).change) || 0; } catch(e) {}

    var OFFS = [-2, -1, 0, 1, 2];
    var header = '<tr>' + OFFS.map(function(o) {
        return '<th>' + (o === 0 ? 'ATM' : 'ATM' + (o > 0 ? '+' + o : o)) + '</th>';
    }).join('') + '</tr>';
    var cells = '<tr>' + OFFS.map(function(off) {
        var idx = atmIdx + off;
        return _gtbOICellCompact((idx >= 0 && idx < td.length) ? td[idx] : null, pc, off === 0);
    }).join('') + '</tr>';

    var pcr = oiData.pcr, oiScore = entry.oi_obv || 0;
    var pcrCol = (pcr >= 1) ? 'var(--gtb-green)' : 'var(--gtb-red)';
    var oiCol  = oiScore > 0 ? 'var(--gtb-green)' : oiScore < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
    var meta = '<div class="gtb-oim-meta">'
        + 'PCR <b style="color:' + pcrCol + '">' + (pcr != null ? parseFloat(pcr).toFixed(2) : '—') + '</b>'
        + ' &nbsp; OI <b style="color:' + oiCol + '">' + (oiScore > 0 ? '+' : '') + parseFloat(oiScore).toFixed(1) + '</b>'
        + '</div>';

    jQ('#' + tid + '-oimatrix' + suffix).html(
        '<table class="oic-matrix"><thead>' + header + '</thead><tbody>' + cells + '</tbody></table>' + meta
    );
}

// ── Weightage / sub-score bar update ──────────────────────────────────────
// For index rows: renders top-6 constituent score bars.
// For stock rows: renders own sub-score breakdown (9:15/trend/futures/OI/total).
function _gtbUpdateWeightBars(nameOrIndex, suffix) {
    suffix = suffix || '';
    var wMap = nameOrIndex === 'NIFTY 50' ? NIFTY_50_WEIGHTED_STOCKS
             : nameOrIndex === 'NIFTY BANK' ? NIFTY_BANK_WEIGHTED_STOCKS : null;

    function _setBar(barId, valId, val, maxAbs) {
        var barEl = document.getElementById(barId);
        var valEl = document.getElementById(valId);
        if (!barEl || !valEl) return;
        var col = val > 0.3 ? 'var(--gtb-green)' : val < -0.3 ? 'var(--gtb-red)' : 'var(--gtb-amber)';
        barEl.style.width = Math.min(100, Math.abs(val) / maxAbs * 100) + '%';
        barEl.style.background = col;
        valEl.textContent = (val > 0 ? '+' : '') + (Number.isInteger(val) ? val : val.toFixed(1));
        valEl.style.color = col;
    }

    if (wMap) {
        // Index row — constituent bars
        var top6 = Object.entries(wMap).sort(function(a,b){return b[1]-a[1];}).slice(0,6);
        top6.forEach(function(kv) {
            var wname = kv[0];
            var wtid  = wname.replace(/ /g,'-').replace(/&/g,'-');
            var s = INSTRUMENT_SCORE_MAP[wname] && INSTRUMENT_SCORE_MAP[wname].score;
            if (!s) return;
            _setBar(wtid + '-wt-bar' + suffix, wtid + '-wt-score' + suffix, s.total, 8);
        });
    } else {
        // Stock row — own sub-score breakdown
        var tid  = nameOrIndex.replace(/ /g,'-').replace(/&/g,'-');
        var s = INSTRUMENT_SCORE_MAP[nameOrIndex] && INSTRUMENT_SCORE_MAP[nameOrIndex].score;
        if (!s) return;
        _setBar(tid+'-sub-915'+suffix+'-bar',   tid+'-sub-915'+suffix,   s.nine_fifteen || 0, 1);
        _setBar(tid+'-sub-trend'+suffix+'-bar', tid+'-sub-trend'+suffix, s.current_trend || 0, 1);
        _setBar(tid+'-sub-fut'+suffix+'-bar',   tid+'-sub-fut'+suffix,   s.futures_trend || 0, 1);
        _setBar(tid+'-sub-oi'+suffix+'-bar',    tid+'-sub-oi'+suffix,    s.oi_obv || 0, 3);
        _setBar(tid+'-sub-total'+suffix+'-bar', tid+'-sub-total'+suffix, s.total || 0, 8);
    }
}

function show915Trend(name) {

    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let asoCount = 0;
    let bsoCount = 0;

    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));

    let checkList = FO_LIST;
    if (name == "NIFTY 50") {
        checkList = NIFTY_50_LIST;
    }

    if (name == "NIFTY BANK") {
        checkList = NIFTY_BANK_LIST;
    }


    let stockList = []
    if (breakOutNineFifteen) {
        jQ.each(breakOutNineFifteen, function (index, item) {
            if (item['CLOSE_9_15'] == 'ASO') {
                if (jQ.inArray(index, checkList) != -1) {
                    asoCount++;
                    stockList.push({ 'NAME': index, 'CLOSE_9_15': item['CLOSE_9_15'] });
                }
            }

            if (item['CLOSE_9_15'] == 'BSO') {
                if (jQ.inArray(index, checkList) != -1) {
                    bsoCount++;
                    stockList.push({ 'NAME': index, 'CLOSE_9_15': item['CLOSE_9_15'] });
                }
            }
        });
    }

    let columns = []
    let aso = ['ASO', asoCount]
    let bso = ['BSO', bsoCount]

    columns.push(aso);
    columns.push(bso);

    // Horizontal ratio bar: ASO (green) vs BSO (red)
    let total915 = (asoCount + bsoCount) || 1;
    let asoPct = Math.round((asoCount / total915) * 100);
    let bsoPct = 100 - asoPct;
    let ratioEl = document.getElementById(tempName + '-nine-fifteen-close');
    if (ratioEl) {
        ratioEl.innerHTML =
            '<div class="gtb-915-ratio-bar">' +
            '<div class="gtb-915-ratio-fill bull" style="width:' + asoPct + '%"><span>' + (asoPct > 15 ? asoPct + '%' : '') + '</span></div>' +
            '<div class="gtb-915-ratio-fill bear" style="width:' + bsoPct + '%"><span>' + (bsoPct > 15 ? bsoPct + '%' : '') + '</span></div>' +
            '</div>';
    }

    // Summary bar: ASO count / BSO count
    let summaryHtml = '<div class="gtb-915-summary">';
    summaryHtml += '<span class="gtb-915-count bull"><i class="bi bi-arrow-up-circle-fill"></i> ASO: ' + asoCount + '</span>';
    summaryHtml += '<span class="gtb-915-count bear"><i class="bi bi-arrow-down-circle-fill"></i> BSO: ' + bsoCount + '</span>';
    summaryHtml += '</div>';

    // Chip list: one chip per stock
    let chipHtml = '<div class="gtb-915-chip-list">';
    jQ.each(stockList, function (index, item) {
        let cls = (item['CLOSE_9_15'] === 'ASO' || item['CLOSE_9_15'] === 'AST') ? 'bull' : 'bear';
        let href = 'https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/' + item['NAME'] + '/' + INSTRUMENT_TOKENS[item['NAME']];
        chipHtml += '<a class="gtb-915-stock-chip ' + cls + '" href="' + href + '" target="_blank">';
        chipHtml += '<span class="chip-name">' + item['NAME'] + '</span>';
        chipHtml += '<span class="chip-badge">' + item['CLOSE_9_15'] + '</span>';
        chipHtml += '</a>';
    });
    chipHtml += '</div>';

    jQ("#" + tempName + "-nine-fifteen-close-table").html(summaryHtml + chipHtml);
}

// ── Signal label matrix only (no chart) — used in stock viewer card ───────────
function _buildOISignalRow(signals) {
    let html = '<div class="sv-oi-matrix">';
    signals.forEach(function(s) {
        let res = s.res;
        let ceBg = (res.ceLabel === 'CE WRITE' || res.ceLabel === 'CE UNWIND') ? '#6b1a1a'
                 : (res.ceLabel === 'CE BUY'   || res.ceLabel === 'CE COV')    ? '#1a4a1a' : '#1c2128';
        let peBg = (res.peLabel === 'PE WRITE' || res.peLabel === 'PE UNWIND') ? '#1a4a1a'
                 : (res.peLabel === 'PE BUY'   || res.peLabel === 'PE COV')    ? '#6b1a1a' : '#1c2128';
        let ceColor = ceBg === '#1a4a1a' ? '#3fb950' : ceBg === '#6b1a1a' ? '#f85149' : '#7d8590';
        let peColor = peBg === '#1a4a1a' ? '#3fb950' : peBg === '#6b1a1a' ? '#f85149' : '#7d8590';
        let scoreColor = res.score > 0 ? '#3fb950' : res.score < 0 ? '#f85149' : '#7d8590';
        let ivHtml = (s.ceIV || s.peIV)
            ? '<div class="sv-oi-m-iv"><span>' + (s.ceIV || '—') + '</span><span style="color:var(--gtb-muted);">IV</span><span>' + (s.peIV || '—') + '</span></div>' : '';
        html += '<div class="sv-oi-m-cell' + (s.isATM ? ' sv-oi-m-atm' : '') + '">'
            + '<div class="sv-oi-m-strike">' + s.strike + (s.isATM ? ' ★' : '') + '</div>'
            + '<div class="sv-oi-m-label" style="background:' + ceBg + ';color:' + ceColor + ';">' + (res.ceLabel || '—') + '</div>'
            + '<div class="sv-oi-m-label" style="background:' + peBg + ';color:' + peColor + ';margin-top:2px;">' + (res.peLabel || '—') + '</div>'
            + ivHtml
            + '<div class="sv-oi-m-score" style="color:' + scoreColor + ';">' + (res.score > 0 ? '+' : '') + parseFloat(res.score).toFixed(1) + '</div>'
            + '</div>';
    });
    html += '</div>';
    return html;
}

// ── Shared: build OI+OBV bar chart SVG + signal row from pre-computed signals ──
// opts: { svgW, svgH, padL, padR, padT, padB, sigRowClass, labelFontSize }
function _buildOIChartHtml(signals, opts) {
    opts = opts || {};
    let n = signals.length;
    let svgW  = opts.svgW  || 300;
    let svgH  = opts.svgH  || 110;
    let padL  = opts.padL  || 22;
    let padR  = opts.padR  || 6;
    let padT  = opts.padT  || 8;
    let padB  = opts.padB  || 14;
    let sigRowClass = opts.sigRowClass || 'sv-oi-sig-row';
    let labelFs = opts.labelFontSize || 5;
    let sigRowPad = opts.sigRowPad || '2px 28px 4px 28px';

    let totalH    = svgH - padT - padB;
    let oiH_total = Math.floor(totalH * 0.55);
    let obvH_total= Math.floor(totalH * 0.40);
    let splitGap  = totalH - oiH_total - obvH_total;
    let oiTop  = padT;
    let obvTop = padT + oiH_total + splitGap;
    let chartW = svgW - padL - padR;
    let groupW = chartW / n;
    let barW   = Math.max(2, groupW / 5 - 1);

    let maxOI  = Math.max(1, Math.max.apply(null, signals.map(function(s) { return Math.max(Math.abs(s.ceChg), Math.abs(s.peChg)); })));
    function _oiBarH(v)  { return oiH_total  * Math.abs(v) / maxOI; }

    let obvVals = [];
    signals.forEach(function(s) { if (s.ceOBV !== null) obvVals.push(Math.abs(s.ceOBV)); if (s.peOBV !== null) obvVals.push(Math.abs(s.peOBV)); });
    let obvMax = obvVals.length ? Math.max.apply(null, obvVals) : 1;
    function _obvBarH(v) { return v !== null ? obvH_total * Math.abs(v) / (obvMax || 1) : 0; }

    let svg = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:' + svgH + 'px;display:block;">';

    svg += '<text x="1" y="' + (oiTop + 5) + '" fill="#7d8590" font-size="4.5" font-family="monospace">OI</text>';
    svg += '<text x="1" y="' + (obvTop + 5) + '" fill="#7d8590" font-size="4.5" font-family="monospace">OBV</text>';
    svg += '<line x1="' + padL + '" y1="' + (oiTop + oiH_total) + '" x2="' + (svgW - padR) + '" y2="' + (oiTop + oiH_total) + '" stroke="#3d444d" stroke-width="0.5"/>';
    svg += '<line x1="' + padL + '" y1="' + (obvTop + obvH_total) + '" x2="' + (svgW - padR) + '" y2="' + (obvTop + obvH_total) + '" stroke="#3d444d" stroke-width="0.5"/>';

    signals.forEach(function(s, i) {
        let cx = padL + i * groupW + groupW / 2;
        let totalBarsW = barW * 4 + 3;
        let x0 = cx - totalBarsW / 2;

        if (s.isATM) svg += '<rect x="' + (padL + i * groupW) + '" y="' + padT + '" width="' + groupW + '" height="' + totalH + '" fill="#fbbf2408"/>';

        let ceOIH = _oiBarH(s.ceChg), peOIH = _oiBarH(s.peChg);
        svg += '<rect x="' + x0 + '" y="' + (oiTop + oiH_total - ceOIH) + '" width="' + barW + '" height="' + ceOIH + '" fill="#f85149" opacity="0.9"><title>CE OI Δ: ' + (s.ceChg >= 0 ? '+' : '') + s.ceChg.toFixed(0) + '</title></rect>';
        svg += '<rect x="' + (x0 + barW + 1) + '" y="' + (oiTop + oiH_total - peOIH) + '" width="' + barW + '" height="' + peOIH + '" fill="#3fb950" opacity="0.9"><title>PE OI Δ: ' + (s.peChg >= 0 ? '+' : '') + s.peChg.toFixed(0) + '</title></rect>';

        let ceOBVH = _obvBarH(s.ceOBV), peOBVH = _obvBarH(s.peOBV);
        svg += '<rect x="' + (x0 + barW * 2 + 2) + '" y="' + (obvTop + obvH_total - ceOBVH) + '" width="' + barW + '" height="' + ceOBVH + '" fill="#58a6ff" opacity="0.85"><title>CE OBV: ' + (s.ceOBV !== null ? s.ceOBV.toFixed(0) : '—') + '</title></rect>';
        svg += '<rect x="' + (x0 + barW * 3 + 3) + '" y="' + (obvTop + obvH_total - peOBVH) + '" width="' + barW + '" height="' + peOBVH + '" fill="#bc8cff" opacity="0.85"><title>PE OBV: ' + (s.peOBV !== null ? s.peOBV.toFixed(0) : '—') + '</title></rect>';

        let labelColor = s.isATM ? '#fbbf24' : '#7d8590';
        svg += '<text x="' + cx + '" y="' + (svgH - 2) + '" fill="' + labelColor + '" font-size="' + labelFs + '" font-family="monospace" text-anchor="middle" font-weight="' + (s.isATM ? 'bold' : 'normal') + '">' + s.strike + (s.isATM ? '★' : '') + '</text>';
    });

    let lgY = padT + 1;
    svg += '<rect x="' + padL + '" y="' + lgY + '" width="5" height="3" fill="#f85149" opacity="0.85"/><text x="' + (padL + 6) + '" y="' + (lgY + 3) + '" fill="#f85149" font-size="4.5">CE OI</text>';
    svg += '<rect x="' + (padL + 28) + '" y="' + lgY + '" width="5" height="3" fill="#3fb950" opacity="0.85"/><text x="' + (padL + 34) + '" y="' + (lgY + 3) + '" fill="#3fb950" font-size="4.5">PE OI</text>';
    svg += '<rect x="' + (padL + 56) + '" y="' + lgY + '" width="5" height="3" fill="#58a6ff" opacity="0.85"/><text x="' + (padL + 62) + '" y="' + (lgY + 3) + '" fill="#58a6ff" font-size="4.5">CE OBV</text>';
    svg += '<rect x="' + (padL + 92) + '" y="' + lgY + '" width="5" height="3" fill="#bc8cff" opacity="0.85"/><text x="' + (padL + 98) + '" y="' + (lgY + 3) + '" fill="#bc8cff" font-size="4.5">PE OBV</text>';
    svg += '</svg>';

    let rowHtml = '<div class="' + sigRowClass + '" style="padding:' + sigRowPad + ';">';
    signals.forEach(function(s) {
        let res = s.res;
        let ceBg = (res.ceLabel === 'CE WRITE' || res.ceLabel === 'CE UNWIND') ? '#6b1a1a'
                 : (res.ceLabel === 'CE BUY'   || res.ceLabel === 'CE COV')    ? '#1a4a1a' : '#1c2128';
        let peBg = (res.peLabel === 'PE WRITE' || res.peLabel === 'PE UNWIND') ? '#1a4a1a'
                 : (res.peLabel === 'PE BUY'   || res.peLabel === 'PE COV')    ? '#6b1a1a' : '#1c2128';
        let ceColor = ceBg === '#1a4a1a' ? '#3fb950' : ceBg === '#6b1a1a' ? '#f85149' : '#7d8590';
        let peColor = peBg === '#1a4a1a' ? '#3fb950' : peBg === '#6b1a1a' ? '#f85149' : '#7d8590';
        let scoreColor = res.score > 0 ? '#3fb950' : res.score < 0 ? '#f85149' : '#7d8590';
        let ivHtml = (s.ceIV || s.peIV)
            ? '<div class="sv-oi-m-iv"><span>' + (s.ceIV || '—') + '</span><span style="color:var(--gtb-muted);">IV</span><span>' + (s.peIV || '—') + '</span></div>' : '';
        rowHtml += '<div class="sv-oi-m-cell' + (s.isATM ? ' sv-oi-m-atm' : '') + '">'
            + '<div class="sv-oi-m-label" style="background:' + ceBg + ';color:' + ceColor + ';">' + (res.ceLabel || '—') + '</div>'
            + '<div class="sv-oi-m-label" style="background:' + peBg + ';color:' + peColor + ';margin-top:2px;">' + (res.peLabel || '—') + '</div>'
            + ivHtml
            + '<div class="sv-oi-m-score" style="color:' + scoreColor + ';">' + (res.score > 0 ? '+' : '') + parseFloat(res.score).toFixed(1) + '</div>'
            + '</div>';
    });
    rowHtml += '</div>';

    return '<div style="padding:4px 6px 0;">' + svg + '</div>' + rowHtml;
}

// ── Compact OI matrix for stock viewer ────────────────────────────────────────
function _svRenderOIMatrix(name, tempName, oiData, suffix) {
    let tableData = oiData.tableData || [];
    if (!tableData.length) return;

    let priceChange = 0;
    try { priceChange = parseFloat(generateTrend(name).change) || 0; } catch(e) {}

    let oiScore = 0, atmCeLabel = null, atmPeLabel = null;
    let signals = [];

    function _latestOBV(obvList) {
        if (!obvList || !obvList.length) return null;
        for (let j = obvList.length - 1; j >= 0; j--) {
            let v = (typeof obvList[j] === 'object') ? (obvList[j].obv != null ? obvList[j].obv : null) : obvList[j];
            if (v !== null && v !== undefined) return parseFloat(v);
        }
        return null;
    }
    function _latestIV(ivList) {
        if (!ivList || !ivList.length) return null;
        for (let j = ivList.length - 1; j >= 0; j--) {
            if (ivList[j] && ivList[j].iv !== null && ivList[j].iv !== undefined) return parseFloat(ivList[j].iv).toFixed(1);
        }
        return null;
    }

    tableData.forEach(function(item) {
        let res = scoreOIStrikeForSignal(item, !!item['ATM_STRIKE'], priceChange);
        let isATM = !!item['ATM_STRIKE'];
        oiScore += res.score;
        if (isATM) { atmCeLabel = res.ceLabel; atmPeLabel = res.peLabel; }
        signals.push({
            strike: item['STRIKE'], isATM: isATM,
            ceChg: parseFloat(item['CHG_OI_CE']) || 0,
            peChg: parseFloat(item['CHG_OI_PE']) || 0,
            ceOBV: _latestOBV(item['CE_OBV']),
            peOBV: _latestOBV(item['PE_OBV']),
            ceIV: _latestIV(item['CE_IV']),
            peIV: _latestIV(item['PE_IV']),
            res: res
        });
    });

    let mHtml = _buildOIChartHtml(signals);

    // PCR
    let pcr = parseFloat(oiData.pcr || 0).toFixed(2);
    let pcrColor = parseFloat(pcr) > 1.3 ? '#3fb950' : parseFloat(pcr) > 0.7 ? '#fbbf24' : '#f85149';
    let pcrHtml = '<span style="font-size:0.48rem;padding:1px 5px;border-radius:3px;border:1px solid ' + pcrColor + '44;color:' + pcrColor + ';font-weight:700;">PCR ' + pcr + '</span>';
    jQ('#' + tempName + '-pcr-probability' + suffix).html(pcrHtml);

    // Score badge
    updateScoresOfTrend(name, oiScore, atmCeLabel, atmPeLabel, suffix);

    // Render matrix into the oi body (replaces the bar charts)
    jQ('#' + tempName + '-oi' + suffix).html(mHtml);
    jQ('#' + tempName + '-obv' + suffix).html('');
    jQ('#' + tempName + '-oi-signal-row' + suffix).html('');

    // Update the INSTRUMENT_SCORE_MAP oi_obv for scoring
    if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
    INSTRUMENT_SCORE_MAP[name].oi_obv = oiScore;
}

function showOIOBVBarChart(name, suffix) {
    suffix = suffix || '';
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let columnsOi = [];
    let columnsObv = [];

    let x = ['x']

    let oiCECH = ["CH CE OI"]
    let oiPECH = ["CH PE OI"]
    let oiCE = ["CE OI"]
    let oiPE = ["PE OI"]

    let oiCESUM = ["SUM CE OI"]
    let oiPESUM = ["SUM PE OI"]

    let oiCEOBV = ["CE OBV"]
    let oiPEOBV = ["PE OBV"]

    let data = stock[0]['DATA']['tableData']
    let oiData = stock[0]['DATA']

    // Cache per-instrument so maximize can re-render without re-fetching
    if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
    INSTRUMENT_SCORE_MAP[name].oiData = oiData;


    let pcrHtml = ''
    let chPcrHtml = ''

    function pcrBadge(val, label) {
        let v = parseFloat(val);
        let cls = v > 1.3 ? 'sv-badge-green' : v > 1.0 ? 'sv-badge-amber' : v > 0.7 ? 'sv-badge-muted' : 'sv-badge-red';
        let tip = v > 1.3 ? 'Very Bullish' : v > 1.0 ? 'Moderately Bullish' : v > 0.7 ? 'Neutral' : 'Bearish';
        return '<span title="' + tip + ' PCR" class="sv-badge ' + cls + '">' + label + ':' + val + '</span>';
    }
    pcrHtml = pcrBadge(oiData['pcr'], 'P');
    chPcrHtml = pcrBadge(oiData['chPcr'], 'Delta');
    jQ("#" + tempName + "-pcr-probability" + suffix).html(pcrHtml + chPcrHtml)

    let priceChange = 0;
    try {
        priceChange = parseFloat(generateTrend(name).change) || 0;
    } catch(e) {
        // MCX instruments not in INSTRUMENT_LIST_GLOBAL — derive from stock LTP vs open
        if (stock[0] && stock[0]['LTP'] && stock[0]['OPEN']) {
            let ltp = parseFloat(stock[0]['LTP']), open = parseFloat(stock[0]['OPEN']);
            priceChange = open > 0 ? ((ltp - open) / open * 100) : 0;
        }
    }
    let oiScore = 0
    let atmIndex = -1;
    let strikeSignals = [];

    jQ.each(data, function (index, item) {
        x.push(item['STRIKE'])
        oiCE.push(item['OI_CE'])
        oiPE.push(item['OI_PE'])
        oiCECH.push(item['CHG_OI_CE'])
        oiPECH.push(item['CHG_OI_PE'])
        let sumCE = parseFloat(item['OI_CE']) + parseFloat(item['CHG_OI_CE'])
        let sumPE = parseFloat(item['OI_PE']) + parseFloat(item['CHG_OI_PE'])
        oiCESUM.push(sumCE.toFixed(1))
        oiPESUM.push(sumPE.toFixed(1))
        let _ceObvL = item['CE_OBV'], _peObvL = item['PE_OBV'];
        oiCEOBV.push(parseFloat(_ceObvL[_ceObvL.length-1]['obv']).toFixed(1))
        oiPEOBV.push(parseFloat(_peObvL[_peObvL.length-1]['obv']).toFixed(1))

        let result = scoreOIStrikeForSignal(item, !!item['ATM_STRIKE'], priceChange);
        oiScore += updateScoresOfOI(name, item, priceChange);

        if (item['ATM_STRIKE']) atmIndex = index;

        let s = result.score;
        let color;
        if      (s >= 2)  color = '#28a745';
        else if (s <= -2) color = '#dc3545';
        else if (s > 0)   color = '#85c785';
        else if (s < 0)   color = '#e08080';
        else              color = '#6c757d';

        strikeSignals.push({
            strike: item['STRIKE'], score: s, color: color,
            ceLabel: result.ceLabel, peLabel: result.peLabel,
            isATM: !!item['ATM_STRIKE']
        });
    });

    let atmSignal = strikeSignals.find(function(s) { return s.isATM; });
    updateScoresOfTrend(name, oiScore, atmSignal ? atmSignal.ceLabel : null, atmSignal ? atmSignal.peLabel : null, suffix);

    columnsOi.push(x)
    columnsOi.push(oiCECH)
    columnsOi.push(oiPECH)

    columnsObv.push(x)
    columnsObv.push(oiCEOBV)
    columnsObv.push(oiPEOBV)

    let strikes = x.slice(1); // strip 'x' header

    // Inline row: use compact SVG bars (ApexCharts needs ~100px min, unusable at row scale)
    function _svgMiniBar(containerId, seriesList, atmIdx) {
        let el = document.getElementById(containerId.replace(/^#/, ''));
        if (!el) return;
        let W = el.clientWidth || 260, H = 56;
        let n = seriesList[0].values.length;
        if (!n) { el.innerHTML = '<span style="color:#7d8590;font-size:0.5rem;padding:2px;">no data</span>'; return; }
        // max abs across all series
        let maxV = 0;
        seriesList.forEach(function(s) { s.values.forEach(function(v) { let a = Math.abs(+v||0); if (a>maxV) maxV=a; }); });
        if (!maxV) maxV = 1;
        let barWPct = parseInt(localStorage.getItem('GTB_OI_BAR_W') || '60') / 100;
        let barW = Math.max(2, Math.floor((W / n) / seriesList.length * barWPct));
        let groupW = barW * seriesList.length + 1;
        let svg = '<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;">';
        let midY = Math.round(H / 2);
        // zero line
        svg += '<line x1="0" y1="' + midY + '" x2="' + W + '" y2="' + midY + '" stroke="#30363d" stroke-width="1"/>';
        for (let i = 0; i < n; i++) {
            let gx = Math.round(i * (W / n));
            // ATM highlight
            if (i === atmIdx) svg += '<rect x="' + gx + '" y="0" width="' + Math.round(W/n) + '" height="' + H + '" fill="#fbbf2418" rx="1"/>';
            seriesList.forEach(function(s, si) {
                let v = +s.values[i] || 0;
                let bh = Math.round((Math.abs(v) / maxV) * (midY - 2));
                let by = v >= 0 ? midY - bh : midY;
                let bx = gx + si * (barW + 1);
                svg += '<rect x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + Math.max(1,bh) + '" fill="' + s.color + '" opacity="0.85" rx="1"/>';
            });
            // ATM tick below
            if (i === atmIdx) svg += '<text x="' + (gx + Math.round(W/n)/2) + '" y="' + (H-1) + '" text-anchor="middle" font-size="5" fill="#fbbf24">▲</text>';
        }
        svg += '</svg>';
        el.innerHTML = svg;
    }

    _svgMiniBar('#' + tempName + '-oi' + suffix, [
        { label: 'CH CE OI', color: OI_COLORS.CE_OI, values: oiCECH.slice(1) },
        { label: 'CH PE OI', color: OI_COLORS.PE_OI, values: oiPECH.slice(1) },
    ], atmIndex);
    _svgMiniBar('#' + tempName + '-obv' + suffix, [
        { label: 'CE OBV', color: OI_COLORS.CE_OBV, values: oiCEOBV.slice(1) },
        { label: 'PE OBV', color: OI_COLORS.PE_OBV, values: oiPEOBV.slice(1) },
    ], atmIndex);

    // Shared x-axis labels (strikes) below both charts — rendered once
    (function() {
        let axEl = document.getElementById(tempName + '-oiobv-xaxis');
        if (!axEl || !strikes.length) return;
        let W = axEl.clientWidth || 260;
        let n = strikes.length;
        let slotW = W / n;
        let svg = '<svg width="' + W + '" height="14" xmlns="http://www.w3.org/2000/svg" style="display:block;">';
        for (let i = 0; i < n; i++) {
            let cx = Math.round(i * slotW + slotW / 2);
            let lbl = String(strikes[i]);
            // Abbreviate: drop last 3 zeros if present (e.g. 24500 → 24.5k or just last digits)
            let short = lbl.length > 5 ? lbl.slice(-4) : lbl;
            let isAtm = (i === atmIndex);
            svg += '<text x="' + cx + '" y="10" text-anchor="middle" font-size="' + (isAtm ? '6' : '5.5') + '" '
                 + 'fill="' + (isAtm ? '#fbbf24' : '#7d8590') + '" font-weight="' + (isAtm ? '700' : '400') + '">'
                 + short + '</text>';
        }
        svg += '</svg>';
        axEl.innerHTML = svg;
    })();

    // Strike signal annotation row — shows CE/PE interpretation per strike below the charts
    let signalRowHtml = '<div style="display:flex;gap:2px;margin-top:4px;flex-wrap:nowrap;overflow-x:auto;">';
    for (let i = 0; i < strikeSignals.length; i++) {
        let s = strikeSignals[i];
        let border = s.isATM ? '2px solid #fbbf24' : '1px solid #30363d';
        let fontWeight = s.isATM ? '900' : '600';
        let strikeColor = s.isATM ? '#fbbf24' : '#e6edf3';
        let ceLabelColor = (s.ceLabel === 'CE WRITE' || s.ceLabel === 'CE UNWIND') ? '#f85149'
                         : (s.ceLabel === 'CE BUY'   || s.ceLabel === 'CE COV')    ? '#3fb950' : '#7d8590';
        let peLabelColor = (s.peLabel === 'PE WRITE' || s.peLabel === 'PE UNWIND') ? '#3fb950'
                         : (s.peLabel === 'PE BUY'   || s.peLabel === 'PE COV')    ? '#f85149' : '#7d8590';
        let scoreColor = s.score > 0 ? '#3fb950' : s.score < 0 ? '#f85149' : '#7d8590';
        signalRowHtml += '<div style="flex:1;min-width:70px;text-align:center;border:' + border + ';border-radius:5px;padding:3px 2px;background:#161b22;">';
        signalRowHtml += '<div style="font-size:0.6rem;color:' + strikeColor + ';font-weight:' + fontWeight + ';">' + s.strike + (s.isATM ? ' ★' : '') + '</div>';
        signalRowHtml += '<div style="font-size:0.58rem;color:' + ceLabelColor + ';">' + s.ceLabel + '</div>';
        signalRowHtml += '<div style="font-size:0.58rem;color:' + peLabelColor + ';">' + s.peLabel + '</div>';
        signalRowHtml += '<div style="font-size:0.6rem;color:' + scoreColor + ';font-weight:700;">' + (s.score > 0 ? '+' : '') + parseFloat(s.score).toFixed(2) + '</div>';
        signalRowHtml += '</div>';
    }
    signalRowHtml += '</div>';
    jQ("#" + tempName + "-oi-signal-row" + suffix).html(signalRowHtml);

    showComponentOITable(name, suffix);
}

// ── Futures Data Fetcher ───────────────────────────────────────────────────────
// Fetches futures intraday (5-min) and previous day candles for an instrument.
// Computes VWAP (volume-weighted avg price) from intraday candles.
// Determines futures remark (LONG / SHORT / SHORT_COVERING / LONG_UNWINDING /
// BULLS_CONSOLIDATING / BEARS_CONSOLIDATING etc.) from OI + price change — the
// standard OI matrix:
//   Price↑ + OI↑ → LONG           (fresh longs = bullish)
//   Price↓ + OI↑ → SHORT          (fresh shorts = bearish)
//   Price↑ + OI↓ → SHORT_COVERING (shorts buying back = bullish)
//   Price↓ + OI↓ → LONG_UNWINDING (longs exiting = bearish)
// Also computes futures premium = futures LTP − spot LTP.
// USDINR / CRUDEOILM: premium skipped (no spot traded on same exchange).
// Returns data passed to setFutureDetails() for UI render and to INSTRUMENT_SCORE_MAP.
async function showFutureDetails(name) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let futures;
    jQ.each(FUTURE_INTRUMENT_LIST, function (index, item) {
        let instName = name
        if (instName == "NIFTY 50") {
            instName = 'NIFTY'
        }

        if (instName == "NIFTY BANK") {
            instName = 'BANKNIFTY'
        }

        if (item.name == instName) {
            futures = item;
        }
    })
    if (!futures) { console.log('No NSE future contract for ' + name); return null; }
    let pres = await getHistoricalDataUsingPromise(futures['instrument_token'], _gtbPrevDay(), _gtbPrevDay(), 'day');
    // Fetch intraday 5-minute candles for real VWAP calculation
    let cres = await getHistoricalDataUsingPromise(futures['instrument_token'], _gtbCurrDay(), _gtbCurrDayTo(), '5minute');

    let intradayCandles = []
    let prevData = []
    jQ.each(_gtbTrimCandles(cres.data.candles), function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("HH:mm")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map.oi = item[6]
        intradayCandles.push(map);
    });

    jQ.each(pres.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("HH:mm")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map.oi = item[6]
        prevData.push(map);
    });

    let prevDayCandle = prevData[prevData.length - 1];
    // Synthetic daily candle from intraday for legacy fields
    let lastCandle = intradayCandles[intradayCandles.length - 1];
    let firstCandle = intradayCandles[0];
    let dailyCandle = {
        date: lastCandle.date,
        open: firstCandle.open,
        high: Math.max.apply(null, intradayCandles.map(function(c) { return c.high; })),
        low:  Math.min.apply(null, intradayCandles.map(function(c) { return c.low; })),
        close: lastCandle.close,
        volume: intradayCandles.reduce(function(s, c) { return s + c.volume; }, 0),
        oi: lastCandle.oi
    };

    // Single unified futures-remark analyzer for all instrument types (NIFTY / BANK / stocks / MCX)
    var _vixLtp = 0;
    try { _vixLtp = parseFloat((JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}')['INDIA VIX'] || {}).ltp) || 0; } catch (e) {}
    let resp = showTableAiNiftyPrediction(dailyCandle, prevDayCandle, futures['lot_size'], intradayCandles,
        { vix: _vixLtp, baselineVix: 13, name: name })
    resp['quote'] = dailyCandle
    resp['instrument_token'] = futures['instrument_token']
    resp['tradingsymbol'] = futures['tradingsymbol']

    resp['vwap'] = getVwapTrend(dailyCandle, prevDayCandle);
    resp['vwapPrice'] = intradayCandles.length > 1
        ? computeIntradayVwap(intradayCandles)
        : parseFloat(((
            ((parseFloat(dailyCandle.high) + parseFloat(dailyCandle.low) + parseFloat(dailyCandle.close)) / 3) * parseFloat(dailyCandle.volume) +
            ((parseFloat(prevDayCandle.high) + parseFloat(prevDayCandle.low) + parseFloat(prevDayCandle.close)) / 3) * parseFloat(prevDayCandle.volume)
          ) / (parseFloat(dailyCandle.volume) + parseFloat(prevDayCandle.volume))).toFixed(2)) || 0;
    resp['trend'] = getFutureDirection(dailyCandle, prevDayCandle, name);

    return resp;
}

// Computes price signal, OI signal, and short-covering flag from futures data.
// Uses VWAP position + recent candle trend as primary signals — not just pChange vs prevClose.
// opts (all optional — absent = legacy behavior):
//   vix, baselineVix → volatility-adaptive thresholds
//   dayOpenOI, currOI → intraday OI build (current vs day-open), blended with day-over-day
//   premium, prevPremium → premium-trend confirmation (exposed in result)
function computeFuturesSignals(intradayCandles, vwap, lastPrice, pChange, changeinOpenInterest, pchangeinOpenInterest, opts) {
    opts = opts || {};

    // ── #4 VIX-adaptive thresholds — scale base thresholds by relative volatility ──
    var volScale = 1;
    if (opts.vix && opts.baselineVix && opts.baselineVix > 0) {
        volScale = Math.max(0.6, Math.min(2.5, opts.vix / opts.baselineVix));
    }
    var oiThresh    = 0.5 * volScale;   // % OI change to be meaningful
    var oiUnwind    = 1.0 * volScale;   // % OI fall = covering/unwinding
    var priceThresh = 0.1 * volScale;   // % price tie-breaker

    // ── #2 Recent candle trend (last 5) WITH volume confirmation ──
    let last5 = (intradayCandles && intradayCandles.length >= 2) ? intradayCandles.slice(-5) : [];
    let upCandles = 0, downCandles = 0, upVol = 0, downVol = 0;
    for (let ci = 1; ci < last5.length; ci++) {
        var cc = parseFloat(last5[ci].close), pp = parseFloat(last5[ci - 1].close), vv = parseFloat(last5[ci].volume) || 0;
        if (cc > pp) { upCandles++; upVol += vv; }
        else if (cc < pp) { downCandles++; downVol += vv; }
    }
    // require the dominant direction to also carry the volume (no-volume moves discounted)
    let recentBullish = upCandles >= 3 && upVol >= downVol;
    let recentBearish = downCandles >= 3 && downVol >= upVol;

    // VWAP position — is current price above institutional average?
    let aboveVwap = parseFloat(lastPrice) >= parseFloat(vwap);

    // Price signal: VWAP primary, candle+volume trend confirms, pChange breaks ties
    let price;
    if      (aboveVwap && recentBullish)                              price = "+";
    else if (aboveVwap && pChange > priceThresh && !recentBearish)    price = "+";
    else if (!aboveVwap && recentBearish)                             price = "-";
    else if (!aboveVwap && pChange < -priceThresh && !recentBullish)  price = "-";
    else if (aboveVwap && recentBearish)                              price = "-";
    else if (!aboveVwap && recentBullish)                             price = "+-";
    else                                                              price = "+-";

    // ── #3 OI signal: blend day-over-day with intraday OI build ──
    let oiPct = parseFloat(pchangeinOpenInterest);
    let oiAbs = parseFloat(changeinOpenInterest);
    let intradayOiPct = null;
    if (opts.dayOpenOI && opts.currOI && opts.dayOpenOI > 0) {
        intradayOiPct = (opts.currOI - opts.dayOpenOI) / opts.dayOpenOI * 100;
    }
    // effective OI% = the stronger-magnitude of the two reads (fresher intraday wins when bigger)
    let effOiPct = oiPct;
    if (intradayOiPct !== null && Math.abs(intradayOiPct) > Math.abs(oiPct)) effOiPct = intradayOiPct;

    let oi;
    if      (effOiPct >= oiThresh)  oi = "+";
    else if (effOiPct <= -oiThresh) oi = "-";
    else                            oi = "+-";

    // covering/unwinding when OI falling meaningfully (day-over-day OR intraday)
    let shortCoveringOrLongUnwinding = (oiAbs < 0 && Math.abs(oiPct) > oiUnwind)
        || (intradayOiPct !== null && intradayOiPct < -oiUnwind);

    // premium-trend confirmation (exposed for the score layer; doesn't alter the remark)
    let premiumTrend = 0;
    if (opts.premium != null && opts.prevPremium != null) {
        premiumTrend = opts.premium > opts.prevPremium ? 1 : opts.premium < opts.prevPremium ? -1 : 0;
    }

    return { price: price, oi: oi, shortCoveringOrLongUnwinding: shortCoveringOrLongUnwinding,
             aboveVwap: aboveVwap, recentBullish: recentBullish, recentBearish: recentBearish,
             volScale: volScale, intradayOiPct: intradayOiPct, premiumTrend: premiumTrend };
}

// Pure signal→REMARK mapping (no HTML). MUST stay in sync with the if/else in
// showTableAiNiftyPrediction(), which builds the same RemarkType + badge markup.
function _gtbRemarkFromSignals(signals, pChangeOIpct) {
    var price = signals.price, oi = signals.oi, sc = signals.shortCoveringOrLongUnwinding, av = signals.aboveVwap;
    if (price == "+" && oi == "+") return "LONG";
    if (price == "-" && oi == "+") return "SHORT";
    if (price == "+" && oi == "-" && sc) return "SHOT_COVERING";
    if (price == "-" && oi == "-" && sc) return "LONG_UNWINDING";
    if (price == "-" && oi == "-" && !sc) return "BEARS_COMING_SELL_ON_RISE";
    if (price == "+-" && oi == "+" && !sc && av && pChangeOIpct >= 10) return "GAMBLING_BUY_NEWS_AND_EVENTS";
    if (price == "+-" && oi == "+" && !sc && av && pChangeOIpct < 10)  return "CAUTION_WRITES_ERODING_PREMIUM";
    if (price == "+" && oi == "+-") return "BULLS_CONSOLIDATING";
    if (price == "-" && oi == "+-") return "BEARS_CONSOLIDATING";
    return "DEFENCE_BUY_ON_DECLINE";
}

// Compute-only futures classifier — same logic as showTableAiNiftyPrediction but
// builds NO HTML. Use this in hot loops (e.g. the 5-min accuracy reconstruction).
function _gtbClassifyFutures(quote, prevQuote, lotSize, intradayCandles, opts) {
    opts = opts || {};
    var vwap;
    if (intradayCandles && intradayCandles.length > 1) {
        vwap = computeIntradayVwap(intradayCandles);
    } else {
        var pTP = (parseFloat(prevQuote.high) + parseFloat(prevQuote.low) + parseFloat(prevQuote.close)) / 3;
        var cTP = (parseFloat(quote.high) + parseFloat(quote.low) + parseFloat(quote.close)) / 3;
        var dv = parseFloat(quote.volume) + parseFloat(prevQuote.volume);
        vwap = dv > 0 ? ((cTP * parseFloat(quote.volume) + pTP * parseFloat(prevQuote.volume)) / dv) : cTP;
    }
    var lastPrice = parseFloat(quote.close);
    var prevClose = parseFloat(prevQuote.close);
    var pChange = prevClose ? ((lastPrice - prevClose) / prevClose) * 100 : 0;
    var oiNow = parseFloat(quote.oi) / lotSize, oiPrev = parseFloat(prevQuote.oi) / lotSize;
    var chgOI = (oiNow - oiPrev).toFixed(2);
    var pChgOI = oiPrev ? (((oiNow - oiPrev) / oiPrev) * 100).toFixed(2) : "0";
    var dayOpenOI = (intradayCandles && intradayCandles.length && intradayCandles[0].oi)
        ? (parseFloat(intradayCandles[0].oi) / lotSize) : null;
    var signals = computeFuturesSignals(intradayCandles, vwap, lastPrice, pChange, chgOI, pChgOI,
        { vix: opts.vix, baselineVix: opts.baselineVix, dayOpenOI: dayOpenOI, currOI: oiNow });
    var remark = _gtbRemarkFromSignals(signals, parseFloat(pChgOI));
    return { remark: remark, dir: getFuturesTrendScore(remark), signals: signals, vwap: vwap, pChange: pChange };
}

// Computes true intraday VWAP from 5-minute candles: Σ(typicalPrice × volume) / Σvolume
function computeIntradayVwap(intradayCandles) {
    if (!intradayCandles || intradayCandles.length === 0) return 0;
    let sumTP = 0, sumVol = 0;
    for (let i = 0; i < intradayCandles.length; i++) {
        let c = intradayCandles[i];
        let tp = (parseFloat(c.high) + parseFloat(c.low) + parseFloat(c.close)) / 3;
        let vol = parseFloat(c.volume) || 0;
        sumTP  += tp * vol;
        sumVol += vol;
    }
    return sumVol > 0 ? parseFloat((sumTP / sumVol).toFixed(2)) : 0;
}

// Unified futures-remark analyzer for ALL instruments (NSE indices/stocks + MCX).
// Single source of truth for the REMARK; no per-instrument (NIFTY/BANK/CRUDE) variant.
function showTableAiNiftyPrediction(quote, prevQuote, lotSize, intradayCandles, opts) {
    opts = opts || {};
    let data = {}
    quote.volume = parseInt(quote.volume)

    // Use real intraday VWAP when 5-minute candles are provided; fall back to 2-point approximation
    var vwapPrice;
    if (intradayCandles && intradayCandles.length > 1) {
        vwapPrice = computeIntradayVwap(intradayCandles);
    } else {
        var pTypicalPrice = (parseFloat(prevQuote.high) + parseFloat(prevQuote.low) + parseFloat(prevQuote.close)) / 3
        var cTypicalPrice = (parseFloat(quote.high) + parseFloat(quote.low) + parseFloat(quote.close)) / 3
        var cVolumePrice = cTypicalPrice * parseFloat(quote.volume)
        var pVolumePrice = pTypicalPrice * parseFloat(prevQuote.volume)
        vwapPrice = ((cVolumePrice + pVolumePrice) / (parseInt(quote.volume) + parseInt(prevQuote.volume))).toFixed(2)
    }
    var vwap = vwapPrice ? vwapPrice : 0;
    var openPrice = quote.open;
    var highPrice = quote.high;
    var lowPrice = quote.low;
    var lastPrice = quote.close;
    var previousClose = prevQuote['close']
    var pChange = ((lastPrice - previousClose) / previousClose) * 100
    var change = (lastPrice - previousClose).toFixed(2)
    var shortCoveringOrLongUnwinding = false;
    var price;
    var oi;
    var booleanValue = false;
    var correctedVwap = vwap;
    var lastPrice = lastPrice;
    if (correctedVwap <= lastPrice) {
        booleanValue = true;
    } else {
        booleanValue = false;
    }
    var openInterest = quote['oi'] / lotSize;
    var previousOI = prevQuote['oi'] / lotSize
    var changeinOpenInterest = (openInterest - previousOI).toFixed(2)
    var pchangeinOpenInterest = (((openInterest - previousOI) / previousOI) * 100).toFixed(2);
    var changeEvo1 = change;
    var pChangeEvo = pchangeinOpenInterest;
    var changeEvo = changeinOpenInterest;
    var bottomTriangle = '<i class="bi bi-caret-down">DOWN</i>'
    var upTriangle = '<i class="bi bi-caret-up">UP</i>'
    var openInterestMarkup = '';
    var openInterestDirectionMarkup = '';
    var openInterestChangeMarkup = '';
    var openInterestChangePercMarkup = '';

    // Intraday OI build (current vs day-open OI) for the blended OI read
    var dayOpenOI = (intradayCandles && intradayCandles.length && intradayCandles[0].oi)
        ? (parseFloat(intradayCandles[0].oi) / lotSize) : null;
    let signals = computeFuturesSignals(intradayCandles, vwap, lastPrice, pChange, changeinOpenInterest, pchangeinOpenInterest, {
        vix: opts.vix, baselineVix: opts.baselineVix,
        dayOpenOI: dayOpenOI, currOI: openInterest,
        premium: opts.premium, prevPremium: opts.prevPremium
    });
    price = signals.price;
    oi = signals.oi;
    shortCoveringOrLongUnwinding = signals.shortCoveringOrLongUnwinding;
    booleanValue = signals.aboveVwap;

    let oiDisplayClass = (parseFloat(changeinOpenInterest) >= 0) ? 'bg-success' : 'bg-danger';
    openInterestMarkup = '<span class="badge ' + oiDisplayClass + '">' + openInterest + '</span>'
    openInterestDirectionMarkup = '<span class="badge ' + oiDisplayClass + '">' + (parseFloat(changeinOpenInterest) >= 0 ? upTriangle : bottomTriangle) + '</span>'
    openInterestChangeMarkup = '<span class="badge ' + oiDisplayClass + '">' + changeinOpenInterest + '</span>'
    openInterestChangePercMarkup = '<span class="badge ' + oiDisplayClass + '">' + pchangeinOpenInterest + '%</span>'

    var remark = "No Clear Trend, Bulls are still waiting";

    var dogImgContainer = '<span class="">' + dogImage + '</span>'
    var bullImageImgContainer = '<span class="">' + bullImage + '</span>'
    var bearImageImgContainer = '<span class="">' + bearImage + '</span>'
    var hulkImageImgContainer = '<span class="">' + hulkImage + '</span>'
    var captainImgContainer = '<span class="">' + captain + '</span>'
    var lokiImgContainer = '<span class="">' + loki + '</span>'
    var ironManImgContainer = '<span class="">' + ironMan + '</span>'
    var thorImgContainer = '<span class="">' + thor + '</span>'
    var hulNewImgContainer = '<span class="">' + hulkImageNew + '</span>'
    var doctorStrangeImgContainer = '<span class="">' + doctor_strange + '</span>'
    remark += dogImgContainer
    var display = "+";

    var RemarkType = ""

    if (price == "+" && oi == "+") {
        remark = '<div class="badge bg-success">Long</div>'
        display = "+";
        RemarkType = "LONG"
    } else if (price == "-" && oi == "+") {
        remark = '<div class="badge bg-danger">Short</div>'
        display = "-";
        RemarkType = "SHORT"
    } else if (price == "+" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = '<div class="badge bg-success">Short Covering</div>'
        display = "+";
        RemarkType = "SHOT_COVERING"
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = dogImgContainer + '<div class="badge bg-danger">Long Unwinding</div>'
        display = "-";
        RemarkType = "LONG_UNWINDING"
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding == false) {
        remark = dogImgContainer + lokiImgContainer + '<div class="badge bg-danger">Bears Coming,Sell On Rise</div>'
        display = "-";
        RemarkType = "BEARS_COMING_SELL_ON_RISE"
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo >= 10) {
        remark = '<div class="badge bg-danger">Gambling! Buy,News & Events</div>'
        display = "+";
        RemarkType = "GAMBLING_BUY_NEWS_AND_EVENTS"
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo < 10) {
        remark = '<div class="badge bg-danger">Caution! Writers Eroding Premium</div>'
        display = "+";
        RemarkType = "CAUTION_WRITES_ERODING_PREMIUM"
    } else if (price == "+" && oi == "+-") {
        remark = '<div class="badge bg-warning text-dark">Bulls Consolidating</div>'
        display = "+";
        RemarkType = "BULLS_CONSOLIDATING"
    } else if (price == "-" && oi == "+-") {
        remark = '<div class="badge bg-warning text-dark">Bears Consolidating</div>'
        display = "-";
        RemarkType = "BEARS_CONSOLIDATING"
    } else {
        remark = captainImgContainer + '<div class="badge bg-danger">Defence,Buy On Decline</div>'
        display = "+";
        RemarkType = "DEFENCE_BUY_ON_DECLINE"
    }

    data.REMARK = RemarkType

    // ── #5 Trend persistence — does this remark confirm the prior interval? ──
    // (informational: doesn't alter the remark, exposed for the score/UI layer)
    data.volScale     = signals.volScale;
    data.intradayOiPct = signals.intradayOiPct;
    data.premiumTrend = signals.premiumTrend;
    if (opts.name) {
        var dir = getFuturesTrendScore(RemarkType);
        var prev = GTB_LAST_FUT_REMARK[opts.name];
        data.persisted = !!(prev && prev.dir === dir && dir !== 0);   // same direction 2 intervals running
        GTB_LAST_FUT_REMARK[opts.name] = { remark: RemarkType, dir: dir, ts: Date.now() };
        // Remark accuracy is reconstructed on demand from 5-min candles (see the
        // #show-fut-accuracy viewer) rather than forward-collected per refresh.
    }

    var bullRemark = remark;
    var bearRemark = remark;
    var marketTrendPlus = ""
    var imageBullPlus = "";

    var openInterestMarkupBull = openInterestMarkup
    var openInterestDirectionMarkupBull = openInterestDirectionMarkup
    var openInterestChangeMarkupBull = openInterestChangeMarkup
    var openInterestChangePercMarkupBull = openInterestChangePercMarkup
    var niftyOILabelPlusBull = "NIFTY-OI"
    var otherRemarkType = ""
    var otherTrendRemarks = ""
    if (display == "+") {
        marketTrendPlus = '<div class=" badge bg-success">Hulk Arrived (+)</div>'
        otherTrendRemarks += '<div class="row">'
        otherTrendRemarks += '<div class="col-md-12">'
        otherTrendRemarks += "Hulk Arrived (+)"
        otherTrendRemarks += '</div>'
        otherTrendRemarks += '</div>'
        if (pChangeEvo >= 4 && price != "+-") {
            imageBullPlus = thorImgContainer + hulNewImgContainer + bullImageImgContainer
            otherRemarkType = "HULK_THOR_BULL_ARRIVED"
        } else if (pChangeEvo >= 4 && price == "+-") {
            marketTrendPlus = '<div class=" badge bg-warning">Doctor Strange Arrived (+)</div>'
            otherTrendRemarks = ''
            otherTrendRemarks += '<div class="row">'
            otherTrendRemarks += '<div class="col-md-12">'
            otherTrendRemarks += "Doctor Strange Arrived (+))"
            otherTrendRemarks += '</div>'
            otherTrendRemarks += '</div>'
            imageBullPlus = doctorStrangeImgContainer
            otherRemarkType = "DOCTOR_STRANGE_ARRIVED"
        } else {
            imageBullPlus = bullImageImgContainer;
        }
    } else {
        marketTrendPlus = '<div class="  badge bg-danger">Strongly Not Recommended to buy Calls</div>'
        imageBullPlus = ""
        openInterestMarkupBull = ""
        openInterestDirectionMarkupBull = ""
        openInterestChangeMarkupBull = ""
        openInterestChangePercMarkupBull = ""
        niftyOILabelPlusBull = ""
        bullRemark = ""
    }

    data.PLUS = imageBullPlus + bullRemark + marketTrendPlus

    var marketTrendMinus = ""
    var imageBearMinus = "";
    var openInterestMarkupBear = openInterestMarkup
    var openInterestDirectionMarkupBear = openInterestDirectionMarkup
    var openInterestChangeMarkupBear = openInterestChangeMarkup
    var openInterestChangePercMarkupBear = openInterestChangePercMarkup
    var bankNiftyOILabelPlusBear = "NIFTY-OI"

    if (display == "-") {
        marketTrendMinus = '<div class=" badge bg-danger">Chitauri Army Arrived (-)</div>'
        imageBearMinus = bearImageImgContainer
    } else {
        marketTrendMinus = '<div class="  badge bg-danger">Strongly Not Recommended to Short Calls</div>'
        openInterestMarkupBear = ""
        openInterestDirectionMarkupBear = ""
        openInterestChangeMarkupBear = ""
        openInterestChangePercMarkupBear = ""
        bankNiftyOILabelPlusBear = ""
        bearRemark = ""
    }

    data.MINUS = imageBearMinus + bearRemark + marketTrendMinus

    return data;
}

function getVwapTrend(quote, prevQuote) {
    var pTypicalPrice = (parseFloat(prevQuote.high) + parseFloat(prevQuote.low) + parseFloat(prevQuote.close)) / 3
    var cTypicalPrice = (parseFloat(quote.high) + parseFloat(quote.low) + parseFloat(quote.close)) / 3
    var cVolumePrice = cTypicalPrice * parseFloat(quote.volume)
    var pVolumePrice = pTypicalPrice * parseFloat(prevQuote.volume)
    var totalVolumePrice = cVolumePrice + pVolumePrice
    var totalVolume = parseInt(quote.volume) + parseInt(prevQuote.volume)
    var vwapPrice = (totalVolumePrice / totalVolume).toFixed(2)
    var vwap = vwapPrice ? vwapPrice : 0;
    var correctedVwap = vwap;
    correctedVwap = correctedVwap;

    var vvapTextOne = ''
    var vvapTextTwo = ''
    var vvapTextThree = ''
    var vvapTextFour = ''
    var bottomTriangle = '<i class="bi bi-caret-down"></i>'
    var upTriangle = '<i class="bi bi-caret-up"></i>'
    if (correctedVwap <= quote.close) {
        vvapTextOne += '<span class="badge bg-primary">' + vwap + '</span>'
        vvapTextTwo += '<span class="badge bg-success">BUY</span>'
        vvapTextThree += '<span class="badge bg-success">' + upTriangle + '</span>'
        vvapTextFour += '<span class="badge bg-success">' + (parseFloat(quote.close) - parseFloat(vwap)).toFixed(2) + '</span>'
    } else {
        vvapTextOne += '<span class="badge bg-primary">' + vwap + '</span>'
        vvapTextTwo += '<span class="badge bg-danger">SELL</span>'
        vvapTextThree += '<span class="badge bg-danger">' + bottomTriangle + '</span>'
        vvapTextFour += '<span class="badge bg-danger">' + (parseFloat(quote.close) - parseFloat(vwap)).toFixed(2) + '</span>'
    }
    return vvapTextOne + " " + vvapTextTwo + " " + vvapTextThree + " " + vvapTextFour;
}

function getFutureDirection(quote, prevQuote, symbol) {
    var pTypicalPrice = (parseFloat(prevQuote.high) + parseFloat(prevQuote.low) + parseFloat(prevQuote.close)) / 3
    var cTypicalPrice = (parseFloat(quote.high) + parseFloat(quote.low) + parseFloat(quote.close)) / 3
    var cVolumePrice = cTypicalPrice * parseFloat(quote.volume)
    var pVolumePrice = pTypicalPrice * parseFloat(prevQuote.volume)
    var totalVolumePrice = cVolumePrice + pVolumePrice
    var totalVolume = parseInt(quote.volume) + parseInt(prevQuote.volume)
    var vwapPrice = (totalVolumePrice / totalVolume).toFixed(2)
    var vwap = vwapPrice ? vwapPrice : 0;
    var correctedVwap = vwap;
    if (symbol == "BANKNIFTY") {
        correctedVwap = correctedVwap;
    }
    var booleanValue = false;
    if (correctedVwap <= quote.close) {
        booleanValue = true;
    } else {
        booleanValue = false;
    }
    var buyResult = Math.abs(quote.open - quote.low);
    var sellResult = Math.abs(quote.open - quote.high);
    var openPrice = quote.open;
    var highPrice = quote.high;
    var lowPrice = quote.low;
    var lastPrice = quote.close;
    var prevClose = prevQuote.close

    var bottomTriangle = '<i class="bi bi-caret-down"></i>'
    var upTriangle = '<i class="bi bi-caret-up"></i>'
    var futureTrend = ''
    var futureDirection = ''
    var diffNiftyOpenPrevOpen = Math.abs(openPrice - prevClose);
    var diffNiftyOpenPrevOpenResult = false;
    if (diffNiftyOpenPrevOpen >= 1 && diffNiftyOpenPrevOpen <= 11) {
        diffNiftyOpenPrevOpenResult = true
    }
    if (symbol == "BANKNIFTY") {
        if (buyResult >= 0 && buyResult <= 30) {
            var trend = "Strong BUY";
            futureTrend = '<span class="badge bg-success">' + trend + '</span>'
            futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
        } else if (sellResult >= 0 && sellResult <= 30) {
            var trend = "Strong SELL";
            futureTrend = '<span class="badge bg-danger">' + trend + '</span>'
            futureDirection = '<span class="badge bg-danger">' + bottomTriangle + '</span>'
        } else if (openPrice > prevClose && lastPrice >= openPrice
            && booleanValue == true) {
            var trend = "BUY";
            futureTrend = '<span class="badge bg-success">' + trend + '</span>'
            futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
        } else if (booleanValue == true && lastPrice > openPrice) {
            var trend = "BUY On Decline";
            futureTrend = '<span class="badge bg-success">' + trend + '</span>'
            futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
        } else {
            var trend = "SELL";
            futureTrend = '<span class="badge bg-danger">' + trend + '</span>'
            futureDirection = '<span class="badge bg-danger">' + bottomTriangle + '</span>'
        }
    } else {
        if (buyResult >= 0 && buyResult <= 11 && booleanValue == true) {
            var trend = "Strong BUY";
            futureTrend = '<span class="badge bg-success">' + trend + '</span>'
            futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
        } else if (sellResult >= 0 && sellResult <= 9 && booleanValue == false) {
            var trend = "Strong SELL";
            futureTrend = '<span class="badge bg-danger">' + trend + '</span>'
            futureDirection = '<span class="badge bg-danger">' + bottomTriangle + '</span>'
        } else if (openPrice > prevClose && lastPrice > openPrice
            && booleanValue == true) {
            var trend = "BUY";
            futureTrend = '<span class="badge bg-success">' + trend + '</span>'
            futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
        } else if (diffNiftyOpenPrevOpenResult == true
            && booleanValue == true && lastPrice > openPrice) {
            var trend = "BUY On Decline";
            futureTrend = '<span class="badge bg-success">' + trend + '</span>'
            futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
        } else {
            var trend = "SELL";
            futureTrend = '<span class="badge bg-danger">' + trend + '</span>'
            futureDirection = '<span class="badge bg-danger">' + bottomTriangle + '</span>'
        }
    }
    return futureTrend + " " + futureDirection
}

let scriptsVolumeMap = {}

// ── Weighted-only scan helper ─────────────────────────────────────────────────
// Returns the list of stocks to scan for Advance/Decline and Futures trend.
// When #scan-weighted-only is checked, returns the union of NIFTY_50_WEIGHTED_STOCKS
// and NIFTY_BANK_WEIGHTED_STOCKS keys (de-duplicated) — typically ~15 stocks instead of
// the full FO_LIST (~200). This cuts scan time significantly while keeping index movers.
function getActiveScanList() {
    if (jQ('#scan-weighted-only').is(':checked')) {
        let seen = {};
        let list = [];
        Object.keys(NIFTY_50_WEIGHTED_STOCKS).forEach(function(n) { if (!seen[n]) { seen[n] = true; list.push(n); } });
        Object.keys(NIFTY_BANK_WEIGHTED_STOCKS).forEach(function(n) { if (!seen[n]) { seen[n] = true; list.push(n); } });
        return list;
    }
    return FO_LIST;
}

// ── Advance/Decline Scanner ───────────────────────────────────────────────────
// Counts how many instruments in FO_LIST, NIFTY_50_LIST, and NIFTY_BANK_LIST are
// currently in ASO/BSO trend, then plots bar charts for visual A/D ratio.
//
// Also updates the global advance/decline scores:
//   ALL_ADVANCE_DECLINE_SCORE, NIFTY_50_ADVANCE_DECLINE_SCORE, NIFTY_BANK_ADVANCE_DECLINE_SCORE
//   +1 if ASO count > BSO count, −1 if BSO > ASO, 0 if equal
//
// Charts rendered with c3.js as grouped bar charts per timestamp (one bar per refresh cycle).
// Data is appended to existing series so historical advance/decline ratio is visible.
async function showAdvacenDeclineScanner() {
    let scriptData = generateTrends()

    let adVanceDeclineColumns = []
    let advanceSeries = ['Advance']
    let declineSeries = ["Decline"]

    let adVanceDeclineColumnsNifty = []
    let advanceSeriesNifty = ['Advance']
    let declineSeriesNifty = ["Decline"]

    let adVanceDeclineColumnsNiftyBank = []
    let advanceSeriesNiftyBank = ['Advance']
    let declineSeriesNiftyBank = ["Decline"]

    let categoryList = [];

    let advanceMap = {};
    let declineMap = {};

    let advanceMapNifty = {};
    let declineMapNifty = {};

    let advanceMapBank = {};
    let declineMapBank = {};

    let allAdvances = 0;
    let allDeclines = 0;
    let all = 0;
    let allNiftyAdvances = 0;
    let allNiftyDeclines = 0;
    let allNifty = 0;
    let allBankAdvances = 0;
    let allBankDeclines = 0;
    let allBank = 0;

    let x = ['x'];

    // Reset per-interval history maps before the stock loop
    GTB_AD_INTERVAL_HISTORY = [];
    GTB_COMPONENT_CLOSE_MAP = {};

    let activeScanList = getActiveScanList();
    for (let i = 0; i < activeScanList.length; i++) {
        console.log("Processing " + activeScanList[i]);
        try {
            let asoPrice = parseFloat(scriptData[activeScanList[i]]['strikeData']['ustrikeOne']);
            let bsoPrice = parseFloat(scriptData[activeScanList[i]]['strikeData']['bstrikeOne']);
            _gtbProgress('A/D: ' + activeScanList[i] + ' (' + (i+1) + '/' + activeScanList.length + ')');

            let data = await getHistoricalDataUsingPromise(INSTRUMENT_TOKENS[activeScanList[i]], _gtbCurrDay(), _gtbCurrDayTo(), '5minute');
            let volume = 0;
            jQ.each(_gtbTrimCandles(data.data.candles), function (index, item) {
                let time = moment(item[0]).format("HH:mm");
                if (i == 0) {
                    let map = {}
                    map.label = time;
                    categoryList.push(map)
                    x.push(moment(item[0]).format("YYYY-MM-DD HH:mm:ss"))

                    advanceMap[time] = {}
                    advanceMap[time]['SYMBOL'] = []
                    advanceMap[time]['COUNT'] = 0

                    declineMap[time] = {}
                    declineMap[time]['SYMBOL'] = []
                    declineMap[time]['COUNT'] = 0

                    advanceMapNifty[time] = {}
                    advanceMapNifty[time]['SYMBOL'] = []
                    advanceMapNifty[time]['COUNT'] = 0

                    declineMapNifty[time] = {}
                    declineMapNifty[time]['SYMBOL'] = []
                    declineMapNifty[time]['COUNT'] = 0

                    advanceMapBank[time] = {}
                    advanceMapBank[time]['SYMBOL'] = []
                    advanceMapBank[time]['COUNT'] = 0

                    declineMapBank[time] = {}
                    declineMapBank[time]['SYMBOL'] = []
                    declineMapBank[time]['COUNT'] = 0
                }

                volume += item[5];
                all = all + activeScanList.length;
                allNifty = allNifty + NIFTY_50_LIST.length;
                allBank = allBank + NIFTY_BANK_LIST.length;
            });

            scriptsVolumeMap[activeScanList[i]] = volume;

            // Capture candle close for weighted component stocks (for per-interval component score)
            var _name = activeScanList[i];
            if (NIFTY_50_WEIGHTED_STOCKS[_name] !== undefined || NIFTY_BANK_WEIGHTED_STOCKS[_name] !== undefined) {
                if (!GTB_COMPONENT_CLOSE_MAP[_name]) GTB_COMPONENT_CLOSE_MAP[_name] = {};
                jQ.each(_gtbTrimCandles(data.data.candles), function (index, item) {
                    var t = moment(item[0]).format("HH:mm");
                    GTB_COMPONENT_CLOSE_MAP[_name][t] = parseFloat(item[4]); // candle close
                });
            }

            jQ.each(data.data.candles, function (index, item) {
                let time = moment(item[0]).format("HH:mm");
                if (advanceMap[time]) {
                    if (item[4] > asoPrice) {
                        advanceMap[time]['SYMBOL'].push(activeScanList[i])
                        advanceMap[time]['COUNT'] = advanceMap[time]['COUNT'] + 1
                        allAdvances++;

                        if (jQ.inArray(activeScanList[i], NIFTY_50_LIST) != -1) {
                            advanceMapNifty[time]['SYMBOL'].push(activeScanList[i])
                            advanceMapNifty[time]['COUNT'] = advanceMapNifty[time]['COUNT'] + 1
                            allNiftyAdvances++;
                        }

                        if (jQ.inArray(activeScanList[i], NIFTY_BANK_LIST) != -1) {
                            advanceMapBank[time]['SYMBOL'].push(activeScanList[i])
                            advanceMapBank[time]['COUNT'] = advanceMapBank[time]['COUNT'] + 1
                            allBankAdvances++;
                        }
                    }
                }

                if (declineMap[time]) {
                    if (item[4] < bsoPrice) {
                        declineMap[time]['SYMBOL'].push(activeScanList[i])
                        declineMap[time]['COUNT'] = declineMap[time]['COUNT'] + 1
                        allDeclines++;

                        if (jQ.inArray(activeScanList[i], NIFTY_50_LIST) != -1) {
                            declineMapNifty[time]['SYMBOL'].push(activeScanList[i])
                            declineMapNifty[time]['COUNT'] = declineMapNifty[time]['COUNT'] + 1
                            allNiftyDeclines++
                        }

                        if (jQ.inArray(activeScanList[i], NIFTY_BANK_LIST) != -1) {
                            declineMapBank[time]['SYMBOL'].push(activeScanList[i])
                            declineMapBank[time]['COUNT'] = declineMapBank[time]['COUNT'] + 1
                            allBankDeclines++
                        }
                    }
                }
            });
        } catch (e) {
            console.log("Error in processing " + activeScanList[i])
        }


    };

    jQ.each(advanceMap, function (aindex, aitem) {
        advanceSeries.push(aitem['COUNT'])
    });

    jQ.each(declineMap, function (dindex, ditem) {
        declineSeries.push(ditem['COUNT']);
    });

    adVanceDeclineColumns.push(x);
    adVanceDeclineColumns.push(advanceSeries);
    adVanceDeclineColumns.push(declineSeries);

    jQ.each(advanceMapNifty, function (aindex, aitem) {
        advanceSeriesNifty.push(aitem['COUNT'])
    });

    jQ.each(declineMapNifty, function (dindex, ditem) {
        declineSeriesNifty.push(ditem['COUNT']);
    });

    adVanceDeclineColumnsNifty.push(x);
    adVanceDeclineColumnsNifty.push(advanceSeriesNifty);
    adVanceDeclineColumnsNifty.push(declineSeriesNifty);

    jQ.each(advanceMapBank, function (aindex, aitem) {
        advanceSeriesNiftyBank.push(aitem['COUNT'])
    });

    jQ.each(declineMapBank, function (dindex, ditem) {
        advanceSeriesNiftyBank.push(ditem['COUNT']);
    });

    adVanceDeclineColumnsNiftyBank.push(x);
    adVanceDeclineColumnsNiftyBank.push(advanceSeriesNiftyBank);
    adVanceDeclineColumnsNiftyBank.push(declineSeriesNiftyBank);

    // ── Save per-interval A/D snapshot for score history table ───────────────
    // Cumulative: same logic as allAdvances/allDeclines globals — accumulate across
    // all candles up to each time slot so the score at time T matches what the score
    // panel would show if the refresh had been done at time T.
    var _cumNAdv = 0, _cumNDec = 0, _cumBnAdv = 0, _cumBnDec = 0, _cumAAdv = 0, _cumADec = 0;
    x.forEach(function(ts) {
        if (ts === 'x') return;
        var t = moment(ts).format('HH:mm');
        _cumNAdv  += (advanceMapNifty[t] || {}).COUNT || 0;
        _cumNDec  += (declineMapNifty[t] || {}).COUNT || 0;
        _cumBnAdv += (advanceMapBank[t]  || {}).COUNT || 0;
        _cumBnDec += (declineMapBank[t]  || {}).COUNT || 0;
        _cumAAdv  += (advanceMap[t]      || {}).COUNT || 0;
        _cumADec  += (declineMap[t]      || {}).COUNT || 0;
        GTB_AD_INTERVAL_HISTORY.push({
            time: t,
            nAdv: _cumNAdv, nDec: _cumNDec,
            bnAdv: _cumBnAdv, bnDec: _cumBnDec,
            allAdv: _cumAAdv, allDec: _cumADec
        });
    });
    // Futures trend per-interval is merged into GTB_AD_INTERVAL_HISTORY
    // inline at the end of showFuturesTrend() — which must run after this.

    // Normalize to ratio: (advances - declines) / total, range -1 to +1
    // Gives proportional signal: 45/50 advancing = +0.8, not just +1
    let allTotal = allAdvances + allDeclines;
    ALL_ADVANCE_DECLINE_SCORE = allTotal > 0
        ? parseFloat(((allAdvances - allDeclines) / allTotal).toFixed(2)) : 0;

    let niftyTotal = allNiftyAdvances + allNiftyDeclines;
    NIFTY_50_ADVANCE_DECLINE_SCORE = niftyTotal > 0
        ? parseFloat(((allNiftyAdvances - allNiftyDeclines) / niftyTotal).toFixed(2)) : 0;

    let bankTotal = allBankAdvances + allBankDeclines;
    NIFTY_BANK_ADVANCE_DECLINE_SCORE = bankTotal > 0
        ? parseFloat(((allBankAdvances - allBankDeclines) / bankTotal).toFixed(2)) : 0;

    jQ("#all-advance-decline-adr").html("ADR:" + ((allAdvances / allDeclines).toFixed(2)) + "|A:" + allAdvances + "|D:" + allDeclines);

    function _adCols(cols) {
        // cols = [[x,t1,t2,...],[Advance,v1,v2,...],[Decline,v1,v2,...]]
        let xCol = cols.find(function(c) { return c[0] === 'x'; }) || [];
        let adv  = cols.find(function(c) { return c[0] === 'Advance'; }) || ['Advance'];
        let dec  = cols.find(function(c) { return c[0] === 'Decline'; }) || ['Decline'];
        return { labels: xCol.slice(1), adv: adv.slice(1), dec: dec.slice(1) };
    }
    let ad = _adCols(adVanceDeclineColumns);
    _renderBarChart('#advance-decline-trend', {
        labels: ad.labels, timeFormat: true, stacked: true, height: 80, showXLabels: false,
        series: [{ label: 'Advance', color: '#3fb950', values: ad.adv }, { label: 'Decline', color: '#f85149', values: ad.dec }],
    });

    jQ("#NIFTY-BANK-advance-decline-adr").html("ADR:" + ((allBankAdvances / allBankDeclines).toFixed(2)) + "|A:" + allBankAdvances + "|D: " + allBankDeclines);

    // ── Score panel A/D display — one count per stock using current LTP ─────────
    (function() {
        try {
            var ltpPrices   = JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}');
            var openDetails = JSON.parse(localStorage.getItem('INSTRUMENT_LIST_GLOBAL') || '{}');

            function _countAD(list) {
                var adv = 0, dec = 0;
                for (var i = 0; i < list.length; i++) {
                    var sym = list[i];
                    var ltp = ltpPrices[sym] && ltpPrices[sym].ltp ? parseFloat(ltpPrices[sym].ltp) : null;
                    if (!ltp || !openDetails[sym]) continue;
                    var open = parseFloat(openDetails[sym].price);
                    if (!open) continue;
                    var sd = getStrikeDetails({ price: open }, sym);
                    var aso = parseFloat(sd.ustrikeOne);
                    var bso = parseFloat(sd.bstrikeOne);
                    if (ltp >= aso) adv++;
                    else if (ltp <= bso) dec++;
                }
                return { adv: adv, dec: dec, total: list.length };
            }

            function _adrHtml(label, r) {
                var ratio = r.dec > 0 ? (r.adv / r.dec).toFixed(2) : r.adv > 0 ? '∞' : '—';
                var net = r.adv - r.dec;
                var netColor = net > 0 ? '#3fb950' : net < 0 ? '#f85149' : '#7d8590';
                var neutral = r.total - r.adv - r.dec;
                return '<span style="color:#7d8590;margin-right:3px;">' + label + '</span>'
                     + '<span style="color:#3fb950;font-weight:700;">A:' + r.adv + '</span>'
                     + '<span style="color:#7d8590;margin:0 2px;">/</span>'
                     + '<span style="color:#f85149;font-weight:700;">D:' + r.dec + '</span>'
                     + '<span style="color:#7d8590;margin-left:2px;">N:' + neutral + '</span>'
                     + '<span style="color:' + netColor + ';font-weight:800;margin-left:4px;">(' + (net > 0 ? '+' : '') + net + ')</span>'
                     + '<span style="color:#58a6ff;font-weight:700;margin-left:4px;">' + ratio + '</span>';
            }

            jQ('#gtb-adr-n50').html(_adrHtml('N50', _countAD(NIFTY_50_LIST)));
            jQ('#gtb-adr-bn').html(_adrHtml('BN',  _countAD(NIFTY_BANK_LIST)));
        } catch(e) {}
    })();
    let adBN = _adCols(adVanceDeclineColumnsNiftyBank);
    _renderBarChart('#NIFTY-BANK-advance-decline', {
        labels: adBN.labels, timeFormat: true, stacked: true, height: 80, showXLabels: false,
        series: [{ label: 'Advance', color: '#3fb950', values: adBN.adv }, { label: 'Decline', color: '#f85149', values: adBN.dec }],
    });

    jQ("#NIFTY-50-advance-decline-adr").html("ADR:" + ((allNiftyAdvances / allNiftyDeclines).toFixed(2)) + " |A:" + allNiftyAdvances + " |D:" + allNiftyDeclines);
    let adN50 = _adCols(adVanceDeclineColumnsNifty);
    _renderBarChart('#NIFTY-50-advance-decline', {
        labels: adN50.labels, timeFormat: true, stacked: true, height: 80, showXLabels: false,
        series: [{ label: 'Advance', color: '#3fb950', values: adN50.adv }, { label: 'Decline', color: '#f85149', values: adN50.dec }],
    });



}

// ── Futures Trend Scanner ─────────────────────────────────────────────────────
// Iterates FUTURE_INTRUMENT_LIST and fetches OI + price change for every instrument.
// Classifies each into: LONG / SHORT / SHORT_COVERING / LONG_UNWINDING /
//   BULLS_CONSOLIDATING / BEARS_CONSOLIDATING / GAMBLING_BUY_NEWS_AND_EVENTS
//
// Classification rules (futures remark logic):
//   Price↑ + OI↑         → LONG            (fresh longs entering = bullish)
//   Price↓ + OI↓         → SHORT_COVERING  (shorts closing out = temporarily bullish)
//   Price↓ + OI↑         → SHORT           (fresh shorts = bearish)
//   Price↑ + OI↓         → LONG_UNWINDING  (longs exiting on rise = bearish)
//   OI stable + Price↑   → BULLS_CONSOLIDATING
//   OI stable + Price↓   → BEARS_CONSOLIDATING
//
// Updates:
//   globalFuturesTrend[name] — cached for use in component score and setFutureDetails
//   INSTRUMENT_SCORE_MAP[name].futures_trend — getFuturesTrendScore(remark) +1/0/-1
//   ALL/NIFTY_50/NIFTY_BANK_FUTURES_TREND_SCORE — aggregate score of LONG vs SHORT counts
async function showFuturesTrend() {

    let LONGSeries = ['Long']
    let SHOT_COVERINGSeries = ['Short Covering']
    let GAMBLING_BUY_NEWS_AND_EVENTSSeries = ['Gambling! Buy News And Events']
    let SHORTSSeries = ['Short']
    let LONG_UNWINDINGSeries = ['Long Unwinding']
    let BEARS_COMING_SELL_ON_RISESeries = ['Bears Coming,Sell On Rise']
    let CAUTION_WRITES_ERODING_PREMIUMSeries = ['Caution! Writers Eroding Premium']
    let DEFENCE_BUY_ON_DECLINESeries = ['Defence,Buy On Decline']
    let BULLSSeries = ['Bulls']
    let BEARSSeries = ['Bears']
    let allFuturesSeries = []


    let NiftyLONGSeries = ["Long"]
    let NiftySHOT_COVERINGSeries = ['Short Covering']
    let NiftyGAMBLING_BUY_NEWS_AND_EVENTSSeries = ['Gambling! Buy News And Events']
    let NiftySHORTSSeries = ['Short']
    let NiftyLONG_UNWINDINGSeries = ['Long Unwinding']
    let NiftyBEARS_COMING_SELL_ON_RISESeries = ['Bears Coming,Sell On Rise']
    let NiftyCAUTION_WRITES_ERODING_PREMIUMSeries = ['Caution! Writers Eroding Premium']
    let NiftyDEFENCE_BUY_ON_DECLINESeries = ['Defence,Buy On Decline']
    let NiftyBULLSSeries = ['Bulls']
    let NiftyBEARSSeries = ['Bears']
    let allNiftyFuturesSeries = []


    let NiftyBankLONGSeries = ["Long"]
    let NiftyBankSHOT_COVERINGSeries = ['Short Covering']
    let NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSSeries = ['Gambling! Buy News And Events']
    let NiftyBankSHORTSSeries = ['Short']
    let NiftyBankLONG_UNWINDINGSeries = ['Long Unwinding']
    let NiftyBankBEARS_COMING_SELL_ON_RISESeries = ['Bears Coming,Sell On Rise']
    let NiftyBankCAUTION_WRITES_ERODING_PREMIUMSeries = ['Caution! Writers Eroding Premium']
    let NiftyBankDEFENCE_BUY_ON_DECLINESeries = ['Defence,Buy On Decline']
    let NiftyBankBULLSSeries = ['Bulls']
    let NiftyBankBEARSSeries = ['Bears']
    let allNiftyBankFuturesSeries = []


    let LONGMap = {}
    let SHOT_COVERINGMap = {}
    let GAMBLING_BUY_NEWS_AND_EVENTSMap = {}
    let SHORTSMap = {}
    let LONG_UNWINDINGMap = {}
    let BEARS_COMING_SELL_ON_RISEMap = {}
    let CAUTION_WRITES_ERODING_PREMIUMMap = {}
    let DEFENCE_BUY_ON_DECLINEMap = {}
    let BULLSMap = {}
    let BEARSMap = {}


    let NiftyLONGMap = {}
    let NiftySHOT_COVERINGMap = {}
    let NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap = {}
    let NiftySHORTSMap = {}
    let NiftyLONG_UNWINDINGMap = {}
    let NiftyBEARS_COMING_SELL_ON_RISEMap = {}
    let NiftyCAUTION_WRITES_ERODING_PREMIUMMap = {}
    let NiftyDEFENCE_BUY_ON_DECLINEMap = {}
    let NiftyBULLSMap = {}
    let NiftyBEARSMap = {}


    let NiftyBankLONGMap = {}
    let NiftyBankSHOT_COVERINGMap = {}
    let NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap = {}
    let NiftyBankSHORTSMap = {}
    let NiftyBankLONG_UNWINDINGMap = {}
    let NiftyBankBEARS_COMING_SELL_ON_RISEMap = {}
    let NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap = {}
    let NiftyBankDEFENCE_BUY_ON_DECLINEMap = {}
    let NiftyBankBULLSMap = {}
    let NiftyBankBEARSMap = {}

    let categoryList = [];
    // Use weighted-only list when the flag is enabled, otherwise full FO_LIST
    // Exclude MCX instruments — they use showFutureDetailsMCX, not NSE futures data
    let mcxNames = new Set(COMMODITIES_FUTURE_INSTRUMENT_LIST.map(function(f) { return f.name; }));
    let allList = [...getActiveScanList(), "NIFTY 50", "NIFTY BANK"].filter(function(n) { return !mcxNames.has(n); });

    let allFuturesAdvances = 0;
    let allFuturesDeclines = 0;

    let allNiftyFuturesAdvances = 0;
    let allNiftyFuturesDeclines = 0;
    let allNiftyBankFuturesAdvances = 0;
    let allNiftyBankFuturesDeclines = 0;

    let x = ['x'];


    for (let i = 0; i < allList.length; i++) {
        let name = allList[i];
        _gtbProgress('Futures: ' + allList[i] + ' (' + (i+1) + '/' + allList.length + ')');
        jQ.each(FUTURE_INTRUMENT_LIST, function (index, item) {
            let instName = name
            if (instName == "NIFTY 50") {
                instName = 'NIFTY'
            }

            if (instName == "NIFTY BANK") {
                instName = 'BANKNIFTY'
            }

            if (item.name == instName) {
                futures = item;
            }
        })
        try {

            let pres = await getHistoricalDataUsingPromise(futures['instrument_token'], _gtbPrevDay(), _gtbPrevDay(), 'day');
            let cres = await getHistoricalDataUsingPromise(futures['instrument_token'], _gtbCurrDay(), _gtbCurrDayTo(), '5minute');
            let prevData = []
            jQ.each(pres.data.candles, function (index, item) {
                let map = {}
                map['date'] = moment(item[0]).format("HH:mm")
                map.open = item[1]
                map.high = item[2]
                map.low = item[3]
                map.close = item[4]
                map.volume = item[5]
                map.oi = item[6]
                prevData.push(map);
            });
            prevData = prevData[prevData.length - 1];
            let data = []
            jQ.each(_gtbTrimCandles(cres.data.candles), function (index, item) {
                let time = moment(item[0]).format("HH:mm");
                if (i == 0) {
                    let map = {}
                    map.label = time;
                    categoryList.push(map)
                    x.push(moment(item[0]).format("YYYY-MM-DD HH:mm:ss"))

                    LONGMap[time] = {}
                    LONGMap[time]['SYMBOL'] = []
                    LONGMap[time]['COUNT'] = 0

                    SHOT_COVERINGMap[time] = {}
                    SHOT_COVERINGMap[time]['SYMBOL'] = []
                    SHOT_COVERINGMap[time]['COUNT'] = 0

                    GAMBLING_BUY_NEWS_AND_EVENTSMap[time] = {}
                    GAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'] = []
                    GAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] = 0

                    SHORTSMap[time] = {}
                    SHORTSMap[time]['SYMBOL'] = []
                    SHORTSMap[time]['COUNT'] = 0

                    LONG_UNWINDINGMap[time] = {}
                    LONG_UNWINDINGMap[time]['SYMBOL'] = []
                    LONG_UNWINDINGMap[time]['COUNT'] = 0

                    BEARS_COMING_SELL_ON_RISEMap[time] = {}
                    BEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'] = []
                    BEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] = 0

                    CAUTION_WRITES_ERODING_PREMIUMMap[time] = {}
                    CAUTION_WRITES_ERODING_PREMIUMMap[time]['SYMBOL'] = []
                    CAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] = 0

                    DEFENCE_BUY_ON_DECLINEMap[time] = {}
                    DEFENCE_BUY_ON_DECLINEMap[time]['SYMBOL'] = []
                    DEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] = 0

                    BULLSMap[time] = {}
                    BULLSMap[time]['SYMBOL'] = []
                    BULLSMap[time]['COUNT'] = 0

                    BEARSMap[time] = {}
                    BEARSMap[time]['SYMBOL'] = []
                    BEARSMap[time]['COUNT'] = 0



                    NiftyLONGMap[time] = {}
                    NiftyLONGMap[time]['SYMBOL'] = []
                    NiftyLONGMap[time]['COUNT'] = 0

                    NiftySHOT_COVERINGMap[time] = {}
                    NiftySHOT_COVERINGMap[time]['SYMBOL'] = []
                    NiftySHOT_COVERINGMap[time]['COUNT'] = 0

                    NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time] = {}
                    NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'] = []
                    NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] = 0

                    NiftySHORTSMap[time] = {}
                    NiftySHORTSMap[time]['SYMBOL'] = []
                    NiftySHORTSMap[time]['COUNT'] = 0

                    NiftyLONG_UNWINDINGMap[time] = {}
                    NiftyLONG_UNWINDINGMap[time]['SYMBOL'] = []
                    NiftyLONG_UNWINDINGMap[time]['COUNT'] = 0

                    NiftyBEARS_COMING_SELL_ON_RISEMap[time] = {}
                    NiftyBEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'] = []
                    NiftyBEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] = 0

                    NiftyCAUTION_WRITES_ERODING_PREMIUMMap[time] = {}
                    NiftyCAUTION_WRITES_ERODING_PREMIUMMap[time]['SYMBOL'] = []
                    NiftyCAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] = 0

                    NiftyDEFENCE_BUY_ON_DECLINEMap[time] = {}
                    NiftyDEFENCE_BUY_ON_DECLINEMap[time]['SYMBOL'] = []
                    NiftyDEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] = 0

                    NiftyBULLSMap[time] = {}
                    NiftyBULLSMap[time]['SYMBOL'] = []
                    NiftyBULLSMap[time]['COUNT'] = 0

                    NiftyBEARSMap[time] = {}
                    NiftyBEARSMap[time]['SYMBOL'] = []
                    NiftyBEARSMap[time]['COUNT'] = 0



                    NiftyBankLONGMap[time] = {}
                    NiftyBankLONGMap[time]['SYMBOL'] = []
                    NiftyBankLONGMap[time]['COUNT'] = 0

                    NiftyBankSHOT_COVERINGMap[time] = {}
                    NiftyBankSHOT_COVERINGMap[time]['SYMBOL'] = []
                    NiftyBankSHOT_COVERINGMap[time]['COUNT'] = 0

                    NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time] = {}
                    NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'] = []
                    NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] = 0

                    NiftyBankSHORTSMap[time] = {}
                    NiftyBankSHORTSMap[time]['SYMBOL'] = []
                    NiftyBankSHORTSMap[time]['COUNT'] = 0

                    NiftyBankLONG_UNWINDINGMap[time] = {}
                    NiftyBankLONG_UNWINDINGMap[time]['SYMBOL'] = []
                    NiftyBankLONG_UNWINDINGMap[time]['COUNT'] = 0

                    NiftyBankBEARS_COMING_SELL_ON_RISEMap[time] = {}
                    NiftyBankBEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'] = []
                    NiftyBankBEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] = 0

                    NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap[time] = {}
                    NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap[time]['SYMBOL'] = []
                    NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] = 0

                    NiftyBankDEFENCE_BUY_ON_DECLINEMap[time] = {}
                    NiftyBankDEFENCE_BUY_ON_DECLINEMap[time]['SYMBOL'] = []
                    NiftyBankDEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] = 0

                    NiftyBankBULLSMap[time] = {}
                    NiftyBankBULLSMap[time]['SYMBOL'] = []
                    NiftyBankBULLSMap[time]['COUNT'] = 0

                    NiftyBankBEARSMap[time] = {}
                    NiftyBankBEARSMap[time]['SYMBOL'] = []
                    NiftyBankBEARSMap[time]['COUNT'] = 0
                }

                let map = {}
                map['date'] = time
                map.open = item[1]
                map.high = item[2]
                map.low = item[3]
                map.close = item[4]
                map.volume = item[5]
                map.oi = item[6]
                data.push(map);

            });

            jQ.each(data, function (index, item) {
                let time = item.date
                let resp = {};
                resp = showTableAiNiftyPrediction(item, prevData, futures['lot_size'])

                globalFuturesTrend[name] = resp;
                if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
                INSTRUMENT_SCORE_MAP[name].futures_trend = getFuturesTrendScore(resp['REMARK']);
                if (LONGMap[time]) {
                    if (resp['REMARK'] == "LONG") {
                        LONGMap[time]['SYMBOL'].push(name)
                        LONGMap[time]['COUNT'] = LONGMap[time]['COUNT'] + 1

                        if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                            NiftyLONGMap[time]['SYMBOL'].push(name)
                            NiftyLONGMap[time]['COUNT'] = NiftyLONGMap[time]['COUNT'] + 1
                        }

                        if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                            NiftyBankLONGMap[time]['SYMBOL'].push(name)
                            NiftyBankLONGMap[time]['COUNT'] = NiftyBankLONGMap[time]['COUNT'] + 1
                        }
                    }


                }
                if (SHORTSMap[time]) {
                    if (resp['REMARK'] == "SHORT") {
                        SHORTSMap[time]['SYMBOL'].push(name)
                        SHORTSMap[time]['COUNT'] = SHORTSMap[time]['COUNT'] + 1

                        if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                            NiftySHORTSMap[time]['SYMBOL'].push(name)
                            NiftySHORTSMap[time]['COUNT'] = NiftySHORTSMap[time]['COUNT'] + 1
                        }

                        if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                            NiftyBankSHORTSMap[time]['SYMBOL'].push(name)
                            NiftyBankSHORTSMap[time]['COUNT'] = NiftyBankSHORTSMap[time]['COUNT'] + 1
                        }
                    }
                }

                if (SHOT_COVERINGMap[time]) {
                    if (resp['REMARK'] == "SHOT_COVERING") {
                        SHOT_COVERINGMap[time]['SYMBOL'].push(name)
                        SHOT_COVERINGMap[time]['COUNT'] = SHOT_COVERINGMap[time]['COUNT'] + 1

                        if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                            NiftySHOT_COVERINGMap[time]['SYMBOL'].push(name)
                            NiftySHOT_COVERINGMap[time]['COUNT'] = NiftySHOT_COVERINGMap[time]['COUNT'] + 1
                        }

                        if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                            NiftyBankSHOT_COVERINGMap[time]['SYMBOL'].push(name)
                            NiftyBankSHOT_COVERINGMap[time]['COUNT'] = NiftyBankSHOT_COVERINGMap[time]['COUNT'] + 1
                        }
                    }
                }

                if (GAMBLING_BUY_NEWS_AND_EVENTSMap[time]) {
                    if (resp['REMARK'] == "GAMBLING_BUY_NEWS_AND_EVENTS") {
                        GAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'].push(name)
                        GAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] = GAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] + 1

                        if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                            NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'].push(name)
                            NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] = NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] + 1
                        }

                        if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                            NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'].push(name)
                            NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] = NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] + 1
                        }
                    }
                }
                if (LONG_UNWINDINGMap[time]) {
                    if (resp['REMARK'] == "LONG_UNWINDING") {
                        LONG_UNWINDINGMap[time]['SYMBOL'].push(name)
                        LONG_UNWINDINGMap[time]['COUNT'] = LONG_UNWINDINGMap[time]['COUNT'] + 1

                        if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                            NiftyLONG_UNWINDINGMap[time]['SYMBOL'].push(name)
                            NiftyLONG_UNWINDINGMap[time]['COUNT'] = NiftyLONG_UNWINDINGMap[time]['COUNT'] + 1
                        }

                        if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                            NiftyBankLONG_UNWINDINGMap[time]['SYMBOL'].push(name)
                            NiftyBankLONG_UNWINDINGMap[time]['COUNT'] = NiftyBankLONG_UNWINDINGMap[time]['COUNT'] + 1
                        }
                    }
                }

                if (BEARS_COMING_SELL_ON_RISEMap[time]) {
                    if (resp['REMARK'] == "BEARS_COMING_SELL_ON_RISE") {
                        BEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'].push(name)
                        BEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] = BEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] + 1

                        if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                            NiftyBEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'].push(name)
                            NiftyBEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] = NiftyBEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] + 1
                        }

                        if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                            NiftyBankBEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'].push(name)
                            NiftyBankBEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] = NiftyBankBEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] + 1
                        }
                    }
                }

                if (CAUTION_WRITES_ERODING_PREMIUMMap[time]) {
                    if (resp['REMARK'] == "CAUTION_WRITES_ERODING_PREMIUM") {
                        CAUTION_WRITES_ERODING_PREMIUMMap[time]['SYMBOL'].push(name)
                        CAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] = CAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] + 1

                        if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                            NiftyCAUTION_WRITES_ERODING_PREMIUMMap[time]['SYMBOL'].push(name)
                            NiftyCAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] = NiftyCAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] + 1
                        }

                        if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                            NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap[time]['SYMBOL'].push(name)
                            NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] = NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] + 1
                        }
                    }
                }
                if (DEFENCE_BUY_ON_DECLINEMap[time]) {
                    if (resp['REMARK'] == "DEFENCE_BUY_ON_DECLINE") {
                        DEFENCE_BUY_ON_DECLINEMap[time]['SYMBOL'].push(name)
                        DEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] = DEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] + 1

                        if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                            NiftyDEFENCE_BUY_ON_DECLINEMap[time]['SYMBOL'].push(name)
                            NiftyDEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] = NiftyDEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] + 1
                        }

                        if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                            NiftyBankDEFENCE_BUY_ON_DECLINEMap[time]['SYMBOL'].push(name)
                            NiftyBankDEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] = NiftyBankDEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] + 1
                        }
                    }
                }

                if (BULLSMap[time]) {
                    BULLSMap[time]['COUNT'] = LONGMap[time]['COUNT'] + SHOT_COVERINGMap[time]['COUNT'] + GAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT']
                    NiftyBULLSMap[time]['COUNT'] = NiftyLONGMap[time]['COUNT'] + NiftySHOT_COVERINGMap[time]['COUNT'] + NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT']
                    NiftyBankBULLSMap[time]['COUNT'] = NiftyBankLONGMap[time]['COUNT'] + NiftyBankSHOT_COVERINGMap[time]['COUNT'] + NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT']
                    allFuturesAdvances += BULLSMap[time]['COUNT']
                    allNiftyFuturesAdvances += NiftyBULLSMap[time]['COUNT']
                    allNiftyBankFuturesAdvances += NiftyBankBULLSMap[time]['COUNT']
                }

                if (BEARSMap[time]) {
                    BEARSMap[time]['COUNT'] = SHORTSMap[time]['COUNT'] + LONG_UNWINDINGMap[time]['COUNT'] + BEARS_COMING_SELL_ON_RISEMap[time]['COUNT']
                    NiftyBEARSMap[time]['COUNT'] = NiftySHORTSMap[time]['COUNT'] + NiftyLONG_UNWINDINGMap[time]['COUNT'] + NiftyBEARS_COMING_SELL_ON_RISEMap[time]['COUNT']
                    NiftyBankBEARSMap[time]['COUNT'] = NiftyBankSHORTSMap[time]['COUNT'] + NiftyBankLONG_UNWINDINGMap[time]['COUNT'] + NiftyBankBEARS_COMING_SELL_ON_RISEMap[time]['COUNT']
                    allFuturesDeclines += BEARSMap[time]['COUNT']
                    allNiftyFuturesDeclines += NiftyBEARSMap[time]['COUNT']
                    allNiftyBankFuturesDeclines += NiftyBankBEARSMap[time]['COUNT']
                }
            });
        } catch (e) {
            console.log(e)
        }
    }


    jQ.each(LONGMap, function (aindex, aitem) {
        LONGSeries.push(aitem['COUNT'])
    });

    jQ.each(SHORTSMap, function (aindex, aitem) {
        SHORTSSeries.push(aitem['COUNT'])
    });

    jQ.each(SHOT_COVERINGMap, function (aindex, aitem) {
        SHOT_COVERINGSeries.push(aitem['COUNT'])
    });

    jQ.each(GAMBLING_BUY_NEWS_AND_EVENTSMap, function (aindex, aitem) {
        GAMBLING_BUY_NEWS_AND_EVENTSSeries.push(aitem['COUNT'])
    });

    jQ.each(LONG_UNWINDINGMap, function (aindex, aitem) {
        LONG_UNWINDINGSeries.push(aitem['COUNT'])
    });


    jQ.each(BEARS_COMING_SELL_ON_RISEMap, function (aindex, aitem) {
        BEARS_COMING_SELL_ON_RISESeries.push(aitem['COUNT'])
    });

    jQ.each(CAUTION_WRITES_ERODING_PREMIUMMap, function (aindex, aitem) {
        CAUTION_WRITES_ERODING_PREMIUMSeries.push(aitem['COUNT'])
    });

    jQ.each(DEFENCE_BUY_ON_DECLINEMap, function (aindex, aitem) {
        DEFENCE_BUY_ON_DECLINESeries.push(aitem['COUNT'])
    });

    jQ.each(BULLSMap, function (aindex, aitem) {
        BULLSSeries.push(aitem['COUNT'])
    });

    jQ.each(BEARSMap, function (aindex, aitem) {
        BEARSSeries.push(aitem['COUNT'])
    });

    allFuturesSeries.push(x);
    allFuturesSeries.push(LONGSeries);
    allFuturesSeries.push(SHORTSSeries);
    allFuturesSeries.push(SHOT_COVERINGSeries);
    allFuturesSeries.push(GAMBLING_BUY_NEWS_AND_EVENTSSeries);
    allFuturesSeries.push(LONG_UNWINDINGSeries);
    allFuturesSeries.push(BEARS_COMING_SELL_ON_RISESeries);
    allFuturesSeries.push(CAUTION_WRITES_ERODING_PREMIUMSeries);
    allFuturesSeries.push(DEFENCE_BUY_ON_DECLINESeries);
    allFuturesSeries.push(BULLSSeries);
    allFuturesSeries.push(BEARSSeries);

    jQ.each(NiftyLONGMap, function (aindex, aitem) {
        NiftyLONGSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftySHORTSMap, function (aindex, aitem) {
        NiftySHORTSSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftySHOT_COVERINGMap, function (aindex, aitem) {
        NiftySHOT_COVERINGSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap, function (aindex, aitem) {
        NiftyGAMBLING_BUY_NEWS_AND_EVENTSSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyLONG_UNWINDINGMap, function (aindex, aitem) {
        NiftyLONG_UNWINDINGSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyBEARS_COMING_SELL_ON_RISEMap, function (aindex, aitem) {
        NiftyBEARS_COMING_SELL_ON_RISESeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyCAUTION_WRITES_ERODING_PREMIUMMap, function (aindex, aitem) {
        NiftyCAUTION_WRITES_ERODING_PREMIUMSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyDEFENCE_BUY_ON_DECLINEMap, function (aindex, aitem) {
        NiftyDEFENCE_BUY_ON_DECLINESeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyBULLSMap, function (aindex, aitem) {
        NiftyBULLSSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyBEARSMap, function (aindex, aitem) {
        NiftyBEARSSeries.push(aitem['COUNT'])
    });

    allNiftyFuturesSeries.push(x);
    allNiftyFuturesSeries.push(NiftyLONGSeries);
    allNiftyFuturesSeries.push(NiftySHORTSSeries);
    allNiftyFuturesSeries.push(NiftySHOT_COVERINGSeries);
    allNiftyFuturesSeries.push(NiftyGAMBLING_BUY_NEWS_AND_EVENTSSeries);
    allNiftyFuturesSeries.push(NiftyLONG_UNWINDINGSeries);
    allNiftyFuturesSeries.push(NiftyBEARS_COMING_SELL_ON_RISESeries);
    allNiftyFuturesSeries.push(NiftyCAUTION_WRITES_ERODING_PREMIUMSeries);
    allNiftyFuturesSeries.push(NiftyDEFENCE_BUY_ON_DECLINESeries);
    allNiftyFuturesSeries.push(NiftyBULLSSeries);
    allNiftyFuturesSeries.push(NiftyBEARSSeries);

    jQ.each(NiftyBankLONGMap, function (aindex, aitem) {
        NiftyBankLONGSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyBankSHORTSMap, function (aindex, aitem) {
        NiftyBankSHORTSSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyBankSHOT_COVERINGMap, function (aindex, aitem) {
        NiftyBankSHOT_COVERINGSeries.push(aitem['COUNT'])
    });


    jQ.each(NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap, function (aindex, aitem) {
        NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSSeries.push(aitem['COUNT'])
    });


    jQ.each(NiftyBankLONG_UNWINDINGMap, function (aindex, aitem) {
        NiftyBankLONG_UNWINDINGSeries.push(aitem['COUNT'])
    });


    jQ.each(NiftyBankBEARS_COMING_SELL_ON_RISEMap, function (aindex, aitem) {
        NiftyBankBEARS_COMING_SELL_ON_RISESeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap, function (aindex, aitem) {
        NiftyBankCAUTION_WRITES_ERODING_PREMIUMSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyBankDEFENCE_BUY_ON_DECLINEMap, function (aindex, aitem) {
        NiftyBankDEFENCE_BUY_ON_DECLINESeries.push(aitem['COUNT'])
    });


    jQ.each(NiftyBankBULLSMap, function (aindex, aitem) {
        NiftyBankBULLSSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyBankBEARSMap, function (aindex, aitem) {
        NiftyBankBEARSSeries.push(aitem['COUNT'])
    });

    allNiftyBankFuturesSeries.push(x);
    allNiftyBankFuturesSeries.push(NiftyBankLONGSeries);
    allNiftyBankFuturesSeries.push(NiftyBankSHORTSSeries);
    allNiftyBankFuturesSeries.push(NiftyBankSHOT_COVERINGSeries);
    allNiftyBankFuturesSeries.push(NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSSeries);
    allNiftyBankFuturesSeries.push(NiftyBankLONG_UNWINDINGSeries);
    allNiftyBankFuturesSeries.push(NiftyBankBEARS_COMING_SELL_ON_RISESeries);
    allNiftyBankFuturesSeries.push(NiftyBankCAUTION_WRITES_ERODING_PREMIUMSeries);
    allNiftyBankFuturesSeries.push(NiftyBankDEFENCE_BUY_ON_DECLINESeries);
    allNiftyBankFuturesSeries.push(NiftyBankBULLSSeries);
    allNiftyBankFuturesSeries.push(NiftyBankBEARSSeries);

    if (allFuturesAdvances > allFuturesDeclines) {
        ALL_FUTURES_TREND_SCORE = 1;
    } else if (allFuturesDeclines > allFuturesAdvances) {
        ALL_FUTURES_TREND_SCORE = -1;
    }

    if (allNiftyFuturesAdvances > allNiftyFuturesDeclines) {
        NIFTY_50_FUTURES_TREND_SCORE = 1;
    } else if (allNiftyFuturesDeclines > allNiftyFuturesAdvances) {
        NIFTY_50_FUTURES_TREND_SCORE = -1;
    }

    if (allNiftyBankFuturesAdvances > allNiftyBankFuturesDeclines) {
        NIFTY_BANK_FUTURES_TREND_SCORE = 1;
    } else if (allNiftyBankFuturesDeclines > allNiftyBankFuturesAdvances) {
        NIFTY_BANK_FUTURES_TREND_SCORE = -1;
    }


    jQ("#all-advance-decline-adr-future").html("ADR:" + ((allFuturesAdvances / allFuturesDeclines).toFixed(2)) + "|A:" + allFuturesAdvances + "|D:" + allFuturesDeclines);

    jQ("#NIFTY-50-advance-decline-adr-future").html("ADR:" + ((allNiftyFuturesAdvances / allNiftyFuturesDeclines).toFixed(2)) + "|A:" + allNiftyFuturesAdvances + "|D:" + allNiftyFuturesDeclines);

    jQ("#NIFTY-BANK-advance-decline-adr-future").html("ADR:" + ((allNiftyBankFuturesAdvances / allNiftyBankFuturesDeclines).toFixed(2)) + "|A:" + allNiftyBankFuturesAdvances + "|D:" + allNiftyBankFuturesDeclines);

    // ── Capture per-interval futures trend for score history ─────────────────
    // Cumulative bull/bear counts up to each time slot — same logic as the globals.
    var _cumFBull = 0, _cumFBear = 0;
    var _cumNFBull = 0, _cumNFBear = 0;
    var _cumBnFBull = 0, _cumBnFBear = 0;
    var _ftIntervals = {};
    x.forEach(function(ts) {
        if (ts === 'x') return;
        var t = moment(ts).format('HH:mm');
        _cumFBull   += (BULLSMap[t]         || {}).COUNT || 0;
        _cumFBear   += (BEARSMap[t]          || {}).COUNT || 0;
        _cumNFBull  += (NiftyBULLSMap[t]     || {}).COUNT || 0;
        _cumNFBear  += (NiftyBEARSMap[t]     || {}).COUNT || 0;
        _cumBnFBull += (NiftyBankBULLSMap[t] || {}).COUNT || 0;
        _cumBnFBear += (NiftyBankBEARSMap[t] || {}).COUNT || 0;
        _ftIntervals[t] = {
            allBull: _cumFBull,   allBear: _cumFBear,
            nBull:   _cumNFBull,  nBear:   _cumNFBear,
            bnBull:  _cumBnFBull, bnBear:  _cumBnFBear
        };
    });
    // Merge into GTB_AD_INTERVAL_HISTORY (A/D scanner runs before futures scanner)
    GTB_AD_INTERVAL_HISTORY.forEach(function(row) {
        var ft = _ftIntervals[row.time] || {};
        row.allFBull  = ft.allBull  || 0;  row.allFBear  = ft.allBear  || 0;
        row.nFBull    = ft.nBull    || 0;  row.nFBear    = ft.nBear    || 0;
        row.bnFBull   = ft.bnBull   || 0;  row.bnFBear   = ft.bnBear   || 0;
    });




    (function _renderFuturesAD(seriesData, containerId) {
        let BULLISH = ['Long', 'Short Covering', 'Gambling! Buy News And Events', 'Defence,Buy On Decline', 'Bulls'];
        let xCol = seriesData.find(function(c) { return c[0] === 'x'; }) || [];
        let labels = xCol.slice(1);
        let bullValues = new Array(labels.length).fill(0);
        let bearValues = new Array(labels.length).fill(0);
        seriesData.forEach(function(col) {
            if (col[0] === 'x') return;
            let isBull = BULLISH.indexOf(col[0]) !== -1;
            for (let i = 0; i < labels.length; i++) {
                let v = parseFloat(col[i + 1]) || 0;
                if (isBull) bullValues[i] += v;
                else bearValues[i] += Math.abs(v);
            }
        });
        _renderBarChart(containerId, {
            labels: labels, stacked: true, timeFormat: true, height: 80, showXLabels: false,
            series: [
                { label: 'Bulls', color: '#3fb950', values: bullValues },
                { label: 'Bears', color: '#f85149', values: bearValues }
            ]
        });
    })(allFuturesSeries, 'advance-decline-futures-trend');

    (function _renderFuturesAD(seriesData, containerId) {
        let BULLISH = ['Long', 'Short Covering', 'Gambling! Buy News And Events', 'Defence,Buy On Decline', 'Bulls'];
        let xCol = seriesData.find(function(c) { return c[0] === 'x'; }) || [];
        let labels = xCol.slice(1);
        let bullValues = new Array(labels.length).fill(0);
        let bearValues = new Array(labels.length).fill(0);
        seriesData.forEach(function(col) {
            if (col[0] === 'x') return;
            let isBull = BULLISH.indexOf(col[0]) !== -1;
            for (let i = 0; i < labels.length; i++) {
                let v = parseFloat(col[i + 1]) || 0;
                if (isBull) bullValues[i] += v;
                else bearValues[i] += Math.abs(v);
            }
        });
        _renderBarChart(containerId, {
            labels: labels, stacked: true, timeFormat: true, height: 80, showXLabels: false,
            series: [
                { label: 'Bulls', color: '#3fb950', values: bullValues },
                { label: 'Bears', color: '#f85149', values: bearValues }
            ]
        });
    })(allNiftyFuturesSeries, 'NIFTY-50-advance-decline-future');

    (function _renderFuturesAD(seriesData, containerId) {
        let BULLISH = ['Long', 'Short Covering', 'Gambling! Buy News And Events', 'Defence,Buy On Decline', 'Bulls'];
        let xCol = seriesData.find(function(c) { return c[0] === 'x'; }) || [];
        let labels = xCol.slice(1);
        let bullValues = new Array(labels.length).fill(0);
        let bearValues = new Array(labels.length).fill(0);
        seriesData.forEach(function(col) {
            if (col[0] === 'x') return;
            let isBull = BULLISH.indexOf(col[0]) !== -1;
            for (let i = 0; i < labels.length; i++) {
                let v = parseFloat(col[i + 1]) || 0;
                if (isBull) bullValues[i] += v;
                else bearValues[i] += Math.abs(v);
            }
        });
        _renderBarChart(containerId, {
            labels: labels, stacked: true, timeFormat: true, height: 80, showXLabels: false,
            series: [
                { label: 'Bulls', color: '#3fb950', values: bullValues },
                { label: 'Bears', color: '#f85149', values: bearValues }
            ]
        });
    })(allNiftyBankFuturesSeries, 'NIFTY-BANK-advance-decline-future');



}

function showStockList(list) {
    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));
    let instru = [];
    let scripts = []
    let checkInstr = []
    let scriptData = generateTrends()
    if (!scriptData) {
        return false;
    }
    jQ.each(INSTRUMENT_TOKENS, function (index, item) {
        if (jQ.inArray(index, checkInstr) === -1) {
            instru.push(index)
            checkInstr.push(index)
        }
    });

    for (let i = 0; i < instru.length; i++) {
        try {
            let name = instru[i];
            let obj = {}
            obj['TRADINGSYMBOL'] = name;
            obj['CLOSE'] = scriptData[name]['prevPrice'];
            obj['PRICE'] = scriptData[name]['price'];
            obj['PERC'] = scriptData[name]['change'];
            obj['TREND'] = scriptData[name]['trends'];

            obj['VOLUME'] = 0
            if (scriptsVolumeMap[name]) {
                obj['VOLUME'] = scriptsVolumeMap[name];
            }

            if (scriptData[name]['open_perc'] > 0) {
                obj['OPEN_PERC'] = '<span class="badge bg-success">' + scriptData[name]['open_perc'] + '</span>'
            } else if (scriptData[name]['open_perc'] < 0) {
                obj['OPEN_PERC'] = '<span class="badge bg-danger">' + scriptData[name]['open_perc'] + '</span>'
            } else {
                obj['OPEN_PERC'] = scriptData[name]['open_perc'];
            }

            let asoPrice = 0;
            let bsoPrice = 0;
            let astPrice = 0;
            let bstPrice = 0;
            asoPrice = parseFloat(scriptData[name]['strikeData']['ustrikeOne']);
            bsoPrice = parseFloat(scriptData[name]['strikeData']['bstrikeOne']);

            astPrice = parseFloat(scriptData[name]['strikeData']['ustrikeTwo']);
            bstPrice = parseFloat(scriptData[name]['strikeData']['bstrikeTwo']);

            let ltp = parseFloat(scriptData[name]['ltp']);
            if (ltp >= astPrice) {
                obj['LTP'] = '<span title="AST PRICE" class="badge bg-danger">' + ltp + '</span>'
            } else if (ltp >= asoPrice) {
                obj['LTP'] = '<span title="ASO PRICE" class="badge bg-warning">' + ltp + '</span>'
            } else if (ltp <= bstPrice) {
                obj['LTP'] = '<span title="BST PRICE" class="badge bg-success">' + ltp + '</span>'
            } else if (ltp <= bsoPrice) {
                obj['LTP'] = '<span title="BSO PRICE" class="badge bg-warning">' + ltp + '</span>'
            } else {
                obj['LTP'] = ltp
            }

            obj['STRIKEDATA'] = scriptData[name]['strikeData'];
            if (breakOutNineFifteen && breakOutNineFifteen[name]) {
                obj['CLOSE_9_15'] = breakOutNineFifteen[name]['CLOSE_9_15'];
            } else {
                obj['CLOSE_9_15'] = '';
            }
            let instrScore = computeInstrumentScore(name);
            let scoreBg = instrScore.total > 0 ? 'bg-success' : (instrScore.total < 0 ? 'bg-danger' : 'bg-secondary');
            obj['SCORE'] = '<span class="badge ' + scoreBg + '">' + instrScore.total + '</span>';

            obj['FUTURE_TREND'] = '';
            if (globalFuturesTrend && globalFuturesTrend[name]) {
                obj['FUTURE_TREND'] = globalFuturesTrend[name]['PLUS'] + ' ' + globalFuturesTrend[name]['MINUS'];

                if (name == "NIFTY 50") {
                    jQ("#futures-trend-nifty").html(globalFuturesTrend[name]['PLUS'] + ' ' + globalFuturesTrend[name]['MINUS']);
                }
                if (name == "NIFTY BANK") {
                    jQ("#futures-trend-nifty-bank").html(globalFuturesTrend[name]['PLUS'] + ' ' + globalFuturesTrend[name]['MINUS']);
                }
            }
            if (list.length != 0) {
                if (jQ.inArray(name, list) != -1) {
                    scripts.push(obj)
                }
            } else {
                scripts.push(obj)
            }
        } catch (e) {
            console.log(e)
        }
    }
    if (scripts.length > 0) {
        generateStockTable(scripts)
    }
}

function generateStockTable(data) {
    stockTable = jQ('#stock-list-table').DataTable({
        fixedColumns: {
            start: 1,
            end: 1
        },
        "processing": true,
        "order": [[1, 'asc']],
        "pageLength": 50,
        "bPaginate": false,
        "data": data,
        "scrollX": true,
        scrollCollapse: true,
        "bDestroy": true,
        "columnDefs": [
            {
                "targets": [],
                "visible": false,
                "searchable": false
            }
        ],

        dom: 'Bfrtip',
        buttons: [
            'excel'
        ],
        "columns": [
            {
                "data": "TRADINGSYMBOL",
                render: function (data, type, row, meta) {
                    if (type !== 'display') return data;
                    let html = ''
                    html += '<a target="_blank" href="https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/' + data + '/' + INSTRUMENT_TOKENS[data] + '">' + data + '</a>'
                    html += '<span class="badge bg-info" style="float:right;">'
                    html += '<a title="Sensibull Strategy Builder" target="_blank" href="https://web.sensibull.com/option-strategy-builder?instrument_symbol=' + data + '">SB</a>'
                    html += '</span>'
                    return html;
                }
            },
            { "data": "PRICE" },
            { "data": "OPEN_PERC" },
            { "data": "PERC" },
            {
                "data": "LTP",
                render: function (data, type, row, meta) {
                    if (type !== 'display') return parseFloat(data) || data;
                    return data;
                }
            },
            {
                "data": "SCORE",
                render: function (data, type, row, meta) {
                    if (type !== 'display') return parseFloat(jQ(data).text()) || 0;
                    return data;
                }
            },
            {
                "data": "CLOSE_9_15",
                render: function (data, type, row, meta) {
                    if (!data || data === '') return '';
                    let bg = (data === 'AST' || data === 'ASO') ? 'bg-success' : (data === 'BST' || data === 'BSO') ? 'bg-danger' : 'bg-secondary';
                    return '<span class="badge ' + bg + '">' + data + '</span>';
                }
            },
            {
                "data": "FUTURE_TREND",
                render: function (data, type, row, meta) {
                    if (type !== 'display') return data || '';
                    return data || '';
                }
            },
            { "data": "VOLUME" },
            { "data": "TREND" },
        ],
        "fnInitComplete": function (oSettings, json) {
            showExtraButtons()
        },
        "fnRowCallback": function (nRow, aData, iDisplayIndex, iDisplayIndexFull) {
        }
    });
}

function showExtraButtons() {
    let btns = jQ("#stock-list-table_wrapper .dt-buttons");
    // Separator
    btns.append('<span style="width:1px;height:18px;background:var(--gtb-border);display:inline-block;margin:0 3px;vertical-align:middle;"></span>');
    btns.append('<button data-trend="all"   class="dt-button trend-filter" type="button"><span><i class="bi bi-grid"></i> ALL</span></button>');
    btns.append('<button data-trend="index" class="dt-button trend-filter" type="button"><span><i class="bi bi-bar-chart-line"></i> INDEX</span></button>');
    btns.append('<button data-trend="aso"   class="dt-button trend-filter" type="button"><span><i class="bi bi-arrow-up-circle"></i> ASO</span></button>');
    btns.append('<button data-trend="bso"   class="dt-button trend-filter" type="button"><span><i class="bi bi-arrow-down-circle"></i> BSO</span></button>');
    btns.append('<button data-trend="n50"   class="dt-button trend-filter" type="button"><span>N50</span></button>');
    btns.append('<button data-trend="bank"  class="dt-button trend-filter" type="button"><span>BN</span></button>');
}

jQ(document).on("click", "#stock-list-table_wrapper .trend-filter", function (e) {
    let type = jQ(this).attr("data-trend");
    let list = [];
    let scriptData = generateTrends()
    jQ.each(INSTRUMENT_TOKENS, function (index, item) {
        let name = index
        let trends = scriptData[name]['trends']
        if (type == "aso") {
            if (jQ.inArray("ASO", trends) != -1) {
                list.push(name)
            }
        }

        if (type == "bso") {
            if (jQ.inArray("BSO", trends) != -1) {
                list.push(name)
            }
        }

        if (type == "n50") {
            if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                list.push(name)
            }
        }

        if (type == "bank") {
            if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                list.push(name)
            }
        }

        if (type == "index") {
            if (jQ.inArray(name, INDICES) != -1) {
                list.push(name)
            }
        }
    });
    showStockList(list)
});
