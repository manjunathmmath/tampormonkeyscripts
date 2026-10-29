// ── Auto-pilot (v29.417) ─────────────────────────────────────────────────────────────────────────────────────────────────
// Runs the morning routine and the 5-minute refresh on its own, so the only manual work is Settings (today's current / previous
// day, and the Kite Connect api_key + api_access_token). Every step is a call the buttons already make; nothing here places or
// changes an order. State for the day lives in localStorage.GTB_AP_STATE, so a page reload or a late start catches up in order.
//
//   1. new trading day  -> clear the daily caches (what Data Settings > Clear Storage does, but keeping TRADES / ORDERBOOK)
//   2. from 09:16       -> Load Prices (open / previous close; from the live ticks where available, REST for the rest) + the LTP scan
//   3. from 09:20:15    -> the 9:15 scan (first 5-minute candle, once it has closed)
//   4. once 3 is done   -> open the dashboard (Settings: autopilot_open_dashboard) and run a refresh for every 5-minute slot up to 15:30,
//                          4 s after the candle closes with the live feed up (10 s without it)
// Idle (with a notice) when Settings' current day is not today, on weekends and NSE holidays, and outside 08:50-15:35. The live feed
// connects by itself (liveFeed.js); without a valid token every step still runs, over REST. The tab must stay open: a hidden tab
// has its timers slowed by the browser, which can delay a step by up to about a minute.
// Console: _apStatus()
var _AP = { busy: false, msg: 'not started', lastSlot: null, tick: 0, dateWarned: false };
var _AP_STATE_KEY = 'GTB_AP_STATE';

function _apOn() { return typeof AUTOPILOT === 'undefined' ? true : !!AUTOPILOT; }
function _apOpenDash() { return typeof AUTOPILOT_OPEN_DASH === 'undefined' ? true : !!AUTOPILOT_OPEN_DASH; }
function _apNow() {
    var d = _lcIst(Date.now());
    return { day: _lcDay(Date.now()), min: d.getUTCHours() * 60 + d.getUTCMinutes(), sec: d.getUTCSeconds(), dow: d.getUTCDay() };
}
function _apHHMM(t) { return _lcPad(Math.floor(t.min / 60)) + ':' + _lcPad(t.min % 60); }
function _apLoad(day) {
    var st = null;
    try { st = JSON.parse(localStorage.getItem(_AP_STATE_KEY)); } catch (e) {}
    return (st && st.day === day) ? st : { day: day };
}
function _apSave(st) { try { localStorage.setItem(_AP_STATE_KEY, JSON.stringify(st)); } catch (e) {} }
function _apSay(msg) { _AP.msg = msg; try { if (typeof _gtbProgress === 'function' && /^Auto-pilot/.test(msg)) _gtbProgress(msg); } catch (e) {} }
function _apToast(msg, kind) { try { if (typeof _gtbToast === 'function') _gtbToast('Auto-pilot: ' + msg, kind || 'info'); } catch (e) {} }

// Same keys as Data Settings > Clear Storage (utils.js clearLocalStorage), without the placed-order records.
function _apResetCaches() {
    var keep = {};
    ['TRADES', 'ORDERBOOK'].forEach(function (k) { var v = localStorage.getItem(k); if (v !== null) keep[k] = v; });
    clearLocalStorage();
    Object.keys(keep).forEach(function (k) { try { localStorage.setItem(k, keep[k]); } catch (e) {} });
    try { if (typeof _lcClear === 'function') _lcClear(); } catch (e) {}
}
// What the day depends on, read from Settings: the trading dates, and every expiry field (NIFTY / SENSEX / BANK NIFTY options, F&O stock
// options, futures month, MCX futures / options expiries).
function _apSigs() {
    var dates = ['CURRENT=' + (typeof CURRENT_DAY !== 'undefined' ? CURRENT_DAY : ''), 'PREVIOUS=' + (typeof PREVIOUS_DAY !== 'undefined' ? PREVIOUS_DAY : '')];
    var exp = [];
    try {
        _gtbCfgFieldGroups().forEach(function (g) {
            g.fields.forEach(function (f) {
                var v; try { v = g_config.get(f.key); } catch (e) { return; }
                if (/^(mcx_)?(current|previous)_day_date$/.test(f.key)) dates.push(f.key + '=' + v);
                else if (/expiry/.test(f.key)) exp.push(f.key + '=' + v);
            });
        });
    } catch (e) {}
    return { dates: dates.join('|'), exp: exp.join('|') };
}
// Caches that are keyed by the underlying name (and the day) but were built from one specific futures / options contract.
function _apDropExpiryCaches() {
    var n = 0, keys = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k) keys.push(k); }
    keys.forEach(function (k) {
        if (/^GTB_SQZ_STUDY_|^GTB_SQUEEZE_STREAK|^GTB_OI_SNAP|^OSS_SCAN_LAST$/.test(k)) { try { localStorage.removeItem(k); n++; } catch (e) {} }
    });
    try { if (typeof _lcClear === 'function') { _lcClear(); n++; } } catch (e) {}
    return n;
}
function _apPricesComplete() {
    var g = {};
    try { g = JSON.parse(localStorage.getItem('INSTRUMENT_LIST_GLOBAL')) || {}; } catch (e) {}
    var names = Object.keys(INSTRUMENT_TOKENS), have = names.filter(function (n) { return g[n] && g[n].price; }).length;
    return names.length > 0 && have >= names.length * 0.9;
}
function _apNineFifteenDone() {
    var b = {};
    try { b = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN')) || {}; } catch (e) {}
    return Object.keys(b).length >= 10;
}

async function _apTick() {
    if (!_apOn() || _AP.busy) return;
    var t = _apNow();
    if (t.dow < 1 || t.dow > 5) { _apSay('weekend'); return; }
    if (t.min < 8 * 60 + 50 || t.min > 15 * 60 + 35) { _apSay('outside market hours'); return; }
    // The routine is for the real current trading day. A past day in Settings means a replay / backtest, which must stay on history.
    var cur = String(typeof CURRENT_DAY !== 'undefined' ? CURRENT_DAY : '').slice(0, 10);
    if (cur !== t.day) {
        _apSay('idle: Settings current day is ' + cur + ', today is ' + t.day);
        if (!_AP.dateWarned && typeof _gtbApiFail === 'function') {
            _AP.dateWarned = true;
            _gtbApiFail('autopilot-date', 'Auto-pilot is idle', 'Settings current day is ' + cur + ' but today is ' + t.day, 'Set the current and previous trading day in Settings to run the morning routine and refreshes automatically');
        }
        return;
    }
    if (_AP.dateWarned) { _AP.dateWarned = false; try { if (typeof _gtbApiOk === 'function') _gtbApiOk('autopilot-date'); } catch (e) {} }

    _AP.busy = true;
    try {
        var st = _apLoad(t.day);

        if (!st.holidayChecked) {
            try { if (typeof _gtbFetchHolidays === 'function') await _gtbFetchHolidays(); } catch (e) {}
            st.holidayChecked = true; _apSave(st);
        }
        var hol = null; try { hol = (typeof _gtbTodayHoliday === 'function') ? _gtbTodayHoliday() : null; } catch (e) {}
        if (hol) { _apSay('NSE holiday: ' + (hol.description || hol.date || '')); return; }

        // 0. Settings changed since the last tick of this day (saving Settings reloads the page, so this is seen on the first tick after it).
        var sig = _apSigs();
        if (st.dateSig !== undefined && st.dateSig !== sig.dates) {
            // a trading day was edited: prices (previous close), the 9:15 levels and everything built on them are suspect -> redo the routine
            _apToast('trading dates changed in Settings, redoing the morning routine', 'warning');
            st = { day: t.day, holidayChecked: true };
        } else if (st.expSig !== undefined && st.expSig !== sig.exp) {
            // only an expiry was edited: the option / futures contracts changed. Caches keyed by the underlying but built from the old
            // contract must go, and a refresh is run now instead of waiting for the next slot.
            var gone = _apDropExpiryCaches();
            _apToast('expiry changed in Settings, ' + gone + ' cached item(s) cleared, refreshing now', 'warning');
            window._GTB_LAST_REFRESH_AT = 0; _AP.lastSlot = null;
        }
        st.dateSig = sig.dates; st.expSig = sig.exp; _apSave(st);

        // 1. new day: clear the daily caches
        if (!st.reset) {
            _apSay('Auto-pilot: new day, clearing the daily caches');
            _apResetCaches();
            st.reset = _apHHMM(t); _apSave(st);
            _apToast('new trading day, daily caches cleared');
        }

        // 2. prices (open / previous close, India VIX quote, LTP)
        if (!st.prices) {
            if (t.min < 9 * 60 + 16) { _apSay('waiting for 09:16 (market open) to load prices'); return; }
            if ((st.priceTries || 0) >= 4) { _apSay('prices: gave up after 4 tries, use Data Settings > Load Prices'); }
            else {
                st.priceTries = (st.priceTries || 0) + 1; _apSave(st);
                _apSay('Auto-pilot: loading prices (' + (_lfHealthy() ? 'live feed + REST for the rest' : 'REST') + ')');
                await loadOpenPrice({ silent: true });
                if (_apPricesComplete()) { st.prices = _apHHMM(_apNow()); _apSave(st); _apToast('prices loaded', 'success'); }
                else { _apSay('prices incomplete, will retry'); return; }
            }
        }

        // 3. 9:15 scan, once the first 5-minute candle has closed
        if (st.prices && !st.nine15) {
            if (t.min < 9 * 60 + 20 || (t.min === 9 * 60 + 20 && t.sec < 15)) { _apSay('waiting for the 09:15 candle to close'); return; }
            if ((st.scanTries || 0) >= 5) { _apSay('9:15 scan: gave up after 5 tries, use Data Settings > 9:15 SCAN'); }
            else {
                st.scanTries = (st.scanTries || 0) + 1; _apSave(st);
                _apSay('Auto-pilot: running the 9:15 scan');
                if (!_apNineFifteenDone()) { try { localStorage.removeItem('VALID_BREAKOUT_NINE_FIFTEEN'); } catch (e) {} await scanNineFifteenCandle(); }
                if (_apNineFifteenDone()) { st.nine15 = _apHHMM(_apNow()); _apSave(st); }
                else { _apSay('9:15 scan returned no data, will retry'); return; }
            }
        }

        // 4. dashboard + a refresh for every 5-minute slot
        if (st.nine15) {
            // Opened once per day. If you close it afterwards the refreshes pause (they need the dashboard) until you open it again.
            // (once per page load, so a reload after saving Settings brings it back)
            if (_apOpenDash() && !_AP.dashOpened && !jQ('#gtb-popup-win').length) { showGrootTradeBot(); _AP.dashOpened = true; _apToast('dashboard opened'); }
            if (!jQ('#main-trade-bot-container').length) { _apSay('dashboard is closed: open Groot to resume the 5-minute refreshes'); return; }
            var slotMin = Math.floor(t.min / 5) * 5;
            if (slotMin > 15 * 60 + 30) { _apSay('market closed: refreshes stopped'); return; }
            var slotKey = t.day + ' ' + slotMin;
            var since = (t.min - slotMin) * 60 + t.sec;
            var delay = (typeof _lfHealthy === 'function' && _lfHealthy() && _lfLiveAllowed()) ? 4 : 10;
            var slotStartMs = Math.floor(Date.now() / 300000) * 300000;
            var already = window._GTB_LAST_REFRESH_AT && window._GTB_LAST_REFRESH_AT >= slotStartMs;      // the timer / a click already refreshed this slot
            if (_AP.lastSlot === slotKey || already) { _AP.lastSlot = slotKey; _apSay('next refresh at ' + _lcPad(Math.floor((slotMin + 5) / 60)) + ':' + _lcPad((slotMin + 5) % 60)); return; }
            if (since < delay) { _apSay('waiting for the ' + _lcPad(Math.floor(slotMin / 60)) + ':' + _lcPad(slotMin % 60) + ' candle to settle'); return; }
            var busyRefresh = false; try { busyRefresh = typeof _GTB_REFRESH_IN_PROGRESS !== 'undefined' && _GTB_REFRESH_IN_PROGRESS; } catch (e) {}
            if (busyRefresh) { _apSay('a refresh is already running'); return; }
            _AP.lastSlot = slotKey;
            st.refreshes = (st.refreshes || 0) + 1; st.lastRefresh = _apHHMM(t); _apSave(st);
            _apSay('Auto-pilot: refresh for the ' + _lcPad(Math.floor(slotMin / 60)) + ':' + _lcPad(slotMin % 60) + ' candle');
            await autoRefreshEachTabs(null, true);
            _apSay('refresh done ' + _apHHMM(_apNow()));
        }
    } catch (e) {
        _AP.msg = 'error: ' + (e && e.message ? e.message : e);
        try { console.log('[auto-pilot]', e); } catch (e2) {}
    } finally {
        _AP.busy = false;
    }
}

function _apStatus() {
    var t = _apNow(), st = _apLoad(t.day);
    var o = { enabled: _apOn(), now: t.day + ' ' + _apHHMM(t), message: _AP.msg, busy: _AP.busy, steps: st, feed: (typeof _LF !== 'undefined' ? _LF.status : 'n/a') };
    try { console.table([o]); console.log(st); } catch (e) {}
    return o;
}
setInterval(function () { try { _apTick(); } catch (e) {} }, 2000);
