// ── Trade Focus (v29.421) ────────────────────────────────────────────────────────────────────────────────────────────────
// First tab of the dashboard: five questions a trade needs answered, in order, each as a traffic light and one plain sentence.
// Click a row for the evidence behind it. Nothing here is a new signal or score: every row reads what the app already computes
// (Final Verdict, Master Consensus, Level Decision, entry timing, range-plan check, exit signal, squeeze state). Heuristic, not
// back-tested, and it never places or changes an order. NIFTY 50 only for now (the index the Final Verdict is built around).
//   1 TRADEABLE TODAY?   market guard, range plan, dead zone, VIX, expiry day, data age
//   2 DIRECTION          Master Consensus (BANK NIFTY as the cross-check)
//   3 ENTRY & TIMING     Final Verdict headline (Level Decision) + the entry-timing checklist
//   4 RISK               the 9:15 plan stop, and what it means against your Account Capital x risk %
//   5 EXIT               exit signal and an active squeeze against the direction
var _TF_OPEN = {};
var _TF_TONE = { good: 'var(--gtb-green)', warn: 'var(--gtb-amber)', bad: 'var(--gtb-red)', none: 'var(--gtb-muted)' };
var _TF_TONE_TXT = { good: 'GREEN', warn: 'AMBER', bad: 'RED', none: 'n/a' };

function _tfFmt(n) { return Math.round(n).toLocaleString('en-IN'); }

var _TF_NAME = 'NIFTY 50';                 // instrument shown on the Focus tab
function _tfNames() {
    var out = ['NIFTY 50', 'NIFTY BANK', 'SENSEX'], add = function (n) { if (out.indexOf(n) === -1) out.push(n); };
    try { (typeof _TF_MCX_NAMES !== 'undefined' ? _TF_MCX_NAMES : []).forEach(add); } catch (e) {}
    try { (typeof _gtbMcxDashNames === 'function' ? _gtbMcxDashNames() : []).forEach(add); } catch (e) {}
    return out;
}
function _tfIsMcx(nm) { return nm && nm !== 'NIFTY 50' && nm !== 'NIFTY BANK' && nm !== 'SENSEX' && typeof _tfComputeMcx === 'function' && typeof _gtbIsMcxFuture === 'function' && _gtbIsMcxFuture(nm); }


// ── shared row builders (v29.589): the risk row, the exit row and the live-context adjustment are the same for indices, commodities and stocks ──
function _tfFmtN(x) { x = parseFloat(x); if (!isFinite(x)) return '-'; return Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-IN') : x.toFixed(2); }
// WHERE and WHEN for an actionable wall entry (v29.606): turns "LONG at the 25250 wall" and the live price into one instruction. For a LONG the wall is a support below price:
//   at the wall or just above it (within 0.15%): enter now around it; further above: wait for a pullback to it, do not chase; under it: the support may be failing, so wait for a
//   5-minute candle to close back above it (otherwise skip). A SHORT is the mirror image against a resistance wall. The 0.15% band and the close-back step are rules of thumb, not tested.
function _tfWhereWhen(dir, wall, ltp, stop) {
    try {
        wall = parseFloat(wall); ltp = parseFloat(ltp); stop = parseFloat(stop);
        if (!dir || !isFinite(wall) || !isFinite(ltp) || !wall || !ltp) return null;
        var long = dir > 0, side = long ? 'support' : 'resistance', word = long ? 'above' : 'below', other = long ? 'below' : 'above';
        var d = (long ? ltp - wall : wall - ltp) / wall * 100, pts = Math.abs(ltp - wall), W = _tfFmtN(wall), S = isFinite(stop) ? _tfFmtN(stop) : '';
        var stp = S ? ', stop ' + S : '';
        if (d < -0.03) return { st: 'under', txt: 'WAIT: price is ' + other + ' its ' + side + ' wall (' + _tfFmtN(pts) + ' pts). Enter if a 5-minute candle closes back ' + word + ' ' + W + stp + '. If it keeps ' + (long ? 'falling' : 'rising') + ', skip.' };
        if (d <= 0.15) return { st: 'now', txt: 'ENTER NOW: ' + (long ? 'buy' : 'sell') + ' around ' + W + (d > 0.03 ? ' to ' + _tfFmtN(ltp) : '') + stp + '.' };
        return { st: 'pullback', txt: 'WAIT for a pullback to ' + W + ' (' + _tfFmtN(pts) + ' pts ' + (long ? 'below' : 'above') + ' price); do not chase' + stp + '.' };
    } catch (e) { return null; }
}
// The wall-based verdict (_cmdBuildVerdict) for any name whose option chain is loaded; null otherwise.
function _tfWallVerdict(nm) {
    try {
        var sm = (typeof INSTRUMENT_SCORE_MAP !== 'undefined' && INSTRUMENT_SCORE_MAP[nm]) || {};
        if (!(sm.oiData && sm.oiData.tableData && sm.oiData.tableData.length)) return null;
        var pc = 0;
        try { pc = parseFloat(generateTrend(nm).change) || 0; } catch (e) { var op = parseFloat(sm.open), lt = parseFloat(sm.mcxLtp); pc = (op && lt) ? (lt - op) / op * 100 : 0; }
        var mpd = null; try { mpd = _gtbComputeMaxPainGEX(nm); } catch (e) {}
        return _cmdBuildVerdict(nm, sm.oiData, pc, mpd);
    } catch (e) { return null; }
}
// Rupees per 1.00 price move for ONE lot: the MCX table, else the futures lot size, else the lot size of the name's option rows (SENSEX has no futures here).
function _tfLotFor(nm) {
    try { if (typeof _TF_MCX_MULT !== 'undefined' && _TF_MCX_MULT[nm]) return { lot: _TF_MCX_MULT[nm], src: 'mcx' }; } catch (e) {}
    var und = nm === 'NIFTY BANK' ? 'BANKNIFTY' : nm === 'NIFTY 50' ? 'NIFTY' : nm;
    try { var f = FUTURE_INTRUMENT_LIST.find(function (x) { return x.name === und; }); var l = parseInt(f && f.lot_size, 10) || 0; if (l) return { lot: l, src: 'futures' }; } catch (e) {}
    try { var o = OPTION_STRIKE_LIST.find(function (x) { return x.name === und && x.lot_size; }); var l2 = parseInt(o && o.lot_size, 10) || 0; if (l2) return { lot: l2, src: 'options' }; } catch (e) {}
    return { lot: 0, src: '' };
}
// One line "Wall verdict: SHORT at 61100" for the Final Verdict card: the same wall-based verdict the Focus gates use, shown under the plan-based call so the two can be read side by side.
function _tfWallLineHtml(nm, fvDir) {
    try {
        var vd = _tfWallVerdict(nm);
        if (!vd) return '<div style="font-size:0.55rem;margin:2px 0 4px;color:var(--gtb-muted);"><b>Wall verdict:</b> not available yet (the option chain is not loaded)</div>';
        var act = (vd.label === 'LONG' || vd.label === 'SHORT'), d = act ? (vd.label === 'LONG' ? 1 : -1) : 0;
        var col = act ? (d > 0 ? 'var(--gtb-green)' : 'var(--gtb-red)') : 'var(--gtb-amber)';
        var txt = act ? vd.label + (vd.trade && vd.trade.entry != null ? ' at ' + vd.trade.entry : '') : String(vd.label) + (vd.location && vd.location.label ? ' (' + vd.location.label + ')' : '');
        var tip = []; [vd.context, vd.location, vd.confirmation].forEach(function (pp) { if (pp && pp.lines) pp.lines.forEach(function (x) { tip.push(typeof x === 'string' ? x : x.text); }); });
        var other = act && fvDir && d !== fvDir ? ' <span style="color:var(--gtb-amber);">points the other way from the call above</span>' : '';
        return '<div style="font-size:0.62rem;margin:2px 0 4px;color:var(--gtb-text);" title="' + String(tip.join(' | ')).replace(/<[^>]+>/g, '').replace(/"/g, '&quot;') + '"><b>Wall verdict:</b> <span style="font-weight:800;color:' + col + ';">' + txt + '</span>'
            + ' <span style="font-size:0.48rem;color:var(--gtb-muted);">from the OI walls, the same read as the Focus gates; the call above is built on the 9:15 plan</span>' + other + '</div>';
    } catch (e) { return ''; }
}
// RISK row. Two stop references when both exist: the wall verdict stop and the 9:15 pair (BSO/BST or ASO/AST). o.prefer picks which one leads the line
// ('pair' for the indices, whose entry plan is the 9:15 plan; 'verdict' otherwise); the other is listed in the detail with its own lots.
function _tfRiskRow(nm, dir, word, o) {
    o = o || {};
    var r = { key: 'risk', n: 4, title: 'RISK', tone: 'none', line: '', detail: [] };
    if (!dir) { r.line = 'No direction, so no stop to size against'; return r; }
    var sm = (typeof INSTRUMENT_SCORE_MAP !== 'undefined' && INSTRUMENT_SCORE_MAP[nm]) || {};
    var cands = [], vd = o.vd, pe = NaN, ps = NaN;
    if (vd && vd.trade && parseFloat(vd.trade.stop)) cands.push({ kind: 'verdict', src: 'the wall verdict stop', entry: parseFloat(vd.trade.entry), stop: parseFloat(vd.trade.stop) });
    if (sm.strikeMap && (o.mcx || (typeof _gtbIsMcxFuture === 'function' && _gtbIsMcxFuture(nm)))) { pe = parseFloat(dir > 0 ? sm.strikeMap.bstrikeOne : sm.strikeMap.ustrikeOne); ps = parseFloat(dir > 0 ? sm.strikeMap.bstrikeTwo : sm.strikeMap.ustrikeTwo); }
    else { var b = {}; try { b = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}')[nm] || {}; } catch (e) {} pe = parseFloat(dir > 0 ? b.bso : b.aso); ps = parseFloat(dir > 0 ? b.bst : b.ast); }
    if (pe && ps) cands.push({ kind: 'pair', src: 'the 9:15 ' + (dir > 0 ? 'BSO/BST' : 'ASO/AST') + ' level pair', entry: pe, stop: ps });
    if (!cands.length) { r.line = o.mcx ? 'No stop level yet: load ' + (o.lbl || nm) : 'No stop level for ' + nm + ' yet: run the 9:15 scan'; return r; }
    var prim = cands.filter(function (c) { return c.kind === (o.prefer === 'pair' ? 'pair' : 'verdict'); })[0] || cands[0];
    var other = cands.filter(function (c) { return c !== prim; })[0] || null;
    var cap = parseFloat(typeof MARGIN !== 'undefined' ? MARGIN : 0) || 0, pct = (typeof RISK_PCT_PER_TRADE !== 'undefined' ? RISK_PCT_PER_TRADE : 1);
    var lotInfo = _tfLotFor(nm), lot = lotInfo.lot, budget = cap * pct / 100;
    var size = function (c) { var step = Math.abs(c.entry - c.stop), perLot = lot ? step * lot : 0; return { step: step, pctp: c.entry ? step / c.entry * 100 : 0, perLot: perLot, lots: (perLot && budget) ? Math.floor(budget / perLot) : null }; };
    var sp = size(prim), base = 'Stop ' + _tfFmtN(prim.stop) + ', ' + _tfFmtN(sp.step) + ' pts (' + sp.pctp.toFixed(2) + '%) from ' + _tfFmtN(prim.entry);
    r.detail.push('The stop above comes from ' + prim.src + '. A dip or rally entry would use a nearer stop; this is the reference.');
    if (other) { var so = size(other); r.detail.push('The other reference, ' + other.src + ': stop ' + _tfFmtN(other.stop) + ', ' + _tfFmtN(so.step) + ' pts (' + so.pctp.toFixed(2) + '%) from ' + _tfFmtN(other.entry) + (so.lots != null ? ' · ' + (so.lots >= 1 ? so.lots + ' lot' + (so.lots > 1 ? 's' : '') + ' fit' : 'not even 1 lot fits') : '') + '.'); }
    if (!cap || !lot) {
        r.tone = 'warn'; r.line = base + (!cap ? '. Set Account Capital in Settings to see the rupee risk.' : '. The lot size for ' + nm + ' is not known (load the instruments / Data Load).');
        return r;
    }
    r.tone = sp.lots >= 1 ? 'good' : 'warn';
    r.line = base + ' · risk budget ₹' + _tfFmt(budget) + ' (' + pct + '% of ₹' + _tfFmt(cap) + ') · ' + (sp.lots >= 1 ? sp.lots + ' lot' + (sp.lots > 1 ? 's' : '') + ' fit' : 'not even 1 lot fits') + ' (futures-equivalent, ' + (lotInfo.src === 'mcx' ? '₹' + lot + ' per 1.00 move per lot' : 'lot ' + lot + (lotInfo.src === 'options' ? ', from the option rows' : '')) + ')';
    r.detail.push('One lot loses about ₹' + _tfFmt(sp.perLot) + ' to that stop' + (lotInfo.src === 'mcx' ? ' (the per-point value is assumed from the MCX contract size: check it against your broker\'s margin calculator)' : '') + '. Arithmetic on your own Settings (Account Capital and risk % per trade), not sizing advice; margin and brokerage are not included.');
    return r;
}
// EXIT row for a single instrument: its own trend against the direction, its own futures remark against it, or a squeeze against it.
function _tfExitRow(nm, dir, word) {
    var r = { key: 'exit', n: 5, title: 'EXIT', tone: 'none', line: '', detail: [] };
    if (!dir) { r.line = 'No direction, so no exit to watch'; return r; }
    if (nm === 'NIFTY 50') {
        var ex = 'HOLD'; try { ex = checkExitSignal(word); } catch (e) {}
        var advN = []; try { advN = _gtbSqueezeActiveNames(dir < 0); } catch (e) {}
        var advTxtN = dir < 0 ? 'short covering' : 'long unwinding';
        if (ex === 'EXIT' || advN.length) {
            r.tone = 'bad'; var whyN = [];
            if (ex === 'EXIT') whyN.push('trend or both index futures have turned against a ' + word);
            if (advN.length) whyN.push(advTxtN + ' is active on ' + advN.join(', '));
            r.line = 'Exit signal for a ' + word + ': ' + whyN.join('; ');
        } else { r.tone = 'good'; r.line = 'No exit signal for a ' + word + ' (trend intact, futures not both against it, no ' + advTxtN + ')'; }
        r.detail.push('Exit rule: a LONG exits when NIFTY is below BSO/BST or both index futures turn bearish; a SHORT exits when NIFTY is above ASO/AST or both turn bullish. BANK NIFTY and SENSEX use their own trend and futures remark instead.');
        r.detail.push('A squeeze against the direction (short covering for a SHORT, long unwinding for a LONG) is a fast one-way move: the red banner at the top of the page says so.');
        return r;
    }
    var sm = (typeof INSTRUMENT_SCORE_MAP !== 'undefined' && INSTRUMENT_SCORE_MAP[nm]) || {}, cs = {};
    try { cs = computeInstrumentScore(nm); } catch (e) {}
    var trend = cs.current_trend || 0, fut = sm.futures_trend || 0;
    var exit = dir > 0 ? (trend < 0 || fut < 0) : (trend > 0 || fut > 0);
    var sq = null; try { sq = _gtbShortCoveringSignal(nm); } catch (e) {}
    var adv = !!(sq && sq.ok && sq.active && sq.type === (dir > 0 ? 'LONG_UNWINDING' : 'SHORT_COVERING')), advTxt = dir < 0 ? 'short covering' : 'long unwinding';
    if (exit || adv) {
        r.tone = 'bad'; var why = [];
        if (trend * dir < 0) why.push('price has crossed against the ' + word);
        if (fut * dir < 0) why.push('the futures remark has turned against it');
        if (adv) why.push(advTxt + ' is active on ' + nm);
        r.line = 'Exit signal for a ' + word + ': ' + why.join('; ');
    } else { r.tone = 'good'; r.line = 'No exit signal for a ' + word + ' (trend intact, futures not against it, no ' + advTxt + ')'; }
    r.detail.push('Exit rule (single instrument): a LONG exits when the trend is below BSO/BST or the futures remark turns bearish; a SHORT exits when the trend is above ASO/AST or the remark turns bullish. This is more sensitive than the NIFTY 50 rule, which waits for both index futures.');
    return r;
}
// Live Context for a direction: STALE caps the confidence at LOW and turns a LONG / SHORT call into WAIT; WEAKENING lowers the confidence one level (the Final Verdict does the same for the indices).
function _tfLiveAdjust(nm, dir) {
    var o = { stale: false, weak: false, note: '' };
    try {
        if (dir && typeof _lxCompute === 'function') {
            var lx = _lxCompute(nm, dir);
            if (lx && lx.status === 'STALE') { o.stale = true; o.note = 'price check: view STALE (' + lx.against + ' checks against)'; }
            else if (lx && lx.status === 'WEAKENING') { o.weak = true; o.note = 'price check: view WEAKENING (' + lx.against + ' checks against)'; }
        }
    } catch (e) {}
    return o;
}

function _tfCompute(nm) {
    nm = nm || 'NIFTY 50';
    if (_tfIsMcx(nm)) return _tfComputeMcx(nm);                 // commodities (tradeFocusMcx.js)
    return _tfComputeStock(nm);                                 // indices and stocks: one builder; the wall verdict decides the entry, the 9:15 plan is context
}

// ── Focus gates for a stock (v29.584, aligned with the commodities in v29.588) ───────────────
// The same five rows for any name that is not an index or a commodity, built the way tradeFocusMcx.js builds them: direction = the stock's own Master
// Consensus outcome; entry = the wall-based verdict (_cmdBuildVerdict) with the consensus direction checked against the nearest OI wall when the
// verdict is flat (never green unless the verdict itself is an actionable LONG / SHORT); risk = the stock's own 9:15 stop; exit = single-instrument rule.
// Reads what the stock's own load cached (option chain, futures remark, scores: the Chart View Refresh or the strike search loads it). Rule-based, not back-tested.
function _tfComputeStock(nm) {
    var res = { name: nm, rows: [], v: null, greens: 0, live: true };
    var isIdx = (nm === 'NIFTY 50' || nm === 'NIFTY BANK' || nm === 'SENSEX');
    // the 9:15 plan (window._GTB_LC.strat) is built by the Level Confirmation card; rebuild it when the Dashboard tab is hidden, for the context line only
    if (isIdx) { try { if (!jQ('#gtb-pane-dashboard').is(':visible') && typeof _gtbLevelConfirmHtml === 'function') _gtbLevelConfirmHtml(); } catch (e) {} }
    var sm = (typeof INSTRUMENT_SCORE_MAP !== 'undefined' && INSTRUMENT_SCORE_MAP[nm]) || {};
    var loaded = !!(sm.oiData && sm.oiData.tableData && sm.oiData.tableData.length);
    var ltp = 0, pc = 0; try { var tr = generateTrend(nm); ltp = parseFloat(tr.ltp) || 0; pc = parseFloat(tr.change) || 0; } catch (e) {}
    var mpd = null; try { mpd = _gtbComputeMaxPainGEX(nm); } catch (e) {}
    var vd = null; try { if (loaded) vd = _cmdBuildVerdict(nm, sm.oiData, pc, mpd); } catch (e) {}
    var cn = null; try { cn = _gtbMasterConsensus(nm); } catch (e) {}
    var dir = cn ? (cn.outcome === 'GO LONG' ? 1 : cn.outcome === 'GO SHORT' ? -1 : 0) : 0;
    var word = dir > 0 ? 'LONG' : dir < 0 ? 'SHORT' : '';
    var rank = !cn ? 0 : (Math.abs(cn.net) >= 0.5 && cn.voting >= 4 && !cn.thin) ? 3 : (Math.abs(cn.net) >= 0.3 && cn.voting >= 3 && !cn.thin) ? 2 : 1;
    var lxa = _tfLiveAdjust(nm, dir); if (lxa.stale) rank = Math.min(rank, 1); else if (lxa.weak && rank > 1) rank--;
    // the indices also cross-check against the other index (NIFTY 50 against BANK NIFTY, the others against NIFTY 50), as the Final Verdict does
    var partnerNote = '';
    if (isIdx && dir) {
        try {
            var pn = nm === 'NIFTY 50' ? 'NIFTY BANK' : 'NIFTY 50', cbp = _gtbMasterConsensus(pn), dbp = cbp.outcome === 'GO LONG' ? 1 : cbp.outcome === 'GO SHORT' ? -1 : 0;
            if (dbp && dbp !== dir) { partnerNote = (pn === 'NIFTY 50' ? 'NIFTY' : 'BANK NIFTY') + ' consensus points the other way'; if (rank > 1) rank--; }
        } catch (e) {}
    }
    var conf = ['', 'LOW', 'MEDIUM', 'HIGH'][rank] || null;
    var vdFlat = !!(vd && !vd.ovxGate && vd.context && /No directional edge/.test(String(vd.context.label)));
    var loc = (vdFlat && dir && ltp) ? _tfMcxWall(sm, dir, ltp) : null;
    var live = true, notLiveTxt = '';
    try {
        var snap = (typeof _gtbHistTime === 'function') ? _gtbHistTime() : null;
        var past = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) && String(CURRENT_DAY).slice(0, 10) !== moment().format('YYYY-MM-DD');
        if (snap || past) { live = false; notLiveTxt = _gtbFinalAsOf(); }
    } catch (e) {}
    res.live = live;
    var cs = {}; try { cs = computeInstrumentScore(nm); } catch (e) {}
    // where price is against the expected day range (VIXU / VIXL from the India VIX): +1 at or above the top, -1 at or below the bottom
    var vixLo = NaN, vixHi = NaN, rangePos = 0;
    try { var trv = generateTrend(nm); if (trv && trv.vix) { vixLo = parseFloat(trv.vix.vixDDLower); vixHi = parseFloat(trv.vix.vixDDUpper); } } catch (e) {}
    if (ltp && isFinite(vixHi) && ltp >= vixHi) rangePos = 1; else if (ltp && isFinite(vixLo) && ltp <= vixLo) rangePos = -1;

    // the headline: the wall verdict, never louder than the consensus direction (same order as the commodities)
    var call = 'NO TRADE', headline = 'NO TRADE', col = 'var(--gtb-muted)';
    if (!loaded) { headline = 'WAIT — ' + nm + ' data not loaded yet (press Refresh on the chart)'; call = 'WAIT'; col = 'var(--gtb-amber)'; }
    else if (!dir) {
        var fb = [], fs = [];
        if (cn && cn.families) cn.families.forEach(function (g) { var lb = ({ zone: '9:15', trend: 'price vs levels', futures: 'futures', options: 'OI/OBV flow', orderflow: 'order flow', curve: 'curve' })[g.name] || g.name; if (g.dir > 0) fb.push(lb); else if (g.dir < 0) fs.push(lb); });
        var split = (fb.length && fs.length) ? ' (split: bullish ' + fb.join(', ') + ' vs bearish ' + fs.join(', ') + ')' : '';
        if (cn && cn.deadZone && Math.abs(cn.net) > 0.2) { headline = 'WAIT — ' + (cn.net > 0 ? 'LONG' : 'SHORT') + ' lean, but ' + nm + ' is in a dead zone' + split; call = 'WAIT'; col = 'var(--gtb-amber)'; }
        else { headline = (cn && cn.voting === 0 ? 'WAIT — not enough data yet' : 'NO TRADE — no clear direction') + split; }
    }
    else if (vd && (vd.label === 'LONG' || vd.label === 'SHORT') && ((vd.label === 'LONG') === (dir > 0))) { call = word; headline = word + ' — OI wall entry ' + (vd.trade ? 'at ' + vd.trade.entry : 'nearby'); col = dir > 0 ? 'var(--gtb-green)' : 'var(--gtb-red)'; }
    else if (vdFlat) {
        var wn = loc ? Math.round(loc.strike).toLocaleString('en-IN') + ' ' + (dir > 0 ? 'put' : 'call') + ' wall' : '';
        call = 'WAIT'; col = 'var(--gtb-amber)';
        if (loc && loc.at) headline = word + ' lean at the ' + wn + ' — verdict not actionable (composite score flat)';
        else if (loc) headline = word + ' lean — WAIT for the ' + wn + ' (' + loc.distPct.toFixed(1) + '% away); verdict not actionable';
        else headline = word + ' lean — WAIT (no OI wall found); verdict not actionable';
    }
    else if (vd && /^(LONG|SHORT) bias/.test(String(vd.label)) && ((/^LONG/.test(vd.label)) !== (dir > 0))) {
        call = 'WAIT'; col = 'var(--gtb-amber)';
        headline = 'WAIT — signals disagree: consensus ' + word + ', verdict ' + (/^LONG/.test(vd.label) ? 'LONG' : 'SHORT') + ' bias' + (vd.location && vd.location.label ? ' (' + vd.location.label + ')' : '');
    }
    else { call = 'WAIT'; headline = word + ' bias — WAIT' + (vd && vd.location && vd.location.label ? ' (' + vd.location.label + ')' : ''); col = 'var(--gtb-amber)'; }
    if (lxa.stale && call === word && word) { call = 'WAIT'; headline = 'WAIT — ' + word + ' signals, but price is moving against it'; col = 'var(--gtb-amber)'; }
    res.v = { call: call, headline: headline, col: col, conf: dir ? conf : null, dir: dir, consensus: cn, action: '', why: [], warn: [] };

    // 1. Tradeable
    (function () {
        var r = { key: 'tradeable', n: 1, title: 'TRADEABLE TODAY?', tone: 'good', line: '', detail: [] }, bad = [], warn = [], ok = [];
        if (!live) { r.tone = 'none'; r.line = 'Not live: ' + String(notLiveTxt).replace(/\s*\((snapshot|replay of that day)\)/, '') + ' (snapshot or replay)'; res.rows.push(r); return; }
        if (!loaded) { r.tone = 'warn'; r.line = nm + ' has no option chain loaded yet: press Refresh on the chart (or search it in the strike search) to load it'; res.rows.push(r); return; }
        try { var ms = _gtbHeadlineMarketSignal().ms; if (ms && ms.signal === 'NO TRADE') bad.push('Market guard: ' + (ms.reason || 'the VIX range guard is on')); else ok.push('Market guard clear'); } catch (e) {}
        try { var rc = _gtbRangePlanCheck(); if (rc && rc.on) bad.push('Range plan invalid: ' + rc.reasons.join('; ')); } catch (e) {}
        if (vd && vd.volWarn) warn.push(vd.volWarn.label + ' ' + vd.volWarn.value.toFixed(1) + ' is above ' + vd.volWarn.limit + ': high volatility, widen the stop and cut size (warning only)');
        else { try { var vx = parseFloat((JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}')['INDIA VIX'] || {}).ltp) || 0; if (vx > 18) warn.push('India VIX ' + vx.toFixed(1) + ' is ' + (vx > 25 ? 'HIGH' : 'ELEVATED') + ': widen the stop, cut size'); else if (vx > 0) ok.push('VIX ' + vx.toFixed(1)); } catch (e) {} }
        try { var dz = _gtbDeadZone(nm); if (dz) warn.push(nm + ' is in a dead zone (' + dz.lo + ' – ' + dz.hi + '): signals too weak to commit'); } catch (e) {}
        if (rangePos) warn.push(nm + ' is past ' + (rangePos > 0 ? 'VIXU ' + Math.round(vixHi) : 'VIXL ' + Math.round(vixLo)) + ' (the expected day range): momentum, not a reversal signal, so do not fade it, and a new entry in its direction is chasing');
        try { var la = window._GTB_LAST_REFRESH_AT, nowM = moment().hours() * 60 + moment().minutes(); if (la && nowM >= 560 && nowM <= 930 && Date.now() - la > 12 * 60000) warn.push('Last full refresh ' + Math.round((Date.now() - la) / 60000) + ' min ago'); } catch (e) {}
        try { var dte = _gtbDaysToExpiry(nm); if (dte != null && dte <= 1) warn.push('The contract expires in ' + dte + ' day' + (dte === 1 ? '' : 's') + ': thin liquidity and sharp moves near expiry'); } catch (e) {}
        if (isIdx) { try { var exd = _gtbExpiryDayNames(); if (exd.length) warn.push('Options expire today (' + exd.join(', ') + '): moves can be sharp and one-way, size smaller'); } catch (e) {} }
        r.tone = bad.length ? 'bad' : warn.length ? 'warn' : 'good';
        var all = bad.concat(warn); r.line = all.length ? all[0] + (all.length > 1 ? ' (+' + (all.length - 1) + ' more)' : '') : (ok.join(' · ') || 'No blocking conditions found'); r.detail = all.length ? all.concat(ok) : ok;
        res.rows.push(r);
    })();

    // 2. Direction
    (function () {
        var r = { key: 'direction', n: 2, title: 'DIRECTION', tone: 'none', line: '', detail: [] };
        if (!cn) { r.line = 'Consensus not available yet: load ' + nm; res.rows.push(r); return; }
        var nF = function (x) { return (x >= 0 ? '+' : '') + x.toFixed(2); };
        var stat = 'consensus net ' + nF(cn.net) + ', ' + cn.agree + ' of ' + cn.voting + ' signal groups agree' + (cn.thin ? ' (thin)' : '');
        var vBias = vd && vd.context ? vd.context.label : '';
        if (!dir && cn.deadZone && Math.abs(cn.net) > 0.2) { r.tone = 'warn'; r.line = (cn.net > 0 ? 'LONG' : 'SHORT') + ' lean, held back by the dead zone: ' + stat; }
        else if (!dir) { r.tone = 'bad'; r.line = 'No clear direction: ' + stat; }
        else {
            var conflict = /LONG bias/.test(vBias) && dir < 0 || /SHORT bias/.test(vBias) && dir > 0;
            r.tone = rank >= 2 && !conflict && !partnerNote ? 'good' : 'warn';
            r.line = word + ' (' + conf + ' confidence): ' + stat + (conflict ? '; the wall verdict says ' + vBias : '') + (partnerNote ? '; ' + partnerNote : '') + (lxa.note ? ' · ' + lxa.note : '');
        }
        if (cn.rows) cn.rows.forEach(function (x) { if (x.dir !== 0) r.detail.push((x.dir > 0 ? 'Long: ' : 'Short: ') + x.label + (x.note ? ' (' + x.note + ')' : '')); });
        try { var pr = (typeof _PS_CACHE !== 'undefined') ? _PS_CACHE[nm] : null; if (pr && pr.primary && pr.primary.ok && dir) { var pd = pr.primary.dir > 0 ? 1 : pr.primary.dir < 0 ? -1 : 0; r.detail.push('Positional screener view: ' + (pd > 0 ? 'bullish' : pd < 0 ? 'bearish' : 'neutral') + (pd && pd !== dir ? ' (against this direction)' : '')); } } catch (e) {}
        res.rows.push(r);
    })();

    // 3. Entry and timing (line leads with the headline, like the commodities, so a WAIT never reads as a go)
    (function () {
        var r = { key: 'entry', n: 3, title: 'ENTRY & TIMING', tone: 'none', line: '', detail: [] };
        if (!dir) { r.line = 'No direction, so nothing to time'; res.rows.push(r); return; }
        if (!vd) { r.line = 'Verdict not available yet'; res.rows.push(r); return; }
        var parts = [], tmTxt = '';
        try { _OSS_AGREE_LAST = null; _ossAgreement(nm, dir > 0 ? 'Bullish' : 'Bearish'); var ag = _OSS_AGREE_LAST; if (ag && ag.pct != null) parts.push('signals agree ' + ag.agree + '/' + ag.total + ' (' + ag.pct + '%)'); } catch (e) {}
        try { _OSS_TIMING_LAST = null; _ossTimingFor(nm, dir, null, null); var t = _OSS_TIMING_LAST; if (t && t.pct != null) tmTxt = ((call === word && word) ? 'timing ' : 'timing if entered now: ') + t.pct + '% ' + t.label; } catch (e) {}
        if (tmTxt) parts.push(tmTxt);
        r.tone = vd.ovxGate ? 'bad' : (call === word && word) ? 'good' : 'warn';
        r.line = headline + (parts.length ? ' · ' + parts.join(' · ') : '');
        if (rangePos && rangePos === dir) {
            r.line += ' · already past the expected day range (chasing)';
            r.detail.push(nm + ' is already past ' + (rangePos > 0 ? 'VIXU ' + Math.round(vixHi) : 'VIXL ' + Math.round(vixLo)) + ', the edge of the expected day range from the India VIX. A ' + word + ' now follows a move that has used up its usual range: it can run on, but it is momentum, not a fresh start. The colour above is unchanged; this is a warning.');
        }
        if (call === word && word && vd && vd.trade) {
            var ww = _tfWhereWhen(dir, vd.trade.entry, ltp, vd.trade.stop);
            if (ww) { r.line += ' · ' + ww.txt; r.detail.unshift('Where and when: ' + ww.txt + ' The entry is the wall itself, not a breakout above or below it; the stop is 0.4% beyond the wall. The 0.15% band and the close-back step are rules of thumb, not tested.'); }
        }
        if (vdFlat) {
            r.detail.push('The wall verdict is not actionable: its composite score is within +-3, so it has no bias of its own and its wall check is skipped. It reads LONG / SHORT only when the score is outside +-3, a wall is within 0.35% of price and futures and OI/OBV agree. The consensus direction is checked against the nearest OI wall instead, and that read is never green.');
            if (loc) r.detail.push('Nearest ' + (dir > 0 ? 'support' : 'resistance') + ' wall: ' + Math.round(loc.strike).toLocaleString('en-IN') + ' (' + loc.tier + '), ' + loc.distPct.toFixed(2) + '% from ' + Math.round(ltp).toLocaleString('en-IN') + (loc.at ? ' (at the wall)' : '') + '.');
            else r.detail.push('No ranked ' + (dir > 0 ? 'put-writing' : 'call-writing') + ' wall was found in the option chain loaded, so there is no level to enter at.');
        }
        [vd.context, vd.location, vd.confirmation].forEach(function (pp) { if (pp && pp.lines) pp.lines.forEach(function (x) { r.detail.push(typeof x === 'string' ? x : x.text); }); });
        if (isIdx) {
            // the 9:15 combo plan is a high-level plan that may or may not play out, so it is shown as context and never decides the entry (same as the commodities, which have none)
            try {
                var stp = window._GTB_LC && window._GTB_LC.strat;
                if (stp && stp.outcome) {
                    r.line += ' · 9:15 plan (context): ' + stp.outcome + (stp.level ? ' ' + String(stp.level).split(/\s[—–-]\s/)[0] : '');
                    var fvh = null; try { fvh = _gtbFinalVerdict(nm); } catch (e) {}
                    r.detail.push('9:15 plan (context only, does not decide this gate): ' + stp.outcome + (stp.level ? ', ' + stp.level : '') + '.' + (fvh && fvh.headline ? ' The Final Verdict card on the Dashboard tab, which is built on that plan, reads: ' + String(fvh.headline).replace(/<[^>]+>/g, '') + '.' : ''));
                }
            } catch (e) {}
        }
        if (parts.length) r.detail.push('Signal agreement and Entry timing are the Option Strike Search checklists; timing is for entering right now and is not a signal on its own.');
        res.rows.push(r);
    })();

    // 4. Risk
    res.rows.push(_tfRiskRow(nm, dir, word, { vd: vd, prefer: 'verdict' }));

    // 5. Exit
    res.rows.push(_tfExitRow(nm, dir, word));

    res.greens = res.rows.filter(function (x) { return x.tone === 'good'; }).length;
    return res;
}

// compact = the strip inside the Commodities popup (no instrument chips, no review button, smaller headline)
function _tfHtml(res, compact, narrow) {      // narrow: a side panel (the Chart View inspector): each row is two lines, title and status on top, the sentence full width below
    var v = res.v, G = 'var(--gtb-green)', M = 'var(--gtb-muted)';
    var head = v ? v.headline : 'Verdict not available yet: run a refresh';
    var hcol = v ? v.col : M;
    var asOf = ''; try { asOf = _gtbFinalAsOf(); } catch (e) {}
    var confCol = v && v.conf === 'HIGH' ? G : v && v.conf === 'MEDIUM' ? 'var(--gtb-amber)' : M;
    var judged = res.rows.filter(function (x) { return x.tone !== 'none'; }).length;      // n/a rows cannot be green, so they are not counted against the total
    var chips = '';
    if (!compact) {
        var _tfList = _tfNames(); if (_tfList.indexOf(res.name) === -1) _tfList = _tfList.concat([res.name]);
        chips = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">' + _tfList.map(function (n) {
            var on = n === res.name;
            return '<button class="tf-name gtb-win-btn" data-name="' + n + '" style="width:auto;font-size:0.58rem;padding:3px 12px;' + (on ? 'background:var(--gtb-accent);color:#fff;font-weight:800;' : '') + '">' + n + '</button>';
        }).join('')
            + '<input id="tf-search" list="tf-fo-list" placeholder="Any F&O stock" autocomplete="off" title="Type a symbol and press Enter: the same five gates for a stock (its option chain is loaded if needed)" style="width:130px;font-size:0.58rem;padding:3px 8px;background:var(--gtb-surface);color:var(--gtb-text);border:1px solid var(--gtb-border);">'
            + '<datalist id="tf-fo-list">' + (typeof _cvNameList === 'function' ? _cvNameList() : []).map(function (n) { return '<option value="' + n + '">'; }).join('') + '</datalist>'
            + (typeof _cvLinkHtml === 'function' ? '<span style="font-size:0.6rem;align-self:center;">' + _cvLinkHtml(res.name, true) + '</span>' : '') + '</div>';
    }
    var h = '<div style="padding:' + (compact ? '4px 0' : '12px 16px;max-width:980px') + ';">' + chips
        + '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;padding:' + (compact ? '6px 10px' : '10px 14px') + ';background:var(--gtb-surface);border-left:5px solid ' + hcol + ';">'
        +   '<span style="font-weight:900;font-size:' + (narrow ? '0.74rem' : compact ? '0.8rem' : '1.2rem') + ';color:' + hcol + ';">' + head + '</span>'
        +   (v && v.conf ? '<span style="font-weight:800;font-size:0.55rem;color:' + confCol + ';border:1px solid ' + confCol + ';padding:1px 6px;">CONFIDENCE ' + v.conf + '</span>' : '')
        +   '<span style="' + (narrow ? 'flex:1 1 100%;' : 'margin-left:auto;') + 'font-size:0.6rem;color:' + M + ';"><b style="color:' + (judged && res.greens === judged ? G : 'var(--gtb-text)') + ';">' + res.greens + ' of ' + judged + '</b> gates green' + (judged < res.rows.length ? ' (' + (res.rows.length - judged) + ' n/a)' : '') + ' · ' + res.name + ' · as of ' + asOf + '</span>'
        +   (compact ? '' : '<button id="tf-review-btn" class="gtb-win-btn" style="width:auto;font-size:0.55rem;padding:3px 10px;" title="Matches your trades to the five gate states at entry"><i class="bi bi-clipboard-data"></i> End-of-day review (' + (typeof _tfLogLoad === 'function' ? _tfLogLoad(null, res.name).length : 0) + ' logged)</button>')
        + '</div>';
    var rowCls = compact ? 'tf-crow' : 'tf-row', pad = compact ? '6px 10px' : '9px 14px';
    res.rows.forEach(function (r) {
        var col = _TF_TONE[r.tone], open = !!_TF_OPEN[r.key];
        h += '<div class="' + rowCls + '" data-tf="' + r.key + '" style="display:flex;align-items:center;' + (narrow ? 'flex-wrap:wrap;gap:3px 8px;' : 'gap:10px;') + 'padding:' + pad + ';margin-top:6px;background:var(--gtb-surface);border-left:5px solid ' + col + ';cursor:pointer;user-select:none;" title="Click for the evidence behind this row">'
            + '<span style="flex:0 0 auto;width:11px;height:11px;border-radius:50%;background:' + col + ';"></span>'
            + '<span style="' + (narrow ? 'flex:1 1 0;' : 'flex:0 0 150px;') + 'font-weight:800;font-size:0.62rem;letter-spacing:0.05em;color:var(--gtb-text);">' + r.n + ' &nbsp;' + r.title + '</span>'
            + '<span style="' + (narrow ? 'order:9;flex:1 1 100%;padding-left:19px;font-size:0.66rem;' : 'flex:1 1 auto;font-size:0.72rem;') + 'line-height:1.4;color:var(--gtb-text);">' + r.line + '</span>'
            + '<span style="flex:0 0 auto;font-weight:800;font-size:0.5rem;color:' + col + ';letter-spacing:0.05em;">' + _TF_TONE_TXT[r.tone] + '</span>'
            + '<i class="bi bi-chevron-' + (open ? 'down' : 'right') + '" style="font-size:0.55rem;color:' + M + ';"></i>'
            + '</div>'
            + '<div class="tf-detail" data-tf="' + r.key + '" style="' + (open ? '' : 'display:none;') + (narrow ? 'padding:5px 10px 7px 24px;' : 'padding:6px 14px 8px 36px;') + 'background:var(--gtb-surface2);border-left:5px solid ' + col + ';font-size:0.58rem;line-height:1.55;color:' + M + ';">'
            + (r.detail.length ? '<ul style="margin:0 0 0 14px;padding:0;">' + r.detail.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' : 'No further detail.')
            + '</div>';
    });
    if (!compact) h += '<div style="margin-top:10px;font-size:0.5rem;color:' + M + ';line-height:1.5;">Green = the gate passes, amber = caution, red = blocks the trade, n/a = nothing to judge yet. '
        + 'Each row reads what the dashboard already computes (nothing new is calculated here); the cards behind it are unchanged on the Dashboard tab. '
        + 'Rule-based and not back-tested. It does not place or change orders.</div>';
    return h + '</div>';
}

function _tfRender(res) {
    var $p = jQ('#gtb-pane-focus');
    if (!$p.length) return;
    try { $p.html((typeof _fbHtml === 'function' ? _fbHtml() : '') + _tfHtml(res && res.name === _TF_NAME ? res : _tfCompute(_TF_NAME))); }
    catch (e) { $p.html('<div style="padding:12px;font-size:0.6rem;color:var(--gtb-red);">Trade Focus could not be built: ' + (e && e.message ? e.message : e) + '</div>'); try { console.log('[trade-focus]', e); } catch (e2) {} }
}
// The same five gates as a compact strip in the Commodities popup, for the commodity selected there (#cmd-crude-focus).
function _tfRenderCmd() {
    var $p = jQ('#cmd-crude-focus');
    if (!$p.length) return;
    var name = (typeof _CMD !== 'undefined' && _CMD.activeName) ? _CMD.activeName : null;
    if (!name || !_tfIsMcx(name)) { $p.html('<div style="padding:4px 8px;font-size:0.5rem;color:var(--gtb-muted);">Focus gates are not available for ' + (name || 'this instrument') + '.</div>'); return; }
    // the Commodities popup loads its own commodity, so the gates strip must not start a second load of the same data
    try { window._TF_SKIP_LOAD = true; $p.html(_tfHtml(_tfCompute(name), true)); window._TF_SKIP_LOAD = false; }
    catch (e) { $p.html('<div style="padding:4px 8px;font-size:0.5rem;color:var(--gtb-red);">Focus gates could not be built.</div>'); try { console.log('[trade-focus cmd]', e); } catch (e2) {} }
}

jQ(document).on('click', '.tf-row', function () {
    var k = jQ(this).attr('data-tf');
    _TF_OPEN[k] = !_TF_OPEN[k];
    _tfRender();
});
jQ(document).on('click', '.tf-crow', function () {
    var k = jQ(this).attr('data-tf');
    _TF_OPEN[k] = !_TF_OPEN[k];
    _tfRenderCmd();
});
jQ(document).on('change keydown', '#tf-search', function (e) {
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    var nm = String(this.value || '').trim().toUpperCase(); if (!nm) return;
    _TF_NAME = nm; _tfRender();
    // a stock the dashboard has not loaded yet: load its option chain + futures once, then redraw
    try {
        var sm = INSTRUMENT_SCORE_MAP[nm];
        if (!(sm && sm.oiData && sm.oiData.tableData) && typeof _ossScanLoad === 'function') _ossScanLoad(nm).then(function () { if (_TF_NAME === nm) _tfRender(); }).catch(function () {});
    } catch (e2) {}
});
jQ(document).on('click', '.tf-name', function () {
    _TF_NAME = jQ(this).attr('data-name') || 'NIFTY 50';
    _tfRender();
});
