jQ(document).on("click", "#show-futures", function () {
    showFuturesAnalyserScanner();
})

function showFuturesAnalyserScanner() {
    let html = ''

    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table  class="" id="future-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>INSTRUMENT</th>'
    html += '<th>SYMBOL</th>'
    html += '<th>EXPIRY</th>'
    html += '<th>TOKEN</th>'
    html += '<th>ACTION</th>'
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
    title += 'Futures Analyser'
    title += '</div>'
    title += '</div>'

    showPopUpWindow('futures-analyser', html, "Futures Analyser", 950, 550);
    var divId = "popup-custom-style-futures-analyser";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    generateFutreIntruments();
}



function generateFutreIntruments() {
    jQ("#future-list-table").show();
    jQ('#future-list-table').DataTable({
        "processing": true,
        "order": [[0, "asc"]],
        "pageLength": 50,
        "bPaginate": false,
        "data": futureInstrumentsList,
        "bDestroy": true,
        "scrollX": true,
        "scrollY": "300px",
        "columnDefs": [
            {
                "targets": [],
                "visible": false,
                "searchable": false
            }
        ],
        "columns": [
            { "data": "name" },
            { "data": 'tradingsymbol' },
            { "data": 'expiry' },
            { "data": 'instrument_token' },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    let html = '';
                    html += '<span data-lot-size="' + row.lot_size + '" data-token="' + row.instrument_token + '" data-token="' + row.instrument_token + '" data-name="' + row.name + '" class="badge bg-info show-future-chart">Chart</span>'
                    html += '<span data-lot-size="' + row.lot_size + '" data-name="' + row.name + '" data-tradingsymbol="' + row.tradingsymbol + '" class="badge bg-secondary create-future-alerts">Alert</span>'
                    return html;
                }
            },
        ],
        "fnInitComplete": function (oSettings, json) {
        }
    });
}

jQ(document).on("click", ".create-future-alerts", function () {

    let token = jQ(this).attr("data-token");
    let name = jQ(this).attr("data-name");
    let tradingsymbol = jQ(this).attr("data-tradingsymbol");

    jQ.when(getHistoricalData(token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day')).done(function (prev) {
        jQ.when(getHistoricalData(token, CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL)).done(function (quote) {
            let first = quote.data['candles'][0];
            let prevData = prev.data['candles'][0];

            let strikeDiff = nseFutreStrikeDiff[name];
            strikeDiff = strikeDiff.split(",");
            let strikeOne = parseInt(strikeDiff[0])
            let strikeTwo = parseInt(strikeDiff[1])

            let ustrikeOne = (parseFloat(first[1]) + strikeOne);
            let ustrikeTwo = (ustrikeOne + strikeTwo);
            let bstrikeOne = (parseFloat(first[1]) - strikeOne);
            let bstrikeTwo = (bstrikeOne - strikeTwo);

            let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];

            var vix = getVixRange(parseFloat(prevData[4]), parseFloat(vixQuote[4]))

            var vixLowerRange = 0;
            var vixUpperRange = 0;
            var vixDDRange = 0;

            vixLowerRange = parseFloat(vix.vixDDLower)
            vixUpperRange = parseFloat(vix.vixDDUpper)
            vixDDRange = parseFloat(vix.vixDDRange);

            lhs_tradingsymbol = tradingsymbol

            let lhs_exchange = "NFO"
            if (name == 'CRUDE_OIL_M_FUTURE') {
                lhs_exchange = "MCX"

                /*
                    let aso = ustrikeOne;
                    createAlert(name + "-" + 'ASO', lhs_tradingsymbol, aso, ">=", lhs_exchange)
        
                    let bso = bstrikeOne;
                    createAlert(name + "-" + 'BSO', lhs_tradingsymbol, bso, "<=", lhs_exchange)
                */
            }

            let ast = ustrikeTwo;
            createAlert(name + "-" + 'AST', lhs_tradingsymbol, ast, ">=", lhs_exchange)

            let bst = bstrikeTwo;
            createAlert(name + "-" + 'BST', lhs_tradingsymbol, bst, "<=", lhs_exchange)

            let vixu = vixUpperRange;
            createAlert(name + "-" + 'VIXU', lhs_tradingsymbol, vixu, ">=", lhs_exchange)

            let vixl = vixLowerRange;
            createAlert(name + "-" + 'VIXL', lhs_tradingsymbol, vixl, "<=", lhs_exchange)
        })
    });
});

jQ(document).on("click", ".future-chart-refresh", function () {
    var that = jQ(this);
    that.attr("disabled", true)
    let token = jQ(this).attr("data-token");
    let name = jQ(this).attr("data-name");
    let lotSize = parseInt(jQ(this).attr("data-lot-size"));
    clearInterval(window['refreshFuture' + name])
    showOnlyChartAndTable(token, name, lotSize)
})

function showOnlyChartAndTable(token, name, lotSize) {
    let chartId = 'future-chart-' + token
    let html = ''

    jQ.when(getHistoricalData(token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day')).done(function (pres) {
        jQ.when(getHistoricalData(token, CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL)).done(function (cres) {
            let tempName = name.replaceAll(" ", "-")
            tempName = tempName.replaceAll("&", "-")
            html += '<div id="' + chartId + '" style="width:100%;">'
            html += '</div>';
            html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
            html += '<div class="row">'
            html += '<div class="col-md-12">'
            html += '<table  class="historical-future-data-analyzer" id="historical-future-data-analyzer-list-table-' + tempName + '" style="width: 100%">'
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

            showFuturesChart(cres, name, token, pres)
            let data = [];
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

            generateFutresDataTable(data, tempName, prevData, lotSize)

            futureStartRefreshChart(tempName);
            jQ("#future-last-refresh-time-" + tempName).html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
        });
    });
}

function futureStartRefreshChart(name) {
    var display = jQ('#future-refresh-timer-' + name);
    futureStartTimerCharts(REFRESH_TIME, display, name);
};

function futureStartTimerCharts(duration, display, name) {
    if (!duration) {
        duration = 60
    }
    var timer = duration, minutes, seconds;
    window['refreshFuture' + name] = setInterval(function () {
        minutes = parseInt(timer / 60, 10);
        seconds = parseInt(timer % 60, 10);

        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;

        display.html(minutes + ":" + seconds);

        if (--timer < 0) {
            jQ("#future-start-auto-refresh-" + name).trigger("click");
            timer = duration;
        }
    }, 1000);
}

jQ(document).on("click", ".show-future-chart", function () {
    let token = jQ(this).attr("data-token");
    let name = jQ(this).attr("data-name");
    let lotSize = parseInt(jQ(this).attr("data-lot-size"));
    let chartId = 'future-chart-' + token
    let html = ''
    jQ.when(getHistoricalData(token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day')).done(function (pres) {
        jQ.when(getHistoricalData(token, CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL)).done(function (cres) {
            let tempName = name.replaceAll(" ", "-")
            tempName = tempName.replaceAll("&", "-")
            html += '<div id="' + chartId + '" style="width:100%;">'
            html += '</div>';
            html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
            html += '<div class="row">'
            html += '<div class="col-md-12">'
            html += '<table  class="historical-future-data-analyzer" id="historical-future-data-analyzer-list-table-' + tempName + '" style="width: 100%">'
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


            let title = ''

            title += '<div class="row">'
            title += '<div class="col-md-4">'
            title += name + ' <span class="pop-title-extra"></span>'
            title += '</div>'
            title += '<div class="col-md-2 pop-title-extra">'
            title += '<a   data-lot-size="' + lotSize + '" data-name="' + name + '" data-token="' + token + '" id="future-start-auto-refresh-' + tempName + '" class="future-chart-refresh">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
            title += '</div>'
            title += '<div class="col-md-2 pop-title-extra">'
            title += '<span style="margin-left:.5rem;" id="future-refresh-timer-' + tempName + '">00:00</span>'
            title += '</div>'
            title += '<div class="col-md-3 pop-title-extra">'
            title += '<span id="future-last-refresh-time-' + tempName + '">Last @ 00:00:00</span>'
            title += '</div>'
            title += '</div>'

            showPopUpWindow(name, html, name, 950, 550);
            var divClass = "popup-custom-style-" + tempName;
            jQ("." + divClass).find(".popupwindow_titlebar_text").html(title);

            jQ("." + divClass).on("close.popupwindow", function () {
                clearInterval(window['refreshFuture' + tempName])
            });


            showFuturesChart(cres, name, token, pres)
            let data = [];
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

            generateFutresDataTable(data, tempName, prevData, lotSize)
        });
    });
});

function showFuturesChart(quote, name, token, prev) {

    let first = quote.data['candles'][0];
    let prevData = prev.data['candles'][0];



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

    let chartId = 'future-chart-' + token;
    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];

    var vix = getVixRange(parseFloat(prevData[4]), parseFloat(vixQuote[4]))

    var vixLowerRange = 0;
    var vixUpperRange = 0;
    var vixDDRange = 0;

    vixLowerRange = parseFloat(vix.vixDDLower)
    vixUpperRange = parseFloat(vix.vixDDUpper)
    vixDDRange = parseFloat(vix.vixDDRange);

    let data = []
    jQ.each(quote.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("HH:mm:ss")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        data.push(map);
    });

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

    jQ("#" + chartId).insertFusionCharts({
        type: 'candlestick',
        width: "100%",
        height: "100%",
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
                showVolumeChart: true,
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

function generateFutresDataTable(quote, id, prevQuote, lotSize) {
    lotSize = parseInt(lotSize)
    console.log(lotSize)
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
                "targets": [1, 2, 3, 4],
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
                        let change = parseInt(curr - prev) / lotSize
                        console.log(prev, curr, change)
                        if (curr > prev) {
                            html += '+ ' + change
                        }

                        if (curr < prev) {
                            html += '- ' + Math.abs(change)
                        }

                        if (curr == prev) {
                            html += '=' + change
                        }

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
                    correctedVwap = correctedVwap - 5;
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
                    correctedVwap = correctedVwap - 5;

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
                        correctedVwap = correctedVwap - 5;
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
    correctedVwap = correctedVwap - 5; // price spike adjustment
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