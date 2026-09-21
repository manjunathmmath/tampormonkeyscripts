window.jQ = jQuery.noConflict(true);

// Real "YYYY-MM" months available in NFO futures, cached by dataLoad.js the last time Kite
// Instruments were loaded (_dlRecomputeDerivedGlobals) — read synchronously here so the
// Settings dropdown below lists actual months instead of requiring free-text entry. Before
// the first Kite Instruments load this is empty, so the field falls back to just "Nearest
// expiry (auto)" until the next load caches real months (then reopen Settings to see them —
// same reload-to-refresh pattern as everything else MonkeyConfig-driven in this app).
var _CFG_EXPIRY_MONTHS = [];
try { _CFG_EXPIRY_MONTHS = JSON.parse(localStorage.getItem('DL_AVAILABLE_EXPIRY_MONTHS') || '[]'); } catch (e) {}
var _CFG_EXPIRY_CHOICES = [''].concat(_CFG_EXPIRY_MONTHS);
var _CFG_EXPIRY_LABELS = ['Nearest expiry (auto)'].concat(_CFG_EXPIRY_MONTHS);

// NIFTY/SENSEX's own OI pipeline (oiAnalyzer.js's showTrendingOI) filters
// OPTION_STRIKE_LIST down to an EXACT expiry date (not just month) held in
// nifty_expiry_date/sensex_expiry_date — those used to be hand-typed "YYYY-MM-DD" text.
// Now sourced from dataLoad.js's DL_NSE_OPTION_EXPIRY_DATES cache (real dates from the
// last Kite Instruments load) so it's a pick, not typing.
var _CFG_NSE_OPTION_DATES = {};
try { _CFG_NSE_OPTION_DATES = JSON.parse(localStorage.getItem('DL_NSE_OPTION_EXPIRY_DATES') || '{}'); } catch (e) {}
function _cfgNseExpiryDateParam(rawName, label) {
    var dates = _CFG_NSE_OPTION_DATES[rawName] || [];
    var fallback = moment().format('YYYY-MM-DD');
    var choices = dates.length ? dates : [fallback];
    return {
        'label': label + ' options expiry date',
        'type': 'select',
        'choices': choices,
        'values': choices,
        'default': dates.length ? dates[0] : fallback,
    };
}

// One shared expiry-date dropdown for ALL F&O stock options (not indices) — same
// convention as future_expiry_month below (one setting for every NSE/BSE future) rather
// than a dedicated field per stock, which would make this page unusable at ~190 stocks.
// Sourced from dataLoad.js's DL_FO_STOCK_OPTION_EXPIRY_DATES cache (union of real expiry
// dates seen across every tracked F&O stock's options in the last Kite Instruments load).
var _CFG_FO_STOCK_OPTION_DATES = [];
try { _CFG_FO_STOCK_OPTION_DATES = JSON.parse(localStorage.getItem('DL_FO_STOCK_OPTION_EXPIRY_DATES') || '[]'); } catch (e) {}

// Per-MCX-commodity expiry override — unlike NSE futures, MCX commodities roll
// independently and plain nearest-expiry isn't reliable mid-month (confirmed: CRUDE can
// land on the wrong contract), so each tracked commodity gets its own dropdown instead of
// one shared setting. Same list dataLoad.js's _DL_MCX_COMMODITIES tracks (duplicated here
// since config.js loads before dataLoad.js). Cache keyed by name -> ["YYYY-MM-DD", ...],
// written by dataLoad.js's _dlRecomputeDerivedGlobals each time Kite Instruments load.
// Full exact date, not just month, per explicit request — a commodity can list more than
// one contract in the same calendar month, so month-only was ambiguous.
var _CFG_MCX_COMMODITIES = ['CRUDEOIL', 'CRUDEOILM', 'GOLD', 'GOLDM', 'SILVER', 'SILVERM', 'ZINC', 'COPPER', 'NATURALGAS', 'NATGASMINI', 'USDINR'];
var _CFG_MCX_DATES = {};
try { _CFG_MCX_DATES = JSON.parse(localStorage.getItem('DL_MCX_AVAILABLE_EXPIRY_DATES') || '{}'); } catch (e) {}
// Type-specific date lists — using the unioned _CFG_MCX_DATES for BOTH dropdowns let the
// OPTIONS field show (and let you pick) a date that's only a real FUTURES expiry for that
// commodity, or vice versa (confirmed live: SILVER's options field showed its futures-only
// date as a selectable choice). Each field's dropdown must only ever offer dates real for
// its own instrument type.
var _CFG_MCX_FUT_DATES = {}, _CFG_MCX_OPT_DATES = {};
try { _CFG_MCX_FUT_DATES = JSON.parse(localStorage.getItem('DL_MCX_AVAILABLE_EXPIRY_DATES_FUT') || '{}'); } catch (e) {}
try { _CFG_MCX_OPT_DATES = JSON.parse(localStorage.getItem('DL_MCX_AVAILABLE_EXPIRY_DATES_OPT') || '{}'); } catch (e) {}
var _CFG_MCX_EXPIRY_PARAMS = {};
// Separate options-expiry override per commodity — futures and options on the same MCX
// commodity are NOT guaranteed to share an expiry calendar (confirmed live: SILVER's
// nearest futures expiry and nearest options expiry were different dates). Left blank by
// default so it independently falls back to that name's own nearest LIVE options expiry
// (_dlResolveExpiryFor) — it deliberately does NOT inherit the futures field's value, since
// doing so would silently reintroduce the exact bug this split exists to fix for anyone
// with an old futures-only date already saved.
var _CFG_MCX_OPT_EXPIRY_PARAMS = {};
_CFG_MCX_COMMODITIES.forEach(function (n) {
    var futDates = _CFG_MCX_FUT_DATES[n] || [];
    var optDates = _CFG_MCX_OPT_DATES[n] || [];
    _CFG_MCX_EXPIRY_PARAMS['mcx_expiry_' + n.toLowerCase()] = {
        'label': n + ' futures expiry date',
        'type': 'select',
        'choices': ['Nearest expiry (auto)'].concat(futDates),
        'values': [''].concat(futDates),
        'default': '',
    };
    _CFG_MCX_OPT_EXPIRY_PARAMS['mcx_opt_expiry_' + n.toLowerCase()] = {
        'label': n + ' options expiry date',
        'type': 'select',
        'choices': ['Nearest expiry (auto)'].concat(optDates),
        'values': [''].concat(optDates),
        'default': '',
    };
});

const g_config = new MonkeyConfig({
    title: 'Market Trend Settings',
    // menuCommand removed — the native MonkeyConfig dialog it opened rendered inside an
    // isolated iframe whose layout we could never reliably fix (see grootTradeBot.js's
    // _gtbShowMarketTrendSettings comment). That custom popup is the sole way to edit these
    // settings now, reachable via Settings → "Market Trend Settings" in the app itself.
    // g_config.open()/.get()/.set() below are all still used exactly as before — only the
    // Tampermonkey menu command entry point is gone.
    onSave: reloadPage,
    params: {
        // ── General / Session ────────────────────────────────────────────────────
        // A native <input type="date"> shows in the BROWSER/OS locale's display order
        // (DD-MM-YYYY here), which can't be forced to YYYY-MM-DD via markup — Chrome/Edge
        // don't expose a display-format override for date inputs. Reverted to text so the
        // format the user actually wants (YYYY-MM-DD) is what's shown, not just what's
        // stored — the underlying value was always that format anyway.
        previous_day_date: {
            'label': 'Previous day (YYYY-MM-DD)',
            type: 'text',
            default: moment().subtract(1, "days").format("YYYY-MM-DD")
        },
        current_day_date: {
            'label': 'Current day (YYYY-MM-DD)',
            type: 'text',
            default: moment().format("YYYY-MM-DD")
        },
        // Was an unused/dead field (defined, never read anywhere in the app) — repurposed
        // as Account Capital, the input Master Consensus's new Position Size calculator
        // needs (riskAmount = capital × risk_pct_per_trade / 100). Key kept as 'margin' so
        // nothing that might already reference it elsewhere breaks; only the label/purpose
        // changed.
        margin: {
            'label': 'Account Capital (₹) — used for Position Size calculator',
            type: 'text',
            default: 100000
        },
        risk_pct_per_trade: {
            'label': 'Risk % per trade — used for Position Size calculator',
            type: 'text',
            default: 1
        },
        refresh_time: {
            type: 'text',
            default: 60
        },
        historical_data_interval: {
            type: 'text',
            default: '3minute'
        },
        use_ltp_for_strike: {
            type: 'checkbox',
            default: true
        },
        api_key: {
            'label': 'API Key',
            'type': 'text',
            'default': 'yxwoymcn7nnv91l6',
        },
        api_secret: {
            'label': 'API Secret',
            'type': 'text',
            'default': 'hna7avvcp0as89u4oo5vtioryv6syfwo',
        },
        api_access_token: {
            'label': 'Access Token',
            'type': 'text',
            'default': '',
        },

        // ── NSE / Index (NIFTY, BANK NIFTY, SENSEX, stocks) ─────────────────────
        hdr_nse: { 'label': '— NSE / INDEX —', 'type': 'custom', 'html': '', 'get': function () { return ''; }, 'set': function () {} },
        nifty_expiry_date: _cfgNseExpiryDateParam('NIFTY', 'NIFTY'),
        sensex_expiry_date: _cfgNseExpiryDateParam('SENSEX', 'SENSEX'),
        banknifty_expiry_date: _cfgNseExpiryDateParam('BANKNIFTY', 'BANK NIFTY'),
        fo_stocks_expiry_date: {
            'label': 'F&O Stocks options expiry date (shared, all stocks)',
            'type': 'select',
            'choices': ['Nearest expiry (auto)'].concat(_CFG_FO_STOCK_OPTION_DATES),
            'values': [''].concat(_CFG_FO_STOCK_OPTION_DATES),
            'default': '',
        },
        future_expiry_month: {
            'label': 'Futures expiry month filter (all NSE/BSE F&O)',
            'type': 'select',
            'choices': _CFG_EXPIRY_LABELS,
            'values': _CFG_EXPIRY_CHOICES,
            'default': '',
        },
        hedge_diff_nifty: {
            'label': 'Hedge strike diff — NIFTY (points)',
            'type': 'text',
            'default': 500,
        },
        hedge_diff_banknifty: {
            'label': 'Hedge strike diff — BANK NIFTY (points)',
            'type': 'text',
            'default': 500,
        },
        hedge_diff_stocks: {
            'label': 'Hedge strike diff — Stocks (points)',
            'type': 'text',
            'default': 50,
        },

        // ── MCX / Commodities ────────────────────────────────────────────────────
        hdr_mcx: { 'label': '— MCX / COMMODITIES —', 'type': 'custom', 'html': '', 'get': function () { return ''; }, 'set': function () {} },
        mcx_previous_day_date: {
            'label': 'MCX previous day (YYYY-MM-DD)',
            type: 'text',
            default: moment().subtract(1, "days").format("YYYY-MM-DD")
        },
        mcx_current_day_date: {
            'label': 'MCX current day (YYYY-MM-DD)',
            type: 'text',
            default: moment().format("YYYY-MM-DD")
        },
        OVX: {
            // options['label'] is inserted into the dialog's <label> as raw HTML (see
            // MonkeyConfig.formatters._label) — safe to embed a real link, not just a comment.
            'label': 'OVX <a href="https://in.investing.com/indices/cboe-crude-oil-volatility-historical-data" target="_blank" rel="noopener" style="font-weight:normal;font-size:0.85em;">(source)</a>',
            type: 'text',
            default: 68.90
        },
        VXSLV: {
            'label': 'VXSLV <a href="https://in.investing.com/indices/cboe-silver-etf-volatility" target="_blank" rel="noopener" style="font-weight:normal;font-size:0.85em;">(source)</a>',
            type: 'text',
            default: 27.95
        },
        GVZ: {
            'label': 'GVZ <a href="https://www.investing.com/indices/cboe-gold-volatitity" target="_blank" rel="noopener" style="font-weight:normal;font-size:0.85em;">(source)</a>',
            type: 'text',
            default: 16.45
        },
        VIX: {
            // Despite the name, this is a manually-entered OVX-style proxy for the
            // commodities dashboard, not an India VIX fallback (see CLAUDE.md v26.71) —
            // grouped here with MCX, not NSE. Value comes from the actual CBOE VIX
            // (S&P 500 volatility index, in.investing.com/indices/volatility-s-p-500) — NOT
            // India VIX — used as the fallback vol proxy for MCX commodities with no
            // dedicated CBOE-style index of their own:
            //   CRUDEOIL / CRUDEOILM   → OVX   (CBOE Crude Oil Volatility Index)
            //   GOLD / GOLDM           → GVZ   (CBOE Gold Volatility Index)
            //   SILVER / SILVERM       → VXSLV (CBOE Silver Volatility Index)
            //   NATURALGAS / NATGASMINI → VIX  (this field — no gas-specific index)
            //   USDINR                 → 4.85  (fixed 4.85% implied vol for USD/INR FX pair)
            //   ZINC / COPPER / other tracked MCX → VIX (same manual-proxy fallback as gas)
            'label': 'VIX (CBOE, not India VIX) <a href="https://in.investing.com/indices/volatility-s-p-500" target="_blank" rel="noopener" style="font-weight:normal;font-size:0.85em;">(source)</a>',
            type: 'text',
            default: 21.44
        },
        ..._CFG_MCX_EXPIRY_PARAMS,
        ..._CFG_MCX_OPT_EXPIRY_PARAMS,
    },

});

const VERSION = "v1.0";
const BASE_URL = "https://kite.zerodha.com";
const PREVIOUS_DAY = g_config.get('previous_day_date');
const CURRENT_DAY = g_config.get('current_day_date');

const CURRENT_DATE_FROM_DATE = CURRENT_DAY + " 09:15:00";
const CURRENT_DATE_TO_DATE = CURRENT_DAY + " 11:05:00";

let date = new Date().toJSON().slice(0, 10);
const MARGIN = g_config.get('margin');
const RISK_PCT_PER_TRADE = parseFloat(g_config.get('risk_pct_per_trade')) || 1;
let weightIndex = []
const HISTORICAL_DATA_INTERVAL = g_config.get('historical_data_interval');
const REFRESH_TIME = g_config.get('refresh_time');
const NIFTY_EXPIRY_DATE = g_config.get("nifty_expiry_date")
const SENSEX_EXPIRY_DATE = g_config.get('sensex_expiry_date');
const BANKNIFTY_EXPIRY_DATE = g_config.get('banknifty_expiry_date');
// Blank ('Nearest expiry (auto)') means no override — each F&O stock's own nearest-expiry
// resolution elsewhere in the app is left alone, same "blank = auto" convention as
// FUTURE_EXPIRY_MONTH below and mcx_expiry_<name> in the MCX section.
const FO_STOCKS_OPTION_EXPIRY_DATE = (g_config.get('fo_stocks_expiry_date') || '').trim();
const USE_LTP_FOR_STRIKE = g_config.get('use_ltp_for_strike');
let OPTION_STRIKE_LIST = NSE_OPTION_STRIKE_LIST

const MCX_PREVIOUS_DAY = g_config.get('mcx_previous_day_date');
const MCX_CURRENT_DAY = g_config.get('mcx_current_day_date');
const OVX = g_config.get('OVX'); //CRUDE vix
const VXSLV = g_config.get("VXSLV") //SILVER VIX
const GVZ = g_config.get("GVZ") //GOLD VIX
const VIX = g_config.get("VIX") //CBOE Volatility Index

// Hedge strike distance (in points) — how far OTM to place the hedge leg's CE/PE strike
// relative to the underlying's own ATM strike. Configurable per instrument class since a
// stock's ATM±diff needs to be much tighter than NIFTY/BANK NIFTY's. Used by the Option
// Strike Search popup (optionStrikeSearch.js).
const HEDGE_DIFF_NIFTY = parseFloat(g_config.get('hedge_diff_nifty')) || 500;
const HEDGE_DIFF_BANKNIFTY = parseFloat(g_config.get('hedge_diff_banknifty')) || 500;
const HEDGE_DIFF_STOCKS = parseFloat(g_config.get('hedge_diff_stocks')) || 50;

// Which expiry's contracts dataLoad.js pulls into FUTURE_INTRUMENT_LIST — "YYYY-MM"
// (e.g. "2026-09"), or blank to keep the default behavior of always picking each
// underlying's nearest-expiry contract. Useful during rollover week to deliberately pin
// to the NEXT month instead of the about-to-expire near-month contract.
const FUTURE_EXPIRY_MONTH = (g_config.get('future_expiry_month') || '').trim();

// Date picker for the day-date fields: ABANDONED. MonkeyConfig's default 'iframe' mode
// renders the Settings dialog inside a fresh <iframe src="about:blank"> — a genuinely
// separate document. jQuery UI's datepicker attached across that boundary (element in the
// iframe, widget loaded in the outer window) crashed inside jQuery's own getStyles()
// (`ownerDocument.defaultView` null — a known-fragile class of cross-document jQuery UI
// bug), and separately the theme's icon/background images 404'd because GM_addStyle-
// injected CSS has no way to rebase its relative url()s off our vendor folder — they
// resolve against kite.zerodha.com's own origin instead. Not worth fighting further for a
// date field; the four day-date settings (previous_day_date/current_day_date/
// mcx_previous_day_date/mcx_current_day_date) are back to plain 'text' fields, labeled
// "(YYYY-MM-DD)" so the expected format is explicit even without a picker.