// ── Live feed manager (v29.415) ──────────────────────────────────────────────────────────────────────────────────────────
// Sits on top of quoteWs.js (socket + binary tick parser) and turns the Kite ticker into the app's live price source:
//   * connects on its own to the official Kite Connect ticker (api_key + access_token from Settings; Settings: live_feed_auto)
//     and reconnects with back-off. There is no fallback source: an expired token shows the "live feed is down" notice.
//   * LIVE CANDLE CACHE (v29.416, section below): the first 5-minute history request for a token is fetched from REST as before,
//     then the token is kept live from its ticks and later requests are answered locally. Every metric that reads history through
//     getHistoricalDataUsingPromise (futures REMARK, squeeze scan, OI/OBV, max pain, IV skew, advance/decline) therefore becomes
//     live with no change of its own, and a refresh stops waiting on the network.
//   * subscribes to every spot / index in INSTRUMENT_TOKENS, the MCX core and the index / heavyweight FUTURES in 'full' mode.
//   * keeps LIVE_TICKS (spot / index) and LIVE_FUT (futures: ltp, day VWAP, OI, day OHLC) in memory, nothing re-fetched.
//   * writes INSTRUMENT_LTP_PRICE (localStorage) at most once a second and redraws the topbar / status bar then.
//   * lets scanLtpPrice() (script.js) skip every instrument that already has a live tick, so a refresh only fetches the rest.
// A snapshot / replay time (_gtbHistTime) switches live LTP writing off: the dashboard then keeps showing that moment.
// Console: _lfStatus() prints the state, _lfConnect(true) / _lfDisconnect() start and stop it by hand.
var LIVE_TICKS = {};   // spot / index name -> { ltp, open, high, low, prevClose, vol, avg, recv }
var LIVE_FUT = {};     // display name ('NIFTY 50', 'RELIANCE', ...) -> { ltp, open, high, low, prevClose, vol, avg (day VWAP), oi, oiHigh, oiLow, recv }
var _LF = {
    status: 'idle',        // idle | connecting | connected | error
    source: null,          // 'connect' | 'web'
    manualStop: false,     // true after the user disconnected: no auto reconnect until they connect again
    tries: 0,              // consecutive failed attempts, drives the back-off
    nextTry: 0,            // earliest time of the next automatic attempt
    connectedAt: 0,
    lastTick: 0,
    ticks: 0,              // ticks since connect
    detail: '',
    futTok: {},            // futures token -> display name
    sent: {},              // tokens already subscribed on the current socket
    ltpDirty: {}           // name -> ltp waiting for the next localStorage flush
};
var _LF_BACKOFF = [2000, 4000, 8000, 15000, 30000, 60000];
var _LF_STALE_MS = 25000;

function _lfAutoOn() { return typeof LIVE_FEED_AUTO === 'undefined' ? true : !!LIVE_FEED_AUTO; }
function _lfInWindow() {
    var d = new Date(), day = d.getDay(), m = d.getHours() * 60 + d.getMinutes();
    return day >= 1 && day <= 5 && m >= 8 * 60 + 55 && m <= 23 * 60 + 59;
}
function _lfInNseSession() {
    var d = new Date(), day = d.getDay(), m = d.getHours() * 60 + d.getMinutes();
    return day >= 1 && day <= 5 && m >= 9 * 60 + 17 && m <= 15 * 60 + 29;
}
function _lfSocketOpen() { return typeof _QW_WS !== 'undefined' && _QW_WS && _QW_WS.readyState === WebSocket.OPEN; }
function _lfHealthy() { return _LF.status === 'connected' && _lfSocketOpen() && (Date.now() - _LF.lastTick) < _LF_STALE_MS; }
// A name counts as live once it has had a tick on this connection (Kite sends one straight after subscribing, and a name that
// has not traded recently still has the right last price) and the socket as a whole is still delivering.
function _lfHas(name) {
    var o = LIVE_TICKS[name];
    return !!(o && o.ltp && o.recv >= _LF.connectedAt && _lfHealthy() && _lfLiveAllowed());
}
// Live data only describes the real current trading day. When Settings' current_day_date points at an earlier day (a replay /
// backtest of a past session) or a snapshot time is set, the dashboard must keep reading history, never live ticks.
function _lfLiveAllowed() {
    try { if (typeof _gtbHistTime === 'function' && _gtbHistTime()) return false; } catch (e) {}
    try {
        var real = _lcDay(Date.now()), cur = (typeof CURRENT_DAY !== 'undefined') ? String(CURRENT_DAY).slice(0, 10) : real;
        var mcx = (typeof MCX_CURRENT_DAY !== 'undefined' && MCX_CURRENT_DAY) ? String(MCX_CURRENT_DAY).slice(0, 10) : cur;
        return cur === real || mcx === real;
    } catch (e) { return true; }
}

// ── Tick intake ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function _lfMarkLtp(name, ltp) { _LF.ltpDirty[name] = ltp; }
function _lfOnTicks(ticks) {
    var now = Date.now();
    _LF.lastTick = now;
    for (var i = 0; i < ticks.length; i++) {
        var t = ticks[i];
        _LF.ticks++;
        var fut = _LF.futTok[t.token];
        if (fut) {
            var f = LIVE_FUT[fut] || (LIVE_FUT[fut] = {});
            f.ltp = t.ltp; f.open = t.open; f.high = t.high; f.low = t.low; f.prevClose = t.close; f.vol = t.volume;
            f.avg = t.avgPrice; f.oi = t.oi; f.oiHigh = t.oiHigh; f.oiLow = t.oiLow; f.recv = now;
            continue;
        }
        var name = (typeof _qwTokenToName === 'function') ? _qwTokenToName(t.token) : null;
        if (!name) continue;
        var o = LIVE_TICKS[name] || (LIVE_TICKS[name] = {});
        o.ltp = t.ltp; o.open = t.open; o.high = t.high; o.low = t.low; o.prevClose = t.close; o.vol = t.volume; o.avg = t.avgPrice; o.recv = now;
    }
}

// Writes the pending live prices into the INSTRUMENT_LTP_PRICE localStorage object (the copy the rest of the app reads) and
// redraws the price strips. Once a second at most, not per tick.
function _lfFlushLtp() {
    var names = Object.keys(_LF.ltpDirty);
    if (!names.length) return;
    if (!_lfLiveAllowed()) { _LF.ltpDirty = {}; return; }
    var dirty = _LF.ltpDirty;
    _LF.ltpDirty = {};
    var cache = {};
    try { cache = JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE')) || {}; } catch (e) { cache = {}; }
    names.forEach(function (n) { cache[n] = { name: n, ltp: dirty[n] }; });
    if (typeof _gtbLsSet === 'function') _gtbLsSet('INSTRUMENT_LTP_PRICE', JSON.stringify(cache));
    else { try { localStorage.setItem('INSTRUMENT_LTP_PRICE', JSON.stringify(cache)); } catch (e) {} }
    try { if (typeof updateTopBarTickers === 'function') updateTopBarTickers(); } catch (e) {}
    try { if (typeof updateStatusBarFromApi === 'function') updateStatusBarFromApi(cache); } catch (e) {}
}

// ── Subscriptions ───────────────────────────────────────────────────────────────────────────────────────────────────────
function _lfFutNames() {
    // display name -> futures underlying name in FUTURE_INTRUMENT_LIST
    var out = { 'NIFTY 50': 'NIFTY', 'NIFTY BANK': 'BANKNIFTY', 'SENSEX': 'SENSEX' };
    try { Object.keys(NIFTY_50_WEIGHTED_STOCKS).forEach(function (n) { out[n] = n; }); } catch (e) {}
    try { Object.keys(NIFTY_BANK_WEIGHTED_STOCKS).forEach(function (n) { out[n] = n; }); } catch (e) {}
    return out;
}
// Fills _QW_SUBSCRIBED (token -> name) with everything the live feed should carry. Safe to call again: it only adds.
function _lfBuildSubs() {
    try { Object.keys(INSTRUMENT_TOKENS).forEach(function (n) { _QW_SUBSCRIBED[INSTRUMENT_TOKENS[n]] = n; }); } catch (e) {}
    try { _qwDefaultSubscribeList(); } catch (e) {}            // heavyweight stocks + MCX core, same lists the WebSocket popup uses
    try {
        var want = _lfFutNames();
        var list = (typeof FUTURE_INTRUMENT_LIST !== 'undefined') ? FUTURE_INTRUMENT_LIST : [];
        Object.keys(want).forEach(function (disp) {
            var row = list.find(function (f) { return f.name === want[disp]; });
            if (!row || !row.instrument_token) return;
            _LF.futTok[Number(row.instrument_token)] = disp;
            _QW_SUBSCRIBED[row.instrument_token] = 'FUT ' + disp;
        });
    } catch (e) {}
}
// Subscribes tokens that were added after the socket opened (the instrument lists load a little after the page does).
function _lfSyncSubs() {
    if (!_lfSocketOpen()) return;
    _lfBuildSubs();
    var fresh = Object.keys(_QW_SUBSCRIBED).filter(function (t) { return !_LF.sent[t]; });
    if (!fresh.length) return;
    var toks = fresh.map(Number);
    for (var i = 0; i < toks.length; i += 250) {
        var part = toks.slice(i, i + 250);
        _QW_WS.send(JSON.stringify({ a: 'subscribe', v: part }));
        _QW_WS.send(JSON.stringify({ a: 'mode', v: ['full', part] }));
    }
    fresh.forEach(function (t) { _LF.sent[t] = 1; });
}

// ── Connection ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function _lfToast(msg, kind) { try { if (typeof _gtbToast === 'function') _gtbToast(msg, kind || 'info'); } catch (e) {} }

function _lfOpen() {
    _LF.status = 'connecting'; _LF.source = 'connect'; _LF.detail = ''; _LF.sent = {};
    _lfBuildSubs();
    _lfRenderStatus();
    _qwWsConnect(function (status, detail, src, opened) {
        if (status === 'connected') {
            _LF.status = 'connected'; _LF.tries = 0; _LF.connectedAt = Date.now(); _LF.lastTick = Date.now(); _LF.ticks = 0;
            Object.keys(_QW_SUBSCRIBED).forEach(function (t) { _LF.sent[t] = 1; });
            try { _lcResubscribe(); } catch (e) {}
            _lfToast('Live feed connected - ' + Object.keys(_QW_SUBSCRIBED).length + ' instruments', 'success');
            try { if (typeof _gtbApiOk === 'function') _gtbApiOk('live-feed'); } catch (e) {}
            _lfRenderStatus();
            return;
        }
        if (status === 'error' && src) { _LF.detail = detail; return; }     // the matching 'closed' event follows and does the handling
        // 'closed', or an error before any socket existed (no token)
        _LF.detail = detail || _LF.detail;
        if (_LF.manualStop) { _LF.status = 'idle'; _lfRenderStatus(); return; }
        _LF.status = 'error';
        _LF.tries++;
        _LF.nextTry = Date.now() + _LF_BACKOFF[Math.min(_LF.tries - 1, _LF_BACKOFF.length - 1)];
        if (_LF.tries === 1 || _LF.tries === 6) _lfToast('Live feed disconnected (' + _LF.detail + ') - retrying', 'error');
        if (typeof _gtbApiFail === 'function' && _LF.tries >= 3) _gtbApiFail('live-feed', 'Live price feed is down', _LF.detail || 'cannot connect', 'Prices fall back to the normal refresh');
        _lfRenderStatus();
    });
}
function _lfConnect(manual) {
    if (manual) { _LF.manualStop = false; _LF.tries = 0; _LF.nextTry = 0; }
    if (_LF.status === 'connecting' || _lfSocketOpen()) return;
    _lfOpen();
}
function _lfDisconnect() {
    _LF.manualStop = true;
    _LF.status = 'idle';
    try { if (typeof _qwWsDisconnect === 'function') _qwWsDisconnect(); } catch (e) {}
    _lfRenderStatus();
}
function _lfToggle() {
    if (_LF.status === 'connecting' || _lfSocketOpen()) { _lfDisconnect(); _lfToast('Live feed stopped', 'info'); }
    else _lfConnect(true);
}

// ── Status icon (#gtb-ws-toggle) ───────────────────────────────────────────────────────────────────────────────────────
function _lfAgeText() {
    if (!_LF.lastTick) return 'no ticks yet';
    var s = Math.round((Date.now() - _LF.lastTick) / 1000);
    return s < 2 ? 'just now' : s + 's ago';
}
function _lfRenderStatus() {
    var $b = jQ('#gtb-ws-toggle');
    if (!$b.length) return;
    var color = '', title;
    if (_LF.status === 'connected') {
        var stale = !_lfHealthy() && _lfInNseSession();
        color = stale ? 'var(--gtb-amber, #f0a000)' : 'var(--gtb-green, #3fb950)';
        title = 'Live feed: ' + (stale ? 'connected but no ticks (' + _lfAgeText() + ')' : 'connected, last tick ' + _lfAgeText())
            + ' - ' + Object.keys(LIVE_TICKS).length + ' spot, ' + Object.keys(LIVE_FUT).length + ' futures, ' + _lcCount() + ' candle series kept live. Click to disconnect';
    } else if (_LF.status === 'connecting') {
        color = 'var(--gtb-amber, #f0a000)'; title = 'Live feed: connecting...';
    } else if (_LF.status === 'error') {
        color = 'var(--gtb-red, #f85149)'; title = 'Live feed: ' + (_LF.detail || 'error') + ' - retrying. Click to retry now';
    } else {
        title = _LF.manualStop ? 'Live feed: off (you disconnected). Click to connect' : 'Live feed: click to connect';
    }
    $b.attr('title', title).css('color', color);
}

// ── Scheduler: flush prices every second, watch health and reconnect every few seconds ────────────────────────────────────
var _LF_WATCH_N = 0;
setInterval(function () {
    try {
        _lfFlushLtp();
        _LF_WATCH_N++;
        if (_LF_WATCH_N % 2) return;                       // the rest runs every 2 s
        if (_LF.status === 'connected') {
            if (!_lfSocketOpen()) {                          // dropped without us hearing about it (for example the popup replaced the socket)
                _LF.status = 'error'; _LF.detail = 'socket closed'; _LF.tries = 1; _LF.nextTry = Date.now() + 2000;
            } else if (_lfInNseSession() && Date.now() - _LF.lastTick > _LF_STALE_MS * 2) {
                _LF.detail = 'no ticks for ' + Math.round((Date.now() - _LF.lastTick) / 1000) + 's';
                try { _QW_WS.close(4000); } catch (e) {}      // force the reconnect path
            } else if (_LF_WATCH_N % 10 === 0) {
                _lfSyncSubs();
            }
        } else if ((_LF.status === 'error' || _LF.status === 'idle') && !_LF.manualStop && _lfAutoOn() && _lfInWindow() && Date.now() >= _LF.nextTry) {
            _lfConnect(false);
        }
        _lfRenderStatus();
    } catch (e) {}
}, 1000);

function _lfStatus() {
    var o = {
        status: _LF.status, source: _LF.source, socketOpen: _lfSocketOpen(), healthy: _lfHealthy(), lastTick: _lfAgeText(), ticksSinceConnect: _LF.ticks,
        spotNames: Object.keys(LIVE_TICKS).length, futuresNames: Object.keys(LIVE_FUT).length, subscribed: Object.keys(_QW_SUBSCRIBED).length,
        detail: _LF.detail, tries: _LF.tries
    };
    try { console.table(o); } catch (e) {}
    return o;
}

// ── Live candle cache ───────────────────────────────────────────────────────────────────────────────────────────────────
// _LC[token] = { from: 'YYYY-MM-DD' (earliest day held), candles: [[ts,o,h,l,c,vol,(oi)],...], hasOi, state: 'pre'|'live',
//                connId, lastCum (last cumulative day volume seen), pre: [buffered ticks while the REST seed is in flight], respAt }
// Flow for a '5minute' request whose `to` is a plain date (no snapshot time) for today:
//   1. cache is live for this connection and covers `from`  -> answered locally (no network, no queue);
//   2. otherwise REST as before; before the request starts the token is subscribed so ticks are buffered during the fetch;
//      when the response arrives it becomes the seed, buffered ticks are replayed on top and the token goes live.
// Candles are built from ticks: bucket = 5-minute slot of the exchange timestamp, open = first tick, high/low/close tracked,
// volume = growth of the cumulative day volume, OI = last tick's OI. The candle that was forming when a token was first loaded can
// be a little low on volume (ticks between the request and its response only update price). After a reconnect every series is
// stale until its next REST load. Anything else (other intervals, earlier `to`, snapshot time, feed down) always goes to REST.
var _LC = {};
var _LC_MAX = 2400;           // Kite allows 3000 per connection; keep headroom for the base list
var _LC_PRE_CAP = 120;
function _lcCount() { var n = 0; for (var k in _LC) if (_LC[k].state === 'live') n++; return n; }
function _lcIst(ms) { return new Date(ms + 19800000); }
function _lcPad(n) { return (n < 10 ? '0' : '') + n; }
function _lcDay(ms) { var d = _lcIst(ms); return d.getUTCFullYear() + '-' + _lcPad(d.getUTCMonth() + 1) + '-' + _lcPad(d.getUTCDate()); }
function _lcBucket(ms) {
    var d = _lcIst(ms), m = Math.floor(d.getUTCMinutes() / 5) * 5;
    return d.getUTCFullYear() + '-' + _lcPad(d.getUTCMonth() + 1) + '-' + _lcPad(d.getUTCDate()) + 'T' + _lcPad(d.getUTCHours()) + ':' + _lcPad(m) + ':00+0530';
}
function _lcDate(s) { return String(s || '').slice(0, 10); }
function _lcTickMs(t, now) {
    if (t.ts && Math.abs(t.ts * 1000 - now) < 120000) return t.ts * 1000;
    return now;
}
function _lcToday() { return _lcDay(Date.now()); }
function _lcIsDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function _lcEligible(code, from, to, interval) {
    if (interval !== '5minute' || !_lfHealthy() || !_lfLiveAllowed()) return false;
    if (!_lcIsDate(from) || !_lcIsDate(to)) return false;               // a snapshot time makes `to` carry a time: always REST
    try { if (typeof _gtbHistTime === 'function' && _gtbHistTime()) return false; } catch (e) {}
    var today = _lcToday(), mcx = (typeof MCX_CURRENT_DAY !== 'undefined') ? _lcDate(MCX_CURRENT_DAY) : today;
    return to === today || to === mcx;
}
function _lcSend(tokens) {
    if (!_lfSocketOpen() || !tokens.length) return;
    for (var i = 0; i < tokens.length; i += 250) {
        var part = tokens.slice(i, i + 250);
        _QW_WS.send(JSON.stringify({ a: 'subscribe', v: part }));
        _QW_WS.send(JSON.stringify({ a: 'mode', v: ['full', part] }));
    }
}
function _lcResubscribe() {                     // after a reconnect: every series goes stale, ticks for it start buffering again
    var toks = [];
    Object.keys(_LC).forEach(function (k) { var st = _LC[k]; st.state = 'pre'; st.pre = []; st.lastCum = null; toks.push(Number(k)); });
    _lcSend(toks);
}
// Called from getHistoricalDataUsingPromise (utils.js) before it queues a request. Returns the response or null.
function _lcServe(code, from, to, interval) {
    if (!_lcEligible(code, from, to, interval)) return null;
    var st = _LC[String(code)];
    if (!st || st.state !== 'live' || st.connId !== _LF.connectedAt || from < st.from) return null;
    var out = [];
    for (var i = 0; i < st.candles.length; i++) { if (_lcDate(st.candles[i][0]) >= from) out.push(st.candles[i].slice()); }
    return { status: 'success', data: { candles: out }, _live: true };
}
// Called before a REST request starts: subscribes the token so ticks are buffered while the request is in flight.
function _lcPrepare(code, from, to, interval) {
    if (!_lcEligible(code, from, to, interval)) return false;
    var k = String(code), st = _LC[k];
    if (!st) {
        if (Object.keys(_LC).length + Object.keys(_QW_SUBSCRIBED).length >= _LC_MAX) return false;
        st = _LC[k] = { from: from, candles: [], hasOi: false, state: 'pre', connId: null, lastCum: null, pre: [], respAt: 0 };
        _lcSend([Number(k)]);
    } else if (st.state !== 'live') {
        st.pre = []; st.lastCum = null;                                  // restart the buffer for this fetch
    }
    st.fetching = true;
    return true;
}
// Called with the REST response of a request that _lcPrepare accepted.
function _lcSeed(code, from, res) {
    var k = String(code), st = _LC[k];
    if (!st) return;
    st.fetching = false;
    var raw = res && res.data && res.data.candles;
    if (!raw || !raw.length) { return; }                                 // keeps state 'pre'; the next request tries again
    st.from = from; st.candles = raw.map(function (c) { return c.slice(); });
    st.hasOi = raw[0].length > 6; st.respAt = Date.now(); st.connId = _LF.connectedAt; st.state = 'live';
    var buf = st.pre; st.pre = [];
    var lastB = st.candles[st.candles.length - 1][0];
    for (var i = 0; i < buf.length; i++) {
        var b = buf[i];
        _lcApply(st, b.t, b.recv, b.recv > st.respAt, lastB);          // volume only from ticks after the response
    }
}
function _lcNewer(a, b) { return a > b; }                               // ISO strings of the same format compare as time
// Applies one tick to a series. `countVol` is false for ticks that may already be inside the REST seed.
function _lcApply(st, t, now, countVol) {
    var ms = _lcTickMs(t, now), b = _lcBucket(ms);
    var dv = 0;
    if (t.volume != null) {
        if (st.lastCum != null && t.volume >= st.lastCum) dv = t.volume - st.lastCum;
        st.lastCum = t.volume;
    }
    if (!countVol) dv = 0;
    var arr = st.candles, last = arr[arr.length - 1];
    if (last && last[0].slice(0, 16) === b.slice(0, 16)) {
        if (t.ltp > last[2]) last[2] = t.ltp;
        if (t.ltp < last[3]) last[3] = t.ltp;
        last[4] = t.ltp; last[5] = (last[5] || 0) + dv;
        if (st.hasOi && t.oi != null) last[6] = t.oi;
    } else if (!last || _lcNewer(b.slice(0, 16), last[0].slice(0, 16))) {
        var c = [b, t.ltp, t.ltp, t.ltp, t.ltp, dv];
        if (st.hasOi) c.push(t.oi != null ? t.oi : (last && last[6] != null ? last[6] : 0));
        arr.push(c);
        if (arr.length > 900) arr.splice(0, arr.length - 900);
        st.lastClosed = b;
    }
    // an older bucket (late tick across the boundary) is ignored
}
function _lcOnTick(t, now) {
    var st = _LC[String(t.token)];
    if (!st) return;
    if (st.state === 'live') {
        if (st.connId !== _LF.connectedAt) { st.state = 'pre'; st.pre = []; st.lastCum = null; return; }
        _lcApply(st, t, now, true);
    } else if (st.fetching || st.pre.length) {
        if (st.pre.length < _LC_PRE_CAP) st.pre.push({ t: { ltp: t.ltp, volume: t.volume, oi: t.oi, ts: t.ts }, recv: now });
    }
}

// ── Light score tick + live-vs-full comparison log ─────────────────────────────────────────────────────────────────────
// Between candles the composite only moves through what is price-driven (component scores use the live LTP). Every 2 seconds, while
// the dashboard is open, the feed healthy and the NSE session on, setScore({light:true}) recomputes it and redraws the gauge / signal
// (the OI matrices, pane re-renders and funds call stay on the 5-minute refresh). Every ~6 s it also redraws the Level Confirmation
// and Final Verdict cards. The log records, at each full refresh, the last light score against the full one, so the drift of the light
// path is visible (Tools > Live Score Log, or _lfCompare()).
var _LF_CMP = { light: null, rows: null };
var _LF_SCORE_N = 0;
function _lfCmpKey() { return 'GTB_LF_CMP_' + _lcDay(Date.now()); }
function _lfCmpRows() {
    if (!_LF_CMP.rows) { try { _LF_CMP.rows = JSON.parse(localStorage.getItem(_lfCmpKey())) || []; } catch (e) { _LF_CMP.rows = []; } }
    return _LF_CMP.rows;
}
function _lfLogScore(mode, score, signal) {
    if (!_lfLiveAllowed()) return;
    var now = Date.now();
    if (mode === 'light') { _LF_CMP.light = { t: now, score: score, signal: signal }; return; }
    var l = _LF_CMP.light;
    if (!l || now - l.t > 6 * 60000) return;                 // no recent light reading to compare against
    var rows = _lfCmpRows();
    var d = _lcIst(now);
    rows.push({ time: _lcPad(d.getUTCHours()) + ':' + _lcPad(d.getUTCMinutes()) + ':' + _lcPad(d.getUTCSeconds()),
        light: l.score, full: score, diff: parseFloat((score - l.score).toFixed(2)), sigLight: l.signal || '', sigFull: signal || '' });
    if (rows.length > 150) rows.splice(0, rows.length - 150);
    if (typeof _gtbLsSet === 'function') _gtbLsSet(_lfCmpKey(), JSON.stringify(rows));
    else { try { localStorage.setItem(_lfCmpKey(), JSON.stringify(rows)); } catch (e) {} }
    _LF_CMP.light = null;
}
function _lfCompare() {
    var rows = _lfCmpRows();
    if (!rows.length) { try { console.log('[live score] nothing logged yet today'); } catch (e) {} return null; }
    var abs = rows.map(function (r) { return Math.abs(r.diff); });
    var sum = {
        n: rows.length,
        avgAbsDiff: parseFloat((abs.reduce(function (a, b) { return a + b; }, 0) / rows.length).toFixed(2)),
        maxAbsDiff: Math.max.apply(null, abs),
        signalChanged: rows.filter(function (r) { return r.sigLight !== r.sigFull; }).length
    };
    try { console.table(rows); console.log(sum); } catch (e) {}
    return { rows: rows, summary: sum };
}
function _lfScoreTick() {
    if (!_lfHealthy() || !_lfLiveAllowed() || !_lfInNseSession()) return;
    if (typeof setScore !== 'function') return;
    try { if (typeof _GTB_REFRESH_IN_PROGRESS !== 'undefined' && _GTB_REFRESH_IN_PROGRESS) return; } catch (e) {}
    if (!jQ('#trend-scoreboard').length || !jQ('#main-trade-bot-container:visible').length) return;
    _LF_SCORE_N++;
    try { setScore({ light: true, cards: _LF_SCORE_N % 3 === 0 }); } catch (e) { try { console.log('[live score] light tick failed', e); } catch (e2) {} }
}
function _lfShowScoreLog() {
    var rows = _lfCmpRows(), abs = rows.map(function (r) { return Math.abs(r.diff); });
    var avg = rows.length ? (abs.reduce(function (a, b) { return a + b; }, 0) / rows.length).toFixed(2) : '-';
    var mx = rows.length ? Math.max.apply(null, abs).toFixed(2) : '-';
    var chg = rows.filter(function (r) { return r.sigLight !== r.sigFull; }).length;
    var body = rows.slice().reverse().map(function (r) {
        var col = r.diff > 0 ? 'var(--gtb-green)' : r.diff < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
        return '<tr><td>' + r.time + '</td><td style="text-align:right;">' + r.light + '</td><td style="text-align:right;">' + r.full + '</td>'
            + '<td style="text-align:right;color:' + col + ';font-weight:700;">' + (r.diff > 0 ? '+' : '') + r.diff + '</td>'
            + '<td>' + r.sigLight + '</td><td' + (r.sigLight !== r.sigFull ? ' style="color:var(--gtb-amber);font-weight:700;"' : '') + '>' + r.sigFull + '</td></tr>';
    }).join('');
    var html = '<div style="padding:10px;font-size:0.72rem;color:var(--gtb-text);height:100%;overflow:auto;box-sizing:border-box;">'
        + '<div style="color:var(--gtb-muted);line-height:1.5;margin-bottom:8px;">At every full 5-minute refresh: the last <b>live</b> (light) composite score against the <b>full</b> recompute. '
        + 'The light score moves with the live price between candles; the full one also brings in the new candle (futures remark, OI/OBV, advance/decline, max pain, IV skew). '
        + 'A large or frequent gap means the light score misses a lot between candles. Today only, kept for the day.</div>'
        + '<div style="margin-bottom:8px;"><b>' + rows.length + '</b> comparisons &middot; average gap <b>' + avg + '</b> &middot; largest <b>' + mx + '</b> &middot; signal changed at the refresh <b>' + chg + '</b> time(s)</div>'
        + '<table style="width:100%;border-collapse:collapse;" class="gtb-score-table"><thead><tr><th style="text-align:left;">Time</th><th style="text-align:right;">Live</th><th style="text-align:right;">Full</th><th style="text-align:right;">Gap</th><th style="text-align:left;">Live signal</th><th style="text-align:left;">Full signal</th></tr></thead><tbody>'
        + (body || '<tr><td colspan="6" style="color:var(--gtb-muted);padding:8px 0;">Nothing logged yet. Entries appear after a full refresh that follows live updates (feed connected, dashboard open, market hours).</td></tr>')
        + '</tbody></table></div>';
    showPopUpWindow('live-score-log', html, 'Live Score Log', 640, 460);
    var cls = 'popup-custom-style-live-score-log';
    var title = '<div style="display:flex;align-items:center;gap:6px;width:100%;"><span style="font-weight:800;font-size:0.7rem;">LIVE SCORE LOG</span>' + popupWinControls(cls) + '</div>';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html(title);
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
}
setInterval(function () { try { if (_LF_WATCH_N % 2 === 0) _lfScoreTick(); } catch (e) {} }, 1000);

// Today's open and yesterday's close straight from the tick (day OHLC + previous close are part of every quote / full packet), so
// loadOpenPrice() (script.js) needs no REST 'day' candle for it. Null until the exchange has an open (before 09:15 open is 0).
function _lfOpenPrev(name) {
    var o = LIVE_TICKS[name];
    if (!o || !_lfHas(name)) return null;
    if (!(o.open > 0) || !(o.prevClose > 0)) return null;
    return { open: o.open, prev: o.prevClose };
}
function _lcClear() { _LC = {}; }
