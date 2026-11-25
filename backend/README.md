# Groot backend

Node 20 + TypeScript. Kite Connect gateway, market data, engine and API. **Read-only: there is no order placement.**
Roadmap: `../docs/new-platform-roadmap.md`. The trading logic is ported unchanged into `src/engine/` in Phase 2 (nothing there yet).

## Run

```bash
cd backend
npm install
cp .env.example .env        # fill APP_SECRET (24+ chars), KITE_API_KEY, KITE_API_SECRET
npm run dev                 # or: npm start
```

Daily Kite login (the token expires about 06:00 IST every day):

1. Register `http://127.0.0.1:4000/auth/kite/callback` as the redirect URL of your Kite Connect app.
2. Open `http://127.0.0.1:4000/auth/kite/start` in a browser and log in. The token is saved; instruments for the day load by themselves.

Check it:

```bash
curl http://127.0.0.1:4000/health/ping
curl -H "Authorization: Bearer $APP_SECRET" http://127.0.0.1:4000/health
curl -H "Authorization: Bearer $APP_SECRET" "http://127.0.0.1:4000/kite/ltp?i=NSE:NIFTY%2050"
```

## One app, one address

Build the frontend once (`cd ../frontend && npm run build`) and the backend serves it from `/` (set `FRONTEND_DIR` to point elsewhere). The API stays behind the secret; the app files are public (they hold no data). To open it from a phone on the same network set `HOST=0.0.0.0` in `.env` and use `http://<this PC's IP>:4000`; only do that on a network you trust.

Built in: ten wrong secrets from one address block it for a minute (HTTP 429), a request ceiling per address, security headers on every response, graceful shutdown on Ctrl+C, and crash handlers that log instead of killing the process.

## API

| Route | Auth | What |
|---|---|---|
| `GET /health/ping` | none | liveness |
| `GET /health` | secret | token state, instruments, problems list (`ok` / `degraded`) |
| `GET /auth/kite/start` | none | redirect to Kite's login page |
| `GET /auth/kite/callback` | none | receives `request_token`, saves today's token |
| `GET /auth/kite/login` | secret | the login URL as JSON |
| `GET /instruments/lookup?exchange=&symbol=` | secret | one instrument row |
| `GET /kite/ltp?i=NSE:NIFTY 50` | secret | last prices (through the gateway) |
| `GET /kite/history?token=&interval=&from=&to=&oi=1` | secret | candles `[time,o,h,l,c,v,oi?]` |
| `GET /stream?tokens=256265,260105` | secret | live ticks as server-sent events (latest tick per token, about every 400 ms) |
| `GET /feed/status` | secret | ticker state, subscribed / watched counts, last tick time |
| `POST /feed/watch` | secret | `{"tokens":[{"token":256265,"hasOi":false}]}` start live candles + subscribe |
| `GET /live/candles?token=` | secret | the 5-minute candles built from ticks for a watched token |
| `GET /scan915?day=` | secret | the 9:15 scan of a day (saved result + progress) |
| `POST /scan915/run` | secret | `{"day":"2026-11-20","force":true}` start the scan |
| `POST /scan915/stop` | secret | stop a running scan |
| `GET /futures?name=NIFTY 50&day=&asOf=` | secret | futures remark, score, VWAP and the signals behind it |
| `GET /verdict?name=&day=&asOf=` | secret | the wall verdict: LONG / SHORT / WAIT from the score, the nearest OI wall (within 0.35%) and the futures vs OI/OBV check, with entry, stop and target, the three parts (context, location, confirmation) and a high-conviction flag |
| `GET /levelprob?name=&day=&asOf=` | secret | Level Probability: the live-signal likelihood of reaching ASO / AST / VIXU and BSO / BST / VIXL |
| `GET /market?day=&asOf=` | secret | market-wide layer: advance / decline and futures-trend scores over the whole F&O universe, 9:15 breadth, component scores, the composite score and the market signal (STRONG BUY ... STRONG SELL, NO TRADE). Heavy: about three history requests per stock |
| `GET /leveldecision?name=&day=&asOf=` | secret | Level Confirmation tally and the Level Decision (AT LEVEL / WAIT / TREND ENTRY / SKIP) for both sides of an index |
| `GET /finalverdict?name=&day=&asOf=` | secret | the Final Verdict: LONG / SHORT / WAIT / NO TRADE with headline, action, confidence, reasons and warnings |
| `GET /levels?name=&day=&asOf=` | secret | strong support and resistance zones: OI walls, max pain, 9:15 levels, value area, day and previous-day levels merged and scored |
| `GET /outlook?name=&day=&asOf=&force=` | secret | the Probable trade: direction and confidence from the consensus, entry / stop / targets from the zones, held for the day |
| `GET /livecontext?name=&day=&asOf=&dir=` | secret | Live Context: is the morning view still valid (VALID / WEAKENING / STALE) from price, structure, walls and futures windows |
| `GET /strength?day=&asOf=` | secret | strongest and weakest index of the day |
| `GET /commodities` | secret | the commodities with MCX futures in the instrument list |
| `GET /commodity?name=&day=&asOf=` | secret | a commodity's day: price, 9:15 levels, expected range from its CBOE volatility index, 9:15 zone and trend |
| `POST /refresh` | secret | on-demand refresh: drops the per-slot copies (market read, decisions, futures accuracy, curve, macro, Kite quote and history cache) so the next read recomputes now; `GET /refresh` gives the time of the last one |
| `GET /progress` | secret | what the backend is busy with (phase, names done of total, seconds), for the screens' progress bar |
| `GET /orderflow?name=&day=` | secret | live resting-order imbalance (buy against sell quantity, an index uses its futures); live only, the first request subscribes the name; also votes in Master Consensus |
| `GET /positional` | secret | the swing screener's rows, progress and market view; `POST /positional/scan {scope: dashboard or all, names?, day?, asOf?}` starts a background scan, `POST /positional/stop` cancels it |
| `GET /curve?name=&day=&asOf=` | secret | near versus far futures: state, annualised gap and lean (also votes in Master Consensus) |
| `GET /scoreseries?name=&day=&asOf=` | secret | the instrument score after each time slot of the day (the SCORE strip under the chart); a finished past day is saved |
| `GET /tracking`, `POST /tracking` `{name, remove?}` | secret | the tracked stocks with price and nearest OI walls; alerts near a wall go through `/alerts` and Telegram |
| `GET /watchlist`, `PUT /watchlist` `{groups}`, `POST /watchlist/reset` | secret | the watchlist groups (built-in until you change them, then saved); live prices come from `/stream` |
| `GET /data`, `/data/instruments?q=`, `/data/steps?q=`, `/data/weights` | secret | what the backend keeps on disk and the contract list, strike steps and index weights (the Data page) |
| `POST /data/clear` `{what}` | secret | clears one kind: `instruments`, `candles`, `saved` or `weights`; settings, pins, the Kite login, holidays and macro history are never touched |
| `GET /marks?names=&day=&asOf=` | secret | the Trade Focus call and confidence of up to 12 names (the marks on the Chart View board) |
| `GET /futures/series?name=&day=&asOf=` | secret | the futures remark after each 5-minute candle (the strip under the chart) |
| `GET /account` | secret | funds (equity and commodity balance) and the day's P&L from Kite, read-only |
| `GET /boards?day=&asOf=` | secret | cross-instrument boards: Signal agreement + Entry timing, the OI heatmap, Max Pain and GEX, Master Consensus and Level Probability of the indices and the heaviest stocks |
| `GET /panel?day=&asOf=` | secret | the old left panel: Entry / Trade confluence, Now Trade levels, pillars, position exit check, top trades, score detail and the score history of the day |
| `GET /overview?day=&asOf=` | secret | market-wide dashboard numbers: composite score with its Range Scoreboard groups, the futures strip (remark, VWAP, premium) and the futures remark accuracy table |
| `GET /strikes?name=&day=&asOf=&strategy=&offset=&wing=` | secret | Option Strike Search: a strategy for the consensus direction (or your pick), its legs on listed strikes with the last premium, expiry payoff per lot and lots that fit your risk |
| `GET /alerts?since=` | secret | squeeze alerts raised since an id (short covering / long unwinding on the indices, RELIANCE, HDFCBANK, ICICIBANK, GOLDM, SILVERM), checked every minute in market hours |
| `GET /focus?name=&day=&asOf=` | secret | Trade Focus: the five gates (tradeable today, direction, entry and timing, risk, exit) of an index, stock or commodity |
| `GET /squeeze?name=&day=&asOf=` | secret | short covering / long unwinding: live signal, pre-squeeze watch and the contract's own past-episode study |
| `GET /weightedoi?day=&asOf=&sort=` | secret | top-10 constituents of NIFTY 50 and BANK NIFTY: OI view, Index Impact, driver tier, caution (sort = impact or weight) |
| `GET /feargreed?day=&asOf=` | secret | Fear & Greed score from breadth, India VIX and NIFTY 50 momentum |
| `GET /macro?day=` | secret | macro backdrop: oil, US yield, Fed proxy, rupee, India yield, dollar, with the verdict |
| `POST /macro/in10y` | secret | paste India 10Y yield history (`{text, replace?}`) |
| `GET /signals?name=&day=&asOf=&strategy=` | secret | Signal agreement and entry timing: the suggested strategy (from the Final Verdict), how many independent signals back it, and a checklist of whether now is a good moment |
| `GET /predict?day=&asOf=` | secret | Predict (9:15 combo): bull / bear / sideways percentages from today's combo (the backtested win rate when there is one) plus ten live signals, confidence, VIX regime and the trade idea. `unvalidated` is true when no backtest matches the combo |
| `GET /combo915?rows=1&lookback=` | secret | the 9:15 combo backtest of the last year: a per-combo table (days, legs, win rate, level vs trend entries), or the day-wise rows with `rows=1`. Rebuilt once a day |
| `GET /consensus?name=&day=&asOf=` | secret | Master Consensus: the nine votes grouped into independent signal groups, net, agreement, call; lists the engines not ported yet |
| `GET /score?name=NIFTY 50&day=&asOf=` | secret | the instrument score: 9:15, trend, futures, OI/OBV (capped in the total), max pain, IV skew and the total, with the parts behind each |
| `GET /oi?name=NIFTY 50&day=&asOf=` | secret | OI/OBV analysis of the chain: per-strike labels, chain score, walls, build-up / erosion, max pain, skew score |
| `GET /chain?name=NIFTY 50&day=&asOf=09:30&expiry=&anchor=ltp\|open` | secret | option chain with OI, change in OI, OBV, IV per strike, PCR, IV skew |

## Layout

```
src/config      validated settings (.env + environment)
src/auth        app secret check, Kite token flow and expiry
src/kite        gateway: rate limiter (history ~3/s, quote 1/s), TTL cache, REST client
src/instruments daily dump -> lookups (tokens, futures, options, expiries)
src/marketdata  tick parser, 5-minute candle builder (ported from the userscript), live market
src/kite/ticker WebSocket ticker with reconnect, resubscribe and a silence watchdog
src/store       key/value store (atomic JSON files; the seam for SQLite later)
src/api         HTTP routes
tests           vitest (npm test); tests/oracle/ runs the ORIGINAL userscript functions as the reference for every ported module
```

## Rules

- No native add-ons; paths and secrets come from config only (so it can also run under Termux).
- Secrets are never logged (redacted) and the token file is written with mode 600.
- `npm run check` (types + tests) must pass before a commit.
