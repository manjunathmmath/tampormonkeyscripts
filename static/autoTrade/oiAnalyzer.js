let stock = []
let OI_DIVISOR = 100000

// ─── Black-Scholes IV Calculator ─────────────────────────────────────────────
//
// WHY IV MATTERS FOR OI ANALYSIS:
//   Option price = intrinsic value + time value (IV-driven).
//   When IV rises  → option buyers are paying MORE premium  = buying activity (demand)
//   When IV falls  → option writers are selling MORE supply = writing activity (supply)
//
//   This directly separates two scenarios that OI alone cannot distinguish:
//     Case A: CE OI↑ + CE IV↓  → CE WRITE — call writers adding resistance (bearish)
//     Case B: CE OI↑ + CE IV↑  → CE BUY   — call buyers adding positions (bullish)
//     Case C: PE OI↑ + PE IV↓  → PE WRITE — put writers building support floor (bullish)
//     Case D: PE OI↑ + PE IV↑  → PE BUY   — put buyers hedging against fall (bearish)
//
//   Strong RESISTANCE = Case A (CE WRITE) + Case D (PE BUY) at same strike
//   Strong SUPPORT    = Case B (CE BUY)   + Case C (PE WRITE) at same strike
//
// HOW IV IS CALCULATED (Black-Scholes inversion):
//   Black-Scholes formula: C = S·N(d1) − K·e^(−rT)·N(d2)
//   where d1 = [ln(S/K) + (r + σ²/2)T] / (σ√T),  d2 = d1 − σ√T
//   S=spot, K=strike, T=time to expiry (years), r=risk-free rate, σ=IV (what we solve for)
//
//   We observe C (option LTP from candle close) and solve for σ using bisection.
//   Inputs per candle: option LTP (c[4]), underlying spot (from INSTRUMENT_TOKENS candles),
//   strike (from OPTION_STRIKE_LIST), expiry date, risk-free rate (6.5% India).
//
// NOTE ON OBV VS IV:
//   OBV uses option price tick direction as volume weight — but option price naturally
//   moves with the underlying (delta effect) even without any writing/buying intent.
//   IV strips out the delta effect and isolates the volatility premium component,
//   making it a cleaner signal for intent. IV is therefore used as primary signal;
//   OBV is the fallback when IV cannot be computed (missing spot data etc).
// ─────────────────────────────────────────────────────────────────────────────

// Standard normal CDF approximation (Abramowitz & Stegun polynomial, error < 1.5×10^-7)
// Used internally by Black-Scholes to compute N(d1) and N(d2) probabilities
function _normCDF(x) {
    const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
    let sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    let t = 1.0 / (1.0 + p * x);
    let y = 1.0 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
    return 0.5 * (1.0 + sign * y);
}

// Black-Scholes theoretical option price
// S=spot price, K=strike, T=time to expiry (years), r=risk-free rate (decimal), sigma=IV (decimal)
// isCall=true for CE, false for PE
// Returns theoretical price — compared against market LTP to infer IV
function _bsPrice(S, K, T, r, sigma, isCall) {
    if (T <= 0 || sigma <= 0) return 0;
    let d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    let d2 = d1 - sigma * Math.sqrt(T);
    if (isCall) return S * _normCDF(d1) - K * Math.exp(-r * T) * _normCDF(d2);   // CE price
    return K * Math.exp(-r * T) * _normCDF(-d2) - S * _normCDF(-d1);              // PE price
}

// Bisection IV solver — finds σ such that _bsPrice(S,K,T,r,σ,isCall) = market price
// Search range: 0.1% to 500% IV. 100 iterations → accuracy ±0.0001 (0.01% IV).
// Returns IV as decimal (0.25 = 25% IV) or null if inputs invalid / price below intrinsic.
// Interpretation: high IV = market participants paying premium = active buying or fear
//                 low IV  = market selling premium = writing activity = calm/directional conviction
function calcIV(price, S, K, T, r, isCall) {
    if (!price || price <= 0 || !S || S <= 0 || T <= 0) return null;
    let intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
    if (price < intrinsic) return null; // market price below intrinsic = bad data, skip
    let lo = 0.001, hi = 5.0;           // IV search range: 0.1% to 500%
    for (let i = 0; i < 100; i++) {
        let mid = (lo + hi) / 2;
        let diff = _bsPrice(S, K, T, r, mid, isCall) - price;
        if (Math.abs(diff) < 0.001) return mid; // converged
        if (diff > 0) hi = mid; else lo = mid;  // narrow search range
    }
    return (lo + hi) / 2;
}

// Calculates IV for every 5-min candle in the option's history (parallel series to OBV)
// Each entry = { date, iv } where iv is in % (e.g. 25.4 means 25.4% annualised IV)
// null iv entries occur when spot data is missing for that candle timestamp
//
// Usage in scoring:
//   Compare ivList[last].iv vs ivList[prev].iv (skip nulls):
//   If CE IV ↑ >0.3% → call buyers active → CE BUY  (bullish)
//   If CE IV ↓ >0.3% → call writers active → CE WRITE (resistance = bearish)
//   If PE IV ↑ >0.3% → put buyers active → PE BUY   (bearish)
//   If PE IV ↓ >0.3% → put writers active → PE WRITE (support floor = bullish)
function calculateIVSeries(optionCandles, strike, isCall, expiryDateStr, spotCandles) {
    const RISK_FREE = 0.065; // 6.5% India 91-day T-bill rate (risk-free proxy)
    let expiryMs = moment(expiryDateStr, 'DD-MM-YYYY').endOf('day').valueOf(); // expiry at end of trading day
    let ivList = [];
    let spotMap = {};
    // Build a timestamp→spot map for O(1) lookup per candle
    if (spotCandles && spotCandles.length) {
        spotCandles.forEach(function(c) { spotMap[c[0]] = c[4]; }); // c[4] = close price
    }
    let lastValidSpot = 0; // carry forward last known spot if current candle timestamp doesn't match
    for (let i = 0; i < optionCandles.length; i++) {
        let c = optionCandles[i];
        let candleTime = new Date(c[0]).getTime();
        // T = time remaining to expiry in years; minimum 1 hour to avoid near-zero division
        let T = Math.max((expiryMs - candleTime) / (365 * 24 * 3600 * 1000), 1 / (365 * 24));
        let optionLTP = c[4]; // candle close = last traded price of the option at this interval
        let spot = spotMap[c[0]] || lastValidSpot; // underlying price at same timestamp
        if (spot > 0) lastValidSpot = spot;
        let iv = (spot > 0) ? calcIV(optionLTP, spot, parseFloat(strike), T, RISK_FREE, isCall) : null;
        ivList.push({ date: c[0], iv: iv !== null ? parseFloat((iv * 100).toFixed(2)) : null }); // stored as %
    }
    return ivList;
}
// ─────────────────────────────────────────────────────────────────────────────

// ── OI Probability Popup ──────────────────────────────────────────────────────
//
// Entry point for the single-instrument OI/OBV analysis popup.
// Builds the `stock` array (one entry), then triggers callPredictionAnalyseTrend()
// which fetches option chain data and renders the strike table.
//
// Data assembled here:
//   LTP          — live price from INSTRUMENT_LTP_PRICE localStorage
//   CLOSE        — previous day close (for OI Δ baseline)
//   PRICE/OPEN   — today's open (for ASO/AST/BSO/BST levels)
//   STRIKEDATA   — { ustrikeOne, ustrikeTwo, bstrikeOne, bstrikeTwo }
//   TREND        — active trend labels ["ASO", "VIXU", …]
async function showPrictionProbabilty(name) {
    let scriptData = generateTrend(name)
    // Build entry locally — never touch the global `stock` array here.
    // This allows parallel calls across instruments without race conditions.
    let entry = {}
    entry['TRADINGSYMBOL'] = name;
    entry['LTP']           = scriptData['ltp'];
    entry['OPEN']          = scriptData['openPrice'] || scriptData['prevPrice'];
    entry['CLOSE']         = scriptData['prevPrice'];
    entry['PRICE']         = scriptData['price'];
    entry['PERC']          = scriptData['perc'];
    entry['TREND']         = scriptData['trends'];
    entry['STRIKEDATA']    = scriptData['strikeData'];
    entry['DATA']          = '';

    if (name !== 'GIFT NIFTY') {
        try {
            entry['DATA'] = await showTrendingOI(name);
        } catch(err) {
            console.log('Error fetching OI for ' + name, err);
        }
    }

    // Write result into per-instrument slot in INSTRUMENT_SCORE_MAP, then
    // expose as stock[0] so showOIOBVBarChart (which reads stock[0]) still works.
    if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
    INSTRUMENT_SCORE_MAP[name].stockEntry = entry;
    stock = [entry];   // safe: showOIOBVBarChart is called immediately after, synchronously
}

// Legacy wrapper — kept for any external callers that still use it.
// With the refactored showPrictionProbabilty above, this is no longer called
// during the main refresh, but is preserved to avoid breaking other paths.
async function callPredictionAnalyseTrend() {
    for (let i = 0; i < stock.length; i++) {
        try {
            let name = stock[i]['TRADINGSYMBOL']
            if (name != 'GIFT NIFTY') {
                let oiData = await showTrendingOI(name)
                stock[i]['DATA'] = oiData
            }
        } catch (err) {
            console.log("Error while analyzing stock : " + stock[i]['TRADINGSYMBOL'])
            console.log(err)
        }
    }
}


// ── OBV Calculation (5-Minute Intervals) ─────────────────────────────────────
//
// On-Balance Volume (OBV) is a cumulative volume indicator:
//   - Each 5-min candle: if close > prev close → add volume to OBV
//                        if close < prev close → subtract volume from OBV
//                        if close == prev close → OBV unchanged
//
// The starting reference (prevLastCandle) is the LAST candle of the previous day.
// This means OBV resets at start of each trading day, giving a day-relative reading.
//
// INTERPRETING CUMULATIVE OBV SIGN (used in scoreOIStrikeForSignal):
//   OBV > 0 → net buying pressure over the day (more volume flowed on up-ticks)
//   OBV < 0 → net writing/selling pressure (more volume flowed on down-ticks)
//
// WHY CUMULATIVE SIGN MATTERS:
//   Using the last delta (change between last two candles) was a bug — it only
//   reflects the most recent 5-min tick, not day-long positioning intent.
//   The cumulative sign shows WHERE market participants have been building positions.
//
// Returns: [{ date, obv }, ...] — one entry per 5-min candle, obv in units of OI_DIVISOR
function calculateOBVFiveMinutesInterval(prevData, currData) {
    let OBV = 0;
    let prevLastCandle = prevData[prevData.length - 1]
    OBV = 0
    let obvList = []
    jQ.each(currData, function (index, item) {
        if (item[4] > prevLastCandle[4]) {
            OBV = OBV + item[5]
        }

        if (item[4] < prevLastCandle[4]) {
            OBV = OBV - item[5]
        }
        prevLastCandle = item
        let obj = {};
        obj['date'] = item[0];
        obj['obv'] = parseFloat(OBV / OI_DIVISOR).toFixed(1);
        obvList.push(obj)
    })
    return obvList;
}

// ── Strike OI Trend Loader ────────────────────────────────────────────────────
//
// Builds the list of strikes to analyse for a given instrument:
//   - Finds ATM strike (first strike ≥ current price)
//   - Collects strikToShow strikes above and below ATM
//   - Fetches underlying spot candles ONCE (shared across all strikes for IV calculation)
//   - Calls showOITrendingDetails() to fetch option chain candles and compute OBV + IV
//
// Instrument name mapping (Kite display name → OPTION_STRIKE_LIST name):
//   "NIFTY 50"          → "NIFTY"
//   "NIFTY BANK"        → "BANKNIFTY"
//   "NIFTY FIN SERVICE" → "FINNIFTY"
//   "NIFTY MID SELECT"  → "MIDCPNIFTY"
//
// USE_LTP_FOR_STRIKE (config flag): if true, uses live LTP instead of open price
// to find ATM — useful when price has moved far from open.
//
// Returns: { tableData: [...], pcr, chPcr }
//   tableData entries: { OI_CE, CHG_OI_CE, STRIKE, OI_PE, CHG_OI_PE, ATM_STRIKE,
//                        CE, PE, CE_OBV[], PE_OBV[], CE_IV[], PE_IV[],
//                        currDataCE, currDataPE, prevDataCE, prevDataPE }
//   pcr    = total PE OI / total CE OI (standing PCR — > 1 bullish)
//   chPcr  = change PE OI / change CE OI (change PCR — directional pressure today)
async function showTrendingOI(instrument, strikToShowOverride) {
    OI_DIVISOR = 100000
    let strikToShow = (strikToShowOverride !== undefined) ? strikToShowOverride : 2
    let strikeData = []
    let selectedStrike = []
    let res = generateTrend(instrument)
    let currentPrice = res['open']
    if (USE_LTP_FOR_STRIKE) {
        currentPrice = res['ltp']
    }

    if (instrument == "NIFTY 50") {
        instrument = "NIFTY"
        strikToShow = 3
    } else if (instrument == "NIFTY BANK") {
        instrument = "BANKNIFTY"
        strikToShow = 3
    } else if (instrument == "NIFTY FIN SERVICE") {
        instrument = "FINNIFTY"
        strikToShow = 3
    } else if (instrument == "NIFTY MID SELECT") {
        instrument = "MIDCPNIFTY"
        strikToShow = 3
    } else if (instrument == "SENSEX") {
        strikToShow = 3
    }

    // Every name below is filtered to ONE specific expiry — previously only NIFTY/SENSEX
    // were (nifty_expiry_date/sensex_expiry_date), and everything else (BANKNIFTY,
    // FINNIFTY, MIDCPNIFTY, every F&O stock) pushed items from ALL expiries into the same
    // table unfiltered, which could mix strikes from different expiries under one OI/OBV
    // read. BANKNIFTY now has its own dedicated Settings field (banknifty_expiry_date);
    // every other name shares one Settings field (fo_stocks_expiry_date, same "one shared
    // setting for many instruments" convention as future_expiry_month). Either falls back
    // to that name's own nearest live expiry (_dlNearestLiveExpiry, dataLoad.js) when left
    // blank ("Nearest expiry (auto)") or when the configured date doesn't actually exist
    // for this particular name.
    let atmStrike = 0;
    let allMatches = [];
    jQ.each(OPTION_STRIKE_LIST, function (index, item) {
        if (item.name == instrument) allMatches.push(item);
    });

    var availableExpiries = Array.from(new Set(allMatches.map(function (item) {
        return moment(item.expiry, 'DD-MM-YYYY').format("YYYY-MM-DD");
    }))).sort();
    var targetExpiry = _dlResolveExpiryFor(_dlConfiguredExpiryForName(instrument), availableExpiries);

    jQ.each(allMatches, function (index, item) {
        let date = moment(item.expiry, 'DD-MM-YYYY').format("YYYY-MM-DD")
        if (date == targetExpiry) {
            selectedStrike.push(item)
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

    // Fetch underlying spot candles once — shared across all strikes for IV calculation
    let spotCandles = [];
    try {
        let underlyingName = instrument; // already mapped to NIFTY/BANKNIFTY etc above
        // Map back to display name for INSTRUMENT_TOKENS lookup
        let tokenName = instrument;
        if (instrument === 'NIFTY') tokenName = 'NIFTY 50';
        else if (instrument === 'BANKNIFTY') tokenName = 'NIFTY BANK';
        else if (instrument === 'FINNIFTY') tokenName = 'NIFTY FIN SERVICE';
        else if (instrument === 'MIDCPNIFTY') tokenName = 'NIFTY MID SELECT';
        let underlyingToken = INSTRUMENT_TOKENS[tokenName];
        // Fallback for MCX commodity instruments (CRUDEOIL, CRUDEOILM, GOLD, SILVER, etc.)
        // MCX has no cash spot — use the nearest futures contract as the underlying for IV calculation
        let isMcx = false;
        if (!underlyingToken && typeof COMMODITIES_FUTURE_INSTRUMENT_LIST !== 'undefined') {
            let futEntry = COMMODITIES_FUTURE_INSTRUMENT_LIST.find(function(f) { return f.name === instrument; });
            if (futEntry) {
                underlyingToken = futEntry.instrument_token;
                isMcx = true;
            }
        }
        if (underlyingToken) {
            let HISTORICAL_DATA_INTERVAL_OVERRIDE = jQ("#api-data-interval option:selected").val() || '5minute';
            // MCX instruments use MCX trading dates; NSE instruments use CURRENT_DAY/PREVIOUS_DAY
            let fromDay  = isMcx ? _gtbMcxPrevDay()   : _gtbPrevDay();
            let toDay    = isMcx ? _gtbMcxCurrDayTo() : _gtbCurrDayTo();
            let spotData = await getHistoricalDataUsingPromise(underlyingToken, fromDay, toDay, HISTORICAL_DATA_INTERVAL_OVERRIDE);
            let rawSpot = (spotData && spotData['data'] && spotData['data']['candles']) ? spotData['data']['candles'] : [];
            spotCandles = _gtbTrimCandles(rawSpot, isMcx ? MCX_CURRENT_DAY : undefined);
        }
    } catch(e) { console.log('IV: could not fetch spot candles', e); }

    // Get expiry from first selectedStrike entry
    let expiryDateStr = selectedStrike.length ? selectedStrike[0].expiry : null;

    let tableData = await showOITrendingDetails(strikeData, selectedStrike, spotCandles, expiryDateStr)
    return tableData

}


// ── Option Chain Data Fetcher + OBV/IV Computer ───────────────────────────────
//
// For each strike in strikeData, fetches:
//   - Previous day daily candle for CE and PE (for OI baseline)
//   - Current day 5-min (or configured interval) candles for CE and PE
//
// Computes per strike:
//   OI_CE / OI_PE    — raw OI from last candle [6] ÷ OI_DIVISOR
//   CHG_OI_CE / _PE  — today OI minus yesterday OI (ΔOI = new positions opened)
//   CE_OBV / PE_OBV  — cumulative OBV series (see calculateOBVFiveMinutesInterval)
//   CE_IV / PE_IV    — Black-Scholes IV series (see calculateIVSeries)
//   pcr              — total PE OI / CE OI across all scanned strikes
//   chPcr            — change PE OI / change CE OI (directional pressure today)
//
// spotCandles are passed in from showTrendingOI() — fetched once for the underlying
// and shared here to avoid repeated API calls per strike.
//
// Falls back to previous day data if current day candles are empty (pre-9:15 / holiday).
// Previous-day daily candle is constant through the session → cache by token so
// repeated refreshes don't re-fetch it (removes ~half the OI-scan API calls).
var _gtbOIPrevCache = {};
async function _gtbPrevDayCandle(tok) {
    if (!_gtbOIPrevCache[PREVIOUS_DAY]) _gtbOIPrevCache[PREVIOUS_DAY] = {};
    if (_gtbOIPrevCache[PREVIOUS_DAY][tok]) return _gtbOIPrevCache[PREVIOUS_DAY][tok];
    var d = await getHistoricalDataUsingPromise(tok, PREVIOUS_DAY, PREVIOUS_DAY, 'day');
    _gtbOIPrevCache[PREVIOUS_DAY][tok] = d;
    return d;
}

async function showOITrendingDetails(strikeData, selectedStrike, spotCandles, expiryDateStr) {
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

                // Fetch all 4 series in parallel; prev-day comes from the session cache
                let _oiFetch = await Promise.all([
                    _gtbPrevDayCandle(CE.instrument_token),
                    getHistoricalDataUsingPromise(CE.instrument_token, _gtbPrevDay(), _gtbCurrDayTo(), HISTORICAL_DATA_INTERVAL_OVERRIDE),
                    _gtbPrevDayCandle(PE.instrument_token),
                    getHistoricalDataUsingPromise(PE.instrument_token, _gtbPrevDay(), _gtbCurrDayTo(), HISTORICAL_DATA_INTERVAL_OVERRIDE)
                ]);
                let prevDataCE = _oiFetch[0], currDataCE = _oiFetch[1], prevDataPE = _oiFetch[2], currDataPE = _oiFetch[3];



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
            // Apply snapshot end-time trim: strips prev-day candles and cuts at GTB_HIST_TIME
            let currDataCE = _gtbTrimCandles(item['currDataCE']['data']['candles'])
            let currDataPE = _gtbTrimCandles(item['currDataPE']['data']['candles'])

            let prevDataCE = item['prevDataCE']['data']['candles']
            let prevDataPE = item['prevDataPE']['data']['candles']

            // For OI/OBV/volume calcs: fall back to prev-day when today has no candles.
            // Do NOT overwrite currDataCE/PE — _fetchLTP reads them for LTP and must get
            // null (→ BS estimate) for illiquid strikes, not yesterday's closing price.
            let oiCE = currDataCE.length ? currDataCE : prevDataCE
            let oiPE = currDataPE.length ? currDataPE : prevDataPE

            let OI_CE = oiCE[oiCE.length - 1][6]
            let OI_PE = oiPE[oiPE.length - 1][6]

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

            // Store trimmed current-day candles (may be empty for illiquid strikes)
            obj['currDataCE'] = currDataCE
            obj['currDataPE'] = currDataPE

            obj['prevDataCE'] = prevDataCE
            obj['prevDataPE'] = prevDataPE

            // Drop the still-forming last candle before OBV/IV — it keeps changing
            // tick-by-tick until its interval closes, which was making CE/PE WRITE/BUY
            // labels (and the OI/OBV score) flicker between refreshes seconds apart.
            let _ivInterval = jQ("#api-data-interval option:selected").val() || '5minute';
            let obvIvCE = _gtbDropFormingCandle(oiCE, _ivInterval);
            let obvIvPE = _gtbDropFormingCandle(oiPE, _ivInterval);

            obj['CE_OBV'] = calculateOBVFiveMinutesInterval(prevDataCE, obvIvCE)
            obj['PE_OBV'] = calculateOBVFiveMinutesInterval(prevDataPE, obvIvPE)

            // Today's total option volume (sum of 5-min candle volumes)
            obj['VOL_CE'] = parseFloat(oiCE.reduce(function(s, c) { return s + (c[5] || 0); }, 0) / OI_DIVISOR).toFixed(1)
            obj['VOL_PE'] = parseFloat(oiPE.reduce(function(s, c) { return s + (c[5] || 0); }, 0) / OI_DIVISOR).toFixed(1)
            // Yesterday's total option volume (baseline for conviction ratio)
            obj['PREV_VOL_CE'] = parseFloat(prevDataCE.reduce(function(s, c) { return s + (c[5] || 0); }, 0) / OI_DIVISOR).toFixed(1)
            obj['PREV_VOL_PE'] = parseFloat(prevDataPE.reduce(function(s, c) { return s + (c[5] || 0); }, 0) / OI_DIVISOR).toFixed(1)

            // IV series — one IV per candle using Black-Scholes inversion
            if (expiryDateStr && spotCandles.length) {
                obj['CE_IV'] = calculateIVSeries(obvIvCE, index, true,  expiryDateStr, spotCandles)
                obj['PE_IV'] = calculateIVSeries(obvIvPE, index, false, expiryDateStr, spotCandles)
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

    // ── Derived metrics ────────────────────────────────────────────────────────

    // Total today/yesterday volume across all strikes
    let totalVolCE = 0, totalVolPE = 0, prevVolCE = 0, prevVolPE = 0;
    tableData.forEach(function(r) {
        totalVolCE += parseFloat(r['VOL_CE']) || 0;
        totalVolPE += parseFloat(r['VOL_PE']) || 0;
        prevVolCE  += parseFloat(r['PREV_VOL_CE']) || 0;
        prevVolPE  += parseFloat(r['PREV_VOL_PE']) || 0;
    });

    // IV Skew: PE OTM IV (ATM−2) minus CE OTM IV (ATM+2), in %.
    // Positive skew = put demand > call demand = fear / bearish bias.
    // Negative skew = call demand > put demand = bullish sentiment.
    let ivSkew = null;
    let atmIdx = -1;
    for (let i = 0; i < tableData.length; i++) { if (tableData[i]['ATM_STRIKE']) { atmIdx = i; break; } }
    if (atmIdx < 0) atmIdx = Math.floor(tableData.length / 2);
    let peOTM = tableData[atmIdx - 2], ceOTM = tableData[atmIdx + 2];
    if (peOTM && ceOTM) {
        let peIVLast = peOTM['PE_IV'].length ? peOTM['PE_IV'][peOTM['PE_IV'].length - 1].iv : null;
        let ceIVLast = ceOTM['CE_IV'].length ? ceOTM['CE_IV'][ceOTM['CE_IV'].length - 1].iv : null;
        if (peIVLast !== null && ceIVLast !== null) ivSkew = parseFloat((peIVLast - ceIVLast).toFixed(2));
    }
    // ATM IV (for reference)
    let atmIV = null;
    let atmRow = tableData[atmIdx];
    if (atmRow) {
        let ceAtm = atmRow['CE_IV'].length ? atmRow['CE_IV'][atmRow['CE_IV'].length - 1].iv : null;
        let peAtm = atmRow['PE_IV'].length ? atmRow['PE_IV'][atmRow['PE_IV'].length - 1].iv : null;
        if (ceAtm !== null && peAtm !== null) atmIV = parseFloat(((ceAtm + peAtm) / 2).toFixed(2));
    }

    // OI Concentration: what % of total OI sits at ATM±1 (the 3 central strikes).
    // High concentration (>60%) = strong wall, decisive support/resistance.
    // Low concentration (<35%) = OI is spread, weaker directional signal.
    let totalOI = 0, centralOI = 0;
    tableData.forEach(function(r, i) {
        let oi = (parseFloat(r['OI_CE']) || 0) + (parseFloat(r['OI_PE']) || 0);
        totalOI += oi;
        if (Math.abs(i - atmIdx) <= 1) centralOI += oi;
    });
    let oiConcentration = totalOI > 0 ? parseFloat((centralOI / totalOI * 100).toFixed(1)) : null;

    let map = {}
    map['tableData']       = tableData
    map['pcr']             = pcr
    map['chPcr']           = chPcr
    map['totalVolCE']      = parseFloat(totalVolCE.toFixed(1))
    map['totalVolPE']      = parseFloat(totalVolPE.toFixed(1))
    map['prevVolCE']       = parseFloat(prevVolCE.toFixed(1))
    map['prevVolPE']       = parseFloat(prevVolPE.toFixed(1))
    map['ivSkew']          = ivSkew       // PE_OTM_IV - CE_OTM_IV (%)
    map['atmIV']           = atmIV        // avg ATM CE+PE IV (%)
    map['oiConcentration'] = oiConcentration  // % of OI at ATM±1
    // Underlying spot candles retained for per-5min score reconstruction
    // (renderScoreHistory derives priceChange@T from these). See _oiScoreAtTime().
    map['spotCandles'] = spotCandles
    return map
}