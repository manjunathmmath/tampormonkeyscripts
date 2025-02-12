const STOCK_PRICE_MOVED = g_config.get('stocks_price_moved');
const STOCK_TREND_TO_TRADE = g_config.get('stock_trend_to_trade');
const ENABLE_SL = g_config.get('enable_sl');
const ENABLE_ALGO_TRADE = g_config.get('enable_algo_trade');
const STOCK_LIMIT = g_config.get('stock_limit');

const fiveMinutes = [
    "09:20",
    "09:25",
    "09:30",
    "09:35",
    "09:40",
    "09:45",
    "09:50",
    "09:55",
    "10:00",
    "10:05",
    "10:10",
    "10:15",
    "10:20",
    "10:25",
    "10:30",
    "10:35",
    "10:40",
    "10:45",
    "10:50",
    "10:55",
    "11:00",
    "11:05",
    "11:10",
    "11:15",
    "11:20",
    "11:25",
    "11:30",
    "11:35",
    "11:40",
    "11:45",
    "11:50",
    "11:55",
    "12:00",
    "12:05",
    "12:10",
    "12:15",
    "12:20",
    "12:25",
    "12:30",
    "12:35",
    "12:40",
    "12:45",
    "12:50",
    "12:55",
    "13:00",
    "13:05",
    "13:10",
    "13:15",
    "13:20",
    "13:25",
    "13:30",
    "13:35",
    "13:40",
    "13:45",
    "13:50",
    "13:55",
    "14:00",
    "14:05",
    "14:10",
    "14:15",
    "14:20",
    "14:25",
    "14:30",
    "14:35",
    "14:40",
    "14:45",
    "14:50",
    "14:55",
    "15:00",
    "15:05"
]

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
    let isChecked = jQ("#start-algo-stock-trades").is(":checked");
    if (isChecked) {
        stockAlgoTradingStartTimer();
    }
   
}


async function executeTrendTrade(trend, obj) {
    let trades = JSON.parse(localStorage.getItem("TRADES"));
    if (!trades) {
        trades = []
    }


    if (jQ.inArray(obj.TRADINGSYMBOL, trades) !== -1) {
        return;
    }

    let currentTime = moment().format("HH:mm")

    if (jQ.inArray(currentTime, fiveMinutes) === -1) {
        console.log("----------------------------[ALGO CHECKING FOR 5 MINUTES TARDE CONDITION]-----------");
        console.log("current Time :" + currentTime);
        console.log("------------------------------------------------------------------------------------");
        return
    }

    let quote = await checkVolumeCondtion(obj.TRADINGSYMBOL);
    let last = quote[quote.length - 2];
    let isValidClose = false;

    let priceMoved = parseInt(STOCK_PRICE_MOVED)
    if (trend == "ASO") {
        let asoPrice = parseFloat(obj['STRIKEDATA']['ustrikeOne']).toFixed();
        let currentPrice = parseFloat(obj['CURRENT_PRICE']).toFixed();
        let ASO_MOVED = currentPrice - asoPrice;
        if (ASO_MOVED <= priceMoved && ASO_MOVED > 0) {
            if (last.close > asoPrice) {
                isValidClose = true
            }
            if (last.volume > STOCK_VOLUME && isValidClose) {
                triggerAlgoOrder(obj, 'BUY');
            }
        }


        console.log("----------------------------[ALGO CHECKING FOR ASO TARDE CONDITION]-----------------------------");
        console.log("Volume :" + last.volume);
        console.log("Last Close : " + last.close);
        console.log("Strike : " + asoPrice);
        console.log("Price Moved : " + ASO_MOVED);
        console.log("Valid Close : " + isValidClose);
        console.log("------------------------------------------------------------------------------------");
    }

    if (trend == "BSO") {
        let bsoPrice = parseFloat(obj['STRIKEDATA']['bstrikeOne']).toFixed();
        let currentPrice = parseFloat(obj['CURRENT_PRICE']).toFixed();
        let BSO_MOVED = bsoPrice - currentPrice
        if (BSO_MOVED <= priceMoved && BSO_MOVED > 0) {
            if (last.close < bsoPrice) {
                isValidClose = true
            }
            if (last.volume > STOCK_VOLUME && isValidClose) {
                triggerAlgoOrder(obj, 'SELL');
            }
        }

        console.log("----------------------------[ALGO CHECKING FOR BSO TRADE CONDITION]-----------------------------");
        console.log("Volume : " + last.volume);
        console.log("Last Close : " + last.close);
        console.log("Strike : " + bsoPrice);
        console.log("Price Moved : " + BSO_MOVED);
        console.log("Valid Close : " + isValidClose);
        console.log("------------------------------------------------------------------------------------");
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
    if (trades.length <= STOCK_LIMIT) {
        if (ENABLE_ALGO_TRADE) {
            callPlaceOrder(params)
        } else {
            console.log("----------------------------STOCK ALGO DISABLED------------------------------");
            console.log(params);
            console.log("-----------------------------------------------------------------------------");
        }
    } else {
        console.log("----------------------------STOCK LIMIT EXCEEDED-----------------------------");
        console.log(params);
        console.log("-----------------------------------------------------------------------------");
    }


}