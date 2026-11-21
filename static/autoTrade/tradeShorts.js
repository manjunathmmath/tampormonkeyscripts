// Trade Shorts (v29.615, reworked v29.620): swipeable full-height cards, one stock per card, like short videos.
// v29.620: the list comes from the 9:15 scan (filter chips AST / ASO / BSO / BST / B/W) instead of from what the Chart View happened to have loaded. A stock's data is
// loaded WHEN ITS CARD IS SHOWN (Next / Prev / Auto / Reload): fresh price, option chain + futures (_ossScanLoad), then the Focus gates and the Probable-trade plan are read.
// Nothing is loaded for the other names. Rule-based, not back-tested, never places an order.
// Theme-independent colours on purpose (the overlay sits on its own dark ground), so this element needs no entry in the --gtb-* container lists.
var _TS = { names: [], i: 0, timer: null, auto: true, secs: 12, drag: null, cache: {}, zones: null, only: false, seq: 0, busy: false };
var _TS_ZONES = ['AST', 'ASO', 'BSO', 'BST', 'B/W'];
var _TS_TTL = 4 * 60 * 1000;
function _tsZoneSel() {
    if (_TS.zones) return _TS.zones;
    var z = { AST: 1, ASO: 1, BSO: 1, BST: 1, 'B/W': 0 };
    try { var s = JSON.parse(localStorage.getItem('GTB_TS_ZONES') || 'null'); if (s) _TS_ZONES.forEach(function (k) { if (s[k] != null) z[k] = s[k] ? 1 : 0; }); } catch (e) {}
    try { _TS.only = localStorage.getItem('GTB_TS_ONLY') === '1'; } catch (e) {}
    return (_TS.zones = z);
}
function _tsBoard() { try { return JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || 'null') || {}; } catch (e) { return {}; } }
function _tsZoneOf(nm) { var b = _tsBoard(); return (b[nm] && b[nm].CLOSE_9_15) || 'B/W'; }
function _tsCounts() {
    var b = _tsBoard(), c = { AST: 0, ASO: 0, BSO: 0, BST: 0, 'B/W': 0 };
    Object.keys(b).forEach(function (n) { var z = (b[n] || {}).CLOSE_9_15 || 'B/W'; if (c[z] != null && _tsHasOptions(n)) c[z]++; });
    return c;
}
function _tsHasOptions(nm) { try { return typeof _cvOptCapable === 'function' ? _cvOptCapable(nm) : true; } catch (e) { return true; } }
function _tsBuildNames() {
    var sel = _tsZoneSel(), b = _tsBoard(), out = [];
    _TS_ZONES.forEach(function (z) {
        if (!sel[z]) return;
        Object.keys(b).filter(function (n) { return ((b[n] || {}).CLOSE_9_15 || 'B/W') === z && _tsHasOptions(n); }).sort().forEach(function (n) { out.push(n); });
    });
    return out;
}
function _tsPx(v) { return v == null ? '-' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: v >= 1000 ? 0 : 2 }); }
function _tsStrip(s) { return String(s || '').replace(/<[^>]+>/g, ''); }
// today's 5-minute candles for the mini chart when the option-chain load did not leave any
async function _tsCandles(nm) {
    var sm = INSTRUMENT_SCORE_MAP[nm], cs = sm && sm.oiData && sm.oiData.spotCandles;
    if (cs && cs.length >= 5) return cs;
    try {
        var tok = INSTRUMENT_TOKENS[nm]; if (!tok) return null;
        var d = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) || moment().format('YYYY-MM-DD');
        var res = await getHistoricalDataUsingPromise(tok, d, (typeof _gtbCurrDayTo === 'function' ? _gtbCurrDayTo() : d), '5minute');
        var c = res && res.data && res.data.candles || [];
        return (typeof _gtbTrimCandles === 'function') ? _gtbTrimCandles(c, d) : c;
    } catch (e) { return null; }
}
// Load one stock and read its card. Fresh price, option chain, futures; then the gates and the plan.
async function _tsLoad(nm, force) {
    var hit = _TS.cache[nm];
    if (!force && hit && (Date.now() - hit.at) < _TS_TTL) return hit;
    try { await _cvRefreshLtp([nm]); } catch (e) {}
    var err = null;
    try { await _ossScanLoad(nm); _cvAdoptChain(nm); } catch (e) { err = e && e.message || String(e); }
    var card = { nm: nm, at: Date.now(), zone: _tsZoneOf(nm), err: err, res: null, plan: null, out: null, candles: null };
    try { window._TF_SKIP_LOAD = true; card.res = _tfCompute(nm); } catch (e) { card.err = card.err || (e && e.message); } finally { window._TF_SKIP_LOAD = false; }
    try { card.out = _gtbOutlook(nm); if (card.out && card.out.ok && card.out.plan && card.out.plan.stop) card.plan = card.out.plan; } catch (e) {}
    try { if (card.res && card.res.v) _cvDotSet(nm, card.res.v); } catch (e) {}
    card.candles = await _tsCandles(nm);
    _TS.cache[nm] = card;
    return card;
}
function _tsActionable(card) { return !!(card && card.res && card.res.v && (card.res.v.call === 'LONG' || card.res.v.call === 'SHORT') && card.plan); }
function _tsChart(cv, card) {
    var cs = card.candles, P = card.plan;
    var W = cv.width, H = cv.height, g = cv.getContext('2d'); g.clearRect(0, 0, W, H);
    if (!cs || cs.length < 5) { g.fillStyle = '#7d8590'; g.font = '13px sans-serif'; g.fillText('no 5-minute candles yet', 12, H / 2); return; }
    cs = cs.slice(-60);
    var t = function (z) { return z == null ? null : (z.price != null ? z.price : z); };
    var lv = P ? [P.entryPx, P.stop, t(P.t1), t(P.t2)].filter(function (x) { return x != null; }) : [];
    var lo = Math.min.apply(null, cs.map(function (k) { return k[3]; }).concat(lv)), hi = Math.max.apply(null, cs.map(function (k) { return k[2]; }).concat(lv));
    var pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
    var y = function (p) { return H - (p - lo) / (hi - lo) * H; }, step = W / cs.length;
    var line = function (p, col, lab) { if (p == null) return; g.strokeStyle = col; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(0, y(p)); g.lineTo(W, y(p)); g.stroke(); g.setLineDash([]); g.fillStyle = col; g.font = '11px sans-serif'; g.fillText(lab + ' ' + _tsPx(p), 6, y(p) - 3); };
    cs.forEach(function (k, i) {
        var up = k[4] >= k[1], x = i * step + step / 2; g.strokeStyle = g.fillStyle = up ? '#3fb950' : '#f85149';
        g.beginPath(); g.moveTo(x, y(k[2])); g.lineTo(x, y(k[3])); g.stroke();
        g.fillRect(x - step * 0.3, Math.min(y(k[1]), y(k[4])), step * 0.6, Math.max(1, Math.abs(y(k[1]) - y(k[4]))));
    });
    if (P) { line(P.entryPx, '#58a6ff', 'ENTRY'); line(P.stop, '#f85149', 'STOP'); line(t(P.t1), '#3fb950', 'T1'); line(t(P.t2), '#56d364', 'T2'); }
}
function _tsWhy(card) {
    var tone = { good: '#3fb950', warn: '#d29922', bad: '#f85149' }, rows = (card.res && card.res.rows || []).filter(function (r) { return r.line && r.tone !== 'none'; }), out = [];
    ['direction', 'entry', 'risk', 'tradeable', 'exit'].forEach(function (k) {
        var r = rows.filter(function (x) { return x.key === k; })[0];
        if (r && out.length < 5) out.push('<li><i style="background:' + (tone[r.tone] || '#7d8590') + '"></i><span><b>' + String(r.title).toLowerCase() + '</b> ' + _tsStrip(r.line).slice(0, 170) + '</span></li>');
    });
    return out.join('');
}
function _tsCardHtml(card, n, total) {
    var v = card.res && card.res.v, call = v ? v.call : 'NO TRADE', P = card.plan;
    var act = _tsActionable(card), long = call === 'LONG', col = act ? (long ? '#3fb950' : '#f85149') : (call === 'WAIT' ? '#d29922' : '#8b949e');
    var word = act ? (long ? '▲ LONG' : '▼ SHORT') : call, rank = v ? ({ HIGH: 3, MEDIUM: 2, LOW: 1 }[v.conf] || 0) : 0, dots = '●'.repeat(rank) + '○'.repeat(3 - rank);
    var spot = card.out && card.out.spot;
    var h = '<div class="ts-top"><span class="ts-name">' + card.nm + ' <em class="ts-z ts-z-' + card.zone.replace('/', '') + '">9:15 ' + card.zone + '</em></span><span class="ts-count">' + n + ' / ' + total + '</span></div>'
        + '<div class="ts-dir" style="color:' + col + '">' + word + '</div>'
        + '<div class="ts-sub">' + (v && v.conf ? 'confidence ' + v.conf + ' ' + dots + ' &middot; ' : '') + (spot ? 'price ' + _tsPx(spot) + ' &middot; ' : '') + 'read ' + moment(card.at).format('HH:mm:ss') + '</div>'
        + (!act && v ? '<div class="ts-head">' + _tsStrip(v.headline).slice(0, 200) + '</div>' : '')
        + '<canvas id="ts-canvas" width="360" height="170"></canvas>';
    if (act) {
        var t = function (z) { return z == null ? null : (z.price != null ? z.price : z); }, risk = Math.abs(P.entryPx - P.stop), pct = P.entryPx ? (risk / P.entryPx * 100).toFixed(2) : '-';
        h += '<div class="ts-grid"><div><small>' + (P.atLevel ? 'ENTRY (at it now)' : 'ENTRY (wait for it)') + '</small><b>' + _tsPx(P.entryPx) + '</b></div><div><small>STOP</small><b style="color:#f85149">' + _tsPx(P.stop) + '</b></div>'
            + '<div><small>TARGET 1' + (P.rr ? ' &middot; ' + P.rr.toFixed(1) + 'R' : '') + '</small><b style="color:#3fb950">' + _tsPx(t(P.t1)) + '</b></div><div><small>TARGET 2</small><b style="color:#56d364">' + _tsPx(t(P.t2)) + '</b></div></div>'
            + '<div class="ts-risk">Risk ' + _tsPx(risk) + ' pts (' + pct + '% of price)</div>';
    } else h += '<div class="ts-risk">No trade plan: the call is not an actionable LONG or SHORT, so no entry, stop or targets are shown.</div>';
    h += '<ul class="ts-why">' + _tsWhy(card) + '</ul>'
        + (card.err ? '<div class="ts-warn">Load problem: ' + _tsStrip(card.err).slice(0, 120) + '</div>' : '')
        + (card.out && card.out.rankNote ? '<div class="ts-warn">' + _tsStrip(card.out.rankNote).slice(0, 140) + '</div>' : '')
        + '<div class="ts-foot">Rule-based from the dashboard\'s own data. Not tested, not advice. Nothing is ordered.</div>';
    return h;
}
function _tsChipsHtml() {
    var sel = _tsZoneSel(), c = _tsCounts();
    return _TS_ZONES.map(function (z) { return '<button class="ts-zc' + (sel[z] ? ' on' : '') + '" data-z="' + z + '" title="Include names whose 9:15 candle closed ' + z + '">' + z + ' <small>' + c[z] + '</small></button>'; }).join('')
        + '<button class="ts-only' + (_TS.only ? ' on' : '') + '" id="ts-only" title="Skip names that have no actionable LONG or SHORT plan">Actionable only</button>';
}
function _tsSetBar() {
    var n = _TS.names.length, pct = n ? Math.round((_TS.i + 1) / n * 100) : 0;
    jQ('#ts-pos').css('width', pct + '%');
}
function _tsStopTimer() { clearTimeout(_TS.timer); jQ('#ts-bar').css({ transition: 'none', width: '0%' }); }
function _tsStartTimer() {
    _tsStopTimer(); if (!_TS.auto) return;
    setTimeout(function () { jQ('#ts-bar').css({ transition: 'width ' + _TS.secs + 's linear', width: '100%' }); }, 30);
    _TS.timer = setTimeout(function () { _tsStep(1); }, _TS.secs * 1000);
}
function _tsMsg(html) { jQ('#gtb-ts-overlay .ts-card').html('<div class="ts-empty">' + html + '</div>'); }
// show the card at index i: load that stock (fresh), then draw it; with "Actionable only" keep stepping in the same direction until one qualifies
async function _tsGoTo(i, dirn) {
    var N = _TS.names.length; if (!N) { _tsMsg('<b>No names in this filter</b><p>Choose AST, ASO, BSO, BST or B/W above. The list comes from the day\'s 9:15 scan (run it from the dashboard top bar if nothing shows).</p>'); jQ('#ts-pos').css('width', '0%'); return; }
    var seq = ++_TS.seq, tries = 0; dirn = dirn || 1; _tsStopTimer();
    while (tries < N) {
        i = ((i % N) + N) % N; _TS.i = i; _tsSetBar();
        var nm = _TS.names[i];
        _tsMsg('<b>' + nm + '</b><p>Loading fresh price, option chain and futures (' + (i + 1) + ' of ' + N + ')' + (_TS.only && tries ? ' &middot; skipped ' + tries + ' not actionable' : '') + '...</p>');
        var card = await _tsLoad(nm, tries === 0 && !!_TS.forceNext);
        if (seq !== _TS.seq || !document.getElementById('gtb-ts-overlay')) return;     // the user moved on
        if (!_TS.only || _tsActionable(card)) {
            _TS.forceNext = false;
            jQ('#gtb-ts-overlay .ts-card').html(_tsCardHtml(card, i + 1, N));
            try { _tsChart(document.getElementById('ts-canvas'), card); } catch (e) {}
            _tsStartTimer(); return;
        }
        i += dirn; tries++;
    }
    _TS.forceNext = false;
    _tsMsg('<b>No actionable idea in this filter right now</b><p>All ' + N + ' names were read and none has an actionable LONG or SHORT with a plan. Turn off "Actionable only" to see each name\'s call, or pick other 9:15 zones.</p>');
}
function _tsStep(d) { _TS.forceNext = false; _tsGoTo(_TS.i + d, d); }
function _tsRebuild() { _TS.names = _tsBuildNames(); _TS.i = 0; jQ('#ts-chips').html(_tsChipsHtml()); _tsGoTo(0, 1); }
function _tsClose() { _TS.seq++; clearTimeout(_TS.timer); jQ('#gtb-ts-overlay').remove(); jQ(document).off('keydown.ts'); }
function _tsShow() {
    _tsClose(); _tsZoneSel();
    if (!jQ('#gtb-ts-style').length) jQ('head').append('<style id="gtb-ts-style">'
        + '#gtb-ts-overlay{position:fixed;inset:0;z-index:99500;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#e6edf3}'
        + '#gtb-ts-overlay .ts-phone{position:relative;width:min(400px,94vw);height:min(780px,96vh);background:#0d1117;border:1px solid #30363d;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;touch-action:pan-y}'
        + '#gtb-ts-overlay #ts-chips{display:flex;flex-wrap:wrap;gap:5px;padding:10px 40px 0 12px}'
        + '#gtb-ts-overlay .ts-zc,#gtb-ts-overlay .ts-only{background:#161b22;color:#8b949e;border:1px solid #30363d;padding:4px 9px;font-size:12px;font-weight:700;cursor:pointer;border-radius:12px}'
        + '#gtb-ts-overlay .ts-zc small{font-weight:400;margin-left:2px}#gtb-ts-overlay .ts-zc.on,#gtb-ts-overlay .ts-only.on{background:#1f3a5f;color:#e6edf3;border-color:#58a6ff}'
        + '#gtb-ts-overlay #ts-posw{height:3px;background:#21262d;margin:8px 12px 0}#gtb-ts-overlay #ts-pos{height:3px;background:#8b949e;width:0}'
        + '#gtb-ts-overlay #ts-barwrap{height:2px;margin:2px 12px 0}#gtb-ts-overlay #ts-bar{height:2px;background:#58a6ff;width:0}'
        + '#gtb-ts-overlay .ts-card{flex:1;overflow:auto;padding:8px 18px 12px;display:flex;flex-direction:column;gap:8px}'
        + '#gtb-ts-overlay .ts-top{display:flex;justify-content:space-between;align-items:baseline}#gtb-ts-overlay .ts-name{font-size:20px;font-weight:800;letter-spacing:.02em}#gtb-ts-overlay .ts-count{font-size:12px;color:#8b949e}'
        + '#gtb-ts-overlay .ts-z{font-style:normal;font-size:10px;font-weight:700;padding:1px 6px;margin-left:6px;vertical-align:middle;background:#21262d;color:#8b949e}'
        + '#gtb-ts-overlay .ts-z-AST,#gtb-ts-overlay .ts-z-ASO{color:#3fb950}#gtb-ts-overlay .ts-z-BSO,#gtb-ts-overlay .ts-z-BST{color:#f85149}'
        + '#gtb-ts-overlay .ts-dir{font-size:36px;font-weight:900;line-height:1}#gtb-ts-overlay .ts-sub{font-size:12px;color:#8b949e}#gtb-ts-overlay .ts-head{font-size:12px;color:#c9d1d9;line-height:1.35}'
        + '#gtb-ts-overlay canvas{width:100%;height:170px;background:#010409;border:1px solid #21262d;flex:0 0 auto}'
        + '#gtb-ts-overlay .ts-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}#gtb-ts-overlay .ts-grid div{background:#161b22;padding:7px 10px}#gtb-ts-overlay .ts-grid small{display:block;font-size:10px;color:#8b949e;letter-spacing:.05em}#gtb-ts-overlay .ts-grid b{font-size:18px}'
        + '#gtb-ts-overlay .ts-risk{font-size:12px;color:#8b949e}#gtb-ts-overlay .ts-why{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}#gtb-ts-overlay .ts-why li{display:flex;gap:8px;font-size:12px;line-height:1.35}'
        + '#gtb-ts-overlay .ts-why i{flex:0 0 8px;height:8px;margin-top:4px;border-radius:50%}#gtb-ts-overlay .ts-warn{font-size:12px;color:#d29922}#gtb-ts-overlay .ts-foot{margin-top:auto;font-size:10px;color:#6e7681}'
        + '#gtb-ts-overlay .ts-empty{margin:auto;text-align:center;font-size:13px;line-height:1.5;color:#8b949e}#gtb-ts-overlay .ts-empty b{color:#e6edf3;font-size:16px}'
        + '#gtb-ts-overlay .ts-nav{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-top:1px solid #21262d}'
        + '#gtb-ts-overlay button{font-family:inherit}#gtb-ts-overlay .ts-nav button{background:#21262d;color:#e6edf3;border:1px solid #30363d;padding:7px 14px;font-size:13px;cursor:pointer}#gtb-ts-overlay .ts-nav button:hover{background:#30363d}'
        + '#gtb-ts-overlay .ts-x{position:absolute;top:8px;right:10px;z-index:2;background:#21262d;color:#e6edf3;border:1px solid #30363d;padding:2px 9px;cursor:pointer}</style>');
    jQ('body').append('<div id="gtb-ts-overlay"><div class="ts-phone"><button class="ts-x" id="ts-x" title="Close (Esc)">x</button><div id="ts-chips"></div><div id="ts-posw"><div id="ts-pos"></div></div><div id="ts-barwrap"><div id="ts-bar"></div></div><div class="ts-card"></div>'
        + '<div class="ts-nav"><button id="ts-prev">&#9650; Prev</button><span><button id="ts-auto">Auto: ' + (_TS.auto ? 'on' : 'off') + '</button> <button id="ts-reload">Reload</button></span><button id="ts-next">Next &#9660;</button></div></div></div>');
    jQ('#ts-x').on('click', _tsClose);
    jQ('#gtb-ts-overlay').on('click', function (e) { if (e.target.id === 'gtb-ts-overlay') _tsClose(); })
        .on('click', '.ts-zc', function () { var z = this.getAttribute('data-z'), s = _tsZoneSel(); s[z] = s[z] ? 0 : 1; try { localStorage.setItem('GTB_TS_ZONES', JSON.stringify(s)); } catch (e) {} _tsRebuild(); })
        .on('click', '#ts-only', function () { _TS.only = !_TS.only; try { localStorage.setItem('GTB_TS_ONLY', _TS.only ? '1' : '0'); } catch (e) {} jQ('#ts-chips').html(_tsChipsHtml()); _tsGoTo(_TS.i, 1); });
    jQ('#ts-next').on('click', function () { _tsStep(1); }); jQ('#ts-prev').on('click', function () { _tsStep(-1); });
    jQ('#ts-reload').on('click', function () { _TS.forceNext = true; _tsGoTo(_TS.i, 1); });
    jQ('#ts-auto').on('click', function () { _TS.auto = !_TS.auto; jQ(this).text('Auto: ' + (_TS.auto ? 'on' : 'off')); if (_TS.auto) _tsStartTimer(); else _tsStopTimer(); });
    jQ('#gtb-ts-overlay .ts-phone').on('wheel', function (e) { e.preventDefault(); if (Date.now() - (_TS.wheelAt || 0) > 600) { _TS.wheelAt = Date.now(); _tsStep(e.originalEvent.deltaY > 0 ? 1 : -1); } })
        .on('pointerdown', function (e) { if (e.target.closest && e.target.closest('button')) return; _TS.drag = e.clientY; })
        .on('pointerup', function (e) { if (_TS.drag != null) { var dy = e.clientY - _TS.drag; _TS.drag = null; if (Math.abs(dy) > 70) _tsStep(dy < 0 ? 1 : -1); } });
    jQ(document).on('keydown.ts', function (e) {
        if (e.key === 'Escape') _tsClose(); else if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); _tsStep(1); } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); _tsStep(-1); }
    });
    _TS.cache = {}; _tsRebuild();
}
