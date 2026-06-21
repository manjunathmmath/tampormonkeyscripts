/* ============================================================================
 * Triple Edge System (TES) — Instrument universe & metadata
 * ----------------------------------------------------------------------------
 * Standalone from Groot Bot. Tokens are Kite instrument_tokens (public).
 * strikeStep = ATM strike spacing (used for option-chain / OI walls).
 * fno = has an option chain (enables the OI pillar).
 * ==========================================================================*/
window.TES = window.TES || {};

TES.BASE_URL = "https://kite.zerodha.com";

// Curated liquid intraday universe (indices + high-participation F&O stocks).
// {token, exch, strikeStep, fno}
TES.INSTRUMENTS = {
    'NIFTY 50':       { token: 256265, exch: 'NSE', strikeStep: 50,  fno: true,  kind: 'index' },
    'NIFTY BANK':     { token: 260105, exch: 'NSE', strikeStep: 100, fno: true,  kind: 'index' },
    'NIFTY FIN SERVICE':{ token: 257801, exch: 'NSE', strikeStep: 50, fno: true, kind: 'index' },
    'SENSEX':         { token: 265,    exch: 'BSE', strikeStep: 100, fno: true,  kind: 'index' },
    'RELIANCE':       { token: 738561, exch: 'NSE', strikeStep: 10,  fno: true,  kind: 'stock' },
    'HDFCBANK':       { token: 341249, exch: 'NSE', strikeStep: 5,   fno: true,  kind: 'stock' },
    'ICICIBANK':      { token: 1270529,exch: 'NSE', strikeStep: 10,  fno: true,  kind: 'stock' },
    'SBIN':           { token: 779521, exch: 'NSE', strikeStep: 10,  fno: true,  kind: 'stock' },
    'AXISBANK':       { token: 1510401,exch: 'NSE', strikeStep: 10,  fno: true,  kind: 'stock' },
    'KOTAKBANK':      { token: 492033, exch: 'NSE', strikeStep: 2.5, fno: true,  kind: 'stock' },
    'INFY':           { token: 408065, exch: 'NSE', strikeStep: 10,  fno: true,  kind: 'stock' },
    'TCS':            { token: 2953217,exch: 'NSE', strikeStep: 20,  fno: true,  kind: 'stock' },
    'HCLTECH':        { token: 1850625,exch: 'NSE', strikeStep: 10,  fno: true,  kind: 'stock' },
    'WIPRO':          { token: 969473, exch: 'NSE', strikeStep: 2.5, fno: true,  kind: 'stock' },
    'TATASTEEL':      { token: 895745, exch: 'NSE', strikeStep: 2.5, fno: true,  kind: 'stock' },
    'TATAMOTORS':     { token: 884737, exch: 'NSE', strikeStep: 5,   fno: true,  kind: 'stock' },
    'LT':             { token: 2939649,exch: 'NSE', strikeStep: 20,  fno: true,  kind: 'stock' },
    'BHARTIARTL':     { token: 2714625,exch: 'NSE', strikeStep: 20,  fno: true,  kind: 'stock' },
    'ITC':            { token: 424961, exch: 'NSE', strikeStep: 2.5, fno: true,  kind: 'stock' },
    'MARUTI':         { token: 2815745,exch: 'NSE', strikeStep: 100, fno: true,  kind: 'stock' },
    'SUNPHARMA':      { token: 857857, exch: 'NSE', strikeStep: 20,  fno: true,  kind: 'stock' },
    'BAJFINANCE':     { token: 81153,  exch: 'NSE', strikeStep: 10,  fno: true,  kind: 'stock' },
    'ADANIENT':       { token: 6401,   exch: 'NSE', strikeStep: 20,  fno: true,  kind: 'stock' },
    'HINDALCO':       { token: 348929, exch: 'NSE', strikeStep: 10,  fno: true,  kind: 'stock' },
    'TITAN':          { token: 897537, exch: 'NSE', strikeStep: 50,  fno: true,  kind: 'stock' }
};

// India VIX (volatility regime input)
TES.VIX_TOKEN = 264969;

TES.instrumentList = function () { return Object.keys(TES.INSTRUMENTS); };
TES.meta = function (name) { return TES.INSTRUMENTS[name] || null; };
