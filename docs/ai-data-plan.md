# AI data plan: record every refresh now, model later

Status: PLAN (nothing built yet). Decisions made by the user on 2026-11-05: local node server plus files; include the top weighted stocks; record the MCX evening session from day one.

## 1. Goal

Save every refresh of the dashboard (raw inputs, derived features, the app's own outputs) in a form a model can be trained on later, and compute labels (what happened next) offline. Recording starts first because it is irreversible: expired option chains cannot be re-fetched from Kite, and a day not recorded is lost.

## 2. How it works

```
refresh cycle (every 5 min, 4 s after the candle closes)         MCX scheduler (09:00 - 23:55, same cadence)
        |                                                                  |
        +------------------ dataRecorder.js: capture() --------------------+
                      reads caches only (no new fetches), builds one snapshot
                                          |
                          IndexedDB outbox (survives a closed tab / server down)
                                          |
                POST http://localhost:3000/api/snapshot   (GM_xmlhttpRequest, @connect localhost)
                                          |
              server.js: validate, dedupe by (day, slot, source), append one line to
              data/snapshots/YYYY-MM-DD.jsonl, reply OK -> outbox deletes the entry
                                          |
   end of day: EOD package (5-minute candles of the core set, final chains, outcomes) -> data/eod/YYYY-MM-DD.json
   nightly: gzip the day's files, write data/manifest.json (rows, gaps, schema version)
                                          |
        offline Python: dataset builder -> labels -> walk-forward validation -> models -> report
```

Rules: live data only (replays and snapshot-time sessions are never recorded); no tokens, funds, positions or journal; every snapshot carries the as-of time (IST), the app version, a schema version and the age of each input (stale flags); the recorder never blocks or slows a refresh (capture is a few milliseconds, sending is asynchronous).

## 3. What is saved

Tier A, the core set (full detail): NIFTY 50, NIFTY BANK, SENSEX, CRUDEOILM, GOLDM, SILVERM, USDINR (price only).
Tier B, the top weighted stocks of NIFTY 50 and NIFTY BANK (about 20 names, compact): the same signals, a smaller option chain.
Tier C, market-wide: breadth over all F&O stocks (9:15 zone counts, advance / decline, futures remarks counts).

Per instrument (A and B):
- Price: ltp, open, previous close, day high / low, VWAP, last completed 5-minute candle, volume.
- 9:15: zone, the strike levels (ASO, AST, BSO, BST), VIX range edges, distance of price to each level.
- Trend: price-vs-levels score, structure features from the day's candles (range used, position in range, slope).
- Futures: remark, score, OI, OI change today, futures VWAP side, basis.
- Options: OI/OBV score, OBV flow, PCR (standing and change), max pain, IV skew, the ranked OI walls (strike, side, OBV pressure, erosion flag); raw chain at ATM +/- 10 strikes for the three indices and ATM +/- 4 for the others (per strike: CE / PE OI, OI change, OBV, IV, last price).
- App signals: level probabilities (six), dead zone (state, edges, released), squeeze flags, consensus (each group's vote, strength, net, count), Live Context checks and status, strong support / resistance zones.
- App outputs (stored separately, so the app itself can be scored): Final Verdict (call, confidence, reasons), Probable trade plan, commodity verdict, Focus gate states.

Market-wide: composite score and every part, 9:15 breadth, India VIX, GIFT NIFTY, USDINR, crude, gold, silver, macro drivers and label, strongest / weakest index.

Context: time of day, minutes since open, days to expiry, expiry-day flag, weekday, month, holiday proximity, session (NSE or MCX evening).

News and events: counts of headlines by impact level in the last 1 h and 6 h, per category, minutes to the next HIGH event and its type and India rating; the raw headlines (title, source, time, tags) and the event list with forecast / previous, saved once a day plus as they arrive.

End of day: full 5-minute candles of the core set and the stocks (re-fetchable only for live contracts), final chains, the day's outcomes. Labels are computed from this offline: forward return at 15 / 30 / 60 minutes and end of day, move in ATR units, whether ASO / AST / BSO / BST were touched and in what order, next-day gap, day type (trend or range).

Size: about 80 KB per snapshot, about 75 NSE snapshots and about 190 MCX snapshots a day: about 15-20 MB a day raw, about 2 GB a year raw, about 200-300 MB compressed.

## 4. The MCX evening session

Auto-pilot only drives the NSE day (09:20 to 15:30). A recorder scheduler is needed for MCX (09:00 to 23:55, weekdays): every 5 minutes, 4 s after the candle closes, load the three commodities through the same calls the full refresh uses (`_tfMcxLoad`), then capture. It runs whether or not the dashboard is open, and must not run during replays.

## 5. How many days of data

Independent samples are roughly the number of trading days, not the number of snapshots (snapshots within a day are strongly correlated).

| Days | Trading time | What it allows |
|---|---|---|
| 5 | 1 week | Check the recorder: gaps, stale inputs, sizes, label computation. No conclusions. |
| 20 | 1 month | Data-quality review, feature distributions, first look at whether features line up with what followed. Still no model. |
| 60 | 3 months | First exploratory models for intraday labels (30 / 60 minute direction, level touches), walk-forward, with heavy regularisation. Treat results as hints. |
| 120 | 6 months | First serious test: train 80 days, test 40 days, rolling. Enough regimes (expiry weeks, VIX levels) to see whether anything beats the baselines. |
| 250 | 1 year | Real confidence: covers budget, results seasons, RBI and Fed cycles. A model worth acting on needs this. |

Why: telling a 55% hit rate from a coin flip needs about 400 independent samples; a 60% rate about 100. Daily-horizon labels give about 1 sample per day per instrument; intraday labels about 3-5 usable samples a day. With 100+ features and fewer than a few hundred independent samples, a model memorises. Event-based models (a Fed decision happens about 8 times a year) are not feasible for years; events stay features.

Shortcut: Kite still serves about 95 days of 5-minute candles for live contracts, so price-derived features (9:15 zone, strike levels, trend, futures remark, VWAP) and all labels can be BACKFILLED for about 3 months right away. That gives a price-only starting dataset while the chain-based features accumulate live. It cannot backfill option chains of expired contracts, the app's own historical outputs, or news.

Realistic timeline: record for 20 days, then check quality; first exploratory models at about 60 days with the backfill; decide at about 120 days whether there is anything worth taking further; build the dashboard card only after a model has survived walk-forward testing against the baselines.

## 6. Build order

1. Server endpoint, recorder skeleton, IndexedDB outbox, core instruments, one NSE day recorded and checked.
2. Tier B stocks, tier C breadth, the raw chain, the app outputs, news and events, the EOD package.
3. MCX evening scheduler.
4. A small status line (rows today, last write, gaps, outbox size) and a nightly manifest.
5. Python: dataset builder and label generator, backfill from Kite candles, walk-forward harness, baselines.
6. Models (gradient boosting first, no deep nets), calibration, a report that compares them with: always flat, momentum, the current Final Verdict, the consensus.
7. Only if something survives: a "Model view" card (probability, never an order).

## 7. Risks and how they are handled

- Look-ahead: every feature carries its as-of time; labels come only from candles after it; walk-forward splits only.
- Feature drift: raw inputs saved with the app version and schema version; features are added, never renamed.
- Overfitting: few independent samples; baselines first; regularisation; a model must beat the existing rules, not just chance.
- Gaps: manifest per day with expected vs actual slots, a stale-input flag per feature, an outbox so a server outage loses nothing.
- Costs: any profit simulation includes brokerage, taxes and slippage.
- It is not a promise of an edge. The earlier backtests in this project found little; the data may confirm that.

## 8. Automated replay recorder (added 2026-11-05 at the user's request)

Instead of waiting for live days, pick a past date in the current month (for example 2 Nov 2026) and the app replays it by itself from 09:15 every 5 minutes to the close (NSE), and 09:00 to 23:55 (MCX), capturing and saving each slot exactly as the live recorder would (one shared capture function, so replayed and live rows have the same shape).

How: a "Data Recorder" tool (popup: date picker limited to the current month and past trading days, NSE / MCX tick boxes, Start / Stop, progress, list of recorded days). A job state (`GTB_REPLAY_JOB`) survives the page reloads it needs: (1) set the trading dates (current and previous day, NSE and MCX) to the chosen day, which needs a reload because the app reads them once at load; auto-pilot idles by itself while the dates are not the real date; (2) load that day's prices and the 9:15 scan; (3) for each 5-minute slot set the snapshot end time, run the full refresh, capture, send to the server; (4) after the last slot, the EOD package, then restore the original dates and reload.

Speed: re-fetching ~200 instruments every slot would take about an hour per day through Kite's rate limit. Instead a replay candle cache fetches each token's whole day once and serves every later slot request by slicing it at the slot time, so a slot costs seconds. Estimate: about 10-20 minutes per NSE day, similar for MCX.

What it can and cannot recreate:
- Can: prices, 9:15 zones and levels, trend, futures remark and OI (live contracts), VWAP, India VIX, GIFT NIFTY, option chains for contracts that are still listed (so the current month's contracts: a weekly expiry that has already passed is gone, and the chain then comes from the next live expiry, stored with that expiry and its days to expiry as of the replayed date), and the app's outputs recomputed by the CURRENT code (consistent, but not what the screen showed that day).
- Cannot: resting-order depth and ticks, funds, the original news timing (Google News can be asked for a date range, partial and optional, later), anything for months before the current one that depends on expired option contracts (price-derived features can still be backfilled about 95 days from spot candles).
- Restriction: the Kite session in the browser must stay open and logged in; the replay uses the same history queue as everything else.

## 9. Design change (2026-11-05): raw candles from the official API, recorded by the node server

The user asked that recording must not use the /oms (enctoken) path at all. That rules out snapshotting the dashboard (its caches are filled through /oms) and replaying it slot by slot. The design is now simpler:

- The node server (`recorder.js`) calls only `api.kite.trade` with the api_key + access_token pair, and saves the RAW 5-minute candles (with open interest) of every contract that matters for a day: one history call per contract per day, spaced by a delay (default 10 s). A whole day is therefore one pass; there are no slots to replay. Slot snapshots, scores and features are computed offline from these candles, the same way for old and new days.
- Live recording becomes an automatic after-the-close pull (NSE after 15:50 IST, MCX after midnight for the previous day). It does not need the browser tab, only the node server and a token saved that morning.
- The dashboard's own outputs (Final Verdict, Probable trade, consensus) are no longer recorded; they would have to be re-derived offline. Porting the formulas to Python is a later decision.
- Backfill: any day of the current month can be recorded from the panel; earlier months only lose their option contracts (expired), spot candles stay available for about 95 days.
- Still to build: news and event recording (not Kite data), the offline Python dataset and label builder.

Decision (2026-11-05): news and event recording is NOT part of the recorder for now. The plan keeps only market data (raw candles). The news panel stays a reading tool; if news features are wanted later they can be added as a separate recorder.

## 10. Option A built (2026-11-05): replay the dashboard logic, save every metric per slot

The user confirmed option A: the dashboard's own scores and metrics are the data to save, not only raw candles. `replayRecorder.js` replays a chosen day of the current month slot by slot through the unchanged dashboard logic, with ONE change: the single history function (`getHistoricalDataUsingPromise`) answers from the official API (api.kite.trade, key + token) instead of /oms while a replay runs. History requests for the replay day are cut at the slot time (completed candles only; the just-started candle as its open price only), so a slot cannot see the future. After each slot's refresh every metric is captured and POSTed to `data/snapshots/<day>_<session>.jsonl` (schema 2). A delay (default 10 s) follows each slot. The server-side raw candle recorder stays as a second, independent copy of the market data.

Open points: the first real run against Kite; whether `autoRefreshEachTabs` and the MCX loads behave identically on a replay day as on a live day (they are the same functions); the time per day (NSE 75 slots, MCX 179, each plus the delay, plus the first slot's burst of official API calls).


Note (2026-11-05): a slot is stored exactly once. Saving a slot again replaces the earlier copy (see recorder.js upsertSnapshot), and old duplicates are collapsed at server start, so no duplicate rows can reach the training data. Reruns start from the first slot and overwrite, because several dashboard metrics depend on earlier refreshes and a mid-day resume would not be consistent with a full run.


Update (2026-11-05): the replay now prefetches every candle set a session needs (instruments, futures, option strikes covering the day range) before the first slot and keeps them in a candle cache on the server (data/candles/<day>/). Slots run on stored data, and reruns of a finished day need no Kite calls. A stored set is reused only if it was fetched after the day it covers had ended.
