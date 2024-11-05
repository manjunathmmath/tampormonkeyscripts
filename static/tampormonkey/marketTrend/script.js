const my_css = GM_getResourceText("TOASTIFY_CSS");
const boot_css = GM_getResourceText("BOOTSTRAP_CSS");
const common_css = GM_getResourceText("COMMON_CSS");
const popup_window_css = GM_getResourceText("POPUP_WINDOW_CSS");
const sackbar_css = GM_getResourceText("SACKBAR_CSS");

GM_addStyle(my_css);
GM_addStyle(sackbar_css);
/*GM_addStyle(boot_css);*/
GM_addStyle(common_css);
GM_addStyle(popup_window_css);

window.jQ = jQuery.noConflict(true);
const g_config = new MonkeyConfig({
    title: 'Market Trend Settings',
    menuCommand: true,
    onSave: reloadPage,
    params: {
        previousDayDate: {
            type: 'text',
            default: moment().subtract(1, "days").format("YYYY-MM-DD")
        },
        currentDayDate: {
            type: 'text',
            default: moment().format("YYYY-MM-DD")
        },
        basket: {
            type: 'text',
            default: 26157565
        },
        margin: {
            type: 'text',
            default: 10000
        },
        enableSound: {
            type: 'select',
            choices: ['Yes', 'No'],
            values: ['Yes', 'No',],
            default: 'No'
        },
        logging: {
            type: 'select',
            choices: ['Info', 'Debug', 'None'],
            values: [D_LEVEL_INFO, D_LEVEL_DEBUG, D_LEVEL_NONE],
            default: D_LEVEL_NONE
        },
    }
});

const VERSION = "v1.0";
const BASE_URL = "https://kite.zerodha.com";
const PREVIOUS_DAY_DATE = g_config.get('previousDayDate');
const CURRENT_DAY = g_config.get('currentDayDate');
const D_LEVEL = g_config.get('logging');
let date = new Date().toJSON().slice(0, 10);
const BASKET = g_config.get('basket');
const MARGIN = g_config.get('margin');
let weightIndex = []


function callAddToWatchList() {
    for (let i = 0; i < FOLIST_TWO.length; i++) {
        addToWatchList("NSE", FOLIST_TWO[i], (i + 1), 6)
        callSleepForAWhile(1000)
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
        saveVixQuote()
    }, 2000)

    setInterval(function(){
        callSackBar(helpMessage)
    },300000)
});

function saveVixQuote() {
    if (!localStorage.getItem("VIX_QUOTE")) {
        jQ.when(getHistoricalData(264969, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day')).done(function (res) {
            localStorage.setItem("VIX_QUOTE", JSON.stringify(res));
        })
    }
}

function makeUIChanges() {
    var html = '';
    html += '<a href="#" id="get-entoken">'
    html += 'Token'
    html += '</a>'
    html += '<a href="#" id="clean-storage">'
    html += 'Clean'
    html += '</a>'
    //html += '<a href="#" id="add-to-watch-list">'
    //html += 'Add Watchlist'
    //html += '</a>'
    jQ('body').first().find(".app-nav").append(html);
}

jQ(document).on("click", "#get-entoken", function (e) {
    e.preventDefault();
    navigator.clipboard.writeText(getCookie('enctoken'));
    saveToken();
});

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

function saveToken() {
    return jQ.ajax({
        type: 'POST',
        url: 'http://localhost:9080/saveToken',
        data: { token: getCookie('enctoken') },
    });
}

function callSleepForAWhile(times) {
    return new Promise((resolve, reject) => {
        setTimeout(function () {
            resolve();
        }, times)
    });
}

let instrumentsMap = {}
let timerInstance = null
let interval = 30
let infoMap = {}

function startRefresh() {
    startTimer(interval);
};

function startTimer(duration) {
    if (!duration) {
        duration = 60
    }
    var timer = duration, minutes, seconds;
    timerInstance = setInterval(function () {
        minutes = parseInt(timer / 60, 10);
        seconds = parseInt(timer % 60, 10);

        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;
        if (--timer < 0) {
            generateTrend()
            timer = duration;
        }
    }, 1000);
}

async function generateTrend() {
    await callSleepForAWhile(2000);
    clearInterval(timerInstance)
    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];
    let marketWatchSideBar = jQ(".marketwatch-sidebar");
    let tabs = marketWatchSideBar.find(".marketwatch-selector a.item");
    let instrumentsWrapper = jQ(".instruments");
    let instruments = instrumentsWrapper.find(".vddl-list .instrument");
    infoMap = {}
    jQ.each(tabs, function (index, item) {
        if (index == 6) {
            return;
        }

        if (jQ(item).hasClass("selected") && index != 3) {
            instrumentsMap = {}
            if (!localStorage.getItem("INSTRUMENT_LIST_" + index)) {
                if (instruments.length > 0) {
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
                        insMap['currentStrike'] = "0.0"
                        instrumentsMap[name] = insMap;
                    });
                    localStorage.setItem("INSTRUMENT_LIST_" + index, JSON.stringify(instrumentsMap));
                }
            } else {
                instrumentsMap = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_" + index));
            }
            let bulls = 0;
            let bears = 0;
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
                    that.find(".info-wrapper").find(".draw-points").remove();
                    that.find(".info-wrapper").find(".add-to-basket").remove();
                    that.find(".info-wrapper").find(".script-weight").remove();
                    that.find(".info-wrapper").find(".strike-info").remove();
                    that.find(".info-wrapper").find(".show-info").remove();
                    that.find(".info-wrapper").find(".quantity-to-buy").remove();
                    that.find(".info-wrapper").find(".refresh-rsi").remove();
                    that.find(".info-wrapper").find(".price-moved").remove();
                    that.find(".info-wrapper").find(".show-chart").remove();

                    let quantity = (MARGIN / (parseFloat(price) / 5)).toFixed(0)

                    if (index == 1 || index == 2) {
                        let indexType = "NIFTY 50"
                        if (index == 2) {
                            indexType = "NIFTY BANK"
                        }
                        if (getWeightAge(indexType, name, true)) {
                            let weight = '<div class="badge bg-dark script-weight">' + getWeightAge(indexType, name, true) + '</div>'
                            that.find(".info-wrapper").append(weight);
                        }
                    }

                    let strikeData = getStrikeDetails(instrumentsMap[name], name);
                    let currentStrike = parseFloat(instrumentsMap[name]['currentStrike']).toFixed(2)

                    let currentPrice = parseFloat(price.trim()).toFixed(2);
                    let alrtSound = new Audio(alertSound);
                    let trend = "NA"

                    if (index == 0) {
                        if (currentPrice > parseFloat(strikeData['ustrikeTwo'])) {
                            let strike = '<div class="badge bg-info above-strike-two strike-info">AST</div>'
                            that.find(".info-wrapper").append(strike);
                            trend = "AST"
                            if (currentStrike != parseFloat(strikeData['ustrikeTwo'])) {
                                if (g_config.get('enableSound') == "Yes") {
                                    alrtSound.play();
                                }
                                let message = " Probability trade is SELL " + name + "( " + trend + ")"
                                callSackBar(message)

                            }
                            instrumentsMap[name]['currentStrike'] = parseFloat(strikeData['ustrikeTwo']).toFixed(2)
                        } else if (currentPrice > parseFloat(strikeData['ustrikeOne'])) {
                            let strike = '<div class="badge bg-info above-strike-one strike-info">ASO</div>'
                            that.find(".info-wrapper").append(strike);
                            trend = "ASO"
                            if (currentStrike != parseFloat(strikeData['ustrikeOne'])) {
                                if (g_config.get('enableSound') == "Yes") {
                                    alrtSound.play();
                                }
                                let message = " Probability trade is SELL " + name + "( " + trend + ")"
                                callSackBar(message)
                            }
                            instrumentsMap[name]['currentStrike'] = parseFloat(strikeData['ustrikeOne']).toFixed(2)
                        } else if (currentPrice < parseFloat(strikeData['bstrikeTwo'])) {
                            let strike = '<div class="badge bg-info below-strike-two strike-info">BST</div>'
                            that.find(".info-wrapper").append(strike);
                            trend = "BST"
                            if (currentStrike != parseFloat(strikeData['bstrikeTwo'])) {
                                if (g_config.get('enableSound') == "Yes") {
                                    alrtSound.play();
                                }
                                let message = " Probability trade is BUY " + name + "( " + trend + ")"
                                callSackBar(message)
                            }
                            instrumentsMap[name]['currentStrike'] = parseFloat(strikeData['bstrikeTwo']).toFixed(2)
                        } else if (currentPrice < parseFloat(strikeData['bstrikeOne'])) {
                            let strike = '<div class="badge bg-info below-strike-one strike-info">BSO</div>'
                            that.find(".info-wrapper").append(strike);
                            trend = "BSO"
                            if (currentStrike != parseFloat(strikeData['bstrikeOne'])) {
                                if (g_config.get('enableSound') == "Yes") {
                                    alrtSound.play();
                                }
                                let message = " Probability trade is BUY " + name + "( " + trend + ")"
                                callSackBar(message)
                            }
                            instrumentsMap[name]['currentStrike'] = parseFloat(strikeData['bstrikeOne']).toFixed(2)
                        }
                    }

                    var vix = getVixRange(parseFloat(instrumentsMap[name].prevPrice), parseFloat(vixQuote[4]))
                    var vixLowerRange = 0;
                    var vixUpperRange = 0;
                    var vixDDRange = 0;

                    vixLowerRange = parseFloat(vix.vixDDLower)
                    vixUpperRange = parseFloat(vix.vixDDUpper)
                    vixDDRange = parseFloat(vix.vixDDRange)


                    if (currentPrice <= parseFloat(vixLowerRange)) {
                        let strike = '<div class="badge bg-info below-strike-one strike-info">VIXL</div>'
                        that.find(".info-wrapper").append(strike);
                        trend = "VIXL"
                        if (currentStrike != parseFloat(vixLowerRange)) {
                            if (g_config.get('enableSound') == "Yes") {
                                alrtSound.play();
                            }
                            let message = " Probability trade is SELL " + name + "( " + trend + " : Qty=" + quantity + ")"
                            if (index == 0) {
                                message = " Probability trade is BUY " + name + "( " + trend + " : Qty=" + quantity + ")"
                            }
                            callSackBar(message)
                        }
                        instrumentsMap[name]['currentStrike'] = parseFloat(vixLowerRange).toFixed(2)
                    }


                    if (currentPrice >= parseFloat(vixUpperRange)) {
                        let strike = '<div class="badge bg-info below-strike-one strike-info">VIXU</div>'
                        that.find(".info-wrapper").append(strike);
                        trend = "VIXU"
                        if (currentStrike != parseFloat(vixUpperRange)) {
                            if (g_config.get('enableSound') == "Yes") {
                                alrtSound.play();
                            }
                            let message = " Probability trade is BUY " + name + "( " + trend + " : Qty=" + quantity + ")"
                            if (index == 0) {
                                message = " Probability trade is SELL " + name + "( " + trend + " : Qty=" + quantity + ")"
                            }
                            callSackBar(message)
                        }
                        instrumentsMap[name]['currentStrike'] = parseFloat(vixUpperRange).toFixed(2)
                    }

                    /*let draw = '<div data-trend="' + trend + '" data-name="' + name + '" class="badge bg-secondary draw-points">Draw</div>'
                    that.find(".info-wrapper").append(draw);
                    */

                    let infoObj = {}

                    infoObj['instrument'] = instrumentsMap[name]
                    infoObj['vix'] = vix
                    infoObj['strikeData'] = strikeData
                    infoMap[name] = infoObj

                    let tooltip = '<div data-name="' + name + '" class="badge bg-secondary show-info">i</div>'
                    that.find(".info-wrapper").append(tooltip);

                    let add = '<div data-price="' + parseFloat(price.trim()).toFixed(2) + '" data-trend="' + trend + '" data-name="' + name + '" class="badge bg-primary add-to-basket">+</div>'



                    let VIXU_MOVED = parseFloat(currentPrice - vixUpperRange).toFixed()
                    let VIXL_MOVED = parseFloat(vixLowerRange - currentPrice).toFixed()

                    let priceMoved = ''
                    if (trend == "VIXL") {
                        priceMoved += '<div class="badge bg-warning price-moved">' + VIXL_MOVED + '</div>'
                        bears++
                    }

                    if (trend == "VIXU") {
                        priceMoved += '<div class="badge bg-warning price-moved">' + VIXU_MOVED + '</div>'
                        bulls++;
                    }

                    that.find(".info-wrapper").append(priceMoved);

                    let qtyToBuy = '<div class="badge bg-info quantity-to-buy">' + quantity + '</div>'
                    if (index != 0) {
                        that.find(".info-wrapper").append(add);
                        that.find(".info-wrapper").append(qtyToBuy);
                    }

                    let chart = '<div data-price="' + currentPrice + '" data-index="' + index + '" data-trend="' + trend + '" data-name="' + name + '" class="badge bg-secondary show-chart">c</div>'
                    that.find(".info-wrapper").append(chart);

                    /*
                    let rsi = '<div data-name="' + name + '" class="badge bg-info refresh-rsi">RSI</div>'
                    that.find(".info-wrapper").append(rsi);
                    */

                }
            });
            /*
                jQ(item).find(".add-all-scripts").remove();
                let addAll = ''
                addAll += '<sapn class="bg-warning add-all-scripts">+</sapn>'
                if (index != 0) {
                    jQ(item).append(addAll)
                }
                    
            */

            jQ(item).find(".bullsVersesBears").remove();
            jQ(item).find(".add-all-scripts").remove();
            let countMaprkup = ''
            countMaprkup += '<span class="bullsVersesBears bg-success">' + bulls + '</span>'
            countMaprkup += '<span class="bullsVersesBears bg-danger">' + bears + '</span>'
            jQ(item).append(countMaprkup)

            localStorage.setItem("INSTRUMENT_LIST_" + index, JSON.stringify(instrumentsMap));
        } else {
            if (jQ(item).hasClass("selected") && index == 3) {
                jQ(instruments).each(function (iindex, iitem) {
                    let name = jQ(this).find(".symbol").find(".nice-name").html();
                    let validName = name.replaceAll(" ", "_");
                    savePreviousFutureQuote(validName)
                    getCurrentFutureQuote(validName)
                    let currentQuote = JSON.parse(localStorage.getItem(validName + "_CURRENT_QUOTE"))
                    let prevQuote = JSON.parse(localStorage.getItem(validName));
                    let trend = aiFutureAnalysis(currentQuote, prevQuote, name)
                    let that = jQ(this);
                    that.find(".info-wrapper").find(".ai-prediction").remove();
                    let strike = trend['PLUS'] + trend['MINUS']
                    that.find(".info-wrapper").append(strike);
                });
            }
        }
    });
    startRefresh();
}

jQ(document).on("click", ".refresh-rsi", function () {
    let name = jQ(this).attr("data-name");

    let that = $(this)
    jQ.when(getHistoricalData(instrumentTokens[name], PREVIOUS_DAY_DATE, CURRENT_DAY, '5minute')).done(function (res) {
        let quote = []
        $.each(res.data.candles, function (index, item) {
            let map = {}
            map['date'] = moment(item[0]).format("YYYY-MM-DD HH:mm:ss")
            map.open = item[1]
            map.high = item[2]
            map.low = item[3]
            map.close = item[4]
            map.volume = item[5]
            quote.push(map);
        });
        let data = showRSIInfo(quote)
        console.log(data)
    })
});

jQ(document).on("click", ".show-chart", function () {
    let name = jQ(this).attr("data-name");
    let trend = jQ(this).attr("data-trend");
    let index = jQ(this).attr("data-index");
    let price = jQ(this).attr("data-price");
    let that = $(this)
    jQ.when(getHistoricalData(instrumentTokens[name], CURRENT_DAY, CURRENT_DAY, '5minute')).done(function (res) {
        let quote = []
        $.each(res.data.candles, function (index, item) {
            let map = {}
            map['date'] = moment(item[0]).format("HH:mm:ss")
            map.open = item[1]
            map.high = item[2]
            map.low = item[3]
            map.close = item[4]
            map.volume = item[5]
            quote.push(map);
        });

        let tempName = name.replaceAll(" ", "-")
        tempName = tempName.replaceAll("&","-")

        let chartId = 'chart-' + tempName;
        
        var html = ''
        let btnColor = "bg-success"
        if(trend=="VIXL"){
            btnColor = "bg-danger"
        }
        if (index != 0) {
            html += '<div style="width:100%;text-align:center;">'
            html += '<button  data-name="' + name + '" data-price="' + price + '"  data-trend="' + trend + '" class="btn-sm btn btn-primary ms-1 place-order '+btnColor+'" type="submit">';
            html += 'Place Order'
            html += '</button>'
            html += '</div>'
        }

        html += '<div id="' + chartId + '" style="width:100%;">'
        html += '</div>'
        showPopUpWindow(tempName, html, name + " : " + trend);
        show5MinutesChart(quote, name)
    })
});


$(document).on("click", ".place-order", function () {
    let name = jQ(this).attr("data-name");
    let trend = jQ(this).attr("data-trend");
    let price = jQ(this).attr("data-price");

    if (trend == "VIXL" || trend == "VIXU") {
        let transaction_type = "BUY"
        if (trend == "VIXL") {
            transaction_type = "SELL"
        }
        let quantity = (MARGIN / (parseFloat(price) / 5)).toFixed(0)
        let params = { "exchange":"NSE","tradingsymbol":name,"transaction_type": transaction_type, "product": "MIS", "order_type": "MARKET", "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": 0, "trigger_price": 0, "disclosed_quantity": 0, "tags": [] }
        placeOrder(params)
    }
})

function placeOrder(order) {
    jQ.ajaxSetup({
        headers: {
            'Authorization': `enctoken ${getCookie('enctoken')}`
        }
    });
    return new Promise((resolve, reject) => {
        jQ.post(BASE_URL + "/oms/orders/regular",
            order,
            function (data, status) {
                resolve(data);
            });
    });
}






function show5MinutesChart(quote, name) {

    let data = getStrikeDetails(instrumentsMap[name], name);
    let chartId = 'chart-' + name.replaceAll(" ", "-");
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
    $.each(quote, function (index, item) {
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

    $.each(quote, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
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
                "pYAxisMinValue": min,
                "pYAxisMaxValue": max,
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



async function showRSIInfo(quote) {
    let data = await getRSI(quote)
    return data;
}

function aiFutureAnalysis(currentQuote, prevQuote, name) {
    let trend;
    if (name == "NIFTY NOV FUT") {
        trend = showAiNiftyPrediction(currentQuote, prevQuote, name)
    }
    if (name == "BANKNIFTY NOV FUT") {
        trend = showAiBankNiftyPrediction(currentQuote, prevQuote, name)
    }

    return trend;
}


function showAiNiftyPrediction(currentQuoteData, prevQuoteData, name) {
    let futuresData = {};
    let prevData = prevQuoteData.data['candles'][0];
    let currentData = currentQuoteData.data['candles'][currentQuoteData.data['candles'].length - 1];


    var quote = {}
    quote['open'] = currentData[1]
    quote['high'] = currentData[2]
    quote['low'] = currentData[3]
    quote['close'] = currentData[4]
    quote['volume'] = currentData[5]
    quote['oi'] = currentData[6]


    var prevQuote = {}
    prevQuote['open'] = prevData[1]
    prevQuote['high'] = prevData[2]
    prevQuote['low'] = prevData[3]
    prevQuote['close'] = prevData[4]
    prevQuote['volume'] = prevData[5]
    prevQuote['oi'] = prevData[6]


    quote.volume = parseInt(quote.volume)
    var pTypicalPrice = (parseFloat(prevQuote.high) + parseFloat(prevQuote.low) + parseFloat(prevQuote.close)) / 3
    var cTypicalPrice = (parseFloat(quote.high) + parseFloat(quote.low) + parseFloat(quote.close)) / 3
    var cVolumePrice = cTypicalPrice * parseFloat(quote.volume)
    var pVolumePrice = pTypicalPrice * parseFloat(prevQuote.volume)
    var totalVolumePrice = cVolumePrice + pVolumePrice
    var totalVolume = parseInt(quote.volume) + parseInt(prevQuote.volume)
    var vwapPrice = (totalVolumePrice / totalVolume).toFixed(2)


    var vwap = vwapPrice ? vwapPrice : 0;


    var openPrice = quote.open;
    var highPrice = quote.high;
    var lowPrice = quote.low;
    var lastPrice = quote.close;

    var previousClose = prevQuote['close']
    var pChange = ((lastPrice - previousClose) / previousClose) * 100
    var change = (lastPrice - previousClose).toFixed(2)
    var shortCoveringOrLongUnwinding = false;
    var price;
    var oi;
    var booleanValue = false;
    var correctedVwap = vwap;
    correctedVwap = correctedVwap - 5; // price spike adjustment
    var lastPrice = lastPrice;
    if (correctedVwap <= lastPrice) {
        booleanValue = true;
    } else {
        booleanValue = false;
    }
    var openInterest = quote['oi'] / 50;
    var previousOI = prevQuote['oi'] / 50
    var changeinOpenInterest = (openInterest - previousOI).toFixed(2)
    var pchangeinOpenInterest = (((openInterest - previousOI) / previousOI) * 100).toFixed(2);
    var changeEvo1 = change;
    var pChangeEvo = pchangeinOpenInterest;
    var changeEvo = changeinOpenInterest;
    var bottomTriangle = '<i class="bi bi-caret-down">DOWN</i>'
    var upTriangle = '<i class="bi bi-caret-up">UP</i>'
    var openInterestMarkup = '';
    var openInterestDirectionMarkup = '';
    var openInterestChangeMarkup = '';
    var openInterestChangePercMarkup = '';

    if (changeinOpenInterest > 0) {
        openInterestMarkup = '<span class=" badge bg-success">' + openInterest + '</span>'
        openInterestDirectionMarkup = '<span class=" badge bg-success" >' + upTriangle + '</span>'
        openInterestChangeMarkup = '<span class=" badge bg-success" >' + changeinOpenInterest + '</span>'
        oi = "+";
    } else {
        openInterestMarkup = '<span class=" badge bg-danger">' + openInterest + '</span>'
        openInterestDirectionMarkup = '<span class=" badge bg-danger">' + bottomTriangle + '</span>'
        openInterestChangeMarkup = '<span class=" badge bg-danger">' + changeinOpenInterest + '</span>'
        oi = "-";
    }

    if (pchangeinOpenInterest > 0) {
        openInterestChangePercMarkup = '<span class=" badge bg-success">' + pchangeinOpenInterest + '%</span>'
    } else {
        openInterestChangePercMarkup = '<span class=" badge bg-danger">' + pchangeinOpenInterest + '%</span>'
    }

    if (changeEvo1 > 10 && booleanValue == true) { // percentage bull side
        price = "+";
    } else if (changeEvo1 <= -10 && booleanValue == false) { // bear side,long unwinding
        price = "-";
    } else if (changeEvo1 >= 10 && booleanValue == false) { // bear side, short
        price = "-";
    } else {
        price = "+-";// no clear trend
    }

    if (changeEvo < 0 && pChangeEvo < -2) {
        shortCoveringOrLongUnwinding = true;
    } else {
        shortCoveringOrLongUnwinding = false;
    }

    var remark = "No Clear Trend, Bulls are still waiting";

    var dogImgContainer = '<span class="badge bg-light ai-prediction">' + dogImage + '</span>'
    var bullImageImgContainer = '<span class="badge bg-light ai-prediction">' + bullImage + '</span>'
    var bearImageImgContainer = '<span class="badge bg-light ai-prediction">' + bearImage + '</span>'
    var hulkImageImgContainer = '<span class="badge bg-light ai-prediction">' + hulkImage + '</span>'
    var captainImgContainer = '<span class="badge bg-light ai-prediction">' + captain + '</span>'
    var lokiImgContainer = '<span class="badge bg-light ai-prediction">' + loki + '</span>'
    var ironManImgContainer = '<span class="badge bg-light ai-prediction">' + ironMan + '</span>'
    var thorImgContainer = '<span class="badge bg-light ai-prediction">' + thor + '</span>'
    var hulNewImgContainer = '<span class="badge bg-light ai-prediction">' + hulkImageNew + '</span>'
    var doctorStrangeImgContainer = '<span class="badge bg-light ai-prediction">' + doctor_strange + '</span>'
    remark += dogImgContainer
    var display = "+";

    if (price == "+" && oi == "+") {
        remark = '<span class="badge bg-success ai-prediction">Long</span>'
        display = "+";
    } else if (price == "-" && oi == "+") {
        remark = '<span class="badge bg-danger ai-prediction">Short</span>'
        display = "-";
    } else if (price == "+" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = '<span class="badge bg-success ai-prediction">Short Covering</span>'
        display = "+";
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = dogImgContainer + '<span class="badge bg-danger ai-prediction">Long Unwinding</span>'
        display = "-";
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding == false) {
        remark = dogImgContainer + lokiImgContainer + '<span class="badge bg-danger ai-prediction">Bears Coming,Sell On Rise</span>'
        display = "-";
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo >= 10) {
        remark = '<span class="badge bg-danger ai-prediction">Gambling! Buy,News & Events</span>'
        display = "+";
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo < 10) {
        remark = '<span class="badge bg-danger ai-prediction">Caution! Writers Eroding Premium</span>'
        display = "+";
    } else {
        remark = captainImgContainer + '<span class="badge bg-danger ai-prediction">Defence,Buy On Decline</span>'
        display = "+";
    }

    var bullRemark = remark;
    var bearRemark = remark;
    var marketTrendPlus = ""
    var imageBullPlus = "";

    if (display == "+") {
        marketTrendPlus = '<span class="blinking badge bg-success ai-prediction">Hulk Arrived (+)</span>'
        if (pChangeEvo >= 4 && price != "+-") {
            imageBullPlus = thorImgContainer + hulNewImgContainer + bullImageImgContainer
        } else if (pChangeEvo >= 4 && price == "+-") {
            marketTrendPlus = '<span class="blinking badge bg-warning ai-prediction">Doctor Strange Arrived (+)</span>'
            imageBullPlus = doctorStrangeImgContainer
        } else {
            imageBullPlus = bullImageImgContainer;
        }
    } else {
        marketTrendPlus = '<span class=" blinking badge bg-danger ai-prediction">Strongly Not Recommended to buy Calls</span>'
        imageBullPlus = ""
        openInterestMarkupBull = ""
        openInterestDirectionMarkupBull = ""
        openInterestChangeMarkupBull = ""
        openInterestChangePercMarkupBull = ""
        niftyOILabelPlusBull = ""
        bullRemark = ""
    }

    futuresData['PLUS'] = imageBullPlus + bullRemark + marketTrendPlus

    var marketTrendMinus = ""
    var imageBearMinus = "";
    var openInterestMarkupBear = openInterestMarkup
    var openInterestDirectionMarkupBear = openInterestDirectionMarkup
    var openInterestChangeMarkupBear = openInterestChangeMarkup
    var openInterestChangePercMarkupBear = openInterestChangePercMarkup
    var bankNiftyOILabelPlusBear = "NIFTY-OI"

    if (display == "-") {
        marketTrendMinus = '<span class="blinking badge bg-danger ai-prediction">Chitauri Army Arrived (-)</span>'
        imageBearMinus = bearImageImgContainer
    } else {
        marketTrendMinus = '<span class=" blinking badge bg-danger ai-prediction">Strongly Not Recommended to Short Calls</span>'
        openInterestMarkupBear = ""
        openInterestDirectionMarkupBear = ""
        openInterestChangeMarkupBear = ""
        openInterestChangePercMarkupBear = ""
        bankNiftyOILabelPlusBear = ""
        bearRemark = ""
    }

    futuresData['MINUS'] = imageBearMinus + bearRemark + marketTrendMinus

    return futuresData;
}

function showAiBankNiftyPrediction(currentQuoteData, prevQuoteData, name) {
    let futuresData = {};
    let prevData = prevQuoteData.data['candles'][0];
    let currentData = currentQuoteData.data['candles'][currentQuoteData.data['candles'].length - 1];


    var quote = {}
    quote['open'] = currentData[1]
    quote['high'] = currentData[2]
    quote['low'] = currentData[3]
    quote['close'] = currentData[4]
    quote['volume'] = currentData[5]
    quote['oi'] = currentData[6]


    var prevQuote = {}
    prevQuote['open'] = prevData[1]
    prevQuote['high'] = prevData[2]
    prevQuote['low'] = prevData[3]
    prevQuote['close'] = prevData[4]
    prevQuote['volume'] = prevData[5]
    prevQuote['oi'] = prevData[6]


    quote.volume = parseInt(quote.volume)
    var pTypicalPrice = (parseFloat(prevQuote.high) + parseFloat(prevQuote.low) + parseFloat(prevQuote.close)) / 3
    var cTypicalPrice = (parseFloat(quote.high) + parseFloat(quote.low) + parseFloat(quote.close)) / 3
    var cVolumePrice = cTypicalPrice * parseFloat(quote.volume)
    var pVolumePrice = pTypicalPrice * parseFloat(prevQuote.volume)
    var totalVolumePrice = cVolumePrice + pVolumePrice
    var totalVolume = parseInt(quote.volume) + parseInt(prevQuote.volume)
    var vwapPrice = (totalVolumePrice / totalVolume).toFixed(2)


    var vwap = vwapPrice ? vwapPrice : 0;


    var openPrice = quote.open;
    var highPrice = quote.high;
    var lowPrice = quote.low;
    var close = quote.close;
    var lastPrice = quote.close;

    var previousClose = prevQuote['close']
    var pChange = ((lastPrice - previousClose) / previousClose) * 100
    var change = (lastPrice - previousClose).toFixed(2)
    var shortCoveringOrLongUnwinding = false;
    var price;
    var oi;
    var booleanValue = false;
    var correctedVwap = vwap;
    correctedVwap = correctedVwap - 5; // price spike adjustment
    var lastPrice = lastPrice;
    if (correctedVwap <= lastPrice) {
        booleanValue = true;
    } else {
        booleanValue = false;
    }
    var openInterest = quote['oi'] / 15;
    var previousOI = prevQuote['oi'] / 15
    var changeinOpenInterest = (openInterest - previousOI).toFixed(2)
    var pchangeinOpenInterest = (((openInterest - previousOI) / previousOI) * 100).toFixed(2);
    var changeEvo1 = change;
    var pChangeEvo = pchangeinOpenInterest;
    var changeEvo = changeinOpenInterest;
    var bottomTriangle = '<i class="bi bi-caret-down">DOWN</i>'
    var upTriangle = '<i class="bi bi-caret-up">UP</i>'
    var openInterestMarkup = '';
    var openInterestDirectionMarkup = '';
    var openInterestChangeMarkup = '';
    var openInterestChangePercMarkup = '';

    if (changeinOpenInterest > 0) {
        openInterestMarkup = '<span class=" badge bg-success">' + openInterest + '</span>'
        openInterestDirectionMarkup = '<span class=" badge bg-success" >' + upTriangle + '</span>'
        openInterestChangeMarkup = '<span class=" badge bg-success" >' + changeinOpenInterest + '</span>'
        oi = "+";
    } else {
        openInterestMarkup = '<span class=" badge bg-danger">' + openInterest + '</span>'
        openInterestDirectionMarkup = '<span class=" badge bg-danger">' + bottomTriangle + '</span>'
        openInterestChangeMarkup = '<span class=" badge bg-danger">' + changeinOpenInterest + '</span>'
        oi = "-";
    }

    if (pchangeinOpenInterest > 0) {
        openInterestChangePercMarkup = '<span class=" badge bg-success">' + pchangeinOpenInterest + '%</span>'
    } else {
        openInterestChangePercMarkup = '<span class=" badge bg-danger">' + pchangeinOpenInterest + '%</span>'
    }

    if (changeEvo1 > 10 && booleanValue == true) { // percentage bull side
        price = "+";
    } else if (changeEvo1 <= -10 && booleanValue == false) { // bear side,long unwinding
        price = "-";
    } else if (changeEvo1 >= 10 && booleanValue == false) { // bear side, short
        price = "-";
    } else {
        price = "+-";// no clear trend
    }

    if (changeEvo < 0 && pChangeEvo < -2) {
        shortCoveringOrLongUnwinding = true;
    } else {
        shortCoveringOrLongUnwinding = false;
    }

    var remark = "No Clear Trend, Bulls are still waiting";


    var dogImgContainer = '<span class="badge bg-light ai-prediction">' + dogImage + '</span>'
    var bullImageImgContainer = '<span class="badge bg-light ai-prediction">' + bullImage + '</span>'
    var bearImageImgContainer = '<span class="badge bg-light ai-prediction">' + bearImage + '</span>'
    var hulkImageImgContainer = '<span class="badge bg-light ai-prediction">' + hulkImage + '</span>'
    var captainImgContainer = '<span class="badge bg-light ai-prediction">' + captain + '</span>'
    var lokiImgContainer = '<span class="badge bg-light ai-prediction">' + loki + '</span>'
    var ironManImgContainer = '<span class="badge bg-light ai-prediction">' + ironMan + '</span>'
    var thorImgContainer = '<span class="badge bg-light ai-prediction">' + thor + '</span>'
    var hulNewImgContainer = '<span class="badge bg-light ai-prediction">' + hulkImageNew + '</span>'
    var doctorStrangeImgContainer = '<span class="badge bg-light ai-prediction">' + doctor_strange + '</span>'
    remark += dogImgContainer
    var display = "+";


    if (price == "+" && oi == "+") {
        remark = '<span class="badge bg-success ai-prediction">Long</span>'
        display = "+";
    } else if (price == "-" && oi == "+") {
        remark = '<span class="badge bg-danger ai-prediction">Short</span>'
        display = "-";
    } else if (price == "+" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = '<span class="badge bg-success ai-prediction">Short Covering</span>'
        display = "+";
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = dogImgContainer + '<span class="badge bg-danger ai-prediction">Long Unwinding</span>'
        display = "-";
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding == false) {
        remark = dogImgContainer + lokiImgContainer + '<span class="badge bg-danger ai-prediction">Bears Coming,Sell On Rise</span>'
        display = "-";
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo >= 10) {
        remark = '<span class="badge bg-danger ai-prediction">Gambling! Buy,News & Events</span>'
        display = "+";
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo < 10) {
        remark = '<span class="badge bg-danger ai-prediction">Caution! Writers Eroding Premium</span>'
        display = "+";
    } else {
        remark = captainImgContainer + '<span class="badge bg-danger ai-prediction">Defence,Buy On Decline</span>'
        display = "+";
    }

    var bullRemark = remark;
    var bearRemark = remark;
    var marketTrendPlus = ""
    var imageBullPlus = "";

    var openInterestMarkupBull = openInterestMarkup
    var openInterestDirectionMarkupBull = openInterestDirectionMarkup
    var openInterestChangeMarkupBull = openInterestChangeMarkup
    var openInterestChangePercMarkupBull = openInterestChangePercMarkup
    var niftyOILabelPlusBull = "NIFTY-OI"
    if (display == "+") {
        marketTrendPlus = '<span class="blinking badge bg-success ai-prediction">Hulk Arrived (+)</span>'
        if (pChangeEvo >= 4 && price != "+-") {
            imageBullPlus = thorImgContainer + hulNewImgContainer + bullImageImgContainer
        } else if (pChangeEvo >= 4 && price == "+-") {
            marketTrendPlus = '<span class="blinking badge bg-warning ai-prediction">Doctor Strange Arrived (+)</span>'
            imageBullPlus = doctorStrangeImgContainer
        } else {
            imageBullPlus = bullImageImgContainer;
        }
    } else {
        marketTrendPlus = '<span class=" blinking badge bg-danger ai-prediction">Strongly Not Recommended to buy Calls</span>'
        imageBullPlus = ""
        openInterestMarkupBull = ""
        openInterestDirectionMarkupBull = ""
        openInterestChangeMarkupBull = ""
        openInterestChangePercMarkupBull = ""
        niftyOILabelPlusBull = ""
        bullRemark = ""
    }

    futuresData['PLUS'] = imageBullPlus + bullRemark + marketTrendPlus

    var marketTrendMinus = ""
    var imageBearMinus = "";
    var openInterestMarkupBear = openInterestMarkup
    var openInterestDirectionMarkupBear = openInterestDirectionMarkup
    var openInterestChangeMarkupBear = openInterestChangeMarkup
    var openInterestChangePercMarkupBear = openInterestChangePercMarkup
    var bankNiftyOILabelPlusBear = "NIFTY-OI"

    if (display == "-") {
        marketTrendMinus = '<span class="blinking badge bg-danger ai-prediction">Chitauri Army Arrived (-)</span>'
        imageBearMinus = bearImageImgContainer
    } else {
        marketTrendMinus = '<span class=" blinking badge bg-danger ai-prediction">Strongly Not Recommended to Short Calls</span>'
        openInterestMarkupBear = ""
        openInterestDirectionMarkupBear = ""
        openInterestChangeMarkupBear = ""
        openInterestChangePercMarkupBear = ""
        bankNiftyOILabelPlusBear = ""
        bearRemark = ""
    }
    futuresData['MINUS'] = imageBearMinus + bearRemark + marketTrendMinus

    return futuresData;
}

let futureInstruments = {
    "NIFTY_NOV_FUT": 8982786,
    "BANKNIFTY_NOV_FUT": 8963330,
}
function savePreviousFutureQuote(validName) {
    if (!localStorage.getItem(validName)) {
        jQ.when(getHistoricalData(futureInstruments[validName], PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day')).done(function (res) {
            localStorage.setItem(validName, JSON.stringify(res));
        })
    }
}

function getCurrentFutureQuote(validName) {
    jQ.when(getHistoricalData(futureInstruments[validName], CURRENT_DAY, CURRENT_DAY, '5minute')).done(function (res) {
        localStorage.setItem(validName + "_CURRENT_QUOTE", JSON.stringify(res));
    })
}

jQ(document).on("click", ".show-info", function () {
    let name = jQ(this).attr("data-name");
    let data = infoMap[name];
    let html = ''
    html += '<div style="text-align:center;">'
    html += name
    html += '</div>'
    html += '<div>'
    html += ' ASO : ' + data['strikeData']['ustrikeOne']
    html += ' AST : ' + data['strikeData']['ustrikeTwo']
    html += '</div>'
    html += '<hr>'
    html += '<div>'
    html += ' BSO : ' + data['strikeData']['bstrikeOne']
    html += ' BST : ' + data['strikeData']['bstrikeTwo']
    html += '</div>'
    html += '<hr>'
    html += '<div>'
    html += ' VIXU : ' + data['vix']['vixDDUpper']
    html += ' VIXL : ' + data['vix']['vixDDLower']
    html += '</div>'
    html += ''
    html += ''
    callSackBarInfo(html)
});

jQ(document).on("click", ".add-all-scripts", function () {
    addAllToBasket()
});

let baskets = [26184477, 26185846, 26185849]

async function addAllToBasket() {
    let instrumentsWrapper = jQ(".instruments");
    let instruments = instrumentsWrapper.find(".vddl-list .instrument");
    weightIndex = [];

    let INSTRUMENT_TRADE_PRESENT = localStorage.getItem("INSTRUMENT_TRADE_PRESENT");

    if (INSTRUMENT_TRADE_PRESENT) {
        INSTRUMENT_TRADE_PRESENT = JSON.parse(INSTRUMENT_TRADE_PRESENT);
    } else {
        INSTRUMENT_TRADE_PRESENT = []
    }

    let addInstrumentsToTrade = []
    for (let i = 0; i < instruments.length; i++) {
        let that = jQ(instruments[i]);
        let add = that.find(".info-wrapper").find(".add-to-basket");
        let name = add.attr("data-name");
        let trend = add.attr("data-trend");
        let price = add.attr("data-price");
        let transaction_type = "BUY"
        if (trend == "VIXU" || trend == "VIXL") {
            if (jQ.inArray(name, INSTRUMENT_TRADE_PRESENT) == -1) {
                if (trend == "VIXL") {
                    transaction_type = "SELL"
                }
                let quantity = (MARGIN / (parseFloat(price) / 5)).toFixed(0)
                let params = { "transaction_type": transaction_type, "product": "MIS", "order_type": "MARKET", "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": 0, "trigger_price": 0, "disclosed_quantity": 0, "tags": [] }
                let tradingsymbol = name
                let exchange = "NSE"
                let weight = (weightIndex.length + 1)

                if (i <= 19) {
                    addToBasket(tradingsymbol, exchange, weight, params, baskets[2])
                    weightIndex = [];
                }
                if (i > 19 && i <= 39) {
                    addToBasket(tradingsymbol, exchange, weight, params, baskets[2])
                    weightIndex = [];
                }

                if (i > 39 && i < 59) {
                    addToBasket(tradingsymbol, exchange, weight, params, baskets[2])
                    weightIndex = [];
                }
                weightIndex.push(name)
                await callSleepForAWhile(1000)
                addInstrumentsToTrade.push(tradingsymbol)
            }
        }
    }

    jQ.each(addInstrumentsToTrade, function (index, item) {
        INSTRUMENT_TRADE_PRESENT.push(item)
    });

    localStorage.setItem("INSTRUMENT_TRADE_PRESENT", JSON.stringify(INSTRUMENT_TRADE_PRESENT));
    alert("Added all scripts to the Basket.")
}

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


jQ(document).on("click", ".add-to-basket", function () {
    let name = jQ(this).attr("data-name");
    let trend = jQ(this).attr("data-trend");
    let price = jQ(this).attr("data-price");

    if (trend == "VIXL" || trend == "VIXU") {
        let transaction_type = "BUY"
        if (trend == "VIXL") {
            transaction_type = "SELL"
        }
        let quantity = (MARGIN / (parseFloat(price) / 5)).toFixed(0)
        let params = { "transaction_type": transaction_type, "product": "MIS", "order_type": "MARKET", "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": 0, "trigger_price": 0, "disclosed_quantity": 0, "tags": [] }
        let tradingsymbol = name
        let exchange = "NSE"
        let weight = (weightIndex.length + 1)
        addToBasket(tradingsymbol, exchange, weight, params, BASKET)
        weightIndex.push(name)
    }
});

jQ(document).on("click", ".marketwatch-selector a.item", function () {
    generateTrend()
});

jQ(document).on("click", ".draw-points", function () {
    let name = jQ(this).attr("data-name");
    let trend = jQ(this).attr("data-trend");
    let strikeData = getStrikeDetails(instrumentsMap[name], name);

    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];

    var vix = getVixRange(parseFloat(instrumentsMap[name].prevPrice), parseFloat(vixQuote[4]))

    var vixLowerRange = 0;
    var vixUpperRange = 0;
    var vixDDRange = 0;

    vixLowerRange = parseFloat(vix.vixDDLower)
    vixUpperRange = parseFloat(vix.vixDDUpper)
    vixDDRange = parseFloat(vix.vixDDRange)

    let coordinates = []

    let dataMap = {}
    dataMap['segment'] = 'NA'
    dataMap['tradingsymbol'] = name
    dataMap['token'] = 'NA'
    dataMap['chartName'] = name + '-' + date;
    dataMap['openedTrend'] = trend
    let lineArr = []

    let lineMap = {}

    lineMap = {
        coordinates: strikeData.bstrikeOne,
        color: 1,
        label: 'Below Strike 1 (Bearish Below)',
        probabilityNo: "There is 66.7% probability of price not crossing below 1st deciding strike.  (Probability of Bullish Trade)",
        probabilityYes: "There is 32.8% probability of price crossing below 1st deciding strike and closing below.  (Probability of Bullish Trade)",
    }
    lineArr.push(lineMap)

    lineMap = {
        coordinates: strikeData.bstrikeTwo,
        color: 1,
        label: 'Below Strike 2 (Bearish Below)',
        probabilityNo: "There is 81.1% probability of price not crossing below 2nd deciding strike.  (Probability of Bullish Trade)",
        probabilityYes: "There is 18.5% probability of price crossing below 2nd deciding strike and closing below.  (Probability of Bullish Trade)",
    }
    lineArr.push(lineMap)

    lineMap = {
        coordinates: strikeData.ustrikeOne,
        color: 2,
        label: 'Above Strike 1 (Bullish Above)',
        probabilityNo: "There is 70.7% probability of price not crossing above 1st deciding strike.  (Probability of Bearish Trade)",
        probabilityYes: "There is 28.9% probability of price crossing above 1st deciding strike and closing above.  (Probability of Bearish Trade)",
    }
    lineArr.push(lineMap)

    lineMap = {
        coordinates: strikeData.ustrikeTwo,
        color: 2,
        label: 'Above Strike 2 (Bullish Above)',
        probabilityNo: "There is 85.7% probability of price not crossing above 2nd deciding strike.  (Probability of Bearish Trade)",
        probabilityYes: "There is 13.9% probability of price crossing above 2nd deciding strike and closing above. (Probability of Bearish Trade)",
    }
    lineArr.push(lineMap)

    lineMap = {
        coordinates: vixLowerRange,
        color: 3,
        label: 'Vix Lower Range ( If breaks are working. It should stop here) ',
        probabilityNo: "There is 90% probability of price not crossing Vix lower range. (Probability of Bullish Trade)",
        probabilityYes: "There is 9.6% probability of price crossing Vix lower range. (Probability of Bullish Trade)",
    }
    lineArr.push(lineMap)

    lineMap = {
        coordinates: vixUpperRange,
        color: 4,
        label: 'Vix Upper Range ( If breaks are working. It should stop here)',
        probabilityNo: "There is 89.2% probability of price not crossing Vix upper range.(Probability of Bearish Trade)",
        probabilityYes: "There is 10.4% probability of price crossing Vix upper range.(Probability of Bearish Trade)",
    }
    lineArr.push(lineMap)

    dataMap['lines'] = lineArr
    coordinates.push(dataMap)
    processHandleKiteCall(coordinates)
});

async function processHandleKiteCall(coordinates) {
    await handleKiteCall(coordinates)
}

function handleKiteCall(coordinates) {
    return new Promise((resolve, reject) => {
        jQ.ajax({
            type: 'POST',
            url: 'http://localhost:9080/handleKiteCall',
            data: { coordinates: JSON.stringify(coordinates) },
            success: function (data) {
                resolve(data);
            }
        });
    });
}

function getRSI(payload) {
    return new Promise((resolve, reject) => {
        jQ.ajax({
            type: 'POST',
            url: 'http://localhost:9080/getRSI',
            data: { input: JSON.stringify(payload) },
            success: function (data) {
                resolve(data);
            }
        });
    });
}

jQ(document).on("click", ".trend-class", function () {
    let name = jQ(this).attr("data-name");
    let trend = jQ(this).attr("data-trend");
    let data = getStrikeDetails(instrumentsMap[name], name);
    let chartId = 'chart-' + name.replaceAll(" ", "-") + '-' + trend;
    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];

    var vix = getVixRange(parseFloat(instrumentsMap[name].prevPrice), parseFloat(vixQuote[4]))

    var vixLowerRange = 0;
    var vixUpperRange = 0;
    var vixDDRange = 0;

    vixLowerRange = parseFloat(vix.vixDDLower)
    vixUpperRange = parseFloat(vix.vixDDUpper)
    vixDDRange = parseFloat(vix.vixDDRange)

    let matrixTable = ''
    matrixTable += '<tr class="bg-success">'
    matrixTable += '<th>UPPER STRIKE 1</th>'
    matrixTable += '<td>' + data.ustrikeOne + '</td>'
    matrixTable += '</tr>'
    matrixTable += '<tr class="bg-success">'
    matrixTable += '<th>UPPER STRIKE 2</th>'
    matrixTable += '<td>' + data.ustrikeTwo + '</td>'
    matrixTable += '</tr>'
    matrixTable += '<tr class="bg-danger">'
    matrixTable += '<th>BELOW STRIKE 1</th>'
    matrixTable += '<td>' + data.bstrikeOne + '</td>'
    matrixTable += '</tr>'
    matrixTable += '<tr class="bg-danger">'
    matrixTable += '<th>BELOW STRIKE 2</th>'
    matrixTable += '<td>' + data.bstrikeTwo + '</td>'
    matrixTable += '</tr>'
    matrixTable += '<tr class="bg-success">'
    matrixTable += '<th>VIX LOWER RANGE</th>'
    matrixTable += '<td>' + vixLowerRange + '</td>'
    matrixTable += '</tr>'
    matrixTable += '<tr class="bg-danger">'
    matrixTable += '<th >VIX UPPER RANGE</th>'
    matrixTable += '<td>' + vixUpperRange + '</td>'
    matrixTable += '<tr rowspan="2">'
    matrixTable += '<td colspan="2" id="' + chartId + '"></td>'
    matrixTable += '</tr>'


    let toolTip = ''

    toolTip += '<table id="instrument-matrix-table" class="table table-striped table-bordered dt-responsive nowrap">'
    toolTip += '<tbody>' + matrixTable + '</tbody>'
    toolTip += '</table>'

    showTippy(this, toolTip, chartId);
    showChart(chartId, name, vixLowerRange, vixUpperRange, data)

});

function showChart(chartId, name, vixLowerRange, vixUpperRange, data) {
    jQ.when(getHistoricalData(instrumentTokens[name], CURRENT_DAY, CURRENT_DAY, 'minute')).done(function (res) {
        let quote = []
        $.each(res.data.candles, function (index, item) {
            let map = {}
            map['date'] = item[0]
            map.open = item[1]
            map.high = item[2]
            map.low = item[3]
            map.close = item[4]
            quote.push(map);
        })

        let categoryList = []

        let dateIndex = 0
        $.each(quote, function (index, item) {
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

        $.each(quote, function (index, item) {
            let map = {}
            map.open = item.open
            map.high = item.high
            map.low = item.low
            map.close = item.close
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
        line.color = "#403ae7";
        line.startvalue = data.bstrikeOne;
        line.displayvalue = 'Bearish below/Bullish above ' + data.bstrikeOne;
        lines.push(line);

        line = {};
        line.color = "#403ae7";
        line.startvalue = data.ustrikeOne;
        line.displayvalue = 'Bullish above/Bearish below' + data.ustrikeOne;
        lines.push(line);

        line = {};
        line.color = "#9f3ae7";
        line.startvalue = data.bstrikeTwo;
        line.displayvalue = data.bstrikeTwo;
        lines.push(line);

        line = {};
        line.color = "#9f3ae7";
        line.startvalue = data.ustrikeTwo;
        line.displayvalue = data.ustrikeTwo;
        lines.push(line);


        jQ("#" + chartId).insertFusionCharts({
            type: 'candlestick',
            width: "500",
            height: "300",
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


    })

}

function clearLocalStorage() {
    localStorage.removeItem("VIX_QUOTE");
    localStorage.removeItem("INSTRUMENT_LIST_0");
    localStorage.removeItem("INSTRUMENT_LIST_1");
    localStorage.removeItem("INSTRUMENT_LIST_2");
    localStorage.removeItem("INSTRUMENT_LIST_3");
    localStorage.removeItem("INSTRUMENT_LIST_4");
    localStorage.removeItem("INSTRUMENT_LIST_5");
    localStorage.removeItem("INSTRUMENT_LIST_6");
    localStorage.removeItem("INSTRUMENT_TRADE_PRESENT");
    localStorage.removeItem("NIFTY_OCT_FUT");
    localStorage.removeItem("BANKNIFTY_OCT_FUT");


}

function getStrikeDetails(item, instrument) {
    let strikeDiff = getStrikeDiff(instrument);
    let bstrikeOne = (parseFloat(item.price) - strikeDiff);
    let bstrikeTwo = (bstrikeOne - strikeDiff);
    let ustrikeOne = (parseFloat(item.price) + strikeDiff);
    let ustrikeTwo = (ustrikeOne + strikeDiff);

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

function getTrend(item) {
    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];

    var vix = getVixRange(parseFloat(item.prevPrice), parseFloat(vixQuote[4]))

    var vixLowerRange = 0;
    var vixUpperRange = 0;
    var vixDDRange = 0;

    vixLowerRange = parseFloat(vix.vixDDLower)
    vixUpperRange = parseFloat(vix.vixDDUpper)
    vixDDRange = parseFloat(vix.vixDDRange)


    var points = getVixPointsSupportAndResistance(vixLowerRange, vixUpperRange, vixDDRange)

    let openedTrend = ''
    let trend = ''
    let map = {}
    if (item.price <= vixUpperRange && item.price >= points[5]) {
        openedTrend = '<span class=" badge bg-danger trend-class" style="display: inline-block;">OIBR</span>'
        trend = 'OIBR'
    }

    if (item.price >= vixLowerRange && item.price <= points[4]) {
        openedTrend = '<span class="badge bg-success trend-class" style="display: inline-block;">OIBS</span>'
        trend = 'OIBS'
    }

    if (item.price > vixUpperRange) {
        openedTrend = '<span class=" badge bg-danger trend-class" style="display: inline-block;">OAR</span>'
        trend = 'OAR'
    }

    if (item.price < vixLowerRange) {
        openedTrend = '<span class=" badge bg-danger trend-class" style="display: inline-block;">OBS</span>'
        trend = 'OBS'
    }

    if (item.price > points[4] && item.price < points[5]) {
        openedTrend = '<span class=" badge bg-danger trend-class" style="display: inline-block;">OIBSR</span>'
        trend = 'OIBSR'
    }

    map['openedTrend'] = openedTrend;
    map['trend'] = trend;

    return map;

}

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

function getSubtractNumberDiff(number) {
    if (number > 50 && number < 100) {
        return 50
    } else if (number >= 100) {
        return 100
    } else {
        return 25
    }
}

function getSubtractNumber(number) {
    if (number > 50)
        return 100
    else
        return 50
}

function getVixPointsSupportAndResistance(vixLowerRange, vixUpperRange, range) {
    var divide = 6
    var upperRange = vixUpperRange
    var lowerRange = vixLowerRange
    var minRange = range / divide
    var points = []

    var lastURange = upperRange
    var lastLRange = lowerRange
    for (i = 1; i < divide; i++) {
        lastURange = (parseFloat(lastURange) - parseFloat(minRange)).toFixed(2)
        points.push(parseFloat(lastURange));
    }

    for (i = 1; i < divide; i++) {
        lastLRange = (parseFloat(lastLRange) + parseFloat(minRange)).toFixed(2)
        points.push(parseFloat(lastLRange));
    }
    points.sort(function (a, b) { return a - b })
    return points;
}

function calculateVixRange(type, prevQuoteData, prevVixData) {
    var data = {}
    var prevData = prevQuoteData
    var previousClose = prevVixData
    var chg;
    if (type == "DAILY") {
        chg = parseFloat(previousClose) / Math.sqrt(366 - 104 - 13)
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

function getStrikeDiff(instrument) {
    let strikeDiff = 100;
    console.log(instrument + "--> strike diff -->" + nseStrikeDiff[instrument])
    if (nseStrikeDiff[instrument]) {
        strikeDiff = nseStrikeDiff[instrument]
    }
    return strikeDiff;
}

function addToBasket(tradingsymbol, exchange, weight, params, basket) {
    jQ.ajaxSetup({
        headers: {
            'x-csrftoken': `${getCookie('public_token')}`
        }
    });
    return jQ.ajax({
        url: BASE_URL + `/api/baskets/${basket}/items`,
        type: 'POST',
        data: {
            tradingsymbol: tradingsymbol,
            exchange: exchange,
            weight: weight,
            params: JSON.stringify(params)
        }
    });
}

function getWeightAge(index, companyName, onlyWeight) {
    var nifty50WeightAge = {
        "HDFCBANK": 13.52,
        "RELIANCE": 9.20,
        "ICICIBANK": 7.36,
        "INFY": 5.80,
        "LT": 4.39,
        "ITC": 4.31,
        "TCS": 4.05,
        "AXISBANK": 3.22,
        "KOTAKBANK": 2.95,
        "BHARTIARTL": 2.75
    }

    var niftyBankWeightAge = {
        "HDFCBANK": 29.39,
        "ICICIBANK": 22.57,
        "KOTAKBANK": 9.92,
        "AXISBANK": 9.88,
        "SBIN": 9.87,
        "INDUSINDBK": 6.43,
        "BANKBARODA": 2.62,
        "AUBANK": 2.30,
        "FEDERALBNK": 2.13,
        "IDFCFIRSTB": 2.06,
    }


    var html = ''
    var weightAge = ''
    if (index == "NIFTY 50") {
        weightAge = nifty50WeightAge
    }

    if (index == "NIFTY BANK") {
        weightAge = niftyBankWeightAge
    }

    if (onlyWeight) {
        if (weightAge[companyName]) {
            return weightAge[companyName]
        }
    } else {
        if (weightAge[companyName]) {
            html += '<span class="text-end float-end text-warning">'
            html += weightAge[companyName] + " %";
            html += '</span>'
        }
    }
    return html;
}


function showPopUpWindow(index, html, title) {
    var divId = "pop-up-window-" + index;
    if ($("#" + divId).PopupWindow("getState")) $("#" + divId).PopupWindow("destroy");
    $("body").find("#" + divId).remove()
    var popHtml = html
    var popupCustomClass = 'popup-custom-style-' + index;
    $("#" + divId).on("open.popupwindow", function (event, data) {
        $("." + popupCustomClass).find(".popupwindow_titlebar").css({})
    });
    var markup = ''
    markup += '<div id="' + divId + '">'
    markup += popHtml
    markup += '</div>'
    $("body").append(markup);
    $("#" + divId).PopupWindow({
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
        resizable: true,
        resizeOpacity: 1,
        height: 400,
        width: 900,
        keepInViewport: true,              // Boolean
        mouseMoveEvents: true              // Boolean
    });
};


let helpMessage = ''

helpMessage +=''
helpMessage +='1. Check the trend'
helpMessage +='<br>'
helpMessage +='2. Only based on the trend trade VIXL,VIXU,AST,BST for index '
helpMessage +='<br>'
helpMessage +='VIXL/BST  Go for bullish trade'
helpMessage +='<br>'
helpMessage +='VIXU/AST  Go for bearish trade'
helpMessage +='<br>'
helpMessage +='<br>'

helpMessage +='For stocks'
helpMessage +='<br>'
helpMessage +='VIXU Go for bullish trade'
helpMessage +='<br>'
helpMessage +='VIXL Go for bearish trade'
helpMessage +='<br>'
helpMessage +='<br>'


helpMessage +='Check the number of  VIXL and VIXU to make trend prediction'
helpMessage +='<br>'
helpMessage +='Apply the avergaing technique '
helpMessage +='<br>'
helpMessage +='Near/At BST             100 qty'
helpMessage +='<br>'
helpMessage +='Above BST below VIXL    100 qty'
helpMessage +='<br>'
helpMessage +='Above BST/VIXL          100 qty'
helpMessage +='<br>'
helpMessage +='<br>'

helpMessage +='Near/At AST             100 qty'
helpMessage +='<br>'
helpMessage +='Above AST below VIXU    100 qty'
helpMessage +='<br>'
helpMessage +='Above AST/VIXU          100 qty'


jQ(document).ready(function () {
    if (localStorage.getItem("__storejs_kite_ticker/ticks")) {
        let tickData = localStorage.getItem("__storejs_kite_ticker/ticks")
        tickData = JSON.parse(tickData);
      console.log(tickData)
    }
})
