var niftyFinanceInstruments = [
    "NSE:IEX",
    "NSE:ICICIBANK",
    "NSE:SBIN",
    "NSE:AXISBANK",
    "NSE:BAJAJFINSV",
    "NSE:LICHSGFIN",
    "NSE:KOTAKBANK",
    "NSE:SBILIFE",
    "NSE:HDFCBANK",
    "NSE:HDFCLIFE",
    "NSE:BAJFINANCE",
    "NSE:ICICIGI",
    "NSE:SBICARD",
    "NSE:CHOLAFIN",
    "NSE:SHRIRAMFIN",
    "NSE:HDFCAMC",
    "NSE:ICICIPRULI",
    "NSE:MUTHOOTFIN",
    "NSE:RECLTD",
    "NSE:PFC"
];
var niftyFinanceComponentsPreviousDay = {}
getniftyFinanceComponentsPreviousDay()
function getniftyFinanceComponentsPreviousDay() {
    if(!sessionStorage.getItem("niftyFinanceComponentsPreviousDay")){
        jQ.when(getInstrumentQuotes(niftyFinanceInstruments)).done(function (res) {
            jQ.each(res.data, function (index, item) {
                sleep(1000);
                jQ.when(getHistoricalFutureData(item.instrument_token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE)).done(function (r) {
                    niftyFinanceComponentsPreviousDay[index] = r;
                })
            })
            setTimeout(function(){
                sessionStorage.setItem("niftyFinanceComponentsPreviousDay", JSON.stringify(niftyFinanceComponentsPreviousDay));
            },1000)
        })
    }else{
        niftyFinanceComponentsPreviousDay = JSON.parse(sessionStorage.getItem("niftyFinanceComponentsPreviousDay"));
    }
}

var previousClassNiftyFinanceClass = ''
function getNiftyFinanceAdr() {
    var advances = 0;
    var declines = 0;
    var unchanged = 0;
    console.log(niftyFinanceComponentsPreviousDay)
    jQ.when(getInstrumentQuotes(niftyFinanceInstruments)).done(function (res) {
        jQ.each(res.data, function (index, item) {
            var previousClose = niftyFinanceComponentsPreviousDay[index]['data']['candles'][0][4]
            var pChange = ((item.last_price - previousClose) / previousClose) * 100
            var change = (item.last_price - previousClose)
            console.log(pChange, index)
            if (pChange > 0) {
                advances++;
            } else if (pChange < 0) {
                declines++;
            } else {
                unchanged++;
            }
        });
        var trend = "None";
        var bull_per = (advances / 20) * 100;
        var bear_per = (declines / 20) * 100;
        var unchanged_per = (unchanged / 20) * 100;
        var adr = advances / declines;

        var cardClass = "bg-info"
        if (bull_per > 65 && adr >= 1.8) {
            trend = "Extremely Bullish(+)";
            cardClass = "bg-success";
        } else if (bull_per >= 50 && bull_per <= 65 && adr >= 1.50 && adr < 1.8) {
            trend = "Bullish(+)";
            cardClass = "bg-success";
        } else if (bear_per >= 55 && adr <= 1) {
            trend = "Extremely Bearish(-)";
            cardClass = "bg-danger"
        } else if (bear_per >= 50 && bear_per < 55) {
            trend = "Bearish(-)";
            cardClass = "bg-danger"
        } else if (bear_per >= 40 && bear_per <= 49 && adr < 1.25) {
            trend = "Little Bearish(-) and Bearish to Choppy Market";
            cardClass = "bg-info"
        } else if (bull_per > 45 && bull_per <= 49 && adr <= 1.25) {
            trend = "little Bullish(+) with SideWays Market";
            cardClass = "bg-info"
        } else if (bull_per >= 50 && bull_per <= 59 && adr >= 1.25) {
            trend = "Bullish(+) with  Volatile Market";
            cardClass = "bg-success"
        } else
            trend = "No Clear Trend";

        jQ("#finance-nifty-stocks").html(20)
        jQ("#finance-nifty-positive").html(advances)
        jQ("#finance-nifty-negative").html(declines)
        jQ("#finance-nifty-unchanged").html(unchanged)
        jQ("#finance-nifty-adr").html(adr.toFixed(2))
        jQ("#finance-nifty-bulls").html(bull_per.toFixed(2) + "%")
        jQ("#finance-nifty-bears").html(bear_per.toFixed(2) + "%")
        jQ("#finance-nifty-trend").html(trend)

        jQ("#finance-nifty-card").removeClass(previousClassNiftyFinanceClass)
        jQ("#finance-nifty-card").addClass(cardClass)
        previousClassNiftyFinanceClass = cardClass

    });
}