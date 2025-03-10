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
    "15:05",
]

async function startStockAlgoTrades() {
    let currentTime = moment().format("HH:mm")
    let checkTime = moment(PREVIOUS_DAY_DATE + " 09:20:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")

    console.log("Algo starts executing orders @ " + checkTime + "AM.  current time is :" + currentTime);
    if (!(currentTime >= checkTime)) {
        console.log("----------------------------[ALGO CHECKING FOR 9:15 MINUTES TARDE CONDITION]-----------");
        console.log("current Time :" + currentTime);
        console.log("------------------------------------------------------------------------------------");
        return
    }

    let currentMinute = moment().format("mm")
    if ((currentMinute % 5) != 0) {
        console.log("----------------------------[ALGO CHECKING FOR 5 MINUTES INTERVAL TARDE CONDITION]-----------");
        console.log("current Minute :" + currentMinute);
        console.log("------------------------------------------------------------------------------------");
        return
    }


    let listType = FO_LIST;
    let allInstruments = [];
    jQ.each(instrumentsMap, function (index, item) {
        allInstruments.push(instrumentsMap[index])
    });

    for (let i = 0; i < allInstruments.length; i++) {
        let data = allInstruments[i];
        if (jQ.inArray(data.name, listType) != -1
            && jQ.inArray(data.name, MOVEMENTSTOCKS) != -1) {
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
}

function checkAlgoVolumeCondtion(name) {
    return new Promise((resolve, reject) => {
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
                map['time'] = moment(item[0]).format("HH:mm")
                quote.push(map);
            });
            resolve(quote)
        });
    });
}

async function executeTrendTrade(trend, obj) {

    let trades = JSON.parse(localStorage.getItem("TRADES"));
    if (!trades) {
        trades = []
    }

    if (jQ.inArray(obj.TRADINGSYMBOL, trades) !== -1) {
        return;
    }

    let quote = await checkAlgoVolumeCondtion(obj.TRADINGSYMBOL);

    let prevFiveMinutes = moment().subtract(5, "minutes").format("HH:mm")
    console.log("----------------------------[LAST FIVE MINUTE]-----------------------------");
    console.log("Current Time :" + moment().format("HH:mm"));
    console.log("Last Minutes Time :" + prevFiveMinutes);
    console.log("-----------------------------------------------------------------------");

    let last = {};

    jQ.each(quote, function (index, item) {
        if (prevFiveMinutes == item['time']) {
            last = item
        }
    });
    
    if (!last) {
        return;
    }

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
            if (CHECK_VOLume) {
                if (last.volume > STOCK_VOLUME && isValidClose) {
                    triggerAlgoOrder(obj, 'BUY');
                }
            } else {
                if (isValidClose) {
                    triggerAlgoOrder(obj, 'BUY');
                }
            }
        }

        console.log("----------------------------[ALGO CHECKING FOR ASO TARDE CONDITION]-----------------------------");
        console.log("Volume :" + last.volume);
        console.log("Last Close : " + last.close);
        console.log("Strike : " + asoPrice);
        console.log("Price Moved : " + ASO_MOVED);
        console.log("Valid Close : " + isValidClose);
        console.log("Volume Check : " + CHECK_VOLume);
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
            if (CHECK_VOLume) {
                if (last.volume > STOCK_VOLUME && isValidClose) {
                    triggerAlgoOrder(obj, 'SELL');
                }
            } else {
                if (isValidClose) {
                    triggerAlgoOrder(obj, 'SELL');
                }
            }
        }

        console.log("----------------------------[ALGO CHECKING FOR BSO TRADE CONDITION]-----------------------------");
        console.log("Volume : " + last.volume);
        console.log("Last Close : " + last.close);
        console.log("Strike : " + bsoPrice);
        console.log("Price Moved : " + BSO_MOVED);
        console.log("Valid Close : " + isValidClose);
        console.log("Volume Check : " + CHECK_VOLume);
        console.log("------------------------------------------------------------------------------------");
    }
}

function triggerAlgoOrder(obj, transaction_type) {
    let name = obj.TRADINGSYMBOL;
    let trigger_price = 0;
    let price = 0;
    if (transaction_type == "SELL") {
        let bsoPrice = parseFloat(obj['STRIKEDATA']['bstrikeOne']).toFixed();
        trigger_price = bsoPrice
        price = bsoPrice - 1
    } else {
        let asoPrice = parseFloat(obj['STRIKEDATA']['ustrikeOne']).toFixed();
        trigger_price = asoPrice
        price = asoPrice + 1
    }
    price = parseFloat(obj['CURRENT_PRICE']).toFixed();
    let quantity = (MARGIN / (parseFloat(price) / 5)).toFixed(0)
    let params = { "exchange": "NSE", "tradingsymbol": name, "transaction_type": transaction_type, "product": "MIS", "order_type": ORDER_TYPE, "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": price, "trigger_price": trigger_price, "disclosed_quantity": 0, "tags": [] }
    let trades = JSON.parse(localStorage.getItem("TRADES"));
    if (!trades) {
        trades = []
    }
    if (trades.length <= STOCK_LIMIT) {
        callPlaceOrder(params, ENABLE_ALGO_TRADE)
        if (!ENABLE_ALGO_TRADE) {
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