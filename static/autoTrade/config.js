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
        nifty_expiry_date: {
            type: 'text',
            default: moment().format("YYYY-MM-DD")
        },
        sensex_expiry_date: {
            type: 'text',
            default: moment().format("YYYY-MM-DD")
        },
        margin: {
            type: 'text',
            default: 10000
        },
        refresh_time: {
            type: 'text',
            default: 60
        },
        historical_data_interval: {
            type: 'text',
            default: '3minute'
        },
        enable_sound: {
            type: 'checkbox',
            default: false
        },
        show_volume_on_chart: {
            type: 'checkbox',
            default: false
        },
    }
});

const VERSION = "v1.0";
const BASE_URL = "https://kite.zerodha.com";
const PREVIOUS_DAY_DATE = g_config.get('previous_day_date');
const CURRENT_DAY = g_config.get('current_day_date');
let date = new Date().toJSON().slice(0, 10);
const MARGIN = g_config.get('margin');
let weightIndex = []
const HISTORICAL_DATA_INTERVAL = g_config.get('historical_data_interval');
const SHOW_VOLUME_ON_CHART = g_config.get('show_volume_on_chart');
const REFRESH_TIME = g_config.get('refresh_time');
const NIFTY_EXPIRY_DATE = g_config.get("nifty_expiry_date")
const ENABLE_SOUND = g_config.get('enable_sound');
const SENSEX_EXPIRY_DATE = g_config.get('sensex_expiry_date');