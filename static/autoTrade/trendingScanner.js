let trendingStocks = []
let allTrendingStocks = []
async function showTrendingStocks() {
    trendingStocks = []
    allTrendingStocks = []
    let instru = [];
    let scripts = []
    let checkInstr = []
    let orderRow = 1;

    let futuresMap = {}
    jQ.each(futureInstrumentsList, function (index, item) {
        if (item.name == "SENSEX") {
            let date = moment(item.expiry, 'DD-MM-YYYY').format("YYYY-MM-DD")
            if (SENSEX_EXPIRY_DATE == date) {
                futuresMap[item.name] = item
            }
        } else {
            futuresMap[item.name] = item
        }

    })
    console.log(futuresMap)

    jQ.each(instrumentsMap, function (index, item) {
        if (index != 'INDIA VIX') {
            if (jQ.inArray(index, checkInstr) === -1) {
                instru.push(instrumentsMap[index])
                checkInstr.push(index)
            }
        }
    });

    for (let i = 0; i < instru.length; i++) {
        let data = instru[i];
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
            obj['CURRENT_PRICE'] = infoMap[data.name]['currentPrice'];
        }

        let instrument = data.name
        if (data.name == "NIFTY 50") {
            instrument = "NIFTY"
        } else if (data.name == "NIFTY BANK") {
            instrument = "BANKNIFTY"
        } else if (data.name == "NIFTY FIN SERVICE") {
            instrument = "FINNIFTY"
        } else if (data.name == "NIFTY MID SELECT") {
            instrument = "MIDCPNIFTY"
        }
        obj['FUTURES_NAME'] = ''
        obj['FUTURES_TOKEN'] = ''
        if (instrument != "GIFT NIFTY") {
            obj['FUTURES_NAME'] = futuresMap[instrument]['name']
            obj['FUTURES_TOKEN'] = futuresMap[instrument]['instrument_token']
        }


        scripts.push(obj)
    }

    for (let i = 0; i < scripts.length; i++) {
        let obj = {}

        obj['TRADINGSYMBOL'] = scripts[i]['TRADINGSYMBOL']
        let info = infoMap[scripts[i]['TRADINGSYMBOL']]
        obj['LTP'] = info['currentPrice']
        obj['TREND'] = scripts[i]['TREND']
        obj['STRIKEDATA'] = scripts[i]['STRIKEDATA']
        obj['CLOSE'] = scripts[i]['CLOSE']
        obj['PRICE'] = scripts[i]['PRICE']
        obj['PERC'] = scripts[i]['PERC']
        let name = scripts[i]['TRADINGSYMBOL']

        let instrument = name
        if (name == "NIFTY 50") {
            instrument = "NIFTY"
        } else if (name == "NIFTY BANK") {
            instrument = "BANKNIFTY"
        } else if (name == "NIFTY FIN SERVICE") {
            instrument = "FINNIFTY"
        } else if (name == "NIFTY MID SELECT") {
            instrument = "MIDCPNIFTY"
        }
        obj['FUTURES_NAME'] = ''
        obj['FUTURES_TOKEN'] = ''
        obj['FUTURES_TREND'] = ''
        if (instrument != "GIFT NIFTY") {
            obj['FUTURES_TRADING_SYMBOL'] = futuresMap[instrument]['tradingsymbol']
            obj['FUTURES_TOKEN'] = futuresMap[instrument]['instrument_token']
            obj['FUTURES_EXPIRY'] = futuresMap[instrument]['expiry']
            obj['FUTURES_NAME'] = futuresMap[instrument]['name']
            obj['FUTURES_LOT_SIZE'] = futuresMap[instrument]['lot_size']
        }

        if (instrumentOrder[scripts[i]['TRADINGSYMBOL']]) {
            obj['ORDER'] = instrumentOrder[scripts[i]['TRADINGSYMBOL']];
        } else {
            obj['ORDER'] = orderRow * 1000;
        }

        obj['OHL_TREND'] = ''
        obj['OI_TREND'] = ''
        obj['VOLUME'] = ''
        obj['INDEX'] = ''

        let indexType = []
        if (jQ.inArray(scripts[i]['TRADINGSYMBOL'], NIFTY_50_LIST) !== -1) {
            indexType.push("NIFTY")
        }
        if (jQ.inArray(scripts[i]['TRADINGSYMBOL'], NIFTY_BANK_LIST) !== -1) {
            indexType.push("BANK")
        }

        obj['INDEX'] = indexType.join(",")
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
        obj['ACTIONS'] = ''

        obj['WEIGHTAGE'] = ''

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
        let aso = parseFloat(obj['STRIKEDATA']['ustrikeOne']) - parseFloat(obj['PRICE']);
        aso = aso / 5
        asoPrice = parseFloat(obj['STRIKEDATA']['ustrikeOne']);

        let bso = parseFloat(obj['PRICE']) - parseFloat(obj['STRIKEDATA']['bstrikeOne']);
        bso = bso / 5
        bsoPrice = parseFloat(obj['STRIKEDATA']['bstrikeOne']);

        if (jQ.inArray("ASO", obj['TREND']) != -1) {
            priceMoved = parseFloat(info['currentPrice']) - asoPrice
        }

        if (jQ.inArray("BSO", obj['TREND']) != -1) {
            priceMoved = bsoPrice - parseFloat(info['currentPrice'])
        }

        obj['PRICE_MOVED'] = parseFloat(priceMoved).toFixed(1)

        let weightageHtml = ''

        if (NIFTY_50_WEIGHT[scripts[i]['TRADINGSYMBOL']]) {
            weightageHtml += '<span title="Nifty weightage" class="badge bg-info ">N: ' + NIFTY_50_WEIGHT[scripts[i]['TRADINGSYMBOL']] + '</span>'
        }

        if (NIFTY_BANK_WEIGHT[scripts[i]['TRADINGSYMBOL']]) {
            weightageHtml += '<span title="Bank nifty weightage" class="badge bg-info ">B: ' + NIFTY_BANK_WEIGHT[scripts[i]['TRADINGSYMBOL']] + '</span>'
        }

        obj['WEIGHTAGE'] = weightageHtml

        trendingStocks.push(obj)
        orderRow++;

    }

    /*trendingStocks.sort((a, b) => a.TRADINGSYMBOL.toLowerCase() > b.TRADINGSYMBOL.toLowerCase() ? 1 : -1);*/
    allTrendingStocks = trendingStocks;
    if (scripts.length > 0) {
        generateTrendingStockTable(trendingStocks)
    }
}

let trendingScannerTable = null
function generateTrendingStockTable(data) {
    let link = "https://kite.zerodha.com/chart/ext/tvc/NFO-OPT/##INSTRUMENT##/##TOKEN##"
    jQ("#trending-stock-list-table").show()
    trendingScannerTable = jQ('#trending-stock-list-table').DataTable({
        fixedColumns: {
            start: 1,
            end: 1
        },
        "processing": true,
        "order": [[28, 'asc']],
        "pageLength": 50,
        "bPaginate": false,
        "data": data,
        "scrollX": true,
        scrollCollapse: true,
        "bDestroy": true,
        "columnDefs": [
            {
                "targets": [],
                "visible": false,
                "searchable": false
            }
        ],

        dom: 'Bfrtip',
        buttons: [
            'copy', 'csv', 'excel', 'pdf', 'print'
        ],
        "columns": [

            {
                "data": "TRADINGSYMBOL",
                render: function (data, type, row, meta) {
                    let html = ''
                    html += '<a target="_blank" href="https://kite.zerodha.com/chart/ext/tvc/' + 'NSE' + '/' + data + '/' + instrumentTokens[data] + '"> '

                    let trades = JSON.parse(localStorage.getItem("TRADES"));
                    if (jQ.inArray(data, trades) !== -1) {
                        html += '<span class=" bg-warning-color" title="Already traded">' + data + '</span>'
                    } else {
                        html += data;
                    }
                    html += '</a>'

                    html += '<span style="font-size:xx-small;position:absolute;right:0" data-price="' + row['LTP'] + '" data-index="' + 0 + '" data-trend="' + row['TREND'] + '" data-name="' + row['TRADINGSYMBOL'] + '" class="bg-info-color show-chart">'
                    html += 'Chart'
                    html += '</span>'

                    let symbol = row['TRADINGSYMBOL']
                    if (row['TRADINGSYMBOL'] == "NIFTY 50") {
                        symbol = "NIFTY"
                    }
                    html += '<span style="font-size:xx-small;position:absolute;right:2rem;" data-price="' + row['LTP'] + '" data-index="' + 0 + '" data-trend="' + row['TREND'] + '" data-name="' + symbol + '" class="bg-info-color show-option-change">'
                    html += 'OI'
                    html += '</span>'

                    html += '<span style="font-size:xx-small;position:absolute;right:3rem;"  data-lot-size="' + row['FUTURES_LOT_SIZE'] + '" data-token="' + row['FUTURES_TOKEN'] + '" data-name="' + row['FUTURES_NAME'] + '" class="bg-info-color show-future-chart">'
                    html += 'Fut'
                    html += '</span>'

                    return html;
                }
            },

            {
                "data": 'PERC',
                render: function (data, type, row, meta) {
                    let currentPrice = row['LTP'];
                    let prevClose = row['CLOSE'];
                    let change = (currentPrice - prevClose).toFixed(2);
                    let changePerc = ((change / prevClose) * 100).toFixed(2)
                    let html = ''
                    if (changePerc < 0) {
                        html += '<span class=" bg-danger-color">' + changePerc + '</span>'
                    } else {
                        html += '<span class=" bg-success-color">' + changePerc + '</span>'
                    }
                    return html;
                }
            },
            { "data": "PRICE_MOVED" },
            {
                "data": "TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data.length > 0) {
                        jQ.each(data, function (index, item) {
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
                    }
                    return html
                }

            },
            {
                "data": "OHL_TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data) {

                        if (data[2] == "Strong Sell(OH)") {
                            html += '<span title="' + data[2] + '" class="badge bg-danger">SSOH</span>'
                        }

                        if (data[2] == "Strong Buy(OL)") {
                            html += '<span title="' + data[2] + '" class="badge bg-success">SBOL</span>'

                        }

                        if (data[2] == "Strong Sell(Lower High)") {
                            html += '<span title="' + data[2] + '" class="badge bg-danger">SSLH</span>'
                        }

                        if (data[2] == "Strong Buy(Higher High)") {
                            html += '<span title="' + data[2] + '" class="badge bg-success">SBHH</span>'
                        }

                        if (data[2] == "Buy") {
                            html += '<span title="' + data[2] + '" class="badge bg-success">B</span>'
                        }

                        if (data[2] == "Sell") {
                            html += '<span title="' + data[2] + '" class="badge bg-danger">S</span>'
                        }
                    }
                    return html
                }
            },

            {
                "data": "OHL_TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data) {
                        html += '<span class=" bg-success-color">' + parseFloat(data[0]).toFixed(2) + '</span>'
                    }
                    return html
                }
            },

            {
                "data": "OHL_TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data) {
                        html += '<span class=" bg-danger-color">' + parseFloat(data[1]).toFixed(2) + '</span>'
                    }
                    return html
                }
            },
            { "data": "VOLUME" },
            {
                "data": "LTP",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data) {
                        let name = row['TRADINGSYMBOL']
                        let tempName = name.replaceAll(" ", "-")
                        tempName = tempName.replaceAll("&", "-")
                        html += '<span class="ltp-claass " id="trending-ltp-price-' + tempName + '">' + data + '</span>'
                    }
                    return html
                }
            },

            {
                "data": "STRIKE_LOWER_ONE_CE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_LOWER_ONE_PE'])) {
                            className = " bg-danger-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_LOWER_ONE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_LOWER_ONE'])
                            && parseFloat(row['LTP']) < parseFloat(row['STRIKE_LOWER_TWO'])) {
                            className = "bg-danger-color"
                        }
                        html += '<span class="text-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_LOWER_ONE_PE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_LOWER_ONE_CE'])) {
                            className = " bg-success-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },

            {
                "data": "STRIKE_LOWER_TWO_CE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_LOWER_TWO_PE'])) {
                            className = " bg-danger-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_LOWER_TWO",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_LOWER_TWO'])
                            && parseFloat(row['LTP']) < parseFloat(row['STRIKE_ATM'])) {
                            className = "bg-danger-color"
                        }
                        html += '<span class="text-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_LOWER_TWO_PE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_LOWER_TWO_CE'])) {
                            className = " bg-success-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },

            {
                "data": "STRIKE_ATM_CE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_ATM_PE'])) {
                            className = " bg-danger-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_ATM",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {

                        if (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_ATM'])
                            && parseFloat(row['LTP']) < parseFloat(row['STRIKE_UPPER_ONE'])) {
                            className = "bg-danger-color"
                        }
                        html += '<span class="text-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_ATM_PE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_ATM_CE'])) {
                            className = " bg-success-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },

            {
                "data": "STRIKE_UPPER_ONE_CE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_UPPER_ONE_PE'])) {
                            className = " bg-danger-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_UPPER_ONE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(row['LTP']) >= parseFloat(row['STRIKE_UPPER_ONE'])
                            && parseFloat(row['LTP']) < parseFloat(row['STRIKE_UPPER_TWO'])) {
                            className = "bg-danger-color"
                        }
                        html += '<span class="text-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_UPPER_ONE_PE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_UPPER_ONE_CE'])) {
                            className = " bg-success-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },

            {
                "data": "STRIKE_UPPER_TWO_CE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_UPPER_TWO_PE'])) {
                            className = " bg-danger-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_UPPER_TWO",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(row['LTP']) > parseFloat(row['STRIKE_UPPER_TWO'])) {
                            className = "bg-warning-color"
                        }
                        html += '<span class="text-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },
            {
                "data": "STRIKE_UPPER_TWO_PE",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (data) {
                        if (parseFloat(data) > parseFloat(row['STRIKE_UPPER_TWO_CE'])) {
                            className = " bg-success-color"
                        }
                        html += '<span class="number-align ' + className + '">' + data + '</span>'
                    }
                    return html
                }
            },

            {
                "data": "BREAK_OUT",
                render: function (data, type, row, meta) {
                    let html = ''
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

                    /*
                    html += ' ( <span class="badge bg-success">' + trueCount + '</span> )'
                    html += ' ( <span class="badge bg-warning">' + falseCount + '</span> )'
                    */

                    return html
                }
            },
            {
                "data": "BREAK_OUT",
                render: function (data, type, row, meta) {
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

                    return trueCount
                }
            },
            {
                "data": "BREAK_OUT",
                render: function (data, type, row, meta) {
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
                    return falseCount
                }
            },
            {
                "data": "WEIGHTAGE"
            }, {
                "data": "ORDER"
            },
            {
                "data": "INDEX"
            },
            {
                "data": "FUTURES_NAME",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (row['FUTURES_TREND']) {
                        console.log(row['FUTURES_TREND'])
                        html += row['FUTURES_TREND']['TREND']['PLUS']
                        html += row['FUTURES_TREND']['TREND']['MINUS']
                    }
                    return html
                }
            },

        ],
        "fnInitComplete": function (oSettings, json) {
            showTrendCount()
        },
        "fnRowCallback": function (nRow, aData, iDisplayIndex, iDisplayIndexFull) {
            for (var i in aData) {
                jQ('td:eq(' + 10 + ')', nRow).addClass('strike-class');
                jQ('td:eq(' + 13 + ')', nRow).addClass('strike-class');
                jQ('td:eq(' + 16 + ')', nRow).addClass('strike-class');
                jQ('td:eq(' + 19 + ')', nRow).addClass('strike-class');
                jQ('td:eq(' + 22 + ')', nRow).addClass('strike-class');

            }
        }
    });
    jQ("#trending-last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));

}

function showTrendCount() {
    let asoCount = 0;
    let bsoCount = 0;
    let allCount = 0;
    jQ.each(allTrendingStocks, function (index, item) {
        if (jQ.inArray("ASO", item['TREND']) != -1) {
            asoCount++;
        }
        if (jQ.inArray("BSO", item['TREND']) != -1) {
            bsoCount++;
        }
        allCount++;
    });

    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="all" class="dt-button trend-filter bg-info" type="button"><span>ALL(' + allCount + ')</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="bso" class="dt-button trend-filter bg-danger" type="button"><span>BSO (' + bsoCount + ')</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="aso" class="dt-button trend-filter bg-success" type="button"><span>ASO(' + asoCount + ')</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button style="margin-right: .2rem;" data-trend="n50" class="dt-button trend-filter  bg-info" type="button"><span>N50</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="bank" class="dt-button trend-filter  bg-info" type="button"><span>BN</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="trending" class="dt-button trend-filter  bg-info" type="button"><span>TRENDING</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-type="TREND" style="margin-right: .2rem;" class="dt-button analyse-instrument  bg-info" type="button"><span>ANALYZE TREND</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-type="OI" style="margin-right: .2rem;" class="dt-button analyse-instrument bg-info" type="button"><span>ANALYZE OI</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button style="margin-right: .2rem;" class="dt-button refresh-refresh-list bg-info" type="button"><span>REFRESH</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<span style="margin-right: .2rem;" id="processing-trend"></span>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<span style="margin-right: .2rem;" id="last-refresh-trend"></span>')


}

jQ(document).on("click", ".trend-filter", function (e) {
    let name = jQ(this).attr("data-trend");
    trendingStocks = []
    jQ.each(allTrendingStocks, function (index, item) {
        if (name == "aso") {
            if (jQ.inArray("ASO", item['TREND']) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "bso") {
            if (jQ.inArray("BSO", item['TREND']) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "n50") {
            if (jQ.inArray(item['TRADINGSYMBOL'], NIFTY_50_LIST) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "bank") {
            if (jQ.inArray(item['TRADINGSYMBOL'], NIFTY_BANK_LIST) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "trending") {
            if (jQ.inArray("ASO", item['TREND']) != -1) {
                trendingStocks.push(item)
            }
            if (jQ.inArray("BSO", item['TREND']) != -1) {
                trendingStocks.push(item)
            }
        } else {
            trendingStocks.push(item)
        }
    });
    generateTrendingStockTable(trendingStocks)
});

jQ(document).on("click", ".analyse-instrument", function () {
    var that = jQ(this);
    that.attr("disabled", true);
    jQ("#processing-trend").html("Processing.... ");
    let type = jQ(this).attr("data-type");
    commonAnalyzeTrend(type, that)

});

async function commonAnalyzeTrend(type, that) {
    await callAnalyseTrend(type, [])
    that.attr("disabled", false)
}

async function callAnalyseTrend(type, REFRESH_STOCKS) {
    let count = 0;
    let scriptsCount = trendingStocks.length
    let refreshCount = REFRESH_STOCKS.length
    let tableData
    let refreshIndex = 1;
    for (let i = 0; i < scriptsCount; i++) {
        if (REFRESH_STOCKS.length > 0) {
            if (!(jQ.inArray(trendingStocks[i]['TRADINGSYMBOL'], REFRESH_STOCKS) !== -1)) {
                continue;
            } else {
                jQ("#processing-trend").html("Processing.... " + refreshIndex + "/" + refreshCount);
                refreshIndex++;
            }
        } else {
            jQ("#processing-trend").html("Processing.... " + i + "/" + scriptsCount);
        }

        try {

            let name = trendingStocks[i]['TRADINGSYMBOL']
            let tempName = name.replaceAll(" ", "-")
            tempName = tempName.replaceAll("&", "-")
            let rowId = i

            let data = await getHistoricalDataUsingPromise(instrumentTokens[name], moment(START_MONTH_DAY_DATE).add(-10, 'days').format("YYYY-MM-DD"), CURRENT_DAY, 'day');
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
            let dayOpen = parseFloat(instrumentsMap[name]['price']);
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


            let previousClose = parseFloat(instrumentsMap[name].prevPrice);
            trendingStocks[rowId]['LTP'] = infoMap[name]['currentPrice']
            let res = calculateOHLBuySell(dayOpen, dayHigh, dayLow, infoMap[name]['currentPrice'], previousClose);
            trendingStocks[rowId]['OHL_TREND'] = res;
            if (type == "OI" && name != 'GIFT NIFTY') {
                let strikes = await showTrendingOI(name)
                if (ANALYZE_FUTURE_TREND) {
                    let futureTrend = await showFutureTrend(trendingStocks[rowId])
                    trendingStocks[rowId]['FUTURES_TREND'] = futureTrend
                }
                let link = "https://kite.zerodha.com/chart/ext/tvc/NFO-OPT/##INSTRUMENT##/##TOKEN##"
                if (strikes[0]) {
                    trendingStocks[rowId]['STRIKE_LOWER_ONE_CE'] = strikes[0]['CHG_OI_CE']

                    oiHtml = ''
                    oiHtml += '<div style="display:flex;">'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[0].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[0].CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;">'
                    oiHtml += 'CE'
                    oiHtml += '</a>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[0].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[0].PE.instrument_token) + '" target="_blank" style="font-size:xx-small;">'
                    oiHtml += 'PE'
                    oiHtml += '</a>'
                    if (trendingStocks[rowId]['LTP'] < strikes[0]['STRIKE']) {
                        oiHtml += '<a data-price="' + strikes[0]['STRIKE'] + '" data-name="' + name + '" class=" bg-secondary-color create-alerts" style="font-size:xx-small;margin-left:.1rem;">A</a>'
                    }
                    oiHtml += '</div>'

                    trendingStocks[rowId]['STRIKE_LOWER_ONE'] = strikes[0]['STRIKE'] + oiHtml

                    trendingStocks[rowId]['STRIKE_LOWER_ONE_PE'] = strikes[0]['CHG_OI_PE']
                }

                if (strikes[1]) {
                    trendingStocks[rowId]['STRIKE_LOWER_TWO_CE'] = strikes[1]['CHG_OI_CE']

                    oiHtml = ''
                    oiHtml += '<div style="display:flex;">'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[1].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[1].CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;">'
                    oiHtml += 'CE'
                    oiHtml += '</a>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[1].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[1].PE.instrument_token) + '" target="_blank" style="font-size:xx-small;">'
                    oiHtml += 'PE'
                    oiHtml += '</a>'
                    if (trendingStocks[rowId]['LTP'] < strikes[1]['STRIKE']) {
                        oiHtml += '<a data-price="' + strikes[1]['STRIKE'] + '" data-name="' + name + '" class=" bg-secondary-color create-alerts" style="font-size:xx-small;margin-left:.1rem;">A</a>'
                    }

                    oiHtml += '</div>'

                    trendingStocks[rowId]['STRIKE_LOWER_TWO'] = strikes[1]['STRIKE'] + oiHtml
                    trendingStocks[rowId]['STRIKE_LOWER_TWO_PE'] = strikes[1]['CHG_OI_PE']
                }

                if (strikes[2]) {
                    trendingStocks[rowId]['STRIKE_ATM_CE'] = strikes[2]['CHG_OI_CE']

                    oiHtml = ''
                    oiHtml += '<div style="display:flex;">'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[2].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[2].CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;">'
                    oiHtml += 'CE'
                    oiHtml += '</a>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[2].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[2].PE.instrument_token) + '" target="_blank" style="font-size:xx-small;">'
                    oiHtml += 'PE'
                    oiHtml += '</a>'
                    if (trendingStocks[rowId]['LTP'] < strikes[2]['STRIKE']) {
                        oiHtml += '<a data-price="' + strikes[2]['STRIKE'] + '" data-name="' + name + '" class=" bg-secondary-color create-alerts" style="font-size:xx-small;margin-left:.1rem;">A</a>'
                    }

                    oiHtml += '</div>'

                    trendingStocks[rowId]['STRIKE_ATM'] = strikes[2]['STRIKE'] + oiHtml
                    trendingStocks[rowId]['STRIKE_ATM_PE'] = strikes[2]['CHG_OI_PE']
                }

                if (strikes[3]) {
                    trendingStocks[rowId]['STRIKE_UPPER_ONE_CE'] = strikes[3]['CHG_OI_CE']

                    oiHtml = ''
                    oiHtml += '<div style="display:flex;">'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[3].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[3].CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;">'
                    oiHtml += 'CE'
                    oiHtml += '</a>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[3].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[3].PE.instrument_token) + '" target="_blank" style="font-size:xx-small;">'
                    oiHtml += 'PE'
                    oiHtml += '</a>'
                    if (trendingStocks[rowId]['LTP'] < strikes[3]['STRIKE']) {
                        oiHtml += '<a data-price="' + strikes[3]['STRIKE'] + '" data-name="' + name + '" class=" bg-secondary-color create-alerts" style="font-size:xx-small;margin-left:.1rem;">A</a>'
                    }

                    oiHtml += '</div>'


                    trendingStocks[rowId]['STRIKE_UPPER_ONE'] = strikes[3]['STRIKE'] + oiHtml
                    trendingStocks[rowId]['STRIKE_UPPER_ONE_PE'] = strikes[3]['CHG_OI_PE']
                }

                if (strikes[4]) {
                    trendingStocks[rowId]['STRIKE_UPPER_TWO_CE'] = strikes[4]['CHG_OI_CE']

                    oiHtml = ''
                    oiHtml += '<div style="display:flex;">'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[4].CE.tradingsymbol).replaceAll("##TOKEN##", strikes[4].CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;">'
                    oiHtml += 'CE'
                    oiHtml += '</a>'
                    oiHtml += '<a href="' + link.replaceAll("##INSTRUMENT##", strikes[4].PE.tradingsymbol).replaceAll("##TOKEN##", strikes[4].PE.instrument_token) + '" target="_blank" style="font-size:xx-small;">'
                    oiHtml += 'PE'
                    oiHtml += '</a>'

                    if (trendingStocks[rowId]['LTP'] < strikes[4]['STRIKE']) {
                        oiHtml += '<a data-price="' + strikes[4]['STRIKE'] + '" data-name="' + name + '" class=" bg-secondary-color create-alerts" style="font-size:xx-small;margin-left:.1rem;">A</a>'
                    }

                    oiHtml += '</div>'

                    trendingStocks[rowId]['STRIKE_UPPER_TWO'] = strikes[4]['STRIKE'] + oiHtml
                    trendingStocks[rowId]['STRIKE_UPPER_TWO_PE'] = strikes[4]['CHG_OI_PE']
                }
            }

            let last = candles[candles.length - 1];
            trendingStocks[rowId]['VOLUME'] = last.volume

            let info = infoMap[name]
            trendingStocks[rowId]['LTP'] = info['currentPrice']

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

            trendingStocks[rowId]['isOneDayAgo'] = isOneDayAgo;
            trendingStocks[rowId]['isTwoDayAgo'] = isTwoDayAgo;
            trendingStocks[rowId]['isThreeDayAgo'] = isThreeDayAgo;
            trendingStocks[rowId]['isFourDayAgo'] = isFourDayAgo;
            trendingStocks[rowId]['isFiveDayAgo'] = isFiveDayAgo;
            trendingStocks[rowId]['isSixDayAgo'] = isSixDayAgo;
            trendingStocks[rowId]['isSevenDayAgo'] = isSevenDayAgo;
            trendingStocks[rowId]['isDayCloseGreaterDayOpen'] = isDayCloseGreaterDayOpen;
            trendingStocks[rowId]['isDayCloseGreaterOneDayAgoClose'] = isDayCloseGreaterOneDayAgoClose;
            trendingStocks[rowId]['isWeeklyCloseGreaterWeeklyOpen'] = isWeeklyCloseGreaterWeeklyOpen;
            trendingStocks[rowId]['isMonthlyCloseGreaterMonthlyOpen'] = isMonthlyCloseGreaterMonthlyOpen;
            trendingStocks[rowId]['oneDayAgoVolumeGreater'] = oneDayAgoVolumeGreater;

            let priceMoved = 0;
            let asoPrice = 0;
            let bsoPrice = 0;
            let aso = parseFloat(trendingStocks[rowId]['STRIKEDATA']['ustrikeOne']) - parseFloat(trendingStocks[rowId]['PRICE']);
            aso = aso / 5
            asoPrice = parseFloat(trendingStocks[rowId]['STRIKEDATA']['ustrikeOne']) - aso;

            let bso = parseFloat(trendingStocks[rowId]['PRICE']) - parseFloat(trendingStocks[rowId]['STRIKEDATA']['bstrikeOne']);
            bso = bso / 5
            bsoPrice = parseFloat(trendingStocks[rowId]['STRIKEDATA']['bstrikeOne']) + bso;

            if (jQ.inArray("ASO", trendingStocks[rowId]['TREND']) != -1) {
                priceMoved = parseFloat(info['currentPrice']) - asoPrice
            }

            if (jQ.inArray("BSO", trendingStocks[rowId]['TREND']) != -1) {
                priceMoved = bsoPrice - parseFloat(info['currentPrice'])
            }
            trendingStocks[rowId]['PRICE_MOVED'] = parseFloat(priceMoved).toFixed(1)

            updateTrendingTable(rowId)
            count++;
            if (count == 3) {
                /*await callSleepForAWhile(1000)*/
                count = 0;
            }
        } catch (err) {
            console.log("Error while analyzing stock : " + trendingStocks[i]['TRADINGSYMBOL'])
            console.log(err)
        }
    }

    if (REFRESH_STOCKS.length == 0) {
        let allBull = 0;
        let allBear = 0;
        let niftyBull = 0;
        let niftyBear = 0;
        let bankBull = 0;
        let bankBear = 0;
        jQ.each(trendingStocks, function (index, row) {
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

            if (isOneDayAgoValue == 'T') {
                allBull++

                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBull++
                }

                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBull++
                }
            } else {
                allBear++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBear++
                }

                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBear++
                }
            }

            if (isTwoDayAgoValue == 'T') {
                allBull++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBull++
                }

                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBull++
                }
            } else {
                allBear++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBear++
                }
                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBear++
                }
            }


            if (isThreeDayAgoValue == 'T') {
                allBull++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBull++
                }

                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBull++
                }
            } else {
                allBear++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBear++
                }
                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBear++
                }
            }

            if (isFourDayAgoValue == 'T') {
                allBull++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBull++
                }

                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBull++
                }
            } else {
                allBear++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBear++
                }
                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBear++
                }
            }

            if (isFiveDayAgoValue == 'T') {
                allBull++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBull++
                }

                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBull++
                }
            } else {
                allBear++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBear++
                }
                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBear++
                }
            }

            if (isSixDayAgoValue == 'T') {
                allBull++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBull++
                }

                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBull++
                }
            } else {
                allBear++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBear++
                }
                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBear++
                }
            }

            if (isSevenDayAgoValue == 'T') {
                allBull++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBull++
                }
                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBull++
                }
            } else {
                allBear++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBear++
                }
                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBear++
                }
            }

            if (isDayCloseGreaterDayOpenValue == 'T') {
                allBull++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBull++
                }

                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBull++
                }
            } else {
                allBear++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBear++
                }
                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBear++
                }
            }

            if (isDayCloseGreaterOneDayAgoCloseValue == 'T') {
                allBull++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBull++
                }

                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBull++
                }
            } else {
                allBear++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBear++
                }
                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBear++
                }
            }

            if (isWeeklyCloseGreaterWeeklyOpenValue == 'T') {
                allBull++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBull++
                }

                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBull++
                }
            } else {
                allBear++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBear++
                }
                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBear++
                }
            }

            if (isMonthlyCloseGreaterMonthlyOpenValue == 'T') {
                allBull++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBull++
                }

                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBull++
                }
            } else {
                allBear++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBear++
                }
                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBear++
                }
            }

            if (oneDayAgoVolumeGreaterValue == 'T') {
                allBull++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBull++
                }

                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBull++
                }
            } else {
                allBear++
                if (row.INDEX == "NIFTY" || row.INDEX == "NIFTY,BANK") {
                    niftyBear++
                }
                if (row.INDEX == "BANK" || row.INDEX == "NIFTY,BANK") {
                    bankBear++
                }
            }
        });

        let allBullPerc = allBull / (12 * 227) * 100
        let allBearPerc = allBear / (12 * 227) * 100


        let niftyBullPerc = niftyBull / (12 * 50) * 100
        let niftyBearPerc = niftyBear / (12 * 50) * 100


        let bankBullPerc = bankBull / (12 * 12) * 100
        let bankBearPerc = bankBear / (12 * 12) * 100

        jQ("#all-bull-trend").html(parseFloat(allBullPerc).toFixed(2) + '%')
        jQ("#all-bear-trend").html(parseFloat(allBearPerc).toFixed(2) + '%')
        jQ("#nifty-bull-trend").html(parseFloat(niftyBullPerc).toFixed(2) + '%')
        jQ("#nifty-bear-trend").html(parseFloat(niftyBearPerc).toFixed(2) + '%')
        jQ("#bank-bull-trend").html(parseFloat(bankBullPerc).toFixed(2) + '%')
        jQ("#bank-bear-trend").html(parseFloat(bankBearPerc).toFixed(2) + '%')

    }
    jQ("#processing-trend").html("Done...");
    jQ("#last-refresh-trend").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));

}

async function showFutureTrend(row) {
    let pres = await getHistoricalDataUsingPromise(row.FUTURES_TOKEN, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day');
    let cres = await getHistoricalDataUsingPromise(row.FUTURES_TOKEN, CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
    let trend;
    let moreInfo;
    if (row['TRADINGSYMBOL'] == "NIFTY BANK") {
        trend = showAiBankNiftyPrediction(cres, pres, row);
        moreInfo = bankNiftyFutureAnalysis(cres, pres, row)
    } else {
        trend = showAiNiftyPrediction(cres, pres, row)
        moreInfo = niftyFutureAnalysis(cres, pres, row)
    }
    let result = {}
    result['TREND'] = trend
    result['MORE_INFO'] = moreInfo
    return result
}

function showAiNiftyPrediction(currentQuoteData, prevQuoteData, row) {
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
    var openInterest = quote['oi'] / row['FUTURES_LOT_SIZE'];
    var previousOI = prevQuote['oi'] / row['FUTURES_LOT_SIZE']
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

function showAiBankNiftyPrediction(currentQuoteData, prevQuoteData, row) {
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
    var openInterest = quote['oi'] / row['FUTURES_LOT_SIZE'];
    var previousOI = prevQuote['oi'] / row['FUTURES_LOT_SIZE']
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

function niftyFutureAnalysis(currentQuoteData, prevQuoteData, row) {
    let futuresData = {};

    let prevData = prevQuoteData.data['candles'][0];
    let currentData = currentQuoteData.data['candles'][currentQuoteData.data['candles'].length - 1];

    if (!currentData) {
        return;
    }

    let currentChangeInOi = ''
    if (currentQuoteData.data['candles'].length > 1) {
        let secondData = currentQuoteData.data['candles'][currentQuoteData.data['candles'].length - 2];
        var latestOI = (currentData[6] / row['FUTURES_LOT_SIZE']).toFixed(0);
        var previousLatestOi = (secondData[6] / row['FUTURES_LOT_SIZE']).toFixed(0);
        let diff = latestOI - previousLatestOi
        if (diff > 0) {
            currentChangeInOi += '<span class="badge bg-success">' + parseFloat(diff).toFixed(2) + ' [' + moment(currentData[0]).format("HH:mm") + ']' + '</span>'
        } else {
            currentChangeInOi += '<span class="badge bg-danger">' + parseFloat(diff).toFixed(2) + ' [' + moment(currentData[0]).format("HH:mm") + ']' + '</span>'
        }
        /*if (Math.abs(diff) > 100) {
            let alrtSound = new Audio(alertSound);
            alrtSound.play();
        }*/

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
    var vwapPrice = (totalVolumePrice / totalVolume)


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

    var openInterest = (quote.oi / row['FUTURES_LOT_SIZE']).toFixed(0);
    var previousOI = prevQuote['oi'] / row['FUTURES_LOT_SIZE']
    var changeinOpenInterest = (openInterest - previousOI)
    var pchangeinOpenInterest = (((openInterest - previousOI) / previousOI) * 100);

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

    futuresData.OI = oiPrice + " " + oiPriceChangDirection + " " + oiPricePer + " " + oiPriceChang + " " + currentChangeInOi

    return futuresData;
}

function bankNiftyFutureAnalysis(currentQuoteData, prevQuoteData, row) {
    let futuresData = {};

    let prevData = prevQuoteData.data['candles'][0];
    let currentData = currentQuoteData.data['candles'][currentQuoteData.data['candles'].length - 1];

    if (!currentData) {
        return;
    }

    let currentChangeInOi = ''
    if (currentQuoteData.data['candles'].length > 1) {
        let secondData = currentQuoteData.data['candles'][currentQuoteData.data['candles'].length - 2];
        var latestOI = (currentData[6] / row['FUTURES_LOT_SIZE']).toFixed(0);
        var previousLatestOi = (secondData[6] / row['FUTURES_LOT_SIZE']).toFixed(0);
        let diff = latestOI - previousLatestOi
        if (diff > 0) {
            currentChangeInOi += '<span class="badge bg-success">' + parseFloat(diff).toFixed(2) + ' [' + moment(currentData[0]).format("HH:mm") + ']' + '</span>'
        } else {
            currentChangeInOi += '<span class="badge bg-danger">' + parseFloat(diff).toFixed(2) + ' [' + moment(currentData[0]).format("HH:mm") + ']' + '</span>'
        }
        /*if (Math.abs(diff) > 100) {
            let alrtSound = new Audio(alertSound);
            alrtSound.play();
        }*/
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

    var openInterest = (quote.oi / row['FUTURES_LOT_SIZE']).toFixed(0);
    var previousOI = prevQuote['oi'] / row['FUTURES_LOT_SIZE']
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

    futuresData.OI = oiPrice + " " + oiPriceChangDirection + " " + oiPricePer + " " + oiPriceChang + " " + currentChangeInOi

    return futuresData;

}

async function showTrendingOI(instrument) {

    let strikToShow = 2
    let strikeData = []
    let selectedStrike = []
    let currentTime = moment().format("DD-MM-YYYY")
    let currentPrice = infoMap[instrument]['currentPrice']
    let info;
    if (instrument == "NIFTY" || instrument == "NIFTY 50") {
        info = infoMap["NIFTY 50"]
        instrument = "NIFTY"
        strikToShow = 3
    } else if (instrument == "BANKNIFTY" || instrument == "NIFTY BANK") {
        info = infoMap["NIFTY BANK"]
        instrument = "BANKNIFTY"
        strikToShow = 3
    } else if (instrument == "FINNIFTY" || instrument == "NIFTY FIN SERVICE") {
        info = infoMap["NIFTY FIN SERVICE"]
        instrument = "FINNIFTY"
        strikToShow = 3
    } else if (instrument == "MIDCPNIFTY" || instrument == "NIFTY MID SELECT") {
        info = infoMap["NIFTY MID SELECT"]
        instrument = "MIDCPNIFTY"
        strikToShow = 3
    } else {
        info = infoMap[instrument]
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
                /*if (date == STOCK_EXPIRY_DATE) {
                    selectedStrike.push(item)
                }*/
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
                let prevDataCE = await getHistoricalDataUsingPromise(CE.instrument_token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, HISTORICAL_DATA_INTERVAL);
                let currDataCE = await getHistoricalDataUsingPromise(CE.instrument_token, CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);

                let prevDataPE = await getHistoricalDataUsingPromise(PE.instrument_token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, HISTORICAL_DATA_INTERVAL);
                let currDataPE = await getHistoricalDataUsingPromise(PE.instrument_token, CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
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
                currDataPE = currDataPE
            }

            let OI_CE = currDataCE[currDataCE.length - 1][6]
            let OI_PE = currDataPE[currDataPE.length - 1][6]

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

            obj['currDataCE'] = currDataCE
            obj['currDataPE'] = currDataPE

            obj['prevDataCE'] = prevDataCE
            obj['prevDataPE'] = prevDataPE

            tableData.push(obj)
        } catch (err) {
            console.log("Error while fetching strike : " + index)
        }

    });

    tableData.sort(function (a, b) { return parseFloat(a.STRIKE) - parseFloat(b.STRIKE) })
    return tableData
}

function updateTrendingTable(rowId) {
    jQ('#trending-stock-list-table').DataTable().row(rowId).data(trendingStocks[rowId]).draw(false);
}

jQ(document).on("click", ".create-alerts", function () {
    let name = jQ(this).attr("data-name");
    let price = jQ(this).attr("data-price");
    lhs_tradingsymbol = name

    let lhs_exchange = "NSE"
    if (lhs_tradingsymbol.includes("NIFTY")) {
        lhs_exchange = "INDICES"
    }

    createAlert(name + "-" + 'PRICE_ALERT', lhs_tradingsymbol, price, ">=", lhs_exchange)
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
