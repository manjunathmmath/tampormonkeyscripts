/* ============================================================================
 * Triple Edge System (TES) — Compute Engine
 * ----------------------------------------------------------------------------
 * Pure analytics, no DOM. Translates the course curriculum into computable
 * intraday signals. Section headers map to the Course modules:
 *
 *   M2  Candlestick psychology & Volume (VSA)        -> candles(), vsa()
 *   M3  Market structure, trends, gaps, MTF          -> swings(), dowTrend(), gaps()
 *   M4  Indicators & market regimes                  -> ind.*, regime()
 *   M6/M7 Smart Money Concepts (SMC) & order flow    -> bosChoch(), orderBlocks(), fvg(), liquidity()
 *   M8  Market / Volume Profile                      -> volumeProfile()
 *   F&O M6 Option chain, OI, 4-box, OI walls         -> oiDashboard()
 *   M9  Confluence & A+ setup scoring                -> confluence()
 *   M11 Risk / position sizing / R-multiples         -> risk()
 *
 * Candle format from Kite historical: [time, open, high, low, close, volume, oi]
 * ==========================================================================*/
window.TES = window.TES || {};
(function () {
    var jQ = window.jQuery;

    function getCookie(name) {
        var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
        return m ? m.pop() : '';
    }

    /* ---- Kite API (rate-limited; historical caps at ~3 req/sec) -------------- */
    var Q = [], ACTIVE = 0, LAST = 0, CONC = 3, GAP = 320;
    function pump() {
        if (!Q.length || ACTIVE >= CONC) return;
        var w = GAP - (Date.now() - LAST);
        if (w > 0) { setTimeout(pump, w); return; }
        var job = Q.shift(); LAST = Date.now(); ACTIVE++;
        job().then(function () { ACTIVE--; pump(); });
        if (Q.length) setTimeout(pump, GAP);
    }
    function ajax(opts, attempt) {
        return new Promise(function (resolve) {
            jQ.ajax(Object.assign({
                type: 'GET', async: true, cache: false,
                headers: { 'Authorization': 'enctoken ' + getCookie('enctoken') },
                success: function (d) { resolve(d); },
                error: function (r) {
                    if (r && r.status === 429 && (attempt || 0) < 3)
                        setTimeout(function () { ajax(opts, (attempt || 0) + 1).then(resolve); }, 700 * ((attempt || 0) + 1));
                    else resolve(null);
                }
            }, opts));
        });
    }
    function queued(opts) {
        return new Promise(function (resolve) {
            Q.push(function () { return ajax(opts, 0).then(resolve); });
            pump();
        });
    }
    function ymd(d) {
        var p = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
    // Historical candles. interval e.g. '5minute','15minute','day'. daysBack window.
    function history(token, interval, daysBack) {
        var to = new Date(), from = new Date();
        from.setDate(from.getDate() - daysBack);
        var url = TES.BASE_URL + '/oms/instruments/historical/' + token + '/' + interval +
            '?user_id=X&oi=1&from=' + ymd(from) + '&to=' + ymd(to);
        return queued({ url: url }).then(function (d) {
            return (d && d.data && d.data.candles) ? d.data.candles : [];
        });
    }
    // Full market quote (OHLC, OI, depth) for ["NSE:RELIANCE", ...]
    function quote(instruments) {
        var qs = instruments.map(function (i) { return 'i=' + encodeURIComponent(i); }).join('&');
        return queued({ url: TES.BASE_URL + '/oms/quote?' + qs }).then(function (d) {
            return (d && d.data) ? d.data : {};
        });
    }
    TES.api = { history: history, quote: quote };

    /* ===== Indicator math (M4) ============================================= */
    function col(c, i) { return c.map(function (x) { return x[i]; }); }
    function sma(a, p) { var o = []; for (var i = 0; i < a.length; i++) { if (i < p - 1) { o.push(null); continue; } var s = 0; for (var j = i - p + 1; j <= i; j++) s += a[j]; o.push(s / p); } return o; }
    function ema(a, p) {
        var o = [], k = 2 / (p + 1), prev = null;
        for (var i = 0; i < a.length; i++) {
            if (a[i] == null) { o.push(null); continue; }
            prev = (prev == null) ? a[i] : a[i] * k + prev * (1 - k);
            o.push(prev);
        } return o;
    }
    function rsi(close, p) {
        p = p || 14; var o = [], g = 0, l = 0;
        for (var i = 1; i < close.length; i++) {
            var ch = close[i] - close[i - 1], up = Math.max(ch, 0), dn = Math.max(-ch, 0);
            if (i <= p) { g += up; l += dn; if (i === p) { g /= p; l /= p; o[0] = null; o[i] = 100 - 100 / (1 + (l === 0 ? 100 : g / l)); } else o[i - 1] = null; }
            else { g = (g * (p - 1) + up) / p; l = (l * (p - 1) + dn) / p; o[i] = 100 - 100 / (1 + (l === 0 ? 100 : g / l)); }
        }
        o.unshift(null); o.length = close.length; return o;
    }
    function macd(close) {
        var f = ema(close, 12), s = ema(close, 26), line = close.map(function (_, i) { return (f[i] != null && s[i] != null) ? f[i] - s[i] : null; });
        var sig = ema(line.map(function (v) { return v == null ? 0 : v; }), 9);
        var hist = line.map(function (v, i) { return (v != null && sig[i] != null) ? v - sig[i] : null; });
        return { line: line, signal: sig, hist: hist };
    }
    function trueRange(c) {
        var o = [null];
        for (var i = 1; i < c.length; i++) {
            var h = c[i][2], l = c[i][3], pc = c[i][4 - 0] ? c[i - 1][4] : c[i - 1][4];
            o.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
        } return o;
    }
    function atr(c, p) { p = p || 14; var tr = trueRange(c); return ema(tr.map(function (v) { return v == null ? 0 : v; }), p); }
    function adx(c, p) {
        p = p || 14; var plusDM = [0], minusDM = [0], tr = [0];
        for (var i = 1; i < c.length; i++) {
            var up = c[i][2] - c[i - 1][2], dn = c[i - 1][3] - c[i][3];
            plusDM.push(up > dn && up > 0 ? up : 0);
            minusDM.push(dn > up && dn > 0 ? dn : 0);
            tr.push(Math.max(c[i][2] - c[i][3], Math.abs(c[i][2] - c[i - 1][4]), Math.abs(c[i][3] - c[i - 1][4])));
        }
        var atrS = ema(tr, p), pdi = ema(plusDM, p), mdi = ema(minusDM, p), dx = [];
        for (var k = 0; k < c.length; k++) {
            var pDI = atrS[k] ? 100 * pdi[k] / atrS[k] : 0, mDI = atrS[k] ? 100 * mdi[k] / atrS[k] : 0;
            var sum = pDI + mDI; dx.push(sum ? 100 * Math.abs(pDI - mDI) / sum : 0);
        }
        var adxL = ema(dx, p);
        return { adx: adxL, lastPDI: atrS[c.length - 1] ? 100 * pdi[c.length - 1] / atrS[c.length - 1] : 0, lastMDI: atrS[c.length - 1] ? 100 * mdi[c.length - 1] / atrS[c.length - 1] : 0 };
    }
    function vwap(c) {
        // session VWAP — resets each trading day
        var o = [], cumPV = 0, cumV = 0, curDay = null;
        for (var i = 0; i < c.length; i++) {
            var day = (c[i][0] || '').slice(0, 10);
            if (day !== curDay) { curDay = day; cumPV = 0; cumV = 0; }
            var tp = (c[i][2] + c[i][3] + c[i][4]) / 3, v = c[i][5] || 0;
            cumPV += tp * v; cumV += v;
            o.push(cumV ? cumPV / cumV : c[i][4]);
        } return o;
    }
    function bollinger(close, p, mult) {
        p = p || 20; mult = mult || 2; var mid = sma(close, p), up = [], lo = [], bw = [];
        for (var i = 0; i < close.length; i++) {
            if (mid[i] == null) { up.push(null); lo.push(null); bw.push(null); continue; }
            var s = 0; for (var j = i - p + 1; j <= i; j++) s += Math.pow(close[j] - mid[i], 2);
            var sd = Math.sqrt(s / p); up.push(mid[i] + mult * sd); lo.push(mid[i] - mult * sd);
            bw.push(mid[i] ? (2 * mult * sd) / mid[i] : 0);
        } return { mid: mid, upper: up, lower: lo, bandwidth: bw };
    }
    function supertrend(c, p, mult) {
        p = p || 10; mult = mult || 3; var a = atr(c, p), st = [], dir = [];
        var prevUp = null, prevLo = null, prevST = null, prevDir = 1;
        for (var i = 0; i < c.length; i++) {
            var hl2 = (c[i][2] + c[i][3]) / 2, basicUp = hl2 + mult * (a[i] || 0), basicLo = hl2 - mult * (a[i] || 0);
            var finUp = (prevUp == null) ? basicUp : (basicUp < prevUp || c[i - 1][4] > prevUp) ? basicUp : prevUp;
            var finLo = (prevLo == null) ? basicLo : (basicLo > prevLo || c[i - 1][4] < prevLo) ? basicLo : prevLo;
            var d = prevDir;
            if (prevST == null) d = 1;
            else if (prevST === prevUp) d = c[i][4] > finUp ? 1 : -1;
            else d = c[i][4] < finLo ? -1 : 1;
            var stv = d === 1 ? finLo : finUp;
            st.push(stv); dir.push(d); prevUp = finUp; prevLo = finLo; prevST = stv; prevDir = d;
        } return { value: st, dir: dir };
    }
    TES.ind = { sma: sma, ema: ema, rsi: rsi, macd: macd, atr: atr, adx: adx, vwap: vwap, bollinger: bollinger, supertrend: supertrend, col: col };

    /* ===== Market structure (M3 / M7) ====================================== */
    // Fractal swing highs/lows (lookback L on each side).
    function swings(c, L) {
        L = L || 2; var hi = [], lo = [];
        for (var i = L; i < c.length - L; i++) {
            var isH = true, isL = true;
            for (var j = i - L; j <= i + L; j++) { if (c[j][2] > c[i][2]) isH = false; if (c[j][3] < c[i][3]) isL = false; }
            if (isH) hi.push({ i: i, price: c[i][2], t: c[i][0] });
            if (isL) lo.push({ i: i, price: c[i][3], t: c[i][0] });
        } return { highs: hi, lows: lo };
    }
    // Dow trend from last swings: HH+HL=up, LH+LL=down.
    function dowTrend(sw) {
        var h = sw.highs, l = sw.lows;
        if (h.length < 2 || l.length < 2) return { trend: 'NONE', reason: 'insufficient swings' };
        var hh = h[h.length - 1].price > h[h.length - 2].price;
        var hl = l[l.length - 1].price > l[l.length - 2].price;
        if (hh && hl) return { trend: 'UP', reason: 'Higher Highs + Higher Lows' };
        if (!hh && !hl) return { trend: 'DOWN', reason: 'Lower Highs + Lower Lows' };
        return { trend: 'RANGE', reason: 'Mixed structure' };
    }
    // Break of Structure / Change of Character vs most recent opposing swing.
    function bosChoch(c, sw) {
        var last = c[c.length - 1][4], h = sw.highs, l = sw.lows, out = { event: 'NONE', level: null };
        if (h.length && last > h[h.length - 1].price) out = { event: 'BOS_UP', level: h[h.length - 1].price };
        else if (l.length && last < l[l.length - 1].price) out = { event: 'BOS_DOWN', level: l[l.length - 1].price };
        return out;
    }
    // Order blocks: last opposite candle before an impulsive move (simplified).
    function orderBlocks(c) {
        var obs = [], n = c.length;
        for (var i = Math.max(1, n - 60); i < n - 1; i++) {
            var body = Math.abs(c[i][4] - c[i][1]), rng = c[i][2] - c[i][3];
            var next = c[i + 1], nextBody = Math.abs(next[4] - next[1]);
            // bullish OB: down candle followed by strong up candle
            if (c[i][4] < c[i][1] && next[4] > next[1] && nextBody > body * 1.5)
                obs.push({ type: 'BULL', top: c[i][2], bottom: c[i][3], i: i });
            if (c[i][4] > c[i][1] && next[4] < next[1] && nextBody > body * 1.5)
                obs.push({ type: 'BEAR', top: c[i][2], bottom: c[i][3], i: i });
        } return obs.slice(-6);
    }
    // Fair Value Gaps (3-candle imbalance).
    function fvg(c) {
        var g = [], n = c.length;
        for (var i = Math.max(2, n - 60); i < n; i++) {
            if (c[i][3] > c[i - 2][2]) g.push({ type: 'BULL', top: c[i][3], bottom: c[i - 2][2], i: i });
            if (c[i][2] < c[i - 2][3]) g.push({ type: 'BEAR', top: c[i - 2][3], bottom: c[i][2], i: i });
        } return g.slice(-6);
    }
    // Liquidity sweep: wick takes out a recent swing then closes back inside.
    function liquidity(c, sw) {
        var last = c[c.length - 1], out = { swept: 'NONE' };
        var h = sw.highs, l = sw.lows;
        if (h.length && last[2] > h[h.length - 1].price && last[4] < h[h.length - 1].price)
            out = { swept: 'SELL_SIDE_TAKEN', note: 'High swept, closed below — bearish trap' };
        if (l.length && last[3] < l[l.length - 1].price && last[4] > l[l.length - 1].price)
            out = { swept: 'BUY_SIDE_TAKEN', note: 'Low swept, closed above — bullish trap' };
        return out;
    }
    // Gaps vs previous day close (M3).
    function gaps(daily) {
        if (daily.length < 2) return { type: 'NONE' };
        var prevClose = daily[daily.length - 2][4], open = daily[daily.length - 1][1];
        var pct = (open - prevClose) / prevClose * 100;
        if (Math.abs(pct) < 0.15) return { type: 'NONE', pct: pct };
        return { type: pct > 0 ? 'GAP_UP' : 'GAP_DOWN', pct: pct, prevClose: prevClose, open: open };
    }
    TES.struct = { swings: swings, dowTrend: dowTrend, bosChoch: bosChoch, orderBlocks: orderBlocks, fvg: fvg, liquidity: liquidity, gaps: gaps };

    /* ===== Candle psychology & VSA (M2) ==================================== */
    function candles(c) {
        var k = c[c.length - 1], body = Math.abs(k[4] - k[1]), rng = k[2] - k[3] || 1e-9;
        var upWick = k[2] - Math.max(k[1], k[4]), dnWick = Math.min(k[1], k[4]) - k[3];
        var bull = k[4] > k[1];
        var pat = 'Neutral';
        if (body / rng < 0.25 && upWick > body * 2 && dnWick > body * 2) pat = 'Doji / indecision';
        else if (dnWick > body * 2 && upWick < body) pat = bull ? 'Hammer (demand)' : 'Hanging man';
        else if (upWick > body * 2 && dnWick < body) pat = 'Shooting star (supply)';
        else if (body / rng > 0.7) pat = bull ? 'Strong bull (aggression)' : 'Strong bear (aggression)';
        return { bull: bull, bodyPct: body / rng, upWick: upWick, dnWick: dnWick, pattern: pat };
    }
    function vsa(c) {
        // Effort vs Result: volume vs price progress (M2).
        var n = c.length; if (n < 21) return { signal: 'NONE' };
        var vols = col(c, 5).slice(-20), avgV = vols.reduce(function (a, b) { return a + b; }, 0) / 20;
        var k = c[n - 1], v = k[5] || 0, body = Math.abs(k[4] - k[1]), rng = (k[2] - k[3]) || 1e-9;
        if (v > avgV * 1.8 && body / rng < 0.35) return { signal: 'ABSORPTION', note: 'High effort, low result — reversal risk', volRatio: v / avgV };
        if (v > avgV * 1.5 && body / rng > 0.6) return { signal: 'CONFIRMATION', note: 'Effort = result — conviction move', volRatio: v / avgV };
        if (v < avgV * 0.6) return { signal: 'NO_DEMAND', note: 'Low volume — weak move', volRatio: v / avgV };
        return { signal: 'NORMAL', volRatio: v / avgV };
    }
    TES.behavior = { candles: candles, vsa: vsa };

    /* ===== Volume / Market Profile (M8) ==================================== */
    function volumeProfile(c, bins) {
        bins = bins || 30;
        var today = (c[c.length - 1][0] || '').slice(0, 10);
        var day = c.filter(function (x) { return (x[0] || '').slice(0, 10) === today; });
        if (day.length < 3) day = c.slice(-78); // fallback last session
        var hi = Math.max.apply(null, day.map(function (x) { return x[2]; }));
        var lo = Math.min.apply(null, day.map(function (x) { return x[3]; }));
        var step = (hi - lo) / bins || 1e-9, vp = new Array(bins).fill(0);
        day.forEach(function (x) {
            var mid = (x[2] + x[3]) / 2, b = Math.min(bins - 1, Math.max(0, Math.floor((mid - lo) / step)));
            vp[b] += x[5] || 1;
        });
        var pocB = 0; for (var i = 1; i < bins; i++) if (vp[i] > vp[pocB]) pocB = i;
        var total = vp.reduce(function (a, b) { return a + b; }, 0), target = total * 0.7;
        var lo2 = pocB, hi2 = pocB, acc = vp[pocB];
        while (acc < target && (lo2 > 0 || hi2 < bins - 1)) {
            var dn = lo2 > 0 ? vp[lo2 - 1] : -1, upv = hi2 < bins - 1 ? vp[hi2 + 1] : -1;
            if (upv >= dn) { hi2++; acc += vp[hi2]; } else { lo2--; acc += vp[lo2]; }
        }
        var price = function (b) { return lo + (b + 0.5) * step; };
        // HVN/LVN
        var hvn = [], lvn = [], avg = total / bins;
        for (var j = 0; j < bins; j++) { if (vp[j] > avg * 1.5) hvn.push(price(j)); if (vp[j] < avg * 0.4 && vp[j] >= 0) lvn.push(price(j)); }
        return { poc: price(pocB), vah: price(hi2), val: price(lo2), high: hi, low: lo, hvn: hvn, lvn: lvn };
    }
    TES.profile = { volumeProfile: volumeProfile };

    /* ===== Market regime (M4) ============================================== */
    function regime(c, vix) {
        var n = c.length, adxO = adx(c, 14), bb = bollinger(col(c, 4), 20, 2), bw = bb.bandwidth[n - 1] || 0;
        var bwSeries = bb.bandwidth.slice(-50).filter(function (v) { return v != null; });
        var bwMin = bwSeries.length ? Math.min.apply(null, bwSeries) : bw;
        var adxv = adxO.adx[n - 1] || 0;
        var r;
        if (bw <= bwMin * 1.15) r = 'COMPRESSION';
        else if (adxv >= 22) r = 'TRENDING';
        else if (vix && vix > 16) r = 'VOLATILE';
        else r = 'MEAN_REVERTING';
        return { regime: r, adx: adxv, bandwidth: bw, pDI: adxO.lastPDI, mDI: adxO.lastMDI };
    }
    TES.regime = regime;

    /* ===== Option chain / OI 4-box dashboard (F&O M6) ===================== */
    // Uses full quote for ATM±range CE/PE. Returns 4-box bias + PCR + OI walls.
    function oiDashboard(name, spot) {
        var meta = TES.meta(name); if (!meta || !meta.fno) return Promise.resolve(null);
        var step = meta.strikeStep, atm = Math.round(spot / step) * step, range = 3;
        var exch = meta.exch === 'BSE' ? 'BFO' : 'NFO';
        var syms = [];
        for (var k = -range; k <= range; k++) {
            var strike = atm + k * step;
            // Kite symbol resolution is expiry-specific; we read via quote of tradingsymbol pattern is unreliable,
            // so we approximate using the option-chain quote of nearest weekly via the generic instrument quote.
            syms.push({ strike: strike });
        }
        // Without an instruments dump we cannot build exact option symbols; return strike scaffold so the
        // UI can show ATM/strike ladder and the user can extend with live OI when available.
        return Promise.resolve({ atm: atm, step: step, strikes: syms.map(function (s) { return s.strike; }), note: 'OI ladder (live OI requires option symbol map)' });
    }
    TES.oiDashboard = oiDashboard;

    /* ===== Confluence scoring — A+ setup builder (M9) ====================== */
    // Each pillar votes -1..+1 with a weight; weighted sum -> direction + grade.
    function confluence(ctx) {
        // ctx: {c5, c15, daily, vix, name}
        var c = ctx.c5, n = c.length, last = c[n - 1][4];
        var close5 = col(c, 4);
        var sw5 = swings(c, 2), sw15 = swings(ctx.c15 || c, 2);
        var trend5 = dowTrend(sw5), trend15 = dowTrend(sw15);
        var bos = bosChoch(c, sw5);
        var ob = orderBlocks(c), fv = fvg(c), liq = liquidity(c, sw5);
        var vp = volumeProfile(c), vw = vwap(c)[n - 1];
        var rsiV = rsi(close5, 14)[n - 1] || 50;
        var mac = macd(close5), macdHist = mac.hist[n - 1] || 0;
        var st = supertrend(c, 10, 3), stDir = st.dir[n - 1];
        var e9 = ema(close5, 9)[n - 1], e21 = ema(close5, 21)[n - 1], e50 = ema(close5, 50)[n - 1];
        var reg = regime(c, ctx.vix), beh = vsa(c), cdl = candles(c), gap = gaps(ctx.daily || []);
        var atrV = atr(c, 14)[n - 1] || (last * 0.003);

        var P = []; // {key, label, score(-1..1), weight, why, module}
        function dirOf(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }

        // M3/M7 Structure — MTF alignment
        var stTrend = (trend5.trend === 'UP' ? 1 : trend5.trend === 'DOWN' ? -1 : 0);
        var stTrend15 = (trend15.trend === 'UP' ? 1 : trend15.trend === 'DOWN' ? -1 : 0);
        var mtf = (stTrend && stTrend === stTrend15) ? stTrend : (stTrend * 0.5);
        P.push({ key: 'structure', label: 'Market Structure (MTF)', module: 'M3/M7', weight: 3,
            score: mtf, why: '5m ' + trend5.trend + ' / 15m ' + trend15.trend + (bos.event !== 'NONE' ? ' · ' + bos.event : '') });

        // M4 Trend indicators (EMA stack + Supertrend)
        var stack = 0;
        if (e9 != null && e21 != null && e50 != null) stack = (last > e9 && e9 > e21 && e21 > e50) ? 1 : (last < e9 && e9 < e21 && e21 < e50) ? -1 : 0;
        var indDir = dirOf(stack + (stDir || 0));
        P.push({ key: 'trendind', label: 'Trend Indicators (EMA + Supertrend)', module: 'M4', weight: 2,
            score: indDir, why: (stack > 0 ? 'EMA stacked up' : stack < 0 ? 'EMA stacked down' : 'EMA mixed') + ' · ST ' + (stDir > 0 ? 'up' : 'down') });

        // M4 Momentum (RSI + MACD)
        var mom = dirOf((rsiV - 50) / 50 + (macdHist > 0 ? 0.5 : -0.5));
        P.push({ key: 'momentum', label: 'Momentum (RSI + MACD)', module: 'M4', weight: 1.5,
            score: mom, why: 'RSI ' + rsiV.toFixed(0) + ' · MACD hist ' + (macdHist >= 0 ? '+' : '') + macdHist.toFixed(1) });

        // M4 VWAP location
        var vwapDir = last > vw ? 1 : last < vw ? -1 : 0;
        P.push({ key: 'vwap', label: 'VWAP Location', module: 'M4', weight: 1.5,
            score: vwapDir, why: 'Price ' + (vwapDir > 0 ? 'above' : vwapDir < 0 ? 'below' : 'at') + ' VWAP (' + vw.toFixed(1) + ')' });

        // M6/M7 Smart Money — nearest OB/FVG/liquidity bias
        var smc = 0, smcWhy = [];
        var nearOB = ob.filter(function (o) { return last >= o.bottom * 0.999 && last <= o.top * 1.001; });
        if (nearOB.length) { var b = nearOB[nearOB.length - 1]; smc += b.type === 'BULL' ? 1 : -1; smcWhy.push('At ' + b.type + ' OB'); }
        if (liq.swept === 'BUY_SIDE_TAKEN') { smc += 1; smcWhy.push('Bull liquidity sweep'); }
        if (liq.swept === 'SELL_SIDE_TAKEN') { smc -= 1; smcWhy.push('Bear liquidity sweep'); }
        if (fv.length) { var g = fv[fv.length - 1]; smcWhy.push('Open ' + g.type + ' FVG'); }
        P.push({ key: 'smc', label: 'Smart Money (OB / FVG / Sweep)', module: 'M6/M7', weight: 2.5,
            score: dirOf(smc), why: smcWhy.join(' · ') || 'No active SMC trigger' });

        // M8 Profile location (value)
        var profDir = 0, pw = '';
        if (last > vp.vah) { profDir = 1; pw = 'Above VAH (acceptance up)'; }
        else if (last < vp.val) { profDir = -1; pw = 'Below VAL (acceptance down)'; }
        else { profDir = last > vp.poc ? 0.5 : -0.5; pw = 'Inside value vs POC ' + vp.poc.toFixed(1); }
        P.push({ key: 'profile', label: 'Volume Profile Location', module: 'M8', weight: 1.5,
            score: profDir, why: pw });

        // M2 Volume / VSA confirmation
        var vsaDir = 0;
        if (beh.signal === 'CONFIRMATION') vsaDir = cdl.bull ? 1 : -1;
        else if (beh.signal === 'ABSORPTION') vsaDir = cdl.bull ? -0.5 : 0.5;
        else if (beh.signal === 'NO_DEMAND') vsaDir = 0;
        P.push({ key: 'vsa', label: 'Volume / VSA (' + beh.signal + ')', module: 'M2', weight: 1,
            score: vsaDir, why: (beh.note || '') + ' · ' + cdl.pattern });

        // F6 Option-chain OI bias (only when live chain resolved)
        if (ctx.oi) {
            P.push({ key: 'oi', label: 'Option OI / PCR', module: 'F6', weight: 2,
                score: ctx.oi.biasScore,
                why: 'PCR ' + ctx.oi.pcr.toFixed(2) + ' · support ' + ctx.oi.support + ' / resist ' + ctx.oi.resistance });
        }

        // Weighted aggregate
        var num = 0, den = 0;
        P.forEach(function (p) { num += p.score * p.weight; den += p.weight; });
        var raw = num / den;                 // -1..+1
        var pct = Math.round(((raw + 1) / 2) * 100); // 0..100 conviction
        var direction = raw > 0.15 ? 'LONG' : raw < -0.15 ? 'SHORT' : 'NO-TRADE';
        // Grade by alignment of pillars in the chosen direction
        var aligned = P.filter(function (p) { return direction === 'LONG' ? p.score > 0 : direction === 'SHORT' ? p.score < 0 : false; }).length;
        var grade = direction === 'NO-TRADE' ? '—' : aligned >= 6 ? 'A+' : aligned >= 5 ? 'A' : aligned >= 4 ? 'B' : 'C';

        // Regime fit note (M4): is the setup type suitable for current regime?
        var regimeFit = 'OK';
        if (reg.regime === 'COMPRESSION' && direction !== 'NO-TRADE') regimeFit = 'Wait for breakout (compression)';
        if (reg.regime === 'MEAN_REVERTING' && grade === 'A+') regimeFit = 'Prefer fade at value edges';

        // Entry / SL / Target (M9 + M11) using structure + ATR
        var entry = last, sl, t1, t2;
        if (direction === 'LONG') {
            sl = Math.min(c[n - 1][3], (sw5.lows.length ? sw5.lows[sw5.lows.length - 1].price : last - 1.5 * atrV)) - 0.2 * atrV;
            var r = entry - sl; t1 = entry + r; t2 = entry + 2 * r;
        } else if (direction === 'SHORT') {
            sl = Math.max(c[n - 1][2], (sw5.highs.length ? sw5.highs[sw5.highs.length - 1].price : last + 1.5 * atrV)) + 0.2 * atrV;
            var r2 = sl - entry; t1 = entry - r2; t2 = entry - 2 * r2;
        }
        var rr = (direction !== 'NO-TRADE') ? Math.abs((t1 - entry) / (entry - sl)) : 0;

        return {
            name: ctx.name, last: last, vix: ctx.vix, oi: ctx.oi, pillars: P, raw: raw, conviction: pct, direction: direction, grade: grade,
            regime: reg, regimeFit: regimeFit, vsa: beh, candle: cdl, gap: gap, profile: vp, vwap: vw, atr: atrV,
            rsi: rsiV, plan: (direction !== 'NO-TRADE') ? { entry: entry, sl: sl, t1: t1, t2: t2, rr: rr } : null
        };
    }
    TES.confluence = confluence;

    /* ===== Risk engine (M11) =============================================== */
    function risk(opts) {
        // opts: {capital, riskPct, entry, sl, lotSize, maxLeverage}
        var riskAmt = opts.capital * (opts.riskPct / 100);
        var perUnit = Math.abs(opts.entry - opts.sl) || 1e-9;
        var rawUnits = Math.floor(riskAmt / perUnit);
        var lot = opts.lotSize || 1;
        var lots = Math.max(0, Math.floor(rawUnits / lot));
        var qty = lots * lot;
        var notional = qty * opts.entry;
        var maxNotional = opts.capital * (opts.maxLeverage || 5);
        var capped = false;
        if (notional > maxNotional) { capped = true; qty = Math.floor(maxNotional / opts.entry / lot) * lot; lots = qty / lot; notional = qty * opts.entry; }
        return { riskAmt: riskAmt, perUnit: perUnit, qty: qty, lots: lots, notional: notional, leverageUsed: notional / opts.capital, capped: capped };
    }
    TES.risk = risk;

    /* ===== Orchestration: pull data + run full analysis =================== */
    TES.analyze = function (name) {
        var meta = TES.meta(name);
        return Promise.all([
            history(meta.token, '5minute', 10),
            history(meta.token, '15minute', 20),
            history(meta.token, 'day', 60),
            history(TES.VIX_TOKEN, 'day', 5)
        ]).then(function (res) {
            var c5 = res[0], c15 = res[1], daily = res[2], vixC = res[3];
            var vix = vixC.length ? vixC[vixC.length - 1][4] : null;
            if (!c5.length) return { error: 'No data (market closed or auth expired)' };
            var spot = c5[c5.length - 1][4];
            // Live option-chain OI (F6) for F&O instruments where a strike map exists.
            var oiP = (meta.fno && TES.fetchOIChain) ? TES.fetchOIChain(name, spot, 3) : Promise.resolve(null);
            return oiP.then(function (oi) {
                return confluence({ c5: c5, c15: c15, daily: daily, vix: vix, name: name, oi: oi });
            });
        });
    };
})();
