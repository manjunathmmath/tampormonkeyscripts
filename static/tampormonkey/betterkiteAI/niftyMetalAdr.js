var niftyMetalInstruments = [
    "NSE:WELCORP",
    "NSE:NMDC",
    "NSE:APLAPOLLO",
    "NSE:TATASTEEL",
    "NSE:JSWSTEEL",
    "NSE:ADANIENT",
    "NSE:NATIONALUM",
    "NSE:JINDALSTEL",
    "NSE:RATNAMANI",
    "NSE:HINDALCO",
    "NSE:SAIL",
    "NSE:VEDL",
    "NSE:HINDZINC",
    "NSE:HINDCOPPER",
    "NSE:JSL",
];
var niftyMetalComponentsPreviousDay = {}
getNiftyMetalComponentsPreviousDay()
function getNiftyMetalComponentsPreviousDay() {
    if(!sessionStorage.getItem("niftyMetalComponentsPreviousDay")){
        jQ.when(getInstrumentQuotes(niftyMetalInstruments)).done(function (res) {
            jQ.each(res.data, function (index, item) {
                sleep(1000);
                jQ.when(getHistoricalFutureData(item.instrument_token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE)).done(function (r) {
                    niftyMetalComponentsPreviousDay[index] = r;
                })
            })
            setTimeout(function(){
                sessionStorage.setItem("niftyMetalComponentsPreviousDay", JSON.stringify(niftyMetalComponentsPreviousDay));
            },1000)
        })
    }else{
        niftyMetalComponentsPreviousDay = JSON.parse(sessionStorage.getItem("niftyMetalComponentsPreviousDay"));
    }
}

var previousClassNiftyMetalClass = ''
function getNiftyMetalAdr() {
    var advances = 0;
    var declines = 0;
    var unchanged = 0;
    console.log(niftyMetalComponentsPreviousDay)
    jQ.when(getInstrumentQuotes(niftyMetalInstruments)).done(function (res) {
        jQ.each(res.data, function (index, item) {
            var previousClose = niftyMetalComponentsPreviousDay[index]['data']['candles'][0][4]
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
        var bull_per = (advances / 15) * 100;
        var bear_per = (declines / 15) * 100;
        var unchanged_per = (unchanged / 15) * 100;
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

        jQ("#metal-nifty-stocks").html(15)
        jQ("#metal-nifty-positive").html(advances)
        jQ("#metal-nifty-negative").html(declines)
        jQ("#metal-nifty-unchanged").html(unchanged)
        jQ("#metal-nifty-adr").html(adr.toFixed(2))
        jQ("#metal-nifty-bulls").html(bull_per.toFixed(2) + "%")
        jQ("#metal-nifty-bears").html(bear_per.toFixed(2) + "%")
        jQ("#metal-nifty-trend").html(trend)

        jQ("#metal-nifty-card").removeClass(previousClassNiftyMetalClass)
        jQ("#metal-nifty-card").addClass(cardClass)
        previousClassNiftyMetalClass = cardClass

    });
}