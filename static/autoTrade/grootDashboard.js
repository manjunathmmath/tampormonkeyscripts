// ── Groot Dashboard widget library ────────────────────────────────────────────
// Widget render functions used by the Analysis tab in grootTradeBot.js.
// The standalone overlay (Groot Pro Dashboard) has been removed — all content
// now lives inside the Analysis tab.

// Build a Kite chart URL for any instrument name
function _gdbKiteChartUrl(name) {
    var isMcx = (name === 'CRUDEOILM' || name === 'USDINR');
    var exch   = isMcx ? 'MCX' : 'NSE';
    var token  = INSTRUMENT_TOKENS[name] || '';
    var sym    = name;
    if (isMcx && typeof COMMODITIES_FUTURE_INSTRUMENT_LIST !== 'undefined') {
        var entry = COMMODITIES_FUTURE_INSTRUMENT_LIST.find(function(f){ return f.name === name; });
        if (entry) { token = entry.instrument_token; sym = entry.tradingsymbol; }
    }
    return 'https://kite.zerodha.com/markets/ext/chart/web/tvc/' + exch + '/' + sym + '/' + token;
}

function _gdbNameLink(name) {
    return '<a href="' + _gdbKiteChartUrl(name) + '" target="_blank" '
        + 'style="color:inherit;text-decoration:none;border-bottom:1px dashed var(--gtb-muted);" '
        + 'onclick="event.stopPropagation();">' + name + '</a>';
}

// ── Minimal state ─────────────────────────────────────────────────────────────
var _GDB = {
    positions: [],
    levelPins: ['NIFTY 50', 'NIFTY BANK', 'RELIANCE'],
};

function _gdbLoadPositions() {
    try { _GDB.positions = JSON.parse(localStorage.getItem('GDB_POSITIONS') || '[]'); } catch(e) { _GDB.positions = []; }
}
function _gdbSavePositions() {
    localStorage.setItem('GDB_POSITIONS', JSON.stringify(_GDB.positions));
}
function _gdbAddPosition() {
    var name   = jQ('#gdb-rp-name').val();
    var type   = jQ('#gdb-rp-type').val();
    var strike = parseFloat(jQ('#gdb-rp-strike').val()) || 0;
    var qty    = parseInt(jQ('#gdb-rp-qty').val())    || 1;
    var lot    = parseInt(jQ('#gdb-rp-lot').val())    || 1;
    var buy    = parseFloat(jQ('#gdb-rp-buy').val())   || 0;
    if (!name || !buy) return;
    _GDB.positions.push({ name:name, type:type, strike:strike, qty:qty, lotSize:lot, buyPrice:buy });
    _gdbSavePositions();
    _gdbWidgetRisk();
}

// ── WIDGET: Market Pulse ───────────────────────────────────────────────────────
function _gdbWidgetPulse() {
    var ltps  = _btLtps(), opens = _btOpens();
    var all   = Object.assign({}, NIFTY_50_WEIGHTED_STOCKS, NIFTY_BANK_WEIGHTED_STOCKS);
    var above = 0, below = 0, asoC = 0, bsoC = 0, futBull = 0, futBear = 0;
    var totalFoCount = 0;
    jQ.each(all, function(n) {
        var ltp  = parseFloat((ltps[n]  || {}).ltp   || 0);
        var open = parseFloat((opens[n] || {}).price || 0);
        if (!ltp || !open) return;
        totalFoCount++;
        if (ltp > open) above++; else if (ltp < open) below++;
        try {
            var cs = computeInstrumentScore(n);
            if (cs.current_trend > 0) asoC++; else if (cs.current_trend < 0) bsoC++;
            if (cs.futures_trend > 0) futBull++; else if (cs.futures_trend < 0) futBear++;
        } catch(e) {}
    });
    var breadthPct = totalFoCount ? (above / totalFoCount * 100) : 0;
    var adRatio    = below > 0 ? (above / below).toFixed(1) : above > 0 ? 'inf' : '--';

    var metrics = [
        { n:'NIFTY 50', s:'N50' }, { n:'NIFTY BANK', s:'NB' }, { n:'SENSEX', s:'SX' },
        { n:'RELIANCE', s:'REL' }, { n:'HDFCBANK', s:'HDF' }, { n:'ICICIBANK', s:'ICI' }
    ];
    var vixVal = 0;
    try { vixVal = parseFloat((ltps['INDIA VIX'] || {}).ltp) || 0; } catch(e) {}
    if (!vixVal) try { vixVal = VIX || 0; } catch(e) {}
    var vixLabel = vixVal < 13 ? 'LOW -- trend day' : vixVal < 18 ? 'NORMAL' : vixVal < 25 ? 'ELEVATED' : 'HIGH -- caution';
    var vixCol   = vixVal < 13 ? '#3fb950' : vixVal < 18 ? '#fbbf24' : vixVal < 25 ? '#f97316' : '#f85149';
    var fc = function(v) { return parseFloat(v).toLocaleString('en-IN',{maximumFractionDigits:1}); };

    var scoreCards = metrics.map(function(m) {
        var ltp  = parseFloat((ltps[m.n]  || {}).ltp   || 0);
        var open = parseFloat((opens[m.n] || {}).price || 0);
        var pct  = (ltp && open) ? ((ltp-open)/open*100) : 0;
        var sc   = 0, zone = 'B/W';
        try { var cs = computeInstrumentScore(m.n); sc = cs.total; zone = {'2':'AST','1':'ASO','0':'B/W','-1':'BSO','-2':'BST'}[String(cs.current_trend)]||'B/W'; } catch(e) {}
        var col  = sc > 0 ? '#3fb950' : sc < 0 ? '#f85149' : '#7d8590';
        var pCol = pct > 0 ? '#3fb950' : pct < 0 ? '#f85149' : '#7d8590';
        var zCol = (zone==='AST'||zone==='ASO') ? '#3fb950' : (zone==='BST'||zone==='BSO') ? '#f85149' : '#7d8590';
        return '<div class="gdb-pulse-card">'
            + '<div class="gdb-pc-sym">' + m.s + '</div>'
            + (ltp ? '<div class="gdb-pc-ltp" style="color:' + pCol + '">' + fc(ltp) + '</div>' : '')
            + (ltp && open ? '<div class="gdb-pc-pct" style="color:' + pCol + '">' + (pct>=0?'+':'') + pct.toFixed(2) + '%</div>' : '')
            + '<div class="gdb-pc-score" style="color:' + col + '">' + (sc>=0?'+':'') + sc.toFixed(1) + '</div>'
            + '<div class="gdb-pc-zone" style="color:' + zCol + ';border-color:' + zCol + '44;background:' + zCol + '11;">' + zone + '</div>'
            + '</div>';
    }).join('');

    var breadthCol = breadthPct > 60 ? '#3fb950' : breadthPct < 40 ? '#f85149' : '#fbbf24';
    var html = '<div class="gdb-pulse-wrap">'
        + scoreCards
        + '<div class="gdb-pulse-divider"></div>'
        + '<div class="gdb-pulse-stat"><span class="gdb-ps-label">BREADTH</span><span class="gdb-ps-val" style="color:' + breadthCol + '">' + breadthPct.toFixed(0) + '%</span><span class="gdb-ps-sub">above open</span></div>'
        + '<div class="gdb-pulse-stat"><span class="gdb-ps-label">A/D</span><span class="gdb-ps-val" style="color:' + breadthCol + '">' + adRatio + '</span><span class="gdb-ps-sub">' + above + ' adv / ' + below + ' dec</span></div>'
        + '<div class="gdb-pulse-stat"><span class="gdb-ps-label">ASO / BSO</span><span class="gdb-ps-val"><span style="color:#3fb950">' + asoC + '</span>/<span style="color:#f85149">' + bsoC + '</span></span><span class="gdb-ps-sub">zone counts</span></div>'
        + '<div class="gdb-pulse-stat"><span class="gdb-ps-label">FUT</span><span class="gdb-ps-val"><span style="color:#3fb950">' + futBull + '</span>/<span style="color:#f85149">' + futBear + '</span></span><span class="gdb-ps-sub">bull / bear</span></div>'
        + '<div class="gdb-pulse-divider"></div>'
        + '<div class="gdb-pulse-stat"><span class="gdb-ps-label">INDIA VIX</span><span class="gdb-ps-val" style="color:' + vixCol + '">' + (vixVal ? vixVal.toFixed(1) : '--') + '</span><span class="gdb-ps-sub" style="color:' + vixCol + '">' + vixLabel + '</span></div>'
        + '</div>';
    jQ('#gdb-body-pulse').html(html);
}

// ── WIDGET: Score Matrix ───────────────────────────────────────────────────────
function _gdbWidgetScore() {
    var ltps  = _btLtps(), opens = _btOpens();
    var insts = _BT_INSTR.concat(
        Object.keys(NIFTY_50_WEIGHTED_STOCKS).map(function(n) { return {name:n,s:n}; }),
        Object.keys(NIFTY_BANK_WEIGHTED_STOCKS).map(function(n) { return {name:n,s:n}; })
    );
    var seen = {}, rows = [];
    insts.forEach(function(inst) {
        var n = inst.name;
        if (seen[n]) return; seen[n] = true;
        var ltp  = parseFloat((ltps[n]  || {}).ltp   || 0);
        var open = parseFloat((opens[n] || {}).price || 0);
        if (!ltp) return;
        var pct  = open ? ((ltp-open)/open*100) : 0;
        var cs   = { total:0, current_trend:0, nine_fifteen:0, futures_trend:0 };
        try { cs = computeInstrumentScore(n); } catch(e) {}
        var zone = {'2':'AST','1':'ASO','0':'B/W','-1':'BSO','-2':'BST'}[String(cs.current_trend)] || 'B/W';
        rows.push({ name:n, ltp:ltp, pct:pct, sc:cs.total, zone:zone, nf:cs.nine_fifteen, ft:cs.futures_trend });
    });
    rows.sort(function(a,b) { return b.sc - a.sc; });

    var h = '<table class="gdb-sm-tbl"><thead><tr>'
        + '<th>Instrument</th><th>LTP</th><th>Chg%</th><th>Score</th><th>Zone</th><th>9:15</th><th>Fut</th><th></th>'
        + '</tr></thead><tbody>';
    rows.forEach(function(r) {
        var sc = r.sc, pct = r.pct;
        var sCol = sc > 0 ? '#3fb950' : sc < 0 ? '#f85149' : '#7d8590';
        var pCol = pct > 0 ? '#3fb950' : pct < 0 ? '#f85149' : '#7d8590';
        var zCol = (r.zone==='AST'||r.zone==='ASO') ? '#3fb950' : (r.zone==='BST'||r.zone==='BSO') ? '#f85149' : '#7d8590';
        var fIcon = r.ft > 0 ? 'bi-arrow-up-short' : r.ft < 0 ? 'bi-arrow-down-short' : 'bi-dash';
        var fCol  = r.ft > 0 ? '#3fb950' : r.ft < 0 ? '#f85149' : '#7d8590';
        var nfCol = r.nf > 0 ? '#3fb950' : r.nf < 0 ? '#f85149' : '#7d8590';
        h += '<tr>'
            + '<td style="font-weight:700;white-space:nowrap;">' + _gdbNameLink(r.name) + '</td>'
            + '<td class="gdb-mono">' + r.ltp.toLocaleString('en-IN',{maximumFractionDigits:1}) + '</td>'
            + '<td style="color:' + pCol + '">' + (pct>=0?'+':'') + pct.toFixed(2) + '%</td>'
            + '<td style="color:' + sCol + ';font-weight:700;">' + (sc>=0?'+':'') + sc.toFixed(1) + '</td>'
            + '<td><span class="bt-tz" style="color:' + zCol + ';border-color:' + zCol + '44;background:' + zCol + '11;">' + r.zone + '</span></td>'
            + '<td><i class="bi bi-circle-fill" style="color:' + nfCol + ';font-size:0.55rem;"></i></td>'
            + '<td><i class="bi ' + fIcon + '" style="color:' + fCol + ';font-size:0.9rem;"></i></td>'
            + '<td><button class="gdb-analyze-btn gtb-win-btn" data-name="' + r.name + '" style="font-size:0.48rem;padding:1px 4px;"><i class="bi bi-search"></i></button></td>'
            + '</tr>';
    });
    h += '</tbody></table>';
    jQ('#gdb-body-score').html(h);
}

// ── WIDGET: Opportunity Ranker ────────────────────────────────────────────────
function _gdbWidgetOpps() {
    var ltps  = _btLtps(), opens = _btOpens();
    var labelMap = {'2':'AST','1':'ASO','0':'B/W','-1':'BSO','-2':'BST'};
    var checkNames = (typeof FO_LIST !== 'undefined' ? FO_LIST : []).concat(
        _BT_INSTR.map(function(i) { return i.name; })
    );
    var seenN = {}; checkNames = checkNames.filter(function(n) { return seenN[n] ? false : (seenN[n]=true); });

    var bulls = [], bears = [];
    checkNames.forEach(function(name) {
        var ltp  = parseFloat((ltps[name]  || {}).ltp   || 0);
        var open = parseFloat((opens[name] || {}).price || 0);
        if (!ltp) return;
        var cs; try { cs = computeInstrumentScore(name); } catch(e) { return; }
        var sc   = cs.total;
        var zone = labelMap[String(cs.current_trend)] || 'B/W';
        var pct  = open ? ((ltp-open)/open*100) : 0;
        var sm   = INSTRUMENT_SCORE_MAP[name] || {};
        var oiComp = Math.min(2, Math.max(-2, (sm.oi_obv||0)/2));
        var pcrComp = 0;
        if (sm.pcr != null) { var p = parseFloat(sm.pcr); pcrComp = p>1.3?1:p<0.7?-1:0; }
        var evBonus = 0;
        if (typeof _BTO !== 'undefined') {
            (_BTO.events||[]).slice(0,20).forEach(function(ev) { if (ev.name===name) evBonus += ev.type==='bull'?1.5:ev.type==='bear'?-1.5:0; });
        }
        var oppScore = sc * 1.5 + cs.current_trend + cs.futures_trend + oiComp + pcrComp + evBonus + (pct>0.5?0.5:pct<-0.5?-0.5:0);
        if (Math.abs(oppScore) < 2) return;
        var item = { name:name, sc:sc, zone:zone, pct:pct, oppScore:oppScore };
        if (oppScore > 0) bulls.push(item); else bears.push(item);
    });

    bulls.sort(function(a,b) { return b.oppScore - a.oppScore; });
    bears.sort(function(a,b) { return a.oppScore - b.oppScore; });

    var renderList = function(arr, col) {
        if (!arr.length) return '<div class="gdb-hint">No signals above threshold</div>';
        return arr.slice(0,8).map(function(o, i) {
            var zc = (o.zone==='AST'||o.zone==='ASO') ? '#3fb950' : (o.zone==='BST'||o.zone==='BSO') ? '#f85149' : '#7d8590';
            var pCol = o.pct>0?'#3fb950':o.pct<0?'#f85149':'#7d8590';
            var bars = '', strength = Math.min(5, Math.round(Math.abs(o.oppScore)/2));
            for (var b=0;b<5;b++) bars += '<span style="display:inline-block;width:4px;height:8px;border-radius:1px;margin-right:1px;background:' + (b<strength?col:'#30363d') + ';"></span>';
            return '<div class="gdb-opp-row">'
                + '<span class="gdb-opp-rank" style="color:' + col + '">' + (i+1) + '</span>'
                + '<span class="gdb-opp-name">' + _gdbNameLink(o.name) + '</span>'
                + '<span class="bt-tz" style="color:' + zc + ';border-color:' + zc + '44;background:' + zc + '11;font-size:0.48rem;">' + o.zone + '</span>'
                + '<span style="color:' + pCol + ';font-size:0.52rem;">' + (o.pct>=0?'+':'') + o.pct.toFixed(2) + '%</span>'
                + '<span style="color:' + col + ';font-weight:700;font-size:0.62rem;margin-left:auto;">' + (o.oppScore>=0?'+':'') + o.oppScore.toFixed(1) + '</span>'
                + '<div style="display:flex;align-items:center;gap:1px;flex-shrink:0;">' + bars + '</div>'
                + '<button class="gdb-analyze-btn gtb-win-btn" data-name="' + o.name + '" style="font-size:0.44rem;padding:1px 3px;flex-shrink:0;"><i class="bi bi-search"></i></button>'
                + '</div>';
        }).join('');
    };

    jQ('#gdb-body-opps').html(
        '<div class="gdb-opp-section-lbl" style="color:#3fb950;"><i class="bi bi-arrow-up-circle-fill"></i> Bull opportunities (' + bulls.length + ')</div>'
        + renderList(bulls, '#3fb950')
        + '<div class="gdb-opp-section-lbl" style="color:#f85149;margin-top:8px;"><i class="bi bi-arrow-down-circle-fill"></i> Bear opportunities (' + bears.length + ')</div>'
        + renderList(bears, '#f85149')
    );
}

// ── WIDGET: Divergence ─────────────────────────────────────────────────────────
function _gdbWidgetDivergence() {
    var indices = [
        { idx:'NIFTY 50',   map: NIFTY_50_WEIGHTED_STOCKS,   label:'N50' },
        { idx:'NIFTY BANK', map: NIFTY_BANK_WEIGHTED_STOCKS, label:'BANK' },
    ];
    var h = '';
    indices.forEach(function(ig) {
        var idxSc = 0, idxZone = 'B/W';
        try { var cs = computeInstrumentScore(ig.idx); idxSc = cs.total; idxZone = {'2':'AST','1':'ASO','0':'B/W','-1':'BSO','-2':'BST'}[String(cs.current_trend)]||'B/W'; } catch(e) {}
        var wSc = 0, totalW = 0, aboveConst = 0, belowConst = 0;
        jQ.each(ig.map, function(name, weight) {
            try {
                var cs = computeInstrumentScore(name);
                wSc += cs.total * (weight/100); totalW += weight;
                if (cs.total > 0) aboveConst++; else if (cs.total < 0) belowConst++;
            } catch(e) {}
        });
        var constSc  = totalW ? wSc : 0;
        var div      = idxSc - constSc;
        var divAbs   = Math.abs(div);
        var divCol   = divAbs > 2 ? '#fbbf24' : divAbs <= 0.5 ? (idxSc>0?'#3fb950':idxSc<0?'#f85149':'#7d8590') : '#7d8590';
        var divLabel = divAbs > 2 && div > 0 ? 'Index leading' : divAbs > 2 && div < 0 ? 'Index lagging' : divAbs <= 0.5 ? 'Aligned' : 'Mild divergence';
        var divAction = divAbs > 2 && div > 0 ? 'Constituents may follow OR index may correct'
                       : divAbs > 2 && div < 0 ? 'Index likely to catch up -- high prob move'
                       : divAbs <= 0.5         ? 'Strong broad participation -- trend has conviction'
                       : 'Monitor for widening';
        var idxCol  = idxSc > 0 ? '#3fb950' : idxSc < 0 ? '#f85149' : '#7d8590';
        var cSCol   = constSc > 0 ? '#3fb950' : constSc < 0 ? '#f85149' : '#7d8590';
        var idxBarW = Math.min(100, Math.max(0, (idxSc + 10) / 20 * 100)).toFixed(0);
        var cBarW   = Math.min(100, Math.max(0, (constSc + 10) / 20 * 100)).toFixed(0);
        h += '<div class="gdb-div-block">'
            + '<div class="gdb-div-title" style="color:var(--gtb-accent);">' + ig.idx + '</div>'
            + '<div class="gdb-div-row"><span>Index</span><div class="gdb-div-track"><div class="gdb-div-bar" style="width:' + idxBarW + '%;background:' + idxCol + ';"></div></div><span style="color:' + idxCol + ';font-weight:700;">' + (idxSc>=0?'+':'') + idxSc.toFixed(1) + '</span><span class="bt-tz" style="color:' + idxCol + ';border-color:' + idxCol + '44;background:' + idxCol + '11;font-size:0.44rem;">' + idxZone + '</span></div>'
            + '<div class="gdb-div-row"><span>Constit.</span><div class="gdb-div-track"><div class="gdb-div-bar" style="width:' + cBarW + '%;background:' + cSCol + ';"></div></div><span style="color:' + cSCol + ';font-weight:700;">' + (constSc>=0?'+':'') + constSc.toFixed(2) + '</span><span style="color:var(--gtb-muted);font-size:0.48rem;">wt. avg</span></div>'
            + '<div class="gdb-div-verdict" style="border-color:' + divCol + '44;background:' + divCol + '11;">'
            +   '<span style="color:' + divCol + ';font-weight:700;font-size:0.58rem;">' + divLabel + ' (' + (div>=0?'+':'') + div.toFixed(1) + ')</span>'
            +   '<span style="color:var(--gtb-muted);font-size:0.5rem;display:block;margin-top:2px;">' + divAction + '</span>'
            +   '<span style="color:var(--gtb-muted);font-size:0.48rem;">' + aboveConst + ' bull / ' + belowConst + ' bear constituents</span>'
            + '</div>'
            + '</div>';
    });
    jQ('#gdb-body-divergence').html(h || '<span class="gdb-hint">Score data not available</span>');
}

// ── WIDGET: Level Maps ─────────────────────────────────────────────────────────
function _gdbWidgetLevelMap() {
    var ltps  = _btLtps(), opens = _btOpens();
    var pins  = _GDB.levelPins;
    var allNames = _BT_INSTR.map(function(i) { return i.name; }).concat(typeof FO_LIST !== 'undefined' ? FO_LIST : []);
    var seenN = {}; allNames = allNames.filter(function(n) { return seenN[n] ? false : (seenN[n]=true); });

    var selHtml = pins.map(function(p, idx) {
        var opts = allNames.map(function(n) { return '<option value="' + n + '"' + (n===p?' selected':'') + '>' + n + '</option>'; }).join('');
        return '<select class="gdb-pin-sel" data-idx="' + idx + '" style="font-size:0.48rem;padding:1px 4px;background:var(--gtb-surface2);border:1px solid var(--gtb-border2);border-radius:2px;color:var(--gtb-text);">' + opts + '</select>';
    }).join('');

    var maps = pins.map(function(name) {
        var ltp = parseFloat((ltps[name] || {}).ltp || 0);
        if (!ltp) return '<div class="gdb-lm-no-data">' + name + '<br><span style="color:var(--gtb-muted);font-size:0.5rem;">No LTP</span></div>';
        var tr = null; try { tr = generateTrend(name); } catch(e) {}
        var aso  = tr ? parseFloat(tr.strikeData.ustrikeOne) : null;
        var ast  = tr ? parseFloat(tr.strikeData.ustrikeTwo) : null;
        var bso  = tr ? parseFloat(tr.strikeData.bstrikeOne) : null;
        var bst  = tr ? parseFloat(tr.strikeData.bstrikeTwo) : null;
        var vixL = tr ? parseFloat(tr.vix.vixDDLower)        : null;
        var vixU = tr ? parseFloat(tr.vix.vixDDUpper)        : null;

        var levels = [];
        if (vixL) levels.push({v:vixL,col:'#38bdf8'}); if (bst) levels.push({v:bst,col:'#f85149'});
        if (bso)  levels.push({v:bso,col:'#fca5a5'});  if (aso) levels.push({v:aso,col:'#86efac'});
        if (ast)  levels.push({v:ast,col:'#3fb950'});  if (vixU)levels.push({v:vixU,col:'#38bdf8'});
        if (!levels.length) return '<div class="gdb-lm-no-data">' + name + '<br><span style="color:var(--gtb-muted);font-size:0.5rem;">No strike data</span></div>';
        levels.sort(function(a,b){return a.v-b.v;});
        var min = levels[0].v, max = levels[levels.length-1].v;
        var span = max - min || 1; min -= span*0.05; max += span*0.05; span = max-min;
        var pos = function(v){ return Math.max(0,Math.min(100,((v-min)/span*100))).toFixed(1); };
        var f = function(v){ return v>=10000?v.toLocaleString('en-IN',{maximumFractionDigits:0}):v>=100?v.toFixed(1):v.toFixed(2); };

        var zones = '';
        if (bst&&bso) zones+='<div style="position:absolute;left:'+pos(bst)+'%;width:'+(parseFloat(pos(bso))-parseFloat(pos(bst)))+'%;height:100%;background:#f8514940;"></div>';
        if (bso&&aso) zones+='<div style="position:absolute;left:'+pos(bso)+'%;width:'+(parseFloat(pos(aso))-parseFloat(pos(bso)))+'%;height:100%;background:#7d859018;"></div>';
        if (aso&&ast) zones+='<div style="position:absolute;left:'+pos(aso)+'%;width:'+(parseFloat(pos(ast))-parseFloat(pos(aso)))+'%;height:100%;background:#3fb95040;"></div>';

        var ticks = levels.map(function(l){ return '<div style="position:absolute;left:'+pos(l.v)+'%;top:0;width:1.5px;height:100%;background:'+l.col+';transform:translateX(-50%);"></div>'; }).join('');
        var ltpP = pos(ltp);
        var ltpCol = ltp>=(aso||0)?'#3fb950':ltp<=(bso||Infinity)?'#f85149':'#ffbe0b';
        var ltpDot = '<div style="position:absolute;left:'+ltpP+'%;top:50%;transform:translate(-50%,-50%);width:8px;height:8px;border-radius:50%;background:'+ltpCol+';border:1.5px solid var(--gtb-bg);z-index:2;"></div>';
        var ltpLabel = '<div style="position:absolute;left:'+ltpP+'%;bottom:-12px;transform:translateX(-50%);font-size:0.44rem;color:'+ltpCol+';font-weight:700;white-space:nowrap;">'+f(ltp)+'</div>';

        var cs = 0, zone = 'B/W';
        try { var cst = computeInstrumentScore(name); cs = cst.total; zone = {'2':'AST','1':'ASO','0':'B/W','-1':'BSO','-2':'BST'}[String(cst.current_trend)]||'B/W'; } catch(e) {}
        var sCol = cs>0?'#3fb950':cs<0?'#f85149':'#7d8590';
        var zCol = (zone==='AST'||zone==='ASO')?'#3fb950':(zone==='BST'||zone==='BSO')?'#f85149':'#7d8590';

        return '<div class="gdb-lm-card">'
            + '<div class="gdb-lm-name-row">'
            +   '<span class="gdb-lm-name">' + name + '</span>'
            +   '<span style="color:' + ltpCol + ';font-size:0.58rem;font-weight:700;">' + f(ltp) + '</span>'
            +   '<span class="bt-tz" style="color:' + zCol + ';border-color:' + zCol + '44;background:' + zCol + '11;font-size:0.44rem;">' + zone + '</span>'
            +   '<span style="color:' + sCol + ';font-size:0.54rem;font-weight:700;">' + (cs>=0?'+':'') + cs.toFixed(1) + '</span>'
            + '</div>'
            + '<div style="position:relative;height:16px;background:var(--gtb-surface2);border-radius:3px;overflow:visible;margin:6px 0 16px;">'
            +   zones + ticks + ltpDot + ltpLabel
            + '</div>'
            + '<div style="display:flex;justify-content:space-between;font-size:0.44rem;color:var(--gtb-muted);margin-top:2px;">'
            +   (vixL?'<span style="color:#38bdf8">VL '+f(vixL)+'</span>':'')
            +   (bst?'<span style="color:#f85149">BST '+f(bst)+'</span>':'')
            +   (bso?'<span style="color:#fca5a5">BSO '+f(bso)+'</span>':'')
            +   (aso?'<span style="color:#86efac">ASO '+f(aso)+'</span>':'')
            +   (ast?'<span style="color:#3fb950">AST '+f(ast)+'</span>':'')
            +   (vixU?'<span style="color:#38bdf8">VU '+f(vixU)+'</span>':'')
            + '</div>'
            + '</div>';
    }).join('');

    jQ('#gdb-body-levelmap').html('<div class="gdb-lm-sels">' + selHtml + '</div><div class="gdb-lm-grid">' + maps + '</div>');
}

// ── WIDGET: OI Flow ────────────────────────────────────────────────────────────
function _gdbWidgetOIFlow() {
    var names = ['NIFTY 50','NIFTY BANK','RELIANCE','HDFCBANK','ICICIBANK','SENSEX'];
    var h = '';
    names.forEach(function(name) {
        var sm = INSTRUMENT_SCORE_MAP[name];
        if (!sm || !sm.oiData || !sm.oiData.tableData || !sm.oiData.tableData.length) {
            h += '<div class="gdb-oi-row"><span class="gdb-oi-name">' + name + '</span><span class="gdb-hint" style="font-size:0.48rem;">no OI data</span></div>';
            return;
        }
        var netCE = 0, netPE = 0;
        sm.oiData.tableData.forEach(function(row){ netCE += parseFloat(row.CHG_OI_CE||0); netPE += parseFloat(row.CHG_OI_PE||0); });
        var total = Math.max(Math.abs(netCE), Math.abs(netPE)) || 1;
        var net   = netPE - netCE;
        var col   = net > 0 ? '#3fb950' : '#f85149';
        var label = net > 0 ? 'PE dom' : 'CE dom';
        var peW   = (netPE/total*100).toFixed(0), ceW = (netCE/total*100).toFixed(0);
        var pcr   = sm.pcr ? parseFloat(sm.pcr).toFixed(2) : '--';
        h += '<div class="gdb-oi-row">'
            + '<span class="gdb-oi-name">' + name + '</span>'
            + '<div class="gdb-oi-flow-bars">'
            +   '<div class="gdb-oi-track"><div style="height:100%;width:' + ceW + '%;background:#f85149;border-radius:2px;"></div></div>'
            +   '<div class="gdb-oi-track"><div style="height:100%;width:' + peW + '%;background:#3fb950;border-radius:2px;"></div></div>'
            + '</div>'
            + '<span class="gdb-oi-net" style="color:' + col + '">' + label + '</span>'
            + '<span class="gdb-oi-val" style="color:var(--gtb-muted);">PCR ' + pcr + '</span>'
            + '</div>';
    });
    jQ('#gdb-body-oiflow').html(h || '<div class="gdb-hint">Run main refresh to load OI data</div>');
}

// ── WIDGET: Scanner Feed ───────────────────────────────────────────────────────
function _gdbWidgetScanner() {
    if (typeof _BTO === 'undefined' || !_BTO.events || !_BTO.events.length) {
        jQ('#gdb-body-scanner').html('<div class="gdb-hint">Start the scanner in the Opportunities tab to see live events here</div>');
        return;
    }
    var typeCol = {bull:'#3fb950',bear:'#f85149',warn:'#fbbf24',info:'#7d8590'};
    var h = (_BTO.running
        ? '<div style="color:#3fb950;font-size:0.5rem;margin-bottom:4px;"><i class="bi bi-circle-fill" style="font-size:0.35rem;"></i> Live -- ' + Object.keys(_BTO.prevZones||{}).length + ' instruments</div>'
        : '<div style="color:#7d8590;font-size:0.5rem;margin-bottom:4px;"><i class="bi bi-circle"></i> Stopped</div>')
        + _BTO.events.slice(0,25).map(function(ev) {
            var c = typeCol[ev.type] || '#7d8590';
            return '<div class="gdb-sc-row" style="border-left-color:' + c + ';">'
                + '<span class="gdb-sc-ts">' + ev.ts + '</span>'
                + '<span class="gdb-sc-name" style="color:' + c + '">' + ev.name + '</span>'
                + '<span class="gdb-sc-detail">' + ev.detail + '</span>'
                + '<span class="gdb-sc-score" style="color:' + c + '">' + (ev.score>=0?'+':'') + parseFloat(ev.score).toFixed(1) + '</span>'
                + '</div>';
        }).join('');
    jQ('#gdb-body-scanner').html(h);
}

// ── WIDGET: Backtest Summary ───────────────────────────────────────────────────
function _gdbWidgetBacktest() {
    var cacheKey = null;
    try {
        for (var k in localStorage) {
            if (k.indexOf('GTB_915TREND_') === 0 && k.indexOf('_250_v2') > 0) { cacheKey = k; break; }
        }
    } catch(e) {}

    var todayCombo = '--', n915 = 'B/W', b915 = 'B/W';
    try {
        var nb = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}');
        n915 = (nb['NIFTY 50'] || {}).CLOSE_9_15 || 'B/W';
        b915 = (nb['NIFTY BANK'] || {}).CLOSE_9_15 || 'B/W';
        todayCombo = n915 + ' / ' + b915;
    } catch(e) {}

    if (!cacheKey) {
        jQ('#gdb-body-backtest').html(
            '<div class="gdb-bt-row"><span>Today\'s 9:15</span><span style="color:var(--gtb-accent);font-weight:700;">' + todayCombo + '</span></div>'
            + '<div class="gdb-hint" style="margin-top:8px;">No cached backtest data. Open the 9:15 Opening-Trend tool to compute.</div>'
        );
        return;
    }

    try {
        var rows = JSON.parse(localStorage.getItem(cacheKey) || '[]');
        if (!rows.length) throw new Error('empty');

        var wins = 0, losses = 0, total915 = 0, totalPL = 0, mfes = [];
        var todayWins = 0, todayLosses = 0, todayTotal = 0, todayPL = 0;
        var lvWins = 0, lvLoss = 0, hvWins = 0, hvLoss = 0;
        rows.forEach(function(r) {
            if (!r.legs || !r.legs.length) return;
            total915++;
            var rowPL = r.legs.reduce(function(s,l){ return s + parseFloat(l.pl||0); }, 0);
            totalPL += rowPL;
            if (rowPL > 0) wins++; else if (rowPL < 0) losses++;
            r.legs.forEach(function(leg) { mfes.push(parseFloat(leg.mfe||0)); });
            var todayKey = (n915||'B/W') + '/' + (b915||'B/W');
            var combo = (r.nifty_combo||'') + '/' + (r.bank_combo||'');
            if (combo === todayKey) { todayTotal++; todayPL += rowPL; if (rowPL>0) todayWins++; else if (rowPL<0) todayLosses++; }
            var vix = parseFloat(r.vix || 0);
            if (vix < 15) { if (rowPL>0) lvWins++; else lvLoss++; } else { if (rowPL>0) hvWins++; else hvLoss++; }
        });

        var winRate = total915 ? (wins/total915*100).toFixed(0) : '--';
        var avgPL   = total915 ? (totalPL/total915).toFixed(1) : '--';
        var avgMFE  = mfes.length ? (mfes.reduce(function(a,b){return a+b;},0)/mfes.length).toFixed(1) : '--';
        var todayWR = todayTotal ? (todayWins/todayTotal*100).toFixed(0) : '--';
        var lvWR    = (lvWins+lvLoss) ? (lvWins/(lvWins+lvLoss)*100).toFixed(0) : '--';
        var hvWR    = (hvWins+hvLoss) ? (hvWins/(hvWins+hvLoss)*100).toFixed(0) : '--';
        var tc = todayWR !== '--' && parseFloat(todayWR) >= 60 ? '#3fb950' : parseFloat(todayWR) < 40 ? '#f85149' : '#fbbf24';

        jQ('#gdb-body-backtest').html(
            '<div class="gdb-bt-row bt-highlight"><span>Today\'s combo</span><span style="color:var(--gtb-accent);font-weight:700;">' + todayCombo + '</span></div>'
            + (todayTotal ? '<div class="gdb-bt-row"><span>Combo win rate</span><span style="color:' + tc + ';font-weight:700;">' + todayWR + '% (' + todayTotal + ' days)</span></div>' : '')
            + '<div style="height:1px;background:var(--gtb-border2);margin:5px 0;"></div>'
            + '<div class="gdb-bt-row"><span>Overall win rate</span><span style="color:' + (parseFloat(winRate)>=55?'#3fb950':'#f85149') + ';font-weight:700;">' + winRate + '%</span></div>'
            + '<div class="gdb-bt-row"><span>Avg P/L per day</span><span style="color:' + (parseFloat(avgPL)>=0?'#3fb950':'#f85149') + '">' + avgPL + ' pts</span></div>'
            + '<div class="gdb-bt-row"><span>Avg max favorable</span><span style="color:#3fb950">' + avgMFE + ' pts</span></div>'
            + '<div class="gdb-bt-row"><span>Low-VIX (&lt;15) win%</span><span style="color:#3fb950">' + lvWR + '%</span></div>'
            + '<div class="gdb-bt-row"><span>High-VIX (15+) win%</span><span style="color:#fbbf24">' + hvWR + '%</span></div>'
            + '<div class="gdb-bt-row"><span>Sample size</span><span style="color:var(--gtb-muted)">' + total915 + ' days</span></div>'
        );
    } catch(e) {
        jQ('#gdb-body-backtest').html('<div class="gdb-bt-row"><span>Today\'s 9:15</span><span style="color:var(--gtb-accent)">' + todayCombo + '</span></div>'
            + '<div class="gdb-hint" style="margin-top:6px;">Could not parse cached data: ' + e.message + '</div>');
    }
}

// ── WIDGET: Risk Manager ───────────────────────────────────────────────────────
function _gdbWidgetRisk() {
    var ltps = _btLtps();
    var vixVal = 0;
    try { vixVal = parseFloat((ltps['INDIA VIX']||{}).ltp) || 0; } catch(e) {}
    if (!vixVal) try { vixVal = VIX || 0; } catch(e) {}
    var vixSizeMult = vixVal > 25 ? 0.5 : vixVal > 18 ? 0.7 : vixVal > 13 ? 0.85 : 1.0;
    var vixLabel    = vixVal > 25 ? 'Reduce to 50%' : vixVal > 18 ? 'Reduce to 70%' : vixVal > 13 ? 'Reduce to 85%' : 'Full size OK';
    var vixCol      = vixVal > 25 ? '#f85149' : vixVal > 18 ? '#f97316' : vixVal > 13 ? '#fbbf24' : '#3fb950';

    var totalPL = 0, posCount = _GDB.positions.length;
    var posHtml = _GDB.positions.map(function(p, i) {
        var ltp = parseFloat((ltps[p.name] || {}).ltp || 0);
        var currentPrice = ltp || p.buyPrice;
        var multiplier   = (p.type === 'CE' || p.type === 'PE') ? (p.lotSize||1) * p.qty : p.qty;
        var pl = (currentPrice - p.buyPrice) * multiplier;
        totalPL += pl;
        var plCol = pl >= 0 ? '#3fb950' : '#f85149';
        var f = function(v){ return (v>=0?'+':'')+parseFloat(v).toLocaleString('en-IN',{maximumFractionDigits:0}); };
        return '<div class="gdb-risk-pos">'
            + '<span class="gdb-rp-name">' + p.name + '</span>'
            + '<span class="gdb-rp-type" style="color:' + (p.type==='CE'?'#f85149':'#3fb950') + '">' + p.type + ' ' + p.strike + '</span>'
            + '<span class="gdb-rp-pl" style="color:' + plCol + '">' + f(pl) + '</span>'
            + '<button class="gdb-del-pos gtb-win-btn" data-i="' + i + '" style="font-size:0.44rem;padding:1px 4px;color:#f85149;"><i class="bi bi-x"></i></button>'
            + '</div>';
    }).join('');

    var plCol = totalPL >= 0 ? '#3fb950' : '#f85149';
    var f2 = function(v){ return (v>=0?'+':'')+parseFloat(v).toLocaleString('en-IN',{maximumFractionDigits:0}); };
    var allInst = _BT_INSTR.concat((typeof FO_LIST!=='undefined'?FO_LIST:[]).map(function(n){return{name:n};}));

    jQ('#gdb-body-risk').html(
        (posCount ? '<div class="gdb-risk-positions">' + posHtml + '</div><div style="height:1px;background:var(--gtb-border2);margin:5px 0;"></div>' : '')
        + '<div class="gdb-risk-stat"><span>Open positions</span><span style="font-weight:700;">' + posCount + '</span></div>'
        + '<div class="gdb-risk-stat"><span>Total P/L</span><span style="color:' + plCol + ';font-weight:700;">' + f2(totalPL) + '</span></div>'
        + '<div class="gdb-risk-stat"><span>India VIX</span><span style="color:' + vixCol + '">' + (vixVal ? vixVal.toFixed(1) : '--') + '</span></div>'
        + '<div class="gdb-risk-stat"><span>VIX size adj.</span><span style="color:' + vixCol + '">' + vixLabel + '</span></div>'
        + '<div class="gdb-risk-stat"><span>Size multiplier</span><span style="color:' + vixCol + ';font-weight:700;">' + (vixSizeMult*100).toFixed(0) + '% of normal</span></div>'
        + '<div style="height:1px;background:var(--gtb-border2);margin:6px 0;"></div>'
        + '<div class="gdb-risk-add-form">'
        +   '<select id="gdb-rp-name" class="gdb-r-inp" style="min-width:80px">'
        +   allInst.map(function(i){return '<option>'+i.name+'</option>';}).join('')
        +   '</select>'
        +   '<select id="gdb-rp-type" class="gdb-r-inp"><option>CE</option><option>PE</option><option>FUT</option></select>'
        +   '<input id="gdb-rp-strike" class="gdb-r-inp" type="number" placeholder="Strike" style="width:70px">'
        +   '<input id="gdb-rp-qty"    class="gdb-r-inp" type="number" placeholder="Lots" value="1" style="width:40px">'
        +   '<input id="gdb-rp-lot"    class="gdb-r-inp" type="number" placeholder="LotSz" style="width:50px">'
        +   '<input id="gdb-rp-buy"    class="gdb-r-inp" type="number" placeholder="Buy px" style="width:60px">'
        +   '<button id="gdb-add-pos" class="gtb-win-btn gdb-add-btn"><i class="bi bi-plus-lg"></i> Add</button>'
        + '</div>'
    );
}
