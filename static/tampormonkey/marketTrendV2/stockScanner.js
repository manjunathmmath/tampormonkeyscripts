jQ(document).on("click", "#show-stock-scanner", function () {
    showStockScanner();
})

function showStockScanner() {
    let html = ''

    html += '<div class="row">'

    html += '<div class="col-md-8">'
    html += '<div class="card" >'
    html += '<div class="card-header">'
    html += '<span class="stock-filter-instruments filter-type" data-index-name="ALL">ALL: </span> <span id="stock-all-bulls" class="badge bg-success"></span> <span id="stock-all-bears" class="badge bg-danger"></span>'
    html += 'ASO: <span class="stock-filter-instruments" data-trend-type="ASO" data-index-name="ALL" id="stock-all-aso">0</span></span>'
    html += 'BSO: <span class="stock-filter-instruments" data-trend-type="BSO" data-index-name="ALL" id="stock-all-bso">0</span></span>'
    html += '</div>'
    html += '</div>'
    html += '</div>'


    html += '<div class="col-md-4">'
    html += '<div class="row">'
    html += '<div class="col-md-3">'
    html += '<span class="filter-type" ><input value="5" type="text" id="price-moved" placeholder="" class="form-control form-control-sm"/></span>'
    html += '</div>'
    html += '<div class="col-md-6">'
    html += '<span class="filter-type" >HIDE TRADED: <input type="checkbox" id="currently-traded"/></span>'
    html += '</div>'
    html += '</div>'
    html += '</div>'

    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table  class="" id="stock-scanner-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>INSTRUMENT</th>'
    html += '<th>WEIGHTAGE</th>'
    html += '<th>P.CLOSE</th>'
    html += '<th>OPEN PRICE</th>'
    html += '<th>LTP</th>'
    html += '<th>CHANGE</th>'
    html += '<th>VOLUME</th>'
    html += '<th>TRADABLE</th>'
    html += '<th>TREND</th>'
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
    title += '</div>'


    showPopUpWindow('stock-scanner', html, "Stock Scanner");
    var divId = "popup-custom-style-stock-scanner";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    jQ("." + divId).on("close.popupwindow", function () {
        if (stockScannerTimerInstance) {
            clearInterval(stockScannerTimerInstance)
        }
    });
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
    generateStockScanner('');
    getStockScannerAllBullsBearsCount();
    clearInterval(stockScannerTimerInstance);
    stockScannerStartRefresh();
    jQ("#stock-scanner-last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
}

function stockScannerStartRefresh() {
    var display = document.querySelector('#stock-scanner-refresh-timer-one');
    stockScannerStartStTimer(REFRESH_TIME, display);
};

function stockScannerStartStTimer(duration, display) {
    if (!duration) {
        duration = 60
    }
    duration = 180
    var timer = duration, minutes, seconds;
    stockScannerTimerInstance = setInterval(function () {
        minutes = parseInt(timer / 60, 10);
        seconds = parseInt(timer % 60, 10);

        display.textContent = minutes + ":" + seconds;

        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;
        if (--timer < 0) {
            refreshStockScannerTable()
            timer = duration;
        }
    }, 1000);
}


jQ(document).on("click", ".stock-filter-instruments", function (e) {
    let trendType = jQ(this).attr("data-trend-type");
    generateStockScanner(trendType)
});

let scannerGlobalList = [];
function generateStockScanner(trendType) {
    let listType = FO_LIST;
    let WEIGHTAGE = NIFTY_50_WEIGHT;
    let data = [];
    let priceMoved = jQ("#price-moved").val();
    let checkTraded = jQ("#currently-traded").is(":checked");
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
                            aso = aso / 2
                            asoPrice = parseFloat(obj['STRIKEDATA']['ustrikeOne']) - aso;
                            let ASO_MOVED = parseFloat(currentPrice - asoPrice).toFixed();
                            if (ASO_MOVED <= priceMoved) {
                                data.push(obj)
                            }
                        }

                        if (trendType == "BSO") {
                            let bsoPrice = 0;
                            let bso = parseFloat(obj['PRICE']) - parseFloat(obj['STRIKEDATA']['bstrikeOne']);
                            bso = bso / 2
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
    scannerGlobalList = data;
    generateStockScannerDataTable(data)
}


function getStockScannerAllBullsBearsCount() {
    let vixl = 0;
    let vixu = 0;

    let ast = 0;
    let aso = 0;
    let bso = 0;
    let bst = 0;

    jQ.each(FO_LIST, function (index, item) {
        console.log(item)
        let data = infoMap[item]
        if (data['trends']) {
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
    });

    let bulls = vixu + aso + bst
    let bears = vixl + ast + bso

    jQ("#stock-all-bulls").html(bulls);
    jQ("#stock-all-bears").html(bears);

    vixu = '<span class="badge bg-success">' + vixu + '</span>'
    vixl = '<span class="badge bg-danger">' + vixl + '</span>'
    jQ("#stock-all-vixu").html(vixu);
    jQ("#stock-all-vixl").html(vixl);


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
        "order": [[0, "asc"]],
        "pageLength": 50,
        "bPaginate": false,
        "data": data,
        "bDestroy": true,
        "scrollY": "500px",
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
                "data": "TRADINGSYMBOL",
                render: function (data, type, row, meta) {
                    let html = ''
                    let trades = JSON.parse(localStorage.getItem("TRADES"));
                    if (jQ.inArray(data, trades) !== -1) {
                        html += '<span class="badge bg-warning" title="Already traded">' + data + '</span>'
                    } else {
                        html += data;
                    }
                    return html;
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
                    return changePerc;
                }
            },
            {
                "data": 'VOLUME',
                render: function (data, type, row, meta) {
                    return data;

                }
            },   {
                "data": 'IS_TRADABLE',
                render: function (data, type, row, meta) {
                    return data;

                }
            },
            {
                "data": "TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    let currentPrice = row['LTP'];
                    if (data.length > 0) {
                        jQ.each(data, function (index, item) {
                            if (item == "ASO") {
                                let asoPrice = 0;
                                let aso = parseFloat(row['STRIKEDATA']['ustrikeOne']) - parseFloat(row['PRICE']);
                                aso = aso / 2
                                asoPrice = parseFloat(row['STRIKEDATA']['ustrikeOne']) - aso;
                                let ASO_MOVED = parseFloat(currentPrice - asoPrice).toFixed();
                                if (ASO_MOVED >= 0) {
                                    html += '<span class="badge bg-info above-strike-one strike-info">ASO (' + ASO_MOVED + ')</span>'
                                } else {
                                    html += '<span class="badge bg-info above-strike-one strike-info">ASO</span>'
                                }
                            }

                            if (item == "BSO") {
                                let bsoPrice = 0;
                                let bso = parseFloat(row['PRICE']) - parseFloat(row['STRIKEDATA']['bstrikeOne']);
                                bso = bso / 2
                                bsoPrice = parseFloat(row['STRIKEDATA']['bstrikeOne']) + bso;
                                let BSO_MOVED = parseFloat(bsoPrice - currentPrice).toFixed();
                                if (BSO_MOVED >= 0) {
                                    html += '<span class="badge bg-info below-strike-one strike-info">BSO (' + BSO_MOVED + ')</span>'
                                } else {
                                    html += '<span class="badge bg-info below-strike-one strike-info">BSO</span>'
                                }
                            }
                        });
                    }
                    return html
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
                    if (row['TREND']) {
                        html += '<span data-price="' + row['LTP'] + '" data-index="' + index + '" data-trend="' + row['TREND'].join(",") + '" data-name="' + row['TRADINGSYMBOL'] + '" class="badge bg-info show-chart">'
                        html += 'Chart'
                        html += '</span>'
                    }
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
    callCheckVolumeCondtion(name,rowId,rowData)
});



async function callCheckVolumeCondtion(name,rowId,row) {
    let quote = await checkVolumeCondtion(name);
    let last = quote[quote.length-1];

    let whichTrade = '';
    if (jQ.inArray("ASO", row['TREND']) != -1) {
        whichTrade = "ASO";
    } else if (jQ.inArray("BSO", row['TREND']) != -1) {
        whichTrade = "BSO";
    }
    let isValidClose = false;
    if (whichTrade == "ASO") {
        let asoPrice = parseFloat(row['STRIKEDATA']['ustrikeOne'])
        if(last.close > asoPrice){
            isValidClose = true
        }
        
    } else if (whichTrade == "BSO") {
        let bsoPrice = parseFloat(row['STRIKEDATA']['bstrikeOne'])
        if(last.close < bsoPrice){
            isValidClose = true
        }
    }
    if(last.volume > STOCK_VOLUME && isValidClose) {
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
    console.log(scannerGlobalList)
    console.log(scannerGlobalList[rowId])
    jQ('#stock-scanner-list-table').DataTable().row(rowId).data(scannerGlobalList[rowId]).draw(false);
}
