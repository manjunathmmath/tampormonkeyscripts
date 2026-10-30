// ── Trade Focus, stage 2 (v29.422): log the five row states at every full refresh, and an end-of-day review ─────────────
// Snapshot = { m: 'HH:MM', c: call, h: headline, d: direction (1 / -1 / 0), t: 'gwrn..' (one letter per row: g green, w amber,
// r red, n n/a), l: { row: sentence } } where l only holds sentences that changed since the previous snapshot (so a day stays small).
// One snapshot per minute at most, only while the dashboard is live (no replay / snapshot) between 09:15 and 15:35. Kept 25 days in
// localStorage 'GTB_FOCUS_LOG_<day>' (protected from the generic cache pruning in utils.js; pruned here). The review matches each
// journal trade (Notes tab: "Import from Kite" or manual rows) to the last snapshot at or before its entry time and adds up the P&L
// under each gate state. It is a record of what the gates said when you traded, over whatever sample you have; it is not a test of the
// gates, and a handful of trades proves nothing.
var _TF_KEYS = ['tradeable', 'direction', 'entry', 'risk', 'exit'];
var _TF_TITLES = { tradeable: 'Tradeable today?', direction: 'Direction', entry: 'Entry & timing', risk: 'Risk', exit: 'Exit' };
var _TF_CODE = { good: 'g', warn: 'w', bad: 'r', none: 'n' };
var _TF_CODE_COL = { g: 'var(--gtb-green)', w: 'var(--gtb-amber)', r: 'var(--gtb-red)', n: 'var(--gtb-muted)' };
var _TF_CODE_TXT = { g: 'green', w: 'amber', r: 'red', n: 'n/a' };
var _TF_LOG_KEEP_DAYS = 25;
var _TF_REVIEW_ALL = false;

// NIFTY 50 keeps the original key; a commodity is 'GTB_FOCUS_LOG_<NAME>_<day>'
function _tfLogKey(day, name) { return 'GTB_FOCUS_LOG_' + (name && name !== 'NIFTY 50' ? name + '_' : '') + (day || moment().format('YYYY-MM-DD')); }
function _tfLogLoad(day, name) { try { return JSON.parse(localStorage.getItem(_tfLogKey(day, name)) || '[]') || []; } catch (e) { return []; } }
function _tfLogLines(log) {
    var m = {};
    log.forEach(function (s) { Object.keys(s.l || {}).forEach(function (k) { m[k] = s.l[k]; }); });
    return m;
}
// full per-snapshot rows again (sentences carried forward)
function _tfLogExpand(log) {
    var cur = {};
    return log.map(function (s) {
        Object.keys(s.l || {}).forEach(function (k) { cur[k] = s.l[k]; });
        var rows = {};
        _TF_KEYS.forEach(function (k, i) { rows[k] = { tone: (s.t || '').charAt(i) || 'n', line: cur[k] || '' }; });
        return { m: s.m, c: s.c, h: s.h, d: s.d, rows: rows };
    });
}
function _tfLogSnapshot(res) {
    try {
        if (!res || !res.live) return false;
        var now = moment(), mins = now.hours() * 60 + now.minutes(), mcx = !!res.mcx;
        if (mcx ? !(typeof _tfMcxInSession === 'function' && _tfMcxInSession()) : (mins < 9 * 60 + 15 || mins > 15 * 60 + 35)) return false;
        var log = _tfLogLoad(null, res.name), hm = now.format('HH:mm');
        if (log.length && log[log.length - 1].m === hm) log.pop();                  // same minute: replace
        var prev = _tfLogLines(log);
        var snap = { m: hm, c: res.v ? res.v.call : '', h: res.v ? String(res.v.headline || '').replace(/<[^>]+>/g, '').slice(0, 90) : '', d: res.v ? (res.v.dir || 0) : 0, t: '', l: {} };
        res.rows.forEach(function (r) {
            snap.t += _TF_CODE[r.tone] || 'n';
            var ln = String(r.line || '').replace(/<[^>]+>/g, '').slice(0, 140);
            if (prev[r.key] !== ln) snap.l[r.key] = ln;
        });
        log.push(snap);
        var ok;
        if (typeof _gtbLsSet === 'function') ok = _gtbLsSet(_tfLogKey(null, res.name), JSON.stringify(log));
        else { try { localStorage.setItem(_tfLogKey(null, res.name), JSON.stringify(log)); ok = true; } catch (e) { ok = false; } }
        _tfLogPrune();
        return ok;
    } catch (e) { try { console.log('[trade-focus log]', e); } catch (e2) {} return false; }
}
function _tfLogDays(name) {
    var out = [], pre = 'GTB_FOCUS_LOG_' + (name && name !== 'NIFTY 50' ? name + '_' : '');
    for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(pre) === 0) { var d = k.slice(pre.length); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) out.push(d); }
    }
    return out.sort();
}
function _tfLogPrune() {
    try {
        var cutoff = moment().subtract(_TF_LOG_KEEP_DAYS, 'days').format('YYYY-MM-DD');
        var names = ['NIFTY 50'].concat(typeof _TF_MCX_NAMES !== 'undefined' ? _TF_MCX_NAMES : []);
        try { (typeof _gtbMcxDashNames === 'function' ? _gtbMcxDashNames() : []).forEach(function (n) { if (names.indexOf(n) === -1) names.push(n); }); } catch (e0) {}
        names.forEach(function (nm) { _tfLogDays(nm).forEach(function (d) { if (d < cutoff) localStorage.removeItem(_tfLogKey(d, nm)); }); });
    } catch (e) {}
}
// Called from setScore(): full = a full refresh finished (log it), show = repaint the tab if it is open.
function _tfTick(full, show) {
    try {
        var vis = jQ('#gtb-pane-focus').is(':visible'), cmdOpen = jQ('#cmd-crude-focus').length > 0;
        if (full && typeof _tfMcxAutoLoad === 'function') _tfMcxAutoLoad();        // keep GOLDM / SILVERM data current (loads in the background)
        if (!full && !(show && vis)) return;
        var shown = null;
        if (full || _TF_NAME === 'NIFTY 50') {
            var res = _tfCompute('NIFTY 50');
            if (full) _tfLogSnapshot(res);
            if (_TF_NAME === 'NIFTY 50') shown = res;
        }
        if (full) {                                       // commodities whose data has been loaded this session are logged too
            var names = (typeof _tfNames === 'function' ? _tfNames() : []).filter(function (n) { return n !== 'NIFTY 50'; });
            names.forEach(function (n) {
                var sm = INSTRUMENT_SCORE_MAP[n] || {};
                if (!(sm.oiData || sm.futures_trend_remark)) return;
                var r = _tfCompute(n);
                _tfLogSnapshot(r);
                if (_TF_NAME === n) shown = r;
            });
            if (cmdOpen && typeof _tfRenderCmd === 'function') _tfRenderCmd();
        }
        if (vis) _tfRender(shown);
    } catch (e) { try { console.log('[trade-focus tick]', e); } catch (e2) {} }
}

// ── review ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
function _tfMins(hm) { var m = /^(\d{1,2}):(\d{2})/.exec(String(hm || '')); return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null; }
function _tfSideDir(side) { var s = String(side || ''); return /buy ce|long/i.test(s) ? 1 : /buy pe|short/i.test(s) ? -1 : 0; }
// Trades of the day(s) with the snapshot that was current at entry. Reads localStorage only.
// Which journal rows belong to which instrument's gates: NIFTY 50 = the index family (NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX),
// a commodity = its own contracts (GOLDM26NOVFUT, GOLDM...CE). Stock trades belong to no gate set here and are left out.
function _tfTradeMatches(name, inst) {
    var s = String(inst || '').toUpperCase().replace(/\s+/g, '');
    var key = !name || name === 'NIFTY 50' ? 'NIFTY' : name === 'NIFTY BANK' ? 'BANKNIFTY' : name.toUpperCase();
    return new RegExp('^' + key + '(\\d|$)').test(s);
}
var _TF_REVIEW_NAME = 'NIFTY 50';
function _tfReviewData(all, name) {
    name = name || _TF_REVIEW_NAME;
    var today = moment().format('YYYY-MM-DD');
    var days = all ? _tfLogDays(name) : [today], trades = [], snapsToday = [], other = 0;
    days.forEach(function (day) {
        var snaps = _tfLogExpand(_tfLogLoad(day, name));
        if (day === today) snapsToday = snaps;
        var journal = (typeof _gtbDiaryLoadJournal === 'function') ? _gtbDiaryLoadJournal(day) : [];
        journal.forEach(function (row) {
            if (!_tfTradeMatches(name, row.instrument)) { other++; return; }
            var t = _tfMins(row.time), snap = null;
            var pnl = (typeof _gtbDiaryComputePnl === 'function') ? _gtbDiaryComputePnl(row) : null;
            if (t != null) snaps.forEach(function (s) { var sm = _tfMins(s.m); if (sm != null && sm <= t) snap = s; });
            trades.push({ day: day, row: row, pnl: pnl, snap: snap, dir: _tfSideDir(row.side) });
        });
    });
    return { days: days, trades: trades, snapsToday: snapsToday, other: other, name: name };
}
// P&L by gate state and by agreement with the verdict. Only trades that have both a snapshot and a P&L.
function _tfReviewStats(trades) {
    var use = trades.filter(function (x) { return x.snap && x.pnl !== null && x.pnl !== undefined; });
    var bucket = function () { return { n: 0, wins: 0, pnl: 0 }; };
    var add = function (b, p) { b.n++; if (p > 0) b.wins++; b.pnl += p; };
    var gates = {}, verdict = { with: bucket(), against: bucket(), none: bucket() };
    _TF_KEYS.forEach(function (k) { gates[k] = { g: bucket(), w: bucket(), r: bucket() }; });
    use.forEach(function (x) {
        _TF_KEYS.forEach(function (k) { var c = x.snap.rows[k].tone; if (gates[k][c]) add(gates[k][c], x.pnl); });
        var a = x.dir * (x.snap.d || 0);
        add(a > 0 ? verdict.with : a < 0 ? verdict.against : verdict.none, x.pnl);
    });
    return { used: use.length, total: trades.length, gates: gates, verdict: verdict };
}
function _tfDots(rows) {
    return _TF_KEYS.map(function (k) {
        var c = rows[k].tone, tip = _TF_TITLES[k] + ': ' + _TF_CODE_TXT[c] + (rows[k].line ? ' - ' + String(rows[k].line).replace(/"/g, '&quot;') : '');
        return '<span title="' + tip + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:3px;background:' + _TF_CODE_COL[c] + ';"></span>';
    }).join('');
}
function _tfRs(n) { return (n >= 0 ? '+' : '-') + '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN'); }

function _tfReviewHtml(all) {
    var d = _tfReviewData(all), st = _tfReviewStats(d.trades), M = 'var(--gtb-muted)';
    var th = 'text-align:left;padding:3px 8px;font-size:0.5rem;letter-spacing:0.04em;color:' + M + ';border-bottom:1px solid var(--gtb-border);';
    var td = 'padding:3px 8px;border-bottom:1px solid var(--gtb-border);font-size:0.58rem;';
    var h = '<div style="padding:10px 12px;font-size:0.62rem;color:var(--gtb-text);">';
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">' + (typeof _tfNames === 'function' ? _tfNames() : ['NIFTY 50']).map(function (n) {
        return '<button class="tf-rv-name gtb-win-btn" data-name="' + n + '" style="width:auto;font-size:0.55rem;padding:2px 10px;' + (n === d.name ? 'background:var(--gtb-accent);color:#fff;font-weight:800;' : '') + '">' + n + '</button>';
    }).join('') + '</div>';
    h += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">'
        + '<b>' + d.name + ' · ' + (all ? 'all logged days (' + d.days.length + ')' : 'today') + '</b>'
        + '<button id="tf-rv-scope" class="gtb-win-btn" style="width:auto;font-size:0.5rem;padding:2px 8px;">' + (all ? 'Show today only' : 'Show all logged days') + '</button>'
        + '<button id="tf-rv-import" class="gtb-win-btn" style="width:auto;font-size:0.5rem;padding:2px 8px;" title="Pulls today\'s fills from Kite into the Notes-tab journal (the same as Notes > Import from Kite), then redraws this review"><i class="bi bi-cloud-download"></i> Import today\'s trades from Kite</button>'
        + '<span style="color:' + M + ';">' + d.snapsToday.length + ' snapshots logged today' + (d.other ? ' · ' + d.other + ' journal row' + (d.other > 1 ? 's' : '') + ' in other instruments not shown' : '') + '</span></div>';

    h += '<div style="font-weight:800;font-size:0.55rem;letter-spacing:0.06em;color:' + M + ';margin:6px 0 3px;">TRADES AND THE GATES AT ENTRY</div>';
    if (!d.trades.length) {
        h += '<div style="color:' + M + ';padding:6px 0;">No trades in the journal' + (all ? '' : ' for today') + ' yet. Use <b>Import today\'s trades from Kite</b> (or add them in the Notes tab).</div>';
    } else {
        h += '<table style="width:100%;border-collapse:collapse;"><thead><tr>'
            + '<th style="' + th + '">' + (all ? 'Day &middot; ' : '') + 'Time</th><th style="' + th + '">Instrument</th><th style="' + th + '">Side</th><th style="' + th + '">P&amp;L</th>'
            + '<th style="' + th + '">Gates at entry</th><th style="' + th + '">Verdict at entry</th><th style="' + th + '">Trade vs verdict</th></tr></thead><tbody>';
        d.trades.forEach(function (x) {
            var hasPnl = x.pnl !== null && x.pnl !== undefined;
            var pc = !hasPnl ? M : x.pnl > 0 ? 'var(--gtb-green)' : x.pnl < 0 ? 'var(--gtb-red)' : M, rel;
            if (!x.snap) rel = '<span style="color:' + M + ';">no snapshot</span>';
            else if (!x.snap.d) rel = '<span style="color:var(--gtb-amber);">verdict had no direction</span>';
            else if (!x.dir) rel = '<span style="color:' + M + ';">side unknown</span>';
            else rel = x.dir * x.snap.d > 0 ? '<span style="color:var(--gtb-green);">with the verdict</span>' : '<span style="color:var(--gtb-red);">against the verdict</span>';
            h += '<tr><td style="' + td + '">' + (all ? x.day.slice(5) + ' &middot; ' : '') + (x.row.time || '-') + '</td>'
                + '<td style="' + td + 'font-weight:700;">' + (x.row.instrument || '') + '</td>'
                + '<td style="' + td + '">' + (x.row.side || '') + '</td>'
                + '<td style="' + td + 'font-weight:800;color:' + pc + ';">' + (hasPnl ? _tfRs(x.pnl) : '-') + '</td>'
                + '<td style="' + td + '">' + (x.snap ? _tfDots(x.snap.rows) + '<span style="color:' + M + ';font-size:0.48rem;">' + x.snap.m + '</span>' : '-') + '</td>'
                + '<td style="' + td + 'font-size:0.52rem;">' + (x.snap ? (x.snap.h || x.snap.c) : '-') + '</td>'
                + '<td style="' + td + 'font-size:0.52rem;">' + rel + '</td></tr>';
        });
        h += '</tbody></table>';
    }

    h += '<div style="font-weight:800;font-size:0.55rem;letter-spacing:0.06em;color:' + M + ';margin:12px 0 3px;">P&amp;L BY GATE STATE AT ENTRY <span style="font-weight:400;">(' + st.used + ' of ' + st.total + ' trades have both a snapshot and a P&amp;L)</span></div>';
    if (!st.used) h += '<div style="color:' + M + ';padding:4px 0;">Nothing to add up yet.</div>';
    else {
        var cell = function (b) {
            return b.n ? b.n + ' trade' + (b.n > 1 ? 's' : '') + ' &middot; ' + Math.round(b.wins / b.n * 100) + '% won &middot; <b style="color:' + (b.pnl >= 0 ? 'var(--gtb-green)' : 'var(--gtb-red)') + ';">' + _tfRs(b.pnl) + '</b>' : '<span style="color:' + M + ';">-</span>';
        };
        h += '<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="' + th + '">Gate</th>'
            + ['g', 'w', 'r'].map(function (c) { return '<th style="' + th + 'color:' + _TF_CODE_COL[c] + ';">when ' + _TF_CODE_TXT[c] + '</th>'; }).join('') + '</tr></thead><tbody>';
        _TF_KEYS.forEach(function (k) {
            h += '<tr><td style="' + td + 'font-weight:700;">' + _TF_TITLES[k] + '</td>'
                + ['g', 'w', 'r'].map(function (c) { return '<td style="' + td + '">' + cell(st.gates[k][c]) + '</td>'; }).join('') + '</tr>';
        });
        h += '<tr><td style="' + td + 'font-weight:700;">Trade vs verdict</td>'
            + '<td style="' + td + '"><span style="color:var(--gtb-green);">with:</span> ' + cell(st.verdict.with) + '</td>'
            + '<td style="' + td + '"><span style="color:var(--gtb-amber);">no direction:</span> ' + cell(st.verdict.none) + '</td>'
            + '<td style="' + td + '"><span style="color:var(--gtb-red);">against:</span> ' + cell(st.verdict.against) + '</td></tr>';
        h += '</tbody></table>';
    }

    if (!all) {
        h += '<div style="font-weight:800;font-size:0.55rem;letter-spacing:0.06em;color:' + M + ';margin:12px 0 3px;">TODAY\'S TIMELINE</div>';
        if (!d.snapsToday.length) h += '<div style="color:' + M + ';padding:4px 0;">No snapshots yet. One is saved at each full refresh while the dashboard is live (09:15 to 15:35).</div>';
        else h += '<div style="max-height:180px;overflow:auto;border:1px solid var(--gtb-border);"><table style="width:100%;border-collapse:collapse;"><tbody>'
            + d.snapsToday.map(function (s) { return '<tr><td style="' + td + 'width:48px;color:' + M + ';">' + s.m + '</td><td style="' + td + 'width:100px;">' + _tfDots(s.rows) + '</td><td style="' + td + '">' + (s.h || s.c) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    h += '<div style="margin-top:12px;font-size:0.48rem;line-height:1.5;color:' + M + ';">This lists what the five gates said when each trade was entered and adds up the P&amp;L under each state. '
        + 'A few trades prove nothing: with a handful, one winner or loser swings every figure. Look for a pattern over many days (use <b>Show all logged days</b>). '
        + 'Kite-imported P&amp;L is per symbol for the day and the entry time is the first fill, so a symbol traded several times counts as one row. '
        + 'The snapshot used is the last one at or before the entry time (one per full refresh, so up to about 5 minutes old). Not advice.</div>';
    return h + '</div>';
}

function _tfShowReview(all) {
    _TF_REVIEW_ALL = !!all;
    if (jQ('#tf-review-body').length) { jQ('#tf-review-body').html(_tfReviewHtml(_TF_REVIEW_ALL)); return; }
    showPopUpWindow('focus-review', '<div id="tf-review-body" style="height:100%;overflow:auto;">' + _tfReviewHtml(_TF_REVIEW_ALL) + '</div>', 'Focus review', 940, 620);
    var cls = 'popup-custom-style-focus-review';
    var title = '<div style="display:flex;align-items:center;gap:6px;width:100%;"><i class="bi bi-clipboard-data"></i><span style="font-weight:800;font-size:0.7rem;">TRADE FOCUS - END-OF-DAY REVIEW</span>' + popupWinControls(cls) + '</div>';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html(title);
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
}
jQ(document).on('click', '#tf-review-btn', function () { _TF_REVIEW_NAME = (typeof _TF_NAME !== 'undefined' ? _TF_NAME : 'NIFTY 50'); _tfShowReview(false); });
jQ(document).on('click', '.tf-rv-name', function () { _TF_REVIEW_NAME = jQ(this).attr('data-name') || 'NIFTY 50'; _tfShowReview(_TF_REVIEW_ALL); });
jQ(document).on('click', '#tf-rv-scope', function () { _tfShowReview(!_TF_REVIEW_ALL); });
jQ(document).on('click', '#tf-rv-import', function () {
    var $b = jQ(this);
    $b.prop('disabled', true).text('Importing...');
    Promise.resolve(typeof _gtbDiaryImportFromKite === 'function' ? _gtbDiaryImportFromKite() : 0).then(function (n) {
        try { if (typeof _gtbToast === 'function') _gtbToast('Imported ' + n + ' trade row(s) from Kite positions', 'success'); } catch (e) {}
        _tfShowReview(_TF_REVIEW_ALL);
    }, function () { _tfShowReview(_TF_REVIEW_ALL); });
});
