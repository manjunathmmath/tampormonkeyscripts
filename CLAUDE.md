# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A minimal Express.js static file server. The entire application logic lives in `server.js` (12 lines): it serves the `static/` directory and responds to `/` with "Hello World!". There is no build step, test suite, linter, or framework beyond Express — this is a bare scaffold/experiment, not a full application.

## Commands

- Install dependencies: `npm install`
- Run the server: `node server.js` (listens on port 3000, prints "Example app listening on port 3000")

There are no configured `scripts` in `package.json`, no test runner, no linter, and no build process. Don't assume `npm test`, `npm run build`, etc. exist — check `package.json` first if this changes.

## Architecture

- `server.js` — the entire server: creates an Express app, mounts `express.static('static')` to serve everything under `static/` directly, and defines a single route (`GET /`).
- `static/` — static assets served as-is by Express. `static/autoTrade/` is a Tampermonkey/GreaseMonkey userscript that runs on kite.zerodha.com and provides intraday trading analysis. Vendor libraries live under `dist/`, `global/vendor/`, and `common/`. The application files are:
  - `autotrade.user.js` — script loader and metadata
  - `constants.js` — instrument lists, strike diffs, tokens, and weighted constituent maps (`NIFTY_50_WEIGHTED_STOCKS`, `NIFTY_BANK_WEIGHTED_STOCKS`)
  - `script.js` — real-time LTP refresh, strike scanning, OAuth
  - `utils.js` — `generateTrends()`, `generateTrend()`, `getStrikeDetails()`, `getVixRange()`, order placement
  - `grootTradeBot.js` — main dashboard popup, score system, advance/decline scanner, futures trend scanner
  - `oiAnalyzer.js` — OI/OBV calculation (`showPrictionProbabilty`, `showTrendingOI`, `calculateOBVFiveMinutesInterval`)
  - `optionStrike.js` — option strike analysis (very large, ~10K lines)
  - `oiViewer.js`, `quickScanner.js`, `marketQuotes.js`, `stockViewer.js` — sub-module UIs

## Score system (grootTradeBot.js)

The composite score is the sum of these global variables, set during each refresh cycle:

| Variable | Source | Range |
|---|---|---|
| `ALL_9_15_CLOSE_SCORE` | 9:15 breakout across all stocks | ±1 |
| `NIFTY_50_9_15_CLOSE_SCORE`, `NIFTY_BANK_9_15_CLOSE_SCORE`, `GIFT_NIFTY_9_15_CLOSE_SCORE`, `SENSEX_9_15_CLOSE_SCORE`, `RELIANCE_9_15_CLOSE_SCORE`, `HDFCBANK_9_15_CLOSE_SCORE` | Index/stock 9:15 candle vs strike | ±1 each |
| `ALL/NIFTY_50/NIFTY_BANK_ADVANCE_DECLINE_SCORE` | ASO vs BSO count across stocks | ±1 each |
| `ALL/NIFTY_50/NIFTY_BANK_FUTURES_TREND_SCORE` | Futures Bulls vs Bears count | ±1 each |
| `NIFTY_50/NIFTY_BANK/RELIANCE/HDFCBANK/ICICIBANK_OI_OBV_SCORE` | OI+OBV per strike scoring | ±N |
| `NIFTY_50_COMPONENT_SCORE` | Top-10 Nifty 50 constituents weighted (9:15+trend+futures+OI) × weight% | float |
| `NIFTY_BANK_COMPONENT_SCORE` | Top-10 Bank Nifty constituents weighted | float |

`computeInstrumentScore(name)` — computes `{nine_fifteen, current_trend, futures_trend, oi_obv, total}` for any instrument from localStorage (no API calls).  
`computeComponentScores()` — iterates `NIFTY_50_WEIGHTED_STOCKS` and `NIFTY_BANK_WEIGHTED_STOCKS`, calls `computeInstrumentScore`, applies weight, populates `INSTRUMENT_SCORE_MAP[name].score`.  
`getFuturesTrendScore(remark)` — maps futures REMARK string to +1/0/-1.  
`INSTRUMENT_SCORE_MAP` — global cache: `{name: {futures_trend, oi_obv, score: {nine_fifteen, current_trend, futures_trend, oi_obv, total}}}`.

Score thresholds for gauge color: red < 0, orange 1–4, yellow 5–7, green ≥ 8.
- `node_modules/` — only direct dependency is `express`.

When extending this server (adding routes, views, etc.), `server.js` is the natural entry point — there's no router/controller structure to preserve since none exists yet.
