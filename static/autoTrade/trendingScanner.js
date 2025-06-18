jQ(document).on("click", "#show-trending-intruments", function () {
    showTrendingStocks();
})


let trendingStocks = []
async function showTrendingStocks() {
    trendingStocks = []
    let html = ''

    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table  class="" id="trending-stock-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>SYMBOL</th>'
    html += '<th>CH%</th>'
    html += '<th>MOVED</th>'
    html += '<th>TREND</th>'
    html += '<th>OHL</th>'
    html += '<th>B %</th>'
    html += '<th>S %</th>'
    html += '<th>VOLUME</th>'
    html += '<th>LTP</th>'
    html += '<th>OI</th>'
    html += '<th>ACTIONS</th>'
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

    let validIntruments = JSON.parse(localStorage.getItem("VALID_INSTRUMENTS"));
    let scripts = []
    jQ.each(validIntruments, function (index, item) {
        scripts.push(item)
    })

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

        obj['OHL_TREND'] = ''
        obj['OI_TREND'] = ''
        obj['VOLUME'] = ''
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
    }

    if (scripts.length > 0) {
        generateTrendingStockTable(trendingStocks)

    }
}

jQ(document).on("click", "#add-volume", function (e) {
    fillVolume()
});


async function fillVolume() {
    let temp = trendingStocks
    let count = temp.length;
    for (let i = 0; i < temp.length; i++) {
        jQ("#processing-trend").html("Processing.... " + i + "/" + count);
        let data = await getHistoricalDataUsingPromise(instrumentTokens[temp[i].TRADINGSYMBOL], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
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
        let last = quote[quote.length - 1];
        trendingStocks[i]['VOLUME'] = last.volume
        await callSleepForAWhile(1000)
    }
    jQ("#processing-trend").html("Done..")
    generateTrendingStockTable(trendingStocks)
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
        "order": [[7, "desc"]],
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
            { "data": "PRICE_MOVED" },
            { "data": "TREND" },
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
                        html += '<span class="badge bg-success">' + + parseFloat(data[0]).toFixed(2) + '</span>'
                    }
                    return html
                }
            },

            {
                "data": "OHL_TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data) {
                        html += '<span class="badge bg-danger">' + + parseFloat(data[1]).toFixed(2) + '</span>'
                    }
                    return html
                }
            },
            { "data": "VOLUME" },
            { "data": "LTP" },

            { "data": "OI_TREND" },

            {
                "data": '',
                render: function (data, type, row, meta) {
                    let html = '';
                    html += '<span  data-row-id="' + meta.row + '" data-name="' + row['TRADINGSYMBOL'] + '"  class="badge bg-primary  ms-1 analyse-instrument" style="margin-right:.5rem;">';
                    html += "Check"
                    html += '</span>'
                    html += '<span data-price="' + row['LTP'] + '" data-index="' + 0 + '" data-trend="' + row['TREND'] + '" data-name="' + row['TRADINGSYMBOL'] + '" class="badge bg-info show-chart">'
                    html += 'Chart'
                    html += '</span>'
                    html += '<span data-name="' + row['TRADINGSYMBOL'] + '" class="show-option-change badge bg-warning"> '
                    html += 'OC'
                    html += '</span>'
                    return html;
                }
            }
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
            jQ(".dt-buttons").append('<button class="dt-button" type="button" id="add-volume"><span>VOLUME</span></button>')
  
            jQ(".dt-buttons").append('<button data-trend="all" class="dt-button trend-filter" type="button"><span>ALL(' + allCount + ')</span></button>')
            jQ(".dt-buttons").append('<button data-trend="bso" class="dt-button trend-filter" type="button"><span>BSO (' + bsoCount + ')</span></button>')
            jQ(".dt-buttons").append('<button data-trend="aso" class="dt-button trend-filter" type="button"><span>ASO(' + asoCount + ')</span></button>')
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
    let name = jQ(this).attr("data-name");
    var rowId = jQ(this).attr("data-row-id");
    var rowData = trendingStocks[rowId]
    jQ("#processing-trend").html("Processing.... ");
    callAnalyseTrend(name, rowId, rowData)
});

async function callAnalyseTrend(name, rowId, rowData) {

    await savePreviousStockQuote(name, instrumentTokens[name])
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

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
        let className = 'bg-info'
        if (item.ATM_STRIKE) {
            className = 'bg-primary'
        }
        oiHtml += '<span class="badge bg-danger">' + item.CHG_OI_CE + '</span>'
        oiHtml += '<span class="badge ' + className + '">' + item.STRIKE + '</span>'
        oiHtml += '<span class="badge bg-success">' + item.CHG_OI_PE + '</span>'
        oiHtml += '<span>'
        oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", item.CE.tradingsymbol).replaceAll("##TOKEN##", item.CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;display:block;">'
        oiHtml += item.CE.tradingsymbol
        oiHtml += '</a>'
        oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", item.PE.tradingsymbol).replaceAll("##TOKEN##", item.PE.instrument_token) + '" target="_blank" style="font-size:xx-small;display:block;">'
        oiHtml += item.PE.tradingsymbol
        oiHtml += '</a>'
        oiHtml += '</span>'
        oiHtml += '</div>'
    });
    trendingStocks[rowId]['OI_TREND'] = oiHtml;

    let last = quote[quote.length - 1];
    /*trendingStocks[rowId]['VOLUME'] = last.volume*/

    updateTrendingTable(rowId)
    jQ("#processing-trend").html("Done...");
}

async function showTrendingOI(instrument) {
    let strikToShow = 2
    let strikeData = []
    let selectedStrike = []
    let currentTime = moment().format("DD-MM-YYYY")
    let currentPrice = infoMap[instrument]['currentPrice']
    let info;
    if (instrument == "NIFTY") {
        info = infoMap["NIFTY 50"]
    } else if (instrument == "BANKNIFTY") {
        info = infoMap["NIFTY BANK"]
    } else if (instrument == "MIDCPNIFTY") {
        info = infoMap["NIFTY MID SELECT"]
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

    selectedStrike.sort(function (a, b) { return a.strike - b.strike })
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
    });
    return tableData
}

function updateTrendingTable(rowId) {
    jQ('#trending-stock-list-table').DataTable().row(rowId).data(trendingStocks[rowId]).draw(false);
}
