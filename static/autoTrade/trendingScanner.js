jQ(document).on("click", "#show-trending-intruments", function () {
    showTrendingStocks();
})


let trendingStocks = []
async function showTrendingStocks() {
    trendingStocks = []
    let html = ''

    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table  class="table" id="trending-stock-list-table" style="width: 100%;display: none;">'

    html += '<thead>'
    html += '<tr>'
    html += '<th rowspan="2">O</th>'
    html += '<th rowspan="2">SYMBOL</th>'
    html += '<th rowspan="2">CH%</th>'
    html += '<th rowspan="2" title="Price Moved" >M</th>'
    html += '<th rowspan="2" title="Trend" >T</th>'
    html += '<th rowspan="2" title="OHL Trend" >OHL</th>'
    html += '<th rowspan="2">B %</th>'
    html += '<th rowspan="2">S %</th>'
    html += '<th rowspan="2" title="Volume" >V</th>'
    html += '<th rowspan="2">LTP</th>'
    html += '<th colspan="3" class="strike-colspan-class itm-col-class">Strike</th>'
    html += '<th colspan="3" class="strike-colspan-class itm-col-class">Strike</th>'
    html += '<th colspan="3" class="strike-colspan-class atm-col-class">Strike</th>'
    html += '<th colspan="3" class="strike-colspan-class otm-col-class">Strike</th>'
    html += '<th colspan="3" class="strike-colspan-class otm-col-class">Strike</th>'
    html += '</tr>'

    html += '<tr>'
    html += '<th class="number-align" >CE</th>'
    html += '<th class="text-align">S</th>'
    html += '<th class="number-align">PE</th> '

    html += '<th class="number-align">CE</th>'
    html += '<th class="text-align">S</th>'
    html += '<th class="number-align">PE</th> '

    html += '<th class="number-align">CE</th>'
    html += '<th class="text-align">S</th>'
    html += '<th class="number-align">PE</th> '


    html += '<th class="number-align">CE</th>'
    html += '<th class="text-align">S</th>'
    html += '<th class="number-align">PE</th> '

    html += '<th class="number-align">CE</th>'
    html += '<th class="text-align">S</th>'
    html += '<th class="number-align">PE</th> '
    html += '</tr>'

    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'
    html += '</div>'
    html += '</div>'

    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'

    let title = ''
    title += '<div class="row">'
    title += '<div class="col-md-2">'
    title += 'Trending Scanner'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '<a id="trending-scanner-start-auto-refresh">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
    title += '</div>'
    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span id="trending-last-refresh-time">Last @ 00:00:00</span>'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '<span id="processing-trend"></span>'
    title += '</div>'
    title += '</div>'

    showPopUpWindow('trending-scanner', html, "Trending Scanner", 950, 550);

    var divId = "popup-custom-style-trending-scanner";

    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    let instru = [];
    let scripts = []
    let checkInstr = []
    let orderRow = 1;
    jQ.each(instrumentsMap, function (index, item) {
        if (jQ.inArray(index, checkInstr) === -1) {
            if (index == "NIFTY 50" || index == "NIFTY BANK" || index == "RELIANCE" || index == "HDFCBANK") {
                instru.push(instrumentsMap[index])
                checkInstr.push(index)
            }
        }
    });

    for (let i = 0; i < instru.length; i++) {
        let data = instru[i];
        let obj = {}
        obj['TRADINGSYMBOL'] = data.name;
        obj['CLOSE'] = data['prevPrice'];
        obj['PRICE'] = data['price'];
        obj['PERC'] = data['perc'];
        obj['TREND'] = '';
        obj['LTP'] = 0;
        if (infoMap[data.name]) {
            obj['TREND'] = infoMap[data.name]['trends'];
            obj['LTP'] = infoMap[data.name]['currentPrice'];
            obj['STRIKEDATA'] = infoMap[data.name]['strikeData'];
            obj['CURRENT_PRICE'] = infoMap[data.name]['currentPrice'];
        }
        scripts.push(obj)
    }

    let validIntruments = JSON.parse(localStorage.getItem("VALID_INSTRUMENTS"));
    console.log(checkInstr)
    jQ.each(validIntruments, function (index, item) {
        if (jQ.inArray(index, checkInstr) === -1) {
            scripts.push(item)
            checkInstr.push(index)
        }
    })

    /*scripts.sort((a, b) => a.TRADINGSYMBOL.toLowerCase() > b.TRADINGSYMBOL.toLowerCase() ? 1 : -1);*/

    for (let i = 0; i < scripts.length; i++) {
        let obj = {}

        obj['TRADINGSYMBOL'] = scripts[i]['TRADINGSYMBOL']
        let info = infoMap[scripts[i]['TRADINGSYMBOL']]
        obj['LTP'] = info['currentPrice']
        obj['TREND'] = scripts[i]['TREND']
        obj['STRIKEDATA'] = scripts[i]['STRIKEDATA']
        obj['CLOSE'] = scripts[i]['CLOSE']
        obj['PRICE'] = scripts[i]['PRICE']
        obj['PERC'] = scripts[i]['PERC']
        obj['ORDER'] = orderRow;

        obj['OHL_TREND'] = ''
        obj['OI_TREND'] = ''
        obj['VOLUME'] = ''

        obj['STRIKE_LOWER_ONE_CE'] = ''
        obj['STRIKE_LOWER_ONE'] = ''
        obj['STRIKE_LOWER_ONE_PE'] = ''

        obj['STRIKE_LOWER_TWO_CE'] = ''
        obj['STRIKE_LOWER_TWO'] = ''
        obj['STRIKE_LOWER_TWO_PE'] = ''


        obj['STRIKE_ATM_CE'] = ''
        obj['STRIKE_ATM'] = ''
        obj['STRIKE_ATM_PE'] = ''

        obj['STRIKE_UPPER_ONE_CE'] = ''
        obj['STRIKE_UPPER_ONE'] = ''
        obj['STRIKE_UPPER_ONE_PE'] = ''

        obj['STRIKE_UPPER_TWO_CE'] = ''
        obj['STRIKE_UPPER_TWO'] = ''
        obj['STRIKE_UPPER_TWO_PE'] = ''


        let priceMoved = 0;

        let asoPrice = 0;
        let bsoPrice = 0;
        let aso = parseFloat(obj['STRIKEDATA']['ustrikeOne']) - parseFloat(obj['PRICE']);
        aso = aso / 5
        asoPrice = parseFloat(obj['STRIKEDATA']['ustrikeOne']) - aso;

        let bso = parseFloat(obj['PRICE']) - parseFloat(obj['STRIKEDATA']['bstrikeOne']);
        bso = bso / 5
        bsoPrice = parseFloat(obj['STRIKEDATA']['bstrikeOne']) + bso;

        if (jQ.inArray("ASO", obj['TREND']) != -1) {
            priceMoved = parseFloat(info['currentPrice']) - asoPrice
        }

        if (jQ.inArray("BSO", obj['TREND']) != -1) {
            priceMoved = bsoPrice - parseFloat(info['currentPrice'])
        }

        obj['PRICE_MOVED'] = parseFloat(priceMoved).toFixed(1)
        trendingStocks.push(obj)
        orderRow++;

    }

    /*trendingStocks.sort((a, b) => a.TRADINGSYMBOL.toLowerCase() > b.TRADINGSYMBOL.toLowerCase() ? 1 : -1);*/

    if (scripts.length > 0) {
        generateTrendingStockTable(trendingStocks)
    }
}


jQ(document).on("click", "#trending-scanner-start-auto-refresh", function (e) {
    let temp = trendingStocks
    jQ.each(temp, function (index, item) {
        let info = infoMap[item['TRADINGSYMBOL']]
        trendingStocks[index]['LTP'] = info['currentPrice']

        let priceMoved = 0;
        let asoPrice = 0;
        let bsoPrice = 0;

        let aso = parseFloat(trendingStocks[index]['STRIKEDATA']['ustrikeOne']) - parseFloat(trendingStocks[index]['PRICE']);
        aso = aso / 5
        asoPrice = parseFloat(trendingStocks[index]['STRIKEDATA']['ustrikeOne']) - aso;

        let bso = parseFloat(trendingStocks[index]['PRICE']) - parseFloat(trendingStocks[index]['STRIKEDATA']['bstrikeOne']);
        bso = bso / 5
        bsoPrice = parseFloat(trendingStocks[index]['STRIKEDATA']['bstrikeOne']) + bso;

        if (jQ.inArray("ASO", trendingStocks[index]['TREND']) != -1) {
            priceMoved = parseFloat(info['currentPrice']) - asoPrice
        }

        if (jQ.inArray("BSO", trendingStocks[index]['TREND']) != -1) {
            priceMoved = bsoPrice - parseFloat(info['currentPrice'])
        }
        trendingStocks[index]['PRICE_MOVED'] = parseFloat(priceMoved).toFixed(1)
    });

    generateTrendingStockTable(trendingStocks)
});

let trendingScannerTable = null
function generateTrendingStockTable(data) {
    let link = "https://kite.zerodha.com/chart/ext/tvc/NFO-OPT/##INSTRUMENT##/##TOKEN##"
    jQ("#trending-stock-list-table").show()
    trendingScannerTable = jQ('#trending-stock-list-table').DataTable({
        "processing": true,
        "order": [[0, 'asc']],
        "pageLength": 50,
        "bPaginate": false,
        "data": data,
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
                "data": "ORDER"
            },
            {
                "data": "TRADINGSYMBOL",
                render: function (data, type, row, meta) {
                    let html = ''
                    html += '<a target="_blank" href="https://kite.zerodha.com/chart/ext/tvc/' + 'NSE' + '/' + data + '/' + instrumentTokens[data] + '"> '

                    let trades = JSON.parse(localStorage.getItem("TRADES"));
                    if (jQ.inArray(data, trades) !== -1) {
                        html += '<span class=" bg-warning-color" title="Already traded">' + data + '</span>'
                    } else {
                        html += data;
                    }
                    html += '</a>'

                    html += '<span style="font-size:xx-small;display:block;" data-price="' + row['LTP'] + '" data-index="' + 0 + '" data-trend="' + row['TREND'] + '" data-name="' + row['TRADINGSYMBOL'] + '" class="bg-info-color show-chart">'
                    html += 'Chart'
                    html += '</span>'

                    return html;
                }
            },
            {
                "data": 'PERC',
                render: function (data, type, row, meta) {
                    let currentPrice = row['LTP'];
                    let prevClose = row['CLOSE'];
                    let change = (currentPrice - prevClose).toFixed(2);
                    let changePerc = ((change / prevClose) * 100).toFixed(2)
                    let html = ''
                    if (changePerc < 0) {
                        html += '<span class=" bg-danger-color">' + changePerc + '</span>'
                    } else {
                        html += '<span class=" bg-success-color">' + changePerc + '</span>'
                    }
                    return html;
                }
            },
            { "data": "PRICE_MOVED" },
            { "data": "TREND" },
            {
                "data": "OHL_TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data) {
                        let ohl = ''

                        if (data[2] == "Strong Sell(OH)") {
                            ohl = "SSOH"
                        }

                        if (data[2] == "Strong Buy(OL)") {
                            ohl = "SBOL"
                        }

                        if (data[2] == "Strong Sell(Lower High)") {
                            ohl = "SSLH"
                        }

                        if (data[2] == "Strong Buy(Higher High)") {
                            ohl = "SBHH"
                        }

                        if (data[2] == "Buy") {
                            ohl = "B"
                        }

                        if (data[2] == "Sell") {
                            ohl = "S"
                        }

                        if (data[2].includes("Sell")) {
                            html += '<span title="' + data[2] + '" class=" bg-danger-color">' + ohl + '</span>'
                        } else {
                            html += '<span title="' + data[2] + '" class=" bg-success-color">' + ohl + '</span>'
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
                        html += '<span class=" bg-success-color">' + + parseFloat(data[0]).toFixed(2) + '</span>'
                    }
                    return html
                }
            },

            {
                "data": "OHL_TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data) {
                        html += '<span class=" bg-danger-color">' + + parseFloat(data[1]).toFixed(2) + '</span>'
                    }
                    return html
                }
            },
            { "data": "VOLUME" },
            { "data": "LTP" },

            {
                "data": "STRIKE_LOWER_ONE_CE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_LOWER_ONE_PE'])) {
                            className = " bg-danger-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_LOWER_ONE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_LOWER_ONE'])
                            && parseFloat(row['LTP']) < parseFloat(row['STRIKE_LOWER_TWO'])) {
                            className = "bg-danger-color"
                        }
                        html += '<span class="text-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_LOWER_ONE_PE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_LOWER_ONE_CE'])) {
                            className = " bg-success-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },

            {
                "data": "STRIKE_LOWER_TWO_CE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_LOWER_TWO_PE'])) {
                            className = " bg-danger-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_LOWER_TWO",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_LOWER_TWO'])
                            && parseFloat(row['LTP']) < parseFloat(row['STRIKE_ATM'])) {
                            className = "bg-danger-color"
                        }
                        html += '<span class="text-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_LOWER_TWO_PE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_LOWER_TWO_CE'])) {
                            className = " bg-success-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },

            {
                "data": "STRIKE_ATM_CE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_ATM_PE'])) {
                            className = " bg-danger-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_ATM",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {

                        if (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_ATM'])
                            && parseFloat(row['LTP']) < parseFloat(row['STRIKE_UPPER_ONE'])) {
                            className = "bg-danger-color"
                        }
                        html += '<span class="text-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_ATM_PE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_ATM_CE'])) {
                            className = " bg-success-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },

            {
                "data": "STRIKE_UPPER_ONE_CE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_UPPER_ONE_PE'])) {
                            className = " bg-danger-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_UPPER_ONE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_UPPER_ONE'])
                            && parseFloat(row['LTP']) < parseFloat(row['STRIKE_UPPER_TWO'])) {
                            className = "bg-danger-color"
                        }
                        html += '<span class="text-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_UPPER_ONE_PE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_UPPER_ONE_CE'])) {
                            className = " bg-success-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },

            {
                "data": "STRIKE_UPPER_TWO_CE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_UPPER_TWO_PE'])) {
                            className = " bg-danger-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_UPPER_TWO",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(row['LTP']) > parseFloat(row['STRIKE_UPPER_TWO'])) {
                            className = "bg-warning-color"
                        }
                        html += '<span class="text-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_UPPER_TWO_PE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_UPPER_TWO_CE'])) {
                            className = " bg-success-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },

        ],
        "fnInitComplete": function (oSettings, json) {
            let asoCount = 0;
            let bsoCount = 0;
            let allCount = 0;
            jQ.each(data, function (index, item) {
                if (jQ.inArray("ASO", item['TREND']) != -1) {
                    asoCount++;
                }
                if (jQ.inArray("BSO", item['TREND']) != -1) {
                    bsoCount++;
                }
                allCount++;

            });
            jQ(".dt-buttons").append('<button data-trend="all" class="dt-button trend-filter" type="button"><span>ALL(' + allCount + ')</span></button>')
            jQ(".dt-buttons").append('<button data-trend="bso" class="dt-button trend-filter" type="button"><span>BSO (' + bsoCount + ')</span></button>')
            jQ(".dt-buttons").append('<button data-trend="aso" class="dt-button trend-filter" type="button"><span>ASO(' + asoCount + ')</span></button>')
            jQ(".dt-buttons").append('<button data-name="NIFTY"  style="margin-right: .2rem;" class="dt-button show-option-change" type="button"><span>N-OI</span></button>')
            jQ(".dt-buttons").append('<button data-name="BANKNIFTY"  style="margin-right: .2rem;" class="dt-button show-option-change" type="button"><span>B-OI</span></button>')
            jQ(".dt-buttons").append('<button data-name="RELIANCE"  style="margin-right: .2rem;" class="dt-button show-option-change" type="button"><span>R-OI</span></button>')
            jQ(".dt-buttons").append('<button data-name="HDFCBANK"  style="margin-right: .2rem;" class="dt-button show-option-change" type="button"><span>H-OI</span></button>')
            jQ(".dt-buttons").append('<button style="margin-right: .2rem;" class="dt-button analyse-instrument" type="button"><span>Analyze</span></button>')

        },
        "fnRowCallback": function (nRow, aData, iDisplayIndex, iDisplayIndexFull) {
            for (var i in aData) {
                jQ('td:eq(' + 11 + ')', nRow).addClass('strike-class');
                jQ('td:eq(' + 14 + ')', nRow).addClass('strike-class');
                jQ('td:eq(' + 17 + ')', nRow).addClass('strike-class');
                jQ('td:eq(' + 20 + ')', nRow).addClass('strike-class');
                jQ('td:eq(' + 23 + ')', nRow).addClass('strike-class');

            }
        }
    });
    jQ("#trending-last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));



}


jQ(document).on("click", ".trend-filter", function (e) {
    let name = jQ(this).attr("data-trend");
    let temp = []
    jQ.each(trendingStocks, function (index, item) {
        if (name == "aso") {
            if (jQ.inArray("ASO", item['TREND']) != -1) {
                temp.push(item)
            }
        } else if (name == "bso") {
            if (jQ.inArray("BSO", item['TREND']) != -1) {
                temp.push(item)
            }
        } else {
            temp.push(item)
        }
    });
    generateTrendingStockTable(temp)
});


jQ(document).on("click", ".analyse-instrument", function () {
    jQ("#processing-trend").html("Processing.... ");
    callAnalyseTrend()
});

async function callAnalyseTrend() {
    let count = 0;
    let scriptsCount = trendingStocks.length
    for (let i = 0; i < trendingStocks.length; i++) {
        try {
            jQ("#processing-trend").html("Processing.... " + i + "/" + scriptsCount);
            let name = trendingStocks[i]['TRADINGSYMBOL']
            let tempName = name.replaceAll(" ", "-")
            tempName = tempName.replaceAll("&", "-")
            let rowId = i
            await savePreviousStockQuote(name, instrumentTokens[name])
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
            let dayOpen = parseFloat(instrumentsMap[name]['price']);
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

            let data = await getHistoricalDataUsingPromise(instrumentTokens[name], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
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



            let previousClose = parseFloat(instrumentsMap[name].prevPrice);
            let res = calculateOHLBuySell(dayOpen, dayHigh, dayLow, infoMap[name]['currentPrice'], previousClose);
            trendingStocks[rowId]['OHL_TREND'] = res;
            let strikes = await showTrendingOI(name)

            let oiHtml = ''
            let link = "https://kite.zerodha.com/chart/ext/tvc/NFO-OPT/##INSTRUMENT##/##TOKEN##"
            jQ.each(strikes, function (index, item) {
                oiHtml += '<div style="width:10rem;">'
                let className = 'bg-info-color'
                if (item.ATM_STRIKE) {
                    className = 'bg-primary-color'
                }
                oiHtml += '<span class=" bg-danger-color">' + item.CHG_OI_CE + '</span>'
                oiHtml += '<span class=" ' + className + '">' + item.STRIKE + '</span>'
                oiHtml += '<span class=" bg-success-color">' + item.CHG_OI_PE + '</span>'
                oiHtml += '<span>'
                oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", item.CE.tradingsymbol).replaceAll("##TOKEN##", item.CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;">'
                oiHtml += item.CE.tradingsymbol
                oiHtml += '</a>'
                oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", item.PE.tradingsymbol).replaceAll("##TOKEN##", item.PE.instrument_token) + '" target="_blank" style="font-size:xx-small;">'
                oiHtml += item.PE.tradingsymbol
                oiHtml += '</a>'
                oiHtml += '</span>'
                oiHtml += '</div>'
            });
            trendingStocks[rowId]['OI_TREND'] = oiHtml;

            if (strikes[0]) {
                trendingStocks[rowId]['STRIKE_LOWER_ONE_CE'] = strikes[0]['CHG_OI_CE']

                oiHtml = ''
                oiHtml += '<div style="display:flex;">'
                oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[0].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[0].CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;">'
                oiHtml += 'CE'
                oiHtml += '</a>'
                oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[0].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[0].PE.instrument_token) + '" target="_blank" style="font-size:xx-small;">'
                oiHtml += 'PE'
                oiHtml += '</a>'
                if (trendingStocks[rowId]['LTP'] < strikes[0]['STRIKE']) {
                    oiHtml += '<a data-price="' + strikes[0]['STRIKE'] + '" data-name="' + name + '" class=" bg-secondary-color create-alerts" style="font-size:xx-small;margin-left:.1rem;">A</a>'
                }
                oiHtml += '</div>'

                trendingStocks[rowId]['STRIKE_LOWER_ONE'] = strikes[0]['STRIKE'] + oiHtml

                trendingStocks[rowId]['STRIKE_LOWER_ONE_PE'] = strikes[0]['CHG_OI_PE']
            }

            if (strikes[1]) {
                trendingStocks[rowId]['STRIKE_LOWER_TWO_CE'] = strikes[1]['CHG_OI_CE']

                oiHtml = ''
                oiHtml += '<div style="display:flex;">'
                oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[1].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[1].CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;">'
                oiHtml += 'CE'
                oiHtml += '</a>'
                oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[1].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[1].PE.instrument_token) + '" target="_blank" style="font-size:xx-small;">'
                oiHtml += 'PE'
                oiHtml += '</a>'
                if (trendingStocks[rowId]['LTP'] < strikes[1]['STRIKE']) {
                    oiHtml += '<a data-price="' + strikes[1]['STRIKE'] + '" data-name="' + name + '" class=" bg-secondary-color create-alerts" style="font-size:xx-small;margin-left:.1rem;">A</a>'
                }

                oiHtml += '</div>'


                trendingStocks[rowId]['STRIKE_LOWER_TWO'] = strikes[1]['STRIKE'] + oiHtml
                trendingStocks[rowId]['STRIKE_LOWER_TWO_PE'] = strikes[1]['CHG_OI_PE']
            }

            if (strikes[2]) {
                trendingStocks[rowId]['STRIKE_ATM_CE'] = strikes[2]['CHG_OI_CE']

                oiHtml = ''
                oiHtml += '<div style="display:flex;">'
                oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[2].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[2].CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;">'
                oiHtml += 'CE'
                oiHtml += '</a>'
                oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[2].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[2].PE.instrument_token) + '" target="_blank" style="font-size:xx-small;">'
                oiHtml += 'PE'
                oiHtml += '</a>'
                if (trendingStocks[rowId]['LTP'] < strikes[2]['STRIKE']) {
                    oiHtml += '<a data-price="' + strikes[2]['STRIKE'] + '" data-name="' + name + '" class=" bg-secondary-color create-alerts" style="font-size:xx-small;margin-left:.1rem;">A</a>'
                }

                oiHtml += '</div>'



                trendingStocks[rowId]['STRIKE_ATM'] = strikes[2]['STRIKE'] + oiHtml
                trendingStocks[rowId]['STRIKE_ATM_PE'] = strikes[2]['CHG_OI_PE']
            }

            if (strikes[3]) {
                trendingStocks[rowId]['STRIKE_UPPER_ONE_CE'] = strikes[3]['CHG_OI_CE']

                oiHtml = ''
                oiHtml += '<div style="display:flex;">'
                oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[3].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[3].CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;">'
                oiHtml += 'CE'
                oiHtml += '</a>'
                oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[3].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[3].PE.instrument_token) + '" target="_blank" style="font-size:xx-small;">'
                oiHtml += 'PE'
                oiHtml += '</a>'
                if (trendingStocks[rowId]['LTP'] < strikes[3]['STRIKE']) {
                    oiHtml += '<a data-price="' + strikes[3]['STRIKE'] + '" data-name="' + name + '" class=" bg-secondary-color create-alerts" style="font-size:xx-small;margin-left:.1rem;">A</a>'
                }

                oiHtml += '</div>'



                trendingStocks[rowId]['STRIKE_UPPER_ONE'] = strikes[3]['STRIKE'] + oiHtml
                trendingStocks[rowId]['STRIKE_UPPER_ONE_PE'] = strikes[3]['CHG_OI_PE']
            }

            if (strikes[4]) {
                trendingStocks[rowId]['STRIKE_UPPER_TWO_CE'] = strikes[4]['CHG_OI_CE']

                oiHtml = ''
                oiHtml += '<div style="display:flex;">'
                oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[4].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[4].CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;">'
                oiHtml += 'CE'
                oiHtml += '</a>'
                oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[4].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[4].PE.instrument_token) + '" target="_blank" style="font-size:xx-small;">'
                oiHtml += 'PE'
                oiHtml += '</a>'

                if (trendingStocks[rowId]['LTP'] < strikes[4]['STRIKE']) {
                    oiHtml += '<a data-price="' + strikes[4]['STRIKE'] + '" data-name="' + name + '" class=" bg-secondary-color create-alerts" style="font-size:xx-small;margin-left:.1rem;">A</a>'
                }

                oiHtml += '</div>'


                trendingStocks[rowId]['STRIKE_UPPER_TWO'] = strikes[4]['STRIKE'] + oiHtml
                trendingStocks[rowId]['STRIKE_UPPER_TWO_PE'] = strikes[4]['CHG_OI_PE']
            }

            let last = quote[quote.length - 1];
            trendingStocks[rowId]['VOLUME'] = last.volume

            let info = infoMap[name]
            trendingStocks[rowId]['LTP'] = info['currentPrice']

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
    jQ("#processing-trend").html("Done...");
}

async function showTrendingOI(instrument) {
    let strikToShow = 2
    let strikeData = []
    let selectedStrike = []
    let currentTime = moment().format("DD-MM-YYYY")
    let currentPrice = infoMap[instrument]['currentPrice']
    let info;
    if (instrument == "NIFTY" || instrument == "NIFTY 50") {
        info = infoMap["NIFTY 50"]
        instrument = "NIFTY"
    } else if (instrument == "BANKNIFTY" || instrument == "NIFTY BANK") {
        info = infoMap["NIFTY BANK"]
        instrument = "BANKNIFTY"
    } else if (instrument == "MIDCPNIFTY" || instrument == "NIFTY MID SELECT") {
        info = infoMap["NIFTY MID SELECT"]
        instrument = "MIDCPNIFTY"
    } else {
        info = infoMap[instrument]
    }

    if (instrument.includes("NIFTY")) {
        strikToShow = 3
    }

    let atmStrike = 0;
    jQ.each(OPTION_STRIKE_LIST, function (index, item) {
        let date = moment(item.expiry, 'DD-MM-YYYY').format("DD-MM-YYYY")
        if (item.name == instrument && date >= currentTime) {
            selectedStrike.push(item)
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
            strikeData.push(obj)
        }
    }
    strikeData.sort(function (a, b) { return parseFloat(a.STRIKE) - parseFloat(b.STRIKE) })
    let tableData = await showOITrendingDetails(strikeData, selectedStrike)
    return tableData

}

async function showOITrendingDetails(strikeData, selectedStrike) {
    let strikeMap = {}
    for (let i = 0; i < strikeData.length; i++) {
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
            let prevDataCE = await getHistoricalDataUsingPromise(CE.instrument_token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, HISTORICAL_DATA_INTERVAL);
            let currDataCE = await getHistoricalDataUsingPromise(CE.instrument_token, CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);

            let prevDataPE = await getHistoricalDataUsingPromise(PE.instrument_token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, HISTORICAL_DATA_INTERVAL);
            let currDataPE = await getHistoricalDataUsingPromise(PE.instrument_token, CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
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
    }

    let tableData = []
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
                currDataPE = currDataPE
            }

            let OI_CE = currDataCE[currDataCE.length - 1][6]
            let OI_PE = currDataPE[currDataPE.length - 1][6]

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

            obj['currDataCE'] = currDataCE
            obj['currDataPE'] = currDataPE

            obj['prevDataCE'] = prevDataCE
            obj['prevDataPE'] = prevDataPE

            tableData.push(obj)
        } catch (err) {
            console.log("Error while fetching strike : " + index)
        }

    });

    tableData.sort(function (a, b) { return parseFloat(a.STRIKE) - parseFloat(b.STRIKE) })
    return tableData
}

function updateTrendingTable(rowId) {
    jQ('#trending-stock-list-table').DataTable().row(rowId).data(trendingStocks[rowId]).draw(false);
}


jQ(document).on("click", ".create-alerts", function () {
    let name = jQ(this).attr("data-name");
    let price = jQ(this).attr("data-price");
    lhs_tradingsymbol = name

    let lhs_exchange = "NSE"
    if (lhs_tradingsymbol.includes("NIFTY")) {
        lhs_exchange = "INDICES"
    }

    createAlert(name + "-" + 'PRICE_ALERT', lhs_tradingsymbol, price, ">=", lhs_exchange)
});


function createAlert(name, lhs_tradingsymbol, rhs_constant, operator, lhs_exchange) {
    jQ.ajaxSetup({
        headers: {
            'Authorization': `enctoken ${getCookie('enctoken')}`
        }
    });
    return jQ.ajax({
        url: BASE_URL + `/oms/alerts`,
        type: 'POST',
        data: {
            name: name,
            lhs_exchange: lhs_exchange,
            lhs_tradingsymbol: lhs_tradingsymbol,
            lhs_attribute: "LastTradedPrice",
            operator: operator,
            rhs_type: "constant",
            type: "simple",
            rhs_constant: rhs_constant

        }
    });
}