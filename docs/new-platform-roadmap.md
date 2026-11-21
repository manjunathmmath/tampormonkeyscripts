# New platform roadmap: backend + one frontend (laptop, phone, tablet)

Status: plan, nothing built yet. Written 2026-11-21.
Ground rule: **the trading logic does not change.** The new project is a re-homing of what the Tampermonkey app computes today, verified number for number against it.

---

## 1. Goals and rules

1. Move off Kite's internal `/oms` + `enctoken` calls to the official Kite Connect API (REST quotes/history + WebSocket ticker).
2. Backend and frontend are separate. One backend, one responsive frontend for laptop, phone and tablet (PWA first, Capacitor Android shell later, iOS client of the same web app).
3. **Logic freeze.** Every verdict, score, level, gate, plan, screener rule and threshold is ported as is. Bug fixes and new ideas are not mixed into the port; they go on a list and are done after parity.
4. **Parity gate.** A module is "ported" only when it reproduces the userscript's output on recorded data within an agreed tolerance (section 5).
5. Read-only. No order placement anywhere.
6. The userscript keeps running untouched until the new app has matched it for several weeks (shadow mode).

### Reuse scope (decided 2026-11-21)
Only the **trading logic** (sections 3 A-D and the rules in CLAUDE.md) is carried over, unchanged. Everything else is written from scratch: the backend, data layer, API, recorder/replay, the whole frontend (no jQuery, no userscript popups, no copy of the chart overlay code), settings and storage. The userscript stays as the reference and as the source of the parity test data; nothing in the new project imports from it.

---

## 2. Target architecture

```
                  +---------------- Backend (Node 20 + TypeScript) ----------------+
 Kite Connect --> | kite/      gateway: REST client, rate limiter, cache, ticker    |
 (REST + WS)      | instruments/  daily dump -> lookup tables                        |
                  | marketdata/   ticks -> 5-min candles(+OI), option chains, history |
 Other sources -> | sources/   Yahoo, NSE holidays, niftyindices weights, CBOE, RSS   |
                  | engine/    the ported logic, pure functions (no I/O, no DOM)      |
                  | jobs/      9:15 scan, 5-min refresh, token check, alerts           |
                  | store/     SQLite + candle files                                  |
                  | api/       REST + live push (WebSocket/SSE), one login secret      |
                  | recorder/  snapshots + replay (today's recorder.js, native)       |
                  +------------------------------+----------------------------------+
                                                 |
                      +--------------------------+---------------------------+
                      |                          |                           |
               Web app (React, PWA)     Capacitor Android shell      iPhone/iPad (browser/PWA)
               laptop + phone layout    (optionally runs backend)
```

Backend rules for portability (so it can also run in Termux / on a small box):
- Node 20+, no native add-ons; built-in or pure-JS SQLite; all paths, ports, secrets from one config / env.
- Candles on disk, only watched names in memory.
- Clients never call Kite; they only call the API.

Folder layout (inside the repo, separate from `static/autoTrade`):
```
backend/   src/{config,auth,kite,instruments,marketdata,sources,engine,jobs,alerts,store,api,recorder}  tests/
frontend/  src/{api,state,design,layout,screens,charts}  public/ (manifest, icons)
shell/     capacitor/ (Android, later iOS)
docs/      roadmap, API reference, parity reports
```

---

## 3. Logic inventory (what has to be ported, unchanged)

Grouped by dependency order. File names are the userscript files they come from.

A. **Foundations the logic reads**
- Strike math and levels: `getStrikeDetails`, `NSE_STRIKE_DIFF`, 9:15 zone rule (at-or-beyond), VIXU/VIXL formula (prev close x (1 +/- prevVIX/100/sqrt(246))), `generateTrend`, day open/prev close handling, snapshot-time trimming (`_gtbTrimCandles`).
- Instruments and expiry: `dataLoad.js` resolvers (`_dlResolveExpiryFor`, `_dlConfiguredExpiryForName`, MCX per-commodity expiry), lot sizes, futures token lookup, index lists and live weights (`indexWeights.js`).
- Time and calendar: market hours, NSE holidays, expiry-day detection, days to expiry.

B. **Signal engines**
- OI/OBV: `scoreOIStrikeForSignal`, `computeOIScoreFromData`, OI extras, walls (`_gtbFindWalls`, erosion), max pain/GEX, IV skew, OI CHG + OBV agreement, market profile (`_gtbMarketProfile`).
- Futures: `computeFuturesSignals`, `_gtbRemarkFromSignals`, classifier, remark accuracy, squeeze setup/scan/study.
- Scores: `computeInstrumentScore`, component scores, A/D, 9:15 scores, composite, `getMarketSignal`, gauge/Range Scoreboard, 9:15 combo table `GTB_STRAT_LOOKUP`.

C. **Decision layer**
- Master Consensus (groups, weights, thin/low-sample, dead-zone conflict), dead zone (raw, latch, rearm), Live Context (`liveContext.js`), Level Probability, Level Confirmation, Level Decision, Final Verdict (+ counter-plan, expiry context), wall verdict `_cmdBuildVerdict`, Probable trade (`_gtbOutlook`, sanity pass, hold rule), Strong S/R (`_gtbSrLevels`), Focus gates (index, stock, MCX; shared row builders), Entry timing and Signal agreement (`optionStrikeSearch.js`), Fuel left.

D. **Screeners and studies**
- Positional (swing) screener incl. Trend Template, Stage, momentum, conviction, timing, bounce odds; Long-term screener incl. backtests; option strike search + scan; tracking (alerts near walls); OBV breakout test; research lab studies.

E. **Context sources**
- Macro drivers (Yahoo), CBOE vol indices (OVX/GVZ/VXSLV/VIX, endpoint now blocked: manual or alternative source), news RSS, economic calendar, learn feeds, Telegram.

F. **Recording**
- Snapshot schema 2, replay, expired-weeklies handling (Dhan files), candle cache.

G. **UI-only (not logic, rebuilt in the frontend)**
- Chart View, Trade Shorts, dashboard cards, heatmap, News panel, Learn, popups, settings dialog.

---

## 4. How the logic is ported without changing it

1. **Extract, do not rewrite.** Copy each function into `engine/` keeping its name, arguments, branches and constants. Convert to TypeScript with types added, bodies unchanged.
2. **Cut the browser out with a context object, not with edits to the rules.** Functions read globals (`INSTRUMENT_SCORE_MAP`, `INSTRUMENT_LTP_PRICE`, `localStorage`, `CURRENT_DAY`, `_gtbHistTime()`, Settings constants). Each becomes a field of an injected `EngineContext` (state, clock, settings, data accessors). A thin adapter provides the same values the userscript had.
3. **I/O moves out.** Any `getHistoricalDataUsingPromise`, `_ossScanLoad`, `GM_xmlhttpRequest` inside logic becomes a call to the backend data layer, which returns the same shapes (`[time,o,h,l,c,v,oi]`).
4. **Constants stay constants** (thresholds like 0.35%, 0.15%, `_GTB_FV_*`, `_GTB_OL_*`, 4-minute hold) copied verbatim into one `engine/constants.ts` with a comment pointing at the source line.
5. **Order:** port bottom-up (A, B, C, D), so every module can be tested against recorded outputs of the modules below it.
6. **Change log:** anything found wrong during the port is logged in `docs/port-findings.md`, not fixed, until parity is signed off.

---

## 5. Parity testing (what proves "no change in logic")

We already have the golden data:
- `data/snapshots/<day>_<NSE|MCX>.jsonl`: every metric per 5-minute slot (scores, remarks, consensus groups, walls, zones, verdicts, plans, gates, option chains) for the replayed days.
- `data/candles/<day>/...`: the exact candles those slots were computed from.

Tests:
1. **Replay parity:** feed the stored candles + chain into the new engine slot by slot (with the same snapshot time and no look-ahead) and compare every field with the stored snapshot. Tolerances: exact for labels and booleans, 1e-6 relative for numbers, listed exceptions for fields that depended on live state (see 5a).
2. **Differential run:** run the userscript (headless browser with a stub Kite) and the new engine on the same candles and diff the outputs, for days we have no snapshot.
3. **Per-function unit tests** for pure helpers (strike levels, VIX band, zone classification, wall ranking, max pain).
4. **Shadow mode:** for weeks, the new backend runs live next to the userscript; a daily report lists every differing value (see Phase 7).

5a. Known sources of legitimate difference to list up front: live-feed vs REST candle timing, forming-candle handling, stateful values (OI velocity, wall erosion, plan hold, dead-zone latch) which need the same update cadence to match, order flow / depth fields that do not exist in a replay, index weights of the replayed day.

---

## 6. Phases, deliverables and exit criteria

### Phase 0: foundations (weeks 1-2)
- Repo layout, config, logging, SQLite store, one login secret, `GET /health`.
- Kite auth: daily token flow (manual OAuth, token saved, clear "expired" state; no login automation).
- Kite gateway: REST client with queue (history ~3/s, quote 1/s), cache, retries, error mapping; WebSocket ticker with reconnect and dynamic subscribe.
- Instruments: daily dump, lookups (token, futures, options by expiry, lot, strike step, F&O universe).
- Exit: phone/laptop can hit `/health`, see live LTP for NIFTY 50, and fetch 5-minute candles with OI.

### Phase 1: data layer parity (weeks 2-4)
- Candle builder from ticks (volume growth, OI), candle store, history service that returns the userscript's shapes, snapshot-time trimming, previous-day/day-open logic.
- Option chain builder (strike window around price, CE/PE OI, OI change vs previous day, OBV, IV as the app computes it) and futures series.
- Expiry resolver and calendar (holidays source with saved fallback), index weights (niftyindices), 9:15 scan job.
- External sources: Yahoo (macro, crude/USDINR), vol indices (CBOE blocked: manual entry + alternative), news/calendar RSS.
- Exit: for 5 recorded days the data layer reproduces the stored chains and candles (differences listed).

### Phase 2: engine port (weeks 4-14, the long part)
In this order, each module closed by its parity test:
1. Levels and trend (A). 2. OI/OBV scoring, walls, max pain, skew, extras (B). 3. Futures remark + score + classifier. 4. Instrument score, composite, market signal, A/D, 9:15 combos (B). 5. Consensus, dead zone, Live Context, Level Probability (C). 6. Wall verdict, Level Confirmation/Decision, Final Verdict (C). 7. Strong S/R, Probable trade with hold rule, Focus gates (index/stock/MCX) (C). 8. Strike search, Signal agreement, Entry timing, Fuel left, scan (C/D). 9. Squeeze scan/study and Pre-Squeeze watch (B/D). 10. Positional + Long-term + bounce odds (D). 11. Macro, news, tracking alerts (E).
- Exit per module: replay parity passes on all recorded days.

### Phase 3: API (parallel with Phase 2 from week 6)
- REST: `/instruments/:name/chart`, `/gates`, `/plan`, `/levels`; `/board/915`; `/ideas`, `/ideas/:name`; `/pins`; `/screeners/*`; `/macro`, `/news`, `/calendar`; `/refresh/:name`; `/settings`; `/alerts`.
- Live push channel: ticks, "recomputed" events.
- Contract written as OpenAPI + TypeScript types shared with the frontend.
- Exit: API docs, auth, rate limits, contract tests.

### Phase 4: frontend foundation (weeks 6-9, parallel)
- React + TypeScript + Vite, design tokens (the `--gtb-*` palette, dark/light), responsive shell (bottom tabs on phone, sidebar on laptop), API client, live state, error and "token expired / feed down" banners (the userscript's notices).
- PWA basics: manifest, service worker, last-data offline view.

### Phase 5: screens (weeks 9-20), phone-first, each with laptop layout
1. **Chart View** (single chart + swipe on phone, 1/2/4/6 grid on laptop; layers, overlay canvas, drawers, 9:15 rail, inspector, verdict chip, pins, keyboard shortcuts).
2. **Trade Shorts** and the 9:15 board.
3. **Focus gates** and Probable trade / Strong S/R cards.
4. Dashboard overview (score, Final Verdict, Level Confirmation, Predict, strength, drivers).
5. Strike search + scan, Signal agreement.
6. Positional and Long-term screeners (card view on phone), Tracking.
7. Heatmap, News + calendar, Learn, Macro, Notes/diary view, Settings.
8. Data Recorder / replay viewer.
- Exit per screen: matches the userscript's numbers and wording; checked at phone and laptop widths.

### Phase 6: devices (weeks 18-24)
- Install as PWA (Android Chrome/Edge, iOS Safari, laptop).
- Capacitor Android shell (native notifications; optional embedded backend via nodejs-mobile), your existing Android app reused if it is a WebView shell.
- Termux run guide for the backend on Android; iOS stays a client.
- Telegram alerts moved to the backend so they work with no screen open.

### Phase 7: shadow run and cutover (weeks 22-30)
- Backend runs live beside the userscript; daily diff report (every verdict/plan/gate difference with cause).
- Cutover when N consecutive sessions match within tolerance and every difference is explained (suggest N = 15 sessions).
- Userscript then frozen (kept as reference), not deleted.

Rough total: 6-8 months part-time, working with Claude module by module. The engine port (Phase 2) and the screens (Phase 5) are about two thirds of it.

---

## 7. What changes because of leaving `/oms` (not the logic)

| Today (`/oms`, enctoken) | New |
|---|---|
| Funds / margins, positions, orders (`_gtbFetchFundsMargins`, diary import) | Kite Connect margins / positions / orders endpoints (read-only) |
| History through the web path | Kite Connect historical (needs the paid history plan) |
| LTP scan (~215 history calls) | Quote endpoint + ticker (cheaper, faster) |
| Baskets (Add to Basket) | Dropped (no public API); a "copy order list" instead |
| Holiday list (NSE site, often blocked) | Source with saved fallback and a built-in yearly list |
| Daily login by browser cookie | Daily Kite Connect token (manual OAuth) |

---

## 8. Risks and mitigations

- **Port drift** (a quiet behaviour change): parity gate + frozen logic + findings log.
- **Stateful logic** (OI velocity, wall erosion, plan hold, dead-zone latch, Live Context history): needs the same refresh cadence and persistent state in the store; tested with replay.
- **Subscription limits:** 3,000 instruments per ticker connection, history rate; chains loaded on demand or in a scheduled sweep, not all at once.
- **Daily token:** one manual step each morning; backend shows a clear banner.
- **Backend uptime** during market hours (laptop sleep, phone battery): host on an always-on machine or a small cloud box; Termux only as backup.
- **Data licence:** personal use only, no redistribution of market data.
- **Rewrite fatigue:** every phase ends with something usable.

---

## 9. Decisions needed before Phase 0

1. Kite Connect plan: confirm the paid tier with historical data and live quotes.
2. Where the backend runs (laptop, always-on PC, cloud box).
3. Frontend folder: new `frontend/` (recommended) or inside `groot-platform`.
4. Android app from the earlier session: stack (WebView / Kotlin / Flutter) and whether to reuse it as the shell.
5. Hosting access from the phone (home network, Tailscale or a tunnel).
6. Keep the Dhan expired-weeklies tool for replays, or stop at Kite data.

---

## 10. The first two weeks, concretely

Week 1: repo scaffold; config + logging; SQLite store; app login; Kite token flow; instruments loader; `/health`.
Week 2: gateway queue + cache; ticker with reconnect; 5-minute candle builder with OI; history endpoint returning the userscript's candle shape; a test that rebuilds one recorded day's candles and compares them with `data/candles`.
