// ─────────────────────────────────────────────────────────────────────────────────────────────
// Probable trade: entry-zone alert + outcome log (v29.505). Reads the same plan the Dashboard "Probable trade from today's metrics" card shows
// (`_gtbOutlook`) for NIFTY 50, NIFTY BANK and SENSEX. It never places an order.
//   1. Alert: when a plan's entry is a pullback / rally zone and price gets to it, a toast + beep, and a Telegram message if the card's checkbox is on.
//   2. Log: every distinct plan (index, side, entry zone) is recorded once per day with its stop and target 1, and followed through today's 5-minute
//      candles: WAITING (entry not reached) > ENTERED > TARGET or STOPPED (stop is checked first inside a candle, the conservative reading), or MISSED
//      (target 1 reached without the entry being touched). At the end of the day WAITING becomes NOT REACHED and ENTERED becomes OPEN AT CLOSE.
//      The card's "Does it work? (log)" button adds the days up. A few days prove nothing, and these are paper outcomes (no costs, no slippage).
// Called from `_tfTick` (every full refresh and the live light tick), at most once a minute.
// ─────────────────────────────────────────────────────────────────────────────────────────────

var _OLW = { last: 0, names: ['NIFTY 50', 'NIFTY BANK', 'SENSEX'] };

function _olwDay() { return (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? CURRENT_DAY : moment().format('YYYY-MM-DD'); }
function _olwKey(day) { return 'GTB_OL_LOG_' + day; }
function _olwLoad(day) { try { return JSON.parse(localStorage.getItem(_olwKey(day)) || '[]') || []; } catch (e) { return []; } }
function _olwSave(day, arr) {
    try { var v = JSON.stringify(arr); if (typeof _gtbLsSet === 'function') _gtbLsSet(_olwKey(day), v); else localStorage.setItem(_olwKey(day), v); } catch (e) {}
    try {   // keep 25 days
        var keys = []; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('GTB_OL_LOG_') === 0) keys.push(k); }
        keys.sort(); while (keys.length > 25) localStorage.removeItem(keys.shift());
    } catch (e) {}
}
function _olwTg() { try { return localStorage.getItem('GTB_OL_TG') === '1'; } catch (e) { return false; } }

// Walk the candles after the plan was logged and move its status along. cursor = time of the last candle already used.
function _olwAdvance(e, candles) {
    if (!candles || !candles.length || e.done) return;
    for (var i = 0; i < candles.length; i++) {
        var c = candles[i], ts = moment(c[0]).valueOf();
        if (!isFinite(ts) || ts + 300000 <= e.at || (e.cursor && ts <= e.cursor)) continue;      // only candles that closed after the plan was first seen
        var hi = parseFloat(c[2]), lo = parseFloat(c[3]);
        if (!isFinite(hi) || !isFinite(lo)) continue;
        if (e.status === 'WAITING') {
            var touched = e.long ? lo <= e.entry : hi >= e.entry;
            if (touched) { e.status = 'ENTERED'; e.enteredAt = moment(ts).format('HH:mm'); }
            else if (e.t1 != null && (e.long ? hi >= e.t1 : lo <= e.t1)) { e.status = 'MISSED'; e.done = true; e.endAt = moment(ts).format('HH:mm'); }
        }
        if (e.status === 'ENTERED') {
            var stopHit = e.long ? lo <= e.stop : hi >= e.stop;
            var tgtHit = e.t1 != null && (e.long ? hi >= e.t1 : lo <= e.t1);
            if (stopHit) { e.status = 'STOPPED'; e.done = true; e.endAt = moment(ts).format('HH:mm'); }
            else if (tgtHit) { e.status = 'TARGET'; e.done = true; e.endAt = moment(ts).format('HH:mm'); }
        }
        e.cursor = ts;
        if (e.done) break;
    }
}

function _olwBeep() { try { if (typeof _gtbSqzBeepBurst === 'function') _gtbSqzBeepBurst(); } catch (e) {} }

function _olwAlert(e, o) {
    var f0 = function (x) { return Math.round(x).toLocaleString('en-IN'); };
    var side = e.long ? 'LONG' : 'SHORT';
    var msg = e.nm + ': price ' + f0(o.spot) + ' is at the ' + side + ' entry zone ' + f0(e.entry) + ' (stop ' + f0(e.stop) + (e.t1 != null ? ', target 1 ' + f0(e.t1) : '') + '). Probable trade, rule-based.';
    try { if (typeof _gtbToast === 'function') _gtbToast(msg, 'info'); } catch (er) {}
    _olwBeep();
    if (_olwTg()) {
        var token = (typeof g_config !== 'undefined' ? g_config.get('telegram_bot_token') : '') || '', chatId = (typeof g_config !== 'undefined' ? g_config.get('telegram_chat_id') : '') || '';
        if (token && chatId && typeof _psTelegramSendOne === 'function') {
            _psTelegramSendOne(token, chatId, '<b>Probable trade: ' + side + ' entry zone</b>\n' + msg.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '\nNo order is placed.').catch(function () {});
        }
    }
}

function _olwTick(force) {
    if (!force && Date.now() - _OLW.last < 60000) return;
    _OLW.last = Date.now();
    try {
        if (typeof _gtbOutlook !== 'function') return;
        if (typeof _gtbHistTime === 'function' && _gtbHistTime()) return;                       // a snapshot / replay is not live
        var now = moment(), mins = now.hours() * 60 + now.minutes();
        var real = now.format('YYYY-MM-DD');
        if (_olwDay() !== real || now.day() === 0 || now.day() === 6) return;                   // live day only
        if (mins < 565 || mins > 935) return;                                                   // 09:25 to 15:35
        var day = real, log = _olwLoad(day), changed = false;
        _OLW.names.forEach(function (nm) {
            var o = null; try { o = _gtbOutlook(nm); } catch (e) {}
            if (!o || !o.ok) return;
            var cs = (INSTRUMENT_SCORE_MAP[nm] || {}).oiData; cs = cs && cs.spotCandles;
            if (o.plan) {
                var p = o.plan, key = nm + '|' + (p.long ? 'L' : 'S') + '|' + Math.round(p.entryPx);
                var e = log.filter(function (x) { return x.key === key; })[0];
                if (!e) {
                    e = { key: key, nm: nm, m: now.format('HH:mm'), at: Date.now(), long: p.long, rank: o.rank, entry: p.entryPx, stop: p.stop, t1: p.t1 ? p.t1.price : null, spot0: o.spot, status: p.atLevel ? 'ENTERED' : 'WAITING', alerted: !!p.atLevel };
                    if (p.atLevel) e.enteredAt = now.format('HH:mm');
                    log.push(e); changed = true;
                }
                var before = e.status + '|' + e.cursor;
                _olwAdvance(e, cs);
                if (e.status + '|' + e.cursor !== before) changed = true;
                // alert once when a pullback / rally entry is reached by price (within twice the "at level" band of the card)
                if (!e.alerted && e.status === 'WAITING' && Math.abs(o.spot - e.entry) <= o.spot * _GTB_OL_NEAR_PCT * 2 / 100) { e.alerted = true; changed = true; _olwAlert(e, o); }
            }
            // keep following earlier plans of this name even if the current plan moved on
            log.forEach(function (x) { if (x.nm === nm && !x.done && x !== undefined) { var b = x.status + '|' + x.cursor; _olwAdvance(x, cs); if (x.status + '|' + x.cursor !== b) changed = true; } });
        });
        if (changed) _olwSave(day, log);
    } catch (e) { console.warn('[probable-trade watch]', e); }
}

// ── Log viewer ──────────────────────────────────────────────────────────────────────────────────────────
function _olwAllDays() {
    var days = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('GTB_OL_LOG_') === 0) days.push(k.slice(11)); }
    return days.sort();
}
function _olwFinal(e, day) {
    if (e.done) return e.status;
    if (day === moment().format('YYYY-MM-DD')) return e.status;      // today is still running
    return e.status === 'WAITING' ? 'NOT REACHED' : e.status === 'ENTERED' ? 'OPEN AT CLOSE' : e.status;
}
function _olwLogHtml() {
    var days = _olwAllDays().reverse(), rows = [], tot = { plans: 0, entered: 0, TARGET: 0, STOPPED: 0, MISSED: 0, 'NOT REACHED': 0, 'OPEN AT CLOSE': 0, WAITING: 0, ENTERED: 0 };
    var byRank = { 3: { n: 0, t: 0, s: 0 }, 2: { n: 0, t: 0, s: 0 }, 1: { n: 0, t: 0, s: 0 } };
    days.forEach(function (d) {
        _olwLoad(d).forEach(function (e) {
            var st = _olwFinal(e, d); tot.plans++; tot[st] = (tot[st] || 0) + 1;
            if (e.enteredAt || st === 'TARGET' || st === 'STOPPED' || st === 'OPEN AT CLOSE') tot.entered++;
            if (byRank[e.rank]) { byRank[e.rank].n++; if (st === 'TARGET') byRank[e.rank].t++; if (st === 'STOPPED') byRank[e.rank].s++; }
            rows.push({ d: d, e: e, st: st });
        });
    });
    var f0 = function (x) { return x == null ? '-' : Math.round(x).toLocaleString('en-IN'); };
    var col = function (st) { return st === 'TARGET' ? 'var(--gtb-green)' : st === 'STOPPED' ? 'var(--gtb-red)' : st === 'WAITING' || st === 'ENTERED' ? 'var(--gtb-amber)' : 'var(--gtb-muted)'; };
    var rk = ['', 'LOW', 'MEDIUM', 'HIGH'];
    var decided = tot.TARGET + tot.STOPPED;
    var head = '<div style="font-size:0.62rem;line-height:1.5;">'
        + '<b>' + tot.plans + '</b> plans over ' + days.length + ' day' + (days.length === 1 ? '' : 's') + ': entry reached in <b>' + tot.entered + '</b>; of the ones that finished, <b style="color:var(--gtb-green);">' + tot.TARGET + ' hit target 1</b> and <b style="color:var(--gtb-red);">' + tot.STOPPED + ' hit the stop</b>'
        + (decided ? ' (' + Math.round(tot.TARGET / decided * 100) + '% target first)' : '') + '; ' + (tot.MISSED || 0) + ' ran to target without touching the entry, ' + (tot['NOT REACHED'] || 0) + ' never reached the entry, ' + (tot['OPEN AT CLOSE'] || 0) + ' were still open at the close.'
        + '<div style="color:var(--gtb-muted);font-size:0.52rem;margin-top:3px;">By confidence (target-first / stop-first): ' + [3, 2, 1].map(function (r) { return rk[r] + ' ' + byRank[r].t + ' / ' + byRank[r].s + ' of ' + byRank[r].n; }).join(' &middot; ') + '</div>'
        + '<div style="color:var(--gtb-muted);font-size:0.5rem;margin-top:3px;">Paper outcomes from 5-minute candles: no costs, no slippage; a stop and a target in the same candle count as the stop. A few days prove nothing.</div></div>';
    var table = rows.length ? '<table style="width:100%;border-collapse:collapse;font-size:0.56rem;margin-top:8px;"><thead><tr style="color:var(--gtb-muted);text-align:left;font-size:0.46rem;"><th style="padding:2px 6px;">DAY</th><th>TIME</th><th>INDEX</th><th>SIDE</th><th>CONF</th><th style="text-align:right;">ENTRY</th><th style="text-align:right;">STOP</th><th style="text-align:right;">TARGET 1</th><th>OUTCOME</th></tr></thead><tbody>'
        + rows.map(function (r) { var e = r.e; return '<tr style="border-top:1px solid var(--gtb-border);"><td style="padding:2px 6px;">' + r.d + '</td><td>' + e.m + '</td><td>' + e.nm + '</td><td style="color:' + (e.long ? 'var(--gtb-green)' : 'var(--gtb-red)') + ';font-weight:700;">' + (e.long ? 'LONG' : 'SHORT') + '</td><td>' + rk[e.rank] + '</td><td style="text-align:right;font-family:var(--gtb-mono);">' + f0(e.entry) + '</td><td style="text-align:right;font-family:var(--gtb-mono);">' + f0(e.stop) + '</td><td style="text-align:right;font-family:var(--gtb-mono);">' + f0(e.t1) + '</td><td style="color:' + col(r.st) + ';font-weight:700;">' + r.st + (e.endAt ? ' ' + e.endAt : '') + '</td></tr>'; }).join('') + '</tbody></table>'
        : '<div style="margin-top:8px;color:var(--gtb-muted);font-size:0.6rem;">No plans logged yet. A plan is logged the first time the Probable trade card shows an entry for NIFTY 50, NIFTY BANK or SENSEX during a live session.</div>';
    return '<div style="padding:10px;background:var(--gtb-bg);color:var(--gtb-text);height:100%;overflow:auto;box-sizing:border-box;">' + head + table + '</div>';
}
function _olwShowLog() {
    try { _olwTick(true); } catch (e) {}
    showPopUpWindow('ol-log', _olwLogHtml(), 'Probable trade log', 760, 460);
    var cls = 'popup-custom-style-ol-log';
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
    jQ('.' + cls).find('.popupwindow_titlebar_text').html('<div style="display:flex;align-items:center;gap:6px;width:100%;"><span style="font-weight:800;font-size:0.7rem;">PROBABLE TRADE LOG</span>' + popupWinControls(cls) + '</div>');
    hideNativePopupButtons(cls);
}
jQ(document).on('click', '#gtb-ol-log', function () { _olwShowLog(); });
jQ(document).on('change', '#gtb-ol-tg', function () { try { localStorage.setItem('GTB_OL_TG', this.checked ? '1' : '0'); } catch (e) {} });
