const my_css = GM_getResourceText("TOASTIFY_CSS");
const boot_css = GM_getResourceText("BOOTSTRAP_CSS");
const common_css = GM_getResourceText("COMMON_CSS");
const popup_window_css = GM_getResourceText("POPUP_WINDOW_CSS");
const sackbar_css = GM_getResourceText("SACKBAR_CSS");

GM_addStyle(my_css);
GM_addStyle(sackbar_css);
GM_addStyle(boot_css);
GM_addStyle(common_css);
GM_addStyle(popup_window_css);

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
        nifty_future_token: {
            type: 'text',
            default: 0
        },
        bank_nifty_future_yoken: {
            type: 'text',
            default: 0
        },
        refresh_time: {
            type: 'text',
            default: 60
        },
    }
});

const VERSION = "v1.0";
const BASE_URL = "https://kite.zerodha.com";
const PREVIOUS_DAY_DATE = g_config.get('previous_day_date');
const CURRENT_DAY = g_config.get('current_day_date');
const D_LEVEL = g_config.get('logging');
let date = new Date().toJSON().slice(0, 10);
const BASKET = g_config.get('basket');
const MARGIN = g_config.get('margin');
let weightIndex = []
const NIFTY_FUTURE_TOKEN = g_config.get('nifty_future_token');
const BANK_NIFTY_FUTURE_TOKEN = g_config.get('bank_nifty_future_yoken');
let futureInstruments = {
    'NIFTY_FUTURE': NIFTY_FUTURE_TOKEN,
    'BANK_NIFTY_FUTURE': BANK_NIFTY_FUTURE_TOKEN,
}
const REFRESH_TIME = g_config.get('refresh_time');

async function callAddToWatchList() {
    for (let i = 0; i < FO_LIST.length; i++) {
        if ((i + 1) <= 100) {
            addToWatchList("NSE", FO_LIST[i], (i + 1), 2)
        } else {
            addToWatchList("NSE", FO_LIST[i], (i + 1), 3)
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
        saveVixQuote();
        showFutureAi();
    }, 2000)
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
    html += '<a href="#" id="clean-storage">'
    html += 'Clean'
    html += '</a>'
    html += '<a href="#" id="add-to-watch-list" style="display:none;">'
    html += 'Add Watchlist'
    html += '</a>'
    jQ('body').first().find(".app-nav").append(html);
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

async function autoRefreshEachTabs() {
    clearInterval(timerInstance)
    let marketWatchSideBar = jQ(".marketwatch-sidebar");
    let tabs = marketWatchSideBar.find(".marketwatch-selector a.item");
    for (let i = 0; i < (tabs.length - 4); i++) {
        jQ(".marketwatch-selector a.item")[i].click();
        await callSleepForAWhile(1000);
        generateTrend();
        await callSleepForAWhile(1000);
    }
    await analyseFutureIntruments();
    getNiftyBullsBearsCount();
    getBankNiftyBullsBearsCount();
    getAllBullsBearsCount();
    startRefresh()
}


function getNiftyBullsBearsCount(){
    let bears = 0;
    let bulls= 0;
    $.each(NIFTY_50_LIST,function(index,item){
        let data = infoMap[item]
        if(data['trends']){
            if ($.inArray("VIXL",data['trends']) != -1) {
                bears++
            }

            if ($.inArray("VIXU",data['trends']) != -1) {
                bulls++
            }
        }
    });
    bulls = '<span class="badge bg-success">' + bulls + '</span>'
    bears = '<span class="badge bg-danger">' + bears + '</span>'
    $("#nifty-bulls").html(bulls);
    $("#nifty-bears").html(bears);
}


function getBankNiftyBullsBearsCount(){
    let bears = 0;
    let bulls= 0;
    $.each(NIFTY_BANK_LIST,function(index,item){
        let data = infoMap[item]
        if(data['trends']){
            if ($.inArray("VIXL",data['trends']) != -1) {
                bears++
            }

            if ($.inArray("VIXU",data['trends']) != -1) {
                bulls++
            }
        }
    });
    bulls = '<span class="badge bg-success">' + bulls + '</span>'
    bears = '<span class="badge bg-danger">' + bears + '</span>'
    $("#bank-nifty-bulls").html(bulls);
    $("#bank-nifty-bears").html(bears);
}

function getAllBullsBearsCount(){
    let bears = 0;
    let bulls= 0;
    $.each(FO_LIST,function(index,item){
        let data = infoMap[item]
        if(data['trends']){
            if ($.inArray("VIXL",data['trends']) != -1) {
                bears++
            }

            if ($.inArray("VIXU",data['trends']) != -1) {
                bulls++
            }
        }
    });
    bulls = '<span class="badge bg-success">' + bulls + '</span>'
    bears = '<span class="badge bg-danger">' + bears + '</span>'
    $("#all-bulls").html(bulls);
    $("#all-bears").html(bears);
}

jQ(document).on("click", "#start-auto-refresh", function () {
    var that = $(this);
    that.attr("disabled", true)
    clearInterval(timerInstance)
    autoRefreshEachTabs()
})

function startRefresh() {
    var display = document.querySelector('#refresh-timer-one');
    startTimer(REFRESH_TIME, display);
};

function startTimer(duration, display) {
    if (!duration) {
        duration = 60
    }
    var timer = duration, minutes, seconds;
    timerInstance = setInterval(function () {
        minutes = parseInt(timer / 60, 10);
        seconds = parseInt(timer % 60, 10);

        display.textContent = minutes + ":" + seconds;

        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;
        if (--timer < 0) {
            autoRefreshEachTabs()
            timer = duration;
        }
    }, 1000);
}


function showFutureAi() {
    let html = ''
    html += '<div class="row mb-3">'
    html += '<div class="col-md-9">'
     html += '</div>'
    html += '<div class="col-md-2">'
    html += '<button class="btn btn-warning btn-sm" id="start-auto-refresh"><i class="bi bi-arrow-counterclockwise"></i>Refresh</button>'
    html += '</div>'
    html += '<div class="col-md-1">'
    html += '<span id="refresh-timer-one">00:00</span>'
    html += '</div>'
    html += '</div>'

    html += '<div class="row">'
    html += '<div class="col-md-6">'
    html += '<div class="card" >'
    html += '<div class="card-header">'
    html += 'NIFTY FUTURES'
    html += '</div>'
    html += '<ul class="list-group list-group-flush">'
    html += '<li class="list-group-item" id="nifty-future-ai-trend-plus">An item</li>'
    html += '<li class="list-group-item" id="nifty-future-ai-trend-minus">A second item</li>'
    html += '</ul>'
    html += '</div>'
    html += '</div>'
    html += '<div class="col-md-6">'
    html += '<div class="card" >'
    html += '<div class="card-header">'
    html += 'BANK NIFTY FUTURES'
    html += '</div>'
    html += '<ul class="list-group list-group-flush">'
    html += '<li class="list-group-item" id="bank-nifty-future-ai-trend-plus">An item</li>'
    html += '<li class="list-group-item" id="bank-nifty-future-ai-trend-minus">A second item</li>'
    html += '</ul>'
    html += '</div>'
    html += '</div>'
    html += '</div>'




    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'

    html += '<div class="row">'

    html += '<div class="col-md-4">'
    html += '<div class="card" >'
    html += '<div class="card-header">'
    html += 'NIFTY 50'
    html += '</div>'
    html += '<ul class="list-group list-group-flush">'
    html += '<li class="list-group-item" id="nifty-bulls">0</li>'
    html += '<li class="list-group-item" id="nifty-bears">0</li>'
    html += '</ul>'
    html += '</div>'
    html += '</div>'


    html += '<div class="col-md-4">'
    html += '<div class="card" >'
    html += '<div class="card-header">'
    html += 'BANK NIFTY '
    html += '</div>'
    html += '<ul class="list-group list-group-flush">'
    html += '<li class="list-group-item" id="bank-nifty-bulls">0</li>'
    html += '<li class="list-group-item" id="bank-nifty-bears">0</li>'
    html += '</ul>'
    html += '</div>'
    html += '</div>'


    html += '<div class="col-md-4">'
    html += '<div class="card" >'
    html += '<div class="card-header">'
    html += 'ALL '
    html += '</div>'
    html += '<ul class="list-group list-group-flush">'
    html += '<li class="list-group-item" id="all-bulls">0</li>'
    html += '<li class="list-group-item" id="all-bears">0</li>'
    html += '</ul>'
    html += '</div>'
    html += '</div>'


     html += '</div>'


    showPopUpWindow('trend-analysis', html, "Trend Analysis")
}

async function generateTrend() {
    saveVixQuote();
    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];
    let marketWatchSideBar = jQ(".marketwatch-sidebar");
    let tabs = marketWatchSideBar.find(".marketwatch-selector a.item");
    let instrumentsWrapper = jQ(".instruments");
    let instruments = instrumentsWrapper.find(".vddl-list .instrument");
    jQ.each(tabs, function (index, item) {
        if (index == 0 || index == 1 || index == 2) {
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

                let bulls = 0;
                let bears = 0;
                let instrumentsMap = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL"));
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
                        that.find(".info-wrapper").find(".strike-info").remove();
                        that.find(".info-wrapper").find(".show-info").remove();
                        that.find(".info-wrapper").find(".quantity-to-buy").remove();
                        that.find(".info-wrapper").find(".price-moved").remove();
                        that.find(".info-wrapper").find(".show-chart").remove();
                        that.find(".info-wrapper").find(".create-alerts").remove();

                        let quantity = (MARGIN / (parseFloat(price) / 5)).toFixed(0)

                        let strikeData = getStrikeDetails(instrumentsMap[name], name);

                        let currentPrice = parseFloat(price.trim()).toFixed(2);
                        let trend = "NA"
                        let trends = []

                        var vix = getVixRange(parseFloat(instrumentsMap[name].prevPrice), parseFloat(vixQuote[4]))
                        var vixLowerRange = 0;
                        var vixUpperRange = 0;
                        var vixDDRange = 0;

                        vixLowerRange = parseFloat(vix.vixDDLower)
                        vixUpperRange = parseFloat(vix.vixDDUpper)
                        vixDDRange = parseFloat(vix.vixDDRange)

                        if (currentPrice >= parseFloat(strikeData['ustrikeTwo'])) {
                            let strike = '<div class="badge bg-info above-strike-two strike-info">AST</div>'
                            that.find(".info-wrapper").append(strike);
                            trend = "AST"
                            trends.push(trend);
                        }

                        if (currentPrice >= parseFloat(strikeData['ustrikeOne'])) {
                            let strike = '<div class="badge bg-info above-strike-one strike-info">ASO</div>'
                            that.find(".info-wrapper").append(strike);
                            trend = "ASO"
                            trends.push(trend);
                        }
                        if (currentPrice <= parseFloat(strikeData['bstrikeTwo'])) {
                            let strike = '<div class="badge bg-info below-strike-two strike-info">BST</div>'
                            that.find(".info-wrapper").append(strike);
                            trend = "BST"
                            trends.push(trend);
                        }

                        if (currentPrice <= parseFloat(strikeData['bstrikeOne'])) {
                            let strike = '<div class="badge bg-info below-strike-one strike-info">BSO</div>'
                            that.find(".info-wrapper").append(strike);
                            trend = "BSO"
                            trends.push(trend);
                        }

                        if (currentPrice <= parseFloat(vixLowerRange)) {
                            let strike = '<div class="badge bg-info below-strike-one strike-info">VIXL</div>'
                            that.find(".info-wrapper").append(strike);
                            trend = "VIXL"
                            trends.push(trend);
                        }

                        if (currentPrice >= parseFloat(vixUpperRange)) {
                            let strike = '<div class="badge bg-info below-strike-one strike-info">VIXU</div>'
                            that.find(".info-wrapper").append(strike);
                            trend = "VIXU"
                            trends.push(trend);
                        }

                        let infoObj = {}

                        infoObj['instrument'] = instrumentsMap[name]
                        infoObj['vix'] = vix
                        infoObj['strikeData'] = strikeData
                        infoObj['trends'] = trends;
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

                        let alerts = '<div data-index="' + index + '" data-name="' + name + '" class="badge bg-secondary create-alerts">a</div>'
                        that.find(".info-wrapper").append(alerts);
                    }
                });

                jQ(item).find(".bullsVersesBears").remove();
                jQ(item).find(".add-all-scripts").remove();
                let countMaprkup = ''
                countMaprkup += '<span class="bullsVersesBears bg-success">' + bulls + '</span>'
                countMaprkup += '<span class="bullsVersesBears bg-danger">' + bears + '</span>'
                jQ(item).append(countMaprkup)
            }
        }
    });
}

async function analyseFutureIntruments() {
    for (var key in futureInstruments) {
        if (futureInstruments.hasOwnProperty(key)) {
            savePreviousFutureQuote(key)
            getCurrentFutureQuote(key)
            let currentQuote = JSON.parse(localStorage.getItem(key + "_CURRENT_QUOTE"))
            let prevQuote = JSON.parse(localStorage.getItem(key));
            aiFutureAnalysis(currentQuote, prevQuote, key)
        }
    }
}

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
        tempName = tempName.replaceAll("&", "-")

        let chartId = 'chart-' + tempName;

        var html = ''
        let btnColor = "bg-success"
        if (trend == "VIXL") {
            btnColor = "bg-danger"
        }
        if (index != 0) {
            html += '<div style="width:100%;text-align:center;">'
            html += '<div class="col-md-4" style="display:inline;margin-right:1rem;">'
            html += '<button  data-name="' + name + '" data-price="' + price + '"  data-trend="' + trend + '" class="btn-sm btn btn-primary ms-1 place-order ' + btnColor + '" type="submit">';
            html += 'Place Order'
            html += '</button>'
            html += '</div>'
            html += '<div class="col-md-4" style="display:inline;">'
            html += '<button  data-name="' + name + '" data-price="' + price + '"  data-trend="' + trend + '" class="btn-sm btn btn-primary ms-1 place-sl-order" type="submit">';
            html += 'Place SL Order'
            html += '</button>'
            html += '</div>'
            html += '</div>'
        }

        html += '<div id="' + chartId + '" style="width:100%;">'
        html += '</div>'
        showPopUpWindow(tempName, html, name + " : " + trend);
        show5MinutesChart(quote, name)
    })
});

$(document).on("click", ".place-sl-order", function () {
    let name = jQ(this).attr("data-name");
    let trend = jQ(this).attr("data-trend");
    let price = 0
    let trigger_price = 0;
    let data = infoMap[name];


    vixLowerRange = parseFloat(data['vix']['vixDDLower'])
    vixUpperRange = parseFloat(data['vixDDUpper'])

    if (trend == "VIXL" || trend == "VIXU") {
        let transaction_type = "BUY"
        if (trend == "VIXU") {
            trigger_price = vixUpperRange;
            price = vixUpperRange - 2
            transaction_type = "SELL"
        } else {
            trigger_price = vixLowerRange;
            price = vixLowerRange + 2
        }
        let quantity = (MARGIN / (parseFloat(price) / 5)).toFixed(0)
        let params = { "exchange": "NSE", "tradingsymbol": name, "transaction_type": transaction_type, "product": "MIS", "order_type": "SL", "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": price, "trigger_price": trigger_price, "disclosed_quantity": 0, "tags": [] }
        placeOrder(params)
    }
})

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
        let params = { "exchange": "NSE", "tradingsymbol": name, "transaction_type": transaction_type, "product": "MIS", "order_type": "MARKET", "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": 0, "trigger_price": 0, "disclosed_quantity": 0, "tags": [] }
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

function aiFutureAnalysis(currentQuote, prevQuote, name) {
    let trend;
    if (name == "NIFTY_FUTURE") {
        trend = showAiNiftyPrediction(currentQuote, prevQuote, name)
        $("#nifty-future-ai-trend-plus").html(trend['PLUS'])
        $("#nifty-future-ai-trend-minus").html(trend['MINUS'])
    }
    if (name == "BANK_NIFTY_FUTURE") {
        trend = showAiBankNiftyPrediction(currentQuote, prevQuote, name)
        $("#bank-nifty-future-ai-trend-plus").html(trend['PLUS'])
        $("#bank-nifty-future-ai-trend-minus").html(trend['MINUS'])
    }
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


jQ(document).on("click", ".create-alerts", function () {
    let name = jQ(this).attr("data-name");
    let index = jQ(this).attr("data-index");
    let data = infoMap[name];
    lhs_tradingsymbol = name

    let lhs_exchange = "INDICES"
    if (index != 0) {
        lhs_exchange = "NSE"
    }

    let ast = data['strikeData']['ustrikeTwo'];
    createAlert(name + "-" + 'AST', lhs_tradingsymbol, ast, ">=", lhs_exchange)

    let bst = data['strikeData']['bstrikeTwo'];
    createAlert(name + "-" + 'BST', lhs_tradingsymbol, bst, "<=", lhs_exchange)

    let vixu = data['vix']['vixDDUpper'];
    createAlert(name + "-" + 'VIXU', lhs_tradingsymbol, vixu, ">=", lhs_exchange)

    let vixl = data['vix']['vixDDLower'];
    createAlert(name + "-" + 'VIXL', lhs_tradingsymbol, vixl, "<=", lhs_exchange)



});


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
    localStorage.removeItem("INSTRUMENT_LIST_GLOBAL");
    localStorage.removeItem("NIFTY_FUTURE");
    localStorage.removeItem("BANK_NIFTY_FUTURE");
    localStorage.removeItem("BANK_NIFTY_FUTURE_CURRENT_QUOTE")
    localStorage.removeItem("NIFTY_FUTURE_CURRENT_QUOTE")

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
    console.log(instrument + " (" + nseStrikeDiff[instrument] + ")")
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


