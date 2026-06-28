// ─── utils.js ─────────────────────────────────────────────────────────────────
// Shared utility functions used across all modules:
//   - Watchlist management (addToWatchList)
//   - Trend generation from localStorage (generateTrends, generateTrend)
//   - Strike level calculation (getStrikeDetails)
//   - VIX range calculation (getVixRange, calculateVixRange)
//   - Kite API helpers (getHistoricalData, placeOrder, createAlert)
//   - Local storage helpers (clearLocalStorage, saveVixQuote)
//   - UI helpers (showPopUpWindow, callSackBar)
// ─────────────────────────────────────────────────────────────────────────────

// ── Watchlist ─────────────────────────────────────────────────────────────────

// Adds all instruments in FO_LIST to Kite watchlist one by one with a 1-second delay
// to avoid API rate limiting. Shows progress in #processing-trend element.
async function callAddToWatchList() {
    for (let i = 0; i < FO_LIST.length; i++) {
        addToWatchList("NSE", FO_LIST[i], (i + 1), 1)
        jQ("#processing-trend").html("Processing.... " + (i + 1) + "/" + FO_LIST.length);
        await callSleepForAWhile(1000)
    }
}

// POST to Kite watchlist API to add a single instrument.
// segment: exchange (NSE/BSE/MCX), tradingsymbol: instrument name,
// weight: position in list, watch_id: watchlist number (1–5 on Kite)
function addToWatchList(segment, tradingsymbol, weight, watch_id) {
    jQ.ajaxSetup({
        headers: {
            'x-csrftoken': `${getCookie('public_token')}` // CSRF token from Kite cookie
        }
    });
    return jQ.ajax({
        url: BASE_URL + `/api/marketwatch/${watch_id}/items`,
        type: 'POST',
        data: {
            exchange: segment,
            tradingsymbol: tradingsymbol,
            weight: weight,
            group: 'GROUP:V1skCzzE'
        }
    });
}

// ── UI Initialisation ─────────────────────────────────────────────────────────

// After DOM is ready, inject the "Groot" link into the Kite navigation bar.
// 2-second delay allows Kite's own nav to finish rendering first.
jQ(document).ready(function () {
    setTimeout(function () {
        makeUIChanges();
    }, 2000)
});

// Injects the "Groot" trigger button into the Kite top nav bar.
// Clicking this opens the grootTradeBot dashboard popup.
function makeUIChanges() {
    html = '';
    html += '<a href="#" id="show-groot-trade-bot" style="padding:10px;">'
    html += 'Groot'
    html += '</a>'
    jQ('body').first().find(".app-nav").append(html);
}

// Confirm dialog before adding all FO_LIST instruments to watchlist.
jQ(document).on("click", "#add-to-watch-list", function (e) {
    e.preventDefault();
    let result = confirm("Are you sure you want to add to watch list?");
    if (result === true) {
        callAddToWatchList();
    }
});

// Confirm dialog before wiping all localStorage keys used by the app.
jQ(document).on("click", "#clean-storage", function (e) {
    e.preventDefault();
    let result = confirm("Are you sure you want to clear the local storage ?");
    if (result === true) {
        clearLocalStorage()
    }
});

// ── Async Helpers ─────────────────────────────────────────────────────────────

// Returns a Promise that resolves after `times` milliseconds.
// Used to throttle sequential API calls (e.g. 1000ms between watchlist adds).
function callSleepForAWhile(times) {
    return new Promise((resolve, reject) => {
        setTimeout(function () {
            resolve();
        }, times)
    });
}

// ── Trend Generation ──────────────────────────────────────────────────────────
//
// TREND TERMINOLOGY:
//   AST (Above Strike Two)  — LTP ≥ OPEN + strikeTwo   (strong bullish breakout)
//   ASO (Above Strike One)  — LTP ≥ OPEN + strikeOne   (mild bullish breakout)
//   BSO (Below Strike One)  — LTP ≤ OPEN − strikeOne   (mild bearish breakdown)
//   BST (Below Strike Two)  — LTP ≤ OPEN − strikeTwo   (strong bearish breakdown)
//   VIXU (VIX Upper)        — LTP ≥ prevClose + daily VIX range (overextended up)
//   VIXL (VIX Lower)        — LTP ≤ prevClose − daily VIX range (overextended down)
//
// Strike levels come from NSE_STRIKE_DIFF[instrument] e.g. "50,100" for NIFTY 50.
// VIX range uses India VIX (token 264969) previous day close via calculateVixRange().
//
// DATA SOURCES (all from localStorage, populated by scanLtpPrice() in script.js):
//   INSTRUMENT_LTP_PRICE  — { instrumentName: { ltp } }    live LTP per instrument
//   INSTRUMENT_LIST_GLOBAL — { instrumentName: { price (open), prevPrice, perc } }
//   VIX_QUOTE             — historical candle for India VIX previous day close

// Generates trend data for ALL instruments in INSTRUMENT_TOKENS in one pass.
// Returns a map: { instrumentName: { ltp, open, prevPrice, perc, change, open_perc,
//                                    strikeData, trends[], vix } }
// Used by oiViewer, stockViewer, and advance/decline scanners.
function generateTrends() {
    if (localStorage.getItem("VIX_QUOTE")
        && localStorage.getItem("INSTRUMENT_LTP_PRICE")
        && localStorage.getItem("INSTRUMENT_LIST_GLOBAL")) {
        let ltpPrices = JSON.parse(localStorage.getItem("INSTRUMENT_LTP_PRICE"));
        let openDetails = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL"));
        let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0]; // prev day VIX candle
        let instru = []
        let data = {}
        jQ.each(INSTRUMENT_TOKENS, function (index, item) {
            let obj = {}
            obj['TRADINGSYMBOL'] = index
            obj['TOKEN'] = item
            instru.push(obj)
        });

        for (let i = 0; i < instru.length; i++) {
            try {
                let name = instru[i]['TRADINGSYMBOL']
                let ltp = ltpPrices[name]['ltp']           // current live price from Kite DOM
                let openDetail = openDetails[name]          // open + prevClose stored at market open

                let obj = {}
                obj['price'] = openDetail['price']          // today's open price
                let strikeData = getStrikeDetails(obj, name); // ASO/AST/BSO/BST levels from open

                let res = {}
                res['open'] = openDetail['price']
                res['price'] = openDetail['price']
                res['strikeData'] = strikeData
                res['ltp'] = ltp
                res['prevPrice'] = openDetail['prevPrice']  // yesterday's close
                res['perc'] = openDetail['perc']            // % change open vs prev close
                res['change'] = parseFloat(((ltp - openDetail['prevPrice']) / openDetail['prevPrice']) * 100).toFixed(2) // LTP vs prev close %
                res['open_perc'] = parseFloat(((openDetail['price'] - openDetail['prevPrice']) / openDetail['prevPrice']) * 100).toFixed(2) // gap up/down %

                let trend = "NA"
                let trends = []

                // VIX range: expected daily move based on India VIX prev close
                var vix = getVixRange(parseFloat(openDetail['prevPrice']), parseFloat(vixQuote[4]))
                res['vix'] = vix

                var vixLowerRange = parseFloat(vix.vixDDLower)  // prevClose − daily VIX range
                var vixUpperRange = parseFloat(vix.vixDDUpper)  // prevClose + daily VIX range
                var vixDDRange    = parseFloat(vix.vixDDRange)  // half-range size

                // Strike trend classification — multiple trends can be active simultaneously
                if (ltp >= parseFloat(strikeData['ustrikeTwo'])) {
                    trend = "AST"   // Above Strike Two — strong bullish, price broke ASO and continued
                    trends.push(trend);
                }
                if (ltp >= parseFloat(strikeData['ustrikeOne'])) {
                    trend = "ASO"   // Above Strike One — mild bullish breakout from open
                    trends.push(trend);
                }
                if (ltp <= parseFloat(strikeData['bstrikeTwo'])) {
                    trend = "BST"   // Below Strike Two — strong bearish, price broke BSO and continued
                    trends.push(trend);
                }
                if (ltp <= parseFloat(strikeData['bstrikeOne'])) {
                    trend = "BSO"   // Below Strike One — mild bearish breakdown from open
                    trends.push(trend);
                }
                if (ltp <= parseFloat(vixLowerRange)) {
                    trend = "VIXL"  // At/below VIX lower bound — overextended, potential reversal up
                    trends.push(trend);
                }
                if (ltp >= parseFloat(vixUpperRange)) {
                    trend = "VIXU"  // At/above VIX upper bound — overextended, potential reversal down
                    trends.push(trend);
                }

                res['trends'] = trends
                data[name] = res
            } catch (err) {
                console.log("Error while generating trend for stock : " + instru[i]['TRADINGSYMBOL'])
                console.log(err)
            }
        }
        return data;
    }
}

// Single-instrument version of generateTrends() — same output shape for one instrument.
// Used by setFutureDetails, scoreOIStrikeForSignal, and anywhere a single stock's
// trend data is needed without iterating all instruments.
// Returns { ltp, open, prevPrice, perc, change, open_perc, strikeData, trends[], vix }
function generateTrend(name) {
    let ltpPrices  = JSON.parse(localStorage.getItem("INSTRUMENT_LTP_PRICE"));
    let openDetails = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL"));
    let vixQuote   = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];

    let openDetail = openDetails[name]
    let script     = ltpPrices[name]

    let obj = {}
    let ltp = script['ltp']         // live price from Kite DOM scan
    obj['price'] = openDetail['price']
    let strikeData = getStrikeDetails(obj, name); // ASO/AST/BSO/BST from open price

    let res = {}
    res['strikeData'] = strikeData
    res['ltp']        = ltp
    res['open']       = openDetail['price']         // today's open
    res['price']      = openDetail['price']
    res['prevPrice']  = openDetail['prevPrice']      // yesterday's close
    res['perc']       = openDetail['perc']           // % change at open vs prev close
    res['change']     = parseFloat(((ltp - openDetail['prevPrice']) / openDetail['prevPrice']) * 100).toFixed(2)      // LTP vs prev close %
    res['open_perc']  = parseFloat(((openDetail['price'] - openDetail['prevPrice']) / openDetail['prevPrice']) * 100).toFixed(2) // gap %

    let trend  = "NA"
    let trends = []

    // VIX daily range based on India VIX previous close (token 264969)
    var vix = getVixRange(parseFloat(openDetail['prevPrice']), parseFloat(vixQuote[4]))
    res['vix'] = vix

    var vixLowerRange = parseFloat(vix.vixDDLower)
    var vixUpperRange = parseFloat(vix.vixDDUpper)
    var vixDDRange    = parseFloat(vix.vixDDRange)

    // Strike trend flags (see generateTrends for explanation of each label)
    if (ltp >= parseFloat(strikeData['ustrikeTwo'])) { trend = "AST";  trends.push(trend); }
    if (ltp >= parseFloat(strikeData['ustrikeOne'])) { trend = "ASO";  trends.push(trend); }
    if (ltp <= parseFloat(strikeData['bstrikeTwo'])) { trend = "BST";  trends.push(trend); }
    if (ltp <= parseFloat(strikeData['bstrikeOne'])) { trend = "BSO";  trends.push(trend); }
    if (ltp <= parseFloat(vixLowerRange))            { trend = "VIXL"; trends.push(trend); }
    if (ltp >= parseFloat(vixUpperRange))            { trend = "VIXU"; trends.push(trend); }

    res['trends'] = trends
    return res;
}

// ── Kite Historical API ───────────────────────────────────────────────────────

// Fetches OHLCV + OI candle data from Kite historical API.
// Returns Promise<{ data: { candles: [[timestamp, o, h, l, c, volume, oi], ...] } }>
// On error resolves with [] to allow caller to handle gracefully.
// Authentication: Kite enctoken from browser cookie (Tampermonkey context).
// ── Historical-API rate limiter ───────────────────────────────────────────────
// Kite caps the historical endpoint at ~3 requests/sec. Parallel callers (Promise.all
// bursts in the OI scan / backtests) would trip "Too many requests" (429), so every
// historical call is funnelled through one queue: ≤ _GTB_HIST_CONC in flight and
// ≥ _GTB_HIST_GAP ms between starts. On 429 it auto-retries with backoff.
var _GTB_HIST_QUEUE = [];
var _GTB_HIST_ACTIVE = 0;
var _GTB_HIST_LAST = 0;
var _GTB_HIST_CONC = 5;     // max concurrent historical requests
var _GTB_HIST_GAP  = 100;   // min ms between request starts (~10/sec)

function _gtbHistPump() {
    if (!_GTB_HIST_QUEUE.length || _GTB_HIST_ACTIVE >= _GTB_HIST_CONC) return;
    var wait = _GTB_HIST_GAP - (Date.now() - _GTB_HIST_LAST);
    if (wait > 0) { setTimeout(_gtbHistPump, wait); return; }
    var job = _GTB_HIST_QUEUE.shift();
    _GTB_HIST_LAST = Date.now();
    _GTB_HIST_ACTIVE++;
    job().then(function () { _GTB_HIST_ACTIVE--; _gtbHistPump(); });
    if (_GTB_HIST_QUEUE.length) setTimeout(_gtbHistPump, _GTB_HIST_GAP);   // allow next to start after the gap
}

function _gtbHistAjax(code, fromDate, toDate, interval, attempt) {
    jQ.ajaxSetup({ headers: { 'Authorization': `enctoken ${getCookie('enctoken')}` } });
    return new Promise(function (resolve) {
        jQ.ajax({
            url: BASE_URL + `/oms/instruments/historical/${code}/${interval}?user_id=HY8031&oi=1&from=${fromDate}&to=${toDate}`,
            type: 'GET', async: true, cache: false,
            success: function (data) { resolve(data); },
            error: function (request) {
                // 429 (Too many requests) → back off and retry up to 3×
                if (request && request.status === 429 && (attempt || 0) < 3) {
                    setTimeout(function () { _gtbHistAjax(code, fromDate, toDate, interval, (attempt || 0) + 1).then(resolve); }, 700 * ((attempt || 0) + 1));
                } else {
                    resolve([]);
                }
            }
        });
    });
}

function getHistoricalDataUsingPromise(code, fromDate, toDate, interval) {
    return new Promise(function (resolve) {
        _GTB_HIST_QUEUE.push(function () {
            return _gtbHistAjax(code, fromDate, toDate, interval, 0).then(function (d) { resolve(d); });
        });
        _gtbHistPump();
    });
}

// jQuery-deferred version of getHistoricalDataUsingPromise (used in older call sites).
// Returns a jQuery Deferred — use .done() instead of .then()/.await
function getHistoricalData(code, fromDate, toDate, interval) {
    jQ.ajaxSetup({ headers: { 'Authorization': `enctoken ${getCookie('enctoken')}` } });
    return jQ.ajax({
        url: BASE_URL + `/oms/instruments/historical/${code}/${interval}?user_id=HY8031&oi=1&from=${fromDate}&to=${toDate}`,
        type: 'GET', async: true, cache: false,
    });
}

// ── OHL Buy/Sell Signal ───────────────────────────────────────────────────────

// Classifies intraday bias from Open-High-Low relationship.
// Logic:
//   Open == High → Strong Sell (all buyers exhausted at open, price only went down)
//   Open == Low  → Strong Buy  (all sellers exhausted at open, price only went up)
//   Low high range (oh ≤ 0.85%) + wide lower range (ol ≥ 1.25%) → Strong Sell
//   Wide upper range (oh ≥ 1.25%) + low lower range (ol ≤ 0.85%) → Strong Buy
//   LTP ≥ Open → Buy;  LTP ≤ Open → Sell
// Returns [oh%, ol%, signal] where oh = (H−O)/H×100, ol = (O−L)/O×100
function calculateOHLBuySell(o, h, l, ltp, previousClose) {
    let open = o, high = h, low = l, ltpd = ltp;
    let highMinusOpen  = high - open;
    let openMinuslow   = open - low;
    let list = []
    let oh = (highMinusOpen / high) * 100;   // how far high is above open as % of high
    let ol = (openMinuslow  / open) * 100;   // how far open is above low as % of open

    list.push(oh);
    list.push(ol);

    // Special cases: open = high or open = low (extreme directional opens)
    if (open == high) { list.push("Strong Sell(OH)"); return list; }
    if (open == low)  { list.push("Strong Buy(OL)");  return list; }

    // Asymmetric range: one side very tight means the other side dominates
    if (oh >= 0.0 && oh <= 0.85 && ol >= 1.25) { list.push("Strong Sell(Lower High)"); return list; }
    if (ol >= 0.0 && ol <= 0.85 && oh >= 1.25) { list.push("Strong Buy(Higher High)"); return list; }

    // Standard: LTP relative to open
    if (ltpd >= open && ltpd >= low)   { list.push("Buy");  return list; }
    if (ltpd <= open && ltpd <= high)  { list.push("Sell"); return list; }

    list.push("Neutral");
    return list;
}

// ── Strike Calculation ────────────────────────────────────────────────────────

// Computes ASO/AST/BSO/BST levels for an instrument from its open price.
// Strike differences come from NSE_STRIKE_DIFF (e.g. "50,100" = strikeOne=50, strikeTwo=100).
//
// Layout around open price:
//   BST = open − strikeOne − strikeTwo   (strong support / breakdown target)
//   BSO = open − strikeOne               (first support)
//   OPEN ────────────────────────────────(reference)
//   ASO = open + strikeOne               (first resistance)
//   AST = open + strikeOne + strikeTwo   (strong resistance / breakout target)
//
// These levels are drawn as dashed lines on the candlestick chart.
function getStrikeDetails(item, instrument) {
    let strikeDiff = getStrikeDiff(instrument);     // e.g. "50,100"
    strikeDiff = strikeDiff.split(",");
    let strikeOne = parseInt(strikeDiff[0])          // distance from open to ASO/BSO
    let strikeTwo = parseInt(strikeDiff[1])          // distance from ASO to AST (or BSO to BST)

    let ustrikeOne = (parseFloat(item.price) + strikeOne);       // ASO
    let ustrikeTwo = (ustrikeOne + strikeTwo);                    // AST
    let bstrikeOne = (parseFloat(item.price) - strikeOne);       // BSO
    let bstrikeTwo = (bstrikeOne - strikeTwo);                    // BST

    let map = {}
    map['strikeDiff'] = parseFloat(strikeDiff).toFixed(2);
    map['bstrikeOne'] = parseFloat(bstrikeOne).toFixed(2);  // BSO
    map['bstrikeTwo'] = parseFloat(bstrikeTwo).toFixed(2);  // BST
    map['ustrikeOne'] = parseFloat(ustrikeOne).toFixed(2);  // ASO
    map['ustrikeTwo'] = parseFloat(ustrikeTwo).toFixed(2);  // AST
    return map;
}

// Looks up the strike step size for an instrument from NSE_STRIKE_DIFF constant.
// Returns "strikeOne,strikeTwo" string (e.g. "50,100" for NIFTY 50).
// Defaults to "100" if not found.
function getStrikeDiff(instrument) {
    let strikeDiff = 100;
    if (NSE_STRIKE_DIFF[instrument]) {
        strikeDiff = NSE_STRIKE_DIFF[instrument]
        strikeDiff = strikeDiff.replace(/ /g, '')
    }
    return strikeDiff;
}

// ── VIX Range Calculation ─────────────────────────────────────────────────────
//
// India VIX (or OVX for crude, GVZ for gold, VXSLV for silver) represents
// the market's expected annualised volatility. We convert it to a daily/weekly/monthly
// expected move range using:
//   range = prevClose × (VIX% / √tradingDays)
//   VIXU = prevClose + range   (upper expected boundary for the period)
//   VIXL = prevClose − range   (lower expected boundary)
//
// Trading days denominators:
//   DAILY:   √(365 − 104 weekends − 15 holidays) = √246
//   WEEKLY:  √52
//   MONTHLY: √12
//
// If LTP crosses VIXU/VIXL, the move is statistically overextended for the day/week/month
// and a mean-reversion is likely.

// Calculates VIX-based expected move ranges for DAILY, WEEKLY, and MONTHLY horizons.
// prevQuoteData: yesterday's close of the instrument
// prevVixData:   yesterday's close of the relevant VIX index
// Returns { vixDDRange, vixDDLower, vixDDUpper, vixWWRange, ..., vixMMRange, ... }
function getVixRange(prevQuoteData, prevVixData) {
    var vixMM = calculateVixRange("MONTHLY", prevQuoteData, prevVixData)
    var vixWW = calculateVixRange("WEEKLY",  prevQuoteData, prevVixData)
    var vixDD = calculateVixRange("DAILY",   prevQuoteData, prevVixData)

    let d = {}
    d.vixMMRange = vixMM.range;  d.vixMMLower = vixMM.lNift;  d.vixMMUpper = vixMM.uNift;
    d.vixWWRange = vixWW.range;  d.vixWWLower = vixWW.lNift;  d.vixWWUpper = vixWW.uNift;
    d.vixDDRange = vixDD.range;  d.vixDDLower = vixDD.lNift;  d.vixDDUpper = vixDD.uNift;
    return d;
}

// Core VIX range formula for a single time horizon.
// type: "DAILY" | "WEEKLY" | "MONTHLY"
// Returns { chg, range, lNift (lower), uNift (upper) }
function calculateVixRange(type, prevQuoteData, prevVixData) {
    var data = {}
    var prevData      = prevQuoteData  // instrument prev close
    var previousClose = prevVixData    // VIX prev close
    var chg;

    // chg = VIX% / √(annualised trading periods) — converts annual VIX to period volatility
    if (type == "DAILY")   chg = parseFloat(previousClose) / Math.sqrt(365 - 104 - 15) // √246 trading days
    if (type == "MONTHLY") chg = parseFloat(previousClose) / Math.sqrt(12)
    if (type == "WEEKLY")  chg = parseFloat(previousClose) / Math.sqrt(52)

    var range = parseFloat(prevData) * chg / 100   // absolute price move expected for the period
    var lNift = parseFloat(prevData) - range        // lower boundary (VIXL)
    var uNift = parseFloat(prevData) + range        // upper boundary (VIXU)

    data['chg']   = chg.toFixed(2)
    data['range'] = range.toFixed(2)
    data['lNift'] = lNift.toFixed(2)
    data['uNift'] = uNift.toFixed(2)
    return data;
}

// ── VIX Quote Cache ───────────────────────────────────────────────────────────

// Fetches India VIX previous day candle and caches in localStorage.
// Only fetches if not already cached — avoids repeated API calls on refresh.
// Token 264969 = India VIX on NSE. Used as volatility input for VIXL/VIXU levels.
function saveVixQuote() {
    return new Promise((resolve, reject) => {
        if (!localStorage.getItem("VIX_QUOTE")) {
            jQ.when(getHistoricalData(264969, PREVIOUS_DAY, PREVIOUS_DAY, 'day')).done(function (res) {
                localStorage.setItem("VIX_QUOTE", JSON.stringify(res));
                resolve();
            })
        } else {
            resolve(); // already cached
        }
    });
}

// ── Previous Day Quote Cache ──────────────────────────────────────────────────

// Fetches and caches previous day daily candle for a stock.
// Used to get yesterday's close price for OI change calculation (CHG_OI = today − prev close OI).
// Caches under key "{name}_PREVIOUS_DAY_QUOTE" to avoid redundant API calls.
function savePreviousStockQuote(script, token) {
    let tempName = script.replaceAll(" ", "-").replaceAll("&", "-")
    return new Promise((resolve, reject) => {
        if (!localStorage.getItem(tempName + "_PREVIOUS_DAY_QUOTE")) {
            jQ.when(getHistoricalData(token, PREVIOUS_DAY, PREVIOUS_DAY, HISTORICAL_DATA_INTERVAL)).done(function (res) {
                localStorage.setItem(tempName + "_PREVIOUS_DAY_QUOTE", JSON.stringify(res));
                resolve();
            })
        } else {
            resolve();
        }
    });
}

// ── Order Management ──────────────────────────────────────────────────────────

// Places a regular market/limit order via Kite OMS API.
// order: { tradingsymbol, exchange, transaction_type, quantity, product, order_type, price }
// Returns Promise<response> — resolves with Kite order response.
function placeOrder(order) {
    jQ.ajaxSetup({ headers: { 'Authorization': `enctoken ${getCookie('enctoken')}` } });
    return new Promise((resolve, reject) => {
        jQ.post(BASE_URL + "/oms/orders/regular", order,
            function (data, status) { resolve(data); })
            .fail(function (jqXHR, textStatus, error) { resolve(textStatus); });
    });
}

// Places order and logs it to localStorage TRADES + ORDERBOOK if successful.
// isAllowed: if false, simulates a success without actually placing (paper trading mode).
// Prevents duplicate orders for the same instrument in the same session.
async function callPlaceOrder(params, isAllowed) {
    let res = '';
    if (isAllowed) {
        res = await placeOrder(params)  // real order
    } else {
        res = { 'status': 'success' };  // paper trade simulation
    }

    if (res.status != 'error') {
        // Log to TRADES list (array of tradingsymbols) and ORDERBOOK (full order details)
        let trades    = JSON.parse(localStorage.getItem("TRADES"))    || [];
        let orderBook = JSON.parse(localStorage.getItem("ORDERBOOK")) || {};

        if (jQ.inArray(params.tradingsymbol, trades) === -1) {
            // First order for this instrument this session — record it
            trades.push(params.tradingsymbol);
            let obj = {}
            obj['ORDER']      = params
            obj['INFO']       = generateTrend(params.tradingsymbol); // snapshot of trend at order time
            obj['KITE_ORDER'] = res
            obj['ORDER_DATE'] = moment().format("DD-MM-YYYY HH:mm:ss");
            orderBook[params.tradingsymbol] = obj
            localStorage.setItem("TRADES",     JSON.stringify(trades));
            localStorage.setItem("ORDERBOOK",  JSON.stringify(orderBook));
        }
    }
    return res;
}

// ── Alert Creation ────────────────────────────────────────────────────────────

// Creates a price alert on Kite for an instrument.
// name: alert label, lhs_tradingsymbol: instrument, rhs_constant: price level,
// operator: ">=" | "<=" | "=", lhs_exchange: "NSE" | "BSE" | "MCX"
function createAlert(name, lhs_tradingsymbol, rhs_constant, operator, lhs_exchange) {
    jQ.ajaxSetup({ headers: { 'Authorization': `enctoken ${getCookie('enctoken')}` } });
    return jQ.ajax({
        url: BASE_URL + `/oms/alerts`,
        type: 'POST',
        data: {
            name: name, lhs_exchange: lhs_exchange,
            lhs_tradingsymbol: lhs_tradingsymbol,
            lhs_attribute: "LastTradedPrice",
            operator: operator, rhs_type: "constant",
            type: "simple", rhs_constant: rhs_constant
        }
    });
}

// ── Local Storage Helpers ─────────────────────────────────────────────────────

// Clears all app-specific localStorage keys.
// Called when user clicks "Clean Storage" button.
// Does NOT clear browser's other localStorage keys.
function clearLocalStorage() {
    // Core price/quote caches
    localStorage.removeItem("INSTRUMENT_LIST_GLOBAL");  // open + prevClose per instrument
    localStorage.removeItem("TRADES")                    // placed orders this session
    localStorage.removeItem("ORDERBOOK")                 // full order details
    localStorage.removeItem("VIX_QUOTE")                 // India VIX prev day candle
    localStorage.removeItem("OHL_TREND")                 // OHL buy/sell signals
    localStorage.removeItem("VALID_INSTRUMENTS")         // instruments passing basic filters
    localStorage.removeItem("INSTRUMENT_LTP_PRICE")      // live LTP scan results
    localStorage.removeItem("VALID_BREAKOUT")            // instruments with active breakout
    localStorage.removeItem("VALID_BSO")                 // instruments at/below BSO
    localStorage.removeItem("VALID_ASO")                 // instruments at/above ASO
    localStorage.removeItem("VALID_BREAKOUT_NINE_FIFTEEN") // 9:15 candle breakout scan results

    // Per-instrument previous day quote caches
    for (let i = 0; i < FO_LIST.length; i++) {
        let name = FO_LIST[i].replaceAll(" ", "-").replaceAll("&", "-")
        localStorage.removeItem(name + "_PREVIOUS_DAY_QUOTE")
    }
    for (let i = 0; i < INDICES.length; i++) {
        let name = INDICES[i].replaceAll(" ", "-").replaceAll("&", "-")
        localStorage.removeItem(name + "_PREVIOUS_DAY_QUOTE")
    }
}

// Returns array of instrument names that have passed the valid instrument filter.
// Reads VALID_INSTRUMENTS localStorage map and returns its keys.
function getAllValidStocks() {
    let validIntruments = JSON.parse(localStorage.getItem("VALID_INSTRUMENTS"));
    let scripts = []
    jQ.each(validIntruments, function (index, item) {
        if (jQ.inArray(index, scripts) === -1) scripts.push(index)
    });
    return scripts;
}

// Returns array of instrument names that had a confirmed 9:15 breakout.
// VALID_BREAKOUT_NINE_FIFTEEN is populated by the 9:15 candle scan in script.js.
function getAllValidBreakOutStocks() {
    let validBreakouts = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));
    let scripts = []
    jQ.each(validBreakouts, function (index, item) {
        if (jQ.inArray(index, scripts) === -1) scripts.push(index)
    });
    return scripts;
}

// Returns array of instruments currently being tracked for next-day follow-up.
// TRACK_SCRIPTS is a simple array in localStorage.
function getAllTrackingStocks() {
    let tracking = JSON.parse(localStorage.getItem("TRACK_SCRIPTS"));
    let scripts = []
    jQ.each(tracking, function (index, item) {
        if (jQ.inArray(item, scripts) === -1) scripts.push(item)
    });
    return scripts;
}

// Adds an instrument to the next-day tracking list when user clicks "Track" button.
jQ(document).on("click", ".track-next-day", function (e) {
    let name = jQ(this).attr("data-name");
    let trackScripts = JSON.parse(localStorage.getItem("TRACK_SCRIPTS")) || [];
    trackScripts.push(name)
    localStorage.setItem("TRACK_SCRIPTS", JSON.stringify(trackScripts));
});

// ── Kite Quote API (via API key — not enctoken) ───────────────────────────────

// Fetches live quotes for multiple instruments via the official Kite Connect API.
// Requires api_key + api_access_token from config (set in Data Settings popup).
// instruments: array of "EXCHANGE:SYMBOL" strings e.g. ["NSE:NIFTY 50", "NSE:RELIANCE"]
function getQuotesUsingPromise(instruments) {
    jQ.ajaxSetup({
        headers: {
            'Authorization': `token ${g_config.get('api_key')}:${g_config.get('api_access_token')}`
        }
    });
    return new Promise((resolve, reject) => {
        jQ.ajax({
            url: `https://api.kite.trade/quote?i=${instruments.join('&i=')}`,
            type: 'GET', async: false, cache: false,
            success: function (data) { resolve(data); },
            error:   function (request, status, error) { resolve([]); }
        });
    })
}

// ── UI Notification Helpers ───────────────────────────────────────────────────

// Shows a persistent (60s) alert snack bar at the bottom of the page.
// Used for warning messages or errors that need user attention.
function callSackBar(message) {
    SnackBar({ message: message, status: "alert", timeout: 60000, actions: [], container: "app", position: 'bd' });
}

// Shows a brief (20s) info snack bar at the bottom of the page.
// Used for confirmation messages (e.g. "Order placed", "Scan complete").
function callSackBarInfo(message) {
    SnackBar({ message: message, status: "info", timeout: 20000, actions: [], position: 'bd' });
}

// ── Popup Window Helper ───────────────────────────────────────────────────────

// Creates a draggable/resizable popup window using the jQuery PopupWindow plugin.
// index: unique popup ID (e.g. "oi-viewer-scanner")
// html: content HTML, title: title bar text, width/height: initial dimensions
// Destroys any existing popup with the same index before creating a new one.
function showPopUpWindow(index, html, title, width, height) {
    var divId = "pop-up-window-" + index;
    if (jQ("#" + divId).PopupWindow("getState")) jQ("#" + divId).PopupWindow("destroy");
    jQ("body").find("#" + divId).remove()
    var popupCustomClass = 'popup-custom-style-' + index;
    var markup = '<div id="' + divId + '">' + html + '</div>'
    jQ("body").append(markup);
    jQ("#" + divId).PopupWindow({
        title: title, modal: false, customClass: popupCustomClass,
        buttons: { close: true, maximize: true, collapse: true, minimize: true },
        buttonsPosition: "right",
        buttonsTexts: { close: "Close", maximize: "Maximize", unmaximize: "Restore",
                        minimize: "Minimize", unminimize: "Show", collapse: "Collapse", uncollapse: "Expand" },
        draggable: true, dragOpacity: 1, statusBar: true,
        width: width, height: height, resizable: true, resizeOpacity: 1, mouseMoveEvents: true
    });
    jQ.PopupWindowMinimizedArea({ position: "bottom right", direction: "vertical" });
    jQ("#" + divId).on("minimize.popupwindow",   function () { jQ("." + popupCustomClass + " .pop-title-extra").hide(); });
    jQ("#" + divId).on("unminimize.popupwindow", function () { jQ("." + popupCustomClass + " .pop-title-extra").show(); });
    // Stop mousedown on content/statusbar from triggering the popup library's drag handler
    jQ("." + popupCustomClass).find(".popupwindow_content, .popupwindow_statusbar")
        .on("mousedown", function(e) { e.stopPropagation(); });
}
