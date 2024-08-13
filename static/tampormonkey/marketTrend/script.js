const my_css = GM_getResourceText("TOASTIFY_CSS");
const boot_css = GM_getResourceText("BOOTSTRAP_CSS");
const common_css = GM_getResourceText("COMMON_CSS");
const popup_window_css = GM_getResourceText("POPUP_WINDOW_CSS");


GM_addStyle(my_css);
GM_addStyle(boot_css);
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
        basket: {
            type: 'text',
            default: 26157565
        },
        margin: {
            type: 'text',
            default: 10000
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
const D_LEVEL = g_config.get('logging');
let date = new Date().toJSON().slice(0, 10);
const BASKET = g_config.get('basket');
const MARGIN = g_config.get('margin');
let weightIndex = []
let nseStrikeDiff = {
    'AARTIIND': 20,
    'ABB': 100,
    'ABBOTINDIA': 500,
    'ABCAPITAL': 5,
    'ABFRL': 5,
    'ACC': 20,
    'ADANIENT': 50,
    'ADANIPORTS': 20,
    'ALKEM': 100,
    'AMBUJACEM': 10,
    'APOLLOHOSP': 50,
    'APOLLOTYRE': 5,
    'ASHOKLEY': 5,
    'ASIANPAINT': 20,
    'ASTRAL': 20,
    'ATUL': 100,
    'AUBANK': 10,
    'AUROPHARMA': 20,
    'AXISBANK': 10,
    'BAJAJ-AUTO': 100,
    'BAJAJFINSV': 20,
    'BAJFINANCE': 100,
    'BALKRISIND': 40,
    'BALRAMCHIN': 5,
    'BANDHANBNK': 5,
    'BANKBARODA': 5,
    'BATAINDIA': 20,
    'BEL': 5,
    'BERGEPAINT': 10,
    'BHARATFORG': 40,
    'BHARTIARTL': 20,
    'BHEL': 10,
    'BIOCON': 10,
    'BOSCHLTD': 500,
    'BPCL': 10,
    'BRITANNIA': 50,
    'BSOFT': 20,
    'CANBK': 5,
    'CANFINHOME': 20,
    'CHAMBLFERT': 10,
    'CHOLAFIN': 20,
    'CIPLA': 20,
    'COALINDIA': 10,
    'COFORGE': 200,
    'COLPAL': 40,
    'CONCOR': 20,
    'COROMANDEL': 20,
    'CROMPTON': 10,
    'CUB': 2,
    'CUMMINSIND': 80,
    'DABUR': 10,
    'DALBHARAT': 40,
    'DEEPAKNTR': 40,
    'DIVISLAB': 50,
    'DIXON': 200,
    'DLF': 20,
    'DRREDDY': 50,
    'EICHERMOT': 50,
    'ESCORTS': 40,
    'EXIDEIND': 10,
    'FEDERALBNK': 5,
    'GAIL': 5,
    'GLENMARK': 40,
    'GMRINFRA': 2,
    'GNFC': 20,
    'GODREJCP': 20,
    'GODREJPROP': 100,
    'GRANULES': 10,
    'GRASIM': 20,
    'GUJGASLTD': 10,
    'HAL': 50,
    'HAVELLS': 40,
    'HCLTECH': 20,
    'HDFCAMC': 100,
    'HDFCBANK': 10,
    'HDFCLIFE': 5,
    'HEROMOTOCO': 100,
    'HINDALCO': 10,
    'HINDCOPPER': 5,
    'HINDPETRO': 5,
    'HINDUNILVR': 20,
    'ICICIBANK': 10,
    'ICICIGI': 40,
    'ICICIPRULI': 10,
    'IDEA': 2,
    'IDFC': 2,
    'IDFCFIRSTB': 1,
    'IEX': 5,
    'IGL': 10,
    'INDHOTEL': 10,
    'INDIACEM': 5,
    'INDIAMART': 40,
    'INDIGO': 100,
    'INDUSINDBK': 20,
    'INDUSTOWER': 10,
    'INFY': 20,
    'IOC': 5,
    'IPCALAB': 40,
    'IRCTC': 20,
    'ITC': 5,
    'JINDALSTEL': 20,
    'JKCEMENT': 100,
    'JSWSTEEL': 10,
    'JUBLFOOD': 10,
    'KOTAKBANK': 20,
    'LALPATHLAB': 40,
    'LAURUSLABS': 10,
    'LICHSGFIN': 20,
    'LT': 50,
    'LTF': 5,
    'LTIM': 50,
    'LTTS': 100,
    'LUPIN': 40,
    'M&M': 50,
    'M&MFIN': 5,
    'MANAPPURAM': 5,
    'MARICO': 10,
    'MARUTI': 100,
    'MCX': 100,
    'METROPOLIS': 40,
    'MFSL': 20,
    'MGL': 40,
    'MOTHERSON': 2,
    'MPHASIS': 100,
    'MRF': 1000,
    'MUTHOOTFIN': 40,
    'NATIONALUM': 5,
    'NAUKRI': 100,
    'NAVINFLUOR': 40,
    'NESTLEIND': 20,
    'NMDC': 5,
    'NTPC': 5,
    'OBEROIRLTY': 40,
    'OFSS': 200,
    'ONGC': 5,
    'PAGEIND': 500,
    'PEL': 20,
    'PERSISTENT': 200,
    'PETRONET': 5,
    'PFC': 10,
    'PIDILITIND': 40,
    'PIIND': 100,
    'PNB': 5,
    'POLYCAB': 100,
    'POWERGRID': 5,
    'PVRINOX': 40,
    'RAMCOCEM': 20,
    'RBLBANK': 10,
    'RECLTD': 20,
    'RELIANCE': 20,
    'SAIL': 5,
    'SBICARD': 10,
    'SBILIFE': 20,
    'SBIN': 10,
    'SHREECEM': 500,
    'SHRIRAMFIN': 40,
    'SIEMENS': 100,
    'SRF': 40,
    'SUNPHARMA': 20,
    'SUNTV': 10,
    'SYNGENE': 20,
    'TATACHEM': 20,
    'TATACOMM': 40,
    'TATACONSUM': 10,
    'TATAMOTORS': 10,
    'TATAPOWER': 10,
    'TATASTEEL': 5,
    'TCS': 50,
    'TECHM': 20,
    'TITAN': 20,
    'TORNTPHARM': 40,
    'TRENT': 100,
    'TVSMOTOR': 40,
    'UBL': 40,
    'ULTRACEMCO': 100,
    'UNITDSPR': 20,
    'UPL': 5,
    'VEDL': 20,
    'VOLTAS': 20,
    'WIPRO': 5,
    'ZYDUSLIFE': 20,
    'NIFTY 50': 50,
    'NIFTY MID SELECT': 25,
    'NIFTY FIN SERVICE': 50,
    'NIFTY BANK': 100,
    'BANKEX': 100,
}


jQ(document).ready(function () {
    setTimeout(function () {
        makeUIChanges();
        saveVixQuote()
    }, 2000)

});

function saveVixQuote() {
    if (!sessionStorage.getItem("VIX_QUOTE")) {
        jQ.when(getHistoricalData(264969, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE)).done(function (res) {
            sessionStorage.setItem("VIX_QUOTE", JSON.stringify(res));
        })
    }
}

function makeUIChanges() {
    var html = '';
    html += '<a href="#" id="get-entoken">'
    html += 'Token'
    html += '</a>'
    jQ('body').first().find(".app-nav").append(html);
}

jQ(document).on("click", "#get-entoken", function (e) {
    e.preventDefault();
    navigator.clipboard.writeText(getCookie('enctoken'));
    saveToken()
});

function saveToken() {
    return jQ.ajax({
        type: 'POST',
        url: 'http://localhost:9080/saveToken',
        data: { token: getCookie('enctoken') },
    });
}


function callSleepForAWhile() {
    return new Promise((resolve, reject) => {
        setTimeout(function () {
            resolve();
        }, 2000)
    });
}

window.jQ = jQuery.noConflict(true);
let instrumentsMap = {}


async function generateTrend() {
    await callSleepForAWhile();
    let marketWatchSideBar = jQ(".marketwatch-sidebar");
    let tabs = marketWatchSideBar.find(".marketwatch-selector a.item");
    let instrumentsWrapper = jQ(".instruments");
    let instruments = instrumentsWrapper.find(".vddl-list .instrument");
    jQ.each(tabs, function (index, item) {
        if (jQ(item).hasClass("selected")) {
            instrumentsMap = {}
            if (!sessionStorage.getItem("INSTRUMENT_LIST_" + index)) {
                if (instruments.length > 0) {
                    jQ(instruments).each(function (iindex, iitem) {
                        let name = jQ(this).find(".symbol").find(".nice-name").html();
                        let price = jQ(this).find(".price").find(".last-price").html();
                        let perc = jQ(this).find(".price-change").find(".price-absolute").html();
                        let insMap = {}
                        insMap['name'] = name.trim();
                        insMap['price'] = parseFloat(price.trim()).toFixed(2)
                        insMap['perc'] = perc.trim();
                        let prevPrice = parseFloat(price.trim()) - parseFloat(perc.trim());
                        insMap['prevPrice'] = parseFloat(prevPrice).toFixed(2);
                        instrumentsMap[name] = insMap;
                    });
                    sessionStorage.setItem("INSTRUMENT_LIST_" + index, JSON.stringify(instrumentsMap));
                }
            } else {
                instrumentsMap = JSON.parse(sessionStorage.getItem("INSTRUMENT_LIST_" + index));
            }
            let bulls = 0;
            let bears = 0;
            jQ(instruments).each(function (iindex, iitem) {
                let name = jQ(this).find(".symbol").find(".nice-name").html();
                let price = jQ(this).find(".price").find(".last-price").html();
                if (name != "INDIA VIX") {
                    let that = jQ(this);
                    that.find(".symbol").find(".trend-class").remove();
                    that.find(".symbol").find(".draw-points").remove();
                    that.find(".symbol").find(".add-to-basket").remove();
                    let trendMap = getTrend(instrumentsMap[name])
                    if (trendMap['trend'] == "OIBS") {
                        bulls++;
                    } else {
                        bears++;
                    }
                    that.find(".symbol").prepend(trendMap['openedTrend']);
                    that.find(".symbol").find(".trend-class").attr("data-name", name);
                    let draw = '<span data-trend="' + trendMap['trend'] + '" data-name="' + name + '" class="badge bg-secondary draw-points">Draw</span>'
                    let add = '<span data-price="' + price + '" data-trend="' + trendMap['trend'] + '" data-name="' + name + '" class="badge bg-primary add-to-basket">+</span>'
                    that.find(".symbol").prepend(draw);
                    that.find(".symbol").prepend(add);
                }
            });

            jQ(item).find(".bullsVersesBears").remove();
            let countMaprkup = ''
            countMaprkup += '<span class="bullsVersesBears bg-success">' + bulls + '</span>'
            countMaprkup += '<span class="bullsVersesBears bg-danger">' + bears + '</span>'
            jQ(item).append(countMaprkup)
        }
    })
}


jQ(document).on("click", ".add-to-basket", function () {
    let name = jQ(this).attr("data-name");
    let trend = jQ(this).attr("data-trend");
    let price = jQ(this).attr("data-price");
    let transaction_type = "SELL"
    if (trend == "OIBS") {
        transaction_type = "BUY"
    }
    let quantity = (MARGIN / (parseFloat(price) / 5)).toFixed(0)
    let params = { "transaction_type": transaction_type, "product": "MIS", "order_type": "MARKET", "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": 0, "trigger_price": 0, "disclosed_quantity": 0, "tags": [] }
    let tradingsymbol = name
    let exchange = "NSE"
    let weight = (weightIndex.length + 1)
    addToBasket(tradingsymbol, exchange, weight, params)
    weightIndex.push(name)
});




jQ(document).on("click", ".marketwatch-selector a.item", function () {
    generateTrend()
});


jQ(document).on("click", ".draw-points", function () {
    let name = jQ(this).attr("data-name");
    let trend = jQ(this).attr("data-trend");
    let strikeData = getStrikeDetails(instrumentsMap[name], name);

    let vixQuote = JSON.parse(sessionStorage.getItem("VIX_QUOTE")).data['candles'][0];

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

    lineMap = { coordinates: strikeData.bstrikeOne, color: 1, label: 'Below Strike 1 (Bearish Below)' }
    lineArr.push(lineMap)
    lineMap = { coordinates: strikeData.bstrikeTwo, color: 1, label: 'Below Strike 2 (Bearish Below)' }
    lineArr.push(lineMap)

    lineMap = { coordinates: strikeData.ustrikeOne, color: 2, label: 'Above Strike 1 (Bullish Above)' }
    lineArr.push(lineMap)
    lineMap = { coordinates: strikeData.ustrikeTwo, color: 2, label: 'Above Strike 2 (Bullish Above)' }
    lineArr.push(lineMap)

    lineMap = { coordinates: vixLowerRange, color: 3, label: 'Vix Lower Range ( If breaks are working. It should stop here) ' }
    lineArr.push(lineMap)
    lineMap = { coordinates: vixUpperRange, color: 4, label: 'Vix Upper Range ( If breaks are working. It should stop here)' }
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


jQ(document).on("click", ".trend-class", function () {
    let name = jQ(this).attr("data-name");
    let data = getStrikeDetails(instrumentsMap[name], name);

    let vixQuote = JSON.parse(sessionStorage.getItem("VIX_QUOTE")).data['candles'][0];

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
    matrixTable += '</tr>'


    let toolTip = ''
    toolTip += ''

    toolTip += '<table id="instrument-matrix-table" class="table table-striped table-bordered dt-responsive nowrap">'
    toolTip += '<tbody>' + matrixTable + '</tbody>'
    toolTip += '</table>'

    showTippy(this, toolTip)
})


function getStrikeDetails(item, instrument) {
    let strikeDiff = getStrikeDiff(instrument);
    let bstrikeOne = (parseFloat(item.price) - strikeDiff);
    let bstrikeTwo = (bstrikeOne - strikeDiff);
    let ustrikeOne = (parseFloat(item.price) + strikeDiff);
    let ustrikeTwo = (ustrikeOne + strikeDiff);

    let map = {}
    map['strikeDiff'] = strikeDiff;
    map['bstrikeOne'] = bstrikeOne;
    map['bstrikeTwo'] = bstrikeTwo;
    map['ustrikeOne'] = ustrikeOne;
    map['ustrikeTwo'] = ustrikeTwo;

    return map;


}

function showTippy(target, msg) {
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




function getHistoricalData(code, fromDate, toDate) {
    jQ.ajaxSetup({
        headers: {
            'Authorization': `enctoken ${getCookie('enctoken')}`
        }
    });
    return jQ.ajax({
        url: BASE_URL + `/oms/instruments/historical/${code}/day?user_id=HY8031&oi=1&from=${fromDate}&to=${toDate}`,
        type: 'GET',
        async: true,
        cache: false,
    });
}

function getTrend(item) {
    let vixQuote = JSON.parse(sessionStorage.getItem("VIX_QUOTE")).data['candles'][0];

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
    points.sort()
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


function addToBasket(tradingsymbol, exchange, weight, params) {
    jQ.ajaxSetup({
        headers: {
            'x-csrftoken': `${getCookie('public_token')}`
        }
    });
    return jQ.ajax({
        url: BASE_URL + `/api/baskets/${BASKET}/items`,
        type: 'POST',
        data: {
            tradingsymbol: tradingsymbol,
            exchange: exchange,
            weight: weight,
            params: JSON.stringify(params)
        }
    });
}
