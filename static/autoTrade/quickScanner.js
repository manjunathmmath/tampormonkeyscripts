jQ(document).on("click", "#show-quick-scanner", function (e) {
    e.preventDefault()
    showQuickScanner();
})
let bsoData = []
let asoData = []
var quickBsoScannerTable = null;
var quickAsoScannerTable = null;
let quickTimerInstance = null;
async function showQuickScanner() {
    jQ(".marketwatch-pagination a.item")[1].click();
    await callSleepForAWhile(1000);
    quickBsoScannerTable = null;
    quickAsoScannerTable = null;

    let html = ''

    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row">'


    html += '<div class="col-md-6">'
    html += '<table  class="" id="quick-scanner-bso-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>INSTRUMENT</th>'
    html += '<th>TREND</th>'
    html += '<th>OHL</th>'
    html += '<th>MOVED</th>'
    html += '<th>ACTION</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'
    html += '</div>'


    html += '<div class="col-md-6">'
    html += '<table  class="" id="quick-scanner-aso-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>INSTRUMENT</th>'
    html += '<th>TREND</th>'
    html += '<th>OHL</th>'
    html += '<th>MOVED</th>'
    html += '<th>ACTION</th>'
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
    title += 'Quick Scanner'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '<span style="margin-left:.5rem;" id="quick-refresh-timer-one">00:00</span>'
    title += '</div>'
    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span id="quick-last-refresh-time">Last @ 00:00:00</span>'
    title += '</div>'
    title += '</div>'


    showPopUpWindow('quick-scanner', html, "Quick Scanner", 950, 550);
    var divId = "popup-custom-style-quick-scanner";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);

    jQ("." + divId).on("close.popupwindow", function () {
        if (quickTimerInstance) {
            clearInterval(quickTimerInstance)
        }
    });
    clearInterval(quickTimerInstance)
    generateQuickStockList();
    startQuickRefresh();
}


function startQuickRefresh() {
    var display = document.querySelector('#quick-refresh-timer-one');
    startQuickTimer(display);
};

let algoRunning = false;
function startQuickTimer(display) {
    quickTimerInstance = setInterval(function () {
        var d = new Date();
        var s = d.getSeconds();
        var m = d.getMinutes();
        var h = d.getHours();
        display.textContent = ("0" + h).substr(-2) + ":" + ("0" + m).substr(-2) + ":" + ("0" + s).substr(-2);
        if ((s % 5) == 0) {
            generateQuickStockList();
        }
        if (!algoRunning) {
            algoNineFifteenTrade()
        }

    }, 1000);
}

async function algoNineFifteenTrade() {

    let currentTime = moment().format("HH:mm:ss")
    let checkTime = moment(PREVIOUS_DAY_DATE + " 09:19:56", 'YYYY-MM-DD HH:mm:ss').format("HH:mm:ss")
    let endTime = moment(PREVIOUS_DAY_DATE + " 09:19:59", 'YYYY-MM-DD HH:mm:ss').format("HH:mm:ss")

    console.log("Algo starts executing orders @ " + checkTime + "AM.  current time is :" + currentTime);

    if (!(currentTime >= checkTime)) {
        console.log("----------------[ALGO CHECKING FOR " + checkTime + " MINUTES TARDE CONDITION]-----------");
        console.log("current Time :" + currentTime);
        console.log("------------------------------------------------------------------------------------");
        return
    }

    if (currentTime >= endTime) {
        console.log("----------------------------[9:15 Strategy time closed]-----------------------------------------");
        console.log("current Time :" + currentTime);
        console.log("------------------------------------------------------------------------------------");
        return
    }

    algoRunning = true;

    let instrumentsWrapper = jQ(".draggable-wrapper");
    let instruments = instrumentsWrapper.find(".items .item-wrapper");
    let openDetails = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL"));

    bsoData = []
    asoData = []

    jQ(instruments).each(function (iindex, iitem) {
        let name = jQ(this).find(".symbol").find(".name").html();
        let price = jQ(this).find(".price").find(".last-price").html();
        if (name == "M&amp;M") {
            name = "M&M"
        }

        if (name == "M&amp;MFIN") {
            name = "M&MFIN"
        }

        let openDetail = openDetails[name]
        let strikeData = getStrikeDetails(openDetail, name);
        let currentPrice = parseFloat(price.trim()).toFixed(2);

        let asoPrice = 0;
        let bsoPrice = 0;
        asoPrice = parseFloat(strikeData['ustrikeOne']);
        bsoPrice = parseFloat(strikeData['bstrikeOne']);

        let trend = "NA"
        let trends = []
        if (currentPrice >= parseFloat(asoPrice)) {
            trend = "ASO"
            trends.push(trend);
        }

        if (currentPrice <= parseFloat(bsoPrice)) {
            trend = "BSO"
            trends.push(trend);
        }

        let ASO_MOVED = parseFloat(currentPrice - asoPrice).toFixed()
        let BSO_MOVED = parseFloat(bsoPrice - currentPrice).toFixed()

        let obj = {}
        obj['TRADINGSYMBOL'] = name
        obj['TREND'] = trends
        obj['OHL'] = ''
        obj['LTP'] = currentPrice
        obj['ASO_MOVED'] = ASO_MOVED
        obj['BSO_MOVED'] = BSO_MOVED
        obj['ustrikeOne'] = asoPrice
        obj['bstrikeOne'] = bsoPrice

        if (jQ.inArray("BSO", trends) != -1) {
            bsoData.push(obj)
        }

        if (jQ.inArray("ASO", trends) != -1) {
            asoData.push(obj)
        }
    });

    for (let i = 0; i < asoData.length; i++) {
        let obj = asoData[i];
        await triggerOrder(obj, "BUY")
    }

    for (let i = 0; i < bsoData.length; i++) {
        let obj = bsoData[i];
        await triggerOrder(obj, "SELL")
    }
    algoRunning = false;
}


async function triggerOrder(obj, transaction_type) {
    let name = obj.TRADINGSYMBOL;
    let trigger_price = 0;
    let price = 0;
    let currentPrice = parseFloat(obj['LTP']);
    if (transaction_type == "SELL") {
        trigger_price = currentPrice
        price = currentPrice - 0.50
    } else {
        trigger_price = currentPrice
        price = currentPrice + 0.50
    }

    let quantity = (MARGIN / (parseFloat(currentPrice) / 5)).toFixed(0)
    let params = { "exchange": "NSE", "tradingsymbol": name, "transaction_type": transaction_type, "product": "MIS", "order_type": ORDER_TYPE, "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": price, "trigger_price": trigger_price, "disclosed_quantity": 0, "tags": [] }
    console.log(params)
    try {
        let res = await callPlaceOrder(params, true)
    } catch (err) {
        console.log("Error while placing order for stock : " + name)
        console.log(err)
    }
}

function generateQuickStockList() {
    let instrumentsWrapper = jQ(".draggable-wrapper");
    let instruments = instrumentsWrapper.find(".items .item-wrapper");
    let openDetails = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL"));

    bsoData = []
    asoData = []

    jQ(instruments).each(function (iindex, iitem) {
        let name = jQ(this).find(".symbol").find(".name").html();
        let price = jQ(this).find(".price").find(".last-price").html();
        if (name == "M&amp;M") {
            name = "M&M"
        }

        if (name == "M&amp;MFIN") {
            name = "M&MFIN"
        }

        let openDetail = openDetails[name]

        let strikeData = getStrikeDetails(openDetail, name);
        let currentPrice = parseFloat(price.trim()).toFixed(2);

        let asoPrice = 0;
        let bsoPrice = 0;
        asoPrice = parseFloat(strikeData['ustrikeOne']);
        bsoPrice = parseFloat(strikeData['bstrikeOne']);

        let trend = "NA"
        let trends = []
        if (currentPrice >= parseFloat(asoPrice)) {
            trend = "ASO"
            trends.push(trend);
        }

        if (currentPrice <= parseFloat(bsoPrice)) {
            trend = "BSO"
            trends.push(trend);
        }

        if (currentPrice >= parseFloat(strikeData['ustrikeTwo'])) {
            trend = "AST"
            trends.push(trend);
        }

        if (currentPrice <= parseFloat(strikeData['bstrikeTwo'])) {
            trend = "BST"
            trends.push(trend);
        }

        let ASO_MOVED = parseFloat(currentPrice - asoPrice).toFixed()
        let BSO_MOVED = parseFloat(bsoPrice - currentPrice).toFixed()

        let obj = {}
        obj['TRADINGSYMBOL'] = name
        obj['TREND'] = trends
        obj['OHL'] = ''
        obj['LTP'] = currentPrice
        obj['ASO_MOVED'] = ASO_MOVED
        obj['BSO_MOVED'] = BSO_MOVED
        obj['ustrikeOne'] = asoPrice
        obj['bstrikeOne'] = bsoPrice

        if (jQ.inArray("BSO", trends) != -1) {
            bsoData.push(obj)
        }

        if (jQ.inArray("ASO", trends) != -1) {
            asoData.push(obj)
        }
    });
    if (!quickBsoScannerTable) {
        generateBsoScannerDataTable(bsoData)
    } else {
        quickBsoScannerTable.clear().draw();
        quickBsoScannerTable.rows.add(bsoData);
        quickBsoScannerTable.columns.adjust().draw();
    }

    if (!quickAsoScannerTable) {
        generateAsoScannerDataTable(asoData)
    } else {
        quickAsoScannerTable.clear().draw();
        quickAsoScannerTable.rows.add(asoData);
        quickAsoScannerTable.columns.adjust().draw();
    }
    jQ("#quick-last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
}

function generateBsoScannerDataTable(data) {
    jQ("#quick-scanner-bso-list-table").show()
    quickBsoScannerTable = jQ('#quick-scanner-bso-list-table').DataTable({
        "processing": true,
        "order": [[3, "asc"]],
        "pageLength": 50,
        "bPaginate": false,
        "data": data,
        "bDestroy": true,
        "scrollX": true,
        "scrollY": "500px",
        "columnDefs": [
            {
                "targets": [2],
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
                "data": "TRADINGSYMBOL",
                render: function (data, type, row, meta) {
                    let html = ''
                    html += '<a target="_blank" href="https://kite.zerodha.com/chart/ext/tvc/' + 'NSE' + '/' + data + '/' + instrumentTokens[data] + '"> '

                    let trades = JSON.parse(localStorage.getItem("TRADES"));
                    if (jQ.inArray(data, trades) !== -1) {
                        html += '<span class="badge bg-warning" title="Already traded">' + data + '</span>'
                    } else {
                        html += data;
                    }
                    html += '</a>'
                    if (bsoOpenBurst[data]) {
                        html += '<span class="badge bg-success" title="9.15 candle price is below BSO strike">T</span>'
                    }
                    return html;
                }
            },
            {
                "data": "TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data.length > 0) {
                        jQ.each(data, function (index, item) {
                            if (item == "ASO") {
                                html += '<span class="badge bg-info above-strike-one strike-info">ASO</span>'
                            }

                            if (item == "BSO") {
                                html += '<span class="badge bg-info below-strike-one strike-info">BSO</span>'
                            }

                            if (item == "AST") {
                                html += '<span class="badge bg-info above-strike-two strike-info">AST</span>'
                            }

                            if (item == "BST") {
                                html += '<span class="badge bg-info above-strike-one strike-info">BST</span>'
                            }
                        });
                    }
                    return html
                }
            },
            {
                "data": "OHL_TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data) {
                        if (data[2].includes("Sell")) {
                            html += '<span class="badge bg-danger">' + data[2] + '</span>'
                        } else {
                            html += '<span class="badge bg-success">' + data[2] + '</span>'
                        }
                        html += '<span class="badge bg-info">' + ' [B:' + parseFloat(data[0]).toFixed(2) + ' S:' + parseFloat(data[1]).toFixed(2) + ']' + '</span>'
                    }

                    return html
                }
            },
            {
                "data": 'BSO_MOVED',
                render: function (data, type, row, meta) {
                    return data;

                }
            },
            {
                "data": "ACTIONS",
                render: function (data, type, row, meta) {
                    var html = ""
                    let index = 1;
                    html += '<div>'
                    if (!row['TREND']) {
                        row['TREND'] = []
                    }
                    html += '<span data-price="' + row['LTP'] + '" data-index="' + index + '" data-trend="' + row['TREND'].join(",") + '" data-name="' + row['TRADINGSYMBOL'] + '" class="badge bg-info show-chart">'
                    html += 'Chart'
                    html += '</span>'

                    html += '<span   data-name="' + row['TRADINGSYMBOL'] + '"  class="badge bg-primary  ms-1 show-predictor" style="margin-right:.5rem;">';
                    html += "Predict"
                    html += '</span>'

                    html += '</div>'
                    return html
                }
            },
        ],
        "fnInitComplete": function (oSettings, json) {
            jQ("#quick-scanner-bso-list-table_wrapper .dt-buttons").append('<button id="analyze-bso-open-burst" class="dt-button bg-info" type="button"><span>ANALYZE</span></button>')
        }
    });
}


jQ(document).on("click", "#analyze-bso-open-burst", function () {
    analyzeOpenBurst("BSO")
})

jQ(document).on("click", "#analyze-aso-open-burst", function () {
    analyzeOpenBurst("ASO")
})


let bsoOpenBurst = {}
let asoOpenBurst = {}
async function analyzeOpenBurst(type) {
    let stocks = [];

    if (type == "BSO") {
        stocks = bsoData
    } else {
        stocks = asoData
    }

    for (let i = 0; i < stocks.length; i++) {
        let data = await getHistoricalDataUsingPromise(instrumentTokens[stocks[i]['TRADINGSYMBOL']], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
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
        if (type == "BSO") {
            if (quote[0]['close'] < parseFloat(stocks[i]['bstrikeOne'])) {
                bsoOpenBurst[stocks[i]['TRADINGSYMBOL']] = true
            } else {
                bsoOpenBurst[stocks[i]['TRADINGSYMBOL']] = false
            }
        }

        if (type == "ASO") {
            if (quote[0]['close'] > parseFloat(stocks[i]['ustrikeOne'])) {
                asoOpenBurst[stocks[i]['TRADINGSYMBOL']] = true
            } else {
                asoOpenBurst[stocks[i]['TRADINGSYMBOL']] = false
            }
        }
    }

}
function generateAsoScannerDataTable(data) {
    jQ("#quick-scanner-aso-list-table").show()
    quickAsoScannerTable = jQ('#quick-scanner-aso-list-table').DataTable({
        "processing": true,
        "order": [[3, "asc"]],
        "pageLength": 50,
        "bPaginate": false,
        "data": data,
        "bDestroy": true,
        "scrollX": true,
        "scrollY": "500px",
        "columnDefs": [
            {
                "targets": [2],
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
                "data": "TRADINGSYMBOL",
                render: function (data, type, row, meta) {
                    let html = ''
                    html += '<a target="_blank" href="https://kite.zerodha.com/chart/ext/tvc/' + 'NSE' + '/' + data + '/' + instrumentTokens[data] + '"> '

                    let trades = JSON.parse(localStorage.getItem("TRADES"));
                    if (jQ.inArray(data, trades) !== -1) {
                        html += '<span class="badge bg-warning" title="Already traded">' + data + '</span>'
                    } else {
                        html += data;
                    }
                    html += '</a>'

                    if (asoOpenBurst[data]) {
                        html += '<span class="badge bg-success" title="9.15 candle price is above ASO strike">T</span>'
                    }
                    return html;
                }
            },
            {
                "data": "TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data.length > 0) {
                        jQ.each(data, function (index, item) {
                            if (item == "ASO") {
                                html += '<span class="badge bg-info above-strike-one strike-info">ASO</span>'
                            }

                            if (item == "BSO") {
                                html += '<span class="badge bg-info below-strike-one strike-info">BSO</span>'
                            }

                            if (item == "AST") {
                                html += '<span class="badge bg-info above-strike-two strike-info">AST</span>'
                            }

                            if (item == "BST") {
                                html += '<span class="badge bg-info above-strike-one strike-info">BST</span>'
                            }
                        });
                    }
                    return html
                }
            },
            {
                "data": "OHL_TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data) {
                        if (data[2].includes("Sell")) {
                            html += '<span class="badge bg-danger">' + data[2] + '</span>'
                        } else {
                            html += '<span class="badge bg-success">' + data[2] + '</span>'
                        }
                        html += '<span class="badge bg-info">' + ' [B:' + parseFloat(data[0]).toFixed(2) + ' S:' + parseFloat(data[1]).toFixed(2) + ']' + '</span>'
                    }

                    return html
                }
            },
            {
                "data": 'ASO_MOVED',
                render: function (data, type, row, meta) {
                    return data;

                }
            },
            {
                "data": "ACTIONS",
                render: function (data, type, row, meta) {
                    var html = ""
                    let index = 1;
                    html += '<div>'
                    if (!row['TREND']) {
                        row['TREND'] = []
                    }
                    html += '<span data-price="' + row['LTP'] + '" data-index="' + index + '" data-trend="' + row['TREND'].join(",") + '" data-name="' + row['TRADINGSYMBOL'] + '" class="badge bg-info show-chart">'
                    html += 'Chart'
                    html += '</span>'


                    html += '<span   data-name="' + row['TRADINGSYMBOL'] + '"  class="badge bg-primary  ms-1 show-predictor" style="margin-right:.5rem;">';
                    html += "Predict"
                    html += '</span>'

                    html += '</div>'


                    return html
                }
            },
        ],
        "fnInitComplete": function (oSettings, json) {
            jQ("#quick-scanner-aso-list-table_wrapper .dt-buttons").append('<button id="analyze-aso-open-burst" class="dt-button bg-info" type="button"><span>ANALYZE</span></button>')

        }
    });
}
