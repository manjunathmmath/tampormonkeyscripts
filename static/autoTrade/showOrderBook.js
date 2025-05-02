jQ(document).on("click", "#show-order-book", function () {
    showOrderBook();
})

jQ(document).on("change", "#trade-type", function () {
    commonGenerateTable();
})

function showOrderBook() {
    let html = ''

    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table  class="" id="order-book-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>SYMBOL</th>'
    html += '<th>ORDER DATE</th>'
    html += '<th>TRENDS</th>'
    html += '<th>TYPE</th>'
    html += '<th>QUANTITY</th>'
    html += '<th>PRICE</th>'
    html += '<th>STOP-LOSS</th>'
    html += '<th>LTP</th>'
    html += '<th>P/L</th>'
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
    title += 'Order book'
    title += '</div>'
    title += '<div class="col-md-2 pop-title-extra">'
    title += '<a  id="refresh-order-book">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
    title += '</div>'
    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span id="last-refresh-time-order-book">Last @ 00:00:00</span>'
    title += '</div>'
    title += '<div class="col-md-2 pop-title-extra">'
    title += '<span id="total-pl"></span>'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '<select  id="trade-type">'
    title += '<option value="ALL" selected>ALL</option>'
    title += '<option value="BSO">BSO</option>'
    title += '<option value="ASO">ASO</option>'
    title += '</select>'
    title += '</div>'
    title += '</div>'

    showPopUpWindow('order-book', html, "Order Book",900,650);
    var divId = "popup-custom-style-order-book";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    commonGenerateTable();
}

jQ(document).on("click", "#refresh-order-book", function () {
    commonGenerateTable();
    jQ("#last-refresh-time-order-book").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
});

let total = 0;
async function commonGenerateTable() {
    let trendType = jQ("#trade-type option:selected").val();
    total = 0;
    let trades = JSON.parse(localStorage.getItem("TRADES"));
    if (!trades) {
        trades = []
    }

    let orderBook = JSON.parse(localStorage.getItem("ORDERBOOK"));
    if (!orderBook) {
        orderBook = []
    }
    /*let positions = await getPositons();*/

    let orders = []
    jQ.each(trades, function (index, item) {

        let info = orderBook[item]['INFO']
        if (trendType != "ALL") {
            if (trendType == 'BSO'
                && jQ.inArray("BSO", info['trends']) === -1) {
                return;
            }

            if (trendType == 'ASO'
                && jQ.inArray("ASO", info['trends']) === -1) {
                return;
            }
        }

        let obj = {}

        let book = orderBook[item]['ORDER']
        let currentInfo = infoMap[item];


        let asoPrice = 0;
        let bsoPrice = 0;
        let aso = parseFloat(info['strikeData']['ustrikeOne']) - parseFloat(currentInfo['instrument']['price']);
        aso = aso / 2
        asoPrice = parseFloat(info['strikeData']['ustrikeOne']) - aso;
    
        let bso = parseFloat(currentInfo['instrument']['price']) - parseFloat(info['strikeData']['bstrikeOne']);
        bso = bso / 2
        bsoPrice = parseFloat(info['strikeData']['bstrikeOne']) + bso;

        obj.SYMBOL = item
        obj.TRANSACTION_TYPE = book.transaction_type
        obj.QUNTITY = book.quantity
        obj.PRICE = info.currentPrice
        obj.TREND = info.trends.join(",")
        obj.STOPLOSS = 0;
        obj.COUNTER_TRANSACATION_TYPE = 'BUY'
        obj.LTP = currentInfo.currentPrice
        obj.ORDER_DATE = orderBook[item]['ORDER_DATE']

        if (book.transaction_type === "BUY") {
            obj.COUNTER_TRANSACATION_TYPE = 'SELL'
        }
        if (jQ.inArray("ASO", info['trends']) != -1) {
            let stop = parseFloat(currentInfo['instrument']['price']);
            stop = stop
            obj.STOPLOSS = parseFloat(stop).toFixed(2);

        } else if (jQ.inArray("BSO", info['trends']) != -1) {
            let stop = parseFloat(currentInfo['instrument']['price']);
            stop = stop
            obj.STOPLOSS = parseFloat(stop).toFixed(2);
        }
        orders.push(obj);
        getTotal(obj)
    });

    let html = ''
    total = total.toFixed(2)
    if (total > 0) {
        html += ' <span class="badge bg-success">' + total + '</span>'
    } else {
        html += ' <span class="badge bg-danger">' + total + '</span>'
    }
    jQ("#total-pl").html(html)
    generateOrderBook(orders);
}


function getTotal(row) {
    let price = parseFloat(row['PRICE'])
    let ltp = parseFloat(row['LTP'])
    let diff = 0;
    if (row['TRANSACTION_TYPE'] == "BUY") {
        diff = (ltp - price).toFixed(2);
    }
    if (row['TRANSACTION_TYPE'] == "SELL") {
        diff = (price - ltp).toFixed(2);
    }
    let qty = parseFloat(row['QUNTITY'])

    let pl = (qty * diff).toFixed(2)
    total += parseFloat(pl);
}


function generateOrderBook(orderBook) {
    jQ("#order-book-list-table").show();
    jQ('#order-book-list-table').DataTable({
        "processing": true,
        "order": [[0, "asc"]],
        "pageLength": 50,
        "bPaginate": false,
        "data": orderBook,
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
                "data": "SYMBOL",
                render: function (data, type, row, meta) {
                    let html = ''
                    html += '<a target="_blank" href="https://kite.zerodha.com/chart/ext/tvc/' + 'NSE' + '/' + data + '/' + instrumentTokens[data] + '"> '
                    html += data;
                    html +='</a>'
                    return html;
                }
            },
            { "data": "ORDER_DATE" },
            { "data": "TREND" },
            { "data": "TRANSACTION_TYPE" },
            { "data": "QUNTITY" },
            { "data": "PRICE" },
            { "data": "STOPLOSS" },
            {
                "data": "LTP",
                render: function (data, type, row, meta) {
                    let html = '';

                    html += data;
                    let stoploss = parseFloat(row['STOPLOSS'])
                    let ltp = parseFloat(row['LTP'])
                    let diff = (ltp - stoploss).toFixed(2);

                    if (row['TRANSACTION_TYPE'] == "BUY") {
                        if (ltp < stoploss) {
                            html += ' <span class="badge bg-warning">(' + diff + ')</span>'
                        }
                    }
                    if (row['TRANSACTION_TYPE'] == "SELL") {
                        if (ltp > stoploss) {
                            html += ' <span class="badge bg-warning">(' + diff + ')</span>'
                        }
                    }

                    return html;
                }
            },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    let html = '';
                    let price = parseFloat(row['PRICE'])
                    let ltp = parseFloat(row['LTP'])
                    let diff = 0;
                    if (row['TRANSACTION_TYPE'] == "BUY") {
                        diff = (ltp - price).toFixed(2);
                    }
                    if (row['TRANSACTION_TYPE'] == "SELL") {
                        diff = (price - ltp).toFixed(2);
                    }
                    let qty = parseFloat(row['QUNTITY'])

                    let pl = (qty * diff).toFixed(2)

                    if (pl > 0) {
                        html += ' <span class="badge bg-success">' + pl + '</span>'
                    } else {
                        html += ' <span class="badge bg-danger">' + pl + '</span>'
                    }

                    return html;
                }
            },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    let html = '';
                    let btnColor = "bg-success"
                    if (row['COUNTER_TRANSACATION_TYPE'] == "SELL") {
                        btnColor = "bg-danger"
                    }

                    html += '<span  data-quantity="' + row['QUNTITY'] + '" data-name="' + row['SYMBOL'] + '"  data-transaction-type="' + row['COUNTER_TRANSACATION_TYPE'] + '" class="badge bg-secondary  ms-1 exit-trade ' + btnColor + '"style="margin-right:.5rem;">';
                    html += row['COUNTER_TRANSACATION_TYPE']
                    html += '</span>'

                    html += '<span  data-quantity="' + row['QUNTITY'] + '" data-name="' + row['SYMBOL'] + '" data-price="' + row['STOPLOSS'] + '"  data-transaction-type="' + row['COUNTER_TRANSACATION_TYPE'] + '" class="badge bg-primary  ms-1 place-sl-order" style="margin-right:.5rem;">';
                    html += "SL"
                    html += '</span>'

                    if (row['TREND']) {
                        html += '<span data-price="' + row['LTP'] + '" data-index="' + 0 + '" data-trend="' + row['TREND'] + '" data-name="' + row['SYMBOL'] + '" class="badge bg-info show-chart">'
                        html += 'Chart'
                        html += '</span>'
                    }

                    html += '<span  data-name="' + row['SYMBOL'] + '" class="badge bg-warning  ms-1 clear-order" style="margin-right:.5rem;">';
                    html += "CLEAR"
                    html += '</span>'

                    return html;
                }
            },
        ],
        "fnInitComplete": function (oSettings, json) {

        }
    });
}

jQ(document).on("click", ".clear-order", function () {
    let name = jQ(this).attr("data-name");
    if(name){
        let trades = JSON.parse(localStorage.getItem("TRADES"));
        if (!trades) {
            trades = []
        }

        const index = trades.indexOf(name);
        if (index > -1) {
            trades.splice(index, 1);
            localStorage.setItem("TRADES", JSON.stringify(trades));
        }
    }
});


jQ(document).on("click", ".exit-trade", function () {
    let name = jQ(this).attr("data-name");
    let transaction_type = jQ(this).attr("data-transaction-type");
    let quantity = jQ(this).attr("data-quantity");
    let params = { "exchange": "NSE", "tradingsymbol": name, "transaction_type": transaction_type, "product": "MIS", "order_type": "MARKET", "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": 0, "trigger_price": 0, "disclosed_quantity": 0, "tags": [] }
    let res = placeOrder(params)
    if (res != 'error') {
        let trades = JSON.parse(localStorage.getItem("TRADES"));
        if (!trades) {
            trades = []
        }
        var index = trades.indexOf(name);
        if (index >= 0) {
            trades.splice(index, 1);
            localStorage.setItem("TRADES", JSON.stringify(trades));
            commonGenerateTable();
        };

    }
});


function getPositons() {
    jQ.ajaxSetup({
        headers: {
            'Authorization': `enctoken ${getCookie('enctoken')}`
        }
    });

    return new Promise((resolve, reject) => {
        jQ.ajax({
            url: BASE_URL + `/oms/portfolio/positions`,
            type: 'GET',
            async: true,
            cache: false,
            success: function (resp) {
                resolve(resp);
            }
        });
    });
}