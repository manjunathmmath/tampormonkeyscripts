jQ(document).on("click", "#show-oi-viewer", function (e) {
    e.preventDefault();
    showOiViewer();
});

jQ(document).on("click", "#start-auto-refresh-oi-viewer", function (e) {
    e.preventDefault();
    let isEnabled = jQ("#enable-oi-refresh").is(':checked')
    if (!isEnabled) {
        return false
    }
    var that = jQ(this);
    that.attr("disabled", true);
    clearInterval(oiViewerTimerInstance)
    jQ("#trending-stock-list-table_wrapper .analyse-instrument").trigger("click")
});

function startOiViewerRefresh() {
    var display = document.querySelector('#oi-viewer-scanner-refresh-timer-one');
    startTimerOiViewer(REFRESH_TIME, display);
};

let oiViewerTimerInstance = null
function startTimerOiViewer(duration, display) {
    oiViewerTimerInstance = setInterval(function () {
        var d = new Date();
        var s = d.getSeconds();
        var m = d.getMinutes();
        var h = d.getHours();
        display.textContent = ("0" + h).substr(-2) + ":" + ("0" + m).substr(-2) + ":" + ("0" + s).substr(-2);
        let refreshInterval = jQ("#refresh-interval-oi-viewer option:selected").val();
        if (refreshInterval == 1) {
            if (s == 59) {
                jQ("#trending-stock-list-table_wrapper .analyse-instrument").trigger("click")
            }
        }

        if (refreshInterval == 5) {
            let currentMinute = moment().format("mm")
            if ((currentMinute % 5) == 0) {
                jQ("#trending-stock-list-table_wrapper .analyse-instrument").trigger("click")
            }
        }
    }, 1000);
}

function showOiViewer() {

    let html = ''

    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table  class="table display nowrap" id="trending-stock-list-table" style="width: 100%;display: none;">'

    html += '<thead>'
    html += '<tr>'

    html += '<th rowspan="2">SYMBOL</th>'
    html += '<th rowspan="2">TREND</th>'
    html += '<th rowspan="2">LTP</th>'
    html += '<th colspan="5" class="strike-colspan-class itm-col-class">Strike</th>'
    html += '<th colspan="5" class="strike-colspan-class itm-col-class">Strike</th>'
    html += '<th colspan="5" class="strike-colspan-class atm-col-class">Strike</th>'
    html += '<th colspan="5" class="strike-colspan-class otm-col-class">Strike</th>'
    html += '<th colspan="5" class="strike-colspan-class otm-col-class">Strike</th>'
    html += '</tr>'
    html += '<tr>'
    html += '<th class="number-align" >CE</th>'
    html += '<th class="number-align" >CE OBV</th>'
    html += '<th class="text-align">S</th>'
    html += '<th class="number-align" >PE OBV</th>'
    html += '<th class="number-align">PE</th> '

    html += '<th class="number-align" >CE</th>'
    html += '<th class="number-align" >CE OBV</th>'
    html += '<th class="text-align">S</th>'
    html += '<th class="number-align" >PE OBV</th>'
    html += '<th class="number-align">PE</th> '

    html += '<th class="number-align" >CE</th>'
    html += '<th class="number-align" >CE OBV</th>'
    html += '<th class="text-align">S</th>'
    html += '<th class="number-align" >PE OBV</th>'
    html += '<th class="number-align">PE</th> '


    html += '<th class="number-align" >CE</th>'
    html += '<th class="number-align" >CE OBV</th>'
    html += '<th class="text-align">S</th>'
    html += '<th class="number-align" >PE OBV</th>'
    html += '<th class="number-align">PE</th> '

    html += '<th class="number-align" >CE</th>'
    html += '<th class="number-align" >CE OBV</th>'
    html += '<th class="text-align">S</th>'
    html += '<th class="number-align" >PE OBV</th>'
    html += '<th class="number-align">PE</th> '
    html += '<th>PCR</th> '

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
    title += 'OI VIEWER'
    title += '</div>'
    title += '<div class="col-md-1">'
    title += '<select id="api-data-interval" class="form-control form-control-sm">'
    title += '<option value="5minute" selected>5minute</option>'
    title += '<option value="minute">minute</option>'
    title += '</select>'
    title += '</div>'
    title += '<div class="col-md-1">'
    title += '<select id="refresh-interval-oi-viewer" class="form-control form-control-sm">'
    title += '<option value="1">1</option>'
    title += '<option value="5" selected>5</option>'
    title += '</select>'
    title += '</div>'
    title += '<div class="col-md-1">'
    title += '<input type="checkbox" id="enable-oi-refresh">'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '<a  id="start-auto-refresh-oi-viewer">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '<span style="margin-left:.5rem;" id="oi-viewer-scanner-refresh-timer-one">00:00</span>'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '<span id="processing-oi-viewer"></span>'
    title += '</div>'
    title += '</div>'

    showPopUpWindow('oi-viewer-scanner', html, "OI VIEWER", 950, 550);
    var divId = "popup-custom-style-oi-viewer-scanner";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    generateStockDataTable();
}

async function generateStockDataTable() {
    showOiAnalyzer();
}

let trendingStocks = []
let allTrendingStocks = []
async function showOiAnalyzer() {
    trendingStocks = []
    allTrendingStocks = []
    let instru = [];
    let scripts = []
    let checkInstr = []
    let orderRow = 1;
    let scriptData = generateTrends()
    jQ.each(instrumentTokens, function (index, item) {
        if (jQ.inArray(index, checkInstr) === -1) {
            instru.push(index)
            checkInstr.push(index)
        }
    });
    for (let i = 0; i < instru.length; i++) {
        let name = instru[i];
        let obj = {}
        console.log(name)
        obj['TRADINGSYMBOL'] = name;
        obj['CLOSE'] = scriptData[name]['prevPrice'];
        obj['PRICE'] = scriptData[name]['price'];
        obj['PERC'] = scriptData[name]['perc'];
        obj['TREND'] = scriptData[name]['trends'];
        obj['LTP'] = scriptData[name]['ltp'];
        obj['STRIKEDATA'] = scriptData[name]['strikeData'];
        obj['CURRENT_PRICE'] = scriptData[name]['ltp'];
        obj['TREND'] = scriptData[name]['trends'];

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

        scripts.push(obj)
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
        obj['PCR'] = ''

        trendingStocks.push(obj)
        orderRow++;

    }

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
                    let symbol = row['TRADINGSYMBOL']

                    html += '<span title="Track for next day" style="font-size:xx-small;position:absolute;right:4rem;" data-price="' + row['LTP'] + '" data-index="' + 0 + '" data-trend="' + row['TREND'] + '" data-name="' + symbol + '" class="bg-info-color track-next-day">'
                    html += 'T'
                    html += '</span>'

                    return html;
                }
            },
            { "data": "TREND" },
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
                "data": "STRIKE_LOWER_ONE_CE_OBV",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (parseFloat(row['STRIKE_LOWER_ONE_CE_OBV']) > parseFloat(row['STRIKE_LOWER_ONE_PE_OBV'])) {
                        className = " bg-success-color"
                    }
                    html += '<span class="number-align ' + className + '">' + row['STRIKE_LOWER_ONE_CE_OBV'] + '</span>'

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
                "data": "STRIKE_LOWER_ONE_PE_OBV",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (parseFloat(row['STRIKE_LOWER_ONE_PE_OBV']) > parseFloat(row['STRIKE_LOWER_ONE_CE_OBV'])) {
                        className = " bg-danger-color"
                    }
                    html += '<span class="number-align ' + className + '">' + row['STRIKE_LOWER_ONE_PE_OBV'] + '</span>'

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
                "data": "STRIKE_LOWER_TWO_CE_OBV",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (parseFloat(row['STRIKE_LOWER_TWO_CE_OBV']) > parseFloat(row['STRIKE_LOWER_TWO_PE_OBV'])) {
                        className = " bg-success-color"
                    }
                    html += '<span class="number-align ' + className + '">' + row['STRIKE_LOWER_TWO_CE_OBV'] + '</span>'

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
                "data": "STRIKE_LOWER_TWO_PE_OBV",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (parseFloat(row['STRIKE_LOWER_TWO_PE_OBV']) > parseFloat(row['STRIKE_LOWER_TWO_CE_OBV'])) {
                        className = " bg-danger-color"
                    }
                    html += '<span class="number-align ' + className + '">' + row['STRIKE_LOWER_TWO_PE_OBV'] + '</span>'

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
                "data": "STRIKE_ATM_CE_OBV",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (parseFloat(row['STRIKE_ATM_CE_OBV']) > parseFloat(row['STRIKE_ATM_PE_OBV'])) {
                        className = " bg-success-color"
                    }
                    html += '<span class="number-align ' + className + '">' + row['STRIKE_ATM_CE_OBV'] + '</span>'

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
                "data": "STRIKE_ATM_PE_OBV",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (parseFloat(row['STRIKE_ATM_PE_OBV']) > parseFloat(row['STRIKE_ATM_CE_OBV'])) {
                        className = " bg-danger-color"
                    }
                    html += '<span class="number-align ' + className + '">' + row['STRIKE_ATM_PE_OBV'] + '</span>'


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
                "data": "STRIKE_UPPER_ONE_CE_OBV",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (parseFloat(row['STRIKE_UPPER_ONE_CE_OBV']) > parseFloat(row['STRIKE_UPPER_ONE_PE_OBV'])) {
                        className = " bg-success-color"
                    }
                    html += '<span class="number-align ' + className + '">' + row['STRIKE_UPPER_ONE_CE_OBV'] + '</span>'


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
                "data": "STRIKE_UPPER_ONE_PE_OBV",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (parseFloat(row['STRIKE_UPPER_ONE_PE_OBV']) > parseFloat(row['STRIKE_UPPER_ONE_CE_OBV'])) {
                        className = " bg-danger-color"
                    }
                    html += '<span class="number-align ' + className + '">' + row['STRIKE_UPPER_ONE_PE_OBV'] + '</span>'


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
                "data": "STRIKE_UPPER_TWO_CE_OBV",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (parseFloat(row['STRIKE_UPPER_TWO_CE_OBV']) > parseFloat(row['STRIKE_UPPER_TWO_PE_OBV'])) {
                        className = " bg-success-color"
                    }
                    html += '<span class="number-align ' + className + '">' + row['STRIKE_UPPER_TWO_CE_OBV'] + '</span>'

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
                "data": "STRIKE_UPPER_TWO_PE_OBV",
                render: function (data, type, row, meta) {
                    let html = ''
                    let className = ""
                    if (parseFloat(row['STRIKE_UPPER_TWO_PE_OBV']) > parseFloat(row['STRIKE_UPPER_TWO_CE_OBV'])) {
                        className = " bg-danger-color"
                    }
                    html += '<span class="number-align ' + className + '">' + row['STRIKE_UPPER_TWO_PE_OBV'] + '</span>'
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

                    className = ""
                    if (parseFloat(row['STRIKE_UPPER_TWO_PE_OBV']) > parseFloat(row['STRIKE_UPPER_TWO_CE_OBV'])) {
                        className = " bg-danger-color"
                    }
                    html += '<span class="number-align ' + className + '">' + row['STRIKE_UPPER_TWO_PE_OBV'] + '</span>'
                    return html
                }
            },
            {
                "data": "PCR",
            },
        ],
        "fnInitComplete": function (oSettings, json) {
            showOITrendCount()

        },
        "fnRowCallback": function (nRow, aData, iDisplayIndex, iDisplayIndexFull) {
            for (var i in aData) {
                jQ('td:eq(' + 5 + ')', nRow).addClass('strike-class');
                jQ('td:eq(' + 10 + ')', nRow).addClass('strike-class');
                jQ('td:eq(' + 15 + ')', nRow).addClass('strike-class');
                jQ('td:eq(' + 20 + ')', nRow).addClass('strike-class');
                jQ('td:eq(' + 25 + ')', nRow).addClass('strike-class');

            }
        }
    });
    jQ("#trending-last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));

}

function showOITrendCount() {
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
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="master" class="dt-button trend-filter  bg-info" type="button"><span>MASTER</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="valid" class="dt-button trend-filter  bg-info" type="button"><span>VALID</span></button>');
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="breakout" class="dt-button trend-filter  bg-info" type="button"><span>BREAKOUT[9:15]</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="index" class="dt-button trend-filter  bg-info" type="button"><span>INDEX</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-trend="track" class="dt-button trend-filter  bg-info" type="button"><span>TRACK</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<button data-type="OI" style="margin-right: .2rem;" class="dt-button analyse-instrument bg-info" type="button"><span>ANALYZE OI</span></button>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<span style="margin-right: .2rem;" id="processing-trend"></span>')
    jQ("#trending-stock-list-table_wrapper .dt-buttons").append('<span style="margin-right: .2rem;" id="last-refresh-trend"></span>')
}


jQ(document).on("click", "#trending-stock-list-table_wrapper .trend-filter", function (e) {
    let name = jQ(this).attr("data-trend");
    trendingStocks = []
    let VALID_STOCKS = getAllValidStocks();
    let BREAKOUT_STOCKS = getAllValidBreakOutStocks();
    let TRACKING_SCRIPTS = getAllTrackingStocks();
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
        } else if (name == "master") {
            if (jQ.inArray(item['TRADINGSYMBOL'], REFRESH_LIST) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "valid") {
            if (jQ.inArray(item['TRADINGSYMBOL'], VALID_STOCKS) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "breakout") {
            if (jQ.inArray(item['TRADINGSYMBOL'], BREAKOUT_STOCKS) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "index") {
            if (jQ.inArray(item['TRADINGSYMBOL'], INDEX_LIST) != -1) {
                trendingStocks.push(item)
            }
        } else if (name == "track") {
            if (jQ.inArray(item['TRADINGSYMBOL'], TRACKING_SCRIPTS) != -1) {
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

jQ(document).on("click", "#trending-stock-list-table_wrapper .analyse-instrument", function (e) {
    e.preventDefault();
    let isEnabled = jQ("#enable-oi-refresh").is(':checked')
    if (!isEnabled) {
        return false
    }
    var that = jQ(this);
    that.attr("disabled", true);
    clearInterval(oiViewerTimerInstance)
    jQ("#trending-stock-list-table_wrapper #processing-trend").html("Processing.... ");
    commonAnalyzeTrend(that)

});

async function commonAnalyzeTrend(that) {
    await callAnalyseTrend()
    that.attr("disabled", false)
}

async function callAnalyseTrend() {
    let count = 0;
    let scriptsCount = trendingStocks.length

    for (let i = 0; i < scriptsCount; i++) {
        jQ("#trending-stock-list-table_wrapper  #processing-trend").html("Processing.... " + i + "/" + scriptsCount);
        try {

            let name = trendingStocks[i]['TRADINGSYMBOL']
            let tempName = name.replaceAll(" ", "-")
            tempName = tempName.replaceAll("&", "-")
            let rowId = i


            let res = generateTrend(name);
            trendingStocks[rowId]['LTP'] = res['ltp']
            if (name != 'GIFT NIFTY') {
                let oiData = await showTrendingOIViewer(name)
                let strikes = oiData['tableData']
                let pcrHtml = ''
                let chPcrHtml = ''
                if (parseFloat(oiData['pcr'].trim()) < 1 && parseFloat(oiData['pcr'].trim()) > 0) {
                    pcrHtml += '<span class="badge bg-danger">' + oiData['pcr'] + '</span>'
                } else {
                    pcrHtml += '<span class="badge bg-success">' + oiData['pcr'] + '</span>'
                }

                if (parseFloat(oiData['chPcr'].trim()) < 1 && parseFloat(oiData['chPcr'].trim()) > 0) {
                    chPcrHtml += '<span class="badge bg-danger">' + oiData['chPcr'] + '</span>'
                } else {
                    chPcrHtml += '<span class="badge bg-success">' + oiData['chPcr'] + '</span>'
                }

                trendingStocks[rowId]['PCR'] = pcrHtml + ' : ' + chPcrHtml

                let link = "https://kite.zerodha.com/chart/ext/tvc/NFO-OPT/##INSTRUMENT##/##TOKEN##"
                if (strikes[0]) {
                    trendingStocks[rowId]['STRIKE_LOWER_ONE_CE'] = strikes[0]['CHG_OI_CE']
                    trendingStocks[rowId]['STRIKE_LOWER_ONE_CE_OBV'] = strikes[0]['CE_OBV'][strikes[0]['CE_OBV'].length - 1]['obv']
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
                    trendingStocks[rowId]['STRIKE_LOWER_ONE_PE_OBV'] = strikes[0]['PE_OBV'][strikes[0]['PE_OBV'].length - 1]['obv']
                }

                if (strikes[1]) {
                    trendingStocks[rowId]['STRIKE_LOWER_TWO_CE'] = strikes[1]['CHG_OI_CE']
                    trendingStocks[rowId]['STRIKE_LOWER_TWO_CE_OBV'] = strikes[1]['CE_OBV'][strikes[1]['CE_OBV'].length - 1]['obv']
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
                    trendingStocks[rowId]['STRIKE_LOWER_TWO_PE_OBV'] = strikes[1]['PE_OBV'][strikes[1]['PE_OBV'].length - 1]['obv']
                }

                if (strikes[2]) {
                    trendingStocks[rowId]['STRIKE_ATM_CE'] = strikes[2]['CHG_OI_CE']
                    trendingStocks[rowId]['STRIKE_ATM_CE_OBV'] = strikes[2]['CE_OBV'][strikes[2]['CE_OBV'].length - 1]['obv']
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
                    trendingStocks[rowId]['STRIKE_ATM_PE_OBV'] = strikes[2]['PE_OBV'][strikes[2]['PE_OBV'].length - 1]['obv']
                }

                if (strikes[3]) {
                    trendingStocks[rowId]['STRIKE_UPPER_ONE_CE'] = strikes[3]['CHG_OI_CE']
                    trendingStocks[rowId]['STRIKE_UPPER_ONE_CE_OBV'] = strikes[3]['CE_OBV'][strikes[3]['CE_OBV'].length - 1]['obv']
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
                    trendingStocks[rowId]['STRIKE_UPPER_ONE_PE_OBV'] = strikes[3]['PE_OBV'][strikes[3]['PE_OBV'].length - 1]['obv']
                }

                if (strikes[4]) {
                    trendingStocks[rowId]['STRIKE_UPPER_TWO_CE'] = strikes[4]['CHG_OI_CE']
                    trendingStocks[rowId]['STRIKE_UPPER_TWO_CE_OBV'] = strikes[4]['CE_OBV'][strikes[4]['CE_OBV'].length - 1]['obv']
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
                    trendingStocks[rowId]['STRIKE_UPPER_TWO_PE_OBV'] = strikes[4]['PE_OBV'][strikes[4]['PE_OBV'].length - 1]['obv']
                }
            }


            res = generateTrend(name);
            trendingStocks[rowId]['LTP'] = res['ltp']
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

    jQ("#trending-stock-list-table_wrapper  #processing-trend").html("Done...");
    jQ("#trending-stock-list-table_wrapper  #last-refresh-trend").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
    startOiViewerRefresh()
    jQ("#start-auto-refresh-oi-viewer").removeAttr("disabled")

}

async function showTrendingOIViewer(instrument) {

    let strikToShow = 2
    let strikeData = []
    let selectedStrike = []
    let res = generateTrend(instrument)
    let currentPrice = res['ltp']
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
    let tableData = await showOITrendingDetailsOiViewer(strikeData, selectedStrike)
    return tableData

}

async function showOITrendingDetailsOiViewer(strikeData, selectedStrike) {
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

            obj['CE_OBV'] = calculateOBVFiveMinutesIntervalOiViewer(prevDataCE, currDataCE)
            obj['PE_OBV'] = calculateOBVFiveMinutesIntervalOiViewer(prevDataPE, currDataPE)

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


function calculateOBVFiveMinutesIntervalOiViewer(prevData, currData) {
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
        obj['obv'] = parseFloat(OBV/100000).toFixed(1);
        obvList.push(obj)
    })
    return obvList;
}

function updateTrendingTable(rowId) {
    jQ('#trending-stock-list-table').DataTable().row(rowId).data(trendingStocks[rowId]).draw(false);
}

jQ(document).on("click", ".create-alerts", function (e) {
    e.preventDefault();
    let name = jQ(this).attr("data-name");
    let price = jQ(this).attr("data-price");
    lhs_tradingsymbol = name

    let lhs_exchange = "NSE"
    if (lhs_tradingsymbol.includes("NIFTY")) {
        lhs_exchange = "INDICES"
    }

    createAlert(name + "-" + 'PRICE_ALERT', lhs_tradingsymbol, price, ">=", lhs_exchange)
});
