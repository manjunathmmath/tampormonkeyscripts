
async function startStockAlgoTrades() {
    let currentTime = moment().format("HH:mm")
    let checkTime = moment(PREVIOUS_DAY_DATE + " 09:20:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")
    let endTime = moment(PREVIOUS_DAY_DATE + " 15:10:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")

    console.log("Algo starts executing orders @ " + checkTime + "AM.  current time is :" + currentTime);

    if (currentTime >= endTime) {
        console.log("----------------------------[MARKET CLOSED]-----------------------------------------");
        console.log("current Time :" + currentTime);
        console.log("------------------------------------------------------------------------------------");
        return
    }

    if (!(currentTime >= checkTime)) {
        console.log("-------------------------[ALGO CHECKING FOR 9:15 MINUTES TARDE CONDITION]-----------");
        console.log("current Time :" + currentTime);
        console.log("------------------------------------------------------------------------------------");
        return
    }

    let currentMinute = moment().format("mm")
    if ((currentMinute % 5) != 0) {
        console.log("-------------------[ALGO CHECKING FOR 5 MINUTES INTERVAL TARDE CONDITION]-----------");
        console.log("current Minute :" + currentMinute);
        console.log("------------------------------------------------------------------------------------");
        return
    }

    let prevFiveMinutes = moment().subtract(5, "minutes").format("HH:mm")
    console.log("------------------------[LAST FIVE MINUTE]-----------------------------");
    console.log("Current Time :" + moment().format("HH:mm"));
    console.log("Last Minutes Time :" + prevFiveMinutes);
    console.log("-----------------------------------------------------------------------");


    let listType = FO_LIST;

    if (USE_MOVEMENT_STOCKS) {
        listType = MOVEMENTSTOCKS
    }
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
            obj['prevFiveMinutes'] = prevFiveMinutes;

            if (infoMap[data.name]) {
                obj['TREND'] = infoMap[data.name]['trends'];
                obj['LTP'] = infoMap[data.name]['currentPrice'];
                obj['STRIKEDATA'] = infoMap[data.name]['strikeData'];
                obj['CURRENT_PRICE'] = infoMap[data.name]['currentPrice'];
            }

            if (STOCK_TREND_TO_TRADE == "ALL") {
                if (jQ.inArray("ASO", obj['TREND']) != -1) {
                    await executeTrendTrade("ASO", obj)
                }
                if (jQ.inArray("BSO", obj['TREND']) != -1) {
                    await executeTrendTrade("BSO", obj)
                }
            } else if (STOCK_TREND_TO_TRADE == "ASO") {
                if (jQ.inArray("ASO", obj['TREND']) != -1) {
                    await executeTrendTrade("ASO", obj)
                }

            } else if (STOCK_TREND_TO_TRADE == "BSO") {
                if (jQ.inArray("BSO", obj['TREND']) != -1) {
                    await executeTrendTrade("BSO", obj)
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

    let orderBook = JSON.parse(localStorage.getItem("ORDERBOOK"));
    if (!orderBook) {
        orderBook = {}
    }
    let prevOrder = orderBook[obj.TRADINGSYMBOL]

    let skipTrade = false;
    if (prevOrder) {
        if (jQ.inArray(trend, obj['TREND']) !== -1) {
            skipTrade = true
        }
    } else {
        if (jQ.inArray(obj.TRADINGSYMBOL, trades) !== -1) {
            skipTrade = true
        }
    }

    if (skipTrade) {
        return;
    }


    let quote = await checkAlgoVolumeCondtion(obj.TRADINGSYMBOL);

    let tempName = obj.TRADINGSYMBOL.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    await savePreviousStockQuote(tempName, instrumentTokens[obj.TRADINGSYMBOL])

    let previousQuote = JSON.parse(localStorage.getItem(tempName + "_PREVIOUS_DAY_QUOTE"));
    let prevQuote = []
    jQ.each(previousQuote.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("HH:mm:ss")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        prevQuote.push(map);
    });

    let dayHigh = 0
    let dayLow = 0
    let dayOpen = parseFloat(instrumentsMap[obj.TRADINGSYMBOL]['price']);
    jQ.each(prevQuote, function (index, item) {
        if (index == 0) {
            dayHigh = item.high
            dayLow = item.low
        }

        if (item.high > dayHigh) {
            dayHigh = item.high
        }

        if (item.low < dayLow) {
            dayLow = item.low
        }
    });



    let last = {};
    console.log(quote)
    jQ.each(quote, function (index, item) {
        if (obj['prevFiveMinutes'] == item['time']) {
            last = item
        }
        if (item.high > dayHigh) {
            dayHigh = item.high
        }

        if (item.low < dayLow) {
            dayLow = item.low
        }
    });

    if (!last) {
        return;
    }

    let previousClose = parseFloat(instrumentsMap[obj.TRADINGSYMBOL].prevPrice);
    let res = calculateOHLBuySell(dayOpen, dayHigh, dayLow, obj['CURRENT_PRICE'], previousClose);

    obj['OHL_TREND'] = res;

    let asoPrice = 0;
    let bsoPrice = 0;
    let aso = parseFloat(obj['STRIKEDATA']['ustrikeOne']) - parseFloat(obj['PRICE']);
    aso = aso / 2
    asoPrice = parseFloat(obj['STRIKEDATA']['ustrikeOne']) - aso;

    let bso = parseFloat(obj['PRICE']) - parseFloat(obj['STRIKEDATA']['bstrikeOne']);
    bso = bso / 2
    bsoPrice = parseFloat(obj['STRIKEDATA']['bstrikeOne']) + bso;


    let isValidClose = false;
    let priceMoved = parseInt(STOCK_PRICE_MOVED)
    if (trend == "ASO") {
        let currentPrice = parseFloat(obj['CURRENT_PRICE']);
        let ASO_MOVED = currentPrice - asoPrice;
        if (ASO_MOVED <= priceMoved) {
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

        console.log("----------------------------[ALGO CHECKING FOR ASO TARDE CONDITION]------------------");
        console.log("Script : " + obj.TRADINGSYMBOL);
        console.log("Volume :" + last.volume);
        console.log("Last Close : " + last.close);
        console.log("Strike : " + asoPrice);
        console.log("Price Moved : " + ASO_MOVED);
        console.log("Valid Close : " + isValidClose);
        console.log("Volume Check : " + CHECK_VOLume);
        console.log("------------------------------------------------------------------------------------");
    }

    if (trend == "BSO") {
        let currentPrice = parseFloat(obj['CURRENT_PRICE']);
        let BSO_MOVED = bsoPrice - currentPrice
        if (BSO_MOVED <= priceMoved) {
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

        console.log("----------------------------[ALGO CHECKING FOR BSO TRADE CONDITION]------------------");
        console.log("Script : " + obj.TRADINGSYMBOL);
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
    let currentPrice = parseFloat(obj['CURRENT_PRICE']);
    if (transaction_type == "SELL") {
        let bsoPrice = parseFloat(obj['STRIKEDATA']['bstrikeOne']);
        trigger_price = currentPrice
        price = currentPrice - 0.50
    } else {
        let asoPrice = parseFloat(obj['STRIKEDATA']['ustrikeOne']);
        trigger_price = currentPrice
        price = currentPrice + 0.50
    }

    let quantity = (MARGIN / (parseFloat(currentPrice) / 5)).toFixed(0)
    let params = { "exchange": "NSE", "tradingsymbol": name, "transaction_type": transaction_type, "product": "MIS", "order_type": ORDER_TYPE, "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": price, "trigger_price": trigger_price, "disclosed_quantity": 0, "tags": [] }
    let trades = JSON.parse(localStorage.getItem("TRADES"));
    if (!trades) {
        trades = []
    }
    if (trades.length <= STOCK_LIMIT) {
        let res = await callPlaceOrder(params, ENABLE_ALGO_TRADE)
        if (res.status == "success") {
            let ohlTrend = JSON.parse(localStorage.getItem("OHL_TREND"));
            
            if (!ohlTrend) {
                ohlTrend = {}
            }

            ohlTrend[obj.TRADINGSYMBOL] =  obj['OHL_TREND']
            localStorage.setItem("OHL_TREND", JSON.stringify(ohlTrend));

            if (ENABLE_SL && ENABLE_ALGO_TRADE) {
                await setStopLoss(obj, transaction_type, quantity)
            }
        }
        if (!ENABLE_ALGO_TRADE) {
            console.log("----------------------------STOCK ALGO DISABLED------------------------------");
            console.log(params);
            console.log("-----------------------------------------------------------------------------");
        }
    } else {
        console.log("----------------------------STOCK LIMIT EXCEEDED---------------------------------");
        console.log(params);
        console.log("---------------------------------------------------------------------------------");
    }

}

async function setStopLoss(obj, type, quantity) {
    let name = obj.TRADINGSYMBOL;
    let transaction_type = "BUY"
    if (type == "BUY") {
        transaction_type = "SELL";
    }

    let price = 0.00
    let trigger_price = 0.00;
    let stopLoss = parseFloat(obj['PRICE']);

    if (transaction_type == "BUY") {
        trigger_price = stopLoss
        price = parseFloat(stopLoss) + 0.20
    } else {
        trigger_price = stopLoss
        price = parseFloat(stopLoss) - 0.20
    }

    trigger_price = parseFloat(trigger_price);
    price = parseFloat(price);

    let params = { "exchange": "NSE", "tradingsymbol": name, "transaction_type": transaction_type, "product": "MIS", "order_type": "SL", "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": price, "trigger_price": trigger_price, "disclosed_quantity": 0, "tags": [] }
    placeOrder(params)
}