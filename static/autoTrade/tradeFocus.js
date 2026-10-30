// ── Trade Focus (v29.421) ────────────────────────────────────────────────────────────────────────────────────────────────
// First tab of the dashboard: five questions a trade needs answered, in order, each as a traffic light and one plain sentence.
// Click a row for the evidence behind it. Nothing here is a new signal or score: every row reads what the app already computes
// (Final Verdict, Master Consensus, Level Decision, entry timing, range-plan check, exit signal, squeeze state). Heuristic, not
// back-tested, and it never places or changes an order. NIFTY 50 only for now (the index the Final Verdict is built around).
//   1 TRADEABLE TODAY?   market guard, range plan, dead zone, VIX, expiry day, data age
//   2 DIRECTION          Master Consensus (BANK NIFTY as the cross-check)
//   3 ENTRY & TIMING     Final Verdict headline (Level Decision) + the entry-timing checklist
//   4 RISK               the 9:15 plan stop, and what it means against your Account Capital x risk %
//   5 EXIT               exit signal and an active squeeze against the direction
var _TF_OPEN = {};
var _TF_TONE = { good: 'var(--gtb-green)', warn: 'var(--gtb-amber)', bad: 'var(--gtb-red)', none: 'var(--gtb-muted)' };
var _TF_TONE_TXT = { good: 'GREEN', warn: 'AMBER', bad: 'RED', none: 'n/a' };

function _tfFmt(n) { return Math.round(n).toLocaleString('en-IN'); }

var _TF_NAME = 'NIFTY 50';                 // instrument shown on the Focus tab
function _tfNames() {
    var out = ['NIFTY 50', 'NIFTY BANK', 'SENSEX'], add = function (n) { if (out.indexOf(n) === -1) out.push(n); };
    try { (typeof _TF_MCX_NAMES !== 'undefined' ? _TF_MCX_NAMES : []).forEach(add); } catch (e) {}
    try { (typeof _gtbMcxDashNames === 'function' ? _gtbMcxDashNames() : []).forEach(add); } catch (e) {}
    return out;
}
function _tfIsMcx(nm) { return nm && nm !== 'NIFTY 50' && nm !== 'NIFTY BANK' && nm !== 'SENSEX' && typeof _tfComputeMcx === 'function' && typeof _gtbIsMcxFuture === 'function' && _gtbIsMcxFuture(nm); }

function _tfCompute(nm) {
    nm = nm || 'NIFTY 50';
    if (_tfIsMcx(nm)) return _tfComputeMcx(nm);                 // commodities (tradeFocusMcx.js): same five rows, MCX inputs
    var res = { name: nm, rows: [], v: null, greens: 0, live: true };
    // The Level Confirmation card builds window._GTB_LC (the 9:15 plan and each side's Level Decision), which the Final Verdict
    // reads. While the Dashboard tab is hidden nothing redraws that card, so build it here first.
    try { if (!jQ('#gtb-pane-dashboard').is(':visible') && typeof _gtbLevelConfirmHtml === 'function') _gtbLevelConfirmHtml(); } catch (e) {}
    var v = null; try { v = _gtbFinalVerdict(nm); } catch (e) {}
    res.v = v;
    var cn = v && v.consensus ? v.consensus : null;
    var dir = v ? v.dir : 0;
    var word = dir > 0 ? 'LONG' : dir < 0 ? 'SHORT' : '';
    var live = true, notLiveTxt = '';
    try {
        var snap = (typeof _gtbHistTime === 'function') ? _gtbHistTime() : null;
        var past = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) && String(CURRENT_DAY).slice(0, 10) !== moment().format('YYYY-MM-DD');
        if (snap || past) { live = false; notLiveTxt = _gtbFinalAsOf(); }
    } catch (e) {}
    res.live = live;

    // ── 1. Tradeable today? ──────────────────────────────────────────────────────────────────────────────────────────────
    (function () {
        var r = { key: 'tradeable', n: 1, title: 'TRADEABLE TODAY?', tone: 'good', line: '', detail: [] };
        var bad = [], warn = [], ok = [];
        if (!live) { r.tone = 'none'; r.line = 'Not live: this is a ' + (/snapshot/.test(notLiveTxt) ? 'snapshot' : 'replay') + ' (' + String(notLiveTxt).replace(/\s*\((snapshot|replay of that day)\)/, '') + ')'; r.detail.push('The dashboard is showing an earlier moment, so the live gates do not apply.'); res.rows.push(r); return; }
        try { var ms = _gtbHeadlineMarketSignal().ms; if (ms && ms.signal === 'NO TRADE') bad.push('Market guard: ' + (ms.reason || 'the VIX range guard is on')); else ok.push('Market guard clear'); } catch (e) {}
        try { var rc = _gtbRangePlanCheck(); if (rc && rc.on) bad.push('Range plan invalid: ' + rc.reasons.join('; ') + ' (the 9:15 combo expected a range)'); else if (rc && rc.expected) ok.push('Range plan still valid'); } catch (e) {}
        if (cn && cn.deadZone) warn.push(nm + ' is in a dead zone, signals too weak to commit: ' + (typeof _gtbDeadZoneText === 'function' ? _gtbDeadZoneText(nm, cn.deadZone) : cn.deadZone.lo + ' – ' + cn.deadZone.hi));
        try {
            var vx = parseFloat((JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}')['INDIA VIX'] || {}).ltp) || 0;
            if (vx > 25) warn.push('India VIX ' + vx.toFixed(1) + ' is HIGH (above 25): wide swings, widen the stop and cut size (warning only)');
            else if (vx > 18) warn.push('India VIX ' + vx.toFixed(1) + ' is ELEVATED (18 to 25)');
            else if (vx > 0) ok.push('VIX ' + vx.toFixed(1));
        } catch (e) {}
        try { var ex = _gtbExpiryDayNames(); if (ex.length) warn.push('Options expire today (' + ex.join(', ') + '): moves can be sharp and one-way, size smaller'); } catch (e) {}
        try {
            var la = window._GTB_LAST_REFRESH_AT, nowM = moment().hours() * 60 + moment().minutes();
            if (la && nowM >= 9 * 60 + 20 && nowM <= 15 * 60 + 30 && Date.now() - la > 12 * 60000) warn.push('The last full refresh was ' + Math.round((Date.now() - la) / 60000) + ' min ago, so slower data may be stale');
        } catch (e) {}
        r.tone = bad.length ? 'bad' : warn.length ? 'warn' : 'good';
        var all = bad.concat(warn);
        r.line = all.length ? all[0] + (all.length > 1 ? ' (+' + (all.length - 1) + ' more)' : '') : (ok.join(' · ') || 'No blocking conditions found');
        r.detail = all.length ? all.concat(ok) : ok;
        res.rows.push(r);
    })();

    // ── 2. Direction ─────────────────────────────────────────────────────────────────────────────────────────────────────
    (function () {
        var r = { key: 'direction', n: 2, title: 'DIRECTION', tone: 'none', line: '', detail: [] };
        if (!cn) { r.line = 'Consensus not available yet: run a refresh'; res.rows.push(r); return; }
        var nF = function (x) { return (x >= 0 ? '+' : '') + x.toFixed(2); };
        var stat = 'consensus net ' + nF(cn.net) + ', ' + cn.agree + ' of ' + cn.voting + ' engines agree' + (cn.thin ? ' (thin)' : '');
        if (!dir) { r.tone = 'bad'; r.line = 'No clear direction: ' + stat; }
        else {
            var disagree = (v.warn || []).some(function (w) { return /disagree/i.test(w); });
            r.tone = (v.conf === 'HIGH' || v.conf === 'MEDIUM') && !disagree ? 'good' : 'warn';
            r.line = word + ' (' + (v.conf ? v.conf + ' confidence' : 'low confidence') + '): ' + stat + (disagree ? '; BANK NIFTY disagrees' : '');
        }
        (v.why || []).forEach(function (x) { r.detail.push(x); });
        (v.warn || []).forEach(function (x) { if (/disagree|consensus/i.test(x)) r.detail.push(x); });
        // live context (liveContext.js): has price moved against the morning view?
        try {
            if (dir && typeof _lxCompute === 'function') {
                var lx = _lxCompute(nm, dir);
                if (lx && (lx.status === 'STALE' || lx.status === 'WEAKENING')) {
                    if (r.tone === 'good') r.tone = 'warn';
                    r.line += ' · price check: view ' + lx.status + ' (' + lx.against + ' checks against, live view ' + (lx.live > 0 ? '+' : '') + lx.live + ')';
                    lx.checks.filter(function (c) { return c.state === 'against'; }).forEach(function (c) { r.detail.push('Price is against it: ' + c.text); });
                    r.detail.push('The Live context card on the Dashboard tab lists every check.');
                }
            }
        } catch (e) {}
        res.rows.push(r);
    })();

    // ── 3. Entry & timing ────────────────────────────────────────────────────────────────────────────────────────────────
    (function () {
        var r = { key: 'entry', n: 3, title: 'ENTRY & TIMING', tone: 'none', line: '', detail: [] };
        if (!v) { r.line = 'Verdict not available yet: run a refresh'; res.rows.push(r); return; }
        if (!dir) { r.line = 'No direction, so nothing to time. ' + (v.headline || ''); res.rows.push(r); return; }
        var tmTxt = '';
        try {
            if (typeof _ossTimingFor === 'function') {
                _ossTimingFor(nm, dir > 0 ? 1 : -1, null, null);
                var t = (typeof _OSS_TIMING_LAST !== 'undefined') ? _OSS_TIMING_LAST : null;
                // when the verdict says wait for a dip / level, the timing figure is for entering right now, which it advises against
                if (t && t.pct != null) tmTxt = (/NOW/.test(String(v.headline)) ? ' · timing ' : ' · timing if entered now: ') + t.pct + '% ' + t.label;
            }
        } catch (e) {}
        r.tone = v.call === 'NO TRADE' ? 'bad' : v.call === 'WAIT' ? 'warn' : /NOW/.test(String(v.headline)) ? 'good' : 'warn';
        r.line = (v.headline || '') + tmTxt;
        try {
            if (r.tone === 'good' && typeof _lxGateFor === 'function') {
                var gt = _lxGateFor(nm, dir);
                if (gt && !gt.ok) { r.tone = 'warn'; r.line += ' · price is not confirming it'; gt.against.forEach(function (c) { r.detail.push('Price is against it: ' + c.text); }); }
            }
        } catch (e) {}
        if (v.action) r.detail.push(v.action);
        (v.warn || []).forEach(function (x) { if (!/disagree/i.test(x)) r.detail.push(x); });
        if (tmTxt) r.detail.push('Entry timing is the same checklist the Option Strike Search shows; it is for a ' + word + ' and is not an entry signal while the verdict is NO TRADE or WAIT.');
        res.rows.push(r);
    })();

    // ── 4. Risk ──────────────────────────────────────────────────────────────────────────────────────────────────────────
    (function () {
        var r = { key: 'risk', n: 4, title: 'RISK', tone: 'none', line: '', detail: [] };
        if (!dir) { r.line = 'No direction, so no stop to size against'; res.rows.push(r); return; }
        var b = {}; try { b = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}')[nm] || {}; } catch (e) {}
        var entry = parseFloat(dir > 0 ? b.bso : b.aso), stop = parseFloat(dir > 0 ? b.bst : b.ast);
        if (!entry || !stop) { r.line = 'No 9:15 levels yet: run the 9:15 scan'; res.rows.push(r); return; }
        var step = Math.abs(entry - stop), lvl = dir > 0 ? 'BSO' : 'ASO', stopName = dir > 0 ? 'BST' : 'AST';
        var cap = parseFloat(typeof MARGIN !== 'undefined' ? MARGIN : 0) || 0, pct = (typeof RISK_PCT_PER_TRADE !== 'undefined' ? RISK_PCT_PER_TRADE : 1);
        var lot = 0; try { var f = FUTURE_INTRUMENT_LIST.find(function (x) { return x.name === (nm === 'NIFTY BANK' ? 'BANKNIFTY' : nm === 'SENSEX' ? 'SENSEX' : 'NIFTY'); }); lot = parseInt(f && f.lot_size, 10) || 0; } catch (e) {}
        var base = 'Plan stop ' + stopName + ' ' + _tfFmt(stop) + ', ' + _tfFmt(step) + ' pts beyond ' + lvl + ' ' + _tfFmt(entry);
        r.detail.push('The stop is the 9:15 plan stop for a ' + word + ' (' + stopName + '). A trend entry on a dip or rally would use a nearer stop; this is the plan reference.');
        if (!cap || !lot) {
            r.tone = 'warn'; r.line = base + '. Set Account Capital in Settings (and load the instruments; ' + (nm === 'SENSEX' ? 'SENSEX has no futures lot size here' : '') + ') to see the rupee risk.';
            res.rows.push(r); return;
        }
        var budget = cap * pct / 100, perLot = step * lot, lots = Math.floor(budget / perLot);
        r.tone = lots >= 1 ? 'good' : 'warn';
        r.line = base + ' · risk budget ₹' + _tfFmt(budget) + ' (' + pct + '% of ₹' + _tfFmt(cap) + ') · ' + (lots >= 1 ? lots + ' lot' + (lots > 1 ? 's' : '') + ' fit' : 'not even 1 lot fits') + ' (futures-equivalent)';
        r.detail.push('One ' + nm + ' lot (' + lot + ') risks about ₹' + _tfFmt(perLot) + ' to that stop as a futures position; an option position loses less per point (its delta) but can lose the whole premium.');
        r.detail.push('This is arithmetic on your own Settings (Account Capital and risk % per trade), not sizing advice. Margin and brokerage are not included.');
        res.rows.push(r);
    })();

    // ── 5. Exit ──────────────────────────────────────────────────────────────────────────────────────────────────────────
    (function () {
        var r = { key: 'exit', n: 5, title: 'EXIT', tone: 'none', line: '', detail: [] };
        if (!dir) { r.line = 'No direction, so no exit to watch'; res.rows.push(r); return; }
        var ex = 'HOLD'; try { ex = checkExitSignal(word); } catch (e) {}
        var adv = []; try { adv = _gtbSqueezeActiveNames(dir < 0); } catch (e) {}      // short covering hurts a SHORT, long unwinding hurts a LONG
        var advTxt = dir < 0 ? 'short covering' : 'long unwinding';
        if (ex === 'EXIT' || adv.length) {
            r.tone = 'bad';
            var why = [];
            if (ex === 'EXIT') why.push('trend or both index futures have turned against a ' + word);
            if (adv.length) why.push(advTxt + ' is active on ' + adv.join(', '));
            r.line = 'Exit signal for a ' + word + ': ' + why.join('; ');
        } else { r.tone = 'good'; r.line = 'No exit signal for a ' + word + ' (trend intact, futures not both against it, no ' + advTxt + ')'; }
        r.detail.push('Exit rule: a LONG exits when NIFTY is below BSO/BST or both index futures turn bearish; a SHORT exits when NIFTY is above ASO/AST or both turn bullish.');
        r.detail.push('A squeeze against the direction (short covering for a SHORT, long unwinding for a LONG) is a fast one-way move: the red banner at the top of the page says so.');
        res.rows.push(r);
    })();

    res.greens = res.rows.filter(function (x) { return x.tone === 'good'; }).length;
    return res;
}

// compact = the strip inside the Commodities popup (no instrument chips, no review button, smaller headline)
function _tfHtml(res, compact) {
    var v = res.v, G = 'var(--gtb-green)', M = 'var(--gtb-muted)';
    var head = v ? v.headline : 'Verdict not available yet: run a refresh';
    var hcol = v ? v.col : M;
    var asOf = ''; try { asOf = _gtbFinalAsOf(); } catch (e) {}
    var confCol = v && v.conf === 'HIGH' ? G : v && v.conf === 'MEDIUM' ? 'var(--gtb-amber)' : M;
    var judged = res.rows.filter(function (x) { return x.tone !== 'none'; }).length;      // n/a rows cannot be green, so they are not counted against the total
    var chips = '';
    if (!compact) {
        chips = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">' + _tfNames().map(function (n) {
            var on = n === res.name;
            return '<button class="tf-name gtb-win-btn" data-name="' + n + '" style="width:auto;font-size:0.58rem;padding:3px 12px;' + (on ? 'background:var(--gtb-accent);color:#fff;font-weight:800;' : '') + '">' + n + '</button>';
        }).join('') + '</div>';
    }
    var h = '<div style="padding:' + (compact ? '4px 0' : '12px 16px;max-width:980px') + ';">' + chips
        + '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;padding:' + (compact ? '6px 10px' : '10px 14px') + ';background:var(--gtb-surface);border-left:5px solid ' + hcol + ';">'
        +   '<span style="font-weight:900;font-size:' + (compact ? '0.8rem' : '1.2rem') + ';color:' + hcol + ';">' + head + '</span>'
        +   (v && v.conf ? '<span style="font-weight:800;font-size:0.55rem;color:' + confCol + ';border:1px solid ' + confCol + ';padding:1px 6px;">CONFIDENCE ' + v.conf + '</span>' : '')
        +   '<span style="margin-left:auto;font-size:0.6rem;color:' + M + ';"><b style="color:' + (judged && res.greens === judged ? G : 'var(--gtb-text)') + ';">' + res.greens + ' of ' + judged + '</b> gates green' + (judged < res.rows.length ? ' (' + (res.rows.length - judged) + ' n/a)' : '') + ' · ' + res.name + ' · as of ' + asOf + '</span>'
        +   (compact ? '' : '<button id="tf-review-btn" class="gtb-win-btn" style="width:auto;font-size:0.55rem;padding:3px 10px;" title="Matches your trades to the five gate states at entry"><i class="bi bi-clipboard-data"></i> End-of-day review (' + (typeof _tfLogLoad === 'function' ? _tfLogLoad(null, res.name).length : 0) + ' logged)</button>')
        + '</div>';
    var rowCls = compact ? 'tf-crow' : 'tf-row', pad = compact ? '6px 10px' : '9px 14px';
    res.rows.forEach(function (r) {
        var col = _TF_TONE[r.tone], open = !!_TF_OPEN[r.key];
        h += '<div class="' + rowCls + '" data-tf="' + r.key + '" style="display:flex;align-items:center;gap:10px;padding:' + pad + ';margin-top:6px;background:var(--gtb-surface);border-left:5px solid ' + col + ';cursor:pointer;user-select:none;" title="Click for the evidence behind this row">'
            + '<span style="flex:0 0 auto;width:11px;height:11px;border-radius:50%;background:' + col + ';"></span>'
            + '<span style="flex:0 0 150px;font-weight:800;font-size:0.62rem;letter-spacing:0.05em;color:var(--gtb-text);">' + r.n + ' &nbsp;' + r.title + '</span>'
            + '<span style="flex:1 1 auto;font-size:0.72rem;line-height:1.4;color:var(--gtb-text);">' + r.line + '</span>'
            + '<span style="flex:0 0 auto;font-weight:800;font-size:0.5rem;color:' + col + ';letter-spacing:0.05em;">' + _TF_TONE_TXT[r.tone] + '</span>'
            + '<i class="bi bi-chevron-' + (open ? 'down' : 'right') + '" style="font-size:0.55rem;color:' + M + ';"></i>'
            + '</div>'
            + '<div class="tf-detail" data-tf="' + r.key + '" style="' + (open ? '' : 'display:none;') + 'padding:6px 14px 8px 36px;background:var(--gtb-surface2);border-left:5px solid ' + col + ';font-size:0.58rem;line-height:1.55;color:' + M + ';">'
            + (r.detail.length ? '<ul style="margin:0 0 0 14px;padding:0;">' + r.detail.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' : 'No further detail.')
            + '</div>';
    });
    if (!compact) h += '<div style="margin-top:10px;font-size:0.5rem;color:' + M + ';line-height:1.5;">Green = the gate passes, amber = caution, red = blocks the trade, n/a = nothing to judge yet. '
        + 'Each row reads what the dashboard already computes (nothing new is calculated here); the cards behind it are unchanged on the Dashboard tab. '
        + 'Rule-based and not back-tested. It does not place or change orders.</div>';
    return h + '</div>';
}

function _tfRender(res) {
    var $p = jQ('#gtb-pane-focus');
    if (!$p.length) return;
    try { $p.html(_tfHtml(res && res.name === _TF_NAME ? res : _tfCompute(_TF_NAME))); }
    catch (e) { $p.html('<div style="padding:12px;font-size:0.6rem;color:var(--gtb-red);">Trade Focus could not be built: ' + (e && e.message ? e.message : e) + '</div>'); try { console.log('[trade-focus]', e); } catch (e2) {} }
}
// The same five gates as a compact strip in the Commodities popup, for the commodity selected there (#cmd-crude-focus).
function _tfRenderCmd() {
    var $p = jQ('#cmd-crude-focus');
    if (!$p.length) return;
    var name = (typeof _CMD !== 'undefined' && _CMD.activeName) ? _CMD.activeName : null;
    if (!name || !_tfIsMcx(name)) { $p.html('<div style="padding:4px 8px;font-size:0.5rem;color:var(--gtb-muted);">Focus gates are not available for ' + (name || 'this instrument') + '.</div>'); return; }
    // the Commodities popup loads its own commodity, so the gates strip must not start a second load of the same data
    try { window._TF_SKIP_LOAD = true; $p.html(_tfHtml(_tfCompute(name), true)); window._TF_SKIP_LOAD = false; }
    catch (e) { $p.html('<div style="padding:4px 8px;font-size:0.5rem;color:var(--gtb-red);">Focus gates could not be built.</div>'); try { console.log('[trade-focus cmd]', e); } catch (e2) {} }
}

jQ(document).on('click', '.tf-row', function () {
    var k = jQ(this).attr('data-tf');
    _TF_OPEN[k] = !_TF_OPEN[k];
    _tfRender();
});
jQ(document).on('click', '.tf-crow', function () {
    var k = jQ(this).attr('data-tf');
    _TF_OPEN[k] = !_TF_OPEN[k];
    _tfRenderCmd();
});
jQ(document).on('click', '.tf-name', function () {
    _TF_NAME = jQ(this).attr('data-name') || 'NIFTY 50';
    _tfRender();
});
