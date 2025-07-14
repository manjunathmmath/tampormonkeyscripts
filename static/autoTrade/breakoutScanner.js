
async function autoBreakOutScanner() {

    if (!ENABLE_BREAKOUT_SCANNER) {
        console.log("-------------------[SCANNER DISABLED]------------------");
        return
    }

    let currentTime = moment().format("HH:mm")
    let checkTime = moment(PREVIOUS_DAY_DATE + " 09:20:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")
    let endTime = moment(PREVIOUS_DAY_DATE + " 15:10:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")

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
    callAnalyseBreakout(true);
}

jQ(document).on("click", "#show-breakout-intruments", function () {
    showBreakOutStocks();
});

let breakOutStocks = []
function commonBreakOutLogic(auto) {
    breakOutStocks = [];
    let instru = [];
    let scripts = []
    let checkInstr = []
    let orderRow = 1;
    jQ.each(instrumentsMap, function (index, item) {
        if (jQ.inArray(index, checkInstr) === -1) {
            if (index == "NIFTY 50" || index == "NIFTY BANK" || index == "RELIANCE" || index == "HDFCBANK") {
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
        scripts.push(obj)
    }

    let validIntruments = JSON.parse(localStorage.getItem("VALID_INSTRUMENTS"));
    jQ.each(validIntruments, function (index, item) {
        if (jQ.inArray(index, checkInstr) === -1) {
            scripts.push(item)
            checkInstr.push(index)
        }
    })


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
        obj['ORDER'] = orderRow;
        obj['VOLUME'] = ''
        obj['OHL_TREND'] = ''

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
        breakOutStocks.push(obj)
        orderRow++;
    }

    if (scripts.length > 0 && !auto) {
        generateBreakOutStockTable(breakOutStocks)
    }
}



async function showBreakOutStocks() {

    let html = ''

    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table  class="table" id="breakout-stock-list-table" style="width: 100%;display: none;">'

    html += '<thead>'
    html += '<tr>'
    html += '<th>O</th>'
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
    title += '<a id="breakout-scanner-start-auto-refresh">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
    title += '</div>'
    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span id="breakout-last-refresh-time">Last @ 00:00:00</span>'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '<span id="processing-breakout"></span>'
    title += '</div>'
    title += '</div>'

    showPopUpWindow('breakout-scanner', html, "Breakout Scanner", 950, 550);
    var divId = "popup-custom-style-breakout-scanner";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    commonBreakOutLogic(false)

}


jQ(document).on("click", "#breakout-scanner-start-auto-refresh", function (e) {
    let temp = breakOutStocks
    jQ.each(temp, function (index, item) {
        let info = infoMap[item['TRADINGSYMBOL']]
        breakOutStocks[index]['LTP'] = info['currentPrice']

        let priceMoved = 0;
        let asoPrice = 0;
        let bsoPrice = 0;

        let aso = parseFloat(breakOutStocks[index]['STRIKEDATA']['ustrikeOne']) - parseFloat(breakOutStocks[index]['PRICE']);
        aso = aso / 5
        asoPrice = parseFloat(breakOutStocks[index]['STRIKEDATA']['ustrikeOne']);

        let bso = parseFloat(breakOutStocks[index]['PRICE']) - parseFloat(breakOutStocks[index]['STRIKEDATA']['bstrikeOne']);
        bso = bso / 5
        bsoPrice = parseFloat(breakOutStocks[index]['STRIKEDATA']['bstrikeOne']);

        if (jQ.inArray("ASO", breakOutStocks[index]['TREND']) != -1) {
            priceMoved = parseFloat(info['currentPrice']) - asoPrice
        }

        if (jQ.inArray("BSO", breakOutStocks[index]['TREND']) != -1) {
            priceMoved = bsoPrice - parseFloat(info['currentPrice'])
        }
        breakOutStocks[index]['PRICE_MOVED'] = parseFloat(priceMoved).toFixed(1)
    });

    generateBreakOutStockTable(breakOutStocks)
});

let breakOutScannerTable = null
function generateBreakOutStockTable(data) {
    jQ("#breakout-stock-list-table").show()
    breakOutScannerTable = jQ('#breakout-stock-list-table').DataTable({
        "processing": true,
        "order": [[0, 'asc']],
        "pageLength": 50,
        "bPaginate": false,
        "data": data,
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
                "data": "ORDER"
            },
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

                    html += '<span style="font-size:xx-small;display:block;" data-price="' + row['LTP'] + '" data-index="' + 0 + '" data-trend="' + row['TREND'] + '" data-name="' + row['TRADINGSYMBOL'] + '" class="bg-info-color show-chart">'
                    html += 'Chart'
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
                "data": "",
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
        ],
        "fnInitComplete": function (oSettings, json) {
            let asoCount = 0;
            let bsoCount = 0;
            let allCount = 0;
            jQ.each(data, function (index, item) {
                if (jQ.inArray("ASO", item['TREND']) != -1) {
                    asoCount++;
                }
                if (jQ.inArray("BSO", item['TREND']) != -1) {
                    bsoCount++;
                }
                allCount++;

            });
            jQ(".dt-buttons").append('<button style="margin-right: .2rem;" class="dt-button analyse-breakout-instrument" type="button"><span>Analyze</span></button>')

        },
        "fnRowCallback": function (nRow, aData, iDisplayIndex, iDisplayIndexFull) {
            for (var i in aData) {

            }
        }
    });
    jQ("#breakout-last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
}

jQ(document).on("click", ".analyse-breakout-instrument", function () {
    jQ("#processing-breakout").html("Processing.... ");
    callAnalyseBreakout(false)
});

async function callAnalyseBreakout(auto) {
    let count = 0;
    let scriptsCount = breakOutStocks.length
    for (let i = 0; i < breakOutStocks.length; i++) {
        try {
            if (!auto) {
                jQ("#processing-breakout").html("Processing.... " + (i + 1) + "/" + scriptsCount);
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
            breakOutStocks[rowId]['LTP'] = infoMap[name]['currentPrice']
            let res = calculateOHLBuySell(dayOpen, dayHigh, dayLow, infoMap[name]['currentPrice'], previousClose);
            breakOutStocks[rowId]['OHL_TREND'] = res;


            let last = candles[candles.length - 1];
            breakOutStocks[rowId]['VOLUME'] = last.volume

            let info = infoMap[name]
            breakOutStocks[rowId]['LTP'] = info['currentPrice']


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
            showAlertForBreakout(breakOutStocks[rowId])
        } catch (err) {
            console.log("Error while analyzing stock : " + breakOutStocks[i]['TRADINGSYMBOL'])
            console.log(err)
        }
    }
    jQ("#processing-breakoutt").html("Done...");
}

function showAlertForBreakout(row) {
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
        let html = ''
        html += '<div style="text-align:center;">'
        html += 'BREAKOUT : '
        html += '<span data-price="' + row['LTP'] + '" data-index="' + 0 + '" data-trend="' + row['TREND'] + '" data-name="' + row['TRADINGSYMBOL'] + '" class="bg-info-color show-chart">'
        html += row['TRADINGSYMBOL']
        html += '</span>'
        html += '</div>'
        callSackBar(html);
        let alrtSound = new Audio(alertSound);
        alrtSound.play();
    }
}


function updateBreakouTable(rowId) {
    jQ('#breakout-stock-list-table').DataTable().row(rowId).data(breakOutStocks[rowId]).draw(false);
}