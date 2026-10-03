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

function _mcFetch(def, rangeOverride) {
    if (def.manual) return _mcFetchManual(def);
    var sym = def.sym;
    // rangeOverride: the live Macro card only ever needs '3mo' (its own 20-day sparkline/tabs
    // is well within that), so it's the default and stays unchanged for that path. The
    // backtest passes a wider range ('1y') when replaying 6 months, since 3 months of daily
    // closes (~63 trading days) doesn't have enough history to score 126 trading days back
    // (each scored day itself needs ~6 more days of lookback before it).
    var range = rangeOverride || '3mo';
    return new Promise(function (resolve, reject) {
        if (typeof GM_xmlhttpRequest === 'undefined') { reject('GM_xmlhttpRequest unavailable'); return; }
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1d&range=' + range,
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
       + '<button class="mc-btn mc-backtest-btn" data-days="22"><i class="bi bi-clock-history"></i> Backtest (1M)</button>'
       + '<button class="mc-btn mc-backtest-btn" data-days="44"><i class="bi bi-clock-history"></i> Backtest (2M)</button>'
       + '<button class="mc-btn mc-backtest-btn" data-days="126"><i class="bi bi-clock-history"></i> Backtest (6M)</button>'
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
    jQ('.mc-backtest-btn').off('click').on('click', function () { _gtbShowMacroBacktest(+jQ(this).data('days') || 22); });
    jQ('.gtb-tab[data-tab="macro"]').removeClass('gtb-new-dot');
}

// ══════════════════════════════════════════════════════════════════════════════════════
// Macro Backtest (last ~1 month) — replays the SAME composite-score formula _mcAnalyse/
// _mcVerdict use, at each of the last ~22 trading days, from the same 3-month history each
// driver's live fetch already pulls (no new endpoint, just re-using the raw daily closes at
// an earlier index instead of only the latest one). Paired against NIFTY 50's own actual
// daily move (via Kite) so you can see whether the reasoning actually held up, day by day —
// this is exactly the honest check the Macro tab itself says hasn't been done ("no number
// here can honestly claim a historical win rate" applies to the LIVE card; this backtest is
// what closes that gap, transparently, with real dates and real outcomes, not a claim).
function _mcScoreAt(def, pts, idx) {
    if (idx < 6 || idx >= pts.length) return null;
    var last = pts[idx].c, prev = pts[idx - 1].c, p5 = pts[Math.max(0, idx - 5)].c;
    function chg(a, b) { return def.mode === 'pct' ? (a - b) / b * 100 : (a - b); }
    var c1 = chg(last, prev), c5 = chg(last, p5);
    function clamp(x) { return Math.max(-1, Math.min(1, x)); }
    var raw = clamp(clamp(c5 / def.t5 / 2) * 0.7 + clamp(c1 / def.t1 / 2) * 0.3) * def.sign;
    return Math.abs(raw) < 0.15 ? 0 : Math.round(raw * 10) / 10;
}

async function _mcRunBacktest(daysBack) {
    daysBack = daysBack || 22;
    // IN10Y (manual-paste India 10Y yield) IS backtestable — _mcManualLoad() returns a real
    // dated {d,c} series, the same shape every Yahoo-fetched driver uses, built from whatever
    // you've pasted into Data Load -> Macro Data. Read directly from storage instead of
    // _mcFetch (which is Yahoo-only). INGS (the Nifty GS 10Y index proxy, accumulate:true) is
    // excluded here on purpose: it only has as many days as this app itself has been running
    // and captured, almost always too few to backtest a month, AND it's redundant with IN10Y
    // once real yield data exists (same "real yield supersedes the proxy" rule the live Macro
    // card already applies) — including both would double-count the same India-yield signal.
    var driverDefs = _MC_DRIVERS.filter(function (d) { return !d.manual && d.key !== 'INGS'; });
    // Yahoo range must comfortably exceed daysBack + the ~6-day lookback each scored day
    // itself needs. '3mo' (~63 trading days) covers up to ~2 months; anything longer needs
    // '1y' so the oldest requested day still has enough history behind IT to be scored.
    var yahooRange = daysBack >= 55 ? '1y' : '3mo';
    var fetched = await Promise.all(driverDefs.map(function (d) {
        return _mcFetch(d, yahooRange).then(function (raw) { return { def: d, pts: raw.pts }; }).catch(function () { return null; });
    }));
    try {
        var in10y = _MC_DRIVERS.filter(function (d) { return d.key === 'IN10Y'; })[0];
        var manualPts = (typeof _mcManualLoad === 'function') ? _mcManualLoad() : [];
        if (in10y && manualPts.length >= 6) fetched.push({ def: in10y, pts: manualPts });
    } catch (e) {}
    var driverSeries = fetched.filter(Boolean);
    if (!driverSeries.length) return { rows: [], error: 'Could not load any driver history.' };

    var axis = driverSeries.filter(function (x) { return x.def.key === 'BRENT'; })[0] || driverSeries[0];
    var dates = axis.pts.map(function (p) { return p.d; }).slice(-(daysBack + 1));

    var niftyByDate = {};
    try {
        var token = INSTRUMENT_TOKENS['NIFTY 50'];
        // Calendar days, not trading days — needs enough margin for weekends + NSE holidays
        // over the requested trading-day window. A flat "+20" was fine for 1-2 months but left
        // NIFTY's own history short of the full 6-month axis range once daysBack grew to 126.
        var from = moment().subtract(Math.ceil(daysBack * 1.6) + 15, 'days').format('YYYY-MM-DD');
        var to = moment().format('YYYY-MM-DD');
        var niftyRaw = await getHistoricalDataUsingPromise(token, from, to, 'day');
        (niftyRaw && niftyRaw.data && niftyRaw.data.candles || []).forEach(function (c) {
            niftyByDate[String(c[0]).slice(0, 10)] = +c[4];
        });
    } catch (e) {}
    var niftyDates = Object.keys(niftyByDate).sort();

    var rows = [];
    dates.forEach(function (date) {
        var driverRows = [];
        driverSeries.forEach(function (ds) {
            var idx = -1;
            for (var k = 0; k < ds.pts.length; k++) { if (ds.pts[k].d <= date) idx = k; else break; }
            if (idx < 0) return;
            var score = _mcScoreAt(ds.def, ds.pts, idx);
            if (score != null) driverRows.push({ def: ds.def, score: score });
        });
        if (!driverRows.length) return;
        var sum = driverRows.reduce(function (a, r) { return a + r.score; }, 0);
        var oil = driverRows.filter(function (r) { return r.def.group === 'Oil'; });
        if (oil.length === 2) sum -= (oil[0].score + oil[1].score) / 2;
        sum = Math.round(sum * 10) / 10;
        var label = sum >= 1.5 ? 'TAILWIND' : sum >= 0.5 ? 'MILD TAILWIND' : sum <= -1.5 ? 'HEADWIND' : sum <= -0.5 ? 'MILD HEADWIND' : 'NEUTRAL';

        var nIdx = niftyDates.indexOf(date);
        var sameDayChg = (nIdx > 0) ? (niftyByDate[niftyDates[nIdx]] - niftyByDate[niftyDates[nIdx - 1]]) / niftyByDate[niftyDates[nIdx - 1]] * 100 : null;
        var nextDayChg = (nIdx >= 0 && nIdx + 1 < niftyDates.length) ? (niftyByDate[niftyDates[nIdx + 1]] - niftyByDate[niftyDates[nIdx]]) / niftyByDate[niftyDates[nIdx]] * 100 : null;
        // Per-driver scores, keyed by driver key, so the popup can show WHICH driver(s) are
        // actually moving the composite vs which are just sitting pinned one way all month —
        // the whole point of adding this: distinguishing "genuine month-long headwind" from
        // "one driver's threshold/sign is miscalibrated and never lets the sum go positive".
        var byDriver = {}; driverRows.forEach(function (r) { byDriver[r.def.key] = r.score; });
        rows.push({ date: date, score: sum, label: label, sameDayChg: sameDayChg, nextDayChg: nextDayChg, byDriver: byDriver });
    });
    // driverSeries (not the pre-filter driverDefs) is the actual set that ended up with usable
    // history — this is what must drive the popup's table columns, or IN10Y's score would be
    // computed into byDriver above but never get a column to show up in at all.
    return { rows: rows.slice(-daysBack), driverDefs: driverSeries.map(function (x) { return x.def; }) };
}

function _mcBacktestHitRate(rows, field) {
    var hw = rows.filter(function (r) { return r.score <= -0.5 && r[field] != null; });
    var tw = rows.filter(function (r) { return r.score >= 0.5 && r[field] != null; });
    var hwHit = hw.filter(function (r) { return r[field] < 0; }).length;
    var twHit = tw.filter(function (r) { return r[field] > 0; }).length;
    return {
        hwPct: hw.length ? Math.round(hwHit / hw.length * 100) : null, hwN: hw.length,
        twPct: tw.length ? Math.round(twHit / tw.length * 100) : null, twN: tw.length,
    };
}

async function _gtbShowMacroBacktest(daysBack) {
    daysBack = daysBack || 22;
    var windowLabel = daysBack >= 110 ? 'LAST 6 MONTHS' : daysBack >= 40 ? 'LAST 2 MONTHS' : 'LAST 1 MONTH';
    var html = '<div class="mc-scope" style="padding:14px;height:100%;overflow-y:auto;box-sizing:border-box;">'
        + '<p class="mc-meta"><i class="bi bi-hourglass-split"></i> Replaying the macro score across ' + daysBack + ' trading days and fetching NIFTY 50\'s own daily moves…</p></div>';
    showPopUpWindow('macro-backtest', html, 'Macro Backtest', 640, 560);
    var _cls = 'popup-custom-style-macro-backtest';
    var _title = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<span style="font-weight:800;font-size:0.7rem;"><i class="bi bi-clock-history"></i> MACRO BACKTEST — ' + windowLabel + '</span>'
        + popupWinControls(_cls) + '</div>';
    jQ('.' + _cls).find('.popupwindow_titlebar_text').html(_title);
    hideNativePopupButtons(_cls);
    jQ('.' + _cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + _cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');

    var result;
    try { result = await _mcRunBacktest(daysBack); } catch (e) { result = { rows: [], error: e.message || String(e) }; }
    var rows = result.rows || [];
    var $body = jQ('#pop-up-window-macro-backtest .mc-scope');
    if (!rows.length) { $body.html('<p class="t-bad">Backtest failed: ' + _mcEsc(result.error || 'no data') + '</p>'); return; }

    var sameHit = _mcBacktestHitRate(rows, 'sameDayChg');
    var nextHit = _mcBacktestHitRate(rows, 'nextDayChg');
    var driverDefs = result.driverDefs || [];

    // Per-driver average across the whole window + how many days it was pinned one-sided
    // (never crossed zero) — the fastest way to spot "this ONE driver never lets the composite
    // go positive" (a calibration bug) vs "every driver genuinely agrees this month" (real).
    var driverStats = driverDefs.map(function (d) {
        var vals = rows.map(function (r) { return r.byDriver[d.key]; }).filter(function (v) { return v != null; });
        if (!vals.length) return null;
        var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
        var allNeg = vals.every(function (v) { return v <= 0; }), allPos = vals.every(function (v) { return v >= 0; });
        return { def: d, avg: avg, n: vals.length, pinned: allNeg ? 'always ≤ 0' : allPos ? 'always ≥ 0' : null };
    }).filter(Boolean);

    var h = '<div class="mc-head" style="margin-bottom:10px;">'
        + '<div class="mc-meta">HIT RATE — ' + rows.length + ' trading days replayed</div>'
        + '<p style="margin-top:6px;">Same-day: HEADWIND days where NIFTY fell <b>' + (sameHit.hwPct != null ? sameHit.hwPct + '% (n=' + sameHit.hwN + ')' : '—') + '</b>; TAILWIND days where NIFTY rose <b>' + (sameHit.twPct != null ? sameHit.twPct + '% (n=' + sameHit.twN + ')' : '—') + '</b>.</p>'
        + '<p>Next-day: HEADWIND days followed by a NIFTY fall <b>' + (nextHit.hwPct != null ? nextHit.hwPct + '% (n=' + nextHit.hwN + ')' : '—') + '</b>; TAILWIND days followed by a NIFTY rise <b>' + (nextHit.twPct != null ? nextHit.twPct + '% (n=' + nextHit.twN + ')' : '—') + '</b>.</p>'
        + '<p class="mc-meta">A coin flip is 50%. This is ' + (daysBack >= 110 ? 'six months' : daysBack >= 40 ? 'two months' : 'one month') + ' of data across 5-6 correlated global drivers' + (daysBack >= 110 ? ' — better, but still one continuous stretch (not multiple independent market regimes), so treat this as a reasonable sanity check, not a validated edge' : ' — nowhere near enough to call this a validated edge either way; read it as a sanity check on the reasoning, not a track record') + '.</p>'
        + '</div>';

    h += '<div class="mc-head" style="margin-bottom:10px;">'
        + '<div class="mc-meta">PER-DRIVER AVERAGE OVER THE WINDOW — spot a pinned/miscalibrated driver</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px;">'
        + driverStats.map(function (s) {
            var tone = s.avg > 0.1 ? 'good' : s.avg < -0.1 ? 'bad' : 'warn';
            return '<div style="min-width:120px;"><div class="mc-meta">' + _mcEsc(s.def.label) + '</div>'
                + '<div class="t-' + tone + '" style="font-weight:800;font-size:14px;">' + (s.avg >= 0 ? '+' : '') + s.avg.toFixed(2) + '</div>'
                + (s.pinned ? '<div class="t-warn" style="font-size:11px;">⚠ ' + s.pinned + ' all ' + s.n + ' days</div>' : '<div class="mc-meta" style="font-size:11px;">n=' + s.n + '</div>')
                + '</div>';
        }).join('')
        + '</div></div>';

    h += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">'
        + '<thead><tr><th style="text-align:left;padding:4px 6px;">Date</th><th style="text-align:right;padding:4px 6px;">Score</th><th style="text-align:left;padding:4px 6px;">Label</th>'
        + driverStats.map(function (s) { return '<th style="text-align:right;padding:4px 6px;" title="' + _mcEsc(s.def.label) + '">' + _mcEsc(s.def.key) + '</th>'; }).join('')
        + '<th style="text-align:right;padding:4px 6px;">NIFTY same-day</th><th style="text-align:right;padding:4px 6px;">NIFTY next-day</th></tr></thead><tbody>'
        + rows.slice().reverse().map(function (r) {
            var tone = r.score > 0 ? 'good' : r.score < 0 ? 'bad' : 'warn';
            function chgCell(v) { if (v == null) return '<td style="text-align:right;padding:4px 6px;color:var(--gtb-muted);">—</td>'; var c = v > 0 ? 'good' : v < 0 ? 'bad' : 'warn'; return '<td class="t-' + c + '" style="text-align:right;padding:4px 6px;">' + (v >= 0 ? '+' : '') + v.toFixed(2) + '%</td>'; }
            function driverCell(key) { var v = r.byDriver[key]; if (v == null) return '<td style="text-align:right;padding:4px 6px;color:var(--gtb-muted);">—</td>'; var c = v > 0 ? 'good' : v < 0 ? 'bad' : 'warn'; return '<td class="t-' + c + '" style="text-align:right;padding:4px 6px;">' + (v >= 0 ? '+' : '') + v.toFixed(1) + '</td>'; }
            return '<tr style="border-top:1px solid var(--gtb-border, #333);">'
                + '<td style="padding:4px 6px;">' + r.date + '</td>'
                + '<td class="t-' + tone + '" style="text-align:right;padding:4px 6px;">' + (r.score >= 0 ? '+' : '') + r.score.toFixed(1) + '</td>'
                + '<td class="t-' + tone + '" style="padding:4px 6px;">' + r.label + '</td>'
                + driverStats.map(function (s) { return driverCell(s.def.key); }).join('')
                + chgCell(r.sameDayChg) + chgCell(r.nextDayChg)
                + '</tr>';
        }).join('')
        + '</tbody></table></div>';
    $body.html(h);
}

// Refresh in the background each dashboard refresh (cheap: 6 small requests, 5-min cache)
function _gtbMacroOnRefresh() {
    _mcRefresh(false).then(function (m) {
        try { _gtbCheckMacroChangeAlert(m); } catch (e) {}
        if (typeof _gtbCurrentActiveTab !== 'undefined' && _gtbCurrentActiveTab === 'macro') _gtbRenderMacroPane();
        // Dashboard's one-line macro strip refreshes every cycle regardless of which tab is
        // active — it's a cheap DOM write (a single line, not the full per-driver tab), and
        // the whole point is it's visible without switching to the Macro tab at all.
        try { _gtbRenderDashMacroStrip(); } catch (e) {}
    }).catch(function () {});
}

// ── Macro regime-change alert — same Toastify pattern as the NSE holiday alert
// (_gtbCheckHolidayAlert, grootTradeBot.js), triggered by EITHER a LABEL TRANSITION or a large
// same-label SCORE MOVE (e.g. +0.7 -> +1.7, or -0.7 -> -1.7 — a real strengthening/weakening of
// the backdrop that a label-only check would miss, since both ends there can sit inside
// neighbouring or even the same band). Session-scoped on purpose, same reasoning as the holiday
// check's once-a-day vs this one's relative-to-what-you-were-already-looking-at: the first
// refresh after a reload just establishes the baseline silently, it never fires on its own.
var _GTB_MACRO_LAST_LABEL = null;
var _GTB_MACRO_ALERT_BASE_SCORE = null; // score at the last alert (or at session baseline)
var _GTB_MACRO_SCORE_ALERT_DELTA = 1.0; // e.g. 0.7 -> 1.7 or -0.7 -> -1.7
function _gtbCheckMacroChangeAlert(m) {
    if (!m || !m.label || typeof m.score !== 'number') return;
    var prevLabel = _GTB_MACRO_LAST_LABEL;
    var baseScore = _GTB_MACRO_ALERT_BASE_SCORE;
    _GTB_MACRO_LAST_LABEL = m.label;

    // No prior reading yet (first refresh this session) — just establish the baseline.
    if (prevLabel === null) { _GTB_MACRO_ALERT_BASE_SCORE = m.score; return; }
    // Either side is a transient fetch failure ('NO DATA'), not a genuine reading to compare
    // against — skip the check, and re-baseline once real data comes back.
    if (prevLabel === 'NO DATA' || m.label === 'NO DATA') { if (m.label !== 'NO DATA') _GTB_MACRO_ALERT_BASE_SCORE = m.score; return; }

    var labelChanged = prevLabel !== m.label;
    var scoreDelta = (baseScore == null) ? 0 : (m.score - baseScore);
    var scoreMoved = Math.abs(scoreDelta) >= _GTB_MACRO_SCORE_ALERT_DELTA;
    // Nothing alert-worthy — deliberately leave the baseline score untouched (not reset to
    // today's reading) so a slow multi-refresh drift still accumulates toward the threshold
    // instead of resetting its clock on every unchanged tick.
    if (!labelChanged && !scoreMoved) return;

    _GTB_MACRO_ALERT_BASE_SCORE = m.score; // reset baseline at the point an alert actually fires
    if (typeof Toastify === 'undefined') return;
    var col = m.tone === 'good' ? '#3fb950' : m.tone === 'bad' ? '#f85149' : '#d29922';
    var fmt = function (n) { return (n >= 0 ? '+' : '') + n.toFixed(1); };
    var headline = labelChanged
        ? 'MACRO SHIFT: ' + _mcEsc(prevLabel) + ' &rarr; ' + _mcEsc(m.label)
        : 'MACRO MOVE (' + _mcEsc(m.label) + '): ' + fmt(baseScore) + ' &rarr; ' + fmt(m.score);
    Toastify({
        text: '<i class="bi bi-globe" style="margin-right:6px;color:' + col + ';font-size:1rem;"></i>'
            + '<span style="font-size:0.75rem;font-weight:700;color:' + col + ';">' + headline + '</span><br>'
            + '<span style="font-size:0.65rem;color:#c9d1d9;">' + _mcEsc(m.advice) + '</span>',
        duration: 10000, gravity: 'top', position: 'center', escapeMarkup: false, close: true,
        style: { background: '#0a0a0a', border: '2px solid ' + col, 'border-radius': '8px',
                 padding: '12px 18px', 'min-width': '280px', 'line-height': '1.6' }
    }).showToast();
}

// One-line macro backdrop strip on the Dashboard tab, right below Predict — see the dashboard
// card markup in _gtbRenderDashboardPane (grootTradeBot.js). Deliberately just a single line;
// the full per-driver breakdown lives on the Macro tab itself, which clicking this opens.
function _gtbRenderDashMacroStrip() {
    var $el = jQ('#gtb-dash-macro');
    if (!$el.length) return;
    var m = _GTB_MACRO;
    if (!m) { $el.html('<span style="color:var(--gtb-muted);font-size:0.62rem;"><i class="bi bi-globe"></i> Macro backdrop: loading…</span>'); return; }
    var col = m.tone === 'good' ? 'var(--gtb-green)' : m.tone === 'bad' ? 'var(--gtb-red)' : 'var(--gtb-amber)';
    var html = '<div style="display:flex;align-items:center;gap:8px;font-size:0.62rem;line-height:1.3;">'
        + '<i class="bi bi-globe" style="color:' + col + ';flex-shrink:0;"></i>'
        + '<b style="color:' + col + ';flex-shrink:0;white-space:nowrap;">MACRO: ' + _mcEsc(m.label) + ' (' + (m.score >= 0 ? '+' : '') + m.score.toFixed(1) + ')</b>'
        + '<span style="color:var(--gtb-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _mcEsc(m.advice) + '</span>'
        + '</div>';
    $el.html(html);
}
jQ(document).on('click', '#gtb-dash-macro-card', function () { try { if (typeof _gtbActivateTab === 'function') _gtbActivateTab('macro'); } catch (e) {} });
