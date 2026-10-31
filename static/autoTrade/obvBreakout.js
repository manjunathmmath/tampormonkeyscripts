// ── OBV + Elder Force + volume-profile breakout: backtest popup (v29.448) ───────────────────────────────────────────────────────────
// Tests one chart idea on daily candles (stocks of a chosen NSE index list), point in time, no hindsight:
//   a stock closes ABOVE a high-volume node of its own volume profile (the "mountain peaks" that act as support / resistance),
//   while On Balance Volume is making a higher high and Elder Force Index (13) is positive and rising.
// Four groups are reported side by side so the filters can be judged: A = all three, B = the breakout alone, C = breakout + OBV,
// D = breakout + Force. Each trade is entered at the NEXT session's open, with the stop one ATR below the broken level, and is
// followed bar by bar under several exit rules. Descriptive only: today's index members (survivorship bias), no costs or slippage, and
// the rules are one reading of the chart, not the original author's exact rules. Not a forecast and not advice.
var _OB = { running: false, stop: false, last: null, exitKey: 'T2' };
var _OB_CANDLES = {};          // symbol -> daily candles, kept for the session so a re-run with other settings does not refetch
var _OB_NIFTY = null;          // {dates, closes, sma200}
var _OB_DAYS = 1900;
var _OB_EXITS = [
    { k: 'T1.5', label: 'Target 1.5R, stop 1 ATR below the level, max 60 sessions', rr: 1.5, hold: 60 },
    { k: 'T2',   label: 'Target 2R, stop 1 ATR below the level, max 60 sessions',   rr: 2,   hold: 60 },
    { k: 'T3',   label: 'Target 3R, stop 1 ATR below the level, max 60 sessions',   rr: 3,   hold: 60 },
    { k: 'H10',  label: 'Hold 10 sessions (stop honoured)',                          rr: 0,   hold: 10 },
    { k: 'H20',  label: 'Hold 20 sessions (stop honoured)',                          rr: 0,   hold: 20 },
    { k: 'H40',  label: 'Hold 40 sessions (stop honoured)',                          rr: 0,   hold: 40 },
    { k: 'TR3',  label: 'Trailing stop 3 ATR under the highest close, max 120 sessions', rr: 0, hold: 120, trail: 3 },
    { k: 'TR2',  label: 'Trailing stop 2 ATR under the highest close, max 120 sessions', rr: 0, hold: 120, trail: 2 },
    { k: 'T2s5', label: 'Target 2R, leave at session 5 if not above the entry',     rr: 2,   hold: 60, tstop: 5 },
    { k: 'T2s7', label: 'Target 2R, leave at session 7 if not above the entry',     rr: 2,   hold: 60, tstop: 7 }
];
// Modifiers compared against the full idea (group A). filt = per-trade condition using features recorded at the signal; run = which analysis
// pass supplies the trades (changes that alter the levels or the stop need their own pass); retest = enter on the pullback instead of the next open.
var _OB_BASE_RUN = {};
var _OB_RUNS = { base: {}, atr15: { atrMult: 1.5 }, atr2: { atrMult: 2 }, hvn50: { hvnPct: 50 }, hvn70: { hvnPct: 70 }, obv120: { obvWin: 120 } };
var _OB_VARIANTS = [
    { k: 'base',    run: 'base',   label: 'Baseline: the full idea (group A)', tip: 'Breakout + OBV higher high + Force rising, entry next open' },
    { k: 'vol',     run: 'base',   label: '1  Breakout-day volume at least 1.5x the 20-day average', filt: function (t) { return t.vr != null && t.vr >= 1.5; } },
    { k: 'rs',      run: 'base',   label: '1  Top 20% by 12-month strength and above own 200-day average', filt: function (t) { return t.a200 && t.rsRank != null && t.rsRank >= 0.8; } },
    { k: 'ext',     run: 'base',   label: '1  Not extended: within 20% of the 50-day average and gap under 3%', filt: function (t) { return t.ext != null && t.ext <= 20 && t.gap <= 3; } },
    { k: 'retest',  run: 'base',   label: '2  Enter on the retest of the level (within 10 sessions) instead of the next open', retest: true },
    { k: 'atr15',   run: 'atr15',  label: '2  Stop 1.5 ATR below the level' },
    { k: 'atr2',    run: 'atr2',   label: '2  Stop 2 ATR below the level' },
    { k: 'hvn50',   run: 'hvn50',  label: '3  Node strength 50%' },
    { k: 'hvn70',   run: 'hvn70',  label: '3  Node strength 70%' },
    { k: 'tested',  run: 'base',   label: '3  Level tested at least twice before', filt: function (t) { return t.touches >= 2; } },
    { k: 'tight',   run: 'base',   label: '3  Tight base: last 20 sessions within a 12% range', filt: function (t) { return t.baseRange != null && t.baseRange <= 12; } },
    { k: 'obv120',  run: 'obv120', label: '4  OBV higher high over 120 sessions' },
    { k: 'lead',    run: 'base',   label: '4  OBV leading price (OBV at a 60-session high before price) + Force rising, no OBV-new-high needed', grp: 'B', filt: function (t) { return t.lead && t.efi; } }
];
var _OB_GROUPS = [
    { k: 'A', label: 'A  Breakout + OBV higher high + Force rising (the full idea)' },
    { k: 'B', label: 'B  Breakout of a volume node alone (no OBV / Force filter)' },
    { k: 'C', label: 'C  Breakout + OBV higher high' },
    { k: 'D', label: 'D  Breakout + Force rising' }
];
var _OB_SPLIT = '2024-01-01';   // the modifier comparison judges a change on the sessions before this date and confirms it on the ones after
var _OB_P = { universe: 'nifty100', profLook: 120, bins: 40, hvnPct: 40, obvWin: 60, obvRecent: 3, efiMode: 'rising', atrMult: 1, cool: 10, maxGap: 8 };

// ── indicators ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function _obIndicators(c) {
    var n = c.length, o = [], h = [], l = [], cl = [], v = [];
    for (var i = 0; i < n; i++) { o.push(parseFloat(c[i][1])); h.push(parseFloat(c[i][2])); l.push(parseFloat(c[i][3])); cl.push(parseFloat(c[i][4])); v.push(parseFloat(c[i][5]) || 0); }
    var obv = [0], efi = [0], atr = [0], a = 2 / 14, tr = [h[0] - l[0]];
    for (var k = 1; k < n; k++) {
        var d = cl[k] - cl[k - 1];
        obv.push(obv[k - 1] + (d > 0 ? v[k] : d < 0 ? -v[k] : 0));
        efi.push(a * (d * v[k]) + (1 - a) * efi[k - 1]);
        tr.push(Math.max(h[k] - l[k], Math.abs(h[k] - cl[k - 1]), Math.abs(l[k] - cl[k - 1])));
        if (k < 14) atr.push(0); else if (k === 14) { var s = 0; for (var q = 1; q <= 14; q++) s += tr[q]; atr.push(s / 14); } else atr.push((atr[k - 1] * 13 + tr[k]) / 14);
    }
    var s50 = [], s200 = [], a50 = 0, a200 = 0;
    for (var m = 0; m < n; m++) {
        a50 += cl[m]; a200 += cl[m]; if (m >= 50) a50 -= cl[m - 50]; if (m >= 200) a200 -= cl[m - 200];
        s50.push(m >= 49 ? a50 / 50 : null); s200.push(m >= 199 ? a200 / 200 : null);
    }
    return { o: o, h: h, l: l, c: cl, v: v, obv: obv, efi: efi, atr: atr, sma50: s50, sma200: s200 };
}
function _obTouches(X, i, level, P) {      // earlier sessions in the profile window that reached the level from below and closed under it (a level that was tested), 5 sessions apart
    var n = 0;
    for (var q = i - P.profLook; q <= i - 2; q++) { if (X.h[q] >= level * 0.997 && X.c[q] < level) { n++; q += 4; } }
    return n;
}
function _obObvLead(X, i, P) {             // OBV made an obvWin-session high in the last 10 sessions at a time the price had not yet made its own
    for (var k = i - 1; k >= i - 10; k--) {
        var mo = -Infinity, mc = -Infinity;
        for (var q = k - P.obvWin; q < k; q++) { if (X.obv[q] > mo) mo = X.obv[q]; if (X.c[q] > mc) mc = X.c[q]; }
        if (X.obv[k] >= mo && X.c[k] < mc) return true;
    }
    return false;
}
// volume profile of sessions [i0, i1]: the volume of each candle is spread over the price bins its high-low range covers; returns the upper edges
// of the high-volume nodes (local peaks at least hvnPct % of the biggest bin)
function _obNodeEdges(X, i0, i1, bins, hvnPct) {
    var lo = Infinity, hi = -Infinity, i;
    for (i = i0; i <= i1; i++) { if (X.l[i] < lo) lo = X.l[i]; if (X.h[i] > hi) hi = X.h[i]; }
    if (!(hi > lo)) return [];
    var step = (hi - lo) / bins, vol = new Array(bins).fill(0);
    for (i = i0; i <= i1; i++) {
        var b0 = Math.max(0, Math.min(bins - 1, Math.floor((X.l[i] - lo) / step))), b1 = Math.max(0, Math.min(bins - 1, Math.floor((X.h[i] - lo) / step)));
        var share = X.v[i] / (b1 - b0 + 1);
        for (var b = b0; b <= b1; b++) vol[b] += share;
    }
    var mx = Math.max.apply(null, vol), out = [];
    if (!(mx > 0)) return out;
    for (var k = 0; k < bins; k++) {
        var left = k > 0 ? vol[k - 1] : -1, right = k < bins - 1 ? vol[k + 1] : -1;
        if (vol[k] >= left && vol[k] >= right && vol[k] >= mx * hvnPct / 100) out.push(lo + (k + 1) * step);
    }
    return out;
}
// the highest node edge the close crossed from below on session i, or null
function _obBreakLevel(X, i, P) {
    var edges = _obNodeEdges(X, i - P.profLook, i - 1, P.bins, P.hvnPct), best = null;
    for (var k = 0; k < edges.length; k++) if (X.c[i - 1] <= edges[k] && edges[k] < X.c[i] && (best == null || edges[k] > best)) best = edges[k];
    return best;
}
function _obObvHigh(X, i, P) {        // OBV made a new P.obvWin-session high on session i or in the last P.obvRecent sessions
    for (var k = i; k > i - P.obvRecent; k--) {
        var mx = -Infinity; for (var q = k - P.obvWin; q < k; q++) if (X.obv[q] > mx) mx = X.obv[q];
        if (X.obv[k] >= mx) return true;
    }
    return false;
}
function _obForceUp(X, i, P) {
    if (!(X.efi[i] > 0)) return false;
    if (P.efiMode === 'high20') { var mx = -Infinity; for (var q = i - 20; q < i; q++) if (X.efi[q] > mx) mx = X.efi[q]; return X.efi[i] >= mx; }
    return X.efi[i] > X.efi[i - 1];
}
// follow a trade bar by bar: the stop is checked first inside a bar (conservative), a gap through the stop fills at the open
// trail = ATR multiple of a stop that ratchets up under the highest close (atr0 = ATR at the signal); tstop = leave at that session's close if still not above the entry
function _obSim(X, i, entry, stop, rr, hold, trail, tstop, atr0) {
    var R = entry - stop, target = rr > 0 ? entry + rr * R : null, last = i + hold, n = X.c.length, cur = stop, hi = entry;
    for (var j = i + 1; j <= last && j < n; j++) {
        if (X.o[j] <= cur) return { r: (X.o[j] - entry) / R, days: j - i, kind: 'stop' };
        if (X.l[j] <= cur) return { r: (cur - entry) / R, days: j - i, kind: 'stop' };
        if (target != null) { if (X.o[j] >= target) return { r: (X.o[j] - entry) / R, days: j - i, kind: 'target' }; if (X.h[j] >= target) return { r: rr, days: j - i, kind: 'target' }; }
        if (tstop > 0 && j - i === tstop && X.c[j] <= entry) return { r: (X.c[j] - entry) / R, days: j - i, kind: 'tstop' };
        if (trail > 0) { if (X.c[j] > hi) hi = X.c[j]; cur = Math.max(cur, hi - trail * atr0); }
        if (j === last) return { r: (X.c[j] - entry) / R, days: j - i, kind: 'time' };
    }
    return null;                         // the data ended before the trade did
}
// all trades of one stock. nd / ncl / nsma = NIFTY dates, closes and 200-day average (for the 20-session comparison and the market state)
function _obAnalyseStock(sym, candles, P, nd, ncl, nsma) {
    var out = [], n = candles.length;
    if (n < P.profLook + 40) return out;
    var X = _obIndicators(candles), dates = candles.map(function (r) { return String(r[0]).slice(0, 10); });
    var start = Math.max(P.profLook, P.obvWin + P.obvRecent, 30) + 1, last = {};
    for (var i = start; i < n - 1; i++) {
        if (!(X.c[i] > X.c[i - 1]) || !(X.atr[i] > 0)) continue;
        var level = _obBreakLevel(X, i, P);
        if (level == null) continue;
        var obv = _obObvHigh(X, i, P), efi = _obForceUp(X, i, P), gs = ['B'];
        if (obv) gs.push('C'); if (efi) gs.push('D'); if (obv && efi) gs.push('A');
        gs = gs.filter(function (g) { return last[g] == null || i - last[g] > P.cool; });
        if (!gs.length) continue;
        gs.forEach(function (g) { last[g] = i; });
        var entry = X.o[i + 1], stop = level - P.atrMult * X.atr[i];
        if (!(entry > stop) || entry > level * (1 + P.maxGap / 100) || (entry - stop) / entry > 0.25) continue;
        var res = {}, rt = null, atr0 = X.atr[i];
        _OB_EXITS.forEach(function (e) { res[e.k] = _obSim(X, i, entry, stop, e.rr, e.hold, e.trail || 0, e.tstop || 0, atr0); });
        // retest entry: within 10 sessions price comes back to the level (low within 0.3% of it) and closes above it; a close under the level cancels
        for (var rj = i + 1; rj <= i + 10 && rj < n; rj++) {
            if (X.c[rj] < level) break;
            if (X.l[rj] <= level * 1.003 && X.c[rj] >= level) {
                var re = X.c[rj];
                if (re > stop && (re - stop) / re <= 0.25) { rt = { entry: re, res: {} }; _OB_EXITS.forEach(function (e) { rt.res[e.k] = _obSim(X, rj, re, stop, e.rr, e.hold, e.trail || 0, e.tstop || 0, atr0); }); }
                break;
            }
        }
        var vs = 0; for (var vq = i - 20; vq < i; vq++) vs += X.v[vq];
        var hi20 = -Infinity, lo20 = Infinity; for (var bq = i - 20; bq < i; bq++) { if (X.h[bq] > hi20) hi20 = X.h[bq]; if (X.l[bq] < lo20) lo20 = X.l[bq]; }
        var k = nd ? _ltIdxAtDate(nd, dates[i]) : -1;
        out.push({ sym: sym, date: dates[i], level: level, entry: entry, stop: stop, groups: gs, res: res, rt: rt, obv: obv, efi: efi,
            vr: vs > 0 ? X.v[i] / (vs / 20) : null, ext: X.sma50[i] ? (X.c[i] / X.sma50[i] - 1) * 100 : null, gap: (X.o[i] / X.c[i - 1] - 1) * 100,
            a200: X.sma200[i] != null && X.c[i] > X.sma200[i], rs12: i >= 252 ? X.c[i] / X.c[i - 252] - 1 : null,
            touches: _obTouches(X, i, level, P), baseRange: (hi20 - lo20) / level * 100, lead: _obObvLead(X, i, P),
            f20: (i + 20 < n) ? (X.c[i + 20] / X.c[i] - 1) * 100 : null,
            n20: (k >= 0 && k + 20 < nd.length) ? (ncl[k + 20] / ncl[k] - 1) * 100 : null,
            reg: (k >= 0 && nsma && nsma[k] != null) ? (ncl[k] > nsma[k] ? 'UP' : 'DOWN') : null });
    }
    return out;
}

// ── statistics ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function _obWilson(w, n) {
    if (!n) return [0, 0];
    var z = 1.96, p = w / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, c - m) * 100, Math.min(1, c + m) * 100];
}
function _obStats(trades, ek) {
    var rs = trades.map(function (t) { return t.res[ek]; }).filter(function (x) { return x; });
    var n = rs.length;
    if (!n) return { n: 0 };
    var wins = rs.filter(function (x) { return x.r > 0; }), loss = rs.filter(function (x) { return x.r <= 0; });
    var sum = function (a) { return a.reduce(function (s, x) { return s + x.r; }, 0); };
    var f20 = trades.filter(function (t) { return t.f20 != null && t.n20 != null; });
    return { n: n, win: wins.length / n * 100, wr: _obWilson(wins.length, n), avgR: sum(rs) / n, avgWin: wins.length ? sum(wins) / wins.length : 0, avgLoss: loss.length ? sum(loss) / loss.length : 0,
        pf: loss.length && sum(loss) < 0 ? sum(wins) / -sum(loss) : null, days: rs.reduce(function (s, x) { return s + x.days; }, 0) / n,
        stopPct: rs.filter(function (x) { return x.kind === 'stop'; }).length / n * 100,
        f20: f20.length ? f20.reduce(function (s, t) { return s + t.f20; }, 0) / f20.length : null,
        ex20: f20.length ? f20.reduce(function (s, t) { return s + (t.f20 - t.n20); }, 0) / f20.length : null,
        beat: f20.length ? f20.filter(function (t) { return t.f20 > t.n20; }).length / f20.length * 100 : null, nf: f20.length };
}

// ── popup ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function _obFmt(x, d, sign) { return x == null || !isFinite(x) ? '-' : (sign && x > 0 ? '+' : '') + x.toFixed(d); }
function _obCol(x) { return x == null ? 'var(--gtb-muted)' : x > 0 ? 'var(--gtb-green)' : x < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)'; }
function _obTableHtml(trades, ek) {
    var th = 'padding:3px 8px;font-size:0.46rem;letter-spacing:0.05em;color:var(--gtb-muted);text-align:right;font-weight:700;white-space:nowrap;', td = 'padding:3px 8px;border-top:1px solid var(--gtb-border);text-align:right;font-family:var(--gtb-mono);';
    var head = '<tr><th style="' + th + 'text-align:left;">GROUP</th><th style="' + th + '">TRADES</th><th style="' + th + '">WIN %</th><th style="' + th + '">95% RANGE</th><th style="' + th + '">AVG R</th><th style="' + th + '">AVG WIN R</th><th style="' + th + '">AVG LOSS R</th><th style="' + th + '">PROFIT FACTOR</th><th style="' + th + '">STOPPED OUT</th><th style="' + th + '">AVG DAYS</th><th style="' + th + '">20-SESSION RETURN</th><th style="' + th + '">VS NIFTY</th><th style="' + th + '">BEAT NIFTY</th></tr>';
    var body = _OB_GROUPS.map(function (g) {
        var s = _obStats(trades.filter(function (t) { return t.groups.indexOf(g.k) !== -1; }), ek);
        if (!s.n) return '<tr><td style="' + td + 'text-align:left;font-family:inherit;font-weight:700;">' + g.label + '</td><td colspan="12" style="' + td + 'color:var(--gtb-muted);text-align:left;">no trades</td></tr>';
        return '<tr><td style="' + td + 'text-align:left;font-family:inherit;font-weight:700;">' + g.label + '</td><td style="' + td + '">' + s.n + (s.n < 30 ? ' <span style="color:var(--gtb-amber);" title="Fewer than 30 trades: treat as anecdote">few</span>' : '') + '</td>'
            + '<td style="' + td + '">' + s.win.toFixed(0) + '%</td><td style="' + td + 'color:var(--gtb-muted);">' + s.wr[0].toFixed(0) + ' to ' + s.wr[1].toFixed(0) + '%</td>'
            + '<td style="' + td + 'font-weight:800;color:' + _obCol(s.avgR) + ';">' + _obFmt(s.avgR, 2, true) + '</td><td style="' + td + 'color:var(--gtb-green);">' + _obFmt(s.avgWin, 2, true) + '</td><td style="' + td + 'color:var(--gtb-red);">' + _obFmt(s.avgLoss, 2) + '</td>'
            + '<td style="' + td + '">' + _obFmt(s.pf, 2) + '</td><td style="' + td + '">' + s.stopPct.toFixed(0) + '%</td><td style="' + td + '">' + s.days.toFixed(0) + '</td>'
            + '<td style="' + td + 'color:' + _obCol(s.f20) + ';">' + _obFmt(s.f20, 1, true) + '%</td><td style="' + td + 'color:' + _obCol(s.ex20) + ';">' + _obFmt(s.ex20, 1, true) + '%</td><td style="' + td + '">' + _obFmt(s.beat, 0) + '%</td></tr>';
    }).join('');
    return '<table style="width:100%;border-collapse:collapse;font-size:0.56rem;"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
}
function _obResultHtml(res) {
    var M = 'var(--gtb-muted)', ek = _OB.exitKey, trades = res.trades;
    var ex = _OB_EXITS.filter(function (e) { return e.k === ek; })[0] || _OB_EXITS[1];
    var h = '<div style="font-size:0.58rem;color:' + M + ';margin-bottom:6px;">' + res.nStocks + ' stocks with enough history, ' + trades.length + ' breakout signals from ' + res.first + ' to ' + res.last + '. R = the distance from entry to the stop (1R lost on a stop-out). Entry at the next session open.</div>';
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.58rem;">Exit rule <select id="ob-exit" class="sv-pill-btn">' + _OB_EXITS.map(function (e) { return '<option value="' + e.k + '"' + (e.k === ek ? ' selected' : '') + '>' + e.label + '</option>'; }).join('') + '</select></div>';
    h += _obTableHtml(trades, ek);
    // market state: A and B, rising vs falling market
    var regs = ['UP', 'DOWN'].map(function (r) {
        var ts = trades.filter(function (t) { return t.reg === r; });
        return '<div style="flex:1 1 0;min-width:300px;"><div style="font-size:0.5rem;font-weight:800;color:' + M + ';margin:8px 0 3px;letter-spacing:0.05em;">WHEN NIFTY 50 WAS ' + (r === 'UP' ? 'ABOVE' : 'BELOW') + ' ITS 200-DAY AVERAGE</div>' + _obTableMini(ts, ek) + '</div>';
    }).join('');
    h += '<div style="display:flex;gap:14px;flex-wrap:wrap;">' + regs + '</div>';
    // by year for the full idea
    var yrs = {}; trades.filter(function (t) { return t.groups.indexOf('A') !== -1 && t.res[ek]; }).forEach(function (t) { var y = t.date.slice(0, 4); (yrs[y] = yrs[y] || []).push(t.res[ek].r); });
    var yh = Object.keys(yrs).sort().map(function (y) { var a = yrs[y], av = a.reduce(function (s, x) { return s + x; }, 0) / a.length; return '<span style="margin-right:14px;">' + y + ': <b style="color:' + _obCol(av) + ';">' + _obFmt(av, 2, true) + 'R</b> <span style="color:' + M + ';">(' + a.length + ')</span></span>'; }).join('');
    h += '<div style="margin-top:8px;font-size:0.56rem;"><span style="font-size:0.5rem;font-weight:800;color:' + M + ';letter-spacing:0.05em;">GROUP A BY YEAR (average R, trades)</span><div style="margin-top:3px;">' + (yh || '<span style="color:' + M + ';">no trades</span>') + '</div></div>';
    h += _obCompareHtml(res, ek);
    // latest group A signals
    var lastA = trades.filter(function (t) { return t.groups.indexOf('A') !== -1; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 25);
    h += '<div style="margin-top:8px;font-size:0.5rem;font-weight:800;color:' + M + ';letter-spacing:0.05em;">LATEST GROUP A SIGNALS</div><table style="width:100%;border-collapse:collapse;font-size:0.54rem;margin-top:3px;"><tbody>'
        + (lastA.map(function (t) { var r = t.res[ek]; return '<tr style="border-top:1px solid var(--gtb-border);"><td style="padding:2px 8px;font-weight:700;">' + t.sym + '</td><td style="padding:2px 8px;color:' + M + ';">' + t.date + '</td><td style="padding:2px 8px;font-family:var(--gtb-mono);">level ' + Math.round(t.level * 100) / 100 + '</td><td style="padding:2px 8px;font-family:var(--gtb-mono);">entry ' + Math.round(t.entry * 100) / 100 + '</td><td style="padding:2px 8px;font-family:var(--gtb-mono);">stop ' + Math.round(t.stop * 100) / 100 + '</td><td style="padding:2px 8px;font-family:var(--gtb-mono);color:' + _obCol(r ? r.r : null) + ';">' + (r ? _obFmt(r.r, 2, true) + 'R, ' + r.kind + ', ' + r.days + 'd' : 'still open / no data') + '</td></tr>'; }).join('') || '<tr><td style="color:' + M + ';padding:4px 8px;">none</td></tr>') + '</tbody></table>';
    h += '<div style="margin-top:10px;padding:6px 8px;border:1px solid var(--gtb-amber);font-size:0.52rem;line-height:1.5;"><b style="color:var(--gtb-amber);">Read this first.</b> The list is <b>today\'s</b> ' + res.label + ' members, so stocks that left the index or were delisted are missing and results look better than a real trader would have seen (survivorship bias). No brokerage, taxes or slippage; entries at the next open are optimistic on gap days. Group A is one reading of the chart idea (OBV higher high within the last ' + _OB_P.obvRecent + ' sessions, Force Index (13) positive and ' + (_OB_P.efiMode === 'high20' ? 'at a 20-session high' : 'rising') + ', a close above a volume node of the last ' + _OB_P.profLook + ' sessions), not the original author\'s exact rules. Compare A with B: if the filters do not improve on the breakout alone, they add nothing. Signals cluster in the same market phases, so a few hundred trades can still be one or two episodes: look at the by-year line and the rising / falling market split. Descriptive only, not a forecast and not advice.</div>';
    return h;
}
function _obAvg(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
function _obCompareRows(res, ek) {
    var rows = _OB_VARIANTS.map(function (v) {
        var all = (res.runs && res.runs[v.run]) || [], g = v.grp || 'A';
        var ts = all.filter(function (t) { return t.groups.indexOf(g) !== -1 && (!v.filt || v.filt(t)); });
        var rs = [];
        ts.forEach(function (t) { var r = v.retest ? (t.rt && t.rt.res[ek]) : t.res[ek]; if (r) rs.push({ r: r.r, d: t.date }); });
        var a = rs.filter(function (x) { return x.d < _OB_SPLIT; }).map(function (x) { return x.r; }), b = rs.filter(function (x) { return x.d >= _OB_SPLIT; }).map(function (x) { return x.r; });
        return { v: v, n: rs.length, win: rs.length ? rs.filter(function (x) { return x.r > 0; }).length / rs.length * 100 : null, avg: _obAvg(rs.map(function (x) { return x.r; })), n1: a.length, a1: _obAvg(a), n2: b.length, a2: _obAvg(b) };
    });
    var base = rows[0];
    rows.forEach(function (r) {
        if (r === base) { r.verdict = 'reference'; return; }
        if (r.n1 < 20 || r.n2 < 20) r.verdict = 'too few trades to judge';
        else if (r.a1 > base.a1 && r.a2 > base.a2) r.verdict = 'better in both periods';
        else if (r.a1 < base.a1 && r.a2 < base.a2) r.verdict = 'worse in both';
        else r.verdict = 'mixed: not stable';
    });
    return rows;
}
function _obCompareHtml(res, ek) {
    var M = 'var(--gtb-muted)', th = 'padding:3px 8px;font-size:0.46rem;letter-spacing:0.05em;color:' + M + ';text-align:right;font-weight:700;white-space:nowrap;', td = 'padding:3px 8px;border-top:1px solid var(--gtb-border);text-align:right;font-family:var(--gtb-mono);';
    if (!res.runs) return '<div style="margin-top:10px;font-size:0.54rem;color:' + M + ';">Press COMPARE MODIFIERS to test each change against the full idea, split before and after ' + _OB_SPLIT + '.</div>';
    var rows = _obCompareRows(res, ek), cell = function (n, av) { return '<td style="' + td + '">' + n + '</td><td style="' + td + 'font-weight:700;color:' + _obCol(av) + ';">' + _obFmt(av, 2, true) + '</td>'; };
    var h = '<div style="margin-top:12px;font-size:0.5rem;font-weight:800;color:' + M + ';letter-spacing:0.05em;">MODIFIERS AGAINST THE FULL IDEA (group A, exit rule above, average R). Judged before ' + _OB_SPLIT + ', confirmed from then on</div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:0.56rem;margin-top:3px;"><thead><tr><th style="' + th + 'text-align:left;">CHANGE</th><th style="' + th + '">TRADES</th><th style="' + th + '">WIN %</th><th style="' + th + '">AVG R</th><th style="' + th + '">BEFORE: N</th><th style="' + th + '">AVG R</th><th style="' + th + '">AFTER: N</th><th style="' + th + '">AVG R</th><th style="' + th + 'text-align:left;">VERDICT</th></tr></thead><tbody>';
    rows.forEach(function (r) {
        var vc = r.verdict === 'better in both periods' ? 'var(--gtb-green)' : r.verdict === 'worse in both' ? 'var(--gtb-red)' : 'var(--gtb-amber)';
        h += '<tr><td style="' + td + 'text-align:left;font-family:inherit;font-weight:700;" title="' + (r.v.tip || '') + '">' + r.v.label + '</td><td style="' + td + '">' + r.n + '</td><td style="' + td + '">' + (r.win == null ? '-' : r.win.toFixed(0) + '%') + '</td><td style="' + td + 'font-weight:800;color:' + _obCol(r.avg) + ';">' + _obFmt(r.avg, 2, true) + '</td>'
            + cell(r.n1, r.a1) + cell(r.n2, r.a2) + '<td style="' + td + 'text-align:left;font-family:inherit;color:' + vc + ';">' + r.verdict + '</td></tr>';
    });
    return h + '</tbody></table><div style="margin-top:4px;font-size:0.5rem;color:' + M + ';line-height:1.5;">A change is only worth keeping if it beats the baseline in BOTH periods with at least 20 trades in each. Twelve variants on one data set means one or two will look good by luck: a variant that wins here still needs the next months to confirm it. The stop variants change what 1R means (a wider stop makes R larger), so compare them with care. Retest and the OBV-leading variant use their own signal sets; the leading variant uses group B signals that have Force rising. The 12-month strength rank is against the whole tested list on that date. Trailing and time-stop exits are in the Exit rule list above.</div>';
}
function _obTableMini(ts, ek) {
    var th = 'padding:2px 6px;font-size:0.44rem;color:var(--gtb-muted);text-align:right;font-weight:700;', td = 'padding:2px 6px;border-top:1px solid var(--gtb-border);text-align:right;font-family:var(--gtb-mono);';
    return '<table style="width:100%;border-collapse:collapse;font-size:0.54rem;"><thead><tr><th style="' + th + 'text-align:left;">GROUP</th><th style="' + th + '">TRADES</th><th style="' + th + '">WIN %</th><th style="' + th + '">AVG R</th></tr></thead><tbody>'
        + _OB_GROUPS.map(function (g) {
            var s = _obStats(ts.filter(function (t) { return t.groups.indexOf(g.k) !== -1; }), ek);
            return '<tr><td style="' + td + 'text-align:left;font-family:inherit;font-weight:700;">' + g.k + '</td>' + (s.n ? '<td style="' + td + '">' + s.n + (s.n < 30 ? ' <span style="color:var(--gtb-amber);">few</span>' : '') + '</td><td style="' + td + '">' + s.win.toFixed(0) + '%</td><td style="' + td + 'color:' + _obCol(s.avgR) + ';">' + _obFmt(s.avgR, 2, true) + '</td>' : '<td colspan="3" style="' + td + 'color:var(--gtb-muted);">none</td>') + '</tr>';
        }).join('') + '</tbody></table>';
}
function _obControlsHtml() {
    var sel = function (id, val, opts) { return '<select id="' + id + '" class="sv-pill-btn">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'; };
    var lab = function (t, inner, tip) { return '<label style="display:flex;align-items:center;gap:4px;font-size:0.54rem;color:var(--gtb-muted);" title="' + (tip || '') + '">' + t + inner + '</label>'; };
    return '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">'
        + lab('Stocks', sel('ob-uni', _OB_P.universe, Object.keys(_LT_UNIVERSES).map(function (k) { return [k, _LT_UNIVERSES[k].label]; })), 'The NSE index list to test (today\'s members)')
        + lab('Volume profile of the last', sel('ob-prof', _OB_P.profLook, [[60, '60'], [120, '120'], [250, '250']]) + ' sessions', 'The window the volume profile is built from, ending the session before the breakout')
        + lab('Node strength', sel('ob-hvn', _OB_P.hvnPct, [[30, '30%'], [40, '40%'], [50, '50%'], [70, '70%']]), 'A peak counts as a level when its volume is at least this share of the biggest price bin')
        + lab('OBV higher high over', sel('ob-obv', _OB_P.obvWin, [[20, '20'], [60, '60'], [120, '120']]) + ' sessions', 'OBV must make a new high of this many sessions on the breakout session or in the last 3')
        + lab('Force', sel('ob-efi', _OB_P.efiMode, [['rising', 'positive and rising'], ['high20', 'at a 20-session high']]), 'Elder Force Index (13) condition on the breakout session')
        + lab('Stop', sel('ob-atr', _OB_P.atrMult, [[0.5, '0.5'], [1, '1'], [1.5, '1.5'], [2, '2']]) + ' ATR below the level', 'The stop is this many ATR(14) below the broken level')
        + '<button id="ob-run" class="sv-load-btn" type="button"><i class="bi bi-play-fill"></i> RUN</button><button id="ob-compare" class="sv-load-btn" type="button" title="Runs the baseline and every modifier (six analysis passes) and compares them, split before / after the date below"><i class="bi bi-intersect"></i> COMPARE MODIFIERS</button><button id="ob-stop" class="sv-pill-btn" type="button"><i class="bi bi-stop-fill"></i> Stop</button><span id="ob-progress" class="ps-progress"></span></div>';
}
function _obShowPopup() {
    showPopUpWindow('ob-test', '<div style="padding:10px 14px;font-size:0.6rem;color:var(--gtb-text);">' + _obControlsHtml()
        + '<div style="font-size:0.54rem;color:var(--gtb-muted);margin-bottom:6px;line-height:1.5;">Idea: a stock closes above a high-volume node of its volume profile (the support / resistance "mountains") while OBV makes a higher high and Elder Force Index rises. Daily candles, entry next open, stop below the broken level. Press RUN; the first run downloads the daily history of the whole list.</div>'
        + '<div id="ob-out">' + (_OB.last ? _obResultHtml(_OB.last) : '') + '</div></div>', 'OBV + Force + volume profile breakout test', 1120, 640);
    var cls = 'popup-custom-style-ob-test';
    var title = '<div style="display:flex;align-items:center;gap:6px;width:100%;"><i class="bi bi-bar-chart-steps"></i><span style="font-weight:800;font-size:0.7rem;">OBV + FORCE + VOLUME PROFILE BREAKOUT TEST</span>' + popupWinControls(cls) + '</div>';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html(title);
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + cls).find('.popupwindow_content').css({ overflowY: 'auto' });
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
}
function _obReadParams() {
    _OB_P.universe = jQ('#ob-uni').val() || _OB_P.universe;
    _OB_P.profLook = parseInt(jQ('#ob-prof').val(), 10) || _OB_P.profLook;
    _OB_P.hvnPct = parseInt(jQ('#ob-hvn').val(), 10) || _OB_P.hvnPct;
    _OB_P.obvWin = parseInt(jQ('#ob-obv').val(), 10) || _OB_P.obvWin;
    _OB_P.efiMode = jQ('#ob-efi').val() || _OB_P.efiMode;
    _OB_P.atrMult = parseFloat(jQ('#ob-atr').val()) || _OB_P.atrMult;
}
async function _obRun(compare) {
    if (_OB.running) return;
    _obReadParams();
    var key = _OB_P.universe, def = _LT_UNIVERSES[key], prog = function (t) { jQ('#ob-progress').text(t); };
    if (!(typeof _DL_INSTRUMENTS !== 'undefined' && _DL_INSTRUMENTS.length)) { try { _gtbToast('Load the Kite instruments first (Data Load).', 'error'); } catch (e) {} return; }
    _OB.running = true; _OB.stop = false; jQ('#ob-run').prop('disabled', true);
    try {
        prog('Downloading the ' + def.label + ' list…');
        var list = await _ltFetchUniverse(key), tokens = _ltTokenMap();
        if (!_OB_NIFTY) {
            var nTok = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS['NIFTY 50'] : null;
            if (!nTok) throw new Error('NIFTY 50 token not found');
            prog('Loading NIFTY 50 history…');
            var nc = await _psFetchDaily(nTok, _OB_DAYS);
            var ncl = nc.map(function (c) { return parseFloat(c[4]); });
            _OB_NIFTY = { dates: nc.map(function (c) { return String(c[0]).slice(0, 10); }), closes: ncl, sma: _psSmaArr(ncl, 200) };
        }
        var todo = list.filter(function (m) { return tokens[m.symbol]; }), done = 0, fetched = 0;
        var work = async function (m) {
            if (!_OB_CANDLES[m.symbol]) { try { _OB_CANDLES[m.symbol] = await _psFetchDaily(tokens[m.symbol], _OB_DAYS); fetched++; } catch (e) { _OB_CANDLES[m.symbol] = []; } }
            done++;
            if (done % 5 === 0) { prog('Stocks ' + done + ' / ' + todo.length + (fetched ? ' (' + fetched + ' downloaded)' : '') + '…'); await new Promise(function (r) { setTimeout(r, 0); }); }
        };
        var idx = 0, workers = [];
        for (var w = 0; w < _LT_POOL; w++) workers.push((async function () { while (idx < todo.length && !_OB.stop) { var it = todo[idx++]; await work(it); } })());
        await Promise.all(workers);
        prog('Testing…'); await new Promise(function (r) { setTimeout(r, 0); });
        // 12-month return of every stock on every date, so a signal can be ranked against the whole list that day
        var rsByDate = {};
        todo.forEach(function (m) {
            var c = _OB_CANDLES[m.symbol];
            if (!c || c.length < 260) return;
            for (var q = 252; q < c.length; q++) { var dq = String(c[q][0]).slice(0, 10); (rsByDate[dq] = rsByDate[dq] || []).push(parseFloat(c[q][4]) / parseFloat(c[q - 252][4]) - 1); }
        });
        Object.keys(rsByDate).forEach(function (d) { rsByDate[d].sort(function (a, b) { return a - b; }); });
        var rank = function (d, v) { var a = rsByDate[d]; if (!a || a.length < 20 || v == null) return null; var lo = 0, hi = a.length; while (lo < hi) { var mid = (lo + hi) >> 1; if (a[mid] < v) lo = mid + 1; else hi = mid; } return lo / a.length; };
        var passes = compare ? Object.keys(_OB_RUNS) : ['base'], runs = {}, used = 0;
        for (var pi = 0; pi < passes.length && !_OB.stop; pi++) {
            prog('Testing' + (compare ? ' (' + (pi + 1) + ' of ' + passes.length + ': ' + passes[pi] + ')' : '') + '…'); await new Promise(function (r) { setTimeout(r, 0); });
            var P = Object.assign({}, _OB_P, _OB_RUNS[passes[pi]]), trades = [], cnt = 0;
            for (var si = 0; si < todo.length; si++) {
                var c = _OB_CANDLES[todo[si].symbol];
                if (!c || c.length < P.profLook + 60) continue;
                cnt++;
                _obAnalyseStock(todo[si].symbol, c, P, _OB_NIFTY.dates, _OB_NIFTY.closes, _OB_NIFTY.sma).forEach(function (t) { t.rsRank = rank(t.date, t.rs12); trades.push(t); });
                if (si % 10 === 9) await new Promise(function (r) { setTimeout(r, 0); });
            }
            trades.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
            runs[passes[pi]] = trades; if (passes[pi] === 'base') used = cnt;
        }
        var trades = runs.base || [];
        _OB.last = { label: def.label, nStocks: used, trades: trades, runs: compare ? runs : null, first: trades.length ? trades[0].date : '-', last: trades.length ? trades[trades.length - 1].date : '-' };
        prog(_OB.stop ? 'Stopped: showing the stocks tested so far.' : 'Done.');
        jQ('#ob-out').html(_obResultHtml(_OB.last));
    } catch (e) { prog('Failed: ' + (e && e.message ? e.message : e)); }
    _OB.running = false; jQ('#ob-run').prop('disabled', false);
}
jQ(document).on('click', '#ob-run', function () { _obRun(false); });
jQ(document).on('click', '#ob-compare', function () { _obRun(true); });
jQ(document).on('click', '#ob-stop', function () { _OB.stop = true; });
jQ(document).on('change', '#ob-exit', function () { _OB.exitKey = jQ(this).val(); if (_OB.last) jQ('#ob-out').html(_obResultHtml(_OB.last)); });
jQ(document).on('click', '#ps-ob-btn', function (e) { e.preventDefault(); _obShowPopup(); });
