let NIFTY_50_LIST = [
	'ADANIENT',
	'ADANIPORTS',
	'APOLLOHOSP',
	'ASIANPAINT',
	'AXISBANK',
	'BAJAJ-AUTO',
	'BAJFINANCE',
	'BAJAJFINSV',
	'BEL',
	'BHARTIARTL',
	'CIPLA',
	'COALINDIA',
	'DRREDDY',
	'EICHERMOT',
	'ETERNAL',
	'GRASIM',
	'HCLTECH',
	'HDFCBANK',
	'HDFCLIFE',
	'HINDALCO',
	'HINDUNILVR',
	'ICICIBANK',
	'ITC',
	'INFY',
	'INDIGO',
	'JSWSTEEL',
	'JIOFIN',
	'KOTAKBANK',
	'LT',
	'M&M',
	'MARUTI',
	'MAXHEALTH',
	'NTPC',
	'NESTLEIND',
	'ONGC',
	'POWERGRID',
	'RELIANCE',
	'SBILIFE',
	'SHRIRAMFIN',
	'SBIN',
	'SUNPHARMA',
	'TCS',
	'TATACONSUM',
	'TMPV',
	'TATASTEEL',
	'TECHM',
	'TITAN',
	'TRENT',
	'ULTRACEMCO',
	'WIPRO'
]

let NIFTY_BANK_LIST = [
	'AUBANK',
	'AXISBANK',
	'BANKBARODA',
	'CANBK',
	'FEDERALBNK',
	'HDFCBANK',
	'ICICIBANK',
	'IDFCFIRSTB',
	'INDUSINDBK',
	'KOTAKBANK',
	'PNB',
	'SBIN',
	'UNIONBANK',
	'YESBANK'
]

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

let WEIGHTED_STOCKS = [
	'HDFCBANK',
	'RELIANCE',
	'ICICIBANK',
	'AXISBANK',
	'SBIN',
	'KOTAKBANK',
	'FEDERALBNK',
	'INDUSINDBK',
	'BHARTIARTL',
	'INFY',
]

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

// Top 10 Nifty 50 constituents by index weightage (June 2026)
const NIFTY_50_WEIGHTED_STOCKS = {
	'HDFCBANK':   10.56,
	'ICICIBANK':   8.32,
	'RELIANCE':    8.27,
	'BHARTIARTL':  5.20,
	'LT':          4.43,
	'INFY':        3.77,
	'SBIN':        3.71,
	'AXISBANK':    3.42,
	'KOTAKBANK':   2.62,
	'ITC':         2.56
}

// Top 10 Bank Nifty constituents by index weightage (June 2026)
const NIFTY_BANK_WEIGHTED_STOCKS = {
	'HDFCBANK':   17.93,
	'ICICIBANK':  13.63,
	'AXISBANK':   10.28,
	'KOTAKBANK':   9.81,
	'SBIN':        9.07,
	'FEDERALBNK':  6.38,
	'INDUSINDBK':  5.40,
	'AUBANK':      4.87,
	'BANKBARODA':  4.47,
	'IDFCFIRSTB':  4.27
}

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