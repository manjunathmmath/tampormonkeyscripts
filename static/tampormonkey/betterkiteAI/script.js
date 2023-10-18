const my_css = GM_getResourceText("TOASTIFY_CSS");
const boot_css = GM_getResourceText("BOOTSTRAP_CSS");
const common_css = GM_getResourceText("COMMON_CSS");


GM_addStyle(my_css);
GM_addStyle(boot_css);
GM_addStyle(common_css);
var context = window,
    options = "{    anonymizeIp: true,    colorDepth: true,    characterSet: true,    screenSize: true,    language: true}";
const hhistory = context.history, doc = document, nav = navigator || {}, storage = localStorage,
    encode = encodeURIComponent, pushState = hhistory.pushState, typeException = "exception",
    generateId = () => Math.random().toString(36),
    getId = () => (storage.cid || (storage.cid = generateId()), storage.cid), serialize = e => {
        var t = [];
        for (var o in e) e.hasOwnProperty(o) && void 0 !== e[o] && t.push(encode(o) + "=" + encode(e[o]));
        return t.join("&")
    };
hhistory.pushState = function (e) {
    return "function" == typeof history.onpushstate && hhistory.onpushstate({state: e}), setTimeout(track, options.delay || 10), pushState.apply(hhistory, arguments)
};

window.jQ = jQuery.noConflict(true);
const g_config = new MonkeyConfig({
    title: 'betterKiteAI Settings',
    menuCommand: true,
    onSave: reloadPage,
    params: {
        aiLogging: {
            type: 'select',
            choices: ['Info', 'Debug', 'None'],
            values: [D_LEVEL_INFO, D_LEVEL_DEBUG, D_LEVEL_NONE],
            default: D_LEVEL_NONE
        },
        previousDayDate: {
            type: 'text',
            default: moment().subtract(1, "days").format("YYYY-MM-DD")
        },
        refreshTime: {
            type: 'text',
            default: 60
        },
    }
});
const VERSION = "v1.0";
const BASE_URL = "https://kite.zerodha.com";
const D_LEVEL = g_config.get('aiLogging');
const BANK_NIFTY_CURRENT_FUTURE = 8979970
const NIFTY_50_CURRENT_FUTURE = 8980226
const USD_INR_CURRENT_FUTURE = 281347
const PREVIOUS_DAY_DATE = g_config.get('previousDayDate');
var PREVIOUS_DATE_NIFTY_FUT;
var PREVIOUS_DATE_BANK_NIFTY_FUT;
var PREVIOUS_DATE_CURRENCY_FUT;
var refreshIntervalThirteen = null;
var currentYearAndMonth = moment().format("YY")
currentYearAndMonth +=moment().format("MMM")
currentYearAndMonth = currentYearAndMonth.toString().toUpperCase()
var instruments=["NSE:NIFTY BANK","NSE:NIFTY 50","NFO:NIFTY"+currentYearAndMonth+"FUT","NFO:BANKNIFTY"+currentYearAndMonth+"FUT","CDS:USDINR"+currentYearAndMonth+"FUT"]
jQ(document).ready(function(){
    setTimeout(function(){
        showAI()
        showStockAI()
    },2000)

})

function showAI() {

    var html = '';
    html += '<a data-bs-toggle="modal" data-bs-target="#exampleModal">'
    html += 'AI'
    html += '</button>'
    jQ('body').first().find(".app-nav").append(html);
    html = ''
    html += '<div class="modal fade" id="exampleModal" tabindex="-1" aria-labelledby="exampleModalLabel" aria-hidden="true">'
    html += '<div class="modal-dialog modal-xl" style="max-width: 1500px !important; width: 1500px !important;">'
    html += '<div class="modal-content">'
    html += '<div class="modal-header">'
    html += '<h5 class="modal-title" id="exampleModalLabel">Index Trend Analyzer AI</h5>'
    html += '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>'
    html += '</div>'
    html += '<div class="modal-body" id="ai-modal-container">'
    html += '...'
    html += '</div>'
    html += '<div class="modal-footer">'
    html += '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>'
    html += '</div>'
    html += '</div>'
    html += '</div>'
    html += '</div>'

    jQ('body').first().append(html);
    jQ.when(getInstrumentQuotes(instruments)).done(function (res) {
        console.log(res)
        if(!sessionStorage.getItem("PREVIOUS_DATE_NIFTY_FUT")){
            jQ.when(getHistoricalFutureData(res['data']["NFO:NIFTY"+currentYearAndMonth+"FUT"].instrument_token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE)).done(function (resOne) {
                sessionStorage.setItem("PREVIOUS_DATE_NIFTY_FUT", JSON.stringify(resOne));
            });
        }else{
            PREVIOUS_DATE_NIFTY_FUT = JSON.parse(sessionStorage.getItem("PREVIOUS_DATE_NIFTY_FUT"));
        }

        if(!sessionStorage.getItem("PREVIOUS_DATE_BANK_NIFTY_FUT")){
            jQ.when(getHistoricalFutureData(res['data']["NFO:BANKNIFTY"+currentYearAndMonth+"FUT"].instrument_token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE)).done(function (resOne) {
                sessionStorage.setItem("PREVIOUS_DATE_BANK_NIFTY_FUT", JSON.stringify(resOne));
            });
        }else{
            PREVIOUS_DATE_BANK_NIFTY_FUT = JSON.parse(sessionStorage.getItem("PREVIOUS_DATE_BANK_NIFTY_FUT"));
        }


        if(!sessionStorage.getItem("PREVIOUS_DATE_CURRENCY_FUT")){
            jQ.when(getHistoricalFutureData(res['data']["CDS:USDINR"+currentYearAndMonth+"FUT"].instrument_token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE)).done(function (resOne) {
                sessionStorage.setItem("PREVIOUS_DATE_CURRENCY_FUT", JSON.stringify(resOne));
            });
        }else{
            PREVIOUS_DATE_CURRENCY_FUT = JSON.parse(sessionStorage.getItem("PREVIOUS_DATE_CURRENCY_FUT"));
        }
    });

    var myModal = document.getElementById('exampleModal')
    myModal.addEventListener('shown.bs.modal', function () {
        commonBankNiftyAndNiftyAI()
    })

    myModal.addEventListener('hidden.bs.modal', function () {
        clearInterval(refreshIntervalThirteen)
    })
};

function commonBankNiftyAndNiftyAI(instance){

    clearInterval(refreshIntervalThirteen)
    jQ("#ai-modal-container").html(bullVersesBear())
    jQ("#ai-modal-container").append(showAdrMarkup())
    jQ.when(getInstrumentQuotes(instruments)).done(function (res) {
        if (instance) {
            instance.attr("disabled", false)
        }
        startRefreshThirteen()
        getBankNiftyBullsAndBearsWarUpdates(PREVIOUS_DATE_BANK_NIFTY_FUT, res)
        getNiftyBullsAndBearsWarUpdates(PREVIOUS_DATE_NIFTY_FUT,res)
        niftyFutures(PREVIOUS_DATE_NIFTY_FUT,res)
        bankNiftyFutures(PREVIOUS_DATE_BANK_NIFTY_FUT,res)
        currencyFutures(PREVIOUS_DATE_CURRENCY_FUT,res)
    });
    setTimeout(function () {
        getNifty50Adr()
        getNiftyBankAdr()
        getNiftyITAdr()
        getNiftyMetalAdr()
        getNiftyFinanceAdr()
    }, 1000)
}

function showAdrMarkup() {
    var html = ''
    html = `<div class="row" id="market-trend-container">
    <div class="col-md-2">
        <div class="card" id="nifty-card" >
            <div class="card-body">
                <h5 class="card-title">Nifty 50</h5>
                <p id="nifty-trend"></p>
            </div>
            <ul class="list-group list-group-flush">
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Total Stocks
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-primary" id="nifty-stocks"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Positive(+)
                        </div>
                        <div class="col-md-1 text-success"><i class="bi bi-hand-thumbs-up"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-success" id="nifty-positive"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Negative(-)
                        </div>
                        <div class="col-md-1 text-danger"><i class="bi bi-hand-thumbs-down"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-danger" id="nifty-negative"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Unchanged
                        </div>
                        <div class="col-md-1 text-warning"><i class="bi bi-hand-index-thumb"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-warning" id="nifty-unchanged"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Overall ADR
                        </div>
                        <div class="col-md-1 text-info"><i class="bi bi-arrow-left-right"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-info" id="nifty-adr"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Overall Bulls
                        </div>
                        <div class="col-md-1 text-success"><i class="bi bi-graph-up"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-success" id="nifty-bulls"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Overall Bears
                        </div>
                        <div class="col-md-1 text-danger"><i class="bi bi-graph-down"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-danger" id="nifty-bears"></span>
                        </div>
                    </div>
                </li>
            </ul>
        </div>
    </div>
    <div class="col-md-2">
        <div class="card"  id="bank-nifty-card">
            <div class="card-body">
                <h5 class="card-title">Bank Nifty</h5>
                <p id="bank-nifty-trend"></p>
            </div>
            <ul class="list-group list-group-flush">
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Total Stocks
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-primary" id="bank-nifty-stocks"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Positive(+)
                        </div>
                        <div class="col-md-1 text-success"><i class="bi bi-hand-thumbs-up"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-success" id="bank-nifty-positive"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Negative(-)
                        </div>
                        <div class="col-md-1 text-danger"><i class="bi bi-hand-thumbs-down"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-danger" id="bank-nifty-negative"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Unchanged
                        </div>
                        <div class="col-md-1 text-warning"><i class="bi bi-hand-index-thumb"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-warning" id="bank-nifty-unchanged"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Overall ADR
                        </div>
                        <div class="col-md-1 text-info"><i class="bi bi-arrow-left-right"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-info" id="bank-nifty-adr"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Overall Bulls
                        </div>
                        <div class="col-md-1 text-success"><i class="bi bi-graph-up"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-success" id="bank-nifty-bulls"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Overall Bears
                        </div>
                        <div class="col-md-1 text-danger"><i class="bi bi-graph-down"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-danger" id="bank-nifty-bears"></span>
                        </div>
                    </div>
                </li>
            </ul>
        </div>
    </div>
    <div class="col-md-2">
        <div class="card"  id="it-nifty-card">
            <div class="card-body">
                <h5 class="card-title">Nifty IT</h5>
                <p id="it-nifty-trend"></p>
            </div>
            <ul class="list-group list-group-flush">
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Total Stocks
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-primary" id="it-nifty-stocks"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Positive(+)
                        </div>
                        <div class="col-md-1 text-success"><i class="bi bi-hand-thumbs-up"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-success" id="it-nifty-positive"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Negative(-)
                        </div>
                        <div class="col-md-1 text-danger"><i class="bi bi-hand-thumbs-down"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-danger" id="it-nifty-negative"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Unchanged
                        </div>
                        <div class="col-md-1 text-warning"><i class="bi bi-hand-index-thumb"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-warning" id="it-nifty-unchanged"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Overall ADR
                        </div>
                        <div class="col-md-1 text-info"><i class="bi bi-arrow-left-right"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-info" id="it-nifty-adr"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Overall Bulls
                        </div>
                        <div class="col-md-1 text-success"><i class="bi bi-graph-up"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-success" id="it-nifty-bulls"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Overall Bears
                        </div>
                        <div class="col-md-1 text-danger"><i class="bi bi-graph-down"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-danger" id="it-nifty-bears"></span>
                        </div>
                    </div>
                </li>
            </ul>
        </div>
    </div>
    <div class="col-md-2">
        <div class="card"  id="metal-nifty-card">
            <div class="card-body">
                <h5 class="card-title">Nifty Metal</h5>
                <p id="metal-nifty-trend"></p>
            </div>
            <ul class="list-group list-group-flush">
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Total Stocks
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-primary" id="metal-nifty-stocks"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Positive(+)
                        </div>
                        <div class="col-md-1 text-success"><i class="bi bi-hand-thumbs-up"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-success" id="metal-nifty-positive"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Negative(-)
                        </div>
                        <div class="col-md-1 text-danger"><i class="bi bi-hand-thumbs-down"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-danger" id="metal-nifty-negative"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Unchanged
                        </div>
                        <div class="col-md-1 text-warning"><i class="bi bi-hand-index-thumb"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-warning" id="metal-nifty-unchanged"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Overall ADR
                        </div>
                        <div class="col-md-1 text-info"><i class="bi bi-arrow-left-right"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-info" id="metal-nifty-adr"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Overall Bulls
                        </div>
                        <div class="col-md-1 text-success"><i class="bi bi-graph-up"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-success" id="metal-nifty-bulls"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Overall Bears
                        </div>
                        <div class="col-md-1 text-danger"><i class="bi bi-graph-down"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-danger" id="metal-nifty-bears"></span>
                        </div>
                    </div>
                </li>
            </ul>
        </div>
    </div>
    <div class="col-md-2">
        <div class="card"  id="finance-nifty-card">
            <div class="card-body">
                <h5 class="card-title">Nifty Finance</h5>
                <p id="finance-nifty-trend"></p>
            </div>
            <ul class="list-group list-group-flush">
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Total Stocks
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-primary" id="finance-nifty-stocks"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Positive(+)
                        </div>
                        <div class="col-md-1 text-success"><i class="bi bi-hand-thumbs-up"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-success" id="finance-nifty-positive"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Negative(-)
                        </div>
                        <div class="col-md-1 text-danger"><i class="bi bi-hand-thumbs-down"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-danger" id="finance-nifty-negative"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Unchanged
                        </div>
                        <div class="col-md-1 text-warning"><i class="bi bi-hand-index-thumb"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-warning" id="finance-nifty-unchanged"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Overall ADR
                        </div>
                        <div class="col-md-1 text-info"><i class="bi bi-arrow-left-right"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-info" id="finance-nifty-adr"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Overall Bulls
                        </div>
                        <div class="col-md-1 text-success"><i class="bi bi-graph-up"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-success" id="finance-nifty-bulls"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-7">
                            Overall Bears
                        </div>
                        <div class="col-md-1 text-danger"><i class="bi bi-graph-down"></i></div>
                        <div class="col-md-3">
                            <span class="badge bg-danger" id="finance-nifty-bears"></span>
                        </div>
                    </div>
                </li>
            </ul>
        </div>
    </div>
</div>`

    html +=`<div class="row">
    <div class="col-md-12">
        <div class="bd-callout bd-callout-info shadow-sm p-3 mb-5 bg-body rounded">
            <div>
                <i class="bi bi-info-square-fill"></i> Advance/Decline Ratio ADR #if ADR>=1.25 then
                <span class="badge bg-success">+ve(Bullish)</span> Otherwise
                <span class="badge bg-danger"> -ve(Bearish)</span>
            </div>


            <div>
                <i class="bi bi-info-square-fill"></i>
                Low IndiaVIX <span id="india-vix-info">21.0650</span> indicates stability in the market while higher
                value indicated
                <span class="badge bg-danger">stress, fear and anxiety.</span>
            </div>
        </div>
    </div>
</div>`

    return html;
}

function bullVersesBear() {
    var html = ''

    html+=`
        <div class="row">
            <div class="col-md-6 ">Auto refreshing in
                <span id="refresh-timer-thirteen">00:00</span> minutes!
            </div>
            <div class="col-md-6">
                <div class="text-primary refresh-action" id="refresh-time-thirteen-button"><i class="bi bi-arrow-repeat">Refresh</i></div>
            </div>
        </div>
    `

    html+=`<div class="row">
    <div class="col-md-4">
        <div class="card">
            <div class="card-body">
                <h5 class="card-title" style="display:inline-block;">NIFTY50-FUT
                    <a class="show-price-change" data-id="NIFTY_FUTURE">
                        <i class="bi bi-megaphone"></i>
                    </a>
                </h5>
                <a  style="float: right;margin-left: 1rem;" href="/niftyFutureAnalysis" target="_blank"><i class="bi bi-cursor-fill"></i>
                </a>
                <span style="float: right;" class="badge bg-info" id="niftyFUTLastUpdateTime"></span>

            </div>
            <ul class="list-group list-group-flush">
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            Price
                        </div>
                        <div class="col-md-1 text-primary">
                            <i class="bi bi-megaphone"></i>
                        </div>
                        <div class="col-md-2">
                            <span id="nifty-future-price"></span>
                        </div>
                        <div class="col-md-1">
                            <span class="blinking" id="nifty-future-price-change-direction"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span id="nifty-future-price-per-change"></span>
                        </div>
                        <div class="col-md-1" style="margin-left: 0.8rem;">
                            <span id="nifty-future-price-change"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            VWAP
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-2">
                            <span id="nifty-future-vwap"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span class="blinking" id="nifty-future-vwap-direction"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span id="nifty-future-vwap-signal"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span id="nifty-future-vwap-signal-diff"></span>
                        </div>
                    </div>
                </li>

                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            Signal
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-4">
                            <span id="nifty-future-signal"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span class="blinking" id="nifty-future-signal-type-direction"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            Open
                        </div>
                        <div class="col-md-1 text-primary">
                            <i class="bi bi-megaphone"></i>
                        </div>
                        <div class="col-md-6">
                            <span id="nifty-future-open"></span>
                        </div>

                    </div>
                </li>

                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            High
                        </div>
                        <div class="col-md-1 text-primary">
                            <i class="bi bi-megaphone"></i>
                        </div>
                        <div class="col-md-6">
                            <span id="nifty-future-high"></span>
                        </div>
                    </div>
                </li>

                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            Low
                        </div>
                        <div class="col-md-1 text-primary">
                            <i class="bi bi-megaphone"></i>
                        </div>
                        <div class="col-md-6">
                            <span id="nifty-future-low"></span>
                        </div>
                    </div>
                </li>

                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            Previous Close
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-6">
                            <span id="nifty-future-previous-close"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            NIFTY50-OI
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-2">
                            <span title="Open Interest" id="nifty-fity-oi"></span>
                        </div>
                        <div class="col-md-1">
                            <span class="blinking" id="nifty-fity-oi-change-direction"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span title="Change In Open Interest Percentage" id="nifty-fity-oi-per-change"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span title="Change In Open Interest" id="nifty-fity-oi-change"></span>
                        </div>
                    </div>
                </li>
            </ul>
        </div>
    </div>

    <div class="col-md-4">
        <div class="card">
            <div class="card-body">
                <h5 class="card-title" style="display: inline-block;">BANK NIFTY-FUT
                    <a class="show-price-change" data-id="BANK_NIFTY_FUTURE">
                        <i class="bi bi-megaphone"></i>
                    </a>
                </h5>
                <a  style="float: right;margin-left: 1rem;" href="/niftyBankFutureAnalysis" target="_blank"><i class="bi bi-cursor-fill"></i>
                </a>
                <span style="float: right;" class="badge bg-info" id="bankNiftyFUTLastUpdateTime"></span>
            </div>
            <ul class="list-group list-group-flush">
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            Price
                        </div>
                        <div class="col-md-1 text-primary">
                            <i class="bi bi-megaphone"></i>
                        </div>
                        <div class="col-md-2">
                            <span id="bank-nifty-future-price"></span>
                        </div>
                        <div class="col-md-1">
                            <span class="blinking" id="bank-nifty-future-price-change-direction"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span id="bank-nifty-future-price-per-change"></span>
                        </div>
                        <div class="col-md-1" style="margin-left: 0.8rem;">
                            <span id="bank-nifty-future-price-change"></span>
                        </div>

                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            VWAP
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-2">
                            <span id="bank-nifty-future-vwap"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span class="blinking" id="bank-nifty-future-vwap-direction"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span id="bank-nifty-future-vwap-signal"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span id="bank-nifty-future-vwap-signal-diff"></span>
                        </div>
                    </div>
                </li>

                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            Signal
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-4">
                            <span id="bank-nifty-future-signal"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span class="blinking" id="bank-nifty-future-signal-type-direction"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            Open
                        </div>
                        <div class="col-md-1 text-primary">
                            <i class="bi bi-megaphone"></i>
                        </div>
                        <div class="col-md-6">
                            <span id="bank-nifty-future-open"></span>
                        </div>

                    </div>
                </li>

                <li class="list-group-item">
                    <div class="row">

                        <div class="col-md-4">
                            High
                        </div>
                        <div class="col-md-1 text-primary">
                            <i class="bi bi-megaphone"></i>
                        </div>
                        <div class="col-md-6">
                            <span id="bank-nifty-future-high"></span>
                        </div>
                    </div>
                </li>

                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            Low
                        </div>
                        <div class="col-md-1 text-primary">
                            <i class="bi bi-megaphone"></i>
                        </div>
                        <div class="col-md-6">
                            <span id="bank-nifty-future-low"></span>
                        </div>
                    </div>
                </li>

                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            Previous Close
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-6">
                            <span id="bank-nifty-future-previous-close"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            BANK NIFTY-OI
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-2">
                            <span title="Open Interest" id="bank-nifty-fity-oi"></span>
                        </div>
                        <div class="col-md-1">
                            <span class="blinking" id="bank-nifty-fity-oi-change-direction"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span title="Change In Open Interest Percentage" id="bank-nifty-fity-oi-per-change"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span title="Change In Open Interest" id="bank-nifty-fity-oi-change"></span>
                        </div>
                    </div>
                </li>
            </ul>
        </div>
    </div>


    <div class="col-md-4">
        <div class="card">
            <div class="card-body">
                <h5 class="card-title" style="display: inline-block">CURRENCY-FUT
                    <a class="show-price-change" data-id="CURRENCY_FUTURE">
                        <i class="bi bi-megaphone"></i>
                    </a>
                </h5>
                <span style="float: right;" class="badge bg-info" id="currencyFUTLastUpdateTime"></span>
            </div>
            <ul class="list-group list-group-flush">
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            Price
                        </div>
                        <div class="col-md-1 text-primary">
                            <i class="bi bi-megaphone"></i>
                        </div>
                        <div class="col-md-2">
                            <span id="currency-future-price"></span>
                        </div>
                        <div class="col-md-1">
                            <span class="blinking" id="currency-future-price-change-direction"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span id="currency-future-price-per-change"></span>
                        </div>
                        <div class="col-md-1" style="margin-left: 0.8rem;">
                            <span id="currency-future-price-change"></span>
                        </div>

                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            VWAP
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-2">
                            <span id="currency-future-vwap"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span class="blinking" id="currency-future-vwap-direction"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span id="currency-future-vwap-signal"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span id="currency-future-vwap-signal-diff"></span>
                        </div>
                    </div>
                </li>

                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            Signal
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-4">
                            <span id="currency-future-signal"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span class="blinking" id="currency-future-signal-type-direction"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            Open
                        </div>
                        <div class="col-md-1 text-primary">
                            <i class="bi bi-megaphone"></i>
                        </div>
                        <div class="col-md-6">
                            <span id="currency-future-open"></span>
                        </div>

                    </div>
                </li>

                <li class="list-group-item">
                    <div class="row">

                        <div class="col-md-4">
                            High
                        </div>
                        <div class="col-md-1 text-primary">
                            <i class="bi bi-megaphone"></i>
                        </div>
                        <div class="col-md-6">
                            <span id="currency-future-high"></span>
                        </div>
                    </div>
                </li>

                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            Low
                        </div>
                        <div class="col-md-1 text-primary">
                            <i class="bi bi-megaphone"></i>
                        </div>
                        <div class="col-md-6">
                            <span id="currency-future-low"></span>
                        </div>
                    </div>
                </li>

                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            Previous Close
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-6">
                            <span id="currency-future-previous-close"></span>
                        </div>
                    </div>
                </li>
                <li class="list-group-item">
                    <div class="row">
                        <div class="col-md-4">
                            CURRENCY-OI
                        </div>
                        <div class="col-md-1 text-primary"><i class="bi bi-megaphone"></i></div>
                        <div class="col-md-2">
                            <span title="Open Interest" id="currency-future-oi"></span>
                        </div>
                        <div class="col-md-1">
                            <span class="blinking" id="currency-future-oi-change-direction"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span title="Change In Open Interest Percentage" id="currency-future-oi-per-change"></span>
                        </div>
                        <div class="col-md-1" style="margin-right: 0.8rem;">
                            <span title="Change In Open Interest" id="currency-future-oi-change"></span>
                        </div>
                    </div>
                </li>
            </ul>
        </div>
    </div>
</div>


<div class="row">
    <div class="col-md-12">
        <div class="bd-callout bd-callout-info shadow-sm p-3 mb-1 bg-body rounded">

            <div>
                <i class="bi bi-info-square-fill"></i> If Nifty Future is trading above VWAP and Open Interest shows
                addition of shares then,
                Nifty Future has added net Long position.
                <span class="badge bg-success">+ve(Bullish) Trend</span>
            </div>


            <div>
                <i class="bi bi-info-square-fill"></i>
                if Nifty Future is below VWAP and Open Interest shows addition then Traders conclusion is Nifty Future
                added Short positions.
                <span class="badge bg-danger">-ve(Bearish) Trend</span>
            </div>
        </div>
    </div>
</div>`





    html += `
            <div class="row">
                <div class="col-md-6">
                    <div class="row">
    <div class="col-md-12">
        <h5 class="text-center">
            Sell CE / Buy PE
        </h5>
        <div class="bd-callout bd-callout-danger shadow-sm bg-body rounded" style="min-height: 10rem;">
            <div class="row">
                <div class="col-md-5">
                    <div class="row">
                        <div class="col-md-5">
                            <span id="nifty-images-bull-minus">0</span>
                        </div>
                        <div class="col-md-7">
                            <span id="nifty-remark-minus">0</span>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="row">
                        <div class="col-md-5" id="nifty-oi-label-minus">
                        </div>
                        <div class="col-md-2">
                            <span id="nifty-oi-minus"></span>
                        </div>
                        <div class="col-md-1" style="margin-left: 0.5rem;">
                            <span class="blinking" id="nifty-oi-change-direction-minus"></span>
                        </div>
                        <div class="col-md-1" style="margin-left: 0.5rem;">
                            <span id="nifty-oi-per-change-minus"></span>
                        </div>
                        <div class="col-md-1" style="margin-left: 1.5rem;">
                            <span id="nifty-oi-change-minus"></span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="row" style="text-align: center;margin-top: 3rem;">
                <div class="col-md-12" id="nifty-market-trend-text-minus"></div>
            </div>
        </div>
    </div>
</div>
<div class="row">
    <div class="col-md-12">
        <h5 class="text-center">
            Buy CE / Sell PE
        </h5>
        <div class="bd-callout bd-callout-success shadow-sm bg-body rounded" style="min-height: 10rem;">
            <div class="row">
                <div class="col-md-6">
                    <div class="row">
                        <div class="col-md-6">
                            <span id="nifty-images-bull-plus">0</span>
                        </div>
                        <div class="col-md-6">
                            <span id="nifty-remark-plus">0</span>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="row">
                        <div class="col-md-5" id="nifty-oi-label-plus">
                        </div>
                        <div class="col-md-2">
                            <span id="nifty-oi-plus"></span>
                        </div>
                        <div class="col-md-1">
                            <span class="blinking" id="nifty-oi-change-direction-plus"></span>
                        </div>
                        <div class="col-md-1" style="margin-left: 0.8rem;">
                            <span id="nifty-oi-per-change-plus"></span>
                        </div>
                        <div class="col-md-1" style="margin-left: 0.8rem;">
                            <span id="nifty-oi-change-plus"></span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="row" style="text-align: center;margin-top: 3rem;">
                <div class="col-md-12" id="nifty-market-trend-text-plus"></div>
            </div>
        </div>
    </div>
</div>
                </div>
                <div class="col-md-6">
                   <div class="row">
            <div class="col-md-12">
                <h5 class="text-center">
                    Sell CE / Buy PE
                </h5>
                <div class="bd-callout bd-callout-danger shadow-sm bg-body rounded" style="min-height: 10rem;">
                    <div class="row">
                        <div class="col-md-5">
                            <div class="row">
                                <div class="col-md-5">
                                    <span id="bank-nifty-images-bull-minus">0</span>
                                </div>
                                <div class="col-md-7">
                                    <span id="bank-nifty-remark-minus">0</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="row">
                                <div class="col-md-5" id="bank-nifty-oi-label-minus">
                                </div>
                                <div class="col-md-2">
                                    <span id="bank-nifty-oi-minus"></span>
                                </div>
                                <div class="col-md-1" style="margin-left: 0.5rem;">
                                    <span class="blinking" id="bank-nifty-oi-change-direction-minus"></span>
                                </div>
                                <div class="col-md-1" style="margin-left: 0.5rem;">
                                    <span id="bank-nifty-oi-per-change-minus"></span>
                                </div>
                                <div class="col-md-1" style="margin-left: 1.5rem;">
                                    <span id="bank-nifty-oi-change-minus"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="row" style="text-align: center;margin-top: 3rem;">
                        <div class="col-md-12" id="market-trend-text-minus"></div>
                    </div>
                </div>
            </div>
        </div>
        <div class="row">
            <div class="col-md-12">
                <h5 class="text-center">
                    Buy CE / Sell PE
                </h5>
                <div class="bd-callout bd-callout-success shadow-sm bg-body rounded" style="min-height: 10rem;">
                    <div class="row">
                        <div class="col-md-6">
                            <div class="row">
                                <div class="col-md-6">
                                    <span id="bank-nifty-images-bull-plus">0</span>
                                </div>
                                <div class="col-md-6">
                                    <span id="bank-nifty-remark-plus">0</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="row">
                                <div class="col-md-5" id="bank-nifty-oi-label-plus">
                                </div>
                                <div class="col-md-2">
                                    <span id="bank-nifty-oi-plus"></span>
                                </div>
                                <div class="col-md-1">
                                    <span class="blinking" id="bank-nifty-oi-change-direction-plus"></span>
                                </div>
                                <div class="col-md-1" style="margin-left: 0.8rem;">
                                    <span id="bank-nifty-oi-per-change-plus"></span>
                                </div>
                                <div class="col-md-1" style="margin-left: 0.8rem;">
                                    <span id="bank-nifty-oi-change-plus"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="row" style="text-align: center;margin-top: 3rem;">
                        <div class="col-md-12" id="bank-nifty-market-trend-text-plus"></div>
                    </div>
                </div>
            </div>
        </div>
                </div>
            </div>
    `


    return html;
}

function getHistoricalFutureData(code, fromDate, toDate) {
    jQ.ajaxSetup({
        headers: {
            'Authorization': `enctoken ${getCookie('enctoken')}`
        }
    });
    return jQ.ajax({
        url: BASE_URL + `/oms/instruments/historical/${code}/day?user_id=HY8031&oi=1&from=${fromDate}&to=${toDate}`,
        type: 'GET',
        async: true,
        cache: false,
    });
}

function getInstrumentQuotes(quotes) {
    var params = ''
    jQ.each(quotes,function(index,item){
        params +="i="+encodeURIComponent(item)
        if(index < (quotes.length-1)){
            params +="&"
        }
    });
    jQ.ajaxSetup({
        headers: {
            'Authorization': `enctoken ${getCookie('enctoken')}`
        }
    });

    return jQ.ajax({
        url: BASE_URL + `/oms/quote?${params}`,
        type: 'GET',
        async: false,
        cache: false,
    });
}

jQ(document).on("click", "#refresh-time-thirteen-button", function (e) {
    e.preventDefault();
    var that = jQ(this);
    that.attr("disabled", true)
    commonBankNiftyAndNiftyAI(that)
});

function startTimerThirteen(duration, display) {
    if (!duration) {
        duration = 60
    }
    var timer = duration, minutes, seconds;
    refreshIntervalThirteen = setInterval(function () {
        minutes = parseInt(timer / 60, 10);
        seconds = parseInt(timer % 60, 10);

        minutes = minutes < 10 ? "0" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;

        display.textContent = minutes + ":" + seconds;

        if (--timer < 0) {
            commonBankNiftyAndNiftyAI()
            timer = duration;
        }
    }, 1000);
}

function startRefreshThirteen() {
    var display = document.querySelector('#refresh-timer-thirteen');
    startTimerThirteen(g_config.get('refreshTime'), display);
};

function currencyFutures(previousDay, currentDay) {
    try{
        var json = currentDay['data']['CDS:USDINR'+currentYearAndMonth+'FUT'];
        var vwap = json.average_price;
        var openPrice = json.ohlc.open;
        var highPrice = json.ohlc.high;
        var lowPrice = json.ohlc.low;
        var lastPrice = json.last_price;

        var lastUpdateTime = json.timestamp;

        var prevClose = previousDay['data']['candles'][0][4]

        var previousClose = previousDay['data']['candles'][0][4]
        var pChange = ((lastPrice - previousClose) / previousClose) * 100
        var change = (lastPrice - previousClose)
        var booleanValue = false;

        var vvapTextOne = ''
        var vvapTextTwo = ''
        var vvapTextThree = ''
        var vvapTextFour = ''

        var bottomTriangle = '<i class="bi bi-caret-down">Down</i>'
        var upTriangle = '<i class="bi bi-caret-up">Up</i>'

        var buyResult = Math.abs(openPrice
            - lowPrice);
        var sellResult = Math.abs(openPrice
            - highPrice);

        var booleanValue = false;
        var correctedVwap = vwap;
        correctedVwap = correctedVwap; // price spike adjuestment
        var lastPrice = lastPrice;
        if (correctedVwap <= lastPrice) {
            vvapTextOne += '<span class="badge bg-primary">' + vwap + '</span>'
            vvapTextTwo += '<span class="badge bg-success">BUY</span>'
            vvapTextThree += '<span class="badge bg-success">' + upTriangle + '</span>'
            vvapTextFour += '<span class="badge bg-success">' + (parseFloat(lastPrice) - parseFloat(correctedVwap)).toFixed(2) + '</span>'

            booleanValue = true;

        } else {
            vvapTextOne += '<span class="badge bg-primary">' + vwap + '</span>'
            vvapTextTwo += '<span class="badge bg-danger">SELL</span>'
            vvapTextThree += '<span class="badge bg-danger">' + bottomTriangle + '</span>'
            vvapTextFour += '<span class="badge bg-danger">' + (parseFloat(lastPrice) - parseFloat(correctedVwap)).toFixed(2) + '</span>'
            booleanValue = false;
        }

        var textOpen = '<span class="badge bg-dark">' + openPrice + '</span>'
        var textLow = '<span class="badge bg-danger">' + lowPrice + '</span>'
        var textHigh = '<span class="badge bg-success">' + highPrice + '</span>'
        var textPreviousClose = '<span class="badge bg-success">' + previousClose + '</span>'

        jQ("#currency-future-open").html(textOpen)
        jQ("#currency-future-low").html(textLow)
        jQ("#currency-future-high").html(textHigh)
        jQ("#currency-future-previous-close").html(textPreviousClose)

        var futureTrend = ''
        var futureDirection = ''
        if (buyResult >= 0 && buyResult <= 30) {
            var trend = "Strong BUY";
            futureTrend = '<span class="badge bg-success">' + trend + '</span>'
            futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
        } else if (sellResult >= 0 && sellResult <= 30) {
            var trend = "Strong SELL";
            futureTrend = '<span class="badge bg-danger">' + trend + '</span>'
            futureDirection = '<span class="badge bg-danger">' + bottomTriangle + '</span>'

        } else if (openPrice > prevClose && lastPrice >= openPrice
            && booleanValue == true) {
            var trend = "BUY";
            futureTrend = '<span class="badge bg-success">' + trend + '</span>'
            futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
        } else if (booleanValue == true && lastPrice > openPrice) {
            var trend = "BUY On Decline";
            futureTrend = '<span class="badge bg-success">' + trend + '</span>'
            futureDirection = '<span class="badge bg-success">' + upTriangle + '</span>'
        } else {
            var trend = "SELL";
            futureTrend = '<span class="badge bg-danger">' + trend + '</span>'
            futureDirection = '<span class="badge bg-danger">' + bottomTriangle + '</span>'
        }

        jQ("#currency-future-signal").html(futureTrend)
        jQ("#currency-future-signal-type-direction").html(futureDirection)

        var price = ''
        var priceChang = ''
        var priceChangDirection = ''
        var pricePer = ''
        if (change > 0) {
            price += '<span class="badge bg-success">' + lastPrice + '</span>'
            priceChang += '<span class="badge bg-success">' + parseFloat(change).toFixed(2) + '</span>'
            priceChangDirection += '<span class="badge bg-success">' + upTriangle + '</span>'
        } else {
            price += '<span class="badge bg-danger">' + lastPrice + '</span>'
            priceChang += '<span class="badge bg-danger">' + parseFloat(change).toFixed(2) + '</span>'
            priceChangDirection += '<span class="badge bg-danger">' + bottomTriangle + '</span>'
        }

        if (pChange > 0) {
            pricePer += '<span class="badge bg-success">' + parseFloat(pChange).toFixed(2) + '%</span>'
        } else {
            pricePer += '<span class="badge bg-danger">' + parseFloat(pChange).toFixed(2) + '%</span>'
        }

        jQ("#currency-future-price").html(price)
        jQ("#currency-future-price-change-direction").html(priceChangDirection)
        jQ("#currency-future-price-per-change").html(pricePer)
        jQ("#currency-future-price-change").html(priceChang)


        var openInterest = json.oi / 1;
        var previousOI = previousDay['data']['candles'][0][6] / 1
        var changeinOpenInterest = (openInterest - previousOI)
        var pchangeinOpenInterest = (((openInterest - previousOI) / previousOI) * 100).toFixed(2);

        var oiPrice = ''
        var oiPriceChang = ''
        var oiPriceChangDirection = ''
        var oiPricePer = ''
        if (changeinOpenInterest > 0) {
            oiPrice += '<span class="badge bg-success">' + openInterest + '</span>'
            oiPriceChang += '<span class="badge bg-success">' + parseFloat(changeinOpenInterest).toFixed(2) + '</span>'
            oiPriceChangDirection += '<span class="badge bg-success">' + upTriangle + '</span>'

        } else {
            oiPrice += '<span class="badge bg-danger">' + openInterest + '</span>'
            oiPriceChang += '<span class="badge bg-danger">' + parseFloat(changeinOpenInterest).toFixed(2) + '</span>'
            oiPriceChangDirection += '<span class="badge bg-danger">' + bottomTriangle + '</span>'
        }

        if (pchangeinOpenInterest > 0) {
            oiPricePer += '<span class="badge bg-success">' + parseFloat(pchangeinOpenInterest).toFixed(2) + '%</span>'
        } else {
            oiPricePer += '<span class="badge bg-danger">' + parseFloat(pchangeinOpenInterest).toFixed(2)+ '%</span>'
        }

        jQ("#currency-future-oi").html(oiPrice)
        jQ("#currency-future-oi-change-direction").html(oiPriceChangDirection)
        jQ("#currency-future-oi-change").html(oiPriceChang)
        jQ("#currency-future-oi-per-change").html(oiPricePer)
        jQ("#currency-future-vwap").html(vvapTextOne)
        jQ("#currency-future-vwap-signal").html(vvapTextTwo)
        jQ("#currency-future-vwap-signal-diff").html(vvapTextFour)
        jQ("#currency-future-vwap-direction").html(vvapTextThree);
        jQ("#currencyFUTLastUpdateTime").html(lastUpdateTime);
    }catch (e) {
        console.log(e)
    }
}



