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
  - `autotrade.user.js` — script loader and metadata; **bump `@version` on every change** (currently ~24.27) to force TM cache re-fetch
  - `constants.js` — instrument lists, strike diffs, tokens, and weighted constituent maps (`NIFTY_50_WEIGHTED_STOCKS`, `NIFTY_BANK_WEIGHTED_STOCKS`)
  - `script.js` — real-time LTP refresh, strike scanning, OAuth
  - `utils.js` — `generateTrends()`, `generateTrend()`, `getStrikeDetails()`, `getVixRange()`, order placement; also `showPopUpWindow(index, html, title, width, height)`
  - `grootTradeBot.js` — main dashboard popup, score system, advance/decline scanner, futures trend scanner, all analysis tool popups
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
`getFuturesTrendScore(remark)` — maps futures REMARK string (`LONG`, `SHORT`, `LONG_UNWINDING`, `SHOT_COVERING`, etc.) to +1/0/-1. Note: `LONG_UNWINDING` = -1 (bearish), `SHOT_COVERING` = +1 (bullish) — opposite of what the names suggest.  
`INSTRUMENT_SCORE_MAP` — global cache: `{name: {futures_trend, oi_obv, strikeMap, open, oiData, score: {nine_fifteen, current_trend, futures_trend, oi_obv, total}}}`.

Score thresholds for gauge color: red < 0, orange 1–4, yellow 5–7, green ≥ 8.

`SCORE` is a **local variable** inside `setScore()` — not a global. To use the composite score outside `setScore()`, recompute it by summing all the global score variables listed above.

## Exit signal logic (grootTradeBot.js)

`checkExitSignal(entryDirection)` — called each tick; reads `computeInstrumentScore('NIFTY 50')` and index futures from `INSTRUMENT_SCORE_MAP`.

- **EXIT LONG**: `current_trend < 0` (NIFTY 50 below BSO/BST) OR both `n50Fut < 0 && bnFut < 0`
- **EXIT SHORT**: `current_trend > 0` (NIFTY 50 above ASO/AST) OR both `n50Fut > 0 && bnFut > 0`

`n50Fut` / `bnFut` come from `INSTRUMENT_SCORE_MAP['NIFTY 50'].futures_trend` / `['NIFTY BANK'].futures_trend`, which are set from the NSE futures REMARK via `getFuturesTrendScore`.

`renderExitBanner()` — renders `#gtb-exit-signal` with exit reason text, e.g. "EXIT LONG — trend bearish (-1)".

## Market signal logic (grootTradeBot.js)

`getMarketSignal(SCORE, breakOutNineFifteen)` — returns `{signal, color, reason, tradeSignal}`.

Signal thresholds: STRONG BUY ≥ 12, BUY ≥ 6, WAIT ≥ 2, SIDEWAYS ≥ -1, WAIT ≥ -5, SELL ≥ -11, STRONG SELL below.

Override rules:
- If score bullish (> 5) but both index futures bearish → WAIT (conflict)
- If score bearish (< -5) but both index futures bullish → WAIT (conflict)
- If signal BUY/STRONG BUY but 9:15 pattern says Sell → WAIT
- If signal SELL/STRONG SELL but 9:15 pattern says Buy → WAIT
- VIX guard: if NIFTY at VIXU or VIXL → NO TRADE

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

## Floating toolbar (`#gtb-float-bar`, grootTradeBot.js)

`_gtbCreateFloatingBar()` — builds a fixed right-side vertical toolbar on `<body>`. Each button stores its target in `dataset.toolId` and on click does `jQ('#' + id)[0].click()` — this works for tools that have a matching DOM element id in the dashboard. **For tools that have no DOM element** (e.g. `show-trade-checklist`), add a direct `if (id === 'show-trade-checklist') { _fn(); return; }` guard before the DOM lookup inside the click handler.

Current `_tools` array (in order):
```
show-chartgrid, show-915-backtest, show-all-oi, show-fut-accuracy,
show-futures-signal, show-commodities, show-oi-viewer, show-stock-viewer,
show-market-quote-analyzer, show-maxpain-gex, gtb-add-instr-btn,
gtb-settings-toggle, show-trade-checklist, show-help, data-load
```

Bootstrap Icons used: `bi-grid-3x3-gap-fill`, `bi-calendar-week`, `bi-layers-fill`, `bi-bullseye`, `bi-flag-fill`, `bi-droplet-fill`, `bi-eye`, `bi-list-ul`, `bi-graph-up`, `bi-bar-chart-steps`, `bi-plus-circle-fill`, `bi-gear-fill`, `bi-clipboard-check`, `bi-question-circle-fill`, `bi-sliders`. **Note:** the bundled Bootstrap Icons version is older — `bi-database-fill-gear` and `bi-activity` are missing; use `bi-sliders` and `bi-toggles` as alternatives.

## Popup pattern (utils.js + grootTradeBot.js)

`showPopUpWindow(index, html, title, width, height)` — creates a PopupWindow with CSS class `popup-custom-style-<index>` and div id `pop-up-window-<index>`.

Standard titlebar replacement pattern:
```javascript
showPopUpWindow('my-popup', html, 'Title', 600, 400);
var _cls = 'popup-custom-style-my-popup';
var _title = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
    + '<span style="font-weight:800;font-size:0.7rem;">MY POPUP</span>'
    + popupWinControls(_cls)
    + '</div>';
jQ('.' + _cls).find('.popupwindow_titlebar_text').html(_title);
hideNativePopupButtons(_cls);
jQ('.' + _cls).find('.popupwindow_titlebar').removeClass('popupwindow_titlebar_draggable');
```

`popupWinControls(popupClass)` — returns minimize/maximize/close button HTML, takes the full class name.  
`hideNativePopupButtons(popupClass)` — hides native PopupWindow library buttons.  
Removing `popupwindow_titlebar_draggable` prevents the popup moving when clicking in the titlebar padding.

## Theming rules for inline HTML (important)

All inline-styled HTML in popups and panels must use CSS variables — **never hardcode dark-mode hex colors**. Key mappings:

| Purpose | CSS variable |
|---|---|
| Text | `var(--gtb-text)` |
| Muted / labels | `var(--gtb-muted)` |
| Surface / card bg | `var(--gtb-surface)`, `var(--gtb-surface2)` |
| Borders / dividers | `var(--gtb-border)` |
| Page background | `var(--gtb-bg)` |
| Bullish / positive | `var(--gtb-green)` |
| Bearish / negative | `var(--gtb-red)` |
| Neutral / warning | `var(--gtb-amber)` |
| Info / highlight | `var(--gtb-blue)`, `var(--gtb-accent)` |

Avoid `#ffffff0a`, `#ffffff08`, `#e6edf3`, `#7d8590` etc. — these only look correct in dark mode.

## Pre-Trade Checklist popup (`_gtbShowTradeChecklist`, grootTradeBot.js)

Opened via float bar button (`show-trade-checklist`, `bi-clipboard-check` icon). No DOM element exists for it — the float bar handler has a direct `if (id === 'show-trade-checklist') { _gtbShowTradeChecklist(); return; }` guard.

The popup (`showPopUpWindow('trade-checklist', ...)`, 620×580) has three sections:

**A · Market Checklist** — 7 numbered steps with green/amber/red dot indicators:
1. VIX Regime (LOW < 13, NORMAL 13–18, ELEVATED 18–25, HIGH > 25)
2. 9:15 Opening Candle — NIFTY 50, BANK NIFTY, SENSEX, GIFT NIFTY (zone labels from `VALID_BREAKOUT_NINE_FIFTEEN` localStorage)
3. Advance / Decline — All F&O, NIFTY 50, BANK (from `ALL/NIFTY_50/NIFTY_BANK_ADVANCE_DECLINE_SCORE`)
4. Futures Trend — All, NIFTY 50, BANK (from `ALL/NIFTY_50/NIFTY_BANK_FUTURES_TREND_SCORE`)
5. OI / OBV Score — all 5 instruments
6. Component Score — NIFTY 50 + BANK NIFTY weighted
7. Composite Score — recomputed inline by summing all global score vars

**B · Trade Recommendation** — colored card: market signal from `getMarketSignal(SCORE, b9)` + plain-English trade action (Buy CE / Buy PE / Iron Condor / Wait).

**C · Instrument Scores** — table for 9 instruments (GIFT NIFTY, NIFTY 50, NIFTY BANK, SENSEX, RELIANCE, HDFCBANK, ICICIBANK, CRUDEOILM, USDINR): columns 9:15 / Trend / Futures / OI/OBV / Total / Action. Action thresholds: total ≥ 4 → BUY CE, ≥ 2 → CE (wait ASO), ≥ 0 → WAIT, ≥ -3 → PE (wait BSO), < -3 → BUY PE.

## Analysis tools (grootTradeBot.js, opened from topbar icons)

- **9:15 Opening-Trend backtest** (`#show-915-backtest` → `_gtbBuild915Trend(250)` / `_render915Trend`): ~1 year, day-wise. Classifies each day's 9:15 close for NIFTY/SENSEX/BANK (+GIFT ref) via `_gtbClassify915`, resolves the combo through the shared **`GTB_STRAT_LOOKUP`** map (+ `_gtbNorm915`), and simulates the entry-level trade per leg (`_gtbSimLeg`/`_gtbLegsFor`): lvl vs trd entry, P/L at 12:00, MFE/MAE, 1:1 TP/SL, entry/peak times. Shows a **per-combo edge table** (win-rate, Avg P/L, Avg Max-Fav, **Low-VIX/High-VIX split** at median VIX) + **day-by-day table**. Today's combo is highlighted in both. Combo rows open a chart grid; day rows have a per-day chart button. Uses chunked 5-min fetch (`_gtbFetch5minRange`, ≤95-day windows — Kite caps 5-min at 100 days) and caches rows in `localStorage` (`GTB_915TREND_<date>_250_v2`).
- **OI Compare matrix** (`#show-all-oi` → `_gtbOICompareTableHtml`): all instruments (main + weighted constituents, `_gtbAllOIInstruments`) in one horizontal table — rows = instruments, columns = strikes around ATM, cells = CE/PE ΔOI + OBV + signal + score (`_gtbOICell`). Detailed/Compact (heatmap, `_gtbOICellCompact`) toggle persisted in `GTB_OIC_MODE`. Reads cached `INSTRUMENT_SCORE_MAP[name].oiData` (no fetch).
- **Strike-level probability** (`%` button per row → `_gtbStrikeProb`): 60-day daily-OHLC backtest of continuation/reversal probability when price touches ASO/AST/BSO/BST.
- **Pre-Trade Checklist** (`show-trade-checklist` → `_gtbShowTradeChecklist`): see section above.

## Instrument detail view (grootTradeBot.js + common.css)

`_gtbLoadInstrDetail(name)` / `_gtbLoadInstrDetailPanel(name, suffix)` — build a multi-column detail popup (`#show-futures-signal`). Panel order: Identity → Price Action → OI/OBV → OI Matrix → 9:15 Breakout → Trend Probability → Futures → Weightage → Details → Trade Analysis → Risk Manager.

**Sticky identity header**: CSS `position: sticky` fails inside a flex-row scroll container. Fix: JS scroll listener bound **directly** (not delegated — scroll events don't bubble) on `#fsig-multi-row`, using `transform: translateY(scrollTop)` on `.gtb-ic-panel-identity`. Global CSS keeps sticky for the main dashboard overview; detail view overrides to `position: relative` for JS control.

`showOIOBVBarChart(name, suffix, _oiDataOverride)` — x-axis element id is `tempName + '-oiobv-xaxis' + suffix` (suffix must be included, otherwise x-axis not found in detail view).

## Commodities popup (grootTradeBot.js)

`#show-commodities` → builds GIFT NIFTY + CRUDEOILM panel. After `showPopUpWindow`, removes `popupwindow_titlebar_draggable` to prevent popup moving on titlebar click. Level labels (ASO/AST/BSO/BST/OPEN/VIXL/VIXU) above the crude chart are populated from `INSTRUMENT_SCORE_MAP['CRUDEOILM'].strikeMap` and `.open` (cached by `showTopChartMCX`).

## Tampermonkey caching gotcha (important)

`autotrade.user.js` loads every app file via `@require`/`@resource` from `http://localhost:3000`. **Tampermonkey caches these** — editing `static/autoTrade/*` shows "no effect" on reload even though the node server serves the new file. When the user reports "nothing changed", confirm the server serves it (`curl -s http://localhost:3000/autoTrade/common.css | grep <marker>`), then it's the TM cache. Workflow used here: **bump `@version`** in `autotrade.user.js` on every change so TM re-pulls (currently ~24.27), or set TM Externals "Update interval" to Always. The node `server.js` has dropped a few times mid-session; if `curl` returns HTTP 000, restart `node server.js`.

- `node_modules/` — only direct dependency is `express`.

When extending this server (adding routes, views, etc.), `server.js` is the natural entry point — there's no router/controller structure to preserve since none exists yet.
