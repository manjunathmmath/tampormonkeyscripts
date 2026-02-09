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


        obj['PCR'] = ''
        obj['PREDICTION'] = ''
        obj['VOLUME'] = ''
        obj['STRIKE_LOWER_ONE_CE'] = ''
        obj['STRIKE_LOWER_ONE_CE_OBV'] = ''
        obj['STRIKE_LOWER_ONE'] = ''
        obj['STRIKE_LOWER_ONE_PE'] = ''
        obj['STRIKE_LOWER_ONE_PE_OBV'] = ''

        obj['STRIKE_LOWER_TWO_CE'] = ''
        obj['STRIKE_LOWER_TWO_CE_OBV'] = ''
        obj['STRIKE_LOWER_TWO'] = ''
        obj['STRIKE_LOWER_TWO_PE'] = ''
        obj['STRIKE_LOWER_TWO_PE_OBV'] = ''

        obj['STRIKE_ATM_CE'] = ''
        obj['STRIKE_ATM_CE_OBV'] = ''
        obj['STRIKE_ATM'] = ''
        obj['STRIKE_ATM_PE'] = ''
        obj['STRIKE_ATM_PE_OBV'] = ''

        obj['STRIKE_UPPER_ONE_CE'] = ''
        obj['STRIKE_UPPER_ONE_CE_OBV'] = ''
        obj['STRIKE_UPPER_ONE'] = ''
        obj['STRIKE_UPPER_ONE_PE'] = ''
        obj['STRIKE_UPPER_ONE_PE_OBV'] = ''

        obj['STRIKE_UPPER_TWO_CE'] = ''
        obj['STRIKE_UPPER_TWO_CE_OBV'] = ''
        obj['STRIKE_UPPER_TWO'] = ''
        obj['STRIKE_UPPER_TWO_PE'] = ''
        obj['STRIKE_UPPER_TWO_PE_OBV'] = ''


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
    console.log(row)

    let tempName = row['TRADINGSYMBOL'].replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    console.log(row['PCR'])
    let pcr = row['PCR'].split(":");
    let pcrHtml = ''
    let chPcrHtml = ''


    if (parseFloat(pcr[0].trim()) > 0) {
        if (parseFloat(pcr[0].trim()) < 1) {
            pcrHtml += '<span class="badge bg-danger">' + pcr[0] + '</span>'
        } else {
            pcrHtml += '<span class="badge bg-success">' + pcr[0] + '</span>'
        }
    } else {
        pcrHtml += '<span class="badge bg-warning">' + pcr[0] + '</span>'
    }

    if (parseFloat(pcr[1].trim()) > 0) {
        if (parseFloat(pcr[1].trim()) < 1) {
            chPcrHtml += '<span class="badge bg-danger">' + pcr[1] + '</span>'
        } else {
            chPcrHtml += '<span class="badge bg-success">' + pcr[1] + '</span>'
        }
    } else {
        chPcrHtml += '<span class="badge bg-warning">' + pcr[1] + '</span>'
    }


    jQ("#pcr-prediction" + tempName).html(pcrHtml + " : " + chPcrHtml);


    html = ''


    let bull = 0;
    let bear = 0;
    if (jQ.inArray("ASO", row['TREND']) != -1) {
        bull++
    }

    if (jQ.inArray("BSO", row['TREND']) != -1) {
        bear++
    }

    if (row['PCR']) {
        let pcr = row['PCR'].split(":");
        if (parseFloat(pcr[1].trim()) > 1) {
            bull++;
        } else {
            bear++;
        }
    }


    try {
        if (parseFloat(row['STRIKE_ATM_CE']) > 0 && parseFloat(row['STRIKE_ATM_PE']) > 0) {
            if (parseFloat(row['STRIKE_ATM_CE']) > parseFloat(row['STRIKE_ATM_PE'])
                && parseFloat(row['STRIKE_ATM_PE_OBV']) > parseFloat(row['STRIKE_ATM_CE_OBV'])) {
                bear++;
            } else {
                bull++;
            }
        }

        if (parseFloat(row['STRIKE_LOWER_ONE_CE']) > 0 && parseFloat(row['STRIKE_LOWER_ONE_PE']) > 0) {
            if (parseFloat(row['STRIKE_LOWER_ONE_CE']) > parseFloat(row['STRIKE_LOWER_ONE_PE'])
                && parseFloat(row['STRIKE_LOWER_ONE_PE_OBV']) > parseFloat(row['STRIKE_LOWER_ONE_CE_OBV'])) {
                bear++;
            } else {
                bull++;
            }
        }

        if (parseFloat(row['STRIKE_LOWER_TWO_CE']) > 0 && parseFloat(row['STRIKE_LOWER_TWO_PE']) > 0) {
            if (parseFloat(row['STRIKE_LOWER_TWO_CE']) > parseFloat(row['STRIKE_LOWER_TWO_PE'])
                && parseFloat(row['STRIKE_LOWER_TWO_PE_OBV']) > parseFloat(row['STRIKE_LOWER_TWO_CE_OBV'])) {
                bear++;
            } else {
                bull++;
            }
        }

        if (parseFloat(row['STRIKE_UPPER_ONE_CE']) > 0 && parseFloat(row['STRIKE_UPPER_ONE_PE']) > 0) {
            if (parseFloat(row['STRIKE_UPPER_ONE_CE']) > parseFloat(row['STRIKE_UPPER_ONE_PE'])
                && parseFloat(row['STRIKE_UPPER_ONE_PE_OBV']) > parseFloat(row['STRIKE_UPPER_ONE_CE_OBV'])) {
                bear++;
            } else {
                bull++;
            }
        }

        if (parseFloat(row['STRIKE_UPPER_TWO_CE']) > 0 && parseFloat(row['STRIKE_UPPER_TWO_PE']) > 0) {
            if (parseFloat(row['STRIKE_UPPER_TWO_CE']) > parseFloat(row['STRIKE_UPPER_TWO_PE'])
                && parseFloat(row['STRIKE_UPPER_TWO_PE_OBV']) > parseFloat(row['STRIKE_UPPER_TWO_CE_OBV'])) {
                bear++;
            } else {
                bull++;
            }
        }
    } catch (err) {
        console.log("Error while analysing strikes")
        console.log(err)
    }

    if (bull > bear) {
        html += '<span class="badge bg-success">Bullish</span>'
    } else if (bull == bear) {
        html += '<span class="badge bg-warning">Neutral</span>'
    } else {
        html += '<span class="badge bg-danger">Bearish</span>'
    }

    html += ' <span class="badge bg-info">(BULL[' + bull + '] : BEAR[' + bear + '])</span>'

    jQ("#prediction-prediction" + tempName).html(html);


    html = ''

    let className = ""

    if (row['STRIKE_LOWER_ONE_CE']) {
        if (parseFloat(row['STRIKE_LOWER_ONE_CE']) > parseFloat(row['STRIKE_LOWER_ONE_PE'])) {
            className = " bg-danger-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_LOWER_ONE_CE'] + '</span>'

        className = ""
        if (parseFloat(row['STRIKE_LOWER_ONE_CE_OBV']) > parseFloat(row['STRIKE_LOWER_ONE_PE_OBV'])) {
            className = " bg-success-color"
        }
        html += '<span class="number-align ' + className + '"> [' + row['STRIKE_LOWER_ONE_CE_OBV'] + ']</span>'


    }
    jQ("#STRIKE_LOWER_ONE_CE-prediction" + tempName).html(html);

    html = ''
    className = ""
    if (row['STRIKE_LOWER_ONE']) {
        if (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_LOWER_ONE'])
            && parseFloat(row['LTP']) < parseFloat(row['STRIKE_LOWER_TWO'])) {
            className = "bg-danger-color"
        }
        html += '<span class="text-align ' + className + '">' + row['STRIKE_LOWER_ONE'] + '</span>'
    }
    jQ("#STRIKE_LOWER_ONE-prediction" + tempName).html(html);


    html = ''
    className = ""
    if (row['STRIKE_LOWER_ONE_PE']) {
        if (parseFloat(row['STRIKE_LOWER_ONE_PE']) > parseFloat(row['STRIKE_LOWER_ONE_CE'])) {
            className = " bg-success-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_LOWER_ONE_PE'] + '</span>'

        className = ""
        if (parseFloat(row['STRIKE_LOWER_ONE_PE_OBV']) > parseFloat(row['STRIKE_LOWER_ONE_CE_OBV'])) {
            className = " bg-danger-color"
        }
        html += '<span class="number-align ' + className + '"> [' + row['STRIKE_LOWER_ONE_PE_OBV'] + ']</span>'

    }
    jQ("#STRIKE_LOWER_ONE_PE-prediction" + tempName).html(html);



    html = ''
    className = ""
    if (row['STRIKE_LOWER_TWO_CE']) {
        if (parseFloat(row['STRIKE_LOWER_TWO_CE']) > parseFloat(row['STRIKE_LOWER_TWO_PE'])) {
            className = " bg-danger-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_LOWER_TWO_CE'] + '</span>'
        className = ""
        if (parseFloat(row['STRIKE_LOWER_TWO_CE_OBV']) > parseFloat(row['STRIKE_LOWER_TWO_PE_OBV'])) {
            className = " bg-success-color"
        }
        html += '<span class="number-align ' + className + '"> [' + row['STRIKE_LOWER_TWO_CE_OBV'] + ']</span>'

    }
    jQ("#STRIKE_LOWER_TWO_CE-prediction" + tempName).html(html);



    html = ''
    className = ""
    if (row['STRIKE_LOWER_TWO']) {
        if (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_LOWER_TWO'])
            && parseFloat(row['LTP']) < parseFloat(row['STRIKE_ATM'])) {
            className = "bg-danger-color"
        }
        html += '<span class="text-align ' + className + '">' + row['STRIKE_LOWER_TWO'] + '</span>'
    }
    jQ("#STRIKE_LOWER_TWO-prediction" + tempName).html(html);


    html = ''
    className = ""
    if (row['STRIKE_LOWER_TWO_PE']) {
        if (parseFloat(row['STRIKE_LOWER_TWO_PE']) > parseFloat(row['STRIKE_LOWER_TWO_CE'])) {
            className = " bg-success-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_LOWER_TWO_PE'] + '</span>'
        className = ""
        if (parseFloat(row['STRIKE_LOWER_TWO_PE_OBV']) > parseFloat(row['STRIKE_LOWER_TWO_CE_OBV'])) {
            className = " bg-danger-color"
        }
        html += '<span class="number-align ' + className + '"> [' + row['STRIKE_LOWER_TWO_PE_OBV'] + ']</span>'

    }
    jQ("#STRIKE_LOWER_TWO_PE-prediction" + tempName).html(html);



    html = ''
    className = ""
    if (row['STRIKE_ATM_CE']) {
        if (parseFloat(row['STRIKE_ATM_CE']) > parseFloat(row['STRIKE_ATM_PE'])) {
            className = " bg-danger-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_ATM_CE'] + '</span>'
        className = ""
        if (parseFloat(row['STRIKE_ATM_CE_OBV']) > parseFloat(row['STRIKE_ATM_PE_OBV'])) {
            className = " bg-success-color"
        }
        html += '<span class="number-align ' + className + '"> [' + row['STRIKE_ATM_CE_OBV'] + ']</span>'

    }
    jQ("#STRIKE_ATM_CE-prediction" + tempName).html(html);


    html = ''
    className = ""
    if (row['STRIKE_ATM']) {
        if (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_ATM'])
            && parseFloat(row['LTP']) < parseFloat(row['STRIKE_UPPER_ONE'])) {
            className = "bg-danger-color"
        }
        html += '<span class="text-align ' + className + '">' + row['STRIKE_ATM'] + '</span>'
    }
    jQ("#STRIKE_ATM-prediction" + tempName).html(html);


    html = ''
    className = ""
    if (row['STRIKE_ATM_PE']) {
        if (parseFloat(row['STRIKE_ATM_PE']) > parseFloat(row['STRIKE_ATM_CE'])) {
            className = " bg-success-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_ATM_PE'] + '</span>'
        className = ""
        if (parseFloat(row['STRIKE_ATM_PE_OBV']) > parseFloat(row['STRIKE_ATM_CE_OBV'])) {
            className = " bg-danger-color"
        }
        html += '<span class="number-align ' + className + '"> [' + row['STRIKE_ATM_PE_OBV'] + ']</span>'

    }
    jQ("#STRIKE_ATM_PE-prediction" + tempName).html(html);



    html = ''
    className = ""
    if (row['STRIKE_UPPER_ONE_CE']) {
        if (parseFloat(row['STRIKE_UPPER_ONE_CE']) > parseFloat(row['STRIKE_UPPER_ONE_PE'])) {
            className = " bg-danger-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_UPPER_ONE_CE'] + '</span>'
        className = ""
        if (parseFloat(row['STRIKE_UPPER_ONE_CE_OBV']) > parseFloat(row['STRIKE_UPPER_ONE_PE_OBV'])) {
            className = " bg-success-color"
        }
        html += '<span class="number-align ' + className + '"> [' + row['STRIKE_UPPER_ONE_CE_OBV'] + ']</span>'

    }
    jQ("#STRIKE_UPPER_ONE_CE-prediction" + tempName).html(html);



    html = ''
    className = ""
    if (row['STRIKE_UPPER_ONE']) {
        if (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_UPPER_ONE'])
            && parseFloat(row['LTP']) < parseFloat(row['STRIKE_UPPER_TWO'])) {
            className = "bg-danger-color"
        }
        html += '<span class="text-align ' + className + '">' + row['STRIKE_UPPER_ONE'] + '</span>'
    }
    jQ("#STRIKE_UPPER_ONE-prediction" + tempName).html(html);



    html = ''
    className = ""
    if (row['STRIKE_UPPER_ONE_PE']) {
        if (parseFloat(row['STRIKE_UPPER_ONE_PE']) > parseFloat(row['STRIKE_UPPER_ONE_CE'])) {
            className = " bg-success-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_UPPER_ONE_PE'] + '</span>'

        className = ""
        if (parseFloat(row['STRIKE_UPPER_ONE_PE_OBV']) > parseFloat(row['STRIKE_UPPER_ONE_CE_OBV'])) {
            className = " bg-danger-color"
        }
        html += '<span class="number-align ' + className + '"> [' + row['STRIKE_UPPER_ONE_PE_OBV'] + ']</span>'
    }
    jQ("#STRIKE_UPPER_ONE_PE-prediction" + tempName).html(html);


    html = ''
    className = ""
    if (row['STRIKE_UPPER_TWO_CE']) {
        if (parseFloat(row['STRIKE_UPPER_TWO_CE']) > parseFloat(row['STRIKE_UPPER_TWO_PE'])) {
            className = " bg-danger-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_UPPER_TWO_CE'] + '</span>'

        className = ""
        if (parseFloat(row['STRIKE_UPPER_TWO_CE_OBV']) > parseFloat(row['STRIKE_UPPER_TWO_PE_OBV'])) {
            className = " bg-success-color"
        }
        html += '<span class="number-align ' + className + '"> [' + row['STRIKE_UPPER_TWO_CE_OBV'] + ']</span>'

    }
    jQ("#STRIKE_UPPER_TWO_CE-prediction" + tempName).html(html);


    html = ''
    className = ""
    if (row['STRIKE_UPPER_TWO']) {
        if (parseFloat(row['LTP']) > parseFloat(row['STRIKE_UPPER_TWO'])) {
            className = "bg-warning-color"
        }
        html += '<span class="text-align ' + className + '">' + row['STRIKE_UPPER_TWO'] + '</span>'
    }

    jQ("#STRIKE_UPPER_TWO-prediction" + tempName).html(html);


    html = ''
    className = ""
    if (row['STRIKE_UPPER_TWO_PE']) {
        if (parseFloat(row['STRIKE_UPPER_TWO_PE']) > parseFloat(row['STRIKE_UPPER_TWO_CE'])) {
            className = " bg-success-color"
        }
        html += '<span class="number-align ' + className + '">' + row['STRIKE_UPPER_TWO_PE'] + '</span>'

        className = ""
        if (parseFloat(row['STRIKE_UPPER_TWO_PE_OBV']) > parseFloat(row['STRIKE_UPPER_TWO_CE_OBV'])) {
            className = " bg-danger-color"
        }
        html += '<span class="number-align ' + className + '"> [' + row['STRIKE_UPPER_TWO_PE_OBV'] + ']</span>'
    }
    jQ("#STRIKE_UPPER_TWO_PE-prediction" + tempName).html(html);


}

async function callPredictionAnalyseTrend() {
    let scriptsCount = stock.length
    for (let i = 0; i < scriptsCount; i++) {
        try {
            let name = stock[i]['TRADINGSYMBOL']
            let tempName = name.replaceAll(" ", "-")
            tempName = tempName.replaceAll("&", "-")
            let rowId = i
            if (name != 'GIFT NIFTY') {
                let oiData = await showTrendingOI(name)
                generateOIChartsForPrediction(oiData, name)
                let strikes = oiData['tableData']
                optionFlowDashboard(strikes, tempName)
                stock[rowId]['PCR'] = oiData['pcr'] + ' : ' + oiData['chPcr']
                let link = "https://kite.zerodha.com/chart/ext/tvc/NFO-OPT/##INSTRUMENT##/##TOKEN##"
                if (strikes[0]) {
                    stock[rowId]['STRIKE_LOWER_ONE_CE'] = strikes[0]['CHG_OI_CE']
                    stock[rowId]['STRIKE_LOWER_ONE_CE_OBV'] = strikes[0]['CE_OBV'][strikes[0]['CE_OBV'].length - 1]['obv']

                    let oiHtml = ''
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
                    stock[rowId]['STRIKE_LOWER_ONE_PE_OBV'] = strikes[0]['PE_OBV'][strikes[0]['PE_OBV'].length - 1]['obv']
                }

                if (strikes[1]) {
                    stock[rowId]['STRIKE_LOWER_TWO_CE'] = strikes[1]['CHG_OI_CE']
                    stock[rowId]['STRIKE_LOWER_TWO_CE_OBV'] = strikes[1]['CE_OBV'][strikes[1]['CE_OBV'].length - 1]['obv']

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
                    stock[rowId]['STRIKE_LOWER_TWO_PE_OBV'] = strikes[1]['PE_OBV'][strikes[1]['PE_OBV'].length - 1]['obv']
                }

                if (strikes[2]) {
                    stock[rowId]['STRIKE_ATM_CE'] = strikes[2]['CHG_OI_CE']
                    stock[rowId]['STRIKE_ATM_CE_OBV'] = strikes[2]['CE_OBV'][strikes[2]['CE_OBV'].length - 1]['obv']

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
                    stock[rowId]['STRIKE_ATM_PE_OBV'] = strikes[2]['PE_OBV'][strikes[2]['PE_OBV'].length - 1]['obv']
                }

                if (strikes[3]) {
                    stock[rowId]['STRIKE_UPPER_ONE_CE'] = strikes[3]['CHG_OI_CE']
                    stock[rowId]['STRIKE_UPPER_ONE_CE_OBV'] = strikes[3]['CE_OBV'][strikes[3]['CE_OBV'].length - 1]['obv']

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
                    stock[rowId]['STRIKE_UPPER_ONE_PE_OBV'] = strikes[3]['PE_OBV'][strikes[3]['PE_OBV'].length - 1]['obv']
                }

                if (strikes[4]) {
                    stock[rowId]['STRIKE_UPPER_TWO_CE'] = strikes[4]['CHG_OI_CE']
                    stock[rowId]['STRIKE_UPPER_TWO_CE_OBV'] = strikes[4]['CE_OBV'][strikes[4]['CE_OBV'].length - 1]['obv']

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
                    stock[rowId]['STRIKE_UPPER_TWO_PE_OBV'] = strikes[4]['PE_OBV'][strikes[4]['PE_OBV'].length - 1]['obv']
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
// Feed scaling: OI / 100000, OBV / 100000
const OI_THRESHOLD = 0.05;   // ~5k
const OBV_THRESHOLD = 0.10; // ~10k
function optionFlowDashboard(strikes, name) {
    let html = ''
    html += '<div class="row">'

    html += '<div class="col-md-12">'
    html += '<h3>CE / PE Option Flow Dashboard</h3>'
    html += '<div id="summary" class="mb-3"></div>'

    html += '<div class="alert alert-secondary">'
    html += '<b>How to Read (Quick Summary)</b><br>'
    html += '1. Final Bias → Direction filter<br>'
    html += '2. Activity → &lt;300 skip, 300–1000 scalp, &gt;1000 trade<br>'
    html += '3. Resistance → CE Writing strike = rejection zone<br>'
    html += '4. Focus ATM ±1<br>'
    html += '5. Follow Takeaway'
    html += '</div>'

    html += '<table class="table table-bordered table-sm text-center align-middle" id="flowTable">'
    html += '<thead class="table-dark">'
    html += '<tr>'
    html += '<th>Strike</th>'
    html += '<th>CE OI</th>'
    html += '<th>CE OBV</th>'
    html += '<th>PE OI</th>'
    html += '<th>PE OBV</th>'
    html += '<th>CE Meaning</th>'
    html += '<th>PE Meaning</th>'
    html += '<th>Market Outcome</th>'
    html += '<th>Bias</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody></tbody>'
    html += '</table>'
    html += '</div>'

    html += '</div>'

    jQ("#option-flow-analysis-" + name).html(html);
    let strikesData = []
    if (strikes[0]) {
        let striekOne = {
            strike: strikes[0]['STRIKE'],
            ce_oi: strikes[0]['CHG_OI_CE'],
            ce_obv: strikes[0]['CE_OBV'][strikes[0]['CE_OBV'].length - 1]['obv'],
            pe_oi: strikes[0]['CHG_OI_PE'],
            pe_obv: strikes[0]['PE_OBV'][strikes[0]['PE_OBV'].length - 1]['obv']
        }
        strikesData.push(striekOne)
    }

    if (strikes[1]) {
        let striekTwo = {
            strike: strikes[1]['STRIKE'],
            ce_oi: strikes[1]['CHG_OI_CE'],
            ce_obv: strikes[1]['CE_OBV'][strikes[1]['CE_OBV'].length - 1]['obv'],
            pe_oi: strikes[1]['CHG_OI_PE'],
            pe_obv: strikes[1]['PE_OBV'][strikes[1]['PE_OBV'].length - 1]['obv']
        }
        strikesData.push(striekTwo)
    }
    if (strikes[2]) {
        let striekThree = {
            strike: strikes[2]['STRIKE'],
            ce_oi: strikes[2]['CHG_OI_CE'],
            ce_obv: strikes[2]['CE_OBV'][strikes[2]['CE_OBV'].length - 1]['obv'],
            pe_oi: strikes[2]['CHG_OI_PE'],
            pe_obv: strikes[2]['PE_OBV'][strikes[2]['PE_OBV'].length - 1]['obv']
        }
        strikesData.push(striekThree)
    }

    if (strikes[3]) {
        let striekFour = {
            strike: strikes[3]['STRIKE'],
            ce_oi: strikes[3]['CHG_OI_CE'],
            ce_obv: strikes[3]['CE_OBV'][strikes[3]['CE_OBV'].length - 1]['obv'],
            pe_oi: strikes[3]['CHG_OI_PE'],
            pe_obv: strikes[3]['PE_OBV'][strikes[3]['PE_OBV'].length - 1]['obv']
        }
        strikesData.push(striekFour)
    }

    if (strikes[4]) {
        let striekFive = {
            strike: strikes[4]['STRIKE'],
            ce_oi: strikes[4]['CHG_OI_CE'],
            ce_obv: strikes[4]['CE_OBV'][strikes[4]['CE_OBV'].length - 1]['obv'],
            pe_oi: strikes[4]['CHG_OI_PE'],
            pe_obv: strikes[4]['PE_OBV'][strikes[4]['PE_OBV'].length - 1]['obv']
        }
        strikesData.push(striekFive)
    }

    // ================= RUN =================
    const result = analyze(strikesData);

    // ================= SUMMARY =================
    document.getElementById("summary").innerHTML =
        `<div class="alert alert-info">
<b>Bull:</b> ${result.bullPct}% |
<b>Bear:</b> ${result.bearPct}% |
<b>Final Bias:</b> ${result.finalBias}<br>
<b>Activity:</b> ${result.marketMode} (${result.activity})<br>
<b>Resistance:</b> ${result.resistance || "None"}<br>
<b>Explanation:</b> ${result.explanation}<br>
<b>Takeaway:</b> ${result.takeaway}
</div>`;

    // ================= TABLE =================
    const tbody = document.querySelector("#flowTable tbody");
    tbody.innerHTML = "";

    result.rows.forEach(r => {
        let cls = "mixed";
        if (r.Bias.includes("Bull")) cls = "bull";
        if (r.Bias.includes("Bear")) cls = "bear";
        if (r.Bias.includes("Range")) cls = "range";

        tbody.innerHTML += `
 <tr class="${cls}">
 <td>${r.strike}</td>
 <td>${r["CE OI"]}</td>
 <td>${r["CE OBV"]}</td>
 <td>${r["PE OI"]}</td>
 <td>${r["PE OBV"]}</td>
 <td>${r["CE Meaning"]}</td>
 <td>${r["PE Meaning"]}</td>
 <td>${r["Market Outcome"]}</td>
 <td>${r.Bias}</td>
 </tr>`;
    });

}

// ================= HELPERS =================
function clean(v, t) { return Math.abs(v) < t ? 0 : v; }
function arrow(v) { if (v === 0) return "0"; return v > 0 ? "↑" : "↓"; }

// ================= SIDE MEANING =================
function sideMeaning(oi, obv, side) {
    if (oi === 0 && obv === 0) return "Neutral";
    if (oi > 0 && obv > 0) return side + " Buying";
    if (oi > 0 && obv < 0) return side + " Writing";
    if (oi < 0 && obv > 0) return side + " Short Cover";
    if (oi < 0 && obv < 0) return side + " Long Unwind";
    return "Neutral";
}

// ================= MASTER MATRIX =================
function comboOutcome(ce, pe) {
    if (ce === "CE Buying" && pe === "PE Buying") return ["Directional fight", "⚠ Mixed"];
    if (ce === "CE Buying" && pe === "PE Writing") return ["Strong bullish", "🟢 Bull"];
    if (ce === "CE Buying" && pe === "PE Short Cover") return ["Explosive bullish", "🟢 Bull"];
    if (ce === "CE Writing" && pe === "PE Writing") return ["Range / theta", "⚖ Range"];
    if (ce === "CE Writing" && pe === "PE Buying") return ["Bull trap", "🔴 Bear"];
    if (ce === "CE Short Cover" && pe === "PE Buying") return ["Volatile", "⚠ Mixed"];
    return ["Mixed", "⚠"];
}

// ================= ENGINE =================
function analyze(strikes) {

    let rows = [], bull = 0, bear = 0, activity = 0;
    let atm = strikes[Math.floor(strikes.length / 2)].strike;
    let resistance = null, maxWrite = 0;

    strikes.forEach(s => {

        s.ce_oi = clean(s.ce_oi, OI_THRESHOLD);
        s.ce_obv = clean(s.ce_obv, OBV_THRESHOLD);
        s.pe_oi = clean(s.pe_oi, OI_THRESHOLD);
        s.pe_obv = clean(s.pe_obv, OBV_THRESHOLD);

        const ce = sideMeaning(s.ce_oi, s.ce_obv, "CE");
        const pe = sideMeaning(s.pe_oi, s.pe_obv, "PE");
        const [outcome, bias] = comboOutcome(ce, pe);

        activity += Math.abs(s.ce_obv) + Math.abs(s.pe_obv);

        let weight = Math.abs(s.strike - atm) <= 50 ? 2 : 1;

        if (bias.includes("Bull")) bull += 2 * weight;
        if (bias.includes("Bear")) bear += 2 * weight;
        if (bias.includes("Range") || bias.includes("Mixed")) { bull += 1 * weight; bear += 1 * weight; }

        if (ce === "CE Writing") {
            let strength = Math.abs(s.ce_obv);
            if (strength > maxWrite) {
                maxWrite = strength;
                resistance = s.strike;
            }
        }

        rows.push({
            strike: s.strike,
            "CE OI": arrow(s.ce_oi),
            "CE OBV": arrow(s.ce_obv),
            "PE OI": arrow(s.pe_oi),
            "PE OBV": arrow(s.pe_obv),
            "CE Meaning": ce,
            "PE Meaning": pe,
            "Market Outcome": outcome,
            "Bias": bias
        });
    });

    const total = bull + bear || 1;
    const bullPct = Math.round(bull / total * 100);
    const bearPct = Math.round(bear / total * 100);

    let finalBias = "RANGE";
    let explanation = "CE & PE both active with rejection above.";
    let takeaway = "Scalp only — market boxed.";

    if (bullPct >= 65) {
        finalBias = "BULL";
        explanation = "PE covering + CE accumulation dominating.";
        takeaway = "Buy dips after 5-min higher low.";
    }
    if (bearPct >= 65) {
        finalBias = "BEAR";
        explanation = "CE writing + PE buying dominating upper strikes.";
        takeaway = "Sell rallies near resistance; avoid longs.";
    }

    let marketMode = activity < 300 ? "LOW ACTIVITY" : activity < 1000 ? "LIGHT" : "STRONG";

    return {
        rows, bullPct, bearPct, finalBias,
        activity: Math.round(activity),
        marketMode, resistance, explanation, takeaway
    };
}





function generateOIChartsForPrediction(oiData, name) {
    let scriptData = generateTrend(name)
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let html = ''
    jQ.each(oiData['tableData'], function (index, item) {
        html += '<div class="col-md-12">'

        html += '<div class="row">'
        html += '<div class="col-md-12">'
        html += '<h5 style="text-align:center;">' + item.STRIKE + '</h5>'
        html += '<span style="font-size:small;width:100%;text-align:center;display:block;">[' + name + ' - Open: ' + scriptData['open'] + ' : Ltp:' + scriptData['ltp'] + ']</span>'
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

    jQ("#oi-obv-charts" + tempName).html(html);

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
            map.label = moment(Citem[0]).format("DD HH:mm");
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
        });


        let ceOiChange = []
        jQ.each(OI_CE, function (Cindex, Citem) {
            let map = {}
            map.value = parseFloat((Citem[6] - preCEOI[6]) / 100000).toFixed(1);
            ceOiChange.push(map)
        });

        let peOiChange = []
        jQ.each(OI_PE, function (Pindex, Pitem) {
            let map = {}
            map.value = parseFloat((Pitem[6] - prePEOI[6]) / 100000).toFixed(1);
            peOiChange.push(map)
        });

        jQ("#oi-chart-prediction-" + item.STRIKE).insertFusionCharts({
            type: "msspline",
            width: "100%",
            dataFormat: "json",
            dataSource: {
                chart: {
                    "thousandSeparatorPosition": "2,3",
                    "formatNumberScale": "0",
                    "adjustDiv": "0",
                    showvalues: "0",
                    labeldisplay: "ROTATE",
                    rotatelabels: "1",
                    "theme": "candy",
                    "paletteColors": " #da3224, #37a009",
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
            map.label = moment(Citem['date']).format("DD HH:mm");
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
            type: "msspline",
            width: "100%",
            dataFormat: "json",
            dataSource: {
                chart: {
                    "thousandSeparatorPosition": "2,3",
                    "formatNumberScale": "0",
                    "theme": "candy",
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

            /*
            obj['CE_OBV'] = calculateOBV(prevDataCE, currDataCE)
            obj['PE_OBV'] = calculateOBV(prevDataPE, currDataPE)
            */

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