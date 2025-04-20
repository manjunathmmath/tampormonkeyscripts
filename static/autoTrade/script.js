const my_css = GM_getResourceText("TOASTIFY_CSS");
const boot_css = GM_getResourceText("BOOTSTRAP_CSS");
const common_css = GM_getResourceText("COMMON_CSS");
const popup_window_css = GM_getResourceText("POPUP_WINDOW_CSS");
const sackbar_css = GM_getResourceText("SACKBAR_CSS");
const datatable_css = GM_getResourceText("DATATABLE_CSS");
const bootstrap_icon_css = GM_getResourceText("BOOTSTRAP_ICON_CSS");

GM_addStyle(my_css);
GM_addStyle(sackbar_css);
GM_addStyle(boot_css);
GM_addStyle(datatable_css);
GM_addStyle(common_css);
GM_addStyle(popup_window_css);
GM_addStyle(bootstrap_icon_css);

window.jQ = jQuery.noConflict(true);
const g_config = new MonkeyConfig({
    title: 'Market Trend Settings',
    menuCommand: true,
    onSave: reloadPage,
    params: {
        previous_day_date: {
            type: 'text',
            default: moment().subtract(1, "days").format("YYYY-MM-DD")
        },
        current_day_date: {
            type: 'text',
            default: moment().format("YYYY-MM-DD")
        },
        margin: {
            type: 'text',
            default: 10000
        },
        refresh_time: {
            type: 'text',
            default: 60
        },
        historical_data_interval: {
            type: 'text',
            default: '3minute'
        },
        stocks_price_moved: {
            type: 'number',
            default: 5
        },
        stock_trend_to_trade: {
            type: 'select',
            choices: ['ASO', 'BSO', 'ALL'],
            values: ['ASO', 'BSO', 'ALL'],
            default: 'ALL'
        },
        enable_sl: {
            type: 'checkbox',
            default: true
        },
        enable_algo_trade: {
            type: 'checkbox',
            default: false
        },
        stock_limit: {
            type: 'number',
            default: 50
        },
        stock_volume: {
            type: 'number',
            default: 50000
        },
        show_volume_on_chart: {
            type: 'checkbox',
            default: false
        },
        order_type: {
            type: 'select',
            choices: ['LIMIT', 'MARKET'],
            values: ['LIMIT', 'MARKET',],
            default: 'MARKET'
        },
        check_volume: {
            type: 'checkbox',
            default: false
        },
    }
});

const VERSION = "v1.0";
const BASE_URL = "https://kite.zerodha.com";
const PREVIOUS_DAY_DATE = g_config.get('previous_day_date');
const CURRENT_DAY = g_config.get('current_day_date');
let date = new Date().toJSON().slice(0, 10);
const BASKET = g_config.get('basket');
const MARGIN = g_config.get('margin');
let weightIndex = []
const HISTORICAL_DATA_INTERVAL = g_config.get('historical_data_interval');
const STOCK_VOLUME = parseInt(g_config.get('stock_volume'));
const SHOW_VOLUME_ON_CHART = g_config.get('show_volume_on_chart');
const ORDER_TYPE = g_config.get('order_type');
const CHECK_VOLume = g_config.get('check_volume');
const STOCK_PRICE_MOVED = g_config.get('stocks_price_moved');
const STOCK_TREND_TO_TRADE = g_config.get('stock_trend_to_trade');
const ENABLE_SL = g_config.get('enable_sl');
const ENABLE_ALGO_TRADE = g_config.get('enable_algo_trade');
const STOCK_LIMIT = g_config.get('stock_limit');
const REFRESH_TIME = g_config.get('refresh_time');

async function callAddToWatchList() {
    for (let i = 0; i < FO_LIST.length; i++) {
        if ((i + 1) <= 100) {
            addToWatchList("NSE", FO_LIST[i], (i + 1), 2)
        } else if ((i + 1) > 100 && (i + 1) <= 200) {
            addToWatchList("NSE", FO_LIST[i], (i + 1), 3)
        } else {
            addToWatchList("NSE", FO_LIST[i], (i + 1), 4)
        }
        await callSleepForAWhile(1000)
    }
}

function addToWatchList(segment, tradingsymbol, weight, watch_id) {
    jQ.ajaxSetup({
        headers: {
            'x-csrftoken': `${getCookie('public_token')}`
        }
    });
    return jQ.ajax({
        url: BASE_URL + `/api/marketwatch/${watch_id}/items`,
        type: 'POST',
        data: {
            segment: segment,
            tradingsymbol: tradingsymbol,
            weight: weight,
            watch_id: watch_id
        }
    });
}

jQ(document).ready(function () {
    setTimeout(function () {
        makeUIChanges();
    }, 2000)

});

jQ(document).on("click", "#start-algo-trade", function (e) {
    e.preventDefault();
    showAutoTrade();
});

function makeUIChanges() {
    var html = '';
    html += '<a href="#" id="add-to-watch-list" style="display:none;">'
    html += 'Add Watchlist'
    html += '</a>'
    jQ('body').first().find(".app-nav").append(html);

    html = '';
    html += '<a href="#" id="start-algo-trade" style="padding:10px;">'
    html += 'Algo'
    html += '</a>'
    jQ('body').first().find(".settings").append(html);
}


jQ(document).on("click", "#add-to-watch-list", function (e) {
    e.preventDefault();
    callAddToWatchList();
});

jQ(document).on("click", "#clean-storage", function (e) {
    e.preventDefault();
    let result = confirm("Are you sure you want to clear the local storage ?");
    if (result === true) {
        clearLocalStorage()
    }
});

function callSleepForAWhile(times) {
    return new Promise((resolve, reject) => {
        setTimeout(function () {
            resolve();
        }, times)
    });
}

let instrumentsMap = {}
let timerInstance = null
let infoMap = {}

async function autoRefreshEachTabs(instance) {
    clearInterval(timerInstance)
    let marketWatchSideBar = jQ(".marketwatch-sidebar");
    let tabs = marketWatchSideBar.find(".marketwatch-selector a.item");
    for (let i = 0; i < (tabs.length - 3); i++) {
        jQ(".marketwatch-selector a.item")[i].click();
        await callSleepForAWhile(1000);
        generateTrend();
        /*await callSleepForAWhile(1000);*/
    }
    startStockAlgoTrades();
    /*Reset to first tab*/
    jQ(".marketwatch-selector a.item")[0].click();
    await callSleepForAWhile(1000);
    generateTrend();
    /*await callSleepForAWhile(1000);*/
    showOrderTypeCount();
    getAllBullsBearsCount()
    jQ("#last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
    startRefresh();
    if (instance) {
        instance.attr("disabled", false)
    }
}

function getAllBullsBearsCount() {
    let aso = 0;
    let bso = 0;
    jQ.each(FO_LIST, function (index, item) {
        let data = infoMap[item]
         console.log(item)
        if (data['trends']) {
            if (jQ.inArray("ASO", data['trends']) != -1) {
                aso++
            }
            if (jQ.inArray("BSO", data['trends']) != -1) {
                bso++
            }

        }
    });

    aso = '<span class="badge bg-success">' + aso + '</span>'
    jQ("#all-aso").html(aso);


    bso = '<span class="badge bg-danger">' + bso + '</span>'
    jQ("#all-bso").html(bso);

}

jQ(document).on("click", "#start-auto-refresh", function () {
    var that = jQ(this);
    that.attr("disabled", true)
    clearInterval(timerInstance)
    autoRefreshEachTabs(that)
});

function startRefresh() {
    var display = document.querySelector('#refresh-timer-one');
    startTimer(REFRESH_TIME, display);
};

function startTimer(duration, display) {
    timerInstance = setInterval(function () {
        var d = new Date();
        var s = d.getSeconds();
        var m = d.getMinutes();
        var h = d.getHours();
        display.textContent = ("0" + h).substr(-2) + ":" + ("0" + m).substr(-2) + ":" + ("0" + s).substr(-2);
        if (s == 59) {
            autoRefreshEachTabs();
        }
        updatePrfitLoss();
    }, 1000);
}

function updatePrfitLoss() {
    let openPosition = jQ(".open-positions");
    let table = openPosition.find("table")
    let tfoot = table.find("tfoot")
    let tr = tfoot.find("tr");
    let td = tr.find("td:nth-child(4)");
    if (td) {
        let price = parseFloat(td.text().replaceAll(",", ""));
        if (!price) {
            price = 0.00;
        }
        let html = '<span class="badge bg-success">' + price + '</span>'
        if (price < 0) {
            html = '<span class="badge bg-danger">' + price + '</span>'
        }

        jQ(".profit-loss").html("P/L: " + html)
    }
}

function showAutoTrade() {
    let html = ''

    html += '<div class="row">'
    html += '<div class="col-md-2">'
    html += 'Prev. Date: <span class="badge bg-primary me-1">' + PREVIOUS_DAY_DATE + '</span>'
    html += '</div>'

    html += '<div class="col-md-2">'
    html += 'Curr. Date: <span class="badge bg-primary me-1">' + CURRENT_DAY + '</span>'
    html += '</div>'

    html += '<div class="col-md-2">'
    html += 'Algo Trend: <span class="badge bg-primary me-1">' + STOCK_TREND_TO_TRADE + '</span>'
    html += '</div>'

    html += '<div class="col-md-2">'
    html += 'Volume: <span class="badge bg-primary me-1">' + STOCK_VOLUME + '</span>'
    html += '</div>'

    html += '<div class="col-md-2">'
    html += 'Margin: <span class="badge bg-primary me-1">' + MARGIN + '</span>'
    html += '</div>'

    html += '<div class="col-md-2">'
    html += 'Trades: <span id="asoTradeCount" class="badge bg-success">0</span>/<span id="bsoTradeCount" class="badge bg-danger">0</span>'
    html += '</div>'

    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-1"></div>'
    html += '<div class="row">'

    html += '<div class="col-md-1">'
    html += '<button id="show-stock-scanner" class="btn ms-1 badge bg-info" type="submit">';
    html += 'Scanner'
    html += '</button>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<button id="show-order-book" class="btn ms-1 badge bg-info" type="submit">';
    html += 'Order Book'
    html += '</button>'
    html += '</div>'


    html += '<div class="col-md-1">'
    html += 'ASO: <span id="all-aso" class="badge bg-success">0</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += 'BSO: <span id="all-bso" class="badge bg-danger">0</span>'
    html += '</div>'

    html += '</div>'
    html += '<div class="px-3 py-2 border-bottom mb-1"></div>'


    let title = ''
    title += '<div class="row">'
    title += '<div class="col-md-2">'
    title += 'Auto Trade'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '<a  id="start-auto-refresh">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '<span style="margin-left:.5rem;" id="refresh-timer-one">00:00</span>'
    title += '</div>'
    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span id="last-refresh-time">Last @ 00:00:00</span>'
    title += '</div>'

    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span class="profit-loss">0.00</span>'
    title += '</div>'

    title += '<div class="col-md-1 pop-title-extra">'
    title += '<span id="clean-storage">Clear</span>'
    title += '</div>'
    title += '</div>'
    showPopUpWindow('trend-analysis', html, "Auto Trade", 1200, 150);
    var divId = "popup-custom-style-trend-analysis";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    jQ("." + divId).on("close.popupwindow", function () {
        if (timerInstance) {
            clearInterval(timerInstance)
        }
        console.log("Closed windows");
    });
}

async function generateTrend() {
    let marketWatchSideBar = jQ(".marketwatch-sidebar");
    let tabs = marketWatchSideBar.find(".marketwatch-selector a.item");
    let instrumentsWrapper = jQ(".instruments");
    let instruments = instrumentsWrapper.find(".vddl-list .instrument");
    await callSleepForAWhile(1000)
    jQ.each(tabs, function (index, item) {
        if (index == 0 || index == 1 || index == 2 || index == 3) {
            if (jQ(item).hasClass("selected")) {
                if (instruments.length > 0) {
                    let currentMap = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL"));
                    if (!currentMap) {
                        currentMap = {}
                    }
                    jQ(instruments).each(function (iindex, iitem) {
                        let name = jQ(this).find(".symbol").find(".nice-name").html();
                        let price = jQ(this).find(".price").find(".last-price").html();
                        let perc = jQ(this).find(".price-change").find(".price-absolute").html();
                        let insMap = {}
                        if (name == "M&amp;M") {
                            name = "M&M"
                        }
                        if (name == "M&amp;MFIN") {
                            name = "M&MFIN"
                        }

                        insMap['name'] = name.trim();
                        insMap['price'] = parseFloat(price.trim()).toFixed(2)
                        insMap['perc'] = perc.trim();
                        let prevPrice = parseFloat(price.trim()) - parseFloat(perc.trim());
                        insMap['prevPrice'] = parseFloat(prevPrice).toFixed(2);
                        if (!currentMap[name]) {
                            currentMap[name] = {}
                            currentMap[name] = insMap
                        }
                    });
                    localStorage.setItem("INSTRUMENT_LIST_GLOBAL", JSON.stringify(currentMap));
                }

                instrumentsMap = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL"));
                jQ(instruments).each(function (iindex, iitem) {
                    let name = jQ(this).find(".symbol").find(".nice-name").html();
                    let price = jQ(this).find(".price").find(".last-price").html();
                    if (name == "M&amp;M") {
                        name = "M&M"
                    }

                    if (name == "M&amp;MFIN") {
                        name = "M&MFIN"
                    }
                    if (name != "INDIA VIX") {
                        let that = jQ(this);
                        that.find(".info-wrapper").find(".strike-info").remove();
                        that.find(".info-wrapper").find(".show-info").remove();
                        that.find(".info-wrapper").find(".quantity-to-buy").remove();
                        that.find(".info-wrapper").find(".price-moved").remove();
                        that.find(".info-wrapper").find(".show-chart").remove();

                        let quantity = (MARGIN / (parseFloat(price) / 5)).toFixed(0)
                        let strikeData = getStrikeDetails(instrumentsMap[name], name);
                        let currentPrice = parseFloat(price.trim()).toFixed(2);

                        let asoPrice = 0;
                        let bsoPrice = 0;
                        let aso = parseFloat(strikeData['ustrikeOne']) - parseFloat(instrumentsMap[name]['price']);
                        aso = aso / 2
                        asoPrice = parseFloat(strikeData['ustrikeOne']) - aso;

                        let bso = parseFloat(instrumentsMap[name]['price']) - parseFloat(strikeData['bstrikeOne']);
                        bso = bso / 2
                        bsoPrice = parseFloat(strikeData['bstrikeOne']) + bso;

                        let trend = "NA"
                        let trends = []

                        if (index != 0) {
                            if (currentPrice >= parseFloat(asoPrice)) {
                                let strike = '<div class="badge bg-info above-strike-one strike-info">ASO</div>'
                                that.find(".info-wrapper").append(strike);
                                trend = "ASO"
                                trends.push(trend);
                            }

                            if (currentPrice <= parseFloat(bsoPrice)) {
                                let strike = '<div class="badge bg-info below-strike-one strike-info">BSO</div>'
                                that.find(".info-wrapper").append(strike);
                                trend = "BSO"
                                trends.push(trend);
                            }
                        }

                        let infoObj = {}
                        infoObj['instrument'] = instrumentsMap[name]
                        infoObj['strikeData'] = strikeData
                        infoObj['trends'] = trends;
                        infoObj['currentPrice'] = currentPrice
                        infoMap[name] = infoObj

                        if (index != 0) {
                            let tooltip = '<div data-index="' + index + '" data-name="' + name + '" class="badge bg-secondary show-info">i</div>'
                            that.find(".info-wrapper").append(tooltip);

                            let ASO_MOVED = parseFloat(currentPrice - asoPrice).toFixed()
                            let BSO_MOVED = parseFloat(bsoPrice - currentPrice).toFixed()

                            let priceMoved = ''
                            if (trend == "ASO") {
                                priceMoved += '<div class="badge bg-warning price-moved">' + ASO_MOVED + '</div>'
                            }

                            if (trend == "BSO") {
                                priceMoved += '<div class="badge bg-warning price-moved">' + BSO_MOVED + '</div>'
                            }

                            that.find(".info-wrapper").append(priceMoved);


                            let qtyToBuy = '<div class="badge bg-info quantity-to-buy">' + quantity + '</div>'
                            that.find(".info-wrapper").append(qtyToBuy);

                            let chart = '<div data-price="' + currentPrice + '" data-index="' + index + '" data-trend="' + trends.join(",") + '" data-name="' + name + '" class="badge bg-secondary show-chart">c</div>'
                            that.find(".info-wrapper").append(chart);
                        }
                    } else {
                        let currentPrice = parseFloat(price.trim()).toFixed(2);
                        let infoObj = {}
                        infoObj['instrument'] = instrumentsMap[name]
                        infoObj['strikeData'] = ''
                        infoObj['trends'] = '';
                        infoObj['currentPrice'] = currentPrice
                        infoMap[name] = infoObj
                    }
                });
            }
        }
    });
}

jQ(document).on("click", ".show-chart", function () {
    let name = jQ(this).attr("data-name");
    let trends = jQ(this).attr("data-trend");
    let index = jQ(this).attr("data-index");
    let price = jQ(this).attr("data-price");
    commonShowChart(name, trends, index, price)
});

function commonShowChart(name, trends, index, price) {

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


        if (quote.length == 0) {
            let map = {}
            map['date'] = moment().format("HH:mm:ss")
            map.open = instrumentsMap[name]['price']
            map.high = instrumentsMap[name]['price']
            map.low = instrumentsMap[name]['price']
            map.close = instrumentsMap[name]['price']
            map.volume = 0
            quote.push(map);
        }


        let tempName = name.replaceAll(" ", "-")
        tempName = tempName.replaceAll("&", "-")

        let chartId = 'chart-' + tempName;
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
        title += '<div class="col-md-4">'
        title += name + ' <span class="pop-title-extra" id="current-trend-' + tempName + '"> [' + trends.join(",") + ']</span>'
        title += '</div>'
        title += '<div class="col-md-2 pop-title-extra">'
        title += '<a   data-price="' + price + '" data-index="' + index + '" data-trend="' + trends.join(",") + '" data-name="' + name + '" id="start-auto-refresh-' + tempName + '" class="chart-refresh">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
        title += '</div>'
        title += '<div class="col-md-2 pop-title-extra">'
        title += '<span style="margin-left:.5rem;" id="refresh-timer-' + tempName + '">00:00</span>'
        title += '</div>'
        title += '<div class="col-md-3 pop-title-extra">'
        title += '<span id="last-refresh-time-' + tempName + '">Last @ 00:00:00</span>'
        title += '</div>'
        title += '</div>'

        showPopUpWindow(tempName, html, name + " : " + trends.join(","), 1050, 650);

        var divClass = "popup-custom-style-" + tempName;
        jQ("." + divClass).find(".popupwindow_titlebar_text").html(title);
        setTimeout(function () {
            showChart(quote, name);
            showStockData(quote, name)
        }, 1000)
        jQ("." + divClass).on("close.popupwindow", function () {
            clearInterval(window['refreshChart' + tempName])
        });
    })
}

function showStockData(quote, name) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let stockDataTable = jQ("#stock-data-" + tempName);
    let html = ''
    let count = quote.length
    let newList = []
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


        item.cssClass = cssClass;
        newList.push(item)
    });
    newList.reverse()
    jQ.each(newList, function (index, item) {
        html += '<tr class="' + item.cssClass + '">'
        html += '<td>' + item.date + '</td>'
        html += '<td>' + item.open + '</td>'
        html += '<td>' + item.high + '</td>'
        html += '<td>' + item.low + '</td>'
        html += '<td>' + item.close + '</td>'
        html += '<td>' + item.volume + '</td>'
        html += '</tr>'
    })
    stockDataTable.find("tbody").html(html)
    stockDataTable.show()
}

function commonShowOnlyChart(name) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    clearInterval(window['refreshChart' + tempName])
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


        if (quote.length == 0) {
            let map = {}
            map['date'] = moment().format("HH:mm:ss")
            map.open = instrumentsMap[name]['price']
            map.high = instrumentsMap[name]['price']
            map.low = instrumentsMap[name]['price']
            map.close = instrumentsMap[name]['price']
            map.volume = 0
            quote.push(map);
        }


        showChart(quote, name);
        showStockData(quote, name)
        startRefreshChart(tempName);
        jQ("#last-refresh-time-" + tempName).html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
    })
}

jQ(document).on("click", ".chart-refresh", function () {
    var that = jQ(this);
    that.attr("disabled", true)
    let name = jQ(this).attr("data-name");
    let trends = jQ(this).attr("data-trend");
    let index = jQ(this).attr("data-index");
    let price = jQ(this).attr("data-price");
    commonShowOnlyChart(name, trends, index, price)

    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let data = infoMap[name]
    var divClass = "popup-custom-style-" + tempName;
    if (data['trends'] != undefined) {
        jQ("." + divClass).find(".popupwindow_titlebar_text").find("#current-trend-" + tempName).html(' [' + data['trends'].join(",") + ']');
    }
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

jQ(document).on("click", ".place-sl-order", function () {
    let name = jQ(this).attr("data-name");
    let stop = parseFloat(jQ(this).attr("data-price")).toFixed(2);
    let transaction_type = jQ(this).attr("data-transaction-type");
    let quantity = jQ(this).attr("data-quantity");
    let price = 0
    let trigger_price = 0;

    if (transaction_type == "BUY") {
        trigger_price = stop
        price = parseFloat(stop + 0.10).toFixed(2)
    } else {
        trigger_price = stop
        price = parseFloat(stop - 0.10).toFixed(2)
    }

    let params = { "exchange": "NSE", "tradingsymbol": name, "transaction_type": transaction_type, "product": "MIS", "order_type": "SL", "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": price, "trigger_price": trigger_price, "disclosed_quantity": 0, "tags": [] }
    placeOrder(params)
})

jQ(document).on("click", ".place-order", function () {
    let name = jQ(this).attr("data-name");
    let transaction_type = jQ(this).attr("data-transaction-type");
    let ltp = parseFloat(jQ(this).attr("data-price"));
    let trigger_price = 0;
    let price = 0;
    if (transaction_type == "SELL") {
        trigger_price = ltp
        price = ltp - 0.20
    } else {
        trigger_price = ltp
        price = ltp - 0.20
    }
    let quantity = (MARGIN / (parseFloat(price) / 5)).toFixed(0)
    let params = { "exchange": "NSE", "tradingsymbol": name, "transaction_type": transaction_type, "product": "MIS", "order_type": ORDER_TYPE, "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": price, "trigger_price": trigger_price, "disclosed_quantity": 0, "tags": [] }
    callPlaceOrder(params, true)
});

async function callPlaceOrder(params, isAllowed) {
    let res = '';

    if (isAllowed) {
        res = await placeOrder(params)
    } else {
        res = 'success';
    }

    if (res != 'error') {
        let trades = JSON.parse(localStorage.getItem("TRADES"));
        if (!trades) {
            trades = []
        }

        let orderBook = JSON.parse(localStorage.getItem("ORDERBOOK"));
        if (!orderBook) {
            orderBook = {}
        }

        if (jQ.inArray(params.tradingsymbol, trades) === -1) {
            trades.push(params.tradingsymbol);
            let obj = {}
            obj['ORDER'] = params
            obj['INFO'] = infoMap[params.tradingsymbol];
            obj['KITE_ORDER'] = res
            obj['ORDER_DATE'] = moment().format("DD-MM-YYYY HH:mm:ss");
            orderBook[params.tradingsymbol] = obj
            localStorage.setItem("TRADES", JSON.stringify(trades));
            localStorage.setItem("ORDERBOOK", JSON.stringify(orderBook));
        }
    }

    return res;
}

function placeOrder(order) {
    jQ.ajaxSetup({
        headers: {
            'Authorization': `enctoken ${getCookie('enctoken')}`
        }
    });
    return new Promise((resolve, reject) => {
        jQ.post(BASE_URL + "/oms/orders/regular", order,
            function (data, status) {
                resolve(data);
            }).fail(
                function (jqXHR, textStatus, error) {
                    resolve(textStatus);
                }
            );
    });
}

function showChart(quote, name) {

    let data = getStrikeDetails(instrumentsMap[name], name);
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let chartId = 'chart-' + tempName;

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


    let asoStopLoss = 0;
    let bsoStopLoss = 0;

    let asoStop = parseFloat(data.ustrikeOne) - parseFloat(instrumentsMap[name]['price']);
    asoStop = asoStop / 2
    asoStopLoss = parseFloat(data.ustrikeOne) - asoStop;

    let bsoStop = parseFloat(instrumentsMap[name]['price']) - parseFloat(data.bstrikeOne);
    bsoStop = bsoStop / 2
    bsoStopLoss = parseFloat(data.bstrikeOne) + bsoStop;


    line = {};
    line.color = "#d65db1";
    line.startvalue = asoStopLoss;
    line.displayvalue = "ASO" + asoStopLoss.toFixed(2);
    lines.push(line);


    line = {};
    line.color = "#ff6f91";
    line.startvalue = bsoStopLoss;
    line.displayvalue = "BSO" + bsoStopLoss.toFixed(2);
    lines.push(line);


    line = {};
    if (parseFloat(instrumentsMap[name]['price']).toFixed(2) > parseFloat(instrumentsMap[name].prevPrice).toFixed(2)) {
        line.color = "#5D8736";
        line.displayvalue = "Open +ve" + instrumentsMap[name]['price'];
    } else {
        line.color = "#A94A4A";
        line.displayvalue = "Open -ve" + instrumentsMap[name]['price'];
    }
    line.dashed = 1;
    line.startvalue = instrumentsMap[name]['price'];
    lines.push(line);

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

jQ(document).on("click", ".show-info", function () {
    let name = jQ(this).attr("data-name");
    let index = jQ(this).attr("data-index");
    let data = infoMap[name];

    let asoPrice = 0;
    let bsoPrice = 0;
    let aso = parseFloat(data['strikeData']['ustrikeOne']) - parseFloat(instrumentsMap[name]['price']);
    aso = aso / 2
    asoPrice = parseFloat(data['strikeData']['ustrikeOne']) - aso;

    let bso = parseFloat(instrumentsMap[name]['price']) - parseFloat(data['strikeData']['bstrikeOne']);
    bso = bso / 2
    bsoPrice = parseFloat(data['strikeData']['bstrikeOne']) + bso;

    let html = ''
    html += '<div style="text-align:center;">'
    html += name
    html += '</div>'
    html += '<div>'
    html += ' ASO : ' + asoPrice
    html += '</div>'
    html += '<hr>'
    html += '<div>'
    html += ' BSO : ' + bsoPrice
    html += '</div>'
    callSackBarInfo(html)
});

function callSackBar(message) {
    SnackBar({
        message: message,
        status: "alert",
        timeout: 20000,
        actions: [],
        container: "app"
    });
}

function callSackBarInfo(message) {
    SnackBar({
        message: message,
        status: "info",
        timeout: 20000,
        actions: [],
        container: "app",
        position: 'bd'
    });
}

jQ(document).on("click", ".marketwatch-selector a.item", function () {
    generateTrend()
});

function clearLocalStorage() {
    localStorage.removeItem("INSTRUMENT_LIST_GLOBAL");
    localStorage.removeItem("TRADES")
    localStorage.removeItem("ORDERBOOK")
}

function getStrikeDetails(item, instrument) {
    let strikeDiff = getStrikeDiff(instrument);
    strikeDiff = strikeDiff.split(",");
    let strikeOne = parseInt(strikeDiff[0])
    let strikeTwo = parseInt(strikeDiff[1])

    let ustrikeOne = (parseFloat(item.price) + strikeOne);
    let ustrikeTwo = (ustrikeOne + strikeTwo);
    let bstrikeOne = (parseFloat(item.price) - strikeOne);
    let bstrikeTwo = (bstrikeOne - strikeTwo);

    let map = {}
    map['strikeDiff'] = parseFloat(strikeDiff).toFixed(2);
    map['bstrikeOne'] = parseFloat(bstrikeOne).toFixed(2);
    map['bstrikeTwo'] = parseFloat(bstrikeTwo).toFixed(2);
    map['ustrikeOne'] = parseFloat(ustrikeOne).toFixed(2);
    map['ustrikeTwo'] = parseFloat(ustrikeTwo).toFixed(2);
    return map;
}

function showTippy(target, msg, chartId) {
    var t = tippy(target, {
        content: msg,
        allowHTML: true,
        hideOnClick: true,
        trigger: "click",
        plugins: [hideOnEsc],
        showOnCreate: true,
        onHidden(instance) {
            debug('onHide');
            instance.destroy();
        },
    });
}

const hideOnEsc = {
    name: 'hideOnEsc',
    defaultValue: true,
    fn({ hide }) {
        function onKeyDown(event) {
            if (event.keyCode === 27) {
                hide();
            }
        }

        return {
            onShow() {
                document.addEventListener('keydown', onKeyDown);
            },
            onHide() {
                document.removeEventListener('keydown', onKeyDown);
            },
        };
    },
};

function getHistoricalData(code, fromDate, toDate, interval) {
    jQ.ajaxSetup({
        headers: {
            'Authorization': `enctoken ${getCookie('enctoken')}`
        }
    });
    return jQ.ajax({
        url: BASE_URL + `/oms/instruments/historical/${code}/${interval}?user_id=HY8031&oi=1&from=${fromDate}&to=${toDate}`,
        type: 'GET',
        async: true,
        cache: false,
    });
}
function getStrikeDiff(instrument) {
    let strikeDiff = 100;
    if (nseStrikeDiff[instrument]) {
        strikeDiff = nseStrikeDiff[instrument]
        strikeDiff = strikeDiff.replace(/ /g, '')
    }
    return strikeDiff;
}

function showPopUpWindow(index, html, title, width, height) {
    var divId = "pop-up-window-" + index;
    if (jQ("#" + divId).PopupWindow("getState")) jQ("#" + divId).PopupWindow("destroy");
    jQ("body").find("#" + divId).remove()
    var popHtml = html
    var popupCustomClass = 'popup-custom-style-' + index;
    jQ("#" + divId).on("open.popupwindow", function (event, data) {
        jQ("." + popupCustomClass).find(".popupwindow_titlebar").css({})
    });
    var markup = ''
    markup += '<div id="' + divId + '">'
    markup += popHtml
    markup += '</div>'
    jQ("body").append(markup);
    jQ("#" + divId).PopupWindow({
        title: title,
        modal: false,
        customClass: popupCustomClass,
        buttons: {
            close: true,
            maximize: true,
            collapse: true,
            minimize: true,
        },
        buttonsPosition: "right",
        buttonsTexts: {
            close: "Close",
            maximize: "Maximize",
            unmaximize: "Restore",
            minimize: "Minimize",
            unminimize: "Show",
            collapse: "Collapse",
            uncollapse: "Expand"
        },
        draggable: true,
        dragOpacity: 1,
        statusBar: true,
        width: width,
        height: height,
        resizable: true,
        resizeOpacity: 1,
        keepInViewport: true,              // Boolean
        mouseMoveEvents: true              // Boolean
    });
    jQ.PopupWindowMinimizedArea({
        position: "bottom right",
        direction: "vertical"
    });

    jQ("#" + divId).on("minimize.popupwindow", function () {
        jQ("." + popupCustomClass + " .pop-title-extra").hide();
    });

    jQ("#" + divId).on("unminimize.popupwindow", function () {
        jQ("." + popupCustomClass + " .pop-title-extra").show();
    })
};

function showOrderTypeCount() {
    let trades = JSON.parse(localStorage.getItem("TRADES"));
    if (!trades) {
        trades = []
    }

    let orderBook = JSON.parse(localStorage.getItem("ORDERBOOK"));
    if (!orderBook) {
        orderBook = []
    }
    let asoTradeCount = 0;
    let bsoTradeCount = 0;
    jQ.each(trades, function (index, item) {
        let info = orderBook[item]['INFO']
        if (jQ.inArray("BSO", info['trends']) !== -1) {
            bsoTradeCount++;
        }

        if (jQ.inArray("ASO", info['trends']) !== -1) {
            asoTradeCount++;
        }
    });

    jQ("#bsoTradeCount").html(bsoTradeCount);
    jQ("#asoTradeCount").html(asoTradeCount);
}

