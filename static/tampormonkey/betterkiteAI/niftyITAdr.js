var niftyITInstruments = [
    "NSE:MPHASIS",
    "NSE:LTTS",
    "NSE:TCS",
    "NSE:COFORGE",
    "NSE:INFY",
    "NSE:LTIM",
    "NSE:PERSISTENT",
    "NSE:WIPRO",
    "NSE:TECHM",
    "NSE:HCLTECH"
];
var niftyITComponentsPreviousDay = {}
getNiftyITComponentsPreviousDay()
function getNiftyITComponentsPreviousDay() {
    if(!sessionStorage.getItem("niftyITComponentsPreviousDay")){
        jQ.when(getInstrumentQuotes(niftyITInstruments)).done(function (res) {
            jQ.each(res.data, function (index, item) {
                sleep(1000);
                jQ.when(getHistoricalFutureData(item.instrument_token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE)).done(function (r) {
                    niftyITComponentsPreviousDay[index] = r;
                })
            })
            setTimeout(function(){
                sessionStorage.setItem("niftyITComponentsPreviousDay", JSON.stringify(niftyITComponentsPreviousDay));
            },1000)
        })
    }else{
        niftyITComponentsPreviousDay = JSON.parse(sessionStorage.getItem("niftyITComponentsPreviousDay"));
    }
}

var previousClassNiftyITClass = ''
function getNiftyITAdr() {
    var advances = 0;
    var declines = 0;
    var unchanged = 0;
    console.log(niftyITComponentsPreviousDay)
    jQ.when(getInstrumentQuotes(niftyITInstruments)).done(function (res) {
        jQ.each(res.data, function (index, item) {
            var previousClose = niftyITComponentsPreviousDay[index]['data']['candles'][0][4]
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
        var bull_per = (advances / 10) * 100;
        var bear_per = (declines / 10) * 100;
        var unchanged_per = (unchanged / 10) * 100;
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

        jQ("#it-nifty-stocks").html(10)
        jQ("#it-nifty-positive").html(advances)
        jQ("#it-nifty-negative").html(declines)
        jQ("#it-nifty-unchanged").html(unchanged)
        jQ("#it-nifty-adr").html(adr.toFixed(2))
        jQ("#it-nifty-bulls").html(bull_per.toFixed(2) + "%")
        jQ("#it-nifty-bears").html(bear_per.toFixed(2) + "%")
        jQ("#it-nifty-trend").html(trend)
        jQ("#it-nifty-card").removeClass(previousClassNiftyITClass)
        jQ("#it-nifty-card").addClass(cardClass)
        previousClassNiftyITClass = cardClass

    });
}