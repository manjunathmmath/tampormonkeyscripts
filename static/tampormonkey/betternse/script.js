const formatter = Intl.NumberFormat('en-IN');
var isMultiply = true;

function changeButtonName() {
    var btn = $('#addLot');
    if (isMultiply) {
        $(btn).val('Divide 75');
        isMultiply = false;
    } else {
        isMultiply = true;
        $(btn).val('Multiply 75');
    }
}

function getNumber(n) {
    if (isMultiply) {
        return formatter.format(n * 75);
    } else {
        return formatter.format(n / 75);
    }
}

var i = document.createElement("INPUT");
i.type = 'button';
i.name = 'addLot';
i.value = 'Multiply 75';
i.classList.add("randomClassToHelpHide");
i.id = 'addLot';

function main() {
    $('#main_navbar').append(i);
    $(document).on('click', "#addLot", function () {
        commonGenerateTable();
        changeButtonName();
    });
}

$(document).on('change', "#expirySelect", function () {
    isMultiply = false;
    changeButtonName();
});
$(document).on('click', ".fullViewBtn", function () {
    $(".randomClassToHelpHide").remove();
    $('#goBackSite').before(i);
});
$(document).on('click', "#goBackSite", function () {
    $(".randomClassToHelpHide").remove();
    $('#main_navbar').append(i);
});

function commonGenerateTable() {
    var allRows = $('#optionChainTable-indices > tbody > tr');
    allRows.each(function (rowIndex) {
        //2 , 3, 21, 22
        var col = $(this).find("td:nth-child(2)");
        var txt = parseInt($(col).text().split(",").join(""));

        if (!isNaN(txt)) {
            $(col).text(getNumber(txt));
        }

        col = $(this).find("td:nth-child(3)");
        txt = parseInt($(col).text().split(",").join(""));

        if (!isNaN(txt)) {
            $(col).text(getNumber(txt));
        }
        col = $(this).find("td:nth-child(21)");
        txt = parseInt($(col).text().split(",").join(""));

        if (!isNaN(txt)) {
            $(col).text(getNumber(txt));
        }
        col = $(this).find("td:nth-child(22)");
        txt = parseInt($(col).text().split(",").join(""));

        if (!isNaN(txt)) {
            $(col).text(getNumber(txt));
        }

        var strikeEle = $(this).find("td:nth-child(12)");
        var strikePrice = parseInt($(strikeEle).text().split(",").join(""));

        var callOIChangeEle = $(this).find("td:nth-child(3)");
        var callOIChange = parseInt($(callOIChangeEle).text().split(",").join(""));

        var putOIChangeEle = $(this).find("td:nth-child(21)");
        var putOIChange = parseInt($(putOIChangeEle).text().split(",").join(""));
        if ((strikePrice >= 17500 && strikePrice <= 18500) || (strikePrice >= 41000 && strikePrice <= 42500)){
            if (callOIChange > putOIChange) {
                $(callOIChangeEle).removeClass("bg-yellow").css({"background": "#ff8c8c"});
            } else {
                $(putOIChangeEle).removeClass("bg-yellow").css({"background": "#39c728"});
            }
        }
        $("td.bg-yellow")[100].scrollIntoView({ behavior: 'smooth' });

    });
}

$(document).ready(function () {
    main();
    setTimeout(function () {
        commonGenerateTable()
    }, 1000)

    setInterval(function () {
        refreshOCPage('equity')
        setTimeout(function () {
            isMultiply = true;
            commonGenerateTable()
        }, 1000)
    }, 120000)
});
