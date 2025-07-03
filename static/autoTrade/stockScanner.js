jQ(document).on("click", "#show-stock-scanner", function () {
    showStockScanner();
})

async function showStockScanner() {
    let html = ''

    html += '<div class="row">'

    html += '<div class="col-md-5">'
    html += '<div class="card" >'
    html += '<div class="card-header">'
    html += '<span class="stock-filter-instruments filter-type" data-index-name="ALL">ALL </span>'
    html += 'ASO: <span class="stock-filter-instruments" data-trend-type="ASO" data-index-name="ALL" id="stock-all-aso">0</span></span>'
    html += 'BSO: <span class="stock-filter-instruments" data-trend-type="BSO" data-index-name="ALL" id="stock-all-bso">0</span></span>'
    html += 'AST: <span class="stock-filter-instruments" data-trend-type="AST" data-index-name="ALL" id="stock-all-ast">0</span></span>'
    html += 'BST: <span class="stock-filter-instruments" data-trend-type="BST" data-index-name="ALL" id="stock-all-bst">0</span></span>'
    html += '</div>'
    html += '</div>'
    html += '</div>'


    html += '<div class="col-md-6">'
    html += '<div class="row">'
    html += '<div class="col-md-2">'
    html += '<span class="filter-type" ><input value="-1" type="text" id="price-moved" placeholder="" class="form-control form-control-sm"/></span>'
    html += '</div>'
    html += '<div class="col-md-2">'
    html += '<span class="filter-type" >HIDE:<input title="Hide Traded" type="checkbox" id="currently-traded"/></span>'
    html += '</div>'
    html += '<div class="col-md-3">'
    html += '<span class="filter-type" >MOVE:<input title="Show only movementum stocks" type="checkbox" id="movement-stocks"/></span>'
    html += '</div>'
    html += '<div class="col-md-2">'
    html += '<span>OHL:<input title="Fetch and show OHL Trend" checked type="checkbox" id="ohl-trend"/></span>'
    html += '</div>'
    html += '<div class="col-md-2">'
    html += '<select id="instrument-type" class="form-control form-control-sm">'
    html += '<option value="ALL">ALL</option>'
    html += '<option value="NIFTY" selected>NIFTY</option>'
    html += '<option value="BANK">BANK</option>'
    html += '</select>'
    html += '</div>'

    html += '</div>'
    html += '</div>'

    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'


    html += '<div class="row">'

    html += '<div class="col-md-1">'
    html += 'Sell: <span data-name="Sell" class="badge bg-danger ohl-filter" id="ohl-sell">0</span>'
    html += '</div>'

    html += '<div class="col-md-2">'
    html += 'Strong Sell(OH): <span data-name="Strong Sell(OH)" class="badge bg-danger ohl-filter" id="strong-sell-ohl">0</span>'
    html += '</div>'

    html += '<div class="col-md-2">'
    html += 'Strong Sell(Lower High): <span data-name="Strong Sell(Lower High)" class="badge bg-danger ohl-filter" id="strong-sell-lower-high">0</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += 'Buy: <span data-name="Buy" class="badge bg-success ohl-filter" id="ohl-buy">0</span>'
    html += '</div>'

    html += '<div class="col-md-2">'
    html += 'Strong Buy(Higher High): <span data-name="Strong Buy(Higher High)" class="badge bg-success ohl-filter" id="strong-buy-higher-higher">0</span>'
    html += '</div>'

    html += '<div class="col-md-2">'
    html += 'Strong Buy(OL): <span data-name="Strong Buy(OL)" class="badge bg-success ohl-filter" id="strong-buy-ol">0</span>'
    html += '</div>'

    html += '<div class="col-md-2">'
    html += '<span data-name="ALL BUY" class="ohl-filter badge bg-success" id="total-buy">0</span>'
    html += '/'
    html += '<span data-name="ALL SELL" class="ohl-filter badge bg-danger" id="total-sell">0</span>'
    html += '</div>'

    html += '</div>'

    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'

    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table  class="" id="stock-scanner-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>INSTRUMENT</th>'
    html += '<th>TREND</th>'
    html += '<th>OHL</th>'
    html += '<th>B %</th>'
    html += '<th>S %</th>'
    html += '<th>MOVED</th>'
    html += '<th>WEIGHTAGE</th>'
    html += '<th>P.CLOSE</th>'
    html += '<th>OPEN</th>'
    html += '<th>LTP</th>'
    html += '<th>CHANGE</th>'
    html += '<th>VOLUME</th>'
    html += '<th>TRADABLE</th>'

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
    title += 'Stock Scanner'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '<a  id="stock-scanner-start-auto-refresh">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '<span style="margin-left:.5rem;" id="stock-scanner-refresh-timer-one">00:00</span>'
    title += '</div>'
    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span id="stock-scanner-last-refresh-time">Last @ 00:00:00</span>'
    title += '</div>'
    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span class="profit-loss">0.00</span>'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '<span id="processing"></span>'
    title += '</div>'
    title += '</div>'


    showPopUpWindow('stock-scanner', html, "Stock Scanner",  950, 550);
    var divId = "popup-custom-style-stock-scanner";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    jQ("." + divId).on("close.popupwindow", function () {
        if (stockScannerTimerInstance) {
            clearInterval(stockScannerTimerInstance)
        }
    });
    if (jQ.isEmptyObject(instrumentsMap)) {
        return
    }
    refreshStockScannerTable();
}

let stockScannerTimerInstance = null

jQ(document).on("click", "#stock-scanner-start-auto-refresh", function () {
    var that = jQ(this);
    that.attr("disabled", true)
    refreshStockScannerTable();
    that.attr("disabled", false)

});

function refreshStockScannerTable() {
    clearInterval(stockScannerTimerInstance)
    let instrumentType = jQ("#instrument-type selected:option").val()
    if (!instrumentType) {
        instrumentType = "NIFTY"
    }
    generateStockScanner('', instrumentType);
    getStockScannerAllBullsBearsCount();

    jQ("#stock-scanner-last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
}

function stockScannerStartRefresh() {
    var display = document.querySelector('#stock-scanner-refresh-timer-one');
    stockScannerStartStTimer(display);
};

function stockScannerStartStTimer(display) {
    stockScannerTimerInstance = setInterval(function () {
        var d = new Date();
        var s = d.getSeconds();
        var m = d.getMinutes();
        var h = d.getHours();
        display.textContent = ("0" + h).substr(-2) + ":" + ("0" + m).substr(-2) + ":" + ("0" + s).substr(-2);
        if ((m % 5) == 0) {
            /*refreshStockScannerTable();*/
        }
    }, 1000);
}


jQ(document).on("click", ".stock-filter-instruments", function (e) {
    clearInterval(stockScannerTimerInstance)
    let trendType = jQ(this).attr("data-trend-type");
    let instrumentType = jQ("#instrument-type option:selected").val()
    generateStockScanner(trendType, instrumentType)
});


jQ(document).on("click", ".ohl-filter", function (e) {
    let ohlFilter = jQ(this).attr("data-name");
    let data = []
    jQ.each(scannerGlobalList, function (index, item) {
        if (ohlFilter == "ALL BUY" || ohlFilter == "ALL SELL") {
            if (ohlFilter == "ALL BUY") {
                if (item.OHL_TREND[2].includes("Buy")) {
                    data.push(item)
                }
            }

            if (ohlFilter == "ALL SELL") {
                if (item.OHL_TREND[2].includes("Sell")) {
                    data.push(item)
                }
            }
        } else {
            if (item.OHL_TREND[2] == ohlFilter) {
                data.push(item)
            }
        }
    });
    generateStockScannerDataTable(data)
});



jQ(document).on("change", "#instrument-type", function (e) {
    clearInterval(stockScannerTimerInstance)
    let instrumentType = jQ("#instrument-type option:selected").val()
    generateStockScanner('', instrumentType)
    getStockScannerAllBullsBearsCount();
});

let scannerGlobalList = [];
async function generateStockScanner(trendType, instrumentType) {
    let listType = FO_LIST;
    let WEIGHTAGE = NIFTY_50_WEIGHT;

    if (instrumentType == "NIFTY") {
        listType = NIFTY_50_LIST;
        WEIGHTAGE = NIFTY_50_WEIGHT;
    }

    if (instrumentType == "BANK") {
        listType = NIFTY_BANK_LIST;
        WEIGHTAGE = NIFTY_BANK_WEIGHT;
    }

    let data = [];
    let priceMoved = jQ("#price-moved").val();
    let checkTraded = jQ("#currently-traded").is(":checked");
    let checkMovementStock = jQ("#movement-stocks").is(":checked");
    let ohlTrend = jQ("#ohl-trend").is(":checked");
    jQ.each(instrumentsMap, function (index, item) {

        if (jQ.inArray(index, listType) != -1) {
            let obj = {}
            obj['TRADINGSYMBOL'] = index
            obj['CLOSE'] = instrumentsMap[index]['prevPrice']
            obj['PRICE'] = instrumentsMap[index]['price']
            obj['PERC'] = instrumentsMap[index]['perc']
            obj['WEIGHTAGE'] = 0;
            if (WEIGHTAGE[index]) {
                obj['WEIGHTAGE'] = WEIGHTAGE[index]
            }

            obj['TREND'] = ''
            obj['LTP'] = 0
            obj['PERC'] = 0;
            obj['VOLUME'] = 0;
            obj['IS_TRADABLE'] = 'No';
            obj['ACTIONS'] = ''
            obj['OHL_TREND'] = ''
            let currentPrice = 0;
            if (infoMap[index]) {
                obj['TREND'] = infoMap[index]['trends']
                obj['LTP'] = infoMap[index]['currentPrice']
                obj['STRIKEDATA'] = infoMap[index]['strikeData']
                obj['VIX'] = infoMap[index]['vix']
                currentPrice = infoMap[index]['currentPrice']
            }

            if (trendType) {
                if (priceMoved) {
                    priceMoved = parseInt(priceMoved)
                }
                if (priceMoved > 0) {
                    if (jQ.inArray(trendType, obj['TREND']) != -1) {

                        if (trendType == "ASO") {
                            let asoPrice = 0;
                            let aso = parseFloat(obj['STRIKEDATA']['ustrikeOne']) - parseFloat(obj['PRICE']);
                            aso = aso / 5
                            asoPrice = parseFloat(obj['STRIKEDATA']['ustrikeOne']);
                            let ASO_MOVED = parseFloat(currentPrice - asoPrice).toFixed();
                            if (ASO_MOVED <= priceMoved) {
                                data.push(obj)
                            }
                        }

                        if (trendType == "BSO") {
                            let bsoPrice = 0;
                            let bso = parseFloat(obj['PRICE']) - parseFloat(obj['STRIKEDATA']['bstrikeOne']);
                            bso = bso / 5
                            bsoPrice = parseFloat(obj['STRIKEDATA']['bstrikeOne']) + bso;
                            let BSO_MOVED = parseFloat(bsoPrice - currentPrice).toFixed();
                            if (BSO_MOVED <= priceMoved) {
                                data.push(obj)
                            }
                        }
                    }
                } else {
                    if (jQ.inArray(trendType, obj['TREND']) != -1) {
                        data.push(obj)
                    }
                }
            } else {
                data.push(obj)
            }
        }
    })

    if (checkTraded) {
        let filterData = []
        let trades = JSON.parse(localStorage.getItem("TRADES"));
        if (!trades) {
            trades = []
        }
        jQ.each(data, function (index, item) {
            if (jQ.inArray(item.TRADINGSYMBOL, trades) === -1) {
                filterData.push(item)
            }
        });
        data = filterData
    }

    if (checkMovementStock) {
        let filterData = []
        jQ.each(data, function (index, item) {
            if (jQ.inArray(item.TRADINGSYMBOL, MOVEMENTSTOCKS) != -1) {
                filterData.push(item)
            }
        });
        data = filterData

    }

    let sell = 0;
    let strongSellOH = 0
    let strongSellLowerHigh = 0
    let buy = 0;
    let strongBuyOL = 0;
    let strongBuyHigherHigh = 0;

    if (ohlTrend && data.length != FO_LIST.length && trendType) {
        let delayCount = 0;
        let count = data.length;
        for (let i = 0; i < data.length; i++) {
            jQ("#processing").html("Processing.... " + i+"/"+count);
            let res = await checkOHLTrend(data[i]);

            if (res[2] == "Strong Sell(OH)") {
                strongSellOH++;
            }

            if (res[2] == "Strong Buy(OL)") {
                strongBuyOL++;
            }

            if (res[2] == "Strong Sell(Lower High)") {
                strongSellLowerHigh++;
            }

            if (res[2] == "Strong Buy(Higher High)") {
                strongBuyHigherHigh++;
            }

            if (res[2] == "Buy") {
                buy++;
            }

            if (res[2] == "Sell") {
                sell++;
            }

            data[i]['OHL_TREND'] = res
            data[i]['VOLUME'] = res[3]
            if (parseFloat(res[3]) > STOCK_VOLUME) {
                data[i]['IS_TRADABLE'] = 'Yes'
            }

            if (delayCount == 3) {
                delayCount = 0;
                await callSleepForAWhile(1000)
            }
            delayCount++;
        }
        jQ("#ohl-sell").html(sell);
        jQ("#strong-sell-ohl").html(strongSellOH);
        jQ("#strong-sell-lower-high").html(strongSellLowerHigh);
        jQ("#ohl-buy").html(buy);
        jQ("#strong-buy-higher-higher").html(strongBuyHigherHigh);
        jQ("#strong-buy-ol").html(strongBuyOL);
        let totalBuy = buy + strongBuyHigherHigh + strongBuyOL
        let totalSell = sell + strongSellOH + strongSellLowerHigh
        jQ("#total-buy").html(totalBuy)
        jQ("#total-sell").html(totalSell)

        stockScannerStartRefresh();
        jQ("#processing").html("Done..")
    }
    scannerGlobalList = data;
    generateStockScannerDataTable(data)
}


async function checkOHLTrend(obj) {
    let tempName = obj.TRADINGSYMBOL.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    await savePreviousStockQuote(tempName, instrumentTokens[obj.TRADINGSYMBOL])

    let previousQuote = JSON.parse(localStorage.getItem(tempName + "_PREVIOUS_DAY_QUOTE"));
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

    let dayHigh = 0
    let dayLow = 0
    let dayOpen = parseFloat(instrumentsMap[obj.TRADINGSYMBOL]['price']);
    jQ.each(prevQuote, function (index, item) {
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


    let data = await getHistoricalDataUsingPromise(instrumentTokens[obj.TRADINGSYMBOL], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
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

    jQ.each(quote, function (index, item) {
        if (item.high > dayHigh) {
            dayHigh = item.high
        }

        if (item.low < dayLow) {
            dayLow = item.low
        }
    });


    let previousClose = parseFloat(instrumentsMap[obj.TRADINGSYMBOL].prevPrice);
    let res = calculateOHLBuySell(dayOpen, dayHigh, dayLow, obj['LTP'], previousClose);
    let last = quote[quote.length - 1];
    res.push(last.volume);
    return res;

}


function getStockScannerAllBullsBearsCount() {
    let vixl = 0;
    let vixu = 0;

    let ast = 0;
    let aso = 0;
    let bso = 0;
    let bst = 0;
    let instrumentType = jQ("#instrument-type option:selected").val()

    let listType = FO_LIST;
    if (instrumentType == "NIFTY") {
        listType = NIFTY_50_LIST;
    }

    if (instrumentType == "BANK") {
        listType = NIFTY_BANK_LIST;
    }

    jQ.each(FO_LIST, function (index, item) {
        if (jQ.inArray(item, listType) != -1) {
            let data = infoMap[item]
            if (data) {
                if (jQ.inArray("VIXL", data['trends']) != -1) {
                    vixl++
                }
                if (jQ.inArray("VIXU", data['trends']) != -1) {
                    vixu++
                }

                if (jQ.inArray("AST", data['trends']) != -1) {
                    ast++
                }
                if (jQ.inArray("ASO", data['trends']) != -1) {
                    aso++
                }

                if (jQ.inArray("BST", data['trends']) != -1) {
                    bst++
                }
                if (jQ.inArray("BSO", data['trends']) != -1) {
                    bso++
                }
            }
        }
    });

    ast = '<span class="badge bg-danger">' + ast + '</span>'
    aso = '<span class="badge bg-success">' + aso + '</span>'
    jQ("#stock-all-ast").html(ast);
    jQ("#stock-all-aso").html(aso);
    bst = '<span class="badge bg-success">' + bst + '</span>'
    bso = '<span class="badge bg-danger">' + bso + '</span>'
    jQ("#stock-all-bst").html(bst);
    jQ("#stock-all-bso").html(bso);
}


var stockScannerTable;
function generateStockScannerDataTable(data) {
    /*let tickList = readTicksFromStorage();*/
    jQ("#stock-scanner-list-table").show()
    stockScannerTable = jQ('#stock-scanner-list-table').DataTable({
        "processing": true,
        "order": [[10, "desc"]],
        "pageLength": 50,
        "bPaginate": false,
        "data": data,
        "bDestroy": true,
        "columnDefs": [
            {
                "targets": [6, 7,8,9],
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
                    }

                    return html
                }
            },

            {
                "data": "OHL_TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data) {
                        html += '<span class="badge bg-success">' +  + parseFloat(data[0]).toFixed(2) + '</span>'
                    }
                    return html
                }
            },

            {
                "data": "OHL_TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data) {
                        html += '<span class="badge bg-danger">' +  + parseFloat(data[1]).toFixed(2) + '</span>'
                    }
                    return html
                }
            },

            {
                "data": "",
                render: function (data, type, row, meta) {
                    let html = ''
                    let currentPrice = row['LTP'];
                    if (row.TREND.length > 0) {
                        jQ.each(row.TREND, function (index, item) {
                            if (item == "ASO") {
                                let asoPrice = 0;
                                let aso = parseFloat(row['STRIKEDATA']['ustrikeOne']) - parseFloat(row['PRICE']);
                                aso = aso / 5
                                asoPrice = parseFloat(row['STRIKEDATA']['ustrikeOne']);
                                let ASO_MOVED = parseFloat(currentPrice - asoPrice).toFixed();
                                if (ASO_MOVED >= 0) {
                                    html += ASO_MOVED
                                }
                            }

                            if (item == "BSO") {
                                let bsoPrice = 0;
                                let bso = parseFloat(row['PRICE']) - parseFloat(row['STRIKEDATA']['bstrikeOne']);
                                bso = bso / 5
                                bsoPrice = parseFloat(row['STRIKEDATA']['bstrikeOne']) + bso;
                                let BSO_MOVED = parseFloat(bsoPrice - currentPrice).toFixed();
                                if (BSO_MOVED >= 0) {
                                    html += BSO_MOVED
                                }
                            }
                        });
                    }
                    return html
                }
            },

            { "data": 'WEIGHTAGE' },
            { "data": 'CLOSE' },
            { "data": 'PRICE' },
            { "data": 'LTP' },
            {
                "data": 'PERC',
                render: function (data, type, row, meta) {
                    let currentPrice = row['LTP'];
                    let prevClose = row['CLOSE'];
                    let change = (currentPrice - prevClose).toFixed(2);
                    let changePerc = ((change / prevClose) * 100).toFixed(2)
                    let html = ''
                    if (changePerc < 0) {
                            html += '<span class="badge bg-danger">' + changePerc + '</span>'
                        } else {
                            html += '<span class="badge bg-success">' + changePerc + '</span>'
                        }
                    return html;
                }
            },
            {
                "data": 'VOLUME',
                render: function (data, type, row, meta) {
                    return data;

                }
            }, {
                "data": 'IS_TRADABLE',
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
                    if (jQ.inArray(row['TRADINGSYMBOL'], INDICES) == -1) {
                        if (row['TREND']) {
                            let isBuyTrade = false;
                            let allowTrade = false;
                            if (jQ.inArray("ASO", row['TREND']) != -1) {
                                isBuyTrade = true
                                allowTrade = true
                            } else if (jQ.inArray("BSO", row['TREND']) != -1) {
                                isBuyTrade = false
                                allowTrade = true
                            }

                            let transactionType = 'BUY'
                            let slTransactionType = "SELL"
                            let btnColor = "bg-success"
                            let name = "Buy"
                            if (!isBuyTrade) {
                                btnColor = "bg-danger"
                                transactionType = 'SELL'
                                name = "Sell"
                                slTransactionType = "BUY"
                            }

                            if (allowTrade) {
                                html += '<span  data-name="' + row['TRADINGSYMBOL'] + '" data-price="' + row['LTP'] + '"  data-transaction-type="' + transactionType + '" class="badge bg-secondary  ms-1 place-order ' + btnColor + '"style="margin-right:.5rem;">';
                                html += name
                                html += '</span>'

                                html += '<span  data-name="' + row['TRADINGSYMBOL'] + '" data-price="' + row['LTP'] + '"  data-transaction-type="' + slTransactionType + '" class="badge bg-primary  ms-1 place-sl-order" style="margin-right:.5rem;">';
                                html += "SL"
                                html += '</span>'


                                html += '<span  data-row-id="' + meta.row + '" data-name="' + row['TRADINGSYMBOL'] + '"  class="badge bg-primary  ms-1 check-volume" style="margin-right:.5rem;">';
                                html += "Check"
                                html += '</span>'

                            }
                        }
                    } else {
                        index = 0;
                    }
                    if (!row['TREND']) {
                        row['TREND'] = []
                    }
                    html += '<span data-price="' + row['LTP'] + '" data-index="' + index + '" data-trend="' + row['TREND'].join(",") + '" data-name="' + row['TRADINGSYMBOL'] + '" class="badge bg-info show-chart">'
                    html += 'Chart'
                    html += '</span>'
                    html += '</div>'
                    return html
                }
            },
        ],
        "fnInitComplete": function (oSettings, json) {
        }
    });
}


jQ(document).on("click", ".check-volume", function () {
    let name = jQ(this).attr("data-name");
    var rowId = jQ(this).attr("data-row-id");
    var rowData = scannerGlobalList[rowId]
    callCheckVolumeCondtion(name, rowId, rowData)
});



async function callCheckVolumeCondtion(name, rowId, row) {
    let quote = await checkVolumeCondtion(name);
    let last = quote[quote.length - 1];

    let whichTrade = '';
    if (jQ.inArray("ASO", row['TREND']) != -1) {
        whichTrade = "ASO";
    } else if (jQ.inArray("BSO", row['TREND']) != -1) {
        whichTrade = "BSO";
    }
    let isValidClose = false;
    if (whichTrade == "ASO") {
        let asoPrice = parseFloat(row['STRIKEDATA']['ustrikeOne'])
        if (last.close > asoPrice) {
            isValidClose = true
        }

    } else if (whichTrade == "BSO") {
        let bsoPrice = parseFloat(row['STRIKEDATA']['bstrikeOne'])
        if (last.close < bsoPrice) {
            isValidClose = true
        }
    }
    if (last.volume > STOCK_VOLUME && isValidClose) {
        scannerGlobalList[rowId]['VOLUME'] = last.volume
        scannerGlobalList[rowId]['IS_TRADABLE'] = 'Yes';
    }
    updateScannerTable(rowId)
}

function checkVolumeCondtion(name) {
    return new Promise((resolve, reject) => {
        jQ.when(getHistoricalData(instrumentTokens[name], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL)).done(function (res) {
            let quote = []
            jQ.each(res.data.candles, function (index, item) {
                let map = {}
                map['date'] = moment(item[0]).format("HH:mm:ss")
                map.open = item[1]
                map.high = item[2]
                map.low = item[3]
                map.close = item[4]
                map.volume = item[5]
                quote.push(map);
            });
            resolve(quote)
        });
    });
}

function updateScannerTable(rowId) {
    jQ('#stock-scanner-list-table').DataTable().row(rowId).data(scannerGlobalList[rowId]).draw(false);
}
