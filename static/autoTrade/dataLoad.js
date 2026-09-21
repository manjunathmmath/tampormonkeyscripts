// ─── dataLoad.js ────────────────────────────────────────────────────────────
// "Data Load" popup — two independent loaders:
//   1. Kite Instruments  → fetches the full Kite instrument master dump (all
//      exchanges/segments) via GM_xmlhttpRequest (bypasses CORS, same pattern
//      quoteWs.js already uses) and caches it in browser IndexedDB, shown in a
//      searchable table.
//   2. Strike Intervals  → fetches NSE_FO_SosScheme.csv (the same source
//      NSE_STRIKE_DIFF in constants.js was originally hand-populated from) and
//      caches symbol → step-value pairs in localStorage, shown in a searchable
//      table. This does NOT overwrite NSE_STRIKE_DIFF — it's a separate,
//      independently-refreshable reference table.
//
// FO_LIST (constants.js) is the ONE exception to "read-only, no globals touched": it's
// now reassigned in place from the strike-interval symbol list, replacing what used to be
// a hand-maintained literal. Deliberately scoped to ONLY FO_LIST — a previous version of
// this file also merged derived data into INSTRUMENT_TOKENS, which silently broke "Load
// Prices" by ballooning it to thousands of entries (every NSE cash-market symbol, not
// just F&O ones). FO_LIST itself is bounded (~200 symbols, same order of magnitude either
// way) and sourced from exactly the data its old hardcoded value was manually copied from,
// so reassigning it carries none of that risk — never extend this pattern to any other
// global without re-reading that incident first.
// ─────────────────────────────────────────────────────────────────────────────

// ── IndexedDB (Kite instrument master) ──────────────────────────────────────
var _DL_DB_NAME = 'groot-tm-instruments-db';
var _DL_DB_VERSION = 1;
var _DL_STORE = 'instruments';

function _dlOpenDb() {
    return new Promise(function (resolve, reject) {
        var req = indexedDB.open(_DL_DB_NAME, _DL_DB_VERSION);
        req.onupgradeneeded = function () {
            var db = req.result;
            if (!db.objectStoreNames.contains(_DL_STORE)) {
                var store = db.createObjectStore(_DL_STORE, { keyPath: 'token' });
                store.createIndex('tradingsymbol', 'tradingsymbol', { unique: false });
                store.createIndex('name', 'name', { unique: false });
            }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
    });
}

function _dlPutInstruments(rows) {
    return _dlOpenDb().then(function (db) {
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(_DL_STORE, 'readwrite');
            tx.objectStore(_DL_STORE).clear();
            rows.forEach(function (r) { tx.objectStore(_DL_STORE).put(r); });
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
        }).then(function () {
            db.close();
            localStorage.setItem('DL_INSTRUMENTS_CACHED_AT', new Date().toISOString());
        });
    });
}

function _dlGetAllInstruments() {
    return _dlOpenDb().then(function (db) {
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(_DL_STORE, 'readonly');
            var req = tx.objectStore(_DL_STORE).getAll();
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        }).then(function (rows) { db.close(); return rows; });
    });
}

function _dlClearInstrumentsDb() {
    return _dlOpenDb().then(function (db) {
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(_DL_STORE, 'readwrite');
            tx.objectStore(_DL_STORE).clear();
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
        }).then(function () { db.close(); });
    });
}

// Quote-aware CSV field split (RFC4180-ish) — a plain line.split(',') silently misaligns
// every column the moment a `name` field contains a literal comma (real risk in company
// name data, e.g. "L&T Finance Holdings, Ltd" style entries), corrupting exchange/
// segment/instrument_type/etc for that row without any visible error. Used by both CSV
// parsers below.
function _dlSplitCsvLine(line) {
    var out = [], cur = '', inQuotes = false;
    for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; }
                else inQuotes = false;
            } else cur += ch;
        } else if (ch === '"') inQuotes = true;
        else if (ch === ',') { out.push(cur); cur = ''; }
        else cur += ch;
    }
    out.push(cur);
    return out;
}

// ── Kite instrument master CSV fetch ────────────────────────────────────────
// Columns: instrument_token,exchange_token,tradingsymbol,name,last_price,expiry,
//          strike,tick_size,lot_size,instrument_type,segment,exchange
//
// Scans line-by-line via indexOf instead of text.split('\n') — reported failure: Kite
// Instruments (~10-15MB, 100K+ rows) silently fails to load on a memory-constrained phone
// (Moto G) while the much smaller NSE Strike Intervals CSV loads fine on the same device —
// consistent with a memory/OOM issue during parsing, not a network or GM_xmlhttpRequest
// problem. split('\n') allocates one big array holding 100K+ separate line-strings, all
// alive in memory simultaneously ALONGSIDE the original multi-MB response string, before
// any of them can be garbage-collected — roughly double the peak memory this doesn't need.
// Scanning with indexOf('\n', pos) only ever holds the current line's substring at a time.
function _dlParseInstrumentsCsv(text) {
    var out = [];
    var pos = text.indexOf('\n') + 1; // skip header row (indexOf returns -1 if absent -> pos=0, harmless)
    var len = text.length;
    while (pos < len) {
        var nl = text.indexOf('\n', pos);
        var end = nl === -1 ? len : nl;
        var line = text.slice(pos, end);
        pos = end + 1;
        if (!line || !line.trim()) continue;
        var c = _dlSplitCsvLine(line);
        if (c.length < 12) continue;
        out.push({
            token: parseInt(c[0], 10),
            tradingsymbol: c[2],
            name: c[3],
            expiry: c[5] || null,
            strike: c[6] ? parseFloat(c[6]) : null,
            lot_size: c[8] ? parseInt(c[8], 10) : null,
            instrument_type: c[9],
            segment: c[10],
            exchange: c[11] ? c[11].trim() : '',
        });
    }
    return out;
}

// Wraps a GM_xmlhttpRequest-backed promise with a manual watchdog timer — reported failure
// mode on mobile Tampermonkey ports (Kiwi Browser's extension, iOS "Userscripts", etc.):
// the request silently never completes at all — no onload, no onerror, no ontimeout — most
// likely because the extension's background/service-worker context gets suspended by the
// mobile OS partway through a large (~10-15MB) response, dropping the callback outright.
// GM_xmlhttpRequest's own `timeout` option is ALSO set below so `ontimeout` fires where the
// engine actually honors it, but this is the fallback for engines that don't even do that —
// it's the difference between "stuck on Loading… forever with no feedback" (the reported
// bug) and an actual visible error the user can act on.
function _dlWithWatchdog(promise, ms, label) {
    var timer;
    var watchdog = new Promise(function (_, reject) {
        timer = setTimeout(function () {
            reject((label || 'Request') + ' produced no response after ' + Math.round(ms / 1000) + 's — GM_xmlhttpRequest may be silently stalling on this browser/device (seen on some mobile Tampermonkey ports). Try again, or check the network tab / extension logs.');
        }, ms);
    });
    return Promise.race([promise, watchdog]).finally(function () { clearTimeout(timer); });
}

function _dlFetchKiteInstruments() {
    var apiKey = g_config.get('api_key');
    var accessToken = g_config.get('api_access_token');
    var req = new Promise(function (resolve, reject) {
        if (!accessToken) { reject('No Access Token set — open Settings and set api_access_token'); return; }
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://api.kite.trade/instruments',
            headers: { 'Authorization': 'token ' + apiKey + ':' + accessToken },
            timeout: 45000,
            onload: function (res) {
                _dlSetProgress('Response received — HTTP ' + res.status + ', ' + (res.responseText ? res.responseText.length.toLocaleString() : 0) + ' chars. Parsing…');
                if (res.status !== 200) { reject('HTTP ' + res.status + ' — check API Key/Access Token in Settings'); return; }
                try { resolve(_dlParseInstrumentsCsv(res.responseText)); }
                catch (e) { reject('Failed to parse instruments CSV: ' + e.message); }
            },
            onerror: function (e) { reject('Request failed (network error or CORS still blocked)' + (e && e.error ? ' — ' + e.error : '')); },
            ontimeout: function () { reject('Request timed out'); },
            onprogress: function (e) {
                if (e && e.lengthComputable) _dlSetProgress('Downloading… ' + (e.loaded / 1048576).toFixed(1) + 'MB' + (e.total ? ' / ' + (e.total / 1048576).toFixed(1) + 'MB' : ''));
                else if (e) _dlSetProgress('Downloading… ' + (e.loaded / 1048576).toFixed(1) + 'MB');
            },
        });
    });
    return _dlWithWatchdog(req, 60000, 'Kite Instruments fetch');
}

// On-screen diagnostic — console.log is useless here (reported: no devtools access on
// mobile Edge/Android where this whole investigation started), so every step of the load
// writes directly into the visible #dl-instr-sub line instead. This is the only way to see
// WHERE it's actually failing (never starts downloading? downloads but never finishes?
// downloads fully but crashes on parse?) without remote debugging tools.
function _dlSetProgress(msg) {
    try { jQ('#dl-instr-sub').text(msg); } catch (e) {}
}

// ── NSE strike-interval CSV fetch (NSE_FO_SosScheme.csv) ───────────────────
// Row format (skip date row + header row): Symbol, Month type, Symbol Type, Step Value, ...
// NSE lists MULTIPLE rows per (symbol, month type) — one per "Symbol Type" — so a
// symbol's real step range for a month is MIN..MAX across all its rows, not just
// whichever row happened to appear last (matches groot-platform's proven backend SQL).
function _dlParseStrikeCsv(text) {
    var lines = text.split('\n');
    var out = {};
    for (var i = 2; i < lines.length; i++) {
        var line = lines[i];
        if (!line || !line.trim()) continue;
        var c = _dlSplitCsvLine(line);
        if (c.length < 4) continue;
        var symbol = c[0].trim(), monthType = c[1].trim(), step = parseFloat(c[3]);
        if (!symbol || !monthType || isNaN(step)) continue;
        if (!out[symbol]) out[symbol] = {};
        if (!out[symbol][monthType]) out[symbol][monthType] = [];
        out[symbol][monthType].push(step);
    }
    return out;
}

// symbol -> "min,max" (or just "min" if min===max) for one month type — the exact
// format NSE_STRIKE_DIFF/NSE_FUTURE_STRIKE_DIFF in constants.js already use.
function _dlStrikeDiffString(steps) {
    if (!steps || !steps.length) return null;
    var min = Math.min.apply(null, steps), max = Math.max.apply(null, steps);
    return (min === max) ? String(min) : (min + ',' + max);
}

// Picks the nearest available month for a symbol's entry — prefers M1, but falls back to
// M2/M3 or WHATEVER month-type key NSE's CSV actually used if it turns out not to be
// exactly "M1" (never independently verified against real data — the derived tabs were
// previously hard-requiring .M1 specifically, which silently returned nothing for every
// symbol if the real key differs even slightly, e.g. casing/whitespace/a different label).
// Returns { month, diff } or null.
function _dlBestStrikeDiff(entry) {
    if (!entry) return null;
    var order = ['M1', 'M2', 'M3'].concat(Object.keys(entry).filter(function (k) { return k !== 'M1' && k !== 'M2' && k !== 'M3'; }));
    for (var i = 0; i < order.length; i++) {
        var diff = _dlStrikeDiffString(entry[order[i]]);
        if (diff) return { month: order[i], diff: diff };
    }
    return null;
}

function _dlFetchStrikeIntervals() {
    var req = new Promise(function (resolve, reject) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://nsearchives.nseindia.com/content/fo/NSE_FO_SosScheme.csv',
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
            timeout: 45000,
            onload: function (res) {
                if (res.status !== 200) { reject('HTTP ' + res.status); return; }
                try { resolve(_dlParseStrikeCsv(res.responseText)); }
                catch (e) { reject('Failed to parse strike CSV: ' + e.message); }
            },
            onerror: function () { reject('Request failed (network error or CORS still blocked)'); },
            ontimeout: function () { reject('Request timed out'); },
        });
    });
    return _dlWithWatchdog(req, 60000, 'Strike Intervals fetch');
}

// ── Popup shell — tab layout (Kite Instruments | Strike Intervals) ─────────────
function _dlShowPopup() {
    var html = '<div class="dl-wrap dl-wrap-tabs">'
        + '<div class="dl-tabs">'
        +   '<button class="dl-tab dl-tab-active" data-dltab="instr"><i class="bi bi-hdd-fill"></i> Kite Instruments</button>'
        +   '<button class="dl-tab" data-dltab="strike"><i class="bi bi-rulers"></i> Strike Intervals</button>'
        +   '<button class="dl-tab" data-dltab="fotokens"><i class="bi bi-key-fill"></i> F&amp;O + Tokens</button>'
        +   '<button class="dl-tab" data-dltab="fofutures"><i class="bi bi-calendar3"></i> F&amp;O Futures</button>'
        +   '<button class="dl-tab" data-dltab="fostrikediff"><i class="bi bi-arrows-vertical"></i> F&amp;O + Strike Diff</button>'
        +   '<button class="dl-tab" data-dltab="constlists"><i class="bi bi-bookmarks-fill"></i> Constant Lists</button>'
        +   '<button class="dl-tab" data-dltab="rawglobals"><i class="bi bi-braces"></i> Raw Globals</button>'
        +   '<button id="dl-clear-cache" class="dl-clear-btn" type="button" title="Wipe IndexedDB/localStorage cache and reset FO_LIST/NSE_STRIKE_DIFF/INSTRUMENT_TOKENS/FUTURE_INTRUMENT_LIST back to empty"><i class="bi bi-trash-fill"></i> Clear Cache</button>'
        + '</div>'
        + '<div id="dl-panel-instr" class="dl-panel dl-panel-active">'
        +   '<div class="dl-row">'
        +     '<div class="dl-row-info"><b>Sync + cache in browser (IndexedDB)</b>'
        +       '<div id="dl-instr-sub" class="dl-row-sub">' + _dlInstrSubText() + '</div></div>'
        +     '<button id="dl-instr-load" class="sv-load-btn"><i class="bi bi-cloud-download"></i> Load</button>'
        +   '</div>'
        +   '<input type="text" id="dl-instr-search" class="dl-search" placeholder="Search cached instruments…" style="display:none;">'
        +   '<div id="dl-instr-table"></div>'
        + '</div>'
        + '<div id="dl-panel-strike" class="dl-panel">'
        +   '<div class="dl-row">'
        +     '<div class="dl-row-info"><b>Sync NSE_FO_SosScheme.csv</b>'
        +       '<div id="dl-strike-sub" class="dl-row-sub">' + _dlStrikeSubText() + '</div></div>'
        +     '<button id="dl-strike-load" class="sv-load-btn"><i class="bi bi-cloud-download"></i> Load</button>'
        +   '</div>'
        +   '<input type="text" id="dl-strike-search" class="dl-search" placeholder="Search strike intervals…" style="display:none;">'
        +   '<div id="dl-strike-table"></div>'
        + '</div>'
        + '<div id="dl-panel-fotokens" class="dl-panel">'
        +   '<div class="dl-derived-hint">F&amp;O stock list cross-referenced against the Kite Instruments tab\'s NSE cash-market tokens. Needs both tabs loaded.</div>'
        +   '<input type="text" id="dl-fotokens-search" class="dl-search" placeholder="Search…">'
        +   '<div id="dl-fotokens-table"></div>'
        + '</div>'
        + '<div id="dl-panel-fofutures" class="dl-panel">'
        +   '<div class="dl-derived-hint">Nearest-expiry NFO futures contract per F&amp;O stock, from the Kite Instruments tab\'s cache. Needs both tabs loaded.</div>'
        +   '<input type="text" id="dl-fofutures-search" class="dl-search" placeholder="Search…">'
        +   '<div id="dl-fofutures-table"></div>'
        + '</div>'
        + '<div id="dl-panel-fostrikediff" class="dl-panel">'
        +   '<div class="dl-derived-hint">F&amp;O stock list with its M1 strike-diff value (the same NSE_STRIKE_DIFF format). Needs Strike Intervals loaded.</div>'
        +   '<input type="text" id="dl-fostrikediff-search" class="dl-search" placeholder="Search…">'
        +   '<div id="dl-fostrikediff-table"></div>'
        + '</div>'
        + '<div id="dl-panel-constlists" class="dl-panel">'
        +   '<div class="dl-derived-hint">Read-only view of the existing NIFTY_50_LIST / NIFTY_BANK_LIST / INDICES / WEIGHTED_STOCKS globals (constants.js) — shown as-is, nothing here is fetched or modified.</div>'
        +   '<div id="dl-constlists-table"></div>'
        + '</div>'
        + '<div id="dl-panel-rawglobals" class="dl-panel"></div>'
        + '</div>';

    showPopUpWindow('data-load-popup', html, 'Data Load', 820, 660);
    var cls = 'popup-custom-style-data-load-popup';
    var title = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<i class="bi bi-hdd-fill"></i><span style="font-weight:800;font-size:0.7rem;">DATA LOAD</span>'
        + popupWinControls(cls)
        + '</div>';
    jQ('.' + cls).find('.popupwindow_titlebar_text').html(title);
    hideNativePopupButtons(cls);
    jQ('.' + cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
    jQ('.' + cls).find('.popupwindow_content').css({ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '0' });
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');

    // Restore whatever's already cached, without requiring another Load click.
    _dlGetAllInstruments().then(function (rows) { if (rows && rows.length) { _DL_INSTRUMENTS = rows; _dlRenderInstrTable(); } }).catch(function () {});
    var cachedStrikes = _dlLoadCachedStrikes();
    if (cachedStrikes) { _DL_STRIKES = cachedStrikes; _dlRenderStrikeTable(); }
}

var _DL_DERIVED_RENDERERS = {
    fotokens: function () { _dlRenderFoTokensTable(); },
    fofutures: function () { _dlRenderFoFuturesTable(); },
    fostrikediff: function () { _dlRenderFoStrikeDiffTable(); },
    constlists: function () { _dlRenderConstListsTable(); },
    rawglobals: function () { _dlRenderRawGlobalsTab(); },
};
jQ(document).on('click', '.dl-tab', function () {
    var tab = jQ(this).attr('data-dltab');
    jQ('.dl-tab').removeClass('dl-tab-active');
    jQ(this).addClass('dl-tab-active');
    jQ('.dl-panel').removeClass('dl-panel-active');
    jQ('#dl-panel-' + tab).addClass('dl-panel-active');
    // Re-render derived tabs on every activation (not cached at build time) — cheap, pure
    // in-memory computation, and picks up any Load that happened since the tab was last open.
    if (_DL_DERIVED_RENDERERS[tab]) _DL_DERIVED_RENDERERS[tab]();
});

// ── Clear Cache — wipes IndexedDB + localStorage, resets in-memory state, and puts every
// derived global (FO_LIST/NSE_STRIKE_DIFF/NSE_FUTURE_STRIKE_DIFF/INSTRUMENT_TOKENS/
// FUTURE_INTRUMENT_LIST) back to empty, exactly as they start in constants.js. Does NOT
// touch INDEX_NSE_STRIKE_DIFF/FUTURE_INDEX_NSE_STRIKE_DIFF (those are the hand-maintained
// index constants, not cache) or anything outside this file's own scope.
// NSE_OPTION_STRIKE_LIST/OPTION_STRIKE_LIST are deliberately left alone here — unlike the
// others, their ~2MB hardcoded fallback (optionStrike.js) only exists in memory as the
// ORIGINAL value of that same variable; once _dlRecomputeDerivedGlobals() overwrites it,
// there's no other reference left to restore from in-session. If you need those back to
// the hardcoded literal, reload the page instead of relying on this button.
jQ(document).on('click', '#dl-clear-cache', function () {
    var $btn = jQ(this).prop('disabled', true);
    _dlClearInstrumentsDb().catch(function () {}).finally(function () {
        localStorage.removeItem('DL_INSTRUMENTS_CACHED_AT');
        localStorage.removeItem('DL_STRIKE_INTERVALS');
        localStorage.removeItem('DL_STRIKES_CACHED_AT');
        _DL_INSTRUMENTS = [];
        _DL_STRIKES = null;

        FO_LIST = [];
        NSE_STRIKE_DIFF = {};
        NSE_FUTURE_STRIKE_DIFF = {};
        INSTRUMENT_TOKENS = {};
        FUTURE_INTRUMENT_LIST = [];

        jQ('#dl-instr-sub').text(_dlInstrSubText());
        jQ('#dl-strike-sub').text(_dlStrikeSubText());
        jQ('#dl-instr-table, #dl-strike-table').empty();
        jQ('#dl-instr-search, #dl-strike-search').val('').hide();
        var activeTab = jQ('.dl-tab.dl-tab-active').attr('data-dltab');
        if (_DL_DERIVED_RENDERERS[activeTab]) _DL_DERIVED_RENDERERS[activeTab]();

        $btn.prop('disabled', false);
        console.log('[dataLoad] cache cleared — FO_LIST/NSE_STRIKE_DIFF/NSE_FUTURE_STRIKE_DIFF/INSTRUMENT_TOKENS/FUTURE_INTRUMENT_LIST reset to empty (OPTION_STRIKE_LIST untouched — reload the page to restore its hardcoded fallback if it was already overwritten)');
        _gtbToast('Data Load cache cleared — reload both tabs to repopulate', 'success');
    });
});

function _dlInstrSubText() {
    var at = localStorage.getItem('DL_INSTRUMENTS_CACHED_AT');
    return at ? ('Cached · last loaded ' + new Date(at).toLocaleString()) : 'Not loaded into this browser yet';
}
function _dlStrikeSubText() {
    var at = localStorage.getItem('DL_STRIKES_CACHED_AT');
    return at ? ('Cached · last loaded ' + new Date(at).toLocaleString()) : 'Not loaded into this browser yet';
}
function _dlLoadCachedStrikes() {
    try { return JSON.parse(localStorage.getItem('DL_STRIKE_INTERVALS') || 'null'); } catch (e) { return null; }
}

var _DL_INSTRUMENTS = [];
var _DL_STRIKES = null;

jQ(document).on('click', '#dl-instr-load', function () {
    var $btn = jQ(this).prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Loading…');
    // Every step writes to the visible #dl-instr-sub line — no console.log reliance (no
    // devtools access on mobile Edge/Android, where "click Load, button just re-enables,
    // no message at all" was reported). This is the only way to see WHERE it actually
    // fails: never starts? downloads but never finishes? downloads fully but crashes on
    // parse/IndexedDB write? Each is a different root cause needing a different fix.
    _dlSetProgress('Starting request…');
    _dlFetchKiteInstruments().then(function (rows) {
        _dlSetProgress('Parsed ' + rows.length.toLocaleString() + ' rows — writing to IndexedDB…');
        return _dlPutInstruments(rows).then(function () {
            _DL_INSTRUMENTS = rows;
            jQ('#dl-instr-sub').text(rows.length.toLocaleString() + ' instruments — ' + _dlInstrSubText());
            _dlRenderInstrTable();
            _dlRecomputeDerivedGlobals();
            _gtbToast('Kite instruments loaded (' + rows.length.toLocaleString() + ' rows)', 'success');
        });
    }).catch(function (err) {
        // Written to the same visible line the progress updates used, so this survives
        // even if the toast library itself fails to render on this device/viewport.
        var msg = 'FAILED: ' + err;
        _dlSetProgress(msg);
        try { _gtbToast('Instrument load failed: ' + err, 'error'); } catch (toastErr) {}
    }).finally(function () {
        $btn.prop('disabled', false).html('<i class="bi bi-cloud-download"></i> Load');
    });
});

jQ(document).on('click', '#dl-strike-load', function () {
    var $btn = jQ(this).prop('disabled', true).html('<i class="bi bi-hourglass-split"></i> Loading…');
    _dlFetchStrikeIntervals().then(function (map) {
        _DL_STRIKES = map;
        localStorage.setItem('DL_STRIKE_INTERVALS', JSON.stringify(map));
        localStorage.setItem('DL_STRIKES_CACHED_AT', new Date().toISOString());
        jQ('#dl-strike-sub').text(Object.keys(map).length + ' symbols — ' + _dlStrikeSubText());
        _dlRenderStrikeTable();
        // FO_LIST (constants.js, `let`) reassigned in place — replaces the old hand-typed
        // literal with the live symbol list. See the file header for why this is the one
        // and only global this file touches.
        FO_LIST = _dlFoStockSymbols();
        _dlRecomputeDerivedGlobals();
        _gtbToast('Strike intervals loaded (' + Object.keys(map).length + ' symbols) — FO_LIST updated (' + FO_LIST.length + ' symbols)', 'success');
        // Diagnostic: confirms the actual month-type labels NSE's CSV used, in case they
        // ever turn out not to be exactly "M1"/"M2"/"M3" (the F&O + Strike Diff tab falls
        // back across whatever keys are actually present either way — see _dlBestStrikeDiff).
        var monthKeys = {};
        Object.keys(map).forEach(function (s) { Object.keys(map[s]).forEach(function (m) { monthKeys[m] = true; }); });
        console.log('[dataLoad] month-type keys found in NSE_FO_SosScheme.csv:', Object.keys(monthKeys));
    }).catch(function (err) {
        _gtbToast('Strike interval load failed: ' + err, 'error');
    }).finally(function () {
        $btn.prop('disabled', false).html('<i class="bi bi-cloud-download"></i> Load');
    });
});

function _dlRenderInstrTable(filter) {
    jQ('#dl-instr-search').show();
    var q = (filter || jQ('#dl-instr-search').val() || '').trim().toUpperCase();
    var rows = q
        ? _DL_INSTRUMENTS.filter(function (r) { return r.tradingsymbol.indexOf(q) !== -1 || (r.name || '').toUpperCase().indexOf(q) !== -1; })
        : _DL_INSTRUMENTS;
    var shown = rows.slice(0, 300);
    var html = '<div class="dl-table">'
        + '<div class="dl-table-head"><span>Symbol</span><span>Name</span><span>Exch</span><span>Type</span><span>Expiry</span><span>Strike</span></div>'
        + '<div class="dl-table-body">'
        + shown.map(function (r) {
            return '<div class="dl-table-row"><span class="dl-cell-strong">' + r.tradingsymbol + '</span><span class="dl-cell-muted">' + (r.name || '—') + '</span>'
                + '<span class="dl-cell-muted">' + (r.exchange || '—') + '</span><span class="dl-cell-muted">' + (r.instrument_type || '—') + '</span>'
                + '<span class="dl-cell-muted">' + (r.expiry || '—') + '</span><span class="dl-cell-muted">' + (r.strike || '—') + '</span></div>';
        }).join('')
        + '</div>'
        + (rows.length > shown.length ? '<div class="dl-table-more">Showing ' + shown.length + ' of ' + rows.length.toLocaleString() + ' matches — narrow the search to see more.</div>' : '')
        + '</div>';
    jQ('#dl-instr-table').html(html);
}
jQ(document).on('input', '#dl-instr-search', function () { _dlRenderInstrTable(jQ(this).val()); });

function _dlRenderStrikeTable(filter) {
    jQ('#dl-strike-search').show();
    if (!_DL_STRIKES) return;
    var q = (filter || jQ('#dl-strike-search').val() || '').trim().toUpperCase();
    var symbols = Object.keys(_DL_STRIKES).sort();
    if (q) symbols = symbols.filter(function (s) { return s.indexOf(q) !== -1; });
    var shown = symbols.slice(0, 300);
    var html = '<div class="dl-table dl-table-4col">'
        + '<div class="dl-table-head"><span>Symbol</span><span>M1</span><span>M2</span><span>M3</span></div>'
        + '<div class="dl-table-body">'
        + shown.map(function (s) {
            var m = _DL_STRIKES[s];
            return '<div class="dl-table-row dl-table-row-4col"><span class="dl-cell-strong">' + s + '</span><span class="dl-cell-muted">' + (_dlStrikeDiffString(m.M1) || '—') + '</span>'
                + '<span class="dl-cell-muted">' + (_dlStrikeDiffString(m.M2) || '—') + '</span><span class="dl-cell-muted">' + (_dlStrikeDiffString(m.M3) || '—') + '</span></div>';
        }).join('')
        + '</div>'
        + (symbols.length > shown.length ? '<div class="dl-table-more">Showing ' + shown.length + ' of ' + symbols.length + ' matches — narrow the search to see more.</div>' : '')
        + '</div>';
    jQ('#dl-strike-table').html(html);
}
jQ(document).on('input', '#dl-strike-search', function () { _dlRenderStrikeTable(jQ(this).val()); });

// ── Derived tabs (F&O + Tokens / F&O Futures / F&O + Strike Diff) ──────────────────────
// The tables themselves are pure, read-only computations over _DL_INSTRUMENTS /
// _DL_STRIKES already sitting in memory — no new network calls. FO_LIST/NSE_STRIKE_DIFF/
// NSE_FUTURE_STRIKE_DIFF/INSTRUMENT_TOKENS/FUTURE_INTRUMENT_LIST ARE now written from
// this same data (see _dlRecomputeDerivedGlobals below) — but scoped to F&O stocks +
// indices only. A prior version merged the ENTIRE NSE cash-market instrument list into
// INSTRUMENT_TOKENS and silently broke "Load Prices" by ballooning it to thousands of
// entries; every derivation below is filtered against the F&O symbol list specifically to
// never repeat that.
var _DL_INDEX_CODES = { 'NIFTY': 1, 'BANKNIFTY': 1, 'FINNIFTY': 1, 'MIDCPNIFTY': 1, 'SENSEX': 1, 'BANKEX': 1 };
// MCX (+ USDINR on CDS) commodities tracked by the Commodities popup / _gtb MCX helpers —
// same underlying-name convention Kite's own dump uses (raw code === this app's name for
// MCX, unlike NSE indices which need _DL_INDEX_NAME_TO_DISPLAY).
var _DL_MCX_COMMODITIES = {
    'CRUDEOIL': 1, 'CRUDEOILM': 1, 'GOLD': 1, 'GOLDM': 1, 'SILVER': 1, 'SILVERM': 1,
    'ZINC': 1, 'COPPER': 1, 'NATURALGAS': 1, 'NATGASMINI': 1, 'USDINR': 1,
};
// Kite's own underlying-name convention (OPTION_STRIKE_LIST/FUTURE_INTRUMENT_LIST) ->
// this app's display names — same mapping convention as optionStrikeSearch.js/backtest.js.
var _DL_INDEX_NAME_TO_DISPLAY = { 'NIFTY': 'NIFTY 50', 'BANKNIFTY': 'NIFTY BANK', 'FINNIFTY': 'NIFTY FIN SERVICE', 'MIDCPNIFTY': 'NIFTY MID SELECT', 'SENSEX': 'SENSEX', 'BANKEX': 'BANKEX' };

// Sorted list of F&O stock symbols — indices excluded, that's the only requirement.
// Deliberately does NOT require a resolvable strike-diff value: that's only relevant to
// the F&O + Strike Diff tab's own display column (which shows "—" gracefully when a
// symbol's diff can't be resolved), not to whether a symbol counts as an F&O stock at
// all — the F&O Stocks and F&O + Tokens tabs don't use the diff value, so gating the
// shared symbol list on it excluded valid symbols from tabs that never needed it.
function _dlFoStockSymbols() {
    if (!_DL_STRIKES) return [];
    return Object.keys(_DL_STRIKES)
        .filter(function (s) { return !_DL_INDEX_CODES[s]; })
        .sort();
}

// F&O stock symbols derived directly from the Kite Instruments dump itself (any NFO FUT
// underlying, indices excluded) — NOT from the Strike Intervals CSV. Confirmed live bug:
// COFORGE (a real, currently-traded F&O stock) had zero OI/OBV/Futures data in the
// Instrument Detail View — INSTRUMENT_TOKENS/FUTURE_INTRUMENT_LIST/OPTION_STRIKE_LIST were
// all gated on _dlFoStockSymbols() (Strike Intervals CSV membership), so any symbol
// missing/mismatched in that separate NSE_FO_SosScheme.csv silently lost its entire
// futures/options pipeline even though Kite's own dump clearly has real NFO contracts for
// it. Strike Intervals is still the only source for the actual strike-diff VALUE
// (NSE_STRIKE_DIFF), but "is this symbol F&O at all" should come from Kite's own dump,
// which is authoritative and doesn't depend on a secondary external file matching exactly.
function _dlFoStockSymbolsFromInstruments() {
    if (!_DL_INSTRUMENTS.length) return [];
    var seen = {};
    _DL_INSTRUMENTS.forEach(function (r) {
        if (r.instrument_type !== 'FUT' || r.exchange !== 'NFO' || !r.name) return;
        if (_DL_INDEX_CODES[r.name]) return;
        seen[r.name] = true;
    });
    return Object.keys(seen).sort();
}

// Picks the earliest expiry that hasn't already passed, from a sorted (ascending) array of
// ISO "YYYY-MM-DD" strings. Kite's instrument dump can still list a contract on/after its
// own expiry date until end-of-day settlement finishes, so plain expiries[0] can silently
// resolve to an already-expired contract (confirmed live: USDINR showing "EXPIRED" in the
// Constant Lists expiry check) instead of the next live one. Falls back to expiries[0] only
// if every listed expiry has already passed (better to show something than nothing).
function _dlNearestLiveExpiry(expiries) {
    var today = moment().format('YYYY-MM-DD');
    for (var i = 0; i < expiries.length; i++) {
        if (expiries[i] >= today) return expiries[i];
    }
    return expiries[0];
}

// Shared expiry resolution for OPTION_STRIKE_LIST/NSE_OPTION_STRIKE_LIST entries — used by
// both oiAnalyzer.js's showTrendingOI (the real OI/OBV pipeline) and the Raw Globals viewer,
// so the two never drift into picking different expiries for the same name. `configured` is
// whatever Settings field applies to this name (NIFTY_EXPIRY_DATE/SENSEX_EXPIRY_DATE/
// BANKNIFTY_EXPIRY_DATE/FO_STOCKS_OPTION_EXPIRY_DATE) — falls back to that name's own
// nearest live expiry when blank or when the configured date isn't actually one of this
// name's real expiries (e.g. a stale pick from a month that's rolled off).
function _dlResolveExpiryFor(configured, availableExpiriesISO) {
    if (configured && availableExpiriesISO.indexOf(configured) !== -1) return configured;
    return _dlNearestLiveExpiry(availableExpiriesISO);
}
// kind: 'fut' (default) or 'opt'. MCX commodities can have GENUINELY DIFFERENT expiry
// calendars for futures vs options (confirmed live: SILVER's nearest futures expiry was
// 2026-12-04, nearest options expiry 2026-09-12) — a single shared setting can't represent
// both correctly at once, which is exactly what produced a mostly-empty/thin options chain
// (the futures date, saved because it was the only thing offered at the time, happened to
// also match a real-but-inactive far-dated options expiry, so it got honored over the
// actually-active near-month one). NSE names (NIFTY/SENSEX/BANKNIFTY/F&O stocks) only ever
// had one expiry concept to begin with, so `kind` has no effect on them.
function _dlConfiguredExpiryForName(name, kind) {
    if (name === 'NIFTY')     return (typeof NIFTY_EXPIRY_DATE !== 'undefined' ? NIFTY_EXPIRY_DATE : '') || '';
    if (name === 'SENSEX')    return (typeof SENSEX_EXPIRY_DATE !== 'undefined' ? SENSEX_EXPIRY_DATE : '') || '';
    if (name === 'BANKNIFTY') return (typeof BANKNIFTY_EXPIRY_DATE !== 'undefined' ? BANKNIFTY_EXPIRY_DATE : '') || '';
    // MCX commodities each have their own mcx_expiry_<name> Settings field for futures
    // (per-commodity, not shared — see config.js's _CFG_MCX_EXPIRY_PARAMS comment for why:
    // unlike NSE, each MCX commodity rolls independently, so nearest-by-date alone isn't
    // reliable) and a SEPARATE mcx_opt_expiry_<name> field for options. The options field is
    // deliberately left to fall back to nearest-live (via _dlResolveExpiryFor, when this
    // returns '') rather than defaulting to the futures field's value — falling back to that
    // would silently reintroduce the exact bug this split fixes for anyone who already has a
    // futures-only date saved from before this field existed.
    if (typeof _DL_MCX_COMMODITIES !== 'undefined' && _DL_MCX_COMMODITIES[name]) {
        var field = (kind === 'opt') ? ('mcx_opt_expiry_' + name.toLowerCase()) : ('mcx_expiry_' + name.toLowerCase());
        try { return (typeof g_config !== 'undefined' ? (g_config.get(field) || '') : '').trim(); } catch (e) { return ''; }
    }
    return (typeof FO_STOCKS_OPTION_EXPIRY_DATE !== 'undefined' ? FO_STOCKS_OPTION_EXPIRY_DATE : '') || '';
}

// Kite's raw instruments CSV gives expiry as ISO ("YYYY-MM-DD"), but every consumer of
// FUTURE_INTRUMENT_LIST/OPTION_STRIKE_LIST (e.g. oiAnalyzer.js's showTrendingOI, which
// does moment(item.expiry, 'DD-MM-YYYY') to compare against NIFTY_EXPIRY_DATE) expects
// "DD-MM-YYYY" — the same convention the original hand-generated literals used. Copying
// the raw ISO string straight through silently broke every expiry-date comparison
// downstream (the filter just never matched anything, so strike lists came back empty).
// Convert ONLY at final output — internal sorting/slicing above stays on the raw ISO
// string, since DD-MM-YYYY strings don't sort chronologically as plain strings.
function _dlToDDMMYYYY(isoDate) {
    if (!isoDate) return isoDate;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
    return m ? (m[3] + '-' + m[2] + '-' + m[1]) : isoDate;
}

// ── Recompute + reassign the live constants (constants.js, all `let`) ──────────────────
// Called after either Load succeeds, and once silently on page load if both are already
// cached. Each piece only runs once its OWN required cache is present — Strike Intervals
// alone is enough for NSE_STRIKE_DIFF/NSE_FUTURE_STRIKE_DIFF; INSTRUMENT_TOKENS/
// FUTURE_INTRUMENT_LIST additionally need Kite Instruments loaded, since they're built by
// cross-referencing the F&O symbol list against the instrument dump.
function _dlRecomputeDerivedGlobals() {
    var summary = [];

    // ── NSE_STRIKE_DIFF / NSE_FUTURE_STRIKE_DIFF: F&O stock diffs (from Strike Intervals)
    // + the hand-maintained index entries, merged. ─────────────────────────────────────
    if (_DL_STRIKES) {
        var stockDiff = {};
        _dlFoStockSymbols().forEach(function (s) {
            var best = _dlBestStrikeDiff(_DL_STRIKES[s]);
            if (best) stockDiff[s] = best.diff;
        });
        NSE_STRIKE_DIFF = Object.assign({}, stockDiff, (typeof INDEX_NSE_STRIKE_DIFF !== 'undefined') ? INDEX_NSE_STRIKE_DIFF : {});
        NSE_FUTURE_STRIKE_DIFF = Object.assign({}, stockDiff, (typeof FUTURE_INDEX_NSE_STRIKE_DIFF !== 'undefined') ? FUTURE_INDEX_NSE_STRIKE_DIFF : {});
        summary.push('NSE_STRIKE_DIFF/NSE_FUTURE_STRIKE_DIFF: ' + Object.keys(NSE_STRIKE_DIFF).length + ' symbols');
    }

    // ── INSTRUMENT_TOKENS / FUTURE_INTRUMENT_LIST / OPTION_STRIKE_LIST: only need the Kite
    // Instruments cache now — the F&O symbol list is derived straight from it
    // (_dlFoStockSymbolsFromInstruments), union'd with the Strike Intervals CSV's list
    // (_dlFoStockSymbols) when that's also loaded, so a symbol counts as F&O if EITHER
    // source says so rather than requiring both to agree on the exact same spelling. ────
    if (_DL_INSTRUMENTS.length) {
        var foSymbols = _dlFoStockSymbolsFromInstruments();
        var foSet = {}; foSymbols.forEach(function (s) { foSet[s] = true; });
        if (_DL_STRIKES) { _dlFoStockSymbols().forEach(function (s) { foSet[s] = true; }); }

        // Tokens: F&O stocks (NSE cash EQ) + ONLY this app's own known indices — NEVER
        // the full NSE cash-market instrument list (that was the earlier bug), and NOT
        // every segment==='INDICES' row either: Kite's dump tags dozens of sectoral/
        // thematic indices (NIFTY IT, NIFTY AUTO, NIFTY PSE, ...) with that same segment,
        // which is exactly what pulled INSTRUMENT_TOKENS up past the F&O stock count —
        // "segment is INDICES" was never a sufficient filter on its own.
        var indexNames = {};
        (typeof INDICES !== 'undefined' ? INDICES : []).forEach(function (n) { indexNames[n] = true; });
        var tokens = {};
        _DL_INSTRUMENTS.forEach(function (r) {
            if (r.exchange === 'NSE' && r.segment === 'NSE' && r.instrument_type === 'EQ' && foSet[r.tradingsymbol]) {
                tokens[r.tradingsymbol] = r.token;
            } else if (r.segment === 'INDICES' && indexNames[r.tradingsymbol]) {
                tokens[r.tradingsymbol] = r.token;
            }
        });
        INSTRUMENT_TOKENS = tokens;
        summary.push('INSTRUMENT_TOKENS: ' + Object.keys(tokens).length + ' entries');

        // Futures: one FUT contract per F&O stock/index. SENSEX/BANKEX trade on BFO, not
        // NFO — excluding BFO here was the reason they never got a futures/OI pipeline the
        // way NIFTY/BANK NIFTY did. FUTURE_EXPIRY_MONTH ("YYYY-MM") pins every underlying
        // to a specific expiry month at once (e.g. during rollover week); blank (default)
        // keeps nearest-expiry per underlying.
        // IMPORTANT: .name stays the RAW Kite underlying code ('NIFTY', 'BANKNIFTY'), NOT
        // the display name — matches the original hardcoded literal's own convention, and
        // every consumer (positionalScreener.js's _psFutEntryFor, etc.) maps display->raw
        // BEFORE searching .name, so storing the display name here would silently break
        // every index futures lookup.
        var expiryFilter = (typeof FUTURE_EXPIRY_MONTH !== 'undefined') ? FUTURE_EXPIRY_MONTH : '';
        var byNameExpiry = {};        // name -> { expiry(ISO): FUT record }
        var availMonths = {};         // flat set across everything — feeds the shared dropdown
        _DL_INSTRUMENTS.forEach(function (r) {
            if (r.instrument_type !== 'FUT' || !r.expiry) return;
            if (r.exchange !== 'NFO' && r.exchange !== 'BFO') return;
            var displayName = _DL_INDEX_NAME_TO_DISPLAY[r.name] || r.name;
            if (!foSet[displayName] && !_DL_INDEX_NAME_TO_DISPLAY[r.name]) return; // not an F&O stock or a mapped index
            if (!byNameExpiry[r.name]) byNameExpiry[r.name] = {};
            byNameExpiry[r.name][r.expiry] = r;
            availMonths[r.expiry.slice(0, 7)] = true;
        });
        try { localStorage.setItem('DL_AVAILABLE_EXPIRY_MONTHS', JSON.stringify(Object.keys(availMonths).sort())); } catch (e) {}

        var byName = {};
        Object.keys(byNameExpiry).forEach(function (n) {
            var byExpiry = byNameExpiry[n];
            var expiries = Object.keys(byExpiry).sort(); // ISO strings sort chronologically
            if (expiryFilter) {
                var matchExpiry = expiries.filter(function (iso) { return iso.slice(0, 7) === expiryFilter; })[0];
                if (matchExpiry) { byName[n] = byExpiry[matchExpiry]; return; }
                // filter set but no matching contract this run — fall through to nearest
                // rather than dropping the underlying entirely
            }
            byName[n] = byExpiry[_dlNearestLiveExpiry(expiries)]; // nearest, excluding already-passed expiries
        });
        FUTURE_INTRUMENT_LIST = Object.keys(byName).sort().map(function (n) {
            var r = byName[n];
            return {
                strike: '0', name: n, instrument_token: String(r.token), tradingsymbol: r.tradingsymbol,
                lot_size: r.lot_size != null ? String(r.lot_size) : '', expiry: _dlToDDMMYYYY(r.expiry), instrument_type: 'FUT',
            };
        });
        summary.push('FUTURE_INTRUMENT_LIST: ' + FUTURE_INTRUMENT_LIST.length + ' contracts (NFO+BFO; shared filter/nearest)');

        // Full multi-expiry curve per underlying (all expiries, not just the resolved
        // "current" one above) — same raw byNameExpiry map used just above, keyed by DISPLAY
        // name so the UI can look it up the same way it looks up every other instrument
        // (e.g. 'NIFTY 50', not the raw Kite 'NIFTY'). Needed for curve-structure
        // (contango/backwardation) comparison, which needs the near AND next contract at once.
        try {
            var nseCurve = {};
            Object.keys(byNameExpiry).forEach(function (n) {
                var displayName = _DL_INDEX_NAME_TO_DISPLAY[n] || n;
                var byExpiry = byNameExpiry[n];
                nseCurve[displayName] = Object.keys(byExpiry).sort().map(function (exp) {
                    var r = byExpiry[exp];
                    return { expiry: exp, token: String(r.token), tradingsymbol: r.tradingsymbol,
                             lot_size: r.lot_size != null ? String(r.lot_size) : '' };
                });
            });
            NSE_FUT_CURVE = nseCurve;
            summary.push('NSE_FUT_CURVE: ' + Object.keys(nseCurve).length + ' underlyings (full multi-expiry curve)');
        } catch (eCurve2) {}

        // Options: EVERY CE/PE contract for F&O stocks + indices, ALL expiries kept —
        // unlike futures (one contract per underlying), OPTION_STRIKE_LIST is consumed by
        // code that does its OWN expiry filtering downstream (oiAnalyzer.js's
        // showTrendingOI, backtest.js, optionStrikeSearch.js all match against a specific
        // expiry AFTER pulling from this list) — dropping to nearest-expiry-only here
        // would break every one of those. Same raw-name convention as futures above.
        // SENSEX/BANKEX options are on BFO, not NFO — included for the same reason as futures.
        var options = [];
        // NIFTY/SENSEX's own OI pipeline (oiAnalyzer.js's showTrendingOI) doesn't pick an
        // options expiry itself — it filters OPTION_STRIKE_LIST down to whatever exact
        // date the pre-existing nifty_expiry_date/sensex_expiry_date settings hold
        // (config.js). Those were plain hand-typed "YYYY-MM-DD" text fields; cache the
        // real expiry dates actually present here so config.js can turn them into
        // dropdowns instead.
        var optionExpiryDatesByName = {};
        // Union of expiry dates seen across ALL F&O stock options (not indices) — one
        // shared dropdown for every stock, same convention as FUTURE_EXPIRY_MONTH (one
        // setting for all NSE/BSE futures) rather than ~190 individual per-stock fields.
        var stockOptionExpiryDates = {};
        // Index strike-diffs (ASO/AST/BSO/BST step size) — used to be 7 hand-typed constants
        // (INDEX_NSE_STRIKE_DIFF/FUTURE_INDEX_NSE_STRIKE_DIFF) because they weren't derivable
        // from the Strike Intervals CSV the same way stock diffs are. But 6 of the 7 have a
        // real NFO/BFO options chain right here in the Kite Instruments dump, so the gap
        // between consecutive strikes can be inferred the same way MCX_FUTURE_STRIKE_DIFF
        // already is below — GIFT NIFTY is the one exception (no NSE options chain at all)
        // and stays on its hardcoded fallback value.
        var idxOptByNameExpiry = {}; // raw index code -> { expiry(ISO): [CE/PE records] }
        _DL_INSTRUMENTS.forEach(function (r) {
            if ((r.instrument_type !== 'CE' && r.instrument_type !== 'PE') || !r.expiry) return;
            if (r.exchange !== 'NFO' && r.exchange !== 'BFO') return;
            var displayName = _DL_INDEX_NAME_TO_DISPLAY[r.name] || r.name;
            if (!foSet[displayName] && !_DL_INDEX_NAME_TO_DISPLAY[r.name]) return; // not an F&O stock or a mapped index
            if (r.name === 'NIFTY' || r.name === 'SENSEX' || r.name === 'BANKNIFTY') {
                if (!optionExpiryDatesByName[r.name]) optionExpiryDatesByName[r.name] = {};
                optionExpiryDatesByName[r.name][r.expiry] = true; // ISO = YYYY-MM-DD, same format nifty/sensex/banknifty_expiry_date already uses
            } else if (foSet[displayName]) {
                stockOptionExpiryDates[r.expiry] = true;
            }
            if (_DL_INDEX_NAME_TO_DISPLAY[r.name]) {
                if (!idxOptByNameExpiry[r.name]) idxOptByNameExpiry[r.name] = {};
                if (!idxOptByNameExpiry[r.name][r.expiry]) idxOptByNameExpiry[r.name][r.expiry] = [];
                idxOptByNameExpiry[r.name][r.expiry].push(r);
            }
            options.push({
                strike: r.strike != null ? String(r.strike) : '0', name: r.name,
                instrument_token: String(r.token), tradingsymbol: r.tradingsymbol,
                lot_size: r.lot_size != null ? String(r.lot_size) : '', expiry: _dlToDDMMYYYY(r.expiry), instrument_type: r.instrument_type,
            });
        });
        NSE_OPTION_STRIKE_LIST = options;
        OPTION_STRIKE_LIST = options; // the actual binding every consumer reads (config.js's one-time `= NSE_OPTION_STRIKE_LIST` alias doesn't auto-track later reassignment)
        summary.push('OPTION_STRIKE_LIST: ' + options.length.toLocaleString() + ' contracts (all expiries)');
        try {
            var optionExpiryOut = {};
            Object.keys(optionExpiryDatesByName).forEach(function (n) { optionExpiryOut[n] = Object.keys(optionExpiryDatesByName[n]).sort(); });
            localStorage.setItem('DL_NSE_OPTION_EXPIRY_DATES', JSON.stringify(optionExpiryOut));
            localStorage.setItem('DL_FO_STOCK_OPTION_EXPIRY_DATES', JSON.stringify(Object.keys(stockOptionExpiryDates).sort()));
        } catch (e) {}

        var idxDiff = {};
        Object.keys(idxOptByNameExpiry).forEach(function (rawName) {
            var displayName = _DL_INDEX_NAME_TO_DISPLAY[rawName];
            var expiries = Object.keys(idxOptByNameExpiry[rawName]).sort(); // ISO strings sort chronologically
            var nearestExpiry = _dlNearestLiveExpiry(expiries);
            var recs = idxOptByNameExpiry[rawName][nearestExpiry];
            var strikes = Array.from(new Set(recs.map(function (r) { return r.strike; }).filter(function (s) { return s != null; })))
                .sort(function (a, b) { return a - b; });
            if (strikes.length > 1) {
                var gapCounts = {};
                for (var i = 1; i < strikes.length; i++) {
                    var g = Math.round((strikes[i] - strikes[i - 1]) * 100) / 100;
                    if (g > 0) gapCounts[g] = (gapCounts[g] || 0) + 1;
                }
                var bestGap = null, bestCount = 0;
                Object.keys(gapCounts).forEach(function (g) { if (gapCounts[g] > bestCount) { bestCount = gapCounts[g]; bestGap = g; } });
                if (bestGap) idxDiff[displayName] = bestGap + ',' + bestGap;
            }
        });
        if (Object.keys(idxDiff).length) {
            // Derived values win; the hand-typed constants only survive for GIFT NIFTY (no
            // NSE options chain to derive from) or anything else this run couldn't resolve.
            INDEX_NSE_STRIKE_DIFF = Object.assign({}, (typeof INDEX_NSE_STRIKE_DIFF !== 'undefined') ? INDEX_NSE_STRIKE_DIFF : {}, idxDiff);
            FUTURE_INDEX_NSE_STRIKE_DIFF = Object.assign({}, (typeof FUTURE_INDEX_NSE_STRIKE_DIFF !== 'undefined') ? FUTURE_INDEX_NSE_STRIKE_DIFF : {}, idxDiff);
            NSE_STRIKE_DIFF = Object.assign({}, NSE_STRIKE_DIFF, idxDiff);
            NSE_FUTURE_STRIKE_DIFF = Object.assign({}, NSE_FUTURE_STRIKE_DIFF, idxDiff);
            summary.push('INDEX_NSE_STRIKE_DIFF/FUTURE_INDEX_NSE_STRIKE_DIFF: ' + Object.keys(idxDiff).length + ' indices derived');
        }
    }

    // ── MCX (+CDS/USDINR) commodities: futures, options, strike-diff — all derived from
    // the same Kite Instruments dump, needs no separate CSV (unlike NSE, MCX's step scheme
    // isn't published via NSE_FO_SosScheme.csv). Per explicit correction: plain
    // nearest-expiry-by-string is NOT trustworthy here the way it is for NSE — each MCX
    // commodity rolls independently and picking blindly can land on the wrong contract
    // mid-month. So each tracked commodity gets its OWN override setting
    // (mcx_expiry_<name>, config.js) — a dropdown of that commodity's real available
    // months, same UX as FUTURE_EXPIRY_MONTH — and only falls back to nearest-by-date when
    // left blank.
    if (_DL_INSTRUMENTS.length) {
        var mcxFutByNameExpiry = {};      // name -> { expiry(ISO): FUT record }
        var mcxOptByNameExpiry = {};      // name -> { expiry(ISO): [CE/PE records] }
        _DL_INSTRUMENTS.forEach(function (r) {
            if (!_DL_MCX_COMMODITIES[r.name]) return;
            if (r.exchange !== 'MCX' && r.exchange !== 'CDS') return;
            if (!r.expiry) return;
            if (r.instrument_type === 'FUT') {
                if (!mcxFutByNameExpiry[r.name]) mcxFutByNameExpiry[r.name] = {};
                mcxFutByNameExpiry[r.name][r.expiry] = r;
            } else if (r.instrument_type === 'CE' || r.instrument_type === 'PE') {
                if (!mcxOptByNameExpiry[r.name]) mcxOptByNameExpiry[r.name] = {};
                if (!mcxOptByNameExpiry[r.name][r.expiry]) mcxOptByNameExpiry[r.name][r.expiry] = [];
                mcxOptByNameExpiry[r.name][r.expiry].push(r);
            }
        });

        // Cache each commodity's real available expiry DATES (not just months, per explicit
        // request — MCX contracts can expire mid-month on a specific day, and picking by
        // month alone was ambiguous when a commodity had more than one contract in the same
        // month).
        //
        // BUG FIX HISTORY: originally built from mcxFutByNameExpiry ONLY, so the single
        // mcx_expiry_<name> field's dropdown never offered a commodity's real options expiry
        // as a choice when it differed from the futures one (confirmed live: SILVER's nearest
        // futures expiry was 2026-12-04, nearest options expiry 2026-09-12). Fixed by union-ing
        // both instrument types into DL_MCX_AVAILABLE_EXPIRY_DATES — but that introduced a
        // SECOND bug: once futures and options got separate Settings fields
        // (mcx_expiry_<name>/mcx_opt_expiry_<name>), both fields' dropdowns still shared that
        // same unioned list, so the OPTIONS dropdown could show (and let you pick) a date that
        // is only a real FUTURES expiry — confirmed live again: SILVER's options field showed
        // 2026-12-04, a futures-only date, as a selectable/selected choice. Now caching TWO
        // separate per-type lists so each field's dropdown can only ever offer dates that are
        // real for THAT instrument type. The unioned list is kept too (harmless, no other
        // reader depends on it being type-pure) only for whatever else might still reference it.
        try {
            var mcxAvailMonths = {}, mcxAvailDates = {}, mcxAvailFutDates = {}, mcxAvailOptDates = {};
            var mcxAllNames = {};
            Object.keys(mcxFutByNameExpiry).forEach(function (n) { mcxAllNames[n] = true; });
            Object.keys(mcxOptByNameExpiry).forEach(function (n) { mcxAllNames[n] = true; });
            Object.keys(mcxAllNames).forEach(function (n) {
                var futDates = Object.keys(mcxFutByNameExpiry[n] || {}).sort();
                var optDates = Object.keys(mcxOptByNameExpiry[n] || {}).sort();
                var dateSet = {};
                futDates.forEach(function (d) { dateSet[d] = true; });
                optDates.forEach(function (d) { dateSet[d] = true; });
                var isoDates = Object.keys(dateSet).sort();
                mcxAvailMonths[n] = isoDates.map(function (iso) { return iso.slice(0, 7); });
                mcxAvailDates[n] = isoDates;
                mcxAvailFutDates[n] = futDates;
                mcxAvailOptDates[n] = optDates;
            });
            localStorage.setItem('DL_MCX_AVAILABLE_EXPIRY_MONTHS', JSON.stringify(mcxAvailMonths));
            localStorage.setItem('DL_MCX_AVAILABLE_EXPIRY_DATES', JSON.stringify(mcxAvailDates));
            localStorage.setItem('DL_MCX_AVAILABLE_EXPIRY_DATES_FUT', JSON.stringify(mcxAvailFutDates));
            localStorage.setItem('DL_MCX_AVAILABLE_EXPIRY_DATES_OPT', JSON.stringify(mcxAvailOptDates));
        } catch (e) {}

        // Resolve one FUT record per commodity — the per-commodity override (mcx_expiry_<name>,
        // exact "YYYY-MM-DD") if set and matched, else nearest expiry. Shared resolver
        // (_dlResolveExpiryFor/_dlConfiguredExpiryForName) — same one the options block below
        // and the Raw Globals viewer use, so all three can never drift into disagreeing.
        var mcxFutByName = {};
        Object.keys(mcxFutByNameExpiry).forEach(function (n) {
            var byExpiry = mcxFutByNameExpiry[n];
            var expiries = Object.keys(byExpiry).sort(); // ISO strings sort chronologically
            mcxFutByName[n] = byExpiry[_dlResolveExpiryFor(_dlConfiguredExpiryForName(n), expiries)];
        });

        var mcxFutures = Object.keys(mcxFutByName).sort().map(function (n) {
            var r = mcxFutByName[n];
            return {
                strike: '0', name: n, instrument_token: String(r.token), tradingsymbol: r.tradingsymbol,
                lot_size: r.lot_size != null ? String(r.lot_size) : '', expiry: _dlToDDMMYYYY(r.expiry), instrument_type: 'FUT',
            };
        });
        if (mcxFutures.length) {
            COMMODITIES_FUTURE_INSTRUMENT_LIST = mcxFutures;
            summary.push('COMMODITIES_FUTURE_INSTRUMENT_LIST: ' + mcxFutures.length + ' commodities (per-commodity override, else nearest expiry)');
        }

        // Full multi-expiry curve per commodity (near + far contracts), from the SAME raw
        // mcxFutByNameExpiry map used just above to resolve the single "current" contract —
        // needed for curve-structure (contango/backwardation) comparison, which needs two
        // contracts at once. Sorted by expiry ascending so [0] is always the nearest contract.
        try {
            var mcxCurve = {};
            Object.keys(mcxFutByNameExpiry).forEach(function (n) {
                var byExpiry = mcxFutByNameExpiry[n];
                mcxCurve[n] = Object.keys(byExpiry).sort().map(function (exp) {
                    var r = byExpiry[exp];
                    return { expiry: exp, token: String(r.token), tradingsymbol: r.tradingsymbol,
                             lot_size: r.lot_size != null ? String(r.lot_size) : '' };
                });
            });
            MCX_FUT_CURVE = mcxCurve;
            summary.push('MCX_FUT_CURVE: ' + Object.keys(mcxCurve).length + ' commodities (full multi-expiry curve)');
        } catch (eCurve) {}

        // Options + strike-diff (inferred from the actual gap between consecutive sorted
        // strikes at each commodity's own options expiry — MCX has no published step-scheme
        // CSV the way NSE does). Now respects mcx_expiry_<name> the same way futures already
        // do (previously hardcoded to nearest-only, ignoring the Settings override entirely).
        var mcxOptions = [];
        var mcxDiff = {};
        Object.keys(mcxOptByNameExpiry).forEach(function (n) {
            var expiries = Object.keys(mcxOptByNameExpiry[n]).sort(); // ISO strings sort chronologically
            var resolvedExpiry = _dlResolveExpiryFor(_dlConfiguredExpiryForName(n, 'opt'), expiries);
            var recs = mcxOptByNameExpiry[n][resolvedExpiry];
            recs.forEach(function (r) {
                mcxOptions.push({
                    strike: r.strike != null ? String(r.strike) : '0', name: r.name,
                    instrument_token: String(r.token), tradingsymbol: r.tradingsymbol,
                    lot_size: r.lot_size != null ? String(r.lot_size) : '', expiry: _dlToDDMMYYYY(r.expiry), instrument_type: r.instrument_type,
                });
            });
            var strikes = Array.from(new Set(recs.map(function (r) { return r.strike; }).filter(function (s) { return s != null; })))
                .sort(function (a, b) { return a - b; });
            if (strikes.length > 1) {
                var gapCounts = {};
                for (var i = 1; i < strikes.length; i++) {
                    var g = Math.round((strikes[i] - strikes[i - 1]) * 100) / 100;
                    if (g > 0) gapCounts[g] = (gapCounts[g] || 0) + 1;
                }
                var bestGap = null, bestCount = 0;
                Object.keys(gapCounts).forEach(function (g) { if (gapCounts[g] > bestCount) { bestCount = gapCounts[g]; bestGap = g; } });
                if (bestGap) mcxDiff[n] = bestGap + ',' + bestGap;
            }
        });
        if (mcxOptions.length) {
            MCX_OPTION_LIST = mcxOptions;
            summary.push('MCX_OPTION_LIST: ' + mcxOptions.length.toLocaleString() + ' contracts (nearest expiry each)');
        }
        if (Object.keys(mcxDiff).length) {
            // Derived values take priority; any hand-maintained hardcoded entry (constants-commodities.js)
            // only survives for a commodity this run couldn't derive a diff for.
            MCX_FUTURE_STRIKE_DIFF = Object.assign({}, (typeof MCX_FUTURE_STRIKE_DIFF !== 'undefined') ? MCX_FUTURE_STRIKE_DIFF : {}, mcxDiff);
            summary.push('MCX_FUTURE_STRIKE_DIFF: ' + Object.keys(mcxDiff).length + ' commodities derived');
        }
    }

    if (summary.length) console.log('[dataLoad] recomputed:', summary.join(' · '));
    return summary;
}

function _dlEmptyHint(msg) {
    return '<div class="sv-empty-state"><i class="bi bi-hourglass"></i><span>' + msg + '</span></div>';
}

// ── Tab 4: F&O Stocks + Tokens ──────────────────────────────────────────────────
function _dlFoTokenRows() {
    var symbols = _dlFoStockSymbols();
    if (!symbols.length || !_DL_INSTRUMENTS.length) return null;
    var byToken = {};
    _DL_INSTRUMENTS.forEach(function (r) {
        if (r.exchange === 'NSE' && r.segment === 'NSE' && r.instrument_type === 'EQ') byToken[r.tradingsymbol] = r;
    });
    return symbols.map(function (s) {
        var m = byToken[s];
        return { symbol: s, token: m ? m.token : null, name: m ? m.name : null };
    });
}
function _dlRenderFoTokensTable(filter) {
    var rows = _dlFoTokenRows();
    if (rows === null) { jQ('#dl-fotokens-table').html(_dlEmptyHint('Load both Kite Instruments and Strike Intervals first.')); return; }
    var q = (filter != null ? filter : (jQ('#dl-fotokens-search').val() || '')).trim().toUpperCase();
    var shown = q ? rows.filter(function (r) { return r.symbol.indexOf(q) !== -1; }) : rows;
    var display = shown.slice(0, 500);
    var html = '<div class="dl-table dl-table-3col">'
        + '<div class="dl-table-head"><span>Symbol</span><span>Token</span><span>Name</span></div>'
        + '<div class="dl-table-body">'
        + display.map(function (r) {
            return '<div class="dl-table-row dl-table-row-3col"><span class="dl-cell-strong">' + r.symbol + '</span>'
                + '<span class="dl-cell-muted">' + (r.token != null ? r.token : '—') + '</span>'
                + '<span class="dl-cell-muted">' + (r.name || (r.token == null ? 'no token found' : '—')) + '</span></div>';
        }).join('')
        + '</div>'
        + (shown.length > display.length ? '<div class="dl-table-more">Showing ' + display.length + ' of ' + shown.length.toLocaleString() + ' matches — narrow the search to see more.</div>' : '')
        + '</div>';
    jQ('#dl-fotokens-table').html(html);
}
jQ(document).on('input', '#dl-fotokens-search', function () { _dlRenderFoTokensTable(jQ(this).val()); });

// ── Tab 5: F&O Futures + Tokens ─────────────────────────────────────────────────
function _dlFoFutureRows() {
    if (!_DL_INSTRUMENTS.length) return null;
    var byName = {};
    _DL_INSTRUMENTS.forEach(function (r) {
        if (r.instrument_type !== 'FUT' || r.exchange !== 'NFO') return;
        var existing = byName[r.name];
        if (!existing || (r.expiry && (!existing.expiry || r.expiry < existing.expiry))) byName[r.name] = r;
    });
    return Object.keys(byName).sort().map(function (n) { return byName[n]; });
}
function _dlRenderFoFuturesTable(filter) {
    var rows = _dlFoFutureRows();
    if (rows === null) { jQ('#dl-fofutures-table').html(_dlEmptyHint('Load Kite Instruments first.')); return; }
    var q = (filter != null ? filter : (jQ('#dl-fofutures-search').val() || '')).trim().toUpperCase();
    var shown = q ? rows.filter(function (r) { return r.name.indexOf(q) !== -1 || r.tradingsymbol.indexOf(q) !== -1; }) : rows;
    var display = shown.slice(0, 500);
    var html = '<div class="dl-table dl-table-5col">'
        + '<div class="dl-table-head"><span>Symbol</span><span>Trading Symbol</span><span>Token</span><span>Expiry</span><span>Lot Size</span></div>'
        + '<div class="dl-table-body">'
        + display.map(function (r) {
            return '<div class="dl-table-row dl-table-row-5col"><span class="dl-cell-strong">' + r.name + '</span>'
                + '<span class="dl-cell-muted">' + r.tradingsymbol + '</span><span class="dl-cell-muted">' + r.token + '</span>'
                + '<span class="dl-cell-muted">' + (r.expiry || '—') + '</span><span class="dl-cell-muted">' + (r.lot_size != null ? r.lot_size : '—') + '</span></div>';
        }).join('')
        + '</div>'
        + (shown.length > display.length ? '<div class="dl-table-more">Showing ' + display.length + ' of ' + shown.length.toLocaleString() + ' matches — narrow the search to see more.</div>' : '')
        + '</div>';
    jQ('#dl-fofutures-table').html(html);
}
jQ(document).on('input', '#dl-fofutures-search', function () { _dlRenderFoFuturesTable(jQ(this).val()); });

// ── Tab 6: F&O Stocks + Strike Diff ─────────────────────────────────────────────
function _dlRenderFoStrikeDiffTable(filter) {
    var symbols = _dlFoStockSymbols();
    if (!symbols.length) { jQ('#dl-fostrikediff-table').html(_dlEmptyHint('Load Strike Intervals first.')); return; }
    var q = (filter != null ? filter : (jQ('#dl-fostrikediff-search').val() || '')).trim().toUpperCase();
    var shown = q ? symbols.filter(function (s) { return s.indexOf(q) !== -1; }) : symbols;
    var display = shown.slice(0, 500);
    var html = '<div class="dl-table dl-table-3col">'
        + '<div class="dl-table-head"><span>Symbol</span><span>Strike Diff</span><span>Month</span></div>'
        + '<div class="dl-table-body">'
        + display.map(function (s) {
            var best = _dlBestStrikeDiff(_DL_STRIKES[s]);
            return '<div class="dl-table-row dl-table-row-3col"><span class="dl-cell-strong">' + s + '</span>'
                + '<span class="dl-cell-muted">' + (best ? best.diff : '—') + '</span>'
                + '<span class="dl-cell-muted">' + (best ? best.month : '—') + '</span></div>';
        }).join('')
        + '</div>'
        + (shown.length > display.length ? '<div class="dl-table-more">Showing ' + display.length + ' of ' + shown.length.toLocaleString() + ' matches — narrow the search to see more.</div>' : '')
        + '</div>';
    jQ('#dl-fostrikediff-table').html(html);
}
jQ(document).on('input', '#dl-fostrikediff-search', function () { _dlRenderFoStrikeDiffTable(jQ(this).val()); });

// ── Tab 7: Constant Lists ────────────────────────────────────────────────────────
// Pure read of the existing NIFTY_50_LIST / NIFTY_BANK_LIST / INDICES / WEIGHTED_STOCKS
// globals (constants.js) — display only, nothing here writes to them or anything else.
function _dlConstListChip(name) {
    return '<span class="dl-stock-chip">' + name + '</span>';
}
function _dlConstListSection(title, arr) {
    var items = (arr && arr.length) ? arr : null;
    return '<div class="dl-section-title" style="margin-top:14px;">' + title + (items ? ' (' + items.length + ')' : ' — not defined')
        + '</div>'
        + '<div class="dl-stock-chips">' + (items ? items.map(_dlConstListChip).join('') : '<span class="dl-cell-muted">—</span>') + '</div>';
}
// NIFTY_50_WEIGHTED_STOCKS / NIFTY_BANK_WEIGHTED_STOCKS are {stock: weight%} objects, not
// arrays like the others above — shown as a symbol+weight table, sorted heaviest first.
function _dlConstWeightSection(title, obj) {
    var entries = obj ? Object.keys(obj).map(function (k) { return { symbol: k, weight: obj[k] }; }) : null;
    if (entries) entries.sort(function (a, b) { return b.weight - a.weight; });
    return '<div class="dl-section-title" style="margin-top:14px;">' + title + (entries ? ' (' + entries.length + ')' : ' — not defined')
        + '</div>'
        + (entries
            ? '<div class="dl-table dl-table-2col">'
                + '<div class="dl-table-head"><span>Symbol</span><span>Weight %</span></div>'
                + '<div class="dl-table-body">'
                + entries.map(function (e) {
                    return '<div class="dl-table-row dl-table-row-2col"><span class="dl-cell-strong">' + e.symbol + '</span><span class="dl-cell-muted">' + e.weight + '%</span></div>';
                }).join('')
                + '</div></div>'
            : '<span class="dl-cell-muted">—</span>');
}
// NSE_STRIKE_DIFF/MCX_FUTURE_STRIKE_DIFF are {symbol: "min,max"} string-value objects —
// same key shape as the weighted-stocks maps above, different value type.
function _dlConstStrikeDiffSection(title, obj) {
    var symbols = obj ? Object.keys(obj).sort() : null;
    return '<div class="dl-section-title" style="margin-top:14px;">' + title + (symbols ? ' (' + symbols.length + ')' : ' — not defined')
        + '</div>'
        + (symbols
            ? '<div class="dl-table dl-table-2col">'
                + '<div class="dl-table-head"><span>Symbol</span><span>Strike Diff</span></div>'
                + '<div class="dl-table-body">'
                + symbols.map(function (s) {
                    return '<div class="dl-table-row dl-table-row-2col"><span class="dl-cell-strong">' + s + '</span><span class="dl-cell-muted">' + obj[s] + '</span></div>';
                }).join('')
                + '</div></div>'
            : '<span class="dl-cell-muted">—</span>');
}
// Shared renderer for any {name, tradingsymbol, expiry, ...} futures-list array
// (FUTURE_INTRUMENT_LIST for NSE/BFO, COMMODITIES_FUTURE_INSTRUMENT_LIST for MCX) — one
// row per underlying, sorted by expiry (soonest first) so near-dated contracts are easy
// to spot, with a "days left" column so a wrong/stale expiry is checkable at a glance
// instead of having to open each instrument's own popup individually.
function _dlConstFuturesListSection(title, rows) {
    return '<div class="dl-section-title" style="margin-top:14px;">' + title + (rows ? ' (' + rows.length + ')' : ' — not defined')
        + '</div>'
        + ((rows && rows.length)
            ? '<div class="dl-table dl-table-4col">'
                + '<div class="dl-table-head"><span>Symbol</span><span>Trading Symbol</span><span>Expiry</span><span>Days Left</span></div>'
                + '<div class="dl-table-body">'
                + rows.slice().sort(function (a, b) {
                    var ea = moment(a.expiry, 'DD-MM-YYYY'), eb = moment(b.expiry, 'DD-MM-YYYY');
                    if (ea.isValid() && eb.isValid() && !ea.isSame(eb)) return ea.isBefore(eb) ? -1 : 1;
                    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
                }).map(function (r) {
                    var exp = moment(r.expiry, 'DD-MM-YYYY');
                    var days = exp.isValid() ? exp.diff(moment().startOf('day'), 'days') : null;
                    var daysCell = days === null ? '—'
                        : '<span style="color:' + (days < 0 ? 'var(--gtb-red)' : days <= 3 ? 'var(--gtb-red)' : days <= 7 ? 'var(--gtb-amber)' : 'inherit') + ';">'
                            + (days < 0 ? 'EXPIRED' : days + 'd') + '</span>';
                    return '<div class="dl-table-row dl-table-row-4col"><span class="dl-cell-strong">' + r.name + '</span>'
                        + '<span class="dl-cell-muted">' + r.tradingsymbol + '</span><span class="dl-cell-muted">' + (r.expiry || '—') + '</span>'
                        + '<span class="dl-cell-muted">' + daysCell + '</span></div>';
                }).join('')
                + '</div></div>'
            : '<span class="dl-cell-muted">—</span>');
}
function _dlRenderConstListsTable() {
    var html = ''
        + _dlConstListSection('NIFTY_50_LIST', (typeof NIFTY_50_LIST !== 'undefined') ? NIFTY_50_LIST : null)
        + _dlConstListSection('NIFTY_BANK_LIST', (typeof NIFTY_BANK_LIST !== 'undefined') ? NIFTY_BANK_LIST : null)
        + _dlConstListSection('INDICES', (typeof INDICES !== 'undefined') ? INDICES : null)
        + _dlConstListSection('WEIGHTED_STOCKS', (typeof WEIGHTED_STOCKS !== 'undefined') ? WEIGHTED_STOCKS : null)
        + _dlConstWeightSection('NIFTY_50_WEIGHTED_STOCKS', (typeof NIFTY_50_WEIGHTED_STOCKS !== 'undefined') ? NIFTY_50_WEIGHTED_STOCKS : null)
        + _dlConstWeightSection('NIFTY_BANK_WEIGHTED_STOCKS', (typeof NIFTY_BANK_WEIGHTED_STOCKS !== 'undefined') ? NIFTY_BANK_WEIGHTED_STOCKS : null)
        + _dlConstStrikeDiffSection('INDEX_NSE_STRIKE_DIFF (derived per-index, else hand-typed fallback — GIFT NIFTY only)', (typeof INDEX_NSE_STRIKE_DIFF !== 'undefined') ? INDEX_NSE_STRIKE_DIFF : null)
        + _dlConstStrikeDiffSection('FUTURE_INDEX_NSE_STRIKE_DIFF (same, futures side)', (typeof FUTURE_INDEX_NSE_STRIKE_DIFF !== 'undefined') ? FUTURE_INDEX_NSE_STRIKE_DIFF : null)
        + _dlConstStrikeDiffSection('MCX_FUTURE_STRIKE_DIFF', (typeof MCX_FUTURE_STRIKE_DIFF !== 'undefined') ? MCX_FUTURE_STRIKE_DIFF : null)
        + _dlConstFuturesListSection('FUTURE_INTRUMENT_LIST (NSE/BFO)', (typeof FUTURE_INTRUMENT_LIST !== 'undefined') ? FUTURE_INTRUMENT_LIST : null)
        + _dlConstFuturesListSection('COMMODITIES_FUTURE_INSTRUMENT_LIST (MCX/CDS)', (typeof COMMODITIES_FUTURE_INSTRUMENT_LIST !== 'undefined') ? COMMODITIES_FUTURE_INSTRUMENT_LIST : null);
    jQ('#dl-constlists-table').html(html);
}

// ── Raw Globals tab — click-to-load, one at a time ──────────────────────────────
// Per explicit request: some of these (NSE_OPTION_STRIKE_LIST especially, ~10K entries)
// are large enough that stringifying all ten on tab-open would be wasteful — this only
// builds the button list eagerly; each global's actual JSON dump is rendered lazily,
// only when its own button is clicked, and only one is shown at a time.
var _DL_RAW_GLOBALS = [
    { id: 'NSE_STRIKE_DIFF',                  get: function () { return NSE_STRIKE_DIFF; } },
    { id: 'NSE_FUTURE_STRIKE_DIFF',           get: function () { return NSE_FUTURE_STRIKE_DIFF; } },
    { id: 'INSTRUMENT_TOKENS',                get: function () { return INSTRUMENT_TOKENS; } },
    { id: 'FUTURE_INTRUMENT_LIST',            get: function () { return FUTURE_INTRUMENT_LIST; } },
    { id: 'FO_LIST',                          get: function () { return FO_LIST; } },
    { id: 'NSE_OPTION_STRIKE_LIST',           get: function () { return NSE_OPTION_STRIKE_LIST; } },
    { id: 'COMMODITIES_FUTURE_INSTRUMENT_LIST', get: function () { return COMMODITIES_FUTURE_INSTRUMENT_LIST; } },
    { id: 'MCX_OPTION_LIST',                  get: function () { return MCX_OPTION_LIST; } },
];

function _dlEscHtml(s) {
    return String(s).replace(/[&<>]/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'; });
}

function _dlRenderRawGlobalsTab() {
    var $p = jQ('#dl-panel-rawglobals');
    if ($p.data('dl-built')) return; // button list built once; each global's data is lazy per-click
    $p.data('dl-built', true);
    var btns = _DL_RAW_GLOBALS.map(function (g) {
        return '<button class="dl-rawg-btn" data-rawg="' + g.id + '">' + g.id + '</button>';
    }).join('');
    $p.html(
        '<div class="dl-derived-hint">Click a global below to inspect its current in-memory value — nothing is fetched here. Some of these (NSE_OPTION_STRIKE_LIST especially, ~10K entries) are too large to render or JSON.stringify in one go without hanging the tab, so only the first ' + _DL_RAWG_CAP + ' rows are shown at a time — use the search box to narrow down to what you actually need.</div>'
        + '<div id="dl-rawglobals-btns" style="display:flex;flex-wrap:wrap;gap:6px;padding:0 8px 8px;">' + btns + '</div>'
        + '<div id="dl-rawglobals-output" style="padding:0 8px 8px;"></div>'
    );
}

// Hard cap on rows rendered/stringified at once — the actual fix for the hang: previously
// this ran JSON.stringify(val, null, 2) over the WHOLE array (10K+ objects for
// NSE_OPTION_STRIKE_LIST) and injected the entire multi-MB string into one <pre>, which
// blocks the main thread for both the stringify and the DOM layout of that much text.
// Now only a slice is ever stringified/rendered, and a search box lets the user filter
// down to specific rows instead of scrolling through everything.
var _DL_RAWG_CAP = 200;
var _DL_RAWG_CURRENT = null; // { id, val, isArray, entries: [[key,item],...] } — cached so search re-filters in-memory, no re-read

// Hard-filter NSE_OPTION_STRIKE_LIST down to one expiry PER NAME, using the exact same
// resolution oiAnalyzer.js's showTrendingOI now uses (_dlResolveExpiryFor/
// _dlConfiguredExpiryForName) — NIFTY/SENSEX/BANKNIFTY each have their own dedicated
// Settings field, every other name (F&O stocks) shares fo_stocks_expiry_date, and any of
// those fall back to that name's own nearest live expiry when left blank or stale. Built
// once per Load click (grouping ~190 stocks + a few indices is cheap), not per row.
function _dlRawgBuildExpiryMap(entries, kind) {
    var byName = {}; // name -> Set of ISO expiry strings seen
    entries.forEach(function (e) {
        var name = e[1].name, iso = moment(e[1].expiry, 'DD-MM-YYYY').format('YYYY-MM-DD');
        if (!byName[name]) byName[name] = {};
        byName[name][iso] = true;
    });
    var resolved = {}; // name -> chosen ISO expiry
    Object.keys(byName).forEach(function (name) {
        var avail = Object.keys(byName[name]).sort();
        resolved[name] = _dlResolveExpiryFor(_dlConfiguredExpiryForName(name, kind), avail);
    });
    return resolved;
}

function _dlRawgRender() {
    var cur = _DL_RAWG_CURRENT;
    if (!cur) return;
    var filterText = (jQ('#dl-rawglobals-search').val() || '').toLowerCase();
    var matches = cur.entries.filter(function (e) {
        if (cur.expiryMap) {
            var iso = moment(e[1].expiry, 'DD-MM-YYYY').format('YYYY-MM-DD');
            if (iso !== cur.expiryMap[e[1].name]) return false;
        }
        if (filterText && (e[0] + ' ' + JSON.stringify(e[1])).toLowerCase().indexOf(filterText) === -1) return false;
        return true;
    });
    var shown = matches.slice(0, _DL_RAWG_CAP);
    var json;
    try { json = JSON.stringify(cur.isArray ? shown.map(function (e) { return e[1]; }) : shown.reduce(function (o, e) { o[e[0]] = e[1]; return o; }, {}), null, 2); }
    catch (e) { json = String(e); }
    jQ('#dl-rawglobals-count').text('Showing ' + shown.length + ' of ' + matches.length + (filterText ? ' matching' : '') + ' (total ' + cur.entries.length + ')');
    jQ('#dl-rawglobals-pre').text(json);
}

jQ(document).on('click', '.dl-rawg-btn', function () {
    jQ('.dl-rawg-btn').removeClass('dl-rawg-btn-active');
    jQ(this).addClass('dl-rawg-btn-active');
    var id = jQ(this).attr('data-rawg');
    var def = _DL_RAW_GLOBALS.filter(function (g) { return g.id === id; })[0];
    if (!def) return;
    var $out = jQ('#dl-rawglobals-output');
    $out.html('<div style="font-size:0.55rem;color:var(--gtb-muted);">Loading ' + id + '…</div>');
    // setTimeout so the "Loading…" state actually paints before touching a potentially
    // large global (building the entries array below is O(n) but cheap — the expensive
    // part, JSON.stringify, now only ever runs on a capped slice, not the whole thing).
    setTimeout(function () {
        var val;
        try { val = def.get(); } catch (e) { $out.html('<div style="color:var(--gtb-red);">Error reading ' + id + ': ' + _dlEscHtml(e.message) + '</div>'); return; }
        var isArray = Array.isArray(val);
        var entries = isArray ? val.map(function (v, i) { return [String(i), v]; })
                    : (val && typeof val === 'object') ? Object.keys(val).map(function (k) { return [k, val[k]]; })
                    : [['value', val]];
        // Every globa with expiry-bearing rows now gets the same one-expiry-per-name filter,
        // using the identical resolver dataLoad.js's own load step and oiAnalyzer.js's
        // showTrendingOI use — NSE names via nifty/sensex/banknifty/fo_stocks Settings
        // fields, MCX commodities via mcx_expiry_<name>. FUTURE_INTRUMENT_LIST/
        // COMMODITIES_FUTURE_INSTRUMENT_LIST are already resolved to one expiry per name at
        // load time (harmless no-op filter here, included for consistency).
        var _EXPIRY_FILTERED_GLOBALS = { NSE_OPTION_STRIKE_LIST: 1, FUTURE_INTRUMENT_LIST: 1, COMMODITIES_FUTURE_INSTRUMENT_LIST: 1, MCX_OPTION_LIST: 1 };
        var hasConfiguredFilter = !!_EXPIRY_FILTERED_GLOBALS[id];
        // Options-shaped globals resolve via the options expiry setting (mcx_opt_expiry_<name>
        // for MCX names, no effect on NSE names); futures-shaped globals via the futures one —
        // otherwise this viewer could show a different expiry than what actually got loaded
        // into MCX_OPTION_LIST at Load time.
        var _rawgKind = (id === 'NSE_OPTION_STRIKE_LIST' || id === 'MCX_OPTION_LIST') ? 'opt' : 'fut';
        var expiryMap = hasConfiguredFilter ? _dlRawgBuildExpiryMap(entries, _rawgKind) : null;
        _DL_RAWG_CURRENT = { id: id, val: val, isArray: isArray, entries: entries, expiryMap: expiryMap };

        $out.html(
            '<div style="display:flex;align-items:center;gap:8px;padding-bottom:4px;flex-wrap:wrap;">'
            + '<b style="font-size:0.55rem;color:var(--gtb-text);">' + id + '</b>'
            + '<input type="text" id="dl-rawglobals-search" class="dl-search" style="margin:0;flex:1;min-width:160px;max-width:280px;" placeholder="Filter ' + id + '…">'
            + '<span id="dl-rawglobals-count" style="font-size:0.48rem;color:var(--gtb-muted);"></span>'
            + '</div>'
            + (hasConfiguredFilter
                ? '<div style="font-size:0.44rem;color:var(--gtb-muted);padding-bottom:4px;">Every name filtered to ONE expiry each — NIFTY/SENSEX/BANKNIFTY use their own Settings field, every other F&amp;O stock shares &ldquo;F&amp;O Stocks options expiry date&rdquo;, MCX commodities use their own &ldquo;&lt;name&gt; expiry date&rdquo; field — falling back to that name\'s own nearest live expiry when left blank or stale. Same resolution the real OI/OBV pipeline and Kite Instruments load now use everywhere.</div>'
                : '')
            + '<pre id="dl-rawglobals-pre" style="white-space:pre-wrap;word-break:break-all;font-size:0.52rem;font-family:var(--gtb-mono);background:var(--gtb-surface);border:1px solid var(--gtb-border);color:var(--gtb-text);padding:8px;max-height:440px;overflow:auto;margin:0;"></pre>'
        );
        _dlRawgRender();
    }, 10);
});

jQ(document).on('input', '#dl-rawglobals-search', function () { _dlRawgRender(); });

// Silent boot-time restore — FO_LIST/NSE_STRIKE_DIFF/NSE_FUTURE_STRIKE_DIFF/
// INSTRUMENT_TOKENS/FUTURE_INTRUMENT_LIST all start empty in constants.js now, so without
// this they'd stay empty on every fresh page load until the user manually reopens Data
// Load and clicks Load on both tabs, breaking every feature that depends on them by
// default. Purely reads the existing IndexedDB/localStorage caches (no network call).
//
// window.gtbDataReadyPromise — resolves once this restore has actually finished (or
// determined there's nothing to restore). Confirmed real race: script.js's chart-page
// auto-detect (jQ(document).ready(...)) fires the Instrument Detail View immediately on
// page load and calls showFutureDetails(name) synchronously — which used to run against
// whatever FUTURE_INTRUMENT_LIST/INSTRUMENT_TOKENS happened to be at that exact instant.
// This used to be a blind setTimeout(fn, 500) guess; the real dependency is just "wait for
// the async IndexedDB read", which is normally much faster than 500ms but has no hard
// upper bound — so on a slow load 500ms could still be too short, and on a fast load it
// wastes time other callers could have used immediately. Running the restore with no
// artificial delay at all, and exposing this promise, lets any caller that actually needs
// the derived globals (like the chart-page auto-detect) await real completion instead of
// guessing a fixed number of milliseconds either way.
window.gtbDataReadyPromise = (function () {
    return new Promise(function (resolve) {
        var cachedStrikes = _dlLoadCachedStrikes();
        if (cachedStrikes) {
            _DL_STRIKES = cachedStrikes;
            FO_LIST = _dlFoStockSymbols();
        }
        _dlGetAllInstruments().then(function (rows) {
            if (rows && rows.length) _DL_INSTRUMENTS = rows;
        }).catch(function () {}).finally(function () {
            if (_DL_STRIKES || _DL_INSTRUMENTS.length) {
                var summary = _dlRecomputeDerivedGlobals();
                console.log('[dataLoad] restored from cache on page load — FO_LIST:', FO_LIST.length, summary.length ? '· ' + summary.join(' · ') : '');
            }
            resolve();
        });
    });
})();
