let advanceDeclineTimerInstance = null
let globalFuturesTrend = {}
let stockTable = null

jQ(document).on("click", "#show-groot-trade-bot", function (e) {
    e.preventDefault();
    if (advanceDeclineTimerInstance) {
        clearInterval(advanceDeclineTimerInstance);
        advanceDeclineTimerInstance = null;
    }
    showGrootTradeBot();
});

async function showGrootTradeBot() {

    let html = ''

    html += '<div class="row">'

    html += '<div class="col-md-1">'
    html += '<span title="Previous Day Date" class="badge bg-primary me-1">' + PREVIOUS_DAY_DATE + '</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<span title="Current Day Date" class="badge bg-primary me-1">' + CURRENT_DAY + '</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<a class="" id="clean-storage" type="button">Clear</a>'
    html += '</div>'
    html += '<div class="col-md-1">'
    html += '<a class="" id="load-price" type="button">Load</a>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<button id="show-oi-viewer" class="btn btn-secondary btn-sm" type="submit">';
    html += 'Analyzer'
    html += '</button>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<a target="_blank" href="https://docs.google.com/spreadsheets/d/1mJyXOLNqSqIuDIiB1ip9-0kpNGU0pl_o/edit?gid=20807039#gid=20807039"  type="button">Past Analysis</a>'
    html += '</div>'



    html += '<div class="col-md-1">'
    html += '<a  id="start-auto-refresh">Refresh</a>'
    html += '</div>'
    html += '<div class="col-md-1 pop-title-extra">'
    html += '<span style="margin-left:.5rem;" id="refresh-timer-one">00:00</span>'
    html += '</div>'
    html += '<div class="col-md-3 pop-title-extra">'
    html += '<span id="last-refresh-time">Last @ 00:00:00</span>'
    html += '</div>'

    html += '<div class="col-md-1">'
    html += '<a  id="start-advance-decline-refresh" class="btn btn-secondary btn-sm btn-postion"><i class="bi bi-arrow-counterclockwise"></i></a>'
    html += '</div>'


    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-1"></div>'
    html += '<div class="row">'

    html += '<div class="col-md-6 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">Gift Nifty <span id="nine-fifteen-nifty-gift-trend"></span></h6>'
    html += '<div id="gift-nifty-top-chart">'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-6 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">Nifty 50<span id="nine-fifteen-nifty-trend"></span></h6>'
    html += '<div id="nifty-to-chart">'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-6 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">Bank Nifty <span id="nine-fifteen-nifty-bank-trend"></span></h6>'
    html += '<div id="bank-nifty-top-chart">'
    html += '</div>'
    html += '</div>'


    html += '<div class="col-md-6 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">Sensex<span id="nine-fifteen-sensex-trend"></span></h6>'
    html += '<div id="sensex-top-chart">'
    html += '</div>'
    html += '</div>'



    html += '<div class="px-3 py-2 border-bottom mb-1"></div>'
    html += '<div class="row">'

    html += '<div class="col-md-12">'
    html += '<h6 class="header-class-center">'
    html += 'Advance [ASO]/Decline [BSO]'
    html += '</h6>'
    html += '</div>'

    html += '<div class="col-md-12 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">All <span class="badge bg-info" id="all-advance-decline-adr"></span><span class="badge bg-info" id="all-advance-decline-nine-fifteen-close"></span></h6>'
    html += '<div id="advance-decline-chart">'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-6 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">Nifty<span class="badge bg-info" id="nifty-advance-decline-adr"></span><span class="badge bg-info" id="nifty-advance-decline-nine-fifteen-close"></span></h6>'
    html += '<div id="advance-decline-nifty-chart">'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-6 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">Bank<span class="badge bg-info" id="bank-advance-decline-adr"></span><span class="badge bg-info" id="bank-advance-decline-nine-fifteen-close"></span></h6>'
    html += '<div id="advance-decline-bank-chart">'
    html += '</div>'
    html += '</div>'

    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-1"></div>'
    html += '<div class="row">'

    html += '<div class="col-md-12 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">'
    html += 'Futures Trend <span class="badge bg-info" id="future-advance-decline-adr"></span>'
    html += '</h6>'
    html += '<div id="futures-trend-chart">'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-6 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">'
    html += 'Nifty Futures Trend <span class="badge bg-info" id="future-nifty-advance-decline-adr"></span>'
    html += '<div id="futures-trend-nifty">'
    html += '</div>'
    html += '</h6>'
    html += '<div id="futures-trend-chart-nifty">'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-6 min-height"  class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '<h6 class="header-class-center">'
    html += 'Bank Futures Trend <span class="badge bg-info" id="future-bank-advance-decline-adr"></span>'
    html += '<div id="futures-trend-nifty-bank">'
    html += '</div>'
    html += '</h6>'
    html += '<div id="futures-trend-chart-nifty-bank">'
    html += '</div>'
    html += '</div>'

    html += '</div>'






    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-1"></div>'

    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table  class="table display nowrap" id="stock-list-table" style="width: 100%;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th></th>'
    html += '<th>SYMBOL</th>'
    html += '<th>OPEN</th>'
    html += '<th>OPEN %</th>'
    html += '<th>CH %</th>'
    html += '<th>LTP</th>'
    html += '<th>VOLUME</th>'
    html += '<th>CLOSE 9:15</th>'
    html += '<th>TREND</th>'
    html += '<th>FUTURE_TREND</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'
    html += '</div>'
    html += '</div>'


    html += '<table class="table table-striped">'
    html += '<thead>'
    html += '<tr>'
    html += '<th scope="col">Price</th>'
    html += '<th scope="col">OI</th>'
    html += '<th scope="col">ChangeinOpenInterest</th>'
    html += '<th>PchangeinOpenInterest</th>'
    html += '<th>(Vwap -5) <= lastPrice</th>'
    html += '<th scope="col">Result</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '<tr>'
    html += '<td>+</td>'
    html += '<td>+</td>'
    html += '<td>N/A</td>'
    html += '<td>N/A</td>'
    html += '<td>N/A</td>'
    html += '<td>LONG</td>'
    html += '</tr>'
    html += '<tr>'
    html += '<td>-</td>'
    html += '<td>+</td>'
    html += '<td>N/A</td>'
    html += ' <td>N/A</td>'
    html += '<td>N/A</td>'
    html += '<td>SHORT</td>'
    html += '</tr>'
    html += '<tr>'
    html += '<td>+</td>'
    html += '<td>-</td>'
    html += '<td><0</td>'
    html += '<td><-2</td>'
    html += '<td>N/A</td>'
    html += '<td>SHORT COVERING</td>'
    html += '</tr>'
    html += '<tr>'
    html += '<td>-</td>'
    html += '<td>-</td>'
    html += '<td><0</td>'
    html += '<td><-2</td>'
    html += '<td>N/A</td>'
    html += '<td>LONG UNWINDING</td>'
    html += '</tr>'
    html += '<tr>'
    html += ' <td>-</td>'
    html += '<td>-</td>'
    html += '<td>N/A</td>'
    html += '<td>>= 10</td>'
    html += '<td>true</td>'
    html += '<td>Bears Coming,Sell On Rise</td>'
    html += '</tr>'
    html += '<tr>'
    html += ' <td>+-</td>'
    html += '<td>+</td>'
    html += '<td>>0</td>'
    html += '<td><10</td>'
    html += '<td>true</td>'
    html += '<td>Caution! Writers Eroding Premium</td>'
    html += '</tr>'
    html += '<tr>'
    html += '<td>N/A</td>'
    html += '<td>N/A</td>'
    html += '<td>N/A</td>'
    html += '<td>N/A</td>'
    html += '<td>N/A</td>'
    html += '<td>Defence,Buy On Decline</td>'
    html += '</tr>'

    html += '</tbody>'
    html += '</table>'

    let title = ''
    title += '<div class="row">'
    title += '<div class="col-md-2">'
    title += 'Groot Trade Bot'
    title += '</div>'
    title += '</div>'

    showPopUpWindow('groot-trade-bot', html, "Groot [Trade Bot]", 950, 550);
    let divId = "popup-custom-style-groot-trade-bot";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    showStockList([])
}

jQ(document).on("click", "#start-advance-decline-refresh", function (e) {
    e.preventDefault();
    let that = jQ(this);
    that.attr("disabled", true);
    commonRefreshAdvanceDecline(that)
});

async function commonRefreshAdvanceDecline(that) {
    clearInterval(advanceDeclineTimerInstance)
    await showTopChart("GIFT NIFTY", "gift-nifty-top-chart");
    await showTopChart("NIFTY 50", "nifty-to-chart")
    await showTopChart("NIFTY BANK", "bank-nifty-top-chart");
    await showTopChart("SENSEX", "sensex-top-chart");
    await showAdvacenDeclineScanner(that);
    await showFuturesTrend();
    showStockList([]);
    that.removeAttr("disabled");
}

let scriptsVolumeMap = {}
async function showAdvacenDeclineScanner() {
    let scriptData = generateTrends()

    let advanceSeries = {}
    advanceSeries['seriesname'] = "Advance"
    advanceSeries['data'] = []

    let declineSeries = {}
    declineSeries['seriesname'] = "Decline"
    declineSeries['data'] = []


    let advanceSeriesNifty = {}
    advanceSeriesNifty['seriesname'] = "Advance"
    advanceSeriesNifty['data'] = []

    let declineSeriesNifty = {}
    declineSeriesNifty['seriesname'] = "Decline"
    declineSeriesNifty['data'] = []


    let advanceSeriesBank = {}
    advanceSeriesBank['seriesname'] = "Advance"
    advanceSeriesBank['data'] = []

    let declineSeriesBank = {}
    declineSeriesBank['seriesname'] = "Decline"
    declineSeriesBank['data'] = []

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

    for (let i = 0; i < FO_LIST.length; i++) {
        let strikes = scriptData[FO_LIST[i]]['strikeData']

        let asoPrice = parseFloat(scriptData[FO_LIST[i]]['strikeData']['ustrikeOne']);
        let bsoPrice = parseFloat(scriptData[FO_LIST[i]]['strikeData']['bstrikeOne']);

        let data = await getHistoricalDataUsingPromise(instrumentTokens[FO_LIST[i]], CURRENT_DAY, CURRENT_DAY, '5minute');
        let volume = 0;
        jQ.each(data.data.candles, function (index, item) {
            let time = moment(item[0]).format("HH:mm");
            if (i == 0) {
                let map = {}
                map.label = time;
                categoryList.push(map)

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
                advanceMapBank[time]['COUNT'] =

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
        let val = {}
        val['color'] = '#37a009 '
        val['value'] = aitem['COUNT']
        advanceSeries['data'].push(val)
    });

    jQ.each(declineMap, function (dindex, ditem) {
        let val = {}
        val['color'] = '#da3224'
        val['value'] = ditem['COUNT']
        declineSeries['data'].push(val);
    });

    jQ.each(advanceMapNifty, function (aindex, aitem) {
        let val = {}
        val['color'] = '#37a009 '
        val['value'] = aitem['COUNT']
        advanceSeriesNifty['data'].push(val)
    });

    jQ.each(declineMapNifty, function (dindex, ditem) {
        let val = {}
        val['color'] = '#da3224'
        val['value'] = ditem['COUNT']
        declineSeriesNifty['data'].push(val);
    });

    jQ.each(advanceMapBank, function (aindex, aitem) {
        let val = {}
        val['color'] = '#37a009 '
        val['value'] = aitem['COUNT']
        advanceSeriesBank['data'].push(val)
    });

    jQ.each(declineMapBank, function (dindex, ditem) {
        let val = {}
        val['color'] = '#da3224'
        val['value'] = ditem['COUNT']
        declineSeriesBank['data'].push(val);
    });

    jQ("#all-advance-decline-adr").html("ADR: " + ((allAdvances / allDeclines).toFixed(2)) + " | A: " + allAdvances + " | D: " + allDeclines);
    jQ("#advance-decline-chart").insertFusionCharts({
        type: "stackedcolumn2d",
        width: "100%",
        dataFormat: "json",
        dataSource: {
            chart: {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "theme": "candy",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                "paletteColors": "  #37a009,#da3224",
                "showLabels": 1,
                "showValues": "1"
            },
            axis: {
                y: {
                    tick: {
                        format: function (d) {
                            return (parseInt(d) == d) ? d : null;
                        }
                    }
                }
            },
            "categories": [{
                "category": categoryList
            }],
            dataset: [
                advanceSeries,
                declineSeries
            ]
        },
        "events": {
            dataPlotClick: function (ev, props) {
                let symbols = []
                let time = props['categoryLabel']
                if (props.datasetName == "Advance") {
                    symbols = advanceMap[time]['SYMBOL'];
                } else {
                    symbols = declineMap[time]['SYMBOL'];
                }
                showStockList(symbols)
            }
        }
    });


    jQ("#nifty-advance-decline-adr").html("ADR: " + ((allNiftyAdvances / allNiftyDeclines).toFixed(2)) + " | A: " + allNiftyAdvances + " | D: " + allNiftyDeclines);
    jQ("#advance-decline-nifty-chart").insertFusionCharts({
        type: "stackedcolumn2d",
        width: "100%",
        dataFormat: "json",
        dataSource: {
            chart: {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "theme": "candy",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                "paletteColors": "  #37a009,#da3224",
                "showLabels": 1,
                "showValues": "1"
            },
            axis: {
                y: {
                    tick: {
                        format: function (d) {
                            return (parseInt(d) == d) ? d : null;
                        }
                    }
                }
            },
            "categories": [{
                "category": categoryList
            }],
            dataset: [
                advanceSeriesNifty,
                declineSeriesNifty
            ]
        }
        ,
        "events": {
            dataPlotClick: function (ev, props) {
                let symbols = []
                let time = props['categoryLabel']
                if (props.datasetName == "Advance") {
                    symbols = advanceMapNifty[time]['SYMBOL'];
                } else {
                    symbols = declineMapNifty[time]['SYMBOL'];
                }
                showStockList(symbols)
            }
        }
    });


    jQ("#bank-advance-decline-adr").html("ADR: " + ((allBankAdvances / allBankDeclines).toFixed(2)) + " | A: " + allBankAdvances + " | D: " + allBankDeclines);
    jQ("#advance-decline-bank-chart").insertFusionCharts({
        type: "stackedcolumn2d",
        width: "100%",
        dataFormat: "json",
        dataSource: {
            chart: {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "theme": "candy",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                "paletteColors": "  #37a009,#da3224",
                "showLabels": 1,
                "showValues": "1"
            },
            axis: {
                y: {
                    tick: {
                        format: function (d) {
                            return (parseInt(d) == d) ? d : null;
                        }
                    }
                }
            },
            "categories": [{
                "category": categoryList
            }],
            dataset: [
                advanceSeriesBank,
                declineSeriesBank
            ]
        }
        ,
        "events": {
            dataPlotClick: function (ev, props) {
                let symbols = []
                let time = props['categoryLabel']
                if (props.datasetName == "Advance") {
                    symbols = advanceMapBank[time]['SYMBOL'];
                } else {
                    symbols = declineMapBank[time]['SYMBOL'];
                }
                showStockList(symbols)
            }
        }
    });
    let asoCount = 0;
    let bsoCount = 0;
    let asoN50Count = 0;
    let bsoN50Count = 0;
    let asoBankCount = 0;
    let bsoBankCount = 0;

    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));

    if (breakOutNineFifteen) {
        jQ.each(breakOutNineFifteen, function (index, item) {
            if (item['CLOSE_9_15'] == 'ASO') {
                asoCount++;
                if (jQ.inArray(index, NIFTY_50_LIST) != -1) {
                    asoN50Count++;
                }
                if (jQ.inArray(index, NIFTY_BANK_LIST) != -1) {
                    asoBankCount++;
                }
            }

            if (item['CLOSE_9_15'] == 'BSO') {
                bsoCount++;
                if (jQ.inArray(index, NIFTY_50_LIST) != -1) {
                    bsoN50Count++;
                }
                if (jQ.inArray(index, NIFTY_BANK_LIST) != -1) {
                    bsoBankCount++;
                }
            }
        });
        jQ("#all-advance-decline-nine-fifteen-close").html("9:15 CLOSE [ASO: " + asoCount + " | BSO: " + bsoCount + "]");
        jQ("#nifty-advance-decline-nine-fifteen-close").html("9:15 CLOSE [ASO: " + asoN50Count + " | BSO: " + bsoN50Count + "]");
        jQ("#bank-advance-decline-nine-fifteen-close").html("9:15 CLOSE [ASO: " + asoBankCount + " | BSO: " + bsoBankCount + "]");
    }


}

async function showFuturesTrend() {

    let LONGSeries = {}
    LONGSeries['seriesname'] = "Long"
    LONGSeries['data'] = []

    let SHOT_COVERINGSeries = {}
    SHOT_COVERINGSeries['seriesname'] = "Short Covering"
    SHOT_COVERINGSeries['data'] = []

    let GAMBLING_BUY_NEWS_AND_EVENTSSeries = {}
    GAMBLING_BUY_NEWS_AND_EVENTSSeries['seriesname'] = "Gambling! Buy News And Events"
    GAMBLING_BUY_NEWS_AND_EVENTSSeries['data'] = []

    let SHORTSSeries = {}
    SHORTSSeries['seriesname'] = "Short"
    SHORTSSeries['data'] = []

    let LONG_UNWINDINGSeries = {}
    LONG_UNWINDINGSeries['seriesname'] = "Long Unwinding"
    LONG_UNWINDINGSeries['data'] = []

    let BEARS_COMING_SELL_ON_RISESeries = {}
    BEARS_COMING_SELL_ON_RISESeries['seriesname'] = "Bears Coming,Sell On Rise"
    BEARS_COMING_SELL_ON_RISESeries['data'] = []

    let CAUTION_WRITES_ERODING_PREMIUMSeries = {}
    CAUTION_WRITES_ERODING_PREMIUMSeries['seriesname'] = "Caution! Writers Eroding Premium"
    CAUTION_WRITES_ERODING_PREMIUMSeries['data'] = []

    let DEFENCE_BUY_ON_DECLINESeries = {}
    DEFENCE_BUY_ON_DECLINESeries['seriesname'] = "Defence,Buy On Decline"
    DEFENCE_BUY_ON_DECLINESeries['data'] = []

    let BULLSSeries = {}
    BULLSSeries['seriesname'] = "Bulls"
    BULLSSeries['data'] = []

    let BEARSSeries = {}
    BEARSSeries['seriesname'] = "Bears"
    BEARSSeries['data'] = []



    let NiftyLONGSeries = {}
    NiftyLONGSeries['seriesname'] = "Long"
    NiftyLONGSeries['data'] = []

    let NiftySHOT_COVERINGSeries = {}
    NiftySHOT_COVERINGSeries['seriesname'] = "Short Covering"
    NiftySHOT_COVERINGSeries['data'] = []

    let NiftyGAMBLING_BUY_NEWS_AND_EVENTSSeries = {}
    NiftyGAMBLING_BUY_NEWS_AND_EVENTSSeries['seriesname'] = "Gambling! Buy News And Events"
    NiftyGAMBLING_BUY_NEWS_AND_EVENTSSeries['data'] = []

    let NiftySHORTSSeries = {}
    NiftySHORTSSeries['seriesname'] = "Short"
    NiftySHORTSSeries['data'] = []

    let NiftyLONG_UNWINDINGSeries = {}
    NiftyLONG_UNWINDINGSeries['seriesname'] = "Long Unwinding"
    NiftyLONG_UNWINDINGSeries['data'] = []

    let NiftyBEARS_COMING_SELL_ON_RISESeries = {}
    NiftyBEARS_COMING_SELL_ON_RISESeries['seriesname'] = "Bears Coming,Sell On Rise"
    NiftyBEARS_COMING_SELL_ON_RISESeries['data'] = []

    let NiftyCAUTION_WRITES_ERODING_PREMIUMSeries = {}
    NiftyCAUTION_WRITES_ERODING_PREMIUMSeries['seriesname'] = "Caution! Writers Eroding Premium"
    NiftyCAUTION_WRITES_ERODING_PREMIUMSeries['data'] = []

    let NiftyDEFENCE_BUY_ON_DECLINESeries = {}
    NiftyDEFENCE_BUY_ON_DECLINESeries['seriesname'] = "Defence,Buy On Decline"
    NiftyDEFENCE_BUY_ON_DECLINESeries['data'] = []

    let NiftyBULLSSeries = {}
    NiftyBULLSSeries['seriesname'] = "Bulls"
    NiftyBULLSSeries['data'] = []

    let NiftyBEARSSeries = {}
    NiftyBEARSSeries['seriesname'] = "Bears"
    NiftyBEARSSeries['data'] = []


    let NiftyBankLONGSeries = {}
    NiftyBankLONGSeries['seriesname'] = "Long"
    NiftyBankLONGSeries['data'] = []

    let NiftyBankSHOT_COVERINGSeries = {}
    NiftyBankSHOT_COVERINGSeries['seriesname'] = "Short Covering"
    NiftyBankSHOT_COVERINGSeries['data'] = []

    let NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSSeries = {}
    NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSSeries['seriesname'] = "Gambling! Buy News And Events"
    NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSSeries['data'] = []

    let NiftyBankSHORTSSeries = {}
    NiftyBankSHORTSSeries['seriesname'] = "Short"
    NiftyBankSHORTSSeries['data'] = []

    let NiftyBankLONG_UNWINDINGSeries = {}
    NiftyBankLONG_UNWINDINGSeries['seriesname'] = "Long Unwinding"
    NiftyBankLONG_UNWINDINGSeries['data'] = []

    let NiftyBankBEARS_COMING_SELL_ON_RISESeries = {}
    NiftyBankBEARS_COMING_SELL_ON_RISESeries['seriesname'] = "Bears Coming,Sell On Rise"
    NiftyBankBEARS_COMING_SELL_ON_RISESeries['data'] = []

    let NiftyBankCAUTION_WRITES_ERODING_PREMIUMSeries = {}
    NiftyBankCAUTION_WRITES_ERODING_PREMIUMSeries['seriesname'] = "Caution! Writers Eroding Premium"
    NiftyBankCAUTION_WRITES_ERODING_PREMIUMSeries['data'] = []

    let NiftyBankDEFENCE_BUY_ON_DECLINESeries = {}
    NiftyBankDEFENCE_BUY_ON_DECLINESeries['seriesname'] = "Defence,Buy On Decline"
    NiftyBankDEFENCE_BUY_ON_DECLINESeries['data'] = []

    let NiftyBankBULLSSeries = {}
    NiftyBankBULLSSeries['seriesname'] = "Bulls"
    NiftyBankBULLSSeries['data'] = []

    let NiftyBankBEARSSeries = {}
    NiftyBankBEARSSeries['seriesname'] = "Bears"
    NiftyBankBEARSSeries['data'] = []


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


    for (let i = 0; i < allList.length; i++) {
        let name = allList[i];
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
                    BULLSMap[time]['COUNT'] = LONGMap[time]['COUNT'] + SHOT_COVERINGMap[time]['COUNT'] + GAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] + CAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT']
                    NiftyBULLSMap[time]['COUNT'] = NiftyLONGMap[time]['COUNT'] + NiftySHOT_COVERINGMap[time]['COUNT'] + NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] + NiftyCAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT']
                    NiftyBankBULLSMap[time]['COUNT'] = NiftyBankLONGMap[time]['COUNT'] + NiftyBankSHOT_COVERINGMap[time]['COUNT'] + NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['COUNT'] + NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap[time]['COUNT']
                    allFuturesAdvances += BULLSMap[time]['COUNT']
                    allNiftyFuturesAdvances += NiftyBULLSMap[time]['COUNT']
                    allNiftyBankFuturesAdvances += NiftyBankBULLSMap[time]['COUNT']
                }

                if (BEARSMap[time]) {
                    BEARSMap[time]['COUNT'] = SHORTSMap[time]['COUNT'] + LONG_UNWINDINGMap[time]['COUNT'] + BEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] + DEFENCE_BUY_ON_DECLINEMap[time]['COUNT']
                    NiftyBEARSMap[time]['COUNT'] = NiftySHORTSMap[time]['COUNT'] + NiftyLONG_UNWINDINGMap[time]['COUNT'] + NiftyBEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] + NiftyDEFENCE_BUY_ON_DECLINEMap[time]['COUNT']
                    NiftyBankBEARSMap[time]['COUNT'] = NiftyBankSHORTSMap[time]['COUNT'] + NiftyBankLONG_UNWINDINGMap[time]['COUNT'] + NiftyBankBEARS_COMING_SELL_ON_RISEMap[time]['COUNT'] + NiftyBankDEFENCE_BUY_ON_DECLINEMap[time]['COUNT']
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
        let val = {}
        val['color'] = '#3A6F43'
        val['value'] = aitem['COUNT']
        LONGSeries['data'].push(val)
    });

    jQ.each(SHORTSMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#D73535'
        val['value'] = aitem['COUNT']
        SHORTSSeries['data'].push(val)
    });

    jQ.each(SHOT_COVERINGMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#59AC77'
        val['value'] = aitem['COUNT']
        SHOT_COVERINGSeries['data'].push(val)
    });


    jQ.each(GAMBLING_BUY_NEWS_AND_EVENTSMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#628141'
        val['value'] = aitem['COUNT']
        GAMBLING_BUY_NEWS_AND_EVENTSSeries['data'].push(val)
    });


    jQ.each(LONG_UNWINDINGMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#FF4646'
        val['value'] = aitem['COUNT']
        LONG_UNWINDINGSeries['data'].push(val)
    });


    jQ.each(BEARS_COMING_SELL_ON_RISEMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#F90716'
        val['value'] = aitem['COUNT']
        BEARS_COMING_SELL_ON_RISESeries['data'].push(val)
    });

    jQ.each(CAUTION_WRITES_ERODING_PREMIUMMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#F39EB6'
        val['value'] = aitem['COUNT']
        CAUTION_WRITES_ERODING_PREMIUMSeries['data'].push(val)
    });

    jQ.each(DEFENCE_BUY_ON_DECLINEMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#E4F1AC'
        val['value'] = aitem['COUNT']
        DEFENCE_BUY_ON_DECLINESeries['data'].push(val)
    });


    jQ.each(BULLSMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#3A6F43'
        val['value'] = aitem['COUNT']
        BULLSSeries['data'].push(val)
    });

    jQ.each(BEARSMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#D73535'
        val['value'] = aitem['COUNT']
        BEARSSeries['data'].push(val)
    });




    jQ.each(NiftyLONGMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#3A6F43'
        val['value'] = aitem['COUNT']
        NiftyLONGSeries['data'].push(val)
    });

    jQ.each(NiftySHORTSMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#D73535'
        val['value'] = aitem['COUNT']
        NiftySHORTSSeries['data'].push(val)
    });

    jQ.each(NiftySHOT_COVERINGMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#59AC77'
        val['value'] = aitem['COUNT']
        NiftySHOT_COVERINGSeries['data'].push(val)
    });


    jQ.each(NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#628141'
        val['value'] = aitem['COUNT']
        NiftyGAMBLING_BUY_NEWS_AND_EVENTSSeries['data'].push(val)
    });


    jQ.each(NiftyLONG_UNWINDINGMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#FF4646'
        val['value'] = aitem['COUNT']
        NiftyLONG_UNWINDINGSeries['data'].push(val)
    });


    jQ.each(NiftyBEARS_COMING_SELL_ON_RISEMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#F90716'
        val['value'] = aitem['COUNT']
        NiftyBEARS_COMING_SELL_ON_RISESeries['data'].push(val)
    });

    jQ.each(NiftyCAUTION_WRITES_ERODING_PREMIUMMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#F39EB6'
        val['value'] = aitem['COUNT']
        NiftyCAUTION_WRITES_ERODING_PREMIUMSeries['data'].push(val)
    });

    jQ.each(NiftyDEFENCE_BUY_ON_DECLINEMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#E4F1AC'
        val['value'] = aitem['COUNT']
        NiftyDEFENCE_BUY_ON_DECLINESeries['data'].push(val)
    });


    jQ.each(NiftyBULLSMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#3A6F43'
        val['value'] = aitem['COUNT']
        NiftyBULLSSeries['data'].push(val)
    });

    jQ.each(NiftyBEARSMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#D73535'
        val['value'] = aitem['COUNT']
        NiftyBEARSSeries['data'].push(val)
    });




    jQ.each(NiftyBankLONGMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#3A6F43'
        val['value'] = aitem['COUNT']
        NiftyBankLONGSeries['data'].push(val)
    });

    jQ.each(NiftyBankSHORTSMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#D73535'
        val['value'] = aitem['COUNT']
        NiftyBankSHORTSSeries['data'].push(val)
    });

    jQ.each(NiftyBankSHOT_COVERINGMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#59AC77'
        val['value'] = aitem['COUNT']
        NiftyBankSHOT_COVERINGSeries['data'].push(val)
    });


    jQ.each(NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#628141'
        val['value'] = aitem['COUNT']
        NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSSeries['data'].push(val)
    });


    jQ.each(NiftyBankLONG_UNWINDINGMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#FF4646'
        val['value'] = aitem['COUNT']
        NiftyBankLONG_UNWINDINGSeries['data'].push(val)
    });


    jQ.each(NiftyBankBEARS_COMING_SELL_ON_RISEMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#F90716'
        val['value'] = aitem['COUNT']
        NiftyBankBEARS_COMING_SELL_ON_RISESeries['data'].push(val)
    });

    jQ.each(NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#F39EB6'
        val['value'] = aitem['COUNT']
        NiftyBankCAUTION_WRITES_ERODING_PREMIUMSeries['data'].push(val)
    });

    jQ.each(NiftyBankDEFENCE_BUY_ON_DECLINEMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#E4F1AC'
        val['value'] = aitem['COUNT']
        NiftyBankDEFENCE_BUY_ON_DECLINESeries['data'].push(val)
    });


    jQ.each(NiftyBankBULLSMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#3A6F43'
        val['value'] = aitem['COUNT']
        NiftyBankBULLSSeries['data'].push(val)
    });

    jQ.each(NiftyBankBEARSMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#D73535'
        val['value'] = aitem['COUNT']
        NiftyBankBEARSSeries['data'].push(val)
    });


    jQ("#future-advance-decline-adr").html("ADR: " + ((allFuturesAdvances / allFuturesDeclines).toFixed(2)) + " | A: " + allFuturesAdvances + " | D: " + allFuturesDeclines);

    jQ("#future-nifty-advance-decline-adr").html("ADR: " + ((allNiftyFuturesAdvances / allNiftyFuturesDeclines).toFixed(2)) + " | A: " + allNiftyFuturesAdvances + " | D: " + allNiftyFuturesDeclines);

    jQ("#future-bank-advance-decline-adr").html("ADR: " + ((allNiftyBankFuturesAdvances / allNiftyBankFuturesDeclines).toFixed(2)) + " | A: " + allNiftyBankFuturesAdvances + " | D: " + allNiftyBankFuturesDeclines);


    jQ("#futures-trend-chart").insertFusionCharts({
        type: "stackedcolumn2d",
        width: '100%',
        dataFormat: "json",
        dataSource: {
            chart: {

                "paletteColors": "#3A6F43,#D73535,#59AC77,#628141,#FF4646,#F90716,#F39EB6,#E4F1AC",
                "formatNumberScale": "0",
                "adjustDiv": "1", "theme": "candy",
                showvalues: "0",
                rotatelabels: "0",
                "showLabels": 1,
                "showValues": "1",
                "legendItemFontSize": "10",
            },
            axis: {
                y: {
                    tick: {
                        format: function (d) {
                            return (parseInt(d) == d) ? d : null;
                        }
                    }
                }
            },
            "categories": [{
                "category": categoryList
            }],
            dataset: [
                LONGSeries,
                SHORTSSeries,
                SHOT_COVERINGSeries,
                GAMBLING_BUY_NEWS_AND_EVENTSSeries,
                LONG_UNWINDINGSeries,
                BEARS_COMING_SELL_ON_RISESeries,
                CAUTION_WRITES_ERODING_PREMIUMSeries,
                DEFENCE_BUY_ON_DECLINESeries,
                BULLSSeries,
                BEARSSeries
            ]
        },
        "events": {
            dataPlotClick: function (ev, props) {
                console.log(props)
                let symbols = []
                let time = props['categoryLabel']
                if (props.datasetName == "Long") {
                    symbols = LONGMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Short") {
                    symbols = SHORTSMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Short Covering") {
                    symbols = SHOT_COVERINGMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Gambling! Buy News And Events") {
                    symbols = GAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Long Unwinding") {
                    symbols = LONG_UNWINDINGMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Bears Coming,Sell On Rise") {
                    symbols = BEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Caution! Writers Eroding Premium") {
                    symbols = CAUTION_WRITES_ERODING_PREMIUMMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Defence,Buy On Decline") {
                    symbols = DEFENCE_BUY_ON_DECLINEMap[time]['SYMBOL'];
                }


                if (props.datasetName == "Bulls") {
                    jQ.each(LONGMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });

                    jQ.each(SHOT_COVERINGMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });

                    jQ.each(GAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });
                }


                if (props.datasetName == "Bears") {
                    jQ.each(SHORTSMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });

                    jQ.each(LONG_UNWINDINGMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });

                    jQ.each(BEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });
                }
                showStockList(symbols)
            }
        }
    });


    jQ("#futures-trend-chart-nifty").insertFusionCharts({
        type: "stackedcolumn2d",
        width: '100%',
        dataFormat: "json",
        dataSource: {
            chart: {

                "paletteColors": "#3A6F43,#D73535,#59AC77,#628141,#FF4646,#F90716,#F39EB6,#E4F1AC",
                "formatNumberScale": "0",
                "adjustDiv": "1", "theme": "candy",
                showvalues: "0",
                rotatelabels: "0",
                "showLabels": 1,
                "showValues": "1",
                "legendItemFontSize": "10",
            },
            axis: {
                y: {
                    tick: {
                        format: function (d) {
                            return (parseInt(d) == d) ? d : null;
                        }
                    }
                }
            },
            "categories": [{
                "category": categoryList
            }],
            dataset: [
                NiftyLONGSeries,
                NiftySHORTSSeries,
                NiftySHOT_COVERINGSeries,
                NiftyGAMBLING_BUY_NEWS_AND_EVENTSSeries,
                NiftyLONG_UNWINDINGSeries,
                NiftyBEARS_COMING_SELL_ON_RISESeries,
                NiftyCAUTION_WRITES_ERODING_PREMIUMSeries,
                NiftyDEFENCE_BUY_ON_DECLINESeries,
                NiftyBULLSSeries,
                NiftyBEARSSeries
            ]
        },
        "events": {
            dataPlotClick: function (ev, props) {
                console.log(props)
                let symbols = []
                let time = props['categoryLabel']
                if (props.datasetName == "Long") {
                    symbols = NiftyLONGMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Short") {
                    symbols = NiftySHORTSMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Short Covering") {
                    symbols = NiftySHOT_COVERINGMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Gambling! Buy News And Events") {
                    symbols = NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Long Unwinding") {
                    symbols = NiftyLONG_UNWINDINGMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Bears Coming,Sell On Rise") {
                    symbols = NiftyBEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Caution! Writers Eroding Premium") {
                    symbols = NiftyCAUTION_WRITES_ERODING_PREMIUMMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Defence,Buy On Decline") {
                    symbols = NiftyDEFENCE_BUY_ON_DECLINEMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Bulls") {
                    jQ.each(NiftyLONGMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });

                    jQ.each(NiftySHOT_COVERINGMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });

                    jQ.each(NiftyGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });
                }


                if (props.datasetName == "Bears") {
                    jQ.each(NiftySHORTSMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });

                    jQ.each(NiftyLONG_UNWINDINGMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });

                    jQ.each(NiftyBEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });
                }

                showStockList(symbols)
            }
        }
    });


    jQ("#futures-trend-chart-nifty-bank").insertFusionCharts({
        type: "stackedcolumn2d",
        width: '100%',
        dataFormat: "json",
        dataSource: {
            chart: {

                "paletteColors": "#3A6F43,#D73535,#59AC77,#628141,#FF4646,#F90716,#F39EB6,#E4F1AC",
                "formatNumberScale": "0",
                "adjustDiv": "1", "theme": "candy",
                showvalues: "0",
                rotatelabels: "0",
                "showLabels": 1,
                "showValues": "1",
                "legendItemFontSize": "10",
            },
            axis: {
                y: {
                    tick: {
                        format: function (d) {
                            return (parseInt(d) == d) ? d : null;
                        }
                    }
                }
            },
            "categories": [{
                "category": categoryList
            }],
            dataset: [
                NiftyBankLONGSeries,
                NiftyBankSHORTSSeries,
                NiftyBankSHOT_COVERINGSeries,
                NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSSeries,
                NiftyBankLONG_UNWINDINGSeries,
                NiftyBankBEARS_COMING_SELL_ON_RISESeries,
                NiftyBankCAUTION_WRITES_ERODING_PREMIUMSeries,
                NiftyBankDEFENCE_BUY_ON_DECLINESeries,
                NiftyBankBULLSSeries,
                NiftyBankBEARSSeries
            ]
        },
        "events": {
            dataPlotClick: function (ev, props) {
                console.log(props)
                let symbols = []
                let time = props['categoryLabel']
                if (props.datasetName == "Long") {
                    symbols = NiftyBankLONGMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Short") {
                    symbols = NiftyBankSHORTSMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Short Covering") {
                    symbols = NiftyBankSHOT_COVERINGMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Gambling! Buy News And Events") {
                    symbols = NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Long Unwinding") {
                    symbols = NiftyBankLONG_UNWINDINGMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Bears Coming,Sell On Rise") {
                    symbols = NiftyBankBEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Caution! Writers Eroding Premium") {
                    symbols = NiftyBankCAUTION_WRITES_ERODING_PREMIUMMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Defence,Buy On Decline") {
                    symbols = NiftyBankDEFENCE_BUY_ON_DECLINEMap[time]['SYMBOL'];
                }

                if (props.datasetName == "Bulls") {
                    jQ.each(NiftyBankLONGMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });

                    jQ(NiftyBankSHOT_COVERINGMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });

                    jQ.each(NiftyBankGAMBLING_BUY_NEWS_AND_EVENTSMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });
                }

                if (props.datasetName == "Bears") {
                    jQ.each(NiftyBankSHORTSMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });

                    jQ.each(NiftyBankLONG_UNWINDINGMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });

                    jQ.each(NiftyBankBEARS_COMING_SELL_ON_RISEMap[time]['SYMBOL'], function (index, item) {
                        symbols.push(item)
                    });
                }
                showStockList(symbols)
            }
        }
    });
}

function showStockList(list) {
    console.log(scriptsVolumeMap)
    console.log(globalFuturesTrend)
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
                "class": 'details-control',
                "orderable": false,
                "data": null,
                "defaultContent": ''
            },

            {
                "data": "TRADINGSYMBOL",
                render: function (data, type, row, meta) {
                    let html = ''
                    html += '<a target="_blank" href="https://kite.zerodha.com/chart/ext/tvc/' + 'NSE' + '/' + data + '/' + instrumentTokens[data] + '"> '
                    html += data;
                    html += '</a>'

                    html += '<span class="badge bg-info">'
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
            { "data": "CLOSE_9_15" },
            { "data": "TREND" },
            { "data": "FUTURE_TREND" },
        ],
        "fnInitComplete": function (oSettings, json) {
            showExtraButtons()
        },
        "fnRowCallback": function (nRow, aData, iDisplayIndex, iDisplayIndexFull) {
        }
    });
}

function showExtraButtons() {

    jQ("#stock-list-table_wrapper .dt-buttons").append('<button id="nine-fifteen-scan" class="dt-button bg-info" type="button"><span>9.15 SCAN</span></button>');
    jQ("#stock-list-table_wrapper .dt-buttons").append('<span style="margin-right: .2rem;" id="processing-trend"></span>')
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

jQ(document).on('click', '#nine-fifteen-scan', function (e) {
    scanNineFifteenCandle()
});

async function scanNineFifteenCandle() {
    let scriptData = generateTrends()
    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));
    if (!breakOutNineFifteen) {
        breakOutNineFifteen = {}
        let stockData = stockTable.rows().data().toArray();
        for (let i = 0; i < stockData.length; i++) {
            let row = stockData[i];
            let name = row['TRADINGSYMBOL'];
            jQ("#stock-list-table_wrapper  #processing-trend").html("Processing.... " + (i + 1) + "/" + stockData.length);
            try {
                let historical = await getHistoricalDataUsingPromise(instrumentTokens[name], CURRENT_DAY, CURRENT_DAY, '5minute');
                let firstCandleClose = historical.data.candles[0][4]
                let asoPrice = 0;
                let bsoPrice = 0;
                asoPrice = parseFloat(row['STRIKEDATA']['ustrikeOne']);
                bsoPrice = parseFloat(row['STRIKEDATA']['bstrikeOne']);

                if (firstCandleClose > asoPrice) {
                    row['CLOSE_9_15'] = 'ASO';
                    breakOutNineFifteen[name] = {};
                    breakOutNineFifteen[name]['CLOSE_9_15'] = 'ASO';
                }

                if (firstCandleClose < bsoPrice) {
                    row['CLOSE_9_15'] = 'BSO';
                    breakOutNineFifteen[name] = {};
                    breakOutNineFifteen[name]['CLOSE_9_15'] = 'BSO';
                }
                updateStockTable(i, row)
            } catch (e) {
                console.log(e)
            }
        }
        localStorage.setItem("VALID_BREAKOUT_NINE_FIFTEEN", JSON.stringify(breakOutNineFifteen));
    }
}

function updateStockTable(id, row) {
    jQ('#stock-list-table').DataTable().row(id).data(row).draw(false);
}

jQ(document).on('click', '#stock-list-table tbody td.details-control', function (e) {
    e.preventDefault()
    let tr = jQ(this).closest('tr');
    let row = stockTable.row(tr);
    let id = stockTable.row(this).index();
    if (row.child.isShown()) {
        row.child.hide();
        tr.removeClass('shown');
    } else {
        row.child(addAdditonalDetails(row.data(), id)).show();
        tr.addClass('shown');
        showInfo(row.data(), id)
    }
});

async function showInfo(rowData, id) {
    let name = rowData['TRADINGSYMBOL']
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let data = await getHistoricalDataUsingPromise(instrumentTokens[name], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
    await savePreviousStockQuote(tempName, instrumentTokens[name])
    let previousQuote = JSON.parse(localStorage.getItem(tempName + "_PREVIOUS_DAY_QUOTE"));

    let quote = []
    jQ.each(data.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("DD-MM HH:mm")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map['time'] = moment(item[0]).format("HH:mm")
        quote.push(map);
    });


    let prevQuote = []
    jQ.each(previousQuote.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("DD-MM HH:mm")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        prevQuote.push(map);
    });
    showScriptChart(quote, name, id, prevQuote);
    showScriptData(quote, name, prevQuote)
    showPrictionProbabilty(name)
    await show15MinutesChart(name)
    await showHourChart(name);
    await showFutureDetails(name);
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

    let first = cres.data['candles'][0];
    let prev = pres.data['candles'][0];

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

    let strikeDiff = nseFutreStrikeDiff[name];
    strikeDiff = strikeDiff.split(",");
    let strikeOne = parseInt(strikeDiff[0])
    let strikeTwo = parseInt(strikeDiff[1])

    let ustrikeOne = (parseFloat(first[1]) + strikeOne);
    let ustrikeTwo = (ustrikeOne + strikeTwo);
    let bstrikeOne = (parseFloat(first[1]) - strikeOne);
    let bstrikeTwo = (bstrikeOne - strikeTwo);

    let strikeMap = {}
    strikeMap['strikeDiff'] = parseFloat(strikeDiff).toFixed(2);
    strikeMap['bstrikeOne'] = parseFloat(bstrikeOne).toFixed(2);
    strikeMap['bstrikeTwo'] = parseFloat(bstrikeTwo).toFixed(2);
    strikeMap['ustrikeOne'] = parseFloat(ustrikeOne).toFixed(2);
    strikeMap['ustrikeTwo'] = parseFloat(ustrikeTwo).toFixed(2);

    let chartId = 'chart-container-' + tempName + "-futures";
    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];

    var vix = getVixRange(parseFloat(prev[4]), parseFloat(vixQuote[4]))

    var vixLowerRange = 0;
    var vixUpperRange = 0;
    var vixDDRange = 0;

    vixLowerRange = parseFloat(vix.vixDDLower)
    vixUpperRange = parseFloat(vix.vixDDUpper)
    vixDDRange = parseFloat(vix.vixDDRange);


    let categoryList = []
    let dateIndex = 0
    jQ.each(data, function (index, item) {
        let map = {}
        map.label = item.date;
        map.x = dateIndex;
        categoryList.push(map)
        dateIndex++;
    });

    let dataList = []
    let min = 0
    let max = 0
    dateIndex = 0

    jQ.each(data, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
        map.volume = item.volume
        map.x = dateIndex

        if (index == 0) {
            min = item.high
            max = item.high
        }

        if (item.high < min) {
            min = item.high
        }

        if (item.high > max) {
            max = item.high
        }
        dataList.push(map);
        dateIndex++;
    });

    let lines = [];
    let line = {};

    line.color = "#8be73a";
    line.startvalue = vixLowerRange;
    line.displayvalue = 'Vix lower range ' + vixLowerRange;
    lines.push(line);;

    line = {};
    line.color = "#e7543a";
    line.startvalue = vixUpperRange;
    line.displayvalue = 'Vix upper range ' + vixUpperRange;
    lines.push(line);

    line = {};
    line.color = "#9f3ae7";
    line.startvalue = strikeMap.bstrikeTwo;
    line.displayvalue = "BST " + strikeMap.bstrikeTwo;
    lines.push(line);

    line = {};
    line.color = "#9f3ae7";
    line.startvalue = strikeMap.ustrikeTwo;
    line.displayvalue = "AST " + strikeMap.ustrikeTwo;
    lines.push(line);

    line = {};
    line.color = "#9f3ae7";
    line.startvalue = strikeMap.bstrikeOne;
    line.displayvalue = "BSO " + strikeMap.bstrikeOne;
    lines.push(line);

    line = {};
    line.color = "#9f3ae7";
    line.startvalue = strikeMap.ustrikeOne;
    line.displayvalue = "ASO " + strikeMap.ustrikeOne;
    lines.push(line);
    isVolumePresent = SHOW_VOLUME_ON_CHART
    jQ("#" + chartId).insertFusionCharts({
        type: 'candlestick',
        width: "100%",
        height: 400,
        dataFormat: 'json',
        dataSource: {
            "chart": {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "adjustDiv": "0", "theme": "candy",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                "pYAxisMinValue": min,
                "pYAxisMaxValue": max,
                "showLabels": 1,
                showVolumeChart: true,
            },
            "categories": [{
                "category": categoryList
            }],
            "dataset": [{
                "data": dataList,

            }],
            "trendlines": [{
                "line": lines
            }]
        }
    });

    prevData = prevData[prevData.length - 1];
    generateFutresDataTable(data, tempName, prevData, futures['lot_size'])
    generateFuturesOiPriceAnalysis(data, tempName, prevData, futures['lot_size'])

    let resp = {}
    if (tempName == "BANKNIFTY") {
        resp = showTableAiBankNiftyPrediction(data[data.length - 1], prevData, futures['lot_size'])
    } else {
        resp = showTableAiNiftyPrediction(data[data.length - 1], prevData, futures['lot_size'])
    }
    jQ("#future-trend-probability" + tempName).html(resp['PLUS'] + ' ' + resp['MINUS']);
}

function generateFuturesOiPriceAnalysis(data, tempName, prevData, lotSize) {
    var previousOI = prevData['oi'] / lotSize
    let price = []
    jQ.each(data, function (index, item) {
        let map = {}
        map.value = item.close;
        price.push(map)
    });

    let oiChange = []
    jQ.each(data, function (index, item) {
        let map = {}
        let oi = item.oi / lotSize
        var changeinOpenInterest = (oi - previousOI).toFixed(2)
        map.value = changeinOpenInterest;
        oiChange.push(map)
    });

    let oi = []
    jQ.each(data, function (index, item) {
        let map = {}
        map.value = item.oi / lotSize;
        oi.push(map)
    });

    let categoryList = []
    let dateIndex = 0
    jQ.each(data, function (index, item) {
        let map = {}
        map.label = item.date;
        map.x = dateIndex;
        categoryList.push(map)
        dateIndex++;

    });

    let chartId = 'chart-container-' + tempName + "-oi-price-analysis";
    jQ("#" + chartId).insertFusionCharts({
        type: "multiaxisline",
        width: "100%",
        dataFormat: "json",
        dataSource: {
            chart: {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                caption: "OI/Price Analysis",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                plothighlighteffect: "fadeout",
                theme: "fusion",
                showVolumeChart: true,
            },
            axis: [
                {
                    title: "OI Change",
                    divlineisdashed: "1",
                    color: "#D73535",
                    dataset: [
                        {
                            seriesname: "OI Change",
                            linethickness: "2",
                            data: oiChange
                        }
                    ],
                },
                {
                    title: "OI",
                    divlineisdashed: "1",
                    color: "#258ebe",
                    dataset: [
                        {
                            seriesname: "OI",
                            linethickness: "2",
                            data: oi
                        }
                    ],
                },
                {
                    title: "Price",
                    axisonleft: "0",
                    divlineisdashed: "1",
                    color: "#b925be",
                    dataset: [
                        {
                            seriesname: "Price",
                            dashed: "1",
                            linethickness: "2",
                            data: price
                        }
                    ]
                },
            ],
            categories: [
                {
                    category: categoryList
                }
            ],

        }
    });

}


async function show15MinutesChart(name, rowId) {
    let data = await getHistoricalDataUsingPromise(instrumentTokens[name], moment(CURRENT_DAY).add(-14, 'days').format("YYYY-MM-DD"), CURRENT_DAY, '15minute');
    let quote = []
    jQ.each(data.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("DD-MM HH:mm")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map['time'] = moment(item[0]).format("HH:mm")
        quote.push(map);
    });
    let scriptData = generateTrend(name)
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let chartId = 'chart-container-' + tempName.replaceAll(" ", "-").replaceAll("&", "-") + '-fifteen';

    let dayHigh = 0
    let dayLow = 0

    let categoryList = []
    let dateIndex = 0

    jQ.each(quote, function (index, item) {
        let map = {}
        map.label = item.date;
        map.x = dateIndex;
        categoryList.push(map)
        dateIndex++;

        if (item.high > dayHigh) {
            dayHigh = item.high
        }

        if (item.low < dayLow) {
            dayLow = item.low
        }

    });

    let dataList = []
    let min = 0
    let max = 0
    dateIndex = 0
    let isVolumePresent = false;

    jQ.each(quote, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
        if (item.volume) {
            map.volume = item.volume;
            isVolumePresent = true;
        }
        map.x = dateIndex
        if (item.high < min) {
            min = item.high
        }

        if (item.high > max) {
            max = item.high
        }
        dataList.push(map);
        dateIndex++;
    });

    isVolumePresent = SHOW_VOLUME_ON_CHART

    let lines = [];
    let line = {};


    line.color = "#8be73a";
    line.startvalue = scriptData['vix'].vixDDLower;
    line.displayvalue = 'VIXL: ' + scriptData['vix'].vixDDLower;
    lines.push(line);;

    line = {};
    line.color = "#e7543a";
    line.startvalue = scriptData['vix'].vixDDUpper;
    line.displayvalue = 'VIXU: ' + scriptData['vix'].vixDDUpper;
    lines.push(line);




    line = {};
    line.color = "#872b19ff";
    line.startvalue = scriptData['strikeData'].ustrikeTwo;
    line.displayvalue = "AST [NO BUYING]" + scriptData['strikeData'].ustrikeTwo;
    lines.push(line);


    line = {};
    line.color = "#d65db1";
    line.startvalue = scriptData['strikeData'].ustrikeOne;
    line.displayvalue = "ASO: " + scriptData['strikeData'].ustrikeOne;
    lines.push(line);


    line = {};
    line.color = "#ff6f91";
    line.startvalue = scriptData['strikeData'].bstrikeOne;
    line.displayvalue = "BSO: " + scriptData['strikeData'].bstrikeOne;
    lines.push(line);


    line = {};
    line.color = "#35dc35ff";
    line.startvalue = scriptData['strikeData'].bstrikeTwo;
    line.displayvalue = "BST [NO SELLING]: " + scriptData['strikeData'].bstrikeTwo;
    lines.push(line);

    jQ("#" + chartId).html('')
    jQ("#" + chartId).insertFusionCharts({
        type: 'candlestick',
        width: "100%",
        height: 400,
        dataFormat: 'json',
        dataSource: {
            "chart": {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "theme": "candy",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                showVolumeChart: true,

                "showLabels": 1
            },
            "categories": [{
                "category": categoryList
            }],
            "dataset": [{
                "data": dataList,

            }],
            "trendlines": [{
                "line": lines
            }]
        }
    });
}

async function showHourChart(name, rowId) {
    let data = await getHistoricalDataUsingPromise(instrumentTokens[name], moment(CURRENT_DAY).add(-14, 'days').format("YYYY-MM-DD"), CURRENT_DAY, '60minute');
    let quote = []
    jQ.each(data.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("DD-MM HH:mm")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map['time'] = moment(item[0]).format("HH:mm")
        quote.push(map);
    });
    let scriptData = generateTrend(name)
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let chartId = 'chart-container-' + tempName.replaceAll(" ", "-").replaceAll("&", "-") + '-hour';

    let dayHigh = 0
    let dayLow = 0

    let categoryList = []
    let dateIndex = 0

    jQ.each(quote, function (index, item) {
        let map = {}
        map.label = item.date;
        map.x = dateIndex;
        categoryList.push(map)
        dateIndex++;

        if (item.high > dayHigh) {
            dayHigh = item.high
        }

        if (item.low < dayLow) {
            dayLow = item.low
        }

    });

    let dataList = []
    let min = 0
    let max = 0
    dateIndex = 0
    let isVolumePresent = false;

    jQ.each(quote, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
        if (item.volume) {
            map.volume = item.volume;
            isVolumePresent = true;
        }
        map.x = dateIndex
        if (item.high < min) {
            min = item.high
        }

        if (item.high > max) {
            max = item.high
        }
        dataList.push(map);
        dateIndex++;
    });

    isVolumePresent = SHOW_VOLUME_ON_CHART

    let lines = [];
    let line = {};


    line.color = "#8be73a";
    line.startvalue = scriptData['vix'].vixDDLower;
    line.displayvalue = 'VIXL: ' + scriptData['vix'].vixDDLower;
    lines.push(line);;

    line = {};
    line.color = "#e7543a";
    line.startvalue = scriptData['vix'].vixDDUpper;
    line.displayvalue = 'VIXU: ' + scriptData['vix'].vixDDUpper;
    lines.push(line);




    line = {};
    line.color = "#872b19ff";
    line.startvalue = scriptData['strikeData'].ustrikeTwo;
    line.displayvalue = "AST [NO BUYING]" + scriptData['strikeData'].ustrikeTwo;
    lines.push(line);


    line = {};
    line.color = "#d65db1";
    line.startvalue = scriptData['strikeData'].ustrikeOne;
    line.displayvalue = "ASO: " + scriptData['strikeData'].ustrikeOne;
    lines.push(line);


    line = {};
    line.color = "#ff6f91";
    line.startvalue = scriptData['strikeData'].bstrikeOne;
    line.displayvalue = "BSO: " + scriptData['strikeData'].bstrikeOne;
    lines.push(line);


    line = {};
    line.color = "#35dc35ff";
    line.startvalue = scriptData['strikeData'].bstrikeTwo;
    line.displayvalue = "BST [NO SELLING]: " + scriptData['strikeData'].bstrikeTwo;
    lines.push(line);

    jQ("#" + chartId).html('')
    jQ("#" + chartId).insertFusionCharts({
        type: 'candlestick',
        width: "100%",
        height: 400,
        dataFormat: 'json',
        dataSource: {
            "chart": {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "theme": "candy",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                showVolumeChart: true,

                "showLabels": 1
            },
            "categories": [{
                "category": categoryList
            }],
            "dataset": [{
                "data": dataList,

            }],
            "trendlines": [{
                "line": lines
            }]
        }
    });
}

async function showScriptData(quote, name, prevQuote) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let stockDataTable = jQ("#script-data-" + tempName);
    let html = ''
    quote.reverse()
    jQ.each(quote, function (index, item) {
        let cssClass = ''
        if (item.volume > 50000) {
            cssClass = 'alert-warning'
        }

        html += '<tr class="' + item.cssClass + '">'
        html += '<td>' + item.date + '</td>'
        html += '<td>' + item.open + '</td>'
        html += '<td>' + item.high + '</td>'
        html += '<td>' + item.low + '</td>'

        let closeHtml = ''
        if ((item.close - item.previousClose) < 0) {
            closeHtml += '<span class="badge bg-danger">' + item.close + '</span>'
        } else {
            closeHtml += '<span class="badge bg-success">' + item.close + '</span>'
        }

        html += '<td>' + closeHtml + '</td>'
        html += '<td>' + item.volume + '</td>'
        html += '</tr>'
    })
    stockDataTable.find("tbody").html(html)
    stockDataTable.show()
}

function addAdditonalDetails(rowData, id) {

    let tempName = rowData['TRADINGSYMBOL'].replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let html = ''

    let chartId = 'chart-container-' + tempName.replaceAll(" ", "-").replaceAll("&", "-");



    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row" >'
    html += '<div class="col-md-12">'
    html += '<table  class="table display nowrap" id="predictor-stock-list-table' + tempName + '" style="width: 100%;">'

    html += '<thead>'

    html += '<tr>'
    html += '<th>PCR</th>'
    html += '<th id="pcr-prediction' + tempName + '">PCR</th>'
    html += '</tr>'

    html += '<tr>'
    html += '<th>OI PROBABILITY</th>'
    html += '<th  id="prediction-prediction' + tempName + '">PROBABILITY</th>'
    html += '</tr>'

    html += '<tr>'
    html += '<th>FUTURE PROBABILITY</th>'
    html += '<th  id="future-trend-probability' + tempName + '">FUTURE TREND</th>'
    html += '</tr>'

    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'

    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row">'

    html += '<div class="col-md-4">'
    html += '<div id="' + chartId + '-hour"class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-4">'
    html += '<div id="' + chartId + '-fifteen"class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '</div>'
    html += '</div>'

    html += '<div class="col-md-4">'
    html += '<div id="' + chartId + '-five"class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '</div>'
    html += '</div>'

    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<table  class="table display nowrap"  style="width: 100%;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th colspan="3" class="strike-colspan-class itm-col-class">Strike</th>'
    html += '<th colspan="3" class="strike-colspan-class itm-col-class">Strike</th>'
    html += '<th colspan="3" class="strike-colspan-class atm-col-class">Strike</th>'
    html += '<th colspan="3" class="strike-colspan-class otm-col-class">Strike</th>'
    html += '<th colspan="3" class="strike-colspan-class otm-col-class">Strike</th>'
    html += '</tr>'
    html += '<tr>'
    html += '<th id="STRIKE_LOWER_ONE_CE-prediction' + tempName + '" class="number-align" >CE</th>'
    html += '<th id="STRIKE_LOWER_ONE-prediction' + tempName + '" class="text-align">S</th>'
    html += '<th id="STRIKE_LOWER_ONE_PE-prediction' + tempName + '" class="number-align">PE</th> '

    html += '<th id="STRIKE_LOWER_TWO_CE-prediction' + tempName + '" class="number-align">CE</th>'
    html += '<th id="STRIKE_LOWER_TWO-prediction' + tempName + '" class="text-align">S</th>'
    html += '<th id="STRIKE_LOWER_TWO_PE-prediction' + tempName + '" class="number-align">PE</th> '

    html += '<th id="STRIKE_ATM_CE-prediction' + tempName + '" class="number-align">CE</th>'
    html += '<th id="STRIKE_ATM-prediction' + tempName + '" class="text-align">S</th>'
    html += '<th id="STRIKE_ATM_PE-prediction' + tempName + '" class="number-align">PE</th> '

    html += '<th id="STRIKE_UPPER_ONE_CE-prediction' + tempName + '" class="number-align">CE</th>'
    html += '<th id="STRIKE_UPPER_ONE-prediction' + tempName + '" class="text-align">S</th>'
    html += '<th id="STRIKE_UPPER_ONE_PE-prediction' + tempName + '" class="number-align">PE</th> '

    html += '<th id="STRIKE_UPPER_TWO_CE-prediction' + tempName + '" class="number-align">CE</th>'
    html += '<th id="STRIKE_UPPER_TWO-prediction' + tempName + '" class="text-align">S</th>'
    html += '<th id="STRIKE_UPPER_TWO_PE-prediction' + tempName + '" class="number-align">PE</th> '
    html += '<tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'


    html += '</div>'
    html += '</div>'

    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row" id="oi-obv-charts' + tempName + '">'
    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row">'
    html += '<div id="' + chartId + '-oi-price-analysis" class="col-md-12">'
    html += '</div>';
    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row">'
    html += '<div id="' + chartId + '-futures" class="col-md-12">'
    html += '</div>';
    html += '</div>'
    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row">'
    html += '<div class="col-md-12">'
    html += '<table class="historical-future-data-analyzer" id="historical-future-data-analyzer-list-table-' + tempName + '" style="width: 100%">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>DATE</th>'
    html += '<th>OI TREND</th>'
    html += '<th>CHANGE</th>'
    html += '<th>VWAP SIGNAL</th>'
    html += '<th>AI</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'

    html += '</tbody>'
    html += '</table>'
    html += '</div>'
    html += '</div>'

    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'

    html += '<div class="row">'
    html += '<div class="col-md-12" style="max-height:400px;height:400px;overflow:auto">'
    html += '<table  id="script-data-' + tempName + '" class="table table-hover" style="display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>DATE</th>'
    html += '<th>OPEN</th>'
    html += '<th>HIGH</th>'
    html += '<th>LOW</th>'
    html += '<th>CLOSE</th>'
    html += '<th>VOLUME</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'
    html += '</div>'
    html += '</div>'

    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<div class="row">'

    html += '<div class="col-md-6">'
    html += '<h6>Bullish Probability</h6>'
    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<input style="vertical-align:middle;" type="checkbox" /> Advances > Declines supporting the bullish trend'
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox" /> Price is below ASO/AST/VIXU ?'
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox" /> OI data supporting the bullish trend ?'
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox"/> 1 hour and 15 min timeframe indicates bullish trend ? '
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox"/> CE OBV  > PE OBV ? '
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox"/> Futures trend indicates bullish trend [Buy,Buy on decline,Short convering] ? '

    html += '</div>';

    html += '<div class="col-md-6">'
    html += '<h6>Bearish Probability</h6>'
    html += '<div class="px-3 py-2 border-bottom mb-3"></div>'
    html += '<input style="vertical-align:middle;" type="checkbox" /> Declines > Advances supporting the bullish trend'
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox"/> Price is above BSO/BST/VIXL'
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox" /> OI data supporting the bearish trend'
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox"/> 1 hour and 15 min timeframe indicates bearish trend ? '
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox"/> PE OBV  > CE OBV ? '
    html += '<br/>'
    html += '<input style="vertical-align:middle;" type="checkbox"/> Futures trend indicates bearish trend [Short,Sell on rise,Long unwanding] ? '
    html += '</div>';

    html += '</div>';

    return html;
}

async function showScriptChart(quote, name, rowId, prevQuote) {

    let scriptData = generateTrend(name)
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let chartId = 'chart-container-' + tempName.replaceAll(" ", "-").replaceAll("&", "-") + '-five';

    let dayHigh = 0
    let dayLow = 0

    let categoryList = []
    let dateIndex = 0


    jQ.each(prevQuote, function (index, item) {
        let map = {}
        map.label = item.date;
        map.x = dateIndex;
        categoryList.push(map)
        dateIndex++;

        if (index == 0) {
            dayHigh = item.high
            dayLow = item.low
        }

        if (item.high > dayHigh) {
            dayHigh = item.high
        }

        if (item.low < dayLow) {
            dayLow = item.low
        }
    });


    jQ.each(quote, function (index, item) {
        let map = {}
        map.label = item.date;
        map.x = dateIndex;
        categoryList.push(map)
        dateIndex++;

        if (item.high > dayHigh) {
            dayHigh = item.high
        }

        if (item.low < dayLow) {
            dayLow = item.low
        }

    });

    let dataList = []
    let min = 0
    let max = 0
    dateIndex = 0
    let isVolumePresent = false;

    jQ.each(prevQuote, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
        if (item.volume) {
            map.volume = item.volume;
            isVolumePresent = true;
        }
        map.x = dateIndex

        if (index == 0) {
            min = item.high
            max = item.high
        }

        if (item.high < min) {
            min = item.high
        }

        if (item.high > max) {
            max = item.high
        }
        dataList.push(map);
        dateIndex++;
    });


    jQ.each(quote, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
        if (item.volume) {
            map.volume = item.volume;
            isVolumePresent = true;
        }
        map.x = dateIndex

        if (index == 0) {
            min = item.high
            max = item.high
            map.displayValue = "O"
        }

        if (item.high < min) {
            min = item.high
        }

        if (item.high > max) {
            max = item.high
        }
        dataList.push(map);
        dateIndex++;
    });

    isVolumePresent = SHOW_VOLUME_ON_CHART

    let lines = [];
    let line = {};


    line.color = "#8be73a";
    line.startvalue = scriptData['vix'].vixDDLower;
    line.displayvalue = 'VIXL: ' + scriptData['vix'].vixDDLower;
    lines.push(line);;

    line = {};
    line.color = "#e7543a";
    line.startvalue = scriptData['vix'].vixDDUpper;
    line.displayvalue = 'VIXU: ' + scriptData['vix'].vixDDUpper;
    lines.push(line);




    line = {};
    line.color = "#872b19ff";
    line.startvalue = scriptData['strikeData'].ustrikeTwo;
    line.displayvalue = "AST [NO BUYING]" + scriptData['strikeData'].ustrikeTwo;
    lines.push(line);


    line = {};
    line.color = "#d65db1";
    line.startvalue = scriptData['strikeData'].ustrikeOne;
    line.displayvalue = "ASO: " + scriptData['strikeData'].ustrikeOne;
    lines.push(line);


    line = {};
    line.color = "#ff6f91";
    line.startvalue = scriptData['strikeData'].bstrikeOne;
    line.displayvalue = "BSO: " + scriptData['strikeData'].bstrikeOne;
    lines.push(line);


    line = {};
    line.color = "#35dc35ff";
    line.startvalue = scriptData['strikeData'].bstrikeTwo;
    line.displayvalue = "BST [NO SELLING]: " + scriptData['strikeData'].bstrikeTwo;
    lines.push(line);


    line = {};
    if (parseFloat(scriptData['open']) > parseFloat(scriptData['prevPrice']).toFixed(2)) {
        line.color = "#5D8736";
        line.displayvalue = "Open +ve: " + scriptData['open'];
    } else {
        line.color = "#A94A4A";
        line.displayvalue = "Open -ve: " + scriptData['open'];
    }
    line.dashed = 1;
    line.startvalue = scriptData['open'];
    lines.push(line);

    jQ("#" + chartId).html('')
    jQ("#" + chartId).insertFusionCharts({
        type: 'candlestick',
        width: "100%",
        height: 400,
        dataFormat: 'json',
        dataSource: {
            "chart": {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "theme": "candy",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                showVolumeChart: true,

                "showLabels": 1
            },
            "categories": [{
                "category": categoryList
            }],
            "dataset": [{
                "data": dataList,

            }],
            "trendlines": [{
                "line": lines
            }]
        }
    });
}

async function showTopChart(name, id) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));


    if (name == "GIFT NIFTY") {
        if (breakOutNineFifteen['GIFT NIFTY'] == undefined) {
            breakOutNineFifteen['GIFT NIFTY'] = {};
            breakOutNineFifteen['GIFT NIFTY']['CLOSE_9_15'] = "B/W"
        }
        jQ("#nine-fifteen-nifty-gift-trend").html('<span class="badge bg-info">9:15 CLOSE : ' + breakOutNineFifteen['GIFT NIFTY']['CLOSE_9_15'] + '</span>');
    }

    if (name == "NIFTY 50") {
        if (breakOutNineFifteen['NIFTY 50'] == undefined) {
            breakOutNineFifteen['NIFTY 50'] = {};
            breakOutNineFifteen['NIFTY 50']['CLOSE_9_15'] = "B/W"
        }
        jQ("#nine-fifteen-nifty-trend").html('<span class="badge bg-info">9:15 CLOSE : ' + breakOutNineFifteen['NIFTY 50']['CLOSE_9_15'] + '</span>');
    }

    if (name == "NIFTY BANK") {
        if (breakOutNineFifteen['NIFTY BANK'] == undefined) {
            breakOutNineFifteen['NIFTY BANK'] = {};
            breakOutNineFifteen['NIFTY BANK']['CLOSE_9_15'] = "B/W"
        }
        jQ("#nine-fifteen-nifty-bank-trend").html('<span class="badge bg-info">9:15 CLOSE : ' + breakOutNineFifteen['NIFTY BANK']['CLOSE_9_15'] + '</span>');
    }

    if (name == "SENSEX") {
        if (breakOutNineFifteen['SENSEX'] == undefined) {
            breakOutNineFifteen['SENSEX'] = {};
            breakOutNineFifteen['SENSEX']['CLOSE_9_15'] = "B/W"
        }
        jQ("#nine-fifteen-sensex-trend").html('<span class="badge bg-info">9:15 CLOSE : ' + breakOutNineFifteen['SENSEX']['CLOSE_9_15'] + '</span>');
    }

    let data = await getHistoricalDataUsingPromise(instrumentTokens[name], CURRENT_DAY, CURRENT_DAY, HISTORICAL_DATA_INTERVAL);
    await savePreviousStockQuote(tempName, instrumentTokens[name])
    let previousQuote = JSON.parse(localStorage.getItem(tempName + "_PREVIOUS_DAY_QUOTE"));

    let quote = []
    jQ.each(data.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("DD-MM HH:mm")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        map['time'] = moment(item[0]).format("HH:mm")
        quote.push(map);
    });


    let prevQuote = []
    jQ.each(previousQuote.data.candles, function (index, item) {
        let map = {}
        map['date'] = moment(item[0]).format("DD-MM HH:mm")
        map.open = item[1]
        map.high = item[2]
        map.low = item[3]
        map.close = item[4]
        map.volume = item[5]
        prevQuote.push(map);
    });

    let scriptData = generateTrend(name)
    let chartId = id;

    let dayHigh = 0
    let dayLow = 0

    let categoryList = []
    let dateIndex = 0


    jQ.each(prevQuote, function (index, item) {
        let map = {}
        map.label = item.date;
        map.x = dateIndex;
        categoryList.push(map)
        dateIndex++;

        if (index == 0) {
            dayHigh = item.high
            dayLow = item.low
        }

        if (item.high > dayHigh) {
            dayHigh = item.high
        }

        if (item.low < dayLow) {
            dayLow = item.low
        }
    });


    jQ.each(quote, function (index, item) {
        let map = {}
        map.label = item.date;
        map.x = dateIndex;
        categoryList.push(map)
        dateIndex++;

        if (item.high > dayHigh) {
            dayHigh = item.high
        }

        if (item.low < dayLow) {
            dayLow = item.low
        }

    });

    let dataList = []
    let min = 0
    let max = 0
    dateIndex = 0
    let isVolumePresent = false;

    jQ.each(prevQuote, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
        if (item.volume) {
            map.volume = item.volume;
            isVolumePresent = true;
        }
        map.x = dateIndex

        if (index == 0) {
            min = item.high
            max = item.high
        }

        if (item.high < min) {
            min = item.high
        }

        if (item.high > max) {
            max = item.high
        }
        dataList.push(map);
        dateIndex++;
    });


    jQ.each(quote, function (index, item) {
        let map = {}
        map.open = item.open
        map.high = item.high
        map.low = item.low
        map.close = item.close
        if (item.volume) {
            map.volume = item.volume;
            isVolumePresent = true;
        }
        map.x = dateIndex

        if (index == 0) {
            min = item.high
            max = item.high
            map.displayValue = "O"
        }

        if (item.high < min) {
            min = item.high
        }

        if (item.high > max) {
            max = item.high
        }
        dataList.push(map);
        dateIndex++;
    });

    isVolumePresent = SHOW_VOLUME_ON_CHART

    let lines = [];
    let line = {};


    line.color = "#8be73a";
    line.startvalue = scriptData['vix'].vixDDLower;
    line.displayvalue = 'VIXL: ' + scriptData['vix'].vixDDLower;
    lines.push(line);;

    line = {};
    line.color = "#e7543a";
    line.startvalue = scriptData['vix'].vixDDUpper;
    line.displayvalue = 'VIXU: ' + scriptData['vix'].vixDDUpper;
    lines.push(line);




    line = {};
    line.color = "#872b19ff";
    line.startvalue = scriptData['strikeData'].ustrikeTwo;
    line.displayvalue = "AST [NO BUYING]" + scriptData['strikeData'].ustrikeTwo;
    lines.push(line);


    line = {};
    line.color = "#d65db1";
    line.startvalue = scriptData['strikeData'].ustrikeOne;
    line.displayvalue = "ASO: " + scriptData['strikeData'].ustrikeOne;
    lines.push(line);


    line = {};
    line.color = "#ff6f91";
    line.startvalue = scriptData['strikeData'].bstrikeOne;
    line.displayvalue = "BSO: " + scriptData['strikeData'].bstrikeOne;
    lines.push(line);


    line = {};
    line.color = "#35dc35ff";
    line.startvalue = scriptData['strikeData'].bstrikeTwo;
    line.displayvalue = "BST [NO SELLING]: " + scriptData['strikeData'].bstrikeTwo;
    lines.push(line);


    line = {};
    if (parseFloat(scriptData['open']) > parseFloat(scriptData['prevPrice']).toFixed(2)) {
        line.color = "#5D8736";
        line.displayvalue = "Open +ve: " + scriptData['open'];
    } else {
        line.color = "#A94A4A";
        line.displayvalue = "Open -ve: " + scriptData['open'];
    }
    line.dashed = 1;
    line.startvalue = scriptData['open'];
    lines.push(line);

    jQ("#" + chartId).html('')
    jQ("#" + chartId).insertFusionCharts({
        type: 'candlestick',
        width: "100%",
        height: 400,
        dataFormat: 'json',
        dataSource: {
            "chart": {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0", "theme": "candy",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                "showLabels": 1,
                showVolumeChart: true,
            },
            "categories": [{
                "category": categoryList
            }],
            "dataset": [{
                "data": dataList,

            }],
            "trendlines": [{
                "line": lines
            }]
        }
    });
}

function generateFutresDataTable(quote, id, prevQuote, lotSize) {
    lotSize = parseInt(lotSize)
    jQ('#historical-future-data-analyzer-list-table-' + id).DataTable({
        "processing": true,
        "order": [[0, "desc"]],
        "pageLength": 50,
        "bPaginate": false,
        "data": quote,
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
        "columns": [
            { "data": "date" },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    var bottomTriangle = '<i class="bi bi-caret-down"></i>'
                    var upTriangle = '<i class="bi bi-caret-up"></i>'

                    var openInterest = row.oi / lotSize;
                    var previousOI = prevQuote.oi / lotSize
                    var changeinOpenInterest = (openInterest - previousOI)
                    var pchangeinOpenInterest = (((openInterest - previousOI) / previousOI) * 100).toFixed(2);

                    var oiPrice = ''
                    var oiPriceChang = ''
                    var oiPriceChangDirection = ''
                    var oiPricePer = ''
                    if (changeinOpenInterest > 0) {
                        oiPrice += '<span class="badge bg-success">' + openInterest.toFixed(0) + '</span>'
                        oiPriceChang += '<span class="badge bg-success">' + parseFloat(changeinOpenInterest).toFixed(2) + '</span>'
                        oiPriceChangDirection += '<span class="badge bg-success">' + upTriangle + '</span>'

                    } else {
                        oiPrice += '<span class="badge bg-danger">' + openInterest.toFixed(0) + '</span>'
                        oiPriceChang += '<span class="badge bg-danger">' + parseFloat(changeinOpenInterest).toFixed(2) + '</span>'
                        oiPriceChangDirection += '<span class="badge bg-danger">' + bottomTriangle + '</span>'
                    }

                    if (pchangeinOpenInterest > 0) {
                        oiPricePer += '<span class="badge bg-success">' + parseFloat(pchangeinOpenInterest).toFixed(2) + '%</span>'
                    } else {
                        oiPricePer += '<span class="badge bg-danger">' + parseFloat(pchangeinOpenInterest).toFixed(2) + '%</span>'
                    }

                    return oiPrice + " " + oiPriceChangDirection + " " + oiPricePer + " " + oiPriceChang
                }
            },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    var change = (row.close - prevQuote.close)
                    return change.toFixed(2)
                }
            },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    var pTypicalPrice = (parseFloat(prevQuote.high) + parseFloat(prevQuote.low) + parseFloat(prevQuote.close)) / 3
                    var cTypicalPrice = (parseFloat(row.high) + parseFloat(row.low) + parseFloat(row.close)) / 3
                    var cVolumePrice = cTypicalPrice * parseFloat(row.volume)
                    var pVolumePrice = pTypicalPrice * parseFloat(prevQuote.volume)
                    var totalVolumePrice = cVolumePrice + pVolumePrice
                    var totalVolume = parseInt(row.volume) + parseInt(prevQuote.volume)
                    var vwapPrice = (totalVolumePrice / totalVolume).toFixed(2)
                    var vwap = vwapPrice ? vwapPrice : 0;
                    var correctedVwap = vwap;
                    if (id == "BANKNIFTY") {
                        correctedVwap = correctedVwap;
                    }
                    var booleanValue = false;
                    if (correctedVwap <= row.close) {
                        booleanValue = true;
                    } else {
                        booleanValue = false;
                    }
                    var buyResult = Math.abs(row.open - row.low);
                    var sellResult = Math.abs(row.open - row.high);
                    var openPrice = row.open;
                    var highPrice = row.high;
                    var lowPrice = row.low;
                    var lastPrice = row.close;
                    var prevClose = prevQuote.close

                    var bottomTriangle = '<i class="bi bi-caret-down"></i>'
                    var upTriangle = '<i class="bi bi-caret-up"></i>'
                    var futureTrend = ''
                    var futureDirection = ''
                    var diffNiftyOpenPrevOpen = Math.abs(openPrice - prevClose);
                    var diffNiftyOpenPrevOpenResult = false;
                    if (diffNiftyOpenPrevOpen >= 1 && diffNiftyOpenPrevOpen <= 11) {
                        diffNiftyOpenPrevOpenResult = true
                    }
                    if (id == "BANKNIFTY") {
                        if (buyResult >= 0 && buyResult <= 30) {
                            var trend = "Strong BUY";
                            futureTrend = '<span class="badge bg-success">' + trend + '</span>'
                            futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
                        } else if (sellResult >= 0 && sellResult <= 30) {
                            var trend = "Strong SELL";
                            futureTrend = '<span class="badge bg-danger">' + trend + '</span>'
                            futureDirection = '<span class="badge bg-danger">' + bottomTriangle + '</span>'
                        } else if (openPrice > prevClose && lastPrice >= openPrice
                            && booleanValue == true) {
                            var trend = "BUY";
                            futureTrend = '<span class="badge bg-success">' + trend + '</span>'
                            futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
                        } else if (booleanValue == true && lastPrice > openPrice) {
                            var trend = "BUY On Decline";
                            futureTrend = '<span class="badge bg-success">' + trend + '</span>'
                            futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
                        } else {
                            var trend = "SELL";
                            futureTrend = '<span class="badge bg-danger">' + trend + '</span>'
                            futureDirection = '<span class="badge bg-danger">' + bottomTriangle + '</span>'
                        }
                    } else {
                        if (buyResult >= 0 && buyResult <= 11 && booleanValue == true) {
                            var trend = "Strong BUY";
                            futureTrend = '<span class="badge bg-success">' + trend + '</span>'
                            futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
                        } else if (sellResult >= 0 && sellResult <= 9 && booleanValue == false) {
                            var trend = "Strong SELL";
                            futureTrend = '<span class="badge bg-danger">' + trend + '</span>'
                            futureDirection = '<span class="badge bg-danger">' + bottomTriangle + '</span>'
                        } else if (openPrice > prevClose && lastPrice > openPrice
                            && booleanValue == true) {
                            var trend = "BUY";
                            futureTrend = '<span class="badge bg-success">' + trend + '</span>'
                            futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
                        } else if (diffNiftyOpenPrevOpenResult == true
                            && booleanValue == true && lastPrice > openPrice) {
                            var trend = "BUY On Decline";
                            futureTrend = '<span class="badge bg-success">' + trend + '</span>'
                            futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
                        } else {
                            var trend = "SELL";
                            futureTrend = '<span class="badge bg-danger">' + trend + '</span>'
                            futureDirection = '<span class="badge bg-danger">' + bottomTriangle + '</span>'
                        }
                    }
                    return futureTrend + " " + futureDirection
                }
            },
            {
                "data": '',
                render: function (data, type, row, meta) {
                    let resp = {};
                    if (id == "BANKNIFTY") {
                        resp = showTableAiBankNiftyPrediction(row, prevQuote, lotSize)
                    } else {
                        resp = showTableAiNiftyPrediction(row, prevQuote, lotSize)
                    }
                    return resp['PLUS'] + '<br/>' + resp['MINUS'];
                }
            },
        ],
        "fnInitComplete": function (oSettings, json) {
        }
    });
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

    var dogImgContainer = '<span class="badge bg-light">' + dogImage + '</span>'
    var bullImageImgContainer = '<span class="badge bg-light">' + bullImage + '</span>'
    var bearImageImgContainer = '<span class="badge bg-light">' + bearImage + '</span>'
    var hulkImageImgContainer = '<span class="badge bg-light">' + hulkImage + '</span>'
    var captainImgContainer = '<span class="badge bg-light">' + captain + '</span>'
    var lokiImgContainer = '<span class="badge bg-light">' + loki + '</span>'
    var ironManImgContainer = '<span class="badge bg-light">' + ironMan + '</span>'
    var thorImgContainer = '<span class="badge bg-light">' + thor + '</span>'
    var hulNewImgContainer = '<span class="badge bg-light">' + hulkImageNew + '</span>'
    var doctorStrangeImgContainer = '<span class="badge bg-light">' + doctor_strange + '</span>'
    remark += dogImgContainer
    var display = "+";

    var RemarkType = ""

    if (price == "+" && oi == "+") {
        remark = '<span class="badge bg-success">Long</span>'
        display = "+";
        RemarkType = "LONG"
    } else if (price == "-" && oi == "+") {
        remark = '<span class="badge bg-danger">Short</span>'
        display = "-";
        RemarkType = "SHORT"
    } else if (price == "+" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = '<span class="badge bg-success">Short Covering</span>'
        display = "+";
        RemarkType = "SHOT_COVERING"
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = dogImgContainer + '<span class="badge bg-danger">Long Unwinding</span>'
        display = "-";
        RemarkType = "LONG_UNWINDING"
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding == false) {
        remark = dogImgContainer + lokiImgContainer + '<span class="badge bg-danger">Bears Coming,Sell On Rise</span>'
        display = "-";
        RemarkType = "BEARS_COMING_SELL_ON_RISE"
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo >= 10) {
        remark = '<span class="badge bg-danger">Gambling! Buy,News & Events</span>'
        display = "+";
        RemarkType = "GAMBLING_BUY_NEWS_AND_EVENTS"
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo < 10) {
        remark = '<span class="badge bg-danger">Caution! Writers Eroding Premium</span>'
        display = "+";
        RemarkType = "CAUTION_WRITES_ERODING_PREMIUM"
    } else {
        remark = captainImgContainer + '<span class="badge bg-danger">Defence,Buy On Decline</span>'
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
        marketTrendPlus = '<span class=" badge bg-success">Hulk Arrived (+)</span>'
        otherTrendRemarks += '<div class="row">'
        otherTrendRemarks += '<div class="col-md-12">'
        otherTrendRemarks += "Hulk Arrived (+)"
        otherTrendRemarks += '</div>'
        otherTrendRemarks += '</div>'
        if (pChangeEvo >= 4 && price != "+-") {
            imageBullPlus = thorImgContainer + hulNewImgContainer + bullImageImgContainer
            otherRemarkType = "HULK_THOR_BULL_ARRIVED"
        } else if (pChangeEvo >= 4 && price == "+-") {
            marketTrendPlus = '<span class=" badge bg-warning">Doctor Strange Arrived (+)</span>'
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
        marketTrendPlus = '<span class="  badge bg-danger">Strongly Not Recommended to buy Calls</span>'
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
        marketTrendMinus = '<span class=" badge bg-danger">Chitauri Army Arrived (-)</span>'
        imageBearMinus = bearImageImgContainer
    } else {
        marketTrendMinus = '<span class="  badge bg-danger">Strongly Not Recommended to Short Calls</span>'
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


    var dogImgContainer = '<span class="badge bg-light">' + dogImage + '</span>'
    var bullImageImgContainer = '<span class="badge bg-light">' + bullImage + '</span>'
    var bearImageImgContainer = '<span class="badge bg-light">' + bearImage + '</span>'
    var hulkImageImgContainer = '<span class="badge bg-light">' + hulkImage + '</span>'
    var captainImgContainer = '<span class="badge bg-light">' + captain + '</span>'
    var lokiImgContainer = '<span class="badge bg-light">' + loki + '</span>'
    var ironManImgContainer = '<span class="badge bg-light">' + ironMan + '</span>'
    var thorImgContainer = '<span class="badge bg-light">' + thor + '</span>'
    var hulNewImgContainer = '<span class="badge bg-light">' + hulkImageNew + '</span>'
    var doctorStrangeImgContainer = '<span class="badge bg-light">' + doctor_strange + '</span>'
    remark += dogImgContainer
    var display = "+";

    var aiStatus = ""

    if (price == "+" && oi == "+") {
        remark = '<span class="badge bg-success">Long</span>'
        display = "+";
        aiStatus = "LONG"
    } else if (price == "-" && oi == "+") {
        remark = '<span class="badge bg-danger">Short</span>'
        display = "-";
        aiStatus = "SHORT"
    } else if (price == "+" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = '<span class="badge bg-success">Short Covering</span>'
        display = "+";
        aiStatus = "SHOT_COVERING"
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding) {
        remark = dogImgContainer + '<span class="badge bg-danger">Long Unwinding</span>'
        display = "-";
        aiStatus = "LONG_UNWINDING"
    } else if (price == "-" && oi == "-"
        && shortCoveringOrLongUnwinding == false) {
        remark = dogImgContainer + lokiImgContainer + '<span class="badge bg-danger">Bears Coming,Sell On Rise</span>'
        display = "-";
        aiStatus = "BEARS_COMING_SELL_ON_RISE"
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo >= 10) {
        remark = '<span class="badge bg-danger">Gambling! Buy,News & Events</span>'
        display = "+";
        aiStatus = "GAMBLING_BUY_NEWS_AND_EVENTS"
    } else if (price == "+-" && oi == "+"
        && shortCoveringOrLongUnwinding == false
        && booleanValue == true && pChangeEvo < 10) {
        remark = '<span class="badge bg-danger">Caution! Writers Eroding Premium</span>'
        display = "+";
        aiStatus = "CAUTION_WRITES_ERODING_PREMIUM"
    } else {
        remark = captainImgContainer + '<span class="badge bg-danger">Defence,Buy On Decline</span>'
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
        marketTrendPlus = '<span class=" badge bg-success">Hulk Arrived (+)</span>'
        otherTrendRemarks += '<div class="row">'
        otherTrendRemarks += '<div class="col-md-12">'
        otherTrendRemarks += "Hulk Arrived (+)"
        otherTrendRemarks += '</div>'
        otherTrendRemarks += '</div>'
        if (pChangeEvo >= 4 && price != "+-") {
            imageBullPlus = thorImgContainer + hulNewImgContainer + bullImageImgContainer
            otherRemarkType = "HULK_THOR_BULL_ARRIVED"
        } else if (pChangeEvo >= 4 && price == "+-") {
            marketTrendPlus = '<span class=" badge bg-warning">Doctor Strange Arrived (+)</span>'
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
        marketTrendPlus = '<span class="  badge bg-danger">Strongly Not Recommended to buy Calls</span>'
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
        marketTrendMinus = '<span class=" badge bg-danger">Chitauri Army Arrived (-)</span>'
        imageBearMinus = bearImageImgContainer
    } else {
        marketTrendMinus = '<span class="  badge bg-danger">Strongly Not Recommended to Short Calls</span>'
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