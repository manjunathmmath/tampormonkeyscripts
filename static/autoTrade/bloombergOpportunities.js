// ── Opportunities Engine ──────────────────────────────────────────────────────
// Tabs: Scanner | Liquidity | Divergence | Opportunity Feed

var _BTO = {
    interval:   null,
    intervalMs: 30000,
    prevZones:  {},          // { name: zone_string }
    prevScores: {},          // { name: total_score }
    events:     [],          // event log, newest first
    maxEvents:  200,
    running:    false,
    lastScan:   null,
    scanCount:  0
};

// ── Entry point ───────────────────────────────────────────────────────────────
// #show-opportunities handled by _gtbInitTabs() in grootTradeBot.js when groot bot is open.
jQ(document).on('click', '#show-opportunities', function(e) {
    if (jQ('#gtb-tab-strip').length) return; // handled by tab system
    e.preventDefault();
    _btoShow();
});

function _btoShow() {
    var divId = 'popup-custom-style-opportunities';

    var body = '<div id="bto-wrap">'
        + '<div class="bto-tabs">'
        +   '<button class="bto-tab active" data-tab="scanner"><i class="bi bi-search"></i> Scanner</button>'
        +   '<button class="bto-tab" data-tab="liquidity"><i class="bi bi-droplet-fill"></i> Liquidity</button>'
        +   '<button class="bto-tab" data-tab="divergence"><i class="bi bi-arrows-expand"></i> Divergence</button>'
        +   '<button class="bto-tab" data-tab="feed"><i class="bi bi-lightning-charge-fill"></i> Opportunity Feed</button>'
        + '</div>'
        + '<div id="bto-scanner"  class="bto-panel active">' + _btoScannerHtml()  + '</div>'
        + '<div id="bto-liquidity" class="bto-panel">'       + _btoLiquidityHtml() + '</div>'
        + '<div id="bto-divergence" class="bto-panel">'      + _btoDivergenceHtml() + '</div>'
        + '<div id="bto-feed"     class="bto-panel">'        + _btoFeedHtml()       + '</div>'
        + '</div>';

    showPopUpWindow('opportunities', body, 'Opportunities', 1100, 680);
    jQ('.' + divId).find('.popupwindow_titlebar_text').html(
        '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<span style="font-weight:900;font-size:0.72rem;letter-spacing:.1em;color:var(--gtb-accent);">'
        + '<i class="bi bi-lightning-charge-fill"></i> OPPORTUNITIES</span>'
        + popupWinControls(divId)
        + '</div>'
    );
    hideNativePopupButtons(divId);
    jQ('.' + divId).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');

    // Tab switching
    jQ(document).off('click.btotab').on('click.btotab', '.bto-tab', function() {
        jQ('.bto-tab').removeClass('active');
        jQ('.bto-panel').removeClass('active');
        jQ(this).addClass('active');
        jQ('#bto-' + jQ(this).data('tab')).addClass('active');
    });

    // Scanner controls
    jQ(document).off('click.btoscan').on('click.btoscan', '#bto-start', _btoStartScanner);
    jQ(document).off('click.btostop').on('click.btostop', '#bto-stop',  _btoStopScanner);
    jQ(document).off('click.btoclr').on('click.btoclr',  '#bto-clear',  function() {
        _BTO.events = []; _btoRefreshFeed(); _btoRefreshEvents();
    });
    jQ(document).off('change.btoiv').on('change.btoiv', '#bto-interval', function() {
        _BTO.intervalMs = parseInt(jQ(this).val());
        if (_BTO.running) { _btoStopScanner(); _btoStartScanner(); }
    });

    // Liquidity load
    jQ(document).off('click.btoliq').on('click.btoliq', '#bto-liq-load', _btoRenderLiquidity);

    // Divergence compute
    jQ(document).off('click.btodiv').on('click.btodiv', '#bto-div-load', _btoRenderDivergence);

    // Feed load
    jQ(document).off('click.btofeed').on('click.btofeed', '#bto-feed-load', _btoRenderFeed);

    // Restore running state
    if (_BTO.running) _btoRefreshEvents();
    _btoUpdateStatus();
}

// Render opportunities into a tab pane (no popup)
function _btoShow_inpane(targetEl) {
    var body = '<div id="bto-wrap">'
        + '<div class="bto-tabs">'
        +   '<button class="bto-tab active" data-tab="scanner"><i class="bi bi-search"></i> Scanner</button>'
        +   '<button class="bto-tab" data-tab="liquidity"><i class="bi bi-droplet-fill"></i> Liquidity</button>'
        +   '<button class="bto-tab" data-tab="divergence"><i class="bi bi-arrows-expand"></i> Divergence</button>'
        +   '<button class="bto-tab" data-tab="feed"><i class="bi bi-lightning-charge-fill"></i> Opportunity Feed</button>'
        + '</div>'
        + '<div id="bto-scanner"   class="bto-panel active">' + _btoScannerHtml()   + '</div>'
        + '<div id="bto-liquidity"  class="bto-panel">'       + _btoLiquidityHtml() + '</div>'
        + '<div id="bto-divergence" class="bto-panel">'       + _btoDivergenceHtml() + '</div>'
        + '<div id="bto-feed"       class="bto-panel">'       + _btoFeedHtml()       + '</div>'
        + '</div>';
    jQ(targetEl).html(body);
    jQ(document).off('click.btotab').on('click.btotab', '.bto-tab', function() {
        jQ('.bto-tab').removeClass('active');
        jQ('.bto-panel').removeClass('active');
        jQ(this).addClass('active');
        jQ('#bto-' + jQ(this).data('tab')).addClass('active');
    });
    jQ(document).off('click.btoscan').on('click.btoscan', '#bto-start', _btoStartScanner);
    jQ(document).off('click.btostop').on('click.btostop', '#bto-stop',  _btoStopScanner);
    jQ(document).off('click.btoclr').on('click.btoclr',   '#bto-clear', function() {
        _BTO.events = []; _btoRefreshFeed(); _btoRefreshEvents();
    });
    jQ(document).off('change.btoiv').on('change.btoiv', '#bto-interval', function() {
        _BTO.intervalMs = parseInt(jQ(this).val());
        if (_BTO.running) { _btoStopScanner(); _btoStartScanner(); }
    });
    jQ(document).off('click.btoliq').on('click.btoliq',   '#bto-liq-load',  _btoRenderLiquidity);
    jQ(document).off('click.btodiv').on('click.btodiv',   '#bto-div-load',  _btoRenderDivergence);
    jQ(document).off('click.btofeed').on('click.btofeed', '#bto-feed-load', _btoRenderFeed);
    if (_BTO.running) _btoRefreshEvents();
    _btoUpdateStatus();
}

// ── Scanner HTML shell ────────────────────────────────────────────────────────
function _btoScannerHtml() {
    return '<div class="bto-scanner-toolbar">'
        + '<button id="bto-start" class="bto-btn bto-btn-green"><i class="bi bi-play-fill"></i> Start</button>'
        + '<button id="bto-stop"  class="bto-btn bto-btn-red"><i class="bi bi-stop-fill"></i> Stop</button>'
        + '<select id="bto-interval" class="bto-sel">'
        +   '<option value="15000">Every 15s</option>'
        +   '<option value="30000" selected>Every 30s</option>'
        +   '<option value="60000">Every 60s</option>'
        +   '<option value="120000">Every 2 min</option>'
        + '</select>'
        + '<span id="bto-status" class="bto-status">Stopped</span>'
        + '<span id="bto-scan-stats" class="bto-scan-stats"></span>'
        + '<button id="bto-clear" class="bto-btn" style="margin-left:auto;">Clear</button>'
        + '</div>'
        + '<div class="bto-scan-legend">'
        +   '<span class="bto-leg bull"><i class="bi bi-arrow-up-right-circle"></i> Bullish breakout</span>'
        +   '<span class="bto-leg bear"><i class="bi bi-arrow-down-right-circle"></i> Bearish breakdown</span>'
        +   '<span class="bto-leg warn"><i class="bi bi-exclamation-triangle"></i> Conflict / reversal</span>'
        +   '<span class="bto-leg info"><i class="bi bi-info-circle"></i> Score shift</span>'
        + '</div>'
        + '<div id="bto-events" class="bto-events-wrap"><div class="bto-empty-msg">Start the scanner to watch for breakouts across all F&O stocks</div></div>';
}

// ── Scanner logic ─────────────────────────────────────────────────────────────
function _btoStartScanner() {
    if (_BTO.running) return;
    _BTO.running = true;
    _btoUpdateStatus();
    _btoScanOnce();
    _BTO.interval = setInterval(_btoScanOnce, _BTO.intervalMs);
}

function _btoStopScanner() {
    _BTO.running = false;
    if (_BTO.interval) { clearInterval(_BTO.interval); _BTO.interval = null; }
    _btoUpdateStatus();
}

function _btoUpdateStatus() {
    var $s = jQ('#bto-status');
    if (_BTO.running) {
        $s.html('<span style="color:#3fb950;"><i class="bi bi-circle-fill bto-pulse"></i> Scanning</span>');
    } else {
        $s.html('<span style="color:#7d8590;"><i class="bi bi-circle"></i> Stopped</span>');
    }
    var last = _BTO.lastScan ? 'Last: ' + _BTO.lastScan : '';
    var bull = _BTO.events.filter(function(e) { return e.type === 'bull'; }).length;
    var bear = _BTO.events.filter(function(e) { return e.type === 'bear'; }).length;
    var warn = _BTO.events.filter(function(e) { return e.type === 'warn'; }).length;
    jQ('#bto-scan-stats').html(
        last
        + (last ? ' &nbsp;|&nbsp; ' : '')
        + '<span style="color:#3fb950;">' + bull + ' bull</span> &nbsp;'
        + '<span style="color:#f85149;">' + bear + ' bear</span> &nbsp;'
        + '<span style="color:#fbbf24;">' + warn + ' warn</span>'
    );
}

function _btoScanOnce() {
    var now   = new Date();
    var hhmm  = ('0'+now.getHours()).slice(-2) + ':' + ('0'+now.getMinutes()).slice(-2) + ':' + ('0'+now.getSeconds()).slice(-2);
    _BTO.lastScan = hhmm;
    _BTO.scanCount++;

    var labelMap = {'2':'AST','1':'ASO','0':'B/W','-1':'BSO','-2':'BST'};
    var allNames = (typeof FO_LIST !== 'undefined' ? FO_LIST : []).concat(
        ['NIFTY 50','NIFTY BANK','GIFT NIFTY','SENSEX','RELIANCE','HDFCBANK','ICICIBANK']
    );
    // deduplicate
    var seen = {}; allNames = allNames.filter(function(n) { return seen[n] ? false : (seen[n]=true); });

    allNames.forEach(function(name) {
        var cs;
        try { cs = computeInstrumentScore(name); } catch(e) { return; }
        var zone  = labelMap[String(cs.current_trend)] || 'B/W';
        var score = cs.total;
        var prev  = _BTO.prevZones[name];
        var prevS = _BTO.prevScores[name];

        // Zone breakout detection
        if (prev !== undefined && prev !== zone) {
            var evt = _btoZoneEvent(name, prev, zone, score, hhmm);
            if (evt) { _BTO.events.unshift(evt); if (_BTO.events.length > _BTO.maxEvents) _BTO.events.pop(); }
        }

        // Score flip detection (crossed zero or large shift)
        if (prevS !== undefined) {
            var crossed = (prevS >= 0 && score < 0) || (prevS <= 0 && score > 0);
            var bigShift = Math.abs(score - prevS) >= 3;
            if ((crossed || bigShift) && !(prev !== undefined && prev !== zone)) {
                _BTO.events.unshift({
                    ts: hhmm, name: name, type: score > 0 ? 'bull' : score < 0 ? 'bear' : 'info',
                    icon: score > 0 ? 'bi-arrow-up-right' : score < 0 ? 'bi-arrow-down-right' : 'bi-dash',
                    title: 'Score shift',
                    detail: 'Score ' + (prevS >= 0 ? '+' : '') + prevS.toFixed(1) + ' -> ' + (score >= 0 ? '+' : '') + score.toFixed(1),
                    zone: zone, score: score
                });
                if (_BTO.events.length > _BTO.maxEvents) _BTO.events.pop();
            }
        }

        _BTO.prevZones[name]  = zone;
        _BTO.prevScores[name] = score;
    });

    _btoRefreshEvents();
    _btoUpdateStatus();
    // Also refresh feed tab if it was loaded
    _btoRefreshFeed();
}

function _btoZoneEvent(name, prev, zone, score, ts) {
    var bullBreak  = { 'BST->BSO':1,'BSO->B/W':1,'B/W->ASO':1,'ASO->AST':1,'BST->B/W':1,'BSO->ASO':1,'B/W->AST':1 };
    var bearBreak  = { 'AST->ASO':1,'ASO->B/W':1,'B/W->BSO':1,'BSO->BST':1,'AST->B/W':1,'ASO->BSO':1,'B/W->BST':1 };
    var key        = prev + '->' + zone;
    var isBull     = bullBreak[key];
    var isBear     = bearBreak[key];
    var isConflict = (prev==='AST'||prev==='ASO') && (zone==='BSO'||zone==='BST')
                  || (prev==='BST'||prev==='BSO') && (zone==='ASO'||zone==='AST');

    var type = isBull ? 'bull' : isBear ? 'bear' : isConflict ? 'warn' : 'info';
    var icon = isBull ? 'bi-arrow-up-right-circle-fill' : isBear ? 'bi-arrow-down-right-circle-fill'
             : isConflict ? 'bi-exclamation-triangle-fill' : 'bi-arrow-left-right';
    var title = isBull ? 'Bullish breakout' : isBear ? 'Bearish breakdown'
              : isConflict ? 'Conflict reversal' : 'Zone change';

    return { ts: ts, name: name, type: type, icon: icon, title: title,
             detail: prev + ' -> ' + zone, zone: zone, score: score };
}

function _btoRefreshEvents() {
    var $wrap = jQ('#bto-events');
    if (!$wrap.length) return;
    if (!_BTO.events.length) {
        $wrap.html('<div class="bto-empty-msg">No events yet. Scanner is watching ' + Object.keys(_BTO.prevZones).length + ' instruments...</div>');
        return;
    }
    var typeCol  = { bull:'#3fb950', bear:'#f85149', warn:'#fbbf24', info:'#7d8590' };
    var typeBg   = { bull:'#3fb95010', bear:'#f8514910', warn:'#fbbf2410', info:'#7d859008' };
    var html = _BTO.events.map(function(ev) {
        var c = typeCol[ev.type] || '#7d8590';
        var sc = (ev.score >= 0 ? '+' : '') + parseFloat(ev.score).toFixed(1);
        return '<div class="bto-event" style="border-left-color:' + c + ';background:' + (typeBg[ev.type]||'') + ';">'
            + '<span class="bto-ev-ts">' + ev.ts + '</span>'
            + '<i class="bi ' + ev.icon + '" style="color:' + c + ';font-size:0.75rem;"></i>'
            + '<span class="bto-ev-name">' + ev.name + '</span>'
            + '<span class="bto-ev-title" style="color:' + c + '">' + ev.title + '</span>'
            + '<span class="bto-ev-detail">' + ev.detail + '</span>'
            + '<span class="bto-ev-score" style="color:' + c + '">' + sc + '</span>'
            + '<button class="bto-ev-btn gtb-win-btn" data-name="' + ev.name + '" title="Full Analysis"><i class="bi bi-search"></i></button>'
            + '</div>';
    }).join('');
    $wrap.html(html);
}

// ── Liquidity HTML shell ──────────────────────────────────────────────────────
function _btoLiquidityHtml() {
    return '<div class="bto-load-toolbar">'
        + '<button id="bto-liq-load" class="bto-btn bto-btn-blue"><i class="bi bi-droplet-fill"></i> Compute Liquidity</button>'
        + '<span class="bto-hint-inline">Reads cached OI from INSTRUMENT_SCORE_MAP -- run a main refresh first for best results</span>'
        + '</div>'
        + '<div id="bto-liq-body" class="bto-content-body"><div class="bto-empty-msg">Click Compute Liquidity to analyse</div></div>';
}

function _btoRenderLiquidity() {
    var $btn  = jQ('#bto-liq-load').prop('disabled', true).html('<i class="bi bi-arrow-clockwise spin"></i> Computing...');
    var $body = jQ('#bto-liq-body');

    // PCR extremes
    var pcrList = [];
    // OI walls: top CE and PE strikes per instrument
    var walls = [];
    // Net flow: instruments with largest imbalance
    var flowList = [];

    var checkNames = (typeof FO_LIST !== 'undefined' ? FO_LIST : []).concat(
        ['NIFTY 50','NIFTY BANK','RELIANCE','HDFCBANK','ICICIBANK']
    );
    var seenN = {}; checkNames = checkNames.filter(function(n) { return seenN[n] ? false : (seenN[n]=true); });

    checkNames.forEach(function(name) {
        var sm = INSTRUMENT_SCORE_MAP[name];
        if (!sm) return;

        // PCR
        if (sm.pcr != null) {
            pcrList.push({ name: name, pcr: parseFloat(sm.pcr), chPcr: sm.chPcr || 0 });
        }

        // OI walls + flow
        if (sm.oiData && sm.oiData.tableData && sm.oiData.tableData.length) {
            var maxCE = { strike: null, oi: 0 }, maxPE = { strike: null, oi: 0 };
            var netCE = 0, netPE = 0;
            sm.oiData.tableData.forEach(function(row) {
                var ce = parseFloat(row.OI_CE || 0), pe = parseFloat(row.OI_PE || 0);
                var dce = parseFloat(row.CHG_OI_CE || 0), dpe = parseFloat(row.CHG_OI_PE || 0);
                if (ce > maxCE.oi) maxCE = { strike: row.STRIKE, oi: ce };
                if (pe > maxPE.oi) maxPE = { strike: row.STRIKE, oi: pe };
                netCE += dce; netPE += dpe;
            });
            walls.push({ name: name, maxCE: maxCE, maxPE: maxPE });
            var net = netPE - netCE;
            var scale = Math.max(Math.abs(netPE), Math.abs(netCE)) || 1;
            flowList.push({ name: name, net: net, netCE: netCE, netPE: netPE, imbal: Math.abs(net)/scale, score: (INSTRUMENT_SCORE_MAP[name]||{}).oi_obv || 0 });
        }
    });

    pcrList.sort(function(a,b) { return Math.abs(b.pcr-1) - Math.abs(a.pcr-1); });
    flowList.sort(function(a,b) { return b.imbal - a.imbal; });
    var fmtN = function(v) { return Math.abs(v) >= 1e6 ? (v/1e6).toFixed(1)+'M' : Math.abs(v) >= 1e3 ? (v/1e3).toFixed(0)+'K' : parseInt(v); };
    var sign = function(v) { return v >= 0 ? '+' : ''; };

    // Section 1: PCR extremes
    var pcrHtml = '<div class="bto-section-hdr"><i class="bi bi-thermometer-half"></i> PCR EXTREMES <span class="bto-section-sub">(deviation from 1.0 = strongest signal)</span></div>';
    if (!pcrList.length) {
        pcrHtml += '<div class="bto-empty-msg">No PCR data -- run main refresh first</div>';
    } else {
        pcrHtml += '<div class="bto-liq-grid">';
        pcrList.slice(0, 20).forEach(function(p) {
            var col   = p.pcr > 1.3 ? '#3fb950' : p.pcr < 0.7 ? '#f85149' : p.pcr > 1.1 ? '#86efac' : p.pcr < 0.9 ? '#fca5a5' : '#7d8590';
            var label = p.pcr > 1.3 ? 'Extreme PUT writing -- BULL'
                      : p.pcr > 1.1 ? 'Put-heavy -- mild BULL'
                      : p.pcr < 0.7 ? 'Extreme CALL writing -- BEAR'
                      : p.pcr < 0.9 ? 'Call-heavy -- mild BEAR' : 'Balanced';
            var barW  = Math.min(100, Math.abs(p.pcr - 1) * 200);
            var barCol = p.pcr > 1 ? '#3fb950' : '#f85149';
            pcrHtml += '<div class="bto-liq-card" style="border-color:' + col + '33;">'
                + '<div class="bto-liq-name">' + p.name + '</div>'
                + '<div class="bto-liq-pcr" style="color:' + col + '">' + p.pcr.toFixed(2) + '</div>'
                + '<div class="bto-liq-bar-wrap"><div class="bto-liq-bar" style="width:' + barW + '%;background:' + barCol + ';"></div></div>'
                + '<div class="bto-liq-label" style="color:' + col + ';font-size:0.48rem;">' + label + '</div>'
                + (p.chPcr ? '<div class="bto-liq-chg" style="color:' + (p.chPcr > 0 ? '#3fb950' : '#f85149') + ';">' + (p.chPcr > 0 ? 'Rising PCR' : 'Falling PCR') + '</div>' : '')
                + '</div>';
        });
        pcrHtml += '</div>';
    }

    // Section 2: OI walls (where market makers are writing)
    var wallHtml = '<div class="bto-section-hdr" style="margin-top:12px;"><i class="bi bi-bricks"></i> OI WALLS <span class="bto-section-sub">(highest open interest strikes = key support / resistance)</span></div>';
    if (!walls.length) {
        wallHtml += '<div class="bto-empty-msg">No OI data -- run main refresh first</div>';
    } else {
        wallHtml += '<table class="bto-wall-tbl"><thead><tr><th>Instrument</th><th>Max CE Strike (resistance)</th><th>CE OI</th><th>Max PE Strike (support)</th><th>PE OI</th></tr></thead><tbody>';
        walls.forEach(function(w) {
            wallHtml += '<tr>'
                + '<td style="font-weight:700;">' + w.name + '</td>'
                + '<td style="color:#f85149;">' + (w.maxCE.strike||'--') + '</td>'
                + '<td style="color:#f85149;">' + fmtN(w.maxCE.oi) + '</td>'
                + '<td style="color:#3fb950;">' + (w.maxPE.strike||'--') + '</td>'
                + '<td style="color:#3fb950;">' + fmtN(w.maxPE.oi) + '</td>'
                + '</tr>';
        });
        wallHtml += '</tbody></table>';
    }

    // Section 3: Flow imbalance
    var flowHtml = '<div class="bto-section-hdr" style="margin-top:12px;"><i class="bi bi-arrows-collapse"></i> OPTIONS FLOW IMBALANCE <span class="bto-section-sub">(instruments with strongest PE vs CE writing bias)</span></div>';
    if (!flowList.length) {
        flowHtml += '<div class="bto-empty-msg">No OI data -- run main refresh first</div>';
    } else {
        flowHtml += '<table class="bto-wall-tbl"><thead><tr><th>Instrument</th><th>Net PE dOI</th><th>Net CE dOI</th><th>Net Flow</th><th>Imbalance</th><th>Bias</th></tr></thead><tbody>';
        flowList.slice(0, 20).forEach(function(f) {
            var col   = f.net > 0 ? '#3fb950' : '#f85149';
            var label = f.net > 0 ? 'PE dominant -- BULL' : 'CE dominant -- BEAR';
            flowHtml += '<tr>'
                + '<td style="font-weight:700;">' + f.name + '</td>'
                + '<td style="color:#3fb950;">' + sign(f.netPE) + fmtN(f.netPE) + '</td>'
                + '<td style="color:#f85149;">' + sign(f.netCE) + fmtN(f.netCE) + '</td>'
                + '<td style="color:' + col + ';font-weight:600;">' + sign(f.net) + fmtN(f.net) + '</td>'
                + '<td><div class="bto-liq-bar-wrap" style="min-width:60px;"><div class="bto-liq-bar" style="width:' + (f.imbal*100).toFixed(0) + '%;background:' + col + ';"></div></div></td>'
                + '<td style="color:' + col + ';font-size:0.54rem;">' + label + '</td>'
                + '</tr>';
        });
        flowHtml += '</tbody></table>';
    }

    $body.html(pcrHtml + wallHtml + flowHtml);
    $btn.prop('disabled', false).html('<i class="bi bi-droplet-fill"></i> Recompute');
}

// ── Divergence HTML shell ─────────────────────────────────────────────────────
function _btoDivergenceHtml() {
    return '<div class="bto-load-toolbar">'
        + '<button id="bto-div-load" class="bto-btn bto-btn-blue"><i class="bi bi-arrows-expand"></i> Compute Divergence</button>'
        + '<span class="bto-hint-inline">Compares index score vs weighted constituent scores to find lead/lag signals</span>'
        + '</div>'
        + '<div id="bto-div-body" class="bto-content-body"><div class="bto-empty-msg">Click Compute Divergence to analyse</div></div>';
}

function _btoRenderDivergence() {
    var $btn  = jQ('#bto-div-load').prop('disabled', true).html('<i class="bi bi-arrow-clockwise spin"></i> Computing...');
    var $body = jQ('#bto-div-body');

    function _weightedScore(stockMap) {
        var wScore = 0, totalW = 0, rows = [];
        jQ.each(stockMap, function(name, weight) {
            var cs;
            try { cs = computeInstrumentScore(name); } catch(e) { return; }
            wScore += cs.total * (weight / 100);
            totalW += weight;
            rows.push({ name: name, weight: weight, score: cs.total,
                        zone: ({'2':'AST','1':'ASO','0':'B/W','-1':'BSO','-2':'BST'}[String(cs.current_trend)]||'B/W'),
                        contrib: cs.total * (weight / 100) });
        });
        return { score: totalW ? wScore : 0, rows: rows };
    }

    var indices = [
        { idx: 'NIFTY 50',   map: NIFTY_50_WEIGHTED_STOCKS,   label: 'NIFTY 50 vs Top-10 Constituents' },
        { idx: 'NIFTY BANK', map: NIFTY_BANK_WEIGHTED_STOCKS, label: 'BANK NIFTY vs Top-10 Constituents' },
    ];

    var html = '';
    indices.forEach(function(ig) {
        var idxCs;
        try { idxCs = computeInstrumentScore(ig.idx); } catch(e) { idxCs = { total:0, current_trend:0 }; }
        var idxScore  = idxCs.total;
        var idxZone   = {'2':'AST','1':'ASO','0':'B/W','-1':'BSO','-2':'BST'}[String(idxCs.current_trend)] || 'B/W';
        var constData = _weightedScore(ig.map);
        var constScore = constData.score;
        var divergence = idxScore - constScore;

        var divLabel, divCol, divAction;
        if (divergence > 2) {
            divLabel = 'INDEX LEADING (+' + divergence.toFixed(1) + ')';
            divCol   = '#fbbf24';
            divAction = 'Index is stronger than constituents. If constituents catch up: continuation. If index corrects: reversal. Watch constituent breakouts.';
        } else if (divergence < -2) {
            divLabel = 'INDEX LAGGING (' + divergence.toFixed(1) + ')';
            divCol   = '#f97316';
            divAction = 'Constituents are stronger than the index. Index may catch up (bull) or constituents may roll over (bear). High-probability move incoming.';
        } else if (Math.abs(divergence) <= 0.5) {
            divLabel = 'ALIGNED (' + (divergence >= 0 ? '+' : '') + divergence.toFixed(1) + ')';
            divCol   = idxScore > 0 ? '#3fb950' : idxScore < 0 ? '#f85149' : '#7d8590';
            divAction = 'Index and constituents aligned. Trend has broad participation -- high conviction signal.';
        } else {
            divLabel = 'MILD DIVERGE (' + (divergence >= 0 ? '+' : '') + divergence.toFixed(1) + ')';
            divCol   = '#7d8590';
            divAction = 'Minor divergence. Monitor if it widens.';
        }

        var idxCol = idxScore > 0 ? '#3fb950' : idxScore < 0 ? '#f85149' : '#7d8590';
        var cnCol  = constScore > 0 ? '#3fb950' : constScore < 0 ? '#f85149' : '#7d8590';

        html += '<div class="bto-div-block">'
            + '<div class="bto-section-hdr"><i class="bi bi-arrows-expand"></i> ' + ig.label + '</div>'

            + '<div class="bto-div-summary">'
            +   '<div class="bto-div-metric"><span class="bto-div-label">Index Score</span><span class="bto-div-val" style="color:' + idxCol + '">' + (idxScore >= 0 ? '+' : '') + idxScore.toFixed(1) + '</span><span class="bto-div-sub" style="color:' + idxCol + '">' + idxZone + '</span></div>'
            +   '<div class="bto-div-metric"><span class="bto-div-label">Constituent Wt. Score</span><span class="bto-div-val" style="color:' + cnCol + '">' + (constScore >= 0 ? '+' : '') + constScore.toFixed(2) + '</span><span class="bto-div-sub">weighted avg</span></div>'
            +   '<div class="bto-div-metric"><span class="bto-div-label">Divergence</span><span class="bto-div-val" style="color:' + divCol + '">' + divLabel + '</span><span class="bto-div-sub" style="color:' + divCol + ';font-size:0.5rem;max-width:220px;line-height:1.5;">' + divAction + '</span></div>'
            + '</div>'

            // Constituent breakdown table
            + '<table class="bto-div-tbl"><thead><tr><th>Stock</th><th>Weight%</th><th>Score</th><th>Zone</th><th>Contribution</th><th>Direction</th></tr></thead><tbody>';

        constData.rows.sort(function(a,b) { return Math.abs(b.contrib) - Math.abs(a.contrib); });
        constData.rows.forEach(function(r) {
            var sc = r.score > 0 ? '#3fb950' : r.score < 0 ? '#f85149' : '#7d8590';
            var zc = (r.zone==='AST'||r.zone==='ASO') ? '#3fb950' : (r.zone==='BST'||r.zone==='BSO') ? '#f85149' : '#7d8590';
            var cc = r.contrib > 0 ? '#3fb950' : r.contrib < 0 ? '#f85149' : '#7d8590';
            html += '<tr>'
                + '<td style="font-weight:700;">' + r.name + '</td>'
                + '<td style="color:var(--gtb-muted);">' + r.weight.toFixed(2) + '%</td>'
                + '<td style="color:' + sc + ';font-weight:600;">' + (r.score >= 0 ? '+' : '') + r.score.toFixed(1) + '</td>'
                + '<td><span class="bt-tz" style="color:' + zc + ';border-color:' + zc + '44;background:' + zc + '11;">' + r.zone + '</span></td>'
                + '<td style="color:' + cc + ';">' + (r.contrib >= 0 ? '+' : '') + r.contrib.toFixed(2) + '</td>'
                + '<td><i class="bi ' + (r.score > 0 ? 'bi-arrow-up-right' : r.score < 0 ? 'bi-arrow-down-right' : 'bi-dash') + '" style="color:' + sc + '"></i></td>'
                + '</tr>';
        });

        html += '</tbody></table></div>';
    });

    $body.html(html);
    $btn.prop('disabled', false).html('<i class="bi bi-arrows-expand"></i> Recompute');
}

// ── Opportunity Feed HTML shell ───────────────────────────────────────────────
function _btoFeedHtml() {
    return '<div class="bto-load-toolbar">'
        + '<button id="bto-feed-load" class="bto-btn bto-btn-blue"><i class="bi bi-lightning-charge-fill"></i> Generate Feed</button>'
        + '<span class="bto-hint-inline">Ranks all F&O stocks by opportunity strength: score, zone, OI flow, PCR, and scanner events</span>'
        + '</div>'
        + '<div id="bto-feed-body" class="bto-content-body"><div class="bto-empty-msg">Click Generate Feed to rank current opportunities</div></div>';
}

function _btoRenderFeed() {
    var $btn  = jQ('#bto-feed-load').prop('disabled', true).html('<i class="bi bi-arrow-clockwise spin"></i> Computing...');
    var $body = jQ('#bto-feed-body');

    var labelMap = {'2':'AST','1':'ASO','0':'B/W','-1':'BSO','-2':'BST'};
    var ltps  = _btLtps(), opens = _btOpens();
    var checkNames = (typeof FO_LIST !== 'undefined' ? FO_LIST : []).concat(
        ['NIFTY 50','NIFTY BANK','GIFT NIFTY','SENSEX','RELIANCE','HDFCBANK','ICICIBANK']
    );
    var seenN = {}; checkNames = checkNames.filter(function(n) { return seenN[n] ? false : (seenN[n]=true); });

    var opportunities = [];

    checkNames.forEach(function(name) {
        var cs; try { cs = computeInstrumentScore(name); } catch(e) { return; }
        var ltp  = parseFloat((ltps[name]  || {}).ltp   || 0);
        var open = parseFloat((opens[name] || {}).price || 0);
        if (!ltp) return;

        var pct  = open ? ((ltp - open) / open * 100) : 0;
        var zone = labelMap[String(cs.current_trend)] || 'B/W';
        var sm   = INSTRUMENT_SCORE_MAP[name] || {};

        // Opportunity score components:
        var scoreComp  = cs.total;                                      // direction + magnitude
        var zoneComp   = cs.current_trend;                              // -2 to +2
        var futComp    = cs.futures_trend || 0;                         // -1/0/+1
        var oiComp     = sm.oi_obv || 0;                               // -N to +N
        var pcrComp    = 0;
        if (sm.pcr != null) {
            var p = parseFloat(sm.pcr);
            pcrComp = p > 1.3 ? 1 : p > 1.1 ? 0.5 : p < 0.7 ? -1 : p < 0.9 ? -0.5 : 0;
            if (sm.chPcr != null) pcrComp += sm.chPcr > 0 ? 0.3 : sm.chPcr < 0 ? -0.3 : 0;
        }

        // Scanner event bonus
        var evBonus = 0;
        _BTO.events.slice(0, 20).forEach(function(ev) {
            if (ev.name === name) evBonus += (ev.type==='bull' ? 2 : ev.type==='bear' ? -2 : 0);
        });

        var oppScore = scoreComp * 1.5 + zoneComp + futComp + Math.min(2, Math.max(-2, oiComp/2)) + pcrComp + evBonus;
        var momentum = pct > 0.5 ? 1 : pct < -0.5 ? -1 : 0;
        oppScore += momentum * 0.5;

        // Only surface strong signals
        if (Math.abs(oppScore) < 2) return;

        var nine15 = 'B/W';
        try { nine15 = (JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}')[name] || {}).CLOSE_9_15 || 'B/W'; } catch(e) {}

        var signals = [];
        if (Math.abs(cs.total) >= 4)      signals.push({ s: cs.total > 0 ? 'bull' : 'bear', t: 'Score ' + (cs.total >= 0 ? '+' : '') + cs.total.toFixed(1) });
        if (cs.current_trend === 2)        signals.push({ s:'bull', t:'At AST' });
        if (cs.current_trend === -2)       signals.push({ s:'bear', t:'At BST' });
        if (cs.futures_trend > 0)          signals.push({ s:'bull', t:'Futures long' });
        if (cs.futures_trend < 0)          signals.push({ s:'bear', t:'Futures short' });
        if (sm.pcr != null && sm.pcr>1.3)  signals.push({ s:'bull', t:'PCR extreme ' + parseFloat(sm.pcr).toFixed(2) });
        if (sm.pcr != null && sm.pcr<0.7)  signals.push({ s:'bear', t:'PCR extreme ' + parseFloat(sm.pcr).toFixed(2) });
        if ((nine15==='AST'||nine15==='ASO') && oppScore > 0) signals.push({ s:'bull', t:'9:15 breakout ' + nine15 });
        if ((nine15==='BST'||nine15==='BSO') && oppScore < 0) signals.push({ s:'bear', t:'9:15 breakdown ' + nine15 });
        if (evBonus !== 0) signals.push({ s: evBonus > 0 ? 'bull' : 'bear', t:'Scanner event' });

        opportunities.push({
            name: name, ltp: ltp, pct: pct, zone: zone, nine15: nine15,
            cs: cs, sm: sm, oppScore: oppScore, signals: signals
        });
    });

    // Sort by absolute opportunity score desc
    opportunities.sort(function(a, b) { return Math.abs(b.oppScore) - Math.abs(a.oppScore); });

    if (!opportunities.length) {
        $body.html('<div class="bto-empty-msg">No strong opportunities detected right now. Score threshold: |oppScore| >= 2. Ensure a main refresh has been done.</div>');
        $btn.prop('disabled', false).html('<i class="bi bi-lightning-charge-fill"></i> Regenerate');
        return;
    }

    var now = new Date();
    var ts  = ('0'+now.getHours()).slice(-2) + ':' + ('0'+now.getMinutes()).slice(-2);
    var bulls = opportunities.filter(function(o) { return o.oppScore > 0; });
    var bears = opportunities.filter(function(o) { return o.oppScore < 0; });

    var html = '<div class="bto-feed-header">'
        + '<span class="bto-feed-ts">Generated at ' + ts + '</span>'
        + '<span style="color:#3fb950;"><i class="bi bi-arrow-up-right-circle-fill"></i> ' + bulls.length + ' bull</span>'
        + '<span style="color:#f85149;"><i class="bi bi-arrow-down-right-circle-fill"></i> ' + bears.length + ' bear</span>'
        + '<span style="color:var(--gtb-muted);">' + opportunities.length + ' total (|score| >= 2)</span>'
        + '</div>';

    html += '<div class="bto-feed-list">';
    opportunities.forEach(function(o, i) {
        var isBull = o.oppScore > 0;
        var col    = isBull ? '#3fb950' : '#f85149';
        var icon   = isBull ? 'bi-arrow-up-right-circle-fill' : 'bi-arrow-down-right-circle-fill';
        var pctCol = _btCol(o.pct);
        var zc     = (o.zone==='AST'||o.zone==='ASO') ? '#3fb950' : (o.zone==='BST'||o.zone==='BSO') ? '#f85149' : '#7d8590';
        var sCol   = _btCol(o.cs.total);
        var strength = Math.abs(o.oppScore);
        var strLabel = strength >= 8 ? 'VERY STRONG' : strength >= 5 ? 'STRONG' : strength >= 3 ? 'MODERATE' : 'MILD';
        var strBars  = Math.min(5, Math.round(strength / 2));
        var bars = '';
        for (var b = 0; b < 5; b++) bars += '<span style="display:inline-block;width:5px;height:10px;border-radius:1px;margin-right:1px;background:' + (b < strBars ? col : '#30363d') + ';"></span>';

        var sigHtml = o.signals.map(function(sig) {
            var sc = sig.s === 'bull' ? '#3fb950' : '#f85149';
            return '<span class="bto-feed-sig" style="color:' + sc + ';border-color:' + sc + '33;background:' + sc + '0d;">' + sig.t + '</span>';
        }).join('');

        html += '<div class="bto-feed-item" style="border-left-color:' + col + ';background:' + col + '08;">'
            + '<div class="bto-feed-rank" style="color:' + col + ';">' + (i+1) + '</div>'
            + '<i class="bi ' + icon + '" style="color:' + col + ';font-size:1rem;flex-shrink:0;"></i>'
            + '<div class="bto-feed-main">'
            +   '<div class="bto-feed-name-row">'
            +     '<span class="bto-feed-name">' + o.name + '</span>'
            +     '<span style="color:var(--gtb-muted);font-size:0.6rem;">' + o.ltp.toLocaleString('en-IN') + '</span>'
            +     '<span style="color:' + pctCol + ';font-size:0.6rem;">' + (o.pct >= 0 ? '+' : '') + o.pct.toFixed(2) + '%</span>'
            +     '<span class="bt-tz" style="color:' + zc + ';border-color:' + zc + '44;background:' + zc + '11;">' + o.zone + '</span>'
            +     '<span class="bt-tz" style="color:' + zc + ';border-color:' + zc + '44;background:' + zc + '11;">' + o.nine15 + '</span>'
            +   '</div>'
            +   '<div class="bto-feed-sigs">' + sigHtml + '</div>'
            + '</div>'
            + '<div class="bto-feed-score-col">'
            +   '<span class="bto-feed-opp-score" style="color:' + col + '">' + (o.oppScore >= 0 ? '+' : '') + o.oppScore.toFixed(1) + '</span>'
            +   '<span class="bto-feed-str-label" style="color:' + col + ';opacity:0.7;">' + strLabel + '</span>'
            +   '<div style="display:flex;align-items:center;gap:1px;margin-top:2px;">' + bars + '</div>'
            + '</div>'
            + '<button class="bto-ev-btn gtb-win-btn" data-name="' + o.name + '" title="Full Analysis"><i class="bi bi-search"></i></button>'
            + '</div>';
    });

    html += '</div>';
    $body.html(html);
    $btn.prop('disabled', false).html('<i class="bi bi-lightning-charge-fill"></i> Regenerate');
}

// Refresh the feed if it's open and has content
function _btoRefreshFeed() {
    if (jQ('#bto-feed-body .bto-feed-list').length) {
        // silently regenerate
        var $btn = jQ('#bto-feed-load');
        if ($btn.length && !$btn.prop('disabled')) _btoRenderFeed();
    }
}

// Delegated handler for "Analyze" buttons inside the popup
jQ(document).off('click.btoanalyze').on('click.btoanalyze', '.bto-ev-btn', function(e) {
    e.preventDefault();
    if (typeof _gtbOpenInstrDetailFor === 'function') _gtbOpenInstrDetailFor(jQ(this).data('name'));
    else _btAnalyzeInstrument(jQ(this).data('name'));
});
