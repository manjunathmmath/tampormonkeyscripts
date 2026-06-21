/* ============================================================================
 * Triple Edge System (TES) — Live Option Chain / OI module (Module 6 / F6)
 * ----------------------------------------------------------------------------
 * Reuses Groot Bot's prebuilt NSE_OPTION_STRIKE_LIST (strike -> instrument_token
 * / tradingsymbol / expiry / lot_size) to resolve real option instruments, then
 * pulls daily OI candles via the rate-limited historical API to compute:
 *   - 4-box OI-price classification per CE/PE strike  (long/short buildup, etc.)
 *   - PCR (Put-Call OI ratio)
 *   - OI walls (max CE OI = resistance, max PE OI = support)
 *   - an underlying directional bias (net option writing)  -> confluence pillar
 *
 * Requires NSE_OPTION_STRIKE_LIST to be loaded (via @require optionStrike.js).
 * ==========================================================================*/
window.TES = window.TES || {};
(function () {
    // TES instrument name -> NSE_OPTION_STRIKE_LIST 'name' field
    var NAME_MAP = {
        'NIFTY 50': 'NIFTY', 'NIFTY BANK': 'BANKNIFTY', 'NIFTY FIN SERVICE': 'FINNIFTY',
        'NIFTY MID SELECT': 'MIDCPNIFTY'
        // stocks map 1:1 (RELIANCE, HDFCBANK, INFY, ...); SENSEX (BSE) not in this NSE list
    };
    function optName(name) { return NAME_MAP[name] || name; }

    function listLoaded() { return typeof NSE_OPTION_STRIKE_LIST !== 'undefined' && NSE_OPTION_STRIKE_LIST.length; }

    function parseExp(s) { var p = s.split('-'); return new Date(+p[2], +p[1] - 1, +p[0]); }

    // Resolve nearest-expiry option ladder around ATM. range = strikes each side.
    function resolveOptions(name, spot, range) {
        if (!listLoaded()) return null;
        var on = optName(name);
        var all = NSE_OPTION_STRIKE_LIST.filter(function (e) { return e.name === on; });
        if (!all.length) return null;
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var exps = {};
        all.forEach(function (e) { exps[e.expiry] = parseExp(e.expiry); });
        var nearest = null;
        Object.keys(exps).forEach(function (k) {
            if (exps[k] >= today && (!nearest || exps[k] < exps[nearest])) nearest = k;
        });
        if (!nearest) { // all past — take max available
            Object.keys(exps).forEach(function (k) { if (!nearest || exps[k] > exps[nearest]) nearest = k; });
        }
        var leg = all.filter(function (e) { return e.expiry === nearest; });
        var byStrike = {};
        leg.forEach(function (e) {
            var s = +e.strike; byStrike[s] = byStrike[s] || { strike: s };
            byStrike[s][e.instrument_type === 'PE' ? 'pe' : 'ce'] = { token: +e.instrument_token, sym: e.tradingsymbol };
            byStrike[s].lot = +e.lot_size;
        });
        var strikes = Object.keys(byStrike).map(Number).sort(function (a, b) { return a - b; });
        if (!strikes.length) return null;
        var atm = strikes.reduce(function (p, c) { return Math.abs(c - spot) < Math.abs(p - spot) ? c : p; });
        var idx = strikes.indexOf(atm);
        range = range || 3;
        var chosen = strikes.slice(Math.max(0, idx - range), idx + range + 1)
            .map(function (s) { return byStrike[s]; })
            .filter(function (x) { return x.ce && x.pe; });
        return { name: name, optName: on, expiry: nearest, atm: atm, lotSize: byStrike[atm] ? byStrike[atm].lot : 0, strikes: chosen };
    }
    TES.resolveOptions = resolveOptions;

    function classify(priceChg, oiChg) {
        if (oiChg > 0) return priceChg >= 0 ? 'LONG_BUILDUP' : 'SHORT_BUILDUP';
        if (oiChg < 0) return priceChg >= 0 ? 'SHORT_COVERING' : 'LONG_UNWINDING';
        return 'FLAT';
    }

    // Pull OI for each strike (one daily call per option token: today vs prev day).
    function fetchOIChain(name, spot, range) {
        var res = resolveOptions(name, spot, range);
        if (!res) return Promise.resolve(null);
        var jobs = [];
        res.strikes.forEach(function (s) {
            jobs.push(TES.api.history(s.ce.token, 'day', 5).then(function (c) { s._ce = c; }));
            jobs.push(TES.api.history(s.pe.token, 'day', 5).then(function (c) { s._pe = c; }));
        });
        return Promise.all(jobs).then(function () {
            var totCE = 0, totPE = 0, sumdCE = 0, sumdPE = 0, maxCE = null, maxPE = null;
            res.strikes.forEach(function (s) {
                function read(c) {
                    if (!c || c.length < 2) return { oi: 0, doi: 0, pchg: 0 };
                    var last = c[c.length - 1], prev = c[c.length - 2];
                    return { oi: last[6] || 0, doi: (last[6] || 0) - (prev[6] || 0), pchg: (last[4] || 0) - (prev[4] || 0) };
                }
                var ce = read(s._ce), pe = read(s._pe);
                s.ce.oi = ce.oi; s.ce.doi = ce.doi; s.ce.box = classify(ce.pchg, ce.doi);
                s.pe.oi = pe.oi; s.pe.doi = pe.doi; s.pe.box = classify(pe.pchg, pe.doi);
                totCE += ce.oi; totPE += pe.oi; sumdCE += ce.doi; sumdPE += pe.doi;
                if (!maxCE || ce.oi > maxCE.oi) maxCE = { strike: s.strike, oi: ce.oi };
                if (!maxPE || pe.oi > maxPE.oi) maxPE = { strike: s.strike, oi: pe.oi };
                delete s._ce; delete s._pe;
            });
            var pcr = totCE ? totPE / totCE : 0;
            // underlying bias: net writing (more PE OI added = bullish support; more CE OI added = bearish)
            var writeBias = (sumdPE - sumdCE) / (Math.abs(sumdPE) + Math.abs(sumdCE) + 1);
            var pcrBias = Math.max(-1, Math.min(1, pcr - 1));
            var biasScore = Math.max(-1, Math.min(1, 0.7 * writeBias + 0.3 * pcrBias));
            return {
                name: name, expiry: res.expiry, atm: res.atm, lotSize: res.lotSize, strikes: res.strikes,
                totalCE: totCE, totalPE: totPE, pcr: pcr, biasScore: biasScore,
                resistance: maxCE ? maxCE.strike : null, support: maxPE ? maxPE.strike : null
            };
        });
    }
    TES.fetchOIChain = fetchOIChain;
})();
