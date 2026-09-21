// ── Groot Market Terminal (Bloomberg-style dashboard) ─────────────────────────
// Sections: Ticker Tape | Heat Map | Relative Strength | Market Breadth |
//           VIX Regime | Options Flow | Correlation Matrix | Intraday Stats

var _BT_INSTR = [
    { name:'GIFT NIFTY', s:'GN'  },
    { name:'NIFTY 50',   s:'N50' },
    { name:'NIFTY BANK', s:'NB'  },
    { name:'SENSEX',     s:'SX'  },
    { name:'CRUDEOILM',  s:'CRD' },
    { name:'USDINR',     s:'USD' },
    { name:'RELIANCE',   s:'REL' },
    { name:'HDFCBANK',   s:'HDF' },
    { name:'ICICIBANK',  s:'ICI' },
];

// Info icon helper — reuses the main GTB_INFO map + existing gtb-info-pop popover
function _btii(key) {
    return ' <i class="bi bi-info-circle gtb-info-i" data-info="' + key + '" title="What does this show?" style="font-style:normal;cursor:pointer;font-size:0.6rem;opacity:0.55;vertical-align:middle;"></i>';
}

// #show-bloomberg is now handled by _gtbInitTabs() in grootTradeBot.js (switches to Analysis tab).
// This handler only fires when the groot bot is NOT open (e.g. standalone use).
jQ(document).on('click', '#show-bloomberg', function(e) {
    if (jQ('#gtb-tab-strip').length) return; // handled by tab system
    e.preventDefault();
    _btShow();
});

// Build the bloomberg dashboard body HTML (shared by popup and tab pane)
function _btBodyHtml() {
    var ii = _btii;
    return '<div id="bt-wrap">'
        + '<div class="bt-tape-wrap"><div class="bt-ph bt-tape-hdr">MARKET TAPE' + ii('bt-tape') + '</div><div class="bt-tape-scroll"><div id="bt-tape-inner" class="bt-tape-inner"></div></div></div>'
        + '<div class="bt-row-4">'
        +   '<div class="bt-panel"><div class="bt-ph">HEAT MAP' + ii('bt-heatmap') + '</div><div id="bt-hm-body"></div></div>'
        +   '<div class="bt-panel"><div class="bt-ph">RELATIVE STRENGTH' + ii('bt-relstr') + '</div><div id="bt-rs-body"></div></div>'
        +   '<div class="bt-panel"><div class="bt-ph">MARKET BREADTH' + ii('bt-breadth') + '</div><div id="bt-br-body"></div></div>'
        +   '<div class="bt-panel"><div class="bt-ph">VIX REGIME' + ii('bt-vix') + '</div><div id="bt-vx-body"></div></div>'
        + '</div>'
        + '<div class="bt-panel bt-flow-panel"><div class="bt-ph">OPTIONS FLOW — CE vs PE NET OI' + ii('bt-flow') + '</div><div id="bt-fl-body" class="bt-flow-grid"></div></div>'
        + '<div class="bt-row-2">'
        +   '<div class="bt-panel"><div class="bt-ph">CORRELATION MATRIX' + ii('bt-corr') + ' <button id="bt-corr-load" class="gtb-win-btn" style="margin-left:6px;font-size:0.52rem;padding:1px 6px;">Load</button></div><div id="bt-co-body"><span class="bt-hint">Click Load to compute from live 5-min candles</span></div></div>'
        +   '<div class="bt-panel"><div class="bt-ph">INTRADAY SNAPSHOT' + ii('bt-stats') + '</div><div id="bt-st-body"></div></div>'
        + '</div>'
        + '<div class="bt-panel bt-pred-panel"><div class="bt-ph">TREND PROBABILITY' + ii('bt-pred') + '</div><div id="bt-pred-body"></div></div>'

        // ── GDB panels ────────────────────────────────────────────────────────
        + '<div class="bt-panel" style="grid-column:1/-1;"><div class="bt-ph">MARKET PULSE</div><div id="gdb-body-pulse"></div></div>'
        + '<div class="bt-row-2">'
        +   '<div class="bt-panel"><div class="bt-ph">SCORE MATRIX</div><div id="gdb-body-score" style="max-height:260px;overflow-y:auto;"></div></div>'
        +   '<div class="bt-panel"><div class="bt-ph">OPPORTUNITY RANKER</div><div id="gdb-body-opps" style="max-height:260px;overflow-y:auto;"></div></div>'
        + '</div>'
        + '<div class="bt-panel" style="border:2px solid orange;"><div class="bt-ph">NIFTY / BANK NIFTY DIVERGENCE' + ii('gdb-nb-div') + '</div><div id="gdb-body-nbdiv" style="min-height:70px;"><span style="color:orange;font-size:0.6rem;">[v26.79 placeholder — if you see this orange text/border after a refresh, the HTML template updated but _gdbWidgetNbDiv() itself never ran or never replaced this]</span></div></div>'
        + '<div class="bt-row-2">'
        +   '<div class="bt-panel"><div class="bt-ph">INDEX DIVERGENCE</div><div id="gdb-body-divergence"></div></div>'
        +   '<div class="bt-panel"><div class="bt-ph">LEVEL MAPS <span id="gdb-lm-sel-wrap" style="font-weight:400;"></span></div><div id="gdb-body-levelmap"></div></div>'
        + '</div>'
        + '<div class="bt-row-2">'
        +   '<div class="bt-panel"><div class="bt-ph">BACKTEST SUMMARY</div><div id="gdb-body-backtest"></div></div>'
        +   '<div class="bt-panel"><div class="bt-ph">RISK MANAGER</div><div id="gdb-body-risk"></div></div>'
        + '</div>'
        + '</div>';
}

// Bind bt-refresh, bt-corr-load, and GDB risk/level-map events
function _btBindControls() {
    jQ(document).off('click.bt-refresh').on('click.bt-refresh', '#bt-refresh-btn', function() {
        var $i = jQ(this).find('i'); $i.addClass('spin');
        _btRenderAll();
        setTimeout(function() { $i.removeClass('spin'); }, 600);
    });
    jQ(document).off('click.bt-corr').on('click.bt-corr', '#bt-corr-load', async function() {
        var $btn = jQ(this); $btn.prop('disabled', true).text('Loading...');
        await _btRenderCorrelation();
        $btn.prop('disabled', false).text('Reload');
    });
    // Risk Manager events
    jQ(document).off('click.gdb-risk').on('click.gdb-risk', '#gdb-add-pos', _gdbAddPosition);
    jQ(document).off('click.gdb-del').on('click.gdb-del', '.gdb-del-pos', function() {
        _GDB.positions.splice(parseInt(jQ(this).data('i')), 1);
        _gdbSavePositions(); _gdbWidgetRisk();
    });
    // Level Map pin change
    jQ(document).off('change.gdb-pin').on('change.gdb-pin', '.gdb-pin-sel', function() {
        _GDB.levelPins[parseInt(jQ(this).data('idx'))] = jQ(this).val();
        _gdbWidgetLevelMap();
    });
}

// Render bloomberg dashboard into a tab pane (no popup)
function _btRenderInPane(targetEl) {
    var $p = jQ(targetEl);
    $p.html(
        '<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid var(--gtb-border2);flex-shrink:0;">'
        + '<span style="font-weight:900;font-size:0.65rem;letter-spacing:.09em;color:var(--gtb-accent);">GROOT MARKET TERMINAL</span>'
        + '<button class="gtb-win-btn" id="bt-refresh-btn" style="margin-left:6px;" title="Refresh all sections"><i class="bi bi-arrow-clockwise"></i></button>'
        + '</div>'
        + _btBodyHtml()
    );
    _btBindControls();
    setTimeout(_btRenderAll, 80);
}

function _btShow() {
    var _divId = 'popup-custom-style-bloomberg-dash';

    showPopUpWindow('bloomberg-dash', _btBodyHtml(), 'Market Terminal', 1200, 720);

    jQ('.' + _divId).find('.popupwindow_titlebar_text').html(
        '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<span style="font-weight:900;font-size:0.72rem;letter-spacing:.1em;color:var(--gtb-accent);">GROOT MARKET TERMINAL</span>'
        + '<button class="gtb-win-btn" id="bt-refresh-btn" style="margin-left:8px;" title="Refresh"><i class="bi bi-arrow-clockwise"></i></button>'
        + popupWinControls(_divId)
        + '</div>'
    );
    hideNativePopupButtons(_divId);
    jQ('.' + _divId).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');

    _btBindControls();
    setTimeout(_btRenderAll, 100);
}

// Each section is independent — one panel's data problem (missing LTP, a bad candle fetch,
// an undefined helper) must never stop the rest of the terminal from rendering. Previously
// only the GDB widgets (Market Pulse, Score Matrix, etc.) were try/catch-guarded; an uncaught
// exception in any of the un-guarded calls above them (_btRenderVIX, _btRenderOptionsFlow,
// etc.) silently halted every call after it in this function, leaving those panels blank with
// no error shown anywhere — exactly what "VIX Regime and everything below it is empty, but
// Heat Map/Relative Strength/Market Breadth above it are fine" looks like.
function _btRenderAll() {
    var _sections = [
        ['tape',    _btRenderTape],
        ['heatmap', _btRenderHeatmap],
        ['relstr',  _btRenderRelStrength],
        ['breadth', _btRenderBreadth],
        ['vix',     _btRenderVIX],
        ['flow',    _btRenderOptionsFlow],
        ['stats',   _btRenderStats],
        ['pred',    _btRenderPrediction],
    ];
    _sections.forEach(function(s) {
        try { s[1](); } catch (e) { console.error('[Groot Market Terminal] ' + s[0] + ' render failed:', e); }
    });
    // GDB widget panels (only rendered when in Analysis tab pane)
    if (jQ('#gdb-body-pulse').length)      { try { _gdbWidgetPulse();      } catch(e) { console.error('[Groot Market Terminal] pulse render failed:', e); } }
    if (jQ('#gdb-body-nbdiv').length)      { try { _gdbWidgetNbDiv();      } catch(e) { console.error('[Groot Market Terminal] nbdiv render failed:', e); } }
    if (jQ('#gdb-body-score').length)      { try { _gdbWidgetScore();      } catch(e) { console.error('[Groot Market Terminal] score render failed:', e); } }
    if (jQ('#gdb-body-opps').length)       { try { _gdbWidgetOpps();       } catch(e) { console.error('[Groot Market Terminal] opps render failed:', e); } }
    if (jQ('#gdb-body-divergence').length) { try { _gdbWidgetDivergence(); } catch(e) { console.error('[Groot Market Terminal] divergence render failed:', e); } }
    if (jQ('#gdb-body-levelmap').length)   { try { _gdbWidgetLevelMap();   } catch(e) { console.error('[Groot Market Terminal] levelmap render failed:', e); } }
    if (jQ('#gdb-body-backtest').length)   { try { _gdbWidgetBacktest();   } catch(e) { console.error('[Groot Market Terminal] backtest render failed:', e); } }
    if (jQ('#gdb-body-risk').length)       { try { _gdbWidgetRisk();       } catch(e) { console.error('[Groot Market Terminal] risk render failed:', e); } }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function _btOpens()  { return JSON.parse(localStorage.getItem('INSTRUMENT_LIST_GLOBAL') || '{}'); }
function _btLtps()   { return JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE')   || '{}'); }
function _btPct(ltp, open) { return open ? ((ltp - open) / open * 100) : 0; }
function _btFmt(n)   { return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(0)+'K' : parseFloat(n).toFixed(0); }
function _btCol(v)   { return v > 0 ? '#3fb950' : v < 0 ? '#f85149' : '#7d8590'; }
function _btSign(v)  { return v > 0 ? '+' : ''; }

// ── Ticker Tape ───────────────────────────────────────────────────────────────
function _btRenderTape() {
    var opens = _btOpens(), ltps = _btLtps();
    var items = _BT_INSTR.map(function(inst) {
        var ltp  = parseFloat((ltps[inst.name] || {}).ltp || 0);
        var open = parseFloat((opens[inst.name] || {}).price || 0);
        if (!ltp || !open) return '';
        var pct = _btPct(ltp, open);
        var col = _btCol(pct);
        return '<span class="bt-tape-item">'
            + '<span class="bt-ti-name">' + inst.s + '</span>'
            + '<span class="bt-ti-ltp">' + ltp.toLocaleString('en-IN') + '</span>'
            + '<span class="bt-ti-pct" style="color:' + col + '">' + (pct >= 0 ? '▲' : '▼') + Math.abs(pct).toFixed(2) + '%</span>'
            + '</span><span class="bt-tape-sep">·</span>';
    }).join('');
    jQ('#bt-tape-inner').html(items + items); // duplicate for seamless loop
}

// ── Heat Map ──────────────────────────────────────────────────────────────────
function _btRenderHeatmap() {
    var opens = _btOpens(), ltps = _btLtps();
    var h = '<div class="bt-hm-grid">';
    _BT_INSTR.forEach(function(inst) {
        var ltp   = parseFloat((ltps[inst.name]  || {}).ltp   || 0);
        var open  = parseFloat((opens[inst.name] || {}).price || 0);
        var score = 0; try { score = computeInstrumentScore(inst.name).total; } catch(e) {}
        var pct   = _btPct(ltp, open);
        var mag   = Math.min(1, Math.abs(score) / 8);
        var bg    = score > 0 ? 'rgba(63,185,80,'  + (0.12 + mag * 0.55).toFixed(2) + ')'
                  : score < 0 ? 'rgba(248,81,73,'  + (0.12 + mag * 0.55).toFixed(2) + ')'
                  :              'rgba(125,133,144,0.08)';
        var col   = _btCol(score);
        h += '<div class="bt-hm-cell" style="background:' + bg + ';border-color:' + col + '33;">'
            + '<div class="bt-hm-name">' + inst.s + '</div>'
            + (ltp ? '<div class="bt-hm-ltp">' + ltp.toLocaleString('en-IN') + '</div>' : '')
            + '<div class="bt-hm-pct" style="color:' + _btCol(pct) + '">' + _btSign(pct) + pct.toFixed(2) + '%</div>'
            + '<div class="bt-hm-score" style="color:' + col + '">' + _btSign(score) + score.toFixed(1) + '</div>'
            + '</div>';
    });
    h += '</div>';
    jQ('#bt-hm-body').html(h);
}

// ── Relative Strength ─────────────────────────────────────────────────────────
function _btRenderRelStrength() {
    var opens = _btOpens(), ltps = _btLtps();
    var data = _BT_INSTR.map(function(inst) {
        var ltp  = parseFloat((ltps[inst.name]  || {}).ltp   || 0);
        var open = parseFloat((opens[inst.name] || {}).price || 0);
        return { s: inst.s, pct: _btPct(ltp, open) };
    }).filter(function(d) { return d.pct !== 0; })
      .sort(function(a, b) { return b.pct - a.pct; });

    var maxAbs = Math.max.apply(null, data.map(function(d) { return Math.abs(d.pct); })) || 1;
    var h = '';
    data.forEach(function(d) {
        var col = _btCol(d.pct);
        var barW = (Math.abs(d.pct) / maxAbs * 100).toFixed(1);
        h += '<div class="bt-rs-row">'
            + '<span class="bt-rs-name">' + d.s + '</span>'
            + '<div class="bt-rs-track"><div class="bt-rs-bar" style="width:' + barW + '%;background:' + col + ';"></div></div>'
            + '<span class="bt-rs-val" style="color:' + col + '">' + _btSign(d.pct) + d.pct.toFixed(2) + '%</span>'
            + '</div>';
    });
    jQ('#bt-rs-body').html(h || '<span class="bt-hint">No LTP data yet</span>');
}

// ── Market Breadth ────────────────────────────────────────────────────────────
function _btRenderBreadth() {
    var opens = _btOpens(), ltps = _btLtps();
    var all = Object.assign({}, NIFTY_50_WEIGHTED_STOCKS, NIFTY_BANK_WEIGHTED_STOCKS);
    var above = 0, below = 0, neutral = 0, asoPlus = 0, bsoMinus = 0;

    jQ.each(all, function(name) {
        var ltp  = parseFloat((ltps[name]  || {}).ltp   || 0);
        var open = parseFloat((opens[name] || {}).price || 0);
        if (!ltp || !open) { neutral++; return; }
        if (ltp > open) above++; else if (ltp < open) below++; else neutral++;
        try {
            var ct = computeInstrumentScore(name).current_trend;
            if (ct > 0) asoPlus++; else if (ct < 0) bsoMinus++;
        } catch(e) {}
    });

    var total = above + below + neutral || 1;
    var aPct = (above  / total * 100).toFixed(0);
    var bPct = (below  / total * 100).toFixed(0);
    var nPct = (neutral / total * 100).toFixed(0);
    var adRatio = below > 0 ? (above / below).toFixed(2) : '∞';

    jQ('#bt-br-body').html(
        '<div class="bt-br-gauge">'
        + '<div class="bt-br-seg" style="width:' + aPct + '%;background:#3fb950;"></div>'
        + '<div class="bt-br-seg" style="width:' + nPct + '%;background:#30363d;"></div>'
        + '<div class="bt-br-seg" style="width:' + bPct + '%;background:#f85149;"></div>'
        + '</div>'
        + '<div class="bt-br-row"><span style="color:#3fb950;">▲ ' + above + ' (' + aPct + '%)</span><span style="color:#f85149;">▼ ' + below + ' (' + bPct + '%)</span></div>'
        + '<div class="bt-br-row bt-br-muted">Neutral: ' + neutral + ' &nbsp;|&nbsp; A/D: ' + adRatio + '</div>'
        + '<div class="bt-br-divider"></div>'
        + '<div class="bt-br-row bt-br-label">Strike zone</div>'
        + '<div class="bt-br-row"><span style="color:#3fb950;">ASO+ ' + asoPlus + '</span><span style="color:#f85149;">BSO− ' + bsoMinus + '</span></div>'
        + '<div class="bt-br-bar-wrap">'
        +   '<div style="height:6px;border-radius:3px;background:linear-gradient(90deg,#3fb950 ' + (asoPlus/(asoPlus+bsoMinus||1)*100).toFixed(0) + '%,#f85149 0);"></div>'
        + '</div>'
    );
}

// ── VIX Regime ────────────────────────────────────────────────────────────────
function _btRenderVIX() {
    var ltps = _btLtps();
    var vixVal = 0;
    try { vixVal = parseFloat((ltps['INDIA VIX'] || {}).ltp) || 0; } catch(e) {}
    // NOTE: VIX (config.js) is a manually-entered OVX proxy for the crude commodities
    // dashboard — never use it as an India VIX fallback here (NSE context).

    // vixVal === 0 means "no India VIX LTP cached yet" (e.g. before the first LTP scan),
    // NOT "volatility is actually zero" — must not fall into the LOW bucket, which would
    // misleadingly imply a real, calm reading instead of missing data.
    var regime, col, desc;
    if      (!vixVal)      { regime='NO DATA'; col='#7d8590'; desc='India VIX not loaded yet — run a refresh'; }
    else if (vixVal < 13)  { regime='LOW';      col='#3fb950'; desc='Low volatility — trend days likely'; }
    else if (vixVal < 18)  { regime='NORMAL';   col='#fbbf24'; desc='Normal range — balanced risk/reward'; }
    else if (vixVal < 25)  { regime='ELEVATED'; col='#f97316'; desc='Elevated — wider swings expected'; }
    else                   { regime='HIGH';     col='#f85149'; desc='High fear — whipsaws, wide spreads'; }

    var gaugePos = Math.min(98, (vixVal / 35) * 100).toFixed(1);
    var vixL = '—', vixU = '—';
    try { var nt = generateTrend('NIFTY 50'); vixL = nt.vix.vixDDLower; vixU = nt.vix.vixDDUpper; } catch(e) {}

    jQ('#bt-vx-body').html(
        '<div class="bt-vx-num" style="color:' + col + '">' + (vixVal ? vixVal.toFixed(2) : '—') + '</div>'
        + '<div class="bt-vx-regime" style="color:' + col + '">' + regime + '</div>'
        + '<div class="bt-vx-desc">' + desc + '</div>'
        + '<div class="bt-vx-gauge"><div class="bt-vx-track">'
        +   '<div style="position:absolute;top:0;left:0;height:100%;width:' + gaugePos + '%;background:linear-gradient(90deg,#3fb950 0%,#fbbf24 37%,#f97316 51%,#f85149 71%);border-radius:4px;"></div>'
        +   '<div class="bt-vx-needle" style="left:' + gaugePos + '%;"></div>'
        + '</div>'
        + '<div class="bt-vx-ticks"><span>0</span><span>13</span><span>18</span><span>25</span><span>35</span></div>'
        + '</div>'
        + '<div class="bt-vx-range">'
        + '<span><span class="bt-vx-rl">VIXL</span><b>' + vixL + '</b></span>'
        + '<span><span class="bt-vx-rl">VIXU</span><b>' + vixU + '</b></span>'
        + '</div>'
    );
}

// ── Options Flow ──────────────────────────────────────────────────────────────
function _btRenderOptionsFlow() {
    var flowNames = ['NIFTY 50','NIFTY BANK','RELIANCE','HDFCBANK','ICICIBANK'];
    var h = '';
    flowNames.forEach(function(name) {
        var sm = INSTRUMENT_SCORE_MAP[name];
        if (!sm || !sm.oiData || !sm.oiData.tableData) return;
        var netCE = 0, netPE = 0;
        sm.oiData.tableData.forEach(function(row) {
            netCE += parseFloat(row.CHG_OI_CE || 0);
            netPE += parseFloat(row.CHG_OI_PE || 0);
        });
        var maxF  = Math.max(Math.abs(netCE), Math.abs(netPE)) || 1;
        var ceW   = (Math.abs(netCE) / maxF * 100).toFixed(1);
        var peW   = (Math.abs(netPE) / maxF * 100).toFixed(1);
        // CE add = writing = bearish; PE add = writing = bullish
        var ceCol = netCE > 0 ? '#f85149' : '#3fb950';
        var peCol = netPE > 0 ? '#3fb950' : '#f85149';
        var lbl   = name.replace('NIFTY 50','N50').replace('NIFTY BANK','NB');

        h += '<div class="bt-fl-col">'
            + '<div class="bt-fl-name">' + lbl + '</div>'
            + '<div class="bt-fl-bars">'
            +   '<div class="bt-fl-label" style="color:' + ceCol + '">CE</div>'
            +   '<div class="bt-fl-track"><div style="height:100%;width:' + ceW + '%;background:' + ceCol + ';border-radius:2px;"></div></div>'
            +   '<div class="bt-fl-val" style="color:' + ceCol + '">' + _btSign(netCE) + _btFmt(netCE) + '</div>'
            + '</div>'
            + '<div class="bt-fl-bars">'
            +   '<div class="bt-fl-label" style="color:' + peCol + '">PE</div>'
            +   '<div class="bt-fl-track"><div style="height:100%;width:' + peW + '%;background:' + peCol + ';border-radius:2px;"></div></div>'
            +   '<div class="bt-fl-val" style="color:' + peCol + '">' + _btSign(netPE) + _btFmt(netPE) + '</div>'
            + '</div>'
            + '</div>';
    });
    jQ('#bt-fl-body').html(h || '<span class="bt-hint">Run a refresh to load OI data</span>');
}

// ── Correlation Matrix ────────────────────────────────────────────────────────
async function _btRenderCorrelation() {
    var names  = ['NIFTY 50','NIFTY BANK','GIFT NIFTY','SENSEX','RELIANCE','HDFCBANK'];
    var shorts = { 'NIFTY 50':'N50','NIFTY BANK':'NB','GIFT NIFTY':'GN','SENSEX':'SX','RELIANCE':'REL','HDFCBANK':'HDF' };

    jQ('#bt-co-body').html('<span class="bt-hint"><i class="bi bi-hourglass-split"></i> Fetching 5-min candles…</span>');

    var closes = {};
    await Promise.all(names.map(async function(name) {
        try {
            var res = await getHistoricalDataUsingPromise(INSTRUMENT_TOKENS[name], _gtbCurrDay(), _gtbCurrDayTo(), '5minute');
            closes[name] = (res.data.candles || []).map(function(c) { return parseFloat(c[4]); });
        } catch(e) { closes[name] = []; }
    }));

    // % returns
    var rets = {};
    names.forEach(function(name) {
        var cl = closes[name] || [];
        rets[name] = [];
        for (var i = 1; i < cl.length; i++) rets[name].push((cl[i] - cl[i-1]) / cl[i-1]);
    });

    function pearson(a, b) {
        var n = Math.min(a.length, b.length);
        if (n < 2) return NaN;
        var mA = 0, mB = 0;
        for (var i = 0; i < n; i++) { mA += a[i]; mB += b[i]; }
        mA /= n; mB /= n;
        var num = 0, dA = 0, dB = 0;
        for (var i = 0; i < n; i++) {
            var da = a[i]-mA, db = b[i]-mB;
            num += da*db; dA += da*da; dB += db*db;
        }
        return (dA*dB === 0) ? 1 : num / Math.sqrt(dA*dB);
    }

    var h = '<table class="bt-corr-tbl"><tr><th></th>';
    names.forEach(function(n) { h += '<th>' + shorts[n] + '</th>'; });
    h += '</tr>';
    names.forEach(function(nA) {
        h += '<tr><th>' + shorts[nA] + '</th>';
        names.forEach(function(nB) {
            var r   = nA === nB ? 1 : pearson(rets[nA]||[], rets[nB]||[]);
            if (isNaN(r)) { h += '<td class="bt-corr-na">—</td>'; return; }
            var mag = Math.abs(r);
            var bg  = r > 0 ? 'rgba(63,185,80,' + (0.08 + mag*0.65).toFixed(2) + ')'
                             : 'rgba(248,81,73,' + (0.08 + mag*0.65).toFixed(2) + ')';
            var fc  = mag > 0.6 ? (r > 0 ? '#3fb950' : '#f85149') : 'var(--gtb-text)';
            h += '<td style="background:' + bg + ';color:' + fc + ';font-weight:' + (nA===nB?'700':'400') + ';text-align:center;">' + r.toFixed(2) + '</td>';
        });
        h += '</tr>';
    });
    h += '</table>';
    jQ('#bt-co-body').html(h);
}

// ── Intraday Snapshot ─────────────────────────────────────────────────────────
function _btRenderStats() {
    var opens = _btOpens(), ltps = _btLtps();
    var labelMap = {'2':'AST','1':'ASO','0':'B/W','-1':'BSO','-2':'BST'};
    var h = '<table class="bt-st-tbl"><thead><tr>'
        + '<th>Instr</th><th>LTP</th><th>Chg%</th><th>Score</th><th>Zone</th><th>9:15</th>'
        + '<th><button class="bt-analyze-all-btn gtb-win-btn" title="Analyze all instruments"><i class="bi bi-grid-3x3-gap-fill"></i></button></th>'
        + '</tr></thead><tbody>';

    _BT_INSTR.forEach(function(inst) {
        var name   = inst.name;
        var ltp    = parseFloat((ltps[name]  || {}).ltp   || 0);
        var open   = parseFloat((opens[name] || {}).price || 0);
        if (!ltp)  { h += '<tr><td>' + inst.s + '</td><td colspan="6" style="color:var(--gtb-muted)">—</td></tr>'; return; }
        var pct    = _btPct(ltp, open);
        var sc     = 0, ct = 0;
        try { var cs = computeInstrumentScore(name); sc = cs.total; ct = cs.current_trend; } catch(e) {}
        var c915   = '';
        try { c915 = (JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}')[name] || {}).CLOSE_9_15 || 'B/W'; } catch(e) {}
        var zone   = labelMap[String(ct)] || 'B/W';
        var pCol   = _btCol(pct), sCol = _btCol(sc), zCol = ct > 0 ? '#3fb950' : ct < 0 ? '#f85149' : '#7d8590';
        var c9Col  = (c915==='AST'||c915==='ASO') ? '#3fb950' : (c915==='BST'||c915==='BSO') ? '#f85149' : '#7d8590';

        h += '<tr>'
            + '<td class="bt-st-name">' + inst.s + '</td>'
            + '<td class="bt-st-mono">' + ltp.toLocaleString('en-IN') + '</td>'
            + '<td style="color:' + pCol + '">' + _btSign(pct) + pct.toFixed(2) + '%</td>'
            + '<td style="color:' + sCol + ';font-weight:600;">' + _btSign(sc) + sc.toFixed(1) + '</td>'
            + '<td><span class="bt-tz" style="color:' + zCol + ';border-color:' + zCol + '44;background:' + zCol + '11;">' + zone + '</span></td>'
            + '<td><span class="bt-tz" style="color:' + c9Col + ';border-color:' + c9Col + '44;background:' + c9Col + '11;">' + (c915||'—') + '</span></td>'
            + '<td><button class="bt-analyze-btn gtb-win-btn" data-name="' + name + '" title="Open Instrument Detail View for ' + name + '"><i class="bi bi-search"></i></button></td>'
            + '</tr>';
    });
    h += '</tbody></table>';
    jQ('#bt-st-body').html(h);
}

jQ(document).off('click.bt-analyze').on('click.bt-analyze', '.bt-analyze-btn', function(e) {
    e.preventDefault();
    if (typeof _gtbOpenInstrDetailFor === 'function') _gtbOpenInstrDetailFor(jQ(this).data('name'));
    else _btAnalyzeInstrument(jQ(this).data('name'));
});
jQ(document).off('click.bt-analyze-all').on('click.bt-analyze-all', '.bt-analyze-all-btn', function(e) {
    e.preventDefault();
    _btAnalyzeAll();
});

