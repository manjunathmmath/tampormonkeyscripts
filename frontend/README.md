# Groot frontend

React + TypeScript + Vite. One responsive app for laptop, tablet and phone. It only talks to the backend (`../backend`); in development Vite forwards `/api/...` to `http://127.0.0.1:4000`.

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (also reachable from a phone on the same network)
npm run build        # type-check + production build
```

The first screen asks for the backend's `APP_SECRET` (kept in this browser only).

## Screens

- **Markets**: NIFTY 50, NIFTY BANK, SENSEX and INDIA VIX with live price, change, intraday sparkline and day range (refreshes every 3 s while the market is open), plus the day's 9:15 zone summary.
- **9:15 Scanner**: pick a day, run the scan, zone summary bar and filters (AST / ASO / B/W / BSO / BST), search, sort by biggest move. Each name is a tile with its 9:15 move and a gauge showing where the close sits against its levels; tapping opens the levels ladder (bottom sheet on a phone, side panel on a wide screen).
- **Chart**: any name in the universe, 5-minute candles (lightweight-charts) with the day's 9:15 levels (AST, ASO, open, BSO, BST) drawn as lines. Live refresh every 10 s during the session.

- **Options**: the option chain of an index or stock for a day. The instrument score on top (9:15, trend, futures, OI/OBV, max pain, IV skew and their total), a summary (price, change, put/call ratio, change PCR, max pain, IV skew, ATM IV, OI near the money, OBV flow, chain score), and the chain as a ladder: calls left, strike in the middle, puts right, with the OI change and OBV as bars, the per-strike signal (WRITE / BUY / COV / UNWIND, green if it points up for the index, red if down), the ATM, the support / resistance walls (R1, S1, ↓ when eroding) and max pain marked, and in-the-money rows faded. Refreshes every minute while the market is open.
- **System**: backend version, uptime and memory; the Kite token (valid / expired, who is logged in, how long ago) with a one-tap "Log in to Kite" and a "Test connection" that makes a real read; the live feed (state, subscribed, last tick, reconnects); instruments (count, reload); the 9:15 scan state; a banner that names what needs attention; and the recent activity log (warnings and errors can be filtered, each line expands to its details).

## Design system

`src/styles.css`: semantic colour tokens for a dark (default) and a light palette, a theme switch (system / dark / light, remembered), Inter variable font, tabular numbers for prices, 14 px cards, left rail on wide screens and a bottom tab bar on phones with safe-area handling, skeleton loaders, and reduced-motion support.

## Live prices, offline and install

- Prices stream from the backend (`/stream`, read with fetch because it needs the bearer header). Markets cards and the chart's forming candle update as ticks arrive; polling stays as a slow backup and as the fallback when the stream is down.
- A production build is an installable app (manifest, icons, service worker). The service worker caches the app shell only; market data is never cached.
- An error boundary keeps the shell working if a screen crashes, and a banner appears while the browser is offline.
- `npm run check` runs the type check and the unit tests.
