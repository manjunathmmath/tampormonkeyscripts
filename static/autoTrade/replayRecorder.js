// ─────────────────────────────────────────────────────────────────────────────────────────────
// Replay recorder (v29.517). Replays one past trading day through the dashboard's OWN logic, slot by slot, and saves every metric of every slot to the
// local recorder server. Only the source of price history changes: during a replay every history call of the app (the single function
// getHistoricalDataUsingPromise in utils.js) is answered from the OFFICIAL Kite Connect API (api.kite.trade, api_key + access_token from Settings)
// instead of the /oms (enctoken) path. All scores, the futures remark, OI/OBV, the consensus and so on are therefore the same calculations the live
// dashboard makes.
//
// How a run works (state in localStorage.GTB_RPJOB, so the page reloads it needs do not lose it):
//   1. switch: the four trading-date settings (NSE and MCX, current and previous day) are set to the chosen day and the page reloads (the app reads them once at
//      load). The original dates are kept in the job and put back at the end.
//   2. init:   daily caches are cleared, prices of that day are loaded and the 9:15 scan is run (the first slot's snapshot time is set first).
//   3. slots:  for every 5-minute slot (NSE 09:20 to 15:30, MCX 09:05 to 23:55) the snapshot time is set, the dashboard refreshes (NSE: the full refresh;
//              MCX: the three commodity loads), every metric is captured and POSTed to the recorder server, then it waits `delay` seconds (default 10).
//   4. restore: the original dates go back, the daily caches are cleared again and the page reloads.
// Look-ahead: a history request for the replay day is cut at the slot time: only completed candles are returned, and the candle that has just started is
// returned as it would look at that moment (open price only, no volume), never as it later turned out.
// Official API pacing: calls are spaced 400 ms apart (Kite allows 3 history calls a second); each (instrument, interval, day) is fetched once and
// then sliced per slot. Token / permission errors stop the run with a plain message and restore the dates.
// Never places or changes an order.
// ─────────────────────────────────────────────────────────────────────────────────────────────

var _RP_KEY = 'GTB_RPJOB', _RP_LAST_KEY = 'GTB_RPLAST';
var _RP = { job: null, cache: {}, busy: false, fatal: null, apiNext: 0, calls: 0, apiErrors: 0, hits: 0, diskHits: 0, putFail: 0, served: 0, lastApiAt: 0, server: 'http://localhost:3000', msg: '' };
try { _RP.job = JSON.parse(localStorage.getItem(_RP_KEY) || 'null'); } catch (e) {}
var _RP_MCX = ['CRUDEOILM', 'GOLDM', 'SILVERM'];
// Only ONE tab may run a job: every Kite tab shares localStorage (the job, the snapshot time, the Settings dates), so two runners would corrupt each other.
// The runner holds GTB_RPLOCK and refreshes its heartbeat every 5 s; another tab only mirrors the job (banner, replay-day view) and takes over only if the
// heartbeat has been silent for 4 minutes (the runner tab was closed or crashed). Hidden tabs throttle timers, hence the long limit.
_RP.tab = Math.random().toString(36).slice(2) + Date.now().toString(36);
function _rpLockRead() { try { return JSON.parse(localStorage.getItem('GTB_RPLOCK') || 'null'); } catch (e) { return null; } }
function _rpLockFree() { var l = _rpLockRead(); return !l || l.id === _RP.tab || Date.now() - l.hb > 4 * 60000; }
function _rpLockTake() {
    if (!_rpLockFree()) return false;
    try { localStorage.setItem('GTB_RPLOCK', JSON.stringify({ id: _RP.tab, hb: Date.now() })); } catch (e) {}
    var l = _rpLockRead(); return !!(l && l.id === _RP.tab);
}
function _rpLockHeld() { var l = _rpLockRead(); return !!(l && l.id === _RP.tab); }
setInterval(function () { try { if (_RP.busy && _rpLockHeld()) localStorage.setItem('GTB_RPLOCK', JSON.stringify({ id: _RP.tab, hb: Date.now() })); } catch (e) {} }, 5000);

function _rpSave() { try { localStorage.setItem(_RP_KEY, JSON.stringify(_RP.job)); } catch (e) {} }
function _rpActive() { var j = _RP.job; return !!(j && j.status === 'running' && (j.phase === 'init' || j.phase === 'slots')); }
function _rpSleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function _rpEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _rpSay(m) { _RP.msg = m; _RP.progressAt = Date.now(); try { if (_RP.job) { _RP.job.msg = m; } } catch (e) {} }
function _rpPad(n) { return ('0' + n).slice(-2); }
function _rpSlots(session) {
    var out = [], from = session === 'NSE' ? 9 * 60 + 20 : 9 * 60 + 5, to = session === 'NSE' ? 15 * 60 + 30 : 23 * 60 + 55;
    for (var m = from; m <= to; m += 5) out.push(_rpPad(Math.floor(m / 60)) + ':' + _rpPad(m % 60));
    return out;
}
function _rpToday() { return new Date(Date.now() + 19800000).toISOString().slice(0, 10); }
function _rpPrevDay(day) {
    var ms = Date.parse(day + 'T00:00:00Z'), d;
    for (var i = 1; i <= 10; i++) {
        ms -= 86400000; d = new Date(ms); var wd = d.getUTCDay();
        if (wd === 0 || wd === 6) continue;
        try { if (typeof _fbHoliday === 'function' && _fbHoliday(ms - 19800000 + 43200000)) continue; } catch (e) {}
        return d.toISOString().slice(0, 10);
    }
    return new Date(ms).toISOString().slice(0, 10);
}

// ── official API: one candle request, queued and paced ──
function _rpOfficial(token, interval, from, to) {
    return new Promise(function (resolve) {
        var k = '', t = '';
        try { k = String(g_config.get('api_key') || '').trim(); t = String(g_config.get('api_access_token') || '').trim(); } catch (e) {}
        if (!k || !t) { resolve({ ok: false, fatal: true, error: 'api_key / api_access_token are not set in Settings' }); return; }
        var url = 'https://api.kite.trade/instruments/historical/' + token + '/' + interval + '?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&oi=1';
        var attempt = 0;
        var go = function () {
            var wait = Math.max(0, _RP.apiNext - Date.now()); _RP.apiNext = Date.now() + wait + 400;
            setTimeout(function () {
                _RP.calls++; _RP.lastApiAt = Date.now();
                GM_xmlhttpRequest({
                    method: 'GET', url: url, timeout: 30000, headers: { 'X-Kite-Version': '3', 'Authorization': 'token ' + k + ':' + t },
                    onload: function (r) {
                        var j = null; try { j = JSON.parse(r.responseText); } catch (e) {}
                        if (r.status === 429 && attempt < 3) { attempt++; _RP.apiNext = Date.now() + 2000 * attempt; go(); return; }
                        if (r.status >= 200 && r.status < 300 && j && j.status === 'success') { resolve({ ok: true, candles: (j.data && j.data.candles) || [] }); return; }
                        var msg = (j && (j.message || j.error_type)) ? (j.error_type ? j.error_type + ': ' : '') + (j.message || '') : 'HTTP ' + r.status;
                        var fatal = /TokenException|Incorrect .*api_key|access_token|insufficient permission/i.test(msg);
                        if (fatal) msg += /insufficient/i.test(msg) ? ' (the Historical Data add-on may not be active)' : ' (the access token expires every morning: paste the new api_key / access_token pair in Settings)';
                        _RP.apiErrors++;
                        resolve({ ok: false, fatal: fatal, error: msg, status: r.status });
                    },
                    onerror: function () { _RP.apiErrors++; resolve({ ok: false, error: 'network error contacting api.kite.trade' }); },
                    ontimeout: function () { _RP.apiErrors++; resolve({ ok: false, error: 'api.kite.trade timed out' }); }
                });
            }, wait);
        };
        go();
    });
}
function _rpSlotNow() { var v = ''; try { v = (jQ('#gtb-hist-time').val() || localStorage.getItem('GTB_HIST_TIME') || '').trim(); } catch (e) {} return v ? v.slice(0, 5) : ''; }
var _RP_IV = { 'minute': 1, '3minute': 3, '5minute': 5, '10minute': 10, '15minute': 15, '30minute': 30, '60minute': 60 };
function _rpMins(ts) { return parseInt(String(ts).slice(11, 13), 10) * 60 + parseInt(String(ts).slice(14, 16), 10); }

// Candle sets are looked up in three layers: (1) memory, one entry per (instrument, interval, date range); (2) the recorder server's disk copy
// (data/candles/<replay day>/, written by an earlier run, a prefetch or a previous replay of the same day); (3) the official API, whose answer is then written
// back to the server. A failed fetch is remembered in memory for the rest of the run (and not stored), so it is not retried at every request.
function _rpSrv(method, path, body) {
    return new Promise(function (resolve) {
        GM_xmlhttpRequest({
            method: method, url: _RP.server + path, timeout: 30000, headers: { 'Content-Type': 'application/json' }, data: body ? JSON.stringify(body) : undefined,
            onload: function (r) { var j = null; try { j = JSON.parse(r.responseText); } catch (e) {} resolve(j); },
            onerror: function () { resolve(null); }, ontimeout: function () { resolve(null); }
        });
    });
}
async function _rpLoad(code, interval, from, to) {
    var j = _RP.job, day = j ? j.day : to;
    var d = await _rpSrv('GET', '/api/candles/get?day=' + day + '&token=' + code + '&interval=' + interval + '&from=' + from + '&to=' + to);
    if (d && d.ok && d.candles) { _RP.diskHits++; return d.candles; }
    var r = await _rpOfficial(code, interval, from + ' 00:00:00', to + ' 23:59:59');
    if (!r.ok) { if (r.fatal && !_RP.fatal) _RP.fatal = r.error; return []; }
    _rpSrv('POST', '/api/candles/put', { day: day, token: String(code), interval: interval, from: from, to: to, candles: r.candles }).then(function (p) { if (!p || !p.ok) _RP.putFail++; });
    return r.candles;
}
// the whole candle set covering [fd, td] (dates), never cut at a slot time
function _rpFetchRaw(code, interval, fd, td, quiet) {
    code = String(code);
    var k = code + '|' + interval, list = _RP.cache[k] || (_RP.cache[k] = []);
    for (var i = 0; i < list.length; i++) if (list[i].from <= fd && list[i].to >= td) { if (!quiet) _RP.hits++; return list[i].p; }
    var j = _RP.job, from = fd;
    if (j && td === j.day && _RP_IV[interval] && j.prev < from) from = j.prev;          // intraday requests for the replay day: one fetch also covers the previous day
    var e = { from: from, to: td }; e.p = _rpLoad(code, interval, from, td); list.push(e);
    return e.p;
}

// The replacement for the /oms history call during a replay. Same answer shape: { data: { candles: [...] } }.
function _rpServe(code, fromDate, toDate, interval) {
    var from = String(fromDate), to = String(toDate), fd = from.slice(0, 10), td = to.slice(0, 10), j = _RP.job;
    _RP.served++;
    return _rpFetchRaw(code, interval, fd, td).then(function (all) {
        var iv = _RP_IV[interval], day = j && j.day, candles = all.filter(function (c) { var d = String(c[0]).slice(0, 10); return d >= fd && d <= td; });
        if (iv && day && td === day && candles.length) {
            // cut at the slot time: the explicit time of the request, else the snapshot time picker
            var cut = to.length > 10 ? to.slice(11, 16) : _rpSlotNow();
            if (cut) {
                var cm = parseInt(cut.slice(0, 2), 10) * 60 + parseInt(cut.slice(3, 5), 10), out = [], prevOi = null;
                for (var i = 0; i < candles.length; i++) {
                    var c = candles[i], cd = String(c[0]).slice(0, 10);
                    if (cd !== day) { out.push(c); if (c.length > 6) prevOi = c[6]; continue; }
                    var m = _rpMins(c[0]);
                    if (m + iv <= cm) { out.push(c); if (c.length > 6) prevOi = c[6]; }                                   // completed
                    else if (m <= cm) { var p = [c[0], c[1], c[1], c[1], c[1], 0]; if (c.length > 6) p.push(prevOi != null ? prevOi : c[6]); out.push(p); break; }   // just started: its open only
                    else break;                                                                                         // later: not yet
                }
                candles = out;
            }
        }
        return { status: 'success', data: { candles: candles.slice() } };
    });
}

// ── prefetch: everything a session will ask for, before the first slot ──
// Spots first (their day range decides which strikes are needed), then the futures, then the option strikes that cover the day's high and low plus a margin,
// using the app's own lists and its own expiry resolver, so the contracts are the ones the dashboard will use. Anything missed is fetched on demand later.
function _rpRange(candles, day) {
    var hi = -Infinity, lo = Infinity; (candles || []).forEach(function (c) { if (String(c[0]).slice(0, 10) === day) { hi = Math.max(hi, +c[2]); lo = Math.min(lo, +c[3]); } });
    return isFinite(hi) ? { hi: hi, lo: lo } : null;
}
function _rpIsoToDmy(iso) { return iso ? iso.slice(8, 10) + '-' + iso.slice(5, 7) + '-' + iso.slice(0, 4) : ''; }
function _rpPickStrikes(strikes, lo, hi, margin, cap) {
    var u = Array.from(new Set(strikes)).sort(function (a, b) { return a - b; }); if (!u.length) return [];
    var step = Infinity; for (var i = 1; i < u.length; i++) { var d = u[i] - u[i - 1]; if (d > 0 && d < step) step = d; }
    if (!isFinite(step)) step = 1;
    var sel = u.filter(function (x) { return x >= lo - margin * step && x <= hi + margin * step; });
    if (sel.length > cap) { var mid = (lo + hi) / 2; sel = sel.sort(function (a, b) { return Math.abs(a - mid) - Math.abs(b - mid); }).slice(0, cap); }
    return sel;
}
async function _rpPrefetch(j, session) {
    var day = j.day, prev = j.prev, tasks = [], pf = j.pf = { session: session, phase: 'starting', done: 0, total: 0, fetched: 0 };
    var run = async function (label, list) {
        pf.phase = label; pf.total += list.length; _rpSave();
        for (var i = 0; i < list.length; i += 10) {
            if (j.stop || _RP.fatal) return;
            await Promise.all(list.slice(i, i + 10).map(function (t) { return (t.interval === 'day' ? _rpFetchRaw(t.code, 'day', prev, prev, true) : _rpFetchRaw(t.code, '5minute', prev, day, true)).then(function () { pf.done++; }); }));
            _rpSay('prefetching ' + label + ': ' + pf.done + ' of ' + pf.total);
            if (i % 50 === 0) _rpSave();
        }
    };
    var range = {};      // display name -> { hi, lo } of the day
    if (session === 'NSE') {
        var names = Object.keys(INSTRUMENT_TOKENS);
        await run('prices of the instruments', names.map(function (n) { return { code: INSTRUMENT_TOKENS[n] }; }));
        for (var a = 0; a < names.length; a++) { var c = await _rpFetchRaw(INSTRUMENT_TOKENS[names[a]], '5minute', prev, day, true); var r = _rpRange(c, day); if (r) range[names[a]] = r; }
        var futs = (typeof FUTURE_INTRUMENT_LIST !== 'undefined' ? FUTURE_INTRUMENT_LIST : []).map(function (f) { return { code: f.instrument_token }; });
        await run('futures', futs.concat(futs.map(function (f) { return { code: f.code, interval: 'day' }; })));
        var under = [['NIFTY', 'NIFTY 50', 8, 60], ['BANKNIFTY', 'NIFTY BANK', 8, 60], ['SENSEX', 'SENSEX', 8, 60]];
        try { Object.keys(NIFTY_50_WEIGHTED_STOCKS || {}).concat(Object.keys(NIFTY_BANK_WEIGHTED_STOCKS || {})).forEach(function (n) { if (!under.some(function (u) { return u[0] === n; })) under.push([n, n, 5, 28]); }); } catch (e) {}
        var opts = [];
        under.forEach(function (u) {
            var rg = range[u[1]]; if (!rg) return;
            var iso = null; try { iso = _gtbOptionExpiryFor(u[0]); } catch (e) {}
            var dmy = _rpIsoToDmy(iso), rows = (typeof OPTION_STRIKE_LIST !== 'undefined' ? OPTION_STRIKE_LIST : []).filter(function (o) { return o.name === u[0] && (!dmy || o.expiry === dmy); });
            var sel = {}; _rpPickStrikes(rows.map(function (o) { return parseFloat(o.strike); }), rg.lo, rg.hi, u[2], u[3]).forEach(function (k) { sel[k] = 1; });
            rows.forEach(function (o) { if (sel[parseFloat(o.strike)]) { opts.push({ code: o.instrument_token }); opts.push({ code: o.instrument_token, interval: 'day' }); } });
        });
        await run('option strikes', opts);
    } else {
        var futm = {}; (typeof COMMODITIES_FUTURE_INSTRUMENT_LIST !== 'undefined' ? COMMODITIES_FUTURE_INSTRUMENT_LIST : []).forEach(function (f) { if (_RP_MCX.indexOf(f.name) !== -1) futm[f.name] = f; });
        var mf = Object.keys(futm).map(function (n) { return { code: futm[n].instrument_token }; });
        await run('commodity futures', mf.concat(mf.map(function (t) { return { code: t.code, interval: 'day' }; })));
        var mo = [];
        for (var q = 0; q < _RP_MCX.length; q++) {
            var n = _RP_MCX[q], f = futm[n]; if (!f) continue;
            var rg = _rpRange(await _rpFetchRaw(f.instrument_token, '5minute', prev, day, true), day); if (!rg) continue;
            var rows = (typeof MCX_OPTION_LIST !== 'undefined' ? MCX_OPTION_LIST : []).filter(function (o) { return o.name === n; }), sel = {};
            _rpPickStrikes(rows.map(function (o) { return parseFloat(o.strike); }), rg.lo, rg.hi, 6, 40).forEach(function (k) { sel[k] = 1; });
            rows.forEach(function (o) { if (sel[parseFloat(o.strike)]) { mo.push({ code: o.instrument_token }); mo.push({ code: o.instrument_token, interval: 'day' }); } });
        }
        await run('commodity options', mo);
    }
    pf.phase = 'done'; _rpSave();
}

// ── capture: every metric of the dashboard for one slot ──
function _rpG(f) { try { var v = f(); return v === undefined ? null : v; } catch (e) { return null; } }
function _rpN(x, d) { var n = parseFloat(x); if (!isFinite(n)) return null; var p = Math.pow(10, d == null ? 4 : d); return Math.round(n * p) / p; }
function _rpPrim(o, keys) {
    var out = {}; if (!o || typeof o !== 'object') return out;
    Object.keys(o).forEach(function (k) {
        if (keys && keys.indexOf(k) === -1) return;
        var v = o[k], t = typeof v;
        if (t === 'number') { if (isFinite(v)) out[k] = _rpN(v, 4); } else if (t === 'string') out[k] = v.length > 160 ? v.slice(0, 160) : v; else if (t === 'boolean') out[k] = v;
    });
    return out;
}
function _rpStrip(s) { return String(s == null ? '' : s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 240); }
function _rpChain(td, n, withObv) {
    if (!td || !td.length) return [];
    var idx = -1; for (var i = 0; i < td.length; i++) { if (td[i]['ATM_STRIKE']) { idx = i; break; } }
    if (idx < 0) idx = Math.floor(td.length / 2);
    var last = function (arr, k) { if (!arr || !arr.length) return null; var x = arr[arr.length - 1]; if (x && typeof x === 'object') { var v = x[k] != null ? x[k] : (x.v != null ? x.v : x.value); return _rpN(v, 4); } return _rpN(x, 4); };
    var out = [];
    for (var j = Math.max(0, idx - n); j <= Math.min(td.length - 1, idx + n); j++) {
        var r = td[j];
        out.push({ k: _rpN(r['STRIKE'], 2), atm: j === idx ? 1 : 0, oiC: _rpN(r['OI_CE']), oiP: _rpN(r['OI_PE']), dC: _rpN(r['CHG_OI_CE']), dP: _rpN(r['CHG_OI_PE']), pC: _rpN(r['CE'], 2), pP: _rpN(r['PE'], 2),
                   vC: _rpN(r['VOL_CE'], 0), vP: _rpN(r['VOL_PE'], 0), obvC: withObv ? last(r['CE_OBV'], 'obv') : null, obvP: withObv ? last(r['PE_OBV'], 'obv') : null, ivC: last(r['CE_IV'], 'iv'), ivP: last(r['PE_IV'], 'iv') });
    }
    return out;
}
function _rpInst(name, mcx, full, errs) {
    var sm = INSTRUMENT_SCORE_MAP[name] || {}, o = {}, note = function (sec, e) { errs.push(name + '/' + sec + ': ' + (e && e.message ? e.message : e)); };
    var td = sm.oiData && sm.oiData.tableData;
    try {
        if (mcx) {
            o.px = { ltp: _rpN(sm.mcxLtp, 2), open: _rpN(sm.open, 2) };
            var mv = _rpG(function () { return _ossMcxVol(name); }); if (mv) o.vol = { index: mv.label, value: _rpN(mv.v, 2) };
            o.lv = _rpPrim(sm.strikeMap || {}, ['ustrikeOne', 'ustrikeTwo', 'bstrikeOne', 'bstrikeTwo', 'vixDDUpper', 'vixDDLower']);
        } else {
            var tr = generateTrend(name), g = (JSON.parse(localStorage.getItem('INSTRUMENT_LIST_GLOBAL') || '{}') || {})[name] || {};
            o.px = { ltp: _rpN(tr.ltp, 2), chg: _rpN(tr.change, 3), open: _rpN(g.price, 2), prev: _rpN(g.prevPrice, 2) };
            o.trends = tr.trends || [];
            var sd = _rpG(function () { return getStrikeDetails({ price: parseFloat(g.price) }, name); });
            if (sd) o.lv = _rpPrim(sd, ['ustrikeOne', 'ustrikeTwo', 'bstrikeOne', 'bstrikeTwo']);
            if (tr.vix) o.vixr = _rpPrim(tr.vix, ['vixDDUpper', 'vixDDLower', 'vixu', 'vixl']);
        }
    } catch (e) { note('price', e); }
    try { var z = (JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}') || {})[name]; if (z) o.z915 = { zone: z['CLOSE_9_15'] || null, open: _rpN(z['open'] || z['OPEN'], 2), close: _rpN(z['close'] || z['CLOSE'], 2) }; } catch (e) { note('9:15', e); }
    try { o.score = _rpPrim(computeInstrumentScore(name), ['nine_fifteen', 'current_trend', 'futures_trend', 'oi_obv', 'max_pain', 'iv_skew', 'total']); } catch (e) { note('score', e); }
    try { o.fut = { remark: sm.futures_trend_remark || null, at: sm.futures_trend_at || null, avwap: _rpN(sm.avwap, 2), vwapBull: sm.vwapBullishDaily == null ? null : !!sm.vwapBullishDaily }; } catch (e) { note('futures', e); }
    try {
        var od = sm.oiData || {};
        o.oi = Object.assign(_rpPrim(od, ['pcr', 'chPcr', 'obvFlow', 'ivSkew', 'atmIV', 'oiWall', 'oiConflicts', 'totalVolCE', 'totalVolPE', 'prevVolCE', 'prevVolPE']), _rpPrim(sm.oiExtras || {}, ['oiConcentration', 'volRatio']));
        if (sm.oiExtras && sm.oiExtras.mpConvergence) o.oi.mpConv = _rpPrim(sm.oiExtras.mpConvergence, ['prev', 'curr', 'delta', 'label']);
        if (sm.oiExtras && sm.oiExtras.oiVelocity != null) o.oi.vel = typeof sm.oiExtras.oiVelocity === 'object' ? _rpPrim(sm.oiExtras.oiVelocity) : _rpN(sm.oiExtras.oiVelocity);
    } catch (e) { note('oi', e); }
    try {
        var cs = sm.oiData && sm.oiData.spotCandles;
        if (cs && cs.length) { var hi = -Infinity, lo = Infinity; cs.forEach(function (c) { hi = Math.max(hi, parseFloat(c[2])); lo = Math.min(lo, parseFloat(c[3])); }); var lc = cs[cs.length - 1]; o.day = { n: cs.length, hi: _rpN(hi, 2), lo: _rpN(lo, 2), last: [lc[0], _rpN(lc[1], 2), _rpN(lc[2], 2), _rpN(lc[3], 2), _rpN(lc[4], 2), _rpN(lc[5], 0)] }; }
    } catch (e) { note('candles', e); }
    try { var mp = _gtbComputeMaxPainGEX(name); if (mp) o.mp = _rpPrim(mp); } catch (e) { note('maxpain', e); }
    try {
        var spot = o.px && o.px.ltp, pc = o.px && o.px.chg != null ? o.px.chg : 0;
        if (td && td.length && spot) { var w = _gtbFindWalls(td, pc, spot), mw = function (arr) { return (arr || []).slice(0, 3).map(function (x) { return _rpPrim(x); }); }; o.walls = { res: mw(w.resistance), sup: mw(w.support) }; }
    } catch (e) { note('walls', e); }
    try { var lp = _gtbLevelProb(name); if (lp && lp.ok) o.lp = _rpPrim(lp, ['pASO', 'pAST', 'pVIXU', 'pBSO', 'pBST', 'pVIXL', 'netDir', 'netDirNoScore']); } catch (e) { note('levelprob', e); }
    try { var cn = _gtbMasterConsensus(name); if (cn) o.cons = { net: _rpN(cn.net, 3), out: cn.outcome, voting: cn.voting, agree: cn.agree, thin: !!cn.thin, groups: (cn.families || []).map(function (f) { return { g: f.name, dir: f.dir, s: _rpN(f.strength, 3) }; }) }; } catch (e) { note('consensus', e); }
    try { var dz = _gtbDeadZoneRaw(name); o.dz = dz ? Object.assign(_rpPrim(dz), dz.broken ? { brokenDir: dz.broken.dir, brokenAt: dz.broken.at } : {}) : null; } catch (e) { note('deadzone', e); }
    try {
        var sr = _gtbSrLevels(name);
        if (sr) { var cut = function (arr) { return arr.slice(0, 3).map(function (z) { return { p: _rpN(z.price, 2), s: _rpN(z.strength, 1), n: z.n }; }); };
            o.sr = { up: cut(sr.zones.filter(function (z) { return z.price > sr.spot; }).sort(function (a, b) { return a.price - b.price; })), dn: cut(sr.zones.filter(function (z) { return z.price <= sr.spot; }).sort(function (a, b) { return b.price - a.price; })) }; }
    } catch (e) { note('sr', e); }
    try { var lx = (typeof _lxCompute === 'function' && !mcx) ? _lxCompute(name) : null; if (lx) o.lx = _rpPrim(lx); } catch (e) { note('livecontext', e); }
    try { if (td && td.length) o.chain = _rpChain(td, full ? 10 : 4, full); } catch (e) { note('chain', e); }
    return o;
}
// what the dashboard's own cards say, per instrument: Signal agreement + Entry timing, OI CHG + OBV, Fuel left, squeeze, Focus gates
function _rpSigAgree(name, errs) {
    var o = {};
    try {
        var sg = _ossSuggestedKey(name, { skipMarketGate: true });
        if (sg && sg.key) {
            var view = (_ossStrategyByKey(sg.key) || {}).view || '', want = /Bullish|Mildly bullish/.test(view) ? 1 : /Bearish|Mildly bearish/.test(view) ? -1 : 0;
            o.key = sg.key; o.view = view; o.why = _rpStrip(sg.why);
            var ag = null; try { _ossAgreement(name, view); ag = (typeof _OSS_AGREE_LAST !== 'undefined') ? _OSS_AGREE_LAST : null; } catch (e) {}
            if (ag) o.agree = _rpPrim(ag);
            try { if (want || /Range-bound/.test(view)) { _ossTimingFor(name, want, sg.key, (typeof _ossScanDte === 'function') ? _ossScanDte(name) : null); if (typeof _OSS_TIMING_LAST !== 'undefined' && _OSS_TIMING_LAST) o.timing = _rpPrim(_OSS_TIMING_LAST); } } catch (e) {}
            try { var fu = _gtbFuelFor(name, want, ag); if (fu) o.fuel = { txt: _rpStrip(fu.txt), tip: _rpStrip(fu.tip) }; } catch (e) {}
        } else if (sg) o.why = _rpStrip(sg.why);
    } catch (e) { errs.push(name + '/sigagree: ' + (e && e.message ? e.message : e)); }
    try { var oo = _gtbOiObvAgree(name); if (oo) o.oiobv = _rpPrim(oo); } catch (e) {}
    return o;
}
function _rpSqueeze(name) {
    var q = _rpG(function () { return _gtbShortCoveringSignal(name); });
    return q && q.ok ? _rpPrim(q) : null;
}
function _rpFocus(name, errs) {
    try {
        var r = _tfCompute(name); if (!r) return null;
        return { live: !!r.live, greens: r.greens, rows: (r.rows || []).map(function (x) { return { k: x.key, tone: x.tone, line: _rpStrip(x.line) }; }) };
    } catch (e) { errs.push(name + '/focusgates: ' + (e && e.message ? e.message : e)); return null; }
}
function _rpApp(name, mcx, errs) {
    var o = {}, sm = INSTRUMENT_SCORE_MAP[name] || {};
    try {
        if (!mcx) {
            var v = _gtbFinalVerdict(name); if (v) o.fv = { call: v.call || null, head: _rpStrip(v.headline), conf: v.conf || null, dir: v.dir == null ? null : v.dir };
            var ol = _gtbOutlook(name); if (ol && ol.ok) o.outlook = { dir: ol.dir, rank: ol.rank, plan: ol.plan ? { long: !!ol.plan.long, entry: _rpN(ol.plan.entryPx, 2), stop: _rpN(ol.plan.stop, 2), t1: ol.plan.t1 ? _rpN(ol.plan.t1.price, 2) : null, rr: _rpN(ol.plan.rr, 2), atLevel: !!ol.plan.atLevel } : null };
        } else {
            var pc = (parseFloat(sm.mcxLtp) && parseFloat(sm.open)) ? (sm.mcxLtp - sm.open) / sm.open * 100 : 0, mpd = _rpG(function () { return _gtbComputeMaxPainGEX(name); });
            var cv = _cmdBuildVerdict(name, sm.oiData, pc, mpd);
            if (cv) o.cmdv = { label: _rpStrip(cv.label), vol: cv.ovxGate ? 1 : 0, vw: cv.volWarn ? 1 : 0, trade: cv.trade ? _rpPrim(cv.trade) : null, loc: cv.location ? _rpStrip(cv.location.label) : null };
        }
    } catch (e) { errs.push(name + '/app: ' + (e && e.message ? e.message : e)); }
    o.sa = _rpSigAgree(name, errs); o.sq = _rpSqueeze(name); o.focus = _rpFocus(name, errs);
    return o;
}
function _rpMarket(errs) {
    var m = {};
    try { m.vix = _rpN(_rpG(function () { return JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}')['INDIA VIX'].ltp; }), 2); } catch (e) {}
    try { var g = generateTrend('GIFT NIFTY'); m.gift = { ltp: _rpN(g.ltp, 2), chg: _rpN(g.change, 3) }; } catch (e) {}
    try {
        var S = {}, add = function (k, f) { var v = _rpG(f); if (v != null && isFinite(v)) S[k] = _rpN(v, 3); };
        add('all915', function () { return ALL_9_15_CLOSE_SCORE; }); add('n50_915', function () { return NIFTY_50_9_15_CLOSE_SCORE; }); add('bn_915', function () { return NIFTY_BANK_9_15_CLOSE_SCORE; }); add('gift_915', function () { return GIFT_NIFTY_9_15_CLOSE_SCORE; }); add('sx_915', function () { return SENSEX_9_15_CLOSE_SCORE; });
        add('rel_915', function () { return RELIANCE_9_15_CLOSE_SCORE; }); add('hdfc_915', function () { return HDFCBANK_9_15_CLOSE_SCORE; });
        add('all_ad', function () { return ALL_ADVANCE_DECLINE_SCORE; }); add('n50_ad', function () { return NIFTY_50_ADVANCE_DECLINE_SCORE; }); add('bn_ad', function () { return NIFTY_BANK_ADVANCE_DECLINE_SCORE; });
        add('all_fut', function () { return ALL_FUTURES_TREND_SCORE; }); add('n50_fut', function () { return NIFTY_50_FUTURES_TREND_SCORE; }); add('bn_fut', function () { return NIFTY_BANK_FUTURES_TREND_SCORE; });
        add('n50_oi', function () { return NIFTY_50_OI_OBV_SCORE; }); add('bn_oi', function () { return NIFTY_BANK_OI_OBV_SCORE; }); add('rel_oi', function () { return RELIANCE_OI_OBV_SCORE; }); add('hdfc_oi', function () { return HDFCBANK_OI_OBV_SCORE; }); add('icici_oi', function () { return ICICIBANK_OI_OBV_SCORE; });
        add('n50_mp', function () { return NIFTY_50_MAX_PAIN_SCORE; }); add('bn_mp', function () { return NIFTY_BANK_MAX_PAIN_SCORE; });
        add('n50_ivs', function () { return NIFTY_50_IV_SKEW_SCORE; }); add('bn_ivs', function () { return NIFTY_BANK_IV_SKEW_SCORE; });
        add('n50_comp', function () { return NIFTY_50_COMPONENT_SCORE; }); add('bn_comp', function () { return NIFTY_BANK_COMPONENT_SCORE; });
        add('composite', function () { return window._GTB_LAST_SCORE; });
        m.scores = S;
        var sg = _rpG(function () { var s = window._GTB_LAST_MARKET_SIGNAL; return s && (s.signal || s); }); m.signal = (typeof sg === 'string') ? sg : null;
    } catch (e) { errs.push('market/scores: ' + e.message); }
    try { var strat = (window._GTB_LC || {}).strat; if (strat) m.strat = { outcome: strat.outcome || null, level: strat.level || null, key: strat.key || null }; } catch (e) {}
    try {
        var b915 = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}'), c = { AST: 0, ASO: 0, BW: 0, BSO: 0, BST: 0 };
        Object.keys(b915).forEach(function (k) { var z = b915[k] && b915[k]['CLOSE_9_15']; if (!z) return; var kk = (z === 'B/W' || z === 'BW') ? 'BW' : z; if (c[kk] != null) c[kk]++; });
        m.b915 = c;
    } catch (e) {}
    try { if (typeof _GTB_MACRO !== 'undefined' && _GTB_MACRO) m.macro = { label: _GTB_MACRO.label, score: _rpN(_GTB_MACRO.score, 2) }; } catch (e) {}
    try { if (typeof _gtbStrengthRows === 'function') { var rows = _gtbStrengthRows(); if (rows && rows.length) m.strength = rows.slice(0, 8).map(function (r) { return { n: r.name, c: _rpN(r.chg != null ? r.chg : r.change, 3) }; }); } } catch (e) {}
    // everything the dashboard shows for the market as a whole: gauge mode, Range Scoreboard, signal, A/D counts, squeeze, range-plan check, exit signal
    try { m.lag = localStorage.getItem('GTB_INCLUDE_LAGGING') !== '0'; } catch (e) {}
    try {
        var sm0 = function (arr) { return arr.reduce(function (a, v) { return a + (v || 0); }, 0); };
        var g915 = sm0([ALL_9_15_CLOSE_SCORE, NIFTY_50_9_15_CLOSE_SCORE, NIFTY_BANK_9_15_CLOSE_SCORE, GIFT_NIFTY_9_15_CLOSE_SCORE, SENSEX_9_15_CLOSE_SCORE, RELIANCE_9_15_CLOSE_SCORE, HDFCBANK_9_15_CLOSE_SCORE]);
        var gAD = sm0([ALL_ADVANCE_DECLINE_SCORE, NIFTY_50_ADVANCE_DECLINE_SCORE, NIFTY_BANK_ADVANCE_DECLINE_SCORE]);
        var gFT = sm0([ALL_FUTURES_TREND_SCORE, NIFTY_50_FUTURES_TREND_SCORE, NIFTY_BANK_FUTURES_TREND_SCORE]);
        var gOI = sm0([NIFTY_50_OI_OBV_SCORE, NIFTY_BANK_OI_OBV_SCORE, RELIANCE_OI_OBV_SCORE, HDFCBANK_OI_OBV_SCORE, ICICIBANK_OI_OBV_SCORE]);
        var gMP = sm0([NIFTY_50_MAX_PAIN_SCORE, NIFTY_BANK_MAX_PAIN_SCORE, RELIANCE_MAX_PAIN_SCORE, HDFCBANK_MAX_PAIN_SCORE, ICICIBANK_MAX_PAIN_SCORE]);
        var gIV = sm0([NIFTY_50_IV_SKEW_SCORE, NIFTY_BANK_IV_SKEW_SCORE, RELIANCE_IV_SKEW_SCORE, HDFCBANK_IV_SKEW_SCORE, ICICIBANK_IV_SKEW_SCORE]);
        var gCW = sm0([NIFTY_50_COMPONENT_SCORE, NIFTY_BANK_COMPONENT_SCORE]);
        var tot = g915 + gAD + gFT + gOI + gMP + gIV + gCW, cap = function (v, mx) { return Math.max(-mx, Math.min(mx, v)); };
        var capped = cap(g915, 7) + cap(gAD, 3) + cap(gFT, 3) + cap(gOI, 10) + cap(gMP, 5) + cap(gIV, 5) + cap(gCW, 5);
        var verdict = tot >= 4 ? 'LONG' : tot <= -4 ? 'SHORT' : 'WAIT';
        var dirC = verdict === 'LONG' ? Math.max(0, capped) : verdict === 'SHORT' ? Math.max(0, -capped) : Math.abs(capped);
        var grp = { g915: g915, ad: gAD, fut: gFT, oi: gOI, mp: gMP, iv: gIV, comp: gCW }, absSum = 0, top = null;
        Object.keys(grp).forEach(function (k) { absSum += Math.abs(grp[k]); if (!top || Math.abs(grp[k]) > Math.abs(grp[top])) top = k; });
        Object.keys(grp).forEach(function (k) { grp[k] = _rpN(grp[k], 3); });
        m.sb = { groups: grp, total: _rpN(tot, 2), capped: _rpN(capped, 2), verdict: verdict, confPct: Math.min(100, Math.round(dirC / 38 * 100)), domGroup: top, domPct: absSum > 0 ? Math.round(Math.abs(grp[top]) / absSum * 100) : 0 };
        m.gauge = { includeLagging: m.lag, shown: _rpN(window._GTB_LAST_SCORE, 2), leading: _rpN(g915 + gAD + gFT, 3), lagging: _rpN(gOI + gMP + gIV + gCW, 3) };
    } catch (e) { errs.push('market/scoreboard: ' + e.message); }
    try { var sg2 = window._GTB_LAST_MARKET_SIGNAL; if (sg2) m.sigFull = { signal: sg2.signal || null, reason: _rpStrip(sg2.reason), trade: sg2.tradeSignal ? { outcome: sg2.tradeSignal.outcome || null, level: _rpStrip(sg2.tradeSignal.level) } : null }; } catch (e) {}
    try {
        var rd = function (id) { var t = jQ('#' + id).text().replace(/\s+/g, ' ').trim(); return t || null; };
        m.ad = { all: rd('all-advance-decline-adr'), n50: rd('NIFTY-50-advance-decline-adr'), bn: rd('NIFTY-BANK-advance-decline-adr'), allF: rd('all-advance-decline-adr-future'), n50F: rd('NIFTY-50-advance-decline-adr-future'), bnF: rd('NIFTY-BANK-advance-decline-adr-future'), n50Top: rd('gtb-adr-n50'), bnTop: rd('gtb-adr-bn'), breadthUp: rd('gtb-ov-breadth-bull-n'), breadthDn: rd('gtb-ov-breadth-bear-n') };
    } catch (e) {}
    try { m.squeeze = { up: _gtbSqueezeActiveNames(true), dn: _gtbSqueezeActiveNames(false) }; } catch (e) {}
    try { var rp = _gtbRangePlanCheck(); if (rp) m.rangePlan = { on: !!rp.on, side: rp.side, key: rp.key, expected: !!rp.expected, reasons: (rp.reasons || []).map(_rpStrip) }; } catch (e) {}
    try { m.exit = { long: checkExitSignal('LONG'), short: checkExitSignal('SHORT') }; } catch (e) {}
    try {
        var lc = window._GTB_LC || {}, one = function (x) { var d = x && x.decision; return x ? { state: d && d.action || null, title: _rpStrip(d && (d.title || d.headline)), conf: x.conf != null ? x.conf : null, total: x.total != null ? x.total : null } : null; };
        m.lc = { support: one(lc.support), resistance: one(lc.resistance), plan: lc.strat ? { outcome: lc.strat.outcome || null, level: lc.strat.level || null, key: lc.strat.key || null } : null };
    } catch (e) {}
    return m;
}
function _rpCtx(day, slot) {
    var c = { dow: new Date(day + 'T00:00:00Z').getUTCDay(), mins: parseInt(slot.slice(0, 2), 10) * 60 + parseInt(slot.slice(3, 5), 10) };
    try { c.expiryDay = _gtbExpiryDayNames(); } catch (e) {}
    try { c.dte = {}; [['NIFTY', 'NIFTY 50'], ['BANKNIFTY', 'NIFTY BANK'], ['SENSEX', 'SENSEX']].forEach(function (p) { var ex = _gtbOptionExpiryFor(p[0]); if (ex) c.dte[p[1]] = { exp: ex, days: Math.round((Date.parse(ex) - Date.parse(day)) / 86400000) }; }); } catch (e) {}
    return c;
}
function _rpSnapshot(day, session, slot) {
    var errs = [], snap = { schema: 2, app: (function () { try { return GM_info.script.version; } catch (e) { return ''; } })(), day: day, session: session, slot: slot, source: 'replay', asOf: day + 'T' + slot + ':00+05:30', capturedAt: new Date().toISOString(), ctx: _rpCtx(day, slot), inst: {}, app_out: {}, errors: errs };
    var mcx = session === 'MCX', core = mcx ? _RP_MCX : ['NIFTY 50', 'NIFTY BANK', 'SENSEX'];
    core.forEach(function (n) { snap.inst[n] = _rpInst(n, mcx, true, errs); snap.app_out[n] = _rpApp(n, mcx, errs); });
    snap.mkt = _rpMarket(errs);
    if (!mcx) {
        var st = {}; try { Object.keys(NIFTY_50_WEIGHTED_STOCKS || {}).concat(Object.keys(NIFTY_BANK_WEIGHTED_STOCKS || {})).forEach(function (n) { st[n] = 1; }); } catch (e) {}
        snap.stocks = {}; Object.keys(st).forEach(function (n) { snap.stocks[n] = _rpInst(n, false, false, errs); });
        try { snap.wts = { n50: NIFTY_50_WEIGHTED_STOCKS, bn: NIFTY_BANK_WEIGHTED_STOCKS }; } catch (e) {}
    }
    return snap;
}
function _rpPost(snap) {
    return new Promise(function (resolve) {
        GM_xmlhttpRequest({
            method: 'POST', url: _RP.server + '/api/snapshot', timeout: 30000, headers: { 'Content-Type': 'application/json' }, data: JSON.stringify(snap),
            onload: function (r) { var j = null; try { j = JSON.parse(r.responseText); } catch (e) {} resolve(r.status >= 200 && r.status < 300 && j && j.ok ? { ok: true } : { ok: false, error: (j && j.error) || ('HTTP ' + r.status + ' (restart node server.js to load the new endpoints)') }); },
            onerror: function () { resolve({ ok: false, error: 'the recorder server is not reachable at ' + _RP.server }); },
            ontimeout: function () { resolve({ ok: false, error: 'the recorder server timed out' }); }
        });
    });
}

// ── orchestration ──
function _rpCfgKeys() { return ['current_day_date', 'previous_day_date', 'mcx_current_day_date', 'mcx_previous_day_date']; }
function _rpApplyDates(cur, prev) {
    g_config.set('current_day_date', cur); g_config.set('previous_day_date', prev);
    g_config.set('mcx_current_day_date', cur); g_config.set('mcx_previous_day_date', prev);
    _gtbPersistConfigSnapshot();
}
async function _rpStart(day, sessions, delaySec) {
    if (_RP.job && _RP.job.status === 'running') return { ok: false, error: 'a replay is already running' };
    var today = _rpToday();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day.slice(0, 7) !== today.slice(0, 7)) return { ok: false, error: 'choose a day in the current month' };
    if (day > today) return { ok: false, error: 'that day has not happened yet' };
    var wd = new Date(day + 'T00:00:00Z').getUTCDay(); if (wd === 0 || wd === 6) return { ok: false, error: 'that day is a weekend' };
    if (!sessions || !sessions.length) return { ok: false, error: 'choose NSE and / or MCX' };
    var k = '', t = ''; try { k = g_config.get('api_key'); t = g_config.get('api_access_token'); } catch (e) {}
    if (!k || !t) return { ok: false, error: 'set api_key and api_access_token in Settings first' };
    var orig = {}; _rpCfgKeys().forEach(function (key) { try { orig[key] = g_config.get(key); } catch (e) {} });
    var prev = _rpPrevDay(day);
    _RP.job = { id: Date.now(), status: 'running', phase: 'switch', day: day, prev: prev, sessions: sessions, si: 0, slotIdx: 0, delay: Math.max(0, isNaN(delaySec) ? 0 : delaySec), orig: orig, saved: 0, failed: 0, errors: [], startedAt: Date.now(), init: false, msg: 'switching the trading dates', stop: false };
    _rpSave();
    _rpApplyDates(day, prev);
    reloadPage();
    return { ok: true };
}
function _rpStop() {
    var j = _RP.job; if (!j || j.status !== 'running') return;
    j.stop = true; _rpSave(); _rpSay('stopping: restoring the dates and reloading');
    // this tab runs the loop, or no loop is running: restore now (the reload ends a slot in progress; that slot is not saved).
    // Another tab runs it: it sees the flag within 3 s (mirror timer) and restores itself.
    if (_RP.busy || _rpLockFree()) { _rpFinish('stopped', 'stopped by you'); return; }
    // the runner is another tab: if it has not reacted in 10 s (old code, busy page, closed), restore from this tab
    setTimeout(function () { try { var st = JSON.parse(localStorage.getItem(_RP_KEY) || 'null'); if (st && st.status === 'running') { _RP.job = st; _rpFinish('stopped', 'stopped by you (the running tab did not respond)'); } } catch (e) {} }, 10000);
}
function _rpFinish(status, msg) {
    var j = _RP.job; if (!j) return;
    j.status = status; j.msg = msg || ''; j.endedAt = Date.now(); j.phase = 'restore';
    try { localStorage.setItem(_RP_LAST_KEY, JSON.stringify({ day: j.day, sessions: j.sessions, status: status, msg: msg || '', saved: j.saved, failed: j.failed, errors: j.errors.slice(-6), endedAt: j.endedAt, apiCalls: _RP.calls, apiErrors: _RP.apiErrors })); } catch (e) {}
    try { _rpApplyDates(j.orig.current_day_date, j.orig.previous_day_date); g_config.set('mcx_current_day_date', j.orig.mcx_current_day_date); g_config.set('mcx_previous_day_date', j.orig.mcx_previous_day_date); _gtbPersistConfigSnapshot(); } catch (e) {}
    try { localStorage.removeItem('GTB_HIST_TIME'); localStorage.removeItem('GTB_AP_STATE'); } catch (e) {}
    try { if (typeof _apResetCaches === 'function') _apResetCaches(); } catch (e) {}
    try { localStorage.removeItem(_RP_KEY); localStorage.removeItem('GTB_RPLOCK'); } catch (e) {}
    _RP.job = null; _RP.cache = {};
    setTimeout(function () { reloadPage(); }, 500);
}
async function _rpReady() {
    for (var i = 0; i < 90; i++) {
        _rpSay('waiting for the instrument lists to load (' + i + ' s)');
        var ok = false;
        try {
            var need = (_RP.job && _RP.job.sessions) || [];
            ok = Object.keys(INSTRUMENT_TOKENS).length > 0 && typeof loadOpenPrice === 'function' && typeof autoRefreshEachTabs === 'function'
                && (need.indexOf('NSE') === -1 || (typeof OPTION_STRIKE_LIST !== 'undefined' && OPTION_STRIKE_LIST.length > 0))
                && (need.indexOf('MCX') === -1 || (typeof COMMODITIES_FUTURE_INSTRUMENT_LIST !== 'undefined' && COMMODITIES_FUTURE_INSTRUMENT_LIST.length > 0));
        } catch (e) {}
        if (ok) return true; await _rpSleep(1000);
    }
    return false;
}
function _rpSetTime(slot) { try { localStorage.setItem('GTB_HIST_TIME', slot); } catch (e) {} try { jQ('#gtb-hist-time').val(slot); } catch (e) {} }
async function _rpInit(j) {
    _rpSay('preparing: clearing the daily caches');
    if (typeof _apResetCaches === 'function') _apResetCaches();
    var hasNse = j.sessions.indexOf('NSE') !== -1;
    _rpSetTime(hasNse ? '09:20' : '09:05');
    if (hasNse) {
        for (var i = 0; i < 3; i++) {
            _rpSay('loading the prices of ' + j.day + (i ? ' (try ' + (i + 1) + ')' : ''));
            try { await loadOpenPrice({ silent: true }); } catch (e) {}
            if (typeof _apPricesComplete === 'function' ? _apPricesComplete() : true) break;
        }
        _rpSay('running the 9:15 scan');
        try { localStorage.removeItem('VALID_BREAKOUT_NINE_FIFTEEN'); await scanNineFifteenCandle(); } catch (e) { j.errors.push('9:15 scan: ' + (e && e.message || e)); }
        try { if (!jQ('#main-trade-bot-container').length) showGrootTradeBot(); } catch (e) { j.errors.push('dashboard: ' + (e && e.message || e)); }
        await _rpSleep(2500);
    }
    j.init = true; _rpSave();
}
async function _rpSlot(j, session, slot) {
    _rpSetTime(slot);
    var t0 = Date.now(), err = null;
    for (var w = 0; w < 120 && typeof _GTB_REFRESH_IN_PROGRESS !== 'undefined' && _GTB_REFRESH_IN_PROGRESS; w++) await _rpSleep(1000);
    try {
        var work = session === 'NSE' ? (function () { window._GTB_LAST_REFRESH_AT = 0; return autoRefreshEachTabs(null, true); })() : Promise.all(_RP_MCX.map(function (n) { return _gtbIsMcxFuture(n) ? _tfMcxLoad(n) : Promise.resolve(); }));
        await Promise.race([work, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('the refresh took more than 5 minutes')); }, 300000); })]);
    } catch (e) { err = e && e.message ? e.message : String(e); }
    await _rpSleep(1500);                                   // let the cards that chain off the refresh finish
    var snap = _rpSnapshot(j.day, session, slot);
    snap.refreshMs = Date.now() - t0; if (err) snap.errors.push('refresh: ' + err);
    var r = null;
    for (var a = 0; a < 3; a++) { r = await _rpPost(snap); if (r.ok) break; await _rpSleep(3000); }
    if (!r.ok) throw new Error('could not save the snapshot: ' + r.error);
    j.saved++; if (err) { j.failed++; j.errors.push(session + ' ' + slot + ': ' + err); }
    // what this slot looked like, so the panel can show real values changing from slot to slot
    var first = snap.inst[Object.keys(snap.inst)[0]] || {}, nm = Object.keys(snap.inst)[0] || '';
    var row = { s: session + ' ' + slot, nm: nm, px: first.px && first.px.ltp, sc: first.score && first.score.total, fut: first.fut && first.fut.remark, cons: first.cons && first.cons.out, comp: snap.mkt && snap.mkt.scores && snap.mkt.scores.composite, kb: Math.round(JSON.stringify(snap).length / 1024), ms: snap.refreshMs, er: snap.errors.length, ch: first.chain ? first.chain.length : 0 };
    (j.recent = j.recent || []).push(row); if (j.recent.length > 8) j.recent.shift();
    j.slotMs = (j.slotMs || 0) + (Date.now() - t0) + j.delay * 1000; j.slotN = (j.slotN || 0) + 1;
}
// Keep the browser from throttling / freezing this tab while a replay runs (best effort, every part is optional):
// a Web Lock held for the run (Chrome does not freeze a page holding one), a screen wake lock (only while the tab is visible) and a silent audio stream
// (Chrome does not apply the once-a-minute timer limit to a tab that is playing audio). Audio needs one click on the page after a reload.
function _rpKeepAwake() {
    if (_RP.awake) return; _RP.awake = true;
    try { if (navigator.locks && navigator.locks.request) navigator.locks.request('gtb-replay-running', function () { return new Promise(function (res) { _RP.releaseLock = res; }); }); } catch (e) {}
    var wl = function () { try { if (navigator.wakeLock && document.visibilityState === 'visible') navigator.wakeLock.request('screen').then(function (s) { _RP.wake = s; }).catch(function () {}); } catch (e) {} };
    wl(); document.addEventListener('visibilitychange', wl);
    var au = function () {
        try {
            if (!_RP.ac) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; _RP.ac = new AC(); var o = _RP.ac.createOscillator(), g = _RP.ac.createGain(); g.gain.value = 0.0005; o.frequency.value = 40; o.connect(g); g.connect(_RP.ac.destination); o.start(); }
            if (_RP.ac.state === 'suspended') _RP.ac.resume();
        } catch (e) {}
    };
    au(); document.addEventListener('click', au, true); document.addEventListener('keydown', au, true);
}
async function _rpRun() {
    if (_RP.busy) return;
    if (!_rpLockTake()) { _rpSay('running in another tab'); return; }
    _RP.busy = true; _RP.progressAt = Date.now(); _rpKeepAwake();
    try { var st0 = JSON.parse(localStorage.getItem(_RP_KEY) || 'null'); if (st0 && st0.status === 'running') _RP.job = st0; } catch (e) {}
    var j = _RP.job;
    try {
        if (!(await _rpReady())) { _rpFinish('error', 'the dashboard did not finish loading'); return; }
        j.phase = 'init'; _rpSave();
        if (!j.init) await _rpInit(j);
        j.phase = 'slots'; _rpSave();
        for (; j.si < j.sessions.length; j.si++, j.slotIdx = 0) {
            var session = j.sessions[j.si], slots = _rpSlots(session);
            if (j.slotIdx === 0) { _rpSetTime(slots[0]); }
            j.pfDone = j.pfDone || {};
            if (!j.pfDone[session]) { await _rpPrefetch(j, session); if (_RP.fatal) { _rpFinish('error', _RP.fatal); return; } if (j.stop) { _rpFinish('stopped', 'stopped by you'); return; } j.pfDone[session] = true; _rpSave(); }
            for (; j.slotIdx < slots.length; j.slotIdx++) {
                try { var stf = JSON.parse(localStorage.getItem(_RP_KEY) || 'null'); if (stf && stf.stop) j.stop = true; } catch (e) {}      // a Stop clicked in another tab
                if (!_rpLockHeld()) { _rpSay('another tab took over'); return; }
                if (j.stop) { _rpFinish('stopped', 'stopped by you'); return; }
                if (_RP.fatal) { _rpFinish('error', _RP.fatal); return; }
                var slot = slots[j.slotIdx];
                _rpSay(session + ' ' + slot + ' (' + (j.slotIdx + 1) + ' of ' + slots.length + ')');
                await _rpSlot(j, session, slot);
                j.slotIdx++; _rpSave(); j.slotIdx--;                      // the saved state points at the NEXT slot
                if (_RP.fatal) { _rpFinish('error', _RP.fatal); return; }
                await _rpSleep(j.delay * 1000);
            }
        }
        _rpFinish('done', 'all slots saved');
    } catch (e) { _rpFinish('error', e && e.message ? e.message : String(e)); }
    finally { _RP.busy = false; }
}
// at page load: continue a job that is in progress
setTimeout(function () {
    try {
        var j = _RP.job; if (!j || j.status !== 'running') return;
        if (Date.now() - j.startedAt > 14 * 3600000) { _rpFinish('error', 'the replay was left for more than 14 hours'); return; }
        var cur = typeof CURRENT_DAY !== 'undefined' ? CURRENT_DAY : '';
        if (cur !== j.day) { _rpFinish('error', 'the trading date did not switch to ' + j.day + ' (it is ' + cur + ')'); return; }
        _rpRun();
    } catch (e) {}
}, 9000);
// every 3 s: a tab that is not running the job mirrors it from localStorage (banner, panel); when the job is gone it reloads to pick up the restored dates;
// when the runner has been silent for 4 minutes it takes the job over and continues from the saved slot
setInterval(function () {
    try {
        var st = JSON.parse(localStorage.getItem(_RP_KEY) || 'null');
        if (_RP.busy) {
            if (st && st.status === 'running' && st.stop && _RP.job && _RP.job.status === 'running') { _RP.job.stop = true; _rpFinish('stopped', 'stopped by you'); return; }
            // watchdog: the loop has said nothing for 15 minutes (a hidden tab throttled or frozen by the browser, the computer slept, a call that never came back).
            // Restart this page; the saved job state points at the slot in progress, so it carries on from there. At most 30 self-restarts per job.
            if (_RP.job && _RP.job.status === 'running' && Date.now() - (_RP.progressAt || Date.now()) > 15 * 60000 && (_RP.job.restarts || 0) < 30) {
                _RP.job.restarts = (_RP.job.restarts || 0) + 1; _RP.job.msg = 'stalled, restarting the page (' + _RP.job.restarts + ')'; _rpSave();
                try { localStorage.removeItem('GTB_RPLOCK'); } catch (e) {}
                _RP.busy = false; setTimeout(reloadPage, 300);
            }
            return;
        }
        if (_RP.job && _RP.job.status === 'running' && (!st || st.status !== 'running') && _RP.job.phase !== 'switch') { setTimeout(reloadPage, 800); _RP.job = null; return; }
        _RP.job = st;
        if (st && st.status === 'running' && st.phase !== 'switch' && _rpLockFree() && Date.now() - st.startedAt > 20000 && !_RP.takeoverDone) { _RP.takeoverDone = true; _rpRun(); }
    } catch (e) {}
}, 3000);

// ── always-visible progress banner + failure notice ──
// A replay works in the background for a while after the reload (waiting for the lists, clearing caches, loading prices, the 9:15 scan) before the
// dashboard opens, so a banner shows what it is doing, and a run that ends in an error raises the red API notice after the restoring reload.
GM_addStyle('#gtb-rp-banner{position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:99300;background:#7a4b00;color:#fff;border:1px solid #f0b040;padding:5px 12px;font:600 12px/1.4 system-ui,sans-serif;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;box-shadow:0 2px 10px rgba(0,0,0,.4);max-width:92vw;}'
    + '#gtb-rp-banner button{background:#fff;color:#7a4b00;border:0;padding:2px 10px;font-weight:700;cursor:pointer;}'
    + '#gtb-rp-banner .rp-bar{width:120px;height:5px;background:rgba(255,255,255,.3);}#gtb-rp-banner .rp-bar i{display:block;height:5px;background:#fff;}');
function _rpDur(ms) { var m = Math.round(ms / 60000); return m < 1 ? '<1 min' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; }
function _rpProgress(j) {
    var total = 0, done = 0; j.sessions.forEach(function (s, i) { var n = _rpSlots(s).length; total += n; done += i < j.si ? n : (i === j.si ? j.slotIdx : 0); });
    var avg = j.slotN ? j.slotMs / j.slotN : 0, eta = avg && total > done ? avg * (total - done) : 0;
    return { total: total, done: done, pct: total ? Math.round(done / total * 100) : 0, eta: eta, elapsed: Date.now() - j.startedAt };
}
function _rpFmt(n, d) { return n == null || !isFinite(n) ? '-' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: d == null ? 2 : d }); }
function _rpLastLine(j) {
    var r = j.recent && j.recent[j.recent.length - 1]; if (!r) return 'no slot saved yet';
    return r.s + ': ' + r.nm + ' ' + _rpFmt(r.px) + ' &middot; score ' + _rpFmt(r.sc, 1) + ' &middot; futures ' + _rpEsc(r.fut || '-') + ' &middot; consensus ' + _rpEsc(r.cons || '-') + ' &middot; ' + r.kb + ' KB, ' + (r.ms ? (r.ms / 1000).toFixed(1) + ' s' : '-') + (r.er ? ', ' + r.er + ' section error(s)' : '');
}
function _rpBanner() {
    var j = _RP.job, $b = jQ('#gtb-rp-banner');
    if (!j || j.status !== 'running') { if ($b.length) $b.remove(); return; }
    var pg = _rpProgress(j), total = pg.total, done = pg.done, pct = pg.pct;
    // the button is created once and never re-rendered: replacing it every second made a click (press + release) land on a new element and do nothing
    var html = '<span>REPLAY ' + _rpEsc(j.day) + ' ' + _rpEsc(j.sessions.join(' + ')) + '</span><span class="rp-bar"><i style="width:' + pct + '%"></i></span><span>' + done + ' / ' + total + ' slots &middot; saved ' + j.saved + '</span><span style="font-weight:400;">' + _rpEsc(j.stop ? 'stopping: restoring the dates and reloading' : (j.msg || _RP.msg || 'starting')) + '</span>'
        + '<div style="flex-basis:100%;font-weight:400;font-size:11px;opacity:.95;">Kite API calls ' + _RP.calls + (_RP.apiErrors ? ' (' + _RP.apiErrors + ' failed)' : '') + ' &middot; from the server\'s disk copy ' + _RP.diskHits + ' &middot; from memory ' + _RP.hits + ' of ' + _RP.served + ' requests &middot; elapsed ' + _rpDur(pg.elapsed) + (pg.eta ? ' &middot; about ' + _rpDur(pg.eta) + ' left' : '') + '<br>' + _rpLastLine(j) + '</div>';
    if (!$b.length) jQ('body').append('<div id="gtb-rp-banner"><div id="gtb-rp-banner-info" style="display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;flex:1 1 auto;"></div><button id="gtb-rp-banner-stop">Stop and restore</button></div>');
    jQ('#gtb-rp-banner-info').html(html);
}
jQ(document).on('click', '#gtb-rp-banner-stop', function () { _rpStop(); });
setInterval(function () { try { _rpBanner(); } catch (e) {} }, 1000);
setTimeout(function () {
    try {
        var last = JSON.parse(localStorage.getItem(_RP_LAST_KEY) || 'null');
        if (last && last.status === 'error' && !last.shown && Date.now() - last.endedAt < 15 * 60000) {
            last.shown = true; localStorage.setItem(_RP_LAST_KEY, JSON.stringify(last));
            if (typeof _gtbApiFail === 'function') _gtbApiFail('replay-recorder', 'Replay recorder stopped', last.msg || 'unknown error', 'Your trading dates were restored. Saved ' + last.saved + ' slot(s) before it stopped.');
        }
    } catch (e) {}
}, 6000);

// ── panel section (shown inside the Data Recorder popup) ──
function _rpPanelHtml() {
    var today = _rpToday(), first = today.slice(0, 8) + '01';
    return '<div style="padding:8px;border:1px solid var(--gtb-border);margin-bottom:10px;"><div style="font-weight:800;font-size:.52rem;letter-spacing:.06em;color:var(--gtb-muted);margin-bottom:6px;">REPLAY A DAY WITH THE DASHBOARD LOGIC (every metric, every 5-minute slot)</div>'
        + '<div id="rp-state" style="margin-bottom:6px;"></div>'
        + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><input type="date" id="rp-day" min="' + first + '" max="' + today + '" value="' + today + '" style="background:var(--gtb-surface2);color:var(--gtb-text);border:1px solid var(--gtb-border);padding:2px 6px;">'
        + '<label><input type="checkbox" id="rp-nse" checked> NSE</label><label><input type="checkbox" id="rp-mcx" checked> MCX</label>'
        + '<label title="Wait between two 5-minute slots">delay <input type="number" id="rp-delay" min="0" max="120" value="0" style="width:52px;background:var(--gtb-surface2);color:var(--gtb-text);border:1px solid var(--gtb-border);"> s</label>'
        + '<button class="sv-pill-btn" id="rp-start">Start replay</button><button class="sv-pill-btn" id="rp-stop">Stop and restore</button></div>'
        + '<div style="margin-top:6px;color:var(--gtb-muted);font-size:.54rem;">Starting reloads this page with the four trading-date settings switched to that day; they are put back (and the page reloaded again) when the run ends or you stop it. Keep this tab open: it can take about an hour or more per day (NSE 75 slots, MCX 179 slots, each followed by the delay). All price history comes from the official API with your key and token.</div></div>';
}
function _rpRenderState() {
    var $s = jQ('#rp-state'); if (!$s.length) return;
    var j = _RP.job, last = null; try { last = JSON.parse(localStorage.getItem(_RP_LAST_KEY) || 'null'); } catch (e) {}
    if (j && j.status === 'running') {
        var total = 0, done = 0; j.sessions.forEach(function (s, i) { var n = _rpSlots(s).length; total += n; done += i < j.si ? n : (i === j.si ? j.slotIdx : 0); });
        var pct = total ? Math.round(done / total * 100) : 0;
        var pg2 = _rpProgress(j);
        var recent = (j.recent || []).slice().reverse().map(function (r) { return '<tr style="border-top:1px solid var(--gtb-border);"><td style="padding:1px 4px;">' + _rpEsc(r.s) + '</td><td style="text-align:right;font-family:var(--gtb-mono);">' + _rpFmt(r.px) + '</td><td style="text-align:right;">' + _rpFmt(r.sc, 1) + '</td><td>' + _rpEsc(r.fut || '-') + '</td><td>' + _rpEsc(r.cons || '-') + '</td><td style="text-align:right;">' + _rpFmt(r.comp, 1) + '</td><td style="text-align:right;">' + r.ch + '</td><td style="text-align:right;">' + r.kb + ' KB</td><td style="text-align:right;">' + (r.ms ? (r.ms / 1000).toFixed(1) + ' s' : '-') + '</td><td style="color:' + (r.er ? 'var(--gtb-amber)' : 'var(--gtb-muted)') + ';text-align:right;">' + r.er + '</td></tr>'; }).join('');
        $s.html('<div><b style="color:var(--gtb-amber);">RUNNING</b> ' + _rpEsc(j.day) + ' ' + _rpEsc(j.sessions.join(' + ')) + ' &middot; ' + done + ' of ' + total + ' slots &middot; saved ' + j.saved + (j.failed ? ', <span style="color:var(--gtb-red);">' + j.failed + ' with a refresh error</span>' : '') + ' &middot; official API calls ' + _RP.calls + (_RP.apiErrors ? ' (' + _RP.apiErrors + ' failed)' : '') + '</div>'
            + '<div style="height:6px;background:var(--gtb-border);margin:5px 0;"><div style="height:6px;width:' + pct + '%;background:var(--gtb-amber);"></div></div><div style="color:var(--gtb-muted);font-size:.56rem;">' + _rpEsc(j.msg || _RP.msg || '') + '</div>'
            + '<div style="font-size:.54rem;margin-top:4px;">Kite API calls <b>' + _RP.calls + '</b>' + (_RP.apiErrors ? ' (<span style="color:var(--gtb-red);">' + _RP.apiErrors + ' failed</span>)' : '') + ' &middot; from the server\'s disk copy <b>' + _RP.diskHits + '</b> &middot; from memory <b>' + _RP.hits + '</b> of ' + _RP.served + ' requests &middot; elapsed <b>' + _rpDur(pg2.elapsed) + '</b>' + (pg2.eta ? ' &middot; about <b>' + _rpDur(pg2.eta) + '</b> left' : '') + '</div>'
            + (recent ? '<table style="width:100%;border-collapse:collapse;font-size:.54rem;margin-top:4px;"><thead><tr style="color:var(--gtb-muted);text-align:left;font-size:.46rem;"><th>SLOT</th><th style="text-align:right;">PRICE</th><th style="text-align:right;">SCORE</th><th>FUTURES</th><th>CONSENSUS</th><th style="text-align:right;">COMPOSITE</th><th style="text-align:right;">CHAIN ROWS</th><th style="text-align:right;">SIZE</th><th style="text-align:right;">TIME</th><th style="text-align:right;">ERR</th></tr></thead><tbody>' + recent + '</tbody></table><div style="font-size:.46rem;color:var(--gtb-muted);">Last 8 saved slots: values change from slot to slot when it is working. PRICE and SCORE are for the first core instrument (NIFTY 50 for NSE, CRUDEOILM for MCX).</div>' : '')
            + (j.errors.length ? '<div style="color:var(--gtb-red);font-size:.5rem;margin-top:3px;">' + j.errors.slice(-3).map(_rpEsc).join('<br>') + '</div>' : ''));
    } else if (last) {
        var col = last.status === 'done' ? 'var(--gtb-green)' : last.status === 'error' ? 'var(--gtb-red)' : 'var(--gtb-amber)';
        $s.html('<div>Last run: <b style="color:' + col + ';">' + _rpEsc(last.status.toUpperCase()) + '</b> ' + _rpEsc(last.day) + ' ' + _rpEsc((last.sessions || []).join(' + ')) + ' &middot; saved ' + last.saved + (last.failed ? ', ' + last.failed + ' refresh error(s)' : '') + ' &middot; ' + _rpEsc(last.msg || '') + '</div>' + (last.errors && last.errors.length ? '<div style="color:var(--gtb-red);font-size:.5rem;">' + last.errors.map(_rpEsc).join('<br>') + '</div>' : ''));
    } else $s.html('<div style="color:var(--gtb-muted);">No replay has been run yet.</div>');
}
jQ(document).on('click', '#rp-start', async function () {
    var sessions = []; if (jQ('#rp-nse').is(':checked')) sessions.push('NSE'); if (jQ('#rp-mcx').is(':checked')) sessions.push('MCX');
    if (!window.confirm('Replay ' + jQ('#rp-day').val() + ' (' + sessions.join(' + ') + ')?\n\nThe page reloads with the trading dates switched to that day and everything you see in the dashboard is that day until the run ends. The dates are restored automatically. Keep this tab open.')) return;
    var r = await _rpStart(jQ('#rp-day').val(), sessions, parseFloat(jQ("#rp-delay").val()));
    if (!r.ok) jQ('#rp-state').html('<span style="color:var(--gtb-red);">' + _rpEsc(r.error) + '</span>');
});
jQ(document).on('click', '#rp-stop', function () { _rpStop(); _rpRenderState(); });
setInterval(function () { try { _rpRenderState(); } catch (e) {} }, 1500);
