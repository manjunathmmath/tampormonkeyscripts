window.jQ = jQuery.noConflict(true);
const g_config = new MonkeyConfig({
    title: 'Market Trend Settings',
    menuCommand: true,
    onSave: reloadPage,
    params: {
        previous_day_date: {
            type: 'text',
            default: moment().subtract(1, "days").format("YYYY-MM-DD")
        },
        current_day_date: {
            type: 'text',
            default: moment().format("YYYY-MM-DD")
        },
        crude_oil_expiry_date: {
            type: 'text',
            default: moment().format("YYYY-MM-DD")
        },
        historical_data_interval: {
            type: 'text',
            default: '3minute'
        },
    }
});

const VERSION = "v1.0";
const BASE_URL = "https://kite.zerodha.com";
const PREVIOUS_DAY_DATE = g_config.get('previous_day_date');
const CURRENT_DAY = g_config.get('current_day_date');
let date = new Date().toJSON().slice(0, 10);
const HISTORICAL_DATA_INTERVAL = g_config.get('historical_data_interval');
const CRUDEOIL_EXPIRY = g_config.get('crude_oil_expiry_date');
const REFRESH_TIME = 60;