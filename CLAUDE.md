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

**9:15 Opening Candle**

| Variable | Source | Range |
|---|---|---|
| `ALL_9_15_CLOSE_SCORE` | Weighted ratio of bullish vs bearish 9:15 candles across all stocks: `(bullish − bearish) / (bullish + bearish)`; AST/BST count ×2, ASO/BSO count ×1 | −1 to +1 (float) |
| `NIFTY_50_9_15_CLOSE_SCORE`, `NIFTY_BANK_9_15_CLOSE_SCORE`, `GIFT_NIFTY_9_15_CLOSE_SCORE`, `SENSEX_9_15_CLOSE_SCORE`, `RELIANCE_9_15_CLOSE_SCORE`, `HDFCBANK_9_15_CLOSE_SCORE` | Individual 9:15 candle vs strike: AST=+2, ASO=+1, BSO=−1, BST=−2 | ±2 each |

**Advance / Decline**

| Variable | Source | Range |
|---|---|---|
| `ALL_ADVANCE_DECLINE_SCORE`, `NIFTY_50_ADVANCE_DECLINE_SCORE`, `NIFTY_BANK_ADVANCE_DECLINE_SCORE` | ASO/AST vs BSO/BST count across stocks in each universe | ±1 each |

**Futures Trend**

| Variable | Source | Range |
|---|---|---|
| `ALL_FUTURES_TREND_SCORE`, `NIFTY_50_FUTURES_TREND_SCORE`, `NIFTY_BANK_FUTURES_TREND_SCORE` | Bulls vs Bears count from NSE futures REMARK | ±1 each |

**OI + OBV**

| Variable | Source | Range |
|---|---|---|
| `NIFTY_50_OI_OBV_SCORE`, `NIFTY_BANK_OI_OBV_SCORE`, `RELIANCE_OI_OBV_SCORE`, `HDFCBANK_OI_OBV_SCORE`, `ICICIBANK_OI_OBV_SCORE` | OI+OBV per-strike scoring from `INSTRUMENT_SCORE_MAP[name].oi_obv` | ±N each |

**OI/OBV scoring de-bias (v26.31)** — `scoreOIStrikeForSignal`/`computeOIScoreFromData` were changed to remove two structural bullish biases (PCR > 1 is the norm, so both leaned bullish): (1) the **per-strike wall** (`±0.5 if PE OI > CE OI`) is no longer summed into the directional score — returned as `oiData.oiWall` (S/R context) instead; (2) the **standing PCR** term (`±0.5…1`) is removed from the score — kept as `oiData.pcr` context only; only **change-PCR** (today's fresh OI) remains scored. This deflated the composite ~5–8 pts → signal/gauge/verdict thresholds were lowered + symmetrised (see above). Also added: **`oiData.obvFlow`** = pure raw-OBV directional read, and **`oiData.oiConflicts`** = # strikes where IV disagreed with the OBV-based label. Both surfaced in the OI signal strip ("OBV Flow" column, `sig-obv-flow` info) and the Master Scanner detail. `INSTRUMENT_SCORE_MAP[name].oiExtras` now carries `obvFlow`/`oiWall`/`oiConflicts`.

**OBV-primary signal priority (v26.33)** — `scoreOIStrikeForSignal`'s CE/PE classification was rewritten so **OBV always decides the label** (WRITE/BUY/COV/UNWIND); IV no longer overrides it. IV only scales *confidence*: if IV has a direction (>±0.3%) and agrees with the OBV-based label, weight ×1; if it disagrees, weight ×0.5 (still follows OBV, just less confident). Price is a last-resort fallback (×0.3) only when OBV itself is flat. Previously IV could flip the label outright (even a flat/noisy IV reading), which repeatedly produced labels contradicting the visible OBV (e.g. CE BUY while CE OBV was negative) — OBV is a direct volume read, while IV here is Black-Scholes-inferred off 5-min candles and noisier than it looks. `oiConflicts`/the ⚠ flag now mean "IV disagreed but OBV still drove the label," not "IV overrode OBV."

**Max Pain**

| Variable | Source | Range |
|---|---|---|
| `NIFTY_50_MAX_PAIN_SCORE`, `NIFTY_BANK_MAX_PAIN_SCORE`, `RELIANCE_MAX_PAIN_SCORE`, `HDFCBANK_MAX_PAIN_SCORE`, `ICICIBANK_MAX_PAIN_SCORE` | +1 when Max Pain > spot (gravitational pull up), −1 when below; 0 if within 0.3% of spot | ±1 each |

**IV Skew**

| Variable | Source | Range |
|---|---|---|
| `NIFTY_50_IV_SKEW_SCORE`, `NIFTY_BANK_IV_SKEW_SCORE`, `RELIANCE_IV_SKEW_SCORE`, `HDFCBANK_IV_SKEW_SCORE`, `ICICIBANK_IV_SKEW_SCORE` | Put skew > 2% → −1 (bearish pressure); Call skew > 2% → +1; read from `INSTRUMENT_SCORE_MAP[name].oiExtras.ivSkew` | ±1 each |

**Component Scores**

| Variable | Source | Range |
|---|---|---|
| `NIFTY_50_COMPONENT_SCORE` | Top-10 Nifty 50 constituents: `computeInstrumentScore(stock).total × weight%` summed | float |
| `NIFTY_BANK_COMPONENT_SCORE` | Top-10 Bank Nifty constituents: same formula | float |

`computeInstrumentScore(name)` — computes `{nine_fifteen, current_trend, futures_trend, oi_obv, max_pain, iv_skew, total}` for any instrument from localStorage + `INSTRUMENT_SCORE_MAP` (no API calls). The `total` is the sum of all six sub-scores.  
`computeComponentScores()` — iterates `NIFTY_50_WEIGHTED_STOCKS` and `NIFTY_BANK_WEIGHTED_STOCKS`, calls `computeInstrumentScore`, applies weight, populates `INSTRUMENT_SCORE_MAP[name].score`.  
`getFuturesTrendScore(remark)` — maps futures REMARK string (`LONG`, `SHORT`, `LONG_UNWINDING`, `SHOT_COVERING`, etc.) to +1/0/-1. Note: `LONG_UNWINDING` = -1 (bearish), `SHOT_COVERING` = +1 (bullish) — opposite of what the names suggest.  
`INSTRUMENT_SCORE_MAP` — global cache: `{name: {futures_trend, oi_obv, oiExtras, strikeMap, open, oiData, score: {nine_fifteen, current_trend, futures_trend, oi_obv, max_pain, iv_skew, total}}}`.

Score thresholds for gauge color (recalibrated v26.31 after OI/OBV de-bias): red < 0, orange 0–4, yellow 4–8, green ≥ 8.

`SCORE` is a **local variable** inside `setScore()` — not a global. To use the composite score outside `setScore()`, recompute it by summing all the global score variables listed above.

## Exit signal logic (grootTradeBot.js)

`checkExitSignal(entryDirection)` — called each tick; reads `computeInstrumentScore('NIFTY 50')` and index futures from `INSTRUMENT_SCORE_MAP`.

- **EXIT LONG**: `current_trend < 0` (NIFTY 50 below BSO/BST) OR both `n50Fut < 0 && bnFut < 0`
- **EXIT SHORT**: `current_trend > 0` (NIFTY 50 above ASO/AST) OR both `n50Fut > 0 && bnFut > 0`

`n50Fut` / `bnFut` come from `INSTRUMENT_SCORE_MAP['NIFTY 50'].futures_trend` / `['NIFTY BANK'].futures_trend`, which are set from the NSE futures REMARK via `getFuturesTrendScore`.

`renderExitBanner()` — renders `#gtb-exit-signal` with exit reason text, e.g. "EXIT LONG — trend bearish (-1)".

## Market signal logic (grootTradeBot.js)

`getMarketSignal(SCORE, breakOutNineFifteen)` — returns `{signal, color, reason, tradeSignal}`.

Signal thresholds (recalibrated v26.31 — symmetric, after the OI/OBV score was de-biased by removing the per-strike wall + standing PCR, which deflated the composite ~5–8 pts): STRONG BUY ≥ 8, BUY ≥ 4, WAIT ≥ 1.5, SIDEWAYS ≥ -1.5, WAIT ≥ -4, SELL ≥ -8, STRONG SELL below. Conflict-override triggers at SCORE > 4 / < -4. (Old asymmetric range was +12…-11.)

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
gtb-settings-toggle, show-trade-checklist, show-quote-fetch, show-ws-subscribe,
show-help, data-load
```

Bootstrap Icons used: `bi-grid-3x3-gap-fill`, `bi-calendar-week`, `bi-layers-fill`, `bi-bullseye`, `bi-flag-fill`, `bi-droplet-fill`, `bi-eye`, `bi-list-ul`, `bi-graph-up`, `bi-bar-chart-steps`, `bi-plus-circle-fill`, `bi-gear-fill`, `bi-clipboard-check`, `bi-search`, `bi-broadcast`, `bi-question-circle-fill`, `bi-sliders`. **Note:** the bundled Bootstrap Icons version is older — `bi-database-fill-gear` and `bi-activity` are missing; use `bi-sliders` and `bi-toggles` as alternatives.

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

**C · Instrument Scores** — table for 9 instruments (GIFT NIFTY, NIFTY 50, NIFTY BANK, SENSEX, RELIANCE, HDFCBANK, ICICIBANK, CRUDEOILM, USDINR): columns 9:15 / Trend / Futures / OI/OBV / Max Pain / IV Skew / Total / Action. Total = sum of all six sub-scores from `computeInstrumentScore`. Action thresholds (symmetric, recalibrated v26.31): total ≥ 3 → BUY CE, ≥ 1 → CE (wait ASO), -1…1 → WAIT, ≤ -1 → PE (wait BSO), ≤ -3 → BUY PE.

## Analysis tools (grootTradeBot.js, opened from topbar icons)

- **9:15 Opening-Trend backtest** (`#show-915-backtest` → `_gtbBuild915Trend(250)` / `_render915Trend`): ~1 year, day-wise. Classifies each day's 9:15 close for NIFTY/SENSEX/BANK (+GIFT ref) via `_gtbClassify915`, resolves the combo through the shared **`GTB_STRAT_LOOKUP`** map (+ `_gtbNorm915`), and simulates the entry-level trade per leg (`_gtbSimLeg`/`_gtbLegsFor`): lvl vs trd entry, P/L at 12:00, MFE/MAE, 1:1 TP/SL, entry/peak times. Shows a **per-combo edge table** (win-rate, Avg P/L, Avg Max-Fav, **Low-VIX/High-VIX split** at median VIX) + **day-by-day table**. Today's combo is highlighted in both. Combo rows open a chart grid; day rows have a per-day chart button. Uses chunked 5-min fetch (`_gtbFetch5minRange`, ≤95-day windows — Kite caps 5-min at 100 days) and caches rows in `localStorage` (`GTB_915TREND_<date>_250_v2`).
- **OI Compare matrix** (`#show-all-oi` → `_gtbOICompareTableHtml`): all instruments (main + weighted constituents, `_gtbAllOIInstruments`) in one horizontal table — rows = instruments, columns = strikes around ATM, cells = CE/PE ΔOI + OBV + signal + score (`_gtbOICell`). Detailed/Compact (heatmap, `_gtbOICellCompact`) toggle persisted in `GTB_OIC_MODE`. Reads cached `INSTRUMENT_SCORE_MAP[name].oiData` (no fetch).
- **Strike-level probability** (`%` button per row → `_gtbStrikeProb`): 60-day daily-OHLC backtest of continuation/reversal probability when price touches ASO/AST/BSO/BST.
- **Pre-Trade Checklist** (`show-trade-checklist` → `_gtbShowTradeChecklist`): see section above.

## Instrument detail view (grootTradeBot.js + common.css)

`_gtbLoadInstrDetail(name)` / `_gtbLoadInstrDetailPanel(name, suffix)` — build a multi-column detail popup (`#show-futures-signal`). Panel order: Identity → Price Action → OI/OBV → OI Matrix → 9:15 Breakout → Trend Probability → Futures → Weightage → Details → Trade Analysis → Risk Manager.

**Sticky identity header**: CSS `position: sticky` fails inside a flex-row scroll container. Fix: JS scroll listener bound **directly** (not delegated — scroll events don't bubble) on `#fsig-multi-row`, using `transform: translateY(scrollTop)` on `.gtb-ic-panel-identity`. Global CSS keeps sticky for the main dashboard overview; detail view overrides to `position: relative` for JS control.

`showOIOBVBarChart(name, suffix, _oiDataOverride)` — x-axis element id is `tempName + '-oiobv-xaxis' + suffix` (suffix must be included, otherwise x-axis not found in detail view).

## Instrument Detail View — minimal chart-page mode (v29.24–v29.28)

`_gtbCreateInstrDetailPopup(minimal)` / `_gtbOpenInstrDetailFor(name, minimal)` — `minimal=true` skips the full multi-instrument picker chrome (filter row, symbol search, Add button, watchlist pick chips) and sizes the popup to one card's own width (~640px) instead of ~1400px. `commonShowInidividuslStockPopupWindow` (script.js) — the only caller reached from `showDetailsOnChartPage`, i.e. landing directly on a Kite chart page — always passes `minimal=true`, since that flow only ever wants the one instrument you're already looking at. Every other entry point (Analyze buttons, the topbar icon) keeps the full picker.

**Minimize bug on the chart page**: `.popup-win-minimize`'s plain `content.hide()` (inline, non-`!important` `display:none`) can lose to Kite's own page CSS on `/markets/ext/chart/` — the only route this minimal popup ever opens on. Fixed with an `!important` CSS fallback class (`gtb-popupwin-minimized` → `.popupwindow_content { display: none !important; }`, common.css) toggled alongside the existing `.hide()/.show()`, same class of fix as the pre-existing "win control buttons: force visible even if host page resets buttons" rule right above it.

## Dashboard tab restructure + Price Action grid (v29.03–v29.22)

Reordered/regrouped: **Price Action** grid (new, full-width, above Predict) → **Predict** → OI/OBV matrix (Index/Stock + Weighted, 2-col) → **Index/Stock OI + Weighted Constituents OI** (2-col — was 3-col with Futures Accuracy squeezed in as a third column, now correctly `1fr 1fr` after Futures Accuracy moved out; the stale 3-col CSS left over from that move was the actual cause of a visible empty-space bug) → **Futures Accuracy + Level Probability** (2-col, side by side).

**Price Action grid** (`_gtbDashPARenderCell`, one cell per `_GTB_CHARTGRID_INSTRUMENTS` entry — GIFT NIFTY/NIFTY 50/NIFTY BANK/SENSEX/HDFC BANK/RELIANCE/ICICI BANK/CRUDE OIL): single horizontal row (`grid-auto-flow:column`, scrolls if narrow), real `'5minute'` candles (hardcoded, independent of `HISTORICAL_DATA_INTERVAL`), snapshot-time trimmed via the normal `_gtbTrimCandles()`. Explicitly does **not** use a literal Kite `'day'` interval — that can't be truncated to an earlier time-of-day (same limitation documented under "LTP loading" below), so it would silently ignore the snapshot-end-time picker every other chart in the app honors. Each cell has a Kite chart-page link (↗ icon, `_gtbDashPAChartLink`) and the whole grid has its own **Refresh** button, independent of the ~5-minute main refresh cycle.

`_renderLWChart`'s new `opts.minimal` flag (used by this grid): no zoom/fit controls, no Y-axis, no X-axis, no last-price bubble/line, no corner legend — just candles + ref lines. A genuinely single-candle chart (`candles.length === 1`) also gets relaxed `fixLeftEdge`/widened bar spacing so the one bar is actually visible instead of a near-invisible sliver pinned to the left edge — this must stay scoped to exactly 1 candle, not "a few": relaxing it for a small handful of real 5-min candles (e.g. early in the session) stretches them into wide flat bands instead of normal thin candlesticks.

**Level Probability** (`_gtbLevelProbLiveRowsHtml`, shared by the Dashboard card and the Metrics tab's own section — extracted so both can't drift into two implementations of the same live-signal-only list): now grouped into two sorted sections — **ASO-leaning** (max of ASO/AST/VIXU ≥ max of BSO/BST/VIXL) and **BSO-leaning** — each sorted by its own leading % descending, instead of a fixed NIFTY-first instrument order. The old 5-minute-history matrix (`_gtbRenderLevelProbPane`, `#gtb-pane-lvlprob`) is no longer surfaced anywhere in the UI (dropped from both a prior floating-toolbar popup and the refresh-cycle hook) — `_gtbSnapshotLevelProb()` still runs each refresh in case that view gets wired back in later.

## SENSEX OI/OBV never fetched in the bulk refresh cycle (v29.21)

Root cause of "SENSEX OI/OBV not showing after refresh" (previously suspected to be a rate-limit/timing issue): `_phase2` in `commonShowPopupWindow()` runs every core instrument through `_refreshNSE(name)` (which calls `showPrictionProbabilty` → `showTrendingOI`, the function that actually populates OI/OBV) — **except SENSEX**, which only ever got a bare `showTopChart('SENSEX')` call (price chart only). The manual Signals-tab reload button worked because that separate code path (`_gtbSigFetchAndRenderOI`) already included SENSEX in its name list. Fixed by replacing the standalone `showTopChart('SENSEX')` call with `_refreshNSE('SENSEX')` — SENSEX has no NSE futures, so that leg's `showFutureDetails('SENSEX')` fails/returns nothing, but it's already try/caught there like every other instrument.

## Options/futures expiry resolution — one shared resolver everywhere (v29.14–v29.27)

`_dlResolveExpiryFor(configured, availableExpiriesISO)` + `_dlConfiguredExpiryForName(name)` (dataLoad.js) — the single place that decides which expiry an instrument's rows in `OPTION_STRIKE_LIST`/`FUTURE_INTRUMENT_LIST`/MCX lists resolve to: the Settings-configured value if it's actually one of that name's real expiries, else that name's own nearest live expiry (`_dlNearestLiveExpiry`). Settings sources: `nifty_expiry_date`/`sensex_expiry_date`/`banknifty_expiry_date` (each NIFTY/SENSEX/BANKNIFTY has its own dedicated field), `fo_stocks_expiry_date` (one shared field for every other F&O stock — same "one setting for many" convention as `future_expiry_month`), `mcx_expiry_<name>` (per-MCX-commodity, now an exact `YYYY-MM-DD` date rather than just a month, since a commodity can list more than one contract in the same calendar month).

Wired into **every** consumer that previously had its own (sometimes incomplete) expiry filter, so they can't drift apart: `oiAnalyzer.js`'s `showTrendingOI` (previously only filtered NIFTY/SENSEX to a specific expiry — BANKNIFTY/FINNIFTY/MIDCPNIFTY/every F&O stock pushed items from **all** expiries into the OI/OBV table unfiltered, a real correctness bug now fixed), `optionStrikeSearch.js`'s `_ossRunSearch` (same gap, same fix), dataLoad.js's own MCX futures **and options** resolution (options were previously hardcoded to always pick nearest, silently ignoring `mcx_expiry_<name>` entirely), and the Data Load popup's **Raw Globals** tab (below).

`CRUDE_OPTION_LIST`/`USDINR_OPTION_LIST` (commoditiesOptionStrikes.js) were removed — declared and read by the Raw Globals viewer but never actually assigned anywhere in the codebase; `MCX_OPTION_LIST` (the real, populated combined list, filterable by name) already covers that data.

## Data Load — Raw Globals tab (v29.04)

New tab in the Data Load popup (`#dl-panel-rawglobals`) — click-to-inspect the live in-memory value of `NSE_STRIKE_DIFF`/`NSE_FUTURE_STRIKE_DIFF`/`INSTRUMENT_TOKENS`/`FUTURE_INTRUMENT_LIST`/`FO_LIST`/`NSE_OPTION_STRIKE_LIST`/`COMMODITIES_FUTURE_INSTRUMENT_LIST`/`MCX_OPTION_LIST` one at a time, capped at 200 rows (`_DL_RAWG_CAP`) with a text search box — earlier versions ran `JSON.stringify()` over the **entire** array (10K+ rows for `NSE_OPTION_STRIKE_LIST`) into one `<pre>`, which hung the tab; now only a capped/filtered slice is ever stringified. Expiry-bearing globals also apply the shared one-expiry-per-name resolver above (`_dlRawgBuildExpiryMap`), so what's shown here matches what the live OI/OBV pipeline is actually using — not a separately-derived view.

## Market Profile — a second, independent Location signal (v29.02)

`_gtbMarketProfile(candles)` (grootTradeBot.js) — 30-bin volume-at-price histogram over `oiData.spotCandles` (already cached, no new fetch) → POC (highest-volume bin) + Value Area (smallest contiguous band around POC covering 70% of volume — the standard Market Profile definition). Wired into `_cmdBuildVerdict`'s Location check as an **upgrade-only** signal: if the OI-wall check came back "no wall"/"dead zone", and spot is independently near the Value Area Low (long bias) or Value Area High (short bias), Location is upgraded to confirmed. Never downgrades a wall that already confirmed, and disagreement between the two sources isn't flagged as a conflict — just "no extra confirmation" from the second source.

## Pre-Flight tab — now live, not static (v28.92)

`_gtbRenderPreflightPane()` was originally a static, render-once reference diagram. Rewritten to recompute every refresh: pulls the real `_cmdBuildVerdict('NIFTY 50')` output, 9:15 zones, breadth/futures-trend globals, leading/lagging split, and crude trend, then redraws the flowchart with actual numbers — gates colored green/amber/red/grey by whether they actually passed, failed, or were never reached (`_gtbPreflightGateStates(v)`, derived purely from `v`'s own fields, no re-scoring), with the final LONG/SHORT box only lit up (with the real Entry/Stop/Target) when that's the genuine live outcome.

## Commodities popup (grootTradeBot.js)

`#show-commodities` → builds GIFT NIFTY + CRUDEOILM panel. After `showPopUpWindow`, removes `popupwindow_titlebar_draggable` to prevent popup moving on titlebar click. Level labels (ASO/AST/BSO/BST/OPEN/VIXL/VIXU) above the crude chart are populated from `INSTRUMENT_SCORE_MAP['CRUDEOILM'].strikeMap` and `.open` (cached by `showTopChartMCX`).

## Crude Score gauge — leading/lagging split (v27.10)

Top of the Commodities popup's CRUDEOILM column now has a **SCORE** gauge (`_cmdRenderCrudeScoreGauge()`), the same `_renderGauge()` ApexCharts radial widget the main dashboard's SCORE card uses, scoped to CRUDEOILM alone via `computeInstrumentScore('CRUDEOILM')`. Split into the same leading/lagging grouping `setScore()` uses for the market composite: **leading** = 9:15 + current trend + futures trend (always counted), **lagging** = OI/OBV + Max Pain + IV Skew (dropped when Settings → "Include lagging (OI/MaxPain/IVSkew/Components)" — `GTB_INCLUDE_LAGGING` — is off; this is a **global** toggle shared with the main composite, not commodities-specific). Scale is ±10 (single instrument) vs the main SCORE's ±40 (market-wide). Breakdown line (`#cmd-crude-score-breakdown`) shows `Leading +X · Lagging +Y` below the gauge.

## Fair Value / Global Context — WTI not Brent (v27.02–27.05)

`_cmdRenderGlobalContext()` (pre-existing, in the Commodities popup) computes `Fair Value = WTI($) × USD/INR` and compares it to MCX LTP as a **Gap %** — cross-checking MCX crude against the global benchmark it's actually priced off, the same idea discussed for why NSE signals are more reliable than crude's own OI/OBV. Two real bugs found and fixed while wiring this up:

- **Wrong benchmark**: originally used Brent (`BZ=F`); corrected to **WTI** (`CL=F`) — MCX Crude Oil's contract spec settles against NYMEX WTI, not Brent. Confirmed via real data: genuine live Brent + USD/INR still produced a persistent ~9% gap, too large to be a data error and consistent with wrong-benchmark. A single-digit-% gap here is normal/structural (import duty + GST + freight/dealer margin baked into MCX price, not captured by a plain price×FX formula) — the gap-size warning threshold was raised from >3% to >12% accordingly.
- **`mcxLtp` fallback chain read stale/wrong data**: `CRUDEOILM` has no `INSTRUMENT_TOKENS` entry (that list is NSE-only), so `INSTRUMENT_LTP_PRICE['CRUDEOILM']` is never populated by `scanLtpPrice()`, and `generateTrend('CRUDEOILM')` throws for the same reason — both fallbacks were dead. It was silently falling through to `INSTRUMENT_SCORE_MAP['CRUDEOILM'].open` (the session's **opening** price, not LTP). Fixed by caching the real live LTP from `showFutureDetailsMCX('CRUDEOILM')`'s own fetch (already running in the same popup, in `_cmdLoadAll`) into `INSTRUMENT_SCORE_MAP['CRUDEOILM'].mcxLtp`, checked first in the fallback chain.

**Fetch Live (WTI + USD/INR)** button — `_cmdFetchYahooQuote(symbol)` uses `GM_xmlhttpRequest` (bypasses CORS, no API key) against Yahoo Finance's chart endpoint for `CL=F` (WTI) and `USDINR=X`, replacing the manual `CMD_WTI_CUR`/`CMD_WTI_PREV`/`CMD_USDINR` localStorage entries. USD/INR's own "live" branch (reading `INSTRUMENT_LTP_PRICE['USDINR']`) is *also* dead for the same INSTRUMENT_TOKENS reason — this button is the only thing that actually refreshes it. `@connect query1.finance.yahoo.com` added to the userscript header for this.

## Dead zone chart markers (v27.04–27.05)

`_gtbDeadZone(name)` (grootTradeBot.js) — a price band where futures + OI/OBV + 9:15 price-action signals disagree or are too weak for real conviction, so price is expected to chop until it actually breaks the band. Bounds = nearest OI-wall support/resistance (`_gtbFindWalls`, ranked by OBV pressure) when cached, else the 9:15 BSO/ASO band; only returned when `computeInstrumentScore(name).total` is inside ±3 (weak conviction) — once a real directional score exists, there's no zone to mark. Drawn as two dashed purple price lines (`D↓`/`D↑`, color `#8b5cf6`) via `_renderLWChart`'s `refLines` mechanism (only DEADLO/DEADHI use `LineStyle.Dashed`, everything else is solid) — wired into both `showTopChart()` (NSE) and `showTopChartMCX()` (MCX/crude, `commodities.js`). Read as: don't trust a breakout until price closes through the far side of the band, even if it already cleared a "normal" level like AST — the dead zone can straddle existing strike levels rather than sitting cleanly above/below them.

## Stock Viewer confidence conflict-gate (v27.07)

`_svRenderScoreConfidence()` (stockViewer.js) previously showed a bold "STRONG SHORT/LONG" verdict purely from `total`'s sign, even when the majority of the 4 sub-signals (9:15, current trend, futures, OI/OBV) actually disagreed with that sign — e.g. 9:15+Trend both bullish but one large OI/OBV swing dragging `total` negative, producing "STRONG SHORT" at a self-reported 25% confidence. Added a `conflict` check — `(total > 0 && bears > bulls) || (total < 0 && bulls > bears)` — that demotes the verdict to a plain amber **WAIT** with an explicit "⚠ Price action disagrees with the OI-driven score" note instead of showing a confident directional call the majority of signals don't support.

## Funds + P&L topbar badge (v27.00)

New chip next to the VIX badge in `#gtb-topbar` (`#gtb-funds-badge`) — `FUNDS ₹X` / `P&L ±₹Y`, refreshed every refresh cycle (and click-to-refresh). `_gtbFetchFundsMargins()` hits `/oms/margins` (kite.zerodha.com's own internal endpoint — same-origin, enctoken header via `jQ.ajax`, no CORS/GM_xmlhttpRequest needed) for `equity`/`commodity` `available.live_balance`; day P&L sums `/oms/portfolio/positions`' `day[].pnl` (reuses `_gtbDiaryFetchPositions()`, already built for the Notes tab's Kite import — Kite's own `pnl` per position is trusted directly rather than re-derived).

## Chart polish — maximize x-axis fix, OHLC hover tooltip (v27.06–v27.09)

- **Stock Viewer OI/OBV column layout**: the two mini OI/OBV bar charts had a fixed height (58px each) that, combined with labels + the shared x-axis strike-label row, could exceed the row's actual height on common row-height settings — `overflow:hidden` then silently clipped the *last* child in DOM order (the x-axis labels). Fixed by making the chart containers `flex:1 1 0` (they shrink to fit) while labels/x-axis stay `flex-shrink:0` (always visible), in `common.css`.
- **Maximized price-action chart x-axis**: `maximizeChart()`'s container div was hardcoded to `height:500px` while the chart itself was rendered at `520px` (`showTopChart(name, ..., 520)`) — the mismatched 20px was exactly where the time-axis labels live, clipped by the container's `overflow:hidden`. Fixed by matching the container to 520px.
- **OHLC hover tooltip**: `_renderLWChart()` now subscribes to `chart.subscribeCrosshairMove()` and shows a floating tooltip (`.lw-ohlc-tooltip`, positioned absolutely inside the chart container, flips left near the right edge) with time/O/H/L/C/Chg for the hovered candle — applies to every chart routed through `_renderLWChart` (dashboard rows, Stock Viewer, Instrument Detail View, maximized view, commodities).

## Quote Fetch + WebSocket Subscribe popups (quoteWs.js, v26.90–v26.96)

New standalone file `static/autoTrade/quoteWs.js`, wired via `@require` in `autotrade.user.js` and two floating-toolbar entries (`show-quote-fetch`, `show-ws-subscribe`). Both **draggable** (unlike most popups in this app, which lock the titlebar) and **theme-synced** (`toggleClass('gtb-light', ...)` on open, matching `GTB_THEME`).

- **`showQuotePopup()`** — search+autocomplete instrument picker, fetches via `_qwFetchQuote()` against the official Kite Connect REST Quote API (`api.kite.trade/quote`) using `GM_xmlhttpRequest` (bypasses CORS — Kite Connect sends no permissive CORS headers for browser origins, which is why the old `getQuotesUsingPromise()` in `utils.js` — used by `marketQuotes.js`'s Quick Quote Analyzer — has always silently failed via `jQ.ajax`, resolving `[]` on error instead of surfacing it). Needs `api_key` + `api_access_token` (Settings) as a **matched pair from the same Kite Connect OAuth login session** — pasting only an `access_token` while `api_key`/`api_secret` are still the shipped placeholder defaults produces "Incorrect api_key or access_token".
- **`showWebSocketPopup()`** — subscribes directly to Kite's ticker WebSocket (`wss://ws.kite.trade`) from the page (not subject to CORS preflight the way XHR is). Binary tick parser (`_qwParseBinaryMessage`) ported from groot-ui's `useKiteTicker.ts`. `_qwDefaultSubscribeList()` auto-subscribes `INDICES` + `NIFTY_50_WEIGHTED_STOCKS` + `NIFTY_BANK_WEIGHTED_STOCKS` (deduped, resolved via `INSTRUMENT_TOKENS`) on first open if nothing is subscribed yet. Table shows Instrument/LTP/Chg/**Open/High/Low/Prev Close**/Vol, subscribed in `'full'` mode.
- `@connect api.kite.trade` added to the userscript header for the Quote Fetch popup.

## Futures Remark Accuracy in Instrument Detail View + trade recommendation rewrite (v26.92–v26.94)

`_gtbReconstructFutAccuracy(cd, vix, accMap)` (previously CRUDEOILM-only, in the Commodities popup) generalized via `_dvLoadFutAcc(name, tid, sfx, isMcx)` and added as a new "FUTURES REMARK ACCURACY" panel to all three Instrument Detail View builders (`_buildCardStandalone`, `_gtbLoadInstrDetail`, `_gtbLoadInstrDetailPanel`) — replays 5-min candles, buckets REMARK-vs-next-candle-outcome into a per-REMARK win-rate table. Result cached on `INSTRUMENT_SCORE_MAP[name].futAccMap`/`.futures_trend_remark` for reuse.

`_btStrategyFor()` (bloombergAnalysis.js, the "SUGGESTED SETUP" engine behind Trade Analysis) rewritten to fold in three previously-unused signals as capped (±2.5 total) adjustments to `cs.total`: (1) futures REMARK accuracy (boosts/dampens conviction based on today's win-rate for the current REMARK, if ≥8 samples), (2) `_gtbLevelProb(name)` (boosts/dampens based on live-signal probability of reaching the next level in the suggested direction), (3) Max Pain/GEX — **Max Pain never dampens conviction** (see [[trade-signal-priority]] memory: futures+OI/OBV flow is the faster, leading signal; Max Pain is framed as an informational target/support-resistance level only), though GEX *regime* (Stabilising vs Trending) can still push toward an Iron Condor for a weak-directional case.

## OI/OBV chart color legend tooltips (v26.73)

Both OI/OBV bar-chart legends (`_cmdRenderOI` for crude/commodities, `renderOIOBVMaximized` for
NSE) now spell out the full color code with hover tooltips, not just the R1/R2/S1/S2 wall
legend that already had them:
- **Red = CE, Green = PE** (hue = side, always — regardless of bullish/bearish direction)
- **Grey = Neutral** (no clear signal — OI change flat or too small to classify)
- **Solid = new positions** (WRITE/BUY, full weight) vs **Faded = closing** (COV/UNWIND, half
  weight) vs **Extra-dim = ITM** (lower conviction, often rollover/hedging noise)

Each swatch now has a `title` tooltip explaining it, so a single strike's bar pair (e.g. a
faded pink CE bar + solid green PE bar) is self-explanatory on hover instead of requiring a
lookup elsewhere.

## VIX "no data" vs "actually zero" (v26.72)

Removing the crude-config fallback (v26.71) surfaced the next real issue: with no fallback,
`vixVal` is `0` whenever India VIX LTP isn't cached yet — and every regime classification did
`vixVal < 13 → LOW`, so **missing data silently displayed as "LOW volatility"** (a real,
calm reading) instead of "no data yet." Fixed in all 5 places that classify vixVal into a
labeled regime/multiplier: `_btRenderVIX` (VIX Regime panel), `_gdbWidgetPulse` (Market Pulse),
`_gdbWidgetRisk` (Risk Manager sizing), `_btRenderPrediction`'s VIX confidence signal, and
`_btAnalyzeAll`'s VIX regime — each now checks `!vixVal` first and shows "NO DATA" (grey)
instead of defaulting into the LOW bucket. Confidence/size multipliers also default to neutral
(1.0×) rather than the amplifying/full-size value LOW would have implied.

## VIX config is crude-only — removed as an NSE fallback (v26.71)

Following the v26.70 type fix, clarified the actual meaning of `VIX` (config.js): it's a
manually-entered value for the **crude commodities dashboard** (an OVX proxy the user enters
by hand), not a general India VIX fallback. It must never substitute for India VIX in NSE
contexts. Removed the `if (!vixVal) vixVal = parseFloat(VIX) || 0` fallback from all 8 NSE-only
call sites (`_gdbWidgetPulse`, `_gdbWidgetRisk` in grootDashboard.js; `_btRenderVIX` in
bloombergDashboard.js; `_btRenderPrediction`'s VIX confidence signal, `_btAnalyzeInstrument`,
`_btAnalyzeAll`, and the historical-day-builder's `d.vixVal` in bloombergAnalysis.js; the risk
panel and the `else` (non-commodity) branch of the already-correct OVX/GVZ/VXSLV instrument-
aware vol modifier in grootTradeBot.js) — these now show whatever India VIX LTP is actually
cached, or `0`/`--`, instead of silently substituting the crude config value. The one legitimate
remaining use of `VIX` (grootTradeBot.js ~line 249, inside `_gtbRenderDayChart`'s `if
(r.inst.mcx)` branch, as the fallback vol index for MCX instruments other than
CRUDEOILM/GOLD/SILVER/USDINR — e.g. NATURALGAS) is correctly scoped to the commodities path and
was left unchanged.

## VIX config fallback string/number bug (v26.70)

Root cause of the `vixVal.toFixed is not a function` crash the v26.69 try/catch hardening
surfaced: `VIX` (config.js: `const VIX = g_config.get("VIX")`) is a MonkeyConfig **text** field,
so it's always a **string**, even when it "looks like" a number (e.g. `"15"`). Eight call sites
across grootTradeBot.js, grootDashboard.js, bloombergDashboard.js, and bloombergAnalysis.js did
`vixVal = VIX || 0` as a fallback when live VIX LTP wasn't cached yet — assigning the raw string
straight into a variable later used with `.toFixed()`, which only exists on Number. Fixed all
eight to `parseFloat(VIX) || 0`. This is the same class of bug as the OI/OBV `priceChange`
dead-field issue found earlier — a fallback path that's rarely exercised (only hit when
`INSTRUMENT_LTP_PRICE['INDIA VIX']` is missing) silently carrying the wrong type until it broke
something downstream.

## Groot Market Terminal — one bad panel no longer blanks the rest (v26.69)

`_btRenderAll()` (bloombergDashboard.js, the "Analysis" tab / Market Terminal) previously called
`_btRenderTape/_btRenderHeatmap/_btRenderRelStrength/_btRenderBreadth/_btRenderVIX/
_btRenderOptionsFlow/_btRenderStats/_btRenderPrediction` with **no error protection** — only the
GDB widgets below them (Market Pulse, Score Matrix, etc.) were try/catch-guarded. Since JS halts
a function at the first uncaught exception, one bad panel (e.g. VIX Regime hitting bad/missing
data) silently stopped *every* render call after it in the list — matching the reported symptom
exactly: Heat Map / Relative Strength / Market Breadth populated, everything from VIX Regime
onward (Options Flow, Correlation Matrix, Intraday Snapshot, Trend Probability, Market Pulse,
Score Matrix, Opportunity Ranker, Index Divergence, Level Maps, Backtest Summary, Risk Manager)
blank, with no visible error anywhere. Each section now runs through its own `try/catch` (logged
to console as `[Groot Market Terminal] <section> render failed:`) so a single panel's failure is
isolated and every other panel still renders. **Next step if a panel is still blank**: open the
browser console — the exact failing section and its error are now logged instead of silently
swallowed.

## Level Prob tab — NIFTY 50 column + per-level breakdown (v26.89)

**NIFTY 50 missing from columns:** `activeNames` was filtering out any instrument with zero
captured history so far — for a stock that never fired that's fine, but for the two indices
it meant NIFTY 50 (or NIFTY BANK) could silently vanish from the table if no snapshot for it
had landed yet, with no visual indication why. Fixed: `NIFTY 50`/`NIFTY BANK` are always shown
as columns regardless of data state; only weighted-stock columns are dropped when empty.

**Per-level breakdown:** cells previously collapsed all three upside levels (ASO/AST/VIXU) into
one `▲NN%` (the max) and all three downside levels (BSO/BST/VIXL) into one `▼NN%` — per request,
each cell now shows all six individually, using the same `A`/`A+`/`V↑` (upside) and `B`/`B-`/`V↓`
(downside) abbreviations as the commodities popup's level chips, two lines per cell (green
upside row, red downside row). `_gtbSnapshotLevelProb()` and `_gtbBuildLevelProbHistoryToday()`
now store `{aso, ast, vixu, bso, bst, vixl, u, d}` per cell (the collapsed `u`/`d` kept for
back-compat with anything still reading them). Older cached history written before this change
only has `u`/`d` — the renderer detects `c.aso === undefined` and falls back to the old
collapsed `▲/▼` cell for those rows rather than showing blanks.

## Crude LTP chip + Level Prob tab transposed (v26.86)

**Commodities popup — crude LTP.** The crude chart's level strip (`#cmd-crude-levels`, the
ASO/AST/BSO/BST/OPEN/VIXU/VIXL chip row) had no LTP anywhere — added an "LTP" chip prepended to
it once `showFutureDetailsMCX('CRUDEOILM')` resolves (`fres.ltp`, colored green/red vs `fres.open`),
same chip visual convention as the existing level labels.

**Level Prob tab — transposed.** `_gtbRenderLevelProbPane()` previously rendered instruments as
rows and 5-min time buckets as columns (wide horizontal scroll to see a stock's full-day trend).
Flipped per request: time buckets are now rows, instruments are columns (`activeNames`) — scanning
one stock's day is now a vertical read down a column instead of a horizontal scroll. Same `▲NN%
▼NN%` cell format and `.oic-sticky` first-column freeze, just swapped axes.

## Notes tab — import real fills from Kite (v26.85)

Added a real broker feed to the Trade Journal, using the two endpoints the user pointed at:
`https://kite.zerodha.com/oms/orders` and `https://kite.zerodha.com/oms/portfolio/positions`
(same `BASE_URL` + enctoken-header GET pattern as `_gtbHistAjax`/`getHistoricalData` in
utils.js). New **"Import from Kite"** button in the Notes tab header:

- **`_gtbDiaryFetchOrders()`** — GET `/oms/orders`, used only to find each tradingsymbol's
  earliest `COMPLETE` fill time today (positions don't carry a timestamp).
- **`_gtbDiaryFetchPositions()`** — GET `/oms/portfolio/positions`, `data.day` is the
  authoritative source for qty/avg-price/realized P&L per instrument — already correctly
  weighted across partial fills and multiplier by Kite itself, so `_gtbDiaryImportFromKite()`
  uses it directly rather than re-deriving P&L from raw order fills.
- **`_gtbDiaryGuessSide(tradingsymbol, pos)`** — options are unambiguous from the CE/PE
  trading-symbol suffix; futures/equity direction is a best-effort guess (bought-first vs
  sold-first today).
- Imported rows are tagged `source:'kite'` with `kitePnl` (Kite's own `pnl` field, which
  `_gtbDiaryComputePnl` now prefers over recomputing from entry/exit for these rows).
  Re-importing replaces only previously-Kite-imported rows, leaving manually-added rows
  untouched.
- ASO/BSO compliance (`_gtbDiaryComplianceCheck`) still only resolves for symbols matching
  this app's own instrument names (e.g. `'NIFTY 50'`) — raw Kite trading symbols like
  `NIFTY2571224500CE` won't match `INSTRUMENT_LIST_GLOBAL` and correctly show `n/a` rather
  than a guessed compliance verdict.

## Notes tab — end-of-day trading diary (v26.84)

New tab (`data-tab="notes"`, `#gtb-pane-notes`, rendered by `_gtbRenderNotesPane()`) — a daily
trading diary, keyed per calendar day (`YYYY-MM-DD`) so it accumulates as a running journal
across sessions. Four parts:

1. **Auto Market Summary** (`_gtbDiaryBuildSummary`/`_gtbDiarySummaryHtml`) — today's 9:15 combo
   (NIFTY/SENSEX/BANK/GIFT) resolved through the existing `GTB_STRAT_LOOKUP` map (same
   combo-key logic as `_gtbBuildPrediction`), composite score, `getMarketSignal()` verdict, and
   a per-instrument sub-score breakdown (9:15/Trend/Futures/OI-OBV/MaxPain/IVSkew/Total) for
   NIFTY 50, NIFTY BANK, SENSEX via `computeInstrumentScore()`. Pure read of already-cached
   globals — nothing new fetched.
2. **Trade Journal** (`_gtbDiaryJournalHtml`, stored in `localStorage['GTB_TRADE_JOURNAL_<date>']`)
   — **the app has no broker order/position feed** (`placeOrder()` in utils.js fires orders but
   nothing reads executions back), so trades taken cannot be auto-captured; this is a manual
   entry table (time/instrument/exchange/side/qty/entry/exit/notes, add/delete rows) with P&L
   auto-computed (`_gtbDiaryComputePnl`) and an **ASO/BSO compliance flag**
   (`_gtbDiaryComplianceCheck`) that compares the logged entry price against that instrument's
   actual `getStrikeDetails()` levels from `INSTRUMENT_LIST_GLOBAL`'s cached day-open — flagged
   `n/a` for instruments without a cached open (custom tickers, equities) rather than guessed.
3. **P&L Summary by exchange** (`_gtbDiaryPnlSummaryHtml`) — aggregates the journal's computed
   P&L by the `exchange` field (NFO/BFO/MCX, defaulting via the same routing convention as the
   Master Scanner's `_exch()`), plus total P&L and win/loss count.
4. **Notes / Mistakes / Suggestions** (`_gtbDiaryNotesFormHtml`) — free textarea, autosaved on
   blur to `localStorage['GTB_DIARY_NOTES_<date>']`.

**Export** (`_gtbDiaryBuildMarkdown`) — "Copy Markdown" / "Download .md" produce a
Jekyll-postable file (YAML front matter + the four sections above) named
`<date>-trading-notes.md`, intended for the user's own GitHub Pages repo's `_posts/` folder.
**This script has no GitHub credentials and never will** — committing/pushing is an explicit
manual step the user does themselves; the feature only gets the content to clipboard/disk.

## Level Probability history — max_pain/iv_skew reconstructed too, futures_trend opt-in (v26.83)

Following v26.82's honest caveat ("futures_trend/max_pain/iv_skew have no per-candle history"),
the user pushed back — correctly, on two of the three: **max_pain and iv_skew turned out to
already be reconstructable for free.** Both `_gtbComputeMaxPainGEX` and the `ivSkew` calc in
`oiAnalyzer.js`'s `showOITrendingDetails` only ever read the same ATM±N strike window already
cached in `oiData.tableData` for OI/OBV scoring — the exact per-strike `currDataCE/PE`/`CE_IV`/
`PE_IV` arrays `_gtbStrikeItemAtTime` already time-slices. No new caching needed, just two new
sync functions that read from the already-sliced `tableAtT`:
- **`_gtbMaxPainScoreAtTime(tableAtT)`** — mirrors `_gtbComputeMaxPainGEX`/`_gtbMaxPainScore`'s
  pain-minimization math against the time-sliced OI_CE/OI_PE instead of live OI.
- **`_gtbIVSkewScoreAtTime(tableAtT)`** — mirrors the PE-OTM-IV-minus-CE-OTM-IV calc against
  the time-sliced CE_IV/PE_IV.

Both are now summed into `_gtbLevelProbAtTime`'s composite input `s1` alongside the existing
9:15 + OI score.

**`futures_trend` is genuinely different** — it's the one sub-score with no per-candle cache
anywhere (spot/OI candles are retained on `oiData`; futures candles are fetched fresh and
discarded every time). It **is** reconstructable — Kite's futures historical candles carry OI
same as options (`oi=1`), so `_gtbClassifyFutures` can be re-run at any past 5-min index — but
doing so needs one extra historical fetch per instrument, unlike max_pain/iv_skew which are
free. New **`_gtbFetchFuturesScoreSeries(name)`** (async) fetches the day's futures candles
once and returns `{'HH:MM': score}` for every bucket by re-classifying progressively longer
candle slices against the cached previous-day close. `_gtbBuildLevelProbHistoryToday(includeFutures)`
now takes an opt-in flag: when true, it `Promise.all`s the futures fetch across every instrument
up front, then passes each bucket's futures score into `_gtbLevelProbAtTime(name, t, futScoreAtT)`.
Surfaced as an "incl. futures" checkbox next to the Level Prob tab's "Rebuild from today's
candles" button — off by default (instant, cached-only) since checking it adds ~20 extra
network calls. `_gtbLevelProbAtTime`'s 3rd param defaults to 0 (neutral) when omitted, so the
live single-instrument path (`_gtbLevelProb`, unaffected — it already gets futures_trend for
free via `computeInstrumentScore().total`) needs no changes.

## Level Probability — historical reconstruction, not just forward capture (v26.82)

Corrected v26.81: the codebase already caches per-candle OI/OBV/spot data for the Score
History reconstruction (`_gtbStrikeItemAtTime`, `_gtbPriceChangeAtTime`, `oiData.spotCandles`,
set by `showOITrendingDetails` for every instrument including weighted stocks), so Level
Probability doesn't need to be forward-only.

- **`_gtbLevelProbAtTime(name, hhmm)`** — reconstructs the same live-signal formula
  (`_gtbLevelProb`) at a past 5-min candle time T: time-slices the strike table via
  `_gtbStrikeItemAtTime`, sums `scoreOIStrikeForSignal(...).score`/`.obvFlow` across it for
  the OI-score/OBV-flow inputs, runs `_gtbFindWalls` on the time-sliced table for wall
  pressure, and derives spot-at-T from `_gtbPriceChangeAtTime` vs the day's open. The
  composite-score input at T uses only the **fixed 9:15 score + reconstructed OI score** —
  `futures_trend`/`max_pain`/`iv_skew` have no per-candle history anywhere in this app (same
  gap `renderScoreHistory()` already documents), so they're left out rather than silently
  substituting today's live (wrong-time) values. VIX range isn't time-sliced since it's a
  fixed daily constant (from prevClose).
- **`_gtbBuildLevelProbHistoryToday()`** — rebuilds `GTB_LVLPROB_HISTORY` for the whole
  session so far: time axis = every 5-min bucket present in any instrument's cached
  `spotCandles` today, computed for every instrument × every bucket. Pure arithmetic over
  already-cached arrays (no network calls), triggered on-demand via a **"Rebuild from
  today's candles"** button in the Level Prob tab rather than automatically on every render.
- The forward-only per-refresh snapshot (`_gtbSnapshotLevelProb()`, v26.81) is unchanged and
  still runs — the rebuild button simply replaces its output with the fuller backfilled
  version whenever clicked.

## Level Probability — new "Level Prob" tab, 5-min history (v26.81)

New tab (`data-tab="lvlprob"`) right after Metrics, `#gtb-pane-lvlprob`. Builds a growing
5-minute-interval history of `_gtbLevelProb()` instead of just the current-moment snapshot:

- `_gtbSnapshotLevelProb()` — captures one row per instrument (NIFTY 50, NIFTY BANK, and both
  indices' top-10 weighted constituents) into `GTB_LVLPROB_HISTORY` (localStorage), bucketed
  to the nearest 5-min mark (`HH:MM` rounded down). Stored compactly as `{u, d}` — the
  strongest upside (max of pASO/pAST/pVIXU) and downside (max of pBSO/pBST/pVIXL) reading —
  not all 6 numbers, to keep storage small (~75 buckets/day × ~22 instruments). Capped at 80
  buckets (~1 day + headroom).
- Called at the end of every refresh cycle (`commonShowPopupWindow()`, alongside
  `renderScoreHistory()`) — reuses the existing 5-minute refresh cadence, no separate timer.
  **Does not backfill** earlier-in-the-day values; the history starts accumulating from
  whenever this first runs.
- `_gtbRenderLevelProbPane()` — renders the tab as a matrix: rows = instruments, columns =
  every captured 5-min bucket so far, cell = `▲NN% ▼NN%` (strongest upside/downside at that
  time). Re-rendered live if the tab is open when a refresh completes.

## Level Probability for commodities (v26.80)

`_gtbLevelProb(name)` previously always called `generateTrend(name)`, which throws for MCX
instruments (CRUDEOILM etc. have no `INSTRUMENT_LTP_PRICE`/`INSTRUMENT_LIST_GLOBAL` entry —
those are populated only for NSE via `INSTRUMENT_TOKENS`), so it silently returned "no data" for
crude. Added an `_gtbIsMcxFuture(name)` branch: for MCX, spot/open/strike levels come from
`INSTRUMENT_SCORE_MAP[name].strikeMap`/`.open` (the same source the commodities popup's own
level labels already use, set by `showTopChartMCX`), spot is anchored to the ATM row's own
strike from `oiData.tableData` (falling back to `stock[0]['LTP']`), and the VIX-range input
uses `strikeMap.vixDDUpper/vixDDLower` (already OVX-based for crude) instead of India VIX.
`computeInstrumentScore(name)` already worked for MCX unchanged (its one `generateTrend()` call
is try/catch-guarded).

Wired into the commodities popup (`#show-commodities`): new "LEVEL PROBABILITY (LIVE SIGNALS)"
section (`#cmd-crude-lvlprob`) right after the VERDICT card, populated alongside
`_cmdRenderVerdict('cmd-crude-verdict', ...)`.

## NIFTY/BANK NIFTY divergence panel appearing blank (v26.78)

Reported symptom: the new "NIFTY / BANK NIFTY DIVERGENCE" panel (v26.76) rendered with just its
header and no body content, visually collapsing so it looked like it sat "behind"/merged into
the "INDEX DIVERGENCE" panel below it. `_gdbWidgetNbDiv()` was called inside `_btRenderAll()`'s
own try/catch, so a failure would only log to console (`[Groot Market Terminal] nbdiv render
failed`) and leave the panel permanently blank with no on-screen indication why. Split the
function into `_gdbWidgetNbDiv()` (thin wrapper) + `_gdbWidgetNbDivInner()` (the actual logic),
with the wrapper's own try/catch now writing the error message directly into the panel body on
failure, so it's visible without opening devtools. Also added `min-height:70px` to
`#gdb-body-nbdiv` so an empty/failed render doesn't visually collapse the panel at all. **Next
step if still blank**: the panel will now show the actual JS error inline — read that to find
the real cause.

## Level Probability — ASO/AST/VIXU vs BSO/BST/VIXL (v26.77)

New live-signal-driven likelihood system: `_gtbLevelProb(name)` estimates the probability of
an instrument reaching each strike-derived level **today**, split upside (ASO/AST/VIXU) vs
downside (BSO/BST/VIXL). Per explicit instruction, weighted toward **live signals**, not a
historical backtest base rate:

- **Composite score** (50% weight) — `computeInstrumentScore(name).total / 8`, clamped ±1.
- **Raw OBV flow** (25%) — `oiData.obvFlow`, a fast today-only options-tape read, independent
  of the IV/price fallback used inside the composite score.
- **OI wall pressure** (25%) — `_gtbFindWalls()`'s ranked R1/S1 walls; a strong wall within
  ~2% of spot dampens the side it sits on (e.g. a near resistance wall suppresses upside even
  if other signals are bullish).

These three combine into `netDir` (-1..1), pushed through a sigmoid at increasing thresholds
per level (ASO/BSO need only a mild lean, AST/BST need a stronger one, VIXU/VIXL need the
strongest) — so the outer bands require more conviction to light up. VIXU/VIXL are further
damped by how much of today's expected VIX range (`vixDDRange`) is already used up
(`_gtbLevelProb` computes `roomUp`/`roomDown` from LTP vs today's open) — less room left means
lower odds of a fresh move that direction. Explicitly **not** blended with a historical
base rate (e.g. the 9:15 backtest edge table or `_gtbStrikeProb`'s touch-probability) — these
are reasoned live estimates, not statistically fitted probabilities, surfaced as a
"likelihood" ranking rather than a precise %.

`_gtbLevelProbHtml(name)` renders the six-level bar display. Wired into:
- **Instrument Detail View** — new "LEVEL PROBABILITY" panel (`#<tid>-lvlprob<sfx>`) right
  after the existing "TREND PROBABILITY" panel, in all three template builders
  (`_buildCardStandalone`, `_gtbLoadInstrDetail`, `_gtbLoadInstrDetailPanel`) and populated
  alongside `_cmdTrendProb` in `_dvFetchAndRender`/`_gtbRefreshProbCards`.
- **Metrics tab** — new "LEVEL PROBABILITY (LIVE SIGNALS)" section in
  `_gtbRenderMetricsPane()`, listing NIFTY 50, NIFTY BANK, and both indices' top-10 weighted
  constituents.

New `GTB_INFO` entry: `dv-lvlprob`.

## NIFTY / BANK NIFTY Divergence panel (v26.76)

New Groot Market Terminal panel (`_gdbWidgetNbDiv()` in grootDashboard.js, `#gdb-body-nbdiv`,
wired into `_btRenderAll()`) — distinct from the existing per-index "Index Divergence"
(`_gdbWidgetDivergence()`, index vs its own constituents). This one compares **NIFTY 50 vs
BANK NIFTY directly**: each index's composite score (direction thresholded ±1), classified as:

- **ALIGNED** — both agree, highest conviction.
- **BANK LEADING** / **NIFTY LEADING** — one has conviction, other is flat; the leader
  typically drags the flat one.
- **FIGHTING** — both have conviction but disagree. Per the observed pattern ("bank conviction
  plays off most of the time"), the verdict text explicitly leans toward **Bank Nifty's**
  direction in this case rather than a naive bigger-score-wins call, and flags a pure
  Nifty-only trade as lower conviction until Bank flips or Nifty catches up.

Explicitly framed as a probabilistic lean, not a mechanical rule (a bank-specific event or
IT/pharma-heavy Nifty move can decouple the two) — meant to size/confirm existing trades, not
serve as a standalone signal. New `GTB_INFO` entry: `gdb-nb-div`.

## loadOpenPrice runs the LTP scan again (v26.74)

Reverted v26.68: `loadOpenPrice()` (the "Load Prices" button) once again ends with `await
updateStrorageLtpPrice()`, so `INSTRUMENT_LTP_PRICE` is populated immediately after loading
prices instead of waiting for the next manual/auto refresh. Yes, this means "Load Prices" does
two full ~215-instrument historical passes (its own `'day'`-interval open/prevClose fetch, then
`scanLtpPrice()`'s `'5minute'` fetch) — that's an intentional tradeoff for immediate LTP
availability, not an oversight.

## Index Impact CAUTION threshold bug fix (v26.66)

The disagreement check added in v26.63 required `Math.abs(indexChange) > 0.15` before it would
even consider flagging a sign mismatch — so a genuinely rising NIFTY 50 (ASO, positive
composite score, rising intraday chart) that was only up ~0.05–0.10% vs prevClose could still
show "Driving Down" on the weighted-constituent table with no CAUTION banner, because the real
index move didn't clear the threshold. Lowered to `> 0.02` (just above float/rounding noise) —
this is a direct two-number sign comparison, not a score sum, so the wider dead-zone reasoning
used elsewhere in this codebase (e.g. the OI/OBV score's de-bias thresholds) doesn't apply here.

## Pre-Trade Checklist panel highlighting (v26.65)

`_gtbApplyChecklistHighlights()` (grootTradeBot.js) marks the ~13 panels the user checks
before every trade with a gold outline + star badge (`.gtb-key-check` for block containers,
`.gtb-key-check-inline` for small badges/spans — both in common.css), so they visually stand
out instead of being just another row among many:

1. 9:15 close of the index itself — `#NIFTY-50-915-badge`, `#NIFTY-BANK-915-badge`,
   `#SENSEX-915-badge`, `#GIFT-NIFTY-915-badge`
2-4. 9:15 breakout counts across N50 / Bank Nifty / All F&O components — `.gtb-ov-915-block`
   (Overview)
5. OI Matrix — `#NIFTY-50-oimatrix`, `#NIFTY-BANK-oimatrix`
6. Leading/Lagging score breakdown — `#gtb-score-history-table`
7. Index futures trend — `#gtb-strip-remark-NIFTY-50`, `#gtb-strip-remark-NIFTY-BANK`
8-13. Advance/Decline, spot AND futures, for N50 / Bank Nifty / All F&O —
   `#NIFTY-50-advance-decline-adr(-future)`, `#NIFTY-BANK-advance-decline-adr(-future)`,
   `#all-advance-decline-adr(-future)`

Called at the end of `commonShowPopupWindow()` (after every refresh) — clears old marks first
so a re-render never leaves a stale highlight. Toggleable via Settings → "Highlight checklist
panels" (`GTB_CHECKLIST_HL` in localStorage, default on).

## Index Impact Verdict vs real index sanity-check (v26.63)

Fixed a real framing bug: `NIFTY_50_WEIGHTED_STOCKS`/`NIFTY_BANK_WEIGHTED_STOCKS` are only the
**top 10 constituents by weight** (`constants.js`) — NIFTY 50's top 10 sum to only ~53% of the
index's total weight (Bank Nifty's is ~86%, much more complete). That means it was entirely
possible for this top-10 slice to show "Driving Down" while the real index was going up — the
other ~47% of NIFTY 50 (everything not in this table) can easily outweigh what's shown.

`_buildTable()` (inside `_gtbSigOiWtdColHtml()`) now:
- Computes `coverage` = sum of the group's weight% (shown in the header: "10 stocks, 53% of
  index weight") so it's clear this is a subset, not the whole index.
- Computes `netImpact` = signed sum of all shown stocks' Index Impact, and compares its sign
  against the actual live index change (`generateTrend('NIFTY 50'|'NIFTY BANK').change`).
- If they **disagree** (index moved >0.15% one way, this subset nets the other way past a
  small threshold), the normal green/amber VERDICT banner is replaced with an amber
  **CAUTION** banner: names the net direction of the shown subset, states the real index
  change, and explicitly says the move is coming from outside this top-N slice — instead of
  silently implying these stocks are "driving" the index in the wrong direction.
- `GTB_INFO['sig-oi-verdict']` updated to document this caveat.

## Index Impact Verdict (v26.62)

Added the direct answer to "is this stock actually driving the index?" to
`_gtbSigOiWtdColHtml()`'s weighted-constituent tables:

- **Verdict column** — per stock, tiered as `Driving Up`/`Driving Down` (green/red),
  `Contributing` (amber), or `Negligible` (grey), with a tooltip explaining the tier.
- **Verdict banner** above each group's table — a one-line sentence naming the actual driver
  stock(s) and their combined share of the net move (e.g. "HDFCBANK, BHARTIARTL are actually
  driving this index (~66% of the net move); the rest are mostly along for the ride.").

**Tiering is always impact-ranked, independent of the active Sort: Impact / Sort: Weight
toggle** — sort the table by weight for readability, the Verdict tier doesn't change. Tiers:
rank all constituents by `|Index Impact|` descending, walk cumulative share —
first ~50% cumulative = `driver`, next ~30% (up to 80%) = `contributor`, remaining ~20% =
`negligible`. Direction (Up/Down) comes from the sign of that stock's own impact. Computed in
a `rows.slice().sort(...)` pass (same underlying row objects, so `row.verdictTier` set there
is visible when the main render loop iterates `rows` in whichever display order is active).
New `GTB_INFO` entry: `sig-oi-verdict`.

## OI/OBV scoring: ITM discount (v26.61)

`scoreOIStrikeForSignal(item, isATM, priceChange, spot)` now takes an optional `spot` param.
When supplied, it computes `ceITM`/`peITM` (via `_gtbIsITM`) and halves `ceW`/`peW`
respectively — the same half-weight discount already used for UNWIND and IV/OBV
disagreement — before summing into `score`. This closes a real gap: every OTHER part of the
app already treated ITM option flow as lower-conviction (dimmed bars, excluded from wall
candidacy — see the ITM/OTM sections above), but the actual **numeric score** never reflected
it. An ITM CE WRITE below a rising spot (existing short calls just sitting there, not fresh
resistance-building) counted exactly as bearish as a genuine OTM CE WRITE above spot — which
could drag the composite score sharply negative even while price was clearly rising, because
strikes below spot are very often ITM-on-the-call-side and their negative contribution was
never discounted.

Threaded `spot` (anchored to the ATM row's own strike, the established convention) into every
score-aggregating call site: `computeOIScoreFromData()`, `updateScoresOfOI()` (and its caller
in `showOIOBVBarChart`, which now computes `spotRow` up-front instead of only after its main
loop), `_svRenderOIMatrix()`, `_oiScoreAtTime()` (historical replay), `renderOIOBVMaximized()`,
`_gtbOITableHtml()`, `_gtbOICell()`/`_gtbOICellCompact()` (both call sites: OI Compare Matrix
and the Signals-tab ATM±2 grid, plus the two Signals-tab weighted/plain OI column tables),
`_cmdRenderOI()` (crude chart), and `showComponentOITable()`'s `strikeSignalMap`. Two call
sites inside `_cmdBuildVerdict()`/`_gtbFindWalls()` also now pass `spot` for consistency, though
those only use `ceLabel`/`peLabel` (unaffected by the discount), not `score`, so no behavior
change there — just future-proofing. Without `spot`, the function falls back to no discount
(`ceITM`/`peITM` both `false`), so any remaining caller that doesn't pass it behaves exactly as
before.

## Index Impact / weighted-constituent ranking (v26.60)

`_gtbSigOiWtdColHtml()` (Signals tab, "Weighted Constituents OI" table) previously only showed
each constituent's own OI Score and PCR — no way to tell which stocks are actually **driving**
the index vs which just happen to have a score. Added:

- **Index Impact** column = `weight% × price change% ÷ 100` — approximate index-points
  contribution. A high-weight stock with a modest move can dominate the index while a
  low-weight stock with a big move or strong OI score barely matters; Impact (not OI score,
  not price change alone) answers "who is really driving this."
- **Wt%** and **Chg%** columns (the two inputs to Impact) shown alongside it for context.
- **Cum%** column — running cumulative share of total `|Impact|` in the current sort order,
  so you can see at a glance how concentrated the move is (e.g. top 2 stocks = 80% of the
  index's move, the rest are noise).
- **Sort: Impact / Sort: Weight** toggle buttons per group (`.gtb-wtd-sort-btn`, delegated
  click handler, `_GTB_WTD_SORT_MODE` module var) — Impact sorts by `|impact|` descending
  (default); Weight reverts to raw index-weight descending (closer to the original
  constituent-order view).
- New `GTB_INFO` entries: `sig-oi-weight`, `sig-oi-chg`, `sig-oi-impact`, `sig-oi-cumimpact`.

## Wide OI table wrong-strike bug fix (v26.59)

`showComponentOITable(name, suffix)` — the wide per-strike table used in individual-stock
popups (`commonShowInidividuslStockPopupWindow`) and appended at the end of
`showOIOBVBarChart()` — ignored its own `name` parameter and read the strikes from the
**shared global `stock[0]['DATA']['tableData']`** instead of the per-instrument cache.
`stock[0]` gets overwritten by whichever instrument's OI fetch ran most recently *anywhere* in
the app (it's set synchronously in `showPrictionProbabilty()`, immediately before
`showOIOBVBarChart()` reads it — safe only within that single synchronous call pair). By the
time a maximize/detail popup is opened later for a *different* instrument, `stock[0]` can
easily belong to someone else entirely — e.g. a low-priced stock's ~95-96 strikes rendering on
an HDFCBANK popup (HDFCBANK's real strikes run ~620-700+). Fixed to read
`INSTRUMENT_SCORE_MAP[name].oiData.tableData` (the correctly per-instrument-scoped cache every
other OI/OBV view already uses), falling back to `stock[0]` only if that's unavailable. Also
fixed in the same function: `priceChange` was reading `oiData.priceChange`, a field that is
**never actually set anywhere** in the codebase (always 0) — replaced with the instrument's
real live `generateTrend(name).change`, matching every other (already-fixed) OI/OBV renderer.

**Wall-ranking tooltip (v26.59):** added a `title` tooltip to every "R1/S1 = primary" legend
(maximize view, `_gtbOITableHtml`, OI Compare Matrix, crude chart legend, `showComponentOITable`,
compact row signal legend) clarifying that `_gtbFindWalls` ranks candidates by **OTM call/put-
writing OBV volume** at that strike, not the strike's combined CE+PE score — so a strike can
show the most negative/positive total score and still not be tagged R1/S1 if its own OBV
pressure is smaller than another OTM WRITE strike's.

## Snapshot end time audit fixes (v26.58)

Following the `scanLtpPrice()` snapshot-time fix, audited every `getHistoricalDataUsingPromise`
call site for the same class of bug (request bounded by `_gtbCurrDayTo()`/`_gtbMcxCurrDayTo()`
but the result never trimmed, or a `'day'`-interval fetch used for "today" which can't be
truncated at all). Fixes applied:

- **Liquidity/SL-Hunt Scanner** (`#lq-scan-btn` handler, grootTradeBot.js) and **Master
  Scanner** `_uniAnalyze`'s SL-Hunt leg — both now run their 1-minute spot candles through
  `_gtbTrimCandles(candles, curDay)` before sweep detection.
- **Master Scanner** `_uniAnalyze`'s Volume Profile leg and the **standalone Volume Profile
  tool** (`#vp-build-btn`) — both fetch a multi-day (up to ~14 day) lookback, so
  `_gtbTrimCandles` can't be used directly (`_gtbStripPrevDayCandles` inside it drops
  everything before `refDay`, which would wipe the whole lookback). Added
  **`_gtbTrimCandlesTail(candles, refDay)`** (next to `_gtbTrimCandles`,
  grootTradeBot.js): only trims candles that fall ON `refDay` and after the snapshot end time —
  earlier days are left completely untouched.
- **`showFutureDetailsMCX`** (commodities.js) — previously fetched BOTH a `'day'`-interval
  candle (`cres`, for "today") and a `'5minute'` intraday series (`ires`), and only the
  `'5minute'` one was even request-bounded by `_gtbCurrDayTo()`; the `'day'` fetch had the
  exact same un-fixable issue `scanLtpPrice()` had (a day-candle always reflects the true live
  state). Rewritten to derive "today so far" entirely from the trimmed `ires` series — close =
  last trimmed candle's close, high/low = running max/min across trimmed candles, volume =
  summed across trimmed candles, open = first trimmed candle's open — packed into the same
  one-item `data` array shape the old `'day'`-candle result had, so `data[0]`/
  `data[data.length-1]` usage downstream (open/ltp/vwap/trend) is unchanged in meaning, just
  now snapshot-aware. This also removes the redundant `'day'` fetch entirely (one less
  historical call per MCX detail refresh).

## Refresh-in-progress guard (script.js, v26.57+)

`_GTB_REFRESH_IN_PROGRESS` in `autoRefreshEachTabs()` is the single source of truth for
"a refresh cycle is currently running" — covering both the LTP scan and, for manual/auto
triggers, the full `commonShowPopupWindow()` dashboard render, not just `scanLtpPrice()`'s own
narrower `_LTP_SCAN_IN_PROGRESS` guard. It drives `#start-auto-refresh`'s `disabled` attribute
for the whole cycle and prevents overlap between the manual "Start Refresh" button and the
5-minute auto-refresh timer (`startTimer()` → `autoRefreshEachTabs(null, true)`) — previously
the button was only disabled/enabled around the LTP-scan phase (and only when a jQuery
`instance` was passed, which the timer-triggered path never did), so a click during an
in-flight auto-refresh could kick off a second overlapping `commonShowPopupWindow()`. Now,
if a trigger fires while the flag is already true, it's skipped with a console log (the
recurring `startRefresh()` timer restart still happens either way, so the 5-minute cadence
isn't broken). `updateStrorageLtpPrice()`'s `instance` param no longer toggles anything — it's
kept only for call-site compatibility.

## LTP loading (script.js, v26.56+)

**Snapshot end time (v26.56):** `scanLtpPrice()` now fetches a `'5minute'` intraday series
(`CURRENT_DAY → _gtbCurrDayTo()`) instead of the `'day'` interval, specifically so it respects
the app-wide "snapshot end time" picker (`#gtb-hist-time` / `_gtbHistTime()`) that every other
historical fetch in the app honors. Kite's `'day'`-interval candle always reflects the true
live intraday state and cannot be truncated to an earlier time-of-day, so the previous
`'day'`-based approach silently ignored the snapshot picker — LTP would show the actual current
price even while the rest of the dashboard was showing an earlier snapshot. The fetched candles
are passed through `_gtbTrimCandles()` (same trim used everywhere else), and LTP = close of the
last candle at-or-before the snapshot time. The forming (still-open) candle is deliberately kept
here, unlike OBV/IV calcs which drop it — for LTP we want the freshest available price up to the
snapshot boundary, not a stability guarantee. `loadOpenPrice()` still uses the `'day'` interval
(unaffected) since open/prevClose don't change intraday and don't need time-slicing.

## LTP loading (script.js, v26.54+)

**Cadence (v26.54):** `scanLtpPrice()` has no standalone poll anymore. Previously
`autoStartScanLtp()`'s per-second `setInterval` also fired `updateStrorageLtpPrice()` on its
own at `s==59` every minute, independent of the actual refresh cycle — meaning LTP could
double-fetch (once from that silent 60s poll, once from whatever refresh landed on the same
minute). `autoStartScanLtp()` now only drives the `#refresh-timer-one` clock display. LTP
refreshes **only** as part of an actual refresh: the manual "Start Refresh" button
(`commonRefresh` → `autoRefreshEachTabs` → `updateStrorageLtpPrice`), or the 5-minute
auto-refresh in `startTimer()`, which now calls `autoRefreshEachTabs(null, true)` instead of
`commonShowPopupWindow()` directly — so that cycle refreshes LTP first, then the full
dashboard, through the same single path the manual button uses, rather than rendering the
dashboard off whatever LTP happened to already be cached.

`scanLtpPrice()` no longer scrapes the Kite sidebar watchlist DOM, and doesn't make a separate
API call for LTP either — it **reuses the same `'day'`-interval historical fetch as
`loadOpenPrice()`** (`getHistoricalDataUsingPromise(token, PREVIOUS_DAY, CURRENT_DAY, 'day')`,
enctoken session auth, keyed by `instrument_token` from `INSTRUMENT_TOKENS`). Today's day-candle
is still open intraday, so its **close is the live LTP**. It only writes
`INSTRUMENT_LTP_PRICE` (`{ name, ltp }`) — it does **not** touch `INSTRUMENT_LIST_GLOBAL`, even
though the same fetch happens to carry today's open + yesterday's close too, because that value
is a one-time-per-day fact (open/prevClose don't change intraday) and shouldn't be rewritten
every ~60s cycle. `INSTRUMENT_LIST_GLOBAL` (`{ name, price(open), prevPrice, perc }`) is only
ever written by `loadOpenPrice()` (the manual "Load Price" button), which does the same historical
fetch once. Requests for all ~215 instruments fire in parallel but are funnelled through the
existing rate-limited queue (`_gtbHistPump`, ≤5 concurrent, ~10/sec) shared with every other
historical fetch in the app. A module-level `_LTP_SCAN_IN_PROGRESS` flag guards against
overlapping runs, since a full scan can take longer than the 60s tick that triggers it. On
failure (no candles for any instrument — market closed, or enctoken session expired) it skips
the cycle and shows a toast — **no fallback to DOM scraping**, by design. The old sidebar
strike-badge injection (ASO/AST/BSO/BST/VIXU/VIXL divs appended to `.item-info-wrapper`) was
dropped along with the scrape — that info is already shown in Groot Bot's own dashboard rows.
`updateStatusBar` (DOM version) was replaced by `updateStatusBarFromApi(ltpObj)`, which renders
the INDIA VIX/NIFTY 50/NIFTY BANK/SENSEX status bar from the fetched LTP +
`INSTRUMENT_LIST_GLOBAL` prevClose, with no DOM reads. `loadOpenPrice()` also has **no DOM
scraping at all** now — `loadPreMarketOpenPrice()`/`scanPreMarketpPrice()` (the pre-market
sidebar scrape, used before 09:15) were removed. Before 09:15, today's day-candle doesn't exist
yet (`candles.length < 2`), so those instruments are simply skipped that run — there is no
pre-market open-price source anymore; they populate on the first "Load Price" click or refresh
after 09:15.

## Tampermonkey caching gotcha (important)

`autotrade.user.js` loads every app file via `@require`/`@resource` from `http://localhost:3000`. **Tampermonkey caches these** — editing `static/autoTrade/*` shows "no effect" on reload even though the node server serves the new file. When the user reports "nothing changed", confirm the server serves it (`curl -s http://localhost:3000/autoTrade/common.css | grep <marker>`), then it's the TM cache. Workflow used here: **bump `@version`** in `autotrade.user.js` on every change so TM re-pulls (currently ~24.27), or set TM Externals "Update interval" to Always. The node `server.js` has dropped a few times mid-session; if `curl` returns HTTP 000, restart `node server.js`.

- `node_modules/` — only direct dependency is `express`.

When extending this server (adding routes, views, etc.), `server.js` is the natural entry point — there's no router/controller structure to preserve since none exists yet.

---

## React Widget System (groot-platform/)

The new widget-based React UI lives at `groot-platform/groot-ui` (Vite + React + TypeScript). The Spring Boot backend is at `groot-platform/groot-server`. The Tampermonkey code above is the **reference implementation** — when building widgets, always check the TM source first to get the exact formula and data flow.

### Architecture

- `groot-ui/src/widgets/widgetStore.ts` — Zustand persisted store for widget layout (localStorage `groot-widget-layout-v1`). `WidgetType` union must be updated for every new widget.
- `groot-ui/src/widgets/Widget.tsx` — generic draggable/resizable shell (@dnd-kit + custom resize handle)
- `groot-ui/src/widgets/WidgetCanvas.tsx` — renders all widgets on a dot-grid canvas
- `groot-ui/src/trading/TickerProvider.tsx` — single WebSocket connection to Kite ticker; all widgets call `useTicker()` for live prices
- `groot-ui/src/trading/strikeCalc.ts` — strike level math (see formula below)
- `groot-ui/src/trading/api.ts` — all backend API calls (`fetchLtp`, `fetchDay915Candles`, etc.)

### Strike Level Formula (CRITICAL — do NOT use VIX-based formula)

Mirrors `getStrikeDetails()` in `utils.js`. Computed from the **9:15 candle's OPEN** price (not prevClose, not LTP):

```
NSE_STRIKE_DIFF[name] = "strikeOne,strikeTwo"  (absolute points)
ASO = candleOpen + strikeOne
AST = candleOpen + strikeOne + strikeTwo
BSO = candleOpen - strikeOne
BST = candleOpen - strikeOne - strikeTwo
```

Zone classification (mirrors TM scanNineFifteenCandle):
- `candleClose > AST` → AST
- `candleClose > ASO` → ASO
- `candleClose < BST` → BST
- `candleClose < BSO` → BSO
- else → B/W

### 9:15 Breakout Scanner Widget

`groot-ui/src/widgets/breakout915/Breakout915Widget.tsx`

The widget **requires a historical API call** — the 9:15 candle OPEN and CLOSE are NOT available from the live WebSocket ticker. The flow:

1. User clicks **SCAN** (after 9:20 AM when the first candle is complete)
2. Widget calls `GET /api/candles/day915?tokens=...&date=YYYY-MM-DD`
3. Spring Boot (`Candle915Controller.java`) calls `kite.getHistoricalData(from=9:00, to=9:25, interval=5minute)` for each token, returns `{ candles: [{token, open, high, low, close, volume}] }`
4. Widget computes `getStrikeLevels(name, candle.open)` → `classifyZone(candle.close, levels)`
5. Results cached in localStorage as `GROOT_915_YYYY-MM-DD` (same concept as TM's `VALID_BREAKOUT_NINE_FIFTEEN`)
6. On next page load, cached results are restored automatically — no re-scan needed

Displays 3 universe cards: NIFTY 50 Components (10 stocks), BANK NIFTY Components (10 stocks), All F&O Stocks (~200). Each card shows bull/bear/neutral count + ratio bar + bias label (STRONG BULL / BULL / NEUTRAL / BEAR / STRONG BEAR). Expandable per-stock breakdown sorted AST→BST.

### Adding a New Widget

1. Add type to `WidgetType` union in `widgetStore.ts`
2. Set default size in `addWidget` switch in `widgetStore.ts`
3. Create `src/widgets/<name>/<Name>Widget.tsx`
4. Import + render in `WidgetCanvas.tsx`
5. Add to dropdown in `App.tsx` `WIDGET_TYPES` array
6. If backend data needed: add controller in `groot-server`, add fetch fn in `api.ts`
