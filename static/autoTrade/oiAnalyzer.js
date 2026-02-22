let stock = []
async function showPrictionProbabilty(name) {
    stock = []
    let scriptData = generateTrend(name)
    let scripts = []
    let obj = {}
    obj['TRADINGSYMBOL'] = name;
    obj['CLOSE'] = scriptData['prevPrice'];
    obj['PRICE'] = scriptData['price'];
    obj['PERC'] = scriptData['perc'];
    obj['TREND'] = scriptData['trends'];
    obj['LTP'] = scriptData['ltp'];
    obj['STRIKEDATA'] = scriptData['strikeData'];
    obj['CURRENT_PRICE'] = scriptData['ltp'];
    obj['TREND'] = scriptData['trends'];
    scripts.push(obj)

    for (let i = 0; i < scripts.length; i++) {
        let obj = {}
        obj['TRADINGSYMBOL'] = scripts[i]['TRADINGSYMBOL']
        obj['LTP'] = scripts[i]['LTP']
        obj['TREND'] = scripts[i]['TREND']
        obj['STRIKEDATA'] = scripts[i]['STRIKEDATA']
        obj['CLOSE'] = scripts[i]['CLOSE']
        obj['PRICE'] = scripts[i]['PRICE']
        obj['PERC'] = scripts[i]['PERC']
        obj['DATA'] = ''
        stock.push(obj)
    }

    if (stock.length > 0) {
        await callPredictionAnalyseTrend();
    }
}

async function callPredictionAnalyseTrend() {
    let scriptsCount = stock.length
    for (let i = 0; i < scriptsCount; i++) {
        try {
            let name = stock[i]['TRADINGSYMBOL']
            if (name != 'GIFT NIFTY') {
                let oiData = await showTrendingOI(name)
                stock[i]['DATA'] = oiData
            }
        } catch (err) {
            console.log("Error while analyzing stock : " + stock[i]['TRADINGSYMBOL'])
            console.log(err)
        }
    }
}


function calculateOBVFiveMinutesInterval(prevData, currData) {
    let OBV = 0;
    let prevLastCandle = prevData[prevData.length - 1]
    OBV = 0
    let obvList = []
    jQ.each(currData, function (index, item) {
        if (item[4] > prevLastCandle[4]) {
            OBV = OBV + item[5]
        }

        if (item[4] < prevLastCandle[4]) {
            OBV = OBV - item[5]
        }
        prevLastCandle = item
        let obj = {};
        obj['date'] = item[0];
        obj['obv'] = parseFloat(OBV / 100000).toFixed(1);
        obvList.push(obj)
    })
    return obvList;
}

async function showTrendingOI(instrument) {

    let strikToShow = 2
    let strikeData = []
    let selectedStrike = []
    let res = generateTrend(instrument)
    let currentPrice = res['open']
    if (USE_LTP_FOR_STRIKE) {
        currentPrice = res['ltp']
    }

    if (instrument == "NIFTY 50") {
        instrument = "NIFTY"
        strikToShow = 3
    } else if (instrument == "NIFTY BANK") {
        instrument = "BANKNIFTY"
        strikToShow = 3
    } else if (instrument == "NIFTY FIN SERVICE") {
        instrument = "FINNIFTY"
        strikToShow = 3
    } else if (instrument == "NIFTY MID SELECT") {
        instrument = "MIDCPNIFTY"
        strikToShow = 3
    }

    let atmStrike = 0;
    jQ.each(OPTION_STRIKE_LIST, function (index, item) {
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

async function showOITrendingDetails(strikeData, selectedStrike) {
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

                let prevDataCE = await getHistoricalDataUsingPromise(CE.instrument_token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day');
                let currDataCE = await getHistoricalDataUsingPromise(CE.instrument_token, PREVIOUS_DAY_DATE, CURRENT_DAY, HISTORICAL_DATA_INTERVAL_OVERRIDE);

                let prevDataPE = await getHistoricalDataUsingPromise(PE.instrument_token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day');
                let currDataPE = await getHistoricalDataUsingPromise(PE.instrument_token, PREVIOUS_DAY_DATE, CURRENT_DAY, HISTORICAL_DATA_INTERVAL_OVERRIDE);



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
            obj['OI_CE'] = parseFloat(OI_CE / 100000).toFixed(1)
            obj['CHG_OI_CE'] = parseFloat((OI_CE - PREV_OI_CE) / 100000).toFixed(1)
            obj['STRIKE'] = index
            obj['OI_PE'] = parseFloat(OI_PE / 100000).toFixed(1)
            obj['CHG_OI_PE'] = parseFloat((OI_PE - PREV_OI_PE) / 100000).toFixed(1)
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