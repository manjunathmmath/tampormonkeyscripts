// Chart View (v29.538): one big chart per instrument with everything the Detail View says in words drawn ON the chart.
// Reads cached data only (candles, levels, OI walls, zones, dead zone, profile, verdict, probable trade); it changes no score or verdict.
// Overlay is a canvas laid over the LightweightCharts pane and redrawn when the price / time scale moves.
var _CV_LAYER_STATE = { levels: 1, walls: 1, zones: 1, profile: 1, trade: 1, range: 1, oi: 1, score: 1, fut: 1 };
var _CV_FB = {}, _CV_FUTC = {}, _CV_FUTRAW = {};      // shared by every pane: fallback candles, futures series
// View presets: how much is drawn. Clean = only the levels a trade decision needs; Standard = adds walls, zones; Full = everything.
var _CV_VIEWS = { clean: { levels: 1, walls: 1, zones: 0, range: 0, profile: 0, oi: 0, score: 1, fut: 1, trade: 1 }, standard: { levels: 1, walls: 1, zones: 1, range: 0, profile: 0, oi: 0, score: 1, fut: 1, trade: 1 }, full: { levels: 1, walls: 1, zones: 1, range: 1, profile: 1, oi: 1, score: 1, fut: 1, trade: 1 }, oiobv: { levels: 0, walls: 1, zones: 0, range: 0, profile: 0, oi: 1, score: 0, fut: 0, trade: 0 } };
function _cvApplyView(v) { if (!_CV_VIEWS[v]) v = 'clean'; _CVG.view = v; Object.keys(_CV_VIEWS[v]).forEach(function (k) { _CV_LAYER_STATE[k] = _CV_VIEWS[v][k]; }); try { localStorage.setItem('GTB_CV_VIEW', v); } catch (e) {} }
var _CVG = { view: 'clean', panes: [], layout: 1, active: 0, timer: null, slotTimer: null, stampTxt: '', updatedAt: 0, nextAt: 0, snap: undefined, pending: null };
function _cvNewCtx(nm) { return { fb: _CV_FB, futc: _CV_FUTC, futRaw: _CV_FUTRAW, name: nm, chart: null, series: null, sig: '', data: null, layers: _CV_LAYER_STATE, hits: [], root: null, det: false }; }
var _CV = _cvNewCtx('NIFTY 50');      // the pane being worked on; every function reads this
var _CV_PANE_IDS = { 'cv-chart': 1, 'cv-ov': 1, 'cv-msg': 1, 'cv-badge': 1, 'cv-checks': 1, 'cv-tip': 1 };
function _cvEl(id) { if (_CV_PANE_IDS[id] && _CV.root) return _CV.root.isConnected ? _CV.root.querySelector('#' + id) : null; return document.getElementById(id); }
var _CV_NAMES = ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'GOLDM', 'SILVERM', 'CRUDEOILM'];
var _CV_LAYERS = [['levels', 'Levels'], ['walls', 'OI walls'], ['zones', 'Zones'], ['range', 'Day range'], ['profile', 'Profile'], ['oi', 'OI flow'], ['score', 'Score'], ['fut', 'Futures'], ['trade', 'Trade']];

// Score history: the instrument's total score is stored at every full refresh (and while the popup is open, at most every 4 minutes) so the strip under the chart can show how it moved through the day.
function _cvHistKey(nm) { return 'GTB_CV_SCORE_' + (typeof CURRENT_DAY !== 'undefined' ? CURRENT_DAY : '') + '_' + nm; }
function _cvHist(nm) { try { return JSON.parse(localStorage.getItem(_cvHistKey(nm)) || '[]'); } catch (e) { return []; } }
function _cvSnapInstant(nm) {
    try { var t = _gtbHistTime(); if (!t) return null; var day = (_cvIsMcx(nm) && typeof MCX_CURRENT_DAY !== 'undefined' && MCX_CURRENT_DAY) ? String(MCX_CURRENT_DAY).slice(0, 10) : CURRENT_DAY, ms = Date.parse(day + 'T' + t + ':00+05:30'); return isFinite(ms) ? ms : null; } catch (e) { return null; }
}
// Live: one reading at most every 4 minutes. With a snapshot time set: one reading for THAT time (replacing an earlier one for the same time), so stepping through the day builds the strip.
function _cvRecord(nm) {
    try {
        var cs = computeInstrumentScore(nm); if (!cs || typeof cs.total !== 'number') return;
        var snap = _cvSnapInstant(nm), h = _cvHist(nm), now = snap || Date.now(), rec = { t: now, s: Math.round(cs.total * 100) / 100, f: cs.futures_trend || 0, o: cs.oi_obv || 0 };
        if (snap) { var same = h.filter(function (r) { return r.t === snap; })[0]; if (same && same.s === rec.s) return; h = h.filter(function (r) { return r.t !== snap; }); h.push(rec); h.sort(function (x, y) { return x.t - y.t; }); }
        else { var last = h[h.length - 1]; if (last && now - last.t < 4 * 60000) return; h.push(rec); }
        if (h.length > 400) h = h.slice(-400);
        if (typeof _gtbLsSet === 'function') _gtbLsSet(_cvHistKey(nm), JSON.stringify(h)); else localStorage.setItem(_cvHistKey(nm), JSON.stringify(h));
    } catch (e) {}
}
function _cvRecordAll() { _CV_NAMES.forEach(_cvRecord); }
// Futures read per 5-minute candle, rebuilt from the futures candles the app already fetches (same classifier the dashboard uses on each candle). Cached per instrument for 60 s.
async function _cvFutSeries(nm) {
    var c = _CV.futc && _CV.futc[nm]; if (c && c.sig === _cvSnapSig() && Date.now() - c.at < 60000) return c.rows;
    var rows = null;
    try {
        var fi = _gtbFutTokenFor(nm); if (!fi) throw 0;
        var mcx = _cvIsMcx(nm), res = await getHistoricalDataUsingPromise(fi.token, mcx ? _gtbMcxPrevDay() : PREVIOUS_DAY, mcx ? _gtbMcxCurrDayTo() : _gtbCurrDayTo(), '5minute');
        var all = (res && res.data && res.data.candles) ? res.data.candles : []; all = _gtbTrimCandlesTail(all, mcx ? MCX_CURRENT_DAY : CURRENT_DAY);      // cut only after the snapshot time; keep yesterday (its close is the classifier's baseline)
        var todayStr = all.length ? String(all[all.length - 1][0]).slice(0, 10) : '', today = all.filter(function (x) { return String(x[0]).slice(0, 10) === todayStr; }), prev = all.filter(function (x) { return String(x[0]).slice(0, 10) !== todayStr; });
        if (today.length && prev.length) {
            _CV.futRaw = _CV.futRaw || {}; _CV.futRaw[nm] = today;
            var norm = function (x) { return { open: x[1], high: x[2], low: x[3], close: x[4], volume: x[5], oi: x[6] }; }, pq = norm(prev[prev.length - 1]); rows = [];
            for (var k = 0; k < today.length; k++) { try { var sl = today.slice(0, k + 1).map(norm), r = _gtbClassifyFutures(sl[sl.length - 1], pq, fi.lot, sl, {}); rows.push({ time: Math.floor(new Date(today[k][0]).getTime() / 1000) + 19800, remark: r.remark, sc: getFuturesTrendScore(r.remark) }); } catch (e) {} }
        }
    } catch (e) { console.warn('[chart view] futures series failed for ' + nm, e); }
    if (!rows) console.warn('[chart view] no futures series for ' + nm + ' (no futures token or no candles)');
    (_CV.futc = _CV.futc || {})[nm] = { at: Date.now(), rows: rows, sig: _cvSnapSig() }; return rows;
}
// Snapshot signature: the trading day and the snapshot end time. Everything cached here is keyed by it, and a change reloads the data.
function _cvSnapSig() { try { return (typeof CURRENT_DAY !== 'undefined' ? CURRENT_DAY : '') + '|' + ((typeof _gtbHistTime === 'function' && _gtbHistTime()) || '') + '|' + ((typeof MCX_CURRENT_DAY !== 'undefined') ? MCX_CURRENT_DAY : ''); } catch (e) { return ''; } }
function _cvSnapActive() { try { return !!(_gtbHistTime && _gtbHistTime()); } catch (e) { return false; } }
// Level-based plan, used only when the dashboard's own Probable trade has nothing (for example the option chain is not loaded, so there are no OI walls or zones).
// Stop = the nearest level on the wrong side that is at least 0.6 x the recent average candle range away, plus half that range; targets = the next levels in the trade direction
// at least 1 x the risk away (else a multiple of the risk). Levels are the ones drawn on the chart. Rule of thumb, not back-tested; shown dimmed and labelled LEVEL PLAN.
// Direction for a weak-lean plan: majority of the instrument score, the futures read, price against the futures VWAP and price against the open (ties go to price against VWAP).
function _cvLean(nm, d, sm, open) {
    var sg = function (x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }, sum = 0, vw = 0;
    try { var cs = computeInstrumentScore(nm); sum += sg(cs.total); sum += sg(cs.futures_trend); } catch (e) {}
    try { var av = parseFloat(sm.avwap); if (av) { vw = sg(d.spot - av); sum += vw; } } catch (e) {}
    if (open) sum += sg(d.spot - open);
    return sum > 0 ? 1 : sum < 0 ? -1 : (vw || 1);
}
// Sanity pass on the dashboard's plan, for the chart only (the dashboard card and alerts are untouched): a stop closer than 1 average candle range is inside normal noise, so it is
// widened to 1 range; a first target farther than 4 x the risk is replaced by the nearest drawn level between 1.5 and 4 x the risk away (else 2 x the risk). Rule of thumb, not back-tested.
function _cvSanePlan(d, p) {
    try {
        var cs = d.candles, n = Math.min(14, cs.length); if (n < 3) return p;
        var atr = 0; for (var i = cs.length - n; i < cs.length; i++) atr += parseFloat(cs[i][2]) - parseFloat(cs[i][3]); atr /= n;
        var q = Object.assign({}, p), up = q.long, e = q.entryPx;
        if (q.risk < atr) { q.stop = up ? e - atr : e + atr; q.risk = atr; q.widened = true; }
        if (q.t1) {
            var L = []; d.lines.forEach(function (l) { if (l.layer !== 'range' && !/^(VIX|RANGE)/.test(l.label)) L.push(l.price); });
            L = L.filter(function (x) { return isFinite(x) && (up ? x > e : x < e); }).sort(function (a, b) { return up ? a - b : b - a; });
            if (Math.abs(q.t1.price - e) > 4 * q.risk) {
                var near = L.filter(function (x) { var dd = Math.abs(x - e); return dd >= 1.5 * q.risk && dd <= 4 * q.risk; });
                var t1 = near.length ? near[0] : (up ? e + 2 * q.risk : e - 2 * q.risk), t2 = near.length > 1 ? near[1] : (up ? e + 3 * q.risk : e - 3 * q.risk);
                q.t1 = { price: t1, items: [] }; q.t2 = { price: t2, items: [] }; q.capped = true;
            }
            q.rr = Math.abs(q.t1.price - e) / q.risk;
        }
        return q;
    } catch (err) { return p; }
}
function _cvLevelPlan(d, dir) {
    var cs = d.candles, n = Math.min(14, cs.length); if (n < 3 || !dir) return null;
    var atr = 0, hi = -Infinity, lo = Infinity; for (var i = cs.length - n; i < cs.length; i++) atr += parseFloat(cs[i][2]) - parseFloat(cs[i][3]); atr /= n;
    cs.forEach(function (c) { hi = Math.max(hi, parseFloat(c[2])); lo = Math.min(lo, parseFloat(c[3])); });
    var px = d.spot, up = dir > 0, L = [];
    d.lines.forEach(function (l) { if (l.layer !== 'range' && !/^(VIX|RANGE)/.test(l.label)) L.push(l.price); });
    L.push(hi, lo); d.bands.forEach(function (b) { if (b.label === 'VALUE AREA') { L.push(b.lo, b.hi); } });
    L = L.filter(function (x) { return isFinite(x); }).sort(function (a, b) { return a - b; });
    var wrong = L.filter(function (x) { return up ? x < px - 0.6 * atr : x > px + 0.6 * atr; }); wrong = up ? wrong.reverse() : wrong;
    var stop = wrong.length ? (up ? wrong[0] - 0.5 * atr : wrong[0] + 0.5 * atr) : (up ? px - 1.5 * atr : px + 1.5 * atr), risk = Math.abs(px - stop);
    if (!(risk > 0)) return null;
    var ahead = L.filter(function (x) { return up ? x > px + risk : x < px - risk; }); ahead = up ? ahead : ahead.reverse();
    var t1 = ahead.length ? ahead[0] : (up ? px + 1.5 * risk : px - 1.5 * risk), t2 = ahead.length > 1 ? ahead[1] : (up ? px + 2.5 * risk : px - 2.5 * risk);
    if (Math.abs(t1 - px) > 4 * risk) { t1 = up ? px + 2 * risk : px - 2 * risk; t2 = up ? px + 3 * risk : px - 3 * risk; }      // the next level is too far to be a realistic first target: use 2 x risk
    else if (Math.abs(t2 - px) > 6 * risk) t2 = up ? px + 3 * risk : px - 3 * risk;
    return { long: up, atLevel: true, entryPx: px, stop: stop, risk: risk, t1: { price: t1 }, t2: { price: t2 }, rr: Math.abs(t1 - px) / risk, fallback: true };
}
// OBV in the option chain is a list of readings; the last one is the cumulative value the dashboard charts (negative = selling volume)
function _cvObvLast(l) { try { if (Array.isArray(l)) { var o = l.length ? l[l.length - 1] : null; return parseFloat(o && o.obv) || 0; } return parseFloat(l) || 0; } catch (e) { return 0; } }
function _cvF(x) { return Math.round(x).toLocaleString('en-IN'); }
function _cvIsMcx(n) { try { return _gtbIsMcxFuture(n); } catch (e) { return false; } }

// Gathers everything to draw for one instrument. Every part is optional and wrapped, so one missing source never blanks the chart.
function _cvGather(nm) {
    var d = { nm: nm, why: {}, candles: [], lines: [], bands: [], profile: null, verdict: null, plan: null, lp: null, spot: null };
    var sm = INSTRUMENT_SCORE_MAP[nm] || {}, oi = sm.oiData, mcx = _cvIsMcx(nm);
    d.candles = (oi && oi.spotCandles && oi.spotCandles.length) ? oi.spotCandles.slice() : ((_CV.fb && _CV.fb[nm]) ? _CV.fb[nm].slice() : []);
    try { d.candles = _gtbTrimCandlesTail(d.candles, mcx ? MCX_CURRENT_DAY : CURRENT_DAY) || []; } catch (e) {}      // honour the snapshot end time even if the data was loaded for a later one
    if (d.candles.length && mcx) { var lday = String(d.candles[d.candles.length - 1][0]).slice(0, 10); d.candles = d.candles.filter(function (c) { return String(c[0]).slice(0, 10) === lday; }); }      // commodity data carries the previous session too: show only the current one
    if (!d.candles.length) return d;
    d.spot = parseFloat(d.candles[d.candles.length - 1][4]);
    var open = parseFloat(d.candles[0][1]);
    var L = function (price, label, color, o) { price = parseFloat(price); if (isFinite(price) && price > 0) d.lines.push(Object.assign({ price: price, label: label, color: color, layer: 'levels', w: 1, dash: null, tip: label }, o || {})); };
    var B = function (lo, hi, color, label, layer, tip) { lo = parseFloat(lo); hi = parseFloat(hi); if (isFinite(lo) && isFinite(hi) && hi > lo) d.bands.push({ lo: lo, hi: hi, color: color, label: label, layer: layer, tip: tip || label }); };
    var G = '#2ea043', R = '#f85149', BL = '#38bdf8', AM = '#d29922', PU = '#8b5cf6';

    // level probability tags ("ASO 62%")
    try { d.lp = _gtbLevelProb(nm); } catch (e) {}
    var pct = function (k) { return d.lp && d.lp[k] != null ? ' ' + Math.round(d.lp[k]) + '%' : ''; };

    // 9:15 strike levels, day open, VIX expected range
    var sd = null, vr = null;
    if (mcx) { var smp = sm.strikeMap; if (smp) { sd = { ustrikeOne: smp.ustrikeOne, ustrikeTwo: smp.ustrikeTwo, bstrikeOne: smp.bstrikeOne, bstrikeTwo: smp.bstrikeTwo }; vr = { lo: smp.vixDDLower, hi: smp.vixDDUpper }; open = parseFloat(sm.open) || open; } }
    else { try { var tr = generateTrend(nm); if (tr) { sd = tr.strikeData; if (tr.vix) vr = { lo: tr.vix.vixDDLower, hi: tr.vix.vixDDUpper }; } } catch (e) {} }
    if (sd) {
        L(sd.ustrikeOne, 'ASO' + pct('pASO'), G, { tip: '9:15 level ASO (above-strike open). Chance of reaching today by live signals' + pct('pASO') });
        L(sd.ustrikeTwo, 'AST' + pct('pAST'), G, { w: 2, tip: '9:15 level AST (above-strike target)' + pct('pAST') });
        L(sd.bstrikeOne, 'BSO' + pct('pBSO'), R, { tip: '9:15 level BSO (below-strike open)' + pct('pBSO') });
        L(sd.bstrikeTwo, 'BST' + pct('pBST'), R, { w: 2, tip: '9:15 level BST (below-strike target)' + pct('pBST') });
    }
    L(open, 'OPEN', AM, { dash: [2, 3], tip: 'Day open' });
    if (vr && isFinite(parseFloat(vr.lo)) && isFinite(parseFloat(vr.hi))) {
        B(vr.lo, vr.hi, 'rgba(56,189,248,0.035)', 'Expected day range', 'range', 'Expected day range from the volatility index: ' + _cvF(vr.lo) + ' - ' + _cvF(vr.hi));
        L(vr.hi, 'VIXU' + pct('pVIXU'), BL, { dash: [1, 4], layer: 'range', tip: 'Top of the expected day range' + pct('pVIXU') });
        L(vr.lo, 'VIXL' + pct('pVIXL'), BL, { dash: [1, 4], layer: 'range', tip: 'Bottom of the expected day range' + pct('pVIXL') });
    }

    if (!(oi && oi.tableData && oi.tableData.length)) { d.why.oi = 'no option chain loaded for this instrument: press Load'; d.why.walls = d.why.oi; }
    // OI flow: today's OI change per strike (calls red, puts green), drawn as small bars beside the price axis
    try { var tdo = oi && oi.tableData; if (tdo && tdo.length) { d.oi = tdo.map(function (it) { return { k: parseFloat(it['STRIKE']), ce: parseFloat(it['CHG_OI_CE']) || 0, pe: parseFloat(it['CHG_OI_PE']) || 0, oce: _cvObvLast(it['CE_OBV']), ope: _cvObvLast(it['PE_OBV']) }; }).filter(function (r) { return isFinite(r.k); }); } } catch (e) {}
    // OI walls + max pain (+ erosion)
    try {
        var td = oi && oi.tableData;
        if (td && td.length) {
            var pc = open ? (d.spot - open) / open * 100 : 0, walls = _gtbFindWalls(td, pc, d.spot), er = {};
            try { (_gtbWallErosion(td, walls).eroding || []).forEach(function (e) { er[e.side + e.strike] = 1; }); } catch (e) {}
            (walls.resistance || []).forEach(function (w, i) { var e = !!er['R' + w.strike]; L(w.strike, 'R' + (i + 1) + (e ? ' ↓' : ''), R, { layer: 'walls', w: w.tier === 'primary' ? 3 : 2, dash: e ? [6, 4] : null, tip: 'Call-writing wall R' + (i + 1) + ' ' + _cvF(w.strike) + (w.tier === 'primary' ? ' (strongest)' : ' (secondary)') + (e ? ', eroding: writers are leaving' : '') }); });
            (walls.support || []).forEach(function (w, i) { var e = !!er['S' + w.strike]; L(w.strike, 'S' + (i + 1) + (e ? ' ↓' : ''), G, { layer: 'walls', w: w.tier === 'primary' ? 3 : 2, dash: e ? [6, 4] : null, tip: 'Put-writing wall S' + (i + 1) + ' ' + _cvF(w.strike) + (w.tier === 'primary' ? ' (strongest)' : ' (secondary)') + (e ? ', eroding: writers are leaving' : '') }); });
            var mp = _gtbComputeMaxPainGEX(nm); if (mp && mp.maxPainK) L(mp.maxPainK, 'MP ◆', PU, { layer: 'walls', dash: [8, 3], tip: 'Max pain ' + _cvF(mp.maxPainK) + ': a pull level near expiry' });
        }
    } catch (e) {}

    // futures VWAP (the line, not text)
    try { var av = parseFloat(sm.avwap); if (av) L(av, 'VWAP', '#e3b341', { layer: 'levels', dash: [5, 3], tip: 'Futures day VWAP ' + _cvF(av) }); } catch (e) {}

    // previous day high / low / close
    try { var pv = _gtbSrPrevLoad(nm); if (pv) { L(pv.hi, 'PDH', '#8b949e', { dash: [2, 3], tip: 'Previous-day high' }); L(pv.lo, 'PDL', '#8b949e', { dash: [2, 3], tip: 'Previous-day low' }); L(pv.cl, 'PDC', '#8b949e', { dash: [2, 3], tip: 'Previous-day close' }); } } catch (e) {}

    // dead zone
    try { var dz = _gtbDeadZone(nm); if (dz) B(dz.lo, dz.hi, 'rgba(139,92,246,0.14)', 'DEAD ZONE', 'zones', 'Dead zone ' + _cvF(dz.lo) + ' - ' + _cvF(dz.hi) + ': signals are weak, expect chop until a 5-minute candle closes beyond an edge'); } catch (e) {}

    // strong support / resistance zones (several sources agree), value area
    try {
        var sr = _gtbSrLevels(nm);
        if (sr) sr.zones.filter(function (z) { return z.strength >= 3; }).forEach(function (z) {
            var up = z.price > sr.spot, pad = Math.max(z.hiP - z.loP, sr.spot * 0.0005) / 2;
            B(z.price - pad, z.price + pad, up ? 'rgba(248,81,73,' + Math.min(0.28, 0.07 * z.strength) + ')' : 'rgba(46,160,67,' + Math.min(0.28, 0.07 * z.strength) + ')', (up ? 'RES ' : 'SUP ') + Math.round(z.strength), 'zones', (up ? 'Resistance zone ' : 'Support zone ') + _cvF(z.price) + ', strength ' + z.strength.toFixed(1) + ': ' + z.items.map(function (x) { return x.src; }).join(', '));
        });
    } catch (e) {}
    // Index spot candles carry no volume, so the profile uses the futures candles (shifted by the futures-spot gap to line up with the spot price).
    var vcs = d.candles, volNote = '';
    if (!d.candles.some(function (c) { return parseFloat(c[5]) > 0; })) {
        var fr = _CV.futRaw && _CV.futRaw[nm];
        if (fr && fr.length) { var shift = d.spot - parseFloat(fr[fr.length - 1][4]); vcs = fr.map(function (c) { return [c[0], parseFloat(c[1]) + shift, parseFloat(c[2]) + shift, parseFloat(c[3]) + shift, parseFloat(c[4]) + shift, c[5]]; }); volNote = ' (from futures volume)'; }
        else d.why.profile = 'the index itself has no volume; waiting for the futures candles';
    }
    try { var mpf = _gtbMarketProfile(vcs); if (mpf) { B(mpf.val, mpf.vah, 'rgba(210,153,34,0.07)', 'VALUE AREA', 'profile', 'Value area ' + _cvF(mpf.val) + ' - ' + _cvF(mpf.vah) + ' (70% of today\'s volume)' + volNote); L(mpf.poc, 'POC', AM, { layer: 'profile', w: 2, tip: 'Point of control ' + _cvF(mpf.poc) + ': price with the most volume today' }); } } catch (e) {}

    // volume profile histogram (own bins so it can be drawn as bars)
    try {
        var lo = Infinity, hi = -Infinity; vcs.forEach(function (c) { lo = Math.min(lo, parseFloat(c[3])); hi = Math.max(hi, parseFloat(c[2])); });
        var BINS = 40, bs = (hi - lo) / BINS, vol = new Array(BINS).fill(0), tot = 0;
        if (hi > lo) { vcs.forEach(function (c) { var h = parseFloat(c[2]), l = parseFloat(c[3]), v = parseFloat(c[5]) || 0; if (!v) return; var a = Math.max(0, Math.min(BINS - 1, Math.floor((l - lo) / bs))), b = Math.max(a, Math.min(BINS - 1, Math.floor((h - lo) / bs))); for (var k = a; k <= b; k++) vol[k] += v / (b - a + 1); tot += v; });
            if (tot) d.profile = { lo: lo, bs: bs, vol: vol, max: Math.max.apply(null, vol) }; }
    } catch (e) {}

    try { _cvRecord(nm); var hh = _cvHist(nm), sn = _cvSnapInstant(nm); d.hist = sn ? hh.filter(function (r) { return r.t <= sn; }) : hh; } catch (e) {}
    try { var fc = _CV.futc && _CV.futc[nm]; if (fc && fc.rows && fc.sig === _cvSnapSig()) d.fut = fc.rows; } catch (e) {}      // last futures series, so a redraw does not blank the strip
    try {
        if (!d.why.walls && !d.lines.some(function (l) { return l.layer === 'walls' && /^[RS][0-9]/.test(l.label); })) d.why.walls = 'no ranked call / put wall right now (no out-of-the-money writing stands out)';
        if (!d.bands.some(function (b) { return b.layer === 'zones'; })) d.why.zones = 'no dead zone (score is outside +-3) and no support / resistance zone with 3 or more sources agreeing';
        if (!d.profile && !d.why.profile) d.why.profile = 'no volume data yet';
        if (!(d.hist && d.hist.length)) d.why.score = 'no readings yet: one is added at each refresh, and one for each snapshot time you step to';
    } catch (e) {}
    // verdict + probable trade
    try { d.verdict = _gtbFinalVerdict(nm); } catch (e) {}
    try {
        var ol = _gtbOutlook(nm);
        if (ol && ol.ok) {
            if (ol.plan) d.plan = ol.plan;
            else {
                // The signal groups are split: still show the levels for the weaker lean (instrument score, else price against VWAP / the open), drawn dimmed and labelled WEAK LEAN.
                var v0 = null; try { v0 = _gtbFinalVerdict(nm); } catch (e) {}
                var lean = _cvLean(nm, d, sm, open);
                var ol2 = _gtbOutlook(nm, lean); if (ol2 && ol2.ok && ol2.plan) { d.plan = ol2.plan; d.planLean = true; }
                else if (!d.plan) {
                    var fdir = (v0 && v0.dir) || lean; var fp = _cvLevelPlan(d, fdir); if (fp) { d.plan = fp; d.planLean = true; d.planFallback = true; }
                }
                if (!d.plan && ol.range) { d.range = ol.range; if (ol.range.sup) L(ol.range.sup.price, 'RANGE LOW', '#8b949e', { layer: 'trade', dash: [6, 4], tip: 'Nearest support zone: where a range would hold' }); if (ol.range.res) L(ol.range.res.price, 'RANGE HIGH', '#8b949e', { layer: 'trade', dash: [6, 4], tip: 'Nearest resistance zone: where a range would cap' }); }
            }
        }
    } catch (e) {}
    if (!d.plan) {      // the dashboard plan could not be built at all (e.g. no zones): fall back to the chart's own levels
        try {
            var v1 = null; try { v1 = _gtbFinalVerdict(nm); } catch (e) {}
            var dir1 = (v1 && v1.dir) || _cvLean(nm, d, sm, open);
            var fp1 = _cvLevelPlan(d, dir1); if (fp1) { d.plan = fp1; d.planLean = true; d.planFallback = true; }
        } catch (e) {}
    }
    if (d.plan && !d.planFallback) d.plan = _cvSanePlan(d, d.plan);
    if (!d.plan) d.why.trade = 'no Probable-trade plan right now (no clear direction or no zone to build an entry on)';
    try { var fr = sm.futures_trend_remark; if (fr) d.remark = fr; } catch (e) {}
    return d;
}

function _cvColors() {
    var el = _cvEl('cv-wrap') || document.body, cs = getComputedStyle(el);
    return { text: (cs.getPropertyValue('--gtb-text') || '#c9d1d9').trim() || '#c9d1d9', muted: (cs.getPropertyValue('--gtb-muted') || '#8b949e').trim() || '#8b949e' };
}

// OI / OBV view: the dashboard-style bar charts (strike across, CE red / PE green, up = added or buying, down = removed or selling) with the R1/R2/S1/S2 walls, in place of the candle chart.
function _cvOiPaint() {
    var host = _cvEl('cv-chart'); if (!host) return;
    var par = host.parentNode, box = par.querySelector('.cv-oibox');
    if (_CVG.view !== 'oiobv') { host.style.visibility = ''; if (box) box.style.display = 'none'; return; }
    host.style.visibility = 'hidden';
    if (!box) { box = document.createElement('div'); box.className = 'cv-oibox'; box.style.cssText = 'position:absolute;inset:0;z-index:2;overflow:auto;background:var(--gtb-bg);'; par.appendChild(box); }
    box.style.display = 'block';
    var d = _CV.data, W = box.clientWidth || 800, H = box.clientHeight || 500;
    if (!d || !d.oi || !d.oi.length) { box.innerHTML = '<div style="padding:60px 20px;color:var(--gtb-muted);font-size:13px;">No option chain loaded for ' + _CV.name + ' yet. Press Refresh.</div>'; return; }
    var rows = d.oi.slice().sort(function (p, q) { return p.k - q.k; }), n = rows.length, left = 20, right = 20, slot = (W - left - right) / n, bw = Math.max(3, Math.min(34, slot * 0.36));
    var walls = {};
    (d.lines || []).forEach(function (l) { var m = /^(R1|R2|S1|S2)\b/.exec(String(l.label)); if (!m) return; var best = 0, bd = 1e18; rows.forEach(function (r, i) { var dd = Math.abs(r.k - l.price); if (dd < bd) { bd = dd; best = i; } }); walls[m[1]] = best; });
    var atm = 0, ad = 1e18; rows.forEach(function (r, i) { var dd = Math.abs(r.k - d.spot); if (dd < ad) { ad = dd; atm = i; } });
    var ph = Math.max(130, Math.floor((H - 16) / 2)), svg = '';
    var panel = function (title, ck, pk, y0, note) {
        var mx = 0; rows.forEach(function (r) { mx = Math.max(mx, Math.abs(r[ck]), Math.abs(r[pk])); }); if (!mx) mx = 1;
        var top = y0 + 52, bot = y0 + ph - 26, mid = (top + bot) / 2, half = (bot - top) / 2, g = '';
        g += '<text x="' + left + '" y="' + (y0 + 16) + '" font-size="11" font-weight="700" fill="var(--gtb-muted)">' + title + '</text><text x="' + (W - right) + '" y="' + (y0 + 16) + '" font-size="10" text-anchor="end" fill="var(--gtb-muted)">' + note + '</text>';
        [top, mid, bot].forEach(function (yy) { g += '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--gtb-border)" stroke-dasharray="3 3"/>'; });
        Object.keys(walls).forEach(function (w) {
            var cx = left + slot * (walls[w] + 0.5), res = w.charAt(0) === 'R', c = res ? '#dc3545' : '#28a745', sec = w.charAt(1) === '2';
            g += '<line x1="' + cx + '" x2="' + cx + '" y1="' + (top - 6) + '" y2="' + bot + '" stroke="' + c + '" stroke-width="' + (sec ? 1 : 1.5) + '"' + (sec ? ' stroke-dasharray="4 3"' : '') + '/>'
               + '<rect x="' + (cx - 11) + '" y="' + (y0 + 24) + '" width="22" height="15" fill="' + (sec ? 'var(--gtb-bg)' : c) + '" stroke="' + c + '"/><text x="' + cx + '" y="' + (y0 + 35) + '" font-size="10" font-weight="700" text-anchor="middle" fill="' + (sec ? c : '#fff') + '">' + w + '</text>';
        });
        rows.forEach(function (r, i) {
            var cx = left + slot * (i + 0.5);
            [[r[ck], '#dc3545', cx - bw, 'call'], [r[pk], '#28a745', cx, 'put']].forEach(function (b) {
                if (!b[0]) return; var h = Math.max(1, Math.abs(b[0]) / mx * (half - 2)), up = b[0] > 0;
                g += '<rect x="' + b[2] + '" y="' + (up ? mid - h : mid) + '" width="' + bw + '" height="' + h + '" fill="' + b[1] + '" fill-opacity="' + (up ? 0.9 : 0.5) + '"><title>' + _cvF(r.k) + ' ' + b[3] + ': ' + (b[0] > 0 ? '+' : '') + _cvF(b[0]) + '</title></rect>';
            });
            g += '<text x="' + cx + '" y="' + (bot + 16) + '" font-size="10" text-anchor="middle" fill="var(--gtb-muted)"' + (i === atm ? ' font-weight="800"' : '') + '>' + _cvF(r.k) + '</text>';
        });
        return g;
    };
    svg += panel('OI CHANGE (CE/PE)', 'ce', 'pe', 0, 'red = calls, green = puts. Up = OI added today, down = removed. R = resistance wall, S = support wall. Bold strike = at the money');
    svg += panel('OBV (CE/PE)', 'oce', 'ope', ph, 'Up = buying volume, down = selling volume (cumulative today)');
    box.innerHTML = '<svg width="' + W + '" height="' + (ph * 2) + '" style="display:block;font-family:inherit;">' + svg + '</svg>';
}
function _cvDraw() {
    _cvOiPaint();
    var cv = _cvEl('cv-ov'), host = _cvEl('cv-chart');
    if (!cv || !host || !_CV.series || !_CV.data) return;
    var W = host.clientWidth, H = host.clientHeight, dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    var d = _CV.data, S = _CV.series, col = _cvColors(), axisW = 64, plotW = W - axisW, y = function (p) { return S.priceToCoordinate(p); };
    _CV.hits = [];
    var plotH = H - 28; try { var ps = _CV.chart.paneSize(); if (ps && ps.height) plotH = ps.height; } catch (e) {}
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, plotW, plotH); ctx.clip();      // nothing is drawn over the time axis or outside the plot
    ctx.font = '600 12px ui-monospace, Consolas, monospace'; var placed = []; ctx.textBaseline = 'middle';
    // bands first (behind lines)
    var bandLabels = [];
    d.bands.forEach(function (b) {
        if (!_CV.layers[b.layer]) return;
        var y1 = y(b.hi), y2 = y(b.lo); if (y1 == null || y2 == null) return;
        ctx.fillStyle = b.color; ctx.fillRect(0, y1, plotW, y2 - y1);
        bandLabels.push({ t: b.label, y: Math.min(y1 + 9, y2 - 4) });      // drawn after the profile bars so they do not cover the text
        _CV.hits.push({ y1: y1, y2: y2, tip: b.tip, band: true });
    });
    // volume profile on the left
    if (_CV.layers.profile && d.profile) {
        var P = d.profile, maxW = plotW * 0.16;
        for (var i = 0; i < P.vol.length; i++) {
            var ya = y(P.lo + (i + 1) * P.bs), yb = y(P.lo + i * P.bs); if (ya == null || yb == null) continue;
            ctx.fillStyle = 'rgba(210,153,34,0.28)'; ctx.fillRect(0, ya + 0.5, maxW * P.vol[i] / P.max, Math.max(1, yb - ya - 1));
        }
    }
    // score strip under the candles
    if (_CV.layers.score && d.hist && d.hist.length) {
        var sy0 = H - Math.round(H * 0.2) + 14, sh = Math.round(H * 0.2) - 44, mid = sy0 + sh / 2, mxs = 3;
        d.hist.forEach(function (r) { mxs = Math.max(mxs, Math.abs(r.s)); });
        ctx.fillStyle = 'rgba(128,128,128,0.06)'; ctx.fillRect(0, sy0, plotW, sh);
        ctx.strokeStyle = col.muted; ctx.globalAlpha = 0.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(plotW, mid); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.fillStyle = col.muted; ctx.textAlign = 'left'; ctx.fillText('SCORE', 6, sy0 + 9);
        var ts2 = _CV.chart.timeScale(), pts = [];
        d.hist.forEach(function (r) { var tt = Math.floor(r.t / 1000) + 19800; tt -= tt % 300; var xx = ts2.timeToCoordinate(tt); if (xx != null) pts.push({ x: xx, y: mid - r.s / mxs * (sh / 2 - 2), s: r.s, t: r.t }); });   // snap each reading to its 5-minute candle
        if (pts.length) {
            ctx.lineWidth = 1.5; ctx.strokeStyle = '#58a6ff'; ctx.beginPath(); pts.forEach(function (q, i) { if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.stroke(); ctx.lineWidth = 1;
            pts.forEach(function (q) { ctx.fillStyle = q.s > 0 ? '#2ea043' : q.s < 0 ? '#f85149' : '#8b949e'; ctx.fillRect(q.x - 2, q.y - 2, 4, 4); });
            var lq = pts[pts.length - 1]; ctx.fillStyle = lq.s > 0 ? '#2ea043' : lq.s < 0 ? '#f85149' : col.muted; ctx.textAlign = 'right'; ctx.fillText((lq.s > 0 ? '+' : '') + lq.s, plotW - 6, sy0 + 9);
            _CV.hits.push({ y1: sy0, y2: sy0 + sh, band: true, tip: 'Score through the day (' + pts.length + ' readings, last ' + lq.s + '): above the dashed line is bullish, below is bearish' });
        }
    }
    // futures strip: one block per candle, green = bullish read, red = bearish, grey = no clear signal
    if (_CV.layers.fut && d.fut && d.fut.length) {
        var fy = H - Math.round(H * 0.2) + 14 - 13, ftx = _CV.chart.timeScale();
        d.fut.forEach(function (r, i) {
            var x0 = ftx.timeToCoordinate(r.time); if (x0 == null) return; var nx = d.fut[i + 1] ? ftx.timeToCoordinate(d.fut[i + 1].time) : null, bw = nx != null ? nx - x0 : 6;
            ctx.fillStyle = r.sc > 0 ? '#2ea043' : r.sc < 0 ? '#f85149' : '#8b949e'; ctx.globalAlpha = r.sc ? 0.85 : 0.4; ctx.fillRect(x0 - bw / 2 + 0.5, fy, Math.max(1, bw - 1), 9); ctx.globalAlpha = 1;
        });
        ctx.fillStyle = col.muted; ctx.textAlign = 'left'; ctx.fillText('FUT', 4, fy - 5);
        _CV.hits.push({ y1: fy, y2: fy + 9, band: true, tip: 'Futures read per candle: green bullish, red bearish, grey no clear signal. Latest: ' + String(d.fut[d.fut.length - 1].remark).replace(/_/g, ' ') });
    }
    bandLabels.forEach(function (bl) { ctx.fillStyle = col.muted; ctx.textAlign = 'left'; ctx.globalAlpha = 0.9; ctx.fillText(bl.t, 6, bl.y); ctx.globalAlpha = 1; });
    // OI flow bars (solid = OI added today, outline = OI removed)
    if (_CV.layers.oi && d.oi && d.oi.length) {
        var mxo = 0; d.oi.forEach(function (r) { mxo = Math.max(mxo, Math.abs(r.ce), Math.abs(r.pe)); });
        var oiw = _CVG.view === 'oiobv', maxBar = plotW * (oiw ? 0.3 : 0.13);
        // OBV (signed): its own column left of the OI bars, positive to the right of a centre line, negative to the left
        var mxb = 0; d.oi.forEach(function (r) { mxb = Math.max(mxb, Math.abs(r.oce), Math.abs(r.ope)); });
        if (mxb > 0) {
            var zw = plotW * (oiw ? 0.17 : 0.08), cx0 = plotW - maxBar - 12 - zw;
            // two labelled panels so the columns read apart: OBV (left) and OI change (right)
            ctx.fillStyle = col.muted; ctx.globalAlpha = 0.07; ctx.fillRect(cx0 - zw, 0, zw * 2, plotH); ctx.fillRect(plotW - maxBar, 0, maxBar, plotH); ctx.globalAlpha = 1;
            var _pf = ctx.font; ctx.fillStyle = col.text; ctx.font = '700 10px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('OBV  sell ◄ ► buy', cx0, 12); ctx.fillText('OI change today', plotW - maxBar / 2, 12);
            ctx.font = '9px sans-serif'; ctx.fillStyle = col.muted; ctx.fillText('red = calls, green = puts', cx0, 24); ctx.fillText('solid = added, outline = removed', plotW - maxBar / 2, 24); ctx.font = _pf;
            ctx.strokeStyle = col.muted; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx0 + 0.5, 0); ctx.lineTo(cx0 + 0.5, plotH); ctx.stroke(); ctx.globalAlpha = 1;
            d.oi.forEach(function (r) {
                var yk = y(r.k); if (yk == null || yk < 0 || yk > H) return;
                [[r.oce, '#f85149', -4], [r.ope, '#2ea043', 0]].forEach(function (b) {
                    if (!b[0]) return; var bl = Math.max(1, zw * Math.abs(b[0]) / mxb);
                    ctx.fillStyle = b[1]; ctx.globalAlpha = 0.5; ctx.fillRect(b[0] > 0 ? cx0 : cx0 - bl, yk + b[2], bl, 4); ctx.globalAlpha = 1;
                });
                _CV.hits.push({ y: yk, x1: cx0 - zw - 2, x2: cx0 + zw + 2, tip: 'Strike ' + _cvF(r.k) + ': call OBV ' + _cvF(r.oce) + ', put OBV ' + _cvF(r.ope) + ' (right of the line = buying volume, left = selling volume)' });
            });
                    }
        if (mxo > 0) d.oi.forEach(function (r) {
            var yk = y(r.k); if (yk == null || yk < 0 || yk > H) return;
            [[r.ce, '#f85149', -4], [r.pe, '#2ea043', 0]].forEach(function (b) {
                if (!b[0]) return; var bl = Math.max(1, maxBar * Math.abs(b[0]) / mxo);
                if (b[0] > 0) { ctx.fillStyle = b[1]; ctx.globalAlpha = 0.55; ctx.fillRect(plotW - bl, yk + b[2], bl, 4); }
                else { ctx.strokeStyle = b[1]; ctx.globalAlpha = 0.7; ctx.lineWidth = 1; ctx.strokeRect(plotW - bl + 0.5, yk + b[2] + 0.5, bl - 1, 3); }
                ctx.globalAlpha = 1;
            });
            _CV.hits.push({ y: yk, x1: plotW - maxBar - 4, tip: 'Strike ' + _cvF(r.k) + ': call OI ' + (r.ce >= 0 ? '+' : '') + _cvF(r.ce) + ', put OI ' + (r.pe >= 0 ? '+' : '') + _cvF(r.pe) + ' today (red = calls, green = puts; solid = added, outline = removed)' });
        });
    }
    // trade box: entry / stop / target1 / target2 from the last candle to the right edge
    var p = d.plan;
    if (_CV.layers.trade && p) {
        var ts = _CV.chart.timeScale(), xl = ts.timeToCoordinate(_cvTime(d.candles[d.candles.length - 1])); if (xl == null) xl = plotW * 0.8;
        var ye = y(p.entryPx), ys = y(p.stop), yt = p.t1 ? y(p.t1.price) : null;
        var vcall = d.verdict && d.verdict.call, agree = vcall === (p.long ? 'LONG' : 'SHORT') && !d.planLean, dimA = agree ? 1 : (d.planFallback ? 0.55 : d.planLean ? 0.35 : 0.45);      // the verdict does not back this plan: draw it as a lean, dimmed
        ctx.save(); ctx.globalAlpha = dimA; ctx.beginPath(); ctx.rect(0, 0, plotW, plotH * 0.78); ctx.clip();      // fills stop above the score / futures strips
        if (ye != null && ys != null) { ctx.fillStyle = 'rgba(248,81,73,0.16)'; ctx.fillRect(xl, Math.min(ye, ys), plotW - xl, Math.abs(ys - ye)); }
        if (ye != null && yt != null) { ctx.fillStyle = 'rgba(46,160,67,0.16)'; ctx.fillRect(xl, Math.min(ye, yt), plotW - xl, Math.abs(yt - ye)); }
        var tl = function (price, txt, c, dash) { var yy = y(price); if (yy == null) return; ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(xl, yy); ctx.lineTo(plotW, yy); ctx.stroke(); ctx.setLineDash([]); var ly0 = yy - 9; for (var k0 = 0; k0 < placed.length; k0++) if (Math.abs(placed[k0] - ly0) < 15) ly0 = placed[k0] + 15; placed.push(ly0); ctx.fillStyle = c; ctx.textAlign = 'right'; ctx.fillText(txt, plotW - 4, ly0); _CV.hits.push({ y: yy, tip: txt + ' ' + _cvF(price), x1: xl }); };
        ctx.restore();
        ctx.save(); ctx.globalAlpha = dimA;
        tl(p.entryPx, (d.planFallback ? 'LEVEL PLAN ' : d.planLean ? 'WEAK LEAN ' : agree ? '' : 'LEAN ') + (p.long ? 'LONG' : 'SHORT') + (p.atLevel ? ' NOW' : ' ENTRY'), '#58a6ff', [4, 3]);
        tl(p.stop, 'STOP', '#f85149'); if (p.t1) tl(p.t1.price, 'T1' + (p.rr != null ? '  ' + p.rr.toFixed(1) + 'R' : ''), '#2ea043'); if (p.t2) tl(p.t2.price, 'T2', '#2ea043', [2, 3]);
        ctx.restore();
    }
    // lines with right-edge labels
    d.lines.slice().sort(function (a, b) { return (b.w - a.w) || (a.price - b.price); }).forEach(function (l) {
        if (!_CV.layers[l.layer]) return;
        if (_CVG.view === 'oiobv' && !/^(R1|R2|S1|S2)/.test(String(l.label))) return;
        if (_CVG.view === 'clean' && !/^(ASO|AST|BSO|BST|OPEN|VWAP|R1|S1|PDH|PDL)/.test(String(l.label))) return;
        var yy = y(l.price); if (yy == null || yy < 0 || yy > H) return;
        ctx.strokeStyle = l.color; ctx.lineWidth = l.w; ctx.setLineDash(l.dash || []); ctx.globalAlpha = l.w >= 3 ? 0.95 : 0.8;
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        var ly = yy; for (var k = 0; k < placed.length; k++) if (Math.abs(placed[k] - ly) < 15) ly = placed[k] + 15; placed.push(ly);
        var tw = ctx.measureText(l.label).width + 8;
        ctx.fillStyle = l.color; ctx.globalAlpha = 0.18; ctx.fillRect(plotW - tw - 2, ly - 8, tw, 16); ctx.globalAlpha = 1;
        ctx.fillStyle = l.color; ctx.textAlign = 'right'; ctx.fillText(l.label, plotW - 6, ly);
        _CV.hits.push({ y: yy, tip: l.tip + ' · ' + _cvF(l.price) });
    });
    // verdict badge (HTML, top-left) is separate; futures remark chip is drawn here at the last price
    if (d.remark) {
        var yl = y(d.spot); if (yl != null) {
            var rc = /LONG$|SHORT_COVERING|SHOT_COVERING|BULL|BUY/.test(d.remark) && !/UNWIND/.test(d.remark) ? '#2ea043' : /SHORT|UNWIND|BEAR|SELL/.test(d.remark) ? '#f85149' : '#8b949e', tx = d.remark.replace(/_/g, ' ');
            var w2 = ctx.measureText(tx).width + 10; ctx.fillStyle = rc; ctx.globalAlpha = 0.2; ctx.fillRect(plotW - w2 - 70, yl - 8, w2, 16); ctx.globalAlpha = 1; ctx.fillStyle = rc; ctx.textAlign = 'right'; ctx.fillText(tx, plotW - 75, yl);
            _CV.hits.push({ y: yl, tip: 'Futures read: ' + tx + ' (at the last price)' });
        }
    }
    ctx.restore();
}
function _cvTime(c) { return Math.floor(new Date(c[0]).getTime() / 1000) + 19800; }

// What else a trade needs, as small coloured chips: entry timing, signal agreement, whether price still confirms, risk in rupees and lots, reward:risk, and the things that change the day
// (market guard, VIX, expiry, squeeze, a high-impact event, time of day). Every figure comes from a function the dashboard already uses; nothing new is scored here.
function _cvChecks(d) {
    var nm = d.nm, out = [], G = 'var(--gtb-green)', R = 'var(--gtb-red)', A = 'var(--gtb-amber)', M = 'var(--gtb-muted)';
    var chip = function (label, tone, tip, cells) { out.push({ label: label, col: tone === 'g' ? G : tone === 'r' ? R : tone === 'a' ? A : tone === 'n' ? M : (String(tone).indexOf('var(') === 0 ? tone : M), tip: tip || '', cells: cells || null }); };
    var v = d.verdict, p = d.plan, dir = (v && v.dir) || (p ? (p.long ? 1 : -1) : 0);
    var word = dir > 0 ? 'LONG' : dir < 0 ? 'SHORT' : '';
    if (dir) {
        try { _OSS_TIMING_LAST = null; _ossTimingFor(nm, dir, null, null); var t = _OSS_TIMING_LAST; if (t && t.pct != null) chip('Timing ' + t.pct + '%', t.pct >= 70 ? 'g' : t.pct >= 50 ? 'a' : 'r', 'Is now a good moment to enter a ' + word + '? ' + (t.label || '') + ' (the same checklist as the strike search). Each square is one check: green good, red against, grey neutral.' + ((t.checks || []).filter(function (c) { return c.s < 0; }).map(function (c) { return ' | Against: ' + c.label + ' - ' + (c.why || ''); }).join('')), (t.checks || []).map(function (c) { return { c: c.s > 0 ? G : c.s < 0 ? R : M, t: c.label + ': ' + (c.why || '') }; })); } catch (e) {}
        try { _OSS_AGREE_LAST = null; _ossAgreement(nm, dir > 0 ? 'Bullish' : 'Bearish'); var ag = _OSS_AGREE_LAST; if (ag && ag.pct != null) chip('Agree ' + ag.agree + '/' + ag.total + ' ' + ag.pct + '%', ag.pct >= 65 ? 'g' : ag.pct >= 45 ? 'a' : 'r', ag.agree + ' of ' + ag.total + ' independent signals back a ' + word + '. Each square is one signal: green backs it, red is against, grey is neutral.', (ag.votes || []).map(function (x) { return { c: x.v === ag.want ? G : x.v === 0 ? M : R, t: x.label + ': ' + (x.v > 0 ? 'bullish' : x.v < 0 ? 'bearish' : 'neutral') }; })); } catch (e) {}
        try { var lx = _lxCompute(nm, dir); if (lx && lx.status) chip('Price ' + lx.status.toLowerCase(), lx.status === 'VALID' ? 'g' : lx.status === 'WEAKENING' ? 'a' : 'r', 'Live Context: is price still doing what the ' + word + ' view needs (' + (lx.against || 0) + ' checks against, ' + (lx.agree || 0) + ' for)'); } catch (e) {}
        try {
            var oo = _gtbOiObvAgree(nm);
            if (oo) {
                var ob = oo.label === 'BULLISH' ? 1 : oo.label === 'BEARISH' ? -1 : 0;
                chip('OI flow ' + (ob > 0 ? 'leans long' : ob < 0 ? 'leans short' : 'no clear read') + (oo.heldOf >= 3 ? ' ' + oo.held + '/' + oo.heldOf : ''), !ob ? 'n' : ob === dir ? 'g' : 'r', 'OI CHANGE + OBV at the ATM and two strikes each side: ' + (ob > 0 ? 'put writers are adding support at ' + (oo.bullK || []).join(', ') : ob < 0 ? 'call writers are adding resistance at ' + (oo.bearK || []).join(', ') : 'no agreement') + (oo.atWall ? ' (at a wall)' : '') + (oo.heldOf >= 3 ? '. The same read held on ' + oo.held + ' of the last ' + oo.heldOf + ' candles' : '') + '. ' + (ob && ob !== dir ? 'It points against the ' + word + '.' : ''));
            }
        } catch (e) {}
        try { var fu = _gtbFuelFor(nm, dir, _OSS_AGREE_LAST); if (fu && fu.txt && fu.txt !== '-') chip('Fuel ' + String(fu.txt).toLowerCase(), fu.col || 'n', fu.tip || ''); } catch (e) {}
    } else chip('No direction', 'n', 'The signals do not lean either way');
    try {
        var pr = (typeof _PS_CACHE !== 'undefined') ? (_PS_CACHE[nm] || _PS_CACHE[String(nm).toUpperCase()]) : null;
        if (pr && pr.primary && pr.primary.ok) { var pd = pr.primary.dir > 0 ? 1 : pr.primary.dir < 0 ? -1 : 0; chip('Positional ' + (pd > 0 ? 'bullish' : pd < 0 ? 'bearish' : 'neutral'), !pd ? 'n' : !dir ? 'n' : pd === dir ? 'g' : 'r', (pr.verdict || 'Positional Screener view') + ' (daily candles, from the Positional Screener scan)'); }
    } catch (e) {}
    try { if (!_cvIsMcx(nm)) { var hm = _gtbHeadlineMarketSignal(); if (hm && hm.ms && hm.ms.signal) { var mv = /BUY/.test(hm.ms.signal) ? 1 : /SELL/.test(hm.ms.signal) ? -1 : 0; chip('Market ' + hm.ms.signal.toLowerCase() + (hm.score != null && isFinite(hm.score) ? ' ' + (hm.score > 0 ? '+' : '') + Math.round(hm.score * 10) / 10 : ''), !mv ? 'n' : !dir ? 'n' : mv === dir ? 'g' : 'r', 'The dashboard composite market signal' + (hm.ms.reason ? ': ' + hm.ms.reason : '')); } } } catch (e) {}
    try { var sk = _ossSuggestedKey(nm, { skipMarketGate: true }); if (sk && sk.key) { var st = _ossStrategyByKey(sk.key); chip('Strategy ' + st.label, 'n', (st.view || '') + ' - the Option Strike Search suggestion for this instrument. Press the Strikes button for the legs, strikes and premiums.'); } } catch (e) {}
    if (p) {
        var rr = p.rr; if (rr != null) chip('R ' + rr.toFixed(1) + (p.capped ? ' (capped)' : ''), rr < 1 ? 'r' : rr > 4 ? 'a' : 'g', (p.capped ? 'The dashboard target was too far to trust, so target 1 is brought back to a nearer level. ' : '') + (p.widened ? 'The stop was inside one normal candle range and is widened to one range. ' : '') + 'Reward to risk of the plan to target 1' + (rr > 4 ? '. Above about 4 usually means the target is too far to trust' : rr < 1 ? '. Below 1: a better entry is needed' : ''));
        try {
            var lot = 0, mcx = _cvIsMcx(nm); if (mcx) lot = (typeof _TF_MCX_MULT !== 'undefined' && _TF_MCX_MULT[nm]) || 0; else { var fi = _gtbFutTokenFor(nm); lot = fi ? fi.lot : 0; }
            var cap = parseFloat(typeof MARGIN !== 'undefined' ? MARGIN : 0) || 0, pct = (typeof RISK_PCT_PER_TRADE !== 'undefined' ? RISK_PCT_PER_TRADE : 1), perLot = lot ? p.risk * lot : 0;
            if (perLot && cap) { var lots = Math.floor(cap * pct / 100 / perLot); chip('Risk Rs ' + Math.round(perLot).toLocaleString('en-IN') + '/lot · ' + (lots >= 1 ? lots + ' lot' + (lots > 1 ? 's' : '') : 'no lot fits'), lots >= 1 ? 'g' : 'a', 'Stop ' + Math.round(p.risk) + ' pts x lot ' + lot + (mcx ? ' (assumed contract multiplier)' : '') + '. Budget Rs ' + Math.round(cap * pct / 100).toLocaleString('en-IN') + ' (' + pct + '% of Account Capital). Futures-equivalent, brokerage and margin not included'); }
            else if (!cap) chip('Set Account Capital', 'a', 'Settings > Margin is empty, so lots cannot be sized');
        } catch (e) {}
    }
    if (!_cvIsMcx(nm)) {
        try { var ms = window._GTB_LAST_MARKET_SIGNAL && window._GTB_LAST_MARKET_SIGNAL.signal; if (ms === 'NO TRADE') chip('Market guard', 'r', 'The dashboard market signal is NO TRADE (range exhausted at the VIX level)'); } catch (e) {}
        try { var vx = parseFloat(INSTRUMENT_LTP_PRICE && INSTRUMENT_LTP_PRICE['INDIA VIX'] && INSTRUMENT_LTP_PRICE['INDIA VIX'].ltp); if (vx > 25) chip('VIX ' + vx.toFixed(1), 'a', 'India VIX above 25: widen the stop, cut size'); } catch (e) {}
        try { if ((_gtbExpiryDayNames() || []).indexOf(nm) >= 0) chip('Expiry day', 'a', 'Options expire today: moves are faster, premiums decay quickly'); } catch (e) {}
        try { var dd = new Date(Date.now() + 19800000), mm = dd.getUTCHours() * 60 + dd.getUTCMinutes(); if (!_cvSnapActive() && mm >= 9 * 60 + 15 && mm < 9 * 60 + 25) chip('Opening minutes', 'a', 'Before 9:25 the 9:15 zone is still settling'); else if (!_cvSnapActive() && mm >= 14 * 60 + 45 && mm <= 15 * 60 + 30) chip('Late session', 'a', 'After 14:45 there is little time left for the idea to play out'); } catch (e) {}
    }
    try { var up = (_gtbSqueezeActiveNames(true) || []).indexOf(nm) >= 0, dn = (_gtbSqueezeActiveNames(false) || []).indexOf(nm) >= 0; if (up || dn) chip(up ? 'Short covering' : 'Long unwinding', (dir > 0 && up) || (dir < 0 && dn) ? 'g' : 'a', 'An active futures squeeze: ' + (up ? 'shorts are covering, so exit shorts and puts' : 'longs are unwinding, so exit longs and calls')); } catch (e) {}
    try { var now = Date.now(), ev = (_nfEvents() || []).filter(function (e) { return e.impact === 'HIGH' && e.t >= now - 15 * 60000 && e.t <= now + 90 * 60000; })[0]; if (ev) chip((ev.t >= now ? 'Event ' + _nfIn(ev.t) : 'Event just now'), 'a', ev.title + ' (' + (ev.country || '') + ', HIGH impact): prices can jump around the release'); } catch (e) {}
    return out;
}
// Compact form (default): one small coloured square per check, label and reason on hover, so the chart stays visible. Details turns on the full chips.
function _cvChecksCompactHtml(d) {
    var items = []; try { items = _cvChecks(d); } catch (e) {}
    return items.map(function (c) { return '<span title="' + (String(c.label) + (c.tip ? ' - ' + c.tip : '')).replace(/"/g, '&quot;') + '" style="display:inline-block;pointer-events:auto;width:11px;height:11px;margin-right:3px;background:' + c.col + ';opacity:0.85;"></span>'; }).join('');
}
function _cvChecksHtml(d) {
    var items = []; try { items = _cvChecks(d); } catch (e) {}
    return items.map(function (c) { return '<span title="' + String(c.tip).replace(/"/g, '&quot;') + '" style="display:block;pointer-events:auto;margin-top:3px;padding:1px 8px;font-size:11px;font-weight:700;color:' + c.col + ';background:var(--gtb-surface);border:1px solid var(--gtb-border);border-left:3px solid ' + c.col + ';white-space:nowrap;">' + String(c.label).replace(/</g, '&lt;') + (c.cells ? '<span style="margin-left:6px;white-space:nowrap;">' + c.cells.map(function (x) { return '<span title="' + String(x.t || '').replace(/"/g, '&quot;') + '" style="display:inline-block;width:9px;height:9px;margin-right:2px;background:' + x.c + ';"></span>'; }).join('') + '</span>' : '') + '</span>'; }).join('');
}
function _cvBadgeHtml(d) {
    var v = d.verdict, C = _cvColors();
    if (!v) return '<span style="color:' + C.muted + ';">no verdict yet</span>';
    var call = v.call || 'WAIT', c = call === 'LONG' ? '#2ea043' : call === 'SHORT' ? '#f85149' : '#d29922', conf = v.conf ? { HIGH: 3, MEDIUM: 2, LOW: 1 }[v.conf] || 0 : 0, dots = '';
    for (var i = 0; i < 3; i++) dots += '<span style="display:inline-block;width:7px;height:7px;margin-left:2px;background:' + (i < conf ? c : 'transparent') + ';border:1px solid ' + c + ';"></span>';
    return '<span title="' + String((v.headline || call) + (v.action ? ' - ' + v.action : '') + (v.warn && v.warn.length ? ' | ' + v.warn.join(' | ') : '')).replace(/"/g, '&quot;') + '" style="font-weight:900;font-size:15px;color:' + c + ';letter-spacing:.04em;">' + call + '</span>' + dots + ' <span style="color:' + C.muted + ';font-size:11px;">' + (_cvF(d.spot)) + '</span>' + (_cvSnapActive() ? ' <span style="color:var(--gtb-amber);font-size:11px;font-weight:700;" title="The chart is cut at the snapshot end time set on the dashboard">as of ' + (function () { try { return _gtbDataStamp(); } catch (e) { return _gtbHistTime(); } })() + '</span>' : '');
}

function _cvRender() {
    var host = _cvEl('cv-chart'); if (!host) { if (!document.getElementById('cv-wrap')) _cvStop(); return; }
    var d = _CV.data = _cvGather(_CV.name);
    var msg = _cvEl('cv-msg');
    if (!d.candles.length) { var bb0 = _cvEl('cv-badge'); if (bb0) bb0.innerHTML = ''; if (msg) { msg.style.display = 'flex'; msg.innerHTML = 'No candles for ' + _CV.name + ' yet. Press Load to fetch its data.'; } return; }
    if (msg) msg.style.display = 'none';
    var cl = (typeof _gtbChartColors === 'function') ? _gtbChartColors() : { grid: '#122038', bdr: '#1b2d47', text: '#5c7499' };
    if (!_CV.chart || _CV.chart._host !== host) {
        host.innerHTML = '<canvas id="cv-ov" style="position:absolute;left:0;top:0;pointer-events:none;"></canvas>';
        var ch = LightweightCharts.createChart(host, {
            width: host.clientWidth, height: host.clientHeight, layout: { background: { color: 'transparent' }, textColor: cl.text },
            grid: { vertLines: { color: cl.grid }, horzLines: { color: cl.grid } }, crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
            rightPriceScale: { borderColor: cl.bdr, minimumWidth: 64, scaleMargins: { top: 0.06, bottom: 0.22 } },
            timeScale: { borderColor: cl.bdr, timeVisible: true, secondsVisible: false, rightOffset: 14, fixLeftEdge: true },
            localization: { timeFormatter: function (t) { var x = new Date(t * 1000); return ('0' + x.getUTCHours()).slice(-2) + ':' + ('0' + x.getUTCMinutes()).slice(-2); } },
            handleScale: { axisPressedMouseMove: { time: true, price: true } }
        });
        ch._host = host; _CV.chart = ch;
        _CV.series = ch.addSeries(LightweightCharts.CandlestickSeries, { upColor: '#3fb950', downColor: '#f85149', borderUpColor: '#3fb950', borderDownColor: '#f85149', wickUpColor: '#3fb950', wickDownColor: '#f85149', priceLineVisible: true });
        var cxh = _CV; ch.subscribeCrosshairMove(function (p) { _CV = cxh; _cvHover(p); });
        if (_CV.ro) { try { _CV.ro.disconnect(); } catch (e) {} }
        var cxr = _CV; _CV.ro = new ResizeObserver(function () { _CV = cxr; if (_CV.chart && host.clientWidth > 0) { _CV.chart.resize(host.clientWidth, host.clientHeight); _cvDraw(); } }); _CV.ro.observe(host);
        _CV.fit = true;
    }
    _CV.series.setData(d.candles.map(function (c) { return { time: _cvTime(c), open: parseFloat(c[1]), high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4]) }; }));
    // keep the key levels in view: range = candles + nearest strike levels and the expected day range
    var lo = Infinity, hi = -Infinity; d.candles.forEach(function (c) { lo = Math.min(lo, parseFloat(c[3])); hi = Math.max(hi, parseFloat(c[2])); });
    d.lines.forEach(function (l) { if (l.layer !== 'range' && l.label.indexOf('PD') !== 0 && Math.abs(l.price - d.spot) < (hi - lo) * 0.9 + d.spot * 0.002) { lo = Math.min(lo, l.price); hi = Math.max(hi, l.price); } });
    var padv = (hi - lo) * 0.06; _CV.series.applyOptions({ autoscaleInfoProvider: function () { return { priceRange: { minValue: lo - padv, maxValue: hi + padv } }; } });
    if (_CV.lastN != null && d.candles.length < _CV.lastN) _CV.fit = true;      // fewer candles than before (snapshot stepped back, new instrument): refit
    _CV.lastN = d.candles.length;
    if (_CV.fit) { _CV.chart.timeScale().fitContent(); _CV.fit = false; }
    var b = _cvEl('cv-badge'); if (b) b.innerHTML = _cvBadgeHtml(d);
    var chk = _cvEl('cv-checks'); if (chk) { chk.innerHTML = _CV.det ? _cvChecksHtml(d) : _cvChecksCompactHtml(d); chk.style.display = ''; }
    var cbar = _cvEl('cv-bar'); if (cbar && _CV === _CVG.panes[_CVG.active]) { var wsig = JSON.stringify(d.why); if (_CV.wsig !== wsig) { _CV.wsig = wsig; cbar.innerHTML = _cvChipsHtml(); } }
    var nmAt = _CV.name, cxf = _CV; _cvFutSeries(nmAt).then(function (rows) { _CV = cxf; if (rows && _CV.name === nmAt && _CV.data === d) { d.fut = rows; if (!d.profile && _CV.futRaw && _CV.futRaw[nmAt] && _CV.prTried !== _CV.futRaw[nmAt]) { _CV.prTried = _CV.futRaw[nmAt]; _cvRender(); return; } _cvDraw(); } });
    _cvDraw();
}

function _cvHover(param) {
    var tip = _cvEl('cv-tip'); if (!tip) return;
    if (!param || !param.point) { tip.style.display = 'none'; return; }
    var y = param.point.y, best = null, bd = 1e9;
    _CV.hits.forEach(function (h) { var dist = h.band ? ((y >= h.y1 && y <= h.y2) ? 6 : 1e9) : ((h.x1 != null && param.point.x < h.x1) || (h.x2 != null && param.point.x > h.x2) ? 1e9 : Math.abs(h.y - y)); if (dist < bd && dist <= 6) { bd = dist; best = h; } });
    if (!best) { tip.style.display = 'none'; return; }
    tip.textContent = best.tip; tip.style.display = 'block';
    var w = tip.offsetWidth, x = param.point.x + 14; if (x + w > (_cvEl('cv-chart').clientWidth - 70)) x = param.point.x - w - 14;
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y - 30) + 'px';
}

function _cvStopPane(cx) { if (!cx) return; if (cx.ro) { try { cx.ro.disconnect(); } catch (e) {} cx.ro = null; } if (cx.chart) { try { cx.chart.remove(); } catch (e) {} } cx.chart = null; cx.series = null; }
function _cvStop() { if (_CVG.slotTimer) { clearTimeout(_CVG.slotTimer); _CVG.slotTimer = null; } if (_CVG.timer) { clearInterval(_CVG.timer); _CVG.timer = null; } _CVG.panes.forEach(_cvStopPane); }

async function _cvLoad(cx) {
    cx = cx || _CV; _CV = cx;
    var n = cx.name, msg = _cvEl('cv-msg'); if (msg) { msg.style.display = 'flex'; msg.textContent = 'Loading ' + n + '...'; }
    try { if (typeof _OSS_DATA_AT !== 'undefined') delete _OSS_DATA_AT[n]; } catch (e) {}      // a real reload, not the 4-minute shortcut
    try { if (_cvIsMcx(n) && typeof _tfMcxLoad === 'function') await _tfMcxLoad(n); else if (typeof _ossScanLoad === 'function') await _ossScanLoad(n); } catch (e) { console.warn('[chart view] load failed', e); }      // commodities: the same loader the Trade Focus gates use (strike map, futures, option chain, OI/OBV)
    _CV = cx;
    // showPrictionProbabilty leaves the option chain in stockEntry.DATA; the stored oiData (what the chart reads) is normally written by the dashboard refresh, so write it here too.
    try {
        var sm1 = INSTRUMENT_SCORE_MAP[n], od = sm1 && sm1.stockEntry && sm1.stockEntry.DATA;
        if (!_cvIsMcx(n) && od && od.tableData && od.tableData.length) {
            sm1.oiData = od;
            try { sm1.oi_obv = computeOIScoreFromData(od, n); } catch (e) {}
            try { _gtbComputeOIExtras(n, od); } catch (e) {}
        } else if (!_cvIsMcx(n)) console.warn('[chart view] no option chain came back for ' + n + ' (check the expiry in Settings and the snapshot time)');
    } catch (e) { console.warn('[chart view] storing option chain failed', e); }
    var sm0 = INSTRUMENT_SCORE_MAP[n] || {};
    if (!(sm0.oiData && sm0.oiData.spotCandles && sm0.oiData.spotCandles.length)) {      // option-chain load gave no candles: fetch the futures / spot 5-minute candles directly
        try {
            var tok = null, mcx = _cvIsMcx(n);
            if (mcx) { var fe = (typeof COMMODITIES_FUTURE_INSTRUMENT_LIST !== 'undefined' ? COMMODITIES_FUTURE_INSTRUMENT_LIST : []).find(function (f) { return f.name === n; }); tok = fe && fe.instrument_token; }
            else tok = (typeof INSTRUMENT_TOKENS !== 'undefined' ? INSTRUMENT_TOKENS : {})[n];
            if (tok) {
                var r = mcx ? await getHistoricalDataUsingPromise(tok, _gtbMcxPrevDay(), _gtbMcxCurrDayTo(), '5minute') : await getHistoricalDataUsingPromise(tok, CURRENT_DAY, _gtbCurrDayTo(), '5minute');
                var cs = r && r.data && r.data.candles ? r.data.candles : [];
                cs = _gtbTrimCandles(cs, mcx ? MCX_CURRENT_DAY : undefined);
                if (cs.length) { _CV.fb[n] = cs; _CV.fbSig = _cvSnapSig(); }
            }
        } catch (e) { console.warn('[chart view] candle fetch failed', e); }
    }
    _CV = cx; _CVG.updatedAt = Date.now(); _cvSetStamp('updated ' + _cvHm(_CVG.updatedAt) + (_CVG.nextAt ? ' · next ' + _cvHm(_CVG.nextAt) : ''));
    _cvRender();
    _CVG.panes.forEach(function (o) { if (o !== cx && o.name === n) { _CV = o; _cvRender(); } });      // other panes showing the same instrument
    _CV = cx;
}

// Every name the chart can open: the F&O list, the indices and the commodities.
function _cvNameList() {
    var seen = {}, out = [];
    [].concat(_CV_NAMES, ['FINNIFTY', 'MIDCPNIFTY', 'NIFTY FIN SERVICE', 'NIFTY MID SELECT'], (typeof FO_LIST !== 'undefined' ? FO_LIST : []), (typeof WEIGHTED_STOCKS !== 'undefined' ? WEIGHTED_STOCKS : [])).forEach(function (n) { n = String(n || '').trim(); if (n && !seen[n]) { seen[n] = 1; out.push(n); } });
    return out;
}
function _cvOpenName(raw) {
    var q = String(raw || '').trim().toUpperCase(); if (!q) return;
    var list = _cvNameList(), hit = list.filter(function (n) { return n.toUpperCase() === q; })[0] || list.filter(function (n) { return n.toUpperCase().indexOf(q) === 0; })[0];
    if (!hit) { var m = _cvEl('cv-msg'); if (m) { m.style.display = 'flex'; m.textContent = '"' + raw + '" is not in the F&O list'; } return; }
    _cvSetPaneName(_CV, hit);
}
function _cvChipsHtml() {      // the shared top bar: how many charts, which layers, refresh all, update stamp
    var ap = _CVG.panes[_CVG.active], data = ap && ap.data;
    return '<span style="font-size:11px;color:var(--gtb-muted);margin-right:4px;">View</span>'
        + [['clean', 'Clean', 'Only the key levels: 9:15 levels, open, VWAP, nearest OI wall each side, previous day high/low, and the trade plan'], ['standard', 'Standard', 'Adds support/resistance zones and all the OI wall levels'], ['full', 'Full', 'Everything: day range, volume profile, OI change and OBV bars'], ['oiobv', 'OI / OBV only', 'Only the option-chain flow: wide OBV and OI change bars per strike, with the R1/R2/S1/S2 walls']].map(function (v) { var on = _CVG.view === v[0]; return '<button class="cv-view sv-pill-btn" data-v="' + v[0] + '" title="' + v[2] + '" style="font-size:11px;padding:2px 9px;margin-right:3px;' + (on ? 'border-color:var(--gtb-accent);color:var(--gtb-accent);font-weight:800;' : '') + '">' + v[1] + '</button>'; }).join('')
        + '<span style="margin:0 6px;border-left:1px solid var(--gtb-border);"></span>'
        + '<span style="font-size:11px;color:var(--gtb-muted);margin-right:4px;">Charts</span>'
        + [1, 2, 4, 6].map(function (n) { var on = _CVG.layout === n; return '<button class="cv-layout sv-pill-btn" data-n="' + n + '" title="Show ' + n + ' chart' + (n > 1 ? 's' : '') + ' at once" style="font-size:11px;padding:2px 9px;margin-right:3px;' + (on ? 'border-color:var(--gtb-accent);color:var(--gtb-accent);font-weight:800;' : '') + '">' + n + '</button>'; }).join('')
        + '<span style="margin:0 6px;border-left:1px solid var(--gtb-border);"></span>'
        + _CV_LAYERS.map(function (l) { var on = _CV_LAYER_STATE[l[0]], why = data && data.why && data.why[l[0]]; return '<button class="cv-layer sv-pill-btn" data-layer="' + l[0] + '" title="' + (why ? 'Nothing to draw (selected chart): ' + why.replace(/"/g, '') : 'Shown') + '" style="' + (why ? 'font-style:italic;text-decoration:line-through;' : '') + 'font-size:11px;padding:2px 8px;margin-right:3px;opacity:' + (on ? 1 : 0.45) + ';' + (on ? 'border-color:var(--gtb-accent);' : '') + '">' + l[1] + '</button>'; }).join('')
        + '<button id="cv-loadall" class="sv-pill-btn" style="font-size:11px;padding:2px 9px;margin-left:6px;" title="Reload candles and option chain for every chart shown">Refresh all</button>'
        + '<span id="cv-stamp" title="Every chart reloads on each 5-minute candle close while its market is open" style="margin-left:auto;font-size:11px;color:var(--gtb-muted);font-family:var(--gtb-mono);">' + (_CVG.stampTxt || '') + '</span>';
}
// The small header of one pane: which instrument, search, strikes, refresh, details.
function _cvPaneHead(cx) {
    var ph = cx.root && cx.root.querySelector('.cv-ph'); if (!ph) return;
    var nl = _CV_NAMES.indexOf(cx.name) < 0 ? _CV_NAMES.concat([cx.name]) : _CV_NAMES, st = 'font-size:11px;padding:2px 8px;';
    ph.innerHTML = '<select class="cv-psel" title="Instrument for this chart" style="font-size:11px;padding:2px 4px;background:var(--gtb-surface);color:var(--gtb-text);border:1px solid var(--gtb-border);">' + nl.map(function (n) { return '<option value="' + n + '"' + (n === cx.name ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select>'
        + '<input class="cv-search" list="cv-fo-list" placeholder="Any F&O stock" autocomplete="off" title="Type a symbol from the F&O list and press Enter" style="width:110px;font-size:11px;padding:2px 6px;background:var(--gtb-surface);color:var(--gtb-text);border:1px solid var(--gtb-border);">'
        + '<button class="cv-pstrikes sv-pill-btn" style="' + st + '" title="Open the Option Strike Search for this instrument: legs, strikes and premiums">Strikes</button>'
        + '<button class="cv-pzoom sv-pill-btn" data-f="0.7" style="' + st + '" title="Zoom in on the time axis (keeps the latest candle in place)">+</button>'
        + '<button class="cv-pzoom sv-pill-btn" data-f="1.4" style="' + st + '" title="Zoom out on the time axis">&minus;</button>'
        + '<button class="cv-preset sv-pill-btn" style="' + st + '" title="Reset the chart: fit all candles and let the price axis scale itself again">Reset</button>'
        + '<button class="cv-pload sv-pill-btn" style="' + st + '" title="Reload this chart\'s candles and option chain">Refresh</button>'
        + (true ? '<button class="cv-pdet sv-pill-btn" style="' + st + (cx.det ? 'border-color:var(--gtb-accent);' : '') + '" title="Full check chips (timing, agreement, risk...) instead of the small squares">Details</button>' : '');
}
function _cvSaveNames() { try { localStorage.setItem('GTB_CV_PANES', JSON.stringify(_CVG.panes.map(function (p) { return p.name; }))); localStorage.setItem('GTB_CV_LAYOUT', String(_CVG.layout)); } catch (e) {} }
function _cvSetPaneName(cx, nm) {
    _CV = cx; cx.name = nm; cx.fit = true; cx.lastN = null; cx.wsig = null; cx.prTried = null; cx.data = null; _cvStopPane(cx);
    _cvPaneHead(cx); _cvRender(); if (!(cx.data && cx.data.candles.length)) _cvLoad(cx); _cvSaveNames();
}
function _cvMarkActive() { if (_CVG.active >= _CVG.panes.length) _CVG.active = 0; _CVG.panes.forEach(function (p, i) { if (p.root) p.root.style.borderColor = (_CVG.panes.length > 1 && i === _CVG.active) ? 'var(--gtb-accent)' : 'var(--gtb-border)'; }); }
function _cvPaneFrom(el) {
    var p = jQ(el).closest('.cv-pane')[0], i = p ? parseInt(p.getAttribute('data-i'), 10) : _CVG.active, cx = _CVG.panes[i] || _CVG.panes[0];
    if (cx) { _CV = cx; _CVG.active = _CVG.panes.indexOf(cx); } return cx;
}
// (Re)build the grid for the chosen number of charts; instruments already shown stay, new panes take the next default instruments.
function _cvBuildPanes() {
    var grid = document.getElementById('cv-grid'); if (!grid) return;
    _CVG.panes.forEach(_cvStopPane);
    var n = _CVG.layout, names = [], saved = [], i;
    try { saved = JSON.parse(localStorage.getItem('GTB_CV_PANES') || '[]') || []; } catch (e) {}
    for (i = 0; i < n; i++) names.push((_CVG.panes[i] && _CVG.panes[i].name) || saved[i] || null);
    if (_CVG.pending) { names[0] = _CVG.pending; _CVG.pending = null; }
    for (i = 0; i < n; i++) if (!names[i]) names[i] = _CV_NAMES.filter(function (x) { return names.indexOf(x) < 0; })[0] || _CV_NAMES[i % _CV_NAMES.length];
    var cols = n === 1 ? 1 : (n === 6 ? 3 : 2), rows = Math.ceil(n / cols), h = '';
    grid.style.cssText = 'flex:1 1 0;min-height:0;display:grid;gap:3px;grid-template-columns:repeat(' + cols + ',minmax(0,1fr));grid-template-rows:repeat(' + rows + ',minmax(0,1fr));';
    for (i = 0; i < n; i++) h += '<div class="cv-pane" data-i="' + i + '" style="position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--gtb-border);">'
        + '<div class="cv-ph" style="display:flex;align-items:center;gap:4px;padding:3px 6px;border-bottom:1px solid var(--gtb-border);"></div>'
        + '<div style="position:relative;flex:1 1 0;min-height:0;"><div id="cv-chart" style="position:absolute;inset:0;"></div>'
        + '<div id="cv-checks" style="position:absolute;left:12px;top:50px;z-index:3;pointer-events:none;"></div>'
        + '<div id="cv-badge" style="position:absolute;left:12px;top:8px;z-index:3;background:var(--gtb-surface);border:1px solid var(--gtb-border);padding:3px 9px;"></div>'
        + '<div id="cv-msg" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;z-index:4;color:var(--gtb-muted);font-size:13px;background:var(--gtb-bg);"></div>'
        + '<div id="cv-tip" style="display:none;position:absolute;z-index:5;pointer-events:none;background:var(--gtb-surface2);border:1px solid var(--gtb-border);color:var(--gtb-text);font-size:11px;padding:3px 8px;max-width:340px;"></div></div></div>';
    grid.innerHTML = h;
    _CVG.panes = names.map(function (nm, k) { var c = _cvNewCtx(nm); c.root = grid.children[k]; return c; });
    if (_CVG.active >= n) _CVG.active = 0;
    _CVG.panes.forEach(function (c) { _CV = c; _cvPaneHead(c); _cvRender(); });
    _CV = _CVG.panes[_CVG.active]; _cvMarkActive(); jQ('#cv-bar').html(_cvChipsHtml()); _cvSaveNames();
    _cvLoadAll(false, true);
}
// Reload every chart shown (each instrument once; other panes on the same instrument redraw with it).
async function _cvLoadAll(onlyOpen, missingOnly) {
    var seen = {}, list = _CVG.panes.slice();
    for (var i = 0; i < list.length; i++) {
        var cx = list[i]; if (_CVG.panes.indexOf(cx) < 0 || seen[cx.name]) continue;
        if (onlyOpen && !_cvInSession(cx.name)) continue;
        if (missingOnly && cx.data && cx.data.candles.length) continue;
        seen[cx.name] = 1;
        try { await _cvLoad(cx); } catch (e) {}
    }
}

jQ(document).on('click', '.gtb-dv-chartview', function (e) { e.preventDefault(); _cvShowPopup(jQ(this).attr('data-name')); });
function _cvShowPopup(name) {
    _cvStop(); _CVG.panes = []; _CVG.snap = undefined;
    try { var lv = parseInt(localStorage.getItem('GTB_CV_LAYOUT'), 10); if ([1, 2, 4, 6].indexOf(lv) >= 0) _CVG.layout = lv; } catch (e) {}
    if (name) _CVG.pending = name;
    try { _cvApplyView(localStorage.getItem('GTB_CV_VIEW') || 'clean'); } catch (e) { _cvApplyView('clean'); }
    var html = '<div id="cv-wrap" style="position:absolute;inset:0;display:flex;flex-direction:column;background:var(--gtb-bg);color:var(--gtb-text);">'
        + '<div id="cv-bar" style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;padding:6px 10px;border-bottom:1px solid var(--gtb-border);">' + _cvChipsHtml() + '</div>'
        + '<datalist id="cv-fo-list">' + _cvNameList().map(function (n) { return '<option value="' + n + '">'; }).join('') + '</datalist>'
        + '<div id="cv-grid"></div></div>';
    showPopUpWindow('chart-view', html, 'Chart View', 1240, 740);
    var cls = 'popup-custom-style-chart-view';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html('<div style="display:flex;align-items:center;gap:6px;width:100%;"><i class="bi bi-bar-chart-line"></i><span style="font-weight:800;font-size:0.7rem;">CHART VIEW</span>' + popupWinControls(cls) + '</div>');
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
    jQ('.' + cls).find('.popupwindow_content').css({ overflow: 'hidden', padding: 0, position: 'relative' });
    jQ(document).off('.cv')
        .on('click.cv', '.cv-view', function () { _cvApplyView(this.getAttribute('data-v')); jQ('#cv-bar').html(_cvChipsHtml()); _CVG.panes.forEach(function (c) { _CV = c; _cvDraw(); }); _CV = _CVG.panes[_CVG.active] || _CV; })
        .on('click.cv', '.cv-layout', function () { _CVG.layout = parseInt(this.getAttribute('data-n'), 10) || 1; _cvBuildPanes(); })
        .on('click.cv', '.cv-layer', function () { var k = this.getAttribute('data-layer'); _CV_LAYER_STATE[k] = _CV_LAYER_STATE[k] ? 0 : 1; jQ('#cv-bar').html(_cvChipsHtml()); _CVG.panes.forEach(function (c) { _CV = c; _cvDraw(); }); _CV = _CVG.panes[_CVG.active] || _CV; })
        .on('click.cv', '#cv-loadall', function () { _cvLoadAll(); })
        .on('mousedown.cv', '.cv-pane', function () { var before = _CVG.active; _cvPaneFrom(this); if (before !== _CVG.active) { _cvMarkActive(); jQ('#cv-bar').html(_cvChipsHtml()); } })
        .on('change.cv', '.cv-psel', function () { _cvSetPaneName(_cvPaneFrom(this), this.value); })
        .on('click.cv', '.cv-pzoom', function () { var c = _cvPaneFrom(this); if (!c.chart) return; var f = parseFloat(this.getAttribute('data-f')) || 1; try { var r = c.chart.timeScale().getVisibleLogicalRange(); if (r) c.chart.timeScale().setVisibleLogicalRange({ from: r.to - (r.to - r.from) * f, to: r.to }); } catch (e) {} _cvDraw(); })
        .on('click.cv', '.cv-preset', function () { var c = _cvPaneFrom(this); if (!c.chart) return; try { c.chart.priceScale('right').applyOptions({ autoScale: true }); c.chart.timeScale().fitContent(); } catch (e) {} _cvDraw(); })
        .on('click.cv', '.cv-pload', function () { _cvLoad(_cvPaneFrom(this)); })
        .on('click.cv', '.cv-pstrikes', function () { var c = _cvPaneFrom(this); try { _ossOpenFor(c.name); } catch (e) { console.warn('[chart view] strike search failed', e); } })
        .on('click.cv', '.cv-pdet', function () { var c = _cvPaneFrom(this); c.det = !c.det; _cvPaneHead(c); _cvRender(); })
        .on('change.cv', '.cv-search', function () { _cvPaneFrom(this); _cvOpenName(this.value); })
        .on('keydown.cv', '.cv-search', function (e) { if (e.key === 'Enter') { _cvPaneFrom(this); _cvOpenName(this.value); } });
    _cvBuildPanes();
    // redraw each pane when its scales move; reload everything when the snapshot time or day changes
    _CVG.timer = setInterval(function () {
        if (!document.getElementById('cv-wrap')) { _cvStop(); return; }
        var ss = _cvSnapSig();
        if (_CVG.snap !== undefined && _CVG.snap !== ss) {
            _CVG.snap = ss; [_CV_FB, _CV_FUTC, _CV_FUTRAW].forEach(function (o) { Object.keys(o).forEach(function (k) { delete o[k]; }); });
            _CVG.panes.forEach(function (c) { c.fit = true; }); _cvLoadAll(); return;
        }
        _CVG.snap = ss;
        _CVG.panes.forEach(function (c) {
            if (!c.series || !c.chart) return; _CV = c;
            var sg = [c.series.priceToCoordinate(1000), c.series.priceToCoordinate(2000), JSON.stringify(c.chart.timeScale().getVisibleLogicalRange())].join('|');
            if (sg !== c.sig) { c.sig = sg; _cvDraw(); }
        });
        _CV = _CVG.panes[_CVG.active] || _CV;
    }, 120);
    _cvSchedule();
}

// Refresh on the 5-minute clock: 4 s after each boundary with the live feed (the candle has closed and the dashboard's own refresh uses the same offset), 10 s without it.
// Only while the market for this instrument is open and no snapshot time is set; the instrument's candles and option chain are reloaded, then everything is redrawn.
function _cvInSession(nm) {
    try {
        if (_cvIsMcx(nm)) return _tfMcxInSession();
        var d = new Date(Date.now() + 19800000), wd = d.getUTCDay(), m = d.getUTCHours() * 60 + d.getUTCMinutes();
        return wd >= 1 && wd <= 5 && m >= 9 * 60 + 15 && m <= 15 * 60 + 35;
    } catch (e) { return false; }
}
function _cvSetStamp(txt) { _CVG.stampTxt = txt; var el = document.getElementById('cv-stamp'); if (el) el.textContent = txt; }
function _cvHm(ms) { var d = new Date(ms + 19800000); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2) + ':' + ('0' + d.getUTCSeconds()).slice(-2); }
function _cvSchedule() {
    if (_CVG.slotTimer) { clearTimeout(_CVG.slotTimer); _CVG.slotTimer = null; }
    if (!document.getElementById('cv-wrap')) return;
    var off = ((typeof _lfLiveAllowed === 'function' && _lfLiveAllowed()) ? 4 : 10) * 1000, now = Date.now(), at = Math.ceil((now - off) / 300000) * 300000 + off;
    if (at <= now) at += 300000;
    _CVG.nextAt = at;
    _cvSetStamp((_CVG.updatedAt ? 'updated ' + _cvHm(_CVG.updatedAt) + ' · ' : '') + 'next ' + _cvHm(at));
    _CVG.slotTimer = setTimeout(async function () {
        if (!document.getElementById('cv-wrap')) return;
        if (!_cvSnapActive()) { try { await _cvLoadAll(true); } catch (e) {} }      // every chart whose market is open
        _cvSchedule();
    }, at - now);
}
