// ── Live context: "is the morning view still valid?" (v29.437) ─────────────────────────────────────────────────────────
// The composite score is built mostly from things set at the open (the 9:15 candle, the day's OI/OBV build-up, the 9:15 strategy), so on a
// day that opens negative and then recovers it keeps saying "short". This module reads what price is doing NOW and sets it beside the morning
// view. It changes no score, signal, alert or order: it is a read-out, a price-confirmation gate on the Predict card's action, a note on the
// Range Scoreboard, a warning on the Focus Direction row, and a log so the idea can be checked against your own days.
// Everything here is a rule of thumb, not back-tested.
//   price vs the day average and how long, trend structure, distance from the day high / low, failed breakdown / breakout of BSO / ASO,
//   closes beyond ASO / BSO, OI-wall hold or break, futures over the last ~hour, OI/OBV over the last hour, breadth shift, GIFT NIFTY since
//   the open, and whether the heavyweights back the index move.
var _LX_HIST = [];            // today's snapshots, newest last: {m, t, px, f, oi, up, dn}
var _LX_HIST_DAY = '';
var _LX_HEAVY = { key: '', at: 0, oi: null };
var _LX_LOG_MIN_GAP_MS = 4 * 60000;
var _LX_TONE = { agree: 'var(--gtb-green)', against: 'var(--gtb-red)', neutral: 'var(--gtb-muted)', info: 'var(--gtb-muted)' };

function _lxJson(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
function _lxF(n) { return Math.round(n).toLocaleString('en-IN'); }
function _lxP(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }
function _lxSgn(n, dead) { return n > dead ? 1 : n < -dead ? -1 : 0; }
function _lxDay() { return moment().format('YYYY-MM-DD'); }
function _lxLogKey(day) { return 'GTB_LX_LOG_' + (day || _lxDay()); }

// today's spot candles for an instrument, as {t:'HH:mm', o,h,l,c}
function _lxCandles(name) {
    var sm = INSTRUMENT_SCORE_MAP[name] || {}, c = (sm.oiData && sm.oiData.spotCandles) || [];
    if (!c.length) return [];
    var day = moment(c[c.length - 1][0]).format('YYYY-MM-DD');
    var out = [];
    c.forEach(function (k) {
        var m = moment(k[0]);
        if (m.format('YYYY-MM-DD') !== day) return;
        var o = parseFloat(k[1]), h = parseFloat(k[2]), l = parseFloat(k[3]), cl = parseFloat(k[4]);
        if (isFinite(o) && isFinite(h) && isFinite(l) && isFinite(cl)) out.push({ t: m.format('HH:mm'), o: o, h: h, l: l, c: cl });
    });
    return out;
}
function _lxMinus(hhmm, mins) { var p = hhmm.split(':'), t = parseInt(p[0], 10) * 60 + parseInt(p[1], 10) - mins; if (t < 0) t = 0; return ('0' + Math.floor(t / 60)).slice(-2) + ':' + ('0' + (t % 60)).slice(-2); }
function _lxMin(hhmm) { var p = String(hhmm).split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }

// ── snapshots (memory + localStorage) ────────────────────────────────────────────────────────────────────────────────────
function _lxHistLoad() {
    var d = _lxDay();
    if (_LX_HIST_DAY === d) return _LX_HIST;
    _LX_HIST_DAY = d; _LX_HIST = [];
    var s = _lxJson(_lxLogKey(d));
    if (s && s.length) _LX_HIST = s;
    return _LX_HIST;
}
function _lxBreadth(ltp, glob) {
    var up = 0, dn = 0;
    try { (typeof NIFTY_50_LIST !== 'undefined' ? NIFTY_50_LIST : []).forEach(function (n) {
        var p = parseFloat((ltp[n] || {}).ltp), v = parseFloat((glob[n] || {}).prevPrice);
        if (!p || !v) return; if (p > v) up++; else if (p < v) dn++;
    }); } catch (e) {}
    return { up: up, dn: dn };
}
function _lxFut(name) { try { var f = (typeof LIVE_FUT !== 'undefined') ? LIVE_FUT[name] : null; return f && f.ltp ? f : null; } catch (e) { return null; } }

// ── the checks ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// Each check: {key, label, sig (+1 bullish / -1 bearish / 0 none), w (weight in the live view), text, price (counts toward the price gate)}
function _lxChecks(name, ctx) {
    var out = [], cs = ctx.candles, px = ctx.px, n = cs.length;
    var add = function (key, label, sig, w, text, price) { out.push({ key: key, label: label, sig: sig, w: w, text: text, price: !!price }); };

    // 1. price vs the day average (and for how long)
    if (n >= 3) {
        var cum = 0, avgs = [];
        cs.forEach(function (k, i) { cum += (k.h + k.l + k.c) / 3; avgs.push(cum / (i + 1)); });
        var avg = avgs[n - 1], side = cs[n - 1].c >= avg ? 1 : -1, run = 0;
        for (var i = n - 1; i >= 0; i--) { if ((cs[i].c >= avgs[i] ? 1 : -1) === side) run++; else break; }
        var mins = run * 5, gap = (px - avg) / avg * 100;
        ctx.avg = avg;
        add('avg', 'Price vs day average', Math.abs(gap) < 0.03 ? 0 : side, mins >= 30 ? 2 : 1,
            'price ' + _lxF(px) + ' is ' + (side > 0 ? 'above' : 'below') + ' the day average ' + _lxF(avg) + ' (' + _lxP(gap) + ') for ' + mins + ' min', true);
    }
    // 1b. futures vs VWAP, when the live feed has it
    var ff = ctx.fut;
    if (ff && ff.vwap) {
        var vg = (ff.ltp - ff.vwap) / ff.vwap * 100;
        add('vwap', 'Futures vs VWAP', Math.abs(vg) < 0.03 ? 0 : (vg > 0 ? 1 : -1), 1, 'futures ' + _lxF(ff.ltp) + ' vs VWAP ' + _lxF(ff.vwap) + ' (' + _lxP(vg) + ')', true);
    }
    // 2. price vs the day open
    if (ctx.open) {
        var og = (px - ctx.open) / ctx.open * 100;
        add('open', 'Price vs day open', Math.abs(og) < 0.15 ? 0 : (og > 0 ? 1 : -1), 1, 'price ' + _lxF(px) + ' vs open ' + _lxF(ctx.open) + ' (' + _lxP(og) + ')', true);
    }
    // 3. structure: last 6 candles against the 6 before
    if (n >= 8) {
        var k2 = n >= 12 ? 6 : Math.floor(n / 2), A = cs.slice(n - k2), B = cs.slice(n - 2 * k2, n - k2);
        var hA = Math.max.apply(null, A.map(function (x) { return x.h; })), hB = Math.max.apply(null, B.map(function (x) { return x.h; }));
        var lA = Math.min.apply(null, A.map(function (x) { return x.l; })), lB = Math.min.apply(null, B.map(function (x) { return x.l; }));
        var st = (hA > hB && lA > lB) ? 1 : (hA < hB && lA < lB) ? -1 : 0;
        add('struct', 'Trend structure', st, 2, st > 0 ? 'higher highs and higher lows over the last ' + k2 * 5 + ' min' : st < 0 ? 'lower highs and lower lows over the last ' + k2 * 5 + ' min' : 'mixed: no clean higher-high / lower-low pattern over the last ' + k2 * 5 + ' min', true);
    }
    // 4. distance from the day high / low
    if (n >= 3) {
        var dH = Math.max.apply(null, cs.map(function (x) { return x.h; })), dL = Math.min.apply(null, cs.map(function (x) { return x.l; }));
        ctx.dayH = dH; ctx.dayL = dL;
        if (dH > dL) {
            var pos = (px - dL) / (dH - dL), offL = (px - dL) / dL * 100, offH = (dH - px) / dH * 100;
            var ps = pos >= 0.65 ? 1 : pos <= 0.35 ? -1 : 0;
            add('range', 'Place in the day range', ps, 1, 'price is ' + _lxP(offL).replace('+', '') + ' above the day low ' + _lxF(dL) + ' and ' + offH.toFixed(2) + '% below the day high ' + _lxF(dH) + ' (' + Math.round(pos * 100) + '% of the range)', false);
        }
    }
    // 5. failed breakdown / breakout and closes beyond ASO / BSO (levels from the 9:15 strike plan)
    var lv = ctx.levels;
    if (lv && n >= 3) {
        var last = cs[n - 1], dL2 = ctx.dayL, dH2 = ctx.dayH, fm = null;
        [['BSO', lv.bso], ['BST', lv.bst]].forEach(function (p) {
            if (fm || !p[1]) return;
            if (dL2 < p[1] && last.c > p[1] && px > p[1]) { var ct = cs.filter(function (x) { return x.l < p[1]; })[0]; fm = { sig: 1, text: 'failed breakdown: went below ' + p[0] + ' ' + _lxF(p[1]) + ' (low ' + _lxF(dL2) + (ct ? ' at ' + ct.t : '') + ') and is back above it' }; }
        });
        [['ASO', lv.aso], ['AST', lv.ast]].forEach(function (p) {
            if (fm || !p[1]) return;
            if (dH2 > p[1] && last.c < p[1] && px < p[1]) { var ct = cs.filter(function (x) { return x.h > p[1]; })[0]; fm = { sig: -1, text: 'failed breakout: went above ' + p[0] + ' ' + _lxF(p[1]) + ' (high ' + _lxF(dH2) + (ct ? ' at ' + ct.t : '') + ') and is back below it' }; }
        });
        add('failed', 'Failed breakdown / breakout', fm ? fm.sig : 0, 2, fm ? fm.text : 'no level was broken and reclaimed today', true);
        var upRun = 0, dnRun = 0, i2;
        for (i2 = n - 1; i2 >= 0 && lv.aso && cs[i2].c > lv.aso; i2--) upRun++;
        for (i2 = n - 1; i2 >= 0 && lv.bso && cs[i2].c < lv.bso; i2--) dnRun++;
        var hs = upRun >= 2 ? 1 : dnRun >= 2 ? -1 : 0;
        add('hold', 'Closes beyond ASO / BSO', hs, 2, hs > 0 ? 'the last ' + upRun + ' candles closed above ASO ' + _lxF(lv.aso) + ' (the sell level has been reclaimed)' : hs < 0 ? 'the last ' + dnRun + ' candles closed below BSO ' + _lxF(lv.bso) + ' (the buy level has been lost)' : 'price is between BSO ' + _lxF(lv.bso || 0) + ' and ASO ' + _lxF(lv.aso || 0) + ' or has only just touched them', true);
    }
    // 6. OI walls: held or broken
    if (ctx.walls && n >= 3) {
        var lastC = cs[n - 1].c;
        var wall = function (w, isRes) {
            if (!w) return;
            var R = w.strike, touched = isRes ? ctx.dayH >= R * 0.9985 : ctx.dayL <= R * 1.0015;
            var broken = isRes ? lastC > R * 1.0005 : lastC < R * 0.9995;
            var held = touched && !broken && (isRes ? px < R * 0.9985 : px > R * 1.0015);
            var sg = isRes ? (held ? -1 : broken ? 1 : 0) : (held ? 1 : broken ? -1 : 0);
            add(isRes ? 'rwall' : 'swall', (isRes ? 'Call wall ' : 'Put wall ') + _lxF(R), sg, 1,
                (isRes ? 'resistance' : 'support') + ' ' + _lxF(R) + ': ' + (broken ? 'broken, price closed ' + (isRes ? 'above' : 'below') + ' it' : held ? 'touched and held, price turned back' : touched ? 'being tested now' : 'not tested today'), false);
        };
        wall(ctx.walls.resistance && ctx.walls.resistance[0], true);
        wall(ctx.walls.support && ctx.walls.support[0], false);
    }
    // 7. futures over the last ~hour (needs the live feed: price and open interest)
    var hist = ctx.hist, nowSnap = ctx.nowSnap, past = null;
    if (nowSnap && nowSnap.f) {
        for (var h = hist.length - 1; h >= 0; h--) { var dt = (nowSnap.t - hist[h].t) / 60000; if (dt >= 30 && hist[h].f) { past = hist[h]; if (dt >= 60) break; } }
    }
    if (past && nowSnap.f && past.oi && nowSnap.oi) {
        var fp = (nowSnap.f - past.f) / past.f * 100, fo = (nowSnap.oi - past.oi) / past.oi * 100, mins2 = Math.round((nowSnap.t - past.t) / 60000);
        var fs = Math.abs(fp) < 0.1 ? 0 : (fp > 0 ? 1 : -1);
        var kind = fs === 0 ? 'flat' : fp > 0 ? (fo < -0.3 ? 'short covering' : 'fresh longs') : (fo > 0.3 ? 'fresh shorts' : 'long unwinding');
        add('futwin', 'Futures, last ' + mins2 + ' min', fs, 2, 'futures ' + _lxP(fp) + ', open interest ' + _lxP(fo) + ': ' + kind, false);
    } else {
        add('futwin', 'Futures, last hour', 0, 2, ff ? 'collecting: needs about 30 minutes of snapshots' : 'not available: needs the live price feed', false);
    }
    // 8. OI/OBV over the last hour
    if (ctx.oi && ctx.oi.delta != null) {
        var d = ctx.oi.delta, os = d >= 2 ? 1 : d <= -2 ? -1 : 0;
        add('oiwin', 'OI/OBV, last hour', os, 1, 'the OI/OBV score moved from ' + ctx.oi.then.toFixed(1) + ' (' + ctx.oi.thenT + ') to ' + ctx.oi.now.toFixed(1) + ' (' + ctx.oi.nowT + '), ' + (d >= 0 ? '+' : '') + d.toFixed(1) + '; the day total is ' + ctx.oi.now.toFixed(1), false);
    }
    // 9. breadth shift
    if (ctx.breadth && (ctx.breadth.up + ctx.breadth.dn) >= 20) {
        var b = ctx.breadth, net = (b.up - b.dn) / (b.up + b.dn), pastB = null;
        for (var h2 = hist.length - 1; h2 >= 0; h2--) { var d2 = (nowSnap.t - hist[h2].t) / 60000; if (d2 >= 30 && hist[h2].up != null && (hist[h2].up + hist[h2].dn) >= 20) { pastB = hist[h2]; if (d2 >= 60) break; } }
        var pn = pastB ? (pastB.up - pastB.dn) / (pastB.up + pastB.dn) : null;
        var bs = Math.abs(net) >= 0.3 ? (net > 0 ? 1 : -1) : (pn != null ? _lxSgn(net - pn, 0.2) : 0);
        add('breadth', 'Breadth (NIFTY 50 stocks)', bs, 1, b.up + ' up / ' + b.dn + ' down now' + (pastB ? ', was ' + pastB.up + ' / ' + pastB.dn + ' at ' + pastB.m : ''), false);
    }
    // 10. GIFT NIFTY since its open
    if (ctx.gift != null) add('gift', 'GIFT NIFTY since its open', Math.abs(ctx.gift) < 0.3 ? 0 : (ctx.gift > 0 ? 1 : -1), 1, 'GIFT NIFTY ' + _lxP(ctx.gift) + ' since its open, ' + name + ' ' + _lxP(ctx.idxChg) + ' since its open', false);
    // 11. do the heavyweights back the index move? (information only: weight 0)
    if (ctx.heavy != null) {
        var hv = ctx.heavy, ic = ctx.idxChgPrev, backs = Math.abs(ic) < 0.05 || Math.abs(hv) < 0.03 || (hv > 0) === (ic > 0);
        add('heavy', 'Heavyweights vs index', 0, 0, 'top-10 net contribution ' + (hv >= 0 ? '+' : '') + hv.toFixed(2) + ' pts vs the index ' + _lxP(ic) + (backs ? ': they back the move' : ': the move is coming from outside the top-10'), false);
    }
    return out;
}

function _lxViewDir(name, forced) {
    if (forced != null) return { dir: forced, src: 'the verdict direction' };
    var sc = (typeof window._GTB_LAST_SCORE === 'number') ? window._GTB_LAST_SCORE : null;
    if (sc != null && Math.abs(sc) >= 1.5) return { dir: sc > 0 ? 1 : -1, src: 'the composite score ' + (sc > 0 ? '+' : '') + sc.toFixed(2) };
    try {
        var b = _lxJson('VALID_BREAKOUT_NINE_FIFTEEN') || {};
        var z = function (n) { return _gtbNorm915((b[n] && b[n].CLOSE_9_15) || 'B/W'); };
        var st = GTB_STRAT_LOOKUP[z('NIFTY 50') + '-' + z('SENSEX') + '-' + z('NIFTY BANK')];
        if (st && st.outcome === 'Sell') return { dir: -1, src: 'the 9:15 strategy (Sell)' };
        if (st && st.outcome === 'Buy') return { dir: 1, src: 'the 9:15 strategy (Buy)' };
    } catch (e) {}
    return { dir: 0, src: 'no morning view (score near zero)' };
}

// The whole read for one instrument. forcedDir: the direction to judge against (Focus passes the verdict direction); null = composite score.
function _lxCompute(name, forcedDir) {
    name = name || 'NIFTY 50';
    try {
        var cs = _lxCandles(name);
        if (cs.length < 3) return null;
        var ltp = _lxJson('INSTRUMENT_LTP_PRICE') || {}, glob = _lxJson('INSTRUMENT_LIST_GLOBAL') || {};
        var px = parseFloat((ltp[name] || {}).ltp) || cs[cs.length - 1].c;
        var open = parseFloat((glob[name] || {}).price) || cs[0].o, prev = parseFloat((glob[name] || {}).prevPrice) || 0;
        var ctx = { candles: cs, px: px, open: open, fut: _lxFut(name), hist: _lxHistLoad(), nowSnap: null, levels: null, walls: null, oi: null, breadth: null, gift: null, idxChg: open ? (px - open) / open * 100 : 0, idxChgPrev: prev ? (px - prev) / prev * 100 : 0, heavy: null };
        ctx.nowSnap = { t: Date.now(), f: ctx.fut ? ctx.fut.ltp : 0, oi: ctx.fut ? ctx.fut.oi : 0 };
        try { var sd = generateTrend(name).strikeData; if (sd) ctx.levels = { aso: parseFloat(sd.ustrikeOne), ast: parseFloat(sd.ustrikeTwo), bso: parseFloat(sd.bstrikeOne), bst: parseFloat(sd.bstrikeTwo) }; } catch (e) {}
        var sm = INSTRUMENT_SCORE_MAP[name] || {};
        try {
            if (sm.oiData && sm.oiData.tableData) {
                var spot = 0; sm.oiData.tableData.forEach(function (it) { if (it['ATM_STRIKE']) spot = parseFloat(it['STRIKE']) || 0; });
                ctx.walls = _gtbFindWalls(sm.oiData.tableData, 0, spot);
            }
        } catch (e) {}
        // OI/OBV last hour: cached per last candle, it re-reads every strike's series
        try {
            var lastT = cs[cs.length - 1].t, key = name + '|' + lastT;
            if (name === 'NIFTY 50' && typeof _oiScoreAllAtTime === 'function' && _lxMin(lastT) - _lxMin(cs[0].t) >= 60) {
                if (_LX_HEAVY.key !== key) {
                    var thenT = _lxMinus(lastT, 60);
                    _LX_HEAVY = { key: key, at: Date.now(), oi: { now: _oiScoreAllAtTime(lastT), then: _oiScoreAllAtTime(thenT), nowT: lastT, thenT: thenT } };
                    _LX_HEAVY.oi.delta = _LX_HEAVY.oi.now - _LX_HEAVY.oi.then;
                }
                ctx.oi = _LX_HEAVY.oi;
            }
        } catch (e) {}
        ctx.breadth = _lxBreadth(ltp, glob);
        try { var g = ltp['GIFT NIFTY'], go = parseFloat((glob['GIFT NIFTY'] || {}).price), gl = parseFloat((g || {}).ltp); if (gl && go) ctx.gift = (gl - go) / go * 100; } catch (e) {}
        try {
            var W = (name === 'NIFTY BANK') ? NIFTY_BANK_WEIGHTED_STOCKS : NIFTY_50_WEIGHTED_STOCKS, net = 0, cnt = 0;
            Object.keys(W).forEach(function (n2) { var p = parseFloat((ltp[n2] || {}).ltp), pv = parseFloat((glob[n2] || {}).prevPrice); if (p && pv) { net += (parseFloat(W[n2]) || 0) * ((p - pv) / pv * 100) / 100; cnt++; } });
            if (cnt >= 5 && (name === 'NIFTY 50' || name === 'NIFTY BANK')) ctx.heavy = net;
        } catch (e) {}

        var checks = _lxChecks(name, ctx);
        var view = _lxViewDir(name, forcedDir);
        var agree = 0, against = 0, live = 0;
        checks.forEach(function (c) {
            c.state = view.dir === 0 ? 'info' : c.sig === 0 ? 'neutral' : (c.sig === view.dir ? 'agree' : 'against');
            if (c.state === 'agree') agree++; else if (c.state === 'against') against++;
            live += c.sig * c.w;
        });
        live = Math.max(-10, Math.min(10, Math.round(live)));
        var status = view.dir === 0 ? 'NO VIEW' : (against >= 3 && against > agree) ? 'STALE' : (against >= 2 && against >= agree) ? 'WEAKENING' : 'VALID';
        return { name: name, px: px, view: view, checks: checks, agree: agree, against: against, live: live, status: status, snap: { px: px, f: ctx.nowSnap.f, oi: ctx.nowSnap.oi, up: ctx.breadth.up, dn: ctx.breadth.dn }, hhmm: cs[cs.length - 1].t };
    } catch (e) { try { console.log('[live-context]', e); } catch (e2) {} return null; }
}

// Price-confirmation gate for a call in direction dir (+1 buy / -1 sell). Only the price checks count: day average, VWAP, open, structure,
// failed breakdown/breakout, closes beyond ASO/BSO. Not confirmed when two of them are against it, or the plan level has been reclaimed.
function _lxGateFor(name, dir) {
    var r = _lxCompute(name, dir);
    if (!r) return null;
    var pc = r.checks.filter(function (c) { return c.price; });
    var against = pc.filter(function (c) { return c.sig === -dir; }), agree = pc.filter(function (c) { return c.sig === dir; });
    var hold = against.filter(function (c) { return c.key === 'hold' || c.key === 'failed'; }).length > 0;
    var ok = !(against.length >= 2 || hold) && agree.length >= 1;
    return { ok: ok, against: against, agree: agree, res: r, hhmm: r.hhmm };
}
function _lxGateHtml(g, was) {
    if (!g || g.ok) return '';
    var lines = g.against.map(function (c) { return '<div>' + c.text + '</div>'; }).join('');
    return '<div style="margin-top:6px;padding:5px 8px;background:var(--gtb-surface2);border-left:3px solid var(--gtb-amber);font-size:0.52rem;line-height:1.4;color:var(--gtb-text);">'
        + '<b style="color:var(--gtb-amber);">Price is not confirming ' + was + '.</b> The score and the 9:15 plan lean one way, but price is doing something else:' + lines
        + '<div style="color:var(--gtb-muted);margin-top:2px;">The call comes back when price agrees again. This is a price check on top of the model, not a change to it.</div></div>';
}

// ── log: one snapshot per ~4 minutes while live (memory for the windows above, localStorage for the review) ──────────────────────
function _lxLogSnapshot() {
    try {
        if (typeof _gtbHistTime === 'function' && _gtbHistTime()) return;
        var cur = String(typeof CURRENT_DAY !== 'undefined' ? CURRENT_DAY : '').slice(0, 10);
        if (cur !== _lxDay()) return;
        var mn = moment().hours() * 60 + moment().minutes();
        if (mn < 9 * 60 + 15 || mn > 15 * 60 + 35) return;
        var hist = _lxHistLoad(), last = hist[hist.length - 1];
        if (last && Date.now() - last.t < _LX_LOG_MIN_GAP_MS) return;
        var r = _lxCompute('NIFTY 50');
        if (!r) return;
        var sc = (typeof window._GTB_LAST_SCORE === 'number') ? window._GTB_LAST_SCORE : null;
        hist.push({ m: moment().format('HH:mm'), t: Date.now(), px: r.px, f: r.snap.f || 0, oi: r.snap.oi || 0, up: r.snap.up, dn: r.snap.dn, s: sc, v: r.view.dir, st: r.status.charAt(0), lv: r.live });
        if (hist.length > 140) hist.splice(0, hist.length - 140);
        if (typeof _gtbLsSet === 'function') _gtbLsSet(_lxLogKey(), JSON.stringify(hist)); else localStorage.setItem(_lxLogKey(), JSON.stringify(hist));
        _lxLogPrune();
    } catch (e) {}
}
function _lxLogPrune() {
    try {
        var cut = moment().subtract(25, 'days').format('YYYY-MM-DD');
        for (var i = localStorage.length - 1; i >= 0; i--) { var k = localStorage.key(i); if (k && k.indexOf('GTB_LX_LOG_') === 0 && k.slice(11) < cut) localStorage.removeItem(k); }
    } catch (e) {}
}

// ── the card ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
function _lxCardHtml(name, forcedDir) {
    name = name || 'NIFTY 50';
    var r = _lxCompute(name, forcedDir);
    var M = 'var(--gtb-muted)';
    if (!r) return '<div style="padding:10px 12px;font-size:0.6rem;color:' + M + ';">Waiting for today\'s candles for ' + name + ': run a refresh.</div>';
    var col = r.status === 'STALE' ? 'var(--gtb-red)' : r.status === 'WEAKENING' ? 'var(--gtb-amber)' : r.status === 'VALID' ? 'var(--gtb-green)' : M;
    var vw = r.view.dir > 0 ? 'LONG' : r.view.dir < 0 ? 'SHORT' : 'none';
    var lw = r.live >= 3 ? 'price is recovering / bullish' : r.live <= -3 ? 'price is falling / bearish' : 'price is neutral';
    var lcol = r.live >= 3 ? 'var(--gtb-green)' : r.live <= -3 ? 'var(--gtb-red)' : M;
    var meaning = r.status === 'STALE' ? 'Price has moved against the morning view on ' + r.against + ' checks. Treat the score as old, and let price lead.'
        : r.status === 'WEAKENING' ? 'Some checks have turned against the morning view. Do not add to it; wait for price to agree.'
        : r.status === 'VALID' ? 'Price and the recent flow still support the morning view.' : 'The score is near zero, so there is no morning view to check.';
    var h = '<div style="padding:8px 12px;font-size:0.6rem;">'
        + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px;">'
        + '<span style="font-size:0.9rem;font-weight:900;color:' + col + ';border:1px solid ' + col + ';padding:1px 10px;">' + r.status + '</span>'
        + '<span style="color:' + M + ';">Morning view: <b style="color:var(--gtb-text);">' + vw + '</b> <span style="font-size:0.5rem;">(' + r.view.src + ')</span></span>'
        + '<span style="color:' + M + ';" title="A price-only read from the checks below, from -10 to +10. It is shown next to the morning score, it does not replace it.">Live view: <b style="color:' + lcol + ';">' + (r.live > 0 ? '+' : '') + r.live + '</b> <span style="font-size:0.5rem;">(' + lw + ')</span></span>'
        + '<span style="color:' + M + ';font-size:0.5rem;">' + r.agree + ' agree · ' + r.against + ' against · as of ' + r.hhmm + '</span>'
        + '<button class="gtb-btn lx-review-btn" style="margin-left:auto;font-size:0.5rem;padding:1px 8px;" title="How the log of these reads compares with what NIFTY did next">Does it work? (log)</button>'
        + '</div>'
        + '<div style="font-size:0.55rem;color:var(--gtb-text);margin-bottom:6px;">' + meaning + '</div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:0.55rem;"><tbody>'
        + r.checks.map(function (c) {
            var ic = c.state === 'agree' ? '✔' : c.state === 'against' ? '✖' : c.sig === 0 ? '–' : (c.sig > 0 ? '▲' : '▼');
            var tone = _LX_TONE[c.state] || M, dirTxt = c.sig > 0 ? 'bullish' : c.sig < 0 ? 'bearish' : '';
            return '<tr style="border-top:1px solid var(--gtb-border);"><td style="padding:2px 6px;width:16px;color:' + tone + ';font-weight:900;">' + ic + '</td>'
                + '<td style="padding:2px 6px;white-space:nowrap;font-weight:700;">' + c.label + '</td>'
                + '<td style="padding:2px 6px;color:' + (c.sig === 0 ? M : 'var(--gtb-text)') + ';">' + c.text + '</td>'
                + '<td style="padding:2px 6px;text-align:right;color:' + (c.sig > 0 ? 'var(--gtb-green)' : c.sig < 0 ? 'var(--gtb-red)' : M) + ';font-size:0.48rem;">' + dirTxt + '</td></tr>';
        }).join('')
        + '</tbody></table>'
        + '<div style="font-size:0.46rem;color:' + M + ';margin-top:5px;">✔ supports the morning view · ✖ against it · – no signal. Rule of thumb, not back-tested. It changes no score or alert; the Predict card\'s BUY / SELL waits when price is not confirming it.</div>'
        + '</div>';
    return h;
}
function _lxRenderCard() { try { if (jQ('#gtb-dash-lx').length && jQ('#gtb-pane-dashboard').is(':visible')) jQ('#gtb-dash-lx').html(_lxCardHtml('NIFTY 50')); } catch (e) {} }

// a short note for the Range Scoreboard: how old each part of the score is, and the stale warning
function _lxScoreboardNote(verdict) {
    try {
        var r = _lxCompute('NIFTY 50'), la = window._GTB_LAST_REFRESH_AT ? moment(window._GTB_LAST_REFRESH_AT).format('HH:mm') : '--:--';
        var s = '<div style="font-size:0.46rem;color:var(--gtb-muted);margin-top:4px;line-height:1.35;" title="Which parts of this score are fixed, slow or live">'
            + 'Age of each part: <b>9:15</b> set at 9:20, fixed all day · <b>A/D, futures, comp wt</b> last refresh ' + la + ' · <b>OI/OBV</b> whole-day build-up · <b>price checks</b> live (Dashboard: Live context)</div>';
        if (r && r.status !== 'VALID' && r.status !== 'NO VIEW' && verdict !== 'WAIT') {
            var c = r.status === 'STALE' ? 'var(--gtb-red)' : 'var(--gtb-amber)';
            s += '<div style="font-size:0.5rem;color:' + c + ';margin-top:3px;line-height:1.35;"><i class="bi bi-exclamation-triangle-fill"></i> morning view ' + r.status + ': price is ' + (r.live > 0 ? 'up' : r.live < 0 ? 'down' : 'flat') + ' (live view ' + (r.live > 0 ? '+' : '') + r.live + '), ' + r.against + ' checks against</div>';
        }
        return s;
    } catch (e) { return ''; }
}

// ── review: do these reads relate to what NIFTY did next? ────────────────────────────────────────────────────────────────
function _lxReviewData() {
    var days = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('GTB_LX_LOG_') === 0) days.push(k.slice(11)); }
    days.sort();
    var rows = [];
    days.forEach(function (d) {
        var s = d === _lxDay() ? _lxHistLoad() : _lxJson(_lxLogKey(d));
        if (!s || s.length < 3) return;
        for (var a = 0; a < s.length; a++) {
            var from = s[a]; if (!from.v || !from.px) continue;
            var to = null;
            for (var b = a + 1; b < s.length; b++) { var dt = (s[b].t - from.t) / 60000; if (dt >= 45) { to = s[b]; if (dt >= 60) break; } }
            if (!to || (to.t - from.t) / 60000 > 90) continue;
            var fwd = (to.px - from.px) / from.px * 100;
            rows.push({ day: d, m: from.m, v: from.v, st: from.st, lv: from.lv, s: from.s, fwd: fwd, signed: fwd * from.v });
        }
    });
    return rows;
}
function _lxReviewHtml() {
    var rows = _lxReviewData(), M = 'var(--gtb-muted)';
    var grp = function (label, fn) {
        var g = rows.filter(fn), n = g.length;
        if (!n) return '<tr><td style="padding:3px 8px;">' + label + '</td><td colspan="3" style="padding:3px 8px;color:' + M + ';">no cases yet</td></tr>';
        var avg = g.reduce(function (s, r) { return s + r.signed; }, 0) / n, hit = g.filter(function (r) { return r.signed > 0; }).length / n * 100;
        return '<tr style="border-top:1px solid var(--gtb-border);"><td style="padding:3px 8px;font-weight:700;">' + label + '</td><td style="padding:3px 8px;text-align:right;">' + n + '</td>'
            + '<td style="padding:3px 8px;text-align:right;color:' + (avg > 0 ? 'var(--gtb-green)' : 'var(--gtb-red)') + ';">' + (avg > 0 ? '+' : '') + avg.toFixed(2) + '%</td>'
            + '<td style="padding:3px 8px;text-align:right;">' + hit.toFixed(0) + '%</td></tr>';
    };
    var days = {}; rows.forEach(function (r) { days[r.day] = 1; });
    var h = '<div style="padding:10px 14px;font-size:0.62rem;color:var(--gtb-text);">'
        + '<div style="margin-bottom:8px;color:' + M + ';">Each read is compared with what NIFTY did over the next ~hour, in the direction of the morning view (up when the view was LONG, down when SHORT). A positive average means the market followed the view. Cases: <b>' + rows.length + '</b> from <b>' + Object.keys(days).length + '</b> logged day(s).</div>'
        + '<table style="width:100%;border-collapse:collapse;"><thead><tr style="color:' + M + ';font-size:0.5rem;text-align:right;"><th style="padding:3px 8px;text-align:left;">Morning view was</th><th style="padding:3px 8px;">Cases</th><th style="padding:3px 8px;">Avg move with the view</th><th style="padding:3px 8px;">Followed</th></tr></thead><tbody>'
        + grp('Any (all logged reads)', function () { return true; })
        + grp('VALID', function (r) { return r.st === 'V'; })
        + grp('WEAKENING', function (r) { return r.st === 'W'; })
        + grp('STALE', function (r) { return r.st === 'S'; })
        + grp('Live view opposed it', function (r) { return r.lv != null && r.lv * r.v <= -3; })
        + grp('Live view agreed with it', function (r) { return r.lv != null && r.lv * r.v >= 3; })
        + '</tbody></table>'
        + '<div style="margin-top:8px;font-size:0.52rem;color:' + M + ';line-height:1.45;">Reads are logged about every 4 minutes during the live session, so neighbouring cases overlap and are not independent: a few days prove nothing. Read the gap between VALID and STALE, not the single numbers. If STALE shows the market following the view as often as VALID does, the stale flag is not adding anything. Descriptive only, not a forecast.</div>'
        + '</div>';
    return h;
}
function _lxShowReview() {
    try {
        showPopUpWindow('lx-review', _lxReviewHtml(), 'LIVE CONTEXT LOG', 620, 360);
        var cls = 'popup-custom-style-lx-review';
        var t = '<div style="display:flex;align-items:center;gap:6px;width:100%;"><span style="font-weight:800;font-size:0.7rem;">LIVE CONTEXT LOG</span>' + popupWinControls(cls) + '</div>';
        jQ('.' + cls).find('.popupwindow_titlebar_text').html(t);
        hideNativePopupButtons(cls);
        jQ('.' + cls).toggleClass('gtb-light', localStorage.getItem('GTB_THEME') === 'light');
    } catch (e) { try { console.log('[live-context review]', e); } catch (e2) {} }
}
jQ(document).on('click', '.lx-review-btn', function (e) { e.stopPropagation(); _lxShowReview(); });

// info text for the (i) icon
try { if (typeof GTB_INFO !== 'undefined') GTB_INFO['lx-card'] = { icon: 'bi-activity', title: 'Live context: is the morning view still valid?',
    body: 'The score is built mostly from things set at the open (the 9:15 candle, the 9:15 strategy, the day\'s option build-up), so a day that opens negative and then recovers can keep saying "short". This card reads what price is doing now and sets it beside the morning view: price against the day average and for how long, trend structure, place in the day range, a failed breakdown or breakout of BSO / ASO, closes beyond ASO / BSO, whether the OI walls held or broke, futures and OI/OBV over the last hour, breadth shift, GIFT NIFTY since its open, and whether the heavyweights back the move. VALID / WEAKENING / STALE counts how many checks have turned against the morning view. The Live view number is a price-only read (-10 to +10) shown beside the morning score; it replaces nothing. The Predict card\'s BUY / SELL waits ("price not confirming") when price disagrees with it. All cut-offs are rules of thumb and are not back-tested: the log button shows how the reads compared with what NIFTY did next on your own days.' }; } catch (e) {}
