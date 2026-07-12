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
          + '<span style="font-size:0.58rem;font-weight:700;color:var(--gtb-muted);flex-shrink:0;">' + inst.label + '</span>'
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
            el.innerHTML = '<div style="color:var(--gtb-muted);font-size:0.58rem;padding:8px;">'
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
                    + '<span style="font-size:0.44rem;color:var(--gtb-muted);">' + fmt(rl.value) + '</span>'
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

// Per-card Max Pain / GEX button → maximize overlay for that instrument
jQ(document).on('click', '.mp-gex-btn', function(e) {
    e.stopPropagation();
    var name = jQ(this).data('name');
    showMaximizeOverlay(
        '<i class="bi bi-bar-chart-steps"></i> Max Pain &amp; GEX — ' + name,
        '<div style="padding:12px;overflow:auto;height:100%;">' + _gtbMaxPainGEXHtml(name, false) + '</div>'
    );
});

// Refresh compact Max Pain cards in all visible instrument rows
// ── AVWAP chips (identity strips) ─────────────────────────────────────────────
function _gtbRefreshAVWAPChips() {
    jQ('.gtb-avwap-chip').each(function() {
        var tid   = this.id.replace('-avwap', '');
        var $pane = jQ('#gtb-pane-' + tid);
        var name  = $pane.data('instr') || $pane.data('name') || tid.replace(/-/g, ' ');
        var sm    = INSTRUMENT_SCORE_MAP[name] || {};
        var avwap = sm.avwap;
        if (!avwap) { this.innerHTML = ''; return; }

        var ltp = 0;
        try { ltp = parseFloat((JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}')[name] || {}).ltp) || 0; } catch(e) {}
        if (!ltp) { this.innerHTML = ''; return; }

        var above           = ltp > avwap;
        var vwapDailyBull   = sm.vwapBullishDaily;  // true/false/null
        var conflict        = vwapDailyBull !== null && vwapDailyBull !== undefined && (above !== vwapDailyBull);
        var col   = above ? 'var(--gtb-green)' : 'var(--gtb-red)';
        var lbl   = above ? '▲ AVWAP' : '▼ AVWAP';
        var conflictNote = conflict
            ? ' ⚠ Daily VWAP ' + (vwapDailyBull ? 'BUY' : 'SELL') + ' vs Intraday AVWAP ' + (above ? '▲' : '▼') + ' — signals diverge; wait for alignment'
            : '';
        var tip   = 'AVWAP (9:15 anchor): ' + avwap.toFixed(1) + ' | LTP ' + (above ? 'above' : 'below') + ' — ' + (above ? 'Bullish bias' : 'Bearish bias') + conflictNote;
        var warnHtml = conflict
            ? '<span title="' + tip + '" style="font-size:0.44rem;color:var(--gtb-amber);margin-left:2px;cursor:default;">⚠</span>'
            : '';
        this.innerHTML = '<span title="' + tip + '" style="font-size:0.48rem;color:' + col + ';font-weight:700;white-space:nowrap;cursor:default;">' + lbl + '</span>' + warnHtml;
    });
}

// ── Now Trade card (left panel) ───────────────────────────────────────────────
function _gtbRenderNowTrade() {
    var el = document.getElementById('gtb-now-trade');
    if (!el) return;

    var sc = null;
    try { sc = computeInstrumentScore('NIFTY 50'); } catch(e) {}
    if (!sc) { el.innerHTML = '<div style="font-size:0.5rem;color:var(--gtb-muted);padding:8px;">Data not ready — wait for refresh.</div>'; return; }

    // LTP
    var ltp = 0;
    try { ltp = parseFloat((JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}')['NIFTY 50'] || {}).ltp) || 0; } catch(e) {}

    // AVWAP (anchored to 9:15 futures candle)
    var avwapVal = (INSTRUMENT_SCORE_MAP['NIFTY 50'] || {}).avwap || 0;
    var ltpAboveAVWAP = (avwapVal && ltp) ? (ltp > avwapVal) : null;

    // Strike levels
    var aso, ast, bso, bst, vixu, vixl;
    try {
        var sm = INSTRUMENT_SCORE_MAP['NIFTY 50'] || {};
        var openP = parseFloat(sm.open) || ltp;
        var sd = getStrikeDetails({ price: openP }, 'NIFTY 50');
        aso = parseFloat(sd.ustrikeOne); ast = parseFloat(sd.ustrikeTwo);
        bso = parseFloat(sd.bstrikeOne); bst = parseFloat(sd.bstrikeTwo);
        try {
            var vr = getVixRange('NIFTY 50', openP);
            vixu = parseFloat(vr.upper);
            vixl = parseFloat(vr.lower);
        } catch(ev) {}
    } catch(e) {}

    if (!aso || !bso) { el.innerHTML = '<div style="font-size:0.5rem;color:var(--gtb-muted);padding:8px;">Strike levels not ready — wait for chart refresh.</div>'; return; }

    // Direction from composite score + market signal
    var b9 = {};
    try { b9 = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}'); } catch(e) {}
    var _includeLagging = localStorage.getItem('GTB_INCLUDE_LAGGING') !== '0';
    var SCORE = ALL_9_15_CLOSE_SCORE + NIFTY_50_9_15_CLOSE_SCORE + NIFTY_BANK_9_15_CLOSE_SCORE +
        GIFT_NIFTY_9_15_CLOSE_SCORE + SENSEX_9_15_CLOSE_SCORE + RELIANCE_9_15_CLOSE_SCORE + HDFCBANK_9_15_CLOSE_SCORE +
        ALL_ADVANCE_DECLINE_SCORE + NIFTY_50_ADVANCE_DECLINE_SCORE + NIFTY_BANK_ADVANCE_DECLINE_SCORE +
        ALL_FUTURES_TREND_SCORE + NIFTY_50_FUTURES_TREND_SCORE + NIFTY_BANK_FUTURES_TREND_SCORE +
        (_includeLagging ? (NIFTY_50_OI_OBV_SCORE + NIFTY_BANK_OI_OBV_SCORE + RELIANCE_OI_OBV_SCORE + HDFCBANK_OI_OBV_SCORE + ICICIBANK_OI_OBV_SCORE +
            NIFTY_50_MAX_PAIN_SCORE + NIFTY_BANK_MAX_PAIN_SCORE + RELIANCE_MAX_PAIN_SCORE + HDFCBANK_MAX_PAIN_SCORE + ICICIBANK_MAX_PAIN_SCORE +
            NIFTY_50_IV_SKEW_SCORE + NIFTY_BANK_IV_SKEW_SCORE + RELIANCE_IV_SKEW_SCORE + HDFCBANK_IV_SKEW_SCORE + ICICIBANK_IV_SKEW_SCORE +
            NIFTY_50_COMPONENT_SCORE + NIFTY_BANK_COMPONENT_SCORE) : 0);
    var ms = null;
    try { ms = getMarketSignal(parseFloat(SCORE.toFixed(2)), b9); } catch(e) {}
    var sig = ms ? ms.signal : 'WAIT';

    var dir = (sig === 'BUY' || sig === 'STRONG BUY') ? 'LONG'
            : (sig === 'SELL' || sig === 'STRONG SELL') ? 'SHORT'
            : 'WAIT';

    // Confluence: how many of 6 sub-scores agree with direction
    var subs = [sc.nine_fifteen, sc.current_trend, sc.futures_trend, sc.oi_obv, sc.max_pain, sc.iv_skew];
    var bullC = subs.filter(function(v) { return v > 0; }).length;
    var bearC = subs.filter(function(v) { return v < 0; }).length;
    var confCount = dir === 'LONG' ? bullC : dir === 'SHORT' ? bearC : 0;
    var confCol   = confCount >= 4 ? 'var(--gtb-green)' : confCount >= 2 ? 'var(--gtb-amber)' : 'var(--gtb-red)';

    // Sub-score pills
    var _pill = function(lbl, val) {
        var c = val > 0 ? 'var(--gtb-green)' : val < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
        var sym = val > 0 ? '▲' : val < 0 ? '▼' : '—';
        return '<span style="display:inline-flex;align-items:center;gap:1px;font-size:0.42rem;padding:1px 4px;border:1px solid ' + c + '18;color:' + c + ';">' + lbl + ' ' + sym + '</span>';
    };
    var pills = [
        _pill('9:15', sc.nine_fifteen), _pill('Trend', sc.current_trend),
        _pill('Fut', sc.futures_trend),  _pill('OI', sc.oi_obv),
        _pill('MP', sc.max_pain),        _pill('IV', sc.iv_skew)
    ].join(' ');

    if (dir === 'WAIT') {
        el.innerHTML = '<div style="padding:6px 0;">'
            + '<div style="font-size:0.62rem;font-weight:800;color:var(--gtb-amber);margin-bottom:6px;"><i class="bi bi-hourglass-split"></i> WAIT — ' + (ms ? ms.reason : 'Signals not aligned') + '</div>'
            + '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px;">' + pills + '</div>'
            + '</div>';
        return;
    }

    var isLong     = dir === 'LONG';
    var dirCol     = isLong ? 'var(--gtb-green)' : 'var(--gtb-red)';
    var dirIcon    = isLong ? 'bi-arrow-up-circle-fill' : 'bi-arrow-down-circle-fill';
    var entryLvl   = isLong ? aso : bso;
    var slLvl      = isLong ? bso : aso;
    var tgt1Lvl    = isLong ? ast : bst;
    var tgt2Lvl    = isLong ? (vixu || ast) : (vixl || bst);
    var triggered  = ltp && (isLong ? ltp >= entryLvl : ltp <= entryLvl);
    var optLabel   = isLong ? (aso + ' CE') : (bso + ' PE');

    var trigHtml = triggered
        ? '<span style="font-size:0.46rem;font-weight:800;color:var(--gtb-green);padding:1px 5px;background:var(--gtb-green)18;border:1px solid var(--gtb-green);">✓ TRIGGERED</span>'
        : '<span style="font-size:0.46rem;color:var(--gtb-amber);padding:1px 5px;background:var(--gtb-amber)18;border:1px solid var(--gtb-amber);">⏳ WAITING</span>';

    var _lvl = function(label, val, col) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;border-bottom:1px solid var(--gtb-border);">'
            + '<span style="font-size:0.44rem;color:var(--gtb-muted);">' + label + '</span>'
            + '<span style="font-size:0.52rem;font-weight:800;font-family:var(--gtb-mono);color:' + (col||'var(--gtb-text)') + ';">' + (val || '—') + '</span>'
            + '</div>';
    };

    el.innerHTML =
        '<div style="padding:4px 0;">'
        + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'
        +   '<span style="font-size:0.75rem;font-weight:900;color:' + dirCol + ';"><i class="bi ' + dirIcon + '"></i> ' + (isLong ? 'LONG' : 'SHORT') + '</span>'
        +   '<span style="font-size:0.46rem;color:var(--gtb-muted);">NIFTY 50</span>'
        +   trigHtml
        +   '<span style="font-size:0.44rem;color:' + confCol + ';margin-left:auto;font-weight:800;">' + confCount + '/6 ✓</span>'
        + '</div>'
        + '<div style="margin-bottom:6px;">'
        + _lvl('Entry ' + (isLong ? '(above ASO)' : '(below BSO)'), entryLvl, dirCol)
        + _lvl('Stop Loss ' + (isLong ? '(BSO)' : '(ASO)'), slLvl, 'var(--gtb-red)')
        + _lvl('Target 1 ' + (isLong ? '(AST)' : '(BST)'), tgt1Lvl, dirCol)
        + _lvl('Target 2 ' + (isLong ? '(VIXU)' : '(VIXL)'), tgt2Lvl ? tgt2Lvl.toFixed(0) : '—', 'var(--gtb-accent)')
        + '</div>'
        + '<div style="font-size:0.46rem;color:var(--gtb-muted);margin-bottom:5px;">Option: <b style="color:' + dirCol + ';">Buy ' + optLabel + '</b></div>'
        + (avwapVal ? _lvl('AVWAP (9:15 fut)', avwapVal.toFixed(1) + (ltpAboveAVWAP !== null ? (ltpAboveAVWAP ? ' ▲' : ' ▼') : ''), ltpAboveAVWAP === null ? 'var(--gtb-muted)' : ltpAboveAVWAP ? 'var(--gtb-green)' : 'var(--gtb-red)') : '')
        + '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px;">' + pills + '</div>'
        + '</div>';
}

function _gtbRefreshMPCards() {
    jQ('.gtb-det-mp').each(function() {
        var tid  = this.id.replace('-mp-gex', '');
        var name = jQ('#gtb-pane-' + tid).data('instr') || tid.replace(/-/g, ' ');
        this.innerHTML = _gtbMaxPainGEXHtml(name, true);
    });
}

function _gtbFmtNetGEX(v) {
    var abs = Math.abs(v);
    var s = abs >= 1e9 ? (v / 1e9).toFixed(1) + 'B'
          : abs >= 1e6 ? (v / 1e6).toFixed(1) + 'M'
          : abs >= 1e3 ? (v / 1e3).toFixed(1) + 'K'
          : v.toFixed(1);
    return (v >= 0 ? '+' : '') + s;
}

function _gtbRefreshGEXChips() {
    jQ('.gtb-gex-chip').each(function() {
        var tid  = this.id.replace('-net-gex', '');
        var $pane = jQ('#gtb-pane-' + tid);
        var name  = $pane.data('instr') || $pane.data('name') || tid.replace(/-/g, ' ');
        var d     = _gtbComputeMaxPainGEX(name);
        if (!d) { this.innerHTML = ''; return; }
        var col  = d.netGEX > 0 ? 'var(--gtb-green)' : d.netGEX < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
        var lbl  = d.netGEX > 0 ? '↔' : d.netGEX < 0 ? '→' : '—';
        var tip  = 'Net GEX: ' + _gtbFmtNetGEX(d.netGEX) + (d.netGEX > 0 ? ' — Stabilising (mean-revert)' : ' — Trending (momentum)');
        this.innerHTML = '<span title="' + tip + '" style="font-size:0.48rem;color:' + col + ';font-weight:700;white-space:nowrap;cursor:default;">'
            + 'GEX ' + lbl + ' ' + _gtbFmtNetGEX(d.netGEX)
            + '</span>'
            + '<i class="bi bi-info-circle gtb-info-i" data-info="net-gex" title="What is Net GEX?" style="font-size:0.45rem;color:var(--gtb-muted);margin-left:2px;cursor:pointer;"></i>';
    });
}

function _gtbRefreshProbCards() {
    // Render trend probability gauge into each vertical instrument card
    jQ('.gtb-instr-card-v').each(function() {
        var name = jQ(this).data('instr');
        if (!name) return;
        var tid = name.replace(/ /g, '-').replace(/&/g, '-');
        var el  = document.getElementById(tid + '-prob');
        if (el) el.innerHTML = _cmdTrendProb(name, null);
    });
}

jQ(document).on('click', '.gtb-left-max-btn', function(e) {
    e.stopPropagation(); // don't trigger collapse-toggle
    var panel = jQ(this).data('panel');
    var titles = {
        score:       '<i class="bi bi-speedometer2"></i> Score',
        signal:      '<i class="bi bi-lightning-charge"></i> Signal',
        rangesb:     '<i class="bi bi-bar-chart-line-fill"></i> Range Scoreboard',
        pillars:     '<i class="bi bi-bar-chart-steps"></i> Pillars',
        toptrades:   '<i class="bi bi-stars"></i> Top Trades',
        scoredetail: '<i class="bi bi-table"></i> Score Detail',
        scorehistory:'<i class="bi bi-clock-history"></i> Score History',
        'now-trade': '<i class="bi bi-lightning-charge-fill"></i> NOW TRADE',
    };
    var bodyMap = {
        score:       function() { return jQ('#gtb-score-gauge').html(); },
        signal:      function() { return jQ('#market-final-signal').parent().html(); },
        rangesb:     function() { return jQ('#gtb-range-sb').html(); },
        pillars:     function() { return jQ('#gtb-pillars-body').html(); },
        toptrades:   function() { return jQ('#gtb-top-trades-list').html(); },
        scoredetail: function() { return jQ('#trend-scoreboard-table').html(); },
        scorehistory:function() { return jQ('#gtb-score-history-table').html(); },
        'now-trade': function() { return jQ('#gtb-now-trade').html(); },
    };
    var body = bodyMap[panel] ? bodyMap[panel]() : '';
    showMaximizeOverlay(titles[panel] || panel, '<div style="padding:12px;overflow:auto;height:100%;">' + body + '</div>');
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
        srHtml += '<div style="flex:1;min-width:80px;text-align:center;border:' + border + ';border-radius:5px;padding:5px 3px;background:var(--gtb-bg,#161b22);">';
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
        // Levels strip — populated by showTopChart once candles are loaded
        b += '<div id="max-' + tempName + '-chart-levels"'
            + ' style="display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;'
            + 'padding:6px 10px;background:var(--gtb-surface2,#161b22);'
            + 'border:1px solid var(--gtb-border2,#30363d);border-radius:6px;margin-bottom:8px;min-height:28px;">'
            + '<span style="font-size:0.52rem;color:var(--gtb-muted);">Loading levels…</span>'
            + '</div>';
        b += '<div id="max-' + tempName + '-chart" style="width:100%;min-width:0;height:500px;border-radius:8px;overflow:hidden;display:block;"></div>';
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


function _gtbApplyFullscreen(on) {
    var $win = jQ('#gtb-popup-win');
    if (on) {
        $win.css({ top: '0', left: '0', width: '100vw', height: '100vh' })
            .addClass('gtb-fullscreen');
    } else {
        $win.css({ top: '48px', left: '1vw', width: '98vw', height: 'calc(100vh - 56px)' })
            .removeClass('gtb-fullscreen');
    }
    $win.data('gtb-fullscreen', on);
}

function showGrootTradeBot() {
    if (jQ('#gtb-popup-win').length) {
        jQ('#gtb-popup-win').css('z-index', '5000');
        return;
    }
    jQ('body').append('<div id="gtb-popup-win"><div id="main-trade-bot-container"></div></div>');
    jQ('body').css('overflow', 'hidden');
    _gtbApplyFullscreen(true); // open maximized by default
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
    jQ('.' + divId).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
});


GM_registerMenuCommand("Create AT ", function () {
    window.open("https://kite.zerodha.com/connect/login?v=3&api_key=" + g_config.get('api_key'), "_self");
}, "r");

jQ(document).on('click', '#nine-fifteen-scan', function (e) {
    localStorage.removeItem('VALID_BREAKOUT_NINE_FIFTEEN'); // always force a fresh scan
    scanNineFifteenCandle();
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
                // Use the actual first candle's OPEN from the API as strike reference,
                // not the stored "load price" value (which may be a pre-market LTP before 9:15).
                let firstCandleOpen  = historical.data.candles[0][1];
                let firstCandleClose = historical.data.candles[0][4];
                let strikeData = getStrikeDetails({ price: firstCandleOpen }, name);
                let astPrice = parseFloat(strikeData['ustrikeTwo']);
                let asoPrice = parseFloat(strikeData['ustrikeOne']);
                let bsoPrice = parseFloat(strikeData['bstrikeOne']);
                let bstPrice = parseFloat(strikeData['bstrikeTwo']);

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
        if (Object.keys(breakOutNineFifteen).length > 0) {
            localStorage.setItem("VALID_BREAKOUT_NINE_FIFTEEN", JSON.stringify(breakOutNineFifteen));
            _gtbProgress('9:15 scan done ✓', 'green');
        } else {
            _gtbProgress('No candle data yet — try after 9:15 AM', 'orange');
        }
        setTimeout(_gtbProgressHide, 2500);
    }
}

// Module-level instrument list — populated by commonMarkupPlaceHolder before each render
var _allInstruments = [];

// Icons used by both _buildCardStandalone and commonMarkupPlaceHolder/_buildCard
var _instrIcons = {
    'NIFTY 50':'bi-graph-up','NIFTY BANK':'bi-bank2','GIFT NIFTY':'bi-globe-asia-australia',
    'SENSEX':'bi-globe2','CRUDEOILM':'bi-droplet-fill','USDINR':'bi-currency-exchange',
    'RELIANCE':'bi-fuel-pump','HDFCBANK':'bi-building','ICICIBANK':'bi-credit-card',
};

// Builds a single instrument card HTML string usable outside commonMarkupPlaceHolder
function _buildCardStandalone(item) {
    var name    = item.name;
    var tid     = name.replace(/ /g,'-').replace(/&/g,'-');
    var icon    = _instrIcons[name] || 'bi-bar-chart';
    var isMcx   = !!item.mcx;
    var isNifty = name === 'NIFTY 50';
    var isBank  = name === 'NIFTY BANK';
    var exchLink = isMcx ? 'MCX' : 'NSE';
    var mcxEntry  = isMcx ? (typeof COMMODITIES_FUTURE_INSTRUMENT_LIST !== 'undefined'
        ? COMMODITIES_FUTURE_INSTRUMENT_LIST.find(function(f){return f.name===name;}) : null) : null;
    var linkToken  = mcxEntry ? mcxEntry.instrument_token : (INSTRUMENT_TOKENS[name] || '');
    var linkSymbol = mcxEntry ? mcxEntry.tradingsymbol    : name;
    var kiteLink   = 'https://kite.zerodha.com/markets/ext/chart/web/tvc/' + exchLink + '/' + linkSymbol + '/' + linkToken;

    // Re-use _buildCard logic by injecting the item into commonMarkupPlaceHolder-scope is complex,
    // so we duplicate the essential outer wrapper. The panel structure mirrors _buildCard exactly.
    var h = '<div class="gtb-instr-card-v" id="gtb-pane-' + tid + '" data-name="' + name + '" data-mcx="' + (isMcx?'1':'0') + '">';

    // Identity strip
    h += '<div class="gtb-ic-v-id">'
       + '<div class="gtb-ic-v-id-left">'
       + '<i class="bi ' + icon + '" style="font-size:0.55rem;color:var(--gtb-muted);"></i>'
       + '<a href="' + kiteLink + '" target="_blank" class="gtb-instr-link" style="font-weight:800;">' + name + '</a>'
       + '<span class="gtb-row-ltp" id="' + tid + '-ltp"></span>'
       + '<span class="gtb-trend-zone" id="' + tid + '-trend-zone"></span>'
       + '<span class="gtb-915-badge" id="' + tid + '-915-badge"></span>'
       + '<span class="gtb-cell-premium-chip" id="' + tid + '-futures-premium"></span>'
       + '<span class="gtb-cell-fut-remark" id="' + tid + '-futures-trend"></span>'
       + '<span class="gtb-gex-chip" id="' + tid + '-net-gex"></span>'
       + '<span class="gtb-avwap-chip" id="' + tid + '-avwap"></span>'
       + '</div>'
       + '<button class="sv-icon-btn gtb-single-refresh" data-name="' + name + '" data-mcx="' + (isMcx?'1':'0') + '" title="Refresh ' + name + '" style="margin-left:auto;">'
       + '<i class="bi bi-arrow-clockwise"></i></button>'
       + '</div>';

    // 8 panels — identical to _buildCard (abbreviated to identity + placeholders)
    // Panel: chart
    h += '<div class="gtb-ic-panel" data-col="chart"><div class="gtb-ic-panel-hdr"><span class="gtb-ic-panel-title"><i class="bi bi-bar-chart-line-fill"></i> PRICE ACTION' + _ii('dv-chart') + '</span>'
       + '<span class="gtb-ic-panel-btns"><button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="chart" title="Maximize"><i class="bi bi-fullscreen"></i></button></span></div>'
       + '<div class="gtb-ic-panel-body" style="padding:0;">'
       + '<div id="' + tid + '-chart-levels" class="gtb-chart-levels"></div>'
       + '<div id="' + tid + '-chart" class="gtb-chart-mini gtb-row-chart"></div>'
       + '</div></div>';

    // Panel: oiobv
    h += '<div class="gtb-ic-panel" data-col="oiobv"><div class="gtb-ic-panel-hdr"><span class="gtb-ic-panel-title"><i class="bi bi-layers-fill"></i> OI / OBV' + _ii('dv-oiobv') + '</span>'
       + '<span class="gtb-ic-panel-btns">'
       + '<button class="sv-icon-btn refresh-oi-obv" data-name="' + name + '" title="Refresh OI"><i class="bi bi-arrow-clockwise"></i></button>'
       + '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="oi" title="Maximize"><i class="bi bi-fullscreen"></i></button>'
       + '</span></div>'
       + '<div class="gtb-ic-panel-body">'
       + '<div id="' + tid + '-oi" class="gtb-chart-oi" style="height:110px;"></div>'
       + '<div id="' + tid + '-obv" class="gtb-chart-oi" style="height:110px;"></div>'
       + '<div id="' + tid + '-oiobv-xaxis" class="gtb-oiobv-xaxis"></div>'
       + '</div></div>';

    // Panel: 915
    h += '<div class="gtb-ic-panel" data-col="915"><div class="gtb-ic-panel-hdr"><span class="gtb-ic-panel-title"><i class="bi bi-alarm"></i> 9:15 BREAKOUT' + _ii('dv-915') + '</span>'
       + '<span class="gtb-ic-panel-btns"><button class="gtb-prob-btn sv-icon-btn" data-name="' + name + '"><i class="bi bi-percent"></i></button></span></div>'
       + '<div class="gtb-ic-panel-body"><span id="' + tid + '-915-detail" style="font-size:0.52rem;color:var(--gtb-muted);">—</span></div></div>';

    // Panel: prob
    h += '<div class="gtb-ic-panel" data-col="prob"><div class="gtb-ic-panel-hdr"><span class="gtb-ic-panel-title"><i class="bi bi-speedometer2"></i> TREND PROBABILITY' + _ii('dv-prob') + '</span></div>'
       + '<div class="gtb-ic-panel-body" id="' + tid + '-prob"></div></div>';

    // Panel: fut
    h += '<div class="gtb-ic-panel" data-col="fut"><div class="gtb-ic-panel-hdr"><span class="gtb-ic-panel-title"><i class="bi bi-graph-up-arrow"></i> FUTURES' + _ii('dv-futures') + '</span>'
       + '<span class="gtb-ic-panel-btns"><button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="futures"><i class="bi bi-fullscreen"></i></button></span></div>'
       + '<div class="gtb-ic-panel-body">'
       + '<div id="' + tid + '-futures" class="gtb-cell-fut-signals"></div>'
       + '<div id="' + tid + '-atr-sl" class="gtb-cell-sl-wrap" style="margin-top:4px;"></div>'
       + '<div id="' + tid + '-futures-vwap" style="font-size:0.5rem;margin-top:2px;"></div>'
       + '</div></div>';

    // Panel: oimatrix
    h += '<div class="gtb-ic-panel" data-col="oimatrix"><div class="gtb-ic-panel-hdr"><span class="gtb-ic-panel-title"><i class="bi bi-table"></i> OI MATRIX' + _ii('dv-oimatrix') + '</span>'
       + '<span id="' + tid + '-oimatrix-lbl" style="font-size:0.42rem;color:var(--gtb-muted);margin-left:4px;"></span></div>'
       + '<div class="gtb-ic-panel-body" style="overflow-x:auto;padding:0 4px;">'
       + '<div id="' + tid + '-oimatrix" class="gtb-row-oimatrix"></div>'
       + '</div></div>';

    // Panel: weights
    h += '<div class="gtb-ic-panel" data-col="weights"><div class="gtb-ic-panel-hdr"><span class="gtb-ic-panel-title"><i class="bi bi-bar-chart-steps"></i> WEIGHTAGE' + _ii('dv-weights') + '</span></div>'
       + '<div class="gtb-ic-panel-body" id="' + tid + '-weights">';
    if (isNifty || isBank) {
        var wMap2 = isNifty ? NIFTY_50_WEIGHTED_STOCKS : NIFTY_BANK_WEIGHTED_STOCKS;
        Object.entries(wMap2).sort(function(a,b){return b[1]-a[1];}).slice(0,6).forEach(function(kv){
            var wn = kv[0], wtid3 = wn.replace(/ /g,'-').replace(/&/g,'-');
            h += '<div class="gtb-wt-row"><span class="gtb-wt-name">' + wn + '</span>'
               + '<div class="gtb-wt-bar"><b id="' + wtid3 + '-wt-bar" style="width:0%;background:var(--gtb-muted)"></b></div>'
               + '<span class="gtb-wt-score" id="' + wtid3 + '-wt-score">—</span></div>';
        });
    } else {
        [['9:15',tid+'-sub-915'],['Trend',tid+'-sub-trend'],['Fut',tid+'-sub-fut'],['OI',tid+'-sub-oi'],['Total',tid+'-sub-total']].forEach(function(sr){
            h += '<div class="gtb-wt-row"><span class="gtb-wt-name">' + sr[0] + '</span>'
               + '<div class="gtb-wt-bar"><b id="' + sr[1] + '-bar" style="width:0%;background:var(--gtb-muted)"></b></div>'
               + '<span class="gtb-wt-score" id="' + sr[1] + '">—</span></div>';
        });
    }
    h += '</div></div>';

    // Panel: detail
    h += '<div class="gtb-ic-panel" data-col="detail"><div class="gtb-ic-panel-hdr"><span class="gtb-ic-panel-title"><i class="bi bi-info-circle-fill"></i> DETAILS' + _ii('dv-detail') + '</span></div>'
       + '<div class="gtb-ic-panel-body">'
       + '<div class="gtb-det-row"><span class="gtb-det-lbl">PCR</span><span class="gtb-pcr-chip gtb-det-val" id="' + tid + '-pcr-probability"></span></div>'
       + '<div class="gtb-det-row"><span class="gtb-det-lbl">OI sc</span><span class="gtb-oi-score-chip gtb-det-val" id="' + tid + '-oi-score"></span></div>'
       + '<div id="' + tid + '-mp-gex" class="gtb-det-mp"></div>'
       + '</div></div>';

    h += '</div>'; // end .gtb-instr-card-v
    return h;
}

// Single-card refresh handler wired to Refresh button on dynamically added cards
jQ(document).on('click', '.gtb-single-refresh', function() {
    var name  = jQ(this).data('name');
    var isMcx = jQ(this).data('mcx') == '1' || jQ(this).data('mcx') === 1;
    _gtbToast('Refreshing ' + name + '…', 'info');
    if (isMcx) _refreshMCX(name); else _refreshNSE(name);
});

function _ii(k) { return ' <i class="bi bi-info-circle gtb-info-i" data-info="' + k + '" title="What does this show?"></i>'; }

function commonMarkupPlaceHolder() {
    let h = '';

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

    // ── Topbar controls (timer + refresh only) ────────────────────────────────
    var _savedHistTime = localStorage.getItem('GTB_HIST_TIME') || '';
    h += '<div class="gtb-topbar-controls">';
    h += '<span id="refresh-loader" class="loader hide"></span>';
    h += '<span id="refresh-timer-one" class="gtb-timer-badge">00:00</span>';
    h += '<a id="start-auto-refresh" class="gtb-ctrl-link" title="Refresh now"><i class="bi bi-arrow-clockwise"></i> Refresh</a>';
    h += '<span id="gtb-progress-pill" style="visibility:hidden;display:inline-flex;align-items:center;gap:5px;'
       + 'font-size:0.6rem;color:#c9d1d9;background:#1f2937;border:1px solid #3b82f633;'
       + 'border-radius:10px;padding:2px 8px;width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;">'
       + '<span style="width:6px;height:6px;border-radius:50%;background:#3b82f6;flex-shrink:0;'
       + 'animation:gtb-pulse 1s ease-in-out infinite;" id="gtb-progress-dot"></span>'
       + '<span id="gtb-progress-text"></span>'
       + '</span>';
    h += '<input type="time" id="gtb-hist-time" value="' + _savedHistTime + '" min="09:15" max="15:30" '
       + 'style="font-size:0.6rem;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;'
       + 'border-radius:4px;padding:2px 4px;cursor:pointer;width:76px;" title="Snapshot end time — empty = live">';
    h += '<span class="gtb-win-controls" data-popup="popup-custom-style-groot-trade-bot" style="flex-shrink:0;padding-left:6px;border-left:1px solid var(--gtb-border);margin-left:4px;">'
       + '<button class="gtb-win-btn popup-win-minimize" title="Minimize"><i class="bi bi-dash"></i></button>'
       + '<button class="gtb-win-btn popup-win-restore"  title="Maximize/Restore"><i class="bi bi-fullscreen"></i></button>'
       + '<button class="gtb-win-btn popup-win-close"    title="Close"><i class="bi bi-x-lg"></i></button>'
       + '</span>';
    h += '</div>'; // end gtb-topbar-controls
    h += '</div>'; // end topbar

    h += '<div id="gtb-main">';

    // ── Instrument icon map ───────────────────────────────────────────────────
    var instrIcons = _instrIcons;

    // ════════════════════════════════════════════════════════════════
    // LEFT PANEL — Score, Signal, Pillars, Entry, History
    // ════════════════════════════════════════════════════════════════
    h += '<div id="gtb-left">';

    // Score gauge
    h += '<div class="gtb-card gtb-widget" id="gtb-score-gauge">';
    h += '<div class="gtb-card-header"><span class="gtb-card-title"><i class="bi bi-speedometer2"></i> SCORE' + _ii('score') + '</span>';
    h += '<span class="hdr-actions"><button class="sv-icon-btn gtb-left-max-btn" data-panel="score" title="Maximize"><i class="bi bi-fullscreen"></i></button><button class="sv-icon-btn show-notes" title="Trading notes"><i class="bi bi-journal-text"></i></button></span></div>';
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
    h += '<div class="gtb-card-header"><span class="gtb-card-title"><i class="bi bi-lightning-charge"></i> SIGNAL' + _ii('signal') + '</span><span class="hdr-actions"><button class="sv-icon-btn gtb-left-max-btn" data-panel="signal" title="Maximize"><i class="bi bi-fullscreen"></i></button></span></div>';
    h += '<div class="gtb-card-body gtb-widget-body" style="height:120px;overflow-y:auto;">';
    h += '<div id="market-final-signal"></div>';
    h += '<div id="trend-scoreboard-outcome" style="margin-top:4px;"></div>';
    h += '</div></div>';

    // Range Scoreboard
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header"><span class="gtb-card-title"><i class="bi bi-bar-chart-line-fill"></i> RANGE SCOREBOARD' + _ii('rangesb') + '</span><span class="hdr-actions"><button class="sv-icon-btn gtb-left-max-btn" data-panel="rangesb" title="Maximize"><i class="bi bi-fullscreen"></i></button></span></div>';
    h += '<div class="gtb-card-body gtb-widget-body" id="gtb-range-sb" style="padding:6px 8px;"></div>';
    h += '</div>';

    // Entry / Trade
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header"><span class="gtb-card-title"><i class="bi bi-crosshair"></i> ENTRY / TRADE' + _ii('entry') + '</span></div>';
    h += '<div class="gtb-card-body gtb-widget-body" style="height:100px;" id="entry-confluence-panel"></div>';
    h += '</div>';

    // NOW TRADE card
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header"><span class="gtb-card-title"><i class="bi bi-lightning-charge-fill"></i> NOW TRADE' + _ii('now-trade') + '</span>'
       + '<span class="hdr-actions"><button class="sv-icon-btn gtb-left-max-btn" data-panel="now-trade" title="Maximize"><i class="bi bi-fullscreen"></i></button></span></div>';
    h += '<div class="gtb-card-body gtb-widget-body" id="gtb-now-trade" style="padding:6px 8px;min-height:80px;"></div>';
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
    h += '<span class="hdr-actions"><button class="sv-icon-btn gtb-left-max-btn" data-panel="pillars" title="Maximize"><i class="bi bi-fullscreen"></i></button><i class="bi bi-chevron-down gtb-caret"></i></span></div>';
    h += '<div id="gtb-pillars-body" class="gtb-collapse-body gtb-widget-body" style="height:200px;overflow-y:auto;">';
    h += '<div style="color:#64748b;font-size:0.6rem;text-align:center;padding:8px;">Refreshing…</div>';
    h += '</div></div>';

    // Top trades (collapsible)
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header gtb-collapse-toggle" data-target="gtb-top-trades-list">';
    h += '<span class="gtb-card-title"><i class="bi bi-stars"></i> TOP TRADES' + _ii('toptrades') + '</span>';
    h += '<span class="hdr-actions"><button class="sv-icon-btn gtb-left-max-btn" data-panel="toptrades" title="Maximize"><i class="bi bi-fullscreen"></i></button><button class="sv-icon-btn refresh-scoreboard" title="Refresh"><i class="bi bi-arrow-clockwise"></i></button><i class="bi bi-chevron-down gtb-caret"></i></span></div>';
    h += '<div id="gtb-top-trades-list" class="gtb-collapse-body gtb-widget-body" style="height:160px;">';
    h += '<div class="gtb-empty-msg"><i class="bi bi-hourglass-split"></i> Refreshing…</div>';
    h += '</div></div>';

    // Score detail (collapsible)
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header gtb-collapse-toggle" data-target="gtb-score-detail">';
    h += '<span class="gtb-card-title"><i class="bi bi-table"></i> SCORE DETAIL' + _ii('scoredetail') + '</span>';
    h += '<span class="hdr-actions"><button class="sv-icon-btn gtb-left-max-btn" data-panel="scoredetail" title="Maximize"><i class="bi bi-fullscreen"></i></button><i class="bi bi-chevron-down gtb-caret"></i></span></div>';
    h += '<div id="gtb-score-detail" class="gtb-collapse-body gtb-widget-body" style="height:240px;overflow:auto;">';
    h += '<div id="trend-scoreboard-table" style="overflow:auto;"></div>';
    h += '</div></div>';

    // Score history (collapsible)
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header gtb-collapse-toggle" data-target="gtb-score-history">';
    h += '<span class="gtb-card-title"><i class="bi bi-clock-history"></i> SCORE HISTORY' + _ii('scorehistory') + '</span>';
    h += '<span class="hdr-actions"><button class="sv-icon-btn gtb-left-max-btn" data-panel="scorehistory" title="Maximize"><i class="bi bi-fullscreen"></i></button><i class="bi bi-chevron-down gtb-caret"></i></span></div>';
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
    h += '<div id="gtb-tab-strip">'
        // ── Tabs ─────────────────────────────────────────────────────────────
        + '<button class="gtb-tab active" data-tab="metrics"><i class="bi bi-speedometer2"></i> Metrics</button>'
        + '<button class="gtb-tab" data-tab="main"><i class="bi bi-grid"></i> Overview</button>'
        + '<button class="gtb-tab" data-tab="signals"><i class="bi bi-layers-fill"></i> Signals</button>'
        + '<button class="gtb-tab" data-tab="mpgex"><i class="bi bi-bar-chart-steps"></i> Max Pain</button>'
        + '<button class="gtb-tab" data-tab="analysis"><i class="bi bi-bar-chart-line-fill"></i> Analysis</button>'
        + '<button class="gtb-tab" data-tab="opps"><i class="bi bi-lightning-charge-fill"></i> Opportunities</button>'
        + '<button class="gtb-tab" data-tab="trade"><i class="bi bi-lightning-fill"></i> Trade</button>'
        + '<button class="gtb-tab" data-tab="checklist"><i class="bi bi-clipboard-check"></i> Checklist</button>'
        // ── Spacer ───────────────────────────────────────────────────────────
        + '<span class="gtb-tab-sep"></span>'
        // ── Tool buttons (all 15 — topbar icons + float-menu extras) ─────────
        + '<a id="show-chartgrid"            class="gtb-ctrl-link" title="Chart Grid"><i class="bi bi-grid-3x3-gap-fill"></i></a>'
        + '<a id="show-915-backtest"         class="gtb-ctrl-link" title="9:15 Trend backtest"><i class="bi bi-calendar-week"></i></a>'
        + '<a id="show-all-oi"               class="gtb-ctrl-link" title="OI Scan — all instruments"><i class="bi bi-layers-fill"></i></a>'
        + '<a id="show-fut-accuracy"         class="gtb-ctrl-link" title="Futures remark accuracy"><i class="bi bi-bullseye"></i></a>'
        + '<a id="show-futures-signal"       class="gtb-ctrl-link" title="Instrument Detail View"><i class="bi bi-flag-fill"></i></a>'
        + '<a id="show-commodities"          class="gtb-ctrl-link" title="Commodities — GIFT NIFTY &amp; Crude"><i class="bi bi-droplet-fill"></i></a>'
        + '<a id="show-oi-viewer"            class="gtb-ctrl-link" title="OI Analyzer"><i class="bi bi-eye"></i></a>'
        + '<a id="show-stock-viewer"         class="gtb-ctrl-link" title="Stock Viewer"><i class="bi bi-list-ul"></i></a>'
        + '<a id="show-market-quote-analyzer" class="gtb-ctrl-link" title="Quotes"><i class="bi bi-graph-up"></i></a>'
        + '<a id="show-maxpain-gex"          class="gtb-ctrl-link" title="Max Pain &amp; GEX"><i class="bi bi-bar-chart-steps"></i></a>'
        + '<a id="show-trade-checklist"      class="gtb-ctrl-link" title="Pre-Trade Checklist"><i class="bi bi-clipboard-check"></i></a>'
        + '<a id="show-help"                 class="gtb-ctrl-link" title="Help"><i class="bi bi-question-circle-fill"></i></a>'
        + '<a id="gtb-add-instr-btn"         class="gtb-ctrl-link" title="Add instrument"><i class="bi bi-plus-circle-fill"></i></a>'
        + '<a id="gtb-settings-toggle"       class="gtb-ctrl-link" title="Settings"><i class="bi bi-gear-fill"></i></a>'
        + '<a id="data-load"                 class="gtb-ctrl-link" title="Data Settings"><i class="bi bi-sliders"></i></a>'
        + '</div>';
    h += '<div id="gtb-pane-metrics" class="gtb-tab-pane" style="display:none;overflow-y:auto;padding:0;"></div>';
    h += '<div id="gtb-pane-main"  class="gtb-tab-pane" style="display:none;">';

    // Populate the module-level _allInstruments with custom instruments before rendering
    _allInstruments = [
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
    // Merge persisted custom instruments (skip duplicates)
    try {
        var _customInstrs = JSON.parse(localStorage.getItem('GTB_CUSTOM_INSTRS') || '[]');
        var _builtInNames = _allInstruments.map(function(i) { return i.name; });
        _customInstrs.forEach(function(ci) {
            if (ci && ci.name && _builtInNames.indexOf(ci.name) === -1) {
                _allInstruments.push({ name: ci.name, mcx: !!ci.mcx, custom: true });
            }
        });
    } catch(e) {}

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
    // Chart-grid launcher
    h += '<div style="display:flex;align-items:center;gap:6px;padding:3px 8px;flex-shrink:0;">';
    h +=   '<a id="show-chartgrid" title="Chart Grid — all instruments" style="cursor:pointer;color:var(--gtb-muted);font-size:0.7rem;">'
         + '<i class="bi bi-grid-3x3-gap-fill"></i> Chart Grid</a>';
    h += '</div>';

    function _buildCard(item, idx) {
        var name = item.name;
        var tid  = name.replace(/ /g, '-').replace(/&/g, '-');
        var icon = instrIcons[name] || 'bi-bar-chart';
        var isMcx = !!item.mcx;
        var exchLink = isMcx ? 'MCX' : 'NSE';
        var mcxEntry = isMcx ? COMMODITIES_FUTURE_INSTRUMENT_LIST.find(function(f){ return f.name === name; }) : null;
        var linkToken  = mcxEntry ? mcxEntry.instrument_token : INSTRUMENT_TOKENS[name];
        var linkSymbol = mcxEntry ? mcxEntry.tradingsymbol    : name;
        var kiteLink   = 'https://kite.zerodha.com/markets/ext/chart/web/tvc/' + exchLink + '/' + linkSymbol + '/' + linkToken;

        var cat = isMcx ? 'cmdty' : (idx <= 3 ? 'index' : 'stock');
        var hasFut = (name !== 'GIFT NIFTY' && name !== 'SENSEX');
        var isNifty = (name === 'NIFTY 50');
        var isBank  = (name === 'NIFTY BANK');

        h += '<div class="gtb-instr-card gtb-instr-card-v cat-' + cat + '" id="gtb-pane-' + tid + '" data-instr="' + name + '">';

        // ── Panel helper ─────────────────────────────────────────────────────
        // Each section: .gtb-ic-panel > .gtb-ic-panel-hdr + .gtb-ic-panel-body

        // ── [0] Identity strip ───────────────────────────────────────────────
        h += '<div class="gtb-ic-panel gtb-ic-panel-identity" data-col="id">';
        h +=   '<div class="gtb-ic-panel-hdr">';
        h +=     '<i class="bi ' + icon + '"></i>';
        h +=     '<a class="gtb-instr-link" href="' + kiteLink + '" target="_blank">' + name + '</a>';
        h +=     '<span class="gtb-row-ltp" id="' + tid + '-ltp"></span>';
        h +=     '<span class="gtb-trend-zone" id="' + tid + '-trend-zone"></span>';
        h +=     '<span class="gtb-915-badge" id="' + tid + '-915-badge"></span>';
        h +=     '<span id="' + tid + '-futures-premium" class="gtb-cell-premium-chip"></span>';
        h +=     '<span id="' + tid + '-futures-trend" class="gtb-cell-fut-remark"></span>';
        h +=     '<span id="' + tid + '-net-gex" class="gtb-gex-chip"></span>';
        h +=     '<span id="' + tid + '-avwap" class="gtb-avwap-chip"></span>';
        h +=   '</div>';
        h += '</div>';

        // ── [1] Chart panel ──────────────────────────────────────────────────
        h += '<div class="gtb-ic-panel" data-col="chart">';
        h +=   '<div class="gtb-ic-panel-hdr">';
        h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-bar-chart-line-fill"></i> PRICE ACTION</span>';
        h +=     '<span class="gtb-ic-panel-btns">';
        h +=       '<button class="sv-icon-btn refresh-chart" data-name="' + name + '" title="Refresh chart"><i class="bi bi-arrow-clockwise"></i></button>';
        h +=       '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="chart" title="Maximize"><i class="bi bi-fullscreen"></i></button>';
        h +=     '</span>';
        h +=   '</div>';
        h +=   '<div class="gtb-ic-panel-body" style="padding:0;">';
        h +=     '<div id="' + tid + '-chart-levels" class="gtb-chart-levels"></div>';
        h +=     '<div id="' + tid + '-chart" class="gtb-chart-mini gtb-row-chart"></div>';
        h +=   '</div>';
        h += '</div>';

        // ── [2] OI / OBV panel ───────────────────────────────────────────────
        h += '<div class="gtb-ic-panel" data-col="oiobv">';
        h +=   '<div class="gtb-ic-panel-hdr">';
        h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-layers-fill"></i> OI / OBV</span>';
        h +=     '<span class="gtb-ic-panel-btns">';
        h +=       '<button class="sv-icon-btn refresh-oi-obv" data-name="' + name + '" title="Refresh OI"><i class="bi bi-arrow-clockwise"></i></button>';
        h +=       '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="oi" title="Maximize OI"><i class="bi bi-fullscreen"></i></button>';
        h +=     '</span>';
        h +=   '</div>';
        h +=   '<div class="gtb-ic-panel-body">';
        h +=   '<div class="gtb-ic-sub-hdr">OI Change</div>';
        h +=   '<div id="' + tid + '-oi" class="gtb-chart-oi" style="height:110px;"></div>';
        h +=   '<div id="' + tid + '-oi-signal-row" style="display:none;"></div>';
        h +=   '<div class="gtb-ic-sub-hdr" style="margin-top:4px;">OBV</div>';
        h +=   '<div id="' + tid + '-obv" class="gtb-chart-oi" style="height:110px;"></div>';
        h +=   '<div id="' + tid + '-oiobv-xaxis" class="gtb-oiobv-xaxis"></div>';
        h +=   '</div>';
        h += '</div>';

        // ── [3] 9:15 panel ───────────────────────────────────────────────────
        h += '<div class="gtb-ic-panel" data-col="915">';
        h +=   '<div class="gtb-ic-panel-hdr">';
        h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-alarm"></i> 9:15 BREAKOUT</span>';
        h +=     '<span class="gtb-ic-panel-btns">';
        h +=       '<button class="gtb-prob-btn sv-icon-btn" data-name="' + name + '" title="Strike probability"><i class="bi bi-percent"></i></button>';
        h +=     '</span>';
        h +=   '</div>';
        h +=   '<div class="gtb-ic-panel-body">';
        h += '<span class="gtb-915-detail" id="' + tid + '-915-detail" style="font-size:0.52rem;color:var(--gtb-muted);">Waiting for data…</span>';
        h +=   '</div>';
        h += '</div>';

        // ── [4] Trend Probability panel ──────────────────────────────────────
        h += '<div class="gtb-ic-panel" data-col="prob">';
        h +=   '<div class="gtb-ic-panel-hdr">';
        h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-speedometer2"></i> TREND PROBABILITY</span>';
        h +=   '</div>';
        h +=   '<div class="gtb-ic-panel-body" id="' + tid + '-prob"></div>';
        h += '</div>';

        // ── [5] Futures panel ────────────────────────────────────────────────
        h += '<div class="gtb-ic-panel" data-col="fut">';
        h +=   '<div class="gtb-ic-panel-hdr">';
        h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-graph-up-arrow"></i> FUTURES</span>';
        h +=     '<span class="gtb-ic-panel-btns">';
        h +=       '<button class="sv-icon-btn gtb-fut-refresh-btn" data-name="' + name + '" title="Refresh futures"><i class="bi bi-arrow-clockwise"></i></button>';
        h +=       '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="futures" title="Maximize"><i class="bi bi-fullscreen"></i></button>';
        h +=     '</span>';
        h +=   '</div>';
        h +=   '<div class="gtb-ic-panel-body">';
        h +=   '<div id="' + tid + '-futures" class="gtb-cell-fut-signals"></div>';
        h +=   '<div id="' + tid + '-atr-sl" class="gtb-cell-sl-wrap" style="margin-top:4px;"></div>';
        h +=   '<div id="' + tid + '-futures-vwap" style="font-size:0.5rem;margin-top:2px;"></div>';
        h +=   '</div>';
        h += '</div>';

        // ── [6] OI Matrix panel ──────────────────────────────────────────────
        h += '<div class="gtb-ic-panel" data-col="oimatrix">';
        h +=   '<div class="gtb-ic-panel-hdr">';
        h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-table"></i> OI MATRIX</span>';
        h +=   '</div>';
        h +=   '<div class="gtb-ic-panel-body" style="overflow-x:auto;padding:0 4px;">';
        h +=     '<div id="' + tid + '-oimatrix" class="gtb-row-oimatrix"></div>';
        h +=   '</div>';
        h += '</div>';

        // ── [7] Weightage panel ──────────────────────────────────────────────
        h += '<div class="gtb-ic-panel" data-col="weights">';
        h +=   '<div class="gtb-ic-panel-hdr">';
        h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-bar-chart-steps"></i> WEIGHTAGE</span>';
        h +=   '</div>';
        h +=   '<div class="gtb-ic-panel-body" id="' + tid + '-weights">';
        if (isNifty || isBank) {
            var wMap = isNifty ? NIFTY_50_WEIGHTED_STOCKS : NIFTY_BANK_WEIGHTED_STOCKS;
            var topW = Object.entries(wMap).sort(function(a,b){return b[1]-a[1];}).slice(0,6);
            topW.forEach(function(kv) {
                var wname = kv[0], wtid2 = wname.replace(/ /g,'-').replace(/&/g,'-');
                h += '<div class="gtb-wt-row"><span class="gtb-wt-name">' + wname + '</span>'
                   + '<div class="gtb-wt-bar"><b id="' + wtid2 + '-wt-bar" style="width:0%;background:var(--gtb-muted)"></b></div>'
                   + '<span class="gtb-wt-score" id="' + wtid2 + '-wt-score">—</span></div>';
            });
        } else {
            [['9:15',tid+'-sub-915'],['Trend',tid+'-sub-trend'],['Fut',tid+'-sub-fut'],['OI',tid+'-sub-oi'],['Total',tid+'-sub-total']].forEach(function(sr) {
                h += '<div class="gtb-wt-row"><span class="gtb-wt-name">' + sr[0] + '</span>'
                   + '<div class="gtb-wt-bar"><b id="' + sr[1] + '-bar" style="width:0%;background:var(--gtb-muted)"></b></div>'
                   + '<span class="gtb-wt-score" id="' + sr[1] + '">—</span></div>';
            });
        }
        h +=   '</div>';
        h += '</div>';

        // ── [8] Details panel ────────────────────────────────────────────────
        h += '<div class="gtb-ic-panel" data-col="detail">';
        h +=   '<div class="gtb-ic-panel-hdr">';
        h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-info-circle-fill"></i> DETAILS</span>';
        h +=     '<span class="gtb-ic-panel-btns">';
        h +=       '<button class="sv-icon-btn mp-gex-btn" data-name="' + name + '" title="Max Pain / GEX"><i class="bi bi-bar-chart-steps"></i></button>';
        h +=     '</span>';
        h +=   '</div>';
        h +=   '<div class="gtb-ic-panel-body" id="' + tid + '-detail">';
        h +=   '<div class="gtb-det-row"><span class="gtb-det-lbl">PCR</span><span class="gtb-pcr-chip gtb-det-val" id="' + tid + '-pcr-probability"></span></div>';
        h +=   '<div class="gtb-det-row"><span class="gtb-det-lbl">OI sc</span><span class="gtb-oi-score-chip gtb-det-val" id="' + tid + '-oi-score"></span></div>';
        h +=   '<div id="' + tid + '-mp-gex" class="gtb-det-mp"></div>';
        h +=   '</div>';
        h += '</div>';

        h += '</div>'; // end .gtb-instr-card
    } // end _buildCard

    h += '<div id="gtb-rows-head">'
       + '<span class="gtb-rh-instr">Instrument</span>'
       + '<span class="gtb-rh-chart">Price Action</span>'
       + '<span class="gtb-rh-oiobv">OI / OBV</span>'
       + '<span class="gtb-rh-915">9:15</span>'
       + '<span class="gtb-rh-prob">Trend</span>'
       + '<span class="gtb-rh-fut">Futures</span>'
       + '<span class="gtb-rh-oi">OI Matrix</span>'
       + '<span class="gtb-rh-weights">Weightage</span>'
       + '<span class="gtb-rh-detail">Details</span>'
       + '</div>';
    h += '<div id="gtb-rows" class="gtb-col-scroll">';
    _allInstruments.forEach(function(item, idx) { _buildCard(item, idx); });
    h += '</div>'; // end #gtb-rows

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
    h += '</div>'; // end #gtb-pane-main

    // Additional tab panes — populated lazily on first switch
    h += '<div id="gtb-pane-signals"  class="gtb-tab-pane" style="display:none;overflow-y:auto;padding:0;"></div>';
    h += '<div id="gtb-pane-mpgex"    class="gtb-tab-pane" style="display:none;overflow-y:auto;padding:8px;"></div>';
    h += '<div id="gtb-pane-analysis" class="gtb-tab-pane" style="display:none;overflow-y:auto;padding:4px;"></div>';
    h += '<div id="gtb-pane-opps"       class="gtb-tab-pane" style="display:none;overflow-y:auto;padding:4px;"></div>';
    h += '<div id="gtb-pane-trade"     class="gtb-tab-pane" style="display:none;overflow:hidden;padding:0;"></div>';
    h += '<div id="gtb-pane-checklist" class="gtb-tab-pane" style="display:none;overflow-y:auto;padding:0;"></div>';

    h += '</div>'; // end #gtb-right

    // Analyze drawer — slides in from the right for instrument deep-dive
    h += '<div id="gtb-analyze-drawer">';
    h += '<div id="gtb-analyze-drawer-hdr">'
        + '<span id="gtb-analyze-drawer-title">Analysis</span>'
        + '<button id="gtb-analyze-drawer-close"><i class="bi bi-x-lg"></i></button>'
        + '</div>';
    h += '<div id="gtb-analyze-drawer-body"></div>';
    h += '</div>';

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
       + 'font-size:0.6rem;color:var(--gtb-muted);padding:3px 10px;border-top:1px solid var(--gtb-border);'
       + 'background:var(--gtb-surface2);display:flex;align-items:center;gap:6px;flex-shrink:0;">'
       + '<span id="gtb-statusbar-refresh"><i class="bi bi-hourglass-split" style="margin-right:3px;"></i>Waiting for refresh...</span>'
       + '<span id="gtb-holiday-badge" style="display:none;font-size:0.6rem;padding:1px 7px;'
       + 'border:1px solid var(--gtb-border2);border-radius:3px;background:var(--gtb-amber-dim);color:var(--gtb-amber);'
       + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:500px;"></span>'
       + '</div>';

    return h;
}

function showCompoenentPlaceHolders() {
    jQ("#main-trade-bot-container").html(commonMarkupPlaceHolder());
    _gtbApplyTheme(localStorage.getItem('GTB_THEME') || 'dark');
    _gtbApplyGridH(parseInt(localStorage.getItem('GTB_ROW_H') || '190'));
    _gtbApplyCardW(parseInt(localStorage.getItem('GTB_CARD_W') || '300'));
    // Apply column order/visibility and instrument order/visibility
    _gtbApplyColsCfg();
    _gtbApplyInstrsCfg();
    // Check & display market holidays (non-blocking)
    _gtbCheckHolidayAlert().catch(function() {});
    // Initialize unified tab system + analyze drawer
    _gtbInitTabs();
}

// ── Unified Tab System ────────────────────────────────────────────────────────
// Tabs live inside #gtb-right. Content for non-main tabs is rendered lazily.
// The analyze drawer (#gtb-analyze-drawer) slides in from the right for deep-dive analysis.

// Shared helper: open a named instrument in the analyze drawer (falls back to overlay)
function _gtbOpenDrawer(name) {
    var $drawer = jQ('#gtb-analyze-drawer');
    if (!$drawer.length) { try { _btAnalyzeInstrument(name); } catch(e) {} return; }
    $drawer.addClass('open');
    jQ('#gtb-analyze-drawer-title').text(name);
    jQ('#gtb-analyze-drawer-body').html(
        '<div style="color:var(--gtb-muted);padding:20px;text-align:center;">'
        + '<i class="bi bi-arrow-clockwise spin"></i> Loading analysis...</div>');
    setTimeout(function() {
        try {
            _btAnalyzeInstrument(name, '#gtb-analyze-drawer-body');
        } catch(e2) {
            jQ('#gtb-analyze-drawer-body').html(
                '<div style="color:#f85149;padding:10px;font-size:0.6rem;">Error: ' + (e2.message||e2) + '</div>');
        }
    }, 30);
}

function _gtbInitTabs() {
    // Drag #gtb-popup-win by the topbar (only in windowed mode, skip clicks on controls)
    jQ(document).off('mousedown.gtb-drag').on('mousedown.gtb-drag', '#gtb-topbar', function(e) {
        var $win = jQ('#gtb-popup-win');
        if ($win.data('gtb-fullscreen') === true) return;
        if (jQ(e.target).closest('button, a, select, input, .gtb-settings-menu').length) return;
        var startX = e.clientX, startY = e.clientY;
        var startL = parseInt($win.css('left')) || 0;
        var startT = parseInt($win.css('top'))  || 0;
        jQ(document).on('mousemove.gtb-drag', function(mv) {
            $win.css({ left: (startL + mv.clientX - startX) + 'px',
                       top:  (startT + mv.clientY - startY) + 'px' });
        }).on('mouseup.gtb-drag', function() {
            jQ(document).off('mousemove.gtb-drag mouseup.gtb-drag');
        });
    });

    // Tab strip clicks
    jQ(document).off('click.gtbtabs').on('click.gtbtabs', '#gtb-tab-strip .gtb-tab', function() {
        _gtbActivateTab(jQ(this).data('tab'));
    });

    // Render default tab (Metrics) on init
    try { _gtbRenderMetricsPane(); } catch(e) {}


    // Drawer close
    jQ(document).off('click.gtb-drawer-close').on('click.gtb-drawer-close', '#gtb-analyze-drawer-close', function() {
        jQ('#gtb-analyze-drawer').removeClass('open');
    });

    // Load saved risk positions (GDB widget used in Analysis tab)
    try { _gdbLoadPositions(); } catch(e) {}

    // .gdb-analyze-btn (Score Matrix / Opportunity Ranker) → Instrument Detail View popup
    jQ(document).off('click.gdb', '.gdb-analyze-btn').on('click.gdb', '.gdb-analyze-btn', function(e) {
        e.preventDefault();
        if (typeof _gtbOpenInstrDetailFor === 'function') _gtbOpenInstrDetailFor(jQ(this).data('name'));
    });
    // .maximize-component-btn is NOT routed to the drawer — it has its own handler
    // at line ~329 that opens showMaximizeOverlay for chart/OI/futures panels.
}

function _gtbActivateTab(tabId) {
    jQ('.gtb-tab-pane').each(function() {
        jQ(this).toggle(jQ(this).attr('id') === 'gtb-pane-' + tabId);
    });
    jQ('#gtb-tab-strip .gtb-tab').removeClass('active');
    jQ('#gtb-tab-strip [data-tab="' + tabId + '"]').addClass('active');
    if (tabId !== 'main') _gtbRenderPane(tabId);
}

var _GTB_PANE_GRIDS = {
    metrics:  function() { return ''; },
    signals:  function() { return _gtbSignalsPaneHtml(); },
    mpgex:    function() { return _gtbMpGexPaneHtml(); },
    // Analysis tab: full bloomberg dashboard rendered by _btRenderInPane
    analysis: function() { return ''; },
    // Opps tab: full opportunities dashboard rendered by _btoShow_inpane
    opps: function() { return ''; },
    // Trade tab: manages its own DOM — return null so _gtbRenderPane skips the wipe
    trade: function() { return null; },
    // Checklist tab: rendered by _gtbRenderChecklistPane
    checklist: function() { return ''; },
};

var _GTB_PANE_RENDERS = {
    metrics:  [function(){try{_gtbRenderMetricsPane();}catch(e){}}],
    signals:  [function(){try{_gtbRenderSignalsPane();}catch(e){}}],
    mpgex:    [function(){try{_gtbRenderMpGexPane();}catch(e){}}],
    analysis: [function(){try{_btRenderInPane('#gtb-pane-analysis');}catch(e){}}],
    opps:      [function(){try{_btoShow_inpane('#gtb-pane-opps');}catch(e){}}],
    trade:     [function(){
        // If shell already present (re-entry after tab switch), reuse the existing closure's _render.
        // This avoids recreating the closure, resetting _renderGen, and re-binding all handlers.
        if (_gtbSavedTradeRender && jQ('#gtb-pane-trade #gtb-ts-wrap').length) {
            try { _gtbSavedTradeRender(); } catch(e) { console.error('[TradePane] re-render error:', e); }
        } else {
            try { _gtbShowTradeSetup('gtb-pane-trade'); } catch(e) {
                console.error('[TradePane] setup error:', e);
                jQ('#gtb-pane-trade').html('<div style="padding:20px;color:var(--gtb-red);font-size:12px;">Trade Recommender failed to load: ' + (e.message || String(e)) + '</div>');
            }
        }
    }],
    checklist: [function(){try{_gtbRenderChecklistPane();}catch(e){}}]
};

// ── Signals tab: 3-column layout ─────────────────────────────────────────────
// Col 1: Index/Stock OI compact  |  Col 2: Weighted constituents OI compact  |  Col 3: Futures accuracy
function _gtbSignalsPaneHtml() {
    return '<div id="gtb-sig-pane">'
        + '<div id="gtb-sig-cols">'
        // Col 1 — Index / Stock
        + '<div class="gtb-sig-col">'
        +   '<div class="gtb-sig-hdr">'
        +     '<i class="bi bi-layers-fill"></i> INDEX / STOCK OI'
        +     '<button class="gtb-sig-hdr-btn" id="gtb-sig-oi-index-reload" style="margin-left:auto;"><i class="bi bi-arrow-clockwise"></i> Reload</button>'
        +   '</div>'
        +   '<div id="gtb-sig-oi-index" style="overflow:auto;"><div class="gtb-sig-wait"><i class="bi bi-hourglass-split"></i> Loading…</div></div>'
        + '</div>'
        // Col 2 — Weighted constituents
        + '<div class="gtb-sig-col">'
        +   '<div class="gtb-sig-hdr">'
        +     '<i class="bi bi-diagram-3-fill"></i> WEIGHTED CONSTITUENTS OI'
        +     '<button class="gtb-sig-hdr-btn" id="gtb-sig-oi-wtd-reload" style="margin-left:auto;"><i class="bi bi-arrow-clockwise"></i> Reload</button>'
        +   '</div>'
        +   '<div id="gtb-sig-oi-wtd" style="overflow:auto;"><div class="gtb-sig-wait"><i class="bi bi-hourglass-split"></i> Loading…</div></div>'
        + '</div>'
        // Col 3 — Futures Remark Accuracy
        + '<div class="gtb-sig-col">'
        +   '<div class="gtb-sig-hdr">'
        +     '<i class="bi bi-bullseye"></i> FUTURES ACCURACY'
        +     '<button class="gtb-sig-hdr-btn" id="gtb-sig-fut-reload" style="margin-left:auto;"><i class="bi bi-arrow-clockwise"></i> Reload</button>'
        +   '</div>'
        +   '<div id="gtb-sig-fut-body"><div class="gtb-sig-wait"><i class="bi bi-hourglass-split"></i> Replaying 5-min candles…</div></div>'
        + '</div>'
        + '</div>'
        // IV Signals section — below the OI columns, scrollable
        + '<div id="gtb-sig-iv-wrap">'
        +   '<div style="padding:4px 8px 0;">'
        +     '<div class="gtb-sig-hdr" style="margin-bottom:4px;">'
        +       '<i class="bi bi-activity"></i> IV &amp; OI SIGNALS'
        +       '<button class="gtb-sig-hdr-btn" id="gtb-sig-iv-reload" style="margin-left:auto;"><i class="bi bi-arrow-clockwise"></i> Reload</button>'
        +     '</div>'
        +   '</div>'
        +   '<div id="gtb-sig-iv-section" style="padding:0 8px 8px;"><div class="gtb-sig-wait"><i class="bi bi-hourglass-split"></i> Loading…</div></div>'
        + '</div>'
        + '</div>';
}

// Renders the IV & OI Signals section as a table — one row per instrument, one column per signal.
function _gtbRenderIVSignalsSection() {
    var allList = _gtbAllOIInstruments();
    if (!allList.length) {
        jQ('#gtb-sig-iv-section').html('<div class="gtb-sig-wait" style="color:var(--gtb-muted);">No OI data yet — reload OI first.</div>');
        return;
    }
    var idxList = allList.filter(function(it) { return it.group === 'Index / Stock'; });
    var wtdList = allList.filter(function(it) { return it.group === 'Weighted constituent'; });

    var thStyle = 'padding:3px 6px;font-size:0.44rem;font-weight:600;color:var(--gtb-muted);border-bottom:1px solid var(--gtb-border);white-space:nowrap;text-align:left;';
    var thead = '<thead><tr>'
        + '<th style="' + thStyle + 'position:sticky;left:0;background:var(--gtb-surface2);z-index:1;">Instrument</th>'
        + '<th style="' + thStyle + '">IV Skew ' + _ii('sig-iv-skew') + '</th>'
        + '<th style="' + thStyle + '">ATM IV</th>'
        + '<th style="' + thStyle + '">Vol ' + _ii('sig-vol-ratio') + '</th>'
        + '<th style="' + thStyle + '">OI Conc ' + _ii('sig-oi-conc') + '</th>'
        + '<th style="' + thStyle + '">OI Vel ' + _ii('sig-oi-vel') + '</th>'
        + '<th style="' + thStyle + '">MP Δ ' + _ii('sig-mp-conv') + '</th>'
        + '<th style="' + thStyle + '">Outcome ' + _ii('sig-strip-outcome') + '</th>'
        + '</tr></thead>';

    function _ivRow(name) {
        var sm = INSTRUMENT_SCORE_MAP[name] || {};
        var ex = sm.oiExtras;
        var tdBase = 'padding:3px 6px;font-size:0.48rem;font-family:var(--gtb-mono);border-bottom:1px solid var(--gtb-border);white-space:nowrap;';

        if (!ex) {
            return '<tr>'
                + '<td style="' + tdBase + 'position:sticky;left:0;background:var(--gtb-surface2);font-weight:700;font-family:inherit;color:var(--gtb-text);">' + name + '</td>'
                + '<td colspan="7" style="' + tdBase + 'color:var(--gtb-muted);font-family:inherit;">No signal data — reload OI</td>'
                + '</tr>';
        }

        // IV Skew cell
        var ivSkewHtml = '—';
        if (ex.ivSkew !== null && ex.ivSkew !== undefined) {
            var sc = ex.ivSkew > 2 ? 'var(--gtb-red)' : ex.ivSkew < -2 ? 'var(--gtb-green)' : 'var(--gtb-muted)';
            var sl = ex.ivSkew > 2 ? 'Put' : ex.ivSkew < -2 ? 'Call' : 'Neutral';
            ivSkewHtml = '<span style="color:' + sc + ';font-weight:700;">' + (ex.ivSkew > 0 ? '+' : '') + ex.ivSkew + '% ' + sl + '</span>';
        }

        // ATM IV cell
        var atmIvHtml = '—';
        if (ex.atmIV !== null && ex.atmIV !== undefined) {
            var ac = ex.atmIV > 25 ? 'var(--gtb-red)' : ex.atmIV > 15 ? 'var(--gtb-amber)' : 'var(--gtb-green)';
            var an = ex.atmIV > 25 ? ' High' : ex.atmIV > 15 ? ' Normal' : ' Low';
            atmIvHtml = '<span style="color:' + ac + ';font-weight:700;">' + ex.atmIV + '%' + an + '</span>';
        }

        // Vol cell
        var volHtml = '—';
        if (ex.volRatio !== null && ex.volRatio !== undefined) {
            var vc = ex.volRatio >= 1.5 ? 'var(--gtb-green)' : ex.volRatio >= 0.8 ? 'var(--gtb-muted)' : 'var(--gtb-amber)';
            var vl = ex.volRatio >= 1.5 ? 'High' : ex.volRatio >= 0.8 ? 'Normal' : 'Low';
            volHtml = '<span style="color:' + vc + ';">' + ex.volRatio + '× (' + vl + ')</span>';
        }

        // OI Concentration cell
        var concHtml = '—';
        if (ex.oiConcentration !== null && ex.oiConcentration !== undefined) {
            var cc = ex.oiConcentration >= 60 ? 'var(--gtb-green)' : ex.oiConcentration <= 35 ? 'var(--gtb-amber)' : 'var(--gtb-muted)';
            var cl = ex.oiConcentration >= 60 ? 'Conc' : ex.oiConcentration <= 35 ? 'Spread' : 'Mod';
            concHtml = '<span style="color:' + cc + ';">' + ex.oiConcentration + '% ' + cl + '</span>';
        }

        // OI Velocity cell
        var velHtml = ex.oiVelocity
            ? '<span style="color:' + ex.oiVelocity.color + ';">' + ex.oiVelocity.label + ' (' + ex.oiVelocity.minutesAgo + 'm)</span>'
            : '<span style="color:var(--gtb-muted);">Pending</span>';

        // MP Δ cell
        var mpHtml = '—';
        if (ex.mpConvergence) {
            var ds = (ex.mpConvergence.delta > 0 ? '+' : '') + ex.mpConvergence.delta.toFixed(0);
            mpHtml = '<span style="color:' + ex.mpConvergence.color + ';">' + ds + ' ' + ex.mpConvergence.label + '</span>';
        } else {
            mpHtml = '<span style="color:var(--gtb-muted);">First read</span>';
        }

        // Outcome cell
        var sso = _gtbSigStripOutcome(ex);
        var outcomeHtml = '<span style="color:' + sso.color + ';font-weight:700;" title="' + sso.reason.replace(/"/g,"'") + '">' + sso.label + '</span>';

        return '<tr>'
            + '<td style="' + tdBase + 'position:sticky;left:0;background:var(--gtb-surface2);font-weight:700;font-family:inherit;color:var(--gtb-text);">' + name + '</td>'
            + '<td style="' + tdBase + '">' + ivSkewHtml + '</td>'
            + '<td style="' + tdBase + '">' + atmIvHtml + '</td>'
            + '<td style="' + tdBase + '">' + volHtml + '</td>'
            + '<td style="' + tdBase + '">' + concHtml + '</td>'
            + '<td style="' + tdBase + '">' + velHtml + '</td>'
            + '<td style="' + tdBase + '">' + mpHtml + '</td>'
            + '<td style="' + tdBase + '">' + outcomeHtml + '</td>'
            + '</tr>';
    }

    function _groupRows(list, groupLabel) {
        if (!list.length) return '';
        var sepStyle = 'padding:3px 6px;font-size:0.42rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--gtb-muted);background:var(--gtb-surface2);border-bottom:1px solid var(--gtb-border);';
        return '<tr><td colspan="8" style="' + sepStyle + '">' + groupLabel + '</td></tr>'
            + list.map(function(it) { return _ivRow(it.name); }).join('');
    }

    var tblStyle = 'border-collapse:collapse;width:100%;font-size:0.48rem;';
    var html = '<div style="overflow-x:auto;">'
        + '<table style="' + tblStyle + '" class="oic-matrix">'
        + thead + '<tbody>'
        + _groupRows(idxList, 'Index / Stock')
        + _groupRows(wtdList, 'Weighted Constituents')
        + '</tbody></table></div>';

    jQ('#gtb-sig-iv-section').html(html);
}

async function _gtbSigFetchAndRenderOI(isIndex) {
    var containerId = isIndex ? '#gtb-sig-oi-index' : '#gtb-sig-oi-wtd';
    var group       = isIndex ? 'Index / Stock' : 'Weighted constituent';
    var label       = isIndex ? 'Index OI' : 'Weighted OI';
    jQ(containerId).html('<div class="gtb-sig-wait"><i class="bi bi-hourglass-split"></i> Fetching OI data…</div>');
    try {
        var names;
        if (isIndex) {
            names = ['NIFTY 50', 'NIFTY BANK', 'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'USDINR'];
        } else {
            var w = Object.keys(NIFTY_50_WEIGHTED_STOCKS || {}).concat(Object.keys(NIFTY_BANK_WEIGHTED_STOCKS || {}));
            names = w.filter(function(n, i, a) { return a.indexOf(n) === i; });
        }
        var done = 0, total = names.length;
        _gtbProgress(label + ': 0/' + total);
        // Fetch sequentially so progress increments cleanly
        for (var i = 0; i < names.length; i++) {
            var name = names[i];
            _gtbProgress(label + ': ' + name + ' (' + (i + 1) + '/' + total + ')');
            try {
                if (!(_gtbIsMcxFuture && _gtbIsMcxFuture(name))) {
                    await showPrictionProbabilty(name);
                    showOIOBVBarChart(name);
                }
            } catch(e) { console.log('sig OI reload', name, e); }
            done++;
        }
        _gtbProgress(label + ' done ✓', 'green');
        setTimeout(_gtbProgressHide, 2000);
        var freshList = _gtbAllOIInstruments().filter(function(it) { return it.group === group; });
        _gtbSigOiColHtml(freshList, containerId);
        try { _gtbRenderIVSignalsSection(); } catch(e) {}
    } catch(e) {
        _gtbProgressHide();
        jQ(containerId).html('<div class="gtb-sig-wait" style="color:var(--gtb-red);">Error fetching OI data.</div>');
    }
}

// Renders the Max Pain & GEX panel inside an instrument detail column.
// Called after OI data is loaded by _dvFetchAndRender.
function _dvRenderMPGex(name, tid, sfx) {
    var el = document.getElementById('dv-mpgex-body-' + tid + sfx);
    if (!el) return;
    var d = _gtbComputeMaxPainGEX(name);
    if (!d) { el.innerHTML = '<div style="font-size:0.44rem;color:var(--gtb-muted);padding:4px;">No OI data available.</div>'; return; }

    var dc = d.maxPainDist > 0 ? 'var(--gtb-green)' : d.maxPainDist < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
    var gc = d.netGEX > 0 ? 'var(--gtb-green)' : d.netGEX < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
    var gRegime = d.netGEX > 0 ? '<span style="color:var(--gtb-green);">Stabilising</span>' : '<span style="color:var(--gtb-red);">Trending</span>';
    var flipHtml = d.flipZones.length
        ? d.flipZones.map(function(f) { return '<span class="mp-flip-pill">' + f + '</span>'; }).join('')
        : '<span style="color:var(--gtb-muted);">—</span>';
    var oc = _gtbMaxPainOutcome(d);

    // OI Signal Strip
    var h = '<div style="margin-bottom:6px;padding:4px;background:var(--gtb-surface);border:1px solid var(--gtb-border);">'
        + '<div style="font-size:0.38rem;color:var(--gtb-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px;">OI Signals</div>'
        + _gtbSigStripHtml(name)
        + '</div>';

    // Summary row (same columns as the popup table, stacked vertically for narrow column)
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;font-size:0.48rem;margin-bottom:6px;">';
    h += '<div><span style="color:var(--gtb-muted);font-size:0.4rem;">SPOT</span><br><b style="font-family:var(--gtb-mono);">' + d.spot + '</b></div>';
    h += '<div><span style="color:var(--gtb-muted);font-size:0.4rem;">MAX PAIN</span><br><b style="color:#ffbe0b;font-family:var(--gtb-mono);">' + d.maxPainK + '</b></div>';
    h += '<div><span style="color:var(--gtb-muted);font-size:0.4rem;">DISTANCE</span><br><b style="color:' + dc + ';font-family:var(--gtb-mono);">'
        + (d.maxPainDist > 0 ? '+' : '') + d.maxPainDist.toFixed(0)
        + ' (' + (d.maxPainPct > 0 ? '+' : '') + d.maxPainPct.toFixed(1) + '%)</b></div>';
    h += '<div><span style="color:var(--gtb-muted);font-size:0.4rem;">NET GEX</span><br><b style="color:' + gc + ';font-family:var(--gtb-mono);">'
        + (d.netGEX > 0 ? '+' : '') + d.netGEX.toFixed(0) + '</b> ' + gRegime + '</div>';
    h += '<div><span style="color:var(--gtb-muted);font-size:0.4rem;">FLIP ZONES</span><br>' + flipHtml + '</div>';
    h += '<div style="grid-column:1/-1;border-top:1px solid var(--gtb-border2);padding-top:4px;">'
        + '<span style="color:var(--gtb-muted);font-size:0.4rem;">OUTCOME</span><br>'
        + '<b style="color:' + oc.color + ';font-size:0.48rem;">' + oc.label + '</b>'
        + '<div style="font-size:0.42rem;color:var(--gtb-muted);margin-top:3px;line-height:1.4;white-space:normal;">' + oc.reason + '</div>'
        + '</div>';
    h += '</div>';

    // GEX bar chart (full width, same as non-compact view)
    h += _gtbMaxPainGEXHtml(name, false);

    el.innerHTML = h;
}

// ── OI extended signal computation ────────────────────────────────────────────
// Called after each OI fetch. Computes OI velocity and Max Pain convergence from
// localStorage snapshots, and copies map-level metrics (IV skew, vol ratio,
// OI concentration) into INSTRUMENT_SCORE_MAP[name].oiExtras for display.
function _gtbComputeOIExtras(name, oiData) {
    var sm = INSTRUMENT_SCORE_MAP[name];
    if (!sm) return;
    var now = Date.now();
    var snapKey = 'GTB_OI_SNAP_' + name.replace(/ /g, '_');
    var mpKey   = 'GTB_MP_PREV_' + name.replace(/ /g, '_');

    // ── OI Velocity ──────────────────────────────────────────────────────────
    // Compare total CHG_OI_CE+PE now vs a snapshot stored ≥20 min ago.
    var curCE = 0, curPE = 0;
    (oiData.tableData || []).forEach(function(r) {
        curCE += parseFloat(r['CHG_OI_CE']) || 0;
        curPE += parseFloat(r['CHG_OI_PE']) || 0;
    });
    var oiVelocity = null; // { deltaCE, deltaPE, minutesAgo, label, color }
    try {
        var snap = JSON.parse(localStorage.getItem(snapKey));
        if (snap && (now - snap.ts) >= 20 * 60 * 1000) {
            var minAgo = Math.round((now - snap.ts) / 60000);
            var dCE = parseFloat((curCE - snap.ce).toFixed(1));
            var dPE = parseFloat((curPE - snap.pe).toFixed(1));
            var net = dPE - dCE; // positive = PE OI growing faster = bullish build
            oiVelocity = {
                deltaCE: dCE, deltaPE: dPE, minutesAgo: minAgo,
                label: Math.abs(net) < 0.5 ? 'Slow' : net > 0 ? 'Fast ▲PE' : 'Fast ▲CE',
                color: Math.abs(net) < 0.5 ? 'var(--gtb-muted)' : net > 0 ? 'var(--gtb-green)' : 'var(--gtb-red)'
            };
        }
    } catch(e) {}
    // Always refresh snapshot
    try { localStorage.setItem(snapKey, JSON.stringify({ ts: now, ce: curCE, pe: curPE })); } catch(e) {}

    // ── Max Pain Convergence ─────────────────────────────────────────────────
    var mpConv = null; // { prev, curr, delta, label, color }
    var d = _gtbComputeMaxPainGEX(name);
    if (d) {
        try {
            var prevMp = parseFloat(localStorage.getItem(mpKey));
            if (!isNaN(prevMp) && prevMp > 0) {
                var delta = d.maxPainK - prevMp;
                // Convergence: Max Pain moving toward spot (sign of delta = sign of spot pulling MP)
                var converging = (delta > 0 && d.spot > d.maxPainK) || (delta < 0 && d.spot < d.maxPainK);
                mpConv = {
                    prev: prevMp, curr: d.maxPainK, delta: delta,
                    label: Math.abs(delta) < 25 ? 'Stable' : converging ? 'Converging' : 'Diverging',
                    color: Math.abs(delta) < 25 ? 'var(--gtb-muted)' : converging ? 'var(--gtb-green)' : 'var(--gtb-amber)'
                };
            }
        } catch(e) {}
        try { localStorage.setItem(mpKey, d.maxPainK); } catch(e) {}
    }

    // ── Volume Conviction Ratio ───────────────────────────────────────────────
    var volRatio = null;
    if (oiData.totalVolCE != null && oiData.prevVolCE != null) {
        var todayVol  = (oiData.totalVolCE || 0) + (oiData.totalVolPE || 0);
        var prevVol   = (oiData.prevVolCE  || 0) + (oiData.prevVolPE  || 0);
        if (prevVol > 0) volRatio = parseFloat((todayVol / prevVol).toFixed(2));
    }

    sm.oiExtras = {
        ivSkew:          oiData.ivSkew,
        atmIV:           oiData.atmIV,
        oiConcentration: oiData.oiConcentration,
        volRatio:        volRatio,
        totalVolCE:      oiData.totalVolCE,
        totalVolPE:      oiData.totalVolPE,
        oiVelocity:      oiVelocity,
        mpConvergence:   mpConv,
        fetchedAt:       now
    };
}

function _gtbSigOiColHtml(list, containerId) {
    if (!list.length) {
        jQ(containerId).html('<div class="gtb-sig-wait">No OI data yet. Run a refresh first.</div>');
        return;
    }
    var OFFS = [-2, -1, 0, 1, 2];
    var h = '<table class="oic-matrix"><thead><tr>'
        + '<th class="oic-sticky">Instrument</th>'
        + '<th>OI Score ' + _ii('sig-oi-score') + '</th>'
        + '<th>PCR ' + _ii('sig-oi-pcr') + '</th>'
        + OFFS.map(function(o){ return '<th>' + (o===0?'ATM★':'ATM'+(o>0?'+'+o:o)) + ' ' + _ii(o===0?'sig-oi-atm':'sig-oi-wing') + '</th>'; }).join('')
        + '</tr></thead><tbody>';
    list.forEach(function(it) {
        var name = it.name, sm = INSTRUMENT_SCORE_MAP[name] || {}, oiData = sm.oiData;
        if (!oiData || !oiData.tableData || !oiData.tableData.length) return;
        var td = oiData.tableData, atmIdx = -1;
        for (var i = 0; i < td.length; i++) { if (td[i]['ATM_STRIKE']) { atmIdx = i; break; } }
        if (atmIdx < 0) atmIdx = Math.floor(td.length / 2);
        var pc = 0; try { pc = parseFloat(generateTrend(name).change) || 0; } catch(e2) {}
        var oiScore = (sm.oi_obv != null) ? sm.oi_obv : 0;
        var scColor = oiScore > 0 ? 'var(--gtb-green)' : oiScore < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
        h += '<tr><td class="oic-sticky"><b>' + name + '</b></td>'
            + '<td style="color:' + scColor + ';font-weight:700;font-family:var(--gtb-mono);">' + (oiScore > 0 ? '+' : '') + (typeof oiScore === 'number' ? oiScore.toFixed(1) : oiScore) + '</td>'
            + '<td style="font-family:var(--gtb-mono);">' + (oiData.pcr != null ? oiData.pcr : '—') + '</td>';
        OFFS.forEach(function(off) {
            var idx = atmIdx + off;
            h += _gtbOICellCompact((idx >= 0 && idx < td.length) ? td[idx] : null, pc, off === 0);
        });
        h += '</tr>';
    });
    h += '</tbody></table>';
    jQ(containerId).html('<div style="overflow-x:auto;">' + h + '</div>');
}

// Renders a small labeled chip with tooltip for the OI signal strip.
// infoKey (optional) — if provided, renders a _ii() icon next to the label.
function _gtbSigChip(label, value, color, tip, infoKey) {
    var safe = (tip || '').replace(/"/g, "'");
    var lbl = label + (infoKey ? _ii(infoKey) : '');
    return '<span title="' + safe + '" style="display:inline-flex;flex-direction:column;align-items:center;'
        + 'background:var(--gtb-surface2);border:1px solid var(--gtb-border);padding:2px 5px;font-size:0.42rem;gap:1px;cursor:default;">'
        + '<span style="color:var(--gtb-muted);font-size:0.38rem;text-transform:uppercase;letter-spacing:0.04em;">' + lbl + '</span>'
        + '<span style="color:' + color + ';font-weight:700;font-family:var(--gtb-mono);">' + value + '</span>'
        + '</span>';
}

// Synthesises all 5 OI extras signals into a single directional outcome verdict.
// Returns { label, color, reason }.
function _gtbSigStripOutcome(ex) {
    if (!ex) return { label: 'No data', color: 'var(--gtb-muted)', reason: 'OI extras not yet computed.' };

    var bull = 0, bear = 0, reasons = [];

    // 1. IV Skew
    if (ex.ivSkew !== null && ex.ivSkew !== undefined) {
        if (ex.ivSkew > 2)       { bear++; reasons.push('Put skew (' + ex.ivSkew + '%) = fear bias'); }
        else if (ex.ivSkew < -2) { bull++; reasons.push('Call skew (' + ex.ivSkew + '%) = bullish demand'); }
        else                     { reasons.push('IV skew neutral (' + ex.ivSkew + '%)'); }
    }

    // 2. Volume conviction — amplifier, not direction
    var volNote = '';
    if (ex.volRatio !== null && ex.volRatio !== undefined) {
        if (ex.volRatio < 0.8) volNote = ' [Low volume — signal confidence reduced]';
        else if (ex.volRatio >= 1.5) volNote = ' [High volume — conviction confirmed]';
    }

    // 3. OI Concentration
    if (ex.oiConcentration !== null && ex.oiConcentration !== undefined) {
        if (ex.oiConcentration >= 60)     reasons.push('OI concentrated (' + ex.oiConcentration + '%) — strong wall at ATM');
        else if (ex.oiConcentration <= 35) reasons.push('OI spread (' + ex.oiConcentration + '%) — weak directional signal');
    }

    // 4. OI Velocity
    if (ex.oiVelocity) {
        var v = ex.oiVelocity;
        if (v.label.indexOf('▲PE') >= 0)  { bull++; reasons.push('OI velocity: fast PE build (bullish)'); }
        else if (v.label.indexOf('▲CE') >= 0) { bear++; reasons.push('OI velocity: fast CE build (bearish)'); }
        else                               { reasons.push('OI velocity slow — position rolling'); }
    }

    // 5. Max Pain Convergence
    if (ex.mpConvergence) {
        var mp = ex.mpConvergence;
        if (mp.label === 'Converging') reasons.push('Max Pain converging — pin risk, expect range');
        else if (mp.label === 'Diverging') reasons.push('Max Pain diverging — move expected');
    }

    var net = bull - bear;
    var label, color;
    if      (net >= 2)  { label = '▲ Bullish';  color = 'var(--gtb-green)'; }
    else if (net === 1) { label = '↑ Mild Bull'; color = 'var(--gtb-green)'; }
    else if (net === 0) { label = '↔ Neutral';  color = 'var(--gtb-muted)'; }
    else if (net === -1){ label = '↓ Mild Bear'; color = 'var(--gtb-red)'; }
    else                { label = '▼ Bearish';   color = 'var(--gtb-red)'; }

    return { label: label, color: color, reason: reasons.join(' · ') + volNote };
}

// Returns standalone signal strip chip HTML for any instrument.
// Used in commodities popup and instrument detail view (outside the OI table context).
function _gtbSigStripHtml(name) {
    var sm = INSTRUMENT_SCORE_MAP[name] || {};
    var ex = sm.oiExtras;
    var h = '<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:3px 0;">';
    if (ex) {
        if (ex.ivSkew !== null && ex.ivSkew !== undefined) {
            var skewColor = ex.ivSkew > 2 ? 'var(--gtb-red)' : ex.ivSkew < -2 ? 'var(--gtb-green)' : 'var(--gtb-muted)';
            var skewLabel = ex.ivSkew > 2 ? 'Put Skew' : ex.ivSkew < -2 ? 'Call Skew' : 'Neutral';
            var atmIvColor = ex.atmIV !== null && ex.atmIV > 25 ? 'var(--gtb-red)' : ex.atmIV > 15 ? 'var(--gtb-amber)' : 'var(--gtb-green)';
            var atmIvStr = ex.atmIV !== null ? ex.atmIV + '%' : '—';
            var atmIvNote = ex.atmIV !== null ? (ex.atmIV > 25 ? ' High' : ex.atmIV > 15 ? ' Normal' : ' Low') : '';
            var skewTip = 'PE OTM IV minus CE OTM IV at ATM±2. +ve = put fear (bearish bias). −ve = call demand (bullish). ATM IV: ' + atmIvStr + ' — high ATM IV = elevated uncertainty.';
            h += '<span title="' + skewTip.replace(/"/g,"'") + '" style="display:inline-flex;flex-direction:column;align-items:center;background:var(--gtb-surface2);border:1px solid var(--gtb-border);padding:2px 5px;font-size:0.42rem;gap:1px;cursor:default;">'
                + '<span style="color:var(--gtb-muted);font-size:0.38rem;text-transform:uppercase;letter-spacing:0.04em;">IV Skew' + _ii('sig-iv-skew') + '</span>'
                + '<span style="color:' + skewColor + ';font-weight:700;font-family:var(--gtb-mono);">' + (ex.ivSkew > 0 ? '+' : '') + ex.ivSkew + '% ' + skewLabel + '</span>'
                + '<span style="color:' + atmIvColor + ';font-size:0.38rem;font-family:var(--gtb-mono);">ATM IV ' + atmIvStr + atmIvNote + '</span>'
                + '</span>';
        }
        if (ex.volRatio !== null && ex.volRatio !== undefined) {
            var vrColor = ex.volRatio >= 1.5 ? 'var(--gtb-green)' : ex.volRatio >= 0.8 ? 'var(--gtb-muted)' : 'var(--gtb-amber)';
            var vrLabel = ex.volRatio >= 1.5 ? 'High' : ex.volRatio >= 0.8 ? 'Normal' : 'Low';
            h += _gtbSigChip('Vol', ex.volRatio + '× (' + vrLabel + ')', vrColor,
                'Today total option volume vs yesterday. ≥1.5× = high conviction. CE vol: ' + (ex.totalVolCE || '—') + ' PE vol: ' + (ex.totalVolPE || '—'), 'sig-vol-ratio');
        }
        if (ex.oiConcentration !== null && ex.oiConcentration !== undefined) {
            var concColor = ex.oiConcentration >= 60 ? 'var(--gtb-green)' : ex.oiConcentration <= 35 ? 'var(--gtb-amber)' : 'var(--gtb-muted)';
            var concLabel = ex.oiConcentration >= 60 ? 'Concentrated' : ex.oiConcentration <= 35 ? 'Spread' : 'Moderate';
            h += _gtbSigChip('OI Conc', ex.oiConcentration + '% ' + concLabel, concColor,
                '% of total OI at ATM±1. ≥60% = strong wall. ≤35% = OI spread thin.', 'sig-oi-conc');
        }
        if (ex.oiVelocity) {
            var v = ex.oiVelocity;
            h += _gtbSigChip('OI Vel', v.label + ' (' + v.minutesAgo + 'm)', v.color,
                'OI build rate vs ' + v.minutesAgo + ' min ago. ΔCE: ' + v.deltaCE + ' ΔPE: ' + v.deltaPE + '.', 'sig-oi-vel');
        } else {
            h += _gtbSigChip('OI Vel', 'Pending', 'var(--gtb-muted)', 'OI velocity needs a snapshot ≥20 min old.', 'sig-oi-vel');
        }
        if (ex.mpConvergence) {
            var mp = ex.mpConvergence;
            var deltaStr = (mp.delta > 0 ? '+' : '') + mp.delta.toFixed(0);
            h += _gtbSigChip('MP Δ', deltaStr + ' ' + mp.label, mp.color,
                'Max Pain moved ' + deltaStr + ' pts since last fetch (prev: ' + mp.prev + ' → now: ' + mp.curr + ').', 'sig-mp-conv');
        } else {
            h += _gtbSigChip('MP Δ', 'First read', 'var(--gtb-muted)', 'Needs two OI fetches to compare.', 'sig-mp-conv');
        }
        var sso = _gtbSigStripOutcome(ex);
        h += _gtbSigChip('Outcome', sso.label, sso.color, sso.reason, 'sig-strip-outcome');
    } else {
        h += '<span style="font-size:0.44rem;color:var(--gtb-muted);">Signal extras not yet computed — reload OI.</span>';
    }
    h += '</div>';
    return h;
}

// Shared: returns unique weighted constituent names (N50 + BNK, deduped)
function _gtbMpWeightedNames() {
    var n50 = Object.keys(NIFTY_50_WEIGHTED_STOCKS || {});
    var bnk = Object.keys(NIFTY_BANK_WEIGHTED_STOCKS || {});
    return n50.concat(bnk).filter(function(n, i, a) { return a.indexOf(n) === i; });
}

// Shared: builds a Max Pain summary <tbody> rows string for a list of instruments
function _gtbMpSummaryRows(instrs) {
    return instrs.map(function(nm) {
        var d = _gtbComputeMaxPainGEX(nm);
        if (!d) return '<tr><td><b>' + nm + '</b></td><td colspan="7" style="color:var(--gtb-muted);font-size:0.5rem;">No OI data</td></tr>';
        var dc = d.maxPainDist > 0 ? '#3fb950' : d.maxPainDist < 0 ? '#f85149' : '#7d8590';
        var gc = d.netGEX > 0 ? '#3fb950' : d.netGEX < 0 ? '#f85149' : '#7d8590';
        var gRegime = d.netGEX > 0 ? '<span style="color:#3fb950;">Stabilising</span>' : '<span style="color:#f85149;">Trending</span>';
        var flipHtml = d.flipZones.length ? d.flipZones.map(function(f){return '<span class="mp-flip-pill">'+f+'</span>';}).join('') : '<span style="color:var(--gtb-muted);">—</span>';
        var oc = _gtbMaxPainOutcome(d);
        return '<tr>'
            + '<td><b>' + nm + '</b></td>'
            + '<td>' + d.spot + '</td>'
            + '<td style="color:#ffbe0b;font-weight:700;">' + d.maxPainK + '</td>'
            + '<td style="color:' + dc + ';">' + (d.maxPainDist > 0 ? '+' : '') + d.maxPainDist.toFixed(0) + ' (' + (d.maxPainPct > 0?'+':'') + d.maxPainPct.toFixed(1) + '%)</td>'
            + '<td style="color:' + gc + ';font-weight:700;">' + (d.netGEX > 0?'+':'') + d.netGEX.toFixed(0) + '</td>'
            + '<td>' + gRegime + '</td>'
            + '<td>' + flipHtml + '</td>'
            + '<td style="white-space:normal;word-break:break-word;">'
            +   '<span style="font-weight:700;font-size:0.55rem;color:' + oc.color + ';" title="' + oc.reason.replace(/"/g,"'") + '">' + oc.label + '</span>'
            +   '<div style="font-size:0.44rem;color:var(--gtb-muted);line-height:1.3;margin-top:2px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;" title="' + oc.reason.replace(/"/g,"'") + '">' + oc.reason + '</div>'
            + '</td>'
            + '</tr>';
    }).join('');
}

// Shared: builds a complete Max Pain summary table HTML
function _gtbMpSummaryTable(rows) {
    return '<table class="aoi-tbl mp-summary-tbl" style="table-layout:fixed;width:100%;"><thead><tr>'
        + '<th style="width:90px;">Instrument</th>'
        + '<th style="width:65px;">Spot ' + _ii('mp-col-spot') + '</th>'
        + '<th style="width:65px;">Max Pain ' + _ii('mp-col-maxpain') + '</th>'
        + '<th style="width:85px;">Distance ' + _ii('mp-col-distance') + '</th>'
        + '<th style="width:65px;">Net GEX ' + _ii('mp-col-netgex') + '</th>'
        + '<th style="width:75px;">GEX Regime ' + _ii('mp-col-regime') + '</th>'
        + '<th style="width:80px;">Flip Zones ' + _ii('mp-col-flip') + '</th>'
        + '<th>Outcome ' + _ii('mp-col-outcome') + '</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table>';
}

// ── Max Pain tab: static shell ────────────────────────────────────────────────
function _gtbMpGexPaneHtml() {
    var instrs = ['NIFTY 50', 'NIFTY BANK', 'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'CRUDEOILM'];
    return '<div id="gtb-mp-pane">'
        + '<div class="gtb-sig-hdr" style="margin-bottom:6px;">'
        +   '<i class="bi bi-bar-chart-steps"></i> MAX PAIN &amp; GAMMA EXPOSURE ' + _ii('mp-summary')
        +   '<button class="gtb-sig-hdr-btn" id="gtb-mp-reload" style="margin-left:auto;"><i class="bi bi-arrow-clockwise"></i> Reload OI</button>'
        + '</div>'
        + '<div class="gtb-sig-hdr" style="margin-bottom:4px;font-size:0.55rem;">Index / Stock</div>'
        + '<div id="gtb-mp-summary-wrap" style="overflow-x:auto;margin-bottom:12px;">'
        +   '<div class="gtb-sig-wait"><i class="bi bi-hourglass-split"></i> Loading…</div>'
        + '</div>'
        + '<div class="gtb-sig-hdr" style="margin-bottom:4px;font-size:0.55rem;">Weighted Constituents</div>'
        + '<div id="gtb-mp-wtd-wrap" style="overflow-x:auto;margin-bottom:12px;">'
        +   '<div class="gtb-sig-wait"><i class="bi bi-hourglass-split"></i> Loading…</div>'
        + '</div>'
        + '<div class="gtb-sig-hdr" style="margin-bottom:6px;">'
        +   '<i class="bi bi-bar-chart-steps"></i> GEX PROFILE PER INSTRUMENT ' + _ii('mp-gex')
        + '</div>'
        + '<div id="gtb-mp-cards-wrap" class="mp-cards-grid">'
        +   instrs.map(function(nm) {
                return '<div class="mp-instr-card" id="gtb-mp-card-' + nm.replace(/ /g,'-') + '">'
                    + '<div class="mp-instr-name"><i class="bi bi-bar-chart-steps"></i> ' + nm + '</div>'
                    + '<div class="gtb-sig-wait"><i class="bi bi-hourglass-split"></i> Loading…</div>'
                    + '</div>';
            }).join('')
        + '</div>'
        + '</div>';
}

function _gtbRenderMpGexPane() {
    var instrs = ['NIFTY 50', 'NIFTY BANK', 'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'CRUDEOILM'];

    // Index / Stock summary table
    jQ('#gtb-mp-summary-wrap').html(_gtbMpSummaryTable(_gtbMpSummaryRows(instrs)));

    // Weighted constituents summary table
    var wtdNames = _gtbMpWeightedNames();
    var wtdHtml = wtdNames.length
        ? _gtbMpSummaryTable(_gtbMpSummaryRows(wtdNames))
        : '<div style="font-size:0.5rem;color:var(--gtb-muted);padding:4px;">No weighted constituent OI data — reload OI first.</div>';
    jQ('#gtb-mp-wtd-wrap').html(wtdHtml);

    // GEX profile cards
    instrs.forEach(function(nm) {
        var cardEl = document.getElementById('gtb-mp-card-' + nm.replace(/ /g,'-'));
        if (!cardEl) return;
        var d = _gtbComputeMaxPainGEX(nm);
        if (!d) {
            cardEl.querySelector('.gtb-sig-wait') && (cardEl.querySelector('.gtb-sig-wait').innerHTML = '<span style="color:var(--gtb-muted);">No OI data.</span>');
            return;
        }
        var chartHtml = '<div class="mp-instr-name"><i class="bi bi-bar-chart-steps"></i> ' + nm + '</div>'
            + _gtbMaxPainGEXHtml(nm, false);
        cardEl.innerHTML = chartHtml;
    });

    // Reload button — fetch fresh OI for index/stock AND weighted constituents then re-render
    jQ(document).off('click.mpreload').on('click.mpreload', '#gtb-mp-reload', function() {
        _gtbSigFetchAndRenderOI(true);   // index / stock
        _gtbSigFetchAndRenderOI(false);  // weighted constituents
        setTimeout(function() { try { _gtbRenderMpGexPane(); } catch(e) {} }, 1200);
    });
}

function _gtbRenderSignalsPane() {
    // ── Col 1 & 2: OI Compare compact, split by group ────────────────────────
    try {
        var allList = _gtbAllOIInstruments();
        _gtbSigOiColHtml(allList.filter(function(it) { return it.group === 'Index / Stock'; }),       '#gtb-sig-oi-index');
        _gtbSigOiColHtml(allList.filter(function(it) { return it.group === 'Weighted constituent'; }), '#gtb-sig-oi-wtd');
    } catch(e) {}
    try { _gtbRenderIVSignalsSection(); } catch(e) {}

    // ── Col 3: Futures Accuracy (async) ──────────────────────────────────────
    _gtbLoadFutAccInPane();

    // OI reload buttons — fetch fresh data then re-render OI tables + IV section
    jQ(document).off('click.sigoireload').on('click.sigoireload', '#gtb-sig-oi-index-reload, #gtb-sig-oi-wtd-reload', function() {
        var isIndex = jQ(this).attr('id') === 'gtb-sig-oi-index-reload';
        _gtbSigFetchAndRenderOI(isIndex);
    });

    // IV Signals reload — re-fetch both groups then re-render section
    jQ(document).off('click.sigivreload').on('click.sigivreload', '#gtb-sig-iv-reload', function() {
        _gtbSigFetchAndRenderOI(true);
        _gtbSigFetchAndRenderOI(false);
        setTimeout(function() { try { _gtbRenderIVSignalsSection(); } catch(e) {} }, 1200);
    });

    // Futures reload button
    jQ(document).off('click.sigfutreload').on('click.sigfutreload', '#gtb-sig-fut-reload', function() {
        jQ('#gtb-sig-fut-body').html('<div class="gtb-sig-wait"><i class="bi bi-hourglass-split"></i> Replaying 5-min candles…</div>');
        _gtbLoadFutAccInPane();
    });
}

async function _gtbLoadFutAccInPane() {
    try {
        var instruments = ['NIFTY 50', 'NIFTY BANK', 'RELIANCE', 'HDFCBANK', 'ICICIBANK'];
        var vix = 0;
        try { vix = parseFloat((JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}')['INDIA VIX'] || {}).ltp) || 0; } catch(er) {}
        var accMap = {}, used = [];
        var cds = await Promise.all(instruments.map(function(nm) {
            return _gtbFetchFutCandles(nm).catch(function() { return null; });
        }));
        cds.forEach(function(cd, idx) {
            if (cd) { try { _gtbReconstructFutAccuracy(cd, vix, accMap); used.push(instruments[idx]); } catch(err) {} }
        });
        var rows = Object.keys(accMap).map(function(key) {
            var a = accMap[key];
            return { remark: key, total: a.total, hits: a.hits,
                     win: a.total ? Math.round(a.hits / a.total * 100) : 0,
                     avgPts: a.total ? (a.pts / a.total) : 0,
                     dir: getFuturesTrendScore(key) };
        }).sort(function(x, y) { return y.total - x.total; });

        var body;
        if (!rows.length) {
            body = '<div class="gtb-sig-wait" style="color:var(--gtb-red);">No intraday futures data available to reconstruct.</div>';
        } else {
            body = '<div class="gtb-t915-sub" style="padding:4px 8px 2px;">Replayed every 5-min candle today across <b>'
                 + used.join(', ') + '</b>. Higher win-rate + positive avg-pts = reliable; dimmed rows are low-sample.</div>';
            body += '<table class="gtb-t915-table"><thead><tr>'
                  + '<th>Remark</th><th>Bias</th><th>Samples</th><th>Win-rate</th><th>Avg pts (5-min)</th>'
                  + '</tr></thead><tbody>';
            rows.forEach(function(r) {
                var bc  = r.dir > 0 ? 'up' : r.dir < 0 ? 'down' : 'flat';
                var wc  = r.win >= 60 ? 'var(--gtb-green)' : r.win <= 40 ? 'var(--gtb-red)' : 'var(--gtb-amber)';
                var ptc = r.avgPts >= 0 ? 'var(--gtb-green)' : 'var(--gtb-red)';
                var dirc = r.dir > 0 ? 'var(--gtb-green)' : r.dir < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
                var isReliable = r.win >= 60 && r.avgPts > 0 && r.total >= 8;
                var rowStyle = r.total < 8 ? 'opacity:0.55;' : isReliable ? 'background:var(--gtb-green)18;outline:1px solid var(--gtb-green)44;' : '';
                body += '<tr' + (rowStyle ? ' style="' + rowStyle + '"' : '') + '>'
                    + '<td><span class="gtb-t915-out ' + bc + '">' + r.remark + '</span>' + (isReliable ? ' <span style="font-size:0.44rem;color:var(--gtb-green);font-weight:800;">★</span>' : '') + '</td>'
                    + '<td style="font-family:var(--gtb-mono);color:' + dirc + ';">' + (r.dir > 0 ? '▲' : r.dir < 0 ? '▼' : '—') + '</td>'
                    + '<td class="gtb-t915-date">' + r.total + '</td>'
                    + '<td style="font-family:var(--gtb-mono);font-weight:800;color:' + wc + ';">' + r.win + '%</td>'
                    + '<td style="font-family:var(--gtb-mono);color:' + ptc + ';">' + (r.avgPts >= 0 ? '+' : '') + r.avgPts.toFixed(1) + '</td>'
                    + '</tr>';
            });
            body += '</tbody></table>';
        }
        jQ('#gtb-sig-fut-body').html('<div class="gtb-t915-wrap">' + body + '</div>');
    } catch(e) {
        jQ('#gtb-sig-fut-body').html('<div class="gtb-sig-wait" style="color:var(--gtb-red);">Error loading futures data.</div>');
    }
}

function _gtbRenderPane(tabId) {
    var $p = jQ('#gtb-pane-' + tabId);
    var gridFn = _GTB_PANE_GRIDS[tabId];
    if (!gridFn) return;
    var html = gridFn();
    // null means the pane manages its own content — don't wipe it on every tab switch
    if (html !== null) $p.html(html || '');
    (_GTB_PANE_RENDERS[tabId] || []).forEach(function(fn) { fn(); });
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

// ── NSE Market Holiday Checker ────────────────────────────────────────────────
// Fetches trading holidays from NSE (FO segment) via GM_xmlhttpRequest (bypasses
// CORS). Caches in localStorage for 7 days. On startup, shows a banner if today
// is a holiday. Also updates #gtb-holiday-badge in the topbar.

var _GTB_HOLIDAYS = [];   // [{date:'DD-Mon-YYYY', desc:'...'}]

function _gtbFetchHolidays() {
    return new Promise(function (resolve) {
        var CACHE_KEY = 'GTB_NSE_HOLIDAYS';
        var cached = null;
        try { cached = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (_) {}
        var now = Date.now();
        // Refresh cache once a week
        if (cached && cached.ts && (now - cached.ts) < 7 * 24 * 3600 * 1000 && Array.isArray(cached.data)) {
            _GTB_HOLIDAYS = cached.data;
            return resolve(cached.data);
        }
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://www.nseindia.com/api/holiday-master?type=trading',
            headers: {
                'User-Agent': navigator.userAgent,
                'Accept': 'application/json',
                'Referer': 'https://www.nseindia.com/'
            },
            onload: function (r) {
                try {
                    var json = JSON.parse(r.responseText);
                    // Use FO segment; fall back to CM
                    var seg = json['FO'] || json['CM'] || [];
                    var list = seg.map(function (h) { return { date: h.tradingDate, desc: h.description }; });
                    _GTB_HOLIDAYS = list;
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: now, data: list }));
                    resolve(list);
                } catch (e) { console.warn('NSE holiday parse error', e); resolve([]); }
            },
            onerror: function () { resolve([]); }
        });
    });
}

function _gtbTodayHoliday() {
    // NSE format: "15-Jan-2025"
    var d = new Date();
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var dd = ('0' + d.getDate()).slice(-2);
    var mon = months[d.getMonth()];
    var yyyy = d.getFullYear();
    var todayStr = dd + '-' + mon + '-' + yyyy;
    for (var i = 0; i < _GTB_HOLIDAYS.length; i++) {
        if (_GTB_HOLIDAYS[i].date === todayStr) return _GTB_HOLIDAYS[i];
    }
    return null;
}

async function _gtbCheckHolidayAlert() {
    await _gtbFetchHolidays();
    var hol = _gtbTodayHoliday();
    // Update topbar badge
    var $badge = jQ('#gtb-holiday-badge');
    if (hol) {
        $badge.html('<i class="bi bi-calendar-x-fill" style="color:#f85149;margin-right:3px;"></i>'
            + '<span style="color:#f85149;font-weight:700;">HOLIDAY</span>'
            + '<span style="color:var(--gtb-muted);margin-left:4px;font-size:0.58rem;">' + hol.desc + '</span>');
        $badge.show();
        // Show prominent alert toast
        Toastify({
            text: '<i class="bi bi-calendar-x-fill" style="margin-right:6px;color:#f85149;font-size:1rem;"></i>'
                + '<span style="font-size:0.75rem;font-weight:700;color:#f85149;">MARKET HOLIDAY TODAY</span><br>'
                + '<span style="font-size:0.65rem;color:#c9d1d9;">' + hol.desc + '</span>',
            duration: 10000, gravity: 'top', position: 'center', escapeMarkup: false, close: true,
            style: { background: '#1a0a0a', border: '2px solid #f85149', 'border-radius': '8px',
                     padding: '12px 18px', 'min-width': '280px', 'line-height': '1.6' }
        }).showToast();
    } else {
        $badge.hide();
        // Show upcoming holidays (next 3) in topbar badge
        var d = new Date();
        var upcoming = _GTB_HOLIDAYS.filter(function (h) {
            var parts = h.date.split('-');
            var months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
            var hd = new Date(parseInt(parts[2]), months[parts[1]], parseInt(parts[0]));
            return hd > d;
        }).slice(0, 1);
        if (upcoming.length) {
            var u = upcoming[0];
            $badge.html('<i class="bi bi-calendar2-check" style="color:var(--gtb-muted);margin-right:3px;"></i>'
                + '<span style="color:var(--gtb-muted);font-size:0.58rem;">Next holiday: <b>' + u.date + '</b> — ' + u.desc + '</span>');
            $badge.show();
        }
    }
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
    // Re-apply all persisted layout settings after DOM rebuild
    _gtbApplyTheme(localStorage.getItem('GTB_THEME') || 'dark');
    _gtbApplyGridH(parseInt(localStorage.getItem('GTB_ROW_H') || '190'));
    _gtbApplyCardW(parseInt(localStorage.getItem('GTB_CARD_W') || '300'));
    _gtbApplyColsCfg();
    _gtbApplyInstrsCfg();

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
                try {
                    var res = await showFutureDetails(name); setFutureDetails(name, res);
                    if (res) {
                        if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
                        INSTRUMENT_SCORE_MAP[name].avwap = res['vwapPrice'] || 0;
                        INSTRUMENT_SCORE_MAP[name].vwapBullishDaily = res['vwapBullishDaily'] !== undefined ? res['vwapBullishDaily'] : null;
                    }
                } catch(e) { console.log(name + ' fut', e); }
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
                    INSTRUMENT_SCORE_MAP[name].avwap = res['vwapPrice'] || 0;
                    await showPrictionProbabiltyMCX(name, res);
                    showOIOBVBarChart(name);
                    try {
                        var _mcxOiData = (typeof stock !== 'undefined' && stock.length && stock[0]['DATA']) ? stock[0]['DATA'] : null;
                        if (_mcxOiData && _mcxOiData.tableData && _mcxOiData.tableData.length) {
                            INSTRUMENT_SCORE_MAP[name].oiData = _mcxOiData;
                            _gtbRenderOIMatrix(name);
                        }
                    } catch(e) {}
                } catch(e) { console.log(name + ' mcx', e); }
            })(),
        ]);
    }

    var _phase2 = [
        _refreshNSE('NIFTY 50'),
        _refreshNSE('NIFTY BANK'),
        _refreshNSE('RELIANCE'),
        _refreshNSE('HDFCBANK'),
        _refreshNSE('ICICIBANK'),
        showTopChart('GIFT NIFTY').catch(function(e) { console.log('GIFT NIFTY chart', e); }),
        showTopChart('SENSEX').catch(function(e) { console.log('SENSEX chart', e); }),
        _refreshMCX('CRUDEOILM'),
        _refreshMCX('USDINR'),
    ];
    // Also refresh any custom instruments added dynamically
    try {
        _gtbGetCustomInstrs().forEach(function(ci) {
            _phase2.push(
                ci.mcx ? _refreshMCX(ci.name) : _refreshNSE(ci.name)
            );
        });
    } catch(e) {}
    await Promise.all(_phase2);

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

    try { _gtbUpdateTrendZones(); } catch(e) {}
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


// ── Dynamic instrument: refresh a single card after it's added ────────────────
async function _gtbRefreshOneInstrument(name, isMcx) {
    var tid = name.replace(/ /g, '-').replace(/&/g, '-');
    try {
        if (isMcx) {
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
        } else {
            await Promise.all([
                showTopChart(name).catch(function(e) { console.log(name + ' chart', e); }),
                (async function() {
                    try {
                        var res = await showFutureDetails(name);
                        setFutureDetails(name, res);
                        if (res) {
                            if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
                            INSTRUMENT_SCORE_MAP[name].futures_trend = getFuturesTrendScore(res['REMARK']);
                            INSTRUMENT_SCORE_MAP[name].avwap = res['vwapPrice'] || 0;
                        INSTRUMENT_SCORE_MAP[name].vwapBullishDaily = res['vwapBullishDaily'] !== undefined ? res['vwapBullishDaily'] : null;
                        }
                    } catch(e) { console.log(name + ' fut', e); }
                })(),
                (async function() {
                    try { await showPrictionProbabilty(name); showOIOBVBarChart(name); } catch(e) { console.log(name + ' oi', e); }
                })(),
            ]);
        }
        try { _gtbRenderOIMatrix(name); } catch(e) {}
        try {
            var _sc2 = computeInstrumentScore(name);
            if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
            INSTRUMENT_SCORE_MAP[name].score = _sc2;
        } catch(e) {}
        try { _gtbUpdateWeightBars(name); } catch(e) {}
        try { _gtbUpdateTrendZones(); } catch(e) {}
        _gtbToast(name + ' loaded', 'success');
    } catch(e) {
        _gtbToast('Error loading ' + name, 'error');
        console.log('_gtbRefreshOneInstrument', e);
    }
}

// ── Add instrument popup ──────────────────────────────────────────────────────
function _gtbSaveCustomInstrs(list) {
    localStorage.setItem('GTB_CUSTOM_INSTRS', JSON.stringify(list));
}
function _gtbGetCustomInstrs() {
    try { return JSON.parse(localStorage.getItem('GTB_CUSTOM_INSTRS') || '[]'); } catch(e) { return []; }
}

function _gtbAddInstrPopupHtml() {
    var customs = _gtbGetCustomInstrs();
    var s = '<div style="padding:8px;font-size:0.6rem;color:var(--gtb-text);">';

    s += '<div style="margin-bottom:8px;font-size:0.55rem;color:var(--gtb-muted);">Enter any NSE F&amp;O symbol (e.g. INFY, TCS, SBIN) or MCX commodity.</div>';

    s += '<div style="display:flex;gap:4px;margin-bottom:10px;">';
    s +=   '<input id="gtb-add-instr-input" type="text" placeholder="e.g. INFY" autocomplete="off" '
         + 'style="flex:1;font-size:0.6rem;background:var(--gtb-surface2);color:var(--gtb-text);border:1px solid var(--gtb-border2);padding:4px 6px;outline:none;" />';
    s +=   '<label style="display:flex;align-items:center;gap:3px;font-size:0.55rem;color:var(--gtb-muted);cursor:pointer;">'
         + '<input type="checkbox" id="gtb-add-instr-mcx"> MCX</label>';
    s +=   '<button id="gtb-add-instr-go" style="font-size:0.55rem;padding:3px 8px;background:var(--gtb-accent);color:#fff;border:none;cursor:pointer;">Add</button>';
    s += '</div>';

    if (customs.length) {
        s += '<div style="font-size:0.5rem;font-weight:700;letter-spacing:.06em;color:var(--gtb-muted);text-transform:uppercase;margin-bottom:4px;">Custom instruments</div>';
        s += '<div id="gtb-custom-instr-list">';
        customs.forEach(function(ci) {
            s += '<div class="gtb-ci-row" style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--gtb-border2);">'
               + '<span style="flex:1;font-weight:700;">' + ci.name + '</span>'
               + (ci.mcx ? '<span style="font-size:0.45rem;color:var(--gtb-muted);">MCX</span>' : '')
               + '<button class="gtb-ci-refresh sv-icon-btn" data-name="' + ci.name + '" data-mcx="' + (ci.mcx ? '1' : '0') + '" title="Refresh"><i class="bi bi-arrow-clockwise"></i></button>'
               + '<button class="gtb-ci-remove sv-icon-btn" data-name="' + ci.name + '" title="Remove" style="color:var(--gtb-red);"><i class="bi bi-x-lg"></i></button>'
               + '</div>';
        });
        s += '</div>';
    } else {
        s += '<div style="color:var(--gtb-muted);font-size:0.5rem;">No custom instruments yet.</div>';
    }
    s += '</div>';
    return s;
}

jQ(document).on('click', '#gtb-add-instr-btn', function(e) {
    e.stopPropagation();
    var popId = 'pop-up-window-gtb-add-instr';
    var $pop = jQ('#' + popId);
    if ($pop.length) {
        if ($pop.is(':visible')) { try { $pop.PopupWindow('show'); } catch(ex) {} return; }
        try { $pop.PopupWindow('destroy'); } catch(ex) {}
        $pop.remove();
    }
    showPopUpWindow('gtb-add-instr', _gtbAddInstrPopupHtml(), 'Add Instrument', 300, 320);
    var cls = 'popup-custom-style-gtb-add-instr';
    jQ('.' + cls).addClass((localStorage.getItem('GTB_THEME') || 'dark') === 'light' ? 'gtb-light' : '');
    var titleHtml = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<i class="bi bi-plus-circle-fill" style="color:#00b4d8;font-size:0.7rem;"></i>'
        + '<span style="font-weight:800;font-size:0.7rem;">ADD INSTRUMENT</span>'
        + popupWinControls(cls) + '</div>';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html(titleHtml);
    hideNativePopupButtons(cls);
});

// Add button handler
jQ(document).on('click', '#gtb-add-instr-go', function() {
    var raw = jQ('#gtb-add-instr-input').val().trim().toUpperCase();
    if (!raw) return;
    var isMcx = jQ('#gtb-add-instr-mcx').is(':checked');

    // Check not already present
    var existing = jQ('#gtb-pane-' + raw.replace(/ /g,'-').replace(/&/g,'-'));
    if (existing.length) { _gtbToast(raw + ' already in overview', 'warn'); return; }

    // Build and append card
    var item = { name: raw, mcx: isMcx, custom: true };
    var cardHtml = '';
    (function _buildOneCard() {
        // Call the inner _buildCard via re-running commonMarkupPlaceHolder is too expensive.
        // Instead build the card HTML directly using the same template.
        var tempH = '';
        // We capture the card HTML by temporarily running _buildCard logic
        // The simplest way is to trigger commonShowPopupWindow which rebuilds everything.
        // Instead: add to localStorage first, then rebuild.
    })();

    // Save to localStorage
    var customs = _gtbGetCustomInstrs();
    if (!customs.find(function(c){ return c.name === raw; })) {
        customs.push({ name: raw, mcx: isMcx });
        _gtbSaveCustomInstrs(customs);
    }

    // Append the card to #gtb-rows without rebuilding the dashboard
    var newItem = { name: raw, mcx: isMcx, custom: true };
    var cardHtml = _buildCardStandalone(newItem);
    jQ('#gtb-rows').append(cardHtml);
    _gtbToast(raw + ' added — click Refresh on its card to load data', 'success');

    // Close popup
    try { jQ('#pop-up-window-gtb-add-instr').PopupWindow('destroy'); } catch(ex) {}
    jQ('#pop-up-window-gtb-add-instr').remove();
});

// Refresh one custom instrument
jQ(document).on('click', '.gtb-ci-refresh', function() {
    var name = jQ(this).data('name');
    var isMcx = jQ(this).data('mcx') === '1' || jQ(this).data('mcx') === 1;
    _gtbToast('Refreshing ' + name + '…', 'info');
    _gtbRefreshOneInstrument(name, isMcx);
});

// Remove custom instrument
jQ(document).on('click', '.gtb-ci-remove', function() {
    var name = jQ(this).data('name');
    var customs = _gtbGetCustomInstrs().filter(function(c) { return c.name !== name; });
    _gtbSaveCustomInstrs(customs);
    _gtbToast(name + ' removed — refreshing dashboard…', 'info');
    setTimeout(function() { commonShowPopupWindow(); }, 600);
    try { jQ('#pop-up-window-gtb-add-instr').PopupWindow('destroy'); } catch(ex) {}
    jQ('#pop-up-window-gtb-add-instr').remove();
});

// Enter key in add input
jQ(document).on('keydown', '#gtb-add-instr-input', function(e) {
    if (e.key === 'Enter') jQ('#gtb-add-instr-go').click();
});

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
    NIFTY_50_MAX_PAIN_SCORE = 0;
    NIFTY_BANK_MAX_PAIN_SCORE = 0;
    RELIANCE_MAX_PAIN_SCORE = 0;
    HDFCBANK_MAX_PAIN_SCORE = 0;
    ICICIBANK_MAX_PAIN_SCORE = 0;
    NIFTY_50_IV_SKEW_SCORE = 0;
    NIFTY_BANK_IV_SKEW_SCORE = 0;
    RELIANCE_IV_SKEW_SCORE = 0;
    HDFCBANK_IV_SKEW_SCORE = 0;
    ICICIBANK_IV_SKEW_SCORE = 0;
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
    // Option A: 9:15 index pattern as tiebreaker (leading indicator)
    // Option B: split score into leading (9:15 + A/D + futures) vs lagging (OI/OBV + MaxPain + IVSkew + Components)
    //   Leading = fast-moving, reflect current session; Lagging = calculated from previous candle batch, can lag by minutes
    //   When futures contradict score, if BOTH leading score and 9:15 pattern agree with futures → score is lagging, trust futures
    var _leadingScore = ALL_9_15_CLOSE_SCORE + NIFTY_50_9_15_CLOSE_SCORE + NIFTY_BANK_9_15_CLOSE_SCORE +
        GIFT_NIFTY_9_15_CLOSE_SCORE + SENSEX_9_15_CLOSE_SCORE + RELIANCE_9_15_CLOSE_SCORE + HDFCBANK_9_15_CLOSE_SCORE +
        ALL_ADVANCE_DECLINE_SCORE + NIFTY_50_ADVANCE_DECLINE_SCORE + NIFTY_BANK_ADVANCE_DECLINE_SCORE +
        ALL_FUTURES_TREND_SCORE + NIFTY_50_FUTURES_TREND_SCORE + NIFTY_BANK_FUTURES_TREND_SCORE;

    if (SCORE > 5 && indexFuturesScore < 0) {
        // Score bullish but index futures bearish
        var _n915Bear = (n915 === 'BSO' || n915 === 'BST');
        var _bn915Bear = (bn915 === 'BSO' || bn915 === 'BST');
        if (_leadingScore < 0 && _n915Bear && _bn915Bear) {
            // Leading indicators + 9:15 both confirm bearish → futures are correct, score lagging upward
            signal = 'SELL'; color = 'sv-badge-red';
            reason = 'Score bullish (' + SCORE.toFixed(2) + ') but lagging — leading indicators (9:15 + A/D + futures) all bearish. Trust futures: trade short.';
        } else if (_leadingScore < 0) {
            signal = 'WAIT'; color = 'sv-badge-amber';
            reason = 'Score bullish (' + SCORE.toFixed(2) + ') but futures + leading score bearish. 9:15 not fully confirming — wait for alignment.';
        } else {
            signal = 'WAIT'; color = 'sv-badge-amber';
            reason = 'Score bullish (' + SCORE.toFixed(2) + ') but both index futures bearish. Conflicting signals — no trade.';
        }
    } else if (SCORE < -5 && indexFuturesScore > 0) {
        // Score bearish but index futures bullish
        var _n915Bull = (n915 === 'ASO' || n915 === 'AST');
        var _bn915Bull = (bn915 === 'ASO' || bn915 === 'AST');
        if (_leadingScore > 0 && _n915Bull && _bn915Bull) {
            // Leading indicators + 9:15 both confirm bullish → lagging components (OI/OBV, MaxPain, IV skew, components) dragging score down
            signal = 'BUY'; color = 'sv-badge-green';
            reason = 'Score bearish (' + SCORE.toFixed(2) + ') but lagging — leading indicators (9:15 + A/D + futures) all bullish. Trust futures: trade long.';
        } else if (_leadingScore > 0) {
            signal = 'WAIT'; color = 'sv-badge-amber';
            reason = 'Score bearish (' + SCORE.toFixed(2) + ') but futures + leading score bullish. 9:15 not fully confirming — wait for alignment.';
        } else {
            signal = 'WAIT'; color = 'sv-badge-amber';
            reason = 'Score bearish (' + SCORE.toFixed(2) + ') but both index futures bullish. Conflicting signals — no trade.';
        }
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

// Max Pain gravity score: +1 when Max Pain is above spot (bullish pull), -1 when below
let NIFTY_50_MAX_PAIN_SCORE = 0;
let NIFTY_BANK_MAX_PAIN_SCORE = 0;
let RELIANCE_MAX_PAIN_SCORE = 0;
let HDFCBANK_MAX_PAIN_SCORE = 0;
let ICICIBANK_MAX_PAIN_SCORE = 0;

// IV Skew score: -1 put skew >2% (fear/bearish), +1 call skew >2% (demand/bullish)
let NIFTY_50_IV_SKEW_SCORE = 0;
let NIFTY_BANK_IV_SKEW_SCORE = 0;
let RELIANCE_IV_SKEW_SCORE = 0;
let HDFCBANK_IV_SKEW_SCORE = 0;
let ICICIBANK_IV_SKEW_SCORE = 0;

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
function _gtbUpdateTrendZones() {
    var instruments = [
        'GIFT NIFTY','NIFTY 50','NIFTY BANK','SENSEX',
        'CRUDEOILM','USDINR','RELIANCE','HDFCBANK','ICICIBANK'
    ];
    var labelMap = { '2':'AST', '1':'ASO', '0':'B/W', '-1':'BSO', '-2':'BST' };
    var colorMap = { '2':'#3fb950', '1':'#3fb950', '0':'#7d8590', '-1':'#f85149', '-2':'#f85149' };
    instruments.forEach(function(name) {
        var tid = name.replace(/ /g, '-').replace(/&/g, '-');
        var el  = document.getElementById(tid + '-trend-zone');
        if (!el) return;
        try {
            var ct  = computeInstrumentScore(name).current_trend;
            var key = String(ct);
            var label = labelMap[key] || 'B/W';
            var color = colorMap[key] || '#7d8590';
            el.innerHTML = '<span class="gtb-tz-badge" style="background:' + color + '22;color:' + color
                + ';border:1px solid ' + color + '44;">' + label + '</span>';
        } catch(e) { el.innerHTML = ''; }
    });
}

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
        return '<tr style="background:var(--gtb-surface2,#161b22);">'
             + '<td colspan="7" style="padding:3px 4px;font-size:0.58rem;font-weight:600;color:var(--gtb-muted);letter-spacing:.04em;">'
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

// ── Historical Day Replay popup ───────────────────────────────────────────────
// Fetches all historical 5-min candle data on-the-fly for any date chosen by the
// user, reconstructs every score at each interval, and shows a browseable timeline.
// No storage: everything is computed fresh from the Kite historical API each time.
//
// What is reconstructed per interval (price-based, no OI/IV needed):
//   • 9:15 breakout zone  (first candle open → strike → CLOSE_9_15 classification)
//   • Current trend zone  (close at T vs ASO/AST/BSO/BST)
//   • Advance / Decline   (each stock above ASO or below BSO at each interval)
//   • Component score     (weighted constituents × per-candle trend)
//   • Composite score     = sum of the above
//   • Market signal       (getMarketSignal on the composite)
// OI/OBV, Futures trend, Max Pain, IV Skew — not available historically → shown as 0/N/A.
async function _gtbShowHistoricalReplay() {
    var _cls = 'popup-custom-style-hist-replay';
    var isLight = (localStorage.getItem('GTB_THEME') || 'dark') === 'light';

    // ── Common helpers ────────────────────────────────────────────────────────
    function _sc(v) {
        v = parseFloat(v) || 0;
        var c = v > 0 ? 'var(--gtb-green)' : v < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
        return '<span style="color:' + c + ';font-weight:700;">' + (v > 0 ? '+' : '') + v.toFixed(2) + '</span>';
    }
    function _si(v) {
        v = parseFloat(v) || 0;
        var c = v > 0 ? 'var(--gtb-green)' : v < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
        return '<span style="color:' + c + ';font-weight:700;">' + (v > 0 ? '+' : '') + v + '</span>';
    }
    function _scoreColor(s) {
        if (s >= 8) return 'var(--gtb-green)';
        if (s >= 5) return '#d2a679';
        if (s >= 1) return 'var(--gtb-amber)';
        return 'var(--gtb-red)';
    }
    function _sigColor(sig) {
        if (!sig) return 'var(--gtb-muted)';
        if (sig.indexOf('STRONG BUY') >= 0 || sig.indexOf('BUY') >= 0)   return 'var(--gtb-green)';
        if (sig.indexOf('STRONG SELL') >= 0 || sig.indexOf('SELL') >= 0) return 'var(--gtb-red)';
        return 'var(--gtb-amber)';
    }
    function _updateTitle(extra) {
        var t = '<div style="display:flex;align-items:center;gap:6px;width:100%;">' +
            '<span style="font-weight:800;font-size:0.7rem;"><i class="bi bi-collection-play-fill"></i> HISTORICAL DAY REPLAY</span>' +
            '<span style="font-size:0.45rem;color:var(--gtb-muted);margin-left:4px;">' + (extra || '') + '</span>' +
            popupWinControls(_cls) + '</div>';
        jQ('.' + _cls).find('.popupwindow_titlebar_text').html(t);
        hideNativePopupButtons(_cls);
    }

    // ── Step 1: date picker ───────────────────────────────────────────────────
    var today = moment().format('YYYY-MM-DD');
    var pickerHtml =
        '<div style="display:flex;height:100%;align-items:center;justify-content:center;background:var(--gtb-bg);">' +
        '<div style="width:520px;background:var(--gtb-surface);border:1px solid var(--gtb-border);padding:32px 36px;display:flex;flex-direction:column;gap:20px;">' +

        // Icon + title
        '<div style="display:flex;align-items:center;gap:12px;">' +
        '<div style="width:40px;height:40px;background:var(--gtb-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
        '<i class="bi bi-collection-play-fill" style="color:#fff;font-size:1.1rem;"></i></div>' +
        '<div><div style="font-size:0.85rem;font-weight:900;color:var(--gtb-text);letter-spacing:0.02em;">HISTORICAL DAY REPLAY</div>' +
        '<div style="font-size:0.42rem;color:var(--gtb-muted);margin-top:2px;">Reconstruct every score tick-by-tick from live Kite 5-min data</div>' +
        '</div></div>' +

        // Divider
        '<div style="border-top:1px solid var(--gtb-border);"></div>' +

        // Coverage badges
        '<div style="display:flex;flex-direction:column;gap:6px;">' +
        '<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:var(--gtb-surface2);border-left:3px solid var(--gtb-green);">' +
        '<i class="bi bi-check-circle-fill" style="color:var(--gtb-green);font-size:0.6rem;margin-top:1px;flex-shrink:0;"></i>' +
        '<div style="font-size:0.42rem;color:var(--gtb-text);line-height:1.5;"><b style="color:var(--gtb-green);">Current expiry window</b> — Futures trend, Futures OI &amp; Option Chain OI (ATM ±3 strikes) fully included.</div>' +
        '</div>' +
        '<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:var(--gtb-surface2);border-left:3px solid var(--gtb-amber);">' +
        '<i class="bi bi-exclamation-triangle-fill" style="color:var(--gtb-amber);font-size:0.6rem;margin-top:1px;flex-shrink:0;"></i>' +
        '<div style="font-size:0.42rem;color:var(--gtb-muted);line-height:1.5;">Other dates — price-action only (Futures/OI = 0). Max Pain &amp; IV Skew never available historically.</div>' +
        '</div></div>' +

        // Date input row
        '<div style="display:flex;gap:10px;align-items:center;">' +
        '<div style="flex:1;display:flex;flex-direction:column;gap:4px;">' +
        '<label style="font-size:0.38rem;font-weight:700;color:var(--gtb-muted);text-transform:uppercase;letter-spacing:0.06em;">Select Trading Day</label>' +
        '<input type="date" id="gtb-hr-date" value="' + today + '" max="' + today + '" style="' +
            'background:var(--gtb-surface2);color:var(--gtb-text);border:1px solid var(--gtb-border);' +
            'padding:8px 12px;font-size:0.58rem;width:100%;box-sizing:border-box;cursor:pointer;">' +
        '</div>' +
        '<button id="gtb-hr-load" style="' +
            'background:var(--gtb-accent);color:#fff;border:none;' +
            'padding:8px 22px;font-size:0.58rem;font-weight:700;cursor:pointer;align-self:flex-end;white-space:nowrap;letter-spacing:0.02em;">' +
            '<i class="bi bi-cloud-download"></i>&nbsp; LOAD DAY</button>' +
        '</div>' +

        // Progress
        '<div id="gtb-hr-progress" style="font-size:0.46rem;color:var(--gtb-muted);min-height:1.4em;text-align:center;"></div>' +
        '</div>' +
        '</div>';

    showPopUpWindow('hist-replay', pickerHtml, 'Historical Day Replay', 1320, 700);
    jQ('.' + _cls).toggleClass('gtb-light', isLight);
    _updateTitle('');

    // ── Step 2: load button click ─────────────────────────────────────────────
    jQ('.' + _cls).on('click', '#gtb-hr-load', async function() {
        var date = jQ('.' + _cls).find('#gtb-hr-date').val();
        if (!date) return;

        function prog(txt, col) {
            jQ('.' + _cls).find('#gtb-hr-progress').css('color', col || 'var(--gtb-muted)').text(txt);
        }

        function _resetBtn() {
            jQ('.' + _cls).find('#gtb-hr-load').prop('disabled', false).html('<i class="bi bi-cloud-download"></i> Load Day');
        }

        // Disable button while loading
        jQ('.' + _cls).find('#gtb-hr-load').prop('disabled', true).text('Loading…');

        try {

        var from = date + ' 09:00:00';
        var to   = date + ' 15:30:00';

        // Instruments to fetch: indices + weighted constituents
        // Use NIFTY_50_WEIGHTED_STOCKS and NIFTY_BANK_WEIGHTED_STOCKS keys for A/D + component
        // Plus the main index instruments for 9:15 + signal display
        var mainInstrs = ['NIFTY 50','NIFTY BANK','SENSEX','GIFT NIFTY','RELIANCE','HDFCBANK','ICICIBANK','USDINR'];
        var n50Stocks  = Object.keys(NIFTY_50_WEIGHTED_STOCKS   || {});
        var bnStocks   = Object.keys(NIFTY_BANK_WEIGHTED_STOCKS || {});
        // Merge all unique
        var allStocks  = [];
        var _seen = {};
        mainInstrs.concat(n50Stocks).concat(bnStocks).forEach(function(nm) {
            if (!_seen[nm] && INSTRUMENT_TOKENS[nm]) { _seen[nm] = true; allStocks.push(nm); }
        });

        // candle map: { name: [ [ts, o, h, l, c, v], … ] }  (only today's candles, stripped)
        var candleMap = {};
        var total = allStocks.length, done = 0;

        // Fetch in batches of 3 to avoid rate-limiting
        for (var bi = 0; bi < allStocks.length; bi += 3) {
            var batch = allStocks.slice(bi, bi + 3);
            prog('Fetching ' + (bi + 1) + '–' + Math.min(bi + 3, total) + ' / ' + total + ' instruments…');
            await Promise.all(batch.map(async function(nm) {
                try {
                    var token = INSTRUMENT_TOKENS[nm];
                    var resp  = await getHistoricalDataUsingPromise(token, from, to, '5minute');
                    var raw   = (resp && resp.data && resp.data.candles) || [];
                    // Strip candles from previous day (API sometimes returns last candle of prior session)
                    var day   = date;
                    candleMap[nm] = raw.filter(function(c) {
                        return moment(c[0]).format('YYYY-MM-DD') === day;
                    });
                } catch(e) {
                    candleMap[nm] = [];
                }
                done++;
            }));
        }

        // ── INDIA VIX ─────────────────────────────────────────────────────────────
        var vixAtTime = {};
        try {
            var _vixToken = (INSTRUMENT_TOKENS && INSTRUMENT_TOKENS['INDIA VIX']) || 264969;
            prog('Fetching INDIA VIX…');
            var _vixResp = await getHistoricalDataUsingPromise(_vixToken, from, to, '5minute');
            var _vixRaw  = ((_vixResp && _vixResp.data && _vixResp.data.candles) || []).filter(function(c) {
                return moment(c[0]).format('YYYY-MM-DD') === date;
            });
            _vixRaw.forEach(function(c) { vixAtTime[moment(c[0]).format('HH:mm')] = c[4]; });
        } catch(e2) { console.warn('VIX fetch error', e2); }

        // ── Futures + Option OI data (only if date is within current expiry) ────
        // Kite's 5-min historical candle for futures/options = [ts, o, h, l, c, v, OI]
        // futTrendAtTime[HH:mm] = { n50: +1/0/-1, bn: +1/0/-1 }
        // futOIAtTime[HH:mm]    = { n50: ±1, bn: ±1 }  (futures OI Δ + price Δ)
        // optOIAtTime[HH:mm]    = { n50: ±1, bn: ±1 }  (option chain CE/PE OI flow)
        var futTrendAtTime  = {};
        var futOIAtTime     = {};
        var optOIAtTime     = {};
        var futuresAvailable   = false;
        var optionOIAvailable  = false;
        // computed futures signals (populated inside try, applied after times is built)
        var _nSig_computed = null, _bnSig_computed = null;
        var _niftyOptTokens = [], _bnOptTokens = [];
        var optCandleMap = {};

        try {
            var _futList = (typeof FUTURE_INTRUMENT_LIST !== 'undefined') ? FUTURE_INTRUMENT_LIST : [];
            var _expiry = _futList.length ? moment(_futList[0].expiry, 'DD-MM-YYYY') : null;
            if (_expiry && moment(date).isSameOrBefore(_expiry, 'day') &&
                moment(date).isSameOrAfter(moment(_expiry).subtract(35, 'days'), 'day')) {

                var _nFut  = _futList.find(function(f) { return f.name === 'NIFTY'; });
                var _bnFut = _futList.find(function(f) { return f.name === 'BANKNIFTY'; });

                prog('Fetching NIFTY + BANKNIFTY futures…');
                var _futFetches = [];
                if (_nFut)  _futFetches.push({ key: 'NIFTY',     token: _nFut.instrument_token });
                if (_bnFut) _futFetches.push({ key: 'BANKNIFTY', token: _bnFut.instrument_token });

                var _futCandles = {};
                await Promise.all(_futFetches.map(async function(f) {
                    try {
                        var resp = await getHistoricalDataUsingPromise(f.token, from, to, '5minute');
                        var raw  = (resp && resp.data && resp.data.candles) || [];
                        _futCandles[f.key] = raw.filter(function(c) {
                            return moment(c[0]).format('YYYY-MM-DD') === date;
                        });
                    } catch(e) { _futCandles[f.key] = []; }
                }));

                // Compute per-interval futures trend + OI signal
                // candle: [ts, open, high, low, close, volume, OI]
                function _futSignal(candles) {
                    if (!candles || !candles.length) return {};
                    var firstOpen = candles[0][1];
                    var prevOI    = candles[0][6] || 0;
                    var prevClose = candles[0][4];
                    var result    = {};
                    candles.forEach(function(c) {
                        var t    = moment(c[0]).format('HH:mm');
                        if (t < '09:20') return;
                        var cl   = c[4];
                        var oi   = c[6] || 0;
                        var trend = cl > firstOpen ? 1 : cl < firstOpen ? -1 : 0;
                        var oiDelta    = oi - prevOI;
                        var priceDelta = cl - prevClose;
                        var oiSig = 0;
                        if      (oiDelta > 0 && priceDelta > 0) oiSig =  1;  // LONG build
                        else if (oiDelta > 0 && priceDelta < 0) oiSig = -1;  // SHORT build
                        else if (oiDelta < 0 && priceDelta > 0) oiSig =  1;  // SHORT covering
                        else if (oiDelta < 0 && priceDelta < 0) oiSig = -1;  // LONG unwinding
                        result[t] = { trend: trend, oi: oiSig };
                        prevOI    = oi;
                        prevClose = cl;
                    });
                    return result;
                }

                // Save to outer vars — applied after times[] is built below
                _nSig_computed = _futSignal(_futCandles['NIFTY']    || []);
                _bnSig_computed = _futSignal(_futCandles['BANKNIFTY'] || []);
                futuresAvailable = (_futCandles['NIFTY'] || []).length > 0 || (_futCandles['BANKNIFTY'] || []).length > 0;

                // ── Option chain OI: CE/PE for ATM ± 3 strikes ───────────────
                // Use 9:15 first candle close as ATM reference for NIFTY/BANKNIFTY
                var _n50First = (candleMap['NIFTY 50']   || [])[0];
                var _bnFirst  = (candleMap['NIFTY BANK'] || [])[0];
                var _niftyATM = _n50First ? Math.round(_n50First[4] / 50) * 50 : 0;
                var _bnATM    = _bnFirst  ? Math.round(_bnFirst[4]  / 100) * 100 : 0;
                var _expiryMom = moment(_futList[0].expiry, 'DD-MM-YYYY');

                // Pre-filter OPTION_STRIKE_LIST once per instrument using string comparison
                // (avoids 14 × 10K+ moment() calls which block the UI thread for 20+ seconds)
                function _getOptTokens(instrName, atm, strikeDiff, numStrikes) {
                    var tokens = [];
                    var _osl = (typeof OPTION_STRIKE_LIST !== 'undefined') ? OPTION_STRIKE_LIST : [];
                    var _expiryStr = _futList[0].expiry;  // e.g. "28-07-2026"
                    // Single O(n) scan: build strike→{CE,PE} map for this instrument + expiry
                    var _strikeMap = {};
                    for (var _i = 0; _i < _osl.length; _i++) {
                        var _o = _osl[_i];
                        if (_o.name !== instrName || _o.expiry !== _expiryStr) continue;
                        var _sk = String(_o.strike);
                        if (!_strikeMap[_sk]) _strikeMap[_sk] = {};
                        _strikeMap[_sk][_o.instrument_type] = _o.instrument_token;
                    }
                    // Look up ATM ± numStrikes from the pre-built map
                    for (var _k = -numStrikes; _k <= numStrikes; _k++) {
                        var sv = atm + _k * strikeDiff;
                        var _se = _strikeMap[String(sv)];
                        if (!_se) continue;
                        if (_se.CE) tokens.push({ strike: sv, type: 'CE', token: _se.CE });
                        if (_se.PE) tokens.push({ strike: sv, type: 'PE', token: _se.PE });
                    }
                    return tokens;
                }

                if (_niftyATM) _niftyOptTokens = _getOptTokens('NIFTY',     _niftyATM, 50,  3);
                if (_bnATM)    _bnOptTokens    = _getOptTokens('BANKNIFTY', _bnATM,   100, 3);

                var _allOptTokens = _niftyOptTokens.concat(_bnOptTokens);
                prog('Fetching option chain OI — ' + _allOptTokens.length + ' strikes (NIFTY ATM ' + _niftyATM + ', BN ATM ' + _bnATM + ')…');
                for (var _obi = 0; _obi < _allOptTokens.length; _obi += 3) {
                    var _oBatch = _allOptTokens.slice(_obi, _obi + 3);
                    await Promise.all(_oBatch.map(async function(item) {
                        try {
                            var resp = await getHistoricalDataUsingPromise(item.token, from, to, '5minute');
                            var raw  = (resp && resp.data && resp.data.candles) || [];
                            optCandleMap[item.token] = raw.filter(function(c) {
                                return moment(c[0]).format('YYYY-MM-DD') === date;
                            });
                        } catch(e2) { optCandleMap[item.token] = []; }
                    }));
                }
                optionOIAvailable = _allOptTokens.some(function(it) { return (optCandleMap[it.token] || []).length > 0; });
            }
        } catch(e) { console.warn('Futures/options fetch error', e); }

        prog('Computing scores…', 'var(--gtb-amber)');

        // ── 9:15 candle: use first candle's open (index [1]) as the reference
        var breakout915 = {};   // { name: { CLOSE_9_15: 'AST'|'ASO'|'BSO'|'BST'|'B/W', open: n, close: n } }
        allStocks.forEach(function(nm) {
            var candles = candleMap[nm] || [];
            if (!candles.length) return;
            var firstOpen  = candles[0][1];
            var firstClose = candles[0][4];
            var sd = getStrikeDetails({ price: firstOpen }, nm);
            var ast = parseFloat(sd.ustrikeTwo), aso = parseFloat(sd.ustrikeOne);
            var bso = parseFloat(sd.bstrikeOne), bst = parseFloat(sd.bstrikeTwo);
            var zone = firstClose >= ast ? 'AST' : firstClose >= aso ? 'ASO' :
                       firstClose <= bst ? 'BST' : firstClose <= bso ? 'BSO' : 'B/W';
            breakout915[nm] = { CLOSE_9_15: zone, open: firstOpen, close: firstClose };
        });

        // ── ALL_9_15 breadth score (same formula as setScore)
        var bull915 = 0, bear915 = 0;
        Object.keys(breakout915).forEach(function(nm) {
            var z = breakout915[nm].CLOSE_9_15;
            var s = z === 'AST' ? 2 : z === 'ASO' ? 1 : z === 'BST' ? -2 : z === 'BSO' ? -1 : 0;
            if (s > 0) bull915 += s; else if (s < 0) bear915 += Math.abs(s);
        });
        var all915Total = bull915 + bear915;
        var ALL_9_15 = all915Total > 0 ? parseFloat(((bull915 - bear915) / all915Total).toFixed(2)) : 0;

        function get915Score(nm) {
            if (!breakout915[nm]) return 0;
            var z = breakout915[nm].CLOSE_9_15;
            return z === 'AST' ? 2 : z === 'ASO' ? 1 : z === 'BST' ? -2 : z === 'BSO' ? -1 : 0;
        }

        // ── Collect all 5-min time slots present in the data
        var timeSet = {};
        allStocks.forEach(function(nm) {
            (candleMap[nm] || []).forEach(function(c) {
                var t = moment(c[0]).format('HH:mm');
                if (t >= '09:20') timeSet[t] = true;
            });
        });
        var times = Object.keys(timeSet).sort();

        // Apply futures signals now that times[] is known (fixes the var-hoisting bug)
        if (_nSig_computed && _bnSig_computed) {
            times.forEach(function(t) {
                futTrendAtTime[t] = {
                    n50: (_nSig_computed[t] || {}).trend || 0,
                    bn:  (_bnSig_computed[t] || {}).trend || 0
                };
                futOIAtTime[t] = {
                    n50: (_nSig_computed[t] || {}).oi || 0,
                    bn:  (_bnSig_computed[t] || {}).oi || 0
                };
            });
        }

        // Compute option chain OI score timeline (net PE OI build vs CE OI build per interval)
        // Positive net = PE building more = bullish (+1), negative = CE building = bearish (-1)
        if (optionOIAvailable) {
            function _optOITimeline(optTokens) {
                var tokenMap = {};
                optTokens.forEach(function(item) {
                    tokenMap[item.token] = { type: item.type, oiMap: {} };
                    (optCandleMap[item.token] || []).forEach(function(c) {
                        tokenMap[item.token].oiMap[moment(c[0]).format('HH:mm')] = c[6] || 0;
                    });
                });
                var result = {};
                times.forEach(function(t, idx) {
                    var ceD = 0, peD = 0;
                    optTokens.forEach(function(item) {
                        var oiMap  = tokenMap[item.token].oiMap;
                        var oiNow  = oiMap[t] || 0;
                        var prevT  = idx > 0 ? times[idx - 1] : null;
                        var oiPrev = (prevT !== null && oiMap[prevT] !== undefined) ? oiMap[prevT] : oiNow;
                        var delta  = oiNow - oiPrev;
                        if (item.type === 'CE') ceD += delta; else peD += delta;
                    });
                    var net = peD - ceD;
                    result[t] = net > 0 ? 1 : net < 0 ? -1 : 0;
                });
                return result;
            }
            var _nOpt  = _optOITimeline(_niftyOptTokens);
            var _bnOpt = _optOITimeline(_bnOptTokens);
            times.forEach(function(t) {
                optOIAtTime[t] = { n50: _nOpt[t] || 0, bn: _bnOpt[t] || 0 };
            });
        }

        if (!times.length) {
            prog('No candle data found for ' + date + ' (market holiday or weekend?)', 'var(--gtb-red)');
            jQ('.' + _cls).find('#gtb-hr-load').prop('disabled', false).html('<i class="bi bi-cloud-download"></i> Load Day');
            return;
        }

        // Build close-price map per name per time
        // candleClose[name][HH:mm] = close price
        var candleClose = {};
        allStocks.forEach(function(nm) {
            candleClose[nm] = {};
            (candleMap[nm] || []).forEach(function(c) {
                candleClose[nm][moment(c[0]).format('HH:mm')] = c[4];
            });
        });

        // ── Build per-interval snapshots ──────────────────────────────────────
        var snaps = [];
        times.forEach(function(t) {

            // Per-instrument score at time t (price-based only)
            function instrScoreAtTime(nm) {
                var b = breakout915[nm] || {};
                var open = b.open;
                if (!open) return { nine_fifteen: 0, current_trend: 0, futures_trend: 0, oi_obv: 0, total: 0 };

                var s915 = get915Score(nm);

                // Current trend: close at time T vs ASO/BSO from 9:15 open
                var cl = candleClose[nm] && candleClose[nm][t];
                var sTrend = 0;
                if (cl) {
                    var sd = getStrikeDetails({ price: open }, nm);
                    var ast2 = parseFloat(sd.ustrikeTwo), aso2 = parseFloat(sd.ustrikeOne);
                    var bso2 = parseFloat(sd.bstrikeOne), bst2 = parseFloat(sd.bstrikeTwo);
                    sTrend = cl >= ast2 ? 2 : cl >= aso2 ? 1 : cl <= bst2 ? -2 : cl <= bso2 ? -1 : 0;
                }

                var tot = s915 + sTrend;  // OI/Futures = 0 historically
                return { nine_fifteen: s915, current_trend: sTrend, futures_trend: 0, oi_obv: 0, total: tot };
            }

            // Advance/Decline for N50 and BN weighted stocks at time t
            function adAtTime(stockList) {
                var adv = 0, dec = 0, neutral = 0;
                stockList.forEach(function(nm) {
                    var b = breakout915[nm] || {};
                    if (!b.open) return;
                    var cl = candleClose[nm] && candleClose[nm][t];
                    if (!cl) return;
                    var sd = getStrikeDetails({ price: b.open }, nm);
                    var aso2 = parseFloat(sd.ustrikeOne), bso2 = parseFloat(sd.bstrikeOne);
                    if (cl >= aso2) adv++; else if (cl <= bso2) dec++; else neutral++;
                });
                var total = adv + dec;
                return { adv: adv, dec: dec, neutral: neutral, ratio: total > 0 ? parseFloat(((adv - dec) / total).toFixed(2)) : 0 };
            }

            // Component scores
            function compAtTime(weightedMap) {
                var sum = 0;
                jQ.each(weightedMap || {}, function(nm, weight) {
                    var sc = instrScoreAtTime(nm);
                    sum += sc.total * (weight / 100);
                });
                return parseFloat(sum.toFixed(2));
            }

            var n50ad  = adAtTime(n50Stocks);
            var bnad   = adAtTime(bnStocks);
            // All: combined unique list
            var allUniqueStocks = Object.keys(_seen);
            var allad  = adAtTime(allUniqueStocks);

            var n50comp = compAtTime(NIFTY_50_WEIGHTED_STOCKS);
            var bncomp  = compAtTime(NIFTY_BANK_WEIGHTED_STOCKS);

            // Futures + option OI at this interval
            var futT    = futTrendAtTime[t] || { n50: 0, bn: 0 };
            var futOI   = futOIAtTime[t]    || { n50: 0, bn: 0 };
            var optOI_t = optOIAtTime[t]    || { n50: 0, bn: 0 };
            // ALL futures trend = avg of n50 + bn
            var allFutTrend   = futT.n50 + futT.bn > 0 ? 1 : futT.n50 + futT.bn < 0 ? -1 : 0;
            var futTrendScore = futT.n50 + futT.bn + allFutTrend;   // matches live: ALL + N50 + BN
            var futOIScore    = futOI.n50 + futOI.bn;               // futures OI signal
            var optOIScore    = optOI_t.n50 + optOI_t.bn;           // option chain OI signal

            // Per main instrument scores (include futures + option OI for NIFTY 50 / NIFTY BANK)
            var instrScores = {};
            mainInstrs.forEach(function(nm) {
                var sc = instrScoreAtTime(nm);
                if (futuresAvailable) {
                    if (nm === 'NIFTY 50') {
                        sc.futures_trend = futT.n50;
                        sc.oi_obv = futOI.n50 + optOI_t.n50;
                        sc.total  = sc.nine_fifteen + sc.current_trend + futT.n50 + futOI.n50 + optOI_t.n50;
                    }
                    if (nm === 'NIFTY BANK') {
                        sc.futures_trend = futT.bn;
                        sc.oi_obv = futOI.bn + optOI_t.bn;
                        sc.total  = sc.nine_fifteen + sc.current_trend + futT.bn + futOI.bn + optOI_t.bn;
                    }
                }
                instrScores[nm] = sc;
            });

            // 9:15 fixed scores
            var s915_n50  = get915Score('NIFTY 50');
            var s915_bn   = get915Score('NIFTY BANK');
            var s915_gn   = get915Score('GIFT NIFTY');
            var s915_sx   = get915Score('SENSEX');
            var s915_rel  = get915Score('RELIANCE');
            var s915_hdfc = get915Score('HDFCBANK');

            // Composite score (includes option OI when available)
            var score = parseFloat((
                ALL_9_15 + s915_n50 + s915_bn + s915_gn + s915_sx + s915_rel + s915_hdfc +
                allad.ratio + n50ad.ratio + bnad.ratio +
                futTrendScore +
                futOIScore +
                optOIScore +
                n50comp + bncomp
            ).toFixed(2));

            // Signal
            var b915map = {};
            allStocks.forEach(function(nm) { if (breakout915[nm]) b915map[nm] = breakout915[nm]; });
            var msig = getMarketSignal(score, b915map);

            // Breadth
            var bull = 0, bear = 0;
            mainInstrs.forEach(function(nm) {
                var tot = instrScores[nm].total;
                if (tot > 0) bull++; else if (tot < 0) bear++;
            });

            // Exit signal logic (mirrors checkExitSignal)
            var exitSig = (function() {
                var n50sc = instrScores['NIFTY 50'] || {};
                var dir = null, reason = '';
                if (n50sc.current_trend < 0) {
                    dir = 'LONG'; reason = 'NIFTY 50 below BSO/BST (trend ' + n50sc.current_trend + ')';
                } else if (futuresAvailable && futT.n50 < 0 && futT.bn < 0) {
                    dir = 'LONG'; reason = 'Both N50 + BN futures bearish';
                } else if (n50sc.current_trend > 0) {
                    dir = 'SHORT'; reason = 'NIFTY 50 above ASO/AST (trend ' + n50sc.current_trend + ')';
                } else if (futuresAvailable && futT.n50 > 0 && futT.bn > 0) {
                    dir = 'SHORT'; reason = 'Both N50 + BN futures bullish';
                }
                return { direction: dir, reason: reason };
            })();

            // OI matrix at time T: CE/PE OI per strike from optCandleMap
            var oiMatrix = null;
            if (optionOIAvailable) {
                var _buildMatrix = function(optTokens) {
                    var mat = {};
                    optTokens.forEach(function(item) {
                        var candles = optCandleMap[item.token] || [];
                        var oi = 0;
                        for (var _ci = candles.length - 1; _ci >= 0; _ci--) {
                            if (moment(candles[_ci][0]).format('HH:mm') <= t) { oi = candles[_ci][6] || 0; break; }
                        }
                        if (!mat[item.strike]) mat[item.strike] = {};
                        mat[item.strike][item.type] = oi;
                    });
                    return mat;
                };
                oiMatrix = {
                    nifty: _buildMatrix(_niftyOptTokens),
                    bank:  _buildMatrix(_bnOptTokens),
                    atmNifty: _niftyATM || 0,
                    atmBank:  _bnATM    || 0
                };
            }

            // Prices at time T for all main instruments
            var pricesAtT = {};
            mainInstrs.forEach(function(nm) {
                pricesAtT[nm] = (candleClose[nm] && candleClose[nm][t]) || 0;
            });

            // Price vs strike levels for main indices
            var priceLevels = {};
            ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'GIFT NIFTY'].forEach(function(nm) {
                var b = breakout915[nm];
                if (!b || !b.open) return;
                var cl = pricesAtT[nm];
                if (!cl) return;
                var sd = getStrikeDetails({ price: b.open }, nm);
                priceLevels[nm] = {
                    price: cl,
                    open:  b.open,
                    ast:   parseFloat(sd.ustrikeTwo),
                    aso:   parseFloat(sd.ustrikeOne),
                    bso:   parseFloat(sd.bstrikeOne),
                    bst:   parseFloat(sd.bstrikeTwo)
                };
            });

            snaps.push({
                time: t,
                score: score,
                signal: msig.signal,
                signalReason: msig.reason,
                tradeSignal: msig.tradeSignal,
                s915: { all: ALL_9_15, n50: s915_n50, bn: s915_bn, gn: s915_gn, sx: s915_sx, rel: s915_rel, hdfc: s915_hdfc },
                ad:   { all: allad, n50: n50ad, bn: bnad },
                fut:  { n50: futT.n50, bn: futT.bn, all: allFutTrend, score: futTrendScore, hasData: futuresAvailable },
                futOI: { n50: futOI.n50, bn: futOI.bn, score: futOIScore },
                optOI: { n50: optOI_t.n50, bn: optOI_t.bn, score: optOIScore, hasData: optionOIAvailable },
                comp: { n50: n50comp, bn: bncomp },
                instrScores: instrScores,
                breadth: { bull: bull, bear: bear },
                zones915: (function() {
                    var z = {};
                    mainInstrs.forEach(function(nm) { z[nm] = (breakout915[nm] || {}).CLOSE_9_15 || 'N/A'; });
                    return z;
                })(),
                vix: vixAtTime[t] || null,
                exitSignal: exitSig,
                oiMatrix: oiMatrix,
                prices: pricesAtT,
                priceLevels: priceLevels
            });
        });

        prog('');

        // ── Step 3: render timeline UI ────────────────────────────────────────
        var currentIdx = snaps.length - 1;

        function _buildTimeline(active) {
            var html = '<div id="gtb-hr-timeline" style="display:flex;align-items:center;overflow-x:auto;padding:5px 8px;background:var(--gtb-surface);border-bottom:1px solid var(--gtb-border);flex-shrink:0;white-space:nowrap;gap:3px;scrollbar-width:thin;">';
            snaps.forEach(function(s, i) {
                var isActive = (i === active);
                var sc = _scoreColor(s.score);
                var sigAbbr = !s.signal ? '' : s.signal.indexOf('STRONG BUY') >= 0 ? 'SB' : s.signal.indexOf('BUY') >= 0 ? 'B' : s.signal.indexOf('STRONG SELL') >= 0 ? 'SS' : s.signal.indexOf('SELL') >= 0 ? 'S' : s.signal.indexOf('WAIT') >= 0 ? 'W' : 'N';
                var scoreBar = Math.max(0, Math.min(100, ((s.score + 30) / 60) * 100));
                html += '<button class="gtb-hr-chip" data-idx="' + i + '" style="' +
                    'display:inline-flex;flex-direction:column;align-items:center;gap:1px;' +
                    'padding:4px 8px 3px;flex-shrink:0;border:none;' +
                    'border-bottom:2px solid ' + (isActive ? sc : 'transparent') + ';' +
                    'background:' + (isActive ? sc + '18' : 'transparent') + ';' +
                    'color:' + (isActive ? sc : 'var(--gtb-muted)') + ';' +
                    'font-size:0.46rem;font-weight:' + (isActive ? '900' : '500') + ';' +
                    'cursor:pointer;white-space:nowrap;transition:background 0.1s;">' +
                    '<span>' + s.time + '</span>' +
                    '<span style="font-size:0.38rem;color:' + sc + ';font-weight:700;">' + (s.score > 0 ? '+' : '') + parseFloat(s.score).toFixed(1) + '</span>' +
                    '<div style="width:28px;height:2px;background:var(--gtb-border);overflow:hidden;margin-top:1px;">' +
                    '<div style="width:' + scoreBar + '%;height:100%;background:' + sc + ';"></div></div>' +
                    '</button>';
            });
            html += '</div>';
            return html;
        }

        function _renderSnap(snap) {
            var sc    = snap.score;
            var scCol = _scoreColor(sc);
            var sigCol = _sigColor(snap.signal);
            var ts    = snap.tradeSignal || {};
            var ad     = snap.ad    || {};
            var fut    = snap.fut   || {};
            var futOI  = snap.futOI || {};
            var optOI  = snap.optOI || {};
            var s915   = snap.s915  || {};
            var comp   = snap.comp  || {};
            var hasFut = !!fut.hasData;
            var hasOpt = !!optOI.hasData;
            var zones  = snap.zones915 || {};
            var br     = snap.breadth  || {};
            var exitSig = snap.exitSignal || {};
            var oiMat  = snap.oiMatrix || null;
            var pl     = snap.priceLevels || {};
            var prices = snap.prices || {};

            // VIX regime
            var vixVal = snap.vix;
            var vixLabel = '', vixColor = 'var(--gtb-muted)';
            if (vixVal != null) {
                if (vixVal < 13)       { vixLabel = 'LOW';      vixColor = 'var(--gtb-green)'; }
                else if (vixVal < 18)  { vixLabel = 'NORMAL';   vixColor = 'var(--gtb-accent)'; }
                else if (vixVal < 25)  { vixLabel = 'ELEVATED'; vixColor = 'var(--gtb-amber)'; }
                else                   { vixLabel = 'HIGH';     vixColor = 'var(--gtb-red)'; }
            }

            // ── Computed pillars ──────────────────────────────────────────────
            var pct = Math.max(0, Math.min(100, ((sc + 30) / 60) * 100));
            var total915 = (s915.all||0)+(s915.n50||0)+(s915.bn||0)+(s915.gn||0)+(s915.sx||0)+(s915.rel||0)+(s915.hdfc||0);
            var adAllR = (ad.all && ad.all.ratio != null) ? ad.all.ratio : (ad.all || 0);
            var adN50R = (ad.n50 && ad.n50.ratio != null) ? ad.n50.ratio : (ad.n50 || 0);
            var adBnR  = (ad.bn  && ad.bn.ratio  != null) ? ad.bn.ratio  : (ad.bn  || 0);
            var totalAD  = adAllR + adN50R + adBnR;
            var totalFut    = hasFut ? (fut.score    || 0) : 0;
            var totalFutOI  = hasFut ? (futOI.score  || 0) : 0;
            var totalOptOI  = hasOpt ? (optOI.score  || 0) : 0;
            var brTotal = (br.bull || 0) + (br.bear || 0) || 1;
            var brBullPct = Math.round((br.bull || 0) / brTotal * 100);
            var covLabel = hasFut && hasOpt ? '<i class="bi bi-check-circle-fill"></i> Fut + FutOI + OptOI' : hasFut ? '<i class="bi bi-check-circle"></i> Fut + FutOI' : '<i class="bi bi-exclamation-triangle"></i> Price-action only';
            var covColor = hasFut && hasOpt ? 'var(--gtb-green)' : hasFut ? 'var(--gtb-accent)' : 'var(--gtb-amber)';

            // ── Root layout: left sidebar + right content ──────────────────────
            var h = '<div id="gtb-hr-panels" style="display:flex;flex-direction:row;height:100%;overflow:hidden;">';

            // ── LEFT SIDEBAR ─────────────────────────────────────────────────
            h += '<div style="width:215px;flex-shrink:0;border-right:1px solid var(--gtb-border);overflow-y:auto;display:flex;flex-direction:column;background:var(--gtb-surface);">';

            // Score block
            h += '<div style="padding:14px 16px 12px;text-align:center;border-bottom:1px solid var(--gtb-border);">';
            h +=   '<div style="font-size:0.34rem;font-weight:700;color:var(--gtb-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Composite Score</div>';
            h +=   '<div style="font-size:2.4rem;font-weight:900;color:' + scCol + ';line-height:1;margin-bottom:4px;">' + (sc > 0 ? '+' : '') + parseFloat(sc).toFixed(1) + '</div>';
            h +=   '<div style="height:4px;background:var(--gtb-border);margin:0 8px 8px;">';
            h +=     '<div style="width:' + pct + '%;height:100%;background:' + scCol + ';"></div></div>';
            h +=   '<div style="display:inline-block;padding:2px 8px;background:' + scCol + '22;border:1px solid ' + scCol + ';font-size:0.6rem;font-weight:900;color:' + scCol + ';">' + (snap.signal || '—') + '</div>';
            h +=   (ts.level ? '<div style="font-size:0.42rem;font-weight:700;color:' + sigCol + ';margin-top:5px;">' + ts.level + '</div>' : '');
            h += '</div>';

            // Exit signal banner (only when triggered)
            if (exitSig.direction) {
                var exitCol = exitSig.direction === 'LONG' ? 'var(--gtb-red)' : 'var(--gtb-green)';
                h += '<div style="padding:7px 14px;border-bottom:1px solid var(--gtb-border);background:' + exitCol + '18;border-left:3px solid ' + exitCol + ';">';
                h +=   '<div style="font-size:0.38rem;font-weight:800;color:' + exitCol + ';margin-bottom:2px;">EXIT ' + exitSig.direction + '</div>';
                h +=   '<div style="font-size:0.36rem;color:var(--gtb-muted);line-height:1.5;">' + exitSig.reason + '</div>';
                h += '</div>';
            }

            // Signal reason
            if (snap.signalReason) {
                h += '<div style="padding:6px 14px;border-bottom:1px solid var(--gtb-border);border-left:3px solid ' + sigCol + ';">';
                h +=   '<div style="font-size:0.36rem;color:var(--gtb-muted);line-height:1.5;">' + snap.signalReason + '</div>';
                h += '</div>';
            }

            // VIX block
            if (vixVal != null) {
                h += '<div style="padding:7px 14px;border-bottom:1px solid var(--gtb-border);display:flex;align-items:center;justify-content:space-between;">';
                h +=   '<div>';
                h +=     '<div style="font-size:0.34rem;font-weight:700;color:var(--gtb-muted);text-transform:uppercase;letter-spacing:0.06em;">INDIA VIX</div>';
                h +=     '<div style="font-size:0.36rem;color:' + vixColor + ';font-weight:700;margin-top:1px;">' + vixLabel + '</div>';
                h +=   '</div>';
                h +=   '<div style="font-size:1rem;font-weight:900;color:' + vixColor + ';">' + parseFloat(vixVal).toFixed(2) + '</div>';
                h += '</div>';
            }

            // Coverage badge
            h += '<div style="padding:5px 14px;border-bottom:1px solid var(--gtb-border);">';
            h +=   '<div style="font-size:0.36rem;color:' + covColor + ';">' + covLabel + '</div>';
            h += '</div>';

            // Breadth
            h += '<div style="padding:8px 14px;border-bottom:1px solid var(--gtb-border);">';
            h +=   '<div style="font-size:0.34rem;font-weight:700;color:var(--gtb-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">Market Breadth</div>';
            h +=   '<div style="display:flex;justify-content:space-between;font-size:0.42rem;margin-bottom:4px;">';
            h +=     '<span style="color:var(--gtb-green);">▲ ' + (br.bull||0) + ' Bull</span>';
            h +=     '<span style="color:var(--gtb-red);">▼ ' + (br.bear||0) + ' Bear</span>';
            h +=   '</div>';
            h +=   '<div style="display:flex;height:4px;overflow:hidden;">';
            h +=     '<div style="width:' + brBullPct + '%;background:var(--gtb-green);"></div>';
            h +=     '<div style="width:' + (100 - brBullPct) + '%;background:var(--gtb-red);"></div>';
            h +=   '</div>';
            h += '</div>';

            // Advance / Decline with counts
            h += '<div style="padding:7px 14px;border-bottom:1px solid var(--gtb-border);">';
            h +=   '<div style="font-size:0.34rem;font-weight:700;color:var(--gtb-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Advance / Decline</div>';
            [['All F&O', ad.all], ['NIFTY 50', ad.n50], ['BANK', ad.bn]].forEach(function(r) {
                var adObj = r[1] || {};
                var adv = adObj.adv != null ? adObj.adv : '—';
                var dec = adObj.dec != null ? adObj.dec : '—';
                var ratio = adObj.ratio != null ? adObj.ratio : (typeof adObj === 'number' ? adObj : 0);
                var rc = ratio > 0 ? 'var(--gtb-green)' : ratio < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
                h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--gtb-border2);font-size:0.42rem;">';
                h +=   '<span style="color:var(--gtb-muted);white-space:nowrap;">' + r[0] + '</span>';
                h +=   '<span style="color:var(--gtb-green);font-weight:700;">↑' + adv + '</span>';
                h +=   '<span style="color:var(--gtb-red);font-weight:700;">↓' + dec + '</span>';
                h +=   '<span style="color:' + rc + ';font-weight:800;">' + (ratio > 0 ? '+' : '') + (typeof ratio === 'number' ? ratio.toFixed(2) : ratio) + '</span>';
                h += '</div>';
            });
            h += '</div>';

            // Component scores
            h += '<div style="padding:7px 14px;">';
            h +=   '<div style="font-size:0.34rem;font-weight:700;color:var(--gtb-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Component</div>';
            [['N50 Weighted', comp.n50||0], ['BN Weighted', comp.bn||0]].forEach(function(r) {
                h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--gtb-border2);font-size:0.42rem;">';
                h +=   '<span style="color:var(--gtb-muted);">' + r[0] + '</span>' + _sc(r[1]);
                h += '</div>';
            });
            h += '</div>';

            h += '</div>'; // end sidebar

            // ── RIGHT CONTENT ────────────────────────────────────────────────
            h += '<div style="flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;">';

            // TOP ROW (panels side by side)
            h += '<div style="display:flex;flex-direction:row;flex:1;min-height:0;overflow:hidden;border-bottom:1px solid var(--gtb-border);">';

            // Panel helper
            function _panel(icon, title, bodyHtml, width) {
                return '<div style="' + (width ? 'flex:0 0 ' + width + 'px;width:' + width + 'px;' : 'flex:1;min-width:0;') + 'border-right:1px solid var(--gtb-border);display:flex;flex-direction:column;overflow:hidden;">' +
                    '<div style="padding:5px 10px;border-bottom:1px solid var(--gtb-border);font-size:0.38rem;font-weight:800;color:var(--gtb-muted);text-transform:uppercase;letter-spacing:0.07em;flex-shrink:0;background:var(--gtb-surface);white-space:nowrap;"><i class="' + icon + '"></i> ' + title + '</div>' +
                    '<div style="overflow-y:auto;flex:1;padding:6px 10px;">' + bodyHtml + '</div>' +
                    '</div>';
            }

            // [A] Score Breakdown
            var pillars = [
                { label: '9:15 Breakout',   val: total915,   detail: 'All · N50 · BN · GN · SX', warn: false },
                { label: 'Advance/Decline', val: totalAD,    detail: 'All F&O · N50 · Bank', warn: false },
                { label: 'Futures Trend',   val: totalFut,   detail: hasFut ? 'N50: ' + (fut.n50||0) + '  BN: ' + (fut.bn||0) : 'outside expiry window', warn: !hasFut },
                { label: 'Futures OI',      val: totalFutOI, detail: hasFut ? 'N50: ' + (futOI.n50||0) + '  BN: ' + (futOI.bn||0) : '', warn: !hasFut, hidden: !hasFut },
                { label: 'Option OI',       val: totalOptOI, detail: hasOpt ? 'N50: ' + (optOI.n50||0) + '  BN: ' + (optOI.bn||0) : 'strikes not found', warn: !hasOpt },
                { label: 'N50 Component',   val: comp.n50||0, detail: 'Weighted top-10', warn: false },
                { label: 'BN Component',    val: comp.bn||0,  detail: 'Weighted top-10', warn: false },
            ];
            var brkBody = '<table style="width:100%;border-collapse:collapse;">';
            pillars.forEach(function(p) {
                if (p.hidden) return;
                brkBody += '<tr>';
                brkBody +=   '<td style="padding:4px 0 4px;font-size:0.44rem;border-bottom:1px solid var(--gtb-border2);color:' + (p.warn ? 'var(--gtb-amber)' : 'var(--gtb-text)') + ';white-space:nowrap;width:105px;">' + p.label + '</td>';
                brkBody +=   '<td style="padding:4px 6px;border-bottom:1px solid var(--gtb-border2);text-align:right;font-size:0.46rem;white-space:nowrap;">' + (p.warn ? '<span style="color:var(--gtb-amber);">—</span>' : _sc(p.val)) + '</td>';
                brkBody +=   '<td style="padding:4px 0;border-bottom:1px solid var(--gtb-border2);font-size:0.34rem;color:var(--gtb-muted);">' + p.detail + '</td>';
                brkBody += '</tr>';
            });
            brkBody += '<tr><td colspan="3" style="padding:4px 0;font-size:0.34rem;color:var(--gtb-amber);">Max Pain / IV Skew — not available historically</td></tr>';
            brkBody += '</table>';
            h += _panel('bi bi-bar-chart-steps', 'Score Breakdown', brkBody, 300);

            // [B] 9:15 Zones + Price vs Levels
            var z915Body = '<table style="width:100%;border-collapse:collapse;">';
            mainInstrs.forEach(function(nm) {
                var sc9 = ((snap.instrScores || {})[nm] || {}).nine_fifteen || 0;
                var zone = zones[nm] || '—';
                var zc = (zone==='AST'||zone==='ASO') ? 'var(--gtb-green)' : (zone==='BST'||zone==='BSO') ? 'var(--gtb-red)' : 'var(--gtb-muted)';
                var pr = prices[nm] ? parseFloat(prices[nm]).toFixed(0) : '—';
                // Level bar (only for tracked indices with full level data)
                var levelBar = '';
                if (pl[nm]) {
                    var lvl = pl[nm];
                    var range = lvl.ast - lvl.bst;
                    if (range > 0) {
                        var pPct = Math.max(0, Math.min(100, ((lvl.price - lvl.bst) / range) * 100));
                        var asoPct = Math.max(0, Math.min(100, ((lvl.aso - lvl.bst) / range) * 100));
                        var astPct = Math.max(0, Math.min(100, ((lvl.ast - lvl.bst) / range) * 100));
                        var bsoPct = Math.max(0, Math.min(100, ((lvl.bso - lvl.bst) / range) * 100));
                        levelBar = '<div style="position:relative;height:6px;background:var(--gtb-border);margin-top:2px;overflow:visible;">' +
                            // ASO marker
                            '<div style="position:absolute;left:' + asoPct + '%;top:-2px;bottom:-2px;width:1px;background:var(--gtb-green);opacity:0.5;"></div>' +
                            // AST marker
                            '<div style="position:absolute;left:' + astPct + '%;top:-2px;bottom:-2px;width:1px;background:var(--gtb-green);"></div>' +
                            // BSO marker
                            '<div style="position:absolute;left:' + bsoPct + '%;top:-2px;bottom:-2px;width:1px;background:var(--gtb-red);opacity:0.5;"></div>' +
                            // Price dot
                            '<div style="position:absolute;left:' + pPct + '%;top:-3px;width:6px;height:6px;margin-left:-3px;background:' + zc + ';border-radius:50%;z-index:2;"></div>' +
                            '</div>';
                    }
                }
                z915Body += '<tr>';
                z915Body +=   '<td style="padding:4px 0 2px;border-bottom:1px solid var(--gtb-border2);white-space:nowrap;">';
                z915Body +=     '<div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">';
                z915Body +=       '<span style="font-size:0.42rem;font-weight:600;max-width:80px;overflow:hidden;text-overflow:ellipsis;display:block;">' + nm + '</span>';
                z915Body +=       '<span style="color:' + zc + ';font-weight:800;font-size:0.44rem;">' + zone + '</span>';
                z915Body +=       '<span style="font-size:0.4rem;color:var(--gtb-muted);">' + pr + '</span>';
                z915Body +=       '<span style="font-size:0.4rem;">' + _si(sc9) + '</span>';
                z915Body +=     '</div>';
                z915Body +=     levelBar;
                z915Body +=   '</td>';
                z915Body += '</tr>';
            });
            z915Body += '<tr><td style="padding:4px 0 2px;font-size:0.42rem;"><span style="color:var(--gtb-muted);">9:15 Total: </span>' + _sc(total915) + '</td></tr>';
            z915Body += '</table>';
            h += _panel('bi bi-alarm', '9:15 + Price vs Levels', z915Body, 240);

            // [C] Futures + OI
            var futBody = '';
            if (!hasFut) {
                futBody = '<div style="font-size:0.44rem;color:var(--gtb-amber);padding:4px 0;line-height:1.7;">Date outside current expiry window.<br>Futures &amp; OI data unavailable.</div>';
            } else {
                futBody += '<div style="font-size:0.34rem;font-weight:700;color:var(--gtb-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Futures Trend</div>';
                [['NIFTY 50', fut.n50], ['NIFTY BANK', fut.bn], ['All', fut.all]].forEach(function(r) {
                    futBody += '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--gtb-border2);font-size:0.44rem;"><span style="color:var(--gtb-muted);">' + r[0] + '</span>' + _sc(r[1]||0) + '</div>';
                });
                futBody += '<div style="font-size:0.34rem;font-weight:700;color:var(--gtb-muted);text-transform:uppercase;letter-spacing:0.06em;margin:7px 0 4px;">Futures OI</div>';
                [['NIFTY 50', futOI.n50], ['NIFTY BANK', futOI.bn]].forEach(function(r) {
                    futBody += '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--gtb-border2);font-size:0.44rem;"><span style="color:var(--gtb-muted);">' + r[0] + '</span>' + _sc(r[1]||0) + '</div>';
                });
                if (hasOpt) {
                    futBody += '<div style="font-size:0.34rem;font-weight:700;color:var(--gtb-muted);text-transform:uppercase;letter-spacing:0.06em;margin:7px 0 4px;">Option Chain OI</div>';
                    [['NIFTY 50', optOI.n50], ['NIFTY BANK', optOI.bn]].forEach(function(r) {
                        futBody += '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--gtb-border2);font-size:0.44rem;"><span style="color:var(--gtb-muted);">' + r[0] + '</span>' + _sc(r[1]||0) + '</div>';
                    });
                } else {
                    futBody += '<div style="font-size:0.36rem;color:var(--gtb-amber);margin-top:7px;">Option OI — strikes not found</div>';
                }
            }
            h += _panel('bi bi-graph-up-arrow', 'Futures & OI', futBody, 160);

            // [D] OI Matrix per strike (NIFTY)
            if (oiMat && oiMat.nifty && Object.keys(oiMat.nifty).length) {
                var oiMatBody = '';
                var _fmtOI = function(v) {
                    if (!v) return '<span style="color:var(--gtb-muted);">—</span>';
                    var n = v / 100000; // in lakhs
                    return n.toFixed(1) + 'L';
                };
                var _renderMatrix = function(mat, atm, label) {
                    var strikes = Object.keys(mat).map(Number).sort(function(a,b){ return a-b; });
                    var body = '<div style="font-size:0.34rem;font-weight:700;color:var(--gtb-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">' + label + ' (ATM ' + atm + ')</div>';
                    body += '<table style="width:100%;border-collapse:collapse;">';
                    body += '<tr style="background:var(--gtb-surface);">';
                    body += '<th style="padding:2px 4px;font-size:0.3rem;color:var(--gtb-muted);text-align:right;">Strike</th>';
                    body += '<th style="padding:2px 4px;font-size:0.3rem;color:var(--gtb-green);text-align:right;">CE OI</th>';
                    body += '<th style="padding:2px 4px;font-size:0.3rem;color:var(--gtb-red);text-align:right;">PE OI</th>';
                    body += '<th style="padding:2px 4px;font-size:0.3rem;color:var(--gtb-muted);text-align:center;">Bias</th>';
                    body += '</tr>';
                    strikes.forEach(function(sk) {
                        var ceOI = mat[sk] && mat[sk].CE || 0;
                        var peOI = mat[sk] && mat[sk].PE || 0;
                        var isAtm = sk === atm;
                        var bias = peOI > ceOI * 1.2 ? '<span style="color:var(--gtb-green);">↑P</span>' : ceOI > peOI * 1.2 ? '<span style="color:var(--gtb-red);">↑C</span>' : '<span style="color:var(--gtb-muted);">≈</span>';
                        body += '<tr style="' + (isAtm ? 'background:var(--gtb-accent)18;' : '') + '">';
                        body += '<td style="padding:2px 4px;font-size:0.38rem;font-weight:' + (isAtm?'800':'500') + ';text-align:right;white-space:nowrap;">' + sk + (isAtm ? ' *' : '') + '</td>';
                        body += '<td style="padding:2px 4px;font-size:0.38rem;color:var(--gtb-green);text-align:right;">' + _fmtOI(ceOI) + '</td>';
                        body += '<td style="padding:2px 4px;font-size:0.38rem;color:var(--gtb-red);text-align:right;">' + _fmtOI(peOI) + '</td>';
                        body += '<td style="padding:2px 4px;font-size:0.38rem;text-align:center;">' + bias + '</td>';
                        body += '</tr>';
                    });
                    body += '</table>';
                    return body;
                };
                oiMatBody += _renderMatrix(oiMat.nifty, oiMat.atmNifty, 'NIFTY');
                if (oiMat.bank && Object.keys(oiMat.bank).length) {
                    oiMatBody += '<div style="margin-top:6px;">' + _renderMatrix(oiMat.bank, oiMat.atmBank, 'BANK NIFTY') + '</div>';
                }
                h += _panel('bi bi-layers-fill', 'OI Matrix', oiMatBody);
            }

            h += '</div>'; // end top row

            // BOTTOM ROW: Instrument Scores (full width)
            h += '<div style="flex:0 0 auto;display:flex;flex-direction:column;overflow:hidden;border-top:0;">';
            h += '<div style="padding:5px 10px;border-bottom:1px solid var(--gtb-border);font-size:0.38rem;font-weight:800;color:var(--gtb-muted);text-transform:uppercase;letter-spacing:0.07em;background:var(--gtb-surface);flex-shrink:0;"><i class="bi bi-table"></i> Instrument Scores</div>';
            h += '<div style="overflow:auto;">';
            h += '<table style="width:100%;border-collapse:collapse;">';
            h += '<thead><tr style="background:var(--gtb-surface);">';
            var _ith = function(label, align) { return '<th style="padding:4px 8px;font-size:0.36rem;font-weight:700;color:var(--gtb-muted);text-transform:uppercase;border-bottom:1px solid var(--gtb-border);white-space:nowrap;text-align:' + (align||'left') + ';">' + label + '</th>'; };
            h += _ith('Instrument') + _ith('Price','right') + _ith('Zone','center') + _ith('9:15','right') + _ith('Trend','right') + _ith('Futures','right') + _ith('OI/OBV','right') + _ith('Total','right') + _ith('Action','right');
            h += '</tr></thead><tbody>';
            mainInstrs.forEach(function(nm) {
                var sc2  = (snap.instrScores || {})[nm] || {};
                var tot2 = parseFloat(sc2.total) || 0;
                var zone = zones[nm] || '—';
                var zc   = (zone==='AST'||zone==='ASO') ? 'var(--gtb-green)' : (zone==='BST'||zone==='BSO') ? 'var(--gtb-red)' : 'var(--gtb-muted)';
                var act  = tot2 >= 4 ? 'BUY CE' : tot2 >= 2 ? 'Wait ASO' : tot2 >= 0 ? 'WAIT' : tot2 >= -3 ? 'Wait BSO' : 'BUY PE';
                var actCol = tot2 >= 2 ? 'var(--gtb-green)' : tot2 <= -2 ? 'var(--gtb-red)' : 'var(--gtb-amber)';
                var rowBg = tot2 > 0 ? 'background:rgba(63,185,80,0.05);' : tot2 < 0 ? 'background:rgba(248,81,73,0.05);' : '';
                var _itd = function(content, align) { return '<td style="padding:4px 8px;font-size:0.46rem;border-bottom:1px solid var(--gtb-border2);white-space:nowrap;text-align:' + (align||'left') + ';">' + content + '</td>'; };
                var priceStr = prices[nm] ? parseFloat(prices[nm]).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—';
                h += '<tr style="' + rowBg + '">';
                h += _itd('<span style="font-weight:700;">' + nm + '</span>');
                h += _itd('<span style="color:var(--gtb-text);">' + priceStr + '</span>', 'right');
                h += _itd('<span style="color:' + zc + ';font-weight:800;">' + zone + '</span>', 'center');
                h += _itd(_si(sc2.nine_fifteen||0), 'right');
                h += _itd(_si(sc2.current_trend||0), 'right');
                h += _itd(_si(sc2.futures_trend||0), 'right');
                h += _itd(_si(sc2.oi_obv||0), 'right');
                h += _itd('<span style="color:' + _scoreColor(tot2) + ';font-weight:900;">' + (tot2>0?'+':'') + tot2.toFixed(1) + '</span>', 'right');
                h += _itd('<span style="color:' + actCol + ';font-weight:700;">' + act + '</span>', 'right');
                h += '</tr>';
            });
            h += '</tbody></table>';
            h += '</div>'; // overflow:auto
            h += '</div>'; // bottom row

            h += '</div>'; // end right content
            h += '</div>'; // end #gtb-hr-panels
            return h;
        }

        function _fullHtml(idx) {
            return _buildTimeline(idx) +
                '<div id="gtb-hr-body" style="flex:1;min-height:0;overflow:hidden;">' +
                _renderSnap(snaps[idx]) +
                '</div>';
        }

        // Inject into popup
        jQ('.' + _cls).find('.popupwindow_content').html(
            '<div id="gtb-hr-root" style="display:flex;flex-direction:column;height:100%;">' +
            _fullHtml(currentIdx) +
            '</div>'
        );
        _updateTitle(date + ' · ' + snaps.length + ' intervals');

        // Scroll timeline to last chip
        function _scrollActive() {
            var $tl = jQ('.' + _cls).find('#gtb-hr-timeline');
            var $chip = $tl.find('.gtb-hr-chip[data-idx="' + currentIdx + '"]');
            if ($chip.length) {
                var off = $chip[0].offsetLeft - $tl[0].clientWidth / 2 + $chip[0].clientWidth / 2;
                $tl[0].scrollLeft = Math.max(0, off);
            }
        }
        setTimeout(_scrollActive, 80);

        // Chip click
        jQ('.' + _cls).off('click.hr-chip').on('click.hr-chip', '.gtb-hr-chip', function() {
            var idx = parseInt(jQ(this).data('idx'));
            if (isNaN(idx)) return;
            currentIdx = idx;
            jQ('.' + _cls).find('#gtb-hr-root').html(_fullHtml(currentIdx));
            setTimeout(_scrollActive, 30);
            _updateTitle(date + ' · ' + snaps.length + ' intervals');
        });

        _resetBtn();

        } catch(e) {  // top-level handler for any uncaught async error
            console.error('[HistReplay] Error:', e);
            prog('Error: ' + (e && e.message ? e.message : String(e)), 'var(--gtb-red)');
            _resetBtn();
        }

    });  // end load button click
}

jQ(document).on('click', '#show-snap-replay', function(e) {
    e.preventDefault();
    _gtbShowHistoricalReplay();
});

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
            _gtbComputeOIExtras(name, oiData);
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

// ── Instrument Detail View — full overview panel in the maximize overlay ─────────
function _gtbNormaliseInstrName(name) {
    name = (name || '').trim().toUpperCase();
    if (name === 'NIFTY') name = 'NIFTY 50';
    if (name === 'BANKNIFTY' || name === 'BANK NIFTY') name = 'NIFTY BANK';
    return name;
}

// ── Shared helpers for detail view panels ─────────────────────────────────────

// Render 9:15 badge from localStorage (always valid before any fetch)
// ── Risk Manager panel — instrument-specific position sizing ──────────────────
function _gtbRiskPanel(name) {
    var funds    = parseFloat(localStorage.getItem('GTB_RISK_FUNDS') || '0');
    var riskPct  = parseFloat(localStorage.getItem('GTB_RISK_PCT')   || '2');

    var cs = {total:0, current_trend:0}; try { cs = computeInstrumentScore(name); } catch(e) {}

    var ltp   = 0;
    try { ltp = parseFloat((_btLtps()[name]||{}).ltp||0); } catch(e) {}

    var lotSize = 0;
    try {
        if (typeof FUTURE_INTRUMENT_LIST !== 'undefined') {
            var _futName = name === 'NIFTY 50' ? 'NIFTY' : name === 'NIFTY BANK' ? 'BANKNIFTY' : name;
            var _fi = FUTURE_INTRUMENT_LIST.find(function(x){ return x.name === _futName; });
            if (_fi) lotSize = parseInt(_fi.lot_size) || 0;
        }
    } catch(e) {}
    if (!lotSize) { var _mcxMap = {'CRUDEOILM':100,'USDINR':1000}; lotSize = _mcxMap[name] || 0; }

    // Derive levels from open price (same logic as generateTrend, but null-safe)
    var aso = 0, ast = 0, bso = 0, bst = 0, vixL = 0, vixU = 0;
    try {
        var _openDetail = (_btOpens()[name] || {});
        var _openPrice  = parseFloat(_openDetail.price || 0);
        if (_openPrice) {
            var _sd = getStrikeDetails({ price: _openPrice }, name);
            aso = parseFloat(_sd.ustrikeOne);
            ast = parseFloat(_sd.ustrikeTwo);
            bso = parseFloat(_sd.bstrikeOne);
            bst = parseFloat(_sd.bstrikeTwo);
        }
        var _vixRaw = JSON.parse(localStorage.getItem('VIX_QUOTE') || 'null');
        var _prevVix = _vixRaw ? parseFloat(_vixRaw.data.candles[0][4]) : 0;
        var _prevClose = parseFloat(_openDetail.prevPrice || 0);
        if (_prevClose && _prevVix) {
            var _vr = getVixRange(_prevClose, _prevVix);
            vixL = parseFloat(_vr.vixDDLower);
            vixU = parseFloat(_vr.vixDDUpper);
        }
    } catch(e) {}

    var bull = cs.total > 0;
    var bear = cs.total < 0;
    var entry = bull ? aso : bear ? bso : (ltp || 0);
    var sl    = bull ? bso : bear ? aso : 0;
    var tgt1  = bull ? ast : bear ? bst : 0;
    var tgt2  = bull ? vixU : bear ? vixL : 0;

    var riskPerUnit = (entry && sl) ? Math.abs(entry - sl) : 0;
    var riskPerLot  = riskPerUnit * lotSize;
    var maxRiskAmt  = funds * (riskPct / 100);
    var suggestLots = (riskPerLot > 0 && maxRiskAmt > 0) ? Math.floor(maxRiskAmt / riskPerLot) : 0;

    var vixVal = 0;
    try { vixVal = parseFloat((_btLtps()['INDIA VIX']||{}).ltp||0); } catch(e) {}
    if (!vixVal) try { vixVal = VIX||0; } catch(e) {}
    var vixMult  = vixVal > 25 ? 0.5 : vixVal > 18 ? 0.7 : vixVal > 13 ? 0.85 : 1.0;
    var adjLots  = Math.floor(suggestLots * vixMult);
    var adjRisk  = adjLots * riskPerLot;
    var rr1      = (entry && sl && tgt1) ? (Math.abs(tgt1-entry)/riskPerUnit).toFixed(1) : '--';

    var dir = bull ? 'BULL' : bear ? 'BEAR' : 'NEUTRAL';
    var dirCol = bull ? 'var(--gtb-green)' : bear ? 'var(--gtb-red)' : 'var(--gtb-muted)';
    var f = function(v){ return v ? parseFloat(v).toLocaleString('en-IN',{maximumFractionDigits:2}) : '--'; };
    var fc = function(v){ return v ? '₹'+parseFloat(v).toLocaleString('en-IN',{maximumFractionDigits:0}) : '--'; };

    var row = function(label, val, col) {
        return '<div class="gdb-bt-row" style="padding:2px 0;">'
            + '<span style="font-size:0.5rem;color:var(--gtb-muted);">' + label + '</span>'
            + '<span style="font-size:0.52rem;font-weight:700;' + (col ? 'color:'+col+';' : '') + '">' + val + '</span>'
            + '</div>';
    };

    var noData = !entry || !sl || !lotSize;

    return '<div style="padding:6px 8px;">'
        // ── Inputs ──
        + '<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">'
        +   '<label style="font-size:0.48rem;color:var(--gtb-muted);">Funds</label>'
        +   '<input id="grm-funds" type="number" value="' + (funds||'') + '" placeholder="Available ₹" '
        +     'style="width:90px;font-size:0.5rem;padding:2px 4px;background:var(--gtb-surface2);border:1px solid var(--gtb-border2);border-radius:2px;color:var(--gtb-text);">'
        +   '<label style="font-size:0.48rem;color:var(--gtb-muted);">Risk %</label>'
        +   '<input id="grm-pct" type="number" value="' + riskPct + '" min="0.5" max="10" step="0.5" '
        +     'style="width:48px;font-size:0.5rem;padding:2px 4px;background:var(--gtb-surface2);border:1px solid var(--gtb-border2);border-radius:2px;color:var(--gtb-text);">'
        +   '<button id="grm-calc" class="gtb-win-btn" title="Recalculate" style="font-size:0.48rem;padding:2px 6px;"><i class="bi bi-arrow-clockwise"></i></button>'
        + '</div>'
        // ── Direction banner ──
        + '<div style="font-size:0.52rem;font-weight:700;color:' + dirCol + ';margin-bottom:6px;">'
        +   dir + (noData ? ' — insufficient data' : '') + '</div>'
        + (noData ? '<div style="font-size:0.48rem;color:var(--gtb-muted);">Run main refresh to load strike/OI data.</div>' :
            // ── Level grid ──
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-bottom:8px;">'
            + row('Entry ('+( bull?'ASO':'BSO')+')', f(entry), dirCol)
            + row('Stop Loss ('+(bull?'BSO':'ASO')+')', f(sl), bull?'var(--gtb-red)':'var(--gtb-green)')
            + row('Target 1 ('+(bull?'AST':'BST')+')', f(tgt1), dirCol)
            + row('Target 2 (VIX '+(bull?'Upper':'Lower')+')', f(tgt2), dirCol)
            + row('R:R (T1)', rr1 !== '--' ? '1 : ' + rr1 : '--', parseFloat(rr1)>=1.5?'var(--gtb-green)':parseFloat(rr1)>=1?'#fbbf24':'var(--gtb-red)')
            + row('Lot size', lotSize || '--', '')
            + '</div>'
            + '<div style="height:1px;background:var(--gtb-border2);margin:5px 0;"></div>'
            // ── Sizing ──
            + (funds > 0 ?
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;">'
                + row('Max risk ('+riskPct+'%)', fc(maxRiskAmt), '#fbbf24')
                + row('Risk per lot', fc(riskPerLot), '')
                + row('Suggested lots', suggestLots || '0', suggestLots>0?'var(--gtb-green)':'var(--gtb-muted)')
                + row('VIX adj. lots ('+(vixMult*100).toFixed(0)+'%)', adjLots || '0', adjLots>0?'var(--gtb-green)':'var(--gtb-muted)')
                + row('Capital at risk', fc(adjRisk), adjRisk/funds>0.03?'var(--gtb-red)':'#fbbf24')
                + row('% of funds', funds>0?(adjRisk/funds*100).toFixed(1)+'%':'--', '')
                + '</div>'
                : '<div style="font-size:0.48rem;color:var(--gtb-muted);">Enter available funds above to see position sizing.</div>'
            )
        )
        + '</div>';
}

// Bind risk panel recalculate (delegated — panel may be in either single or multi view)
jQ(document).off('click.grm-calc').on('click.grm-calc', '#grm-calc', function() {
    var funds = parseFloat(jQ('#grm-funds').val()) || 0;
    var pct   = parseFloat(jQ('#grm-pct').val())   || 2;
    localStorage.setItem('GTB_RISK_FUNDS', funds);
    localStorage.setItem('GTB_RISK_PCT',   pct);
    // Re-render the panel for the instrument currently shown
    var $panel = jQ(this).closest('.gtb-ic-panel');
    var name   = $panel.data('risk-name');
    if (name) $panel.find('.gtb-ic-panel-body').html(_gtbRiskPanel(name));
});

function _dvSet915(name, tid, sfx) {
    try {
        var b915 = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN')) || {};
        var b9 = b915[name] || {}, c915 = b9.CLOSE_9_15;
        if (!c915) return;
        var _bull = (c915==='ASO'||c915==='AST'), _bear = (c915==='BSO'||c915==='BST');
        var _cls  = _bull ? 'gtb-915-bull' : _bear ? 'gtb-915-bear' : 'gtb-915-neutral';
        var _det  = '<span class="' + _cls + '" style="font-weight:700;">' + c915 + '</span>';
        if (b9.close) _det += ' <span style="color:var(--gtb-muted);">close: ' + parseFloat(b9.close).toFixed(2) + '</span>';
        jQ('#' + tid + '-915-detail' + sfx).html(_det);
        jQ('#' + tid + '-915-badge'  + sfx).html('<span class="' + _cls + '">' + c915 + '</span>');
    } catch(e) {}
}

// Fetch live data then render trend probability, OI/OBV, futures, OI matrix,
// weightage bars, and PCR — all in correct dependency order
async function _dvFetchAndRender(name, tid, sfx, isMcx) {
    // Chart fires independently (doesn't affect score calculations)
    try {
        if (isMcx) showTopChartMCX(name, null, '#' + tid + '-chart' + sfx).catch(function(){});
        else        showTopChart(name, '#' + tid + '-chart' + sfx, null, sfx).catch(function(){});
    } catch(e) {}

    try {
        if (isMcx) {
            // MCX: futures → OI/OBV → then render score-dependent panels
            var res = await showFutureDetailsMCX(name);
            if (res) {
                setFutureDetails(name, res, sfx);          // populates futures panel + remark chip
                if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
                INSTRUMENT_SCORE_MAP[name].futures_trend = getFuturesTrendScore(res['REMARK']);
                INSTRUMENT_SCORE_MAP[name].oi_obv = 0;
                await showPrictionProbabiltyMCX(name, res);
                showOIOBVBarChart(name, sfx);
                // After showPrictionProbabiltyMCX, the global stock[0].DATA holds MCX OI tableData.
                // Store it in INSTRUMENT_SCORE_MAP so _gtbRenderOIMatrix can render the matrix.
                try {
                    var _mcxOiData = (typeof stock !== 'undefined' && stock.length && stock[0]['DATA']) ? stock[0]['DATA'] : null;
                    if (_mcxOiData && _mcxOiData.tableData && _mcxOiData.tableData.length) {
                        INSTRUMENT_SCORE_MAP[name].oiData = _mcxOiData;
                        _gtbRenderOIMatrix(name, sfx);
                        var _lbl = document.getElementById(tid + '-oimatrix-lbl' + sfx);
                        if (_lbl) _lbl.textContent = 'live';
                        try { _dvRenderMPGex(name, tid, sfx); } catch(e2) {}
                    }
                } catch(e) { console.log('MCX OI matrix', name, e); }
            }
        } else {
            // NSE: OI+OBV and futures in parallel
            var results = await Promise.all([
                (async function() {
                    await showPrictionProbabilty(name);
                    var ed = ((INSTRUMENT_SCORE_MAP[name] || {}).stockEntry || {})['DATA'];
                    showOIOBVBarChart(name, sfx, ed);
                    // OI matrix — uses fresh oiData written by showPrictionProbabilty
                    var freshOI = (INSTRUMENT_SCORE_MAP[name] || {}).oiData;
                    if (freshOI && freshOI.tableData && freshOI.tableData.length) {
                        _gtbRenderOIMatrix(name, sfx);
                        var _lbl = document.getElementById(tid + '-oimatrix-lbl' + sfx);
                        if (_lbl) _lbl.textContent = 'live';
                        try { _dvRenderMPGex(name, tid, sfx); } catch(e2) {}
                    }
                })(),
                showFutureDetails(name),
            ]);
            var fres = results[1];
            if (fres) {
                setFutureDetails(name, fres, sfx);          // populates futures panel + remark chip
                if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
                INSTRUMENT_SCORE_MAP[name].futures_trend = getFuturesTrendScore(fres['REMARK']);
                INSTRUMENT_SCORE_MAP[name].avwap = fres['vwapPrice'] || 0;
            }
        }

        // ── Score-dependent panels — rendered AFTER all data is in INSTRUMENT_SCORE_MAP ──
        // Compute and cache the score so _gtbUpdateWeightBars finds it
        try {
            var _sc = computeInstrumentScore(name);
            if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
            INSTRUMENT_SCORE_MAP[name].score = _sc;
        } catch(e) {}
        try { jQ('#' + tid + '-prob' + sfx).html(_cmdTrendProb(name, null)); } catch(e) {}
        try { _gtbUpdateWeightBars(name, sfx); } catch(e) {}

        // ── Trade Analysis — render inline after all data is ready ───────────────
        try {
            var _taEl = document.getElementById('dv-ta-' + tid + sfx.replace(/-/g,'_'));
            if (_taEl) {
                var _taBody = _taEl.querySelector('.gtb-ic-panel-body');
                _btAnalyzeInstrument(name, _taBody || _taEl);
            }
        } catch(e) {}

        // ── Risk Manager — render after data is ready ─────────────────────────────
        try {
            var _rmEl = document.querySelector('[data-risk-name="' + name + '"] .gtb-ic-panel-body');
            if (_rmEl) _rmEl.innerHTML = _gtbRiskPanel(name);
        } catch(e) {}

        // ── AVWAP chip in detail-view identity strip ──────────────────────────────
        try {
            var _avwapEl = document.getElementById(tid + '-avwap' + sfx);
            if (_avwapEl) {
                var _avwap = (INSTRUMENT_SCORE_MAP[name] || {}).avwap || 0;
                var _avLtp = 0;
                try { _avLtp = parseFloat((JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}')[name] || {}).ltp) || 0; } catch(e2) {}
                if (_avwap && _avLtp) {
                    var _avAbove = _avLtp > _avwap;
                    var _avCol   = _avAbove ? 'var(--gtb-green)' : 'var(--gtb-red)';
                    var _avTip   = 'AVWAP (9:15 anchor): ' + _avwap.toFixed(1) + ' | LTP ' + (_avAbove ? 'above' : 'below') + ' — ' + (_avAbove ? 'Bullish bias' : 'Bearish bias');
                    _avwapEl.innerHTML = '<span title="' + _avTip + '" style="font-size:0.48rem;color:' + _avCol + ';font-weight:700;white-space:nowrap;cursor:default;">' + (_avAbove ? '▲' : '▼') + ' AVWAP</span>';
                }
            }
        } catch(e) {}

    } catch(e) { console.log('_dvFetchAndRender', name, e); }
}

async function _gtbLoadInstrDetail(name) {
    name = _gtbNormaliseInstrName(name);
    if (!name) return;

    var tid     = name.replace(/ /g, '-').replace(/&/g, '-');
    var isMcx   = _gtbIsMcxFuture(name);
    var isNifty = name === 'NIFTY 50';
    var isBank  = name === 'NIFTY BANK';
    var sfx     = '-dv'; // ID suffix — keeps detail IDs from clashing with overview

    // ── HTML: exact same 8-panel structure as _buildCard ─────────────────────
    var h = '<div class="gtb-instr-card-v" style="width:100%;margin:0 auto;">';

    // ── [0] Identity ──────────────────────────────────────────────────────────
    h += '<div class="gtb-ic-panel gtb-ic-panel-identity" data-col="id">';
    h +=   '<div class="gtb-ic-panel-hdr">';
    h +=     '<span class="gtb-instr-link" style="font-weight:800;font-size:0.7rem;">' + name + '</span>';
    h +=     '<span id="' + tid + '-ltp' + sfx + '" class="gtb-row-ltp"></span>';
    h +=     '<span id="' + tid + '-trend-zone' + sfx + '" class="gtb-trend-zone"></span>';
    h +=     '<span id="' + tid + '-915-badge' + sfx + '" class="gtb-915-badge"></span>';
    h +=     '<span id="' + tid + '-futures-premium' + sfx + '" class="gtb-cell-premium-chip"></span>';
    h +=     '<span id="' + tid + '-futures-trend' + sfx + '" class="gtb-cell-fut-remark"></span>';
    h +=     '<span id="' + tid + '-avwap' + sfx + '" class="gtb-avwap-chip"></span>';
    h +=     '<button class="sv-icon-btn gtb-dv-refresh" data-name="' + name + '" style="margin-left:auto;"><i class="bi bi-arrow-clockwise"></i> Refresh</button>';
    h +=   '</div>';
    h += '</div>';

    // ── [1] Chart ─────────────────────────────────────────────────────────────
    h += '<div class="gtb-ic-panel" data-col="chart">';
    h +=   '<div class="gtb-ic-panel-hdr">';
    h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-bar-chart-line-fill"></i> PRICE ACTION</span>';
    h +=     '<span class="gtb-ic-panel-btns">';
    h +=       '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="chart" title="Maximize"><i class="bi bi-fullscreen"></i></button>';
    h +=     '</span>';
    h +=   '</div>';
    h +=   '<div class="gtb-ic-panel-body" style="padding:0;">';
    h +=     '<div id="' + tid + '-chart-levels' + sfx + '" class="gtb-chart-levels"></div>';
    h +=     '<div id="' + tid + '-chart' + sfx + '" class="gtb-chart-mini gtb-row-chart"></div>';
    h +=   '</div>';
    h += '</div>';

    // ── [2] OI / OBV ─────────────────────────────────────────────────────────
    h += '<div class="gtb-ic-panel" data-col="oiobv">';
    h +=   '<div class="gtb-ic-panel-hdr">';
    h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-layers-fill"></i> OI / OBV</span>';
    h +=     '<span class="gtb-ic-panel-btns">';
    h +=       '<button class="sv-icon-btn refresh-oi-obv" data-name="' + name + '" title="Refresh OI"><i class="bi bi-arrow-clockwise"></i></button>';
    h +=       '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="oi" title="Maximize"><i class="bi bi-fullscreen"></i></button>';
    h +=     '</span>';
    h +=   '</div>';
    h +=   '<div class="gtb-ic-panel-body">';
    h +=   '<div class="gtb-ic-sub-hdr">OI Change</div>';
    h +=   '<div id="' + tid + '-oi' + sfx + '" class="gtb-chart-oi" style="height:110px;"></div>';
    h +=   '<div id="' + tid + '-oi-signal-row' + sfx + '" style="display:none;"></div>';
    h +=   '<div class="gtb-ic-sub-hdr" style="margin-top:4px;">OBV</div>';
    h +=   '<div id="' + tid + '-obv' + sfx + '" class="gtb-chart-oi" style="height:110px;"></div>';
    h +=   '<div id="' + tid + '-oiobv-xaxis' + sfx + '" class="gtb-oiobv-xaxis"></div>';
    h +=   '</div>';
    h += '</div>';

    // ── [3] OI Matrix (directly below OI/OBV) ────────────────────────────────
    h += '<div class="gtb-ic-panel" data-col="oimatrix">';
    h +=   '<div class="gtb-ic-panel-hdr">';
    h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-table"></i> OI MATRIX</span>';
    h +=     '<span id="' + tid + '-oimatrix-lbl' + sfx + '" style="font-size:0.42rem;color:var(--gtb-muted);margin-left:4px;"></span>';
    h +=   '</div>';
    h +=   '<div class="gtb-ic-panel-body" style="overflow-x:auto;padding:0 4px;">';
    h +=   '<div id="' + tid + '-oimatrix' + sfx + '" class="gtb-row-oimatrix"></div>';
    h +=   '</div>';
    h += '</div>';

    // ── [4] 9:15 Breakout ────────────────────────────────────────────────────
    h += '<div class="gtb-ic-panel" data-col="915">';
    h +=   '<div class="gtb-ic-panel-hdr">';
    h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-alarm"></i> 9:15 BREAKOUT</span>';
    h +=     '<span class="gtb-ic-panel-btns"><button class="gtb-prob-btn sv-icon-btn" data-name="' + name + '" title="Strike probability"><i class="bi bi-percent"></i></button></span>';
    h +=   '</div>';
    h +=   '<div class="gtb-ic-panel-body">';
    h +=   '<span class="gtb-915-detail" id="' + tid + '-915-detail' + sfx + '" style="font-size:0.52rem;color:var(--gtb-muted);">Waiting for data…</span>';
    h +=   '</div>';
    h += '</div>';

    // ── [5] Trend Probability ────────────────────────────────────────────────
    h += '<div class="gtb-ic-panel" data-col="prob">';
    h +=   '<div class="gtb-ic-panel-hdr"><span class="gtb-ic-panel-title"><i class="bi bi-speedometer2"></i> TREND PROBABILITY</span></div>';
    h +=   '<div class="gtb-ic-panel-body" id="' + tid + '-prob' + sfx + '"></div>';
    h += '</div>';

    // ── [6] Futures ──────────────────────────────────────────────────────────
    h += '<div class="gtb-ic-panel" data-col="fut">';
    h +=   '<div class="gtb-ic-panel-hdr">';
    h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-graph-up-arrow"></i> FUTURES</span>';
    h +=     '<span class="gtb-ic-panel-btns">';
    h +=       '<button class="sv-icon-btn gtb-fut-refresh-btn" data-name="' + name + '" title="Refresh futures"><i class="bi bi-arrow-clockwise"></i></button>';
    h +=       '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="futures" title="Maximize"><i class="bi bi-fullscreen"></i></button>';
    h +=     '</span>';
    h +=   '</div>';
    h +=   '<div class="gtb-ic-panel-body">';
    h +=   '<div id="' + tid + '-futures' + sfx + '" class="gtb-cell-fut-signals"></div>';
    h +=   '<div id="' + tid + '-atr-sl' + sfx + '" class="gtb-cell-sl-wrap" style="margin-top:4px;"></div>';
    h +=   '<div id="' + tid + '-futures-vwap' + sfx + '" style="font-size:0.5rem;margin-top:2px;"></div>';
    h +=   '</div>';
    h += '</div>';

    // ── [7] Weightage ────────────────────────────────────────────────────────
    h += '<div class="gtb-ic-panel" data-col="weights">';
    h +=   '<div class="gtb-ic-panel-hdr"><span class="gtb-ic-panel-title"><i class="bi bi-bar-chart-steps"></i> WEIGHTAGE</span></div>';
    h +=   '<div class="gtb-ic-panel-body" id="' + tid + '-weights' + sfx + '">';
    if (isNifty || isBank) {
        var wMap = isNifty ? NIFTY_50_WEIGHTED_STOCKS : NIFTY_BANK_WEIGHTED_STOCKS;
        Object.entries(wMap).sort(function(a,b){return b[1]-a[1];}).slice(0,6).forEach(function(kv) {
            var wname = kv[0], wtid2 = wname.replace(/ /g,'-').replace(/&/g,'-');
            h += '<div class="gtb-wt-row"><span class="gtb-wt-name">' + wname + '</span>'
               + '<div class="gtb-wt-bar"><b id="' + wtid2 + '-wt-bar' + sfx + '" style="width:0%;background:var(--gtb-muted)"></b></div>'
               + '<span class="gtb-wt-score" id="' + wtid2 + '-wt-score' + sfx + '">—</span></div>';
        });
    } else {
        [['9:15',tid+'-sub-915'],['Trend',tid+'-sub-trend'],['Fut',tid+'-sub-fut'],['OI',tid+'-sub-oi'],['Total',tid+'-sub-total']].forEach(function(sr) {
            h += '<div class="gtb-wt-row"><span class="gtb-wt-name">' + sr[0] + '</span>'
               + '<div class="gtb-wt-bar"><b id="' + sr[1] + sfx + '-bar" style="width:0%;background:var(--gtb-muted)"></b></div>'
               + '<span class="gtb-wt-score" id="' + sr[1] + sfx + '">—</span></div>';
        });
    }
    h +=   '</div>';
    h += '</div>';

    // ── [8] Details ──────────────────────────────────────────────────────────
    h += '<div class="gtb-ic-panel" data-col="detail">';
    h +=   '<div class="gtb-ic-panel-hdr">';
    h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-info-circle-fill"></i> DETAILS</span>';
    h +=     '<span class="gtb-ic-panel-btns"><button class="sv-icon-btn mp-gex-btn" data-name="' + name + '" title="Max Pain / GEX"><i class="bi bi-bar-chart-steps"></i></button></span>';
    h +=   '</div>';
    h +=   '<div class="gtb-ic-panel-body" id="' + tid + '-detail' + sfx + '">';
    h +=   '<div class="gtb-det-row"><span class="gtb-det-lbl">PCR</span><span class="gtb-pcr-chip gtb-det-val" id="' + tid + '-pcr-probability' + sfx + '"></span></div>';
    h +=   '<div class="gtb-det-row"><span class="gtb-det-lbl">OI sc</span><span class="gtb-oi-score-chip gtb-det-val" id="' + tid + '-oi-score' + sfx + '"></span></div>';
    h +=   '<div id="' + tid + '-mp-gex' + sfx + '" class="gtb-det-mp"></div>';
    h +=   '</div>';
    h += '</div>';

    h += '</div>'; // end .gtb-instr-card-v

    // Trade Analysis panel — rendered inline after _dvFetchAndRender completes
    var _taSfxId = '-dv'.replace(/-/g,'_');
    h += '<div id="dv-ta-' + tid + '_dv" class="gtb-ic-panel" style="margin-top:6px;">'
       + '<div class="gtb-ic-panel-hdr"><span class="gtb-ic-panel-title"><i class="bi bi-lightbulb-fill"></i> TRADE ANALYSIS' + _ii('dv-ta') + '</span>'
       + '<span style="font-size:0.44rem;color:var(--gtb-muted);margin-left:6px;">loads after data</span></div>'
       + '<div class="gtb-ic-panel-body" style="padding:4px 0;"></div>'
       + '</div>';

    // Risk Manager panel — rendered after _dvFetchAndRender completes
    h += '<div class="gtb-ic-panel" data-risk-name="' + name + '" style="margin-top:6px;">'
       + '<div class="gtb-ic-panel-hdr"><span class="gtb-ic-panel-title"><i class="bi bi-shield-fill-check"></i> RISK MANAGER' + _ii('dv-risk') + '</span>'
       + '<span style="font-size:0.44rem;color:var(--gtb-muted);margin-left:6px;">loads after data</span></div>'
       + '<div class="gtb-ic-panel-body" style="padding:0;"></div>'
       + '</div>';

    jQ('#fsig-result').html(h);

    // ── Only 9:15 from localStorage is reliable before any fetch ─────────────
    _dvSet915(name, tid, sfx);

    // ── All other panels require live data — fetch then render ────────────────
    _dvFetchAndRender(name, tid, sfx, isMcx);
}

// ── Instrument Detail View — multi-instrument support ─────────────────────────

// Suffix for a given instrument in the detail view (avoids clashing with overview IDs)
function _dvSfx(name) {
    return '-dv-' + name.replace(/ /g,'-').replace(/&/g,'-');
}

// Load / refresh one instrument panel inside #fsig-result; creates or replaces its column
function _gtbLoadInstrDetailPanel(name) {
    name = _gtbNormaliseInstrName(name);
    if (!name) return;
    var sfx = _dvSfx(name);
    var tid = name.replace(/ /g,'-').replace(/&/g,'-');
    var isMcx   = _gtbIsMcxFuture(name);
    var isNifty = name === 'NIFTY 50';
    var isBank  = name === 'NIFTY BANK';

    // ── Card HTML: 2-column layout ────────────────────────────────────────────
    var h = '<div class="gtb-instr-card-v gtb-dv-col" id="gtb-dv-col-' + tid + '">';

    // [0] Identity — sticky full-width header
    h += '<div class="gtb-ic-panel gtb-ic-panel-identity" data-col="id">';
    h +=   '<div class="gtb-ic-panel-hdr">';
    h +=     '<span style="font-weight:900;font-size:0.68rem;letter-spacing:0.01em;">' + name + '</span>';
    h +=     '<span id="' + tid + '-ltp' + sfx + '" class="gtb-row-ltp"></span>';
    h +=     '<span id="' + tid + '-trend-zone' + sfx + '" class="gtb-trend-zone"></span>';
    h +=     '<span id="' + tid + '-915-badge' + sfx + '" class="gtb-915-badge"></span>';
    h +=     '<span id="' + tid + '-futures-premium' + sfx + '" class="gtb-cell-premium-chip"></span>';
    h +=     '<span id="' + tid + '-futures-trend' + sfx + '" class="gtb-cell-fut-remark"></span>';
    h +=     '<span id="' + tid + '-avwap' + sfx + '" class="gtb-avwap-chip"></span>';
    h +=     '<button class="sv-icon-btn gtb-dv-panel-refresh" data-name="' + name + '" style="margin-left:auto;" title="Refresh"><i class="bi bi-arrow-clockwise"></i></button>';
    h +=     '<button class="sv-icon-btn gtb-dv-panel-close" data-name="' + name + '" style="color:var(--gtb-muted);" title="Remove"><i class="bi bi-x-lg"></i></button>';
    h +=   '</div>';
    h += '</div>';

    // ── 2-column body ─────────────────────────────────────────────────────────
    h += '<div class="gtb-dv-body-row">';

    // LEFT COLUMN: Chart + 9:15 + Futures
    h += '<div class="gtb-dv-left-col">';

    h += '<div class="gtb-ic-panel" data-col="chart">';
    h +=   '<div class="gtb-ic-panel-hdr">';
    h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-bar-chart-line-fill"></i> PRICE ACTION</span>';
    h +=     '<span class="gtb-ic-panel-btns"><button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="chart" title="Maximize"><i class="bi bi-fullscreen"></i></button></span>';
    h +=   '</div>';
    h +=   '<div class="gtb-ic-panel-body" style="padding:0;">';
    h +=     '<div id="' + tid + '-chart-levels' + sfx + '" class="gtb-chart-levels"></div>';
    h +=     '<div id="' + tid + '-chart' + sfx + '" class="gtb-chart-mini gtb-row-chart"></div>';
    h +=   '</div>';
    h += '</div>';

    h += '<div class="gtb-ic-panel" data-col="915">';
    h +=   '<div class="gtb-ic-panel-hdr">';
    h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-alarm"></i> 9:15 BREAKOUT</span>';
    h +=     '<span class="gtb-ic-panel-btns"><button class="gtb-prob-btn sv-icon-btn" data-name="' + name + '" title="Strike probability"><i class="bi bi-percent"></i></button></span>';
    h +=   '</div>';
    h +=   '<div class="gtb-ic-panel-body">';
    h +=   '<span class="gtb-915-detail" id="' + tid + '-915-detail' + sfx + '" style="font-size:0.52rem;color:var(--gtb-muted);">—</span>';
    h +=   '</div>';
    h += '</div>';

    h += '<div class="gtb-ic-panel" data-col="fut">';
    h +=   '<div class="gtb-ic-panel-hdr">';
    h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-graph-up-arrow"></i> FUTURES</span>';
    h +=     '<span class="gtb-ic-panel-btns"><button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="futures" title="Maximize"><i class="bi bi-fullscreen"></i></button></span>';
    h +=   '</div>';
    h +=   '<div class="gtb-ic-panel-body">';
    h +=   '<div id="' + tid + '-futures' + sfx + '" class="gtb-cell-fut-signals"></div>';
    h +=   '<div id="' + tid + '-atr-sl' + sfx + '" class="gtb-cell-sl-wrap" style="margin-top:4px;"></div>';
    h +=   '<div id="' + tid + '-futures-vwap' + sfx + '" style="font-size:0.5rem;margin-top:2px;"></div>';
    h +=   '</div>';
    h += '</div>';

    // Trade Analysis + Risk Manager in left col bottom (loads after data)
    var _taSfxId2 = sfx.replace(/-/g,'_');
    h += '<div id="dv-ta-' + tid + _taSfxId2 + '" class="gtb-ic-panel">'
       + '<div class="gtb-ic-panel-hdr"><span class="gtb-ic-panel-title"><i class="bi bi-lightbulb-fill"></i> TRADE ANALYSIS' + _ii('dv-ta') + '</span>'
       + '<span style="font-size:0.4rem;color:var(--gtb-muted);margin-left:6px;">loads after data</span></div>'
       + '<div class="gtb-ic-panel-body" style="padding:4px 0;"></div>'
       + '</div>';

    h += '<div class="gtb-ic-panel" data-risk-name="' + name + '">'
       + '<div class="gtb-ic-panel-hdr"><span class="gtb-ic-panel-title"><i class="bi bi-shield-fill-check"></i> RISK MANAGER' + _ii('dv-risk') + '</span>'
       + '<span style="font-size:0.4rem;color:var(--gtb-muted);margin-left:6px;">loads after data</span></div>'
       + '<div class="gtb-ic-panel-body" style="padding:0;"></div>'
       + '</div>';

    h += '</div>'; // end left col

    // RIGHT COLUMN: OI/OBV + OI Matrix + Trend Prob + Weightage + Details + Max Pain
    h += '<div class="gtb-dv-right-col">';

    h += '<div class="gtb-ic-panel" data-col="oiobv">';
    h +=   '<div class="gtb-ic-panel-hdr">';
    h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-layers-fill"></i> OI / OBV</span>';
    h +=     '<span class="gtb-ic-panel-btns">';
    h +=       '<button class="sv-icon-btn refresh-oi-obv" data-name="' + name + '" title="Refresh OI"><i class="bi bi-arrow-clockwise"></i></button>';
    h +=       '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="oi" title="Maximize"><i class="bi bi-fullscreen"></i></button>';
    h +=     '</span>';
    h +=   '</div>';
    h +=   '<div class="gtb-ic-panel-body">';
    h +=   '<div class="gtb-ic-sub-hdr">OI Change</div>';
    h +=   '<div id="' + tid + '-oi' + sfx + '" class="gtb-chart-oi" style="height:110px;"></div>';
    h +=   '<div id="' + tid + '-oi-signal-row' + sfx + '" style="display:none;"></div>';
    h +=   '<div class="gtb-ic-sub-hdr" style="margin-top:4px;">OBV</div>';
    h +=   '<div id="' + tid + '-obv' + sfx + '" class="gtb-chart-oi" style="height:110px;"></div>';
    h +=   '<div id="' + tid + '-oiobv-xaxis' + sfx + '" class="gtb-oiobv-xaxis"></div>';
    h +=   '</div>';
    h += '</div>';

    h += '<div class="gtb-ic-panel" data-col="oimatrix">';
    h +=   '<div class="gtb-ic-panel-hdr">';
    h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-table"></i> OI MATRIX</span>';
    h +=     '<span id="' + tid + '-oimatrix-lbl' + sfx + '" style="font-size:0.42rem;color:var(--gtb-muted);margin-left:4px;"></span>';
    h +=   '</div>';
    h +=   '<div class="gtb-ic-panel-body" style="overflow-x:auto;padding:0 4px;">';
    h +=   '<div id="' + tid + '-oimatrix' + sfx + '" class="gtb-row-oimatrix"></div>';
    h +=   '</div>';
    h += '</div>';

    h += '<div class="gtb-ic-panel" data-col="prob">';
    h +=   '<div class="gtb-ic-panel-hdr"><span class="gtb-ic-panel-title"><i class="bi bi-speedometer2"></i> TREND PROBABILITY</span></div>';
    h +=   '<div class="gtb-ic-panel-body" id="' + tid + '-prob' + sfx + '"></div>';
    h += '</div>';

    h += '<div class="gtb-ic-panel" data-col="weights">';
    h +=   '<div class="gtb-ic-panel-hdr"><span class="gtb-ic-panel-title"><i class="bi bi-bar-chart-steps"></i> WEIGHTAGE</span></div>';
    h +=   '<div class="gtb-ic-panel-body" id="' + tid + '-weights' + sfx + '">';
    if (isNifty || isBank) {
        var wMap = isNifty ? NIFTY_50_WEIGHTED_STOCKS : NIFTY_BANK_WEIGHTED_STOCKS;
        Object.entries(wMap).sort(function(a,b){return b[1]-a[1];}).slice(0,6).forEach(function(kv) {
            var wn = kv[0], wtid2 = wn.replace(/ /g,'-').replace(/&/g,'-');
            h += '<div class="gtb-wt-row"><span class="gtb-wt-name">' + wn + '</span>'
               + '<div class="gtb-wt-bar"><b id="' + wtid2 + '-wt-bar' + sfx + '" style="width:0%;background:var(--gtb-muted)"></b></div>'
               + '<span class="gtb-wt-score" id="' + wtid2 + '-wt-score' + sfx + '">—</span></div>';
        });
    } else {
        [['9:15',tid+'-sub-915'],['Trend',tid+'-sub-trend'],['Fut',tid+'-sub-fut'],['OI',tid+'-sub-oi'],['Total',tid+'-sub-total']].forEach(function(sr) {
            h += '<div class="gtb-wt-row"><span class="gtb-wt-name">' + sr[0] + '</span>'
               + '<div class="gtb-wt-bar"><b id="' + sr[1] + sfx + '-bar" style="width:0%;background:var(--gtb-muted)"></b></div>'
               + '<span class="gtb-wt-score" id="' + sr[1] + sfx + '">—</span></div>';
        });
    }
    h +=   '</div>';
    h += '</div>';

    h += '<div class="gtb-ic-panel" data-col="detail">';
    h +=   '<div class="gtb-ic-panel-hdr">';
    h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-info-circle-fill"></i> DETAILS</span>';
    h +=     '<span class="gtb-ic-panel-btns"><button class="sv-icon-btn mp-gex-btn" data-name="' + name + '" title="Max Pain / GEX"><i class="bi bi-bar-chart-steps"></i></button></span>';
    h +=   '</div>';
    h +=   '<div class="gtb-ic-panel-body" id="' + tid + '-detail' + sfx + '">';
    h +=   '<div class="gtb-det-row"><span class="gtb-det-lbl">PCR</span><span class="gtb-pcr-chip gtb-det-val" id="' + tid + '-pcr-probability' + sfx + '"></span></div>';
    h +=   '<div class="gtb-det-row"><span class="gtb-det-lbl">OI sc</span><span class="gtb-oi-score-chip gtb-det-val" id="' + tid + '-oi-score' + sfx + '"></span></div>';
    h +=   '<div id="' + tid + '-mp-gex' + sfx + '" class="gtb-det-mp"></div>';
    h +=   '</div>';
    h += '</div>';

    h += '<div class="gtb-ic-panel" data-col="mpgex" id="dv-mpgex-' + tid + sfx + '">';
    h +=   '<div class="gtb-ic-panel-hdr">';
    h +=     '<span class="gtb-ic-panel-title"><i class="bi bi-bar-chart-steps"></i> MAX PAIN &amp; GEX ' + _ii('mp-summary') + '</span>';
    h +=     '<span class="gtb-ic-panel-btns"><button class="sv-icon-btn mp-gex-btn" data-name="' + name + '" title="Expand"><i class="bi bi-fullscreen"></i></button></span>';
    h +=   '</div>';
    h +=   '<div class="gtb-ic-panel-body" id="dv-mpgex-body-' + tid + sfx + '" style="padding:4px;">';
    h +=     '<div style="font-size:0.44rem;color:var(--gtb-muted);">Loading after OI fetch…</div>';
    h +=   '</div>';
    h += '</div>';

    h += '</div>'; // end right col
    h += '</div>'; // end .gtb-dv-body-row
    h += '</div>'; // end .gtb-dv-col

    // Replace existing column or append
    var $existing = jQ('#gtb-dv-col-' + tid);
    if ($existing.length) {
        $existing.replaceWith(h);
    } else {
        jQ('#fsig-multi-row').append(h);
    }

    // ── Only 9:15 from localStorage is reliable before any fetch ─────────────
    _dvSet915(name, tid, sfx);

    // ── All other panels require live data — fetch then render ────────────────
    _dvFetchAndRender(name, tid, sfx, isMcx);
}

// ── Creates (or brings to front) the Instrument Detail View popup ─────────────
// Returns true if the popup was newly created, false if it was already open.
function _gtbCreateInstrDetailPopup() {
    var popId  = 'pop-up-window-gtb-instr-detail';
    var popCls = 'popup-custom-style-gtb-instr-detail';

    var $existing = jQ('#' + popId);
    if ($existing.length) {
        if ($existing.is(':visible')) { try { $existing.PopupWindow('show'); } catch(ex) {} return false; }
        try { $existing.PopupWindow('destroy'); } catch(ex) {}
        $existing.remove();
    }

    var builtIn  = (typeof _allInstruments !== 'undefined') ? _allInstruments.map(function(i){ return i.name; }) : [];
    var extras   = ['INFY', 'TCS', 'WIPRO', 'SBIN', 'AXISBANK', 'KOTAKBANK'];
    var allPicks = builtIn.concat(extras.filter(function(n){ return builtIn.indexOf(n) === -1; }));

    var body = '<div class="fsig-wrap">'
        + '<div class="fsig-topbar">'
        + '<div class="fsig-chip-search" id="fsig-chip-search">'
        + '<i class="bi bi-search" style="color:var(--gtb-muted);font-size:0.55rem;flex-shrink:0;margin-right:4px;"></i>'
        + '<div class="fsig-chip-box" id="fsig-chip-box">'
        + '<input id="fsig-input" type="text" placeholder="Search symbols…" autocomplete="off"/>'
        + '</div>'
        + '<button id="fsig-go" class="fsig-add-btn"><i class="bi bi-plus-circle"></i> Add</button>'
        + '</div>'
        + '<div id="fsig-ac-drop" class="fsig-ac-drop"></div>'
        + '<div class="fsig-picks-row">'
        + allPicks.map(function(p) { return '<button class="fsig-pick" data-name="' + p + '">' + p + '</button>'; }).join('')
        + '</div>'
        + '<button id="fsig-load-selected" class="fsig-load-sel-btn" title="Load all selected"><i class="bi bi-layers-fill"></i> Load Selected (<span id="fsig-sel-count">0</span>)</button>'
        + '<button id="fsig-clear-all" class="fsig-clear-btn" title="Clear all"><i class="bi bi-trash3"></i></button>'
        + '</div>'
        + '<div id="fsig-multi-row" class="fsig-multi-row"></div>'
        + '</div>';

    var winW = window.innerWidth  || document.documentElement.clientWidth;
    var winH = window.innerHeight || document.documentElement.clientHeight;
    var pw = Math.min(winW - 40, 1400);
    var ph = Math.min(winH - 60, 860);

    showPopUpWindow('gtb-instr-detail', body, 'Instrument Detail View', pw, ph);

    var isLight = jQ('#main-trade-bot-container').hasClass('gtb-light')
               || (localStorage.getItem('GTB_THEME') || 'dark') === 'light';
    jQ('.' + popCls).toggleClass('gtb-light', isLight);

    var titleHtml = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<i class="bi bi-layers-fill" style="color:#00b4d8;font-size:0.7rem;"></i>'
        + '<span style="font-weight:800;font-size:0.7rem;">INSTRUMENT DETAIL VIEW</span>'
        + popupWinControls(popCls)
        + '</div>';
    jQ('.' + popCls).find('.popupwindow_titlebar_text').html(titleHtml);
    hideNativePopupButtons(popCls);

    jQ('.' + popCls).find('.popupwindow_content').css({ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' });
    jQ('.' + popCls).find('.popupwindow_content').on('mousedown', function(e) { e.stopPropagation(); });
    jQ('.' + popCls).find('.gtb-win-controls').on('mousedown', function(e) { e.stopPropagation(); });

    return true;
}

jQ(document).on('click', '#show-futures-signal', function (e) {
    e.preventDefault();
    _gtbCreateInstrDetailPopup();
});

// ── Multi-select autocomplete for instrument detail search ────────────────────
// Builds the full list once: _allInstruments names + OPTION_STRIKE_LIST + INSTRUMENT_TOKENS keys
function _fsigAllNames() {
    var seen = {}, list = [];
    function add(n) { n = (n || '').trim().toUpperCase(); if (n && !seen[n]) { seen[n] = 1; list.push(n); } }
    if (typeof _allInstruments !== 'undefined') _allInstruments.forEach(function(i) { add(i.name); });
    if (typeof OPTION_STRIKE_LIST !== 'undefined') OPTION_STRIKE_LIST.forEach(function(r) { add(r.name); });
    if (typeof INSTRUMENT_TOKENS !== 'undefined') Object.keys(INSTRUMENT_TOKENS).forEach(add);
    return list.sort();
}

function _fsigAddChip(name) {
    name = (name || '').trim().toUpperCase();
    if (!name) return;
    // Prevent duplicate chips
    if (jQ('#fsig-chip-box .fsig-chip[data-name="' + name + '"]').length) return;
    var chip = jQ('<span class="fsig-chip" data-name="' + name + '">'
        + name + '<i class="bi bi-x fsig-chip-x"></i></span>');
    jQ('#fsig-input').before(chip);
    jQ('#fsig-input').val('').attr('placeholder', '');
    _fsigHideDrop();
}

function _fsigHideDrop() { jQ('#fsig-ac-drop').empty().hide(); }

function _fsigShowDrop(items) {
    var $drop = jQ('#fsig-ac-drop');
    if (!items.length) { _fsigHideDrop(); return; }
    $drop.empty();
    items.slice(0, 12).forEach(function(n) {
        $drop.append('<div class="fsig-ac-item" data-name="' + n + '">' + n + '</div>');
    });
    // Position below the chip-search bar
    var rect = document.getElementById('fsig-chip-search').getBoundingClientRect();
    var popRect = jQ('.popup-custom-style-gtb-instr-detail .popupwindow_content')[0].getBoundingClientRect();
    $drop.css({ top: (rect.bottom - popRect.top) + 'px', left: (rect.left - popRect.left) + 'px', width: rect.width + 'px' }).show();
}

jQ(document).on('input', '#fsig-input', function () {
    var q = jQ(this).val().trim().toUpperCase();
    if (!q) { _fsigHideDrop(); return; }
    var matches = _fsigAllNames().filter(function(n) { return n.indexOf(q) !== -1; });
    _fsigShowDrop(matches);
});

jQ(document).on('keydown', '#fsig-input', function (e) {
    if (e.key === 'Enter') {
        var $first = jQ('#fsig-ac-drop .fsig-ac-item:first');
        var name = $first.length ? $first.data('name') : jQ(this).val().trim().toUpperCase();
        _fsigAddChip(name);
    } else if (e.key === 'Escape') {
        _fsigHideDrop();
    } else if (e.key === 'Backspace' && !jQ(this).val()) {
        jQ('#fsig-chip-box .fsig-chip').last().remove();
        if (!jQ('#fsig-chip-box .fsig-chip').length) jQ('#fsig-input').attr('placeholder', 'Search symbols…');
    }
});

jQ(document).on('click', '.fsig-ac-item', function () {
    _fsigAddChip(jQ(this).data('name'));
    jQ('#fsig-input').focus();
});

jQ(document).on('click', '.fsig-chip-x', function (e) {
    e.stopPropagation();
    jQ(this).closest('.fsig-chip').remove();
    if (!jQ('#fsig-chip-box .fsig-chip').length) jQ('#fsig-input').attr('placeholder', 'Search symbols…');
});

// Clicking anywhere inside the chip box focuses the input
jQ(document).on('click', '#fsig-chip-box', function (e) {
    if (!jQ(e.target).hasClass('fsig-chip-x')) jQ('#fsig-input').focus();
});

// Hide dropdown when clicking outside
jQ(document).on('click', function (e) {
    if (!jQ(e.target).closest('#fsig-chip-search, #fsig-ac-drop').length) _fsigHideDrop();
});

jQ(document).on('click', '#fsig-go', function () {
    var chips = jQ('#fsig-chip-box .fsig-chip').map(function() { return jQ(this).data('name'); }).get();
    // If no chips, try raw input value
    if (!chips.length) {
        var raw = jQ('#fsig-input').val().trim().toUpperCase();
        if (raw) chips = [raw];
    }
    if (!chips.length) return;
    chips.forEach(function(n) { _gtbLoadInstrDetailPanel(n); });
    jQ('#fsig-chip-box .fsig-chip').remove();
    jQ('#fsig-input').val('').attr('placeholder', 'Search symbols…');
    _fsigHideDrop();
});
jQ(document).on('click', '.fsig-pick', function () {
    var $btn = jQ(this);
    $btn.toggleClass('fsig-pick-selected');
    var count = jQ('.fsig-pick-selected').length;
    jQ('#fsig-sel-count').text(count);
    jQ('#fsig-load-selected').toggleClass('fsig-load-sel-visible', count > 0);
});
jQ(document).on('click', '#fsig-load-selected', function () {
    var names = jQ('.fsig-pick-selected').map(function() { return jQ(this).data('name'); }).get();
    names.forEach(function(n) { _gtbLoadInstrDetailPanel(n); });
    // Deselect all after loading
    jQ('.fsig-pick-selected').removeClass('fsig-pick-selected');
    jQ('#fsig-sel-count').text(0);
    jQ('#fsig-load-selected').removeClass('fsig-load-sel-visible');
});
jQ(document).on('click', '#fsig-clear-all', function () {
    jQ('#fsig-multi-row').empty();
});
jQ(document).on('click', '.gtb-dv-panel-refresh', function () {
    _gtbLoadInstrDetailPanel(jQ(this).data('name'));
});
jQ(document).on('click', '.gtb-dv-panel-close', function () {
    jQ('#gtb-dv-col-' + jQ(this).data('name').replace(/ /g,'-').replace(/&/g,'-')).remove();
});
// Keep old single-instrument refresh wiring (used by overview maximize buttons)
jQ(document).on('click', '.gtb-dv-refresh', function () {
    _gtbLoadInstrDetail(jQ(this).data('name'));
});

// Open (or reuse) the Instrument Detail View popup for a specific instrument.
// Called from Analysis / Opportunities "Analyze" buttons so everything funnels into one popup.
function _gtbOpenInstrDetailFor(name) {
    // _gtbCreateInstrDetailPopup works even when the main dashboard isn't in DOM
    // (e.g. on the Kite chart page) — no need for #show-futures-signal to exist.
    _gtbCreateInstrDetailPopup();

    // Give the popup a tick to render, then load/refresh the instrument column
    setTimeout(function() {
        _gtbLoadInstrDetailPanel(name);
        setTimeout(function() {
            var col = document.getElementById('gtb-dv-col-' + name.replace(/ /g,'-').replace(/&/g,'-'));
            if (col) col.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' });
        }, 80);
    }, 60);
}

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

    score.max_pain = _gtbMaxPainScore(name);
    score.iv_skew  = _gtbIVSkewScore(name);
    score.total = score.nine_fifteen + score.current_trend + score.futures_trend + score.oi_obv + score.max_pain + score.iv_skew;
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

// Max Pain gravity: +1 when Max Pain is above spot (bullish pull), -1 when below.
// At pin (distance < 0.3%) returns 0 — no directional pull when already at Max Pain.
function _gtbMaxPainScore(name) {
    try {
        var d = _gtbComputeMaxPainGEX(name);
        if (!d) return 0;
        if (Math.abs(d.maxPainPct) < 0.3) return 0;
        return d.maxPainDist > 0 ? 1 : -1;
    } catch(e) { return 0; }
}

// IV Skew score: >2% put skew = bearish pressure (-1), >2% call skew = bullish (+1).
function _gtbIVSkewScore(name) {
    try {
        var sm = INSTRUMENT_SCORE_MAP[name];
        if (!sm || !sm.oiExtras) return 0;
        var iv = sm.oiExtras.ivSkew;
        if (iv === null || iv === undefined) return 0;
        if (iv > 2) return -1;
        if (iv < -2) return 1;
        return 0;
    } catch(e) { return 0; }
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
    try { _gtbRenderOIMatrix('CRUDEOILM'); } catch(e) {}
    try { _gtbRenderOIMatrix('USDINR'); } catch(e) {}
    try { _gtbUpdateWeightBars('NIFTY 50'); } catch(e) {}
    try { _gtbUpdateWeightBars('NIFTY BANK'); } catch(e) {}
    try { _gtbUpdateWeightBars('RELIANCE'); } catch(e) {}
    try { _gtbUpdateWeightBars('HDFCBANK'); } catch(e) {}
    try { _gtbUpdateWeightBars('ICICIBANK'); } catch(e) {}
    try { _gtbUpdateWeightBars('CRUDEOILM'); } catch(e) {}
    try { _gtbUpdateWeightBars('USDINR'); } catch(e) {}
    try { _gtbRefreshMPCards(); } catch(e) {}
    try { _gtbRefreshGEXChips(); } catch(e) {}
    try { _gtbRefreshAVWAPChips(); } catch(e) {}
    try { _gtbRenderNowTrade(); } catch(e) {}
    try { _gtbRefreshProbCards(); } catch(e) {}

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

    NIFTY_50_MAX_PAIN_SCORE   = _gtbMaxPainScore('NIFTY 50');
    NIFTY_BANK_MAX_PAIN_SCORE = _gtbMaxPainScore('NIFTY BANK');
    RELIANCE_MAX_PAIN_SCORE   = _gtbMaxPainScore('RELIANCE');
    HDFCBANK_MAX_PAIN_SCORE   = _gtbMaxPainScore('HDFCBANK');
    ICICIBANK_MAX_PAIN_SCORE  = _gtbMaxPainScore('ICICIBANK');
    NIFTY_50_IV_SKEW_SCORE    = _gtbIVSkewScore('NIFTY 50');
    NIFTY_BANK_IV_SKEW_SCORE  = _gtbIVSkewScore('NIFTY BANK');
    RELIANCE_IV_SKEW_SCORE    = _gtbIVSkewScore('RELIANCE');
    HDFCBANK_IV_SKEW_SCORE    = _gtbIVSkewScore('HDFCBANK');
    ICICIBANK_IV_SKEW_SCORE   = _gtbIVSkewScore('ICICIBANK');
    try { if (jQ('#gtb-pane-metrics').is(':visible')) _gtbRenderMetricsPane(); } catch(e) {}

    var _includeLagging = localStorage.getItem('GTB_INCLUDE_LAGGING') !== '0';

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
        (_includeLagging ? (
            NIFTY_50_OI_OBV_SCORE +
            NIFTY_BANK_OI_OBV_SCORE +
            RELIANCE_OI_OBV_SCORE +
            HDFCBANK_OI_OBV_SCORE +
            ICICIBANK_OI_OBV_SCORE +
            NIFTY_50_MAX_PAIN_SCORE +
            NIFTY_BANK_MAX_PAIN_SCORE +
            RELIANCE_MAX_PAIN_SCORE +
            HDFCBANK_MAX_PAIN_SCORE +
            ICICIBANK_MAX_PAIN_SCORE +
            NIFTY_50_IV_SKEW_SCORE +
            NIFTY_BANK_IV_SKEW_SCORE +
            RELIANCE_IV_SKEW_SCORE +
            HDFCBANK_IV_SKEW_SCORE +
            ICICIBANK_IV_SKEW_SCORE +
            NIFTY_50_COMPONENT_SCORE +
            NIFTY_BANK_COMPONENT_SCORE
        ) : 0);

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
    signalHtml += '<span title="9:15 opening candle pattern" style="font-size:0.65rem;font-weight:700;padding:2px 7px;border-radius:10px;background:' + outcAccent + '22;color:' + outcAccent + ';border:1px solid ' + outcAccent + '55;">'
                + '<span style="font-size:0.55rem;font-weight:600;opacity:0.7;">9:15 </span>' + outc + '</span>'
    signalHtml += '</div>'

    // Row 2: reason text
    signalHtml += '<div style="font-size:0.62rem;color:var(--gtb-muted);line-height:1.4;margin-bottom:6px;">' + marketSignal.reason + '</div>'

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
        // Populate 915-detail in card panels for SENSEX and GIFT NIFTY
        function _setDetail(name, val) {
            if (!val) return;
            var isBull = (val === 'ASO' || val === 'AST');
            var isBear = (val === 'BSO' || val === 'BST');
            var cls = isBull ? 'gtb-915-bull' : isBear ? 'gtb-915-bear' : 'gtb-915-neutral';
            var tid = name.replace(/ /g, '-').replace(/&/g, '-');
            jQ('#' + tid + '-915-detail').html('<span class="' + cls + '" style="font-weight:700;">' + val + '</span>');
        }
        _setDetail('SENSEX', sx);
        _setDetail('GIFT NIFTY', gn);
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
// Maps REMARK key → compact readable chip shown in the identity strip.
// Kept in sync with getFuturesTrendScore so chip colour always matches the score direction.
function _gtbRemarkChip(remark) {
    var map = {
        'LONG':                         { label: 'Long Buildup',       bull: true  },
        'SHORT':                        { label: 'Short Buildup',      bull: false },
        'SHOT_COVERING':                { label: 'Short Covering',     bull: true  },
        'LONG_UNWINDING':               { label: 'Long Unwinding',     bull: false },
        'BEARS_COMING_SELL_ON_RISE':    { label: 'Sell on Rise',       bull: false },
        'GAMBLING_BUY_NEWS_AND_EVENTS': { label: 'Gambling',           bull: false },
        'CAUTION_WRITES_ERODING_PREMIUM':{ label: 'Caution',           bull: false },
        'BULLS_CONSOLIDATING':          { label: 'Bulls Consolidating',bull: true  },
        'BEARS_CONSOLIDATING':          { label: 'Bears Consolidating',bull: false },
        'DEFENCE_BUY_ON_DECLINE':       { label: 'Buy on Decline',     bull: true  },
    };
    var entry = map[remark];
    if (!entry) return '';
    var color = entry.bull ? 'var(--gtb-green)' : 'var(--gtb-red)';
    var bg    = entry.bull ? 'var(--gtb-green-dim,#0d3320)' : 'var(--gtb-red-dim,#3d0d0d)';
    return '<span style="font-size:0.48rem;font-weight:700;padding:1px 5px;border-radius:3px;'
         + 'border:1px solid ' + color + ';background:' + bg + ';color:' + color + ';white-space:nowrap;">'
         + entry.label + '</span>';
}

// Secondary badge: VWAP price direction, dimmed when it agrees with REMARK, amber when it conflicts.
function _gtbVwapChip(trendHtml, remark) {
    if (!trendHtml) return '';
    // Extract label text from the badge HTML (strips tags)
    var label = trendHtml.replace(/<[^>]+>/g, '').trim();
    if (!label) return '';

    // Determine VWAP direction from label text
    var vwapBull = /strong buy|buy/i.test(label) && !/sell/i.test(label);
    var vwapBear = /sell/i.test(label);

    // OI REMARK direction
    var remarkScore = (typeof getFuturesTrendScore === 'function') ? getFuturesTrendScore(remark) : 0;
    var remarkBull  = remarkScore > 0;
    var remarkBear  = remarkScore < 0;

    // Conflict: VWAP and REMARK point opposite directions
    var conflict = (vwapBull && remarkBear) || (vwapBear && remarkBull);

    var color, bg;
    if (conflict) {
        color = 'var(--gtb-amber, #f59e0b)';
        bg    = 'var(--gtb-amber-dim, #2d1f00)';
    } else if (vwapBull) {
        color = 'var(--gtb-green)';
        bg    = 'var(--gtb-green-dim, #0d3320)';
    } else if (vwapBear) {
        color = 'var(--gtb-red)';
        bg    = 'var(--gtb-red-dim, #3d0d0d)';
    } else {
        color = 'var(--gtb-muted)';
        bg    = 'transparent';
    }

    var icon = conflict ? '⚠ ' : '';
    return '<span style="font-size:0.44rem;font-weight:600;padding:1px 4px;border-radius:3px;margin-left:3px;'
         + 'border:1px solid ' + color + ';background:' + bg + ';color:' + color + ';white-space:nowrap;opacity:0.85;"'
         + (conflict ? ' title="VWAP and OI signals conflict"' : '')
         + '>' + icon + 'VWAP: ' + label + '</span>';
}

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
    // Identity chip: OI REMARK (primary) + VWAP direction (secondary).
    // When they agree the VWAP badge is green/red; when they conflict it flags the mismatch visually.
    var _remarkHtml = _gtbRemarkChip(data['REMARK']);
    var _vwapHtml   = _gtbVwapChip(data['trend'], data['REMARK']);
    jQ("#" + tempName + "-futures-trend" + suffix).html(_remarkHtml + _vwapHtml);

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

// Settings — open as draggable popup window
function _gtbSettingsHtml() {
    var _bs = 'font-size:0.44rem;padding:1px 5px;background:transparent;border:1px solid #444;color:#7d8590;cursor:pointer;border-radius:3px;';
    var s = '<div class="gtb-settings-popup">';

    // Checkboxes
    s += '<div class="gtb-sp-section">';
    s += '<label class="gtb-sp-row"><input type="checkbox" id="enable-auto-refresh"> Auto-refresh</label>';
    s += '<label class="gtb-sp-row" title="Scan only weighted Nifty 50 + Bank Nifty stocks">'
       + '<input type="checkbox" id="scan-weighted-only"' + (localStorage.getItem('GTB_SCAN_WEIGHTED') === '1' ? ' checked' : '') + '> Weighted only</label>';
    s += '<div class="gtb-sp-row"><a id="data-load" class="gtb-ctrl-link" style="font-size:0.62rem;"><i class="bi bi-sliders"></i> Data settings</a></div>';
    s += '</div>';

    // Score components
    s += '<div class="gtb-sp-section">';
    s += '<div class="gtb-sp-hdr">SCORE COMPONENTS</div>';
    s += '<label class="gtb-sp-row" title="OI/OBV, Max Pain, IV Skew and Component scores — computed from previous candle batch, can lag by minutes">'
       + '<input type="checkbox" id="gtb-include-lagging"' + (localStorage.getItem('GTB_INCLUDE_LAGGING') !== '0' ? ' checked' : '') + '> Include lagging (OI/MaxPain/IVSkew/Components)</label>';
    s += '</div>';

    // Theme
    var _t = localStorage.getItem('GTB_THEME') || 'dark';
    s += '<div class="gtb-sp-section">';
    s += '<div class="gtb-sp-hdr">THEME</div>';
    s += '<div style="display:flex;gap:4px;">';
    s += '<button class="gtb-theme-btn" data-theme="dark" style="flex:1;padding:3px 0;font-size:0.6rem;border:1px solid #30363d;cursor:pointer;background:' + (_t==='dark'?'#00b4d8':'transparent') + ';color:' + (_t==='dark'?'#fff':'#7d8590') + ';"><i class="bi bi-moon-stars-fill"></i> Dark</button>';
    s += '<button class="gtb-theme-btn" data-theme="light" style="flex:1;padding:3px 0;font-size:0.6rem;border:1px solid #30363d;cursor:pointer;background:' + (_t==='light'?'#00b4d8':'transparent') + ';color:' + (_t==='light'?'#fff':'#7d8590') + ';"><i class="bi bi-sun-fill"></i> Light</button>';
    s += '</div></div>';

    // Sliders
    var _rh = parseInt(localStorage.getItem('GTB_ROW_H') || '190');
    var _cw = parseInt(localStorage.getItem('GTB_CARD_W') || '300');
    var _bw = parseInt(localStorage.getItem('GTB_OI_BAR_W') || '60');
    s += '<div class="gtb-sp-section">';
    s += '<div class="gtb-sp-hdr">DISPLAY</div>';
    s += '<div class="gtb-sp-slider-row"><span>Chart Height</span><input type="range" id="gtb-grid-h-slider" min="120" max="320" step="10" value="' + _rh + '"><span id="gtb-grid-h-val">' + _rh + '</span>px</div>';
    s += '<div class="gtb-sp-slider-row"><span>Card Width</span><input type="range" id="gtb-card-w-slider" min="220" max="520" step="10" value="' + _cw + '"><span id="gtb-card-w-val">' + _cw + '</span>px</div>';
    s += '<div class="gtb-sp-slider-row"><span>OI Bar W</span><input type="range" id="gtb-oi-bar-slider" min="20" max="100" step="5" value="' + _bw + '"><span id="gtb-oi-bar-val">' + _bw + '</span>%</div>';
    s += '</div>';

    // Columns
    s += '<div class="gtb-sp-section">';
    s += '<div class="gtb-sp-hdr">PANELS <button id="gtb-cols-reset" style="' + _bs + 'margin-left:6px;">Reset</button></div>';
    s += '<div id="gtb-cols-cfg-list">' + _gtbColsCfgHtml() + '</div>';
    s += '</div>';

    // Instruments
    s += '<div class="gtb-sp-section">';
    s += '<div class="gtb-sp-hdr">INSTRUMENTS <button id="gtb-instrs-reset" style="' + _bs + 'margin-left:6px;">Reset</button></div>';
    s += '<div id="gtb-instrs-cfg-list">' + _gtbInstrsCfgHtml(null) + '</div>';
    s += '</div>';

    // Last refresh
    s += '<div class="gtb-sp-section" style="border-bottom:none;">';
    s += '<span id="last-refresh-time" style="font-size:0.52rem;color:#7d8590;">—</span>';
    s += '</div>';

    s += '</div>';
    return s;
}

jQ(document).on('change', '#gtb-include-lagging', function() {
    localStorage.setItem('GTB_INCLUDE_LAGGING', this.checked ? '1' : '0');
    try { setScore(); } catch(e) {}
});

jQ(document).on("click", "#gtb-settings-toggle", function(e) {
    e.stopPropagation();
    var popId = 'pop-up-window-gtb-settings';
    var $pop = jQ('#' + popId);
    if ($pop.length) {
        // Popup exists — if visible bring to front, if hidden show it
        if ($pop.is(':visible')) {
            try { $pop.PopupWindow('show'); } catch(ex) {}
            return;
        }
        // Was closed — remove and recreate so content/state is fresh
        try { $pop.PopupWindow('destroy'); } catch(ex) {}
        $pop.remove();
    }
    showPopUpWindow('gtb-settings', _gtbSettingsHtml(), 'Settings', 260, 520);
    var cls = 'popup-custom-style-gtb-settings';
    jQ('.' + cls).addClass((localStorage.getItem('GTB_THEME') || 'dark') === 'light' ? 'gtb-light' : '');
    var titleHtml = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<i class="bi bi-gear-fill" style="color:#00b4d8;font-size:0.7rem;"></i>'
        + '<span style="font-weight:800;font-size:0.7rem;">SETTINGS</span>'
        + popupWinControls(cls)
        + '</div>';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html(titleHtml);
    hideNativePopupButtons(cls);
});


// ── Theme toggle (dark / light) ──────────────────────────────────────────────
function _gtbApplyTheme(theme) {
    // Apply theme to all popups, overlays and containers that use --gtb-* vars
    // but live outside #main-trade-bot-container (so they don't inherit it automatically).
    var container = jQ('#main-trade-bot-container, #groot-maximize-overlay, [class*="popup-custom-style-"]');
    if (theme === 'light') container.addClass('gtb-light');
    else                    container.removeClass('gtb-light');
    // Sync floating bar theme
    jQ('#gtb-float-bar').toggleClass('gtb-light', theme === 'light');
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
    var light = jQ('#main-trade-bot-container').hasClass('gtb-light')
             || (localStorage.getItem('GTB_THEME') || 'dark') === 'light';
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
                layout: { background: { color: 'transparent' }, textColor: c.text },
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
    setTimeout(function() {
        jQ('#gtb-rows .gtb-row-chart').each(function() {
            if (this._lwChart) { try { this._lwChart.resize(this.clientWidth || 10, this.clientHeight || 10); } catch (e) {} }
        });
    }, 30);
}
jQ(document).on('input', '#gtb-grid-h-slider', function() {
    _gtbApplyGridH(parseInt(jQ(this).val()));
});

// ── Column / Instrument layout config ────────────────────────────────────────

var GTB_DEFAULT_COLS = [
    { key: 'id',       label: 'Instrument',        canHide: false },
    { key: 'chart',    label: 'Price Action',       canHide: true  },
    { key: 'oiobv',   label: 'OI / OBV',           canHide: true  },
    { key: '915',      label: '9:15 Breakout',      canHide: true  },
    { key: 'prob',     label: 'Trend Probability',  canHide: true  },
    { key: 'fut',      label: 'Futures',            canHide: true  },
    { key: 'oimatrix', label: 'OI Matrix',          canHide: true  },
    { key: 'weights',  label: 'Weightage',          canHide: true  },
    { key: 'detail',   label: 'Details',            canHide: true  },
];

function _gtbGetColsCfg() {
    try {
        var saved = JSON.parse(localStorage.getItem('GTB_COLS_CFG') || 'null');
        if (saved && saved.length) {
            var keys = saved.map(function(c){ return c.key; });
            GTB_DEFAULT_COLS.forEach(function(d) {
                if (keys.indexOf(d.key) === -1) saved.push({ key: d.key, label: d.label, canHide: d.canHide, visible: true });
            });
            return saved;
        }
    } catch(e) {}
    return GTB_DEFAULT_COLS.map(function(c){ return { key: c.key, label: c.label, canHide: c.canHide, visible: true }; });
}
function _gtbSaveColsCfg(arr) { localStorage.setItem('GTB_COLS_CFG', JSON.stringify(arr)); }

function _gtbApplyColsCfg() {
    var cfg = _gtbGetColsCfg();
    // Identity panel always pinned to top (order -1)
    jQ('.gtb-ic-panel[data-col="id"]').each(function() { this.style.order = -1; });
    cfg.forEach(function(col, i) {
        // old horizontal layout: order + visibility on gtb-ic-col
        jQ('.gtb-ic-col[data-col="' + col.key + '"]').each(function() {
            this.style.order = i;
            this.classList.toggle('gtb-col-hidden', !col.visible);
        });
        // new panel layout: order + visibility on gtb-ic-panel
        // panels sit in a flex-column card, so CSS order resequences them vertically
        jQ('.gtb-ic-panel[data-col="' + col.key + '"]').each(function() {
            this.style.order = i;
            this.classList.toggle('gtb-col-hidden', !col.visible);
        });
    });
}

function _gtbColsCfgHtml() {
    var cfg = _gtbGetColsCfg();
    var _bs = 'font-size:0.44rem;padding:1px 4px;background:transparent;border:1px solid #444;color:#7d8590;cursor:pointer;border-radius:3px;line-height:1.4;';
    var h2 = '';
    cfg.forEach(function(col, i) {
        h2 += '<div class="gtb-cfg-row" style="display:flex;align-items:center;gap:3px;margin-bottom:2px;">';
        if (col.canHide) {
            h2 += '<button class="gtb-col-vis" data-col="' + col.key + '" style="' + _bs + 'color:' + (col.visible ? '#00b4d8' : '#555') + ';" title="Show/Hide"><i class="bi bi-eye' + (col.visible ? '-fill' : '-slash') + '"></i></button>';
        } else {
            h2 += '<span style="width:22px;flex-shrink:0;"></span>';
        }
        h2 += '<span style="flex:1;font-size:0.46rem;color:' + (col.visible ? '#c9d1d9' : '#555') + ';">' + col.label + '</span>';
        h2 += '<button class="gtb-col-up" data-col="' + col.key + '" ' + (i === 0 ? 'disabled' : '') + ' style="' + _bs + '"><i class="bi bi-chevron-up"></i></button>';
        h2 += '<button class="gtb-col-dn" data-col="' + col.key + '" ' + (i === cfg.length - 1 ? 'disabled' : '') + ' style="' + _bs + '"><i class="bi bi-chevron-down"></i></button>';
        h2 += '</div>';
    });
    return h2;
}

var GTB_DEFAULT_INSTRS = ['GIFT NIFTY','NIFTY 50','NIFTY BANK','SENSEX','CRUDEOILM','USDINR','RELIANCE','HDFCBANK','ICICIBANK'];

function _gtbGetInstrsCfg(defaults) {
    var def = defaults || GTB_DEFAULT_INSTRS;
    try {
        var saved = JSON.parse(localStorage.getItem('GTB_INSTRS_CFG') || 'null');
        if (saved && saved.length) {
            var names = saved.map(function(c){ return c.name; });
            def.forEach(function(n) { if (names.indexOf(n) === -1) saved.push({ name: n, visible: true }); });
            return saved;
        }
    } catch(e) {}
    return def.map(function(n){ return { name: n, visible: true }; });
}
function _gtbSaveInstrsCfg(arr) { localStorage.setItem('GTB_INSTRS_CFG', JSON.stringify(arr)); }

function _gtbApplyInstrsCfg() {
    var cfg = _gtbGetInstrsCfg();
    cfg.forEach(function(instr, i) {
        jQ('.gtb-instr-card[data-instr="' + instr.name + '"]').each(function() {
            this.style.order = i;
            this.classList.toggle('gtb-instr-hidden', !instr.visible);
        });
    });
}

function _gtbInstrsCfgHtml(defaults) {
    var cfg = _gtbGetInstrsCfg(defaults);
    var _bs = 'font-size:0.44rem;padding:1px 4px;background:transparent;border:1px solid #444;color:#7d8590;cursor:pointer;border-radius:3px;line-height:1.4;';
    var h2 = '';
    cfg.forEach(function(instr, i) {
        var shortName = instr.name.length > 12 ? instr.name.substring(0, 11) + '.' : instr.name;
        h2 += '<div class="gtb-cfg-row" style="display:flex;align-items:center;gap:3px;margin-bottom:2px;">';
        h2 += '<button class="gtb-instr-vis" data-instr="' + instr.name + '" style="' + _bs + 'color:' + (instr.visible ? '#00b4d8' : '#555') + ';" title="Show/Hide"><i class="bi bi-eye' + (instr.visible ? '-fill' : '-slash') + '"></i></button>';
        h2 += '<span style="flex:1;font-size:0.46rem;color:' + (instr.visible ? '#c9d1d9' : '#555') + ';">' + shortName + '</span>';
        h2 += '<button class="gtb-instr-up" data-instr="' + instr.name + '" ' + (i === 0 ? 'disabled' : '') + ' style="' + _bs + '"><i class="bi bi-chevron-up"></i></button>';
        h2 += '<button class="gtb-instr-dn" data-instr="' + instr.name + '" ' + (i === cfg.length - 1 ? 'disabled' : '') + ' style="' + _bs + '"><i class="bi bi-chevron-down"></i></button>';
        h2 += '</div>';
    });
    return h2;
}

// Shared move helper
function _gtbMoveInArr(arr, keyFn, key, dir) {
    var idx = arr.findIndex ? arr.findIndex(function(x){ return keyFn(x) === key; })
                            : (function(){ for (var i=0;i<arr.length;i++) if (keyFn(arr[i])===key) return i; return -1; })();
    if (idx < 0) return arr;
    var nIdx = idx + dir;
    if (nIdx < 0 || nIdx >= arr.length) return arr;
    var tmp = arr[idx]; arr[idx] = arr[nIdx]; arr[nIdx] = tmp;
    return arr;
}

// Delegated event handlers for col/instr settings
// stopPropagation on all: prevents the document-level close handler from
// running on a detached element (which happens because html() re-renders the list).
jQ(document).on('click', '.gtb-col-vis', function(e) {
    e.stopPropagation();
    var key = jQ(this).data('col'), cfg = _gtbGetColsCfg();
    var col = cfg.find ? cfg.find(function(c){ return c.key === key; })
                       : (function(){ for(var i=0;i<cfg.length;i++) if(cfg[i].key===key) return cfg[i]; })();
    if (col && col.canHide) { col.visible = !col.visible; _gtbSaveColsCfg(cfg); _gtbApplyColsCfg(); jQ('#gtb-cols-cfg-list').html(_gtbColsCfgHtml()); }
});
jQ(document).on('click', '.gtb-col-up', function(e) {
    e.stopPropagation();
    var key = jQ(this).data('col'), cfg = _gtbGetColsCfg();
    _gtbMoveInArr(cfg, function(c){ return c.key; }, key, -1);
    _gtbSaveColsCfg(cfg); _gtbApplyColsCfg(); jQ('#gtb-cols-cfg-list').html(_gtbColsCfgHtml());
});
jQ(document).on('click', '.gtb-col-dn', function(e) {
    e.stopPropagation();
    var key = jQ(this).data('col'), cfg = _gtbGetColsCfg();
    _gtbMoveInArr(cfg, function(c){ return c.key; }, key, 1);
    _gtbSaveColsCfg(cfg); _gtbApplyColsCfg(); jQ('#gtb-cols-cfg-list').html(_gtbColsCfgHtml());
});
jQ(document).on('click', '#gtb-cols-reset', function(e) {
    e.stopPropagation();
    localStorage.removeItem('GTB_COLS_CFG'); _gtbApplyColsCfg(); jQ('#gtb-cols-cfg-list').html(_gtbColsCfgHtml());
});
jQ(document).on('click', '.gtb-instr-vis', function(e) {
    e.stopPropagation();
    var name = jQ(this).data('instr'), cfg = _gtbGetInstrsCfg();
    var it = cfg.find ? cfg.find(function(c){ return c.name === name; })
                      : (function(){ for(var i=0;i<cfg.length;i++) if(cfg[i].name===name) return cfg[i]; })();
    if (it) { it.visible = !it.visible; _gtbSaveInstrsCfg(cfg); _gtbApplyInstrsCfg(); jQ('#gtb-instrs-cfg-list').html(_gtbInstrsCfgHtml()); }
});
jQ(document).on('click', '.gtb-instr-up', function(e) {
    e.stopPropagation();
    var name = jQ(this).data('instr'), cfg = _gtbGetInstrsCfg();
    _gtbMoveInArr(cfg, function(c){ return c.name; }, name, -1);
    _gtbSaveInstrsCfg(cfg); _gtbApplyInstrsCfg(); jQ('#gtb-instrs-cfg-list').html(_gtbInstrsCfgHtml());
});
jQ(document).on('click', '.gtb-instr-dn', function(e) {
    e.stopPropagation();
    var name = jQ(this).data('instr'), cfg = _gtbGetInstrsCfg();
    _gtbMoveInArr(cfg, function(c){ return c.name; }, name, 1);
    _gtbSaveInstrsCfg(cfg); _gtbApplyInstrsCfg(); jQ('#gtb-instrs-cfg-list').html(_gtbInstrsCfgHtml());
});
jQ(document).on('click', '#gtb-instrs-reset', function(e) {
    e.stopPropagation();
    localStorage.removeItem('GTB_INSTRS_CFG'); _gtbApplyInstrsCfg(); jQ('#gtb-instrs-cfg-list').html(_gtbInstrsCfgHtml());
});

// ── Card width slider (new column layout) ───────────────────────────────────
function _gtbApplyColW() {} // stub — replaced by _gtbApplyCardW
function _gtbApplyCardW(px) {
    // CSS variable drives the card width via !important rules in common.css
    var el = document.getElementById('main-trade-bot-container');
    if (el) el.style.setProperty('--gtb-card-w', px + 'px');
    jQ('#gtb-card-w-val').text(px);
    localStorage.setItem('GTB_CARD_W', px);
    // Resize LW charts after layout reflow
    setTimeout(function() {
        jQ('#gtb-rows .gtb-row-chart').each(function() {
            if (this._lwChart) { try { this._lwChart.resize(this.clientWidth, this.clientHeight); } catch(e) {} }
        });
    }, 50);
}
// Apply saved card width on init
(function() {
    var w = parseInt(localStorage.getItem('GTB_CARD_W') || '300');
    setTimeout(function() { _gtbApplyCardW(w); }, 200);
})();
jQ(document).on('input', '#gtb-card-w-slider', function(e) {
    e.stopPropagation();
    _gtbApplyCardW(parseInt(jQ(this).val()));
});

// ── OI/OBV bar width slider ─────────────────────────────────────────────────
jQ(document).on('input', '#gtb-oi-bar-slider', function() {
    var pct = parseInt(jQ(this).val());
    localStorage.setItem('GTB_OI_BAR_W', pct);
    jQ('#gtb-oi-bar-val').text(pct + '%');
    // Re-render all OI/OBV bar charts using per-instrument cached data (no API call, no stock[] read)
    var _oiNames = ['NIFTY 50','NIFTY BANK','RELIANCE','HDFCBANK','ICICIBANK','CRUDEOILM','USDINR'];
    _oiNames.forEach(function(n) {
        try {
            var _cached = INSTRUMENT_SCORE_MAP[n] && INSTRUMENT_SCORE_MAP[n].oiData;
            if (_cached) showOIOBVBarChart(n, '', _cached);
        } catch(e) {}
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
    if (cls === 'popup-custom-style-groot-trade-bot') {
        jQ('body').css('overflow', '');
        jQ('#gtb-popup-win').remove();
        return;
    }
    jQ('.' + cls).find('.popupwindow_titlebar_button_close').trigger('click');
});

jQ(document).on("click", ".popup-win-restore", function () {
    let btn   = jQ(this);
    let cls   = btn.closest('[data-popup]').data('popup');
    let popEl = jQ('.' + cls);

    // Groot main popup: toggle CSS fullscreen ↔ windowed
    if (cls === 'popup-custom-style-groot-trade-bot') {
        let $win = jQ('#gtb-popup-win');
        let isFs = $win.data('gtb-fullscreen') === true;
        _gtbApplyFullscreen(!isFs);
        jQ('#gtb-main').show();
        btn.closest('[data-popup]').find('.popup-win-minimize')
            .removeClass('is-active').find('i').removeClass('bi-chevron-up').addClass('bi-dash');
        $win.css({ 'min-height': '', overflow: '' });
        if (!isFs) {
            btn.find('i').removeClass('bi-fullscreen').addClass('bi-fullscreen-exit');
            btn.attr('title', 'Restore to window').addClass('is-active');
        } else {
            btn.find('i').removeClass('bi-fullscreen-exit').addClass('bi-fullscreen');
            btn.attr('title', 'Fullscreen').removeClass('is-active');
        }
        return;
    }

    // All other popups: use library maximize
    let isMax = popEl.data('maximized') || false;
    popEl.find('.popupwindow_titlebar_button_maximize').trigger('click');
    popEl.data('maximized', !isMax);
    if (isMax) {
        btn.find('i').removeClass('bi-fullscreen-exit').addClass('bi-fullscreen');
        btn.attr('title', 'Maximize').removeClass('is-active');
    } else {
        btn.find('i').removeClass('bi-fullscreen').addClass('bi-fullscreen-exit');
        btn.attr('title', 'Restore').addClass('is-active');
    }
    btn.closest('[data-popup]').find('.popup-win-minimize')
        .removeClass('is-active').find('i').removeClass('bi-chevron-up').addClass('bi-dash');
    popEl.find('.popupwindow_content').show();
    popEl.css({ height: '', 'min-height': '', overflow: '' });
});

jQ(document).on("click", ".popup-win-minimize", function () {
    let btn   = jQ(this);
    let cls   = btn.closest('[data-popup]').data('popup');
    let popEl = jQ('.' + cls);

    // Groot main popup: collapse to topbar strip
    if (cls === 'popup-custom-style-groot-trade-bot') {
        let $win = jQ('#gtb-popup-win');
        let main = jQ('#gtb-main');
        if (main.is(':visible')) {
            main.hide();
            btn.find('i').removeClass('bi-dash').addClass('bi-chevron-up');
            btn.attr('title', 'Restore').addClass('is-active');
            $win.css({ height: '46px', 'min-height': '0', overflow: 'hidden' });
        } else {
            main.show();
            btn.find('i').removeClass('bi-chevron-up').addClass('bi-dash');
            btn.attr('title', 'Minimize').removeClass('is-active');
            if ($win.data('gtb-fullscreen') === true) {
                _gtbApplyFullscreen(true);
            } else {
                _gtbApplyFullscreen(false);
                $win.css({ 'min-height': '', overflow: '' });
            }
        }
        return;
    }

    // All other popups: hide/show popupwindow_content
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
// Minimize — collapse to topbar-only strip (46px); restore on second click.
jQ(document).on("click", ".gtb-win-minimize", function () {
    var main = jQ('#gtb-main');
    var btn  = jQ(this);
    var $win = jQ('#gtb-popup-win');
    if (main.is(':visible')) {
        main.hide();
        btn.find('i').removeClass('bi-dash').addClass('bi-chevron-up');
        btn.attr('title', 'Restore').addClass('is-active');
        $win.css({ height: '46px', 'min-height': '0', overflow: 'hidden' });
    } else {
        main.show();
        btn.find('i').removeClass('bi-chevron-up').addClass('bi-dash');
        btn.attr('title', 'Minimize').removeClass('is-active');
        if ($win.data('gtb-fullscreen') === true) {
            _gtbApplyFullscreen(true);
        } else {
            _gtbApplyFullscreen(false);
            $win.css({ 'min-height': '', overflow: '' });
        }
    }
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
    // ── Bloomberg Market Terminal panels ──────────────────────────────────────
    'bt-tape':    { icon:'bi-broadcast',        title:'Ticker Tape',
        body:'Live scrolling strip showing the LTP and % change from the day\'s open for all 9 tracked instruments (GIFT NIFTY, NIFTY 50, NIFTY BANK, SENSEX, CRUDEOILM, USDINR, RELIANCE, HDFCBANK, ICICIBANK). Updates each time you click Refresh.' },
    'bt-heatmap': { icon:'bi-grid-3x3-gap-fill', title:'Heat Map',
        body:'3×3 grid — one tile per instrument. Background intensity encodes the composite score: <b style="color:#3fb950">green = bullish</b>, <b style="color:#f85149">red = bearish</b>. Deeper color = stronger score. Each tile shows short name, live LTP, % change from open, and composite score. Use this for an instant at-a-glance market read.' },
    'bt-relstr':  { icon:'bi-bar-chart-steps',  title:'Relative Strength',
        body:'All 9 instruments ranked by <b>% change from today\'s open</b>, best performer at top. The horizontal bar length reflects the magnitude. Use this to spot which instruments are leading or lagging the move intraday.' },
    'bt-breadth': { icon:'bi-distribute-horizontal', title:'Market Breadth',
        body:'Breadth of the F&O stock universe (NIFTY 50 + BANK NIFTY weighted constituents). Top gauge: <b style="color:#3fb950">green = above open</b>, <b style="color:#f85149">red = below open</b>. Below: how many are in ASO/BSO strike zone (computed via <code>computeInstrumentScore</code>). A strong green skew with high ASO count = broad bullish participation.' },
    'bt-vix':     { icon:'bi-activity',         title:'VIX Regime',
        body:'India VIX with a colour-coded regime label: <b style="color:#3fb950">LOW &lt;13</b> (trend days, tight spreads), <b style="color:#fbbf24">NORMAL 13–18</b>, <b style="color:#f97316">ELEVATED 18–25</b> (wider swings, use wider SL), <b style="color:#f85149">HIGH &gt;25</b> (whipsaw risk, reduce size). Gauge needle shows current VIX. VIXL/VIXU are the NIFTY 50 expected daily range limits derived from VIX.' },
    'bt-flow':    { icon:'bi-arrows-collapse',  title:'Options Flow',
        body:'For each instrument with OI data, shows the <b>net Change-OI</b> in CE and PE. <b style="color:#f85149">CE bar red</b> = CE OI is being added (put writers on the other side = bullish for CE writers, bearish for CE buyers). <b style="color:#3fb950">PE bar green</b> = PE OI is being added (premium collected = bearish for index). Interpret: heavy PE writing with light CE writing = bulls selling puts = net bullish bias.' },
    'bt-corr':    { icon:'bi-table',            title:'Correlation Matrix',
        body:'Pearson correlation (−1 to +1) between the 5-minute % returns of NIFTY 50, NIFTY BANK, GIFT NIFTY, SENSEX, RELIANCE and HDFCBANK for today. <b style="color:#3fb950">Green = positive correlation</b> (move together), <b style="color:#f85149">red = negative</b>. Darker cell = stronger relationship. Values near 1.0 for indices are normal; divergence (e.g. NIFTY strong but BANK weak) signals sector-specific moves. Click <b>Load</b> to fetch today\'s 5-min candles and compute.' },
    'bt-analyze': { icon:'bi-search',               title:'Multi-Angle Trade Analysis',
        body:'Opens a deep-dive analysis panel for one instrument covering: <b>Price Level Map</b> (visual bar showing LTP vs OPEN/VIXL/BST/BSO/ASO/AST/VIXU), <b>Signal Confluence</b> (9:15 candle, current zone, futures direction, OI/OBV — do all 4 agree?), <b>Suggested Setup</b> (CE buy / PE buy / spread / iron condor based on score and direction), <b>Entry Triggers</b> (exact price conditions before entering), <b>Risk/Reward</b> (entry zone, SL, Target 1 &amp; 2, R:R ratio, VIX-adjusted SL), <b>OI &amp; Flow</b> (net CE/PE OI, max CE/PE walls, PCR and PCR change direction), <b>Market Context</b> (F&O breadth, A/D ratio, VIX regime), and a <b>Scenario Analysis</b> table covering Bull, Base, Bear and Reversal cases with triggers, targets, probability, and recommended action.' },
    'bt-pred':    { icon:'bi-lightning-charge-fill', title:'Trend Probability',
        body:'Synthesises 5 independent signals into a single directional probability (% Bull vs % Bear): <b>Composite Score</b> (avg across 9 instruments, weight 3), <b>Relative Strength</b> (% instruments above open, weight 2), <b>Market Breadth</b> (% F&O stocks above open, weight 2), <b>Strike Zone</b> (ASO+ vs BSO- count, weight 2), <b>Options Flow</b> (net PE writing vs CE writing, weight 3). VIX acts as a confidence modifier — Low VIX amplifies the signal (×1.15), High VIX dampens it (×0.65). The half-circle gauge needle shows the resulting bull probability; the table below shows each signal\'s direction, strength bar, raw value, and the reasoning behind the vote.' },
    'bt-stats':   { icon:'bi-clipboard-data',   title:'Intraday Snapshot',
        body:'Consolidated table for all 9 instruments: <b>LTP</b>, <b>% change from open</b>, <b>composite score</b> (sum of all pillars), <b>trend zone</b> (AST/ASO/B·W/BSO/BST from <code>computeInstrumentScore</code>), and <b>9:15 candle outcome</b> from the breakout scanner. Use this as a single-glance status board.' },
    // ── Instrument Detail View panels ─────────────────────────────────────────
    'dv-chart':   { icon:'bi-bar-chart-line-fill', title:'Price Action',
        body:'Intraday candlestick (5-min) with reference lines: <b>OPEN</b> (white), <b>ASO/AST</b> (green — above-strike levels), <b>BSO/BST</b> (red — below-strike levels), <b>VIXL/VIXU</b> (blue — VIX-based daily expected range). The LTP dot moves in real time. Use the fullscreen button to expand into a large chart.' },
    'dv-oiobv':   { icon:'bi-layers-fill', title:'OI / OBV',
        body:'Two bar charts per strike: <b>top — Change-OI</b> (green = PE OI added = bullish, red = CE OI added = bearish) and <b>bottom — OBV momentum</b> (accumulation vs distribution). The ATM strike is highlighted. The signal row beneath scores each strike and the overall OI/OBV score feeds into the composite instrument score.' },
    'dv-915':     { icon:'bi-alarm', title:'9:15 Breakout',
        body:'Where the very first 9:15 candle closed relative to the strike levels: <b style="color:#3fb950">AST/ASO</b> = bullish breakout, <b style="color:#f85149">BSO/BST</b> = bearish breakdown, <b>B/W</b> = inside the range. This is fixed for the day at 9:20 and contributes ±1 to the instrument score.' },
    'dv-prob':    { icon:'bi-speedometer2', title:'Trend Probability',
        body:'A bull/bear probability gauge synthesised from 5 signals: composite score, relative strength, market breadth, strike zone bias, and options flow (CE vs PE net OI). VIX acts as a confidence multiplier — low VIX amplifies, high VIX dampens. The needle angle reflects the bull %, with the table below showing each vote.' },
    'dv-futures': { icon:'bi-graph-up-arrow', title:'Futures',
        body:'Futures positioning for this instrument: <b>Primary chip</b> = OI-based REMARK (Long Buildup / Short Buildup / Short Covering / Long Unwinding etc.) colour-coded green/red. <b>Secondary chip</b> = VWAP direction — amber with ⚠ when the two signals conflict. Also shows: VWAP, PCR, premium/discount vs spot, and 5-min OI trend.' },
    'dv-oimatrix':{ icon:'bi-table', title:'OI Matrix',
        body:'Mini option-chain centred on ATM ± 2 strikes. Each row: <b>CE ΔOI</b> | signal | strike | signal | <b>PE ΔOI</b>. Signals: <span style="color:#3fb950">Long Buildup / Short Covering</span> = bullish, <span style="color:#f85149">Short Buildup / Long Unwinding</span> = bearish. The max CE/PE OI walls (support/resistance) and PCR are shown at the bottom. Label turns "live" after data loads.' },
    'dv-weights': { icon:'bi-bar-chart-steps', title:'Weightage',
        body:'Top-6 weighted constituents for NIFTY 50 or NIFTY BANK (by index weight). The bar shows each stock\'s computed score contribution. A strongly green set means heavyweight stocks are bullish — this drives the NIFTY_50_COMPONENT_SCORE and NIFTY_BANK_COMPONENT_SCORE that feed the master gauge.' },
    'dv-detail':  { icon:'bi-info-circle-fill', title:'Details',
        body:'Raw per-instrument data: ATR-based SL and Target levels, live PCR, the individual OI/OBV score, ADX regime (trending vs ranging), and the strike levels (BST/BSO/ASO/AST) derived from today\'s open price plus the NSE strike step for this instrument.' },
    'dv-mpgex':   { icon:'bi-bar-chart-steps', title:'Max Pain & GEX',
        body:'Max Pain is the strike where total option-writer loss is minimised — spot is magnetically pulled toward it near expiry. Distance shows how far spot needs to move and in which direction. Net GEX (Gamma Exposure) tells you the market character: <b style="color:#3fb950">positive GEX = stabilising</b> (dealers fade moves, expect range), <b style="color:#f85149">negative GEX = trending</b> (dealers amplify moves, expect momentum). Flip Zones are strikes where GEX crosses zero — price accelerates through them. The Outcome chip synthesises all of this into an actionable verdict (Expiry Pin / Gradual Drift / Sharp Rally / Sharp Fall). The GEX bar chart shows green (stabilising) and red (trending) bars per strike, with the Max Pain strike marked ★ and flip zones as purple dashed lines.' },
    'now-trade':  { icon:'bi-lightning-charge-fill', title:'Now Trade',
        body:'A synthesised trade call for NIFTY 50 updated every refresh cycle. Shows:<br>'
           + '<b>Direction</b> — LONG / SHORT / WAIT derived from composite score and signal.<br>'
           + '<b>Entry trigger</b> — the exact spot level to cross before entering (ASO for long, BSO for short). Shows TRIGGERED in green if already broken, WAITING in amber if not.<br>'
           + '<b>SL</b> — underlying spot stop loss (BSO for long, ASO for short). Close the trade if spot closes below/above this level on a 5-min candle.<br>'
           + '<b>Target 1</b> — next strike level (AST for long, BST for short).<br>'
           + '<b>Target 2</b> — VIX daily range boundary (VIXU for long, VIXL for short).<br>'
           + '<b>Confluence</b> — count of 6 sub-scores (9:15, trend, futures, OI/OBV, MaxPain, IVSkew) agreeing with the direction.<br>'
           + '<b>Option</b> — suggested CE/PE strike to buy.<br><br>'
           + 'This card does not replace your own judgement — always verify entry trigger and check OI walls before trading.' },
    'net-gex':    { icon:'bi-bar-chart-steps', title:'Net Gamma Exposure (GEX)',
        body:'<b>Net GEX is a regime indicator — it tells you HOW price will move, not WHICH direction.</b><br><br>'
           + '<b style="color:var(--gtb-green)">Positive GEX (↔ Stabilising)</b>: Dealers are net long gamma. They hedge by selling when price rises and buying when it falls — dampening moves in both directions. Price tends to <b>pin / mean-revert</b> near ATM. Good for Iron Condor / range trades. Large +GEX = strong pinning effect.<br><br>'
           + '<b style="color:var(--gtb-red)">Negative GEX (→ Trending)</b>: Dealers are net short gamma. They hedge by buying when price rises and selling when it falls — amplifying moves in both directions. Price tends to <b>trend and sustain momentum</b> in whatever direction it is already moving. Large -GEX = expect sharp, sustained moves.<br><br>'
           + '<b>How to use:</b> Direction still comes from your other signals (9:15, futures trend, score). GEX tells you whether that move will be choppy and reverting (positive) or sharp and sustained (negative). Near-zero GEX = unstable, watch for a flip.' },
    'dv-ta':      { icon:'bi-lightbulb-fill', title:'Trade Analysis',
        body:'Synthesised trade recommendation covering: <b>Price Level Map</b> (LTP bar vs all key levels), <b>Suggested Setup</b> (CE buy / PE buy / spread / condor based on score and direction), <b>Entry Triggers</b> (exact price conditions to confirm before entering), <b>Risk/Reward</b> (entry, SL, T1, T2, R:R, VIX-adjusted SL), <b>OI &amp; Flow</b> (net CE/PE OI, max walls, PCR trend), and <b>Scenario Analysis</b> (Bull/Bear/Base/Reversal cases with triggers, probability, and action). Rendered after OI/Futures data loads.' },
    'dv-risk':    { icon:'bi-shield-fill-check', title:'Risk Manager',
        body:'Instrument-specific position sizing. Enter your <b>available funds</b> and <b>risk % per trade</b>. The panel derives: entry zone (ASO for bull / BSO for bear), stop loss (BSO / ASO), targets (AST / BST and VIX range), <b>risk per lot</b> (|entry − SL| × lot size), <b>suggested lots</b> (floor of max-risk ÷ risk-per-lot), and a <b>VIX-adjusted lot count</b> (reduced by 15–50% when VIX is elevated). Hit ↺ to recalculate after changing funds or risk %.' },
    // ── Max Pain & GEX popup ─────────────────────────────────────────────────────
    // ── Signals tab — OI signal strip chips ──────────────────────────────────────
    'sig-iv-skew':   { icon:'bi-symmetry-horizontal', title:'IV Skew',
        body:'Implied Volatility of the PE strike at ATM−2 minus IV of the CE strike at ATM+2. Both are equidistant from ATM so any IV difference reveals directional bias in the options market itself. <b style="color:#f85149">Positive (Put Skew)</b>: traders are paying more for downside protection than upside calls — bearish fear premium. <b style="color:#3fb950">Negative (Call Skew)</b>: upside calls are more expensive — bullish demand. Values within ±2% are neutral. ATM IV shows current overall premium level; high ATM IV = elevated uncertainty.' },
    'sig-vol-ratio': { icon:'bi-bar-chart-fill', title:'Volume Conviction',
        body:'Today\'s total CE+PE option volume divided by yesterday\'s total volume. Acts as a conviction multiplier for OI signals. <b style="color:#3fb950">≥1.5×</b>: unusually high activity — OI changes today are backed by real directional intent (institutions entering new positions). <b>0.8–1.5×</b>: normal activity, OI signal is reliable. <b style="color:#f97316">&lt;0.8×</b>: thin trading — could be position rolling or adjustment rather than directional bets; treat OI signals with lower confidence.' },
    'sig-oi-conc':   { icon:'bi-fullscreen', title:'OI Concentration',
        body:'Percentage of total open interest (CE+PE) sitting at ATM−1, ATM, and ATM+1 combined. <b style="color:#3fb950">≥60%</b>: OI is tightly clustered — strong, decisive support/resistance wall at those strikes. The market is likely to respect these levels. <b>35–60%</b>: moderate concentration. <b style="color:#f97316">≤35%</b>: OI is spread across many strikes — no dominant wall, support/resistance signals are weaker and the market is less likely to pin at any single level.' },
    'sig-oi-vel':    { icon:'bi-speedometer', title:'OI Velocity',
        body:'Rate of OI change compared to a snapshot taken ≥20 minutes ago. Shows HOW FAST positions are being built — slow OI growth can mean rolling/adjustment, fast growth means fresh directional conviction. <b style="color:#3fb950">Fast ▲PE</b>: put OI growing rapidly — fresh put writing = strong bullish support being built. <b style="color:#f85149">Fast ▲CE</b>: call OI growing rapidly — fresh call writing = resistance being reinforced. <b>Slow</b>: positions are adjusting slowly, likely expiry-related rolling rather than new directional bets. Updates after each OI reload once a prior snapshot exists.' },
    'sig-strip-outcome': { icon:'bi-flag-fill', title:'Signal Strip Outcome',
        body:'A synthesised verdict from all 5 OI extras signals combined. Scoring: <b>IV Skew</b> votes bullish (call skew) or bearish (put skew). <b>OI Velocity</b> votes bullish (fast PE build) or bearish (fast CE build). <b>OI Concentration</b> and <b>Max Pain</b> provide context notes. <b>Volume</b> acts as a confidence modifier — low volume reduces conviction, high volume confirms. Net bull/bear votes: ≥2 = ▲ Bullish, 1 = ↑ Mild Bull, 0 = ↔ Neutral, -1 = ↓ Mild Bear, ≤-2 = ▼ Bearish. Hover for the full reasoning behind the verdict.' },
    'sig-mp-conv':   { icon:'bi-bullseye', title:'Max Pain Convergence',
        body:'Whether Max Pain is moving toward or away from the current spot price between OI fetches. <b style="color:#3fb950">Converging</b>: Max Pain is drifting toward spot — option writers are defending a level near current price, expiry pin risk is rising. Expect tighter range near Max Pain. <b style="color:#f97316">Diverging</b>: Max Pain is moving away from spot — writers are repositioning to a new level, a directional move is more likely. <b>Stable</b>: Max Pain changed less than 25 pts — equilibrium, no strong pull signal. Requires two separate OI fetches to compute; will show "First read" on initial load.' },
    // ── Signals tab — OI table columns ───────────────────────────────────────────
    'sig-oi-score':  { icon:'bi-speedometer2', title:'OI Score',
        body:'The composite OI/OBV score for this instrument — the same value that feeds the master score gauge. It is the sum of per-strike scores across ATM ± 5 strikes. <b style="color:#3fb950">Positive (+)</b> = more bullish OI activity (PE writing, CE unwinding, PE OBV rising) than bearish. <b style="color:#f85149">Negative (−)</b> = more bearish OI activity. Range is roughly −5 to +5; anything beyond ±3 is a strong signal.' },
    'sig-oi-pcr':    { icon:'bi-bar-chart-steps', title:'Put–Call Ratio (PCR)',
        body:'Total PE Open Interest ÷ Total CE Open Interest across all strikes. <b>PCR &gt; 1</b>: more puts written than calls — typically bullish (put writers expect the market to stay above their strikes). <b>PCR &lt; 1</b>: more calls written — typically bearish. <b>PCR &gt; 1.3</b> is considered very bullish; <b>PCR &lt; 0.7</b> is very bearish. Extreme values (above 1.5 or below 0.5) can signal contrarian reversals.' },
    'sig-oi-atm':    { icon:'bi-crosshair', title:'ATM Strike',
        body:'The At-The-Money strike — the option strike closest to the current spot price. The score inside the cell is the sum of CE and PE OI signals at this exact strike. <b style="color:#3fb950">Positive</b> = PE OI being added or CE OI being removed at ATM (bullish). <b style="color:#f85149">Negative</b> = CE OI being added or PE OI being removed (bearish). The ATM strike carries the highest gamma and is the most sensitive to spot movement — watch it closely. Hover the cell for CE/PE signal labels.' },
    'sig-oi-wing':   { icon:'bi-distribute-horizontal', title:'Wing Strikes (ATM±1, ATM±2)',
        body:'Strikes one and two steps away from ATM. Each cell score combines CE and PE OI signals at that strike: <b style="color:#3fb950">green = net bullish OI activity</b> (put writing / call unwinding), <b style="color:#f85149">red = net bearish OI activity</b> (call writing / put unwinding). How to read the pattern:<br><br>'
            + '• <b style="color:#3fb950">All green (PE + CE side)</b> = put writers adding below + call shorts covering above → strong bullish structure, breakout likely.<br>'
            + '• <b style="color:#f85149">All red (PE + CE side)</b> = call writers adding above + put shorts covering below → strong bearish structure, breakdown likely.<br>'
            + '• <b>Green PE side + Red CE side</b> = support built below + resistance built above → range-bound, market likely to oscillate between these strikes.<br>'
            + '• <b>Red PE side + Green CE side</b> = puts being unwound below + calls being unwound above → both sides covering → indecisive, low conviction.<br><br>'
            + 'Hover any cell to see the strike price, CE and PE signal labels, and raw Delta-OI values.' },
    'mp-col-spot':     { icon:'bi-cursor-text', title:'Spot',
        body:'The current Live LTP (Last Traded Price) of the instrument. This is the reference price used to compute the distance to Max Pain and to determine whether the market is above or below the GEX flip zone.' },
    'mp-col-maxpain':  { icon:'bi-bullseye', title:'Max Pain',
        body:'The strike price at which the total financial loss for all option writers (both CE and PE combined) is the smallest. Near expiry, markets tend to gravitate toward this level because it minimises the payout to option buyers. A large cluster of OI at a strike creates magnetic pull on the spot price.' },
    'mp-col-distance': { icon:'bi-arrows-expand', title:'Distance',
        body:'Spot minus Max Pain, shown as points and %. <b style="color:#3fb950">Positive (+)</b> = spot is above Max Pain — bearish gravity, market may drift down toward Max Pain into expiry. <b style="color:#f85149">Negative (−)</b> = spot is below Max Pain — bullish gravity, market may drift up. The further the distance, the stronger the pull. Small distance (&lt; 0.3%) = spot is near max-pain equilibrium.' },
    'mp-col-netgex':   { icon:'bi-graph-up-arrow', title:'Net GEX',
        body:'Net Gamma Exposure = Σ (gamma × OI × lot-size) across all strikes, CE minus PE. <b style="color:#3fb950">Positive GEX</b>: market makers are net long gamma — they buy dips and sell rallies to delta-hedge, acting as a natural stabiliser (range-bound action). <b style="color:#f85149">Negative GEX</b>: market makers are net short gamma — they must chase the move to hedge, amplifying trends and causing sharp directional swings. The magnitude indicates how strong this effect is.' },
    'mp-col-regime':   { icon:'bi-shield-half', title:'GEX Regime',
        body:'A label derived from Net GEX. <b style="color:#3fb950">Stabilising</b> (positive GEX): dealers act as shock absorbers — expect chop, mean reversion, and tight intraday ranges. Good for iron condors and short-premium strategies. <b style="color:#f85149">Trending</b> (negative GEX): dealers amplify moves — expect breakouts, momentum runs, and wider intraday ranges. Good for directional CE/PE buying.' },
    'mp-col-outcome':  { icon:'bi-flag-fill', title:'Outcome',
        body:'A synthesised verdict combining Max Pain pull direction, GEX regime, and proximity to flip zones. Five possible verdicts:<br><br>'
            + '<b style="color:#a78bfa">Expiry Pin</b> — spot is within 0.3% of Max Pain. Writers are defending the level hard; expect a very tight range and rapid premium decay. Avoid buying options.<br>'
            + '<b style="color:#3fb950">↑ Gradual Drift Up</b> — Max Pain above spot + positive GEX. Slow, orderly pull upward. Good for PE spreads / upward-biased condors.<br>'
            + '<b style="color:#f85149">↓ Gradual Drift Down</b> — Max Pain below spot + positive GEX. Slow bleed lower. Good for CE spreads / downward-biased condors.<br>'
            + '<b style="color:#3fb950">⚡ Sharp Rally Risk</b> — Max Pain above spot + negative GEX. Dealers will amplify the move — expect a sharper-than-normal rally, especially if a flip zone is crossed. Buy CE.<br>'
            + '<b style="color:#f85149">⚡ Sharp Fall Risk</b> — Max Pain below spot + negative GEX. Dealers amplify the sell-off. Buy PE.<br><br>'
            + 'The "+ Flip Risk" suffix is added when a GEX flip zone is within 0.5% of spot, warning that crossing it could change the move character.' },
    'mp-col-flip':     { icon:'bi-lightning-charge', title:'Flip Zones',
        body:'Strikes where the cumulative GEX flips from positive to negative (or vice versa). These are the key threshold levels — price action tends to be orderly and range-bound on the positive-GEX side, and fast/trending on the negative-GEX side. A break through a flip zone often signals a regime change from stable to trending (or back). Use these as breakout confirmation levels.' },
    'mp-summary': { icon:'bi-table', title:'Max Pain — Summary',
        body:'One row per instrument. <b>Max Pain</b> is the strike where total open-interest loss for all option writers is minimised — spot tends to be pulled toward it near expiry. <b>Distance</b> = spot minus Max Pain (positive = spot above Max Pain, bearish pull back; negative = below, bullish pull up). <b>Net GEX</b> (Gamma Exposure) = sum of (gamma × OI × lot size) across all strikes; positive GEX = dealers are long gamma and act as market stabilisers (fade rallies/drops), negative GEX = dealers short gamma and amplify moves. <b>Flip Zones</b> are strikes where GEX crosses zero — price action typically accelerates beyond these levels.' },
    'mp-gex':     { icon:'bi-bar-chart-steps', title:'GEX Profile per Instrument',
        body:'Each card shows a per-strike GEX bar chart. <b>Green bars</b> = positive GEX at that strike (dealer long gamma → stabilising), <b>red bars</b> = negative GEX (dealer short gamma → trending/amplifying). The tallest bar is the dominant support/resistance level. The Max Pain strike is marked with a ★. Use this to identify where the market is likely to consolidate (cluster of positive GEX) vs where it can trend freely (negative GEX zone).' },
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
async function _gtbFetchFutCandlesMCX(name) {
    var fut = null;
    jQ.each(COMMODITIES_FUTURE_INSTRUMENT_LIST, function(i, it) { if (it.name === name) fut = it; });
    if (!fut) return null;
    var pres = await getHistoricalDataUsingPromise(fut.instrument_token, _gtbMcxPrevDay(), _gtbMcxPrevDay(), 'day');
    var cres = await getHistoricalDataUsingPromise(fut.instrument_token, _gtbMcxCurrDay(), _gtbMcxCurrDayTo(), '5minute');
    var map = function(it) { return { date: moment(it[0]).format('HH:mm'), open: it[1], high: it[2], low: it[3], close: it[4], volume: it[5], oi: it[6] }; };
    var intr = (cres && cres.data && cres.data.candles) ? _gtbTrimCandles(cres.data.candles).map(map) : [];
    var pcs  = (pres && pres.data && pres.data.candles) ? pres.data.candles.map(map) : [];
    if (intr.length < 3 || !pcs.length) return null;
    return { lotSize: fut.lot_size, prevDay: pcs[pcs.length - 1], intraday: intr };
}

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
            var isReliable = r.win >= 60 && r.avgPts > 0 && r.total >= 8;
            var rowStyle = r.total < 8 ? 'opacity:0.55;' : isReliable ? 'background:var(--gtb-green)18;outline:1px solid var(--gtb-green)44;' : '';
            body += '<tr' + (rowStyle ? ' style="' + rowStyle + '"' : '') + '>'
                + '<td><span class="gtb-t915-out ' + bc + '">' + r.remark + '</span>' + (isReliable ? ' <span style="font-size:0.44rem;color:var(--gtb-green);font-weight:800;">★</span>' : '') + '</td>'
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

// ── Max Pain + Gamma Exposure (GEX) ──────────────────────────────────────────
function _gtbComputeMaxPainGEX(name) {
    var sm = INSTRUMENT_SCORE_MAP[name];
    if (!sm || !sm.oiData || !sm.oiData.tableData || !sm.oiData.tableData.length) return null;
    var td = sm.oiData.tableData;

    // Spot ≈ ATM strike
    var spot = 0;
    for (var i = 0; i < td.length; i++) {
        if (td[i]['ATM_STRIKE']) { spot = parseFloat(td[i]['STRIKE']); break; }
    }
    if (!spot) spot = parseFloat(td[Math.floor(td.length / 2)]['STRIKE']);

    var strikes = td.map(function(r) { return parseFloat(r['STRIKE']); });
    var oiCE    = td.map(function(r) { return parseFloat(r['OI_CE'])  || 0; });
    var oiPE    = td.map(function(r) { return parseFloat(r['OI_PE'])  || 0; });

    // Max Pain: strike where option-writer loss is minimised
    var maxPainK = strikes[0], minPain = Infinity;
    strikes.forEach(function(K, ki) {
        var pain = 0;
        strikes.forEach(function(S, si) {
            if (S < K) pain += (K - S) * oiCE[si];  // ITM calls bleed
            if (S > K) pain += (S - K) * oiPE[si];  // ITM puts bleed
        });
        if (pain < minPain) { minPain = pain; maxPainK = K; }
    });

    // GEX: dealers are net long gamma on options they sold.
    // gamma_proxy = bell-curve centred at ATM (σ = 15% of spot)
    var sigma = spot * 0.15;
    var gex = strikes.map(function(K, i) {
        var g = Math.exp(-0.5 * Math.pow((K - spot) / sigma, 2));
        return (oiCE[i] - oiPE[i]) * g;
    });

    // GEX flip zones: strikes where running sign changes
    var flipZones = [];
    for (var j = 1; j < gex.length; j++) {
        if ((gex[j - 1] >= 0) !== (gex[j] >= 0)) flipZones.push(strikes[j]);
    }

    var netGEX = gex.reduce(function(a, b) { return a + b; }, 0);
    var maxPainDist = maxPainK - spot;

    return { spot: spot, maxPainK: maxPainK, maxPainDist: maxPainDist,
             maxPainPct: spot ? (maxPainDist / spot * 100) : 0,
             gex: gex, strikes: strikes, oiCE: oiCE, oiPE: oiPE,
             flipZones: flipZones, netGEX: netGEX };
}

function _gtbMaxPainGEXHtml(name, compact) {
    var d = _gtbComputeMaxPainGEX(name);
    if (!d) return '<div style="font-size:0.5rem;color:var(--gtb-muted);padding:6px;">No OI data — refresh first</div>';

    var distCol   = d.maxPainDist > 0 ? '#3fb950' : d.maxPainDist < 0 ? '#f85149' : '#7d8590';
    var gexCol    = d.netGEX  > 0 ? '#3fb950' : d.netGEX  < 0 ? '#f85149' : '#7d8590';
    var gexLbl    = d.netGEX  > 0 ? 'Stabilising (mean-revert)' : d.netGEX < 0 ? 'Trending (momentum)' : 'Neutral';
    var fmtDist   = (d.maxPainDist > 0 ? '+' : '') + d.maxPainDist.toFixed(0)
                    + ' (' + (d.maxPainPct > 0 ? '+' : '') + d.maxPainPct.toFixed(2) + '%)';

    // GEX bar chart SVG
    var n = d.gex.length;
    var bW = compact ? Math.max(4, Math.floor(180 / n)) : Math.max(6, Math.floor(280 / n));
    var svgH = compact ? 50 : 80, midY = svgH / 2;
    var maxG = d.gex.reduce(function(m, g) { return Math.max(m, Math.abs(g)); }, 1);
    var svgW = n * (bW + 1);
    var bars = d.gex.map(function(g, i) {
        var pct = g / maxG;
        var bh  = Math.max(1, Math.abs(pct) * (midY - 3));
        var y   = pct >= 0 ? midY - bh : midY;
        var col = g >= 0 ? '#3fb950' : '#f85149';
        var isMP  = d.strikes[i] === d.maxPainK;
        var isFlip= d.flipZones.indexOf(d.strikes[i]) !== -1;
        return '<rect x="' + (i * (bW + 1)) + '" y="' + y + '" width="' + bW + '" height="' + bh + '" fill="' + col + '" opacity="0.8"/>'
            + (isMP   ? '<rect x="' + (i*(bW+1)-1) + '" y="0" width="' + (bW+2) + '" height="' + svgH + '" fill="none" stroke="#ffbe0b" stroke-width="1.5" stroke-dasharray="3,2"/>' : '')
            + (isFlip ? '<line x1="' + (i*(bW+1)+bW/2) + '" y1="0" x2="' + (i*(bW+1)+bW/2) + '" y2="' + svgH + '" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="2,2"/>' : '');
    }).join('');
    var gexSvg = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" style="width:100%;height:' + svgH + 'px;display:block;">'
        + '<line x1="0" y1="' + midY + '" x2="' + svgW + '" y2="' + midY + '" stroke="var(--gtb-border,#21262d)" stroke-width="1"/>'
        + bars + '</svg>';

    // Compact view (for detail column in card)
    if (compact) {
        return '<div class="mp-compact">'
            + '<div class="mp-compact-row">'
            +   '<span class="mp-compact-label">Max Pain</span>'
            +   '<span style="color:#ffbe0b;font-weight:700;">' + d.maxPainK + '</span>'
            +   '<span style="color:' + distCol + ';font-size:0.5rem;">' + fmtDist + '</span>'
            + '</div>'
            + '<div class="mp-compact-row">'
            +   '<span class="mp-compact-label">Net GEX</span>'
            +   '<span style="color:' + gexCol + ';font-weight:700;">' + (d.netGEX > 0 ? '+' : '') + d.netGEX.toFixed(0) + '</span>'
            +   '<span style="color:' + gexCol + ';font-size:0.5rem;">' + (d.netGEX > 0 ? 'Stabilising' : 'Trending') + '</span>'
            + '</div>'
            + (d.flipZones.length ? '<div class="mp-compact-row"><span class="mp-compact-label">Flip</span>' + d.flipZones.map(function(f){return '<span class="mp-flip-pill">'+f+'</span>';}).join('') + '</div>' : '')
            + '<div style="margin-top:4px;">' + gexSvg + '</div>'
            + '</div>';
    }

    // Full view (for maximize popup)
    var flipHtml = d.flipZones.length
        ? d.flipZones.map(function(f) { return '<span class="mp-flip-pill">' + f + '</span>'; }).join('')
        : '<span style="color:var(--gtb-muted);font-size:0.5rem;">None detected</span>';

    // Strike labels (every other)
    var labelHtml = d.strikes.map(function(s, i) {
        var x = i * (bW + 1) + bW / 2;
        return (i % 2 === 0) ? '<text x="' + x + '" y="10" font-size="6" text-anchor="middle" fill="var(--gtb-muted,#7d8590)">' + s + '</text>' : '';
    }).join('');
    var lblSvg = '<svg viewBox="0 0 ' + svgW + ' 12" style="width:100%;height:12px;display:block;">' + labelHtml + '</svg>';

    return '<div class="mp-wrap">'
        + '<div class="mp-header">'
        +   '<div class="mp-block">'
        +     '<div class="mp-label">MAX PAIN STRIKE</div>'
        +     '<div class="mp-value" style="color:#ffbe0b;">' + d.maxPainK + '</div>'
        +     '<div class="mp-sub">Distance from spot: <b style="color:' + distCol + ';">' + fmtDist + '</b></div>'
        +     '<div class="mp-sub" style="color:var(--gtb-muted);margin-top:2px;">Price gravitates here into expiry</div>'
        +   '</div>'
        +   '<div class="mp-block">'
        +     '<div class="mp-label">NET GAMMA EXPOSURE</div>'
        +     '<div class="mp-value" style="color:' + gexCol + ';">' + (d.netGEX > 0 ? '+' : '') + d.netGEX.toFixed(0) + '</div>'
        +     '<div class="mp-sub" style="color:' + gexCol + ';">' + gexLbl + '</div>'
        +     '<div class="mp-sub" style="color:var(--gtb-muted);margin-top:2px;">+ve = dealers hedge by selling rallies; −ve = dealers amplify moves</div>'
        +   '</div>'
        +   '<div class="mp-block">'
        +     '<div class="mp-label">GEX FLIP ZONES</div>'
        +     '<div class="mp-flip-list">' + flipHtml + '</div>'
        +     '<div class="mp-sub" style="color:#a78bfa;margin-top:3px;">Price tends to accelerate (or stall) through these levels</div>'
        +   '</div>'
        + '</div>'
        + '<div class="mp-chart-legend">'
        +   '<span style="color:#3fb950;">■ Long gamma (stabilising)</span>'
        +   '<span style="color:#f85149;">■ Short gamma (trending)</span>'
        +   '<span style="color:#ffbe0b;">┄ Max pain</span>'
        +   '<span style="color:#a78bfa;">┄ GEX flip</span>'
        + '</div>'
        + '<div class="mp-gex-chart">' + gexSvg + '</div>'
        + '<div class="mp-gex-chart">' + lblSvg + '</div>'
        + '</div>';
}

// Synthesises Max Pain + GEX into a plain-English outcome verdict for one instrument.
// Returns { label, color, reason } — label is the short verdict chip text.
function _gtbMaxPainOutcome(d) {
    if (!d) return { label: 'No data', color: 'var(--gtb-muted)', reason: 'OI data not loaded.' };

    var absPct  = Math.abs(d.maxPainPct);
    var pullDir = d.maxPainDist < 0 ? 'up' : d.maxPainDist > 0 ? 'down' : 'flat';   // spot needs to move which way to reach Max Pain
    var bullGEX = d.netGEX > 0;   // true = stabilising, false = trending/amplifying
    var nearFlip = d.flipZones.length > 0 && d.flipZones.some(function(f) {
        return Math.abs(f - d.spot) / d.spot < 0.005;  // flip zone within 0.5% of spot
    });

    // Small distance (<0.3%) = already at Max Pain — expiry pin risk
    if (absPct < 0.3) {
        return {
            label: 'Expiry Pin',
            color: '#a78bfa',
            reason: 'Spot is within 0.3% of Max Pain (' + d.maxPainK + '). Option writers have maximum incentive to keep price here. Expect a tight range and time-decay compression. Avoid buying options — premium will erode rapidly.'
        };
    }

    // Stabilising GEX (dealers hedge by fading moves)
    if (bullGEX) {
        if (pullDir === 'up') {
            return {
                label: nearFlip ? '↑ Pull + Flip Risk' : '↑ Gradual Drift Up',
                color: '#3fb950',
                reason: 'Max Pain (' + d.maxPainK + ') is ' + absPct.toFixed(1) + '% above spot — gravity pulls price upward into expiry. GEX is positive (stabilising), so the move will be slow and orderly, not a sharp rally. '
                    + (nearFlip ? 'A GEX flip zone is near spot — a break above it could switch the regime to trending and accelerate the move.' : 'No flip zone near spot — expect measured mean-reversion rather than momentum.')
                    + ' Strategy: sell PE spreads / iron condor biased upward.'
            };
        } else {
            return {
                label: nearFlip ? '↓ Pull + Flip Risk' : '↓ Gradual Drift Down',
                color: '#f85149',
                reason: 'Max Pain (' + d.maxPainK + ') is ' + absPct.toFixed(1) + '% below spot — gravity pulls price downward into expiry. GEX is positive (stabilising), so the drift will be slow. '
                    + (nearFlip ? 'A GEX flip zone is near spot — a break below it could turn the drift into a sharper sell-off.' : 'No flip zone near current price — expect gradual bleed, not a crash.')
                    + ' Strategy: sell CE spreads / iron condor biased downward.'
            };
        }
    }

    // Trending GEX (dealers amplify — sharp directional moves possible)
    if (pullDir === 'up') {
        return {
            label: nearFlip ? '⚡ Sharp Rally Risk' : '↑ Momentum Up',
            color: '#3fb950',
            reason: 'Max Pain pull is upward (' + absPct.toFixed(1) + '% to ' + d.maxPainK + ') AND GEX is negative (dealers will amplify the move, not fade it). Expect a sharper-than-normal rally. '
                + (nearFlip ? 'Spot is near a GEX flip zone — crossing it could trigger an accelerated squeeze.' : '')
                + ' Strategy: buy CE / CE debit spreads. Avoid selling calls — short gamma pain if move extends.'
        };
    } else {
        return {
            label: nearFlip ? '⚡ Sharp Fall Risk' : '↓ Momentum Down',
            color: '#f85149',
            reason: 'Max Pain pull is downward (' + absPct.toFixed(1) + '% to ' + d.maxPainK + ') AND GEX is negative (dealers amplify moves). Expect a sharper-than-normal sell-off. '
                + (nearFlip ? 'Spot is near a GEX flip zone — a break below could cascade into a momentum flush.' : '')
                + ' Strategy: buy PE / PE debit spreads. Avoid selling puts — short gamma risk on the downside.'
        };
    }
}

// ── Max Pain / GEX popup (all OI instruments) ─────────────────────────────────
jQ(document).on('click', '#show-maxpain-gex', function(e) {
    e.preventDefault();
    var _divId = 'popup-custom-style-maxpain-gex';
    var _instrs = ['NIFTY 50', 'NIFTY BANK', 'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'CRUDEOILM'];
    var _wtdNames = _gtbMpWeightedNames();

    // Per-instrument GEX cards (index/stock only)
    var cards = _instrs.map(function(nm) {
        return '<div class="mp-instr-card">'
            + '<div class="mp-instr-name"><i class="bi bi-bar-chart-steps"></i> ' + nm + '</div>'
            + _gtbMaxPainGEXHtml(nm, false)
            + '</div>';
    }).join('');

    var wtdTableHtml = _wtdNames.length
        ? '<div style="overflow-x:auto;">' + _gtbMpSummaryTable(_gtbMpSummaryRows(_wtdNames)) + '</div>'
        : '<div style="font-size:0.5rem;color:var(--gtb-muted);padding:4px;">No weighted constituent OI data — run an OI scan first.</div>';

    var body = '<div class="mp-popup-wrap">'
        + '<div class="mp-section-label">Index / Stock Summary ' + _ii('mp-summary') + '</div>'
        + '<div style="overflow-x:auto;">' + _gtbMpSummaryTable(_gtbMpSummaryRows(_instrs)) + '</div>'
        + '<div class="mp-section-label" style="margin-top:14px;">Weighted Constituents ' + _ii('mp-summary') + '</div>'
        + wtdTableHtml
        + '<div class="mp-section-label" style="margin-top:14px;">GEX Profile per Instrument ' + _ii('mp-gex') + '</div>'
        + '<div class="mp-cards-grid">' + cards + '</div>'
        + '</div>';

    showMaximizeOverlay('<i class="bi bi-bar-chart-steps"></i> Max Pain &amp; Gamma Exposure — All Instruments', body);
});

// Builds the compact OI list table HTML directly from oiData (works for any instrument).
function _gtbOITableHtml(oiData, pc) {
    var h = '<table class="aoi-tbl"><thead><tr>'
        + '<th>Strike</th><th>Score</th><th>DeltaCE OI</th><th>CE OBV</th><th>DeltaPE OI</th><th>PE OBV</th><th>CE Signal</th><th>PE Signal</th>'
        + '</tr></thead><tbody>';
    jQ.each(oiData.tableData, function (i, item) {
        var r = scoreOIStrikeForSignal(item, !!item['ATM_STRIKE'], pc);
        var c = item['CE_OBV'], p = item['PE_OBV'];
        var ceObv = parseFloat(c[c.length - 1].obv), peObv = parseFloat(p[p.length - 1].obv);
        var ceCh = parseFloat(item['CHG_OI_CE']), peCh = parseFloat(item['CHG_OI_PE']);
        var sc = r.score > 0 ? 'var(--gtb-green)' : r.score < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
        h += '<tr' + (item['ATM_STRIKE'] ? ' class="atm"' : '') + '>'
            + '<td><b>' + item['STRIKE'] + (item['ATM_STRIKE'] ? ' ★' : '') + '</b></td>'
            + '<td style="color:' + sc + ';font-weight:700;">' + (r.score > 0 ? '+' : '') + r.score.toFixed(2) + '</td>'
            + '<td style="color:' + (ceCh > 0 ? 'var(--gtb-red)' : ceCh < 0 ? 'var(--gtb-green)' : 'inherit') + '">' + item['CHG_OI_CE'] + '</td>'
            + '<td style="color:' + (ceObv > 0 ? 'var(--gtb-red)' : ceObv < 0 ? 'var(--gtb-green)' : 'inherit') + '">' + ceObv.toFixed(1) + '</td>'
            + '<td style="color:' + (peCh > 0 ? 'var(--gtb-green)' : peCh < 0 ? 'var(--gtb-red)' : 'inherit') + '">' + item['CHG_OI_PE'] + '</td>'
            + '<td style="color:' + (peObv > 0 ? 'var(--gtb-green)' : peObv < 0 ? 'var(--gtb-red)' : 'inherit') + '">' + peObv.toFixed(1) + '</td>'
            + '<td>' + r.ceLabel + '</td><td>' + r.peLabel + '</td>'
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
    var _oiEl = document.getElementById(oiSel.replace('#','')), _obvEl = document.getElementById(obvSel.replace('#',''));
    var _oiH  = (_oiEl  && parseInt(_oiEl.style.height))  || 170;
    var _obvH = (_obvEl && parseInt(_obvEl.style.height)) || 170;
    _renderBarChart(oiSel,  { labels: strikes, atm: atm, height: _oiH, series: [
        { label: 'CH CE OI', color: OI_COLORS.CE_OI, values: ceCh.slice(1) },
        { label: 'CH PE OI', color: OI_COLORS.PE_OI, values: peCh.slice(1) } ] });
    _renderBarChart(obvSel, { labels: strikes, atm: atm, height: _obvH, series: [
        { label: 'CE OBV', color: OI_COLORS.CE_OBV, values: ceObv.slice(1) },
        { label: 'PE OBV', color: OI_COLORS.PE_OBV, values: peObv.slice(1) } ] });
}

// ── Commodities popup state (auto-refresh) ────────────────────────────────────
var _CMD = { interval: null, intervalMs: 60000, running: false, lastRefresh: null };

// Build trend-probability card for one instrument (GIFT NIFTY or CRUDEOILM)
function _cmdTrendProb(name, fres) {
    var signals = [];

    // 1. 9:15 Breakout
    var nine15 = 'B/W';
    try { nine15 = (JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}')[name] || {}).CLOSE_9_15 || 'B/W'; } catch(e) {}
    var n15dir = nine15 === 'ASO' ? 'bull' : nine15 === 'BSO' ? 'bear' : 'neutral';
    signals.push({ key:'915', label:'9:15 Breakout', icon:'bi-sunrise-fill', dir:n15dir, weight:2, strength:n15dir!=='neutral'?0.8:0, detail:'9:15 candle: '+nine15, value:nine15 });

    // 2. Futures Trend
    var futScore = 0, futDir = 'neutral', futLabel = 'N/A', futDetail = 'No futures data';
    if (fres) {
        var rem = fres['REMARK'] || '';
        futScore = getFuturesTrendScore(rem);
        futDir   = futScore > 0 ? 'bull' : futScore < 0 ? 'bear' : 'neutral';
        futLabel = rem || 'Neutral';
        futDetail = rem || 'Neutral';
    } else {
        try { var sm0 = INSTRUMENT_SCORE_MAP[name]; if (sm0 && sm0.futures_trend !== undefined) {
            futScore = sm0.futures_trend; futDir = futScore>0?'bull':futScore<0?'bear':'neutral';
            futLabel = futScore>0?'Long Buildup':futScore<0?'Short Buildup':'Neutral';
            futDetail = 'Cached futures score: '+futScore;
        }} catch(e) {}
    }
    signals.push({ key:'fut', label:'Futures', icon:'bi-graph-up-arrow', dir:futDir, weight:3, strength:Math.min(1,Math.abs(futScore)), detail:futDetail, value:futLabel });

    // 3. OI/OBV
    var oiScore = 0, oiDir = 'neutral', oiLabel = '--';
    try { oiScore = computeInstrumentScore(name).oi_obv; oiDir = oiScore>0?'bull':oiScore<0?'bear':'neutral'; oiLabel=(oiScore>0?'+':'')+oiScore.toFixed(1); } catch(e) {}
    signals.push({ key:'oiobv', label:'OI / OBV', icon:'bi-layers-fill', dir:oiDir, weight:2, strength:Math.min(1,Math.abs(oiScore)/3), detail:'OI/OBV score: '+oiLabel, value:oiLabel });

    // 4. Composite Score
    var cs = { total:0 }; try { cs = computeInstrumentScore(name); } catch(e) {}
    var cDir = cs.total>=2?'bull':cs.total<=-2?'bear':'neutral';
    var cLbl = (cs.total>0?'+':'')+cs.total.toFixed(1);
    signals.push({ key:'score', label:'Composite Score', icon:'bi-speedometer2', dir:cDir, weight:2, strength:Math.min(1,Math.abs(cs.total)/8), detail:'Instrument score: '+cLbl, value:cLbl });

    // 5. VIX modifier
    var vix = 0;
    try { vix = parseFloat((_btLtps()['INDIA VIX']||{}).ltp)||0; } catch(e) {}
    if (!vix) try { vix = VIX||0; } catch(e) {}
    var vixMod = vix<13?1.15:vix<18?1.0:vix<25?0.85:0.65;
    signals.push({ key:'vix', label:'VIX', icon:'bi-activity', dir:'neutral', weight:0, strength:0, detail:'VIX '+(vix?vix.toFixed(1):'--'), value:vix?vix.toFixed(1):'--', isVix:true, vixMod:vixMod });

    // Aggregate
    var bW=0, rW=0;
    signals.forEach(function(s) {
        if (s.isVix||!s.weight) return;
        var w = s.weight*(0.5+s.strength*0.5);
        if (s.dir==='bull') bW+=w; else if (s.dir==='bear') rW+=w; else { bW+=s.weight*0.25; rW+=s.weight*0.25; }
    });
    var raw = (bW+rW)>0 ? bW/(bW+rW) : 0.5;
    var bullPct = Math.max(0.05, Math.min(0.95, 0.5+(raw-0.5)*vixMod));
    var bearPct = 1-bullPct;
    var conf = Math.round(Math.abs(bullPct-0.5)*200);

    var verdict,vCol,vIcon;
    if      (bullPct>=0.70){verdict='STRONGLY BULLISH';vCol='#3fb950';vIcon='bi-arrow-up-circle-fill';}
    else if (bullPct>=0.58){verdict='BULLISH';          vCol='#3fb950';vIcon='bi-arrow-up-circle';}
    else if (bullPct>=0.52){verdict='MILDLY BULLISH';   vCol='#86efac';vIcon='bi-arrow-up-right-circle';}
    else if (bullPct>=0.48){verdict='NEUTRAL';           vCol='#7d8590';vIcon='bi-dash-circle';}
    else if (bullPct>=0.42){verdict='MILDLY BEARISH';   vCol='#fca5a5';vIcon='bi-arrow-down-right-circle';}
    else if (bullPct>=0.30){verdict='BEARISH';           vCol='#f85149';vIcon='bi-arrow-down-circle';}
    else                   {verdict='STRONGLY BEARISH'; vCol='#f85149';vIcon='bi-arrow-down-circle-fill';}

    // Mini gauge SVG
    var r=40,cx=52,cy=49;
    function px(d){return cx+r*Math.cos((180-d)*Math.PI/180);}
    function py(d){return cy-r*Math.sin((180-d)*Math.PI/180);}
    var ang=bullPct*180, nX=px(ang), nY=py(ang), mX=px(90), mY=py(90), bigA=ang>180?1:0;
    var gaugeHtml='<svg viewBox="0 0 104 57" style="width:104px;height:57px;display:block;">'
        +'<path d="M '+px(0)+' '+py(0)+' A '+r+' '+r+' 0 0 1 '+mX+' '+mY+'" fill="none" stroke="#f8514940" stroke-width="8" stroke-linecap="round"/>'
        +'<path d="M '+mX+' '+mY+' A '+r+' '+r+' 0 0 1 '+px(180)+' '+py(180)+'" fill="none" stroke="#3fb95040" stroke-width="8" stroke-linecap="round"/>'
        +(ang>1?'<path d="M '+px(0)+' '+py(0)+' A '+r+' '+r+' 0 '+bigA+' 1 '+nX+' '+nY+'" fill="none" stroke="'+vCol+'" stroke-width="8" stroke-linecap="round"/>'  :'')
        +'<line x1="'+cx+'" y1="'+cy+'" x2="'+nX+'" y2="'+nY+'" stroke="var(--gtb-text,#cdd9e5)" stroke-width="2" stroke-linecap="round"/>'
        +'<circle cx="'+cx+'" cy="'+cy+'" r="3.5" fill="var(--gtb-text,#cdd9e5)"/>'
        +'<text x="5" y="56" font-size="6" fill="#f85149" font-family="monospace">BEAR</text>'
        +'<text x="75" y="56" font-size="6" fill="#3fb950" font-family="monospace">BULL</text>'
        +'</svg>';

    var dCol={bull:'#3fb950',bear:'#f85149',neutral:'#7d8590'};
    var dLbl={bull:'▲ BULL',bear:'▼ BEAR',neutral:'● NEUTRAL'};
    var sigRows='';
    signals.forEach(function(s){
        var dc=dCol[s.dir];
        var bw=s.dir!=='neutral'?Math.round(s.strength*100):0;
        sigRows+='<div class="cmd-sig-row">'
            +'<i class="bi '+s.icon+'" style="color:'+dc+';font-size:0.62rem;width:13px;flex-shrink:0;text-align:center;"></i>'
            +'<span class="cmd-sig-lbl">'+s.label+'</span>'
            +'<span class="cmd-sig-badge" style="color:'+dc+';background:'+dc+'18;border-color:'+dc+'44;">'+dLbl[s.dir]+'</span>'
            +'<div class="cmd-sig-bar-bg"><div class="cmd-sig-bar" style="width:'+bw+'%;background:'+dc+';"></div></div>'
            +'<span class="cmd-sig-val" title="'+s.detail+'">'+s.value+'</span>'
            +'</div>';
    });

    return '<div class="cmd-prob">'
        +'<div class="cmd-prob-top">'
        +  gaugeHtml
        +  '<div class="cmd-prob-info">'
        +    '<div class="cmd-prob-verdict" style="color:'+vCol+';"><i class="bi '+vIcon+'"></i> '+verdict+'</div>'
        +    '<div class="cmd-prob-pcts"><b style="color:#3fb950;">'+(bullPct*100).toFixed(0)+'%</b><span> bull</span> &middot; <b style="color:#f85149;">'+(bearPct*100).toFixed(0)+'%</b><span> bear</span></div>'
        +    '<div class="cmd-prob-conf"><div class="cmd-prob-conf-bar-bg"><div style="width:'+conf+'%;height:100%;background:'+vCol+';border-radius:2px;"></div></div><span>'+conf+'/100</span></div>'
        +  '</div>'
        +'</div>'
        +'<div class="cmd-sig-list">'+sigRows+'</div>'
        +'</div>';
}

function _cmdUpdateStatus() {
    var $s = jQ('#cmd-status');
    if (_CMD.running) {
        $s.html('<span style="color:#3fb950;"><i class="bi bi-circle-fill bto-pulse"></i> Live</span>');
        jQ('#cmd-start').prop('disabled', true).css('opacity', 0.45);
        jQ('#cmd-stop').prop('disabled', false).css('opacity', 1);
    } else {
        $s.html('<span style="color:#7d8590;"><i class="bi bi-circle"></i> Stopped</span>');
        jQ('#cmd-start').prop('disabled', false).css('opacity', 1);
        jQ('#cmd-stop').prop('disabled', true).css('opacity', 0.45);
    }
    if (_CMD.lastRefresh) jQ('#cmd-last-ref').text('Updated ' + _CMD.lastRefresh);
}
function _cmdStartRefresh() {
    if (_CMD.running) return;
    _CMD.running = true; _cmdUpdateStatus();
    _CMD.interval = setInterval(function() { if (_CMD.loadAll) _CMD.loadAll().catch(function(){}); }, _CMD.intervalMs);
}
function _cmdStopRefresh() {
    _CMD.running = false;
    if (_CMD.interval) { clearInterval(_CMD.interval); _CMD.interval = null; }
    _cmdUpdateStatus();
}

jQ(document).on('click', '#show-commodities', function (e) {
    e.preventDefault();
    var _cmdDivId = 'popup-custom-style-commodities-panel';

    var body = '<div class="cmd-wrap">'
        // ── Toolbar ──────────────────────────────────────────────────────────
        + '<div class="cmd-toolbar">'
        +   '<button id="cmd-start" class="bto-btn bto-btn-green"><i class="bi bi-play-fill"></i> Start</button>'
        +   '<button id="cmd-stop"  class="bto-btn bto-btn-red"  disabled><i class="bi bi-stop-fill"></i> Stop</button>'
        +   '<select id="cmd-interval" class="bto-sel">'
        +     '<option value="30000">Every 30s</option>'
        +     '<option value="60000" selected>Every 1 min</option>'
        +     '<option value="120000">Every 2 min</option>'
        +     '<option value="300000">Every 5 min</option>'
        +   '</select>'
        +   '<span id="cmd-status" class="bto-status" style="margin-left:4px;"></span>'
        +   '<button id="cmd-refresh-btn" class="bto-btn" style="margin-left:auto;" title="Refresh now"><i class="bi bi-arrow-clockwise"></i> Refresh</button>'
        +   '<span id="cmd-last-ref" style="font-size:0.5rem;color:var(--gtb-muted);"></span>'
        + '</div>'
        // ── Two-column layout ─────────────────────────────────────────────────
        + '<div class="cmd-twin-grid">'
        // Left: GIFT NIFTY
        +   '<div class="cmd-twin-col">'
        +     '<div class="cmd-col-hdr"><i class="bi bi-globe-asia-australia"></i> GIFT NIFTY</div>'
        +     '<div id="cmd-gift-levels" class="gtb-chart-levels" style="min-height:22px;"></div>'
        +     '<div id="cmd-gift-chart"  style="height:180px;"></div>'
        +     '<div class="cmd-fut-prob-cell" style="margin-top:8px;"><div id="cmd-gift-prob"></div></div>'
        +   '</div>'
        // Right: CRUDEOILM
        +   '<div class="cmd-twin-col">'
        +     '<div class="cmd-col-hdr"><i class="bi bi-droplet-fill"></i> CRUDEOILM</div>'
        +     '<div id="cmd-crude-meta" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:4px 0;margin-bottom:4px;border-bottom:1px solid var(--gtb-border);font-size:0.48rem;"></div>'
        +     '<div id="cmd-crude-usdinr-div" style="margin-bottom:4px;"></div>'
        +     '<div id="cmd-crude-session" style="margin-bottom:4px;"></div>'
        +     '<div id="cmd-crude-levels" class="gtb-chart-levels" style="min-height:22px;"></div>'
        +     '<div id="cmd-crude-chart"  style="height:180px;"></div>'
        // Futures + Trend Probability side by side
        +     '<div class="cmd-fut-prob-row">'
        +       '<div class="cmd-fut-prob-cell cmd-3col-scroll"><div class="cmd-st">Futures Trend</div><div id="cmd-crude-fut" class="cmd-fut"><div class="cmd-load"><i class="bi bi-hourglass-split"></i> Loading…</div></div></div>'
        +       '<div class="cmd-fut-prob-cell"><div id="cmd-crude-prob"></div></div>'
        +     '</div>'
        // OI + OBV full width
        +     '<div class="cmd-st" style="margin-top:8px;">OI Change (CE/PE)</div>'
        +     '<div id="cmd-crude-oi" style="height:130px;"></div>'
        +     '<div class="cmd-st" style="margin-top:4px;">OBV (CE/PE)</div>'
        +     '<div id="cmd-crude-obv" style="height:130px;"></div>'
        +     '<div id="cmd-crude-oi-table" style="overflow-x:auto;margin-top:8px;"><div class="cmd-load"><i class="bi bi-hourglass-split"></i> Loading OI…</div></div>'
        // OI Signal Strip
        +     '<div class="cmd-st" style="margin-top:8px;display:flex;align-items:center;gap:6px;"><i class="bi bi-activity"></i> OI SIGNALS</div>'
        +     '<div id="cmd-crude-sig-strip" style="margin-bottom:4px;"><div class="cmd-load"><i class="bi bi-hourglass-split"></i> Loading after OI fetch…</div></div>'
        // Max Pain & GEX
        +     '<div class="cmd-st" style="margin-top:8px;display:flex;align-items:center;gap:6px;">'
        +       '<i class="bi bi-bar-chart-steps"></i> MAX PAIN &amp; GEX ' + _ii('dv-mpgex')
        +     '</div>'
        +     '<div id="cmd-crude-mpgex"><div class="cmd-load"><i class="bi bi-hourglass-split"></i> Loading after OI fetch…</div></div>'
        // Futures Remark Accuracy
        +     '<div class="cmd-st" style="margin-top:8px;display:flex;align-items:center;gap:6px;">'
        +       '<i class="bi bi-bullseye"></i> FUTURES REMARK ACCURACY'
        +       '<button class="gtb-sig-hdr-btn" id="cmd-crude-acc-reload" style="margin-left:auto;"><i class="bi bi-arrow-clockwise"></i> Reload</button>'
        +     '</div>'
        +     '<div id="cmd-crude-acc"><div class="cmd-load"><i class="bi bi-hourglass-split"></i> Replaying 5-min candles…</div></div>'
        // Trade Recommender card
        +     '<div class="cmd-st" style="margin-top:8px;display:flex;align-items:center;gap:6px;">'
        +       '<i class="bi bi-lightning-fill"></i> TRADE RECOMMENDER'
        +     '</div>'
        +     '<div id="cmd-crude-trade"><div class="cmd-load"><i class="bi bi-hourglass-split"></i> Loading after OI fetch…</div></div>'
        +   '</div>'
        + '</div>'
        + '</div>';

    // ── Feature 2: OVX regime + Feature 4: Expiry countdown ─────────────────
    function _cmdRenderCrudeMeta() {
        var parts = [];

        // OVX regime
        var ovx = parseFloat(OVX) || 0;
        if (ovx) {
            var ovxLbl, ovxCol;
            if (ovx < 15)      { ovxLbl = 'LOW';      ovxCol = 'var(--gtb-green)'; }
            else if (ovx < 30) { ovxLbl = 'NORMAL';   ovxCol = 'var(--gtb-amber)'; }
            else               { ovxLbl = 'ELEVATED';  ovxCol = 'var(--gtb-red)'; }
            parts.push('<span style="white-space:nowrap;">OVX <b style="color:' + ovxCol + ';font-family:var(--gtb-mono);">'
                + ovx.toFixed(1) + '</b> <span style="color:' + ovxCol + ';">' + ovxLbl + '</span>'
                + (ovx >= 30 ? ' <span style="color:var(--gtb-red);">— widen SL</span>' : '') + '</span>');
        }

        // Expiry countdown
        try {
            var entry = COMMODITIES_FUTURE_INSTRUMENT_LIST.find(function(f) { return f.name === 'CRUDEOILM'; });
            if (entry && entry.expiry) {
                var exp  = moment(entry.expiry, 'DD-MM-YYYY');
                var days = exp.diff(moment().startOf('day'), 'days');
                var dCol = days <= 3 ? 'var(--gtb-red)' : days <= 7 ? 'var(--gtb-amber)' : 'var(--gtb-muted)';
                var dWarn = days <= 3 ? ' <span style="color:var(--gtb-red);">⚠ near expiry — OI signals unreliable</span>' : '';
                parts.push('<span style="white-space:nowrap;">Expiry <b style="color:' + dCol + ';font-family:var(--gtb-mono);">'
                    + entry.expiry + ' (' + days + 'd)</b>' + dWarn + '</span>');
            }
        } catch(e) {}

        jQ('#cmd-crude-meta').html(parts.join('<span style="color:var(--gtb-border);padding:0 4px;">|</span>'));
    }

    // ── Feature 1: USDINR divergence signal ──────────────────────────────────
    function _cmdRenderUSDINRDivergence() {
        var cScore  = computeInstrumentScore('CRUDEOILM');
        var uScore  = computeInstrumentScore('USDINR');
        var cDir = cScore.current_trend || ((INSTRUMENT_SCORE_MAP['CRUDEOILM'] || {}).futures_trend || 0);
        var uDir = uScore.current_trend || ((INSTRUMENT_SCORE_MAP['USDINR']    || {}).futures_trend || 0);

        var msg, col, icon;
        if (cDir < 0 && uDir > 0) {
            msg  = 'Crude bearish but USD/INR bullish — currency offsetting. MCX may fall less than expected. Tighten targets.';
            col  = 'var(--gtb-amber)'; icon = 'bi-exclamation-triangle-fill';
        } else if (cDir > 0 && uDir < 0) {
            msg  = 'Crude bullish but USD/INR bearish — currency drag. MCX may underperform WTI/Brent. Reduce position size.';
            col  = 'var(--gtb-amber)'; icon = 'bi-exclamation-triangle-fill';
        } else if (cDir > 0 && uDir > 0) {
            msg  = 'Crude bullish + USD/INR bullish — double tailwind. MCX crude amplified on upside.';
            col  = 'var(--gtb-green)'; icon = 'bi-arrow-up-circle-fill';
        } else if (cDir < 0 && uDir < 0) {
            msg  = 'Crude bearish + USD/INR bearish — double headwind. MCX crude amplified on downside.';
            col  = 'var(--gtb-red)';   icon = 'bi-arrow-down-circle-fill';
        } else {
            jQ('#cmd-crude-usdinr-div').html(''); return;
        }
        jQ('#cmd-crude-usdinr-div').html(
            '<div style="display:flex;align-items:flex-start;gap:5px;padding:5px 7px;background:var(--gtb-surface);border-left:3px solid ' + col + ';font-size:0.48rem;line-height:1.5;">'
            + '<i class="bi ' + icon + '" style="color:' + col + ';margin-top:1px;flex-shrink:0;"></i>'
            + '<span><b style="color:' + col + ';">USD/INR Divergence</b> — ' + msg + '</span>'
            + '</div>');
    }

    // ── Feature 3: Session time alerts ───────────────────────────────────────
    function _cmdRenderSessionAlert() {
        var now = moment();
        var today = now.clone().startOf('day');
        var sessions = [
            { name: 'London Open',  time: today.clone().add(13, 'h').add(30, 'm'), icon: 'bi-globe2',       col: 'var(--gtb-blue)' },
            { name: 'NYMEX Open',   time: today.clone().add(19, 'h'),              icon: 'bi-flag-fill',    col: 'var(--gtb-amber)' },
            { name: 'EIA Inventory',time: today.clone().add(20, 'h'),              icon: 'bi-droplet-fill', col: 'var(--gtb-red)', wedOnly: true },
        ];
        var chips = sessions.map(function(s) {
            if (s.wedOnly && now.day() !== 3) return null; // EIA only on Wednesday (day 3)
            var diff = s.time.diff(now, 'minutes');
            var status, sCls;
            if (diff > 0 && diff <= 15) {
                status = 'in ' + diff + 'm'; sCls = 'blink';
            } else if (diff <= 0 && diff >= -60) {
                status = 'ACTIVE'; sCls = 'active';
            } else if (diff > 15) {
                var h = Math.floor(diff / 60), m = diff % 60;
                status = (h ? h + 'h ' : '') + m + 'm'; sCls = '';
            } else {
                return null; // past + more than 60 min ago
            }
            return '<span class="cmd-session-chip cmd-session-' + sCls + '" style="border-color:' + s.col + ';">'
                + '<i class="bi ' + s.icon + '" style="color:' + s.col + ';"></i>'
                + ' <b>' + s.name + '</b>'
                + ' <span style="color:' + (sCls === 'active' ? 'var(--gtb-green)' : sCls === 'blink' ? 'var(--gtb-amber)' : 'var(--gtb-muted)') + ';">' + status + '</span>'
                + '</span>';
        }).filter(Boolean);

        jQ('#cmd-crude-session').html(chips.length
            ? '<div style="display:flex;flex-wrap:wrap;gap:4px;padding:3px 0;">' + chips.join('') + '</div>'
            : '');
    }

    async function _cmdLoadAll() {
        // GIFT NIFTY ─────────────────────────────────────────────────────────
        try {
            var _gnData = await getHistoricalDataUsingPromise(INSTRUMENT_TOKENS['GIFT NIFTY'], _gtbCurrDay(), _gtbCurrDayTo(), HISTORICAL_DATA_INTERVAL);
            var _gnCandles = _gtbTrimCandles(_gnData.data.candles);
            var _gnRefLines = [];
            try {
                var _gnTrend = generateTrend('GIFT NIFTY');
                _gnRefLines = [
                    { key:'OPEN', value:_gnTrend.open,                    text:'OPEN '+_gnTrend.open },
                    { key:'VIXL', value:_gnTrend.vix.vixDDLower,          text:'VIXL '+_gnTrend.vix.vixDDLower },
                    { key:'VIXU', value:_gnTrend.vix.vixDDUpper,          text:'VIXU '+_gnTrend.vix.vixDDUpper },
                    { key:'AST',  value:_gnTrend.strikeData.ustrikeTwo,   text:'AST ' +_gnTrend.strikeData.ustrikeTwo },
                    { key:'ASO',  value:_gnTrend.strikeData.ustrikeOne,   text:'ASO ' +_gnTrend.strikeData.ustrikeOne },
                    { key:'BSO',  value:_gnTrend.strikeData.bstrikeOne,   text:'BSO ' +_gnTrend.strikeData.bstrikeOne },
                    { key:'BST',  value:_gnTrend.strikeData.bstrikeTwo,   text:'BST ' +_gnTrend.strikeData.bstrikeTwo },
                ];
                var _lMeta = { OPEN:{s:'O',c:'#ffbe0b'}, VIXU:{s:'V↑',c:'#38bdf8'}, VIXL:{s:'V↓',c:'#38bdf8'},
                               AST:{s:'A+',c:'#3fb950'}, ASO:{s:'A',c:'#3fb950'}, BSO:{s:'B',c:'#f85149'}, BST:{s:'B-',c:'#f85149'} };
                var _fmt = function(v) { v=parseFloat(v); return v>=1000?v.toLocaleString('en-IN',{maximumFractionDigits:1}):v.toFixed(1); };
                var _lvHtml = _gnRefLines.map(function(rl){
                    var m=_lMeta[rl.key]||{s:rl.key,c:'#7d8590'};
                    return '<span style="display:inline-flex;align-items:center;gap:2px;white-space:nowrap;">'
                        +'<span style="font-size:0.58rem;font-weight:700;color:'+m.c+';letter-spacing:0.02em;">'+m.s+'</span>'
                        +'<span style="font-size:0.58rem;color:var(--gtb-muted);">'+_fmt(rl.value)+'</span></span>';
                }).join('<span style="color:#30363d;font-size:0.5rem;padding:0 2px;">·</span>');
                var _lvEl=document.getElementById('cmd-gift-levels');
                if (_lvEl) _lvEl.innerHTML=_lvHtml;
            } catch(_e) {}
            _renderLWChart('cmd-gift-chart', _gnCandles, _gnRefLines, 180, { hideLegend:true });
        } catch(e1) { console.warn('GIFT NIFTY chart error',e1); }
        jQ('#cmd-gift-prob').html(_cmdTrendProb('GIFT NIFTY', null));

        // CRUDEOILM ──────────────────────────────────────────────────────────
        try { await showTopChartMCX('CRUDEOILM', 180, '#cmd-crude-chart'); } catch(e2) {}
        // Populate level labels above the crude chart from the cached strikeMap
        try {
            var _cSM = (INSTRUMENT_SCORE_MAP['CRUDEOILM'] || {}).strikeMap;
            var _cOpen = (INSTRUMENT_SCORE_MAP['CRUDEOILM'] || {}).open;
            if (_cSM) {
                var _lMeta2 = { OPEN:{s:'O',c:'#ffbe0b'}, VIXU:{s:'V↑',c:'#38bdf8'}, VIXL:{s:'V↓',c:'#38bdf8'},
                                AST:{s:'A+',c:'#3fb950'}, ASO:{s:'A',c:'#3fb950'}, BSO:{s:'B',c:'#f85149'}, BST:{s:'B-',c:'#f85149'} };
                var _fmt2 = function(v) { v=parseFloat(v); return v>=1000?v.toLocaleString('en-IN',{maximumFractionDigits:1}):v.toFixed(1); };
                var _cLevels = [
                    { key:'OPEN', value:_cOpen },
                    { key:'VIXL', value:_cSM.vixDDLower }, { key:'VIXU', value:_cSM.vixDDUpper },
                    { key:'AST',  value:_cSM.ustrikeTwo }, { key:'ASO',  value:_cSM.ustrikeOne },
                    { key:'BSO',  value:_cSM.bstrikeOne }, { key:'BST',  value:_cSM.bstrikeTwo },
                ];
                var _cLvHtml = _cLevels.map(function(rl){
                    var m=_lMeta2[rl.key]||{s:rl.key,c:'#7d8590'};
                    return '<span style="display:inline-flex;align-items:center;gap:2px;white-space:nowrap;">'
                        +'<span style="font-size:0.58rem;font-weight:700;color:'+m.c+';letter-spacing:0.02em;">'+m.s+'</span>'
                        +'<span style="font-size:0.58rem;color:var(--gtb-muted);">'+_fmt2(rl.value)+'</span></span>';
                }).join('<span style="color:#30363d;font-size:0.5rem;padding:0 2px;">·</span>');
                var _cLvEl = document.getElementById('cmd-crude-levels');
                if (_cLvEl) _cLvEl.innerHTML = _cLvHtml;
            }
        } catch(_eL) {}
        jQ('#cmd-crude-fut').html('<div class="cmd-load"><i class="bi bi-hourglass-split"></i> Loading futures…</div>');
        var fres = null;
        try {
            fres = await showFutureDetailsMCX('CRUDEOILM');
            if (!INSTRUMENT_SCORE_MAP['CRUDEOILM']) INSTRUMENT_SCORE_MAP['CRUDEOILM']={};
            INSTRUMENT_SCORE_MAP['CRUDEOILM'].futures_trend = getFuturesTrendScore(fres['REMARK']);
            // Also update main dashboard elements if they exist
            try { setFutureDetails('CRUDEOILM', fres); } catch(_e) {}
        } catch(e3) {}
        // Render directly from fres — do NOT read back from main dashboard DOM elements
        // (those elements only exist when Groot Bot dashboard is open)
        if (fres) {
            var _cSent = getFuturesTrendScore(fres['REMARK']);
            var _cCls  = _cSent > 0 ? 'bull' : _cSent < 0 ? 'bear' : 'neutral';
            var _cFut  = '<div class="gtb-futures-signals">'
                + '<div class="gtb-fut-row ' + _cCls + '">' + (fres['PLUS']  || '—') + '</div>'
                + '<div class="gtb-fut-row ' + _cCls + '">' + (fres['MINUS'] || '—') + '</div>'
                + '</div>';
            var _cMeta = _gtbRemarkChip(fres['REMARK']) + ' ' + _gtbVwapChip(fres['trend'], fres['REMARK'])
                       + ' <span style="font-size:0.48rem;color:var(--gtb-muted);">' + (fres['vwap'] || '') + '</span>';
            jQ('#cmd-crude-fut').html('<div class="cmd-fut-meta" style="margin-bottom:4px;">' + _cMeta + '</div>' + _cFut);
        } else {
            jQ('#cmd-crude-fut').html('<div class="cmd-load" style="color:var(--gtb-red);">Futures unavailable.</div>');
        }
        jQ('#cmd-crude-prob').html(_cmdTrendProb('CRUDEOILM', fres));
        try { if (fres) await showPrictionProbabiltyMCX('CRUDEOILM', fres); showOIOBVBarChart('CRUDEOILM'); } catch(e4) {}
        jQ('#cmd-crude-sig-strip').html(_gtbSigStripHtml('CRUDEOILM'));
        var oiData=INSTRUMENT_SCORE_MAP['CRUDEOILM']&&INSTRUMENT_SCORE_MAP['CRUDEOILM'].oiData;
        if (oiData&&oiData.tableData&&oiData.tableData.length) {
            var pc=0; try{pc=parseFloat(generateTrend('CRUDEOILM').change)||0;}catch(e5){}
            try{_cmdRenderOI(oiData,'#cmd-crude-oi','#cmd-crude-obv');}catch(e6){}
            jQ('#cmd-crude-oi-table').html(_gtbOITableHtml(oiData,pc));
            // Max Pain & GEX
            try {
                var _mpd = _gtbComputeMaxPainGEX('CRUDEOILM');
                if (_mpd) {
                    var _mdc = _mpd.maxPainDist > 0 ? 'var(--gtb-green)' : _mpd.maxPainDist < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
                    var _mgc = _mpd.netGEX > 0 ? 'var(--gtb-green)' : _mpd.netGEX < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
                    var _moc = _gtbMaxPainOutcome(_mpd);
                    var _mfHtml = _mpd.flipZones.length
                        ? _mpd.flipZones.map(function(f){return '<span class="mp-flip-pill">'+f+'</span>';}).join('')
                        : '<span style="color:var(--gtb-muted);">—</span>';
                    var _mSummary = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px 8px;font-size:0.48rem;margin-bottom:6px;padding:6px;background:var(--gtb-surface);border:1px solid var(--gtb-border);">'
                        + '<div><span style="color:var(--gtb-muted);font-size:0.4rem;">SPOT</span><br><b style="font-family:var(--gtb-mono);">'+_mpd.spot+'</b></div>'
                        + '<div><span style="color:var(--gtb-muted);font-size:0.4rem;">MAX PAIN</span><br><b style="color:#ffbe0b;font-family:var(--gtb-mono);">'+_mpd.maxPainK+'</b></div>'
                        + '<div><span style="color:var(--gtb-muted);font-size:0.4rem;">DISTANCE</span><br><b style="color:'+_mdc+';font-family:var(--gtb-mono);">'+((_mpd.maxPainDist>0?'+':'')+_mpd.maxPainDist.toFixed(0)+' ('+((_mpd.maxPainPct>0?'+':'')+_mpd.maxPainPct.toFixed(1))+'%)')+'</b></div>'
                        + '<div><span style="color:var(--gtb-muted);font-size:0.4rem;">NET GEX</span><br><b style="color:'+_mgc+';font-family:var(--gtb-mono);">'+(_mpd.netGEX>0?'+':'')+_mpd.netGEX.toFixed(0)+'</b> <span style="color:'+_mgc+';">'+(_mpd.netGEX>0?'Stabilising':'Trending')+'</span></div>'
                        + '<div><span style="color:var(--gtb-muted);font-size:0.4rem;">FLIP ZONES</span><br>'+_mfHtml+'</div>'
                        + '<div style="grid-column:1/-1;"><span style="color:var(--gtb-muted);font-size:0.4rem;">OUTCOME</span><br><b style="color:'+_moc.color+';">'+_moc.label+'</b><div style="font-size:0.42rem;color:var(--gtb-muted);margin-top:3px;line-height:1.4;">'+_moc.reason+'</div></div>'
                        + '</div>'
                        + _gtbMaxPainGEXHtml('CRUDEOILM', false);
                    jQ('#cmd-crude-mpgex').html(_mSummary);
                } else {
                    jQ('#cmd-crude-mpgex').html('<div class="cmd-load" style="color:var(--gtb-muted);">No OI data for Max Pain.</div>');
                }
            } catch(e7) { jQ('#cmd-crude-mpgex').html('<div class="cmd-load" style="color:var(--gtb-red);">Max Pain error.</div>'); }
        } else {
            jQ('#cmd-crude-oi-table').html('<div class="cmd-load" style="color:var(--gtb-red);">CRUDEOILM OI unavailable.</div>');
            jQ('#cmd-crude-mpgex').html('<div class="cmd-load" style="color:var(--gtb-muted);">OI unavailable — Max Pain requires OI data.</div>');
        }
        // CRUDEOILM Futures Remark Accuracy
        _cmdLoadCrudeAcc();

        // Trade Recommender card for CRUDEOILM
        try { _gtbShowTradeSetup('cmd-crude-trade', 'CRUDEOILM'); } catch(_te) {}

        // Feature 1: USDINR divergence (after both instruments have data)
        try { _cmdRenderUSDINRDivergence(); } catch(_e) {}

        _CMD.lastRefresh = moment().format('HH:mm:ss');
        _cmdUpdateStatus();
    }

    async function _cmdLoadCrudeAcc() {
        jQ('#cmd-crude-acc').html('<div class="cmd-load"><i class="bi bi-hourglass-split"></i> Replaying 5-min candles…</div>');
        try {
            var vix = 0;
            try { vix = parseFloat((JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}')['INDIA VIX'] || {}).ltp) || 0; } catch(er) {}
            var cd = await _gtbFetchFutCandlesMCX('CRUDEOILM').catch(function() { return null; });
            if (!cd) { jQ('#cmd-crude-acc').html('<div class="cmd-load" style="color:var(--gtb-red);">No 5-min candle data for CRUDEOILM.</div>'); return; }
            var accMap = {};
            _gtbReconstructFutAccuracy(cd, vix, accMap);
            var rows = Object.keys(accMap).map(function(key) {
                var a = accMap[key];
                return { remark: key, total: a.total, hits: a.hits,
                         win: a.total ? Math.round(a.hits / a.total * 100) : 0,
                         avgPts: a.total ? (a.pts / a.total) : 0,
                         dir: getFuturesTrendScore(key) };
            }).sort(function(x, y) { return y.total - x.total; });

            if (!rows.length) { jQ('#cmd-crude-acc').html('<div class="cmd-load" style="color:var(--gtb-red);">No accuracy data reconstructed.</div>'); return; }

            var body = '<table class="gtb-t915-table"><thead><tr>'
                + '<th>Remark</th><th>Bias</th><th>Samples</th><th>Win-rate</th><th>Avg pts</th>'
                + '</tr></thead><tbody>';
            rows.forEach(function(r) {
                var bc  = r.dir > 0 ? 'up' : r.dir < 0 ? 'down' : 'flat';
                var wc  = r.win >= 60 ? 'var(--gtb-green)' : r.win <= 40 ? 'var(--gtb-red)' : 'var(--gtb-amber)';
                var ptc = r.avgPts >= 0 ? 'var(--gtb-green)' : 'var(--gtb-red)';
                var dirc = r.dir > 0 ? 'var(--gtb-green)' : r.dir < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
                var isReliable = r.win >= 60 && r.avgPts > 0 && r.total >= 8;
                var rowStyle = r.total < 8 ? 'opacity:0.55;' : isReliable ? 'background:var(--gtb-green)18;outline:1px solid var(--gtb-green)44;' : '';
                body += '<tr' + (rowStyle ? ' style="' + rowStyle + '"' : '') + '>'
                    + '<td><span class="gtb-t915-out ' + bc + '">' + r.remark + '</span>' + (isReliable ? ' <span style="font-size:0.44rem;color:var(--gtb-green);font-weight:800;">★</span>' : '') + '</td>'
                    + '<td style="font-family:var(--gtb-mono);color:' + dirc + ';">' + (r.dir > 0 ? '▲' : r.dir < 0 ? '▼' : '—') + '</td>'
                    + '<td class="gtb-t915-date">' + r.total + '</td>'
                    + '<td style="font-family:var(--gtb-mono);font-weight:800;color:' + wc + ';">' + r.win + '%</td>'
                    + '<td style="font-family:var(--gtb-mono);color:' + ptc + ';">' + (r.avgPts >= 0 ? '+' : '') + r.avgPts.toFixed(1) + '</td>'
                    + '</tr>';
            });
            body += '</tbody></table>';
            jQ('#cmd-crude-acc').html('<div class="gtb-t915-wrap">' + body + '</div>');
        } catch(e) {
            jQ('#cmd-crude-acc').html('<div class="cmd-load" style="color:var(--gtb-red);">Error loading accuracy data.</div>');
        }
    }

    showPopUpWindow('commodities-panel', body, 'Commodities', 960, 640);
    var _cmdTitle = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<span style="font-weight:800;font-size:0.7rem;white-space:nowrap;"><i class="bi bi-droplet-fill"></i> COMMODITIES</span>'
        + popupWinControls(_cmdDivId)
        + '</div>';
    jQ('.' + _cmdDivId).find('.popupwindow_titlebar_text').html(_cmdTitle);
    hideNativePopupButtons(_cmdDivId);
    // Remove draggable so clicking anywhere in the titlebar padding doesn't move the popup
    jQ('.' + _cmdDivId).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + _cmdDivId).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');

    jQ(document).off('click.cmd-start').on('click.cmd-start',   '#cmd-start',       _cmdStartRefresh);
    jQ(document).off('click.cmd-stop').on('click.cmd-stop',     '#cmd-stop',        _cmdStopRefresh);
    jQ(document).off('click.cmd-ref').on('click.cmd-ref', '#cmd-refresh-btn', async function() {
        var $i = jQ(this).find('i'); $i.addClass('spin');
        try { if (_CMD.loadAll) await _CMD.loadAll(); } catch(e) {}
        $i.removeClass('spin');
    });
    jQ(document).off('click.cmd-crude-acc-reload').on('click.cmd-crude-acc-reload', '#cmd-crude-acc-reload', function() { _cmdLoadCrudeAcc(); });
    jQ(document).off('change.cmd-iv').on('change.cmd-iv', '#cmd-interval', function() {
        _CMD.intervalMs = parseInt(jQ(this).val());
        if (_CMD.running) { _cmdStopRefresh(); _cmdStartRefresh(); }
    });

    _CMD.loadAll = _cmdLoadAll;
    _cmdUpdateStatus();

    // Render static meta immediately (no async needed)
    _cmdRenderCrudeMeta();
    _cmdRenderSessionAlert();

    // Session alert refreshes every minute so countdown stays live
    var _cmdSessionTimer = setInterval(function() {
        if (!document.getElementById('cmd-crude-session')) { clearInterval(_cmdSessionTimer); return; }
        _cmdRenderSessionAlert();
    }, 60000);

    setTimeout(_cmdLoadAll, 80);
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

jQ(document).on('click', '.gtb-fut-refresh-btn', async function () {
    let name = jQ(this).data('name');
    let $btn = jQ(this);
    $btn.prop('disabled', true);
    $btn.find('i').addClass('spin');
    try {
        let res = _gtbIsMcxFuture(name)
            ? await showFutureDetailsMCX(name)
            : await showFutureDetails(name);
        if (res) setFutureDetails(name, res);
    } catch(e) { console.log('fut refresh', e); }
    $btn.find('i').removeClass('spin');
    $btn.prop('disabled', false);
});

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
    // Tear down previous chart instance so its ResizeObserver doesn't fire on the new one
    if (container._lwRO)    { try { container._lwRO.disconnect(); } catch(e) {} container._lwRO = null; }
    if (container._lwChart) { try { container._lwChart.remove();  } catch(e) {} container._lwChart = null; }
    container.innerHTML = '';
    container.style.position = 'relative';

    var _lwc    = (typeof _gtbChartColors === 'function') ? _gtbChartColors() : { bg:'#060a12', grid:'#122038', bdr:'#1b2d47', text:'#5c7499' };
    var _lwGrid = _lwc.grid;
    var _lwBdr  = _lwc.bdr;
    var _lwText = _lwc.text;

    // When no explicit height is given, fill the container (row cells are short)
    var _chH = chartHeight || container.clientHeight || 150;
    let chart = LightweightCharts.createChart(container, {
        width: container.clientWidth || 300,
        height: _chH,
        layout: { background: { color: 'transparent' }, textColor: _lwText },
        grid: { vertLines: { color: _lwGrid }, horzLines: { color: _lwGrid } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        rightPriceScale: { borderColor: _lwBdr, visible: !(opts && (opts.hideYAxis || (opts.hideLegend && !chartHeight))), scaleMargins: { top: 0.05, bottom: 0.05 }, minimumWidth: 52 },
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
    container._lwRO    = ro;
    return chart;
}

function _buildATRBadges(ltp, name, candles, suffix) {
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
        let slDivId = '#' + tempName + '-atr-sl' + (suffix || '');
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
async function showTopChart(name, bindtoDivId, chartHeight, idSuffix) {
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

        // Derive ID suffix for side-effect DOM writes so they land in the right
        // elements regardless of which panel is calling (main, stock viewer, maximize).
        // e.g. 'NIFTY-50-chart'              → _sfx = ''
        //      'NIFTY-50-chart-stock-viewer'  → _sfx = '-stock-viewer'
        //      'max-NIFTY-50-chart'           → _sfx = '' (update main panel elements)
        var _sfx = idSuffix !== undefined ? idSuffix
                 : containerId.startsWith('max-') ? '' : containerId.replace(tempName + '-chart', '');

        let _chartCandles = _gtbTrimCandles(data.data.candles);
        // No explicit height → let _renderLWChart fill the row cell via clientHeight
        _renderLWChart(containerId, _chartCandles, refLines, chartHeight, { hideLegend: true });

        // Populate levels strip
        var _lMeta = { OPEN:{s:'O',c:'#ffbe0b'}, VIXU:{s:'V↑',c:'#38bdf8'}, VIXL:{s:'V↓',c:'#38bdf8'},
                       AST:{s:'A+',c:'#3fb950'}, ASO:{s:'A',c:'#3fb950'}, BSO:{s:'B',c:'#f85149'}, BST:{s:'B-',c:'#f85149'} };
        var _fmt = function(v) { v=parseFloat(v); return v>=1000?v.toLocaleString('en-IN',{maximumFractionDigits:1}):v.toFixed(1); };
        var _levelsHtml = refLines.map(function(rl) {
            var m = _lMeta[rl.key] || {s:rl.key,c:'#7d8590'};
            return '<span style="display:inline-flex;align-items:center;gap:2px;white-space:nowrap;">'
                + '<span style="font-size:0.58rem;font-weight:700;color:'+m.c+';letter-spacing:0.02em;">'+m.s+'</span>'
                + '<span style="font-size:0.58rem;color:var(--gtb-muted);">'+_fmt(rl.value)+'</span></span>';
        }).join('<span style="color:#30363d;font-size:0.5rem;padding:0 2px;">·</span>');

        // Row header strip — suffix-aware (main panel: no suffix, stock viewer: -stock-viewer)
        var _levelsRow = document.getElementById(tempName + '-chart-levels' + _sfx);
        if (_levelsRow) _levelsRow.innerHTML = _levelsHtml;

        // Maximize overlay strip (only when called from maximizeChart)
        if (containerId.startsWith('max-')) {
            var _maxLevels = document.getElementById(containerId + '-levels');
            if (_maxLevels) _maxLevels.innerHTML = _levelsHtml;
        }

        // Custom container (e.g. commodities popup '#cmd-gift-chart') — derive sibling levels div
        if (_sfx && _sfx !== '' && !containerId.startsWith('max-')) {
            var _siblingLevels = document.getElementById(containerId.replace('#', '').replace('-chart', '-levels'));
            if (_siblingLevels) _siblingLevels.innerHTML = _levelsHtml;
            // Also keep the main panel div in sync
            var _mainLevels = document.getElementById(tempName + '-chart-levels');
            if (_mainLevels) _mainLevels.innerHTML = _levelsHtml;
        }

        if (!_chartCandles.length) { console.warn('showTopChart: no candles for', name); return; }
        let ltp = _chartCandles[_chartCandles.length - 1][4];
        if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
        INSTRUMENT_SCORE_MAP[name].open = parseFloat(ltp);
        jQ('#' + tempName + '-ltp' + _sfx).html(parseFloat(ltp).toLocaleString('en-IN'));
        _buildATRBadges(ltp, name, _chartCandles, _sfx);

        // 9:15 breakout badge + detail
        try {
            let b915 = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN")) || {};
            let b9   = b915[name] || {};
            let close915 = b9.CLOSE_9_15;
            if (close915) {
                let isBull = (close915 === 'ASO' || close915 === 'AST');
                let isBear = (close915 === 'BSO' || close915 === 'BST');
                let cls = isBull ? 'gtb-915-bull' : isBear ? 'gtb-915-bear' : 'gtb-915-neutral';
                jQ('#' + tempName + '-915-badge' + _sfx).html('<span class="' + cls + '">' + close915 + '</span>');
                // Populate detail row in card panel
                let detailHtml = '<span class="' + cls + '" style="font-weight:700;">' + close915 + '</span>';
                if (b9.close) detailHtml += ' <span style="color:var(--gtb-muted);">close: ' + parseFloat(b9.close).toFixed(2) + '</span>';
                jQ('#' + tempName + '-915-detail' + _sfx).html(detailHtml);
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

    var sMP = (NIFTY_50_MAX_PAIN_SCORE  || 0)
            + (NIFTY_BANK_MAX_PAIN_SCORE|| 0)
            + (RELIANCE_MAX_PAIN_SCORE  || 0)
            + (HDFCBANK_MAX_PAIN_SCORE  || 0)
            + (ICICIBANK_MAX_PAIN_SCORE || 0);

    var sIV = (NIFTY_50_IV_SKEW_SCORE  || 0)
            + (NIFTY_BANK_IV_SKEW_SCORE|| 0)
            + (RELIANCE_IV_SKEW_SCORE  || 0)
            + (HDFCBANK_IV_SKEW_SCORE  || 0)
            + (ICICIBANK_IV_SKEW_SCORE || 0);

    var sCOMP = (NIFTY_50_COMPONENT_SCORE  || 0)
              + (NIFTY_BANK_COMPONENT_SCORE || 0);

    var total = parseFloat((s915 + sAD + sFT + sOI + sMP + sIV + sCOMP).toFixed(2));

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
          + '  <span style="font-size:0.55rem;color:var(--gtb-muted);">confidence ' + confPct + '%</span>'
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
                    value: { show: true, fontSize: (String((value > 0 ? '+' : '') + value).length > 5 ? '14px' : String((value > 0 ? '+' : '') + value).length > 4 ? '17px' : '22px'), fontWeight: 900, color: color, offsetY: 8,
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

function showOIOBVBarChart(name, suffix, _oiDataOverride) {
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

    // When called from the bar-width slider, _oiDataOverride carries the per-instrument
    // cached data so we never read the shared stock[0] global (which only holds the last fetch).
    let oiData = _oiDataOverride || stock[0]['DATA']
    let data = oiData['tableData']

    // Cache per-instrument so maximize can re-render without re-fetching
    if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
    INSTRUMENT_SCORE_MAP[name].oiData = oiData;
    _gtbComputeOIExtras(name, oiData);


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
        // Fixed logical coordinate space — SVG scales via width="100%" so bars always
        // fill the container regardless of when clientWidth is read or column width.
        let W = 300, H = 56;
        let n = seriesList[0].values.length;
        if (!n) { el.innerHTML = '<span style="color:#7d8590;font-size:0.5rem;padding:2px;">no data</span>'; return; }
        let maxV = 0;
        seriesList.forEach(function(s) { s.values.forEach(function(v) { let a = Math.abs(+v||0); if (a>maxV) maxV=a; }); });
        if (!maxV) maxV = 1;
        let barWPct = parseInt(localStorage.getItem('GTB_OI_BAR_W') || '60') / 100;
        let ns = seriesList.length;
        let slotW = W / n;
        let gap = 0.5;                                          // gap between bars in a group
        let barW = Math.max(1, (slotW * barWPct - gap * (ns - 1)) / ns);
        let groupW = barW * ns + gap * (ns - 1);               // total group width
        let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" xmlns="http://www.w3.org/2000/svg" style="display:block;" preserveAspectRatio="none">';
        let midY = H / 2;
        svg += '<line x1="0" y1="' + midY + '" x2="' + W + '" y2="' + midY + '" stroke="#30363d" stroke-width="0.5"/>';
        for (let i = 0; i < n; i++) {
            let slotCx = i * slotW + slotW / 2;                // center of this slot
            let groupX = slotCx - groupW / 2;                  // center bars in slot
            if (i === atmIdx) svg += '<rect x="' + (i * slotW) + '" y="0" width="' + slotW + '" height="' + H + '" fill="#fbbf2418" rx="1"/>';
            seriesList.forEach(function(s, si) {
                let v = +s.values[i] || 0;
                let bh = Math.max(1, Math.abs(v) / maxV * (midY - 2));
                let by = v >= 0 ? midY - bh : midY;
                let bx = groupX + si * (barW + gap);
                svg += '<rect x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + bh + '" fill="' + s.color + '" opacity="0.85" rx="0.5"/>';
            });
            if (i === atmIdx) svg += '<text x="' + slotCx + '" y="' + (H - 1) + '" text-anchor="middle" font-size="5" fill="#fbbf24">▲</text>';
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
        let axEl = document.getElementById(tempName + '-oiobv-xaxis' + suffix);
        if (!axEl || !strikes.length) return;
        // Same logical W=300 as _svgMiniBar so strike labels align with bars above
        let W = 300, n = strikes.length, slotW = W / n;
        let svg = '<svg viewBox="0 0 ' + W + ' 14" width="100%" height="14" xmlns="http://www.w3.org/2000/svg" style="display:block;" preserveAspectRatio="none">';
        for (let i = 0; i < n; i++) {
            let cx = i * slotW + slotW / 2;
            let lbl = String(strikes[i]);
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
        signalRowHtml += '<div style="flex:1;min-width:70px;text-align:center;border:' + border + ';border-radius:5px;padding:3px 2px;background:var(--gtb-bg,#161b22);">';
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
    // Daily blended VWAP (today+yesterday) — used for conflict detection with intraday AVWAP
    var _dailyVwapNum = parseFloat(((
        ((parseFloat(dailyCandle.high) + parseFloat(dailyCandle.low) + parseFloat(dailyCandle.close)) / 3) * parseFloat(dailyCandle.volume) +
        ((parseFloat(prevDayCandle.high) + parseFloat(prevDayCandle.low) + parseFloat(prevDayCandle.close)) / 3) * parseFloat(prevDayCandle.volume)
      ) / (parseFloat(dailyCandle.volume) + parseFloat(prevDayCandle.volume))).toFixed(2)) || 0;
    resp['vwapBullishDaily'] = _dailyVwapNum > 0 && parseFloat(dailyCandle.close) >= _dailyVwapNum;
    resp['vwapPrice'] = intradayCandles.length > 1
        ? computeIntradayVwap(intradayCandles)
        : _dailyVwapNum;
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
                "data": "TRADINGSYMBOL", "title": "Symbol",
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
            { "data": "PRICE", "title": "Price" },
            { "data": "OPEN_PERC", "title": "Open%" },
            { "data": "PERC", "title": "Chg%" },
            {
                "data": "LTP", "title": "LTP",
                render: function (data, type, row, meta) {
                    if (type !== 'display') return parseFloat(data) || data;
                    return data;
                }
            },
            {
                "data": "SCORE", "title": "Score",
                render: function (data, type, row, meta) {
                    if (type !== 'display') return parseFloat(jQ(data).text()) || 0;
                    return data;
                }
            },
            {
                "data": "CLOSE_9_15", "title": "9:15",
                render: function (data, type, row, meta) {
                    if (!data || data === '') return '';
                    let bg = (data === 'AST' || data === 'ASO') ? 'bg-success' : (data === 'BST' || data === 'BSO') ? 'bg-danger' : 'bg-secondary';
                    return '<span class="badge ' + bg + '">' + data + '</span>';
                }
            },
            {
                "data": "FUTURE_TREND", "title": "Fut",
                render: function (data, type, row, meta) {
                    if (type !== 'display') return data || '';
                    return data || '';
                }
            },
            { "data": "VOLUME", "title": "Volume" },
            { "data": "TREND", "title": "Trend" },
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

// ── Pre-Trade Checklist popup ────────────────────────────────────────────────
// Builds checklist HTML from live global score vars — shared by popup and inline pane.
function _gtbBuildChecklistHtml() {
    var b9 = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}');
    var vix = 0;
    try { vix = parseFloat((JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}')['INDIA VIX'] || {}).ltp) || 0; } catch(e) {}

    var SCORE = parseFloat((
        (ALL_9_15_CLOSE_SCORE || 0) +
        (NIFTY_50_9_15_CLOSE_SCORE || 0) +
        (NIFTY_BANK_9_15_CLOSE_SCORE || 0) +
        (GIFT_NIFTY_9_15_CLOSE_SCORE || 0) +
        (SENSEX_9_15_CLOSE_SCORE || 0) +
        (RELIANCE_9_15_CLOSE_SCORE || 0) +
        (HDFCBANK_9_15_CLOSE_SCORE || 0) +
        (ALL_ADVANCE_DECLINE_SCORE || 0) +
        (NIFTY_50_ADVANCE_DECLINE_SCORE || 0) +
        (NIFTY_BANK_ADVANCE_DECLINE_SCORE || 0) +
        (ALL_FUTURES_TREND_SCORE || 0) +
        (NIFTY_50_FUTURES_TREND_SCORE || 0) +
        (NIFTY_BANK_FUTURES_TREND_SCORE || 0) +
        (NIFTY_50_OI_OBV_SCORE || 0) +
        (NIFTY_BANK_OI_OBV_SCORE || 0) +
        (RELIANCE_OI_OBV_SCORE || 0) +
        (HDFCBANK_OI_OBV_SCORE || 0) +
        (ICICIBANK_OI_OBV_SCORE || 0) +
        (NIFTY_50_MAX_PAIN_SCORE || 0) +
        (NIFTY_BANK_MAX_PAIN_SCORE || 0) +
        (RELIANCE_MAX_PAIN_SCORE || 0) +
        (HDFCBANK_MAX_PAIN_SCORE || 0) +
        (ICICIBANK_MAX_PAIN_SCORE || 0) +
        (NIFTY_50_IV_SKEW_SCORE || 0) +
        (NIFTY_BANK_IV_SKEW_SCORE || 0) +
        (RELIANCE_IV_SKEW_SCORE || 0) +
        (HDFCBANK_IV_SKEW_SCORE || 0) +
        (ICICIBANK_IV_SKEW_SCORE || 0) +
        (NIFTY_50_COMPONENT_SCORE || 0) +
        (NIFTY_BANK_COMPONENT_SCORE || 0)
    ).toFixed(2));

    var ms = getMarketSignal(SCORE, b9);
    var sig = ms.signal;
    var sigColor = (sig === 'STRONG BUY' || sig === 'BUY') ? '#3fb950'
                 : (sig === 'STRONG SELL' || sig === 'SELL') ? '#f85149' : '#fbbf24';

    var tradeRec = sig === 'STRONG BUY'  ? 'Buy NIFTY CE (ATM or ASO strike). Sell PE spread for premium.'
                 : sig === 'BUY'         ? 'Buy NIFTY CE at pullback to ASO/BSO level.'
                 : sig === 'SELL'        ? 'Buy NIFTY PE at rally to ASO/AST level.'
                 : sig === 'STRONG SELL' ? 'Buy NIFTY PE (ATM or BSO strike). Sell CE spread for premium.'
                 : sig === 'NO TRADE'    ? 'Wait. VIX boundary hit — daily range likely exhausted.'
                 :                        'Avoid directional trade. Range between BSO–ASO. Consider Iron Condor.';

    function _scoreColor(v) { return v > 0 ? 'var(--gtb-green)' : v < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)'; }
    function _icon(v) { return v > 0 ? '▲' : v < 0 ? '▼' : '—'; }
    function _915label(name) {
        var c = (b9[name] || {})['CLOSE_9_15'] || '—';
        var col = (c === 'AST' || c === 'ASO') ? 'var(--gtb-green)' : (c === 'BST' || c === 'BSO') ? 'var(--gtb-red)' : 'var(--gtb-muted)';
        return '<span style="color:' + col + ';font-weight:700;">' + c + '</span>';
    }

    var vixLabel = vix <= 0 ? { txt: '—', col: 'var(--gtb-muted)' }
                 : vix < 13 ? { txt: 'LOW', col: 'var(--gtb-green)' }
                 : vix < 18 ? { txt: 'NORMAL', col: 'var(--gtb-amber)' }
                 : vix < 25 ? { txt: 'ELEVATED', col: 'var(--gtb-amber)' }
                 :            { txt: 'HIGH', col: 'var(--gtb-red)' };
    var vixRisk = vix >= 25 ? 'Reduce size, widen SL.' : vix >= 18 ? 'Use wider SL.' : vix > 0 ? 'Normal conditions.' : '';

    function _row(label, val, color, sub) {
        return '<div style="display:flex;align-items:baseline;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--gtb-border);">'
            + '<span style="font-size:0.65rem;color:var(--gtb-muted);">' + label + '</span>'
            + '<span style="font-size:0.7rem;font-weight:700;color:' + (color || 'var(--gtb-text)') + ';">'
            + val + (sub ? '<span style="font-size:0.58rem;font-weight:400;color:var(--gtb-muted);margin-left:4px;">' + sub + '</span>' : '')
            + '</span></div>';
    }

    function _step(n, title, ok) {
        var dot = ok === true ? 'var(--gtb-green)' : ok === false ? 'var(--gtb-red)' : 'var(--gtb-amber)';
        return '<div style="display:flex;align-items:flex-start;gap:7px;padding:5px 0;border-bottom:1px solid var(--gtb-border);">'
            + '<span style="flex-shrink:0;width:16px;height:16px;border-radius:50%;background:var(--gtb-surface2);border:1.5px solid ' + dot + ';display:flex;align-items:center;justify-content:center;font-size:0.52rem;font-weight:800;color:' + dot + ';margin-top:1px;">' + n + '</span>'
            + '<div style="flex:1;">' + title + '</div></div>';
    }

    var vixOk = vix <= 0 ? null : vix < 18;
    var b9ok  = ((NIFTY_50_9_15_CLOSE_SCORE || 0) + (NIFTY_BANK_9_15_CLOSE_SCORE || 0)) > 0 ? true
              : ((NIFTY_50_9_15_CLOSE_SCORE || 0) + (NIFTY_BANK_9_15_CLOSE_SCORE || 0)) < 0 ? false : null;
    var adOk  = (ALL_ADVANCE_DECLINE_SCORE || 0) > 0 ? true : (ALL_ADVANCE_DECLINE_SCORE || 0) < 0 ? false : null;
    var futOk = (ALL_FUTURES_TREND_SCORE || 0) > 0 ? true : (ALL_FUTURES_TREND_SCORE || 0) < 0 ? false : null;
    var oiOk  = ((NIFTY_50_OI_OBV_SCORE || 0) + (NIFTY_BANK_OI_OBV_SCORE || 0)) > 0 ? true
              : ((NIFTY_50_OI_OBV_SCORE || 0) + (NIFTY_BANK_OI_OBV_SCORE || 0)) < 0 ? false : null;
    var scoreOk = SCORE >= 6 ? true : SCORE < 0 ? false : null;
    var scCol = SCORE >= 8 ? 'var(--gtb-green)' : SCORE >= 5 ? 'var(--gtb-amber)' : SCORE >= 1 ? 'var(--gtb-amber)' : 'var(--gtb-red)';

    var _mpN50  = NIFTY_50_MAX_PAIN_SCORE  || 0;
    var _mpBNK  = NIFTY_BANK_MAX_PAIN_SCORE|| 0;
    var _mpREL  = RELIANCE_MAX_PAIN_SCORE  || 0;
    var _mpHDFC = HDFCBANK_MAX_PAIN_SCORE  || 0;
    var _mpICICI= ICICIBANK_MAX_PAIN_SCORE || 0;
    var _ivN50  = NIFTY_50_IV_SKEW_SCORE   || 0;
    var _ivBNK  = NIFTY_BANK_IV_SKEW_SCORE || 0;
    var _ivREL  = RELIANCE_IV_SKEW_SCORE   || 0;
    var _ivHDFC = HDFCBANK_IV_SKEW_SCORE   || 0;
    var _ivICICI= ICICIBANK_IV_SKEW_SCORE  || 0;
    var _mpIVSum = _mpN50 + _mpBNK + _mpREL + _mpHDFC + _mpICICI + _ivN50 + _ivBNK + _ivREL + _ivHDFC + _ivICICI;
    var _mpIVOk = _mpIVSum > 0 ? true : _mpIVSum < 0 ? false : null;
    var _mpLabel = function(v) { return v > 0 ? '↑ Above' : v < 0 ? '↓ Below' : '≈ Pin'; };
    var _ivLabel = function(v) { return v > 0 ? '↑ Call' : v < 0 ? '↓ Put' : '≈'; };

    var h = '<div style="padding:12px;font-family:inherit;color:var(--gtb-text);background:var(--gtb-bg);">';

    h += '<div style="font-size:0.6rem;font-weight:800;letter-spacing:0.08em;color:var(--gtb-muted);margin-bottom:6px;">A · MARKET CHECKLIST</div>';

    h += _step(1,
        '<div style="font-size:0.65rem;font-weight:700;">VIX Regime</div>'
        + '<div style="font-size:0.62rem;margin-top:2px;display:flex;gap:8px;">'
        + _row('India VIX', (vix > 0 ? vix.toFixed(2) : '—') + ' <span style="font-size:0.6rem;font-weight:700;color:' + vixLabel.col + ';">(' + vixLabel.txt + ')</span>', null, vixRisk)
        + '</div>', vixOk);

    h += _step(2,
        '<div style="font-size:0.65rem;font-weight:700;">9:15 Opening Candle</div>'
        + '<div style="font-size:0.62rem;margin-top:2px;display:grid;grid-template-columns:1fr 1fr;gap:1px 10px;">'
        + _row('NIFTY 50', _icon(NIFTY_50_9_15_CLOSE_SCORE) + ' ' + _915label('NIFTY 50'), _scoreColor(NIFTY_50_9_15_CLOSE_SCORE))
        + _row('NIFTY BANK', _icon(NIFTY_BANK_9_15_CLOSE_SCORE) + ' ' + _915label('NIFTY BANK'), _scoreColor(NIFTY_BANK_9_15_CLOSE_SCORE))
        + _row('SENSEX', _icon(SENSEX_9_15_CLOSE_SCORE) + ' ' + _915label('SENSEX'), _scoreColor(SENSEX_9_15_CLOSE_SCORE))
        + _row('GIFT NIFTY', _icon(GIFT_NIFTY_9_15_CLOSE_SCORE) + ' ' + _915label('GIFT NIFTY'), _scoreColor(GIFT_NIFTY_9_15_CLOSE_SCORE))
        + '</div>', b9ok);

    h += _step(3,
        '<div style="font-size:0.65rem;font-weight:700;">Advance / Decline</div>'
        + '<div style="font-size:0.62rem;margin-top:2px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px 10px;">'
        + _row('All F&amp;O', _icon(ALL_ADVANCE_DECLINE_SCORE) + ' ' + (ALL_ADVANCE_DECLINE_SCORE > 0 ? 'Bullish' : ALL_ADVANCE_DECLINE_SCORE < 0 ? 'Bearish' : 'Neutral'), _scoreColor(ALL_ADVANCE_DECLINE_SCORE))
        + _row('NIFTY 50', _icon(NIFTY_50_ADVANCE_DECLINE_SCORE) + ' ' + (NIFTY_50_ADVANCE_DECLINE_SCORE > 0 ? 'Bull' : NIFTY_50_ADVANCE_DECLINE_SCORE < 0 ? 'Bear' : 'Neutral'), _scoreColor(NIFTY_50_ADVANCE_DECLINE_SCORE))
        + _row('BANK', _icon(NIFTY_BANK_ADVANCE_DECLINE_SCORE) + ' ' + (NIFTY_BANK_ADVANCE_DECLINE_SCORE > 0 ? 'Bull' : NIFTY_BANK_ADVANCE_DECLINE_SCORE < 0 ? 'Bear' : 'Neutral'), _scoreColor(NIFTY_BANK_ADVANCE_DECLINE_SCORE))
        + '</div>', adOk);

    h += _step(4,
        '<div style="font-size:0.65rem;font-weight:700;">Futures Trend</div>'
        + '<div style="font-size:0.62rem;margin-top:2px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px 10px;">'
        + _row('All F&amp;O', _icon(ALL_FUTURES_TREND_SCORE) + ' ' + (ALL_FUTURES_TREND_SCORE > 0 ? 'Bulls' : ALL_FUTURES_TREND_SCORE < 0 ? 'Bears' : 'Neutral'), _scoreColor(ALL_FUTURES_TREND_SCORE))
        + _row('NIFTY 50', _icon(NIFTY_50_FUTURES_TREND_SCORE) + ' ' + (NIFTY_50_FUTURES_TREND_SCORE > 0 ? 'Long' : NIFTY_50_FUTURES_TREND_SCORE < 0 ? 'Short' : 'Neutral'), _scoreColor(NIFTY_50_FUTURES_TREND_SCORE))
        + _row('BANK', _icon(NIFTY_BANK_FUTURES_TREND_SCORE) + ' ' + (NIFTY_BANK_FUTURES_TREND_SCORE > 0 ? 'Long' : NIFTY_BANK_FUTURES_TREND_SCORE < 0 ? 'Short' : 'Neutral'), _scoreColor(NIFTY_BANK_FUTURES_TREND_SCORE))
        + '</div>', futOk);

    h += _step(5,
        '<div style="font-size:0.65rem;font-weight:700;">OI / OBV Score</div>'
        + '<div style="font-size:0.62rem;margin-top:2px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px 10px;">'
        + _row('NIFTY 50',   (NIFTY_50_OI_OBV_SCORE > 0 ? '+' : '') + NIFTY_50_OI_OBV_SCORE,   _scoreColor(NIFTY_50_OI_OBV_SCORE))
        + _row('BANK NIFTY', (NIFTY_BANK_OI_OBV_SCORE > 0 ? '+' : '') + NIFTY_BANK_OI_OBV_SCORE, _scoreColor(NIFTY_BANK_OI_OBV_SCORE))
        + _row('RELIANCE',   (RELIANCE_OI_OBV_SCORE > 0 ? '+' : '') + RELIANCE_OI_OBV_SCORE,   _scoreColor(RELIANCE_OI_OBV_SCORE))
        + _row('HDFCBANK',   (HDFCBANK_OI_OBV_SCORE > 0 ? '+' : '') + HDFCBANK_OI_OBV_SCORE,   _scoreColor(HDFCBANK_OI_OBV_SCORE))
        + _row('ICICIBANK',  (ICICIBANK_OI_OBV_SCORE > 0 ? '+' : '') + ICICIBANK_OI_OBV_SCORE,  _scoreColor(ICICIBANK_OI_OBV_SCORE))
        + '</div>', oiOk);

    h += _step(6,
        '<div style="font-size:0.65rem;font-weight:700;">Max Pain + IV Skew</div>'
        + '<div style="font-size:0.55rem;margin-top:2px;display:grid;grid-template-columns:repeat(5,1fr);gap:1px 6px;">'
        + '<span style="color:var(--gtb-muted);grid-column:1/-1;font-size:0.45rem;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:1px;">Max Pain</span>'
        + _row('N50', (_mpN50>0?'+':'') + _mpN50 + ' ' + _mpLabel(_mpN50), _scoreColor(_mpN50))
        + _row('BANK', (_mpBNK>0?'+':'') + _mpBNK + ' ' + _mpLabel(_mpBNK), _scoreColor(_mpBNK))
        + _row('REL', (_mpREL>0?'+':'') + _mpREL + ' ' + _mpLabel(_mpREL), _scoreColor(_mpREL))
        + _row('HDFC', (_mpHDFC>0?'+':'') + _mpHDFC + ' ' + _mpLabel(_mpHDFC), _scoreColor(_mpHDFC))
        + _row('ICICI', (_mpICICI>0?'+':'') + _mpICICI + ' ' + _mpLabel(_mpICICI), _scoreColor(_mpICICI))
        + '<span style="color:var(--gtb-muted);grid-column:1/-1;font-size:0.45rem;text-transform:uppercase;letter-spacing:0.05em;margin-top:3px;margin-bottom:1px;">IV Skew</span>'
        + _row('N50', (_ivN50>0?'+':'') + _ivN50 + ' ' + _ivLabel(_ivN50), _scoreColor(_ivN50))
        + _row('BANK', (_ivBNK>0?'+':'') + _ivBNK + ' ' + _ivLabel(_ivBNK), _scoreColor(_ivBNK))
        + _row('REL', (_ivREL>0?'+':'') + _ivREL + ' ' + _ivLabel(_ivREL), _scoreColor(_ivREL))
        + _row('HDFC', (_ivHDFC>0?'+':'') + _ivHDFC + ' ' + _ivLabel(_ivHDFC), _scoreColor(_ivHDFC))
        + _row('ICICI', (_ivICICI>0?'+':'') + _ivICICI + ' ' + _ivLabel(_ivICICI), _scoreColor(_ivICICI))
        + '</div>', _mpIVOk);

    h += _step(7,
        '<div style="font-size:0.65rem;font-weight:700;">Component Score</div>'
        + '<div style="font-size:0.62rem;margin-top:2px;display:grid;grid-template-columns:1fr 1fr;gap:1px 10px;">'
        + _row('NIFTY 50 Weighted', (NIFTY_50_COMPONENT_SCORE > 0 ? '+' : '') + NIFTY_50_COMPONENT_SCORE.toFixed(2), _scoreColor(NIFTY_50_COMPONENT_SCORE))
        + _row('BANK NIFTY Weighted', (NIFTY_BANK_COMPONENT_SCORE > 0 ? '+' : '') + NIFTY_BANK_COMPONENT_SCORE.toFixed(2), _scoreColor(NIFTY_BANK_COMPONENT_SCORE))
        + '</div>',
        ((NIFTY_50_COMPONENT_SCORE + NIFTY_BANK_COMPONENT_SCORE) > 0 ? true : (NIFTY_50_COMPONENT_SCORE + NIFTY_BANK_COMPONENT_SCORE) < 0 ? false : null));

    h += _step(8,
        '<div style="font-size:0.65rem;font-weight:700;">Composite Score</div>'
        + '<div style="display:flex;align-items:center;gap:8px;margin-top:3px;">'
        + '<span style="font-size:1.1rem;font-weight:900;color:' + scCol + ';">' + (SCORE > 0 ? '+' : '') + SCORE + '</span>'
        + '<span style="font-size:0.62rem;color:var(--gtb-muted);">out of ~44 max (green ≥ 8, yellow 5–7, orange 1–4, red &lt; 0)</span>'
        + '</div>', scoreOk);

    // Section B: Trade Recommendation
    h += '<div style="margin-top:12px;padding:10px 12px;background:' + sigColor + '0f;border:1px solid ' + sigColor + '44;">';
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
    h += '<span style="font-size:0.85rem;font-weight:900;color:' + sigColor + ';">' + sig + '</span>';
    h += '</div>';
    h += '<div style="font-size:0.65rem;color:var(--gtb-muted);margin-bottom:6px;">' + ms.reason + '</div>';
    h += '<div style="font-size:0.7rem;font-weight:700;color:' + sigColor + ';line-height:1.5;">' + tradeRec + '</div>';
    h += '</div>';

    // Section C: Per-Instrument table
    var instList = ['GIFT NIFTY','NIFTY 50','NIFTY BANK','SENSEX','RELIANCE','HDFCBANK','ICICIBANK','CRUDEOILM','USDINR'];
    h += '<div style="font-size:0.6rem;font-weight:800;letter-spacing:0.08em;color:var(--gtb-muted);margin:14px 0 6px;">C · INSTRUMENT SCORES</div>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:0.62rem;">';
    h += '<thead><tr style="background:var(--gtb-surface2);">';
    ['Instrument','9:15','Trend','Fut','OI/OBV','MP','IV','Total','Action'].forEach(function(lbl, i) {
        h += '<th style="text-align:' + (i===0||i===8?'left':'center') + ';padding:4px ' + (i===0||i===8?'6':'4') + 'px;color:var(--gtb-muted);font-weight:600;border-bottom:1px solid var(--gtb-border);">' + lbl + '</th>';
    });
    h += '</tr></thead><tbody>';
    instList.forEach(function(name) {
        try {
            var sc = computeInstrumentScore(name);
            var tot = sc.total;
            var totCol = tot > 0 ? 'var(--gtb-green)' : tot < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
            var action = tot >= 4 ? { txt: 'BUY CE', col: 'var(--gtb-green)' }
                       : tot >= 2 ? { txt: 'CE (wait ASO)', col: 'var(--gtb-green)' }
                       : tot >=  0 ? { txt: 'WAIT', col: 'var(--gtb-amber)' }
                       : tot >= -3 ? { txt: 'PE (wait BSO)', col: 'var(--gtb-red)' }
                       :             { txt: 'BUY PE', col: 'var(--gtb-red)' };
            var rowBg = name === 'NIFTY 50' || name === 'NIFTY BANK' ? 'background:var(--gtb-surface2);' : '';
            var _c = function(v) { return v > 0 ? 'var(--gtb-green)' : v < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)'; };
            var _fmt = function(v) { return (v > 0 ? '+' : '') + v; };
            h += '<tr style="border-bottom:1px solid var(--gtb-border);' + rowBg + '">';
            h += '<td style="padding:4px 6px;font-weight:700;">' + name + '</td>';
            h += '<td style="text-align:center;padding:4px;color:' + _c(sc.nine_fifteen) + ';">' + _fmt(sc.nine_fifteen) + '</td>';
            h += '<td style="text-align:center;padding:4px;color:' + _c(sc.current_trend) + ';">' + _fmt(sc.current_trend) + '</td>';
            h += '<td style="text-align:center;padding:4px;color:' + _c(sc.futures_trend) + ';">' + _fmt(sc.futures_trend) + '</td>';
            h += '<td style="text-align:center;padding:4px;color:' + _c(sc.oi_obv) + ';">' + _fmt(sc.oi_obv) + '</td>';
            h += '<td style="text-align:center;padding:4px;color:' + _c(sc.max_pain||0) + ';">' + _fmt(sc.max_pain||0) + '</td>';
            h += '<td style="text-align:center;padding:4px;color:' + _c(sc.iv_skew||0) + ';">' + _fmt(sc.iv_skew||0) + '</td>';
            h += '<td style="text-align:center;padding:4px;font-weight:800;color:' + totCol + ';">' + _fmt(tot) + '</td>';
            h += '<td style="padding:4px 6px;font-size:0.6rem;font-weight:700;color:' + action.col + ';">' + action.txt + '</td>';
            h += '</tr>';
        } catch(e) {
            h += '<tr><td colspan="9" style="padding:4px 6px;color:var(--gtb-muted);">' + name + '</td></tr>';
        }
    });
    h += '</tbody></table>';
    h += '</div>';
    return h;
}

// Renders the checklist inline into #gtb-pane-checklist.
// ── Metrics tab ───────────────────────────────────────────────────────────────
function _gtbRenderMetricsPane() {
    var $pane = jQ('#gtb-pane-metrics');
    if (!$pane.length) return;

    var _includeLagging = localStorage.getItem('GTB_INCLUDE_LAGGING') !== '0';

    // Score vars
    var b9 = {};
    try { b9 = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}'); } catch(e) {}

    var SCORE = ALL_9_15_CLOSE_SCORE + NIFTY_50_9_15_CLOSE_SCORE + NIFTY_BANK_9_15_CLOSE_SCORE +
        GIFT_NIFTY_9_15_CLOSE_SCORE + SENSEX_9_15_CLOSE_SCORE + RELIANCE_9_15_CLOSE_SCORE + HDFCBANK_9_15_CLOSE_SCORE +
        ALL_ADVANCE_DECLINE_SCORE + NIFTY_50_ADVANCE_DECLINE_SCORE + NIFTY_BANK_ADVANCE_DECLINE_SCORE +
        ALL_FUTURES_TREND_SCORE + NIFTY_50_FUTURES_TREND_SCORE + NIFTY_BANK_FUTURES_TREND_SCORE +
        (_includeLagging ? (NIFTY_50_OI_OBV_SCORE + NIFTY_BANK_OI_OBV_SCORE + RELIANCE_OI_OBV_SCORE + HDFCBANK_OI_OBV_SCORE + ICICIBANK_OI_OBV_SCORE +
            NIFTY_50_MAX_PAIN_SCORE + NIFTY_BANK_MAX_PAIN_SCORE + RELIANCE_MAX_PAIN_SCORE + HDFCBANK_MAX_PAIN_SCORE + ICICIBANK_MAX_PAIN_SCORE +
            NIFTY_50_IV_SKEW_SCORE + NIFTY_BANK_IV_SKEW_SCORE + RELIANCE_IV_SKEW_SCORE + HDFCBANK_IV_SKEW_SCORE + ICICIBANK_IV_SKEW_SCORE +
            NIFTY_50_COMPONENT_SCORE + NIFTY_BANK_COMPONENT_SCORE) : 0);

    var ms = null;
    try { ms = getMarketSignal(parseFloat(SCORE.toFixed(2)), b9); } catch(e) {}

    var _s = function(v) { return (v > 0 ? '+' : '') + parseFloat(v).toFixed(2); };
    var _col = function(v) { return v > 0 ? 'var(--gtb-green)' : v < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)'; };
    var _bar = function(v, max) {
        max = max || 2;
        var pct = Math.min(Math.abs(v / max) * 100, 100);
        var col = v > 0 ? 'var(--gtb-green)' : v < 0 ? 'var(--gtb-red)' : 'var(--gtb-border)';
        var left = v >= 0 ? '50%' : (50 - pct/2) + '%';
        var width = pct/2 + '%';
        return '<div style="position:relative;height:4px;background:var(--gtb-border);margin-top:2px;">'
            + '<div style="position:absolute;top:0;left:' + left + ';width:' + width + ';height:100%;background:' + col + ';"></div>'
            + '<div style="position:absolute;top:0;left:50%;width:1px;height:100%;background:var(--gtb-muted);opacity:0.4;"></div>'
            + '</div>';
    };

    var _row = function(label, val, max, note) {
        var c = _col(val);
        return '<div style="display:grid;grid-template-columns:1fr auto;align-items:center;gap:4px;padding:4px 0;border-bottom:1px solid var(--gtb-border)18;">'
            + '<div>'
            +   '<div style="font-size:0.48rem;color:var(--gtb-muted);">' + label + (note ? ' <span style="color:var(--gtb-accent);font-size:0.42rem;">' + note + '</span>' : '') + '</div>'
            +   _bar(val, max)
            + '</div>'
            + '<div style="font-size:0.56rem;font-weight:800;font-family:var(--gtb-mono);color:' + c + ';text-align:right;min-width:36px;">' + _s(val) + '</div>'
            + '</div>';
    };

    var _section = function(title, icon, badge, content) {
        var bc = badge > 0 ? 'var(--gtb-green)' : badge < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
        return '<div style="background:var(--gtb-surface);margin:6px;padding:8px 10px;">'
            + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid var(--gtb-border);">'
            +   '<i class="bi ' + icon + '" style="color:var(--gtb-accent);font-size:0.6rem;"></i>'
            +   '<span style="font-size:0.52rem;font-weight:800;color:var(--gtb-text);">' + title + '</span>'
            +   '<span style="margin-left:auto;font-size:0.6rem;font-weight:900;font-family:var(--gtb-mono);color:' + bc + ';">' + _s(badge) + '</span>'
            + '</div>'
            + content
            + '</div>';
    };

    // Leading score
    var leadingScore = ALL_9_15_CLOSE_SCORE + NIFTY_50_9_15_CLOSE_SCORE + NIFTY_BANK_9_15_CLOSE_SCORE +
        GIFT_NIFTY_9_15_CLOSE_SCORE + SENSEX_9_15_CLOSE_SCORE + RELIANCE_9_15_CLOSE_SCORE + HDFCBANK_9_15_CLOSE_SCORE +
        ALL_ADVANCE_DECLINE_SCORE + NIFTY_50_ADVANCE_DECLINE_SCORE + NIFTY_BANK_ADVANCE_DECLINE_SCORE +
        ALL_FUTURES_TREND_SCORE + NIFTY_50_FUTURES_TREND_SCORE + NIFTY_BANK_FUTURES_TREND_SCORE;

    var laggingScore = NIFTY_50_OI_OBV_SCORE + NIFTY_BANK_OI_OBV_SCORE + RELIANCE_OI_OBV_SCORE + HDFCBANK_OI_OBV_SCORE + ICICIBANK_OI_OBV_SCORE +
        NIFTY_50_MAX_PAIN_SCORE + NIFTY_BANK_MAX_PAIN_SCORE + RELIANCE_MAX_PAIN_SCORE + HDFCBANK_MAX_PAIN_SCORE + ICICIBANK_MAX_PAIN_SCORE +
        NIFTY_50_IV_SKEW_SCORE + NIFTY_BANK_IV_SKEW_SCORE + RELIANCE_IV_SKEW_SCORE + HDFCBANK_IV_SKEW_SCORE + ICICIBANK_IV_SKEW_SCORE +
        NIFTY_50_COMPONENT_SCORE + NIFTY_BANK_COMPONENT_SCORE;

    var sigCol = ms ? (ms.color === 'sv-badge-green' ? 'var(--gtb-green)' : ms.color === 'sv-badge-red' ? 'var(--gtb-red)' : 'var(--gtb-amber)') : 'var(--gtb-muted)';

    // VIX value and regime
    var _vixVal = 0;
    try { _vixVal = parseFloat((JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}')['INDIA VIX'] || {}).ltp) || 0; } catch(e) {}
    var _vixLabel = '', _vixCol = 'var(--gtb-muted)';
    if (_vixVal) {
        if (_vixVal < 13)      { _vixLabel = 'LOW';      _vixCol = 'var(--gtb-green)'; }
        else if (_vixVal < 18) { _vixLabel = 'NORMAL';   _vixCol = 'var(--gtb-accent)'; }
        else if (_vixVal < 25) { _vixLabel = 'ELEVATED'; _vixCol = 'var(--gtb-amber)'; }
        else                   { _vixLabel = 'HIGH';     _vixCol = 'var(--gtb-red)'; }
    }

    var h = '<div style="display:flex;flex-direction:column;height:100%;overflow:hidden;">';

    // Header
    h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;border-bottom:1px solid var(--gtb-border);background:var(--gtb-surface);flex-shrink:0;">'
        + '<i class="bi bi-speedometer2" style="color:var(--gtb-accent);"></i>'
        + '<span style="font-size:0.55rem;font-weight:800;color:var(--gtb-muted);text-transform:uppercase;letter-spacing:0.08em;">METRICS DASHBOARD</span>'
        + (_vixVal ? '<span style="font-size:0.46rem;color:var(--gtb-muted);padding:1px 6px;border:1px solid ' + _vixCol + ';color:' + _vixCol + ';background:' + _vixCol + '18;"><i class="bi bi-activity"></i> VIX ' + _vixVal.toFixed(2) + ' · ' + _vixLabel + '</span>' : '')
        + '<div style="margin-left:auto;display:flex;align-items:center;gap:8px;">'
        +   '<span style="font-size:0.52rem;font-weight:900;color:' + sigCol + ';padding:2px 8px;border:1px solid ' + sigCol + ';background:' + sigCol + '18;">' + (ms ? ms.signal : '—') + '</span>'
        +   '<span style="font-size:0.48rem;color:var(--gtb-muted);">Score <b style="color:' + _col(SCORE) + ';">' + _s(SCORE) + '</b></span>'
        +   '<button id="gtb-metrics-refresh" style="background:transparent;border:1px solid var(--gtb-border);color:var(--gtb-muted);padding:2px 8px;font-size:0.46rem;cursor:pointer;"><i class="bi bi-arrow-clockwise"></i> Refresh</button>'
        + '</div>'
        + '</div>';

    h += '<div style="flex:1;overflow-y:auto;display:flex;flex-wrap:wrap;align-content:flex-start;gap:0;">';

    // ── Leading / Lagging summary bar ─────────────────────────────────────────
    h += '<div style="width:100%;margin:6px;padding:8px 10px;background:var(--gtb-surface);display:flex;gap:12px;align-items:center;">'
        + '<div style="flex:1;">'
        +   '<div style="font-size:0.44rem;color:var(--gtb-muted);margin-bottom:2px;">⚡ LEADING (9:15 + A/D + Futures)</div>'
        +   '<div style="font-size:0.72rem;font-weight:900;font-family:var(--gtb-mono);color:' + _col(leadingScore) + ';">' + _s(leadingScore) + '</div>'
        + '</div>'
        + '<div style="width:1px;background:var(--gtb-border);align-self:stretch;"></div>'
        + '<div style="flex:1;">'
        +   '<div style="font-size:0.44rem;color:var(--gtb-muted);margin-bottom:2px;">🐢 LAGGING (OI/OBV + MP + IV + Components)</div>'
        +   '<div style="font-size:0.72rem;font-weight:900;font-family:var(--gtb-mono);color:' + _col(laggingScore) + ';">' + (_includeLagging ? _s(laggingScore) : '<span style="color:var(--gtb-muted);font-size:0.5rem;">excluded</span>') + '</div>'
        + '</div>'
        + '<div style="width:1px;background:var(--gtb-border);align-self:stretch;"></div>'
        + '<div style="flex:1;">'
        +   '<div style="font-size:0.44rem;color:var(--gtb-muted);margin-bottom:2px;">∑ COMPOSITE</div>'
        +   '<div style="font-size:0.72rem;font-weight:900;font-family:var(--gtb-mono);color:' + _col(SCORE) + ';">' + _s(SCORE) + '</div>'
        + '</div>'
        + '</div>';

    // 2-column layout for sections
    h += '<div style="width:100%;display:grid;grid-template-columns:1fr 1fr;gap:0;">';

    // ── 9:15 Opening Candle ───────────────────────────────────────────────────
    var n915Score = ALL_9_15_CLOSE_SCORE + NIFTY_50_9_15_CLOSE_SCORE + NIFTY_BANK_9_15_CLOSE_SCORE +
        GIFT_NIFTY_9_15_CLOSE_SCORE + SENSEX_9_15_CLOSE_SCORE + RELIANCE_9_15_CLOSE_SCORE + HDFCBANK_9_15_CLOSE_SCORE;
    h += _section('9:15 OPENING CANDLE', 'bi-alarm', n915Score,
        _row('All F&O (weighted ratio)', ALL_9_15_CLOSE_SCORE, 1)
        + _row('NIFTY 50', NIFTY_50_9_15_CLOSE_SCORE, 2)
        + _row('NIFTY BANK', NIFTY_BANK_9_15_CLOSE_SCORE, 2)
        + _row('GIFT NIFTY', GIFT_NIFTY_9_15_CLOSE_SCORE, 2)
        + _row('SENSEX', SENSEX_9_15_CLOSE_SCORE, 2)
        + _row('RELIANCE', RELIANCE_9_15_CLOSE_SCORE, 2)
        + _row('HDFCBANK', HDFCBANK_9_15_CLOSE_SCORE, 2)
    );

    // ── Advance / Decline ─────────────────────────────────────────────────────
    var adScore = ALL_ADVANCE_DECLINE_SCORE + NIFTY_50_ADVANCE_DECLINE_SCORE + NIFTY_BANK_ADVANCE_DECLINE_SCORE;
    h += _section('ADVANCE / DECLINE', 'bi-graph-up-arrow', adScore,
        _row('All F&O', ALL_ADVANCE_DECLINE_SCORE, 1)
        + _row('NIFTY 50', NIFTY_50_ADVANCE_DECLINE_SCORE, 1)
        + _row('NIFTY BANK', NIFTY_BANK_ADVANCE_DECLINE_SCORE, 1)
    );

    // ── Futures Trend ─────────────────────────────────────────────────────────
    var futScore = ALL_FUTURES_TREND_SCORE + NIFTY_50_FUTURES_TREND_SCORE + NIFTY_BANK_FUTURES_TREND_SCORE;
    h += _section('FUTURES TREND', 'bi-flag-fill', futScore,
        _row('All F&O', ALL_FUTURES_TREND_SCORE, 1)
        + _row('NIFTY 50', NIFTY_50_FUTURES_TREND_SCORE, 1)
        + _row('NIFTY BANK', NIFTY_BANK_FUTURES_TREND_SCORE, 1)
    );

    // ── LTP Zone (current_trend) ──────────────────────────────────────────────
    var _zoneLabel = function(v) {
        if (v >= 2)  return 'AST';
        if (v >= 1)  return 'ASO';
        if (v > 0)   return 'Above';
        if (v === 0) return 'Neutral';
        if (v >= -1) return 'BSO';
        if (v >= -2) return 'BST';
        return 'Below';
    };
    var _zoneRow = function(name) {
        var sc2 = null; try { sc2 = computeInstrumentScore(name); } catch(e2) {}
        if (!sc2) return '<div style="font-size:0.46rem;color:var(--gtb-muted);padding:3px 0;">' + name + ' —</div>';
        var v = sc2.current_trend || 0;
        var c = _col(v);
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--gtb-border)18;font-size:0.46rem;">'
            + '<span style="color:var(--gtb-muted);">' + name + '</span>'
            + '<span style="font-weight:700;font-family:var(--gtb-mono);color:' + c + ';">' + _zoneLabel(v) + ' (' + (v > 0 ? '+' : '') + v + ')</span>'
            + '</div>';
    };
    h += _section('LTP ZONE', 'bi-geo-alt-fill', 0,
        _zoneRow('NIFTY 50')
        + _zoneRow('NIFTY BANK')
        + _zoneRow('SENSEX')
        + _zoneRow('GIFT NIFTY')
        + _zoneRow('RELIANCE')
        + _zoneRow('HDFCBANK')
        + _zoneRow('ICICIBANK')
    );

    // ── OI / OBV ──────────────────────────────────────────────────────────────
    var oiScore = NIFTY_50_OI_OBV_SCORE + NIFTY_BANK_OI_OBV_SCORE + RELIANCE_OI_OBV_SCORE + HDFCBANK_OI_OBV_SCORE + ICICIBANK_OI_OBV_SCORE;
    h += _section('OI / OBV', 'bi-layers-fill', oiScore,
        _row('NIFTY 50', NIFTY_50_OI_OBV_SCORE, 3)
        + _row('NIFTY BANK', NIFTY_BANK_OI_OBV_SCORE, 3)
        + _row('RELIANCE', RELIANCE_OI_OBV_SCORE, 3)
        + _row('HDFCBANK', HDFCBANK_OI_OBV_SCORE, 3)
        + _row('ICICIBANK', ICICIBANK_OI_OBV_SCORE, 3)
    );

    // ── Max Pain ──────────────────────────────────────────────────────────────
    var mpScore = NIFTY_50_MAX_PAIN_SCORE + NIFTY_BANK_MAX_PAIN_SCORE + RELIANCE_MAX_PAIN_SCORE + HDFCBANK_MAX_PAIN_SCORE + ICICIBANK_MAX_PAIN_SCORE;
    h += _section('MAX PAIN', 'bi-bullseye', mpScore,
        _row('NIFTY 50', NIFTY_50_MAX_PAIN_SCORE, 1)
        + _row('NIFTY BANK', NIFTY_BANK_MAX_PAIN_SCORE, 1)
        + _row('RELIANCE', RELIANCE_MAX_PAIN_SCORE, 1)
        + _row('HDFCBANK', HDFCBANK_MAX_PAIN_SCORE, 1)
        + _row('ICICIBANK', ICICIBANK_MAX_PAIN_SCORE, 1)
    );

    // ── IV Skew ───────────────────────────────────────────────────────────────
    var ivScore = NIFTY_50_IV_SKEW_SCORE + NIFTY_BANK_IV_SKEW_SCORE + RELIANCE_IV_SKEW_SCORE + HDFCBANK_IV_SKEW_SCORE + ICICIBANK_IV_SKEW_SCORE;
    h += _section('IV SKEW', 'bi-distribute-vertical', ivScore,
        _row('NIFTY 50', NIFTY_50_IV_SKEW_SCORE, 1)
        + _row('NIFTY BANK', NIFTY_BANK_IV_SKEW_SCORE, 1)
        + _row('RELIANCE', RELIANCE_IV_SKEW_SCORE, 1)
        + _row('HDFCBANK', HDFCBANK_IV_SKEW_SCORE, 1)
        + _row('ICICIBANK', ICICIBANK_IV_SKEW_SCORE, 1)
    );

    // ── Component Scores (full width) ─────────────────────────────────────────
    h += '</div>';
    var compScore = NIFTY_50_COMPONENT_SCORE + NIFTY_BANK_COMPONENT_SCORE;
    h += _section('COMPONENT SCORES', 'bi-diagram-3-fill', compScore,
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">'
        + '<div>' + _row('NIFTY 50 (weighted top-10)', NIFTY_50_COMPONENT_SCORE, 5) + '</div>'
        + '<div>' + _row('NIFTY BANK (weighted top-10)', NIFTY_BANK_COMPONENT_SCORE, 5) + '</div>'
        + '</div>'
    );

    // ── AVWAP for key instruments ─────────────────────────────────────────────
    var _avwapRows = ['NIFTY 50', 'NIFTY BANK', 'CRUDEOILM', 'USDINR'].map(function(nm) {
        var sm = INSTRUMENT_SCORE_MAP[nm] || {};
        var avwap = sm.avwap || 0;
        var ltp = 0;
        try { ltp = parseFloat((JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}')[nm] || {}).ltp) || 0; } catch(e) {}
        if (!avwap || !ltp) return '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--gtb-border)18;font-size:0.46rem;"><span style="color:var(--gtb-muted);">' + nm + '</span><span style="color:var(--gtb-muted);">—</span></div>';
        var above = ltp > avwap;
        var col = above ? 'var(--gtb-green)' : 'var(--gtb-red)';
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--gtb-border)18;font-size:0.46rem;">'
            + '<span style="color:var(--gtb-muted);">' + nm + '</span>'
            + '<span style="color:' + col + ';font-weight:700;font-family:var(--gtb-mono);">' + (above ? '▲' : '▼') + ' ' + avwap.toFixed(1) + '</span>'
            + '</div>';
    }).join('');
    h += _section('AVWAP (9:15 FUTURES ANCHOR)', 'bi-bar-chart-line-fill', 0, _avwapRows);

    h += '</div></div>';

    $pane.html('<div style="display:flex;flex-direction:column;height:100%;overflow:hidden;">'
        + h
        + '</div>');
}

jQ(document).on('click', '#gtb-metrics-refresh', function() {
    _gtbRenderMetricsPane();
});

function _gtbRenderChecklistPane() {
    var $pane = jQ('#gtb-pane-checklist');
    if (!$pane.length) return;
    // Header bar with refresh button
    var header = '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;border-bottom:1px solid var(--gtb-border);background:var(--gtb-surface);flex-shrink:0;">'
        + '<span style="font-size:0.55rem;font-weight:800;color:var(--gtb-muted);text-transform:uppercase;letter-spacing:0.08em;"><i class="bi bi-clipboard-check"></i> PRE-TRADE CHECKLIST</span>'
        + '<button id="gtb-checklist-refresh" style="background:transparent;border:1px solid var(--gtb-border);color:var(--gtb-muted);padding:2px 8px;font-size:0.46rem;cursor:pointer;"><i class="bi bi-arrow-clockwise"></i> Refresh</button>'
        + '</div>';
    $pane.html('<div style="display:flex;flex-direction:column;height:100%;overflow:hidden;">'
        + header
        + '<div id="gtb-checklist-body" style="flex:1;overflow-y:auto;">' + _gtbBuildChecklistHtml() + '</div>'
        + '</div>');
}

// Refresh button inside the checklist pane
jQ(document).on('click', '#gtb-checklist-refresh', function() {
    jQ('#gtb-checklist-body').html(_gtbBuildChecklistHtml());
});

function _gtbShowTradeChecklist() {
    var h = _gtbBuildChecklistHtml();
    showPopUpWindow('trade-checklist', h, 'Trade Checklist', 620, 580);
    var _tcClass = 'popup-custom-style-trade-checklist';
    var _tcTitle = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<span style="font-weight:800;font-size:0.7rem;white-space:nowrap;"><i class="bi bi-clipboard-check"></i> PRE-TRADE CHECKLIST</span>'
        + popupWinControls(_tcClass)
        + '</div>';
    jQ('.' + _tcClass).find('.popupwindow_titlebar_text').html(_tcTitle);
    hideNativePopupButtons(_tcClass);
    jQ('.' + _tcClass).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
}

jQ(document).on('click', '#show-trade-checklist', function() {
    _gtbShowTradeChecklist();
});

// ── Trade Recommender popup ───────────────────────────────────────────────────
var _gtbTradeSetupInterval = null;
// Saved _render fn from the active closure — reused on tab re-entry to avoid recreating the closure
var _gtbSavedTradeRender = null;

// ── shared helpers (used inside and outside _gtbShowTradeSetup) ───────────────

// Find the row in oiData.tableData that is closest to a given strike
function _gtbOIRowForStrike(oiData, strike) {
    if (!oiData || !oiData.tableData) return null;
    var s = parseFloat(strike);
    var best = null, bestDist = Infinity;
    oiData.tableData.forEach(function(r) {
        var d = Math.abs(parseFloat(r['STRIKE']) - s);
        if (d < bestDist) { bestDist = d; best = r; }
    });
    return best;
}

// Last IV value from an IV series array [{iv, time}...]
function _gtbLastIV(ivArr) {
    if (!ivArr || !ivArr.length) return null;
    return ivArr[ivArr.length - 1].iv;
}

// IV label + color — iv is in percentage form (e.g., 34.5 for 34.5%)
function _gtbIVLabel(iv) {
    if (iv == null) return { label: 'N/A', color: 'var(--gtb-muted)' };
    var pct = parseFloat(iv).toFixed(1);
    if (iv < 12) return { label: pct + '% (Cheap)', color: 'var(--gtb-green)' };
    if (iv < 18) return { label: pct + '% (Normal)', color: 'var(--gtb-amber)' };
    if (iv < 28) return { label: pct + '% (Elevated)', color: 'var(--gtb-amber)' };
    return { label: pct + '% (Expensive)', color: 'var(--gtb-red)' };
}

function _gtbShowTradeSetup(inPaneId, singleName) {
    var _cls = 'popup-custom-style-trade-setup';
    var _id  = 'pop-up-window-trade-setup';
    if (_gtbTradeSetupInterval) { clearInterval(_gtbTradeSetupInterval); _gtbTradeSetupInterval = null; }
    if (!inPaneId) { jQ('.' + _cls).remove(); jQ('#' + _id).remove(); }

    // Single-name mode: minimal shell — no search bar, no 9:15 panel, no help button
    var _shell = singleName
        ? '<div id="gtb-ts-wrap" style="display:flex;flex-direction:column;overflow:hidden;font-size:0.55rem;">'
            + '<div id="gtb-ts-body" style="padding:8px 0;"></div>'
            + '<div style="padding:3px 0;flex-shrink:0;display:flex;align-items:center;gap:6px;">'
            + '<span id="gtb-ts-status" style="flex:1;font-size:0.42rem;color:var(--gtb-muted);"></span>'
            + '<button id="gtb-ts-refresh" style="background:var(--gtb-accent);color:#fff;border:none;padding:2px 8px;font-size:0.44rem;cursor:pointer;"><i class="bi bi-arrow-clockwise"></i> Refresh</button>'
            + '</div>'
            + '<div id="gtb-ts-info-pop" style="display:none;position:fixed;z-index:99999;max-width:300px;background:var(--gtb-surface2);border:1px solid var(--gtb-accent);padding:8px 10px;font-size:0.46rem;color:var(--gtb-text);box-shadow:0 4px 12px rgba(0,0,0,0.4);">'
            + '<div id="gtb-ts-info-title" style="font-weight:800;margin-bottom:4px;color:var(--gtb-accent);"></div>'
            + '<div id="gtb-ts-info-body" style="line-height:1.5;"></div>'
            + '<div style="margin-top:6px;font-size:0.4rem;color:var(--gtb-muted);">Click anywhere to close</div>'
            + '</div>'
            + '</div>'
        : '<div id="gtb-ts-wrap" style="display:flex;flex-direction:column;height:100%;overflow:hidden;font-size:0.55rem;">'
            /* search bar injected after popup opens */
            + '<div id="gtb-ts-searchbar"></div>'
            /* 9:15 breakout panel — populated from localStorage immediately, never touched by _render() */
            + '<div id="gtb-ts-915" style="flex-shrink:0;overflow-y:auto;max-height:180px;border-bottom:1px solid var(--gtb-border);"></div>'
            /* scrollable card area */
            + '<div id="gtb-ts-body" style="flex:1;overflow-y:auto;padding:8px 10px;position:relative;"></div>'
            /* status bar + controls */
            + '<div style="padding:4px 10px;border-top:1px solid var(--gtb-border);background:var(--gtb-surface2);flex-shrink:0;display:flex;align-items:center;gap:6px;">'
            + '<span id="gtb-ts-status" style="flex:1;font-size:0.44rem;color:var(--gtb-muted);">Analysing...</span>'
            + '<button id="gtb-ts-help" style="background:var(--gtb-surface);border:1px solid var(--gtb-border);color:var(--gtb-muted);padding:2px 8px;font-size:0.44rem;cursor:pointer;" title="How this works"><i class="bi bi-question-circle"></i> How it works</button>'
            + '<button id="gtb-ts-refresh" style="background:var(--gtb-accent);color:#fff;border:none;padding:3px 10px;font-size:0.46rem;cursor:pointer;"><i class="bi bi-arrow-clockwise"></i> Refresh</button>'
            + '</div>'
            /* shared info popover — repositioned by JS on (i) click */
            + '<div id="gtb-ts-info-pop" style="display:none;position:fixed;z-index:99999;max-width:300px;background:var(--gtb-surface2);border:1px solid var(--gtb-accent);padding:8px 10px;font-size:0.46rem;color:var(--gtb-text);box-shadow:0 4px 12px rgba(0,0,0,0.4);">'
            + '<div id="gtb-ts-info-title" style="font-weight:800;margin-bottom:4px;color:var(--gtb-accent);"></div>'
            + '<div id="gtb-ts-info-body" style="line-height:1.5;"></div>'
            + '<div style="margin-top:6px;font-size:0.4rem;color:var(--gtb-muted);">Click anywhere to close</div>'
            + '</div>'
            + '</div>';

    if (inPaneId) {
        var $pane = jQ('#' + inPaneId);
        $pane.html(_shell);
    } else {
        showPopUpWindow('trade-setup', _shell, 'Trade Setup', 980, 600);
        // Apply current theme immediately so popup opens in the right mode
        if (localStorage.getItem('GTB_THEME') === 'light') jQ('.' + _cls).addClass('gtb-light');
        else jQ('.' + _cls).removeClass('gtb-light');
        var _tsTitle = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
            + '<span style="font-weight:800;font-size:0.7rem;white-space:nowrap;"><i class="bi bi-lightning-fill"></i> TRADE RECOMMENDER</span>'
            + popupWinControls(_cls)
            + '</div>';
        jQ('.' + _cls).find('.popupwindow_titlebar_text').html(_tsTitle);
        hideNativePopupButtons(_cls);
        jQ('.' + _cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    }

    // Generation counter — increment to cancel any in-progress _render() before starting new work
    var _renderGen = 0;

    // ── Lot map ───────────────────────────────────────────────────────────────
    var _lotMap = { 'NIFTY 50': 75, 'NIFTY BANK': 30, 'SENSEX': 20, 'GIFT NIFTY': 75, 'FINNIFTY': 60 };
    try { (FUTURE_INTRUMENT_LIST || []).forEach(function(f) { if (f.name && f.lot_size) _lotMap[f.name] = parseInt(f.lot_size) || 1; }); } catch(e) {}

    var _oslName = { 'NIFTY 50': 'NIFTY', 'NIFTY BANK': 'BANKNIFTY' };
    function _oslN(n) { return _oslName[n] || n; }
    // Exchange routing: BSE derivatives on BFO, MCX commodities on MCX, rest on NFO
    var _MCX_NAMES = { 'CRUDEOILM': 1, 'CRUDEOIL': 1, 'GOLD': 1, 'SILVER': 1, 'NATURALGAS': 1 };
    function _exch(n) {
        if (_MCX_NAMES[n]) return 'MCX';
        return (n === 'SENSEX' || n === 'BANKEX') ? 'BFO' : 'NFO';
    }

    function _optRow(instrName, strike, type) {
        try {
            var s = parseFloat(strike);
            var candidates = (OPTION_STRIKE_LIST || []).filter(function(o) {
                return o.name === instrName && o.instrument_type === type;
            });
            if (!candidates.length) return null;
            // Exact match first, then nearest strike
            var exact = candidates.find(function(o) { return parseFloat(o.strike) === s; });
            if (exact) return exact;
            return candidates.reduce(function(best, o) {
                return Math.abs(parseFloat(o.strike) - s) < Math.abs(parseFloat(best.strike) - s) ? o : best;
            });
        } catch(e) { return null; }
    }

    // ── Black-Scholes delta (Abramowitz & Stegun normal CDF approx) ──────────
    function _bsDelta(S, K, iv, daysToExpiry, isCall) {
        try {
            if (!iv || iv <= 0 || !daysToExpiry || daysToExpiry <= 0) return 0.45;
            var T  = daysToExpiry / 365;
            var d1 = (Math.log(S / K) + (0.05 + 0.5 * iv * iv) * T) / (iv * Math.sqrt(T));
            var t  = 1 / (1 + 0.2316419 * Math.abs(d1));
            var pd = 0.39894228 * Math.exp(-d1 * d1 / 2)
                   * t * (0.31938153 + t * (-0.35656378 + t * (1.78147794 + t * (-1.82125598 + t * 1.33027443))));
            var nd1 = d1 >= 0 ? 1 - pd : pd;
            return isCall ? nd1 : nd1 - 1; // put delta is negative
        } catch(e) { return 0.45; }
    }

    // Black-Scholes option price (used to estimate LTP at trigger when not yet entered)
    function _bsPrice(S, K, iv, daysToExpiry, isCall) {
        try {
            if (!iv || iv <= 0 || !daysToExpiry || daysToExpiry <= 0) return null;
            var T   = daysToExpiry / 365;
            var sqT = Math.sqrt(T);
            var d1  = (Math.log(S / K) + (0.05 + 0.5 * iv * iv) * T) / (iv * sqT);
            var d2  = d1 - iv * sqT;
            function _nd(x) {
                var t = 1 / (1 + 0.2316419 * Math.abs(x));
                var p = 0.39894228 * Math.exp(-x * x / 2)
                      * t * (0.31938153 + t * (-0.35656378 + t * (1.78147794 + t * (-1.82125598 + t * 1.33027443))));
                return x >= 0 ? 1 - p : p;
            }
            var nd1 = _nd(d1), nd2 = _nd(d2);
            var df  = Math.exp(-0.05 * T); // discount factor
            if (isCall) return Math.max(0, S * nd1 - K * df * nd2);
            return Math.max(0, K * df * (1 - nd2) - S * (1 - nd1));
        } catch(e) { return null; }
    }

    // ── Get option LTP: cached candles first, historical API fallback ─────────
    async function _fetchLTP(name, strike, type) {
        // 1. Try oiData.tableData cached candles (already fetched during OI refresh)
        try {
            var oiD = (INSTRUMENT_SCORE_MAP[name] || {}).oiData;
            if (oiD && oiD.tableData) {
                var s = parseFloat(strike);
                var best = null, bestDist = Infinity;
                oiD.tableData.forEach(function(r) {
                    var d = Math.abs(parseFloat(r['STRIKE']) - s);
                    if (d < bestDist) { bestDist = d; best = r; }
                });
                if (best) {
                    var candles = type === 'CE' ? best['currDataCE'] : best['currDataPE'];
                    if (candles && candles.length) return candles[candles.length - 1][4];
                }
            }
        } catch(e) {}

        // 2. Fall back to historical API (for freshly searched stocks or missing cache)
        try {
            var row = _optRow(_oslN(name), strike, type);
            if (!row) return null;
            var today    = _gtbCurrDay();
            var histTime = _gtbHistTime();
            var from     = today + '+09:00:00';
            var to       = histTime ? (today + ' ' + histTime + ':00') : (today + '+15:35:00');
            var res = await getHistoricalDataUsingPromise(row.instrument_token, from, to, 'minute');
            var c = (res && res.data && res.data.candles) ? res.data.candles : [];
            // Safety-net trim to snapshot end time, then return last close
            c = _gtbTrimCandles(c, today);
            var todayC = c.filter(function(x) { return x[0] && x[0].startsWith(today); });
            if (todayC.length) return todayC[todayC.length - 1][4];
            if (c.length) return c[c.length - 1][4];
        } catch(e) {}
        return null;
    }

    // ── Per-instrument deep analysis ──────────────────────────────────────────
    function _analyse(name) {
        var sc   = null;
        try { sc = computeInstrumentScore(name); } catch(e) {}
        sc = sc || {};
        var ism  = INSTRUMENT_SCORE_MAP[name] || {};

        // Spot price priority:
        // 1. INSTRUMENT_LTP_PRICE — real-time WebSocket LTP (most current)
        // 2. ism.open — last 5-min candle close from historical API (set by showTopChart)
        // 3. INSTRUMENT_LIST_GLOBAL — day open (stale but better than nothing)
        var open = 0;
        try {
            var _ltpMap = JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}');
            if (_ltpMap[name] && _ltpMap[name].ltp) open = parseFloat(_ltpMap[name].ltp) || 0;
        } catch(e) {}
        if (!open) open = parseFloat(ism.open) || 0;
        if (!open) {
            try {
                var _ig = JSON.parse(localStorage.getItem('INSTRUMENT_LIST_GLOBAL') || '{}');
                if (_ig[name] && _ig[name].price) open = parseFloat(_ig[name].price) || 0;
            } catch(e) {}
        }
        // Fallback: ATM strike from oiData (last resort for instruments with no LTP tracking)
        if (!open && ism.oiData && ism.oiData.tableData && ism.oiData.tableData.length) {
            var atmRow = ism.oiData.tableData.find(function(r) { return r['ATM_STRIKE']; });
            if (!atmRow) atmRow = ism.oiData.tableData[Math.floor(ism.oiData.tableData.length / 2)];
            if (atmRow) open = parseFloat(atmRow['STRIKE']) || 0;
        }
        if (!open && ism.strikeMap) {
            var skeys = Object.keys(ism.strikeMap);
            if (skeys.length) open = parseFloat(skeys[Math.floor(skeys.length / 2)]) || 0;
        }
        if (!open) return null;

        // MCX instruments: levels live in strikeMap (set by showTopChartMCX), not getStrikeDetails
        var ast, aso, bso, bst;
        if (_MCX_NAMES[name] && ism.strikeMap) {
            var _sm = ism.strikeMap;
            ast = parseFloat(_sm.ustrikeTwo);
            aso = parseFloat(_sm.ustrikeOne);
            bso = parseFloat(_sm.bstrikeOne);
            bst = parseFloat(_sm.bstrikeTwo);
            if (!ast || !aso || !bso || !bst) return null;
        } else {
            var sd = null;
            try { sd = getStrikeDetails({ price: open }, name); } catch(e) {}
            if (!sd) return null;
            ast = parseFloat(sd.ustrikeTwo); aso = parseFloat(sd.ustrikeOne);
            bso = parseFloat(sd.bstrikeOne); bst = parseFloat(sd.bstrikeTwo);
        }

        // Snap VIX-range levels to nearest tradable option strikes
        function _snapStrike(raw, type) {
            var oslN = _oslN(name);
            var candidates = (OPTION_STRIKE_LIST || []).filter(function(o) {
                return o.name === oslN && o.instrument_type === type;
            });
            if (!candidates.length) return Math.round(raw);
            return parseFloat(candidates.reduce(function(best, o) {
                return Math.abs(parseFloat(o.strike) - raw) < Math.abs(parseFloat(best.strike) - raw) ? o : best;
            }).strike);
        }
        aso = _snapStrike(aso, 'CE');
        ast = _snapStrike(ast, 'CE');
        bso = _snapStrike(bso, 'PE');
        bst = _snapStrike(bst, 'PE');

        var total = sc.total || 0;

        var dir = total > 0 ? 'CE' : total < 0 ? 'PE' : null;
        if (!dir) {
            var fb = (sc.futures_trend || 0) + (sc.nine_fifteen || 0);
            dir = fb > 0 ? 'CE' : fb < 0 ? 'PE' : 'WAIT';
        }

        var entryStrike   = dir === 'CE' ? aso : dir === 'PE' ? bso : aso;
        var alreadyBroken = dir === 'CE' ? (open >= entryStrike) : dir === 'PE' ? (open <= entryStrike) : false;

        var oiD    = ism.oiData || null;
        var pcr    = oiD ? parseFloat(oiD.pcr  || 1) : null;
        var chPcr  = oiD ? parseFloat(oiD.chPcr || 1) : null;
        var atmIV  = oiD ? (oiD.atmIV  || null) : null;
        var ivSkew = oiD ? (oiD.ivSkew || null) : null;
        var oiConc = oiD ? (oiD.oiConcentration || null) : null;

        var strikeRow  = oiD ? _gtbOIRowForStrike(oiD, entryStrike) : null;
        var strikeOICE = strikeRow ? (parseFloat(strikeRow['OI_CE'])     || 0) : 0;
        var strikeOIPE = strikeRow ? (parseFloat(strikeRow['OI_PE'])     || 0) : 0;
        var strikeChCE = strikeRow ? (parseFloat(strikeRow['CHG_OI_CE']) || 0) : 0;
        var strikeChPE = strikeRow ? (parseFloat(strikeRow['CHG_OI_PE']) || 0) : 0;

        var strikeIV = null;
        if (strikeRow) {
            var ivArr = dir === 'CE' ? strikeRow['CE_IV'] : strikeRow['PE_IV'];
            strikeIV = _gtbLastIV(ivArr);
        }

        // Heaviest OI beyond the target (resistance wall)
        var wallStrike = null, wallOI = 0;
        if (oiD && oiD.tableData) {
            oiD.tableData.forEach(function(r) {
                var rk = parseFloat(r['STRIKE']);
                var oi = dir === 'PE' ? (parseFloat(r['OI_PE']) || 0) : (parseFloat(r['OI_CE']) || 0);
                var beyond = dir === 'PE' ? (rk < entryStrike) : (rk > entryStrike);
                if (beyond && oi > wallOI) { wallOI = oi; wallStrike = rk; }
            });
        }

        var mpd = null;
        try { mpd = _gtbComputeMaxPainGEX(name); } catch(e) {}

        var reasons = [];
        if (sc.nine_fifteen > 0)    reasons.push('9:15 bull');
        else if (sc.nine_fifteen < 0) reasons.push('9:15 bear');
        if (sc.current_trend > 0)   reasons.push('above ASO/AST');
        else if (sc.current_trend < 0) reasons.push('below BSO/BST');
        if (sc.futures_trend > 0)   reasons.push('fut LONG');
        else if (sc.futures_trend < 0) reasons.push('fut SHORT');
        if (sc.oi_obv > 0)          reasons.push('OI bull');
        else if (sc.oi_obv < 0)     reasons.push('OI bear');

        // Days to expiry — from OPTION_STRIKE_LIST expiry field
        var daysToExpiry = 30;
        try {
            var oslN = _oslN(name);
            var anyRow = (OPTION_STRIKE_LIST || []).find(function(o) { return o.name === oslN && o.expiry; });
            if (anyRow) {
                var exp = moment(anyRow.expiry, 'DD-MM-YYYY');
                daysToExpiry = Math.max(1, exp.diff(moment(), 'days'));
            }
        } catch(e) {}

        return { name: name, dir: dir, total: total, sc: sc,
                 open: open, ast: ast, aso: aso, bso: bso, bst: bst,
                 entryStrike: entryStrike, alreadyBroken: alreadyBroken,
                 pcr: pcr, chPcr: chPcr, atmIV: atmIV, ivSkew: ivSkew, oiConc: oiConc,
                 strikeOICE: strikeOICE, strikeOIPE: strikeOIPE,
                 strikeChCE: strikeChCE, strikeChPE: strikeChPE,
                 strikeIV: strikeIV, wallStrike: wallStrike, wallOI: wallOI,
                 mpd: mpd, daysToExpiry: daysToExpiry,
                 rationale: reasons.join(' | ') || ('score=' + total) };
    }

    // ── Trade SL / Target via underlying levels ───────────────────────────────
    function _tradeParams(a, ltp, lots) {
        var lotSz  = _lotMap[a.name] || 75;
        var isCall = a.dir === 'CE';
        // IV is stored as percentage (e.g., 34.5 for 34.5%); BS functions need decimal (0.345)
        var ivPct  = a.strikeIV || a.atmIV;
        var iv     = ivPct ? ivPct / 100 : null;

        // Entry spot = trigger level (ASO for CE, BSO for PE).
        // When ltp is null (illiquid/untriggered strike, empty API) fall back to BS estimate.
        // When trade is not yet triggered also use BS estimate at the trigger level so SL/Target
        // reflect realistic entry cost, not the current OTM premium.
        var entrySpot   = a.entryStrike;
        var isAtTrigger = !a.alreadyBroken;
        var noLiveData  = !ltp;

        var entryLTP = ltp; // start with live LTP if available
        var bsEst    = null;
        if (iv && a.daysToExpiry > 0) {
            bsEst = _bsPrice(entrySpot, a.entryStrike, iv, a.daysToExpiry, isCall);
            if (bsEst) bsEst = parseFloat(bsEst.toFixed(2));
        }

        if (!ltp) {
            // No market data: use BS estimate or absolute fallback 0.5
            entryLTP = bsEst || 0.5;
        } else if (isAtTrigger && bsEst) {
            // Waiting for trigger: use BS at trigger (more realistic than current OTM price)
            entryLTP = bsEst;
        }
        entryLTP = parseFloat(entryLTP) || 0.5;
        var isEstimated = noLiveData || isAtTrigger;

        // Delta at trigger level (spot = entryStrike → near-ATM delta ~0.5)
        var absDelta = Math.abs(_bsDelta(entrySpot, a.entryStrike, iv, a.daysToExpiry, isCall));
        if (absDelta < 0.05 || absDelta > 0.95) absDelta = 0.45;

        // Underlying SL = level where trade is wrong; underlying Target = next breakout level
        var uSL  = isCall ? a.bso : a.aso;
        var uTgt = isCall ? a.ast : a.bst;

        // Option price move = delta × underlying move FROM TRIGGER LEVEL
        var optRisk   = parseFloat((absDelta * Math.abs(entrySpot - uSL)).toFixed(2));
        var optReward = parseFloat((absDelta * Math.abs(entrySpot - uTgt)).toFixed(2));
        var slPrice   = Math.max(0.5, parseFloat((entryLTP - optRisk).toFixed(2)));
        var tgtPrice  = parseFloat((entryLTP + optReward).toFixed(2));
        var riskPer   = (entryLTP - slPrice) * lotSz;
        var rewardPer = (tgtPrice - entryLTP) * lotSz;
        var rr        = rewardPer > 0 && riskPer > 0 ? rewardPer / riskPer : 0;

        return { ltp: ltp, entryLTP: entryLTP, noLiveData: noLiveData,
                 isEstimated: isEstimated,
                 sl: slPrice, target: tgtPrice, uSL: uSL, uTgt: uTgt,
                 optRisk: optRisk, optReward: optReward, delta: absDelta,
                 riskTotal: riskPer * lots, rewardTotal: rewardPer * lots,
                 rr: rr, lots: lots, lotSz: lotSz };
    }

    // ── Profitability signal list ─────────────────────────────────────────────
    function _profitSignals(a, tp) {
        var sigs = [], dir = a.dir;

        // 1. Score strength
        var absScore = Math.abs(a.total);
        if (absScore >= 4) sigs.push({ pass: true,  text: 'Strong score aligned with ' + dir + ' (' + (a.total > 0 ? '+' : '') + a.total + ')' });
        else if (absScore >= 1) sigs.push({ pass: null, text: 'Weak score (' + (a.total > 0 ? '+' : '') + a.total + ') -- trade with caution' });
        else sigs.push({ pass: false, text: 'Score neutral (0) -- no edge' });

        // 2. PCR — skip directional pass/fail when WAIT (no bias to evaluate against)
        if (a.pcr !== null) {
            var pcrBull = parseFloat(a.pcr) >= 1.0;
            if (dir === 'WAIT') {
                sigs.push({ pass: null, text: 'PCR ' + parseFloat(a.pcr).toFixed(2)
                    + (pcrBull ? ' (bullish: more puts = floor support)' : ' (bearish: more calls = ceiling)') });
            } else {
                var pcrPass = dir === 'CE' ? pcrBull : !pcrBull;
                sigs.push({ pass: pcrPass, text: 'PCR ' + parseFloat(a.pcr).toFixed(2)
                    + (pcrBull ? ' (bullish: more puts = floor support)' : ' (bearish: more calls = ceiling)') });
            }
        }

        // 3. chPCR (today's directional flow)
        if (a.chPcr !== null) {
            var chBull = parseFloat(a.chPcr) > 1;
            var chPass = dir === 'WAIT' ? null : (dir === 'CE' ? chBull : !chBull);
            sigs.push({ pass: chPass,
                text: 'chPCR ' + parseFloat(a.chPcr).toFixed(2)
                    + (chBull ? ' (today: buying puts = bullish flow)' : ' (today: buying calls = bearish flow)') });
        }

        // 4. OI at entry strike
        if (a.strikeOICE > 0 || a.strikeOIPE > 0) {
            var strikePEWall = a.strikeOIPE > a.strikeOICE;
            var strikePass   = dir === 'WAIT' ? null : (dir === 'CE' ? strikePEWall : !strikePEWall);
            sigs.push({ pass: strikePass, text: 'Strike ' + a.entryStrike + ' OI -- PE:' + a.strikeOIPE.toFixed(1)
                + 'L  CE:' + a.strikeOICE.toFixed(1) + 'L'
                + (dir === 'CE'
                    ? (strikePEWall ? ' (PE wall = floor for CE)' : ' (CE writers resist breakout)')
                    : dir === 'PE'
                    ? (strikePEWall ? ' (PE writers support = resistance for PE)' : ' (CE wall = ceiling for PE)')
                    : '') });
        }

        // 5. OI wall beyond target
        if (a.wallStrike) {
            var wallHeavy = a.wallOI > 8;
            sigs.push({ pass: !wallHeavy, text: 'OI wall at ' + a.wallStrike + ' (' + a.wallOI.toFixed(1) + 'L ' + dir + ')'
                + (wallHeavy ? ' -- heavy resistance before target' : ' -- manageable, target reachable') });
        }

        // 6. Max Pain pull direction
        if (a.mpd) {
            var mpDist = a.mpd.maxPainDist;
            var mpGood = dir === 'WAIT' ? null : (dir === 'CE' ? mpDist > 0 : mpDist < 0);
            sigs.push({ pass: mpGood, text: 'Max Pain ' + a.mpd.maxPainK + ' ('
                + (mpDist >= 0 ? '+' : '') + mpDist.toFixed(0) + ' from spot) -- expiry gravity pulls price '
                + (mpDist > 0 ? 'UP' : 'DOWN') });
        }

        // 7. GEX regime
        if (a.mpd) {
            var gexPos = a.mpd.netGEX > 0;
            sigs.push({ pass: !gexPos, text: gexPos
                ? 'GEX Positive (Stabilising) -- price mean-reverts, options decay faster'
                : 'GEX Negative (Trending) -- price can run, option gains faster' });
        }

        // 8. Strike IV expensiveness
        if (a.strikeIV !== null) {
            var ivCheap = a.strikeIV < 20;
            var ivInfo  = _gtbIVLabel(a.strikeIV);
            sigs.push({ pass: ivCheap, text: (dir !== 'WAIT' ? dir : 'ATM') + ' IV at strike: ' + ivInfo.label
                + (ivCheap ? ' -- cheap premium, buyer advantage' : ' -- expensive premium, buyer disadvantage') });
        }

        // 9. IV Skew
        if (a.ivSkew !== null) {
            var skewFavors = dir === 'WAIT' ? null : (dir === 'CE' ? a.ivSkew < 0 : a.ivSkew > 0);
            sigs.push({ pass: skewFavors, text: 'IV Skew ' + (a.ivSkew >= 0 ? '+' : '') + parseFloat(a.ivSkew).toFixed(1)
                + '% ' + (a.ivSkew > 0 ? '(fear/bearish: put demand > call)' : '(bullish: call demand > put)')
                + (dir !== 'WAIT' ? (skewFavors ? ' -- aligns with ' + dir : ' -- opposes ' + dir) : '') });
        }

        // 10. OI Concentration (tight range risk)
        if (a.oiConc !== null) {
            var tightRange = a.oiConc > 65;
            sigs.push({ pass: !tightRange, text: 'OI Concentration ' + a.oiConc + '% at ATM +/-1'
                + (tightRange ? ' -- tight range expected, directional trade risky' : ' -- OI spread out, breakout possible') });
        }

        // 11. Price-action trigger confirmed?
        if (a.alreadyBroken) {
            sigs.push({ pass: true, text: 'Breakout confirmed -- spot (' + a.open.toFixed(0) + ') already '
                + (a.dir === 'CE' ? 'above' : 'below') + ' entry trigger ' + a.entryStrike });
        } else {
            sigs.push({ pass: null, text: 'Entry trigger NOT yet hit (spot ' + a.open.toFixed(0) + ' vs trigger ' + a.entryStrike
                + ') -- wait for breakout before entering' });
        }

        // 12. R:R quality
        if (tp && tp.rr > 0) {
            var rrGood = tp.rr >= 1.5;
            sigs.push({ pass: rrGood, text: 'R:R 1:' + tp.rr.toFixed(2)
                + (tp.rr >= 2 ? ' (Excellent)' : tp.rr >= 1.5 ? ' (Good)' : tp.rr >= 1 ? ' (Acceptable)' : ' (Poor -- not worth the risk)') });
        }

        var passed  = sigs.filter(function(s) { return s.pass === true;  }).length;
        var failed  = sigs.filter(function(s) { return s.pass === false; }).length;
        var neutral = sigs.filter(function(s) { return s.pass === null;  }).length;
        var verdict = passed >= 8 ? { label: 'HIGHLY FAVORABLE', color: 'var(--gtb-green)' }
                    : passed >= 6 ? { label: 'FAVORABLE',        color: 'var(--gtb-green)' }
                    : passed >= 4 ? { label: 'MIXED',            color: 'var(--gtb-amber)' }
                    : { label: 'UNFAVORABLE', color: 'var(--gtb-red)' };
        return { sigs: sigs, passed: passed, failed: failed, neutral: neutral, verdict: verdict };
    }

    // ── Card HTML ─────────────────────────────────────────────────────────────
    function _card(a, tp, optRow) {
        var sym = optRow ? optRow.tradingsymbol : null;
        var dir = a.dir;
        var dirColor = dir === 'CE' ? 'var(--gtb-green)' : dir === 'PE' ? 'var(--gtb-red)' : 'var(--gtb-amber)';
        var prof = _profitSignals(a, tp);

        // High-conviction early entry: when signals strongly align but BSO/ASO not yet hit,
        // allow entry at current spot. SL = ASO for PE (if spot goes back above ASO, thesis wrong).
        //
        // Soft gate: net passes (pass - fail) >= 3 AND |score| >= 8
        // Hard gates (disqualifying even if soft passes):
        //   1. Futures must not oppose direction (futures traders are real money)
        //   2. GEX must be Negative/trending (Positive GEX = mean-reversion = fights early entry)
        //   3. R:R must be at least 1.0 (OTM early entry amplifies poor R:R)
        //   4. 9:15 candle must not actively oppose direction (opening momentum matters)
        var _ftOk  = dir === 'CE' ? (a.sc.futures_trend || 0) >= 0 : (a.sc.futures_trend || 0) <= 0;
        var _gexOk = !a.mpd || a.mpd.netGEX <= 0;          // Negative/zero GEX = trending
        var _rrOk  = !tp || !tp.rr || tp.rr >= 1.0;        // R:R acceptable (or no data)
        var _n15Ok = dir === 'CE' ? (a.sc.nine_fifteen || 0) >= 0 : (a.sc.nine_fifteen || 0) <= 0;
        var earlyEntry = !a.alreadyBroken && dir !== 'WAIT'
            && (prof.passed - prof.failed >= 3) && Math.abs(a.total) >= 8
            && _ftOk && _gexOk && _rrOk && _n15Ok;

        // If early entry and we have a live LTP, recompute tp using current price (not BS estimate)
        if (earlyEntry && tp && tp.ltp) {
            var aEarly = Object.assign({}, a, { alreadyBroken: true });
            tp = _tradeParams(aEarly, tp.ltp, tp.lots);
        }

        function _tile(label, val, color, sub) {
            return '<div style="background:var(--gtb-bg);border:1px solid var(--gtb-border);padding:5px 8px;min-width:80px;flex:1;">'
                + '<div style="color:var(--gtb-muted);font-size:0.42rem;text-transform:uppercase;letter-spacing:0.05em;">' + label + '</div>'
                + '<div style="font-size:0.6rem;font-weight:800;color:' + (color || 'var(--gtb-text)') + ';">' + val + '</div>'
                + (sub ? '<div style="color:var(--gtb-muted);font-size:0.42rem;">' + sub + '</div>' : '')
                + '</div>';
        }

        function _pill(label, val, pos) {
            var c = pos === true ? 'var(--gtb-green)' : pos === false ? 'var(--gtb-red)' : 'var(--gtb-muted)';
            return '<span style="padding:1px 5px;border:1px solid ' + c + ';color:' + c + ';font-size:0.42rem;white-space:nowrap;">'
                + label + ' ' + (val > 0 ? '+' : '') + val + '</span>';
        }

        function _sec(title, infoKey) {
            return '<div style="font-size:0.42rem;font-weight:800;color:var(--gtb-muted);text-transform:uppercase;'
                + 'letter-spacing:0.08em;padding:4px 0 2px;margin-top:6px;border-top:1px solid var(--gtb-border);display:flex;align-items:center;">'
                + title + (infoKey ? _ii(infoKey) : '')
                + '</div>';
        }

        var _cid = (a.name + '-' + dir).replace(/\s+/g, '-');
        var _safeName = a.name.replace(/\s+/g, '-');
        var h = '<div data-ts-instrument="' + _safeName + '" data-ts-name="' + a.name + '" style="border:2px solid ' + dirColor + ';background:var(--gtb-surface);margin-bottom:6px;">';

        // Header — stock name links to Kite chart
        var _mcxE   = (_MCX_NAMES[a.name] && typeof COMMODITIES_FUTURE_INSTRUMENT_LIST !== 'undefined')
                    ? COMMODITIES_FUTURE_INSTRUMENT_LIST.find(function(f){ return f.name === a.name; }) : null;
        var _lnkTok = _mcxE ? _mcxE.instrument_token : (INSTRUMENT_TOKENS[a.name] || '');
        var _lnkSym = _mcxE ? _mcxE.tradingsymbol : a.name;
        var _lnkExc = _MCX_NAMES[a.name] ? 'MCX' : (a.name === 'SENSEX' || a.name === 'BANKEX' ? 'BFO' : 'NSE');
        var _kLink  = _lnkTok
            ? 'https://kite.zerodha.com/markets/ext/chart/web/tvc/' + _lnkExc + '/' + _lnkSym + '/' + _lnkTok
            : '';
        h += '<div data-ts-card-hdr="' + _cid + '" style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--gtb-surface2);flex-wrap:wrap;cursor:pointer;user-select:none;">'
            + (_kLink
                ? '<a href="' + _kLink + '" target="_blank" style="font-size:0.7rem;font-weight:900;color:var(--gtb-text);text-decoration:none;" '
                  + 'onclick="event.stopPropagation()" '
                  + 'onmouseover="this.style.color=\'var(--gtb-accent)\'" onmouseout="this.style.color=\'var(--gtb-text)\'">' + a.name + ' <i class="bi bi-box-arrow-up-right" style="font-size:0.5rem;opacity:0.6;"></i></a>'
                : '<span style="font-size:0.7rem;font-weight:900;color:var(--gtb-text);">' + a.name + '</span>')
            + (function() {
                var label = dir === 'WAIT' ? 'WAIT -- neutral score' : 'BUY ' + a.entryStrike + ' ' + dir;
                var optExc = optRow ? (optRow.exchange || (_MCX_NAMES[a.name] ? 'MCX' : (a.name === 'SENSEX' || a.name === 'BANKEX' ? 'BFO' : 'NFO'))) : null;
                var optLink = (optRow && optRow.instrument_token && sym)
                    ? 'https://kite.zerodha.com/markets/ext/chart/web/tvc/' + optExc + '/' + sym + '/' + optRow.instrument_token
                    : '';
                if (optLink) {
                    return '<a href="' + optLink + '" target="_blank" style="font-size:0.7rem;font-weight:900;color:' + dirColor + ';text-decoration:none;" '
                        + 'onclick="event.stopPropagation()" '
                        + 'onmouseover="this.style.opacity=\'0.75\'" onmouseout="this.style.opacity=\'1\'">'
                        + label + ' <i class="bi bi-box-arrow-up-right" style="font-size:0.5rem;opacity:0.6;"></i></a>'
                        + '<span style="font-size:0.42rem;color:var(--gtb-muted);">' + sym + '</span>';
                }
                return '<span style="font-size:0.7rem;font-weight:900;color:' + dirColor + ';">' + label + '</span>'
                    + (sym ? '<span style="font-size:0.44rem;color:var(--gtb-muted);">' + sym + '</span>' : '');
            })()
            + '<span style="margin-left:auto;padding:2px 8px;background:' + prof.verdict.color + ';color:#fff;font-size:0.46rem;font-weight:800;">'
            + prof.verdict.label + '  ' + prof.passed + '/' + prof.sigs.length + '</span>'
            + '<button data-ts-refresh="' + a.name + '" onclick="event.stopPropagation()" title="Refresh from API" style="background:none;border:1px solid var(--gtb-border);color:var(--gtb-muted);cursor:pointer;padding:1px 5px;font-size:0.48rem;flex-shrink:0;"><i class="bi bi-arrow-clockwise"></i></button>'
            + '<i class="bi bi-chevron-down ts-card-chevron" data-cid="' + _cid + '" style="font-size:0.5rem;color:var(--gtb-muted);transition:transform 0.15s;flex-shrink:0;"></i>'
            + '</div>';

        h += '<div data-ts-card-body="' + _cid + '" style="display:none;padding:6px 10px;">';

        // Entry trigger
        h += _sec('Entry Trigger (Price Action)', 'entry-trigger');
        var tColor = (a.alreadyBroken || earlyEntry) ? 'var(--gtb-green)' : 'var(--gtb-amber)';
        var triggerText;
        if (dir === 'WAIT') {
            triggerText = 'NEUTRAL -- score is 0. Monitor both ASO ' + a.aso + ' (CE trigger) and BSO ' + a.bso + ' (PE trigger). No trade yet.';
        } else if (a.alreadyBroken) {
            triggerText = 'BREAKOUT CONFIRMED -- ' + a.name + ' (' + a.open.toFixed(0) + ') is already '
                + (dir === 'CE' ? 'above' : 'below') + ' trigger ' + a.entryStrike + '. You may enter now.';
        } else if (earlyEntry) {
            triggerText = 'HIGH CONVICTION EARLY ENTRY (' + prof.passed + ' signals pass, score ' + a.total.toFixed(1) + ') -- '
                + 'Enter BUY ' + a.entryStrike + ' ' + dir + ' at market now (spot ' + a.open.toFixed(0) + '). '
                + 'SL if ' + a.name + ' closes ' + (dir === 'CE' ? 'below BSO ' + a.bso : 'above ASO ' + a.aso) + '. '
                + (dir === 'PE' ? 'If ' + a.name + ' breaks below BSO ' + a.entryStrike + ', add to position.'
                               : 'If ' + a.name + ' breaks above ASO ' + a.entryStrike + ', add to position.');
        } else {
            triggerText = 'WAITING FOR TRIGGER -- Enter BUY ' + a.entryStrike + ' ' + dir
                + ' only when ' + a.name + ' trades ' + (dir === 'CE' ? 'ABOVE' : 'BELOW') + ' ' + a.entryStrike
                + '  (spot now: ' + a.open.toFixed(0) + ')';
        }
        h += '<div style="padding:5px 8px;background:var(--gtb-bg);border-left:3px solid ' + tColor + ';margin:4px 0;font-size:0.52rem;">'
            + '<b style="color:' + tColor + ';">' + triggerText + '</b>'
            + (earlyEntry ? '<div style="margin-top:3px;font-size:0.42rem;color:var(--gtb-muted);">'
                + '✓ Futures aligned &nbsp;|&nbsp; ✓ GEX trending &nbsp;|&nbsp; ✓ R:R ≥ 1.0 &nbsp;|&nbsp; ✓ 9:15 not opposing'
                + '</div>' : '')
            + '</div>';
        h += '<div style="font-size:0.42rem;color:var(--gtb-muted);margin:2px 0;">'
            + 'Key levels: BST ' + a.bst + '  |  BSO ' + a.bso + '  |  Spot ' + a.open.toFixed(0)
            + '  |  ASO ' + a.aso + '  |  AST ' + a.ast + '</div>';

        // Trade parameters
        if (tp) {
            h += _sec('Trade Parameters', 'trade-params');
            // Warn when the option strike had no market data at all
            if (tp.noLiveData) {
                h += '<div style="padding:4px 6px;background:rgba(248,81,73,0.1);border-left:3px solid var(--gtb-red);'
                   + 'font-size:0.44rem;color:var(--gtb-red);margin-bottom:6px;">'
                   + '<b>⚠ No market data for ' + a.entryStrike + ' ' + dir + '</b> — option may be illiquid or not yet traded. '
                   + 'SL / Target are Black-Scholes estimates only. Verify liquidity before trading.</div>';
            }
            var rng  = tp.target - tp.sl;
            var ePct = rng > 0 ? ((tp.entryLTP - tp.sl) / rng * 100).toFixed(1) : 50;
            var ltpLabel = tp.noLiveData ? 'Est. LTP (BS)' : (tp.isEstimated ? 'Est. Entry LTP' : 'Entry LTP');
            var ltpSub   = tp.noLiveData
                ? 'BS est. — no market data'
                : (tp.isEstimated ? 'BS est. at trigger | live: Rs' + (tp.ltp ? tp.ltp.toFixed(2) : 'N/A') + ' | ' : '')
                    + tp.lots + 'lot x' + tp.lotSz + '=' + (tp.lots * tp.lotSz) + 'qty';
            h += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">'
                + _tile(ltpLabel, 'Rs' + tp.entryLTP.toFixed(2), tp.noLiveData ? 'var(--gtb-amber)' : 'var(--gtb-text)', ltpSub)
                + _tile('Stop Loss', 'Rs' + tp.sl, 'var(--gtb-red)', 'Underlying ' + (dir === 'CE' ? 'BSO' : 'ASO') + ' ' + tp.uSL)
                + _tile('Target', 'Rs' + tp.target, 'var(--gtb-green)', 'Underlying ' + (dir === 'CE' ? 'AST' : 'BST') + ' ' + tp.uTgt)
                + _tile('Risk', 'Rs' + Math.round(tp.riskTotal), 'var(--gtb-red)', 'Max loss 1 lot')
                + _tile('Reward', 'Rs' + Math.round(tp.rewardTotal), 'var(--gtb-green)', 'At target')
                + _tile('R:R', '1:' + tp.rr.toFixed(2), tp.rr >= 2 ? 'var(--gtb-green)' : tp.rr >= 1 ? 'var(--gtb-amber)' : 'var(--gtb-red)',
                    tp.rr >= 2 ? 'Excellent' : tp.rr >= 1.5 ? 'Good' : tp.rr >= 1 ? 'Acceptable' : 'Poor')
                + '</div>';
            h += '<div style="position:relative;height:14px;background:linear-gradient(90deg,#f85149 0%,#f85149 '
                + (parseFloat(ePct) - 0.5) + '%,#e6a817 ' + (parseFloat(ePct) - 0.5) + '%,#e6a817 '
                + (parseFloat(ePct) + 0.5) + '%,#3fb950 ' + (parseFloat(ePct) + 0.5) + '%,#3fb950 100%);margin:2px 0 4px;">'
                + '<span style="position:absolute;left:3px;top:50%;transform:translateY(-50%);font-size:0.4rem;color:#fff;font-weight:700;">SL ' + tp.sl + '</span>'
                + '<div style="position:absolute;left:' + ePct + '%;top:50%;transform:translate(-50%,-50%);width:8px;height:8px;background:#fff;border:1.5px solid #000;border-radius:50%;"></div>'
                + '<span style="position:absolute;right:3px;top:50%;transform:translateY(-50%);font-size:0.4rem;color:#fff;font-weight:700;">Tgt ' + tp.target + '</span>'
                + '</div>';
            h += '<div style="font-size:0.42rem;color:var(--gtb-muted);">Exit SL: ' + a.name + ' falls '
                + (dir === 'CE' ? 'below BSO ' : 'above ASO ') + tp.uSL
                + '  |  Book target: ' + a.name + ' reaches ' + (dir === 'CE' ? 'AST ' : 'BST ') + tp.uTgt
                + '  |  Delta: ' + tp.delta.toFixed(3) + (a.strikeIV ? ' (B-S from IV ' + parseFloat(a.strikeIV).toFixed(1) + '%, ' + a.daysToExpiry + 'd expiry)' : ' (fallback)') + '</div>';
        }

        // Score breakdown
        h += _sec('Score Breakdown', 'score');
        h += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin:4px 0;">'
            + _pill('9:15',  a.sc.nine_fifteen,  a.sc.nine_fifteen  !== 0 ? (a.sc.nine_fifteen  > 0) : null)
            + _pill('Trend', a.sc.current_trend, a.sc.current_trend !== 0 ? (a.sc.current_trend > 0) : null)
            + _pill('Fut',   a.sc.futures_trend, a.sc.futures_trend !== 0 ? (a.sc.futures_trend > 0) : null)
            + _pill('OI',    a.sc.oi_obv,        a.sc.oi_obv        !== 0 ? (a.sc.oi_obv        > 0) : null)
            + _pill('Total', a.total, a.total > 0 ? true : a.total < 0 ? false : null)
            + '</div>';
        h += '<div style="font-size:0.42rem;color:var(--gtb-muted);">' + a.rationale + '</div>';

        // OI analysis
        h += _sec('OI / OBV Analysis', 'oi-analysis');
        h += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;">';
        if (a.pcr !== null) {
            var pcrColor = parseFloat(a.pcr) > 1.2 ? 'var(--gtb-green)' : parseFloat(a.pcr) < 0.8 ? 'var(--gtb-red)' : 'var(--gtb-amber)';
            h += _tile('PCR', parseFloat(a.pcr).toFixed(2), pcrColor,
                parseFloat(a.pcr) > 1.2 ? 'Bullish' : parseFloat(a.pcr) < 0.8 ? 'Bearish' : 'Neutral');
        }
        if (a.chPcr !== null) {
            var chC = parseFloat(a.chPcr) > 1 ? 'var(--gtb-green)' : parseFloat(a.chPcr) < 0.8 ? 'var(--gtb-red)' : 'var(--gtb-amber)';
            h += _tile('chPCR', parseFloat(a.chPcr).toFixed(2), chC, "Today's OI flow");
        }
        if (a.oiConc !== null) {
            h += _tile('OI Conc', a.oiConc + '%', a.oiConc > 65 ? 'var(--gtb-red)' : 'var(--gtb-green)',
                a.oiConc > 65 ? 'Tight range' : 'Spread out');
        }
        h += '</div>';
        if (a.strikeOICE > 0 || a.strikeOIPE > 0) {
            h += '<div style="font-size:0.44rem;margin:2px 0;">At strike ' + a.entryStrike + ':  '
                + '<span style="color:var(--gtb-green);">PE ' + a.strikeOIPE.toFixed(1) + 'L</span>  '
                + '<span style="color:var(--gtb-red);">CE ' + a.strikeOICE.toFixed(1) + 'L</span>'
                + (a.strikeChCE || a.strikeChPE ? '  chg CE ' + a.strikeChCE.toFixed(1) + ' PE ' + a.strikeChPE.toFixed(1) + 'L' : '')
                + '</div>';
        }
        if (a.wallStrike) {
            var wallC = a.wallOI > 8 ? 'var(--gtb-red)' : 'var(--gtb-amber)';
            h += '<div style="font-size:0.44rem;margin:2px 0;color:' + wallC + ';">'
                + 'OI Wall at ' + a.wallStrike + ': ' + a.wallOI.toFixed(1) + 'L ' + dir
                + (a.wallOI > 8 ? ' -- heavy resistance' : ' -- moderate') + '</div>';
        }

        // IV analysis
        h += _sec('IV / Premium Analysis', 'iv-analysis');
        h += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;">';
        if (a.atmIV !== null) {
            var atmIVInfo = _gtbIVLabel(a.atmIV);
            h += _tile('ATM IV', parseFloat(a.atmIV).toFixed(1) + '%', atmIVInfo.color, 'CE+PE avg at ATM');
        }
        if (a.strikeIV !== null) {
            var stIVInfo = _gtbIVLabel(a.strikeIV);
            h += _tile('Strike IV', parseFloat(a.strikeIV).toFixed(1) + '%', stIVInfo.color, dir + ' ' + a.entryStrike);
        }
        if (a.ivSkew !== null) {
            var skC = a.ivSkew > 2 ? 'var(--gtb-red)' : a.ivSkew < -2 ? 'var(--gtb-green)' : 'var(--gtb-amber)';
            h += _tile('IV Skew', (a.ivSkew >= 0 ? '+' : '') + parseFloat(a.ivSkew).toFixed(1) + '%', skC,
                a.ivSkew > 0 ? 'Fear bias (PE > CE)' : 'Bullish (CE > PE)');
        }
        h += '</div>';

        // Max Pain / GEX
        if (a.mpd) {
            h += _sec('Max Pain / GEX', 'maxpain');
            h += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;">';
            var mpDist = a.mpd.maxPainDist;
            var mpC    = mpDist > 0 ? 'var(--gtb-green)' : mpDist < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
            h += _tile('Max Pain', a.mpd.maxPainK, '#ffbe0b', (mpDist >= 0 ? '+' : '') + mpDist.toFixed(0) + ' from spot');
            h += _tile('MP Pull', mpDist > 0 ? 'Upward' : mpDist < 0 ? 'Downward' : 'Neutral', mpC, 'Expiry gravity');
            var gexC = a.mpd.netGEX > 0 ? 'var(--gtb-amber)' : 'var(--gtb-green)';
            h += _tile('GEX', a.mpd.netGEX > 0 ? '+Positive' : '-Negative', gexC, a.mpd.netGEX > 0 ? 'Stabilising' : 'Trending');
            if (a.mpd.flipZones && a.mpd.flipZones.length)
                h += _tile('GEX Flip', a.mpd.flipZones.join(', '), 'var(--gtb-muted)', 'Key inflection');
            h += '</div>';
        }

        // Profitability checklist
        h += _sec('Profitability Checklist  (' + prof.passed + ' pass | ' + prof.failed + ' fail | ' + prof.neutral + ' neutral)', 'checklist');
        h += '<div style="display:flex;flex-direction:column;gap:2px;margin:4px 0;">';
        prof.sigs.forEach(function(s) {
            var ic = s.pass === true  ? '<span style="color:var(--gtb-green);min-width:12px;">&#10003;</span>'
                   : s.pass === false ? '<span style="color:var(--gtb-red);min-width:12px;">&#10007;</span>'
                   : '<span style="color:var(--gtb-muted);min-width:12px;">&#8722;</span>';
            h += '<div style="font-size:0.44rem;display:flex;gap:4px;align-items:flex-start;">'
                + ic + '<span style="color:var(--gtb-text);">' + s.text + '</span></div>';
        });
        h += '</div>';

        h += '</div></div>';
        return h;
    }

    // ── Info icon data (title → body text) ───────────────────────────────────
    // Each entry explains a section in the recommendation card to the user.
    var _TS_INFO = {
        'entry-trigger': {
            title: 'Entry Trigger — Price Action',
            body:  'The entry is based on UNDERLYING price crossing a key level:\n'
                 + '• BUY CE: enter when spot crosses ABOVE ASO (Above Strike One = first resistance above open)\n'
                 + '• BUY PE: enter when spot crosses BELOW BSO (Below Strike One = first support below open)\n'
                 + 'ASO/AST/BSO/BST are computed from Groot\'s generateTrend() using the 9:15 open price and VIX range.\n'
                 + 'This is stock price action, NOT option price action.'
        },
        'trade-params': {
            title: 'Trade Parameters — How SL & Target Are Calculated',
            body:  'TRIGGERED (spot already past BSO/ASO):\n'
                 + '  Entry LTP = live option LTP fetched via OI data / historical API.\n\n'
                 + 'NOT YET TRIGGERED (waiting for trigger):\n'
                 + '  Est. Entry LTP = Black-Scholes fair value computed at trigger level (spot = BSO or ASO),\n'
                 + '  so SL/Target reflect the price you will actually pay, not the current OTM price.\n'
                 + '  Live LTP (current OTM price) is also shown for reference.\n\n'
                 + 'Delta = Black-Scholes N(d1) at trigger level (near ATM → ~0.45–0.50).\n'
                 + 'Option Risk   = |Trigger − SL Level| × Delta\n'
                 + 'Option Reward = |Trigger − Target Level| × Delta\n'
                 + 'Stop Loss = Est. Entry LTP − Option Risk  (exit if underlying reverses to ASO/BSO)\n'
                 + 'Target   = Est. Entry LTP + Option Reward (book at AST/BST)\n'
                 + 'R:R = Reward ÷ Risk per lot.'
        },
        'score': {
            title: 'Score Breakdown — What It Measures',
            body:  'Composite score from Groot\'s full refresh cycle:\n'
                 + '• 9:15 Breakout: did the 9:15 candle close above ASO (bull) or below BSO (bear)?\n'
                 + '• Trend: is current spot above ASO/AST (bull) or below BSO/BST (bear)?\n'
                 + '• Futures: NSE/MCX futures REMARK — LONG/SHORT_COVERING = +1, SHORT/LONG_UNWINDING = -1\n'
                 + '• OI/OBV: OI change + OBV direction on option candles at strike level\n'
                 + 'Score drives the CE vs PE decision. Requires a full dashboard refresh to be current.'
        },
        'oi-analysis': {
            title: 'OI / OBV Analysis — Option Chain Data',
            body:  'Based on OPTION strike price action (not underlying):\n'
                 + '• PCR (Put-Call Ratio) = Total PE OI ÷ Total CE OI. >1.2 = bullish (put writing = floor); <0.8 = bearish.\n'
                 + '• chPCR = TODAY\'S change in PE OI ÷ CE OI — shows real-time directional flow.\n'
                 + '• OI Concentration = % of total OI sitting at ATM±1 strikes. >65% = tight range expected, breakout harder.\n'
                 + '• Strike OI = CE vs PE open interest at your entry strike — heavy PE = floor/support; heavy CE = ceiling.\n'
                 + '• OI Wall = heaviest OI strike beyond your target — acts as resistance/support.'
        },
        'iv-analysis': {
            title: 'IV / Premium Analysis — Option Pricing',
            body:  'Based on Black-Scholes IV computed from option candle prices:\n'
                 + '• ATM IV: implied volatility at the at-the-money strike. Low IV = cheap options; high IV = expensive.\n'
                 + '  Cheap (<12%) = buyer advantage; Normal (12-18%); Elevated (18-28%); Expensive (>28%) = seller advantage.\n'
                 + '• Strike IV: IV specifically at your entry strike.\n'
                 + '• IV Skew = PE_OTM_IV − CE_OTM_IV. Positive = fear/put demand (bearish bias); Negative = CE demand (bullish).\n'
                 + 'IV is computed from the last 5-min candle of each option strike during OI refresh.'
        },
        'maxpain': {
            title: 'Max Pain / GEX — Option Writer Positioning',
            body:  'Max Pain = strike where total option writer loss is minimised at expiry. Price gravitates toward max pain as expiry approaches.\n'
                 + '• MP Pull UP = max pain is above spot → expiry gravity pulls price higher → CE-friendly.\n'
                 + '• MP Pull DOWN = max pain is below spot → expiry gravity pulls price lower → PE-friendly.\n'
                 + 'GEX (Gamma Exposure) = net gamma from all option writers:\n'
                 + '• Positive GEX: market makers are long gamma → they SELL rallies and BUY dips → price stabilises (range-bound).\n'
                 + '• Negative GEX: market makers are short gamma → they BUY rallies and SELL dips → price trends (momentum).\n'
                 + 'GEX Flip Zones = strikes where GEX switches sign → often act as S/R levels.'
        },
        'checklist': {
            title: 'Profitability Checklist — All Signals Combined',
            body:  'Evaluates 12 independent signals combining both underlying price action AND option data:\n'
                 + '1. Score strength (composite Groot score)\n'
                 + '2. PCR alignment (total put vs call open interest)\n'
                 + '3. chPCR (today\'s directional OI flow)\n'
                 + '4. Strike OI bias (CE vs PE at entry strike)\n'
                 + '5. OI Wall (resistance/support beyond target)\n'
                 + '6. Max Pain pull direction (expiry gravity)\n'
                 + '7. GEX regime (stabilising vs trending)\n'
                 + '8. Strike IV cost (cheap = buyer advantage)\n'
                 + '9. IV Skew (sentiment bias)\n'
                 + '10. OI Concentration (range vs breakout)\n'
                 + '11. Breakout confirmation (spot vs trigger level)\n'
                 + '12. R:R ratio (reward vs risk)\n'
                 + 'Verdict: HIGHLY FAVORABLE ≥8 pass, FAVORABLE ≥6, MIXED ≥4, UNFAVORABLE <4.'
        }
    };

    /** Renders a clickable (i) icon that shows an info popover on click. key must match _TS_INFO. */
    function _ii(key) {
        return '<span class="gtb-ts-ii" data-info="' + key + '" '
            + 'style="display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;'
            + 'border:1px solid var(--gtb-accent);color:var(--gtb-accent);font-size:0.38rem;cursor:pointer;'
            + 'margin-left:4px;font-style:normal;font-weight:800;flex-shrink:0;" title="Click for info">i</span>';
    }

    // ── Build stock search bar ────────────────────────────────────────────────
    function _build915PanelHtml() {
        var b915 = null;
        try { b915 = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || 'null'); } catch(e) {}
        var h = '<div style="border:1px solid var(--gtb-border);background:var(--gtb-surface);margin-bottom:8px;">'
            + '<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;background:var(--gtb-surface2);border-bottom:1px solid var(--gtb-border);">'
            + '<span style="font-size:0.42rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--gtb-muted);">9:15 Breakout</span>'
            + '<span style="font-size:0.4rem;color:var(--gtb-muted);">— click a stock to add to search</span>'
            + '</div>';
        if (!b915 || !Object.keys(b915).length) {
            h += '<div style="padding:8px 10px;font-size:0.46rem;color:var(--gtb-muted);">No 9:15 scan data yet — run the 9:15 scan first (button in dashboard topbar).</div>';
        } else {
            var groups = { AST: [], ASO: [], BSO: [], BST: [], 'B/W': [] };
            Object.keys(b915).forEach(function(n) {
                var cl = (b915[n] || {})['CLOSE_9_15'] || 'B/W';
                if (groups[cl]) groups[cl].push(n);
            });
            var cols = [
                { key: 'AST', label: '▲ AST', color: 'var(--gtb-green)', bg: 'var(--gtb-green)' },
                { key: 'ASO', label: '↑ ASO', color: 'var(--gtb-green)', bg: '#2ea84380' },
                { key: 'B/W', label: '— B/W', color: 'var(--gtb-muted)', bg: 'var(--gtb-muted)' },
                { key: 'BSO', label: '↓ BSO', color: 'var(--gtb-red)',   bg: '#e8404080' },
                { key: 'BST', label: '▼ BST', color: 'var(--gtb-red)',   bg: 'var(--gtb-red)' }
            ];
            h += '<div style="display:grid;grid-template-columns:repeat(5,1fr);">';
            cols.forEach(function(c, i) {
                var pills = groups[c.key].map(function(n) {
                    return '<span data-ts-chip="' + n + '" style="display:inline-block;padding:1px 6px;margin:1px 2px;'
                        + 'font-size:0.46rem;font-weight:800;background:' + c.bg + ';color:#fff;cursor:pointer;" title="Add ' + n + ' to search">' + n + '</span>';
                }).join('');
                h += '<div style="padding:5px 6px;' + (i < 4 ? 'border-right:1px solid var(--gtb-border);' : '') + '">'
                    + '<div style="font-size:0.4rem;font-weight:800;color:' + c.color + ';text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">'
                    + c.label + ' (' + groups[c.key].length + ')</div>'
                    + '<div style="display:flex;flex-wrap:wrap;gap:1px;">'
                    + (pills || '<span style="font-size:0.44rem;color:var(--gtb-muted);">—</span>')
                    + '</div></div>';
            });
            h += '</div>';
        }
        return h + '</div>';
    }

    function _buildSearchBar() {
        // Unique stock names from OPTION_STRIKE_LIST (name back-mapped to groot name)
        var oslNames = {};
        try {
            (OPTION_STRIKE_LIST || []).forEach(function(o) {
                if (!o.name) return;
                var gname = o.name === 'NIFTY' ? 'NIFTY 50' : o.name === 'BANKNIFTY' ? 'NIFTY BANK' : o.name;
                oslNames[gname] = 1;
            });
        } catch(e) {}
        var allNames = Object.keys(oslNames).sort();

        return '<div style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-bottom:1px solid var(--gtb-border);background:var(--gtb-surface2);flex-shrink:0;">'
            + '<i class="bi bi-search" style="color:var(--gtb-muted);font-size:0.55rem;flex-shrink:0;"></i>'
            + '<div class="fsig-chip-box" id="gtb-ts-chip-box" style="flex:1;background:var(--gtb-bg);border:1px solid var(--gtb-border);padding:3px 6px;cursor:text;">'
            + '<input id="gtb-ts-search" type="text" placeholder="Search symbols — e.g. TCS, INFY…" autocomplete="off" '
            + 'style="background:transparent;border:none;outline:none;color:var(--gtb-text);font-size:0.54rem;min-width:120px;flex:1;">'
            + '</div>'
            + '<button id="gtb-ts-add" style="background:var(--gtb-accent);color:#fff;border:none;padding:3px 12px;font-size:0.46rem;font-weight:800;cursor:pointer;flex-shrink:0;"><i class="bi bi-graph-up"></i> Analyse</button>'
            + '</div>'
            // Dropdown is fixed-position so it escapes overflow:hidden on #gtb-ts-wrap
            + '<div id="gtb-ts-ac-drop" class="fsig-ac-drop" style="position:fixed;"></div>';
    }

    // ── Render a single card and append it ────────────────────────────────────
    async function _renderOne(name, forceRefetch) {
        var oslN = _oslN(name);

        // Bootstrap cards container first — error messages need it even before OSL check
        if (!jQ('#gtb-ts-cards').length) {
            jQ('#gtb-ts-body').html('<div id="gtb-ts-cards"></div>');
        }

        // Quick check: name must exist in OPTION_STRIKE_LIST
        var inOSL = (OPTION_STRIKE_LIST || []).some(function(o) { return o.name === oslN; });
        if (!inOSL) {
            jQ('#gtb-ts-cards').prepend('<div style="padding:8px 10px;color:var(--gtb-red);border:1px solid var(--gtb-border);margin-bottom:8px;font-size:0.48rem;">'
                + '<b>' + name + '</b> not found in option strike list. Check the spelling (e.g. ADANIENT, TATASTEEL, INFY).</div>');
            return;
        }

        // Remove existing cards for this instrument before inserting fresh ones
        var _safeName = name.replace(/\s+/g, '-');
        jQ('[data-ts-instrument="' + _safeName + '"]').remove();

        // Show a loading placeholder while fetching
        if (!jQ('#gtb-ts-cards').length) {
            jQ('#gtb-ts-body').html('<div id="gtb-ts-cards"></div>');
        }
        var $placeholder = jQ('<div data-ts-instrument="' + _safeName + '" style="padding:12px 14px;color:var(--gtb-text);border:1px solid var(--gtb-border);margin-bottom:6px;font-size:0.6rem;background:var(--gtb-surface);"><i class="bi bi-arrow-clockwise spin"></i> &nbsp;Fetching data for <b>' + name + '</b> from API…</div>');
        jQ('#gtb-ts-cards').prepend($placeholder);

        // If forceRefetch, clear cached data so the fetch block always runs
        if (forceRefetch && INSTRUMENT_SCORE_MAP[name]) {
            delete INSTRUMENT_SCORE_MAP[name].open;
            delete INSTRUMENT_SCORE_MAP[name].oiData;
        }

        // If not in dashboard, fetch full data (same as instrument detail view)
        if (!INSTRUMENT_SCORE_MAP[name] || !INSTRUMENT_SCORE_MAP[name].open) {
            jQ('#gtb-ts-status').text('Fetching OI, futures, chart for ' + name + '...');
            try {
                var isMcx = typeof _gtbIsMcxFuture === 'function' && _gtbIsMcxFuture(name);
                await _gtbRefreshOneInstrument(name, isMcx);
            } catch(e) {
                jQ('#gtb-ts-status').text('Partial data for ' + name + ' -- continuing with available data.');
            }
        }

        var a = null;
        try { a = _analyse(name); } catch(e) {}
        // Remove placeholder before inserting real card (or error)
        $placeholder.remove();
        if (!a) {
            jQ('#gtb-ts-cards').prepend('<div data-ts-instrument="' + _safeName + '" style="padding:8px 10px;color:var(--gtb-amber);border:1px solid var(--gtb-border);margin-bottom:8px;font-size:0.48rem;">'
                + 'Could not compute analysis for <b>' + name + '</b> after data fetch. Spot price may be unavailable.</div>');
            return;
        }

        function _getLTP(strike, type) { return _fetchLTP(name, strike, type); }

        if (a.dir !== 'WAIT') {
            var ltp = await _getLTP(a.entryStrike, a.dir);
            var row2 = _optRow(oslN, a.entryStrike, a.dir);
            var tp = _tradeParams(a, ltp, 1);
            jQ('#gtb-ts-cards').prepend(_card(a, tp, row2 || null));
        } else {
            // Score is neutral — show both CE (ASO) and PE (BSO) so user can watch both triggers
            var ltpCE = await _getLTP(a.aso, 'CE');
            var ltpPE = await _getLTP(a.bso, 'PE');
            var rowCE = _optRow(oslN, a.aso, 'CE');
            var rowPE = _optRow(oslN, a.bso, 'PE');
            var aCE = Object.assign({}, a, { dir: 'CE', entryStrike: a.aso, alreadyBroken: false });
            var aPE = Object.assign({}, a, { dir: 'PE', entryStrike: a.bso, alreadyBroken: false });
            var tpCE = _tradeParams(aCE, ltpCE, 1);
            var tpPE = _tradeParams(aPE, ltpPE, 1);
            jQ('#gtb-ts-cards').prepend(
                _card(aCE, tpCE, rowCE || null)
                + _card(aPE, tpPE, rowPE || null)
            );
        }
    }

    // ── Main render ───────────────────────────────────────────────────────────
    async function _render() {
      var gen = ++_renderGen;  // capture generation; if incremented elsewhere this render is stale
      try {
        jQ('#gtb-ts-status').html('<span style="color:var(--gtb-accent);">&#8635; Refreshing…</span>');
        // Don't clear body immediately — keep existing cards visible while computing

        // Single-name mode: only analyse the specified instrument
        // Otherwise: only instruments that have OI data loaded (avoids showing stubs with no signal)
        var instrList;
        if (singleName) {
            instrList = [singleName];
        } else {
            instrList = Object.keys(INSTRUMENT_SCORE_MAP || {}).filter(function(nm) {
                var oi = (INSTRUMENT_SCORE_MAP[nm] || {}).oiData;
                return oi && oi.tableData && oi.tableData.length;
            });
        }
        var analyses  = [];
        instrList.forEach(function(nm) { try { var a = _analyse(nm); if (a) analyses.push(a); } catch(e) { console.warn('[TradeSetup] _analyse error for ' + nm, e); } });

        if (!analyses.length) {
            if (gen !== _renderGen) return;
            jQ('#gtb-ts-body').html('<div style="padding:30px;color:var(--gtb-amber);">No data. Wait for dashboard to complete at least one full refresh, or use the search bar to Analyse individual instruments.</div>');
            jQ('#gtb-ts-status').text('No data — trigger a dashboard refresh first.');
            return;
        }
        analyses.sort(function(a, b) { return Math.abs(b.total) - Math.abs(a.total); });

        // Composite signal header
        var msig = (function() {
            try {
                var cs = (ALL_9_15_CLOSE_SCORE || 0) + (NIFTY_50_9_15_CLOSE_SCORE || 0) + (NIFTY_BANK_9_15_CLOSE_SCORE || 0)
                    + (GIFT_NIFTY_9_15_CLOSE_SCORE || 0) + (SENSEX_9_15_CLOSE_SCORE || 0) + (RELIANCE_9_15_CLOSE_SCORE || 0)
                    + (HDFCBANK_9_15_CLOSE_SCORE || 0) + (ALL_ADVANCE_DECLINE_SCORE || 0) + (NIFTY_50_ADVANCE_DECLINE_SCORE || 0)
                    + (NIFTY_BANK_ADVANCE_DECLINE_SCORE || 0) + (ALL_FUTURES_TREND_SCORE || 0) + (NIFTY_50_FUTURES_TREND_SCORE || 0)
                    + (NIFTY_BANK_FUTURES_TREND_SCORE || 0) + (NIFTY_50_OI_OBV_SCORE || 0) + (NIFTY_BANK_OI_OBV_SCORE || 0)
                    + (RELIANCE_OI_OBV_SCORE || 0) + (HDFCBANK_OI_OBV_SCORE || 0) + (ICICIBANK_OI_OBV_SCORE || 0)
                    + (NIFTY_50_COMPONENT_SCORE || 0) + (NIFTY_BANK_COMPONENT_SCORE || 0);
                return getMarketSignal(cs, localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '');
            } catch(e) { return { signal: 'N/A', color: 'var(--gtb-muted)', reason: '', tradeSignal: '' }; }
        })();

        var sigC = msig.signal.indexOf('BUY') !== -1 ? 'var(--gtb-green)' : msig.signal.indexOf('SELL') !== -1 ? 'var(--gtb-red)' : 'var(--gtb-amber)';
        var out  = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 10px;margin-bottom:8px;border:1px solid var(--gtb-border);background:var(--gtb-surface);">'
            + '<span style="font-size:0.44rem;color:var(--gtb-muted);text-transform:uppercase;font-weight:700;">Market Signal</span>'
            + '<span style="font-size:0.75rem;font-weight:900;color:' + sigC + ';">' + msig.signal + '</span>'
            + '<span style="font-size:0.44rem;color:var(--gtb-muted);">' + (msig.reason || '') + '</span>'
            + (msig.tradeSignal ? (function(ts) {
                var txt = typeof ts === 'object' ? (ts.outcome || '') + (ts.level ? ' ' + ts.level : '') : String(ts);
                return txt ? '<span style="margin-left:auto;font-size:0.55rem;font-weight:700;color:var(--gtb-accent);">' + txt + '</span>' : '';
              })(msig.tradeSignal) : '')
            + '</div>'
            + '<div style="font-size:0.42rem;color:var(--gtb-muted);margin-bottom:8px;padding:0 2px;">'
            + 'Data sourced from last dashboard refresh cycle. Open this popup AFTER a full refresh for current signals. Entry = spot crosses ASO (CE) or BSO (PE). SL/Target computed via Black-Scholes delta from strike IV.'
            + '</div>';
        // ── 9:15 Breakout Summary — re-read localStorage on each render (full mode only) ──
        if (!singleName) jQ('#gtb-ts-915').html(_build915PanelHtml());

        // Abort if Analyse button was clicked (or a newer _render started) while we were computing
        if (gen !== _renderGen) return;

        out += '<div id="gtb-ts-cards"></div>';
        jQ('#gtb-ts-body').html(out);

        jQ('#gtb-ts-status').text('Fetching option LTPs...');
        var cardsHtml = '';
        await Promise.all(analyses.map(async function(a) {
            try {
                var oslN = _oslN(a.name);
                if (a.dir === 'WAIT') {
                    // Show both CE (ASO) and PE (BSO) cards — same as _renderOne WAIT path
                    var ltpCE = await _fetchLTP(a.name, a.aso, 'CE');
                    var ltpPE = await _fetchLTP(a.name, a.bso, 'PE');
                    var rowCE = _optRow(oslN, a.aso, 'CE');
                    var rowPE = _optRow(oslN, a.bso, 'PE');
                    var aCE = Object.assign({}, a, { dir: 'CE', entryStrike: a.aso, alreadyBroken: false });
                    var aPE = Object.assign({}, a, { dir: 'PE', entryStrike: a.bso, alreadyBroken: false });
                    a._cardHtml = _card(aCE, _tradeParams(aCE, ltpCE, 1), rowCE || null)
                                + _card(aPE, _tradeParams(aPE, ltpPE, 1), rowPE || null);
                } else {
                    var ltp  = await _fetchLTP(a.name, a.entryStrike, a.dir);
                    var row2 = _optRow(oslN, a.entryStrike, a.dir);
                    a._cardHtml = _card(a, _tradeParams(a, ltp, 1), row2 || null);
                }
            } catch(e) {
                console.warn('[TradeSetup] card error for ' + a.name, e);
                a._cardHtml = '';
            }
        }));
        // Abort if Analyse button was clicked while we were fetching LTPs
        if (gen !== _renderGen) return;
        analyses.forEach(function(a) { cardsHtml += a._cardHtml || ''; });
        jQ('#gtb-ts-cards').html(cardsHtml || '<div style="padding:20px;color:var(--gtb-muted);">No instrument cards could be rendered.</div>');
        jQ('#gtb-ts-status').text('Updated: ' + moment().format('HH:mm:ss') + '  |  ' + analyses.length + ' instruments  |  Refresh to re-fetch');

      } catch(e) {
        if (gen !== _renderGen) return; // stale — don't overwrite newer content
        console.error('[TradeSetup] _render error:', e);
        jQ('#gtb-ts-body').html('<div style="padding:20px;color:var(--gtb-red);">Error: ' + (e && e.message ? e.message : String(e)) + '</div>');
        jQ('#gtb-ts-status').text('Error during render — check console');
      }
    }

    if (!singleName) {
        jQ('#gtb-ts-searchbar').html(_buildSearchBar());
        // 9:15 panel reads from localStorage — render immediately, no fetch needed
        jQ('#gtb-ts-915').html(_build915PanelHtml());
    }

    _render();

    jQ(document).off('click.tsRefresh').on('click.tsRefresh', '#gtb-ts-refresh', _render);

    // ── Per-card refresh ──────────────────────────────────────────────────────
    jQ(document).off('click.tsCardRefresh').on('click.tsCardRefresh', '[data-ts-refresh]', function(e) {
        e.stopPropagation();
        var name = jQ(this).data('ts-refresh');
        jQ('#gtb-ts-status').text('Refreshing ' + name + ' from API...');
        _renderOne(name, true).then(function() {
            jQ('#gtb-ts-status').text('Refreshed ' + name + '  |  ' + moment().format('HH:mm:ss'));
        });
    });

    // ── Card expand/collapse ──────────────────────────────────────────────────
    jQ(document).off('click.tsCardHdr').on('click.tsCardHdr', '[data-ts-card-hdr]', function(e) {
        if (jQ(e.target).closest('a').length) return; // let link clicks through
        var cid = jQ(this).data('ts-card-hdr');
        var $body = jQ('[data-ts-card-body="' + cid + '"]');
        var open = $body.is(':visible');
        $body.toggle(!open);
        jQ(this).find('.ts-card-chevron').css('transform', open ? '' : 'rotate(180deg)');
    });

    // ── Multi-select autocomplete for Trade Recommender ───────────────────────
    function _tsDrop() { return jQ('#gtb-ts-ac-drop'); }
    function _tsHideDrop() { _tsDrop().empty().hide(); }

    function _tsShowDrop(items) {
        var $d = _tsDrop();
        if (!items.length) { _tsHideDrop(); return; }
        $d.empty();
        items.slice(0, 12).forEach(function(n) {
            $d.append('<div class="fsig-ac-item" data-name="' + n + '">' + n + '</div>');
        });
        var rect = document.getElementById('gtb-ts-chip-box').getBoundingClientRect();
        $d.css({ top: rect.bottom + 'px', left: rect.left + 'px', width: rect.width + 'px' }).show();
    }

    function _tsAddChip(name) {
        name = (name || '').trim().toUpperCase();
        if (!name) return;
        if (jQ('#gtb-ts-chip-box .fsig-chip[data-name="' + name + '"]').length) return;
        var chip = jQ('<span class="fsig-chip" data-name="' + name + '">'
            + name + '<i class="bi bi-x fsig-chip-x"></i></span>');
        jQ('#gtb-ts-search').before(chip);
        jQ('#gtb-ts-search').val('').attr('placeholder', '');
        _tsHideDrop();
    }

    jQ(document).off('input.tsAc').on('input.tsAc', '#gtb-ts-search', function() {
        var q = jQ(this).val().trim().toUpperCase();
        if (!q) { _tsHideDrop(); return; }
        var matches = _fsigAllNames().filter(function(n) { return n.indexOf(q) !== -1; });
        _tsShowDrop(matches);
    });

    jQ(document).off('keydown.tsAc').on('keydown.tsAc', '#gtb-ts-search', function(e) {
        if (e.key === 'Enter') {
            var $first = _tsDrop().find('.fsig-ac-item:first');
            _tsAddChip($first.length ? $first.data('name') : jQ(this).val().trim().toUpperCase());
        } else if (e.key === 'Escape') {
            _tsHideDrop();
        } else if (e.key === 'Backspace' && !jQ(this).val()) {
            jQ('#gtb-ts-chip-box .fsig-chip').last().remove();
            if (!jQ('#gtb-ts-chip-box .fsig-chip').length) jQ('#gtb-ts-search').attr('placeholder', 'Search symbols — e.g. TCS, INFY…');
        }
    });

    jQ(document).off('click.tsAcItem').on('click.tsAcItem', '#gtb-ts-ac-drop .fsig-ac-item', function() {
        _tsAddChip(jQ(this).data('name'));
        jQ('#gtb-ts-search').focus();
    });

    jQ(document).off('click.tsChipX').on('click.tsChipX', '#gtb-ts-chip-box .fsig-chip-x', function(e) {
        e.stopPropagation();
        jQ(this).closest('.fsig-chip').remove();
        if (!jQ('#gtb-ts-chip-box .fsig-chip').length) jQ('#gtb-ts-search').attr('placeholder', 'Search symbols — e.g. TCS, INFY…');
    });

    jQ(document).off('click.tsChipBox').on('click.tsChipBox', '#gtb-ts-chip-box', function(e) {
        if (!jQ(e.target).hasClass('fsig-chip-x')) jQ('#gtb-ts-search').focus();
    });

    jQ(document).off('click.ts915pill').on('click.ts915pill', '[data-ts-chip]', function() {
        _tsAddChip(jQ(this).data('ts-chip'));
        jQ('#gtb-ts-search').focus();
    });

    jQ(document).off('click.tsAdd').on('click.tsAdd', '#gtb-ts-add', function() {
        var chips = jQ('#gtb-ts-chip-box .fsig-chip').map(function() { return jQ(this).data('name'); }).get();
        if (!chips.length) {
            var raw = jQ('#gtb-ts-search').val().trim().toUpperCase();
            if (raw) chips = [raw];
        }
        if (!chips.length) return;
        jQ('#gtb-ts-chip-box .fsig-chip').remove();
        jQ('#gtb-ts-search').val('').attr('placeholder', 'Search symbols — e.g. TCS, INFY…');
        _tsHideDrop();
        _renderGen++;  // cancel any in-progress _render() so it won't overwrite our cards
        var total = chips.length, done = 0;
        jQ('#gtb-ts-status').text('Analysing ' + chips.join(', ') + '...');
        chips.forEach(function(name) {
            var _sn = name.replace(/\s+/g, '-');
            var alreadyShown = jQ('[data-ts-instrument="' + _sn + '"]').length > 0;
            _renderOne(name, alreadyShown).then(function() {
                done++;
                if (done === total) jQ('#gtb-ts-status').text('Done: ' + chips.join(', ') + '  |  ' + moment().format('HH:mm:ss'));
            }).catch(function(e) {
                done++;
                console.error('[TradeSetup] _renderOne error for ' + name, e);
                if (!jQ('#gtb-ts-cards').length) jQ('#gtb-ts-body').html('<div id="gtb-ts-cards"></div>');
                jQ('#gtb-ts-cards').prepend('<div style="padding:8px 10px;color:var(--gtb-red);border:1px solid var(--gtb-border);margin-bottom:6px;font-size:0.55rem;">Error analysing <b>' + name + '</b>: ' + (e && e.message ? e.message : String(e)) + '</div>');
                if (done === total) jQ('#gtb-ts-status').text('Error — ' + chips.join(', '));
            });
        });
    });

    // ── Info icon popover ─────────────────────────────────────────────────────
    jQ(document).off('click.tsInfo').on('click.tsInfo', '.gtb-ts-ii', function(e) {
        e.stopPropagation();
        var key  = jQ(this).data('info');
        var info = _TS_INFO[key];
        if (!info) return;
        var pop = jQ('#gtb-ts-info-pop');
        pop.find('#gtb-ts-info-title').text(info.title);
        pop.find('#gtb-ts-info-body').html(info.body.replace(/\n/g, '<br>'));
        // Position near icon
        var r = this.getBoundingClientRect();
        var left = Math.min(r.left, window.innerWidth - 320);
        pop.css({ display: 'block', top: (r.bottom + 4) + 'px', left: Math.max(4, left) + 'px' });
    });
    jQ(document).off('click.tsInfoClose').on('click.tsInfoClose', function() {
        jQ('#gtb-ts-info-pop').hide();
    });

    // ── Help panel toggle ─────────────────────────────────────────────────────
    var _helpHtml = '<div style="padding:10px 14px;background:var(--gtb-surface2);border:1px solid var(--gtb-accent);margin-bottom:10px;font-size:0.48rem;line-height:1.7;">'
        + '<div style="font-weight:900;font-size:0.6rem;margin-bottom:8px;color:var(--gtb-accent);">How Trade Recommender Works</div>'

        + '<b style="color:var(--gtb-text);">What analysis is it based on?</b><br>'
        + 'Both <b>underlying price action</b> AND <b>option strike data</b>:<br>'
        + '&nbsp;• Price action: 9:15 candle breakout, spot position vs ASO/AST/BSO/BST, futures REMARK (LONG/SHORT)<br>'
        + '&nbsp;• Option chain: PCR, chPCR (today\'s OI flow), per-strike CE/PE OI, OBV of option candles, IV (Black-Scholes), IV skew, OI concentration<br>'
        + '&nbsp;• Structural: Max Pain (expiry gravity), GEX (gamma regime — stabilising vs trending)<br><br>'

        + '<b style="color:var(--gtb-text);">What do ASO/AST/BSO/BST mean?</b><br>'
        + '&nbsp;• ASO (Above Strike One) = first resistance above open — CE entry trigger<br>'
        + '&nbsp;• AST (Above Strike Two) = second resistance — CE target<br>'
        + '&nbsp;• BSO (Below Strike One) = first support below open — PE entry trigger / CE stop loss<br>'
        + '&nbsp;• BST (Below Strike Two) = second support — PE target<br>'
        + 'These are computed from the 9:15 open price and VIX daily range by Groot\'s generateTrend().<br><br>'

        + '<b style="color:var(--gtb-text);">When should I open this popup?</b><br>'
        + '&nbsp;• AFTER a full dashboard refresh — all data (score, OI, futures, IV) is read from the refresh cache.<br>'
        + '&nbsp;• The popup\'s <b>Refresh</b> button re-reads the same cache without re-fetching APIs.<br>'
        + '&nbsp;• For fresh data on a specific stock: type its name in the search bar — it triggers a full OI+futures fetch.<br><br>'

        + '<b style="color:var(--gtb-text);">How is delta calculated?</b><br>'
        + 'Black-Scholes N(d1) using the strike\'s IV (from the last 5-min candle) and actual days to expiry. This gives a realistic option price sensitivity vs the fixed 0.45 approximation.<br><br>'

        + '<b style="color:var(--gtb-text);">Crude Oil?</b><br>'
        + 'CRUDEOILM is on MCX (not NSE). It appears automatically when loaded in the dashboard. Options are fetched from the MCX exchange. Use the search bar to add it if not shown.<br><br>'

        + '<div style="color:var(--gtb-muted);font-size:0.42rem;">Click the <b>ⓘ</b> icons on each section header for detailed explanations of that specific metric.</div>'
        + '</div>';

    jQ(document).off('click.tsHelp').on('click.tsHelp', '#gtb-ts-help', function() {
        var body = jQ('#gtb-ts-body');
        if (jQ('#gtb-ts-help-panel').length) { jQ('#gtb-ts-help-panel').remove(); return; }
        body.prepend('<div id="gtb-ts-help-panel">' + _helpHtml + '</div>');
    });

    if (!inPaneId) {
        jQ(document).off('click.tsClose').on('click.tsClose', '.' + _cls + ' .popupwindow_close, .' + _cls + ' .gtb-pw-close', function() {
            if (_gtbTradeSetupInterval) { clearInterval(_gtbTradeSetupInterval); _gtbTradeSetupInterval = null; }
        });
    }

    // Save the render fn so tab re-entry can call it directly without recreating the closure
    if (inPaneId) _gtbSavedTradeRender = _render;
}


// ── Floating quick-access toolbar ───────────────────────────────────────────
function _gtbCreateFloatingBar() {
    if (document.getElementById('gtb-float-bar')) return;

    var _tools = [
        { id: 'show-chartgrid',              icon: 'bi-grid-3x3-gap-fill',    title: 'Chart Grid' },
        { id: 'show-915-backtest',           icon: 'bi-calendar-week',        title: '9:15 Backtest' },
        { id: 'show-all-oi',                 icon: 'bi-layers-fill',          title: 'OI Scan' },
        { id: 'show-fut-accuracy',           icon: 'bi-bullseye',             title: 'Futures Accuracy' },
        { id: 'show-futures-signal',         icon: 'bi-flag-fill',            title: 'Instrument Detail View' },
        { id: 'show-commodities',            icon: 'bi-droplet-fill',         title: 'Commodities' },
        { id: 'show-oi-viewer',              icon: 'bi-eye',                  title: 'OI Viewer' },
        { id: 'show-stock-viewer',           icon: 'bi-list-ul',              title: 'Stock Viewer' },
        { id: 'show-market-quote-analyzer',  icon: 'bi-graph-up',             title: 'Market Quotes' },
        { id: 'show-maxpain-gex',            icon: 'bi-bar-chart-steps',      title: 'Max Pain / GEX' },
        { id: 'gtb-add-instr-btn',           icon: 'bi-plus-circle-fill',     title: 'Add Instrument' },
        { id: 'gtb-settings-toggle',         icon: 'bi-gear-fill',            title: 'Settings' },
        { id: 'show-snap-replay',            icon: 'bi-collection-play-fill', title: 'Historical Day Replay' },
        { id: 'show-trade-setup',            icon: 'bi-lightning-fill',       title: 'Trade Recommender' },
        { id: 'show-trade-checklist',        icon: 'bi-clipboard-check',      title: 'Pre-Trade Checklist' },
        { id: 'show-help',                   icon: 'bi-question-circle-fill', title: 'Help' },
        { id: 'data-load',                   icon: 'bi-sliders',              title: 'Data Settings' },
    ];

    var bar = document.createElement('div');
    bar.id = 'gtb-float-bar';

    // ── Flyout panel (hidden until trigger clicked) ────────────────────────
    var panel = document.createElement('div');
    panel.id = 'gtb-float-panel';

    // Drag handle inside panel
    var _handle = document.createElement('span');
    _handle.className = 'gtb-fb-handle';
    _handle.title = 'Drag';
    _handle.innerHTML = '&#8942;';
    panel.appendChild(_handle);

    // Tool buttons
    _tools.forEach(function(t) {
        var btn = document.createElement('button');
        btn.className = 'gtb-fb-btn';
        btn.title = t.title;
        btn.dataset.toolId = t.id;
        btn.innerHTML = '<i class="bi ' + t.icon + '"></i>';
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            bar.classList.remove('gtb-fb-open');
            var id = this.dataset.toolId;
            if (id === 'show-snap-replay')     { _gtbShowHistoricalReplay(); return; }
            if (id === 'show-trade-setup')     { _gtbShowTradeSetup(); return; }
            if (id === 'show-trade-checklist') { _gtbShowTradeChecklist(); return; }
            var $el = jQ('#' + id);
            if ($el.length) {
                $el[0].click();
            } else {
                // Dashboard not open — open it, click the tool, then hide the dashboard
                // so only the tool popup is visible (not Groot alongside it).
                showGrootTradeBot();
                setTimeout(function() {
                    var $x = jQ('#' + id);
                    if ($x.length) $x[0].click();
                    jQ('#gtb-popup-win').hide();
                }, 400);
            }
        });
        panel.appendChild(btn);
    });

    // Groot bot toggle (inside panel, above trigger)
    var gBtn = document.createElement('button');
    gBtn.className = 'gtb-fb-btn gtb-fb-groot';
    gBtn.title = 'Toggle Groot Bot';
    gBtn.innerHTML = '<i class="bi bi-toggles"></i>';
    gBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        bar.classList.remove('gtb-fb-open');
        var $win = jQ('#gtb-popup-win');
        if ($win.length) { $win.toggle(); } else { showGrootTradeBot(); }
    });
    panel.appendChild(gBtn);

    bar.appendChild(panel);

    // ── Trigger button — always visible at bottom ──────────────────────────
    var trigger = document.createElement('button');
    trigger.id = 'gtb-float-trigger';
    trigger.title = 'Tools';
    trigger.innerHTML = '<i class="bi bi-grid-3x3-gap-fill"></i>';
    trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        bar.classList.toggle('gtb-fb-open');
        trigger.innerHTML = bar.classList.contains('gtb-fb-open')
            ? '<i class="bi bi-x-lg"></i>'
            : '<i class="bi bi-grid-3x3-gap-fill"></i>';
    });
    bar.appendChild(trigger);

    document.body.appendChild(bar);

    // Close panel when clicking outside the bar
    document.addEventListener('click', function(e) {
        if (!bar.contains(e.target) && bar.classList.contains('gtb-fb-open')) {
            bar.classList.remove('gtb-fb-open');
            trigger.innerHTML = '<i class="bi bi-grid-3x3-gap-fill"></i>';
        }
    });

    // Apply current theme immediately
    if ((localStorage.getItem('GTB_THEME') || 'dark') === 'light') bar.classList.add('gtb-light');

    // Drag support — drag the whole bar via the handle
    var _dragging = false, _dragMoved = false, _startY = 0, _startTop = 0;
    _handle.addEventListener('mousedown', function(e) {
        _dragging = true; _dragMoved = false;
        _startY   = e.clientY;
        _startTop = parseInt(bar.style.bottom) || 40;
        e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
        if (!_dragging) return;
        _dragMoved = true;
        // bar is anchored bottom-right; drag inverts Y
        var delta = _startY - e.clientY;
        var b = Math.max(4, Math.min(window.innerHeight - bar.offsetHeight - 4, _startTop + delta));
        bar.style.bottom = b + 'px';
        localStorage.setItem('GTB_FLOAT_BOTTOM', b);
    });
    document.addEventListener('mouseup', function() { _dragging = false; });

    // Restore saved position
    var _saved = localStorage.getItem('GTB_FLOAT_BOTTOM');
    bar.style.bottom = (_saved ? _saved + 'px' : '40px');
}

setTimeout(_gtbCreateFloatingBar, 1500);
