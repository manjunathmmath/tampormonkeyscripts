// ── Heatmap (v29.610) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// All Tools > Heatmap: today's move of the major indices, the Nifty 50 stocks and the Bank Nifty stocks as treemaps (tile area = the stock's weight in the index, colour = % move),
// and every F&O stock as a grid of small tiles. Reads only the prices the app already holds (INSTRUMENT_LTP_PRICE for the last price, INSTRUMENT_LIST_GLOBAL for the open and
// the previous close), so it shows the snapshot time when one is set and the live feed's prices when it runs. "Refresh prices" runs the dashboard's all-instrument price scan.
// Click a tile to open that name in the Chart View. A view of today's move only: nothing here is scored or feeds any signal.
var _HM = { mode: 'prev', sort: 'chg', timer: null };

function _hmRead() {
    var ltp = {}, gl = {};
    try { ltp = JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}') || {}; } catch (e) {}
    try { gl = JSON.parse(localStorage.getItem('INSTRUMENT_LIST_GLOBAL') || '{}') || {}; } catch (e) {}
    return { ltp: ltp, gl: gl };
}
function _hmQuote(n, R) {
    var a = R.ltp[n], b = R.gl[n]; if (!a || !b) return null;
    var l = parseFloat(a.ltp), p = parseFloat(b.prevPrice), o = parseFloat(b.price);
    if (!isFinite(l) || !isFinite(p) || !p) return null;
    var chg = (l / p - 1) * 100, chgOpen = (isFinite(o) && o) ? (l / o - 1) * 100 : null;
    return { n: n, ltp: l, prev: p, open: o, chg: chg, chgOpen: chgOpen, v: (_HM.mode === 'open' ? chgOpen : chg) };
}
function _hmColor(v, scale) {
    if (v === null || !isFinite(v)) return { bg: 'var(--gtb-surface2)', fg: 'var(--gtb-muted)' };
    var k = Math.min(1, Math.abs(v) / scale), a = 0.18 + 0.82 * k;
    return v >= 0 ? { bg: 'rgba(46,160,67,' + a.toFixed(2) + ')', fg: k > 0.45 ? '#fff' : 'var(--gtb-text)' } : { bg: 'rgba(248,81,73,' + a.toFixed(2) + ')', fg: k > 0.45 ? '#fff' : 'var(--gtb-text)' };
}
function _hmFmt(v, d) { return v === null || !isFinite(v) ? '-' : (v > 0 ? '+' : '') + v.toFixed(d === undefined ? 2 : d) + '%'; }

// squarified treemap: items [{d, v}] (v > 0) laid out in a w x h box
function _hmTreemap(items, w, h) {
    var rects = [], list = items.filter(function (i) { return i.v > 0; }).sort(function (a, b) { return b.v - a.v; });
    if (!list.length) return rects;
    var total = 0; list.forEach(function (i) { total += i.v; });
    var scale = (w * h) / total; list.forEach(function (i) { i.a = i.v * scale; });
    var cx = 0, cy = 0, cw = w, ch = h, row = [];
    var sum = function (r) { var s = 0; r.forEach(function (i) { s += i.a; }); return s; };
    var worst = function (r, side) { var s = sum(r), mx = 0, mn = Infinity; r.forEach(function (i) { if (i.a > mx) mx = i.a; if (i.a < mn) mn = i.a; }); return Math.max(side * side * mx / (s * s), s * s / (side * side * mn)); };
    var place = function (r) {
        var s = sum(r);
        if (cw >= ch) { var rw = s / ch, yy = cy; r.forEach(function (i) { var hh = i.a / rw; rects.push({ d: i.d, x: cx, y: yy, w: rw, h: hh }); yy += hh; }); cx += rw; cw -= rw; }
        else { var rh = s / cw, xx = cx; r.forEach(function (i) { var ww = i.a / rh; rects.push({ d: i.d, x: xx, y: cy, w: ww, h: rh }); xx += ww; }); cy += rh; ch -= rh; }
    };
    var k = 0;
    while (k < list.length) {
        var side = Math.min(cw, ch), it = list[k];
        if (!row.length || worst(row.concat([it]), side) <= worst(row, side)) { row.push(it); k++; } else { place(row); row = []; }
    }
    if (row.length) place(row);
    return rects;
}

function _hmWeights(index) {
    var m = {};
    try { if (typeof _iwMap === 'function') m = _iwMap(index) || {}; } catch (e) {}
    var out = {};
    Object.keys(m).forEach(function (k) { var w = parseFloat(m[k]); if (isFinite(w) && w > 0) out[k] = w; else if (m[k] && m[k].weight) out[k] = parseFloat(m[k].weight) || 0; });
    return out;
}
function _hmSummary(qs, wt) {
    var adv = 0, dec = 0, flat = 0, sw = 0, sv = 0;
    qs.forEach(function (q) { if (q.v === null) return; if (q.v > 0.005) adv++; else if (q.v < -0.005) dec++; else flat++; var w = wt ? (wt[q.n] || 0) : 1; sw += w; sv += w * q.v; });
    return { adv: adv, dec: dec, flat: flat, avg: sw ? sv / sw : null };
}
function _hmHead(title, s, note) {
    return '<div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 14px;margin:14px 0 6px;"><span style="font-size:0.8rem;font-weight:800;">' + title + '</span>'
        + '<span style="font-size:0.62rem;color:var(--gtb-green);font-weight:700;">&#9650; ' + s.adv + '</span><span style="font-size:0.62rem;color:var(--gtb-red);font-weight:700;">&#9660; ' + s.dec + '</span>'
        + (s.avg !== null ? '<span style="font-size:0.62rem;color:var(--gtb-muted);">' + (note || 'average') + ' <b style="color:' + (s.avg >= 0 ? 'var(--gtb-green)' : 'var(--gtb-red)') + ';">' + _hmFmt(s.avg) + '</b></span>' : '') + '</div>';
}
function _hmTile(q, st, extra) {
    var c = _hmColor(q.v, st.scale), t = q.n + '  ' + (q.ltp ? q.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '') + '  ' + _hmFmt(q.chg) + ' vs previous close' + (q.chgOpen !== null ? ', ' + _hmFmt(q.chgOpen) + ' since open' : '') + (extra || '');
    return '<div class="hm-tile" data-n="' + q.n.replace(/"/g, '&quot;') + '" title="' + t.replace(/"/g, '&quot;') + '" style="' + st.css + 'background:' + c.bg + ';color:' + c.fg + ';">' + st.inner(q) + '</div>';
}
function _hmTreemapHtml(names, wt, R, W, H) {
    var qs = names.map(function (n) { return _hmQuote(n, R); }).filter(Boolean), byN = {}; qs.forEach(function (q) { byN[q.n] = q; });
    var items = qs.map(function (q) { return { d: q, v: wt && wt[q.n] ? wt[q.n] : 1 }; }), rects = _hmTreemap(items, W, H);
    var html = '<div style="position:relative;width:' + W + 'px;height:' + H + 'px;">' + rects.map(function (r) {
        var q = r.d, big = r.w >= 62 && r.h >= 34, mid = r.w >= 38 && r.h >= 20;
        var st = { scale: 3, css: 'position:absolute;left:' + r.x.toFixed(1) + 'px;top:' + r.y.toFixed(1) + 'px;width:' + (r.w - 2).toFixed(1) + 'px;height:' + (r.h - 2).toFixed(1) + 'px;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;text-align:center;line-height:1.15;',
            inner: function (x) { return mid ? '<span style="font-size:' + (big ? Math.min(15, Math.max(10, r.w / 9)).toFixed(0) : 9) + 'px;font-weight:800;">' + x.n + '</span>' + (big ? '<span style="font-size:' + Math.min(13, Math.max(10, r.w / 11)).toFixed(0) + 'px;">' + _hmFmt(x.v) + '</span>' : '') : ''; } };
        return _hmTile(q, st, wt && wt[q.n] ? '  (weight ' + wt[q.n].toFixed(2) + '%)' : '');
    }).join('') + '</div>';
    return { html: html, qs: qs, missing: names.length - qs.length };
}

function _hmRender() {
    var body = document.getElementById('hm-body'); if (!body) return;
    var R = _hmRead(), W = Math.max(480, body.clientWidth - 24), h = '';
    var have = Object.keys(R.ltp).length && Object.keys(R.gl).length;
    var st = document.getElementById('hm-stamp'); if (st) { var asof = ''; try { asof = (typeof _gtbFinalAsOf === 'function') ? _gtbFinalAsOf() : ''; } catch (e) {} st.textContent = (asof ? 'prices as of ' + asof : '') + ' · drawn ' + new Date().toLocaleTimeString('en-IN', { hour12: false }); }
    if (!have) { body.innerHTML = '<div style="padding:24px;font-size:0.72rem;color:var(--gtb-muted);line-height:1.6;">No prices are loaded yet. Open the dashboard and press <b>Load Prices</b> (the open and previous close of every instrument), then <b>Refresh prices</b> here.</div>'; return; }
    var miss = 0;
    // 1. indices
    var idx = (typeof INDICES !== 'undefined' ? INDICES : []).filter(function (n) { return n !== 'INDIA VIX'; }).map(function (n) { return _hmQuote(n, R); }).filter(Boolean);
    h += _hmHead('Indices', _hmSummary(idx, null), 'average');
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:3px;">' + idx.map(function (q) {
        return _hmTile(q, { scale: 1.5, css: 'padding:10px 8px;cursor:pointer;text-align:center;line-height:1.3;', inner: function (x) { return '<div style="font-size:0.7rem;font-weight:800;">' + x.n + '</div><div style="font-size:1rem;font-weight:800;">' + _hmFmt(x.v) + '</div><div style="font-size:0.55rem;opacity:0.85;">' + x.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 }) + '</div>'; } });
    }).join('') + '</div>';
    var vix = _hmQuote('INDIA VIX', R); if (vix) h += '<div style="font-size:0.58rem;color:var(--gtb-muted);margin-top:4px;">India VIX ' + vix.ltp.toFixed(2) + ' (' + _hmFmt(vix.chg) + ' vs previous close)</div>';
    // 2. Nifty 50 and 3. Bank Nifty, sized by index weight
    var secs = [['NIFTY 50 stocks', typeof NIFTY_50_LIST !== 'undefined' ? NIFTY_50_LIST : [], 'NIFTY 50', 400], ['BANK NIFTY stocks', typeof NIFTY_BANK_LIST !== 'undefined' ? NIFTY_BANK_LIST : [], 'NIFTY BANK', 300]];
    secs.forEach(function (s) {
        var wt = _hmWeights(s[2]), names = s[1].slice(), full = Object.keys(wt).length >= names.length * 0.8;
        if (!names.length) { h += _hmHead(s[0], { adv: 0, dec: 0, flat: 0, avg: null }) + '<div style="font-size:0.6rem;color:var(--gtb-muted);">The constituent list is not loaded yet (Data Load > Constant Lists > Update from niftyindices.com).</div>'; return; }
        var t = _hmTreemapHtml(names, full ? wt : null, R, W, s[3]); miss += t.missing;
        h += _hmHead(s[0], _hmSummary(t.qs, full ? wt : null), full ? 'weighted move' : 'average') + t.html + '<div style="font-size:0.5rem;color:var(--gtb-muted);margin-top:3px;">' + (full ? 'Tile area = weight in the index.' : 'Equal tiles: the index weights are not loaded.') + '</div>';
    });
    // 4. every F&O stock
    var fo = (typeof FO_LIST !== 'undefined' ? FO_LIST : []).map(function (n) { return _hmQuote(n, R); }).filter(Boolean);
    miss += (typeof FO_LIST !== 'undefined' ? FO_LIST.length : 0) - fo.length;
    fo.sort(function (a, b) { return _HM.sort === 'az' ? (a.n < b.n ? -1 : 1) : ((b.v === null ? -99 : b.v) - (a.v === null ? -99 : a.v)); });
    h += _hmHead('F&O stocks', _hmSummary(fo, null), 'average')
        + '<div style="font-size:0.55rem;color:var(--gtb-muted);margin-bottom:4px;">Sort: <span class="hm-sort" data-s="chg" style="cursor:pointer;' + (_HM.sort === 'chg' ? 'font-weight:800;color:var(--gtb-accent);' : '') + '">by move</span> · <span class="hm-sort" data-s="az" style="cursor:pointer;' + (_HM.sort === 'az' ? 'font-weight:800;color:var(--gtb-accent);' : '') + '">A to Z</span></div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:2px;">' + fo.map(function (q) {
            return _hmTile(q, { scale: 3, css: 'width:78px;height:38px;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;text-align:center;line-height:1.15;', inner: function (x) { return '<span style="font-size:9px;font-weight:800;">' + x.n + '</span><span style="font-size:10px;">' + _hmFmt(x.v) + '</span>'; } });
        }).join('') + '</div>';
    // legend
    h += '<div style="display:flex;align-items:center;gap:6px;margin-top:16px;font-size:0.5rem;color:var(--gtb-muted);"><span>-3%</span><span style="display:inline-block;width:160px;height:8px;background:linear-gradient(90deg,rgba(248,81,73,1),rgba(248,81,73,0.2),rgba(128,128,128,0.15),rgba(46,160,67,0.2),rgba(46,160,67,1));"></span><span>+3%</span><span style="margin-left:10px;">(indices use a scale of +-1.5%)</span>'
        + (miss > 0 ? '<span style="margin-left:10px;color:var(--gtb-amber);">' + miss + ' name' + (miss > 1 ? 's have' : ' has') + ' no price yet</span>' : '') + '</div>';
    var top = body.scrollTop; body.innerHTML = h; body.scrollTop = top;
}

function _hmShowPopup() {
    var html = '<div id="hm-wrap" style="position:absolute;inset:0;display:flex;flex-direction:column;background:var(--gtb-bg);color:var(--gtb-text);">'
        + '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 12px;border-bottom:1px solid var(--gtb-border);">'
        +   '<span style="font-size:0.58rem;color:var(--gtb-muted);">Move</span>'
        +   '<span id="hm-mode" style="display:inline-flex;"><button class="hm-m gtb-win-btn" data-m="prev" style="width:auto;font-size:0.58rem;padding:3px 10px;">vs previous close</button><button class="hm-m gtb-win-btn" data-m="open" style="width:auto;font-size:0.58rem;padding:3px 10px;">since the open</button></span>'
        +   '<button id="hm-refresh" class="gtb-win-btn" style="width:auto;font-size:0.58rem;padding:3px 10px;" title="Fetch the price of every instrument (about 215 history calls through the shared queue)"><i class="bi bi-arrow-repeat"></i> Refresh prices</button>'
        +   '<span id="hm-stamp" style="margin-left:auto;font-size:0.55rem;color:var(--gtb-muted);"></span></div>'
        + '<div id="hm-body" style="flex:1 1 0;min-height:0;overflow:auto;padding:0 12px 16px;"></div></div>';
    showPopUpWindow('heatmap', html, 'Heatmap', Math.min(1500, Math.max(1000, window.innerWidth - 40)), Math.min(880, Math.max(640, window.innerHeight - 60)));
    var cls = 'popup-custom-style-heatmap';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html('<div style="display:flex;align-items:center;gap:6px;width:100%;"><i class="bi bi-grid-3x3-gap-fill"></i><span style="font-weight:800;font-size:0.7rem;">HEATMAP</span>' + popupWinControls(cls) + '</div>');
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
    jQ('.' + cls).find('.popupwindow_content').css({ overflow: 'hidden', padding: 0, position: 'relative' });
    var paintMode = function () { jQ('.hm-m').each(function () { var on = this.getAttribute('data-m') === _HM.mode; jQ(this).css({ 'background': on ? 'var(--gtb-accent)' : '', 'color': on ? '#fff' : '', 'font-weight': on ? '800' : '' }); }); };
    jQ(document).off('.hm')
        .on('click.hm', '.hm-m', function () { _HM.mode = this.getAttribute('data-m'); paintMode(); _hmRender(); })
        .on('click.hm', '.hm-sort', function () { _HM.sort = this.getAttribute('data-s'); _hmRender(); })
        .on('click.hm', '.hm-tile', function () { var n = this.getAttribute('data-n'); if (typeof _cvShowPopup === 'function') _cvShowPopup(n); })
        .on('click.hm', '#hm-refresh', async function () {
            var b = jQ(this); b.prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Fetching prices...');
            try { if (typeof updateStrorageLtpPrice === 'function') await updateStrorageLtpPrice(); } catch (e) { console.warn('[heatmap] price refresh failed', e); }
            b.prop('disabled', false).html('<i class="bi bi-arrow-repeat"></i> Refresh prices'); _hmRender();
        });
    paintMode(); _hmRender();
    if (_HM.timer) clearInterval(_HM.timer);
    _HM.timer = setInterval(function () { if (!document.getElementById('hm-wrap')) { clearInterval(_HM.timer); _HM.timer = null; return; } _hmRender(); }, 20000);      // re-read the stored prices (cheap), e.g. with the live feed
}
