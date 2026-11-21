// Research lab (v29.611): studies run in the browser on the app's own Kite session (no API key needed).
// Study 1: first touch of ASO / AST / BSO / BST / VIXU / VIXL by weekday and by 9:15 zone for NIFTY 50 and NIFTY BANK from 5-minute candles.
// Results are shown in a popup, saved to the node server (data/research/<name>.json) and downloadable.
var _RL = { running: false, out: null };
var _RL_DAYS = 730;
function _rlSay(t) { try { jQ('#rl-status').text(t); } catch (e) {} console.log('[research]', t); }
function _rlStep(name) {
    var s = (typeof NSE_STRIKE_DIFF !== 'undefined' && NSE_STRIKE_DIFF[name]) ? String(NSE_STRIKE_DIFF[name]).split(',').map(Number) : null;
    if (s && s[0] > 0) return [s[0], s[1] > 0 ? s[1] : s[0]];
    return name === 'NIFTY 50' ? [50, 50] : [100, 100];
}
async function _rlStudyTouch(name) {
    var tok = INSTRUMENT_TOKENS[name]; if (!tok) throw new Error('no token for ' + name);
    var toM = moment(), fromM = moment().subtract(_RL_DAYS, 'days');
    _rlSay(name + ': loading 5-minute candles...');
    var c5 = await _gtbFetch5minRange(tok, fromM, toM);
    _rlSay(name + ': loading India VIX...');
    var vt = INSTRUMENT_TOKENS['INDIA VIX'] || 264969;
    var vres = await getHistoricalDataUsingPromise(vt, fromM.clone().subtract(10, 'days').format('YYYY-MM-DD'), toM.format('YYYY-MM-DD'), 'day');
    var vix = {};
    ((vres && vres.data && vres.data.candles) || []).forEach(function (k) { vix[String(k[0]).slice(0, 10)] = k[4]; });
    var vdays = Object.keys(vix).sort();
    // daily candles (300 extra days before the range) for the positional context: 200-day average and the 20-day trend, as known BEFORE each session
    _rlSay(name + ': loading daily candles...');
    var dres = await getHistoricalDataUsingPromise(tok, fromM.clone().subtract(320, 'days').format('YYYY-MM-DD'), toM.format('YYYY-MM-DD'), 'day');
    var dd = ((dres && dres.data && dres.data.candles) || []).map(function (k) { return { d: String(k[0]).slice(0, 10), c: k[4] }; });
    function posCtx(day) {
        var i = -1;
        for (var j = dd.length - 1; j >= 0; j--) if (dd[j].d < day) { i = j; break; }
        if (i < 200) return null;
        var s = 0; for (var q = i - 199; q <= i; q++) s += dd[q].c;
        var sma = s / 200, s2 = 0; for (var q2 = i - 199; q2 <= i; q2++) s2 += 0;
        var sma20ago = 0; for (var q3 = i - 219; q3 <= i - 20; q3++) if (q3 >= 0) sma20ago += dd[q3].c;
        return { p200: Math.round((dd[i].c / sma - 1) * 10000) / 100, slope200: i >= 219 ? Math.round((sma / (sma20ago / 200) - 1) * 10000) / 100 : null, r20: Math.round((dd[i].c / dd[i - 20].c - 1) * 10000) / 100, r5: Math.round((dd[i].c / dd[i - 5].c - 1) * 10000) / 100 };
    }
    var byDay = {}, order = [];
    c5.forEach(function (k) { var d = String(k[0]).slice(0, 10); if (!byDay[d]) { byDay[d] = []; order.push(d); } byDay[d].push(k); });
    var st = _rlStep(name), rows = [], prevClose = null;
    order.forEach(function (d) {
        var cs = byDay[d].filter(function (k) { var t = String(k[0]).slice(11, 16); return t >= '09:15' && t <= '15:25'; });
        if (cs.length < 50) { if (cs.length) prevClose = cs[cs.length - 1][4]; return; }
        var o = cs[0][1], c9 = cs[0][4];
        var pv = null;
        for (var i = vdays.length - 1; i >= 0; i--) if (vdays[i] < d) { pv = vix[vdays[i]]; break; }
        if (prevClose && pv) {
            var band = pv / 100 / Math.sqrt(246);
            var L = { ASO: o + st[0], AST: o + st[0] + st[1], BSO: o - st[0], BST: o - st[0] - st[1], VIXU: prevClose * (1 + band), VIXL: prevClose * (1 - band) };
            var touch = {};
            cs.forEach(function (k, idx) {
                ['ASO', 'AST', 'VIXU'].forEach(function (n) { if (touch[n] === undefined && k[2] >= L[n]) touch[n] = idx; });
                ['BSO', 'BST', 'VIXL'].forEach(function (n) { if (touch[n] === undefined && k[3] <= L[n]) touch[n] = idx; });
            });
            var zone = c9 >= L.AST ? 'AST' : c9 >= L.ASO ? 'ASO' : c9 <= L.BST ? 'BST' : c9 <= L.BSO ? 'BSO' : 'B/W';
            var hi = Math.max.apply(null, cs.map(function (k) { return k[2]; })), lo = Math.min.apply(null, cs.map(function (k) { return k[3]; }));
            rows.push({ d: d, dow: moment(d).isoWeekday() - 1, o: o, c9: c9, pos: posCtx(d), c: cs[cs.length - 1][4], pc: prevClose, hi: hi, lo: lo, z: zone, v: pv, L: L, t: touch });
        }
        prevClose = cs[cs.length - 1][4];
    });
    return { name: name, step: st, days: rows.length, from: rows.length ? rows[0].d : null, to: rows.length ? rows[rows.length - 1].d : null, rows: rows };
}
function _rlSummarise(S) {
    var DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], res = { byDow: [], zone: {} };
    function pct(a, f) { return a.length ? Math.round(1000 * a.filter(f).length / a.length) / 10 : null; }
    function agg(rows) {
        var o = { n: rows.length };
        ['ASO', 'AST', 'VIXU', 'BSO', 'BST', 'VIXL'].forEach(function (n) { o['t_' + n] = pct(rows, function (r) { return r.t[n] !== undefined; }); });
        var both = rows.filter(function (r) { return r.t.ASO !== undefined && r.t.BSO !== undefined; });
        o.both = pct(rows, function (r) { return r.t.ASO !== undefined && r.t.BSO !== undefined; });
        o.aso_first_of_both = pct(both, function (r) { return r.t.ASO < r.t.BSO; });
        var any = rows.filter(function (r) { return r.t.ASO !== undefined || r.t.BSO !== undefined; });
        o.aso_first_of_any = pct(any, function (r) { return r.t.BSO === undefined || (r.t.ASO !== undefined && r.t.ASO < r.t.BSO); });
        var bt = rows.filter(function (r) { return r.t.BSO !== undefined; });
        o.bso_then_close_up = pct(bt, function (r) { return r.c > r.o; });
        var at = rows.filter(function (r) { return r.t.ASO !== undefined; });
        o.aso_then_close_down = pct(at, function (r) { return r.c < r.o; });
        o.up_day = pct(rows, function (r) { return r.c > r.o; });
        return o;
    }
    res.all = agg(S.rows);
    for (var k = 0; k < 5; k++) { var o = agg(S.rows.filter(function (r) { return r.dow === k; })); o.key = DOW[k]; res.byDow.push(o); }
    res.all.key = 'All';
    ['AST', 'ASO', 'B/W', 'BSO', 'BST'].forEach(function (z) { var o = agg(S.rows.filter(function (r) { return r.z === z; })); o.key = z; res.zone[z] = o; });
    return res;
}
function _rlHtml(out) {
    var cols = [['n', 'n'], ['t_ASO', 'ASO%'], ['t_AST', 'AST%'], ['t_VIXU', 'VIXU%'], ['t_BSO', 'BSO%'], ['t_BST', 'BST%'], ['t_VIXL', 'VIXL%'], ['both', 'both%'], ['aso_first_of_both', 'ASO first of both'], ['aso_first_of_any', 'ASO first of any'], ['bso_then_close_up', 'BSO hit: close>open'], ['aso_then_close_down', 'ASO hit: close<open'], ['up_day', 'up day%']];
    function tbl(title, rows) {
        var t = '<div style="font-size:.7rem;margin:6px 0 2px;color:var(--gtb-muted)">' + title + '</div><div style="overflow:auto"><table class="table table-sm" style="font-size:.68rem"><tr><th></th>' + cols.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') + '</tr>';
        rows.forEach(function (r) { t += '<tr><td><b>' + r.key + '</b></td>' + cols.map(function (c) { return '<td>' + (r[c[0]] === null || r[c[0]] === undefined ? '-' : r[c[0]]) + '</td>'; }).join('') + '</tr>'; });
        return t + '</table></div>';
    }
    var h = '';
    Object.keys(out.studies).forEach(function (nm) {
        var s = out.studies[nm], sm = s.summary;
        h += '<div style="margin:10px 0 0;font-weight:700">' + nm + ' - ' + s.days + ' days, ' + s.from + ' to ' + s.to + ', step ' + s.step.join('/') + '</div>';
        h += tbl('By weekday', sm.byDow.concat([sm.all]));
        h += tbl('By 9:15 close zone', Object.keys(sm.zone).map(function (z) { return sm.zone[z]; }));
    });
    return h;
}
async function _rlRun() {
    if (_RL.running) return;
    _RL.running = true;
    var out = { made: moment().format(), studies: {} };
    try {
        var names = ['NIFTY 50', 'NIFTY BANK'];
        for (var i = 0; i < names.length; i++) {
            var s = await _rlStudyTouch(names[i]);
            s.summary = _rlSummarise(s);
            out.studies[names[i]] = s;
        }
        _RL.out = out;
        jQ('#rl-result').html(_rlHtml(out));
        _rlSay('done. Saving to the node server...');
        try {
            var ok = await new Promise(function (res) {
                GM_xmlhttpRequest({ method: 'POST', url: 'http://localhost:3000/api/research/save', headers: { 'Content-Type': 'application/json' }, data: JSON.stringify({ name: 'touch_study', data: out }), timeout: 60000,
                    onload: function (r) { res(r.status === 200); }, onerror: function () { res(false); }, ontimeout: function () { res(false); } });
            });
            _rlSay(ok ? 'done. Saved to data/research/touch_study.json on the node server.' : 'done, but the server did not accept the file (restart node server.js); use Download.');
        } catch (e) { _rlSay('done, but the node server was not reachable; use Download.'); }
    } catch (e) { _rlSay('failed: ' + (e && e.message || e)); }
    _RL.running = false;
}
function _rlDownload() {
    if (!_RL.out) return;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(_RL.out)], { type: 'application/json' }));
    a.download = 'touch_study.json'; a.click();
}
function _rlShowPopup() {
    var html = '<div id="rl-wrap" style="padding:10px;color:var(--gtb-text);background:var(--gtb-bg);height:100%;overflow:auto">'
        + '<div style="font-size:.75rem;margin-bottom:6px">Study: first touch of ASO / AST / BSO / BST / VIXU / VIXL by weekday and by 9:15 zone, NIFTY 50 and NIFTY BANK, about ' + _RL_DAYS + ' calendar days of 5-minute candles from your Kite session (about 20 requests, a minute or two).</div>'
        + '<button id="rl-run" class="btn btn-sm btn-primary">Run study</button> <button id="rl-dl" class="btn btn-sm btn-secondary">Download JSON</button> <span id="rl-status" style="font-size:.7rem;margin-left:8px"></span>'
        + '<div id="rl-result"></div></div>';
    showPopUpWindow('research-lab', html, 'Research lab', 1100, 640);
    var cls = 'popup-custom-style-research-lab';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html('<div style="display:flex;align-items:center;gap:6px;width:100%;"><span style="font-weight:800;font-size:0.7rem;">RESEARCH LAB</span>' + popupWinControls(cls) + '</div>');
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('#rl-run').on('click', _rlRun);
    jQ('#rl-dl').on('click', _rlDownload);
    if (_RL.out) jQ('#rl-result').html(_rlHtml(_RL.out));
}
