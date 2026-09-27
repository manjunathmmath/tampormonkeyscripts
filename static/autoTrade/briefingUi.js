// ══════════════════════════════════════════════════════════════════════════════════════
// Market Briefing — UI (renders the brief from briefingText.js into the Briefing tab)
// ══════════════════════════════════════════════════════════════════════════════════════
var _BF_LAST = null;          // last generated brief (in memory)
var _BF_SEQ = 0;
var _BF_GENERATING = false;
var _BF_OPEN = {};            // section id -> user-chosen open state (survives re-render)

function _bfLS(k, v) {
    try { if (v === undefined) { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    return null;
}
function _bfEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function _bfMd(s) { return _bfEsc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }
function _bfPlain(s) { return String(s == null ? '' : s).replace(/\*\*/g, ''); }
function _bfCell(c) { return (c && typeof c === 'object') ? c : { x: c, tone: null }; }

function _bfInjectStyle() {
    if (document.getElementById('gtb-bf-style')) return;
    var css = ''
    + '.bf-scope .bf-wrap{padding:14px 18px 40px;max-width:1180px;margin:0 auto;color:var(--gtb-text);font-size:13.5px;line-height:1.55;}'
    + '.bf-scope .bf-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;}'
    + '.bf-scope .bf-btn{background:var(--gtb-surface2);color:var(--gtb-text);border:1px solid var(--gtb-border);padding:5px 12px;font-size:12px;cursor:pointer;}'
    + '.bf-scope .bf-btn:hover{border-color:var(--gtb-accent);}'
    + '.bf-scope .bf-meta{color:var(--gtb-muted);font-size:12px;}'
    + '.bf-scope .bf-head{border:1px solid var(--gtb-border);background:var(--gtb-surface);padding:12px 14px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:16px;align-items:center;}'
    + '.bf-scope .bf-sig{font-size:22px;font-weight:800;letter-spacing:.02em;}'
    + '.bf-scope .bf-oprow>summary{padding:6px 10px;font-size:13px;font-weight:400;} .bf-scope .bf-oprow .bf-opp{border:0;}'
    + '.bf-scope .bf-h2{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gtb-muted);margin:16px 0 6px;}'
    + '.bf-scope .bf-tone-good{color:var(--gtb-green);} .bf-scope .bf-tone-bad{color:var(--gtb-red);}'
    + '.bf-scope .bf-tone-warn{color:var(--gtb-amber);} .bf-scope .bf-tone-info{color:var(--gtb-blue);}'
    + '.bf-scope .bf-tone-muted{color:var(--gtb-muted);}'
    + '.bf-scope p{margin:0 0 8px;} .bf-scope ul{margin:0 0 8px;padding-left:20px;} .bf-scope li{margin-bottom:4px;}'
    + '.bf-scope .bf-act{display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--gtb-border);}'
    + '.bf-scope .bf-tag{flex:0 0 78px;font-size:11px;font-weight:800;letter-spacing:.06em;text-align:center;padding:2px 4px;border:1px solid var(--gtb-border);height:fit-content;background:var(--gtb-surface2);}'
    + '.bf-scope .bf-opps{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:10px;}'
    + '.bf-scope .bf-opp{border:1px solid var(--gtb-border);background:var(--gtb-surface);padding:10px 12px;}'
    + '.bf-scope .bf-opp-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px;font-weight:800;font-size:15px;}'
    + '.bf-scope .bf-tier{font-size:11px;padding:1px 6px;border:1px solid var(--gtb-border);background:var(--gtb-surface2);}'
    + '.bf-scope .bf-parts{font-size:12px;color:var(--gtb-muted);margin:4px 0;}'
    + '.bf-scope details{border:1px solid var(--gtb-border);background:var(--gtb-surface);margin-bottom:8px;}'
    + '.bf-scope details>summary{cursor:pointer;padding:9px 12px;font-weight:800;font-size:14px;list-style:none;}'
    + '.bf-scope details>summary::-webkit-details-marker{display:none;}'
    + '.bf-scope details>summary:before{content:"\\25B8 ";color:var(--gtb-muted);} .bf-scope details[open]>summary:before{content:"\\25BE ";}'
    + '.bf-scope .bf-body{padding:4px 14px 10px;}'
    + '.bf-scope .bf-tblw{overflow-x:auto;margin:4px 0 10px;}'
    + '.bf-scope table{border-collapse:collapse;width:100%;font-size:12.5px;}'
    + '.bf-scope th{text-align:left;color:var(--gtb-muted);font-weight:700;padding:4px 8px;border-bottom:1px solid var(--gtb-border);white-space:nowrap;}'
    + '.bf-scope td{padding:4px 8px;border-bottom:1px solid var(--gtb-border);vertical-align:top;}'
    + '.bf-scope .bf-chip{display:inline-block;border:1px solid var(--gtb-border);background:var(--gtb-surface2);padding:1px 8px;margin:0 6px 4px 0;font-size:12px;}'
    + '.bf-scope .bf-card{border-top:1px solid var(--gtb-border);margin-top:10px;padding-top:8px;}'
    + '.bf-scope .bf-card>summary{font-size:14px;}'
    + '.gtb-tab.gtb-new-dot::after{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--gtb-accent);margin-left:5px;vertical-align:middle;}';
    try { var st = document.createElement('style'); st.id = 'gtb-bf-style'; st.textContent = css; document.head.appendChild(st); } catch (e) {}
}

// ── block renderers ────────────────────────────────────────────────────────────────────
function _bfBlockHtml(b) {
    if (!b) return '';
    switch (b.t) {
        case 'p': return '<p' + (b.tone ? ' class="bf-tone-' + b.tone + '"' : '') + '>' + _bfMd(b.x) + '</p>';
        case 'h': return '<div class="bf-h2">' + _bfEsc(b.x) + '</div>';
        case 'ul': return '<ul>' + b.items.map(function (i) { return '<li' + (i.tone ? ' class="bf-tone-' + i.tone + '"' : '') + '>' + _bfMd(i.x) + '</li>'; }).join('') + '</ul>';
        case 'kv': return '<table>' + b.items.map(function (i) { return '<tr><th>' + _bfEsc(i[0]) + '</th><td>' + _bfMd(i[1]) + '</td></tr>'; }).join('') + '</table>';
        case 'table':
            return '<div class="bf-tblw"><table><thead><tr>' + b.head.map(function (h) { return '<th>' + _bfEsc(h) + '</th>'; }).join('') + '</tr></thead><tbody>'
                + b.rows.map(function (r) { return '<tr>' + r.map(function (c) { c = _bfCell(c); return '<td' + (c.tone ? ' class="bf-tone-' + c.tone + '"' : '') + '>' + _bfMd(c.x) + '</td>'; }).join('') + '</tr>'; }).join('')
                + '</tbody></table></div>';
        case 'group':
            return '<div class="bf-h2">' + _bfEsc(b.title) + '</div><ul>' + b.items.map(function (i) { return '<li' + (i.tone ? ' class="bf-tone-' + i.tone + '"' : '') + '>' + _bfMd(i.x) + '</li>'; }).join('') + '</ul>';
    }
    return '';
}
function _bfBlocksHtml(bl) { return (bl || []).map(_bfBlockHtml).join(''); }

function _bfBlockText(b) {
    if (!b) return '';
    switch (b.t) {
        case 'p': return _bfPlain(b.x);
        case 'h': return '\n' + b.x.toUpperCase();
        case 'ul': return b.items.map(function (i) { return ' - ' + _bfPlain(i.x); }).join('\n');
        case 'kv': return b.items.map(function (i) { return ' ' + i[0] + ': ' + _bfPlain(i[1]); }).join('\n');
        case 'table': return ' ' + b.head.join(' | ') + '\n' + b.rows.map(function (r) { return ' ' + r.map(function (c) { return _bfPlain(_bfCell(c).x); }).join(' | '); }).join('\n');
        case 'group': return '\n' + b.title + '\n' + b.items.map(function (i) { return ' - ' + _bfPlain(i.x); }).join('\n');
    }
    return '';
}

function _bfOppHtml(o) {
    var p = o.plan, tone = o.dir > 0 ? 'good' : 'bad';
    var h = '<div class="bf-opp"><div class="bf-opp-h"><span class="bf-tone-' + tone + '">' + (o.dir > 0 ? 'LONG ' : 'SHORT ') + _bfEsc(o.name) + (o.hc ? ' ★' : '') + '</span>'
        + '<span><span class="bf-tier">Tier ' + o.tier + '</span> <b>' + o.score + '</b>/100</span></div>';
    h += '<div class="bf-parts">' + (o.actionable ? '<b class="bf-tone-good">Actionable</b> · ' : 'Forming · ') + (o.parts || []).map(function (x) { return _bfEsc(x.label) + ' ' + (x.pts > 0 ? '+' : '') + x.pts; }).join(' · ') + '</div>';
    if (p) {
        h += '<p>Entry <b>' + _bfFmt(p.entry, 0) + '</b> (' + _bfEsc(p.entryLabel) + (p.atLevel ? ', at level' : ', ' + _bfFix(p.distPct) + '% away') + ') · Stop <b>' + _bfFmt(p.stop, 0) + '</b> · Target <b>' + _bfFmt(p.t1, 0) + '</b>'
            + (p.t2 !== null && p.t2 !== undefined ? ' / ' + _bfFmt(p.t2, 0) : '') + (p.rr1 !== null && p.rr1 !== undefined ? ' · R:R 1:' + _bfFix(p.rr1, 1) : '') + '</p>';
    }
    if (o.size && o.size.ok) h += '<p class="bf-tone-muted">' + (o.size.tooSmall ? 'Risk budget too small for one lot at this stop.' : 'Size: ' + (o.size.lot > 1 ? o.size.lots + ' lot(s)' : o.size.units + ' units') + ' · risk ₹' + _bfFmt(o.size.riskAmt, 0)) + '</p>';
    if (o.pros && o.pros.length) h += '<ul>' + o.pros.map(function (x) { return '<li class="bf-tone-good">' + _bfMd(x) + '</li>'; }).join('') + '</ul>';
    if (o.cons && o.cons.length) h += '<ul>' + o.cons.map(function (x) { return '<li class="bf-tone-warn">' + _bfMd(x) + '</li>'; }).join('') + '</ul>';
    return h + '</div>';
}

function _bfHistoryHtml() {
    var day = (_BF_LAST && _BF_LAST.clock && _BF_LAST.clock.curDay) || '';
    var log = _bfLS('GTB_BRIEF_LOG_' + day) || [];
    if (!log.length) return '<p class="bf-tone-muted">No earlier briefings recorded for this day yet.</p>';
    return '<div class="bf-tblw"><table><thead><tr><th>Time</th><th>Signal</th><th>Score</th><th>Consensus</th><th>Best setup</th></tr></thead><tbody>'
        + log.slice().reverse().map(function (l) { return '<tr><td>' + _bfEsc(l.hhmm) + '</td><td>' + _bfEsc(l.signal) + '</td><td>' + (l.score === null ? '—' : _bfSg(l.score, 1)) + '</td><td>' + _bfEsc(l.cons || '—') + '</td><td>' + _bfEsc(l.top || '—') + '</td></tr>'; }).join('')
        + '</tbody></table></div>';
}

var _BF_MODE = (_bfLS('GTB_BRIEF_MODE') === 'full') ? 'full' : 'brief';

function _bfFirstSentence(t, max) {
    var p = _bfPlain(t), m = p.match(/^.*?[.!?](\s|$)/), r = m ? m[0].trim() : p;
    max = max || 190;
    return r.length > max ? r.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : r;
}

// One-line opportunity row that expands into the full card.
function _bfOppRowHtml(o) {
    var p = o.plan, tone = o.dir > 0 ? 'good' : 'bad';
    var line = '<span class="bf-tone-' + tone + '"><b>' + (o.dir > 0 ? 'LONG ' : 'SHORT ') + _bfEsc(o.name) + '</b></span> '
        + '<span class="bf-tier">' + o.tier + ' · ' + o.score + '</span> '
        + (o.actionable ? '<b class="bf-tone-good">go</b> ' : '<span class="bf-tone-warn">wait</span> ')
        + (p ? '<span class="bf-meta">entry ' + _bfFmt(p.entry, 0) + ' · stop ' + _bfFmt(p.stop, 0) + ' · tgt ' + _bfFmt(p.t1, 0) + (p.rr1 != null ? ' · 1:' + _bfFix(p.rr1, 1) : '') + '</span>' : '');
    return '<details class="bf-oprow"><summary>' + line + '</summary>' + _bfOppHtml(o) + '</details>';
}

function _bfBriefHtml(br) {
    var hd = br.headline, full = _BF_MODE === 'full', h = '<div class="bf-wrap">';
    h += '<div class="bf-bar"><button class="bf-btn" id="bf-mode">' + (full ? '<i class="bi bi-lightning"></i> Quick view' : '<i class="bi bi-list-ul"></i> Full briefing') + '</button>'
       + '<button class="bf-btn" id="bf-regen"><i class="bi bi-arrow-repeat"></i> Regenerate</button>'
       + '<button class="bf-btn" id="bf-copy"><i class="bi bi-clipboard"></i> Copy full text</button>'
       + '<span class="bf-meta">#' + br.seq + ' · ' + moment(br.ts).format('HH:mm:ss') + ' · data ' + _bfEsc(br.clock.curDay + ' ' + br.clock.hhmm) + '</span></div>';
    h += '<div class="bf-head"><div><div class="bf-meta">SIGNAL</div><div class="bf-sig bf-tone-' + hd.tone + '">' + _bfEsc(hd.signal) + '</div></div>'
       + '<div><div class="bf-meta">SCORE</div><div class="bf-sig">' + (hd.score === null ? '—' : _bfSg(hd.score, 1)) + '</div></div>'
       + '<div><div class="bf-meta">CONSENSUS</div><div class="bf-sig" style="font-size:16px;">' + _bfEsc(hd.consensus || '—') + '</div></div>'
       + '<div><div class="bf-meta">WINDOW</div><div class="bf-sig" style="font-size:16px;">' + _bfEsc(br.window.name) + '</div></div></div>';

    // ── Quick view: decision only ─────────────────────────────────────────────────
    var opps = br.opps || [];
    var act = opps.filter(function (o) { return o.tier === 'A' || o.tier === 'B'; });
    h += '<div class="bf-h2">Do this</div>';
    h += br.actions.filter(function (a) { return a.tag !== 'FIX' && a.tag !== 'MANAGE'; }).slice(0, full ? 99 : 3).map(function (a) {
        return '<div class="bf-act"><span class="bf-tag' + (a.tone ? ' bf-tone-' + a.tone : '') + '">' + _bfEsc(a.tag) + '</span><div>' + _bfMd(full ? a.x : _bfFirstSentence(a.x)) + '</div></div>';
    }).join('');
    h += '<div class="bf-h2">Setups' + (act.length ? '' : ' — none actionable') + '</div>';
    if (act.length) h += act.slice(0, full ? 12 : 4).map(_bfOppRowHtml).join('');
    else h += '<p class="bf-tone-muted">Nothing clears the bar. Stay flat or trade only obvious ranges with reduced size.</p>';
    var rest = opps.length - Math.min(act.length, full ? 12 : 4);
    if (!full && rest > 0) h += '<p class="bf-meta">+' + rest + ' weaker candidate(s) — see Full briefing.</p>';
    var risks = (br.risks || []).filter(function (r) { return r.sev >= 2; }).slice(0, full ? 99 : 3);
    if (risks.length) h += '<div class="bf-h2">Watch out</div><ul>' + risks.map(function (r) { return '<li class="bf-tone-' + (r.sev >= 3 ? 'bad' : 'warn') + '">' + _bfMd(full ? r.x : _bfFirstSentence(r.x, 160)) + '</li>'; }).join('') + '</ul>';
    var ch = (br.changes && br.changes.items || []).filter(function (i) { return i.tone !== 'muted'; }).slice(0, 4);
    if (!full && ch.length) h += '<div class="bf-h2">Changed since last refresh</div><ul>' + ch.map(function (i) { return '<li' + (i.tone ? ' class="bf-tone-' + i.tone + '"' : '') + '>' + _bfMd(_bfFirstSentence(i.x, 170)) + '</li>'; }).join('') + '</ul>';

    if (!full) {
        h += '<p style="margin-top:14px;"><button class="bf-btn" id="bf-mode2"><i class="bi bi-list-ul"></i> Show full briefing (summary, all sections, deep-dives)</button></p>';
        return h + '</div>';
    }

    // ── Full briefing ─────────────────────────────────────────────────────────────
    h += '<div class="bf-h2">Summary</div>' + _bfBlocksHtml(br.tldr);
    h += '<div class="bf-h2" style="margin-top:18px;">Full detail</div>';
    br.sections.forEach(function (s) {
        var open = _BF_OPEN.hasOwnProperty(s.id) ? _BF_OPEN[s.id] : false;
        h += '<details data-sec="' + s.id + '"' + (open ? ' open' : '') + '><summary><i class="bi ' + s.icon + '"></i> ' + _bfEsc(s.title) + '</summary><div class="bf-body">' + _bfBlocksHtml(s.blocks);
        (s.cards || []).forEach(function (c) {
            var cid = 'dive-' + c.name;
            var copen = _BF_OPEN.hasOwnProperty(cid) ? _BF_OPEN[cid] : false;
            h += '<details class="bf-card" data-sec="' + _bfEsc(cid) + '"' + (copen ? ' open' : '') + '><summary>' + _bfEsc(c.name) + '</summary><div class="bf-body"><div>'
                + c.chips.map(function (ch2) { return '<span class="bf-chip' + (ch2.tone ? ' bf-tone-' + ch2.tone : '') + '">' + _bfEsc(ch2.x) + '</span>'; }).join('') + '</div>' + _bfBlocksHtml(c.blocks) + '</div></details>';
        });
        h += '</div></details>';
    });
    h += '<details data-sec="history"' + (_BF_OPEN.history ? ' open' : '') + '><summary><i class="bi bi-clock-history"></i> Earlier today</summary><div class="bf-body">' + _bfHistoryHtml() + '</div></details>';
    return h + '</div>';
}

function _bfBriefText(br) {
    var L = [];
    L.push('GROOT MARKET BRIEFING #' + br.seq + ' — ' + br.clock.curDay + ' ' + br.clock.hhmm + ' (' + br.clock.source + ')');
    L.push('Signal: ' + br.headline.signal + ' | Score: ' + (br.headline.score === null ? 'n/a' : _bfSg(br.headline.score, 1)) + ' | Consensus: ' + (br.headline.consensus || 'n/a') + ' | Window: ' + br.window.name);
    L.push('\nSUMMARY'); br.tldr.forEach(function (b) { L.push(_bfBlockText(b)); });
    L.push('\nWHAT TO DO NOW'); br.actions.forEach(function (a) { L.push(' [' + a.tag + '] ' + _bfPlain(a.x)); });
    L.push('\nOPPORTUNITIES');
    br.opps.forEach(function (o) { L.push(' [' + o.tier + ' ' + o.score + '] ' + _bfPlain(_bfOppSummary(o)) + (o.actionable ? ' (actionable)' : ' (forming)')); });
    br.sections.forEach(function (s) {
        L.push('\n=== ' + s.title.toUpperCase() + ' ===');
        (s.blocks || []).forEach(function (b) { L.push(_bfBlockText(b)); });
        (s.cards || []).forEach(function (c) { L.push('\n--- ' + c.name + ' ---'); c.blocks.forEach(function (b) { L.push(_bfBlockText(b)); }); });
    });
    return L.join('\n');
}

// ── generation / rendering ─────────────────────────────────────────────────────────────
function _bfGenerate() {
    if (_BF_GENERATING) return _BF_LAST;
    _BF_GENERATING = true;
    try {
        var S = _bfCollect();
        var day = S.clock ? S.clock.curDay : '';
        var prev = _bfLS('GTB_BRIEF_PREV');
        _BF_SEQ++;
        var br = _bfBuildBrief(S, prev, _BF_SEQ);
        _bfLS('GTB_BRIEF_PREV', br.snap);
        var key = 'GTB_BRIEF_LOG_' + day, log = _bfLS(key) || [];
        var top = br.headline.top;
        log.push({ hhmm: S.clock.hhmm, signal: br.headline.signal, score: br.headline.score, cons: br.headline.consensus, top: top ? ((top.dir > 0 ? 'LONG ' : 'SHORT ') + top.name + ' (' + top.tier + ')') : null });
        if (log.length > 80) log = log.slice(-80);
        _bfLS(key, log);
        _BF_LAST = br;
        return br;
    } finally { _BF_GENERATING = false; }
}

function _bfBind() {
    var $p = jQ('#gtb-pane-briefing');
    $p.find('#bf-mode, #bf-mode2').off('click').on('click', function () { _BF_MODE = (_BF_MODE === 'full') ? 'brief' : 'full'; _bfLS('GTB_BRIEF_MODE', _BF_MODE); _gtbRenderBriefingPane(true); $p.scrollTop(0); });
    $p.find('#bf-regen').off('click').on('click', function () { try { _bfGenerate(); _gtbRenderBriefingPane(true); } catch (e) { console.error('[Briefing]', e); } });
    $p.find('#bf-copy').off('click').on('click', function () {
        var t = _bfBriefText(_BF_LAST);
        try { GM_setClipboard(t); } catch (e) { try { navigator.clipboard.writeText(t); } catch (e2) {} }
        var $b = jQ(this); $b.text('Copied'); setTimeout(function () { $b.html('<i class="bi bi-clipboard"></i> Copy as text'); }, 1200);
    });
    $p.find('details[data-sec]').off('toggle').on('toggle', function () { _BF_OPEN[this.getAttribute('data-sec')] = this.open; });
}

function _gtbRenderBriefingPane(skipGenerate) {
    _bfInjectStyle();
    var $p = jQ('#gtb-pane-briefing'); if (!$p.length) return;
    try { if (!_BF_LAST && !skipGenerate) _bfGenerate(); } catch (e) {
        console.error('[Briefing] generate failed', e);
        $p.html('<div class="bf-wrap"><p class="bf-tone-bad">Briefing failed: ' + _bfEsc(e && e.message || e) + '</p><button class="bf-btn" id="bf-regen">Retry</button></div>');
        $p.find('#bf-regen').on('click', function () { _BF_LAST = null; _gtbRenderBriefingPane(); });
        return;
    }
    if (!_BF_LAST) { $p.html('<div class="bf-wrap"><p class="bf-tone-muted">No briefing yet — run a refresh.</p></div>'); return; }
    var top = $p.scrollTop();
    $p.html(_bfBriefHtml(_BF_LAST));
    $p.toggleClass('gtb-light', typeof GTB_THEME !== 'undefined' && GTB_THEME === 'light');
    _bfBind();
    $p.scrollTop(top);
    jQ('.gtb-tab[data-tab="briefing"]').removeClass('gtb-new-dot');
}

// Called at the end of every refresh cycle: builds a fresh briefing; re-renders if the tab is open,
// otherwise flags the tab with a dot.
function _gtbBriefingOnRefresh() {
    _bfInjectStyle();
    _bfGenerate();
    var active = (typeof _gtbCurrentActiveTab !== 'undefined') ? _gtbCurrentActiveTab : jQ('.gtb-tab.active').data('tab');
    if (active === 'briefing') _gtbRenderBriefingPane(true);
    else jQ('.gtb-tab[data-tab="briefing"]').addClass('gtb-new-dot');
}


// ── Per-instrument briefing (Instrument Detail View + Commodities popup) ───────────────
// Same narrative engine as the Briefing tab, scoped to one instrument. Builds a light state
// object (no full-universe collection) so it is cheap enough to call on every card render.
function _gtbInstrBriefHtml(name) {
    _bfInjectStyle();
    try {
        var gaps = [];
        var S = { ts: Date.now(), gaps: gaps, instr: {}, dom: {} };
        S.clock = _bfTry(gaps, 'clock', _bfClock, null) || { hhmm: '—', source: 'unknown', isReplay: false, curDay: '', weekend: false };
        S.window = _bfTry(gaps, 'window', function () { return _bfWindow(S.clock.minutes, S.clock.weekend); }, null);
        var b915 = _bfTry(gaps, '9:15', function () { return JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN') || '{}'); }, {});
        var I = _bfInstrument(name, b915);
        S.instr[name] = I;
        try {
            var tid = name.replace(/ /g, '-');
            var prem = (jQ('#gtb-strip-prem-' + tid).text() || '').replace(/\s+/g, ' ').trim();
            var vwap = (jQ('#gtb-strip-vwap-' + tid).text() || '').replace(/\s+/g, ' ').trim();
            if (prem || vwap) S.dom[name] = { prem: prem || null, vwap: vwap || null };
        } catch (e) {}
        var blocks = _bfNarrateInstrument(I, S);
        var w = S.window ? '<div class="bf-meta" style="margin-bottom:6px;">Window: ' + _bfEsc(S.window.name) + ' — ' + _bfEsc(S.window.label) + ' · data as of ' + _bfEsc(S.clock.curDay + ' ' + S.clock.hhmm) + '</div>' : '';
        return '<div class="bf-scope bf-inline">' + w + _bfBlocksHtml(blocks) + '</div>';
    } catch (e) {
        console.warn('[Briefing] instrument briefing failed for', name, e);
        return '<div class="bf-scope bf-tone-muted">Briefing unavailable: ' + _bfEsc(e && e.message || e) + '</div>';
    }
}
