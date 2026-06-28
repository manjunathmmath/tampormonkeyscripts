jQ(document).on("click", "#show-market-quote-analyzer", function (e) {
    e.preventDefault()
    showMarketQuoteAnalyzer();
})

async function showMarketQuoteAnalyzer() {

    let html = ''

    html += '<div class="row">'
    html += '<div class="col-md-12" >'
    html += '<h6 style="text-align:center">QUICK QUOTE SCANNER</h6>'

    html += '<table  class="table display nowrap" id="quick-quote-scanner-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>INSTRUMENT</th>'
    html += '<th>TREND</th>'
    html += '<th>TOTAL SELL</th>'
    html += '<th>TOTAL BUY</th>'
    html += '<th>VOLUME</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'

    html += '</div>'
    html += '</div>'


    let title = ''
    title += '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
    title += '<span style="font-weight:800;font-size:0.7rem;white-space:nowrap;"><i class="bi bi-bar-chart-line"></i> QUICK QUOTE ANALYZER</span>'
    title += '<span id="quick-refresh-timer-one" style="font-size:0.65rem;font-variant-numeric:tabular-nums;">00:00</span>'
    title += '<span id="quick-last-refresh-time" style="font-size:0.65rem;color:var(--gtb-muted,#7d8590);">Last @ 00:00:00</span>'
    title += popupWinControls("popup-custom-style-quick-quote-analyzer")
    title += '</div>'

    showPopUpWindow('quick-quote-analyzer', html, "Quick Quote Analyzer", 950, 550);
    var divId = "popup-custom-style-quick-quote-analyzer";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    hideNativePopupButtons(divId);
    var _isLight = (localStorage.getItem('GTB_THEME') || 'dark') === 'light';
    jQ('.' + divId).toggleClass('gtb-light', _isLight);

    jQ("." + divId).on("close.popupwindow", function () {
    });

    generateQuickQuoteScannerStockList();
}


async function generateQuickQuoteScannerStockList() {
    let scriptData = generateTrends()
    let data = []
    let q = ""
    let instruments = []
    jQ.each(FO_LIST, function (index, item) {
        let name = "NSE:" + item
        instruments.push(name)
    });

    let quotes = await getQuotesUsingPromise(instruments);
    quotes = quotes.data
    jQ.each(FO_LIST, function (index, item) {
        let name = item
        let trends = scriptData[name]['trends']
        let obj = {}
        obj['INSTRUMENT'] = name
        obj['TREND'] = trends
        obj['TOTAL_SELL'] = 0
        obj['TOTAL_BUY'] = 0
        obj['VOLUME'] = 0
        if (quotes) {
            let quote = quotes['NSE:' + name]
            console.log(name, quote)
            if (quote) {
                obj['TOTAL_SELL'] = quote.sell_quantity
                obj['TOTAL_BUY'] = quote.buy_quantity
                obj['VOLUME'] = quote.volume
            }
        }
        data.push(obj)
    });
    jQ('#quick-quote-scanner-list-table').show()
    generateQuickQuoteScannerTable(data)
}


let stockTableQuotes = null;
function generateQuickQuoteScannerTable(data) {
    stockTableQuotes = jQ('#quick-quote-scanner-list-table').DataTable({
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
                "data": "INSTRUMENT",
                render: function (data, type, row, meta) {
                    let html = ''
                    html += '<a target="_blank" href="https://kite.zerodha.com/markets/ext/chart/web/tvc/' + 'NSE' + '/' + data + '/' + INSTRUMENT_TOKENS[data] + '"> '
                    html += data;
                    html += '</a>'

                    html += '<span class="sv-badge sv-badge-blue" style="float:right;">'
                    html += '<a title="Sensibull Strategy Builder" target="_blank" href="https://web.sensibull.com/option-strategy-builder?instrument_symbol=' + data + '"> '
                    html += 'SB';
                    html += '</a>'
                    html += '</span> '

                    return html;
                }
            },
            { "data": "TREND" },
            { "data": "TOTAL_SELL" },
            { "data": "TOTAL_BUY" },
            { "data": "VOLUME" },
        ],
        "fnInitComplete": function (oSettings, json) {
        },
        "fnRowCallback": function (nRow, aData, iDisplayIndex, iDisplayIndexFull) {
        }
    });
}