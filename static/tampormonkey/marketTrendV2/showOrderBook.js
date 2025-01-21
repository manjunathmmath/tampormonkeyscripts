jQ(document).on("click", "#show-order-book", function () {
    showOrderBook();
})

function showOrderBook() {
    let html = ''

    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table  class="" id="order-book-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>SYMBOL</th>'
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
    title += '</div>'
   
    showPopUpWindow('order-book', html, "Order Book");
    var divId = "popup-custom-style-order-book";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    commonGenerateTable();
}

jQ(document).on("click", "#refresh-order-book", function () {
    commonGenerateTable();
    jQ("#last-refresh-time-order-book").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
});

function commonGenerateTable(){
    let trades = JSON.parse(localStorage.getItem("TRADES"));
    if (!trades) {
        trades = []
    }

    let orderBook = JSON.parse(localStorage.getItem("ORDERBOOK"));
    if (!orderBook) {
        orderBook = []
    }

    let orders = []
    jQ.each(trades, function (index, item) {
        let obj = {}

        obj.SYMBOL = item
        let book = orderBook[item]['ORDER']
        let info = orderBook[item]['INFO']
        let currentInfo = infoMap[item];

        let aso = parseFloat(info['strikeData']['ustrikeOne']).toFixed(2);
        let ast = parseFloat(info['strikeData']['ustrikeTwo']).toFixed(2);
        let bso = parseFloat(info['strikeData']['bstrikeOne']).toFixed(2);
        let bst = parseFloat(info['strikeData']['bstrikeTwo']).toFixed(2);

        obj.TRANSACTION_TYPE = book.transaction_type
        obj.QUNTITY = book.quantity
        obj.PRICE = info.currentPrice
        obj.TREND = info.trends.join(",")
        obj.STOPLOSS = 0;
        obj.COUNTER_TRANSACATION_TYPE = 'BUY'
        obj.LTP = currentInfo.currentPrice

        if (book.transaction_type === "BUY") {
            obj.COUNTER_TRANSACATION_TYPE = 'SELL'
        }
        if (jQ.inArray("ASO", info['trends']) != -1) {
            obj.STOPLOSS = parseFloat(aso) - SL_POINTS;

        } else if (jQ.inArray("BSO", info['trends']) != -1) {
            obj.STOPLOSS = parseFloat(bso) + SL_POINTS;
        }
        orders.push(obj)
    })
    generateOrderBook(orders);
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
        "scrollY": "300px",
        "columnDefs": [
            {
                "targets": [],
                "visible": false,
                "searchable": false
            }
        ],
        "columns": [
            { "data": "SYMBOL" },
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
                    return html;
                }
            },


        ],
        "fnInitComplete": function (oSettings, json) {
        }
    });
}


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
})