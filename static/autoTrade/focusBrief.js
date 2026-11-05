// ─────────────────────────────────────────────────────────────────────────────────────────────
// Focus tab brief: "what to look for today and in the next session" (v29.514). Reads only what is already loaded; nothing here is scored and it feeds
// no verdict. Four parts: (1) scheduled events (the News panel's Upcoming list: calendar, RBI / Fed dates, your own) with their India impact and the
// usual reading either way, (2) the important headlines of the last 12 hours (HIGH impact tags first) with what the watched instruments did since,
// (3) market facts for the day: expiry, holiday or weekend, India VIX, GIFT NIFTY, crude / gold / dollar-rupee, the macro backdrop, NIFTY's nearest
// strong support and resistance, (4) a short "look for" list written from those. Redrawn with the Focus tab.
// ─────────────────────────────────────────────────────────────────────────────────────────────

var _FB_OPEN = true;
try { _FB_OPEN = localStorage.getItem('GTB_FB_OPEN') !== '0'; } catch (e) {}

var _FB_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function _fbEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _fbIstStart(ms) { return Math.floor((ms + 19800000) / 86400000) * 86400000 - 19800000; }     // 00:00 IST of the day that contains ms
function _fbNse(ms) { var d = new Date(ms + 19800000); return ('0' + d.getUTCDate()).slice(-2) + '-' + _FB_MON[d.getUTCMonth()] + '-' + d.getUTCFullYear(); }   // NSE holiday format, e.g. 15-Jan-2026
function _fbHoliday(ms) { try { var s = _fbNse(ms); for (var i = 0; i < _GTB_HOLIDAYS.length; i++) if (_GTB_HOLIDAYS[i].date === s) return _GTB_HOLIDAYS[i].desc || 'NSE holiday'; } catch (e) {} return null; }
function _fbWeekend(ms) { var wd = new Date(ms + 19800000).getUTCDay(); return wd === 0 || wd === 6; }
function _fbDay(ms) { return _nfIst(ms, { weekday: 'short', day: '2-digit', month: 'short' }); }

// today (IST day start) and the next session: the next weekday that is not an NSE holiday
function _fbDays() {
    var t0 = _fbIstStart(Date.now()), next = null;
    for (var i = 1; i <= 9; i++) { var d = t0 + i * 86400000; if (!_fbWeekend(d) && !_fbHoliday(d)) { next = d; break; } }
    return { today: t0, next: next || t0 + 86400000 };
}

function _fbPx(name) {
    try { var o = JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}'); var x = o[name]; return x && parseFloat(x.ltp) ? parseFloat(x.ltp) : null; } catch (e) { return null; }
}
function _fbMcxMove(name) {
    try { var sm = INSTRUMENT_SCORE_MAP[name] || {}, l = parseFloat(sm.mcxLtp), o = parseFloat(sm.open); return (l && o) ? { ltp: l, pct: (l - o) / o * 100 } : null; } catch (e) { return null; }
}
function _fbChip(label, val, col, tip) {
    return '<span class="fb-chip" style="' + (col ? 'color:' + col + ';border-color:' + col + ';' : '') + '"' + (tip ? ' title="' + _fbEsc(tip) + '"' : '') + '><i>' + _fbEsc(label) + '</i> ' + _fbEsc(val) + '</span>';
}
function _fbPct(p) { return (p >= 0 ? '+' : '') + p.toFixed(2) + '%'; }
function _fbCol(p) { return Math.abs(p) < 0.1 ? 'var(--gtb-muted)' : p > 0 ? 'var(--gtb-green)' : 'var(--gtb-red)'; }

// ── 1. events ──
function _fbEventsHtml(days) {
    if (typeof _nfEvents !== 'function' || typeof _nfEvImpact !== 'function') return '<div class="fb-none">The News panel module is not loaded.</div>';
    var now = Date.now(), end = days.next + 86400000;
    var evs = _nfEvents().filter(function (e) { return e.t >= now - 3600000 && e.t < end; }).map(function (e) { return { e: e, ei: _nfEvImpact(e) }; }).filter(function (x) { return x.ei.ind !== 'LOW'; });
    if (!evs.length) return '<div class="fb-none">No scheduled events with India impact in the calendar for today or the next session. The free calendar has no India releases: add them in the News panel (Upcoming, + Add event).</div>';
    var out = '', last = '';
    evs.forEach(function (x) {
        var e = x.e, ei = x.ei, label = e.t < days.today + 86400000 ? 'TODAY' : (e.t < days.next ? 'WEEKEND / HOLIDAY' : 'NEXT SESSION');
        var key = label + _fbDay(e.t);
        if (key !== last) { out += '<div class="fb-day">' + label + ' &middot; ' + _fbEsc(_fbDay(e.t)) + '</div>'; last = key; }
        var past = e.t < now;
        out += '<div class="fb-ev' + (past ? ' past' : '') + '"><div class="fb-evt">' + _fbEsc(_nfIst(e.t, { hour: '2-digit', minute: '2-digit', hour12: false })) + '</div><div class="fb-evb">'
            + '<div><span class="fb-tag ' + ei.ind.toLowerCase() + '">INDIA ' + (ei.ind === 'MEDIUM' ? 'MED' : ei.ind) + '</span> <span class="fb-chip"><i>' + _fbEsc(e.country) + '</i></span> <b>' + _fbEsc(e.title) + '</b> <span class="fb-dim">' + _fbEsc(_nfIn(e.t)) + (e.forecast ? ' &middot; forecast ' + _fbEsc(e.forecast) : '') + (e.previous ? ' &middot; previous ' + _fbEsc(e.previous) : '') + '</span></div>'
            + (typeof _nfVerdictShort === 'function' ? '<div class="fb-vs">' + _nfVerdictShort(e, ei) + '</div>' : '')
            + '<div class="fb-dim">' + _fbEsc(typeof _nfEvWhen === 'function' ? _nfEvWhen(e.t) : '') + '</div></div></div>';
    });
    return out;
}

// ── 2. headlines ──
function _fbNewsHtml() {
    if (typeof _NF === 'undefined' || typeof _nfImpact !== 'function') return '<div class="fb-none">The News panel module is not loaded.</div>';
    var now = Date.now(), items = Object.keys(_NF.items).map(function (k) { return _NF.items[k]; }).filter(function (it) { return now - it.t <= 12 * 3600000; });
    var rank = { HIGH: 0, MEDIUM: 1 };
    var top = items.filter(function (it) { var l = _nfImpact(it).level; return l === 'HIGH'; }).sort(function (a, b) { return b.t - a.t; }).slice(0, 6);
    try { if (typeof _nfReactEnsure === 'function') _nfReactEnsure(false); } catch (e) {}
    if (!top.length) return '<div class="fb-none">' + (items.length ? 'No HIGH impact headlines in the last 12 hours (' + items.length + ' headlines loaded).' : 'No headlines loaded yet. Open the News panel once, or wait for the next pull.') + '</div>';
    var nMed = items.filter(function (it) { return _nfImpact(it).level === 'MEDIUM'; }).length;
    return top.map(function (it) {
        var im = _nfImpact(it);
        return '<a class="fb-news" href="' + _fbEsc(it.link) + '" target="_blank" rel="noopener noreferrer"><div class="fb-nt">' + _fbEsc(it.title) + '</div>'
            + '<div class="fb-dim">' + _fbEsc(it.src) + ' &middot; ' + _fbEsc(_nfAgo(it.t)) + (im.cats.length ? ' &middot; ' + _fbEsc(im.cats.join(' / ')) : '') + '</div>'
            + '<div class="fb-chips">' + (typeof _nfReactChips === 'function' ? _nfReactChips(it, im) : '') + '</div></a>';
    }).join('') + '<div class="fb-dim" style="margin-top:4px;">Showing the newest HIGH impact headlines (last 12 hours); ' + nMed + ' more MED. The chips are what each price did since the headline. Keyword tags, rules of thumb.</div>';
}

// ── 3 + 4. market facts and the look-for list ──
function _fbFacts(days) {
    var f = { chips: [], look: [] }, now = Date.now();
    var todayHol = _fbHoliday(days.today), todayWk = _fbWeekend(days.today), openToday = !todayHol && !todayWk;
    if (todayWk) f.chips.push(_fbChip('Today', 'weekend, NSE closed', 'var(--gtb-amber)'));
    else if (todayHol) f.chips.push(_fbChip('Today', 'NSE holiday: ' + todayHol, 'var(--gtb-amber)'));
    f.chips.push(_fbChip('Next session', _fbDay(days.next)));
    // expiry (NSE index options; only the current expiry list exists)
    try {
        var exp = function (ms) { var day = moment(ms + 19800000).utc().format('YYYY-MM-DD'), out = []; [['NIFTY', 'NIFTY 50'], ['BANKNIFTY', 'NIFTY BANK'], ['SENSEX', 'SENSEX']].forEach(function (p) { if (typeof _gtbOptionExpiryFor === 'function' && _gtbOptionExpiryFor(p[0]) === day) out.push(p[1]); }); return out; };
        var et = openToday ? exp(days.today) : [], en = exp(days.next);
        if (et.length) { f.chips.push(_fbChip('Expiry today', et.join(', '), 'var(--gtb-amber)')); f.look.push('Options expiry today (' + et.join(', ') + '): premiums decay fast and price tends to gravitate toward heavy open-interest strikes and max pain, with sharp swings near them. The Final Verdict card shows the expiry context.'); }
        if (en.length) { f.chips.push(_fbChip('Expiry next session', en.join(', '), 'var(--gtb-amber)')); }
    } catch (e) {}
    // India VIX
    var vix = _fbPx('INDIA VIX');
    if (vix) {
        var vr = vix < 13 ? 'low' : vix <= 18 ? 'normal' : vix <= 25 ? 'elevated' : 'high';
        f.chips.push(_fbChip('India VIX', vix.toFixed(2) + ' (' + vr + ')', vix > 25 ? 'var(--gtb-red)' : vix > 18 ? 'var(--gtb-amber)' : ''));
        if (vix > 18) f.look.push('India VIX is ' + vr + ' (' + vix.toFixed(1) + '): expect wider swings; the expected day range is wider and stops need more room.');
    }
    // GIFT NIFTY
    try { var g = generateTrend('GIFT NIFTY'); var gc = parseFloat(g.change); if (isFinite(gc)) { f.chips.push(_fbChip('GIFT NIFTY', _fbPct(gc), _fbCol(gc), 'Change versus its previous close. It trades before the NSE opens, so it is the first read of the open.')); var _d = new Date(now + 19800000), _mins = _d.getUTCHours() * 60 + _d.getUTCMinutes(), _closed = !openToday || _mins < 555 || _mins > 930;
            if (Math.abs(gc) >= 0.5 && _closed) f.look.push('GIFT NIFTY is ' + _fbPct(gc) + ' versus its previous close: a ' + (gc > 0 ? 'gap-up' : 'gap-down') + ' open is likely, so the 9:15 candle and the strike levels will sit away from the previous close.'); } } catch (e) {}
    // commodities + dollar-rupee
    [['CRUDEOILM', 'Crude'], ['GOLDM', 'Gold'], ['SILVERM', 'Silver']].forEach(function (p) { var m = _fbMcxMove(p[0]); if (m) f.chips.push(_fbChip(p[1], _fbPct(m.pct), _fbCol(m.pct), p[0] + ' ' + m.ltp + ' versus its day open')); });
    try { var um = _fbMcxMove('USDINR'); if (um) f.chips.push(_fbChip('USDINR', _fbPct(um.pct), _fbCol(um.pct))); } catch (e) {}
    // macro backdrop (Macro tab)
    try { if (typeof _GTB_MACRO !== 'undefined' && _GTB_MACRO) { var mc = _GTB_MACRO.tone === 'good' ? 'var(--gtb-green)' : _GTB_MACRO.tone === 'bad' ? 'var(--gtb-red)' : 'var(--gtb-amber)'; f.chips.push(_fbChip('Macro backdrop', _GTB_MACRO.label, mc, _GTB_MACRO.advice || '')); } } catch (e) {}
    // NIFTY nearest strong support / resistance
    try {
        var d = typeof _gtbSrLevels === 'function' ? _gtbSrLevels('NIFTY 50') : null;
        if (d) {
            var strong = function (z) { return z.strength >= 3 || z.n >= 3; }, f0 = function (x) { return Math.round(x).toLocaleString('en-IN'); };
            var up = d.zones.filter(function (z) { return z.price > d.spot && strong(z); }).sort(function (a, b) { return a.price - b.price; })[0];
            var dn = d.zones.filter(function (z) { return z.price <= d.spot && strong(z); }).sort(function (a, b) { return b.price - a.price; })[0];
            if (up) f.chips.push(_fbChip('NIFTY resistance', f0(up.price) + ' (+' + f0(up.price - d.spot) + ')', 'var(--gtb-red)', up.items.map(function (x) { return x.src; }).join(', ')));
            if (dn) f.chips.push(_fbChip('NIFTY support', f0(dn.price) + ' (' + f0(dn.price - d.spot) + ')', 'var(--gtb-green)', dn.items.map(function (x) { return x.src; }).join(', ')));
        }
    } catch (e) {}
    // look-for list from the events
    try {
        var evs = _nfEvents().filter(function (e) { return e.t >= now - 3600000 && e.t < days.next + 86400000; }).map(function (e) { return { e: e, ei: _nfEvImpact(e) }; }).filter(function (x) { return x.ei.ind === 'HIGH'; });
        evs.forEach(function (x) {
            var e = x.e, when = e.t < days.today + 86400000 ? 'today' : _fbDay(e.t);
            f.look.push(e.title + ' (' + e.country + ') ' + when + ' ' + _nfIst(e.t, { hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST: ' + (typeof _nfEvWhen === 'function' ? _nfEvWhen(e.t) : '') + ' Expect volatility around it; the events list below shows which way each outcome usually leans.');
        });
    } catch (e) {}
    try {
        if (typeof _NF !== 'undefined') { var nh = Object.keys(_NF.items).filter(function (k) { var it = _NF.items[k]; return now - it.t <= 12 * 3600000 && _nfImpact(it).level === 'HIGH'; }).length; if (nh) f.look.push(nh + ' HIGH impact headline' + (nh > 1 ? 's' : '') + ' in the last 12 hours: read them before the open (News panel). Overnight news is already in GIFT NIFTY and MCX prices; check how far each watched instrument has moved since.'); }
    } catch (e) {}
    if (!f.look.length) f.look.push('Nothing scheduled or breaking stands out for today or the next session from the loaded data. That is not a guarantee of a quiet day.');
    return f;
}

function _fbHtml() {
    try {
        var days = _fbDays(), facts = _fbFacts(days);
        var head = '<div class="fb-head" id="fb-toggle" title="Show or hide the brief"><i class="bi bi-calendar-check"></i> <b>TODAY &amp; NEXT SESSION: WHAT TO LOOK FOR</b>'
            + '<span class="fb-dim"> &middot; as of ' + _fbEsc(_nfIst(Date.now(), { hour: '2-digit', minute: '2-digit', hour12: false })) + ' IST &middot; next session ' + _fbEsc(_fbDay(days.next)) + '</span>'
            + '<span class="fb-caret"><i class="bi bi-chevron-' + (_FB_OPEN ? 'up' : 'down') + '"></i></span></div>';
        if (!_FB_OPEN) return '<div class="fb-wrap">' + head + '</div>';
        return '<div class="fb-wrap">' + head
            + '<div class="fb-chips fb-facts">' + facts.chips.join('') + '</div>'
            + '<div class="fb-look"><div class="fb-sec">LOOK FOR</div><ul>' + facts.look.map(function (l) { return '<li>' + _fbEsc(l) + '</li>'; }).join('') + '</ul></div>'
            + '<div class="fb-cols"><div class="fb-col"><div class="fb-sec">SCHEDULED EVENTS, WITH THE USUAL INDIA READING</div>' + _fbEventsHtml(days) + '</div>'
            + '<div class="fb-col"><div class="fb-sec">IMPORTANT HEADLINES (LAST 12 HOURS)</div>' + _fbNewsHtml() + '</div></div>'
            + '<div class="fb-foot">Built from loaded data: the News panel, the economic calendar, prices and levels already on the dashboard. The India readings are general macro reasoning by event type, not predictions, and nothing here changes a score or verdict. Add Indian releases (CPI, GDP, Budget, results, elections) in the News panel under Upcoming.</div></div>';
    } catch (e) {
        try { console.warn('[focus brief]', e); } catch (e2) {}
        return '';
    }
}
function _fbRender() { try { if (jQ('#gtb-pane-focus').is(':visible') && typeof _tfRender === 'function') _tfRender(); } catch (e) {} }
jQ(document).on('click', '#fb-toggle', function () { _FB_OPEN = !_FB_OPEN; try { localStorage.setItem('GTB_FB_OPEN', _FB_OPEN ? '1' : '0'); } catch (e) {} _fbRender(); });

GM_addStyle(''
    + '.fb-wrap{border:1px solid var(--gtb-border);background:var(--gtb-surface);margin-bottom:10px;}'
    + '.fb-head{display:flex;align-items:center;gap:6px;padding:7px 10px;cursor:pointer;font-size:.66rem;color:var(--gtb-text);}'
    + '.fb-head .fb-caret{margin-left:auto;color:var(--gtb-muted);}'
    + '.fb-dim{color:var(--gtb-muted);font-size:.54rem;line-height:1.4;}'
    + '.fb-chips{display:flex;flex-wrap:wrap;gap:5px;}'
    + '.fb-facts{padding:2px 10px 8px;}'
    + '.fb-chip{font-size:.56rem;border:1px solid var(--gtb-border);padding:1px 7px;color:var(--gtb-text);white-space:nowrap;}'
    + '.fb-chip i{font-style:normal;color:var(--gtb-muted);margin-right:3px;}'
    + '.fb-sec{font-size:.5rem;font-weight:800;letter-spacing:.07em;color:var(--gtb-muted);margin-bottom:4px;}'
    + '.fb-look{padding:6px 10px;border-top:1px solid var(--gtb-border);background:var(--gtb-bg);}'
    + '.fb-look ul{margin:0;padding-left:16px;font-size:.6rem;line-height:1.45;}'
    + '.fb-look li{margin:2px 0;}'
    + '.fb-cols{display:grid;grid-template-columns:1fr 1fr;gap:0;border-top:1px solid var(--gtb-border);}'
    + '.fb-col{padding:8px 10px;min-width:0;max-height:420px;overflow-y:auto;}'
    + '.fb-col + .fb-col{border-left:1px solid var(--gtb-border);}'
    + '@media (max-width:1000px){.fb-cols{grid-template-columns:1fr;}.fb-col + .fb-col{border-left:0;border-top:1px solid var(--gtb-border);}}'
    + '.fb-day{font-size:.5rem;font-weight:800;letter-spacing:.06em;color:var(--gtb-muted);margin:6px 0 3px;}'
    + '.fb-ev{display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--gtb-border);}'
    + '.fb-ev.past{opacity:.55;}'
    + '.fb-evt{font-family:var(--gtb-mono,monospace);font-size:.62rem;font-weight:700;min-width:36px;}'
    + '.fb-evb{flex:1;min-width:0;font-size:.6rem;line-height:1.4;}'
    + '.fb-tag{font-size:.46rem;font-weight:800;padding:1px 5px;color:#fff;}'
    + '.fb-tag.high{background:var(--gtb-red);}.fb-tag.medium{background:var(--gtb-amber);color:#1a1205;}'
    + '.fb-vs{margin-top:2px;font-size:.54rem;display:flex;flex-direction:column;gap:1px;}'
    + '.fb-vs i{font-style:normal;color:var(--gtb-muted);}'
    + '.fb-news{display:block;padding:5px 0;border-bottom:1px solid var(--gtb-border);text-decoration:none;color:var(--gtb-text);}'
    + '.fb-news:hover{background:var(--gtb-bg);}'
    + '.fb-nt{font-size:.62rem;font-weight:600;line-height:1.3;}'
    + '.fb-none{color:var(--gtb-muted);font-size:.58rem;padding:4px 0;}'
    + '.fb-foot{padding:6px 10px;border-top:1px solid var(--gtb-border);color:var(--gtb-muted);font-size:.48rem;}'
);
