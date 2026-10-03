// ─── positionalScreener.js ──────────────────────────────────────────────────
// Swing/positional screener — scans all F&O stocks on DAILY candles (not the
// 5-min intraday series every other tool in this app uses).
//
// TWO LAYERS, deliberately not blended into one silent number:
//   1. PRIMARY — a line-for-line port of groot-platform/groot-research's Python
//      swing_scanner (Minervini's Trend Template, Weinstein's Stage Analysis,
//      Clenow's momentum score — see the "groot-research parity" block below).
//      This is the TRUSTED base call for "is this a genuine, mechanically-
//      defined Stage 2 uptrend / Stage 4 downtrend worth a swing/positional
//      hold." Named, published, book-sourced rules — the same reasoning that
//      made groot-research the more trustworthy of the two scanners.
//   2. OVERLAY — this app's own SAME-DAY composite (trend vs SMA20/50, 20-day
//      breakout/breakdown, relative strength vs NIFTY 50, multi-day futures OI
//      buildup/unwinding, and futures Curve Structure/contango-backwardation).
//      Purely a confirmation/timing layer on top of the primary read — it can
//      raise or lower CONVICTION but never flips the direction the primary
//      read established. If the two disagree, the verdict says so explicitly
//      (e.g. "BUY — overlay disagrees (caution)") rather than hiding it inside
//      a single blended score.
//
// ISOLATION: standalone file, only reads existing globals (FO_LIST,
// INSTRUMENT_TOKENS, FUTURE_INTRUMENT_LIST, NSE_FUT_CURVE/MCX_FUT_CURVE,
// getHistoricalDataUsingPromise) — never writes INSTRUMENT_SCORE_MAP or any
// other live-shared cache, and never calls any of the existing intraday
// scoring functions. Nothing in the rest of the app is touched or behaves any
// differently with this file absent.
// ─────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════════════
// Groot-research parity layer — Minervini Trend Template + Weinstein Stage Analysis +
// Clenow momentum, ported from groot-platform/groot-research/swing_scanner/*.py line-for-
// line (same rules, same thresholds, same ATR(14) 1.5x/2.5x entry/stop/target convention).
// This is now the PRIMARY classification ("is this a genuine, mechanically-defined Stage 2
// uptrend / Stage 4 downtrend, worth a swing/positional hold") — see trade-signal priority
// discussion: the Python side's named, published rules (Minervini/Weinstein/Clenow) are the
// trusted base; this app's OWN trend/breakout/OI/curve composite (below, unchanged) is kept
// as a same-day OVERLAY on top of it — confirmation/timing, not the primary call.
//
// Needs 210+ trading days of daily candles (Trend Template's own minimum) — ~260 for a
// fully-formed Weinstein Stage read and Clenow momentum's 90-day window with margin, so the
// scan now pulls a much longer daily history per stock than before (see the 400-day fetch
// in the scan loop). Stocks with less history (recent listings) get an honest
// "INSUFFICIENT HISTORY" primary read and fall back to the old measured-move trade plan.
// ══════════════════════════════════════════════════════════════════════════════════════

// Rolling SMA as a full array (index i = SMA ending at closes[i]; null before window-1).
function _psSmaArr(closes, window) {
    var out = new Array(closes.length).fill(null), sum = 0;
    for (var i = 0; i < closes.length; i++) {
        sum += closes[i];
        if (i >= window) sum -= closes[i - window];
        if (i >= window - 1) out[i] = sum / window;
    }
    return out;
}

// ATR(14) on daily OHLC — same True Range formula/window as trade_levels.compute_atr and
// the same 14-day window this app's own ATR-based Position Size calculator already uses.
function _psAtr14(candles, window) {
    window = window || 14;
    if (!candles || candles.length < window + 1) return null;
    var trs = [];
    for (var i = 1; i < candles.length; i++) {
        var h = parseFloat(candles[i][2]), l = parseFloat(candles[i][3]), pc = parseFloat(candles[i - 1][4]);
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    var tail = trs.slice(-window);
    return tail.reduce(function (a, b) { return a + b; }, 0) / tail.length;
}

// Minervini's Trend Template — 8 mechanical rules for a genuine Stage 2 uptrend
// (trend_template.py). Rule 8 (relative strength) is the same "outperformed NIFTY 50 over
// the trailing 6 months (127 sessions)" proxy the Python side uses, flagged there as a proxy
// for Minervini's real universe-wide percentile RS Rating (this app has no such ranking).
function _psTrendTemplate(candles, niftyCloses) {
    if (!candles || candles.length < 210) return { ok: false, reason: 'Need 210+ trading days, got ' + (candles ? candles.length : 0) };
    var c = candles.map(function (x) { return parseFloat(x[4]); });
    var price = c[c.length - 1];
    var sma50 = _psSmaArr(c, 50), sma150 = _psSmaArr(c, 150), sma200 = _psSmaArr(c, 200);
    var n = c.length;
    var rules = {};
    rules.r1 = price > sma150[n - 1] && price > sma200[n - 1];
    rules.r2 = sma150[n - 1] > sma200[n - 1];
    rules.r3 = n - 1 - 21 >= 0 && sma200[n - 1 - 21] != null && sma200[n - 1] > sma200[n - 1 - 21];
    rules.r4 = sma50[n - 1] > sma150[n - 1] && sma50[n - 1] > sma200[n - 1];
    rules.r5 = price > sma50[n - 1];
    var win52 = c.slice(Math.max(0, n - 252));
    var low52 = Math.min.apply(null, win52), high52 = Math.max.apply(null, win52);
    rules.r6 = price >= low52 * 1.30;
    rules.r7 = price >= high52 * 0.75;
    var rsPct = null;
    if (niftyCloses && niftyCloses.length >= 127 && n >= 127) {
        var stockRet = (c[n - 1] / c[n - 127]) - 1;
        var nn = niftyCloses.length;
        var niftyRet = (niftyCloses[nn - 1] / niftyCloses[nn - 127]) - 1;
        rsPct = (stockRet - niftyRet) * 100;
        rules.r8 = rsPct > 0;
    }
    var vals = Object.keys(rules).map(function (k) { return rules[k]; });
    var passed = vals.filter(Boolean).length;
    return {
        ok: true, price: price, sma50: sma50[n - 1], sma150: sma150[n - 1], sma200: sma200[n - 1],
        low52: low52, high52: high52, pctOffHigh52: (price / high52 - 1) * 100, rsPct: rsPct,
        rulesPassed: passed, rulesTotal: vals.length, passes: vals.every(Boolean),
    };
}

// Mirror image for a confirmed Weinstein Stage 4 downtrend (short_template.py).
function _psShortTemplate(candles, niftyCloses) {
    if (!candles || candles.length < 210) return { ok: false, reason: 'Need 210+ trading days, got ' + (candles ? candles.length : 0) };
    var c = candles.map(function (x) { return parseFloat(x[4]); });
    var price = c[c.length - 1];
    var sma50 = _psSmaArr(c, 50), sma150 = _psSmaArr(c, 150), sma200 = _psSmaArr(c, 200);
    var n = c.length;
    var rules = {};
    rules.r1 = price < sma150[n - 1] && price < sma200[n - 1];
    rules.r2 = sma150[n - 1] < sma200[n - 1];
    rules.r3 = n - 1 - 21 >= 0 && sma200[n - 1 - 21] != null && sma200[n - 1] < sma200[n - 1 - 21];
    rules.r4 = sma50[n - 1] < sma150[n - 1] && sma50[n - 1] < sma200[n - 1];
    rules.r5 = price < sma50[n - 1];
    var win52 = c.slice(Math.max(0, n - 252));
    var low52 = Math.min.apply(null, win52), high52 = Math.max.apply(null, win52);
    rules.r6 = price <= high52 * 0.70;
    rules.r7 = price <= low52 * 1.25;
    var rsPct = null;
    if (niftyCloses && niftyCloses.length >= 127 && n >= 127) {
        var stockRet = (c[n - 1] / c[n - 127]) - 1;
        var nn = niftyCloses.length;
        var niftyRet = (niftyCloses[nn - 1] / niftyCloses[nn - 127]) - 1;
        rsPct = (stockRet - niftyRet) * 100;
        rules.r8 = rsPct < 0;
    }
    var vals = Object.keys(rules).map(function (k) { return rules[k]; });
    var passed = vals.filter(Boolean).length;
    return {
        ok: true, price: price, sma50: sma50[n - 1], sma150: sma150[n - 1], sma200: sma200[n - 1],
        low52: low52, high52: high52, pctOffLow52: (price / low52 - 1) * 100, rsPct: rsPct,
        rulesPassed: passed, rulesTotal: vals.length, passes: vals.every(Boolean),
    };
}

// Weinstein Stage Analysis proxy (stage_analysis.py) — 150-day SMA (~30 weeks) + a slope
// measured over the trailing 25 trading days (~5 weeks). Flat MA (|slope|<=1%) is Stage
// 1 (basing, lower half of 52wk range) or Stage 3 (topping, upper half); rising MA is
// Stage 2 (confirmed if price is above it, else an early/unconfirmed breakout); falling
// MA is Stage 4 (confirmed if price is below it, else an unconfirmed bounce).
var _PS_STAGE_LABELS = { 1: 'Stage 1 — Basing', 2: 'Stage 2 — Advancing', 3: 'Stage 3 — Topping', 4: 'Stage 4 — Declining' };
function _psStage(candles) {
    var SMA_W = 150, SLOPE_W = 25, FLAT = 1.0;
    if (!candles || candles.length < SMA_W + SLOPE_W) return { ok: false, reason: 'Need ' + (SMA_W + SLOPE_W) + '+ trading days, got ' + (candles ? candles.length : 0) };
    var c = candles.map(function (x) { return parseFloat(x[4]); });
    var n = c.length, price = c[n - 1];
    var sma = _psSmaArr(c, SMA_W);
    var maNow = sma[n - 1], maPast = sma[n - 1 - SLOPE_W];
    var slopePct = maPast ? (maNow - maPast) / maPast * 100 : 0;
    var above = price > maNow;
    var win52 = c.slice(Math.max(0, n - 252));
    var low52 = Math.min.apply(null, win52), high52 = Math.max.apply(null, win52);
    var rangePct = high52 > low52 ? (price - low52) / (high52 - low52) : 0.5;
    var stage, confirmed = true;
    if (Math.abs(slopePct) <= FLAT) stage = rangePct < 0.5 ? 1 : 3;
    else if (slopePct > FLAT) { stage = 2; confirmed = above; }
    else { stage = 4; confirmed = !above; }
    return { ok: true, stage: stage, label: _PS_STAGE_LABELS[stage] + (confirmed ? '' : ' (unconfirmed)'), confirmed: confirmed, ma: maNow, slopePct: slopePct, rangePct: rangePct * 100 };
}

// Clenow's momentum score (momentum.py): OLS regression of log(close) over the trailing 90
// trading days; annualized_return = (e^(slope*252) - 1) * 100; momentum_score =
// annualized_return * R^2 (a steep-but-noisy trend is penalized; smooth-but-shallow scores
// lower than smooth AND steep). Flags (doesn't drop) a >15% single-day move in the window —
// usually an earnings/corporate-action gap distorting the fit's smoothness reading.
function _psMomentum(candles, lookback, gapPct) {
    lookback = lookback || 90; gapPct = gapPct || 15.0;
    if (!candles || candles.length < lookback) return { ok: false, reason: 'Need ' + lookback + '+ trading days, got ' + (candles ? candles.length : 0) };
    var win = candles.slice(-lookback).map(function (x) { return parseFloat(x[4]); });
    if (win.some(function (v) { return !(v > 0); })) return { ok: false, reason: 'Non-positive close in window' };
    var logp = win.map(Math.log);
    var nL = logp.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (var i = 0; i < nL; i++) { sx += i; sy += logp[i]; sxy += i * logp[i]; sxx += i * i; }
    var slope = (nL * sxy - sx * sy) / (nL * sxx - sx * sx);
    var intercept = (sy - slope * sx) / nL;
    var meanY = sy / nL, ssRes = 0, ssTot = 0;
    for (i = 0; i < nL; i++) { var fit = slope * i + intercept; ssRes += Math.pow(logp[i] - fit, 2); ssTot += Math.pow(logp[i] - meanY, 2); }
    var r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    var annualizedPct = (Math.exp(slope * 252) - 1) * 100;
    var score = annualizedPct * r2;
    var maxGap = 0;
    for (i = 1; i < win.length; i++) maxGap = Math.max(maxGap, Math.abs((win[i] - win[i - 1]) / win[i - 1] * 100));
    return { ok: true, annualizedPct: annualizedPct, r2: r2, score: score, maxGapPct: maxGap, gapFlagged: maxGap > gapPct };
}

var _PS_ATR_STOP_MULT = 1.5, _PS_ATR_TARGET_MULT = 2.5;   // matches trade_levels.py exactly
var _PS_EXTENDED_PCT = 25.0, _PS_MILD_EXT_PCT = 10.0;

// Long-side extension check + ATR entry/stop/target (trade_levels.py). Minervini/O'Neil
// "don't chase": single digits above a rising 50-day SMA is a reasonable buy zone; beyond
// 25% above it is extended, and the textbook response is a pullback entry toward the
// 50-day line rather than chasing the current price.
function _psLongLevels(candles, price, sma50) {
    var pctAbove = sma50 ? (price / sma50 - 1) * 100 : null;
    var note, entry;
    if (pctAbove == null) { note = 'no 50-day SMA'; entry = price; }
    else if (pctAbove <= _PS_MILD_EXT_PCT) { note = 'in buy zone (not extended)'; entry = price; }
    else if (pctAbove <= _PS_EXTENDED_PCT) { note = 'mildly extended — a shallow pullback toward the 50-day SMA is lower-risk than chasing here'; entry = sma50 * 1.03; }
    else { note = 'EXTENDED (>25% above 50-day SMA) — textbook move is to wait for a pullback to the 50-day line'; entry = sma50; }
    var atr = _psAtr14(candles);
    if (atr == null || !entry) return { pctAbove: pctAbove, note: note, atr: atr, entry: entry, stop: null, target: null, rr: null };
    var stop = entry - _PS_ATR_STOP_MULT * atr, target = entry + _PS_ATR_TARGET_MULT * atr;
    var risk = entry - stop, reward = target - entry;
    return { pctAbove: pctAbove, note: note, atr: atr, entry: entry, stop: stop, target: target, rr: risk > 0 ? reward / risk : null };
}

// Short-side mirror (short_levels.py) — entry on a bounce UP toward a falling 50-day SMA if
// already extended down, stop ABOVE entry, target BELOW entry.
function _psShortLevels(candles, price, sma50) {
    var pctBelow = price ? (sma50 / price - 1) * 100 : null;
    var note, entry;
    if (pctBelow == null) { note = 'no 50-day SMA'; entry = price; }
    else if (pctBelow <= _PS_MILD_EXT_PCT) { note = 'in sell zone (not extended)'; entry = price; }
    else if (pctBelow <= _PS_EXTENDED_PCT) { note = 'mildly extended down — a shallow bounce toward the 50-day SMA is lower-risk than chasing the decline'; entry = sma50 * 0.97; }
    else { note = 'EXTENDED DOWN (>25% below 50-day SMA) — textbook move is to wait for a bounce to the 50-day line'; entry = sma50; }
    var atr = _psAtr14(candles);
    if (atr == null || !entry) return { pctBelow: pctBelow, note: note, atr: atr, entry: entry, stop: null, target: null, rr: null };
    var stop = entry + _PS_ATR_STOP_MULT * atr, target = entry - _PS_ATR_TARGET_MULT * atr;
    var risk = stop - entry, reward = entry - target;
    return { pctBelow: pctBelow, note: note, atr: atr, entry: entry, stop: stop, target: target, rr: risk > 0 ? reward / risk : null };
}

// ── Primary classification: Trend Template / Short Template / Stage, combined ──────────
// This is now the TRUSTED base call ("is this a genuine, mechanically-defined Stage 2
// uptrend / Stage 4 downtrend worth a swing/positional hold") — see the file-header note.
// dir: +1 confirmed long (Trend Template PASS), +0.5 Stage 2 forming/unconfirmed,
//       0 Stage 1 basing, -0.3 Stage 3 topping, -0.5 Stage 4 forming, -1 confirmed short
//       (Short Template PASS), null = insufficient history.
function _psPrimaryRead(candles, niftyCloses) {
    var tt = _psTrendTemplate(candles, niftyCloses);
    var st = _psShortTemplate(candles, niftyCloses);
    var stage = _psStage(candles);
    var mom = _psMomentum(candles);
    if (!tt.ok && !st.ok && !stage.ok) return { ok: false, tt: tt, st: st, stage: stage, mom: mom, dir: null, label: 'INSUFFICIENT HISTORY' };
    var dir, label;
    if (tt.ok && tt.passes) { dir = 1; label = 'STAGE 2 CONFIRMED (Trend Template ' + tt.rulesPassed + '/' + tt.rulesTotal + ')'; }
    else if (st.ok && st.passes) { dir = -1; label = 'STAGE 4 CONFIRMED (Short Template ' + st.rulesPassed + '/' + st.rulesTotal + ')'; }
    else if (stage.ok && stage.stage === 2) { dir = 0.5; label = stage.label + (tt.ok ? ' (' + tt.rulesPassed + '/' + tt.rulesTotal + ' Trend Template rules)' : ''); }
    else if (stage.ok && stage.stage === 1) { dir = 0; label = stage.label; }
    else if (stage.ok && stage.stage === 3) { dir = -0.3; label = stage.label; } // no trade plan — see _psAttachTradePlan's isWatch
    else if (stage.ok && stage.stage === 4) { dir = -0.5; label = stage.label + (st.ok ? ' (' + st.rulesPassed + '/' + st.rulesTotal + ' rules)' : ''); }
    else { dir = null; label = 'INSUFFICIENT HISTORY'; }
    return { ok: true, tt: tt, st: st, stage: stage, mom: mom, dir: dir, label: label };
}

var _PS_CACHE = {}; // _PS_CACHE[name] = { candles, futCandles, ...computed fields }
var _PS_LAST_FILTERED_ROWS = []; // whatever's currently on screen after filter/search/sort — see _psRenderTable
var _PS_BASKET_SELECTED = {}; // name -> true, checked via the "Add to Basket" checkbox column — see _psRenderTable

jQ(document).on('click', '#show-positional-screener', function (e) {
    e.preventDefault();
    _psShowPopup();
});

// ── Content HTML — shared by the standalone popup AND the "Positional" dashboard tab.
// All ids are global (not container-scoped), same as the rest of this app's popups —
// only one of {popup, tab} is expected to be on-screen at a time in normal use.
// Selection UI mirrors Stock Viewer's own filter bar + chip panel exactly (same
// classes/UX: category segment buttons open a chip panel, chips toggle selected) — plus
// a search+autocomplete box (same pattern as backtest.js's instrument picker) to add any
// symbol directly regardless of which category filter is active, for genuine multi-select.
function _psContentHtml() {
    var counts = _psCategoryCounts();
    return '<div class="ps-wrap">'
        // ── Filter bar ───────────────────────────────────────────────────────
        + '<div id="ps-filter-row">'
        +   '<div class="sv-seg-group">'
        +     _psSegBtn('all',    'ALL',        counts.all,    '')
        +     _psSegBtn('aso',    'ASO',        counts.aso,    'green')
        +     _psSegBtn('bso',    'BSO',        counts.bso,    'red')
        +     _psSegBtn('nine15', '9:15',       counts.nine15, 'gold')
        +     _psSegBtn('n50',    'NIFTY 50',   null,          '')
        +     _psSegBtn('bank',   'BANK NIFTY', null,          '')
        +     _psSegBtn('weight', 'WEIGHTED',   null,          '')
        +     _psSegBtn('idx',    'INDEX + MCX', null,         '')
        +   '</div>'
        + '</div>'
        // ── Chip panel: search-autocomplete add + category chip list ───────────
        + '<div id="ps-chip-panel">'
        +   '<div id="ps-chip-controls">'
        +     '<span id="ps-chip-label">SELECT INSTRUMENTS</span>'
        +     '<div class="bt-bk-search" style="min-width:200px;flex:0 0 auto;">'
        +       '<input type="text" id="ps-add-input" placeholder="Add symbol…" autocomplete="off">'
        +       '<button id="ps-add-btn" class="fsig-add-btn"><i class="bi bi-plus-circle"></i> Add</button>'
        +       '<div id="ps-add-ac-drop" class="fsig-ac-drop" style="position:fixed;"></div>'
        +     '</div>'
        +     '<div style="display:flex;gap:4px;">'
        +       '<button id="ps-chip-select-all" class="sv-pill-btn" type="button">All</button>'
        +       '<button id="ps-chip-select-none" class="sv-pill-btn" type="button">None</button>'
        +     '</div>'
        +     '<button id="ps-scan-btn" class="sv-load-btn" type="button"><i class="bi bi-play-fill"></i> SCAN</button>'
        +   '</div>'
        +   '<div id="ps-chip-list"></div>'
        + '</div>'
        // ── Results controls + table ────────────────────────────────────────────
        + '<div class="ps-controls">'
        +   '<span id="ps-progress" class="ps-progress"></span>'
        +   '<span id="ps-summary" class="ps-summary"></span>'
        +   '<button id="ps-tradeable-btn" class="sv-pill-btn" type="button" title="One-click shortlist: STRONG BUY / STRONG SELL / LONG forming / SHORT forming at Conviction 60 or more, plus BUY / SELL (awaiting overlay) at 65 or more. Excludes anything flagged caution (overlay disagreeing). Combines with the other filters."><i class="bi bi-check2-circle"></i> Tradeable</button>'
        +   '<select id="ps-filter" class="sv-pill-btn">'
        +     '<option value="all">All</option>'
        +     '<option value="strongbuy">STRONG BUY</option>'
        +     '<option value="buy">BUY (any)</option>'
        +     '<option value="strongsell">STRONG SELL</option>'
        +     '<option value="sell">SELL (any)</option>'
        +     '<option value="longforming">LONG forming (Stage 2)</option>'
        +     '<option value="shortforming">SHORT forming (Stage 4)</option>'
        +     '<option value="basing">Basing (Stage 1)</option>'
        +     '<option value="topping">Topping (Stage 3)</option>'
        +     '<option value="watch">WATCH (all forming/no-plan)</option>'
        +   '</select>'
        +   '<select id="ps-sort" class="sv-pill-btn">'
        +     '<option value="score">Sort: Score</option>'
        +     '<option value="name">Sort: Name</option>'
        +     '<option value="rs">Sort: Rel Strength</option>'
        +     '<option value="conv">Sort: Conviction%</option>'
        +   '</select>'
        +   '<label style="display:flex;align-items:center;gap:4px;font-size:0.6rem;color:var(--gtb-muted);" title="Only show rows with Conviction% at or above this value. Rows with no conviction score (no direction) are hidden whenever this is set above 0.">'
        +     'Min Conv%'
        +     '<input type="number" id="ps-min-conv" class="dl-search" min="0" max="100" step="5" value="60" style="width:56px;margin:0;" placeholder="0">'
        +   '</label>'
        +   '<input type="text" id="ps-search" class="dl-search" style="width:140px;margin:0;" placeholder="Search results…">'
        +   '<button id="ps-telegram-btn" class="sv-pill-btn" type="button" title="Send the currently filtered rows to Telegram"><i class="bi bi-send"></i> Telegram</button>'
        +   '<button id="ps-basket-btn" class="sv-pill-btn" type="button" title="Add the checked stocks to a Kite basket for bulk execution"><i class="bi bi-cart-plus"></i> Add to Basket (<span id="ps-basket-count">0</span>)</button>'
        + '</div>'
        + '<div id="ps-breadth"></div>'
        + '<div id="ps-table-wrap" class="ps-table-wrap">'
        +   '<div class="sv-empty-state"><i class="bi bi-funnel-fill"></i><span>Choose a filter above, or add symbols by search, then click SCAN</span></div>'
        + '</div>'
        + '</div>';
}

function _psShowPopup() {
    showPopUpWindow('positional-screener', _psContentHtml(), 'Positional Screener', 1150, 700);
    var cls = 'popup-custom-style-positional-screener';
    var title = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<i class="bi bi-funnel-fill"></i><span style="font-weight:800;font-size:0.7rem;">POSITIONAL SCREENER (SWING)</span>'
        + (typeof _ii === 'function' ? _ii('ps-overview') : '')
        + popupWinControls(cls)
        + '</div>';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html(title);
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + cls).find('.popupwindow_content').css({ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '0', position: 'relative' });
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');

    if (Object.keys(_PS_CACHE).length) _psRenderTable(); // restore last scan, if any, without re-fetching
}

// ── Dashboard tab entry point — renders the SAME content into the tab pane instead of a
// popup window. Only builds once (matches the app's own "manages its own DOM" convention
// for tabs like Trade/Dashboard — see _GTB_PANE_GRIDS) so switching away and back doesn't
// reset the chip selection or wipe a scan already in progress/completed.
function _psRenderInPane() {
    var $pane = jQ('#gtb-pane-positional');
    if (!$pane.length) return;
    if (!$pane.find('.ps-wrap').length) {
        $pane.html(_psContentHtml());
    }
    if (Object.keys(_PS_CACHE).length) _psRenderTable(); // keep results in sync on every tab activation
}

function _psSegBtn(filter, label, count, color) {
    var countHtml = count != null ? '<span class="sv-seg-count">' + count + '</span>' : '';
    return '<button class="sv-seg-btn ps-seg-btn" data-psfilter="' + filter + '" data-color="' + color + '" type="button">'
        + '<span class="sv-seg-label">' + label + '</span>' + countHtml + '</button>';
}

// ── Instrument list builder — scoped to what this screener actually supports (F&O
// stocks + the always-available indices/MCX), NOT the full INSTRUMENT_TOKENS universe
// Stock Viewer's own _svBuildList reads, since a non-F&O name has no futures OI to score.
function _psCategoryCounts() {
    var out = { all: (typeof FO_LIST !== 'undefined' ? FO_LIST.length : 0), aso: 0, bso: 0, nine15: 0 };
    try {
        var scriptData = generateTrends();
        var breakOut915 = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN')) || {};
        (typeof FO_LIST !== 'undefined' ? FO_LIST : []).forEach(function (name) {
            var trends = scriptData[name] ? scriptData[name]['trends'] : [];
            var c915 = breakOut915[name] && breakOut915[name]['CLOSE_9_15'];
            if (jQ.inArray('ASO', trends) !== -1) out.aso++;
            if (jQ.inArray('BSO', trends) !== -1) out.bso++;
            if (c915 === 'ASO' || c915 === 'BSO') out.nine15++;
        });
    } catch (e) {}
    return out;
}

function _psBuildList(type) {
    if (type === 'idx') return _PS_EXTRA_INSTRUMENTS.slice();
    var list = [];
    var scriptData = generateTrends();
    var breakOut915 = JSON.parse(localStorage.getItem('VALID_BREAKOUT_NINE_FIFTEEN')) || {};
    (typeof FO_LIST !== 'undefined' ? FO_LIST : []).forEach(function (name) {
        var trends = scriptData[name] ? scriptData[name]['trends'] : [];
        var c915 = breakOut915[name] && breakOut915[name]['CLOSE_9_15'];
        if (type === 'all') { list.push(name); return; }
        if (type === 'aso' && jQ.inArray('ASO', trends) !== -1) list.push(name);
        if (type === 'bso' && jQ.inArray('BSO', trends) !== -1) list.push(name);
        if (type === 'nine15' && (c915 === 'ASO' || c915 === 'BSO')) list.push(name);
        if (type === 'n50' && typeof NIFTY_50_LIST !== 'undefined' && jQ.inArray(name, NIFTY_50_LIST) !== -1) list.push(name);
        if (type === 'bank' && typeof NIFTY_BANK_LIST !== 'undefined' && jQ.inArray(name, NIFTY_BANK_LIST) !== -1) list.push(name);
        if (type === 'weight' && typeof WEIGHTED_STOCKS !== 'undefined' && jQ.inArray(name, WEIGHTED_STOCKS) !== -1) list.push(name);
    });
    return list;
}

// ── Chip panel ────────────────────────────────────────────────────────────────
function _psShowChipPanel(list) {
    var chipsHtml = list.map(function (name) {
        return '<div class="sv-chip sv-chip-selected" data-name="' + name + '"><span class="sv-chip-name">' + name + '</span></div>';
    }).join('');
    jQ('#ps-chip-list').html(chipsHtml);
    jQ('#ps-chip-panel').show();
    _psUpdateScanCount();
}
jQ(document).on('click', '.ps-seg-btn', function () {
    jQ('.ps-seg-btn').removeClass('sv-seg-active');
    jQ(this).addClass('sv-seg-active');
    _psShowChipPanel(_psBuildList(jQ(this).attr('data-psfilter')));
});
// NOTE: stockViewer.js already binds a document-level '.sv-chip' click handler that
// toggles 'sv-chip-selected' for ANY chip with that class, anywhere in the app (it fires
// first since that file loads before this one). Adding our own toggleClass here double-
// toggles (net no-op on every click) -- same collision grootTradeBot.js's Instrument
// Detail View chip panel already documents and works around. Only update the count here.
jQ(document).on('click', '#ps-chip-panel .sv-chip', function () { _psUpdateScanCount(); });
jQ(document).on('click', '#ps-chip-select-all', function () { jQ('#ps-chip-panel .sv-chip').addClass('sv-chip-selected'); _psUpdateScanCount(); });
jQ(document).on('click', '#ps-chip-select-none', function () { jQ('#ps-chip-panel .sv-chip').removeClass('sv-chip-selected'); _psUpdateScanCount(); });

function _psUpdateScanCount() {
    var n = jQ('#ps-chip-panel .sv-chip.sv-chip-selected').length;
    jQ('#ps-scan-btn').html('<i class="bi bi-play-fill"></i> SCAN' + (n ? ' (' + n + ')' : ''));
}

// ── Search + autocomplete "Add" — lets a symbol be added regardless of which category
// filter is active, e.g. add one stock from outside NIFTY 50 while that filter is shown.
function _psAllNames() {
    var seen = {}, list = [];
    function add(n) { n = (n || '').trim().toUpperCase(); if (n && !seen[n]) { seen[n] = 1; list.push(n); } }
    (typeof FO_LIST !== 'undefined' ? FO_LIST : []).forEach(add);
    _PS_EXTRA_INSTRUMENTS.forEach(add);
    return list.sort();
}
function _psAddChip(name) {
    if (!jQ('#ps-chip-panel').is(':visible')) jQ('#ps-chip-panel').show();
    var $existing = jQ('#ps-chip-list .sv-chip[data-name="' + name + '"]');
    if ($existing.length) { $existing.addClass('sv-chip-selected'); }
    else { jQ('#ps-chip-list').append('<div class="sv-chip sv-chip-selected" data-name="' + name + '"><span class="sv-chip-name">' + name + '</span></div>'); }
    _psUpdateScanCount();
}
jQ(document).on('input', '#ps-add-input', function () {
    var q = jQ(this).val().trim().toUpperCase();
    var $drop = jQ('#ps-add-ac-drop');
    if (!q) { $drop.empty().hide(); return; }
    var items = _psAllNames().filter(function (n) { return n.indexOf(q) !== -1; }).slice(0, 12);
    if (!items.length) { $drop.empty().hide(); return; }
    var html = items.map(function (n) { return '<div class="fsig-ac-item" data-name="' + n + '">' + n + '</div>'; }).join('');
    var rect = this.getBoundingClientRect();
    $drop.html(html).css({ top: (rect.bottom + 2) + 'px', left: rect.left + 'px', width: rect.width + 'px' }).show();
});
jQ(document).on('click', '#ps-add-ac-drop .fsig-ac-item', function () {
    _psAddChip(jQ(this).attr('data-name'));
    jQ('#ps-add-input').val('');
    jQ('#ps-add-ac-drop').empty().hide();
});
jQ(document).on('click', '#ps-add-btn', function () {
    var name = jQ('#ps-add-input').val().trim().toUpperCase();
    if (name) _psAddChip(name);
    jQ('#ps-add-input').val('');
    jQ('#ps-add-ac-drop').empty().hide();
});
jQ(document).on('keydown', '#ps-add-input', function (e) { if (e.key === 'Enter') jQ('#ps-add-btn').click(); });
jQ(document).on('click', function (e) {
    if (!jQ(e.target).closest('#ps-add-ac-drop, #ps-add-input').length) jQ('#ps-add-ac-drop').empty().hide();
});

// ── Data fetch (daily candles, rate-limited via the app's existing hist queue) ──
// NOT d.toISOString() — that converts to UTC first, and IST is UTC+5:30, so any run
// between midnight and 5:30 AM IST would silently resolve "today" to the previous
// calendar day. Use local date components directly instead.
function _psDateStr(d) {
    var y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
}

async function _psFetchDaily(token, days) {
    // "Today" here is Tampermonkey's configured CURRENT_DAY (Settings → current_day_date),
    // the same convention every other historical fetch in this app uses (_gtbCurrDay()) —
    // NOT the real wall-clock date. CURRENT_DAY defaults to today but can be overridden,
    // e.g. to review a specific past session; new Date() would silently ignore that.
    var to = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? new Date(CURRENT_DAY + 'T00:00:00') : new Date();
    var from = new Date(to); from.setDate(from.getDate() - days);
    // Respect the app-wide snapshot-time picker (#gtb-hist-time / _gtbHistTime()) the same
    // way every other historical fetch does — a 'day'-interval candle for TODAY reflects
    // the true live intraday state and can't be truncated mid-session by date alone, so
    // this only actually matters for today's own (last) candle; every earlier day in the
    // series is a completed session regardless. Falls back to market close (15:30) when
    // no snapshot time is set, same as before.
    var histTime = (typeof _gtbHistTime === 'function') ? _gtbHistTime() : null;
    var toTime = histTime || '15:30';
    var raw = await getHistoricalDataUsingPromise(token, _psDateStr(from) + ' 09:00:00', _psDateStr(to) + ' ' + toTime + ':00', 'day');
    return (raw && raw.data && raw.data.candles) ? raw.data.candles : [];
}

// Indices/MCX use different naming + token sources than F&O stocks — same mapping
// convention as backtest.js/optionStrikeSearch.js (display name -> exchange-native name).
var _PS_INDEX_NAMES = { 'NIFTY 50': 'NIFTY', 'NIFTY BANK': 'BANKNIFTY' };
// Same MCX universe config.js already tracks (_CFG_MCX_COMMODITIES) — was CRUDEOILM-only
// here; every other MCX name works identically (all resolve via COMMODITIES_FUTURE_INSTRUMENT_LIST
// / MCX_FUT_CURVE, both already name-keyed and generic, not crude-specific). ZINC/COPPER etc.
// have no commodity-specific vol index for their VIX-range read elsewhere in the app (falls
// back to India VIX or the manual VIX config) — that's an existing, documented limitation of
// those commodities generally, not something this scanner introduces.
var _PS_MCX_NAMES = ['CRUDEOIL', 'CRUDEOILM', 'GOLD', 'GOLDM', 'SILVER', 'SILVERM', 'NATURALGAS', 'NATGASMINI', 'ZINC', 'COPPER', 'USDINR'];
// Scanned alongside FO_LIST — indices/MCX have no daily "trend" of their own the way a
// stock does in the strictest sense, but the same SMA/breakout/RS/OI math applies fine to
// their own price series.
var _PS_EXTRA_INSTRUMENTS = ['NIFTY 50', 'NIFTY BANK'].concat(_PS_MCX_NAMES);
// groot-research's own LOOKBACK_DAYS_NEEDED (260 trading days) * 1.6 calendar-day buffer,
// ported as-is from scanner.py's fetch_daily — enough for the 200-day SMA + Rule 3's 21-day
// slope check + the 252-day 52-week window, with margin.
var _PS_LOOKBACK_DAYS = 420;

// Spot/price token for the daily candle fetch. Stocks (INSTRUMENT_TOKENS) unchanged;
// NIFTY 50/NIFTY BANK also come from INSTRUMENT_TOKENS (already carries indices); MCX
// names have no separate spot instrument at all — the near-month FUT contract itself is
// what's traded, so its own token doubles as both price AND OI source.
function _psPriceTokenFor(name) {
    if (_PS_MCX_NAMES.indexOf(name) !== -1) return _psFutTokenFor(name);
    return (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS[name] : null;
}

function _psFutEntryFor(name) {
    var exchName = _PS_INDEX_NAMES[name] || name;
    if (_PS_MCX_NAMES.indexOf(name) !== -1) {
        if (typeof COMMODITIES_FUTURE_INSTRUMENT_LIST === 'undefined') return null;
        return COMMODITIES_FUTURE_INSTRUMENT_LIST.find(function (r) { return r.name === exchName; }) || null;
    }
    if (typeof FUTURE_INTRUMENT_LIST === 'undefined') return null;
    return FUTURE_INTRUMENT_LIST.find(function (r) { return r.name === exchName; }) || null;
}
function _psFutTokenFor(name) {
    var e = _psFutEntryFor(name);
    return e ? e.instrument_token : null;
}

// Trading days remaining to the near-month contract's expiry, as of CURRENT_DAY — near-
// month futures OI structurally DECLINES in the last few sessions before expiry as
// positions roll into the next month, regardless of actual bullish/bearish conviction.
// That rollover effect swamps the 5-day OI comparison below, making almost every stock
// read as OI-down (SHORT COVERING / LONG UNWINDING only, never a genuine buildup) — this
// is what the buildup classification needs to detect and flag rather than silently report.
// expiry format from Kite is "DD-MM-YYYY" or "YYYY-MM-DD" depending on source list; handle both.
function _psDaysToExpiry(expiryStr) {
    if (!expiryStr) return null;
    var d;
    if (/^\d{4}-\d{2}-\d{2}/.test(expiryStr)) {
        d = new Date(expiryStr.slice(0, 10) + 'T00:00:00');
    } else if (/^\d{2}-\d{2}-\d{4}/.test(expiryStr)) {
        var parts = expiryStr.slice(0, 10).split('-');
        d = new Date(parts[2] + '-' + parts[1] + '-' + parts[0] + 'T00:00:00');
    } else return null;
    var today = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? new Date(CURRENT_DAY + 'T00:00:00') : new Date();
    return Math.round((d - today) / 86400000);
}

// Kite chart link needs the right exchange segment + token per instrument class.
// -- Full plain-English trade recommendation, per stock -----------------------------------
// Assembles everything the scanner knows about one name into one readable verdict: what the
// primary (groot-research) read says, what today's overlay adds or subtracts, whether they
// agree, the concrete plan if one exists, and the caveats that apply. Shown in a popup via
// the "Explain" icon per row -- the tooltip icon only has room for the short exit rule.
function _psExplainVerdict(r) {
    var p = r.primary, L = [];
    var dirWord = function (d) { return d > 0 ? 'bullish' : d < 0 ? 'bearish' : 'neutral'; };

    L.push('<h3 style="margin:0 0 8px;">' + r.name + ' -- <span style="color:' + r.verdictColor + ';">' + r.verdict + '</span></h3>');
    L.push('<p style="color:var(--gtb-muted);margin:0 0 12px;">LTP ' + r.ltp.toFixed(2) + '</p>');

    // 1. Primary read
    L.push('<div style="font-weight:800;margin-bottom:4px;">1. Primary read (groot-research -- Minervini/Weinstein/Clenow)</div>');
    if (!p || !p.ok) {
        L.push('<p>Not enough trading-day history yet for a trend-template or stage read. This scanner needs 175+ days for a Stage read and 210+ for the full 8-rule Trend/Short Template -- likely a recently-listed stock. The verdict below is based ONLY on today\'s overlay, which is far less reliable on its own.</p>');
    } else {
        L.push('<p><b>' + p.label + '</b> -- ' + dirWord(p.dir) + ' bias' + (p.dir === 0 || p.dir === -0.3 ? ' (no trade direction by design -- see below)' : '') + '.</p>');
        if (p.tt && p.tt.ok) {
            L.push('<p>Trend Template (long-side, 8 rules): <b>' + p.tt.rulesPassed + '/' + p.tt.rulesTotal + '</b> passed' + (p.tt.rsPct != null ? ', 6-month relative strength vs NIFTY ' + (p.tt.rsPct >= 0 ? '+' : '') + p.tt.rsPct.toFixed(1) + '%' : '') + '. ' + (p.tt.passes ? 'ALL 8 pass -- this is a mechanically genuine Stage 2 uptrend by Minervini\'s own definition.' : 'Not all 8 pass, so this is not a fully confirmed Stage 2 uptrend yet.') + '</p>');
        }
        if (p.st && p.st.ok) {
            L.push('<p>Short Template (8 mirrored rules): <b>' + p.st.rulesPassed + '/' + p.st.rulesTotal + '</b> passed' + (p.st.rsPct != null ? ', 6-month relative weakness vs NIFTY ' + (p.st.rsPct >= 0 ? '+' : '') + p.st.rsPct.toFixed(1) + '%' : '') + '. ' + (p.st.passes ? 'ALL 8 pass -- a mechanically genuine Stage 4 downtrend.' : '') + '</p>');
        }
        if (p.stage && p.stage.ok) {
            L.push('<p>Weinstein Stage: <b>' + p.stage.label + '</b> (30-week MA slope ' + (p.stage.slopePct >= 0 ? '+' : '') + p.stage.slopePct.toFixed(1) + '% over 5 weeks, price at ' + p.stage.rangePct.toFixed(0) + '% of its 52-week range).</p>');
        }
        if (p.mom && p.mom.ok) {
            L.push('<p>Momentum (Clenow, 90-day): score <b>' + p.mom.score.toFixed(0) + '</b> = annualized trend ' + p.mom.annualizedPct.toFixed(0) + '% &times; smoothness R&sup2; ' + p.mom.r2.toFixed(2) + '.' + (p.mom.gapFlagged ? ' &#9888; A single-day move over 15% sits in this window and may be distorting the fit -- check the chart before trusting this number.' : '') + '</p>');
        } else if (p.mom && !p.mom.ok) {
            L.push('<p style="color:var(--gtb-muted);">Momentum: ' + p.mom.reason + '.</p>');
        }
    }

    // 2. Overlay
    L.push('<div style="font-weight:800;margin:14px 0 4px;">2. Today\'s overlay (same-day confirmation only -- never the primary call)</div>');
    L.push('<p>Daily trend ' + r.trendLabel + ', breakout ' + r.breakoutLabel + ', relative strength ' + (r.relStrength >= 0 ? '+' : '') + r.relStrength.toFixed(1) + '% vs NIFTY (20d), futures OI ' + r.oiLabel + ', futures curve ' + (r.curveLabel || 'no data') + '. Combined overlay score: <b style="color:' + r.overlayColor + ';">' + (r.overlayTotal >= 0 ? '+' : '') + r.overlayTotal.toFixed(1) + '</b> (' + r.overlayVerdict + ').</p>');

    // 3. Agreement
    L.push('<div style="font-weight:800;margin:14px 0 4px;">3. Do they agree?</div>');
    if (p && p.ok && p.dir != null) {
        if (r.agree) L.push('<p style="color:var(--gtb-green);">Yes -- the primary trend read and today\'s overlay point the same way. This is the higher-conviction case.</p>');
        else if (r.disagree) L.push('<p style="color:var(--gtb-amber);">No -- they actively disagree. The primary read (' + p.label + ') is kept as the direction (it is the trusted, mechanically-defined signal), but today\'s tape is working against it. Treat this as lower conviction and expect chop or a possible near-term pullback/bounce against the primary trend before it reasserts, if it does.</p>');
        else L.push('<p style="color:var(--gtb-amber);">Partially -- the primary trend is intact but today\'s overlay is not yet adding confirmation (score near zero). Reasonable to wait for the overlay to turn clearly positive/negative in the same direction before sizing up.</p>');
    } else {
        L.push('<p>No primary read to compare against -- this verdict rests on the overlay alone, which this app has always flagged as the less reliable of the two (its own weights were never back-tested).</p>');
    }

    // 4. Trade plan
    L.push('<div style="font-weight:800;margin:14px 0 4px;">4. Trade plan</div>');
    if (r.entry != null) {
        L.push('<table style="width:100%;border-collapse:collapse;margin-bottom:6px;">'
            + '<tr><td style="padding:2px 8px 2px 0;color:var(--gtb-muted);">Entry</td><td>' + r.entry.toFixed(2) + '</td></tr>'
            + '<tr><td style="padding:2px 8px 2px 0;color:var(--gtb-muted);">Target</td><td style="color:var(--gtb-green);">' + r.target.toFixed(2) + '</td></tr>'
            + '<tr><td style="padding:2px 8px 2px 0;color:var(--gtb-muted);">Stop</td><td style="color:var(--gtb-red);">' + r.stop.toFixed(2) + '</td></tr>'
            + '<tr><td style="padding:2px 8px 2px 0;color:var(--gtb-muted);">Risk:Reward</td><td>' + (r.riskReward != null ? '1:' + r.riskReward.toFixed(1) : '—') + '</td></tr>'
            + '</table>');
        L.push('<p>' + r.exitCriteria + '</p>');
        if (r.extensionNote) L.push('<p style="color:var(--gtb-muted);">Extension check: ' + r.extensionNote + '.</p>');
        L.push('<p style="color:var(--gtb-muted);font-size:0.6rem;">Levels source: ' + (r.levelsSource || '—') + '.</p>');
    } else {
        L.push('<p>' + r.exitCriteria + '</p>');
    }

    // 5. Conviction
    L.push('<div style="font-weight:800;margin:14px 0 4px;">5. Conviction</div>');
    if (r.convictionPct != null) {
        var cc = r.convictionPct >= 60 ? 'var(--gtb-green)' : r.convictionPct >= 40 ? 'var(--gtb-amber)' : 'var(--gtb-red)';
        L.push('<p><b style="color:' + cc + ';font-size:1.1em;">' + r.convictionPct + '%</b> -- a rule-based confidence score (rules passed, confirmed-vs-forming, overlay agreement, momentum, extension), NOT a back-tested win-rate. Use it as a threshold the way you would a real probability (e.g. only act above 60%), but read it as "how many of this scanner\'s own checks agree", not market-calibrated odds.</p>');
    } else {
        L.push('<p>No conviction score -- there is no direction here to be confident in (insufficient history, Stage 1 basing, or Stage 3 topping).</p>');
    }

    // 6. Bottom line
    L.push('<div style="font-weight:800;margin:14px 0 4px;">6. Bottom line</div>');
    var bottom;
    if (r.verdict.indexOf('STRONG BUY') !== -1) bottom = 'Both layers agree on a genuine, mechanically-confirmed uptrend with today\'s tape supporting it. This is the highest-conviction long setup this scanner produces. Still size and manage risk per the entry/stop/target above -- "STRONG" describes agreement between two rule-based readings, not a guarantee.';
    else if (r.verdict.indexOf('STRONG SELL') !== -1) bottom = 'Both layers agree on a genuine, mechanically-confirmed downtrend with today\'s tape supporting it. Highest-conviction short setup this scanner produces, with the same caveat -- rules agreeing is not a guarantee, and shorting carries margin/borrow/unlimited-loss risk this scanner does not model.';
    else if (r.verdict.indexOf('awaiting overlay confirmation') !== -1) bottom = 'The underlying trend is real and confirmed, but nothing about TODAY specifically supports acting yet. Reasonable to wait for the overlay to turn clearly in the same direction (a new breakout, fresh OI buildup, or a favorable curve read) before entering, or enter now with reduced size and tighter management.';
    else if (r.verdict.indexOf('disagrees') !== -1) bottom = 'The confirmed trend and today\'s tape are pulling in opposite directions. This is a genuine conflict, not noise -- the safer read is to wait for one side to resolve (either the overlay turns to confirm the trend, or the trend itself breaks down on a later scan) rather than trade into the disagreement.';
    else if (r.verdict.indexOf('forming') !== -1) bottom = 'A trend may be starting but is not yet mechanically confirmed (not all 8 rules pass). Treat any entry here as early and higher-risk than a confirmed setup -- smaller size, and re-scan to see if it graduates to CONFIRMED before adding.';
    else if (r.verdict.indexOf('basing') !== -1) bottom = 'No established direction. The textbook move is to do nothing and watch for a Stage 2 breakout -- do not buy a Stage 1 base hoping it becomes Stage 2; wait for it to actually happen.';
    else if (r.verdict.indexOf('topping') !== -1) bottom = 'If you are already long, this is a signal to trim or tighten stops, not a signal to add. It is explicitly NOT a short setup in Weinstein\'s own framework -- that only applies once Stage 4 is confirmed.';
    else bottom = 'No clear, actionable edge from either layer right now.';
    L.push('<p><b>' + bottom + '</b></p>');

    L.push('<p style="color:var(--gtb-muted);font-size:0.58rem;margin-top:14px;">None of this has been back-tested against real forward returns -- the Trend Template/Stage/Momentum math is a faithful port of named published rules (Minervini, Weinstein, Clenow), which is why it is treated as primary; the overlay\'s weights and thresholds are this app\'s own and were never fitted or validated. Treat both as a structured starting point, not a proven edge.</p>');

    return L.join('');
}

jQ(document).on('click', '.ps-explain-btn', function () {
    var name = jQ(this).data('name');
    var r = _PS_CACHE[name];
    if (!r) return;
    var html = '<div style="padding:14px 16px;overflow-y:auto;height:100%;font-size:0.68rem;line-height:1.5;">' + _psExplainVerdict(r) + '</div>';
    // Slugify for the popup id/class -- multi-word names (NIFTY 50, NIFTY BANK) contain a
    // space, which is invalid inside a CSS class name; the raw name here produced a class
    // like "popup-custom-style-ps-explain-NIFTY 50", which jQ('.' + _cls) parses as TWO
    // selectors ("...NIFTY" descendant "50"), silently matching nothing -- the titlebar/theme
    // styling below never applied and the popup looked like it never opened. Single-word
    // names (TCS, RELIANCE) never hit this, which is why it looked instrument-specific.
    var slug = name.replace(/[^A-Za-z0-9]+/g, '-');
    showPopUpWindow('ps-explain-' + slug, html, name + ' -- Trade Recommendation', 480, 560);
    var _cls = 'popup-custom-style-ps-explain-' + slug;
    var _title = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<span style="font-weight:800;font-size:0.7rem;">' + name + ' — TRADE RECOMMENDATION</span>'
        + popupWinControls(_cls) + '</div>';
    jQ('.' + _cls).find('.popupwindow_titlebar_text').html(_title);
    hideNativePopupButtons(_cls);
    jQ('.' + _cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + _cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
});

function _psChartLink(name, token) {
    var exch = _PS_MCX_NAMES.indexOf(name) !== -1 ? 'MCX'
        : (name === 'NIFTY 50' || name === 'NIFTY BANK') ? 'NSE' : 'NSE';
    return 'https://kite.zerodha.com/markets/ext/chart/web/tvc/' + exch + '/' + name + '/' + (token || '');
}

// ── Pure scoring math (daily candles in, verdict out — no live-cache reads) ────
// Curve Structure (contango/backwardation) lean, same near-vs-far-contract logic as the
// Curve Structure Compare popup (_gtbFetchCurveRow, grootTradeBot.js), reused here as one
// more input into the swing/positional composite. Uses the app's already-loaded
// NSE_FUT_CURVE/MCX_FUT_CURVE (dataLoad.js, run Data Load first) for the near/far contract
// pair, and the SAME snapshot-aware daily fetch (_psFetchDaily) this scanner already uses
// for everything else, so it needs no separate live/5-minute fetch and stays consistent
// with a daily-swing timeframe. Thresholds mirror the Curve Structure Compare popup exactly:
// NSE bullish (backwardation) below -2%/yr, bearish (steep contango) above +10%/yr; MCX
// -3%/+8% (commodities carry real storage cost, so a wider "normal" contango band).
async function _psCurveLean(name, isMcx) {
    var curveMap = isMcx ? (typeof MCX_FUT_CURVE !== 'undefined' ? MCX_FUT_CURVE : {}) : (typeof NSE_FUT_CURVE !== 'undefined' ? NSE_FUT_CURVE : {});
    var exchName = _PS_INDEX_NAMES[name] || name;
    var refDay = isMcx ? (typeof MCX_CURRENT_DAY !== 'undefined' ? MCX_CURRENT_DAY : null) : (typeof CURRENT_DAY !== 'undefined' ? CURRENT_DAY : null);
    var rawCurve = curveMap[exchName] || curveMap[name] || [];
    // Drops any contract whose expiry is already before the snapshot day -- NSE_FUT_CURVE/
    // MCX_FUT_CURVE only update when Data Load's Kite Instruments sync is re-run, so on/after
    // an expiry day (e.g. NIFTY26SEPFUT expiring 2026-09-29) a curve cached from before that
    // sync would still list the now-expired contract as curve[0] and try to fetch candles for
    // a token that no longer trades -- which is exactly what produced "No candle data" here.
    // Same fix as _gtbFilterLiveCurve (grootTradeBot.js); reimplemented inline in case this
    // file's scan runs before that one has finished loading.
    var curve = (typeof _gtbFilterLiveCurve === 'function') ? _gtbFilterLiveCurve(rawCurve, refDay)
        : (refDay ? rawCurve.filter(function (c) { return !c.expiry || c.expiry >= refDay; }) : rawCurve);
    if (curve.length < 2) return { ok: false, reason: curve.length ? 'Only 1 contract listed' : 'No contracts listed (run Data Load)' };
    var near = curve[0], far = curve[1];
    try {
        var nearCandles = await _psFetchDaily(near.token, 5);
        var farCandles = await _psFetchDaily(far.token, 5);
        if (!nearCandles.length || !farCandles.length) return { ok: false, reason: 'No candle data (' + near.tradingsymbol + '/' + far.tradingsymbol + ' — try re-running Data Load if this contract just rolled over)' };
        var nearLtp = parseFloat(nearCandles[nearCandles.length - 1][4]);
        var farLtp = parseFloat(farCandles[farCandles.length - 1][4]);
        var diffPct = nearLtp ? ((farLtp - nearLtp) / nearLtp * 100) : 0;
        var daysGap = Math.max(1, moment(far.expiry).diff(moment(near.expiry), 'days'));
        var annualizedPct = diffPct * (365 / daysGap);
        var bullThresh = isMcx ? -3 : -2, bearThresh = isMcx ? 8 : 10;
        var state = diffPct > 0.05 ? 'CONTANGO' : diffPct < -0.05 ? 'BACKWARDATION' : 'FLAT';
        var dir = annualizedPct < bullThresh ? 1 : annualizedPct > bearThresh ? -1 : 0;
        return { ok: true, state: state, diffPct: diffPct, annualizedPct: annualizedPct, dir: dir,
                 label: dir > 0 ? 'BULL LEAN' : dir < 0 ? 'STEEP CONTANGO' : state };
    } catch (e) { return { ok: false, reason: 'Fetch error' }; }
}

function _psSma(closes, period) {
    if (closes.length < period) return null;
    var slice = closes.slice(closes.length - period);
    return slice.reduce(function (a, b) { return a + b; }, 0) / period;
}

function _psComputeSetup(candles, futCandles, niftyPctChg20, futToken, daysToExpiry, curveInfo, primary) {
    if (!candles || candles.length < 25) return null;
    var closes = candles.map(function (c) { return parseFloat(c[4]); });
    var ltp = closes[closes.length - 1];
    var sma20 = _psSma(closes, 20);
    var sma50 = _psSma(closes, Math.min(50, closes.length));

    // ── Trend structure ─────────────────────────────────────────────────────
    var trendScore = 0, trendLabel = 'SIDEWAYS';
    if (sma20 != null && sma50 != null) {
        if (ltp > sma20 && sma20 > sma50) { trendScore = 1; trendLabel = 'UPTREND'; }
        else if (ltp < sma20 && sma20 < sma50) { trendScore = -1; trendLabel = 'DOWNTREND'; }
    }

    // ── 20-day breakout / breakdown ──────────────────────────────────────────
    var last20 = candles.slice(-21, -1); // excludes today, so today can "break" it
    var high20 = Math.max.apply(null, last20.map(function (c) { return parseFloat(c[2]); }));
    var low20 = Math.min.apply(null, last20.map(function (c) { return parseFloat(c[3]); }));
    var breakoutScore = 0, breakoutLabel = 'INSIDE RANGE';
    if (ltp >= high20) { breakoutScore = 1; breakoutLabel = 'BREAKOUT (20d high)'; }
    else if (ltp <= low20) { breakoutScore = -1; breakoutLabel = 'BREAKDOWN (20d low)'; }

    // ── Relative strength vs NIFTY 50 over the same 20-day window ───────────
    var pctChg20 = closes.length > 20 ? ((ltp - closes[closes.length - 21]) / closes[closes.length - 21]) * 100 : 0;
    var relStrength = pctChg20 - (niftyPctChg20 || 0);
    var rsScore = relStrength > 2 ? 1 : relStrength < -2 ? -1 : 0;

    // ── Multi-day futures OI buildup (classic price/OI quadrant, on daily data) ─
    // "NO DATA" used to be one label for three different causes (no futures token
    // resolved at all, the fetch coming back empty, or genuinely too few candles yet —
    // e.g. a contract that just rolled over). Split so it's actually diagnosable instead
    // of a dead end.
    // Rollover week: near-month OI structurally declines into expiry as EVERY stock's
    // positions roll to the next month, independent of actual conviction — that swamps the
    // 5-day OI comparison and makes almost everything read as OI-down (SHORT COVERING /
    // LONG UNWINDING only, never a genuine buildup). Neutralize instead of reporting a
    // misleading directional read once inside that window. 3 trading days ≈ Wed onward of
    // expiry week for a Thursday/last-Thursday expiry — matches when rollover volume
    // typically dominates fresh positioning.
    var ROLLOVER_WINDOW_DAYS = 3;
    var inRollover = daysToExpiry != null && daysToExpiry >= 0 && daysToExpiry <= ROLLOVER_WINDOW_DAYS;

    var oiScore = 0, oiLabel;
    if (!futToken) oiLabel = 'NO FUT TOKEN';
    else if (inRollover) oiLabel = 'ROLLOVER (' + daysToExpiry + 'd to expiry)';
    else if (!futCandles || !futCandles.length) oiLabel = 'FETCH EMPTY';
    else if (futCandles.length < 6) oiLabel = 'TOO FEW CANDLES (' + futCandles.length + ')';
    else oiLabel = 'NO DATA';
    if (!inRollover && futCandles && futCandles.length >= 6) {
        var oiNow = parseFloat(futCandles[futCandles.length - 1][6]) || 0;
        var oiPrev = parseFloat(futCandles[futCandles.length - 6][6]) || 0; // ~5 trading days back
        var priceNow = parseFloat(futCandles[futCandles.length - 1][4]);
        var pricePrev = parseFloat(futCandles[futCandles.length - 6][4]);
        var oiUp = oiNow > oiPrev * 1.02, oiDown = oiNow < oiPrev * 0.98;
        var priceUp = priceNow > pricePrev, priceDown = priceNow < pricePrev;
        if (oiUp && priceUp) { oiScore = 1; oiLabel = 'LONG BUILDUP'; }
        else if (oiUp && priceDown) { oiScore = -1; oiLabel = 'SHORT BUILDUP'; }
        else if (oiDown && priceUp) { oiScore = 0.5; oiLabel = 'SHORT COVERING'; }
        else if (oiDown && priceDown) { oiScore = -0.5; oiLabel = 'LONG UNWINDING'; }
        else { oiLabel = 'FLAT OI'; }
    }

    // ── Composite ─────────────────────────────────────────────────────────────
    var curveScore = 0, curveLabel = 'NO DATA';
    if (curveInfo) {
        if (!curveInfo.ok) curveLabel = curveInfo.reason;
        else { curveScore = curveInfo.dir; curveLabel = curveInfo.state + ' (' + (curveInfo.annualizedPct >= 0 ? '+' : '') + curveInfo.annualizedPct.toFixed(1) + '%/yr)'; }
    }

    // Overlay total — this app's OWN same-day composite (trend/breakout/RS/OI/curve). Kept
    // exactly as before, but demoted: it is no longer the primary buy/sell call (see the
    // groot-research-parity block above and its file-header note) — it's a same-day
    // confirmation/timing check layered ON TOP of the Trend-Template/Stage read.
    var overlayTotal = trendScore * 2 + breakoutScore * 1.5 + rsScore * 1 + oiScore * 1.5 + curveScore * 1;
    var overlayVerdict = 'NEUTRAL', overlayColor = 'var(--gtb-muted)';
    if (overlayTotal >= 3) { overlayVerdict = 'STRONGLY BULLISH'; overlayColor = 'var(--gtb-green)'; }
    else if (overlayTotal >= 1.5) { overlayVerdict = 'BULLISH'; overlayColor = 'var(--gtb-green)'; }
    else if (overlayTotal <= -3) { overlayVerdict = 'STRONGLY BEARISH'; overlayColor = 'var(--gtb-red)'; }
    else if (overlayTotal <= -1.5) { overlayVerdict = 'BEARISH'; overlayColor = 'var(--gtb-red)'; }

    // ── Combined verdict — groot-research's Trend Template/Stage read is PRIMARY (trusted,
    // mechanically-defined, named-book rules); the overlay above only adjusts CONVICTION and
    // is never allowed to flip the direction groot-research established. If the two disagree
    // (e.g. Trend Template confirms Stage 2 but today's overlay leans bearish), the verdict
    // says so explicitly instead of quietly blending them into one number — per the stated
    // rule: "if the two disagree, trust groot-research's trend read over the TM composite."
    var verdict, verdictColor, dir = primary && primary.ok ? primary.dir : null;
    // Agreement requires the overlay to clear the SAME +/-1.5 bar its own old BUY/SELL
    // thresholds always used - a barely-positive overlay (e.g. +0.3, mostly one weak
    // signal outweighing a bearish OI/trend read) is NOT real same-day confirmation and
    // must not be enough to print STRONG BUY/SELL on its own.
    var agree = dir != null && ((dir > 0 && overlayTotal >= 1.5) || (dir < 0 && overlayTotal <= -1.5));
    var disagree = dir != null && ((dir >= 0.5 && overlayTotal <= -1.5) || (dir <= -0.5 && overlayTotal >= 1.5));
    if (dir == null) {
        // No groot-research read available (insufficient history) — fall back to the pure
        // overlay call, same thresholds this app has always used, clearly flagged as such.
        verdict = overlayTotal >= 3 ? 'BUY (overlay only — no trend history)' : overlayTotal >= 1.5 ? 'WATCH (overlay only)'
            : overlayTotal <= -3 ? 'SELL (overlay only — no trend history)' : overlayTotal <= -1.5 ? 'WATCH (overlay only)' : 'WATCH (overlay only)';
        verdictColor = overlayTotal >= 1.5 ? 'var(--gtb-green)' : overlayTotal <= -1.5 ? 'var(--gtb-red)' : 'var(--gtb-amber)';
    } else if (dir >= 1) {
        verdict = agree ? 'STRONG BUY' : disagree ? 'BUY — overlay disagrees (caution)' : 'BUY (awaiting overlay confirmation)';
        verdictColor = agree ? 'var(--gtb-green)' : 'var(--gtb-amber)';
    } else if (dir <= -1) {
        verdict = agree ? 'STRONG SELL' : disagree ? 'SELL — overlay disagrees (caution)' : 'SELL (awaiting overlay confirmation)';
        verdictColor = agree ? 'var(--gtb-red)' : 'var(--gtb-amber)';
    } else if (dir === 0.5) {
        // "forming" states MUST still say LONG/SHORT explicitly — a reader shouldn't have to
        // infer direction from "Stage 2" naming, a color, or the entry/stop/target ordering.
        verdict = disagree ? 'WATCH — LONG forming, overlay bearish (caution)' : 'WATCH — LONG forming (Stage 2)';
        verdictColor = 'var(--gtb-amber)';
    } else if (dir === 0) {
        verdict = 'WATCH — NO TRADE, basing (Stage 1)';
        verdictColor = 'var(--gtb-amber)';
    } else if (dir === -0.3) {
        verdict = 'CAUTION — NO SHORT, trim longs (Stage 3 topping)';
        verdictColor = 'var(--gtb-amber)';
    } else { // -0.5
        verdict = disagree ? 'WATCH — SHORT forming, overlay bullish (caution)' : 'WATCH — SHORT forming (Stage 4)';
        verdictColor = 'var(--gtb-amber)';
    }

    var setup = {
        ltp: ltp, pctChg20: pctChg20, sma20: sma20, sma50: sma50, high20: high20, low20: low20,
        trendScore: trendScore, trendLabel: trendLabel,
        breakoutScore: breakoutScore, breakoutLabel: breakoutLabel,
        relStrength: relStrength, oiScore: oiScore, oiLabel: oiLabel,
        curveScore: curveScore, curveLabel: curveLabel,
        overlayTotal: overlayTotal, overlayVerdict: overlayVerdict, overlayColor: overlayColor,
        total: overlayTotal, // kept for the Pre-Market Brief's OI-carryover-only use, which never sets `primary`
        primary: primary || null, agree: agree, disagree: disagree,
        verdict: verdict, verdictColor: verdictColor,
    };
    _psAttachTradePlan(setup, candles);
    return setup;
}

// ── Trade plan (entry / target / stop / exit) — derived from the SAME daily levels the
// score already computed (SMA20, 20-day high/low), not a new data source. This is a
// starting structural plan (a measured-move target off the 20-day range, a structural
// stop at SMA20/the opposite side of that range), not a guarantee — same caveat as the
// score itself: it's a lean, not a certainty, and should be sized/adjusted with your own
// risk rules.
// Conviction % (0-100) -- a transparent, rule-based confidence score built from the SAME
// inputs already shown on screen (rules passed, confirmed-vs-forming, overlay agreement,
// momentum quality, extension), NOT a statistically fitted probability -- nothing in this
// scanner has been back-tested against forward returns, so no number here can honestly claim
// "this setup works X% of the time". Meant to be usable exactly the way a real probability
// would be (e.g. "only act above 60%"), just labeled for what it actually is: how many of
// this scanner's own independent checks currently line up.
//   Rules passed (Trend/Short Template, X/8): up to 40 pts, scaled -- the single biggest input.
//   Confirmed vs forming: +25 if all 8 rules passed (dir +-1), +12.5 if only Stage-level
//     confirmation exists (dir +-0.5).
//   Overlay agreement: +20 if the overlay clears the same +-1.5 bar the verdict itself uses,
//     -20 if it actively disagrees, +0 if neutral/awaiting.
//   Momentum quality: up to +-10, scaled by R-squared (smoothness).
//   Extension: +5 if not chasing, -5 if already extended (>25% from the 50-day SMA).
// Returns null when there's no direction to have a conviction number about (no primary read,
// Stage 1 basing, or Stage 3 topping) -- shown as "--" rather than a misleading 0%.
function _psComputeConviction(setup) {
    var p = setup.primary;
    if (!p || !p.ok || p.dir == null || p.dir === 0 || p.dir === -0.3) return null;
    var dir = p.dir, isLong = dir > 0;
    var rulesObj = isLong ? p.tt : p.st;
    var pts = 0;
    if (rulesObj && rulesObj.ok) pts += (rulesObj.rulesPassed / rulesObj.rulesTotal) * 40;
    else pts += 20;
    pts += (Math.abs(dir) === 1) ? 25 : 12.5;
    if (setup.agree) pts += 20;
    else if (setup.disagree) pts -= 20;
    var mom = p.mom;
    if (mom && mom.ok) {
        var momDir = mom.score > 0 ? 1 : mom.score < 0 ? -1 : 0;
        var expectedDir = isLong ? 1 : -1;
        if (momDir === expectedDir) pts += (mom.gapFlagged ? 5 : 10) * mom.r2;
        else if (momDir === -expectedDir) pts -= 5;
    }
    var ext = setup.extensionNote || '';
    if (ext.indexOf('EXTENDED') !== -1) pts -= 5;
    else if (ext && (ext.indexOf('not extended') !== -1 || ext.indexOf('buy zone') !== -1 || ext.indexOf('sell zone') !== -1)) pts += 5;
    return Math.max(0, Math.min(100, Math.round(pts)));
}

function _psAttachTradePlan(setup, candles) {
    var range20 = setup.high20 - setup.low20;
    var dir = setup.primary && setup.primary.ok ? setup.primary.dir : null;
    var noPlan = { entry: null, target: null, stop: null, riskReward: null };

    // Case 1 — no primary read at all (fewer than ~175 trading days of history, e.g. a
    // recent listing). Falls back to the OLD measured-move plan (20-day SMA/range) so a
    // stock with real data is never left with no plan whatsoever — clearly labeled as a
    // fallback, distinct from a genuine "no direction" call below.
    if (dir == null) {
        var isBuyFallback = setup.overlayTotal >= 1.5, isSellFallback = setup.overlayTotal <= -1.5;
        setup.levelsSource = 'fallback (20-day range) — not enough trading days yet for the trend-template read';
        if (isBuyFallback) {
            setup.entry = setup.ltp;
            setup.target = setup.ltp + range20 * 0.75;
            setup.stop = Math.max(setup.sma20 != null ? setup.sma20 : setup.low20, setup.low20);
            setup.exitCriteria = 'Exit on a daily close below SMA20 (' + (setup.sma20 != null ? setup.sma20.toFixed(1) : '—')
                + ') or below the 20d low (' + setup.low20.toFixed(1) + ') — whichever is hit first.';
        } else if (isSellFallback) {
            setup.entry = setup.ltp;
            setup.target = setup.ltp - range20 * 0.75;
            setup.stop = Math.min(setup.sma20 != null ? setup.sma20 : setup.high20, setup.high20);
            setup.exitCriteria = 'Exit on a daily close above SMA20 (' + (setup.sma20 != null ? setup.sma20.toFixed(1) : '—')
                + ') or above the 20d high (' + setup.high20.toFixed(1) + ') — whichever is hit first.';
        } else {
            Object.assign(setup, noPlan);
            setup.convictionPct = null;
            setup.exitCriteria = 'No trade — not enough history for a trend read, and today\'s overlay is not decisive either.';
            return;
        }
        setup.riskReward = (setup.entry != null && setup.stop != null)
            ? Math.abs(setup.target - setup.entry) / Math.max(0.01, Math.abs(setup.entry - setup.stop)) : null;
        setup.convictionPct = null;
        return;
    }

    // Case 2 — Stage 1 (basing) or Stage 3 (topping): genuinely no directional trade here.
    // Weinstein's own framework treats Stage 3 as "trim/exit existing longs", NOT a short
    // candidate (that is Stage 4's role only) — so this must never fall into the isSell
    // branch below, even though dir is a small negative number for ranking purposes.
    if (dir === 0 || dir === -0.3) {
        Object.assign(setup, noPlan);
        setup.convictionPct = null;
        setup.levelsSource = 'no plan by design — ' + setup.primary.label;
        setup.exitCriteria = dir === 0
            ? 'No trade — Stage 1 basing has no established direction yet. Watch for a Stage 2 breakout (price reclaiming the 30-week MA with the MA itself turning up).'
            : 'No trade — Stage 3 topping calls for trimming/exiting existing longs, not a new short (that only applies once Stage 4 is confirmed). ';
        return;
    }

    // Case 3 — a real direction (confirmed Stage 2/4, or Stage 2/4 forming). Uses
    // groot-research's ATR(14) 1.5x/2.5x entry/stop/target (trade_levels.py / short_levels.py).
    // Prefers the Trend/Short Template's own price+SMA50 when available (210+ days); when the
    // direction comes ONLY from the Stage read (175-209 days — enough for Stage, not yet for
    // the full 8-rule template) falls back to this stock's own already-computed SMA50
    // (setup.sma50) rather than wrongly reporting "primary and overlay disagree".
    var isBuy = dir > 0, isSell = dir < 0;
    var tt = setup.primary.tt, st = setup.primary.st;
    if (isBuy) {
        var price = (tt && tt.ok) ? tt.price : setup.ltp;
        var sma50 = (tt && tt.ok) ? tt.sma50 : setup.sma50;
        var L = _psLongLevels(candles, price, sma50);
        setup.entry = L.entry; setup.target = L.target; setup.stop = L.stop; setup.riskReward = L.rr;
        setup.levelsSource = 'ATR(14) 1.5x/2.5x — groot-research convention' + ((tt && tt.ok) ? '' : ' (SMA50 only — Trend Template needs 210+ days, have ' + candles.length + ')');
        setup.extensionNote = L.note; setup.pctAboveSma50 = L.pctAbove;
        setup.exitCriteria = 'Structural stop at ' + (L.stop != null ? L.stop.toFixed(1) : '—') + ' (entry &minus; 1.5&times;ATR14). '
            + (L.note || '') + '. Also downgrade/exit if the overlay flips to LONG UNWINDING/SHORT BUILDUP or the next scan drops the Stage 2 read.';
    } else if (isSell) {
        var priceS = (st && st.ok) ? st.price : setup.ltp;
        var sma50S = (st && st.ok) ? st.sma50 : setup.sma50;
        var S = _psShortLevels(candles, priceS, sma50S);
        setup.entry = S.entry; setup.target = S.target; setup.stop = S.stop; setup.riskReward = S.rr;
        setup.levelsSource = 'ATR(14) 1.5x/2.5x — groot-research convention' + ((st && st.ok) ? '' : ' (SMA50 only — Short Template needs 210+ days, have ' + candles.length + ')');
        setup.extensionNote = S.note; setup.pctBelowSma50 = S.pctBelow;
        setup.exitCriteria = 'Structural stop at ' + (S.stop != null ? S.stop.toFixed(1) : '—') + ' (entry + 1.5&times;ATR14). '
            + (S.note || '') + '. Also downgrade/exit if the overlay flips to SHORT COVERING/LONG BUILDUP or the next scan drops the Stage 4 read.';
    }
    setup.convictionPct = _psComputeConviction(setup);
}

// ── Scan orchestration ───────────────────────────────────────────────────────
var _PS_SCANNING = false;

// Core scan loop, factored out of the button handler so the Dashboard auto-scan (below) can
// run the exact same per-stock pipeline (Trend Template/Stage/Momentum primary + overlay) for
// a smaller, fixed instrument list without duplicating it. Upserts into _PS_CACHE — does NOT
// clear it first — so callers decide whether this is a fresh full scan or a background topping-
// up of a few names on top of whatever's already cached.
async function _psRunScan(universe, opts) {
    opts = opts || {};
    var progress = opts.progressEl; // jQuery selector string, or falsy to skip progress text
    var niftyToken = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS['NIFTY 50'] : null;
    var niftyPctChg20 = 0, niftyCloses = null;
    if (niftyToken) {
        try {
            var niftyCandles = await _psFetchDaily(niftyToken, _PS_LOOKBACK_DAYS);
            if (niftyCandles.length > 20) {
                niftyCloses = niftyCandles.map(function (c) { return parseFloat(c[4]); });
                niftyPctChg20 = ((niftyCloses[niftyCloses.length - 1] - niftyCloses[niftyCloses.length - 21]) / niftyCloses[niftyCloses.length - 21]) * 100;
            }
        } catch (e) {}
    }

    var done = 0;
    for (var i = 0; i < universe.length; i++) {
        var name = universe[i];
        if (progress) jQ(progress).text('Scanning ' + (i + 1) + ' / ' + universe.length + ' — ' + name);
        try {
            var token = _psPriceTokenFor(name);
            if (!token) continue;
            // Long daily lookback — groot-research's Trend Template needs 210+ trading
            // days (200-day SMA + a buffer) and Weinstein Stage needs 150+25; the OLD
            // shorter-window signals (SMA20, 20-day breakout, OI buildup) still just read
            // the tail of this same series, so nothing else needed to change to get them.
            var candles = await _psFetchDaily(token, _PS_LOOKBACK_DAYS);
            var futEntry = _psFutEntryFor(name);
            var futToken = futEntry ? futEntry.instrument_token : null;
            var daysToExpiry = futEntry ? _psDaysToExpiry(futEntry.expiry) : null;
            var futCandles = futToken ? await _psFetchDaily(futToken, 15) : null;
            if (!futToken) console.log('[positional-screener]', name, 'no futures token resolved (check FUTURE_INTRUMENT_LIST/COMMODITIES_FUTURE_INSTRUMENT_LIST)');
            else if (daysToExpiry != null && daysToExpiry <= 3) console.log('[positional-screener]', name, 'in rollover window —', daysToExpiry, 'days to expiry, OI buildup read suppressed');
            else if (!futCandles || futCandles.length < 6) console.log('[positional-screener]', name, 'futures token', futToken, 'returned', (futCandles || []).length, 'candles');
            var curveInfo = await _psCurveLean(name, _PS_MCX_NAMES.indexOf(name) !== -1);
            // Primary read — groot-research parity (Trend Template / Short Template /
            // Stage / Clenow momentum), computed from the SAME long daily series, no extra
            // fetch. This is the TRUSTED base call; the overlay (trend/breakout/OI/curve
            // above) only confirms/times it — see _psComputeSetup's own comment.
            var primary = _psPrimaryRead(candles, niftyCloses);
            var setup = _psComputeSetup(candles, futCandles, niftyPctChg20, futToken, daysToExpiry, curveInfo, primary);
            if (setup) { setup.name = name; _PS_CACHE[name] = setup; done++; }
        } catch (e) { console.log('[positional-screener]', name, e); }
        if (opts.renderDuring && i % 10 === 0) _psRenderTable(); // incremental render so results appear while scanning
    }
    return done;
}

jQ(document).on('click', '#ps-scan-btn', async function () {
    if (_PS_SCANNING) return;
    _PS_SCANNING = true;
    var $btn = jQ(this).prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Scanning…');
    _PS_CACHE = {};

    try {
        var universe = jQ('#ps-chip-panel .sv-chip.sv-chip-selected').map(function () { return jQ(this).attr('data-name'); }).get();
        if (!universe.length) { _gtbToast('Pick a filter above (or add symbols by search) before scanning.', 'error'); return; }
        var done = await _psRunScan(universe, { progressEl: '#ps-progress', renderDuring: true });
        _psRenderTable();
        jQ('#ps-progress').text('Done — ' + done + ' / ' + universe.length + ' scanned');
        _gtbToast('Positional scan complete (' + done + ' stocks)', 'success');
    } finally {
        _PS_SCANNING = false;
        $btn.prop('disabled', false);
        _psUpdateScanCount();
    }
});

// ── Dashboard auto-scan — keeps the "POSITIONAL SCREENER VERDICT" dashboard card populated
// without requiring a manual full scan first. Deliberately restricted to Level Probability's
// own instrument universe (NIFTY 50/BANK + both indices' top-10 weighted constituents, ~16-18
// unique names after dedupe) rather than the full ~200-stock F&O list a manual scan can cover —
// each name needs a 210+ day daily-candle fetch (+futures +curve), so running the FULL universe
// on every 5-min dashboard refresh would be far too heavy. Shares _PS_CACHE with manual scans
// (upserts into it, never clears it), so running this never wipes out a larger manual scan the
// user already ran — it only ever fills in/refreshes this smaller subset.
// Throttled to once per ~4 minutes so an auto-refresh that fires faster than a scan completes
// (or two refresh triggers close together) can't pile up overlapping scans; also skipped
// outright while a manual scan (_PS_SCANNING) is already running, which already covers this
// universe (likely a superset) anyway.
var _PS_AUTO_SCAN_RUNNING = false;
var _PS_AUTO_SCAN_LAST_TS = 0;
var _PS_AUTO_SCAN_MIN_GAP_MS = 4 * 60 * 1000;
async function _psAutoScanDashboardInstruments() {
    if (_PS_SCANNING || _PS_AUTO_SCAN_RUNNING) return;
    if (Date.now() - _PS_AUTO_SCAN_LAST_TS < _PS_AUTO_SCAN_MIN_GAP_MS) return;
    var names = (typeof _gtbLvlProbInstrumentNames === 'function') ? _gtbLvlProbInstrumentNames() : [];
    if (!names.length) return;
    var seen = {}, universe = names.map(function (n) { return n.toUpperCase(); }).filter(function (n) { return seen[n] ? false : (seen[n] = true); });
    _PS_AUTO_SCAN_RUNNING = true;
    try {
        await _psRunScan(universe, {});
        _PS_AUTO_SCAN_LAST_TS = Date.now();
        try { jQ('#gtb-dash-ps-verdict').html(_psVerdictDashRowsHtml()); } catch (e) {}
        // Keep the Positional Screener's own pane in sync too, if it's currently built/visible —
        // same "don't wipe, just stay current" convention as the tab-activation restore above.
        if (jQ('#ps-table-wrap').length) { try { _psRenderTable(); } catch (e) {} }
    } catch (e) {
        console.log('[positional-screener] dashboard auto-scan failed', e);
    } finally {
        _PS_AUTO_SCAN_RUNNING = false;
    }
}

// ── Instrument Detail View panel — verdict + trade plan for ONE instrument, read from
// _PS_CACHE (the Positional Screener's own scan). Never scans on render; a Scan/Re-scan button
// runs _psRunScan for just this one name (one 400-day daily fetch, bounded) and repaints every
// open detail panel for it. Indices/commodities without a daily price token show "not available".
function _psInstrDetailVerdictHtml(name) {
    var key = String(name).toUpperCase();
    var r = _PS_CACHE[key] || _PS_CACHE[name];
    var canScan = !!_psPriceTokenFor(key);
    var btn = canScan
        ? '<button class="sv-pill-btn ps-detail-scan-btn" data-name="' + key + '" type="button" style="margin-top:6px;"><i class="bi bi-arrow-repeat"></i> ' + (r ? 'Re-scan' : 'Scan now') + '</button>'
        : '';
    if (!r) {
        return '<div style="font-size:0.56rem;color:var(--gtb-muted);">'
            + (canScan ? 'Not scanned yet — run the Positional Screener, or scan just this instrument.' : 'Positional verdict not available for this instrument (no daily price token).')
            + '</div>' + btn;
    }
    var p = r.primary;
    var primText = p && p.ok ? p.label : 'INSUFFICIENT HISTORY';
    var conv = r.convictionPct;
    var convColor = conv == null ? 'var(--gtb-muted)' : conv >= 60 ? 'var(--gtb-green)' : conv >= 40 ? 'var(--gtb-amber)' : 'var(--gtb-red)';
    var hasPlan = r.entry != null;
    return '<div style="font-size:0.58rem;line-height:1.5;">'
        + '<div><span class="ps-verdict" style="color:' + r.verdictColor + ';border-color:' + r.verdictColor + ';font-size:0.52rem;">' + r.verdict + '</span>'
        + ' <b style="color:' + convColor + ';margin-left:6px;">' + (conv == null ? '—' : conv + '%') + '</b> <span style="color:var(--gtb-muted);">conviction</span></div>'
        + '<div style="color:var(--gtb-muted);margin-top:3px;">Primary: <span style="color:var(--gtb-text);">' + primText + '</span> · Overlay: <b style="color:' + r.overlayColor + ';">' + r.overlayTotal.toFixed(1) + '</b></div>'
        + (hasPlan
            ? '<div style="margin-top:3px;font-variant-numeric:tabular-nums;">Entry <b>' + r.entry.toFixed(1) + '</b> · <span style="color:var(--gtb-green);">Target ' + r.target.toFixed(1) + '</span> · <span style="color:var(--gtb-red);">Stop ' + r.stop.toFixed(1) + '</span>' + (r.riskReward != null ? ' · R:R 1:' + r.riskReward.toFixed(1) : '') + '</div>'
            : '<div style="margin-top:3px;color:var(--gtb-muted);">No trade plan (no actionable direction).</div>')
        + '</div>' + btn;
}
jQ(document).on('click', '.ps-detail-scan-btn', async function () {
    var name = jQ(this).attr('data-name');
    if (_PS_SCANNING || _PS_AUTO_SCAN_RUNNING) { _gtbToast('A positional scan is already running — try again in a moment.', 'error'); return; }
    jQ('.ps-detail-scan-btn[data-name="' + name + '"]').prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Scanning…');
    try { await _psRunScan([name], {}); } catch (e) { console.log('[positional-screener] detail scan failed', e); }
    jQ('.ps-detail-verdict').each(function () {
        var n = jQ(this).attr('data-name');
        if (String(n).toUpperCase() === name) jQ(this).html(_psInstrDetailVerdictHtml(n));
    });
    try { jQ('#gtb-dash-ps-verdict').html(_psVerdictDashRowsHtml()); } catch (e) {}
});

// ── MCX Dashboard card — single-commodity Positional Screener verdict, one call per card
// (_psMcxDashVerdictHtml) plus a scan restricted to just the MCX Dashboard's own instrument
// list (_psAutoScanMcxDashInstruments), same "never scan more than this card actually needs"
// convention as the NSE Dashboard's _psAutoScanDashboardInstruments above. Triggered from
// _gtbMcxDashRefreshAll (grootTradeBot.js) on Refresh click — that popup deliberately fetches
// nothing on open, so this follows the same "only on Refresh" rule rather than auto-scanning
// on a timer the way the NSE Dashboard's 5-min refresh cycle does.
function _psMcxDashVerdictHtml(name) {
    var r = _PS_CACHE[name.toUpperCase()] || _PS_CACHE[name];
    if (!r) return '<span class="gtb-row-na" style="margin:auto">Not scanned</span>';
    return '<div style="width:100%;font-size:0.48rem;">'
        + '<div style="font-weight:800;color:var(--gtb-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px;">Positional Verdict</div>'
        + '<div style="color:' + r.verdictColor + ';font-weight:700;">' + r.verdict + '</div>'
        + (r.convictionPct != null ? '<div style="color:var(--gtb-muted);margin-top:2px;">Conviction ' + r.convictionPct + '%</div>' : '')
        + '</div>';
}
var _PS_MCX_DASH_AUTO_SCAN_RUNNING = false;
var _PS_MCX_DASH_AUTO_SCAN_LAST_TS = 0;
var _PS_MCX_DASH_AUTO_SCAN_MIN_GAP_MS = 60 * 1000; // lighter throttle than the NSE dashboard's 4min — this only ever runs on an explicit user Refresh click, not a 5-min timer
async function _psAutoScanMcxDashInstruments(names) {
    if (_PS_SCANNING || _PS_MCX_DASH_AUTO_SCAN_RUNNING) return;
    if (Date.now() - _PS_MCX_DASH_AUTO_SCAN_LAST_TS < _PS_MCX_DASH_AUTO_SCAN_MIN_GAP_MS) return;
    if (!names || !names.length) return;
    _PS_MCX_DASH_AUTO_SCAN_RUNNING = true;
    try {
        await _psRunScan(names, {});
        _PS_MCX_DASH_AUTO_SCAN_LAST_TS = Date.now();
        names.forEach(function (n) {
            var tid = n.replace(/ /g, '-').replace(/&/g, '-');
            try { jQ('#' + tid + '-ps-verdict-dash').html(_psMcxDashVerdictHtml(n)); } catch (e) {}
        });
    } catch (e) {
        console.log('[positional-screener] MCX dashboard auto-scan failed', e);
    } finally {
        _PS_MCX_DASH_AUTO_SCAN_RUNNING = false;
    }
}

// ── Dashboard card — Positional Screener verdict for Level Probability's instrument universe
// (NIFTY 50 + NIFTY BANK + both indices' top-10 weighted constituents, _gtbLvlProbInstrumentNames
// in grootTradeBot.js, shared so this can't drift onto a different instrument set than the
// Level Probability / Futures Accuracy cards it sits next to). Pure read of _PS_CACHE — the
// Positional Screener's own last scan — never triggers a scan itself: a scan fetches 210+ days
// of daily candles per stock (see file header), far too heavy to run on every 5-min dashboard
// refresh the way Futures Accuracy's 5-min intraday replay or Level Probability's cached-signal
// read can. A stock simply shows "not scanned" until the user runs (or re-runs) the screener.
function _psVerdictDashRowsHtml() {
    var names = (typeof _gtbLvlProbInstrumentNames === 'function') ? _gtbLvlProbInstrumentNames() : [];
    if (!names.length) return '<div style="font-size:0.5rem;color:var(--gtb-muted);padding:4px 0;">No instrument list available.</div>';
    if (!Object.keys(_PS_CACHE).length) {
        return '<div style="font-size:0.5rem;color:var(--gtb-muted);padding:4px 0;">Run a Positional Screener scan to see verdicts here.</div>';
    }
    // Bulls/Bears/Watch breakdown + net trend lean — scoped to just THIS card's instrument
    // set (not the full _PS_CACHE universe, which _psRenderSummary/_psRenderBreadth already
    // cover elsewhere) so the count here always matches what's actually listed below it.
    // Same substring-match convention as _psRenderSummary's BUY/SELL count (verdict strings
    // carry qualifiers like "BUY — overlay disagrees (caution)", not a fixed enum) — LONG/SHORT
    // forming are counted on their respective side since they're a directional lean, just not
    // yet mechanically confirmed.
    var scanned = names.map(function (name) { return _PS_CACHE[name.toUpperCase()] || _PS_CACHE[name]; }).filter(Boolean);
    var bulls = scanned.filter(function (r) { return r.verdict.indexOf('BUY') !== -1 || r.verdict.indexOf('LONG forming') !== -1; }).length;
    var bears = scanned.filter(function (r) { return r.verdict.indexOf('SELL') !== -1 || r.verdict.indexOf('SHORT forming') !== -1; }).length;
    var watch = scanned.length - bulls - bears;
    var trend = bulls > bears ? 'BULLISH' : bears > bulls ? 'BEARISH' : 'MIXED';
    var trendColor = bulls > bears ? 'var(--gtb-green)' : bears > bulls ? 'var(--gtb-red)' : 'var(--gtb-amber)';
    var summary = '<div style="display:flex;align-items:center;gap:8px;padding:0 0 6px;flex-wrap:wrap;font-size:0.56rem;border-bottom:1px solid var(--gtb-border);margin-bottom:4px;">'
        + '<span style="font-weight:800;letter-spacing:0.04em;color:' + trendColor + ';">' + trend + '</span>'
        + '<span style="color:var(--gtb-green);font-weight:700;"><i class="bi bi-arrow-up-short"></i> ' + bulls + ' Bulls</span>'
        + '<span style="color:var(--gtb-red);font-weight:700;"><i class="bi bi-arrow-down-short"></i> ' + bears + ' Bears</span>'
        + '<span style="color:var(--gtb-amber);font-weight:700;">' + watch + ' Watch</span>'
        + '<span style="color:var(--gtb-muted);">(' + scanned.length + '/' + names.length + ' scanned)</span>'
        + '</div>';
    var rows = names.map(function (name) {
        var r = _PS_CACHE[name.toUpperCase()] || _PS_CACHE[name];
        return '<div style="display:grid;grid-template-columns:80px 1fr 44px;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--gtb-border)18;font-size:0.58rem;">'
            + '<span style="color:var(--gtb-text);font-weight:700;">' + name + '</span>'
            + (r
                ? '<span style="color:' + r.verdictColor + ';">' + r.verdict + '</span>'
                + '<span style="text-align:right;color:var(--gtb-muted);font-variant-numeric:tabular-nums;">' + (r.convictionPct != null ? r.convictionPct + '%' : '—') + '</span>'
                : '<span style="color:var(--gtb-muted);">not scanned</span><span></span>')
            + '</div>';
    }).join('');
    return summary + rows;
}

// ── Top Picks strip — always ranks the FULL scanned universe (_PS_CACHE), independent
// of whatever filter/sort/search is currently applied to the table below, so it stays a
// stable "best of this scan" reference rather than shifting with the table's own view.
function _psTopPicksHtml() {
    var all = Object.values(_PS_CACHE);
    if (!all.length) return '';
    function _psPickRank(r) { var d = r.primary && r.primary.ok && r.primary.dir != null ? r.primary.dir : 0; return d * 100 + r.overlayTotal; }
    var buys = all.filter(function (r) { return r.verdict.indexOf('BUY') !== -1; })
        .sort(function (a, b) { return _psPickRank(b) - _psPickRank(a); }).slice(0, 5);
    var sells = all.filter(function (r) { return r.verdict.indexOf('SELL') !== -1; })
        .sort(function (a, b) { return _psPickRank(a) - _psPickRank(b); }).slice(0, 5);
    if (!buys.length && !sells.length) return '';

    function _chip(r) {
        var kiteLink = _psChartLink(r.name, _psPriceTokenFor(r.name));
        return '<a href="' + kiteLink + '" target="_blank" rel="noopener" class="ps-pick-chip" style="border-color:' + r.verdictColor + ';color:' + r.verdictColor + ';" title="' + r.verdict + ' — overlay ' + r.overlayTotal.toFixed(1) + '">'
            + r.name + ' <span class="ps-pick-score">' + (r.overlayTotal >= 0 ? '+' : '') + r.overlayTotal.toFixed(1) + '</span></a>';
    }

    var html = '<div class="ps-top-picks">';
    if (buys.length) html += '<div class="ps-top-picks-row"><span class="ps-top-picks-label" style="color:var(--gtb-green);">TOP BUY</span>' + buys.map(_chip).join('') + '</div>';
    if (sells.length) html += '<div class="ps-top-picks-row"><span class="ps-top-picks-label" style="color:var(--gtb-red);">TOP SELL</span>' + sells.map(_chip).join('') + '</div>';
    html += '</div>';
    return html;
}

// Total BUY/SELL/WATCH counts across the full scanned set (_PS_CACHE) — independent of
// whatever filter/sort/search is applied to the table below, same convention as the Top
// Picks strip, so it always reads "how many across the whole scan," not "how many shown."
function _psRenderSummary() {
    var all = Object.values(_PS_CACHE);
    if (!all.length) { jQ('#ps-summary').empty(); return; }
    // Match by substring, same convention the filter dropdown already uses -- an exact-string
    // match against just 'BUY'/'STRONG BUY' stopped counting "BUY (awaiting overlay
    // confirmation)"/"BUY -- overlay disagrees" as BUY here, silently diverging from what the
    // BUY filter itself considers a match.
    var buy = all.filter(function (r) { return r.verdict.indexOf('BUY') !== -1; }).length;
    var sell = all.filter(function (r) { return r.verdict.indexOf('SELL') !== -1; }).length;
    var watch = all.length - buy - sell;
    jQ('#ps-summary').html(
        '<span class="ps-summary-buy">' + buy + ' BUY</span>'
        + '<span class="ps-summary-sell">' + sell + ' SELL</span>'
        + '<span class="ps-summary-watch">' + watch + ' WATCH</span>'
        + '<span class="ps-summary-total">(' + all.length + ' scanned)</span>'
    );
}

// -- Market Breadth -- uses the scanner's own groot-research primary read (Trend Template /
// Stage) across the FULL scanned universe as a market-breadth gauge, the same idea as a
// classic "% of stocks above their 200-day average" indicator, just built from a stricter,
// mechanically-defined trend test instead of a single moving average. This is a SLOW, weeks-
// to-months signal (150-200 day SMAs) -- a market-regime lean, not a same-day call; the
// intraday composite score / Master Consensus elsewhere in this app answer that faster
// question. Always reads the FULL scanned universe (_PS_CACHE), independent of the table's
// current filter/sort/search, same convention _psRenderSummary/_psTopPicksHtml already use.
function _psRenderBreadth() {
    var all = Object.values(_PS_CACHE);
    var $b = jQ('#ps-breadth');
    if (!all.length) { $b.empty(); return; }

    var buckets = { confLong: 0, formLong: 0, basing: 0, topping: 0, formShort: 0, confShort: 0, noData: 0 };
    var dirSum = 0, dirCount = 0;
    all.forEach(function (r) {
        var dir = r.primary && r.primary.ok ? r.primary.dir : null;
        if (dir == null) { buckets.noData++; return; }
        dirSum += dir; dirCount++;
        if (dir === 1) buckets.confLong++;
        else if (dir === 0.5) buckets.formLong++;
        else if (dir === 0) buckets.basing++;
        else if (dir === -0.3) buckets.topping++;
        else if (dir === -0.5) buckets.formShort++;
        else if (dir === -1) buckets.confShort++;
    });
    var total = all.length;
    var bullPct = Math.round((buckets.confLong + buckets.formLong) / total * 100);
    var bearPct = Math.round((buckets.confShort + buckets.formShort) / total * 100);
    var netScore = dirCount ? Math.round(dirSum / dirCount * 100) : 0; // -100..+100
    var netLabel, netColor;
    if (netScore >= 25) { netLabel = 'BULLISH BREADTH'; netColor = 'var(--gtb-green)'; }
    else if (netScore >= 8) { netLabel = 'MILD BULLISH BREADTH'; netColor = 'var(--gtb-green)'; }
    else if (netScore <= -25) { netLabel = 'BEARISH BREADTH'; netColor = 'var(--gtb-red)'; }
    else if (netScore <= -8) { netLabel = 'MILD BEARISH BREADTH'; netColor = 'var(--gtb-red)'; }
    else { netLabel = 'MIXED / NEUTRAL BREADTH'; netColor = 'var(--gtb-amber)'; }

    // Divergence check -- only meaningful if NIFTY 50 / NIFTY BANK were included in this scan
    // (they're in _PS_EXTRA_INSTRUMENTS, picked up via the INDEX+MCX filter chip, not ALL).
    var idxNotes = [], idxFound = false;
    ['NIFTY 50', 'NIFTY BANK'].forEach(function (name) {
        var r = _PS_CACHE[name];
        if (!r || !r.primary || !r.primary.ok || r.primary.dir == null) return;
        idxFound = true;
        var idxDir = r.primary.dir;
        var breadthSign = netScore > 8 ? 1 : netScore < -8 ? -1 : 0;
        var idxSign = idxDir > 0 ? 1 : idxDir < 0 ? -1 : 0;
        if (idxSign !== 0 && breadthSign !== 0 && idxSign !== breadthSign) {
            idxNotes.push('<span style="color:var(--gtb-amber);">&#9888; ' + name + ' itself reads ' + r.primary.label.split(' (')[0] + ' while the broader breadth of scanned stocks leans the OPPOSITE way -- a divergence worth noting, not a same-day signal to act on.</span>');
        } else if (idxSign !== 0 && idxSign === breadthSign) {
            idxNotes.push('<span style="color:var(--gtb-muted);">' + name + ' (' + r.primary.label.split(' (')[0] + ') agrees with the broader breadth.</span>');
        } else {
            idxNotes.push('<span style="color:var(--gtb-muted);">' + name + ' (' + r.primary.label.split(' (')[0] + ') -- overall breadth is too mixed/neutral to call agreement or divergence either way.</span>');
        }
    });

    var html = '<div class="ps-breadth-card">'
        + '<div class="ps-breadth-head"><span class="ps-breadth-title"><i class="bi bi-bar-chart-steps"></i> MARKET BREADTH (this scan\'s universe, ' + total + ' names)</span>'
        + '<span class="ps-breadth-verdict" style="color:' + netColor + ';border-color:' + netColor + ';">' + netLabel + ' (' + (netScore >= 0 ? '+' : '') + netScore + ')</span></div>'
        + '<div class="ps-breadth-bar"><div class="ps-breadth-bar-bull" style="width:' + bullPct + '%;"></div><div class="ps-breadth-bar-bear" style="width:' + bearPct + '%;"></div></div>'
        + '<div class="ps-breadth-counts">'
        +   '<span class="ps-bc-bull">' + buckets.confLong + ' confirmed long</span>'
        +   '<span class="ps-bc-bull-mild">' + buckets.formLong + ' forming long</span>'
        +   '<span class="ps-bc-neutral">' + buckets.basing + ' basing</span>'
        +   '<span class="ps-bc-neutral">' + buckets.topping + ' topping</span>'
        +   '<span class="ps-bc-bear-mild">' + buckets.formShort + ' forming short</span>'
        +   '<span class="ps-bc-bear">' + buckets.confShort + ' confirmed short</span>'
        +   (buckets.noData ? '<span class="ps-bc-nodata">' + buckets.noData + ' insufficient history</span>' : '')
        + '</div>'
        + (idxFound ? '<div class="ps-breadth-idx">' + idxNotes.join(' ') + '</div>' : '<div class="ps-breadth-idx" style="color:var(--gtb-muted);">Add NIFTY 50 / NIFTY BANK (INDEX + MCX filter) to this scan to compare the index\'s own Stage against this breadth read.</div>')
        + '<div class="ps-breadth-note">Net score = average primary direction across all scanned names (+100 = every name confirmed long, -100 = every name confirmed short). This is a SLOW, multi-week regime read (150-200 day SMAs) -- not a same-day trade signal, and not back-tested against forward index returns.</div>'
        + '</div>';
    $b.html(html);
}

// ── Render ────────────────────────────────────────────────────────────────────
function _psRenderTable() {
    _psRenderSummary();
    _psRenderBreadth();
    var rows = Object.values(_PS_CACHE);
    var filter = jQ('#ps-filter').val() || 'all';
    var sort = jQ('#ps-sort').val() || 'score';
    var q = (jQ('#ps-search').val() || '').trim().toUpperCase();
    var minConv = parseFloat(jQ('#ps-min-conv').val());

    // Verdict strings now carry qualifiers ("BUY (awaiting overlay confirmation)", "SELL —
    // overlay disagrees (caution)", etc.) instead of the old fixed 4 values — match by
    // substring so the filter buttons still group them sensibly.
    if (filter === 'strongbuy') rows = rows.filter(function (r) { return r.verdict.indexOf('STRONG BUY') !== -1; });
    else if (filter === 'buy') rows = rows.filter(function (r) { return r.verdict.indexOf('BUY') !== -1; });
    else if (filter === 'strongsell') rows = rows.filter(function (r) { return r.verdict.indexOf('STRONG SELL') !== -1; });
    else if (filter === 'sell') rows = rows.filter(function (r) { return r.verdict.indexOf('SELL') !== -1; });
    else if (filter === 'longforming') rows = rows.filter(function (r) { return r.verdict.indexOf('LONG forming') !== -1; });
    else if (filter === 'shortforming') rows = rows.filter(function (r) { return r.verdict.indexOf('SHORT forming') !== -1; });
    else if (filter === 'basing') rows = rows.filter(function (r) { return r.verdict.indexOf('basing') !== -1; });
    else if (filter === 'topping') rows = rows.filter(function (r) { return r.verdict.indexOf('topping') !== -1; });
    else if (filter === 'watch') rows = rows.filter(function (r) { return r.verdict.indexOf('BUY') === -1 && r.verdict.indexOf('SELL') === -1; });
    if (q) rows = rows.filter(function (r) { return r.name.indexOf(q) !== -1; });
    if (jQ('#ps-tradeable-btn').hasClass('ps-on')) rows = rows.filter(_psIsTradeable);
    // Conviction% floor -- rows with NO conviction score (basing/topping/insufficient history,
    // convictionPct === null) have nothing to compare against a numeric threshold, so they're
    // excluded whenever a floor > 0 is actually set, same as how the 'watch' verdict filter
    // already treats "no real signal" rows as not matching a directional ask.
    if (isFinite(minConv) && minConv > 0) rows = rows.filter(function (r) { return r.convictionPct != null && r.convictionPct >= minConv; });

    // 'score' sort ranks by groot-research's primary direction FIRST (confirmed Stage 2 > Stage
    // 2 forming > basing > topping > Stage 4 forming > confirmed Stage 4), overlay total as the
    // tiebreaker within each — never lets a purely same-day overlay number outrank a genuine
    // Trend-Template-confirmed setup, matching the "groot-research is primary" rule.
    function _psRank(r) { var d = r.primary && r.primary.ok && r.primary.dir != null ? r.primary.dir : 0; return d * 100 + r.overlayTotal; }
    if (sort === 'name') rows.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    else if (sort === 'rs') rows.sort(function (a, b) { return b.relStrength - a.relStrength; });
    else if (sort === 'conv') rows.sort(function (a, b) { return (b.convictionPct == null ? -1 : b.convictionPct) - (a.convictionPct == null ? -1 : a.convictionPct); });
    else rows.sort(function (a, b) { return _psRank(b) - _psRank(a); });

    // Stashed for the "Send to Telegram" button — the exact rows currently on screen (after
    // filter/search/sort), not the full unfiltered scan, so what gets sent matches what's
    // actually visible when the button is clicked.
    _PS_LAST_FILTERED_ROWS = rows;

    if (!rows.length) {
        jQ('#ps-table-wrap').html('<div class="sv-empty-state"><i class="bi bi-search"></i><span>No results' + (q ? ' for "' + q + '"' : '') + '.</span></div>');
        return;
    }

    var _iiSafe = typeof _ii === 'function' ? _ii : function () { return ''; };
    var html = _psTopPicksHtml() + '<table class="ps-table">'
        + '<thead><tr>'
        + '<th><input type="checkbox" id="ps-select-all-basket" title="Select all eligible rows currently shown"></th>'
        + '<th>Symbol</th><th>Verdict</th><th>Conviction%' + _iiSafe('ps-conviction') + '</th><th>LTP</th>'
        + '<th>Trend Template / Stage' + _iiSafe('ps-primary') + '</th><th>Momentum' + _iiSafe('ps-primary') + '</th>'
        + '<th>20d Chg%</th><th>Trend</th><th>Breakout</th>'
        + '<th>Rel. Strength</th><th>Futures OI (5d)' + _iiSafe('ps-signals') + '</th><th>Curve' + _iiSafe('ps-curve') + '</th><th>Overlay</th>'
        + '<th>Entry</th><th>Target</th><th>Stop</th><th>R:R' + _iiSafe('ps-tradeplan') + '</th><th></th><th></th><th></th>'
        + '</tr></thead><tbody>'
        + rows.map(function (r) {
            var kiteLink = _psChartLink(r.name, _psPriceTokenFor(r.name));
            var chgColor = r.pctChg20 >= 0 ? 'var(--gtb-green)' : 'var(--gtb-red)';
            var trendColor = r.trendScore > 0 ? 'var(--gtb-green)' : r.trendScore < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
            var breakoutColor = r.breakoutScore > 0 ? 'var(--gtb-green)' : r.breakoutScore < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
            var rsColor = r.relStrength > 0 ? 'var(--gtb-green)' : r.relStrength < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
            var oiColor = r.oiScore > 0 ? 'var(--gtb-green)' : r.oiScore < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
            var curveColor = r.curveScore > 0 ? 'var(--gtb-green)' : r.curveScore < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
            var rowTint = r.verdict.indexOf('BUY') !== -1 ? 'rgba(63,185,80,0.06)' : r.verdict.indexOf('SELL') !== -1 ? 'rgba(248,81,73,0.06)' : 'transparent';
            var hasPlan = r.entry != null;
            var p = r.primary;
            var primDir = p && p.ok ? p.dir : null;
            var primColor = primDir == null ? 'var(--gtb-muted)' : primDir >= 1 ? 'var(--gtb-green)' : primDir <= -1 ? 'var(--gtb-red)' : primDir > 0 ? 'var(--gtb-green)' : primDir < 0 ? 'var(--gtb-red)' : 'var(--gtb-amber)';
            var primText = p && p.ok ? p.label : 'INSUFFICIENT HISTORY';
            var primTip = '';
            if (p && p.ok) {
                if (p.tt && p.tt.ok) primTip += 'Trend Template (long): ' + p.tt.rulesPassed + '/' + p.tt.rulesTotal + ' rules' + (p.tt.rsPct != null ? ', RS vs NIFTY 6mo ' + (p.tt.rsPct >= 0 ? '+' : '') + p.tt.rsPct.toFixed(1) + '%' : '') + '. ';
                if (p.st && p.st.ok) primTip += 'Short Template: ' + p.st.rulesPassed + '/' + p.st.rulesTotal + ' rules. ';
                if (p.stage && p.stage.ok) primTip += p.stage.label + ', 30wk-MA slope ' + (p.stage.slopePct >= 0 ? '+' : '') + p.stage.slopePct.toFixed(1) + '%. ';
            }
            var momColor = p && p.mom && p.mom.ok ? (p.mom.score > 0 ? 'var(--gtb-green)' : p.mom.score < 0 ? 'var(--gtb-red)' : 'var(--gtb-muted)') : 'var(--gtb-muted)';
            var momText = p && p.mom && p.mom.ok ? p.mom.score.toFixed(0) + (p.mom.gapFlagged ? ' ⚠gap' : '') : '—';
            var momTip = p && p.mom && p.mom.ok ? 'Clenow momentum score = annualized return (' + p.mom.annualizedPct.toFixed(0) + '%) × R² (' + p.mom.r2.toFixed(2) + '). ' + (p.mom.gapFlagged ? 'A >15% single-day move sits in the 90-day window — may distort this reading.' : '') : (p && p.mom ? p.mom.reason : '');
            var extTip = r.extensionNote ? r.extensionNote.replace(/"/g, '&quot;') : '';
            var conv = r.convictionPct;
            var convColor = conv == null ? 'var(--gtb-muted)' : conv >= 60 ? 'var(--gtb-green)' : conv >= 40 ? 'var(--gtb-amber)' : 'var(--gtb-red)';
            var convText = conv == null ? '—' : conv + '%';
            var convTip = conv == null ? 'No direction to have a conviction score about (insufficient history, basing, or topping).'
                : 'Rule-based confidence, NOT a back-tested probability -- built from rules passed, confirmed-vs-forming, overlay agreement, momentum quality and extension. Higher = more of this scanner\'s own checks agree with each other, not a statistical win-rate.';
            // Basket-eligible = a real NSE cash-equity tradingsymbol with an actual trade plan —
            // excludes indices/MCX (_PS_EXTRA_INSTRUMENTS, not tradable as a cash-equity basket
            // item) and rows with no directional plan (basing/topping/insufficient history).
            var basketEligible = hasPlan && _PS_EXTRA_INSTRUMENTS.indexOf(r.name) === -1;
            var checkboxCell = basketEligible
                ? '<td><input type="checkbox" class="ps-basket-chk" data-name="' + r.name + '"' + (_PS_BASKET_SELECTED[r.name] ? ' checked' : '') + '></td>'
                : '<td></td>';
            return '<tr style="background:' + rowTint + ';">'
                + checkboxCell
                + '<td class="ps-cell-strong">' + r.name + '</td>'
                + '<td><span class="ps-verdict" style="color:' + r.verdictColor + ';border-color:' + r.verdictColor + ';font-size:0.5rem;">' + r.verdict + '</span></td>'
                + '<td class="ps-cell-strong" style="color:' + convColor + ';" title="' + convTip.replace(/"/g, '&quot;') + '">' + convText + '</td>'
                + '<td>' + r.ltp.toFixed(1) + '</td>'
                + '<td style="color:' + primColor + ';font-size:0.55rem;" title="' + primTip.replace(/"/g, '&quot;') + '">' + primText + '</td>'
                + '<td style="color:' + momColor + ';" title="' + momTip.replace(/"/g, '&quot;') + '">' + momText + '</td>'
                + '<td style="color:' + chgColor + ';">' + (r.pctChg20 >= 0 ? '+' : '') + r.pctChg20.toFixed(1) + '%</td>'
                + '<td style="color:' + trendColor + ';">' + r.trendLabel + '</td>'
                + '<td style="color:' + breakoutColor + ';">' + r.breakoutLabel + '</td>'
                + '<td style="color:' + rsColor + ';">' + (r.relStrength >= 0 ? '+' : '') + r.relStrength.toFixed(1) + '%</td>'
                + '<td style="color:' + oiColor + ';">' + r.oiLabel + '</td>'
                + '<td style="color:' + curveColor + ';font-size:0.55rem;">' + (r.curveLabel || 'NO DATA') + '</td>'
                + '<td class="ps-cell-strong" style="color:' + r.overlayColor + ';" title="Same-day overlay total (trend/breakout/RS/OI/curve) — confirmation only, not the primary call.">' + r.overlayTotal.toFixed(1) + '</td>'
                + '<td>' + (hasPlan ? r.entry.toFixed(1) : '—') + '</td>'
                + '<td style="color:var(--gtb-green);">' + (hasPlan ? r.target.toFixed(1) : '—') + '</td>'
                + '<td style="color:var(--gtb-red);">' + (hasPlan ? r.stop.toFixed(1) : '—') + '</td>'
                + '<td>' + (r.riskReward != null ? '1:' + r.riskReward.toFixed(1) : '—') + '</td>'
                + '<td><i class="bi bi-info-circle ps-exit-icon" title="' + (r.exitCriteria + (extTip ? ' (' + extTip + ')' : '') + ' [' + (r.levelsSource || '') + ']').replace(/"/g, '&quot;') + '"></i></td>'
                + '<td><a href="' + kiteLink + '" target="_blank" rel="noopener" class="oss-chart-link" title="Open chart"><i class="bi bi-graph-up"></i></a></td>'
                + '<td><button class="oss-chart-link ps-explain-btn" data-name="' + r.name + '" style="background:none;border:none;cursor:pointer;padding:0;" title="Full trade recommendation with explanation"><i class="bi bi-file-text-fill" style="color:var(--gtb-accent,#58a6ff);"></i></button></td>'
                + '</tr>';
        }).join('')
        + '</tbody></table>';
    jQ('#ps-table-wrap').html(html);
}
jQ(document).on('change', '#ps-filter, #ps-sort', _psRenderTable);
jQ(document).on('input', '#ps-min-conv', _psRenderTable);

// "Tradeable" shortlist, excluding any verdict flagged "caution" (overlay disagreeing with the
// primary read). Heuristic, not backtested:
//   - STRONG BUY/SELL (both layers agree) and LONG/SHORT forming (early setup): Conviction >= 60
//   - BUY/SELL (awaiting overlay confirmation) -- trend is mechanically confirmed but today's
//     overlay is neutral: Conviction >= 65 (a higher bar since nothing today backs it yet)
var _PS_TRADEABLE_MIN_CONV = 60;
var _PS_TRADEABLE_AWAITING_MIN_CONV = 65;
function _psIsTradeable(r) {
    if (r.convictionPct == null) return false;
    var v = r.verdict;
    if (v.indexOf('caution') !== -1) return false;
    if (v.indexOf('awaiting overlay') !== -1) return r.convictionPct >= _PS_TRADEABLE_AWAITING_MIN_CONV;
    if (r.convictionPct < _PS_TRADEABLE_MIN_CONV) return false;
    return v.indexOf('STRONG BUY') !== -1 || v.indexOf('STRONG SELL') !== -1
        || v.indexOf('LONG forming') !== -1 || v.indexOf('SHORT forming') !== -1;
}
jQ(document).on('click', '#ps-tradeable-btn', function () {
    var on = !jQ(this).hasClass('ps-on');
    jQ(this).toggleClass('ps-on', on).css({ 'border-color': on ? 'var(--gtb-accent)' : '', color: on ? 'var(--gtb-accent)' : '', 'font-weight': on ? '800' : '' });
    _psRenderTable();
});

// ─── Pre-Market Brief ───────────────────────────────────────────────────────
// Live-fetches everything on one button click — no reliance on whatever happens to
// already be cached, and no deferral to the 9:15 combo. Two inputs feed one combined
// trend verdict:
//   1. Global cues — GIFT NIFTY, CRUDEOILM, USDINR: each freshly fetched via
//      _psFetchDaily's 'day'-interval candles, whose LAST candle (today) always reflects
//      the true live state (same property documented for scanLtpPrice elsewhere in this
//      app) — so candles[len-1].close = live price, candles[len-2].close = prior close,
//      with no dependency on any other tab/popup having been opened first.
//   2. OI Carryover Shortlist — reuses _psComputeSetup (positionalScreener.js's own pure
//      scoring function, same one the main Positional Screener uses) to find NIFTY 50/BANK
//      NIFTY top-10 weighted constituents carrying a LONG BUILDUP or SHORT BUILDUP futures
//      OI read vs ~5 trading days ago.
// Combined trend: GIFT NIFTY's % change (weight 2, the primary global cue) plus the net
// buildup count (long stocks minus short stocks, weight 0.5 each) — simple, transparent,
// shown with its own components broken out rather than a hidden black-box number.
function _gtbShowPreMarketBrief() {
    var _cls = 'popup-custom-style-premarket-brief';
    var html = '<div id="pmb-wrap" style="height:100%;overflow:auto;padding:10px;background:var(--gtb-bg);color:var(--gtb-text);font-size:0.65rem;">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
        + '<span style="font-size:0.5rem;color:var(--gtb-muted);">Fetches GIFT NIFTY/Crude/USDINR live + scans NIFTY 50/BANK NIFTY top-10 for OI carryover.</span>'
        + '<button id="pmb-scan-btn" style="margin-left:auto;padding:4px 14px;font-size:0.65rem;background:var(--gtb-accent,#58a6ff);color:#fff;border:none;border-radius:3px;cursor:pointer;font-weight:700;"><i class="bi bi-lightning-fill"></i> Fetch Live</button>'
        + '</div>'
        + '<div id="pmb-progress" style="font-size:0.55rem;color:var(--gtb-muted);min-height:16px;margin-bottom:6px;"></div>'
        + '<div id="pmb-trend"></div>'
        + '<div id="pmb-cues"><div style="padding:16px;text-align:center;color:var(--gtb-muted);">Click <b>Fetch Live</b> to load today\'s pre-market read.</div></div>'
        + '<div style="display:flex;align-items:center;gap:8px;margin:12px 0 6px;">'
        + '<span style="font-size:0.6rem;font-weight:800;color:var(--gtb-muted);letter-spacing:0.05em;"><i class="bi bi-arrow-repeat"></i> OI CARRYOVER SHORTLIST</span>'
        + '</div>'
        + '<div id="pmb-results"></div>'
        + '</div>';

    showPopUpWindow('premarket-brief', html, 'Pre-Market Brief', 640, 620);
    var _title = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<i class="bi bi-sunrise-fill" style="font-size:0.75rem;"></i>'
        + '<span style="font-weight:800;font-size:0.7rem;">PRE-MARKET BRIEF</span>'
        + popupWinControls(_cls) + '</div>';
    jQ('.' + _cls).find('.popupwindow_titlebar_text').html(_title);
    hideNativePopupButtons(_cls);
    jQ('.' + _cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + _cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
}

// Live change% for any NSE/MCX instrument via a fresh 'day'-interval fetch — candles[len-1]
// is today (always live for a 'day' candle), candles[len-2] is the prior close.
async function _pmbLiveChange(token) {
    if (!token) return null;
    var candles = await _psFetchDaily(token, 6);
    if (!candles || candles.length < 2) return null;
    // Kite only returns a 'day' candle for today once that exchange's session has actually
    // started — before that, candles[last] is silently still YESTERDAY's candle, which
    // would otherwise get misread as "today's live move" (a real gap found while explaining
    // this to the user: checking before MCX/CDS session start, or before GIFT NIFTY's own
    // session opens, would compare yesterday-vs-day-before and call it today with no
    // indication anything was off). Verify the last candle's own date before trusting it.
    var todayStr = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? CURRENT_DAY : moment().format('YYYY-MM-DD');
    var lastDateStr = moment(candles[candles.length - 1][0]).format('YYYY-MM-DD');
    if (lastDateStr !== todayStr) {
        return { notOpen: true, lastDate: lastDateStr, lastClose: parseFloat(candles[candles.length - 1][4]) };
    }
    var todayClose = parseFloat(candles[candles.length - 1][4]);
    var prevClose = parseFloat(candles[candles.length - 2][4]);
    if (!prevClose) return null;
    return { chg: (todayClose - prevClose) / prevClose * 100, ltp: todayClose };
}

jQ(document).on('click', '#pmb-scan-btn', async function () {
    var $btn = jQ(this).prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Fetching…');

    // ── 1. Global cues — live ────────────────────────────────────────────────
    jQ('#pmb-progress').text('Fetching GIFT NIFTY / Crude / USDINR…');
    var giftTok = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS['GIFT NIFTY'] : null;
    var crudeEntry = _psFutEntryFor('CRUDEOILM');
    var usdinrEntry = _psFutEntryFor('USDINR');
    var gift = null, crude = null, usdinr = null;
    try { gift = await _pmbLiveChange(giftTok); } catch (e) {}
    try { crude = await _pmbLiveChange(crudeEntry && crudeEntry.instrument_token); } catch (e) {}
    try { usdinr = await _pmbLiveChange(usdinrEntry && usdinrEntry.instrument_token); } catch (e) {}

    function _cueRow(label, r, note) {
        if (!r) return '<div style="display:flex;justify-content:space-between;padding:5px 8px;border-bottom:1px solid var(--gtb-border);"><span style="color:var(--gtb-muted);">' + label + '</span><span style="color:var(--gtb-muted);">No data</span></div>';
        if (r.notOpen) {
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-bottom:1px solid var(--gtb-border);">'
                + '<span>' + label + '</span>'
                + '<span style="font-size:0.46rem;color:var(--gtb-amber);" title="Last available candle is dated ' + r.lastDate + ', not today — this market/session hasn\'t started yet"><i class="bi bi-clock-history"></i> Not open yet (last: ' + r.lastClose.toFixed(2) + ' on ' + r.lastDate + ')</span>'
                + '</div>';
        }
        var col = r.chg > 0.05 ? 'var(--gtb-green)' : r.chg < -0.05 ? 'var(--gtb-red)' : 'var(--gtb-muted)';
        var arrow = r.chg > 0.05 ? '▲' : r.chg < -0.05 ? '▼' : '—';
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-bottom:1px solid var(--gtb-border);">'
            + '<span>' + label + (note ? ' <span style="font-size:0.46rem;color:var(--gtb-muted);">' + note + '</span>' : '') + '</span>'
            + '<span style="font-weight:800;font-family:var(--gtb-mono);color:' + col + ';">' + arrow + ' ' + (r.chg >= 0 ? '+' : '') + r.chg.toFixed(2) + '% <span style="color:var(--gtb-muted);font-weight:400;">(' + r.ltp.toFixed(2) + ')</span></span>'
            + '</div>';
    }
    jQ('#pmb-cues').html('<div style="background:var(--gtb-surface);border:1px solid var(--gtb-border);">'
        + _cueRow('GIFT NIFTY', gift, '— global cue for NIFTY\'s likely gap')
        + _cueRow('CRUDEOILM', crude)
        + _cueRow('USDINR', usdinr)
        + '</div>');

    // ── 2. OI carryover shortlist — live ─────────────────────────────────────
    var names = Object.keys(Object.assign({}, (typeof NIFTY_50_WEIGHTED_STOCKS !== 'undefined' ? NIFTY_50_WEIGHTED_STOCKS : {}),
                                              (typeof NIFTY_BANK_WEIGHTED_STOCKS !== 'undefined' ? NIFTY_BANK_WEIGHTED_STOCKS : {})));
    var results = [];
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        jQ('#pmb-progress').text('Scanning ' + name + ' (' + (i + 1) + '/' + names.length + ')…');
        try {
            var priceTok = _psPriceTokenFor(name);
            var futEntry = _psFutEntryFor(name);
            if (!priceTok || !futEntry) continue;
            var daysToExp = _psDaysToExpiry(futEntry.expiry);
            var candlesP = await _psFetchDaily(priceTok, 40);
            var futCandlesP = await _psFetchDaily(futEntry.instrument_token, 40);
            var setup = _psComputeSetup(candlesP, futCandlesP, 0, futEntry.instrument_token, daysToExp);
            if (setup && (setup.oiLabel === 'LONG BUILDUP' || setup.oiLabel === 'SHORT BUILDUP')) {
                results.push({ name: name, oiLabel: setup.oiLabel, oiScore: setup.oiScore, ltp: setup.ltp });
            }
        } catch (e) {}
    }
    jQ('#pmb-progress').text('Done — ' + results.length + ' of ' + names.length + ' showing fresh OI buildup.');
    $btn.prop('disabled', false).html('<i class="bi bi-lightning-fill"></i> Fetch Live');

    var longs = results.filter(function (r) { return r.oiLabel === 'LONG BUILDUP'; });
    var shorts = results.filter(function (r) { return r.oiLabel === 'SHORT BUILDUP'; });

    function _list(rows, color) {
        if (!rows.length) return '<div style="font-size:0.5rem;color:var(--gtb-muted);padding:4px 0;">None</div>';
        return rows.map(function (r) {
            var link = _psChartLink(r.name, _psPriceTokenFor(r.name));
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 6px;border-bottom:1px solid var(--gtb-border);">'
                + '<a href="' + link + '" target="_blank" rel="noopener" style="color:' + color + ';font-weight:700;">' + r.name + '</a>'
                + '<span style="font-family:var(--gtb-mono);color:var(--gtb-muted);">' + r.ltp.toFixed(1) + '</span>'
                + '</div>';
        }).join('');
    }
    jQ('#pmb-results').html(
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
        + '<div><div style="font-size:0.52rem;font-weight:800;color:var(--gtb-green);margin-bottom:4px;">▲ LONG BUILDUP (' + longs.length + ')</div>' + _list(longs, 'var(--gtb-green)') + '</div>'
        + '<div><div style="font-size:0.52rem;font-weight:800;color:var(--gtb-red);margin-bottom:4px;">▼ SHORT BUILDUP (' + shorts.length + ')</div>' + _list(shorts, 'var(--gtb-red)') + '</div>'
        + '</div>'
    );

    // ── 3. Combined trend verdict ─────────────────────────────────────────────
    // netScore = GIFT NIFTY change% × 2 (primary global cue) + (long count − short count) × 0.5
    // Purely a weighted sum of the two components above — shown broken out, not hidden.
    // GIFT NIFTY not open yet -> no live cue to weigh in; net score falls back to the
    // buildup count alone rather than silently treating "no data" as "flat/0%".
    var giftOpen = gift && !gift.notOpen;
    var giftChg = giftOpen ? gift.chg : 0;
    var netScore = giftChg * 2 + (longs.length - shorts.length) * 0.5;
    var trendLabel, trendCol;
    if (netScore >= 1.5) { trendLabel = 'BULLISH'; trendCol = 'var(--gtb-green)'; }
    else if (netScore <= -1.5) { trendLabel = 'BEARISH'; trendCol = 'var(--gtb-red)'; }
    else { trendLabel = 'MIXED / NEUTRAL'; trendCol = 'var(--gtb-amber)'; }

    // Deliberately NOT gated on "is NSE cash open right now" — GIFT NIFTY trades an extended
    // ~21-hour session specifically so it can serve as a forward cue for the NEXT session at
    // any time of day, and once today's OI buildup candle finalizes at close, that's the
    // COMPLETE carryover picture into tomorrow, not stale data. So this is always framed as
    // "cue for the next session," whether that's in 5 minutes or in 16 hours — GIFT NIFTY's
    // own change vs ITS OWN previous close (via _pmbLiveChange) is what makes that valid
    // continuously, not a fixed market-hours cutoff.
    jQ('#pmb-trend').html(
        '<div style="background:var(--gtb-surface);border-left:4px solid ' + trendCol + ';padding:10px 12px;margin-bottom:10px;">'
        + '<div style="font-size:0.5rem;color:var(--gtb-muted);margin-bottom:2px;">TREND FOR THE NEXT TRADING SESSION</div>'
        + '<div style="font-size:1rem;font-weight:900;color:' + trendCol + ';margin-bottom:4px;">' + trendLabel + '</div>'
        + '<div style="font-size:0.48rem;color:var(--gtb-muted);">GIFT NIFTY ' + (giftOpen ? ((giftChg >= 0 ? '+' : '') + giftChg.toFixed(2) + '% ×2') : '<span style="color:var(--gtb-amber);">not open yet — excluded</span>') + ' &nbsp;+&nbsp; Buildup net ' + (longs.length - shorts.length >= 0 ? '+' : '') + (longs.length - shorts.length) + ' (' + longs.length + ' long − ' + shorts.length + ' short) ×0.5 &nbsp;=&nbsp; <b style="color:' + trendCol + ';">' + (netScore >= 0 ? '+' : '') + netScore.toFixed(2) + '</b></div>'
        + '<div style="font-size:0.44rem;color:var(--gtb-muted);margin-top:4px;">GIFT NIFTY\'s change is always vs its OWN previous close, so this stays a forward cue for the next session at any time of day — not a validated signal, just a live-computed lean.</div>'
        + '</div>'
    );
});
jQ(document).on('input', '#ps-search', _psRenderTable);

// ── Level Fade Scanner ───────────────────────────────────────────────────────
// Two-part workflow the user runs by hand at two points in the day:
//   1. EOD SCAN (run after market close) — for every instrument with cached OI/OBV data
//      (INSTRUMENT_SCORE_MAP[name].oiData from today's last refresh), checks whether today's
//      CLOSE sits right on a ranked OI wall (_gtbFindWalls, OBV-ranked, not just nearest
//      strike) and that wall is still intact (_gtbWallErosion says the writers behind it
//      haven't started unwinding). Close near an intact support -> tradable LONG for the next
//      session; close near an intact resistance -> tradable SHORT. Saved to localStorage keyed
//      by date so it survives into tomorrow.
//   2. PRE-MARKET CHECK (run next session, once today's open print exists) — reloads
//      yesterday's saved shortlist and compares TODAY's open against the SAME wall level:
//      still holding near it -> CONFIRMED; gapped through it -> INVALIDATED; gapped away from
//      it -> flagged stale rather than silently carried over.
// Deliberately reuses the existing wall-ranking/erosion primitives (already built for the
// dashboard's chart annotations) instead of re-deriving support/resistance from scratch —
// same reasoning as every other scanner in this app: one source of truth for "what is a wall."
var _LVS_PROX_PCT = 0.4; // % distance from a wall to count as "price is AT this level"

// Pure, cache-only: does `name`'s current spot sit on an intact OI wall? Returns null if no
// cached OI data, no wall within range, or the nearby wall is actively eroding (writers
// covering — don't fade a wall that's already failing).
function _lvsWallCheck(name) {
    var sm = (typeof INSTRUMENT_SCORE_MAP !== 'undefined') ? INSTRUMENT_SCORE_MAP[name] : null;
    if (!sm || !sm.oiData || !sm.oiData.tableData || !sm.oiData.tableData.length) return null;
    var td = sm.oiData.tableData;

    // spot MUST be the real live/last-traded price, not the ATM-strike row's own strike —
    // the two can disagree by a wide margin whenever the option chain's ATM was picked off a
    // stale INSTRUMENT_LTP_PRICE (e.g. from earlier in the session, before the EOD scan's own
    // fresh scanLtpPrice() call), and even with a fresh LTP the strike itself is only the
    // nearest listed strike (₹10+ gaps on names like HDFCBANK) — using it as "spot" silently
    // rounds every distance-to-wall calc and mislabels the row's displayed "Close" price.
    var priceChange = 0, spot = 0;
    try { var t = generateTrend(name); spot = parseFloat(t.ltp) || 0; priceChange = t.change || 0; } catch (e) {}
    if (!spot) {
        // Fallback only if live LTP truly isn't available for this name.
        td.forEach(function (item) { if (item['ATM_STRIKE']) spot = parseFloat(item['STRIKE']) || 0; });
    }
    if (!spot) return null;

    var walls, erosion;
    try {
        walls = _gtbFindWalls(td, priceChange, spot);
        erosion = _gtbWallErosion(td, walls);
    } catch (e) { return null; }

    function _nearest(list) {
        var best = null;
        (list || []).forEach(function (w) {
            var dist = Math.abs(spot - w.strike) / spot * 100;
            if (dist <= _LVS_PROX_PCT && (!best || dist < best.dist)) best = { strike: w.strike, dist: dist, tier: w.tier };
        });
        return best;
    }
    var nearRes = _nearest(walls.resistance);
    var nearSup = _nearest(walls.support);
    if (!nearRes && !nearSup) return null;

    var side, pick;
    if (nearSup && (!nearRes || nearSup.dist <= nearRes.dist)) { side = 'S'; pick = nearSup; }
    else { side = 'R'; pick = nearRes; }

    var eroding = (erosion.eroding || []).some(function (e) { return e.side === side && e.strike === pick.strike; });
    if (eroding) {
        return { name: name, spot: spot, side: side === 'S' ? 'support' : 'resistance', wallStrike: pick.strike,
            distPct: pick.dist, tier: pick.tier, bias: null, eroding: true,
            reason: (side === 'S' ? 'Support' : 'Resistance') + ' ' + pick.strike + ' is eroding — writers unwinding, no trade' };
    }
    var bias = side === 'S' ? 'LONG' : 'SHORT';
    return { name: name, spot: spot, side: side === 'S' ? 'support' : 'resistance', wallStrike: pick.strike,
        distPct: pick.dist, tier: pick.tier, bias: bias, eroding: false,
        reason: 'Closed near ' + (side === 'S' ? 'support' : 'resistance') + ' ' + pick.strike
            + ' (' + pick.dist.toFixed(2) + '% away), wall intact' };
}

// Full universe for the EOD scan: every F&O stock (FO_LIST, populated by dataLoad.js from
// Kite's real instrument list — the ~200+ names the user actually wants covered, not just
// whatever happens to already be sitting in cache) plus the core indices/stocks that don't
// live in FO_LIST under the same name. _gtbAllOIInstruments() (cache-only) was the wrong tool
// here — it only reports what SOME popup happened to fetch earlier in the session, silently
// skipping any of the 200+ stocks nobody clicked into today.
function _lvsFullUniverse() {
    var list = [];
    try { list = (typeof FO_LIST !== 'undefined' && FO_LIST.length) ? FO_LIST.slice() : []; } catch (e) {}
    ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'RELIANCE', 'HDFCBANK', 'ICICIBANK'].forEach(function (n) {
        if (list.indexOf(n) === -1) list.push(n);
    });
    return list;
}

// Actively fetches OI/OBV for every name in `names` (ATM ±2 strikes — same trade-off already
// used by fetchWeightedStocksOIScore: enough signal without a full-width fetch per stock),
// writing straight into INSTRUMENT_SCORE_MAP[name].oiData/oi_obv/pcr/chPcr so _lvsWallCheck can
// read it immediately after. Needs INSTRUMENT_LIST_GLOBAL/INSTRUMENT_LTP_PRICE already populated
// for these names (i.e. run this AFTER the normal end-of-day "Load Prices" + refresh has
// completed for the full ~215-217 instrument universe) — showTrendingOI's generateTrend() call
// depends on that, same precondition every other OI fetch in this app has.
// CONC=4 matches fetchWeightedStocksOIScore's own concurrency choice (balances speed vs Kite
// rate limits) — with 200+ names this still takes a few minutes, which is fine run once after
// close, not time-critical the way an intraday refresh is.
async function _lvsActiveFetchOI(names, onProgress) {
    var CONC = 4;
    var done = 0;
    async function _scanOne(name) {
        try {
            var oiData = await showTrendingOI(name, 2);
            done++;
            if (onProgress) onProgress(name, done, names.length);
            if (!oiData || !oiData.tableData) return;
            if (!INSTRUMENT_SCORE_MAP[name]) INSTRUMENT_SCORE_MAP[name] = {};
            INSTRUMENT_SCORE_MAP[name].oi_obv = computeOIScoreFromData(oiData);
            INSTRUMENT_SCORE_MAP[name].pcr    = oiData.pcr;
            INSTRUMENT_SCORE_MAP[name].chPcr  = oiData.chPcr;
            INSTRUMENT_SCORE_MAP[name].oiData = oiData;
            try { _gtbComputeOIExtras(name, oiData); } catch (e2) {}
        } catch (e) {
            done++;
            if (onProgress) onProgress(name, done, names.length);
        }
    }
    for (var i = 0; i < names.length; i += CONC) {
        await Promise.all(names.slice(i, i + CONC).map(_scanOne));
    }
}

async function _gtbRunEodLevelScan(onProgress, onPhase) {
    // Force a fresh LTP snapshot for the WHOLE instrument universe right before fetching OI —
    // otherwise showTrendingOI() (via generateTrend) picks the ATM strike off whatever
    // INSTRUMENT_LTP_PRICE happened to be last written, which can be an hour or more stale if
    // scanLtpPrice() hasn't run since. Real bug hit while building this: a stock's "Close" in
    // the shortlist showed a price from ~12:15 (last LTP refresh) while the actual 15:10 close
    // was ~1.4% away — not just ATM-strike rounding, an outright stale-cache read.
    if (onPhase) onPhase('Refreshing LTP for all instruments…');
    try { await scanLtpPrice(); } catch (e) { console.log('EOD level scan: LTP refresh failed', e); }

    var universe = _lvsFullUniverse();
    if (onPhase) onPhase('Fetching OI/OBV for ' + universe.length + ' instruments…');

    // Wall-check each name RIGHT AFTER its own OI/OBV fetch completes (inside the progress
    // callback), instead of waiting for the whole 200+ universe to finish and looping again
    // afterward — that's what let results appear one-by-one as the scan runs instead of all
    // at once at the very end. onProgress gets the incremental result (if any) plus the
    // running results array so the caller can re-render live.
    var results = [];
    await _lvsActiveFetchOI(universe, function (name, done, total) {
        var r = _lvsWallCheck(name);
        if (r && r.bias) results.push(r);
        if (onProgress) onProgress(name, done, total, (r && r.bias) ? r : null, results);
    });

    var dateStr = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? CURRENT_DAY : _psDateStr(new Date());
    localStorage.setItem('GTB_LEVEL_SCAN_' + dateStr, JSON.stringify({ date: dateStr, results: results, savedAt: Date.now() }));
    return { date: dateStr, results: results };
}

// Most recent saved EOD scan strictly before `dateStr` (ISO date keys sort lexically).
function _lvsFindLatestScanBefore(dateStr) {
    var prefix = 'GTB_LEVEL_SCAN_';
    var keys = Object.keys(localStorage).filter(function (k) { return k.indexOf(prefix) === 0; });
    var before = keys.filter(function (k) { return k.slice(prefix.length) < dateStr; }).sort();
    if (!before.length) return null;
    try { return JSON.parse(localStorage.getItem(before[before.length - 1])); } catch (e) { return null; }
}

// Turns a resolved openPx into the same CONFIRMED/INVALIDATED/STALE verdict either data
// source (WebSocket tick or historical day-candle) produces — kept as one function so the
// two sources can never silently drift into different thresholds.
function _lvsVerdictFor(r, openPx) {
    var distPct = Math.abs(openPx - r.wallStrike) / r.wallStrike * 100;
    var holding = distPct <= _LVS_PROX_PCT * 2;
    var throughLevel = r.bias === 'LONG' ? (openPx < r.wallStrike) : (openPx > r.wallStrike);
    if (throughLevel) return { status: 'INVALIDATED — gapped through ' + r.side, statusCol: 'var(--gtb-red)' };
    if (holding) return { status: 'CONFIRMED — open holding near ' + r.side, statusCol: 'var(--gtb-green)' };
    return { status: 'STALE — gapped away (' + distPct.toFixed(2) + '%), thesis no longer at the level', statusCol: 'var(--gtb-muted)' };
}

// Reads today's open straight off the live ticker (quoteWs.js) instead of a historical
// 'day'-candle fetch. Per live observation, the WebSocket's 'full' mode packet already
// carries a real Open during the 9:00-9:08 pre-open session (screenshot showed SENSEX/NIFTY
// 50/NIFTY FIN SERVICE all populated well before 9:15) — the historical day-candle approach
// can't do that (Kite's day-candle for "today" doesn't exist until the regular session has
// actually started, same limitation _pmbLiveChange documents for GIFT NIFTY/Crude/USDINR).
// Whether the plain REST Quote API also reflects pre-open is unconfirmed here, so this reads
// the ticker the user already verified works, not the Quote API.
// Requires the WebSocket Subscribe popup to have been connected at least once and LEFT OPEN
// (closing it disconnects — see showWebSocketPopup's close.popupwindow handler) — _QW_WS/
// _QW_SUBSCRIBED/_QW_LAST_TICK are module-level globals in quoteWs.js, so they stay valid
// even while that popup isn't the frontmost window, as long as it hasn't been closed.
function _lvsReadFromWs(names) {
    if (typeof _QW_WS === 'undefined' || !_QW_WS || _QW_WS.readyState !== WebSocket.OPEN) return null;

    // Seed the WebSocket popup's own full default list (INDICES + all weighted constituents)
    // FIRST if nothing is subscribed yet — otherwise adding just this shortlist's handful of
    // names here leaves _QW_SUBSCRIBED non-empty, which then silently blocks
    // showWebSocketPopup()'s own "seed default list if empty" check the next time that popup
    // is opened, stranding the user with only 2-3 tickers instead of the full default set.
    var subscribedNew = false;
    if (!Object.keys(_QW_SUBSCRIBED).length && typeof _qwDefaultSubscribeList === 'function') {
        _qwDefaultSubscribeList();
        subscribedNew = true; // _qwDefaultSubscribeList only populates the local map — still needs sending below
    }

    names.forEach(function (name) {
        var tok = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS[name] : null;
        if (tok && !_QW_SUBSCRIBED[tok]) { _QW_SUBSCRIBED[tok] = name; subscribedNew = true; }
    });
    if (subscribedNew) _qwWsSubscribeAll();
    var out = {};
    names.forEach(function (name) {
        var tok = (typeof INSTRUMENT_TOKENS !== 'undefined') ? INSTRUMENT_TOKENS[name] : null;
        var tick = tok ? _QW_LAST_TICK[tok] : null;
        out[name] = (tick && tick.open) ? { open: tick.open, justSubscribed: subscribedNew } : null;
    });
    return out;
}

// Compares yesterday's saved shortlist against TODAY's open — WebSocket tick first (works
// pre-9:15, see _lvsReadFromWs), falling back to the historical day-candle fetch (only valid
// once the regular session has started) when the WS isn't connected.
async function _gtbRunPreMarketLevelCheck() {
    var today = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? CURRENT_DAY : _psDateStr(new Date());
    var prev = _lvsFindLatestScanBefore(today);
    if (!prev || !prev.results || !prev.results.length) return { date: prev ? prev.date : null, rows: [] };

    var names = prev.results.map(function (r) { return r.name; });
    var wsData = _lvsReadFromWs(names);
    var usedWs = !!wsData;

    var rows = await Promise.all(prev.results.map(async function (r) {
        var openPx = null, waitingForTick = false;
        if (usedWs) {
            var w = wsData[r.name];
            if (w) openPx = w.open;
            else waitingForTick = true;
        } else {
            try {
                var token = _psPriceTokenFor(r.name);
                var candles = await _psFetchDaily(token, 3);
                if (candles && candles.length) {
                    var last = candles[candles.length - 1];
                    var lastDateStr = moment(last[0]).format('YYYY-MM-DD');
                    if (lastDateStr === today) openPx = parseFloat(last[1]);
                }
            } catch (e) {}
        }

        if (openPx == null) {
            var msg = usedWs ? 'WAITING FOR TICK' + (waitingForTick ? ' (just subscribed)' : '') : 'NOT OPEN YET';
            return Object.assign({}, r, { openPx: null, status: msg, statusCol: 'var(--gtb-amber)' });
        }
        var verdict = _lvsVerdictFor(r, openPx);
        return Object.assign({}, r, { openPx: openPx, status: verdict.status, statusCol: verdict.statusCol });
    }));
    return { date: prev.date, rows: rows, usedWs: usedWs };
}

function _lvsRowHtml(r, showOpen) {
    var link = _psChartLink(r.name, _psPriceTokenFor(r.name));
    var biasCol = r.bias === 'LONG' ? 'var(--gtb-green)' : 'var(--gtb-red)';
    var priceCell = showOpen
        ? (r.openPx != null ? 'Open ' + r.openPx.toFixed(2) : '—') + ' <span style="color:var(--gtb-muted);">vs wall ' + r.wallStrike + '</span>'
        : 'Close ' + r.spot.toFixed(2) + ' <span style="color:var(--gtb-muted);">vs wall ' + r.wallStrike + '</span>';
    var statusHtml = showOpen
        ? '<span style="color:' + r.statusCol + ';font-weight:700;">' + r.status + '</span>'
        : '<span style="color:var(--gtb-muted);">' + r.reason + '</span>';
    return '<div style="display:grid;grid-template-columns:110px 55px 1fr 1fr;gap:6px;align-items:center;padding:4px 6px;border-bottom:1px solid var(--gtb-border);font-size:0.5rem;">'
        + '<a href="' + link + '" target="_blank" rel="noopener" style="font-weight:800;color:var(--gtb-text);">' + r.name + '</a>'
        + '<span style="font-weight:800;color:' + biasCol + ';">' + r.bias + '</span>'
        + '<span style="font-family:var(--gtb-mono);">' + priceCell + '</span>'
        + statusHtml
        + '</div>';
}

// Splits a shortlist into NIFTY 50 / BANK NIFTY / Other F&O — using the same top-10 weighted
// membership lists (constants.js) already used everywhere else in this app for this kind of
// grouping (Pre-Market Brief's OI Carryover Shortlist, Signals tab weighted-OI tables, etc.).
// There's no full 50/12-constituent list anywhere in the codebase, only the top-10-by-weight
// ones — so a stock outside both (the vast majority of the 200+ FO_LIST universe) lands in
// "Other F&O". A stock CAN legitimately appear in both NIFTY 50 and BANK NIFTY groups
// (HDFCBANK, ICICIBANK, SBIN, AXISBANK, KOTAKBANK are top-10 weighted in both indices) —
// that's intentional, not a de-dup bug, since it really is a constituent of both.
function _lvsGroupByIndex(rows) {
    var nifty = [], bank = [], other = [];
    rows.forEach(function (r) {
        var inNifty = r.name === 'NIFTY 50' || (typeof NIFTY_50_WEIGHTED_STOCKS !== 'undefined' && NIFTY_50_WEIGHTED_STOCKS[r.name] !== undefined);
        var inBank  = r.name === 'NIFTY BANK' || (typeof NIFTY_BANK_WEIGHTED_STOCKS !== 'undefined' && NIFTY_BANK_WEIGHTED_STOCKS[r.name] !== undefined);
        if (inNifty) nifty.push(r);
        if (inBank) bank.push(r);
        if (!inNifty && !inBank) other.push(r);
    });
    return { nifty: nifty, bank: bank, other: other };
}

// Shared renderer for both the EOD results panel and the Pre-Market Check panel — filters by
// the instrument search box, then segregates into NIFTY 50 / BANK NIFTY / Other F&O sections.
function _lvsRenderGrouped(containerSel, rows, showOpen, filterText) {
    var f = (filterText || '').toUpperCase().trim();
    var filtered = f ? rows.filter(function (r) { return r.name.indexOf(f) !== -1; }) : rows;
    if (!filtered.length) {
        jQ(containerSel).html('<div style="padding:10px;text-align:center;color:var(--gtb-muted);">'
            + (rows.length ? 'No instrument matches "' + f + '".' : 'No setups.') + '</div>');
        return;
    }
    var groups = _lvsGroupByIndex(filtered);
    function _section(title, list, col) {
        if (!list.length) return '';
        return '<div style="font-size:0.5rem;font-weight:800;color:' + col + ';letter-spacing:0.04em;margin:8px 0 3px;">' + title + ' (' + list.length + ')</div>'
            + '<div style="background:var(--gtb-surface);border:1px solid var(--gtb-border);">'
            + list.map(function (r) { return _lvsRowHtml(r, showOpen); }).join('')
            + '</div>';
    }
    jQ(containerSel).html(
        _section('NIFTY 50', groups.nifty, 'var(--gtb-blue,#58a6ff)')
        + _section('BANK NIFTY', groups.bank, 'var(--gtb-accent,#a371f7)')
        + _section('OTHER F&O', groups.other, 'var(--gtb-muted)')
    );
}

function _gtbShowLevelFadeScanner() {
    var _cls = 'popup-custom-style-level-fade-scanner';
    var html = '<div id="lvs-wrap" style="height:100%;overflow:auto;padding:10px;background:var(--gtb-bg);color:var(--gtb-text);font-size:0.65rem;">'
        + '<div style="font-size:0.5rem;color:var(--gtb-muted);margin-bottom:8px;">Fades price sitting on an intact OI wall (OBV-ranked support/resistance, not just the nearest strike) — skips a wall that\'s already eroding.</div>'
        + '<input id="lvs-filter" type="text" placeholder="Filter instrument…" style="width:100%;padding:4px 8px;margin-bottom:10px;font-size:0.6rem;background:var(--gtb-surface);color:var(--gtb-text);border:1px solid var(--gtb-border);box-sizing:border-box;" />'

        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
        + '<span style="font-size:0.58rem;font-weight:800;color:var(--gtb-muted);letter-spacing:0.05em;"><i class="bi bi-moon-stars-fill"></i> 1 · EOD SCAN — full F&amp;O (run after close)</span>'
        + '<button id="lvs-eod-btn" style="margin-left:auto;padding:4px 12px;font-size:0.6rem;background:var(--gtb-accent,#58a6ff);color:#fff;border:none;border-radius:3px;cursor:pointer;font-weight:700;"><i class="bi bi-play-fill"></i> Run EOD Scan</button>'
        + '</div>'
        + '<div style="font-size:0.46rem;color:var(--gtb-muted);margin-bottom:4px;">Actively fetches OI/OBV for every FO_LIST stock (200+), not just whatever\'s already cached — takes a few minutes. Run "Load Prices" + a refresh first so today\'s open/LTP is populated for all of them.</div>'
        + '<div id="lvs-eod-progress" style="font-size:0.5rem;color:var(--gtb-muted);min-height:14px;margin-bottom:4px;"></div>'
        + '<div id="lvs-eod-results" style="margin-bottom:14px;"></div>'

        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
        + '<span style="font-size:0.58rem;font-weight:800;color:var(--gtb-muted);letter-spacing:0.05em;"><i class="bi bi-sunrise-fill"></i> 2 · PRE-MARKET CHECK (run next session)</span>'
        + '<button id="lvs-pm-btn" style="margin-left:auto;padding:4px 12px;font-size:0.6rem;background:var(--gtb-accent,#58a6ff);color:#fff;border:none;border-radius:3px;cursor:pointer;font-weight:700;"><i class="bi bi-play-fill"></i> Check vs Today\'s Open</button>'
        + '</div>'
        + '<div style="font-size:0.46rem;color:var(--gtb-muted);margin-bottom:4px;">Reads today\'s open from the live WebSocket ticker if connected (works pre-9:15) — open <b>WebSocket Subscribe</b> and click Connect first, then leave it open. Falls back to a historical fetch (post-9:15 only) if not connected.</div>'
        + '<div id="lvs-pm-results"></div>'
        + '</div>';

    showPopUpWindow('level-fade-scanner', html, 'Level Fade Scanner', 640, 560);
    var _title = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<i class="bi bi-water" style="font-size:0.75rem;"></i>'
        + '<span style="font-weight:800;font-size:0.7rem;">LEVEL FADE SCANNER</span>'
        + popupWinControls(_cls) + '</div>';
    jQ('.' + _cls).find('.popupwindow_titlebar_text').html(_title);
    hideNativePopupButtons(_cls);
    jQ('.' + _cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + _cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');

    // Restore today's already-run EOD scan (if any) without re-running it.
    var todayStr = (typeof CURRENT_DAY !== 'undefined' && CURRENT_DAY) ? CURRENT_DAY : _psDateStr(new Date());
    _LVS_LAST_EOD = null;
    _LVS_LAST_PM = null;
    try {
        var cached = JSON.parse(localStorage.getItem('GTB_LEVEL_SCAN_' + todayStr));
        if (cached && cached.results) _lvsRenderEodResults(cached);
    } catch (e) {}
}

// Last-rendered datasets, kept so the filter box can re-render without re-fetching.
var _LVS_LAST_EOD = null; // { date, results }
var _LVS_LAST_PM = null;  // { date, rows, usedWs }

function _lvsRenderEodResults(scan) {
    _LVS_LAST_EOD = scan;
    var filterText = jQ('#lvs-filter').val();
    if (!scan.results.length) {
        jQ('#lvs-eod-results').html('<div style="padding:10px;text-align:center;color:var(--gtb-muted);">No instrument closed on an intact OI wall today.</div>');
        return;
    }
    var longs = scan.results.filter(function (r) { return r.bias === 'LONG'; });
    var shorts = scan.results.filter(function (r) { return r.bias === 'SHORT'; });
    jQ('#lvs-eod-results').html('<div id="lvs-eod-summary" style="font-size:0.46rem;color:var(--gtb-muted);margin-bottom:4px;">Saved for ' + scan.date + ' — ' + longs.length + ' long / ' + shorts.length + ' short setups.</div>'
        + '<div id="lvs-eod-grouped"></div>');
    _lvsRenderGrouped('#lvs-eod-grouped', scan.results, false, filterText);
}

function _lvsRenderPmResults(out) {
    _LVS_LAST_PM = out;
    var filterText = jQ('#lvs-filter').val();
    var srcNote = out.usedWs
        ? '<span style="color:var(--gtb-green);">live WebSocket ticker</span>'
        : '<span style="color:var(--gtb-amber);">historical fetch (WebSocket not connected — open/Connect it first for pre-9:15 reads)</span>';
    jQ('#lvs-pm-results').html('<div id="lvs-pm-summary" style="font-size:0.46rem;color:var(--gtb-muted);margin-bottom:4px;">Comparing vs EOD scan saved on ' + out.date + ' — source: ' + srcNote + '.</div>'
        + '<div id="lvs-pm-grouped"></div>');
    _lvsRenderGrouped('#lvs-pm-grouped', out.rows, true, filterText);
}

// Re-applies the current filter text to whichever datasets are already loaded, without
// re-running either scan — so typing in the filter box is instant.
jQ(document).on('input', '#lvs-filter', function () {
    var filterText = jQ(this).val();
    if (_LVS_LAST_EOD && _LVS_LAST_EOD.results.length) _lvsRenderGrouped('#lvs-eod-grouped', _LVS_LAST_EOD.results, false, filterText);
    if (_LVS_LAST_PM && _LVS_LAST_PM.rows.length) _lvsRenderGrouped('#lvs-pm-grouped', _LVS_LAST_PM.rows, true, filterText);
});

jQ(document).on('click', '#lvs-eod-btn', async function () {
    var $btn = jQ(this).prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Scanning…');
    jQ('#lvs-eod-progress').text('Starting full F&O scan…');
    // Empty the results area up front and fill it in live as each stock's wall check
    // completes, instead of only writing to the DOM once the whole 200+ scan is done.
    jQ('#lvs-eod-results').html('<div id="lvs-eod-summary" style="font-size:0.46rem;color:var(--gtb-muted);margin-bottom:4px;"></div><div id="lvs-eod-grouped"></div>');

    var scan = await _gtbRunEodLevelScan(function (name, done, total, r, resultsSoFar) {
        jQ('#lvs-eod-progress').text('OI/OBV: ' + done + '/' + total + ' (' + name + ') — ' + resultsSoFar.length + ' setup' + (resultsSoFar.length === 1 ? '' : 's') + ' so far');
        if (r) {
            var longsSoFar = resultsSoFar.filter(function (x) { return x.bias === 'LONG'; }).length;
            jQ('#lvs-eod-summary').text('Scanning… ' + longsSoFar + ' long / ' + (resultsSoFar.length - longsSoFar) + ' short so far (' + done + '/' + total + ' scanned).');
            _lvsRenderGrouped('#lvs-eod-grouped', resultsSoFar, false, jQ('#lvs-filter').val());
        }
    }, function (phase) {
        jQ('#lvs-eod-progress').text(phase);
    });
    jQ('#lvs-eod-progress').text('Done — scanned ' + _lvsFullUniverse().length + ' instruments, ' + scan.results.length + ' setups found.');
    _lvsRenderEodResults(scan);
    $btn.prop('disabled', false).html('<i class="bi bi-play-fill"></i> Run EOD Scan');
});

jQ(document).on('click', '#lvs-pm-btn', async function () {
    var $btn = jQ(this).prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Checking…');
    var out = await _gtbRunPreMarketLevelCheck();
    $btn.prop('disabled', false).html('<i class="bi bi-play-fill"></i> Check vs Today\'s Open');
    if (!out.date) {
        jQ('#lvs-pm-results').html('<div style="padding:10px;text-align:center;color:var(--gtb-muted);">No saved EOD scan from a prior session yet — run step 1 after today\'s close first.</div>');
        return;
    }
    if (!out.rows.length) {
        jQ('#lvs-pm-results').html('<div style="padding:10px;text-align:center;color:var(--gtb-muted);">Last saved scan (' + out.date + ') had no setups.</div>');
        return;
    }
    _lvsRenderPmResults(out);
});

// ── Send to Telegram — same idea as groot-research's Telegram feature (a UI-button trigger,
// tap-to-copy symbol names via Telegram's monospace formatting), reimplemented here since this
// is a separate codebase (Tampermonkey userscript vs groot-research's Python/Flask backend) —
// GM_xmlhttpRequest calls the Telegram Bot API directly, bypassing CORS the same way every
// other external API call in this app does (Yahoo, CBOE). Sends whatever is CURRENTLY VISIBLE
// in the table (after filter/search/sort), not the full scan, so what you get in Telegram
// matches what you were just looking at.
function _psTelegramEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function _psBuildTelegramMessage(rows) {
    if (!rows.length) return null;
    var longs = rows.filter(function (r) { return r.verdict.indexOf('BUY') !== -1 || r.verdict.indexOf('LONG forming') !== -1; });
    var shorts = rows.filter(function (r) { return r.verdict.indexOf('SELL') !== -1 || r.verdict.indexOf('SHORT forming') !== -1; });
    var other = rows.filter(function (r) { return longs.indexOf(r) === -1 && shorts.indexOf(r) === -1; });

    function fmtRow(r) {
        // <code>SYMBOL</code> renders as monospace in Telegram, which is what makes it
        // tap-to-copy in the mobile app — same trick groot-research's own Telegram feature
        // used, just Telegram's native formatting instead of a custom copy button.
        var line = '<code>' + _psTelegramEsc(r.name) + '</code> — ' + _psTelegramEsc(r.verdict);
        if (r.entry != null) line += '\n  Entry ' + r.entry.toFixed(1) + ' · Target ' + r.target.toFixed(1) + ' · Stop ' + r.stop.toFixed(1)
            + (r.riskReward != null ? ' · R:R 1:' + r.riskReward.toFixed(1) : '');
        if (r.convictionPct != null) line += ' · Conviction ' + r.convictionPct + '%';
        return line;
    }

    var parts = ['<b>Positional Screener — ' + moment().format('DD-MMM HH:mm') + '</b>', '(' + rows.length + ' shown, as currently filtered)'];
    if (longs.length) parts.push('\n<b>LONG (' + longs.length + ')</b>\n' + longs.map(fmtRow).join('\n'));
    if (shorts.length) parts.push('\n<b>SHORT (' + shorts.length + ')</b>\n' + shorts.map(fmtRow).join('\n'));
    if (other.length) parts.push('\n<b>OTHER / WATCH (' + other.length + ')</b>\n' + other.map(fmtRow).join('\n'));
    parts.push('\n<i>Rule-based, not a validated probability. Groot Bot Positional Screener.</i>');
    return parts.join('\n');
}

// Telegram's own hard limit is 4096 chars/message — split on section boundaries (blank-line-
// preceded blocks) first, but a single section (e.g. a big OTHER/WATCH list, all joined by
// single '\n' with no blank lines inside it) can itself exceed maxLen — that block was
// previously treated as atomic and passed through oversized, which is exactly what caused
// Telegram's "message is too long" rejection on a large scan. Any block still over maxLen
// after the section split is now further packed line-by-line (never mid-line, so a symbol
// name + its entry/target/stop line always stay together as one unbreakable unit).
function _psChunkTelegramMessage(text, maxLen) {
    maxLen = maxLen || 3800;
    if (text.length <= maxLen) return [text];
    var blocks = text.split('\n\n'), chunks = [], cur = '';
    function flush() { if (cur) { chunks.push(cur); cur = ''; } }
    blocks.forEach(function (b) {
        if (b.length > maxLen) {
            flush();
            var lines = b.split('\n'), lcur = '';
            lines.forEach(function (ln) {
                if ((lcur + '\n' + ln).length > maxLen && lcur) { chunks.push(lcur); lcur = ln; }
                else lcur = lcur ? lcur + '\n' + ln : ln;
            });
            if (lcur) chunks.push(lcur);
        } else if ((cur + '\n\n' + b).length > maxLen && cur) {
            chunks.push(cur); cur = b;
        } else {
            cur = cur ? cur + '\n\n' + b : b;
        }
    });
    flush();
    return chunks;
}

function _psTelegramSendOne(token, chatId, text) {
    return new Promise(function (resolve, reject) {
        if (typeof GM_xmlhttpRequest === 'undefined') { reject('GM_xmlhttpRequest unavailable'); return; }
        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://api.telegram.org/bot' + token + '/sendMessage',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: 'chat_id=' + encodeURIComponent(chatId) + '&parse_mode=HTML&disable_web_page_preview=true&text=' + encodeURIComponent(text),
            onload: function (res) {
                try {
                    var j = JSON.parse(res.responseText);
                    if (j.ok) resolve(); else reject(j.description || ('HTTP ' + res.status));
                } catch (e) { reject('Bad response from Telegram (HTTP ' + res.status + ')'); }
            },
            onerror: function () { reject('Network error contacting Telegram'); },
        });
    });
}

jQ(document).on('click', '#ps-telegram-btn', async function () {
    var $btn = jQ(this);
    var token = (typeof g_config !== 'undefined' ? g_config.get('telegram_bot_token') : '') || '';
    var chatId = (typeof g_config !== 'undefined' ? g_config.get('telegram_chat_id') : '') || '';
    if (!token || !chatId) { _gtbToast('Set Telegram Bot Token + Chat ID in Settings → API & Authentication first', 'error'); return; }
    var rows = _PS_LAST_FILTERED_ROWS;
    if (!rows || !rows.length) { _gtbToast('Nothing to send — run a scan first', 'error'); return; }
    var msg = _psBuildTelegramMessage(rows);
    if (!msg) { _gtbToast('Nothing to send', 'error'); return; }
    var chunks = _psChunkTelegramMessage(msg);
    $btn.prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Sending…');
    try {
        for (var i = 0; i < chunks.length; i++) await _psTelegramSendOne(token, chatId, chunks[i]);
        _gtbToast('Sent ' + rows.length + ' row(s) to Telegram' + (chunks.length > 1 ? ' (' + chunks.length + ' messages)' : ''), 'success');
    } catch (e) {
        _gtbToast('Telegram send failed: ' + e, 'error');
    } finally {
        $btn.prop('disabled', false).html('<i class="bi bi-send"></i> Telegram');
    }
});

// ── Add to Basket — bulk-stage selected stocks into a Kite basket for one-click execution ──
// Kite's own basket feature ("/api/baskets*" endpoints). A captured real-browser request's
// Request Headers showed NO 'Authorization' header and NO 'x-csrftoken' header at all — it
// authenticates purely off cookies sent automatically with the same-origin request (kf_session/
// enctoken/public_token all travel as plain Cookie values, never read into a header). Using
// jQ.ajax here was the actual bug, regardless of which headers this file passed it: this app's
// OTHER code (placeOrder, getHistoricalData, etc.) calls jQ.ajaxSetup({headers:{Authorization:
// ...}}) for the "/oms/*" API, and jQuery's ajaxSetup mutates its GLOBAL defaults for the rest
// of the page session — every later jQ.ajax call silently inherits that stale Authorization
// header with no way to un-set it via the per-call `headers` option, which is exactly why
// basket calls kept failing with "Invalid authorization header" even before this file ever
// added one itself. Fixed by using native fetch() with credentials:'same-origin' instead of
// jQ.ajax — bypasses jQuery's polluted global defaults entirely and matches the real request
// exactly (cookies only, no custom auth header).
//   GET  /api/baskets             -> { status:'success', data:[{id,name,type,items,...}, ...] }
//   POST /api/baskets             -> body: name=<basket name>   (creates a new empty basket)
//   POST /api/baskets/:id/items   -> body: tradingsymbol, exchange, weight,
//                                    params=JSON.stringify({transaction_type, product,
//                                    order_type, validity, validity_ttl, variety, quantity,
//                                    price, trigger_price, disclosed_quantity, tags})
function _psBasketFormBody(fields) {
    var p = [];
    Object.keys(fields).forEach(function (k) { p.push(encodeURIComponent(k) + '=' + encodeURIComponent(fields[k])); });
    return p.join('&');
}
function _psBasketFetch(url, method, fields) {
    // The dropped Authorization header was the real fix (see the block comment above), but
    // state-changing requests (POST) also need Kite's CSRF header — a browser doesn't attach
    // this automatically the way it does cookies; Kite's own frontend JS reads it off the
    // 'public_token' cookie and sets it explicitly, same convention addToWatchList's
    // '/api/marketwatch/:id/items' call already uses ('x-csrftoken' header = public_token
    // cookie value). Switching to fetch() dropped this too — confirmed by the next error,
    // {"status":"error","message":"Invalid CSRF token.","error_type":"TokenException"}, once
    // the Authorization issue above was fixed.
    var opts = { method: method, credentials: 'same-origin', headers: { 'Accept': 'application/json, text/plain, */*', 'x-csrftoken': getCookie('public_token') } };
    if (fields) {
        opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        opts.body = _psBasketFormBody(fields);
    }
    return fetch(url, opts).then(function (res) {
        return res.json().catch(function () { throw 'HTTP ' + res.status + ' (non-JSON response)'; }).then(function (json) {
            if (!res.ok || (json && json.status === 'error')) throw (json && json.message) || ('HTTP ' + res.status);
            return json;
        });
    });
}
function _psFetchBaskets() {
    return _psBasketFetch(BASE_URL + '/api/baskets', 'GET').then(function (res) { return (res && res.data) || []; });
}
function _psCreateBasket(name) {
    return _psBasketFetch(BASE_URL + '/api/baskets', 'POST', { name: name }).then(function () {
        // The create response shape isn't relied on directly -- re-fetch the list right
        // after, which is confirmed (captured from the real app) to include the new
        // basket with its id, rather than assuming what POST itself returns.
        return _psFetchBaskets().then(function (baskets) {
            var created = baskets.filter(function (b) { return b.name === name; }).pop();
            if (!created) throw 'Basket created but could not be found in the list afterward.';
            return created;
        });
    });
}
// Position size for a basket item -- sized to actually USE the Account Capital setting
// (MARGIN, config.js) as a per-trade buying-power budget, leveraged for MIS, rather than the
// Turtle-style risk-fraction sizing used elsewhere in this app (_gtbPositionSizeCalc,
// grootTradeBot.js's own Position Size calculator, which deliberately risks only a small %
// of capital per trade and was producing a much smaller qty than the stated ₹10,000 margin
// would actually buy -- reported directly: "the margin is 10000 but the qty is less"). Here,
// qty = floor((capital × leverage) / entry price) -- how many shares the stated capital
// (×5 for MIS, Zerodha's intraday margin) can actually buy at this row's own ATR-based entry
// price. Each selected stock is sized independently against the FULL capital figure (this is
// a per-trade buying-power budget, not a total-portfolio allocation split across however many
// stocks are checked at once) -- if adding several stocks together, total margin used across
// all of them will exceed the capital figure for any one of them.
//
// MIS (intraday) margin multiplier -- Zerodha only requires ~1/5th the cash upfront for an
// intraday (MIS) equity position vs a full-price CNC delivery buy, i.e. the SAME capital
// funds 5x the quantity intraday that it would for a delivery hold. Flat 5x per explicit
// request (Zerodha's real per-stock MIS leverage varies 1x-20x by margin category -- this
// app has no per-stock margin-category data cached anywhere to do better than the flat
// figure the user gave, and fetching it would need a new, unrelated API call).
var GTB_MIS_MARGIN_MULTIPLIER = 5;
function _psQtyFor(r, isIntraday) {
    var capital = (typeof MARGIN !== 'undefined' ? parseFloat(MARGIN) : NaN) || 0;
    if (!capital || !r.entry) return 1;
    var buyingPower = isIntraday ? capital * GTB_MIS_MARGIN_MULTIPLIER : capital;
    return Math.max(1, Math.floor(buyingPower / r.entry));
}
function _psAddRowToBasket(basketId, r, product) {
    product = product === 'MIS' ? 'MIS' : 'CNC';
    var side = (r.verdict.indexOf('SELL') !== -1 || r.verdict.indexOf('SHORT forming') !== -1) ? 'SELL' : 'BUY';
    var qty = _psQtyFor(r, product === 'MIS');
    // MARKET order -- price is always 0 for a market order (Kite ignores/ rejects a non-zero
    // price on this order_type); r.entry is still used for the qty/buying-power calc above,
    // just no longer sent as a limit price here.
    var params = {
        transaction_type: side, product: product, order_type: 'MARKET', validity: 'DAY',
        validity_ttl: 1, variety: 'regular', quantity: qty, price: 0,
        trigger_price: 0, disclosed_quantity: 0, tags: []
    };
    return _psBasketFetch(BASE_URL + '/api/baskets/' + basketId + '/items', 'POST',
        { tradingsymbol: r.name, exchange: 'NSE', weight: 0, params: JSON.stringify(params) }
    ).then(function () {
        return { name: r.name, side: side, qty: qty };
    }, function (err) {
        throw r.name + ': ' + err;
    });
}

function _psBasketSelectedNames() { return Object.keys(_PS_BASKET_SELECTED).filter(function (n) { return _PS_BASKET_SELECTED[n]; }); }
function _psUpdateBasketCount() { jQ('#ps-basket-count').text(_psBasketSelectedNames().length); }

jQ(document).on('change', '.ps-basket-chk', function () {
    var name = jQ(this).attr('data-name');
    if (this.checked) _PS_BASKET_SELECTED[name] = true; else delete _PS_BASKET_SELECTED[name];
    _psUpdateBasketCount();
});
jQ(document).on('change', '#ps-select-all-basket', function () {
    var checked = this.checked;
    jQ('.ps-basket-chk').prop('checked', checked).each(function () {
        var name = jQ(this).attr('data-name');
        if (checked) _PS_BASKET_SELECTED[name] = true; else delete _PS_BASKET_SELECTED[name];
    });
    _psUpdateBasketCount();
});

function _psBasketPickerHtml() {
    return '<div id="ps-basket-wrap" style="padding:12px;font-size:0.68rem;color:var(--gtb-text);">'
        + '<div style="margin-bottom:8px;display:flex;align-items:center;gap:6px;">'
        +   '<label for="ps-basket-product" style="color:var(--gtb-muted);">Product:</label>'
        +   '<select id="ps-basket-product" style="padding:4px 6px;background:var(--gtb-surface2);color:var(--gtb-text);border:1px solid var(--gtb-border);">'
        +     '<option value="CNC">CNC (Delivery — this screener\'s own multi-day hold)</option>'
        +     '<option value="MIS" selected>MIS (Intraday — qty scaled ' + GTB_MIS_MARGIN_MULTIPLIER + 'x for Zerodha\'s margin)</option>'
        +   '</select>'
        + '</div>'
        + '<div id="ps-basket-list"><i class="bi bi-hourglass-split"></i> Loading baskets…</div>'
        + '<div style="margin-top:10px;display:flex;gap:6px;">'
        +   '<input type="text" id="ps-basket-new-name" placeholder="New basket name…" style="flex:1;padding:5px 8px;background:var(--gtb-surface2);color:var(--gtb-text);border:1px solid var(--gtb-border);">'
        +   '<button id="ps-basket-new-btn" class="sv-pill-btn" type="button"><i class="bi bi-plus-circle"></i> Create &amp; Add</button>'
        + '</div>'
        + '<div id="ps-basket-status" style="margin-top:8px;color:var(--gtb-muted);"></div>'
        + '</div>';
}
function _psRenderBasketList(baskets) {
    if (!baskets.length) { jQ('#ps-basket-list').html('<span style="color:var(--gtb-muted);">No baskets yet — create one below.</span>'); return; }
    var html = baskets.map(function (b) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--gtb-border2);">'
            + '<span>' + b.name + ' <span style="color:var(--gtb-muted);">(' + (b.items ? b.items.length : 0) + ' items)</span></span>'
            + '<button class="sv-pill-btn ps-basket-pick" data-id="' + b.id + '" data-name="' + b.name.replace(/"/g, '&quot;') + '" type="button">Add Here</button>'
            + '</div>';
    }).join('');
    jQ('#ps-basket-list').html(html);
}
async function _psRunBasketAdd(basketId, basketName, names) {
    var $status = jQ('#ps-basket-status');
    var product = (jQ('#ps-basket-product').val() === 'MIS') ? 'MIS' : 'CNC';
    var ok = 0, failed = [];
    for (var i = 0; i < names.length; i++) {
        var r = _PS_CACHE[names[i].toUpperCase()] || _PS_CACHE[names[i]];
        if (!r) { failed.push(names[i] + ': not in current scan'); continue; }
        $status.html('<i class="bi bi-hourglass-split"></i> Adding ' + (i + 1) + ' / ' + names.length + ' — ' + r.name + '…');
        try { await _psAddRowToBasket(basketId, r, product); ok++; } catch (e) { failed.push(e); }
        await new Promise(function (res) { setTimeout(res, 350); }); // same spirit as callAddToWatchList's rate-limit delay
    }
    if (ok) { _PS_BASKET_SELECTED = {}; _psUpdateBasketCount(); try { _psRenderTable(); } catch (e) {} }
    $status.html('<b style="color:' + (failed.length ? 'var(--gtb-amber)' : 'var(--gtb-green)') + ';">Added ' + ok + ' / ' + names.length + ' to "' + basketName + '"</b>'
        + (failed.length ? '<br><span style="color:var(--gtb-red);">' + failed.join('<br>') + '</span>' : ''));
    _gtbToast(ok + ' stock(s) added to basket "' + basketName + '"' + (failed.length ? ' (' + failed.length + ' failed)' : ''), failed.length ? 'error' : 'success');
}

jQ(document).on('click', '#ps-basket-btn', function () {
    var names = _psBasketSelectedNames();
    if (!names.length) { _gtbToast('Check at least one stock first (checkbox column, left of Symbol).', 'error'); return; }
    showPopUpWindow('ps-basket-picker', _psBasketPickerHtml(), 'Add ' + names.length + ' Stock(s) to Basket', 420, 380);
    var _cls = 'popup-custom-style-ps-basket-picker';
    // Standard titlebar replacement + theme sync, same convention as every other popup in this
    // app (e.g. .ps-explain-btn's handler just above) -- was missing here, so this popup never
    // picked up the light/dark theme and always showed the library's default dark chrome.
    var _title = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<span style="font-weight:800;font-size:0.7rem;">ADD ' + names.length + ' STOCK(S) TO BASKET</span>'
        + popupWinControls(_cls) + '</div>';
    jQ('.' + _cls).find('.popupwindow_titlebar_text').html(_title);
    hideNativePopupButtons(_cls);
    jQ('.' + _cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + _cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
    _psFetchBaskets().then(_psRenderBasketList, function (err) { jQ('#ps-basket-list').html('<span style="color:var(--gtb-red);">' + err + '</span>'); });
});
jQ(document).on('click', '.ps-basket-pick', function () {
    var id = jQ(this).attr('data-id'), name = jQ(this).attr('data-name');
    _psRunBasketAdd(id, name, _psBasketSelectedNames());
});
jQ(document).on('click', '#ps-basket-new-btn', function () {
    var name = (jQ('#ps-basket-new-name').val() || '').trim();
    if (!name) { _gtbToast('Enter a basket name first', 'error'); return; }
    var $status = jQ('#ps-basket-status');
    $status.html('<i class="bi bi-hourglass-split"></i> Creating basket…');
    _psCreateBasket(name).then(function (basket) {
        _psRunBasketAdd(basket.id, basket.name, _psBasketSelectedNames());
    }, function (err) { $status.html('<span style="color:var(--gtb-red);">' + err + '</span>'); });
});
