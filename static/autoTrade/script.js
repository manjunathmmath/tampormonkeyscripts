
let timerInstance = null
async function autoRefreshEachTabs(instance, isManual) {
    clearInterval(timerInstance)

    let currentTime = moment().format("HH:mm")
    let checkTime = moment(PREVIOUS_DAY_DATE + " 09:15:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")
    let endTime = moment(PREVIOUS_DAY_DATE + " 15:00:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")
    let allow = true;

    if (!(currentTime >= checkTime)) {
        console.log("-------------------------[WAITING FOR MARKET TO OPEN FOR PRICE REFRESH]-----------");
        console.log("current Time :" + currentTime);
        console.log("----------------------------------------------------------------------------------");
        allow = false;
    }

    if (currentTime >= endTime) {
        console.log("----------------------------[MARKET CLOSED PRICE REFRESH STOPPED]--------------------");
        console.log("current Time :" + currentTime);
        console.log("------------------------------------------------------------------------------------");
        allow = false;
    }

    if (allow || isManual) {
        await updateStrorageLtpPrice(instance);
        await startStockAlgoTrades();
        showOrderTypeCount();
        getAllBullsBearsCount()
        await autoBreakOutScanner();

        jQ("#last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
    }
    startRefresh();
}

function getAllBullsBearsCount() {
    let aso = 0;
    let bso = 0;
    let scriptData = generateTrends()
    jQ.each(FO_LIST, function (index, item) {
        let data = scriptData[item]
        if (data) {
            if (jQ.inArray("ASO", data['trends']) != -1) {
                aso++
            }
            if (jQ.inArray("BSO", data['trends']) != -1) {
                bso++
            }

        }
    });

    aso = '<span class="badge bg-success">' + aso + '</span>'
    jQ(".all-aso").html(aso);


    bso = '<span class="badge bg-danger">' + bso + '</span>'
    jQ(".all-bso").html(bso);

}

jQ(document).on("click", "#start-auto-refresh", function (e) {
    e.preventDefault();
    var that = jQ(this);
    that.attr("disabled", true);
    commonRefresh(that, true)
});

async function commonRefresh(that, isManual) {
    clearInterval(timerInstance)
    await autoRefreshEachTabs(that, isManual);
}

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
            updatePrfitLoss();
        }
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

    html += '<div class="col-md-1">'
    html += '<span title="Month start Date" class="badge bg-primary me-1">' + START_MONTH_DAY_DATE + '</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<span title="Week start Date" class="badge bg-primary me-1">' + START_WEEK_DAY_DATE + '</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<span title="Previous Day Date" class="badge bg-primary me-1">' + PREVIOUS_DAY_DATE + '</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<span title="Current Day Date" class="badge bg-primary me-1">' + CURRENT_DAY + '</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<span title="Stock trend for algo trading" class="badge bg-primary me-1">' + STOCK_TREND_TO_TRADE + '</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<span title="Stock volume to check" class="badge bg-primary me-1">' + STOCK_VOLUME + '</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<span title="Margin for Algo trading" class="badge bg-primary me-1">' + MARGIN + '</span>'
    html += '</div>'

    html += '<div class="col-md-2">'
    html += '<span class="badge bg-primary me-1" title="Breakout Scanner" id="processing-breakout-scanner">' + ENABLE_BREAKOUT_SCANNER.toString().toUpperCase() + '</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<span title="ASO Traded Count" class="badge bg-success asoTradeCount">0</span>/<span title="BSO Traded Count" class="badge bg-danger bsoTradeCount">0</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<span title="Total ASO Stocks" class="all-aso">0</span>/<span title="Total BSO Stocks" class="all-bso">0</span>'
    html += '</div>'

    html += '</div>'

    html += '<div class="px-3 py-2 border-bottom mb-1"></div>'

    html += '<div class="row" id="button-container">'

    html += '<div class="col-md-1">'
    html += '<button class="btn btn-secondary btn-sm" id="clean-storage" type="button">Clear</button>'
    html += '</div>'
    html += '<div class="col-md-1">'
    html += '<button class="btn btn-secondary btn-sm" id="load-price" type="button">Load</button>'
    html += '</div>'
    html += '<div class="col-md-1">'
    html += '<button id="show-oi-scanner" class="btn btn-secondary btn-sm" type="submit">';
    html += 'OI'
    html += '</button>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<button id="show-oi-viewer" class="btn btn-secondary btn-sm" type="submit">';
    html += 'Analyzer'
    html += '</button>'
    html += '</div>'

    html += '<div class="col-md-1" >'
    html += '<button id="show-breakout-intruments" class="btn btn-secondary btn-sm" type="submit" >';
    html += 'Breakout'
    html += '</button>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<button id="show-order-book" class="btn btn-secondary btn-sm" type="submit">';
    html += 'Orders'
    html += '</button>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<button id="show-predictor" class="btn btn-secondary btn-sm" type="submit">';
    html += 'Prediction'
    html += '</button>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<button id="show-quick-scanner" class="btn btn-secondary btn-sm" type="submit">';
    html += 'Quick'
    html += '</button>'
    html += '</div>'


    html += '</div>'
    html += '<div class="px-3 py-2 border-bottom mb-1"></div>'
    html += '<h3>TRADE IDEAS/STRATEGIES</h3>'
    html += '<div class="px-3 py-2 border-bottom mb-1"></div>'
    html += '<p>'
    html += 'ASO  Trade : Check if ASO breakout and PE OI  > CE OI. Then Go for CE'
    html += '</p>'
    html += '<p>'
    html += 'ASO Reversal Trade : Check if ASO breakout and CE OI  > PE OI. Then Go for PE'
    html += '</p>'
    html += '<p>'
    html += 'BSO Trade : Check if BSO breakout and CE OI  > PE OI. Then go for PE'
    html += '</p>'
    html += '<p>'
    html += 'BSO Reversal Trade : Check if BSO breakout and PE OI  > CE OI. Then go for CE'
    html += '</p>'
    html += '<p>'
    html += 'Above is for AST and BST Trades. Also check for Breakout True and False count. Check aslo the prediction logic'
    html += '</p>'




    let title = ''
    title += '<div class="row">'
    title += '<div class="col-md-2">'
    title += 'Trade Bot'
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


    title += '</div>'
    showPopUpWindow('trend-analysis', html, "Auto Trade", 1000, 150);
    var divId = "popup-custom-style-trend-analysis";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    jQ("." + divId).on("close.popupwindow", function () {
        if (timerInstance) {
            clearInterval(timerInstance)
        }
        console.log("Closed windows");
    });
}


jQ(document).on("click", "#load-price", function (e) {
    e.preventDefault();
    let result = confirm("Are you sure you want to load the open price ?");
    if (result === true) {
        loadOpenPrice()
    }
});

async function loadOpenPrice() {
    await saveVixQuote();
    let currentTime = moment().format("HH:mm")
    let checkTime = moment(PREVIOUS_DAY_DATE + " 09:15:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")

    if (currentTime < checkTime) {
        await loadPreMarketOpenPrice()
    } else {
        let instru = []
        jQ.each(instrumentTokens, function (index, item) {
            let obj = {}
            obj['TRADINGSYMBOL'] = index
            obj['TOKEN'] = item
            instru.push(obj)
        });
        let storageObj = {};
        for (let i = 0; i < instru.length; i++) {
            try {
                let name = instru[i]['TRADINGSYMBOL']
                let tempName = name.replaceAll(" ", "-")
                tempName = tempName.replaceAll("&", "-")
                let data = await getHistoricalDataUsingPromise(instru[i]['TOKEN'], PREVIOUS_DAY_DATE, CURRENT_DAY, 'day');
                let previous = data.data.candles[0]
                let current = data.data.candles[1]
                let obj = {}
                obj['name'] = name
                obj['price'] = current[1]
                obj['prevPrice'] = previous[4]
                obj['perc'] = parseFloat(current[1] - previous[4]).toFixed(2)
                storageObj[name] = obj
            } catch (err) {
                console.log("Error while loading stock : " + instru[i]['TRADINGSYMBOL'])
                console.log(err)
            }

        }
        localStorage.setItem("INSTRUMENT_LIST_GLOBAL", JSON.stringify(storageObj));
    }

}

async function loadPreMarketOpenPrice() {
    let marketWatchSideBar = jQ(".marketwatch-pagination");
    let tabs = marketWatchSideBar.find(".pagination a.item");
    for (let i = 0; i < (tabs.length - 1); i++) {
        jQ(".marketwatch-pagination a.item")[i].click();
        await callSleepForAWhile(1000);
        await scanPreMarketpPrice();
    }
}

async function scanPreMarketpPrice() {
    await callSleepForAWhile(1000)
    let marketWatchSideBar = jQ(".marketwatch-pagination");
    let tabs = marketWatchSideBar.find(".pagination a.item");
    let instrumentsWrapper = jQ(".draggable-wrapper");
    let instruments = instrumentsWrapper.find(".items .item-wrapper");
    let storageOpenPriceObj = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL"));
    if (!storageOpenPriceObj) {
        storageOpenPriceObj = {}
    }

    jQ.each(tabs, function (index, item) {
        if (index == 0 || index == 1) {
            if (jQ(item).hasClass("selected")) {
                if (instruments.length > 0) {
                    jQ(instruments).each(function (iindex, iitem) {
                        let name = jQ(this).find(".symbol").find(".name").html();
                        let price = jQ(this).find(".price").find(".last-price").html();
                        let perc = jQ(this).find(".price-change").find(".change-absolute").html();
                        if (name == "M&amp;M") {
                            name = "M&M"
                        }

                        if (name == "M&amp;MFIN") {
                            name = "M&MFIN"
                        }

                        let obj = {}
                        obj['name'] = name
                        obj['price'] = parseFloat(price.trim()).toFixed(2)
                        obj['perc'] = perc.trim();
                        let prevPrice = parseFloat(price.trim()) - parseFloat(perc.trim());
                        obj['prevPrice'] = parseFloat(prevPrice).toFixed(2);
                        storageOpenPriceObj[name] = obj
                    });
                }
            }
        }
    });

    localStorage.setItem("INSTRUMENT_LIST_GLOBAL", JSON.stringify(storageOpenPriceObj));
}


async function updateStrorageLtpPrice(instance) {
    let marketWatchSideBar = jQ(".marketwatch-pagination");
    let tabs = marketWatchSideBar.find(".pagination a.item");
    for (let i = 0; i < (tabs.length - 1); i++) {
        jQ(".marketwatch-pagination a.item")[i].click();
        await callSleepForAWhile(1000);
        await scanLtpPrice();
    }
    if (instance) {
        instance.attr("disabled", false)
    }
}

async function scanLtpPrice() {
    await callSleepForAWhile(1000)
    let marketWatchSideBar = jQ(".marketwatch-pagination");
    let tabs = marketWatchSideBar.find(".pagination a.item");
    let instrumentsWrapper = jQ(".draggable-wrapper");
    let instruments = instrumentsWrapper.find(".items .item-wrapper");
    let storageLtpObj = JSON.parse(localStorage.getItem("INSTRUMENT_LTP_PRICE"));
    if (!storageLtpObj) {
        storageLtpObj = {}
    }

    jQ.each(tabs, function (index, item) {
        if (index == 0 || index == 1) {
            if (jQ(item).hasClass("selected")) {
                if (instruments.length > 0) {
                    jQ(instruments).each(function (iindex, iitem) {
                        let name = jQ(this).find(".symbol").find(".name").html();
                        let price = jQ(this).find(".price").find(".last-price").html();
                        let obj = {}
                        if (name == "M&amp;M") {
                            name = "M&M"
                        }

                        if (name == "M&amp;MFIN") {
                            name = "M&MFIN"
                        }
                        obj['name'] = name.trim()
                        obj['ltp'] = parseFloat(price.trim()).toFixed(2);
                        storageLtpObj[name] = obj
                    });
                }
            }
        }
    });
    localStorage.setItem("INSTRUMENT_LTP_PRICE", JSON.stringify(storageLtpObj));
}

jQ(document).on("click", ".show-chart", function (e) {
    e.preventDefault();
    let name = jQ(this).attr("data-name");
    let trends = jQ(this).attr("data-trend");
    let index = jQ(this).attr("data-index");
    let price = jQ(this).attr("data-price");
    commonShowChart(name, trends, index, price)
});

async function commonShowChart(name, trends, index, price) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let data = await getHistoricalDataUsingPromise(instrumentTokens[name], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
    await savePreviousStockQuote(tempName, instrumentTokens[name])
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
    html += '<th>OHL TREND</th>'
    html += '<th>BREAKOUT</th>'
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
    title += '<a   data-price="' + price + '" data-index="' + index + '" data-trend="' + trends.join(",") + '" data-name="' + name + '" id="start-auto-refresh-' + tempName + '" class="chart-refresh">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
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

    let res = generateTrend(name)

    let dayOpen = parseFloat(res['ltp']);
    let previousClose = parseFloat(res['prevPrice']);
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


    let data = await getHistoricalDataUsingPromise(instrumentTokens[name], moment(START_MONTH_DAY_DATE).add(-10, 'days').format("YYYY-MM-DD"), CURRENT_DAY, 'day');
    let candles = []
    jQ.each(data.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("YYYY-MM-DD")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        candles.push(map);
    });

    let size = candles.length;
    let isOpenOfTheMonth = false;
    let isOpenOfTheWeek = false;
    let openOfTheMonth = {}
    let closeOfTheMonth = candles[size - 1]
    let openOfTheWeek = {}
    let closeOfTheWeek = candles[size - 1]

    jQ.each(candles, function (index, item) {
        let date = moment(item.date).format("YYYY-MM-DD");
        if (date >= START_MONTH_DAY_DATE && !isOpenOfTheMonth) {
            openOfTheMonth = item
            isOpenOfTheMonth = true
        }

        if (date >= START_WEEK_DAY_DATE && !isOpenOfTheWeek) {
            openOfTheWeek = item
            isOpenOfTheWeek = true
        }
    });

    let oneDayAgo = candles[size - 2]
    let twoDayAgo = candles[size - 3]
    let threeDayAgo = candles[size - 4]
    let fourDayAgo = candles[size - 5]
    let fiveDayAgo = candles[size - 6]
    let sixDayAgo = candles[size - 7]
    let sevenDayAgo = candles[size - 8]
    let current = candles[size - 1];

    let oneDayHighLow = oneDayAgo['high'] - oneDayAgo['low'];
    let twoDayHighLow = twoDayAgo['high'] - twoDayAgo['low'];
    let threeDayHighLow = threeDayAgo['high'] - threeDayAgo['low'];
    let fourDayHighLow = fourDayAgo['high'] - fourDayAgo['low'];
    let fiveDayHighLow = fiveDayAgo['high'] - fiveDayAgo['low'];
    let sixDayHighLow = sixDayAgo['high'] - sixDayAgo['low'];
    let sevenDayHighLow = sevenDayAgo['high'] - sevenDayAgo['low'];


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

        let res = calculateOHLBuySell(dayOpen, dayHigh, dayLow, item.close, previousClose);
        item.trend = res
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

        let isOneDayAgo = false;
        let isTwoDayAgo = false
        let isThreeDayAgo = false
        let isFourDayAgo = false
        let isFiveDayAgo = false
        let isSixDayAgo = false
        let isSevenDayAgo = false
        let isDayCloseGreaterDayOpen = false
        let isDayCloseGreaterOneDayAgoClose = false
        let isWeeklyCloseGreaterWeeklyOpen = false
        let isMonthlyCloseGreaterMonthlyOpen = false
        let oneDayAgoVolumeGreater = false
        let dayHighLow = latestHigh - latestLow

        if (dayHighLow > oneDayHighLow) {
            isOneDayAgo = true
        }

        if (dayHighLow > twoDayHighLow) {
            isTwoDayAgo = true
        }

        if (dayHighLow > threeDayHighLow) {
            isThreeDayAgo = true
        }

        if (dayHighLow > fourDayHighLow) {
            isFourDayAgo = true
        }

        if (dayHighLow > fiveDayHighLow) {
            isFiveDayAgo = true
        }

        if (dayHighLow > sixDayHighLow) {
            isSixDayAgo = true
        }

        if (dayHighLow > sevenDayHighLow) {
            isSevenDayAgo = true
        }

        if (item.close > item.open) {
            isDayCloseGreaterDayOpen = true
        }

        if (item.close > oneDayAgo.close) {
            isDayCloseGreaterOneDayAgoClose = true
        }

        if (closeOfTheWeek.close > openOfTheWeek.open) {
            isWeeklyCloseGreaterWeeklyOpen = true
        }

        if (closeOfTheMonth.close > openOfTheMonth.open) {
            isMonthlyCloseGreaterMonthlyOpen = true
        }

        if (oneDayAgo.volume > 10000) {
            oneDayAgoVolumeGreater = true;
        }

        item['isOneDayAgo'] = isOneDayAgo;
        item['isTwoDayAgo'] = isTwoDayAgo;
        item['isThreeDayAgo'] = isThreeDayAgo;
        item['isFourDayAgo'] = isFourDayAgo;
        item['isFiveDayAgo'] = isFiveDayAgo;
        item['isSixDayAgo'] = isSixDayAgo;
        item['isSevenDayAgo'] = isSevenDayAgo;
        item['isDayCloseGreaterDayOpen'] = isDayCloseGreaterDayOpen;
        item['isDayCloseGreaterOneDayAgoClose'] = isDayCloseGreaterOneDayAgoClose;
        item['isWeeklyCloseGreaterWeeklyOpen'] = isWeeklyCloseGreaterWeeklyOpen;
        item['isMonthlyCloseGreaterMonthlyOpen'] = isMonthlyCloseGreaterMonthlyOpen;
        item['oneDayAgoVolumeGreater'] = oneDayAgoVolumeGreater;
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
        let trendHtml = ''
        if (item.trend[2].includes("Sell")) {
            trendHtml += '<span class="badge bg-danger">' + item.trend[2] + '</span>'
        } else {
            trendHtml += '<span class="badge bg-success">' + item.trend[2] + '</span>'
        }
        html += '<td>' + trendHtml + ' Buy %:' + parseFloat(item.trend[0]).toFixed(2) + ' Sell %:' + parseFloat(item.trend[1]).toFixed(2) + '</td>'


        let isOneDayAgoClass = 'badge bg-warning'
        let isTwoDayAgoClass = 'badge bg-warning'
        let isThreeDayAgoClass = 'badge bg-warning'
        let isFourDayAgoClass = 'badge bg-warning'
        let isFiveDayAgoClass = 'badge bg-warning'
        let isSixDayAgoClass = 'badge bg-warning'
        let isSevenDayAgoClass = 'badge bg-warning'
        let isDayCloseGreaterDayOpenClass = 'badge bg-warning'
        let isDayCloseGreaterOneDayAgoCloseClass = 'badge bg-warning'
        let isWeeklyCloseGreaterWeeklyOpenClass = 'badge bg-warning'
        let isMonthlyCloseGreaterMonthlyOpenClass = 'badge bg-warning'
        let oneDayAgoVolumeGreaterClass = 'badge bg-warning'

        if (item.isOneDayAgo) {
            isOneDayAgoClass = 'badge bg-success'
        }

        if (item.isTwoDayAgo) {
            isTwoDayAgoClass = 'badge bg-success'
        }

        if (item.isThreeDayAgo) {
            isThreeDayAgoClass = 'badge bg-success'
        }

        if (item.isFourDayAgo) {
            isFourDayAgoClass = 'badge bg-success'
        }

        if (item.isFiveDayAgo) {
            isFiveDayAgoClass = 'badge bg-success'
        }

        if (item.isSixDayAgo) {
            isSixDayAgoClass = 'badge bg-success'
        }

        if (item.isSevenDayAgo) {
            isSevenDayAgoClass = 'badge bg-success'
        }

        if (item.isDayCloseGreaterDayOpen) {
            isDayCloseGreaterDayOpenClass = 'badge bg-success'
        }

        if (item.isDayCloseGreaterOneDayAgoClose) {
            isDayCloseGreaterOneDayAgoCloseClass = 'badge bg-success'
        }


        if (item.isWeeklyCloseGreaterWeeklyOpen) {
            isWeeklyCloseGreaterWeeklyOpenClass = 'badge bg-success'
        }


        if (item.isMonthlyCloseGreaterMonthlyOpen) {
            isMonthlyCloseGreaterMonthlyOpenClass = 'badge bg-success'
        }


        if (item.oneDayAgoVolumeGreater) {
            oneDayAgoVolumeGreaterClass = 'badge bg-success'
        }

        let h = ''
        h += '<span class="' + isOneDayAgoClass + '">' + item.isOneDayAgo.toString().toUpperCase().charAt(0) + '</span>'
        h += '<span class="' + isTwoDayAgoClass + '">' + item.isTwoDayAgo.toString().toUpperCase().charAt(0) + '</span>'
        h += '<span class="' + isThreeDayAgoClass + '">' + item.isThreeDayAgo.toString().toUpperCase().charAt(0) + '</span>'
        h += '<span class="' + isFourDayAgoClass + '">' + item.isFourDayAgo.toString().toUpperCase().charAt(0) + '</span>'
        h += '<span class="' + isFiveDayAgoClass + '">' + item.isFiveDayAgo.toString().toUpperCase().charAt(0) + '</span>'
        h += '<span class="' + isSixDayAgoClass + '">' + item.isSixDayAgo.toString().toUpperCase().charAt(0) + '</span>'
        h += '<span class="' + isSevenDayAgoClass + '">' + item.isSevenDayAgo.toString().toUpperCase().charAt(0) + '</span>'
        h += '<span class="' + isDayCloseGreaterDayOpenClass + '">' + item.isDayCloseGreaterDayOpen.toString().toUpperCase().charAt(0) + '</span>'
        h += '<span class="' + isDayCloseGreaterOneDayAgoCloseClass + '">' + item.isDayCloseGreaterOneDayAgoClose.toString().toUpperCase().charAt(0) + '</span>'
        h += '<span class="' + isWeeklyCloseGreaterWeeklyOpenClass + '">' + item.isWeeklyCloseGreaterWeeklyOpen.toString().toUpperCase().charAt(0) + '</span>'
        h += '<span class="' + isMonthlyCloseGreaterMonthlyOpenClass + '">' + item.isMonthlyCloseGreaterMonthlyOpen.toString().toUpperCase().charAt(0) + '</span>'
        h += '<span class="' + oneDayAgoVolumeGreaterClass + '">' + item.oneDayAgoVolumeGreater.toString().toUpperCase().charAt(0) + '</span>'

        html += '<td>' + h + '</td>'
        html += '</tr>'
    })
    stockDataTable.find("tbody").html(html)
    stockDataTable.show()
}

async function commonShowOnlyChart(name, trends, index, price) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    clearInterval(window['refreshChart' + tempName])

    let data = await getHistoricalDataUsingPromise(instrumentTokens[name], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
    await savePreviousStockQuote(tempName, instrumentTokens[name])
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
    commonShowOnlyChart(name, trends, index, price)

    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let data = generateTrend(name)
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

function showChart(quote, name, index, prevQuote) {

    let scriptData = generateTrend(name)
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let chartId = 'chart-' + tempName;


    let dayOpen = parseFloat(scriptData['open']);
    let previousClose = parseFloat(scriptData['prevPrice']);
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

    isVolumePresent = SHOW_VOLUME_ON_CHART


    let res = calculateOHLBuySell(dayOpen, dayHigh, dayLow, scriptData['ltp'], previousClose);


    let ohl = '#current-trend-' + name.replaceAll(" ", "-").replaceAll("&", "-")

    let exchange = "NSE"
    if (name == "SENSEX") {
        exchange = "BSE"
    }

    let ohlHtml = ''

    ohlHtml += '<a target="_blank" href="https://kite.zerodha.com/markets/ext/option-chain/' + exchange + '/' + name + '/' + instrumentTokens[name] + '"> '
    ohlHtml += 'OS'
    ohlHtml += '</a>'

    ohlHtml += '<a data-name="' + name + '" class="show-option-change"> '
    ohlHtml += 'OC'
    ohlHtml += '</a>'

    if (res[2].includes('Buy')) {
        ohlHtml += '<span class="badge bg-success">' + res[2] + '</span>'
        ohlHtml += '<span class="badge bg-info">' + ' [B:' + parseFloat(res[0]).toFixed(2) + ' S:' + parseFloat(res[1]).toFixed(2) + ']' + '</span>'
    } else {
        ohlHtml += '<span class="badge bg-danger">' + res[2] + '</span>'
        ohlHtml += '<span class="badge bg-info">' + ' [B:' + parseFloat(res[0]).toFixed(2) + ' S:' + parseFloat(res[1]).toFixed(2) + ']' + '</span>'
    }


    jQ(ohl).append(ohlHtml)


    let lines = [];
    let line = {};

    if (index == 0) {
        line.color = "#8be73a";
        line.startvalue = scriptData['vix'].vixDDLower;
        line.displayvalue = 'VIXL: ' + scriptData['vix'].vixDDLower;
        lines.push(line);;

        line = {};
        line.color = "#e7543a";
        line.startvalue = scriptData['vix'].vixDDUpper;
        line.displayvalue = 'VIXU: ' + scriptData['vix'].vixDDUpper;
        lines.push(line);
    }



    line = {};
    line.color = "#872b19ff";
    line.startvalue = scriptData['strikeData'].ustrikeTwo;
    line.displayvalue = "AST [NO BUYING]" + scriptData['strikeData'].ustrikeTwo;
    lines.push(line);


    line = {};
    line.color = "#d65db1";
    line.startvalue = scriptData['strikeData'].ustrikeOne;
    line.displayvalue = "ASO: " + scriptData['strikeData'].ustrikeOne;
    lines.push(line);


    line = {};
    line.color = "#ff6f91";
    line.startvalue = scriptData['strikeData'].bstrikeOne;
    line.displayvalue = "BSO: " + scriptData['strikeData'].bstrikeOne;
    lines.push(line);


    line = {};
    line.color = "#35dc35ff";
    line.startvalue = scriptData['strikeData'].bstrikeTwo;
    line.displayvalue = "BST [NO SELLING]: " + scriptData['strikeData'].bstrikeTwo;
    lines.push(line);


    line = {};
    if (parseFloat(scriptData['open']) > parseFloat(scriptData['prevPrice']).toFixed(2)) {
        line.color = "#5D8736";
        line.displayvalue = "Open +ve: " + scriptData['open'];
    } else {
        line.color = "#A94A4A";
        line.displayvalue = "Open -ve: " + scriptData['open'];
    }
    line.dashed = 1;
    line.startvalue = scriptData['open'];
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

    jQ(".bsoTradeCount").html(bsoTradeCount);
    jQ(".asoTradeCount").html(asoTradeCount);
}
