function checkTradeTiming(currentTime) {
    var timings = [
        "10:04:00",
        "10:07:00",
        "11:01:00",
        "11:04:00",
        "11:10:00",
        "12:16:00",
        "12:18:00",
        "01:21:00",
        "01:42:00",
        "02:10:00",
        "02:40:00",
        "02:55:00",
        "03:10:00",
        "03:12:00"]

    var message = "Best Time to Buy Options is " + moment(new Date()).format('MMMM dddd YYYY, hh:mm:ss A');

    if ($.inArray(currentTime, timings) != -1) {
        SnackBar({
            message: message,
            status: "info",
            timeout: 30000,
            actions: []
        });
    }
}


function date_time(id) {
    $("#" + id).html(moment(new Date()).format('MMMM dddd YYYY, hh:mm:ss A'));
    checkTradeTiming(moment(new Date()).format('hh:mm:ss'))
    setTimeout('date_time("' + id + '");', '1000');
    return true;
}

$(document).ready(function () {
    return;
    date_time("current-date-time")
    setInterval(function(){
        var message = "Always set the STOP LOSS."
        SnackBar({
            message: message,
            status: "alert",
            timeout: 8000,
            actions: []
        });
    },10000)
});



