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
        if (isManual) { await commonShowPopupWindow(); }

        jQ("#last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
    }

    startRefresh();
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
            let enableAutoRefresh = jQ("#enable-auto-refresh").is(":checked");
            if (enableAutoRefresh) {
                autoRefreshEachTabs();
            }
        }

        if (m % 5 == 0 && s == 10) {
            let enableAutoRefresh = jQ("#enable-auto-refresh").is(":checked");
            if (enableAutoRefresh) {
                commonShowPopupWindow();
            }
        }
    }, 1000);
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
    await updateStrorageLtpPrice();
    alert("Price loaded successfully.")

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
    jQ(".marketwatch-pagination a.item")[0].click();
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

jQ(document).ready(function () {
    let location = window.location.href;
    const url = new URL(location);
    const path = url.pathname;
    const segments = path.split('/');
    let exhange = segments[4];
    let symbol = segments[5];
    let token = segments[6];
    if (symbol == "NIFTY%2050") {
        symbol = "NIFTY 50"
    }

    if (symbol == "NIFTY%20BANK") {
        symbol = "NIFTY BANK"
    }

    if (exhange && symbol && token) {
        showDetailsOnChartPage(exhange, symbol, token);
    }
});

async function showDetailsOnChartPage(exhange, symbol, token) {
    let rowData = {}
    rowData['exchange'] = exhange
    rowData['TRADINGSYMBOL'] = symbol
    rowData['token'] = token
    commonShowInidividuslStockPopupWindow(symbol)
    setTimeout(function () {
        location.reload();
    }, 300000);
}

async function commonShowInidividuslStockPopupWindow(symbol) {
    let index = 0;
    let tempName = symbol.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let componentColor = "#ffffff";
    if (index % 2 === 0) {
        componentColor = "#edecec";
    }

    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));
    if (breakOutNineFifteen[symbol] == undefined) {
        breakOutNineFifteen[symbol] = {};
        breakOutNineFifteen[symbol]['CLOSE_9_15'] = "B/W"
    }

    let html = ''

    html += '<div class="row" style="position:relative;" id="individual-stock-popup-window">'
    html += '<div class="col-md-4" style="border:1px solid #c3c3c3;background-color:' + componentColor + ';">'

    html += '<div class="row" style="position:relative;background-color: ' + (componentColorHeader[symbol] == undefined ? "#ffbcb0" : componentColorHeader[symbol]) + '">'
    html += '<div class="col-md-12">'

    let bgClass = '';
    if (breakOutNineFifteen[symbol]['CLOSE_9_15'] == "ASO") {
        bgClass = 'bg-success';
    }
    if (breakOutNineFifteen[symbol]['CLOSE_9_15'] == "BSO") {
        bgClass = 'bg-danger';
    }
    if (breakOutNineFifteen[symbol]['CLOSE_9_15'] == "B/W") {
        bgClass = 'bg-info';
    }

    html += '<span style="position: absolute;left: .2rem;top: .2rem;" data-index="' + index + '" data-name="' + symbol + '" class="badge bg-secondary show-info">i</span>'
    html += '<span class="badge ' + bgClass + '" style="position:absolute;top:.2rem;right:.2rem;">' + breakOutNineFifteen[symbol]['CLOSE_9_15'] + '</span>'
    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size:large">' + symbol + '</h4>'
    html += '</div>'
    html += '</div>'

    html += '<div class="row" style="padding:.2rem;">'
    html += '<div class="col-md-12" style="height:13rem;position:relative;background-color:#000000;">'
    html += '<div id="' + tempName + '-chart" ></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'


    html += '<div class="col-md-4" style="border:1px solid #c3c3c3;">'
    html += '<div class="row" style="padding:.2rem;">'
    html += '<div class="col-md-12" style="position:relative;background-color:#ffbcb0;">'
    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size:large">OI/OBV</h4>'
    html += '</div>'
    html += '<div class="col-md-12" style="height:10rem;position:relative;">'
    html += '<div id="' + tempName + '-oi-obv" ></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-4" style="border:1px solid #c3c3c3;">'
    html += '<div class="row" style="">'
    html += '<div class="col-md-12" style="position:relative;background-color:#ffbcb0;">'
    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size:large">FUTURES</h4>'
    html += '</div>'
    html += '<div class="col-md-12" style="height:10rem;position:relative;text-align:center;">'
    html += '<div id="' + tempName + '-futures" ></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'

    html += '</div>'
    let title = ''
    title += '<div class="row">'
    title += '<div class="col-md-2">'
    title += 'Groot Trade Bot'
    title += '</div>'
    title += '</div>'
    showPopUpWindow('groot-trade-bot-stock', html, "Groot [Trade Bot]", 950, 330);
    let divId = "popup-custom-style-groot-trade-bot-stock";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    await showTopChart(symbol);
    await showPrictionProbabilty(symbol)
    showOIOBVBarChart(symbol);
    let res = await showFutureDetails(symbol);
    setFutureDetails(symbol, res);
}