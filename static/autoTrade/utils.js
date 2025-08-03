async function callAddToWatchList() {
    for (let i = 0; i < FO_LIST.length; i++) {
        addToWatchList("NSE", FO_LIST[i], (i + 1), 2)
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
            exchange: segment,
            tradingsymbol: tradingsymbol,
            weight: weight,
            group: 'GROUP:NS8PUSP7'
        }
    });
}

jQ(document).ready(function () {
    setTimeout(function () {
        makeUIChanges();
    }, 2000)

});

function makeUIChanges() {
    var html = '';
    html += '<a href="#" id="add-to-watch-list" style="display:none;">'
    html += 'Add Watchlist'
    html += '</a>'
    jQ('body').first().find(".app-nav").append(html);

    html = '';
    html += '<a href="#" id="start-algo-trade" style="padding:10px;">'
    html += 'Bot'
    html += '</a>'
    html += '<a href="#" id="show-oi-scanner" style="padding:10px;">'
    html += 'OI'
    html += '</a>'
    html += '<a href="#" id="show-oi-viewer" style="padding:10px;">'
    html += 'Analyzer'
    html += '</a>'
    html += '<a href="#" id="show-breakout-intruments" style="padding:10px;">'
    html += 'Breakout'
    html += '</a>'

    jQ('body').first().find(".app-nav").append(html);
}

jQ(document).on("click", "#add-to-watch-list", function (e) {
    e.preventDefault();
    callAddToWatchList();
});

jQ(document).on("click", "#start-algo-trade", function (e) {
    e.preventDefault();
    showAutoTrade();
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

/*Read Ltp and generate Trends and Vix Levels*/

function generateTrends() {
    let ltpPrices = JSON.parse(localStorage.getItem("INSTRUMENT_LTP_PRICE"));
    let openDetails = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL"));
    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];
    let instru = []
    let data = {}
    jQ.each(instrumentTokens, function (index, item) {
        let obj = {}
        obj['TRADINGSYMBOL'] = index
        obj['TOKEN'] = item
        instru.push(obj)
    });

    for (let i = 0; i < instru.length; i++) {
        try {
            let name = instru[i]['TRADINGSYMBOL']
            let ltp = ltpPrices[name]['ltp']
            let openDetail = openDetails[name]
            let obj = {}
            obj['price'] = openDetail['price']
            let strikeData = getStrikeDetails(obj, name);
            let res = {}
            res['open'] = openDetail['price']
            res['price'] = openDetail['price']
            res['strikeData'] = strikeData
            res['ltp'] = ltp
            res['prevPrice'] = openDetail['prevPrice']
            res['perc'] = openDetail['perc']

            let trend = "NA"
            let trends = []


            var vix = getVixRange(parseFloat(openDetail['prevPrice']), parseFloat(vixQuote[4]))

            res['vix'] = vix

            var vixLowerRange = 0;
            var vixUpperRange = 0;
            var vixDDRange = 0;

            vixLowerRange = parseFloat(vix.vixDDLower)
            vixUpperRange = parseFloat(vix.vixDDUpper)
            vixDDRange = parseFloat(vix.vixDDRange)

            if (ltp >= parseFloat(strikeData['ustrikeTwo'])) {
                trend = "AST"
                trends.push(trend);
            }

            if (ltp >= parseFloat(strikeData['ustrikeOne'])) {
                trend = "ASO"
                trends.push(trend);
            }
            if (ltp <= parseFloat(strikeData['bstrikeTwo'])) {
                trend = "BST"
                trends.push(trend);
            }

            if (ltp <= parseFloat(strikeData['bstrikeOne'])) {
                trend = "BSO"
                trends.push(trend);
            }

            if (ltp <= parseFloat(vixLowerRange)) {
                trend = "VIXL"
                trends.push(trend);
            }

            if (ltp >= parseFloat(vixUpperRange)) {
                trend = "VIXU"
                trends.push(trend);
            }

            res['trends'] = trends

            data[name] = res
        } catch (err) {
            console.log("Error while generating trend for stock : " + instru[i]['TRADINGSYMBOL'])
            console.log(err)
        }
    }
    return data;
}

function generateTrend(name) {
    let ltpPrices = JSON.parse(localStorage.getItem("INSTRUMENT_LTP_PRICE"));
    let openDetails = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL"));
    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];

    let openDetail = openDetails[name]
    let script = ltpPrices[name]

    let obj = {}
    let ltp = script['ltp']
    obj['price'] = openDetail['price']
    let strikeData = getStrikeDetails(obj, name);
    let res = {}
    res['strikeData'] = strikeData
    res['ltp'] = ltp
    res['open'] = openDetail['price']
    res['price'] = openDetail['price']
    res['prevPrice'] = openDetail['prevPrice']
    res['perc'] = openDetail['perc']


    let trend = "NA"
    let trends = []


    var vix = getVixRange(parseFloat(openDetail['prevPrice']), parseFloat(vixQuote[4]))

    res['vix'] = vix

    var vixLowerRange = 0;
    var vixUpperRange = 0;
    var vixDDRange = 0;

    vixLowerRange = parseFloat(vix.vixDDLower)
    vixUpperRange = parseFloat(vix.vixDDUpper)
    vixDDRange = parseFloat(vix.vixDDRange)

    if (ltp >= parseFloat(strikeData['ustrikeTwo'])) {
        trend = "AST"
        trends.push(trend);
    }

    if (ltp >= parseFloat(strikeData['ustrikeOne'])) {
        trend = "ASO"
        trends.push(trend);
    }
    if (ltp <= parseFloat(strikeData['bstrikeTwo'])) {
        trend = "BST"
        trends.push(trend);
    }

    if (ltp <= parseFloat(strikeData['bstrikeOne'])) {
        trend = "BSO"
        trends.push(trend);
    }

    if (ltp <= parseFloat(vixLowerRange)) {
        trend = "VIXL"
        trends.push(trend);
    }

    if (ltp >= parseFloat(vixUpperRange)) {
        trend = "VIXU"
        trends.push(trend);
    }

    res['trends'] = trends

    return res;
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
            },
            error: function (request, status, error) {
                resolve([]);
            }
        });
    })
}

function calculateOHLBuySell(o, h, l, ltp, previousClose) {
    let result = "Neutral";
    let open = o;
    let high = h;
    let low = l;
    let ltpd = ltp;
    let highMinusOpen = high - open;
    let openMinuslow = open - low;
    let list = []
    let oh = (highMinusOpen / high) * 100;
    let ol = (openMinuslow / open) * 100;

    list.push(oh);
    list.push(ol);

    if (open == high) {
        result = "Strong Sell(OH)";
        list.push(result);
        return list;
    }
    else if (open == low) {
        result = "Strong Buy(OL)";
        list.push(result);
        return list;
    }
    if (oh >= 0.0 && oh <= 0.85 && ol >= 1.25) {
        result = "Strong Sell(Lower High)";
        list.push(result);
        return list;
    }
    else if (ol >= 0.0 && ol <= 0.85 && oh >= 1.25) {
        result = "Strong Buy(Higher High)";
        list.push(result);
        return list;
    }
    if (ltpd >= open && ltpd >= low) {
        result = "Buy";
        list.push(result);
        return list;
    }
    else if (ltpd <= open && ltpd <= high) {
        result = "Sell";
        list.push(result);
        return list;
    }
    list.push(result);
    return list;
}

function savePreviousStockQuote(script, token) {
    let tempName = script.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    return new Promise((resolve, reject) => {
        if (!localStorage.getItem(tempName + "_PREVIOUS_DAY_QUOTE")) {
            jQ.when(getHistoricalData(token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, HISTORICAL_DATA_INTERVAL)).done(function (res) {
                localStorage.setItem(tempName + "_PREVIOUS_DAY_QUOTE", JSON.stringify(res));
                resolve();
            })
        } else {
            resolve();
        }
    });
}


function callSackBar(message) {
    SnackBar({
        message: message,
        status: "alert",
        timeout: 60000,
        actions: [],
        container: "app",
        position: 'bd'
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

function clearLocalStorage() {
    localStorage.removeItem("INSTRUMENT_LIST_GLOBAL");
    localStorage.removeItem("TRADES")
    localStorage.removeItem("ORDERBOOK")
    localStorage.removeItem("VIX_QUOTE")
    localStorage.removeItem("OHL_TREND")
    localStorage.removeItem("VALID_INSTRUMENTS")
    localStorage.removeItem("INSTRUMENT_LTP_PRICE")
    localStorage.removeItem("VALID_BREAKOUT")
    for (let i = 0; i < FO_LIST.length; i++) {
        let name = FO_LIST[i]
        name = name.replaceAll(" ", "-")
        name = name.replaceAll("&", "-")
        localStorage.removeItem(name + "_PREVIOUS_DAY_QUOTE")
    }
    for (let i = 0; i < INDICES.length; i++) {
        let name = INDICES[i]
        name = name.replaceAll(" ", "-")
        name = name.replaceAll("&", "-")
        localStorage.removeItem(name + "_PREVIOUS_DAY_QUOTE")
    }
}

function getStrikeDetails(item, instrument) {
    /*console.log("Strike : " + instrument)*/
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


function getVixRange(prevQuoteData, prevVixData) {

    var vixMM = calculateVixRange("MONTHLY", prevQuoteData, prevVixData)
    var vixWW = calculateVixRange("WEEKLY", prevQuoteData, prevVixData)
    var vixDD = calculateVixRange("DAILY", prevQuoteData, prevVixData)

    let d = {}
    d.vixMMRange = vixMM.range;
    d.vixMMLower = vixMM.lNift;
    d.vixMMUpper = vixMM.uNift;

    d.vixWWRange = vixWW.range;
    d.vixWWLower = vixWW.lNift;
    d.vixWWUpper = vixWW.uNift;

    d.vixDDRange = vixDD.range;
    d.vixDDLower = vixDD.lNift;
    d.vixDDUpper = vixDD.uNift;

    return d;

}

function calculateVixRange(type, prevQuoteData, prevVixData) {
    var data = {}
    var prevData = prevQuoteData
    var previousClose = prevVixData
    var chg;
    if (type == "DAILY") {
        chg = parseFloat(previousClose) / Math.sqrt(365 - 104 - 15)
    }
    if (type == "MONTHLY") {
        chg = parseFloat(previousClose) / Math.sqrt(12)
    }
    if (type == "WEEKLY") {
        chg = parseFloat(previousClose) / Math.sqrt(52)
    }

    var range = parseFloat(prevData) * chg / 100
    var lNift = parseFloat(prevData) - range
    var uNift = parseFloat(prevData) + range


    data['chg'] = chg.toFixed(2)
    data['range'] = range.toFixed(2)
    data['lNift'] = lNift.toFixed(2)
    data['uNift'] = uNift.toFixed(2)
    return data;
}

function saveVixQuote() {
    return new Promise((resolve, reject) => {
        if (!localStorage.getItem("VIX_QUOTE")) {
            jQ.when(getHistoricalData(264969, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day')).done(function (res) {
                localStorage.setItem("VIX_QUOTE", JSON.stringify(res));
                resolve();
            })
        } else {
            resolve();
        }
    });
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

async function callPlaceOrder(params, isAllowed) {
    let res = '';

    if (isAllowed) {
        res = await placeOrder(params)
    } else {
        res = {}
        res['status'] = 'success';
    }

    if (res.status != 'error') {
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
            obj['INFO'] = generateTrend(params.tradingsymbol);
            obj['KITE_ORDER'] = res
            obj['ORDER_DATE'] = moment().format("DD-MM-YYYY HH:mm:ss");
            orderBook[params.tradingsymbol] = obj
            localStorage.setItem("TRADES", JSON.stringify(trades));
            localStorage.setItem("ORDERBOOK", JSON.stringify(orderBook));
        }
    }

    return res;
}


function createAlert(name, lhs_tradingsymbol, rhs_constant, operator, lhs_exchange) {
    jQ.ajaxSetup({
        headers: {
            'Authorization': `enctoken ${getCookie('enctoken')}`
        }
    });
    return jQ.ajax({
        url: BASE_URL + `/oms/alerts`,
        type: 'POST',
        data: {
            name: name,
            lhs_exchange: lhs_exchange,
            lhs_tradingsymbol: lhs_tradingsymbol,
            lhs_attribute: "LastTradedPrice",
            operator: operator,
            rhs_type: "constant",
            type: "simple",
            rhs_constant: rhs_constant

        }
    });
}

function getAllValidStocks() {
    let validIntruments = JSON.parse(localStorage.getItem("VALID_INSTRUMENTS"));
    let scripts = []
    jQ.each(validIntruments, function (index, item) {
        if (jQ.inArray(index, scripts) === -1) {
            scripts.push(index)
        }
    });
    
    return scripts;
}

function getAllValidBreakOutStocks() {
    let validBreakouts = JSON.parse(localStorage.getItem("VALID_BREAKOUT"));
    let scripts = []
    jQ.each(validBreakouts, function (index, item) {
        if (jQ.inArray(item, scripts) === -1) {
            scripts.push(item)
        }
    });
    
    return scripts;
}