/**
 * The Settings the backend keeps, mirroring the groups of the userscript's "Market Trend Settings" dialog (config.js, `_gtbCfgFieldGroups`).
 * Each field says what reads it (`usedBy`) so the screen can be honest about a value that is saved but not used yet.
 */
export type FieldType = 'text' | 'number' | 'checkbox' | 'select' | 'date' | 'secret';

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  default: string | number | boolean;
  help?: string;
  /** what uses the value; 'saved' = stored, used by a screen that is not built yet */
  usedBy: string;
  /** number bounds */
  min?: number;
  max?: number;
  /** select: the choices come from the instrument list (see `choicesFor`); blank always means "nearest / automatic" */
  dynamicChoices?: boolean;
  /** secret: never sent back to the browser */
  secret?: boolean;
}

export interface Group {
  id: string;
  title: string;
  note?: string;
  fields: Field[];
}

/** the commodities that get their own expiry fields (those with MCX futures in the instrument list at build time are passed in) */
export function buildGroups(commodities: string[]): Group[] {
  const futFields: Field[] = commodities.map((n) => ({ key: `mcx_expiry_${n.toLowerCase()}`, label: `${n} futures expiry`, type: 'select', default: '', dynamicChoices: true, usedBy: 'the commodity price, levels, verdict and futures read' }));
  const optFields: Field[] = commodities.map((n) => ({ key: `mcx_opt_expiry_${n.toLowerCase()}`, label: `${n} options expiry`, type: 'select', default: '', dynamicChoices: true, usedBy: 'the commodity option chain (OI / OBV, walls, max pain)' }));
  return [
    {
      id: 'auth',
      title: 'API & AUTHENTICATION',
      note: 'The Kite key and secret live in the backend .env file and the access token comes from the Kite login (System screen); neither is shown or edited here. The Telegram values are used by the squeeze alerts when you turn them on below.',
      fields: [
        { key: 'telegram_bot_token', label: 'Telegram bot token', type: 'secret', default: '', secret: true, usedBy: 'squeeze alerts' },
        { key: 'outlook_alert', label: 'Alert when price reaches the Probable trade entry zone', type: 'checkbox', default: false, usedBy: 'Probable trade alerts', help: 'Shows a banner (and a Telegram message when that is on) once per plan during market hours. It is the plan level, not an instruction to trade.' },
        { key: 'alert_hold_min', label: 'Hold a repeat squeeze alert for the same name (minutes)', type: 'number', default: 15, min: 0, max: 120, usedBy: 'squeeze alerts', help: 'A name that keeps flipping between short covering and long unwinding raises one alert, and the changes after it are held for this long. 0 turns the hold off.' },
        { key: 'alerts_telegram', label: 'Send squeeze alerts to Telegram', type: 'checkbox', default: false, usedBy: 'squeeze alerts', help: 'Off by default. Needs the bot token and chat id. Messages only say what the signal is; nothing is ever traded.' },
        { key: 'telegram_chat_id', label: 'Telegram chat id', type: 'text', default: '', usedBy: 'squeeze alerts' },
        { key: 'tg_morning', label: 'Telegram: morning brief (about 08:45)', type: 'checkbox', default: true, usedBy: 'Telegram updates', help: 'Needs the Telegram alerts switch above. Whether the markets trade today, GIFT NIFTY, India VIX, expiries, the day events and HIGH impact headlines.' },
        { key: 'tg_open', label: 'Telegram: NSE open snapshot (about 09:20)', type: 'checkbox', default: true, usedBy: 'Telegram updates', help: 'Open prices, the 9:15 zones and levels, breadth, the market score and the Probable trade of each index.' },
        { key: 'tg_close', label: 'Telegram: NSE close summary (about 15:35)', type: 'checkbox', default: true, usedBy: 'Telegram updates', help: 'Index changes, the score, how the day plans did and the heavyweights that moved.' },
        { key: 'tg_mcxopen', label: 'Telegram: MCX open snapshot', type: 'checkbox', default: true, usedBy: 'Telegram updates', help: 'GOLDM, SILVERM and CRUDEOILM open prices, zones, levels and plans when the commodity market starts trading.' },
        { key: 'tg_mcxclose', label: 'Telegram: MCX close summary (late evening)', type: 'checkbox', default: true, usedBy: 'Telegram updates' },
      ],
    },
    {
      id: 'general',
      title: 'GENERAL',
      fields: [
        { key: 'previous_day_date', label: 'NSE previous day (YYYY-MM-DD); blank = worked out from the calendar', type: 'date', default: '', usedBy: 'NSE names: the previous close, the OI baseline, the VIX range', help: 'Only used together with the NSE current day below, for that day.' },
        { key: 'current_day_date', label: 'NSE current day (YYYY-MM-DD); blank = the latest trading day', type: 'date', default: '', usedBy: 'every NSE screen (look at any day as it was)', help: 'Set any day to test it; clear it to follow today. Combine with the snapshot time in the top bar to stop the day at a time.' },
        { key: 'margin', label: 'Account capital (₹)', type: 'number', default: 100000, min: 0, usedBy: 'Trade Focus and Option Strikes (lots that fit your risk)', help: 'Risk amount = capital × risk % ÷ 100.' },
        { key: 'risk_pct_per_trade', label: 'Risk % per trade', type: 'number', default: 1, min: 0, max: 100, usedBy: 'Trade Focus and Option Strikes', help: 'Risk amount = capital × this % ÷ 100.' },
        { key: 'use_ltp_for_strike', label: 'Use the last price (not the open) to pick the option strikes around the money', type: 'checkbox', default: true, usedBy: 'every option chain' },
        { key: 'level_room_mult', label: 'Level Confirmation room-to-target multiple (× the stop distance)', type: 'number', default: 1.5, min: 0.1, max: 20, usedBy: 'Level Decision and the Final Verdict' },
        { key: 'include_lagging', label: 'Include the lagging signals (OI/OBV, max pain, IV skew, components) in the composite score', type: 'checkbox', default: true, usedBy: 'the market composite, Market verdict and Predict' },
        { key: 'live_recompute', label: 'Recompute the market read every minute from live ticks (instead of every 5 minutes)', type: 'checkbox', default: true, usedBy: 'the Dashboard and Focus numbers while the market is open' },
        { key: 'live_feed_auto', label: 'Connect the live price feed (Kite ticker) automatically', type: 'checkbox', default: true, usedBy: 'the live feed (applies at once)' },
      ],
    },
    {
      id: 'nse',
      title: 'NSE / INDEX EXPIRY',
      note: 'Blank = the nearest live expiry. A value that is not a listed expiry is ignored.',
      fields: [
        { key: 'nifty_expiry_date', label: 'NIFTY options expiry', type: 'select', default: '', dynamicChoices: true, usedBy: 'the NIFTY 50 option chain' },
        { key: 'sensex_expiry_date', label: 'SENSEX options expiry', type: 'select', default: '', dynamicChoices: true, usedBy: 'the SENSEX option chain' },
        { key: 'banknifty_expiry_date', label: 'BANK NIFTY options expiry', type: 'select', default: '', dynamicChoices: true, usedBy: 'the NIFTY BANK option chain' },
        { key: 'fo_stocks_expiry_date', label: 'F&O stocks options expiry (shared by every stock)', type: 'select', default: '', dynamicChoices: true, usedBy: 'every F&O stock option chain' },
      ],
    },
    {
      id: 'hedge',
      title: 'HEDGE STRIKE DIFFS',
      fields: [
        { key: 'hedge_diff_nifty', label: 'NIFTY (points)', type: 'number', default: 500, min: 0, usedBy: 'Option Strikes (hedge and spread width)', help: 'Width of the hedge leg or spread, in points.' },
        { key: 'hedge_diff_banknifty', label: 'BANK NIFTY (points)', type: 'number', default: 500, min: 0, usedBy: 'Option Strikes' },
        { key: 'hedge_diff_stocks', label: 'Stocks (points)', type: 'number', default: 50, min: 0, usedBy: 'Option Strikes' },
      ],
    },
    {
      id: 'mcxdays',
      title: 'MCX DATES',
      note: 'MCX trades when NSE is closed (NSE holidays, the evening session), so it has its own days. Blank = the latest MCX session.',
      fields: [
        { key: 'mcx_previous_day_date', label: 'MCX previous day (YYYY-MM-DD)', type: 'date', default: '', usedBy: 'commodities: the previous close, the OI baseline, the expected range', help: 'Only used together with the MCX current day, for that day.' },
        { key: 'mcx_current_day_date', label: 'MCX current day (YYYY-MM-DD)', type: 'date', default: '', usedBy: 'every commodity screen (look at any day as it was)' },
      ],
    },
    {
      id: 'vol',
      title: 'VOLATILITY INDICES (CBOE)',
      note: 'Leave a value blank to use the automatic one (CBOE, else Yahoo). Yesterday\'s close is what the expected daily range uses.',
      fields: [
        { key: 'OVX', label: 'OVX (crude oil volatility)', type: 'number', default: '', min: 0, max: 500, usedBy: 'crude expected range and verdict' },
        { key: 'GVZ', label: 'GVZ (gold volatility)', type: 'number', default: '', min: 0, max: 500, usedBy: 'gold expected range and verdict' },
        { key: 'VXSLV', label: 'VXSLV (silver volatility)', type: 'number', default: '', min: 0, max: 500, usedBy: 'silver expected range and verdict' },
        { key: 'VIX', label: 'VIX (CBOE, not India VIX)', type: 'number', default: '', min: 0, max: 500, usedBy: 'the proxy for commodities without their own index' },
        { key: 'vol_extreme_ovx', label: 'OVX warning level (the crude verdict warns at or above; it does not block)', type: 'number', default: 35, min: 1, max: 500, usedBy: 'the crude verdict' },
      ],
    },
    { id: 'mcxfut', title: 'MCX FUTURES EXPIRY', note: 'Blank = the nearest expiry.', fields: futFields },
    { id: 'mcxopt', title: 'MCX OPTIONS EXPIRY', note: 'Blank = the nearest expiry.', fields: optFields },
  ];
}
