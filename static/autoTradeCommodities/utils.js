jQ(document).ready(function () {
    setTimeout(function () {
        makeUIChanges();
    }, 2000)

});

function makeUIChanges() {
    var html = '';

    html = '';
    html += '<a href="#" id="show-oi-viewer" style="padding:10px;">'
    html += 'Com-Bot'
    html += '</a>'


    jQ('body').first().find(".app-nav").append(html);
}

function callSleepForAWhile(times) {
    return new Promise((resolve, reject) => {
        setTimeout(function () {
            resolve();
        }, times)
    });
}


function getHistoricalDataUsingPromise(code, fromDate, toDate, interval) {
    jQ.ajaxSetup({
        headers: {
            'Authorization': `enctoken ${getCookie('enctoken')}`
        }
    });
    return new Promise((resolve, reject) => {
        jQ.ajax({
            url: BASE_URL + `/oms/instruments/historical/${code}/${interval}?user_id=HY8031&oi=1&from=${fromDate}&to=${toDate}`,
            type: 'GET',
            async: true,
            cache: false,
            success: function (data) {
                resolve(data);
            },
            error: function (request, status, error) {
                resolve([]);
            }
        });
    })
}

function callSackBar(message) {
    SnackBar({
        message: message,
        status: "alert",
        timeout: 60000,
        actions: [],
        container: "app",
        position: 'bd'
    });
}

function callSackBarInfo(message) {
    SnackBar({
        message: message,
        status: "info",
        timeout: 20000,
        actions: [],
        container: "app",
        position: 'bd'
    });
}

function getStrikeDetails(item, instrument) {
    /*console.log("Strike : " + instrument)*/
    let strikeDiff = getStrikeDiff(instrument);
    strikeDiff = strikeDiff.split(",");
    let strikeOne = parseInt(strikeDiff[0])
    let strikeTwo = parseInt(strikeDiff[1])

    let ustrikeOne = (parseFloat(item.price) + strikeOne);
    let ustrikeTwo = (ustrikeOne + strikeTwo);
    let bstrikeOne = (parseFloat(item.price) - strikeOne);
    let bstrikeTwo = (bstrikeOne - strikeTwo);

    let map = {}
    map['strikeDiff'] = parseFloat(strikeDiff).toFixed(2);
    map['bstrikeOne'] = parseFloat(bstrikeOne).toFixed(2);
    map['bstrikeTwo'] = parseFloat(bstrikeTwo).toFixed(2);
    map['ustrikeOne'] = parseFloat(ustrikeOne).toFixed(2);
    map['ustrikeTwo'] = parseFloat(ustrikeTwo).toFixed(2);
    return map;
}

function getHistoricalData(code, fromDate, toDate, interval) {
    jQ.ajaxSetup({
        headers: {
            'Authorization': `enctoken ${getCookie('enctoken')}`
        }
    });
    return jQ.ajax({
        url: BASE_URL + `/oms/instruments/historical/${code}/${interval}?user_id=HY8031&oi=1&from=${fromDate}&to=${toDate}`,
        type: 'GET',
        async: true,
        cache: false,
    });
}
function getStrikeDiff(instrument) {
    let strikeDiff = 100;
    if (nseStrikeDiff[instrument]) {
        strikeDiff = nseStrikeDiff[instrument]
        strikeDiff = strikeDiff.replace(/ /g, '')
    }
    return strikeDiff;
}

function showPopUpWindow(index, html, title, width, height) {
    var divId = "pop-up-window-" + index;
    if (jQ("#" + divId).PopupWindow("getState")) jQ("#" + divId).PopupWindow("destroy");
    jQ("body").find("#" + divId).remove()
    var popHtml = html
    var popupCustomClass = 'popup-custom-style-' + index;
    jQ("#" + divId).on("open.popupwindow", function (event, data) {
        jQ("." + popupCustomClass).find(".popupwindow_titlebar").css({})
    });
    var markup = ''
    markup += '<div id="' + divId + '">'
    markup += popHtml
    markup += '</div>'
    jQ("body").append(markup);
    jQ("#" + divId).PopupWindow({
        title: title,
        modal: false,
        customClass: popupCustomClass,
        buttons: {
            close: true,
            maximize: true,
            collapse: true,
            minimize: true,
        },
        buttonsPosition: "right",
        buttonsTexts: {
            close: "Close",
            maximize: "Maximize",
            unmaximize: "Restore",
            minimize: "Minimize",
            unminimize: "Show",
            collapse: "Collapse",
            uncollapse: "Expand"
        },
        draggable: true,
        dragOpacity: 1,
        statusBar: true,
        width: width,
        height: height,
        resizable: true,
        resizeOpacity: 1,
        keepInViewport: true,              // Boolean
        mouseMoveEvents: true              // Boolean
    });
    jQ.PopupWindowMinimizedArea({
        position: "bottom right",
        direction: "vertical"
    });

    jQ("#" + divId).on("minimize.popupwindow", function () {
        jQ("." + popupCustomClass + " .pop-title-extra").hide();
    });

    jQ("#" + divId).on("unminimize.popupwindow", function () {
        jQ("." + popupCustomClass + " .pop-title-extra").show();
    })
};


function savePreviousStockQuote(script, token) {
    let tempName = script.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    return new Promise((resolve, reject) => {
        if (!localStorage.getItem(tempName + "_PREVIOUS_DAY_QUOTE")) {
            jQ.when(getHistoricalData(token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, HISTORICAL_DATA_INTERVAL)).done(function (res) {
                localStorage.setItem(tempName + "_PREVIOUS_DAY_QUOTE", JSON.stringify(res));
                resolve();
            })
        } else {
            resolve();
        }
    });
}