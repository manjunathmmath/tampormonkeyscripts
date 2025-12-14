
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
            autoRefreshEachTabs();
        }

        if (m % 5 == 0 && s == 1) {
            updateTableLtpPrice();
            jQ("#start-advance-decline-refresh").trigger("click");
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

