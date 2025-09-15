jQ(document).on("click", ".show-chart", function (e) {
    e.preventDefault();
    let name = jQ(this).attr("data-name");
    let trends = jQ(this).attr("data-trend");
    let index = jQ(this).attr("data-index");
    let price = jQ(this).attr("data-price");
    let token = jQ(this).attr("data-token");
    commonShowChart(name, trends, index, price, token)
});

async function commonShowChart(name, trends, index, price, token) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let data = await getHistoricalDataUsingPromise(token, CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
    await savePreviousStockQuote(tempName, token)
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



    let chartId = 'chart-' + tempName.replaceAll(" ", "-").replaceAll("&", "-");
    trends = trends.split(",")
    var html = ''

    html += '<div id="' + chartId + '" style="width:100%;" class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '</div>'

    html += '<div style="width:100%;">'
    html += '<table  id="stock-data-' + tempName + '" class="table table-hover" style="width: 100%;display: none;">'
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

    let title = ''

    title += '<div class="row">'
    title += '<div class="col-md-5">'
    title += name + ' <span class="pop-title-extra" id="current-trend-' + tempName + '"> [' + trends.join(",") + ']</span>'
    title += '</div>'
    title += '<div class="col-md-2 pop-title-extra">'
    title += '<a   data-token="' + token + '" data-price="' + price + '" data-index="' + index + '" data-trend="' + trends.join(",") + '" data-name="' + name + '" id="start-auto-refresh-' + tempName + '" class="chart-refresh">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
    title += '</div>'
    title += '<div class="col-md-2 pop-title-extra">'
    title += '<span style="margin-left:.5rem;" id="refresh-timer-' + tempName + '">00:00</span>'
    title += '</div>'
    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span id="last-refresh-time-' + tempName + '">Last @ 00:00:00</span>'
    title += '</div>'
    title += '</div>'

    showPopUpWindow(tempName, html, name + " : " + trends.join(","), 950, 550);

    var divClass = "popup-custom-style-" + tempName;
    jQ("." + divClass).find(".popupwindow_titlebar_text").html(title);
    setTimeout(function () {
        showChart(quote, name, index, prevQuote);
        showStockData(quote, name, prevQuote)
    }, 1000)
    jQ("." + divClass).on("close.popupwindow", function () {
        clearInterval(window['refreshChart' + tempName])
    });
}

async function showStockData(quote, name, prevQuote) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let stockDataTable = jQ("#stock-data-" + tempName);
    let html = ''
    let count = quote.length
    let newList = []

    let previousClose = 0
    let dayHigh = 0
    let dayLow = 0

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

    let latestHigh = 0
    let latestLow = 0
    jQ.each(quote, function (index, item) {
        let buySide = false;
        let sellSide = false;
        if ((index + 1) < count && index > 0) {
            let current = quote[index]
            let previous = quote[index - 1]
            if (current.close > previous.close && current.volume > previous.volume && current.volume > 50000) {
                buySide = true;
            }

            if (current.close < previous.close && current.volume > previous.volume && current.volume > 50000) {
                sellSide = true;
            }
        }

        let cssClass = ''
        if (buySide) {
            cssClass = 'alert-success'
        }

        if (sellSide) {
            cssClass = 'alert-danger'
        }

        if (item.high > dayHigh) {
            dayHigh = item.high
        }

        if (item.low < dayLow) {
            dayLow = item.low
        }

        item.dayHigh = dayHigh
        item.dayLow = dayLow
        item.previousClose = previousClose
        item.cssClass = cssClass;
        if (index == 0) {
            latestHigh = item.high
            latestLow = item.low
        }

        if (item.high > latestHigh) {
            latestHigh = item.high
        }

        if (item.low < latestLow) {
            latestLow = item.low
        }
        newList.push(item)

    });
    newList.reverse()
    jQ.each(newList, function (index, item) {
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

async function commonShowOnlyChart(name, trends, index, price, token) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    clearInterval(window['refreshChart' + tempName])

    let data = await getHistoricalDataUsingPromise(token, CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
    await savePreviousStockQuote(tempName, token)
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

    showChart(quote, name, index, prevQuote);
    showStockData(quote, name, prevQuote)
    startRefreshChart(tempName);
    jQ("#start-auto-refresh-" + tempName).removeAttr("disabled")
    jQ("#last-refresh-time-" + tempName).html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));

}

jQ(document).on("click", ".chart-refresh", function (e) {
    e.preventDefault();
    var that = jQ(this);
    that.attr("disabled", true)
    let name = jQ(this).attr("data-name");
    let trends = jQ(this).attr("data-trend");
    let index = jQ(this).attr("data-index");
    let price = jQ(this).attr("data-price");
    let token = jQ(this).attr("data-token");
    commonShowOnlyChart(name, trends, index, price, token)
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    var divClass = "popup-custom-style-" + tempName;
})

function startRefreshChart(name) {
    var display = jQ('#refresh-timer-' + name);
    startTimerCharts(REFRESH_TIME, display, name);
};

function startTimerCharts(duration, display, name) {
    if (!duration) {
        duration = 60
    }
    var timer = duration, minutes, seconds;
    window['refreshChart' + name] = setInterval(function () {
        minutes = parseInt(timer / 60, 10);
        seconds = parseInt(timer % 60, 10);

        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;

        display.html(minutes + ":" + seconds);

        if (--timer < 0) {
            jQ("#start-auto-refresh-" + name).trigger("click");
            timer = duration;
        }
    }, 1000);
}

function showChart(quote, name, index, prevQuote) {

    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let chartId = 'chart-' + tempName;

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


    let lines = [];
    let line = {};

    let strikeOne = 50
    let strikeTwo = 50

    let open = quote[0]['open']
     let ustrikeOne = (parseFloat(open) + strikeOne);
    let ustrikeTwo = (ustrikeOne + strikeTwo);
    let bstrikeOne = (parseFloat(open) - strikeOne);
    let bstrikeTwo = (bstrikeOne - strikeTwo);


     line = {};
    line.color = "#872b19ff";
    line.startvalue = ustrikeTwo;
    line.displayvalue = "AST [NO BUYING]" + ustrikeTwo;
    lines.push(line);


    line = {};
    line.color = "#d65db1";
    line.startvalue = ustrikeOne;
    line.displayvalue = "ASO: " + ustrikeOne;
    lines.push(line);


    line = {};
    line.color = "#ff6f91";
    line.startvalue = bstrikeOne;
    line.displayvalue = "BSO: " + bstrikeOne;
    lines.push(line);


    line = {};
    line.color = "#35dc35ff";
    line.startvalue = bstrikeTwo;
    line.displayvalue = "BST [NO SELLING]: " + bstrikeTwo;
    lines.push(line);



    isVolumePresent = false

    jQ("#" + chartId).html('')
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