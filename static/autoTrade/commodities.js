// ─── commodities.js ────────────────────────────────────────────────────────────
// Chart rendering for MCX (commodity futures) instruments.
//
// KEY DIFFERENCES vs NSE equity charts (showTopChart in grootTradeBot.js):
//
//   1. TOKEN SOURCE: Uses COMMODITIES_FUTURE_INSTRUMENT_LIST (MCX tokens)
//      instead of INSTRUMENT_TOKENS (NSE tokens).
//
//   2. STRIKE LEVELS: Uses MCX_FUTURE_STRIKE_DIFF (e.g. "100,100" for CRUDEOILM)
//      instead of NSE_STRIKE_DIFF. Layout is identical:
//        BST = open − strikeOne − strikeTwo
//        BSO = open − strikeOne
//        ASO = open + strikeOne
//        AST = open + strikeOne + strikeTwo
//
//   3. VIX INDEX: MCX instruments use commodity volatility indexes instead of India VIX:
//        CRUDEOIL / CRUDEOILM  → OVX  (CBOE Crude Oil Volatility Index)
//        GOLD / GOLDM          → GVZ  (CBOE Gold Volatility Index)
//        SILVER / SILVERM      → VXSLV (CBOE Silver Volatility Index)
//        NATURALGAS / NATGASMINI → VIX (India VIX as proxy — no gas-specific index)
//        USDINR                → 4.85 (fixed 4.85% implied vol for USD/INR FX pair)
//      Range formula: range = prevClose × (VIX% / √246) — same as calculateVixRange("DAILY")
//
//   4. DATE CONSTANTS: Uses MCX_CURRENT_DAY / MCX_PREVIOUS_DAY (may differ from
//      NSE CURRENT_DAY/PREVIOUS_DAY if MCX settlement calendar differs).
//
//   5. NO PREMIUM: CRUDEOILM/CRUDEOIL have no spot traded on MCX — premium stays blank.
//      Only NSE futures (NIFTY, BANKNIFTY, stocks) have spot → futures premium.
// ─────────────────────────────────────────────────────────────────────────────

// Renders the MCX candlestick chart for a commodity futures instrument.
// Fetches intraday 5-min candles (MCX_CURRENT_DAY) + prev day close for strike levels.
// Draws ASO/AST/BSO/BST + VIXL/VIXU reference lines using _renderLWChart.
// Updates LTP display and ATR/stop-loss badges via _buildATRBadges.
async function showTopChartMCX(name, chartHeight, bindtoDivId) {
    try {

        let futures;
        jQ.each(COMMODITIES_FUTURE_INSTRUMENT_LIST, function (index, item) {
            let instName = name
            if (item.name == instName) {
                futures = item;
            }
        })

        let tempName = name.replaceAll(" ", "-")
        tempName = tempName.replaceAll("&", "-")

        let data = await getHistoricalDataUsingPromise(futures['instrument_token'], _gtbMcxCurrDay(), _gtbMcxCurrDayTo(), HISTORICAL_DATA_INTERVAL);
        let prevData = await getHistoricalDataUsingPromise(futures['instrument_token'], _gtbMcxPrevDay(), _gtbMcxPrevDay(), 'day');
        data.data.candles = _gtbTrimCandles(data.data.candles, MCX_CURRENT_DAY);
        if (!data.data.candles || !data.data.candles.length) {
            console.warn('showTopChartMCX: no candles for', name, '— check MCX_CURRENT_DAY config');
            var _el = document.getElementById(tempName + '-chart');
            if (_el) _el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:0.55rem;color:#f85149;">No data — check MCX date config</div>';
            return;
        }

        let strikeDiff = MCX_FUTURE_STRIKE_DIFF[name];
        if (!strikeDiff) {
            strikeDiff = "100,100"
        }
        strikeDiff = strikeDiff.split(",");
        let strikeOne = parseFloat(strikeDiff[0])
        let strikeTwo = parseFloat(strikeDiff[1])

        let open = data.data.candles[0][1]
        let prevClose = prevData.data.candles[0][4]

        let ustrikeOne = (parseFloat(open) + strikeOne);
        let ustrikeTwo = (ustrikeOne + strikeTwo);
        let bstrikeOne = (parseFloat(open) - strikeOne);
        let bstrikeTwo = (bstrikeOne - strikeTwo);

        let strikeMap = {}
        strikeMap['strikeDiff'] = parseFloat(strikeDiff).toFixed(2);
        strikeMap['bstrikeOne'] = parseFloat(bstrikeOne).toFixed(2);
        strikeMap['bstrikeTwo'] = parseFloat(bstrikeTwo).toFixed(2);
        strikeMap['ustrikeOne'] = parseFloat(ustrikeOne).toFixed(2);
        strikeMap['ustrikeTwo'] = parseFloat(ustrikeTwo).toFixed(2);

        let ovxChg = 0.0

        let vix = 0.00

        if (name == "CRUDEOIL" || name == "CRUDEOILM") {
            vix = OVX
        }

        if (name == "GOLDM" || name == "GOLD") {
            vix = GVZ
        }

        if (name == "SILVER" || name == "SILVERM") {
            vix = VXSLV
        }

        if (name == "NATURALGAS" || name == "NATGASMINI") {
            vix = VIX
        }

        if (name == "USDINR") {
            vix = "4.85"
        }

        ovxChg = parseFloat(vix) / Math.sqrt(365 - 104 - 15)

        var range = parseFloat(prevClose) * ovxChg / 100
        var lNift = parseFloat(prevClose) - range
        var uNift = parseFloat(prevClose) + range

        strikeMap['vixDDUpper'] = uNift.toFixed(2);
        strikeMap['vixDDLower'] = lNift.toFixed(2)

        let max = strikeMap.vixDDUpper
        let min = strikeMap.vixDDLower

        if (max < strikeMap.ustrikeTwo) {
            max = strikeMap.ustrikeTwo
        }

        if (min > strikeMap.bstrikeTwo) {
            min = strikeMap.bstrikeTwo
        }

        let columns = []
        let x = ['x']
        let column = ["Close"]

        jQ.each(data.data.candles, function (index, item) {
            x.push(moment(item[0]).format("YYYY-MM-DD HH:mm:ss"))
            column.push(parseFloat(item[4]))

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
        lines.push({ position: 'start', value: parseFloat(strikeMap.vixDDLower), text: 'VIXL: ' + strikeMap.vixDDLower, class: 'vixl-line-class' });
        lines.push({ position: 'start', value: parseFloat(strikeMap.vixDDUpper), text: 'VIXU: ' + strikeMap.vixDDUpper, class: 'vixu-line-class' });
        lines.push({ position: 'start', value: parseFloat(strikeMap.ustrikeTwo), text: 'AST: ' + strikeMap.ustrikeTwo, class: 'ustrike-two-line-class' });
        lines.push({ position: 'start', value: parseFloat(strikeMap.ustrikeOne), text: 'ASO: ' + strikeMap.ustrikeOne, class: 'ustrike-one-line-class' });
        lines.push({ position: 'start', value: parseFloat(strikeMap.bstrikeOne), text: 'BSO: ' + strikeMap.bstrikeOne, class: 'bstrike-one-line-class' });
        lines.push({ position: 'start', value: parseFloat(strikeMap.bstrikeTwo), text: 'BST: ' + strikeMap.bstrikeTwo, class: 'bstrike-two-line-class' });


        // Build reference lines for candlestick chart
        let refLines = [
            { key: 'OPEN', value: parseFloat(open),               text: 'OPEN ' + parseFloat(open).toFixed(2) },
            { key: 'VIXL', value: parseFloat(strikeMap.vixDDLower), text: 'VIXL ' + strikeMap.vixDDLower },
            { key: 'VIXU', value: parseFloat(strikeMap.vixDDUpper), text: 'VIXU ' + strikeMap.vixDDUpper },
            { key: 'AST',  value: parseFloat(strikeMap.ustrikeTwo), text: 'AST '  + strikeMap.ustrikeTwo },
            { key: 'ASO',  value: parseFloat(strikeMap.ustrikeOne), text: 'ASO '  + strikeMap.ustrikeOne },
            { key: 'BSO',  value: parseFloat(strikeMap.bstrikeOne), text: 'BSO '  + strikeMap.bstrikeOne },
            { key: 'BST',  value: parseFloat(strikeMap.bstrikeTwo), text: 'BST '  + strikeMap.bstrikeTwo },
        ];

        // Cache strike+vix map so chart grid and other callers can use it without re-fetching
        if (typeof INSTRUMENT_SCORE_MAP !== 'undefined') {
            if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
            INSTRUMENT_SCORE_MAP[name].strikeMap = strikeMap;
            INSTRUMENT_SCORE_MAP[name].open      = open;
        }

        // Use LightweightCharts candlestick (defined in grootTradeBot.js)
        if (typeof _renderLWChart === 'function') {
            var _noYAxis = (name === 'CRUDEOILM' || name === 'USDINR');
            _renderLWChart((bindtoDivId ? bindtoDivId.replace('#', '') : (tempName + '-chart')), data.data.candles, refLines, chartHeight || 150, { hideLegend: true, hideYAxis: _noYAxis });
        }

        // Derive suffix: if bindtoDivId is e.g. '#CRUDEOILM-chart-dv-CRUDEOILM',
        // the suffix is everything after '{tempName}-chart' → '-dv-CRUDEOILM'
        var _mcxSfx = '';
        if (bindtoDivId) {
            var _bid = bindtoDivId.replace('#', '');
            var _sfxIdx = _bid.indexOf(tempName + '-chart');
            if (_sfxIdx !== -1) _mcxSfx = _bid.slice(_sfxIdx + (tempName + '-chart').length);
        }

        let ltp = data.data.candles[data.data.candles.length - 1][4];
        // Update LTP in both overview card and any detail view using the suffix
        jQ('#' + tempName + '-ltp').html(parseFloat(ltp).toLocaleString('en-IN'));
        if (_mcxSfx) jQ('#' + tempName + '-ltp' + _mcxSfx).html(parseFloat(ltp).toLocaleString('en-IN'));
        if (typeof _buildATRBadges === 'function') {
            _buildATRBadges(ltp, name, data.data.candles);
        }

        // 9:15 breakout — classify first candle close vs strike levels
        try {
            var _c915 = parseFloat(data.data.candles[0][4]);
            var _aso = parseFloat(strikeMap.ustrikeOne);
            var _ast = parseFloat(strikeMap.ustrikeTwo);
            var _bso = parseFloat(strikeMap.bstrikeOne);
            var _bst = parseFloat(strikeMap.bstrikeTwo);
            var _zone915;
            if      (_c915 >= _ast) _zone915 = 'AST';
            else if (_c915 >= _aso) _zone915 = 'ASO';
            else if (_c915 <= _bst) _zone915 = 'BST';
            else if (_c915 <= _bso) _zone915 = 'BSO';
            else                    _zone915 = 'BTW';
            var _isBull915 = (_zone915 === 'ASO' || _zone915 === 'AST');
            var _isBear915 = (_zone915 === 'BSO' || _zone915 === 'BST');
            var _cls915 = _isBull915 ? 'gtb-915-bull' : _isBear915 ? 'gtb-915-bear' : 'gtb-915-neutral';
            var _badgeHtml = '<span class="' + _cls915 + '">' + _zone915 + '</span>';
            var _detailHtml = '<span class="' + _cls915 + '" style="font-weight:700;">' + _zone915 + '</span>'
                + ' <span style="color:var(--gtb-muted);">close: ' + _c915.toFixed(2)
                + ' | ASO ' + _aso.toFixed(2) + ' / BSO ' + _bso.toFixed(2) + '</span>';
            // Write to all known targets (overview + any detail suffix)
            jQ('#' + tempName + '-915-badge').html(_badgeHtml);
            jQ('#' + tempName + '-915-detail').html(_detailHtml);
            if (_mcxSfx) {
                jQ('#' + tempName + '-915-badge'  + _mcxSfx).html(_badgeHtml);
                jQ('#' + tempName + '-915-detail' + _mcxSfx).html(_detailHtml);
            }
            // Save to localStorage for cross-module use
            try {
                var _vb = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}');
                _vb[name] = { CLOSE_9_15: _zone915, close: _c915, open: parseFloat(open) };
                localStorage.setItem('VALID_BREAKOUT_NINE_FIFTEEN', JSON.stringify(_vb));
            } catch(e2) {}
        } catch(e) {}

        // Levels strip
        var _ltpN = parseFloat(ltp);
        var _sm   = strikeMap;
        function _lbl(key, val, isBull) {
            var v = parseFloat(val);
            var hit = isBull ? (_ltpN >= v) : (_ltpN <= v);
            var col = hit ? (isBull ? 'var(--gtb-green,#3fb950)' : 'var(--gtb-red,#f85149)') : 'var(--gtb-muted,#7d8590)';
            return '<span style="font-size:0.5rem;white-space:nowrap;color:' + col + '"><b>' + key + '</b> ' + v.toFixed(2) + '</span>';
        }
        var _levelsHtml = ''
            + _lbl('O',   open,            true)
            + _lbl('V↑',  _sm.vixDDUpper,  true)
            + _lbl('V↓',  _sm.vixDDLower,  false)
            + _lbl('A+',  _sm.ustrikeTwo,  true)
            + _lbl('A',   _sm.ustrikeOne,  true)
            + _lbl('B',   _sm.bstrikeOne,  false)
            + _lbl('B-',  _sm.bstrikeTwo,  false);
        // Write levels to every known target
        var _ids = [
            tempName + '-chart-levels',
            'max-' + tempName + '-chart-levels',
        ];
        if (_mcxSfx) _ids.push(tempName + '-chart-levels' + _mcxSfx);
        _ids.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.innerHTML = _levelsHtml;
        });
    } catch (error) {
        console.error('Error in showTopChartMCX for ' + name, error);
    }
}

async function showFutureDetailsMCX(name) {
    let tempName = name.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")
    let futures;
    jQ.each(COMMODITIES_FUTURE_INSTRUMENT_LIST, function (index, item) {
        let instName = name
        if (item.name == instName) {
            futures = item;
        }
    })
    let [pres, cres, ires] = await Promise.all([
        getHistoricalDataUsingPromise(futures['instrument_token'], _gtbMcxPrevDay(), _gtbMcxPrevDay(), 'day'),
        getHistoricalDataUsingPromise(futures['instrument_token'], _gtbMcxCurrDay(), _gtbMcxCurrDayTo(), 'day'),
        getHistoricalDataUsingPromise(futures['instrument_token'], _gtbMcxCurrDay(), _gtbMcxCurrDayTo(), '5minute').catch(function() { return null; }),
    ]);


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

    // Build 5-min intraday candle array for AVWAP + futures signal (same format as NSE)
    var intradayCandles5MCX = [];
    if (ires && ires.data && ires.data.candles && ires.data.candles.length) {
        ires.data.candles.forEach(function(c) {
            intradayCandles5MCX.push({ date: moment(c[0]).format('HH:mm'), open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5], oi: c[6] });
        });
    }

    // MCX: pass instrument name for trend-persistence; vix (OVX/GVZ) optional — left
    // unscaled here so commodity thresholds stay at their legacy baseline.
    let resp = showTableAiNiftyPrediction(data[data.length - 1], prevData, futures['lot_size'], intradayCandles5MCX.length > 1 ? intradayCandles5MCX : null, { name: name })
    resp['ltp'] = data[data.length - 1]['close']
    resp['open'] = data[0]['close']
    resp['vwap'] = getVwapTrend(data[data.length - 1], prevData);
    // Intraday AVWAP anchored to session open (5-min candles); fallback to daily weighted avg.
    (function () {
        var q = data[data.length - 1], p = prevData;
        var cTp = (parseFloat(q.high) + parseFloat(q.low) + parseFloat(q.close)) / 3;
        var pTp = (parseFloat(p.high) + parseFloat(p.low) + parseFloat(p.close)) / 3;
        var totVol = parseInt(q.volume) + parseInt(p.volume);
        var _dailyVwapNum = totVol > 0 ? parseFloat(((cTp * parseFloat(q.volume) + pTp * parseFloat(p.volume)) / totVol).toFixed(2)) : 0;
        resp['vwapBullishDaily'] = _dailyVwapNum > 0 && parseFloat(q.close) >= _dailyVwapNum;
        resp['vwapPrice'] = intradayCandles5MCX.length > 0
            ? computeIntradayVwap(intradayCandles5MCX)
            : _dailyVwapNum;
    })();
    resp['trend'] = getFutureDirection(data[data.length - 1], prevData, name);
    return resp;
}

async function showTrendingOIMCX(instrument, strikToShowOverride) {
    OI_DIVISOR = 1000;
    let name = stock[0]['TRADINGSYMBOL']
    let ltp = stock[0]['LTP']
    let open = stock[0]['OPEN']

    let strikToShow = (strikToShowOverride !== undefined) ? strikToShowOverride : 4
    let strikeData = []
    let selectedStrike = []
    let currentPrice = open
    if (USE_LTP_FOR_STRIKE) {
        currentPrice = ltp
    }

    if (instrument == "NIFTY 50") {
        instrument = "NIFTY"
        strikToShow = 4
    } else if (instrument == "NIFTY BANK") {
        instrument = "BANKNIFTY"
        strikToShow = 4
    } else if (instrument == "NIFTY FIN SERVICE") {
        instrument = "FINNIFTY"
        strikToShow = 4
    } else if (instrument == "NIFTY MID SELECT") {
        instrument = "MIDCPNIFTY"
        strikToShow = 4
    }

    let atmStrike = 0;
    jQ.each(MCX_OPTION_LIST, function (index, item) {
        let date = moment(item.expiry, 'DD-MM-YYYY').format("YYYY-MM-DD")
        if (item.name == instrument) {
            if (instrument == "NIFTY") {
                if (date == NIFTY_EXPIRY_DATE) {
                    selectedStrike.push(item)
                }
            } else if (instrument == "SENSEX") {
                if (date == SENSEX_EXPIRY_DATE) {
                    selectedStrike.push(item)
                }
            } else {
                selectedStrike.push(item)
            }
        }
    });


    selectedStrike.sort(function (a, b) { return parseFloat(a.strike) - parseFloat(b.strike) })
    let upperStrikes = []
    let lowerStrikes = []
    jQ.each(selectedStrike, function (index, item) {
        let strike = parseFloat(item.strike)

        if (strike >= currentPrice && !atmStrike) {
            atmStrike = strike
        }

        if (strike >= currentPrice) {
            if (jQ.inArray(strike, upperStrikes) === -1) {
                upperStrikes.push(strike)
            }
        } else {
            if (jQ.inArray(strike, lowerStrikes) === -1) {
                lowerStrikes.push(strike)
            }
        }
    });

    for (let i = 1; i <= strikToShow; i++) {
        if (upperStrikes[i]) {
            let obj = {}
            obj['OI_CE'] = ''
            obj['CHG_OI_CE'] = ''
            obj['STRIKE'] = upperStrikes[i]
            obj['OI_PE'] = ''
            obj['CHG_OI_PE'] = ''
            obj['ATM_STRIKE'] = ''
            obj['CE'] = ''
            obj['PE'] = ''
            obj['CE_TOKEN'] = ''
            obj['PE_TOKEN'] = ''
            obj['CE_OBV'] = ''
            obj['PE_OBV'] = ''
            strikeData.push(obj)
        }
    }

    let obj = {}
    obj['OI_CE'] = ''
    obj['CHG_OI_CE'] = ''
    obj['STRIKE'] = atmStrike
    obj['OI_PE'] = ''
    obj['CHG_OI_PE'] = ''
    obj['ATM_STRIKE'] = true
    obj['CE'] = ''
    obj['PE'] = ''
    obj['CE_TOKEN'] = ''
    obj['PE_TOKEN'] = ''
    obj['CE_OBV'] = ''
    obj['PE_OBV'] = ''
    strikeData.push(obj)

    for (let i = 1; i <= strikToShow; i++) {
        if (lowerStrikes[lowerStrikes.length - i]) {
            let obj = {}
            obj['OI_CE'] = ''
            obj['CHG_OI_CE'] = ''
            obj['STRIKE'] = lowerStrikes[lowerStrikes.length - i]
            obj['OI_PE'] = ''
            obj['CHG_OI_PE'] = ''
            obj['ATM_STRIKE'] = ''
            obj['CE'] = ''
            obj['PE'] = ''
            obj['CE_TOKEN'] = ''
            obj['PE_TOKEN'] = ''
            obj['CE_OBV'] = ''
            obj['PE_OBV'] = ''
            strikeData.push(obj)
        }
    }
    strikeData.sort(function (a, b) { return parseFloat(a.STRIKE) - parseFloat(b.STRIKE) })

    // Fetch futures candles as underlying for IV calculation (MCX has no cash spot)
    let spotCandles = [];
    try {
        let futEntry = COMMODITIES_FUTURE_INSTRUMENT_LIST.find(function(f) { return f.name === instrument; });
        if (futEntry) {
            let interval = jQ("#api-data-interval option:selected").val() || '5minute';
            let spotData = await getHistoricalDataUsingPromise(futEntry.instrument_token, _gtbMcxPrevDay(), _gtbMcxCurrDayTo(), interval);
            spotCandles = (spotData && spotData['data'] && spotData['data']['candles']) ? spotData['data']['candles'] : [];
        }
    } catch(e) { console.log('MCX IV: could not fetch spot candles', e); }

    let expiryDateStr = selectedStrike.length ? selectedStrike[0].expiry : null;

    let tableData = await showMCXOITrendingDetails(strikeData, selectedStrike, spotCandles, expiryDateStr)
    return tableData
}



async function showMCXOITrendingDetails(strikeData, selectedStrike, spotCandles, expiryDateStr) {
    spotCandles = spotCandles || [];
    expiryDateStr = expiryDateStr || null;
    let strikeMap = {}
    for (let i = 0; i < strikeData.length; i++) {
        try {
            let CE = ''
            let PE = ''
            if (strikeData[i]['STRIKE'] != 0) {
                for (let j = 0; j < selectedStrike.length; j++) {
                    if (parseFloat(strikeData[i]['STRIKE']) == parseFloat(selectedStrike[j].strike)
                        && selectedStrike[j].instrument_type == 'CE') {
                        CE = selectedStrike[j]
                    }

                    if (parseFloat(strikeData[i]['STRIKE']) == parseFloat(selectedStrike[j].strike)
                        && selectedStrike[j].instrument_type == 'PE') {
                        PE = selectedStrike[j]
                    }
                }

                let HISTORICAL_DATA_INTERVAL_OVERRIDE = jQ("#api-data-interval option:selected").val()
                if (!HISTORICAL_DATA_INTERVAL_OVERRIDE) {
                    HISTORICAL_DATA_INTERVAL_OVERRIDE = '5minute'
                }

                let prevDataCE = await getHistoricalDataUsingPromise(CE.instrument_token, _gtbMcxPrevDay(), _gtbMcxPrevDay(), 'day');
                let currDataCE = await getHistoricalDataUsingPromise(CE.instrument_token, _gtbMcxPrevDay(), _gtbMcxCurrDayTo(), HISTORICAL_DATA_INTERVAL_OVERRIDE);
                currDataCE.data.candles = _gtbTrimCandles(currDataCE.data.candles, MCX_CURRENT_DAY);

                let prevDataPE = await getHistoricalDataUsingPromise(PE.instrument_token, _gtbMcxPrevDay(), _gtbMcxPrevDay(), 'day');
                let currDataPE = await getHistoricalDataUsingPromise(PE.instrument_token, _gtbMcxPrevDay(), _gtbMcxCurrDayTo(), HISTORICAL_DATA_INTERVAL_OVERRIDE);
                currDataPE.data.candles = _gtbTrimCandles(currDataPE.data.candles, MCX_CURRENT_DAY);



                strikeMap[strikeData[i]['STRIKE']] = {}
                strikeMap[strikeData[i]['STRIKE']]['prevDataCE'] = prevDataCE
                strikeMap[strikeData[i]['STRIKE']]['currDataCE'] = currDataCE
                strikeMap[strikeData[i]['STRIKE']]['prevDataPE'] = prevDataPE
                strikeMap[strikeData[i]['STRIKE']]['currDataPE'] = currDataPE
                strikeMap[strikeData[i]['STRIKE']]['INDEX'] = i
                strikeMap[strikeData[i]['STRIKE']]['ATM_STRIKE'] = strikeData[i]['ATM_STRIKE']

                strikeMap[strikeData[i]['STRIKE']]['CE'] = CE
                strikeMap[strikeData[i]['STRIKE']]['PE'] = PE
            }
        } catch (err) {
            console.log("Error while fetching strike : " + strikeData[i]['STRIKE'])
        }
    }

    let tableData = []

    let totalCEOI = 0;
    let totalPEOI = 0;

    let chCEOI = 0;
    let chPEOI = 0;

    jQ.each(strikeMap, function (index, item) {
        try {
            let currDataCE = item['currDataCE']['data']['candles']
            let currDataPE = item['currDataPE']['data']['candles']

            let prevDataCE = item['prevDataCE']['data']['candles']
            let prevDataPE = item['prevDataPE']['data']['candles']

            if (currDataCE.length == 0) {
                currDataCE = prevDataCE
            }

            if (currDataPE.length == 0) {
                currDataPE = prevDataPE
            }

            let OI_CE = currDataCE[currDataCE.length - 1][6]
            let OI_PE = currDataPE[currDataPE.length - 1][6]

            totalCEOI = totalCEOI + OI_CE
            totalPEOI = totalPEOI + OI_PE

            let PREV_OI_CE = prevDataCE[prevDataCE.length - 1][6]
            let PREV_OI_PE = prevDataPE[prevDataPE.length - 1][6]

            let obj = {}
            obj['OI_CE'] = parseFloat(OI_CE / OI_DIVISOR).toFixed(1)
            obj['CHG_OI_CE'] = parseFloat((OI_CE - PREV_OI_CE) / OI_DIVISOR).toFixed(1)
            obj['STRIKE'] = index
            obj['OI_PE'] = parseFloat(OI_PE / OI_DIVISOR).toFixed(1)
            obj['CHG_OI_PE'] = parseFloat((OI_PE - PREV_OI_PE) / OI_DIVISOR).toFixed(1)
            obj['ATM_STRIKE'] = item.ATM_STRIKE
            obj['CE'] = item.CE
            obj['PE'] = item.PE

            chCEOI = chCEOI + (OI_CE - PREV_OI_CE)
            chPEOI = chPEOI + (OI_PE - PREV_OI_PE)

            obj['currDataCE'] = currDataCE
            obj['currDataPE'] = currDataPE

            obj['prevDataCE'] = prevDataCE
            obj['prevDataPE'] = prevDataPE
            obj['CE_OBV'] = calculateOBVFiveMinutesInterval(prevDataCE, currDataCE)
            obj['PE_OBV'] = calculateOBVFiveMinutesInterval(prevDataPE, currDataPE)

            // IV series using futures price as underlying (MCX has no cash spot)
            if (expiryDateStr && spotCandles.length) {
                obj['CE_IV'] = calculateIVSeries(currDataCE, index, true,  expiryDateStr, spotCandles)
                obj['PE_IV'] = calculateIVSeries(currDataPE, index, false, expiryDateStr, spotCandles)
            } else {
                obj['CE_IV'] = []
                obj['PE_IV'] = []
            }

            tableData.push(obj)
        } catch (err) {
            console.log("Error while fetching strike : " + index)
        }

    });

    let pcr = parseFloat(totalPEOI / totalCEOI).toFixed(2);
    let chPcr = parseFloat(chPEOI / chCEOI).toFixed(2);


    tableData.sort(function (a, b) { return parseFloat(a.STRIKE) - parseFloat(b.STRIKE) })
    let map = {}
    map['tableData'] = tableData
    map['pcr'] = pcr
    map['chPcr'] = chPcr
    return map
}


async function showPrictionProbabiltyMCX(name, intr) {
    stock = []
    let scripts = []
    let obj = {}
    obj['TRADINGSYMBOL'] = name;
    obj['LTP'] = intr['ltp']
    scripts.push(obj)

    for (let i = 0; i < scripts.length; i++) {
        let obj = {}
        obj['TRADINGSYMBOL'] = scripts[i]['TRADINGSYMBOL']
        obj['LTP'] = intr['ltp']
        obj['OPEN'] = intr['open']
        obj['DATA'] = ''
        stock.push(obj)
    }

    if (stock.length > 0) {
        await callPredictionAnalyseTrendMCX();
    }
}

async function callPredictionAnalyseTrendMCX() {
    let scriptsCount = stock.length
    for (let i = 0; i < scriptsCount; i++) {
        try {
            let name = stock[i]['TRADINGSYMBOL']
            let ltp = stock[i]['LTP']
            if (name != 'GIFT NIFTY') {
                let oiData = await showTrendingOIMCX(name)
                stock[i]['DATA'] = oiData
            }
        } catch (err) {
            console.log("Error while analyzing stock : " + stock[i]['TRADINGSYMBOL'])
            console.log(err)
        }
    }
}

