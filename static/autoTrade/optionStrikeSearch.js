// ─── optionStrikeSearch.js ──────────────────────────────────────────────────
// Search any F&O underlying and see its ATM CE/PE strike plus the configured
// hedge-leg CE/PE strikes (ATM ± HEDGE_DIFF_*, see config.js), with trading
// symbols/tokens so the hedge leg can be identified/placed directly.
// ─────────────────────────────────────────────────────────────────────────────

function _ossHedgeDiff(name) {
    if (name === 'NIFTY 50' || name === 'NIFTY') return HEDGE_DIFF_NIFTY;
    if (name === 'NIFTY BANK' || name === 'BANKNIFTY') return HEDGE_DIFF_BANKNIFTY;
    return HEDGE_DIFF_STOCKS;
}

var _OSS_OPT_TO_DISPLAY = { 'NIFTY': 'NIFTY 50', 'BANKNIFTY': 'NIFTY BANK', 'FINNIFTY': 'NIFTY FIN SERVICE', 'MIDCPNIFTY': 'NIFTY MID SELECT' };
var _OSS_DISPLAY_TO_OPT = { 'NIFTY 50': 'NIFTY', 'NIFTY BANK': 'BANKNIFTY', 'NIFTY FIN SERVICE': 'FINNIFTY', 'NIFTY MID SELECT': 'MIDCPNIFTY' };

function _ossAllNames() {
    var seen = {}, list = [];
    function add(n) { n = (n || '').trim().toUpperCase(); n = _OSS_OPT_TO_DISPLAY[n] || n; if (n && !seen[n]) { seen[n] = 1; list.push(n); } }
    if (typeof OPTION_STRIKE_LIST !== 'undefined') OPTION_STRIKE_LIST.forEach(function (r) { add(r.name); });
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

function _ossShowPopup() {
    var html = '<div class="oss-wrap">'
        + '<div class="oss-header">'
        +   '<div class="bt-bk-search" style="min-width:280px;">'
        +     '<input type="text" id="oss-input" placeholder="Search stock / index (F&amp;O)…" autocomplete="off">'
        +     '<button id="oss-search-btn" class="fsig-add-btn"><i class="bi bi-search"></i> Search</button>'
        +     '<div id="oss-ac-drop" class="fsig-ac-drop" style="position:fixed;"></div>'
        +   '</div>'
        +   '<label class="oss-ltp-override" title="Leave blank to use the last cached LTP for this instrument">'
        +     'LTP override <input type="text" id="oss-ltp-override" placeholder="auto">'
        +   '</label>'
        + '</div>'
        + '<div id="oss-result" class="oss-result">'
        +   '<div class="sv-empty-state"><i class="bi bi-search"></i><span>Search an instrument to see ATM + hedge strikes</span></div>'
        + '</div>'
        + '</div>';

    showPopUpWindow('option-strike-search', html, 'Option Strike Search', 720, 520);
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
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
}

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
jQ(document).on('keydown', '#oss-input, #oss-ltp-override', function (e) { if (e.key === 'Enter') _ossRunSearch(); });

function _ossRunSearch() {
    var name = jQ('#oss-input').val().trim().toUpperCase();
    var $result = jQ('#oss-result');
    if (!name) return;
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
    var allNameMatches = OPTION_STRIKE_LIST.filter(function (r) { return r.name === optName; });
    var availExpiries = Array.from(new Set(allNameMatches.map(function (r) { return moment(r.expiry, 'DD-MM-YYYY').format('YYYY-MM-DD'); }))).sort();
    var targetExpiry = _dlResolveExpiryFor(_dlConfiguredExpiryForName(optName), availExpiries);
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

    var atmStrike = _ossNearestStrike(strikes, ltp);
    var hedgeDiff = _ossHedgeDiff(name);
    var ceHedgeTarget = atmStrike + hedgeDiff;
    var peHedgeTarget = atmStrike - hedgeDiff;
    var ceHedgeStrike = _ossNearestStrike(strikes, ceHedgeTarget);
    var peHedgeStrike = _ossNearestStrike(strikes, peHedgeTarget);

    function _find(strike, type) {
        return matches.find(function (r) { return parseFloat(r.strike) === strike && r.instrument_type === type; });
    }
    function _rowHtml(label, strike, type, targetNote) {
        var entry = _find(strike, type);
        var badgeColor = type === 'CE' ? 'var(--gtb-green)' : 'var(--gtb-red)';
        if (!entry) {
            return '<tr><td>' + label + '</td><td>' + strike + '</td><td colspan="3" class="oss-na">no ' + type + ' contract at this strike</td></tr>';
        }
        var kiteLink = 'https://kite.zerodha.com/markets/ext/chart/web/tvc/NFO/' + entry.tradingsymbol + '/' + entry.instrument_token;
        return '<tr>'
            + '<td>' + label + (targetNote ? '<div class="oss-target-note">' + targetNote + '</div>' : '') + '</td>'
            + '<td class="oss-strike"><span class="oss-type-badge" style="color:' + badgeColor + ';border-color:' + badgeColor + ';">' + type + '</span> ' + strike + '</td>'
            + '<td class="oss-symbol">' + entry.tradingsymbol + '</td>'
            + '<td class="oss-token">' + entry.instrument_token + '</td>'
            + '<td><a href="' + kiteLink + '" target="_blank" rel="noopener" class="oss-chart-link" title="Open chart"><i class="bi bi-graph-up"></i></a></td>'
            + '</tr>';
    }

    var expiry = matches[0] && matches[0].expiry;
    var html = '<div class="oss-summary">'
        + '<span class="oss-summary-name">' + name + '</span>'
        + '<span class="oss-summary-ltp">LTP ' + ltp.toFixed(2) + (isNaN(override) ? '' : ' <span class="oss-override-tag">override</span>') + '</span>'
        + '<span class="oss-summary-expiry">Expiry ' + (expiry || '—') + '</span>'
        + '<span class="oss-summary-hedge">Hedge diff ±' + hedgeDiff + ' pts</span>'
        + '</div>'
        + '<table class="oss-table">'
        +   '<thead><tr><th>Leg</th><th>Strike</th><th>Trading symbol</th><th>Token</th><th></th></tr></thead>'
        +   '<tbody>'
        +     _rowHtml('ATM CE', atmStrike, 'CE')
        +     _rowHtml('ATM PE', atmStrike, 'PE')
        +     _rowHtml('Hedge CE (ATM +' + hedgeDiff + ')', ceHedgeStrike, 'CE', 'target ' + ceHedgeTarget + ' → nearest listed ' + ceHedgeStrike)
        +     _rowHtml('Hedge PE (ATM −' + hedgeDiff + ')', peHedgeStrike, 'PE', 'target ' + peHedgeTarget + ' → nearest listed ' + peHedgeStrike)
        +   '</tbody>'
        + '</table>';
    $result.html(html);
}
