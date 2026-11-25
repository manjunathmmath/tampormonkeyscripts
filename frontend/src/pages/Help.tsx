import { useMemo, useState } from 'react';

interface Topic {
  id: string;
  group: string;
  title: string;
  /** short answer shown when the card is closed */
  lead: string;
  /** the full text, one paragraph per entry */
  body: string[];
  /** extra words the search should match */
  words?: string;
}

const TOPICS: Topic[] = [
  // ───────── getting started
  {
    id: 'daily', group: 'Start here', title: 'The daily routine',
    lead: 'Log in to Kite once each morning, then open Dashboard and Focus.',
    body: [
      'Kite\'s access token expires every day. Open System and press "Log in to Kite", sign in, and the page shows the token as valid. Nothing else needs doing: the app reads the market by itself.',
      'Then: Dashboard for the whole market, Trade Focus for one instrument (five questions before a trade), Charts for the picture, Watchlist for live prices.',
      'Press Refresh in the top bar to recompute everything now. Turn Auto on in System to refresh every 5 minutes.',
    ],
    words: 'login token kite morning expired routine',
  },
  {
    id: 'never-orders', group: 'Start here', title: 'The app never places an order',
    lead: 'It reads and calculates. Every trade is yours.',
    body: [
      'There is no route in the backend that places or changes an order, and no button that does. Plans, entries, stops and targets are levels to look at, not instructions.',
      'Everything here is rule-based and has not been back-tested as a forecast. A green light is not a trade instruction.',
    ],
    words: 'safe orders disclaimer risk advice',
  },
  // ───────── screens
  { id: 's-dashboard', group: 'The screens', title: 'Dashboard', lead: 'The whole market at a glance.', body: ['Market score and verdict first, then Trade now and the Probable trade of the three indices (tap one for the full plan with the entry / stop / target box), then breadth, the 9:15 breakout, futures, indices and price action.', 'The jump bar at the top takes you to a section. The groups at the bottom (Lean, Pillars, Reliability, Positional) fold open and shut; your choice is remembered.'], words: 'score breadth probable trade price action' },
  { id: 's-focus', group: 'The screens', title: 'Trade Focus', lead: 'Five gates for one instrument.', body: ['Pick an instrument (any F&O stock too). Today tradeable?, Direction, Entry & timing, Risk, Exit: each is a traffic light with one sentence; click a row for the evidence.', 'Below the gates: the Probable trade card for that instrument and a folded Pre-trade checklist (seven questions answered from today\'s numbers).'], words: 'gates checklist tradeable' },
  { id: 's-watch', group: 'The screens', title: 'Watchlist', lead: 'Live prices in groups, with weighted constituents.', body: ['Prices stream from Kite for the group on screen (up to 200 names). Tap a row for chart, detail, track-alerts, strikes and remove. Sort by change or LTP; the bar shows how many are up or down.', '"NIFTY 50 top 10" and "BANK NIFTY top 10" are built from the live index weights and follow them; they cannot be edited. Your own groups are saved on the server, so your phone sees the same lists.', 'The Tracking card lists the stocks you track for OI-wall alerts.'], words: 'watch weighted constituents tracking' },
  { id: 's-charts', group: 'The screens', title: 'Chart View', lead: 'One to six charts with levels, walls, plans and strips.', body: ['The left list is the 9:15 board: every name by where its first 5-minute candle closed. Click a name to load it into the selected chart. Use the picker above a chart to search any instrument.', 'Presets (the cards button) fill the charts in one tap: Index + Metals (NIFTY 50, BANK NIFTY, GOLDM and SILVERM), Index (NIFTY 50 and BANK NIFTY), All indices (NIFTY 50, BANK NIFTY and SENSEX), Metals (GOLDM and SILVERM), Energy (CRUDEOILM and NATGASMINI) or MCX (all four). To keep your own, set up the charts, type a name in the preset menu and press Save; the bin deletes it. Presets are remembered on this device.', 'The Layers button chooses what is drawn: strike levels, OI walls, day range, dead zone, support / resistance zones, the trade plan (entry, stop, targets as a shaded box), level odds, the futures strip and the score strip. Presets Clean / Standard / Full switch them in one click.', 'Under every chart: OI / OBV by strike. The line under the chart name shows the plan numbers for that instrument.'], words: 'layers 9:15 board plan strips' },
  { id: 's-mcx', group: 'The screens', title: 'Commodities (MCX)', lead: 'GOLDM, SILVERM, CRUDEOILM and the rest.', body: ['Levels come from the open and the commodity\'s own CBOE volatility index (OVX for crude, GVZ for gold, VXSLV for silver). Enter those values under Settings if the automatic fetch cannot find them, or the VIX proxy is used and the card says so.', 'The page has the Focus gates, the Probable trade, the verdict, levels, the option chain, signals, curve structure and the score.'], words: 'mcx gold silver crude ovx gvz vxslv' },
  { id: 's-pos', group: 'The screens', title: 'Positional screener', lead: 'Swing view on daily candles.', body: ['Choose what to scan (weighted, NIFTY 50, BANK NIFTY, 9:15 zones, all F&O, MCX) and press Scan. Verdict tabs group the results; "Group by timing" shows EARLY / MID / LATE so you can see how far a move has already gone.', 'It is a slow, multi-week view, not a same-day signal. The bell on a row tracks the stock for OI-wall alerts.'], words: 'swing screener scan conviction' },
  { id: 's-scan', group: 'The screens', title: '9:15 Scanner', lead: 'Where each name\'s first candle closed.', body: ['Re-scan loads the first 5-minute candle of every name and classifies it against that name\'s own strike levels: AST, ASO, between, BSO, BST. On a live day it runs by itself after 9:20.'], words: 'scanner zones' },
  { id: 's-boards', group: 'The screens', title: 'Boards', lead: 'One table per signal across many names.', body: ['Signals, OI heatmap, Max pain, Consensus, Squeeze and Level odds. Open a row of the OI heatmap for the full chain of that name.'], words: 'boards heatmap squeeze' },
  { id: 's-oiobv', group: 'The screens', title: 'OI / OBV', lead: 'Strike-by-strike bars for as many names as you tick.', body: ['Tick up to 12 instruments, or use the Weighted buttons (an index and its ten heaviest stocks). Each gets an OI-change panel and an OBV panel: calls red, puts green, solid = built up, faded = reduced, shaded = the at-the-money strike.', 'The page refreshes itself after every 5-minute close while the market is open (turn it off with the clock icon).'], words: 'oi obv open interest' },
  { id: 's-trade', group: 'The screens', title: 'Trade (option strikes)', lead: 'The strategy, strikes and payoff for a name.', body: ['Pick a name from the 9:15 board or the quick lists. You see whether the signals agree and whether now is a good time to enter, then the suggested strategy, its legs and what it can make or lose at expiry. Offset and wing width can be typed; blank means automatic.'], words: 'strikes options strategy payoff' },
  { id: 's-system', group: 'The screens', title: 'Settings, Data and System', lead: 'Setup and housekeeping.', body: ['Settings: capital, risk %, trading days, expiries, volatility values, Telegram. System: Kite login, connection test, instruments, live feed, dates and holidays, recent activity. Data: what the server stores, with a clear button for each kind (your settings and Kite login are never cleared), the instrument and strike-step lists, index weights and the India 10Y paste box.'], words: 'settings data system' },
  // ───────── reading the numbers
  { id: 'zones', group: 'Reading the numbers', title: '9:15 levels: ASO, AST, BSO, BST', lead: 'Levels one and two steps above and below the day\'s open.', body: ['From the open: ASO = open + step, AST = open + 2 steps, BSO = open − step, BST = open − 2 steps. The step is the instrument\'s strike interval (for commodities, the real gap of its option strikes).', 'The first 5-minute candle\'s close gives the zone: AST (at or above the upper level), ASO, between (B/W), BSO, BST (at or below the lower level).'], words: 'aso ast bso bst zone strike levels' },
  { id: 'vix', group: 'Reading the numbers', title: 'VIXU and VIXL: the expected day range', lead: 'The previous close moved by what the volatility index implies for one day.', body: ['VIXU / VIXL = previous close × (1 ± volatility / 100 / √days). For indices the volatility is India VIX; for commodities their own CBOE index. Price beyond them means the day\'s expected range is already used. It is momentum, not a reversal signal, so do not fade it.'], words: 'vixu vixl range volatility' },
  { id: 'walls', group: 'Reading the numbers', title: 'OI walls, max pain and PCR', lead: 'Where option writers have the most at stake.', body: ['R1 / R2 are call-writing walls above price (resistance), S1 / S2 put-writing walls below (support), ranked by OBV pressure. A wall flagged eroding is losing open interest and counts less.', 'Max pain is the strike where option buyers lose most at expiry; it is context, not a trigger. PCR is put open interest over call open interest.'], words: 'oi walls resistance support max pain pcr r1 s1' },
  { id: 'obv', group: 'Reading the numbers', title: 'OI change and OBV', lead: 'How much was added and which way the volume pushed.', body: ['OI change is today\'s change in open interest per strike. OBV is volume signed by price direction, so a strike with rising OI and falling OBV on the call side looks like call writing (bearish resistance).'], words: 'obv oi change flow' },
  { id: 'consensus', group: 'Reading the numbers', title: 'Consensus and signal groups', lead: 'Independent groups of signals vote; the net decides.', body: ['Signals that read the same data vote once as a group: the 9:15 zone, price against levels, the futures remark, option flow (OI/OBV, IV skew, level odds), order flow and curve structure. The net runs from −1 to +1; above +0.2 is LONG, below −0.2 SHORT.', '"3 of 3 groups agree" means all the voting groups lean the same way. With only one or two voting it is flagged as a low sample.'], words: 'consensus groups net vote long short' },
  { id: 'plan', group: 'Reading the numbers', title: 'The Probable trade plan', lead: 'An entry zone, stop and targets built from the support and resistance zones.', body: ['The direction is the consensus. The entry is the nearest strong support (long) or resistance (short) zone; the stop sits just beyond it (never tighter than one average 5-minute range); target 1 and 2 are the next zones ahead. The shaded box draws it: green from entry to target 1, red from entry to the stop.', 'Confidence is HIGH / MEDIUM / LOW from how many groups agree and how strong the net is, lowered when the morning view is stale. A plan is held fixed until the direction flips, price reaches the stop or target 1, or another zone keeps showing for about 4 minutes.'], words: 'probable trade plan entry stop target confidence' },
  { id: 'gates', group: 'Reading the numbers', title: 'The five gates', lead: 'Today tradeable, Direction, Entry, Risk, Exit.', body: ['Green means nothing in the way, amber means care, red means a reason not to, grey means not applicable (for example not live). Risk turns your capital and risk % into the lots that fit; margin and brokerage are not included.', 'A green gate row can still say WAIT: the entry row only turns green for a strict case (an OI wall right at price, futures and OI/OBV agreeing).'], words: 'gates tradeable direction entry risk exit traffic light' },
  { id: 'futures', group: 'Reading the numbers', title: 'The futures remark', lead: 'Price against VWAP and open interest, in a word.', body: ['LONG / SHORT: price and open interest rising or falling together. SHORT COVERING: price rising while open interest falls (shorts exiting). LONG UNWINDING: price falling while open interest falls. NO CLEAR SIGNAL: the readings disagree or the move is small. It is detected, not predicted.'], words: 'futures remark short covering long unwinding' },
  { id: 'dead', group: 'Reading the numbers', title: 'Dead zone', lead: 'A band where the signals disagree, so price tends to chop.', body: ['The band runs between the nearest OI walls (or the 9:15 levels). It ends when a 5-minute candle closes beyond an edge by more than 0.05% of price. While it is active, the verdict stays WAIT.'], words: 'dead zone chop wait' },
  // ───────── time controls
  { id: 'refresh', group: 'Time and data', title: 'Refresh, Auto and the snapshot time', lead: 'Nothing updates in the background unless you ask.', body: ['Refresh recomputes every card now. Auto (System) does it every 5 minutes. The OI / OBV page has its own timer.', 'The snapshot end time (top bar) shows the market as it was at that time on the day shown: scores, charts and plans all stop there, and live updates are off. Clear it and press Refresh to go back to live. The Watchlist and the ticker stay live.'], words: 'refresh auto snapshot time replay past day' },
  { id: 'days', group: 'Time and data', title: 'Which day am I looking at?', lead: 'The status bar at the bottom says.', body: ['Today / Prev show the day on screen and the day before it. Set them under Settings to look at a past day; blank means the latest trading day. At the weekend the app shows Friday. The bar also shows the next NSE holiday and when the last refresh ran.'], words: 'day date holiday status bar' },
  { id: 'engine', group: 'Time and data', title: 'The Data engine page', lead: 'What the live feed is doing behind the screens.', body: ['The server follows prices over Kite’s live ticker: every spot and index, the nearest futures of every stock, index option strikes around the money, the heavyweight stocks’ strikes and the MCX contracts. A contract’s 5-minute candles are read from Kite once, then kept current from ticks; later reads of today come from memory.', 'The page shows the feed state and ticks per second, how many reads were answered from ticks instead of Kite and why the others were not, every followed contract with its state (live, stale, waiting, silent), and a Check against Kite button that compares tick-built candles with Kite’s own. A reconnect makes every series stale, so each is read once more.'], words: 'engine ticks live feed websocket kite calls' },
  { id: 'slow', group: 'Time and data', title: 'Why the first load is slow', lead: 'A new server has to fetch history from Kite.', body: ['Kite allows about three history calls a second, and the market read looks at about 218 stocks plus option chains. The first load of a day can take minutes; finished days are saved to disk, so later loads are much faster. The server also prepares the market read after every 5-minute close so the Dashboard opens ready.'], words: 'slow loading first load history' },
  // ───────── alerts
  { id: 'alerts', group: 'Alerts', title: 'What can alert you', lead: 'A bell with a count in the top bar (tap it to read them), and Telegram if you turn it on.', body: ['Squeeze alerts: short covering (exit shorts / PEs) or long unwinding (exit longs / CEs) on the index futures and the big three stocks. Entry-zone alerts: price reaches the Probable trade entry (tick the box on the card). Stock tracking: price within 0.6% of an OI wall, and again within 0.15%.', 'For Telegram, put the bot token and chat id in Settings and turn on "Send alerts to Telegram". Alerts only tell you; they never place an order.'], words: 'alerts telegram banner squeeze tracking' },
  // ───────── trouble
  { id: 'unreachable', group: 'When something looks wrong', title: '"Backend unreachable" or "Too many wrong secrets"', lead: 'The app secret does not match, or the server is down.', body: ['Sign out and sign in again with the app secret from the server\'s settings file. After ten wrong tries the address is locked for a minute. If the System page does not load at all, the backend process is not running.'], words: 'unreachable secret login error 401 429' },
  { id: 'nodata', group: 'When something looks wrong', title: 'A card says it is loading or has no data', lead: 'Usually the option chain or candles are still being fetched.', body: ['Names without a loaded option chain have no OI walls, so they get no plan. Wait a minute and press Refresh. Outside market hours the cards show the last trading day. If a whole page stays empty after a login, check System for the Kite token and the live feed.'], words: 'loading no data empty missing' },
  { id: 'vxslv', group: 'When something looks wrong', title: 'A commodity says it uses the VIX proxy', lead: 'Its own volatility index could not be fetched.', body: ['Gold, silver and crude use GVZ, VXSLV and OVX. If those cannot be fetched automatically (Yahoo has little history for some), type yesterday\'s value into the matching Settings field and the range and level odds will use it.'], words: 'vix proxy ovx gvz vxslv volatility' },
];

const GROUPS = ['Start here', 'The screens', 'Reading the numbers', 'Time and data', 'Alerts', 'When something looks wrong'];

/** The help for the app: searchable, grouped, each topic opens to its full text. */
export function Help() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ daily: true });
  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () => TOPICS.filter((t) => !needle || `${t.title} ${t.lead} ${t.body.join(' ')} ${t.words ?? ''} ${t.group}`.toLowerCase().includes(needle)),
    [needle],
  );
  return (
    <div className="page help-page">
      <header className="page-head">
        <div>
          <h1>Help</h1>
          <p className="sub">What each screen does, how to read the numbers, and what to do when something looks wrong.</p>
        </div>
      </header>
      <input type="search" placeholder="Search the help, e.g. ASO, refresh, plan, telegram" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the help" />
      {!shown.length && <p className="muted">Nothing matches "{q}". Try a shorter word.</p>}
      {GROUPS.map((g) => {
        const items = shown.filter((t) => t.group === g);
        if (!items.length) return null;
        return (
          <section key={g} className="pgroup" aria-label={g}>
            <h3 className="pgroup-title">{g}</h3>
            <div className="help-list">
              {items.map((t) => {
                const isOpen = open[t.id] || !!needle;
                return (
                  <article key={t.id} className={`help-card${isOpen ? ' open' : ''}`}>
                    <button className="help-head" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [t.id]: !open[t.id] })}>
                      <b>{t.title}</b>
                      <span className="muted">{t.lead}</span>
                      <i aria-hidden="true">{isOpen ? '▾' : '▸'}</i>
                    </button>
                    {isOpen && <div className="help-body">{t.body.map((p, i) => <p key={i}>{p}</p>)}</div>}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="small-note">Everything here is rule-based and not back-tested as a forecast. The app reads the market and never places an order.</p>
      <p className="small-note">Charts by TradingView Lightweight Charts™, Copyright (c) 2023 TradingView, Inc. <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">https://www.tradingview.com/</a></p>
    </div>
  );
}
