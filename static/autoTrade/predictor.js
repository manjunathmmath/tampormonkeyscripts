
jQ(document).on("click", ".show-predictor", function (e) {
    e.preventDefault();
    let name = jQ(this).attr("data-name");
    showPredictor(name);
})


jQ(document).on("click", "#show-predictor", function (e) {
    e.preventDefault();
    showPredictor();
})

let predictorTimerInstance = null
async function showPredictor(name) {
    let html = ''
    html += '<div class="row">'
    html += '<div class="col-md-5">'
    html += '</div>'
    html += '<div class="col-md-2">'
    html += '<select id="predictor-instruments" class="form-control form-control-sm">'
    html += '</select>'
    html += '</div>'

    html += '</div>'

    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row" >'
    html += '<div class="col-md-12">'
    html += '<table  class="table display nowrap" id="predictor-stock-list-table" style="width: 100%;">'

    html += '<thead>'



    html += '<tr>'
    html += '<th>SYMBOL</th>'
    html += '<th id="symbol-prediction">SYMBOL NAME</th>'
    html += '</tr>'

    html += '<tr>'
    html += '<th >CHANGE %</th>'
    html += '<th id="change-prediction">CHANGE %</th>'
    html += '</tr>'

    html += '<tr>'
    html += '<th  title="Price Moved" >PRICE MOVED</th>'
    html += '<th id="price-moved-prediction">PRICE MOVED</th>'
    html += '</tr>'

    html += '<tr>'
    html += '<th title="Strike Trend" >STRIKE TREND</th>'
    html += '<th id="strike-trend-prediction">STRIKE TREND</th>'
    html += '</tr>'

    html += '<tr>'
    html += '<th  title="OHL Trend" >OHL TREND</th>'
    html += '<th id="ohl-trend-prediction">OHL TREND</th>'
    html += '</tr>'
    html += '<tr>'

    html += '<th>OHL BUY %</th>'
    html += '<th id="ohl-buy-perc-prediction">OHL BUY %</th>'
    html += '</tr>'
    html += '<tr>'

    html += '<th>OHL SELL %</th>'
    html += '<th id="ohl-sell-perc-prediction">OHL SELL %</th>'
    html += '</tr>'
    html += '<tr>'

    html += '<th title="Volume" >VOLUME</th>'
    html += '<th id="volume-prediction">VOLUME</th>'
    html += '</tr>'
    html += '<tr>'

    html += '<th>LTP</th>'
    html += '<th id="ltp-prediction">LTP</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<th>PCR</th>'
    html += '<th id="pcr-prediction">PCR</th>'
    html += '</tr>'
    html += '<tr>'
    html += '<th>BREAKOUT</th>'
    html += '<th id="breakout-prediction">BREAKOUT</th>'
    html += '</tr>'

    html += '<tr>'
    html += '<th>PREDICTION</th>'
    html += '<th id="prediction-prediction">PREDICTION</th>'
    html += '</tr>'


    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'


    html += '<table  class="table display nowrap"  style="width: 100%;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th colspan="3" class="strike-colspan-class itm-col-class">Strike</th>'
    html += '<th colspan="3" class="strike-colspan-class itm-col-class">Strike</th>'
    html += '<th colspan="3" class="strike-colspan-class atm-col-class">Strike</th>'
    html += '<th colspan="3" class="strike-colspan-class otm-col-class">Strike</th>'
    html += '<th colspan="3" class="strike-colspan-class otm-col-class">Strike</th>'
    html += '</tr>'
    html += '<tr>'
    html += '<th id="STRIKE_LOWER_ONE_CE-prediction" class="number-align" >CE</th>'
    html += '<th id="STRIKE_LOWER_ONE-prediction" class="text-align">S</th>'
    html += '<th id="STRIKE_LOWER_ONE_PE-prediction" class="number-align">PE</th> '

    html += '<th id="STRIKE_LOWER_TWO_CE-prediction" class="number-align">CE</th>'
    html += '<th id="STRIKE_LOWER_TWO-prediction" class="text-align">S</th>'
    html += '<th id="STRIKE_LOWER_TWO_PE-prediction" class="number-align">PE</th> '

    html += '<th id="STRIKE_ATM_CE-prediction" class="number-align">CE</th>'
    html += '<th id="STRIKE_ATM-prediction" class="text-align">S</th>'
    html += '<th id="STRIKE_ATM_PE-prediction" class="number-align">PE</th> '

    html += '<th id="STRIKE_UPPER_ONE_CE-prediction" class="number-align">CE</th>'
    html += '<th id="STRIKE_UPPER_ONE-prediction" class="text-align">S</th>'
    html += '<th id="STRIKE_UPPER_ONE_PE-prediction" class="number-align">PE</th> '

    html += '<th id="STRIKE_UPPER_TWO_CE-prediction" class="number-align">CE</th>'
    html += '<th id="STRIKE_UPPER_TWO-prediction" class="text-align">S</th>'
    html += '<th id="STRIKE_UPPER_TWO_PE-prediction" class="number-align">PE</th> '
    html += '<tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'




    html += '</div>'
    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row" id="oi-obv-charts">'
    html += '</div>'



    let title = ''
    title += '<div class="row">'
    title += '<div class="col-md-2">'
    title += 'Predictor'
    title += '</div>'
    title += '</div>'

    showPopUpWindow('predictor', html, "Predictor", 950, 750);

    var divId = "popup-custom-style-predictor";

    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);

    jQ("." + divId).on("close.popupwindow", function () {
        if (predictorTimerInstance) {
            clearInterval(predictorTimerInstance)
        }
    });

    clearInterval(predictorTimerInstance)
    fillPredictionInstruments(name)
}

function fillPredictionInstruments(name) {
    var select = jQ("#predictor-instruments");
    var htmlMarkup = "";
    htmlMarkup += '<option value="">Choose</option>'
    let EXTRA_LIST = FO_LIST
    EXTRA_LIST.push("NIFTY 50")
    EXTRA_LIST.push("NIFTY BANK")
    EXTRA_LIST.push("NIFTY MID SELECT")
    EXTRA_LIST.push("NIFTY FIN SERVICE")
    EXTRA_LIST.push("SENSEX")
    EXTRA_LIST.push("BANKEX")
    jQ.each(EXTRA_LIST, function (index, item) {
        let selected = ''
        if (name) {
            if (item == name) {
                selected = 'selected'
            }
        } else {
            if (item == "NIFTY 50") {
                selected = 'selected'
            }
        }
        htmlMarkup += '<option ' + selected + ' value="' + item + '">' + item + '</option>'
    });
    select.html(htmlMarkup);
    jQ("#predictor-instruments").trigger("change")
}

jQ(document).on("click", "#predictor-start-auto-refresh", function (e) {
    e.preventDefault()
    jQ("#predictor-instruments").trigger("change")
});


jQ(document).on("change", "#predictor-instruments", function (e) {
    jQ("#predition-result").html("")
    let instrument = jQ("#predictor-instruments option:selected").val()
    showPrictionProbabilty(instrument)
});

let stock = []
async function showPrictionProbabilty(name) {
    stock = []
    let scriptData = generateTrend(name)
    console.log(scriptData)
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


        obj['OHL_TREND'] = ''
        obj['PCR'] = ''
        obj['PREDICTION'] = ''
        obj['VOLUME'] = ''
        obj['STRIKE_LOWER_ONE_CE'] = ''
        obj['STRIKE_LOWER_ONE'] = ''
        obj['STRIKE_LOWER_ONE_PE'] = ''

        obj['STRIKE_LOWER_TWO_CE'] = ''
        obj['STRIKE_LOWER_TWO'] = ''
        obj['STRIKE_LOWER_TWO_PE'] = ''

        obj['STRIKE_ATM_CE'] = ''
        obj['STRIKE_ATM'] = ''
        obj['STRIKE_ATM_PE'] = ''

        obj['STRIKE_UPPER_ONE_CE'] = ''
        obj['STRIKE_UPPER_ONE'] = ''
        obj['STRIKE_UPPER_ONE_PE'] = ''

        obj['STRIKE_UPPER_TWO_CE'] = ''
        obj['STRIKE_UPPER_TWO'] = ''
        obj['STRIKE_UPPER_TWO_PE'] = ''
        obj['BREAK_OUT'] = ''

        obj['isOneDayAgo'] = false;
        obj['isTwoDayAgo'] = false;
        obj['isThreeDayAgo'] = false;
        obj['isFourDayAgo'] = false;
        obj['isFiveDayAgo'] = false;
        obj['isSixDayAgo'] = false;
        obj['isSevenDayAgo'] = false;
        obj['isDayCloseGreaterDayOpen'] = false;
        obj['isDayCloseGreaterOneDayAgoClose'] = false;
        obj['isWeeklyCloseGreaterWeeklyOpen'] = false;
        obj['isMonthlyCloseGreaterMonthlyOpen'] = false;
        obj['oneDayAgoVolumeGreater'] = false;

        let priceMoved = 0;
        let asoPrice = 0;
        let bsoPrice = 0;
        asoPrice = parseFloat(obj['STRIKEDATA']['ustrikeOne']);
        bsoPrice = parseFloat(obj['STRIKEDATA']['bstrikeOne']);

        if (jQ.inArray("ASO", obj['TREND']) != -1) {
            priceMoved = parseFloat(obj['LTP']) - asoPrice
        }

        if (jQ.inArray("BSO", obj['TREND']) != -1) {
            priceMoved = bsoPrice - parseFloat(obj['LTP'])
        }

        obj['PRICE_MOVED'] = parseFloat(priceMoved).toFixed(1)
        stock.push(obj)
    }

    if (stock.length > 0) {
        await callPredictionAnalyseTrend();
        generatePredictionUI(stock)
    }

}


function generatePredictionUI(stock) {

    let row = stock[0]

    let html = ''
    html += '<a target="_blank" href="https://kite.zerodha.com/chart/ext/tvc/' + 'NSE' + '/' + row['TRADINGSYMBOL'] + '/' + instrumentTokens[row['TRADINGSYMBOL']] + '"> '

    let trades = JSON.parse(localStorage.getItem("TRADES"));
    if (jQ.inArray(row['TRADINGSYMBOL'], trades) !== -1) {
        html += '<span class=" bg-warning-color" title="Already traded">' + row['TRADINGSYMBOL'] + '</span>'
    } else {
        html += row['TRADINGSYMBOL'];
    }
    html += '</a>'

    html += '<span style="font-size:xx-small;margin-left:2rem;" data-price="' + row['LTP'] + '" data-index="' + 0 + '" data-trend="' + row['TREND'] + '" data-name="' + row['TRADINGSYMBOL'] + '" class="bg-info-color show-chart">'
    html += 'Chart'
    html += '</span>'

    let symbol = row['TRADINGSYMBOL']
    if (row['TRADINGSYMBOL'] == "NIFTY 50") {
        symbol = "NIFTY"
    }
    html += '<span style="font-size:xx-small;margin-left:2rem;" data-price="' + row['LTP'] + '" data-index="' + 0 + '" data-trend="' + row['TREND'] + '" data-name="' + symbol + '" class="bg-info-color show-option-change">'
    html += 'OI'
    html += '</span>'
    jQ("#symbol-prediction").html(html)


    html = ''
    let currentPrice = row['LTP'];
    let prevClose = row['CLOSE'];
    let change = (currentPrice - prevClose).toFixed(2);
    let changePerc = ((change / prevClose) * 100).toFixed(2)
    if (changePerc < 0) {
        html += '<span class=" bg-danger-color">' + changePerc + '</span>'
    } else {
        html += '<span class=" bg-success-color">' + changePerc + '</span>'
    }
    jQ("#change-prediction").html(html)


    jQ("#price-moved-prediction").html(row['PRICE_MOVED'])


    html = ''
    if (row['TREND'].length > 0) {
        jQ.each(row['TREND'], function (index, item) {
            if (item == "ASO") {
                html += '<span class="badge bg-info above-strike-one strike-info">ASO</span>'
            }

            if (item == "BSO") {
                html += '<span class="badge bg-info below-strike-one strike-info">BSO</span>'
            }

            if (item == "VIXU") {
                html += '<span class="badge bg-info below-strike-one strike-info">VIXU</span>'
            }

            if (item == "VIXL") {
                html += '<span class="badge bg-info below-strike-one strike-info">VIXL</span>'
            }

            if (item == "AST") {
                html += '<span class="badge bg-info above-strike-two strike-info">AST</span>'
            }

            if (item == "BST") {
                html += '<span class="badge bg-info above-strike-one strike-info">BST</span>'
            }
        });
    } else {
        html += '<span class="badge bg-info">No Trend</span>'
    }
    jQ("#strike-trend-prediction").html(html)


    html = ''
    if (row['OHL_TREND']) {

        if (row['OHL_TREND'][2] == "Strong Sell(OH)") {
            html += '<span title="' + row['OHL_TREND'][2] + '" class="badge bg-danger">SSOH</span>'
        }

        if (row['OHL_TREND'][2] == "Strong Buy(OL)") {
            html += '<span title="' + row['OHL_TREND'][2] + '" class="badge bg-success">SBOL</span>'

        }

        if (row['OHL_TREND'][2] == "Strong Sell(Lower High)") {
            html += '<span title="' + row['OHL_TREND'][2] + '" class="badge bg-danger">SSLH</span>'
        }

        if (row['OHL_TREND'][2] == "Strong Buy(Higher High)") {
            html += '<span title="' + row['OHL_TREND'][2] + '" class="badge bg-success">SBHH</span>'
        }

        if (row['OHL_TREND'][2] == "Buy") {
            html += '<span title="' + row['OHL_TREND'][2] + '" class="badge bg-success">B</span>'
        }

        if (row['OHL_TREND'][2] == "Sell") {
            html += '<span title="' + row['OHL_TREND'][2] + '" class="badge bg-danger">S</span>'
        }
    }
    jQ("#ohl-trend-prediction").html(html)


    html = ''
    if (row['OHL_TREND']) {
        html += '<span class=" bg-success-color">' + parseFloat(row['OHL_TREND'][0]).toFixed(2) + '</span>'
    }
    jQ("#ohl-buy-perc-prediction").html(html)


    html = ''
    if (row['OHL_TREND']) {
        html += '<span class=" bg-danger-color">' + parseFloat(row['OHL_TREND'][1]).toFixed(2) + '</span>'
    }
    jQ("#ohl-sell-perc-prediction").html(html);


    jQ("#volume-prediction").html(row['VOLUME'])

    jQ("#ltp-prediction").html(row['LTP'])


    let pcr = row['PCR'].split(":");
    let pcrHtml = ''
    let chPcrHtml = ''


    if (parseFloat(pcr[0].trim()) < 1 && parseFloat(pcr[0].trim()) > 0) {
        pcrHtml += '<span class="badge bg-danger">' + pcr[0] + '</span>'
    } else {
        pcrHtml += '<span class="badge bg-success">' + pcr[0] + '</span>'
    }

    if (parseFloat(pcr[1].trim()) < 1 && parseFloat(pcr[1].trim()) > 0) {
        chPcrHtml += '<span class="badge bg-danger">' + pcr[1] + '</span>'
    } else {
        chPcrHtml += '<span class="badge bg-success">' + pcr[1] + '</span>'
    }

    jQ("#pcr-prediction").html(pcrHtml + " : " + chPcrHtml);


    let isOneDayAgoClass = 'badge bg-warning'
    let isTwoDayAgoClass = 'badge bg-warning'
    let isThreeDayAgoClass = 'badge bg-warning'
    let isFourDayAgoClass = 'badge bg-warning'
    let isFiveDayAgoClass = 'badge bg-warning'
    let isSixDayAgoClass = 'badge bg-warning'
    let isSevenDayAgoClass = 'badge bg-warning'
    let isDayCloseGreaterDayOpenClass = 'badge bg-warning'
    let isDayCloseGreaterOneDayAgoCloseClass = 'badge bg-warning'
    let isWeeklyCloseGreaterWeeklyOpenClass = 'badge bg-warning'
    let isMonthlyCloseGreaterMonthlyOpenClass = 'badge bg-warning'
    let oneDayAgoVolumeGreaterClass = 'badge bg-warning'

    if (row.isOneDayAgo) {
        isOneDayAgoClass = 'badge bg-success'
    }

    if (row.isTwoDayAgo) {
        isTwoDayAgoClass = 'badge bg-success'
    }

    if (row.isThreeDayAgo) {
        isThreeDayAgoClass = 'badge bg-success'
    }

    if (row.isFourDayAgo) {
        isFourDayAgoClass = 'badge bg-success'
    }

    if (row.isFiveDayAgo) {
        isFiveDayAgoClass = 'badge bg-success'
    }

    if (row.isSixDayAgo) {
        isSixDayAgoClass = 'badge bg-success'
    }

    if (row.isSevenDayAgo) {
        isSevenDayAgoClass = 'badge bg-success'
    }

    if (row.isDayCloseGreaterDayOpen) {
        isDayCloseGreaterDayOpenClass = 'badge bg-success'
    }

    if (row.isDayCloseGreaterOneDayAgoClose) {
        isDayCloseGreaterOneDayAgoCloseClass = 'badge bg-success'
    }


    if (row.isWeeklyCloseGreaterWeeklyOpen) {
        isWeeklyCloseGreaterWeeklyOpenClass = 'badge bg-success'
    }


    if (row.isMonthlyCloseGreaterMonthlyOpen) {
        isMonthlyCloseGreaterMonthlyOpenClass = 'badge bg-success'
    }


    if (row.oneDayAgoVolumeGreater) {
        oneDayAgoVolumeGreaterClass = 'badge bg-success'
    }

    let isOneDayAgoValue = row.isOneDayAgo.toString().toUpperCase().charAt(0)
    let isTwoDayAgoValue = row.isTwoDayAgo.toString().toUpperCase().charAt(0)
    let isThreeDayAgoValue = row.isThreeDayAgo.toString().toUpperCase().charAt(0)
    let isFourDayAgoValue = row.isFourDayAgo.toString().toUpperCase().charAt(0)
    let isFiveDayAgoValue = row.isFiveDayAgo.toString().toUpperCase().charAt(0)
    let isSixDayAgoValue = row.isSixDayAgo.toString().toUpperCase().charAt(0)
    let isSevenDayAgoValue = row.isSevenDayAgo.toString().toUpperCase().charAt(0)
    let isDayCloseGreaterDayOpenValue = row.isDayCloseGreaterDayOpen.toString().toUpperCase().charAt(0)
    let isDayCloseGreaterOneDayAgoCloseValue = row.isDayCloseGreaterOneDayAgoClose.toString().toUpperCase().charAt(0)
    let isWeeklyCloseGreaterWeeklyOpenValue = row.isWeeklyCloseGreaterWeeklyOpen.toString().toUpperCase().charAt(0)
    let isMonthlyCloseGreaterMonthlyOpenValue = row.isMonthlyCloseGreaterMonthlyOpen.toString().toUpperCase().charAt(0)
    let oneDayAgoVolumeGreaterValue = row.oneDayAgoVolumeGreater.toString().toUpperCase().charAt(0)

    let trueCount = 0;
    let falseCount = 0;
    if (isOneDayAgoValue == 'T') {
        trueCount++
    } else {
        falseCount++
    }

    if (isTwoDayAgoValue == 'T') {
        trueCount++
    } else {
        falseCount++
    }


    if (isThreeDayAgoValue == 'T') {
        trueCount++
    } else {
        falseCount++
    }

    if (isFourDayAgoValue == 'T') {
        trueCount++
    } else {
        falseCount++
    }

    if (isFiveDayAgoValue == 'T') {
        trueCount++
    } else {
        falseCount++
    }

    if (isSixDayAgoValue == 'T') {
        trueCount++
    } else {
        falseCount++
    }

    if (isSevenDayAgoValue == 'T') {
        trueCount++
    } else {
        falseCount++
    }

    if (isDayCloseGreaterDayOpenValue == 'T') {
        trueCount++
    } else {
        falseCount++
    }

    if (isDayCloseGreaterOneDayAgoCloseValue == 'T') {
        trueCount++
    } else {
        falseCount++
    }

    if (isWeeklyCloseGreaterWeeklyOpenValue == 'T') {
        trueCount++
    } else {
        falseCount++
    }

    if (isMonthlyCloseGreaterMonthlyOpenValue == 'T') {
        trueCount++
    } else {
        falseCount++
    }

    if (oneDayAgoVolumeGreaterValue == 'T') {
        trueCount++
    } else {
        falseCount++
    }

    html = ''

    html += '<span class="' + isOneDayAgoClass + '">' + isOneDayAgoValue + '</span>'
    html += '<span class="' + isTwoDayAgoClass + '">' + isTwoDayAgoValue + '</span>'
    html += '<span class="' + isThreeDayAgoClass + '">' + isThreeDayAgoValue + '</span>'
    html += '<span class="' + isFourDayAgoClass + '">' + isFourDayAgoValue + '</span>'
    html += '<span class="' + isFiveDayAgoClass + '">' + isFiveDayAgoValue + '</span>'
    html += '<span class="' + isSixDayAgoClass + '">' + isSixDayAgoValue + '</span>'
    html += '<span class="' + isSevenDayAgoClass + '">' + isSevenDayAgoValue + '</span>'
    html += '<span class="' + isDayCloseGreaterDayOpenClass + '">' + isDayCloseGreaterDayOpenValue + '</span>'
    html += '<span class="' + isDayCloseGreaterOneDayAgoCloseClass + '">' + isDayCloseGreaterOneDayAgoCloseValue + '</span>'
    html += '<span class="' + isWeeklyCloseGreaterWeeklyOpenClass + '">' + isWeeklyCloseGreaterWeeklyOpenValue + '</span>'
    html += '<span class="' + isMonthlyCloseGreaterMonthlyOpenClass + '">' + isMonthlyCloseGreaterMonthlyOpenValue + '</span>'
    html += '<span class="' + oneDayAgoVolumeGreaterClass + '">' + oneDayAgoVolumeGreaterValue + '</span>'


    html += ' ( <span class="badge bg-success">' + trueCount + '</span> )'
    html += ' ( <span class="badge bg-warning">' + falseCount + '</span> )'

    jQ("#breakout-prediction").html(html);

    html = ''


    let bull = 0;
    let bear = 0;
    if (jQ.inArray("ASO", row['TREND']) != -1) {
        bull++
    }

    if (jQ.inArray("BSO", row['TREND']) != -1) {
        bear++
    }

    if (trueCount > falseCount) {
        bull++;
    } else {
        bear++;
    }

    if (row['PCR']) {
        let pcr = row['PCR'].split(":");
        if (parseFloat(pcr[1].trim()) > 1) {
            bull++;
        } else {
            bear++;
        }
    }

    if (row['OHL_TREND'][0] > row['OHL_TREND'][1]) {
        bull++;
    } else {
        bear++;
    }

    if (row['OHL_TREND'][2] == "Strong Sell(OH)") {
        bear++;
    }

    if (row['OHL_TREND'][2] == "Strong Buy(OL)") {
        bull++;
    }

    if (row['OHL_TREND'][2] == "Strong Sell(Lower High)") {
        bear++;
    }

    if (row['OHL_TREND'][2] == "Strong Buy(Higher High)") {
        bull++;
    }

    if (row['OHL_TREND'][2] == "Buy") {
        bull++;
    }

    if (row['OHL_TREND'][2] == "Sell") {
        bear++;
    }

    try {
        if (parseFloat(row['STRIKE_ATM_CE']) > parseFloat(row['STRIKE_ATM_PE'])) {
            bear++;
        } else {
            bull++;
        }
        if (parseFloat(row['STRIKE_LOWER_ONE_CE']) > parseFloat(row['STRIKE_LOWER_ONE_PE'])) {
            bear++;
        } else {
            bull++;
        }

        if (parseFloat(row['STRIKE_LOWER_TWO_CE']) > parseFloat(row['STRIKE_LOWER_TWO_PE'])) {
            bear++;
        } else {
            bull++;
        }

        if (parseFloat(row['STRIKE_UPPER_ONE_CE']) > parseFloat(row['STRIKE_UPPER_ONE_PE'])) {
            bear++;
        } else {
            bull++;
        }

        if (parseFloat(row['STRIKE_UPPER_TWO_CE']) > parseFloat(row['STRIKE_UPPER_TWO_PE'])) {
            bear++;
        } else {
            bull++;
        }
    } catch (err) {
        console.log("Error while analysing strikes")
        console.log(err)
    }

    if (bull > bear) {
        html += '<span class="badge bg-success">Bullish</span>'
    } else {
        html += '<span class="badge bg-danger">Bearish</span>'
    }

    jQ("#prediction-prediction").html(html);




    html = ''

    let className = ""

    if (row['STRIKE_LOWER_ONE_CE']) {
        if (parseFloat(row['STRIKE_LOWER_ONE_CE']) > parseFloat(row['STRIKE_LOWER_ONE_PE'])) {
            className = " bg-danger-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_LOWER_ONE_CE'] + '</span>'
    }
    jQ("#STRIKE_LOWER_ONE_CE-prediction").html(html);

    html = ''
    className = ""
    if (row['STRIKE_LOWER_ONE']) {
        if (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_LOWER_ONE'])
            && parseFloat(row['LTP']) < parseFloat(row['STRIKE_LOWER_TWO'])) {
            className = "bg-danger-color"
        }
        html += '<span class="text-align ' + className + '">' + row['STRIKE_LOWER_ONE'] + '</span>'
    }
    jQ("#STRIKE_LOWER_ONE-prediction").html(html);


    html = ''
    className = ""
    if (row['STRIKE_LOWER_ONE_PE']) {
        if (parseFloat(row['STRIKE_LOWER_ONE_PE']) > parseFloat(row['STRIKE_LOWER_ONE_CE'])) {
            className = " bg-success-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_LOWER_ONE_PE'] + '</span>'
    }
    jQ("#STRIKE_LOWER_ONE_PE-prediction").html(html);



    html = ''
    className = ""
    if (row['STRIKE_LOWER_TWO_CE']) {
        if (parseFloat(row['STRIKE_LOWER_TWO_CE']) > parseFloat(row['STRIKE_LOWER_TWO_PE'])) {
            className = " bg-danger-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_LOWER_TWO_CE'] + '</span>'
    }
    jQ("#STRIKE_LOWER_TWO_CE-prediction").html(html);



    html = ''
    className = ""
    if (row['STRIKE_LOWER_TWO']) {
        if (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_LOWER_TWO'])
            && parseFloat(row['LTP']) < parseFloat(row['STRIKE_ATM'])) {
            className = "bg-danger-color"
        }
        html += '<span class="text-align ' + className + '">' + row['STRIKE_LOWER_TWO'] + '</span>'
    }
    jQ("#STRIKE_LOWER_TWO-prediction").html(html);


    html = ''
    className = ""
    if (row['STRIKE_LOWER_TWO_PE']) {
        if (parseFloat(row['STRIKE_LOWER_TWO_PE']) > parseFloat(row['STRIKE_LOWER_TWO_CE'])) {
            className = " bg-success-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_LOWER_TWO_PE'] + '</span>'
    }
    jQ("#STRIKE_LOWER_TWO_PE-prediction").html(html);



    html = ''
    className = ""
    if (row['STRIKE_ATM_CE']) {
        if (parseFloat(row['STRIKE_ATM_CE']) > parseFloat(row['STRIKE_ATM_PE'])) {
            className = " bg-danger-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_ATM_CE'] + '</span>'
    }
    jQ("#STRIKE_ATM_CE-prediction").html(html);


    html = ''
    className = ""
    if (row['STRIKE_ATM']) {
        if (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_ATM'])
            && parseFloat(row['LTP']) < parseFloat(row['STRIKE_UPPER_ONE'])) {
            className = "bg-danger-color"
        }
        html += '<span class="text-align ' + className + '">' + row['STRIKE_ATM'] + '</span>'
    }
    jQ("#STRIKE_ATM-prediction").html(html);


    html = ''
    className = ""
    if (row['STRIKE_ATM_PE']) {
        if (parseFloat(row['STRIKE_ATM_PE']) > parseFloat(row['STRIKE_ATM_CE'])) {
            className = " bg-success-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_ATM_PE'] + '</span>'
    }
    jQ("#STRIKE_ATM_PE-prediction").html(html);



    html = ''
    className = ""
    if (row['STRIKE_UPPER_ONE_CE']) {
        if (parseFloat(row['STRIKE_UPPER_ONE_CE']) > parseFloat(row['STRIKE_UPPER_ONE_PE'])) {
            className = " bg-danger-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_UPPER_ONE_CE'] + '</span>'
    }
    jQ("#STRIKE_UPPER_ONE_CE-prediction").html(html);



    html = ''
    className = ""
    if (row['STRIKE_UPPER_ONE']) {
        if (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_UPPER_ONE'])
            && parseFloat(row['LTP']) < parseFloat(row['STRIKE_UPPER_TWO'])) {
            className = "bg-danger-color"
        }
        html += '<span class="text-align ' + className + '">' + row['STRIKE_UPPER_ONE'] + '</span>'
    }
    jQ("#STRIKE_UPPER_ONE-prediction").html(html);



    html = ''
    className = ""
    if (row['STRIKE_UPPER_ONE_PE']) {
        if (parseFloat(row['STRIKE_UPPER_ONE_PE']) > parseFloat(row['STRIKE_UPPER_ONE_CE'])) {
            className = " bg-success-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_UPPER_ONE_PE'] + '</span>'
    }
    jQ("#STRIKE_UPPER_ONE_PE-prediction").html(html);


    html = ''
    className = ""
    if (row['STRIKE_UPPER_TWO_CE']) {
        if (parseFloat(row['STRIKE_UPPER_TWO_CE']) > parseFloat(row['STRIKE_UPPER_TWO_PE'])) {
            className = " bg-danger-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_UPPER_TWO_CE'] + '</span>'
    }
    jQ("#STRIKE_UPPER_TWO_CE-prediction").html(html);


    html = ''
    className = ""
    if (row['STRIKE_UPPER_TWO']) {
        if (parseFloat(row['LTP']) > parseFloat(row['STRIKE_UPPER_TWO'])) {
            className = "bg-warning-color"
        }
        html += '<span class="text-align ' + className + '">' + row['STRIKE_UPPER_TWO'] + '</span>'
    }

    jQ("#STRIKE_UPPER_TWO-prediction").html(html);


    html = ''
    className = ""
    if (row['STRIKE_UPPER_TWO_PE']) {
        if (parseFloat(row['STRIKE_UPPER_TWO_PE']) > parseFloat(row['STRIKE_UPPER_TWO_CE'])) {
            className = " bg-success-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_UPPER_TWO_PE'] + '</span>'
    }
    jQ("#STRIKE_UPPER_TWO_PE-prediction").html(html);


}

async function callPredictionAnalyseTrend(html) {
    let count = 0;
    let scriptsCount = stock.length

    for (let i = 0; i < scriptsCount; i++) {
        try {
            let name = stock[i]['TRADINGSYMBOL']
            let tempName = name.replaceAll(" ", "-")
            tempName = tempName.replaceAll("&", "-")
            let rowId = i

            let script = generateTrend(name);

            let data = await getHistoricalDataUsingPromise(instrumentTokens[name], moment(START_MONTH_DAY_DATE).add(-15, 'days').format("YYYY-MM-DD"), CURRENT_DAY, 'day');
            let candles = []
            jQ.each(data.data.candles, function (index, item) {
                let map = {}
                map['date'] = moment(item[0]).format("YYYY-MM-DD")
                map.open = item[1]
                map.high = item[2]
                map.low = item[3]
                map.close = item[4]
                map.volume = item[5]
                candles.push(map);
            });


            let size = candles.length;

            let dayHigh = 0
            let dayLow = 0
            let dayOpen = parseFloat(script['price']);
            let prevDay = [candles[size - 2]];
            jQ.each(prevDay, function (index, item) {
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

            let currentDay = [candles[size - 1]]
            jQ.each(currentDay, function (index, item) {
                if (item.high > dayHigh) {
                    dayHigh = item.high
                }

                if (item.low < dayLow) {
                    dayLow = item.low
                }
            });

            let previousClose = parseFloat(script.prevPrice);
            let resp = calculateOHLBuySell(dayOpen, dayHigh, dayLow, script['ltp'], previousClose);
            stock[rowId]['OHL_TREND'] = resp;

            let last = candles[candles.length - 1];
            stock[rowId]['VOLUME'] = last.volume

            stock[rowId]['LTP'] = script['ltp']


            let isOpenOfTheMonth = false;
            let isOpenOfTheWeek = false;

            let openOfTheMonth = {}
            let closeOfTheMonth = candles[size - 1]

            let openOfTheWeek = {}
            let closeOfTheWeek = candles[size - 1]

            jQ.each(candles, function (index, item) {
                let date = moment(item.date).format("YYYY-MM-DD");
                if (date >= START_MONTH_DAY_DATE && !isOpenOfTheMonth) {
                    openOfTheMonth = item
                    isOpenOfTheMonth = true
                }

                if (date >= START_WEEK_DAY_DATE && !isOpenOfTheWeek) {
                    openOfTheWeek = item
                    isOpenOfTheWeek = true
                }
            });

            let oneDayAgo = candles[size - 2]
            let twoDayAgo = candles[size - 3]
            let threeDayAgo = candles[size - 4]
            let fourDayAgo = candles[size - 5]
            let fiveDayAgo = candles[size - 6]
            let sixDayAgo = candles[size - 7]
            let sevenDayAgo = candles[size - 8]
            let current = candles[size - 1];

            let oneDayHighLow = oneDayAgo['high'] - oneDayAgo['low'];
            let twoDayHighLow = twoDayAgo['high'] - twoDayAgo['low'];
            let threeDayHighLow = threeDayAgo['high'] - threeDayAgo['low'];
            let fourDayHighLow = fourDayAgo['high'] - fourDayAgo['low'];
            let fiveDayHighLow = fiveDayAgo['high'] - fiveDayAgo['low'];
            let sixDayHighLow = sixDayAgo['high'] - sixDayAgo['low'];
            let sevenDayHighLow = sevenDayAgo['high'] - sevenDayAgo['low'];

            let dayHighLow = current.high - current.low

            let isOneDayAgo = false;
            let isTwoDayAgo = false
            let isThreeDayAgo = false
            let isFourDayAgo = false
            let isFiveDayAgo = false
            let isSixDayAgo = false
            let isSevenDayAgo = false
            let isDayCloseGreaterDayOpen = false
            let isDayCloseGreaterOneDayAgoClose = false
            let isWeeklyCloseGreaterWeeklyOpen = false
            let isMonthlyCloseGreaterMonthlyOpen = false
            let oneDayAgoVolumeGreater = false


            if (dayHighLow > oneDayHighLow) {
                isOneDayAgo = true
            }

            if (dayHighLow > twoDayHighLow) {
                isTwoDayAgo = true
            }

            if (dayHighLow > threeDayHighLow) {
                isThreeDayAgo = true
            }

            if (dayHighLow > fourDayHighLow) {
                isFourDayAgo = true
            }

            if (dayHighLow > fiveDayHighLow) {
                isFiveDayAgo = true
            }

            if (dayHighLow > sixDayHighLow) {
                isSixDayAgo = true
            }

            if (dayHighLow > sevenDayHighLow) {
                isSevenDayAgo = true
            }

            if (current.close > current.open) {
                isDayCloseGreaterDayOpen = true
            }

            if (current.close > oneDayAgo.close) {
                isDayCloseGreaterOneDayAgoClose = true
            }

            if (closeOfTheWeek.close > openOfTheWeek.open) {
                isWeeklyCloseGreaterWeeklyOpen = true
            }

            if (closeOfTheMonth.close > openOfTheMonth.open) {
                isMonthlyCloseGreaterMonthlyOpen = true
            }

            if (oneDayAgo.volume > 10000) {
                oneDayAgoVolumeGreater = true;
            }

            stock[rowId]['isOneDayAgo'] = isOneDayAgo;
            stock[rowId]['isTwoDayAgo'] = isTwoDayAgo;
            stock[rowId]['isThreeDayAgo'] = isThreeDayAgo;
            stock[rowId]['isFourDayAgo'] = isFourDayAgo;
            stock[rowId]['isFiveDayAgo'] = isFiveDayAgo;
            stock[rowId]['isSixDayAgo'] = isSixDayAgo;
            stock[rowId]['isSevenDayAgo'] = isSevenDayAgo;
            stock[rowId]['isDayCloseGreaterDayOpen'] = isDayCloseGreaterDayOpen;
            stock[rowId]['isDayCloseGreaterOneDayAgoClose'] = isDayCloseGreaterOneDayAgoClose;
            stock[rowId]['isWeeklyCloseGreaterWeeklyOpen'] = isWeeklyCloseGreaterWeeklyOpen;
            stock[rowId]['isMonthlyCloseGreaterMonthlyOpen'] = isMonthlyCloseGreaterMonthlyOpen;
            stock[rowId]['oneDayAgoVolumeGreater'] = oneDayAgoVolumeGreater;

            if (name != 'GIFT NIFTY') {
                let oiData = await showTrendingOI(name)
                generateOIChartsForPrediction(oiData)
                let strikes = oiData['tableData']
                stock[rowId]['PCR'] = oiData['pcr'] + ' : ' + oiData['chPcr']
                let link = "https://kite.zerodha.com/chart/ext/tvc/NFO-OPT/##INSTRUMENT##/##TOKEN##"
                if (strikes[0]) {
                    stock[rowId]['STRIKE_LOWER_ONE_CE'] = strikes[0]['CHG_OI_CE']

                    oiHtml = ''
                    oiHtml += '<div>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[0].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[0].CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;">'
                    oiHtml += 'CE'
                    oiHtml += '</a>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[0].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[0].PE.instrument_token) + '" target="_blank" style="font-size:xx-small;">'
                    oiHtml += 'PE'
                    oiHtml += '</a>'
                    if (stock[rowId]['LTP'] < strikes[0]['STRIKE']) {
                        oiHtml += '<a data-price="' + strikes[0]['STRIKE'] + '" data-name="' + name + '" class=" bg-secondary-color create-alerts" style="font-size:xx-small;margin-left:.1rem;">A</a>'
                    }
                    oiHtml += '</div>'

                    stock[rowId]['STRIKE_LOWER_ONE'] = strikes[0]['STRIKE'] + oiHtml

                    stock[rowId]['STRIKE_LOWER_ONE_PE'] = strikes[0]['CHG_OI_PE']
                }

                if (strikes[1]) {
                    stock[rowId]['STRIKE_LOWER_TWO_CE'] = strikes[1]['CHG_OI_CE']

                    oiHtml = ''
                    oiHtml += '<div>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[1].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[1].CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;">'
                    oiHtml += 'CE'
                    oiHtml += '</a>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[1].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[1].PE.instrument_token) + '" target="_blank" style="font-size:xx-small;">'
                    oiHtml += 'PE'
                    oiHtml += '</a>'
                    if (stock[rowId]['LTP'] < strikes[1]['STRIKE']) {
                        oiHtml += '<a data-price="' + strikes[1]['STRIKE'] + '" data-name="' + name + '" class=" bg-secondary-color create-alerts" style="font-size:xx-small;margin-left:.1rem;">A</a>'
                    }

                    oiHtml += '</div>'

                    stock[rowId]['STRIKE_LOWER_TWO'] = strikes[1]['STRIKE'] + oiHtml
                    stock[rowId]['STRIKE_LOWER_TWO_PE'] = strikes[1]['CHG_OI_PE']
                }

                if (strikes[2]) {
                    stock[rowId]['STRIKE_ATM_CE'] = strikes[2]['CHG_OI_CE']

                    oiHtml = ''
                    oiHtml += '<div>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[2].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[2].CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;">'
                    oiHtml += 'CE'
                    oiHtml += '</a>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[2].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[2].PE.instrument_token) + '" target="_blank" style="font-size:xx-small;">'
                    oiHtml += 'PE'
                    oiHtml += '</a>'
                    if (stock[rowId]['LTP'] < strikes[2]['STRIKE']) {
                        oiHtml += '<a data-price="' + strikes[2]['STRIKE'] + '" data-name="' + name + '" class=" bg-secondary-color create-alerts" style="font-size:xx-small;margin-left:.1rem;">A</a>'
                    }

                    oiHtml += '</div>'

                    stock[rowId]['STRIKE_ATM'] = strikes[2]['STRIKE'] + oiHtml
                    stock[rowId]['STRIKE_ATM_PE'] = strikes[2]['CHG_OI_PE']
                }

                if (strikes[3]) {
                    stock[rowId]['STRIKE_UPPER_ONE_CE'] = strikes[3]['CHG_OI_CE']

                    oiHtml = ''
                    oiHtml += '<div>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[3].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[3].CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;">'
                    oiHtml += 'CE'
                    oiHtml += '</a>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[3].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[3].PE.instrument_token) + '" target="_blank" style="font-size:xx-small;">'
                    oiHtml += 'PE'
                    oiHtml += '</a>'
                    if (stock[rowId]['LTP'] < strikes[3]['STRIKE']) {
                        oiHtml += '<a data-price="' + strikes[3]['STRIKE'] + '" data-name="' + name + '" class=" bg-secondary-color create-alerts" style="font-size:xx-small;margin-left:.1rem;">A</a>'
                    }

                    oiHtml += '</div>'


                    stock[rowId]['STRIKE_UPPER_ONE'] = strikes[3]['STRIKE'] + oiHtml
                    stock[rowId]['STRIKE_UPPER_ONE_PE'] = strikes[3]['CHG_OI_PE']
                }

                if (strikes[4]) {
                    stock[rowId]['STRIKE_UPPER_TWO_CE'] = strikes[4]['CHG_OI_CE']

                    oiHtml = ''
                    oiHtml += '<div>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[4].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[4].CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;">'
                    oiHtml += 'CE'
                    oiHtml += '</a>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[4].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[4].PE.instrument_token) + '" target="_blank" style="font-size:xx-small;">'
                    oiHtml += 'PE'
                    oiHtml += '</a>'

                    if (stock[rowId]['LTP'] < strikes[4]['STRIKE']) {
                        oiHtml += '<a data-price="' + strikes[4]['STRIKE'] + '" data-name="' + name + '" class=" bg-secondary-color create-alerts" style="font-size:xx-small;margin-left:.1rem;">A</a>'
                    }

                    oiHtml += '</div>'

                    stock[rowId]['STRIKE_UPPER_TWO'] = strikes[4]['STRIKE'] + oiHtml
                    stock[rowId]['STRIKE_UPPER_TWO_PE'] = strikes[4]['CHG_OI_PE']
                }
            }

            let res = generateTrend(name);
            stock[rowId]['LTP'] = res['ltp']
        } catch (err) {
            console.log("Error while analyzing stock : " + stock[i]['TRADINGSYMBOL'])
            console.log(err)
        }
    }
}

function generateOIChartsForPrediction(oiData) {
    console.log(oiData['tableData']);

    let html = ''
    jQ.each(oiData['tableData'], function (index, item) {
        html += '<div class="col-md-12">'

        html += '<div class="row">'
        html += '<div class="col-md-12">'
        html += '<h5 style="text-align:center;">' + item.STRIKE + '</h5>'
        html += '</div>'
        html += '</div>'

        html += '<div class="row">'
        html += '<div class="col-md-6" id="oi-chart-prediction-' + item.STRIKE + '">'
        html += '</div>'
        html += '<div class="col-md-6" id="obv-chart-prediction-' + item.STRIKE + '">'
        html += '</div>'
        html += '</div>'

        html += '</div>'
        html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    });

    jQ("#oi-obv-charts").html(html);



    jQ.each(oiData['tableData'], function (index, item) {
        let PREV_OI_CE = item.prevDataCE
        let PREV_OI_PE = item.prevDataPE
        let preCEOI = PREV_OI_CE[PREV_OI_CE.length - 1]
        let prePEOI = PREV_OI_PE[PREV_OI_PE.length - 1]

        let OI_CE = item.currDataCE
        let OI_PE = item.currDataPE

        if (OI_CE.length == 0) {
            OI_CE = preCEOI
        }

        if (OI_PE.length == 0) {
            OI_PE = prePEOI
        }


        let CESeries = {}
        CESeries['seriesname'] = "CE"
        CESeries['data'] = []

        let PESeries = {}
        PESeries['seriesname'] = "PE"
        PESeries['data'] = []

        let categoryList = [];
        jQ.each(OI_CE, function (Cindex, Citem) {
            let map = {}
            map.label = moment(Citem[0]).format("HH:mm:ss");
            categoryList.push(map)
            let val = {}
            val['color'] = '#da3224'
            val['value'] = parseFloat((Citem[6] - preCEOI[6]) / 100000).toFixed(1)
            CESeries['data'].push(val)
        })

        jQ.each(OI_PE, function (Pindex, Pitem) {
            let val = {}
            val['color'] = '#37a009'
            val['value'] = parseFloat((Pitem[6] - prePEOI[6]) / 100000).toFixed(1)
            PESeries['data'].push(val)
        })

        jQ("#oi-chart-prediction-" + item.STRIKE).insertFusionCharts({
            type: "mscolumn2d",
            width: "100%",
            dataFormat: "json",
            dataSource: {
                chart: {
                    "thousandSeparatorPosition": "2,3",
                    "formatNumberScale": "0",
                    "theme": "fusion",
                    "adjustDiv": "0",
                    showvalues: "0",
                    labeldisplay: "ROTATE",
                    rotatelabels: "1",
                    "paletteColors": " #da3224, #37a009",
                    "showLabels": 0
                },
                "categories": [{
                    "category": categoryList
                }],
                dataset: [
                    CESeries,
                    PESeries
                ]
            }
        });



        let ObvCESeries = {}
        ObvCESeries['seriesname'] = "CE_OBV"
        ObvCESeries['data'] = []

        let ObvPESeries = {}
        ObvPESeries['seriesname'] = "PE_OBV"
        ObvPESeries['data'] = []

        let ObvcategoryList = [];
        let CE_OBV = item['CE_OBV']
        jQ.each(CE_OBV, function (Cindex, Citem) {
            let map = {}
            map.label = moment(Citem['date']).format("HH:mm:ss");
            ObvcategoryList.push(map)
            let val = {}
            val['color'] = '#37a009 '
            val['value'] = Citem['obv']
            ObvCESeries['data'].push(val)
        })



        let PE_OBV = item['PE_OBV']
        jQ.each(PE_OBV, function (Pindex, Pitem) {
            let val = {}
            val['color'] = '#da3224'
            val['value'] = Pitem['obv']
            ObvPESeries['data'].push(val)
        });


        jQ("#obv-chart-prediction-" + item.STRIKE).insertFusionCharts({
            type: "mscolumn2d",
            width: "100%",
            dataFormat: "json",
            dataSource: {
                chart: {
                    "thousandSeparatorPosition": "2,3",
                    "formatNumberScale": "0",
                    "theme": "fusion",
                    "adjustDiv": "0",
                    showvalues: "0",
                    labeldisplay: "ROTATE",
                    rotatelabels: "1",
                    "paletteColors": "  #37a009,#da3224",
                    "showLabels": 1
                },
                "categories": [{
                    "category": ObvcategoryList
                }],
                dataset: [
                    ObvCESeries,
                    ObvPESeries
                ]
            }
        });
    });


}