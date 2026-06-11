// ─── script.js ────────────────────────────────────────────────────────────────
// Main Tampermonkey entry point for kite.zerodha.com.
//
// Responsibilities:
//   1. LTP scan — scrapes live prices from the Kite watchlist DOM every minute
//      (autoStartScanLtp, scanLtpPrice) and injects strike labels (ASO/AST/BSO/BST/VIXU/VIXL)
//      next to each instrument in the sidebar.
//   2. Open price load — fetches today's open + previous close via Kite historical API
//      (loadOpenPrice) or scrapes from pre-market DOM (loadPreMarketOpenPrice).
//   3. Auto-refresh — every 5 minutes during market hours (09:15–16:30), triggers
//      the full grootTradeBot score refresh (startTimer → commonShowPopupWindow).
//   4. Chart page detection — on Kite chart pages, auto-opens the individual stock
//      popup (showDetailsOnChartPage) for the instrument in the URL.
//   5. OAuth — handles Kite Connect API OAuth callback (getSetAccessToken) —
//      exchanges request_token + api_secret for access_token.
// ─────────────────────────────────────────────────────────────────────────────

let timerInstance = null

// Core refresh orchestrator. Called by the "Start Refresh" button or auto-refresh timer.
// Guards: only runs between 09:15 and 16:30 on market days (unless isManual=true).
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

    if (allow || isManual) {
        await updateStrorageLtpPrice(instance);
        if (isManual) { await commonShowPopupWindow(); }
    }
    startRefresh();
}


jQ(document).on("click", "#start-auto-refresh", function (e) {
    e.preventDefault();
    var that = jQ(this);
    that.attr("disabled", true);
    jQ("#status-bar-container").append('')
    commonRefresh(that, true)
});

async function commonRefresh(that, isManual) {
    clearInterval(timerInstance)
    await autoRefreshEachTabs(that, isManual);
}

// Starts the interval-based auto-refresh countdown displayed in #refresh-timer-one.
// Calls startTimer(REFRESH_TIME) which ticks every second and fires commonShowPopupWindow
// at every 5-minute mark (m % 5 == 0 && s == 10) when #enable-auto-refresh is checked.
function startRefresh() {
    var display = document.querySelector('#refresh-timer-one');
    startTimer(REFRESH_TIME, display);
};


// Background LTP poller — runs every second via setInterval (started on DOM ready).
// At s==59 (last second of each minute): if INSTRUMENT_LTP_PRICE is already cached,
// triggers updateStrorageLtpPrice() to re-scan the Kite DOM for fresh LTP values.
// The clock is also displayed in #refresh-timer-one.
// This runs independently of the manual refresh button — always on while the page is loaded.
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
        if (s == 59) {
            let storageLtpObj = JSON.parse(localStorage.getItem("INSTRUMENT_LTP_PRICE"));
            if (storageLtpObj != null) {
                console.log("Loading ltp prices ........")
                updateStrorageLtpPrice();
            }
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
                commonShowPopupWindow();
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

// Loads today's open price and yesterday's close for all instruments.
// Before 09:15: uses pre-market DOM scan (loadPreMarketOpenPrice) — scrapes Kite sidebar.
// After 09:15:  uses Kite historical API day candle — candles[0]=prev day, candles[1]=today.
// Saves result to INSTRUMENT_LIST_GLOBAL: { name: { price(open), prevPrice, perc } }
// Also saves India VIX quote (for VIXL/VIXU levels) and then scans LTP.
async function loadOpenPrice() {
    await saveVixQuote();
    let currentTime = moment().format("HH:mm")
    let checkTime = moment(PREVIOUS_DAY + " 09:15:00", 'YYYY-MM-DD HH:mm:ss').format("HH:mm")

    if (currentTime < checkTime) {
        await loadPreMarketOpenPrice()
    } else {
        let instru = []
        jQ.each(INSTRUMENT_TOKENS, function (index, item) {
            let obj = {}
            obj['TRADINGSYMBOL'] = index
            obj['TOKEN'] = item
            instru.push(obj)
        });
        let storageObj = {};
        for (let i = 0; i < instru.length; i++) {
            try {
                jQ("#processing-trend").html("Processing.... " + (i + 1) + "/" + instru.length);
                let name = instru[i]['TRADINGSYMBOL']
                let tempName = name.replaceAll(" ", "-")
                tempName = tempName.replaceAll("&", "-")
                let data = await getHistoricalDataUsingPromise(instru[i]['TOKEN'], PREVIOUS_DAY, CURRENT_DAY, 'day');
                let previous = data.data.candles[0]
                let current = data.data.candles[1]
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
    }
    await updateStrorageLtpPrice();
    alert("Price loaded successfully.")

}

async function loadPreMarketOpenPrice() {
    let marketWatchSideBar = jQ(".marketwatch-pagination");
    let tabs = marketWatchSideBar.find(".pagination a.item");
    for (let i = 0; i < 1; i++) {
        jQ(".marketwatch-pagination a.item")[i].click();
        await callSleepForAWhile(1000);
        await scanPreMarketpPrice();
    }

}

async function scanPreMarketpPrice() {
    await callSleepForAWhile(1000)
    let marketWatchSideBar = jQ(".marketwatch-pagination");
    let tabs = marketWatchSideBar.find(".pagination a.item");
    let instrumentsWrapper = jQ(".draggable-wrapper");
    let instruments = instrumentsWrapper.find(".items .item-wrapper");
    let storageOpenPriceObj = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_GLOBAL"));
    if (!storageOpenPriceObj) {
        storageOpenPriceObj = {}
    }

    jQ.each(tabs, function (index, item) {
        if (index == 0 || index == 1) {
            if (jQ(item).hasClass("selected")) {
                if (instruments.length > 0) {
                    jQ(instruments).each(function (iindex, iitem) {
                        let name = jQ(this).find(".symbol").find(".name").html();
                        let price = jQ(this).find(".price").find(".last-price").html();
                        let perc = jQ(this).find(".price-change").find(".change-absolute").html();
                        if (name == "M&amp;M") {
                            name = "M&M"
                        }

                        if (name == "M&amp;MFIN") {
                            name = "M&MFIN"
                        }

                        if (name == "GVT&amp;D") {
                            name = "GVT&D"
                        }

                        

                        let obj = {}
                        obj['name'] = name
                        obj['price'] = parseFloat(price.trim()).toFixed(2)
                        obj['perc'] = perc.trim();
                        let prevPrice = parseFloat(price.trim()) - parseFloat(perc.trim());
                        obj['prevPrice'] = parseFloat(prevPrice).toFixed(2);
                        storageOpenPriceObj[name] = obj
                    });
                }
            }
        }
    });

    localStorage.setItem("INSTRUMENT_LIST_GLOBAL", JSON.stringify(storageOpenPriceObj));
}


async function updateStrorageLtpPrice(instance) {
    let marketWatchSideBar = jQ(".marketwatch-pagination");
    let tabs = marketWatchSideBar.find(".pagination a.item");
    if (tabs.length != 0) {
        for (let i = 0; i < 1; i++) {
            jQ(".marketwatch-pagination a.item")[i].click();
            await callSleepForAWhile(1000);
            await scanLtpPrice();
        }
        if (instance) {
            instance.attr("disabled", false)
        }
        jQ(".marketwatch-pagination a.item")[0].click();

    }
}

function updateStatusBar(that) {

    let name = that.find(".symbol").find(".name").html();
    let price = that.find(".price").find(".last-price").html();
    let perc = that.find(".price-change").find(".change-absolute").html();

    let html = ''

    html += '<div class="col-md-3">'
    html += '<span>' + name + ': </span>'
    html += '<span badge bg-info>' + price + ' </span>'
    if (perc > 0) {
        html += '<span class="badge bg-success"> [' + perc + ']</span>'
    } else {
        html += '<span class="badge bg-danger"> [' + perc + ']</span>'
    }
    html += '</div>'
    jQ("#status-bar-container").append(html)
}

// Core DOM scraper — reads live LTP from Kite watchlist sidebar for each instrument.
// For each instrument in the active watchlist tab:
//   1. Reads name (.symbol .name) and price (.price .last-price) from the DOM
//   2. Saves to INSTRUMENT_LTP_PRICE: { name: { name, ltp } }
//   3. Injects ASO/AST/BSO/BST/VIXU/VIXL badges based on current price vs strike levels
//   4. Updates the top status bar for INDIA VIX, NIFTY 50, NIFTY BANK, SENSEX
//
// HTML entity handling: M&amp;M → M&M, M&amp;MFIN → M&MFIN, GVT&amp;D → GVT&D
// Badge injection: removes old .strike-info badges then re-adds current ones.
async function scanLtpPrice() {
    jQ("#status-bar-container").html('')
    await callSleepForAWhile(1000)
    let marketWatchSideBar = jQ(".marketwatch-pagination");
    let tabs = marketWatchSideBar.find(".pagination a.item");
    let instrumentsWrapper = jQ(".draggable-wrapper");
    let instruments = instrumentsWrapper.find(".items .item-wrapper");
    let storageLtpObj = JSON.parse(localStorage.getItem("INSTRUMENT_LTP_PRICE"));
    if (!storageLtpObj) {
        storageLtpObj = {}
    }
    let scriptData = generateTrends()
    jQ.each(tabs, function (index, item) {
        if (index == 0 || index == 1) {
            if (jQ(item).hasClass("selected")) {
                if (instruments.length > 0) {
                    jQ(instruments).each(function (iindex, iitem) {
                        let that = jQ(this);
                        let name = jQ(this).find(".symbol").find(".name").html();
                        let price = jQ(this).find(".price").find(".last-price").html();
                        let obj = {}
                        if (name == "M&amp;M") {
                            name = "M&M"
                        }

                        if (name == "M&amp;MFIN") {
                            name = "M&MFIN"
                        }

                        if (name == "GVT&amp;D") {
                            name = "GVT&D"
                        }

                        obj['name'] = name.trim()
                        obj['ltp'] = parseFloat(price.trim()).toFixed(2);
                        storageLtpObj[name] = obj


                        that.find(".item-info-wrapper").find(".strike-info").remove();

                        let currentPrice = parseFloat(price.trim()).toFixed(2);
                        if (name != "INDIA VIX") {
                            if (scriptData) {
                                let asoPrice = parseFloat(scriptData[name]['strikeData']['ustrikeOne']);
                                let bsoPrice = parseFloat(scriptData[name]['strikeData']['bstrikeOne']);

                                let astPrice = parseFloat(scriptData[name]['strikeData']['ustrikeTwo']);
                                let bstPrice = parseFloat(scriptData[name]['strikeData']['bstrikeTwo']);

                                let vixDDUpper = scriptData[name]['vix']['vixDDUpper']
                                let vixDDLower = scriptData[name]['vix']['vixDDLower']

                                if (currentPrice >= parseFloat(astPrice)) {
                                    let strike = '<div class="badge bg-info above-strike-two strike-info">AST</div>'
                                    that.find(".item-info-wrapper").append(strike);
                                }

                                if (currentPrice >= parseFloat(asoPrice)) {
                                    let strike = '<div class="badge bg-info above-strike-one strike-info">ASO</div>'
                                    that.find(".item-info-wrapper").append(strike);
                                }
                                if (currentPrice <= parseFloat(bstPrice)) {
                                    let strike = '<div class="badge bg-info below-strike-two strike-info">BST</div>'
                                    that.find(".item-info-wrapper").append(strike);
                                }

                                if (currentPrice <= parseFloat(bsoPrice)) {
                                    let strike = '<div class="badge bg-info below-strike-one strike-info">BSO</div>'
                                    that.find(".item-info-wrapper").append(strike);
                                }

                                if (currentPrice <= parseFloat(vixDDLower)) {
                                    let strike = '<div class="badge bg-info below-strike-one strike-info">VIXL</div>'
                                    that.find(".item-info-wrapper").append(strike);
                                }

                                if (currentPrice >= parseFloat(vixDDUpper)) {
                                    let strike = '<div class="badge bg-info below-strike-one strike-info">VIXU</div>'
                                    that.find(".item-info-wrapper").append(strike);
                                }
                            }
                        }
                        if (name == "INDIA VIX" || name == "NIFTY 50" || name == "NIFTY BANK" || name == "SENSEX") {
                            updateStatusBar(that)
                        }
                    });
                }
            }
        }
    });
    localStorage.setItem("INSTRUMENT_LTP_PRICE", JSON.stringify(storageLtpObj));
}

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
        showDetailsOnChartPage(exhange, symbol, token);
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
    let index = 0;
    let tempName = symbol.replaceAll(" ", "-")
    tempName = tempName.replaceAll("&", "-")

    let componentColor = "#ffffff";
    if (index % 2 === 0) {
        componentColor = "#edecec";
    }

    let breakOutNineFifteen = JSON.parse(localStorage.getItem("VALID_BREAKOUT_NINE_FIFTEEN"));
    if (breakOutNineFifteen[symbol] == undefined) {
        breakOutNineFifteen[symbol] = {};
        breakOutNineFifteen[symbol]['CLOSE_9_15'] = "B/W"
    }

    let c915 = breakOutNineFifteen[symbol]['CLOSE_9_15'];
    let nineClass = (c915 === 'AST' || c915 === 'ASO') ? 'sv-badge sv-badge-green'
                  : (c915 === 'BST' || c915 === 'BSO') ? 'sv-badge sv-badge-red'
                  : 'sv-badge sv-badge-muted';

    let html = ''

    // Outer wrapper — dark flex row matching grootTradeBot card style
    html += '<div id="individual-stock-popup-window" style="display:flex;height:100%;background:var(--gtb-bg,#0d1117);overflow:hidden;">'

    // ── Column 1: Chart ──────────────────────────────────────────────────────
    html += '<div class="sv-stock-col" style="flex:1;min-width:0;">'
    html += '<div class="sv-card-header">'
    html += '  <div class="sv-header-left">'
    html += '    <button class="sv-icon-btn show-info" data-index="0" data-name="' + symbol + '" title="Info">i</button>'
    html += '  </div>'
    html += '  <div class="sv-header-title">' + symbol + '&nbsp;<span id="' + tempName + '-ltp" style="font-size:0.68rem;font-weight:900;font-variant-numeric:tabular-nums;"></span></div>'
    html += '  <div class="sv-header-right"><span class="' + nineClass + '">' + c915 + '</span></div>'
    html += '</div>'
    html += '<div class="sv-chart-area" style="height:260px;background:var(--gtb-bg,#0d1117);">'
    html += '  <div id="' + tempName + '-chart" style="height:100%;"></div>'
    html += '</div>'
    html += '<div class="gtb-atr-row">'
    html += '  <div id="' + tempName + '-atr-sl"></div>'
    html += '</div>'
    html += '</div>'

    // ── Column 2: OI / OBV ──────────────────────────────────────────────────
    html += '<div class="sv-stock-col" style="flex:1;min-width:0;">'
    html += '<div class="sv-card-header">'
    html += '  <div class="sv-header-left">'
    html += '    <button class="sv-icon-btn refresh-oi-obv" data-name="' + symbol + '" title="Refresh OI"><i class="bi bi-arrow-clockwise"></i></button>'
    html += '  </div>'
    html += '  <div class="sv-header-title"><i class="bi bi-bar-chart-fill"></i> OI / OBV</div>'
    html += '  <div class="sv-header-right">'
    html += '    <span title="OI Score" id="' + tempName + '-oi-score" style="font-size:0.58rem;"></span>'
    html += '    <span id="' + tempName + '-pcr-probability" style="font-size:0.58rem;"></span>'
    html += '  </div>'
    html += '</div>'
    html += '<div class="sv-oi-body" style="height:260px;overflow-y:auto;background:var(--gtb-bg,#0d1117);padding:4px;">'
    html += '  <div id="' + tempName + '-oi"></div>'
    html += '  <div id="' + tempName + '-oi-signal-row" style="padding:0 4px;"></div>'
    html += '  <div id="' + tempName + '-obv"></div>'
    html += '  <div id="' + tempName + '-component-oi-list-table" class="sv-oi-table"></div>'
    html += '</div>'
    html += '</div>'

    // ── Column 3: Futures ───────────────────────────────────────────────────
    html += '<div class="sv-stock-col" style="flex:1;min-width:0;">'
    html += '<div class="sv-card-header">'
    html += '  <div class="sv-header-left"></div>'
    html += '  <div class="sv-header-title" id="futures-chart-' + tempName + '"><i class="bi bi-rocket-takeoff"></i> FUTURES</div>'
    html += '  <div class="sv-header-right">'
    html += '    <span id="' + tempName + '-futures-premium" style="font-size:0.58rem;"></span>'
    html += '  </div>'
    html += '</div>'
    html += '<div class="sv-fut-body" style="height:260px;overflow-y:auto;background:var(--gtb-bg,#0d1117);padding:6px;">'
    html += '  <div id="' + tempName + '-futures"></div>'
    html += '  <div title="VWAP Trend" id="' + tempName + '-futures-vwap" style="margin-top:4px;"></div>'
    html += '  <div title="Future trend" id="' + tempName + '-futures-trend" style="margin-top:4px;"></div>'
    html += '</div>'
    html += '</div>'

    html += '</div>'

    // Title bar content
    let title = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
    title += '<span style="font-size:0.7rem;font-weight:800;color:#e6edf3;white-space:nowrap;">'
    title += '<i class="bi bi-graph-up-arrow"></i> ' + symbol + ' — Individual View'
    title += '</span>'
    title += '<input checked title="Enable auto-refresh" type="checkbox" id="enable-auto-refresh-individual" style="cursor:pointer;vertical-align:middle;">'
    title += popupWinControls("popup-custom-style-groot-trade-bot-stock")
    title += '</div>'

    showPopUpWindow('groot-trade-bot-stock', html, symbol, 1000, 320);
    let divId = "popup-custom-style-groot-trade-bot-stock";
    jQ("." + divId).find(".popupwindow_titlebar_text").html(title);
    hideNativePopupButtons(divId);
    await showTopChart(symbol);
    await showPrictionProbabilty(symbol)
    showOIOBVBarChart(symbol);
    let res = await showFutureDetails(symbol);
    setFutureDetails(symbol, res);
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
                    callSackBarInfo(`AT status ${status}`);
                    alert(data.data.access_token)
                    g_config.set('api_access_token', data.data.access_token);
                    redirectToDashboard()
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

async function redirectToDashboard() {
     await callSleepForAWhile(2000)
    window.location.href = "https://kite.zerodha.com/dashboard";
}