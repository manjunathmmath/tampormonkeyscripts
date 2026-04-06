jQ(document).on("click", "#show-stock-viewer", function (e) {
    e.preventDefault();
    showStockViewer();
});


function showStockViewer() {

    let html = ''
    let asoCount = 0;
    let bsoCount = 0;
    let allCount = 0;
    let scriptData = generateTrends()
    jQ.each(instrumentTokens, function (index, item) {
        let name = index
        let trends = scriptData[name]['trends']
        if (jQ.inArray("ASO", trends) != -1) {
            asoCount++;
        }
        if (jQ.inArray("BSO", trends) != -1) {
            bsoCount++;
        }
        allCount++
    });


    html += '<div class="row" id="oi-viewer-scanner-content-buttons">'
    html += '<button data-trend="all" class="dt-button stock-trend-filter  bg-secondary extra-buttons col-md-1" type="button"><span>ALL (' + allCount + ')</span></button>'
    html += '<button data-trend="aso" class="dt-button stock-trend-filter  bg-secondary extra-buttons col-md-1" type="button"><span>ASO(' + asoCount + ')</span></button>'
    html += '<button data-trend="bso" class="dt-button stock-trend-filter  bg-secondary extra-buttons col-md-1" type="button"><span>BSO (' + bsoCount + ')</span></button>'
    html += '<button data-trend="n50" class="dt-button stock-trend-filter  bg-secondary extra-buttons col-md-1" type="button"><span>N50</span></button>'
    html += '<button data-trend="bank" class="dt-button stock-trend-filter  bg-secondary extra-buttons col-md-1" type="button"><span>BN</span></button>'
    html += '<button data-trend="weight" class="dt-button stock-trend-filter  bg-secondary extra-buttons col-md-1" type="button"><span>WEIGHTED</span></button>'
    html += '</div>'

    html += '<div class="row" id="oi-viewer-scanner-content">'
    html += '</div>'


    let title = ''
    title += '<div class="row">'
    title += '<div class="col-md-2">'
    title += 'STOCK VIEWER'
    title += '</div>'
    title += '</div>'

    showPopUpWindow('stock-viewer-scanner', html, "STOCK VIEWER", 950, 550);
    var divId = "popup-custom-style-stock-viewer-scanner";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
}

jQ(document).on("click", ".stock-trend-filter", function (e) {
    let type = jQ(this).attr("data-trend");
    showStockAnalyzer(type);
});

async function showStockAnalyzer(type) {
    let html = ''

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

        if (type == "weight") {
            if (jQ.inArray(name, WEIGHTED_STOCKS) != -1) {
                list.push(name)
            }
        }
    });

    for (let i = 0; i < list.length; i++) {
        html += '<div class="row">'
        html += showComponentStockViewer(list[i], i)
        html += showComponentFuturesStockViewer(list[i])
        html += showComponentOIStockViewer(list[i])
        html += '</div>'
    }
    jQ("#oi-viewer-scanner-content").html(html);

    for (let i = 0; i < list.length; i++) {
        try {
            await showTopChartStockViewer(list[i]);
        } catch (e) {
            console.log(e)
        }

        try {
            let res = await showFutureDetails(list[i]);
            setFutureDetailsStockViewer(list[i], res);

            try {
                await showPrictionProbabilty(list[i])
                showOIOBVBarChartStockViewer(list[i]);
            } catch (e) {
                console.log(e)
            }
        } catch (e) {
            console.log(e)
        }
    }

}

function showOIOBVBarChartStockViewer(name) {
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


    jQ("#" + tempName + "-pcr-probability-stock-viewer").html(pcrHtml + " | " + chPcrHtml)

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
        bindto: "#" + tempName + "-oi-obv-stock-viewer",
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

function setFutureDetailsStockViewer(name, data) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    jQ("#" + tempName + "-futures-stock-viewer").html(data['PLUS'] + '<br/>' + data['MINUS']);

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
        jQ("#" + tempName + "-futures-premium-stock-viewer").html(html);
    }
}

async function showTopChartStockViewer(name) {
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
            bindto: "#" + chartId + "-chart-stock-viewer",
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

function showComponentStockViewer(name, index) {
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
    html += '<div class="col-md-4" style="border:1px solid #c3c3c3;background-color:' + componentColor + ';">'

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

    html += '<span style="position: absolute;top: .2rem;" data-index="' + index + '" data-name="' + name + '" class="badge bg-secondary show-info">i</span>'
    html += '<span class="badge ' + bgClass + '" style="position:absolute;top:.2rem;right:.2rem;">' + breakOutNineFifteen[name]['CLOSE_9_15'] + '</span>'
    html += '<span class="badge bg-dark" style="position:absolute;top:.2rem;left:2.2rem;">W %' + (WEIGHTED_STOCKS_WEIGHT[name] == undefined ? "" : WEIGHTED_STOCKS_WEIGHT[name]) + '</span>'
    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size: .8rem;font-weight: 600;">' + link + '</h4>'
    html += '</div>'
    html += '</div>'

    html += '<div class="row" style="">'
    html += '<div class="col-md-12" style="height:10rem;position:relative;background-color:#000000;">'
    html += '<div id="' + tempName + '-chart-stock-viewer" ></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'
    return html;
}

function showComponentFuturesStockViewer(name) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let html = ''
    html += '<div class="col-md-4" style="border:1px solid #c3c3c3;">'
    html += '<div class="row" style="">'
    html += '<div class="col-md-12" style="position:relative;background-color:#ffbcb0;">'
    html += '<span id="' + tempName + '-futures-premium-stock-viewer" style="position: absolute;left: 2.4rem;top: .2rem;"  data-name="' + name + '">PREMIUM</span>'

    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size: .8rem;font-weight: 600;">FUTURES</h4>'
    html += '</div>'
    html += '<div class="col-md-12" style="height:10rem;position:relative;text-align:center;">'
    html += '<div id="' + tempName + '-futures-stock-viewer" ></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'
    return html;
}

function showComponentOIStockViewer(name) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let html = ''
    html += '<div class="col-md-4" style="border:1px solid #c3c3c3;">'
    html += '<div class="row" style="">'
    html += '<div class="col-md-12" style="position:relative;background-color:#ffbcb0;">'
    html += '<span id="' + tempName + '-pcr-probability-stock-viewer" style="position: absolute;right: .2rem;top: .2rem;" data-name="' + name + '">PCR</span>'
    html += '<h4 style="text-align:center;padding:.5rem;padding-bottom:unset;font-size: .8rem;font-weight: 600;">OI/OBV</h4>'
    html += '</div>'
    html += '<div class="col-md-12" style="height:10rem;position:relative;">'
    html += '<div id="' + tempName + '-oi-obv-stock-viewer"></div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'
    return html;
}