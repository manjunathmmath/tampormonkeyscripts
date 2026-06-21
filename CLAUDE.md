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

## Dashboard UI layout (grootTradeBot.js + common.css)

`commonMarkupPlaceHolder()` builds the popup; `showCompoenentPlaceHolders()` injects it and applies theme + row height. Structure:
- `#gtb-topbar` — brand, instrument tickers, VIX, master signal, controls, tool launchers, window buttons. `overflow: visible` (so the ⚙ settings dropdown isn't clipped).
- `#gtb-main` (flex row) → `#gtb-left` (score/signal/entry/pillars/history, own scroll) + `#gtb-right`.
- `#gtb-right` (flex column, `overflow: hidden`): `#gtb-overview` (5 blocks: Market Verdict, Composite Score, Instrument Breadth, **9:15 Breakout counts**, Key Stats) → `#gtb-rows-head` (column labels) → **`#gtb-rows`** (one horizontal row per instrument: identity + wide LightweightCharts chart + 9:15 + futures + OI + SL columns; its own scroll) → `#gtb-details-area` (collapsed deep-dive panels, own scroll, capped 42%).
- **Height chain is critical**: `#main-trade-bot-container` is `position: absolute; inset: 0` pinned to the popup content box — this gives a definite height so the inner flex/scroll regions bound correctly. Don't revert to `height:100%`/flex-only; it collapses.
- **Theme**: dark (`:root`) / light (`.gtb-light` on `#main-trade-bot-container` AND `#groot-maximize-overlay`). `_gtbApplyTheme(theme)` toggles + recolors LightweightCharts via `_gtbRecolorCharts()`. All colors use `--gtb-*` CSS vars; charts read `_gtbChartColors()`. Persisted in `localStorage.GTB_THEME`.
- **Info popovers**: every section header has an `(i)` icon (`_ii(key)`); `GTB_INFO[key]` holds `{icon,title,body}`; one delegated handler positions `#gtb-info-pop`.
- **Maximize overlay**: `showMaximizeOverlay(title, html)` → `#groot-maximize-overlay` (appended to `<body>`, so theme class must be synced onto it). Per-instrument maximize via `.maximize-component-btn`.
- **Rounded corners are removed** dashboard-wide via a `border-radius:0` reset; keep new elements square.

## Analysis tools (grootTradeBot.js, opened from topbar icons)

- **9:15 Opening-Trend backtest** (`#show-915-backtest` → `_gtbBuild915Trend(250)` / `_render915Trend`): ~1 year, day-wise. Classifies each day's 9:15 close for NIFTY/SENSEX/BANK (+GIFT ref) via `_gtbClassify915`, resolves the combo through the shared **`GTB_STRAT_LOOKUP`** map (+ `_gtbNorm915`), and simulates the entry-level trade per leg (`_gtbSimLeg`/`_gtbLegsFor`): lvl vs trd entry, P/L at 12:00, MFE/MAE, 1:1 TP/SL, entry/peak times. Shows a **per-combo edge table** (win-rate, Avg P/L, Avg Max-Fav, **Low-VIX/High-VIX split** at median VIX) + **day-by-day table**. Today's combo is highlighted in both. Combo rows open a chart grid; day rows have a per-day chart button. Uses chunked 5-min fetch (`_gtbFetch5minRange`, ≤95-day windows — Kite caps 5-min at 100 days) and caches rows in `localStorage` (`GTB_915TREND_<date>_250_v2`).
- **OI Compare matrix** (`#show-all-oi` → `_gtbOICompareTableHtml`): all instruments (main + weighted constituents, `_gtbAllOIInstruments`) in one horizontal table — rows = instruments, columns = strikes around ATM, cells = CE/PE ΔOI + OBV + signal + score (`_gtbOICell`). Detailed/Compact (heatmap, `_gtbOICellCompact`) toggle persisted in `GTB_OIC_MODE`. Reads cached `INSTRUMENT_SCORE_MAP[name].oiData` (no fetch).
- **Strike-level probability** (`%` button per row → `_gtbStrikeProb`): 60-day daily-OHLC backtest of continuation/reversal probability when price touches ASO/AST/BSO/BST.

## Tampermonkey caching gotcha (important)

`autotrade.user.js` loads every app file via `@require`/`@resource` from `http://localhost:3000`. **Tampermonkey caches these** — editing `static/autoTrade/*` shows "no effect" on reload even though the node server serves the new file. When the user reports "nothing changed", confirm the server serves it (`curl -s http://localhost:3000/autoTrade/common.css | grep <marker>`), then it's the TM cache. Workflow used here: **bump `@version`** in `autotrade.user.js` on every change so TM re-pulls (currently ~7.0), or set TM Externals "Update interval" to Always. The node `server.js` has dropped a few times mid-session; if `curl` returns HTTP 000, restart `node server.js`.

- `node_modules/` — only direct dependency is `express`.

When extending this server (adding routes, views, etc.), `server.js` is the natural entry point — there's no router/controller structure to preserve since none exists yet.
