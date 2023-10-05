var niftyBankInstruments = [
    "NSE:AUBANK",
    "NSE:ICICIBANK",
    "NSE:SBIN",
    "NSE:AXISBANK",
    "NSE:KOTAKBANK",
    "NSE:HDFCBANK",
    "NSE:IDFCFIRSTB",
    "NSE:BANKBARODA",
    "NSE:INDUSINDBK",
    "NSE:FEDERALBNK",
    "NSE:BANDHANBNK",
    "NSE:PNB"
];
var niftyBankComponentsPreviousDay = {}
getNiftyBankComponentsPreviousDay()
function getNiftyBankComponentsPreviousDay() {
    if(!sessionStorage.getItem("niftyBankComponentsPreviousDay")){
        jQ.when(getInstrumentQuotes(niftyBankInstruments)).done(function (res) {
            jQ.each(res.data, function (index, item) {
                sleep(1000);
                jQ.when(getHistoricalFutureData(item.instrument_token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE)).done(function (r) {
                    niftyBankComponentsPreviousDay[index] = r;
                })
            })
            setTimeout(function(){
                sessionStorage.setItem("niftyBankComponentsPreviousDay", JSON.stringify(niftyBankComponentsPreviousDay));
            },1000)
        })
    }else{
        niftyBankComponentsPreviousDay = JSON.parse(sessionStorage.getItem("niftyBankComponentsPreviousDay"));
    }
}

var previousClassBankNiftyClass = ''
function getNiftyBankAdr() {
    var advances = 0;
    var declines = 0;
    var unchanged = 0;
    console.log(niftyBankComponentsPreviousDay)
    jQ.when(getInstrumentQuotes(niftyBankInstruments)).done(function (res) {
        jQ.each(res.data, function (index, item) {
            var previousClose = niftyBankComponentsPreviousDay[index]['data']['candles'][0][4]
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
        var bull_per = (advances / 12) * 100;
        var bear_per = (declines / 12) * 100;
        var unchanged_per = (unchanged / 12) * 100;
        var adr = advances / declines;

        if (adr == 'Infinity') {
            adr = 12;
        }

        var cardClass = "bg-info"
        if (bull_per >= 60 && adr >= 2.2) {
            trend = "Extremely Bullish(+)";
            cardClass = "bg-success";
        } else if (bull_per >= 50 && bull_per < 59 && adr >= 1.50) {
            trend = "Bullish(+)";
            cardClass = "bg-success";
        } else if (bear_per >= 60 && adr <= 1) {
            trend = "Extremely Bearish(-)";
            cardClass = "bg-danger";
        } else if (bear_per > 50 && bear_per < 59) {
            trend = "Bearish(-)";
            cardClass = "bg-danger";
        } else if (bear_per >= 40 && bear_per <= 50 && adr < 1.25) {
            trend = "Little Bearish(-) and Bearish to Choppy Market";
            cardClass = "bg-info";
        } else if (bull_per >= 40 && bull_per <= 49 && adr >= 1.25) {
            trend = "little Bullish(+) with SideWays Market";
            cardClass = "bg-info";
        } else if (bull_per >= 50 && bull_per < 59 && adr >= 1.25 && adr < 1.50) {
            trend = "Bullish(+) with Volatile Market";
            cardClass = "bg-success";
        } else
            trend = "No Clear Trend";

        jQ("#bank-nifty-stocks").html(12)
        jQ("#bank-nifty-positive").html(advances)
        jQ("#bank-nifty-negative").html(declines)
        jQ("#bank-nifty-unchanged").html(unchanged)
        jQ("#bank-nifty-adr").html(adr.toFixed(2))
        jQ("#bank-nifty-bulls").html(bull_per.toFixed(2) + "%")
        jQ("#bank-nifty-bears").html(bear_per.toFixed(2) + "%")
        jQ("#bank-nifty-trend").html(trend)
        jQ("#bank-nifty-card").removeClass(previousClassBankNiftyClass)
        jQ("#bank-nifty-card").addClass(cardClass)
        previousClassBankNiftyClass = cardClass
    });
}