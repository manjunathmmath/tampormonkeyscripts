jQ(document).on("click", ".show-all-stock-charts", function (e) {
    e.preventDefault();
    let type = jQ(this).attr("data-type");
    showAllInChart(type)
});

async function showAllInChart(type) {
    let html = ''
    html += '<div class="row" id="all-chart-container">'
    let count = 0;
    for (let i = 0; i < FO_LIST.length; i++) {
        let info = infoMap[FO_LIST[i]]
        let trends = ''
        let isTrending = false;
        if (info['trends'].length > 0) {
            if (jQ.inArray("ASO", info['trends']) != -1) {
                isTrending = true;
                trends = '<span class="trend-type badge bg-success">' + info['trends'].join(",") + '</span>'
            }

            if (jQ.inArray("BSO", info['trends']) != -1) {
                isTrending = true;
                trends = '<span class="trend-type badge bg-danger">' + info['trends'].join(",") + '</span>'
            }
        }
        if (isTrending) {
            html += '<div class="col-md-4">'
            html += '<h5 style="text-align:center;">' + FO_LIST[i] + " " + trends + '</h5>'
            html += '<div  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded" id="all-in-one-chart-' + FO_LIST[i].replaceAll(" ", "-") + '-' + type.replaceAll(" ", "-") + '">'
            html += '</div>'
            html += '</div>'
            count++;

            if (count % 3 == 0) {
                html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
            }
        }

    }
    html += '</div>'

    let tempName = type.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    tempName += 'allinone'

    let title = ''

    title += '<div class="row">'
    title += '<div class="col-md-4">'
    title += type + '<span class="pop-title-extra"></span>'
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
            let quote = []
            jQ.each(data.data.candles, function (index, item) {
                let map = {}
                map['date'] = moment(item[0]).format("HH:mm:ss")
                map.open = item[1]
                map.high = item[2]
                map.low = item[3]
                map.close = item[4]
                map.volume = item[5]
                quote.push(map);
            });

            showChartAllInOne(quote, FO_LIST[i], type)
            count++;
            if (count % 3 == 0) {
                await callSleepForAWhile(5000)
            }
        }
    }
    jQ("." + divClass).on("close.popupwindow", function () {
        clearInterval(window['refreshChart' + tempName])
    });

}

jQ(document).on("click", ".all-stock-chart-refresh", function () {
    let name = jQ(this).attr("data-name");
    let type = jQ(this).attr("data-type");
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    showOnlyAllInCharts(type, tempName)
});


async function showOnlyAllInCharts(type, tempName) {
    let count = 0;
    clearInterval(window['refreshChart' + tempName])
    for (let i = 0; i < FO_LIST.length; i++) {
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
            let quote = []
            jQ.each(data.data.candles, function (index, item) {
                let map = {}
                map['date'] = moment(item[0]).format("HH:mm:ss")
                map.open = item[1]
                map.high = item[2]
                map.low = item[3]
                map.close = item[4]
                map.volume = item[5]
                quote.push(map);
            });

            showChartAllInOne(quote, FO_LIST[i], type)
            count++;
            if (count % 3 == 0) {
                await callSleepForAWhile(5000)
            }
        }
    }
    jQ("#last-refresh-time-" + tempName).html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
    startRefreshChartAllInOne(tempName)
}

function startRefreshChartAllInOne(name) {
    var display = jQ('#refresh-timer-' + name);
    startTimerChartsAllInOne(600, display, name);
};

function startTimerChartsAllInOne(duration, display, name) {
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


function showChartAllInOne(quote, name, type) {
    let data = getStrikeDetails(instrumentsMap[name], name);
    let chartId = 'all-in-one-chart-' + name.replaceAll(" ", "-") + '-' + type.replaceAll(" ", "-");

    let categoryList = []
    let dateIndex = 0
    jQ.each(quote, function (index, item) {
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