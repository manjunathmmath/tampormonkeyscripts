/* ============================================================================
 * Triple Edge System (TES) — F&O MASTERY module
 * ----------------------------------------------------------------------------
 * Implements the "F&O Mastery: 3-Month Accelerator" curriculum as computable
 * tools. Section headers map to the F&O modules:
 *
 *   F2  Futures: leverage / max-lot rule / usage playbook   -> futures.*
 *   F3  Margins, MTM, ban & true cost / daily loss cap      -> cost.* / mtm.*
 *   F4  Hedging & beta                                       -> hedge.beta
 *   F5  Options structure, moneyness, breakeven, no-hope     -> opt.moneyness / breakeven / noHope
 *   F6  Option chain / OI / 4-box / OI walls / PCR           -> (uses engine oiDashboard)
 *   F7  Greeks: Delta/Gamma/Theta/Vega/Rho (Black-Scholes)   -> bs.* / greeksLadder
 *   F8  Options strategies full playbook + selector matrix   -> strategySelector
 *   F9  Expiry day operating manual (time-slice rules)       -> expiryManual
 *   F10 Stock options & event trading filters                -> stockFilter
 *   F11 Execution engine / lot-scaling ladder                -> lotLadder
 *   F12 Backtesting / expectancy / quant metrics             -> expectancy
 * ==========================================================================*/
window.TES = window.TES || {};
(function () {

    /* ===== Black-Scholes Greeks (F7) ====================================== */
    function ncdf(x) { // standard normal CDF (Abramowitz-Stegun)
        var t = 1 / (1 + 0.2316419 * Math.abs(x));
        var d = 0.3989422804014327 * Math.exp(-x * x / 2);
        var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        return x > 0 ? 1 - p : p;
    }
    function npdf(x) { return 0.3989422804014327 * Math.exp(-x * x / 2); }

    // spot S, strike K, iv (decimal e.g. 0.14), T (years), r (decimal), type 'CE'|'PE'
    function bs(S, K, iv, T, r, type) {
        r = r || 0.065; T = Math.max(T, 1 / 365 / 6.5); iv = Math.max(iv, 0.001);
        var d1 = (Math.log(S / K) + (r + iv * iv / 2) * T) / (iv * Math.sqrt(T));
        var d2 = d1 - iv * Math.sqrt(T);
        var call = S * ncdf(d1) - K * Math.exp(-r * T) * ncdf(d2);
        var put = K * Math.exp(-r * T) * ncdf(-d2) - S * ncdf(-d1);
        var price = type === 'PE' ? put : call;
        var delta = type === 'PE' ? ncdf(d1) - 1 : ncdf(d1);
        var gamma = npdf(d1) / (S * iv * Math.sqrt(T));
        var vega = S * npdf(d1) * Math.sqrt(T) / 100;          // per 1% IV
        var thetaA = -(S * npdf(d1) * iv) / (2 * Math.sqrt(T));
        var thetaB = r * K * Math.exp(-r * T) * (type === 'PE' ? ncdf(-d2) : ncdf(d2));
        var theta = (thetaA + (type === 'PE' ? thetaB : -thetaB)) / 365; // per day
        var rho = (type === 'PE' ? -K * T * Math.exp(-r * T) * ncdf(-d2) : K * T * Math.exp(-r * T) * ncdf(d2)) / 100;
        return { price: price, delta: delta, gamma: gamma, vega: vega, theta: theta, rho: rho, d1: d1, d2: d2 };
    }
    TES.bs = bs;

    // Greeks ladder around ATM (F7). iv decimal, daysToExpiry int.
    function greeksLadder(spot, step, iv, daysToExpiry, range) {
        range = range || 3; var T = daysToExpiry / 365, atm = Math.round(spot / step) * step, rows = [];
        for (var k = -range; k <= range; k++) {
            var K = atm + k * step;
            rows.push({ strike: K, atm: k === 0, ce: bs(spot, K, iv, T, 0.065, 'CE'), pe: bs(spot, K, iv, T, 0.065, 'PE') });
        }
        return { atm: atm, T: T, rows: rows };
    }
    TES.greeksLadder = greeksLadder;

    /* ===== Options structure / moneyness / breakeven (F5) ================= */
    function moneyness(spot, strike, type) {
        var d = type === 'CE' ? spot - strike : strike - spot;
        return d > step0(spot) ? 'ITM' : d < -step0(spot) ? 'OTM' : 'ATM';
    }
    function step0(s) { return s * 0.002; }
    // breakeven for a BUYER. For seller it's the same level (profit below/above).
    function breakeven(strike, premium, type) { return type === 'CE' ? strike + premium : strike - premium; }
    // No-Hope filter (F5): reject buys with too little time / too far OTM / poor RR to expected move.
    function noHope(spot, strike, premium, type, daysToExpiry, ivPct) {
        var be = breakeven(strike, premium, type);
        var expMove = spot * (ivPct / 100) * Math.sqrt(daysToExpiry / 365); // 1-sigma move to expiry
        var needed = Math.abs(be - spot);
        var ratio = needed / (expMove || 1e-9);
        var verdict = ratio > 1.3 ? 'REJECT' : ratio > 0.9 ? 'MARGINAL' : 'OK';
        return { breakeven: be, expMove: expMove, neededMove: needed, sigmaRatio: ratio, verdict: verdict,
            note: 'Breakeven needs a ' + needed.toFixed(0) + 'pt move vs ~' + expMove.toFixed(0) + 'pt expected (1σ). ' +
                  (verdict === 'REJECT' ? 'Mathematically hopeless — skip.' : verdict === 'MARGINAL' ? 'Tight — need a strong catalyst.' : 'Move is realistic.') };
    }
    TES.opt = { moneyness: moneyness, breakeven: breakeven, noHope: noHope };

    /* ===== Strategy selector matrix (F8) ================================== */
    // view: 'BULL'|'BEAR'|'NEUTRAL' ; conviction: 'HIGH'|'LOW' ; ivRegime: 'LOW'|'NORMAL'|'HIGH'
    function strategySelector(view, conviction, ivRegime) {
        var M = {
            'BULL-HIGH-LOW':    { name: 'Long Call / Bull Call Spread', legs: 'Buy ATM CE (+ sell OTM CE to fund)', risk: 'Defined', why: 'Strong up view, cheap premium — buy direction.' },
            'BULL-HIGH-NORMAL': { name: 'Bull Call Spread', legs: 'Buy ATM CE, Sell OTM CE', risk: 'Defined', why: 'Up view; spread cuts theta/IV cost.' },
            'BULL-HIGH-HIGH':   { name: 'Bull Put Spread (credit)', legs: 'Sell ATM PE, Buy OTM PE', risk: 'Defined', why: 'Up view + rich IV — sell premium, collect theta.' },
            'BULL-LOW-LOW':     { name: 'Bull Call Spread (tight)', legs: 'Buy ATM CE, Sell near-OTM CE', risk: 'Defined', why: 'Mild up view; keep cost small.' },
            'BULL-LOW-NORMAL':  { name: 'Bull Put Spread', legs: 'Sell OTM PE, Buy further OTM PE', risk: 'Defined', why: 'Mild up bias; theta works for you.' },
            'BULL-LOW-HIGH':    { name: 'Cash-Secured Put / Bull Put Spread', legs: 'Sell OTM PE (hedge with lower PE)', risk: 'Defined', why: 'Rich IV — get paid to be mildly bullish.' },
            'BEAR-HIGH-LOW':    { name: 'Long Put / Bear Put Spread', legs: 'Buy ATM PE (+ sell OTM PE)', risk: 'Defined', why: 'Strong down view, cheap premium.' },
            'BEAR-HIGH-NORMAL': { name: 'Bear Put Spread', legs: 'Buy ATM PE, Sell OTM PE', risk: 'Defined', why: 'Down view; spread reduces cost.' },
            'BEAR-HIGH-HIGH':   { name: 'Bear Call Spread (credit)', legs: 'Sell ATM CE, Buy OTM CE', risk: 'Defined', why: 'Down view + rich IV — sell premium.' },
            'BEAR-LOW-LOW':     { name: 'Bear Put Spread (tight)', legs: 'Buy ATM PE, Sell near-OTM PE', risk: 'Defined', why: 'Mild down view; small cost.' },
            'BEAR-LOW-NORMAL':  { name: 'Bear Call Spread', legs: 'Sell OTM CE, Buy further OTM CE', risk: 'Defined', why: 'Mild down bias; collect theta.' },
            'BEAR-LOW-HIGH':    { name: 'Bear Call Spread', legs: 'Sell OTM CE, Buy higher CE', risk: 'Defined', why: 'Rich IV — sell the rip.' },
            'NEUTRAL-HIGH-LOW': { name: 'Long Straddle / Strangle', legs: 'Buy ATM CE + ATM PE', risk: 'Defined (debit)', why: 'Expect a big move, IV cheap — buy volatility.' },
            'NEUTRAL-HIGH-NORMAL':{ name: 'Iron Fly', legs: 'Sell ATM CE+PE, buy wings', risk: 'Defined', why: 'Range view; defined-risk premium sell.' },
            'NEUTRAL-HIGH-HIGH':{ name: 'Iron Condor / Short Strangle', legs: 'Sell OTM CE+PE, buy wings', risk: 'Defined (condor)', why: 'Rich IV + range — harvest theta, hedge tails.' },
            'NEUTRAL-LOW-LOW':  { name: 'Long Strangle (cheap)', legs: 'Buy OTM CE + OTM PE', risk: 'Defined', why: 'Coiling market, cheap IV — pay for the break.' },
            'NEUTRAL-LOW-NORMAL':{ name: 'Iron Condor', legs: 'Sell OTM CE+PE, buy wings', risk: 'Defined', why: 'Range-bound; collect decay safely.' },
            'NEUTRAL-LOW-HIGH': { name: 'Iron Condor (wide)', legs: 'Sell far-OTM CE+PE, buy wings', risk: 'Defined', why: 'High IV mean-reversion — wide condor.' }
        };
        var key = view + '-' + conviction + '-' + ivRegime;
        return M[key] || { name: 'Stay flat', legs: '—', risk: '—', why: 'No clean edge for this combination.' };
    }
    TES.strategySelector = strategySelector;
    TES.ivRegime = function (vix) { return vix == null ? 'NORMAL' : vix < 13 ? 'LOW' : vix > 18 ? 'HIGH' : 'NORMAL'; };

    /* ===== Expiry day operating manual (F9) =============================== */
    function expiryManual(nowMins) { // minutes since 09:15 IST
        var phases = [
            { from: 0, to: 45, name: 'Opening (09:15–10:00)', rule: 'No fresh shorts on premium yet — gamma high, fakeouts common. Mark ORB & key OI walls. Wait for the first range to define.' },
            { from: 45, to: 240, name: 'Mid-session (10:00–13:15)', rule: 'Trend/pin develops. Sell theta toward strong OI walls with defined risk. Respect VWAP. Hard daily-loss cap applies.' },
            { from: 240, to: 360, name: 'Last 45 min (13:15–15:15)', rule: 'Gamma + pinning dominate. Only quick scalps to the max-OI strike. Cut size, time-stop trades, no repairs.' },
            { from: 360, to: 999, name: 'Close (15:15–15:30)', rule: 'Square off intraday. IV crush done — no new buys.' }
        ];
        var cur = phases.find(function (p) { return nowMins >= p.from && nowMins < p.to; }) || phases[0];
        return { phases: phases, current: cur };
    }
    TES.expiryManual = expiryManual;

    /* ===== Futures leverage / usage (F2) + cost/MTM (F3) ================== */
    function futuresMaxLots(capital, riskPct, contractValue, slPct) {
        // cap lots so a slPct adverse move loses <= riskPct of capital
        var riskAmt = capital * riskPct / 100;
        var lossPerLot = contractValue * slPct / 100;
        return Math.max(0, Math.floor(riskAmt / (lossPerLot || 1e-9)));
    }
    TES.futures = { maxLots: futuresMaxLots };

    function tradeCost(turnoverBuy, turnoverSell, segment) {
        // rough intraday cost model (₹). segment 'options'|'futures'
        var t = turnoverBuy + turnoverSell, cost = {};
        if (segment === 'options') {
            cost.brokerage = Math.min(40, 0.0003 * t); // ~₹20/leg cap
            cost.stt = 0.000625 * turnoverSell;        // sell premium
            cost.exch = 0.0003503 * t;
            cost.gst = 0.18 * (cost.brokerage + cost.exch);
            cost.stamp = 0.00003 * turnoverBuy;
        } else {
            cost.brokerage = Math.min(40, 0.0003 * t);
            cost.stt = 0.0000125 * turnoverSell;
            cost.exch = 0.0000173 * t;
            cost.gst = 0.18 * (cost.brokerage + cost.exch);
            cost.stamp = 0.00001 * turnoverBuy;
        }
        cost.total = cost.brokerage + cost.stt + cost.exch + cost.gst + cost.stamp;
        return cost;
    }
    TES.tradeCost = tradeCost;

    /* ===== Beta hedge (F4) =============================================== */
    function betaHedge(portfolioValue, beta, indexLot, indexPrice) {
        var hedgeNotional = portfolioValue * beta;
        var lots = Math.round(hedgeNotional / (indexLot * indexPrice));
        return { hedgeNotional: hedgeNotional, lots: lots, note: 'Short ' + lots + ' index-future lot(s) to neutralise β-adjusted exposure.' };
    }
    TES.betaHedge = betaHedge;

    /* ===== Lot-scaling ladder (F11) ====================================== */
    function lotLadder(baseLots, winStreak, drawdownPct) {
        var lots = baseLots;
        if (drawdownPct >= 10) lots = Math.max(1, Math.floor(baseLots / 2));   // cut on DD
        else if (winStreak >= 5) lots = Math.ceil(baseLots * 1.5);             // earned size
        else if (winStreak >= 3) lots = baseLots + 1;
        return { lots: lots, note: drawdownPct >= 10 ? 'In drawdown — halve size, rebuild consistency.' :
            winStreak >= 5 ? 'Consistent — you earned the right to scale up.' : 'Hold base size.' };
    }
    TES.lotLadder = lotLadder;

    /* ===== Expectancy / quant metrics (F12) ============================== */
    function expectancy(trades) { // trades: [{pnlR}] where pnlR is R-multiple outcome
        var done = trades.filter(function (t) { return typeof t.pnlR === 'number'; });
        if (!done.length) return null;
        var wins = done.filter(function (t) { return t.pnlR > 0; });
        var losses = done.filter(function (t) { return t.pnlR <= 0; });
        var wr = wins.length / done.length;
        var avgW = wins.length ? wins.reduce(function (a, b) { return a + b.pnlR; }, 0) / wins.length : 0;
        var avgL = losses.length ? Math.abs(losses.reduce(function (a, b) { return a + b.pnlR; }, 0) / losses.length) : 0;
        var exp = wr * avgW - (1 - wr) * avgL; // expectancy in R
        return { n: done.length, winRate: wr, avgWin: avgW, avgLoss: avgL, expectancyR: exp };
    }
    TES.expectancy = expectancy;
})();
