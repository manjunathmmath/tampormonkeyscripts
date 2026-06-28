// ── Trend Probability Engine ──────────────────────────────────────────────────
function _btRenderPrediction() {
    var opens = _btOpens(), ltps = _btLtps();
    var signals = [];

    // Signal 1: Composite Score (avg of all 9 instruments) -- weight 3
    (function() {
        var total = 0, count = 0;
        _BT_INSTR.forEach(function(inst) {
            try { total += computeInstrumentScore(inst.name).total; count++; } catch(e) {}
        });
        var avg = count ? (total / count) : 0;
        var dir = avg >= 2 ? 'bull' : avg <= -2 ? 'bear' : 'neutral';
        signals.push({
            key: 'score', label: 'Composite Score', icon: 'bi-speedometer2',
            dir: dir, weight: 3, strength: Math.min(1, Math.abs(avg) / 8),
            detail: 'Avg score ' + _btSign(avg) + avg.toFixed(1) + ' across 9 instruments',
            value: _btSign(avg) + avg.toFixed(1)
        });
    })();

    // Signal 2: Relative Strength -- weight 2
    (function() {
        var pos = 0, neg = 0;
        _BT_INSTR.forEach(function(inst) {
            var ltp  = parseFloat((ltps[inst.name]  || {}).ltp   || 0);
            var open = parseFloat((opens[inst.name] || {}).price || 0);
            if (!ltp || !open) return;
            if (ltp > open) pos++; else if (ltp < open) neg++;
        });
        var total = pos + neg || 1;
        var bp = pos / total;
        var dir = bp >= 0.6 ? 'bull' : bp <= 0.4 ? 'bear' : 'neutral';
        signals.push({
            key: 'relstr', label: 'Relative Strength', icon: 'bi-bar-chart-steps',
            dir: dir, weight: 2, strength: Math.abs(bp - 0.5) * 2,
            detail: pos + ' of ' + (pos+neg) + ' instruments above open (' + (bp*100).toFixed(0) + '%)',
            value: pos + '/' + (pos+neg)
        });
    })();

    // Signal 3: Market Breadth -- weight 2
    (function() {
        var all = Object.assign({}, NIFTY_50_WEIGHTED_STOCKS, NIFTY_BANK_WEIGHTED_STOCKS);
        var above = 0, below = 0;
        jQ.each(all, function(name) {
            var ltp  = parseFloat((ltps[name]  || {}).ltp   || 0);
            var open = parseFloat((opens[name] || {}).price || 0);
            if (!ltp || !open) return;
            if (ltp > open) above++; else if (ltp < open) below++;
        });
        var total = above + below || 1;
        var bp = above / total;
        var dir = bp >= 0.6 ? 'bull' : bp <= 0.4 ? 'bear' : 'neutral';
        signals.push({
            key: 'breadth', label: 'Market Breadth', icon: 'bi-distribute-horizontal',
            dir: dir, weight: 2, strength: Math.abs(bp - 0.5) * 2,
            detail: above + ' of ' + (above+below) + ' F&O stocks above open (' + (bp*100).toFixed(0) + '%)',
            value: (bp*100).toFixed(0) + '% above'
        });
    })();

    // Signal 4: Strike Zone dominance -- weight 2
    (function() {
        var all = Object.assign({}, NIFTY_50_WEIGHTED_STOCKS, NIFTY_BANK_WEIGHTED_STOCKS);
        var aso = 0, bso = 0;
        jQ.each(all, function(name) {
            try { var ct = computeInstrumentScore(name).current_trend; if (ct > 0) aso++; else if (ct < 0) bso++; } catch(e) {}
        });
        var total = aso + bso || 1;
        var bp = aso / total;
        var dir = bp >= 0.6 ? 'bull' : bp <= 0.4 ? 'bear' : 'neutral';
        signals.push({
            key: 'zone', label: 'Strike Zone', icon: 'bi-crosshair',
            dir: dir, weight: 2, strength: Math.abs(bp - 0.5) * 2,
            detail: 'ASO+ ' + aso + ' vs BSO- ' + bso + ' in F&O universe',
            value: 'ASO ' + aso + ' / BSO ' + bso
        });
    })();

    // Signal 5: Options Flow -- weight 3
    (function() {
        var netCE = 0, netPE = 0, hasData = false;
        ['NIFTY 50','NIFTY BANK','RELIANCE','HDFCBANK','ICICIBANK'].forEach(function(name) {
            var sm = INSTRUMENT_SCORE_MAP[name];
            if (!sm || !sm.oiData || !sm.oiData.tableData) return;
            hasData = true;
            sm.oiData.tableData.forEach(function(row) {
                netCE += parseFloat(row.CHG_OI_CE || 0);
                netPE += parseFloat(row.CHG_OI_PE || 0);
            });
        });
        if (!hasData) {
            signals.push({ key:'flow', label:'Options Flow', icon:'bi-arrows-collapse',
                dir:'neutral', weight:3, strength:0,
                detail:'OI data not yet loaded -- refresh first', value:'N/A' });
            return;
        }
        var net = netPE - netCE;
        var scale = Math.max(Math.abs(netPE), Math.abs(netCE)) || 1;
        var dir = net > scale * 0.1 ? 'bull' : net < -scale * 0.1 ? 'bear' : 'neutral';
        signals.push({
            key: 'flow', label: 'Options Flow', icon: 'bi-arrows-collapse',
            dir: dir, weight: 3, strength: Math.min(1, Math.abs(net) / scale),
            detail: 'Net PE ' + _btSign(netPE) + _btFmt(netPE) + ' | Net CE ' + _btSign(netCE) + _btFmt(netCE),
            value: net > 0 ? 'PE dominant' : net < 0 ? 'CE dominant' : 'Balanced'
        });
    })();

    // Signal 6: VIX confidence modifier
    var vixMod = 1.0;
    (function() {
        var v = 0;
        try { v = parseFloat((ltps['INDIA VIX'] || {}).ltp) || 0; } catch(e) {}
        if (!v) try { v = VIX || 0; } catch(e) {}
        vixMod = v < 13 ? 1.15 : v < 18 ? 1.0 : v < 25 ? 0.85 : 0.65;
        var detail = v < 13  ? 'Low VIX ' + v.toFixed(1) + ' -- trend day likely, signals amplified'
                   : v < 18  ? 'Normal VIX ' + v.toFixed(1) + ' -- balanced conviction'
                   : v < 25  ? 'Elevated VIX ' + v.toFixed(1) + ' -- wider swings, lower conviction'
                              : 'High VIX ' + v.toFixed(1) + ' -- choppy; reducing confidence';
        signals.push({ key:'vix', label:'VIX Regime', icon:'bi-activity',
            dir:'neutral', weight:0, strength:0,
            detail: detail, value: (v ? v.toFixed(1) : '--'), isVix: true, vixMod: vixMod });
    })();

    // Aggregate
    var bullW = 0, bearW = 0;
    signals.forEach(function(sig) {
        if (sig.isVix || sig.weight === 0) return;
        var w = sig.weight * (0.5 + sig.strength * 0.5);
        if (sig.dir === 'bull') bullW += w;
        else if (sig.dir === 'bear') bearW += w;
        else { bullW += sig.weight * 0.5; bearW += sig.weight * 0.5; }
    });
    var raw = (bullW + bearW) > 0 ? bullW / (bullW + bearW) : 0.5;
    var bullPct = Math.max(0.05, Math.min(0.95, 0.5 + (raw - 0.5) * vixMod));
    var bearPct = 1 - bullPct;
    var confidence = Math.round(Math.abs(bullPct - 0.5) * 200);

    var verdict, vCol, vIcon;
    if      (bullPct >= 0.70) { verdict = 'STRONGLY BULLISH'; vCol = '#3fb950'; vIcon = 'bi-arrow-up-circle-fill'; }
    else if (bullPct >= 0.58) { verdict = 'BULLISH';          vCol = '#3fb950'; vIcon = 'bi-arrow-up-circle'; }
    else if (bullPct >= 0.52) { verdict = 'MILDLY BULLISH';   vCol = '#86efac'; vIcon = 'bi-arrow-up-right-circle'; }
    else if (bullPct >= 0.48) { verdict = 'NEUTRAL';          vCol = '#7d8590'; vIcon = 'bi-dash-circle'; }
    else if (bullPct >= 0.42) { verdict = 'MILDLY BEARISH';   vCol = '#fca5a5'; vIcon = 'bi-arrow-down-right-circle'; }
    else if (bullPct >= 0.30) { verdict = 'BEARISH';          vCol = '#f85149'; vIcon = 'bi-arrow-down-circle'; }
    else                      { verdict = 'STRONGLY BEARISH'; vCol = '#f85149'; vIcon = 'bi-arrow-down-circle-fill'; }

    // SVG gauge
    var r = 54, cx = 70, cy = 65;
    function polarX(deg) { return cx + r * Math.cos((180 - deg) * Math.PI / 180); }
    function polarY(deg) { return cy - r * Math.sin((180 - deg) * Math.PI / 180); }
    var angle = bullPct * 180;
    var midX = polarX(90), midY = polarY(90);
    var nX = polarX(angle), nY = polarY(angle);
    var bigArc = angle > 180 ? 1 : 0;
    var gaugeHtml = '<svg viewBox="0 0 140 74" class="bt-pred-gauge">'
        + '<path d="M ' + polarX(0) + ' ' + polarY(0) + ' A ' + r + ' ' + r + ' 0 0 1 ' + midX + ' ' + midY + '" fill="none" stroke="#f8514940" stroke-width="9" stroke-linecap="round"/>'
        + '<path d="M ' + midX + ' ' + midY + ' A ' + r + ' ' + r + ' 0 0 1 ' + polarX(180) + ' ' + polarY(180) + '" fill="none" stroke="#3fb95040" stroke-width="9" stroke-linecap="round"/>'
        + (angle > 1 ? '<path d="M ' + polarX(0) + ' ' + polarY(0) + ' A ' + r + ' ' + r + ' 0 ' + bigArc + ' 1 ' + nX + ' ' + nY + '" fill="none" stroke="' + vCol + '" stroke-width="9" stroke-linecap="round"/>' : '')
        + '<line x1="' + cx + '" y1="' + cy + '" x2="' + nX + '" y2="' + nY + '" stroke="var(--gtb-text)" stroke-width="2" stroke-linecap="round"/>'
        + '<circle cx="' + cx + '" cy="' + cy + '" r="4" fill="var(--gtb-text)"/>'
        + '<text x="10" y="73" font-size="7" fill="#f85149" font-family="monospace">BEAR</text>'
        + '<text x="99" y="73" font-size="7" fill="#3fb950" font-family="monospace">BULL</text>'
        + '<text x="' + cx + '" y="' + (cy + 2) + '" text-anchor="middle" font-size="11" font-weight="bold" fill="' + vCol + '" font-family="monospace">' + (bullPct*100).toFixed(0) + '%</text>'
        + '</svg>';

    var dCol = { bull:'#3fb950', bear:'#f85149', neutral:'#7d8590' };
    var dLbl = { bull:'&#9650; BULL', bear:'&#9660; BEAR', neutral:'&#9679; NEUTRAL' };
    var sigRows = '';
    signals.forEach(function(sig) {
        var dc = dCol[sig.dir];
        var barW = sig.dir !== 'neutral' ? Math.round(sig.strength * 100) : 0;
        sigRows += '<div class="bt-pred-sig-row">'
            + '<i class="bi ' + sig.icon + ' bt-pred-sig-icon"></i>'
            + '<span class="bt-pred-sig-label">' + sig.label + '</span>'
            + '<span class="bt-pred-sig-badge" style="color:' + dc + ';background:' + dc + '18;border-color:' + dc + '44;">' + dLbl[sig.dir] + '</span>'
            + '<div class="bt-pred-bar-wrap"><div class="bt-pred-bar" style="width:' + barW + '%;background:' + dc + ';"></div></div>'
            + '<span class="bt-pred-val">' + sig.value + '</span>'
            + '<span class="bt-pred-detail">' + sig.detail + '</span>'
            + '</div>';
    });

    var h = '<div class="bt-pred-wrap">'
        + '<div class="bt-pred-left">'
        +   gaugeHtml
        +   '<div class="bt-pred-verdict" style="color:' + vCol + '"><i class="bi ' + vIcon + '"></i> ' + verdict + '</div>'
        +   '<div class="bt-pred-probs">'
        +     '<b style="color:#3fb950;">' + (bullPct*100).toFixed(0) + '%</b><span style="color:var(--gtb-muted)"> bull</span>'
        +     '<span class="bt-pred-sep">&middot;</span>'
        +     '<b style="color:#f85149;">' + (bearPct*100).toFixed(0) + '%</b><span style="color:var(--gtb-muted)"> bear</span>'
        +   '</div>'
        +   '<div class="bt-pred-conf">'
        +     '<div class="bt-pred-conf-row"><span style="color:var(--gtb-muted);font-size:0.52rem;">CONFIDENCE</span><span style="font-size:0.6rem;">' + confidence + '/100</span></div>'
        +     '<div class="bt-pred-conf-track"><div class="bt-pred-conf-bar" style="width:' + confidence + '%;background:' + vCol + ';"></div></div>'
        +   '</div>'
        +   '<div style="color:var(--gtb-muted);font-size:0.5rem;margin-top:5px;line-height:1.5;">'
        +     'VIX modifier: <b>x' + vixMod.toFixed(2) + '</b>'
        +     (vixMod < 1 ? ' -- reducing conviction' : vixMod > 1 ? ' -- amplifying trend' : '')
        +   '</div>'
        + '</div>'
        + '<div class="bt-pred-right">'
        +   '<div class="bt-pred-sig-hdr"><span>Signal</span><span>Direction</span><span>Strength</span><span>Value</span><span>Detail</span></div>'
        +   sigRows
        + '</div>'
        + '</div>';

    jQ('#bt-pred-body').html(h);
}

// ── Per-Instrument Multi-Angle Trade Analysis ─────────────────────────────────
jQ(document).off('click.bt-analyze').on('click.bt-analyze', '.bt-analyze-btn', function(e) {
    e.preventDefault();
    // If triggered from inside the maximize overlay, close it first so popup appears on top
    if (jQ(this).closest('#groot-maximize-overlay').length) jQ('#groot-maximize-overlay').hide();
    if (typeof _gtbOpenInstrDetailFor === 'function') _gtbOpenInstrDetailFor(jQ(this).data('name'));
    else _btAnalyzeInstrument(jQ(this).data('name'));
});

function _btAnalyzeInstrument(name, targetEl) {
    var opens  = _btOpens(), ltps = _btLtps();
    var ltp    = parseFloat((ltps[name]  || {}).ltp      || 0);
    var open   = parseFloat((opens[name] || {}).price    || 0);

    var tr = null;
    try { tr = generateTrend(name); } catch(e) {}

    var cs = { nine_fifteen: 0, current_trend: 0, futures_trend: 0, oi_obv: 0, total: 0 };
    try { cs = computeInstrumentScore(name); } catch(e) {}

    var aso  = tr ? parseFloat(tr.strikeData.ustrikeOne) : null;
    var ast  = tr ? parseFloat(tr.strikeData.ustrikeTwo) : null;
    var bso  = tr ? parseFloat(tr.strikeData.bstrikeOne) : null;
    var bst  = tr ? parseFloat(tr.strikeData.bstrikeTwo) : null;
    var vixL = tr ? parseFloat(tr.vix.vixDDLower)        : null;
    var vixU = tr ? parseFloat(tr.vix.vixDDUpper)        : null;
    var openP = tr ? parseFloat(tr.open)                 : open;

    var nine15 = '';
    try { nine15 = (JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}')[name] || {}).CLOSE_9_15 || 'B/W'; } catch(e) {}

    var sm = INSTRUMENT_SCORE_MAP[name] || {};
    var futScore = sm.futures_trend || 0;
    var futRemarkText = futScore > 0 ? 'Long Buildup / Short Covering' : futScore < 0 ? 'Short Buildup / Long Unwinding' : 'Neutral / Unknown';

    var oiData = sm.oiData || null;
    var pcr    = sm.pcr    || null;
    var chPcr  = sm.chPcr  || null;

    var vixVal = 0;
    try { vixVal = parseFloat((ltps['INDIA VIX'] || {}).ltp) || 0; } catch(e) {}
    if (!vixVal) try { vixVal = VIX || 0; } catch(e) {}

    var f2 = function(v) { return v != null ? parseFloat(v).toLocaleString('en-IN', {maximumFractionDigits:2}) : '--'; };
    var zoneCss = function(z) {
        return (z === 'AST' || z === 'ASO') ? '#3fb950' : (z === 'BST' || z === 'BSO') ? '#f85149' : '#7d8590';
    };
    var scorePill = function(v, label) {
        var c = _btCol(v);
        return '<span class="bt-ta-pill" style="color:' + c + ';border-color:' + c + '44;background:' + c + '11;">'
            + label + ' ' + _btSign(v) + parseFloat(v).toFixed(1) + '</span>';
    };

    var zoneLabel = {'2':'AST','1':'ASO','0':'B/W','-1':'BSO','-2':'BST'}[String(cs.current_trend)] || 'B/W';
    var pct = open ? ((ltp - open) / open * 100) : 0;
    var pctCol = _btCol(pct);
    var strat  = _btStrategyFor(cs, nine15, zoneLabel, vixVal, name, aso, ast, bso, bst, ltp, vixL, vixU);

    var headerHtml = '<div class="bt-ta-header">'
        + '<div class="bt-ta-title">'
        +   '<span class="bt-ta-name">' + name + '</span>'
        +   '<span class="bt-ta-ltp">' + f2(ltp) + '</span>'
        +   '<span style="color:' + pctCol + ';font-size:0.72rem;">' + _btSign(pct) + pct.toFixed(2) + '% from open</span>'
        + '</div>'
        + '<div class="bt-ta-pills">'
        +   scorePill(cs.total,           'SCORE')
        +   scorePill(cs.nine_fifteen,    '9:15')
        +   scorePill(cs.futures_trend,   'FUT')
        +   scorePill(cs.oi_obv,          'OI/OBV')
        +   '<span class="bt-ta-pill" style="color:' + zoneCss(zoneLabel) + ';border-color:' + zoneCss(zoneLabel) + '44;background:' + zoneCss(zoneLabel) + '11;">ZONE ' + zoneLabel + '</span>'
        +   '<span class="bt-ta-pill" style="color:' + zoneCss(nine15) + ';border-color:' + zoneCss(nine15) + '44;background:' + zoneCss(nine15) + '11;">9:15 ' + nine15 + '</span>'
        + '</div>'
        + '</div>';

    var body = headerHtml
        + '<div class="bt-ta-card bt-ta-full"><div class="bt-ta-card-hdr"><i class="bi bi-map"></i> PRICE LEVEL MAP</div>'
        +   _btLevelMap(ltp, openP, vixL, bst, bso, aso, ast, vixU)
        + '</div>'
        + '<div class="bt-ta-card bt-ta-full"><div class="bt-ta-card-hdr"><i class="bi bi-lightbulb"></i> SUGGESTED SETUP</div>'
        +   strat.html
        + '</div>'
        + '<div class="bt-ta-card bt-ta-full"><div class="bt-ta-card-hdr"><i class="bi bi-play-circle"></i> ENTRY TRIGGERS</div>'
        +   _btEntryConditions(cs, zoneLabel, nine15, aso, ast, bso, bst)
        + '</div>'
        + '<div class="bt-ta-card bt-ta-full"><div class="bt-ta-card-hdr"><i class="bi bi-shield-exclamation"></i> RISK / REWARD</div>'
        +   _btRiskReward(strat, ltp, vixVal, aso, ast, bso, bst, vixL, vixU)
        + '</div>'
        + '<div class="bt-ta-card bt-ta-full"><div class="bt-ta-card-hdr"><i class="bi bi-bar-chart-fill"></i> OI &amp; FLOW</div>'
        +   _btOISummary(oiData, pcr, chPcr, name)
        + '</div>'
        + '<div class="bt-ta-card bt-ta-full"><div class="bt-ta-card-hdr"><i class="bi bi-signpost-split"></i> SCENARIO ANALYSIS</div>'
        +   _btScenarios(cs, zoneLabel, nine15, aso, ast, bso, bst, vixU, vixL, ltp)
        + '</div>';

    // Render into drawer if targetEl provided, otherwise use the maximize overlay
    var ov;
    if (targetEl) {
        jQ(targetEl).html('<div class="bt-ta-overlay-content" style="padding:4px 0;">' + body + '</div>');
        ov = jQ(targetEl)[0];
    } else {
        showMaximizeOverlay('Trade Analysis -- ' + name, body);
        ov = document.getElementById('groot-maximize-overlay');
    }
    setTimeout(function() {
        if (!ov) return;
        if (!targetEl) {
            jQ(ov).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
            jQ(ov).find('.gtb-maximize-content').addClass('bt-ta-overlay-content');
        }

        // Live OI fetch button handler
        jQ(ov).off('click.btoi').on('click.btoi', '.bt-oi-fetch-btn', function() {
            var $btn   = jQ(this);
            var iname  = $btn.data('name');
            var $panel = $btn.closest('.bt-ta-card');
            $btn.prop('disabled', true).html('<i class="bi bi-arrow-clockwise spin"></i> Fetching...');

            (async function() {
                try {
                    var oiData = await showTrendingOI(iname, 2);
                    if (!oiData || !oiData.tableData || !oiData.tableData.length) {
                        throw new Error('Empty OI response');
                    }
                    var oiScore = computeOIScoreFromData(oiData);
                    if (!INSTRUMENT_SCORE_MAP[iname]) INSTRUMENT_SCORE_MAP[iname] = {};
                    INSTRUMENT_SCORE_MAP[iname].oi_obv = oiScore;
                    INSTRUMENT_SCORE_MAP[iname].pcr    = oiData.pcr;
                    INSTRUMENT_SCORE_MAP[iname].chPcr  = oiData.chPcr;
                    INSTRUMENT_SCORE_MAP[iname].oiData = oiData;

                    // Re-render just the OI card
                    $panel.find('.bt-ta-card-hdr').nextAll().remove();
                    $panel.append(jQ(_btOISummary(oiData, oiData.pcr, oiData.chPcr, iname)));
                } catch(e) {
                    $btn.prop('disabled', false).html('<i class="bi bi-cloud-download"></i> Retry Fetch');
                    $panel.find('.bt-hint').text('Fetch failed: ' + (e.message || e) + ' -- check console');
                }
            })();
        });
    }, 30);
}

// ── Level Map ─────────────────────────────────────────────────────────────────
function _btLevelMap(ltp, open, vixL, bst, bso, aso, ast, vixU) {
    if (!ltp) return '<span class="bt-hint">No LTP data</span>';
    var levels = [];
    if (vixL) levels.push({ v: vixL, label: 'VIXL', col: '#38bdf8' });
    if (bst)  levels.push({ v: bst,  label: 'BST',  col: '#f85149' });
    if (bso)  levels.push({ v: bso,  label: 'BSO',  col: '#fca5a5' });
    if (open) levels.push({ v: open, label: 'OPEN', col: '#ffbe0b' });
    if (aso)  levels.push({ v: aso,  label: 'ASO',  col: '#86efac' });
    if (ast)  levels.push({ v: ast,  label: 'AST',  col: '#3fb950' });
    if (vixU) levels.push({ v: vixU, label: 'VIXU', col: '#38bdf8' });
    if (!levels.length) return '<span class="bt-hint">Level data not available -- refresh first</span>';

    levels.sort(function(a, b) { return a.v - b.v; });
    var min = levels[0].v, max = levels[levels.length - 1].v;
    var span = max - min || 1;
    min -= span * 0.08; max += span * 0.08; span = max - min;
    var pos = function(v) { return ((v - min) / span * 100).toFixed(2); };
    var f = function(v) {
        if (v >= 10000) return v.toLocaleString('en-IN', {maximumFractionDigits:0});
        if (v >= 100)   return v.toFixed(1);
        return v.toFixed(2);
    };

    var bsoP = bso ? pos(bso) : null, asoP = aso ? pos(aso) : null;
    var bstP = bst ? pos(bst) : null, astP = ast ? pos(ast) : null;
    var vixLP = vixL ? pos(vixL) : null, vixUP = vixU ? pos(vixU) : null;

    var zones = '';
    if (vixLP && bstP) zones += '<div class="bt-lm-zone" style="left:' + vixLP + '%;width:' + (parseFloat(bstP)-parseFloat(vixLP)) + '%;background:#f8514920;"></div>';
    if (bstP  && bsoP) zones += '<div class="bt-lm-zone" style="left:' + bstP  + '%;width:' + (parseFloat(bsoP)-parseFloat(bstP))  + '%;background:#f8514930;"></div>';
    if (bsoP  && asoP) zones += '<div class="bt-lm-zone" style="left:' + bsoP  + '%;width:' + (parseFloat(asoP)-parseFloat(bsoP))  + '%;background:#7d859015;"></div>';
    if (asoP  && astP) zones += '<div class="bt-lm-zone" style="left:' + asoP  + '%;width:' + (parseFloat(astP)-parseFloat(asoP))  + '%;background:#3fb95030;"></div>';
    if (astP  && vixUP)zones += '<div class="bt-lm-zone" style="left:' + astP  + '%;width:' + (parseFloat(vixUP)-parseFloat(astP))  + '%;background:#3fb95020;"></div>';

    var markers = levels.map(function(l) {
        var p = pos(l.v);
        return '<div class="bt-lm-marker" style="left:' + p + '%;">'
            + '<div class="bt-lm-line" style="background:' + l.col + ';"></div>'
            + '<div class="bt-lm-tag" style="color:' + l.col + ';">' + l.label + '<br><span class="bt-lm-val">' + f(l.v) + '</span></div>'
            + '</div>';
    }).join('');

    var ltpP = pos(ltp);
    var ltpCol = ltp >= (aso||0) ? '#3fb950' : ltp <= (bso||Infinity) ? '#f85149' : '#ffbe0b';
    var ltpArrow = '<div class="bt-lm-ltp" style="left:' + ltpP + '%;">'
        + '<div class="bt-lm-ltp-val" style="color:' + ltpCol + ';">LTP ' + f(ltp) + '</div>'
        + '<div class="bt-lm-ltp-line" style="background:' + ltpCol + ';"></div>'
        + '<div class="bt-lm-ltp-arrow" style="border-top-color:' + ltpCol + ';"></div>'
        + '</div>';

    return '<div class="bt-lm-wrap"><div class="bt-lm-bar">' + zones + markers + ltpArrow + '</div></div>'
        + '<div class="bt-lm-legend">' + levels.map(function(l) {
            var dist = ltp ? ((ltp - l.v) >= 0 ? '+' : '') + (ltp - l.v).toFixed(1) + ' from LTP' : '';
            return '<span class="bt-lm-leg-item"><span class="bt-lm-dot" style="background:' + l.col + ';"></span>'
                + '<b style="color:' + l.col + '">' + l.label + '</b> ' + f(l.v)
                + '<span class="bt-lm-dist">' + dist + '</span></span>';
        }).join('') + '</div>';
}

// ── Signal Confluence ─────────────────────────────────────────────────────────
function _btConfluenceCard(cs, nine15, zone, futRemark) {
    var rows = [
        { label: '9:15 Candle',  val: nine15,                          score: cs.nine_fifteen,  hint: 'First candle relative to strike levels' },
        { label: 'Current Zone', val: zone,                            score: cs.current_trend > 0 ? 1 : cs.current_trend < 0 ? -1 : 0, hint: 'Where LTP sits vs ASO/AST/BSO/BST' },
        { label: 'Futures',      val: futRemark.split('/')[0].trim(),  score: cs.futures_trend, hint: 'Futures positioning and direction' },
        { label: 'OI / OBV',    val: cs.oi_obv > 0 ? 'Bullish OI' : cs.oi_obv < 0 ? 'Bearish OI' : 'Neutral', score: cs.oi_obv > 0 ? 1 : cs.oi_obv < 0 ? -1 : 0, hint: 'Options OI and On-Balance Volume' },
    ];
    var h = '<div class="bt-conf-rows">';
    rows.forEach(function(r) {
        var col  = r.score > 0 ? '#3fb950' : r.score < 0 ? '#f85149' : '#7d8590';
        var icon = r.score > 0 ? 'bi-check-circle-fill' : r.score < 0 ? 'bi-x-circle-fill' : 'bi-dash-circle';
        h += '<div class="bt-conf-row" title="' + r.hint + '">'
            + '<i class="bi ' + icon + '" style="color:' + col + ';"></i>'
            + '<span class="bt-conf-label">' + r.label + '</span>'
            + '<span class="bt-conf-val" style="color:' + col + '">' + r.val + '</span>'
            + '</div>';
    });
    h += '</div>';

    var bullCount = rows.filter(function(r) { return r.score > 0; }).length;
    var bearCount = rows.filter(function(r) { return r.score < 0; }).length;
    var align = bullCount === 4 ? 'FULLY ALIGNED -- BULLISH'
        : bearCount === 4 ? 'FULLY ALIGNED -- BEARISH'
        : bullCount >= 3  ? 'MOSTLY BULLISH'
        : bearCount >= 3  ? 'MOSTLY BEARISH'
        : bullCount === bearCount ? 'CONFLICTED / MIXED'
        : bullCount > bearCount   ? 'LEAN BULLISH' : 'LEAN BEARISH';
    var alignCol = bullCount > bearCount ? '#3fb950' : bearCount > bullCount ? '#f85149' : '#7d8590';

    h += '<div class="bt-conf-summary" style="border-color:' + alignCol + '44;background:' + alignCol + '11;margin-top:6px;">'
        + '<span style="color:' + alignCol + ';font-weight:700;font-size:0.65rem;">' + align + '</span>'
        + '<div class="bt-conf-bar-wrap" style="margin-top:4px;">'
        +   '<div class="bt-conf-bar-fill" style="width:' + (bullCount/4*100) + '%;background:#3fb950;height:4px;border-radius:2px;"></div>'
        +   '<div class="bt-conf-bar-fill" style="width:' + (bearCount/4*100) + '%;background:#f85149;height:4px;border-radius:2px;margin-top:2px;"></div>'
        + '</div>'
        + '<span style="color:var(--gtb-muted);font-size:0.52rem;">' + bullCount + '/4 bull &nbsp; ' + bearCount + '/4 bear</span>'
        + '</div>';
    return h;
}

// ── Strategy Recommendation ───────────────────────────────────────────────────
function _btStrategyFor(cs, nine15, zone, vixVal, name, aso, ast, bso, bst, ltp, vixL, vixU) {
    var total   = cs.total;
    var isIndex = ['NIFTY 50','NIFTY BANK','GIFT NIFTY','SENSEX'].indexOf(name) >= 0;
    var vixWide = vixVal > 18;
    var isBull  = total > 0, isBear = total < 0;

    var dirLabel = total >= 6 ? 'STRONG BULL' : total >= 3 ? 'BULL' : total >= 1 ? 'MILD BULL'
                 : total <= -6 ? 'STRONG BEAR' : total <= -3 ? 'BEAR' : total <= -1 ? 'MILD BEAR' : 'NEUTRAL';
    var dirCol  = isBull ? '#3fb950' : isBear ? '#f85149' : '#7d8590';
    var dirIcon = isBull ? 'bi-arrow-up-right' : isBear ? 'bi-arrow-down-right' : 'bi-arrow-left-right';

    var strats = [];
    if (isIndex) {
        if      (total >= 6)  strats = [
            { name:'CE Buy (ITM)',       risk:'HIGH', reward:'HIGH', note:'Buy 1 strike below ATM CE for strong momentum continuation' },
            { name:'PE Sell (OTM)',      risk:'MED',  reward:'MED',  note:'Sell 1-2 strikes below BSO, SL if price breaks BSO' },
        ];
        else if (total >= 3)  strats = [
            { name:'CE Buy (ATM)',       risk:'MED',  reward:'HIGH', note:'Buy ATM CE, target AST or VIXU' },
            { name:'Bull Call Spread',   risk:'LOW',  reward:'MED',  note:'Buy ATM CE + Sell 1 strike above, defined risk' },
        ];
        else if (total >= 1)  strats = [
            { name:'CE Buy (OTM)',       risk:'LOW',  reward:'MED',  note:'Small position only. Wait for ASO breakout confirmation first' },
        ];
        else if (total <= -6) strats = [
            { name:'PE Buy (ITM)',       risk:'HIGH', reward:'HIGH', note:'Buy 1 strike above ATM PE for strong breakdown continuation' },
            { name:'CE Sell (OTM)',      risk:'MED',  reward:'MED',  note:'Sell 1-2 strikes above BSO, SL if price reclaims BSO' },
        ];
        else if (total <= -3) strats = [
            { name:'PE Buy (ATM)',       risk:'MED',  reward:'HIGH', note:'Buy ATM PE, target BST or VIXL' },
            { name:'Bear Put Spread',    risk:'LOW',  reward:'MED',  note:'Buy ATM PE + Sell 1 strike below, defined risk' },
        ];
        else if (total <= -1) strats = [
            { name:'PE Buy (OTM)',       risk:'LOW',  reward:'MED',  note:'Small position only. Wait for BSO breakdown confirmation first' },
        ];
        else strats = [
            { name:'Iron Condor',        risk:'LOW',  reward:'LOW',  note:'Sell OTM CE + OTM PE, collect premium in range-bound session' },
            { name:'WAIT',               risk:'--',   reward:'--',   note:'No directional bias. Watch for breakout above ASO or below BSO' },
        ];
    } else {
        if      (isBull) strats = [{ name:'Long CE / Stock Buy', risk:'MED', reward:'HIGH', note:'Entry on pullback to ASO, SL below BSO' }];
        else if (isBear) strats = [{ name:'Long PE / Stock Sell', risk:'MED', reward:'HIGH', note:'Entry on bounce to BSO, SL above ASO' }];
        else strats = [{ name:'WAIT', risk:'--', reward:'--', note:'Mixed signals -- wait for trend confirmation' }];
    }

    var vixNote = vixWide
        ? '<div class="bt-ta-warning"><i class="bi bi-exclamation-triangle"></i> Elevated VIX (' + vixVal.toFixed(1) + ') -- use wider SL, reduce position size by ~30%</div>'
        : '';
    var conflictNote = '';
    if ((nine15==='AST'||nine15==='ASO') && (zone==='BSO'||zone==='BST'))
        conflictNote = '<div class="bt-ta-warning"><i class="bi bi-exclamation-triangle"></i> Bullish 9:15 but price has fallen back to ' + zone + ' -- trend reversal risk</div>';
    else if ((nine15==='BST'||nine15==='BSO') && (zone==='ASO'||zone==='AST'))
        conflictNote = '<div class="bt-ta-warning"><i class="bi bi-exclamation-triangle"></i> Bearish 9:15 but price recovered to ' + zone + ' -- short-squeeze risk</div>';

    var stratRows = strats.map(function(s) {
        var rCol = s.risk==='HIGH' ? '#f85149' : s.risk==='MED' ? '#fbbf24' : s.risk==='LOW' ? '#3fb950' : '#7d8590';
        return '<div class="bt-ta-strat-row">'
            + '<div class="bt-ta-strat-name"><i class="bi bi-arrow-right-circle" style="color:' + dirCol + '"></i> <b>' + s.name + '</b></div>'
            + '<div class="bt-ta-strat-meta"><span class="bt-ta-risk-tag" style="color:' + rCol + ';border-color:' + rCol + '44;background:' + rCol + '11;">RISK ' + s.risk + '</span><span class="bt-ta-risk-tag" style="color:#7d8590;border-color:#7d859044;background:#7d859011;">REWARD ' + s.reward + '</span></div>'
            + '<div class="bt-ta-strat-note">' + s.note + '</div>'
            + '</div>';
    }).join('');

    return {
        direction: dirLabel, dirCol: dirCol,
        html: '<div class="bt-ta-direction" style="color:' + dirCol + '"><i class="bi ' + dirIcon + '"></i> ' + dirLabel + '</div>'
            + vixNote + conflictNote + stratRows
    };
}

// ── Entry Triggers ────────────────────────────────────────────────────────────
function _btEntryConditions(cs, zone, nine15, aso, ast, bso, bst) {
    var isBull = cs.total > 0, isBear = cs.total < 0;
    var triggers = [], cautions = [];
    var f = function(v) { return v != null ? parseFloat(v).toLocaleString('en-IN', {maximumFractionDigits:1}) : '--'; };

    if (isBull) {
        if (zone==='B/W'||zone==='BSO'||zone==='BST') {
            triggers.push('Price reclaims and closes above BSO (' + f(bso) + ') on a 5-min candle');
            triggers.push('Price sustains above ASO (' + f(aso) + ') for 2 consecutive candles');
        } else if (zone==='ASO') {
            triggers.push('Price holds ASO (' + f(aso) + ') on a pullback -- buy the dip');
            triggers.push('Price breaks AST (' + f(ast) + ') on strong volume -- add position');
        } else {
            triggers.push('Price holds AST (' + f(ast) + ') on a throwback -- add or hold');
            triggers.push('Strong momentum -- AST retest is a valid entry');
        }
        cautions.push('Do not enter if price slips below ASO (' + f(aso) + ')');
        cautions.push('Avoid chasing more than 0.3% above ASO without a dip');
    } else if (isBear) {
        if (zone==='B/W'||zone==='ASO'||zone==='AST') {
            triggers.push('Price breaks and closes below BSO (' + f(bso) + ') on a 5-min candle');
            triggers.push('Bounce to BSO (' + f(bso) + ') rejected -- sell the rip');
        } else if (zone==='BSO') {
            triggers.push('Price holds below BSO (' + f(bso) + ') on any bounce -- add shorts');
            triggers.push('Price breaks BST (' + f(bst) + ') -- add to position');
        } else {
            triggers.push('Price holds below BST (' + f(bst) + ') -- continuation likely');
            triggers.push('Bounce to BSO (' + f(bso) + ') is a sell opportunity');
        }
        cautions.push('Exit if price reclaims BSO (' + f(bso) + ') with a 5-min close above');
        cautions.push('Cover if price crosses ASO (' + f(aso) + ')');
    } else {
        triggers.push('Wait for decisive break above ASO (' + f(aso) + ') with close above for long');
        triggers.push('Wait for decisive break below BSO (' + f(bso) + ') with close below for short');
        cautions.push('B/W zone -- high risk of chop. Reduce size significantly');
        cautions.push('Avoid intra-range trades unless scalping with very tight SL');
    }

    if (nine15==='ASO'||nine15==='AST') triggers.push('9:15 bullish -- any dip to ASO (' + f(aso) + ') is a buy opportunity');
    if (nine15==='BSO'||nine15==='BST') triggers.push('9:15 bearish -- any bounce to BSO (' + f(bso) + ') is a sell opportunity');

    var h = '<div class="bt-ta-triggers">';
    if (triggers.length) {
        h += '<div class="bt-ta-trig-hdr" style="color:#3fb950;">Entry Conditions</div>';
        triggers.forEach(function(t) { h += '<div class="bt-ta-trig-row"><i class="bi bi-check" style="color:#3fb950;flex-shrink:0;"></i> ' + t + '</div>'; });
    }
    if (cautions.length) {
        h += '<div class="bt-ta-trig-hdr" style="color:#fbbf24;margin-top:6px;">Cautions</div>';
        cautions.forEach(function(c) { h += '<div class="bt-ta-trig-row"><i class="bi bi-exclamation" style="color:#fbbf24;flex-shrink:0;"></i> ' + c + '</div>'; });
    }
    return h + '</div>';
}

// ── Risk / Reward ─────────────────────────────────────────────────────────────
function _btRiskReward(strat, ltp, vixVal, aso, ast, bso, bst, vixL, vixU) {
    if (!ltp) return '<span class="bt-hint">No LTP data</span>';
    var isBull = strat.direction.indexOf('BULL') >= 0;
    var isBear = strat.direction.indexOf('BEAR') >= 0;
    var f = function(v) { return v != null ? parseFloat(v).toLocaleString('en-IN', {maximumFractionDigits:1}) : '--'; };
    var vixSlMult = vixVal > 25 ? 1.6 : vixVal > 18 ? 1.3 : 1.0;

    var entry, sl, tgt1, tgt2, rr1 = '--';
    if (isBull) {
        entry = aso || ltp;
        sl    = bso ? bso * 0.999 : entry * (1 - 0.003 * vixSlMult);
        tgt1  = ast || (entry * 1.005);
        tgt2  = vixU || (entry * 1.01);
        var risk = entry - sl, rwd1 = tgt1 - entry;
        if (risk > 0) rr1 = (rwd1 / risk).toFixed(1);
    } else if (isBear) {
        entry = bso || ltp;
        sl    = aso ? aso * 1.001 : entry * (1 + 0.003 * vixSlMult);
        tgt1  = bst || (entry * 0.995);
        tgt2  = vixL || (entry * 0.99);
        var risk = sl - entry, rwd1 = entry - tgt1;
        if (risk > 0) rr1 = (rwd1 / risk).toFixed(1);
    } else {
        return '<div class="bt-hint" style="padding:8px;">No clear bias -- compute R/R once breakout is confirmed</div>'
            + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">Watch ASO</span><span>' + f(aso) + '</span></div>'
            + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">Watch BSO</span><span>' + f(bso) + '</span></div>';
    }

    var slPct  = (sl    && entry) ? Math.abs((sl-entry)/entry*100).toFixed(2) : '--';
    var t1Pct  = (tgt1  && entry) ? Math.abs((tgt1-entry)/entry*100).toFixed(2) : '--';
    var t2Pct  = (tgt2  && entry) ? Math.abs((tgt2-entry)/entry*100).toFixed(2) : '--';
    var rrCol  = parseFloat(rr1) >= 2 ? '#3fb950' : parseFloat(rr1) >= 1.5 ? '#fbbf24' : '#f85149';

    return '<div class="bt-ta-rr-grid">'
        + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">Entry zone</span><span>' + f(entry) + '</span></div>'
        + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">Stop loss</span><span style="color:#f85149;">' + f(sl) + ' (' + (isBull?'-':'+') + slPct + '%)</span></div>'
        + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">Target 1</span><span style="color:#3fb950;">' + f(tgt1) + ' (+' + t1Pct + '%)</span></div>'
        + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">Target 2</span><span style="color:#3fb950;">' + f(tgt2) + ' (+' + t2Pct + '%)</span></div>'
        + '<div class="bt-ta-rr-row bt-ta-rr-highlight"><span class="bt-ta-rr-lbl">Risk : Reward</span><span style="color:' + rrCol + ';font-weight:700;font-size:0.78rem;">1 : ' + rr1 + '</span></div>'
        + '</div>'
        + (vixVal > 18 ? '<div class="bt-ta-warning" style="margin-top:6px;"><i class="bi bi-exclamation-triangle"></i> High VIX -- widen SL by x' + vixSlMult.toFixed(1) + ', reduce size by ~30%</div>' : '');
}

// ── OI Summary ────────────────────────────────────────────────────────────────
function _btOISummary(oiData, pcr, chPcr, name) {
    if (!oiData || !oiData.tableData || !oiData.tableData.length)
        return '<div style="display:flex;flex-direction:column;gap:8px;padding:4px 0;">'
            + '<span class="bt-hint">OI data not loaded for ' + (name||'this instrument') + '</span>'
            + (name ? '<button class="bt-oi-fetch-btn gtb-win-btn" data-name="' + name + '" style="align-self:flex-start;">'
                + '<i class="bi bi-cloud-download"></i> Fetch Live OI</button>' : '')
            + '</div>';

    var totalNetCE = 0, totalNetPE = 0;
    var maxCEOI = { strike: null, val: 0 }, maxPEOI = { strike: null, val: 0 };
    oiData.tableData.forEach(function(row) {
        var ce  = parseFloat(row.OI_CE     || 0), pe  = parseFloat(row.OI_PE     || 0);
        var dce = parseFloat(row.CHG_OI_CE || 0), dpe = parseFloat(row.CHG_OI_PE || 0);
        totalNetCE += dce; totalNetPE += dpe;
        if (ce > maxCEOI.val) maxCEOI = { strike: row.STRIKE, val: ce };
        if (pe > maxPEOI.val) maxPEOI = { strike: row.STRIKE, val: pe };
    });

    var net     = totalNetPE - totalNetCE;
    var flowDir = net > 0 ? 'PE writing dominant -- BULLISH bias' : net < 0 ? 'CE writing dominant -- BEARISH bias' : 'Balanced';
    var flowCol = net > 0 ? '#3fb950' : net < 0 ? '#f85149' : '#7d8590';

    var pcrBias = !pcr ? '--' : pcr > 1.3 ? 'Extreme puts -- contrarian BULLISH'
        : pcr > 1.0 ? 'Put-heavy -- mild BULLISH' : pcr < 0.7 ? 'Extreme calls -- contrarian BEARISH'
        : pcr < 1.0 ? 'Call-heavy -- mild BEARISH' : 'Balanced';
    var pcrCol = !pcr ? '#7d8590' : pcr > 1.1 ? '#3fb950' : pcr < 0.9 ? '#f85149' : '#7d8590';
    var chPcrText = !chPcr ? '--' : chPcr > 0 ? 'PCR rising -- put writing increasing (bullish)' : 'PCR falling -- call writing increasing (bearish)';
    var chPcrCol  = !chPcr ? '#7d8590' : chPcr > 0 ? '#3fb950' : '#f85149';

    var fmtN = function(v) { return v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : parseInt(v); };

    return '<div class="bt-ta-oi-grid">'
        + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">Flow signal</span><span style="color:' + flowCol + ';font-weight:600;">' + flowDir + '</span></div>'
        + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">Net CE delta OI</span><span style="color:#f85149;">' + _btSign(totalNetCE) + fmtN(totalNetCE) + '</span></div>'
        + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">Net PE delta OI</span><span style="color:#3fb950;">' + _btSign(totalNetPE) + fmtN(totalNetPE) + '</span></div>'
        + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">Max CE wall</span><span>' + (maxCEOI.strike||'--') + ' (' + fmtN(maxCEOI.val) + ')</span></div>'
        + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">Max PE wall</span><span>' + (maxPEOI.strike||'--') + ' (' + fmtN(maxPEOI.val) + ')</span></div>'
        + (pcr != null ? '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">PCR</span><span style="color:' + pcrCol + ';">' + parseFloat(pcr).toFixed(2) + ' -- ' + pcrBias + '</span></div>' : '')
        + (chPcr != null ? '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">PCR change</span><span style="color:' + chPcrCol + ';">' + chPcrText + '</span></div>' : '')
        + '</div>';
}

// ── Breadth & VIX Context ─────────────────────────────────────────────────────
function _btBreadthContext() {
    var opens = _btOpens(), ltps = _btLtps();
    var all = Object.assign({}, NIFTY_50_WEIGHTED_STOCKS, NIFTY_BANK_WEIGHTED_STOCKS);
    var above = 0, below = 0, asoC = 0, bsoC = 0;
    jQ.each(all, function(name) {
        var ltp  = parseFloat((ltps[name]  || {}).ltp   || 0);
        var open = parseFloat((opens[name] || {}).price || 0);
        if (!ltp || !open) return;
        if (ltp > open) above++; else if (ltp < open) below++;
        try { var ct = computeInstrumentScore(name).current_trend; if (ct > 0) asoC++; else if (ct < 0) bsoC++; } catch(e) {}
    });
    var total  = above + below || 1;
    var abPct  = (above/total*100).toFixed(0);
    var abCol  = above > below ? '#3fb950' : above < below ? '#f85149' : '#7d8590';
    var adRatio = below > 0 ? (above/below).toFixed(2) : above > 0 ? 'infinity' : '--';
    var adSent  = above > below*1.5 ? 'Broad participation -- supports longs'
                : below > above*1.5 ? 'Broad weakness -- supports shorts' : 'Mixed -- no strong bias';

    var vixVal = 0, vixRegime = '--', vixCol = '#7d8590';
    try { vixVal = parseFloat((ltps['INDIA VIX'] || {}).ltp) || 0; } catch(e) {}
    if (!vixVal) try { vixVal = VIX || 0; } catch(e) {}
    if      (vixVal < 13) { vixRegime = 'LOW -- trend day likely';   vixCol = '#3fb950'; }
    else if (vixVal < 18) { vixRegime = 'NORMAL -- balanced';        vixCol = '#fbbf24'; }
    else if (vixVal < 25) { vixRegime = 'ELEVATED -- wider stops';   vixCol = '#f97316'; }
    else if (vixVal > 0)  { vixRegime = 'HIGH -- reduce size';       vixCol = '#f85149'; }

    return '<div class="bt-ta-rr-grid">'
        + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">Stocks above open</span><span style="color:' + abCol + '">' + above + '/' + (above+below) + ' (' + abPct + '%)</span></div>'
        + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">A/D ratio</span><span>' + adRatio + '</span></div>'
        + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">ASO zone count</span><span style="color:#3fb950;">' + asoC + '</span></div>'
        + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">BSO zone count</span><span style="color:#f85149;">' + bsoC + '</span></div>'
        + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">Breadth read</span><span style="color:' + abCol + ';">' + adSent + '</span></div>'
        + '<div class="bt-ta-rr-row"><span class="bt-ta-rr-lbl">VIX</span><span style="color:' + vixCol + ';">' + (vixVal ? vixVal.toFixed(2) : '--') + ' -- ' + vixRegime + '</span></div>'
        + '</div>';
}

// ── Scenario Analysis ─────────────────────────────────────────────────────────
function _btScenarios(cs, zone, nine15, aso, ast, bso, bst, vixU, vixL, ltp) {
    var f = function(v) { return v != null ? parseFloat(v).toLocaleString('en-IN', {maximumFractionDigits:1}) : '--'; };
    var scenarios = [
        {
            title: 'BULL CASE', titleIcon: 'bi-arrow-up-circle-fill', col: '#3fb950',
            trigger: 'Price holds ASO (' + f(aso) + ') and breaks AST (' + f(ast) + ') with volume',
            target:  'AST then VIXU (' + f(vixU) + ')',
            prob:    cs.total >= 5 ? 'High (score ' + cs.total.toFixed(1) + ')' : cs.total >= 2 ? 'Moderate' : 'Low -- needs score improvement',
            action:  cs.total >= 3 ? 'CE Buy ATM or add at ASO dip' : 'Wait for score to improve before bullish entry'
        },
        {
            title: 'BASE CASE', titleIcon: 'bi-dash-circle', col: '#7d8590',
            trigger: 'Price oscillates between BSO (' + f(bso) + ') and ASO (' + f(aso) + ')',
            target:  'Range-bound between BSO and ASO',
            prob:    zone === 'B/W' ? 'High (currently in B/W zone)' : 'Moderate',
            action:  'Avoid directional trades. Sell strangle or iron condor for premium'
        },
        {
            title: 'BEAR CASE', titleIcon: 'bi-arrow-down-circle-fill', col: '#f85149',
            trigger: 'Price breaks BSO (' + f(bso) + ') and sustains below BST (' + f(bst) + ')',
            target:  'BST then VIXL (' + f(vixL) + ')',
            prob:    cs.total <= -5 ? 'High (score ' + cs.total.toFixed(1) + ')' : cs.total <= -2 ? 'Moderate' : 'Low -- needs bearish confirmation',
            action:  cs.total <= -3 ? 'PE Buy ATM or add at BSO bounce rejection' : 'Only if BSO breaks cleanly with bearish breadth'
        },
        {
            title: 'REVERSAL WATCH', titleIcon: 'bi-exclamation-triangle-fill', col: '#fbbf24',
            trigger: (nine15==='ASO'||nine15==='AST') && (zone==='BSO'||zone==='BST')
                ? 'Bullish 9:15 but price reversed to ' + zone + ' -- failed breakout pattern'
                : (nine15==='BSO'||nine15==='BST') && (zone==='ASO'||zone==='AST')
                ? 'Bearish 9:15 but price recovered to ' + zone + ' -- short-squeeze pattern'
                : 'Watch for rejection at VIXU (' + f(vixU) + ') or VIXL (' + f(vixL) + ')',
            target:  'Mean reversion toward OPEN (' + f(ltp) + ' area)',
            prob:    'Always possible -- manage with stops at key levels',
            action:  'Keep stop above AST for shorts / below BST for longs to avoid being caught'
        }
    ];

    return '<div class="bt-ta-scenario-grid">'
        + scenarios.map(function(sc) {
            return '<div class="bt-ta-scenario-card" style="border-color:' + sc.col + '33;">'
                + '<div class="bt-ta-sc-title" style="color:' + sc.col + '"><i class="bi ' + sc.titleIcon + '"></i> ' + sc.title + '</div>'
                + '<div class="bt-ta-sc-row"><b>Trigger:</b> ' + sc.trigger + '</div>'
                + '<div class="bt-ta-sc-row"><b>Target:</b> ' + sc.target + '</div>'
                + '<div class="bt-ta-sc-row"><b>Probability:</b> <span style="color:' + sc.col + '">' + sc.prob + '</span></div>'
                + '<div class="bt-ta-sc-row bt-ta-sc-action"><b>Action:</b> ' + sc.action + '</div>'
                + '</div>';
        }).join('')
        + '</div>';
}


// ── Analyze All Instruments ───────────────────────────────────────────────────
function _btAnalyzeAll() {
    var opens = _btOpens(), ltps = _btLtps();

    // Build full instrument list: indices first, then all F&O stocks
    var indexNames = _BT_INSTR.map(function(i) { return i.name; });
    var seen = {};
    indexNames.forEach(function(n) { seen[n] = true; });

    var allNames = indexNames.slice();
    var foStocks = typeof FO_LIST !== 'undefined' ? FO_LIST : [];
    foStocks.forEach(function(n) { if (!seen[n]) { allNames.push(n); seen[n] = true; } });

    var cards = allNames.map(function(name) {
        var short = name.length > 8 ? name.substring(0,8) : name;
        return _btBuildInstrData(name, short, opens, ltps);
    });

    // Only count stocks that have data
    var withData  = cards.filter(function(d) { return d.ltp > 0; });
    var noData    = cards.filter(function(d) { return d.ltp <= 0; });

    var body = '<div class="bt-all-wrap">'

        // Toolbar: stats + filter
        + '<div class="bt-all-toolbar">'
        +   '<span class="bt-all-stat"><i class="bi bi-grid-3x3-gap-fill"></i> <b>' + withData.length + '</b> instruments with data</span>'
        +   '<span class="bt-all-stat" style="color:#3fb950;"><i class="bi bi-arrow-up-circle"></i> <b id="bt-all-bull-cnt">--</b> bull</span>'
        +   '<span class="bt-all-stat" style="color:#f85149;"><i class="bi bi-arrow-down-circle"></i> <b id="bt-all-bear-cnt">--</b> bear</span>'
        +   '<span class="bt-all-stat" style="color:#7d8590;"><i class="bi bi-dash-circle"></i> <b id="bt-all-neut-cnt">--</b> neutral</span>'
        +   (noData.length ? '<span class="bt-all-stat" style="color:#7d8590;opacity:0.5;"><i class="bi bi-wifi-off"></i> ' + noData.length + ' no data</span>' : '')
        +   '<div class="bt-all-filter-wrap">'
        +     '<i class="bi bi-search" style="position:absolute;left:7px;top:50%;transform:translateY(-50%);color:var(--gtb-muted);font-size:0.6rem;pointer-events:none;"></i>'
        +     '<input id="bt-all-filter" type="text" placeholder="Filter instruments..." class="bt-all-filter-inp"/>'
        +   '</div>'
        +   '<select id="bt-all-dir-filter" class="bt-all-filter-sel">'
        +     '<option value="">All Directions</option>'
        +     '<option value="BULL">Bull</option><option value="BEAR">Bear</option><option value="NEUTRAL">Neutral</option>'
        +   '</select>'
        +   '<select id="bt-all-sort" class="bt-all-filter-sel">'
        +     '<option value="score">Sort: Score</option>'
        +     '<option value="name">Sort: Name</option>'
        +     '<option value="pct">Sort: % Change</option>'
        +   '</select>'
        + '</div>'

        // Summary table only — click a row to open Instrument Detail View
        + '<div class="bt-all-summary-card">'
        +   '<div class="bt-ta-card-hdr"><i class="bi bi-table"></i> AT A GLANCE <span id="bt-all-tbl-count" style="color:var(--gtb-muted);font-size:0.5rem;margin-left:6px;"></span>'
        +   '<span style="font-size:0.44rem;color:var(--gtb-muted);margin-left:8px;font-weight:400;">Click a row to open Instrument Detail View</span></div>'
        +   '<div id="bt-all-tbl-wrap">' + _btAllSummaryTable(withData) + '</div>'
        + '</div>'

        + '</div>';

    showMaximizeOverlay('Trade Analysis -- All F&O Instruments', body);
    setTimeout(function() {
        var ov = document.getElementById('groot-maximize-overlay');
        if (!ov) return;
        jQ(ov).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
        jQ(ov).find('.gtb-maximize-content').addClass('bt-ta-overlay-content');

        // Compute and show bull/bear counts
        var bull = 0, bear = 0, neut = 0;
        withData.forEach(function(d) {
            if (d.cs.total > 0) bull++; else if (d.cs.total < 0) bear++; else neut++;
        });
        jQ('#bt-all-bull-cnt').text(bull);
        jQ('#bt-all-bear-cnt').text(bear);
        jQ('#bt-all-neut-cnt').text(neut);

        // Store cards data on overlay for filtering
        jQ(ov).data('btCards', withData);

        // Filter/sort handler
        function _applyFilter() {
            var text    = jQ('#bt-all-filter').val().toUpperCase().trim();
            var dirF    = jQ('#bt-all-dir-filter').val();
            var sortBy  = jQ('#bt-all-sort').val();
            var all     = jQ(ov).data('btCards') || [];

            var filtered = all.filter(function(d) {
                var nameMatch = !text || d.name.toUpperCase().indexOf(text) >= 0;
                var dirMatch  = !dirF || d.dirLabel.indexOf(dirF) >= 0;
                return nameMatch && dirMatch;
            });

            filtered.sort(function(a, b) {
                if (sortBy === 'name')  return a.name.localeCompare(b.name);
                if (sortBy === 'pct')   return b.pct - a.pct;
                return b.cs.total - a.cs.total; // score desc
            });

            jQ('#bt-all-tbl-count').text(filtered.length + ' shown');
            jQ('#bt-all-tbl-wrap').html(_btAllSummaryTable(filtered));
        }

        jQ(ov).off('input.btf change.btf').on('input.btf change.btf', '#bt-all-filter, #bt-all-dir-filter, #bt-all-sort', _applyFilter);
        _applyFilter(); // initial render with score sort

        // Row click → close overlay then open Instrument Detail View popup on top
        jQ(ov).off('click.bttbl').on('click.bttbl', '.bt-all-tbl-row', function(e) {
            if (jQ(e.target).closest('button,a').length) return;
            var name = jQ(this).data('name');
            // Close the maximize overlay so the popup isn't hidden behind it
            jQ('#groot-maximize-overlay').hide();
            if (typeof _gtbOpenInstrDetailFor === 'function') _gtbOpenInstrDetailFor(name);
        });
    }, 30);
}

// ── Build instrument data object ──────────────────────────────────────────────
function _btBuildInstrData(name, shortName, opens, ltps) {
    var d = { name: name, s: shortName };

    d.ltp  = parseFloat((ltps[name]  || {}).ltp   || 0);
    d.open = parseFloat((opens[name] || {}).price  || 0);
    d.pct  = d.open ? ((d.ltp - d.open) / d.open * 100) : 0;

    d.cs = { nine_fifteen: 0, current_trend: 0, futures_trend: 0, oi_obv: 0, total: 0 };
    try { d.cs = computeInstrumentScore(name); } catch(e) {}

    d.tr = null;
    try { d.tr = generateTrend(name); } catch(e) {}

    d.aso  = d.tr ? parseFloat(d.tr.strikeData.ustrikeOne) : null;
    d.ast  = d.tr ? parseFloat(d.tr.strikeData.ustrikeTwo) : null;
    d.bso  = d.tr ? parseFloat(d.tr.strikeData.bstrikeOne) : null;
    d.bst  = d.tr ? parseFloat(d.tr.strikeData.bstrikeTwo) : null;
    d.vixL = d.tr ? parseFloat(d.tr.vix.vixDDLower) : null;
    d.vixU = d.tr ? parseFloat(d.tr.vix.vixDDUpper) : null;

    d.nine15 = 'B/W';
    try { d.nine15 = (JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}')[name] || {}).CLOSE_9_15 || 'B/W'; } catch(e) {}

    d.zone  = {'2':'AST','1':'ASO','0':'B/W','-1':'BSO','-2':'BST'}[String(d.cs.current_trend)] || 'B/W';

    var sm = INSTRUMENT_SCORE_MAP[name] || {};
    d.futText = sm.futures_trend > 0 ? 'Long' : sm.futures_trend < 0 ? 'Short' : 'Neutral';
    d.oiData  = sm.oiData || null;
    d.pcr     = sm.pcr    || null;
    d.chPcr   = sm.chPcr  || null;

    d.vixVal = 0;
    try { d.vixVal = parseFloat((ltps['INDIA VIX'] || {}).ltp) || 0; } catch(e) {}
    if (!d.vixVal) try { d.vixVal = VIX || 0; } catch(e) {}

    // Direction
    var t = d.cs.total;
    d.dirLabel = t >= 6 ? 'STRONG BULL' : t >= 3 ? 'BULL' : t >= 1 ? 'MILD BULL'
               : t <= -6 ? 'STRONG BEAR' : t <= -3 ? 'BEAR' : t <= -1 ? 'MILD BEAR' : 'NEUTRAL';
    d.dirCol   = t > 0 ? '#3fb950' : t < 0 ? '#f85149' : '#7d8590';

    // Top strategy name
    var isIndex = ['NIFTY 50','NIFTY BANK','GIFT NIFTY','SENSEX'].indexOf(name) >= 0;
    d.topStrat = t >= 6 ? 'CE Buy (ITM)' : t >= 3 ? 'CE Buy (ATM)' : t >= 1 ? 'CE Buy (OTM)'
               : t <= -6 ? 'PE Buy (ITM)' : t <= -3 ? 'PE Buy (ATM)' : t <= -1 ? 'PE Buy (OTM)'
               : isIndex ? 'Iron Condor / Wait' : 'Wait';

    // R:R
    var isBull = t > 0, isBear = t < 0;
    var vixM   = d.vixVal > 25 ? 1.6 : d.vixVal > 18 ? 1.3 : 1.0;
    if (isBull && d.aso) {
        d.entry = d.aso; d.sl = d.bso ? d.bso * 0.999 : d.aso * (1 - 0.003*vixM);
        d.tgt1 = d.ast || d.aso*1.005; d.tgt2 = d.vixU || d.aso*1.01;
        var risk = d.entry - d.sl, rwd = d.tgt1 - d.entry;
        d.rr = risk > 0 ? (rwd/risk).toFixed(1) : '--';
    } else if (isBear && d.bso) {
        d.entry = d.bso; d.sl = d.aso ? d.aso*1.001 : d.bso*(1+0.003*vixM);
        d.tgt1 = d.bst || d.bso*0.995; d.tgt2 = d.vixL || d.bso*0.99;
        var risk = d.sl - d.entry, rwd = d.entry - d.tgt1;
        d.rr = risk > 0 ? (rwd/risk).toFixed(1) : '--';
    } else {
        d.entry = null; d.sl = null; d.tgt1 = null; d.tgt2 = null; d.rr = '--';
    }

    // Scenario probs (simplified)
    d.bullProb = t >= 5 ? 'High' : t >= 2 ? 'Mod' : 'Low';
    d.bearProb = t <= -5 ? 'High' : t <= -2 ? 'Mod' : 'Low';
    d.baseProb = d.zone === 'B/W' ? 'High' : 'Mod';

    // Confluence count
    d.bullSigs = [d.cs.nine_fifteen > 0, d.cs.current_trend > 0, d.cs.futures_trend > 0, d.cs.oi_obv > 0].filter(Boolean).length;
    d.bearSigs = [d.cs.nine_fifteen < 0, d.cs.current_trend < 0, d.cs.futures_trend < 0, d.cs.oi_obv < 0].filter(Boolean).length;

    // Conflict flag
    d.conflict = ((d.nine15==='AST'||d.nine15==='ASO') && (d.zone==='BSO'||d.zone==='BST'))
              || ((d.nine15==='BST'||d.nine15==='BSO') && (d.zone==='ASO'||d.zone==='AST'));

    return d;
}

// ── Summary comparison table ──────────────────────────────────────────────────
function _btAllSummaryTable(cards) {
    var zc = function(z) { return (z==='AST'||z==='ASO') ? '#3fb950' : (z==='BST'||z==='BSO') ? '#f85149' : '#7d8590'; };
    var fc = function(v) { return v != null ? parseFloat(v).toLocaleString('en-IN', {maximumFractionDigits:1}) : '--'; };
    var rrCol = function(r) { var n = parseFloat(r); return n >= 2 ? '#3fb950' : n >= 1.5 ? '#fbbf24' : n > 0 ? '#f85149' : '#7d8590'; };

    // Sort by score descending for at-a-glance ranking
    var sorted = cards.slice().sort(function(a,b) { return b.cs.total - a.cs.total; });

    var h = '<div class="bt-all-tbl-wrap"><table class="bt-all-tbl"><thead><tr>'
        + '<th>#</th><th>Instrument</th><th>LTP</th><th>Chg%</th>'
        + '<th>Score</th><th>9:15</th><th>Zone</th><th>Futures</th>'
        + '<th>Bull sig</th><th>Direction</th><th>Strategy</th>'
        + '<th>Entry</th><th>SL</th><th>Target 1</th><th>R:R</th>'
        + '<th>Bull?</th><th>Bear?</th><th>Flag</th>'
        + '</tr></thead><tbody>';

    sorted.forEach(function(d, i) {
        if (!d.ltp) { h += '<tr><td>' + (i+1) + '</td><td>' + d.name + '</td><td colspan="16" style="color:var(--gtb-muted)">No data</td></tr>'; return; }
        var pCol = _btCol(d.pct), sCol = _btCol(d.cs.total);
        var z9c  = zc(d.nine15), zzc = zc(d.zone);

        var bullBar = '';
        for (var b = 0; b < 4; b++) {
            var filled = b < d.bullSigs;
            bullBar += '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:1px;background:' + (filled ? '#3fb950' : '#30363d') + ';"></span>';
        }
        var bearBar = '';
        for (var b = 0; b < 4; b++) {
            var filled = b < d.bearSigs;
            bearBar += '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:1px;background:' + (filled ? '#f85149' : '#30363d') + ';"></span>';
        }

        var _chartUrl = (typeof _gdbKiteChartUrl === 'function') ? _gdbKiteChartUrl(d.name)
            : 'https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/' + d.name + '/' + (INSTRUMENT_TOKENS[d.name]||'');
        h += '<tr class="bt-all-tbl-row" data-name="' + d.name + '" title="Click to open Instrument Detail View" style="cursor:pointer;">'
            + '<td style="color:var(--gtb-muted);text-align:center;">' + (i+1) + '</td>'
            + '<td style="font-weight:700;"><a href="' + _chartUrl + '" target="_blank" style="color:inherit;text-decoration:none;border-bottom:1px dashed var(--gtb-muted);" onclick="event.stopPropagation();">' + d.name + '</a></td>'
            + '<td class="bt-st-mono">' + d.ltp.toLocaleString('en-IN') + '</td>'
            + '<td style="color:' + pCol + '">' + _btSign(d.pct) + d.pct.toFixed(2) + '%</td>'
            + '<td style="color:' + sCol + ';font-weight:700;">' + _btSign(d.cs.total) + d.cs.total.toFixed(1) + '</td>'
            + '<td><span class="bt-tz" style="color:' + z9c + ';border-color:' + z9c + '44;background:' + z9c + '11;">' + d.nine15 + '</span></td>'
            + '<td><span class="bt-tz" style="color:' + zzc + ';border-color:' + zzc + '44;background:' + zzc + '11;">' + d.zone + '</span></td>'
            + '<td style="color:' + (d.cs.futures_trend > 0 ? '#3fb950' : d.cs.futures_trend < 0 ? '#f85149' : '#7d8590') + '">' + d.futText + '</td>'
            + '<td>' + bullBar + bearBar + '</td>'
            + '<td style="color:' + d.dirCol + ';font-weight:700;font-size:0.58rem;">' + d.dirLabel + '</td>'
            + '<td style="color:' + d.dirCol + ';font-size:0.56rem;">' + d.topStrat + '</td>'
            + '<td>' + fc(d.entry) + '</td>'
            + '<td style="color:#f85149;">' + fc(d.sl) + '</td>'
            + '<td style="color:#3fb950;">' + fc(d.tgt1) + '</td>'
            + '<td style="color:' + rrCol(d.rr) + ';font-weight:700;">' + d.rr + '</td>'
            + '<td style="color:#3fb950;font-size:0.56rem;">' + d.bullProb + '</td>'
            + '<td style="color:#f85149;font-size:0.56rem;">' + d.bearProb + '</td>'
            + '<td>' + (d.conflict ? '<i class="bi bi-exclamation-triangle" style="color:#fbbf24;" title="9:15 vs current zone conflict"></i>' : '') + '</td>'
            + '</tr>';
    });

    h += '</tbody></table></div>';
    return h;
}

// ── Per-instrument compact card ───────────────────────────────────────────────
function _btInstrCard(d) {
    if (!d.ltp) {
        return '<div class="bt-ic-card bt-ic-empty"><div class="bt-ic-name">' + d.name + '</div><div style="color:var(--gtb-muted);font-size:0.58rem;">No data</div></div>';
    }

    var zc = function(z) { return (z==='AST'||z==='ASO') ? '#3fb950' : (z==='BST'||z==='BSO') ? '#f85149' : '#7d8590'; };
    var fc = function(v) {
        if (v == null) return '--';
        v = parseFloat(v);
        return v >= 10000 ? v.toLocaleString('en-IN', {maximumFractionDigits:0}) : v >= 100 ? v.toFixed(1) : v.toFixed(2);
    };
    var pCol  = _btCol(d.pct);
    var sCol  = _btCol(d.cs.total);
    var borderCol = d.cs.total > 3 ? '#3fb950' : d.cs.total < -3 ? '#f85149' : '#30363d';

    // Mini level map (no text tags, just colored segments + LTP dot)
    var miniMap = _btMiniLevelMap(d);

    // Signal dots row
    var sigDots = [
        { label: '9:15', score: d.cs.nine_fifteen, val: d.nine15 },
        { label: 'Zone', score: d.cs.current_trend, val: d.zone },
        { label: 'Fut',  score: d.cs.futures_trend, val: d.futText },
        { label: 'OI',   score: d.cs.oi_obv,        val: d.cs.oi_obv > 0 ? 'Bull' : d.cs.oi_obv < 0 ? 'Bear' : 'Neu' },
    ].map(function(sig) {
        var c = sig.score > 0 ? '#3fb950' : sig.score < 0 ? '#f85149' : '#7d8590';
        var icon = sig.score > 0 ? 'bi-arrow-up-short' : sig.score < 0 ? 'bi-arrow-down-short' : 'bi-dash';
        return '<div class="bt-ic-sig">'
            + '<i class="bi ' + icon + '" style="color:' + c + ';font-size:0.75rem;"></i>'
            + '<span class="bt-ic-sig-label">' + sig.label + '</span>'
            + '<span class="bt-ic-sig-val" style="color:' + c + '">' + sig.val + '</span>'
            + '</div>';
    }).join('');

    // Confluence bar
    var bullW = d.bullSigs / 4 * 100, bearW = d.bearSigs / 4 * 100;

    // R:R row
    var rrCol = parseFloat(d.rr) >= 2 ? '#3fb950' : parseFloat(d.rr) >= 1.5 ? '#fbbf24' : '#f85149';

    // Entry/levels compact
    var levelsRow = d.entry
        ? '<div class="bt-ic-rr-grid">'
        +   '<div class="bt-ic-rr-row"><span>Entry</span><span>' + fc(d.entry) + '</span></div>'
        +   '<div class="bt-ic-rr-row"><span>SL</span><span style="color:#f85149;">' + fc(d.sl) + '</span></div>'
        +   '<div class="bt-ic-rr-row"><span>T1</span><span style="color:#3fb950;">' + fc(d.tgt1) + '</span></div>'
        +   '<div class="bt-ic-rr-row"><span>T2</span><span style="color:#3fb950;">' + fc(d.tgt2) + '</span></div>'
        +   '<div class="bt-ic-rr-row"><span>R:R</span><span style="color:' + rrCol + ';font-weight:700;">1:' + d.rr + '</span></div>'
        + '</div>'
        : '<div class="bt-ic-neutral-note">No directional bias<br>Watch ASO ' + fc(d.aso) + ' / BSO ' + fc(d.bso) + '</div>';

    // Scenario mini-badges
    var scenBadge = function(label, prob, col) {
        var opacity = prob === 'High' ? '1' : prob === 'Mod' ? '0.65' : '0.3';
        return '<span class="bt-ic-scen" style="color:' + col + ';opacity:' + opacity + ';border-color:' + col + '55;background:' + col + '15;">' + label + '<br><b>' + prob + '</b></span>';
    };

    // Key entry trigger (1 line)
    var trigger = '';
    if (d.cs.total > 0) {
        if (d.zone === 'B/W' || d.zone === 'BSO' || d.zone === 'BST')
            trigger = 'Wait for close above BSO ' + fc(d.bso);
        else if (d.zone === 'ASO')
            trigger = 'Hold above ASO ' + fc(d.aso) + ' on dip';
        else
            trigger = 'AST ' + fc(d.ast) + ' held -- momentum';
    } else if (d.cs.total < 0) {
        if (d.zone === 'B/W' || d.zone === 'ASO' || d.zone === 'AST')
            trigger = 'Wait for close below BSO ' + fc(d.bso);
        else if (d.zone === 'BSO')
            trigger = 'Hold below BSO ' + fc(d.bso) + ' on bounce';
        else
            trigger = 'BST ' + fc(d.bst) + ' held -- momentum';
    } else {
        trigger = 'Break above ' + fc(d.aso) + ' or below ' + fc(d.bso);
    }

    return '<div class="bt-ic-card" id="bt-ic-card-' + d.name.replace(/[^A-Z0-9]/g,'_') + '" style="border-color:' + borderCol + ';">'

        // Card header
        + '<div class="bt-ic-header" style="border-bottom-color:' + borderCol + ';">'
        +   '<div class="bt-ic-name-row">'
        +     '<span class="bt-ic-name">' + d.name + '</span>'
        +     '<span class="bt-ic-ltp">' + d.ltp.toLocaleString('en-IN') + '</span>'
        +     '<span style="color:' + pCol + ';font-size:0.6rem;">' + _btSign(d.pct) + d.pct.toFixed(2) + '%</span>'
        +   '</div>'
        +   '<div class="bt-ic-score-row">'
        +     '<span class="bt-ic-dir" style="color:' + d.dirCol + '">' + d.dirLabel + '</span>'
        +     '<span class="bt-ic-score" style="color:' + sCol + '">' + _btSign(d.cs.total) + d.cs.total.toFixed(1) + '</span>'
        +     '<span class="bt-tz" style="color:' + zc(d.zone) + ';border-color:' + zc(d.zone) + '44;background:' + zc(d.zone) + '11;">' + d.zone + '</span>'
        +     '<span class="bt-tz" style="color:' + zc(d.nine15) + ';border-color:' + zc(d.nine15) + '44;background:' + zc(d.nine15) + '11;">' + d.nine15 + '</span>'
        +   '</div>'
        + '</div>'

        // Mini level map
        + '<div class="bt-ic-section-label">Level Map</div>'
        + miniMap

        // Signal dots
        + '<div class="bt-ic-section-label">Signals</div>'
        + '<div class="bt-ic-sigs">' + sigDots + '</div>'

        // Confluence bars
        + '<div class="bt-ic-conf-bars">'
        +   '<div class="bt-ic-conf-bar-row"><span style="color:#3fb950;font-size:0.5rem;">Bull</span><div class="bt-ic-conf-track"><div style="height:100%;width:' + bullW + '%;background:#3fb950;border-radius:2px;"></div></div><span style="color:#3fb950;font-size:0.5rem;">' + d.bullSigs + '/4</span></div>'
        +   '<div class="bt-ic-conf-bar-row"><span style="color:#f85149;font-size:0.5rem;">Bear</span><div class="bt-ic-conf-track"><div style="height:100%;width:' + bearW + '%;background:#f85149;border-radius:2px;"></div></div><span style="color:#f85149;font-size:0.5rem;">' + d.bearSigs + '/4</span></div>'
        + '</div>'

        // Strategy + trigger
        + '<div class="bt-ic-section-label">Setup</div>'
        + '<div class="bt-ic-strat" style="color:' + d.dirCol + '"><i class="bi bi-lightning-charge"></i> ' + d.topStrat + '</div>'
        + '<div class="bt-ic-trigger">' + trigger + '</div>'
        + (d.conflict ? '<div class="bt-ic-conflict"><i class="bi bi-exclamation-triangle"></i> 9:15 vs zone conflict</div>' : '')

        // R:R levels
        + '<div class="bt-ic-section-label">Risk / Reward</div>'
        + levelsRow

        // Scenario mini
        + '<div class="bt-ic-section-label">Scenarios</div>'
        + '<div class="bt-ic-scenarios">'
        +   scenBadge('BULL',    d.bullProb, '#3fb950')
        +   scenBadge('BASE',    d.baseProb, '#7d8590')
        +   scenBadge('BEAR',    d.bearProb, '#f85149')
        +   (d.conflict ? scenBadge('REV!', 'High', '#fbbf24') : '')
        + '</div>'

        // Deep-dive link
        + '<div class="bt-ic-footer">'
        +   '<button class="bt-analyze-btn gtb-win-btn" data-name="' + d.name + '" style="width:100%;justify-content:center;"><i class="bi bi-layers-fill"></i> Open Detail View</button>'
        + '</div>'

        + '</div>';
}

// ── Mini level map (no text, just bar with LTP dot) ───────────────────────────
function _btMiniLevelMap(d) {
    var levels = [];
    if (d.vixL) levels.push({ v: d.vixL, col: '#38bdf8' });
    if (d.bst)  levels.push({ v: d.bst,  col: '#f85149' });
    if (d.bso)  levels.push({ v: d.bso,  col: '#fca5a5' });
    if (d.open) levels.push({ v: d.open, col: '#ffbe0b' });
    if (d.aso)  levels.push({ v: d.aso,  col: '#86efac' });
    if (d.ast)  levels.push({ v: d.ast,  col: '#3fb950' });
    if (d.vixU) levels.push({ v: d.vixU, col: '#38bdf8' });
    if (!levels.length || !d.ltp) return '<div class="bt-mini-map-na">Level data unavailable</div>';

    levels.sort(function(a,b) { return a.v - b.v; });
    var min = levels[0].v, max = levels[levels.length-1].v;
    var span = max - min || 1;
    min -= span * 0.05; max += span * 0.05; span = max - min;
    var pos = function(v) { return Math.max(0, Math.min(100, ((v-min)/span*100))).toFixed(1); };

    var segments = '';
    // zone fills
    if (d.bst && d.bso) segments += '<div style="position:absolute;top:0;left:' + pos(d.bst) + '%;width:' + (parseFloat(pos(d.bso))-parseFloat(pos(d.bst))) + '%;height:100%;background:#f8514940;"></div>';
    if (d.bso && d.aso) segments += '<div style="position:absolute;top:0;left:' + pos(d.bso) + '%;width:' + (parseFloat(pos(d.aso))-parseFloat(pos(d.bso))) + '%;height:100%;background:#7d859020;"></div>';
    if (d.aso && d.ast) segments += '<div style="position:absolute;top:0;left:' + pos(d.aso) + '%;width:' + (parseFloat(pos(d.ast))-parseFloat(pos(d.aso))) + '%;height:100%;background:#3fb95040;"></div>';

    // level ticks
    var ticks = levels.map(function(l) {
        return '<div style="position:absolute;top:0;left:' + pos(l.v) + '%;width:1.5px;height:100%;background:' + l.col + ';transform:translateX(-50%);"></div>';
    }).join('');

    // LTP dot
    var ltpP = pos(d.ltp);
    var ltpCol = d.ltp >= (d.aso||0) ? '#3fb950' : d.ltp <= (d.bso||Infinity) ? '#f85149' : '#ffbe0b';
    var ltpDot = '<div style="position:absolute;top:50%;left:' + ltpP + '%;transform:translate(-50%,-50%);width:8px;height:8px;border-radius:50%;background:' + ltpCol + ';border:1.5px solid var(--gtb-bg);z-index:2;"></div>';

    // Labels below: BSO, ASO, LTP only
    var labelsHtml = '<div style="position:relative;height:12px;">';
    if (d.bso) labelsHtml += '<div style="position:absolute;left:' + pos(d.bso) + '%;transform:translateX(-50%);font-size:0.44rem;color:#fca5a5;">BSO</div>';
    if (d.aso) labelsHtml += '<div style="position:absolute;left:' + pos(d.aso) + '%;transform:translateX(-50%);font-size:0.44rem;color:#86efac;">ASO</div>';
    labelsHtml += '<div style="position:absolute;left:' + ltpP + '%;transform:translateX(-50%);font-size:0.44rem;color:' + ltpCol + ';font-weight:700;">LTP</div>';
    labelsHtml += '</div>';

    return '<div class="bt-mini-map">'
        + '<div style="position:relative;height:14px;background:var(--gtb-surface2);border-radius:3px;overflow:visible;">'
        +   segments + ticks + ltpDot
        + '</div>'
        + labelsHtml
        + '</div>';
}
