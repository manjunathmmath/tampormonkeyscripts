var nifty50Instruments = [
    "NSE:ADANIENT",
    "NSE:ADANIPORTS",
    "NSE:APOLLOHOSP",
    "NSE:ASIANPAINT",
    "NSE:AXISBANK",
    "NSE:BAJAJ-AUTO",
    "NSE:BAJAJFINSV",
    "NSE:BAJFINANCE",
    "NSE:BHARTIARTL",
    "NSE:BPCL",
    "NSE:BRITANNIA",
    "NSE:CIPLA",
    "NSE:COALINDIA",
    "NSE:DIVISLAB",
    "NSE:DRREDDY",
    "NSE:EICHERMOT",
    "NSE:GRASIM",
    "NSE:HCLTECH",
    "NSE:HDFCBANK",
    "NSE:HDFCLIFE",
    "NSE:HEROMOTOCO",
    "NSE:HINDALCO",
    "NSE:HINDUNILVR",
    "NSE:ICICIBANK",
    "NSE:INDUSINDBK",
    "NSE:INFY",
    "NSE:ITC",
    "NSE:JSWSTEEL",
    "NSE:KOTAKBANK",
    "NSE:LT",
    "NSE:LTIM",
    "NSE:M&M",
    "NSE:MARUTI",
    "NSE:NESTLEIND",
    "NSE:NTPC",
    "NSE:ONGC",
    "NSE:POWERGRID",
    "NSE:RELIANCE",
    "NSE:SBILIFE",
    "NSE:SBIN",
    "NSE:SUNPHARMA",
    "NSE:TATACONSUM",
    "NSE:TATAMOTORS",
    "NSE:TATASTEEL",
    "NSE:TCS",
    "NSE:TECHM",
    "NSE:TITAN",
    "NSE:ULTRACEMCO",
    "NSE:UPL",
    "NSE:WIPRO"
];
var nifty50ComponentsPreviousDay = {}
getNifty50ComponentsPreviousDay()
function getNifty50ComponentsPreviousDay() {
    if(!sessionStorage.getItem("nifty50ComponentsPreviousDay")){
        jQ.when(getInstrumentQuotes(nifty50Instruments)).done(function (res) {
            jQ.each(res.data, function (index, item) {
                sleep(1000);
                jQ.when(getHistoricalFutureData(item.instrument_token, PREVIOUS_DAY_DATE, PREVIOUS_DAY_DATE)).done(function (r) {
                    nifty50ComponentsPreviousDay[index] = r;
                })
            })
            setTimeout(function(){
                sessionStorage.setItem("nifty50ComponentsPreviousDay", JSON.stringify(nifty50ComponentsPreviousDay));
            },1000)
        })
    }else{
        nifty50ComponentsPreviousDay = JSON.parse(sessionStorage.getItem("nifty50ComponentsPreviousDay"));
    }
}

var previousClassNiftyClass = ''
function getNifty50Adr() {
    var advances = 0;
    var declines = 0;
    var unchanged = 0;
    console.log(nifty50ComponentsPreviousDay)
    jQ.when(getInstrumentQuotes(nifty50Instruments)).done(function (res) {
        jQ.each(res.data, function (index, item) {
            var previousClose = nifty50ComponentsPreviousDay[index]['data']['candles'][0][4]
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
        var bull_per = (advances / 50) * 100;
        var bear_per = (declines / 50) * 100;
        var unchanged_per = (unchanged / 50) * 100;
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

        jQ("#nifty-stocks").html(50)
        jQ("#nifty-positive").html(advances)
        jQ("#nifty-negative").html(declines)
        jQ("#nifty-unchanged").html(unchanged)
        jQ("#nifty-adr").html(adr.toFixed(2))
        jQ("#nifty-bulls").html(bull_per.toFixed(2) + "%")
        jQ("#nifty-bears").html(bear_per.toFixed(2) + "%")
        jQ("#nifty-trend").html(trend)
        jQ("#nifty-card").removeClass(previousClassNiftyClass)
        jQ("#nifty-card").addClass(cardClass)
        previousClassNiftyClass = cardClass
    });
}