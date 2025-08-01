jQ(document).on("click", ".show-option-change", function (e) {
    e.preventDefault();
    let name = jQ(this).attr("data-name");
    showOIScanner(name);
})


jQ(document).on("click", "#show-oi-scanner", function (e) {
    e.preventDefault();
    showOIScanner();
})

let oiTimerInstance = null;
async function showOIScanner(name) {
    let html = ''
    html += '<div class="row">'
    html += '<div class="col-md-5">'
    html += '</div>'
    html += '<div class="col-md-2">'
    html += '<select id="instruments" class="form-control form-control-sm">'
    html += '</select>'
    html += '</div>'
    html += '<div class="col-md-2">'
    html += '<span id="current-price">'
    html += '</span>'
    html += '</div>'
    html += '<div class="col-md-2">'
    html += 'PCR : <span id="current-pcr">'
    html += '</span>'
    html += '</div>'
    html += '</div>'

    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'

    html += '<div class="row">'
    html += '<div class="col-md-1"></div>'
    html += '<div class="col-md-10">'
    html += '<table  class="" id="quick-oi-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>OI</th>'
    html += '<th>CH.OI</th>'
    html += '<th style="text-align:center;">STRIKE</th>'
    html += '<th>CH.OI</th>'
    html += '<th>OI</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'
    html += '</div>'
    html += '</div>'
    html += '<div class="col-md-1"></div>'

    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'


    html += '<div class="row" id="oi-chart-conatiner">'
    html += '</div>'


    let title = ''
    title += '<div class="row">'
    title += '<div class="col-md-2">'
    title += 'OI Scanner'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '<a  id="oi-scanner-start-auto-refresh">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
    title += '</div>'
    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span id="oi-last-refresh-time">Last @ 00:00:00</span>'
    title += '</div>'
    title += '</div>'

    showPopUpWindow('oi-scanner', html, "OI Scanner", 950, 550);

    var divId = "popup-custom-style-oi-scanner";

    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);

    jQ("." + divId).on("close.popupwindow", function () {
        if (oiTimerInstance) {
            clearInterval(oiTimerInstance)
        }
    });

    clearInterval(oiTimerInstance)
    fillInstruments(name)
}

function fillInstruments(name) {
    var select = jQ("#instruments");
    var htmlMarkup = "";
    htmlMarkup += '<option value="">Choose</option>'
    let EXTRA_LIST = FO_LIST
    EXTRA_LIST.push("NIFTY")
    EXTRA_LIST.push("BANKNIFTY")
    EXTRA_LIST.push("MIDCPNIFTY")
    EXTRA_LIST.push("FINNIFTY")
    EXTRA_LIST.push("SENSEX")
    EXTRA_LIST.push("BANKEX")
    jQ.each(EXTRA_LIST, function (index, item) {
        let selected = ''
        if (name) {
            if (item == name) {
                selected = 'selected'
            }
        } else {
            if (item == "NIFTY") {
                selected = 'selected'
            }
        }
        htmlMarkup += '<option ' + selected + ' value="' + item + '">' + item + '</option>'
    });
    select.html(htmlMarkup);
    jQ("#instruments").trigger("change")
}

jQ(document).on("click", "#oi-scanner-start-auto-refresh", function (e) {
    e.preventDefault()
    jQ("#instruments").trigger("change")
});


jQ(document).on("change", "#instruments", function (e) {
    let instrument = jQ("#instruments option:selected").val()
    showOI(instrument)
});

let strikeData = []
let selectedStrike = []
async function showOI(instrument) {
    let strikToShow = 2
    strikeData = []
    selectedStrike = []

    let name;
    if (instrument == "NIFTY" || instrument == "NIFTY 50") {
        name = "NIFTY 50"
        instrument = "NIFTY"
    } else if (instrument == "BANKNIFTY" || instrument == "NIFTY BANK") {
        name = "NIFTY BANK"
        instrument = "BANKNIFTY"
    } else if (instrument == "FINNIFTY" || instrument == "NIFTY FIN SERVICE") {
        name = "NIFTY FIN SERVICE"
        instrument = "FINNIFTY"
    } else if (instrument == "MIDCPNIFTY" || instrument == "NIFTY MID SELECT") {
        name = "NIFTY MID SELECT"
        instrument = "MIDCPNIFTY"
    } else {
        name = instrument
    }

    let res = generateTrend(name)


    if (instrument.includes("NIFTY")) {
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

    let currentPrice = res['ltp']
    jQ("#current-price").html(currentPrice)
    selectedStrike.sort(function (a, b) { return a.strike - b.strike })
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
    showOIDetails()

}

async function showOIDetails() {
    let strikeMap = {}
    for (let i = 0; i < strikeData.length; i++) {
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

            tableData.push(obj)
        } catch (err) {
            console.log("Error while fetching strike : " + index)
        }

    });

    let pcr = parseFloat(totalPEOI / totalCEOI).toFixed(2);
    let chPcr = parseFloat(chPEOI / chCEOI).toFixed(2);
    let pcrHtml = ''
    let chPcrHtml = ''
    if (pcr < 0.9) {
        pcrHtml += '<span class="badge bg-success">' + pcr + '</span>'
    } else {
        pcrHtml += '<span class="badge bg-danger">' + pcr + '</span>'
    }

    if (chPcr < 0.9) {
        chPcrHtml += '<span class="badge bg-success">' + chPcr + '</span>'
    } else {
        chPcrHtml += '<span class="badge bg-danger">' + chPcr + '</span>'
    }

    jQ("#current-pcr").html(pcrHtml + ' (' + chPcrHtml + ')')

    generateOITable(tableData)

    generateOICharts(tableData)

    jQ("#oi-last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
}

let quickOIScannerTable = null
function generateOITable(data) {
    let link = "https://kite.zerodha.com/chart/ext/tvc/NFO-OPT/##INSTRUMENT##/##TOKEN##"
    jQ("#quick-oi-list-table").show()
    quickOIScannerTable = jQ('#quick-oi-list-table').DataTable({
        "processing": true,
        "order": [],
        "pageLength": 50,
        "bPaginate": false,
        "data": data,
        "bDestroy": true,
        "columnDefs": [
            {
                "targets": [0, 4],
                "visible": false,
                "searchable": false
            }
        ],
        dom: 't',
        buttons: [
            'copy', 'csv', 'excel', 'pdf', 'print'
        ],
        "columns": [
            { "data": "OI_CE" },
            {
                "data": "CHG_OI_CE",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (parseFloat(data) > parseFloat(row.CHG_OI_PE)) {
                        html += '<span class="badge bg-danger">' + data + '</span>'
                    } else {
                        html += data
                    }
                    return html
                }
            },
            {
                "data": "STRIKE",
                render: function (data, type, row, meta) {
                    let html = '<div style="text-align:center;">'
                    if (row.ATM_STRIKE) {
                        html += '<span class="badge bg-success">' + data + '</span>'
                    } else {
                        html += data
                    }
                    html += '<div>'
                    html += '<a href="' + link.replaceAll("##INSTRUMENT##", row.CE.tradingsymbol).replaceAll("##TOKEN##", row.CE.instrument_token) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;display:block;">'
                    html += row.CE.tradingsymbol
                    html += '</a>'
                    html += '<a href="' + link.replaceAll("##INSTRUMENT##", row.PE.tradingsymbol).replaceAll("##TOKEN##", row.PE.instrument_token) + '" target="_blank" style="font-size:xx-small;display:block;">'
                    html += row.PE.tradingsymbol
                    html += '</a>'
                    html += '</div>'

                    html += '<div id="chart-oi-' + data + '">Chart</div>'

                    html += '</div>'
                    return html
                }
            },
            {
                "data": "CHG_OI_PE",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (parseFloat(data) > parseFloat(row.CHG_OI_CE)) {
                        html += '<span class="badge bg-success">' + data + '</span>'
                    } else {
                        html += data
                    }
                    return html
                }
            },
            { "data": "OI_PE" },

        ],
        "fnInitComplete": function (oSettings, json) {
        }
    });
}

function generateOICharts(data) {
    jQ.each(data, function (index, item) {
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

        jQ("#chart-oi-" + item.STRIKE).insertFusionCharts({
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
    });

}

