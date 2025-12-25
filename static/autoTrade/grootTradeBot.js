jQ(document).on("click", "#show-groot-trade-bot", function (e) {
    e.preventDefault();
    showGrootTradeBot();
});


async function showGrootTradeBot() {

    let html = ''

    html += '<div class="row">'

    html += '<div class="col-md-1">'
    html += '<span title="Previous Day Date" class="badge bg-primary me-1">' + PREVIOUS_DAY_DATE + '</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<span title="Current Day Date" class="badge bg-primary me-1">' + CURRENT_DAY + '</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<a class="" id="clean-storage" type="button">Clear</a>'
    html += '</div>'
    html += '<div class="col-md-1">'
    html += '<a class="" id="load-price" type="button">Load</a>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<a  id="start-auto-refresh">Refresh</a>'
    html += '</div>'
    html += '<div class="col-md-1 pop-title-extra">'
    html += '<span style="margin-left:.5rem;" id="refresh-timer-one">00:00</span>'
    html += '</div>'
    html += '<div class="col-md-3 pop-title-extra">'
    html += '<span id="last-refresh-time">Last @ 00:00:00</span>'
    html += '</div>'


    html += '</div>'

    html += '<div class="px-3 py-2 border-bottom mb-1"></div>'
    html += '<div class="row">'

    html += '<div class="col-md-12">'
    html += '<h6 class="header-class-center">'
    html += 'Advance [ASO]/Decline [BSO]'
    html += '<a  id="start-advance-decline-refresh" class="btn btn-secondary btn-sm btn-postion"><i class="bi bi-arrow-counterclockwise"></i></a>'
    html += '</h6>'
    html += '</div>'

    html += '<div class="col-md-4 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">All</h6>'
    html += '<div id="advance-decline-chart">'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-4 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">Nifty</h6>'
    html += '<div id="advance-decline-nifty-chart">'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-4 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">Bank</h6>'
    html += '<div id="advance-decline-bank-chart">'
    html += '</div>'
    html += '</div>'

    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-1"></div>'
    html += '<div class="row">'

    html += '<div class="col-md-3 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">Gift Nifty</h6>'
    html += '<div id="gift-nifty-top-chart">'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-3 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">Nifty 50</h6>'
    html += '<div id="nifty-to-chart">'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-3 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">Bank Nifty</h6>'
    html += '<div id="bank-nifty-top-chart">'
    html += '</div>'
    html += '</div>'


    html += '<div class="col-md-3 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">Sensex</h6>'
    html += '<div id="sensex-top-chart">'
    html += '</div>'
    html += '</div>'



    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-1"></div>'

    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table  class="table display nowrap" id="stock-list-table" style="width: 100%;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th></th>'
    html += '<th>SYMBOL</th>'
    html += '<th>CH %</th>'
    html += '<th>CLOSE 9:15</th>'
    html += '<th>TREND</th>'
    html += '<th>LTP</th>'
    html += '<th>FUTURE TREND</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'
    html += '</div>'
    html += '</div>'





    html += '<table class="table table-striped">'
    html += '<thead>'
    html += '<tr>'
    html += '<th scope="col">Price</th>'
    html += '<th scope="col">OI</th>'
    html += '<th scope="col">ChangeinOpenInterest</th>'
    html += '<th>PchangeinOpenInterest</th>'
    html += '<th>(Vwap -5) <= lastPrice</th>'
    html += '<th scope="col">Result</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '<tr>'
    html += '<td>+</td>'
    html += '<td>+</td>'
    html += '<td>N/A</td>'
    html += '<td>N/A</td>'
    html += '<td>N/A</td>'
    html += '<td>LONG</td>'
    html += '</tr>'
    html += '<tr>'
    html += '<td>-</td>'
    html += '<td>+</td>'
    html += '<td>N/A</td>'
    html += ' <td>N/A</td>'
    html += '<td>N/A</td>'
    html += '<td>SHORT</td>'
    html += '</tr>'
    html += '<tr>'
    html += '<td>+</td>'
    html += '<td>-</td>'
    html += '<td><0</td>'
    html += '<td><-2</td>'
    html += '<td>N/A</td>'
    html += '<td>SHORT COVERING</td>'
    html += '</tr>'
    html += '<tr>'
    html += '<td>-</td>'
    html += '<td>-</td>'
    html += '<td><0</td>'
    html += '<td><-2</td>'
    html += '<td>N/A</td>'
    html += '<td>LONG UNWINDING</td>'
    html += '</tr>'
    html += '<tr>'
    html += ' <td>-</td>'
    html += '<td>-</td>'
    html += '<td>N/A</td>'
    html += '<td>>= 10</td>'
    html += '<td>true</td>'
    html += '<td>Bears Coming,Sell On Rise</td>'
    html += '</tr>'
    html += '<tr>'
    html += ' <td>+-</td>'
    html += '<td>+</td>'
    html += '<td>>0</td>'
    html += '<td><10</td>'
    html += '<td>true</td>'
    html += '<td>Caution! Writers Eroding Premium</td>'
    html += '</tr>'
    html += '<tr>'
    html += '<td>N/A</td>'
    html += '<td>N/A</td>'
    html += '<td>N/A</td>'
    html += '<td>N/A</td>'
    html += '<td>N/A</td>'
    html += '<td>Defence,Buy On Decline</td>'
    html += '</tr>'

    html += '</tbody>'
    html += '</table>'

    let title = ''
    title += '<div class="row">'
    title += '<div class="col-md-2">'
    title += 'Groot Trade Bot'
    title += '</div>'
    title += '</div>'

    showPopUpWindow('groot-trade-bot', html, "Groot [Trade Bot]", 950, 550);
    let divId = "popup-custom-style-groot-trade-bot";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    showStockList([])
}
let advanceDeclineTimerInstance = null

jQ(document).on("click", "#start-advance-decline-refresh", function (e) {
    e.preventDefault();
    let that = jQ(this);
    that.attr("disabled", true);
    commonRefreshAdvanceDecline(that)
});

async function commonRefreshAdvanceDecline(that) {
    clearInterval(advanceDeclineTimerInstance)
    await showAdvacenDeclineScanner(that);
    await showTopChart("GIFT NIFTY", "gift-nifty-top-chart");
    await showTopChart("NIFTY 50", "nifty-to-chart")
    await showTopChart("NIFTY BANK", "bank-nifty-top-chart");
    await showTopChart("SENSEX", "sensex-top-chart");
    that.removeAttr("disabled");
}

async function showAdvacenDeclineScanner() {
    let scriptData = generateTrends()

    let advanceSeries = {}
    advanceSeries['seriesname'] = "Advance"
    advanceSeries['data'] = []

    let declineSeries = {}
    declineSeries['seriesname'] = "Decline"
    declineSeries['data'] = []


    let advanceSeriesNifty = {}
    advanceSeriesNifty['seriesname'] = "Advance"
    advanceSeriesNifty['data'] = []

    let declineSeriesNifty = {}
    declineSeriesNifty['seriesname'] = "Decline"
    declineSeriesNifty['data'] = []


    let advanceSeriesBank = {}
    advanceSeriesBank['seriesname'] = "Advance"
    advanceSeriesBank['data'] = []

    let declineSeriesBank = {}
    declineSeriesBank['seriesname'] = "Decline"
    declineSeriesBank['data'] = []

    let categoryList = [];

    let advanceMap = {};
    let declineMap = {};

    let advanceMapNifty = {};
    let declineMapNifty = {};

    let advanceMapBank = {};
    let declineMapBank = {};

    for (let i = 0; i < FO_LIST.length; i++) {
        let strikes = scriptData[FO_LIST[i]]['strikeData']

        let asoPrice = parseFloat(scriptData[FO_LIST[i]]['strikeData']['ustrikeOne']);
        let bsoPrice = parseFloat(scriptData[FO_LIST[i]]['strikeData']['bstrikeOne']);

        let data = await getHistoricalDataUsingPromise(instrumentTokens[FO_LIST[i]], CURRENT_DAY, CURRENT_DAY, '5minute');
        jQ.each(data.data.candles, function (index, item) {
            let time = moment(item[0]).format("HH:mm");
            if (i == 0) {
                let map = {}
                map.label = time;
                categoryList.push(map)

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

        });


        jQ.each(data.data.candles, function (index, item) {
            let time = moment(item[0]).format("HH:mm");
            if (advanceMap[time]) {
                if (item[4] > asoPrice) {
                    advanceMap[time]['SYMBOL'].push(FO_LIST[i])
                    advanceMap[time]['COUNT'] = advanceMap[time]['COUNT'] + 1

                    if (jQ.inArray(FO_LIST[i], NIFTY_50_LIST) != -1) {
                        advanceMapNifty[time]['SYMBOL'].push(FO_LIST[i])
                        advanceMapNifty[time]['COUNT'] = advanceMapNifty[time]['COUNT'] + 1
                    }

                    if (jQ.inArray(FO_LIST[i], NIFTY_BANK_LIST) != -1) {
                        advanceMapBank[time]['SYMBOL'].push(FO_LIST[i])
                        advanceMapBank[time]['COUNT'] = advanceMapBank[time]['COUNT'] + 1
                    }
                }


            }

            if (declineMap[time]) {
                if (item[4] < bsoPrice) {
                    declineMap[time]['SYMBOL'].push(FO_LIST[i])
                    declineMap[time]['COUNT'] = declineMap[time]['COUNT'] + 1

                    if (jQ.inArray(FO_LIST[i], NIFTY_50_LIST) != -1) {
                        declineMapNifty[time]['SYMBOL'].push(FO_LIST[i])
                        declineMapNifty[time]['COUNT'] = declineMapNifty[time]['COUNT'] + 1
                    }

                    if (jQ.inArray(FO_LIST[i], NIFTY_BANK_LIST) != -1) {
                        declineMapBank[time]['SYMBOL'].push(FO_LIST[i])
                        declineMapBank[time]['COUNT'] = declineMapBank[time]['COUNT'] + 1
                    }
                }
            }

        });
    };

    jQ.each(advanceMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#37a009 '
        val['value'] = aitem['COUNT']
        advanceSeries['data'].push(val)
    });

    jQ.each(declineMap, function (dindex, ditem) {
        let val = {}
        val['color'] = '#da3224'
        val['value'] = ditem['COUNT']
        declineSeries['data'].push(val);
    });



    jQ.each(advanceMapNifty, function (aindex, aitem) {
        let val = {}
        val['color'] = '#37a009 '
        val['value'] = aitem['COUNT']
        advanceSeriesNifty['data'].push(val)
    });

    jQ.each(declineMapNifty, function (dindex, ditem) {
        let val = {}
        val['color'] = '#da3224'
        val['value'] = ditem['COUNT']
        declineSeriesNifty['data'].push(val);
    });

    jQ.each(advanceMapBank, function (aindex, aitem) {
        let val = {}
        val['color'] = '#37a009 '
        val['value'] = aitem['COUNT']
        advanceSeriesBank['data'].push(val)
    });

    jQ.each(declineMapBank, function (dindex, ditem) {
        let val = {}
        val['color'] = '#da3224'
        val['value'] = ditem['COUNT']
        declineSeriesBank['data'].push(val);
    });

    jQ("#advance-decline-chart").insertFusionCharts({
        type: "mscolumn2d",
        width: "100%",
        dataFormat: "json",
        dataSource: {
            chart: {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "theme": "fusion",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                "paletteColors": "  #37a009,#da3224",
                "showLabels": 1,
                "showValues": "1"
            },
            axis: {
                y: {
                    tick: {
                        format: function (d) {
                            return (parseInt(d) == d) ? d : null;
                        }
                    }
                }
            },
            "categories": [{
                "category": categoryList
            }],
            dataset: [
                advanceSeries,
                declineSeries
            ]
        }
    });


    jQ("#advance-decline-nifty-chart").insertFusionCharts({
        type: "mscolumn2d",
        width: "100%",
        dataFormat: "json",
        dataSource: {
            chart: {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "theme": "fusion",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                "paletteColors": "  #37a009,#da3224",
                "showLabels": 1,
                "showValues": "1"
            },
            axis: {
                y: {
                    tick: {
                        format: function (d) {
                            return (parseInt(d) == d) ? d : null;
                        }
                    }
                }
            },
            "categories": [{
                "category": categoryList
            }],
            dataset: [
                advanceSeriesNifty,
                declineSeriesNifty
            ]
        }
    });



    jQ("#advance-decline-bank-chart").insertFusionCharts({
        type: "mscolumn2d",
        width: "100%",
        dataFormat: "json",
        dataSource: {
            chart: {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "theme": "fusion",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                "paletteColors": "  #37a009,#da3224",
                "showLabels": 1,
                "showValues": "1"
            },
            axis: {
                y: {
                    tick: {
                        format: function (d) {
                            return (parseInt(d) == d) ? d : null;
                        }
                    }
                }
            },
            "categories": [{
                "category": categoryList
            }],
            dataset: [
                advanceSeriesBank,
                declineSeriesBank
            ]
        }
    });
}

function showStockList(list) {
    let instru = [];
    let scripts = []
    let checkInstr = []
    let scriptData = generateTrends()
    if (!scriptData) {
        return false;
    }
    jQ.each(instrumentTokens, function (index, item) {
        if (jQ.inArray(index, checkInstr) === -1) {
            instru.push(index)
            checkInstr.push(index)
        }
    });

    for (let i = 0; i < instru.length; i++) {
        let name = instru[i];
        let obj = {}
        obj['TRADINGSYMBOL'] = name;
        obj['CLOSE'] = scriptData[name]['prevPrice'];
        obj['PRICE'] = scriptData[name]['price'];
        obj['PERC'] = scriptData[name]['change'];
        obj['TREND'] = scriptData[name]['trends'];
        obj['LTP'] = scriptData[name]['ltp'];
        obj['STRIKEDATA'] = scriptData[name]['strikeData'];
        obj['CLOSE_9_15'] = '';
        obj['FUTURE_TREND'] = '';
        if (list.length != 0) {
            if (jQ.inArray(name, list) != -1) {
                scripts.push(obj)
            }
        } else {
            scripts.push(obj)
        }
    }

    if (scripts.length > 0) {
        generateStockTable(scripts)
    }
}

let stockTable = null
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
                "class": 'details-control',
                "orderable": false,
                "data": null,
                "defaultContent": ''
            },

            {
                "data": "TRADINGSYMBOL",
                render: function (data, type, row, meta) {
                    let html = ''
                    html += '<a target="_blank" href="https://kite.zerodha.com/chart/ext/tvc/' + 'NSE' + '/' + data + '/' + instrumentTokens[data] + '"> '
                    html += data;
                    html += '</a>'
                    return html;
                }
            },
            { "data": "PERC" },
            { "data": "CLOSE_9_15" },
            { "data": "TREND" },
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
            { "data": "FUTURE_TREND" },
        ],
        "fnInitComplete": function (oSettings, json) {
            showExtraButtons()
        },
        "fnRowCallback": function (nRow, aData, iDisplayIndex, iDisplayIndexFull) {
        }
    });
}

function showExtraButtons() {
    jQ("#stock-list-table_wrapper .dt-buttons").append('<button id="nine-fifteen-scan" class="dt-button bg-info" type="button"><span>9.15 SCAN</span></button>');
    jQ("#stock-list-table_wrapper .dt-buttons").append('<span style="margin-right: .2rem;" id="processing-trend"></span>')
    jQ("#stock-list-table_wrapper .dt-buttons").append('<button data-trend="all" class="dt-button trend-filter  bg-info extra-buttons" type="button"><span>ALL</span></button>')
    jQ("#stock-list-table_wrapper .dt-buttons").append('<button data-trend="aso" class="dt-button trend-filter  bg-info extra-buttons" type="button"><span>ASO</span></button>')
    jQ("#stock-list-table_wrapper .dt-buttons").append('<button data-trend="bso" class="dt-button trend-filter  bg-info extra-buttons" type="button"><span>BSO</span></button>')
    jQ("#stock-list-table_wrapper .dt-buttons").append('<button style="margin-right: .2rem;" data-trend="n50" class="dt-button trend-filter  bg-info extra-buttons" type="button"><span>N50</span></button>')
    jQ("#stock-list-table_wrapper .dt-buttons").append('<button data-trend="bank" class="dt-button trend-filter  bg-info extra-buttons" type="button"><span>BN</span></button>')
    jQ("#stock-list-table_wrapper .dt-buttons").append('<button id="future-trend-scan" class="dt-button bg-info" type="button"><span>TREND SCAN</span></button>');

    jQ("#stock-list-table_wrapper .dt-buttons").append('<span class="bg-success sentiment-count" style="margin-left: .2rem;" id="aso-count">ASO</span>');
    jQ("#stock-list-table_wrapper .dt-buttons").append('<span class="bg-danger sentiment-count" style="margin-left: .2rem;" id="bso-count">BSO</span>');
    jQ("#stock-list-table_wrapper .dt-buttons").append('<span class="bg-warning sentiment-count" style="margin-left: .2rem;" id="neutral-count">NEUTRAL</span>');
    jQ("#stock-list-table_wrapper .dt-buttons").append('<span class="bg-success sentiment-count" style="margin-left: .2rem;" id="future-positve-count">+ F.TREND</span>');
    jQ("#stock-list-table_wrapper .dt-buttons").append('<span class="bg-danger sentiment-count" style="margin-left: .2rem;" id="future-negative-count">- F.TREND</span>');
    jQ("#stock-list-table_wrapper .dt-buttons").append('<span class="bg-warning sentiment-count" style="margin-left: .2rem;" id="future-neutral-count">+/- F.TREND</span>');
}

jQ(document).on("click", "#stock-list-table_wrapper .trend-filter", function (e) {
    let type = jQ(this).attr("data-trend");
    let list = [];
    let scriptData = generateTrends()
    jQ.each(instrumentTokens, function (index, item) {
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
    });
    showStockList(list)
});

jQ(document).on('click', '#nine-fifteen-scan', function (e) {
    scanNineFifteenCandle()

});

async function scanNineFifteenCandle() {
    let scriptData = generateTrends()
    let stockData = stockTable.rows().data().toArray();
    for (let i = 0; i < stockData.length; i++) {
        let row = stockData[i];
        let name = row['TRADINGSYMBOL'];
        jQ("#stock-list-table_wrapper  #processing-trend").html("Processing.... " + (i + 1) + "/" + stockData.length);
        try {
            let historical = await getHistoricalDataUsingPromise(instrumentTokens[name], CURRENT_DAY, CURRENT_DAY, '5minute');
            let firstCandleClose = historical.data.candles[0][4]
            let asoPrice = 0;
            let bsoPrice = 0;
            asoPrice = parseFloat(row['STRIKEDATA']['ustrikeOne']);
            bsoPrice = parseFloat(row['STRIKEDATA']['bstrikeOne']);

            if (firstCandleClose > asoPrice) {
                row['CLOSE_9_15'] = 'ASO';
            }

            if (firstCandleClose < bsoPrice) {
                row['CLOSE_9_15'] = 'BSO';
            }
            updateStockTable(i, row)
        } catch (e) {
            console.log(e)
        }
    }
}

jQ(document).on('click', '#future-trend-scan', function (e) {
    scanFutureTrend()

});

async function scanFutureTrend() {
    let scriptData = generateTrends()
    let stockData = stockTable.rows().data().toArray();
    let asoCount = 0;
    let bsoCount = 0;
    let futurePositiveCount = 0;
    let futureNegativeCount = 0;
    let futureNeutralCount = 0;
    let neutralCount = 0;
    for (let i = 0; i < stockData.length; i++) {
        let row = stockData[i];
        let name = row['TRADINGSYMBOL'];
        jQ.each(futureInstrumentsList, function (index, item) {
            let instName = name
            if (instName == "NIFTY 50") {
                instName = 'NIFTY'
            }
            if (item.name == instName) {
                futures = item;
            }
        })
        jQ("#stock-list-table_wrapper  #processing-trend").html("Processing.... " + (i + 1) + "/" + stockData.length);
        try {

            let pres = await getHistoricalDataUsingPromise(futures['instrument_token'], PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day');
            let cres = await getHistoricalDataUsingPromise(futures['instrument_token'], CURRENT_DAY, CURRENT_DAY, '5minute');

            let data = []
            let prevData = []
            jQ.each(cres.data.candles, function (index, item) {
                let map = {}
                map['date'] = moment(item[0]).format("HH:mm:ss")
                map.open = item[1]
                map.high = item[2]
                map.low = item[3]
                map.close = item[4]
                map.volume = item[5]
                map.oi = item[6]
                data.push(map);
            });

            jQ.each(pres.data.candles, function (index, item) {
                let map = {}
                map['date'] = moment(item[0]).format("HH:mm:ss")
                map.open = item[1]
                map.high = item[2]
                map.low = item[3]
                map.close = item[4]
                map.volume = item[5]
                map.oi = item[6]
                prevData.push(map);
            });
            prevData = prevData[prevData.length - 1];
            data = data[data.length - 1];
            let resp = {};
            if (name == "BANKNIFTY") {
                resp = showTableAiBankNiftyPrediction(data, prevData, futures['lot_size'])
            } else {
                resp = showTableAiNiftyPrediction(data, prevData, futures['lot_size'])
            }
            row['FUTURE_TREND'] = resp['PLUS'] + '<br/>' + resp['MINUS']
            row['LTP'] = scriptData[name]['ltp'];

            let trends = scriptData[name]['trends']
            if (jQ.inArray("ASO", trends) != -1) {
                asoCount++
            } else if (jQ.inArray("BSO", trends) != -1) {
                bsoCount++
            } else {
                neutralCount++;
            }


            if (resp['REMARK'] == "LONG") {
                futurePositiveCount++;
            }

            if (resp['REMARK'] == "SHOT_COVERING") {
                futurePositiveCount++;
            }

            if (resp['REMARK'] == "GAMBLING_BUY_NEWS_AND_EVENTS") {
                futurePositiveCount++;
            }

            if (resp['REMARK'] == "SHORT") {
                futureNegativeCount++;
            }

            if (resp['REMARK'] == "LONG_UNWINDING") {
                futureNegativeCount++;
            }

            if (resp['REMARK'] == "BEARS_COMING_SELL_ON_RISE") {
                futureNegativeCount++;
            }

            if (resp['REMARK'] == "CAUTION_WRITES_ERODING_PREMIUM") {
                futureNeutralCount++;
            }

            if (resp['REMARK'] == "DEFENCE_BUY_ON_DECLINE") {
                futureNeutralCount++;
            }

            updateStockTable(i, row)
        } catch (e) {
            console.log(e)
        }
    }


    jQ("#aso-count").html("ASO:" + asoCount);
    jQ("#bso-count").html("BSO:" + bsoCount);
    jQ("#neutral-count").html("NEUTRAL:" + neutralCount);
    jQ("#future-positve-count").html("+ F.TREND:" + futurePositiveCount);
    jQ("#future-negative-count").html("- F.TREND:" + futureNegativeCount);
    jQ("#future-neutral-count").html("+/- F.TREND:" + futureNeutralCount);
}


function updateStockTable(id, row) {
    jQ('#stock-list-table').DataTable().row(id).data(row).draw(false);
}


jQ(document).on('click', '#stock-list-table tbody td.details-control', function (e) {
    e.preventDefault()
    let tr = jQ(this).closest('tr');
    let row = stockTable.row(tr);
    let id = stockTable.row(this).index();
    if (row.child.isShown()) {
        row.child.hide();
        tr.removeClass('shown');
    } else {
        row.child(addAdditonalDetails(row.data(), id)).show();
        tr.addClass('shown');
        showInfo(row.data(), id)
    }
});

async function showInfo(rowData, id) {
    let name = rowData['TRADINGSYMBOL']
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let data = await getHistoricalDataUsingPromise(instrumentTokens[name], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
    await savePreviousStockQuote(tempName, instrumentTokens[name])
    let previousQuote = JSON.parse(localStorage.getItem(tempName + "_PREVIOUS_DAY_QUOTE"));

    let quote = []
    jQ.each(data.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("DD-MM-YY HH:mm:ss")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map['time'] = moment(item[0]).format("HH:mm")
        quote.push(map);
    });


    let prevQuote = []
    jQ.each(previousQuote.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("DD-MM-YY HH:mm:ss")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        prevQuote.push(map);
    });
    showScriptChart(quote, name, id, prevQuote);
    showScriptData(quote, name, prevQuote)
    showPrictionProbabilty(name)
    await show15MinutesChart(name)
    await showHourChart(name);
    await showFutureDetails(name);
}

async function showFutureDetails(name) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let futures;
    jQ.each(futureInstrumentsList, function (index, item) {
        let instName = name
        if (instName == "NIFTY 50") {
            instName = 'NIFTY'
        }
        if (item.name == instName) {
            futures = item;
        }
    })
    let pres = await getHistoricalDataUsingPromise(futures['instrument_token'], PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day');
    let cres = await getHistoricalDataUsingPromise(futures['instrument_token'], CURRENT_DAY, CURRENT_DAY, '5minute');

    let first = cres.data['candles'][0];
    let prev = pres.data['candles'][0];

    let data = []
    let prevData = []
    jQ.each(cres.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("HH:mm:ss")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map.oi = item[6]
        data.push(map);
    });

    jQ.each(pres.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("HH:mm:ss")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map.oi = item[6]
        prevData.push(map);
    });

    let strikeDiff = nseFutreStrikeDiff[name];
    strikeDiff = strikeDiff.split(",");
    let strikeOne = parseInt(strikeDiff[0])
    let strikeTwo = parseInt(strikeDiff[1])

    let ustrikeOne = (parseFloat(first[1]) + strikeOne);
    let ustrikeTwo = (ustrikeOne + strikeTwo);
    let bstrikeOne = (parseFloat(first[1]) - strikeOne);
    let bstrikeTwo = (bstrikeOne - strikeTwo);

    let strikeMap = {}
    strikeMap['strikeDiff'] = parseFloat(strikeDiff).toFixed(2);
    strikeMap['bstrikeOne'] = parseFloat(bstrikeOne).toFixed(2);
    strikeMap['bstrikeTwo'] = parseFloat(bstrikeTwo).toFixed(2);
    strikeMap['ustrikeOne'] = parseFloat(ustrikeOne).toFixed(2);
    strikeMap['ustrikeTwo'] = parseFloat(ustrikeTwo).toFixed(2);

    let chartId = 'chart-container-' + tempName + "-futures";
    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];

    var vix = getVixRange(parseFloat(prev[4]), parseFloat(vixQuote[4]))

    var vixLowerRange = 0;
    var vixUpperRange = 0;
    var vixDDRange = 0;

    vixLowerRange = parseFloat(vix.vixDDLower)
    vixUpperRange = parseFloat(vix.vixDDUpper)
    vixDDRange = parseFloat(vix.vixDDRange);


    let categoryList = []
    let dateIndex = 0
    jQ.each(data, function (index, item) {
        let map = {}
        map.label = item.date;
        map.x = dateIndex;
        categoryList.push(map)
        dateIndex++;
    });

    let dataList = []
    let min = 0
    let max = 0
    dateIndex = 0

    jQ.each(data, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
        map.volume = item.volume
        map.x = dateIndex

        if (index == 0) {
            min = item.high
            max = item.high
        }

        if (item.high < min) {
            min = item.high
        }

        if (item.high > max) {
            max = item.high
        }
        dataList.push(map);
        dateIndex++;
    });

    let lines = [];
    let line = {};

    line.color = "#8be73a";
    line.startvalue = vixLowerRange;
    line.displayvalue = 'Vix lower range ' + vixLowerRange;
    lines.push(line);;

    line = {};
    line.color = "#e7543a";
    line.startvalue = vixUpperRange;
    line.displayvalue = 'Vix upper range ' + vixUpperRange;
    lines.push(line);

    line = {};
    line.color = "#9f3ae7";
    line.startvalue = strikeMap.bstrikeTwo;
    line.displayvalue = "BST " + strikeMap.bstrikeTwo;
    lines.push(line);

    line = {};
    line.color = "#9f3ae7";
    line.startvalue = strikeMap.ustrikeTwo;
    line.displayvalue = "AST " + strikeMap.ustrikeTwo;
    lines.push(line);

    line = {};
    line.color = "#9f3ae7";
    line.startvalue = strikeMap.bstrikeOne;
    line.displayvalue = "BSO " + strikeMap.bstrikeOne;
    lines.push(line);

    line = {};
    line.color = "#9f3ae7";
    line.startvalue = strikeMap.ustrikeOne;
    line.displayvalue = "ASO " + strikeMap.ustrikeOne;
    lines.push(line);
    isVolumePresent = SHOW_VOLUME_ON_CHART
    jQ("#" + chartId).insertFusionCharts({
        type: 'candlestick',
        width: "100%",
        height: 400,
        dataFormat: 'json',
        dataSource: {
            "chart": {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "theme": "fusion",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                "pYAxisMinValue": min,
                "pYAxisMaxValue": max,
                showVolumeChart: isVolumePresent,
                "showLabels": 1
            },
            "categories": [{
                "category": categoryList
            }],
            "dataset": [{
                "data": dataList,

            }],
            "trendlines": [{
                "line": lines
            }]
        }
    });

    prevData = prevData[prevData.length - 1];
    generateFutresDataTable(data, tempName, prevData, futures['lot_size'])

}


async function show15MinutesChart(name, rowId) {
    let data = await getHistoricalDataUsingPromise(instrumentTokens[name], moment(CURRENT_DAY).add(-14, 'days').format("YYYY-MM-DD"), CURRENT_DAY, '15minute');
    let quote = []
    jQ.each(data.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("DD-MM-YY HH:mm:ss")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map['time'] = moment(item[0]).format("HH:mm")
        quote.push(map);
    });
    let scriptData = generateTrend(name)
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let chartId = 'chart-container-' + tempName.replaceAll(" ", "-").replaceAll("&", "-") + '-fifteen';

    let dayHigh = 0
    let dayLow = 0

    let categoryList = []
    let dateIndex = 0

    jQ.each(quote, function (index, item) {
        let map = {}
        map.label = item.date;
        map.x = dateIndex;
        categoryList.push(map)
        dateIndex++;

        if (item.high > dayHigh) {
            dayHigh = item.high
        }

        if (item.low < dayLow) {
            dayLow = item.low
        }

    });

    let dataList = []
    let min = 0
    let max = 0
    dateIndex = 0
    let isVolumePresent = false;

    jQ.each(quote, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
        if (item.volume) {
            map.volume = item.volume;
            isVolumePresent = true;
        }
        map.x = dateIndex
        if (item.high < min) {
            min = item.high
        }

        if (item.high > max) {
            max = item.high
        }
        dataList.push(map);
        dateIndex++;
    });

    isVolumePresent = SHOW_VOLUME_ON_CHART

    let lines = [];
    let line = {};


    line.color = "#8be73a";
    line.startvalue = scriptData['vix'].vixDDLower;
    line.displayvalue = 'VIXL: ' + scriptData['vix'].vixDDLower;
    lines.push(line);;

    line = {};
    line.color = "#e7543a";
    line.startvalue = scriptData['vix'].vixDDUpper;
    line.displayvalue = 'VIXU: ' + scriptData['vix'].vixDDUpper;
    lines.push(line);




    line = {};
    line.color = "#872b19ff";
    line.startvalue = scriptData['strikeData'].ustrikeTwo;
    line.displayvalue = "AST [NO BUYING]" + scriptData['strikeData'].ustrikeTwo;
    lines.push(line);


    line = {};
    line.color = "#d65db1";
    line.startvalue = scriptData['strikeData'].ustrikeOne;
    line.displayvalue = "ASO: " + scriptData['strikeData'].ustrikeOne;
    lines.push(line);


    line = {};
    line.color = "#ff6f91";
    line.startvalue = scriptData['strikeData'].bstrikeOne;
    line.displayvalue = "BSO: " + scriptData['strikeData'].bstrikeOne;
    lines.push(line);


    line = {};
    line.color = "#35dc35ff";
    line.startvalue = scriptData['strikeData'].bstrikeTwo;
    line.displayvalue = "BST [NO SELLING]: " + scriptData['strikeData'].bstrikeTwo;
    lines.push(line);

    jQ("#" + chartId).html('')
    jQ("#" + chartId).insertFusionCharts({
        type: 'candlestick',
        width: "100%",
        height: 400,
        dataFormat: 'json',
        dataSource: {
            "chart": {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "theme": "fusion",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                showVolumeChart: isVolumePresent,
                "showLabels": 1
            },
            "categories": [{
                "category": categoryList
            }],
            "dataset": [{
                "data": dataList,

            }],
            "trendlines": [{
                "line": lines
            }]
        }
    });
}

async function showHourChart(name, rowId) {
    let data = await getHistoricalDataUsingPromise(instrumentTokens[name], moment(CURRENT_DAY).add(-14, 'days').format("YYYY-MM-DD"), CURRENT_DAY, '60minute');
    let quote = []
    jQ.each(data.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("DD-MM-YY HH:mm:ss")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map['time'] = moment(item[0]).format("HH:mm")
        quote.push(map);
    });
    let scriptData = generateTrend(name)
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let chartId = 'chart-container-' + tempName.replaceAll(" ", "-").replaceAll("&", "-") + '-hour';

    let dayHigh = 0
    let dayLow = 0

    let categoryList = []
    let dateIndex = 0

    jQ.each(quote, function (index, item) {
        let map = {}
        map.label = item.date;
        map.x = dateIndex;
        categoryList.push(map)
        dateIndex++;

        if (item.high > dayHigh) {
            dayHigh = item.high
        }

        if (item.low < dayLow) {
            dayLow = item.low
        }

    });

    let dataList = []
    let min = 0
    let max = 0
    dateIndex = 0
    let isVolumePresent = false;

    jQ.each(quote, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
        if (item.volume) {
            map.volume = item.volume;
            isVolumePresent = true;
        }
        map.x = dateIndex
        if (item.high < min) {
            min = item.high
        }

        if (item.high > max) {
            max = item.high
        }
        dataList.push(map);
        dateIndex++;
    });

    isVolumePresent = SHOW_VOLUME_ON_CHART

    let lines = [];
    let line = {};


    line.color = "#8be73a";
    line.startvalue = scriptData['vix'].vixDDLower;
    line.displayvalue = 'VIXL: ' + scriptData['vix'].vixDDLower;
    lines.push(line);;

    line = {};
    line.color = "#e7543a";
    line.startvalue = scriptData['vix'].vixDDUpper;
    line.displayvalue = 'VIXU: ' + scriptData['vix'].vixDDUpper;
    lines.push(line);




    line = {};
    line.color = "#872b19ff";
    line.startvalue = scriptData['strikeData'].ustrikeTwo;
    line.displayvalue = "AST [NO BUYING]" + scriptData['strikeData'].ustrikeTwo;
    lines.push(line);


    line = {};
    line.color = "#d65db1";
    line.startvalue = scriptData['strikeData'].ustrikeOne;
    line.displayvalue = "ASO: " + scriptData['strikeData'].ustrikeOne;
    lines.push(line);


    line = {};
    line.color = "#ff6f91";
    line.startvalue = scriptData['strikeData'].bstrikeOne;
    line.displayvalue = "BSO: " + scriptData['strikeData'].bstrikeOne;
    lines.push(line);


    line = {};
    line.color = "#35dc35ff";
    line.startvalue = scriptData['strikeData'].bstrikeTwo;
    line.displayvalue = "BST [NO SELLING]: " + scriptData['strikeData'].bstrikeTwo;
    lines.push(line);

    jQ("#" + chartId).html('')
    jQ("#" + chartId).insertFusionCharts({
        type: 'candlestick',
        width: "100%",
        height: 400,
        dataFormat: 'json',
        dataSource: {
            "chart": {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "theme": "fusion",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                showVolumeChart: isVolumePresent,
                "showLabels": 1
            },
            "categories": [{
                "category": categoryList
            }],
            "dataset": [{
                "data": dataList,

            }],
            "trendlines": [{
                "line": lines
            }]
        }
    });
}

async function showScriptData(quote, name, prevQuote) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let stockDataTable = jQ("#script-data-" + tempName);
    let html = ''
    quote.reverse()
    jQ.each(quote, function (index, item) {
        let cssClass = ''
        if (item.volume > 50000) {
            cssClass = 'alert-warning'
        }

        html += '<tr class="' + item.cssClass + '">'
        html += '<td>' + item.date + '</td>'
        html += '<td>' + item.open + '</td>'
        html += '<td>' + item.high + '</td>'
        html += '<td>' + item.low + '</td>'

        let closeHtml = ''
        if ((item.close - item.previousClose) < 0) {
            closeHtml += '<span class="badge bg-danger">' + item.close + '</span>'
        } else {
            closeHtml += '<span class="badge bg-success">' + item.close + '</span>'
        }

        html += '<td>' + closeHtml + '</td>'
        html += '<td>' + item.volume + '</td>'
        html += '</tr>'
    })
    stockDataTable.find("tbody").html(html)
    stockDataTable.show()
}

function addAdditonalDetails(rowData, id) {

    let tempName = rowData['TRADINGSYMBOL'].replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let html = ''

    let chartId = 'chart-container-' + tempName.replaceAll(" ", "-").replaceAll("&", "-");

    html += '<div class="row">'

    html += '<div class="col-md-4">'
    html += '<div id="' + chartId + '-hour"class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-4">'
    html += '<div id="' + chartId + '-fifteen"class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-4">'
    html += '<div id="' + chartId + '-five"class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '</div>'
    html += '</div>'

    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row" >'
    html += '<div class="col-md-12">'
    html += '<table  class="table display nowrap" id="predictor-stock-list-table' + tempName + '" style="width: 100%;">'

    html += '<thead>'

    html += '<tr>'
    html += '<th>PCR</th>'
    html += '<th id="pcr-prediction' + tempName + '">PCR</th>'
    html += '</tr>'

    html += '<tr>'
    html += '<th>PREDICTION</th>'
    html += '<th id="prediction-prediction' + tempName + '">PREDICTION</th>'
    html += '</tr>'

    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'


    html += '<table  class="table display nowrap"  style="width: 100%;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th colspan="3" class="strike-colspan-class itm-col-class">Strike</th>'
    html += '<th colspan="3" class="strike-colspan-class itm-col-class">Strike</th>'
    html += '<th colspan="3" class="strike-colspan-class atm-col-class">Strike</th>'
    html += '<th colspan="3" class="strike-colspan-class otm-col-class">Strike</th>'
    html += '<th colspan="3" class="strike-colspan-class otm-col-class">Strike</th>'
    html += '</tr>'
    html += '<tr>'
    html += '<th id="STRIKE_LOWER_ONE_CE-prediction' + tempName + '" class="number-align" >CE</th>'
    html += '<th id="STRIKE_LOWER_ONE-prediction' + tempName + '" class="text-align">S</th>'
    html += '<th id="STRIKE_LOWER_ONE_PE-prediction' + tempName + '" class="number-align">PE</th> '

    html += '<th id="STRIKE_LOWER_TWO_CE-prediction' + tempName + '" class="number-align">CE</th>'
    html += '<th id="STRIKE_LOWER_TWO-prediction' + tempName + '" class="text-align">S</th>'
    html += '<th id="STRIKE_LOWER_TWO_PE-prediction' + tempName + '" class="number-align">PE</th> '

    html += '<th id="STRIKE_ATM_CE-prediction' + tempName + '" class="number-align">CE</th>'
    html += '<th id="STRIKE_ATM-prediction' + tempName + '" class="text-align">S</th>'
    html += '<th id="STRIKE_ATM_PE-prediction' + tempName + '" class="number-align">PE</th> '

    html += '<th id="STRIKE_UPPER_ONE_CE-prediction' + tempName + '" class="number-align">CE</th>'
    html += '<th id="STRIKE_UPPER_ONE-prediction' + tempName + '" class="text-align">S</th>'
    html += '<th id="STRIKE_UPPER_ONE_PE-prediction' + tempName + '" class="number-align">PE</th> '

    html += '<th id="STRIKE_UPPER_TWO_CE-prediction' + tempName + '" class="number-align">CE</th>'
    html += '<th id="STRIKE_UPPER_TWO-prediction' + tempName + '" class="text-align">S</th>'
    html += '<th id="STRIKE_UPPER_TWO_PE-prediction' + tempName + '" class="number-align">PE</th> '
    html += '<tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'


    html += '</div>'
    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row" id="oi-obv-charts' + tempName + '">'
    html += '</div>'

    html += '<div class="row">'
    html += '<div class="col-md-12" style="max-height:400px;height:400px;overflow:auto">'
    html += '<table  id="script-data-' + tempName + '" class="table table-hover" style="display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>DATE</th>'
    html += '<th>OPEN</th>'
    html += '<th>HIGH</th>'
    html += '<th>LOW</th>'
    html += '<th>CLOSE</th>'
    html += '<th>VOLUME</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'
    html += '</div>'
    html += '</div>'

    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row">'
    html += '<div id="' + chartId + '-futures" class="col-md-12">'
    html += '</div>';
    html += '</div>'
    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table class="historical-future-data-analyzer" id="historical-future-data-analyzer-list-table-' + tempName + '" style="width: 100%">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>DATE</th>'
    html += '<th>OPEN</th>'
    html += '<th>HIGH</th>'
    html += '<th>LOW</th>'
    html += '<th>CLOSE</th>'
    html += '<th>P.OI</th>'
    html += '<th>OI</th>'
    html += '<th>OI TREND</th>'
    html += '<th>VOLUME</th>'
    html += '<th>VWAP</th>'
    html += '<th>P.CLOSE</th>'
    html += '<th>CHANGE</th>'
    html += '<th>P.CHANGE</th>'
    html += '<th>CORR. VWAP</th>'
    html += '<th>VWAP SIGNAL</th>'
    html += '<th>BUY RESULT</th>'
    html += '<th>SELL RESULT</th>'
    html += '<th>FUTURE TREND</th>'
    html += '<th>AI</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'

    html += '</tbody>'
    html += '</table>'
    html += '</div>'
    html += '</div>'

    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row">'

    html += '<div class="col-md-6">'
    html += '<h6>Bullish Probability</h6>'
    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<input style="vertical-align:middle;" type="checkbox" /> Advances > Declines supporting the bullish trend'
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox" /> Price is below ASO/AST/VIXU ?'
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox" /> OI data supporting the bullish trend ?'
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox"/> 1 hour and 15 min timeframe indicates bullish trend ? '
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox"/> CE OBV  > PE OBV ? '
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox"/> Futures trend indicates bullish trend [Buy,Buy on decline,Short convering] ? '

    html += '</div>';

    html += '<div class="col-md-6">'
    html += '<h6>Bearish Probability</h6>'
    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<input style="vertical-align:middle;" type="checkbox" /> Declines > Advances supporting the bullish trend'
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox"/> Price is above BSO/BST/VIXL'
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox" /> OI data supporting the bearish trend'
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox"/> 1 hour and 15 min timeframe indicates bearish trend ? '
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox"/> PE OBV  > CE OBV ? '
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox"/> Futures trend indicates bearish trend [Short,Sell on rise,Long unwanding] ? '
    html += '</div>';

    html += '</div>';





    return html;
}

async function showScriptChart(quote, name, rowId, prevQuote) {

    let scriptData = generateTrend(name)
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let chartId = 'chart-container-' + tempName.replaceAll(" ", "-").replaceAll("&", "-") + '-five';

    let dayHigh = 0
    let dayLow = 0

    let categoryList = []
    let dateIndex = 0


    jQ.each(prevQuote, function (index, item) {
        let map = {}
        map.label = item.date;
        map.x = dateIndex;
        categoryList.push(map)
        dateIndex++;

        if (index == 0) {
            dayHigh = item.high
            dayLow = item.low
        }

        if (item.high > dayHigh) {
            dayHigh = item.high
        }

        if (item.low < dayLow) {
            dayLow = item.low
        }
    });


    jQ.each(quote, function (index, item) {
        let map = {}
        map.label = item.date;
        map.x = dateIndex;
        categoryList.push(map)
        dateIndex++;

        if (item.high > dayHigh) {
            dayHigh = item.high
        }

        if (item.low < dayLow) {
            dayLow = item.low
        }

    });

    let dataList = []
    let min = 0
    let max = 0
    dateIndex = 0
    let isVolumePresent = false;

    jQ.each(prevQuote, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
        if (item.volume) {
            map.volume = item.volume;
            isVolumePresent = true;
        }
        map.x = dateIndex

        if (index == 0) {
            min = item.high
            max = item.high
        }

        if (item.high < min) {
            min = item.high
        }

        if (item.high > max) {
            max = item.high
        }
        dataList.push(map);
        dateIndex++;
    });


    jQ.each(quote, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
        if (item.volume) {
            map.volume = item.volume;
            isVolumePresent = true;
        }
        map.x = dateIndex

        if (index == 0) {
            min = item.high
            max = item.high
            map.displayValue = "O"
        }

        if (item.high < min) {
            min = item.high
        }

        if (item.high > max) {
            max = item.high
        }
        dataList.push(map);
        dateIndex++;
    });

    isVolumePresent = SHOW_VOLUME_ON_CHART

    let lines = [];
    let line = {};


    line.color = "#8be73a";
    line.startvalue = scriptData['vix'].vixDDLower;
    line.displayvalue = 'VIXL: ' + scriptData['vix'].vixDDLower;
    lines.push(line);;

    line = {};
    line.color = "#e7543a";
    line.startvalue = scriptData['vix'].vixDDUpper;
    line.displayvalue = 'VIXU: ' + scriptData['vix'].vixDDUpper;
    lines.push(line);




    line = {};
    line.color = "#872b19ff";
    line.startvalue = scriptData['strikeData'].ustrikeTwo;
    line.displayvalue = "AST [NO BUYING]" + scriptData['strikeData'].ustrikeTwo;
    lines.push(line);


    line = {};
    line.color = "#d65db1";
    line.startvalue = scriptData['strikeData'].ustrikeOne;
    line.displayvalue = "ASO: " + scriptData['strikeData'].ustrikeOne;
    lines.push(line);


    line = {};
    line.color = "#ff6f91";
    line.startvalue = scriptData['strikeData'].bstrikeOne;
    line.displayvalue = "BSO: " + scriptData['strikeData'].bstrikeOne;
    lines.push(line);


    line = {};
    line.color = "#35dc35ff";
    line.startvalue = scriptData['strikeData'].bstrikeTwo;
    line.displayvalue = "BST [NO SELLING]: " + scriptData['strikeData'].bstrikeTwo;
    lines.push(line);


    line = {};
    if (parseFloat(scriptData['open']) > parseFloat(scriptData['prevPrice']).toFixed(2)) {
        line.color = "#5D8736";
        line.displayvalue = "Open +ve: " + scriptData['open'];
    } else {
        line.color = "#A94A4A";
        line.displayvalue = "Open -ve: " + scriptData['open'];
    }
    line.dashed = 1;
    line.startvalue = scriptData['open'];
    lines.push(line);

    jQ("#" + chartId).html('')
    jQ("#" + chartId).insertFusionCharts({
        type: 'candlestick',
        width: "100%",
        height: 400,
        dataFormat: 'json',
        dataSource: {
            "chart": {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "theme": "fusion",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                showVolumeChart: isVolumePresent,
                "showLabels": 1
            },
            "categories": [{
                "category": categoryList
            }],
            "dataset": [{
                "data": dataList,

            }],
            "trendlines": [{
                "line": lines
            }]
        }
    });
}

function updateTableLtpPrice() {
    let scriptData = generateTrends()
    let stockData = stockTable.rows().data().toArray();
    let newData = []
    for (let i = 0; i < stockData.length; i++) {
        let name = stockData[i]['TRADINGSYMBOL']
        stockData[i]['PERC'] = scriptData[name]['change']
        
        stockData[i]['TREND'] = scriptData[name]['trends']
        let ltp = scriptData[name]['ltp'];

        let asoPrice = 0;
        let bsoPrice = 0;
        let astPrice = 0;
        let bstPrice = 0;
        asoPrice = parseFloat(stockData[i]['STRIKEDATA']['ustrikeOne']);
        bsoPrice = parseFloat(stockData[i]['STRIKEDATA']['bstrikeOne']);

        astPrice = parseFloat(stockData[i]['STRIKEDATA']['ustrikeTwo']);
        bstPrice = parseFloat(stockData[i]['STRIKEDATA']['bstrikeTwo']);

        if (ltp >= astPrice) {
            stockData[i]['LTP'] = '<span title="AST PRICE" class="badge bg-danger">' + scriptData[name]['ltp'] + '</span>'
        }

         if (ltp >= asoPrice) {
            stockData[i]['LTP'] = '<span title="ASO PRICE" class="badge bg-warning">' + scriptData[name]['ltp'] + '</span>'
        }

         if (ltp <= bstPrice) {
            stockData[i]['LTP'] = '<span title="BST PRICE" class="badge bg-success">' + scriptData[name]['ltp'] + '</span>'
        }

        if (ltp <= bsoPrice) {
            stockData[i]['LTP'] = '<span title="BSO PRICE" class="badge bg-warning">' + scriptData[name]['ltp'] + '</span>'
        }
        newData.push(stockData[i])
    }
    generateStockTable(newData)
}


async function showTopChart(name, id) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let data = await getHistoricalDataUsingPromise(instrumentTokens[name], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
    await savePreviousStockQuote(tempName, instrumentTokens[name])
    let previousQuote = JSON.parse(localStorage.getItem(tempName + "_PREVIOUS_DAY_QUOTE"));

    let quote = []
    jQ.each(data.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("DD-MM-YY HH:mm:ss")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map['time'] = moment(item[0]).format("HH:mm")
        quote.push(map);
    });


    let prevQuote = []
    jQ.each(previousQuote.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("DD-MM-YY HH:mm:ss")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        prevQuote.push(map);
    });

    let scriptData = generateTrend(name)
    let chartId = id;

    let dayHigh = 0
    let dayLow = 0

    let categoryList = []
    let dateIndex = 0


    jQ.each(prevQuote, function (index, item) {
        let map = {}
        map.label = item.date;
        map.x = dateIndex;
        categoryList.push(map)
        dateIndex++;

        if (index == 0) {
            dayHigh = item.high
            dayLow = item.low
        }

        if (item.high > dayHigh) {
            dayHigh = item.high
        }

        if (item.low < dayLow) {
            dayLow = item.low
        }
    });


    jQ.each(quote, function (index, item) {
        let map = {}
        map.label = item.date;
        map.x = dateIndex;
        categoryList.push(map)
        dateIndex++;

        if (item.high > dayHigh) {
            dayHigh = item.high
        }

        if (item.low < dayLow) {
            dayLow = item.low
        }

    });

    let dataList = []
    let min = 0
    let max = 0
    dateIndex = 0
    let isVolumePresent = false;

    jQ.each(prevQuote, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
        if (item.volume) {
            map.volume = item.volume;
            isVolumePresent = true;
        }
        map.x = dateIndex

        if (index == 0) {
            min = item.high
            max = item.high
        }

        if (item.high < min) {
            min = item.high
        }

        if (item.high > max) {
            max = item.high
        }
        dataList.push(map);
        dateIndex++;
    });


    jQ.each(quote, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
        if (item.volume) {
            map.volume = item.volume;
            isVolumePresent = true;
        }
        map.x = dateIndex

        if (index == 0) {
            min = item.high
            max = item.high
            map.displayValue = "O"
        }

        if (item.high < min) {
            min = item.high
        }

        if (item.high > max) {
            max = item.high
        }
        dataList.push(map);
        dateIndex++;
    });

    isVolumePresent = SHOW_VOLUME_ON_CHART

    let lines = [];
    let line = {};


    line.color = "#8be73a";
    line.startvalue = scriptData['vix'].vixDDLower;
    line.displayvalue = 'VIXL: ' + scriptData['vix'].vixDDLower;
    lines.push(line);;

    line = {};
    line.color = "#e7543a";
    line.startvalue = scriptData['vix'].vixDDUpper;
    line.displayvalue = 'VIXU: ' + scriptData['vix'].vixDDUpper;
    lines.push(line);




    line = {};
    line.color = "#872b19ff";
    line.startvalue = scriptData['strikeData'].ustrikeTwo;
    line.displayvalue = "AST [NO BUYING]" + scriptData['strikeData'].ustrikeTwo;
    lines.push(line);


    line = {};
    line.color = "#d65db1";
    line.startvalue = scriptData['strikeData'].ustrikeOne;
    line.displayvalue = "ASO: " + scriptData['strikeData'].ustrikeOne;
    lines.push(line);


    line = {};
    line.color = "#ff6f91";
    line.startvalue = scriptData['strikeData'].bstrikeOne;
    line.displayvalue = "BSO: " + scriptData['strikeData'].bstrikeOne;
    lines.push(line);


    line = {};
    line.color = "#35dc35ff";
    line.startvalue = scriptData['strikeData'].bstrikeTwo;
    line.displayvalue = "BST [NO SELLING]: " + scriptData['strikeData'].bstrikeTwo;
    lines.push(line);


    line = {};
    if (parseFloat(scriptData['open']) > parseFloat(scriptData['prevPrice']).toFixed(2)) {
        line.color = "#5D8736";
        line.displayvalue = "Open +ve: " + scriptData['open'];
    } else {
        line.color = "#A94A4A";
        line.displayvalue = "Open -ve: " + scriptData['open'];
    }
    line.dashed = 1;
    line.startvalue = scriptData['open'];
    lines.push(line);

    jQ("#" + chartId).html('')
    jQ("#" + chartId).insertFusionCharts({
        type: 'candlestick',
        width: "100%",
        height: 400,
        dataFormat: 'json',
        dataSource: {
            "chart": {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "theme": "fusion",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                showVolumeChart: isVolumePresent,
                "showLabels": 1
            },
            "categories": [{
                "category": categoryList
            }],
            "dataset": [{
                "data": dataList,

            }],
            "trendlines": [{
                "line": lines
            }]
        }
    });
}

function generateFutresDataTable(quote, id, prevQuote, lotSize) {
    lotSize = parseInt(lotSize)
    jQ('#historical-future-data-analyzer-list-table-' + id).DataTable({
        "processing": true,
        "order": [[0, "desc"]],
        "pageLength": 50,
        "bPaginate": false,
        "data": quote,
        "bDestroy": true,
        "scrollX": true,
        "scrollY": "500px",
        "columnDefs": [
            {
                "targets": [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 15, 16],
                "visible": false,
                "searchable": false
            }
        ],
        "columns": [
            { "data": "date" },
            { "data": 'open' },
            { "data": 'high' },
            { "data": 'low' },
            { "data": 'close' },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    return (prevQuote.oi / lotSize).toFixed(0)
                }
            },
            {
                "data": 'oi',
                render: function (data, type, row, meta) {
                    let html = ''
                    if (meta.row != 0) {
                        let prev = parseInt(quote[(meta.row - 1)]['oi'])
                        let curr = parseInt(data);
                        html += ' ' + (data / lotSize).toFixed(0)
                    } else {
                        html = ' ' + (data / lotSize).toFixed(0)
                    }
                    return html
                }
            },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    var bottomTriangle = '<i class="bi bi-caret-down"></i>'
                    var upTriangle = '<i class="bi bi-caret-up"></i>'

                    var openInterest = row.oi / lotSize;
                    var previousOI = prevQuote.oi / lotSize
                    var changeinOpenInterest = (openInterest - previousOI)
                    var pchangeinOpenInterest = (((openInterest - previousOI) / previousOI) * 100).toFixed(2);

                    var oiPrice = ''
                    var oiPriceChang = ''
                    var oiPriceChangDirection = ''
                    var oiPricePer = ''
                    if (changeinOpenInterest > 0) {
                        oiPrice += '<span class="badge bg-success">' + openInterest.toFixed(0) + '</span>'
                        oiPriceChang += '<span class="badge bg-success">' + parseFloat(changeinOpenInterest).toFixed(2) + '</span>'
                        oiPriceChangDirection += '<span class="badge bg-success">' + upTriangle + '</span>'

                    } else {
                        oiPrice += '<span class="badge bg-danger">' + openInterest.toFixed(0) + '</span>'
                        oiPriceChang += '<span class="badge bg-danger">' + parseFloat(changeinOpenInterest).toFixed(2) + '</span>'
                        oiPriceChangDirection += '<span class="badge bg-danger">' + bottomTriangle + '</span>'
                    }

                    if (pchangeinOpenInterest > 0) {
                        oiPricePer += '<span class="badge bg-success">' + parseFloat(pchangeinOpenInterest).toFixed(2) + '%</span>'
                    } else {
                        oiPricePer += '<span class="badge bg-danger">' + parseFloat(pchangeinOpenInterest).toFixed(2) + '%</span>'
                    }

                    return oiPrice + " " + oiPriceChangDirection + " " + oiPricePer + " " + oiPriceChang
                }
            },
            { "data": 'volume' },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    var pTypicalPrice = (parseFloat(prevQuote.high) + parseFloat(prevQuote.low) + parseFloat(prevQuote.close)) / 3
                    var cTypicalPrice = (parseFloat(row.high) + parseFloat(row.low) + parseFloat(row.close)) / 3
                    var cVolumePrice = cTypicalPrice * parseFloat(row.volume)
                    var pVolumePrice = pTypicalPrice * parseFloat(prevQuote.volume)
                    var totalVolumePrice = cVolumePrice + pVolumePrice
                    var totalVolume = parseInt(row.volume) + parseInt(prevQuote.volume)
                    var vwapPrice = (totalVolumePrice / totalVolume).toFixed(2)
                    var vwap = vwapPrice ? vwapPrice : 0;
                    return vwap
                }
            },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    return prevQuote.close
                }
            },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    var change = (row.close - prevQuote.close)
                    return change.toFixed(2)
                }
            },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    var pChange = ((row.close - prevQuote.close) / prevQuote.close) * 100
                    return pChange.toFixed(2)
                }
            },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    var pTypicalPrice = (parseFloat(prevQuote.high) + parseFloat(prevQuote.low) + parseFloat(prevQuote.close)) / 3
                    var cTypicalPrice = (parseFloat(row.high) + parseFloat(row.low) + parseFloat(row.close)) / 3
                    var cVolumePrice = cTypicalPrice * parseFloat(row.volume)
                    var pVolumePrice = pTypicalPrice * parseFloat(prevQuote.volume)
                    var totalVolumePrice = cVolumePrice + pVolumePrice
                    var totalVolume = parseInt(row.volume) + parseInt(prevQuote.volume)
                    var vwapPrice = (totalVolumePrice / totalVolume).toFixed(2)
                    var vwap = vwapPrice ? vwapPrice : 0;
                    var correctedVwap = vwap;
                    correctedVwap = correctedVwap;
                    return correctedVwap;
                }
            },

            {
                "data": '',
                render: function (data, type, row, meta) {
                    var pTypicalPrice = (parseFloat(prevQuote.high) + parseFloat(prevQuote.low) + parseFloat(prevQuote.close)) / 3
                    var cTypicalPrice = (parseFloat(row.high) + parseFloat(row.low) + parseFloat(row.close)) / 3
                    var cVolumePrice = cTypicalPrice * parseFloat(row.volume)
                    var pVolumePrice = pTypicalPrice * parseFloat(prevQuote.volume)
                    var totalVolumePrice = cVolumePrice + pVolumePrice
                    var totalVolume = parseInt(row.volume) + parseInt(prevQuote.volume)
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
                    if (correctedVwap <= row.close) {
                        vvapTextOne += '<span class="badge bg-primary">' + vwap + '</span>'
                        vvapTextTwo += '<span class="badge bg-success">BUY</span>'
                        vvapTextThree += '<span class="badge bg-success">' + upTriangle + '</span>'
                        vvapTextFour += '<span class="badge bg-success">' + (parseFloat(row.close) - parseFloat(vwap)).toFixed(2) + '</span>'
                    } else {
                        vvapTextOne += '<span class="badge bg-primary">' + vwap + '</span>'
                        vvapTextTwo += '<span class="badge bg-danger">SELL</span>'
                        vvapTextThree += '<span class="badge bg-danger">' + bottomTriangle + '</span>'
                        vvapTextFour += '<span class="badge bg-danger">' + (parseFloat(row.close) - parseFloat(vwap)).toFixed(2) + '</span>'
                    }
                    return vvapTextOne + " " + vvapTextTwo + " " + vvapTextThree + " " + vvapTextFour
                }
            },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    var buyResult = Math.abs(row.open - row.low);
                    return buyResult.toFixed(2);
                }
            },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    var sellResult = Math.abs(row.open - row.high);
                    return sellResult.toFixed(2);
                }
            },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    var pTypicalPrice = (parseFloat(prevQuote.high) + parseFloat(prevQuote.low) + parseFloat(prevQuote.close)) / 3
                    var cTypicalPrice = (parseFloat(row.high) + parseFloat(row.low) + parseFloat(row.close)) / 3
                    var cVolumePrice = cTypicalPrice * parseFloat(row.volume)
                    var pVolumePrice = pTypicalPrice * parseFloat(prevQuote.volume)
                    var totalVolumePrice = cVolumePrice + pVolumePrice
                    var totalVolume = parseInt(row.volume) + parseInt(prevQuote.volume)
                    var vwapPrice = (totalVolumePrice / totalVolume).toFixed(2)
                    var vwap = vwapPrice ? vwapPrice : 0;
                    var correctedVwap = vwap;
                    if (id == "BANKNIFTY") {
                        correctedVwap = correctedVwap;
                    }
                    var booleanValue = false;
                    if (correctedVwap <= row.close) {
                        booleanValue = true;
                    } else {
                        booleanValue = false;
                    }
                    var buyResult = Math.abs(row.open - row.low);
                    var sellResult = Math.abs(row.open - row.high);
                    var openPrice = row.open;
                    var highPrice = row.high;
                    var lowPrice = row.low;
                    var lastPrice = row.close;
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
                    if (id == "BANKNIFTY") {
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
            },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    let resp = {};
                    if (id == "BANKNIFTY") {
                        resp = showTableAiBankNiftyPrediction(row, prevQuote, lotSize)
                    } else {
                        resp = showTableAiNiftyPrediction(row, prevQuote, lotSize)
                    }
                    return resp['PLUS'] + '<br/>' + resp['MINUS'];
                }
            },
        ],
        "fnInitComplete": function (oSettings, json) {
        }
    });
}

function showTableAiNiftyPrediction(quote, prevQuote, lotSize) {
    let data = {}
    quote.volume = parseInt(quote.volume)
    var pTypicalPrice = (parseFloat(prevQuote.high) + parseFloat(prevQuote.low) + parseFloat(prevQuote.close)) / 3
    var cTypicalPrice = (parseFloat(quote.high) + parseFloat(quote.low) + parseFloat(quote.close)) / 3
    var cVolumePrice = cTypicalPrice * parseFloat(quote.volume)
    var pVolumePrice = pTypicalPrice * parseFloat(prevQuote.volume)
    var totalVolumePrice = cVolumePrice + pVolumePrice
    var totalVolume = parseInt(quote.volume) + parseInt(prevQuote.volume)
    var vwapPrice = (totalVolumePrice / totalVolume).toFixed(2)
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

    if (changeinOpenInterest > 0) {
        openInterestMarkup = '<span class=" badge bg-success">' + openInterest + '</span>'
        openInterestDirectionMarkup = '<span class=" badge bg-success" >' + upTriangle + '</span>'
        openInterestChangeMarkup = '<span class=" badge bg-success" >' + changeinOpenInterest + '</span>'
        oi = "+";
    } else {
        openInterestMarkup = '<span class=" badge bg-danger">' + openInterest + '</span>'
        openInterestDirectionMarkup = '<span class=" badge bg-danger">' + bottomTriangle + '</span>'
        openInterestChangeMarkup = '<span class=" badge bg-danger">' + changeinOpenInterest + '</span>'
        oi = "-";
    }

    if (pchangeinOpenInterest > 0) {
        openInterestChangePercMarkup = '<span class=" badge bg-success">' + pchangeinOpenInterest + '%</span>'
    } else {
        openInterestChangePercMarkup = '<span class=" badge bg-danger">' + pchangeinOpenInterest + '%</span>'
    }

    if (changeEvo1 > 10 && booleanValue == true) { // percentage bull side
        price = "+";
    } else if (changeEvo1 <= -10 && booleanValue == false) { // bear side,long unwinding
        price = "-";
    } else if (changeEvo1 >= 10 && booleanValue == false) { // bear side, short
        price = "-";
    } else {
        price = "+-";// no clear trend
    }

    if (changeEvo < 0 && pChangeEvo < -2) {
        shortCoveringOrLongUnwinding = true;
    } else {
        shortCoveringOrLongUnwinding = false;
    }

    var remark = "No Clear Trend, Bulls are still waiting";

    var dogImgContainer = '<span class="badge bg-light">' + dogImage + '</span>'
    var bullImageImgContainer = '<span class="badge bg-light">' + bullImage + '</span>'
    var bearImageImgContainer = '<span class="badge bg-light">' + bearImage + '</span>'
    var hulkImageImgContainer = '<span class="badge bg-light">' + hulkImage + '</span>'
    var captainImgContainer = '<span class="badge bg-light">' + captain + '</span>'
    var lokiImgContainer = '<span class="badge bg-light">' + loki + '</span>'
    var ironManImgContainer = '<span class="badge bg-light">' + ironMan + '</span>'
    var thorImgContainer = '<span class="badge bg-light">' + thor + '</span>'
    var hulNewImgContainer = '<span class="badge bg-light">' + hulkImageNew + '</span>'
    var doctorStrangeImgContainer = '<span class="badge bg-light">' + doctor_strange + '</span>'
    remark += dogImgContainer
    var display = "+";

    var RemarkType = ""

    if (price == "+" && oi == "+") {
        remark = '<span class="badge bg-success">Long</span>'
        display = "+";
        RemarkType = "LONG"
    } else if (price == "-" && oi == "+") {
        remark = '<span class="badge bg-danger">Short</span>'
        display = "-";
        RemarkType = "SHORT"
    } else if (price == "+" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = '<span class="badge bg-success">Short Covering</span>'
        display = "+";
        RemarkType = "SHOT_COVERING"
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = dogImgContainer + '<span class="badge bg-danger">Long Unwinding</span>'
        display = "-";
        RemarkType = "LONG_UNWINDING"
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding == false) {
        remark = dogImgContainer + lokiImgContainer + '<span class="badge bg-danger">Bears Coming,Sell On Rise</span>'
        display = "-";
        RemarkType = "BEARS_COMING_SELL_ON_RISE"
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo >= 10) {
        remark = '<span class="badge bg-danger">Gambling! Buy,News & Events</span>'
        display = "+";
        RemarkType = "GAMBLING_BUY_NEWS_AND_EVENTS"
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo < 10) {
        remark = '<span class="badge bg-danger">Caution! Writers Eroding Premium</span>'
        display = "+";
        RemarkType = "CAUTION_WRITES_ERODING_PREMIUM"
    } else {
        remark = captainImgContainer + '<span class="badge bg-danger">Defence,Buy On Decline</span>'
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
        marketTrendPlus = '<span class=" badge bg-success">Hulk Arrived (+)</span>'
        otherTrendRemarks += '<div class="row">'
        otherTrendRemarks += '<div class="col-md-12">'
        otherTrendRemarks += "Hulk Arrived (+)"
        otherTrendRemarks += '</div>'
        otherTrendRemarks += '</div>'
        if (pChangeEvo >= 4 && price != "+-") {
            imageBullPlus = thorImgContainer + hulNewImgContainer + bullImageImgContainer
            otherRemarkType = "HULK_THOR_BULL_ARRIVED"
        } else if (pChangeEvo >= 4 && price == "+-") {
            marketTrendPlus = '<span class=" badge bg-warning">Doctor Strange Arrived (+)</span>'
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
        marketTrendPlus = '<span class="  badge bg-danger">Strongly Not Recommended to buy Calls</span>'
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
        marketTrendMinus = '<span class=" badge bg-danger">Chitauri Army Arrived (-)</span>'
        imageBearMinus = bearImageImgContainer
    } else {
        marketTrendMinus = '<span class="  badge bg-danger">Strongly Not Recommended to Short Calls</span>'
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

function showTableAiBankNiftyPrediction(quote, prevQuote, lotSize) {

    let data = {}

    quote.volume = parseInt(quote.volume)
    var pTypicalPrice = (parseFloat(prevQuote.high) + parseFloat(prevQuote.low) + parseFloat(prevQuote.close)) / 3
    var cTypicalPrice = (parseFloat(quote.high) + parseFloat(quote.low) + parseFloat(quote.close)) / 3
    var cVolumePrice = cTypicalPrice * parseFloat(quote.volume)
    var pVolumePrice = pTypicalPrice * parseFloat(prevQuote.volume)
    var totalVolumePrice = cVolumePrice + pVolumePrice
    var totalVolume = parseInt(quote.volume) + parseInt(prevQuote.volume)
    var vwapPrice = (totalVolumePrice / totalVolume).toFixed(2)


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

    if (changeinOpenInterest > 0) {
        openInterestMarkup = '<span class=" badge bg-success">' + openInterest + '</span>'
        openInterestDirectionMarkup = '<span class=" badge bg-success" >' + upTriangle + '</span>'
        openInterestChangeMarkup = '<span class=" badge bg-success" >' + changeinOpenInterest + '</span>'
        oi = "+";
    } else {
        openInterestMarkup = '<span class=" badge bg-danger">' + openInterest + '</span>'
        openInterestDirectionMarkup = '<span class=" badge bg-danger">' + bottomTriangle + '</span>'
        openInterestChangeMarkup = '<span class=" badge bg-danger">' + changeinOpenInterest + '</span>'
        oi = "-";
    }

    if (pchangeinOpenInterest > 0) {
        openInterestChangePercMarkup = '<span class=" badge bg-success">' + pchangeinOpenInterest + '%</span>'
    } else {
        openInterestChangePercMarkup = '<span class=" badge bg-danger">' + pchangeinOpenInterest + '%</span>'
    }

    if (changeEvo1 > 10 && booleanValue == true) { // percentage bull side
        price = "+";
    } else if (changeEvo1 <= -10 && booleanValue == false) { // bear side,long unwinding
        price = "-";
    } else if (changeEvo1 >= 10 && booleanValue == false) { // bear side, short
        price = "-";
    } else {
        price = "+-";// no clear trend
    }

    if (changeEvo < 0 && pChangeEvo < -2) {
        shortCoveringOrLongUnwinding = true;
    } else {
        shortCoveringOrLongUnwinding = false;
    }

    var remark = "No Clear Trend, Bulls are still waiting";


    var dogImgContainer = '<span class="badge bg-light">' + dogImage + '</span>'
    var bullImageImgContainer = '<span class="badge bg-light">' + bullImage + '</span>'
    var bearImageImgContainer = '<span class="badge bg-light">' + bearImage + '</span>'
    var hulkImageImgContainer = '<span class="badge bg-light">' + hulkImage + '</span>'
    var captainImgContainer = '<span class="badge bg-light">' + captain + '</span>'
    var lokiImgContainer = '<span class="badge bg-light">' + loki + '</span>'
    var ironManImgContainer = '<span class="badge bg-light">' + ironMan + '</span>'
    var thorImgContainer = '<span class="badge bg-light">' + thor + '</span>'
    var hulNewImgContainer = '<span class="badge bg-light">' + hulkImageNew + '</span>'
    var doctorStrangeImgContainer = '<span class="badge bg-light">' + doctor_strange + '</span>'
    remark += dogImgContainer
    var display = "+";

    var aiStatus = ""

    if (price == "+" && oi == "+") {
        remark = '<span class="badge bg-success">Long</span>'
        display = "+";
        aiStatus = "LONG"
    } else if (price == "-" && oi == "+") {
        remark = '<span class="badge bg-danger">Short</span>'
        display = "-";
        aiStatus = "SHORT"
    } else if (price == "+" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = '<span class="badge bg-success">Short Covering</span>'
        display = "+";
        aiStatus = "SHOT_COVERING"
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = dogImgContainer + '<span class="badge bg-danger">Long Unwinding</span>'
        display = "-";
        aiStatus = "LONG_UNWINDING"
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding == false) {
        remark = dogImgContainer + lokiImgContainer + '<span class="badge bg-danger">Bears Coming,Sell On Rise</span>'
        display = "-";
        aiStatus = "BEARS_COMING_SELL_ON_RISE"
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo >= 10) {
        remark = '<span class="badge bg-danger">Gambling! Buy,News & Events</span>'
        display = "+";
        aiStatus = "GAMBLING_BUY_NEWS_AND_EVENTS"
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo < 10) {
        remark = '<span class="badge bg-danger">Caution! Writers Eroding Premium</span>'
        display = "+";
        aiStatus = "CAUTION_WRITES_ERODING_PREMIUM"
    } else {
        remark = captainImgContainer + '<span class="badge bg-danger">Defence,Buy On Decline</span>'
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
        marketTrendPlus = '<span class=" badge bg-success">Hulk Arrived (+)</span>'
        otherTrendRemarks += '<div class="row">'
        otherTrendRemarks += '<div class="col-md-12">'
        otherTrendRemarks += "Hulk Arrived (+)"
        otherTrendRemarks += '</div>'
        otherTrendRemarks += '</div>'
        if (pChangeEvo >= 4 && price != "+-") {
            imageBullPlus = thorImgContainer + hulNewImgContainer + bullImageImgContainer
            otherRemarkType = "HULK_THOR_BULL_ARRIVED"
        } else if (pChangeEvo >= 4 && price == "+-") {
            marketTrendPlus = '<span class=" badge bg-warning">Doctor Strange Arrived (+)</span>'
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
        marketTrendPlus = '<span class="  badge bg-danger">Strongly Not Recommended to buy Calls</span>'
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
        marketTrendMinus = '<span class=" badge bg-danger">Chitauri Army Arrived (-)</span>'
        imageBearMinus = bearImageImgContainer
    } else {
        marketTrendMinus = '<span class="  badge bg-danger">Strongly Not Recommended to Short Calls</span>'
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