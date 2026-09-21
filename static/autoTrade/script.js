// ─── script.js ────────────────────────────────────────────────────────────────
// Main Tampermonkey entry point for kite.zerodha.com.
//
// Responsibilities:
//   1. LTP scan (scanLtpPrice) — fetches live prices via a '5minute' intraday historical
//      fetch (getHistoricalDataUsingPromise(token, CURRENT_DAY, _gtbCurrDayTo(), '5minute'),
//      keyed by INSTRUMENT_TOKENS, enctoken session auth) instead of a separate API call or
//      scraping the sidebar watchlist DOM. Trimmed with _gtbTrimCandles() (same helper every
//      other historical fetch uses) so it respects the app-wide snapshot end time
//      (#gtb-hist-time) — LTP = close of the last candle at-or-before that time, not
//      necessarily the true live price, matching the rest of the dashboard when reviewing an
//      earlier point in the day. Only writes INSTRUMENT_LTP_PRICE. No standalone poll — it
//      only runs as part of an actual refresh cycle (autoRefreshEachTabs →
//      updateStrorageLtpPrice), triggered by either the manual "Start Refresh" button or the
//      5-minute auto-refresh timer below. Independent of which watchlist tab/instruments
//      happen to be visible.
//   2. Open price load — a separate 'day'-interval historical fetch, run once explicitly via
//      the "Load Price" button (loadOpenPrice), writing INSTRUMENT_LIST_GLOBAL (today's open +
//      yesterday's close) — a one-time daily value that doesn't need snapshot-time slicing
//      (open/prevClose don't change intraday) and isn't re-touched by the LTP refresh cycle.
//      No DOM scraping anywhere, pre-market included — before 09:15, today's day-candle doesn't exist yet,
//      so those instruments are just skipped until the first post-09:15 load.
//   3. Auto-refresh — every 5 minutes during market hours (09:15–16:30), triggers
//      autoRefreshEachTabs (LTP refresh + full grootTradeBot score refresh) via startTimer.
//   4. Chart page detection — on Kite chart pages, auto-opens the individual stock
//      popup (showDetailsOnChartPage) for the instrument in the URL.
//   5. OAuth — handles Kite Connect API OAuth callback (getSetAccessToken) —
//      exchanges request_token + api_secret for access_token.
// ─────────────────────────────────────────────────────────────────────────────

let timerInstance = null

// Single source of truth for "a refresh is in flight" — covers the whole cycle (LTP scan +,
// when manual/auto-triggered, the full grootTradeBot dashboard render), not just the LTP
// scan's own _LTP_SCAN_IN_PROGRESS guard. Drives #start-auto-refresh's disabled state so the
// button can't be clicked again — and doesn't get overlapped by the 5-minute auto-refresh
// timer either — while a cycle is still running.
let _GTB_REFRESH_IN_PROGRESS = false;

// Core refresh orchestrator. Called by the "Start Refresh" button or auto-refresh timer.
// Guards: only runs between 09:15 and 16:30 on market days (unless isManual=true), and never
// overlaps a cycle already in progress (_GTB_REFRESH_IN_PROGRESS).
// Steps: scan LTP prices → if manual, also render the grootTradeBot popup.
// After run, schedules next auto-refresh timer via startRefresh().
async function autoRefreshEachTabs(instance, isManual) {
    clearInterval(timerInstance)

    let currentTime = moment().format("HH:mm")
    let checkTime = moment(PREVIOUS_DAY + " 09:15:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")
    let endTime = moment(PREVIOUS_DAY + " 16:30:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")
    let allow = true;

    if (!(currentTime >= checkTime)) {
        console.log("-------------------------[WAITING FOR MARKET TO OPEN FOR PRICE REFRESH]-----------");
        console.log("current Time :" + currentTime);
        console.log("----------------------------------------------------------------------------------");
        allow = false;
    }

    if (currentTime >= endTime) {
        console.log("----------------------------[MARKET CLOSED PRICE REFRESH STOPPED]--------------------");
        console.log("current Time :" + currentTime);
        console.log("------------------------------------------------------------------------------------");
        allow = false;
    }

    if (_GTB_REFRESH_IN_PROGRESS) {
        console.log("Refresh already in progress — skipping this trigger");
    } else if (allow || isManual) {
        _GTB_REFRESH_IN_PROGRESS = true;
        jQ("#start-auto-refresh").attr("disabled", true);
        try {
            await updateStrorageLtpPrice(instance);
            if (isManual) { await commonShowPopupWindow(); }
        } finally {
            _GTB_REFRESH_IN_PROGRESS = false;
            jQ("#start-auto-refresh").attr("disabled", false);
        }
    }
    startRefresh();
}


jQ(document).on("click", "#start-auto-refresh", function (e) {
    e.preventDefault();
    var that = jQ(this);
    that.attr("disabled", true); // immediate visual feedback — autoRefreshEachTabs owns re-enabling
    jQ("#status-bar-container").append('')
    commonRefresh(that, true)
});

async function commonRefresh(that, isManual) {
    clearInterval(timerInstance)
    await autoRefreshEachTabs(that, isManual);
}

// Starts the interval-based auto-refresh countdown displayed in #refresh-timer-one.
// Calls startTimer(REFRESH_TIME) which ticks every second and fires autoRefreshEachTabs
// (LTP refresh + full dashboard refresh) at every 5-minute mark (m % 5 == 0 && s == 10)
// when #enable-auto-refresh is checked.
function startRefresh() {
    var display = document.querySelector('#refresh-timer-one');
    startTimer(REFRESH_TIME, display);
};


// Clock display only — ticks every second via setInterval (started on DOM ready), updating
// #refresh-timer-one. LTP no longer has its own standalone poll here: it refreshes only as
// part of an actual refresh cycle (autoRefreshEachTabs, via the manual button or the 5-minute
// auto-refresh in startTimer() below) — see updateStrorageLtpPrice()/scanLtpPrice().
function autoStartScanLtp() {
    setInterval(function () {
        var d = new Date();
        var s = d.getSeconds();
        var m = d.getMinutes();
        var h = d.getHours();
        var display = document.querySelector('#refresh-timer-one');
        if (display) {
            display.textContent = ("0" + h).substr(-2) + ":" + ("0" + m).substr(-2) + ":" + ("0" + s).substr(-2);
        }
    }, 1000);
}

jQ(document).ready(function () {
    autoStartScanLtp()
})


function startTimer(duration, display) {
    timerInstance = setInterval(function () {
        var d = new Date();
        var s = d.getSeconds();
        var m = d.getMinutes();
        var h = d.getHours();
        if (m % 5 == 0 && s == 10) {
            let enableAutoRefresh = jQ("#enable-auto-refresh").is(":checked");
            if (enableAutoRefresh) {
                // Routes through autoRefreshEachTabs (isManual=true) so LTP gets refreshed
                // first, then the full dashboard — same single refresh path as the manual
                // "Start Refresh" button, instead of calling commonShowPopupWindow() directly
                // with whatever LTP happened to be cached.
                autoRefreshEachTabs(null, true);
            }
        }
    }, 1000);
}

jQ(document).on("click", "#load-price", function (e) {
    e.preventDefault();
    let result = confirm("Are you sure you want to load the open price ?");
    if (result === true) {
        loadOpenPrice()
    }
});

// Loads today's open price and yesterday's close for all instruments via the Kite
// historical API day candle — candles[0]=prev day, candles[1]=today (still-forming
// intraday, so current[1]=today's open even before the candle closes).
// Saves result to INSTRUMENT_LIST_GLOBAL: { name: { price(open), prevPrice, perc } }
// Also saves India VIX quote (for VIXL/VIXU levels).
// Before 09:15, today's day-candle doesn't exist yet — those instruments are simply skipped
// (no more pre-market sidebar DOM scrape); they'll populate on the first refresh after 09:15.
// Runs the LTP scan (scanLtpPrice) at the end so INSTRUMENT_LTP_PRICE is populated
// immediately, without waiting for the next manual/auto refresh.
async function loadOpenPrice() {
    if (typeof _gtbProgress === 'function') _gtbProgress('Fetching VIX quote…');
    await saveVixQuote();

    let instru = []
    jQ.each(INSTRUMENT_TOKENS, function (index, item) {
        let obj = {}
        obj['TRADINGSYMBOL'] = index
        obj['TOKEN'] = item
        instru.push(obj)
    });
    let storageObj = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL")) || {};
    for (let i = 0; i < instru.length; i++) {
        try {
            let _pMsg = 'Load prices: ' + instru[i]['TRADINGSYMBOL'] + ' (' + (i+1) + '/' + instru.length + ')';
            jQ("#processing-trend").html("Processing.... " + (i + 1) + "/" + instru.length);
            if (typeof _gtbProgress === 'function') _gtbProgress(_pMsg);
            let name = instru[i]['TRADINGSYMBOL']
            let data = await getHistoricalDataUsingPromise(instru[i]['TOKEN'], PREVIOUS_DAY, CURRENT_DAY, 'day');
            let candles = data && data.data && data.data.candles;
            if (!candles || candles.length < 2) continue; // today's candle not open yet (pre-market)
            let previous = candles[0]
            let current = candles[1]
            let obj = {}
            obj['name'] = name
            obj['price'] = current[1]
            obj['prevPrice'] = previous[4]
            obj['perc'] = parseFloat(current[1] - previous[4]).toFixed(2)
            storageObj[name] = obj
        } catch (err) {
            console.log("Error while loading stock : " + instru[i]['TRADINGSYMBOL'])
            console.log(err)
        }

    }
    localStorage.setItem("INSTRUMENT_LIST_GLOBAL", JSON.stringify(storageObj));
    if (typeof _gtbProgress === 'function') _gtbProgress('Prices loaded', 'green');
    setTimeout(function(){ if (typeof _gtbProgressHide === 'function') _gtbProgressHide(); }, 2500);

    await updateStrorageLtpPrice();
    alert("Price loaded successfully.")

}


// instance param kept for call-site compatibility but no longer used to toggle the button —
// autoRefreshEachTabs now owns disabling/re-enabling #start-auto-refresh for the whole cycle
// (LTP scan + dashboard render), not just this LTP-only phase.
async function updateStrorageLtpPrice(instance) {
    await scanLtpPrice();
}

// Renders the top status bar (INDIA VIX / NIFTY 50 / NIFTY BANK / SENSEX) from the
// API-fetched LTP + the stored open/prevClose (INSTRUMENT_LIST_GLOBAL) — no DOM read.
function updateStatusBarFromApi(ltpObj) {
    jQ("#status-bar-container").html('');
    let openDetails = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL")) || {};
    ["INDIA VIX", "NIFTY 50", "NIFTY BANK", "SENSEX"].forEach(function (name) {
        let l = ltpObj[name];
        if (!l) return;
        let prevPrice = openDetails[name] ? parseFloat(openDetails[name]['prevPrice']) : NaN;
        let ltp = parseFloat(l.ltp);
        let change = isNaN(prevPrice) ? null : (ltp - prevPrice).toFixed(2);

        let html = '<div class="col-md-3">'
            + '<span>' + name + ': </span>'
            + '<span badge bg-info>' + l.ltp + ' </span>';
        if (change !== null) {
            html += change > 0
                ? '<span class="badge bg-success"> [' + change + ']</span>'
                : '<span class="badge bg-danger"> [' + change + ']</span>';
        }
        html += '</div>';
        jQ("#status-bar-container").append(html);
    });
}

// Core LTP loader — fetches a '5minute' intraday series (CURRENT_DAY → _gtbCurrDayTo())
// per instrument_token instead of a separate API call or scraping the sidebar watchlist DOM.
// Deliberately NOT the 'day' interval loadOpenPrice() uses: Kite's day-candle always reflects
// the true live intraday state and can't be truncated to an earlier time, so it silently
// ignored the app-wide "snapshot end time" picker (#gtb-hist-time / _gtbHistTime()) that
// every other historical fetch in this app respects via _gtbCurrDayTo()/_gtbTrimCandles().
// With a real snapshot time set, LTP now comes from the last candle at-or-before that time
// instead of the actual current price — consistent with the rest of the dashboard when
// reviewing/backtesting an earlier point in the day. The forming (most recent, still-open)
// candle is deliberately kept, not dropped — for LTP specifically we want the freshest
// available price, unlike OBV/IV calcs which drop it to avoid flicker.
// Only writes INSTRUMENT_LTP_PRICE — INSTRUMENT_LIST_GLOBAL (today's open + yesterday's
// close) is set once by loadOpenPrice() and doesn't change intraday, so this does NOT
// rewrite it every cycle.
// Same enctoken-session auth + rate-limited queue (_gtbHistPump) already used by every other
// historical fetch in this app — no separate Kite Connect API app needed.
// Guarded against overlapping runs — a full scan (~215 instruments through a ≤5-concurrent,
// ~10/sec queue) can take longer than the 60s tick that triggers it.
let _LTP_SCAN_IN_PROGRESS = false;
async function scanLtpPrice() {
    if (_LTP_SCAN_IN_PROGRESS) {
        console.log("LTP scan still in progress from the previous cycle — skipping this tick");
        return;
    }
    _LTP_SCAN_IN_PROGRESS = true;
    try {
        let storageLtpObj = JSON.parse(localStorage.getItem("INSTRUMENT_LTP_PRICE")) || {};
        let names = Object.keys(INSTRUMENT_TOKENS);
        let total = names.length;
        let completed = 0;
        let toTime = (typeof _gtbCurrDayTo === 'function') ? _gtbCurrDayTo() : CURRENT_DAY;

        if (typeof _gtbProgress === 'function') _gtbProgress('LTP: 0/' + total);

        let results = await Promise.all(names.map(function (name) {
            let token = INSTRUMENT_TOKENS[name];
            return getHistoricalDataUsingPromise(token, CURRENT_DAY, toTime, '5minute')
                .then(function (res) {
                    completed++;
                    if (typeof _gtbProgress === 'function') _gtbProgress('LTP: ' + completed + '/' + total + ' (' + name + ')');
                    return { name: name, res: res };
                })
                .catch(function () {
                    completed++;
                    if (typeof _gtbProgress === 'function') _gtbProgress('LTP: ' + completed + '/' + total + ' (' + name + ')');
                    return { name: name, res: null };
                });
        }));

        let anyOk = false;
        results.forEach(function (r) {
            let raw = r.res && r.res.data && r.res.data.candles;
            let candles = (typeof _gtbTrimCandles === 'function') ? _gtbTrimCandles(raw) : raw;
            if (!candles || !candles.length) return;
            anyOk = true;
            let lastClose = candles[candles.length - 1][4];
            storageLtpObj[r.name] = { name: r.name, ltp: parseFloat(lastClose).toFixed(2) };
        });

        if (!anyOk) {
            console.log("LTP historical fetch returned no candles for any instrument — market closed, or enctoken session expired");
            callSackBar("LTP fetch failed — no candle data returned (market closed, or re-login to Kite)");
            if (typeof _gtbProgress === 'function') _gtbProgress('LTP fetch failed', 'orange');
            return;
        }

        localStorage.setItem("INSTRUMENT_LTP_PRICE", JSON.stringify(storageLtpObj));
        updateStatusBarFromApi(storageLtpObj);
        if (typeof _gtbProgress === 'function') _gtbProgress('LTP loaded (' + total + ')', 'green');
    } finally {
        _LTP_SCAN_IN_PROGRESS = false;
    }
}

// Quick, targeted OI/OBV check for a small set of instruments (e.g. NIFTY 50 + NIFTY BANK)
// BEFORE the full ~215-217 instrument sweep (loadOpenPrice + scanLtpPrice) completes.
// showPrictionProbabilty(name) → generateTrend(name) only needs THIS instrument's entry in
// INSTRUMENT_LIST_GLOBAL (open/prevClose) + INSTRUMENT_LTP_PRICE (live LTP) — it has no
// dependency on the 9:15 scan (scanNineFifteenCandle/VALID_BREAKOUT_NINE_FIFTEEN) at all.
// loadOpenPrice() fetches ALL instruments sequentially (one `await` per instrument in a for
// loop) and scanLtpPrice() fetches all of them in parallel but still queued through the shared
// rate limiter — either way NIFTY 50/BANK NIFTY's own price has often already moved by the time
// their turn comes up in a 215-instrument pass. This fetches ONLY the requested names (typically
// 2), merges the result into the SAME two localStorage objects those functions write (so it
// never clobbers data already collected for other instruments), then opens the existing
// Instrument Detail View popup for each — reusing the same OI/OBV pipeline, no new UI needed.
async function _gtbQuickOIOBV(names) {
    try {
        if (typeof _gtbProgress === 'function') _gtbProgress('Quick OI/OBV: fetching ' + names.join(', ') + '…');
        let listGlobal = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL")) || {};
        let ltpObj = JSON.parse(localStorage.getItem("INSTRUMENT_LTP_PRICE")) || {};
        let toTime = (typeof _gtbCurrDayTo === 'function') ? _gtbCurrDayTo() : CURRENT_DAY;

        await Promise.all(names.map(async function (name) {
            let token = INSTRUMENT_TOKENS[name];
            if (!token) return;
            try {
                let dayRes = await getHistoricalDataUsingPromise(token, PREVIOUS_DAY, CURRENT_DAY, 'day');
                let dayCandles = dayRes && dayRes.data && dayRes.data.candles;
                if (dayCandles && dayCandles.length >= 2) {
                    let previous = dayCandles[0];
                    let current = dayCandles[1];
                    listGlobal[name] = {
                        name: name,
                        price: current[1],
                        prevPrice: previous[4],
                        perc: parseFloat(current[1] - previous[4]).toFixed(2)
                    };
                }
            } catch (e) { console.log('Quick OI/OBV: day-candle fetch failed for ' + name, e); }

            try {
                let ltpRes = await getHistoricalDataUsingPromise(token, CURRENT_DAY, toTime, '5minute');
                let raw = ltpRes && ltpRes.data && ltpRes.data.candles;
                let candles = (typeof _gtbTrimCandles === 'function') ? _gtbTrimCandles(raw) : raw;
                if (candles && candles.length) {
                    ltpObj[name] = { name: name, ltp: parseFloat(candles[candles.length - 1][4]).toFixed(2) };
                }
            } catch (e) { console.log('Quick OI/OBV: LTP fetch failed for ' + name, e); }
        }));

        localStorage.setItem("INSTRUMENT_LIST_GLOBAL", JSON.stringify(listGlobal));
        localStorage.setItem("INSTRUMENT_LTP_PRICE", JSON.stringify(ltpObj));
        if (typeof _gtbProgress === 'function') _gtbProgress('Quick OI/OBV ready', 'green');

        names.forEach(function (name) {
            if (typeof _gtbOpenInstrDetailFor === 'function') _gtbOpenInstrDetailFor(name, false);
        });
    } catch (err) {
        console.log('Quick OI/OBV failed', err);
        if (typeof callSackBar === 'function') callSackBar('Quick OI/OBV failed — see console');
    }
}

// .ready() callback must stay a plain (non-async) function here — confirmed live that an
// `async function` passed directly to jQ(document).ready(...) never fires its callback at
// all on this page (Kite's chart page specifically), while a plain function does. The
// async/await logic that used to be the callback's own body now runs in a nested async
// IIFE instead.
jQ(document).ready(function () {
    let location = window.location.href;
    const url = new URL(location);
    const path = url.pathname;
    const segments = path.split('/');
    let exhange = segments[6];
    let symbol = segments[7];
    let token = segments[8];
    if (symbol == "NIFTY%2050") {
        symbol = "NIFTY 50"
    }

    if (symbol == "NIFTY%20BANK") {
        symbol = "NIFTY BANK"
    }
    if (exhange && symbol && token) {
        (async function () {
            // Wait for dataLoad.js's boot-time restore (FUTURE_INTRUMENT_LIST/INSTRUMENT_TOKENS
            // from cached IndexedDB) to actually finish, instead of firing immediately — this
            // used to race a blind setTimeout(..., 500) in dataLoad.js and could call
            // showFutureDetails(symbol) against an empty FUTURE_INTRUMENT_LIST on a slow load
            // (confirmed live: COFORGE showing "No NSE future contract" on direct chart-page
            // load despite the data being present moments later). Raced against a 2s timeout —
            // an IndexedDB read that never resolves (e.g. a blocked/stuck connection) must not
            // be able to hang this popup open forever with no visible error.
            try {
                if (window.gtbDataReadyPromise) {
                    await Promise.race([
                        window.gtbDataReadyPromise,
                        new Promise(function (resolve) { setTimeout(resolve, 2000); }),
                    ]);
                }
            } catch (e) {}
            showDetailsOnChartPage(exhange, symbol, token);
        })();
    }
});

async function showDetailsOnChartPage(exhange, symbol, token) {
    let rowData = {}
    rowData['exchange'] = exhange
    rowData['TRADINGSYMBOL'] = symbol
    rowData['token'] = token
    if (exhange == "NSE" || exhange == "BSE" || exhange == "INDICES") {
        commonShowInidividuslStockPopupWindow(symbol)
        setTimeout(function () {
            let enableAutoRefresh = jQ("#enable-auto-refresh-individual").is(":checked");
            if (enableAutoRefresh) {
                location.reload();
            }
        }, 300000);
    }

}

async function commonShowInidividuslStockPopupWindow(symbol) {
    // Delegate to the redesigned Instrument Detail View popup (2-column card layout).
    // _gtbOpenInstrDetailFor opens #show-futures-signal popup (or reuses it if already open)
    // then calls _gtbLoadInstrDetailPanel(symbol) which fetches all live data.
    // minimal=true: this function's only caller is showDetailsOnChartPage (landing directly
    // on a Kite chart page), which only ever wants THIS one instrument's panel, not the full
    // multi-instrument search/picker chrome — per explicit request.
    if (typeof _gtbOpenInstrDetailFor === 'function') {
        _gtbOpenInstrDetailFor(symbol, true);
        return;
    }

    // Fallback: open the old-style popup if grootTradeBot hasn't loaded yet
    let tempName = symbol.replaceAll(' ', '-').replaceAll('&', '-');
    let breakOutNineFifteen = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN')) || {};
    if (!breakOutNineFifteen[symbol]) {
        breakOutNineFifteen[symbol] = { CLOSE_9_15: 'B/W' };
    }
    let scriptData = generateTrends();
    let header = '<div id="sv-rows-head">'
        + '<span class="gtb-rh-instr">INSTRUMENT</span>'
        + '<span class="gtb-rh-chart">PRICE ACTION</span>'
        + '<span class="gtb-rh-915">9:15</span>'
        + '<span class="gtb-rh-fut">FUTURES</span>'
        + '<span class="gtb-rh-oi">OI MATRIX</span>'
        + '<span class="gtb-rh-oiobv">OI / OBV</span>'
        + '<span class="gtb-rh-weights">SCORE</span>'
        + '<span class="gtb-rh-detail">DETAIL</span>'
        + '</div>';
    let rowHtml = _svRowHtml(symbol, scriptData, breakOutNineFifteen);
    let html = '<div id="individual-stock-popup-window" class="sv-indiv-view">' + header + rowHtml + '</div>';
    let title = '<div style="display:flex;align-items:center;gap:8px;width:100%;">'
        + '<i class="bi bi-graph-up" style="font-size:0.6rem;opacity:0.7;"></i>'
        + '<span style="font-size:0.68rem;font-weight:800;color:var(--gtb-text,#e6edf3);">' + symbol + '</span>'
        + '<span style="font-size:0.5rem;font-weight:600;color:var(--gtb-muted,#7d8590);">Individual View</span>'
        + '<span style="flex:1;"></span>'
        + popupWinControls('popup-custom-style-groot-trade-bot-stock')
        + '</div>';
    showPopUpWindow('groot-trade-bot-stock', html, symbol, 1600, 380);
    let divId = 'popup-custom-style-groot-trade-bot-stock';
    jQ('.' + divId).find('.popupwindow_titlebar_text').html(title);
    hideNativePopupButtons(divId);
    var _isLight = (localStorage.getItem('GTB_THEME') || 'dark') === 'light';
    jQ('.' + divId).toggleClass('gtb-light', _isLight);
    await new Promise(function(r) { setTimeout(r, 60); });
    let tid = tempName;
    try { await showTopChart(symbol, tid + '-chart' + _SV_SUFFIX); } catch(e) {}
    try { let res = await showFutureDetails(symbol); setFutureDetails(symbol, res, _SV_SUFFIX); } catch(e) {}
    try {
        await showPrictionProbabilty(symbol);
        showOIOBVBarChart(symbol, _SV_SUFFIX);
        _gtbRenderOIMatrix(symbol, _SV_SUFFIX);
        try {
            var sc2 = computeInstrumentScore(symbol);
            if (!INSTRUMENT_SCORE_MAP[symbol]) INSTRUMENT_SCORE_MAP[symbol] = {};
            INSTRUMENT_SCORE_MAP[symbol].score = sc2;
            _gtbUpdateWeightBars(symbol, _SV_SUFFIX);
            _svRenderScoreConfidence(symbol, sc2, _SV_SUFFIX);
        } catch(e2) {}
    } catch(e) {}
}


window.addEventListener('load', function () {
    getSetAccessToken()
}, false);



// ── Kite Connect OAuth Callback Handler ───────────────────────────────────────
// When Kite redirects back after login with ?request_token=xxx&status=success,
// exchanges the request_token for a persistent access_token via Kite Connect API.
// Checksum = SHA256(api_key + request_token + api_secret).
// On success: stores access_token to g_config and redirects to dashboard.
// Used to enable live order placement via Kite Connect (not enctoken route).
async function getSetAccessToken(){
    await callSleepForAWhile(2000)
    if (window.location.href.includes('request_token')) {
        var q = qs.parse(window.location.href);
        if (q.status == 'success') {
            jQ.post('https://api.kite.trade/session/token',
                { 'api_key': g_config.get('api_key'), 'request_token': q.request_token, 'checksum': sha256(g_config.get('api_key') + q.request_token + g_config.get('api_secret')) },
                function (data, status) {
                    g_config.set('api_access_token', data.data.access_token);
                    // g_config.set() alone never survives a reload (see
                    // _gtbPersistConfigSnapshot's comment, grootTradeBot.js) — this used to be
                    // worked around with alert(data.data.access_token) so the token could be
                    // manually copy-pasted into Settings and saved for real. Persist it
                    // properly instead, same as the new Market Trend Settings popup's own
                    // Save button does, so the manual step is no longer needed.
                    var persisted = (typeof _gtbPersistConfigSnapshot === 'function') && _gtbPersistConfigSnapshot();
                    callSackBarInfo(persisted ? `AT status ${status} — access token saved automatically` : `AT status ${status} — token: ${data.data.access_token} (auto-save unavailable, enter manually in Settings)`);
                    redirectToDashboard(data.data.access_token)
                })
                .fail(function (xhr, status, error) {
                    var resp = JSON.parse(xhr.responseText);
                    callSackBarInfo(`AT Status ${status} :: ${resp.message}`);
                });
        } else {
            callSackBarInfo('Unable to get Request Token');
        }
    }
}

async function redirectToDashboard(access_token) {
     await callSleepForAWhile(2000)
    window.location.href = "https://kite.zerodha.com/dashboard?access_token=" + access_token;
}