// ── Live index weights from niftyindices.com (v29.449) ──────────────────────────────────────────────────────────────────────────────
// NIFTY_50_WEIGHTED_STOCKS / NIFTY_BANK_WEIGHTED_STOCKS (constants.js) are the TOP 10 only, typed in by hand (NIFTY 50 covers ~53%).
// This file downloads the full constituent list with current weights once a day (cached in localStorage) and
//   1. keeps the full list in INDEX_WEIGHTS_FULL = { 'NIFTY 50': {SYM: wt%}, 'NIFTY BANK': {...} } for the price-only views
//      (What is moving the indices, the weightage-wise 9:15 / A-D lines), which need no option chain per stock;
//   2. fills NIFTY_50_LIST / NIFTY_BANK_LIST (all constituents) and WEIGHTED_STOCKS (union of both top 10s), and the two top-10 maps (the stocks whose OI/OBV is loaded every refresh) with the live top 10 by weight. Nothing is hardcoded:
//      until the first successful download (or a saved copy from an earlier day) the maps are EMPTY and a red notice says so.
// Source: https://liveindexsa.niftyindices.com/jsonfiles/Sector/SectorialIndexData<INDEX>_Sector.js (JSONP, CORS open).
var INDEX_WEIGHTS_FULL = {};
var _IW = { loaded: false, loading: false, asOf: null, drift: {}, err: null };
var _IW_INDICES = { 'NIFTY 50': 'NIFTY 50', 'NIFTY BANK': 'NIFTY BANK' };

function _iwParse(text) {                     // leaf entries only: {"label":"SYMBOL 4.14%","weight":4.14,"id":"1","date":"30-10-2026"}
    var out = {}, re = /"label":"([A-Z0-9&\-]+) [\d.]+%","weight":([\d.]+),"id":"[^"]*","date":"([^"]*)"/g, m, date = null;
    while ((m = re.exec(text))) { out[m[1]] = parseFloat(m[2]); date = m[3]; }
    return { weights: out, date: date };
}
function _iwGet(url) {
    return new Promise(function (resolve, reject) {
        if (typeof GM_xmlhttpRequest === 'function') {
            GM_xmlhttpRequest({ method: 'GET', url: url, timeout: 15000,
                onload: function (r) { r.status === 200 ? resolve(r.responseText) : reject(new Error('HTTP ' + r.status)); },
                onerror: function () { reject(new Error('network error')); }, ontimeout: function () { reject(new Error('timeout')); } });
        } else { fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }).then(resolve, reject); }
    });
}
function _iwApply(full) {
    INDEX_WEIGHTS_FULL = full;
    var maps = { 'NIFTY 50': typeof NIFTY_50_WEIGHTED_STOCKS !== 'undefined' ? NIFTY_50_WEIGHTED_STOCKS : null, 'NIFTY BANK': typeof NIFTY_BANK_WEIGHTED_STOCKS !== 'undefined' ? NIFTY_BANK_WEIGHTED_STOCKS : null };
    Object.keys(maps).forEach(function (ix) {
        var M = maps[ix], F = full[ix]; if (!M || !F || !Object.keys(F).length) return;
        var top = Object.keys(F).sort(function (a, b) { return F[b] - F[a]; }).slice(0, 10), before = Object.keys(M);
        Object.keys(M).forEach(function (s) { delete M[s]; });
        top.forEach(function (s) { M[s] = F[s]; });
        _IW.drift[ix] = { in: top.filter(function (s) { return before.indexOf(s) === -1; }), out: before.filter(function (s) { return top.indexOf(s) === -1; }) };
    });
    // the three plain lists: every constituent (alphabetical, as before) and the union of both top-10 lists
    var fill = function (arr, items) { if (!arr || !items || !items.length) return; arr.length = 0; items.forEach(function (x) { arr.push(x); }); };
    if (full['NIFTY 50']) fill(typeof NIFTY_50_LIST !== 'undefined' ? NIFTY_50_LIST : null, Object.keys(full['NIFTY 50']).sort());
    if (full['NIFTY BANK']) fill(typeof NIFTY_BANK_LIST !== 'undefined' ? NIFTY_BANK_LIST : null, Object.keys(full['NIFTY BANK']).sort());
    var u = {}; Object.keys(maps).forEach(function (ix) { if (maps[ix]) Object.keys(maps[ix]).forEach(function (k) { u[k] = (u[k] || 0) + (maps[ix][k] || 0); }); });
    fill(typeof WEIGHTED_STOCKS !== 'undefined' ? WEIGHTED_STOCKS : null, Object.keys(u).sort(function (a, b) { return u[b] - u[a]; }));
    _IW.loaded = true;
}
async function _iwLoad(force) {
    if (_IW.loading) return; _IW.loading = true;
    var day = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) || new Date().toISOString().slice(0, 10), key = 'GTB_INDEX_WEIGHTS';
    try {
        if (!force) { try { var c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && c.fetched === new Date().toISOString().slice(0, 10) && c.full && Object.keys(c.full).length) { _IW.asOf = c.asOf; _iwApply(c.full); _IW.loading = false; return; } } catch (e) {} }
        var full = {}, asOf = null;
        for (var ix in _IW_INDICES) {
            var txt = await _iwGet('https://liveindexsa.niftyindices.com/jsonfiles/Sector/SectorialIndexData' + encodeURIComponent(_IW_INDICES[ix]) + '_Sector.js?_=' + Date.now());
            var p = _iwParse(txt);
            if (Object.keys(p.weights).length < 5) throw new Error(ix + ': the response had no constituent list (' + (txt ? txt.length + ' bytes, not the expected format' : 'empty') + ')');
            full[ix] = p.weights; asOf = p.date || asOf;
        }
        _IW.asOf = asOf; _IW.err = null; _iwApply(full);
        if (typeof _gtbLsSet === 'function') _gtbLsSet(key, JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), asOf: asOf, full: full })); else try { localStorage.setItem(key, JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), asOf: asOf, full: full })); } catch (e) {}
        if (typeof _gtbApiOk === 'function') _gtbApiOk('index-weights');
    } catch (e) {
        _IW.err = e && e.message ? e.message : String(e);
        try { var c2 = JSON.parse(localStorage.getItem(key) || 'null'); if (c2 && c2.full) { _IW.asOf = c2.asOf; _iwApply(c2.full); } } catch (e2) {}
        if (typeof _gtbApiFail === 'function') _gtbApiFail('index-weights', 'Index weights (niftyindices.com)', _IW.err, _IW.loaded ? 'Using the weights saved on ' + (_IW.asOf || 'an earlier day') + ' (may be out of date).' : 'No weights at all: the weighted-stock lists, component scores and index-driver panels are empty until this works. Retrying every 5 minutes.');
    }
    _IW.loading = false;
    try { if (typeof _dlRenderConstListsTable === 'function' && jQ('#dl-constlists-table').length) _dlRenderConstListsTable(); } catch (e) {}
    try { if (typeof _gtbDashSigAgreeSchedule === 'function') _gtbDashSigAgreeSchedule(); } catch (e) {}
}
// full map for a group when loaded, else the top-10 map; used by the price-only views
function _iwMap(ix) {
    var F = INDEX_WEIGHTS_FULL[ix];
    if (F && Object.keys(F).length) return F;
    return ix === 'NIFTY BANK' ? (typeof NIFTY_BANK_WEIGHTED_STOCKS !== 'undefined' ? NIFTY_BANK_WEIGHTED_STOCKS : null) : (typeof NIFTY_50_WEIGHTED_STOCKS !== 'undefined' ? NIFTY_50_WEIGHTED_STOCKS : null);
}
function _iwIsFull(ix) { var F = INDEX_WEIGHTS_FULL[ix]; return !!(F && Object.keys(F).length > 10); }
function _iwStatus() { return { loaded: _IW.loaded, asOf: _IW.asOf, err: _IW.err, n: Object.keys(INDEX_WEIGHTS_FULL).map(function (k) { return k + ': ' + Object.keys(INDEX_WEIGHTS_FULL[k]).length; }), drift: _IW.drift }; }
// apply a saved copy at once (any day) so the lists are not empty while the download runs, then download today's
try { var _iwC = JSON.parse(localStorage.getItem('GTB_INDEX_WEIGHTS') || 'null'); if (_iwC && _iwC.full) { _IW.asOf = _iwC.asOf; _iwApply(_iwC.full); } } catch (e) {}
setTimeout(function () { _iwLoad(false); }, 1500);
setInterval(function () { try { var fetched = JSON.parse(localStorage.getItem('GTB_INDEX_WEIGHTS') || '{}').fetched; if (!_IW.loading && fetched !== new Date().toISOString().slice(0, 10)) _iwLoad(false); } catch (e) {} }, 5 * 60 * 1000);

// manual update (Data Load > Constant Lists button): forces a download now and reports the result
async function _iwManual() {
    jQ('#dl-iw-status').text('Downloading from niftyindices.com…');
    await _iwLoad(true);
    var ok = !_IW.err;
    try { if (typeof _gtbToast === 'function') _gtbToast(ok ? 'Index weights updated (' + Object.keys(INDEX_WEIGHTS_FULL).map(function (k) { return k + ' ' + Object.keys(INDEX_WEIGHTS_FULL[k]).length; }).join(', ') + ')' : 'Index weights failed: ' + _IW.err, ok ? 'success' : 'error'); } catch (e) {}
    return ok;
}
function _iwStatusLine() {
    var n = Object.keys(INDEX_WEIGHTS_FULL).map(function (k) { return k + ': ' + Object.keys(INDEX_WEIGHTS_FULL[k]).length + ' stocks'; }).join(' · ');
    if (_IW.loading) return 'Downloading…';
    if (!_IW.loaded) return '<span style="color:var(--gtb-red);">Not loaded' + (_IW.err ? ': ' + _IW.err : '') + '</span>';
    return 'Weights as of ' + (_IW.asOf || '?') + ' · ' + n + (_IW.err ? ' · <span style="color:var(--gtb-red);">last update failed: ' + _IW.err + ' (showing saved copy)</span>' : '');
}
jQ(document).on('click', '#dl-iw-update', function () { _iwManual(); });
