// ── Trade Focus for commodities (v29.423) ────────────────────────────────────────────────────────────────────────────────
// The same five gates as the NIFTY 50 Focus tab (tradeFocus.js), built for one MCX commodity (GOLDM, SILVERM, CRUDEOILM, ...) from the
// pieces the Commodities popup already computes: the commodity Verdict (_cmdBuildVerdict: volatility gate, composite bias, nearest
// OI wall, signal agreement), the Master Consensus, the contract's own futures remark and squeeze state, and the strike levels.
// Nothing new is calculated; rule-based, not back-tested; never places an order.
//   1 TRADEABLE TODAY?   volatility gate (OVX / GVZ / VXSLV), session, dead zone, past the expected day range, expiry, price present
//   2 DIRECTION          Master Consensus for the commodity
//   3 ENTRY & TIMING     the commodity Verdict (wall / dead zone, signals agree) + the entry-timing checklist
//   4 RISK               verdict stop (or the 9:15-style ASO/AST level) in points and %, and rupees per lot where the contract size is known
//   5 EXIT               trend or futures turned against the direction, or a squeeze against it
// ₹ per 1.00 price move per lot, from the MCX contract sizes (GOLDM 100 g quoted per 10 g, SILVERM 5 kg per kg, CRUDEOILM 10 bbl, ...).
// Assumed, not read from Kite: check against your broker's margin calculator before relying on the rupee figure.
var _TF_MCX_MULT = { GOLDM: 10, GOLD: 100, SILVERM: 5, SILVER: 30, SILVERMIC: 1, CRUDEOILM: 10, CRUDEOIL: 100, NATGASMINI: 250, NATURALGAS: 1250 };
var _TF_MCX_NAMES = ['GOLDM', 'SILVERM', 'CRUDEOILM'];

// ── Loading the commodity's data by itself ───────────────────────────────────────────────────────────────────────────────
// CRUDEOILM is loaded at every full refresh (_refreshMCX in commonShowPopupWindow). GOLDM and SILVERM were only ever loaded by the MCX
// Dashboard or the Commodities popup, so their gates said "load it first" until you opened one. This loads what the gates read (strike levels
// via showTopChartMCX, the futures remark and live price, the option chain with its OI/OBV score), the same calls _refreshMCX makes, with no
// screen of its own. It runs (1) when a commodity's gates are drawn and its data is missing, at most once every 2 minutes, and (2) at each full
// refresh for _TF_MCX_AUTO (names the refresh does not load itself), when the copy is older than 4 minutes.
var _TF_MCX_AUTO = ['GOLDM', 'SILVERM'];
var _TF_MCX_LOADING = {}, _TF_MCX_TRIED = {}, _TF_MCX_LOADED_AT = {};
function _tfMcxNeedsData(name) {
    var sm = INSTRUMENT_SCORE_MAP[name] || {};
    return !(sm.oiData && sm.oiData.tableData && sm.oiData.tableData.length) || !sm.strikeMap || !sm.futures_trend_remark;
}
async function _tfMcxLoad(name) {
    _TF_MCX_LOADING[name] = true; _TF_MCX_TRIED[name] = Date.now();
    try {
        try { await showTopChartMCX(name); } catch (e) {}                       // strikeMap + open (no screen needed: it no-ops without a container)
        var res = await showFutureDetailsMCX(name);
        if (res) {
            var sm = INSTRUMENT_SCORE_MAP[name] || (INSTRUMENT_SCORE_MAP[name] = {});
            var l = parseFloat(res['ltp']); if (l) sm.mcxLtp = l;
            sm.futures_trend = getFuturesTrendScore(res['REMARK']); sm.futures_trend_remark = res['REMARK']; sm.avwap = res['vwapPrice'] || 0;
            sm.oi_obv = 0;
            await showPrictionProbabiltyMCX(name, res);
            var cached = sm.stockEntry, oiData = cached && cached['DATA'];
            if (oiData && oiData.tableData && oiData.tableData.length) sm.oiData = oiData;
            try { showOIOBVBarChart(name); } catch (e) {}                         // sets the OI/OBV sub-score the composite and consensus read
            try { sm.score = computeInstrumentScore(name); } catch (e) {}
        }
        _TF_MCX_LOADED_AT[name] = Date.now();
    } catch (e) { try { console.log('[trade-focus mcx load]', name, e); } catch (e2) {} }
    delete _TF_MCX_LOADING[name];
    try { if (typeof _tfRender === 'function' && typeof _TF_NAME !== 'undefined' && _TF_NAME === name && jQ('#gtb-pane-focus').is(':visible')) _tfRender(); } catch (e) {}
}
function _tfMcxEnsure(name, force) {
    if (_TF_MCX_LOADING[name] || window._TF_SKIP_LOAD) return false;
    var now = Date.now();
    if (!force && _TF_MCX_TRIED[name] && now - _TF_MCX_TRIED[name] < 120000) return false;
    if (force && _TF_MCX_LOADED_AT[name] && now - _TF_MCX_LOADED_AT[name] < 240000 && !_tfMcxNeedsData(name)) return false;
    _tfMcxLoad(name);
    return true;
}
// Called at every full refresh (tradeFocusLog.js _tfTick). The refresh itself now loads GOLDM / SILVERM (commonShowPopupWindow, same step as
// crude), so this is only the fallback: if something the gates read is still missing afterwards (that load failed), try once more in the background.
function _tfMcxAutoLoad() {
    try {
        var lv = _tfMcxLive();
        if (lv.live && !_tfMcxInSession()) return;
        _TF_MCX_AUTO.forEach(function (n) { if (typeof _gtbIsMcxFuture === 'function' && _gtbIsMcxFuture(n) && _tfMcxNeedsData(n)) _tfMcxEnsure(n); });
    } catch (e) {}
}

function _tfMcxLive() {
    try {
        if (typeof _gtbHistTime === 'function' && _gtbHistTime()) return { live: false, why: _gtbFinalAsOf() };
        var real = moment().format('YYYY-MM-DD'), cur = (typeof MCX_CURRENT_DAY !== 'undefined' && MCX_CURRENT_DAY) ? String(MCX_CURRENT_DAY).slice(0, 10) : real;
        if (cur !== real) return { live: false, why: 'MCX day ' + cur };
    } catch (e) {}
    return { live: true, why: '' };
}
function _tfMcxInSession() {
    var d = new Date(), day = d.getDay(), m = d.getHours() * 60 + d.getMinutes();
    return day >= 1 && day <= 5 && m >= 9 * 60 && m <= 23 * 60 + 55;
}
// Nearest ranked OI wall for a direction: support (put writing) for a LONG, resistance (call writing) for a SHORT, from the chain already
// loaded for the commodity (the same _gtbFindWalls the OI chart labels S1/R1 with). at = within 0.35% of price (the same band the commodity
// Verdict calls "at a wall"). Null when no chain or no wall.
function _tfMcxWall(sm, dir, ltp) {
    try {
        var td = sm && sm.oiData && sm.oiData.tableData;
        if (!td || !td.length || !ltp) return null;
        var w = _gtbFindWalls(td, 0, ltp), list = (dir > 0 ? w.support : w.resistance) || [], best = null;
        list.forEach(function (x) {
            var d = Math.abs(x.strike - ltp) / ltp * 100;
            if (!best || d < best.distPct) best = { strike: x.strike, distPct: d, tier: x.tier, at: d <= 0.35 };
        });
        return best;
    } catch (e) { return null; }
}
function _tfMcxLabel(name) { try { return _cmdMeta(name).label || name; } catch (e) { return name; } }

function _tfComputeMcx(name) {
    var res = { name: name, rows: [], v: null, greens: 0, live: true, mcx: true };
    var sm = INSTRUMENT_SCORE_MAP[name] || {};
    var lv = _tfMcxLive();
    res.live = lv.live;
    var ltp = parseFloat(sm.mcxLtp) || 0;
    if (!ltp) { try { ltp = parseFloat((JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}')[name] || {}).ltp) || 0; } catch (e) {} }
    var open = parseFloat(sm.open) || 0;
    var pc = (open && ltp) ? (ltp - open) / open * 100 : 0;
    var haveData = !!(sm.oiData && sm.oiData.tableData && sm.oiData.tableData.length) || !!sm.futures_trend_remark;
    // anything the gates read is missing: load it in the background (once per 2 minutes) and redraw when it arrives
    var loadingNow = false;
    if (_tfMcxNeedsData(name)) { _tfMcxEnsure(name); loadingNow = !!_TF_MCX_LOADING[name]; }
    var mpd = null; try { mpd = _gtbComputeMaxPainGEX(name); } catch (e) {}
    var vd = null; try { vd = _cmdBuildVerdict(name, sm.oiData, pc, mpd); } catch (e) {}
    var cn = null; try { cn = _gtbMasterConsensus(name); } catch (e) {}
    var dir = cn ? (cn.outcome === 'GO LONG' ? 1 : cn.outcome === 'GO SHORT' ? -1 : 0) : 0;
    var word = dir > 0 ? 'LONG' : dir < 0 ? 'SHORT' : '';
    var rank = !cn ? 0 : (Math.abs(cn.net) >= 0.5 && cn.voting >= 4 && !cn.thin) ? 3 : (Math.abs(cn.net) >= 0.3 && cn.voting >= 3 && !cn.thin) ? 2 : 1;
    var conf = ['', 'LOW', 'MEDIUM', 'HIGH'][rank] || null;
    var lbl = _tfMcxLabel(name);
    // The commodity verdict has its own bias from the composite score alone (within +-3 = "no directional edge") and then skips its wall
    // check. When the consensus has a direction but the verdict is flat, the consensus direction is checked against the nearest ranked OI
    // wall here instead, the way the NIFTY entry works, so the Direction and Entry rows speak about the same direction.
    var vdFlat = !!(vd && !vd.ovxGate && vd.context && /No directional edge/.test(String(vd.context.label)));
    var loc = (vdFlat && dir && ltp) ? _tfMcxWall(sm, dir, ltp) : null;
    // the headline: the commodity verdict, but never louder than the consensus direction
    var call = 'NO TRADE', headline = 'NO TRADE', col = 'var(--gtb-muted)';
    if (vd && vd.ovxGate) { var vl = (vd.context && vd.context.label) ? String(vd.context.label) : 'volatility too high'; headline = /^NO TRADE/.test(vl) ? vl : 'NO TRADE — ' + vl; col = 'var(--gtb-red)'; }
    else if (!haveData || (loadingNow && !(sm.strikeMap && sm.oiData))) { headline = loadingNow ? 'WAIT — loading ' + lbl + '…' : 'WAIT — ' + lbl + ' data not loaded yet (retrying)'; call = 'WAIT'; col = 'var(--gtb-amber)'; }
    else if (!dir) { headline = 'NO TRADE — no clear direction'; col = 'var(--gtb-muted)'; }
    else if (vd && (vd.label === 'LONG' || vd.label === 'SHORT') && ((vd.label === 'LONG') === (dir > 0))) { call = word; headline = word + ' — ' + (vd.trade ? 'at ' + vd.trade.entry : 'wall nearby'); col = dir > 0 ? 'var(--gtb-green)' : 'var(--gtb-red)'; }
    else if (vdFlat) {
        // Never actionable from here: the commodity verdict's own LONG / SHORT ("actionable": composite outside +-3, a wall within 0.35%, futures
        // and OI agreeing) is the strict condition, and this looser consensus-plus-wall read must not look as strong as it.
        var wn = loc ? Math.round(loc.strike).toLocaleString('en-IN') + ' ' + (dir > 0 ? 'put' : 'call') + ' wall' : '';
        call = 'WAIT'; col = 'var(--gtb-amber)';
        if (loc && loc.at) headline = word + ' lean at the ' + wn + ' — verdict not actionable (composite score flat)';
        else if (loc) headline = word + ' lean — WAIT for the ' + wn + ' (' + loc.distPct.toFixed(1) + '% away); verdict not actionable';
        else headline = word + ' lean — WAIT (no OI wall found); verdict not actionable';
    }
    else { call = 'WAIT'; headline = word + ' bias — WAIT' + (vd && vd.location && vd.location.label ? ' (' + vd.location.label + ')' : ''); col = 'var(--gtb-amber)'; }
    res.v = { call: call, headline: headline, col: col, conf: dir ? conf : null, dir: dir, consensus: cn, action: '', why: [], warn: [] };

    // ── 1. Tradeable today? ──
    (function () {
        var r = { key: 'tradeable', n: 1, title: 'TRADEABLE TODAY?', tone: 'good', line: '', detail: [] };
        if (!lv.live) { r.tone = 'none'; r.line = 'Not live: ' + lv.why; r.detail.push('The dashboard is showing an earlier moment or day, so the live gates do not apply.'); res.rows.push(r); return; }
        if (!_tfMcxInSession()) { r.tone = 'none'; r.line = 'The MCX session is closed (09:00 to 23:55, Monday to Friday)'; res.rows.push(r); return; }
        var bad = [], warn = [], ok = [];
        if (vd && vd.volWarn) warn.push(vd.volWarn.label + ' ' + vd.volWarn.value.toFixed(1) + ' is above ' + vd.volWarn.limit + ': high volatility, widen the stop and cut size (warning only)');
        else if (vd && vd.context && vd.context.lines && vd.context.lines[0]) ok.push(vd.context.lines[0]);
        if (!ltp) warn.push('No live price for ' + lbl + ' yet');
        try { var dz = _gtbDeadZone(name); if (dz) warn.push(lbl + ' is in a dead zone (' + dz.lo + ' – ' + dz.hi + '): signals too weak to commit'); } catch (e) {}
        try {
            var up = parseFloat(sm.strikeMap && sm.strikeMap.vixDDUpper), lo = parseFloat(sm.strikeMap && sm.strikeMap.vixDDLower);
            if (ltp && up && ltp >= up) warn.push(lbl + ' is past VIXU ' + Math.round(up) + ' (the expected day range): momentum, not a reversal signal, so do not fade it');
            else if (ltp && lo && ltp <= lo) warn.push(lbl + ' is past VIXL ' + Math.round(lo) + ' (the expected day range): momentum, not a reversal signal, so do not fade it');
        } catch (e) {}
        try { var dte = _gtbDaysToExpiry(name); if (dte != null && dte <= 1) warn.push('The contract expires in ' + dte + ' day' + (dte === 1 ? '' : 's') + ': thin liquidity and sharp moves near expiry'); } catch (e) {}
        r.tone = bad.length ? 'bad' : warn.length ? 'warn' : 'good';
        var all = bad.concat(warn);
        r.line = all.length ? all[0] + (all.length > 1 ? ' (+' + (all.length - 1) + ' more)' : '') : (ok.join(' · ') || 'No blocking conditions found');
        r.detail = all.length ? all.concat(ok) : ok;
        res.rows.push(r);
    })();

    // ── 2. Direction ──
    (function () {
        var r = { key: 'direction', n: 2, title: 'DIRECTION', tone: 'none', line: '', detail: [] };
        if (!cn) { r.line = 'Consensus not available yet: load ' + lbl; res.rows.push(r); return; }
        var nF = function (x) { return (x >= 0 ? '+' : '') + x.toFixed(2); };
        var stat = 'consensus net ' + nF(cn.net) + ', ' + cn.agree + ' of ' + cn.voting + ' engines agree' + (cn.thin ? ' (thin)' : '');
        var vBias = vd && vd.context ? vd.context.label : '';
        if (!dir) { r.tone = 'bad'; r.line = 'No clear direction: ' + stat; }
        else {
            var conflict = /LONG bias/.test(vBias) && dir < 0 || /SHORT bias/.test(vBias) && dir > 0;
            r.tone = rank >= 2 && !conflict ? 'good' : 'warn';
            r.line = word + ' (' + conf + ' confidence): ' + stat + (conflict ? '; the commodity verdict says ' + vBias : '');
        }
        if (cn.rows) cn.rows.forEach(function (x) { if (x.dir !== 0) r.detail.push((x.dir > 0 ? 'Long: ' : 'Short: ') + x.label + (x.note ? ' (' + x.note + ')' : '')); });
        res.rows.push(r);
    })();

    // ── 3. Entry & timing ──
    (function () {
        var r = { key: 'entry', n: 3, title: 'ENTRY & TIMING', tone: 'none', line: '', detail: [] };
        if (!dir) { r.line = 'No direction, so nothing to time'; res.rows.push(r); return; }
        if (!vd) { r.line = 'Verdict not available yet'; res.rows.push(r); return; }
        var tmTxt = '';
        try {
            if (typeof _ossTimingFor === 'function') {
                _ossTimingFor(name, dir > 0 ? 1 : -1, null, null);
                var t = (typeof _OSS_TIMING_LAST !== 'undefined') ? _OSS_TIMING_LAST : null;
                if (t && t.pct != null) tmTxt = ((call === word && word) ? ' · timing ' : ' · timing if entered now: ') + t.pct + '% ' + t.label;
            }
        } catch (e) {}
        r.tone = vd.ovxGate ? 'bad' : (call === word && word) ? 'good' : 'warn';
        if (vdFlat) {
            // the verdict itself is flat, so say what is being checked instead: the consensus direction against the nearest OI wall
            r.line = res.v.headline + tmTxt;
            r.detail.push('The commodity verdict is not actionable: its composite score is within +-3, so it has no bias of its own and its wall check is skipped. A verdict only reads Actionable LONG / SHORT when the score is outside +-3, a wall is within 0.35% of price and futures and OI agree. Here the consensus direction (' + word + ') is only looked at against the nearest ranked OI ' + (dir > 0 ? 'put (support)' : 'call (resistance)') + ' wall, for information: this row stays amber.');
            if (loc) r.detail.push('Nearest ' + (dir > 0 ? 'support' : 'resistance') + ' wall: ' + Math.round(loc.strike).toLocaleString('en-IN') + ' (' + loc.tier + '), ' + loc.distPct.toFixed(2) + '% from ' + Math.round(ltp).toLocaleString('en-IN') + '.');
            else r.detail.push('No ranked ' + (dir > 0 ? 'put-writing' : 'call-writing') + ' wall was found in the option chain loaded, so there is no level to enter at.');
            [vd.context].forEach(function (p) { if (p && p.lines) p.lines.forEach(function (x) { r.detail.push(typeof x === 'string' ? x : x.text); }); });
            if (tmTxt) r.detail.push('The timing figure is the entry-timing checklist for a ' + word + ' (time of day, distance from VWAP and the day range, futures read); it does not know about the wall check above, so a high timing with an amber row means the level is not there yet.');
            res.rows.push(r); return;
        }
        r.line = vd.label + (vd.location && vd.location.label ? ' · ' + vd.location.label : '') + (vd.confirmation && vd.confirmation.label && vd.confirmation.label !== 'N/A' ? ' · ' + vd.confirmation.label : '') + tmTxt;
        // Live price against the wall the verdict entered at. The verdict measures "at the wall" from the at-the-money strike (which is how
        // it can say 0.00%), so show where price actually is. Display only: the Actionable condition itself is unchanged.
        var wk = (vd.trade && vd.trade.entry != null) ? parseFloat(vd.trade.entry) : NaN;
        if (isFinite(wk) && ltp) {
            var dpts = ltp - wk, fm = function (x) { return Math.round(x).toLocaleString('en-IN'); };
            r.line = r.line.replace(' · timing', ' · price ' + fm(ltp) + (Math.abs(dpts) < 0.5 ? ' (at the wall)' : ' (' + fm(Math.abs(dpts)) + ' pts ' + (dpts < 0 ? 'below' : 'above') + ' the wall)') + ' · timing');
            if (r.line.indexOf(' · price ') === -1) r.line += ' · price ' + fm(ltp) + (Math.abs(dpts) < 0.5 ? ' (at the wall)' : ' (' + fm(Math.abs(dpts)) + ' pts ' + (dpts < 0 ? 'below' : 'above') + ' the wall)');
            r.detail.push('The verdict measures "at the wall" from the at-the-money strike, so its distance can read 0.00% while the live price is up to about half a strike step away. The price shown above is the live price, and the Actionable condition itself is unchanged.');
        }
        [vd.context, vd.location, vd.confirmation].forEach(function (p) { if (p && p.lines) p.lines.forEach(function (x) { r.detail.push(typeof x === 'string' ? x : x.text); }); });
        if (tmTxt) r.detail.push('Entry timing is the same checklist the Option Strike Search shows; it is for a ' + word + ' and is not an entry signal while the verdict says WAIT.');
        res.rows.push(r);
    })();

    // ── 4. Risk ──
    (function () {
        var r = { key: 'risk', n: 4, title: 'RISK', tone: 'none', line: '', detail: [] };
        if (!dir) { r.line = 'No direction, so no stop to size against'; res.rows.push(r); return; }
        var entry = null, stop = null, src = '';
        if (vd && vd.trade && parseFloat(vd.trade.stop)) { entry = parseFloat(vd.trade.entry); stop = parseFloat(vd.trade.stop); src = 'the verdict stop'; }
        else if (sm.strikeMap) {
            entry = parseFloat(dir > 0 ? sm.strikeMap.bstrikeOne : sm.strikeMap.ustrikeOne); stop = parseFloat(dir > 0 ? sm.strikeMap.bstrikeTwo : sm.strikeMap.ustrikeTwo);
            src = 'the ' + (dir > 0 ? 'BSO/BST' : 'ASO/AST') + ' level pair';
        }
        if (!entry || !stop) { r.line = 'No stop level yet: load ' + lbl; res.rows.push(r); return; }
        var step = Math.abs(entry - stop), pctOfPrice = entry ? step / entry * 100 : 0;
        var base = 'Stop ' + Math.round(stop).toLocaleString('en-IN') + ', ' + Math.round(step).toLocaleString('en-IN') + ' pts (' + pctOfPrice.toFixed(2) + '%) from ' + Math.round(entry).toLocaleString('en-IN');
        r.detail.push('The stop comes from ' + src + '. A different entry changes it.');
        var mult = _TF_MCX_MULT[name] || 0, cap = parseFloat(typeof MARGIN !== 'undefined' ? MARGIN : 0) || 0, pct = (typeof RISK_PCT_PER_TRADE !== 'undefined' ? RISK_PCT_PER_TRADE : 1);
        if (!mult || !cap) {
            r.tone = 'warn'; r.line = base + (!cap ? '. Set Account Capital in Settings to see the rupee risk.' : '. The rupee value per point is not known for ' + lbl + '.');
            res.rows.push(r); return;
        }
        var budget = cap * pct / 100, perLot = step * mult, lots = Math.floor(budget / perLot);
        r.tone = lots >= 1 ? 'good' : 'warn';
        r.line = base + ' · risk budget ₹' + Math.round(budget).toLocaleString('en-IN') + ' (' + pct + '% of ₹' + Math.round(cap).toLocaleString('en-IN') + ') · ' + (lots >= 1 ? lots + ' lot' + (lots > 1 ? 's' : '') + ' fit' : 'not even 1 lot fits') + ' (futures)';
        r.detail.push('One lot loses about ₹' + Math.round(perLot).toLocaleString('en-IN') + ' to that stop (₹' + mult + ' per 1.00 move per lot, assumed from the MCX contract size: check it against your broker\'s margin calculator).');
        r.detail.push('This is arithmetic on your own Settings (Account Capital and risk % per trade), not sizing advice. Margin and brokerage are not included.');
        res.rows.push(r);
    })();

    // ── 5. Exit ──
    (function () {
        var r = { key: 'exit', n: 5, title: 'EXIT', tone: 'none', line: '', detail: [] };
        if (!dir) { r.line = 'No direction, so no exit to watch'; res.rows.push(r); return; }
        var cs = {}; try { cs = computeInstrumentScore(name); } catch (e) {}
        var trend = cs.current_trend || 0, fut = sm.futures_trend || 0;
        var exit = dir > 0 ? (trend < 0 || fut < 0) : (trend > 0 || fut > 0);
        var sq = null; try { sq = _gtbShortCoveringSignal(name); } catch (e) {}
        var advType = dir > 0 ? 'LONG_UNWINDING' : 'SHORT_COVERING';
        var adv = !!(sq && sq.ok && sq.active && sq.type === advType);
        var advTxt = dir < 0 ? 'short covering' : 'long unwinding';
        if (exit || adv) {
            r.tone = 'bad';
            var why = [];
            if (exit) why.push((trend * dir < 0 ? 'price has crossed against the ' + word : '') + (trend * dir < 0 && fut * dir < 0 ? ' and ' : '') + (fut * dir < 0 ? 'the futures remark has turned against it' : ''));
            if (adv) why.push(advTxt + ' is active on ' + lbl);
            r.line = 'Exit signal for a ' + word + ': ' + why.join('; ');
        } else { r.tone = 'good'; r.line = 'No exit signal for a ' + word + ' (trend intact, futures not against it, no ' + advTxt + ')'; }
        r.detail.push('Exit rule (single instrument): a LONG exits when the trend is below BSO/BST or the futures remark turns bearish; a SHORT exits when the trend is above ASO/AST or the remark turns bullish. This is more sensitive than the NIFTY rule, which needs both index futures to turn.');
        res.rows.push(r);
    })();

    res.greens = res.rows.filter(function (x) { return x.tone === 'good'; }).length;
    return res;
}
