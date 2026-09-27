// ══════════════════════════════════════════════════════════════════════════════════════
// Macro tab — Oil, Bond Yield, Fed rate (proxy), Rupee (+ Dollar Index)
// ══════════════════════════════════════════════════════════════════════════════════════
// Data: Yahoo Finance chart endpoint via GM_xmlhttpRequest (same route as the Commodities
// popup's WTI/USDINR fetch; @connect query1.finance.yahoo.com is already in the header).
// Yahoo has no actual Fed policy rate, so the 13-week T-bill yield (^IRX) is used as the
// market-implied policy-rate proxy; a manual override can be typed into the card.
// Snapshot-aware: when the app is replaying an older CURRENT_DAY, values are taken as of that
// day's close (daily candles up to and including it), matching every other panel.
//
// Reading is from an INDIA-equity perspective and is rule-based (no fitted model):
//   oil up → headwind (import bill, inflation, OMC margins)      oil down → tailwind
//   US 10Y up → headwind (FII outflow, EM pressure)               US 10Y down → tailwind
//   Fed proxy up → tighter liquidity, headwind                    Fed proxy down → tailwind
//   USDINR up (rupee weaker) → headwind (FII outflow; IT exporters gain)   USDINR down → tailwind
//   Dollar Index up → headwind for EM flows                       DXY down → tailwind

var _MC_DRIVERS = [
    { key: 'BRENT',  label: 'Brent Crude',      sym: 'BZ=F',      unit: '$',   dec: 2, mode: 'pct',  t5: 3.0,  t1: 1.2, sign: -1, group: 'Oil' },
    { key: 'WTI',    label: 'WTI Crude',        sym: 'CL=F',      unit: '$',   dec: 2, mode: 'pct',  t5: 3.0,  t1: 1.2, sign: -1, group: 'Oil', info: 'MCX Crude settles against WTI' },
    { key: 'US10Y',  label: 'US 10Y Yield',     sym: '^TNX',      unit: '%',   dec: 3, mode: 'abs',  t5: 0.10, t1: 0.04, sign: -1, group: 'Bond Yield' },
    { key: 'FED',    label: 'Fed rate (13-wk T-bill proxy)', sym: '^IRX', unit: '%', dec: 3, mode: 'abs', t5: 0.05, t1: 0.02, sign: -1, group: 'Fed rates' },
    { key: 'USDINR', label: 'USD / INR',        sym: 'USDINR=X',  unit: '₹',   dec: 3, mode: 'pct',  t5: 0.35, t1: 0.15, sign: -1, group: 'Rupee' },
    { key: 'IN10Y',  label: 'India 10Y G-Sec Yield', sym: 'India 10Y', unit: '%', dec: 3, mode: 'abs', t5: 0.08, t1: 0.03, sign: -1, group: 'India Bond', manual: true,
      info: 'Actual 10Y benchmark yield from data you paste in Data Load → Macro Data (Investing.com historical-data table). Yahoo has no India yield.' },
    { key: 'INGS',   label: 'India 10Y G-Sec (Nifty GS 10Y index)', sym: 'NIFTYGS10YR.NS', unit: '', dec: 2, mode: 'pct', t5: 0.6, t1: 0.2, sign: 1, group: 'India Bond', accumulate: true,
      info: 'A bond PRICE index, not a yield: rising = Indian yields falling (good for banks/rate-sensitives). Yahoo only returns the latest value, so this app stores one value per day and the trend appears as history builds.' },
    { key: 'DXY',    label: 'Dollar Index',     sym: 'DX-Y.NYB',  unit: '',    dec: 2, mode: 'pct',  t5: 0.7,  t1: 0.3, sign: -1, group: 'Dollar' },
];
var _MC_TTL = 5 * 60 * 1000;
var _GTB_MACRO = null;          // { ts, rows:[…], score, label, errors:[…] }
var _MC_LOADING = false;

// Yahoo returns a single (latest) point for some series — keep our own one-value-per-day store
function _mcAccumulate(key, pts, live) {
    var k = 'GTB_MACRO_HIST_' + key, store = {};
    try { store = JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) {}
    pts.forEach(function (p) { store[p.d] = p.c; });
    if (live && isFinite(live)) store[moment().format('YYYY-MM-DD')] = live;
    var days = Object.keys(store).sort().slice(-90);
    var out = {}; days.forEach(function (d) { out[d] = store[d]; });
    try { localStorage.setItem(k, JSON.stringify(out)); } catch (e) {}
    return days.map(function (d) { return { d: d, c: out[d] }; });
}
function _mcSnapDay() { try { return _gtbCurrDay(); } catch (e) { return moment().format('YYYY-MM-DD'); } }

// India 10Y yield: user-pasted history (Data Load → Macro Data), stored in localStorage
var _MC_MANUAL_KEY = 'GTB_MACRO_IN10Y_MANUAL';
function _mcManualLoad() { try { return JSON.parse(localStorage.getItem(_MC_MANUAL_KEY) || '[]'); } catch (e) { return []; } }
// Parses rows like "25-09-2026<TAB>7.120<TAB>7.141<TAB>7.141<TAB>7.100<TAB>+0.13%" (Date, Price, Open, High, Low, Change %)
function _mcParseYieldText(text) {
    var out = [], bad = 0;
    String(text || '').split(/\r?\n/).forEach(function (line) {
        line = line.trim(); if (!line) return;
        var m = line.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})\s+([0-9.,]+)/);
        if (!m) { if (/^\d/.test(line)) bad++; return; }   // header lines are ignored silently
        var c = parseFloat(m[4].replace(/,/g, ''));
        if (!isFinite(c) || c <= 0 || c > 60) { bad++; return; }
        out.push({ d: m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2), c: c });
    });
    return { rows: out, bad: bad };
}
function _mcManualSave(newRows, replace) {
    var map = {};
    if (!replace) _mcManualLoad().forEach(function (p) { map[p.d] = p.c; });
    newRows.forEach(function (p) { map[p.d] = p.c; });
    var all = Object.keys(map).sort().map(function (d) { return { d: d, c: map[d] }; });
    try { localStorage.setItem(_MC_MANUAL_KEY, JSON.stringify(all)); } catch (e) {}
    _GTB_MACRO = null;
    return all;
}
function _mcFetchManual(def) {
    return new Promise(function (resolve, reject) {
        var pts = _mcManualLoad();
        if (pts.length < 3) { reject('India 10Y: no data yet — paste the Investing.com history in Data Load → Macro Data'); return; }
        resolve({ pts: pts, live: pts[pts.length - 1].c });
    });
}

function _mcFetch(def) {
    if (def.manual) return _mcFetchManual(def);
    var sym = def.sym;
    return new Promise(function (resolve, reject) {
        if (typeof GM_xmlhttpRequest === 'undefined') { reject('GM_xmlhttpRequest unavailable'); return; }
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1d&range=3mo',
            onload: function (res) {
                try {
                    var r = JSON.parse(res.responseText).chart.result[0];
                    var ts = r.timestamp || [], cl = (r.indicators.quote[0].close) || [];
                    var pts = [];
                    for (var i = 0; i < ts.length; i++) if (cl[i] !== null && cl[i] !== undefined && isFinite(cl[i])) pts.push({ d: moment.unix(ts[i]).format('YYYY-MM-DD'), c: +cl[i] });
                    if (def.accumulate) pts = _mcAccumulate(def.key, pts, parseFloat(r.meta.regularMarketPrice));
                    if (pts.length < (def.accumulate ? 1 : 3)) { reject('Too few data points for ' + sym); return; }
                    resolve({ pts: pts, live: parseFloat(r.meta.regularMarketPrice) });
                } catch (e) { reject('Could not parse Yahoo response for ' + sym + ': ' + e.message); }
            },
            onerror: function () { reject('Network error fetching ' + sym); }
        });
    });
}

function _mcAnalyse(def, raw) {
    var snap = _mcSnapDay(), isReplay = false;
    var pts = raw.pts.filter(function (p) { return p.d <= snap; });
    var today = moment().format('YYYY-MM-DD');
    isReplay = snap < today;
    if (pts.length < 3) pts = raw.pts;
    var n = pts.length, last = pts[n - 1].c;
    if (n < 2) pts = [pts[0], pts[0]], n = 2;
    if (!isReplay && raw.live && isFinite(raw.live)) { last = raw.live; }
    var prev = pts[n - 2].c, p5 = pts[Math.max(0, n - 6)].c, p20 = pts[Math.max(0, n - 21)].c;
    function chg(a, b) { return def.mode === 'pct' ? (a - b) / b * 100 : (a - b); }
    var c1 = chg(last, prev), c5 = chg(last, p5), c20 = chg(last, p20);
    // score: 5-day move is the trend, 1-day move adds urgency; each in [-1, +1] toward "impact on India equities"
    function clamp(x) { return Math.max(-1, Math.min(1, x)); }
    var s5 = clamp(c5 / def.t5 / 2), s1 = clamp(c1 / def.t1 / 2);
    var raw_s = clamp(s5 * 0.7 + s1 * 0.3) * def.sign;
    var score = (Math.abs(raw_s) < 0.15 || (def.accumulate && raw.pts.length < 6)) ? 0 : Math.round(raw_s * 10) / 10;
    return { def: def, last: last, prev: prev, c1: c1, c5: c5, c20: c20, score: score,
             thin: def.accumulate && raw.pts.length < 6, days: raw.pts.length,
             spark: pts.slice(-30).map(function (p) { return p.c; }), asOf: pts[n - 1].d, isReplay: isReplay };
}

function _mcFmtChg(r, v) {
    var mode = r.def.mode;
    return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(mode === 'pct' ? 2 : 3) + (mode === 'pct' ? '%' : ' pts');
}
function _mcManualFed() { try { var v = parseFloat(localStorage.getItem('GTB_MACRO_FED_RATE')); return isFinite(v) ? v : null; } catch (e) { return null; } }

// Plain-English reading per driver
function _mcRead(r) {
    // direction follows the SCORE (5d trend + 1d move), so the text can never contradict the badge
    var d = r.def, up5 = r.score !== 0 ? (r.score * r.def.sign) > 0 : r.c5 > 0, big = Math.abs(r.score) >= 0.5, flat = r.score === 0;
    var mv = _mcFmtChg(r, r.c5) + ' over 5 days (' + _mcFmtChg(r, r.c1) + ' today)';
    switch (d.key) {
        case 'BRENT': case 'WTI':
            if (flat) return d.label + ' is steady (' + mv + ') — no oil pressure on India right now.';
            return up5
                ? d.label + ' is rising (' + mv + '). ' + (big ? 'Costlier crude widens the import bill and feeds inflation — a headwind for Nifty, especially OMCs, paints, airlines and consumer names; supportive for MCX Crude and upstream (ONGC, Oil India).' : 'Mild upward pressure on India\'s import bill.')
                : d.label + ' is falling (' + mv + '). ' + (big ? 'Cheaper crude eases inflation and the import bill — a tailwind for Nifty, OMCs and consumption; bearish bias for MCX Crude.' : 'Mild relief for India\'s import bill.');
        case 'US10Y':
            if (flat) return 'US 10Y yield is stable (' + mv + ') — no fresh pressure on emerging-market flows.';
            return up5
                ? 'US 10Y yield is rising (' + mv + '). ' + (big ? 'Higher US yields pull money out of emerging markets (FII selling), pressure valuations of growth/IT names and tighten global liquidity — a headwind.' : 'A small tightening in global liquidity.')
                : 'US 10Y yield is falling (' + mv + '). ' + (big ? 'Lower US yields encourage FII inflows into India and ease valuation pressure — a tailwind.' : 'A small easing in global liquidity.');
        case 'FED': {
            var man = _mcManualFed();
            var base = 'The market-implied policy rate (13-week T-bill' + (man !== null ? '; you set the actual Fed rate at ' + man.toFixed(2) + '%' : '') + ') is ' + r.last.toFixed(2) + '%.';
            if (flat) return base + ' It is steady (' + mv + ') — no change in rate expectations.';
            return up5
                ? base + ' It is rising (' + mv + '), i.e. markets are pricing tighter policy. Tighter Fed policy strengthens the dollar and drains EM liquidity — a headwind, most for rate-sensitive and high-valuation stocks.'
                : base + ' It is falling (' + mv + '), i.e. markets are pricing easier policy. Easier Fed policy weakens the dollar and lifts EM inflows — a tailwind.';
        }
        case 'USDINR':
            if (flat) return 'The rupee is steady at ' + r.last.toFixed(2) + ' (' + mv + ') — no currency pressure.';
            return up5
                ? 'The rupee is weakening — USD/INR ' + r.last.toFixed(2) + ' (' + mv + '). ' + (big ? 'A falling rupee usually accompanies FII outflows and imported inflation — a headwind for the index, though IT and pharma exporters benefit.' : 'Mild rupee weakness; exporters gain slightly, importers lose.')
                : 'The rupee is strengthening — USD/INR ' + r.last.toFixed(2) + ' (' + mv + '). ' + (big ? 'A firmer rupee reflects inflows and lower imported inflation — a tailwind for the index (IT exporters lose a little margin).' : 'Mild rupee strength.');
        case 'IN10Y':
            if (flat) return 'India 10Y G-Sec yield is steady at ' + r.last.toFixed(3) + '% (' + mv + ') — no domestic rate pressure.';
            return up5
                ? 'India 10Y yield is rising to ' + r.last.toFixed(3) + '% (' + mv + '). ' + (big ? 'Higher domestic yields raise borrowing costs and mark down bank bond portfolios — a headwind for banks, NBFCs and rate-sensitive stocks; often follows US yields or inflation/fiscal worries.' : 'A mild rise in domestic borrowing costs.')
                : 'India 10Y yield is falling to ' + r.last.toFixed(3) + '% (' + mv + '). ' + (big ? 'Falling domestic yields are a tailwind for banks (bond gains), NBFCs, real estate and autos.' : 'A mild easing in domestic borrowing costs.');
        case 'INGS':
            if (r.thin) return 'Latest value ' + r.last.toFixed(2) + '. Only ' + r.days + ' day(s) of history stored so far — the trend and score start to mean something after about 6 sessions of the app running.';
            if (flat) return 'The India 10Y G-Sec index is steady (' + mv + ') — no move in Indian yields.';
            return up5
                ? 'The India 10Y G-Sec index is rising (' + mv + '), i.e. Indian bond yields are falling. Falling domestic yields are a tailwind for the bond books of banks, NBFCs, real estate and rate-sensitive stocks.'
                : 'The India 10Y G-Sec index is falling (' + mv + '), i.e. Indian bond yields are rising. Higher domestic yields raise borrowing costs and mark down bank bond portfolios — a headwind for banks and rate-sensitive stocks.';
        case 'DXY':
            if (flat) return 'The Dollar Index is flat (' + mv + ').';
            return up5
                ? 'The Dollar Index is rising (' + mv + '). A strong dollar pressures emerging-market currencies and flows — a headwind for India and for commodities priced in dollars.'
                : 'The Dollar Index is falling (' + mv + '). A weaker dollar supports emerging-market flows and commodities — a tailwind.';
    }
    return '';
}

function _mcVerdict(rows) {
    var sc = rows.reduce(function (a, r) { return a + r.score; }, 0);
    // Brent and WTI move together — count oil once (average) so it doesn't get double weight
    var oil = rows.filter(function (r) { return r.def.group === 'Oil'; });
    if (oil.length === 2) sc -= (oil[0].score + oil[1].score) / 2;
    sc = Math.round(sc * 10) / 10;
    var label, tone, advice;
    if (sc >= 1.5) { label = 'TAILWIND'; tone = 'good'; advice = 'Global macro is supportive for Indian equities. Long setups get a confidence lift; be less eager to short into strength. Size normally.'; }
    else if (sc >= 0.5) { label = 'MILD TAILWIND'; tone = 'good'; advice = 'Macro leans slightly supportive. It does not override the intraday signals — use it as a tie-breaker in favour of longs.'; }
    else if (sc <= -1.5) { label = 'HEADWIND'; tone = 'bad'; advice = 'Global macro is a drag on Indian equities. Long setups need extra confirmation and smaller size; rallies are more likely to be sold; shorts have a tailwind.'; }
    else if (sc <= -0.5) { label = 'MILD HEADWIND'; tone = 'bad'; advice = 'Macro leans slightly against risk. Use as a tie-breaker in favour of shorts and be quicker to book long profits.'; }
    else { label = 'NEUTRAL'; tone = 'warn'; advice = 'No clear macro push either way (drivers offset or are flat). Trade the intraday signals on their own.'; }
    return { score: sc, label: label, tone: tone, advice: advice };
}

async function _mcRefresh(force) {
    if (_MC_LOADING) return _GTB_MACRO;
    if (!force && _GTB_MACRO && Date.now() - _GTB_MACRO.ts < _MC_TTL) return _GTB_MACRO;
    _MC_LOADING = true;
    var errors = [], rows = [];
    try {
        var res = await Promise.all(_MC_DRIVERS.map(function (d) { return _mcFetch(d).then(function (raw) { return { d: d, raw: raw }; }, function (e) { errors.push(d.label + ': ' + e); return null; }); }));
        res.forEach(function (x) { if (x) rows.push(_mcAnalyse(x.d, x.raw)); });
        // the real yield supersedes the stored-history bond-price index
        if (rows.some(function (r) { return r.def.key === 'IN10Y'; })) rows = rows.filter(function (r) { return r.def.key !== 'INGS'; });
        var v = rows.length ? _mcVerdict(rows) : { score: 0, label: 'NO DATA', tone: 'muted', advice: 'No macro data could be loaded.' };
        _GTB_MACRO = { ts: Date.now(), rows: rows, errors: errors, score: v.score, label: v.label, tone: v.tone, advice: v.advice };
        if (errors.length) { try { _gtbLogWrite('warn', ['Macro: ' + errors.join('; ')]); } catch (e) {} }
    } finally { _MC_LOADING = false; }
    return _GTB_MACRO;
}

function _mcEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function _mcSpark(vals, col) {
    if (!vals || vals.length < 2) return '';
    var w = 120, h = 30, mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), rg = (mx - mn) || 1;
    var pts = vals.map(function (v, i) { return (i / (vals.length - 1) * w).toFixed(1) + ',' + (h - 2 - (v - mn) / rg * (h - 4)).toFixed(1); }).join(' ');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="30-day trend"><polyline points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="1.6"/></svg>';
}

function _mcInjectStyle() {
    if (document.getElementById('gtb-mc-style')) return;
    var css = '.mc-scope{padding:14px 18px 40px;max-width:1180px;margin:0 auto;color:var(--gtb-text);font-size:13.5px;line-height:1.55;}'
    + '.mc-scope .mc-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:10px;}'
    + '.mc-scope .mc-btn{background:var(--gtb-surface2);color:var(--gtb-text);border:1px solid var(--gtb-border);padding:5px 12px;font-size:12px;cursor:pointer;}'
    + '.mc-scope .mc-meta{color:var(--gtb-muted);font-size:12px;}'
    + '.mc-scope .mc-head{border:1px solid var(--gtb-border);background:var(--gtb-surface);padding:12px 14px;margin-bottom:12px;}'
    + '.mc-scope .mc-big{font-size:22px;font-weight:800;letter-spacing:.02em;}'
    + '.mc-scope .mc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:10px;}'
    + '.mc-scope .mc-card{border:1px solid var(--gtb-border);background:var(--gtb-surface);padding:10px 12px;}'
    + '.mc-scope .mc-grp{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gtb-muted);}'
    + '.mc-scope .mc-row{display:flex;justify-content:space-between;align-items:flex-end;gap:8px;margin:2px 0 6px;}'
    + '.mc-scope .mc-val{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;}'
    + '.mc-scope .mc-chg{display:flex;gap:12px;font-size:12px;font-variant-numeric:tabular-nums;margin-bottom:6px;}'
    + '.mc-scope .mc-pill{display:inline-block;font-size:11px;font-weight:800;padding:1px 8px;border:1px solid var(--gtb-border);background:var(--gtb-surface2);}'
    + '.mc-scope .t-good{color:var(--gtb-green);} .mc-scope .t-bad{color:var(--gtb-red);} .mc-scope .t-warn{color:var(--gtb-amber);} .mc-scope .t-muted{color:var(--gtb-muted);}'
    + '.mc-scope p{margin:0 0 6px;}'
    + '.mc-scope input{width:70px;background:var(--gtb-bg);color:var(--gtb-text);border:1px solid var(--gtb-border);padding:2px 6px;font-size:12px;}';
    try { var st = document.createElement('style'); st.id = 'gtb-mc-style'; st.textContent = css; document.head.appendChild(st); } catch (e) {}
}

function _mcHtml(m) {
    var h = '<div class="mc-scope">';
    h += '<div class="mc-bar"><button class="mc-btn" id="mc-refresh"><i class="bi bi-arrow-repeat"></i> Refresh</button>'
       + '<span class="mc-meta">Updated ' + moment(m.ts).format('HH:mm:ss') + (m.rows[0] && m.rows[0].isReplay ? ' · values as of snapshot day ' + _mcEsc(m.rows[0].asOf) : ' · live') + '</span></div>';
    h += '<div class="mc-head"><div class="mc-meta">MACRO BACKDROP FOR INDIAN EQUITIES</div>'
       + '<div class="mc-big t-' + m.tone + '">' + _mcEsc(m.label) + ' <span class="mc-meta" style="font-size:14px;">(' + (m.score >= 0 ? '+' : '') + m.score.toFixed(1) + ')</span></div>'
       + '<p style="margin-top:6px;">' + _mcEsc(m.advice) + '</p>'
       + '<p class="mc-meta">Score = sum of the drivers below, each −1 (headwind) to +1 (tailwind) from its 5-day trend (70%) and 1-day move (30%); Brent and WTI count once. It is context, not a trade signal — it does not change the composite score.</p></div>';
    if (!m.rows.length) h += '<p class="t-bad">No macro data loaded. ' + _mcEsc(m.errors.join(' · ')) + '</p>';
    h += '<div class="mc-grid">';
    m.rows.forEach(function (r) {
        var tone = r.score > 0 ? 'good' : r.score < 0 ? 'bad' : 'warn';
        var word = r.score > 0 ? 'TAILWIND' : r.score < 0 ? 'HEADWIND' : 'NEUTRAL';
        var col = tone === 'good' ? 'var(--gtb-green)' : tone === 'bad' ? 'var(--gtb-red)' : 'var(--gtb-amber)';
        var man = r.def.key === 'FED' ? _mcManualFed() : null;
        h += '<div class="mc-card"><div class="mc-grp">' + _mcEsc(r.def.group) + ' · ' + _mcEsc(r.def.label) + '</div>'
           + '<div class="mc-row"><span class="mc-val">' + (r.def.unit === '$' || r.def.unit === '₹' ? r.def.unit : '') + r.last.toFixed(r.def.dec) + (r.def.unit === '%' ? '%' : '') + '</span>' + _mcSpark(r.spark, col) + '</div>'
           + '<div class="mc-chg"><span>1d <b class="' + (r.c1 >= 0 ? 't-good' : 't-bad') + '" style="color:inherit;">' + _mcFmtChg(r, r.c1) + '</b></span><span>5d <b>' + _mcFmtChg(r, r.c5) + '</b></span><span>20d <b>' + _mcFmtChg(r, r.c20) + '</b></span></div>'
           + '<div style="margin-bottom:6px;"><span class="mc-pill t-' + tone + '">' + word + ' ' + (r.score > 0 ? '+' : '') + r.score.toFixed(1) + '</span></div>'
           + '<p>' + _mcEsc(_mcRead(r)) + '</p>'
           + (r.def.key === 'FED' ? '<p class="mc-meta">Actual Fed funds rate (optional, for your reference): <input id="mc-fed-input" type="number" step="0.25" value="' + (man !== null ? man : '') + '" placeholder="e.g. 4.50"></p>' : '')
           + (r.thin ? '<p class="t-warn">History building: ' + r.days + ' day(s) stored.</p>' : '')
           + (r.def.info ? '<p class="mc-meta">' + _mcEsc(r.def.info) + '</p>' : '')
           + '</div>';
    });
    h += '</div>';
    // combined read: oil vs rupee vs yield interplay
    var by = {}; m.rows.forEach(function (r) { by[r.def.key] = r; });
    var notes = [];
    if (by.USDINR && by.US10Y && by.USDINR.score < 0 && by.US10Y.score < 0) notes.push('Rising US yields and a weakening rupee together is the classic FII-outflow setup — the strongest macro headwind for Nifty/Bank Nifty.');
    if (by.BRENT && by.USDINR && by.BRENT.score < 0 && by.USDINR.score < 0) notes.push('Costlier oil plus a weaker rupee compounds India\'s import bill (double hit on the current-account deficit) — pressure on OMCs, airlines, paints and the index.');
    if (by.BRENT && by.BRENT.score > 0 && by.US10Y && by.US10Y.score > 0) notes.push('Falling oil and falling yields together is a broad relief backdrop — supportive for rate-sensitive banks, autos and consumption.');
    if (by.WTI && by.WTI.c5 > 0 && by.WTI.score < 0) notes.push('For MCX Crude: WTI is up over 5 days, which supports crude longs even though it is a headwind for Indian equities — check the Commodities popup\'s Fair Value gap before chasing.');
    if (notes.length) h += '<div class="mc-head" style="margin-top:12px;"><div class="mc-meta">COMBINED READ</div><ul style="margin:4px 0 0;padding-left:18px;">' + notes.map(function (n) { return '<li>' + _mcEsc(n) + '</li>'; }).join('') + '</ul></div>';
    if (m.errors.length) h += '<p class="mc-meta" style="margin-top:8px;">Not loaded: ' + _mcEsc(m.errors.join(' · ')) + '</p>';
    return h + '</div>';
}

async function _gtbRenderMacroPane() {
    _mcInjectStyle();
    var $p = jQ('#gtb-pane-macro'); if (!$p.length) return;
    if (!_GTB_MACRO) $p.html('<div class="mc-scope"><p class="mc-meta"><i class="bi bi-hourglass-split"></i> Loading macro data…</p></div>');
    var m;
    try { m = await _mcRefresh(false); } catch (e) { $p.html('<div class="mc-scope"><p class="t-bad">Macro load failed: ' + _mcEsc(e && e.message || e) + '</p><button class="mc-btn" id="mc-refresh">Retry</button></div>'); jQ('#mc-refresh').on('click', function () { _GTB_MACRO = null; _gtbRenderMacroPane(); }); return; }
    if (!m) return;
    $p.html(_mcHtml(m));
    jQ('#mc-refresh').off('click').on('click', async function () { $p.find('#mc-refresh').prop('disabled', true); await _mcRefresh(true); _gtbRenderMacroPane(); });
    jQ('#mc-fed-input').off('change').on('change', function () { try { localStorage.setItem('GTB_MACRO_FED_RATE', this.value); } catch (e) {} _gtbRenderMacroPane(); });
    jQ('.gtb-tab[data-tab="macro"]').removeClass('gtb-new-dot');
}

// Refresh in the background each dashboard refresh (cheap: 6 small requests, 5-min cache)
function _gtbMacroOnRefresh() {
    _mcRefresh(false).then(function () {
        if (typeof _gtbCurrentActiveTab !== 'undefined' && _gtbCurrentActiveTab === 'macro') _gtbRenderMacroPane();
    }).catch(function () {});
}
