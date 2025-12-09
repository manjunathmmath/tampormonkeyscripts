jQ(document).on("click", "#show-advance-decline-scanner", function (e) {
    e.preventDefault();
    showAdvanceDeclineScanner();
});



async function showAdvanceDeclineScanner() {

    let html = ''
    html += '<div id="advance-decline-chart" style="width:100%;" class="shadow-lg p-1 mb-2 bg-body-tertiary rounded">'
    html += '</div>'


    html += '<div class="px-3 py-2 border-bottom mb-1"></div>'
    html += '<div class="row">'


    html += '<div class="col-md-6" >'
    html += '<h6 style="text-align:center">ASO</h6>'
    html += '<table  class="" id="advance-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>TIME</th>'
    html += '<th>COUNT</th>'
    html += '<th>SYMBOL</th>'
    html += '</tr>'
    html += '</thead>'
    html += '<tbody>'
    html += '</tbody>'
    html += '</table>'
    html += '</div>'


    html += '<div class="col-md-6" >'
    html += '<h6 style="text-align:center">BSO</h6>'
    html += '<table  class="" id="decline-list-table" style="width: 100%;display: none;">'
    html += '<thead>'
    html += '<tr>'
    html += '<th>TIME</th>'
    html += '<th>COUNT</th>'
    html += '<th>SYMBOL</th>'
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
    title += 'Advacne Decline Scanner'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '<a  id="start-advance-decline-auto-refresh">Refresh <i class="bi bi-arrow-counterclockwise"></i></a>'
    title += '</div>'
    title += '<div class="col-md-1 pop-title-extra">'
    title += '</div>'
    title += '<div class="col-md-3 pop-title-extra">'
    title += '<span id="advance-decaline-last-refresh-time">Last @ 00:00:00</span>'
    title += '</div>'
    title += '</div>'

    showPopUpWindow('advance-decline-scanner', html, "Advance/Decline Scanner", 950, 550);
    var divId = "popup-custom-style-advance-decline-scanner";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
}
let advanceDeclineTimerInstance = null

jQ(document).on("click", "#start-advance-decline-auto-refresh", function (e) {
    e.preventDefault();
    var that = jQ(this);
    that.attr("disabled", true);
    commonRefreshAdvanceDecline(that)
});

async function commonRefreshAdvanceDecline(that) {
    clearInterval(advanceDeclineTimerInstance)
    await autoRefreshAdvacenDeclineScanner(that);
    that.removeAttr("disabled");
}

async function autoRefreshAdvacenDeclineScanner() {
    let scriptData = generateTrends()

    let advanceSeries = {}
    advanceSeries['seriesname'] = "Advance"
    advanceSeries['data'] = []

    let declineSeries = {}
    declineSeries['seriesname'] = "Decline"
    declineSeries['data'] = []

    let categoryList = [];

    let advanceMap = {};
    let declineMap = {};
    for (let i = 0; i < FO_LIST.length; i++) {
        let strikes = scriptData[FO_LIST[i]]['strikeData']

        let asoPrice = parseFloat(scriptData[FO_LIST[i]]['strikeData']['ustrikeOne']);
        let bsoPrice = parseFloat(scriptData[FO_LIST[i]]['strikeData']['bstrikeOne']);
        console.log(asoPrice, bsoPrice)

        let data = await getHistoricalDataUsingPromise(instrumentTokens[FO_LIST[i]], CURRENT_DAY, CURRENT_DAY, '5minute');
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
            }

        });


        jQ.each(data.data.candles, function (index, item) {
            let time = moment(item[0]).format("HH:mm");
            if (advanceMap[time]) {
                if (item[4] > asoPrice) {
                    advanceMap[time]['SYMBOL'].push(FO_LIST[i])
                    advanceMap[time]['COUNT'] = advanceMap[time]['COUNT'] + 1
                }
            }

            if (declineMap[time]) {
                if (item[4] < bsoPrice) {
                    declineMap[time]['SYMBOL'].push(FO_LIST[i])
                    declineMap[time]['COUNT'] = declineMap[time]['COUNT'] + 1
                }
            }
        });
    };

    console.log(advanceMap, declineMap)


    let advanceHtml = ''
    jQ.each(advanceMap, function (aindex, aitem) {
        let val = {}
        val['color'] = '#37a009 '
        val['value'] = aitem['COUNT']
        advanceSeries['data'].push(val)

        advanceHtml += '<tr>'

        advanceHtml += '<td>'
        advanceHtml += aindex
        advanceHtml += '</td>'

        advanceHtml += '<td>'
        advanceHtml += aitem['COUNT']
        advanceHtml += '</td>'

        advanceHtml += '<td>'
        advanceHtml += aitem['SYMBOL']
        advanceHtml += '</td>'

        advanceHtml += '</tr>'
    });;
    jQ("#advance-list-table").show()
    jQ("#advance-list-table tbody").html(advanceHtml)


    let declineHtml = ''
    jQ.each(declineMap, function (dindex, ditem) {
        let val = {}
        val['color'] = '#da3224'
        val['value'] = ditem['COUNT']
        declineSeries['data'].push(val);

        declineHtml += '<tr>'

        declineHtml += '<td>'
        declineHtml += dindex
        declineHtml += '</td>'

        declineHtml += '<td>'
        declineHtml += ditem['COUNT']
        declineHtml += '</td>'

        declineHtml += '<td>'
        declineHtml += ditem['SYMBOL']
        declineHtml += '</td>'

        declineHtml += '</tr>'
    });
    jQ("#decline-list-table").show()
    jQ("#decline-list-table tbody").html(declineHtml)


    jQ("#advance-decline-chart").insertFusionCharts({
        type: "mscolumn2d",
        width: "100%",
        dataFormat: "json",
        dataSource: {
            chart: {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "theme": "fusion",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                "paletteColors": "  #37a009,#da3224",
                "showLabels": 1
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
        }
    });

    jQ('#advance-list-table').DataTable({
        "processing": true,
        "order": [[0, "desc"]],
        "pageLength": 50,
        "bPaginate": false,
        "bDestroy": true,
        "scrollX": true,
        "scrollY": "400px",
    })

    jQ('#decline-list-table').DataTable({
        "processing": true,
        "order": [[0, "desc"]],
        "pageLength": 50,
        "bPaginate": false,
        "bDestroy": true,
        "scrollX": true,
        "scrollY": "400px",
    })
}