const STOCK_PRICE_MOVED = g_config.get('stocks_price_moved');
const STOCK_TREND_TO_TRADE = g_config.get('stock_trend_to_trade');
const ENABLE_SL = g_config.get('enable_sl');
const ENABLE_ALGO_TRADE = g_config.get('enable_algo_trade');
const STOCK_LIMIT = g_config.get('stock_limit');

let stockAlgoTradeTimerInstance = null
jQ(document).on("change", "#start-algo-stock-trades", function () {
    clearInterval(stockAlgoTradeTimerInstance)
    let isChecked = jQ(this).is(":checked");
    if (isChecked) {
        startStockAlgoTrades();
    }
});


function stockAlgoTradingStartTimer() {
    if (!REFRESH_TIME) {
        REFRESH_TIME = 60
    }
    let duration = REFRESH_TIME
    var timer = duration, minutes, seconds;
    stockAlgoTradeTimerInstance = setInterval(function () {
        minutes = parseInt(timer / 60, 10);
        seconds = parseInt(timer % 60, 10);

        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;
        if (--timer < 0) {
            startStockAlgoTrades()
            timer = duration;
        }
    }, 1000);
}

async function startStockAlgoTrades() {
    clearInterval(stockAlgoTradeTimerInstance)
    let listType = FO_LIST;
    let allInstruments = [];
    jQ.each(instrumentsMap, function (index, item) {
        allInstruments.push(instrumentsMap[index])
    });

    for (let i = 0; i < allInstruments.length; i++) {
        let data = allInstruments[i];
        if (jQ.inArray(data.name, listType) != -1) {
            let obj = {}
            obj['TRADINGSYMBOL'] = data.name;
            obj['CLOSE'] = data['prevPrice'];
            obj['PRICE'] = data['price'];
            obj['PERC'] = data['perc'];
            obj['TREND'] = '';
            obj['LTP'] = 0;

            if (infoMap[data.name]) {
                obj['TREND'] = infoMap[data.name]['trends'];
                obj['LTP'] = infoMap[data.name]['currentPrice'];
                obj['STRIKEDATA'] = infoMap[data.name]['strikeData'];
                obj['VIX'] = infoMap[data.name]['vix'];
                obj['CURRENT_PRICE'] = infoMap[data.name]['currentPrice'];
            }

            if (STOCK_TREND_TO_TRADE == "ALL") {
                if (jQ.inArray("ASO", obj['TREND']) != -1) {
                    executeTrendTrade("ASO", obj)
                    await callSleepForAWhile(1000);
                }
                if (jQ.inArray("BSO", obj['TREND']) != -1) {
                    executeTrendTrade("BSO", obj)
                    await callSleepForAWhile(1000);
                }
            } else if (STOCK_TREND_TO_TRADE == "ASO") {
                if (jQ.inArray("ASO", obj['TREND']) != -1) {
                    executeTrendTrade("ASO", obj)
                    await callSleepForAWhile(1000);
                }

            } else if (STOCK_TREND_TO_TRADE == "BSO") {
                if (jQ.inArray("BSO", obj['TREND']) != -1) {
                    executeTrendTrade("BSO", obj)
                    await callSleepForAWhile(1000);
                }
            }
        }
    }
    stockAlgoTradingStartTimer();
}


async function executeTrendTrade(trend, obj) {
    let trades = JSON.parse(localStorage.getItem("TRADES"));
    if (!trades) {
        trades = []
    }


    if (jQ.inArray(obj.TRADINGSYMBOL, trades) !== -1) {
        return;
    }

    let priceMoved = parseInt(STOCK_PRICE_MOVED)
    if (trend == "ASO") {
        let asoPrice = parseFloat(obj['STRIKEDATA']['ustrikeOne']).toFixed();
        let currentPrice = parseFloat(obj['CURRENT_PRICE']).toFixed();
        let ASO_MOVED = currentPrice - asoPrice;
        if (ASO_MOVED <= priceMoved && ASO_MOVED > 0) {
            triggerAlgoOrder(obj, 'BUY');
        }
    }

    if (trend == "BSO") {
        let bsoPrice = parseFloat(obj['STRIKEDATA']['bstrikeOne']).toFixed();
        let currentPrice = parseFloat(obj['CURRENT_PRICE']).toFixed();
        let BSO_MOVED = bsoPrice - currentPrice
        if (BSO_MOVED <= priceMoved && BSO_MOVED > 0) {
            triggerAlgoOrder(obj, 'SELL');
        }
    }
}


function triggerAlgoOrder(obj, transaction_type) {
    let name = obj.TRADINGSYMBOL;
    let price = parseFloat(obj['CURRENT_PRICE']).toFixed();
    let quantity = (MARGIN / (parseFloat(price) / 5)).toFixed(0)
    let params = { "exchange": "NSE", "tradingsymbol": name, "transaction_type": transaction_type, "product": "MIS", "order_type": "MARKET", "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": 0, "trigger_price": 0, "disclosed_quantity": 0, "tags": [] }
    let trades = JSON.parse(localStorage.getItem("TRADES"));
    if (!trades) {
        trades = []
    }
    if(trades.length  <=  STOCK_LIMIT){
        if (ENABLE_ALGO_TRADE) {
            callPlaceOrder(params)
        } else {
            console.log("----------------------------STOCK ALGO DISABLED------------------------------");
            console.log(params);
            console.log("-----------------------------------------------------------------------------");
        }
    }else{
        console.log("----------------------------STOCK LIMIT EXCEEDED-----------------------------");
        console.log(params);
        console.log("-----------------------------------------------------------------------------");
    }
    

}