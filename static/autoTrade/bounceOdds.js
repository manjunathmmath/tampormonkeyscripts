// Bounce / pullback odds for the swing Positional Screener (opened from the arrows icon in a row).
// Question answered: when this instrument looked like THIS before (same side of its 200-day average, a similar 20-day move measured
// in ATR), how often did it reverse by 1 ATR before moving 1 ATR further the same way, within the next 5 and 10 sessions?
// Downtrend -> "bounce first"; uptrend -> "fall back first". Counted from the instrument's own daily history, or pooled over the
// scanned names (ATR-normalised so different prices and volatility can be mixed). Point in time: only data up to each past date is used.
// Honest limits, repeated in the popup: past frequencies, not a forecast; few cases means a wide range; no costs; today's members.
// Uses helpers from positionalScreener.js (_psFetchDaily, _psPriceTokenFor, _psSmaArr, _PS_CACHE, _PS_MCX_NAMES, ...).
var _PS_BO_DAYS = 1900;                // calendar days of daily candles fetched per name (Kite allows up to 2000 per request)
var _PS_BO_H = [5, 10];                // sessions ahead
var _PS_BO_FRAC = 0.8;                 // "at least as stretched as" = this share of the current 20-day move
var _PS_BO_MIN_BARS = 260;             // fewer daily candles than this and a name is skipped
var _PS_BO_SHOW_MIN_N = 8;             // fewer past cases than this is called too few
var _PS_BO_POOL = 4;                   // parallel fetches when pooling
var _PS_BO_CANDLES = {};               // 'day|name' -> candles, kept for the session
var _PS_BO = { running: false, stop: false, name: null, side: null, z0: null, atrNow: null, entryNow: null, ctx: null, res: null };

function _psBoDay() { return (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? CURRENT_DAY : ''; }
async function _psBoCandles(name) {
    var key = _psBoDay() + '|' + name;
    if (_PS_BO_CANDLES[key]) return _PS_BO_CANDLES[key];
    var token = _psPriceTokenFor(name);
    if (!token) return null;
    var c = null;
    try { c = await _psFetchDaily(token, _PS_BO_DAYS); } catch (e) { try { c = await _psFetchDaily(token, 1000); } catch (e2) { c = null; } }
    if (c && c.length) _PS_BO_CANDLES[key] = c;
    return c;
}
function _psBoPrepare(candles) {
    var n = candles.length, c = [], h = [], l = [], d = [], i;
    for (i = 0; i < n; i++) { c.push(parseFloat(candles[i][4])); h.push(parseFloat(candles[i][2])); l.push(parseFloat(candles[i][3])); d.push(String(candles[i][0]).slice(0, 10)); }
    var atr = new Array(n).fill(null), tr = new Array(n).fill(0), sum = 0;
    for (i = 1; i < n; i++) {
        tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
        sum += tr[i]; if (i > 14) sum -= tr[i - 14];
        if (i >= 14) atr[i] = sum / 14;
    }
    return { n: n, c: c, h: h, l: l, d: d, atr: atr, sma: _psSmaArr(c, 200) };
}
function _psBoState(P, t) {
    if (t < 200 || t < 20 || P.atr[t] == null || P.sma[t] == null || !(P.atr[t] > 0)) return null;
    return { side: P.c[t] < P.sma[t] ? 'down' : 'up', z: (P.c[t] - P.c[t - 20]) / P.atr[t], vsSma: (P.c[t] / P.sma[t] - 1) * 100 };
}
// "similar to now": a move of at least 80% of the current one when it is already stretched (2 ATR or more with the trend), otherwise a 1 ATR band around it
function _psBoMatcher(side, z0) {
    var stretched = side === 'down' ? z0 <= -2 : z0 >= 2;
    if (stretched) return { stretched: true, text: (side === 'down' ? 'fell' : 'rose') + ' at least ' + (Math.abs(z0) * _PS_BO_FRAC).toFixed(1) + ' ATR over 20 sessions', fn: side === 'down' ? function (z) { return z <= _PS_BO_FRAC * z0; } : function (z) { return z >= _PS_BO_FRAC * z0; } };
    return { stretched: false, text: '20-day move within 1 ATR of ' + (z0 >= 0 ? '+' : '') + z0.toFixed(1) + ' ATR', fn: function (z) { return Math.abs(z - z0) <= 1; } };
}
// every past day on this side, then the days that also match the current 20-day move; one case per H sessions per stream so windows do not overlap
function _psBoObserve(P, H, side, matcher, name) {
    var base = [], match = [], lastB = -1e9, lastM = -1e9;
    for (var t = 200; t + H < P.n; t++) {
        var s = _psBoState(P, t);
        if (!s || s.side !== side) continue;
        var isBase = t - lastB >= H, isMatch = matcher.fn(s.z) && t - lastM >= H;
        if (!isBase && !isMatch) continue;
        var entry = P.c[t], a = P.atr[t], race = 'none', maxRev = 0, maxAdv = 0;
        for (var j = t + 1; j <= t + H; j++) {
            var up = P.h[j] >= entry + a, dn = P.l[j] <= entry - a;
            var rev = side === 'down' ? up : dn, adv = side === 'down' ? dn : up;
            if (race === 'none') { if (rev && adv) race = 'cont'; else if (rev) race = 'rev'; else if (adv) race = 'cont'; }   // a day touching both counts against the reversal
            var fav = side === 'down' ? (P.h[j] / entry - 1) * 100 : (1 - P.l[j] / entry) * 100;
            var bad = side === 'down' ? (1 - P.l[j] / entry) * 100 : (P.h[j] / entry - 1) * 100;
            if (fav > maxRev) maxRev = fav; if (bad > maxAdv) maxAdv = bad;
        }
        var retH = (P.c[t + H] / entry - 1) * 100;
        var o = { n: name, d: P.d[t], race: race, revRet: side === 'down' ? retH : -retH, maxRev: maxRev, maxAdv: maxAdv };
        if (isBase) { base.push(o); lastB = t; }
        if (isMatch) { match.push(o); lastM = t; }
    }
    return { base: base, match: match };
}
function _psBoWilson(k, n) {
    if (!n) return [0, 0];
    var z = 1.96, p = k / n, den = 1 + z * z / n, c = (p + z * z / (2 * n)) / den, m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
    return [Math.max(0, c - m) * 100, Math.min(1, c + m) * 100];
}
function _psBoQ(a, q) {
    if (!a.length) return null;
    var b = a.slice().sort(function (x, y) { return x - y; }), p = (b.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
    return b[lo] + (b[hi] - b[lo]) * (p - lo);
}
function _psBoAgg(obs) {
    var n = obs.length;
    if (!n) return null;
    var cnt = function (r) { return obs.filter(function (o) { return o.race === r; }).length; };
    var avg = function (k) { return obs.reduce(function (s, o) { return s + o[k]; }, 0) / n; };
    var rr = obs.map(function (o) { return o.revRet; }), rev = cnt('rev');
    return { n: n, rev: rev, revP: rev / n * 100, ci: _psBoWilson(rev, n), contP: cnt('cont') / n * 100, noneP: cnt('none') / n * 100,
        closeP: obs.filter(function (o) { return o.revRet > 0; }).length / n * 100, med: _psBoQ(rr, 0.5), p25: _psBoQ(rr, 0.25), p75: _psBoQ(rr, 0.75), maxRev: avg('maxRev'), maxAdv: avg('maxAdv') };
}
function _psBoGroupOf(name) {
    if (_PS_MCX_NAMES.indexOf(name) !== -1) return 'MCX';
    if (typeof _PS_EXTRA_INSTRUMENTS !== 'undefined' && _PS_EXTRA_INSTRUMENTS.indexOf(name) !== -1) return 'INDEX';
    return 'STOCK';
}
function _psBoPoolNames(kind, name) {
    var all = Object.keys(_PS_CACHE);
    if (kind === 'self') return [name];
    if (kind === 'group') { var g = _psBoGroupOf(name); return all.filter(function (k) { return _psBoGroupOf(k) === g; }); }
    return all;
}

function _psBoHtml() {
    var res = _PS_BO.res, G = 'var(--gtb-green)', R = 'var(--gtb-red)', M = 'var(--gtb-muted)', A = 'var(--gtb-amber)';
    if (!res) return '';
    var down = _PS_BO.side === 'down', word = down ? 'Bounced' : 'Fell back', pc = function (x) { return x == null ? '-' : (x >= 0 ? '+' : '') + x.toFixed(1) + '%'; };
    var th = 'padding:2px 6px;text-align:right;font-size:0.46rem;letter-spacing:0.04em;color:var(--gtb-muted);position:sticky;top:0;background:var(--gtb-surface);';
    var td = 'padding:3px 6px;text-align:right;border-top:1px solid var(--gtb-border);font-family:var(--gtb-mono);white-space:nowrap;';
    var tdl = 'padding:3px 6px;text-align:left;border-top:1px solid var(--gtb-border);';
    var sub = 'font-size:0.52rem;font-weight:800;letter-spacing:0.05em;color:var(--gtb-muted);margin:10px 0 3px;';
    var row = function (label, a, strong) {
        if (!a) return '<tr><td style="' + tdl + 'font-weight:700;">' + label + '</td><td style="' + td + 'color:' + M + ';" colspan="8">no past cases</td></tr>';
        var few = a.n < _PS_BO_SHOW_MIN_N;
        return '<tr style="' + (strong ? 'background:var(--gtb-surface2);' : '') + '"><td style="' + tdl + 'font-weight:' + (strong ? 800 : 600) + ';">' + label + '</td>'
            + '<td style="' + td + 'color:' + (few ? A : M) + ';">' + a.n + (few ? ' (few)' : '') + '</td>'
            + '<td style="' + td + 'font-weight:800;color:' + (a.revP >= 55 ? G : a.revP <= 35 ? R : 'var(--gtb-text)') + ';">' + a.revP.toFixed(0) + '%</td>'
            + '<td style="' + td + 'color:' + M + ';">' + a.ci[0].toFixed(0) + ' to ' + a.ci[1].toFixed(0) + '%</td>'
            + '<td style="' + td + '">' + a.contP.toFixed(0) + '%</td><td style="' + td + '">' + a.noneP.toFixed(0) + '%</td>'
            + '<td style="' + td + '">' + a.closeP.toFixed(0) + '%</td>'
            + '<td style="' + td + 'color:' + (a.med >= 0 ? G : R) + ';">' + pc(a.med) + ' <span style="color:' + M + ';">(' + pc(a.p25) + ' to ' + pc(a.p75) + ')</span></td>'
            + '<td style="' + td + '"><span style="color:' + G + ';">' + pc(a.maxRev) + '</span> / <span style="color:' + R + ';">-' + a.maxAdv.toFixed(1) + '%</span></td></tr>';
    };
    var head = '<tr><th style="' + th + 'text-align:left;">PAST DAYS</th><th style="' + th + '">CASES</th><th style="' + th + '" title="Reversed by 1 ATR before moving 1 ATR further the same way, inside the window. A day that touched both counts as not reversed.">' + word.toUpperCase() + ' FIRST (1 ATR)</th><th style="' + th + '" title="95% range for that share given the number of cases. A wide range means few cases.">95% RANGE</th><th style="' + th + '">CONTINUED FIRST</th><th style="' + th + '">NEITHER</th><th style="' + th + '" title="Close at the end of the window was on the reversal side of the entry close.">CLOSED ' + (down ? 'HIGHER' : 'LOWER') + '</th><th style="' + th + '" title="Move from the entry close to the close at the end of the window, signed toward the reversal: median and the 25th to 75th percentile.">MEDIAN MOVE (25TH TO 75TH)</th><th style="' + th + '" title="Average best move toward the reversal / average worst move against it, any time inside the window.">AVG BEST / WORST</th></tr>';
    var out = '';
    _PS_BO_H.forEach(function (H) {
        var r = res[H];
        out += '<div style="' + sub + '">NEXT ' + H + ' SESSIONS</div><div style="overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.54rem;"><thead>' + head + '</thead><tbody>'
            + row('Any ' + (down ? 'downtrend' : 'uptrend') + ' day (baseline)', r.base, false) + row('Similar to now: ' + res.matcher.text, r.match, true) + '</tbody></table></div>';
    });
    // plain-language read on the 10-session window
    var r10 = res[10], b = r10.base, m = r10.match, read;
    if (!m || m.n < _PS_BO_SHOW_MIN_N) read = 'Only ' + (m ? m.n : 0) + ' past cases looked like now, too few to say anything. The baseline is the better guide.';
    else {
        var overlap = !(m.ci[0] > b.ci[1] || m.ci[1] < b.ci[0]);
        read = 'Of ' + m.n + ' past cases like now, ' + m.revP.toFixed(0) + '% ' + (down ? 'bounced' : 'fell back') + ' by 1 ATR before moving 1 ATR further, against ' + b.revP.toFixed(0) + '% on any ' + (down ? 'downtrend' : 'uptrend') + ' day. '
            + (overlap ? 'The ranges overlap, so being stretched like this made no clear difference.' : (m.revP > b.revP ? 'Higher than the baseline beyond the uncertainty.' : 'Lower than the baseline beyond the uncertainty.'));
    }
    var half = '';
    if (m && m.n >= 2 * _PS_BO_SHOW_MIN_N) {
        var s = m.obsSorted, mid = Math.floor(s.length / 2), a1 = _psBoAgg(s.slice(0, mid)), a2 = _psBoAgg(s.slice(mid));
        half = ' Split by date, ' + word.toLowerCase() + ' first: ' + a1.revP.toFixed(0) + '% in the earlier half (' + a1.n + ' cases) and ' + a2.revP.toFixed(0) + '% in the later half (' + a2.n + ' cases).';
    }
    return '<div style="font-size:0.58rem;line-height:1.5;margin-bottom:6px;color:var(--gtb-text);">' + read + half + '</div>' + out;
}
function _psBoStateHtml() {
    var G = 'var(--gtb-green)', R = 'var(--gtb-red)', M = 'var(--gtb-muted)';
    var c = _PS_BO.ctx; if (!c) return '';
    var down = c.side === 'down', r = _PS_CACHE[c.name], view = '';
    try { if (r) view = ' Screener view: <b>' + r.verdict + '</b>' + (r.since ? ' &middot; ' + _psSinceText(r) : '') + '.'; } catch (e) {}
    return '<div style="font-size:0.58rem;line-height:1.55;margin-bottom:6px;">'
        + '<b>' + c.name + '</b> as of ' + c.date + ': <b style="color:' + (down ? R : G) + ';">' + (down ? 'BELOW' : 'ABOVE') + ' its 200-day average (' + (c.vsSma >= 0 ? '+' : '') + c.vsSma.toFixed(1) + '%)</b>, ' + (c.z >= 0 ? 'up ' : 'down ') + Math.abs(c.z).toFixed(1) + ' ATR over the last 20 sessions. '
        + '1 ATR now = ' + c.atr.toFixed(2) + ' (' + (c.atr / c.entry * 100).toFixed(1) + '% of price).' + view
        + '<br><span style="color:' + M + ';">Looking for: ' + (down ? 'a bounce' : 'a fall back') + ' of 1 ATR before a further 1 ATR move the same way, inside 5 and 10 sessions.</span></div>';
}
async function _psBoRun() {
    if (_PS_BO.running) return;
    var name = _PS_BO.name, kind = jQ('#psbo-pool').val() || 'self', prog = function (t) { jQ('#psbo-progress').text(t); };
    _PS_BO.running = true; _PS_BO.stop = false;
    jQ('#psbo-run').prop('disabled', true);
    try {
        prog('Loading ' + name + '…');
        var c0 = await _psBoCandles(name);
        if (!c0 || c0.length < _PS_BO_MIN_BARS) throw new Error('only ' + (c0 ? c0.length : 0) + ' daily candles for ' + name + ' (need ' + _PS_BO_MIN_BARS + ')');
        var P0 = _psBoPrepare(c0), t0 = P0.n - 1, s0 = _psBoState(P0, t0);
        if (!s0) throw new Error('not enough history to read the current state');
        _PS_BO.side = s0.side; _PS_BO.z0 = s0.z;
        _PS_BO.ctx = { name: name, side: s0.side, z: s0.z, vsSma: s0.vsSma, atr: P0.atr[t0], entry: P0.c[t0], date: P0.d[t0] };
        jQ('#psbo-state').html(_psBoStateHtml());
        var matcher = _psBoMatcher(s0.side, s0.z), names = _psBoPoolNames(kind, name), acc = {}, used = 0, idx = 0, done = 0;
        _PS_BO_H.forEach(function (H) { acc[H] = { base: [], match: [] }; });
        var work = async function (nm) {
            var cs = nm === name ? c0 : await _psBoCandles(nm);
            done++;
            if (!cs || cs.length < _PS_BO_MIN_BARS) return;
            var P = nm === name ? P0 : _psBoPrepare(cs);
            _PS_BO_H.forEach(function (H) { var o = _psBoObserve(P, H, s0.side, matcher, nm); acc[H].base = acc[H].base.concat(o.base); acc[H].match = acc[H].match.concat(o.match); });
            used++;
            if (done % 5 === 0) { prog('Names ' + done + ' / ' + names.length + '…'); await new Promise(function (rs) { setTimeout(rs, 0); }); }
        };
        var workers = [];
        for (var w = 0; w < (kind === 'self' ? 1 : _PS_BO_POOL); w++) workers.push((async function () { while (idx < names.length && !_PS_BO.stop) { var it = names[idx++]; try { await work(it); } catch (e) {} } })());
        await Promise.all(workers);
        var res = { matcher: matcher, names: used, kind: kind };
        _PS_BO_H.forEach(function (H) {
            var ms = acc[H].match.slice().sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
            res[H] = { base: _psBoAgg(acc[H].base), match: _psBoAgg(ms) };
            if (res[H].match) res[H].match.obsSorted = ms;
        });
        _PS_BO.res = res;
        prog((_PS_BO.stop ? 'Stopped, showing what was loaded. ' : 'Done. ') + used + ' name' + (used === 1 ? '' : 's') + ' used.');
        jQ('#psbo-out').html(_psBoHtml());
    } catch (e) {
        prog('Failed: ' + (e && e.message ? e.message : e));
    }
    _PS_BO.running = false; jQ('#psbo-run').prop('disabled', false);
}
function _psShowBounce(name) {
    var r = _PS_CACHE[name]; if (!r) return;
    var gKind = _psBoGroupOf(name), nGroup = _psBoPoolNames('group', name).length, nAll = Object.keys(_PS_CACHE).length;
    var html = '<div style="padding:12px;overflow:auto;height:100%;color:var(--gtb-text);">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;"><b style="font-size:0.66rem;">Bounce / pullback odds: ' + name + '</b>'
        + '<label style="font-size:0.56rem;color:var(--gtb-muted);">History <select id="psbo-pool" class="sv-pill-btn"><option value="self" selected>this instrument only</option><option value="group">its group, ' + nGroup + ' scanned (' + gKind + ')</option><option value="all">all ' + nAll + ' scanned names</option></select></label>'
        + '<button id="psbo-run" class="sv-load-btn" type="button"><i class="bi bi-play-fill"></i> RUN</button><button id="psbo-stop" class="sv-pill-btn" type="button"><i class="bi bi-stop-fill"></i> Stop</button><span id="psbo-progress" class="ps-progress"></span></div>'
        + '<div id="psbo-state"></div><div id="psbo-out"></div>'
        + '<div style="margin-top:8px;padding:6px 8px;border:1px solid var(--gtb-amber);font-size:0.52rem;line-height:1.5;"><b style="color:var(--gtb-amber);">Read this first.</b> These are past frequencies of what followed days that looked like this, counted from daily candles with only data up to each date. They are not a forecast: a name that is stretched can stay stretched. Cases are one per window so they do not overlap, but they cluster in market phases, so a few dozen cases in one or two phases is thin: look at the 95% range and the split by date. Uses daily highs and lows, so a day that touched both levels counts as no reversal. Pooling mixes names by ATR-sized moves and uses today\'s scanned list. No costs. The screener\'s own labels (EARLY, LATE, Stage) are shown for context only; they were never back-tested and this is not a test of them.</div></div>';
    _PS_BO.name = name; _PS_BO.res = null; _PS_BO.ctx = null;
    showPopUpWindow('ps-bounce', html, 'Bounce odds', 940, 620);
    var cls = 'popup-custom-style-ps-bounce';
    var title = '<div style="display:flex;align-items:center;gap:6px;width:100%;"><span style="font-weight:800;font-size:0.7rem;">BOUNCE / PULLBACK ODDS</span>' + popupWinControls(cls) + '</div>';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html(title);
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
    _psBoRun();
}
jQ(document).on('click', '.ps-bounce-btn', function (e) { e.stopPropagation(); _psShowBounce(jQ(this).data('name')); });
jQ(document).on('click', '#psbo-run', function () { _psBoRun(); });
jQ(document).on('click', '#psbo-stop', function () { _PS_BO.stop = true; });
