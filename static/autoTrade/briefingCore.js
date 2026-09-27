// ══════════════════════════════════════════════════════════════════════════════════════
// Market Briefing — CORE (data collection)
// ══════════════════════════════════════════════════════════════════════════════════════
// Rule-based, deterministic "LLM-style" briefing for the Groot Bot dashboard. This file only
// COLLECTS and SCORES — it reads the metrics this app has already computed (composite score,
// 9:15 zones, advance/decline, futures remarks, OI/OBV walls, Max Pain/GEX, IV skew, level
// probability, Master Consensus, CLC verdicts, Fear & Greed, Trend Probability, curve
// structure, VIX …) and returns one plain state object `S`. briefingText.js turns S into prose;
// briefingUi.js renders it as the "Briefing" tab.
//
// Design rules (same honesty conventions as the rest of the app):
//   • Nothing here fetches from the network — it only reads already-cached data, so a briefing
//     is exactly as fresh as the last refresh. Anything missing is LISTED (S.gaps), never
//     silently skipped, so the prose can say "no OI data for X" instead of pretending.
//   • Every collector is wrapped so one broken engine can't blank the whole briefing.
//   • Thresholds mirror the engines they read (getMarketSignal, getEntryConfluence,
//     _cmdBuildVerdict …) — this file does not invent a competing signal model, it explains
//     and ranks the ones that already exist. The only new arithmetic is the transparent
//     "opportunity score" (see _bfBuildOpportunities), whose every component is shown.

var _BF_CORE_NAMES = ['GIFT NIFTY', 'NIFTY 50', 'NIFTY BANK', 'SENSEX', 'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'CRUDEOILM', 'USDINR'];
var _BF_INDEX_NAMES = { 'GIFT NIFTY': 1, 'NIFTY 50': 1, 'NIFTY BANK': 1, 'SENSEX': 1 };

// ── tiny helpers ─────────────────────────────────────────────────────────────────────────
function _bfNum(v) { var n = parseFloat(v); return (isNaN(n) || !isFinite(n)) ? null : n; }
function _bfFmt(v, d) {
    var n = _bfNum(v); if (n === null) return '—';
    d = (d === undefined) ? 2 : d;
    return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: d });
}
function _bfFix(v, d) { var n = _bfNum(v); return n === null ? '—' : n.toFixed(d === undefined ? 2 : d); }
function _bfSg(v, d) { var n = _bfNum(v); if (n === null) return '—'; return (n >= 0 ? '+' : '') + n.toFixed(d === undefined ? 2 : d); }
function _bfPct(v, d) { var n = _bfNum(v); if (n === null) return '—'; return (n >= 0 ? '+' : '') + n.toFixed(d === undefined ? 2 : d) + '%'; }
function _bfSign(v, eps) { eps = eps || 0; return v > eps ? 1 : v < -eps ? -1 : 0; }
function _bfDirWord(d) { return d > 0 ? 'bullish' : d < 0 ? 'bearish' : 'neutral'; }

// Runs fn, records a human-readable gap (and a console.warn — which the central error log
// captures) instead of throwing, so one broken engine never blanks the whole briefing.
function _bfTry(gaps, label, fn, fallback) {
    try { return fn(); }
    catch (e) {
        try { gaps.push('Could not compute ' + label + ' (' + (e && e.message ? e.message : e) + ')'); } catch (_) {}
        try { console.warn('[Briefing] ' + label + ' failed:', e); } catch (_) {}
        return fallback;
    }
}

// ── clock / trading window ───────────────────────────────────────────────────────────────
// getTradingWindow() reads the REAL clock only. When the dashboard is in snapshot/replay mode
// (Settings current_day_date in the past, or the snapshot end-time picker set) the "now" that
// matters is the snapshot time, so the same thresholds are re-applied to that instead.
function _bfClock() {
    var real = moment();
    var t = null; try { t = _gtbHistTime(); } catch (e) {}
    var curDay = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? CURRENT_DAY : real.format('YYYY-MM-DD');
    var prevDay = (typeof PREVIOUS_DAY !== 'undefined') ? PREVIOUS_DAY : null;
    var isReplay = curDay !== real.format('YYYY-MM-DD');
    var minutes, source;
    if (t) { var p = String(t).split(':'); minutes = (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); source = 'snapshot end time ' + t; }
    else if (isReplay) { minutes = 15 * 60 + 30; source = 'full-day replay (end of session)'; }
    else { minutes = real.hours() * 60 + real.minutes(); source = 'live clock'; }
    var weekend = (!isReplay && real.isoWeekday() >= 6);
    var hh = Math.floor(minutes / 60), mm = minutes % 60;
    return { real: real, minutes: minutes, hhmm: (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm,
             source: source, isReplay: isReplay, snapTime: t, curDay: curDay, prevDay: prevDay, weekend: weekend };
}

var _BF_WINDOWS = [
    { from: 0,   to: 555, name: 'CLOSED', key: 'pre',   label: 'Before the 9:15 open' },
    { from: 555, to: 585, name: 'AVOID',  key: 'open',  label: 'Opening chaos (9:15–9:45)' },
    { from: 585, to: 690, name: 'PRIME',  key: 'prime', label: 'Prime trending window (9:45–11:30)' },
    { from: 690, to: 780, name: 'OK',     key: 'mid',   label: 'Mid-morning (11:30–13:00)' },
    { from: 780, to: 840, name: 'AVOID',  key: 'lunch', label: 'Lunch lull (13:00–14:00)' },
    { from: 840, to: 900, name: 'OK',     key: 'aft',   label: 'Afternoon session (14:00–15:00)' },
    { from: 900, to: 915, name: 'AVOID',  key: 'eod',   label: 'End-of-day squaring (15:00–15:15)' },
    { from: 915, to: 1441, name: 'CLOSED', key: 'post', label: 'After the 15:15 cut-off' },
];
function _bfWindow(minutes, weekend) {
    if (weekend) return { name: 'CLOSED', key: 'weekend', label: 'Weekend — market closed', minsLeft: null, next: null };
    var w = _BF_WINDOWS[_BF_WINDOWS.length - 1], idx = _BF_WINDOWS.length - 1;
    for (var i = 0; i < _BF_WINDOWS.length; i++) { if (minutes >= _BF_WINDOWS[i].from && minutes < _BF_WINDOWS[i].to) { w = _BF_WINDOWS[i]; idx = i; break; } }
    var nx = _BF_WINDOWS[idx + 1] || null;
    return { name: w.name, key: w.key, label: w.label, minsLeft: nx ? (w.to - minutes) : null,
             next: nx ? { name: nx.name, key: nx.key, label: nx.label } : null };
}

// ── composite score decomposition ────────────────────────────────────────────────────────
// Recomputes SCORE exactly the way setScore() sums it (SCORE is a local there, not a global),
// but keeps every term so the briefing can say WHICH pillar is doing the work.
function _bfScoreParts() {
    var includeLagging = localStorage.getItem('GTB_INCLUDE_LAGGING') !== '0';
    var groups = [
        { key: '915', label: '9:15 opening candle', leading: true, items: [
            ['All F&O (weighted bull/bear ratio)', ALL_9_15_CLOSE_SCORE], ['NIFTY 50', NIFTY_50_9_15_CLOSE_SCORE], ['NIFTY BANK', NIFTY_BANK_9_15_CLOSE_SCORE],
            ['GIFT NIFTY', GIFT_NIFTY_9_15_CLOSE_SCORE], ['SENSEX', SENSEX_9_15_CLOSE_SCORE], ['RELIANCE', RELIANCE_9_15_CLOSE_SCORE], ['HDFCBANK', HDFCBANK_9_15_CLOSE_SCORE]] },
        { key: 'ad', label: 'Advance / Decline (spot breadth)', leading: true, items: [
            ['All F&O', ALL_ADVANCE_DECLINE_SCORE], ['NIFTY 50', NIFTY_50_ADVANCE_DECLINE_SCORE], ['NIFTY BANK', NIFTY_BANK_ADVANCE_DECLINE_SCORE]] },
        { key: 'fut', label: 'Futures trend (constituent breadth)', leading: true, items: [
            ['All F&O', ALL_FUTURES_TREND_SCORE], ['NIFTY 50', NIFTY_50_FUTURES_TREND_SCORE], ['NIFTY BANK', NIFTY_BANK_FUTURES_TREND_SCORE]] },
        { key: 'oi', label: 'OI / OBV', leading: false, items: [
            ['NIFTY 50', NIFTY_50_OI_OBV_SCORE], ['NIFTY BANK', NIFTY_BANK_OI_OBV_SCORE], ['RELIANCE', RELIANCE_OI_OBV_SCORE], ['HDFCBANK', HDFCBANK_OI_OBV_SCORE], ['ICICIBANK', ICICIBANK_OI_OBV_SCORE]] },
        { key: 'mp', label: 'Max Pain gravity', leading: false, items: [
            ['NIFTY 50', NIFTY_50_MAX_PAIN_SCORE], ['NIFTY BANK', NIFTY_BANK_MAX_PAIN_SCORE], ['RELIANCE', RELIANCE_MAX_PAIN_SCORE], ['HDFCBANK', HDFCBANK_MAX_PAIN_SCORE], ['ICICIBANK', ICICIBANK_MAX_PAIN_SCORE]] },
        { key: 'iv', label: 'IV skew', leading: false, items: [
            ['NIFTY 50', NIFTY_50_IV_SKEW_SCORE], ['NIFTY BANK', NIFTY_BANK_IV_SKEW_SCORE], ['RELIANCE', RELIANCE_IV_SKEW_SCORE], ['HDFCBANK', HDFCBANK_IV_SKEW_SCORE], ['ICICIBANK', ICICIBANK_IV_SKEW_SCORE]] },
        { key: 'comp', label: 'Component score (top-10 weighted constituents)', leading: false, items: [
            ['NIFTY 50 components', NIFTY_50_COMPONENT_SCORE], ['NIFTY BANK components', NIFTY_BANK_COMPONENT_SCORE]] },
    ];
    var leading = 0, lagging = 0, flat = [];
    groups.forEach(function (g) {
        g.sum = 0;
        g.items = g.items.map(function (it) { var v = _bfNum(it[1]) || 0; g.sum += v; flat.push({ group: g.label, label: it[0], val: v, leading: g.leading }); return { label: it[0], val: v }; });
        g.sum = parseFloat(g.sum.toFixed(2));
        if (g.leading) leading += g.sum; else lagging += g.sum;
    });
    leading = parseFloat(leading.toFixed(2)); lagging = parseFloat(lagging.toFixed(2));
    var total = parseFloat((leading + (includeLagging ? lagging : 0)).toFixed(2));
    flat.sort(function (a, b) { return Math.abs(b.val) - Math.abs(a.val); });
    return { groups: groups, leading: leading, lagging: lagging, includeLagging: includeLagging, total: total,
             contributors: flat.filter(function (x) { return Math.abs(x.val) >= 0.5; }).slice(0, 8) };
}

// Score bands — identical to getMarketSignal's thresholds (recalibrated v26.31).
var _BF_BANDS = [
    { min: 8,    name: 'STRONG BUY' }, { min: 4, name: 'BUY' }, { min: 1.5, name: 'WAIT (mild bullish lean)' },
    { min: -1.5, name: 'SIDEWAYS' }, { min: -4, name: 'WAIT (mild bearish lean)' }, { min: -8, name: 'SELL' },
];
function _bfBandInfo(total) {
    var thresholds = [8, 4, 1.5, -1.5, -4, -8];
    var up = null, down = null;
    thresholds.forEach(function (t) { if (t > total && (up === null || t < up)) up = t; if (t <= total && (down === null || t > down)) down = t; });
    return { up: up, down: down, toUp: up === null ? null : parseFloat((up - total).toFixed(2)), toDown: down === null ? null : parseFloat((total - down).toFixed(2)) };
}

// ── price frame + level ladder ───────────────────────────────────────────────────────────
function _bfPriceFrame(name, sm) {
    var pf = { name: name, ok: false, isMcx: false, levels: {} };
    try { pf.isMcx = _gtbIsMcxFuture(name); } catch (e) {}
    if (pf.isMcx) {
        var sd = sm.strikeMap;
        var ltp = _bfNum(sm.mcxLtp), open = _bfNum(sm.open);
        if (!sd || ltp === null) return pf;
        pf.ltp = ltp; pf.open = open; pf.prevClose = null;
        pf.changePct = open ? (ltp - open) / open * 100 : null; pf.changeBasis = 'today\'s open';
        pf.gapPct = null;
        pf.levels = { aso: _bfNum(sd.ustrikeOne), ast: _bfNum(sd.ustrikeTwo), bso: _bfNum(sd.bstrikeOne), bst: _bfNum(sd.bstrikeTwo), vixu: _bfNum(sd.vixDDUpper), vixl: _bfNum(sd.vixDDLower) };
        pf.vixRange = (pf.levels.vixu != null && pf.levels.vixl != null) ? (pf.levels.vixu - pf.levels.vixl) : null;
    } else {
        var tr = generateTrend(name);
        pf.ltp = _bfNum(tr.ltp); pf.open = _bfNum(tr.open); pf.prevClose = _bfNum(tr.prevPrice);
        pf.changePct = _bfNum(tr.change); pf.changeBasis = 'previous close'; pf.gapPct = _bfNum(tr.open_perc);
        var s = tr.strikeData || {};
        pf.levels = { aso: _bfNum(s.ustrikeOne), ast: _bfNum(s.ustrikeTwo), bso: _bfNum(s.bstrikeOne), bst: _bfNum(s.bstrikeTwo),
                      vixu: _bfNum((tr.vix || {}).vixDDUpper), vixl: _bfNum((tr.vix || {}).vixDDLower) };
        pf.vixRange = _bfNum((tr.vix || {}).vixDDRange);
        pf.trends = tr.trends || [];
        pf.volume = _bfNum(tr.volume); pf.avgVolume = _bfNum(tr.avg_volume);
    }
    pf.ok = pf.ltp !== null;
    if (!pf.ok) return pf;

    var L = pf.levels, p = pf.ltp;
    if (L.vixu !== null && p >= L.vixu) pf.zone = 'VIXU';
    else if (L.ast !== null && p >= L.ast) pf.zone = 'AST';
    else if (L.aso !== null && p >= L.aso) pf.zone = 'ASO';
    else if (L.vixl !== null && p <= L.vixl) pf.zone = 'VIXL';
    else if (L.bst !== null && p <= L.bst) pf.zone = 'BST';
    else if (L.bso !== null && p <= L.bso) pf.zone = 'BSO';
    else pf.zone = 'MID';

    var ladder = [];
    function add(k, v, d) { if (v !== null && v !== undefined) ladder.push({ key: k, val: v, desc: d }); }
    add('VIXU', L.vixu, 'VIX-implied upper edge of today\'s expected range');
    add('AST', L.ast, 'above-strike-two — strong upside extension');
    add('ASO', L.aso, 'above-strike-one — bullish breakout level');
    add('OPEN', pf.open, 'today\'s open');
    add('PREV', pf.prevClose, 'previous close');
    add('BSO', L.bso, 'below-strike-one — bearish breakdown level');
    add('BST', L.bst, 'below-strike-two — strong downside extension');
    add('VIXL', L.vixl, 'VIX-implied lower edge of today\'s expected range');
    ladder.sort(function (a, b) { return b.val - a.val; });
    pf.ladder = ladder;
    pf.above = null; pf.below = null;
    ladder.forEach(function (x) {
        if (x.val > p && (pf.above === null || x.val < pf.above.val)) pf.above = x;
        if (x.val < p && (pf.below === null || x.val > pf.below.val)) pf.below = x;
    });
    if (pf.above) { pf.above.pts = pf.above.val - p; pf.above.pct = pf.above.pts / p * 100; }
    if (pf.below) { pf.below.pts = p - pf.below.val; pf.below.pct = pf.below.pts / p * 100; }
    // Where inside the VIX-implied daily range price currently sits (0% = at the lower edge, 100% = upper).
    pf.rangePos = (L.vixu !== null && L.vixl !== null && L.vixu > L.vixl) ? (p - L.vixl) / (L.vixu - L.vixl) * 100 : null;
    return pf;
}

// ── one instrument, everything the app knows about it ────────────────────────────────────
function _bfInstrument(name, b915) {
    var I = { name: name, isMcx: false, hasOi: false, missing: [] };
    try { I.isMcx = _gtbIsMcxFuture(name); } catch (e) {}
    var sm = INSTRUMENT_SCORE_MAP[name] || {};
    I.isIndex = !!_BF_INDEX_NAMES[name];
    I.w50 = (typeof NIFTY_50_WEIGHTED_STOCKS !== 'undefined' && NIFTY_50_WEIGHTED_STOCKS[name] != null) ? parseFloat(NIFTY_50_WEIGHTED_STOCKS[name]) : null;
    I.wbn = (typeof NIFTY_BANK_WEIGHTED_STOCKS !== 'undefined' && NIFTY_BANK_WEIGHTED_STOCKS[name] != null) ? parseFloat(NIFTY_BANK_WEIGHTED_STOCKS[name]) : null;

    try { I.pf = _bfPriceFrame(name, sm); } catch (e) { I.pf = { ok: false, levels: {} }; }
    if (!I.pf.ok) I.missing.push('price / strike levels');

    try { I.cs = computeInstrumentScore(name); } catch (e) { I.cs = null; }
    var z = b915 && b915[name] ? b915[name].CLOSE_9_15 : null;
    I.zone915 = z || null;
    if (!I.zone915) I.missing.push('9:15 zone');

    // futures
    I.fut = { remark: sm.futures_trend_remark || null, score: (sm.futures_trend !== undefined ? sm.futures_trend : null), acc: null };
    if (I.fut.remark && sm.futAccMap && sm.futAccMap[I.fut.remark] && sm.futAccMap[I.fut.remark].total) {
        var a = sm.futAccMap[I.fut.remark];
        I.fut.acc = { total: a.total, hits: a.hits, win: a.hits / a.total, avgPts: (a.pts !== undefined ? a.pts / a.total : null), avgEodPts: (a.eodPts !== undefined ? a.eodPts / a.total : null) };
    }
    if (!I.fut.remark) I.missing.push('futures REMARK');

    // options structure
    var od = sm.oiData;
    if (od && od.tableData && od.tableData.length) {
        I.hasOi = true;
        var spotOi = 0; od.tableData.forEach(function (it) { if (it['ATM_STRIKE']) spotOi = parseFloat(it['STRIKE']) || 0; });
        var ex = sm.oiExtras || {};
        I.oi = {
            spot: spotOi, strikes: od.tableData.length,
            pcr: _bfNum(od.pcr != null ? od.pcr : sm.pcr), chPcr: _bfNum(od.chPcr != null ? od.chPcr : sm.chPcr),
            oiWall: _bfNum(od.oiWall), obvFlow: _bfNum(od.obvFlow), conflicts: _bfNum(od.oiConflicts),
            ivSkew: _bfNum(ex.ivSkew), atmIV: _bfNum(ex.atmIV), oiConc: ex.oiConcentration, volRatio: _bfNum(ex.volRatio),
            oiVelocity: ex.oiVelocity || null, mpConv: ex.mpConvergence || null,
            ageMin: ex.fetchedAt ? Math.max(0, Math.round((Date.now() - ex.fetchedAt) / 60000)) : null,
            score: I.cs ? I.cs.oi_obv : null,
        };
        var pc = I.pf.changePct || 0;
        try { I.walls = _gtbFindWalls(od.tableData, pc, spotOi); } catch (e) { I.walls = { resistance: [], support: [] }; }
        try { I.building = _gtbWallVelocity(od.tableData, spotOi).building; } catch (e) { I.building = []; }
        try { I.eroding = _gtbWallErosion(od.tableData, I.walls).eroding; } catch (e) { I.eroding = []; }
        try { I.mpd = _gtbComputeMaxPainGEX(name); } catch (e) { I.mpd = null; }
        if (I.mpd) {
            try { I.mpOutcome = _gtbMaxPainOutcome(I.mpd); } catch (e) { I.mpOutcome = null; }
            try { I.flowVsPull = _gtbFlowVsPullConflict(name, I.mpd); } catch (e) { I.flowVsPull = null; }
        }
        try { I.touched = _gtbLevelsTouchedToday(name); } catch (e) { I.touched = null; }
        try { I.mktProfile = _gtbMarketProfile(od.spotCandles); } catch (e) { I.mktProfile = null; }
        if (od.spotCandles && od.spotCandles.length) {
            var hi = -Infinity, lo = Infinity;
            od.spotCandles.forEach(function (c) { var h = parseFloat(c[2]), l = parseFloat(c[3]); if (h > hi) hi = h; if (l < lo) lo = l; });
            if (isFinite(hi) && isFinite(lo)) { I.dayHigh = hi; I.dayLow = lo; }
        }
    } else {
        I.walls = { resistance: [], support: [] }; I.building = []; I.eroding = [];
        I.missing.push('OI / OBV chain');
    }
    try { I.fvo = _gtbFuturesOIConflict(name); } catch (e) { I.fvo = null; }
    try { I.ofi = _gtbOrderFlowImbalance(name); } catch (e) { I.ofi = null; }
    try { I.lp = _gtbLevelProb(name); } catch (e) { I.lp = null; }
    try { I.deadZone = _gtbDeadZone(name); } catch (e) { I.deadZone = null; }
    try { I.sc = _gtbShortCoveringSignal(name); } catch (e) { I.sc = null; }
    try { I.dte = _gtbDaysToExpiry(name); } catch (e) { I.dte = null; }
    I.curve = sm.curveState || null;
    try { I.consensus = _gtbMasterConsensus(name); } catch (e) { I.consensus = null; I.missing.push('Master Consensus'); }
    if (I.hasOi) {
        try {
            var pcx = I.pf.changePct || 0;
            var v = _cmdBuildVerdict(name, od, pcx, I.mpd);
            I.verdict = v; I.hc = _gtbIsHighConviction(v);
        } catch (e) { I.verdict = null; I.hc = false; }
    }
    return I;
}

// ── universe ─────────────────────────────────────────────────────────────────────────────
function _bfUniverse() {
    var names = _BF_CORE_NAMES.slice();
    function addAll(list) { list.forEach(function (n) { if (names.indexOf(n) === -1) names.push(n); }); }
    try { addAll(Object.keys(NIFTY_50_WEIGHTED_STOCKS || {})); } catch (e) {}
    try { addAll(Object.keys(NIFTY_BANK_WEIGHTED_STOCKS || {})); } catch (e) {}
    try { addAll((COMMODITIES_FUTURE_INSTRUMENT_LIST || []).map(function (f) { return f.name; })); } catch (e) {}
    return names;
}

// ── market-wide collectors ───────────────────────────────────────────────────────────────
function _bfVix() {
    var v = null;
    try { v = _bfNum((_btLtps()['INDIA VIX'] || {}).ltp); } catch (e) {}
    var regime, mod, note;
    if (!v) { regime = 'NO DATA'; mod = 1.0; note = 'India VIX LTP is not cached yet.'; }
    else if (v < 13) { regime = 'LOW'; mod = 1.15; note = 'Low VIX — trend days are more likely and signals are amplified.'; }
    else if (v < 18) { regime = 'NORMAL'; mod = 1.0; note = 'Normal VIX — balanced conviction.'; }
    else if (v < 25) { regime = 'ELEVATED'; mod = 0.85; note = 'Elevated VIX — wider swings, conviction reduced.'; }
    else if (v < 30) { regime = 'HIGH'; mod = 0.65; note = 'High VIX — choppy; conviction heavily reduced.'; }
    else { regime = 'EXTREME'; mod = 0.65; note = 'Extreme VIX (≥30) — the Trade Verdict engine treats this as a hard NO TRADE gate.'; }
    return { ltp: v, regime: regime, mod: mod, note: note };
}

function _bfBreadth(S) {
    var out = { ad: null, n50: null, bn: null, b915: null, impact: null };
    out.ad = { score: _bfNum(ALL_ADVANCE_DECLINE_SCORE), sample: _bfNum(ALL_ADVANCE_DECLINE_SAMPLE), universe: _bfNum(ALL_ADVANCE_DECLINE_UNIVERSE) };
    var det = (typeof window !== 'undefined' && window._GTB_AD_DETAIL) ? window._GTB_AD_DETAIL : null;
    function pack(d) {
        if (!d) return null;
        var byLtp = function (arr) { return (arr || []).slice(0, 6).map(function (x) { return x.name; }); };
        return { adv: d.adv, dec: d.dec, total: d.total, neutral: (d.neutralNames || []).length, advNames: byLtp(d.advNames), decNames: byLtp(d.decNames) };
    }
    out.n50 = pack(det && det.N50); out.bn = pack(det && det.BN);
    // 9:15 breakout tallies across the same lists the Overview tile uses
    try {
        var b = S.b915 || {};
        function cnt(list) { var a = 0, r = 0, n = 0; (list || []).forEach(function (nm) { var c = (b[nm] || {}).CLOSE_9_15; if (!c) return; n++; if (c === 'ASO' || c === 'AST') a++; else if (c === 'BSO' || c === 'BST') r++; }); return { up: a, down: r, scanned: n }; }
        out.b915 = { n50: cnt(typeof NIFTY_50_LIST !== 'undefined' ? NIFTY_50_LIST : []), bn: cnt(typeof NIFTY_BANK_LIST !== 'undefined' ? NIFTY_BANK_LIST : []), all: cnt(Object.keys(b)) };
    } catch (e) {}
    // Index Impact — weight% × price change% for the top-10 weighted names (the same
    // arithmetic as the Signals tab's Index Impact column), so the briefing can say who is
    // actually moving each index and how much of the index that slice covers.
    function impactFor(indexName, wMap) {
        var rows = [], cover = 0, net = 0;
        Object.keys(wMap || {}).forEach(function (nm) {
            var w = parseFloat(wMap[nm]) || 0; if (!w) return;
            var ch = null; try { ch = _bfNum(generateTrend(nm).change); } catch (e) {}
            if (ch === null) return;
            var imp = w * ch / 100; cover += w; net += imp;
            rows.push({ name: nm, weight: w, chg: ch, impact: imp });
        });
        rows.sort(function (a, b) { return Math.abs(b.impact) - Math.abs(a.impact); });
        var idxChg = null; try { idxChg = _bfNum(generateTrend(indexName).change); } catch (e) {}
        return { index: indexName, rows: rows, coverage: cover, net: net, indexChange: idxChg };
    }
    try { out.impact = { n50: impactFor('NIFTY 50', NIFTY_50_WEIGHTED_STOCKS), bn: impactFor('NIFTY BANK', NIFTY_BANK_WEIGHTED_STOCKS) }; } catch (e) {}
    try { out.wtc = { n50: _gtbWeightedTrendConfirmation('NIFTY 50'), bn: _gtbWeightedTrendConfirmation('NIFTY BANK') }; } catch (e) {}
    return out;
}

// Same overall-outcome arithmetic as _gtbMasterConsensusAllRowsHtml (index 3x, breadth 1x,
// only instruments with a real vote count) — recomputed here from the already-built map so the
// briefing and the Dashboard card can never disagree.
function _bfConsensusOverview(map) {
    var names = ['NIFTY 50', 'NIFTY BANK'];
    try { names = names.concat(Object.keys(NIFTY_50_WEIGHTED_STOCKS || {})).concat(Object.keys(NIFTY_BANK_WEIGHTED_STOCKS || {})); } catch (e) {}
    var seen = {}; names = names.filter(function (n) { return seen[n] ? false : (seen[n] = true); });
    var all = [], w = 0, sum = 0;
    names.forEach(function (n) {
        var c = map[n]; if (!c) return; all.push(c);
        if (c.voting === 0) return;
        var wt = (n === 'NIFTY 50' || n === 'NIFTY BANK') ? 3 : 1;
        w += wt; sum += c.net * wt;
    });
    var net = w > 0 ? sum / w : 0;
    var outcome = w === 0 ? 'WAIT — No Data' : net > 0.2 ? 'GO LONG' : net < -0.2 ? 'GO SHORT' : 'WAIT';
    var idxDir = 0;
    ['NIFTY 50', 'NIFTY BANK'].forEach(function (n) { var c = map[n]; if (c && c.voting > 0) idxDir += c.net > 0 ? 1 : c.net < 0 ? -1 : 0; });
    var ovDir = net > 0.2 ? 1 : net < -0.2 ? -1 : 0;
    var caution = idxDir !== 0 && ovDir !== 0 && ((idxDir > 0) !== (ovDir > 0));
    var longs = all.filter(function (c) { return c.outcome === 'GO LONG'; }).sort(function (a, b) { return b.net - a.net; });
    var shorts = all.filter(function (c) { return c.outcome === 'GO SHORT'; }).sort(function (a, b) { return a.net - b.net; });
    var dead = all.filter(function (c) { return !!c.deadZone; });
    return { net: net, outcome: outcome, caution: caution, indexDir: idxDir, count: all.length, longs: longs, shorts: shorts,
             waits: all.length - longs.length - shorts.length, dead: dead, weightedInstruments: w };
}

// ── opportunity engine ───────────────────────────────────────────────────────────────────
// Ranks every instrument's LONG/SHORT case using ONLY the outputs the app already computes.
// The 0-100 "opportunity score" is deliberately a plain additive tally and every component is
// recorded in `parts`, so the UI can show exactly why something ranked where it did — it is a
// prioritisation aid, not a fitted probability of winning.
function _bfSizing(name, entry, stop, mult) {
    var capital = 0, riskPct = 1;
    try { capital = parseFloat(MARGIN) || 0; } catch (e) {}
    try { riskPct = parseFloat(RISK_PCT_PER_TRADE) || 1; } catch (e) {}
    var risk = capital * riskPct / 100, per = Math.abs(entry - stop);
    var lot = 1; try { lot = _gtbLotSizeFor(name); } catch (e) {}
    if (!capital) return { ok: false, reason: 'Account capital is not set (Settings → Market Trend Settings), so no position size can be computed.' };
    if (!per || !isFinite(per)) return { ok: false, reason: 'Stop distance is zero.' };
    var rawUnits = risk / per, units = Math.floor(rawUnits * mult);
    var lots = lot > 1 ? Math.floor(units / lot) : units;
    return { ok: true, capital: capital, riskPct: riskPct, riskAmt: risk, perUnit: per, lot: lot, mult: mult, units: units, lots: lots,
             oneLotRisk: lot > 1 ? lot * per : per, tooSmall: (lot > 1 ? lots < 1 : units < 1) };
}

function _bfPlanFor(I, dir) {
    var pf = I.pf; if (!pf || !pf.ok) return null;
    var ltp = pf.ltp, L = pf.levels, plan = { dir: dir, source: 'derived', notes: [] };
    var res = (I.walls && I.walls.resistance && I.walls.resistance[0]) ? I.walls.resistance[0].strike : null;
    var sup = (I.walls && I.walls.support && I.walls.support[0]) ? I.walls.support[0].strike : null;
    var res2 = (I.walls && I.walls.resistance && I.walls.resistance[1]) ? I.walls.resistance[1].strike : null;
    var sup2 = (I.walls && I.walls.support && I.walls.support[1]) ? I.walls.support[1].strike : null;
    var mpK = I.mpd ? I.mpd.maxPainK : null;
    var cand = [];
    function push(v, label) { if (v !== null && v !== undefined && isFinite(v)) cand.push({ v: v, label: label }); }
    push(L.vixu, 'VIXU'); push(L.ast, 'AST'); push(L.aso, 'ASO'); push(pf.open, 'open'); push(pf.prevClose, 'prev close');
    push(L.bso, 'BSO'); push(L.bst, 'BST'); push(L.vixl, 'VIXL'); push(res, 'R1 wall'); push(res2, 'R2 wall'); push(sup, 'S1 wall'); push(sup2, 'S2 wall');
    var trade = I.verdict && I.verdict.trade ? I.verdict.trade : null;
    var entry, entryLabel, stop, t1, t1Label, t2 = null, t2Label = null;
    if (trade && ((dir > 0 && /LONG/.test(trade.dir)) || (dir < 0 && /SHORT/.test(trade.dir)))) {
        plan.source = 'verdict'; entry = parseFloat(trade.entry); stop = parseFloat(trade.stop); t1 = parseFloat(trade.target);
        entryLabel = (dir > 0 ? 'S1 wall ' : 'R1 wall ') + _bfFmt(entry, 0); t1Label = 'Verdict target';
    } else {
        var below = cand.filter(function (c) { return c.v <= ltp; }).sort(function (a, b) { return b.v - a.v; });
        var above = cand.filter(function (c) { return c.v >= ltp; }).sort(function (a, b) { return a.v - b.v; });
        if (dir > 0) {
            var e = (sup !== null && sup <= ltp) ? { v: sup, label: 'S1 wall' } : (below[0] || { v: ltp, label: 'spot' });
            entry = e.v; entryLabel = e.label + ' ' + _bfFmt(entry, 0);
        } else {
            var e2 = (res !== null && res >= ltp) ? { v: res, label: 'R1 wall' } : (above[0] || { v: ltp, label: 'spot' });
            entry = e2.v; entryLabel = e2.label + ' ' + _bfFmt(entry, 0);
        }
        var sd = Math.max(entry * 0.004, 1);   // same 0.4% convention _cmdBuildVerdict uses
        stop = dir > 0 ? entry - sd : entry + sd;
        var tc = dir > 0 ? cand.filter(function (c) { return c.v > entry + sd; }).sort(function (a, b) { return a.v - b.v; })
                         : cand.filter(function (c) { return c.v < entry - sd; }).sort(function (a, b) { return b.v - a.v; });
        if (tc[0]) { t1 = tc[0].v; t1Label = tc[0].label; } else { t1 = dir > 0 ? entry + sd * 2 : entry - sd * 2; t1Label = '2R projection'; }
        if (tc[1]) { t2 = tc[1].v; t2Label = tc[1].label; }
    }
    if (mpK !== null && ((dir > 0 && mpK > t1) || (dir < 0 && mpK < t1))) { t2 = mpK; t2Label = 'Max Pain'; }
    var distPct = Math.abs(ltp - entry) / ltp * 100;
    var risk = Math.abs(entry - stop);
    plan.entry = entry; plan.entryLabel = entryLabel; plan.stop = stop; plan.t1 = t1; plan.t1Label = t1Label; plan.t2 = t2; plan.t2Label = t2Label;
    plan.distPct = distPct; plan.atLevel = distPct <= 0.35;
    plan.rr1 = risk > 0 ? Math.abs(t1 - entry) / risk : null;
    plan.rr2 = (risk > 0 && t2 !== null) ? Math.abs(t2 - entry) / risk : null;
    return plan;
}

function _bfBuildOpportunities(S) {
    var out = [];
    var mktDir = 0;
    if (S.signal && S.signal.signal) { var sg = S.signal.signal; mktDir = /BUY/.test(sg) ? 1 : /SELL/.test(sg) ? -1 : 0; }
    Object.keys(S.instr).forEach(function (name) {
        var I = S.instr[name]; if (!I || !I.pf || !I.pf.ok || !I.consensus) return;
        var c = I.consensus, v = I.verdict || null, cs = I.cs || { total: 0 };
        var cDir = c.outcome === 'GO LONG' ? 1 : c.outcome === 'GO SHORT' ? -1 : 0;
        var vDir = v && v.label ? (/^LONG/.test(v.label) ? 1 : /^SHORT/.test(v.label) ? -1 : 0) : 0;
        var dir = cDir !== 0 ? cDir : vDir;
        if (dir === 0) return;
        var parts = [], score = 0, pros = [], cons = [];
        function add(label, pts, tone, text) { pts = Math.round(pts * 10) / 10; if (!pts) return; parts.push({ label: label, pts: pts }); score += pts; if (text) (tone === 'bad' ? cons : pros).push(text); }

        var consPts = Math.min(1, Math.abs(c.net)) * 30 * (c.thin ? 0.6 : 1);
        if (cDir === dir) add('Master Consensus ' + c.outcome + ' (net ' + _bfSg(c.net, 2) + (c.thin ? ', thin ×0.6' : '') + ')', consPts, 'good', c.agree + ' of ' + c.voting + ' voting engines agree (weighted net ' + _bfSg(c.net, 2) + ')' + (c.thin ? ' — but the call rides on very few votes' : ''));
        else if (cDir === 0 && vDir === dir) add('Direction taken from the trade-verdict bias only (consensus is neutral)', 6, 'good', 'Master Consensus itself is neutral; direction comes from the Context/Location/Confirmation verdict');
        if (c.voting >= 4) add('Broad agreement (≥4 engines voting)', 6, 'good', null); else if (c.voting >= 3) add('Moderate agreement (3 engines voting)', 3, 'good', null);

        if (v && v.trade && vDir === dir) add('Verdict is actionable now (spot at a wall, signals agree)', 25, 'good', 'Trade verdict is ' + v.label + ' with spot at its wall — entry/stop/target already defined');
        else if (vDir === dir) add('Verdict shows the bias but says WAIT', 8, 'good', 'Verdict bias agrees (' + v.label + ') but location/confirmation is not there yet');
        else if (vDir !== 0 && vDir !== dir) add('Verdict points the OTHER way', -15, 'bad', 'Trade verdict is ' + v.label + ' — opposite to the consensus direction');
        if (I.hc && vDir === dir) add('★ High-conviction screen passed', 12, 'good', 'Passes the stricter High-Conviction screen (score well past threshold, spot at the wall, live order flow agreeing)');

        var csAlign = Math.min(Math.abs(cs.total), 8) / 8 * 10 * (_bfSign(cs.total) === dir ? 1 : _bfSign(cs.total) === 0 ? 0 : -1);
        if (csAlign) add('Composite score ' + _bfSg(cs.total, 1) + (csAlign > 0 ? ' aligned' : ' against'), csAlign, csAlign > 0 ? 'good' : 'bad', 'Instrument composite score ' + _bfSg(cs.total, 1) + (csAlign > 0 ? ' supports the direction' : ' contradicts the direction'));
        if (I.lp && I.lp.ok) { var lpPts = dir * I.lp.netDir * 8; if (lpPts) add('Level probability lean ' + _bfSg(I.lp.netDir, 2), lpPts, lpPts > 0 ? 'good' : 'bad', 'Level-probability net lean ' + _bfSg(I.lp.netDir, 2) + (lpPts > 0 ? ' favours this side' : ' favours the other side')); }
        if (I.sc && I.sc.active) {
            var scDir = I.sc.type === 'SHORT_COVERING' ? 1 : -1;
            if (scDir === dir) add((I.sc.type === 'SHORT_COVERING' ? 'Short covering' : 'Long unwinding') + ' firing (' + I.sc.probability + '%)', I.sc.probability >= 65 ? 12 : 6, 'good', (I.sc.type === 'SHORT_COVERING' ? 'Short covering' : 'Long unwinding') + ' is actively firing (' + I.sc.probability + '% squeeze probability' + (I.sc.nearExpiry ? ', ' + I.sc.daysToExpiry + 'd to expiry' : '') + ')');
            else add('Squeeze signal against the trade', -6, 'bad', (I.sc.type === 'SHORT_COVERING' ? 'Short covering' : 'Long unwinding') + ' is firing in the opposite direction');
        }
        if (v && v.raw) {
            if (v.raw.ofiOk === true) add('Live order flow agrees', 6, 'good', 'Live resting-order flow agrees with the direction');
            else if (v.raw.ofiOk === false) add('Live order flow disagrees', -10, 'bad', 'Live resting-order flow is fighting the setup');
            if (v.raw.fvo) add('Futures vs OI/OBV disagree', -8, 'bad', 'Futures trend and option-chain OI/OBV disagree — unconfirmed / early');
        }
        if (I.flowVsPull) add('Flow vs Max-Pain pull conflict', -3, 'bad', 'Max-Pain pull points against today\'s flow (treat it as a target level, not a reason to fade the flow)');
        if (c.deadZone) add('Dead zone (weak conviction band)', -25, 'bad', 'Spot is inside a dead zone (' + _bfFmt(c.deadZone.lo, 0) + '–' + _bfFmt(c.deadZone.hi, 0) + ') where signals disagree — wait for a break');
        if (mktDir !== 0 && !I.isIndex && !I.isMcx) { if (mktDir === dir) add('With the market signal', 6, 'good', 'Trades with the overall market signal (' + S.signal.signal + ')'); else add('Against the market signal', -8, 'bad', 'Fights the overall market signal (' + S.signal.signal + ') — counter-trend'); }
        if (I.eroding && I.eroding.length && I.hasOi) {
            var need = dir > 0 ? 'S' : 'R';
            var er = I.eroding.filter(function (e) { return e.side === need; })[0];
            if (er) add('The wall this trade leans on is eroding', -8, 'bad', (dir > 0 ? 'Support' : 'Resistance') + ' at ' + _bfFmt(er.strike, 0) + ' is eroding (writers covering ' + er.multiple.toFixed(1) + '× their normal pace)');
        }
        score = Math.max(0, Math.min(100, Math.round(score)));
        var plan = _bfPlanFor(I, dir);
        var actionable = !!(v && v.trade && vDir === dir);
        var tier = score >= 65 && actionable ? 'A' : score >= 45 ? 'B' : score >= 28 ? 'C' : 'D';
        if (tier === 'D') return;
        var mult = c.deadZone || c.voting === 0 ? 0 : c.thin ? 0.5 : 1;
        var size = plan ? _bfSizing(name, plan.entry, plan.stop, mult) : null;
        out.push({ name: name, dir: dir, score: score, tier: tier, actionable: actionable, parts: parts, pros: pros, cons: cons,
                   plan: plan, size: size, consensus: c, verdict: v, hc: !!I.hc, I: I });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
}

// ── master collector ─────────────────────────────────────────────────────────────────────
function _bfCollect() {
    var gaps = [];
    var S = { v: 1, ts: Date.now(), gaps: gaps, instr: {}, consensusMap: {} };
    S.clock = _bfTry(gaps, 'clock', _bfClock, null) || { real: moment(), minutes: 0, hhmm: '—', source: 'unknown', isReplay: false, curDay: '', weekend: false };
    S.window = _bfWindow(S.clock.minutes, S.clock.weekend);
    S.b915 = _bfTry(gaps, '9:15 zone cache', function () { return JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}'); }, {});
    S.score = _bfTry(gaps, 'composite score', _bfScoreParts, null);
    if (S.score) S.band = _bfBandInfo(S.score.total);
    S.signal = S.score ? _bfTry(gaps, 'market signal', function () { return getMarketSignal(S.score.total, S.b915); }, null) : null;
    S.pattern915 = _bfTry(gaps, '9:15 index pattern', function () {
        var z = function (n) { return (S.b915[n] && S.b915[n].CLOSE_9_15) || 'B/W'; };
        return { nifty: z('NIFTY 50'), sensex: z('SENSEX'), bank: z('NIFTY BANK'), gift: z('GIFT NIFTY'), trade: getTradeSignal(z('NIFTY 50'), z('SENSEX'), z('NIFTY BANK')) };
    }, null);
    S.confluence = S.score ? _bfTry(gaps, 'entry confluence', function () { return getEntryConfluence(S.score.total); }, null) : null;
    S.exitSig = _bfTry(gaps, 'exit signals', function () { return { long: checkExitSignal('LONG'), short: checkExitSignal('SHORT') }; }, null);
    S.vix = _bfVix();

    _bfUniverse().forEach(function (n) { S.instr[n] = _bfTry(gaps, 'instrument ' + n, function () { return _bfInstrument(n, S.b915); }, { name: n, isMcx: false, hasOi: false, missing: ['everything'], pf: { ok: false }, fut: {} }); if (S.instr[n].consensus) S.consensusMap[n] = S.instr[n].consensus; });
    S.consensus = _bfTry(gaps, 'consensus overview', function () { return _bfConsensusOverview(S.consensusMap); }, null);
    S.breadth = _bfTry(gaps, 'breadth', function () { return _bfBreadth(S); }, null);

    S.fg = _bfTry(gaps, 'Fear & Greed', function () {
        var d = _gtbFearGreedComponents();
        return { parts: d.parts, composite: d.composite, label: _gtbFearGreedLabel(d.composite), outcome: _gtbFearGreedOutcome(d.composite) };
    }, null);
    S.trendProb = _bfTry(gaps, 'Trend Probability', function () { return _btComputeTrendProb(); }, null);
    S.futBreadth = _bfTry(gaps, 'futures breadth', function () { return { all: _bfNum(ALL_FUTURES_TREND_SCORE), n50: _bfNum(NIFTY_50_FUTURES_TREND_SCORE), bn: _bfNum(NIFTY_BANK_FUTURES_TREND_SCORE) }; }, null);

    // curve compare (only if the user has run the popup's SCAN ALL this session)
    S.curveRows = (typeof _GTB_CURVE_COMPARE_ROWS !== 'undefined' && _GTB_CURVE_COMPARE_ROWS.length) ? _GTB_CURVE_COMPARE_ROWS : null;

    // DOM-only extras (futures premium / VWAP strip, funds badge) — best effort
    S.dom = {};
    try {
        S.dom.funds = (jQ('#gtb-funds-badge').text() || '').replace(/\s+/g, ' ').trim() || null;
        ['NIFTY 50', 'NIFTY BANK'].forEach(function (n) {
            var tid = n.replace(/ /g, '-');
            var prem = (jQ('#gtb-strip-prem-' + tid).text() || '').replace(/\s+/g, ' ').trim();
            var vwap = (jQ('#gtb-strip-vwap-' + tid).text() || '').replace(/\s+/g, ' ').trim();
            if (prem || vwap) S.dom[n] = { prem: prem || null, vwap: vwap || null };
        });
    } catch (e) {}

    S.opps = _bfTry(gaps, 'opportunity ranking', function () { return _bfBuildOpportunities(S); }, []);

    // aggregate per-instrument gaps so the briefing lists coverage holes once, not 45 times
    var missMap = {};
    Object.keys(S.instr).forEach(function (n) { S.instr[n].missing.forEach(function (m) { (missMap[m] = missMap[m] || []).push(n); }); });
    S.missing = missMap;
    return S;
}

// compact snapshot used to diff one briefing against the next
function _bfSnapshot(S) {
    var snap = { ts: S.ts, hhmm: S.clock ? S.clock.hhmm : null, day: S.clock ? S.clock.curDay : null };
    snap.score = S.score ? S.score.total : null; snap.leading = S.score ? S.score.leading : null; snap.lagging = S.score ? S.score.lagging : null;
    snap.signal = S.signal ? S.signal.signal : null;
    snap.confluence = S.confluence ? S.confluence.direction + ' ' + S.confluence.bullish + '/' + S.confluence.bearish : null;
    snap.vix = S.vix ? S.vix.ltp : null;
    snap.fg = S.fg ? S.fg.composite : null;
    snap.bull = S.trendProb ? S.trendProb.bullPct : null;
    snap.cons = S.consensus ? { outcome: S.consensus.outcome, net: S.consensus.net, longs: S.consensus.longs.length, shorts: S.consensus.shorts.length } : null;
    snap.px = {}; snap.out = {};
    Object.keys(S.instr).forEach(function (n) {
        var I = S.instr[n];
        if (I.pf && I.pf.ok && (_BF_CORE_NAMES.indexOf(n) !== -1)) snap.px[n] = I.pf.ltp;
        if (I.consensus) snap.out[n] = I.consensus.outcome;
    });
    snap.opps = (S.opps || []).filter(function (o) { return o.tier === 'A' || o.tier === 'B'; }).map(function (o) { return o.name + '|' + (o.dir > 0 ? 'L' : 'S') + '|' + o.tier; });
    return snap;
}
