jQ(document).on("click", ".show-all-in-one", function (e) {
    e.preventDefault();
    let type = jQ(this).attr("data-type");
    showAllInChart(type)
});

async function showAllInChart(type) {
    let allObject = {}
    if (type == "NIFTY 50") {
        allObject = NIFTY_50_WEIGHT
    } else if (type == "NIFTY BANK") {
        allObject = NIFTY_BANK_WEIGHT
    } else if (type == "INDICES") {
        allObject = INDICES_WEIGHT
    }

    let html = ''
    html += '<div class="row">'

    let d = new Date()
    let hours = d.getHours()
    let minutes = d.getMinutes() / 100

    let dataList = [];
    let count = 0;
    for (var key of Object.keys(allObject)) {
        html += '<div class="col-md-4">'
        html += '<h5 style="text-align:center;">' + key + ' (' + allObject[key] + ')</h5>'
        html += '<div class="chart-max-wh" id="all-in-one-chart-' + key.replaceAll(" ", "-") + '-' + type.replaceAll(" ", "-") + '">'
        html += '</div>'
        html += '</div>'
        count++;

        if (count % 3 == 0) {
            html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
        }

        let preData = {};
        if (hours == 9 && minutes < 15) {
            preData = await getHistoricalDataAwait(instrumentTokens[key], PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, HISTORICAL_DATA_INTERVAL);
        }


        let data = await getHistoricalDataUsingPromise(instrumentTokens[key], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);

        let quote = []
        jQ.each(data.data.candles, function (index, item) {
            let map = {}
            map['date'] = item[0]
            map.open = item[1]
            map.high = item[2]
            map.low = item[3]
            map.close = item[4]
            map.volume = item[5]
            quote.push(map);
        });

        if (quote.length == 0) {
            jQ.each(preData.data.candles, function (index, item) {
                let map = {}
                map['date'] = item[0]
                map.open = item[1]
                map.high = item[2]
                map.low = item[3]
                map.close = item[4]
                map.volume = item[5]
                quote.push(map);
            });

            let map = {}
            map['date'] = moment().format("YYYY-MM-DD HH:mm:ss")
            map.open = instrumentsMap[key]['price']
            map.high = instrumentsMap[key]['price']
            map.low = instrumentsMap[key]['price']
            map.close = instrumentsMap[key]['price']
            map.volume = 0
            quote.push(map);
        }

        await callSleepForAWhile(1000)
        let map = {}
        map['instrument'] = key;
        map['quote'] = quote;
        map['weight'] = allObject[key];
        dataList.push(map);

    }
    html += '</div>'

    let tempName = type.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    tempName += 'allinone'

    let title = ''

    title += '<div class="row">'
    title += '<div class="col-md-4">'
    title += type + '<span class="pop-title-extra chart-reset"> WEIGHTAGE</span>'
    title += '</div>'
    title += '<div class="col-md-2 pop-title-extra">'
    title += '<a  data-type="' + type + '" data-name="' + tempName + '"  id="start-auto-refresh-' + tempName + '" class="all-in-one-chart-refresh">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
    title += '</div>'
    title += '<div class="col-md-2 pop-title-extra">'
    title += '<span style="margin-left:.5rem;" id="refresh-timer-' + tempName + '">00:00</span>'
    title += '</div>'
    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span id="last-refresh-time-' + tempName + '">Last @ 00:00:00</span>'
    title += '</div>'
    title += '</div>'

    showPopUpWindow(tempName, html, type + " : WEIGHTAGE");
    let divId = "pop-up-window-" + tempName;
    jQ("#" + divId).PopupWindow("setSize", {
        height: 650,
        width: 1050,
        animationTime: 500
    });

    var divClass = "popup-custom-style-" + tempName;
    jQ("." + divClass).find(".popupwindow_titlebar_text").html(title);

    for (let i = 0; i < dataList.length; i++) {
        console.log(dataList[i])
        showChartAllInOne(dataList[i].quote, dataList[i].instrument, type);
        await callSleepForAWhile(1000)
    }

    jQ("." + divClass).on("close.popupwindow", function () {
        clearInterval(window['refreshChart' + tempName])
    });

}

jQ(document).on("click", ".all-in-one-chart-refresh", function () {
    let name = jQ(this).attr("data-name");
    let type = jQ(this).attr("data-type");
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    showOnlyAllInCharts(type, tempName)
});


async function showOnlyAllInCharts(type, tempName) {
    clearInterval(window['refreshChart' + tempName])
    let allObject = {}
    if (type == "NIFTY 50") {
        allObject = NIFTY_50_WEIGHT
    } else if (type == "NIFTY BANK") {
        allObject = NIFTY_BANK_WEIGHT
    } else if (type == "INDICES") {
        allObject = INDICES_WEIGHT
    }

    let d = new Date()
    let hours = d.getHours()
    let minutes = d.getMinutes() / 100

    let dataList = [];
    for (var key of Object.keys(allObject)) {
        let preData = {};
        if (hours == 9 && minutes < 15) {
            preData = await getHistoricalDataAwait(instrumentTokens[key], PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, HISTORICAL_DATA_INTERVAL);
        }
        let data = await getHistoricalDataUsingPromise(instrumentTokens[key], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
        let quote = []
        jQ.each(data.data.candles, function (index, item) {
            let map = {}
            map['date'] = item[0]
            map.open = item[1]
            map.high = item[2]
            map.low = item[3]
            map.close = item[4]
            map.volume = item[5]
            quote.push(map);
        });

        if (quote.length == 0) {
            jQ.each(preData.data.candles, function (index, item) {
                let map = {}
                map['date'] = item[0]
                map.open = item[1]
                map.high = item[2]
                map.low = item[3]
                map.close = item[4]
                map.volume = item[5]
                quote.push(map);
            });

            let map = {}
            map['date'] = moment().format("YYYY-MM-DD HH:mm:ss")
            map.open = instrumentsMap[key]['price']
            map.high = instrumentsMap[key]['price']
            map.low = instrumentsMap[key]['price']
            map.close = instrumentsMap[key]['price']
            map.volume = 0
            quote.push(map);
        }

        await callSleepForAWhile(1000)
        let map = {}
        map['instrument'] = key;
        map['quote'] = quote;
        map['weight'] = allObject[key];
        dataList.push(map);
    }

    for (let i = 0; i < dataList.length; i++) {
        console.log(dataList[i])
        showChartAllInOne(dataList[i].quote, dataList[i].instrument, type);
        await callSleepForAWhile(1000)
    }

    jQ("#last-refresh-time-" + tempName).html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
    startRefreshChartAllInOne(tempName)

}

function startRefreshChartAllInOne(name) {
    var display = jQ('#refresh-timer-' + name);
    startTimerChartsAllInOne(REFRESH_TIME, display, name);
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
    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];

    var vix = getVixRange(parseFloat(instrumentsMap[name].prevPrice), parseFloat(vixQuote[4]))

    var vixLowerRange = 0;
    var vixUpperRange = 0;
    var vixDDRange = 0;

    vixLowerRange = parseFloat(vix.vixDDLower)
    vixUpperRange = parseFloat(vix.vixDDUpper)
    vixDDRange = parseFloat(vix.vixDDRange)

    let candleStickData = []
    let volumeSeriesData = []
    jQ.each(quote, function (index, item) {
        let map = {}
        map.time = moment(item.date).utcOffset(0, true).valueOf() / 1000
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
        candleStickData.push(map)
        if (item.volume > 0) {
            let vol = {}
            vol.time = moment(item.date).utcOffset(0, true).valueOf() / 1000
            vol.value = item.volume
            vol.color = '#26a69a'
            if (item.close < item.open) {
                vol.color = '#ef5350'
            }
            volumeSeriesData.push(vol);
        }

    });

    const lineWidth = 1;
    const lineStyle = 0;

    const vixLowerRangeLine = {
        price: vixLowerRange,
        color: '#8be73a',
        lineWidth: lineWidth,
        lineStyle: lineStyle,
        axisLabelVisible: true,
        title: 'Vix lower range',
    };

    const vixUpperRangeLine = {
        price: vixUpperRange,
        color: '#e7543a',
        lineWidth: lineWidth,
        lineStyle: lineStyle,
        axisLabelVisible: true,
        title: 'Vix upper range',
    };

    const bstrikeTwoLine = {
        price: data.bstrikeTwo,
        color: '#9f3ae7',
        lineWidth: lineWidth,
        lineStyle: lineStyle,
        axisLabelVisible: true,
        title: 'BST',
    };

    const ustrikeTwoLine = {
        price: data.ustrikeTwo,
        color: '#9f3ae7',
        lineWidth: lineWidth,
        lineStyle: lineStyle,
        axisLabelVisible: true,
        title: 'AST',
    };

    const bstrikeOneLine = {
        price: data.bstrikeOne,
        color: '#9f3ae7',
        lineWidth: lineWidth,
        lineStyle: lineStyle,
        axisLabelVisible: true,
        title: 'BSO',
    };

    const ustrikeOneLine = {
        price: data.ustrikeOne,
        color: '#9f3ae7',
        lineWidth: lineWidth,
        lineStyle: lineStyle,
        axisLabelVisible: true,
        title: 'ASO',
    };

    jQ("#" + chartId).html('');
    const chart = LightweightCharts.createChart(
        document.getElementById(chartId), {
        timeScale: {
            timeVisible: true,
        },
        layout: {
            background: { color: "#222" },
            textColor: "#C3BCDB",
        },
        grid: {
            vertLines: { color: "#222" },
            horzLines: { color: "#222" },
        },
        autosiz: true,
        rightPriceScale: {
            visible: false,
        },
        leftPriceScale: {
            visible: true,
        },
    }
    );

    chart.priceScale().applyOptions({
        borderColor: "#71649C",
    });

    chart.timeScale().applyOptions({
        borderColor: "#71649C",
    });

    const currentLocale = window.navigator.languages[0];
    const myPriceFormatter = Intl.NumberFormat(currentLocale, {
        style: "currency",
        currency: "INR",
    }).format;

    chart.applyOptions({
        localization: {
            priceFormatter: myPriceFormatter,
        },
    });




    const mainSeries = chart.addSeries(LightweightCharts.CandlestickSeries);
    mainSeries.setData(candleStickData);
    mainSeries.createPriceLine(vixLowerRangeLine);
    mainSeries.createPriceLine(vixUpperRangeLine);
    mainSeries.createPriceLine(ustrikeOneLine);
    mainSeries.createPriceLine(ustrikeTwoLine);
    mainSeries.createPriceLine(bstrikeOneLine);
    mainSeries.createPriceLine(bstrikeTwoLine);

    mainSeries.applyOptions({
        lastValueVisible: false,
        priceLineVisible: false,
    });

    if (volumeSeriesData.length > 0 && SHOW_VOLUME_ON_CHART) {
        const volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
            color: '#26a69a',
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: '',
            scaleMargins: {
                top: 0.3,
                bottom: 0,
            },
        });

        volumeSeries.priceScale().applyOptions({
            scaleMargins: {
                top: 0.3,
                bottom: 0,
            },
        });
        volumeSeries.setData(volumeSeriesData);
    }

    chart.timeScale().fitContent();
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