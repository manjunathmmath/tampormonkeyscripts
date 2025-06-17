jQ(document).on("click", "#show-quick-scanner", function () {
    showQuickScanner();
})
let bsoData = []
let asoData = []
var quickBsoScannerTable = null;
var quickAsoScannerTable = null;
let quickTimerInstance=null;
async function showQuickScanner() {
    jQ(".marketwatch-pagination a.item")[1].click();
    await callSleepForAWhile(1000);
    quickBsoScannerTable = null;
    quickAsoScannerTable = null;

    let html = ''

    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row">'


    html += '<div class="col-md-6">'
    html += '<table  class="" id="quick-scanner-bso-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>INSTRUMENT</th>'
    html += '<th>TREND</th>'
    html += '<th>OHL</th>'
    html += '<th>MOVED</th>'
    html += '<th>ACTION</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'
    html += '</div>'


    html += '<div class="col-md-6">'
    html += '<table  class="" id="quick-scanner-aso-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>INSTRUMENT</th>'
    html += '<th>TREND</th>'
    html += '<th>OHL</th>'
    html += '<th>MOVED</th>'
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
    title += 'Quick Scanner'
    title += '</div>'
     title += '<div class="col-md-1 pop-title-extra">'
    title += '<span style="margin-left:.5rem;" id="quick-refresh-timer-one">00:00</span>'
    title += '</div>'
    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span id="quick-last-refresh-time">Last @ 00:00:00</span>'
    title += '</div>'
    title += '</div>'


    showPopUpWindow('quick-scanner', html, "Quick Scanner",  950, 550);
    var divId = "popup-custom-style-quick-scanner";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);

    jQ("." + divId).on("close.popupwindow", function () {
        if (quickTimerInstance) {
            clearInterval(quickTimerInstance)
        }
    });
    clearInterval(quickTimerInstance)
    generateQuickStockList();
    startQuickRefresh();
}


function startQuickRefresh() {
    var display = document.querySelector('#quick-refresh-timer-one');
    startQuickTimer(display);
};

function startQuickTimer(display) {
    quickTimerInstance = setInterval(function () {
        var d = new Date();
        var s = d.getSeconds();
        var m = d.getMinutes();
        var h = d.getHours();
        display.textContent = ("0" + h).substr(-2) + ":" + ("0" + m).substr(-2) + ":" + ("0" + s).substr(-2);
        if ((s%5) == 0) {
            generateQuickStockList();
        }
    }, 1000);
}


function generateQuickStockList() {
    let instrumentsWrapper = jQ(".draggable-wrapper");
    let instruments = instrumentsWrapper.find(".items .item-wrapper");
    let mapScripts = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL"));

    bsoData = []
    asoData = []

    jQ(instruments).each(function (iindex, iitem) {
        let name = jQ(this).find(".symbol").find(".name").html();
        let price = jQ(this).find(".price").find(".last-price").html();
        if (name == "M&amp;M") {
            name = "M&M"
        }

        if (name == "M&amp;MFIN") {
            name = "M&MFIN"
        }
        let strikeData = getStrikeDetails(mapScripts[name], name);
        let currentPrice = parseFloat(price.trim()).toFixed(2);

        let asoPrice = 0;
        let bsoPrice = 0;
        let aso = parseFloat(strikeData['ustrikeOne']) - parseFloat(mapScripts[name]['price']);
        aso = aso / 5
        asoPrice = parseFloat(strikeData['ustrikeOne']) - aso;

        let bso = parseFloat(mapScripts[name]['price']) - parseFloat(strikeData['bstrikeOne']);
        bso = bso / 5
        bsoPrice = parseFloat(strikeData['bstrikeOne']) + bso;

        let trend = "NA"
        let trends = []
        if (currentPrice >= parseFloat(asoPrice)) {
            trend = "ASO"
            trends.push(trend);
        }

        if (currentPrice <= parseFloat(bsoPrice)) {
            trend = "BSO"
            trends.push(trend);
        }

        if (currentPrice >= parseFloat(strikeData['ustrikeTwo'])) {
            trend = "AST"
            trends.push(trend);
        }

        if (currentPrice <= parseFloat(strikeData['bstrikeTwo'])) {
            trend = "BST"
            trends.push(trend);
        }

        let ASO_MOVED = parseFloat(currentPrice - asoPrice).toFixed()
        let BSO_MOVED = parseFloat(bsoPrice - currentPrice).toFixed()

        let obj = {}
        obj['TRADINGSYMBOL'] = name
        obj['TREND'] = trends
        obj['OHL'] = ''
        obj['LTP'] = currentPrice
        obj['ASO_MOVED'] = ASO_MOVED
        obj['BSO_MOVED'] = BSO_MOVED

        if (jQ.inArray("BSO", trends) != -1) {
            bsoData.push(obj)
        }

        if (jQ.inArray("ASO", trends) != -1) {
            asoData.push(obj)
        }
    });
    if (!quickBsoScannerTable) {
        generateBsoScannerDataTable(bsoData)
    }else {
        quickBsoScannerTable.clear().draw();
        quickBsoScannerTable.rows.add(bsoData);
        quickBsoScannerTable.columns.adjust().draw();
    }

    if (!quickAsoScannerTable) {
        generateAsoScannerDataTable(asoData)
    } else {
        quickAsoScannerTable.clear().draw();
        quickAsoScannerTable.rows.add(asoData);
        quickAsoScannerTable.columns.adjust().draw();
    }
    jQ("#quick-last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
}


jQ(document).on("click", ".quick-check-history", function () {
    let name = jQ(this).attr("data-name");
    var rowId = jQ(this).attr("data-row-id");
    var type = jQ(this).attr("data-type");
    var rowData = {}
    if (type == 'BSO') {
        rowData = bsoData[rowId]
    } else {
        rowData = asoData[rowId]
    }
    callGetHistory(name, rowId, rowData, type)
});



async function callGetHistory(name, rowId, row, type) {
    console.log(row)
    let res = await checkOHLTrend(row);
    console.log(res)
    if (type == 'BSO') {
        bsoData[rowId]['VOLUME'] = res[3]
        bsoData[rowId]['OHL_TREND'] = res
    } else {
        asoData[rowId]['VOLUME'] = res[3]
        asoData[rowId]['OHL_TREND'] = res
    }
    updateQuickScannerTable(rowId, type)
}

function updateQuickScannerTable(rowId, type) {
    if (type == 'BSO') {
        jQ('#quick-scanner-bso-list-table').DataTable().row(rowId).data(bsoData[rowId]).draw(false);
    } else {
        jQ('#quick-scanner-aso-list-table').DataTable().row(rowId).data(asoData[rowId]).draw(false);
    }
}

function generateBsoScannerDataTable(data) {
    jQ("#quick-scanner-bso-list-table").show()
    quickBsoScannerTable = jQ('#quick-scanner-bso-list-table').DataTable({
        "processing": true,
        "order": [[3, "asc"]],
        "pageLength": 50,
        "bPaginate": false,
        "data": data,
        "bDestroy": true,
        "scrollX": true,
        "scrollY": "500px",
        "columnDefs": [
            {
                "targets": [2],
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
                        html += '<span class="badge bg-warning" title="Already traded">' + data + '</span>'
                    } else {
                        html += data;
                    }
                    html += '</a>'
                    return html;
                }
            },
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
                "data": 'BSO_MOVED',
                render: function (data, type, row, meta) {
                    return data;

                }
            },
            {
                "data": "ACTIONS",
                render: function (data, type, row, meta) {
                    var html = ""
                    let index = 1;
                    html += '<div>'
                    if (jQ.inArray(row['TRADINGSYMBOL'], INDICES) == -1) {
                        if (row['TREND']) {
                            html += '<span  data-type="BSO" data-row-id="' + meta.row + '" data-name="' + row['TRADINGSYMBOL'] + '"  class="badge bg-primary  ms-1 quick-check-history" style="margin-right:.5rem;">';
                            html += "Check"
                            html += '</span>'
                        }
                    } else {
                        index = 0;
                    }
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
        }
    });
}

function generateAsoScannerDataTable(data) {
    jQ("#quick-scanner-aso-list-table").show()
    quickAsoScannerTable = jQ('#quick-scanner-aso-list-table').DataTable({
        "processing": true,
        "order": [[3, "asc"]],
        "pageLength": 50,
        "bPaginate": false,
        "data": data,
        "bDestroy": true,
        "scrollX": true,
        "scrollY": "500px",
        "columnDefs": [
            {
                "targets": [2],
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
                        html += '<span class="badge bg-warning" title="Already traded">' + data + '</span>'
                    } else {
                        html += data;
                    }
                    html += '</a>'
                    return html;
                }
            },
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
                "data": 'ASO_MOVED',
                render: function (data, type, row, meta) {
                    return data;

                }
            },
            {
                "data": "ACTIONS",
                render: function (data, type, row, meta) {
                    var html = ""
                    let index = 1;
                    html += '<div>'
                    if (jQ.inArray(row['TRADINGSYMBOL'], INDICES) == -1) {
                        if (row['TREND']) {
                            html += '<span  data-type="ASO" data-row-id="' + meta.row + '" data-name="' + row['TRADINGSYMBOL'] + '"  class="badge bg-primary  ms-1 quick-check-history" style="margin-right:.5rem;">';
                            html += "Check"
                            html += '</span>'
                        }
                    } else {
                        index = 0;
                    }
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
        }
    });
}
