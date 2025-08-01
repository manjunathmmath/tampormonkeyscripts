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
        start_month_day_date: {
            type: 'text',
            default: moment().startOf('month').format("YYYY-MM-DD")
        },
        start_week_day_date: {
            type: 'text',
            default: moment().weekday(1).format("YYYY-MM-DD")
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
        stocks_price_moved: {
            type: 'number',
            default: 5
        },
        stock_trend_to_trade: {
            type: 'select',
            choices: ['ASO', 'BSO', 'ALL'],
            values: ['ASO', 'BSO', 'ALL'],
            default: 'ALL'
        },
        enable_sl: {
            type: 'checkbox',
            default: true
        },
        enable_algo_trade: {
            type: 'checkbox',
            default: false
        },
        enable_breakout_scanner: {
            type: 'checkbox',
            default: true
        },
        enable_sound: {
            type: 'checkbox',
            default: false
        },
        movement_stocks: {
            type: 'checkbox',
            default: true
        },
        stock_limit: {
            type: 'number',
            default: 50
        },
        stock_volume: {
            type: 'number',
            default: 50000
        },
        show_volume_on_chart: {
            type: 'checkbox',
            default: false
        },
        analyze_future_trend: {
            type: 'checkbox',
            default: false
        },
        order_type: {
            type: 'select',
            choices: ['LIMIT', 'MARKET'],
            values: ['LIMIT', 'MARKET',],
            default: 'MARKET'
        },
        check_volume: {
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
const BASKET = g_config.get('basket');
const MARGIN = g_config.get('margin');
let weightIndex = []
const HISTORICAL_DATA_INTERVAL = g_config.get('historical_data_interval');
const STOCK_VOLUME = parseInt(g_config.get('stock_volume'));
const SHOW_VOLUME_ON_CHART = g_config.get('show_volume_on_chart');
const ORDER_TYPE = g_config.get('order_type');
const CHECK_VOLume = g_config.get('check_volume');
const STOCK_PRICE_MOVED = g_config.get('stocks_price_moved');
const STOCK_TREND_TO_TRADE = g_config.get('stock_trend_to_trade');
const ENABLE_SL = g_config.get('enable_sl');
const ENABLE_ALGO_TRADE = g_config.get('enable_algo_trade');
const STOCK_LIMIT = g_config.get('stock_limit');
const REFRESH_TIME = g_config.get('refresh_time');
const USE_MOVEMENT_STOCKS = g_config.get('movement_stocks');

const START_MONTH_DAY_DATE = g_config.get('start_month_day_date');
const START_WEEK_DAY_DATE = g_config.get('start_week_day_date');
const ENABLE_BREAKOUT_SCANNER = g_config.get('enable_breakout_scanner');
const NIFTY_EXPIRY_DATE = g_config.get("nifty_expiry_date")
const ENABLE_SOUND = g_config.get('enable_sound');
const SENSEX_EXPIRY_DATE = g_config.get('sensex_expiry_date');
const ANALYZE_FUTURE_TREND = g_config.get('analyze_future_trend');