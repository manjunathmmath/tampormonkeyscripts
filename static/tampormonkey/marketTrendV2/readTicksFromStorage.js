function changeMode() {
    return;
    let ticks = JSON.parse(localStorage.getItem("__storejs_kite_ticker/ticks"));
    let tickList = []
    jQ.each(ticks, function (index, item) {
        let temp = item;
        temp.symbol = getByValue(instrumentTokens, item.token)
        tickList.push(ticks[index])
    });
    console.log(tickList)
}

function getByValue(map, searchValue) {
    for (var key in map) {
        if(map[key] == searchValue){
            return key;
        }
    }
}