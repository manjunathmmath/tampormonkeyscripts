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

    html += '<div class="col-md-12 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">All</h6>'
    html += '<div id="advance-decline-chart">'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-6 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">Nifty</h6>'
    html += '<div id="advance-decline-nifty-chart">'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-6 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">Bank</h6>'
    html += '<div id="advance-decline-bank-chart">'
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
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'
    html += '</div>'
    html += '</div>'

    let title = ''
    title += '<div class="row">'
    title += '<div class="col-md-2">'
    title += 'Groot Trade Bot'
    title += '</div>'
    title += '</div>'

    showPopUpWindow('groot-trade-bot', html, "Groot [Trade Bot]", 950, 550);
    let divId = "popup-custom-style-groot-trade-bot";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    showStockList()
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
        console.log(asoPrice, bsoPrice)

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
                "showLabels": 1
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
                "showLabels": 1
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
                "showLabels": 1
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

function showStockList() {
    let instru = [];
    let scripts = []
    let checkInstr = []
    let scriptData = generateTrends()
    jQ.each(instrumentTokens, function (index, item) {
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
        obj['CLOSE_9_15'] = '';
        scripts.push(obj)
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
            'copy', 'csv', 'excel', 'pdf', 'print'
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
        ],
        "fnInitComplete": function (oSettings, json) {
            showExtraButtons()
        },
        "fnRowCallback": function (nRow, aData, iDisplayIndex, iDisplayIndexFull) {
        }
    });
}

function showExtraButtons() {
    jQ("#stock-list-table_wrapper .dt-buttons").append('<button id="nine-fifteen-scan" class="dt-button bg-info" type="button"><span>9.15 SCAN</span></button>')
    jQ("#stock-list-table_wrapper .dt-buttons").append('<span style="margin-right: .2rem;" id="processing-trend"></span>')

}

jQ(document).on('click', '#nine-fifteen-scan', function (e) {
    scanNineFifteenCandle()

});

async function scanNineFifteenCandle() {
    let scriptData = generateTrends()
    let stockData = stockTable.rows().data().toArray();
    for (let i = 0; i < stockData.length; i++) {
        let row = stockData[i];
        console.log(row)
        let name = row['TRADINGSYMBOL'];
        jQ("#stock-list-table_wrapper  #processing-trend").html("Processing.... " + i + "/" + stockData.length);
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
        map['date'] = moment(item[0]).format("HH:mm:ss")
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
        map['date'] = moment(item[0]).format("HH:mm:ss")
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
    html += '<div class="col-md-6">'
    html += '<div id="' + chartId + '"class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '</div>'
    html += '</div>'
    html += '<div class="col-md-6" style="max-height:400px;height:400px;overflow:auto">'
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
    html += '<div class="row" >'
    html += '<div class="col-md-12">'
    html += '<table  class="table display nowrap" id="predictor-stock-list-table" style="width: 100%;">'

    html += '<thead>'

    html += '<tr>'
    html += '<th>PCR</th>'
    html += '<th id="pcr-prediction">PCR</th>'
    html += '</tr>'

    html += '<tr>'
    html += '<th>PREDICTION</th>'
    html += '<th id="prediction-prediction">PREDICTION</th>'
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
    html += '<th id="STRIKE_LOWER_ONE_CE-prediction" class="number-align" >CE</th>'
    html += '<th id="STRIKE_LOWER_ONE-prediction" class="text-align">S</th>'
    html += '<th id="STRIKE_LOWER_ONE_PE-prediction" class="number-align">PE</th> '

    html += '<th id="STRIKE_LOWER_TWO_CE-prediction" class="number-align">CE</th>'
    html += '<th id="STRIKE_LOWER_TWO-prediction" class="text-align">S</th>'
    html += '<th id="STRIKE_LOWER_TWO_PE-prediction" class="number-align">PE</th> '

    html += '<th id="STRIKE_ATM_CE-prediction" class="number-align">CE</th>'
    html += '<th id="STRIKE_ATM-prediction" class="text-align">S</th>'
    html += '<th id="STRIKE_ATM_PE-prediction" class="number-align">PE</th> '

    html += '<th id="STRIKE_UPPER_ONE_CE-prediction" class="number-align">CE</th>'
    html += '<th id="STRIKE_UPPER_ONE-prediction" class="text-align">S</th>'
    html += '<th id="STRIKE_UPPER_ONE_PE-prediction" class="number-align">PE</th> '

    html += '<th id="STRIKE_UPPER_TWO_CE-prediction" class="number-align">CE</th>'
    html += '<th id="STRIKE_UPPER_TWO-prediction" class="text-align">S</th>'
    html += '<th id="STRIKE_UPPER_TWO_PE-prediction" class="number-align">PE</th> '
    html += '<tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'


    html += '</div>'
    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row" id="oi-obv-charts">'
    html += '</div>'


    return html;
}

async function showScriptChart(quote, name, rowId, prevQuote) {

    let scriptData = generateTrend(name)
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let chartId = 'chart-container-' + tempName.replaceAll(" ", "-").replaceAll("&", "-");

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
                "showLabels": 0
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