$(document).ready(function(){
    setTimeout(function(){
        //getOIDate()
    },2000)

});

function getOIDate() {
    $.ajax({
        url: 'http://localhost:9080/getOIDate',
        type: 'GET',
        async: false,
        cache: false,
        data: {instructions : getCurrentInstrument()},
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

function getCurrentInstrument(){
   return "BANKNIFTY"

}