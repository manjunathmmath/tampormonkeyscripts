const my_css = GM_getResourceText("STYLE_CSS");
GM_addStyle(my_css);
let callLastOIChange={}
let putLastOIChange={}
$(document).ready(function () {
    setInterval(function () {
        readTable();
    }, 5000)
})

function getCurrentInstrument(){
    const queryString = window.location.search;
    console.log(queryString);
    const urlParams = new URLSearchParams(queryString);
    return urlParams.get('tradingsymbol')
}

function readTable() {
    var table = $("#oc-table");
    var tableBody = table.find("#oc-table-body");
    var rows = tableBody.find(".rt-tr-group")
    var currentAtm = $($(rows).find("#current-atm-row").find(".rt-td")[5]).text();
    var expiry = $(".MuiOutlinedInput-input").text()

    var oiList = []
    $.each(rows, function (rowIndex, rowItem) {
        var cells = $(rowItem).find(".rt-td");

        $(cells[1]).find('span#' + $(cells[5]).text() + '-call-status').remove();
        $(cells[10]).find('span#' + $(cells[5]).text() + '-put-status').remove();
        $(cells[1]).find('span#' + $(cells[5]).text() + '-call-status-prev').remove();
        $(cells[10]).find('span#' + $(cells[5]).text() + '-put-status-prev').remove();

        var oiObj = {}
        oiObj.callVolume = $(cells[0]).text()
        oiObj.callOiChange = $(cells[1]).text()
        oiObj.callOiChangePrc = $(cells[2]).text()
        oiObj.callOi = $(cells[3]).text()
        oiObj.callLtp = $(cells[4]).text()
        oiObj.strike = $(cells[5]).text()
        oiObj.iv = $(cells[6]).text()
        oiObj.putLtp = $(cells[7]).text()
        oiObj.putOi = $(cells[8]).text()
        oiObj.putOiChangePrc = $(cells[9]).text()
        oiObj.putOiChange = $(cells[10]).text()
        oiObj.putVolume = $(cells[11]).text()
        oiObj.atm = currentAtm
        oiObj.expiry = expiry
        oiObj.callOIStatus = ''
        oiObj.putOIStatus = ''
        oiObj.instrument = getCurrentInstrument();

        if (!callLastOIChange[$(cells[5]).text()] || isNaN(callLastOIChange[$(cells[5]).text()])) {
            callLastOIChange[$(cells[5]).text()]= parseFloat($(cells[1]).text())
        }

        if (!putLastOIChange[$(cells[5]).text()] || isNaN(putLastOIChange[$(cells[5]).text()])) {
            putLastOIChange[$(cells[5]).text()]= parseFloat($(cells[10]).text())
        }

        if (parseFloat($(cells[1]).text()) > parseFloat($(cells[10]).text())) {
            $(cells[1]).css({"background": "#ff8c8c"});
        } else {
            $(cells[10]).css({"background": "#39c728"});
        }
        var oldCallOi = callLastOIChange[$(cells[5]).text()]
        if (oldCallOi) {
            var callOIStatus='-';
            if (parseFloat(oiObj.callOiChange) > parseFloat(oldCallOi)) {
                callOIStatus = 'I'
            } else if (parseFloat(oiObj.callOiChange) < parseFloat(oldCallOi) ){
                callOIStatus = 'D'
            } else {
                callOIStatus = 'S'
            }

            var html = ''
            if (oldCallOi) {
                html += '<span id="' + oiObj.strike + '-call-status-prev" class="io-prev-value">'
                html += oldCallOi
                html += '</span>'
                if(oldCallOi){
                    if(parseFloat(oldCallOi)  !=  parseFloat($(cells[1]).text())){
                        console.log($(cells[5]).text() + "CALL OI Changed from " + parseFloat(oldCallOi) +" to " +  parseFloat($(cells[1]).text()))
                        callLastOIChange[$(cells[5]).text()]= parseFloat($(cells[1]).text())
                        if(callLastOIChange[$(cells[5]).text()]  ==  parseFloat($(cells[1]).text())){
                            callLastOIChange[$(cells[5]).text()]= oldCallOi
                        }
                    }
                    $(cells[1]).prepend(html)
                }
            }

            html = ''
            html += '<span id="' + oiObj.strike + '-call-status" class="io-status">'
            html += callOIStatus
            html += '</span>'

            $(cells[1]).append(html)
        }

        var oldPutOi = putLastOIChange[$(cells[5]).text()];
        if (oldPutOi) {
            html = ''
            var putOIStatus = '';
            if (parseFloat(oiObj.putOiChange) > parseFloat(oldPutOi)) {
                putOIStatus = 'I'
            } else if (parseFloat(oiObj.putOiChange) < parseFloat(oldPutOi)) {
                putOIStatus = 'D'
            } else {
                putOIStatus = 'S'
            }

            var html = ''
            if (oldPutOi) {
                html += '<span id="' + oiObj.strike + '-put-status-prev" class="io-prev-value">'
                html += oldPutOi
                html += '</span>'
                if(oldPutOi){
                    if(parseFloat(oldPutOi)  !=  parseFloat($(cells[10]).text())){
                        console.log($(cells[5]).text() + "PUT OI Changed from " + parseFloat(oldPutOi) +" to " +  parseFloat($(cells[10]).text()))
                        putLastOIChange[$(cells[5]).text()]=  parseFloat($(cells[10]).text())
                        if(parseFloat(putLastOIChange[$(cells[5]).text()])  ==  parseFloat($(cells[10]).text())){
                            putLastOIChange[$(cells[5]).text()]= oldPutOi
                        }
                    }
                }
                $(cells[10]).prepend(html)
            }
            html = ''
            html += '<span id="' + oiObj.strike + '-put-status" class="io-status">'
            html += putOIStatus
            html += '</span>'
            $(cells[10]).append(html)
        }
        oiList.push(oiObj)
    });

    if (oiList.length > 0) {
        //saveOptionChain(oiList)
    }
}

function saveOptionChain(oiList) {
    $.ajax({
        url: 'http://localhost:9080/saveOptionChain',
        type: 'POST',
        async: false,
        cache: false,
        data: {oiData: JSON.stringify(oiList)},
        error: function (xhr, status, error) {
            alert("Error while saving OI data")
        },
        success: function (response, status) {

        },
        complete: function () {
        }
    });
}

function getOIDate() {
    $.ajax({
        url: 'http://localhost:9080/getOIDate',
        type: 'GET',
        async: false,
        cache: false,
        data: {instrument : getCurrentInstrument()},
        error: function (xhr, status, error) {
            alert("Error while saving OI data")
        },
        success: function (response, status) {
            console.log(response)
        },
        complete: function () {
        }
    });
}

