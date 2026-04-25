let timerInstance = null
async function autoRefreshEachTabs(instance, isManual) {
    clearInterval(timerInstance)

    let currentTime = moment().format("HH:mm")
    let checkTime = moment(PREVIOUS_DAY_DATE + " 09:15:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")
    let endTime = moment(PREVIOUS_DAY_DATE + " 16:30:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")
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


function autoStartScanLtp() {
    setInterval(function () {
        var d = new Date();
        var s = d.getSeconds();
        var m = d.getMinutes();
        var h = d.getHours();
        var display = document.querySelector('#refresh-timer-one');
        if (display) {
            display.textContent = ("0" + h).substr(-2) + ":" + ("0" + m).substr(-2) + ":" + ("0" + s).substr(-2);
        }
        if (s == 59) {
            let storageLtpObj = JSON.parse(localStorage.getItem("INSTRUMENT_LTP_PRICE"));
            if (storageLtpObj != null) {
                console.log("Loading ltp prices ........")
                updateStrorageLtpPrice();
            }
        }
    }, 1000);
}

jQ(document).ready(function () {
    autoStartScanLtp()
})


function startTimer(duration, display) {
    timerInstance = setInterval(function () {
        var d = new Date();
        var s = d.getSeconds();
        var m = d.getMinutes();
        var h = d.getHours();
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
                jQ("#processing-trend").html("Processing.... " + (i + 1) + "/" + instru.length);
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
    for (let i = 0; i < 1; i++) {
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
    if (tabs.length != 0) {
        for (let i = 0; i < 1; i++) {
            jQ(".marketwatch-pagination a.item")[i].click();
            await callSleepForAWhile(1000);
            await scanLtpPrice();
        }
        if (instance) {
            instance.attr("disabled", false)
        }
        jQ(".marketwatch-pagination a.item")[0].click();

    }
}

function updateStatusBar(that) {

    let name = that.find(".symbol").find(".name").html();
    let price = that.find(".price").find(".last-price").html();
    let perc = that.find(".price-change").find(".change-absolute").html();

    let html = ''

    html += '<div class="col-md-3">'
    html += '<span>' + name + ': </span>'
    html += '<span badge bg-info>' + price + ' </span>'
    if (perc > 0) {
        html += '<span class="badge bg-success"> [' + perc + ']</span>'
    } else {
        html += '<span class="badge bg-danger"> [' + perc + ']</span>'
    }
    html += '</div>'
    jQ("#status-bar-container").append(html)
}

async function scanLtpPrice() {
    jQ("#status-bar-container").html('')
    await callSleepForAWhile(1000)
    let marketWatchSideBar = jQ(".marketwatch-pagination");
    let tabs = marketWatchSideBar.find(".pagination a.item");
    let instrumentsWrapper = jQ(".draggable-wrapper");
    let instruments = instrumentsWrapper.find(".items .item-wrapper");
    let storageLtpObj = JSON.parse(localStorage.getItem("INSTRUMENT_LTP_PRICE"));
    if (!storageLtpObj) {
        storageLtpObj = {}
    }
    let scriptData = generateTrends()
    jQ.each(tabs, function (index, item) {
        if (index == 0 || index == 1) {
            if (jQ(item).hasClass("selected")) {
                if (instruments.length > 0) {
                    jQ(instruments).each(function (iindex, iitem) {
                        let that = jQ(this);
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


                        that.find(".item-info-wrapper").find(".strike-info").remove();

                        let currentPrice = parseFloat(price.trim()).toFixed(2);
                        if (name != "INDIA VIX") {
                            if (scriptData) {
                                let asoPrice = parseFloat(scriptData[name]['strikeData']['ustrikeOne']);
                                let bsoPrice = parseFloat(scriptData[name]['strikeData']['bstrikeOne']);

                                let astPrice = parseFloat(scriptData[name]['strikeData']['ustrikeTwo']);
                                let bstPrice = parseFloat(scriptData[name]['strikeData']['bstrikeTwo']);

                                let vixDDUpper = scriptData[name]['vix']['vixDDUpper']
                                let vixDDLower = scriptData[name]['vix']['vixDDLower']

                                if (currentPrice >= parseFloat(astPrice)) {
                                    let strike = '<div class="badge bg-info above-strike-two strike-info">AST</div>'
                                    that.find(".item-info-wrapper").append(strike);
                                }

                                if (currentPrice >= parseFloat(asoPrice)) {
                                    let strike = '<div class="badge bg-info above-strike-one strike-info">ASO</div>'
                                    that.find(".item-info-wrapper").append(strike);
                                }
                                if (currentPrice <= parseFloat(bstPrice)) {
                                    let strike = '<div class="badge bg-info below-strike-two strike-info">BST</div>'
                                    that.find(".item-info-wrapper").append(strike);
                                }

                                if (currentPrice <= parseFloat(bsoPrice)) {
                                    let strike = '<div class="badge bg-info below-strike-one strike-info">BSO</div>'
                                    that.find(".item-info-wrapper").append(strike);
                                }

                                if (currentPrice <= parseFloat(vixDDLower)) {
                                    let strike = '<div class="badge bg-info below-strike-one strike-info">VIXL</div>'
                                    that.find(".item-info-wrapper").append(strike);
                                }

                                if (currentPrice >= parseFloat(vixDDUpper)) {
                                    let strike = '<div class="badge bg-info below-strike-one strike-info">VIXU</div>'
                                    that.find(".item-info-wrapper").append(strike);
                                }
                            }
                        }
                        if (name == "INDIA VIX" || name == "NIFTY 50" || name == "NIFTY BANK" || name == "SENSEX") {
                            updateStatusBar(that)
                        }
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
    let exhange = segments[6];
    let symbol = segments[7];
    let token = segments[8];
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
    if (exhange == "NSE" || exhange == "BSE" || exhange == "INDICES") {
        commonShowInidividuslStockPopupWindow(symbol)
        setTimeout(function () {
            let enableAutoRefresh = jQ("#enable-auto-refresh-individual").is(":checked");
            if (enableAutoRefresh) {
                location.reload();
            }
        }, 300000);
    }

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

    html += '<div class="row">'
    html += '<div class="col-md-12" style="height:13rem;position:relative;background-color:#000000;">'
    html += '<div id="' + tempName + '-chart" ></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'


    html += '<div class="col-md-4" style="border:1px solid #c3c3c3;">'
    html += '<div class="row" >'
    html += '<div class="col-md-12" style="position:relative;background-color:#ffbcb0;">'
    html += '<span id="' + tempName + '-pcr-probability" style="position: absolute;left: .2rem;top: .2rem;" data-name="' + symbol + '">PCR</span>'

    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size:large">OI/OBV</h4>'
    html += '</div>'
    html += '<div class="col-md-12" style="height:10rem;position:relative;">'
    html += '<div id="' + tempName + '-oi-obv" ></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-4" style="border:1px solid #c3c3c3;">'
    html += '<div class="row" >'
    html += '<div class="col-md-12" style="position:relative;background-color:#ffbcb0;">'
    html += '<span id="' + tempName + '-futures-premium" style="position: absolute;top: .2rem;"  data-name="' + symbol + '">PREMIUM</span>'

    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size:large" id="futures-chart-' + tempName + '">FUTURES</h4>'
    html += '</div>'
    html += '<div class="col-md-12" style="height:10rem;position:relative;text-align:center;">'
    html += '<div id="' + tempName + '-futures" ></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'

    html += '</div>'
    let title = ''
    title += '<div class="row">'
    title += '<div class="col-md-1">'
    title += '<input checked title="Enable refresh-individual" type="checkbox" id="enable-auto-refresh-individual">'
    title += '</div>'
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