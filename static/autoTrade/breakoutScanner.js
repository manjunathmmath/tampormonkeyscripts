
async function autoBreakOutScanner() {

    if (!ENABLE_BREAKOUT_SCANNER) {
        console.log("-------------------[SCANNER DISABLED]------------------");
        return
    }

    let currentTime = moment().format("HH:mm")
    let checkTime = moment(PREVIOUS_DAY_DATE + " 09:20:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")
    let endTime = moment(PREVIOUS_DAY_DATE + " 15:00:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")

    console.log("Scanner starts  @ " + checkTime + "AM.  current time is :" + currentTime);

    if (currentTime >= endTime) {
        console.log("------------------------[SCANNER  - MARKET CLOSED]----------------------------------");
        console.log("current Time :" + currentTime);
        console.log("------------------------------------------------------------------------------------");
        return
    }

    if (!(currentTime >= checkTime)) {
        console.log("--------------------[SCANNER  - CHECKING FOR 9:15 MINUTES SCAN CONDITION]-----------");
        console.log("current Time :" + currentTime);
        console.log("------------------------------------------------------------------------------------");
        return
    }

    let currentMinute = moment().format("mm")
    if ((currentMinute % 5) != 0) {
        console.log("-----------------[SCANNER CHECKING FOR 5 MINUTES INTERVAL SCAN CONDITION]-----------");
        console.log("current Minute :" + currentMinute);
        console.log("------------------------------------------------------------------------------------");
        return
    }

    commonBreakOutLogic(true)
    await callAnalyseBreakout(true);
}

jQ(document).on("click", "#show-breakout-intruments", function (e) {
    e.preventDefault();
    showBreakOutStocks();
});

let breakOutStocks = []
let allBreakoutStocks = []
function commonBreakOutLogic(auto) {
    breakOutStocks = [];
    allBreakoutStocks = []
    let instru = [];
    let scripts = []
    let checkInstr = []
    let orderRow = 1;

    if (auto) {
        jQ.each(instrumentTokens, function (index, item) {
            if (jQ.inArray(index, checkInstr) === -1) {
                if (index == "NIFTY 50" || index == "NIFTY BANK" || index == "RELIANCE" || index == "HDFCBANK") {
                    instru.push(index)
                    checkInstr.push(index)
                }
            }
        });
    } else {
        jQ.each(instrumentTokens, function (index, item) {
            if (index != 'INDIA VIX') {
                if (jQ.inArray(index, checkInstr) === -1) {
                    instru.push(index)
                    checkInstr.push(index)
                }
            }
        });
    }

    let scriptData = generateTrends()
    for (let i = 0; i < instru.length; i++) {
        let name = instru[i];
        let obj = {}
        obj['TRADINGSYMBOL'] = name;
        obj['CLOSE'] = scriptData[name]['prevPrice'];
        obj['PRICE'] = scriptData[name]['price'];
        obj['PERC'] = scriptData[name]['perc'];
        obj['TREND'] = scriptData[name]['trends'];
        obj['LTP'] = scriptData[name]['ltp'];
        obj['STRIKEDATA'] = scriptData[name]['strikeData'];
        obj['CURRENT_PRICE'] = scriptData[name]['ltp'];
        obj['TREND'] = scriptData[name]['trends'];
        scripts.push(obj)
    }

    if (auto) {
        let validIntruments = JSON.parse(localStorage.getItem("VALID_INSTRUMENTS"));
        jQ.each(validIntruments, function (index, item) {
            if (jQ.inArray(index, checkInstr) === -1) {
                scripts.push(item)
                checkInstr.push(index)
            }
        })
    }


    for (let i = 0; i < scripts.length; i++) {
        let obj = {}

        obj['TRADINGSYMBOL'] = scripts[i]['TRADINGSYMBOL']
        obj['LTP'] = scripts[i]['LTP']
        obj['TREND'] = scripts[i]['TREND']
        obj['STRIKEDATA'] = scripts[i]['STRIKEDATA']
        obj['CLOSE'] = scripts[i]['CLOSE']
        obj['PRICE'] = scripts[i]['PRICE']
        obj['PERC'] = scripts[i]['PERC']
        obj['ORDER'] = orderRow;
        obj['VOLUME'] = ''
        obj['OHL_TREND'] = ''
        obj['BREAKOUT'] = ''
        let indexType = []
        if (jQ.inArray(scripts[i]['TRADINGSYMBOL'], NIFTY_50_LIST) !== -1) {
            indexType.push("NIFTY")
        }
        if (jQ.inArray(scripts[i]['TRADINGSYMBOL'], NIFTY_BANK_LIST) !== -1) {
            indexType.push("BANK")
        }

        obj['INDEX'] = indexType.join(",")

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
        breakOutStocks.push(obj)
        orderRow++;
    }

    allBreakoutStocks = breakOutStocks;
    if (scripts.length > 0 && !auto) {
        generateBreakOutStockTable(breakOutStocks)
    }
}

async function showBreakOutStocks() {

    let html = ''

    html += '<div class="row" id="breakout-trend-container">'
    html += '<div class="col-md-1">'
    html += 'S: <span title=="Sell" class="badge bg-danger" id="ohl-sell">0</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += 'SSLH: <span title="Strong Sell(Lower High)" class="badge bg-danger" id="strong-sell-lower-high">0</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += 'SSOH: <span title="Strong Sell(OH)" class="badge bg-danger" id="strong-sell-ohl">0</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += 'B: <span title=="Buy" class="badge bg-success" id="ohl-buy">0</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += 'SBHH: <span title="Strong Buy(Higher High)" class="badge bg-success" id="strong-buy-higher-higher">0</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += 'SBOL: <span title=="Strong Buy(OL)" class="badge bg-success" id="strong-buy-ol">0</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<span class="badge bg-success" id="total-buy">0</span>'
    html += '/'
    html += '<span class="badge bg-danger" id="total-sell">0</span>'
    html += '</div>'


    html += '<div class="col-md-2" >'
    html += 'All: <span class="badge bg-success" style="margin-right: .2rem;" id="all-bull-trend">' + 0 + ' %</span><span class="badge bg-danger" style="margin-right: .2rem;" id="all-bear-trend">' + 0 + ' %</span>'
    html += '</div>'

    html += '<div class="col-md-2" >'
    html += 'Nifty: <span class="badge bg-success" style="margin-right: .2rem;" id="nifty-bull-trend">' + 0 + ' %</span><span class="badge bg-danger" style="margin-right: .2rem;" id="nifty-bear-trend">' + 0 + ' %</span>'
    html += '</div>'

    html += '<div class="col-md-2" >'
    html += 'Bank: <span class="badge bg-success" style="margin-right: .2rem;" id="bank-bull-trend">' + 0 + ' %</span><span class="badge bg-danger" style="margin-right: .2rem;" id="bank-bear-trend">' + 0 + ' %</span>'
    html += '</div>'
    html += '</div>'
    html += '<div class="px-3 py-2 border-bottom mb-1"></div>'
    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table  class="table" id="breakout-stock-list-table" style="width: 100%;display: none;">'

    html += '<thead>'
    html += '<tr>'
    html += '<th>SYMBOL</th>'
    html += '<th>CH%</th>'
    html += '<th  title="Price Moved">M</th>'
    html += '<th  title="Trend">T</th>'
    html += '<th  title="OHL Trend">OHL</th>'
    html += '<th>B %</th>'
    html += '<th>S %</th>'
    html += '<th  title="Volume">V</th>'
    html += '<th>LTP</th>'
    html += '<th>BREAKOUT</th>'
    html += '<th>B_T</th>'
    html += '<th>B_F</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'
    html += '</div>'
    html += '</div>'

    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'

    let title = ''
    title += '<div class="row">'
    title += '<div class="col-md-2">'
    title += 'Breakout Scanner'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '</div>'
    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span id="breakout-last-refresh-time">Last @ 00:00:00</span>'
    title += '</div>'
    title += '</div>'

    showPopUpWindow('breakout-scanner', html, "Breakout Scanner", 950, 550);
    var divId = "popup-custom-style-breakout-scanner";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    commonBreakOutLogic(false)
}


let breakOutScannerTable = null
function generateBreakOutStockTable(data) {
    jQ("#breakout-stock-list-table").show()
    breakOutScannerTable = jQ('#breakout-stock-list-table').DataTable({
        fixedColumns: {
            start: 1,
            end: 1
        },
        "processing": true,
        "order": [[0, 'asc']],
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

                    html += '<span  title="Track for next day" style="font-size:xx-small;position:absolute;right:4rem;" data-price="' + row['LTP'] + '" data-index="' + 0 + '" data-trend="' + row['TREND'] + '" data-name="' + symbol + '" class="bg-info-color track-next-day">'
                    html += 'T'
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
            { "data": "TREND" },
            {
                "data": "OHL_TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data) {
                        let ohl = ''

                        if (data[2] == "Strong Sell(OH)") {
                            ohl = "SSOH"
                        }

                        if (data[2] == "Strong Buy(OL)") {
                            ohl = "SBOL"
                        }

                        if (data[2] == "Strong Sell(Lower High)") {
                            ohl = "SSLH"
                        }

                        if (data[2] == "Strong Buy(Higher High)") {
                            ohl = "SBHH"
                        }

                        if (data[2] == "Buy") {
                            ohl = "B"
                        }

                        if (data[2] == "Sell") {
                            ohl = "S"
                        }

                        if (data[2].includes("Sell")) {
                            html += '<span title="' + data[2] + '" class=" bg-danger-color">' + ohl + '</span>'
                        } else {
                            html += '<span title="' + data[2] + '" class=" bg-success-color">' + ohl + '</span>'
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
            { "data": "LTP" },
            {
                "data": "BREAKOUT",
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


                    html += '<span class="' + isOneDayAgoClass + '">' + row.isOneDayAgo.toString().toUpperCase().charAt(0) + '</span>'
                    html += '<span class="' + isTwoDayAgoClass + '">' + row.isTwoDayAgo.toString().toUpperCase().charAt(0) + '</span>'
                    html += '<span class="' + isThreeDayAgoClass + '">' + row.isThreeDayAgo.toString().toUpperCase().charAt(0) + '</span>'
                    html += '<span class="' + isFourDayAgoClass + '">' + row.isFourDayAgo.toString().toUpperCase().charAt(0) + '</span>'
                    html += '<span class="' + isFiveDayAgoClass + '">' + row.isFiveDayAgo.toString().toUpperCase().charAt(0) + '</span>'
                    html += '<span class="' + isSixDayAgoClass + '">' + row.isSixDayAgo.toString().toUpperCase().charAt(0) + '</span>'
                    html += '<span class="' + isSevenDayAgoClass + '">' + row.isSevenDayAgo.toString().toUpperCase().charAt(0) + '</span>'
                    html += '<span class="' + isDayCloseGreaterDayOpenClass + '">' + row.isDayCloseGreaterDayOpen.toString().toUpperCase().charAt(0) + '</span>'
                    html += '<span class="' + isDayCloseGreaterOneDayAgoCloseClass + '">' + row.isDayCloseGreaterOneDayAgoClose.toString().toUpperCase().charAt(0) + '</span>'
                    html += '<span class="' + isWeeklyCloseGreaterWeeklyOpenClass + '">' + row.isWeeklyCloseGreaterWeeklyOpen.toString().toUpperCase().charAt(0) + '</span>'
                    html += '<span class="' + isMonthlyCloseGreaterMonthlyOpenClass + '">' + row.isMonthlyCloseGreaterMonthlyOpen.toString().toUpperCase().charAt(0) + '</span>'
                    html += '<span class="' + oneDayAgoVolumeGreaterClass + '">' + row.oneDayAgoVolumeGreater.toString().toUpperCase().charAt(0) + '</span>'

                    return html
                }
            },
            {
                "data": "BREAKOUT",
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
                "data": "BREAKOUT",
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
        ],
        "fnInitComplete": function (oSettings, json) {
            showBreakoutTrendCount()
        },
        "fnRowCallback": function (nRow, aData, iDisplayIndex, iDisplayIndexFull) {
            for (var i in aData) {

            }
        }
    });
    jQ("#breakout-last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
}

function showBreakoutTrendCount() {
    let asoCount = 0;
    let bsoCount = 0;
    let allCount = 0;
    jQ.each(allBreakoutStocks, function (index, item) {
        if (jQ.inArray("ASO", item['TREND']) != -1) {
            asoCount++;
        }
        if (jQ.inArray("BSO", item['TREND']) != -1) {
            bsoCount++;
        }
        allCount++;
    });

    jQ("#breakout-stock-list-table_wrapper .dt-buttons").append('<button data-trend="all" class="dt-button trend-filter bg-info" type="button"><span>ALL(' + allCount + ')</span></button>')
    jQ("#breakout-stock-list-table_wrapper .dt-buttons").append('<button data-trend="bso" class="dt-button trend-filter bg-danger" type="button"><span>BSO (' + bsoCount + ')</span></button>')
    jQ("#breakout-stock-list-table_wrapper .dt-buttons").append('<button data-trend="aso" class="dt-button trend-filter bg-success" type="button"><span>ASO(' + asoCount + ')</span></button>')
    jQ("#breakout-stock-list-table_wrapper .dt-buttons").append('<button style="margin-right: .2rem;" data-trend="n50" class="dt-button trend-filter  bg-info" type="button"><span>N50</span></button>')
    jQ("#breakout-stock-list-table_wrapper .dt-buttons").append('<button data-trend="bank" class="dt-button trend-filter  bg-info" type="button"><span>BN</span></button>')
    jQ("#breakout-stock-list-table_wrapper .dt-buttons").append('<button data-trend="trending" class="dt-button trend-filter  bg-info" type="button"><span>TRENDING</span></button>')
    jQ("#breakout-stock-list-table_wrapper .dt-buttons").append('<button data-trend="master" class="dt-button trend-filter  bg-info" type="button"><span>MASTER</span></button>')

    jQ("#breakout-stock-list-table_wrapper .dt-buttons").append('<button data-trend="valid" class="dt-button trend-filter  bg-info" type="button"><span>VALID</span></button>')
    jQ("#breakout-stock-list-table_wrapper .dt-buttons").append('<button data-trend="breakout" class="dt-button trend-filter  bg-info" type="button"><span>BREAKOUT</span></button>')

    jQ("#breakout-stock-list-table_wrapper .dt-buttons").append('<button data-trend="track" class="dt-button trend-filter  bg-info" type="button"><span>TRACK</span></button>')
   

    jQ("#breakout-stock-list-table_wrapper .dt-buttons").append('<button style="margin-right: .2rem;" class="dt-button analyse-breakout-instrument" type="button"><span>Analyze</span></button>')
    jQ("#breakout-stock-list-table_wrapper .dt-buttons").append('<span style="margin-right: .2rem;" id="processing-trend"></span>')
    jQ("#breakout-stock-list-table_wrapper .dt-buttons").append('<span style="margin-right: .2rem;" id="last-refresh-trend"></span>')


}

jQ(document).on("click", "#breakout-stock-list-table_wrapper .trend-filter", function (e) {
    let name = jQ(this).attr("data-trend");
    breakOutStocks = []
    let VALID_STOCKS = getAllValidStocks();
    let BREAKOUT_STOCKS = getAllValidBreakOutStocks();
    let TRACKING_SCRIPTS = getAllTrackingStocks();
    jQ.each(allBreakoutStocks, function (index, item) {
        if (name == "aso") {
            if (jQ.inArray("ASO", item['TREND']) != -1) {
                breakOutStocks.push(item)
            }
        } else if (name == "bso") {
            if (jQ.inArray("BSO", item['TREND']) != -1) {
                breakOutStocks.push(item)
            }
        } else if (name == "n50") {
            if (jQ.inArray(item['TRADINGSYMBOL'], NIFTY_50_LIST) != -1) {
                breakOutStocks.push(item)
            }
        } else if (name == "bank") {
            if (jQ.inArray(item['TRADINGSYMBOL'], NIFTY_BANK_LIST) != -1) {
                breakOutStocks.push(item)
            }
        } else if (name == "master") {
            if (jQ.inArray(item['TRADINGSYMBOL'], REFRESH_LIST) != -1) {
                breakOutStocks.push(item)
            }
        } else if (name == "valid") {
            if (jQ.inArray(item['TRADINGSYMBOL'], VALID_STOCKS) != -1) {
                breakOutStocks.push(item)
            }
        } else if (name == "breakout") {
            if (jQ.inArray(item['TRADINGSYMBOL'], BREAKOUT_STOCKS) != -1) {
                breakOutStocks.push(item)
            }
        }else if (name == "track") {
            if (jQ.inArray(item['TRADINGSYMBOL'], TRACKING_SCRIPTS) != -1) {
                breakOutStocks.push(item)
            }
        } else if (name == "trending") {
            if (jQ.inArray("ASO", item['TREND']) != -1) {
                breakOutStocks.push(item)
            }
            if (jQ.inArray("BSO", item['TREND']) != -1) {
                breakOutStocks.push(item)
            }
        } else {
            breakOutStocks.push(item)
        }
    });
    generateBreakOutStockTable(breakOutStocks)
});

jQ(document).on("click", ".analyse-breakout-instrument", function (e) {
    e.preventDefault();
    jQ("#breakout-stock-list-table_wrapper #processing-trend").html("Processing.... ");
    callAnalyseBreakout(false)
});

async function callAnalyseBreakout(auto) {
    let count = 0;
    let scriptsCount = breakOutStocks.length
    let scriptData = generateTrends()
    for (let i = 0; i < breakOutStocks.length; i++) {
        try {
            if (!auto) {
                jQ("#breakout-stock-list-table_wrapper #processing-trend").html("Processing.... " + (i + 1) + "/" + scriptsCount);
            } else {
                jQ("#processing-breakout-scanner").html("Processing.... " + (i + 1) + "/" + scriptsCount);
            }

            let name = breakOutStocks[i]['TRADINGSYMBOL']
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
            let dayOpen = parseFloat(scriptData[name]['price']);
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

            let previousClose = parseFloat(scriptData[name].prevPrice);
            breakOutStocks[rowId]['LTP'] = scriptData[name]['ltp'];
            let res = calculateOHLBuySell(dayOpen, dayHigh, dayLow, scriptData[name]['ltp'], previousClose);
            console.log(scriptData[name])
            breakOutStocks[rowId]['OHL_TREND'] = res;


            let last = candles[candles.length - 1];
            breakOutStocks[rowId]['VOLUME'] = last.volume

            breakOutStocks[rowId]['LTP'] = scriptData[name]['ltp']


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


            breakOutStocks[rowId]['isOneDayAgo'] = isOneDayAgo;
            breakOutStocks[rowId]['isTwoDayAgo'] = isTwoDayAgo;
            breakOutStocks[rowId]['isThreeDayAgo'] = isThreeDayAgo;
            breakOutStocks[rowId]['isFourDayAgo'] = isFourDayAgo;
            breakOutStocks[rowId]['isFiveDayAgo'] = isFiveDayAgo;
            breakOutStocks[rowId]['isSixDayAgo'] = isSixDayAgo;
            breakOutStocks[rowId]['isSevenDayAgo'] = isSevenDayAgo;
            breakOutStocks[rowId]['isDayCloseGreaterDayOpen'] = isDayCloseGreaterDayOpen;
            breakOutStocks[rowId]['isDayCloseGreaterOneDayAgoClose'] = isDayCloseGreaterOneDayAgoClose;
            breakOutStocks[rowId]['isWeeklyCloseGreaterWeeklyOpen'] = isWeeklyCloseGreaterWeeklyOpen;
            breakOutStocks[rowId]['isMonthlyCloseGreaterMonthlyOpen'] = isMonthlyCloseGreaterMonthlyOpen;
            breakOutStocks[rowId]['oneDayAgoVolumeGreater'] = oneDayAgoVolumeGreater;

            if (!auto) {
                updateBreakouTable(rowId)
            }
            showAlertForBreakout(breakOutStocks[rowId], auto)
        } catch (err) {
            console.log("Error while analyzing stock : " + breakOutStocks[i]['TRADINGSYMBOL'])
            console.log(err)
        }
    }
    if (!auto) {
        showMarketSentiment()
    }
    jQ("#breakout-stock-list-table_wrapper  #processing-trend").html("Done...");
    jQ("#breakout-stock-list-table_wrapper  #last-refresh-trend").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
}

function showMarketSentiment() {
    let allBull = 0;
    let allBear = 0;
    let niftyBull = 0;
    let niftyBear = 0;
    let bankBull = 0;
    let bankBear = 0;

    let sell = 0;
    let strongSellOH = 0
    let strongSellLowerHigh = 0
    let buy = 0;
    let strongBuyOL = 0;
    let strongBuyHigherHigh = 0;

    jQ.each(breakOutStocks, function (index, row) {
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


        if (row.OHL_TREND[2] == "Strong Sell(OH)") {
            strongSellOH++;
        }

        if (row.OHL_TREND[2] == "Strong Buy(OL)") {
            strongBuyOL++;
        }

        if (row.OHL_TREND[2] == "Strong Sell(Lower High)") {
            strongSellLowerHigh++;
        }

        if (row.OHL_TREND[2] == "Strong Buy(Higher High)") {
            strongBuyHigherHigh++;
        }

        if (row.OHL_TREND[2] == "Buy") {
            buy++;
        }

        if (row.OHL_TREND[2] == "Sell") {
            sell++;
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

    jQ("#ohl-sell").html(sell);
    jQ("#strong-sell-ohl").html(strongSellOH);
    jQ("#strong-sell-lower-high").html(strongSellLowerHigh);
    jQ("#ohl-buy").html(buy);
    jQ("#strong-buy-higher-higher").html(strongBuyHigherHigh);
    jQ("#strong-buy-ol").html(strongBuyOL);
    let totalBuy = buy + strongBuyHigherHigh + strongBuyOL
    let totalSell = sell + strongSellOH + strongSellLowerHigh
    jQ("#total-buy").html(totalBuy)
    jQ("#total-sell").html(totalSell)





}

function showAlertForBreakout(row, auto) {
    let link = '<a target="_blank" href="https://kite.zerodha.com/chart/ext/tvc/' + 'NSE' + '/' + row['TRADINGSYMBOL'] + '/' + instrumentTokens[row['TRADINGSYMBOL']] + '"> '
    link += row['TRADINGSYMBOL']
    link += '</a>'
    if (
        row.isOneDayAgo
        && row.isTwoDayAgo
        && row.isThreeDayAgo
        && row.isFourDayAgo
        && row.isFiveDayAgo
        && row.isSixDayAgo
        && row.isSevenDayAgo
        && row.isDayCloseGreaterDayOpen
        && row.isDayCloseGreaterOneDayAgoClose
        && row.isWeeklyCloseGreaterWeeklyOpen
        && row.isMonthlyCloseGreaterMonthlyOpen
        && row.oneDayAgoVolumeGreater
    ) {
        let validBreakouts = JSON.parse(localStorage.getItem("VALID_BREAKOUT"));

        if (!validBreakouts) {
            validBreakouts = []
        }
        let html = ''
        html += '<div style="text-align:center;">'
        html += 'BREAKOUT : '
        html += '<span data-price="' + row['LTP'] + '" data-index="' + 0 + '" data-trend="' + row['TREND'] + '" data-name="' + row['TRADINGSYMBOL'] + '" class="bg-info-color show-chart">'
        html += row['TRADINGSYMBOL']
        html += '</span>'
        html += '</div>'
        callSackBar(html);
        if (ENABLE_SOUND && auto) {
            let alrtSound = new Audio(alertSound);
            alrtSound.play();
        }
        if (jQ.inArray(row['TRADINGSYMBOL'], validBreakouts) === -1) {
            validBreakouts.push(row['TRADINGSYMBOL'])
            localStorage.setItem("VALID_BREAKOUT", JSON.stringify(validBreakouts));
        }
    }
}


function updateBreakouTable(rowId) {
    jQ('#breakout-stock-list-table').DataTable().row(rowId).data(breakOutStocks[rowId]).draw(false);
}