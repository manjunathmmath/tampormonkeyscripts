// ─── stockViewer.js ────────────────────────────────────────────────────────────
// Multi-stock side-by-side viewer popup.
//
// PURPOSE:
//   Displays a grid of stock "cards", each showing chart + futures + OI/OBV data,
//   allowing quick visual comparison across a filtered subset of instruments.
//
// FILTERS (toolbar buttons):
//   ALL      — all instruments in INSTRUMENT_TOKENS
//   ASO      — instruments currently above strike one (bullish breakout)
//   BSO      — instruments currently below strike one (bearish breakdown)
//   N50      — Nifty 50 constituents (NIFTY_50_LIST)
//   BN       — Bank Nifty constituents (NIFTY_BANK_LIST)
//   WEIGHTED — top-weighted constituents used for component score (WEIGHTED_STOCKS)
//
// CARD LAYOUT per instrument (3 sub-columns):
//   Col 1: LightweightCharts candlestick with ASO/AST/BSO/BST/VIXU/VIXL lines
//   Col 2: OI/OBV bar chart (showOIOBVBarChartStockViewer) + PCR + OI score + signal
//   Col 3: Futures premium, VWAP trend, futures trend (setFutureDetailsStockViewer)
//
// SCORE FLOW:
//   updateScoresOfOIStockViewer() → scoreOIStrikeForSignal() → OI + IV score per strike
//   updateScoresOfTrendStockViewer() → getOISignal() → BUY/SELL/STRONG signal label
// ─────────────────────────────────────────────────────────────────────────────

// Opens the Stock Viewer popup. Counts ASO/BSO stocks upfront for filter buttons.
jQ(document).on("click", "#show-stock-viewer", function (e) {
    e.preventDefault();
    showStockViewer();
});

jQ(document).on("click", ".refresh-oi-stock-viewer", async function (e) {
    let name = jQ(this).attr("data-name");
    if (!name) return;
    let oiData = await showTrendingOI(name);
    if (stock[0]) {
        stock[0]['DATA'] = oiData;
        showOIOBVBarChartStockViewer(name);
    }
});


// Renders the Stock Viewer popup shell with filter buttons + empty content area.
// The actual stock cards are populated by showStockAnalyzer() when a filter is clicked.
function showStockViewer() {

    let html = ''
    let asoCount = 0;
    let bsoCount = 0;
    let allCount = 0;
    let scriptData = generateTrends()
    jQ.each(INSTRUMENT_TOKENS, function (index, item) {
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
    html += '<button data-trend="all" class="dt-button stock-trend-filter extra-buttons" type="button"><span>ALL (' + allCount + ')</span></button>'
    html += '<button data-trend="aso" class="dt-button stock-trend-filter extra-buttons" type="button"><span style="color:var(--gtb-green);">ASO (' + asoCount + ')</span></button>'
    html += '<button data-trend="bso" class="dt-button stock-trend-filter extra-buttons" type="button"><span style="color:var(--gtb-red);">BSO (' + bsoCount + ')</span></button>'
    html += '<button data-trend="n50" class="dt-button stock-trend-filter extra-buttons" type="button"><span>N50</span></button>'
    html += '<button data-trend="bank" class="dt-button stock-trend-filter extra-buttons" type="button"><span>BN</span></button>'
    html += '<button data-trend="weight" class="dt-button stock-trend-filter extra-buttons" type="button"><span>WEIGHTED</span></button>'
    html += '</div>'

    html += '<div class="row" id="oi-viewer-scanner-content">'
    html += '</div>'


    let title = ''
    title += '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
    title += '<span style="font-weight:800;font-size:0.7rem;white-space:nowrap;"><i class="bi bi-person-lines-fill"></i> STOCK VIEWER</span>'
    title += popupWinControls("popup-custom-style-stock-viewer-scanner")
    title += '</div>'

    showPopUpWindow('stock-viewer-scanner', html, "STOCK VIEWER", 950, 550);
    var divId = "popup-custom-style-stock-viewer-scanner";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    hideNativePopupButtons(divId);
}

jQ(document).on("click", ".stock-trend-filter", function (e) {
    let type = jQ(this).attr("data-trend");
    showStockAnalyzer(type);
});

// Populates #oi-viewer-scanner-content with stock cards for the selected filter type.
// For each instrument in the filtered list:
//   1. Renders card HTML (chart + futures + OI columns)
//   2. Renders candlestick chart via showTopChartStockViewer()
//   3. Fetches futures details via showFutureDetails() → setFutureDetailsStockViewer()
//   4. Fetches OI/OBV via showPrictionProbabilty() → showOIOBVBarChartStockViewer()
// Runs sequentially (await in loop) to avoid rate-limiting the Kite historical API.
async function showStockAnalyzer(type) {
    let html = ''

    let list = [];
    let scriptData = generateTrends()
    jQ.each(INSTRUMENT_TOKENS, function (index, item) {
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
        html += '<div class="sv-stock-row">'
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

// Updates the OI score + signal badge in the stock viewer card for a given instrument.
// Calls getOISignal() to convert raw OI score + ATM CE/PE labels into a BUY/SELL string.
function updateScoresOfTrendStockViewer(name, score, atmCeLabel, atmPeLabel) {
    let sig = getOISignal(score, atmCeLabel, atmPeLabel);
    let scoreCls = score > 0 ? 'sv-badge sv-badge-green' : 'sv-badge sv-badge-red';
    let signalCls = sig.signal === 'BUY' || sig.signal === 'STRONG BUY' ? 'sv-badge sv-badge-green'
                  : sig.signal === 'SELL' || sig.signal === 'STRONG SELL' ? 'sv-badge sv-badge-red'
                  : 'sv-badge sv-badge-amber';
    let scoreHtml = '<span class="' + scoreCls + '"><i class="bi bi-speedometer"></i> ' + (score > 0 ? '+' : '') + parseFloat(score).toFixed(1) + '</span>'
    scoreHtml += '<span class="' + signalCls + '">' + sig.signal + '</span>'
    jQ("#" + name.replaceAll(" ", "-").replaceAll("&", "-") + "-oi-score-stock-viewer").html(scoreHtml)
}

function updateScoresOfOIStockViewer(name, item, priceChange) {
    let result = scoreOIStrikeForSignal(item, !!item['ATM_STRIKE'], priceChange);
    return result.score;
}


function showOIOBVBarChartStockViewer(name) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let x = ['x']

    let oiCECH = ["CH CE OI"]
    let oiPECH = ["CH PE OI"]

    let oiCESUM = ["SUM CE OI"]
    let oiPESUM = ["SUM PE OI"]

    let oiCEOBV = ["CE OBV"]
    let oiPEOBV = ["PE OBV"]

    let data = stock[0]['DATA']['tableData']
    let oiData = stock[0]['DATA']

    if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
    INSTRUMENT_SCORE_MAP[name].oiData = oiData;

    let pcrHtml = ''
    let chPcrHtml = ''

    function pcrBadge(val, label) {
        let v = parseFloat(val);
        let cls = v > 1.3 ? 'sv-badge-green' : v > 1.0 ? 'sv-badge-amber' : v > 0.7 ? 'sv-badge-muted' : 'sv-badge-red';
        let tip = v > 1.3 ? 'Very Bullish' : v > 1.0 ? 'Moderately Bullish' : v > 0.7 ? 'Neutral' : 'Bearish';
        return '<span title="' + tip + ' PCR" class="sv-badge ' + cls + '">' + label + ':' + val + '</span>';
    }
    pcrHtml = pcrBadge(oiData['pcr'], 'P');
    chPcrHtml = pcrBadge(oiData['chPcr'], 'Δ');
    jQ("#" + tempName + "-pcr-probability-stock-viewer").html(pcrHtml + chPcrHtml)

    let priceChange = parseFloat(generateTrend(name).change) || 0;
    let oiScore = 0
    let atmIndex = -1;
    let strikeSignals = [];

    let columnsOi = [];
    let columnsObv = [];

    jQ.each(data, function (index, item) {
        x.push(item['STRIKE'])
        oiCECH.push(item['CHG_OI_CE'])
        oiPECH.push(item['CHG_OI_PE'])
        let sumCE = parseFloat(item['OI_CE']) + parseFloat(item['CHG_OI_CE'])
        let sumPE = parseFloat(item['OI_PE']) + parseFloat(item['CHG_OI_PE'])
        oiCESUM.push(sumCE.toFixed(1))
        oiPESUM.push(sumPE.toFixed(1))

        // OBV delta instead of cumulative level
        let ceObvList = item['CE_OBV'], peObvList = item['PE_OBV'];
        oiCEOBV.push(parseFloat(ceObvList[ceObvList.length-1]['obv']).toFixed(1))
        oiPEOBV.push(parseFloat(peObvList[peObvList.length-1]['obv']).toFixed(1))

        let result = scoreOIStrikeForSignal(item, !!item['ATM_STRIKE'], priceChange);
        let strikeScore = updateScoresOfOIStockViewer(name, item, priceChange);
        oiScore += strikeScore;

        if (item['ATM_STRIKE']) atmIndex = index;

        let color;
        if      (strikeScore >= 2)  color = '#28a745';
        else if (strikeScore <= -2) color = '#dc3545';
        else if (strikeScore > 0)   color = '#85c785';
        else if (strikeScore < 0)   color = '#e08080';
        else                        color = '#6c757d';
        strikeSignals.push({ strike: item['STRIKE'], score: strikeScore, color: color, ceLabel: result.ceLabel, peLabel: result.peLabel, isATM: !!item['ATM_STRIKE'] });
    });

    let atmSignalSV = strikeSignals.find(function(s) { return s.isATM; });
    updateScoresOfTrendStockViewer(name, oiScore, atmSignalSV ? atmSignalSV.ceLabel : null, atmSignalSV ? atmSignalSV.peLabel : null);

    let atmRegions = atmIndex >= 0
        ? [{ axis: 'x', start: atmIndex - 0.5, end: atmIndex + 0.5, class: 'atm-region' }]
        : [];
    let atmGridLines = atmIndex >= 0
        ? [{ value: atmIndex, text: 'ATM', class: 'atm-grid-line', position: 'start' }]
        : [];

    columnsOi.push(x)
    columnsOi.push(oiCECH)
    columnsOi.push(oiPECH)

    columnsObv.push(x)
    columnsObv.push(oiCEOBV)
    columnsObv.push(oiPEOBV)

    _renderBarChart(tempName + '-oi-stock-viewer', {
        labels: x.slice(1),
        height: 130,
        atm: atmIndex,
        series: [
            { label: 'CH CE OI', color: OI_COLORS.CE_OI, values: oiCECH.slice(1) },
            { label: 'CH PE OI', color: OI_COLORS.PE_OI, values: oiPECH.slice(1) }
        ]
    });

    _renderBarChart(tempName + '-obv-stock-viewer', {
        labels: x.slice(1),
        height: 130,
        atm: atmIndex,
        series: [
            { label: 'CE OBV', color: OI_COLORS.CE_OBV, values: oiCEOBV.slice(1) },
            { label: 'PE OBV', color: OI_COLORS.PE_OBV, values: oiPEOBV.slice(1) }
        ]
    });

    // Strike signal annotation row — CE/PE interpretation per strike
    let signalRowHtml = '<div style="display:flex;gap:2px;margin-top:4px;flex-wrap:nowrap;overflow-x:auto;">';
    for (let i = 0; i < strikeSignals.length; i++) {
        let s = strikeSignals[i];
        let border = s.isATM ? '2px solid #fbbf24' : '1px solid #30363d';
        let fontWeight = s.isATM ? 'bold' : 'normal';
        let ceLabelColor = (s.ceLabel === 'CE WRITE' || s.ceLabel === 'CE UNWIND') ? '#f85149'
                         : (s.ceLabel === 'CE BUY'   || s.ceLabel === 'CE COV')    ? '#3fb950' : '#7d8590';
        let peLabelColor = (s.peLabel === 'PE WRITE' || s.peLabel === 'PE UNWIND') ? '#3fb950'
                         : (s.peLabel === 'PE BUY'   || s.peLabel === 'PE COV')    ? '#f85149' : '#7d8590';
        signalRowHtml += '<div style="flex:1;min-width:70px;text-align:center;border:' + border + ';border-radius:4px;padding:2px;background:' + s.color + '22;">';
        signalRowHtml += '<div style="font-size:0.6rem;color:' + (s.isATM ? '#fbbf24' : '#e6edf3') + ';font-weight:' + fontWeight + ';">' + s.strike + (s.isATM ? ' ★' : '') + '</div>';
        signalRowHtml += '<div style="font-size:0.62rem;color:' + ceLabelColor + ';">' + s.ceLabel + '</div>';
        signalRowHtml += '<div style="font-size:0.62rem;color:' + peLabelColor + ';">' + s.peLabel + '</div>';
        signalRowHtml += '<div style="font-size:0.6rem;color:#7d8590;">' + (s.score > 0 ? '+' : '') + parseFloat(s.score).toFixed(1) + '</div>';
        signalRowHtml += '</div>';
    }
    signalRowHtml += '</div>';
    jQ("#" + tempName + "-oi-signal-row-stock-viewer").html(signalRowHtml);

    showComponentOITableStockViewer(name);
}


function showComponentOITableStockViewer(name) {
    let tempName = name.replaceAll(" ", "-").replaceAll("&", "-");
    let strikes = stock[0]['DATA']['tableData'];
    let link = "https://kite.zerodha.com/markets/ext/chart/web/tvc/NFO-OPT/##INSTRUMENT##/##TOKEN##";

    // Find ATM index
    let atmIdx = -1;
    for (let i = 0; i < strikes.length; i++) {
        if (strikes[i]['ATM_STRIKE']) { atmIdx = i; break; }
    }
    if (atmIdx === -1) atmIdx = Math.floor(strikes.length / 2);

    // Column group labels with ATM highlight
    let colClasses = ['itm-col-class', 'itm-col-class', 'atm-col-class', 'otm-col-class', 'otm-col-class'];
    let colLabels = ['ITM-2', 'ITM-1', 'ATM', 'OTM+1', 'OTM+2'];

    let html = '<div class="sv-oi-table"><table style="width:100%;">';
    html += '<thead><tr>';
    for (let i = 0; i < 5; i++) {
        let cls = i === atmIdx ? 'atm-col-class oi-atm-subhdr' : colClasses[i];
        html += '<th colspan="5" class="strike-colspan-class ' + cls + '">' + (colLabels[i] || 'Strike') + '</th>';
    }
    html += '</tr><tr>';
    for (let i = 0; i < 5; i++) {
        let atmCls = i === atmIdx ? ' oi-atm-subhdr' : '';
        html += '<th class="number-align' + atmCls + '">CE ΔOI</th>';
        html += '<th class="number-align' + atmCls + '">CE OBV</th>';
        html += '<th class="text-align' + atmCls + '">Strike</th>';
        html += '<th class="number-align' + atmCls + '">PE OBV</th>';
        html += '<th class="number-align' + atmCls + '">PE ΔOI</th>';
    }
    html += '</tr></thead><tbody><tr>';

    for (let i = 0; i < 5; i++) {
        let s = strikes[i];
        let isAtm = (i === atmIdx);
        let cellCls = isAtm ? ' oi-atm-cell' : '';
        if (s) {
            let ceChg = parseFloat(s['CHG_OI_CE']);
            let peChg = parseFloat(s['CHG_OI_PE']);
            let ceObvL = s['CE_OBV'], peObvL = s['PE_OBV'];
            let ceObv = parseFloat(ceObvL[ceObvL.length-1]['obv']);
            let peObv = parseFloat(peObvL[peObvL.length-1]['obv']);
            let ceColor = ceChg > 0 ? 'color:var(--gtb-red);' : ceChg < 0 ? 'color:var(--gtb-green);' : '';
            let peColor = peChg > 0 ? 'color:var(--gtb-green);' : peChg < 0 ? 'color:var(--gtb-red);' : '';
            let ceLink = s.CE ? '<a href="' + link.replace('##INSTRUMENT##', s.CE.tradingsymbol).replace('##TOKEN##', s.CE.instrument_token) + '" target="_blank">CE</a>' : 'CE';
            let peLink = s.PE ? '<a href="' + link.replace('##INSTRUMENT##', s.PE.tradingsymbol).replace('##TOKEN##', s.PE.instrument_token) + '" target="_blank">PE</a>' : 'PE';
            html += '<td class="number-align' + cellCls + '" style="' + ceColor + '">' + (ceChg > 0 ? '+' : '') + ceChg + '</td>';
            html += '<td class="number-align' + cellCls + '">' + ceObv + '</td>';
            html += '<td class="text-align' + cellCls + '" style="' + (isAtm ? 'color:var(--gtb-gold);font-weight:800;' : '') + '">' + s['STRIKE'] + '<br><span style="display:flex;gap:3px;justify-content:center;">' + ceLink + peLink + '</span></td>';
            html += '<td class="number-align' + cellCls + '">' + peObv + '</td>';
            html += '<td class="number-align' + cellCls + '" style="' + peColor + '">' + (peChg > 0 ? '+' : '') + peChg + '</td>';
        } else {
            html += '<td colspan="5" class="text-align' + cellCls + '">—</td>';
        }
    }
    html += '</tr></tbody></table></div>';
    jQ("#" + tempName + "-component-oi-list-table-stock-viewer").html(html);
}

function setFutureDetailsStockViewer(name, data) {
    let tempName = name.replaceAll(" ", "-").replaceAll("&", "-");

    // Render bull/bear signal rows
    let BULLISH = ['Long', 'Short Covering', 'Gambling! Buy News And Events', 'Defence,Buy On Decline', 'Bulls'];
    let plusText = data['PLUS'] || '';
    let minusText = data['MINUS'] || '';
    let isBull = BULLISH.some(function(b) { return plusText.indexOf(b) !== -1; });
    let futHtml = '';
    if (plusText) {
        futHtml += '<div class="sv-fut-chip ' + (isBull ? 'bull' : 'bear') + '">' + plusText + '</div>';
    }
    if (minusText) {
        futHtml += '<div class="sv-fut-chip ' + (!isBull ? 'bull' : 'bear') + '">' + minusText + '</div>';
    }
    jQ("#" + tempName + "-futures-stock-viewer").html(futHtml);

    if (name != "CRUDEOIL") {
        let scriptData = generateTrend(name);
        let premium = parseFloat(scriptData['ltp']) - parseFloat(data['quote']['close']);
        let premHtml = '';
        if (premium > 0) {
            premHtml = '<span class="sv-badge sv-badge-green">+' + premium.toFixed(0) + ' prem</span>';
        } else if (premium < 0) {
            premHtml = '<span class="sv-badge sv-badge-red">' + premium.toFixed(0) + ' dis</span>';
        } else {
            premHtml = '<span class="sv-badge sv-badge-muted">0 prem</span>';
        }
        jQ("#" + tempName + "-futures-premium-stock-viewer").html(premHtml);
        jQ("#" + tempName + "-futures-vwap-stock-viewer").html(data['vwap'] || '—');
        jQ("#" + tempName + "-futures-trend-stock-viewer").html(data['trend'] || '—');
    }
}

async function showTopChartStockViewer(name) {
    try {
        let tempName = name.replaceAll(" ", "-")
        tempName = tempName.replaceAll("&", "-")

        let data = await getHistoricalDataUsingPromise(INSTRUMENT_TOKENS[name], _gtbCurrDay(), _gtbCurrDayTo(), HISTORICAL_DATA_INTERVAL);
        await savePreviousStockQuote(tempName, INSTRUMENT_TOKENS[name])
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

    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));
    if (!breakOutNineFifteen) breakOutNineFifteen = {};

    let close915 = 'N/A';
    let nineClass = 'sv-badge sv-badge-muted';
    if (breakOutNineFifteen[name]) {
        close915 = breakOutNineFifteen[name]['CLOSE_9_15'] || 'N/A';
        if (close915 === 'ASO') nineClass = 'sv-badge sv-badge-green';
        else if (close915 === 'BSO') nineClass = 'sv-badge sv-badge-red';
        else if (close915 === 'B/W') nineClass = 'sv-badge sv-badge-blue';
    }

    let weight = WEIGHTED_STOCKS_WEIGHT[name];
    let weightBadge = weight != null ? '<span class="sv-badge sv-badge-muted">W ' + weight + '%</span>' : '';

    let link = '<a class="sv-instr-link" target="_blank" href="https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/' + name + '/' + INSTRUMENT_TOKENS[name] + '">' + name + '</a>'
    let infoBadge = '<span class="sv-badge sv-badge-muted sv-btn show-info" data-index="' + index + '" data-name="' + name + '" style="cursor:pointer;">i</span>';

    let html = ''
    html += '<div class="sv-stock-col">'
    // Header
    html += '<div class="sv-card-header">'
    html += '  <div class="sv-header-left">' + infoBadge + weightBadge + '</div>'
    html += '  <div class="sv-header-title">' + link + '</div>'
    html += '  <div class="sv-header-right"><span class="' + nineClass + '">' + close915 + '</span></div>'
    html += '</div>'
    // Chart area
    html += '<div class="sv-chart-area">'
    html += '  <div id="' + tempName + '-chart-stock-viewer"></div>'
    html += '</div>'
    html += '</div>'
    return html;
}

function showComponentFuturesStockViewer(name) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let html = ''
    html += '<div class="sv-stock-col">'
    // Header
    html += '<div class="sv-card-header">'
    html += '  <div class="sv-header-left"><span class="sv-section-label">FUTURES</span></div>'
    html += '  <div class="sv-header-right">'
    html += '    <span id="' + tempName + '-futures-premium-stock-viewer"></span>'
    html += '    <span class="hdr-actions">'
    html += '      <button class="sv-icon-btn refresh-futures-stock-viewer" data-name="' + name + '" title="Refresh Futures"><i class="bi bi-arrow-clockwise"></i></button>'
    html += '    </span>'
    html += '  </div>'
    html += '</div>'
    // Body
    html += '<div class="sv-fut-body">'
    html += '  <div id="' + tempName + '-futures-stock-viewer" class="sv-fut-signals"></div>'
    html += '  <div class="sv-fut-meta">'
    html += '    <span class="sv-meta-label">VWAP</span> <span id="' + tempName + '-futures-vwap-stock-viewer" class="sv-meta-val"></span>'
    html += '    &nbsp;<span class="sv-meta-label">TREND</span> <span id="' + tempName + '-futures-trend-stock-viewer" class="sv-meta-val"></span>'
    html += '  </div>'
    html += '</div>'
    html += '</div>'
    return html;
}

function showComponentOIStockViewer(name) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let html = ''
    html += '<div class="sv-stock-col">'
    // Header
    html += '<div class="sv-card-header">'
    html += '  <div class="sv-header-left"><span class="sv-section-label">OI / OBV</span></div>'
    html += '  <div class="sv-header-right">'
    html += '    <span id="' + tempName + '-oi-score-stock-viewer" class="sv-score-val"></span>'
    html += '    <span id="' + tempName + '-pcr-probability-stock-viewer" class="sv-pcr-val"></span>'
    html += '    <span class="hdr-actions">'
    html += '      <button class="sv-icon-btn refresh-oi-stock-viewer" data-name="' + name + '" title="Refresh OI"><i class="bi bi-arrow-clockwise"></i></button>'
    html += '      <button class="sv-icon-btn maximize-component-btn" data-name="' + name + '" data-type="oi" title="Maximize"><i class="bi bi-fullscreen"></i></button>'
    html += '    </span>'
    html += '  </div>'
    html += '</div>'
    // Body
    html += '<div class="sv-oi-body">'
    html += '  <div id="' + tempName + '-oi-stock-viewer" class="sv-mini-chart"></div>'
    html += '  <div id="' + tempName + '-oi-signal-row-stock-viewer" class="sv-signal-row"></div>'
    html += '  <div id="' + tempName + '-obv-stock-viewer" class="sv-mini-chart"></div>'
    html += '  <div id="' + tempName + '-component-oi-list-table-stock-viewer" class="sv-oi-table"></div>'
    html += '</div>'
    html += '</div>'
    return html;
}