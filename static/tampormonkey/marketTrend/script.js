const my_css = GM_getResourceText("TOASTIFY_CSS");
const boot_css = GM_getResourceText("BOOTSTRAP_CSS");
const common_css = GM_getResourceText("COMMON_CSS");
const popup_window_css = GM_getResourceText("POPUP_WINDOW_CSS");


GM_addStyle(my_css);
/*GM_addStyle(boot_css);*/
GM_addStyle(common_css);
GM_addStyle(popup_window_css);


window.jQ = jQuery.noConflict(true);
const g_config = new MonkeyConfig({
    title: 'Market Trend Settings',
    menuCommand: true,
    onSave: reloadPage,
    params: {
        previousDayDate: {
            type: 'text',
            default: moment().subtract(1, "days").format("YYYY-MM-DD")
        },
        currentDayDate: {
            type: 'text',
            default: moment().format("YYYY-MM-DD")
        },
        basket: {
            type: 'text',
            default: 26157565
        },
        margin: {
            type: 'text',
            default: 10000
        },
        logging: {
            type: 'select',
            choices: ['Info', 'Debug', 'None'],
            values: [D_LEVEL_INFO, D_LEVEL_DEBUG, D_LEVEL_NONE],
            default: D_LEVEL_NONE
        },
    }
});
const VERSION = "v1.0";
const BASE_URL = "https://kite.zerodha.com";
const PREVIOUS_DAY_DATE = g_config.get('previousDayDate');
const CURRENT_DAY = g_config.get('currentDayDate');
const D_LEVEL = g_config.get('logging');
let date = new Date().toJSON().slice(0, 10);
const BASKET = g_config.get('basket');
const MARGIN = g_config.get('margin');
let weightIndex = []
let nseStrikeDiff = {
    'AARTIIND': 20,
    'ABB': 100,
    'ABBOTINDIA': 500,
    'ABCAPITAL': 5,
    'ABFRL': 5,
    'ACC': 20,
    'ADANIENT': 50,
    'ADANIPORTS': 20,
    'ALKEM': 100,
    'AMBUJACEM': 10,
    'APOLLOHOSP': 50,
    'APOLLOTYRE': 5,
    'ASHOKLEY': 5,
    'ASIANPAINT': 20,
    'ASTRAL': 20,
    'ATUL': 100,
    'AUBANK': 10,
    'AUROPHARMA': 20,
    'AXISBANK': 10,
    'BAJAJ-AUTO': 100,
    'BAJAJFINSV': 20,
    'BAJFINANCE': 100,
    'BALKRISIND': 40,
    'BALRAMCHIN': 5,
    'BANDHANBNK': 5,
    'BANKBARODA': 5,
    'BATAINDIA': 20,
    'BEL': 5,
    'BERGEPAINT': 10,
    'BHARATFORG': 40,
    'BHARTIARTL': 20,
    'BHEL': 10,
    'BIOCON': 10,
    'BOSCHLTD': 500,
    'BPCL': 10,
    'BRITANNIA': 50,
    'BSOFT': 20,
    'CANBK': 5,
    'CANFINHOME': 20,
    'CHAMBLFERT': 10,
    'CHOLAFIN': 20,
    'CIPLA': 20,
    'COALINDIA': 10,
    'COFORGE': 200,
    'COLPAL': 40,
    'CONCOR': 20,
    'COROMANDEL': 20,
    'CROMPTON': 10,
    'CUB': 2,
    'CUMMINSIND': 80,
    'DABUR': 10,
    'DALBHARAT': 40,
    'DEEPAKNTR': 40,
    'DIVISLAB': 50,
    'DIXON': 200,
    'DLF': 20,
    'DRREDDY': 50,
    'EICHERMOT': 50,
    'ESCORTS': 40,
    'EXIDEIND': 10,
    'FEDERALBNK': 5,
    'GAIL': 5,
    'GLENMARK': 40,
    'GMRINFRA': 2,
    'GNFC': 20,
    'GODREJCP': 20,
    'GODREJPROP': 100,
    'GRANULES': 10,
    'GRASIM': 20,
    'GUJGASLTD': 10,
    'HAL': 50,
    'HAVELLS': 40,
    'HCLTECH': 20,
    'HDFCAMC': 100,
    'HDFCBANK': 10,
    'HDFCLIFE': 5,
    'HEROMOTOCO': 100,
    'HINDALCO': 10,
    'HINDCOPPER': 5,
    'HINDPETRO': 5,
    'HINDUNILVR': 20,
    'ICICIBANK': 10,
    'ICICIGI': 40,
    'ICICIPRULI': 10,
    'IDEA': 2,
    'IDFC': 2,
    'IDFCFIRSTB': 1,
    'IEX': 5,
    'IGL': 10,
    'INDHOTEL': 10,
    'INDIACEM': 5,
    'INDIAMART': 40,
    'INDIGO': 100,
    'INDUSINDBK': 20,
    'INDUSTOWER': 10,
    'INFY': 20,
    'IOC': 5,
    'IPCALAB': 40,
    'IRCTC': 20,
    'ITC': 5,
    'JINDALSTEL': 20,
    'JKCEMENT': 100,
    'JSWSTEEL': 10,
    'JUBLFOOD': 10,
    'KOTAKBANK': 20,
    'LALPATHLAB': 40,
    'LAURUSLABS': 10,
    'LICHSGFIN': 20,
    'LT': 50,
    'LTF': 5,
    'LTIM': 50,
    'LTTS': 100,
    'LUPIN': 40,
    'M&M': 50,
    'M&MFIN': 5,
    'MANAPPURAM': 5,
    'MARICO': 10,
    'MARUTI': 100,
    'MCX': 100,
    'METROPOLIS': 40,
    'MFSL': 20,
    'MGL': 40,
    'MOTHERSON': 2,
    'MPHASIS': 100,
    'MRF': 1000,
    'MUTHOOTFIN': 40,
    'NATIONALUM': 5,
    'NAUKRI': 100,
    'NAVINFLUOR': 40,
    'NESTLEIND': 20,
    'NMDC': 5,
    'NTPC': 5,
    'OBEROIRLTY': 40,
    'OFSS': 200,
    'ONGC': 5,
    'PAGEIND': 500,
    'PEL': 20,
    'PERSISTENT': 200,
    'PETRONET': 5,
    'PFC': 10,
    'PIDILITIND': 40,
    'PIIND': 100,
    'PNB': 5,
    'POLYCAB': 100,
    'POWERGRID': 5,
    'PVRINOX': 40,
    'RAMCOCEM': 20,
    'RBLBANK': 10,
    'RECLTD': 20,
    'RELIANCE': 20,
    'SAIL': 5,
    'SBICARD': 10,
    'SBILIFE': 20,
    'SBIN': 10,
    'SHREECEM': 500,
    'SHRIRAMFIN': 40,
    'SIEMENS': 100,
    'SRF': 40,
    'SUNPHARMA': 20,
    'SUNTV': 10,
    'SYNGENE': 20,
    'TATACHEM': 20,
    'TATACOMM': 40,
    'TATACONSUM': 10,
    'TATAMOTORS': 10,
    'TATAPOWER': 10,
    'TATASTEEL': 5,
    'TCS': 50,
    'TECHM': 20,
    'TITAN': 20,
    'TORNTPHARM': 40,
    'TRENT': 100,
    'TVSMOTOR': 40,
    'UBL': 40,
    'ULTRACEMCO': 100,
    'UNITDSPR': 20,
    'UPL': 5,
    'VEDL': 20,
    'VOLTAS': 20,
    'WIPRO': 5,
    'ZYDUSLIFE': 20,
    'NIFTY 50': 50,
    'NIFTY MID SELECT': 25,
    'NIFTY FIN SERVICE': 50,
    'NIFTY BANK': 100,
    'BANKEX': 100,
}


let FOLIST_ONE = [
    'AUBANK',
    'AXISBANK',
    'BANDHANBNK',
    'BANKBARODA',
    'FEDERALBNK',
    'HDFCBANK',
    'ICICIBANK',
    'IDFCFIRSTB',
    'INDUSINDBK',
    'KOTAKBANK',
    'PNB',
    'SBIN',
    'ADANIENT',
    'ADANIPORTS',
    'APOLLOHOSP',
    'ASIANPAINT',
    'BAJAJ-AUTO',
    'BAJFINANCE',
    'BAJAJFINSV',
    'BPCL',
    'BHARTIARTL',
    'BRITANNIA',
    'CIPLA',
    'COALINDIA',
    'DIVISLAB',
    'DRREDDY',
    'EICHERMOT',
    'GRASIM',
    'HCLTECH',
    'HDFCLIFE',
    'HEROMOTOCO',
    'HINDALCO',
    'HINDUNILVR',
    'ITC',
    'INFY',
    'JSWSTEEL',
    'LTIM',
    'LT',
    'M&M',
    'MARUTI',
    'NTPC',
    'NESTLEIND',
    'ONGC',
    'POWERGRID',
    'RELIANCE',
    'SBILIFE',
    'SUNPHARMA',
    'TCS',
    'TATACONSUM',
    'TATAMOTORS',
    'TATASTEEL',
    'TECHM',
    'TITAN',
    'UPL',
    'ULTRACEMCO',
    'WIPRO',
    'CHOLAFIN',
    'HDFCAMC',
    'ICICIGI',
    'ICICIPRULI',
    'IEX',
    'LICHSGFIN',
    'MUTHOOTFIN',
    'PFC',
    'RECLTD',
    'SBICARD',
    'SHRIRAMFIN',
    'ABBOTINDIA',
    'ASHOKLEY',
    'ASTRAL',
    'AUROPHARMA',
    'BALKRISIND',
    'BHARATFORG',
    'COFORGE',
    'CONCOR',
    'CUMMINSIND',
    'GODREJPROP',
    'HINDPETRO',
    'INDHOTEL',
    'JUBLFOOD',
    'MRF',
    'MPHASIS',
    'PAGEIND',
    'PERSISTENT',
    'POLYCAB',
    'VOLTAS',
]

let FOLIST_TWO = [
    'NAUKRI',
    'INDIACEM',
    'GRANULES',
    'PEL',
    'GUJGASLTD',
    'MGL',
    'UNITDSPR',
    'ZYDUSLIFE',
    'ALKEM',
    'CANFINHOME',
    'TORNTPHARM',
    'IDEA',
    'DEEPAKNTR',
    'COROMANDEL',
    'CHAMBLFERT',
    'BIOCON',
    'PIDILITIND',
    'SUNTV',
    'GLENMARK',
    'LUPIN',
    'MFSL',
    'RAMCOCEM',
    'LTF',
    'LALPATHLAB',
    'BATAINDIA',
    'UBL',
    'COLPAL',
    'DIXON',
    'IPCALAB',
    'LTTS',
    'IGL',
    'BALRAMCHIN',
    'METROPOLIS',
    'AARTIIND',
    'EXIDEIND',
    'ABFRL',
    'ATUL',
    'M&MFIN',
    'TVSMOTOR',
    'LAURUSLABS',
    'DALBHARAT',
    'BERGEPAINT',
    'TATAPOWER',
    'GAIL',
    'TATACOMM',
    'SYNGENE',
    'MCX',
    'GODREJCP',
    'HAVELLS',
    'IRCTC',
    'AMBUJACEM',
    'TATACHEM',
    'PETRONET',
    'IOC',
    'MARICO',
    'PVRINOX',
    'MOTHERSON',
    'BOSCHLTD',
    'MANAPPURAM',
    'IDFC',
    'INDUSTOWER',
    'SIEMENS',
    'ACC',
    'RBLBANK',
    'CANBK',
    'SHREECEM',
    'INDIGO',
    'INDIAMART',
    'BHEL',
    'HAL',
    'NAVINFLUOR',
    'ABB',
    'DABUR',
    'BEL',
    'JINDALSTEL',
    'APOLLOTYRE',
    'SAIL',
    'NMDC',
    'CUB',
    'CROMPTON',
    'HINDCOPPER',
    'VEDL',
    'GNFC',
    'GMRINFRA',
    'PIIND',
    'OBEROIRLTY',
    'DLF',
    'SRF',
    'JKCEMENT',
    'NATIONALUM',
    'ABCAPITAL',
    'TRENT',
    'OFSS',
    'ESCORTS',
    'BSOFT'
]


let instrumentTokens = {
    'AARTIIND': 1793,
    'ABB': 3329,
    'ACC': 5633,
    'ADANIENT': 6401,
    'APOLLOHOSP': 40193,
    'APOLLOTYRE': 41729,
    'ASHOKLEY': 54273,
    'IEX': 56321,
    'ASIANPAINT': 60417,
    'ATUL': 67329,
    'AUROPHARMA': 70401,
    'BAJFINANCE': 81153,
    'BALKRISIND': 85761,
    'BALRAMCHIN': 87297,
    'BATAINDIA': 94977,
    'BEL': 98049,
    'BERGEPAINT': 103425,
    'BHARATFORG': 108033,
    'BHEL': 112129,
    'HDFCLIFE': 119553,
    'BPCL': 134657,
    'BRITANNIA': 140033,
    'CANFINHOME': 149249,
    'CHAMBLFERT': 163073,
    'EXIDEIND': 173057,
    'CHOLAFIN': 175361,
    'CIPLA': 177665,
    'COROMANDEL': 189185,
    'DABUR': 197633,
    'DRREDDY': 225537,
    'EICHERMOT': 232961,
    'ESCORTS': 245249,
    'FEDERALBNK': 261889,
    'GNFC': 300545,
    'GRASIM': 315393,
    'AMBUJACEM': 325121,
    'HDFCBANK': 341249,
    'HEROMOTOCO': 345089,
    'HINDALCO': 348929,
    'HINDUNILVR': 356865,
    'HINDPETRO': 359937,
    'INDHOTEL': 387073,
    'INDIACEM': 387841,
    'INFY': 408065,
    'IOC': 415745,
    'IPCALAB': 418049,
    'ITC': 424961,
    'CUMMINSIND': 486657,
    'KOTAKBANK': 492033,
    'TRENT': 502785,
    'LICHSGFIN': 511233,
    'M&M': 519937,
    'RAMCOCEM': 523009,
    'MFSL': 548353,
    'BOSCHLTD': 558337,
    'BANDHANBNK': 579329,
    'MRF': 582913,
    'HAL': 589569,
    'PEL': 617473,
    'ONGC': 633601,
    'PIDILITIND': 681985,
    'RELIANCE': 738561,
    'SAIL': 758529,
    'SBIN': 779521,
    'VEDL': 784129,
    'SHREECEM': 794369,
    'SIEMENS': 806401,
    'SRF': 837889,
    'SUNPHARMA': 857857,
    'TATACHEM': 871681,
    'TATAPOWER': 877057,
    'TATACONSUM': 878593,
    'TATAMOTORS': 884737,
    'TATASTEEL': 895745,
    'TITAN': 897537,
    'TORNTPHARM': 900609,
    'VOLTAS': 951809,
    'TATACOMM': 952577,
    'WIPRO': 969473,
    'MARICO': 1041153,
    'MOTHERSON': 1076225,
    'HDFCAMC': 1086465,
    'SHRIRAMFIN': 1102337,
    'MPHASIS': 1152769,
    'BANKBARODA': 1195009,
    'GAIL': 1207553,
    'CONCOR': 1215745,
    'ICICIBANK': 1270529,
    'INDUSINDBK': 1346049,
    'CUB': 1459457,
    'AXISBANK': 1510401,
    'NATIONALUM': 1629185,
    'JINDALSTEL': 1723649,
    'BSOFT': 1790465,
    'HCLTECH': 1850625,
    'GLENMARK': 1895937,
    'ZYDUSLIFE': 2029825,
    'DALBHARAT': 2067201,
    'TVSMOTOR': 2170625,
    'METROPOLIS': 2452737,
    'POLYCAB': 2455041,
    'HAVELLS': 2513665,
    'GODREJCP': 2585345,
    'SYNGENE': 2622209,
    'LUPIN': 2672641,
    'UNITDSPR': 2674433,
    'GUJGASLTD': 2713345,
    'BHARTIARTL': 2714625,
    'PNB': 2730497,
    'INDIAMART': 2745857,
    'OFSS': 2748929,
    'CANBK': 2763265,
    'DIVISLAB': 2800641,
    'MARUTI': 2815745,
    'IDFCFIRSTB': 2863105,
    'INDIGO': 2865921,
    'IGL': 2883073,
    'UPL': 2889473,
    'PETRONET': 2905857,
    'BIOCON': 2911489,
    'LT': 2939649,
    'ULTRACEMCO': 2952193,
    'TCS': 2953217,
    'COFORGE': 2955009,
    'NTPC': 2977281,
    'LALPATHLAB': 2983425,
    'ALKEM': 2995969,
    'JSWSTEEL': 3001089,
    'GRANULES': 3039233,
    'IDFC': 3060993,
    'PVRINOX': 3365633,
    'JKCEMENT': 3397121,
    'M&MFIN': 3400961,
    'SUNTV': 3431425,
    'GMRINFRA': 3463169,
    'TECHM': 3465729,
    'IRCTC': 3484417,
    'NAUKRI': 3520257,
    'PFC': 3660545,
    'IDEA': 3677697,
    'PAGEIND': 3689729,
    'ASTRAL': 3691009,
    'NAVINFLUOR': 3756033,
    'DLF': 3771393,
    'POWERGRID': 3834113,
    'ADANIPORTS': 3861249,
    'COLPAL': 3876097,
    'NMDC': 3924993,
    'RECLTD': 3930881,
    'BAJAJ-AUTO': 4267265,
    'BAJAJFINSV': 4268801,
    'UBL': 4278529,
    'CROMPTON': 4376065,
    'MGL': 4488705,
    'LTIM': 4561409,
    'GODREJPROP': 4576001,
    'ABBOTINDIA': 4583169,
    'HINDCOPPER': 4592385,
    'NESTLEIND': 4598529,
    'SBICARD': 4600577,
    'JUBLFOOD': 4632577,
    'PERSISTENT': 4701441,
    'RBLBANK': 4708097,
    'LTTS': 4752385,
    'ICICIPRULI': 4774913,
    'MANAPPURAM': 4879617,
    'LAURUSLABS': 4923905,
    'DEEPAKNTR': 5105409,
    'OBEROIRLTY': 5181953,
    'COALINDIA': 5215745,
    'AUBANK': 5436929,
    'ABCAPITAL': 5533185,
    'DIXON': 5552641,
    'ICICIGI': 5573121,
    'SBILIFE': 5582849,
    'MUTHOOTFIN': 6054401,
    'PIIND': 6191105,
    'LTF': 6386689,
    'INDUSTOWER': 7458561,
    'ABFRL': 7707649,
    'MCX': 7982337,
    'NIFTY 50': 256265,
    'SENSEX': 265,
    'NIFTY MIDCAP 100': 256777,
    'NIFTY BANK': 260105,
    'NIFTY 100': 260617,
    'NIFTY FIN SERVICE': 257801,
    'NIFTY IT': 259849,
    'NIFTY MIDCAP 50': 260873,
    'NIFTY PHARMA': 262409,
    'NIFTY AUTO': 263433,
    'NIFTY METAL': 263689,
    'NIFTY 200': 264457,
    'NIFTY MIDCAP 150': 266249,
    'NIFTY SMLCAP 250': 267273,
    'NIFTY NEXT 50': 270857,
    'NIFTY MID SELECT': 288009,
}





function callAddToWatchList() {
    for (let i = 0; i < FOLIST_TWO.length; i++) {
        addToWatchList("NSE", FOLIST_TWO[i], (i + 1), 7)
        callSleepForAWhile(1000)
    }
}

function addToWatchList(segment, tradingsymbol, weight, watch_id) {
    jQ.ajaxSetup({
        headers: {
            'x-csrftoken': `${getCookie('public_token')}`
        }
    });
    return jQ.ajax({
        url: BASE_URL + `/api/marketwatch/${watch_id}/items`,
        type: 'POST',
        data: {
            segment: segment,
            tradingsymbol: tradingsymbol,
            weight: weight,
            watch_id: watch_id
        }
    });
}


jQ(document).ready(function () {
    setTimeout(function () {
        makeUIChanges();
        saveVixQuote()
    }, 2000)

});

function saveVixQuote() {
    if (!localStorage.getItem("VIX_QUOTE")) {
        jQ.when(getHistoricalData(264969, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE, 'day')).done(function (res) {
            localStorage.setItem("VIX_QUOTE", JSON.stringify(res));
        })
    }
}

function makeUIChanges() {
    var html = '';
    html += '<a href="#" id="get-entoken">'
    html += 'Token'
    html += '</a>'
    html += '<a href="#" id="clean-storage">'
    html += 'Clean'
    html += '</a>'
    jQ('body').first().find(".app-nav").append(html);
}

jQ(document).on("click", "#get-entoken", function (e) {
    e.preventDefault();
    navigator.clipboard.writeText(getCookie('enctoken'));
    saveToken();
    /*callAddToWatchList();*/
});

jQ(document).on("click", "#clean-storage", function (e) {
    e.preventDefault();
    clearLocalStorage()
});

function saveToken() {
    return jQ.ajax({
        type: 'POST',
        url: 'http://localhost:9080/saveToken',
        data: { token: getCookie('enctoken') },
    });
}


function callSleepForAWhile(times) {
    return new Promise((resolve, reject) => {
        setTimeout(function () {
            resolve();
        }, times)
    });
}


let instrumentsMap = {}


async function generateTrend() {
    await callSleepForAWhile(2000);
    let marketWatchSideBar = jQ(".marketwatch-sidebar");
    let tabs = marketWatchSideBar.find(".marketwatch-selector a.item");
    let instrumentsWrapper = jQ(".instruments");
    let instruments = instrumentsWrapper.find(".vddl-list .instrument");
    jQ.each(tabs, function (index, item) {
        if (jQ(item).hasClass("selected")) {
            instrumentsMap = {}
            if (!localStorage.getItem("INSTRUMENT_LIST_" + index)) {
                if (instruments.length > 0) {
                    jQ(instruments).each(function (iindex, iitem) {
                        let name = jQ(this).find(".symbol").find(".nice-name").html();
                        let price = jQ(this).find(".price").find(".last-price").html();
                        let perc = jQ(this).find(".price-change").find(".price-absolute").html();
                        let insMap = {}
                        insMap['name'] = name.trim();
                        insMap['price'] = parseFloat(price.trim()).toFixed(2)
                        insMap['perc'] = perc.trim();
                        let prevPrice = parseFloat(price.trim()) - parseFloat(perc.trim());
                        insMap['prevPrice'] = parseFloat(prevPrice).toFixed(2);
                        instrumentsMap[name] = insMap;
                    });
                    localStorage.setItem("INSTRUMENT_LIST_" + index, JSON.stringify(instrumentsMap));
                }
            } else {
                instrumentsMap = JSON.parse(localStorage.getItem("INSTRUMENT_LIST_" + index));
            }
            let bulls = 0;
            let bears = 0;
            jQ(instruments).each(function (iindex, iitem) {
                let name = jQ(this).find(".symbol").find(".nice-name").html();
                let price = jQ(this).find(".price").find(".last-price").html();
                if (name != "INDIA VIX") {
                    let that = jQ(this);
                    that.find(".symbol").find(".trend-class").remove();
                    that.find(".symbol").find(".draw-points").remove();
                    that.find(".symbol").find(".add-to-basket").remove();
                    that.find(".symbol").find(".script-weight").remove();
                    let trendMap = getTrend(instrumentsMap[name])
                    if (trendMap['trend'] == "OIBS") {
                        bulls++;
                    } else {
                        bears++;
                    }
                    that.find(".symbol").prepend(trendMap['openedTrend']);
                    that.find(".symbol").find(".trend-class").attr("data-name", name);
                    that.find(".symbol").find(".trend-class").attr("data-trend", trendMap['trend']);
                    let draw = '<span data-trend="' + trendMap['trend'] + '" data-name="' + name + '" class="badge bg-secondary draw-points">Draw</span>'
                    let add = '<span data-price="' + parseFloat(price.trim()).toFixed(2) + '" data-trend="' + trendMap['trend'] + '" data-name="' + name + '" class="badge bg-primary add-to-basket">+</span>'
                    that.find(".symbol").prepend(draw);

                    if (index != 0) {
                        that.find(".symbol").prepend(add);
                    }
                    if (index == 1 || index == 2) {
                        let indexType = "NIFTY 50"
                        if (index == 2) {
                            indexType = "NIFTY BANK"
                        }
                        if (getWeightAge(indexType, name, true)) {
                            let weight = '<span class="badge bg-dark script-weight">' + getWeightAge(indexType, name, true) + '</span>'
                            that.find(".symbol").append(weight);
                        }
                    }
                }
            });

            jQ(item).find(".bullsVersesBears").remove();
            jQ(item).find(".add-all-scripts").remove();
            let countMaprkup = ''
            countMaprkup += '<span class="bullsVersesBears bg-success">' + bulls + '</span>'
            countMaprkup += '<span class="bullsVersesBears bg-danger">' + bears + '</span>'
            let addAll = ''
            addAll += '<span class="bg-warning add-all-scripts">+</span>'

            jQ(item).append(countMaprkup)
            if (index != 0) {
                jQ(item).append(addAll)
            }
        }
    })
}

jQ(document).on("click", ".add-all-scripts", function () {
    addAllToBasket()
});

let baskets = [26184477, 26185846, 26185849]
async function addAllToBasket() {
    let instrumentsWrapper = jQ(".instruments");
    let instruments = instrumentsWrapper.find(".vddl-list .instrument");
    weightIndex = [];
    for (let i = 0; i < instruments.length; i++) {
        let that = jQ(instruments[i]);
        let add = that.find(".symbol").find(".add-to-basket");
        let name = add.attr("data-name");
        let trend = add.attr("data-trend");
        let price = add.attr("data-price");
        let transaction_type = "SELL"
        if (trend == "OIBS") {
            transaction_type = "BUY"
        }
        let quantity = (MARGIN / (parseFloat(price) / 5)).toFixed(0)
        let params = { "transaction_type": transaction_type, "product": "MIS", "order_type": "MARKET", "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": 0, "trigger_price": 0, "disclosed_quantity": 0, "tags": [] }
        let tradingsymbol = name
        let exchange = "NSE"
        let weight = (weightIndex.length + 1)

        if (i <= 19) {
            addToBasket(tradingsymbol, exchange, weight, params, baskets[0])
            weightIndex = [];
        }
        if (i > 19 && i <= 39) {
            addToBasket(tradingsymbol, exchange, weight, params, baskets[1])
            weightIndex = [];
        }

        if (i > 39 && i < 59) {
            addToBasket(tradingsymbol, exchange, weight, params, baskets[2])
            weightIndex = [];
        }

        weightIndex.push(name)
        await callSleepForAWhile(1000)
    }
    alert("Added all scripts to the Basket.")
}



jQ(document).on("click", ".add-to-basket", function () {
    let name = jQ(this).attr("data-name");
    let trend = jQ(this).attr("data-trend");
    let price = jQ(this).attr("data-price");
    let transaction_type = "SELL"
    if (trend == "OIBS") {
        transaction_type = "BUY"
    }
    let quantity = (MARGIN / (parseFloat(price) / 5)).toFixed(0)
    let params = { "transaction_type": transaction_type, "product": "MIS", "order_type": "MARKET", "validity": "DAY", "validity_ttl": 1, "variety": "regular", "quantity": parseInt(quantity), "price": 0, "trigger_price": 0, "disclosed_quantity": 0, "tags": [] }
    let tradingsymbol = name
    let exchange = "NSE"
    let weight = (weightIndex.length + 1)
    addToBasket(tradingsymbol, exchange, weight, params, BASKET)
    weightIndex.push(name)
});




jQ(document).on("click", ".marketwatch-selector a.item", function () {
    generateTrend()
});


jQ(document).on("click", ".draw-points", function () {
    let name = jQ(this).attr("data-name");
    let trend = jQ(this).attr("data-trend");
    let strikeData = getStrikeDetails(instrumentsMap[name], name);

    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];

    var vix = getVixRange(parseFloat(instrumentsMap[name].prevPrice), parseFloat(vixQuote[4]))

    var vixLowerRange = 0;
    var vixUpperRange = 0;
    var vixDDRange = 0;

    vixLowerRange = parseFloat(vix.vixDDLower)
    vixUpperRange = parseFloat(vix.vixDDUpper)
    vixDDRange = parseFloat(vix.vixDDRange)

    let coordinates = []

    let dataMap = {}
    dataMap['segment'] = 'NA'
    dataMap['tradingsymbol'] = name
    dataMap['token'] = 'NA'
    dataMap['chartName'] = name + '-' + date;
    dataMap['openedTrend'] = trend
    let lineArr = []

    let lineMap = {}

    lineMap = { coordinates: strikeData.bstrikeOne, color: 1, label: 'Below Strike 1 (Bearish Below)' }
    lineArr.push(lineMap)
    lineMap = { coordinates: strikeData.bstrikeTwo, color: 1, label: 'Below Strike 2 (Bearish Below)' }
    lineArr.push(lineMap)

    lineMap = { coordinates: strikeData.ustrikeOne, color: 2, label: 'Above Strike 1 (Bullish Above)' }
    lineArr.push(lineMap)
    lineMap = { coordinates: strikeData.ustrikeTwo, color: 2, label: 'Above Strike 2 (Bullish Above)' }
    lineArr.push(lineMap)

    lineMap = { coordinates: vixLowerRange, color: 3, label: 'Vix Lower Range ( If breaks are working. It should stop here) ' }
    lineArr.push(lineMap)
    lineMap = { coordinates: vixUpperRange, color: 4, label: 'Vix Upper Range ( If breaks are working. It should stop here)' }
    lineArr.push(lineMap)

    dataMap['lines'] = lineArr
    coordinates.push(dataMap)
    processHandleKiteCall(coordinates)
});

async function processHandleKiteCall(coordinates) {
    await handleKiteCall(coordinates)
}

function handleKiteCall(coordinates) {
    return new Promise((resolve, reject) => {
        jQ.ajax({
            type: 'POST',
            url: 'http://localhost:9080/handleKiteCall',
            data: { coordinates: JSON.stringify(coordinates) },
            success: function (data) {
                resolve(data);
            }
        });
    });
}


jQ(document).on("click", ".trend-class", function () {
    let name = jQ(this).attr("data-name");
    let trend = jQ(this).attr("data-trend");
    let data = getStrikeDetails(instrumentsMap[name], name);
    let chartId = 'chart-' + name.replaceAll(" ", "-") + '-' + trend;
    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];

    var vix = getVixRange(parseFloat(instrumentsMap[name].prevPrice), parseFloat(vixQuote[4]))

    var vixLowerRange = 0;
    var vixUpperRange = 0;
    var vixDDRange = 0;

    vixLowerRange = parseFloat(vix.vixDDLower)
    vixUpperRange = parseFloat(vix.vixDDUpper)
    vixDDRange = parseFloat(vix.vixDDRange)

    let matrixTable = ''
    matrixTable += '<tr class="bg-success">'
    matrixTable += '<th>UPPER STRIKE 1</th>'
    matrixTable += '<td>' + data.ustrikeOne + '</td>'
    matrixTable += '</tr>'
    matrixTable += '<tr class="bg-success">'
    matrixTable += '<th>UPPER STRIKE 2</th>'
    matrixTable += '<td>' + data.ustrikeTwo + '</td>'
    matrixTable += '</tr>'
    matrixTable += '<tr class="bg-danger">'
    matrixTable += '<th>BELOW STRIKE 1</th>'
    matrixTable += '<td>' + data.bstrikeOne + '</td>'
    matrixTable += '</tr>'
    matrixTable += '<tr class="bg-danger">'
    matrixTable += '<th>BELOW STRIKE 2</th>'
    matrixTable += '<td>' + data.bstrikeTwo + '</td>'
    matrixTable += '</tr>'
    matrixTable += '<tr class="bg-success">'
    matrixTable += '<th>VIX LOWER RANGE</th>'
    matrixTable += '<td>' + vixLowerRange + '</td>'
    matrixTable += '</tr>'
    matrixTable += '<tr class="bg-danger">'
    matrixTable += '<th >VIX UPPER RANGE</th>'
    matrixTable += '<td>' + vixUpperRange + '</td>'
    matrixTable += '<tr rowspan="2">'
    matrixTable += '<td colspan="2" id="' + chartId + '"></td>'
    matrixTable += '</tr>'


    let toolTip = ''

    toolTip += '<table id="instrument-matrix-table" class="table table-striped table-bordered dt-responsive nowrap">'
    toolTip += '<tbody>' + matrixTable + '</tbody>'
    toolTip += '</table>'

    showTippy(this, toolTip, chartId);
    showChart(chartId, name, vixLowerRange, vixUpperRange,data)

});


function showChart(chartId, name, vixLowerRange, vixUpperRange,data) {
    jQ.when(getHistoricalData(instrumentTokens[name], CURRENT_DAY, CURRENT_DAY, 'minute')).done(function (res) {
        let quote = []
        $.each(res.data.candles, function (index, item) {
            let map = {}
            map['date'] = item[0]
            map.open = item[1]
            map.high = item[2]
            map.low = item[3]
            map.close = item[4]
            quote.push(map);
        })

        let categoryList = []

        let dateIndex = 0
        $.each(quote, function (index, item) {
            let map = {}
            map.label = item.date;
            map.x = dateIndex;
            categoryList.push(map)
            dateIndex++;
        });

        let dataList = []
        let min = 0
        let max = 0
        dateIndex = 0

        $.each(quote, function (index, item) {
            let map = {}
            map.open = item.open
            map.high = item.high
            map.low = item.low
            map.close = item.close
            map.x = dateIndex

            if (index == 0) {
                min = item.high
                max = item.high
            }

            if (item.high < min) {
                min = item.high
            }

            if (item.high > max) {
                max = item.high
            }
            dataList.push(map);
            dateIndex++;
        });

        let lines = [];
    let line = {};

    line.color = "#8be73a";
    line.startvalue = vixLowerRange;
    line.displayvalue = 'Vix lower range ' + vixLowerRange;
    lines.push(line);;

    line = {};
    line.color = "#e7543a";
    line.startvalue = vixUpperRange;
    line.displayvalue = 'Vix upper range ' + vixUpperRange;
    lines.push(line);



    line = {};
    line.color = "#403ae7";
    line.startvalue = data.bstrikeOne;
    line.displayvalue = 'Bearish below/Bullish above ' + data.bstrikeOne;
    lines.push(line);

    line = {};
    line.color = "#403ae7";
    line.startvalue = data.ustrikeOne;
    line.displayvalue = 'Bullish above/Bearish below' + data.ustrikeOne;
    lines.push(line);

    line = {};
    line.color = "#9f3ae7";
    line.startvalue = data.bstrikeTwo;
    line.displayvalue = data.bstrikeTwo;
    lines.push(line);

    line = {};
    line.color = "#9f3ae7";
    line.startvalue = data.ustrikeTwo;
    line.displayvalue = data.ustrikeTwo;
    lines.push(line);


    jQ("#" + chartId).insertFusionCharts({
        type: 'candlestick',
        width: "500",
        height: "300",
        dataFormat: 'json',
        dataSource: {
            "chart": {
                "thousandSeparatorPosition": "2,3",
                "formatNumberScale": "0",
                "theme": "fusion",
                "adjustDiv": "0",
                showvalues: "0",
                labeldisplay: "ROTATE",
                rotatelabels: "1",
                "pYAxisMinValue": min,
                "pYAxisMaxValue": max,
            },
            "categories": [{
                "category": categoryList
            }],
            "dataset": [{
                "data": dataList,

            }],
            "trendlines": [{
                "line": lines
            }]
        }
    });


    })
    
}


function clearLocalStorage() {
    localStorage.removeItem("VIX_QUOTE");
    localStorage.removeItem("INSTRUMENT_LIST_0");
    localStorage.removeItem("INSTRUMENT_LIST_1");
    localStorage.removeItem("INSTRUMENT_LIST_2");
    localStorage.removeItem("INSTRUMENT_LIST_3");
    localStorage.removeItem("INSTRUMENT_LIST_4");
    localStorage.removeItem("INSTRUMENT_LIST_5");
    localStorage.removeItem("INSTRUMENT_LIST_6");
}


function getStrikeDetails(item, instrument) {
    let strikeDiff = getStrikeDiff(instrument);
    let bstrikeOne = (parseFloat(item.price) - strikeDiff);
    let bstrikeTwo = (bstrikeOne - strikeDiff);
    let ustrikeOne = (parseFloat(item.price) + strikeDiff);
    let ustrikeTwo = (ustrikeOne + strikeDiff);

    let map = {}
    map['strikeDiff'] = strikeDiff;
    map['bstrikeOne'] = bstrikeOne;
    map['bstrikeTwo'] = bstrikeTwo;
    map['ustrikeOne'] = ustrikeOne;
    map['ustrikeTwo'] = ustrikeTwo;

    return map;


}

function showTippy(target, msg, chartId) {
    var t = tippy(target, {
        content: msg,
        allowHTML: true,
        hideOnClick: true,
        trigger: "click",
        plugins: [hideOnEsc],
        showOnCreate: true,
        onHidden(instance) {
            debug('onHide');
            instance.destroy();
        },
    });


}

const hideOnEsc = {
    name: 'hideOnEsc',
    defaultValue: true,
    fn({ hide }) {
        function onKeyDown(event) {
            if (event.keyCode === 27) {
                hide();
            }
        }

        return {
            onShow() {
                document.addEventListener('keydown', onKeyDown);
            },
            onHide() {
                document.removeEventListener('keydown', onKeyDown);
            },
        };
    },
};


function getHistoricalData(code, fromDate, toDate, interval) {
    jQ.ajaxSetup({
        headers: {
            'Authorization': `enctoken ${getCookie('enctoken')}`
        }
    });
    return jQ.ajax({
        url: BASE_URL + `/oms/instruments/historical/${code}/${interval}?user_id=HY8031&oi=1&from=${fromDate}&to=${toDate}`,
        type: 'GET',
        async: true,
        cache: false,
    });
}

function getTrend(item) {
    let vixQuote = JSON.parse(localStorage.getItem("VIX_QUOTE")).data['candles'][0];

    var vix = getVixRange(parseFloat(item.prevPrice), parseFloat(vixQuote[4]))

    var vixLowerRange = 0;
    var vixUpperRange = 0;
    var vixDDRange = 0;

    vixLowerRange = parseFloat(vix.vixDDLower)
    vixUpperRange = parseFloat(vix.vixDDUpper)
    vixDDRange = parseFloat(vix.vixDDRange)


    var points = getVixPointsSupportAndResistance(vixLowerRange, vixUpperRange, vixDDRange)

    let openedTrend = ''
    let trend = ''
    let map = {}
    if (item.price <= vixUpperRange && item.price >= points[5]) {
        openedTrend = '<span class=" badge bg-danger trend-class" style="display: inline-block;">OIBR</span>'
        trend = 'OIBR'
    }

    if (item.price >= vixLowerRange && item.price <= points[4]) {
        openedTrend = '<span class="badge bg-success trend-class" style="display: inline-block;">OIBS</span>'
        trend = 'OIBS'
    }

    if (item.price > vixUpperRange) {
        openedTrend = '<span class=" badge bg-danger trend-class" style="display: inline-block;">OAR</span>'
        trend = 'OAR'
    }

    if (item.price < vixLowerRange) {
        openedTrend = '<span class=" badge bg-danger trend-class" style="display: inline-block;">OBS</span>'
        trend = 'OBS'
    }

    if (item.price > points[4] && item.price < points[5]) {
        openedTrend = '<span class=" badge bg-danger trend-class" style="display: inline-block;">OIBSR</span>'
        trend = 'OIBSR'
    }

    map['openedTrend'] = openedTrend;
    map['trend'] = trend;

    return map;

}

function getVixRange(prevQuoteData, prevVixData) {

    var vixMM = calculateVixRange("MONTHLY", prevQuoteData, prevVixData)
    var vixWW = calculateVixRange("WEEKLY", prevQuoteData, prevVixData)
    var vixDD = calculateVixRange("DAILY", prevQuoteData, prevVixData)

    let d = {}
    d.vixMMRange = vixMM.range;
    d.vixMMLower = vixMM.lNift;
    d.vixMMUpper = vixMM.uNift;

    d.vixWWRange = vixWW.range;
    d.vixWWLower = vixWW.lNift;
    d.vixWWUpper = vixWW.uNift;

    d.vixDDRange = vixDD.range;
    d.vixDDLower = vixDD.lNift;
    d.vixDDUpper = vixDD.uNift;

    return d;

}

function getSubtractNumberDiff(number) {
    if (number > 50 && number < 100) {
        return 50
    } else if (number >= 100) {
        return 100
    } else {
        return 25
    }
}

function getSubtractNumber(number) {
    if (number > 50)
        return 100
    else
        return 50
}

function getVixPointsSupportAndResistance(vixLowerRange, vixUpperRange, range) {
    var divide = 6
    var upperRange = vixUpperRange
    var lowerRange = vixLowerRange
    var minRange = range / divide
    var points = []

    var lastURange = upperRange
    var lastLRange = lowerRange
    for (i = 1; i < divide; i++) {
        lastURange = (parseFloat(lastURange) - parseFloat(minRange)).toFixed(2)
        points.push(parseFloat(lastURange));
    }

    for (i = 1; i < divide; i++) {
        lastLRange = (parseFloat(lastLRange) + parseFloat(minRange)).toFixed(2)
        points.push(parseFloat(lastLRange));
    }
    points.sort(function (a, b) { return a - b })
    return points;
}

function calculateVixRange(type, prevQuoteData, prevVixData) {
    var data = {}
    var prevData = prevQuoteData
    var previousClose = prevVixData
    var chg;
    if (type == "DAILY") {
        chg = parseFloat(previousClose) / Math.sqrt(366 - 104 - 13)
    }
    if (type == "MONTHLY") {
        chg = parseFloat(previousClose) / Math.sqrt(12)
    }
    if (type == "WEEKLY") {
        chg = parseFloat(previousClose) / Math.sqrt(52)
    }

    var range = parseFloat(prevData) * chg / 100
    var lNift = parseFloat(prevData) - range
    var uNift = parseFloat(prevData) + range


    data['chg'] = chg.toFixed(2)
    data['range'] = range.toFixed(2)
    data['lNift'] = lNift.toFixed(2)
    data['uNift'] = uNift.toFixed(2)
    return data;
}

function getStrikeDiff(instrument) {
    let strikeDiff = 100;
    console.log(instrument + "--> strike diff -->" + nseStrikeDiff[instrument])
    if (nseStrikeDiff[instrument]) {
        strikeDiff = nseStrikeDiff[instrument]
    }
    return strikeDiff;
}


function addToBasket(tradingsymbol, exchange, weight, params, basket) {
    jQ.ajaxSetup({
        headers: {
            'x-csrftoken': `${getCookie('public_token')}`
        }
    });
    return jQ.ajax({
        url: BASE_URL + `/api/baskets/${basket}/items`,
        type: 'POST',
        data: {
            tradingsymbol: tradingsymbol,
            exchange: exchange,
            weight: weight,
            params: JSON.stringify(params)
        }
    });
}

function getWeightAge(index, companyName, onlyWeight) {
    var nifty50WeightAge = {
        "HDFCBANK": 13.52,
        "RELIANCE": 9.20,
        "ICICIBANK": 7.36,
        "INFY": 5.80,
        "LT": 4.39,
        "ITC": 4.31,
        "TCS": 4.05,
        "AXISBANK": 3.22,
        "KOTAKBANK": 2.95,
        "BHARTIARTL": 2.75
    }

    var niftyBankWeightAge = {
        "HDFCBANK": 29.39,
        "ICICIBANK": 22.57,
        "KOTAKBANK": 9.92,
        "AXISBANK": 9.88,
        "SBIN": 9.87,
        "INDUSINDBK": 6.43,
        "BANKBARODA": 2.62,
        "AUBANK": 2.30,
        "FEDERALBNK": 2.13,
        "IDFCFIRSTB": 2.06,
    }


    var html = ''
    var weightAge = ''
    if (index == "NIFTY 50") {
        weightAge = nifty50WeightAge
    }

    if (index == "NIFTY BANK") {
        weightAge = niftyBankWeightAge
    }

    if (onlyWeight) {
        if (weightAge[companyName]) {
            return weightAge[companyName]
        }
    } else {
        if (weightAge[companyName]) {
            html += '<span class="text-end float-end text-warning">'
            html += weightAge[companyName] + " %";
            html += '</span>'
        }
    }
    return html;
}
