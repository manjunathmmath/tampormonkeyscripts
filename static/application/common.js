function blinker() {
    $('.blinking').fadeOut(500);
    $('.blinking').fadeIn(500);
}

$(document).ready(function () {
    setInterval(blinker, 2000);
});

$(document).ready(function () {
    setTimeout(function () {
        $(".show-wd-gann-prediction").each(function (index, item) {
            var that = $(this);
            var icon = '<span class="bi bi-speedometer" style="color:#28a745;cursor: pointer;margin-left: 1rem;"></span>'
            that.append(icon)
        })
    }, 1000)
    /*saveMarketBreadthTrend();
        savePivotPoints()
    */
})

$(document).on("click", ".show-wd-gann-prediction", function () {
    var val = $(this).text();
    var symbol = $(this).attr("data-symbol");
    val = val.replaceAll(",", "");
    if (val) {
        $("form#form-redirect").remove();
        var formHtml = ''
        var url = "/wd_gann_pred"
        formHtml += '<form target="_blank" id="form-redirect" action="' + url + '">';
        formHtml += '<input type="hidden" id="price" name="price" value="' + val + '">'
        formHtml += '<input type="hidden" id="symbol" name="symbol" value="' + symbol + '">'
        formHtml += '</form>';
        var form = $(formHtml);
        $('body').append(form);
        form.submit();
    }
});


function savePivotPoints() {
    $.when(getSuggestionsBankNiftyAndNiftySupportResistance()).done(function (qone) {
        var nifty = ""
        var bank = ""
        if (qone.data[0]) {
            nifty = JSON.stringify(qone.data[0]);

        }

        if (qone.data[1]) {
            bank = JSON.stringify(qone.data[1]);
        }
        return $.ajax({
            type: 'POST',
            url: '/savePivotPoints',
            data: {nifty: nifty, bank: bank},
        });
    })
}

function getSuggestionsBankNiftyAndNiftySupportResistance(){
    return $.ajax({
        type: 'GET',
        url: 'suggestions/banknifty_and_nifty_support_resistance',
        data: {},
    });
}

function saveMarketBreadthTrend(nifty, bank) {
    $.when(getAdvances_declines(),
        getAdvances_declines_bank_nifty(),
        getAdvances_declines_nifty()).done(function (qone, qtwo, three) {
        $.ajax({
            type: 'POST',
            url: '/saveMarketBreadthTrend',
            data: {
                overall: JSON.stringify(qone[0]),
                bank: JSON.stringify(qtwo[0]),
                nifty: JSON.stringify(three[0])
            },
        });
    })
}

function getAdvances_declines() {
    return $.ajax({
        type: 'GET',
        url: '/advances_declines',
        data: {},
    });
}

function getAdvances_declines_bank_nifty() {
    return $.ajax({
        type: 'GET',
        url: '/advances_declines_bank_nifty',
        data: {},
    });
}

function getAdvances_declines_nifty() {
    return $.ajax({
        type: 'GET',
        url: '/advances_declines_nifty',
        data: {},
    });
}

function globalGetPivotPoints(high, low, close) {
    high = parseFloat(high.replace(",", ""));
    low = parseFloat(low.replace(",", ""));
    close = parseFloat(close.replace(",", ""));
    var obj = {};
    var PP = ((high + low + close) / 3);
    var S1 = ((2 * PP) - high);
    var S2 = (PP - (high - low));
    var S3 = (low - 2 * (high - PP));
    var R1 = ((2 * PP) - low);
    var R2 = (PP + (high - low));
    var R3 = (high + (2 * (PP - low)));

    var s = []
    s.push(S1.toFixed(2))
    s.push(S2.toFixed(2))
    s.push(S3.toFixed(2))

    var r = []
    r.push(R1.toFixed(2))
    r.push(R2.toFixed(2))
    r.push(R3.toFixed(2))

    obj['pivotPoint'] = PP.toFixed(2);
    obj['pivotSupport'] = s.join(",")
    obj['pivotResistance'] = r.join(",");

    return obj;

}

function globalGetSupportAndResistanceValues(open) {
    var gaNNObj = {}
    open = open.replace(",", "");
    var squareRoot = Math.floor(Math.sqrt(open));
    var startNumber = 1;
    if (squareRoot > 1) {
        startNumber = squareRoot - 1
    }

    var sup1Factor = (Math.floor(Math.sqrt(open) * 1000) - Math.floor(Math.sqrt(open) * 1000) % 125) / 1000;
    var sup1 = Math.floor(Math.pow(sup1Factor - 0.125, 2) * 100) / 100;
    var sup2 = Math.floor(Math.pow(sup1Factor - 0.25, 2) * 100) / 100;
    var sup3 = Math.floor(Math.pow(sup1Factor - 0.375, 2) * 100) / 100;
    var sup4 = Math.floor(Math.pow(sup1Factor - 0.5, 2) * 100) / 100;
    var sup5 = Math.floor(Math.pow(sup1Factor - 0.625, 2) * 100) / 100;

    var res1 = Math.floor(Math.pow(sup1Factor + 0.25, 2) * 100) / 100;
    var res2 = Math.floor(Math.pow(sup1Factor + 0.375, 2) * 100) / 100;
    var res3 = Math.floor(Math.pow(sup1Factor + 0.5, 2) * 100) / 100;
    var res4 = Math.floor(Math.pow(sup1Factor + 0.625, 2) * 100) / 100;
    var res5 = Math.floor(Math.pow(sup1Factor + 0.75, 2) * 100) / 100;

    var supportArr = []
    supportArr.push(sup1)
    supportArr.push(sup2)
    supportArr.push(sup3)
    supportArr.push(sup4)
    supportArr.push(sup5)

    var resistanceArr = []
    resistanceArr.push(res1)
    resistanceArr.push(res2)
    resistanceArr.push(res3)
    resistanceArr.push(res4)
    resistanceArr.push(res5)

    gaNNObj['support'] = supportArr.join(",")
    gaNNObj['resistance'] = resistanceArr.join(",")

    var buyAt = Math.floor(Math.pow(sup1Factor + 0.125, 2) * 100) / 100;
    gaNNObj['buyAt'] = buyAt
    var buyStopLoss = Math.floor(Math.pow(sup1Factor, 2) * 100) / 100
    gaNNObj['buyStopLoss'] = buyStopLoss
    var buyStopLossPoints = " (" + Math.floor(buyStopLoss - buyAt) + " pts)"
    gaNNObj['buyStopLossPoints'] = buyStopLossPoints


    var sellAt = Math.floor(Math.pow(sup1Factor, 2) * 100) / 100
    gaNNObj['sellAt'] = sellAt
    var sellStopLoss = Math.floor(Math.pow(sup1Factor + 0.125, 2) * 100) / 100
    gaNNObj['sellStopLoss'] = sellStopLoss
    var sellStopLossPoints = " (" + Math.floor(sellStopLoss - sellAt) + " pts)"
    gaNNObj['sellStopLossPoints'] = sellStopLossPoints


    var buyTarget1 = Math.floor(Math.pow(sup1Factor + 0.25, 2) * 99.95) / 100
    var buyTarget2 = Math.floor(Math.pow(sup1Factor + 0.375, 2) * 99.95) / 100
    var buyTarget3 = Math.floor(Math.pow(sup1Factor + 0.5, 2) * 99.95) / 100
    var buyTarget4 = Math.floor(Math.pow(sup1Factor + 0.625, 2) * 99.95) / 100
    var extendedBuy1 = Math.floor(Math.pow(sup1Factor + 0.75, 2) * 99.95) / 100
    var extendedBuy2 = Math.floor(Math.pow(sup1Factor + 0.875, 2) * 99.95) / 100
    var buyTargetArr = []
    buyTargetArr.push(buyTarget1)
    buyTargetArr.push(buyTarget2)
    buyTargetArr.push(buyTarget3)
    buyTargetArr.push(buyTarget4)
    buyTargetArr.push(extendedBuy1)
    buyTargetArr.push(extendedBuy2)
    gaNNObj['buyTarget'] = buyTargetArr.join(",");

    var buyTarget1Point = "( " + Math.floor(Math.floor(Math.pow(sup1Factor + 0.25, 2) * 99.95) / 100 - buyAt) + " pts)"
    var buyTarget2Point = "( " + Math.floor(Math.floor(Math.pow(sup1Factor + 0.375, 2) * 99.95) / 100 - buyAt) + " pts)"
    var buyTarget3Point = "( " + Math.floor(Math.floor(Math.pow(sup1Factor + 0.5, 2) * 99.95) / 100 - buyAt) + " pts)"
    var buyTarget4Point = "( " + Math.floor(Math.floor(Math.pow(sup1Factor + 0.625, 2) * 99.95) / 100 - buyAt) + " pts)"
    var buyTarget5Point = "( " + Math.floor(Math.floor(Math.pow(sup1Factor + 0.75, 2) * 99.95) / 100 - buyAt) + " pts)"
    var buyTarget6Point = "( " + Math.floor(Math.floor(Math.pow(sup1Factor + 0.875, 2) * 99.95) / 100 - buyAt) + " pts)"

    var buyTargetPointsArr = []
    buyTargetPointsArr.push(buyTarget1Point)
    buyTargetPointsArr.push(buyTarget2Point)
    buyTargetPointsArr.push(buyTarget3Point)
    buyTargetPointsArr.push(buyTarget4Point)
    buyTargetPointsArr.push(buyTarget5Point)
    buyTargetPointsArr.push(buyTarget6Point)
    gaNNObj['buyTargetPoints'] = buyTargetPointsArr.join(",");


    var sellTarget1 = Math.floor(Math.pow(sup1Factor - 0.125, 2) * 100.05) / 100
    var sellTarget2 = Math.floor(Math.pow(sup1Factor - 0.25, 2) * 100.05) / 100
    var sellTarget3 = Math.floor(Math.pow(sup1Factor - 0.375, 2) * 100.05) / 100
    var sellTarget4 = Math.floor(Math.pow(sup1Factor - 0.5, 2) * 100.05) / 100
    var extendedSell = Math.floor(Math.pow(sup1Factor - 0.625, 2) * 100.05) / 100
    var extendedSel2 = Math.floor(Math.pow(sup1Factor - 0.75, 2) * 100.05) / 100


    var sellTargetArr = []
    sellTargetArr.push(sellTarget1)
    sellTargetArr.push(sellTarget2)
    sellTargetArr.push(sellTarget3)
    sellTargetArr.push(sellTarget4)
    sellTargetArr.push(extendedSell)
    sellTargetArr.push(extendedSel2)
    gaNNObj['sellTarget'] = sellTargetArr.join(",");


    var sellTarget1Point = "( " + Math.floor(sellAt - Math.floor(Math.pow(sup1Factor - 0.125, 2) * 100.05) / 100) + " pts)"
    var sellTarget2Point = "( " + Math.floor(sellAt - Math.floor(Math.pow(sup1Factor - 0.25, 2) * 100.05) / 100) + " pts)"
    var sellTarget3Point = "( " + Math.floor(sellAt - Math.floor(Math.pow(sup1Factor - 0.375, 2) * 100.05) / 100) + " pts)"
    var sellTarget4Point = "( " + Math.floor(sellAt - Math.floor(Math.pow(sup1Factor - 0.5, 2) * 100.05) / 100) + " pts)"
    var sellTarget5Point = "( " + Math.floor(sellAt - Math.floor(Math.pow(sup1Factor - 0.625, 2) * 100.05) / 100) + " pts)"
    var sellTarget6Point = "( " + Math.floor(sellAt - Math.floor(Math.pow(sup1Factor - 0.75, 2) * 100.05) / 100) + " pts)"


    var sellTargetPointsArr = []
    sellTargetPointsArr.push(sellTarget1Point)
    sellTargetPointsArr.push(sellTarget2Point)
    sellTargetPointsArr.push(sellTarget3Point)
    sellTargetPointsArr.push(sellTarget4Point)
    sellTargetPointsArr.push(sellTarget5Point)
    sellTargetPointsArr.push(sellTarget6Point)
    gaNNObj['sellTargetPoints'] = sellTargetPointsArr.join(",");

    return gaNNObj;

}

