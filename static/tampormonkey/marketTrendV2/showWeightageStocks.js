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

    let dataList = [];
    let count = 0;
    for (var key of Object.keys(allObject)) {
        html += '<div class="col-md-4 ">'
        html += '<h5 style="text-align:center;">' + key + ' ('+ allObject[key]+')</h5>'
        html += '<div  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded" id="all-in-one-chart-' + key.replaceAll(" ", "-")+'-'+type.replaceAll(" ","-") + '">'
        html += '</div>'
        html += '</div>'
        count++;

        if(count%3 == 0){
            html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
        }
        let data = await getHistoricalDataUsingPromise(instrumentTokens[key], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);

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

        
        if(quote.length == 0){
            let map = {}
            map['date'] = moment().format("HH:mm:ss")
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
    title += type + '<span class="pop-title-extra"> WEIGHTAGE</span>'
    title += '</div>'
    title += '<div class="col-md-2 pop-title-extra">'
    title += '<a  data-type="'+type+'" data-name="' + tempName + '"  id="start-auto-refresh-' + tempName + '" class="all-in-one-chart-refresh">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
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
        width: 1050,
        height: 650,
        animationTime: 500
    }); 

    var divClass = "popup-custom-style-" + tempName;
    jQ("." + divClass).find(".popupwindow_titlebar_text").html(title);

    for (let i = 0; i < dataList.length; i++) {
        console.log(dataList[i])
        showChartAllInOne(dataList[i].quote, dataList[i].instrument,type);
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
    
    showOnlyAllInCharts(type,tempName)
});


async function showOnlyAllInCharts(type,tempName){
    clearInterval(window['refreshChart' + tempName])
    let allObject = {}
    if ( type == "NIFTY 50") {
        allObject = NIFTY_50_WEIGHT
    } else if (type == "NIFTY BANK") {
        allObject = NIFTY_BANK_WEIGHT
    } else if (type == "INDICES") {
        allObject = INDICES_WEIGHT
    }

    let dataList = [];
    for (var key of Object.keys(allObject)) {
        let data = await getHistoricalDataUsingPromise(instrumentTokens[key], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
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

        if(quote.length == 0){
            let map = {}
            map['date'] = moment().format("HH:mm:ss")
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
        showChartAllInOne(dataList[i].quote, dataList[i].instrument,type);
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


function showChartAllInOne(quote, name,type) {
    let data = getStrikeDetails(instrumentsMap[name], name);
    let chartId = 'all-in-one-chart-' + name.replaceAll(" ", "-")+'-'+type.replaceAll(" ","-");
    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];

    var vix = getVixRange(parseFloat(instrumentsMap[name].prevPrice), parseFloat(vixQuote[4]))

    var vixLowerRange = 0;
    var vixUpperRange = 0;
    var vixDDRange = 0;

    vixLowerRange = parseFloat(vix.vixDDLower)
    vixUpperRange = parseFloat(vix.vixDDUpper)
    vixDDRange = parseFloat(vix.vixDDRange)

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
    line.startvalue = data.bstrikeTwo;
    line.displayvalue = "BST " + data.bstrikeTwo;
    lines.push(line);

    line = {};
    line.color = "#9f3ae7";
    line.startvalue = data.ustrikeTwo;
    line.displayvalue = "AST " + data.ustrikeTwo;
    lines.push(line);

    line = {};
    line.color = "#9f3ae7";
    line.startvalue = data.bstrikeOne;
    line.displayvalue = "BSO " + data.bstrikeOne;
    lines.push(line);

    line = {};
    line.color = "#9f3ae7";
    line.startvalue = data.ustrikeOne;
    line.displayvalue = "ASO " + data.ustrikeOne;
    lines.push(line);

    line = {};
    if(parseFloat(instrumentsMap[name]['price']).toFixed(2) > parseFloat(instrumentsMap[name].prevPrice).toFixed(2)){
        line.color = "#5D8736";
        line.displayvalue = "Open +ve" + instrumentsMap[name]['price'];
    }else{
        line.color = "#A94A4A";
        line.displayvalue = "Open -ve" + instrumentsMap[name]['price'];
    }
    line.dashed= 1,
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
                showVolumeChart: isVolumePresent
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