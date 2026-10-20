// ─── optionStrikeSearch.js ──────────────────────────────────────────────────
// Search any F&O underlying and get the option strikes for a chosen STRATEGY, picked from the
// instrument's live LTP: each leg shows BUY/SELL, the nearest LISTED strike, trading symbol and
// token so it can be identified/placed directly. Opened from the Tools launcher, or from the
// "Option strikes" button on an Instrument Detail View card (which pre-fills that instrument).
//
// Strategies (all strikes snap to the nearest strike actually listed for the resolved expiry):
//   reference     ATM CE/PE + hedge CE/PE (the original view, no BUY/SELL sides)
//   suggested     picked from today's Final Verdict (NIFTY 50 / NIFTY BANK only)
//   directional   Long CE, Long PE, Bull Call Spread, Bear Put Spread (debit); Bull Put Spread,
//                 Bear Call Spread (credit)
//   range         Short Straddle, Short Strangle, Iron Fly, Iron Condor
//   volatility    Long Straddle, Long Strangle
// Distances: "offset" = how far the short/OTM strikes sit from ATM; "wing" = spread width / hedge
// distance. Both can be typed; blank = auto. Auto offset = one expected move to expiry
// (LTP × India VIX × √(days/365)) for indices, else 3 strikes; auto wing = the configured hedge
// diff for the Iron Fly (as before), half the offset for the Iron Condor, the offset for spreads.
// The expected-move maths is a rough 1-sigma guide from implied volatility — not a forecast.
// ─────────────────────────────────────────────────────────────────────────────

function _ossHedgeDiff(name) {
    if (name === 'NIFTY 50' || name === 'NIFTY') return HEDGE_DIFF_NIFTY;
    if (name === 'NIFTY BANK' || name === 'BANKNIFTY') return HEDGE_DIFF_BANKNIFTY;
    return HEDGE_DIFF_STOCKS;
}

var _OSS_OPT_TO_DISPLAY = { 'NIFTY': 'NIFTY 50', 'BANKNIFTY': 'NIFTY BANK', 'FINNIFTY': 'NIFTY FIN SERVICE', 'MIDCPNIFTY': 'NIFTY MID SELECT' };
var _OSS_DISPLAY_TO_OPT = { 'NIFTY 50': 'NIFTY', 'NIFTY BANK': 'BANKNIFTY', 'NIFTY FIN SERVICE': 'FINNIFTY', 'NIFTY MID SELECT': 'MIDCPNIFTY' };
// Indices India VIX is a meaningful volatility input for (not individual stocks).
var _OSS_VIX_NAMES = { 'NIFTY 50': 1, 'NIFTY BANK': 1, 'NIFTY FIN SERVICE': 1, 'NIFTY MID SELECT': 1, 'SENSEX': 1, 'BANKEX': 1 };

// Commodity (MCX) names that have listed options in MCX_OPTION_LIST (dataLoad.js fills it, one resolved expiry per name).
function _ossIsMcx(name) {
    try { return typeof MCX_OPTION_LIST !== 'undefined' && MCX_OPTION_LIST.some(function (r) { return r.name === name; }); } catch (e) { return false; }
}
// generateTrend() throws for MCX names (no INSTRUMENT_TOKENS entry), so build the same shape from the cache
// showTopChartMCX/showFutureDetailsMCX fill: INSTRUMENT_SCORE_MAP[name].strikeMap / .open / .mcxLtp.
function _ossTrend(name) {
    if (_ossIsMcx(name)) {
        var sm = (typeof INSTRUMENT_SCORE_MAP !== 'undefined' && INSTRUMENT_SCORE_MAP[name]) || {};
        if (!sm.strikeMap || !sm.open || !sm.mcxLtp) return null;
        var vU = parseFloat(sm.strikeMap.vixDDUpper), vL = parseFloat(sm.strikeMap.vixDDLower);
        return { ltp: parseFloat(sm.mcxLtp), open: parseFloat(sm.open), strikeData: sm.strikeMap, vix: { vixDDRange: (isFinite(vU) && isFinite(vL)) ? (vU - vL) / 2 : 0 } };
    }
    return generateTrend(name);
}
function _ossAllNames() {
    var seen = {}, list = [];
    function add(n) { n = (n || '').trim().toUpperCase(); n = _OSS_OPT_TO_DISPLAY[n] || n; if (n && !seen[n]) { seen[n] = 1; list.push(n); } }
    if (typeof OPTION_STRIKE_LIST !== 'undefined') OPTION_STRIKE_LIST.forEach(function (r) { add(r.name); });
    if (typeof MCX_OPTION_LIST !== 'undefined') MCX_OPTION_LIST.forEach(function (r) { add(r.name); });
    return list.sort();
}

function _ossLtpFor(name) {
    try {
        var ltpMap = JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}');
        if (ltpMap[name] && ltpMap[name].ltp) return parseFloat(ltpMap[name].ltp);
    } catch (e) {}
    try {
        var listMap = JSON.parse(localStorage.getItem('INSTRUMENT_LIST_GLOBAL') || '{}');
        if (listMap[name] && listMap[name].price) return parseFloat(listMap[name].price);
    } catch (e) {}
    try {
        var sm = INSTRUMENT_SCORE_MAP[name];
        if (sm && sm.mcxLtp) return parseFloat(sm.mcxLtp);
    } catch (e) {}
    return NaN;
}

function _ossNearestStrike(strikes, price) {
    var best = null, bestDist = Infinity;
    strikes.forEach(function (s) { var d = Math.abs(s - price); if (d < bestDist) { bestDist = d; best = s; } });
    return best;
}

// Smallest gap between neighbouring listed strikes around ATM = the working strike step.
function _ossStrikeStep(strikes, atm) {
    var i = strikes.indexOf(atm), gaps = [];
    for (var k = Math.max(1, i - 3); k <= Math.min(strikes.length - 1, i + 3); k++) gaps.push(strikes[k] - strikes[k - 1]);
    gaps = gaps.filter(function (g) { return g > 0; });
    return gaps.length ? Math.min.apply(null, gaps) : 1;
}

// 1-sigma expected move to expiry from India VIX (indices only): LTP × VIX% × √(days / 365).
// A commodity's own volatility index, from the Settings values (MCX "Volatility indices (CBOE)"):
// crude -> OVX, gold -> GVZ, silver -> VXSLV, USDINR -> a fixed 4.85, any other MCX name -> the CBOE VIX
// setting (same convention as the Commodities dashboard's own vol modifier). Returns {v, label} or null.
function _ossMcxVol(name) {
    var num = function (x) { return parseFloat(x) || 0; };
    var v = 0, label = '';
    try {
        if (name === 'CRUDEOILM' || name === 'CRUDEOIL') { v = num(typeof OVX !== 'undefined' ? OVX : 0); label = 'OVX'; }
        else if (name === 'GOLDM' || name === 'GOLD') { v = num(typeof GVZ !== 'undefined' ? GVZ : 0); label = 'GVZ'; }
        else if (name === 'SILVERM' || name === 'SILVER') { v = num(typeof VXSLV !== 'undefined' ? VXSLV : 0); label = 'VXSLV'; }
        else if (name === 'USDINR') { v = 4.85; label = 'USDINR (fixed)'; }
        else { v = num(typeof VIX !== 'undefined' ? VIX : 0); label = 'CBOE VIX'; }
    } catch (e) {}
    if (!(v > 0) && typeof _gtbApiFail === 'function') _gtbApiFail('vol-' + label, label + ' is not set', 'value is 0 or empty for ' + name, 'The expected-move range for ' + name + ' options is skipped. Fetch it in Settings (volatility indices) or type it in.');
    else if (v > 0 && typeof _gtbApiOk === 'function') _gtbApiOk('vol-' + label);
    return v > 0 ? { v: v, label: label } : null;
}
function _ossExpectedMove(name, ltp, dte) {
    var vix = 0, label = 'India VIX';
    if (_ossIsMcx(name)) {
        var mv = _ossMcxVol(name);
        if (mv) { vix = mv.v; label = mv.label; }
    } else {
        if (!_OSS_VIX_NAMES[name]) return null;
        try { vix = parseFloat((JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}')['INDIA VIX'] || {}).ltp) || 0; } catch (e) {}
    }
    if (!vix || !ltp || !dte) return null;
    return { em: ltp * vix / 100 * Math.sqrt(dte / 365), vix: vix, label: label };
}

// ── Strategy catalogue ─────────────────────────────────────────────────────────────────────
// legs(c): c = { atm, off, wing } → [{ label, side:'BUY'|'SELL'|'', type:'CE'|'PE', k: targetStrike }]
// defWing(c) gives the auto wing for strategies that use one.
var _OSS_STRATEGIES = [
    { key: 'reference', group: 'Reference', label: 'ATM + hedge strikes (reference)', view: 'Reference', usesOff: false, usesWing: true,
      desc: 'The original ATM CE/PE + hedge CE/PE strike map, now with the usual sides: SELL the ATM CE and PE, BUY the hedges one hedge-distance away (the same four legs as the Iron Fly).',
      risk: 'Max profit: net credit. Max loss: wing − net credit (both sides capped).',
      defWing: function (c) { return c.hedge; },
      legs: function (c) { return [
        { label: 'ATM CE', side: 'SELL', type: 'CE', k: c.atm }, { label: 'ATM PE', side: 'SELL', type: 'PE', k: c.atm },
        { label: 'Hedge CE (ATM +' + c.wing + ')', side: 'BUY', type: 'CE', k: c.atm + c.wing }, { label: 'Hedge PE (ATM −' + c.wing + ')', side: 'BUY', type: 'PE', k: c.atm - c.wing }]; } },

    { key: 'longce', group: 'Directional', label: 'Long Call (ATM)', view: 'Bullish', usesOff: false, usesWing: false,
      desc: 'Buy the ATM call. Profits if the underlying rises by more than the premium paid.',
      risk: 'Max loss: premium paid. Max profit: unlimited.',
      legs: function (c) { return [{ label: 'Buy ATM CE', side: 'BUY', type: 'CE', k: c.atm }]; } },
    { key: 'longpe', group: 'Directional', label: 'Long Put (ATM)', view: 'Bearish', usesOff: false, usesWing: false,
      desc: 'Buy the ATM put. Profits if the underlying falls by more than the premium paid.',
      risk: 'Max loss: premium paid. Max profit: strike minus premium (to zero).',
      legs: function (c) { return [{ label: 'Buy ATM PE', side: 'BUY', type: 'PE', k: c.atm }]; } },
    { key: 'bullcall', group: 'Directional', label: 'Bull Call Spread (debit)', view: 'Bullish', usesOff: false, usesWing: true,
      desc: 'Buy the ATM call, sell a higher call. Cheaper than a long call; profit is capped at the spread width.',
      risk: 'Max loss: net debit. Max profit: width − net debit.',
      defWing: function (c) { return c.offAuto; },
      legs: function (c) { return [{ label: 'Buy ATM CE', side: 'BUY', type: 'CE', k: c.atm }, { label: 'Sell CE (ATM +' + c.wing + ')', side: 'SELL', type: 'CE', k: c.atm + c.wing }]; } },
    { key: 'bearput', group: 'Directional', label: 'Bear Put Spread (debit)', view: 'Bearish', usesOff: false, usesWing: true,
      desc: 'Buy the ATM put, sell a lower put. Cheaper than a long put; profit is capped at the spread width.',
      risk: 'Max loss: net debit. Max profit: width − net debit.',
      defWing: function (c) { return c.offAuto; },
      legs: function (c) { return [{ label: 'Buy ATM PE', side: 'BUY', type: 'PE', k: c.atm }, { label: 'Sell PE (ATM −' + c.wing + ')', side: 'SELL', type: 'PE', k: c.atm - c.wing }]; } },
    { key: 'bullput', group: 'Directional', label: 'Bull Put Spread (credit)', view: 'Mildly bullish', usesOff: true, usesWing: true,
      desc: 'Sell an OTM put, buy a lower put. Collect premium; profits if the underlying stays above the short put.',
      risk: 'Max profit: net credit. Max loss: width − net credit.',
      defWing: function (c) { return Math.max(c.step * 2, c.offAuto / 2); },
      legs: function (c) { return [{ label: 'Sell PE (ATM −' + c.off + ')', side: 'SELL', type: 'PE', k: c.atm - c.off }, { label: 'Buy PE (−' + (c.off + c.wing) + ')', side: 'BUY', type: 'PE', k: c.atm - c.off - c.wing }]; } },
    { key: 'bearcall', group: 'Directional', label: 'Bear Call Spread (credit)', view: 'Mildly bearish', usesOff: true, usesWing: true,
      desc: 'Sell an OTM call, buy a higher call. Collect premium; profits if the underlying stays below the short call.',
      risk: 'Max profit: net credit. Max loss: width − net credit.',
      defWing: function (c) { return Math.max(c.step * 2, c.offAuto / 2); },
      legs: function (c) { return [{ label: 'Sell CE (ATM +' + c.off + ')', side: 'SELL', type: 'CE', k: c.atm + c.off }, { label: 'Buy CE (+' + (c.off + c.wing) + ')', side: 'BUY', type: 'CE', k: c.atm + c.off + c.wing }]; } },

    { key: 'shortstraddle', group: 'Range / sell premium', label: 'Short Straddle', view: 'Range-bound', usesOff: false, usesWing: false,
      desc: 'Sell ATM call and put. Maximum premium; profits if the underlying stays near the strike.',
      risk: 'Max profit: total premium. Max loss: UNLIMITED on both sides — needs a hedge or strict stops.',
      legs: function (c) { return [{ label: 'Sell ATM CE', side: 'SELL', type: 'CE', k: c.atm }, { label: 'Sell ATM PE', side: 'SELL', type: 'PE', k: c.atm }]; } },
    { key: 'shortstrangle', group: 'Range / sell premium', label: 'Short Strangle', view: 'Range-bound', usesOff: true, usesWing: false,
      desc: 'Sell an OTM call and an OTM put. Wider safe zone than a straddle, less premium.',
      risk: 'Max profit: total premium. Max loss: UNLIMITED on both sides — needs a hedge or strict stops.',
      legs: function (c) { return [{ label: 'Sell CE (ATM +' + c.off + ')', side: 'SELL', type: 'CE', k: c.atm + c.off }, { label: 'Sell PE (ATM −' + c.off + ')', side: 'SELL', type: 'PE', k: c.atm - c.off }]; } },
    { key: 'ironfly', group: 'Range / sell premium', label: 'Iron Fly (ATM short + hedges)', view: 'Range-bound', usesOff: false, usesWing: true,
      desc: 'Sell the ATM call and put, buy a call and put one wing away. Defined-risk version of the short straddle.',
      risk: 'Max profit: net credit. Max loss: wing − net credit (both sides capped).',
      defWing: function (c) { return c.hedge; },
      legs: function (c) { return [
        { label: 'Sell ATM CE', side: 'SELL', type: 'CE', k: c.atm }, { label: 'Sell ATM PE', side: 'SELL', type: 'PE', k: c.atm },
        { label: 'Buy CE (ATM +' + c.wing + ')', side: 'BUY', type: 'CE', k: c.atm + c.wing }, { label: 'Buy PE (ATM −' + c.wing + ')', side: 'BUY', type: 'PE', k: c.atm - c.wing }]; } },
    { key: 'condor', group: 'Range / sell premium', label: 'Iron Condor', view: 'Range-bound', usesOff: true, usesWing: true,
      desc: 'Sell an OTM call and put, buy a further-OTM call and put. Defined-risk strangle; profits if the underlying stays between the short strikes.',
      risk: 'Max profit: net credit. Max loss: wing − net credit (both sides capped).',
      defWing: function (c) { return Math.max(c.step * 2, c.offAuto / 2); },
      legs: function (c) { return [
        { label: 'Sell CE (ATM +' + c.off + ')', side: 'SELL', type: 'CE', k: c.atm + c.off }, { label: 'Buy CE (+' + (c.off + c.wing) + ')', side: 'BUY', type: 'CE', k: c.atm + c.off + c.wing },
        { label: 'Sell PE (ATM −' + c.off + ')', side: 'SELL', type: 'PE', k: c.atm - c.off }, { label: 'Buy PE (−' + (c.off + c.wing) + ')', side: 'BUY', type: 'PE', k: c.atm - c.off - c.wing }]; } },

    { key: 'longstraddle', group: 'Volatility / big move', label: 'Long Straddle', view: 'Big move, either way', usesOff: false, usesWing: false,
      desc: 'Buy ATM call and put. Profits if the underlying moves far enough in either direction; loses to time decay if it stays put.',
      risk: 'Max loss: total premium paid. Max profit: unlimited upside, large downside.',
      legs: function (c) { return [{ label: 'Buy ATM CE', side: 'BUY', type: 'CE', k: c.atm }, { label: 'Buy ATM PE', side: 'BUY', type: 'PE', k: c.atm }]; } },
    { key: 'longstrangle', group: 'Volatility / big move', label: 'Long Strangle', view: 'Big move, either way', usesOff: true, usesWing: false,
      desc: 'Buy an OTM call and an OTM put. Cheaper than a straddle but needs a bigger move to pay.',
      risk: 'Max loss: total premium paid. Max profit: unlimited upside, large downside.',
      legs: function (c) { return [{ label: 'Buy CE (ATM +' + c.off + ')', side: 'BUY', type: 'CE', k: c.atm + c.off }, { label: 'Buy PE (ATM −' + c.off + ')', side: 'BUY', type: 'PE', k: c.atm - c.off }]; } },
];

function _ossStrategyByKey(key) {
    for (var i = 0; i < _OSS_STRATEGIES.length; i++) if (_OSS_STRATEGIES[i].key === key) return _OSS_STRATEGIES[i];
    return _OSS_STRATEGIES[0];
}

// Which strategy today's Final Verdict points to (NIFTY 50 / NIFTY BANK only). LONG → Bull Call
// Spread, SHORT → Bear Put Spread, a range / no-direction day → Iron Condor, a guard or no data → none.
// India VIX below this = options are cheap, so paying full premium for a Long Call/Put costs less
// and a debit spread gives up more profit than it saves. Same "LOW" bound the dashboard uses.
var _OSS_LOW_VIX = 13;
function _ossIndiaVix() {
    try { return parseFloat((JSON.parse(localStorage.getItem('INSTRUMENT_LTP_PRICE') || '{}')['INDIA VIX'] || {}).ltp) || 0; } catch (e) { return 0; }
}
// Upgrade a directional spread to a plain Long Call/Put when conviction is HIGH and VIX is low.
function _ossDirPick(bull, highConf, baseWhy) {
    var vix = _ossIndiaVix();
    if (highConf && vix > 0 && vix < _OSS_LOW_VIX)
        return { key: bull ? 'longce' : 'longpe', why: baseWhy + ' High conviction and India VIX ' + vix.toFixed(1) + ' (< ' + _OSS_LOW_VIX + ', options cheap) → a plain Long ' + (bull ? 'Call' : 'Put') + ' keeps the full upside; risk is the premium paid.' };
    return { key: bull ? 'bullcall' : 'bearput', why: baseWhy + ' → a defined-risk ' + (bull ? 'bullish' : 'bearish') + ' debit spread.' };
}

function _ossSuggestedKey(name, opts) {
    try {
        // Dashboard says WAIT because the score and index futures conflict (or NO TRADE): suggest nothing.
        if (typeof _gtbHeadlineMarketSignal === 'function' && !_ossIsMcx(name) && !(opts && opts.skipMarketGate)) {
            var hm = _gtbHeadlineMarketSignal(), ms0 = hm && hm.ms;
            if (ms0 && ms0.signal && ((/WAIT/i.test(ms0.signal) && /conflict/i.test(ms0.reason || '')) || /NO TRADE/i.test(ms0.signal)))
                return { key: null, why: 'Market verdict: ' + ms0.signal + ' — ' + (ms0.reason || 'conflicting signals') + '. No strategy suggested until the signals line up; pick one manually if you disagree.' };
        }
        if (name !== 'NIFTY 50' && name !== 'NIFTY BANK') {
            // Every other instrument: the SAME prediction the Instrument Detail View's Prediction
            // card shows (_svComputePrediction -> BUY CE / BUY PE / WAIT / RANGE / NO TRADE).
            if (typeof _svComputePrediction === 'function') {
                try {
                    var d = _svComputePrediction(name, '');
                    var pr = d.primaryScenario && d.primaryScenario.label;
                    var tx2 = 'Detail View prediction: ' + pr + ' (confidence ' + d.confidence + '%' + (d.lowConfidence ? ', low' : '') + '), action ' + d.tradeAction;
                    if (d.tradeAction === 'BUY CE') return _ossDirPick(true, !d.lowConfidence && d.confidence >= 65 && !_ossIsMcx(name), tx2);
                    if (d.tradeAction === 'BUY PE') return _ossDirPick(false, !d.lowConfidence && d.confidence >= 65 && !_ossIsMcx(name), tx2);
                    if (d.tradeAction === 'NO TRADE') return { key: null, why: tx2 + ' — no strategy suggested.' };
                    return { key: 'condor', why: tx2 + ' → a defined-risk range strategy.' };
                } catch (ePred) {}
            }
            if (typeof computeInstrumentScore !== 'function') return null;
            var t = computeInstrumentScore(name).total;
            var tx = 'Instrument score ' + (t > 0 ? '+' : '') + t.toFixed(1);
            if (t >= 1) return { key: 'bullcall', why: tx + ' (bullish) → a defined-risk bullish debit spread.' };
            if (t <= -1) return { key: 'bearput', why: tx + ' (bearish) → a defined-risk bearish debit spread.' };
            return { key: 'condor', why: tx + ' (no clear direction) → a defined-risk range strategy.' };
        }
        if (typeof _gtbFinalVerdict !== 'function') return null;
        var v = _gtbFinalVerdict();
        if (!v) return null;
        if (/dead zone/i.test(v.headline || '')) return { key: 'condor', why: 'Final Verdict: ' + v.headline + ' → price is expected to chop inside a band, so a defined-risk range strategy (Iron Condor) fits. Keep the short strikes outside the dead-zone band.' };
        if (/market guard/i.test(v.headline || '')) return { key: null, why: 'The verdict is "' + v.headline + '" — no strategy suggested.' };
        var long = v.dir > 0, short = v.dir < 0;
        if (v.call === 'LONG') return _ossDirPick(true, v.conf === 'HIGH', 'Final Verdict: ' + v.headline + '.');
        if (v.call === 'SHORT') return _ossDirPick(false, v.conf === 'HIGH', 'Final Verdict: ' + v.headline + '.');
        // Clear direction but the ENTRY is the problem ("NO TRADE — sell only at ASO…"): the lean is still
        // directional, so suggest the matching spread and say the entry condition is unmet.
        if (v.call === 'NO TRADE' && (long || short) && (v.entryBlocked || /only at|not confirmed|unlikely|no nearby|to enter on/i.test(v.headline || '')))
            return { key: long ? 'bullcall' : 'bearput', why: 'Final Verdict: ' + v.headline + ' → direction is ' + (long ? 'LONG' : 'SHORT') + ' but the entry level is not met; a defined-risk ' + (long ? 'bullish' : 'bearish') + ' spread fits only if you take the trade at the level.' };
        if (v.call === 'WAIT' && (long || short)) return { key: long ? 'bullcall' : 'bearput', why: 'Final Verdict: ' + v.headline + ' → prepare the spread, enter only when it turns to a call.' };
        return { key: 'condor', why: 'Final Verdict: ' + v.headline + ' → no directional edge; a defined-risk range strategy fits better than a directional one.' };
    } catch (e) { return null; }
}

// Positional (daily-candle swing) read from the Positional Screener cache — shown as a flag only,
// it never changes the suggested strategy. Not scanned = says so rather than triggering a scan.
// Dashboard market verdict (composite score + 9:15 combo + futures, via getMarketSignal) — a flag
// only; it never changes the suggested strategy. Needs the dashboard to have refreshed once.
function _ossMarketFlag(stratView) {
    try {
        if (typeof _gtbHeadlineMarketSignal !== 'function') return '';
        var h = _gtbHeadlineMarketSignal();
        if (!h || !h.ms || !h.ms.signal) return '<div class="oss-desc">Market verdict: not available yet (refresh the dashboard).</div>';
        var sig = String(h.ms.signal).toUpperCase();
        var up = /BUY/.test(sig), down = /SELL/.test(sig), flat = /SIDEWAYS/.test(sig);
        var txt = 'Market verdict: <b>' + h.ms.signal + '</b>' + (h.score != null && isFinite(h.score) ? ' (composite score ' + (h.score > 0 ? '+' : '') + parseFloat(h.score).toFixed(1) + ')' : '');
        var v = stratView || '';
        var bull = /Bullish|Mildly bullish/.test(v), bear = /Bearish|Mildly bearish/.test(v), range = /Range-bound/.test(v), vol = /Big move/.test(v);
        if (/NO TRADE/.test(sig)) return '<div class="oss-suggest">⚠ ' + txt + ' — the dashboard says stay out (e.g. VIX guard).</div>';
        if ((bull && down) || (bear && up)) return '<div class="oss-suggest">⚠ ' + txt + ' — opposite to this strategy.</div>';
        if (range && (up || down)) return '<div class="oss-suggest">⚠ ' + txt + ' — a trending market works against a range strategy.</div>';
        if (vol && flat) return '<div class="oss-suggest">⚠ ' + txt + ' — a sideways market works against buying a straddle/strangle.</div>';
        var agree = (bull && up) || (bear && down) || (range && flat);
        return '<div class="oss-desc">' + txt + (agree ? ' — agrees with this strategy.' : '.') + '</div>';
    } catch (e) { return ''; }
}

// "As of" label: the snapshot end time / replay day the rest of the dashboard is showing, if any.
function _ossAsOf() {
    try {
        var t = (typeof _gtbHistTime === 'function') ? _gtbHistTime() : null;
        var day = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? CURRENT_DAY : null;
        var past = day && day < moment().format('YYYY-MM-DD');
        if (t && /^\d{1,2}:\d{2}/.test(t)) return { on: true, txt: 'Snapshot ' + (past ? day + ' ' : '') + t };
        if (past) return { on: true, txt: 'Replay ' + day };
    } catch (e) {}
    return { on: false, txt: 'Live' };
}

// Signal agreement: how many of the independent signals point the same way as the chosen strategy.
// A tally for confidence, NOT a probability of profit — the votes are correlated and none is back-tested.
var _OSS_AGREE_LAST = null;
function _ossAgreement(name, view) {
    _OSS_AGREE_LAST = null;
    try {
        var want = /Bullish|Mildly bullish/.test(view || '') ? 1 : /Bearish|Mildly bearish/.test(view || '') ? -1 : /Range-bound|Reference/.test(view || '') ? 0 : null;
        if (want === null) return '';
        var sg = function (x) { return x > 0 ? 1 : x < 0 ? -1 : 0; };
        var votes = [];
        var add = function (label, v) { if (v !== null && v !== undefined && isFinite(v)) votes.push({ label: label, v: v }); };
        try {
            var cs = computeInstrumentScore(name);
            add('9:15 candle', sg(cs.nine_fifteen)); add('Current trend', sg(cs.current_trend));
            add('Futures', sg(cs.futures_trend)); add('OI/OBV', sg(cs.oi_obv));
        } catch (e) {}
        try {
            var h = _ossIsMcx(name) ? null : _gtbHeadlineMarketSignal();
            if (h && h.ms && h.ms.signal) add('Market verdict', /BUY/.test(h.ms.signal) ? 1 : /SELL/.test(h.ms.signal) ? -1 : 0);
        } catch (e) {}
        try {
            var r = _PS_CACHE[name] || _PS_CACHE[String(name).toUpperCase()];
            if (r && r.primary && r.primary.ok) add('Positional', sg(r.primary.dir));
        } catch (e) {}
        try {
            if (name === 'NIFTY 50' || name === 'NIFTY BANK') {
                var fv = _gtbFinalVerdict();
                if (fv) add('Final Verdict', fv.call === 'LONG' ? 1 : fv.call === 'SHORT' ? -1 : (fv.dir ? sg(fv.dir) : 0));
            } else {
                var d = _svComputePrediction(name, '');
                add('Prediction', d.tradeAction === 'BUY CE' ? 1 : d.tradeAction === 'BUY PE' ? -1 : 0);
            }
        } catch (e) {}
        if (votes.length < 3) return '<div class="oss-desc">Signal agreement: not enough signals loaded yet.</div>';
        var agree = votes.filter(function (x) { return x.v === want; }).length;
        var pct = Math.round(agree / votes.length * 100);
        _OSS_AGREE_LAST = { agree: agree, total: votes.length, pct: pct };
        var tone = pct >= 65 ? ['FAVOURABLE', 'var(--gtb-green)'] : pct >= 45 ? ['MIXED', 'var(--gtb-amber)'] : ['UNFAVOURABLE', 'var(--gtb-red)'];
        var chips = votes.map(function (x) {
            var ok = x.v === want, c = ok ? 'var(--gtb-green)' : (x.v === 0 ? 'var(--gtb-muted)' : 'var(--gtb-red)');
            return '<span style="color:' + c + ';border:1px solid ' + c + ';padding:0 5px;margin:0 3px 2px 0;display:inline-block;">' + (ok ? '✓ ' : x.v === 0 ? '– ' : '✗ ') + x.label + '</span>';
        }).join('');
        return '<div class="oss-agree" title="How many independent signals point the same way as this strategy. A tally, not a probability of profit.">'
            + '<b style="color:' + tone[1] + ';">Signal agreement ' + agree + '/' + votes.length + ' (' + pct + '%) — ' + tone[0] + '</b> '
            + '<span class="oss-na">not a probability of profit</span><div style="margin-top:3px;">' + chips + '</div></div>';
    } catch (e) { return ''; }
}

// ── Entry timing: is NOW a good moment to take this trade? ──────────────────────────────
// A tally of timing checks for a directional strategy (bullish/bearish); nothing for range/volatility ones.
// Each check is good (+1) / neutral (0) / bad (-1); confidence = (good + half the neutral) / checks.
// A heuristic checklist, NOT a probability of profit and not back-tested.
function _ossTiming(name, strat, dte) {
    var v = strat.view || '';
    var want = /Bullish|Mildly bullish/.test(v) ? 1 : /Bearish|Mildly bearish/.test(v) ? -1 : 0;
    return want ? _ossTimingFor(name, want, strat.key, dte) : '';
}
// want: +1 bullish / -1 bearish. stratKey and dte are optional (the expiry check needs both).
// Also used by the dashboard's Final Verdict card, which has a direction but no strategy.
var _OSS_TIMING_LAST = null;
function _ossTimingFor(name, want, stratKey, dte) {
    _OSS_TIMING_LAST = null;
    try {
        var checks = [];
        var add = function (label, score, why) { checks.push({ label: label, s: score, why: why }); };
        var tr = null; try { tr = _ossTrend(name); } catch (e) {}
        var sm = (typeof INSTRUMENT_SCORE_MAP !== 'undefined' && INSTRUMENT_SCORE_MAP[name]) || {};
        var sg = function (x) { return x > 0 ? 1 : x < 0 ? -1 : 0; };

        // 1. Where price sits against today's 9:15 levels, and how much of the day's range is used
        if (tr && tr.strikeData) {
            var ltp = parseFloat(tr.ltp), open = parseFloat(tr.open || tr.price);
            var s1 = parseFloat(tr.strikeData.ustrikeOne) - open, s2 = parseFloat(tr.strikeData.ustrikeTwo) - parseFloat(tr.strikeData.ustrikeOne);
            var d = want * (ltp - open);
            var near = want > 0 ? 'ASO' : 'BSO', far = want > 0 ? 'AST' : 'BST';
            if (s1 > 0) {
                if (d <= -(s1 + s2)) add('Level', -1, 'Price is beyond the opposite 9:15 stop level, so the setup has failed.');
                else if (d <= -s1) add('Level', 0, 'Price is past the opposite 9:15 level, so the thesis is weakened.');
                else if (d <= 1.3 * s1) add('Level', 1, 'Price is still near its entry zone (before or at ' + near + '), with room to run.');
                else if (d <= s1 + s2) add('Level', 0, 'Price is between ' + near + ' and ' + far + ': the move is under way, not at the entry level.');
                else add('Level', -1, 'Price is already beyond ' + far + ': this is chasing an extended move.');
            }
            var rng = parseFloat(tr.vix && tr.vix.vixDDRange);
            if (rng > 0) {
                var used = d / rng;
                add('Day range', used >= 1 ? -1 : used < 0.5 ? 1 : 0,
                    used >= 1 ? 'Price has already used the expected VIX range for the day in this direction.'
                    : used < 0.5 ? 'Less than half of the expected day range is used in this direction.'
                    : 'About ' + Math.round(used * 100) + '% of the expected day range is used.');
            }
        }
        // 2. Futures short-window read vs direction
        if (sm.futures_trend !== undefined && sm.futures_trend !== null) {
            var f = sg(sm.futures_trend);
            add('Futures', f === want ? 1 : f === 0 ? 0 : -1,
                f === want ? 'Futures flow agrees with the direction right now.'
                : f === 0 ? 'Futures flow is flat right now.'
                : 'Futures flow is against the direction right now (short-term): wait for it to turn.');
        }
        // 3. VWAP side
        if (sm.avwap && tr) {
            var side = sg(want * (parseFloat(tr.ltp) - sm.avwap));
            add('VWAP', side > 0 ? 1 : -1, side > 0 ? 'Price is on the right side of futures VWAP.' : 'Price is on the wrong side of futures VWAP.');
        }
        // 4. Positional timing (only when the positional view agrees with the direction)
        try {
            var r = _PS_CACHE[name] || _PS_CACHE[String(name).toUpperCase()];
            if (r && r.since && r.primary && r.primary.ok && sg(r.primary.dir) === want) {
                var lb = r.since.label;
                add('Swing timing', lb === 'EARLY' ? 1 : lb === 'MID' ? 0 : -1,
                    'The positional move is ' + lb + (r.since.moveAtr != null ? ' (' + r.since.moveAtr.toFixed(1) + ' ATR so far)' : '') + '.');
            }
        } catch (e) {}
        // 5. Live-signal likelihood of continuing in this direction
        try {
            var lp = _gtbLevelProb(name);
            if (lp && lp.ok) {
                var pr = want > 0 ? lp.pASO : lp.pBSO;
                add('Level prob', pr >= 50 ? 1 : pr < 30 ? -1 : 0, 'Live-signal likelihood of reaching ' + (want > 0 ? 'ASO' : 'BSO') + ' is ' + pr + '%.');
            }
        } catch (e) {}
        // 6. Time of day
        try {
            var tm = _gtbDecNowMin();
            if (_ossIsMcx(name)) add('Time of day', (tm < 9 * 60 + 15 || tm >= 22 * 60 + 45) ? -1 : 1,
                (tm < 9 * 60 + 15 || tm >= 22 * 60 + 45) ? 'Outside the active MCX session window (opens 9:00, evening session ends about 23:30).' : 'Inside the MCX session with time left for the move.');
            else add('Time of day', tm < 9 * 60 + 25 ? -1 : tm <= 14 * 60 ? 1 : tm <= 14 * 60 + 45 ? 0 : -1,
                tm < 9 * 60 + 25 ? 'Before 9:25 the opening candle has not settled.'
                : tm <= 14 * 60 ? 'Mid-session: enough time for the move.'
                : tm <= 14 * 60 + 45 ? 'Late session: little time left for the move.'
                : 'Last 45 minutes: a poor time to open a new position.');
        } catch (e) {}
        // 7. Days to expiry (debit buyers only)
        if (/^(longce|longpe|bullcall|bearput)$/.test(stratKey || '') && dte != null) {
            add('Expiry', dte <= 2 ? -1 : dte <= 5 ? 0 : 1,
                dte <= 2 ? 'Only ' + dte + ' day(s) to expiry: time decay works hard against a debit position.'
                : dte <= 5 ? dte + ' days to expiry: decay is noticeable.'
                : dte + ' days to expiry: enough time for the move.');
        }
        if (checks.length < 4) return '<div class="oss-desc">Entry timing: not enough data yet (load prices or run the dashboard refresh).</div>';
        var good = checks.filter(function (c) { return c.s > 0; }).length, neu = checks.filter(function (c) { return c.s === 0; }).length;
        var pct = Math.round((good + 0.5 * neu) / checks.length * 100);
        var bad = checks.filter(function (c) { return c.s < 0; });
        var tone = pct >= 70 ? ['GOOD TIME TO ENTER', 'var(--gtb-green)']
            : pct >= 50 ? ['ACCEPTABLE, enter with care', 'var(--gtb-amber)']
            : pct >= 35 ? ['WAIT for a better entry', 'var(--gtb-amber)']
            : ['POOR TIMING, do not chase', 'var(--gtb-red)'];
        _OSS_TIMING_LAST = { pct: pct, label: tone[0], n: checks.length, bad: bad.length };
        var chips = checks.map(function (c) {
            var col = c.s > 0 ? 'var(--gtb-green)' : c.s < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
            return '<span title="' + c.why.replace(/"/g, '&quot;') + '" style="color:' + col + ';border:1px solid ' + col + ';padding:0 5px;margin:0 3px 2px 0;display:inline-block;">'
                + (c.s > 0 ? '✓ ' : c.s < 0 ? '✗ ' : '– ') + c.label + '</span>';
        }).join('');
        return '<div class="oss-agree"><b style="color:' + tone[1] + ';">Entry timing ' + pct + '% — ' + tone[0] + '</b> <span class="oss-na">checklist, not a probability of profit</span>'
            + '<div style="margin-top:3px;">' + chips + '</div>'
            + (bad.length ? '<div class="oss-desc" style="margin-top:2px;">Against: ' + bad.map(function (c) { return c.why; }).join(' ') + '</div>' : '')
            + '</div>';
    } catch (e) { return ''; }
}

// ── Keep the Suggested pick from flip-flopping ───────────────────────────────────────────
// The raw suggestion is re-derived from live signals on every search/refresh; near a threshold (dead zone vs a
// blocked entry, agreement near 45%, a verdict flipping) it can alternate between e.g. Bear Put Spread and Iron
// Condor every few minutes. So the pick held for an instrument only changes when the new read has been the same
// for 2 consecutive evaluations AND at least 4 minutes. Per instrument, per day, in memory only; not used when
// replaying a snapshot / past day. 'flips' counts accepted changes so a hovering signal is visible.
var _OSS_STICKY = {};
function _ossKeyLabel(k) { return k ? _ossStrategyByKey(k).label : 'no strategy'; }
function _ossStabilise(name, key, why) {
    var out = { key: key, why: why, held: false, note: '' };
    try {
        if (_ossAsOf().on) return out;
        var day = moment().format('YYYY-MM-DD'), now = Date.now(), st = _OSS_STICKY[name];
        if (!st || st.day !== day) { _OSS_STICKY[name] = { day: day, key: key, why: why, since: now, flips: 0, pend: null }; return out; }
        if (key === st.key) { st.pend = null; st.why = why; }
        else {
            if (!st.pend || st.pend.key !== key) st.pend = { key: key, why: why, n: 1, t0: now };
            else { st.pend.n++; st.pend.why = why; }
            if (st.pend.n >= 2 && now - st.pend.t0 >= 4 * 60 * 1000) { st.key = key; st.why = why; st.since = now; st.flips++; st.pend = null; }
            else {
                out.key = st.key; out.held = true;
                out.why = st.why + ' [Holding this earlier pick: the latest read says ' + _ossKeyLabel(key) + ', which has to persist for 2 reads over 4+ minutes before the pick changes.]';
            }
        }
        if (st.flips >= 2) out.note = 'The suggestion has changed ' + st.flips + ' times today: the signals are hovering near a threshold, so treat this as unresolved, not a firm call.';
    } catch (e) {}
    return out;
}
// ── Full scan: every index + F&O stock in one ranked table ─────────────────────────────────
// For each name it loads the same data the Detail View loads (OI/OBV + futures), then reads ★ Suggested, Signal
// agreement and Entry timing — the exact functions the strike search uses — so the table cannot disagree with it.
// Two scopes: "core" = the indices + the weighted stocks of NIFTY 50 and BANK NIFTY (about 25 names), or "all" =
// every F&O name with listed options. The data calls go through the app's shared rate-limited history queue, so
// the full scope takes minutes and slows the dashboard refresh while it runs. Positional view counts only for
// names already scanned in the Positional Screener (it is not triggered here).
var _OSS_SCAN = { running: false, cancel: false, rows: [], done: 0, total: 0, current: '', startedAt: 0, scope: 'core', zone: 'all', asof: 'Live', empty: '', sort: { col: 'rank', dir: -1 }, dirOnly: false, candOnly: false, q: '', ignoreGuard: false, _block: false, group: true };
var _OSS_DATA_AT = {};   // name -> { t: ms of the last load by the scan, asof: the snapshot/live label it was loaded for }

var _OSS_ZONE_SETS = { all: null, AST: ['AST'], ASO: ['ASO'], 'B/W': ['B/W'], BSO: ['BSO'], BST: ['BST'], bull: ['AST', 'ASO'], bear: ['BSO', 'BST'] };
function _ossScanZoneOf(name) {
    try { var b9 = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}'); return ((b9[name] || {})['CLOSE_9_15']) || ''; } catch (e) { return ''; }
}
function _ossScanUniverse(scope, zone) {
    if (scope === 'mcx') {
        // MCX commodities that have listed options (no 9:15 zone for them, so the zone filter does not apply)
        var mo = ['CRUDEOILM', 'CRUDEOIL', 'GOLDM', 'GOLD', 'SILVERM', 'SILVER', 'NATGASMINI', 'NATURALGAS', 'COPPER', 'ZINC', 'USDINR'], mh = {};
        try { MCX_OPTION_LIST.forEach(function (r) { mh[r.name] = 1; }); } catch (e) {}
        return mo.filter(function (x) { return mh[x]; }).concat(Object.keys(mh).filter(function (x) { return mo.indexOf(x) < 0; }).sort());
    }
    var have = {}; _ossAllNames().forEach(function (n) { if (!_ossIsMcx(n)) have[n] = 1; });
    var out = [], seen = {};
    var add = function (n) { if (have[n] && !seen[n]) { seen[n] = 1; out.push(n); } };
    var stocksOnly = (scope === 'fo' || scope === 'asobso');      // no indices
    if (!stocksOnly && scope !== 'nifty50' && scope !== 'banknifty' && scope !== 'niftybank') ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'NIFTY FIN SERVICE', 'NIFTY MID SELECT'].forEach(add);
    if (scope === 'niftybank') {
        // both indices + every stock in either constituent list (shared stocks are added once)
        add('NIFTY 50'); add('NIFTY BANK');
        try { NIFTY_50_LIST.forEach(add); NIFTY_BANK_LIST.forEach(add); } catch (e) {}
    } else if (scope === 'nifty50' || scope === 'banknifty') {
        // the index itself + every stock in its constituent list (constants.js NIFTY_50_LIST / NIFTY_BANK_LIST)
        add(scope === 'nifty50' ? 'NIFTY 50' : 'NIFTY BANK');
        try { (scope === 'nifty50' ? NIFTY_50_LIST : NIFTY_BANK_LIST).forEach(add); } catch (e) {}
    } else if (stocksOnly) Object.keys(have).sort().forEach(function (n) { if (!_OSS_VIX_NAMES[n]) add(n); });
    else if (scope === 'all') Object.keys(have).sort().forEach(add);
    else {
        try { Object.keys(NIFTY_50_WEIGHTED_STOCKS).forEach(add); } catch (e) {}
        try { Object.keys(NIFTY_BANK_WEIGHTED_STOCKS).forEach(add); } catch (e) {}
    }
    var zs = _OSS_ZONE_SETS[zone || 'all'];
    if (zs) out = out.filter(function (n) { return zs.indexOf(_ossScanZoneOf(n)) !== -1; });
    // "ASO / BSO stocks only": stocks whose 9:15 candle closed ASO or BSO (combined with the zone dropdown, if set)
    if (scope === 'asobso') out = out.filter(function (n) { var z = _ossScanZoneOf(n); return z === 'ASO' || z === 'BSO'; });
    return out;
}
// Days to the resolved options expiry for a name (same resolver the strike search uses), from a prebuilt index.
function _ossScanExpiryMap() {
    var m = {};
    try { OPTION_STRIKE_LIST.forEach(function (r) { var e = moment(r.expiry, 'DD-MM-YYYY').format('YYYY-MM-DD'); (m[r.name] = m[r.name] || {})[e] = 1; }); } catch (e) {}
    try { MCX_OPTION_LIST.forEach(function (r) { var e = moment(r.expiry, 'DD-MM-YYYY').format('YYYY-MM-DD'); (m[r.name] = m[r.name] || {})[e] = 1; }); } catch (e) {}
    return m;
}
function _ossScanDte(name, expMap) {
    try {
        var opt = _OSS_DISPLAY_TO_OPT[name] || name, avail = Object.keys(expMap[opt] || {}).sort();
        var mcx = _ossIsMcx(name);
        var te = _dlResolveExpiryFor(_dlConfiguredExpiryForName(opt, mcx ? 'opt' : undefined), avail);
        var base = (mcx && typeof MCX_CURRENT_DAY !== 'undefined' && MCX_CURRENT_DAY) ? MCX_CURRENT_DAY : CURRENT_DAY;
        return Math.max(1, moment(te).diff(moment(base).startOf('day'), 'days'));
    } catch (e) { return null; }
}
async function _ossScanLoad(name) {
    var asofNow = _ossAsOf().txt, held = _OSS_DATA_AT[name];
    if (held && held.asof === asofNow && Date.now() - held.t < 4 * 60000) return;   // a different snapshot time must refetch
    if (_ossIsMcx(name)) {
        // same calls as the Commodities popup / the strike search preload
        try {
            var fr = await showFutureDetailsMCX(name);
            if (fr) {
                if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
                INSTRUMENT_SCORE_MAP[name].futures_trend = getFuturesTrendScore(fr['REMARK']);
                INSTRUMENT_SCORE_MAP[name].futures_trend_remark = fr['REMARK'];
                await showPrictionProbabiltyMCX(name, fr);
            }
        } catch (e) { console.log('[oss-scan] MCX load', name, e); }
        _OSS_DATA_AT[name] = { t: Date.now(), asof: asofNow }; _OSS_LOADED[name] = true;
        return;
    }
    var res = await Promise.all([
        Promise.resolve().then(function () { return showPrictionProbabilty(name); }).catch(function () {}),
        Promise.resolve().then(function () { return showFutureDetails(name); }).catch(function () { return null; }),
    ]);
    var f = res[1];
    if (f) {
        if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
        INSTRUMENT_SCORE_MAP[name].futures_trend = getFuturesTrendScore(f['REMARK']);
        INSTRUMENT_SCORE_MAP[name].futures_trend_remark = f['REMARK'];
        INSTRUMENT_SCORE_MAP[name].avwap = f['vwapPrice'] || 0;
    }
    _OSS_DATA_AT[name] = { t: Date.now(), asof: asofNow }; _OSS_LOADED[name] = true;
}
function _ossScanCompute(name, expMap) {
    var row = { name: name, ltp: null, z: '', score: null, key: null, label: 'none', view: '', note: '', want: 0, agree: null, timing: null, rank: null, cand: false };
    try { var tr = _ossIsMcx(name) ? _ossTrend(name) : generateTrend(name); row.ltp = parseFloat(tr.ltp); } catch (e) {}
    try { var b9 = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}'); row.z = ((b9[name] || {})['CLOSE_9_15']) || ''; } catch (e) {}
    try { row.score = computeInstrumentScore(name).total; } catch (e) {}
    var sg = null; try { sg = _ossSuggestedKey(name, { skipMarketGate: true }); } catch (e) {}
    if (!sg || !sg.key) { row.note = (sg && sg.why) || 'no suggestion'; return row; }
    var strat = _ossStrategyByKey(sg.key);
    row.key = sg.key; row.label = strat.label; row.view = strat.view; row.note = sg.why || '';
    row.want = /Bullish|Mildly bullish/.test(strat.view) ? 1 : /Bearish|Mildly bearish/.test(strat.view) ? -1 : 0;
    _OSS_AGREE_LAST = null; _ossAgreement(name, strat.view);
    if (_OSS_AGREE_LAST) row.agree = { agree: _OSS_AGREE_LAST.agree, total: _OSS_AGREE_LAST.total, pct: _OSS_AGREE_LAST.pct };
    // same rule as the search: a range strategy with under 45% agreement is dropped
    if (/Range-bound/.test(strat.view) && row.agree && row.agree.pct < 45) { row.key = null; row.label = 'none'; row.view = ''; row.want = 0; row.note = 'Range view dropped: only ' + row.agree.pct + '% of signals support it.'; return row; }
    if (row.want) {
        _OSS_TIMING_LAST = null; _ossTimingFor(name, row.want, sg.key, _ossScanDte(name, expMap));
        if (_OSS_TIMING_LAST) row.timing = { pct: _OSS_TIMING_LAST.pct, label: _OSS_TIMING_LAST.label };
    }
    var a = row.agree ? row.agree.pct : null, t = row.timing ? row.timing.pct : null;
    if (a != null) row.rank = row.want ? (t != null ? Math.round(a * t / 100) : null) : Math.round(a / 2);   // directional: agreement x timing; range: half (it has no timing)
    row.cand = !!(row.want && a != null && t != null && a >= 65 && t >= 70);
    return row;
}
async function _ossScanRun(scope, zone) {
    if (_OSS_SCAN.running) return;
    zone = scope === 'mcx' ? 'all' : (zone || 'all');
    var names = _ossScanUniverse(scope, zone), expMap = _ossScanExpiryMap();
    if (!names.length) {
        _OSS_SCAN.rows = []; _OSS_SCAN.done = 0; _OSS_SCAN.total = 0; _OSS_SCAN.zone = zone; _OSS_SCAN.empty = 'No names to scan: ' + ((zone !== 'all' || scope === 'asobso') ? 'none of them closed in the ' + (scope === 'asobso' && zone === 'all' ? 'ASO/BSO' : zone) + ' zone at 9:15 (or the 9:15 scan has not run yet).' : 'no names with listed options.'); _ossScanRender(); return;
    }
    _OSS_SCAN.empty = '';
    Object.assign(_OSS_SCAN, { running: true, cancel: false, rows: [], done: 0, total: names.length, current: '', startedAt: Date.now(), scope: scope, zone: zone, asof: _ossAsOf().txt });
    _ossScanRender();
    var idx = 0, workers = 4;
    var worker = async function () {
        while (!_OSS_SCAN.cancel) {
            var i = idx++; if (i >= names.length) return;
            var n = names[i]; _OSS_SCAN.current = n;
            try { await _ossScanLoad(n); } catch (e) {}
            try { _OSS_SCAN.rows.push(_ossScanCompute(n, expMap)); } catch (e) { console.log('[oss-scan]', n, e); }
            _OSS_SCAN.done++;
            if (_OSS_SCAN.done % 3 === 0 || _OSS_SCAN.done === names.length) _ossScanRender();
        }
    };
    var ws = []; for (var w = 0; w < workers; w++) ws.push(worker());
    await Promise.all(ws);
    _OSS_SCAN.running = false; _OSS_SCAN.current = '';
    try { var sm = _ossScanSummary(); if (typeof callSackBarInfo === 'function' && sm.n) callSackBarInfo('Scan done: ' + sm.bull + ' bullish · ' + sm.bear + ' bearish · ' + sm.range + ' range · ' + sm.none + ' no pick — ' + sm.label); } catch (e) {}
    try { localStorage.setItem('OSS_SCAN_LAST', JSON.stringify({ t: Date.now(), scope: scope, zone: zone, day: CURRENT_DAY, asof: (_ossAsOf().on ? _ossAsOf().txt : 'Live'), rows: _OSS_SCAN.rows })); } catch (e) {}
    _ossScanRender();
}
// The dashboard's market guard (VIX-level NO TRADE, or WAIT because the score and index futures conflict) makes the
// strike search suggest nothing. The scan still computes each name's own read, but it must not call anything a
// CANDIDATE while that guard is on, or the scan and the search would contradict each other.
function _ossScanGuard() {
    try {
        var ms = _gtbHeadlineMarketSignal().ms;
        if (ms && ms.signal && (/NO TRADE/i.test(ms.signal) || (/WAIT/i.test(ms.signal) && /conflict/i.test(ms.reason || ''))))
            return { active: true, signal: ms.signal, reason: ms.reason || '' };
    } catch (e) {}
    return { active: false };
}
function _ossScanRowsView() {
    var S = _OSS_SCAN, q = (S.q || '').toUpperCase();
    var rows = S.rows.filter(function (r) {
        if (S.dirOnly && !r.want) return false;
        if (S.candOnly && !(r.cand && !S._block)) return false;
        if (q && r.name.indexOf(q) === -1) return false;
        return true;
    });
    var col = S.sort.col, dir = S.sort.dir;
    var val = function (r) {
        return col === 'name' ? r.name : col === 'ltp' ? r.ltp : col === 'score' ? r.score : col === 'agree' ? (r.agree ? r.agree.pct : null)
            : col === 'timing' ? (r.timing ? r.timing.pct : null) : col === 'view' ? r.view : r.rank;
    };
    rows.sort(function (a, b) {
        var x = val(a), y = val(b);
        if (x == null && y == null) return a.name < b.name ? -1 : 1;
        if (x == null) return 1;                       // blanks always last
        if (y == null) return -1;
        var c = (typeof x === 'string') ? (x < y ? -1 : x > y ? 1 : 0) : (x - y);
        return dir === -1 ? -c : c;                    // dir -1 = largest first
    });
    return rows;
}
// Kite chart-page link for the underlying (same URL builder the Price Action grid uses); empty if the name has no token.
function _ossScanChartLink(name) {
    try {
        if (typeof INSTRUMENT_TOKENS === 'undefined' || !INSTRUMENT_TOKENS[name] || typeof _gtbDashPAChartLink !== 'function') return '';
        return ' <a href="' + _gtbDashPAChartLink({ name: name, mcx: false }) + '" target="_blank" rel="noopener" class="oss-chart-link" title="Open ' + name + ' chart on Kite"><i class="bi bi-graph-up"></i> Chart</a>';
    } catch (e) { return ''; }
}
function _ossScanRowHtml(r, i) {
    var pctCol = function (p, good, ok) { return p == null ? 'var(--gtb-muted)' : p >= good ? 'var(--gtb-green)' : p >= ok ? 'var(--gtb-amber)' : 'var(--gtb-red)'; };
    var viewCol = r.want > 0 ? 'var(--gtb-green)' : r.want < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
    var side = r.want > 0 ? 'BULL' : r.want < 0 ? 'BEAR' : (r.key ? 'RANGE' : '—');
    var z = r.z ? '<span class="oss-z oss-z-' + String(r.z).replace(/[^A-Za-z]/g, '') + '">' + r.z + '</span>' : '<span class="oss-na">—</span>';
    var blocked = r.cand && _OSS_SCAN._block;
    return '<tr class="' + (r.cand ? (blocked ? 'oss-scan-blocked' : 'oss-scan-cand') : '') + '" title="' + String(r.note || '').replace(/"/g, '&quot;') + '">'
        + '<td class="oss-na">' + (i + 1) + '</td>'
        + '<td><b>' + r.name + '</b>' + (r.cand ? (blocked ? ' <span class="oss-cand-tag oss-blocked-tag" title="Would qualify, but the dashboard market guard is on">BLOCKED</span>' : ' <span class="oss-cand-tag">CANDIDATE</span>') : '') + '</td>'
        + '<td class="oss-num">' + (r.ltp != null && isFinite(r.ltp) ? r.ltp.toFixed(2) : '—') + '</td>'
        + '<td>' + z + '</td>'
        + '<td class="oss-num" style="color:' + (r.score > 0 ? 'var(--gtb-green)' : r.score < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)') + ';">' + (r.score != null ? (r.score > 0 ? '+' : '') + r.score.toFixed(1) : '—') + '</td>'
        + '<td><span style="color:' + viewCol + ';font-weight:800;">' + side + '</span> <span class="oss-na">' + (r.key ? r.label : r.note.slice(0, 46)) + '</span></td>'
        + '<td class="oss-num" style="color:' + pctCol(r.agree && r.agree.pct, 65, 45) + ';">' + (r.agree ? r.agree.pct + '% <span class="oss-na">' + r.agree.agree + '/' + r.agree.total + '</span>' : '—') + '</td>'
        + '<td class="oss-num" style="color:' + pctCol(r.timing && r.timing.pct, 70, 50) + ';">' + (r.timing ? r.timing.pct + '%' : '<span class="oss-na">n/a</span>') + '</td>'
        + '<td class="oss-num"><b>' + (r.rank != null ? r.rank : '—') + '</b></td>'
        + '<td style="white-space:nowrap;"><a href="#" class="oss-scan-open" data-name="' + r.name + '" title="Open the strike search for ' + r.name + '">Strikes</a>' + _ossScanChartLink(r.name) + '</td>'
        + '</tr>';
}
// Table body, optionally grouped by the 9:15 close zone (AST, ASO, B/W, BSO, BST). Each group keeps the active sort.
function _ossScanBodyHtml(rows) {
    if (!rows.length) return '<tr><td colspan="10" class="oss-na" style="padding:14px;">' + (_OSS_SCAN.rows.length ? 'No rows match the filters.' : 'Pick a scope and press Scan.') + '</td></tr>';
    if (!_OSS_SCAN.group || _OSS_SCAN.scope === 'mcx') return rows.map(_ossScanRowHtml).join('');
    var order = [['AST', 'AST — 9:15 closed above AST', 'var(--gtb-green)'], ['ASO', 'ASO — closed above ASO', 'var(--gtb-green)'], ['B/W', 'B/W — closed between BSO and ASO', 'var(--gtb-muted)'],
                 ['BSO', 'BSO — closed below BSO', 'var(--gtb-red)'], ['BST', 'BST — closed below BST', 'var(--gtb-red)'], ['', 'No 9:15 zone yet', 'var(--gtb-muted)']];
    var by = {}; rows.forEach(function (r) { var k = r.z && /^(AST|ASO|B\/W|BSO|BST)$/.test(r.z) ? r.z : ''; (by[k] = by[k] || []).push(r); });
    var html = '', i = 0;
    order.forEach(function (g) {
        var list = by[g[0]]; if (!list || !list.length) return;
        var bull = list.filter(function (r) { return r.want > 0; }).length, bear = list.filter(function (r) { return r.want < 0; }).length, cand = list.filter(function (r) { return r.cand && !_OSS_SCAN._block; }).length;
        html += '<tr class="oss-scan-grp"><td colspan="10" style="color:' + g[2] + ';border-left:3px solid ' + g[2] + ';"><b>' + g[1] + '</b> <span class="oss-na">· ' + list.length + ' name' + (list.length > 1 ? 's' : '')
            + ' · ' + bull + ' bullish · ' + bear + ' bearish' + (cand ? ' · ' + cand + ' candidate' + (cand > 1 ? 's' : '') : '') + '</span></td></tr>';
        list.forEach(function (r) { html += _ossScanRowHtml(r, i++); });
    });
    return html;
}
// Bulls / bears / trend overview of everything the scan has read so far (all scanned rows, not just the filtered view).
function _ossScanSummary() {
    var rows = _OSS_SCAN.rows, t = { n: rows.length, bull: 0, bear: 0, range: 0, none: 0, cand: 0, agSum: 0, agN: 0, z: { AST: 0, ASO: 0, 'B/W': 0, BSO: 0, BST: 0 } };
    rows.forEach(function (r) {
        if (!r.key) t.none++; else if (r.want > 0) t.bull++; else if (r.want < 0) t.bear++; else t.range++;
        if (r.cand) t.cand++;
        if (r.want && r.agree) { t.agSum += r.agree.pct; t.agN++; }
        if (t.z[r.z] !== undefined) t.z[r.z]++;
    });
    var dir = t.bull + t.bear;
    t.net = dir ? (t.bull - t.bear) / dir : 0;
    t.label = !dir ? 'NO DIRECTIONAL PICKS' : t.net >= 0.3 ? 'BULLISH-LEANING' : t.net <= -0.3 ? 'BEARISH-LEANING' : 'MIXED';
    t.avgAgree = t.agN ? Math.round(t.agSum / t.agN) : null;
    // index-weight view: the heaviest stocks of NIFTY 50 / BANK NIFTY carry known weights (top 10 each)
    t.w = [];
    [['NIFTY 50', typeof NIFTY_50_WEIGHTED_STOCKS !== 'undefined' ? NIFTY_50_WEIGHTED_STOCKS : null], ['BANK NIFTY', typeof NIFTY_BANK_WEIGHTED_STOCKS !== 'undefined' ? NIFTY_BANK_WEIGHTED_STOCKS : null]].forEach(function (pair) {
        var W = pair[1]; if (!W) return;
        // a NIFTY 50 / BANK NIFTY scope reports only that index (bank stocks overlap NIFTY 50, which made the other index show partial numbers)
        if ((_OSS_SCAN.scope === 'nifty50' && pair[0] !== 'NIFTY 50') || (_OSS_SCAN.scope === 'banknifty' && pair[0] !== 'BANK NIFTY')) return;
        var tot = 0, bw = 0, sw = 0, k = 0, all = 0;
        Object.keys(W).forEach(function (nm) { all += W[nm]; });
        rows.forEach(function (r) { if (W[r.name] != null) { k++; tot += W[r.name]; if (r.want > 0) bw += W[r.name]; else if (r.want < 0) sw += W[r.name]; } });
        var dw = bw + sw, wNet = dw ? (bw - sw) / dw : 0;
        if (k >= 3) t.w.push({ idx: pair[0], dirBull: dw ? Math.round(bw / dw * 100) : 0, dirBear: dw ? Math.round(sw / dw * 100) : 0, wLean: !dw ? 'NO DIRECTIONAL WEIGHT' : wNet >= 0.3 ? 'BULLISH' : wNet <= -0.3 ? 'BEARISH' : 'MIXED', k: k, n: Object.keys(W).length, cover: Math.round(tot), bull: Math.round(bw / tot * 100), bear: Math.round(sw / tot * 100), bullP: bw / all * 100, bearP: sw / all * 100, neuP: (tot - bw - sw) / all * 100, missP: (all - tot) / all * 100 });
    });
    // do the heavyweights confirm the headline (name-count) lean?
    var cl = t.label === 'BULLISH-LEANING' ? 'BULLISH' : t.label === 'BEARISH-LEANING' ? 'BEARISH' : null;
    t.noConfirm = cl ? t.w.filter(function (w) { return w.wLean !== cl; }).map(function (w) { return w.idx + ' heavyweights ' + w.wLean.toLowerCase(); }) : [];
    return t;
}
function _ossScanSummaryHtml() {
    var S = _OSS_SCAN; if (!S.rows.length) return '';
    var t = _ossScanSummary(), pct = function (x, of) { return of ? Math.round(x / of * 100) : 0; }, dir = t.bull + t.bear;
    var col = t.net >= 0.3 ? 'var(--gtb-green)' : t.net <= -0.3 ? 'var(--gtb-red)' : 'var(--gtb-amber)';
    var chip = function (label, v, c, tip) { return '<span class="oss-sum-chip" title="' + (tip || '') + '" style="border-color:' + c + ';color:' + c + ';"><b>' + v + '</b> ' + label + '</span>'; };
    var zones = ['AST', 'ASO', 'B/W', 'BSO', 'BST'].filter(function (z) { return t.z[z]; }).map(function (z) { return t.z[z] + ' ' + z; }).join(' · ');
    var seg = function (v, c, tip) { return v > 0.4 ? '<span title="' + tip + '" style="display:inline-block;height:100%;width:' + v.toFixed(1) + '%;background:' + c + ';"></span>' : ''; };
    var wl = t.w.map(function (w) {
        return '<div style="display:flex;align-items:center;gap:8px;margin-top:3px;"><b style="min-width:70px;">' + w.idx + '</b>'
            + '<span style="display:inline-flex;width:240px;height:10px;border:1px solid var(--gtb-border);overflow:hidden;">'
            + seg(w.bullP, 'var(--gtb-green)', 'Bullish weight') + seg(w.bearP, 'var(--gtb-red)', 'Bearish weight') + seg(w.neuP, 'var(--gtb-amber)', 'Range / no pick') + seg(w.missP, 'var(--gtb-border)', 'Not scanned') + '</span>'
            + '<span><b style="color:var(--gtb-green);">' + w.bull + '%</b> bullish · <b style="color:var(--gtb-red);">' + w.bear + '%</b> bearish · ' + (100 - w.bull - w.bear) + '% neutral <span class="oss-na">· of the directional weight ' + w.dirBull + '% bullish / ' + w.dirBear + '% bearish = <b>' + w.wLean + '</b> (top-' + w.k + ' of ' + w.n + ' weighted stocks scanned)</span></span></div>';
    }).join('');
    var warn = t.noConfirm.length ? '<div class="oss-sum-row" style="color:var(--gtb-amber);font-weight:700;">MIXED - the heavyweights are not confirming the ' + t.label.split('-')[0].toLowerCase() + ' lean (' + t.noConfirm.join('; ') + '). Treat NIFTY / BANK NIFTY trades with caution.</div>' : '';
    return warn + '<div class="oss-sum-row"><b style="color:' + col + ';font-size:0.7rem;">' + (S.running ? 'So far: ' : 'Trend overview: ') + t.label + '</b>'
        + chip('bullish', t.bull + ' (' + pct(t.bull, t.n) + '%)', 'var(--gtb-green)', 'Names whose suggested strategy is bullish')
        + chip('bearish', t.bear + ' (' + pct(t.bear, t.n) + '%)', 'var(--gtb-red)', 'Names whose suggested strategy is bearish')
        + chip('range', t.range, 'var(--gtb-muted)', 'Range strategy suggested (no direction)')
        + chip('no pick', t.none, 'var(--gtb-muted)', 'Nothing suggested for these names')
        + (t.cand ? chip('candidate' + (t.cand > 1 ? 's' : ''), t.cand, 'var(--gtb-green)', 'Directional, agreement >= 65% and timing >= 70% (blocked while the market guard is on)') : '')
        + '</div><div class="oss-sum-row oss-na">'
        + (dir ? (t.bull + ' bullish vs ' + t.bear + ' bearish among ' + dir + ' directional picks (' + pct(t.bull, dir) + '% / ' + pct(t.bear, dir) + '%)') : 'no directional picks')
        + (t.avgAgree != null ? ' · average signal agreement ' + t.avgAgree + '%' : '') + (zones ? ' · 9:15 zones: ' + zones : '')
        + (wl ? '<br>' + wl : '') + '</div>';
}
function _ossScanRender() {
    var $w = jQ('#oss-scan-wrap'); if (!$w.length) return;
    var S = _OSS_SCAN, G = _ossScanGuard();
    S._block = G.active && !S.ignoreGuard && S.scope !== 'mcx';   // the dashboard guard is NSE-only; the MCX search skips it too
    var rows = _ossScanRowsView();
    var mins = S.startedAt ? Math.max(0, Math.round((Date.now() - S.startedAt) / 60000)) : 0;
    var scopeTxt = { mcx: ' [MCX]', asobso: ' [ASO/BSO stocks]', fo: ' [F&O stocks only]', niftybank: ' [NIFTY 50 + BANK NIFTY]', nifty50: ' [NIFTY 50]', banknifty: ' [BANK NIFTY]' }[S.scope] || '';
    var zoneTxt = scopeTxt + (S.zone && S.zone !== 'all' ? ' [9:15 zone: ' + ({ bull: 'AST + ASO', bear: 'BSO + BST' }[S.zone] || S.zone) + ']' : '');
    var nowAsOf = _ossAsOf().txt, asofTxt = ' · data as of ' + (S.asof || 'Live') + (S.rows.length && (S.asof || 'Live') !== nowAsOf ? ' — the dashboard is now at ' + nowAsOf + ', so scan again' : '');
    var status = S.empty ? S.empty : S.running ? 'Scanning ' + S.done + ' / ' + S.total + zoneTxt + (S.current ? ' — ' + S.current : '') + ' · ' + mins + ' min elapsed'
        : (S.rows.length ? 'Done: ' + S.rows.length + ' names' + (S.startedAt ? ' in ' + mins + ' min' : '') + zoneTxt + asofTxt : 'Not run yet');
    var ms = null; try { ms = _gtbHeadlineMarketSignal().ms; } catch (e) {}
    var mk = G.active
        ? '<span class="oss-scan-guard">⛔ Market guard ON — ' + G.signal + (G.reason ? ': ' + G.reason : '') + '. ' + (S.ignoreGuard ? 'Ignored: candidates are shown anyway.' : 'No name is called a candidate while it is on (the strike search suggests nothing in this state either). Tick "Ignore market guard" to see what would otherwise qualify.') + '</span>'
        : (ms && ms.signal ? '<span class="oss-scan-mkt">Dashboard market verdict: <b>' + ms.signal + '</b></span>' : '');
    var th = function (c, l, tip) { var on = S.sort.col === c; return '<th class="oss-th-sort" data-col="' + c + '" title="' + (tip || 'Sort') + '">' + l + (on ? (S.sort.dir === -1 ? ' ▼' : ' ▲') : '') + '</th>'; };
    jQ('#oss-scan-status').text(status);
    jQ('#oss-scan-go').prop('disabled', S.running).text(S.running ? 'Scanning…' : 'Scan');
    jQ('#oss-scan-stop').prop('disabled', !S.running);
    jQ('#oss-scan-mkt').html(mk);
    jQ('#oss-scan-sum').html(_ossScanSummaryHtml());
    var _prevTop = jQ('#oss-scan-table').scrollTop();
    jQ('#oss-scan-table').html(
        '<table class="oss-table oss-scan-table"><thead><tr><th>#</th>' + th('name', 'Name') + th('ltp', 'LTP') + '<th>9:15</th>' + th('score', 'Score', 'Instrument composite score')
        + th('view', 'Suggested', 'What ★ Suggested picks for this name') + th('agree', 'Agreement', 'Share of independent signals pointing the same way as the strategy') + th('timing', 'Entry timing', 'Is now a good moment? (directional strategies only)')
        + th('rank', 'Rank', 'Directional: agreement x timing / 100. Range strategies: half the agreement.') + '<th></th></tr></thead><tbody>'
        + _ossScanBodyHtml(rows)
        + '</tbody></table>');
    try { jQ('#oss-scan-table').scrollTop(_prevTop); } catch (e) {}
    _ossFitScroll('popup-custom-style-oss-scan', '#oss-scan-table', ['.oss-header', '.oss-scan-bar', '#oss-scan-sum', '.oss-scan-note']);
}
function _ossScanShow() {
    var html = '<div id="oss-scan-wrap" class="oss-wrap">'
        + '<div class="oss-header">'
        +   '<label class="oss-ltp-override">Scope <select id="oss-scan-scope" class="oss-select"><option value="core">Indices + NIFTY 50 / BANK NIFTY weighted stocks (about 25, ~1 min)</option><option value="nifty50">NIFTY 50 and all its stocks (about 51, a few minutes)</option><option value="niftybank">NIFTY 50 + BANK NIFTY and all their stocks (about 55, a few minutes)</option><option value="banknifty">BANK NIFTY and all its stocks (about 13, ~1 min)</option><option value="mcx">MCX commodities with options (about 8, ~1 min)</option><option value="asobso">ASO / BSO stocks only (F&amp;O stocks that closed ASO or BSO at 9:15, fast)</option><option value="fo">F&amp;O stocks only, no indices (about 215, several minutes)</option><option value="all">All F&amp;O names + indices (about 190, several minutes)</option></select></label>'
        +   '<label class="oss-ltp-override" title="Scan only names whose 9:15 candle closed in this zone (from the 9:15 scan)">9:15 zone <select id="oss-scan-zone" class="oss-select"><option value="all">All zones</option><option value="AST">AST</option><option value="ASO">ASO</option><option value="B/W">B/W</option><option value="BSO">BSO</option><option value="BST">BST</option><option value="bull">AST + ASO (bullish)</option><option value="bear">BSO + BST (bearish)</option></select></label>'
        +   '<button id="oss-scan-go" class="fsig-add-btn" type="button">Scan</button><button id="oss-scan-stop" class="sv-pill-btn" type="button" disabled>Stop</button>'
        +   '<label class="oss-ltp-override" title="Group the rows by the 9:15 close zone: AST, ASO, B/W, BSO, BST"><input type="checkbox" id="oss-scan-grp"> Group by 9:15 zone</label>'
        +   '<label class="oss-ltp-override"><input type="checkbox" id="oss-scan-dir"> Directional only</label>'
        +   '<label class="oss-ltp-override"><input type="checkbox" id="oss-scan-cand"> Candidates only</label>'
        +   '<label class="oss-ltp-override" title="Show candidates even while the dashboard market guard (NO TRADE / conflicting signals) is on"><input type="checkbox" id="oss-scan-ign"> Ignore market guard</label>'
        +   '<label class="oss-ltp-override">Find <input type="text" id="oss-scan-q" placeholder="name" style="width:90px;"></label>'
        +   '<button id="oss-scan-copy" class="sv-pill-btn" type="button"><i class="bi bi-clipboard"></i> Copy list</button>'
        + '</div>'
        + '<div class="oss-scan-bar"><span id="oss-scan-status" class="oss-na">Not run yet</span><span id="oss-scan-mkt"></span></div>'
        + '<div id="oss-scan-sum" class="oss-scan-sum"></div>'
        + '<div class="oss-scan-note">CANDIDATE = directional strategy with agreement ≥ 65% and entry timing ≥ 70%, while the dashboard market guard is off. A checklist ranking, not a probability of profit and not back-tested. Hover a row for the reason. Positional view counts only for names already scanned in the Positional Screener.</div>'
        + '<div id="oss-scan-table" class="oss-result"></div></div>';
    showPopUpWindow('oss-scan', html, 'Option Strike Scan', 1060, 640);
    var cls = 'popup-custom-style-oss-scan';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html('<div style="display:flex;align-items:center;gap:6px;width:100%;"><i class="bi bi-search"></i><span style="font-weight:800;font-size:0.7rem;">OPTION STRIKE SCAN</span>' + popupWinControls(cls) + '</div>');
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + cls).find('.popupwindow_content').css({ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '0', position: 'relative' });
    _ossFitContent(cls);
    jQ('.' + cls).toggleClass('gtb-light', (typeof _gtbIsLightTheme === 'function' ? _gtbIsLightTheme() : (localStorage.getItem('GTB_THEME') || 'dark') === 'light'));
    if (!_OSS_SCAN.rows.length && !_OSS_SCAN.running) {
        try { var last = JSON.parse(localStorage.getItem('OSS_SCAN_LAST') || 'null'); if (last && last.rows && last.day === CURRENT_DAY) { _OSS_SCAN.rows = last.rows; _OSS_SCAN.done = last.rows.length; _OSS_SCAN.total = last.rows.length; _OSS_SCAN.scope = last.scope; _OSS_SCAN.zone = last.zone || 'all'; _OSS_SCAN.asof = last.asof || 'Live'; } } catch (e) {}
    }
    _ossWatchFit(cls, '#oss-scan-table', ['.oss-header', '.oss-scan-bar', '#oss-scan-sum', '.oss-scan-note']);
    jQ('#oss-scan-zone').val(_OSS_SCAN.zone || 'all');
    jQ('#oss-scan-scope').val(_OSS_SCAN.scope);
    jQ('#oss-scan-grp').prop('checked', _OSS_SCAN.group); jQ('#oss-scan-ign').prop('checked', _OSS_SCAN.ignoreGuard); jQ('#oss-scan-dir').prop('checked', _OSS_SCAN.dirOnly); jQ('#oss-scan-cand').prop('checked', _OSS_SCAN.candOnly); jQ('#oss-scan-q').val(_OSS_SCAN.q);
    _ossScanRender();
}
jQ(document).on('click', '#oss-scan-btn', function (e) { e.preventDefault(); _ossScanShow(); });
jQ(document).on('click', '#oss-scan-go', function () { var sc = jQ('#oss-scan-scope').val(); _ossScanRun(['core', 'all', 'fo', 'asobso', 'nifty50', 'banknifty', 'niftybank', 'mcx'].indexOf(sc) >= 0 ? sc : 'core', jQ('#oss-scan-zone').val() || 'all'); });
jQ(document).on('click', '#oss-scan-stop', function () { _OSS_SCAN.cancel = true; });
jQ(document).on('change', '#oss-scan-dir', function () { _OSS_SCAN.dirOnly = this.checked; _ossScanRender(); });
jQ(document).on('change', '#oss-scan-grp', function () { _OSS_SCAN.group = this.checked; _ossScanRender(); });
jQ(document).on('change', '#oss-scan-ign', function () { _OSS_SCAN.ignoreGuard = this.checked; _ossScanRender(); });
jQ(document).on('change', '#oss-scan-cand', function () { _OSS_SCAN.candOnly = this.checked; _ossScanRender(); });
jQ(document).on('input', '#oss-scan-q', function () { _OSS_SCAN.q = jQ(this).val(); _ossScanRender(); });
jQ(document).on('click', '.oss-th-sort', function () {
    var c = jQ(this).attr('data-col');
    _OSS_SCAN.sort = { col: c, dir: _OSS_SCAN.sort.col === c ? -_OSS_SCAN.sort.dir : (c === 'name' || c === 'view' ? 1 : -1) };
    _ossScanRender();
});
jQ(document).on('click', '.oss-scan-open', function (e) { e.preventDefault(); _ossShowPopup(jQ(this).attr('data-name')); });
jQ(document).on('click', '#oss-scan-copy', function () {
    var lines = _ossScanRowsView().map(function (r) { return [r.name, r.want > 0 ? 'BULL' : r.want < 0 ? 'BEAR' : (r.key ? 'RANGE' : '-'), r.label, r.agree ? r.agree.pct + '%' : '-', r.timing ? r.timing.pct + '%' : '-', r.rank != null ? r.rank : '-', r.cand ? (_OSS_SCAN._block ? 'BLOCKED' : 'CANDIDATE') : ''].join('\t'); });
    try { navigator.clipboard.writeText('Name\tSide\tStrategy\tAgreement\tTiming\tRank\tFlag\n' + lines.join('\n')).then(function () { if (typeof callSackBarInfo === 'function') callSackBarInfo('Scan list copied'); }); } catch (e) {}
});

var _OSS_PSCAN = {}; // name -> 'busy' | 'failed' (cleared once a scan result is cached)
function _ossPositionalFlag(name, stratView) {
    try {
        var r = (typeof _PS_CACHE !== 'undefined') && (_PS_CACHE[name] || _PS_CACHE[String(name).toUpperCase()]);
        if (!r) {
            var key = String(name).toUpperCase();
            if (typeof _psPriceTokenFor === 'function' && !_psPriceTokenFor(key)) return '<div class="oss-desc">Positional view: not available for this instrument (no daily price token).</div>';
            if (_OSS_PSCAN[key] === 'busy') return '<div class="oss-desc"><i class="bi bi-hourglass-split"></i> Positional view: scanning…</div>';
            if (_OSS_PSCAN[key] === 'failed') return '<div class="oss-desc">Positional view: scan did not finish (another scan was running or it failed) — search again to retry.</div>';
            return '<div class="oss-desc">Positional view: not scanned yet.</div>';
        }
        var dir = r.primary && r.primary.ok ? r.primary.dir : null;
        var word = dir == null ? 'insufficient history' : dir > 0 ? 'bullish' : dir < 0 ? 'bearish' : 'neutral';
        var snapNote = _ossAsOf().on ? ' <span class="oss-na">(daily candles — not time-sliced to the snapshot)</span>' : '';
        var txt = 'Positional view: <b>' + r.verdict + '</b> (' + word + (r.convictionPct != null ? ', conviction ' + r.convictionPct + '%' : '') + ')';
        var bull = /Bullish|Mildly bullish/.test(stratView || ''), bear = /Bearish|Mildly bearish/.test(stratView || '');
        var clash = dir != null && ((bull && dir < 0) || (bear && dir > 0));
        return clash
            ? '<div class="oss-suggest">⚠ ' + txt + ' — opposite to this strategy. The expiry is days away, so the swing trend can outweigh the intraday call.' + snapNote + '</div>'
            : '<div class="oss-desc">' + txt + (dir != null && (bull || bear) ? ' — agrees with this strategy.' : '.') + snapNote + '</div>';
    } catch (e) { return ''; }
}

// Default pick lists so nothing has to be typed: the indices, then the weighted stocks of NIFTY 50 and BANK NIFTY
// (heaviest first, weight in the tooltip). Only names that actually have listed options are shown.
function _ossPicksHtml() {
    var have = {}; _ossAllNames().forEach(function (n) { have[n] = 1; });
    var anyLoaded = Object.keys(have).length > 0;
    var ok = function (n) { return !anyLoaded || have[n]; };
    var chip = function (n, tip) { return '<span class="oss-pick" data-oss-pick="' + n + '" title="' + tip + '">' + n + '</span>'; };
    var byWeight = function (obj) { return Object.keys(obj || {}).sort(function (a, b) { return obj[b] - obj[a]; }); };
    var row = function (label, html) { return html ? '<div class="oss-pick-row"><span class="oss-pick-lbl">' + label + '</span>' + html + '</div>' : ''; };
    var idx = ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'NIFTY FIN SERVICE', 'NIFTY MID SELECT'].filter(ok).map(function (n) { return chip(n, 'Option strikes for ' + n); }).join('');
    var w50 = (typeof NIFTY_50_WEIGHTED_STOCKS !== 'undefined') ? byWeight(NIFTY_50_WEIGHTED_STOCKS).filter(ok).map(function (n) { return chip(n, n + ' — ' + NIFTY_50_WEIGHTED_STOCKS[n] + '% of NIFTY 50'); }).join('') : '';
    var wbn = (typeof NIFTY_BANK_WEIGHTED_STOCKS !== 'undefined') ? byWeight(NIFTY_BANK_WEIGHTED_STOCKS).filter(ok).map(function (n) { return chip(n, n + ' — ' + NIFTY_BANK_WEIGHTED_STOCKS[n] + '% of BANK NIFTY'); }).join('') : '';
    // MCX commodities that actually have listed options (MCX_OPTION_LIST), the usual ones first
    var mcxHave = {}; try { MCX_OPTION_LIST.forEach(function (r) { mcxHave[r.name] = 1; }); } catch (e) {}
    var mcxOrder = ['CRUDEOILM', 'CRUDEOIL', 'GOLDM', 'GOLD', 'SILVERM', 'SILVER', 'NATGASMINI', 'NATURALGAS', 'COPPER', 'ZINC', 'USDINR'];
    var mcxNames = mcxOrder.filter(function (n) { return mcxHave[n]; }).concat(Object.keys(mcxHave).filter(function (n) { return mcxOrder.indexOf(n) < 0; }).sort());
    var mcx = mcxNames.map(function (n) { return chip(n, 'MCX option strikes for ' + n); }).join('');
    return '<div class="oss-picks">' + row('Indices', idx) + row('NIFTY 50', w50) + row('BANK NIFTY', wbn) + row('MCX', mcx) + '</div>';
}
// The popup content box is 100% of the window, which includes the titlebar, so the bottom of the content (and the
// table's scrollbar) ended up below the visible area. Size it to what is left under the titlebar instead
// (calc keeps working when the popup is resized).
// Sizes the scrolling area (table / results) in PIXELS from the popup's real height, because the percentage-height chain
// through the popup library's content box did not give the table a bounded height (its scrollbar sat below the
// visible area). Re-run on popup resize and after every render, since the blocks above it can change height.
function _ossFitScroll(cls, scrollSel, blockSels) {
    try {
        var $p = jQ('.' + cls); if (!$p.length) return;
        var ph = $p.outerHeight(), tb = $p.find('.popupwindow_titlebar').outerHeight() || 34, used = 0;
        blockSels.forEach(function (sel) { var $e = $p.find(sel); if ($e.length) used += $e.outerHeight(true); });
        var h = Math.max(140, ph - tb - used - 8);
        $p.find(scrollSel).css({ height: h + 'px', maxHeight: h + 'px', flex: 'none', overflowY: 'auto', overflowX: 'auto' });
    } catch (e) {}
}
function _ossWatchFit(cls, scrollSel, blockSels) {
    _ossFitScroll(cls, scrollSel, blockSels);
    try {
        var el = jQ('.' + cls)[0];
        if (el && typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { _ossFitScroll(cls, scrollSel, blockSels); }).observe(el);
    } catch (e) {}
}
function _ossFitContent(cls) {
    try {
        var tb = jQ('.' + cls).find('.popupwindow_titlebar').outerHeight() || 34;
        jQ('.' + cls).find('.popupwindow_content').css({ height: 'calc(100% - ' + tb + 'px)', boxSizing: 'border-box' });
    } catch (e) {}
}
function _ossWrapHtml() {
    var saved = 'suggested'; _OSS_LAST_NAME = '';
    var groups = {}, order = [];
    _OSS_STRATEGIES.forEach(function (s) { if (!groups[s.group]) { groups[s.group] = []; order.push(s.group); } groups[s.group].push(s); });
    var opts = '<option value="suggested"' + (saved === 'suggested' ? ' selected' : '') + '>★ Suggested for today\'s verdict</option>'
        + order.map(function (g) {
            return '<optgroup label="' + g + '">' + groups[g].map(function (s) {
                return '<option value="' + s.key + '"' + (saved === s.key ? ' selected' : '') + '>' + s.label + (s.view !== 'Reference' ? ' — ' + s.view : '') + '</option>';
            }).join('') + '</optgroup>';
        }).join('');

    var html = '<div class="oss-wrap">'
        + '<div class="oss-header">'
        +   '<div class="bt-bk-search" style="min-width:240px;">'
        +     '<input type="text" id="oss-input" placeholder="Search stock / index (F&amp;O)…" autocomplete="off">'
        +     '<button id="oss-search-btn" class="fsig-add-btn"><i class="bi bi-search"></i> Search</button>'
        +     '<div id="oss-ac-drop" class="fsig-ac-drop" style="position:fixed;"></div>'
        +   '</div>'
        +   '<button id="oss-scan-btn" class="sv-pill-btn" type="button" title="Scan all indices and F&amp;O stocks and rank them by signal agreement and entry timing"><i class="bi bi-list-check"></i> Scan all</button>'
        +   '<label class="oss-ltp-override">Strategy <select id="oss-strategy" class="oss-select">' + opts + '</select></label>'
        +   '<label class="oss-ltp-override" title="Distance of the short / OTM strikes from ATM, in points. Blank = auto (one expected move to expiry for indices, else 3 strikes).">Offset <input type="text" id="oss-offset" placeholder="auto"></label>'
        +   '<label class="oss-ltp-override" title="Spread width / hedge distance, in points. Blank = auto for the chosen strategy.">Wing <input type="text" id="oss-wing" placeholder="auto"></label>'
        +   '<label class="oss-ltp-override" title="Number of lots for the risk figures and the basket quantity">Lots <input type="text" id="oss-lots" value="1" style="width:44px;"></label>'
        +   '<label class="oss-ltp-override" title="Leave blank to use the last cached LTP for this instrument">LTP override <input type="text" id="oss-ltp-override" placeholder="auto"></label>'
        + '</div>'
        + _ossPicksHtml()
        + '<div id="oss-result" class="oss-result">'
        +   '<div class="sv-empty-state"><i class="bi bi-search"></i><span>Search an instrument, pick a strategy, and the strikes are chosen from its LTP</span></div>'
        + '</div>'
        + '</div>';

    return html;
}

function _ossShowPopup(prefillName) {
    // The Trade tab embeds the same search; two copies would share element ids, so drop the embedded one.
    jQ('#gtb-oss-embed').empty();
    var html = _ossWrapHtml();

    showPopUpWindow('option-strike-search', html, 'Option Strike Search', 860, 600);
    var cls = 'popup-custom-style-option-strike-search';
    var title = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<i class="bi bi-search"></i><span style="font-weight:800;font-size:0.7rem;">OPTION STRIKE SEARCH</span>'
        + popupWinControls(cls)
        + '</div>';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html(title);
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + cls).find('.popupwindow_content').css({
        display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
        padding: '0', position: 'relative',
    });
    _ossFitContent(cls);
    jQ('.' + cls).toggleClass('gtb-light', (typeof _gtbIsLightTheme === 'function' ? _gtbIsLightTheme() : (localStorage.getItem('GTB_THEME') || 'dark') === 'light'));

    _ossWatchFit(cls, '#oss-result', ['.oss-header', '.oss-picks']);
    if (prefillName) { jQ('#oss-input').val(String(prefillName).toUpperCase()); _ossRunSearch(); }
}

// Entry point from an Instrument Detail View card: opens the popup for that instrument and builds
// the strikes from its current LTP.
function _ossOpenFor(name) { _ossShowPopup(name); }
jQ(document).on('click', '#cmd-strikes-btn', function (e) {
    e.preventDefault();
    _ossOpenFor((typeof _CMD !== 'undefined' && _CMD.activeName) || 'CRUDEOILM');
});
jQ(document).on('click', '.gtb-dv-strikes', function (e) { e.preventDefault(); _ossOpenFor(jQ(this).attr('data-name')); });

jQ(document).on('input', '#oss-input', function () {
    var q = jQ(this).val().trim().toUpperCase();
    var $drop = jQ('#oss-ac-drop');
    if (!q) { $drop.empty().hide(); return; }
    var items = _ossAllNames().filter(function (n) { return n.indexOf(q) !== -1; }).slice(0, 12);
    if (!items.length) { $drop.empty().hide(); return; }
    var html = items.map(function (n) { return '<div class="fsig-ac-item" data-name="' + n + '">' + n + '</div>'; }).join('');
    var rect = this.getBoundingClientRect();
    $drop.html(html).css({ top: (rect.bottom + 2) + 'px', left: rect.left + 'px', width: rect.width + 'px' }).show();
});
jQ(document).on('click', '#oss-ac-drop .fsig-ac-item', function () {
    jQ('#oss-input').val(jQ(this).attr('data-name'));
    jQ('#oss-ac-drop').empty().hide();
    _ossRunSearch();
});
jQ(document).on('click', function (e) {
    if (!jQ(e.target).closest('#oss-ac-drop, #oss-input').length) jQ('#oss-ac-drop').empty().hide();
});
jQ(document).on('click', '#oss-search-btn', _ossRunSearch);
jQ(document).on('change', '#oss-lots', function () { _ossRunSearchKeep(); });
jQ(document).on('keydown', '#oss-input, #oss-ltp-override, #oss-offset, #oss-wing, #oss-lots', function (e) { if (e.key === 'Enter') _ossRunSearch(); });
jQ(document).on('change', '#oss-strategy', function () {
    _ossRunSearch();
});
// ── Add the shown legs to a Kite basket named after the instrument ──────────────────────
// Reuses positionalScreener.js's basket helpers (_psBasketFetch = native fetch + cookies + CSRF;
// see the note there on why jQ.ajax must not be used). Any existing basket with the exact same
// name is deleted first (DELETE /api/baskets/:id — the delete endpoint is assumed from Kite's
// REST pattern, not captured from a real request), then a fresh one is created. One lot per leg,
// MARKET orders, BUY legs first so the hedges are in before the shorts.
// Default Lots box value per instrument, applied when you search a different name (you can still type any number).
var _OSS_DEFAULT_LOTS = { 'NIFTY 50': 5, 'NIFTY BANK': 5, 'SENSEX': 5 };
var _OSS_LAST = null;
var _OSS_LAST_NAME = '';
var _OSS_LOADED = {}; // names whose Detail-View data was preloaded this session
jQ(document).on('click', '#oss-basket', function () {
    var last = _OSS_LAST, $b = jQ(this);
    if (!last || !last.legs.length) return;
    var product = jQ('#oss-product').val() === 'NRML' ? 'NRML' : 'MIS', lots = _ossLots();
    var legs = last.legs.filter(function (l) { return l.entry; });
    if (!legs.length) { callSackBar('No contracts to add'); return; }
    if (legs.some(function (l) { return !l.side; }) && !confirm('The reference view has no BUY/SELL sides. Add all four as BUY?')) return;
    $b.prop('disabled', true);
    var exch = last.mcx ? 'MCX' : (last.name === 'SENSEX' || last.name === 'BANKEX') ? 'BFO' : 'NFO';
    legs.sort(function (a, b) { return (a.side === 'BUY' ? 0 : 1) - (b.side === 'BUY' ? 0 : 1); });
    _psFetchBaskets().then(function (baskets) {
        var same = baskets.filter(function (x) { return x.name === last.name; });
        return same.reduce(function (p, x) { return p.then(function () { return _psBasketFetch(BASE_URL + '/api/baskets/' + x.id, 'DELETE'); }); }, Promise.resolve())
            .then(function () { return _psCreateBasket(last.name); });
    }).then(function (basket) {
        return legs.reduce(function (p, l) {
            return p.then(function () {
                var params = { transaction_type: l.side || 'BUY', product: product, order_type: 'MARKET', validity: 'DAY',
                    validity_ttl: 1, variety: 'regular', quantity: (parseInt(l.entry.lot_size, 10) || 1) * lots, price: 0,
                    trigger_price: 0, disclosed_quantity: 0, tags: [] };
                return _psBasketFetch(BASE_URL + '/api/baskets/' + basket.id + '/items', 'POST',
                    { tradingsymbol: l.entry.tradingsymbol, exchange: exch, weight: 0, params: JSON.stringify(params) });
            });
        }, Promise.resolve());
    }).then(function () {
        callSackBarInfo('Basket "' + last.name + '" created with ' + legs.length + ' leg(s) (' + product + ', ' + lots + ' lot' + (lots > 1 ? 's' : '') + ' each)');
    }).catch(function (err) {
        callSackBar('Basket failed: ' + (err && err.message ? err.message : err));
    }).then(function () { $b.prop('disabled', false); });
});
jQ(document).on('click', '.oss-detail-link', function (e) {
    e.preventDefault();
    var n = jQ(this).attr('data-name');
    if (typeof _gtbOpenInstrDetailFor === 'function') _gtbOpenInstrDetailFor(n, false);
});
jQ(document).on('click', '.oss-pick', function () {
    jQ('#oss-input').val(jQ(this).attr('data-oss-pick'));
    jQ('#oss-strategy').val('suggested');
    _OSS_LAST_NAME = '';
    _ossRunSearch();
});
jQ(document).on('click', '#oss-copy', function () {
    var t = jQ(this).attr('data-text') || '';
    try { navigator.clipboard.writeText(t).then(function () { if (typeof callSackBarInfo === 'function') callSackBarInfo('Legs copied'); }); } catch (e) {}
});

// ── Premiums + max profit / max loss ────────────────────────────────────────────────────
// Each leg's price = close of its last 5-min candle up to the snapshot end time (same historical API and
// trim as the rest of the app, so it follows the snapshot picker; live otherwise). A leg that has not
// traded yet today shows "—" and the risk box stays pending. Payoff is at EXPIRY, per lot, ignoring
// brokerage/taxes/slippage and any margin needed for sold legs.
var _OSS_RENDER_ID = 0;
var _OSS_PRICE_CACHE = {}; // token -> {t, v}; 20 s, so changing Lots does not refetch
function _ossLots() { var n = parseInt(jQ('#oss-lots').val(), 10); return (isFinite(n) && n > 0) ? Math.min(n, 1000) : 1; }
// Price = close of the leg's last 5-min candle up to the snapshot end. A far-OTM strike may not have traded
// yet today, so the range starts 6 days back and an older candle is used as a fallback; those prices are
// flagged stale (_OSS_PRICE_META) and shown with an asterisk.
var _OSS_PRICE_META = {}; // token -> { stale: bool, date: 'YYYY-MM-DD' }
function _ossLegPrice(token, isMcx) {
    var hit = _OSS_PRICE_CACHE[token];
    if (hit && Date.now() - hit.t < 20000) return Promise.resolve(hit.v);
    var day = isMcx ? _gtbMcxCurrDay() : CURRENT_DAY;
    var from = moment(day).subtract(6, 'days').format('YYYY-MM-DD');
    return Promise.resolve().then(function () {
        return getHistoricalDataUsingPromise(token, from, isMcx ? _gtbMcxCurrDayTo() : _gtbCurrDayTo(), '5minute');
    }).then(function (res) {
        var c = (res && res.data && res.data.candles) || [];
        c = _gtbTrimCandlesTail(c, day);   // trims only candles on the snapshot day; earlier days stay
        var last = c.length ? c[c.length - 1] : null;
        var v = last ? parseFloat(last[4]) : null;
        var d = last ? moment(last[0]).format('YYYY-MM-DD') : null;
        _OSS_PRICE_META[token] = { stale: !!(last && d !== day), date: d };
        _OSS_PRICE_CACHE[token] = { t: Date.now(), v: v };
        return v;
    }).catch(function () { return null; });
}
function _ossAnalyse(legs) {
    // legs: [{side, type, k, prem}] ; per-share expiry P&L
    var pay = function (S) {
        return legs.reduce(function (t, l) {
            var iv = l.type === 'CE' ? Math.max(S - l.k, 0) : Math.max(l.k - S, 0);
            return t + (l.side === 'BUY' ? 1 : -1) * (iv - l.prem);
        }, 0);
    };
    var ks = legs.map(function (l) { return l.k; }).sort(function (a, b) { return a - b; });
    var pts = [0].concat(ks.filter(function (k, i) { return k > 0 && ks.indexOf(k) === i; }));
    var vals = pts.map(pay);
    var slopeUp = legs.reduce(function (t, l) { return t + (l.type === 'CE' ? (l.side === 'BUY' ? 1 : -1) : 0); }, 0);
    var maxP = slopeUp > 0 ? Infinity : Math.max.apply(null, vals);
    var maxL = slopeUp < 0 ? -Infinity : Math.min.apply(null, vals);
    var be = [];
    for (var i = 0; i < pts.length - 1; i++) {
        var a = vals[i], b = vals[i + 1];
        if ((a < 0 && b > 0) || (a > 0 && b < 0)) be.push(pts[i] + (0 - a) * (pts[i + 1] - pts[i]) / (b - a));
        else if (a === 0 && i > 0) be.push(pts[i]);
    }
    var last = vals[vals.length - 1];
    if (slopeUp !== 0 && last * slopeUp < 0) be.push(pts[pts.length - 1] + (-last / slopeUp));
    var net = legs.reduce(function (t, l) { return t + (l.side === 'BUY' ? -1 : 1) * l.prem; }, 0); // + credit / - debit
    return { maxProfit: maxP, maxLoss: maxL, breakevens: be, net: net };
}
// ── Market-implied chance of profit at expiry ───────────────────────────────────────────
// Black-Scholes: invert each OTM leg's price to an implied volatility (median), then the chance that the
// underlying finishes where the strategy is profitable, with S lognormal (risk-neutral drift). It is what
// option prices imply, not a forecast of this stock; ignores skew, early exit, brokerage and slippage.
function _ossNormCdf(x) {
    var t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
    var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
}
function _ossBsPrice(type, S, K, T, r, v) {
    var sq = v * Math.sqrt(T), d1 = (Math.log(S / K) + (r + v * v / 2) * T) / sq, d2 = d1 - sq, df = Math.exp(-r * T);
    return type === 'CE' ? S * _ossNormCdf(d1) - K * df * _ossNormCdf(d2) : K * df * _ossNormCdf(-d2) - S * _ossNormCdf(-d1);
}
function _ossImpliedVol(type, S, K, T, r, price) {
    var lo = 0.01, hi = 3;
    if (!(price > 0.05) || _ossBsPrice(type, S, K, T, r, lo) > price || _ossBsPrice(type, S, K, T, r, hi) < price) return null;
    for (var i = 0; i < 60; i++) { var m = (lo + hi) / 2; if (_ossBsPrice(type, S, K, T, r, m) < price) lo = m; else hi = m; }
    return (lo + hi) / 2;
}
// legs: [{side,type,k,prem}] ; returns {pop, iv} or null
function _ossChanceOfProfit(legs, S, dteDays) {
    var T = Math.max(dteDays, 0.5) / 365, r = 0.065;
    var otm = legs.filter(function (l) { return l.type === 'CE' ? l.k >= S : l.k <= S; });
    var ivs = (otm.length ? otm : legs).map(function (l) { return _ossImpliedVol(l.type, S, l.k, T, r, l.prem); })
        .filter(function (x) { return x; }).sort(function (a, b) { return a - b; });
    if (!ivs.length) return null;
    var iv = ivs[Math.floor(ivs.length / 2)], sq = iv * Math.sqrt(T), mu = Math.log(S) + (r - iv * iv / 2) * T;
    var pay = function (X) {
        return legs.reduce(function (t, l) {
            var q = l.type === 'CE' ? Math.max(X - l.k, 0) : Math.max(l.k - X, 0);
            return t + (l.side === 'BUY' ? 1 : -1) * (q - l.prem);
        }, 0);
    };
    var N = 3000, lo = S * 0.2, hi = S * 3, cdf = function (X) { return _ossNormCdf((Math.log(X) - mu) / sq); };
    var pop = 0, prev = cdf(lo);
    for (var i = 1; i <= N; i++) {
        var a = lo + (hi - lo) * (i - 1) / N, b = lo + (hi - lo) * i / N, cur = cdf(b);
        if (pay((a + b) / 2) > 0) pop += cur - prev;
        prev = cur;
    }
    return { pop: pop, iv: iv };
}

function _ossFillPremiums(renderId, name, rows, ltp, dte) {
    var lot = 1;
    var items = rows.filter(function (r) { return r.entry; });
    if (!items.length) return;
    lot = (parseInt(items[0].entry.lot_size, 10) || 1) * _ossLots();
    Promise.all(items.map(function (r) { return _ossLegPrice(r.entry.instrument_token, _ossIsMcx(name)); })).then(function (prices) {
        if (renderId !== _OSS_RENDER_ID) return; // a newer search replaced this one
        items.forEach(function (r, i) {
            r.prem = prices[i];
            var meta = _OSS_PRICE_META[r.entry.instrument_token] || {};
            r.stale = !!meta.stale;
            jQ('#oss-prem-' + r.entry.instrument_token).html(prices[i] == null ? '—'
                : prices[i].toFixed(2) + (meta.stale ? '<span class="oss-stale" title="No trade today yet; last traded price from ' + meta.date + '">*</span>' : ''));
        });
        var $box = jQ('#oss-risk');
        if (!$box.length) return;
        var sided = items.filter(function (r) { return r.leg.side; });
        if (!sided.length || sided.length !== items.length) { $box.html(''); return; }
        if (items.some(function (r) { return r.prem == null; })) {
            $box.html('<div class="oss-desc">Max profit / max loss: waiting — one or more legs have no price yet' + (_ossAsOf().on ? ' at this snapshot time' : '') + '.</div>');
            return;
        }
        var an = _ossAnalyse(items.map(function (r) { return { side: r.leg.side, type: r.leg.type, k: r.listed, prem: r.prem }; }));
        var legsForCop = items.map(function (r) { return { side: r.leg.side, type: r.leg.type, k: r.listed, prem: r.prem }; });
        var cop = null; try { cop = _ossChanceOfProfit(legsForCop, ltp, dte); } catch (e) {}
        var money = function (x) { return (x < 0 ? '−' : '') + '₹' + Math.abs(Math.round(x * lot)).toLocaleString('en-IN'); };
        var inf = function (x) { return !isFinite(x) ? (x > 0 ? 'Unlimited' : 'UNLIMITED LOSS') : money(x); };
        var cap = (typeof MARGIN !== 'undefined' ? parseFloat(MARGIN) : NaN) || 0;
        var lossAbs = isFinite(an.maxLoss) ? Math.abs(an.maxLoss) * lot : Infinity;
        var capTxt = '';
        if (cap && isFinite(lossAbs)) {
            var pct = lossAbs / cap * 100;
            capTxt = ' <span style="color:' + (pct > 2 ? 'var(--gtb-amber)' : 'var(--gtb-muted)') + ';">= ' + pct.toFixed(1) + '% of your ₹' + Math.round(cap).toLocaleString('en-IN') + ' capital' + (pct > 2 ? ' — above 2%, consider a smaller size or a narrower spread' : '') + '</span>';
        }
        // Lots allowed by YOUR own risk limit (Settings: Account Capital x Risk % per trade): floor(budget / max loss of one lot).
        // Only possible for a hedged (defined-risk) strategy; sold legs also need margin, which is not checked here.
        var rpct = (typeof RISK_PCT_PER_TRADE !== 'undefined' && RISK_PCT_PER_TRADE) ? RISK_PCT_PER_TRADE : 1;
        var lotsHtml = '';
        if (cap) {
            var budget = cap * rpct / 100, perLot = isFinite(an.maxLoss) ? Math.abs(an.maxLoss) * (lot / _ossLots()) : Infinity;
            if (!isFinite(perLot)) lotsHtml = '<span class="oss-na">Lots by risk limit: not possible, this position has unlimited loss (add a hedge).</span>';
            else {
                var maxLots = Math.floor(budget / perLot);
                lotsHtml = '<span title="Account Capital x Risk % per trade (Settings) divided by the max loss of ONE lot. Sold legs also need margin, which is not checked here."><b>Lots at your risk limit</b> ' + rpct + '% of ₹' + Math.round(cap).toLocaleString('en-IN') + ' = ₹' + Math.round(budget).toLocaleString('en-IN')
                    + ' → <b style="color:' + (maxLots >= 1 ? 'var(--gtb-green)' : 'var(--gtb-red)') + ';">' + maxLots + ' lot' + (maxLots === 1 ? '' : 's') + '</b> <span class="oss-na">(one lot can lose ₹' + Math.round(perLot).toLocaleString('en-IN') + (maxLots < 1 ? ' — more than your limit; a narrower wing or a smaller instrument would be needed' : '') + ')</span></span>';
            }
        }
        $box.html('<div class="oss-riskbox">'
            + '<span><b>' + (an.net >= 0 ? 'Net credit' : 'Net debit') + '</b> ' + money(Math.abs(an.net)) + ' <span class="oss-na">(' + _ossLots() + ' lot' + (_ossLots() > 1 ? 's' : '') + ' = ' + lot + ' qty)</span></span>'
            + '<span><b style="color:var(--gtb-green);">Max profit</b> ' + inf(an.maxProfit) + '</span>'
            + '<span><b style="color:var(--gtb-red);">Max loss</b> ' + inf(an.maxLoss) + capTxt + '</span>'
            + (lotsHtml ? lotsHtml : '')
            + '<span><b>Breakeven</b> ' + (an.breakevens.length ? an.breakevens.map(function (b) { return b.toFixed(1); }).join(' / ') : '—') + '</span>'
            + (cop ? '<span title="Black-Scholes, lognormal, implied vol from the option prices of these legs. Market-implied, not a forecast; ignores early exit, brokerage and slippage."><b>Chance of profit at expiry</b> ≈ ' + Math.round(cop.pop * 100) + '% <span class="oss-na">(implied vol ' + (cop.iv * 100).toFixed(0) + '%)</span></span>' : '')
            + '</div>'
            + '<div class="oss-desc">' + (items.some(function (r) { return r.stale; }) ? '<span style="color:var(--gtb-amber);">* = no trade today yet, last traded price from an earlier day — the real price now may differ a lot, check it.</span> ' : '') + 'At expiry, per lot, before brokerage/taxes/slippage. Sold legs also need margin (not calculated here). Premiums are the last traded price' + (_ossAsOf().on ? ' at the snapshot time' : '') + ' — a wide bid/ask on illiquid strikes can make the real fill worse.</div>');
    });
}

function _ossRunSearch() {
    var name = jQ('#oss-input').val().trim().toUpperCase();
    var $result = jQ('#oss-result');
    if (!name) return;
    jQ('.oss-pick').removeClass('oss-pick-on').filter(function () { return jQ(this).attr('data-oss-pick') === name; }).addClass('oss-pick-on');
    // A different instrument than last time: decide the strategy afresh instead of keeping the old manual pick.
    if (name !== _OSS_LAST_NAME) { _OSS_LAST_NAME = name; jQ('#oss-strategy').val('suggested'); jQ('#oss-lots').val(_OSS_DEFAULT_LOTS[name] || 1); }
    // ★ Suggested for a name the Detail View hasn't loaded yet: run the same data calls the
    // Detail View makes (OI/OBV + futures), once, then search again with the real prediction.
    if (jQ('#oss-strategy').val() === 'suggested' && _ossIsMcx(name) && !_OSS_LOADED[name]
        && typeof showFutureDetailsMCX === 'function' && typeof showPrictionProbabiltyMCX === 'function') {
        _OSS_LOADED[name] = true;
        $result.html('<div class="sv-empty-state"><i class="bi bi-hourglass-split"></i><span>Loading ' + name + ' data (same as the Commodities popup) to pick a strategy…</span></div>');
        Promise.resolve().then(function () { return showFutureDetailsMCX(name); }).then(function (res) {
            if (!res) return;
            if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
            INSTRUMENT_SCORE_MAP[name].futures_trend = getFuturesTrendScore(res['REMARK']);
            INSTRUMENT_SCORE_MAP[name].futures_trend_remark = res['REMARK'];
            return showPrictionProbabiltyMCX(name, res);
        }).catch(function (e) { console.log('OSS MCX preload', name, e); }).then(_ossRunSearch);
        return;
    }
    if (jQ('#oss-strategy').val() === 'suggested' && !_ossIsMcx(name) && name !== 'NIFTY 50' && name !== 'NIFTY BANK' && !_OSS_LOADED[name]
        && typeof showPrictionProbabilty === 'function' && typeof showFutureDetails === 'function') {
        _OSS_LOADED[name] = true;
        $result.html('<div class="sv-empty-state"><i class="bi bi-hourglass-split"></i><span>Loading ' + name + ' data (same as the Detail View) to pick a strategy…</span></div>');
        Promise.all([
            Promise.resolve().then(function () { return showPrictionProbabilty(name); }),
            Promise.resolve().then(function () { return showFutureDetails(name); }),
        ]).then(function (r) {
            var f = r[1];
            if (f) {
                if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
                INSTRUMENT_SCORE_MAP[name].futures_trend = getFuturesTrendScore(f['REMARK']);
                INSTRUMENT_SCORE_MAP[name].futures_trend_remark = f['REMARK'];
                INSTRUMENT_SCORE_MAP[name].avwap = f['vwapPrice'] || 0;
            }
        }).catch(function (e) { console.log('OSS preload', name, e); }).then(_ossRunSearch);
        return;
    }
    if (typeof OPTION_STRIKE_LIST === 'undefined') {
        $result.html('<div class="oss-error">OPTION_STRIKE_LIST not loaded yet — reload the Kite page.</div>');
        return;
    }

    var optName = _OSS_DISPLAY_TO_OPT[name] || name;
    // Every name lists contracts across multiple expiries in OPTION_STRIKE_LIST — same
    // resolution oiAnalyzer.js's showTrendingOI uses (_dlResolveExpiryFor/
    // _dlConfiguredExpiryForName, dataLoad.js): NIFTY/SENSEX/BANKNIFTY each have their own
    // Settings field, every other F&O stock shares fo_stocks_expiry_date, falling back to
    // that name's own nearest live expiry when blank/stale — instead of picking up
    // whichever expiry happens to appear first (mixing strikes/tokens across expiries).
    var _mcx = _ossIsMcx(name);
    var allNameMatches = (_mcx ? MCX_OPTION_LIST : OPTION_STRIKE_LIST).filter(function (r) { return r.name === optName; });
    var availExpiries = Array.from(new Set(allNameMatches.map(function (r) { return moment(r.expiry, 'DD-MM-YYYY').format('YYYY-MM-DD'); }))).sort();
    var targetExpiry = _dlResolveExpiryFor(_dlConfiguredExpiryForName(optName, _mcx ? 'opt' : undefined), availExpiries);
    var matches = allNameMatches.filter(function (r) { return moment(r.expiry, 'DD-MM-YYYY').format('YYYY-MM-DD') === targetExpiry; });
    if (!matches.length) {
        var expiryHint = availExpiries.length ? ' Resolved expiry is ' + targetExpiry + ' — check that matches a real listed ' + optName + ' expiry.' : '';
        $result.html('<div class="oss-error">No F&amp;O contracts found for "' + name + '".' + expiryHint + ' It may not have listed options, or the name doesn\'t match exactly — pick it from the autocomplete dropdown instead of typing free text.</div>');
        return;
    }

    var strikes = matches.map(function (r) { return parseFloat(r.strike); })
        .filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });

    var override = parseFloat(jQ('#oss-ltp-override').val());
    var ltp = !isNaN(override) && override > 0 ? override : _ossLtpFor(name);
    if (!ltp || isNaN(ltp)) {
        $result.html('<div class="oss-error">No cached LTP for "' + name + '" yet (Load Prices / refresh hasn\'t run for it). Enter an LTP override above and search again.</div>');
        return;
    }

    // ── Strategy + distances ────────────────────────────────────────────────────────
    var chosen = jQ('#oss-strategy').val() || 'reference';
    var sugg = _ossSuggestedKey(name), suggestedNote = '';
    var key = chosen, noTrade = false;
    if (chosen === 'suggested') {
        if (sugg && sugg.key) { key = sugg.key; suggestedNote = sugg.why; }
        else { key = 'reference'; noTrade = true; suggestedNote = (sugg && sugg.why) || 'No suggestion available (no score data yet).'; }
    }
    // A suggested RANGE strategy is dropped when the market is trending or most signals disagree with it.
    if (chosen === 'suggested' && key !== 'reference' && /Range-bound/.test(_ossStrategyByKey(key).view)) {
        var gMs = null; try { gMs = _mcx ? null : _gtbHeadlineMarketSignal().ms; } catch (e) {}
        _ossAgreement(name, 'Range-bound');
        var ag = _OSS_AGREE_LAST;
        var trending = gMs && gMs.signal && /BUY|SELL/.test(gMs.signal);
        if (trending || (ag && ag.pct < 45)) {
            var gWhy = (trending ? 'the dashboard market verdict is ' + gMs.signal + ' (a trending market works against a range strategy)' : '')
                + (trending && ag && ag.pct < 45 ? ' and ' : '')
                + (ag && ag.pct < 45 ? 'only ' + ag.agree + '/' + ag.total + ' signals (' + ag.pct + '%) support a range view' : '');
            suggestedNote = (suggestedNote ? suggestedNote + ' ' : '') + 'But ' + gWhy + ' — no strategy suggested. Pick one manually if you disagree.';
            key = 'reference'; noTrade = true;
        }
    }
    var stickyNote = '';
    if (chosen === 'suggested') {
        var fin = _ossStabilise(name, noTrade ? null : key, suggestedNote);
        if (fin.held) { noTrade = !fin.key; key = fin.key || 'reference'; suggestedNote = fin.why; }
        stickyNote = fin.note || '';
    }
    var strat = _ossStrategyByKey(key);

    var atm = _ossNearestStrike(strikes, ltp);
    var step = _ossStrikeStep(strikes, atm);
    var hedge = _mcx ? step * 4 : _ossHedgeDiff(name);
    var dte = Math.max(1, moment(targetExpiry).diff(moment(_mcx && typeof MCX_CURRENT_DAY !== 'undefined' && MCX_CURRENT_DAY ? MCX_CURRENT_DAY : ((typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? CURRENT_DAY : undefined)).startOf('day'), 'days'));
    var em = _ossExpectedMove(name, ltp, dte);
    var roundStep = function (x) { return Math.max(step, Math.round(x / step) * step); };
    var offAuto = em ? roundStep(em.em) : step * 3;
    var offTyped = parseFloat(jQ('#oss-offset').val()), wingTyped = parseFloat(jQ('#oss-wing').val());
    var c = { atm: atm, step: step, hedge: hedge, offAuto: offAuto };
    c.off = (!isNaN(offTyped) && offTyped > 0) ? roundStep(offTyped) : offAuto;
    c.wing = (!isNaN(wingTyped) && wingTyped > 0) ? roundStep(wingTyped) : roundStep(strat.defWing ? strat.defWing(c) : hedge);

    // ── Resolve each leg to a listed contract ────────────────────────────────────────
    function _find(strike, type) {
        return matches.find(function (r) { return parseFloat(r.strike) === strike && r.instrument_type === type; });
    }
    var rows = strat.legs(c).map(function (leg) {
        var listed = _ossNearestStrike(strikes, leg.k);
        return { leg: leg, listed: listed, entry: _find(listed, leg.type), note: (listed !== leg.k ? 'target ' + leg.k + ' → nearest listed ' + listed : '') };
    });

    function _rowHtml(r) {
        var type = r.leg.type, badgeColor = type === 'CE' ? 'var(--gtb-green)' : 'var(--gtb-red)';
        var sideCol = r.leg.side === 'BUY' ? 'var(--gtb-green)' : 'var(--gtb-red)';
        var sideCell = r.leg.side ? '<span class="oss-side" style="color:' + sideCol + ';border-color:' + sideCol + ';">' + r.leg.side + '</span>' : '<span class="oss-na">—</span>';
        var labelCell = r.leg.label + (r.note ? '<div class="oss-target-note">' + r.note + '</div>' : '');
        if (!r.entry) {
            return '<tr><td>' + sideCell + '</td><td>' + labelCell + '</td><td>' + r.listed + '</td><td colspan="3" class="oss-na">no ' + type + ' contract at this strike</td></tr>';
        }
        var e = r.entry;
        var kiteLink = 'https://kite.zerodha.com/markets/ext/chart/web/tvc/' + (_mcx ? 'MCX' : 'NFO') + '/' + e.tradingsymbol + '/' + e.instrument_token;
        return '<tr>'
            + '<td>' + sideCell + '</td>'
            + '<td>' + labelCell + '</td>'
            + '<td class="oss-strike"><span class="oss-type-badge" style="color:' + badgeColor + ';border-color:' + badgeColor + ';">' + type + '</span> ' + r.listed + '</td>'
            + '<td class="oss-symbol">' + e.tradingsymbol + '</td>'
            + '<td class="oss-token">' + e.instrument_token + '</td>'
            + '<td class="oss-prem" id="oss-prem-' + e.instrument_token + '"><span class="oss-na">…</span></td>'
            + '<td><a href="' + kiteLink + '" target="_blank" rel="noopener" class="oss-chart-link" title="Open chart"><i class="bi bi-graph-up"></i></a></td>'
            + '</tr>';
    }

    _OSS_LAST = { name: name, mcx: _mcx, legs: rows.map(function (r) { return { side: r.leg.side, entry: r.entry }; }) };
    var copyText = rows.map(function (r) { return (r.leg.side ? r.leg.side + ' ' : '') + (r.entry ? r.entry.tradingsymbol : (r.listed + r.leg.type + ' (no contract)')); }).join('\n');
    var expiry = matches[0] && matches[0].expiry;
    var usedBits = [];
    if (strat.usesOff) usedBits.push('offset ±' + c.off + ' pts' + ((!isNaN(offTyped) && offTyped > 0) ? '' : (em ? ' (≈1 expected move)' : ' (3 strikes)')));
    if (strat.usesWing) usedBits.push('wing ' + c.wing + ' pts' + ((!isNaN(wingTyped) && wingTyped > 0) ? '' : ' (auto)'));

    var html = '<div class="oss-summary">'
        + '<span class="oss-summary-name">' + name + '</span>'
        + (function () {
            var chart = '';
            try { if (_mcx && typeof _cmdChartLink === 'function') chart = _cmdChartLink(name);
            else if (typeof INSTRUMENT_TOKENS !== 'undefined' && INSTRUMENT_TOKENS[name]) chart = _gtbDashPAChartLink({ name: name, mcx: false }); } catch (e) {}
            return (chart ? '<a href="' + chart + '" target="_blank" rel="noopener" class="oss-chart-link" title="Open ' + name + ' chart on Kite"><i class="bi bi-graph-up"></i> Chart</a>' : '')
                + ' <a href="#" class="oss-chart-link oss-detail-link" data-name="' + name + '" title="Open the Instrument Detail View for ' + name + '"><i class="bi bi-layout-text-sidebar-reverse"></i> Detail view</a>';
        })()
        + '<span class="oss-summary-ltp">LTP ' + ltp.toFixed(2) + (isNaN(override) ? '' : ' <span class="oss-override-tag">override</span>') + '</span>'
        + '<span class="oss-summary-expiry">ATM ' + atm + '</span>'
        + (function () { var a = _ossAsOf(); return '<span class="oss-summary-expiry" style="' + (a.on ? 'color:var(--gtb-amber);border-color:var(--gtb-amber);' : '') + '" title="' + (a.on ? 'LTP and VIX are the cached values from the last refresh — refresh after changing the snapshot time' : 'Live data') + '">' + a.txt + '</span>'; })()
        + '<span class="oss-summary-expiry">Expiry ' + (expiry || '—') + ' (' + dte + 'd)</span>'
        + (em ? '<span class="oss-summary-hedge" title="LTP × ' + em.label + ' ' + em.vix.toFixed(1) + '% × √(' + dte + '/365): a rough 1-sigma move to expiry from implied volatility, not a forecast">Expected move ±' + Math.round(em.em) + ' pts</span>' : '')
        + '</div>'
        + '<div class="oss-strat">'
        +   '<div><b>' + strat.label + '</b> <span class="oss-view">' + strat.view + '</span>' + (usedBits.length ? ' <span class="oss-used">' + usedBits.join(' · ') + '</span>' : '') + '</div>'
        +   ((_mcx || /^Market verdict/.test(suggestedNote)) ? '' : _ossMarketFlag(strat.view))
        +   _ossPositionalFlag(name, strat.view)
        +   _ossAgreement(name, strat.view)
        +   _ossTiming(name, strat, dte)
        +   (suggestedNote ? '<div class="oss-suggest">' + suggestedNote + '</div>' : '')
        +   (stickyNote ? '<div class="oss-suggest">' + stickyNote + '</div>' : '')
        +   '<div class="oss-desc">' + strat.desc + '</div>'
        +   '<div class="oss-desc"><b>Risk:</b> ' + strat.risk + ' <span class="oss-na">Premiums are not shown — check the legs\' live prices before placing.</span></div>'
        + '</div>'
        + '<table class="oss-table">'
        +   '<thead><tr><th>Action</th><th>Leg</th><th>Strike</th><th>Trading symbol</th><th>Token</th><th>Price (₹)</th><th></th></tr></thead>'
        +   '<tbody>' + rows.map(_rowHtml).join('') + '</tbody>'
        + '</table>'
        + '<div id="oss-risk" style="padding:6px 4px;"></div>'
        + '<div style="padding:8px 4px;"><button id="oss-copy" class="sv-pill-btn" type="button" data-text="' + copyText.replace(/"/g, '&quot;') + '"><i class="bi bi-clipboard"></i> Copy legs</button> '
        + '<button id="oss-basket" class="sv-pill-btn" type="button" title="Create a Kite basket named ' + name + ' (replaces one with the same name) with these legs, the Lots quantity each, MARKET"><i class="bi bi-basket"></i> Add to basket</button> '
        + '<select id="oss-product" class="oss-select" title="Product for the basket orders"><option value="MIS">MIS</option><option value="NRML">NRML</option></select></div>';
    if (noTrade) {
        _OSS_LAST = null;
        var head = html.slice(0, html.indexOf('<div class="oss-strat">'));
        html = head + '<div class="oss-strat"><div><b>No strategy suggested</b></div>'
            + '<div class="oss-suggest">' + suggestedNote + '</div>'
            + (/^Market verdict/.test(suggestedNote) ? '' : _ossMarketFlag(''))
            + _ossPositionalFlag(name, '')
            + '<div class="oss-desc">Pick a strategy from the dropdown if you want strikes anyway.</div></div>';
    }
    var _rid = ++_OSS_RENDER_ID;
    $result.html(html);
    if (!noTrade) _ossFillPremiums(_rid, name, rows, ltp, dte);
    if (!_OSS_NO_SCAN) _ossAutoPositionalScan(name);
}

// Runs the Positional Screener for just this instrument when it has no cached result, then
// redraws. One attempt per search; skipped while another positional scan is already running.
function _ossAutoPositionalScan(name) {
    var key = String(name).toUpperCase();
    try {
        if ((typeof _PS_CACHE !== 'undefined') && (_PS_CACHE[key] || _PS_CACHE[name])) { delete _OSS_PSCAN[key]; return; }
        if (typeof _psRunScan !== 'function' || typeof _psPriceTokenFor !== 'function' || !_psPriceTokenFor(key)) return;
        if (_OSS_PSCAN[key] === 'busy') return;
        if (_PS_SCANNING || _PS_AUTO_SCAN_RUNNING) { _OSS_PSCAN[key] = 'failed'; return; }
        _OSS_PSCAN[key] = 'busy';
        _ossRunSearchKeep();
        Promise.resolve().then(function () { return _psRunScan([key], {}); })
            .catch(function (e) { console.log('[option-strike-search] positional scan failed', e); })
            .then(function () {
                var ok = (typeof _PS_CACHE !== 'undefined') && (_PS_CACHE[key] || _PS_CACHE[name]);
                if (ok) delete _OSS_PSCAN[key]; else _OSS_PSCAN[key] = 'failed';
                if (jQ('#oss-input').val().trim().toUpperCase() === key) _ossRunSearchKeep();
            });
    } catch (e) { console.log('[option-strike-search] auto scan', e); }
}
// Redraw for the current input without the "different instrument -> reset strategy" and
// auto-scan side effects of a fresh search.
function _ossRunSearchKeep() {
    var n = jQ('#oss-input').val().trim().toUpperCase();
    _OSS_NO_SCAN = true;
    try { _ossRunSearch(); } finally { _OSS_NO_SCAN = false; }
}
var _OSS_NO_SCAN = false;

// Embeds the search in a container (the Trade tab). Rebuilt only if it is not already there, so a
// selected instrument and strategy survive tab switches. Any popup copy is closed first (shared ids).
function _ossMount(sel, prefillName) {
    var $c = jQ(sel);
    if (!$c.length) return;
    if (!$c.find('.oss-wrap').length) {
        jQ('.popup-custom-style-option-strike-search').remove();
        jQ('#pop-up-window-option-strike-search').remove();
        _OSS_LAST_NAME = '';
        $c.html(_ossWrapHtml());
    }
    if (prefillName) {
        jQ('#oss-input').val(String(prefillName).toUpperCase());
        jQ('#oss-strategy').val('suggested');
        _ossRunSearch();
    }
}
