// filled at run time by indexWeights.js from niftyindices.com (no hardcoded list)
let NIFTY_50_LIST = []

// filled at run time by indexWeights.js from niftyindices.com (no hardcoded list)
let NIFTY_BANK_LIST = []

let INDICES = [
	'NIFTY 50',
	'NIFTY BANK',
	'NIFTY FIN SERVICE',
	'NIFTY MID SELECT',
	'BANKEX',
	'SENSEX',
	'GIFT NIFTY',
	'INDIA VIX'
]

// union of the live NIFTY 50 and NIFTY BANK top-10 weighted stocks, filled by indexWeights.js
let WEIGHTED_STOCKS = []

let WEIGHTED_STOCKS_WEIGHT = {
	'HDFCBANK': "[19.010%/10.94]",
	'RELIANCE': "[8.87%]",
	'ICICIBANK': "[14.11%/8.42]",
	'AXISBANK': "[10.01%]",
	'SBIN': "[9.94%]",
	'KOTAKBANK': "[9.73%]",
	'FEDERALBNK': "[6.18%]",
	'INDUSINDBK': "[4.80%]",
	'BHARTIARTL': "[5.34%]",
	'INFY': "[4.28%]"
}

// Top 10 Nifty 50 constituents by index weightage: filled at run time by indexWeights.js from niftyindices.com (no hardcoded list)
const NIFTY_50_WEIGHTED_STOCKS = {}

// Top 10 Bank Nifty constituents by index weightage: filled at run time by indexWeights.js from niftyindices.com (no hardcoded list)
const NIFTY_BANK_WEIGHTED_STOCKS = {}

/** List of all available stocks and data which changes every month*/
let FO_LIST =[]
// Index strike-diffs — NOT derivable from the Strike Intervals CSV the same way stock
// diffs are (NSE_FO_SosScheme.csv uses exchange-native codes like NIFTY/BANKNIFTY, and
// even then the CSV's own index rows are a separate question from what these dashboard
// display-name entries need); kept as small hand-maintained constants and merged into
// NSE_STRIKE_DIFF/NSE_FUTURE_STRIKE_DIFF by dataLoad.js alongside the derived stock data.
let INDEX_NSE_STRIKE_DIFF = {
    'NIFTY 50': '50,50', 'NIFTY MID SELECT': '25,25', 'NIFTY FIN SERVICE': '50,50',
    'NIFTY BANK': '100,100', 'BANKEX': '100,100', 'SENSEX': '100,100', 'GIFT NIFTY': '50,50',
};
let FUTURE_INDEX_NSE_STRIKE_DIFF = {
    'NIFTY 50': '50,50', 'NIFTY MID SELECT': '25,25', 'NIFTY FIN SERVICE': '50,50',
    'NIFTY BANK': '100,100', 'BANKEX': '100,100', 'SENSEX': '100,100', 'GIFT NIFTY': '50,50',
};
let NSE_STRIKE_DIFF = {}; // populated by dataLoad.js: Strike Intervals tab data + INDEX_NSE_STRIKE_DIFF merged in
let NSE_FUTURE_STRIKE_DIFF = {}; // populated by dataLoad.js: same stock data + FUTURE_INDEX_NSE_STRIKE_DIFF merged in
let INSTRUMENT_TOKENS = {}; // populated by dataLoad.js from the Kite Instruments cache (indices + F&O stocks only)

let FUTURE_INTRUMENT_LIST = []; // populated by dataLoad.js from the Kite Instruments cache, gated by FUTURE_EXPIRY_MONTH setting

// Every NFO/BFO futures contract per underlying (all expiries, not just the resolved one
// above), keyed by DISPLAY name (e.g. 'NIFTY 50', 'RELIANCE') — mirrors MCX_FUT_CURVE
// (constants-commodities.js) for the same curve-structure (contango/backwardation) use case.
// {name: [{expiry:'YYYY-MM-DD', token, tradingsymbol, lot_size}, ...]}, sorted by expiry asc.
let NSE_FUT_CURVE = {};