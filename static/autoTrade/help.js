// ─── help.js ──────────────────────────────────────────────────────────────────
// Dedicated help & reference popup for the autoTrade dashboard.
// Opens via the "?" button in the Groot topbar (#show-help).
// All content is self-contained HTML — no API calls needed.
// ─────────────────────────────────────────────────────────────────────────────

jQ(document).on('click', '#show-help', function (e) {
    e.preventDefault();
    showHelpPopup();
});

function showHelpPopup() {
    let html = buildHelpHTML();
    showPopUpWindow('help-popup', html, 'Help', 820, 580);
    let divId = 'popup-custom-style-help-popup';
    let title = '<div style="display:flex;align-items:center;gap:6px;width:100%;">'
        + '<span style="font-weight:800;font-size:0.7rem;white-space:nowrap;"><i class="bi bi-question-circle-fill"></i>&nbsp;HELP &amp; REFERENCE</span>'
        + popupWinControls(divId)
        + '</div>';
    jQ('.' + divId).find('.popupwindow_titlebar_text').html(title);
    hideNativePopupButtons(divId);
    jQ('.' + divId).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');

    // Activate first tab
    jQ('#help-tab-overview').addClass('hlp-tab-active');
    jQ('#help-panel-overview').addClass('hlp-panel-active');

    // Tab switching
    jQ(document).off('click.help').on('click.help', '.hlp-tab', function () {
        let target = jQ(this).data('target');
        jQ('.hlp-tab').removeClass('hlp-tab-active');
        jQ('.hlp-panel').removeClass('hlp-panel-active');
        jQ(this).addClass('hlp-tab-active');
        jQ('#help-panel-' + target).addClass('hlp-panel-active');
    });
}

function buildHelpHTML() {
    let h = '<div class="hlp-root">';

    // ── Tab Nav ────────────────────────────────────────────────────────────────
    h += '<div class="hlp-tabs">';
    const tabs = [
        { id: 'overview',  icon: 'bi-house-fill',          label: 'Overview'      },
        { id: 'trend',     icon: 'bi-arrow-up-right-square', label: 'Trend Labels' },
        { id: 'oi',        icon: 'bi-bar-chart-fill',       label: 'OI Analysis'  },
        { id: 'obv',       icon: 'bi-graph-up',       label: 'OBV'          },
        { id: 'iv',        icon: 'bi-lightning-fill',       label: 'IV'           },
        { id: 'signals',   icon: 'bi-signpost-2-fill',      label: 'Signals'      },
        { id: 'score',     icon: 'bi-speedometer',          label: 'Score'        },
        { id: 'pcr',       icon: 'bi-pie-chart-fill',       label: 'PCR'          },
        { id: 'futures',   icon: 'bi-graph-up',  label: 'Futures'      },
        { id: 'vix',       icon: 'bi-activity',             label: 'VIX Range'    },
        { id: 'tradeplan', icon: 'bi-journal-check',         label: 'Trade Plan'   },
        { id: 'tools',     icon: 'bi-tools',                 label: 'Tools'        },
        { id: 'exit',      icon: 'bi-door-open-fill',        label: 'Exit Signal'  },
    ];
    tabs.forEach(function(t) {
        h += '<button class="hlp-tab" id="help-tab-' + t.id + '" data-target="' + t.id + '">'
           + '<i class="bi ' + t.icon + '"></i><span>' + t.label + '</span></button>';
    });
    h += '</div>';

    // ── Panels ─────────────────────────────────────────────────────────────────
    h += '<div class="hlp-body">';

    // ── OVERVIEW ────────────────────────────────────────────────────────────────
    h += hlpPanel('overview', '<i class="bi bi-house-fill"></i> Overview', `
      <p class="hlp-intro">Groot autoTrade is a <strong>Tampermonkey overlay</strong> on <em>kite.zerodha.com</em> that
      scans live option-chain data and combines multiple signals into a single composite score to help identify
      <strong>intraday directional bias</strong> on Nifty 50, Bank Nifty and individual F&O stocks.</p>

      <div class="hlp-flow">
        <div class="hlp-flow-step"><div class="hlp-flow-num">1</div><div><strong>Load Prices</strong><br>Fetches today's open &amp; yesterday's close for all instruments. Enables strike level calculation.</div></div>
        <div class="hlp-flow-arrow"><i class="bi bi-arrow-right"></i></div>
        <div class="hlp-flow-step"><div class="hlp-flow-num">2</div><div><strong>9:15 Scan</strong><br>Reads the first 5-min candle close to classify each instrument as AST/ASO/BSO/BST/B&amp;W.</div></div>
        <div class="hlp-flow-arrow"><i class="bi bi-arrow-right"></i></div>
        <div class="hlp-flow-step"><div class="hlp-flow-num">3</div><div><strong>Refresh</strong><br>Every 5 min: charts, futures trend, OI/OBV/IV scan, advance-decline, component scores → composite score.</div></div>
        <div class="hlp-flow-arrow"><i class="bi bi-arrow-right"></i></div>
        <div class="hlp-flow-step"><div class="hlp-flow-num">4</div><div><strong>Score Gauge</strong><br>Colour-coded gauge (red → green) shows overall directional conviction. Use with chart for entry timing.</div></div>
      </div>

      <div class="hlp-callout hlp-callout-blue">
        <i class="bi bi-info-circle-fill"></i>
        <span>Always use the score as a <strong>filter</strong>, not a signal. High score = conditions aligned for a trade, not a guarantee. Confirm with price action on the chart.</span>
      </div>

      <h4 class="hlp-h4">Floating Toolbar — Tools at a Glance</h4>
      <table class="hlp-table">
        <thead><tr><th>Icon</th><th>Tool</th><th>Purpose</th></tr></thead>
        <tbody>
          <tr><td><i class="bi bi-grid-3x3-gap-fill"></i></td><td>Chart Grid</td><td>Multi-instrument chart grid for side-by-side price comparison</td></tr>
          <tr><td><i class="bi bi-calendar-week"></i></td><td>9:15 Backtest</td><td>~1 year day-wise backtest of 9:15 opening candle combo edge (win rate, P/L, VIX split)</td></tr>
          <tr><td><i class="bi bi-layers-fill"></i></td><td>OI Scanner</td><td>All-instrument OI compare matrix — CE/PE ΔOI + OBV + signal across all strikes</td></tr>
          <tr><td><i class="bi bi-bullseye"></i></td><td>Futures Accuracy</td><td>Historical accuracy of futures REMARK classification vs actual price move</td></tr>
          <tr><td><i class="bi bi-flag-fill"></i></td><td>Instrument Detail View</td><td>Deep-dive popup per instrument: price map, OI/OBV charts, OI matrix, futures, trade analysis</td></tr>
          <tr><td><i class="bi bi-droplet-fill"></i></td><td>Commodities</td><td>GIFT NIFTY + CRUDEOILM intraday chart with ASO/AST/VIXL/VIXU level labels + OI table</td></tr>
          <tr><td><i class="bi bi-eye"></i></td><td>OI Viewer</td><td>DataTables OI/OBV/IV% across all strikes for every F&amp;O stock</td></tr>
          <tr><td><i class="bi bi-list-ul"></i></td><td>Stock Viewer</td><td>Side-by-side chart + OI + futures for filtered stock list</td></tr>
          <tr><td><i class="bi bi-graph-up"></i></td><td>Market Quotes</td><td>Live quote analyzer with sector/index breadth view</td></tr>
          <tr><td><i class="bi bi-bar-chart-steps"></i></td><td>Max Pain / GEX</td><td>Max pain level and gamma exposure chart across strikes</td></tr>
          <tr><td><i class="bi bi-clipboard-check"></i></td><td>Pre-Trade Checklist</td><td>Step-by-step checklist before entering a trade + per-instrument score table + trade recommendation</td></tr>
          <tr><td><i class="bi bi-gear-fill"></i></td><td>Settings</td><td>Theme, row height, refresh interval, display options</td></tr>
          <tr><td><i class="bi bi-question-circle-fill"></i></td><td>Help</td><td>This popup</td></tr>
          <tr><td><i class="bi bi-sliders"></i></td><td>Data Settings</td><td>Trading dates, load prices, clear storage, external links</td></tr>
        </tbody>
      </table>
    `);

    // ── TREND LABELS ────────────────────────────────────────────────────────────
    h += hlpPanel('trend', '<i class="bi bi-arrow-up-right-square"></i> Trend Labels', `
      <p class="hlp-intro">Each instrument is classified every scan cycle based on its <strong>current LTP vs
      today's open price</strong> (strike levels) and <strong>yesterday's close</strong> (VIX range). Multiple
      labels can be active simultaneously.</p>

      <h4 class="hlp-h4">Strike Level Layout (from Today's Open)</h4>
      <div class="hlp-strike-diagram">
        <div class="hlp-strike-row hlp-strike-ast"><span class="hlp-strike-badge hlp-green">AST</span> Above Strike Two = Open + S1 + S2 &nbsp;<em>(strong breakout)</em></div>
        <div class="hlp-strike-spacer"></div>
        <div class="hlp-strike-row hlp-strike-aso"><span class="hlp-strike-badge hlp-lime">ASO</span> Above Strike One = Open + S1 &nbsp;<em>(mild breakout)</em></div>
        <div class="hlp-strike-spacer"></div>
        <div class="hlp-strike-row hlp-strike-open"><span class="hlp-strike-badge hlp-muted">OPEN</span> Today's open price &nbsp;<em>(neutral reference)</em></div>
        <div class="hlp-strike-spacer"></div>
        <div class="hlp-strike-row hlp-strike-bso"><span class="hlp-strike-badge hlp-amber">BSO</span> Below Strike One = Open − S1 &nbsp;<em>(mild breakdown)</em></div>
        <div class="hlp-strike-spacer"></div>
        <div class="hlp-strike-row hlp-strike-bst"><span class="hlp-strike-badge hlp-red">BST</span> Below Strike Two = Open − S1 − S2 &nbsp;<em>(strong breakdown)</em></div>
      </div>

      <p style="margin-top:8px;font-size:0.7rem;color:#7d8590;">S1 / S2 = NSE_STRIKE_DIFF values per instrument. Example: Nifty 50 uses S1=50, S2=100. Banknifty uses S1=100, S2=200.</p>

      <h4 class="hlp-h4">VIX Range Labels (from Yesterday's Close)</h4>
      <table class="hlp-table">
        <thead><tr><th>Label</th><th>Condition</th><th>Interpretation</th></tr></thead>
        <tbody>
          <tr><td><span class="hlp-pill hlp-green">VIXU</span></td><td>LTP ≥ prevClose + dailyVIXRange</td><td>Overextended up. Statistically unusual move for the day. Mean reversion risk.</td></tr>
          <tr><td><span class="hlp-pill hlp-red">VIXL</span></td><td>LTP ≤ prevClose − dailyVIXRange</td><td>Overextended down. Statistically unusual move for the day. Bounce risk.</td></tr>
        </tbody>
      </table>

      <h4 class="hlp-h4">9:15 Candle Classification</h4>
      <p style="font-size:0.72rem;">Stored in <code>VALID_BREAKOUT_NINE_FIFTEEN</code>. Set once at market open from the first 5-min candle's <em>close</em> vs the same ASO/AST/BSO/BST levels. Used in score and shown as chips on the stock header.</p>
      <table class="hlp-table">
        <thead><tr><th>Value</th><th>Score Contribution</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td><span class="hlp-pill hlp-green">AST</span></td><td>+2</td><td>Very bullish open — closed well above resistance at open</td></tr>
          <tr><td><span class="hlp-pill hlp-lime">ASO</span></td><td>+1</td><td>Mildly bullish open</td></tr>
          <tr><td><span class="hlp-pill hlp-amber">BSO</span></td><td>−1</td><td>Mildly bearish open</td></tr>
          <tr><td><span class="hlp-pill hlp-red">BST</span></td><td>−2</td><td>Very bearish open — closed well below support at open</td></tr>
          <tr><td><span class="hlp-pill hlp-muted">B/W</span></td><td>0</td><td>Between strikes — neutral, wait for breakout</td></tr>
        </tbody>
      </table>
    `);

    // ── OI ANALYSIS ─────────────────────────────────────────────────────────────
    h += hlpPanel('oi', '<i class="bi bi-bar-chart-fill"></i> OI Analysis', `
      <p class="hlp-intro"><strong>Open Interest (OI)</strong> = the total number of outstanding option contracts
      that have not been settled. It tells you how much money is positioned at each strike price.</p>

      <h4 class="hlp-h4">Reading OI Change (ΔOI)</h4>
      <table class="hlp-table">
        <thead><tr><th>OI Change</th><th>What it Means</th></tr></thead>
        <tbody>
          <tr><td><span class="hlp-pill hlp-green">CE OI ↑</span></td><td>New call contracts opened at this strike. Could be writers (selling calls) OR buyers (buying calls). Use IV to distinguish.</td></tr>
          <tr><td><span class="hlp-pill hlp-red">CE OI ↓</span></td><td>Call contracts being closed/unwound. Existing participants exiting positions.</td></tr>
          <tr><td><span class="hlp-pill hlp-green">PE OI ↑</span></td><td>New put contracts opened. Could be put writers (bullish) OR put buyers (bearish).</td></tr>
          <tr><td><span class="hlp-pill hlp-red">PE OI ↓</span></td><td>Put contracts being closed. Longs or shorts exiting.</td></tr>
        </tbody>
      </table>

      <div class="hlp-callout hlp-callout-amber">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span><strong>OI change alone is ambiguous</strong> — it cannot tell you whether contracts were opened by buyers or writers.
        That's why IV is layered on top (see the IV and Signals tabs).</span>
      </div>

      <h4 class="hlp-h4">Max Pain / Strike Significance</h4>
      <p style="font-size:0.72rem;">Strikes with very high OI are significant because large writers defend those levels. A strike with massive CE OI is a resistance ceiling (writers will sell into any rally there). A strike with massive PE OI is a support floor.</p>

      <h4 class="hlp-h4">OI Columns in the Viewer</h4>
      <table class="hlp-table">
        <thead><tr><th>Column</th><th>Definition</th></tr></thead>
        <tbody>
          <tr><td>CE Δ / PE Δ</td><td>Change in OI today vs yesterday's close OI (in lakh contracts)</td></tr>
          <tr><td>CE OBV / PE OBV</td><td>Cumulative On-Balance Volume (see OBV tab)</td></tr>
          <tr><td>CE IV% / PE IV%</td><td>Latest Implied Volatility for that option (see IV tab)</td></tr>
          <tr><td>STRIKE</td><td>Strike price. ATM (at-the-money) is highlighted in yellow.</td></tr>
        </tbody>
      </table>

      <h4 class="hlp-h4">ATM Weighting</h4>
      <p style="font-size:0.72rem;">ATM strikes carry <strong>2× weight</strong> in the per-strike OI signal scoring and <strong>3× weight</strong> in the PCR score — because the ATM strike is where the most active trading happens and has the highest gamma sensitivity.</p>
    `);

    // ── OBV ──────────────────────────────────────────────────────────────────────
    h += hlpPanel('obv', '<i class="bi bi-graph-up"></i> OBV', `
      <p class="hlp-intro"><strong>On-Balance Volume (OBV)</strong> is a cumulative volume indicator applied to
      the option's 5-min candles. It tracks whether volume is flowing in on up-ticks or down-ticks
      throughout the trading day.</p>

      <h4 class="hlp-h4">How It's Calculated</h4>
      <div class="hlp-algo">
        <div class="hlp-algo-step">Start from last candle of <em>previous day</em> as the reference close.</div>
        <div class="hlp-algo-step">For each 5-min candle today:<br>
          &nbsp;&nbsp;• If close <strong>&gt;</strong> prev close → <span class="hlp-pill hlp-green">OBV += volume</span><br>
          &nbsp;&nbsp;• If close <strong>&lt;</strong> prev close → <span class="hlp-pill hlp-red">OBV −= volume</span><br>
          &nbsp;&nbsp;• If close == prev close → OBV unchanged</div>
        <div class="hlp-algo-step">OBV is cumulative — it builds throughout the day.</div>
      </div>

      <h4 class="hlp-h4">Interpreting the Cumulative Sign</h4>
      <table class="hlp-table">
        <thead><tr><th>OBV Value</th><th>Interpretation</th></tr></thead>
        <tbody>
          <tr><td><span class="hlp-pill hlp-green">CE OBV &gt; 0</span></td><td>Net buying volume flowed into calls on up-ticks. Buyers have been active all day = bullish intent.</td></tr>
          <tr><td><span class="hlp-pill hlp-red">CE OBV &lt; 0</span></td><td>Net selling volume on down-ticks. Writers have been dominant all day = bearish resistance building.</td></tr>
          <tr><td><span class="hlp-pill hlp-green">PE OBV &gt; 0</span></td><td>Net buying into puts on up-ticks = put buyers active. Hedgers/bears positioned = bearish signal.</td></tr>
          <tr><td><span class="hlp-pill hlp-red">PE OBV &lt; 0</span></td><td>Put writers dominant all day = selling puts = support building = bullish signal.</td></tr>
        </tbody>
      </table>

      <div class="hlp-callout hlp-callout-blue">
        <i class="bi bi-info-circle-fill"></i>
        <span>OBV is the <strong>fallback signal</strong>. When IV data is available (spot candles fetched successfully),
        IV overrides OBV in the scoring. OBV can be distorted by delta-driven moves in the option price
        — IV isolates the volatility premium component more cleanly.</span>
      </div>

      <h4 class="hlp-h4">Why Cumulative Sign, Not Delta?</h4>
      <p style="font-size:0.72rem;">An earlier bug used the <em>delta</em> between the last two OBV candles. That only showed the last 5-min tick direction — if cumulative OBV was −500 (bearish all day) but the last candle added +50, the delta was positive and showed a false bullish signal. Using the <em>cumulative sign</em> gives the full day's net positioning intent.</p>
    `);

    // ── IV ───────────────────────────────────────────────────────────────────────
    h += hlpPanel('iv', '<i class="bi bi-lightning-fill"></i> Implied Volatility (IV)', `
      <p class="hlp-intro"><strong>Implied Volatility (IV)</strong> is the market's expectation of future price
      movement embedded in the option premium. It's the key signal to separate <em>option buyers</em>
      (paying premium) from <em>option writers</em> (collecting premium).</p>

      <h4 class="hlp-h4">How IV is Computed Here</h4>
      <div class="hlp-algo">
        <div class="hlp-algo-step"><strong>Formula:</strong> Black-Scholes inversion — solve for σ (IV) given:<br>
          &nbsp;&nbsp;• Option LTP = candle close (c[4]) from Kite historical 5-min data<br>
          &nbsp;&nbsp;• Spot price = underlying instrument close at same timestamp<br>
          &nbsp;&nbsp;• Strike = from OPTION_STRIKE_LIST<br>
          &nbsp;&nbsp;• Time to expiry T = (expiry date − candle timestamp) / 365<br>
          &nbsp;&nbsp;• Risk-free rate r = 6.5% (India 91-day T-bill)</div>
        <div class="hlp-algo-step"><strong>Method:</strong> Bisection search — iterates 100 times between 0.1% and 500% IV until the theoretical price matches market price within ±0.001.</div>
        <div class="hlp-algo-step"><strong>Output:</strong> IV series stored as % per 5-min candle (e.g. 24.5 means 24.5% annualised IV). Null when spot data unavailable.</div>
      </div>

      <h4 class="hlp-h4">What IV Change Tells You</h4>
      <table class="hlp-table">
        <thead><tr><th>IV Change</th><th>Who's Active</th><th>Market Implication</th></tr></thead>
        <tbody>
          <tr>
            <td><span class="hlp-pill hlp-red">CE IV ↑</span></td>
            <td><strong>Call buyers</strong> paying more premium</td>
            <td>Demand for calls rising. Traders expecting upside breakout. <span class="hlp-pill hlp-green">Bullish</span></td>
          </tr>
          <tr>
            <td><span class="hlp-pill hlp-green">CE IV ↓</span></td>
            <td><strong>Call writers</strong> selling premium</td>
            <td>Supply of calls increasing. Writers capping upside = resistance forming. <span class="hlp-pill hlp-red">Bearish</span></td>
          </tr>
          <tr>
            <td><span class="hlp-pill hlp-red">PE IV ↑</span></td>
            <td><strong>Put buyers</strong> paying more premium</td>
            <td>Demand for downside protection rising. Traders hedging fall. <span class="hlp-pill hlp-red">Bearish</span></td>
          </tr>
          <tr>
            <td><span class="hlp-pill hlp-green">PE IV ↓</span></td>
            <td><strong>Put writers</strong> selling premium</td>
            <td>Writers building put floor. Confident the market won't fall below this strike. <span class="hlp-pill hlp-green">Bullish</span></td>
          </tr>
        </tbody>
      </table>

      <div class="hlp-callout hlp-callout-amber">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span>IV threshold is <strong>±0.3%</strong> to filter noise. Changes smaller than 0.3% are treated as neutral and IV is not used to override OBV for that candle.</span>
      </div>

      <h4 class="hlp-h4">Why IV is Better than OBV Alone</h4>
      <p style="font-size:0.72rem;">Option prices move with the underlying simply due to <strong>delta</strong> — even if no writing or buying is happening. OBV treats these delta-driven price ticks as volume signals, which can give false readings. IV strips out the delta component and isolates the <em>volatility premium</em> — which only changes when buyers or writers are genuinely active.</p>
    `);

    // ── SIGNALS ──────────────────────────────────────────────────────────────────
    h += hlpPanel('signals', '<i class="bi bi-signpost-2-fill"></i> OI + IV Signals', `
      <p class="hlp-intro">Each strike is scored by combining OI change direction with IV change direction.
      These combinations directly reveal <em>who is driving activity</em> at that strike.</p>

      <h4 class="hlp-h4">The 8 Core Combinations</h4>
      <table class="hlp-table">
        <thead>
          <tr>
            <th>OI</th><th>IV</th><th>Signal</th><th>Score</th><th>Directional Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr class="hlp-row-bear">
            <td>CE OI ↑</td><td>CE IV ↓</td>
            <td><span class="hlp-pill hlp-red">CE WRITE</span></td>
            <td>−1</td>
            <td>Call writers selling premium → <strong>resistance building</strong>. Bears confident price won't cross this strike.</td>
          </tr>
          <tr class="hlp-row-bull">
            <td>CE OI ↑</td><td>CE IV ↑</td>
            <td><span class="hlp-pill hlp-green">CE BUY</span></td>
            <td>+1</td>
            <td>Call buyers paying premium → <strong>breakout expectation</strong>. Bulls accumulating upside positions.</td>
          </tr>
          <tr class="hlp-row-bull">
            <td>PE OI ↑</td><td>PE IV ↓</td>
            <td><span class="hlp-pill hlp-green">PE WRITE</span></td>
            <td>+1</td>
            <td>Put writers selling premium → <strong>support floor building</strong>. Bears not expecting further downside.</td>
          </tr>
          <tr class="hlp-row-bear">
            <td>PE OI ↑</td><td>PE IV ↑</td>
            <td><span class="hlp-pill hlp-red">PE BUY</span></td>
            <td>−1</td>
            <td>Put buyers paying for downside protection → <strong>hedging a fall</strong>. Bearish positioning.</td>
          </tr>
          <tr class="hlp-row-bear">
            <td>CE OI ↑ + PE OI ↑</td><td>CE IV ↓ + PE IV ↑</td>
            <td><span class="hlp-pill hlp-red" style="font-size:0.65rem;">STRONG RESISTANCE</span></td>
            <td>−2</td>
            <td><strong>CE WRITE + PE BUY</strong> at same strike. Both sides confirm: writers capping upside AND buyers hedging downside. Very strong wall above.</td>
          </tr>
          <tr class="hlp-row-bull">
            <td>CE OI ↑ + PE OI ↑</td><td>CE IV ↑ + PE IV ↓</td>
            <td><span class="hlp-pill hlp-green" style="font-size:0.65rem;">STRONG SUPPORT</span></td>
            <td>+2</td>
            <td><strong>CE BUY + PE WRITE</strong> at same strike. Both sides confirm: call buyers expecting rally AND put writers confident of floor. Very strong floor below.</td>
          </tr>
          <tr>
            <td>CE OI ↓</td><td>—</td>
            <td><span class="hlp-pill hlp-muted">CE UNWIND</span></td>
            <td>0 / +0.5</td>
            <td>Existing call positions closing. Resistance weakening if CE writers exit = mildly bullish.</td>
          </tr>
          <tr>
            <td>PE OI ↓</td><td>—</td>
            <td><span class="hlp-pill hlp-muted">PE UNWIND</span></td>
            <td>0 / −0.5</td>
            <td>Existing put positions closing. Support weakening if PE writers exit = mildly bearish.</td>
          </tr>
        </tbody>
      </table>

      <h4 class="hlp-h4">ATM vs OTM Weighting</h4>
      <p style="font-size:0.72rem;">ATM strike scores are multiplied by <strong>2×</strong> before being added to the instrument OI score, because ATM options have the highest gamma and most active trading — their signals are the most significant.</p>

      <h4 class="hlp-h4">Signal Priority</h4>
      <ol class="hlp-list">
        <li><strong>Strong Resistance / Strong Support</strong> — both CE and PE signals agree at same strike (highest confidence)</li>
        <li><strong>CE WRITE or PE BUY alone</strong> — bearish single-side signal</li>
        <li><strong>PE WRITE or CE BUY alone</strong> — bullish single-side signal</li>
        <li><strong>OBV fallback</strong> — when IV not available, cumulative OBV sign used instead</li>
      </ol>
    `);

    // ── SCORE SYSTEM ─────────────────────────────────────────────────────────────
    h += hlpPanel('score', '<i class="bi bi-speedometer"></i> Score System', `
      <p class="hlp-intro">The composite score is the <strong>sum of all sub-scores</strong> computed during
      each refresh cycle. A higher positive score = more bullish conditions aligned. Negative = bearish.</p>

      <h4 class="hlp-h4">Score Components</h4>
      <table class="hlp-table">
        <thead><tr><th>Variable</th><th>Source</th><th>Range</th><th>What Drives It</th></tr></thead>
        <tbody>
          <tr><td><code>ALL_9_15_CLOSE_SCORE</code></td><td>9:15 scan across all stocks</td><td>±1</td><td>More ASO/AST vs BSO/BST at market open</td></tr>
          <tr><td><code>NIFTY_50_9_15_CLOSE_SCORE</code></td><td>Nifty 50 first candle</td><td>±1</td><td>Where Nifty closed in first 5 min</td></tr>
          <tr><td><code>NIFTY_BANK_9_15_CLOSE_SCORE</code></td><td>Bank Nifty first candle</td><td>±1</td><td>Where BankNifty closed in first 5 min</td></tr>
          <tr><td><code>GIFT_NIFTY_9_15_CLOSE_SCORE</code></td><td>Gift Nifty open signal</td><td>±1</td><td>Gift Nifty open vs strikes</td></tr>
          <tr><td><code>SENSEX_9_15_CLOSE_SCORE</code></td><td>Sensex first candle</td><td>±1</td><td>Sensex first candle position</td></tr>
          <tr><td><code>RELIANCE_9_15_CLOSE_SCORE</code></td><td>Reliance first candle</td><td>±1</td><td>Heavyweight stock open direction</td></tr>
          <tr><td><code>HDFCBANK_9_15_CLOSE_SCORE</code></td><td>HDFC Bank first candle</td><td>±1</td><td>Bank heavyweight open direction</td></tr>
          <tr><td><code>ALL/N50/BN_ADVANCE_DECLINE_SCORE</code></td><td>A/D scanner</td><td>±1 each</td><td>ASO count vs BSO count across stocks</td></tr>
          <tr><td><code>ALL/N50/BN_FUTURES_TREND_SCORE</code></td><td>Futures scanner</td><td>±1 each</td><td>LONG+SHORT_COVERING vs SHORT+UNWINDING count</td></tr>
          <tr><td><code>NIFTY_50_OI_OBV_SCORE</code></td><td>Nifty option chain OI+IV</td><td>±N</td><td>Sum of per-strike signal scores (see Signals tab)</td></tr>
          <tr><td><code>NIFTY_BANK_OI_OBV_SCORE</code></td><td>BankNifty option chain</td><td>±N</td><td>Same as above for BankNifty</td></tr>
          <tr><td><code>RELIANCE_OI_OBV_SCORE</code></td><td>Reliance option chain</td><td>±N</td><td>OI+IV score for Reliance options</td></tr>
          <tr><td><code>HDFCBANK_OI_OBV_SCORE</code></td><td>HDFC Bank option chain</td><td>±N</td><td>OI+IV score for HDFC Bank options</td></tr>
          <tr><td><code>ICICIBANK_OI_OBV_SCORE</code></td><td>ICICI Bank option chain</td><td>±N</td><td>OI+IV score for ICICI Bank options</td></tr>
          <tr><td><code>NIFTY_50_COMPONENT_SCORE</code></td><td>Top-10 Nifty 50 stocks</td><td>float</td><td>Weighted sum of (9:15 + trend + futures + OI) × weight%</td></tr>
          <tr><td><code>NIFTY_BANK_COMPONENT_SCORE</code></td><td>Top-10 BankNifty stocks</td><td>float</td><td>Same, weighted by Bank Nifty constituent weights</td></tr>
        </tbody>
      </table>

      <h4 class="hlp-h4">Score Gauge Colour Thresholds</h4>
      <div class="hlp-gauge-row">
        <div class="hlp-gauge-chip hlp-gauge-red"><span class="hlp-gauge-val">&lt; 0</span><span class="hlp-gauge-lbl">Bearish</span></div>
        <div class="hlp-gauge-chip hlp-gauge-orange"><span class="hlp-gauge-val">1 – 4</span><span class="hlp-gauge-lbl">Mild Bull</span></div>
        <div class="hlp-gauge-chip hlp-gauge-yellow"><span class="hlp-gauge-val">5 – 7</span><span class="hlp-gauge-lbl">Moderate</span></div>
        <div class="hlp-gauge-chip hlp-gauge-green"><span class="hlp-gauge-val">≥ 8</span><span class="hlp-gauge-lbl">Strong Bull</span></div>
      </div>

      <h4 class="hlp-h4">computeInstrumentScore(name)</h4>
      <p style="font-size:0.72rem;">Returns <code>{ nine_fifteen, current_trend, futures_trend, oi_obv, total }</code> for any instrument from cached data — no API call. Used by component score computation. <code>current_trend</code> is live LTP vs strike levels: AST=+2, ASO=+1, BSO=−1, BST=−2.</p>
    `);

    // ── PCR ───────────────────────────────────────────────────────────────────────
    h += hlpPanel('pcr', '<i class="bi bi-pie-chart-fill"></i> Put-Call Ratio (PCR)', `
      <p class="hlp-intro"><strong>PCR = Total PE OI ÷ Total CE OI</strong> across all scanned strikes.
      It measures the balance of put vs call open interest — a proxy for market sentiment.</p>

      <h4 class="hlp-h4">Standing PCR (Total Positions)</h4>
      <table class="hlp-table">
        <thead><tr><th>PCR Value</th><th>Interpretation</th><th>Signal</th></tr></thead>
        <tbody>
          <tr><td><strong>PCR &gt; 1.2</strong></td><td>Far more puts than calls outstanding. Puts dominant = many hedged or short positions.</td><td><span class="hlp-pill hlp-green">Contrarian Bullish</span><br><small>Extreme pessimism often = market near a bottom. Too many shorts = fuel for short covering rally.</small></td></tr>
          <tr><td><strong>PCR ~1.0</strong></td><td>Balanced put/call OI. Market participants are neutral.</td><td><span class="hlp-pill hlp-muted">Neutral</span></td></tr>
          <tr><td><strong>PCR &lt; 0.7</strong></td><td>Far more calls than puts. Calls dominant = many bullish bets placed.</td><td><span class="hlp-pill hlp-red">Contrarian Bearish</span><br><small>Extreme optimism often = market near a top. Too many longs = fuel for selling.</small></td></tr>
        </tbody>
      </table>

      <h4 class="hlp-h4">Change PCR (Today's New Positions)</h4>
      <p style="font-size:0.72rem;"><strong>chPCR = Sum(ΔPE OI today) ÷ Sum(ΔCE OI today)</strong> — only new contracts opened today.</p>
      <table class="hlp-table">
        <thead><tr><th>chPCR</th><th>Interpretation</th></tr></thead>
        <tbody>
          <tr><td><strong>chPCR &gt; 1.5</strong></td><td>Today's new PE build-up >> CE build-up. Fresh put writers OR put buyers dominant today. Contrarian: if put writers → bullish. If put buyers → bearish. Confirm with IV.</td></tr>
          <tr><td><strong>chPCR &lt; 0.7</strong></td><td>Today's new CE build-up >> PE. Call writers OR buyers dominant. Confirm with IV.</td></tr>
          <tr><td><strong>chPCR ~1.0</strong></td><td>Balanced new activity on both sides. No clear directional positioning today.</td></tr>
        </tbody>
      </table>

      <div class="hlp-callout hlp-callout-blue">
        <i class="bi bi-info-circle-fill"></i>
        <span>Always read PCR in context of IV. High PCR + PE IV falling = put writers building floor = bullish. High PCR + PE IV rising = put buyers hedging a fall = bearish.</span>
      </div>
    `);

    // ── FUTURES ──────────────────────────────────────────────────────────────────
    h += hlpPanel('futures', '<i class="bi bi-graph-up"></i> Futures Trend', `
      <p class="hlp-intro">Futures OI and price change together reveal the <em>intent</em> behind each move.
      The <strong>remark system</strong> classifies each instrument into one of these states every refresh.</p>

      <h4 class="hlp-h4">Remark Classification Rules</h4>
      <table class="hlp-table">
        <thead><tr><th>Price</th><th>OI</th><th>Remark</th><th>Score</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr class="hlp-row-bull"><td>↑ Up</td><td>↑ Up</td><td><span class="hlp-pill hlp-green">LONG</span></td><td>+1</td><td>Fresh long positions entering. Buyers paying up AND building OI. Most bullish confirmation.</td></tr>
          <tr class="hlp-row-bull"><td>↓ Down</td><td>↓ Down</td><td><span class="hlp-pill hlp-lime">SHORT COVERING</span></td><td>+1</td><td>Shorts closing positions. OI falling as price recovers. Temporarily bullish (short squeeze fuel).</td></tr>
          <tr><td>↑ Up</td><td>↓ Down</td><td><span class="hlp-pill hlp-amber">LONG UNWINDING</span></td><td>0</td><td>Longs exiting on a price rise. OI falls = participants cashing out gains. Weakening rally.</td></tr>
          <tr><td>↑ Up</td><td>≈ Flat</td><td><span class="hlp-pill hlp-muted">BULLS CONSOLIDATING</span></td><td>+1</td><td>Price holding gains without new positions. Pause before continuation.</td></tr>
          <tr class="hlp-row-bear"><td>↓ Down</td><td>↑ Up</td><td><span class="hlp-pill hlp-red">SHORT</span></td><td>−1</td><td>Fresh short positions entering. Sellers driving price down AND building OI. Most bearish confirmation.</td></tr>
          <tr class="hlp-row-bear"><td>↓ Down</td><td>≈ Flat</td><td><span class="hlp-pill hlp-red">BEARS CONSOLIDATING</span></td><td>−1</td><td>Price holding losses without new positions. Pause before further decline.</td></tr>
          <tr><td>↑ Up</td><td>↑ Up</td><td><span class="hlp-pill hlp-amber">GAMBLING / EVENT</span></td><td>0</td><td>Large OI spike + price move on news/event. Not technically-driven — treat with caution.</td></tr>
        </tbody>
      </table>

      <h4 class="hlp-h4">VWAP Trend</h4>
      <p style="font-size:0.72rem;"><strong>VWAP (Volume Weighted Average Price)</strong> is computed from intraday 5-min candles:
      VWAP = Σ(typical price × volume) / Σ(volume). Typical price = (H + L + C) / 3.<br><br>
      • Futures LTP <strong>&gt; VWAP</strong> → bullish intraday momentum (institutions holding longs above VWAP)<br>
      • Futures LTP <strong>&lt; VWAP</strong> → bearish intraday momentum (institutions selling below VWAP)</p>

      <h4 class="hlp-h4">Premium (Contango / Backwardation)</h4>
      <p style="font-size:0.72rem;"><strong>Premium = Futures LTP − Spot LTP</strong>.<br>
      • <span class="hlp-pill hlp-green">Positive premium</span> (contango) = futures trading above spot. Normal/healthy. Cost of carry.<br>
      • <span class="hlp-pill hlp-red">Negative premium</span> (backwardation) = futures below spot. Unusual. Strong selling pressure in futures.<br>
      • Premium is not computed for CRUDEOILM/USDINR (no spot instrument on same exchange).</p>
    `);

    // ── VIX RANGE ────────────────────────────────────────────────────────────────
    h += hlpPanel('vix', '<i class="bi bi-activity"></i> VIX Range', `
      <p class="hlp-intro"><strong>India VIX</strong> (token 264969) represents the market's expected
      <em>annualised volatility</em> in percentage terms. Groot converts this into an expected
      price range for different time horizons.</p>

      <h4 class="hlp-h4">The Formula</h4>
      <div class="hlp-formula">
        <div class="hlp-formula-line"><strong>Range</strong> = prevClose × (VIX% / √tradingDays) / 100</div>
        <div class="hlp-formula-line"><strong>Upper</strong> = prevClose + Range &nbsp;→ <span class="hlp-pill hlp-green">VIXU</span></div>
        <div class="hlp-formula-line"><strong>Lower</strong> = prevClose − Range &nbsp;→ <span class="hlp-pill hlp-red">VIXL</span></div>
      </div>

      <h4 class="hlp-h4">Trading Days Denominators</h4>
      <table class="hlp-table">
        <thead><tr><th>Horizon</th><th>√(tradingDays)</th><th>Calculation</th></tr></thead>
        <tbody>
          <tr><td><strong>Daily</strong></td><td>√246</td><td>365 days − 104 weekends − 15 holidays = 246 trading days per year</td></tr>
          <tr><td><strong>Weekly</strong></td><td>√52</td><td>52 trading weeks per year</td></tr>
          <tr><td><strong>Monthly</strong></td><td>√12</td><td>12 trading months per year</td></tr>
        </tbody>
      </table>

      <h4 class="hlp-h4">Example (Nifty, VIX = 15, prevClose = 22000)</h4>
      <div class="hlp-formula">
        <div class="hlp-formula-line">Daily range = 22000 × 15 / (100 × √246) = 22000 × 15 / 1565 ≈ <strong>±211 points</strong></div>
        <div class="hlp-formula-line">VIXU = 22000 + 211 = <strong>22211</strong> &nbsp;|&nbsp; VIXL = 22000 − 211 = <strong>21789</strong></div>
      </div>

      <div class="hlp-callout hlp-callout-amber">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span>If Nifty trades <strong>above VIXU</strong> intraday → the move is statistically large for the day. Mean reversion is likely — consider cautious longs or partial exits. Similarly, if below VIXL → bounce is more probable than continuation.</span>
      </div>

      <h4 class="hlp-h4">Commodity VIX Proxies</h4>
      <table class="hlp-table">
        <thead><tr><th>MCX Instrument</th><th>Volatility Index Used</th></tr></thead>
        <tbody>
          <tr><td>CRUDEOIL / CRUDEOILM</td><td>OVX (CBOE Crude Oil Volatility)</td></tr>
          <tr><td>GOLD / GOLDM</td><td>GVZ (CBOE Gold Volatility)</td></tr>
          <tr><td>SILVER / SILVERM</td><td>VXSLV (CBOE Silver Volatility)</td></tr>
          <tr><td>NATURALGAS / NATGASMINI</td><td>India VIX (proxy)</td></tr>
          <tr><td>USDINR</td><td>4.85% fixed (FX implied vol)</td></tr>
        </tbody>
      </table>
    `);

    // ── TRADE PLAN ──────────────────────────────────────────────────────────────
    h += hlpPanel('tradeplan', '<i class="bi bi-journal-check"></i> Trade Plan', `

      <div class="hlp-callout hlp-callout-amber">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span>The score alone is <strong>not a trade trigger</strong>. It is a confidence meter.
        Enter only when the score, SIGNAL, ATR direction, A/D ratio and strategyMap level
        all point the same way at the same time.</span>
      </div>

      <div class="hlp-callout hlp-callout-blue" style="margin-bottom:10px;">
        <i class="bi bi-clipboard-check"></i>
        <span>Use the <strong>Pre-Trade Checklist</strong> (<i class="bi bi-clipboard-check"></i> in the floating toolbar) before every trade — it runs all 7 checks automatically and shows the market signal + per-instrument score table in one view.</span>
      </div>

      <h4 class="hlp-h4"><i class="bi bi-sunrise"></i> Step 1 — Pre-market (before 9:15)</h4>
      <table class="hlp-table">
        <thead><tr><th>Check</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td>VIX level</td><td>If VIX &gt; 20 → reduce position size by <strong>half</strong>. Wide stops needed.</td></tr>
          <tr><td>Gift Nifty</td><td>+100 pts gap up → ASO levels shift up. Don't short the open blindly.</td></tr>
          <tr><td>Prev close vs today's open</td><td>Gap % tells you trending day vs mean-revert day.</td></tr>
          <tr><td>FII/DII flow (NSE site)</td><td>Net FII buyer = bullish bias for the day. Net seller = bearish bias.</td></tr>
        </tbody>
      </table>

      <h4 class="hlp-h4"><i class="bi bi-eye"></i> Step 2 — 9:15 to 9:45 — OBSERVE ONLY, no trades</h4>
      <table class="hlp-table">
        <thead><tr><th>Watch</th><th>What to look for</th></tr></thead>
        <tbody>
          <tr><td>9:15 pills (N50 / SX / BN)</td><td>All 3 = ASO → highest probability bullish setup. All 3 = BSO → bearish setup.</td></tr>
          <tr><td>Score at 9:20</td><td>First reading after open candle forms. Baseline conviction level.</td></tr>
          <tr><td>A/D ratio</td><td>A &gt; D by 2:1 for longs. D &gt; A by 2:1 for shorts.</td></tr>
          <tr><td>Futures trend</td><td>LONG or BULLS_CONSOLIDATING confirms bullish bias.</td></tr>
        </tbody>
      </table>

      <h4 class="hlp-h4"><i class="bi bi-crosshair"></i> Step 3 — Entry window: 9:45 to 11:30</h4>
      <p style="font-size:0.72rem;color:#7d8590;margin-bottom:6px;">Enter <strong>only if ALL of these are true</strong>. If even one conflicts — wait for next 5-min refresh.</p>
      <table class="hlp-table">
        <thead><tr><th>Condition</th><th>Long threshold</th><th>Short threshold</th></tr></thead>
        <tbody>
          <tr><td>Score</td><td>≥ 7</td><td>≤ −3</td></tr>
          <tr><td>SIGNAL card</td><td>BUY or STRONG BUY</td><td>SELL or STRONG SELL</td></tr>
          <tr><td>strategyMap level</td><td>"at BSO/BST" = price near support → better R:R</td><td>"at ASO/AST" = price near resistance</td></tr>
          <tr><td>Futures trend</td><td>LONG or BULLS_CONSOLIDATING</td><td>SHORT or BEARS_CONSOLIDATING</td></tr>
          <tr><td>OI signal</td><td>PE writers active (CE OI falling, PE OI rising)</td><td>CE writers active (PE OI falling, CE OI rising)</td></tr>
          <tr><td>A/D N50</td><td>A &gt; D by at least 2:1 ratio</td><td>D &gt; A by at least 2:1 ratio</td></tr>
          <tr><td>ATR direction</td><td>LONG with ≥ 3/4 votes</td><td>SHORT with ≥ 3/4 votes</td></tr>
          <tr><td>VIX position</td><td>Price not at or above VIXU</td><td>Price not at or below VIXL</td></tr>
        </tbody>
      </table>

      <div class="hlp-callout hlp-callout-blue" style="margin-top:8px;">
        <i class="bi bi-info-circle-fill"></i>
        <span><strong>Never enter at ASO.</strong> That level is already extended. Wait for a pullback to BSO/BST for long entries — that's where R:R is best.</span>
      </div>

      <h4 class="hlp-h4"><i class="bi bi-calculator"></i> Step 4 — Position Sizing</h4>
      <div class="hlp-formula">
        <div class="hlp-formula-line">Risk per trade = <strong>0.5% of total capital</strong></div>
        <div class="hlp-formula-line">Position size = Risk amount ÷ (Entry price − ATR SL)</div>
        <div class="hlp-formula-line">Example: Capital ₹5,00,000 → Risk ₹2,500 → ATR SL 50 pts → 2,500 ÷ 50 = <strong>50 units (1 lot)</strong></div>
      </div>

      <h4 class="hlp-h4"><i class="bi bi-arrow-left-right"></i> Step 5 — Trade Execution</h4>
      <table class="hlp-table">
        <thead><tr><th>Level</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td>Entry</td><td>At BSO/BST for long, at ASO/AST for short (as shown in SIGNAL panel)</td></tr>
          <tr><td>Stop Loss</td><td>ATR SL badge value (already computed in strip)</td></tr>
          <tr><td>Target 1</td><td>ATR T1 — book <strong>50% position</strong> here</td></tr>
          <tr><td>Target 2</td><td>ATR T2 — trail remaining with 15-min candle SL</td></tr>
        </tbody>
      </table>

      <h4 class="hlp-h4"><i class="bi bi-arrow-repeat"></i> Step 6 — During the trade (every refresh)</h4>
      <table class="hlp-table">
        <thead><tr><th>Event</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td>Score drops below 4</td><td><strong>Exit immediately</strong> — don't wait for SL hit</td></tr>
          <tr><td>Futures flips to BEARS_CONSOLIDATING</td><td>Tighten SL to breakeven</td></tr>
          <tr><td>A/D ratio flips (D &gt; A)</td><td>Exit half position</td></tr>
          <tr><td>VIX spikes suddenly</td><td>Exit full position</td></tr>
          <tr><td>Score rising cycle after cycle</td><td>Momentum building — hold, trail SL</td></tr>
          <tr><td>Score stuck in orange 1–4</td><td>Chop zone — avoid fresh entries</td></tr>
        </tbody>
      </table>

      <h4 class="hlp-h4"><i class="bi bi-shield-check"></i> Hard Rules</h4>
      <table class="hlp-table">
        <thead><tr><th>#</th><th>Rule</th></tr></thead>
        <tbody>
          <tr><td>1</td><td><strong>Max 2 trades per day</strong> — overtrading destroys edge</td></tr>
          <tr><td>2</td><td><strong>No trades after 1:30 PM</strong> — low volume, erratic moves</td></tr>
          <tr><td>3</td><td><strong>No trade on expiry</strong> if score &lt; 6 — premium decay distorts OI signals</td></tr>
          <tr><td>4</td><td>If first trade hits SL → wait for score to reset to ≥ 7 before second trade</td></tr>
          <tr><td>5</td><td>If score stays in orange (1–4) all morning → <strong>no trade day</strong>, close dashboard</td></tr>
          <tr><td>6</td><td>strategyMap = <code>B/W-B/W-B/W</code> (Sideways) → no trade regardless of score</td></tr>
          <tr><td>7</td><td>Score and SIGNAL disagree → <strong>wait</strong>, never force a trade</td></tr>
          <tr><td>8</td><td>Never override ATR SL because "it feels strong" — the math is the math</td></tr>
        </tbody>
      </table>

      <h4 class="hlp-h4"><i class="bi bi-graph-up"></i> Score Direction — more important than the number</h4>
      <table class="hlp-table">
        <thead><tr><th>Pattern</th><th>Interpretation</th></tr></thead>
        <tbody>
          <tr><td>Score rising: 2 → 5 → 8</td><td>Momentum building — consider entering long</td></tr>
          <tr><td>Score falling: 7 → 4 → 1</td><td>Momentum fading — tighten SL or avoid longs</td></tr>
          <tr><td>Score ≥ 8 holding steady</td><td>Strong trend — ride it, trail SL</td></tr>
          <tr><td>Score flips negative suddenly</td><td>Trend reversal — exit or reverse</td></tr>
          <tr><td>Score stuck in orange 1–4</td><td>Chop — no edge, sit out</td></tr>
        </tbody>
      </table>

      <h4 class="hlp-h4"><i class="bi bi-clock-history"></i> Time-of-day Filter</h4>
      <table class="hlp-table">
        <thead><tr><th>Window</th><th>Character</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td>9:15 – 9:45</td><td>High volatility, price discovery</td><td>Observe only — no entries</td></tr>
          <tr><td>9:45 – 11:30</td><td>Best trend window</td><td>Primary entry window</td></tr>
          <tr><td>11:30 – 1:30</td><td>Lunch lull, low volume</td><td>Trail existing trades only</td></tr>
          <tr><td>1:30 – 2:30</td><td>Institutional rebalancing</td><td>Second opportunity if signals realign</td></tr>
          <tr><td>After 2:30</td><td>Expiry/closing activity</td><td>No new entries, close open positions</td></tr>
        </tbody>
      </table>

      <div class="hlp-callout hlp-callout-blue">
        <i class="bi bi-lightbulb-fill"></i>
        <span>The alignment of <strong>score + SIGNAL + ATR direction + A/D ratio + strategyMap level</strong>
        all pointing the same way happens only <strong>2–3 times a week</strong>. Those are the only trades worth taking.</span>
      </div>
    `);

    // ── TOOLS ────────────────────────────────────────────────────────────────────
    h += hlpPanel('tools', '<i class="bi bi-tools"></i> Tools Reference', `

      <h4 class="hlp-h4"><i class="bi bi-clipboard-check"></i> Pre-Trade Checklist</h4>
      <p style="font-size:0.72rem;">Opens via the <i class="bi bi-clipboard-check"></i> button in the floating toolbar. Reads all live score globals — no API call needed. Shows three sections:</p>
      <table class="hlp-table">
        <thead><tr><th>Section</th><th>Content</th></tr></thead>
        <tbody>
          <tr><td><strong>A · Market Checklist</strong></td><td>7 numbered steps with green/amber/red dot: VIX regime → 9:15 candle alignment → Advance/Decline → Futures Trend → OI/OBV → Component Score → Composite Score</td></tr>
          <tr><td><strong>B · Trade Recommendation</strong></td><td>Market signal (STRONG BUY / BUY / WAIT / SELL / STRONG SELL / NO TRADE) with reason + plain-English trade action (e.g. "Buy NIFTY CE at pullback to ASO/BSO")</td></tr>
          <tr><td><strong>C · Instrument Scores</strong></td><td>Table for all 9 instruments: 9:15 / Trend / Futures / OI/OBV / Total columns + Action. Thresholds: total ≥ 4 → BUY CE, ≥ 2 → CE (wait ASO), ≥ 0 → WAIT, ≥ −3 → PE (wait BSO), &lt; −3 → BUY PE</td></tr>
        </tbody>
      </table>

      <h4 class="hlp-h4"><i class="bi bi-flag-fill"></i> Instrument Detail View</h4>
      <p style="font-size:0.72rem;">Opens via <i class="bi bi-flag-fill"></i> or from any instrument row's expand button. Shows panels in this order:</p>
      <ol class="hlp-list" style="font-size:0.72rem;">
        <li><strong>Identity</strong> — name, LTP, zone badge (sticky at top of column while scrolling)</li>
        <li><strong>Price Action</strong> — LightweightCharts intraday chart with OPEN/ASO/AST/BSO/BST/VIXL/VIXU lines</li>
        <li><strong>OI/OBV</strong> — bar charts: CE ΔOI, PE ΔOI, CE OBV, PE OBV per strike, with x-axis strike labels</li>
        <li><strong>OI Matrix</strong> — compact signal heatmap across strikes (CE/PE ΔOI + signal + score per cell)</li>
        <li><strong>9:15 Breakout, Trend Probability, Futures, Weightage, Details, Trade Analysis, Risk Manager</strong></li>
      </ol>

      <h4 class="hlp-h4"><i class="bi bi-calendar-week"></i> 9:15 Backtest</h4>
      <p style="font-size:0.72rem;">~250 trading days (~1 year). For each day, classifies NIFTY/SENSEX/BANK 9:15 candle close into a 3-key combo (e.g. ASO-ASO-BSO). Looks up the combo in <code>GTB_STRAT_LOOKUP</code> and simulates an entry at that level.<br><br>
      <strong>Per-combo edge table</strong>: win rate, avg P/L, avg max-favourable, Low-VIX vs High-VIX split at median VIX.<br>
      <strong>Day-by-day table</strong>: actual P/L at 12:00, MFE/MAE, whether 1:1 TP or SL was hit first, entry and peak times.<br>
      Today's combo is highlighted. Fetches 5-min data in ≤95-day chunks (Kite 5-min limit = 100 days). Cached in localStorage.</p>

      <h4 class="hlp-h4"><i class="bi bi-layers-fill"></i> OI Scanner (OI Compare Matrix)</h4>
      <p style="font-size:0.72rem;">All instruments (main + weighted Nifty 50 / Bank Nifty constituents) in one horizontal table. Rows = instruments, columns = strikes around ATM. Each cell shows CE/PE ΔOI + OBV + signal badge + score.<br>
      Toggle between <strong>Detailed</strong> (full numbers) and <strong>Compact</strong> (heatmap colour only). Reads cached <code>INSTRUMENT_SCORE_MAP[name].oiData</code> — no fresh fetch on open.</p>

      <h4 class="hlp-h4"><i class="bi bi-droplet-fill"></i> Commodities</h4>
      <p style="font-size:0.72rem;">Shows GIFT NIFTY and CRUDEOILM panels. Level labels (OPEN / VIXL / VIXU / BST / BSO / ASO / AST) appear above each chart once the futures data is loaded. OI table shows CE/PE ΔOI per strike for CRUDEOILM. Popup is non-draggable (clicking titlebar won't move it).</p>
    `);

    // ── EXIT SIGNAL ───────────────────────────────────────────────────────────────
    h += hlpPanel('exit', '<i class="bi bi-door-open-fill"></i> Exit Signal', `
      <p class="hlp-intro">The <strong>EXIT signal banner</strong> appears below the LONG / SHORT position buttons in the left panel. It evaluates your declared position direction every refresh and fires when the market turns against it.</p>

      <h4 class="hlp-h4">How to Use</h4>
      <ol class="hlp-list">
        <li>Click <strong>LONG</strong> or <strong>SHORT</strong> after you enter a trade to declare your direction.</li>
        <li>The banner monitors conditions every 5-min refresh.</li>
        <li>When an exit condition is met, the banner turns red with a reason (e.g. "EXIT LONG — trend bearish (−1)").</li>
        <li>Click <strong>—</strong> (NONE) to reset after exiting.</li>
      </ol>

      <h4 class="hlp-h4">Exit Conditions</h4>
      <table class="hlp-table">
        <thead><tr><th>Position</th><th>Exit Fires When</th><th>Reason Shown</th></tr></thead>
        <tbody>
          <tr>
            <td><span class="hlp-pill hlp-green">LONG</span></td>
            <td>NIFTY 50 <code>current_trend &lt; 0</code> (LTP below BSO or BST)<br><em>OR</em><br>Both NIFTY 50 AND BANK NIFTY futures bearish (<code>n50Fut &lt; 0 &amp;&amp; bnFut &lt; 0</code>)</td>
            <td>"trend bearish (−1)" / "N50+BN futures bearish"</td>
          </tr>
          <tr>
            <td><span class="hlp-pill hlp-red">SHORT</span></td>
            <td>NIFTY 50 <code>current_trend &gt; 0</code> (LTP above ASO or AST)<br><em>OR</em><br>Both NIFTY 50 AND BANK NIFTY futures bullish (<code>n50Fut &gt; 0 &amp;&amp; bnFut &gt; 0</code>)</td>
            <td>"trend bullish (+1)" / "N50+BN futures bullish"</td>
          </tr>
        </tbody>
      </table>

      <div class="hlp-callout hlp-callout-amber">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span>Only <strong>one index futures</strong> going bearish does not trigger EXIT LONG — both must flip. This prevents false exits from temporary divergence between NIFTY 50 and BANK NIFTY.</span>
      </div>

      <h4 class="hlp-h4">How futures_trend is Determined</h4>
      <p style="font-size:0.72rem;">The NSE futures API returns a <strong>REMARK</strong> string per instrument based on intraday OI + price change. <code>getFuturesTrendScore(remark)</code> maps it:</p>
      <table class="hlp-table">
        <thead><tr><th>REMARK</th><th>Score</th><th>Note</th></tr></thead>
        <tbody>
          <tr><td>LONG, SHOT_COVERING, BULLS_CONSOLIDATING, GAMBLING_BUY_NEWS_AND_EVENTS, DEFENCE_BUY_ON_DECLINE</td><td>+1</td><td>SHOT_COVERING = shorts exiting = bullish despite "short" in name</td></tr>
          <tr><td>SHORT, LONG_UNWINDING, BEARS_COMING_SELL_ON_RISE, BEARS_CONSOLIDATING, CAUTION_WRITES_ERODING_PREMIUM</td><td>−1</td><td>LONG_UNWINDING = longs exiting = bearish despite "long" in name</td></tr>
          <tr><td>Anything else</td><td>0</td><td>Neutral / inconclusive</td></tr>
        </tbody>
      </table>

      <h4 class="hlp-h4">HOLD banner</h4>
      <p style="font-size:0.72rem;">When no exit condition is met, the banner shows: <code>HOLD LONG — trend +1 * N50fut +1 * BNfut +1</code> — gives a live snapshot of the three values driving the exit check.</p>
    `);

    h += '</div>'; // .hlp-body
    h += '</div>'; // .hlp-root
    return h;
}

// Helper: wraps panel content in the standard panel div
function hlpPanel(id, title, content) {
    return '<div class="hlp-panel" id="help-panel-' + id + '">'
         + '<h3 class="hlp-title">' + title + '</h3>'
         + content
         + '</div>';
}
