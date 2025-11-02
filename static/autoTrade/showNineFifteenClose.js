
jQ(document).on("click", "#show-nine-fifteen-close", function () {
    showNineFifteenClose();
})


function showNineFifteenClose() {
    let html = ''

    html += '<div class="row">'
    html += '<div class="col-md-5">'
    html += '</div>'
    html += '<div class="col-md-2">'
    html += '<select id="nine-fifteen-instruments" class="form-control form-control-sm">'
    html += '</select>'
    html += '</div>'


    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table  class="" id="nine-fifteen-close-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>SYMBOL</th>'
    html += '<th>TRENDS</th>'
    html += '<th>OPEN</th>'
    html += '<th>HIGH</th>'
    html += '<th>LOW</th>'
    html += '<th>CLOSE</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'

    html += '</tbody>'
    html += '</table>'
    html += '</div>'
    html += '</div>'

    html += '<div id="chart-container-historical-chart">'
    html += '</div>'

    

    let title = ''
    title += '<div class="row">'
    title += '<div class="col-md-2">'
    title += '9:15 CLOSE'
    title += '</div>'
    title += '</div>'

    showPopUpWindow('nine-fifteen-close', html, "9:15 Close", 950, 550);
    var divId = "popup-custom-style-nine-fifteen-close";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    fillNineFifteenInstruments('')
}


function fillNineFifteenInstruments(name) {
    var select = jQ("#nine-fifteen-instruments");
    var htmlMarkup = "";
    htmlMarkup += '<option value="">Choose</option>'
    let EXTRA_LIST = FO_LIST
    EXTRA_LIST.push("NIFTY 50")
    EXTRA_LIST.push("NIFTY BANK")
    EXTRA_LIST.push("NIFTY MID SELECT")
    EXTRA_LIST.push("NIFTY FIN SERVICE")
    EXTRA_LIST.push("SENSEX")
    EXTRA_LIST.push("BANKEX")
    jQ.each(EXTRA_LIST, function (index, item) {
        let selected = ''
        if (name) {
            if (item == name) {
                selected = 'selected'
            }
        } else {
            if (item == "NIFTY 50") {
                selected = 'selected'
            }
        }
        htmlMarkup += '<option ' + selected + ' value="' + item + '">' + item + '</option>'
    });
    select.html(htmlMarkup);
    jQ("#nine-fifteen-instruments").trigger("change")
}

jQ(document).on("change", "#nine-fifteen-instruments", function (e) {
    jQ("#predition-result").html("")
    let instrument = jQ("#nine-fifteen-instruments option:selected").val()
    showNineFifteenCloseHistory(instrument)
});


async function showNineFifteenCloseHistory(name) {
    let data = await getHistoricalDataUsingPromise(instrumentTokens[name], moment(CURRENT_DAY).add(-20, 'days').format("YYYY-MM-DD"), CURRENT_DAY, '5minute');
    let dayData = await getHistoricalDataUsingPromise(instrumentTokens[name], moment(CURRENT_DAY).add(-20, 'days').format("YYYY-MM-DD"), CURRENT_DAY, 'day');

    let candles = []
    jQ.each(data.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("YYYY-MM-DD")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map['time'] = moment(item[0]).format("HH:mm")
        candles.push(map);
    });

    let dayCandles = []
    jQ.each(dayData.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("YYYY-MM-DD")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        dayCandles.push(map);
    });

    console.log(dayCandles)

    let dataList = [];

    jQ.each(candles, function (index, item) {
        if (item.time == "09:15") {
            let data = {}
            data['date'] = item.date;
            let close = item.close
            let high = item.high
            let low = item.low
            let open = item.open

            let obj = {}
            obj['price'] = open
            let strikeData = getStrikeDetails(obj, name);
            let asoPrice = 0;
            let bsoPrice = 0;
            asoPrice = parseFloat(strikeData['ustrikeOne']);
            bsoPrice = parseFloat(strikeData['bstrikeOne']);

            let trend = "NA"
            if (close > asoPrice) {
                trend = '<span class="badge bg-success">ASO</span>'
            } else if (close < bsoPrice) {
                trend = '<span class="badge bg-danger">BSO</span>'
            } else if (close < asoPrice && close > bsoPrice) {
                trend = '<span class="badge bg-warning">B/W</span>'
            }

            let dayCandle = {}
            jQ.each(dayCandles, function (dindex, ditem) {
                if (ditem.date == item.date) {
                    dayCandle = ditem;
                }
            })


            let dayCloseHtml = ''
            if (dayCandle.close > dayCandle.open) {
                dayCloseHtml += ' <span class="badge bg-success">' + dayCandle.close + '</span>'
            } else {
                dayCloseHtml += ' <span class="badge bg-danger">' + dayCandle.close + '</span>'
            }

            data['trend'] = trend;
            data['open'] = dayCandle.open;
            data['close'] = dayCloseHtml;
            data['high'] = dayCandle.high;
            data['low'] = dayCandle.low;
            dataList.push(data)
        }
    });

    console.log(dataList)
    let html = ''
    jQ.each(dataList, function (index, item) {
        html += '<tr>'
        html += '<td>'
        html += '<span data-name="' + name + '" data-date="' + item.date + '" class="show-historical-chart">' + item.date + '</span>'
        html += '</td>'
        html += '<td>'
        html += item.trend
        html += '</td>'
        html += '<td>'
        html += item.open
        html += '</td>'
        html += '<td>'
        html += item.high
        html += '</td>'
        html += '<td>'
        html += item.low
        html += '</td>'
        html += '<td>'
        html += item.close
        html += '</td>'
        html += '</tr>'
    });

    jQ("#nine-fifteen-close-list-table").show();
    jQ("#nine-fifteen-close-list-table tbody").html(html);

    html = ' '
     let chartId = 'chart-' + name.replaceAll(" ", "-").replaceAll("&", "-");
    html += '<div id="' + chartId + '" style="width:100%;" class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '</div>'

    jQ("#chart-container-historical-chart").html(html)
}

jQ(document).on("click", ".show-historical-chart", function (e) {
    e.preventDefault();
    let name = jQ(this).attr("data-name");
    let date = jQ(this).attr("data-date");
    showHistoricalChart(name, date)
});


async function showHistoricalChart(name, date) {

    let data = await getHistoricalDataUsingPromise(instrumentTokens[name], date, date, '5minute');
    let candles = []
    jQ.each(data.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("YYYY-MM-DD HH:mm")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map['time'] = moment(item[0]).format("HH:mm")
        candles.push(map);
    });
    console.log(candles)

    let obj = {}
    obj['price'] = candles[0]['open']
    let strikeData = getStrikeDetails(obj, name);
    let asoPrice = 0;
    let bsoPrice = 0;
    asoPrice = parseFloat(strikeData['ustrikeOne']);
    bsoPrice = parseFloat(strikeData['bstrikeOne']);

    let categoryList = []
    let dateIndex = 0
    let dayHigh = 0
    let dayLow = 0
    jQ.each(candles, function (index, item) {
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


    jQ.each(candles, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
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

    line = {};
    line.color = "#872b19ff";
    line.startvalue = strikeData.ustrikeTwo;
    line.displayvalue = "AST [NO BUYING]" + strikeData.ustrikeTwo;
    lines.push(line);


    line = {};
    line.color = "#d65db1";
    line.startvalue = strikeData.ustrikeOne;
    line.displayvalue = "ASO: " + strikeData.ustrikeOne;
    lines.push(line);


    line = {};
    line.color = "#ff6f91";
    line.startvalue = strikeData.bstrikeOne;
    line.displayvalue = "BSO: " + strikeData.bstrikeOne;
    lines.push(line);


    line = {};
    line.color = "#35dc35ff";
    line.startvalue = strikeData.strikeData;
    line.displayvalue = "BST [NO SELLING]: " + strikeData.strikeData;
    lines.push(line);

    let chartId = 'chart-' + name.replaceAll(" ", "-").replaceAll("&", "-");

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