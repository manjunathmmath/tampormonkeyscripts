jQ(document).on("click", "#show-ohl-opening-trend", function () {
    showOHLOpeningTrendScanner();
})
async function showOHLOpeningTrendScanner() {
    let html = ''

    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row">'


    html += '<div class="col-md-12">'
    html += '<table  class="" id="ohl-trend-scanner-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>INSTRUMENT</th>'
    html += '<th>OHL</th>'
    html += '<th>ACTION</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'
    html += '</div>'

    html += '</div>'


    let title = ''
    title += '<div class="row">'
    title += '<div class="col-md-2">'
    title += 'OHL Opening Trend Scanner'
    title += '</div>'
    title += '</div>'


    showPopUpWindow('ohl-openin-trend-scanner', html, "OHL Opening Trend Scanner", 950, 550);
    var divId = "popup-custom-style-ohl-openin-trend-scanner";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    let allInstruments = FO_LIST;
    allInstruments.push('NIFTY 50')
    allInstruments.push('NIFTY BANK')
    generateOHLOpeningTrendDataTable(allInstruments);
}

async function generateOHLOpeningTrendDataTable(stockList) {
    let data = []
    let instru = []
    jQ.each(instrumentsMap, function (index, item) {
        instru.push(instrumentsMap[index])
    });

    for (let i = 0; i < instru.length; i++) {
        let name = instru[i].name
        if (jQ.inArray(name, stockList) != -1) {
            try {
                let obj = {}
                obj['TRADINGSYMBOL'] = name;
                obj['CLOSE'] = instru[i]['prevPrice'];
                obj['PRICE'] = instru[i]['price'];

                let tempName = name.replaceAll(" ", "-")
                tempName = tempName.replaceAll("&", "-")
                console.log("Data for : " + name)
                await savePreviousStockQuote(name, instrumentTokens[name])
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
                let previousClose = parseFloat(instrumentsMap[name].prevPrice);
                let dayOpen = parseFloat(instrumentsMap[name]['price']);
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

                let temDayHigh = dayHigh
                let temDayLow = dayLow
                if (dayOpen > dayHigh) {
                    temDayHigh = dayOpen
                }

                if (dayOpen < dayLow) {
                    temDayLow = dayOpen
                }

                let res = calculateOHLBuySell(dayOpen, temDayHigh, temDayLow, instrumentsMap[name]['price'], previousClose);
                obj['OHL_TREND'] = res
                obj['TREND'] = ['NA']
                data.push(obj)

            } catch (err) {
                console.log(err)
                console.log("Error : " + name)
            }
        }

    }

    jQ("#ohl-trend-scanner-list-table").show()
    jQ('#ohl-trend-scanner-list-table').DataTable({
        "processing": true,
        "order": [[0, "asc"]],
        "pageLength": 50,
        "bPaginate": false,
        "data": data,
        "bDestroy": true,
        "scrollX": true,
        "scrollY": "500px",
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
                    html += data;
                    html += '</a>'
                    return html;
                }
            },
            {
                "data": "OHL_TREND",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (data) {
                        if (data[2].includes("Sell")) {
                            html += '<span class="badge bg-danger">' + data[2] + '</span>'
                        } else {
                            html += '<span class="badge bg-success">' + data[2] + '</span>'
                        }
                        html += '<span class="badge bg-info">' + ' [B:' + parseFloat(data[0]).toFixed(2) + ' S:' + parseFloat(data[1]).toFixed(2) + ']' + '</span>'
                    }

                    return html
                }
            },
            {
                "data": "ACTIONS",
                render: function (data, type, row, meta) {
                    var html = ""
                    let index = 0;
                    html += '<div>'
                    if (!row['TREND']) {
                        row['TREND'] = []
                    }
                    html += '<span data-price="' + row['LTP'] + '" data-index="' + index + '" data-trend="' + row['TREND'].join(",") + '" data-name="' + row['TRADINGSYMBOL'] + '" class="badge bg-info show-chart">'
                    html += 'Chart'
                    html += '</span>'
                    html += '</div>'
                    return html
                }
            },
        ],
        "fnInitComplete": function (oSettings, json) {
            let SSOH = 0;
            let SBOL = 0;
            let SSLH = 0;
            let SBHH = 0;
            let B = 0;
            let S = 0;
            jQ.each(data, function (index, item) {
                ohlTrend = item['OHL_TREND']
                if (ohlTrend[2] == "Strong Sell(OH)") {
                    SSOH++
                }

                if (ohlTrend[2] == "Strong Buy(OL)") {
                    SBOL++
                }

                if (ohlTrend[2] == "Strong Sell(Lower High)") {
                    SSLH++
                }

                if (ohlTrend[2] == "Strong Buy(Higher High)") {
                    SBHH++
                }

                if (ohlTrend[2] == "Buy") {
                    B++
                }

                if (ohlTrend[2] == "Sell") {
                    S++
                }
            });

            jQ(".dt-buttons").append('<button title="Strong Sell(OH)" data-name="SSOH"  style="margin-right: .2rem;" class="dt-button badge-danger" type="button"><span>SSOH(' + SSOH + ')</span></button>')
            jQ(".dt-buttons").append('<button title="Strong Buy(OL)" data-name="SBOL"  style="margin-right: .2rem;" class="dt-button badge-success" type="button"><span>SBOL(' + SBOL + ')</span></button>')
            jQ(".dt-buttons").append('<button title="Strong Sell(Lower High)" data-name="SSLH"  style="margin-right: .2rem;" class="dt-button badge-danger" type="button"><span>SSLH(' + SSLH + ')</span></button>')
            jQ(".dt-buttons").append('<button title="Strong Buy(Higher High)" data-name="SBHH"  style="margin-right: .2rem;" class="dt-button badge-success" type="button"><span>SBHH(' + SBHH + ')</span></button>')
            jQ(".dt-buttons").append('<button title="Buy" data-name="B"  style="margin-right: .2rem;" class="dt-button badge-success" type="button"><span>B(' + B + ')</span></button>')
            jQ(".dt-buttons").append('<button title="Sell" data-name=S"  style="margin-right: .2rem;" class="dt-button badge-danger" type="button"><span>S(' + S + ')</span></button>')
            jQ(".dt-buttons").append('<button data-name=N"  style="margin-right: .2rem;" class="dt-button badge-info filter-nifty" type="button"><span>N</span></button>')

        },
    });
}

jQ(document).on("click", ".filter-nifty", function () {
    generateOHLOpeningTrendDataTable(NIFTY_50_LIST);
})



