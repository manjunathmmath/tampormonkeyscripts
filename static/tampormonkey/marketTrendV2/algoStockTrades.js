
async function startStockAlgoTrades() {
    let currentTime = moment().format("HH:mm")
    let checkTime = moment(PREVIOUS_DAY_DATE + " 09:20:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")
    let endTime = moment(PREVIOUS_DAY_DATE + " 15:10:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")

    console.log("Algo starts executing orders @ " + checkTime + "AM.  current time is :" + currentTime);


    if (currentTime >= endTime) {
        console.log("----------------------------[MARKET CLOSED..............................]-----------");
        console.log("current Time :" + currentTime);
        console.log("------------------------------------------------------------------------------------");
        return
    }

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

    let prevFiveMinutes = moment().subtract(5, "minutes").format("HH:mm")
    console.log("----------------------------[LAST FIVE MINUTE]-----------------------------");
    console.log("Current Time :" + moment().format("HH:mm"));
    console.log("Last Minutes Time :" + prevFiveMinutes);
    console.log("-----------------------------------------------------------------------");


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
            obj['prevFiveMinutes'] = prevFiveMinutes;

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

    let last = {};

    jQ.each(quote, function (index, item) {
        if (obj['prevFiveMinutes'] == item['time']) {
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
                    await triggerAlgoOrder(obj, 'BUY');
                }
            } else {
                if (isValidClose) {
                    await triggerAlgoOrder(obj, 'BUY');
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
                    await triggerAlgoOrder(obj, 'SELL');
                }
            } else {
                if (isValidClose) {
                    await triggerAlgoOrder(obj, 'SELL');
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

async function triggerAlgoOrder(obj, transaction_type) {
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
        let res = await callPlaceOrder(params, ENABLE_ALGO_TRADE)
        if (res.status == "success") {
            if (ENABLE_SL && ENABLE_ALGO_TRADE) {
                await setStopLoss(obj, transaction_type,quantity)
            }
        }
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

async function setStopLoss(obj, type,quantity) {
    let name = obj.TRADINGSYMBOL;
    let transaction_type = "BUY"
    if (type == "BUY") {
        transaction_type = "SELL";
    }

    let asoPrice = parseFloat(obj['STRIKEDATA']['ustrikeOne']).toFixed();
    let bsoPrice = parseFloat(obj['STRIKEDATA']['bstrikeOne']).toFixed();

    let price = 0
    let trigger_price = 0;

    let stopLoss = 0;
    if (type == "BUY") {
        let stop = parseFloat(asoPrice) - parseFloat(obj['PRICE']);
        stop = stop/2
        stopLoss = parseFloat(asoPrice - stop).toFixed(2);
    } else if (type =="SELL") {
        let stop = parseFloat(currentInfo['instrument']['price']) - parseFloat(bsoPrice);
        stop = stop/2
        stopLoss = parseFloat(bsoPrice + stop).toFixed(2);
    }

    if(transaction_type == "BUY"){
        trigger_price = stopLoss
        price = parseFloat(stopLoss + 0.10).toFixed(2)
    }else{
        trigger_price = stopLoss
        price = parseFloat(stopLoss - 0.10).toFixed(2)
    }

    let params = { "exchange": "NSE", "tradingsymbol": name, "transaction_type": transaction_type, "product": "MIS", "order_type": "SL", "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": price, "trigger_price": trigger_price, "disclosed_quantity": 0, "tags": [] }
    placeOrder(params)
}