jQ(document).on("click", ".show-all-stock-charts", function (e) {
    e.preventDefault();
    let type = jQ(this).attr("data-type");
    showAllInChart(type)
});

async function showAllInChart(type) {

    let trades = JSON.parse(localStorage.getItem("TRADES"));
    console.log(trades)

    clearInterval(window['refreshChart' + type])
    let html = ''
    html += '<div class="row" id="all-chart-container">'
    let count = 0;
    for (let i = 0; i < FO_LIST.length; i++) {
        if (jQ.inArray(FO_LIST[i], trades) !== -1) {
            let info = infoMap[FO_LIST[i]]
            let trends = ''
            let isTrending = false;
            if (info['trends'].length > 0) {
                if (jQ.inArray("ASO", info['trends']) != -1) {
                    isTrending = true;
                    trends = '<span id="trend-' + FO_LIST[i].replaceAll(" ", "-").replaceAll("&","-") + '-' + type.replaceAll(" ", "-") + '"></span>'
                }

                if (jQ.inArray("BSO", info['trends']) != -1) {
                    isTrending = true;
                    trends = '<span id="trend-' + FO_LIST[i].replaceAll(" ", "-").replaceAll("&","-") + '-' + type.replaceAll(" ", "-") + '"></span>'
                }
            }
            if (isTrending) {
                let ohlTrend = '<span id="ohl-trend-' + FO_LIST[i].replaceAll(" ", "-").replaceAll("&","-") + '-' + type.replaceAll(" ", "-") + '"></span>'
                html += '<div class="col-md-4">'
                html += '<h5 style="text-align:center;">'
                html += '<a target="_blank" href="https://kite.zerodha.com/markets/ext/option-chain/' + 'NSE' + '/' + FO_LIST[i] + '/' + instrumentTokens[FO_LIST[i]] + '"> '
                if (jQ.inArray(FO_LIST[i], trades) !== -1) {
                    html += '<span class="badge bg-warning" title="Already traded">' + FO_LIST[i] + '</span>'
                } else {
                    html += FO_LIST[i];
                }
                html += '</a>'

                let ohlHtml = ''
                let exchange = "NSE"
                if (FO_LIST[i] == "SENSEX") {
                    exchange = "BSE"
                }
                ohlHtml += '<a target="_blank" href="https://kite.zerodha.com/markets/ext/option-chain/' + exchange + '/' + FO_LIST[i] + '/' + instrumentTokens[FO_LIST[i]] + '"> '
                ohlHtml += 'OC'
                ohlHtml += '</a>'

                html += " " + trends + " " + ohlTrend + " " + ohlHtml
                html += '</h5>'
                html += '<div  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded" id="all-in-one-chart-' + FO_LIST[i].replaceAll(" ", "-").replaceAll("&","-") + '-' + type.replaceAll(" ", "-") + '">'
                html += '</div>'
                html += '</div>'
                count++;

                if (count % 3 == 0) {
                    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
                }
            }

        }
    }
    html += '</div>'

    let tempName = type.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    tempName += 'allinone'

    let title = ''

    title += '<div class="row">'
    title += '<div class="col-md-2">'
    title += type + '<span class="pop-title-extra"></span>'
    title += '</div>'
    title += '<div class="col-md-2">'
    title += 'Trades: <span class="badge bg-success asoTradeCount">0</span>/<span class="badge bg-danger bsoTradeCount">0</span>'
    title += '</div>'
    title += '<div class="col-md-2 pop-title-extra">'
    title += '<a  data-type="' + type + '" data-name="' + tempName + '"  id="start-auto-refresh-' + tempName + '" class="all-stock-chart-refresh">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
    title += '</div>'
    title += '<div class="col-md-2 pop-title-extra">'
    title += '<span style="margin-left:.5rem;" id="refresh-timer-' + tempName + '">00:00</span>'
    title += '</div>'
    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span id="last-refresh-time-' + tempName + '">Last @ 00:00:00</span>'
    title += '</div>'
    title += '</div>'

    showPopUpWindow(tempName, html, type);
    let divId = "pop-up-window-" + tempName;
    jQ("#" + divId).PopupWindow("setSize", {
        width: 1050,
        height: 650,
        animationTime: 500
    });

    var divClass = "popup-custom-style-" + tempName;
    jQ("." + divClass).find(".popupwindow_titlebar_text").html(title);
    count = 0;
    for (let i = 0; i < FO_LIST.length; i++) {
        if (jQ.inArray(FO_LIST[i], trades) !== -1) {

            let info = infoMap[FO_LIST[i]]
            let isTrending = false;
            if (info['trends'].length > 0) {
                if (jQ.inArray("ASO", info['trends']) != -1) {
                    isTrending = true;
                }

                if (jQ.inArray("BSO", info['trends']) != -1) {
                    isTrending = true;
                }
            }
            if (isTrending) {
                let data = await getHistoricalDataUsingPromise(instrumentTokens[FO_LIST[i]], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
                await savePreviousStockQuote(FO_LIST[i], instrumentTokens[FO_LIST[i]])
                let previousQuote = JSON.parse(localStorage.getItem(FO_LIST[i] + "_PREVIOUS_DAY_QUOTE"));
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

                if (quote.length == 0) {
                    let map = {}
                    map['date'] = moment().format("HH:mm:ss")
                    map.open = instrumentsMap[FO_LIST[i]]['price']
                    map.high = instrumentsMap[FO_LIST[i]]['price']
                    map.low = instrumentsMap[FO_LIST[i]]['price']
                    map.close = instrumentsMap[FO_LIST[i]]['price']
                    map.volume = 0
                    quote.push(map);
                }

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

                showChartAllInOne(quote, FO_LIST[i], type, prevQuote)
                count++;
                if (count % 3 == 0) {
                    await callSleepForAWhile(3000)
                }
            }
        }
    }
    jQ("." + divClass).on("close.popupwindow", function () {
        clearInterval(window['refreshChart' + tempName])
    });
    startRefreshChartAllInOne(tempName)

}

jQ(document).on("click", ".all-stock-chart-refresh", function () {

    let name = jQ(this).attr("data-name");
    let type = jQ(this).attr("data-type");
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    clearInterval(window['refreshChart' + tempName])
    showOnlyAllInCharts(type, tempName)
});


async function showOnlyAllInCharts(type, tempName) {
    let count = 0;
    let trades = JSON.parse(localStorage.getItem("TRADES"));
    for (let i = 0; i < FO_LIST.length; i++) {
        if (jQ.inArray(FO_LIST[i], trades) !== -1) {
            let info = infoMap[FO_LIST[i]]
            let isTrending = false;
            if (info['trends'].length > 0) {
                if (jQ.inArray("ASO", info['trends']) != -1) {
                    isTrending = true;
                }

                if (jQ.inArray("BSO", info['trends']) != -1) {
                    isTrending = true;
                }
            }
            if (isTrending) {
                let data = await getHistoricalDataUsingPromise(instrumentTokens[FO_LIST[i]], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
                await savePreviousStockQuote(FO_LIST[i], instrumentTokens[FO_LIST[i]])
                let previousQuote = JSON.parse(localStorage.getItem(FO_LIST[i] + "_PREVIOUS_DAY_QUOTE"));
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

                if (quote.length == 0) {
                    let map = {}
                    map['date'] = moment().format("HH:mm:ss")
                    map.open = instrumentsMap[FO_LIST[i]]['price']
                    map.high = instrumentsMap[FO_LIST[i]]['price']
                    map.low = instrumentsMap[FO_LIST[i]]['price']
                    map.close = instrumentsMap[FO_LIST[i]]['price']
                    map.volume = 0
                    quote.push(map);
                }

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


                showChartAllInOne(quote, FO_LIST[i], type, prevQuote)
                count++;
                if (count % 3 == 0) {
                    await callSleepForAWhile(3000)
                }
            }
        }
    }
    jQ("#last-refresh-time-" + tempName).html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
    startRefreshChartAllInOne(tempName)
}

function savePreviousStockQuote(script, token) {
    return new Promise((resolve, reject) => {
        if (!localStorage.getItem(script + "_PREVIOUS_DAY_QUOTE")) {
            jQ.when(getHistoricalData(token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, HISTORICAL_DATA_INTERVAL)).done(function (res) {
                localStorage.setItem(script + "_PREVIOUS_DAY_QUOTE", JSON.stringify(res));
                resolve();
            })
        } else {
            resolve();
        }
    });
}

function startRefreshChartAllInOne(name) {
    var display = document.querySelector('#refresh-timer-' + name);
    startTimerChartsAllInOne(display, name);
};

function startTimerChartsAllInOne(display, name) {

    window['refreshChart' + name] = setInterval(function () {
        var d = new Date();
        var s = d.getSeconds();
        var m = d.getMinutes();
        var h = d.getHours();
        display.textContent = ("0" + h).substr(-2) + ":" + ("0" + m).substr(-2) + ":" + ("0" + s).substr(-2);
        if (s == 59) {
            jQ("#start-auto-refresh-" + name).trigger("click");
        }
    }, 1000);

}


function showChartAllInOne(quote, name, type, prevQuote) {

    let prevFiveMinutes = moment().subtract(5, "minutes").format("HH:mm")

    let last = {};
    jQ.each(quote, function (index, item) {
        if (prevFiveMinutes == item['time']) {
            last = item
        }
    });

    if (!last) {
        return;
    }

    let dayOpen = parseFloat(instrumentsMap[name]['price']);
    let previousClose = parseFloat(instrumentsMap[name].prevPrice);
    let dayHigh = 0
    let dayLow = 0

    let data = getStrikeDetails(instrumentsMap[name], name);
    let chartId = 'all-in-one-chart-' + name.replaceAll(" ", "-").replaceAll("&","-") + '-' + type.replaceAll(" ", "-");

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

    let ltp = 0;
    let trends = ''
    if (infoMap[name]) {
        ltp = infoMap[name]['currentPrice'];
        trends = infoMap[name]['trends'];
    }

    let res = calculateOHLBuySell(dayOpen, dayHigh, dayLow, ltp, previousClose);
    let ohl = '#ohl-trend-' + name.replaceAll(" ", "-").replaceAll("&","-") + '-' + type.replaceAll(" ", "-")
    let trend = '#trend-' + name.replaceAll(" ", "-").replaceAll("&","-") + '-' + type.replaceAll(" ", "-")
    if (trends.length > 0) {
        if (jQ.inArray("ASO", trends) != -1) {
            jQ(trend).html('<span  class="trend-type badge bg-success">' + trends.join(",") + '</span>')
        }
        if (jQ.inArray("BSO", trends) != -1) {
            jQ(trend).html('<span class="trend-type badge bg-danger">' + trends.join(",") + '</span>');
        }
    }


    let ohlHtml = ''
    if (res[2].includes('Buy')) {
        ohlHtml += '<span class="badge bg-success">' + res[2] + '</span>'
        ohlHtml += '<span class="badge bg-info">' + ' [B:' + parseFloat(res[0]).toFixed(2) + ' S:' + parseFloat(res[1]).toFixed(2) + ']' + '</span>'
    } else {
        ohlHtml += '<span class="badge bg-danger">' + res[2] + '</span>'
        ohlHtml += '<span class="badge bg-info">' + ' [B:' + parseFloat(res[0]).toFixed(2) + ' S:' + parseFloat(res[1]).toFixed(2) + ']' + '</span>'
    }

    let chartMax = '<span data-price="' + ltp + '" data-index="1" data-trend="' + trends.join(",") + '" data-name="' + name + '" class="badge bg-secondary show-chart">c</span>'

    try {
        jQ(ohl).html(ohlHtml)
        jQ(ohl).append(chartMax)
    } catch {
        console.log("Error")
    }

    isVolumePresent = SHOW_VOLUME_ON_CHART

    let asoPrice = 0;
    let bsoPrice = 0;
    let aso = parseFloat(data.ustrikeOne) - parseFloat(instrumentsMap[name]['price']);
    aso = aso / 2
    asoPrice = parseFloat(data.ustrikeOne) - aso;

    let bso = parseFloat(instrumentsMap[name]['price']) - parseFloat(data.bstrikeOne);
    bso = bso / 2
    bsoPrice = parseFloat(data.bstrikeOne) + bso;

    let lines = [];
    let line = {};

    line.color = "#198754";
    line.startvalue = data.ustrikeTwo;
    line.displayvalue = "AST" + data.ustrikeTwo;
    lines.push(line);

    line = {};
    line.color = "#198754";
    line.startvalue = data.ustrikeOne;
    line.displayvalue = "ASO ST-1: " + data.ustrikeOne;
    lines.push(line);


    line = {};
    line.color = "#d65db1";
    line.startvalue = asoPrice;
    line.displayvalue = "ASO: " + asoPrice.toFixed(2);
    lines.push(line);


    line = {};
    line.color = "#ff6f91";
    line.startvalue = bsoPrice;
    line.displayvalue = "BSO: " + bsoPrice.toFixed(2);
    lines.push(line);

    line = {};
    line.color = "#dc3545";
    line.startvalue = data.bstrikeOne;
    line.displayvalue = "BSO ST-1: " + data.bstrikeOne;
    lines.push(line);

    line = {};
    line.color = "#dc3545";
    line.startvalue = data.bstrikeTwo;
    line.displayvalue = "BST: " + data.bstrikeTwo;
    lines.push(line);

    line = {};
    if (parseFloat(instrumentsMap[name]['price']).toFixed(2) > parseFloat(instrumentsMap[name].prevPrice).toFixed(2)) {
        line.color = "#5D8736";
        line.displayvalue = "Open +ve: " + instrumentsMap[name]['price'];
    } else {
        line.color = "#A94A4A";
        line.displayvalue = "Open -ve: " + instrumentsMap[name]['price'];
    }
    line.dashed = 1;
    line.startvalue = instrumentsMap[name]['price'];
    lines.push(line);

    jQ("#" + chartId).html('')
    jQ("#" + chartId).insertFusionCharts({
        type: 'candlestick',
        width: "100%",
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


function getHistoricalDataUsingPromise(code, fromDate, toDate, interval) {
    jQ.ajaxSetup({
        headers: {
            'Authorization': `enctoken ${getCookie('enctoken')}`
        }
    });
    return new Promise((resolve, reject) => {
        jQ.ajax({
            url: BASE_URL + `/oms/instruments/historical/${code}/${interval}?user_id=HY8031&oi=1&from=${fromDate}&to=${toDate}`,
            type: 'GET',
            async: true,
            cache: false,
            success: function (data) {
                resolve(data);
            }
        });
    })
}

function calculateOHLBuySell(o, h, l, ltp, previousClose) {
    let result = "Neutral";
    let open = o;
    let high = h;
    let low = l;
    let ltpd = ltp;
    let highMinusOpen = high - open;
    let openMinuslow = open - low;
    let list = []
    let oh = (highMinusOpen / high) * 100;
    let ol = (openMinuslow / open) * 100;

    list.push(oh);
    list.push(ol);

    if (open == high) {
        result = "Strong Sell(OH)";
        list.push(result);
        return list;
    }
    else if (open == low) {
        result = "Strong Buy(OL)";
        list.push(result);
        return list;
    }
    if (oh >= 0.0 && oh <= 0.85 && ol >= 1.25) {
        result = "Strong Sell(Lower High)";
        list.push(result);
        return list;
    }
    else if (ol >= 0.0 && ol <= 0.85 && oh >= 1.25) {
        result = "Strong Buy(Higher High)";
        list.push(result);
        return list;
    }
    if (ltpd >= open && ltpd >= low) {
        result = "Buy";
        list.push(result);
        return list;
    }
    else if (ltpd <= open && ltpd <= high) {
        result = "Sell";
        list.push(result);
        return list;
    }
    list.push(result);
    return list;
}