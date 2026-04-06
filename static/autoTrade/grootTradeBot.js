let globalFuturesTrend = {}
let stockTable = null;
jQ(document).on("click", "#show-groot-trade-bot", function (e) {
    e.preventDefault();
    showGrootTradeBot();
});


async function showGrootTradeBot() {

    let html = ''

    html += '<div id="main-trade-bot-container">'
    html += '</div>'

    let title = ''
    title += '<div class="row" position:relative;">'
    title += '<div class="col-md-2">'
    title += 'Groot Trade Bot'
    title += '</div>'
    title += '<div class="col-md-1">'
    title += '<a  id="start-auto-refresh">Refresh</a>'
    title += '</div>'
    title += '<div class="col-md-1">'
    title += '<input title="Enable refresh" type="checkbox" id="enable-auto-refresh">'
    title += '</div>'
    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span id="last-refresh-time">Last @ 00:00:00</span>'
    title += '</div>'
    title += '<div class="col-md-1">'
    title += '<span id="refresh-loader" class="loader hide"></span>'
    title += '</div>'
    title += '<div class="col-md-1">'
    title += '<span id="data-load">Load</span>'
    title += '</div>'
    title += '<div class="col-md-2">'
    title += '<span id="processing-trend">...</span>'
    title += '</div>'
    title += '</div>'

    showPopUpWindow('groot-trade-bot', html, "Groot [Trade Bot]", 950, 550);
    let divId = "popup-custom-style-groot-trade-bot";
    jQ("." + divId).find(".popupwindow_titlebar_button_maximize").trigger("click");
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);

    let statusHtml = ''
    statusHtml += '<div class="row" position:relative;" >'
    statusHtml += '<div class="col-md-9">'
    statusHtml += '<div class="row" id="status-bar-container">'
    statusHtml += '</div>'
    statusHtml += '</div>'
    statusHtml += '<div class="col-md-1" style="text-align:right;">'
    statusHtml += '<a id="show-oi-viewer">Analyzer</a>'
    statusHtml += '</div>'
    statusHtml += '<div class="col-md-1" style="text-align:right;">'
    statusHtml += '<a id="show-stock-viewer">Stocks</a>'
    statusHtml += '</div>'
    statusHtml += '<div class="col-md-1" style="text-align:right;">'
    statusHtml += '<span id="refresh-timer-one">00:00</span>'
    statusHtml += '</div>'
    statusHtml += '</div>'

    jQ("." + divId).find(".popupwindow_statusbar_content").html(statusHtml)
}

jQ(document).on("click", "#data-load", function () {
    let html = ''

    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += 'Previous Day : <span title="Previous Day Date" class="badge bg-primary me-1">' + PREVIOUS_DAY_DATE + '</span>'
    html += '</div>'
    html += '<div class="col-md-12">'
    html += 'Current Day : <span title="Current Day Date" class="badge bg-primary me-1">' + CURRENT_DAY + '</span>'
    html += '</div>'
    html += '</div>'

    html += '<div class="row">'

    html += '<div class="col-md-12">'
    html += '<a  id="clean-storage" type="button">Clear</a>'
    html += '</div>'

    html += '<div class="col-md-12">'
    html += '<a  id="load-price" type="button">Load</a>'
    html += '</div>'

    html += '<div class="col-md-12">'
    html += '<a id="nine-fifteen-scan">9:15 SCAN</a>'
    html += '</div>'

    html += '<div class="col-md-12">'
    html += '<a target="_blank" href="https://tradingeconomics.com/stocks"  type="button">World</a>'
    html += '</div>'

    /*
    html += '<div class="col-md-12">'
    html += '<a id="show-oi-viewer">Analyzer</a>'
    html += '</div>'
    */

    html += '<div class="col-md-12">'
    html += '<a target="_blank" href="https://docs.google.com/spreadsheets/d/1mJyXOLNqSqIuDIiB1ip9-0kpNGU0pl_o/edit?gid=20807039#gid=20807039"  type="button">Past Analysis</a>'
    html += '</div>'

    html += '<div class="col-md-12">'
    html += '<a href="#" id="add-to-watch-list">Add Watchlist</a>'
    html += '</div>'

    html += '</div>'

    SnackBar({
        message: html,
        status: "info",
        timeout: 60000,
        actions: [],
        position: 'tc'
    });
});

jQ(document).on('click', '#nine-fifteen-scan', function (e) {
    scanNineFifteenCandle()
});

async function scanNineFifteenCandle() {
    let scriptData = generateTrends()
    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));
    if (!breakOutNineFifteen) {
        breakOutNineFifteen = {}
        let instru = [];
        let checkInstr = []
        jQ.each(instrumentTokens, function (index, item) {
            if (jQ.inArray(index, checkInstr) === -1) {
                instru.push(index)
                checkInstr.push(index)
            }
        });


        for (let i = 0; i < instru.length; i++) {
            let name = instru[i];
            jQ("#processing-trend").html("Processing.... " + (i + 1) + "/" + instru.length);
            try {
                let historical = await getHistoricalDataUsingPromise(instrumentTokens[name], CURRENT_DAY, CURRENT_DAY, '5minute');
                let firstCandleClose = historical.data.candles[0][4]
                let asoPrice = 0;
                let bsoPrice = 0;
                asoPrice = parseFloat(scriptData[name]['strikeData']['ustrikeOne']);
                bsoPrice = parseFloat(scriptData[name]['strikeData']['bstrikeOne']);

                if (firstCandleClose > asoPrice) {
                    breakOutNineFifteen[name] = {};
                    breakOutNineFifteen[name]['CLOSE_9_15'] = 'ASO';
                } else if (firstCandleClose < bsoPrice) {
                    breakOutNineFifteen[name] = {};
                    breakOutNineFifteen[name]['CLOSE_9_15'] = 'BSO';
                } else {
                    breakOutNineFifteen[name] = {};
                    breakOutNineFifteen[name]['CLOSE_9_15'] = 'B/W';
                }
            } catch (e) {
                console.log(e)
            }
        }
        localStorage.setItem("VALID_BREAKOUT_NINE_FIFTEEN", JSON.stringify(breakOutNineFifteen));
    }
}

async function commonShowPopupWindow() {
    resetCount()
    jQ("#refresh-loader").removeClass("hide");
    jQ("#last-refresh-time").html("Last @ " + moment().format("DD-MM-YYYY HH:mm:ss"));
    let html = ''

    html += '<div class="row" style="position:relative;">'
    html += '<div class="col-md-4">'
    html += '<div class="row" style="position:relative;">'
    html += showComponent('NIFTY 50', 1);
    html += showComponent('NIFTY BANK', 2);
    html += showComponentFutures('NIFTY 50', 6);
    html += showComponentFutures('NIFTY BANK', 6);
    html += showComponentOI('NIFTY 50');
    html += showComponentOI('NIFTY BANK');
    html += showComponent915Close('NIFTY 50', 6);
    html += showComponent915Close('NIFTY BANK', 6);
    html += showComponenAdvanceDeclineTrend('NIFTY 50', 6)
    html += showComponenAdvanceDeclineTrend('NIFTY BANK', 6)
    html += showComponenAdvanceDeclineFutureTrend('NIFTY 50', 6)
    html += showComponenAdvanceDeclineFutureTrend('NIFTY BANK', 6)
    html += '</div>'
    html += '</div>'
    html += '<div class="col-md-4">'
    html += '<div class="row" style="position:relative;">'
    html += showComponent('GIFT NIFTY', 3);
    html += showComponent('SENSEX', 4);
    html += showComponent915Close('ALL', 12);
    html += showTrendScoreBoard();
    html += showAdvanceDecline();
    html += showAdvanceDeclineFutures();
    html += showStockComponent();
    html += '</div>'
    html += '</div>'
    html += '<div class="col-md-4">'
    html += '<div class="row" style="position:relative;">'
    html += showComponent('RELIANCE', 5);
    html += showComponent('HDFCBANK', 6);
    html += showComponentFutures('RELIANCE', 6);
    html += showComponentFutures('HDFCBANK', 6);
    html += showComponentOI('RELIANCE');
    html += showComponentOI('HDFCBANK');

    html += showComponent('ICICIBANK', 1);
    html += showComponent('CRUDEOIL', 1);
    html += showComponentFutures('ICICIBANK', 6);
    html += showComponentFutures('CRUDEOIL', 6);
    html += showComponentOI('ICICIBANK');
    html += showComponentOI('CRUDEOIL');
    html += '</div>'
    html += '</div>'
    html += '</div>'

    jQ("#main-trade-bot-container").html(html);

    await callSleepForAWhile(1000)

    show915Trend('NIFTY 50');
    show915Trend('NIFTY BANK');
    show915Trend('ALL');

    try {
        await showTopChart('NIFTY 50');
    } catch (e) {
        console.log(e)
    }

    try {
        await showTopChart('NIFTY BANK');
    } catch (e) {
        console.log(e)
    }

    try {
        await showTopChart('GIFT NIFTY');
    } catch (e) {
        console.log(e)
    }

    try {
        await showTopChart('SENSEX');
    } catch (e) {
        console.log(e)
    }

    try {
        await showTopChart('RELIANCE');
    } catch (e) {
        console.log(e)
    }

    try {
        await showTopChart('HDFCBANK');
    } catch (e) {
        console.log(e)
    }

    try {
        let res = await showFutureDetails('NIFTY 50');
        setFutureDetails('NIFTY 50', res);
    } catch (e) {
        console.log(e)
    }

    try {
        res = await showFutureDetails('NIFTY BANK');
        setFutureDetails('NIFTY BANK', res);
    } catch (e) {
        console.log(e)
    }

    try {
        res = await showFutureDetails('RELIANCE');
        setFutureDetails('RELIANCE', res);
    } catch (e) {
        console.log(e)
    }

    try {
        res = await showFutureDetails('HDFCBANK');
        setFutureDetails('HDFCBANK', res);
    } catch (e) {
        console.log(e)
    }

    try {
        await showPrictionProbabilty('NIFTY 50')
        showOIOBVBarChart('NIFTY 50');
    } catch (e) {
        console.log(e)
    }

    try {
        await showPrictionProbabilty('NIFTY BANK')
        showOIOBVBarChart('NIFTY BANK');
    } catch (e) {
        console.log(e)
    }

    try {
        await showPrictionProbabilty('RELIANCE')
        showOIOBVBarChart('RELIANCE');
    } catch (e) {
        console.log(e)
    }

    try {
        await showPrictionProbabilty('HDFCBANK')
        showOIOBVBarChart('HDFCBANK');
    } catch (e) {
        console.log(e)
    }

    try {
        await showTopChart('ICICIBANK');
    } catch (e) {
        console.log(e)
    }

    try {
        let res = await showFutureDetails('ICICIBANK');
        setFutureDetails('ICICIBANK', res);
    } catch (e) {
        console.log(e)
    }

    try {
        await showPrictionProbabilty('ICICIBANK')
        showOIOBVBarChart('ICICIBANK');
    } catch (e) {
        console.log(e)
    }

    try {
        await showTopChartMCX('CRUDEOIL');
    } catch (e) {
        console.log(e)
    }

    try {
        res = await showFutureDetailsMCX('CRUDEOIL');
        setFutureDetails('CRUDEOIL', res);
        await showPrictionProbabiltyMCX('CRUDEOIL', res)
        showOIOBVBarChart('CRUDEOIL');
    } catch (e) {
        console.log(e)
    }

    try {
        await showAdvacenDeclineScanner();
    } catch (e) {
        console.log(e)
    }

    try {
        await showFuturesTrend();
    } catch (e) {
        console.log(e)
    }

    setScore()
    showStockList([]);

    jQ("#refresh-loader").addClass("hide");
}


function resetCount() {
    ALL_9_15_CLOSE_SCORE = 0;
    NIFTY_50_9_15_CLOSE_SCORE = 0;
    NIFTY_BANK_9_15_CLOSE_SCORE = 0;
    GIFT_NIFTY_9_15_CLOSE_SCORE = 0;
    SENSEX_9_15_CLOSE_SCORE = 0;
    RELIANCE_9_15_CLOSE_SCORE = 0;
    HDFCBANK_9_15_CLOSE_SCORE = 0;

    ALL_ADVANCE_DECLINE_SCORE = 0;
    NIFTY_50_ADVANCE_DECLINE_SCORE = 0;
    NIFTY_BANK_ADVANCE_DECLINE_SCORE = 0;

    ALL_FUTURES_TREND_SCORE = 0;
    NIFTY_50_FUTURES_TREND_SCORE = 0;
    NIFTY_BANK_FUTURES_TREND_SCORE = 0;

    NIFTY_50_OI_OBV_SCORE = 0;
    NIFTY_BANK_OI_OBV_SCORE = 0;
    RELIANCE_OI_OBV_SCORE = 0;
    HDFCBANK_OI_OBV_SCORE = 0;
}
function getTradeSignal(nifty, sensex, bank) {

    const strategyMap = {

        "ASO-ASO-ASO": { outcome: "Buy", level: "at BSO/BST" },
        "ASO-ASO-BSO": { outcome: "Buy/Sell", level: "at BSO/BST at AST/ASO" },
        "ASO-ASO-B/W": { outcome: "Buy/Sell", level: "at BSO/BST at AST/ASO" },
        "ASO-BSO-ASO": { outcome: "Buy", level: "at BSO/BST" },
        "ASO-BSO-BSO": { outcome: "Sell", level: "at ASO/AST" },
        "ASO-BSO-B/W": { outcome: "Sell", level: "at ASO/AST" },
        "ASO-B/W-ASO": { outcome: "Buy", level: "at BSO/BST" },
        "ASO-B/W-BSO": { outcome: "Sell", level: "at ASO/AST" },
        "ASO-B/W-B/W": { outcome: "Buy", level: "at BSO/BST" },

        "BSO-ASO-ASO": { outcome: "Buy/Sell", level: "at BSO/BST at AST/ASO" },
        "BSO-ASO-BSO": { outcome: "Sell", level: "at ASO/AST" },
        "BSO-ASO-B/W": { outcome: "Sell", level: "at ASO/AST" },
        "BSO-BSO-ASO": { outcome: "Sell", level: "at ASO/AST" },
        "BSO-BSO-BSO": { outcome: "Sell", level: "at ASO/AST" },
        "BSO-BSO-B/W": { outcome: "Sell", level: "at ASO/AST" },
        "BSO-B/W-ASO": { outcome: "Buy", level: "at BSO/BST" },
        "BSO-B/W-BSO": { outcome: "Sell", level: "at ASO/AST" },
        "BSO-B/W-B/W": { outcome: "Sell", level: "at ASO/AST" },

        "B/W-ASO-ASO": { outcome: "Buy", level: "at BSO/BST" },
        "B/W-ASO-BSO": { outcome: "Sell", level: "at ASO/AST" },
        "B/W-ASO-B/W": { outcome: "Buy/Sell", level: "at BSO/BST at AST/ASO" },
        "B/W-BSO-ASO": { outcome: "Buy/Sell", level: "at BSO/BST at AST/ASO" },
        "B/W-BSO-BSO": { outcome: "Sell", level: "at ASO/AST" },
        "B/W-BSO-B/W": { outcome: "Sell", level: "at ASO/AST" },
        "B/W-B/W-ASO": { outcome: "Buy", level: "at BSO/BST" },
        "B/W-B/W-BSO": { outcome: "Sell", level: "at ASO/AST" },
        "B/W-B/W-B/W": { outcome: "Sell", level: "at ASO/AST" }
    };

    const key = `${nifty}-${sensex}-${bank}`;

    return strategyMap[key] || { outcome: "Invalid Input", level: "No Level" };
}


let ALL_9_15_CLOSE_SCORE = 0;
let NIFTY_50_9_15_CLOSE_SCORE = 0;
let NIFTY_BANK_9_15_CLOSE_SCORE = 0;
let GIFT_NIFTY_9_15_CLOSE_SCORE = 0;
let SENSEX_9_15_CLOSE_SCORE = 0;
let RELIANCE_9_15_CLOSE_SCORE = 0;
let HDFCBANK_9_15_CLOSE_SCORE = 0;

let ALL_ADVANCE_DECLINE_SCORE = 0;
let NIFTY_50_ADVANCE_DECLINE_SCORE = 0;
let NIFTY_BANK_ADVANCE_DECLINE_SCORE = 0;

let ALL_FUTURES_TREND_SCORE = 0;
let NIFTY_50_FUTURES_TREND_SCORE = 0;
let NIFTY_BANK_FUTURES_TREND_SCORE = 0;

let NIFTY_50_OI_OBV_SCORE = 0;
let NIFTY_BANK_OI_OBV_SCORE = 0;
let RELIANCE_OI_OBV_SCORE = 0;
let HDFCBANK_OI_OBV_SCORE = 0;

function setScore() {


    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));
    if (!breakOutNineFifteen) {
        breakOutNineFifteen = {}
    }

    if (breakOutNineFifteen['GIFT NIFTY']) {
        if (breakOutNineFifteen['GIFT NIFTY']['CLOSE_9_15'] == "ASO") {
            GIFT_NIFTY_9_15_CLOSE_SCORE = 1;
        } else if (breakOutNineFifteen['GIFT NIFTY']['CLOSE_9_15'] == "BSO") {
            GIFT_NIFTY_9_15_CLOSE_SCORE = -1;
        }
    }

    if (breakOutNineFifteen['NIFTY 50']) {
        if (breakOutNineFifteen['NIFTY 50']['CLOSE_9_15'] == "ASO") {
            NIFTY_50_9_15_CLOSE_SCORE = 1;
        } else if (breakOutNineFifteen['NIFTY 50']['CLOSE_9_15'] == "BSO") {
            NIFTY_50_9_15_CLOSE_SCORE = -1;
        }
    }

    if (breakOutNineFifteen['NIFTY BANK']) {
        if (breakOutNineFifteen['NIFTY BANK']['CLOSE_9_15'] == "ASO") {
            NIFTY_BANK_9_15_CLOSE_SCORE = 1;
        } else if (breakOutNineFifteen['NIFTY BANK']['CLOSE_9_15'] == "BSO") {
            NIFTY_BANK_9_15_CLOSE_SCORE = -1;
        }
    }

    if (breakOutNineFifteen['SENSEX']) {
        if (breakOutNineFifteen['SENSEX']['CLOSE_9_15'] == "ASO") {
            SENSEX_9_15_CLOSE_SCORE = 1;
        } else if (breakOutNineFifteen['SENSEX']['CLOSE_9_15'] == "BSO") {
            SENSEX_9_15_CLOSE_SCORE = -1;
        }
    }

    if (breakOutNineFifteen['RELIANCE']) {
        if (breakOutNineFifteen['RELIANCE']['CLOSE_9_15'] == "ASO") {
            RELIANCE_9_15_CLOSE_SCORE = 1;
        } else if (breakOutNineFifteen['RELIANCE']['CLOSE_9_15'] == "BSO") {
            RELIANCE_9_15_CLOSE_SCORE = -1;
        }
    }

    if (breakOutNineFifteen['HDFCBANK']) {
        if (breakOutNineFifteen['HDFCBANK']['CLOSE_9_15'] == "ASO") {
            HDFCBANK_9_15_CLOSE_SCORE = 1;
        } else if (breakOutNineFifteen['HDFCBANK']['CLOSE_9_15'] == "BSO") {
            HDFCBANK_9_15_CLOSE_SCORE = -1;
        }
    }
    let asoCount = 0;
    let bsoCount = 0;
    jQ.each(breakOutNineFifteen, function (index, item) {
        if (item['CLOSE_9_15'] == 'ASO') {
            asoCount++;
        }
        if (item['CLOSE_9_15'] == 'BSO') {
            bsoCount++;
        }
    });

    if (asoCount > bsoCount) {
        ALL_9_15_CLOSE_SCORE = 1;
    } else if (bsoCount > asoCount) {
        ALL_9_15_CLOSE_SCORE = -1;
    }

    let SCORE = ALL_9_15_CLOSE_SCORE +
        NIFTY_50_9_15_CLOSE_SCORE +
        NIFTY_BANK_9_15_CLOSE_SCORE +
        GIFT_NIFTY_9_15_CLOSE_SCORE +
        SENSEX_9_15_CLOSE_SCORE +
        RELIANCE_9_15_CLOSE_SCORE +
        HDFCBANK_9_15_CLOSE_SCORE +
        ALL_ADVANCE_DECLINE_SCORE +
        NIFTY_50_ADVANCE_DECLINE_SCORE +
        NIFTY_BANK_ADVANCE_DECLINE_SCORE +
        ALL_FUTURES_TREND_SCORE +
        NIFTY_50_FUTURES_TREND_SCORE +
        NIFTY_BANK_FUTURES_TREND_SCORE +
        NIFTY_50_OI_OBV_SCORE +
        NIFTY_BANK_OI_OBV_SCORE +
        RELIANCE_OI_OBV_SCORE +
        HDFCBANK_OI_OBV_SCORE;

    chart = c3.generate({
        bindto: "#trend-scoreboard",
        data: {
            columns: [
                ['SCORE', SCORE]
            ],
            type: 'gauge',
        },
        gauge: {
            min: -20, // Set minimum to a negative number
            max: 20,  // Set maximum
            label: {
                format: function (value, ratio) {
                    return value; // Display the actual value
                }
            },
        },
        color: {
            pattern: ['#FF0000', '#F97600', '#F6C600', '#60B044'],
            threshold: {
                values: [0, 1, 5, 8]
            }
        }
    });

    let output = getTradeSignal(breakOutNineFifteen['NIFTY 50']['CLOSE_9_15'], breakOutNineFifteen['SENSEX']['CLOSE_9_15'], breakOutNineFifteen['NIFTY BANK']['CLOSE_9_15']);

    let html = ''

    html += '<div class="row">'

    html += '<div class="col-md-12">'
    if (output['outcome'] == "Buy") {
        html += '<div class="badge bg-success">' + output['outcome'] + '</div>';
    } else if (output['outcome'] == "Sell") {
        html += '<div class="badge bg-danger">' + output['outcome'] + '</div>';
    } else {
        html += '<div class="badge bg-secondary">' + output['outcome'] + '</div>';
    }
    html += '</div>'

    html += '<div class="col-md-12">'
    html += '<div>Level : ' + output['level'] + '</div>'
    html += '</div>'

    html += '</div>'

    jQ("#trend-scoreboard-outcome").html(html);

    html = ''

    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table  class="table display nowrap" style="width: 100%;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>SCORE FLAG</th>'
    html += '<th>SCORE</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'

    html += '<tr>'
    html += '<td>ALL_9_15_CLOSE_SCORE</td>'
    html += '<td>' + ALL_9_15_CLOSE_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>NIFTY_50_9_15_CLOSE_SCORE</td>'
    html += '<td>' + NIFTY_50_9_15_CLOSE_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>NIFTY_BANK_9_15_CLOSE_SCORE</td>'
    html += '<td>' + NIFTY_BANK_9_15_CLOSE_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>GIFT_NIFTY_9_15_CLOSE_SCORE</td>'
    html += '<td>' + GIFT_NIFTY_9_15_CLOSE_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>SENSEX_9_15_CLOSE_SCORE</td>'
    html += '<td>' + SENSEX_9_15_CLOSE_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>RELIANCE_9_15_CLOSE_SCORE</td>'
    html += '<td>' + RELIANCE_9_15_CLOSE_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>HDFCBANK_9_15_CLOSE_SCORE</td>'
    html += '<td>' + HDFCBANK_9_15_CLOSE_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>ALL_ADVANCE_DECLINE_SCORE</td>'
    html += '<td>' + ALL_ADVANCE_DECLINE_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>NIFTY_50_ADVANCE_DECLINE_SCORE</td>'
    html += '<td>' + NIFTY_50_ADVANCE_DECLINE_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>NIFTY_BANK_ADVANCE_DECLINE_SCORE</td>'
    html += '<td>' + NIFTY_BANK_ADVANCE_DECLINE_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>ALL_FUTURES_TREND_SCORE</td>'
    html += '<td>' + ALL_FUTURES_TREND_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>NIFTY_50_FUTURES_TREND_SCORE</td>'
    html += '<td>' + NIFTY_50_FUTURES_TREND_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>NIFTY_BANK_FUTURES_TREND_SCORE</td>'
    html += '<td>' + NIFTY_BANK_FUTURES_TREND_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>NIFTY_50_OI_OBV_SCORE</td>'
    html += '<td>' + NIFTY_50_OI_OBV_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>NIFTY_BANK_OI_OBV_SCORE</td>'
    html += '<td>' + NIFTY_BANK_OI_OBV_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>RELIANCE_OI_OBV_SCORE</td>'
    html += '<td>' + RELIANCE_OI_OBV_SCORE + '</td>'
    html += '</tr>'

    html += '<tr>'
    html += '<td>HDFCBANK_OI_OBV_SCORE</td>'
    html += '<td>' + HDFCBANK_OI_OBV_SCORE + '</td>'
    html += '</tr>'

    html += '</tbody>'
    html += '</table>'
    html += '</div>'
    html += '</div>'

    jQ("#trend-scoreboard-table").html(html);

}


function showStockComponent() {
    let html = ''
    html += '<div class="col-md-12" style="border:1px solid #c3c3c3;">'
    html += '<div class="row" style="">'
    html += '<div class="col-md-12" style="position:relative;background-color:#ffbcb0;">'
    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size: .8rem;font-weight: 600;">INSTRUMENTS</h4>'
    html += '</div>'
    html += '<div class="col-md-12" style="height:10rem;position:relative;overflow-y:auto;">'
    html += '<table  class="table display nowrap" id="stock-list-table" style="width: 100%;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>SYMBOL</th>'
    html += '<th>OPEN</th>'
    html += '<th>OPEN %</th>'
    html += '<th>CH %</th>'
    html += '<th>LTP</th>'
    html += '<th>VOLUME</th>'
    html += '<th>TREND</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'
    html += '</div>'
    html += '</div>'
    html += '</div>'
    return html;
}

function setFutureDetails(name, data) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    jQ("#" + tempName + "-futures").html(data['PLUS'] + '<br/>' + data['MINUS']);

    if (name != "CRUDEOIL") {
        let scriptData = generateTrend(name)
        let premium = parseFloat(scriptData['ltp']) - parseFloat(data['quote']['close']);
        let html = '';
        if (premium > 0) {
            html += '<div class="badge bg-success">+' + premium.toFixed(0) + '</div>';
        } else if (premium < 0) {
            html += '<div class="badge bg-danger">' + premium.toFixed(0) + '</div>';
        } else {
            html += '<div class="badge bg-secondary">' + premium.toFixed(0) + '</div>';
        }
        jQ("#" + tempName + "-futures-premium").html(html);
    }
}

function showAdvanceDecline() {
    let html = ''
    html += '<div class="col-md-12" style="border:1px solid #c3c3c3;">'
    html += '<div class="row" style="">'
    html += '<div class="col-md-12" style="position:relative;background-color:#ffbcb0;">'
    html += '<span style="position: absolute;left: .2rem;top: .2rem;"  data-name="' + name + '" class="badge bg-secondary refresh-advance-decline"><i class="bi bi-arrow-clockwise"></i></span>'

    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size: .8rem;font-weight: 600;">A/D ' + ' ' + '[<span id="all-advance-decline-adr">ADR</span>]</h4>'
    html += '</div>'
    html += '<div class="col-md-12" style="height:10rem;position:relative;text-align:center;">'
    html += '<div id="advance-decline-trend"></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'

    return html;
}

function showAdvanceDeclineFutures() {
    let html = ''
    html += '<div class="col-md-12" style="border:1px solid #c3c3c3;">'
    html += '<div class="row" style="">'
    html += '<div class="col-md-12" style="position:relative;background-color:#ffbcb0;">'
    html += '<span style="position: absolute;left: .2rem;top: .2rem;"  data-name="' + name + '" class="badge bg-secondary refresh-advance-decline-futures"><i class="bi bi-arrow-clockwise"></i></span>'

    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size: .8rem;font-weight: 600;">A/D FUTURES ' + ' ' + '[<span id="all-advance-decline-adr-future">ADR</span>]</h4>'
    html += '</div>'
    html += '<div class="col-md-12" style="height:10rem;position:relative;text-align:center;">'
    html += '<div id="advance-decline-futures-trend"></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'

    return html;
}

function showTrendScoreBoard() {
    let html = ''
    html += '<div class="col-md-12" style="border:1px solid #c3c3c3;">'
    html += '<div class="row" style="">'
    html += '<div class="col-md-12" style="position:relative;background-color:#ffbcb0;">'
    html += '<span style="position: absolute;left: .2rem;top: .2rem;" class="badge bg-secondary show-notes">i</span>'
    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size: .8rem;font-weight: 600;">TREND SCOREBOARD </h4>'
    html += '</div>'
    html += '<div class="col-md-12" style="height:10rem;position:relative;text-align:center;overflow-y:auto;">'
    html += '<div class="row">'
    html += '<div class="col-md-6" id="trend-scoreboard"></div>'
    html += '<div class="col-md-6" id="trend-scoreboard-outcome"></div>'
    html += '</div>'
    html += '<div class="row">'
    html += '<div class="col-md-12" id="trend-scoreboard-table"></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'

    return html;
}

jQ(document).on("click", ".show-notes", function () {
    showNotes();
});

function showNotes() {
    let htmlNote = ''
    htmlNote += '<div class="row" style="">'
    htmlNote += '<div class="col-md-12">'
    htmlNote += '<h5 style="text-align:center;">NOTES</h5>'
    htmlNote += '</div>'
    htmlNote += '<div class="col-md-12">'
    htmlNote += '<ul>'
    htmlNote += '<li>Depending on the number of ASO/BSO and  9:15 ASO/BSO</li>'
    htmlNote += '<li>2 ASO is strong uptrend</li>'
    htmlNote += '<li>2 BSO is strong downtrend</li>'
    htmlNote += '<li>Sensex ASO/BSO doesn\'t have much weightage</li>'
    htmlNote += '<li>Check RELIANCE AND HDFC BANK</li>'
    htmlNote += '<li>Check OI/OBV</li>'
    htmlNote += '<li>Check VIX -ve/+ve </li>'
    htmlNote += '<li>Check VIX range</li>'
    htmlNote += '<li>Check ADR</li>'
    htmlNote += '<li>Check CRUDE OIL</li>'
    htmlNote += '<li>Check Future Trend</li>'
    htmlNote += '<li>Check World Market/Europe Market around 12.45 - 1PM</li>'
    htmlNote += '</ul>'
    htmlNote += '</div>'
    htmlNote += '</div>'

    callSackBarInfo(htmlNote)
}

function placeHolder(name) {
    let tempName = name.replaceAll(" ", "-")
    let html = ''
    html += '<div class="col-md-2" style="border:1px solid #c3c3c3;">'
    html += '<div class="row" style="">'
    html += '<div class="col-md-12" style="position:relative;background-color:#ffbcb0;">'
    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size: .8rem;font-weight: 600;">PLACEHOLDER</h4>'
    html += '</div>'
    html += '<div class="col-md-12" style="height:10rem;position:relative;text-align:center;">'
    html += '<div id="' + tempName + '-placeholder"></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'
    return html;
}

function showComponent915Close(name, column) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let html = ''
    html += '<div class="col-md-' + column + '" style="border:1px solid #c3c3c3;">'
    html += '<div class="row" style="">'
    html += '<div class="col-md-12" style="position:relative;background-color:#ffbcb0;">'
    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size: .8rem;font-weight: 600;">9:15 CLOSE</h4>'
    html += '</div>'
    html += '<div class="col-md-12" style="height:10rem;position:relative;overflow-y:auto;">'
    html += '<div id="' + tempName + '-nine-fifteen-close" ></div>'
    html += '<div id="' + tempName + '-nine-fifteen-close-table"></div>'
    html += '</div>'

    html += '</div>'
    html += '</div>'
    return html;
}


function showComponenAdvanceDeclineTrend(name, column) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let html = ''
    html += '<div class="col-md-' + column + '" style="border:1px solid #c3c3c3;">'
    html += '<div class="row" style="">'
    html += '<div class="col-md-12" style="position:relative;background-color:#ffbcb0;">'
    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size: .8rem;font-weight: 600;">INDEX ' + '[<span id="' + tempName + '-advance-decline-adr">ADR</span>]</h4>'
    html += '</div>'
    html += '<div class="col-md-12" style="height:10rem;position:relative;overflow-y:auto;">'
    html += '<div id="' + tempName + '-advance-decline" ></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'
    return html;
}

function showComponenAdvanceDeclineFutureTrend(name, column) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let html = ''
    html += '<div class="col-md-' + column + '" style="border:1px solid #c3c3c3;">'
    html += '<div class="row" style="">'
    html += '<div class="col-md-12" style="position:relative;background-color:#ffbcb0;">'
    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size: .8rem;font-weight: 600;">FUT ' + '[<span id="' + tempName + '-advance-decline-adr-future">ADR</span>]</h4>'
    html += '</div>'
    html += '<div class="col-md-12" style="height:10rem;position:relative;overflow-y:auto;">'
    html += '<div id="' + tempName + '-advance-decline-future" ></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'
    return html;
}

function showComponentFutures(name, column) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let html = ''
    html += '<div class="col-md-' + column + '" style="border:1px solid #c3c3c3;">'
    html += '<div class="row" style="">'
    html += '<div class="col-md-12" style="position:relative;background-color:#ffbcb0;">'
    html += '<span style="position: absolute;left: .2rem;top: .2rem;"  data-name="' + name + '" class="badge bg-secondary refresh-futures"><i class="bi bi-arrow-clockwise"></i></span>'
    html += '<span id="' + tempName + '-futures-premium" style="position: absolute;left: 2.4rem;top: .2rem;"  data-name="' + name + '">PREMIUM</span>'

    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size: .8rem;font-weight: 600;">FUTURES</h4>'
    html += '</div>'
    html += '<div class="col-md-12" style="height:10rem;position:relative;text-align:center;">'
    html += '<div id="' + tempName + '-futures"></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'
    return html;
}

function showComponentOI(name) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let html = ''
    html += '<div class="col-md-6" style="border:1px solid #c3c3c3;">'
    html += '<div class="row" style="">'
    html += '<div class="col-md-12" style="position:relative;background-color:#ffbcb0;">'
    html += '<span style="position: absolute;left: .2rem;top: .2rem;" data-name="' + name + '" class="badge bg-secondary refresh-oi-obv"><i class="bi bi-arrow-clockwise"></i></span>'
    html += '<span id="' + tempName + '-pcr-probability" style="position: absolute;right: .2rem;top: .2rem;" data-name="' + name + '">PCR</span>'
    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size: .8rem;font-weight: 600;">OI/OBV</h4>'
    html += '</div>'
    html += '<div class="col-md-12" style="height:10rem;position:relative;">'
    html += '<div id="' + tempName + '-oi-obv" ></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'
    return html;
}

function showComponent(name, index) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let componentColor = "#ffffff";
    if (index % 2 === 0) {
        componentColor = "#edecec";
    }

    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));

    if (!breakOutNineFifteen) {
        breakOutNineFifteen = {}
    }

    let html = ''
    html += '<div class="col-md-6" style="border:1px solid #c3c3c3;background-color:' + componentColor + ';">'

    html += '<div class="row" style="position:relative;background-color: ' + (componentColorHeader[name] == undefined ? "#ffbcb0" : componentColorHeader[name]) + '">'
    html += '<div class="col-md-12">'

    let bgClass = '';
    if (breakOutNineFifteen[name]) {
        if (breakOutNineFifteen[name]['CLOSE_9_15'] == "ASO") {
            bgClass = 'bg-success';
        }
        if (breakOutNineFifteen[name]['CLOSE_9_15'] == "BSO") {
            bgClass = 'bg-danger';
        }
        if (breakOutNineFifteen[name]['CLOSE_9_15'] == "B/W") {
            bgClass = 'bg-info';
        }
    } else {
        breakOutNineFifteen[name] = {}
        breakOutNineFifteen[name]['CLOSE_9_15'] = 'N/A'
    }

    let link = '<a target="_blank" href="https://kite.zerodha.com/markets/ext/chart/web/tvc/' + 'NSE' + '/' + name + '/' + instrumentTokens[name] + '">' + name + '</a>'

    html += '<span style="position: absolute;left: 2rem;top: .2rem;" data-index="' + index + '" data-name="' + name + '" class="badge bg-secondary show-info">i</span>'
    html += '<span style="position: absolute;left: .2rem;top: .2rem;" data-index="' + index + '" data-name="' + name + '" class="badge bg-secondary refresh-chart"><i class="bi bi-arrow-clockwise"></i></span>'

    html += '<span class="badge ' + bgClass + '" style="position:absolute;top:.2rem;right:.2rem;">' + breakOutNineFifteen[name]['CLOSE_9_15'] + '</span>'
    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size: .8rem;font-weight: 600;">' + link + '</h4>'
    html += '</div>'
    html += '</div>'

    html += '<div class="row" style="">'
    html += '<div class="col-md-12" style="height:10rem;position:relative;background-color:#000000;">'
    html += '<div id="' + tempName + '-chart" ></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'
    return html;
}


jQ(document).on("click", ".refresh-chart", function () {
    let name = jQ(this).attr("data-name");
    let that = jQ(this)
    commonRefershChart(name, that)
})

async function commonRefershChart(name, that) {
    try {
        that.attr("disabled", true);
        if (name != 'CRUDEOIL') {
            await showTopChart(name);
        } else {
            await showTopChartMCX(name);
        }

        that.attr("disabled", false)
    } catch (e) {
        console.log(e)
    }
}

jQ(document).on("click", ".refresh-futures", function () {
    let name = jQ(this).attr("data-name");
    let that = jQ(this)
    commonRefershFutures(name, that)
})

async function commonRefershFutures(name, that) {
    try {
        that.attr("disabled", true);
        let res = {}
        if (name != 'CRUDEOIL') {
            res = await showFutureDetails(name);
            setFutureDetails(name, res);
        } else {
            res = await showFutureDetailsMCX(name);
            setFutureDetails(name, res);
        }
        that.attr("disabled", false)
    } catch (e) {
        console.log(e)
    }
}


jQ(document).on("click", ".refresh-oi-obv", function () {
    let name = jQ(this).attr("data-name");
    let that = jQ(this)
    commonRefershOIOBV(name, that)
})

async function commonRefershOIOBV(name, that) {
    try {
        that.attr("disabled", true);
        let res = {}
        if (name != 'CRUDEOIL') {
            await showPrictionProbabilty(name)
            showOIOBVBarChart(name);
        } else {
            res = await showFutureDetailsMCX(name);
            setFutureDetails(name, res);
            await showPrictionProbabiltyMCX(name, res)
            showOIOBVBarChart(name);
        }
        that.attr("disabled", false)
    } catch (e) {
        console.log(e)
    }
}


jQ(document).on("click", ".refresh-advance-decline", function () {
    let name = jQ(this).attr("data-name");
    let that = jQ(this)
    commonRefershAdvanceDecline(name, that)
})

async function commonRefershAdvanceDecline(name, that) {
    try {
        that.attr("disabled", true);
        await showAdvacenDeclineScanner();
        that.attr("disabled", false)
    } catch (e) {
        console.log(e)
    }
}


jQ(document).on("click", ".refresh-advance-decline-futures", function () {
    let name = jQ(this).attr("data-name");
    let that = jQ(this)
    commonRefershAdvanceDeclineFutures(name, that)
})

async function commonRefershAdvanceDeclineFutures(name, that) {
    try {
        that.attr("disabled", true);
        await showFuturesTrend();
        that.attr("disabled", false)
    } catch (e) {
        console.log(e)
    }
}


jQ(document).on("click", ".show-info", function () {
    let name = jQ(this).attr("data-name");
    let data = generateTrend(name);
    let html = ''
    html += '<div style="text-align:center;">'
    html += name
    html += '</div>'
    html += '<div>'
    html += '<div>'
    html += ' LTP : ' + parseFloat(data['ltp']);
    html += '</div>'
    html += ' OPEN : ' + parseFloat(data['open']);
    html += '</div>'
    html += '<div>'
    html += ' ASO : ' + parseFloat(data['strikeData']['ustrikeOne']);
    html += '</div>'
    html += '<div>'
    html += ' AST : ' + parseFloat(data['strikeData']['ustrikeTwo']);
    html += '</div>'
    html += ' BSO : ' + parseFloat(data['strikeData']['bstrikeOne']);
    html += '</div>'
    html += '<div>'
    html += '<div>'
    html += ' BST : ' + parseFloat(data['strikeData']['bstrikeTwo']);
    html += '</div>'
    html += '<div>'
    html += ' VIXU : ' + parseFloat(data['vix']['vixDDUpper']);
    html += '</div>'
    html += '<div>'
    html += ' VIXL : ' + parseFloat(data['vix']['vixDDLower']);
    html += '</div>'
    html += '<div>'
    html += ' TREND : ' + data['trends'].join(", ");
    html += '</div>'
    callSackBarInfo(html)
});

async function showTopChart(name) {
    try {
        let tempName = name.replaceAll(" ", "-")
        tempName = tempName.replaceAll("&", "-")

        let data = await getHistoricalDataUsingPromise(instrumentTokens[name], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
        await savePreviousStockQuote(tempName, instrumentTokens[name])
        let previousQuote = JSON.parse(localStorage.getItem(tempName + "_PREVIOUS_DAY_QUOTE"));
        let scriptData = generateTrend(name)
        let open = scriptData['open']

        let max = scriptData['vix'].vixDDUpper
        let min = scriptData['vix'].vixDDLower

        if (max < scriptData['strikeData'].ustrikeTwo) {
            max = scriptData['strikeData'].ustrikeTwo
        }

        if (min > scriptData['strikeData'].bstrikeTwo) {
            min = scriptData['strikeData'].bstrikeTwo
        }

        try {
            if (previousQuote.data.candles[previousQuote.data.candles.length - 1][4] > max) {
                max = previousQuote.data.candles[previousQuote.data.candles.length - 1][4]
            }

            if (previousQuote.data.candles[previousQuote.data.candles.length - 1][4] < min) {
                min = previousQuote.data.candles[previousQuote.data.candles.length - 1][4]
            }
        } catch (error) {
            console.error("Error in calculating max min for " + name, error);
        }

        let columns = []
        let x = ['x']
        let column = ["Close"]

        jQ.each(data.data.candles, function (index, item) {
            x.push(moment(item[0]).format("YYYY-MM-DD HH:mm:ss"))
            column.push(parseFloat(item[4]));

            if (item[4] > max) {
                max = item[4]
            }

            if (item[4] < min) {
                min = item[4]
            }
        });

        columns.push(x)
        columns.push(column)


        let lines = []
        lines.push({ position: 'start', value: parseFloat(scriptData['vix'].vixDDLower), text: 'VIXL: ' + scriptData['vix'].vixDDLower, class: 'vixl-line-class' });
        lines.push({ position: 'start', value: parseFloat(scriptData['vix'].vixDDUpper), text: 'VIXU: ' + scriptData['vix'].vixDDUpper, class: 'vixu-line-class' });
        lines.push({ position: 'start', value: parseFloat(scriptData['strikeData'].ustrikeTwo), text: 'AST: ' + scriptData['strikeData'].ustrikeTwo, class: 'ustrike-two-line-class' });
        lines.push({ position: 'start', value: parseFloat(scriptData['strikeData'].ustrikeOne), text: 'ASO: ' + scriptData['strikeData'].ustrikeOne, class: 'ustrike-one-line-class' });
        lines.push({ position: 'start', value: parseFloat(scriptData['strikeData'].bstrikeOne), text: 'BSO: ' + scriptData['strikeData'].bstrikeOne, class: 'bstrike-one-line-class' });
        lines.push({ position: 'start', value: parseFloat(scriptData['strikeData'].bstrikeTwo), text: 'BST: ' + scriptData['strikeData'].bstrikeTwo, class: 'bstrike-two-line-class' });


        lines.push({ position: 'start', value: parseFloat(open), text: 'OPEN: ' + open, class: 'open-price-class' });


        let chartId = tempName;
        var chart = c3.generate({
            bindto: "#" + chartId + "-chart",
            size: {
                height: 150
            },
            data: {
                x: 'x',
                xFormat: '%Y-%m-%d %H:%M:%S',
                columns: columns,
                type: 'spline'
            },
            point: {
                show: false
            },

            grid: {
                x: {
                    lines: []
                },
                y: {
                    lines: lines
                }
            },

            axis: {
                x: {
                    type: 'timeseries',
                    tick: {
                        // Display format for the x-axis ticks
                        format: '%H:%M',
                        rotate: 60 // Optional: rotate labels for better readability with long formats
                    },
                    show: false,
                },
                y: {
                    show: false,
                    min: parseFloat(min),
                    max: parseFloat(max),
                },

            },
            legend: {
                show: false // Hide the legend      
            }
        });
    } catch (error) {
        console.error("Error in showTopChart for " + name, error);
    }
}

function updateScoresOfOI(name, item) {
    let SCORE = 0
    if (item['CHG_OI_PE'] > item['CHG_OI_CE']) {
        SCORE++
    } else if (item['CE_OBV'][item['CE_OBV'].length - 1]['obv'] > item['PE_OBV'][item['PE_OBV'].length - 1]['obv']) {
        SCORE++
    } else if (item['PE_OBV'][item['PE_OBV'].length - 1]['obv'] < 0) {
        SCORE++
    }

    if (item['OI_PE'] > item['OI_CE']) {
        SCORE++
    }

    if (item['OI_CE'] > item['OI_PE']) {
        SCORE--
    }

    if (item['CHG_OI_CE'] > item['CHG_OI_PE']) {
        SCORE--
    } else if (item['PE_OBV'][item['PE_OBV'].length - 1]['obv'] > item['CE_OBV'][item['CE_OBV'].length - 1]['obv']) {
        SCORE--
    } else if (item['CE_OBV'][item['CE_OBV'].length - 1]['obv'] > 0) {
        SCORE--
    }

    if (name == "NIFTY 50") {
        NIFTY_50_OI_OBV_SCORE += SCORE
    } else if (name == "NIFTY BANK") {
        NIFTY_BANK_OI_OBV_SCORE += SCORE
    } else if (name == "RELIANCE") {
        RELIANCE_OI_OBV_SCORE += SCORE
    } else if (name == "HDFCBANK") {
        HDFCBANK_OI_OBV_SCORE += SCORE
    }
}

function show915Trend(name) {

    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let asoCount = 0;
    let bsoCount = 0;

    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));

    let checkList = FO_LIST;
    if (name == "NIFTY 50") {
        checkList = NIFTY_50_LIST;
    }

    if (name == "NIFTY BANK") {
        checkList = NIFTY_BANK_LIST;
    }


    let stockList = []
    if (breakOutNineFifteen) {
        jQ.each(breakOutNineFifteen, function (index, item) {
            if (item['CLOSE_9_15'] == 'ASO') {
                if (jQ.inArray(index, checkList) != -1) {
                    asoCount++;
                    stockList.push({ 'NAME': index, 'CLOSE_9_15': item['CLOSE_9_15'] });
                }
            }

            if (item['CLOSE_9_15'] == 'BSO') {
                if (jQ.inArray(index, checkList) != -1) {
                    bsoCount++;
                    stockList.push({ 'NAME': index, 'CLOSE_9_15': item['CLOSE_9_15'] });
                }
            }
        });
    }

    let columns = []
    let aso = ['ASO', asoCount]
    let bso = ['BSO', bsoCount]

    columns.push(aso);
    columns.push(bso);

    let chartId = tempName + "-nine-fifteen-close";
    var chart = c3.generate({
        bindto: "#" + chartId,
        size: {
            height: 150
        },
        data: {
            columns: columns,
            type: 'pie'
        },
        color: {
            pattern: ['#5ccf76', '#bc2709'],
        },
        pie: {
            label: {
                format: function (value, ratio, id) {
                    return value;
                }
            }
        },
        legend: {
            show: false
        }
    });

    let html = ''
    html += '<table class="table table-bordered">'
    html += '<thead><tr><th>Stock</th><th>Close</th></tr></thead>'
    html += '<tbody>'
    jQ.each(stockList, function (index, item) {
        html += '<tr>'
        let link = '<a target="_blank" href="https://kite.zerodha.com/markets/ext/chart/web/tvc/' + 'NSE' + '/' + item['NAME'] + '/' + instrumentTokens[item['NAME']] + '">' + item['NAME'] + '</a>'
        html += '<td>'
        html += link;
        html += '</td>'
        html += '<td>' + item['CLOSE_9_15'] + '</td></tr>'
    })
    html += '</tbody></table>'
    jQ("#" + tempName + "-nine-fifteen-close-table").html(html);
}

function showOIOBVBarChart(name) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let columns = [];

    let x = ['x']

    let oiCECH = ["CH CE OI"]
    let oiPECH = ["CH PE OI"]
    let oiCE = ["CE OI"]
    let oiPE = ["PE OI"]

    let oiCESUM = ["SUM CE OI"]
    let oiPESUM = ["SUM PE OI"]

    let oiCEOBV = ["CE OBV"]
    let oiPEOBV = ["PE OBV"]

    let data = stock[0]['DATA']['tableData']
    let oiData = stock[0]['DATA']

    let pcrHtml = ''
    let chPcrHtml = ''

    if (parseFloat(oiData['pcr'].trim()) > 1.3) {
        pcrHtml += '<span title="Very Bullish | Strong hands selling puts. But if extreme (>1.5), reversal possible." class="badge bg-success">' + oiData['pcr'] + '</span>'
    } else if (parseFloat(oiData['pcr'].trim()) > 0.7 && parseFloat(oiData['pcr'].trim()) < 1.0) {
        pcrHtml += '<span title="Neutral | Range-bound market expected. Sell options, don\'t buy." class="badge bg-info">' + oiData['pcr'] + '</span>'
    } else if (parseFloat(oiData['pcr'].trim()) < 0.5) {
        pcrHtml += '<span title="Very Bearish | Extreme bearish positioning. But could signal bottom." class="badge bg-danger">' + oiData['pcr'] + '</span>'
    } else if (parseFloat(oiData['pcr'].trim()) > 1.0 && parseFloat(oiData['pcr'].trim()) < 1.3) {
        pcrHtml += '<span title="Moderately Bullish | Healthy bullish sentiment. Good for buying dips." class="badge bg-warning">' + oiData['pcr'] + '</span>'
    } else if (parseFloat(oiData['pcr'].trim()) < 0.7) {
        pcrHtml += '<span title=" Bearish | Call selling dominating. Downside or sideways expected." class="badge bg-danger">' + oiData['pcr'] + '</span>'
    }


    if (parseFloat(oiData['chPcr'].trim()) > 1.3) {
        chPcrHtml += '<span title="Very Bullish | Strong hands selling puts. But if extreme (>1.5), reversal possible." class="badge bg-success">' + oiData['chPcr'] + '</span>'
    } else if (parseFloat(oiData['chPcr'].trim()) > 0.7 && parseFloat(oiData['chPcr'].trim()) < 1.0) {
        chPcrHtml += '<span title="Neutral | Range-bound market expected. Sell options, don\'t buy." class="badge bg-info">' + oiData['chPcr'] + '</span>'
    } else if (parseFloat(oiData['chPcr'].trim()) < 0.5) {
        chPcrHtml += '<span title="Very Bearish | Extreme bearish positioning. But could signal bottom." class="badge bg-danger">' + oiData['chPcr'] + '</span>'
    } else if (parseFloat(oiData['chPcr'].trim()) > 1.0 && parseFloat(oiData['chPcr'].trim()) < 1.3) {
        chPcrHtml += '<span title="Moderately Bullish | Healthy bullish sentiment. Good for buying dips." class="badge bg-warning">' + oiData['chPcr'] + '</span>'
    } else if (parseFloat(oiData['chPcr'].trim()) < 0.7) {
        chPcrHtml += '<span title=" Bearish | Call selling dominating. Downside or sideways expected." class="badge bg-danger">' + oiData['chPcr'] + '</span>'
    }


    jQ("#" + tempName + "-pcr-probability").html(pcrHtml + " | " + chPcrHtml)

    jQ.each(data, function (index, item) {
        x.push(item['STRIKE'])
        oiCE.push(item['OI_CE'])
        oiPE.push(item['OI_PE'])
        oiCECH.push(item['CHG_OI_CE'])
        oiPECH.push(item['CHG_OI_PE'])
        let sumCE = parseFloat(item['OI_CE']) + parseFloat(item['CHG_OI_CE'])
        let sumPE = parseFloat(item['OI_PE']) + parseFloat(item['CHG_OI_PE'])
        oiCESUM.push(sumCE.toFixed(1))
        oiPESUM.push(sumPE.toFixed(1))
        oiCEOBV.push(item['CE_OBV'][item['CE_OBV'].length - 1]['obv'])
        oiPEOBV.push(item['PE_OBV'][item['PE_OBV'].length - 1]['obv'])
    })

    columns.push(x)
    columns.push(oiCECH)
    columns.push(oiPECH)
    columns.push(oiCE)
    columns.push(oiPE)
    columns.push(oiCEOBV)
    columns.push(oiPEOBV)
    columns.push(oiCESUM)
    columns.push(oiPESUM)



    var chart = c3.generate({
        bindto: "#" + tempName + "-oi-obv",
        size: {
            height: 150
        },
        data: {
            x: 'x',
            columns: columns,
            type: 'bar',
            colors: {
                'CE OI': '#FF0000',
                'PE OI': '#11ff00',
                'CH CE OI': '#FF0000',
                'CH PE OI': '#11ff00',
                'SUM CE OI': '#FF0000',
                'SUM PE OI': '#11ff00',
                'CE OBV': '#d400ff',
                'PE OBV': '#0059ff'

            },
            /*color: function (color, d) {
                if (d.value !== undefined) {
                    if (d.id === 'CE OI' && d.value > 0) {
                        return '#bc2709'; //Calls are being sold and the price is expected to go down, so red color
                    } else if (d.id === 'CE OI' && d.value < 0) {
                        return '#bc2709'; // Call writing is happening and the price is expected to go up, so green color
                    } else if (d.id === 'PE OI' && d.value > 0) {
                        return '#5ccf76'; //Put writing is happening and the price is expected to go up, so green color
                    } else if (d.id === 'PE OI' && d.value < 0) {
                        return '#5ccf76'; // Put buying closing the  positions
                    } else if (d.id === 'CE OI OBV' && d.value > 0) {
                        return '#5ccf76'; // Call are bein bought
                    } else if (d.id === 'CE OI OBV' && d.value < 0) {
                        return '#bc2709'; // Call writing is happening
                    } else if (d.id === 'PE OI OBV' && d.value > 0) {
                        return '#bc2709'; // Puts arebeing bought   
                    } else if (d.id === 'PE OI OBV' && d.value < 0) {
                        return '#5ccf76'; // Put writing is happening
                    }
                }
                // For legend items or other cases, return the default color
                return color;
            },*/

        },

        bar: {
            width: {
                ratio: 0.5
            }
        },
        axis: {
            x: {
                show: true,
            },
            y: {
                show: false,
            },
        },
        legend: {
            show: false // Hide the legend      
        }
    });
}

async function showFutureDetails(name) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let futures;
    jQ.each(futureInstrumentsList, function (index, item) {
        let instName = name
        if (instName == "NIFTY 50") {
            instName = 'NIFTY'
        }

        if (instName == "NIFTY BANK") {
            instName = 'BANKNIFTY'
        }

        if (item.name == instName) {
            futures = item;
        }
    })
    let pres = await getHistoricalDataUsingPromise(futures['instrument_token'], PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day');
    let cres = await getHistoricalDataUsingPromise(futures['instrument_token'], CURRENT_DAY, CURRENT_DAY, '5minute');


    let data = []
    let prevData = []
    jQ.each(cres.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("HH:mm")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map.oi = item[6]
        data.push(map);
    });

    jQ.each(pres.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("HH:mm")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map.oi = item[6]
        prevData.push(map);
    });

    prevData = prevData[prevData.length - 1];
    let resp = {}
    if (tempName == "BANKNIFTY") {
        resp = showTableAiBankNiftyPrediction(data[data.length - 1], prevData, futures['lot_size'])
    } else {
        resp = showTableAiNiftyPrediction(data[data.length - 1], prevData, futures['lot_size'])
    }
    resp['quote'] = data[data.length - 1]
    return resp;
}

function showTableAiNiftyPrediction(quote, prevQuote, lotSize) {
    let data = {}
    quote.volume = parseInt(quote.volume)
    var pTypicalPrice = (parseFloat(prevQuote.high) + parseFloat(prevQuote.low) + parseFloat(prevQuote.close)) / 3
    var cTypicalPrice = (parseFloat(quote.high) + parseFloat(quote.low) + parseFloat(quote.close)) / 3
    var cVolumePrice = cTypicalPrice * parseFloat(quote.volume)
    var pVolumePrice = pTypicalPrice * parseFloat(prevQuote.volume)
    var totalVolumePrice = cVolumePrice + pVolumePrice
    var totalVolume = parseInt(quote.volume) + parseInt(prevQuote.volume)
    var vwapPrice = (totalVolumePrice / totalVolume).toFixed(2)
    var vwap = vwapPrice ? vwapPrice : 0;
    var openPrice = quote.open;
    var highPrice = quote.high;
    var lowPrice = quote.low;
    var lastPrice = quote.close;
    var previousClose = prevQuote['close']
    var pChange = ((lastPrice - previousClose) / previousClose) * 100
    var change = (lastPrice - previousClose).toFixed(2)
    var shortCoveringOrLongUnwinding = false;
    var price;
    var oi;
    var booleanValue = false;
    var correctedVwap = vwap;
    var lastPrice = lastPrice;
    if (correctedVwap <= lastPrice) {
        booleanValue = true;
    } else {
        booleanValue = false;
    }
    var openInterest = quote['oi'] / lotSize;
    var previousOI = prevQuote['oi'] / lotSize
    var changeinOpenInterest = (openInterest - previousOI).toFixed(2)
    var pchangeinOpenInterest = (((openInterest - previousOI) / previousOI) * 100).toFixed(2);
    var changeEvo1 = change;
    var pChangeEvo = pchangeinOpenInterest;
    var changeEvo = changeinOpenInterest;
    var bottomTriangle = '<i class="bi bi-caret-down">DOWN</i>'
    var upTriangle = '<i class="bi bi-caret-up">UP</i>'
    var openInterestMarkup = '';
    var openInterestDirectionMarkup = '';
    var openInterestChangeMarkup = '';
    var openInterestChangePercMarkup = '';

    if (changeinOpenInterest > 0) {
        openInterestMarkup = '<span class=" badge bg-success">' + openInterest + '</span>'
        openInterestDirectionMarkup = '<span class=" badge bg-success" >' + upTriangle + '</span>'
        openInterestChangeMarkup = '<span class=" badge bg-success" >' + changeinOpenInterest + '</span>'
        oi = "+";
    } else {
        openInterestMarkup = '<span class=" badge bg-danger">' + openInterest + '</span>'
        openInterestDirectionMarkup = '<span class=" badge bg-danger">' + bottomTriangle + '</span>'
        openInterestChangeMarkup = '<span class=" badge bg-danger">' + changeinOpenInterest + '</span>'
        oi = "-";
    }

    if (pchangeinOpenInterest > 0) {
        openInterestChangePercMarkup = '<span class=" badge bg-success">' + pchangeinOpenInterest + '%</span>'
    } else {
        openInterestChangePercMarkup = '<span class=" badge bg-danger">' + pchangeinOpenInterest + '%</span>'
    }

    if (changeEvo1 > 10 && booleanValue == true) { // percentage bull side
        price = "+";
    } else if (changeEvo1 <= -10 && booleanValue == false) { // bear side,long unwinding
        price = "-";
    } else if (changeEvo1 >= 10 && booleanValue == false) { // bear side, short
        price = "-";
    } else {
        price = "+-";// no clear trend
    }

    if (changeEvo < 0 && pChangeEvo < -2) {
        shortCoveringOrLongUnwinding = true;
    } else {
        shortCoveringOrLongUnwinding = false;
    }

    var remark = "No Clear Trend, Bulls are still waiting";

    var dogImgContainer = '<span class="">' + dogImage + '</span>'
    var bullImageImgContainer = '<span class="">' + bullImage + '</span>'
    var bearImageImgContainer = '<span class="">' + bearImage + '</span>'
    var hulkImageImgContainer = '<span class="">' + hulkImage + '</span>'
    var captainImgContainer = '<span class="">' + captain + '</span>'
    var lokiImgContainer = '<span class="">' + loki + '</span>'
    var ironManImgContainer = '<span class="">' + ironMan + '</span>'
    var thorImgContainer = '<span class="">' + thor + '</span>'
    var hulNewImgContainer = '<span class="">' + hulkImageNew + '</span>'
    var doctorStrangeImgContainer = '<span class="">' + doctor_strange + '</span>'
    remark += dogImgContainer
    var display = "+";

    var RemarkType = ""

    if (price == "+" && oi == "+") {
        remark = '<div class="badge bg-success">Long</div>'
        display = "+";
        RemarkType = "LONG"
    } else if (price == "-" && oi == "+") {
        remark = '<div class="badge bg-danger">Short</div>'
        display = "-";
        RemarkType = "SHORT"
    } else if (price == "+" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = '<div class="badge bg-success">Short Covering</div>'
        display = "+";
        RemarkType = "SHOT_COVERING"
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = dogImgContainer + '<div class="badge bg-danger">Long Unwinding</div>'
        display = "-";
        RemarkType = "LONG_UNWINDING"
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding == false) {
        remark = dogImgContainer + lokiImgContainer + '<div class="badge bg-danger">Bears Coming,Sell On Rise</div>'
        display = "-";
        RemarkType = "BEARS_COMING_SELL_ON_RISE"
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo >= 10) {
        remark = '<div class="badge bg-danger">Gambling! Buy,News & Events</div>'
        display = "+";
        RemarkType = "GAMBLING_BUY_NEWS_AND_EVENTS"
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo < 10) {
        remark = '<div class="badge bg-danger">Caution! Writers Eroding Premium</div>'
        display = "+";
        RemarkType = "CAUTION_WRITES_ERODING_PREMIUM"
    } else {
        remark = captainImgContainer + '<div class="badge bg-danger">Defence,Buy On Decline</div>'
        display = "+";
        RemarkType = "DEFENCE_BUY_ON_DECLINE"
    }

    data.REMARK = RemarkType

    var bullRemark = remark;
    var bearRemark = remark;
    var marketTrendPlus = ""
    var imageBullPlus = "";

    var openInterestMarkupBull = openInterestMarkup
    var openInterestDirectionMarkupBull = openInterestDirectionMarkup
    var openInterestChangeMarkupBull = openInterestChangeMarkup
    var openInterestChangePercMarkupBull = openInterestChangePercMarkup
    var niftyOILabelPlusBull = "NIFTY-OI"
    var otherRemarkType = ""
    var otherTrendRemarks = ""
    if (display == "+") {
        marketTrendPlus = '<div class=" badge bg-success">Hulk Arrived (+)</div>'
        otherTrendRemarks += '<div class="row">'
        otherTrendRemarks += '<div class="col-md-12">'
        otherTrendRemarks += "Hulk Arrived (+)"
        otherTrendRemarks += '</div>'
        otherTrendRemarks += '</div>'
        if (pChangeEvo >= 4 && price != "+-") {
            imageBullPlus = thorImgContainer + hulNewImgContainer + bullImageImgContainer
            otherRemarkType = "HULK_THOR_BULL_ARRIVED"
        } else if (pChangeEvo >= 4 && price == "+-") {
            marketTrendPlus = '<div class=" badge bg-warning">Doctor Strange Arrived (+)</div>'
            otherTrendRemarks = ''
            otherTrendRemarks += '<div class="row">'
            otherTrendRemarks += '<div class="col-md-12">'
            otherTrendRemarks += "Doctor Strange Arrived (+))"
            otherTrendRemarks += '</div>'
            otherTrendRemarks += '</div>'
            imageBullPlus = doctorStrangeImgContainer
            otherRemarkType = "DOCTOR_STRANGE_ARRIVED"
        } else {
            imageBullPlus = bullImageImgContainer;
        }
    } else {
        marketTrendPlus = '<div class="  badge bg-danger">Strongly Not Recommended to buy Calls</div>'
        imageBullPlus = ""
        openInterestMarkupBull = ""
        openInterestDirectionMarkupBull = ""
        openInterestChangeMarkupBull = ""
        openInterestChangePercMarkupBull = ""
        niftyOILabelPlusBull = ""
        bullRemark = ""
    }

    data.PLUS = imageBullPlus + bullRemark + marketTrendPlus

    var marketTrendMinus = ""
    var imageBearMinus = "";
    var openInterestMarkupBear = openInterestMarkup
    var openInterestDirectionMarkupBear = openInterestDirectionMarkup
    var openInterestChangeMarkupBear = openInterestChangeMarkup
    var openInterestChangePercMarkupBear = openInterestChangePercMarkup
    var bankNiftyOILabelPlusBear = "NIFTY-OI"

    if (display == "-") {
        marketTrendMinus = '<div class=" badge bg-danger">Chitauri Army Arrived (-)</div>'
        imageBearMinus = bearImageImgContainer
    } else {
        marketTrendMinus = '<div class="  badge bg-danger">Strongly Not Recommended to Short Calls</div>'
        openInterestMarkupBear = ""
        openInterestDirectionMarkupBear = ""
        openInterestChangeMarkupBear = ""
        openInterestChangePercMarkupBear = ""
        bankNiftyOILabelPlusBear = ""
        bearRemark = ""
    }

    data.MINUS = imageBearMinus + bearRemark + marketTrendMinus

    return data;
}

function showTableAiBankNiftyPrediction(quote, prevQuote, lotSize) {

    let data = {}

    quote.volume = parseInt(quote.volume)
    var pTypicalPrice = (parseFloat(prevQuote.high) + parseFloat(prevQuote.low) + parseFloat(prevQuote.close)) / 3
    var cTypicalPrice = (parseFloat(quote.high) + parseFloat(quote.low) + parseFloat(quote.close)) / 3
    var cVolumePrice = cTypicalPrice * parseFloat(quote.volume)
    var pVolumePrice = pTypicalPrice * parseFloat(prevQuote.volume)
    var totalVolumePrice = cVolumePrice + pVolumePrice
    var totalVolume = parseInt(quote.volume) + parseInt(prevQuote.volume)
    var vwapPrice = (totalVolumePrice / totalVolume).toFixed(2)


    var vwap = vwapPrice ? vwapPrice : 0;


    var openPrice = quote.open;
    var highPrice = quote.high;
    var lowPrice = quote.low;
    var close = quote.close;
    var lastPrice = quote.close;

    var previousClose = prevQuote['close']
    var pChange = ((lastPrice - previousClose) / previousClose) * 100
    var change = (lastPrice - previousClose).toFixed(2)
    var shortCoveringOrLongUnwinding = false;
    var price;
    var oi;
    var booleanValue = false;
    var correctedVwap = vwap;
    correctedVwap = correctedVwap; // price spike adjustment
    var lastPrice = lastPrice;
    if (correctedVwap <= lastPrice) {
        booleanValue = true;
    } else {
        booleanValue = false;
    }
    var openInterest = quote['oi'] / lotSize;
    var previousOI = prevQuote['oi'] / lotSize
    var changeinOpenInterest = (openInterest - previousOI).toFixed(2)
    var pchangeinOpenInterest = (((openInterest - previousOI) / previousOI) * 100).toFixed(2);
    var changeEvo1 = change;
    var pChangeEvo = pchangeinOpenInterest;
    var changeEvo = changeinOpenInterest;
    var bottomTriangle = '<i class="bi bi-caret-down">DOWN</i>'
    var upTriangle = '<i class="bi bi-caret-up">UP</i>'
    var openInterestMarkup = '';
    var openInterestDirectionMarkup = '';
    var openInterestChangeMarkup = '';
    var openInterestChangePercMarkup = '';

    if (changeinOpenInterest > 0) {
        openInterestMarkup = '<div class=" badge bg-success">' + openInterest + '</div>'
        openInterestDirectionMarkup = '<div class=" badge bg-success" >' + upTriangle + '</div>'
        openInterestChangeMarkup = '<div class=" badge bg-success" >' + changeinOpenInterest + '</div>'
        oi = "+";
    } else {
        openInterestMarkup = '<div class=" badge bg-danger">' + openInterest + '</div>'
        openInterestDirectionMarkup = '<div class=" badge bg-danger">' + bottomTriangle + '</div>'
        openInterestChangeMarkup = '<div class=" badge bg-danger">' + changeinOpenInterest + '</div>'
        oi = "-";
    }

    if (pchangeinOpenInterest > 0) {
        openInterestChangePercMarkup = '<div class=" badge bg-success">' + pchangeinOpenInterest + '%</div>'
    } else {
        openInterestChangePercMarkup = '<div class=" badge bg-danger">' + pchangeinOpenInterest + '%</div>'
    }

    if (changeEvo1 > 10 && booleanValue == true) { // percentage bull side
        price = "+";
    } else if (changeEvo1 <= -10 && booleanValue == false) { // bear side,long unwinding
        price = "-";
    } else if (changeEvo1 >= 10 && booleanValue == false) { // bear side, short
        price = "-";
    } else {
        price = "+-";// no clear trend
    }

    if (changeEvo < 0 && pChangeEvo < -2) {
        shortCoveringOrLongUnwinding = true;
    } else {
        shortCoveringOrLongUnwinding = false;
    }

    var remark = "No Clear Trend, Bulls are still waiting";


    var dogImgContainer = '<span class="">' + dogImage + '</span>'
    var bullImageImgContainer = '<span class="">' + bullImage + '</span>'
    var bearImageImgContainer = '<span class="">' + bearImage + '</span>'
    var hulkImageImgContainer = '<span class="">' + hulkImage + '</span>'
    var captainImgContainer = '<span class="">' + captain + '</span>'
    var lokiImgContainer = '<span class="">' + loki + '</span>'
    var ironManImgContainer = '<span class="">' + ironMan + '</span>'
    var thorImgContainer = '<span class="">' + thor + '</span>'
    var hulNewImgContainer = '<span class="">' + hulkImageNew + '</span>'
    var doctorStrangeImgContainer = '<span class="">' + doctor_strange + '</span>'
    remark += dogImgContainer
    var display = "+";

    var aiStatus = ""

    if (price == "+" && oi == "+") {
        remark = '<div class="badge bg-success">Long</div>'
        display = "+";
        aiStatus = "LONG"
    } else if (price == "-" && oi == "+") {
        remark = '<div class="badge bg-danger">Short</div>'
        display = "-";
        aiStatus = "SHORT"
    } else if (price == "+" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = '<div class="badge bg-success">Short Covering</div>'
        display = "+";
        aiStatus = "SHOT_COVERING"
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = dogImgContainer + '<div class="badge bg-danger">Long Unwinding</div>'
        display = "-";
        aiStatus = "LONG_UNWINDING"
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding == false) {
        remark = dogImgContainer + lokiImgContainer + '<div class="badge bg-danger">Bears Coming,Sell On Rise</div>'
        display = "-";
        aiStatus = "BEARS_COMING_SELL_ON_RISE"
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo >= 10) {
        remark = '<div class="badge bg-danger">Gambling! Buy,News & Events</div>'
        display = "+";
        aiStatus = "GAMBLING_BUY_NEWS_AND_EVENTS"
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo < 10) {
        remark = '<div class="badge bg-danger">Caution! Writers Eroding Premium</div>'
        display = "+";
        aiStatus = "CAUTION_WRITES_ERODING_PREMIUM"
    } else {
        remark = captainImgContainer + '<div class="badge bg-danger">Defence,Buy On Decline</div>'
        display = "+";
        aiStatus = "DEFENCE_BUY_ON_DECLINE"
    }

    data.REMARK = aiStatus

    var bullRemark = remark;
    var bearRemark = remark;
    var marketTrendPlus = ""
    var imageBullPlus = "";

    var openInterestMarkupBull = openInterestMarkup
    var openInterestDirectionMarkupBull = openInterestDirectionMarkup
    var openInterestChangeMarkupBull = openInterestChangeMarkup
    var openInterestChangePercMarkupBull = openInterestChangePercMarkup
    var niftyOILabelPlusBull = "NIFTY-OI"
    var otherRemarkType = ""
    var otherTrendRemarks = ""
    if (display == "+") {
        marketTrendPlus = '<div class=" badge bg-success">Hulk Arrived (+)</div>'
        otherTrendRemarks += '<div class="row">'
        otherTrendRemarks += '<div class="col-md-12">'
        otherTrendRemarks += "Hulk Arrived (+)"
        otherTrendRemarks += '</div>'
        otherTrendRemarks += '</div>'
        if (pChangeEvo >= 4 && price != "+-") {
            imageBullPlus = thorImgContainer + hulNewImgContainer + bullImageImgContainer
            otherRemarkType = "HULK_THOR_BULL_ARRIVED"
        } else if (pChangeEvo >= 4 && price == "+-") {
            marketTrendPlus = '<div class=" badge bg-warning">Doctor Strange Arrived (+)</div>'
            otherTrendRemarks = ''
            otherTrendRemarks += '<div class="row">'
            otherTrendRemarks += '<div class="col-md-12">'
            otherTrendRemarks += "Doctor Strange Arrived (+))"
            otherTrendRemarks += '</div>'
            otherTrendRemarks += '</div>'
            imageBullPlus = doctorStrangeImgContainer
            otherRemarkType = "DOCTOR_STRANGE_ARRIVED"
        } else {
            imageBullPlus = bullImageImgContainer;
        }
    } else {
        marketTrendPlus = '<div class="  badge bg-danger">Strongly Not Recommended to buy Calls</div>'
        imageBullPlus = ""
        openInterestMarkupBull = ""
        openInterestDirectionMarkupBull = ""
        openInterestChangeMarkupBull = ""
        openInterestChangePercMarkupBull = ""
        niftyOILabelPlusBull = ""
        bullRemark = ""
    }

    data.PLUS = imageBullPlus + bullRemark + marketTrendPlus

    var marketTrendMinus = ""
    var imageBearMinus = "";
    var openInterestMarkupBear = openInterestMarkup
    var openInterestDirectionMarkupBear = openInterestDirectionMarkup
    var openInterestChangeMarkupBear = openInterestChangeMarkup
    var openInterestChangePercMarkupBear = openInterestChangePercMarkup
    var bankNiftyOILabelPlusBear = "NIFTY-OI"

    if (display == "-") {
        marketTrendMinus = '<div class=" badge bg-danger">Chitauri Army Arrived (-)</div>'
        imageBearMinus = bearImageImgContainer
    } else {
        marketTrendMinus = '<div class="  badge bg-danger">Strongly Not Recommended to Short Calls</div>'
        openInterestMarkupBear = ""
        openInterestDirectionMarkupBear = ""
        openInterestChangeMarkupBear = ""
        openInterestChangePercMarkupBear = ""
        bankNiftyOILabelPlusBear = ""
        bearRemark = ""
    }
    data.MINUS = imageBearMinus + bearRemark + marketTrendMinus

    return data;
}

let scriptsVolumeMap = {}
async function showAdvacenDeclineScanner() {
    let scriptData = generateTrends()

    let adVanceDeclineColumns = []
    let advanceSeries = ['Advance']
    let declineSeries = ["Decline"]

    let adVanceDeclineColumnsNifty = []
    let advanceSeriesNifty = ['Advance']
    let declineSeriesNifty = ["Decline"]

    let adVanceDeclineColumnsNiftyBank = []
    let advanceSeriesNiftyBank = ['Advance']
    let declineSeriesNiftyBank = ["Decline"]

    let categoryList = [];

    let advanceMap = {};
    let declineMap = {};

    let advanceMapNifty = {};
    let declineMapNifty = {};

    let advanceMapBank = {};
    let declineMapBank = {};

    let allAdvances = 0;
    let allDeclines = 0;
    let all = 0;
    let allNiftyAdvances = 0;
    let allNiftyDeclines = 0;
    let allNifty = 0;
    let allBankAdvances = 0;
    let allBankDeclines = 0;
    let allBank = 0;

    let x = ['x'];

    for (let i = 0; i < FO_LIST.length; i++) {
        let asoPrice = parseFloat(scriptData[FO_LIST[i]]['strikeData']['ustrikeOne']);
        let bsoPrice = parseFloat(scriptData[FO_LIST[i]]['strikeData']['bstrikeOne']);
        jQ("#processing-trend").html("Processing.... " + (i + 1) + "/" + FO_LIST.length);

        let data = await getHistoricalDataUsingPromise(instrumentTokens[FO_LIST[i]], CURRENT_DAY, CURRENT_DAY, '5minute');
        let volume = 0;
        jQ.each(data.data.candles, function (index, item) {
            let time = moment(item[0]).format("HH:mm");
            if (i == 0) {
                let map = {}
                map.label = time;
                categoryList.push(map)
                x.push(moment(item[0]).format("YYYY-MM-DD HH:mm:ss"))

                advanceMap[time] = {}
                advanceMap[time]['SYMBOL'] = []
                advanceMap[time]['COUNT'] = 0

                declineMap[time] = {}
                declineMap[time]['SYMBOL'] = []
                declineMap[time]['COUNT'] = 0

                advanceMapNifty[time] = {}
                advanceMapNifty[time]['SYMBOL'] = []
                advanceMapNifty[time]['COUNT'] = 0

                declineMapNifty[time] = {}
                declineMapNifty[time]['SYMBOL'] = []
                declineMapNifty[time]['COUNT'] = 0

                advanceMapBank[time] = {}
                advanceMapBank[time]['SYMBOL'] = []
                advanceMapBank[time]['COUNT'] = 0

                declineMapBank[time] = {}
                declineMapBank[time]['SYMBOL'] = []
                declineMapBank[time]['COUNT'] = 0
            }

            volume += item[5];
            all = all + FO_LIST.length;
            allNifty = allNifty + NIFTY_50_LIST.length;
            allBank = allBank + NIFTY_BANK_LIST.length;
        });

        scriptsVolumeMap[FO_LIST[i]] = volume;


        jQ.each(data.data.candles, function (index, item) {
            let time = moment(item[0]).format("HH:mm");
            if (advanceMap[time]) {
                if (item[4] > asoPrice) {
                    advanceMap[time]['SYMBOL'].push(FO_LIST[i])
                    advanceMap[time]['COUNT'] = advanceMap[time]['COUNT'] + 1
                    allAdvances++;

                    if (jQ.inArray(FO_LIST[i], NIFTY_50_LIST) != -1) {
                        advanceMapNifty[time]['SYMBOL'].push(FO_LIST[i])
                        advanceMapNifty[time]['COUNT'] = advanceMapNifty[time]['COUNT'] + 1
                        allNiftyAdvances++;
                    }

                    if (jQ.inArray(FO_LIST[i], NIFTY_BANK_LIST) != -1) {
                        advanceMapBank[time]['SYMBOL'].push(FO_LIST[i])
                        advanceMapBank[time]['COUNT'] = advanceMapBank[time]['COUNT'] + 1
                        allBankAdvances++;
                    }
                }
            }

            if (declineMap[time]) {
                if (item[4] < bsoPrice) {
                    declineMap[time]['SYMBOL'].push(FO_LIST[i])
                    declineMap[time]['COUNT'] = declineMap[time]['COUNT'] + 1
                    allDeclines++;

                    if (jQ.inArray(FO_LIST[i], NIFTY_50_LIST) != -1) {
                        declineMapNifty[time]['SYMBOL'].push(FO_LIST[i])
                        declineMapNifty[time]['COUNT'] = declineMapNifty[time]['COUNT'] + 1
                        allNiftyDeclines++
                    }

                    if (jQ.inArray(FO_LIST[i], NIFTY_BANK_LIST) != -1) {
                        declineMapBank[time]['SYMBOL'].push(FO_LIST[i])
                        declineMapBank[time]['COUNT'] = declineMapBank[time]['COUNT'] + 1
                        allBankDeclines++
                    }
                }
            }
        });
    };

    jQ.each(advanceMap, function (aindex, aitem) {
        advanceSeries.push(aitem['COUNT'])
    });

    jQ.each(declineMap, function (dindex, ditem) {
        declineSeries.push(ditem['COUNT']);
    });

    adVanceDeclineColumns.push(x);
    adVanceDeclineColumns.push(advanceSeries);
    adVanceDeclineColumns.push(declineSeries);

    jQ.each(advanceMapNifty, function (aindex, aitem) {
        advanceSeriesNifty.push(aitem['COUNT'])
    });

    jQ.each(declineMapNifty, function (dindex, ditem) {
        declineSeriesNifty.push(ditem['COUNT']);
    });

    adVanceDeclineColumnsNifty.push(x);
    adVanceDeclineColumnsNifty.push(advanceSeriesNifty);
    adVanceDeclineColumnsNifty.push(declineSeriesNifty);

    jQ.each(advanceMapBank, function (aindex, aitem) {
        advanceSeriesNiftyBank.push(aitem['COUNT'])
    });

    jQ.each(declineMapBank, function (dindex, ditem) {
        advanceSeriesNiftyBank.push(ditem['COUNT']);
    });

    adVanceDeclineColumnsNiftyBank.push(x);
    adVanceDeclineColumnsNiftyBank.push(advanceSeriesNiftyBank);
    adVanceDeclineColumnsNiftyBank.push(declineSeriesNiftyBank);

    if (allAdvances > allDeclines) {
        ALL_ADVANCE_DECLINE_SCORE = 1;
    } else if (allDeclines > allAdvances) {
        ALL_ADVANCE_DECLINE_SCORE = -1;
    }

    if (allNiftyAdvances > allNiftyDeclines) {
        NIFTY_50_ADVANCE_DECLINE_SCORE = 1;
    } else if (allNiftyDeclines > allNiftyAdvances) {
        NIFTY_50_ADVANCE_DECLINE_SCORE = -1;
    }

    if (allBankAdvances > allBankDeclines) {
        NIFTY_BANK_ADVANCE_DECLINE_SCORE = 1;
    } else if (allBankDeclines > allBankAdvances) {
        NIFTY_BANK_ADVANCE_DECLINE_SCORE = -1;
    }

    jQ("#all-advance-decline-adr").html("ADR:" + ((allAdvances / allDeclines).toFixed(2)) + "|A:" + allAdvances + "|D:" + allDeclines);

    c3.generate({
        bindto: "#" + "advance-decline-trend",
        size: {
            height: 150
        },
        legend: {
            show: false
        },
        data: {
            x: 'x',
            xFormat: '%Y-%m-%d %H:%M:%S',
            columns: adVanceDeclineColumns,
            type: 'bar',
            groups: [
                ['Advance', 'Decline']
            ],
            colors: {
                Advance: '#00ff00',
                Decline: '#ff0000'
            },
            groups: [
                ['Advance', 'Decline']
            ]
        },
        axis: {
            x: {
                type: 'timeseries',
                tick: {
                    format: '%H:%M',
                    rotate: 60
                },
                show: false,
            },
        },
        grid: {
            y: {
                lines: [{ value: 25 }]
            }
        }
    });


    jQ("#NIFTY-BANK-advance-decline-adr").html("ADR:" + ((allBankAdvances / allBankDeclines).toFixed(2)) + "|A:" + allBankAdvances + "|D: " + allBankDeclines);
    c3.generate({
        bindto: "#" + "NIFTY-BANK-advance-decline",
        size: {
            height: 150
        },
        legend: {
            show: false
        },
        data: {
            x: 'x',
            xFormat: '%Y-%m-%d %H:%M:%S',
            columns: adVanceDeclineColumnsNiftyBank,
            type: 'bar',
            groups: [
                ['Advance', 'Decline']
            ],
            colors: {
                Advance: '#00ff00',
                Decline: '#ff0000'
            },
            groups: [
                ['Advance', 'Decline']
            ]
        },
        axis: {
            x: {
                type: 'timeseries',
                tick: {
                    format: '%H:%M',
                    rotate: 60
                },
                show: false,
            },
        },
        grid: {
            y: {
                lines: [{ value: 5 }]
            }
        }
    });

    jQ("#NIFTY-50-advance-decline-adr").html("ADR:" + ((allNiftyAdvances / allNiftyDeclines).toFixed(2)) + " |A:" + allNiftyAdvances + " |D:" + allNiftyDeclines);

    c3.generate({
        bindto: "#" + "NIFTY-50-advance-decline",
        size: {
            height: 150
        },
        legend: {
            show: false
        },
        data: {
            x: 'x',
            xFormat: '%Y-%m-%d %H:%M:%S',
            columns: adVanceDeclineColumnsNifty,
            type: 'bar',
            groups: [
                ['Advance', 'Decline']
            ],
            colors: {
                Advance: '#00ff00',
                Decline: '#ff0000'
            },
            groups: [
                ['Advance', 'Decline']
            ]
        },
        axis: {
            x: {
                type: 'timeseries',
                tick: {
                    format: '%H:%M',
                    rotate: 60
                },
                show: false,
            },
        },
        grid: {
            y: {
                lines: [{ value: 25 }]
            }
        }
    });



}

async function showFuturesTrend() {

    let LONGSeries = ['Long']
    let SHOT_COVERINGSeries = ['Short Covering']
    let GAMBLING_BUY_NEWS_AND_EVENTSSeries = ['Gambling! Buy News And Events']
    let SHORTSSeries = ['Short']
    let LONG_UNWINDINGSeries = ['Long Unwinding']
    let BEARS_COMING_SELL_ON_RISESeries = ['Bears Coming,Sell On Rise']
    let CAUTION_WRITES_ERODING_PREMIUMSeries = ['Caution! Writers Eroding Premium']
    let DEFENCE_BUY_ON_DECLINESeries = ['Defence,Buy On Decline']
    let BULLSSeries = ['Bulls']
    let BEARSSeries = ['Bears']
    let allFuturesSeries = []


    let NiftyLONGSeries = ["Long"]
    let NiftySHOT_COVERINGSeries = ['Short Covering']
    let NiftyGAMBLING_BUY_NEWS_AND_EVENTSSeries = ['Gambling! Buy News And Events']
    let NiftySHORTSSeries = ['Short']
    let NiftyLONG_UNWINDINGSeries = ['Long Unwinding']
    let NiftyBEARS_COMING_SELL_ON_RISESeries = ['Bears Coming,Sell On Rise']
    let NiftyCAUTION_WRITES_ERODING_PREMIUMSeries = ['Caution! Writers Eroding Premium']
    let NiftyDEFENCE_BUY_ON_DECLINESeries = ['Defence,Buy On Decline']
    let NiftyBULLSSeries = ['Bulls']
    let NiftyBEARSSeries = ['Bears']
    let allNiftyFuturesSeries = []


    let NiftyBankLONGSeries = ["Long"]
    let NiftyBankSHOT_COVERINGSeries = ['Short Covering']
    let NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSSeries = ['Gambling! Buy News And Events']
    let NiftyBankSHORTSSeries = ['Short']
    let NiftyBankLONG_UNWINDINGSeries = ['Long Unwinding']
    let NiftyBankBEARS_COMING_SELL_ON_RISESeries = ['Bears Coming,Sell On Rise']
    let NiftyBankCAUTION_WRITES_ERODING_PREMIUMSeries = ['Caution! Writers Eroding Premium']
    let NiftyBankDEFENCE_BUY_ON_DECLINESeries = ['Defence,Buy On Decline']
    let NiftyBankBULLSSeries = ['Bulls']
    let NiftyBankBEARSSeries = ['Bears']
    let allNiftyBankFuturesSeries = []


    let LONGMap = {}
    let SHOT_COVERINGMap = {}
    let GAMBLING_BUY_NEWS_AND_EVENTSMap = {}
    let SHORTSMap = {}
    let LONG_UNWINDINGMap = {}
    let BEARS_COMING_SELL_ON_RISEMap = {}
    let CAUTION_WRITES_ERODING_PREMIUMMap = {}
    let DEFENCE_BUY_ON_DECLINEMap = {}
    let BULLSMap = {}
    let BEARSMap = {}


    let NiftyLONGMap = {}
    let NiftySHOT_COVERINGMap = {}
    let NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap = {}
    let NiftySHORTSMap = {}
    let NiftyLONG_UNWINDINGMap = {}
    let NiftyBEARS_COMING_SELL_ON_RISEMap = {}
    let NiftyCAUTION_WRITES_ERODING_PREMIUMMap = {}
    let NiftyDEFENCE_BUY_ON_DECLINEMap = {}
    let NiftyBULLSMap = {}
    let NiftyBEARSMap = {}


    let NiftyBankLONGMap = {}
    let NiftyBankSHOT_COVERINGMap = {}
    let NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap = {}
    let NiftyBankSHORTSMap = {}
    let NiftyBankLONG_UNWINDINGMap = {}
    let NiftyBankBEARS_COMING_SELL_ON_RISEMap = {}
    let NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap = {}
    let NiftyBankDEFENCE_BUY_ON_DECLINEMap = {}
    let NiftyBankBULLSMap = {}
    let NiftyBankBEARSMap = {}

    let categoryList = [];
    let allList = FO_LIST;
    allList.push("NIFTY 50");
    allList.push("NIFTY BANK");

    let allFuturesAdvances = 0;
    let allFuturesDeclines = 0;

    let allNiftyFuturesAdvances = 0;
    let allNiftyFuturesDeclines = 0;
    let allNiftyBankFuturesAdvances = 0;
    let allNiftyBankFuturesDeclines = 0;

    let x = ['x'];


    for (let i = 0; i < allList.length; i++) {
        let name = allList[i];
        jQ("#processing-trend").html("Processing.... " + (i + 1) + "/" + allList.length);
        jQ.each(futureInstrumentsList, function (index, item) {
            let instName = name
            if (instName == "NIFTY 50") {
                instName = 'NIFTY'
            }

            if (instName == "NIFTY BANK") {
                instName = 'BANKNIFTY'
            }

            if (item.name == instName) {
                futures = item;
            }
        })
        try {

            let pres = await getHistoricalDataUsingPromise(futures['instrument_token'], PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day');
            let cres = await getHistoricalDataUsingPromise(futures['instrument_token'], CURRENT_DAY, CURRENT_DAY, '5minute');
            let prevData = []
            jQ.each(pres.data.candles, function (index, item) {
                let map = {}
                map['date'] = moment(item[0]).format("HH:mm")
                map.open = item[1]
                map.high = item[2]
                map.low = item[3]
                map.close = item[4]
                map.volume = item[5]
                map.oi = item[6]
                prevData.push(map);
            });
            prevData = prevData[prevData.length - 1];
            let data = []
            jQ.each(cres.data.candles, function (index, item) {
                let time = moment(item[0]).format("HH:mm");
                if (i == 0) {
                    let map = {}
                    map.label = time;
                    categoryList.push(map)
                    x.push(moment(item[0]).format("YYYY-MM-DD HH:mm:ss"))

                    LONGMap[time] = {}
                    LONGMap[time]['SYMBOL'] = []
                    LONGMap[time]['COUNT'] = 0

                    SHOT_COVERINGMap[time] = {}
                    SHOT_COVERINGMap[time]['SYMBOL'] = []
                    SHOT_COVERINGMap[time]['COUNT'] = 0

                    GAMBLING_BUY_NEWS_AND_EVENTSMap[time] = {}
                    GAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'] = []
                    GAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] = 0

                    SHORTSMap[time] = {}
                    SHORTSMap[time]['SYMBOL'] = []
                    SHORTSMap[time]['COUNT'] = 0

                    LONG_UNWINDINGMap[time] = {}
                    LONG_UNWINDINGMap[time]['SYMBOL'] = []
                    LONG_UNWINDINGMap[time]['COUNT'] = 0

                    BEARS_COMING_SELL_ON_RISEMap[time] = {}
                    BEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'] = []
                    BEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] = 0

                    CAUTION_WRITES_ERODING_PREMIUMMap[time] = {}
                    CAUTION_WRITES_ERODING_PREMIUMMap[time]['SYMBOL'] = []
                    CAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] = 0

                    DEFENCE_BUY_ON_DECLINEMap[time] = {}
                    DEFENCE_BUY_ON_DECLINEMap[time]['SYMBOL'] = []
                    DEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] = 0

                    BULLSMap[time] = {}
                    BULLSMap[time]['SYMBOL'] = []
                    BULLSMap[time]['COUNT'] = 0

                    BEARSMap[time] = {}
                    BEARSMap[time]['SYMBOL'] = []
                    BEARSMap[time]['COUNT'] = 0



                    NiftyLONGMap[time] = {}
                    NiftyLONGMap[time]['SYMBOL'] = []
                    NiftyLONGMap[time]['COUNT'] = 0

                    NiftySHOT_COVERINGMap[time] = {}
                    NiftySHOT_COVERINGMap[time]['SYMBOL'] = []
                    NiftySHOT_COVERINGMap[time]['COUNT'] = 0

                    NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time] = {}
                    NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'] = []
                    NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] = 0

                    NiftySHORTSMap[time] = {}
                    NiftySHORTSMap[time]['SYMBOL'] = []
                    NiftySHORTSMap[time]['COUNT'] = 0

                    NiftyLONG_UNWINDINGMap[time] = {}
                    NiftyLONG_UNWINDINGMap[time]['SYMBOL'] = []
                    NiftyLONG_UNWINDINGMap[time]['COUNT'] = 0

                    NiftyBEARS_COMING_SELL_ON_RISEMap[time] = {}
                    NiftyBEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'] = []
                    NiftyBEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] = 0

                    NiftyCAUTION_WRITES_ERODING_PREMIUMMap[time] = {}
                    NiftyCAUTION_WRITES_ERODING_PREMIUMMap[time]['SYMBOL'] = []
                    NiftyCAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] = 0

                    NiftyDEFENCE_BUY_ON_DECLINEMap[time] = {}
                    NiftyDEFENCE_BUY_ON_DECLINEMap[time]['SYMBOL'] = []
                    NiftyDEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] = 0

                    NiftyBULLSMap[time] = {}
                    NiftyBULLSMap[time]['SYMBOL'] = []
                    NiftyBULLSMap[time]['COUNT'] = 0

                    NiftyBEARSMap[time] = {}
                    NiftyBEARSMap[time]['SYMBOL'] = []
                    NiftyBEARSMap[time]['COUNT'] = 0



                    NiftyBankLONGMap[time] = {}
                    NiftyBankLONGMap[time]['SYMBOL'] = []
                    NiftyBankLONGMap[time]['COUNT'] = 0

                    NiftyBankSHOT_COVERINGMap[time] = {}
                    NiftyBankSHOT_COVERINGMap[time]['SYMBOL'] = []
                    NiftyBankSHOT_COVERINGMap[time]['COUNT'] = 0

                    NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time] = {}
                    NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'] = []
                    NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] = 0

                    NiftyBankSHORTSMap[time] = {}
                    NiftyBankSHORTSMap[time]['SYMBOL'] = []
                    NiftyBankSHORTSMap[time]['COUNT'] = 0

                    NiftyBankLONG_UNWINDINGMap[time] = {}
                    NiftyBankLONG_UNWINDINGMap[time]['SYMBOL'] = []
                    NiftyBankLONG_UNWINDINGMap[time]['COUNT'] = 0

                    NiftyBankBEARS_COMING_SELL_ON_RISEMap[time] = {}
                    NiftyBankBEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'] = []
                    NiftyBankBEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] = 0

                    NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap[time] = {}
                    NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap[time]['SYMBOL'] = []
                    NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] = 0

                    NiftyBankDEFENCE_BUY_ON_DECLINEMap[time] = {}
                    NiftyBankDEFENCE_BUY_ON_DECLINEMap[time]['SYMBOL'] = []
                    NiftyBankDEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] = 0

                    NiftyBankBULLSMap[time] = {}
                    NiftyBankBULLSMap[time]['SYMBOL'] = []
                    NiftyBankBULLSMap[time]['COUNT'] = 0

                    NiftyBankBEARSMap[time] = {}
                    NiftyBankBEARSMap[time]['SYMBOL'] = []
                    NiftyBankBEARSMap[time]['COUNT'] = 0
                }

                let map = {}
                map['date'] = time
                map.open = item[1]
                map.high = item[2]
                map.low = item[3]
                map.close = item[4]
                map.volume = item[5]
                map.oi = item[6]
                data.push(map);

            });

            jQ.each(data, function (index, item) {
                let time = item.date
                let resp = {};
                if (name == "BANKNIFTY") {
                    resp = showTableAiBankNiftyPrediction(item, prevData, futures['lot_size'])
                } else {
                    resp = showTableAiNiftyPrediction(item, prevData, futures['lot_size'])
                }

                globalFuturesTrend[name] = resp;
                if (LONGMap[time]) {
                    if (resp['REMARK'] == "LONG") {
                        LONGMap[time]['SYMBOL'].push(name)
                        LONGMap[time]['COUNT'] = LONGMap[time]['COUNT'] + 1

                        if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                            NiftyLONGMap[time]['SYMBOL'].push(name)
                            NiftyLONGMap[time]['COUNT'] = NiftyLONGMap[time]['COUNT'] + 1
                        }

                        if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                            NiftyBankLONGMap[time]['SYMBOL'].push(name)
                            NiftyBankLONGMap[time]['COUNT'] = NiftyBankLONGMap[time]['COUNT'] + 1
                        }
                    }


                }
                if (SHORTSMap[time]) {
                    if (resp['REMARK'] == "SHORT") {
                        SHORTSMap[time]['SYMBOL'].push(name)
                        SHORTSMap[time]['COUNT'] = SHORTSMap[time]['COUNT'] + 1

                        if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                            NiftySHORTSMap[time]['SYMBOL'].push(name)
                            NiftySHORTSMap[time]['COUNT'] = NiftySHORTSMap[time]['COUNT'] + 1
                        }

                        if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                            NiftyBankSHORTSMap[time]['SYMBOL'].push(name)
                            NiftyBankSHORTSMap[time]['COUNT'] = NiftyBankSHORTSMap[time]['COUNT'] + 1
                        }
                    }
                }

                if (SHOT_COVERINGMap[time]) {
                    if (resp['REMARK'] == "SHOT_COVERING") {
                        SHOT_COVERINGMap[time]['SYMBOL'].push(name)
                        SHOT_COVERINGMap[time]['COUNT'] = SHOT_COVERINGMap[time]['COUNT'] + 1

                        if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                            NiftySHOT_COVERINGMap[time]['SYMBOL'].push(name)
                            NiftySHOT_COVERINGMap[time]['COUNT'] = NiftySHOT_COVERINGMap[time]['COUNT'] + 1
                        }

                        if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                            NiftyBankSHOT_COVERINGMap[time]['SYMBOL'].push(name)
                            NiftyBankSHOT_COVERINGMap[time]['COUNT'] = NiftyBankSHOT_COVERINGMap[time]['COUNT'] + 1
                        }
                    }
                }

                if (GAMBLING_BUY_NEWS_AND_EVENTSMap[time]) {
                    if (resp['REMARK'] == "GAMBLING_BUY_NEWS_AND_EVENTS") {
                        GAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'].push(name)
                        GAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] = GAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] + 1

                        if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                            NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'].push(name)
                            NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] = NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] + 1
                        }

                        if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                            NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'].push(name)
                            NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] = NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] + 1
                        }
                    }
                }
                if (LONG_UNWINDINGMap[time]) {
                    if (resp['REMARK'] == "LONG_UNWINDING") {
                        LONG_UNWINDINGMap[time]['SYMBOL'].push(name)
                        LONG_UNWINDINGMap[time]['COUNT'] = LONG_UNWINDINGMap[time]['COUNT'] + 1

                        if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                            NiftyLONG_UNWINDINGMap[time]['SYMBOL'].push(name)
                            NiftyLONG_UNWINDINGMap[time]['COUNT'] = NiftyLONG_UNWINDINGMap[time]['COUNT'] + 1
                        }

                        if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                            NiftyBankLONG_UNWINDINGMap[time]['SYMBOL'].push(name)
                            NiftyBankLONG_UNWINDINGMap[time]['COUNT'] = NiftyBankLONG_UNWINDINGMap[time]['COUNT'] + 1
                        }
                    }
                }

                if (BEARS_COMING_SELL_ON_RISEMap[time]) {
                    if (resp['REMARK'] == "BEARS_COMING_SELL_ON_RISE") {
                        BEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'].push(name)
                        BEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] = BEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] + 1

                        if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                            NiftyBEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'].push(name)
                            NiftyBEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] = NiftyBEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] + 1
                        }

                        if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                            NiftyBankBEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'].push(name)
                            NiftyBankBEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] = NiftyBankBEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] + 1
                        }
                    }
                }

                if (CAUTION_WRITES_ERODING_PREMIUMMap[time]) {
                    if (resp['REMARK'] == "CAUTION_WRITES_ERODING_PREMIUM") {
                        CAUTION_WRITES_ERODING_PREMIUMMap[time]['SYMBOL'].push(name)
                        CAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] = CAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] + 1

                        if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                            NiftyCAUTION_WRITES_ERODING_PREMIUMMap[time]['SYMBOL'].push(name)
                            NiftyCAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] = NiftyCAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] + 1
                        }

                        if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                            NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap[time]['SYMBOL'].push(name)
                            NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] = NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT'] + 1
                        }
                    }
                }
                if (DEFENCE_BUY_ON_DECLINEMap[time]) {
                    if (resp['REMARK'] == "DEFENCE_BUY_ON_DECLINE") {
                        DEFENCE_BUY_ON_DECLINEMap[time]['SYMBOL'].push(name)
                        DEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] = DEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] + 1

                        if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                            NiftyDEFENCE_BUY_ON_DECLINEMap[time]['SYMBOL'].push(name)
                            NiftyDEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] = NiftyDEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] + 1
                        }

                        if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                            NiftyBankDEFENCE_BUY_ON_DECLINEMap[time]['SYMBOL'].push(name)
                            NiftyBankDEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] = NiftyBankDEFENCE_BUY_ON_DECLINEMap[time]['COUNT'] + 1
                        }
                    }
                }

                if (BULLSMap[time]) {
                    BULLSMap[time]['COUNT'] = LONGMap[time]['COUNT'] + SHOT_COVERINGMap[time]['COUNT'] + GAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT']
                    NiftyBULLSMap[time]['COUNT'] = NiftyLONGMap[time]['COUNT'] + NiftySHOT_COVERINGMap[time]['COUNT'] + NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT']
                    NiftyBankBULLSMap[time]['COUNT'] = NiftyBankLONGMap[time]['COUNT'] + NiftyBankSHOT_COVERINGMap[time]['COUNT'] + NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT']
                    allFuturesAdvances += BULLSMap[time]['COUNT']
                    allNiftyFuturesAdvances += NiftyBULLSMap[time]['COUNT']
                    allNiftyBankFuturesAdvances += NiftyBankBULLSMap[time]['COUNT']
                }

                if (BEARSMap[time]) {
                    BEARSMap[time]['COUNT'] = SHORTSMap[time]['COUNT'] + LONG_UNWINDINGMap[time]['COUNT'] + BEARS_COMING_SELL_ON_RISEMap[time]['COUNT']
                    NiftyBEARSMap[time]['COUNT'] = NiftySHORTSMap[time]['COUNT'] + NiftyLONG_UNWINDINGMap[time]['COUNT'] + NiftyBEARS_COMING_SELL_ON_RISEMap[time]['COUNT']
                    NiftyBankBEARSMap[time]['COUNT'] = NiftyBankSHORTSMap[time]['COUNT'] + NiftyBankLONG_UNWINDINGMap[time]['COUNT'] + NiftyBankBEARS_COMING_SELL_ON_RISEMap[time]['COUNT']
                    allFuturesDeclines += BEARSMap[time]['COUNT']
                    allNiftyFuturesDeclines += NiftyBEARSMap[time]['COUNT']
                    allNiftyBankFuturesDeclines += NiftyBankBEARSMap[time]['COUNT']
                }
            });
        } catch (e) {
            console.log(e)
        }
    }


    jQ.each(LONGMap, function (aindex, aitem) {
        LONGSeries.push(aitem['COUNT'])
    });

    jQ.each(SHORTSMap, function (aindex, aitem) {
        SHORTSSeries.push(aitem['COUNT'])
    });

    jQ.each(SHOT_COVERINGMap, function (aindex, aitem) {
        SHOT_COVERINGSeries.push(aitem['COUNT'])
    });

    jQ.each(GAMBLING_BUY_NEWS_AND_EVENTSMap, function (aindex, aitem) {
        GAMBLING_BUY_NEWS_AND_EVENTSSeries.push(aitem['COUNT'])
    });

    jQ.each(LONG_UNWINDINGMap, function (aindex, aitem) {
        LONG_UNWINDINGSeries.push(aitem['COUNT'])
    });


    jQ.each(BEARS_COMING_SELL_ON_RISEMap, function (aindex, aitem) {
        BEARS_COMING_SELL_ON_RISESeries.push(aitem['COUNT'])
    });

    jQ.each(CAUTION_WRITES_ERODING_PREMIUMMap, function (aindex, aitem) {
        CAUTION_WRITES_ERODING_PREMIUMSeries.push(aitem['COUNT'])
    });

    jQ.each(DEFENCE_BUY_ON_DECLINEMap, function (aindex, aitem) {
        DEFENCE_BUY_ON_DECLINESeries.push(aitem['COUNT'])
    });

    jQ.each(BULLSMap, function (aindex, aitem) {
        BULLSSeries.push(aitem['COUNT'])
    });

    jQ.each(BEARSMap, function (aindex, aitem) {
        BEARSSeries.push(aitem['COUNT'])
    });

    allFuturesSeries.push(x);
    allFuturesSeries.push(LONGSeries);
    allFuturesSeries.push(SHORTSSeries);
    allFuturesSeries.push(SHOT_COVERINGSeries);
    allFuturesSeries.push(GAMBLING_BUY_NEWS_AND_EVENTSSeries);
    allFuturesSeries.push(LONG_UNWINDINGSeries);
    allFuturesSeries.push(BEARS_COMING_SELL_ON_RISESeries);
    allFuturesSeries.push(CAUTION_WRITES_ERODING_PREMIUMSeries);
    allFuturesSeries.push(DEFENCE_BUY_ON_DECLINESeries);
    allFuturesSeries.push(BULLSSeries);
    allFuturesSeries.push(BEARSSeries);

    jQ.each(NiftyLONGMap, function (aindex, aitem) {
        NiftyLONGSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftySHORTSMap, function (aindex, aitem) {
        NiftySHORTSSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftySHOT_COVERINGMap, function (aindex, aitem) {
        NiftySHOT_COVERINGSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap, function (aindex, aitem) {
        NiftyGAMBLING_BUY_NEWS_AND_EVENTSSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyLONG_UNWINDINGMap, function (aindex, aitem) {
        NiftyLONG_UNWINDINGSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyBEARS_COMING_SELL_ON_RISEMap, function (aindex, aitem) {
        NiftyBEARS_COMING_SELL_ON_RISESeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyCAUTION_WRITES_ERODING_PREMIUMMap, function (aindex, aitem) {
        NiftyCAUTION_WRITES_ERODING_PREMIUMSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyDEFENCE_BUY_ON_DECLINEMap, function (aindex, aitem) {
        NiftyDEFENCE_BUY_ON_DECLINESeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyBULLSMap, function (aindex, aitem) {
        NiftyBULLSSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyBEARSMap, function (aindex, aitem) {
        NiftyBEARSSeries.push(aitem['COUNT'])
    });

    allNiftyFuturesSeries.push(x);
    allNiftyFuturesSeries.push(NiftyLONGSeries);
    allNiftyFuturesSeries.push(NiftySHORTSSeries);
    allNiftyFuturesSeries.push(NiftySHOT_COVERINGSeries);
    allNiftyFuturesSeries.push(NiftyGAMBLING_BUY_NEWS_AND_EVENTSSeries);
    allNiftyFuturesSeries.push(NiftyLONG_UNWINDINGSeries);
    allNiftyFuturesSeries.push(NiftyBEARS_COMING_SELL_ON_RISESeries);
    allNiftyFuturesSeries.push(NiftyCAUTION_WRITES_ERODING_PREMIUMSeries);
    allNiftyFuturesSeries.push(NiftyDEFENCE_BUY_ON_DECLINESeries);
    allNiftyFuturesSeries.push(NiftyBULLSSeries);
    allNiftyFuturesSeries.push(NiftyBEARSSeries);

    jQ.each(NiftyBankLONGMap, function (aindex, aitem) {
        NiftyBankLONGSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyBankSHORTSMap, function (aindex, aitem) {
        NiftyBankSHORTSSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyBankSHOT_COVERINGMap, function (aindex, aitem) {
        NiftyBankSHOT_COVERINGSeries.push(aitem['COUNT'])
    });


    jQ.each(NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap, function (aindex, aitem) {
        NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSSeries.push(aitem['COUNT'])
    });


    jQ.each(NiftyBankLONG_UNWINDINGMap, function (aindex, aitem) {
        NiftyBankLONG_UNWINDINGSeries.push(aitem['COUNT'])
    });


    jQ.each(NiftyBankBEARS_COMING_SELL_ON_RISEMap, function (aindex, aitem) {
        NiftyBankBEARS_COMING_SELL_ON_RISESeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap, function (aindex, aitem) {
        NiftyBankCAUTION_WRITES_ERODING_PREMIUMSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyBankDEFENCE_BUY_ON_DECLINEMap, function (aindex, aitem) {
        NiftyBankDEFENCE_BUY_ON_DECLINESeries.push(aitem['COUNT'])
    });


    jQ.each(NiftyBankBULLSMap, function (aindex, aitem) {
        NiftyBankBULLSSeries.push(aitem['COUNT'])
    });

    jQ.each(NiftyBankBEARSMap, function (aindex, aitem) {
        NiftyBankBEARSSeries.push(aitem['COUNT'])
    });

    allNiftyBankFuturesSeries.push(x);
    allNiftyBankFuturesSeries.push(NiftyBankLONGSeries);
    allNiftyBankFuturesSeries.push(NiftyBankSHORTSSeries);
    allNiftyBankFuturesSeries.push(NiftyBankSHOT_COVERINGSeries);
    allNiftyBankFuturesSeries.push(NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSSeries);
    allNiftyBankFuturesSeries.push(NiftyBankLONG_UNWINDINGSeries);
    allNiftyBankFuturesSeries.push(NiftyBankBEARS_COMING_SELL_ON_RISESeries);
    allNiftyBankFuturesSeries.push(NiftyBankCAUTION_WRITES_ERODING_PREMIUMSeries);
    allNiftyBankFuturesSeries.push(NiftyBankDEFENCE_BUY_ON_DECLINESeries);
    allNiftyBankFuturesSeries.push(NiftyBankBULLSSeries);
    allNiftyBankFuturesSeries.push(NiftyBankBEARSSeries);

    if (allFuturesAdvances > allFuturesDeclines) {
        ALL_FUTURES_TREND_SCORE = 1;
    } else if (allFuturesDeclines > allFuturesAdvances) {
        ALL_FUTURES_TREND_SCORE = -1;
    }

    if (allNiftyFuturesAdvances > allNiftyFuturesDeclines) {
        NIFTY_50_FUTURES_TREND_SCORE = 1;
    } else if (allNiftyFuturesDeclines > allNiftyFuturesAdvances) {
        NIFTY_50_FUTURES_TREND_SCORE = -1;
    }

    if (allNiftyBankFuturesAdvances > allNiftyBankFuturesDeclines) {
        NIFTY_BANK_FUTURES_TREND_SCORE = 1;
    } else if (allNiftyBankFuturesDeclines > allNiftyBankFuturesAdvances) {
        NIFTY_BANK_FUTURES_TREND_SCORE = -1;
    }


    jQ("#all-advance-decline-adr-future").html("ADR:" + ((allFuturesAdvances / allFuturesDeclines).toFixed(2)) + "|A:" + allFuturesAdvances + "|D:" + allFuturesDeclines);

    jQ("#NIFTY-50-advance-decline-adr-future").html("ADR:" + ((allNiftyFuturesAdvances / allNiftyFuturesDeclines).toFixed(2)) + "|A:" + allNiftyFuturesAdvances + "|D:" + allNiftyFuturesDeclines);

    jQ("#NIFTY-BANK-advance-decline-adr-future").html("ADR:" + ((allNiftyBankFuturesAdvances / allNiftyBankFuturesDeclines).toFixed(2)) + "|A:" + allNiftyBankFuturesAdvances + "|D:" + allNiftyBankFuturesDeclines);




    c3.generate({
        bindto: "#" + "advance-decline-futures-trend",
        size: {
            height: 150
        },
        legend: {
            show: false
        },
        data: {
            x: 'x',
            xFormat: '%Y-%m-%d %H:%M:%S',
            columns: allFuturesSeries,
            type: 'bar',
            groups: [
                ['Long', 'Short', 'Short Covering', 'Gambling! Buy News And Events', 'Long Unwinding', 'Bears Coming,Sell On Rise', 'Caution! Writers Eroding Premium', 'Defence,Buy On Decline', 'Bulls', 'Bears']
            ],
            colors: {
                Long: '#00ff00',
                Short: '#ff0000',
                'Short Covering': '#00ff00',
                'Gambling! Buy News And Events': '#00ff00',
                'Long Unwinding': '#ff0000',
                'Bears Coming,Sell On Rise': '#ff0000',
                'Caution! Writers Eroding Premium': '#f3ff44',
                'Defence,Buy On Decline': '#ff0000',
                Bulls: '#00ff00',
                Bears: '#ff0000'
            },
            groups: [
                ['Long', 'Short', 'Short Covering', 'Gambling! Buy News And Events', 'Long Unwinding', 'Bears Coming,Sell On Rise', 'Caution! Writers Eroding Premium', 'Defence,Buy On Decline', 'Bulls', 'Bears']
            ]
        },
        axis: {
            x: {
                type: 'timeseries',
                tick: {
                    format: '%H:%M',
                    rotate: 60
                },
                show: false,
            },
        },
        grid: {
            y: {
                lines: [{ value: 25 }]
            }
        }
    });


    c3.generate({
        bindto: "#" + "NIFTY-50-advance-decline-future",
        size: {
            height: 150
        },
        legend: {
            show: false
        },
        data: {
            x: 'x',
            xFormat: '%Y-%m-%d %H:%M:%S',
            columns: allNiftyFuturesSeries,
            type: 'bar',
            groups: [
                ['Long', 'Short', 'Short Covering', 'Gambling! Buy News And Events', 'Long Unwinding', 'Bears Coming,Sell On Rise', 'Caution! Writers Eroding Premium', 'Defence,Buy On Decline', 'Bulls', 'Bears']
            ],
            colors: {
                Long: '#00ff00',
                Short: '#ff0000',
                'Short Covering': '#00ff00',
                'Gambling! Buy News And Events': '#00ff00',
                'Long Unwinding': '#ff0000',
                'Bears Coming,Sell On Rise': '#ff0000',
                'Caution! Writers Eroding Premium': '#f3ff44',
                'Defence,Buy On Decline': '#ff0000',
                Bulls: '#00ff00',
                Bears: '#ff0000'
            },
            groups: [
                ['Long', 'Short', 'Short Covering', 'Gambling! Buy News And Events', 'Long Unwinding', 'Bears Coming,Sell On Rise', 'Caution! Writers Eroding Premium', 'Defence,Buy On Decline', 'Bulls', 'Bears']
            ]
        },
        axis: {
            x: {
                type: 'timeseries',
                tick: {
                    format: '%H:%M',
                    rotate: 60
                },
                show: false,
            },
        },
        grid: {
            y: {
                lines: [{ value: 25 }]
            }
        }
    });



    c3.generate({
        bindto: "#" + "NIFTY-BANK-advance-decline-future",
        size: {
            height: 150
        },
        legend: {
            show: false
        },
        data: {
            x: 'x',
            xFormat: '%Y-%m-%d %H:%M:%S',
            columns: allNiftyBankFuturesSeries,
            type: 'bar',
            groups: [
                ['Long', 'Short', 'Short Covering', 'Gambling! Buy News And Events', 'Long Unwinding', 'Bears Coming,Sell On Rise', 'Caution! Writers Eroding Premium', 'Defence,Buy On Decline', 'Bulls', 'Bears']
            ],
            colors: {
                Long: '#00ff00',
                Short: '#ff0000',
                'Short Covering': '#00ff00',
                'Gambling! Buy News And Events': '#00ff00',
                'Long Unwinding': '#ff0000',
                'Bears Coming,Sell On Rise': '#ff0000',
                'Caution! Writers Eroding Premium': '#f3ff44',
                'Defence,Buy On Decline': '#ff0000',
                Bulls: '#00ff00',
                Bears: '#ff0000'

            },
            groups: [
                ['Long', 'Short', 'Short Covering', 'Gambling! Buy News And Events', 'Long Unwinding', 'Bears Coming,Sell On Rise', 'Caution! Writers Eroding Premium', 'Defence,Buy On Decline', 'Bulls', 'Bears']
            ]
        },
        axis: {
            x: {
                type: 'timeseries',
                tick: {
                    format: '%H:%M',
                    rotate: 60
                },
                show: false,
            },
        },
        grid: {
            y: {
                lines: [{ value: 25 }]
            }
        }
    });



}

function showStockList(list) {
    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));
    let instru = [];
    let scripts = []
    let checkInstr = []
    let scriptData = generateTrends()
    if (!scriptData) {
        return false;
    }
    jQ.each(instrumentTokens, function (index, item) {
        if (jQ.inArray(index, checkInstr) === -1) {
            instru.push(index)
            checkInstr.push(index)
        }
    });

    for (let i = 0; i < instru.length; i++) {
        try {
            let name = instru[i];
            let obj = {}
            obj['TRADINGSYMBOL'] = name;
            obj['CLOSE'] = scriptData[name]['prevPrice'];
            obj['PRICE'] = scriptData[name]['price'];
            obj['PERC'] = scriptData[name]['change'];
            obj['TREND'] = scriptData[name]['trends'];

            obj['VOLUME'] = 0
            if (scriptsVolumeMap[name]) {
                obj['VOLUME'] = scriptsVolumeMap[name];
            }

            if (scriptData[name]['open_perc'] > 0) {
                obj['OPEN_PERC'] = '<span class="badge bg-success">' + scriptData[name]['open_perc'] + '</span>'
            } else if (scriptData[name]['open_perc'] < 0) {
                obj['OPEN_PERC'] = '<span class="badge bg-danger">' + scriptData[name]['open_perc'] + '</span>'
            } else {
                obj['OPEN_PERC'] = scriptData[name]['open_perc'];
            }

            let asoPrice = 0;
            let bsoPrice = 0;
            let astPrice = 0;
            let bstPrice = 0;
            asoPrice = parseFloat(scriptData[name]['strikeData']['ustrikeOne']);
            bsoPrice = parseFloat(scriptData[name]['strikeData']['bstrikeOne']);

            astPrice = parseFloat(scriptData[name]['strikeData']['ustrikeTwo']);
            bstPrice = parseFloat(scriptData[name]['strikeData']['bstrikeTwo']);

            let ltp = parseFloat(scriptData[name]['ltp']);
            if (ltp >= astPrice) {
                obj['LTP'] = '<span title="AST PRICE" class="badge bg-danger">' + ltp + '</span>'
            } else if (ltp >= asoPrice) {
                obj['LTP'] = '<span title="ASO PRICE" class="badge bg-warning">' + ltp + '</span>'
            } else if (ltp <= bstPrice) {
                obj['LTP'] = '<span title="BST PRICE" class="badge bg-success">' + ltp + '</span>'
            } else if (ltp <= bsoPrice) {
                obj['LTP'] = '<span title="BSO PRICE" class="badge bg-warning">' + ltp + '</span>'
            } else {
                obj['LTP'] = ltp
            }

            obj['STRIKEDATA'] = scriptData[name]['strikeData'];
            if (breakOutNineFifteen && breakOutNineFifteen[name]) {
                obj['CLOSE_9_15'] = breakOutNineFifteen[name]['CLOSE_9_15'];
            } else {
                obj['CLOSE_9_15'] = '';
            }
            obj['FUTURE_TREND'] = '';
            if (globalFuturesTrend && globalFuturesTrend[name]) {
                obj['FUTURE_TREND'] = globalFuturesTrend[name]['PLUS'] + ' ' + globalFuturesTrend[name]['MINUS'];

                if (name == "NIFTY 50") {
                    jQ("#futures-trend-nifty").html(globalFuturesTrend[name]['PLUS'] + ' ' + globalFuturesTrend[name]['MINUS']);
                }
                if (name == "NIFTY BANK") {
                    jQ("#futures-trend-nifty-bank").html(globalFuturesTrend[name]['PLUS'] + ' ' + globalFuturesTrend[name]['MINUS']);
                }
            }
            if (list.length != 0) {
                if (jQ.inArray(name, list) != -1) {
                    scripts.push(obj)
                }
            } else {
                scripts.push(obj)
            }
        } catch (e) {
            console.log(e)
        }
    }
    if (scripts.length > 0) {
        generateStockTable(scripts)
    }
}

function generateStockTable(data) {
    stockTable = jQ('#stock-list-table').DataTable({
        fixedColumns: {
            start: 1,
            end: 1
        },
        "processing": true,
        "order": [[1, 'asc']],
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
            'excel'
        ],
        "columns": [
            {
                "data": "TRADINGSYMBOL",
                render: function (data, type, row, meta) {
                    let html = ''
                    html += '<a target="_blank" href="https://kite.zerodha.com/markets/ext/chart/web/tvc/' + 'NSE' + '/' + data + '/' + instrumentTokens[data] + '"> '
                    html += data;
                    html += '</a>'

                    html += '<span class="badge bg-info" style="float:right;">'
                    html += '<a title="Sensibull Strategy Builder" target="_blank" href="https://web.sensibull.com/option-strategy-builder?instrument_symbol=' + data + '"> '
                    html += 'SB';
                    html += '</a>'
                    html += '</span> '

                    return html;
                }
            },
            { "data": "PRICE" },
            { "data": "OPEN_PERC" },
            { "data": "PERC" },
            {
                "data": "LTP",
                render: function (data, type, row, meta) {
                    return data
                }
            },
            { "data": "VOLUME" },
            { "data": "TREND" },
        ],
        "fnInitComplete": function (oSettings, json) {
            showExtraButtons()
        },
        "fnRowCallback": function (nRow, aData, iDisplayIndex, iDisplayIndexFull) {
        }
    });
}

function showExtraButtons() {
    jQ("#stock-list-table_wrapper .dt-buttons").append('<button data-trend="all" class="dt-button trend-filter  bg-info extra-buttons" type="button"><span>ALL</span></button>')
    jQ("#stock-list-table_wrapper .dt-buttons").append('<button style="margin-right: .2rem;" data-trend="index" class="dt-button trend-filter  bg-info extra-buttons" type="button"><span>INDEX</span></button>')
    jQ("#stock-list-table_wrapper .dt-buttons").append('<button data-trend="aso" class="dt-button trend-filter  bg-info extra-buttons" type="button"><span>ASO</span></button>')
    jQ("#stock-list-table_wrapper .dt-buttons").append('<button data-trend="bso" class="dt-button trend-filter  bg-info extra-buttons" type="button"><span>BSO</span></button>')
    jQ("#stock-list-table_wrapper .dt-buttons").append('<button style="margin-right: .2rem;" data-trend="n50" class="dt-button trend-filter  bg-info extra-buttons" type="button"><span>N50</span></button>')
    jQ("#stock-list-table_wrapper .dt-buttons").append('<button data-trend="bank" class="dt-button trend-filter  bg-info extra-buttons" type="button"><span>BN</span></button>')
}

jQ(document).on("click", "#stock-list-table_wrapper .trend-filter", function (e) {
    let type = jQ(this).attr("data-trend");
    let list = [];
    let scriptData = generateTrends()
    jQ.each(instrumentTokens, function (index, item) {
        let name = index
        let trends = scriptData[name]['trends']
        if (type == "aso") {
            if (jQ.inArray("ASO", trends) != -1) {
                list.push(name)
            }
        }

        if (type == "bso") {
            if (jQ.inArray("BSO", trends) != -1) {
                list.push(name)
            }
        }

        if (type == "n50") {
            if (jQ.inArray(name, NIFTY_50_LIST) != -1) {
                list.push(name)
            }
        }

        if (type == "bank") {
            if (jQ.inArray(name, NIFTY_BANK_LIST) != -1) {
                list.push(name)
            }
        }

        if (type == "index") {
            if (jQ.inArray(name, INDICES) != -1) {
                list.push(name)
            }
        }
    });
    showStockList(list)
});
