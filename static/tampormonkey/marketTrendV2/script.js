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
            default: 8961282
        },
        bank_nifty_future_token: {
            type: 'text',
            default: 8966402
        },
        crude_oil_m_future_token: {
            type: 'text',
            default: 111570951
        },
        refresh_time: {
            type: 'text',
            default: 60
        },
        historical_data_interval: {
            type: 'text',
            default: '3minute'
        },
        sl_points: {
            type: 'text',
            default: '5'
        },
        nifty_future_name: {
            type: 'text',
            default: 'NIFTY24DECFUT'
        },
        bank_nifty_future_name: {
            type: 'text',
            default: 'BANKNIFTY24DECFUT'
        },
        crude_oil_m_future_name: {
            type: 'text',
            default: 'CRUDEOILM25JANFUT'
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
const BANK_NIFTY_FUTURE_TOKEN = g_config.get('bank_nifty_future_token');
const CRUDE_OIL_M_FUTURE_TOKEN = g_config.get('crude_oil_m_future_token');
const HISTORICAL_DATA_INTERVAL = g_config.get('historical_data_interval');
const SL_POINTS = parseInt(g_config.get('sl_points'));

const NIFTY_FUTURE_NAME = g_config.get('nifty_future_name');
const BANK_NIFTY_FUTURE_NAME = g_config.get('bank_nifty_future_name');
const CRUDE_OIL_M_FUTURE_NAME = g_config.get('crude_oil_m_future_name');

let futureNames = {
    'NIFTY_FUTURE': NIFTY_FUTURE_NAME,
    'BANK_NIFTY_FUTURE': BANK_NIFTY_FUTURE_NAME,
    "CRUDE_OIL_M_FUTURE": CRUDE_OIL_M_FUTURE_NAME
}


let futureInstruments = {
    'NIFTY_FUTURE': NIFTY_FUTURE_TOKEN,
    'BANK_NIFTY_FUTURE': BANK_NIFTY_FUTURE_TOKEN,
}

let futureTokens = {
    'NIFTY_FUTURE': NIFTY_FUTURE_TOKEN,
    'BANK_NIFTY_FUTURE': BANK_NIFTY_FUTURE_TOKEN,
    "CRUDE_OIL_M_FUTURE": CRUDE_OIL_M_FUTURE_TOKEN
}
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
        saveVixQuote();
        /*parseChartJson()*/
    }, 2000)

});

jQ(document).on("click", "#show-ai-prediction", function (e) {
    e.preventDefault();
    showFutureAi();
    generateFutreIntruments();
});


function saveVixQuote() {
    return new Promise((resolve, reject) => {
        if (!localStorage.getItem("VIX_QUOTE")) {
            jQ.when(getHistoricalData(264969, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day')).done(function (res) {
                localStorage.setItem("VIX_QUOTE", JSON.stringify(res));
            })
        } else {
            resolve();
        }
    });
}

function makeUIChanges() {
    var html = '';
    html += '<a href="#" id="add-to-watch-list" style="display:none;">'
    html += 'Add Watchlist'
    html += '</a>'
    jQ('body').first().find(".app-nav").append(html);

    html = '';
    html += '<a href="#" id="show-ai-prediction" style="padding:10px;">'
    html += 'AI'
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
        await callSleepForAWhile(1000);
    }

    /*Reset to first tab*/
    jQ(".marketwatch-selector a.item")[0].click();
    await callSleepForAWhile(1000);
    generateTrend();
    await callSleepForAWhile(1000);

    await analyseFutureIntruments();
    getIndicesBullsBearsCount()
    getNiftyBullsBearsCount();
    getBankNiftyBullsBearsCount();
    getAllBullsBearsCount();

    let data = [];
    jQ.each(instrumentsMap, function (index, item) {
        let obj = {}
        obj['TRADINGSYMBOL'] = index
        obj['CLOSE'] = instrumentsMap[index]['prevPrice']
        obj['PRICE'] = instrumentsMap[index]['price']
        obj['PERC'] = instrumentsMap[index]['perc']
        obj['WEIGHTAGE'] = 0


        obj['TREND'] = ''
        obj['LTP'] = 0
        if (infoMap[index]) {
            obj['TREND'] = infoMap[index]['trends']
            obj['LTP'] = infoMap[index]['currentPrice']
            obj['STRIKEDATA'] = infoMap[index]['strikeData']
            obj['VIX'] = infoMap[index]['vix']
        }
        data.push(obj)
    })
    generateStockDataTable(data);
    jQ("#last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
    startRefresh();
    if (instance) {
        instance.attr("disabled", false)
    }

}

jQ(document).on("click", ".filter-instruments", function (e) {
    let indexType = jQ(this).attr("data-index-name");
    let trendType = jQ(this).attr("data-trend-type");
    filterInstruments(indexType, trendType)
})



function filterInstruments(indexType, trendType) {
    let listType = FO_LIST;
    let WEIGHTAGE = NIFTY_50_WEIGHT;
    if (indexType == "NIFTY 50") {
        listType = NIFTY_50_LIST;
    }

    if (indexType == "BANK NIFTY") {
        listType = NIFTY_BANK_LIST;
        WEIGHTAGE = NIFTY_BANK_WEIGHT;
    }

    if (indexType == "INDICES") {
        listType = INDICES;
    }

    let data = [];
    jQ.each(instrumentsMap, function (index, item) {
        if (jQ.inArray(index, listType) != -1) {
            let obj = {}
            obj['TRADINGSYMBOL'] = index
            obj['CLOSE'] = instrumentsMap[index]['prevPrice']
            obj['PRICE'] = instrumentsMap[index]['price']
            obj['PERC'] = instrumentsMap[index]['perc']
            obj['WEIGHTAGE'] = 0;
            if (WEIGHTAGE[index]) {
                obj['WEIGHTAGE'] = WEIGHTAGE[index]
            }

            obj['TREND'] = ''
            obj['LTP'] = 0
            if (infoMap[index]) {
                obj['TREND'] = infoMap[index]['trends']
                obj['LTP'] = infoMap[index]['currentPrice']
                obj['STRIKEDATA'] = infoMap[index]['strikeData']
                obj['VIX'] = infoMap[index]['vix']
            }
            if (trendType) {
                if (jQ.inArray(trendType, obj['TREND']) != -1) {
                    data.push(obj)
                }
            } else {
                data.push(obj)
            }
        }
    })
    generateStockDataTable(data)
}


function getIndicesBullsBearsCount() {
    let vixl = 0;
    let vixu = 0;

    let ast = 0;
    let aso = 0;
    let bso = 0;
    let bst = 0;
    jQ.each(INDICES, function (index, item) {
        let data = infoMap[item]
        if (data['trends']) {
            if (jQ.inArray("VIXL", data['trends']) != -1) {
                vixl++
            }
            if (jQ.inArray("VIXU", data['trends']) != -1) {
                vixu++
            }

            if (jQ.inArray("AST", data['trends']) != -1) {
                ast++
            }
            if (jQ.inArray("ASO", data['trends']) != -1) {
                aso++
            }

            if (jQ.inArray("BST", data['trends']) != -1) {
                bst++
            }
            if (jQ.inArray("BSO", data['trends']) != -1) {
                bso++
            }
        }
    });


    let bulls = vixl + bst + bso
    let bears = vixu + aso + ast

    jQ("#index-bulls").html(bulls);
    jQ("#index-bears").html(bears);
    jQ("#index-weightage").html("W.S")
    vixu = '<span class="badge bg-success">' + vixu + '</span>'
    vixl = '<span class="badge bg-danger">' + vixl + '</span>'
    jQ("#indices-vixu").html(vixu);
    jQ("#indices-vixl").html(vixl);


    ast = '<span class="badge bg-danger">' + ast + '</span>'
    aso = '<span class="badge bg-success">' + aso + '</span>'
    jQ("#indices-ast").html(ast);
    jQ("#indices-aso").html(aso);


    bst = '<span class="badge bg-success">' + bst + '</span>'
    bso = '<span class="badge bg-danger">' + bso + '</span>'
    jQ("#indices-bst").html(bst);
    jQ("#indices-bso").html(bso);
}



function getNiftyBullsBearsCount() {
    let vixl = 0;
    let vixu = 0;

    let ast = 0;
    let aso = 0;
    let bso = 0;
    let bst = 0;
    jQ.each(NIFTY_50_LIST, function (index, item) {
        let data = infoMap[item]
        if (data['trends']) {
            if (jQ.inArray("VIXL", data['trends']) != -1) {
                vixl++
            }
            if (jQ.inArray("VIXU", data['trends']) != -1) {
                vixu++
            }

            if (jQ.inArray("AST", data['trends']) != -1) {
                ast++
            }
            if (jQ.inArray("ASO", data['trends']) != -1) {
                aso++
            }

            if (jQ.inArray("BST", data['trends']) != -1) {
                bst++
            }
            if (jQ.inArray("BSO", data['trends']) != -1) {
                bso++
            }
        }
    });

    let bulls = vixu + aso + bst
    let bears = vixl + ast + bso

    jQ("#nifty-50-bulls").html(bulls);
    jQ("#nifty-50-bears").html(bears);
    jQ("#nifty-50-weightage").html("W.S")
    vixu = '<span class="badge bg-success">' + vixu + '</span>'
    vixl = '<span class="badge bg-danger">' + vixl + '</span>'
    jQ("#nifty-vixu").html(vixu);
    jQ("#nifty-vixl").html(vixl);


    ast = '<span class="badge bg-danger">' + ast + '</span>'
    aso = '<span class="badge bg-success">' + aso + '</span>'
    jQ("#nifty-ast").html(ast);
    jQ("#nifty-aso").html(aso);


    bst = '<span class="badge bg-success">' + bst + '</span>'
    bso = '<span class="badge bg-danger">' + bso + '</span>'
    jQ("#nifty-bst").html(bst);
    jQ("#nifty-bso").html(bso);


}


function getBankNiftyBullsBearsCount() {
    let vixl = 0;
    let vixu = 0;

    let ast = 0;
    let aso = 0;
    let bso = 0;
    let bst = 0;
    jQ.each(NIFTY_BANK_LIST, function (index, item) {
        let data = infoMap[item]
        if (data['trends']) {
            if (jQ.inArray("VIXL", data['trends']) != -1) {
                vixl++
            }
            if (jQ.inArray("VIXU", data['trends']) != -1) {
                vixu++
            }

            if (jQ.inArray("AST", data['trends']) != -1) {
                ast++
            }
            if (jQ.inArray("ASO", data['trends']) != -1) {
                aso++
            }

            if (jQ.inArray("BST", data['trends']) != -1) {
                bst++
            }
            if (jQ.inArray("BSO", data['trends']) != -1) {
                bso++
            }
        }
    });


    let bulls = vixu + aso + bst
    let bears = vixl + ast + bso

    jQ("#nifty-bank-bulls").html(bulls);
    jQ("#nifty-bank-bears").html(bears);
    jQ("#nifty-bank-weightage").html("W.S")

    vixu = '<span class="badge bg-success">' + vixu + '</span>'
    vixl = '<span class="badge bg-danger">' + vixl + '</span>'
    jQ("#bank-nifty-vixu").html(vixu);
    jQ("#bank-nifty-vixl").html(vixl);


    ast = '<span class="badge bg-danger">' + ast + '</span>'
    aso = '<span class="badge bg-success">' + aso + '</span>'
    jQ("#bank-nifty-ast").html(ast);
    jQ("#bank-nifty-aso").html(aso);


    bst = '<span class="badge bg-success">' + bst + '</span>'
    bso = '<span class="badge bg-danger">' + bso + '</span>'
    jQ("#bank-nifty-bst").html(bst);
    jQ("#bank-nifty-bso").html(bso);
}

function getAllBullsBearsCount() {
    let vixl = 0;
    let vixu = 0;

    let ast = 0;
    let aso = 0;
    let bso = 0;
    let bst = 0;

    jQ.each(FO_LIST, function (index, item) {
        console.log(item)
        let data = infoMap[item]
        if (data['trends']) {
            if (jQ.inArray("VIXL", data['trends']) != -1) {
                vixl++
            }
            if (jQ.inArray("VIXU", data['trends']) != -1) {
                vixu++
            }

            if (jQ.inArray("AST", data['trends']) != -1) {
                ast++
            }
            if (jQ.inArray("ASO", data['trends']) != -1) {
                aso++
            }

            if (jQ.inArray("BST", data['trends']) != -1) {
                bst++
            }
            if (jQ.inArray("BSO", data['trends']) != -1) {
                bso++
            }

        }
    });

    let bulls = vixu + aso + bst
    let bears = vixl + ast + bso

    jQ("#all-bulls").html(bulls);
    jQ("#all-bears").html(bears);

    vixu = '<span class="badge bg-success">' + vixu + '</span>'
    vixl = '<span class="badge bg-danger">' + vixl + '</span>'
    jQ("#all-vixu").html(vixu);
    jQ("#all-vixl").html(vixl);


    ast = '<span class="badge bg-danger">' + ast + '</span>'
    aso = '<span class="badge bg-danger">' + aso + '</span>'
    jQ("#all-ast").html(ast);
    jQ("#all-aso").html(aso);


    bst = '<span class="badge bg-success">' + bst + '</span>'
    bso = '<span class="badge bg-success">' + bso + '</span>'
    jQ("#all-bst").html(bst);
    jQ("#all-bso").html(bso);
}

jQ(document).on("click", "#start-auto-refresh", function () {
    var that = jQ(this);
    that.attr("disabled", true)
    clearInterval(timerInstance)
    autoRefreshEachTabs(that)
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
        updatePrfitLoss()
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

        jQ("#profit-loss").html("P/L: " + html)
    }
}

function showFutureAi() {
    let html = ''
    html += '<div class="row mb-3">'
    html += '<div class="col-md-12 bg-danger">'
    html += helpMessage
    html += '</div>'
    html += '</div>'

    html += '<div class="row">'
    html += '<div class="col-md-6">'
    html += '<div class="card" >'
    html += '<div class="card-header">'
    html += 'NIFTY FUTURES '
    html += '<span id="nifty-future-ai-extra-info-price">'
    html += '</span>'
    html += '</div>'
    html += '<ul class="list-group list-group-flush">'
    html += '<li class="list-group-item" id="nifty-future-ai-trend-plus"></li>'
    html += '<li class="list-group-item" id="nifty-future-ai-trend-minus"></li>'
    html += '<li class="list-group-item" id="nifty-future-ai-extra-info-oi"></li>'
    html += '<li class="list-group-item" id="nifty-future-ai-extra-info-vwap-signal"></li>'
    html += '</ul>'
    html += '</div>'
    html += '</div>'
    html += '<div class="col-md-6">'
    html += '<div class="card" >'
    html += '<div class="card-header">'
    html += 'BANK NIFTY FUTURE '
    html += '<span id="bank-nifty-future-ai-extra-info-price">'
    html += '</span>'
    html += '</div>'
    html += '<ul class="list-group list-group-flush">'
    html += '<li class="list-group-item" id="bank-nifty-future-ai-trend-plus"></li>'
    html += '<li class="list-group-item" id="bank-nifty-future-ai-trend-minus"</li>'
    html += '<li class="list-group-item" id="bank-nifty-future-ai-extra-info-oi"></li>'
    html += '<li class="list-group-item" id="bank-nifty-future-ai-extra-info-vwap-signal"></li>'
    html += '</ul>'
    html += '</div>'
    html += '</div>'
    html += '</div>'




    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'

    html += '<div class="row">'


    html += '<div class="col-md-3">'
    html += '<div class="card" >'
    html += '<div class="card-header">'
    html += '<span class="filter-instruments" data-index-name="INDICES">INDICES</span>   '
    html += '<span id="index-bulls" class="badge bg-success me-1"></span>'
    html += '<span id="index-bears" class="badge bg-dange me-1r"></span>'
    html += '<span id="index-weightage" class="show-all-in-one badge bg-info me-1" data-type="INDICES"></span>'
    html += '</div>'
    html += '<ul class="list-group list-group-flush">'
    html += '<li class="list-group-item" >VIXU: <span class="filter-instruments" data-trend-type="VIXU" data-index-name="INDICES" id="indices-vixu">0</span> VIXL: <span class="filter-instruments" data-trend-type="VIXL" data-index-name="INDICES" id="indices-vixl">0</span></li>'
    html += '<li class="list-group-item" >AST: <span  class="filter-instruments" data-trend-type="AST" data-index-name="INDICES" id="indices-ast">0</span> ASO: <span  class="filter-instruments" data-trend-type="ASO" data-index-name="INDICES" id="indices-aso">0</span></li>'
    html += '<li class="list-group-item" >BST: <span  class="filter-instruments" data-trend-type="BST" data-index-name="INDICES" id="indices-bst">0</span> BSO: <span class="filter-instruments" data-trend-type="BSO" data-index-name="INDICES" id="indices-bso">0</span></li>'


    html += '</ul>'
    html += '</div>'
    html += '</div>'



    html += '<div class="col-md-3">'
    html += '<div class="card" >'
    html += '<div class="card-header">'
    html += '<span class="filter-instruments" data-index-name="NIFTY 50">NIFTY 50 </span> '
    html += '<span id="nifty-50-bulls" class="badge bg-success me-1"></span>'
    html += '<span id="nifty-50-bears" class="badge bg-danger me-1"></span>'
    html += '<span id="nifty-50-weightage" class="show-all-in-one badge bg-info me-1" data-type="NIFTY 50"></span>'
    html += '</div>'
    html += '<ul class="list-group list-group-flush">'
    html += '<li class="list-group-item" >VIXU: <span class="filter-instruments" data-trend-type="VIXU" data-index-name="NIFTY 50" id="nifty-vixu">0</span> VIXL: <span class="filter-instruments" data-trend-type="VIXL" data-index-name="NIFTY 50" id="nifty-vixl">0</span></li>'
    html += '<li class="list-group-item" >AST: <span  class="filter-instruments" data-trend-type="AST" data-index-name="NIFTY 50" id="nifty-ast">0</span> ASO: <span  class="filter-instruments" data-trend-type="ASO" data-index-name="NIFTY 50" id="nifty-aso">0</span></li>'
    html += '<li class="list-group-item" >BST: <span  class="filter-instruments" data-trend-type="BST" data-index-name="NIFTY 50" id="nifty-bst">0</span> BSO: <span class="filter-instruments" data-trend-type="BSO" data-index-name="NIFTY 50" id="nifty-bso">0</span></li>'


    html += '</ul>'
    html += '</div>'
    html += '</div>'


    html += '<div class="col-md-3">'
    html += '<div class="card" >'
    html += '<div class="card-header">'
    html += '<span class="filter-instruments" data-index-name="BANK NIFTY">BANK NIFTY  </span>'

    html += '<span id="nifty-bank-bulls" class="badge bg-success me-1"></span>'
    html += '<span id="nifty-bank-bears" class="badge bg-danger me-1"></span>'
    html += '<span id="nifty-bank-weightage" class="show-all-in-one badge bg-info me-1" data-type="NIFTY BANK"></span>'
    html += '</div>'
    html += '<ul class="list-group list-group-flush">'
    html += '<li class="list-group-item">VIXU: <span class="filter-instruments" data-trend-type="VIXU" data-index-name="BANK NIFTY" id="bank-nifty-vixu">0</span> VIXL: <span class="filter-instruments" data-trend-type="VIXL" data-index-name="BANK NIFTY" id="bank-nifty-vixl">0</span></li>'
    html += '<li class="list-group-item">AST: <span  class="filter-instruments" data-trend-type="AST" data-index-name="BANK NIFTY"  id="bank-nifty-ast">0</span> ASO: <span  class="filter-instruments" data-trend-type="ASO" data-index-name="BANK NIFTY" id="bank-nifty-aso">0</span></li>'
    html += '<li class="list-group-item">BST: <span  class="filter-instruments" data-trend-type="BST" data-index-name="BANK NIFTY" id="bank-nifty-bst">0</span> BSO: <span  class="filter-instruments" data-trend-type="BSO" data-index-name="BANK NIFTY" id="bank-nifty-bso">0</span></li>'

    html += '</ul>'
    html += '</div>'
    html += '</div>'


    html += '<div class="col-md-3">'
    html += '<div class="card" >'
    html += '<div class="card-header">'
    html += '<span class="filter-instruments" data-index-name="ALL">ALL</span> <span id="all-bulls" class="badge bg-success"></span> <span id="all-bears" class="badge bg-danger"></span><span id="show-stock-scanner" class="badge bg-info">Scanner</span>'
    html += '</div>'
    html += '<ul class="list-group list-group-flush">'
    html += '<li class="list-group-item" >VIXU: <span class="filter-instruments" data-trend-type="VIXU" data-index-name="ALL" id="all-vixu">0</span> VIXL: <span class="filter-instruments" data-trend-type="VIXL" data-index-name="ALL" id="all-vixl">0</span></li>'
    html += '<li class="list-group-item" >AST: <span class="filter-instruments" data-trend-type="AST" data-index-name="ALL" id="all-ast">0</span> ASO: <span class="filter-instruments" data-trend-type="ASO" data-index-name="ALL" id="all-aso">0</span></li>'
    html += '<li class="list-group-item" >BST: <span class="filter-instruments" data-trend-type="BST" data-index-name="ALL" id="all-bst">0</span> BSO: <span class="filter-instruments" data-trend-type="BSO" data-index-name="ALL" id="all-bso">0</span></li>'
    html += '</ul>'
    html += '</div>'
    html += '</div>'

    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table  class="" id="stock-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>INSTRUMENT</th>'
    html += '<th>WEIGHTAGE</th>'
    html += '<th>P.CLOSE</th>'
    html += '<th>OPEN PRICE</th>'
    html += '<th>LTP</th>'
    html += '<th>CHANGE</th>'
    html += '<th>TREND</th>'
    html += '<th>ACTION</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'

    html += '</tbody>'
    html += '</table>'
    html += '</div>'
    html += '</div>'




    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table  class="" id="future-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>INSTRUMENT</th>'
    html += '<th>ACTION</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'

    html += '</tbody>'
    html += '</table>'
    html += '</div>'
    html += '</div>'


    let title = ''
    title += '<div class="row">'
    title += '<div class="col-md-2">'
    title += 'Trend Analysis'
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
    title += '<span id="profit-loss">0.00</span>'
    title += '</div>'

    title += '<div class="col-md-1 pop-title-extra">'
    title += '<span id="clean-storage">Clear</span>'
    title += '</div>'
    title += '</div>'
    showPopUpWindow('trend-analysis', html, "Trend Analysis");
    var divId = "popup-custom-style-trend-analysis";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    jQ("." + divId).on("close.popupwindow", function () {
        if (timerInstance) {
            clearInterval(timerInstance)
        }
    });
}


function generateFutreIntruments() {
    let futureTable = jQ("#future-list-table");
    let html = ''
    for (var key in futureTokens) {
        if (futureTokens.hasOwnProperty(key)) {
            html += '<tr>'
            html += '<td>' + key + '</td>'
            html += '<td>'
            html += '<span data-token="' + futureTokens[key] + '" data-name="' + key + '" class="badge bg-info show-future-chart">Chart</span>'
            html += '<span data-token="' + futureTokens[key] + '" data-name="' + key + '" class="badge bg-secondary create-future-alerts">Alert</span>'
            html += '</td>'
            html += '</tr>'
        }
    }
    futureTable.find("tbody").html(html)
    futureTable.show()
}


jQ(document).on("click", ".create-future-alerts", function () {

    let token = jQ(this).attr("data-token");
    let name = jQ(this).attr("data-name");

    jQ.when(getHistoricalData(token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day')).done(function (prev) {
        jQ.when(getHistoricalData(token, CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL)).done(function (quote) {
            let first = quote.data['candles'][0];
            let prevData = prev.data['candles'][0];

            let strikeDiff = nseFutreStrikeDiff[name];
            strikeDiff = strikeDiff.split(",");
            let strikeOne = parseInt(strikeDiff[0])
            let strikeTwo = parseInt(strikeDiff[1])

            let ustrikeOne = (parseFloat(first[1]) + strikeOne);
            let ustrikeTwo = (ustrikeOne + strikeTwo);
            let bstrikeOne = (parseFloat(first[1]) - strikeOne);
            let bstrikeTwo = (bstrikeOne - strikeTwo);

            let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];

            var vix = getVixRange(parseFloat(prevData[4]), parseFloat(vixQuote[4]))

            var vixLowerRange = 0;
            var vixUpperRange = 0;
            var vixDDRange = 0;

            vixLowerRange = parseFloat(vix.vixDDLower)
            vixUpperRange = parseFloat(vix.vixDDUpper)
            vixDDRange = parseFloat(vix.vixDDRange);

            lhs_tradingsymbol = futureNames[name]

            let lhs_exchange = "NFO"
            if (name == 'CRUDE_OIL_M_FUTURE') {
                lhs_exchange = "MCX"

                /*
                    let aso = ustrikeOne;
                    createAlert(name + "-" + 'ASO', lhs_tradingsymbol, aso, ">=", lhs_exchange)
        
                    let bso = bstrikeOne;
                    createAlert(name + "-" + 'BSO', lhs_tradingsymbol, bso, "<=", lhs_exchange)
                */
            }

            let ast = ustrikeTwo;
            createAlert(name + "-" + 'AST', lhs_tradingsymbol, ast, ">=", lhs_exchange)

            let bst = bstrikeTwo;
            createAlert(name + "-" + 'BST', lhs_tradingsymbol, bst, "<=", lhs_exchange)

            let vixu = vixUpperRange;
            createAlert(name + "-" + 'VIXU', lhs_tradingsymbol, vixu, ">=", lhs_exchange)

            let vixl = vixLowerRange;
            createAlert(name + "-" + 'VIXL', lhs_tradingsymbol, vixl, "<=", lhs_exchange)
        })
    });
});

jQ(document).on("click", ".show-future-chart", function () {
    let token = jQ(this).attr("data-token");
    let name = jQ(this).attr("data-name");
    let chartId = 'future-chart-' + token
    let html = ''
    jQ.when(getHistoricalData(token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day')).done(function (pres) {
        jQ.when(getHistoricalData(token, CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL)).done(function (cres) {
            let tempName = name.replaceAll(" ", "-")
            tempName = tempName.replaceAll("&", "-")
            html += '<div id="' + chartId + '" style="width:100%;">'
            html += '</div>';
            html += '<div style="width:100%;">'
            html += '<table  id="stock-data-' + tempName + '" class="" style="width: 100%;display: none;">'
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
            showPopUpWindow(name, html, name);
            showFuturesChart(cres, name, token, pres)
            let data = []
            jQ.each(cres.data.candles, function (index, item) {
                let map = {}
                map['date'] = moment(item[0]).format("HH:mm:ss")
                map.open = item[1]
                map.high = item[2]
                map.low = item[3]
                map.close = item[4]
                map.volume = item[5]
                data.push(map);
            });
            showStockData(data, name)
        });
    });
});

function showFuturesChart(quote, name, token, prev) {

    let first = quote.data['candles'][0];
    let prevData = prev.data['candles'][0];

    let strikeDiff = nseFutreStrikeDiff[name];
    strikeDiff = strikeDiff.split(",");
    let strikeOne = parseInt(strikeDiff[0])
    let strikeTwo = parseInt(strikeDiff[1])

    let ustrikeOne = (parseFloat(first[1]) + strikeOne);
    let ustrikeTwo = (ustrikeOne + strikeTwo);
    let bstrikeOne = (parseFloat(first[1]) - strikeOne);
    let bstrikeTwo = (bstrikeOne - strikeTwo);

    let strikeMap = {}
    strikeMap['strikeDiff'] = parseFloat(strikeDiff).toFixed(2);
    strikeMap['bstrikeOne'] = parseFloat(bstrikeOne).toFixed(2);
    strikeMap['bstrikeTwo'] = parseFloat(bstrikeTwo).toFixed(2);
    strikeMap['ustrikeOne'] = parseFloat(ustrikeOne).toFixed(2);
    strikeMap['ustrikeTwo'] = parseFloat(ustrikeTwo).toFixed(2);

    let chartId = 'future-chart-' + token;
    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];

    var vix = getVixRange(parseFloat(prevData[4]), parseFloat(vixQuote[4]))

    var vixLowerRange = 0;
    var vixUpperRange = 0;
    var vixDDRange = 0;

    vixLowerRange = parseFloat(vix.vixDDLower)
    vixUpperRange = parseFloat(vix.vixDDUpper)
    vixDDRange = parseFloat(vix.vixDDRange);

    let data = []
    jQ.each(quote.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("HH:mm:ss")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        data.push(map);
    });

    let categoryList = []
    let dateIndex = 0
    jQ.each(data, function (index, item) {
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

    jQ.each(data, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
        map.volume = item.volume
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
    line.startvalue = strikeMap.bstrikeTwo;
    line.displayvalue = "BST " + strikeMap.bstrikeTwo;
    lines.push(line);

    line = {};
    line.color = "#9f3ae7";
    line.startvalue = strikeMap.ustrikeTwo;
    line.displayvalue = "AST " + strikeMap.ustrikeTwo;
    lines.push(line);

    line = {};
    line.color = "#9f3ae7";
    line.startvalue = strikeMap.bstrikeOne;
    line.displayvalue = "BSO " + strikeMap.bstrikeOne;
    lines.push(line);

    line = {};
    line.color = "#9f3ae7";
    line.startvalue = strikeMap.ustrikeOne;
    line.displayvalue = "ASO " + strikeMap.ustrikeOne;
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
                showVolumeChart: true
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

var stockTable;

function generateStockDataTable(data) {
    jQ("#stock-list-table").show()
    stockTable = jQ('#stock-list-table').DataTable({
        "processing": true,
        "order": [[1, "desc"]],
        "pageLength": 50,
        "bPaginate": false,
        "data": data,
        "bDestroy": true,
        "scrollX": true,
        "scrollY": "200px",
        "columnDefs": [
            {
                "targets": [],
                "visible": false,
                "searchable": false
            }
        ],
        "columns": [
            {
                "data": "TRADINGSYMBOL",
            },
            { "data": 'WEIGHTAGE' },
            { "data": 'CLOSE' },
            { "data": 'PRICE' },
            { "data": 'LTP' },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    let currentPrice = row['LTP'];
                    let prevClose = row['CLOSE'];
                    let change = (currentPrice - prevClose).toFixed(2);
                    let changePerc = ((change / prevClose) * 100).toFixed(2)
                    return changePerc;
                }
            },
            {
                "data": "TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    let currentPrice = row['LTP'];
                    if (data.length > 0) {
                        jQ.each(data, function (index, item) {
                            if (item == "AST") {
                                let astPrice = row['STRIKEDATA']['ustrikeTwo']
                                let AST_MOVED = parseFloat(astPrice - currentPrice).toFixed();
                                if (AST_MOVED >= 0) {
                                    html += '<span class="badge bg-info above-strike-two strike-info">AST (' + AST_MOVED + ')</span>'
                                } else {
                                    html += '<span class="badge bg-info above-strike-two strike-info">AST</span>'
                                }
                            }

                            if (item == "ASO") {
                                let asoPrice = row['STRIKEDATA']['ustrikeOne']
                                let ASO_MOVED = parseFloat(currentPrice - asoPrice).toFixed();
                                if (ASO_MOVED >= 0) {
                                    html += '<span class="badge bg-info above-strike-one strike-info">ASO (' + ASO_MOVED + ')</span>'
                                } else {
                                    html += '<span class="badge bg-info above-strike-one strike-info">ASO</span>'
                                }
                            }

                            if (item == "BST") {
                                let bstPrice = row['STRIKEDATA']['bstrikeTwo']
                                let BST_MOVED = parseFloat(bstPrice - currentPrice).toFixed();
                                if (BST_MOVED >= 0) {
                                    html += '<span class="badge bg-info below-strike-two strike-info">BST (' + BST_MOVED + ')</span>'
                                } else {
                                    html += '<span class="badge bg-info below-strike-two strike-info">BST</span>'
                                }
                            }

                            if (item == "BSO") {
                                let bsoPrice = row['STRIKEDATA']['bstrikeOne']
                                let BSO_MOVED = parseFloat(bsoPrice - currentPrice).toFixed();
                                if (BSO_MOVED >= 0) {
                                    html += '<span class="badge bg-info below-strike-one strike-info">BSO (' + BSO_MOVED + ')</span>'
                                } else {
                                    html += '<span class="badge bg-info below-strike-one strike-info">BSO</span>'
                                }

                            }

                            if (item == "VIXL") {
                                let vixlPrice = row['VIX']['vixDDLower']
                                let VIXL_MOVED = parseFloat(vixlPrice - currentPrice).toFixed();
                                if (VIXL_MOVED >= 0) {
                                    html += '<span class="badge bg-info below-strike-one strike-info">VIXL (' + VIXL_MOVED + ')</span>'
                                } else {
                                    html += '<span class="badge bg-info below-strike-one strike-info">VIXL</span>'
                                }

                            }

                            if (item == "VIXU") {
                                let vixuPrice = row['VIX']['vixDDUpper']
                                let VIXU_MOVED = parseFloat(currentPrice - vixuPrice).toFixed();
                                if (VIXU_MOVED >= 0) {
                                    html += '<span class="badge bg-info below-strike-one strike-info">VIXU (' + VIXU_MOVED + ')</span>'
                                } else {
                                    html += '<span class="badge bg-info below-strike-one strike-info">VIXU</span>'
                                }

                            }
                        });
                    }
                    return html
                }
            },
            {
                "data": "",
                render: function (data, type, row, meta) {
                    var html = ""
                    let index = 1;
                    html += '<div>'
                    if (jQ.inArray(row['TRADINGSYMBOL'], INDICES) == -1) {
                        if (row['TREND']) {
                            let isBuyTrade = false;
                            let allowTrade = false;
                            if (jQ.inArray("AST", row['TREND']) != -1) {
                                isBuyTrade = false
                                allowTrade = true
                            } else if (jQ.inArray("ASO", row['TREND']) != -1) {
                                isBuyTrade = true
                                allowTrade = true
                            } else if (jQ.inArray("BST", row['TREND']) != -1) {
                                isBuyTrade = true
                                allowTrade = true
                            } else if (jQ.inArray("BSO", row['TREND']) != -1) {
                                isBuyTrade = false
                                allowTrade = true
                            }

                            let transactionType = 'BUY'
                            let slTransactionType = "SELL"
                            let btnColor = "bg-success"
                            let name = "Buy"
                            if (!isBuyTrade) {
                                btnColor = "bg-danger"
                                transactionType = 'SELL'
                                name = "Sell"
                                slTransactionType = "BUY"
                            }

                            if (allowTrade) {
                                html += '<span  data-name="' + row['TRADINGSYMBOL'] + '" data-price="' + row['LTP'] + '"  data-transaction-type="' + transactionType + '" class="badge bg-secondary  ms-1 place-order ' + btnColor + '"style="margin-right:.5rem;">';
                                html += name
                                html += '</span>'

                                html += '<span  data-name="' + row['TRADINGSYMBOL'] + '" data-price="' + row['LTP'] + '"  data-transaction-type="' + slTransactionType + '" class="badge bg-primary  ms-1 place-sl-order" style="margin-right:.5rem;">';
                                html += "SL"
                                html += '</span>'
                            }
                        }
                    } else {
                        index = 0;
                    }
                    if (row['TREND']) {
                        html += '<span data-price="' + row['LTP'] + '" data-index="' + index + '" data-trend="' + row['TREND'].join(",") + '" data-name="' + row['TRADINGSYMBOL'] + '" class="badge bg-info show-chart">'
                        html += 'Chart'
                        html += '</span>'
                    }
                    html += '</div>'
                    return html
                }
            },
        ],
        "fnInitComplete": function (oSettings, json) {
        }
    });
}


async function generateTrend() {
    await saveVixQuote();
    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];
    let marketWatchSideBar = jQ(".marketwatch-sidebar");
    let tabs = marketWatchSideBar.find(".marketwatch-selector a.item");
    let instrumentsWrapper = jQ(".instruments");
    let instruments = instrumentsWrapper.find(".vddl-list .instrument");
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

                let bulls = 0;
                let bears = 0;
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
                        infoObj['currentPrice'] = currentPrice
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

                        let chart = '<div data-price="' + currentPrice + '" data-index="' + index + '" data-trend="' + trends.join(",") + '" data-name="' + name + '" class="badge bg-secondary show-chart">c</div>'
                        that.find(".info-wrapper").append(chart);

                        let alerts = '<div data-index="' + index + '" data-name="' + name + '" class="badge bg-secondary create-alerts">a</div>'
                        that.find(".info-wrapper").append(alerts);
                    } else {
                        let currentPrice = parseFloat(price.trim()).toFixed(2);
                        let infoObj = {}
                        infoObj['instrument'] = instrumentsMap[name]
                        infoObj['vix'] = ''
                        infoObj['strikeData'] = ''
                        infoObj['trends'] = '';
                        infoObj['currentPrice'] = currentPrice
                        infoMap[name] = infoObj
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
            await savePreviousFutureQuote(key)
            await getCurrentFutureQuote(key)
            let currentQuote = JSON.parse(localStorage.getItem(key + "_CURRENT_QUOTE"))
            let prevQuote = JSON.parse(localStorage.getItem(key));
            aiFutureAnalysis(currentQuote, prevQuote, key)
        }
    }
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

        var html = ''
        let btnColor = "bg-success"
        trends = trends.split(",")

        let isBuyTrade = false;
        let allowTrade = false;
        if (jQ.inArray("AST", trends) != -1) {
            isBuyTrade = false
            allowTrade = true
        } else if (jQ.inArray("ASO", trends) != -1) {
            isBuyTrade = true
            allowTrade = true
        } else if (jQ.inArray("BST", trends) != -1) {
            isBuyTrade = true
            allowTrade = true
        } else if (jQ.inArray("BSO", trends) != -1) {
            isBuyTrade = false
            allowTrade = true
        }

        let transactionType = 'BUY'
        let counterTransactionType = "SELL"
        if (!isBuyTrade) {
            btnColor = "bg-danger"
            transactionType = 'SELL'
            counterTransactionType = "BUY"
        }

        allowTrade = false;
        if (index != 0 && allowTrade) {
            html += '<div style="width:100%;text-align:center;">'
            html += '<div class="col-md-4" style="display:inline;margin-right:1rem;">'
            html += '<button  data-name="' + name + '" data-price="' + price + '"  data-transaction-type="' + transactionType + '" class="btn-sm btn btn-primary ms-1 place-order ' + btnColor + '" type="submit">';
            html += 'Place Order'
            html += '</button>'
            html += '</div>'
            html += '<div class="col-md-4" style="display:inline;">'
            html += '<button  data-name="' + name + '" data-price="' + price + '"  data-transaction-type="' + counterTransactionType + '" class="btn-sm btn btn-primary ms-1 place-sl-order" type="submit">';
            html += 'Place SL Order'
            html += '</button>'
            html += '</div>'
            html += '</div>'
        }

        html += '<div id="' + chartId + '" style="width:100%;">'
        html += '</div>'


        html += '<div style="width:100%;">'
        html += '<table  id="stock-data-' + tempName + '" class="" style="width: 100%;display: none;">'
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

        showPopUpWindow(tempName, html, name + " : " + trends.join(","));
        let divId = "pop-up-window-" + tempName;
        /*jQ("#" + divId).PopupWindow("setSize", {
          
           width: 600,
           height: 350,
          
           animationTime: 500
       }); */

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
    let stockDataTable = jQ("#stock-data-" + name);
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
            cssClass = 'background:green;'
        }

        if (sellSide) {
            cssClass = 'background:red;'
        }


        item.cssClass = cssClass;
        newList.push(item)
    });
    newList.reverse()
    jQ.each(newList, function (index, item) {
        html += '<tr style="' + item.cssClass + '">'
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
    console.log(data)

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
    let ltp = jQ(this).attr("data-price");
    let transaction_type = jQ(this).attr("data-transaction-type");
    let price = 0
    let trigger_price = 0;
    let data = infoMap[name];
    console.log(data)

    let aso = parseFloat(data['strikeData']['ustrikeOne']).toFixed(2);
    let ast = parseFloat(data['strikeData']['ustrikeTwo']).toFixed(2);
    let bso = parseFloat(data['strikeData']['bstrikeOne']).toFixed(2);
    let bst = parseFloat(data['strikeData']['bstrikeTwo']).toFixed(2);
    let vixDDUpper = parseFloat(data['vix']['vixDDUpper']).toFixed(2);
    let vixDDLower = parseFloat(data['vix']['vixDDLower']).toFixed(2);

    let whichTrade = '';
    if (jQ.inArray("AST", data['trends']) != -1) {
        whichTrade = "AST";
    } else if (jQ.inArray("ASO", data['trends']) != -1) {
        whichTrade = "ASO";
    } else if (jQ.inArray("BST", data['trends']) != -1) {
        whichTrade = "BST";
    } else if (jQ.inArray("BSO", data['trends']) != -1) {
        whichTrade = "BSO";
    }

    if (transaction_type == "BUY") {
        if (whichTrade == "AST") {
            trigger_price = parseFloat(ast) + SL_POINTS;
            price = parseFloat(ast) + (SL_POINTS + 1)
        }
        if (whichTrade == "BSO") {
            trigger_price = parseFloat(bso) + SL_POINTS;
            price = parseFloat(bso) + (SL_POINTS + 1)
        }
    } else {
        if (whichTrade == "ASO") {
            trigger_price = parseFloat(aso) - SL_POINTS;
            price = parseFloat(aso) - (SL_POINTS + 1)
        }
        if (whichTrade == "BST") {
            trigger_price = parseFloat(bst) - SL_POINTS;
            price = parseFloat(bst) - (SL_POINTS + 1)
        }
    }
    let quantity = (MARGIN / (parseFloat(ltp) / 5)).toFixed(0)
    let params = { "exchange": "NSE", "tradingsymbol": name, "transaction_type": transaction_type, "product": "MIS", "order_type": "SL", "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": price, "trigger_price": trigger_price, "disclosed_quantity": 0, "tags": [] }
    placeOrder(params)
})

jQ(document).on("click", ".place-order", function () {
    let name = jQ(this).attr("data-name");
    let transaction_type = jQ(this).attr("data-transaction-type");
    let price = jQ(this).attr("data-price");
    let quantity = (MARGIN / (parseFloat(price) / 5)).toFixed(0)
    let params = { "exchange": "NSE", "tradingsymbol": name, "transaction_type": transaction_type, "product": "MIS", "order_type": "MARKET", "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": 0, "trigger_price": 0, "disclosed_quantity": 0, "tags": [] }
    placeOrder(params)
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

function showChart(quote, name) {

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

function aiFutureAnalysis(currentQuote, prevQuote, name) {
    let trend;
    let moreInfo;
    if (name == "NIFTY_FUTURE") {
        trend = showAiNiftyPrediction(currentQuote, prevQuote, name)
        moreInfo = niftyFutureAnalysis(currentQuote, prevQuote)
        if (trend) {
            jQ("#nifty-future-ai-trend-plus").html(trend['PLUS'])
            jQ("#nifty-future-ai-trend-minus").html(trend['MINUS'])
            jQ("#nifty-future-ai-extra-info-oi").html('').append(moreInfo['OI'])
            jQ("#nifty-future-ai-extra-info-price").html(moreInfo['PRICE'])
            jQ("#nifty-future-ai-extra-info-vwap-signal").html('').append(moreInfo['VWAP'] + " " + moreInfo['SIGNAL'])
        }
    }
    if (name == "BANK_NIFTY_FUTURE") {
        trend = showAiBankNiftyPrediction(currentQuote, prevQuote, name);
        moreInfo = bankNiftyFutureAnalysis(currentQuote, prevQuote)
        if (trend) {
            jQ("#bank-nifty-future-ai-trend-plus").html(trend['PLUS'])
            jQ("#bank-nifty-future-ai-trend-minus").html(trend['MINUS'])
            jQ("#bank-nifty-future-ai-extra-info-oi").html('').append(moreInfo['OI'])
            jQ("#bank-nifty-future-ai-extra-info-price").html(moreInfo['PRICE'])
            jQ("#bank-nifty-future-ai-extra-info-vwap-signal").html('').append(moreInfo['VWAP'] + " " + moreInfo['SIGNAL'])
        }
    }
}

function showAiNiftyPrediction(currentQuoteData, prevQuoteData, name) {
    let futuresData = {};
    let prevData = prevQuoteData.data['candles'][0];
    let currentData = currentQuoteData.data['candles'][currentQuoteData.data['candles'].length - 1];
    if (!currentData) {
        return;
    }

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
    var openInterest = quote['oi'] / 75;
    var previousOI = prevQuote['oi'] / 75
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

    if (!currentData) {
        return;
    }

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

function niftyFutureAnalysis(currentQuoteData, prevQuoteData) {
    let futuresData = {};

    let prevData = prevQuoteData.data['candles'][0];
    let currentData = currentQuoteData.data['candles'][currentQuoteData.data['candles'].length - 1];

    if (!currentData) {
        return;
    }

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

    var lastUpdateTime = quote.date;
    var prevClose = prevQuote['close']
    var previousClose = prevQuote['close']
    var pChange = ((lastPrice - previousClose) / previousClose) * 100
    var change = (lastPrice - previousClose)
    var booleanValue = false;

    var correctedVwap = vwap;

    var vvapTextOne = ''
    var vvapTextTwo = ''
    var vvapTextThree = ''
    var vvapTextFour = ''

    var bottomTriangle = '<i class="bi bi-caret-down"></i>'
    var upTriangle = '<i class="bi bi-caret-up"></i>'

    if (vwap <= lastPrice) {
        vvapTextOne += '<span class="badge bg-primary">' + vwap + '</span>'
        vvapTextTwo += '<span class="badge bg-success">BUY</span>'
        vvapTextThree += '<span class="badge bg-success">' + upTriangle + '</span>'
        vvapTextFour += '<span class="badge bg-success">' + (parseFloat(lastPrice) - parseFloat(vwap)).toFixed(2) + '</span>'
        booleanValue = true;
    } else {
        vvapTextOne += '<span class="badge bg-primary">' + vwap + '</span>'
        vvapTextTwo += '<span class="badge bg-danger">SELL</span>'
        vvapTextThree += '<span class="badge bg-danger">' + bottomTriangle + '</span>'
        vvapTextFour += '<span class="badge bg-danger">' + (parseFloat(lastPrice) - parseFloat(vwap)).toFixed(2) + '</span>'
        booleanValue = false;
    }
    futuresData.VWAP = vvapTextOne + " " + vvapTextTwo + " " + vvapTextThree + " " + vvapTextFour

    var buyResult = Math.abs(openPrice - lowPrice);
    var sellResult = Math.abs(openPrice - highPrice);
    var diffNiftyOpenPrevOpen = Math.abs(openPrice - prevClose);
    var diffNiftyOpenPrevOpenResult = false;
    if (diffNiftyOpenPrevOpen >= 1 && diffNiftyOpenPrevOpen <= 11) {
        diffNiftyOpenPrevOpenResult = true
    }

    var textOpen = '<span class="badge bg-dark">' + openPrice + '</span>'
    var textLow = '<span class="badge bg-danger">' + lowPrice + '</span>'
    var textHigh = '<span class="badge bg-success">' + highPrice + '</span>'
    var textPreviousClose = '<span class="badge bg-success">' + previousClose + '</span>'


    futuresData.OPEN = textOpen
    futuresData.HIGH = textHigh
    futuresData.LOW = textLow
    futuresData.CLOSE = textPreviousClose
    futuresData.TIMESTAMP = lastUpdateTime


    var futureTrend = ''
    var futureDirection = ''
    if (buyResult >= 0 && buyResult <= 11 && booleanValue == true) {
        var trend = "Strong BUY";
        futureTrend = '<span class="badge bg-success">' + trend + '</span>'
        futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
    } else if (sellResult >= 0 && sellResult <= 9 && booleanValue == false) {
        var trend = "Strong SELL";
        futureTrend = '<span class="badge bg-danger">' + trend + '</span>'
        futureDirection = '<span class="badge bg-danger">' + bottomTriangle + '</span>'
    } else if (openPrice > prevClose && lastPrice > openPrice
        && booleanValue == true) {
        var trend = "BUY";
        futureTrend = '<span class="badge bg-success">' + trend + '</span>'
        futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
    } else if (diffNiftyOpenPrevOpenResult == true
        && booleanValue == true && lastPrice > openPrice) {
        var trend = "BUY On Decline";
        futureTrend = '<span class="badge bg-success">' + trend + '</span>'
        futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
    } else {
        var trend = "SELL";
        futureTrend = '<span class="badge bg-danger">' + trend + '</span>'
        futureDirection = '<span class="badge bg-danger">' + bottomTriangle + '</span>'
    }

    futuresData.SIGNAL = futureTrend + " " + futureDirection

    var price = ''
    var priceChang = ''
    var priceChangDirection = ''
    var pricePer = ''
    if (change > 0) {
        price += '<span class="badge bg-success">' + lastPrice + '</span>'
        priceChang += '<span class="badge bg-success">' + parseFloat(change).toFixed(2) + '</span>'
        priceChangDirection += '<span class="badge bg-success">' + upTriangle + '</span>'
    } else {
        price += '<span class="badge bg-danger">' + lastPrice + '</span>'
        priceChang += '<span class="badge bg-danger">' + parseFloat(change).toFixed(2) + '</span>'
        priceChangDirection += '<span class="badge bg-danger">' + bottomTriangle + '</span>'
    }

    if (pChange > 0) {
        pricePer += '<span class="badge bg-success">' + parseFloat(pChange).toFixed(2) + '%</span>'
    } else {
        pricePer += '<span class="badge bg-danger">' + parseFloat(pChange).toFixed(2) + '%</span>'
    }
    futuresData.PRICE = price + " " + priceChangDirection + " " + pricePer + " " + priceChang

    var openInterest = quote.oi / 75;
    var previousOI = prevQuote['oi'] / 75
    var changeinOpenInterest = (openInterest - previousOI)
    var pchangeinOpenInterest = (((openInterest - previousOI) / previousOI) * 100).toFixed(2);

    var oiPrice = ''
    var oiPriceChang = ''
    var oiPriceChangDirection = ''
    var oiPricePer = ''
    if (changeinOpenInterest > 0) {
        oiPrice += '<span class="badge bg-success">' + openInterest + '</span>'
        oiPriceChang += '<span class="badge bg-success">' + parseFloat(changeinOpenInterest).toFixed(2) + '</span>'
        oiPriceChangDirection += '<span class="badge bg-success">' + upTriangle + '</span>'

    } else {
        oiPrice += '<span class="badge bg-danger">' + openInterest + '</span>'
        oiPriceChang += '<span class="badge bg-danger">' + parseFloat(changeinOpenInterest).toFixed(2) + '</span>'
        oiPriceChangDirection += '<span class="badge bg-danger">' + bottomTriangle + '</span>'
    }

    if (pchangeinOpenInterest > 0) {
        oiPricePer += '<span class="badge bg-success">' + parseFloat(pchangeinOpenInterest).toFixed(2) + '%</span>'
    } else {
        oiPricePer += '<span class="badge bg-danger">' + parseFloat(pchangeinOpenInterest).toFixed(2) + '%</span>'
    }

    futuresData.OI = oiPrice + " " + oiPriceChangDirection + " " + oiPricePer + " " + oiPriceChang

    return futuresData;
}

function bankNiftyFutureAnalysis(currentQuoteData, prevQuoteData) {
    let futuresData = {};

    let prevData = prevQuoteData.data['candles'][0];
    let currentData = currentQuoteData.data['candles'][currentQuoteData.data['candles'].length - 1];

    if (!currentData) {
        return;
    }

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
    var lastUpdateTime = quote.date;
    var prevClose = prevQuote['close']
    var previousClose = prevQuote['close']
    var pChange = ((lastPrice - previousClose) / previousClose) * 100
    var change = (lastPrice - previousClose)
    var booleanValue = false;

    var correctedVwap = vwap;
    correctedVwap = correctedVwap - 5;

    var vvapTextOne = ''
    var vvapTextTwo = ''
    var vvapTextThree = ''
    var vvapTextFour = ''

    var bottomTriangle = '<i class="bi bi-caret-down"></i>'
    var upTriangle = '<i class="bi bi-caret-up"></i>'
    var correctedVwap = vwap;
    correctedVwap = correctedVwap - 5;
    if (correctedVwap <= lastPrice) {
        vvapTextOne += '<span class="badge bg-primary">' + vwap + '</span>'
        vvapTextTwo += '<span class="badge bg-success">BUY</span>'
        vvapTextThree += '<span class="badge bg-success">' + upTriangle + '</span>'
        vvapTextFour += '<span class="badge bg-success">' + (parseFloat(lastPrice) - parseFloat(vwap)).toFixed(2) + '</span>'
        booleanValue = true;
    } else {
        vvapTextOne += '<span class="badge bg-primary">' + vwap + '</span>'
        vvapTextTwo += '<span class="badge bg-danger">SELL</span>'
        vvapTextThree += '<span class="badge bg-danger">' + bottomTriangle + '</span>'
        vvapTextFour += '<span class="badge bg-danger">' + (parseFloat(lastPrice) - parseFloat(vwap)).toFixed(2) + '</span>'
        booleanValue = false;
    }
    futuresData.VWAP = vvapTextOne + " " + vvapTextTwo + " " + vvapTextThree + " " + vvapTextFour

    var buyResult = Math.abs(openPrice - lowPrice);
    var sellResult = Math.abs(openPrice - highPrice);

    var textOpen = '<span class="badge bg-dark">' + openPrice + '</span>'
    var textLow = '<span class="badge bg-danger">' + lowPrice + '</span>'
    var textHigh = '<span class="badge bg-success">' + highPrice + '</span>'
    var textPreviousClose = '<span class="badge bg-success">' + previousClose + '</span>'


    futuresData.OPEN = textOpen
    futuresData.HIGH = textHigh
    futuresData.LOW = textLow
    futuresData.CLOSE = textPreviousClose
    futuresData.TIMESTAMP = lastUpdateTime

    var futureTrend = ''
    var futureDirection = ''
    if (buyResult >= 0 && buyResult <= 30 && booleanValue == true) {
        var trend = "Strong BUY";
        futureTrend = '<span class="badge bg-success">' + trend + '</span>'
        futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
    } else if (sellResult >= 0 && sellResult <= 30 && booleanValue == false) {
        var trend = "Strong SELL";
        futureTrend = '<span class="badge bg-danger">' + trend + '</span>'
        futureDirection = '<span class="badge bg-danger">' + bottomTriangle + '</span>'
    } else if (openPrice > prevClose && lastPrice >= openPrice
        && booleanValue == true) {
        var trend = "BUY";
        futureTrend = '<span class="badge bg-success">' + trend + '</span>'
        futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
    } else if (booleanValue == true && lastPrice > openPrice) {
        var trend = "BUY On Decline";
        futureTrend = '<span class="badge bg-success">' + trend + '</span>'
        futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
    } else {
        var trend = "SELL";
        futureTrend = '<span class="badge bg-danger">' + trend + '</span>'
        futureDirection = '<span class="badge bg-danger">' + bottomTriangle + '</span>'
    }

    futuresData.SIGNAL = futureTrend + " " + futureDirection

    var price = ''
    var priceChang = ''
    var priceChangDirection = ''
    var pricePer = ''
    if (change > 0) {
        price += '<span class="badge bg-success">' + lastPrice + '</span>'
        priceChang += '<span class="badge bg-success">' + parseFloat(change).toFixed(2) + '</span>'
        priceChangDirection += '<span class="badge bg-success">' + upTriangle + '</span>'
    } else {
        price += '<span class="badge bg-danger">' + lastPrice + '</span>'
        priceChang += '<span class="badge bg-danger">' + parseFloat(change).toFixed(2) + '</span>'
        priceChangDirection += '<span class="badge bg-danger">' + bottomTriangle + '</span>'
    }

    if (pChange > 0) {
        pricePer += '<span class="badge bg-success">' + parseFloat(pChange).toFixed(2) + '%</span>'
    } else {
        pricePer += '<span class="badge bg-danger">' + parseFloat(pChange).toFixed(2) + '%</span>'
    }
    futuresData.PRICE = price + " " + priceChangDirection + " " + pricePer + " " + priceChang

    var openInterest = quote.oi / 15;
    var previousOI = prevQuote['oi'] / 15
    var changeinOpenInterest = (openInterest - previousOI)
    var pchangeinOpenInterest = (((openInterest - previousOI) / previousOI) * 100).toFixed(2);

    var oiPrice = ''
    var oiPriceChang = ''
    var oiPriceChangDirection = ''
    var oiPricePer = ''
    if (changeinOpenInterest > 0) {
        oiPrice += '<span class="badge bg-success">' + openInterest + '</span>'
        oiPriceChang += '<span class="badge bg-success">' + parseFloat(changeinOpenInterest).toFixed(2) + '</span>'
        oiPriceChangDirection += '<span class="badge bg-success">' + upTriangle + '</span>'

    } else {
        oiPrice += '<span class="badge bg-danger">' + openInterest + '</span>'
        oiPriceChang += '<span class="badge bg-danger">' + parseFloat(changeinOpenInterest).toFixed(2) + '</span>'
        oiPriceChangDirection += '<span class="badge bg-danger">' + bottomTriangle + '</span>'
    }

    if (pchangeinOpenInterest > 0) {
        oiPricePer += '<span class="badge bg-success">' + parseFloat(pchangeinOpenInterest).toFixed(2) + '%</span>'
    } else {
        oiPricePer += '<span class="badge bg-danger">' + parseFloat(pchangeinOpenInterest).toFixed(2) + '%</span>'
    }

    futuresData.OI = oiPrice + " " + oiPriceChangDirection + " " + oiPricePer + " " + oiPriceChang

    return futuresData;

}

function savePreviousFutureQuote(validName) {
    return new Promise((resolve, reject) => {
        if (!localStorage.getItem(validName)) {
            jQ.when(getHistoricalData(futureInstruments[validName], PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day')).done(function (res) {
                localStorage.setItem(validName, JSON.stringify(res));
                resolve();
            })
        } else {
            resolve();
        }
    });
}

function getCurrentFutureQuote(validName) {
    return new Promise((resolve, reject) => {
        jQ.when(getHistoricalData(futureInstruments[validName], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL)).done(function (res) {
            localStorage.setItem(validName + "_CURRENT_QUOTE", JSON.stringify(res));
            resolve();
        })
    });
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
    if (nseStrikeDiff[instrument]) {
        strikeDiff = nseStrikeDiff[instrument]
        strikeDiff = strikeDiff.replace(/ /g, '')
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
        resizable: true,
        resizeOpacity: 1,
        height: 650,
        width: 1000,
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

function parseChartJson() {
    let json = localStorage.getItem("TVCharts")
    json = JSON.parse(json);
    console.log(json)

    let content = JSON.parse(json[0].content)
    console.log(content)

    content = JSON.parse(content.content)
    console.log(content)

    console.log(content.charts)

    console.log(content.charts[0].panes[0])

    console.log(content.charts[0].panes[0].sources)

    let length = content.charts[0].panes[0].sources.length;

    let addOne = content.charts[0].panes[0].sources[1]
    addOne['id'] = Math.random().toString(36).substr(2, 5)
    addOne['state']['text'] = "Demo"
    addOne['points'][0]['price'] = 24549.89

    content.charts[0].panes[0].sources[length + 1] = addOne

}