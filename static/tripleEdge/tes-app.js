/* ============================================================================
 * Triple Edge System (TES) — UI / Application layer
 * ----------------------------------------------------------------------------
 * Floating launcher on kite.zerodha.com -> dashboard popup implementing the
 * course's intraday workflow: Watchlist -> Confluence Scan -> A+ Setup ->
 * Risk Sizing -> Pre-trade Checklist -> Journal -> AI Review (M9, M11, M12).
 * ==========================================================================*/
(function () {
    var jQ = window.jQuery;
    var LS_JOURNAL = 'TES_JOURNAL', LS_CFG = 'TES_CFG';

    function cfg() {
        try { return Object.assign({ capital: 100000, riskPct: 1, maxLeverage: 5 }, JSON.parse(localStorage.getItem(LS_CFG) || '{}')); }
        catch (e) { return { capital: 100000, riskPct: 1, maxLeverage: 5 }; }
    }
    function saveCfg(c) { localStorage.setItem(LS_CFG, JSON.stringify(c)); }
    function journal() { try { return JSON.parse(localStorage.getItem(LS_JOURNAL) || '[]'); } catch (e) { return []; } }
    function saveJournal(j) { localStorage.setItem(LS_JOURNAL, JSON.stringify(j)); }
    function f(n, d) { return (n == null || isNaN(n)) ? '—' : Number(n).toFixed(d == null ? 2 : d); }

    /* ---- styles (scoped, dark) -------------------------------------------- */
    function injectCSS() {
        if (document.getElementById('tes-css')) return;
        var s = document.createElement('style'); s.id = 'tes-css';
        s.textContent = `
        #tes-fab{position:fixed;right:18px;bottom:18px;z-index:99998;width:52px;height:52px;border-radius:50%;
          background:linear-gradient(135deg,#16a34a,#065f46);color:#fff;border:none;font-weight:700;font-size:13px;
          cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.4)}
        #tes-fab:hover{transform:scale(1.05)}
        #tes-panel{position:fixed;top:3%;left:50%;transform:translateX(-50%);width:min(1180px,96vw);height:92vh;
          background:#0d1117;color:#e6edf3;z-index:99999;border:1px solid #30363d;border-radius:10px;display:none;
          flex-direction:column;font-family:Inter,Segoe UI,Arial,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.6)}
        #tes-panel.open{display:flex}
        .tes-head{display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid #30363d;background:#161b22}
        .tes-head h2{font-size:15px;margin:0;font-weight:700;letter-spacing:.3px}
        .tes-head .sub{font-size:11px;color:#8b949e}
        .tes-head select,.tes-head input{background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:6px;padding:5px 8px;font-size:12px}
        .tes-btn{background:#238636;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600}
        .tes-btn.sec{background:#21262d;border:1px solid #30363d}
        .tes-btn:hover{filter:brightness(1.1)}
        .tes-x{margin-left:auto;background:none;border:none;color:#8b949e;font-size:20px;cursor:pointer}
        .tes-body{flex:1;overflow:auto;padding:14px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .tes-card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px}
        .tes-card h3{font-size:12px;margin:0 0 8px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;font-weight:700}
        .tes-verdict{grid-column:1/3;display:flex;align-items:center;gap:18px}
        .tes-gauge{width:120px;height:120px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-direction:column;font-weight:800;font-size:26px;flex:0 0 auto}
        .tes-grade{font-size:46px;font-weight:900;line-height:1}
        .tes-dir{font-size:20px;font-weight:800;padding:4px 14px;border-radius:20px}
        .tes-long{background:#16341f;color:#3fb950;border:1px solid #2ea043}
        .tes-short{background:#3d1418;color:#f85149;border:1px solid #da3633}
        .tes-flat{background:#21262d;color:#8b949e;border:1px solid #30363d}
        .tes-pill{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #21262d;font-size:12px}
        .tes-pill:last-child{border:none}
        .tes-pill .bar{width:64px;height:8px;background:#21262d;border-radius:4px;position:relative;flex:0 0 auto;overflow:hidden}
        .tes-pill .bar i{position:absolute;top:0;bottom:0;left:50%;width:2px;background:#484f58}
        .tes-pill .bar b{position:absolute;top:0;bottom:0;border-radius:4px}
        .tes-pill .mod{font-size:9px;color:#6e7681;background:#21262d;border-radius:3px;padding:1px 4px;flex:0 0 auto}
        .tes-pill .lbl{flex:0 0 200px;font-weight:600}
        .tes-pill .why{color:#8b949e;flex:1;font-size:11px}
        .tes-kv{display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid #21262d}
        .tes-kv span:first-child{color:#8b949e}
        .tes-kv b.up{color:#3fb950}.tes-kv b.dn{color:#f85149}
        .tes-chk{display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0}
        .tes-chk input{width:15px;height:15px}
        .tes-note{font-size:11px;color:#8b949e;margin-top:6px;line-height:1.5}
        .tes-jrow{font-size:11px;border-bottom:1px solid #21262d;padding:5px 0;display:flex;gap:8px}
        textarea.tes-ai{width:100%;height:120px;background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:6px;font-size:11px;padding:8px;font-family:monospace}
        .tes-tag{font-size:10px;padding:1px 6px;border-radius:10px;background:#21262d;color:#8b949e}
        .tes-loading{grid-column:1/3;text-align:center;color:#8b949e;padding:40px;font-size:13px}`;
        document.head.appendChild(s);
    }

    function gaugeColor(pct) { return pct >= 70 ? '#2ea043' : pct >= 55 ? '#bb8009' : pct <= 30 ? '#da3633' : pct <= 45 ? '#bb8009' : '#484f58'; }

    function pillBar(score) {
        var col = score > 0 ? '#3fb950' : score < 0 ? '#f85149' : '#484f58';
        var w = Math.min(50, Math.abs(score) * 50);
        var side = score >= 0 ? 'left:50%;width:' + w + '%' : 'right:50%;width:' + w + '%';
        return '<div class="bar"><i></i><b style="background:' + col + ';' + side + '"></b></div>';
    }

    function renderResult(r) {
        if (r.error) return '<div class="tes-loading">' + r.error + '</div>';
        var c = cfg();
        var gc = gaugeColor(r.conviction);
        var dirCls = r.direction === 'LONG' ? 'tes-long' : r.direction === 'SHORT' ? 'tes-short' : 'tes-flat';

        var pills = r.pillars.map(function (p) {
            return '<div class="tes-pill"><span class="mod">' + p.module + '</span>' +
                '<span class="lbl">' + p.label + '</span>' + pillBar(p.score) +
                '<span class="why">' + p.why + '</span></div>';
        }).join('');

        // Plan + risk
        var planHtml = '<div class="tes-note">No A+ confluence — stand aside (M9: only trade graded setups).</div>';
        var riskBlock = '';
        if (r.plan) {
            var lot = (r.oi && r.oi.lotSize) ? r.oi.lotSize : 1;
            var rk = TES.risk({ capital: c.capital, riskPct: c.riskPct, entry: r.plan.entry, sl: r.plan.sl, lotSize: lot, maxLeverage: c.maxLeverage });
            planHtml =
                '<div class="tes-kv"><span>Entry</span><b>' + f(r.plan.entry) + '</b></div>' +
                '<div class="tes-kv"><span>Stop-loss</span><b class="dn">' + f(r.plan.sl) + '</b></div>' +
                '<div class="tes-kv"><span>Target 1 (1R)</span><b class="up">' + f(r.plan.t1) + '</b></div>' +
                '<div class="tes-kv"><span>Target 2 (2R)</span><b class="up">' + f(r.plan.t2) + '</b></div>' +
                '<div class="tes-kv"><span>Risk / unit</span><b>' + f(rk.perUnit) + '</b></div>' +
                '<div class="tes-kv"><span>R:R</span><b>' + f(r.plan.rr, 2) + '</b></div>';
            riskBlock =
                '<div class="tes-kv"><span>Capital</span><b>₹' + c.capital.toLocaleString('en-IN') + '</b></div>' +
                '<div class="tes-kv"><span>Risk ' + c.riskPct + '% (max loss)</span><b class="dn">₹' + f(rk.riskAmt, 0) + '</b></div>' +
                '<div class="tes-kv"><span>Suggested qty (' + rk.lots + ' lot' + (rk.lots === 1 ? '' : 's') + ' × ' + lot + ')</span><b>' + rk.qty + '</b></div>' +
                '<div class="tes-kv"><span>Notional</span><b>₹' + f(rk.notional, 0) + '</b></div>' +
                '<div class="tes-kv"><span>Leverage used</span><b>' + f(rk.leverageUsed, 1) + 'x' + (rk.capped ? ' (capped)' : '') + '</b></div>';
        }

        // Pre-trade checklist (M11)
        var checks = [
            'Setup is graded A or A+ (not forcing a B/C)',
            'Higher-timeframe (15m) structure agrees',
            'Trade is on the right side of VWAP / value',
            'Stop-loss is at a structural level, not arbitrary',
            'Risk is ≤ ' + c.riskPct + '% of capital and within leverage cap',
            'Market regime suits this setup (' + r.regime.regime + ')',
            'No major event / news in the next 30 min'
        ].map(function (t, i) { return '<label class="tes-chk"><input type="checkbox" data-chk="' + i + '">' + t + '</label>'; }).join('');

        return '' +
        '<div class="tes-card tes-verdict">' +
            '<div class="tes-gauge" style="border:6px solid ' + gc + ';color:' + gc + '">' + r.conviction + '<span style="font-size:11px;color:#8b949e">conviction</span></div>' +
            '<div><div class="tes-grade" style="color:' + gc + '">' + r.grade + '</div>' +
            '<div style="margin:6px 0"><span class="tes-dir ' + dirCls + '">' + r.direction + '</span></div>' +
            '<div class="tes-note">Regime: <b>' + r.regime.regime + '</b> (ADX ' + f(r.regime.adx, 0) + ') · ' + r.regimeFit + '<br>' +
            'VSA: ' + r.vsa.signal + ' · Candle: ' + r.candle.pattern + (r.gap.type !== 'NONE' ? ' · ' + r.gap.type + ' ' + f(r.gap.pct, 2) + '%' : '') + '</div></div>' +
        '</div>' +

        '<div class="tes-card"><h3>Confluence Pillars (M2–M8)</h3>' + pills + '</div>' +

        '<div class="tes-card"><h3>Trade Plan (M9)</h3>' + planHtml +
            '<h3 style="margin-top:12px">Position Sizing (M11)</h3>' + (riskBlock || '<div class="tes-note">—</div>') + '</div>' +

        '<div class="tes-card"><h3>Key Levels</h3>' +
            '<div class="tes-kv"><span>LTP</span><b>' + f(r.last) + '</b></div>' +
            '<div class="tes-kv"><span>VWAP</span><b>' + f(r.vwap) + '</b></div>' +
            '<div class="tes-kv"><span>POC</span><b>' + f(r.profile.poc) + '</b></div>' +
            '<div class="tes-kv"><span>Value Area High</span><b>' + f(r.profile.vah) + '</b></div>' +
            '<div class="tes-kv"><span>Value Area Low</span><b>' + f(r.profile.val) + '</b></div>' +
            '<div class="tes-kv"><span>ATR(14)</span><b>' + f(r.atr) + '</b></div>' +
            '<div class="tes-kv"><span>RSI(14)</span><b>' + f(r.rsi, 0) + '</b></div></div>' +

        '<div class="tes-card"><h3>Pre-Trade Checklist (M11)</h3>' + checks +
            '<button class="tes-btn" id="tes-log" style="margin-top:10px">Log this trade to Journal</button></div>' +

        '<div class="tes-card"><h3>AI Review Prompt (M12)</h3>' +
            '<textarea class="tes-ai" id="tes-aiprompt" readonly>' + aiPrompt(r, c) + '</textarea>' +
            '<button class="tes-btn sec" id="tes-copyai" style="margin-top:8px">Copy prompt</button>' +
            '<div class="tes-note">Paste into Claude/ChatGPT for a second opinion & mistake check.</div></div>';
    }

    function aiPrompt(r, c) {
        var lines = [
            'You are my institutional intraday trading coach. Review this setup objectively and tell me if I should take it, skip it, or wait. Point out any confluence I am forcing.',
            '',
            'Instrument: ' + r.name + '  LTP: ' + f(r.last),
            'System grade: ' + r.grade + '  Direction: ' + r.direction + '  Conviction: ' + r.conviction + '/100',
            'Market regime: ' + r.regime.regime + ' (ADX ' + f(r.regime.adx, 0) + ')  Note: ' + r.regimeFit,
            'VSA: ' + r.vsa.signal + '  Candle: ' + r.candle.pattern,
            'Levels — VWAP ' + f(r.vwap) + ', POC ' + f(r.profile.poc) + ', VAH ' + f(r.profile.vah) + ', VAL ' + f(r.profile.val) + ', ATR ' + f(r.atr),
            ''
        ];
        r.pillars.forEach(function (p) { lines.push('- [' + p.module + '] ' + p.label + ': ' + (p.score > 0 ? 'bullish' : p.score < 0 ? 'bearish' : 'neutral') + ' — ' + p.why); });
        if (r.plan) lines.push('', 'Plan: entry ' + f(r.plan.entry) + ', SL ' + f(r.plan.sl) + ', T1 ' + f(r.plan.t1) + ', T2 ' + f(r.plan.t2) + ', R:R ' + f(r.plan.rr, 2));
        lines.push('Account: ₹' + c.capital.toLocaleString('en-IN') + ', risk ' + c.riskPct + '% per trade, max leverage ' + c.maxLeverage + 'x.');
        lines.push('', 'Give: 1) take/skip/wait verdict, 2) the single biggest risk in this trade, 3) one filter to improve it.');
        return lines.join('\n');
    }

    /* ---- F&O Mastery tab -------------------------------------------------- */
    function fnoState() {
        try { return Object.assign({ view: 'BULL', conv: 'HIGH', dte: 3 }, JSON.parse(localStorage.getItem('TES_FNO') || '{}')); }
        catch (e) { return { view: 'BULL', conv: 'HIGH', dte: 3 }; }
    }
    function saveFno(s) { localStorage.setItem('TES_FNO', JSON.stringify(s)); }

    function renderFno() {
        var r = lastResult, c = cfg(), st = fnoState();
        var spot = (r && r.last) || 0, vix = (r && r.vix) || 14;
        var meta = r ? TES.meta(r.name) : null, step = meta ? meta.strikeStep : 50;
        var ivRegime = TES.ivRegime(vix);
        var iv = vix / 100;
        if (!spot) return '<div class="tes-loading">Run a Scan first — F&O tools use the scanned instrument\'s spot &amp; VIX.</div>';

        // F8 strategy selector
        var strat = TES.strategySelector(st.view, st.conv, ivRegime);
        var sel = function (id, val, opts) {
            return '<select id="' + id + '">' + opts.map(function (o) { return '<option ' + (o === val ? 'selected' : '') + '>' + o + '</option>'; }).join('') + '</select>';
        };

        // F7 greeks ladder
        var gl = TES.greeksLadder(spot, step, iv, st.dte, 2);
        var grRows = gl.rows.map(function (row) {
            var hl = row.atm ? 'style="background:#1c2333"' : '';
            return '<tr ' + hl + '><td>' + f(row.strike, 0) + (row.atm ? ' <span class="tes-tag">ATM</span>' : '') + '</td>' +
                '<td>' + f(row.ce.price, 1) + '</td><td>' + f(row.ce.delta, 2) + '</td><td>' + f(row.ce.theta, 1) + '</td>' +
                '<td>' + f(row.pe.price, 1) + '</td><td>' + f(row.pe.delta, 2) + '</td><td>' + f(row.pe.theta, 1) + '</td>' +
                '<td>' + f(row.ce.gamma, 4) + '</td><td>' + f(row.ce.vega, 1) + '</td></tr>';
        }).join('');

        // F5 no-hope filter on ATM CE (illustrative)
        var atmCe = gl.rows.find(function (x) { return x.atm; }).ce;
        var nh = TES.opt.noHope(spot, gl.atm, atmCe.price, 'CE', st.dte, vix);

        // F9 expiry manual — current phase by IST clock
        var now = new Date(), istMin = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) - (9 * 60 + 15);
        var em = TES.expiryManual(istMin);
        var phaseHtml = em.phases.map(function (p) {
            var on = p === em.current;
            return '<div class="tes-note" style="' + (on ? 'color:#e6edf3;border-left:3px solid #2ea043;padding-left:8px' : 'padding-left:11px') + '"><b>' + p.name + (on ? ' ◀ now' : '') + '</b><br>' + p.rule + '</div>';
        }).join('');

        // F2 futures max-lot rule (assume 1.5% SL, contract value ~ spot*lot; use lot=1 proxy notional spot)
        var cv = spot * 1, maxLots = TES.futures.maxLots(c.capital, c.riskPct, cv, 1.5);

        // F12 expectancy from journal outcomes (if any logged with pnlR)
        var exp = TES.expectancy(journal());
        var expHtml = exp ? ('<div class="tes-kv"><span>Trades scored</span><b>' + exp.n + '</b></div>' +
            '<div class="tes-kv"><span>Win rate</span><b>' + f(exp.winRate * 100, 0) + '%</b></div>' +
            '<div class="tes-kv"><span>Avg win / loss (R)</span><b>' + f(exp.avgWin, 2) + ' / ' + f(exp.avgLoss, 2) + '</b></div>' +
            '<div class="tes-kv"><span>Expectancy</span><b class="' + (exp.expectancyR > 0 ? 'up' : 'dn') + '">' + f(exp.expectancyR, 2) + ' R/trade</b></div>')
            : '<div class="tes-note">Log trade outcomes (with R-multiple) to compute expectancy.</div>';

        // F6 live option chain / OI
        var oiHtml = '<div class="tes-note">No live OI (index not in NSE option map, e.g. SENSEX, or market closed).</div>';
        if (r && r.oi) {
            var boxCol = function (b) { return /BUILDUP/.test(b) ? (b === 'LONG_BUILDUP' ? '#3fb950' : '#f85149') : /COVERING/.test(b) ? '#3fb950' : /UNWIND/.test(b) ? '#f85149' : '#8b949e'; };
            var boxShort = function (b) { return ({ LONG_BUILDUP: 'LongBld', SHORT_BUILDUP: 'ShortBld', SHORT_COVERING: 'ShortCov', LONG_UNWINDING: 'LongUnw', FLAT: '—' })[b] || b; };
            var rows = r.oi.strikes.map(function (s) {
                var atmHl = s.strike === r.oi.atm ? 'style="background:#1c2333"' : '';
                var sup = s.strike === r.oi.support ? ' <span class="tes-tag" style="color:#3fb950">SUP</span>' : '';
                var resi = s.strike === r.oi.resistance ? ' <span class="tes-tag" style="color:#f85149">RES</span>' : '';
                return '<tr ' + atmHl + '><td>' + f(s.ce.oi / 1000, 0) + 'k</td>' +
                    '<td style="color:' + (s.ce.doi >= 0 ? '#3fb950' : '#f85149') + '">' + (s.ce.doi >= 0 ? '+' : '') + f(s.ce.doi / 1000, 0) + 'k</td>' +
                    '<td style="color:' + boxCol(s.ce.box) + '">' + boxShort(s.ce.box) + '</td>' +
                    '<td style="text-align:center;font-weight:700">' + f(s.strike, 0) + (s.strike === r.oi.atm ? ' ATM' : '') + sup + resi + '</td>' +
                    '<td style="color:' + boxCol(s.pe.box) + '">' + boxShort(s.pe.box) + '</td>' +
                    '<td style="color:' + (s.pe.doi >= 0 ? '#3fb950' : '#f85149') + '">' + (s.pe.doi >= 0 ? '+' : '') + f(s.pe.doi / 1000, 0) + 'k</td>' +
                    '<td>' + f(s.pe.oi / 1000, 0) + 'k</td></tr>';
            }).join('');
            oiHtml = '<div class="tes-kv"><span>Expiry</span><b>' + r.oi.expiry + '</b> <span class="tes-tag">lot ' + r.oi.lotSize + '</span></div>' +
                '<div class="tes-kv"><span>PCR</span><b class="' + (r.oi.pcr >= 1 ? 'up' : 'dn') + '">' + f(r.oi.pcr, 2) + '</b></div>' +
                '<div class="tes-kv"><span>OI walls</span><b>Support ' + r.oi.support + ' · Resistance ' + r.oi.resistance + '</b></div>' +
                '<table style="width:100%;font-size:11px;border-collapse:collapse;margin-top:6px">' +
                '<thead><tr style="color:#8b949e"><th>CE OI</th><th>CE ΔOI</th><th>CE box</th><th>Strike</th><th>PE box</th><th>PE ΔOI</th><th>PE OI</th></tr></thead>' +
                '<tbody>' + rows + '</tbody></table>' +
                '<div class="tes-note">4-box (F6): LongBld=buying, ShortBld=writing, ShortCov/LongUnw=position exit. Put-writing builds support; call-writing builds resistance.</div>';
        }

        return '' +
        '<div class="tes-card" style="grid-column:1/3"><h3>F&O Mastery — ' + (r ? r.name : '') + ' · Spot ' + f(spot) + ' · VIX ' + f(vix, 1) + ' (IV regime: <b>' + ivRegime + '</b>)</h3></div>' +

        '<div class="tes-card" style="grid-column:1/3"><h3>Live Option Chain / OI (F6)</h3>' + oiHtml + '</div>' +

        '<div class="tes-card"><h3>Strategy Selector (F8)</h3>' +
            '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">View ' + sel('tes-fview', st.view, ['BULL', 'BEAR', 'NEUTRAL']) +
            ' Conviction ' + sel('tes-fconv', st.conv, ['HIGH', 'LOW']) + ' DTE <input id="tes-fdte" type="number" style="width:55px" value="' + st.dte + '"></div>' +
            '<div class="tes-kv"><span>IV regime</span><b>' + ivRegime + '</b></div>' +
            '<div class="tes-kv"><span>Strategy</span><b>' + strat.name + '</b></div>' +
            '<div class="tes-kv"><span>Legs</span><b style="font-size:11px">' + strat.legs + '</b></div>' +
            '<div class="tes-kv"><span>Risk</span><b>' + strat.risk + '</b></div>' +
            '<div class="tes-note">' + strat.why + '</div></div>' +

        '<div class="tes-card"><h3>No-Hope Filter — ATM CE (F5)</h3>' +
            '<div class="tes-kv"><span>ATM strike</span><b>' + f(gl.atm, 0) + '</b></div>' +
            '<div class="tes-kv"><span>Premium (BS)</span><b>' + f(atmCe.price, 1) + '</b></div>' +
            '<div class="tes-kv"><span>Breakeven</span><b>' + f(nh.breakeven, 1) + '</b></div>' +
            '<div class="tes-kv"><span>Needed vs 1σ move</span><b>' + f(nh.neededMove, 0) + ' / ' + f(nh.expMove, 0) + '</b></div>' +
            '<div class="tes-kv"><span>Verdict</span><b class="' + (nh.verdict === 'OK' ? 'up' : 'dn') + '">' + nh.verdict + '</b></div>' +
            '<div class="tes-note">' + nh.note + '</div></div>' +

        '<div class="tes-card" style="grid-column:1/3"><h3>Greeks Ladder (F7) · ' + st.dte + ' DTE</h3>' +
            '<table style="width:100%;font-size:11px;border-collapse:collapse" class="tes-gtab">' +
            '<thead><tr style="color:#8b949e;text-align:left"><th>Strike</th><th>CE ₹</th><th>CE Δ</th><th>CE θ</th><th>PE ₹</th><th>PE Δ</th><th>PE θ</th><th>Γ</th><th>Vega</th></tr></thead>' +
            '<tbody>' + grRows + '</tbody></table>' +
            '<div class="tes-note">Δ delta · θ theta/day · Γ gamma · Vega per 1% IV. IV≈VIX. Buyers fight θ; sellers harvest it (F7).</div></div>' +

        '<div class="tes-card"><h3>Expiry Operating Manual (F9)</h3>' + phaseHtml + '</div>' +

        '<div class="tes-card"><h3>Futures &amp; Risk (F2/F3/F11)</h3>' +
            '<div class="tes-kv"><span>Max lots (1.5% SL, ' + c.riskPct + '% risk)</span><b>' + maxLots + '</b></div>' +
            '<div class="tes-kv"><span>Daily loss cap</span><b class="dn">₹' + f(c.capital * c.riskPct * 3 / 100, 0) + ' (3R)</b></div>' +
            '<div class="tes-note">F3: convert naked → spreads to cut SPAN margin. Stop trading for the day at the loss cap (no revenge/averaging).</div>' +
            '<h3 style="margin-top:12px">Expectancy (F12)</h3>' + expHtml + '</div>';
    }

    function renderJournal() {
        var j = journal();
        if (!j.length) return '<div class="tes-note">No trades logged yet.</div>';
        return j.slice().reverse().slice(0, 20).map(function (t) {
            return '<div class="tes-jrow"><span class="tes-tag">' + t.grade + '</span>' +
                '<b>' + t.name + '</b> <span class="' + (t.direction === 'LONG' ? '' : '') + '">' + t.direction + '</span>' +
                '<span style="color:#8b949e">@' + f(t.entry) + ' SL ' + f(t.sl) + ' T ' + f(t.t1) + '</span>' +
                '<span style="margin-left:auto;color:#6e7681">' + new Date(t.ts).toLocaleString() + '</span></div>';
        }).join('');
    }

    var lastResult = null, activeTab = 'edge';

    function paint() {
        if (activeTab === 'fno') jQ('#tes-result').html(renderFno());
        else jQ('#tes-result').html(lastResult ? renderResult(lastResult) : '<div class="tes-loading">Select an instrument and Scan.</div>');
    }

    function bind() {
        jQ(document).on('click', '#tes-fab', function () { jQ('#tes-panel').addClass('open'); if (!lastResult) run(); });
        jQ(document).on('click', '#tes-close', function () { jQ('#tes-panel').removeClass('open'); });
        jQ(document).on('click', '#tes-scan', run);
        jQ(document).on('change', '#tes-inst', run);
        jQ(document).on('click', '#tes-tab-edge', function () { activeTab = 'edge'; paint(); });
        jQ(document).on('click', '#tes-tab-fno', function () { activeTab = 'fno'; paint(); });
        jQ(document).on('change', '#tes-fview,#tes-fconv,#tes-fdte', function () {
            saveFno({ view: jQ('#tes-fview').val(), conv: jQ('#tes-fconv').val(), dte: +jQ('#tes-fdte').val() || 3 });
            jQ('#tes-result').html(renderFno());
        });
        jQ(document).on('change', '#tes-cap,#tes-risk,#tes-lev', function () {
            saveCfg({ capital: +jQ('#tes-cap').val() || 100000, riskPct: +jQ('#tes-risk').val() || 1, maxLeverage: +jQ('#tes-lev').val() || 5 });
            if (lastResult) jQ('#tes-result').html(renderResult(lastResult));
        });
        jQ(document).on('click', '#tes-copyai', function () { var t = document.getElementById('tes-aiprompt'); t.select(); document.execCommand('copy'); this.textContent = 'Copied ✓'; });
        jQ(document).on('click', '#tes-log', function () {
            if (!lastResult || !lastResult.plan) return;
            var j = journal();
            j.push({ ts: Date.now(), name: lastResult.name, grade: lastResult.grade, direction: lastResult.direction,
                entry: lastResult.plan.entry, sl: lastResult.plan.sl, t1: lastResult.plan.t1, conviction: lastResult.conviction });
            saveJournal(j); this.textContent = 'Logged ✓'; jQ('#tes-jbody').html(renderJournal());
        });
        jQ(document).on('click', '#tes-jclear', function () { if (confirm('Clear journal?')) { saveJournal([]); jQ('#tes-jbody').html(renderJournal()); } });
    }

    function run() {
        var name = jQ('#tes-inst').val() || TES.instrumentList()[0];
        jQ('#tes-result').html('<div class="tes-loading">Scanning ' + name + ' — pulling 5m/15m/daily + VIX, running confluence…</div>');
        TES.analyze(name).then(function (r) { lastResult = r; activeTab = activeTab === 'fno' ? 'fno' : 'edge'; paint(); });
    }

    function build() {
        injectCSS();
        var c = cfg();
        var opts = TES.instrumentList().map(function (n) { return '<option value="' + n + '">' + n + '</option>'; }).join('');
        var fab = document.createElement('button'); fab.id = 'tes-fab'; fab.textContent = 'TES'; fab.title = 'Triple Edge System';
        document.body.appendChild(fab);
        var panel = document.createElement('div'); panel.id = 'tes-panel';
        panel.innerHTML =
            '<div class="tes-head">' +
                '<h2>⚡ TRIPLE EDGE SYSTEM</h2><span class="sub">TA · SMC · Profile · OI · AI · Risk</span>' +
                'Instrument: <select id="tes-inst">' + opts + '</select>' +
                '<button class="tes-btn" id="tes-scan">Scan A+ Setup</button>' +
                '<button class="tes-btn sec" id="tes-tab-edge">Triple Edge</button>' +
                '<button class="tes-btn sec" id="tes-tab-fno">F&amp;O Mastery</button>' +
                '<span class="sub">|  Cap ₹<input id="tes-cap" type="number" style="width:90px" value="' + c.capital + '"> ' +
                'Risk%<input id="tes-risk" type="number" step="0.25" style="width:55px" value="' + c.riskPct + '"> ' +
                'Lev<input id="tes-lev" type="number" style="width:45px" value="' + c.maxLeverage + '">x</span>' +
                '<button class="tes-x" id="tes-close">×</button>' +
            '</div>' +
            '<div class="tes-body" id="tes-result"><div class="tes-loading">Select an instrument and Scan.</div></div>' +
            '<div style="border-top:1px solid #30363d;background:#161b22;padding:10px 14px;max-height:160px;overflow:auto">' +
                '<div style="display:flex;align-items:center;gap:10px"><h3 style="margin:0;font-size:12px;color:#8b949e;text-transform:uppercase">Trade Journal (M12)</h3>' +
                '<button class="tes-btn sec" id="tes-jclear" style="margin-left:auto">Clear</button></div>' +
                '<div id="tes-jbody" style="margin-top:6px">' + renderJournal() + '</div>' +
            '</div>';
        document.body.appendChild(panel);
        bind();
    }

    function init() {
        if (!window.jQuery) { setTimeout(init, 800); return; }
        jQ = window.jQuery;
        if (document.getElementById('tes-fab')) return;
        build();
        if (window.GM_registerMenuCommand) GM_registerMenuCommand('Open Triple Edge System', function () { jQ('#tes-panel').addClass('open'); run(); });
    }
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(init, 1500);
    else window.addEventListener('load', function () { setTimeout(init, 1500); });
})();
