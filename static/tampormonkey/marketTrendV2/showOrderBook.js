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
    html += '<th>TRANSACTION TYPE</th>'
    html += '<th>QUANTITY</th>'
    html += '<th>TRENDS</th>'
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
    title += '</div>'

    showPopUpWindow('order-book', html, "Order Book");
    var divId = "popup-custom-style-order-book";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);


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
        obj.TRANSACTION_TYPE = book.transaction_type
        obj.QUNTITY = book.quantity
        obj.TREND = info.trends.join(",")
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
            { "data": "TRANSACTION_TYPE" },
            { "data": "QUNTITY" },
            { "data": "TREND" },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    let html = '';
                    return html;
                }
            },
        ],
        "fnInitComplete": function (oSettings, json) {
        }
    });
}