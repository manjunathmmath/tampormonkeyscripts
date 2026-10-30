// ── Stock tracking: alert when a tracked stock nears an OI/OBV support or resistance (v29.445) ─────────────────────────────────────
// Add a stock from the Positional Screener (bell icon on its row). While the market is open it keeps the stock's option chain current
// (the same OI/OBV load the strike search uses, about every 5 minutes), takes the ranked call-writing walls as resistance (R1 / R2) and the
// put-writing walls as support (S1 / S2) (`_gtbFindWalls`, the same walls the OI charts label), compares the last price with them every
// ~20 s and, when price comes within `_PW_NEAR_PCT` of a level, raises a toast + beep and sends a Telegram message that also carries the
// stock's positional view from the screener. One alert per level and stage per day (APPROACHING, then AT the level); a level re-arms once
// price has moved away again. Information only: the levels come from option open interest and volume flow, they are not a forecast, and
// nothing here places or changes an order.
var _PW_KEY = 'GTB_PS_WATCH';
var _PW_NEAR_PCT = 0.6;          // "approaching" = within this % of the level, on the approach side
var _PW_AT_PCT = 0.15;           // "at the level" = within this % either side
var _PW_REARM_PCT = 1.2;         // an alerted level re-arms once price is this far (%) from it
var _PW_DATA_MS = 5 * 60000;     // option chain refresh per stock
var _PW_LIST = null;             // { NAME: { added } }
var _PW_DATA_AT = {};            // NAME -> last chain load time
var _PW_LOADING = false;
var _PW_FIRED = null;            // today's alerts: 'NAME|R|525|APPROACHING' -> time
var _PW_NO_TG_SAID = false;

function _pwLoad() {
    if (_PW_LIST) return _PW_LIST;
    try { _PW_LIST = JSON.parse(localStorage.getItem(_PW_KEY) || '{}') || {}; } catch (e) { _PW_LIST = {}; }
    return _PW_LIST;
}
function _pwSave() { try { localStorage.setItem(_PW_KEY, JSON.stringify(_PW_LIST || {})); } catch (e) {} }
function _pwNames() { return Object.keys(_pwLoad()); }
function _pwHas(name) { return !!_pwLoad()[name]; }
function _pwDay() { return moment().format('YYYY-MM-DD'); }
function _pwFiredLoad() {
    if (_PW_FIRED && _PW_FIRED.day === _pwDay()) return _PW_FIRED;
    var s = null; try { s = JSON.parse(localStorage.getItem('GTB_PW_FIRED_' + _pwDay()) || 'null'); } catch (e) {}
    _PW_FIRED = s && s.day === _pwDay() ? s : { day: _pwDay(), f: {}, log: [] };
    return _PW_FIRED;
}
function _pwFiredSave() { try { localStorage.setItem('GTB_PW_FIRED_' + _pwDay(), JSON.stringify(_PW_FIRED)); } catch (e) {} }

function _pwAdd(name) {
    name = String(name || '').trim().toUpperCase(); if (!name) return;
    _pwLoad();
    if (!_PW_LIST[name]) { _PW_LIST[name] = { added: Date.now() }; _pwSave(); }
    _pwSayUi();
    // load its option chain and make sure the screener has read it, so the first alert already carries the positional view
    _pwRefreshOne(name, true);
    _pwFetchPrices([name]).then(function () { _pwRenderPop(); });
    try { if (typeof _PS_CACHE !== 'undefined' && !_PS_CACHE[name] && typeof _psRunScan === 'function') _psRunScan([name], {}).then(function () { if (typeof _psRenderTable === 'function' && jQ('#ps-table-wrap').length) _psRenderTable(); }).catch(function () {}); } catch (e) {}
}
function _pwRemove(name) {
    _pwLoad(); delete _PW_LIST[name]; delete _PW_DATA_AT[name]; _pwSave(); _pwSayUi();
}
function _pwSayUi() {
    try { jQ('#ps-track-list-btn .ps-track-n').text(_pwNames().length); } catch (e) {}
    try { jQ('.ps-track-btn').each(function () { var n = jQ(this).attr('data-name'), on = _pwHas(n); jQ(this).find('i').attr('class', 'bi ' + (on ? 'bi-bell-fill' : 'bi-bell')).css('color', on ? 'var(--gtb-amber)' : 'var(--gtb-accent,#58a6ff)'); jQ(this).attr('title', on ? 'Tracking: click to stop' : 'Track this stock: alert (and Telegram) when it nears an OI/OBV support or resistance'); }); } catch (e) {}
}

// ── market window (real, live day only) ──────────────────────────────────────────────────────────────────────────────────────────
function _pwLive() {
    try {
        var m = moment(), dow = m.day(), mn = m.hours() * 60 + m.minutes();
        if (dow < 1 || dow > 5 || mn < 9 * 60 + 15 || mn > 15 * 60 + 30) return false;
        if (typeof _gtbHistTime === 'function' && _gtbHistTime()) return false;
        if (String(typeof CURRENT_DAY !== 'undefined' ? CURRENT_DAY : '').slice(0, 10) !== _pwDay()) return false;
        return true;
    } catch (e) { return false; }
}

// ── levels from the option chain ─────────────────────────────────────────────────────────────────────────────────────────────────
function _pwLevels(name) {
    var out = [];
    try {
        var sm = INSTRUMENT_SCORE_MAP[name] || {}, td = sm.oiData && sm.oiData.tableData;
        if (!td || !td.length) return out;
        var spot = 0; td.forEach(function (it) { if (it['ATM_STRIKE']) spot = parseFloat(it['STRIKE']) || 0; });
        var w = _gtbFindWalls(td, 0, spot);
        (w.resistance || []).forEach(function (x, i) { out.push({ kind: 'R', n: i + 1, strike: x.strike, tier: x.tier }); });
        (w.support || []).forEach(function (x, i) { out.push({ kind: 'S', n: i + 1, strike: x.strike, tier: x.tier }); });
    } catch (e) {}
    return out;
}
// Price of a tracked stock: its own historical-candle fetch (the last 5-minute candle's close, which includes the candle still forming, so it is
// the latest traded price) when that is under 2 minutes old; otherwise the shared price store (live feed / last refresh).
var _PW_PX = {};          // NAME -> {ltp, t}
var _PW_PX_BUSY = false;
var _PW_PX_MS = 30000;    // fetch interval per tracked stock
function _pwLtp(name) {
    var p = _PW_PX[name];
    if (p && p.ltp && Date.now() - p.t < 120000) return p.ltp;
    try { var o = JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}'); return parseFloat((o[name] || {}).ltp) || 0; } catch (e) { return 0; }
}
function _pwPriceAge(name) {
    var p = _PW_PX[name];
    return p && p.t ? moment(p.t).format('HH:mm:ss') : '';
}
async function _pwFetchPrices(names) {
    if (_PW_PX_BUSY || typeof getHistoricalDataUsingPromise !== 'function') return;
    _PW_PX_BUSY = true;
    try {
        var toTime = (typeof _gtbCurrDayTo === 'function') ? _gtbCurrDayTo() : CURRENT_DAY;
        await Promise.all(names.map(function (n) {
            var tok = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS[n] : null;
            if (!tok) return null;
            return getHistoricalDataUsingPromise(tok, CURRENT_DAY, toTime, '5minute').then(function (res) {
                var raw = res && res.data && res.data.candles, c = (typeof _gtbTrimCandles === 'function') ? _gtbTrimCandles(raw) : raw;
                if (c && c.length) { var p = parseFloat(c[c.length - 1][4]); if (p) _PW_PX[n] = { ltp: p, t: Date.now() }; }
            }).catch(function () {});
        }));
    } catch (e) {}
    _PW_PX_BUSY = false;
}
function _pwView(name) {
    var r = (typeof _PS_CACHE !== 'undefined') ? _PS_CACHE[name] : null;
    if (!r) return null;
    var dir = r.primary && r.primary.ok && r.primary.dir != null ? r.primary.dir : 0;
    return { dir: dir, verdict: r.verdict || '', stage: (r.primary && r.primary.label ? String(r.primary.label).split(' (')[0] : ''), conv: r.convictionPct, timing: r.since && r.since.label ? r.since.label : '' };
}

// distance of price from a level, as % of the level: positive = price above it
function _pwDist(ltp, strike) { return (ltp - strike) / strike * 100; }
// state of price against one level: 'AT', 'APPROACHING' or '' (not near)
function _pwState(lv, ltp) {
    var d = _pwDist(ltp, lv.strike), a = Math.abs(d);
    if (a <= _PW_AT_PCT) return 'AT';
    // resistance is approached from below (price under it), support from above
    if (lv.kind === 'R' && d < 0 && a <= _PW_NEAR_PCT) return 'APPROACHING';
    if (lv.kind === 'S' && d > 0 && a <= _PW_NEAR_PCT) return 'APPROACHING';
    return '';
}

function _pwRead(kind, v) {
    if (!v || !v.dir) return 'No positional view yet for this stock (run a screener scan), so the level is shown without trend context.';
    var bear = v.dir < 0;
    if (kind === 'R') return bear
        ? 'Resistance on a bearish positional trend: a rally has a reason to stall here, so watch for a rejection. A clean break above it would be the first sign the view is weakening.'
        : 'Resistance against a bullish positional trend: a break above it could extend the move, a rejection would be an ordinary pullback.';
    return bear
        ? 'Support against a bearish positional trend: a bounce is possible here, a break below it would extend the fall.'
        : 'Support on a bullish positional trend: a pullback has a reason to hold here, so watch for a bounce. A break below it would weaken the view.';
}

function _pwMessage(name, ltp, lv, state, all, v) {
    var f = function (x) { return Math.round(x * 100) / 100; };
    var d = _pwDist(ltp, lv.strike), kindWord = lv.kind === 'R' ? 'RESISTANCE' : 'SUPPORT';
    var head = name + ' ' + f(ltp) + (state === 'AT' ? ' is AT ' : ' is approaching ') + kindWord + ' ' + f(lv.strike) + ' (' + (d >= 0 ? '+' : '') + d.toFixed(2) + '%)';
    var lines = [head];
    var wall = lv.kind === 'R' ? 'call-writing wall' : 'put-writing wall';
    lines.push('OI/OBV: ' + lv.kind + lv.n + ' (' + lv.tier + ') ' + wall + ' at ' + f(lv.strike) + '.');
    var others = all.filter(function (x) { return x !== lv; }).map(function (x) { return x.kind + x.n + ' ' + f(x.strike); });
    if (others.length) lines.push('Other levels: ' + others.join(', ') + '.');
    if (v) lines.push('Positional view: ' + (v.verdict || '-') + (v.stage ? ' · ' + v.stage : '') + (v.conv != null ? ' · conviction ' + v.conv + '%' : '') + (v.timing ? ' · ' + v.timing : '') + '.');
    lines.push(_pwRead(lv.kind, v));
    lines.push('From option OI / volume flow at ' + moment().format('HH:mm') + '. Not a forecast or advice.');
    return lines;
}

async function _pwNotify(name, ltp, lv, state, all) {
    var v = _pwView(name), lines = _pwMessage(name, ltp, lv, state, all, v);
    var fired = _pwFiredLoad();
    fired.log.unshift({ m: moment().format('HH:mm'), name: name, text: lines[0] });
    if (fired.log.length > 40) fired.log.length = 40;
    _pwFiredSave();
    try { _gtbToast(lines[0], 'warn'); } catch (e) {}
    try { if (typeof _gtbSqzBeepBurst === 'function') _gtbSqzBeepBurst(); } catch (e) {}
    var token = (typeof g_config !== 'undefined' ? g_config.get('telegram_bot_token') : '') || '', chatId = (typeof g_config !== 'undefined' ? g_config.get('telegram_chat_id') : '') || '';
    if (!token || !chatId) { if (!_PW_NO_TG_SAID) { _PW_NO_TG_SAID = true; try { _gtbToast('Tracking alert not sent to Telegram: set the Bot Token + Chat ID in Settings', 'error'); } catch (e) {} } return; }
    var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var html = '<b>' + esc(lines[0]) + '</b>\n' + lines.slice(1).map(esc).join('\n');
    try { await _psTelegramSendOne(token, chatId, html); } catch (e) { try { _gtbToast('Telegram send failed: ' + e, 'error'); } catch (e2) {} }
}

// compare every tracked stock's price with its levels; alert once per level and stage per day
function _pwCheck() {
    if (!_pwLive()) return;
    var fired = _pwFiredLoad();
    _pwNames().forEach(function (name) {
        var ltp = _pwLtp(name); if (!ltp) return;
        var lvls = _pwLevels(name); if (!lvls.length) return;
        lvls.forEach(function (lv) {
            var key = name + '|' + lv.kind + '|' + Math.round(lv.strike * 100) + '|';
            var st = _pwState(lv, ltp);
            // re-arm once price has left the level again
            if (Math.abs(_pwDist(ltp, lv.strike)) > _PW_REARM_PCT) { delete fired.f[key + 'APPROACHING']; delete fired.f[key + 'AT']; }
            if (!st) return;
            if (st === 'AT' && fired.f[key + 'AT']) return;
            if (st === 'APPROACHING' && (fired.f[key + 'APPROACHING'] || fired.f[key + 'AT'])) return;
            fired.f[key + st] = Date.now();
            if (st === 'AT') fired.f[key + 'APPROACHING'] = fired.f[key + 'APPROACHING'] || Date.now();
            _pwFiredSave();
            _pwNotify(name, ltp, lv, st, lvls);
        });
    });
}

// keep each tracked stock's option chain current, one at a time
async function _pwRefreshOne(name, force) {
    if (_PW_LOADING) return;
    if (!force && !_pwLive()) return;
    if (!force && Date.now() - (_PW_DATA_AT[name] || 0) < _PW_DATA_MS) return;
    if (typeof _ossScanLoad !== 'function') return;
    _PW_LOADING = true;
    try { await _ossScanLoad(name); _PW_DATA_AT[name] = Date.now(); } catch (e) { try { console.log('[stock-watch] load', name, e); } catch (e2) {} }
    _PW_LOADING = false;
    if (jQ('#pw-pop-body').length) _pwRenderPop();
}
async function _pwTick() {
    try {
        if (!_pwNames().length) return;
        if (_pwLive()) {
            if (!_PW_LOADING) {
                var due = _pwNames().filter(function (n) { return Date.now() - (_PW_DATA_AT[n] || 0) >= _PW_DATA_MS; })[0];
                if (due) _pwRefreshOne(due, false);
            }
            // price: a historical-candle fetch for every tracked stock each ~30 s (shared rate-limited queue), then the level check
            var stale = _pwNames().filter(function (n) { return Date.now() - ((_PW_PX[n] || {}).t || 0) >= _PW_PX_MS; });
            if (stale.length) await _pwFetchPrices(stale);
        }
        _pwCheck();
    } catch (e) {}
}
setInterval(_pwTick, 20000);
setTimeout(_pwTick, 8000);

// ── list popup ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function _pwRenderPop() {
    var M = 'var(--gtb-muted)', G = 'var(--gtb-green)', R = 'var(--gtb-red)', f = function (x) { return Math.round(x * 100) / 100; };
    var names = _pwNames();
    var th = 'padding:3px 8px;font-size:0.46rem;letter-spacing:0.05em;color:' + M + ';text-align:left;font-weight:700;';
    var td = 'padding:4px 8px;border-top:1px solid var(--gtb-border);';
    var rows = names.map(function (n) {
        var ltp = _pwLtp(n), lv = _pwLevels(n), v = _pwView(n);
        var near = function (kind) {
            var xs = lv.filter(function (x) { return x.kind === kind; });
            if (!xs.length || !ltp) return '<span style="color:' + M + ';">' + (lv.length ? '-' : 'loading...') + '</span>';
            xs.sort(function (a, b) { return Math.abs(_pwDist(ltp, a.strike)) - Math.abs(_pwDist(ltp, b.strike)); });
            var x = xs[0], d = _pwDist(ltp, x.strike), st = _pwState(x, ltp);
            return '<b>' + kind + x.n + ' ' + f(x.strike) + '</b> <span style="color:' + (st ? 'var(--gtb-amber)' : M) + ';">' + (d >= 0 ? '+' : '') + d.toFixed(2) + '%' + (st ? ' ' + st.toLowerCase() : '') + '</span>';
        };
        var vt = v ? '<span style="color:' + (v.dir > 0 ? G : v.dir < 0 ? R : M) + ';">' + (v.verdict || '-') + '</span>' + (v.conv != null ? ' <span style="color:' + M + ';">' + v.conv + '%</span>' : '') : '<span style="color:' + M + ';">not scanned</span>';
        return '<tr><td style="' + td + 'font-weight:800;">' + n + '</td><td style="' + td + 'font-family:var(--gtb-mono);">' + (ltp ? f(ltp) : '-') + (_pwPriceAge(n) ? '<div style="font-size:0.44rem;color:' + M + ';">as of ' + _pwPriceAge(n) + '</div>' : '') + '</td><td style="' + td + '">' + vt + '</td>'
            + '<td style="' + td + '">' + near('R') + '</td><td style="' + td + '">' + near('S') + '</td>'
            + '<td style="' + td + 'text-align:right;"><button class="sv-pill-btn pw-remove" data-name="' + n + '" type="button">Remove</button></td></tr>';
    }).join('');
    var log = _pwFiredLoad().log.slice(0, 12).map(function (l) { return '<div style="font-size:0.52rem;padding:1px 0;"><span style="color:' + M + ';">' + l.m + '</span> ' + l.text + '</div>'; }).join('');
    var h = '<div id="pw-pop-body" style="padding:10px 14px;font-size:0.6rem;color:var(--gtb-text);">'
        + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">'
        + '<button class="sv-pill-btn pw-add-checked" type="button">Track the checked rows of the screener</button>'
        + '<button class="sv-pill-btn pw-test" type="button" title="Send a test message to Telegram">Send a test to Telegram</button>'
        + '<span style="color:' + M + ';">' + names.length + ' tracked · alerts when price is within ' + _PW_NEAR_PCT + '% of a level (and again at the level) · ' + (_pwLive() ? 'market open: tracking' : 'market closed: paused') + '</span></div>'
        + (names.length ? '<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="' + th + '">STOCK</th><th style="' + th + '">LTP</th><th style="' + th + '">POSITIONAL VIEW</th><th style="' + th + '">NEAREST RESISTANCE (OI/OBV)</th><th style="' + th + '">NEAREST SUPPORT (OI/OBV)</th><th style="' + th + '"></th></tr></thead><tbody>' + rows + '</tbody></table>'
            : '<div style="color:' + M + ';padding:14px 0;">Nothing tracked yet. Click the bell on a screener row to track that stock.</div>')
        + '<div style="margin-top:10px;font-size:0.5rem;font-weight:800;color:' + M + ';letter-spacing:0.05em;">TODAY\'S ALERTS</div>' + (log || '<div style="font-size:0.52rem;color:' + M + ';">none yet today</div>')
        + '<div style="margin-top:8px;font-size:0.48rem;color:' + M + ';line-height:1.45;">Levels are the ranked call-writing (resistance) and put-writing (support) walls from option OI and volume flow, refreshed about every 5 minutes. Price is the last 5-minute candle from a historical-data call made for each tracked stock about every 30 seconds (the time under each price), so a level can be reached a few seconds to half a minute before the alert. Information only: not a forecast, advice or an order.</div>'
        + '</div>';
    if (jQ('#pw-pop-body').length) jQ('#pw-pop-body').replaceWith(h); return h;
}
function _pwShowPop() {
    try {
        showPopUpWindow('stock-watch', _pwRenderPop(), 'Tracked stocks', 900, 420);
        var cls = 'popup-custom-style-stock-watch';
        var t = '<div style="display:flex;align-items:center;gap:6px;width:100%;"><i class="bi bi-bell-fill"></i><span style="font-weight:800;font-size:0.7rem;">TRACKED STOCKS</span>' + popupWinControls(cls) + '</div>';
        jQ('.' + cls).find('.popupwindow_titlebar_text').html(t);
        hideNativePopupButtons(cls);
        jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
        _pwNames().forEach(function (n) { _pwRefreshOne(n, false); });
    } catch (e) { try { console.log('[stock-watch popup]', e); } catch (e2) {} }
}

jQ(document).on('click', '.ps-track-btn', function (e) {
    e.stopPropagation();
    var n = jQ(this).attr('data-name');
    if (_pwHas(n)) { _pwRemove(n); try { _gtbToast(n + ': no longer tracked', 'success'); } catch (x) {} }
    else { _pwAdd(n); try { _gtbToast(n + ' is now tracked: you get an alert when it nears an OI/OBV support or resistance', 'success'); } catch (x) {} }
});
jQ(document).on('click', '#ps-track-list-btn', function (e) { e.preventDefault(); _pwShowPop(); });
jQ(document).on('click', '.pw-remove', function () { _pwRemove(jQ(this).attr('data-name')); _pwRenderPop(); });
jQ(document).on('click', '.pw-add-checked', function () {
    var names = Object.keys(typeof _PS_BASKET_SELECTED !== 'undefined' ? _PS_BASKET_SELECTED : {}).filter(function (n) { return _PS_BASKET_SELECTED[n]; });
    if (!names.length) { try { _gtbToast('Tick the checkboxes of the rows you want to track first', 'error'); } catch (e) {} return; }
    names.forEach(_pwAdd);
    setTimeout(_pwRenderPop, 300);
});
jQ(document).on('click', '.pw-test', async function () {
    var token = (typeof g_config !== 'undefined' ? g_config.get('telegram_bot_token') : '') || '', chatId = (typeof g_config !== 'undefined' ? g_config.get('telegram_chat_id') : '') || '';
    if (!token || !chatId) { try { _gtbToast('Set the Telegram Bot Token + Chat ID in Settings first', 'error'); } catch (e) {} return; }
    try { await _psTelegramSendOne(token, chatId, 'Groot: stock tracking test message (' + _pwNames().length + ' stock(s) tracked)'); _gtbToast('Test message sent', 'success'); }
    catch (e) { try { _gtbToast('Telegram send failed: ' + e, 'error'); } catch (e2) {} }
});

// console helpers: _pwNow() runs a check immediately, _pwStatus() lists what is tracked
function _pwNow() { _pwCheck(); }
function _pwStatus() { return _pwNames().map(function (n) { return { name: n, ltp: _pwLtp(n), levels: _pwLevels(n), dataAt: _PW_DATA_AT[n] ? moment(_PW_DATA_AT[n]).format('HH:mm:ss') : null }; }); }
