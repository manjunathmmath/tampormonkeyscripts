async function showTopChartMCX(name) {
    try {

        let futures;
        jQ.each(COMMODITIES_FUTURE_INSTRUMENT_LIST, function (index, item) {
            let instName = name
            if (item.name == instName) {
                futures = item;
            }
        })

        let tempName = name.replaceAll(" ", "-")
        tempName = tempName.replaceAll("&", "-")

        let data = await getHistoricalDataUsingPromise(futures['instrument_token'], MCX_CURRENT_DAY, MCX_CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
        let prevData = await getHistoricalDataUsingPromise(futures['instrument_token'], MCX_PREVIOUS_DAY, MCX_PREVIOUS_DAY, 'day');

        let strikeDiff = MCX_FUTURE_STRIKE_DIFF[name];
        if (!strikeDiff) {
            strikeDiff = "100,100"
        }
        strikeDiff = strikeDiff.split(",");
        let strikeOne = parseFloat(strikeDiff[0])
        let strikeTwo = parseFloat(strikeDiff[1])

        let open = data.data.candles[0][1]
        let prevClose = prevData.data.candles[0][4]

        let ustrikeOne = (parseFloat(open) + strikeOne);
        let ustrikeTwo = (ustrikeOne + strikeTwo);
        let bstrikeOne = (parseFloat(open) - strikeOne);
        let bstrikeTwo = (bstrikeOne - strikeTwo);

        let strikeMap = {}
        strikeMap['strikeDiff'] = parseFloat(strikeDiff).toFixed(2);
        strikeMap['bstrikeOne'] = parseFloat(bstrikeOne).toFixed(2);
        strikeMap['bstrikeTwo'] = parseFloat(bstrikeTwo).toFixed(2);
        strikeMap['ustrikeOne'] = parseFloat(ustrikeOne).toFixed(2);
        strikeMap['ustrikeTwo'] = parseFloat(ustrikeTwo).toFixed(2);

        let ovxChg = 0.0

        let vix = 0.00

        if (name == "CRUDEOIL" || name == "CRUDEOILM") {
            vix = OVX
        }

        if (name == "GOLDM" || name == "GOLD") {
            vix = GVZ
        }

        if (name == "SILVER" || name == "SILVERM") {
            vix = VXSLV
        }

        if (name == "NATURALGAS" || name == "NATGASMINI") {
            vix = VIX
        }

        if (name == "USDINR") {
            vix = "4.85"
        }

        ovxChg = parseFloat(vix) / Math.sqrt(365 - 104 - 15)

        var range = parseFloat(prevClose) * ovxChg / 100
        var lNift = parseFloat(prevClose) - range
        var uNift = parseFloat(prevClose) + range

        strikeMap['vixDDUpper'] = uNift.toFixed(2);
        strikeMap['vixDDLower'] = lNift.toFixed(2)

        let max = strikeMap.vixDDUpper
        let min = strikeMap.vixDDLower

        if (max < strikeMap.ustrikeTwo) {
            max = strikeMap.ustrikeTwo
        }

        if (min > strikeMap.bstrikeTwo) {
            min = strikeMap.bstrikeTwo
        }

        let columns = []
        let x = ['x']
        let column = ["Close"]

        jQ.each(data.data.candles, function (index, item) {
            x.push(moment(item[0]).format("YYYY-MM-DD HH:mm:ss"))
            column.push(parseFloat(item[4]))

            if (item[4] > max) {
                max = item[4]
            }

            if (item[4] < min) {
                min = item[4]
            }

        });

        columns.push(x)
        columns.push(column)

        let lines = []
        lines.push({ position: 'start', value: parseFloat(strikeMap.vixDDLower), text: 'VIXL: ' + strikeMap.vixDDLower, class: 'vixl-line-class' });
        lines.push({ position: 'start', value: parseFloat(strikeMap.vixDDUpper), text: 'VIXU: ' + strikeMap.vixDDUpper, class: 'vixu-line-class' });
        lines.push({ position: 'start', value: parseFloat(strikeMap.ustrikeTwo), text: 'AST: ' + strikeMap.ustrikeTwo, class: 'ustrike-two-line-class' });
        lines.push({ position: 'start', value: parseFloat(strikeMap.ustrikeOne), text: 'ASO: ' + strikeMap.ustrikeOne, class: 'ustrike-one-line-class' });
        lines.push({ position: 'start', value: parseFloat(strikeMap.bstrikeOne), text: 'BSO: ' + strikeMap.bstrikeOne, class: 'bstrike-one-line-class' });
        lines.push({ position: 'start', value: parseFloat(strikeMap.bstrikeTwo), text: 'BST: ' + strikeMap.bstrikeTwo, class: 'bstrike-two-line-class' });


        let chartId = tempName;
        var chart = c3.generate({
            bindto: "#" + chartId + "-chart",
            size: {
                height: 150
            },
            data: {
                x: 'x',
                xFormat: '%Y-%m-%d %H:%M:%S',
                columns: columns,
                type: 'spline'
            },
            point: {
                show: false
            },

            grid: {
                x: {
                    lines: []
                },
                y: {
                    lines: lines
                }
            },

            axis: {
                x: {
                    type: 'timeseries',
                    tick: {
                        // Display format for the x-axis ticks
                        format: '%H:%M',
                        rotate: 60 // Optional: rotate labels for better readability with long formats
                    },
                    show: false,
                },
                y: {
                    show: false,
                    min: parseFloat(min),
                    max: parseFloat(max),
                },

            },
            legend: {
                show: false // Hide the legend      
            }
        });
        let ltp = data.data.candles[data.data.candles.length - 1][4]
        jQ("#" + tempName + "-ltp").html(parseFloat(ltp))
    } catch (error) {
        console.error("Error in showTopChart for " + name, error);
    }


}

async function showFutureDetailsMCX(name) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let futures;
    jQ.each(COMMODITIES_FUTURE_INSTRUMENT_LIST, function (index, item) {
        let instName = name
        if (item.name == instName) {
            futures = item;
        }
    })
    let pres = await getHistoricalDataUsingPromise(futures['instrument_token'], MCX_PREVIOUS_DAY, MCX_PREVIOUS_DAY, 'day');
    let cres = await getHistoricalDataUsingPromise(futures['instrument_token'], MCX_CURRENT_DAY, MCX_CURRENT_DAY, 'day');


    let data = []
    let prevData = []
    jQ.each(cres.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("HH:mm")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map.oi = item[6]
        data.push(map);
    });

    jQ.each(pres.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("HH:mm")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map.oi = item[6]
        prevData.push(map);
    });

    prevData = prevData[prevData.length - 1];
    let resp = showTableAiNiftyPrediction(data[data.length - 1], prevData, futures['lot_size'])
    resp['ltp'] = data[data.length - 1]['close']
    resp['open'] = data[0]['close']
    resp['vwap'] = getVwapTrend(data[data.length - 1], prevData);
    resp['trend'] = getFutureDirection(data[data.length - 1], prevData, name);
    return resp;
}

async function showTrendingOIMCX(instrument) {
    OI_DIVISOR = 1000;
    let name = stock[0]['TRADINGSYMBOL']
    let ltp = stock[0]['LTP']
    let open = stock[0]['OPEN']

    let strikToShow = 4
    let strikeData = []
    let selectedStrike = []
    let currentPrice = open
    if (USE_LTP_FOR_STRIKE) {
        currentPrice = ltp
    }

    if (instrument == "NIFTY 50") {
        instrument = "NIFTY"
        strikToShow = 4
    } else if (instrument == "NIFTY BANK") {
        instrument = "BANKNIFTY"
        strikToShow = 4
    } else if (instrument == "NIFTY FIN SERVICE") {
        instrument = "FINNIFTY"
        strikToShow = 4
    } else if (instrument == "NIFTY MID SELECT") {
        instrument = "MIDCPNIFTY"
        strikToShow = 4
    }

    let atmStrike = 0;
    jQ.each(MCX_OPTION_LIST, function (index, item) {
        let date = moment(item.expiry, 'DD-MM-YYYY').format("YYYY-MM-DD")
        if (item.name == instrument) {
            if (instrument == "NIFTY") {
                if (date == NIFTY_EXPIRY_DATE) {
                    selectedStrike.push(item)
                }
            } else if (instrument == "SENSEX") {
                if (date == SENSEX_EXPIRY_DATE) {
                    selectedStrike.push(item)
                }
            } else {
                selectedStrike.push(item)
            }
        }
    });


    selectedStrike.sort(function (a, b) { return parseFloat(a.strike) - parseFloat(b.strike) })
    let upperStrikes = []
    let lowerStrikes = []
    jQ.each(selectedStrike, function (index, item) {
        let strike = parseFloat(item.strike)

        if (strike >= currentPrice && !atmStrike) {
            atmStrike = strike
        }

        if (strike >= currentPrice) {
            if (jQ.inArray(strike, upperStrikes) === -1) {
                upperStrikes.push(strike)
            }
        } else {
            if (jQ.inArray(strike, lowerStrikes) === -1) {
                lowerStrikes.push(strike)
            }
        }
    });

    for (let i = 1; i <= strikToShow; i++) {
        if (upperStrikes[i]) {
            let obj = {}
            obj['OI_CE'] = ''
            obj['CHG_OI_CE'] = ''
            obj['STRIKE'] = upperStrikes[i]
            obj['OI_PE'] = ''
            obj['CHG_OI_PE'] = ''
            obj['ATM_STRIKE'] = ''
            obj['CE'] = ''
            obj['PE'] = ''
            obj['CE_TOKEN'] = ''
            obj['PE_TOKEN'] = ''
            obj['CE_OBV'] = ''
            obj['PE_OBV'] = ''
            strikeData.push(obj)
        }
    }

    let obj = {}
    obj['OI_CE'] = ''
    obj['CHG_OI_CE'] = ''
    obj['STRIKE'] = atmStrike
    obj['OI_PE'] = ''
    obj['CHG_OI_PE'] = ''
    obj['ATM_STRIKE'] = true
    obj['CE'] = ''
    obj['PE'] = ''
    obj['CE_TOKEN'] = ''
    obj['PE_TOKEN'] = ''
    obj['CE_OBV'] = ''
    obj['PE_OBV'] = ''
    strikeData.push(obj)

    for (let i = 1; i <= strikToShow; i++) {
        if (lowerStrikes[lowerStrikes.length - i]) {
            let obj = {}
            obj['OI_CE'] = ''
            obj['CHG_OI_CE'] = ''
            obj['STRIKE'] = lowerStrikes[lowerStrikes.length - i]
            obj['OI_PE'] = ''
            obj['CHG_OI_PE'] = ''
            obj['ATM_STRIKE'] = ''
            obj['CE'] = ''
            obj['PE'] = ''
            obj['CE_TOKEN'] = ''
            obj['PE_TOKEN'] = ''
            obj['CE_OBV'] = ''
            obj['PE_OBV'] = ''
            strikeData.push(obj)
        }
    }
    strikeData.sort(function (a, b) { return parseFloat(a.STRIKE) - parseFloat(b.STRIKE) })
    let tableData = await showOITrendingDetails(strikeData, selectedStrike)
    return tableData
}



async function showMCXOITrendingDetails(strikeData, selectedStrike) {
    let strikeMap = {}
    for (let i = 0; i < strikeData.length; i++) {
        try {
            let CE = ''
            let PE = ''
            if (strikeData[i]['STRIKE'] != 0) {
                for (let j = 0; j < selectedStrike.length; j++) {
                    if (parseFloat(strikeData[i]['STRIKE']) == parseFloat(selectedStrike[j].strike)
                        && selectedStrike[j].instrument_type == 'CE') {
                        CE = selectedStrike[j]
                    }

                    if (parseFloat(strikeData[i]['STRIKE']) == parseFloat(selectedStrike[j].strike)
                        && selectedStrike[j].instrument_type == 'PE') {
                        PE = selectedStrike[j]
                    }
                }

                let HISTORICAL_DATA_INTERVAL_OVERRIDE = jQ("#api-data-interval option:selected").val()
                if (!HISTORICAL_DATA_INTERVAL_OVERRIDE) {
                    HISTORICAL_DATA_INTERVAL_OVERRIDE = '5minute'
                }

                let prevDataCE = await getHistoricalDataUsingPromise(CE.instrument_token, MCX_PREVIOUS_DAY, MCX_PREVIOUS_DAY, 'day');
                let currDataCE = await getHistoricalDataUsingPromise(CE.instrument_token, MCX_PREVIOUS_DAY, MCX_CURRENT_DAY, HISTORICAL_DATA_INTERVAL_OVERRIDE);

                let prevDataPE = await getHistoricalDataUsingPromise(PE.instrument_token, MCX_PREVIOUS_DAY, MCX_PREVIOUS_DAY, 'day');
                let currDataPE = await getHistoricalDataUsingPromise(PE.instrument_token, MCX_PREVIOUS_DAY, MCX_CURRENT_DAY, HISTORICAL_DATA_INTERVAL_OVERRIDE);



                strikeMap[strikeData[i]['STRIKE']] = {}
                strikeMap[strikeData[i]['STRIKE']]['prevDataCE'] = prevDataCE
                strikeMap[strikeData[i]['STRIKE']]['currDataCE'] = currDataCE
                strikeMap[strikeData[i]['STRIKE']]['prevDataPE'] = prevDataPE
                strikeMap[strikeData[i]['STRIKE']]['currDataPE'] = currDataPE
                strikeMap[strikeData[i]['STRIKE']]['INDEX'] = i
                strikeMap[strikeData[i]['STRIKE']]['ATM_STRIKE'] = strikeData[i]['ATM_STRIKE']

                strikeMap[strikeData[i]['STRIKE']]['CE'] = CE
                strikeMap[strikeData[i]['STRIKE']]['PE'] = PE
            }
        } catch (err) {
            console.log("Error while fetching strike : " + strikeData[i]['STRIKE'])
        }
    }

    let tableData = []

    let totalCEOI = 0;
    let totalPEOI = 0;

    let chCEOI = 0;
    let chPEOI = 0;

    jQ.each(strikeMap, function (index, item) {
        try {
            let currDataCE = item['currDataCE']['data']['candles']
            let currDataPE = item['currDataPE']['data']['candles']

            let prevDataCE = item['prevDataCE']['data']['candles']
            let prevDataPE = item['prevDataPE']['data']['candles']

            if (currDataCE.length == 0) {
                currDataCE = prevDataCE
            }

            if (currDataPE.length == 0) {
                currDataPE = prevDataPE
            }

            let OI_CE = currDataCE[currDataCE.length - 1][6]
            let OI_PE = currDataPE[currDataPE.length - 1][6]

            totalCEOI = totalCEOI + OI_CE
            totalPEOI = totalPEOI + OI_PE

            let PREV_OI_CE = prevDataCE[prevDataCE.length - 1][6]
            let PREV_OI_PE = prevDataPE[prevDataPE.length - 1][6]

            let obj = {}
            obj['OI_CE'] = parseFloat(OI_CE / OI_DIVISOR).toFixed(1)
            obj['CHG_OI_CE'] = parseFloat((OI_CE - PREV_OI_CE) / OI_DIVISOR).toFixed(1)
            obj['STRIKE'] = index
            obj['OI_PE'] = parseFloat(OI_PE / OI_DIVISOR).toFixed(1)
            obj['CHG_OI_PE'] = parseFloat((OI_PE - PREV_OI_PE) / OI_DIVISOR).toFixed(1)
            obj['ATM_STRIKE'] = item.ATM_STRIKE
            obj['CE'] = item.CE
            obj['PE'] = item.PE

            chCEOI = chCEOI + (OI_CE - PREV_OI_CE)
            chPEOI = chPEOI + (OI_PE - PREV_OI_PE)

            obj['currDataCE'] = currDataCE
            obj['currDataPE'] = currDataPE

            obj['prevDataCE'] = prevDataCE
            obj['prevDataPE'] = prevDataPE
            obj['CE_OBV'] = calculateOBVFiveMinutesInterval(prevDataCE, currDataCE)
            obj['PE_OBV'] = calculateOBVFiveMinutesInterval(prevDataPE, currDataPE)

            tableData.push(obj)
        } catch (err) {
            console.log("Error while fetching strike : " + index)
        }

    });

    let pcr = parseFloat(totalPEOI / totalCEOI).toFixed(2);
    let chPcr = parseFloat(chPEOI / chCEOI).toFixed(2);


    tableData.sort(function (a, b) { return parseFloat(a.STRIKE) - parseFloat(b.STRIKE) })
    let map = {}
    map['tableData'] = tableData
    map['pcr'] = pcr
    map['chPcr'] = chPcr
    return map
}


async function showPrictionProbabiltyMCX(name, intr) {
    stock = []
    let scripts = []
    let obj = {}
    obj['TRADINGSYMBOL'] = name;
    obj['LTP'] = intr['ltp']
    scripts.push(obj)

    for (let i = 0; i < scripts.length; i++) {
        let obj = {}
        obj['TRADINGSYMBOL'] = scripts[i]['TRADINGSYMBOL']
        obj['LTP'] = intr['ltp']
        obj['OPEN'] = intr['open']
        obj['DATA'] = ''
        stock.push(obj)
    }

    if (stock.length > 0) {
        await callPredictionAnalyseTrendMCX();
    }
}

async function callPredictionAnalyseTrendMCX() {
    let scriptsCount = stock.length
    for (let i = 0; i < scriptsCount; i++) {
        try {
            let name = stock[i]['TRADINGSYMBOL']
            let ltp = stock[i]['LTP']
            if (name != 'GIFT NIFTY') {
                let oiData = await showTrendingOIMCX(name)
                stock[i]['DATA'] = oiData
            }
        } catch (err) {
            console.log("Error while analyzing stock : " + stock[i]['TRADINGSYMBOL'])
            console.log(err)
        }
    }
}

