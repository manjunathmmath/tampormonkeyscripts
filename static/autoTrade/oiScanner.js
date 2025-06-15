jQ(document).on("click", ".show-option-change", function () {
    let name = jQ(this).attr("data-name");
    showOIScanner(name);
})


jQ(document).on("click", "#show-oi-scanner", function () {
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
    html += '</div>'

    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'

    html += '<div class="row">'
    html += '<div class="col-md-3"></div>'
    html += '<div class="col-md-6">'
    html += '<table  class="" id="quick-oi-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>OI</th>'
    html += '<th>CH.OI</th>'
    html += '<th>STRIKE</th>'
    html += '<th>CH.OI</th>'
    html += '<th>OI</th>'
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
    title += 'OI Scanner'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '<a  id="oi-scanner-start-auto-refresh">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
    title += '</div>'
    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span id="oi-last-refresh-time">Last @ 00:00:00</span>'
    title += '</div>'
    title += '</div>'

    showPopUpWindow('oi-scanner', html, "OI Scanner", 800, 550);

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

jQ(document).on("change", "#oi-scanner-start-auto-refresh", function (e) {
    jQ("#instruments").trigger("change")
});


jQ(document).on("change", "#instruments", function (e) {
    clearInterval(stockScannerTimerInstance)
    let instrument = jQ("#instruments option:selected").val()
    showOI(instrument)
});


let strikToShow = 1
let strikeData = []
let selectedStrike = []
async function showOI(instrument) {

    strikeData = []
    selectedStrike = []

    let currentTime = moment().format("DD-MM-YYYY")
    let info;
    if (instrument == "NIFTY") {
        info = infoMap["NIFTY 50"]
    } else {
        info = infoMap[instrument]
    }

    let atmStrike = 0;
    jQ.each(OPTION_STRIKE_LIST, function (index, item) {
        let date = moment(item.expiry, 'DD-MM-YYYY').format("DD-MM-YYYY")
        if (item.name == instrument && date >= currentTime) {
            selectedStrike.push(item)
        }
    });

    let currentPrice = parseFloat(info['currentPrice'])
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
    console.log(strikeData)

    showOIDetails()

}

async function showOIDetails() {
    let strikeMap = {}
    for (let i = 0; i < strikeData.length; i++) {
        let CE = ''
        let PE = ''

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

    let tableData = []
    jQ.each(strikeMap, function (index, item) {
        let currDataCE = item['currDataCE']['data']['candles']
        let currDataPE = item['currDataPE']['data']['candles']

        let prevDataCE = item['prevDataCE']['data']['candles']
        let prevDataPE = item['prevDataPE']['data']['candles']

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
        obj['CE'] = item.CE.tradingsymbol
        obj['PE'] = item.PE.tradingsymbol
        obj['CE_TOKEN'] = item.CE.instrument_token
        obj['PE_TOKEN'] = item.PE.instrument_token
        tableData.push(obj)
    });

    generateOITable(tableData)

    jQ("#oi-last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
}

function generateOITable(data) {
    let link = "https://kite.zerodha.com/chart/ext/tvc/NFO-OPT/##INSTRUMENT##/##TOKEN##"
    jQ("#quick-oi-list-table").show()
    quickBsoScannerTable = jQ('#quick-oi-list-table').DataTable({
        "processing": true,
        "order": [],
        "pageLength": 50,
        "bPaginate": false,
        "data": data,
        "bDestroy": true,
        "scrollX": true,
        "scrollY": "500px",
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
            { "data": "CHG_OI_CE" },
            {
                "data": "STRIKE",
                render: function (data, type, row, meta) {
                    let html = ''
                    if (row.ATM_STRIKE) {
                        html += '<span class="badge bg-success">' + data + '</span>'
                    } else {
                        html += data
                    }
                    html += '<div>'
                    html += '<a href="' + link.replaceAll("##INSTRUMENT##", row.CE).replaceAll("##TOKEN##", row.CE_TOKEN) + '"  target="_blank" style="font-size:xx-small;margin-right:.1rem;display:block;">'
                    html += row.CE
                    html += '</a>'
                    html += '<a href="' + link.replaceAll("##INSTRUMENT##", row.PE).replaceAll("##TOKEN##", row.PE_TOKEN) + '" target="_blank" style="font-size:xx-small;display:block;">'
                    html += row.PE
                    html += '</a>'
                    html += '</div>'
                    return html
                }
            },
            { "data": "CHG_OI_PE" },
            { "data": "OI_PE" },

        ],
        "fnInitComplete": function (oSettings, json) {
        }
    });
}

