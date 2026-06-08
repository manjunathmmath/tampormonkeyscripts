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
jQ('body').append('<div id="groot-maximize-overlay"><div id="groot-maximize-panel"><span id="groot-maximize-close" title="Close">✕</span><div id="groot-maximize-title"></div><div id="groot-maximize-body"></div></div></div>');

jQ(document).on('click', '#groot-maximize-close, #groot-maximize-overlay', function(e) {
    if (e.target.id === 'groot-maximize-overlay' || e.target.id === 'groot-maximize-close' || jQ(e.target).closest('#groot-maximize-close').length) {
        jQ('#groot-maximize-overlay').removeClass('active');
    }
});
jQ(document).on('click', '#groot-maximize-panel', function(e) { e.stopPropagation(); });

jQ(document).on('click', '.maximize-component-btn', function() {
    let name = jQ(this).attr('data-name');
    let type = jQ(this).attr('data-type');
    maximizeComponent(name, type);
});

function showMaximizeOverlay(title, bodyHtml) {
    jQ('#groot-maximize-title').html(title);
    jQ('#groot-maximize-body').html(bodyHtml);
    jQ('#groot-maximize-overlay').addClass('active');
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
    let body = '';
    body += '<div id="max-' + tempName + '-oi" style="width:100%;"></div>';
    body += '<div id="max-' + tempName + '-oi-signal-row" style="padding:4px 0;"></div>';
    body += '<div id="max-' + tempName + '-obv" style="width:100%;"></div>';
    body += '<div id="max-' + tempName + '-oi-table" style="margin-top:8px;overflow-x:auto;"></div>';
    showMaximizeOverlay(name + ' — OI / OBV', body);

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
        let ceObvDelta = ceObvList.length >= 2 ? parseFloat(ceObvList[ceObvList.length-1]['obv']) - parseFloat(ceObvList[ceObvList.length-2]['obv']) : parseFloat(ceObvList[ceObvList.length-1]['obv']);
        let peObvDelta = peObvList.length >= 2 ? parseFloat(peObvList[peObvList.length-1]['obv']) - parseFloat(peObvList[peObvList.length-2]['obv']) : parseFloat(peObvList[peObvList.length-1]['obv']);
        oiCEOBV.push(parseFloat(ceObvDelta).toFixed(1));
        oiPEOBV.push(parseFloat(peObvDelta).toFixed(1));
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

    // OI table (reuse existing renderer by temporarily faking the target div)
    jQ('#max-' + tempName + '-oi-table').html(jQ('#' + tempName + '-component-oi-list-table').html());
}

async function maximizeChart(name) {
    let tempName = name.replaceAll(' ', '-').replaceAll('&', '-');
    let isMCX = (name === 'CRUDEOILM' || name === 'USDINR');
    let body = '';
    body += '<div id="max-' + tempName + '-chart" style="width:100%;height:520px;border-radius:8px;overflow:hidden;"></div>';
    body += '<div id="max-' + tempName + '-atr-sl" style="margin-top:8px;"></div>';
    showMaximizeOverlay('<i class="bi bi-candlestick"></i> ' + name + ' — Candlestick Chart', body);
    setTimeout(async function() {
        try {
            // temporarily alias the atr-sl div so _buildATRBadges writes into max panel
            let origDivId = '#' + tempName + '-atr-sl';
            let maxDivId  = '#max-' + tempName + '-atr-sl';
            let origEl    = jQ(origDivId).detach();
            jQ(maxDivId).attr('id', tempName + '-atr-sl');
            if (isMCX) {
                // commodities.js showTopChartMCX always writes to #{tempName}-chart
                // temporarily rename the max div to match, then restore
                jQ('#max-' + tempName + '-chart').attr('id', tempName + '-chart-max-bk');
                let origChart = jQ('#' + tempName + '-chart').detach();
                jQ('#' + tempName + '-chart-max-bk').attr('id', tempName + '-chart');
                await showTopChartMCX(name);
                // resize the chart to fill the panel
                let lwc = document.getElementById(tempName + '-chart')._lwChart;
                if (lwc) lwc.resize(document.getElementById(tempName + '-chart').clientWidth, 520);
                jQ('#' + tempName + '-chart').attr('id', 'max-' + tempName + '-chart');
                if (origChart.length) jQ('#gtb-pane-' + tempName + ' #' + tempName + '-atr-sl').before(origChart);
            } else {
                await showTopChart(name, '#max-' + tempName + '-chart', 520);
            }
            jQ('#' + tempName + '-atr-sl').attr('id', 'max-' + tempName + '-atr-sl');
            if (origEl.length) jQ(origDivId.slice(1)).before(origEl);
        } catch(e) {
            jQ('#max-' + tempName + '-chart').html('<div style="color:#7d8590;padding:20px;">Chart unavailable: ' + e.message + '</div>');
        }
    }, 80);
}

function maximizeFutures(name) {
    let tempName = name.replaceAll(' ', '-').replaceAll('&', '-');
    let existingHtml = jQ('#' + tempName + '-futures-trend').html() || '';
    let existingVwap = jQ('#' + tempName + '-futures-vwap').html() || '';
    let existingPremium = jQ('#' + tempName + '-futures-premium').html() || '';
    let body = '';
    body += '<div style="font-size:0.9rem;padding:4px 0 8px;">' + existingPremium + '</div>';
    body += '<div style="margin-bottom:8px;">' + existingVwap + '</div>';
    body += '<div style="font-size:1rem;">' + existingHtml + '</div>';
    showMaximizeOverlay(name + ' — Futures', body);
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
});


GM_registerMenuCommand("Create AT ", function () {
    window.open("https://kite.zerodha.com/connect/login?v=3&api_key=" + g_config.get('api_key'), "_self");
}, "r");

jQ(document).on('click', '#nine-fifteen-scan', function (e) {
    scanNineFifteenCandle()
});

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
            jQ("#processing-trend").html("Processing.... " + (i + 1) + "/" + instru.length);
            try {
                let historical = await getHistoricalDataUsingPromise(INSTRUMENT_TOKENS[name], CURRENT_DAY, CURRENT_DAY, '5minute');
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

    // ── TOP BAR ──────────────────────────────────────────────────────────────
    h += '<div id="gtb-topbar">';
    h += '<span class="gtb-brand"><i class="bi bi-graph-up-arrow"></i> GROOT</span>';

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

    // Controls (moved from popup title/status bars)
    h += '<div class="gtb-topbar-controls">';
    h += '<span id="last-refresh-time" class="gtb-refresh-time">—</span>';
    h += '<span id="refresh-loader" class="loader hide"></span>';
    h += '<span id="refresh-timer-one" class="gtb-timer-badge">00:00</span>';
    h += '<input type="checkbox" id="enable-auto-refresh" title="Enable auto-refresh" style="cursor:pointer;">';
    h += '<a id="start-auto-refresh" class="gtb-ctrl-link" title="Refresh now"><i class="bi bi-arrow-clockwise"></i> Refresh</a>';
    h += '<a id="data-load" class="gtb-ctrl-link" title="Data settings"><i class="bi bi-database"></i></a>';
    h += '<a id="show-oi-viewer" class="gtb-ctrl-link" title="OI Analyzer"><i class="bi bi-eye"></i></a>';
    h += '<a id="show-stock-viewer" class="gtb-ctrl-link" title="Stock Viewer"><i class="bi bi-list-ul"></i></a>';
    h += '<a id="show-market-quote-analyzer" class="gtb-ctrl-link" title="Quotes"><i class="bi bi-graph-up"></i></a>';
    h += '<span id="processing-trend" style="font-size:0.55rem;color:#7d8590;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>';
    h += '</div>';

    // Window controls
    h += '<div class="gtb-win-controls">';
    h += '<button class="gtb-win-btn gtb-win-minimize" title="Minimize"><i class="bi bi-dash"></i></button>';
    h += '<button class="gtb-win-btn gtb-win-restore" title="Restore / Maximize"><i class="bi bi-fullscreen"></i></button>';
    h += '<button class="gtb-win-btn gtb-win-close" title="Close"><i class="bi bi-x-lg"></i></button>';
    h += '</div>';

    h += '</div>'; // end topbar

    // ── MAIN 3-COLUMN ─────────────────────────────────────────────────────────
    h += '<div id="gtb-main">';

    // ── LEFT: Score + Trade Panel ─────────────────────────────────────────────
    h += '<div id="gtb-left">';

    // Score gauge
    h += '<div class="gtb-card gtb-widget" id="gtb-score-gauge">';
    h += '<div class="gtb-card-header"><span class="gtb-card-title"><i class="bi bi-speedometer2"></i> SCORE</span>';
    h += '<button class="sv-icon-btn show-notes" title="Notes"><i class="bi bi-info-circle"></i></button></div>';
    h += '<div class="gtb-card-body gtb-widget-body" style="height:120px;">';
    h += '<div id="trend-scoreboard" style="height:110px;"></div>';
    h += '<div id="score-board-number" style="text-align:center;margin-top:-4px;"></div>';
    h += '</div></div>';

    // Signal card
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header"><span class="gtb-card-title"><i class="bi bi-lightning-charge"></i> SIGNAL</span></div>';
    h += '<div class="gtb-card-body gtb-widget-body" style="height:140px;overflow-y:auto;">';
    h += '<div id="market-final-signal"></div>';
    h += '<div id="trend-scoreboard-outcome" style="margin-top:6px;"></div>';
    h += '</div></div>';

    // Pillar breakdown
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header"><span class="gtb-card-title"><i class="bi bi-bar-chart-steps"></i> PILLARS</span></div>';
    h += '<div class="gtb-card-body gtb-widget-body" style="height:200px;overflow-y:auto;" id="gtb-pillars-body">';
    h += '<div style="color:#64748b;font-size:0.6rem;text-align:center;">Refreshing…</div>';
    h += '</div></div>';

    // Entry confluence + Trade panel
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header"><span class="gtb-card-title"><i class="bi bi-crosshair"></i> ENTRY / TRADE</span></div>';
    h += '<div class="gtb-card-body gtb-widget-body" style="height:110px;" id="entry-confluence-panel"></div>';
    h += '</div>';

    // Exit signal — fixed height banner with direction selector
    h += '<div class="gtb-exit-wrap">';
    h += '<div class="gtb-exit-dir-btns">';
    h += '<button class="gtb-dir-btn" data-dir="NONE"  title="No position">—</button>';
    h += '<button class="gtb-dir-btn bull" data-dir="LONG"  title="I am LONG"><i class="bi bi-arrow-up-circle-fill"></i> LONG</button>';
    h += '<button class="gtb-dir-btn bear" data-dir="SHORT" title="I am SHORT"><i class="bi bi-arrow-down-circle-fill"></i> SHORT</button>';
    h += '</div>';
    h += '<div id="gtb-exit-signal" class="gtb-exit-banner hold"><i class="bi bi-door-open"></i> No position set</div>';
    h += '</div>';

    // Top trades
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header"><span class="gtb-card-title"><i class="bi bi-stars"></i> TOP TRADES</span>';
    h += '<button class="sv-icon-btn refresh-scoreboard" title="Refresh"><i class="bi bi-arrow-clockwise"></i></button></div>';
    h += '<div class="gtb-card-body gtb-widget-body" style="height:175px;" id="gtb-top-trades-list">';
    h += '<div class="gtb-empty-msg"><i class="bi bi-hourglass-split"></i> Refreshing…</div>';
    h += '</div></div>';

    // Score detail table (collapsible)
    h += '<div class="gtb-card gtb-widget">';
    h += '<div class="gtb-card-header gtb-collapse-toggle" data-target="gtb-score-detail">';
    h += '<span class="gtb-card-title"><i class="bi bi-table"></i> SCORE DETAIL</span>';
    h += '<span class="hdr-actions">';
    h += '<i class="bi bi-chevron-down gtb-caret"></i>';
    h += '</span>';
    h += '</div>';
    h += '<div id="gtb-score-detail" class="gtb-collapse-body gtb-widget-body" style="height:260px;overflow-x:auto;">';
    h += '<div id="trend-scoreboard-table" style="height:100%;overflow-y:auto;overflow-x:auto;"></div>';
    h += '</div></div>';

    h += '</div>'; // end #gtb-left

    // ── CENTER: Tabbed OI Focus ───────────────────────────────────────────────
    h += '<div id="gtb-center">';

    // ── Row 1: Index charts (NIFTY 50 + NIFTY BANK) — always fully visible ───
    let indexInstruments = ['NIFTY 50', 'NIFTY BANK'];
    let instrIcons = { 'NIFTY 50': 'bi-graph-up-arrow', 'NIFTY BANK': 'bi-bank2', 'RELIANCE': 'bi-fuel-pump', 'HDFCBANK': 'bi-building', 'ICICIBANK': 'bi-credit-card', 'CRUDEOILM': 'bi-droplet-fill', 'USDINR': 'bi-currency-exchange' };

    h += '<div class="gtb-grid-row" id="gtb-index-row">';
    indexInstruments.forEach(function(name) {
        let tid = name.replace(/ /g, '-').replace(/&/g, '-');
        let icon = instrIcons[name];
        h += '<div class="gtb-instr-col" id="gtb-pane-' + tid + '">';

        // Chart card
        h += '<div class="gtb-grid-card">';
        h += '<div class="gtb-grid-card-header">';
        h += '<span class="gtb-grid-instr-name"><i class="bi ' + icon + '"></i> ' + name + '</span>';
        h += '<span class="gtb-ltp-inline" id="' + tid + '-ltp"></span>';
        h += '<span class="hdr-actions">';
        h += '<button class="sv-icon-btn refresh-chart" data-name="' + name + '" title="Refresh"><i class="bi bi-arrow-clockwise"></i></button>';
        h += '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="chart" title="Maximize"><i class="bi bi-fullscreen"></i></button>';
        h += '</span></div>';
        h += '<div id="' + tid + '-chart" class="gtb-chart-area"></div>';
        h += '<div id="' + tid + '-atr-sl" class="gtb-atr-row"></div>';
        h += '</div>';

        // OI card (collapsible)
        h += '<div class="gtb-grid-card gtb-collapsible">';
        h += '<div class="gtb-grid-card-header gtb-collapse-toggle" data-target="' + tid + '-oi-body">';
        h += '<span class="gtb-grid-section-label"><i class="bi bi-bar-chart-fill"></i> OI / OBV</span>';
        h += '<span class="hdr-meta">';
        h += '<span id="' + tid + '-pcr-probability" class="gtb-pcr-chip"></span>';
        h += '<span id="' + tid + '-oi-score" class="gtb-oi-score-chip"></span>';
        h += '</span>';
        h += '<span class="hdr-actions">';
        h += '<button class="sv-icon-btn refresh-oi-obv" data-name="' + name + '" title="Refresh OI"><i class="bi bi-arrow-clockwise"></i></button>';
        h += '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="oi" title="Maximize"><i class="bi bi-fullscreen"></i></button>';
        h += '<i class="bi bi-chevron-down gtb-caret"></i>';
        h += '</span></div>';
        h += '<div id="' + tid + '-oi-body" class="gtb-collapse-body">';
        h += '<div id="' + tid + '-oi" class="gtb-chart-oi"></div>';
        h += '<div id="' + tid + '-oi-signal-row" class="gtb-signal-row"></div>';
        h += '<div id="' + tid + '-obv" class="gtb-chart-oi"></div>';
        h += '<div id="' + tid + '-component-oi-list-table" class="gtb-oi-table"></div>';
        h += '</div></div>';

        // Futures card (collapsible)
        h += '<div class="gtb-grid-card gtb-collapsible">';
        h += '<div class="gtb-grid-card-header gtb-collapse-toggle" data-target="' + tid + '-fut-body">';
        h += '<span class="gtb-grid-section-label" id="futures-chart-' + tid + '"><i class="bi bi-rocket-takeoff"></i> FUTURES</span>';
        h += '<span class="hdr-meta">';
        h += '<span id="' + tid + '-futures-premium" class="gtb-pcr-chip"></span>';
        h += '</span>';
        h += '<span class="hdr-actions">';
        h += '<button class="sv-icon-btn refresh-futures" data-name="' + name + '" title="Refresh Futures"><i class="bi bi-arrow-clockwise"></i></button>';
        h += '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="futures" title="Maximize"><i class="bi bi-fullscreen"></i></button>';
        h += '<i class="bi bi-chevron-down gtb-caret"></i>';
        h += '</span></div>';
        h += '<div id="' + tid + '-fut-body" class="gtb-collapse-body">';
        h += '<div id="' + tid + '-futures" class="gtb-futures-content"></div>';
        h += '<div id="' + tid + '-futures-vwap" class="gtb-futures-meta"></div>';
        h += '<div id="' + tid + '-futures-trend" class="gtb-futures-meta"></div>';
        h += '</div></div>';

        // 9:15 close (collapsible, only for index)
        h += '<div class="gtb-grid-card gtb-collapsible">';
        h += '<div class="gtb-grid-card-header gtb-collapse-toggle" data-target="' + tid + '-915-body">';
        h += '<span class="gtb-grid-section-label"><i class="bi bi-clock-history"></i> 9:15 CLOSE</span>';
        h += '<span class="hdr-actions">';
        h += '<button class="sv-icon-btn refresh-nine-fifteen" data-name="' + name + '" title="Refresh 9:15"><i class="bi bi-arrow-clockwise"></i></button>';
        h += '<i class="bi bi-chevron-down gtb-caret"></i>';
        h += '</span>';
        h += '</div>';
        h += '<div id="' + tid + '-915-body" class="gtb-collapse-body">';
        h += '<div id="' + tid + '-nine-fifteen-close" class="gtb-915-strip"></div>';
        h += '<div id="' + tid + '-nine-fifteen-close-table" class="gtb-915-table"></div>';
        h += '</div></div>';

        // A/D (collapsible, only for index)
        h += '<div class="gtb-grid-card gtb-collapsible">';
        h += '<div class="gtb-grid-card-header gtb-collapse-toggle" data-target="' + tid + '-ad-body">';
        h += '<span class="gtb-grid-section-label"><i class="bi bi-arrows-collapse-vertical"></i> ADVANCE / DECLINE</span>';
        h += '<span class="hdr-actions">';
        h += '<button class="sv-icon-btn refresh-advance-decline" data-name="' + name + '" title="Refresh Spot A/D"><i class="bi bi-arrow-clockwise"></i> S</button>';
        h += '<button class="sv-icon-btn refresh-advance-decline-futures" data-name="' + name + '" title="Refresh Futures A/D"><i class="bi bi-arrow-clockwise"></i> F</button>';
        h += '<i class="bi bi-chevron-down gtb-caret"></i>';
        h += '</span></div>';
        h += '<div id="' + tid + '-ad-body" class="gtb-collapse-body">';
        h += '<div class="gtb-ad-label">SPOT <span id="' + tid + '-advance-decline-adr" class="gtb-adr-val"></span></div>';
        h += '<div id="' + tid + '-advance-decline" class="gtb-chart-ad"></div>';
        h += '<div class="gtb-ad-label" style="margin-top:4px;">FUTURES <span id="' + tid + '-advance-decline-adr-future" class="gtb-adr-val"></span></div>';
        h += '<div id="' + tid + '-advance-decline-future" class="gtb-chart-ad"></div>';
        h += '</div></div>';

        h += '</div>'; // end .gtb-instr-col
    });
    h += '</div>'; // end #gtb-index-row

    // ── Row 2: Stock instruments (3 across) ───────────────────────────────────
    let stockInstruments = ['RELIANCE', 'HDFCBANK', 'ICICIBANK'];
    h += '<div class="gtb-grid-row gtb-grid-3" id="gtb-stocks-row">';
    stockInstruments.forEach(function(name) {
        let tid = name.replace(/ /g, '-').replace(/&/g, '-');
        let icon = instrIcons[name];
        h += '<div class="gtb-instr-col" id="gtb-pane-' + tid + '">';

        h += '<div class="gtb-grid-card">';
        h += '<div class="gtb-grid-card-header">';
        h += '<span class="gtb-grid-instr-name"><i class="bi ' + icon + '"></i> ' + name + '</span>';
        h += '<span class="gtb-ltp-inline" id="' + tid + '-ltp"></span>';
        h += '<span class="hdr-actions">';
        h += '<button class="sv-icon-btn refresh-chart" data-name="' + name + '" title="Refresh"><i class="bi bi-arrow-clockwise"></i></button>';
        h += '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="chart" title="Maximize"><i class="bi bi-fullscreen"></i></button>';
        h += '</span></div>';
        h += '<div id="' + tid + '-chart" class="gtb-chart-area"></div>';
        h += '<div id="' + tid + '-atr-sl" class="gtb-atr-row"></div>';
        h += '</div>';

        h += '<div class="gtb-grid-card gtb-collapsible">';
        h += '<div class="gtb-grid-card-header gtb-collapse-toggle" data-target="' + tid + '-oi-body">';
        h += '<span class="gtb-grid-section-label"><i class="bi bi-bar-chart-fill"></i> OI / OBV</span>';
        h += '<span class="hdr-meta">';
        h += '<span id="' + tid + '-pcr-probability" class="gtb-pcr-chip"></span>';
        h += '<span id="' + tid + '-oi-score" class="gtb-oi-score-chip"></span>';
        h += '</span>';
        h += '<span class="hdr-actions">';
        h += '<button class="sv-icon-btn refresh-oi-obv" data-name="' + name + '" title="Refresh OI"><i class="bi bi-arrow-clockwise"></i></button>';
        h += '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="oi" title="Maximize"><i class="bi bi-fullscreen"></i></button>';
        h += '<i class="bi bi-chevron-down gtb-caret"></i>';
        h += '</span></div>';
        h += '<div id="' + tid + '-oi-body" class="gtb-collapse-body">';
        h += '<div id="' + tid + '-oi" class="gtb-chart-oi"></div>';
        h += '<div id="' + tid + '-oi-signal-row" class="gtb-signal-row"></div>';
        h += '<div id="' + tid + '-obv" class="gtb-chart-oi"></div>';
        h += '<div id="' + tid + '-component-oi-list-table" class="gtb-oi-table"></div>';
        h += '</div></div>';

        h += '<div class="gtb-grid-card gtb-collapsible">';
        h += '<div class="gtb-grid-card-header gtb-collapse-toggle" data-target="' + tid + '-fut-body">';
        h += '<span class="gtb-grid-section-label" id="futures-chart-' + tid + '"><i class="bi bi-rocket-takeoff"></i> FUTURES</span>';
        h += '<span class="hdr-meta">';
        h += '<span id="' + tid + '-futures-premium" class="gtb-pcr-chip"></span>';
        h += '</span>';
        h += '<span class="hdr-actions">';
        h += '<button class="sv-icon-btn refresh-futures" data-name="' + name + '" title="Refresh Futures"><i class="bi bi-arrow-clockwise"></i></button>';
        h += '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="futures" title="Maximize"><i class="bi bi-fullscreen"></i></button>';
        h += '<i class="bi bi-chevron-down gtb-caret"></i>';
        h += '</span></div>';
        h += '<div id="' + tid + '-fut-body" class="gtb-collapse-body">';
        h += '<div id="' + tid + '-futures" class="gtb-futures-content"></div>';
        h += '<div id="' + tid + '-futures-vwap" class="gtb-futures-meta"></div>';
        h += '<div id="' + tid + '-futures-trend" class="gtb-futures-meta"></div>';
        h += '</div></div>';

        h += '</div>'; // end .gtb-instr-col
    });
    h += '</div>'; // end #gtb-stocks-row

    // ── Row 3: Commodities (CRUDEOILM + USDINR side by side) ─────────────────
    let commInstruments = ['CRUDEOILM', 'USDINR'];
    h += '<div class="gtb-grid-row" id="gtb-comm-row">';
    commInstruments.forEach(function(name) {
        let tid = name.replace(/ /g, '-').replace(/&/g, '-');
        let icon = instrIcons[name];
        h += '<div class="gtb-instr-col" id="gtb-pane-' + tid + '">';

        h += '<div class="gtb-grid-card">';
        h += '<div class="gtb-grid-card-header">';
        h += '<span class="gtb-grid-instr-name"><i class="bi ' + icon + '"></i> ' + name + '</span>';
        h += '<span class="gtb-ltp-inline" id="' + tid + '-ltp"></span>';
        h += '<span class="hdr-actions">';
        h += '<button class="sv-icon-btn refresh-chart" data-name="' + name + '" title="Refresh"><i class="bi bi-arrow-clockwise"></i></button>';
        h += '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="chart" title="Maximize"><i class="bi bi-fullscreen"></i></button>';
        h += '</span></div>';
        h += '<div id="' + tid + '-chart" class="gtb-chart-area"></div>';
        h += '<div id="' + tid + '-atr-sl" class="gtb-atr-row"></div>';
        h += '</div>';

        h += '<div class="gtb-grid-card gtb-collapsible">';
        h += '<div class="gtb-grid-card-header gtb-collapse-toggle" data-target="' + tid + '-oi-body">';
        h += '<span class="gtb-grid-section-label"><i class="bi bi-bar-chart-fill"></i> OI / OBV</span>';
        h += '<span class="hdr-meta">';
        h += '<span id="' + tid + '-pcr-probability" class="gtb-pcr-chip"></span>';
        h += '<span id="' + tid + '-oi-score" class="gtb-oi-score-chip"></span>';
        h += '</span>';
        h += '<span class="hdr-actions">';
        h += '<button class="sv-icon-btn refresh-oi-obv" data-name="' + name + '" title="Refresh OI"><i class="bi bi-arrow-clockwise"></i></button>';
        h += '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="oi" title="Maximize"><i class="bi bi-fullscreen"></i></button>';
        h += '<i class="bi bi-chevron-down gtb-caret"></i>';
        h += '</span></div>';
        h += '<div id="' + tid + '-oi-body" class="gtb-collapse-body">';
        h += '<div id="' + tid + '-oi" class="gtb-chart-oi"></div>';
        h += '<div id="' + tid + '-oi-signal-row" class="gtb-signal-row"></div>';
        h += '<div id="' + tid + '-obv" class="gtb-chart-oi"></div>';
        h += '<div id="' + tid + '-component-oi-list-table" class="gtb-oi-table"></div>';
        h += '</div></div>';

        h += '<div class="gtb-grid-card gtb-collapsible">';
        h += '<div class="gtb-grid-card-header gtb-collapse-toggle" data-target="' + tid + '-fut-body">';
        h += '<span class="gtb-grid-section-label" id="futures-chart-' + tid + '"><i class="bi bi-rocket-takeoff"></i> FUTURES</span>';
        h += '<span class="hdr-meta">';
        h += '<span id="' + tid + '-futures-premium" class="gtb-pcr-chip"></span>';
        h += '</span>';
        h += '<span class="hdr-actions">';
        h += '<button class="sv-icon-btn refresh-futures" data-name="' + name + '" title="Refresh Futures"><i class="bi bi-arrow-clockwise"></i></button>';
        h += '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="futures" title="Maximize"><i class="bi bi-fullscreen"></i></button>';
        h += '<i class="bi bi-chevron-down gtb-caret"></i>';
        h += '</span></div>';
        h += '<div id="' + tid + '-fut-body" class="gtb-collapse-body">';
        h += '<div id="' + tid + '-futures" class="gtb-futures-content"></div>';
        h += '<div id="' + tid + '-futures-vwap" class="gtb-futures-meta"></div>';
        h += '<div id="' + tid + '-futures-trend" class="gtb-futures-meta"></div>';
        h += '</div></div>';

        h += '</div>'; // end .gtb-instr-col
    });
    h += '</div>'; // end #gtb-comm-row

    // ── ALL A/D + 9:15 row ────────────────────────────────────────────────────
    h += '<div class="gtb-grid-card" id="gtb-all-ad-section" style="margin:6px;border-radius:8px;">';
    h += '<div class="gtb-grid-card-header gtb-collapse-toggle" data-target="gtb-all-ad-body">';
    h += '<span class="gtb-grid-section-label"><i class="bi bi-clock-history"></i> ALL STOCKS — 9:15 &amp; A/D</span>';
    h += '<span class="hdr-actions">';
    h += '<button class="sv-icon-btn refresh-advance-decline" data-name="ALL" title="Refresh All Spot A/D"><i class="bi bi-arrow-clockwise"></i> SPOT</button>';
    h += '<button class="sv-icon-btn refresh-advance-decline-futures" data-name="ALL" title="Refresh All Futures A/D"><i class="bi bi-arrow-clockwise"></i> FUT</button>';
    h += '<i class="bi bi-chevron-down gtb-caret"></i>';
    h += '</span></div>';
    h += '<div id="gtb-all-ad-body" class="gtb-collapse-body">';
    h += '<div id="ALL-nine-fifteen-close" class="gtb-915-strip"></div>';
    h += '<div id="ALL-nine-fifteen-close-table" style="max-height:80px;overflow-y:auto;margin-top:4px;"></div>';
    h += '<div style="display:flex;gap:8px;margin-top:6px;">';
    h += '<div style="flex:1;"><div class="gtb-ad-label">ALL SPOT ADR <span id="all-advance-decline-adr" class="gtb-adr-val"></span></div><div id="advance-decline-trend" class="gtb-chart-ad"></div></div>';
    h += '<div style="flex:1;"><div class="gtb-ad-label">ALL FUTURES ADR <span id="all-advance-decline-adr-future" class="gtb-adr-val"></span></div><div id="advance-decline-futures-trend" class="gtb-chart-ad"></div></div>';
    h += '</div>';
    h += '</div></div>';

    h += '</div>'; // end #gtb-center

    // ── RIGHT: Secondary instruments + stock list ─────────────────────────────
    h += '<div id="gtb-right">';

    // GIFT NIFTY + SENSEX mini charts
    ['GIFT NIFTY', 'SENSEX'].forEach(function(name) {
        let tid = name.replace(/ /g, '-').replace(/&/g, '-');
        h += '<div class="gtb-instr-card">';
        h += '<div class="gtb-instr-header">';
        h += '<span class="gtb-instr-name"><i class="bi bi-globe-asia-australia"></i> ' + name + '</span>';
        h += '<div class="gtb-instr-badges">';
        h += '<span id="' + tid + '-ltp" style="font-size:0.62rem;color:#e6edf3;font-weight:800;font-variant-numeric:tabular-nums;"></span>';
        h += '<button class="sv-icon-btn refresh-chart" data-name="' + name + '" title="Refresh chart"><i class="bi bi-arrow-clockwise"></i></button>';
        h += '<button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="chart" title="Maximize"><i class="bi bi-fullscreen"></i></button>';
        h += '</div></div>';
        h += '<div class="gtb-instr-body">';
        h += '<div id="' + tid + '-chart" style="height:80px;"></div>';
        h += '<div id="' + tid + '-atr-sl" style="margin-top:2px;"></div>';
        h += '</div></div>';
    });

    // USDINR and CRUDEOILM are now full center tabs — keep hidden placeholder divs so async writers don't error
    ['CRUDEOILM', 'USDINR'].forEach(function(name) {
        // These IDs are already rendered in the center tab pane above.
        // No duplicate divs needed here.
    });

    // Stock list
    h += '<div class="gtb-card">';
    h += '<div class="gtb-card-header">';
    h += '<span class="gtb-card-title"><i class="bi bi-collection"></i> INSTRUMENTS</span>';
    h += '<button class="sv-icon-btn refresh-stock-list" title="Refresh"><i class="bi bi-arrow-clockwise"></i></button>';
    h += '</div>';
    h += '<div style="max-height:280px;overflow-y:auto;">';
    h += '<table class="table display nowrap" id="stock-list-table" style="width:100%;font-size:0.58rem;margin-bottom:0;"></table>';
    h += '</div></div>';

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

    return h;
}

function showCompoenentPlaceHolders() {
    jQ("#main-trade-bot-container").html(commonMarkupPlaceHolder());
}

async function commonShowPopupWindow() {
    resetCount()
    jQ("#refresh-loader").removeClass("hide");
    jQ("#last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
    jQ("#main-trade-bot-container").html(commonMarkupPlaceHolder());

    await callSleepForAWhile(1000)

    show915Trend('NIFTY 50');
    show915Trend('NIFTY BANK');
    show915Trend('ALL');

    try {
        await showTopChart('NIFTY 50');
    } catch (e) {
        console.log(e)
    }

    try {
        await showTopChart('NIFTY BANK');
    } catch (e) {
        console.log(e)
    }

    try {
        await showTopChart('GIFT NIFTY');
    } catch (e) {
        console.log(e)
    }

    try {
        await showTopChart('SENSEX');
    } catch (e) {
        console.log(e)
    }

    try {
        await showTopChart('RELIANCE');
    } catch (e) {
        console.log(e)
    }

    try {
        await showTopChart('HDFCBANK');
    } catch (e) {
        console.log(e)
    }

    try {
        let res = await showFutureDetails('NIFTY 50');
        setFutureDetails('NIFTY 50', res);
    } catch (e) {
        console.log(e)
    }

    try {
        res = await showFutureDetails('NIFTY BANK');
        setFutureDetails('NIFTY BANK', res);
    } catch (e) {
        console.log(e)
    }

    try {
        res = await showFutureDetails('RELIANCE');
        setFutureDetails('RELIANCE', res);
    } catch (e) {
        console.log(e)
    }

    try {
        res = await showFutureDetails('HDFCBANK');
        setFutureDetails('HDFCBANK', res);
    } catch (e) {
        console.log(e)
    }

    try {
        await showPrictionProbabilty('NIFTY 50')
        showOIOBVBarChart('NIFTY 50');
    } catch (e) {
        console.log(e)
    }

    try {
        await showPrictionProbabilty('NIFTY BANK')
        showOIOBVBarChart('NIFTY BANK');
    } catch (e) {
        console.log(e)
    }

    try {
        await showPrictionProbabilty('RELIANCE')
        showOIOBVBarChart('RELIANCE');
    } catch (e) {
        console.log(e)
    }

    try {
        await showPrictionProbabilty('HDFCBANK')
        showOIOBVBarChart('HDFCBANK');
    } catch (e) {
        console.log(e)
    }

    try {
        await showTopChart('ICICIBANK');
    } catch (e) {
        console.log(e)
    }

    try {
        let res = await showFutureDetails('ICICIBANK');
        setFutureDetails('ICICIBANK', res);
    } catch (e) {
        console.log(e)
    }

    try {
        await showPrictionProbabilty('ICICIBANK')
        showOIOBVBarChart('ICICIBANK');
    } catch (e) {
        console.log(e)
    }

    try {
        await showTopChartMCX('CRUDEOILM');
    } catch (e) {
        console.log(e)
    }

    try {
        res = await showFutureDetailsMCX('CRUDEOILM');
        setFutureDetails('CRUDEOILM', res);
        if (!INSTRUMENT_SCORE_MAP['CRUDEOILM']) INSTRUMENT_SCORE_MAP['CRUDEOILM'] = {};
        INSTRUMENT_SCORE_MAP['CRUDEOILM'].futures_trend = getFuturesTrendScore(res['REMARK']);
        INSTRUMENT_SCORE_MAP['CRUDEOILM'].oi_obv = 0;
        await showPrictionProbabiltyMCX('CRUDEOILM', res)
        showOIOBVBarChart('CRUDEOILM');
    } catch (e) {
        console.log(e)
    }

    try {
        await showTopChartMCX('USDINR');
    } catch (e) {
        console.log(e)
    }

    try {
        res = await showFutureDetailsMCX('USDINR');
        setFutureDetails('USDINR', res);
        if (!INSTRUMENT_SCORE_MAP['USDINR']) INSTRUMENT_SCORE_MAP['USDINR'] = {};
        INSTRUMENT_SCORE_MAP['USDINR'].futures_trend = getFuturesTrendScore(res['REMARK']);
        INSTRUMENT_SCORE_MAP['USDINR'].oi_obv = 0;
        await showPrictionProbabiltyMCX('USDINR', res)
        showOIOBVBarChart('USDINR');
    } catch (e) {
        console.log(e)
    }

    try {
        await showAdvacenDeclineScanner();
    } catch (e) {
        console.log(e)
    }

    try {
        await showFuturesTrend();
    } catch (e) {
        console.log(e)
    }

    try {
        await fetchWeightedStocksOIScore();
    } catch (e) {
        console.log(e)
    }

    setScore()
    showStockList([]);
    try { updateTopBarTickers(); } catch(e) {}

    jQ("#refresh-loader").addClass("hide");
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
            return { signal: 'NO TRADE', color: 'bg-warning text-dark', reason: 'NIFTY at VIXU — daily range exhausted on upside. Wait for pullback.' };
        }
        if (trends.indexOf('VIXL') !== -1) {
            return { signal: 'NO TRADE', color: 'bg-warning text-dark', reason: 'NIFTY at VIXL — daily range exhausted on downside. Wait for bounce.' };
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

// Scores a single OI/OBV strike row using price direction + OBV to distinguish
// writing vs buying/covering. ATM strike is weighted 2×; all others 1×.
// priceChange: % change of underlying (positive = price up, negative = price down).
// Returns { score, ceLabel, peLabel } — score is numeric, labels describe what's happening.
function scoreOIStrikeForSignal(item, isATM, priceChange) {
    let score = 0;
    let w = isATM ? 2 : 1;
    let pc = parseFloat(priceChange) || 0;
    let priceUp   = pc >  0.1;
    let priceDown = pc < -0.1;

    let chgCE = parseFloat(item['CHG_OI_CE']);
    let chgPE = parseFloat(item['CHG_OI_PE']);
    let oiCE  = parseFloat(item['OI_CE']);
    let oiPE  = parseFloat(item['OI_PE']);

    let ceObvList = item['CE_OBV'];
    let peObvList = item['PE_OBV'];
    let ceObvDelta = ceObvList.length >= 2
        ? parseFloat(ceObvList[ceObvList.length - 1]['obv']) - parseFloat(ceObvList[ceObvList.length - 2]['obv'])
        : parseFloat(ceObvList[ceObvList.length - 1]['obv']);
    let peObvDelta = peObvList.length >= 2
        ? parseFloat(peObvList[peObvList.length - 1]['obv']) - parseFloat(peObvList[peObvList.length - 2]['obv'])
        : parseFloat(peObvList[peObvList.length - 1]['obv']);

    let obvCEUp   = ceObvDelta > 0;
    let obvCEDown = ceObvDelta < 0;
    let obvPEUp   = peObvDelta > 0;
    let obvPEDown = peObvDelta < 0;

    // --- CE OI classification ---
    // OBV is the tiebreaker when price and OBV conflict — OBV reflects where volume actually went.
    // Full weight when price+OBV agree; half weight when only OBV signals; 0.3w when only price signals.
    // CE OI↑ + Price↓ + OBV↓ = call writing (bearish)
    // CE OI↑ + Price↑ + OBV↑ = call buying (bullish)
    // CE OI↓ + Price↑ + OBV↑ = short covering (bullish squeeze)
    // CE OI↓ + Price↓ + OBV↓ = long unwinding (bearish)
    let ceLabel = 'CE NEUTRAL';
    if (chgCE > 0) {
        if      (priceDown && obvCEDown) { ceLabel = 'CE WRITE';  score -= w; }
        else if (priceUp   && obvCEUp)   { ceLabel = 'CE BUY';    score += w; }
        else if (obvCEDown)              { ceLabel = 'CE WRITE';  score -= w * 0.5; } // OBV overrides price
        else if (obvCEUp)                { ceLabel = 'CE BUY';    score += w * 0.5; } // OBV overrides price
        else if (priceDown)              { ceLabel = 'CE WRITE';  score -= w * 0.3; } // price only, OBV flat
        else if (priceUp)                { ceLabel = 'CE BUY';    score += w * 0.3; } // price only, OBV flat
    } else if (chgCE < 0) {
        if      (priceUp   && obvCEUp)   { ceLabel = 'CE COV';    score += w; }
        else if (priceDown && obvCEDown) { ceLabel = 'CE UNWIND'; score -= w; }
        else if (obvCEUp)                { ceLabel = 'CE COV';    score += w * 0.5; }
        else if (obvCEDown)              { ceLabel = 'CE UNWIND'; score -= w * 0.5; }
        else if (priceUp)                { ceLabel = 'CE COV';    score += w * 0.3; }
        else if (priceDown)              { ceLabel = 'CE UNWIND'; score -= w * 0.3; }
    }

    // --- PE OI classification ---
    // PE OI↑ + Price↑ + OBV↓ = put writing (bullish — floor being built)
    // PE OI↑ + Price↓ + OBV↑ = put buying (bearish — hedging/speculating fall)
    // PE OI↓ + Price↓ + OBV↓ = put short covering (bearish — writers buying back)
    // PE OI↓ + Price↑ + OBV↑ = put long unwinding (mildly bullish)
    let peLabel = 'PE NEUTRAL';
    if (chgPE > 0) {
        if      (priceUp   && obvPEDown) { peLabel = 'PE WRITE';  score += w; }
        else if (priceDown && obvPEUp)   { peLabel = 'PE BUY';    score -= w; }
        else if (obvPEDown)              { peLabel = 'PE WRITE';  score += w * 0.5; } // OBV overrides price
        else if (obvPEUp)                { peLabel = 'PE BUY';    score -= w * 0.5; } // OBV overrides price
        else if (priceUp)                { peLabel = 'PE WRITE';  score += w * 0.3; }
        else if (priceDown)              { peLabel = 'PE BUY';    score -= w * 0.3; }
    } else if (chgPE < 0) {
        if      (priceDown && obvPEDown) { peLabel = 'PE COV';    score -= w; }
        else if (priceUp   && obvPEUp)   { peLabel = 'PE UNWIND'; score += w * 0.5; }
        else if (obvPEDown)              { peLabel = 'PE COV';    score -= w * 0.5; }
        else if (obvPEUp)                { peLabel = 'PE UNWIND'; score += w * 0.3; }
        else if (priceDown)              { peLabel = 'PE COV';    score -= w * 0.3; }
        else if (priceUp)                { peLabel = 'PE UNWIND'; score += w * 0.3; }
    }

    // Total OI wall: large PE OI = support floor; large CE OI = resistance ceiling
    if      (oiPE > oiCE) score += 0.5;
    else if (oiCE > oiPE) score -= 0.5;

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

    // Weighted PCR: ATM and ATM±1 count 3×, farther strikes 1×
    // Deep OTM hedging skews raw PCR; weighting focuses on directionally relevant strikes
    let weightedPEOI = 0, weightedCEOI = 0;
    let weightedChPEOI = 0, weightedChCEOI = 0;
    jQ.each(oiData.tableData, function (index, item) {
        let w = item['ATM_STRIKE'] ? 3 : 1;
        weightedPEOI   += parseFloat(item['OI_PE'])     * w;
        weightedCEOI   += parseFloat(item['OI_CE'])     * w;
        weightedChPEOI += parseFloat(item['CHG_OI_PE']) * w;
        weightedChCEOI += parseFloat(item['CHG_OI_CE']) * w;
    });
    let pcr   = weightedCEOI   > 0 ? weightedPEOI   / weightedCEOI   : 1;
    let chPcr = weightedChCEOI > 0 ? weightedChPEOI / weightedChCEOI : 1;

    if      (pcr > 1.3)              score += 1;
    else if (pcr >= 1.0)             score += 0.5;
    else if (pcr >= 0.7)             score -= 0.5;
    else                             score -= 1;

    if (!isNaN(chPcr)) {
        if      (chPcr > 1.3)        score += 0.5;
        else if (chPcr >= 1.0)       score += 0.25;
        else if (chPcr >= 0.7)       score -= 0.25;
        else                         score -= 0.5;
    }

    return parseFloat(score.toFixed(2));
}

// Fetches OI/OBV for all unique weighted stocks that don't already have a full
// OI computation (NIFTY 50, NIFTY BANK, RELIANCE, HDFCBANK, ICICIBANK are handled
// separately by showPrictionProbabilty).  Uses ATM ±2 strikes (5 total) to
// balance signal quality against API call volume (~20 calls per stock).
async function fetchWeightedStocksOIScore() {
    const alreadyComputed = new Set(['NIFTY 50', 'NIFTY BANK', 'RELIANCE', 'HDFCBANK', 'ICICIBANK']);
    const weightedNames   = new Set([
        ...Object.keys(NIFTY_50_WEIGHTED_STOCKS),
        ...Object.keys(NIFTY_BANK_WEIGHTED_STOCKS)
    ]);

    for (let name of weightedNames) {
        if (alreadyComputed.has(name)) continue;
        jQ("#processing-trend").html("OI Scan: " + name);
        try {
            // strikToShowOverride = 2 → ATM-2, ATM-1, ATM, ATM+1, ATM+2 (5 strikes)
            let oiData = await showTrendingOI(name, 2);
            if (!oiData || !oiData.tableData) continue;

            let oiScore = computeOIScoreFromData(oiData);

            if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
            INSTRUMENT_SCORE_MAP[name].oi_obv  = oiScore;
            INSTRUMENT_SCORE_MAP[name].pcr     = oiData.pcr;
            INSTRUMENT_SCORE_MAP[name].chPcr   = oiData.chPcr;
            INSTRUMENT_SCORE_MAP[name].oiData  = oiData;

            console.log("Weighted OI score for " + name + ": " + oiScore + " PCR: " + oiData.pcr);
        } catch (e) {
            console.log("OI score error for " + name, e);
        }
    }
    jQ("#processing-trend").html("OI scan done");
}

// Maps futures REMARK type to a +1/0/-1 score signal
function getFuturesTrendScore(remark) {
    if (remark === 'LONG' || remark === 'SHOT_COVERING' || remark === 'BULLS_CONSOLIDATING') return 1;
    if (remark === 'SHORT' || remark === 'LONG_UNWINDING' || remark === 'BEARS_COMING_SELL_ON_RISE' || remark === 'BEARS_CONSOLIDATING') return -1;
    return 0;
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
    // AST/BST count double (score ±2), ASO/BSO count once (±1)
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
    let signalHtml = '<div class="gtb-signal-block">'
    signalHtml += '<div class="sv-badge ' + marketSignal.color + ' gtb-signal-main-badge">' + marketSignal.signal + '</div>'
    signalHtml += '<div class="gtb-signal-reason">' + marketSignal.reason + '</div>'
    signalHtml += '</div>'
    jQ("#market-final-signal").html(signalHtml);

    // Update top bar signal pill
    try { updateTopBarSignal(marketSignal.signal, getTradingWindow()); } catch(e) {}

    // --- Entry confluence panel (dark theme) ---
    (function() {
        let cf = getEntryConfluence(SCORE);
        let dirCls = cf.direction === 'LONG' ? 'long' : cf.direction === 'SHORT' ? 'short' : 'wait';
        let dirIcon = cf.direction === 'LONG' ? 'bi-arrow-up-circle-fill' : cf.direction === 'SHORT' ? 'bi-arrow-down-circle-fill' : 'bi-hourglass-split';

        let cfHtml = '<div class="gtb-trade-dir ' + dirCls + '"><i class="bi ' + dirIcon + '"></i>&nbsp;' + cf.direction + '</div>';
        cfHtml += '<div style="font-size:0.58rem;color:#64748b;margin-bottom:3px;">' + cf.reasons.join(' · ') + '</div>';
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

    // --- 9:15 pattern signal (kept separate — direction context, not overridden by score) ---
    let output = marketSignal.tradeSignal;

    let html = ''

    html += '<div class="row">'

    html += '<div class="col-md-12">'
    if (output['outcome'] == "Buy") {
        html += '<span class="sv-badge sv-badge-green" style="font-size:0.75rem;padding:4px 10px;">' + output['outcome'] + '</span>';
    } else if (output['outcome'] == "Sell") {
        html += '<span class="sv-badge sv-badge-red" style="font-size:0.75rem;padding:4px 10px;">' + output['outcome'] + '</span>';
    } else if (output['outcome'] == "Sideways") {
        html += '<span class="sv-badge sv-badge-muted" style="font-size:0.75rem;padding:4px 10px;">' + output['outcome'] + '</span>';
    } else {
        html += '<span class="sv-badge sv-badge-amber" style="font-size:0.75rem;padding:4px 10px;">' + output['outcome'] + '</span>';
    }
    html += '</div>'

    html += '<div class="col-md-12">'
    html += '<div>Level : ' + output['level'] + '</div>'
    html += '</div>'

    html += '</div>'

    jQ("#trend-scoreboard-outcome").html(html);

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

function setFutureDetails(name, data) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    // Futures PLUS/MINUS are HTML strings of badge spans — render them as a compact 2-row layout
    let futHtml = '<div class="gtb-futures-signals">';
    futHtml += '<div class="gtb-fut-row bull">' + (data['PLUS'] || '—') + '</div>';
    futHtml += '<div class="gtb-fut-row bear">' + (data['MINUS'] || '—') + '</div>';
    futHtml += '</div>';
    jQ("#" + tempName + "-futures").html(futHtml);

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

        jQ("#" + tempName + "-futures-premium").html(html);

        html = ''

        html += '<a target="_blank" href="https://kite.zerodha.com/markets/ext/chart/web/tvc/' + 'NFO-FUT' + '/' + data['tradingsymbol'] + '/' + data['instrument_token'] + '"> '
        html += 'FUTURES';
        html += '</a>'

        jQ("#futures-chart-" + tempName).html(html);
    }
    jQ("#" + tempName + "-futures-vwap").html(data['vwap']);
    jQ("#" + tempName + "-futures-trend").html(data['trend']);

    // Update futures strip at bottom
    try {
        let premium = 0;
        if (name !== 'USDINR' && name !== 'CRUDEOILM') {
            let scriptData = generateTrend(name);
            premium = parseFloat(data['quote']['close']) - parseFloat(scriptData['ltp']);
        }
        updateFuturesStrip(name, data['REMARK'], data['vwapPrice'] || data['vwap'], premium);
    } catch(e) {}
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

jQ(document).on("click", ".popup-win-close", function () {
    let cls = jQ(this).closest('[data-popup]').data('popup');
    jQ('.' + cls).find('.popupwindow_titlebar_button_close').trigger('click');
});

jQ(document).on("click", ".popup-win-restore", function () {
    let btn   = jQ(this);
    let cls   = btn.closest('[data-popup]').data('popup');
    let popEl = jQ('.' + cls);
    let isMax = popEl.data('maximized');
    popEl.find('.popupwindow_titlebar_button_maximize').trigger('click');
    if (isMax) {
        btn.find('i').removeClass('bi-fullscreen-exit').addClass('bi-fullscreen');
        btn.attr('title', 'Maximize').removeClass('is-active');
    } else {
        btn.find('i').removeClass('bi-fullscreen').addClass('bi-fullscreen-exit');
        btn.attr('title', 'Restore').addClass('is-active');
    }
    // Re-show content if it was minimized
    let ctrlGroup = btn.closest('[data-popup]');
    let collapseTarget = popEl.find('.popup-win-content-area');
    if (collapseTarget.length) collapseTarget.show();
    btn.closest('[data-popup]').find('.popup-win-minimize')
        .removeClass('is-active').find('i').removeClass('bi-chevron-up').addClass('bi-dash');
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
    let isMaximized = popupEl.data('maximized');
    popupEl.find('.popupwindow_titlebar_button_maximize').trigger('click');
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
                      + '<div style="font-size:0.7rem;color:#94a3b8;">' + label + ' session · ' + key + ' IST</div>'
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
    h += pillarRow('Futures Trend',  futNet,            'bi-rocket-takeoff');
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
        h += '<div class="gtb-trade-row ' + cls + '">';
        h += '<span class="tr-name">' + strongDot + st.name + '</span>';
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
          .html('<i class="bi bi-shield-check"></i> HOLD ' + dir + ' — trend ' + trendVal + ' · N50fut ' + n50Fut + ' · BNfut ' + bnFut);
    }
}

// ── Update futures strip ─────────────────────────────────────────────────────
function updateFuturesStrip(name, remark, vwap, premium) {
    let tid = name.replace(/ /g, '-').replace(/&/g, '-');
    let remarkEl = jQ('#gtb-strip-remark-' + tid);
    if (!remarkEl.length) return;
    let isLong  = remark && (remark.includes('LONG') || remark.includes('COVERING') || remark.includes('BULL'));
    let isShort = remark && (remark.includes('SHORT') || remark.includes('BEAR') || remark.includes('UNWINDING'));
    let cls = isLong ? 'long' : isShort ? 'short' : 'other';
    let icon = isLong ? '▲' : isShort ? '▼' : '—';
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

function showNotes() {
    let htmlNote = ''
    htmlNote += '<div class="row" style="">'
    htmlNote += '<div class="col-md-12">'
    htmlNote += '<h5 style="text-align:center;">NOTES</h5>'
    htmlNote += '</div>'
    htmlNote += '<div class="col-md-12">'
    htmlNote += '<ul>'
    htmlNote += '<li>Depending on the number of ASO/BSO and  9:15 ASO/BSO</li>'
    htmlNote += '<li>2 ASO is strong uptrend</li>'
    htmlNote += '<li>2 BSO is strong downtrend</li>'
    htmlNote += '<li>Sensex ASO/BSO doesn\'t have much weightage</li>'
    htmlNote += '<li>Check RELIANCE AND HDFC BANK</li>'
    htmlNote += '<li>Check OI/OBV</li>'
    htmlNote += '<li>Check VIX -ve/+ve </li>'
    htmlNote += '<li>Check VIX range</li>'
    htmlNote += '<li>Check ADR</li>'
    htmlNote += '<li>Check CRUDE OIL</li>'
    htmlNote += '<li>Check Future Trend</li>'
    htmlNote += '<li>Check World Market/Europe Market around 12.45 - 1PM</li>'
    htmlNote += '</ul>'
    htmlNote += '</div>'
    htmlNote += '</div>'

    callSackBarInfo(htmlNote)
}

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

function showComponentOITable(name) {
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

    let html = '<div style="overflow-x:auto;">'
    html += '<table class="table display nowrap oi-strike-table" style="width:100%;">'

    // Group header row
    html += '<thead><tr>'
    for (let i = 0; i < strikes.length; i++) {
        let gc = strikeGroupClass(i);
        let gl = strikeGroupLabel(i);
        let isATM = i === atmIdx;
        let extraStyle = isATM ? 'font-weight:900;letter-spacing:0.5px;' : '';
        html += '<th colspan="5" class="strike-colspan-class ' + gc + '" style="' + extraStyle + '">' + gl + '</th>'
    }
    html += '</tr>'

    // Sub-header: CE | CE OBV | Strike | PE OBV | PE
    html += '<tr>'
    for (let i = 0; i < strikes.length; i++) {
        let isATM = i === atmIdx;
        let cls = isATM ? 'oi-atm-subhdr' : '';
        html += '<th class="number-align ' + cls + '">CE Δ</th>'
        html += '<th class="number-align ' + cls + '">CE OBV</th>'
        html += '<th class="text-align ' + cls + '">Strike</th>'
        html += '<th class="number-align ' + cls + '">PE OBV</th>'
        html += '<th class="number-align ' + cls + '">PE Δ</th>'
    }
    html += '</tr></thead><tbody><tr>'

    // Data row
    for (let i = 0; i < strikes.length; i++) {
        let s = strikes[i];
        if (!s) { html += '<td colspan="5"></td>'; continue; }
        let isATM = i === atmIdx;
        let tdCls = isATM ? 'oi-atm-cell' : '';

        let ceObv = s['CE_OBV'][s['CE_OBV'].length - 1]['obv'];
        let peObv = s['PE_OBV'][s['PE_OBV'].length - 1]['obv'];

        let ceChg = parseFloat(s['CHG_OI_CE']);
        let peChg = parseFloat(s['CHG_OI_PE']);
        let ceColor = ceChg > 0 ? 'style="color:#f85149;"' : ceChg < 0 ? 'style="color:#3fb950;"' : '';
        let peColor = peChg > 0 ? 'style="color:#3fb950;"' : peChg < 0 ? 'style="color:#f85149;"' : '';

        let strikeHtml = '<div style="display:flex;gap:4px;justify-content:center;align-items:center;">'
            + '<span style="font-weight:' + (isATM ? '900' : '600') + ';">' + s['STRIKE'] + '</span>'
            + '<a href="' + link.replaceAll("##INSTRUMENT##", s.CE.tradingsymbol).replaceAll("##TOKEN##", s.CE.instrument_token) + '" target="_blank" class="oi-link">CE</a>'
            + '<a href="' + link.replaceAll("##INSTRUMENT##", s.PE.tradingsymbol).replaceAll("##TOKEN##", s.PE.instrument_token) + '" target="_blank" class="oi-link">PE</a>'
            + '</div>'

        html += '<td class="number-align ' + tdCls + '" ' + ceColor + '>' + s['CHG_OI_CE'] + '</td>'
        html += '<td class="number-align ' + tdCls + '">' + ceObv + '</td>'
        html += '<td class="text-align ' + tdCls + '">' + strikeHtml + '</td>'
        html += '<td class="number-align ' + tdCls + '">' + peObv + '</td>'
        html += '<td class="number-align ' + tdCls + '" ' + peColor + '>' + s['CHG_OI_PE'] + '</td>'
    }

    html += '</tr></tbody></table></div>'
    jQ("#" + tempName + "-component-oi-list-table").html(html);
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
function _renderLWChart(containerId, candles, refLines, chartHeight) {
    let container = document.getElementById(containerId.replace('#', ''));
    if (!container) return;
    container.innerHTML = '';
    container.style.position = 'relative';

    let chart = LightweightCharts.createChart(container, {
        width: container.clientWidth || 300,
        height: chartHeight || 150,
        layout: { background: { color: '#0d1117' }, textColor: '#7d8590' },
        grid: { vertLines: { color: '#21262d' }, horzLines: { color: '#21262d' } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#30363d', visible: true, scaleMargins: { top: 0.05, bottom: 0.05 } },
        timeScale: { borderColor: '#30363d', timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
        localization: {
            // LW Charts treats Unix seconds as UTC; Zerodha timestamps are IST (UTC+5:30).
            // Add the IST offset so the displayed time matches the market clock.
            timeFormatter: function(utcSec) {
                var ist = new Date((utcSec + 19800) * 1000); // 19800 = 5.5 * 3600
                var h = ('0' + ist.getUTCHours()).slice(-2);
                var m = ('0' + ist.getUTCMinutes()).slice(-2);
                return h + ':' + m;
            }
        },
        handleScroll: false,
        handleScale: false,
    });

    let candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
        upColor: '#3fb950', downColor: '#f85149',
        borderUpColor: '#3fb950', borderDownColor: '#f85149',
        wickUpColor: '#3fb950', wickDownColor: '#f85149',
    });

    let lwData = candles.map(function(c) {
        return {
            time: Math.floor(new Date(c[0]).getTime() / 1000),
            open: parseFloat(c[1]), high: parseFloat(c[2]),
            low: parseFloat(c[3]),  close: parseFloat(c[4]),
        };
    });
    candleSeries.setData(lwData);

    // Reference price lines
    let lineColors = {
        'OPEN': '#d29922', 'VIXL': '#58a6ff', 'VIXU': '#58a6ff',
        'ASO': '#3fb950', 'AST': '#3fb950', 'BSO': '#f85149', 'BST': '#f85149',
    };
    (refLines || []).forEach(function(rl) {
        let key = rl.key || rl.text.split(':')[0].trim();
        candleSeries.createPriceLine({
            price: parseFloat(rl.value),
            color: lineColors[key] || '#7d8590',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: true,
            title: rl.text || '',
        });
    });

    chart.timeScale().fitContent();

    // Responsive resize
    let ro = new ResizeObserver(function() {
        chart.resize(container.clientWidth, chartHeight || 150);
    });
    ro.observe(container);
    container._lwChart = chart;
    return chart;
}

function _buildATRBadges(ltp, name, candles) {
    let tempName = name.replaceAll(' ', '-').replaceAll('&', '-');
    try {
        let instrScore = computeInstrumentScore(name);
        let oiObv = (INSTRUMENT_SCORE_MAP[name] && INSTRUMENT_SCORE_MAP[name].oi_obv) || 0;
        let instrNet = instrScore.current_trend + instrScore.futures_trend + oiObv;
        let dir = instrNet > 0 ? 'LONG' : instrNet < 0 ? 'SHORT' : null;
        if (!dir) dir = instrScore.nine_fifteen > 0 ? 'LONG' : instrScore.nine_fifteen < 0 ? 'SHORT' : null;

        let slHtml = '<div class="gtb-atr-strip">';
        if (dir) {
            let slData = computeSLAndTarget(ltp, dir, candles);
            if (slData) {
                let dc = dir === 'LONG' ? '#0d3320' : '#3d0d0d';
                let fc = dir === 'LONG' ? '#3fb950' : '#f85149';
                slHtml += '<span class="gtb-sl-badge dir-badge" style="background:' + dc + ';color:' + fc + ';border-color:' + fc + ';">' + dir + '</span>';
                slHtml += '<span class="gtb-sl-badge atr"><span class="sb-label">ATR</span><span class="sb-val">' + slData.atr + '</span></span>';
                slHtml += '<span class="gtb-sl-badge sl"><span class="sb-label">SL</span><span class="sb-val">' + slData.sl + '</span></span>';
                slHtml += '<span class="gtb-sl-badge t1"><span class="sb-label">T1</span><span class="sb-val">' + slData.target1 + '</span></span>';
                slHtml += '<span class="gtb-sl-badge t2"><span class="sb-label">T2</span><span class="sb-val">' + slData.target2 + '</span></span>';
                slHtml += '<span class="gtb-sl-badge atr"><span class="sb-label">R:R</span><span class="sb-val">' + slData.rr + '</span></span>';
            }
        } else {
            let slLong  = computeSLAndTarget(ltp, 'LONG',  candles);
            let slShort = computeSLAndTarget(ltp, 'SHORT', candles);
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

async function showTopChart(name, bindtoDivId, chartHeight) {
    try {
        let tempName = name.replaceAll(' ', '-').replaceAll('&', '-');
        let data = await getHistoricalDataUsingPromise(INSTRUMENT_TOKENS[name], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
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
        _renderLWChart(containerId, data.data.candles, refLines, chartHeight || 150);

        let ltp = data.data.candles[data.data.candles.length - 1][4];
        jQ('#' + tempName + '-ltp').html(parseFloat(ltp).toLocaleString('en-IN'));
        _buildATRBadges(ltp, name, data.data.candles);
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

function getOISignal(score, atmCeLabel, atmPeLabel) {
    // ATM combined label takes priority — most price-sensitive strike
    let atmBullish = 0, atmBearish = 0;
    let bullishLabels = { 'CE BUY': 1, 'CE COV': 1, 'PE WRITE': 1, 'PE UNWIND': 1 };
    let bearishLabels = { 'CE WRITE': 1, 'CE UNWIND': 1, 'PE BUY': 1, 'PE COV': 1 };
    if (atmCeLabel && bullishLabels[atmCeLabel]) atmBullish++;
    if (atmCeLabel && bearishLabels[atmCeLabel]) atmBearish++;
    if (atmPeLabel && bullishLabels[atmPeLabel]) atmBullish++;
    if (atmPeLabel && bearishLabels[atmPeLabel]) atmBearish++;

    let atmNet = atmBullish - atmBearish; // +2=both bullish, -2=both bearish, 0=mixed

    // Specific high-conviction ATM combos
    let atmLabel = (atmCeLabel || '') + '|' + (atmPeLabel || '');
    // Short squeeze: CE covering + PE writing = market being forced up
    if (atmCeLabel === 'CE COV' && atmPeLabel === 'PE WRITE') return { signal: 'STRONG BUY', color: '#155724', bg: '#d4edda' };
    // CE buying + PE writing = both sides bullish
    if (atmCeLabel === 'CE BUY'  && atmPeLabel === 'PE WRITE') return { signal: 'BUY',         color: '#155724', bg: '#d4edda' };
    // CE writing + PE covering = both sides bearish, market being forced down
    if (atmCeLabel === 'CE WRITE' && atmPeLabel === 'PE COV')  return { signal: 'STRONG SELL', color: '#721c24', bg: '#f8d7da' };
    // CE writing + PE buying = both sides bearish
    if (atmCeLabel === 'CE WRITE' && atmPeLabel === 'PE BUY')  return { signal: 'SELL',         color: '#721c24', bg: '#f8d7da' };
    // CE covering + PE buying = mixed — short covering but puts being bought, cautious
    if (atmCeLabel === 'CE COV'  && atmPeLabel === 'PE BUY')   return { signal: 'WAIT',         color: '#856404', bg: '#fff3cd' };
    // CE buying + PE covering = mixed — calls bought but put writers exiting
    if (atmCeLabel === 'CE BUY'  && atmPeLabel === 'PE COV')   return { signal: 'WAIT',         color: '#856404', bg: '#fff3cd' };

    // Fall back to net score across all strikes
    if      (score >=  6) return { signal: 'STRONG BUY',  color: '#155724', bg: '#d4edda' };
    else if (score >=  2) return { signal: 'BUY',          color: '#155724', bg: '#d4edda' };
    else if (score <=  -6) return { signal: 'STRONG SELL', color: '#721c24', bg: '#f8d7da' };
    else if (score <=  -2) return { signal: 'SELL',         color: '#721c24', bg: '#f8d7da' };
    else                   return { signal: 'NEUTRAL',      color: '#383d41', bg: '#e2e3e5' };
}

function updateScoresOfTrend(name, score, atmCeLabel, atmPeLabel) {
    let sig = getOISignal(score, atmCeLabel, atmPeLabel);
    let scoreCls = score > 0 ? 'sv-badge sv-badge-green' : 'sv-badge sv-badge-red';
    let signalCls = sig.signal === 'BUY' || sig.signal === 'STRONG BUY' ? 'sv-badge sv-badge-green'
                  : sig.signal === 'SELL' || sig.signal === 'STRONG SELL' ? 'sv-badge sv-badge-red'
                  : 'sv-badge sv-badge-amber';
    let scoreHtml = '<span class="' + scoreCls + '"><i class="bi bi-speedometer"></i> ' + (score > 0 ? '+' : '') + parseFloat(score).toFixed(2) + '</span>'
    scoreHtml += '<span class="' + signalCls + '">' + sig.signal + '</span>'
    jQ("#" + name.replaceAll(" ", "-") + "-oi-score").html(scoreHtml)
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

function showOIOBVBarChart(name) {
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
    chPcrHtml = pcrBadge(oiData['chPcr'], 'Δ');
    jQ("#" + tempName + "-pcr-probability").html(pcrHtml + chPcrHtml)

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
        oiCEOBV.push(item['CE_OBV'][item['CE_OBV'].length - 1]['obv'])
        oiPEOBV.push(item['PE_OBV'][item['PE_OBV'].length - 1]['obv'])

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
    updateScoresOfTrend(name, oiScore, atmSignal ? atmSignal.ceLabel : null, atmSignal ? atmSignal.peLabel : null);

    columnsOi.push(x)
    columnsOi.push(oiCECH)
    columnsOi.push(oiPECH)

    columnsObv.push(x)
    columnsObv.push(oiCEOBV)
    columnsObv.push(oiPEOBV)

    let strikes = x.slice(1); // strip 'x' header
    _renderBarChart('#' + tempName + '-oi', {
        labels: strikes,
        series: [
            { label: 'CH CE OI', color: OI_COLORS.CE_OI, values: oiCECH.slice(1) },
            { label: 'CH PE OI', color: OI_COLORS.PE_OI, values: oiPECH.slice(1) },
        ],
        atm: atmIndex, height: 110,
    });
    _renderBarChart('#' + tempName + '-obv', {
        labels: strikes,
        series: [
            { label: 'CE OBV', color: OI_COLORS.CE_OBV, values: oiCEOBV.slice(1) },
            { label: 'PE OBV', color: OI_COLORS.PE_OBV, values: oiPEOBV.slice(1) },
        ],
        atm: atmIndex, height: 110,
    });

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
    jQ("#" + tempName + "-oi-signal-row").html(signalRowHtml);

    showComponentOITable(name)
}

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
    let pres = await getHistoricalDataUsingPromise(futures['instrument_token'], PREVIOUS_DAY, PREVIOUS_DAY, 'day');
    // Fetch intraday 5-minute candles for real VWAP calculation
    let cres = await getHistoricalDataUsingPromise(futures['instrument_token'], CURRENT_DAY, CURRENT_DAY, '5minute');

    let intradayCandles = []
    let prevData = []
    jQ.each(cres.data.candles, function (index, item) {
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

    let resp = {}
    if (tempName == "BANKNIFTY") {
        resp = showTableAiBankNiftyPrediction(dailyCandle, prevDayCandle, futures['lot_size'], intradayCandles)
    } else {
        resp = showTableAiNiftyPrediction(dailyCandle, prevDayCandle, futures['lot_size'], intradayCandles)
    }
    resp['quote'] = dailyCandle
    resp['instrument_token'] = futures['instrument_token']
    resp['tradingsymbol'] = futures['tradingsymbol']

    resp['vwap'] = getVwapTrend(dailyCandle, prevDayCandle);
    resp['trend'] = getFutureDirection(dailyCandle, prevDayCandle, name);

    return resp;
}

// Computes price signal, OI signal, and short-covering flag from futures data.
// Uses VWAP position + recent candle trend as primary signals — not just pChange vs prevClose.
function computeFuturesSignals(intradayCandles, vwap, lastPrice, pChange, changeinOpenInterest, pchangeinOpenInterest) {
    // Recent candle trend: last 5 candles (25 min) — count consecutive closes up vs down
    let last5 = (intradayCandles && intradayCandles.length >= 2) ? intradayCandles.slice(-5) : [];
    let upCandles = 0, downCandles = 0;
    for (let ci = 1; ci < last5.length; ci++) {
        if (parseFloat(last5[ci].close) > parseFloat(last5[ci - 1].close)) upCandles++;
        else if (parseFloat(last5[ci].close) < parseFloat(last5[ci - 1].close)) downCandles++;
    }
    let recentBullish = upCandles >= 3;   // 3 of last 4 transitions closing higher
    let recentBearish = downCandles >= 3;

    // VWAP position — is current price above institutional average?
    let aboveVwap = parseFloat(lastPrice) >= parseFloat(vwap);

    // Price signal: VWAP is primary, candle trend confirms, pChange breaks ties
    let price;
    if      (aboveVwap && recentBullish)                     price = "+";   // above VWAP + trending up
    else if (aboveVwap && pChange > 0.1 && !recentBearish)   price = "+";   // above VWAP + day positive + not reversing
    else if (!aboveVwap && recentBearish)                    price = "-";   // below VWAP + trending down
    else if (!aboveVwap && pChange < -0.1 && !recentBullish) price = "-";   // below VWAP + day negative + not recovering
    else if (aboveVwap && recentBearish)                     price = "-";   // above VWAP but last 5 candles turning — weakening
    else if (!aboveVwap && recentBullish)                    price = "+-";  // below VWAP but recovering — mixed
    else                                                     price = "+-";  // no conviction

    // OI signal: require at least 0.5% change to be meaningful — filters out noise
    let oiPct = parseFloat(pchangeinOpenInterest);
    let oiAbs = parseFloat(changeinOpenInterest);
    let oi;
    if      (oiAbs > 0 && oiPct >= 0.5)  oi = "+";   // meaningful new positions added
    else if (oiAbs < 0 && oiPct <= -0.5) oi = "-";   // meaningful positions unwound
    else                                  oi = "+-";  // OI flat / noise — no directional conviction

    // Short covering / long unwinding: OI falling by > 1% (significant, not noise)
    let shortCoveringOrLongUnwinding = (oiAbs < 0 && Math.abs(oiPct) > 1);

    return { price: price, oi: oi, shortCoveringOrLongUnwinding: shortCoveringOrLongUnwinding, aboveVwap: aboveVwap, recentBullish: recentBullish, recentBearish: recentBearish };
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

function showTableAiNiftyPrediction(quote, prevQuote, lotSize, intradayCandles) {
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

    let signals = computeFuturesSignals(intradayCandles, vwap, lastPrice, pChange, changeinOpenInterest, pchangeinOpenInterest);
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

function showTableAiBankNiftyPrediction(quote, prevQuote, lotSize, intradayCandles) {

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
    var close = quote.close;
    var lastPrice = quote.close;

    var previousClose = prevQuote['close']
    var pChange = ((lastPrice - previousClose) / previousClose) * 100
    var change = (lastPrice - previousClose).toFixed(2)
    var shortCoveringOrLongUnwinding = false;
    var price;
    var oi;
    var booleanValue = false;
    var correctedVwap = vwap;
    correctedVwap = correctedVwap; // price spike adjustment
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

    let signals = computeFuturesSignals(intradayCandles, vwap, lastPrice, pChange, changeinOpenInterest, pchangeinOpenInterest);
    price = signals.price;
    oi = signals.oi;
    shortCoveringOrLongUnwinding = signals.shortCoveringOrLongUnwinding;
    booleanValue = signals.aboveVwap;

    let oiDisplayClass = (parseFloat(changeinOpenInterest) >= 0) ? 'bg-success' : 'bg-danger';
    openInterestMarkup = '<div class="badge ' + oiDisplayClass + '">' + openInterest + '</div>'
    openInterestDirectionMarkup = '<div class="badge ' + oiDisplayClass + '">' + (parseFloat(changeinOpenInterest) >= 0 ? upTriangle : bottomTriangle) + '</div>'
    openInterestChangeMarkup = '<div class="badge ' + oiDisplayClass + '">' + changeinOpenInterest + '</div>'
    openInterestChangePercMarkup = '<div class="badge ' + oiDisplayClass + '">' + pchangeinOpenInterest + '%</div>'

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

    var aiStatus = ""

    if (price == "+" && oi == "+") {
        remark = '<div class="badge bg-success">Long</div>'
        display = "+";
        aiStatus = "LONG"
    } else if (price == "-" && oi == "+") {
        remark = '<div class="badge bg-danger">Short</div>'
        display = "-";
        aiStatus = "SHORT"
    } else if (price == "+" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = '<div class="badge bg-success">Short Covering</div>'
        display = "+";
        aiStatus = "SHOT_COVERING"
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = dogImgContainer + '<div class="badge bg-danger">Long Unwinding</div>'
        display = "-";
        aiStatus = "LONG_UNWINDING"
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding == false) {
        remark = dogImgContainer + lokiImgContainer + '<div class="badge bg-danger">Bears Coming,Sell On Rise</div>'
        display = "-";
        aiStatus = "BEARS_COMING_SELL_ON_RISE"
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo >= 10) {
        remark = '<div class="badge bg-danger">Gambling! Buy,News & Events</div>'
        display = "+";
        aiStatus = "GAMBLING_BUY_NEWS_AND_EVENTS"
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo < 10) {
        remark = '<div class="badge bg-danger">Caution! Writers Eroding Premium</div>'
        display = "+";
        aiStatus = "CAUTION_WRITES_ERODING_PREMIUM"
    } else if (price == "+" && oi == "+-") {
        remark = '<div class="badge bg-warning text-dark">Bulls Consolidating</div>'
        display = "+";
        aiStatus = "BULLS_CONSOLIDATING"
    } else if (price == "-" && oi == "+-") {
        remark = '<div class="badge bg-warning text-dark">Bears Consolidating</div>'
        display = "-";
        aiStatus = "BEARS_CONSOLIDATING"
    } else {
        remark = captainImgContainer + '<div class="badge bg-danger">Defence,Buy On Decline</div>'
        display = "+";
        aiStatus = "DEFENCE_BUY_ON_DECLINE"
    }

    data.REMARK = aiStatus

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

    for (let i = 0; i < FO_LIST.length; i++) {
        console.log("Processing " + FO_LIST[i]);
        try {
            let asoPrice = parseFloat(scriptData[FO_LIST[i]]['strikeData']['ustrikeOne']);
            let bsoPrice = parseFloat(scriptData[FO_LIST[i]]['strikeData']['bstrikeOne']);
            jQ("#processing-trend").html("Processing.... " + (i + 1) + "/" + FO_LIST.length);

            let data = await getHistoricalDataUsingPromise(INSTRUMENT_TOKENS[FO_LIST[i]], CURRENT_DAY, CURRENT_DAY, '5minute');
            let volume = 0;
            jQ.each(data.data.candles, function (index, item) {
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
                all = all + FO_LIST.length;
                allNifty = allNifty + NIFTY_50_LIST.length;
                allBank = allBank + NIFTY_BANK_LIST.length;
            });

            scriptsVolumeMap[FO_LIST[i]] = volume;

            jQ.each(data.data.candles, function (index, item) {
                let time = moment(item[0]).format("HH:mm");
                if (advanceMap[time]) {
                    if (item[4] > asoPrice) {
                        advanceMap[time]['SYMBOL'].push(FO_LIST[i])
                        advanceMap[time]['COUNT'] = advanceMap[time]['COUNT'] + 1
                        allAdvances++;

                        if (jQ.inArray(FO_LIST[i], NIFTY_50_LIST) != -1) {
                            advanceMapNifty[time]['SYMBOL'].push(FO_LIST[i])
                            advanceMapNifty[time]['COUNT'] = advanceMapNifty[time]['COUNT'] + 1
                            allNiftyAdvances++;
                        }

                        if (jQ.inArray(FO_LIST[i], NIFTY_BANK_LIST) != -1) {
                            advanceMapBank[time]['SYMBOL'].push(FO_LIST[i])
                            advanceMapBank[time]['COUNT'] = advanceMapBank[time]['COUNT'] + 1
                            allBankAdvances++;
                        }
                    }
                }

                if (declineMap[time]) {
                    if (item[4] < bsoPrice) {
                        declineMap[time]['SYMBOL'].push(FO_LIST[i])
                        declineMap[time]['COUNT'] = declineMap[time]['COUNT'] + 1
                        allDeclines++;

                        if (jQ.inArray(FO_LIST[i], NIFTY_50_LIST) != -1) {
                            declineMapNifty[time]['SYMBOL'].push(FO_LIST[i])
                            declineMapNifty[time]['COUNT'] = declineMapNifty[time]['COUNT'] + 1
                            allNiftyDeclines++
                        }

                        if (jQ.inArray(FO_LIST[i], NIFTY_BANK_LIST) != -1) {
                            declineMapBank[time]['SYMBOL'].push(FO_LIST[i])
                            declineMapBank[time]['COUNT'] = declineMapBank[time]['COUNT'] + 1
                            allBankDeclines++
                        }
                    }
                }
            });
        } catch (e) {
            console.log("Error in processing " + FO_LIST[i])
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
    // Spread to avoid mutating the shared FO_LIST array on every call
    // Exclude MCX instruments — they use showFutureDetailsMCX, not NSE futures data
    let mcxNames = new Set(COMMODITIES_FUTURE_INSTRUMENT_LIST.map(function(f) { return f.name; }));
    let allList = [...FO_LIST, "NIFTY 50", "NIFTY BANK"].filter(function(n) { return !mcxNames.has(n); });

    let allFuturesAdvances = 0;
    let allFuturesDeclines = 0;

    let allNiftyFuturesAdvances = 0;
    let allNiftyFuturesDeclines = 0;
    let allNiftyBankFuturesAdvances = 0;
    let allNiftyBankFuturesDeclines = 0;

    let x = ['x'];


    for (let i = 0; i < allList.length; i++) {
        let name = allList[i];
        jQ("#processing-trend").html("Processing.... " + (i + 1) + "/" + allList.length);
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

            let pres = await getHistoricalDataUsingPromise(futures['instrument_token'], PREVIOUS_DAY, PREVIOUS_DAY, 'day');
            let cres = await getHistoricalDataUsingPromise(futures['instrument_token'], CURRENT_DAY, CURRENT_DAY, '5minute');
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
            jQ.each(cres.data.candles, function (index, item) {
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
                if (name == "BANKNIFTY") {
                    resp = showTableAiBankNiftyPrediction(item, prevData, futures['lot_size'])
                } else {
                    resp = showTableAiNiftyPrediction(item, prevData, futures['lot_size'])
                }

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
