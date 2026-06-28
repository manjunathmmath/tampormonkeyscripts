// ─── oiViewer.js ──────────────────────────────────────────────────────────────
// Multi-instrument OI (Open Interest) viewer popup.
//
// PURPOSE:
//   Provides a DataTables-based table showing OI Δ, OBV, and IV% for 5 strikes
//   (LOWER_TWO, LOWER_ONE, ATM, UPPER_ONE, UPPER_TWO) across all FO_LIST instruments.
//   Updated on manual click or auto-refresh timer (1-min or 5-min interval).
//
// COLUMNS PER STRIKE GROUP (7 columns each, 5 groups = 35 data columns):
//   CE Δ | CE OBV | CE IV% | STRIKE | PE IV% | PE OBV | PE Δ
//   (Previously 5 columns: CE Δ | CE OBV | STRIKE | PE OBV | PE Δ)
//
// DATA FLOW:
//   1. User selects instruments in #trending-stock-list-table (DataTables)
//   2. .analyse-instrument click → generateStockDataTable() for selected rows
//   3. generateStockDataTable() calls showTrendingOI() per instrument
//   4. OI data stored in trendingStocks[rowId] with STRIKE_*_CE_IV / PE_IV fields
//   5. DataTables redraws with updated rows
//
// SCORE DISPLAY:
//   scoreOIStrikeForSignal() applied to each strike → score per strike
//   Total OI score and signal shown per row via updateScoresOfTrend()
//
// AUTO-REFRESH:
//   startTimerOiViewer() runs setInterval every second.
//   At refreshInterval=1: triggers at s==59 (every minute)
//   At refreshInterval=5: triggers at minutes divisible by 5
// ─────────────────────────────────────────────────────────────────────────────

// Opens the OI Viewer popup with instrument selection table + analysis panel.
jQ(document).on("click", "#show-oi-viewer", function (e) {
    e.preventDefault();
    showOiViewer();
});

jQ(document).on("click", "#start-auto-refresh-oi-viewer", function (e) {
    e.preventDefault();
    let isEnabled = jQ("#enable-oi-refresh").is(':checked')
    if (!isEnabled) {
        return false
    }
    var that = jQ(this);
    that.attr("disabled", true);
    clearInterval(oiViewerTimerInstance)
    jQ("#trending-stock-list-table_wrapper .analyse-instrument").trigger("click")
});

function startOiViewerRefresh() {
    var display = document.querySelector('#oi-viewer-scanner-refresh-timer-one');
    startTimerOiViewer(REFRESH_TIME, display);
};

let oiViewerTimerInstance = null
function startTimerOiViewer(duration, display) {
    oiViewerTimerInstance = setInterval(function () {
        var d = new Date();
        var s = d.getSeconds();
        var m = d.getMinutes();
        var h = d.getHours();
        display.textContent = ("0" + h).substr(-2) + ":" + ("0" + m).substr(-2) + ":" + ("0" + s).substr(-2);
        let refreshInterval = jQ("#refresh-interval-oi-viewer option:selected").val();
        if (refreshInterval == 1) {
            if (s == 59) {
                jQ("#trending-stock-list-table_wrapper .analyse-instrument").trigger("click")
            }
        }

        if (refreshInterval == 5) {
            let currentMinute = moment().format("mm")
            if ((currentMinute % 5) == 0) {
                jQ("#trending-stock-list-table_wrapper .analyse-instrument").trigger("click")
            }
        }
    }, 1000);
}

function showOiViewer() {

    let html = ''

    html += '<div class="oiv-table-wrap">'
    html += '<table class="display nowrap oiv-table" id="trending-stock-list-table" style="width:100%;display:none;">'
    html += '<thead>'

    // Row 1 — strike group headers
    html += '<tr>'
    html += '<th rowspan="2" class="oiv-th-pin">SYMBOL</th>'
    html += '<th rowspan="2" class="oiv-th-pin">TREND</th>'
    html += '<th rowspan="2" class="oiv-th-pin">LTP</th>'
    html += '<th colspan="7" class="strike-colspan-class oiv-grp-bst2">BST-2</th>'
    html += '<th colspan="7" class="strike-colspan-class oiv-grp-bso">BSO</th>'
    html += '<th colspan="7" class="strike-colspan-class oiv-grp-atm">ATM</th>'
    html += '<th colspan="7" class="strike-colspan-class oiv-grp-aso">ASO</th>'
    html += '<th colspan="7" class="strike-colspan-class oiv-grp-ast2">AST-2</th>'
    html += '<th rowspan="2" class="oiv-th-pcr">PCR</th>'
    html += '</tr>'

    // Row 2 — sub-column headers (repeated 5×)
    let sub = ['CE Δ', 'CE OBV', 'CE IV%', 'STRIKE', 'PE IV%', 'PE OBV', 'PE Δ']
    for (let g = 0; g < 5; g++) {
        sub.forEach(function(s) { html += '<th class="oiv-sub-th">' + s + '</th>' })
    }
    html += '</tr>'
    html += '</thead>'
    html += '<tbody></tbody>'
    html += '</table>'
    html += '</div>'


    let title = ''
    title += '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
    title += '<span style="font-weight:800;font-size:0.7rem;white-space:nowrap;"><i class="bi bi-eye-fill"></i> OI VIEWER</span>'
    title += '<select id="api-data-interval" class="form-control form-control-sm" style="width:90px;">'
    title += '<option value="5minute" selected>5minute</option>'
    title += '<option value="minute">minute</option>'
    title += '</select>'
    title += '<select id="refresh-interval-oi-viewer" class="form-control form-control-sm" style="width:60px;">'
    title += '<option value="1">1m</option>'
    title += '<option value="5" selected>5m</option>'
    title += '</select>'
    title += '<input type="checkbox" id="enable-oi-refresh" title="Enable auto-refresh" style="cursor:pointer;">'
    title += '<a id="start-auto-refresh-oi-viewer" class="gtb-ds-btn gtb-ds-btn-primary" style="font-size:0.65rem;padding:2px 8px;">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
    title += '<span id="oi-viewer-scanner-refresh-timer-one" style="font-size:0.65rem;font-variant-numeric:tabular-nums;">00:00</span>'
    title += '<span id="processing-oi-viewer" style="font-size:0.65rem;color:var(--gtb-amber,#fbbf24);"></span>'
    title += popupWinControls("popup-custom-style-oi-viewer-scanner")
    title += '</div>'

    showPopUpWindow('oi-viewer-scanner', html, "OI VIEWER", 950, 550);
    var divId = "popup-custom-style-oi-viewer-scanner";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    hideNativePopupButtons(divId);
    var _isLight = (localStorage.getItem('GTB_THEME') || 'dark') === 'light';
    jQ('.' + divId).toggleClass('gtb-light', _isLight);
    generateStockDataTable();
}

// Entry point called by .analyse-instrument button click and auto-refresh timer.
// Delegates to showOiAnalyzer() — wrapper kept for historical consistency.
async function generateStockDataTable() {
    showOiAnalyzer();
}

// trendingStocks: array of row data objects, indexed by row number
// allTrendingStocks: same data keyed by instrument name (for quick lookup on update)
let trendingStocks = []
let allTrendingStocks = []

// ── OI Analyzer Main Loop ──────────────────────────────────────────────────────
// Iterates all INSTRUMENT_TOKENS, fetches OI data per instrument via showTrendingOIViewer(),
// and populates the trendingStocks array for DataTables rendering.
// Each row object contains:
//   STRIKE_ATM_CE_IV, STRIKE_ATM_PE_IV, STRIKE_UPPER_ONE_CE_IV, etc. — IV% display strings
//   STRIKE_ATM_CE_OBV, STRIKE_ATM_PE_OBV, etc.                       — OBV display strings
//   STRIKE_ATM, STRIKE_UPPER_ONE, etc.                                — strike prices
//   STRIKE_ATM_CE_CHG_OI, STRIKE_ATM_PE_CHG_OI, etc.                 — OI change (in lakh)
// After collecting all rows, calls generateTrendingStockTable() to render DataTables.
async function showOiAnalyzer() {
    trendingStocks = []
    allTrendingStocks = []
    let instru = [];
    let scripts = []
    let checkInstr = []
    let orderRow = 1;
    let scriptData = generateTrends()
    jQ.each(INSTRUMENT_TOKENS, function (index, item) {
        if (jQ.inArray(index, checkInstr) === -1) {
            instru.push(index)
            checkInstr.push(index)
        }
    });
    for (let i = 0; i < instru.length; i++) {
        let name = instru[i];
        let obj = {}
        console.log(name)
        obj['TRADINGSYMBOL'] = name;
        obj['CLOSE'] = scriptData[name]['prevPrice'];
        obj['PRICE'] = scriptData[name]['price'];
        obj['PERC'] = scriptData[name]['perc'];
        obj['TREND'] = scriptData[name]['trends'];
        obj['LTP'] = scriptData[name]['ltp'];
        obj['STRIKEDATA'] = scriptData[name]['strikeData'];
        obj['CURRENT_PRICE'] = scriptData[name]['ltp'];
        obj['TREND'] = scriptData[name]['trends'];

        let instrument = name
        if (name == "NIFTY 50") {
            instrument = "NIFTY"
        } else if (name == "NIFTY BANK") {
            instrument = "BANKNIFTY"
        } else if (name == "NIFTY FIN SERVICE") {
            instrument = "FINNIFTY"
        } else if (name == "NIFTY MID SELECT") {
            instrument = "MIDCPNIFTY"
        }

        scripts.push(obj)
    }

    for (let i = 0; i < scripts.length; i++) {
        let obj = {}

        obj['TRADINGSYMBOL'] = scripts[i]['TRADINGSYMBOL']
        obj['LTP'] = scripts[i]['LTP']
        obj['TREND'] = scripts[i]['TREND']
        obj['STRIKEDATA'] = scripts[i]['STRIKEDATA']
        obj['CLOSE'] = scripts[i]['CLOSE']
        obj['PRICE'] = scripts[i]['PRICE']
        obj['PERC'] = scripts[i]['PERC']
        let name = scripts[i]['TRADINGSYMBOL']

        let instrument = name
        if (name == "NIFTY 50") {
            instrument = "NIFTY"
        } else if (name == "NIFTY BANK") {
            instrument = "BANKNIFTY"
        } else if (name == "NIFTY FIN SERVICE") {
            instrument = "FINNIFTY"
        } else if (name == "NIFTY MID SELECT") {
            instrument = "MIDCPNIFTY"
        }

        obj['STRIKE_LOWER_ONE_CE'] = ''
        obj['STRIKE_LOWER_ONE_CE_OBV'] = ''
        obj['STRIKE_LOWER_ONE_CE_IV'] = ''
        obj['STRIKE_LOWER_ONE'] = ''
        obj['STRIKE_LOWER_ONE_PE_IV'] = ''
        obj['STRIKE_LOWER_ONE_PE'] = ''
        obj['STRIKE_LOWER_ONE_PE_OBV'] = ''

        obj['STRIKE_LOWER_TWO_CE'] = ''
        obj['STRIKE_LOWER_TWO_CE_OBV'] = ''
        obj['STRIKE_LOWER_TWO_CE_IV'] = ''
        obj['STRIKE_LOWER_TWO'] = ''
        obj['STRIKE_LOWER_TWO_PE_IV'] = ''
        obj['STRIKE_LOWER_TWO_PE'] = ''
        obj['STRIKE_LOWER_TWO_PE_OBV'] = ''

        obj['STRIKE_ATM_CE'] = ''
        obj['STRIKE_ATM_CE_OBV'] = ''
        obj['STRIKE_ATM_CE_IV'] = ''
        obj['STRIKE_ATM'] = ''
        obj['STRIKE_ATM_PE_IV'] = ''
        obj['STRIKE_ATM_PE'] = ''
        obj['STRIKE_ATM_PE_OBV'] = ''

        obj['STRIKE_UPPER_ONE_CE'] = ''
        obj['STRIKE_UPPER_ONE_CE_OBV'] = ''
        obj['STRIKE_UPPER_ONE_CE_IV'] = ''
        obj['STRIKE_UPPER_ONE'] = ''
        obj['STRIKE_UPPER_ONE_PE_IV'] = ''
        obj['STRIKE_UPPER_ONE_PE'] = ''
        obj['STRIKE_UPPER_ONE_PE_OBV'] = ''

        obj['STRIKE_UPPER_TWO_CE'] = ''
        obj['STRIKE_UPPER_TWO_CE_OBV'] = ''
        obj['STRIKE_UPPER_TWO_CE_IV'] = ''
        obj['STRIKE_UPPER_TWO'] = ''
        obj['STRIKE_UPPER_TWO_PE_IV'] = ''
        obj['STRIKE_UPPER_TWO_PE'] = ''
        obj['STRIKE_UPPER_TWO_PE_OBV'] = ''
        obj['PCR'] = ''

        trendingStocks.push(obj)
        orderRow++;

    }

    allTrendingStocks = trendingStocks;
    if (scripts.length > 0) {
        generateTrendingStockTable(trendingStocks)
    }
}

let trendingScannerTable = null
// Renders the DataTables instance for the OI Viewer.
// 5 strike groups × 7 columns each = 35 data columns + instrument name + action column.
// fnRowCallback: applies color coding to ATM strike column cells based on OI signal.
// Fixed first and last columns (instrument name + action) for horizontal scrolling.
function generateTrendingStockTable(data) {
    let link = "https://kite.zerodha.com/markets/ext/chart/web/tvc/NFO-OPT/##INSTRUMENT##/##TOKEN##"
    jQ("#trending-stock-list-table").show()
    trendingScannerTable = jQ('#trending-stock-list-table').DataTable({
        fixedColumns: {
            start: 1,
            end: 1
        },
        "processing": true,
        "order": [[0, 'asc']],
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

        // B = Buttons plugin container (.dt-buttons) — required so showOITrendCount()
        // can append the filter and ANALYZE OI buttons after the table initialises.
        dom: 'B<"oiv-dt-toolbar"f>rtip',
        buttons: [],
        "columns": [

            {
                "data": "TRADINGSYMBOL",
                render: function (data, type, row, meta) {
                    let html = ''
                    html += '<a target="_blank" href="https://kite.zerodha.com/markets/ext/chart/web/tvc/' + 'NSE' + '/' + data + '/' + INSTRUMENT_TOKENS[data] + '"> '

                    let trades = JSON.parse(localStorage.getItem("TRADES"));
                    if (jQ.inArray(data, trades) !== -1) {
                        html += '<span class=" oi-amber" title="Already traded">' + data + '</span>'
                    } else {
                        html += data;
                    }
                    html += '</a>'
                    let symbol = row['TRADINGSYMBOL']

                    html += '<span title="Track for next day" style="font-size:0.57rem;margin-left:4px;" data-price="' + row['LTP'] + '" data-index="' + 0 + '" data-trend="' + row['TREND'] + '" data-name="' + symbol + '" class="sv-badge sv-badge-blue track-next-day">'
                    html += 'T'
                    html += '</span>'

                    return html;
                }
            },
            {
                "data": "TREND",
                render: function (data, type, row, meta) {
                    if (type !== 'display') return Array.isArray(data) ? data.join(' ') : (data || '');
                    let trends = Array.isArray(data) ? data : (data ? String(data).split(',') : []);
                    let badges = trends.map(function(t) {
                        t = t.trim();
                        let cls = (t === 'ASO' || t === 'AST') ? 'oi-trend-bull'
                                : (t === 'BSO' || t === 'BST') ? 'oi-trend-bear'
                                : 'oi-trend-neutral';
                        return '<span class="oiv-trend-badge ' + cls + '">' + t + '</span>';
                    });
                    return '<div class="oiv-trend-cell">' + badges.join('') + '</div>';
                }
            },
            {
                "data": "LTP",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data) {
                        let name = row['TRADINGSYMBOL']
                        let tempName = name.replaceAll(" ", "-")
                        tempName = tempName.replaceAll("&", "-")
                        html += '<span class="ltp-claass " id="trending-ltp-price-' + tempName + '">' + data + '</span>'
                    }
                    return html
                }
            },

            // Helper: simple IV render (plain text display)
            // ── LOWER ONE (BSO) ─────────────────────────────────────────────
            { "data": "STRIKE_LOWER_ONE_CE",     render: function(d,t,r){ return d ? '<span class="number-align' + (parseFloat(d)>parseFloat(r.STRIKE_LOWER_ONE_PE)?' oi-bear':'') + '">' + d + '</span>' : '' } },
            { "data": "STRIKE_LOWER_ONE_CE_OBV", render: function(d,t,r){ return '<span class="number-align' + (parseFloat(r.STRIKE_LOWER_ONE_CE_OBV)>parseFloat(r.STRIKE_LOWER_ONE_PE_OBV)?' oi-bull':'') + '">' + r.STRIKE_LOWER_ONE_CE_OBV + '</span>' } },
            { "data": "STRIKE_LOWER_ONE_CE_IV",  render: function(d,t,r){ return '<span class="number-align oiv-iv">' + (r.STRIKE_LOWER_ONE_CE_IV || '—') + '</span>' } },
            {
                "data": "STRIKE_LOWER_ONE",
                render: function (data, type, row, meta) {
                    if (!data) return '';
                    let cls = (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_LOWER_ONE']) && parseFloat(row['LTP']) < parseFloat(row['STRIKE_LOWER_TWO'])) ? 'bg-danger-color' : '';
                    return '<span class="text-align ' + cls + '">' + data + '</span>'
                }
            },
            { "data": "STRIKE_LOWER_ONE_PE_IV",  render: function(d,t,r){ return '<span class="number-align oiv-iv">' + (r.STRIKE_LOWER_ONE_PE_IV || '—') + '</span>' } },
            { "data": "STRIKE_LOWER_ONE_PE_OBV", render: function(d,t,r){ return '<span class="number-align' + (parseFloat(r.STRIKE_LOWER_ONE_PE_OBV)>parseFloat(r.STRIKE_LOWER_ONE_CE_OBV)?' oi-bear':'') + '">' + r.STRIKE_LOWER_ONE_PE_OBV + '</span>' } },
            { "data": "STRIKE_LOWER_ONE_PE",     render: function(d,t,r){ return d ? '<span class="number-align' + (parseFloat(d)>parseFloat(r.STRIKE_LOWER_ONE_CE)?' oi-bull':'') + '">' + d + '</span>' : '' } },
            // ── LOWER TWO (BST) ─────────────────────────────────────────────
            { "data": "STRIKE_LOWER_TWO_CE",     render: function(d,t,r){ return d ? '<span class="number-align' + (parseFloat(d)>parseFloat(r.STRIKE_LOWER_TWO_PE)?' oi-bear':'') + '">' + d + '</span>' : '' } },
            { "data": "STRIKE_LOWER_TWO_CE_OBV", render: function(d,t,r){ return '<span class="number-align' + (parseFloat(r.STRIKE_LOWER_TWO_CE_OBV)>parseFloat(r.STRIKE_LOWER_TWO_PE_OBV)?' oi-bull':'') + '">' + r.STRIKE_LOWER_TWO_CE_OBV + '</span>' } },
            { "data": "STRIKE_LOWER_TWO_CE_IV",  render: function(d,t,r){ return '<span class="number-align oiv-iv">' + (r.STRIKE_LOWER_TWO_CE_IV || '—') + '</span>' } },
            {
                "data": "STRIKE_LOWER_TWO",
                render: function (data, type, row, meta) {
                    if (!data) return '';
                    let cls = (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_LOWER_TWO']) && parseFloat(row['LTP']) < parseFloat(row['STRIKE_ATM'])) ? 'bg-danger-color' : '';
                    return '<span class="text-align ' + cls + '">' + data + '</span>'
                }
            },
            { "data": "STRIKE_LOWER_TWO_PE_IV",  render: function(d,t,r){ return '<span class="number-align oiv-iv">' + (r.STRIKE_LOWER_TWO_PE_IV || '—') + '</span>' } },
            { "data": "STRIKE_LOWER_TWO_PE_OBV", render: function(d,t,r){ return '<span class="number-align' + (parseFloat(r.STRIKE_LOWER_TWO_PE_OBV)>parseFloat(r.STRIKE_LOWER_TWO_CE_OBV)?' oi-bear':'') + '">' + r.STRIKE_LOWER_TWO_PE_OBV + '</span>' } },
            { "data": "STRIKE_LOWER_TWO_PE",     render: function(d,t,r){ return d ? '<span class="number-align' + (parseFloat(d)>parseFloat(r.STRIKE_LOWER_TWO_CE)?' oi-bull':'') + '">' + d + '</span>' : '' } },
            // ── ATM ─────────────────────────────────────────────────────────
            { "data": "STRIKE_ATM_CE",     render: function(d,t,r){ return d ? '<span class="number-align' + (parseFloat(d)>parseFloat(r.STRIKE_ATM_PE)?' oi-bear':'') + '">' + d + '</span>' : '' } },
            { "data": "STRIKE_ATM_CE_OBV", render: function(d,t,r){ return '<span class="number-align' + (parseFloat(r.STRIKE_ATM_CE_OBV)>parseFloat(r.STRIKE_ATM_PE_OBV)?' oi-bull':'') + '">' + r.STRIKE_ATM_CE_OBV + '</span>' } },
            { "data": "STRIKE_ATM_CE_IV",  render: function(d,t,r){ return '<span class="number-align oiv-iv">' + (r.STRIKE_ATM_CE_IV || '—') + '</span>' } },
            {
                "data": "STRIKE_ATM",
                render: function (data, type, row, meta) {
                    if (!data) return '';
                    let cls = (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_ATM']) && parseFloat(row['LTP']) < parseFloat(row['STRIKE_UPPER_ONE'])) ? 'bg-danger-color' : '';
                    return '<span class="text-align ' + cls + '">' + data + '</span>'
                }
            },
            { "data": "STRIKE_ATM_PE_IV",  render: function(d,t,r){ return '<span class="number-align oiv-iv">' + (r.STRIKE_ATM_PE_IV || '—') + '</span>' } },
            { "data": "STRIKE_ATM_PE_OBV", render: function(d,t,r){ return '<span class="number-align' + (parseFloat(r.STRIKE_ATM_PE_OBV)>parseFloat(r.STRIKE_ATM_CE_OBV)?' oi-bear':'') + '">' + r.STRIKE_ATM_PE_OBV + '</span>' } },
            { "data": "STRIKE_ATM_PE",     render: function(d,t,r){ return d ? '<span class="number-align' + (parseFloat(d)>parseFloat(r.STRIKE_ATM_CE)?' oi-bull':'') + '">' + d + '</span>' : '' } },
            // ── UPPER ONE (ASO) ─────────────────────────────────────────────
            { "data": "STRIKE_UPPER_ONE_CE",     render: function(d,t,r){ return d ? '<span class="number-align' + (parseFloat(d)>parseFloat(r.STRIKE_UPPER_ONE_PE)?' oi-bear':'') + '">' + d + '</span>' : '' } },
            { "data": "STRIKE_UPPER_ONE_CE_OBV", render: function(d,t,r){ return '<span class="number-align' + (parseFloat(r.STRIKE_UPPER_ONE_CE_OBV)>parseFloat(r.STRIKE_UPPER_ONE_PE_OBV)?' oi-bull':'') + '">' + r.STRIKE_UPPER_ONE_CE_OBV + '</span>' } },
            { "data": "STRIKE_UPPER_ONE_CE_IV",  render: function(d,t,r){ return '<span class="number-align oiv-iv">' + (r.STRIKE_UPPER_ONE_CE_IV || '—') + '</span>' } },
            {
                "data": "STRIKE_UPPER_ONE",
                render: function (data, type, row, meta) {
                    if (!data) return '';
                    let cls = (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_UPPER_ONE']) && parseFloat(row['LTP']) < parseFloat(row['STRIKE_UPPER_TWO'])) ? 'bg-danger-color' : '';
                    return '<span class="text-align ' + cls + '">' + data + '</span>'
                }
            },
            { "data": "STRIKE_UPPER_ONE_PE_IV",  render: function(d,t,r){ return '<span class="number-align oiv-iv">' + (r.STRIKE_UPPER_ONE_PE_IV || '—') + '</span>' } },
            { "data": "STRIKE_UPPER_ONE_PE_OBV", render: function(d,t,r){ return '<span class="number-align' + (parseFloat(r.STRIKE_UPPER_ONE_PE_OBV)>parseFloat(r.STRIKE_UPPER_ONE_CE_OBV)?' oi-bear':'') + '">' + r.STRIKE_UPPER_ONE_PE_OBV + '</span>' } },
            { "data": "STRIKE_UPPER_ONE_PE",     render: function(d,t,r){ return d ? '<span class="number-align' + (parseFloat(d)>parseFloat(r.STRIKE_UPPER_ONE_CE)?' oi-bull':'') + '">' + d + '</span>' : '' } },
            // ── UPPER TWO (AST) ─────────────────────────────────────────────
            { "data": "STRIKE_UPPER_TWO_CE",     render: function(d,t,r){ return d ? '<span class="number-align' + (parseFloat(d)>parseFloat(r.STRIKE_UPPER_TWO_PE)?' oi-bear':'') + '">' + d + '</span>' : '' } },
            { "data": "STRIKE_UPPER_TWO_CE_OBV", render: function(d,t,r){ return '<span class="number-align' + (parseFloat(r.STRIKE_UPPER_TWO_CE_OBV)>parseFloat(r.STRIKE_UPPER_TWO_PE_OBV)?' oi-bull':'') + '">' + r.STRIKE_UPPER_TWO_CE_OBV + '</span>' } },
            { "data": "STRIKE_UPPER_TWO_CE_IV",  render: function(d,t,r){ return '<span class="number-align oiv-iv">' + (r.STRIKE_UPPER_TWO_CE_IV || '—') + '</span>' } },
            {
                "data": "STRIKE_UPPER_TWO",
                render: function (data, type, row, meta) {
                    if (!data) return '';
                    let cls = parseFloat(row['LTP']) > parseFloat(row['STRIKE_UPPER_TWO']) ? 'bg-warning-color' : '';
                    return '<span class="text-align ' + cls + '">' + data + '</span>'
                }
            },
            { "data": "STRIKE_UPPER_TWO_PE_IV",  render: function(d,t,r){ return '<span class="number-align oiv-iv">' + (r.STRIKE_UPPER_TWO_PE_IV || '—') + '</span>' } },
            { "data": "STRIKE_UPPER_TWO_PE_OBV", render: function(d,t,r){ return '<span class="number-align' + (parseFloat(r.STRIKE_UPPER_TWO_PE_OBV)>parseFloat(r.STRIKE_UPPER_TWO_CE_OBV)?' oi-bear':'') + '">' + r.STRIKE_UPPER_TWO_PE_OBV + '</span>' } },
            { "data": "STRIKE_UPPER_TWO_PE",     render: function(d,t,r){ return d ? '<span class="number-align' + (parseFloat(d)>parseFloat(r.STRIKE_UPPER_TWO_CE)?' oi-bull':'') + '">' + d + '</span>' : '' } },
            {
                "data": "PCR",
            },
        ],
        "fnInitComplete": function (oSettings, json) {
            showOITrendCount()

        },
        "fnRowCallback": function (nRow, aData, iDisplayIndex, iDisplayIndexFull) {
            for (var i in aData) {
                // 3 fixed cols (SYMBOL, TREND, LTP) + 7 cols per group → strike col at offset 6, 13, 20, 27, 34
                jQ('td:eq(' + 6  + ')', nRow).addClass('strike-class');
                jQ('td:eq(' + 13 + ')', nRow).addClass('strike-class');
                jQ('td:eq(' + 20 + ')', nRow).addClass('strike-class');
                jQ('td:eq(' + 27 + ')', nRow).addClass('strike-class');
                jQ('td:eq(' + 34 + ')', nRow).addClass('strike-class');

            }
        }
    });
    jQ("#trending-last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));

}

function showOITrendCount() {
    let asoCount = 0;
    let bsoCount = 0;
    let allCount = 0;
    jQ.each(allTrendingStocks, function (index, item) {
        if (jQ.inArray("ASO", item['TREND']) != -1) {
            asoCount++;
        }
        if (jQ.inArray("BSO", item['TREND']) != -1) {
            bsoCount++;
        }
        allCount++;
    });

    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="all"      class="dt-button trend-filter" type="button"><span>ALL (' + allCount + ')</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="bso"      class="dt-button trend-filter dt-btn-bear" type="button"><span>BSO (' + bsoCount + ')</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="aso"      class="dt-button trend-filter dt-btn-bull" type="button"><span>ASO (' + asoCount + ')</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="n50"      class="dt-button trend-filter" type="button"><span>N50</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="bank"     class="dt-button trend-filter" type="button"><span>BN</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="trending" class="dt-button trend-filter" type="button"><span>TRENDING</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="master"   class="dt-button trend-filter" type="button"><span>MASTER</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="valid"    class="dt-button trend-filter" type="button"><span>VALID</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="breakout" class="dt-button trend-filter" type="button"><span>BREAKOUT</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="index"    class="dt-button trend-filter" type="button"><span>INDEX</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="track"    class="dt-button trend-filter" type="button"><span>TRACK</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-type="OI"        class="dt-button analyse-instrument dt-btn-amber" type="button"><span>▶ ANALYZE OI</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<span class="dt-status-text" id="processing-trend"></span>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<span class="dt-status-text" id="last-refresh-trend"></span>')
}


jQ(document).on("click", "#trending-stock-list-table_wrapper .trend-filter", function (e) {
    let name = jQ(this).attr("data-trend");
    trendingStocks = []
    let VALID_STOCKS = getAllValidStocks();
    let BREAKOUT_STOCKS = getAllValidBreakOutStocks();
    let TRACKING_SCRIPTS = getAllTrackingStocks();
    jQ.each(allTrendingStocks, function (index, item) {
        if (name == "aso") {
            if (jQ.inArray("ASO", item['TREND']) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "bso") {
            if (jQ.inArray("BSO", item['TREND']) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "n50") {
            if (jQ.inArray(item['TRADINGSYMBOL'], NIFTY_50_LIST) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "bank") {
            if (jQ.inArray(item['TRADINGSYMBOL'], NIFTY_BANK_LIST) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "master") {
            if (jQ.inArray(item['TRADINGSYMBOL'], REFRESH_LIST) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "valid") {
            if (jQ.inArray(item['TRADINGSYMBOL'], VALID_STOCKS) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "breakout") {
            if (jQ.inArray(item['TRADINGSYMBOL'], BREAKOUT_STOCKS) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "index") {
            if (jQ.inArray(item['TRADINGSYMBOL'], INDEX_LIST) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "track") {
            if (jQ.inArray(item['TRADINGSYMBOL'], TRACKING_SCRIPTS) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "trending") {
            if (jQ.inArray("ASO", item['TREND']) != -1) {
                trendingStocks.push(item)
            }
            if (jQ.inArray("BSO", item['TREND']) != -1) {
                trendingStocks.push(item)
            }
        } else {
            trendingStocks.push(item)
        }
    });
    generateTrendingStockTable(trendingStocks)
});

jQ(document).on("click", "#trending-stock-list-table_wrapper .analyse-instrument", function (e) {
    e.preventDefault();
    // Only run if the #enable-oi-refresh checkbox is checked
    let isEnabled = jQ("#enable-oi-refresh").is(':checked');
    if (!isEnabled) { return false; }
    var that = jQ(this);
    that.attr("disabled", true);
    clearInterval(oiViewerTimerInstance)
    jQ("#trending-stock-list-table_wrapper #processing-trend").html("Processing.... ");
    commonAnalyzeTrend(that)
});

async function commonAnalyzeTrend(that) {
    await callAnalyseTrend()
    that.attr("disabled", false)
}

// Iterates trendingStocks (built by showOiAnalyzer) and refreshes OI data for each.
// For each instrument: fetches fresh OI via showTrendingOIViewer() → updates
// trendingStocks[rowId] with new CE/PE OI Δ, OBV, and IV% values → calls
// updateTrendingTable(rowId) to re-render that DataTables row without full refresh.
async function callAnalyseTrend() {
    let count = 0;
    let scriptsCount = trendingStocks.length

    for (let i = 0; i < scriptsCount; i++) {
        jQ("#trending-stock-list-table_wrapper  #processing-trend").html("Processing.... " + i + "/" + scriptsCount);
        try {

            let name = trendingStocks[i]['TRADINGSYMBOL']
            let tempName = name.replaceAll(" ", "-")
            tempName = tempName.replaceAll("&", "-")
            let rowId = i


            let res = generateTrend(name);
            trendingStocks[rowId]['LTP'] = res['ltp']
            if (name != 'GIFT NIFTY') {
                let oiData = await showTrendingOIViewer(name)
                let strikes = oiData['tableData']
                let pcrHtml = ''
                let chPcrHtml = ''

                function pcrBadge(val, label) {
                    let v = parseFloat(val);
                    let cls = v > 1.3 ? 'sv-badge-green' : v > 1.0 ? 'sv-badge-amber' : v > 0.7 ? 'sv-badge-muted' : 'sv-badge-red';
                    let tip = v > 1.3 ? 'Very Bullish' : v > 1.0 ? 'Mod.Bullish' : v > 0.7 ? 'Neutral' : 'Bearish';
                    return '<span title="' + tip + '" class="sv-badge ' + cls + '">' + label + ':' + val + '</span>';
                }
                pcrHtml = pcrBadge(oiData['pcr'], 'P');
                chPcrHtml = pcrBadge(oiData['chPcr'], 'Δ');
                trendingStocks[rowId]['PCR'] = pcrHtml + chPcrHtml

                let link = "https://kite.zerodha.com/markets/ext/chart/web/tvc/NFO-OPT/##INSTRUMENT##/##TOKEN##"

                function _obvLast(obvList) {
                    if (!obvList || !obvList.length) return 0;
                    return parseFloat(obvList[obvList.length-1]['obv']);
                }
                // Returns IV display string: current IV% with ▲/▼ arrow if changed
                function _ivDisplay(ivList) {
                    if (!ivList || !ivList.length) return '—';
                    let curr = null, prev = null;
                    for (let _i = ivList.length - 1; _i >= 0 && curr === null; _i--) if (ivList[_i].iv !== null) curr = ivList[_i].iv;
                    for (let _i = ivList.length - 2; _i >= 0 && prev === null; _i--) if (ivList[_i].iv !== null) prev = ivList[_i].iv;
                    if (curr === null) return '—';
                    let arrow = '';
                    if (prev !== null) { let d = curr - prev; arrow = d > 0.3 ? '▲' : d < -0.3 ? '▼' : ''; }
                    return curr.toFixed(1) + arrow;
                }

                if (strikes[0]) {
                    trendingStocks[rowId]['STRIKE_LOWER_ONE_CE'] = strikes[0]['CHG_OI_CE']
                    trendingStocks[rowId]['STRIKE_LOWER_ONE_CE_OBV'] = _obvLast(strikes[0]['CE_OBV'])
                    oiHtml = ''
                    oiHtml += '<div style="display:flex;">'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[0].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[0].CE.instrument_token) + '"  target="_blank" style="font-size:0.58rem;margin-right:.1rem;">'
                    oiHtml += 'CE'
                    oiHtml += '</a>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[0].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[0].PE.instrument_token) + '" target="_blank" style="font-size:0.58rem;">'
                    oiHtml += 'PE'
                    oiHtml += '</a>'
                    if (trendingStocks[rowId]['LTP'] < strikes[0]['STRIKE']) {
                        oiHtml += '<a data-price="' + strikes[0]['STRIKE'] + '" data-name="' + name + '" class="sv-badge sv-badge-muted create-alerts" style="font-size:0.57rem;margin-left:.1rem;">A</a>'
                    }
                    oiHtml += '</div>'

                    trendingStocks[rowId]['STRIKE_LOWER_ONE'] = strikes[0]['STRIKE'] + oiHtml
                    trendingStocks[rowId]['STRIKE_LOWER_ONE_CE_IV'] = _ivDisplay(strikes[0]['CE_IV'])
                    trendingStocks[rowId]['STRIKE_LOWER_ONE_PE'] = strikes[0]['CHG_OI_PE']
                    trendingStocks[rowId]['STRIKE_LOWER_ONE_PE_IV'] = _ivDisplay(strikes[0]['PE_IV'])
                    trendingStocks[rowId]['STRIKE_LOWER_ONE_PE_OBV'] = _obvLast(strikes[0]['PE_OBV'])
                }

                if (strikes[1]) {
                    trendingStocks[rowId]['STRIKE_LOWER_TWO_CE'] = strikes[1]['CHG_OI_CE']
                    trendingStocks[rowId]['STRIKE_LOWER_TWO_CE_OBV'] = _obvLast(strikes[1]['CE_OBV'])
                    oiHtml = ''
                    oiHtml += '<div style="display:flex;">'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[1].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[1].CE.instrument_token) + '"  target="_blank" style="font-size:0.58rem;margin-right:.1rem;">'
                    oiHtml += 'CE'
                    oiHtml += '</a>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[1].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[1].PE.instrument_token) + '" target="_blank" style="font-size:0.58rem;">'
                    oiHtml += 'PE'
                    oiHtml += '</a>'
                    if (trendingStocks[rowId]['LTP'] < strikes[1]['STRIKE']) {
                        oiHtml += '<a data-price="' + strikes[1]['STRIKE'] + '" data-name="' + name + '" class="sv-badge sv-badge-muted create-alerts" style="font-size:0.57rem;margin-left:.1rem;">A</a>'
                    }

                    oiHtml += '</div>'

                    trendingStocks[rowId]['STRIKE_LOWER_TWO'] = strikes[1]['STRIKE'] + oiHtml
                    trendingStocks[rowId]['STRIKE_LOWER_TWO_CE_IV'] = _ivDisplay(strikes[1]['CE_IV'])
                    trendingStocks[rowId]['STRIKE_LOWER_TWO_PE'] = strikes[1]['CHG_OI_PE']
                    trendingStocks[rowId]['STRIKE_LOWER_TWO_PE_IV'] = _ivDisplay(strikes[1]['PE_IV'])
                    trendingStocks[rowId]['STRIKE_LOWER_TWO_PE_OBV'] = _obvLast(strikes[1]['PE_OBV'])
                }

                if (strikes[2]) {
                    trendingStocks[rowId]['STRIKE_ATM_CE'] = strikes[2]['CHG_OI_CE']
                    trendingStocks[rowId]['STRIKE_ATM_CE_OBV'] = _obvLast(strikes[2]['CE_OBV'])
                    oiHtml = ''
                    oiHtml += '<div style="display:flex;">'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[2].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[2].CE.instrument_token) + '"  target="_blank" style="font-size:0.58rem;margin-right:.1rem;">'
                    oiHtml += 'CE'
                    oiHtml += '</a>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[2].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[2].PE.instrument_token) + '" target="_blank" style="font-size:0.58rem;">'
                    oiHtml += 'PE'
                    oiHtml += '</a>'
                    if (trendingStocks[rowId]['LTP'] < strikes[2]['STRIKE']) {
                        oiHtml += '<a data-price="' + strikes[2]['STRIKE'] + '" data-name="' + name + '" class="sv-badge sv-badge-muted create-alerts" style="font-size:0.57rem;margin-left:.1rem;">A</a>'
                    }

                    oiHtml += '</div>'

                    trendingStocks[rowId]['STRIKE_ATM'] = strikes[2]['STRIKE'] + oiHtml
                    trendingStocks[rowId]['STRIKE_ATM_CE_IV'] = _ivDisplay(strikes[2]['CE_IV'])
                    trendingStocks[rowId]['STRIKE_ATM_PE'] = strikes[2]['CHG_OI_PE']
                    trendingStocks[rowId]['STRIKE_ATM_PE_IV'] = _ivDisplay(strikes[2]['PE_IV'])
                    trendingStocks[rowId]['STRIKE_ATM_PE_OBV'] = _obvLast(strikes[2]['PE_OBV'])
                }

                if (strikes[3]) {
                    trendingStocks[rowId]['STRIKE_UPPER_ONE_CE'] = strikes[3]['CHG_OI_CE']
                    trendingStocks[rowId]['STRIKE_UPPER_ONE_CE_OBV'] = _obvLast(strikes[3]['CE_OBV'])
                    oiHtml = ''
                    oiHtml += '<div style="display:flex;">'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[3].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[3].CE.instrument_token) + '"  target="_blank" style="font-size:0.58rem;margin-right:.1rem;">'
                    oiHtml += 'CE'
                    oiHtml += '</a>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[3].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[3].PE.instrument_token) + '" target="_blank" style="font-size:0.58rem;">'
                    oiHtml += 'PE'
                    oiHtml += '</a>'
                    if (trendingStocks[rowId]['LTP'] < strikes[3]['STRIKE']) {
                        oiHtml += '<a data-price="' + strikes[3]['STRIKE'] + '" data-name="' + name + '" class="sv-badge sv-badge-muted create-alerts" style="font-size:0.57rem;margin-left:.1rem;">A</a>'
                    }

                    oiHtml += '</div>'


                    trendingStocks[rowId]['STRIKE_UPPER_ONE'] = strikes[3]['STRIKE'] + oiHtml
                    trendingStocks[rowId]['STRIKE_UPPER_ONE_CE_IV'] = _ivDisplay(strikes[3]['CE_IV'])
                    trendingStocks[rowId]['STRIKE_UPPER_ONE_PE'] = strikes[3]['CHG_OI_PE']
                    trendingStocks[rowId]['STRIKE_UPPER_ONE_PE_IV'] = _ivDisplay(strikes[3]['PE_IV'])
                    trendingStocks[rowId]['STRIKE_UPPER_ONE_PE_OBV'] = _obvLast(strikes[3]['PE_OBV'])
                }

                if (strikes[4]) {
                    trendingStocks[rowId]['STRIKE_UPPER_TWO_CE'] = strikes[4]['CHG_OI_CE']
                    trendingStocks[rowId]['STRIKE_UPPER_TWO_CE_OBV'] = _obvLast(strikes[4]['CE_OBV'])
                    oiHtml = ''
                    oiHtml += '<div style="display:flex;">'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[4].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[4].CE.instrument_token) + '"  target="_blank" style="font-size:0.58rem;margin-right:.1rem;">'
                    oiHtml += 'CE'
                    oiHtml += '</a>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[4].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[4].PE.instrument_token) + '" target="_blank" style="font-size:0.58rem;">'
                    oiHtml += 'PE'
                    oiHtml += '</a>'

                    if (trendingStocks[rowId]['LTP'] < strikes[4]['STRIKE']) {
                        oiHtml += '<a data-price="' + strikes[4]['STRIKE'] + '" data-name="' + name + '" class="sv-badge sv-badge-muted create-alerts" style="font-size:0.57rem;margin-left:.1rem;">A</a>'
                    }

                    oiHtml += '</div>'

                    trendingStocks[rowId]['STRIKE_UPPER_TWO'] = strikes[4]['STRIKE'] + oiHtml
                    trendingStocks[rowId]['STRIKE_UPPER_TWO_CE_IV'] = _ivDisplay(strikes[4]['CE_IV'])
                    trendingStocks[rowId]['STRIKE_UPPER_TWO_PE'] = strikes[4]['CHG_OI_PE']
                    trendingStocks[rowId]['STRIKE_UPPER_TWO_PE_IV'] = _ivDisplay(strikes[4]['PE_IV'])
                    trendingStocks[rowId]['STRIKE_UPPER_TWO_PE_OBV'] = _obvLast(strikes[4]['PE_OBV'])
                }
            }


            res = generateTrend(name);
            trendingStocks[rowId]['LTP'] = res['ltp']
            updateTrendingTable(rowId)
            count++;
            if (count == 3) {
                /*await callSleepForAWhile(1000)*/
                count = 0;
            }
        } catch (err) {
            console.log("Error while analyzing stock : " + trendingStocks[i]['TRADINGSYMBOL'])
            console.log(err)
        }
    }

    jQ("#trending-stock-list-table_wrapper  #processing-trend").html("Done...");
    jQ("#trending-stock-list-table_wrapper  #last-refresh-trend").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
    startOiViewerRefresh()
    jQ("#start-auto-refresh-oi-viewer").removeAttr("disabled")

}

async function showTrendingOIViewer(instrument) {

    let strikToShow = 3
    let strikeData = []
    let selectedStrike = []
    let res = generateTrend(instrument)
    let currentPrice = res['ltp']
    if (instrument == "NIFTY 50") {
        instrument = "NIFTY"
        strikToShow = 4
    } else if (instrument == "NIFTY BANK") {
        instrument = "BANKNIFTY"
        strikToShow = 4
    } else if (instrument == "NIFTY FIN SERVICE") {
        instrument = "FINNIFTY"
        strikToShow = 4
    } else if (instrument == "NIFTY MID SELECT") {
        instrument = "MIDCPNIFTY"
        strikToShow = 4
    }

    let atmStrike = 0;
    jQ.each(OPTION_STRIKE_LIST, function (index, item) {
        let date = moment(item.expiry, 'DD-MM-YYYY').format("YYYY-MM-DD")
        if (item.name == instrument) {
            if (instrument == "NIFTY") {
                if (date == NIFTY_EXPIRY_DATE) {
                    selectedStrike.push(item)
                }
            } else if (instrument == "SENSEX") {
                if (date == SENSEX_EXPIRY_DATE) {
                    selectedStrike.push(item)
                }
            } else {
                selectedStrike.push(item)
            }
        }
    });

    selectedStrike.sort(function (a, b) { return parseFloat(a.strike) - parseFloat(b.strike) })
    let upperStrikes = []
    let lowerStrikes = []
    jQ.each(selectedStrike, function (index, item) {
        let strike = parseFloat(item.strike)

        if (strike >= currentPrice && !atmStrike) {
            atmStrike = strike
        }

        if (strike >= currentPrice) {
            if (jQ.inArray(strike, upperStrikes) === -1) {
                upperStrikes.push(strike)
            }
        } else {
            if (jQ.inArray(strike, lowerStrikes) === -1) {
                lowerStrikes.push(strike)
            }
        }
    });

    for (let i = 1; i <= strikToShow; i++) {
        if (upperStrikes[i]) {
            let obj = {}
            obj['OI_CE'] = ''
            obj['CHG_OI_CE'] = ''
            obj['STRIKE'] = upperStrikes[i]
            obj['OI_PE'] = ''
            obj['CHG_OI_PE'] = ''
            obj['ATM_STRIKE'] = ''
            obj['CE'] = ''
            obj['PE'] = ''
            obj['CE_TOKEN'] = ''
            obj['PE_TOKEN'] = ''
            obj['CE_OBV'] = ''
            obj['PE_OBV'] = ''
            strikeData.push(obj)
        }
    }

    let obj = {}
    obj['OI_CE'] = ''
    obj['CHG_OI_CE'] = ''
    obj['STRIKE'] = atmStrike
    obj['OI_PE'] = ''
    obj['CHG_OI_PE'] = ''
    obj['ATM_STRIKE'] = true
    obj['CE'] = ''
    obj['PE'] = ''
    obj['CE_TOKEN'] = ''
    obj['PE_TOKEN'] = ''
    obj['CE_OBV'] = ''
    obj['PE_OBV'] = ''
    strikeData.push(obj)

    for (let i = 1; i <= strikToShow; i++) {
        if (lowerStrikes[lowerStrikes.length - i]) {
            let obj = {}
            obj['OI_CE'] = ''
            obj['CHG_OI_CE'] = ''
            obj['STRIKE'] = lowerStrikes[lowerStrikes.length - i]
            obj['OI_PE'] = ''
            obj['CHG_OI_PE'] = ''
            obj['ATM_STRIKE'] = ''
            obj['CE'] = ''
            obj['PE'] = ''
            obj['CE_TOKEN'] = ''
            obj['PE_TOKEN'] = ''
            obj['CE_OBV'] = ''
            obj['PE_OBV'] = ''
            strikeData.push(obj)
        }
    }
    strikeData.sort(function (a, b) { return parseFloat(a.STRIKE) - parseFloat(b.STRIKE) })

    // Fetch underlying spot candles once — shared across all strikes for IV calculation
    let spotCandles = [];
    try {
        let tokenName = instrument;
        if (instrument === 'NIFTY')      tokenName = 'NIFTY 50';
        else if (instrument === 'BANKNIFTY')  tokenName = 'NIFTY BANK';
        else if (instrument === 'FINNIFTY')   tokenName = 'NIFTY FIN SERVICE';
        else if (instrument === 'MIDCPNIFTY') tokenName = 'NIFTY MID SELECT';
        let underlyingToken = INSTRUMENT_TOKENS[tokenName];
        // Fallback for MCX commodity instruments (CRUDEOIL, CRUDEOILM, GOLD, SILVER, etc.)
        // MCX has no cash spot — use the nearest futures contract as the underlying for IV calculation
        let isMcx = false;
        if (!underlyingToken && typeof COMMODITIES_FUTURE_INSTRUMENT_LIST !== 'undefined') {
            let futEntry = COMMODITIES_FUTURE_INSTRUMENT_LIST.find(function(f) { return f.name === instrument; });
            if (futEntry) {
                underlyingToken = futEntry.instrument_token;
                isMcx = true;
            }
        }
        if (underlyingToken) {
            let interval = jQ("#api-data-interval option:selected").val() || '5minute';
            // MCX instruments use MCX trading dates; NSE instruments use CURRENT_DAY/PREVIOUS_DAY
            let fromDay  = isMcx ? _gtbMcxPrevDay()   : _gtbPrevDay();
            let toDay    = isMcx ? _gtbMcxCurrDayTo() : _gtbCurrDayTo();
            let spotData = await getHistoricalDataUsingPromise(underlyingToken, fromDay, toDay, interval);
            spotCandles = (spotData && spotData['data'] && spotData['data']['candles']) ? spotData['data']['candles'] : [];
        }
    } catch(e) { console.log('OIViewer IV: could not fetch spot candles', e); }

    let expiryDateStr = selectedStrike.length ? selectedStrike[0].expiry : null;

    let tableData = await showOITrendingDetailsOiViewer(strikeData, selectedStrike, spotCandles, expiryDateStr)
    return tableData
}

async function showOITrendingDetailsOiViewer(strikeData, selectedStrike, spotCandles, expiryDateStr) {
    spotCandles = spotCandles || [];
    expiryDateStr = expiryDateStr || null;
    let strikeMap = {}
    for (let i = 0; i < strikeData.length; i++) {
        try {
            let CE = ''
            let PE = ''
            if (strikeData[i]['STRIKE'] != 0) {
                for (let j = 0; j < selectedStrike.length; j++) {
                    if (parseFloat(strikeData[i]['STRIKE']) == parseFloat(selectedStrike[j].strike)
                        && selectedStrike[j].instrument_type == 'CE') {
                        CE = selectedStrike[j]
                    }

                    if (parseFloat(strikeData[i]['STRIKE']) == parseFloat(selectedStrike[j].strike)
                        && selectedStrike[j].instrument_type == 'PE') {
                        PE = selectedStrike[j]
                    }
                }

                let HISTORICAL_DATA_INTERVAL_OVERRIDE = jQ("#api-data-interval option:selected").val()
                if (!HISTORICAL_DATA_INTERVAL_OVERRIDE) {
                    HISTORICAL_DATA_INTERVAL_OVERRIDE = '5minute'
                }

                let prevDataCE = await getHistoricalDataUsingPromise(CE.instrument_token, PREVIOUS_DAY, PREVIOUS_DAY, 'day');
                let currDataCE = await getHistoricalDataUsingPromise(CE.instrument_token, _gtbPrevDay(), _gtbCurrDayTo(), HISTORICAL_DATA_INTERVAL_OVERRIDE);

                let prevDataPE = await getHistoricalDataUsingPromise(PE.instrument_token, PREVIOUS_DAY, PREVIOUS_DAY, 'day');
                let currDataPE = await getHistoricalDataUsingPromise(PE.instrument_token, _gtbPrevDay(), _gtbCurrDayTo(), HISTORICAL_DATA_INTERVAL_OVERRIDE);



                strikeMap[strikeData[i]['STRIKE']] = {}
                strikeMap[strikeData[i]['STRIKE']]['prevDataCE'] = prevDataCE
                strikeMap[strikeData[i]['STRIKE']]['currDataCE'] = currDataCE
                strikeMap[strikeData[i]['STRIKE']]['prevDataPE'] = prevDataPE
                strikeMap[strikeData[i]['STRIKE']]['currDataPE'] = currDataPE
                strikeMap[strikeData[i]['STRIKE']]['INDEX'] = i
                strikeMap[strikeData[i]['STRIKE']]['ATM_STRIKE'] = strikeData[i]['ATM_STRIKE']

                strikeMap[strikeData[i]['STRIKE']]['CE'] = CE
                strikeMap[strikeData[i]['STRIKE']]['PE'] = PE
            }
        } catch (err) {
            console.log("Error while fetching strike : " + strikeData[i]['STRIKE'])
        }
    }

    let tableData = []

    let totalCEOI = 0;
    let totalPEOI = 0;

    let chCEOI = 0;
    let chPEOI = 0;

    jQ.each(strikeMap, function (index, item) {
        try {
            let currDataCE = item['currDataCE']['data']['candles']
            let currDataPE = item['currDataPE']['data']['candles']

            let prevDataCE = item['prevDataCE']['data']['candles']
            let prevDataPE = item['prevDataPE']['data']['candles']

            if (currDataCE.length == 0) {
                currDataCE = prevDataCE
            }

            if (currDataPE.length == 0) {
                currDataPE = prevDataPE
            }

            let OI_CE = currDataCE[currDataCE.length - 1][6]
            let OI_PE = currDataPE[currDataPE.length - 1][6]

            totalCEOI = totalCEOI + OI_CE
            totalPEOI = totalPEOI + OI_PE

            let PREV_OI_CE = prevDataCE[prevDataCE.length - 1][6]
            let PREV_OI_PE = prevDataPE[prevDataPE.length - 1][6]

            let obj = {}
            obj['OI_CE'] = parseFloat(OI_CE / 100000).toFixed(1)
            obj['CHG_OI_CE'] = parseFloat((OI_CE - PREV_OI_CE) / 100000).toFixed(1)
            obj['STRIKE'] = index
            obj['OI_PE'] = parseFloat(OI_PE / 100000).toFixed(1)
            obj['CHG_OI_PE'] = parseFloat((OI_PE - PREV_OI_PE) / 100000).toFixed(1)
            obj['ATM_STRIKE'] = item.ATM_STRIKE
            obj['CE'] = item.CE
            obj['PE'] = item.PE

            chCEOI = chCEOI + (OI_CE - PREV_OI_CE)
            chPEOI = chPEOI + (OI_PE - PREV_OI_PE)

            obj['currDataCE'] = currDataCE
            obj['currDataPE'] = currDataPE

            obj['prevDataCE'] = prevDataCE
            obj['prevDataPE'] = prevDataPE

            obj['CE_OBV'] = calculateOBVFiveMinutesInterval(prevDataCE, currDataCE)
            obj['PE_OBV'] = calculateOBVFiveMinutesInterval(prevDataPE, currDataPE)

            // IV series — Black-Scholes inversion per candle (same as oiAnalyzer.js)
            if (expiryDateStr && spotCandles.length) {
                obj['CE_IV'] = calculateIVSeries(currDataCE, index, true,  expiryDateStr, spotCandles)
                obj['PE_IV'] = calculateIVSeries(currDataPE, index, false, expiryDateStr, spotCandles)
            } else {
                obj['CE_IV'] = []
                obj['PE_IV'] = []
            }

            tableData.push(obj)
        } catch (err) {
            console.log("Error while fetching strike : " + index)
        }

    });

    let pcr = parseFloat(totalPEOI / totalCEOI).toFixed(2);
    let chPcr = parseFloat(chPEOI / chCEOI).toFixed(2);


    tableData.sort(function (a, b) { return parseFloat(a.STRIKE) - parseFloat(b.STRIKE) })
    let map = {}
    map['tableData'] = tableData
    map['pcr'] = pcr
    map['chPcr'] = chPcr
    return map
}


// calculateOBVFiveMinutesInterval is defined in oiAnalyzer.js — shared logic

function updateTrendingTable(rowId) {
    jQ('#trending-stock-list-table').DataTable().row(rowId).data(trendingStocks[rowId]).draw(false);
}

jQ(document).on("click", ".create-alerts", function (e) {
    e.preventDefault();
    let name = jQ(this).attr("data-name");
    let price = jQ(this).attr("data-price");
    lhs_tradingsymbol = name

    let lhs_exchange = "NSE"
    if (lhs_tradingsymbol.includes("NIFTY")) {
        lhs_exchange = "INDICES"
    }

    createAlert(name + "-" + 'PRICE_ALERT', lhs_tradingsymbol, price, ">=", lhs_exchange)
});
