let MCX_FUTURE_STRIKE_DIFF = {
	'CRUDEOIL': '50,50',
	'CRUDEOILM': '50,50',
	'GOLD': '500,500',
	'GOLDM': '500,500',
	'NATGASMINI': '5,5',
	'NATURALGAS': '5,5',
	'SILVER': '500,500',
	'SILVERM': '500,500',
	'USDINR': '0.25,0.25',
}

let COMMODITIES_FUTURE_INSTRUMENT_LIST = []; // populated by dataLoad.js from the Kite Instruments cache (per-commodity expiry override, else nearest)

// Every MCX futures contract per commodity (all expiries, not just the resolved one above) —
// {name: [{expiry:'YYYY-MM-DD', token, tradingsymbol, lot_size}, ...]}, sorted by expiry
// ascending. Populated by dataLoad.js alongside COMMODITIES_FUTURE_INSTRUMENT_LIST — needed
// for curve-structure (contango/backwardation) comparison, which needs the NEAR *and* NEXT
// contract at once, not just the single "current" one every other feature in this app uses.
let MCX_FUT_CURVE = {};

