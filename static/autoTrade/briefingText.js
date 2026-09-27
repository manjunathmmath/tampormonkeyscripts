// ══════════════════════════════════════════════════════════════════════════════════════
// Market Briefing — TEXT (turns the state object from briefingCore.js into prose)
// ══════════════════════════════════════════════════════════════════════════════════════
// Output is a plain data structure (`brief`) made of blocks — {t:'p'|'ul'|'kv'|'table'|'h'} —
// so briefingUi.js can render it as HTML AND as copy-paste plain text from the same source.
// Inline emphasis uses **bold** only. Every sentence is generated from a number the app
// already computed; nothing here is a canned opinion, and anything that could not be
// computed is said out loud rather than skipped.

var _BF_REMARK_TXT = {
    LONG: 'long build-up — price and open interest both rising (fresh longs being added)',
    SHORT: 'short build-up — price falling while open interest rises (fresh shorts being added)',
    SHOT_COVERING: 'short covering — price rising while open interest falls (shorts exiting; the app scores this BULLISH)',
    LONG_UNWINDING: 'long unwinding — price falling while open interest falls (longs exiting; the app scores this BEARISH)',
};

function _bfP(x, tone) { return { t: 'p', x: x, tone: tone || null }; }
function _bfH(x) { return { t: 'h', x: x }; }
function _bfUL(items) { return { t: 'ul', items: items.filter(function (i) { return i && (i.x || typeof i === 'string'); }).map(function (i) { return typeof i === 'string' ? { x: i } : i; }) }; }
function _bfKV(items) { return { t: 'kv', items: items }; }
function _bfTable(head, rows) { return { t: 'table', head: head, rows: rows }; }
function _bfStrip(h) { return String(h == null ? '' : h).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
function _bfJoin(list, conj) {
    list = list.filter(function (x) { return x !== null && x !== undefined && x !== ''; });
    if (list.length <= 1) return list.join('');
    conj = conj || 'and';
    return list.slice(0, -1).join(', ') + ' ' + conj + ' ' + list[list.length - 1];
}
function _bfTone(dir) { return dir > 0 ? 'good' : dir < 0 ? 'bad' : 'warn'; }
function _bfOutcomeTone(o) { return /LONG/.test(o || '') ? 'good' : /SHORT/.test(o || '') ? 'bad' : 'warn'; }
function _bfRemarkText(r) {
    if (!r) return null;
    if (_BF_REMARK_TXT[r]) return _BF_REMARK_TXT[r];
    var sc = 0; try { sc = getFuturesTrendScore(r); } catch (e) {}
    return r.toLowerCase().replace(/_/g, ' ') + ' (the app scores this ' + (sc > 0 ? 'bullish' : sc < 0 ? 'bearish' : 'neutral') + ')';
}
function _bfZoneText(pf) {
    var L = pf.levels || {};
    switch (pf.zone) {
        case 'VIXU': return 'trading **above the VIX-implied upper edge of today\'s range (' + _bfFmt(L.vixu) + ')** — the statistically expected daily move is already used up, so fresh longs here are chasing';
        case 'AST': return 'above **AST (' + _bfFmt(L.ast) + ')** — both strike offsets from the 9:15 open are cleared, a strong upside extension';
        case 'ASO': return 'in the **ASO zone** (above ' + _bfFmt(L.aso) + (L.ast !== null ? ', below AST ' + _bfFmt(L.ast) : '') + ') — a bullish breakout of the opening range that has not extended yet';
        case 'VIXL': return 'trading **below the VIX-implied lower edge of today\'s range (' + _bfFmt(L.vixl) + ')** — the expected daily move is already used up on the downside, so fresh shorts here are chasing';
        case 'BST': return 'below **BST (' + _bfFmt(L.bst) + ')** — both strike offsets are broken, a strong downside extension';
        case 'BSO': return 'in the **BSO zone** (below ' + _bfFmt(L.bso) + (L.bst !== null ? ', above BST ' + _bfFmt(L.bst) : '') + ') — a bearish breakdown of the opening range that has not extended yet';
        default: return 'inside the **BSO–ASO band (' + _bfFmt(L.bso) + ' – ' + _bfFmt(L.aso) + ')** — the no-trade middle where the 9:15 framework gives no directional edge';
    }
}

// ══════════════ instrument deep-dive ══════════════════════════════════════════════════
function _bfNarrateInstrument(I, S) {
    var B = [], pf = I.pf;
    if (!pf || !pf.ok) {
        B.push(_bfP('No live price / strike-level data is cached for **' + I.name + '**, so nothing can be said about it yet. Missing: ' + (I.missing.length ? I.missing.join(', ') : 'price frame') + '.', 'muted'));
        return B;
    }
    var L = pf.levels || {};

    // 1 ── price, zone, levels
    var s1 = '**' + I.name + '** last traded at **' + _bfFmt(pf.ltp) + '**';
    if (pf.changePct !== null) s1 += ', ' + _bfPct(pf.changePct) + ' versus ' + pf.changeBasis + (pf.prevClose ? ' (' + _bfFmt(pf.prevClose) + ')' : '');
    if (pf.gapPct !== null && Math.abs(pf.gapPct) >= 0.1) s1 += '; it opened ' + _bfPct(pf.gapPct) + (pf.gapPct > 0 ? ' higher (gap-up)' : ' lower (gap-down)');
    s1 += '. It is ' + _bfZoneText(pf) + '.';
    B.push(_bfP(s1));
    var near = [];
    if (pf.above) near.push('nearest level **above** is ' + pf.above.key + ' ' + _bfFmt(pf.above.val) + ' (' + _bfSg(pf.above.pts, 1) + ' pts, ' + _bfPct(pf.above.pct) + ' — ' + pf.above.desc + ')');
    if (pf.below) near.push('nearest level **below** is ' + pf.below.key + ' ' + _bfFmt(pf.below.val) + ' (−' + _bfFix(pf.below.pts, 1) + ' pts, −' + _bfFix(pf.below.pct) + '% — ' + pf.below.desc + ')');
    if (near.length) B.push(_bfP('Level map: ' + near.join('; ') + '.'));
    if (pf.ladder && pf.ladder.length) {
        B.push(_bfTable(['Level', 'Price', 'Distance from LTP', 'Meaning'], pf.ladder.map(function (x) {
            var d = x.val - pf.ltp;
            return [x.key, _bfFmt(x.val), (d >= 0 ? '+' : '−') + _bfFix(Math.abs(d), 1) + ' pts (' + (d >= 0 ? '+' : '−') + _bfFix(Math.abs(d / pf.ltp * 100)) + '%)', x.desc];
        })));
    }
    if (pf.rangePos !== null) {
        var rp = Math.round(pf.rangePos);
        var rtxt = 'Price sits at **' + rp + '%** of the VIX-implied daily range (' + _bfFmt(L.vixl) + ' – ' + _bfFmt(L.vixu) + ', ±' + _bfFmt(pf.vixRange / 2, 0) + ' pts around the middle)';
        rtxt += rp >= 85 ? ' — near the top edge: upside room is largely spent, a long here needs a strong reason.' : rp <= 15 ? ' — near the bottom edge: downside room is largely spent, a short here needs a strong reason.' : ' — comfortably inside, so the range itself is not a constraint.';
        B.push(_bfP(rtxt, (rp >= 85 || rp <= 15) ? 'warn' : null));
    }
    if (I.dayHigh !== undefined) {
        var tk = []; if (I.touched && I.touched.ok) ['ASO', 'AST', 'BSO', 'BST', 'VIXU', 'VIXL'].forEach(function (k) { if (I.touched[k.toLowerCase()]) tk.push(k); });
        B.push(_bfP('Today\'s traded range so far: **' + _bfFmt(I.dayLow) + ' – ' + _bfFmt(I.dayHigh) + '** (' + _bfFmt(I.dayHigh - I.dayLow, 1) + ' pts).' + (tk.length ? ' Levels already tagged today: ' + tk.join(', ') + ' — a level that has been touched has already spent part of its edge.' : ' No ASO/AST/BSO/BST/VIX level has been touched yet today.')));
    }
    if (pf.volume && pf.avgVolume) B.push(_bfP('Volume is ' + _bfFix(pf.volume / pf.avgVolume, 2) + '× its average (' + _bfFmt(pf.volume, 0) + ' vs ' + _bfFmt(pf.avgVolume, 0) + ').'));

    // 2 ── score anatomy
    var cs = I.cs;
    if (cs) {
        var sp = [];
        sp.push('9:15 ' + _bfSg(cs.nine_fifteen, 0) + (I.zone915 ? ' (' + I.zone915 + ')' : ' (no 9:15 scan)'));
        sp.push('zone trend ' + _bfSg(cs.current_trend, 0));
        sp.push('futures ' + _bfSg(cs.futures_trend, 0) + (I.fut.remark ? ' (' + I.fut.remark + ')' : ''));
        sp.push('OI/OBV ' + _bfSg(cs.oi_obv, 1));
        sp.push('max pain ' + _bfSg(cs.max_pain, 0));
        sp.push('IV skew ' + _bfSg(cs.iv_skew, 0));
        var t = 'Composite score **' + _bfSg(cs.total, 1) + '** = ' + sp.join(', ') + '.';
        if (Math.abs(cs.oi_obv) > 3) t += ' OI/OBV is ' + _bfSg(cs.oi_obv, 1) + ' raw but is capped at ±3 inside the total so it cannot dominate.';
        B.push(_bfP(t, cs.total >= 3 ? 'good' : cs.total <= -3 ? 'bad' : null));
    }

    // 3 ── futures
    if (I.fut.remark) {
        var ft = 'Futures REMARK: **' + I.fut.remark + '** — ' + _bfRemarkText(I.fut.remark) + '.';
        if (I.fut.acc) {
            var a = I.fut.acc, trust = a.win >= 0.55 && (a.avgPts === null || a.avgPts > 0);
            ft += ' Today\'s replay of this exact REMARK on this instrument: **' + Math.round(a.win * 100) + '% win rate over ' + a.total + ' samples**' + (a.avgPts !== null ? ', average ' + _bfSg(a.avgPts, 1) + ' pts to the next candle' : '') + (a.avgEodPts !== null && a.avgEodPts !== undefined ? ', ' + _bfSg(a.avgEodPts, 1) + ' pts to end of day' : '') + ' — ' + (a.total < 8 ? 'too few samples to trust yet' : trust ? 'it is earning trust today' : 'it is NOT earning trust today');
            ft += '.';
        } else ft += ' No accuracy replay exists yet for this REMARK (open the Futures Accuracy panel to build it).';
        B.push(_bfP(ft));
    } else B.push(_bfP('No futures REMARK is cached for ' + I.name + (I.isIndex || I.isMcx ? '' : ' (this stock may not have been scanned this cycle)') + '.', 'muted'));
    var dom = S.dom && S.dom[I.name];
    if (dom) B.push(_bfP('Futures strip: ' + [dom.vwap, dom.prem].filter(Boolean).join(' · ') + '.'));
    if (I.dte !== null && I.dte !== undefined) B.push(_bfP('Futures expiry is **' + I.dte + ' day' + (I.dte === 1 ? '' : 's') + '** away.' + (I.dte <= 2 ? ' That is inside the mechanical squeeze window — short-covering / long-unwinding remarks are sharpest and most violent now, and Max Pain pinning gets stronger.' : ''), I.dte <= 2 ? 'warn' : null));

    // 4 ── options structure
    if (I.hasOi && I.oi) {
        var o = I.oi, pieces = [];
        if (o.pcr !== null) {
            var pt = o.pcr > 1.3 ? 'strongly put-heavy — put writers dominate, a firm support floor (contrarian-bullish at the extreme)'
                : o.pcr >= 1.0 ? 'mildly put-heavy — support slightly outweighs resistance'
                : o.pcr >= 0.7 ? 'mildly call-heavy — resistance slightly outweighs support'
                : 'strongly call-heavy — call writers dominate, a firm ceiling (contrarian-bearish at the extreme)';
            pieces.push('standing PCR **' + _bfFix(o.pcr) + '** (' + pt + ')');
        }
        if (o.chPcr !== null) {
            var ct = o.chPcr > 1.3 ? 'fresh money is going heavily into puts — bullish' : o.chPcr >= 1.0 ? 'fresh money leans to puts — mildly bullish' : o.chPcr >= 0.7 ? 'fresh money leans to calls — mildly bearish' : 'fresh money is going heavily into calls — bearish';
            pieces.push('today\'s change-PCR **' + _bfFix(o.chPcr) + '** (' + ct + '; this is the only PCR term that feeds the score)');
        }
        B.push(_bfP('Option chain (' + o.strikes + ' strikes scanned, spot/ATM ' + _bfFmt(o.spot, 0) + '): ' + (pieces.length ? pieces.join('; ') + '.' : 'PCR not available.')));

        var w = I.walls || { resistance: [], support: [] };
        function wtxt(list, kind) {
            if (!list.length) return 'no qualifying ' + kind + ' wall';
            return list.map(function (x, i) { var d = (x.strike - pf.ltp) / pf.ltp * 100; return '**' + (kind === 'resistance' ? 'R' : 'S') + (i + 1) + ' ' + _bfFmt(x.strike, 0) + '** (' + x.tier + ', ' + _bfPct(d) + ' from LTP)'; }).join(' and ');
        }
        B.push(_bfP('OI/OBV walls (OTM writing only, ranked by OBV pressure): ' + wtxt(w.resistance, 'resistance') + '; ' + wtxt(w.support, 'support') + '. A "secondary" wall is a real but weaker level (60%+ of the primary\'s OBV pressure).'));
        if (I.building && I.building.length) B.push(_bfP('**Walls being built right now** (writers accelerating ≥2× their own recent pace): ' + I.building.slice(0, 4).map(function (b) { return (b.side === 'R' ? 'resistance' : 'support') + ' at ' + _bfFmt(b.strike, 0) + ' (' + b.multiple.toFixed(1) + '×)'; }).join(', ') + '. Building walls lead the static R1/S1 snapshot.', 'info'));
        if (I.eroding && I.eroding.length) B.push(_bfP('**Walls eroding** (the writers behind them are covering faster than usual): ' + I.eroding.slice(0, 4).map(function (b) { return (b.side === 'R' ? 'resistance' : 'support') + ' ' + _bfFmt(b.strike, 0) + ' (' + b.multiple.toFixed(1) + '×, ' + b.tier + ')'; }).join(', ') + '. Do not lean on an eroding level — price tends to slice through it.', 'warn'));

        var fl = [];
        if (o.obvFlow !== null) fl.push('raw OBV tape flow **' + _bfSg(o.obvFlow, 0) + '** (' + (o.obvFlow > 0 ? 'bullish' : o.obvFlow < 0 ? 'bearish' : 'flat') + ', ignores IV/wall overrides)');
        if (o.oiWall !== null) fl.push('standing wall balance ' + _bfSg(o.oiWall, 1) + ' (' + (o.oiWall > 0 ? 'support-heavy' : o.oiWall < 0 ? 'resistance-heavy' : 'balanced') + ', context only — not in the score)');
        if (o.conflicts) fl.push(o.conflicts + ' strike(s) where IV disagreed with the OBV label (OBV still decided the label)');
        if (o.score !== null) fl.push('OI/OBV score ' + _bfSg(o.score, 1));
        if (fl.length) B.push(_bfP('Flow: ' + fl.join('; ') + '.'));

        var iv = [];
        if (o.atmIV !== null) iv.push('ATM IV **' + _bfFix(o.atmIV, 1) + '%**');
        if (o.ivSkew !== null) iv.push('IV skew **' + _bfSg(o.ivSkew, 1) + '%** (' + (o.ivSkew > 2 ? 'put skew — bearish pressure' : o.ivSkew < -2 ? 'call skew — bullish pressure' : 'no meaningful skew') + ')');
        if (o.volRatio !== null) iv.push('option volume is ' + _bfFix(o.volRatio, 2) + '× the previous session\'s (' + (o.volRatio >= 1.2 ? 'heavier — higher conviction' : o.volRatio <= 0.8 ? 'lighter — lower conviction' : 'similar') + ')');
        if (typeof o.oiConc === 'number') iv.push('OI concentration ' + _bfFix(o.oiConc, 2));
        if (o.oiVelocity) iv.push('OI velocity over ' + o.oiVelocity.minutesAgo + ' min: ΔCE ' + _bfSg(o.oiVelocity.deltaCE, 1) + ', ΔPE ' + _bfSg(o.oiVelocity.deltaPE, 1) + ' (' + o.oiVelocity.label + ')');
        if (iv.length) B.push(_bfP('Volatility & participation: ' + iv.join('; ') + '.'));

        if (I.mpd) {
            var m = I.mpd;
            var mt = 'Max Pain is **' + _bfFmt(m.maxPainK, 0) + '**, ' + (m.maxPainDist >= 0 ? '+' : '−') + _bfFix(Math.abs(m.maxPainDist), 0) + ' pts (' + _bfPct(m.maxPainPct) + ') from spot; net GEX **' + _bfSg(m.netGEX, 0) + '** → ' + (m.netGEX > 0 ? 'dealers are long gamma (stabilising, mean-reverting)' : 'dealers are short gamma (trending, moves get amplified)') + '.';
            if (m.flipZones && m.flipZones.length) mt += ' GEX flip zones: ' + m.flipZones.slice(0, 4).map(function (f) { return _bfFmt(f, 0); }).join(', ') + '.';
            if (o.mpConv) mt += ' Versus the previous read Max Pain has moved ' + _bfSg(o.mpConv.delta, 0) + ' (' + o.mpConv.label + ').';
            B.push(_bfP(mt));
            if (I.mpOutcome) B.push(_bfP('The app\'s Max Pain read: **' + I.mpOutcome.label + '** — ' + _bfStrip(I.mpOutcome.reason)));
            if (I.flowVsPull) B.push(_bfP(_bfStrip(I.flowVsPull.text), 'warn'));
        }
        if (I.mktProfile) B.push(_bfP('Market Profile (volume-at-price from today\'s candles): POC **' + _bfFmt(I.mktProfile.poc, 0) + '**, value area ' + _bfFmt(I.mktProfile.val, 0) + ' – ' + _bfFmt(I.mktProfile.vah, 0) + ' (70% of volume). Price ' + (pf.ltp > I.mktProfile.vah ? 'is above the value area (accepting higher prices)' : pf.ltp < I.mktProfile.val ? 'is below the value area (accepting lower prices)' : 'is inside the value area (fair-value rotation)') + '.'));
        if (o.ageMin !== null && !(S.clock && S.clock.isReplay)) B.push(_bfP('OI data was last fetched ' + o.ageMin + ' min ago' + (o.ageMin > 20 ? ' — stale, walls may have moved; run a refresh before acting on them.' : '.'), o.ageMin > 20 ? 'warn' : 'muted'));
    } else {
        B.push(_bfP('No OI/OBV option chain is cached for ' + I.name + ' — walls, PCR, Max Pain, IV skew and the Context/Location/Confirmation verdict are unavailable for it.', 'muted'));
    }

    // 5 ── probabilities & dead zone
    if (I.lp && I.lp.ok) {
        var lp = I.lp;
        B.push(_bfP('Level probability (live-signal likelihood of reaching a level today — a reasoned estimate, **not** a statistically fitted %): upside **ASO ' + lp.pASO + '% · AST ' + lp.pAST + '% · VIXU ' + lp.pVIXU + '%**; downside **BSO ' + lp.pBSO + '% · BST ' + lp.pBST + '% · VIXL ' + lp.pVIXL + '%**. Net lean ' + _bfSg(lp.netDir, 2) + ' → ' + (lp.netDir > 0.15 ? 'favours the upside' : lp.netDir < -0.15 ? 'favours the downside' : 'no clear lean') + '.'));
    }
    if (I.deadZone) B.push(_bfP('**Dead zone active:** conviction is weak (|composite| < 3) and price is inside ' + _bfFmt(I.deadZone.lo, 0) + ' – ' + _bfFmt(I.deadZone.hi, 0) + '. Signals disagree or are too weak here — expect chop until price closes outside the band; do not trust a marginal breakout of a normal level inside it.', 'warn'));

    // 6 ── cross-checks: consensus, verdict
    var c = I.consensus;
    if (c) {
        B.push(_bfP('**Master Consensus: ' + c.outcome + '** (weighted net ' + _bfSg(c.net, 2) + '; ' + c.voting + ' of ' + c.rows.length + ' engines voting, ' + c.agree + ' agreeing with the net' + (c.thin ? '; ⚠ THIN — the call rides on ≤1 real vote' : '') + '; ' + c.dataCount + ' engines had data).', _bfOutcomeTone(c.outcome)));
        B.push(_bfTable(['Engine', 'Vote', 'Weight class', 'Note'], c.rows.map(function (r) {
            return [r.label, { x: !r.hasData ? 'NO DATA' : r.dir > 0 ? 'BULL ▲' : r.dir < 0 ? 'BEAR ▼' : 'FLAT', tone: !r.hasData ? 'muted' : _bfTone(r.dir) }, r.weightClass + ' ×' + r.weight, r.note || ''];
        })));
    }
    var v = I.verdict;
    if (v) {
        var vt = 'Trade Verdict (Context · Location · Confirmation): **' + v.label + '**' + (I.hc ? ' ★ HIGH CONVICTION' : '') + '.';
        B.push(_bfP(vt, /^LONG$/.test(v.label) ? 'good' : /^SHORT$/.test(v.label) ? 'bad' : 'warn'));
        var lines = [];
        [['Context', v.context], ['Location', v.location], ['Confirmation', v.confirmation]].forEach(function (p) {
            var part = p[1]; if (!part || (!part.label && !(part.lines && part.lines.length))) return;
            lines.push({ x: '**' + p[0] + '** — ' + (part.label || '') + (part.lines && part.lines.length ? ': ' + part.lines.map(_bfStrip).join(' ') : ''), tone: part.ok === true ? 'good' : part.ok === false ? 'bad' : 'muted' });
        });
        if (lines.length) B.push(_bfUL(lines));
        if (v.trade) B.push(_bfP('Verdict trade: **' + v.trade.dir + '** — entry ' + _bfFmt(v.trade.entry, 0) + ', stop ' + v.trade.stop + ', target ' + v.trade.target + '.', v.trade.dir === 'LONG' ? 'good' : 'bad'));
    } else if (I.hasOi) B.push(_bfP('The Context/Location/Confirmation verdict could not be built for ' + I.name + '.', 'muted'));

    // 7 ── extras
    var ex = [];
    if (I.curve) ex.push({ x: 'Curve structure: **' + I.curve.state + '**, gap ' + _bfSg(I.curve.diffPct, 2) + '% raw / ' + _bfSg(I.curve.annualizedPct, 1) + '% annualised → ' + I.curve.lean + ' (read cached ' + moment(I.curve.ts).format('HH:mm') + ').', tone: _bfTone(I.curve.dir) });
    if (I.ofi) ex.push({ x: _bfStrip(I.ofi.text) + ' → ' + I.ofi.label + '.', tone: _bfTone(I.ofi.dir) });
    if (I.sc && I.sc.ok) ex.push({ x: I.sc.active ? '**' + (I.sc.type === 'SHORT_COVERING' ? 'Short covering' : 'Long unwinding') + ' is firing** — squeeze probability ' + I.sc.probability + '%' + (I.sc.pcr !== null ? ', PCR ' + _bfFix(I.sc.pcr) + (I.sc.extremePositioning ? ' (one-sided positioning)' : '') : '') + (I.sc.acc ? '; historically ' + I.sc.acc.winRate + '% win rate (n=' + I.sc.acc.samples + ')' : '') + '.' : 'No short-covering / long-unwinding squeeze is firing.', tone: I.sc.active ? (I.sc.type === 'SHORT_COVERING' ? 'good' : 'bad') : 'muted' });
    if (I.fvo) ex.push({ x: _bfStrip(I.fvo.text), tone: 'warn' });
    if (ex.length) B.push(_bfUL(ex));

    // 8 ── read-through
    B.push(_bfP(_bfReadThrough(I, S), 'info'));
    return B;
}

function _bfReadThrough(I, S) {
    var c = I.consensus, v = I.verdict, pf = I.pf;
    var cDir = c ? (c.outcome === 'GO LONG' ? 1 : c.outcome === 'GO SHORT' ? -1 : 0) : 0;
    var vDir = v && v.label ? (/^LONG/.test(v.label) ? 1 : /^SHORT/.test(v.label) ? -1 : 0) : 0;
    var dir = cDir !== 0 ? cDir : vDir, word = dir > 0 ? 'long' : 'short';
    var t = '**Read-through:** ';
    if (v && v.trade && vDir === dir && dir !== 0) {
        t += 'actionable ' + word + ' — spot is at its ' + (dir > 0 ? 'support' : 'resistance') + ' wall and the signals agree; the verdict\'s entry is ' + _bfFmt(v.trade.entry, 0) + ' with stop ' + v.trade.stop + ' and target ' + v.trade.target + '.';
        if (c && c.thin) t += ' Caveat: consensus is thin, so size at half.';
        return t;
    }
    if (I.deadZone) return t + 'no trade — spot is in a dead zone (' + _bfFmt(I.deadZone.lo, 0) + ' – ' + _bfFmt(I.deadZone.hi, 0) + ') with weak, conflicting signals. Wait for a decisive close outside the band.';
    if (dir !== 0) {
        var wallList = dir > 0 ? (I.walls && I.walls.support) : (I.walls && I.walls.resistance);
        var w1 = wallList && wallList[0] ? wallList[0].strike : null;
        t += 'a ' + word + ' bias exists but it is not tradable yet';
        if (w1 !== null && pf && pf.ok) { var d = Math.abs(pf.ltp - w1) / pf.ltp * 100; t += ' — the matching ' + (dir > 0 ? 'support' : 'resistance') + ' wall is ' + _bfFmt(w1, 0) + ' (' + _bfFix(d) + '% away). Wait for price to ' + (dir > 0 ? 'pull back to' : 'rally into') + ' it (within ~0.35%) with futures and OI/OBV still agreeing.'; }
        else t += ' — there is no matching OI wall nearby to define a low-risk entry, so treat the bias as unconfirmed.';
        return t;
    }
    if (!I.hasOi && !(c && c.voting > 0)) return t + 'not enough data to form a view.';
    return t + 'no directional edge — the engines cancel out or are neutral. Trade only the range between the nearest support and resistance with tight stops, or stay out.';
}

// ══════════════ market-level sections ═════════════════════════════════════════════════
function _bfSectionContext(S) {
    var B = [], sc = S.score, sig = S.signal, cl = S.clock;
    if (cl.isReplay || cl.snapTime) B.push(_bfP('**Snapshot mode:** this briefing is built from data as of **' + cl.curDay + ' ' + cl.hhmm + '** (' + cl.source + '; previous day ' + (cl.prevDay || '—') + '), not the live market. Time-window advice below uses that snapshot time.', 'warn'));
    if (sc) {
        var lead = sc.leading, lag = sc.lagging;
        var t = 'The composite score is **' + _bfSg(sc.total, 2) + '** on a −40…+40 gauge. ';
        t += 'It splits into **leading ' + _bfSg(lead, 2) + '** (9:15 candle + advance/decline + futures — fast, reflects this session) and **lagging ' + _bfSg(lag, 2) + '** (OI/OBV + Max Pain + IV skew + component score — built from the previous candle batch, can trail by minutes)' + (sc.includeLagging ? '.' : ' — but the "Include lagging" setting is OFF, so the lagging half is **excluded** from the total.');
        B.push(_bfP(t));
        var agree = _bfSign(lead, 1) !== 0 && _bfSign(lag, 1) !== 0 && _bfSign(lead, 1) === _bfSign(lag, 1);
        var split = _bfSign(lead, 1) !== 0 && _bfSign(lag, 1) !== 0 && _bfSign(lead, 1) !== _bfSign(lag, 1);
        if (agree) B.push(_bfP('Leading and lagging halves **agree** (' + _bfDirWord(_bfSign(lead)) + ') — the higher-quality situation: the slow indicators are confirming what the fast ones already show.', 'good'));
        else if (split) B.push(_bfP('Leading and lagging halves **disagree** (leading ' + _bfDirWord(_bfSign(lead)) + ', lagging ' + _bfDirWord(_bfSign(lag)) + '). Either the move is brand new and the slow indicators have not caught up, or it is fading and the slow indicators are still holding the old picture. Trust the leading half for direction, but size down until they align.', 'warn'));
        B.push(_bfTable(['Pillar', 'Type', 'Sum', 'Inputs'], sc.groups.map(function (g) {
            return [g.label, g.leading ? 'leading' : 'lagging' + (sc.includeLagging ? '' : ' (excluded)'), { x: _bfSg(g.sum, 2), tone: _bfTone(_bfSign(g.sum, 0.05)) }, g.items.map(function (i) { return i.label + ' ' + _bfSg(i.val, 2); }).join(' · ')];
        })));
        if (sc.contributors.length) B.push(_bfP('Biggest single contributors: ' + sc.contributors.slice(0, 5).map(function (x) { return x.label + ' (' + x.group.split(' (')[0] + ') ' + _bfSg(x.val, 2); }).join('; ') + '.'));
        var band = S.band;
        if (band) B.push(_bfP('Distance to the next signal bands: ' + (band.toUp !== null ? '**+' + band.toUp + '** more would lift it to the ' + band.up + ' threshold' : 'already at the top band') + '; ' + (band.toDown !== null ? '**−' + band.toDown + '** would drop it below the ' + band.down + ' threshold.' : 'already at the bottom band.') + ' (Bands: ≥8 STRONG BUY, ≥4 BUY, ≥1.5 mild-bullish WAIT, ≥−1.5 SIDEWAYS, ≥−4 mild-bearish WAIT, ≥−8 SELL, below STRONG SELL.)'));
    } else B.push(_bfP('The composite score could not be computed (see Data coverage).', 'warn'));

    if (sig) {
        var st = 'The market signal is **' + sig.signal + '** — ' + sig.reason;
        B.push(_bfP(st, /BUY/.test(sig.signal) ? 'good' : /SELL/.test(sig.signal) ? 'bad' : 'warn'));
        if (sig.tradeSignal) B.push(_bfP('The 9:15 index-pattern read (independent of the score) says **' + sig.tradeSignal.outcome + '** — ' + sig.tradeSignal.level + '.'));
    }
    if (S.pattern915) {
        var p = S.pattern915;
        B.push(_bfP('9:15 closing zones: NIFTY 50 **' + p.nifty + '**, SENSEX **' + p.sensex + '**, NIFTY BANK **' + p.bank + '**, GIFT NIFTY **' + p.gift + '**. AST/ASO = closed above the strike offsets from the open (bullish), BST/BSO = below (bearish), B/W = inside the band (no edge). NIFTY leads, SENSEX is the global confirmation, BANK is the sector read; "at BSO/BST" means buy pullbacks to those levels, "at ASO/AST" means sell rallies to those levels.'));
    }
    if (S.confluence) {
        var cf = S.confluence;
        B.push(_bfP('Entry confluence: **' + cf.bullish + ' bullish vs ' + cf.bearish + ' bearish** of 5 pillars (' + (cf.reasons.length ? cf.reasons.join(', ') : 'none aligned') + ') → **' + cf.direction + '**. A trade needs ≥4 aligned with ≤1 opposing and a PRIME/OK window' + (cf.window === 'AVOID' || cf.window === 'CLOSED' ? ' — the current window is ' + cf.window + ', which forces WAIT regardless of the count' : '') + '.' + (cf.pcrWarning ? ' Extra: ' + cf.pcrWarning + '.' : ''), cf.direction === 'LONG' ? 'good' : cf.direction === 'SHORT' ? 'bad' : 'warn'));
    }
    if (S.exitSig) B.push(_bfP('Exit check for positions you may already hold — **long: ' + S.exitSig.long + ' · short: ' + S.exitSig.short + '**. (EXIT LONG fires when NIFTY 50\'s zone trend turns negative OR both index futures turn bearish; EXIT SHORT is the mirror.)', (S.exitSig.long === 'EXIT' || S.exitSig.short === 'EXIT') ? 'warn' : 'muted'));
    var w = S.window;
    B.push(_bfP('Trading window: **' + w.name + '** — ' + w.label + (w.minsLeft !== null && w.next ? '; changes to ' + w.next.name + ' in ' + w.minsLeft + ' min' : '') + '. (Clock source: ' + cl.source + '.)', w.name === 'PRIME' ? 'good' : w.name === 'AVOID' ? 'warn' : null));
    return { id: 'context', title: 'Market context — score, signal & confluence', icon: 'bi-speedometer2', open: true, blocks: B };
}

function _bfSectionBreadth(S) {
    var B = [], b = S.breadth;
    if (!b) return { id: 'breadth', title: 'Breadth & internals', icon: 'bi-distribute-horizontal', open: false, blocks: [_bfP('Breadth data unavailable.', 'muted')] };
    var lines = [];
    if (b.ad && b.ad.score !== null) {
        var cov = (b.ad.universe ? Math.round(b.ad.sample / b.ad.universe * 100) : null);
        lines.push({ x: 'All-F&O advance/decline score **' + _bfSg(b.ad.score, 2) + '** (advances vs declines among stocks that have broken their 9:15 zone)' + (b.ad.universe ? '; only **' + b.ad.sample + ' of ' + b.ad.universe + ' stocks (' + cov + '%)** have actually broken out, the rest are still inside their band and are excluded from that ratio' + (cov < 15 ? ' — a thin sample, so the ratio can swing hard on a handful of early movers' : '') + '.' : '.'), tone: cov !== null && cov < 15 ? 'warn' : null });
    }
    [['NIFTY 50', b.n50], ['NIFTY BANK', b.bn]].forEach(function (p) {
        if (!p[1]) return;
        var d = p[1];
        lines.push({ x: p[0] + ' constituents: **' + d.adv + ' advancing / ' + d.dec + ' declining / ' + d.neutral + ' neutral** (of ' + d.total + ')' + (d.advNames.length ? '; advancing: ' + d.advNames.join(', ') : '') + (d.decNames.length ? '; declining: ' + d.decNames.join(', ') : '') + '.', tone: _bfTone(_bfSign(d.adv - d.dec)) });
    });
    if (b.b915) lines.push({ x: '9:15 breakouts (above vs below the strike offsets): NIFTY 50 list **' + b.b915.n50.up + '▲ / ' + b.b915.n50.down + '▼**, BANK NIFTY list **' + b.b915.bn.up + '▲ / ' + b.b915.bn.down + '▼**, all scanned **' + b.b915.all.up + '▲ / ' + b.b915.all.down + '▼** (' + b.b915.all.scanned + ' scanned).' });
    if (S.futBreadth) lines.push({ x: 'Futures-trend breadth scores: all F&O ' + _bfSg(S.futBreadth.all, 0) + ', NIFTY 50 constituents ' + _bfSg(S.futBreadth.n50, 0) + ', BANK constituents ' + _bfSg(S.futBreadth.bn, 0) + ' (+1 = more bullish than bearish remarks, −1 the reverse).' });
    B.push(_bfUL(lines));

    if (b.impact) {
        [b.impact.n50, b.impact.bn].forEach(function (im) {
            if (!im || !im.rows.length) return;
            var ups = im.rows.filter(function (r) { return r.impact > 0; }).slice(0, 3), dns = im.rows.filter(function (r) { return r.impact < 0; }).slice(0, 3);
            var t = '**' + im.index + ' index impact** (weight × today\'s move, top-10 names = ' + _bfFix(im.coverage, 0) + '% of the index): net **' + _bfSg(im.net, 3) + ' index-%**.';
            if (ups.length) t += ' Pushing up: ' + ups.map(function (r) { return r.name + ' (' + _bfFix(r.weight, 1) + '% wt, ' + _bfPct(r.chg) + ')'; }).join(', ') + '.';
            if (dns.length) t += ' Dragging down: ' + dns.map(function (r) { return r.name + ' (' + _bfFix(r.weight, 1) + '% wt, ' + _bfPct(r.chg) + ')'; }).join(', ') + '.';
            if (im.indexChange !== null && Math.abs(im.indexChange) > 0.02 && Math.abs(im.net) > 0.005 && ((im.indexChange > 0) !== (im.net > 0))) t += ' ⚠ The index is ' + _bfPct(im.indexChange) + ' but this top-10 slice nets the opposite way — the move is coming from names outside the top ten (they cover only ' + _bfFix(im.coverage, 0) + '% of the index).';
            B.push(_bfP(t, 'info'));
        });
    }
    if (b.wtc) {
        [b.wtc.n50, b.wtc.bn].forEach(function (w) {
            if (!w) return;
            B.push(_bfP('**' + w.indexName + ' weighted trend confirmation:** weight-averaged constituent score **' + _bfSg(w.netScore, 2) + '** (' + (w.netScore > 0.5 ? 'constituents lean bullish' : w.netScore < -0.5 ? 'constituents lean bearish' : 'constituents are mixed') + '). Biggest weight×score drivers: ' + w.rows.slice(0, 4).map(function (r) { return r.name + ' (' + _bfSg(r.score, 1) + ', ' + _bfFix(r.weight, 1) + '%)'; }).join(', ') + '.'));
        });
    }
    // short covering scan
    var sc = [];
    Object.keys(S.instr).forEach(function (n) { var I = S.instr[n]; if (I.sc && I.sc.ok && I.sc.active) sc.push({ n: n, s: I.sc }); });
    if (sc.length) {
        sc.sort(function (a, b) { return b.s.probability - a.s.probability; });
        B.push(_bfP('**Squeezes firing right now:** ' + sc.slice(0, 8).map(function (x) { return x.n + ' — ' + (x.s.type === 'SHORT_COVERING' ? 'short covering' : 'long unwinding') + ' ' + x.s.probability + '%' + (x.s.nearExpiry ? ' (' + x.s.daysToExpiry + 'd to expiry)' : ''); }).join('; ') + '.', 'info'));
    } else B.push(_bfP('No short-covering / long-unwinding squeeze is firing on any tracked instrument.', 'muted'));

    // constituent board
    var rows = [];
    Object.keys(S.instr).forEach(function (n) {
        var I = S.instr[n]; if (I.w50 === null && I.wbn === null) return;
        var pf = I.pf || {}, c = I.consensus;
        rows.push([n, (I.w50 !== null ? 'N50 ' + _bfFix(I.w50, 1) + '%' : '') + (I.wbn !== null ? (I.w50 !== null ? ' · ' : '') + 'BN ' + _bfFix(I.wbn, 1) + '%' : ''),
            pf.ok ? _bfFmt(pf.ltp) : '—', pf.ok && pf.changePct !== null ? { x: _bfPct(pf.changePct), tone: _bfTone(_bfSign(pf.changePct, 0.02)) } : '—',
            pf.ok ? pf.zone : '—', I.zone915 || '—', I.fut.remark || '—', I.cs ? { x: _bfSg(I.cs.total, 1), tone: _bfTone(_bfSign(I.cs.total, 1)) } : '—',
            c ? { x: c.outcome + (c.thin && c.voting > 0 ? ' ⚠thin' : ''), tone: _bfOutcomeTone(c.outcome) } : '—', I.verdict ? I.verdict.label : '—']);
    });
    rows.sort(function (a, b) { return (b[1] > a[1]) ? 1 : -1; });
    if (rows.length) { B.push(_bfH('Constituent board (NIFTY 50 & BANK NIFTY top-10 weighted names)')); B.push(_bfTable(['Stock', 'Weight', 'LTP', 'Chg', 'Zone', '9:15', 'Futures', 'Score', 'Consensus', 'Verdict'], rows)); }
    return { id: 'breadth', title: 'Breadth, internals & constituents', icon: 'bi-distribute-horizontal', open: false, blocks: B };
}

function _bfSectionSentiment(S) {
    var B = [];
    var v = S.vix;
    var t = 'India VIX is **' + (v.ltp ? _bfFix(v.ltp, 2) : 'not loaded') + '** — regime **' + v.regime + '**. ' + v.note + ' The Trend Probability engine multiplies its conviction by ×' + v.mod.toFixed(2) + ' for this regime.';
    B.push(_bfP(t, v.regime === 'EXTREME' || v.regime === 'HIGH' ? 'warn' : null));
    var n50 = S.instr['NIFTY 50'];
    if (n50 && n50.pf && n50.pf.ok && n50.pf.vixRange !== null) B.push(_bfP('For NIFTY 50 the VIX-implied expected daily range is **' + _bfFmt(n50.pf.levels.vixl, 0) + ' – ' + _bfFmt(n50.pf.levels.vixu, 0) + '** (±' + _bfFmt(n50.pf.vixRange / 2, 0) + ' pts around the previous close); price currently sits ' + (n50.pf.rangePos !== null ? Math.round(n50.pf.rangePos) + '% of the way up it' : 'inside it') + '. Touching either edge means the statistically expected move is spent (the app blocks new entries there with a NO TRADE).'));
    if (S.fg && S.fg.composite !== null) {
        var fg = S.fg;
        B.push(_bfP('**Market Fear & Greed: ' + Math.round(fg.composite) + ' — ' + fg.label.label + '.** Framed as contrarian CONTEXT (green = fear = potential buy-the-dip, red = greed = stretched), never as a direction that overrides Master Consensus. Components: ' + fg.parts.map(function (p) { return p.label + ' ' + (p.score === null ? 'pending' : Math.round(p.score)) + (p.detail ? ' [' + p.detail + ']' : ''); }).join('; ') + '.' + (fg.outcome ? ' ' + _bfStrip(fg.outcome.text) : ' The 45–55 band is genuinely neutral — no contrarian lean either way.'), 'info'));
    } else B.push(_bfP('Fear & Greed is not available yet (its momentum component is fetched once per day and may still be pending).', 'muted'));
    var tp = S.trendProb;
    if (tp) {
        B.push(_bfP('**Trend Probability: ' + tp.verdict + ' — ' + Math.round(tp.bullPct * 100) + '% bull / ' + Math.round(tp.bearPct * 100) + '% bear, confidence ' + tp.confidence + '/100** (VIX modifier ×' + tp.vixMod.toFixed(2) + '). It aggregates six market-wide signals:', /BULL/.test(tp.verdict) ? 'good' : /BEAR/.test(tp.verdict) ? 'bad' : 'warn'));
        B.push(_bfTable(['Signal', 'Direction', 'Strength', 'Value', 'Detail'], tp.signals.map(function (s) {
            return [s.label, { x: s.isVix ? '—' : s.dir === 'bull' ? 'BULL ▲' : s.dir === 'bear' ? 'BEAR ▼' : 'NEUTRAL', tone: s.dir === 'bull' ? 'good' : s.dir === 'bear' ? 'bad' : 'muted' }, s.isVix ? '—' : Math.round(s.strength * 100) + '%', s.value, s.detail];
        })));
    }
    var co = S.consensus;
    if (co) {
        var ct = '**Master Consensus overall (' + co.count + ' instruments; NIFTY 50/BANK weighted 3×, stocks 1×): ' + co.outcome + '** (net ' + _bfSg(co.net, 2) + '). **' + co.longs.length + '** GO LONG, **' + co.shorts.length + '** GO SHORT, **' + co.waits + '** WAIT' + (co.dead.length ? ', of which ' + co.dead.length + ' sit in a dead zone' : '') + '.';
        if (co.caution) ct += ' ⚠ **Caution:** the core indices lean one way while the broader breadth votes the other — the index leg should get more trust than the breadth vote for index trades.';
        B.push(_bfP(ct, _bfOutcomeTone(co.outcome)));
        if (co.longs.length) B.push(_bfP('Strongest GO LONG: ' + co.longs.slice(0, 6).map(function (c) { return c.name + ' (' + _bfSg(c.net, 2) + ', ' + c.agree + '/' + c.voting + (c.thin ? ' thin' : '') + ')'; }).join(', ') + '.', 'good'));
        if (co.shorts.length) B.push(_bfP('Strongest GO SHORT: ' + co.shorts.slice(0, 6).map(function (c) { return c.name + ' (' + _bfSg(c.net, 2) + ', ' + c.agree + '/' + c.voting + (c.thin ? ' thin' : '') + ')'; }).join(', ') + '.', 'bad'));
    }
    // curve
    var cv = [];
    Object.keys(S.instr).forEach(function (n) { var I = S.instr[n]; if (I.curve) cv.push({ n: n, c: I.curve }); });
    if (cv.length) B.push(_bfP('Cached curve-structure reads (contango/backwardation): ' + cv.map(function (x) { return x.n + ' ' + x.c.state.toLowerCase() + ' ' + _bfSg(x.c.annualizedPct, 1) + '%/yr (' + x.c.lean.split(' ')[0].toLowerCase() + ')'; }).join('; ') + '.'));
    if (S.curveRows) {
        var ok = S.curveRows.filter(function (r) { return r.ok; });
        var bulls = ok.filter(function (r) { return r.lean === 'bull'; }).sort(function (a, b) { return a.annualizedPct - b.annualizedPct; });
        var bears = ok.filter(function (r) { return r.lean === 'bear'; }).sort(function (a, b) { return b.annualizedPct - a.annualizedPct; });
        B.push(_bfP('Curve Structure Compare scan (' + ok.length + ' instruments): **' + bulls.length + ' bullish-lean** (backwardation), **' + bears.length + ' bearish/caution** (steep contango). Strongest backwardation: ' + (bulls.slice(0, 5).map(function (r) { return r.name + ' ' + _bfSg(r.annualizedPct, 1) + '%/yr'; }).join(', ') || 'none') + '. Steepest contango: ' + (bears.slice(0, 5).map(function (r) { return r.name + ' ' + _bfSg(r.annualizedPct, 1) + '%/yr'; }).join(', ') || 'none') + '. NSE index/stock curves sit near fair value because of cash-futures arbitrage, so a genuine lean there is rare and worth noticing; commodity curves reflect real storage/supply conditions and lean more often.'));
    } else B.push(_bfP('The Curve Structure Compare scan has not been run this session (floating toolbar → Curve Structure Compare → SCAN ALL) — the curve vote is only present for instruments whose own panel was opened.', 'muted'));
    return { id: 'sentiment', title: 'Volatility, sentiment & probability', icon: 'bi-thermometer-half', open: false, blocks: B };
}

function _bfSectionBoards(S) {
    var B = [], rows = [];
    Object.keys(S.instr).forEach(function (n) {
        var I = S.instr[n]; if (!I.isMcx && n !== 'USDINR' && n !== 'GIFT NIFTY') return;
        var pf = I.pf || {}, c = I.consensus;
        rows.push([n + (I.isMcx ? ' (MCX)' : ''), pf.ok ? _bfFmt(pf.ltp) : '—', pf.ok && pf.changePct !== null ? { x: _bfPct(pf.changePct), tone: _bfTone(_bfSign(pf.changePct, 0.02)) } : '—', pf.ok ? pf.zone : '—',
            I.cs ? { x: _bfSg(I.cs.total, 1), tone: _bfTone(_bfSign(I.cs.total, 1)) } : '—', I.fut.remark || '—', c ? { x: c.outcome + (c.thin && c.voting > 0 ? ' ⚠thin' : ''), tone: _bfOutcomeTone(c.outcome) } : '—', I.verdict ? I.verdict.label : '—',
            I.curve ? I.curve.state + ' ' + _bfSg(I.curve.annualizedPct, 1) + '%' : '—', I.dte !== null && I.dte !== undefined ? I.dte + 'd' : '—']);
    });
    if (rows.length) B.push(_bfTable(['Instrument', 'LTP', 'Chg (vs open)', 'Zone', 'Score', 'Futures', 'Consensus', 'Verdict', 'Curve', 'Expiry'], rows));
    else B.push(_bfP('No commodity / currency data cached.', 'muted'));
    B.push(_bfP('MCX names have no previous-close in this app\'s cache, so their change is measured from today\'s open, and their vol gate uses the commodity\'s own vol index (OVX for crude, GVZ for gold, VXSLV for silver) rather than India VIX.', 'muted'));
    return { id: 'boards', title: 'Commodities, currency & GIFT board', icon: 'bi-droplet-fill', open: false, blocks: B };
}

// ══════════════ playbook / risks / changes / coverage ═════════════════════════════════
function _bfPlaybook(S) {
    var items = [];
    ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'CRUDEOILM'].forEach(function (n) {
        var I = S.instr[n]; if (!I || !I.pf || !I.pf.ok) return;
        var pf = I.pf, ltp = pf.ltp, w = I.walls || { resistance: [], support: [] };
        var r1 = w.resistance[0] ? w.resistance[0].strike : null, s1 = w.support[0] ? w.support[0].strike : null;
        var up = pf.above, dn = pf.below, fut = I.fut.remark;
        var futDir = I.fut.score || 0;
        var b = [];
        if (up) {
            var trig = r1 !== null && r1 > ltp && r1 <= up.val * 1.001 ? r1 : up.val;
            var nxt = pf.ladder.filter(function (x) { return x.val > trig; }).sort(function (a, b) { return a.val - b.val; })[0];
            b.push({ x: '**Upside trigger:** a 5-minute close above **' + _bfFmt(trig, 0) + '** (' + (r1 === trig ? 'R1 wall' : up.key) + ') ' + (futDir > 0 ? 'with futures still ' + fut + ' (bullish)' : futDir < 0 ? 'would be AGAINST the futures read (' + fut + ') — treat as a trap unless futures flip' : 'ideally confirmed by the futures REMARK turning bullish') + ' → continuation long' + (nxt ? ' toward ' + nxt.key + ' ' + _bfFmt(nxt.val, 0) : '') + '; invalidate on a close back below ' + _bfFmt(trig - Math.max(trig * 0.004, 1), 0) + '.', tone: 'good' });
        }
        if (dn) {
            var trig2 = s1 !== null && s1 < ltp && s1 >= dn.val * 0.999 ? s1 : dn.val;
            var nxt2 = pf.ladder.filter(function (x) { return x.val < trig2; }).sort(function (a, b) { return b.val - a.val; })[0];
            b.push({ x: '**Downside trigger:** a 5-minute close below **' + _bfFmt(trig2, 0) + '** (' + (s1 === trig2 ? 'S1 wall' : dn.key) + ') ' + (futDir < 0 ? 'with futures still ' + fut + ' (bearish)' : futDir > 0 ? 'would be AGAINST the futures read (' + fut + ') — treat as a trap unless futures flip' : 'ideally confirmed by the futures REMARK turning bearish') + ' → continuation short' + (nxt2 ? ' toward ' + nxt2.key + ' ' + _bfFmt(nxt2.val, 0) : '') + '; invalidate on a close back above ' + _bfFmt(trig2 + Math.max(trig2 * 0.004, 1), 0) + '.', tone: 'bad' });
        }
        if (s1 !== null && r1 !== null && s1 < ltp && r1 > ltp) b.push({ x: '**Range play:** between support ' + _bfFmt(s1, 0) + ' and resistance ' + _bfFmt(r1, 0) + ' (' + _bfFix((r1 - s1) / ltp * 100) + '% wide) expect rotation; fade only the extremes with a stop just beyond the wall, and stay out of the middle.' });
        if (I.mpd && Math.abs(I.mpd.maxPainPct) >= 0.3) b.push({ x: '**Max Pain magnet:** ' + _bfFmt(I.mpd.maxPainK, 0) + ' is ' + _bfPct(I.mpd.maxPainPct) + ' from spot; into expiry price tends to drift toward it — use it as a target/support-resistance level, not as a reason to fight today\'s flow.' });
        else if (I.mpd) b.push({ x: '**Expiry pin risk:** spot is within 0.3% of Max Pain ' + _bfFmt(I.mpd.maxPainK, 0) + ' — expect a tight range and fast option-premium decay; avoid buying options.', tone: 'warn' });
        if (I.eroding && I.eroding.length) b.push({ x: '**Watch the eroding wall(s):** ' + I.eroding.slice(0, 3).map(function (e) { return (e.side === 'R' ? 'R' : 'S') + ' ' + _bfFmt(e.strike, 0); }).join(', ') + ' — if price reaches one, expect it to give way rather than hold.', tone: 'warn' });
        if (b.length) items.push({ name: n, bullets: b });
    });
    return items;
}

function _bfRisks(S) {
    var R = [];
    function add(sev, x) { R.push({ sev: sev, x: x }); }
    var sig = S.signal, sc = S.score, w = S.window, cl = S.clock;
    if (S.vix.regime === 'EXTREME') add(3, 'India VIX is ' + _bfFix(S.vix.ltp, 1) + ' (≥30): the Trade Verdict engine treats this as NO TRADE — skip, or cut size drastically and widen stops.');
    else if (S.vix.regime === 'HIGH') add(2, 'India VIX is ' + _bfFix(S.vix.ltp, 1) + ' (HIGH): choppy conditions, conviction is heavily reduced (×0.65) — smaller size, wider stops.');
    else if (S.vix.regime === 'ELEVATED') add(1, 'India VIX is ' + _bfFix(S.vix.ltp, 1) + ' (ELEVATED): wider swings than usual; conviction reduced (×0.85).');
    if (S.vix.regime === 'NO DATA') add(1, 'India VIX is not cached, so volatility gating and the VIX-implied ranges are unavailable/unmodified.');
    if (sig && sig.signal === 'NO TRADE') add(3, 'The market signal is NO TRADE: ' + sig.reason);
    if (sc && sig && Math.abs(sc.total) > 4 && /WAIT/.test(sig.signal)) add(2, 'The score is ' + _bfSg(sc.total, 1) + ' but the app downgraded the signal to WAIT because index futures contradict it — the score is likely lagging the tape.');
    if (sc && sc.includeLagging && Math.abs(sc.lagging) > Math.abs(sc.leading) && _bfSign(sc.lagging, 1) !== _bfSign(sc.leading, 1) && _bfSign(sc.leading, 1) !== 0) add(2, 'Lagging pillars (' + _bfSg(sc.lagging, 1) + ') outweigh and oppose the leading pillars (' + _bfSg(sc.leading, 1) + ') — the headline score is being driven by slow, possibly stale inputs.');
    if (S.consensus && S.consensus.caution) add(2, 'Index vs breadth disagreement: the core indices and the broad constituent vote lean opposite ways.');
    var n50 = S.instr['NIFTY 50'], bn = S.instr['NIFTY BANK'];
    if (n50 && bn && n50.consensus && bn.consensus && n50.consensus.voting > 0 && bn.consensus.voting > 0 && _bfSign(n50.consensus.net, 0.2) !== 0 && _bfSign(bn.consensus.net, 0.2) !== 0 && _bfSign(n50.consensus.net, 0.2) !== _bfSign(bn.consensus.net, 0.2)) add(2, 'NIFTY 50 (' + n50.consensus.outcome + ') and NIFTY BANK (' + bn.consensus.outcome + ') disagree. Bank conviction has tended to lead, so a Nifty-only trade against Bank Nifty is lower conviction until one flips.');
    ['NIFTY 50', 'NIFTY BANK'].forEach(function (n) { var I = S.instr[n]; if (I && I.pf && I.pf.ok && (I.pf.zone === 'VIXU' || I.pf.zone === 'VIXL')) add(3, n + ' is at its VIX-implied daily range edge (' + I.pf.zone + '): the expected move is exhausted — no fresh entries in that direction.'); });
    var dz = Object.keys(S.instr).filter(function (n) { return S.instr[n].deadZone && _BF_CORE_NAMES.indexOf(n) !== -1; });
    if (dz.length) add(1, 'Dead zone active on ' + dz.join(', ') + ' — weak, conflicting signals; breakouts of normal levels inside the band are unreliable.');
    if (S.fg && S.fg.composite !== null && (S.fg.composite > 75 || S.fg.composite < 25)) add(1, 'Fear & Greed is at an extreme (' + Math.round(S.fg.composite) + '): ' + (S.fg.composite > 75 ? 'greed — chasing longs here is the crowded side' : 'fear — chasing shorts here is the crowded side') + '.');
    if (w.name === 'AVOID') add(1, 'The current window (' + w.label + ') has statistically poor signal quality.');
    if (w.name === 'CLOSED') add(1, 'The market is closed — everything here is planning for the next session, not live execution.');
    if (cl.isReplay) add(1, 'Snapshot/replay mode — nothing here is live.');
    ['NIFTY 50', 'NIFTY BANK'].forEach(function (n) { var I = S.instr[n]; if (I && I.dte !== null && I.dte !== undefined && I.dte <= 2) add(2, n + ' futures expire in ' + I.dte + ' day(s): pinning and squeeze moves are sharper, and option premium decays fast.'); });
    var fvo = Object.keys(S.instr).filter(function (n) { return S.instr[n].fvo && _BF_CORE_NAMES.indexOf(n) !== -1; });
    if (fvo.length) add(1, 'Futures trend and OI/OBV disagree on ' + fvo.join(', ') + ' — unconfirmed/early moves; wait for alignment before sizing up.');
    var stale = Object.keys(S.instr).filter(function (n) { var I = S.instr[n]; return I.oi && I.oi.ageMin !== null && I.oi.ageMin > 20 && _BF_CORE_NAMES.indexOf(n) !== -1; });
    if (!cl.isReplay && stale.length) add(1, 'OI data for ' + stale.join(', ') + ' is more than 20 minutes old — walls may have moved.');
    var eroding = Object.keys(S.instr).filter(function (n) { var I = S.instr[n]; return I.eroding && I.eroding.length && _BF_CORE_NAMES.indexOf(n) !== -1; });
    if (eroding.length) add(1, 'Walls are eroding on ' + eroding.join(', ') + ' — support/resistance there is weakening.');
    R.push({ sev: 0, x: 'Method caveats: OI/OBV as a standalone signal showed negative expectancy in this app\'s own accuracy replay (it is down-weighted in Master Consensus); only the 9:15 zone has real historical backtesting; Level Probability, Max Pain, IV skew, order flow and curve structure are reasoned live estimates, not fitted probabilities. Nothing here is a guarantee — you still place and manage the stop.' });
    R.sort(function (a, b) { return b.sev - a.sev; });
    return R;
}

function _bfChanges(S, prev) {
    var items = [];
    var snap = _bfSnapshot(S);
    if (!prev || prev.day !== snap.day) return { first: true, snap: snap, items: [{ x: 'This is the first briefing for ' + snap.day + ' — there is no earlier snapshot to compare against. From the next refresh onward this section lists exactly what moved.', tone: 'muted' }] };
    var mins = Math.max(0, Math.round((snap.ts - prev.ts) / 60000));
    function mv(label, a, b, d, unit, goodUp) {
        if (a === null || a === undefined || b === null || b === undefined) return;
        var diff = b - a; if (Math.abs(diff) < (d === 0 ? 0.5 : Math.pow(10, -d) * 0.5)) return;
        items.push({ x: label + ' moved from **' + (unit === '%' ? a.toFixed(d) + '%' : a.toFixed(d)) + '** to **' + (unit === '%' ? b.toFixed(d) + '%' : b.toFixed(d)) + '** (' + (diff >= 0 ? '+' : '') + diff.toFixed(d) + (unit === '%' ? ' pts' : '') + ').', tone: goodUp === null ? null : (diff > 0) === goodUp ? 'good' : 'bad' });
    }
    mv('Composite score', prev.score, snap.score, 2, '', true);
    mv('Leading score', prev.leading, snap.leading, 2, '', true);
    mv('Lagging score', prev.lagging, snap.lagging, 2, '', true);
    if (prev.signal !== snap.signal && snap.signal) items.push({ x: 'Market signal changed from **' + prev.signal + '** to **' + snap.signal + '**.', tone: /BUY/.test(snap.signal) ? 'good' : /SELL/.test(snap.signal) ? 'bad' : 'warn' });
    if (prev.confluence !== snap.confluence && snap.confluence) items.push({ x: 'Entry confluence changed from ' + prev.confluence + ' to **' + snap.confluence + '**.' });
    if (prev.cons && snap.cons && prev.cons.outcome !== snap.cons.outcome) items.push({ x: 'Overall Master Consensus flipped from **' + prev.cons.outcome + '** to **' + snap.cons.outcome + '**.', tone: _bfOutcomeTone(snap.cons.outcome) });
    if (prev.cons && snap.cons && (prev.cons.longs !== snap.cons.longs || prev.cons.shorts !== snap.cons.shorts)) items.push({ x: 'GO LONG count ' + prev.cons.longs + ' → **' + snap.cons.longs + '**, GO SHORT count ' + prev.cons.shorts + ' → **' + snap.cons.shorts + '**.' });
    ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'GIFT NIFTY', 'CRUDEOILM'].forEach(function (n) {
        var a = prev.px && prev.px[n], b = snap.px && snap.px[n]; if (!a || !b || a === b) return;
        var p = (b - a) / a * 100; if (Math.abs(p) < 0.02) return;
        items.push({ x: n + ' moved **' + (b - a >= 0 ? '+' : '−') + _bfFix(Math.abs(b - a), 1) + ' pts (' + _bfPct(p) + ')** since the last briefing (' + _bfFmt(a) + ' → ' + _bfFmt(b) + ').', tone: p > 0 ? 'good' : 'bad' });
    });
    mv('India VIX', prev.vix, snap.vix, 2, '', null);
    mv('Fear & Greed', prev.fg, snap.fg, 0, '', null);
    if (prev.bull !== null && snap.bull !== null && Math.abs(prev.bull - snap.bull) >= 0.02) items.push({ x: 'Trend Probability bull share moved from ' + Math.round(prev.bull * 100) + '% to **' + Math.round(snap.bull * 100) + '%**.', tone: snap.bull > prev.bull ? 'good' : 'bad' });
    var flips = [];
    Object.keys(snap.out || {}).forEach(function (n) { if (prev.out && prev.out[n] && prev.out[n] !== snap.out[n] && (_BF_CORE_NAMES.indexOf(n) !== -1 || (snap.opps || []).some(function (o) { return o.indexOf(n + '|') === 0; }) || (prev.opps || []).some(function (o) { return o.indexOf(n + '|') === 0; }))) flips.push(n + ': ' + prev.out[n] + ' → ' + snap.out[n]); });
    if (flips.length) items.push({ x: 'Instrument-level consensus flips: ' + flips.slice(0, 12).join('; ') + (flips.length > 12 ? ' … +' + (flips.length - 12) + ' more' : '') + '.', tone: 'info' });
    var pset = {}, nset = {}; (prev.opps || []).forEach(function (o) { pset[o] = 1; }); (snap.opps || []).forEach(function (o) { nset[o] = 1; });
    var newer = (snap.opps || []).filter(function (o) { return !pset[o]; }), gone = (prev.opps || []).filter(function (o) { return !nset[o]; });
    function fmtO(o) { var p = o.split('|'); return p[0] + ' ' + (p[1] === 'L' ? 'LONG' : 'SHORT') + ' (tier ' + p[2] + ')'; }
    if (newer.length) items.push({ x: '**New opportunities:** ' + newer.map(fmtO).join(', ') + '.', tone: 'good' });
    if (gone.length) items.push({ x: '**Opportunities that dropped off / downgraded:** ' + gone.map(fmtO).join(', ') + '.', tone: 'warn' });
    if (!items.length) items.push({ x: 'Nothing material changed in the ' + mins + ' minute(s) since the last briefing — the picture is stable.', tone: 'muted' });
    items.unshift({ x: 'Compared with the briefing from **' + prev.hhmm + '** (' + mins + ' min ago):', tone: 'muted' });
    return { first: false, snap: snap, items: items };
}

function _bfCoverage(S) {
    var B = [], total = Object.keys(S.instr).length;
    function cnt(pred) { return Object.keys(S.instr).filter(function (n) { return pred(S.instr[n]); }).length; }
    var core = _BF_CORE_NAMES.filter(function (n) { return S.instr[n]; });
    function ccnt(pred) { return core.filter(function (n) { return pred(S.instr[n]); }).length; }
    B.push(_bfTable(['Data layer', 'All tracked (' + total + ')', 'Core 9'], [
        ['Price + strike levels', cnt(function (I) { return I.pf && I.pf.ok; }) + '/' + total, ccnt(function (I) { return I.pf && I.pf.ok; }) + '/' + core.length],
        ['9:15 zone', cnt(function (I) { return !!I.zone915; }) + '/' + total, ccnt(function (I) { return !!I.zone915; }) + '/' + core.length],
        ['Futures REMARK', cnt(function (I) { return !!I.fut.remark; }) + '/' + total, ccnt(function (I) { return !!I.fut.remark; }) + '/' + core.length],
        ['OI/OBV option chain', cnt(function (I) { return I.hasOi; }) + '/' + total, ccnt(function (I) { return I.hasOi; }) + '/' + core.length],
        ['Master Consensus', cnt(function (I) { return !!I.consensus; }) + '/' + total, ccnt(function (I) { return !!I.consensus; }) + '/' + core.length],
        ['Curve-structure read', cnt(function (I) { return !!I.curve; }) + '/' + total, ccnt(function (I) { return !!I.curve; }) + '/' + core.length],
        ['Live order flow (WebSocket)', cnt(function (I) { return !!I.ofi; }) + '/' + total, ccnt(function (I) { return !!I.ofi; }) + '/' + core.length],
    ]));
    var lines = [];
    Object.keys(S.missing).forEach(function (m) {
        var list = S.missing[m];
        var shown = list.slice(0, 10).join(', ') + (list.length > 10 ? ' … +' + (list.length - 10) + ' more' : '');
        lines.push({ x: '**Missing ' + m + '** for ' + list.length + ' instrument(s): ' + shown + '.', tone: 'muted' });
    });
    S.gaps.forEach(function (g) { lines.push({ x: g, tone: 'warn' }); });
    if (!lines.length) lines.push({ x: 'No gaps detected — every collector returned data.', tone: 'good' });
    B.push(_bfUL(lines));
    var fix = [];
    if (!(typeof NSE_FUT_CURVE !== 'undefined' && Object.keys(NSE_FUT_CURVE).length)) fix.push('Run **Data Load** (floating toolbar) — the futures curve / expiry lists are empty, which disables expiry-days and curve reads.');
    if (cnt(function (I) { return !!I.ofi; }) === 0) fix.push('Open the **WebSocket Subscribe** popup (or an Instrument Detail View) so live order-flow imbalance can vote in Master Consensus.');
    if (!S.curveRows) fix.push('Open **Curve Structure Compare → SCAN ALL** once per session to add the curve vote and the contango/backwardation leans.');
    if (cnt(function (I) { return I.hasOi; }) < core.length) fix.push('Some core instruments have no OI chain cached — run a full refresh (Start Refresh) so walls, PCR, Max Pain and verdicts exist for them.');
    if (fix.length) { B.push(_bfH('How to improve coverage')); B.push(_bfUL(fix.map(function (x) { return { x: x }; }))); }
    return { id: 'coverage', title: 'Data coverage & gaps', icon: 'bi-clipboard-data', open: false, blocks: B };
}

// ══════════════ opportunities → text ══════════════════════════════════════════════════
function _bfOppSummary(o) {
    var p = o.plan, word = o.dir > 0 ? 'LONG' : 'SHORT';
    if (!p) return word + ' ' + o.name;
    var t = word + ' ' + o.name + ' — entry ' + _bfFmt(p.entry, 0) + ' (' + p.entryLabel + '), stop ' + _bfFmt(p.stop, 0) + ', target ' + _bfFmt(p.t1, 0) + (p.t2 !== null ? ' / ' + _bfFmt(p.t2, 0) : '') + (p.rr1 !== null ? ', R:R 1:' + _bfFix(p.rr1, 1) : '');
    return t;
}

// ══════════════ TL;DR + actions ═══════════════════════════════════════════════════════
function _bfTldr(S) {
    var T = [], sc = S.score, sig = S.signal, cl = S.clock, w = S.window;
    // A: stance
    if (sc && sig) {
        T.push(_bfP('**Stance: ' + sig.signal + '.** The composite score is ' + _bfSg(sc.total, 1) + ' (leading ' + _bfSg(sc.leading, 1) + ', lagging ' + _bfSg(sc.lagging, 1) + ') — ' + sig.reason, /BUY/.test(sig.signal) ? 'good' : /SELL/.test(sig.signal) ? 'bad' : 'warn'));
    } else T.push(_bfP('The composite score / market signal is not available yet — run a refresh, then regenerate this briefing.', 'warn'));
    // B: quality
    if (sc) {
        var lead = _bfSign(sc.leading, 1), lag = _bfSign(sc.lagging, 1);
        var q = lead !== 0 && lag !== 0 ? (lead === lag ? 'Fast (leading) and slow (lagging) indicators agree, so the read is higher quality.' : 'Fast and slow indicators disagree, so the read is lower quality — trust the fast half for direction and size down.') : 'Only one half of the score has a clear direction, so treat the headline number with moderate confidence.';
        if (S.confluence) q += ' Entry confluence is ' + S.confluence.bullish + ' bullish / ' + S.confluence.bearish + ' bearish of 5 pillars → ' + S.confluence.direction + '.';
        T.push(_bfP(q));
    }
    // C: index positions
    var pos = [];
    ['NIFTY 50', 'NIFTY BANK', 'SENSEX'].forEach(function (n) {
        var I = S.instr[n]; if (!I || !I.pf || !I.pf.ok) return;
        var z = { VIXU: 'above the VIX range top', AST: 'above AST', ASO: 'in the ASO zone', MID: 'inside the BSO–ASO band', BSO: 'in the BSO zone', BST: 'below BST', VIXL: 'below the VIX range floor' }[I.pf.zone];
        pos.push(n + ' ' + _bfFmt(I.pf.ltp) + ' (' + _bfPct(I.pf.changePct) + ', ' + z + ')');
    });
    if (pos.length) T.push(_bfP('**Where the indices are:** ' + pos.join('; ') + '.'));
    // D: internals
    var b = S.breadth, bits = [];
    if (b && b.n50) bits.push('NIFTY 50 constituents ' + b.n50.adv + '▲/' + b.n50.dec + '▼');
    if (b && b.bn) bits.push('BANK NIFTY constituents ' + b.bn.adv + '▲/' + b.bn.dec + '▼');
    if (b && b.b915) bits.push('9:15 breakouts (all scanned) ' + b.b915.all.up + '▲/' + b.b915.all.down + '▼');
    if (bits.length) T.push(_bfP('**Internals:** ' + bits.join(', ') + '.'));
    // E: vol / sentiment / probability
    var vs = ['India VIX ' + (S.vix.ltp ? _bfFix(S.vix.ltp, 1) : 'n/a') + ' (' + S.vix.regime + ')'];
    if (S.fg && S.fg.composite !== null) vs.push('Fear & Greed ' + Math.round(S.fg.composite) + ' (' + S.fg.label.label + ')');
    if (S.trendProb) vs.push('Trend Probability ' + Math.round(S.trendProb.bullPct * 100) + '% bull, confidence ' + S.trendProb.confidence + '/100');
    T.push(_bfP('**Volatility & sentiment:** ' + vs.join('; ') + '.'));
    // F: consensus
    var co = S.consensus;
    if (co) T.push(_bfP('**Master Consensus:** overall ' + co.outcome + ' (net ' + _bfSg(co.net, 2) + '); ' + co.longs.length + ' instruments GO LONG, ' + co.shorts.length + ' GO SHORT, ' + co.waits + ' WAIT.' + (co.caution ? ' ⚠ Index vs breadth disagree.' : ''), _bfOutcomeTone(co.outcome)));
    // G: opportunity
    var opps = S.opps || [], A = opps.filter(function (o) { return o.tier === 'A'; }), Bt = opps.filter(function (o) { return o.tier === 'B'; });
    if (A.length) T.push(_bfP('**Best opportunity:** ' + _bfOppSummary(A[0]) + ' (score ' + A[0].score + '/100' + (A[0].hc ? ', ★ high conviction' : '') + ').' + (A.length > 1 ? ' ' + (A.length - 1) + ' more tier-A setup(s) below.' : ''), A[0].dir > 0 ? 'good' : 'bad'));
    else if (Bt.length) T.push(_bfP('**No setup is actionable right now, but ' + Bt.length + ' are forming.** The strongest is ' + _bfOppSummary(Bt[0]) + ' (score ' + Bt[0].score + '/100) — it needs price to reach its entry level with the signals still agreeing.', 'warn'));
    else T.push(_bfP('**No opportunity clears the bar right now** — no instrument has a consensus direction backed by an actionable, confirmed verdict. Staying flat (or trading only clear ranges) is the disciplined call.', 'warn'));
    // H: timing
    T.push(_bfP('**Timing:** ' + w.name + ' — ' + w.label + (w.minsLeft !== null && w.next ? ' (changes to ' + w.next.name + ' in ' + w.minsLeft + ' min)' : '') + '.' + (cl.isReplay ? ' (Snapshot ' + cl.curDay + ' ' + cl.hhmm + ')' : ''), w.name === 'PRIME' ? 'good' : w.name === 'AVOID' ? 'warn' : null));
    return T;
}

function _bfActions(S) {
    var A = [], w = S.window, opps = S.opps || [], cl = S.clock;
    function add(tag, x, tone) { A.push({ tag: tag, x: x, tone: tone || null }); }
    var tradable = (w.name === 'PRIME' || w.name === 'OK');
    var nextTradable = null;
    // window
    if (w.key === 'weekend') add('PREPARE', 'The market is closed for the weekend. Use this time to review the setups below, set alerts at the listed levels, and run **Data Load** + a full refresh before Monday\'s open.', 'info');
    else if (w.key === 'pre') add('PREPARE', 'Pre-open. Check GIFT NIFTY\'s gap versus the previous close, wait for the **9:15 candle to close (9:20)** so the 9:15 zones exist, then let the first 30 minutes pass before initiating — 9:15–9:45 is the stop-hunt zone.', 'info');
    else if (w.key === 'open') add('AVOID', 'Opening chaos (' + w.label + '). Do not initiate new positions; note where the 9:15 zones and walls form. Prime window opens in ' + (w.minsLeft !== null ? w.minsLeft + ' min' : 'shortly') + '.', 'warn');
    else if (w.key === 'prime') add('NOW', 'You are in the **prime trending window** — the best hours to act on tier-A/B setups below, per the rules attached to each.', 'good');
    else if (w.key === 'mid') add('NOW', 'Mid-morning window is acceptable but momentum fades — favour tier-A setups, be selective on tier-B.', null);
    else if (w.key === 'lunch') add('AVOID', 'Lunch lull — thin volume and whipsaws. Do not open fresh positions; manage existing ones. Trading resumes at 14:00.', 'warn');
    else if (w.key === 'aft') add('NOW', 'Afternoon window is workable; prefer setups already in profit territory and avoid new positions after ~14:45.', null);
    else if (w.key === 'eod') add('AVOID', 'End-of-day squaring window — reversals are common. Square off intraday positions; hold only where you have a deliberate carry thesis (see the Overnight Carry Scanner).', 'warn');
    else add('REVIEW', 'The session is over. Review what worked in the "Earlier today" timeline, journal the trades (Notes tab → Import from Kite), and use the Overnight Carry / Level Fade scanners to prepare tomorrow\'s watchlist.', 'info');

    // opportunities
    var A1 = opps.filter(function (o) { return o.tier === 'A'; }).slice(0, 3);
    var B1 = opps.filter(function (o) { return o.tier === 'B'; }).slice(0, 4);
    A1.forEach(function (o) {
        var word = o.dir > 0 ? 'LONG' : 'SHORT', p = o.plan;
        var sz = o.size && o.size.ok ? (o.size.tooSmall ? ' Size: your risk budget (₹' + _bfFmt(o.size.riskAmt, 0) + ') is too small for one lot at this stop — skip or use a defined-risk option structure.' : ' Size: **' + (o.size.lot > 1 ? o.size.lots + ' lot(s)' : o.size.units + ' units') + '** (risk ₹' + _bfFmt(o.size.riskAmt, 0) + '' + (o.size.mult < 1 ? ', halved for thin consensus' : '') + ').') : '';
        var head = p ? _bfOppSummary(o) : word + ' ' + o.name;
        if (tradable) add('NOW', '**' + head + '.** ' + (p && p.atLevel ? 'Price is at the entry level.' : 'Entry is ' + _bfFix(p ? p.distPct : 0) + '% away — use a limit order at the level, do not chase.') + sz, o.dir > 0 ? 'good' : 'bad');
        else add('WAIT', '**' + head + '** is actionable on the numbers, but the window is ' + w.name + ' (' + w.label + ') — hold this for the next PRIME/OK window and re-check it then.' + sz, 'warn');
    });
    B1.forEach(function (o) {
        var word = o.dir > 0 ? 'LONG' : 'SHORT', p = o.plan;
        add('WAIT', '**' + (p ? _bfOppSummary(o) : word + ' ' + o.name) + '** — setup forming (score ' + o.score + '/100). ' + (p ? (p.atLevel ? 'Price is at the level but the verdict is not fully confirmed yet.' : 'Enter only if price ' + (o.dir > 0 ? 'pulls back to' : 'rallies into') + ' ' + _bfFmt(p.entry, 0) + ' (currently ' + _bfFix(p.distPct) + '% away) with futures and OI/OBV still agreeing.') : ''), 'warn');
    });
    if (!A1.length && !B1.length) add('STAY FLAT', 'No tier-A or tier-B opportunity exists. Do nothing until a setup clears — or trade only obvious ranges with tight stops and reduced size.', 'warn');

    // near-miss: what single thing would create a setup
    var near = opps.filter(function (o) { return o.tier === 'C'; }).slice(0, 3);
    if (near.length && !A1.length) add('WATCH', 'Closest to becoming actionable: ' + near.map(function (o) { return (o.dir > 0 ? 'LONG ' : 'SHORT ') + o.name + ' (score ' + o.score + ')'; }).join(', ') + ' — see the opportunity cards for what is missing on each.', 'info');

    // manage
    if (S.exitSig) {
        if (S.exitSig.long === 'EXIT') add('MANAGE', 'If you are **long NIFTY**: the exit rule has fired (NIFTY\'s zone trend turned negative or both index futures turned bearish) — exit or tighten to break-even.', 'bad');
        else add('MANAGE', 'If you are long NIFTY: the exit rule says **HOLD** (trend and futures have not flipped against you). Trail stops to the last confirmed wall.', null);
        if (S.exitSig.short === 'EXIT') add('MANAGE', 'If you are **short NIFTY**: the exit rule has fired (trend turned positive or both index futures turned bullish) — exit or tighten to break-even.', 'good');
        else add('MANAGE', 'If you are short NIFTY: the exit rule says **HOLD** (trend and futures have not flipped against you).', null);
    }
    // risk / sizing
    if (S.vix.regime === 'EXTREME') add('RISK', 'VIX ≥ 30: skip index trades or cut size drastically and widen stops.', 'bad');
    else if (S.vix.regime === 'HIGH' || S.vix.regime === 'ELEVATED') add('RISK', 'VIX is ' + S.vix.regime.toLowerCase() + ': halve your usual size and expect wider swings.', 'warn');
    if (S.consensus && S.consensus.caution) add('RISK', 'Index vs breadth disagree — prefer index-level trades (NIFTY/BANK) over individual stocks until they realign.', 'warn');
    var sc = S.score; if (sc && sc.includeLagging && _bfSign(sc.leading, 1) !== 0 && _bfSign(sc.lagging, 1) !== 0 && _bfSign(sc.leading, 1) !== _bfSign(sc.lagging, 1)) add('RISK', 'Fast and slow indicators disagree — size down and wait for them to align.', 'warn');
    var cap = 0; try { cap = parseFloat(MARGIN) || 0; } catch (e) {}
    if (!cap) add('FIX', 'Set **Account Capital** in Settings → Market Trend Settings so each opportunity can show a position size.', 'info');
    if (Object.keys(S.missing).length || S.gaps.length) add('FIX', 'Some data layers are missing (see Data coverage) — the briefing says so wherever it matters, but running a full refresh / Data Load will make it sharper.', 'muted');
    return A;
}

// ══════════════ assemble ══════════════════════════════════════════════════════════════
function _bfBuildBrief(S, prevSnap, seq) {
    var brief = { seq: seq, ts: S.ts, clock: S.clock, window: S.window, vix: S.vix };
    var sig = S.signal ? S.signal.signal : 'NO DATA';
    brief.headline = { signal: sig, tone: /BUY/.test(sig) ? 'good' : /SELL/.test(sig) ? 'bad' : 'warn',
                       score: S.score ? S.score.total : null, consensus: S.consensus ? S.consensus.outcome : null,
                       top: (S.opps || [])[0] || null };
    brief.tldr = _bfTldr(S);
    brief.actions = _bfActions(S);
    brief.opps = (S.opps || []).slice(0, 12);
    var changes = _bfChanges(S, prevSnap);
    brief.changes = changes;
    brief.risks = _bfRisks(S);
    brief.playbook = _bfPlaybook(S);

    var sections = [];
    sections.push({ id: 'changes', title: 'What changed since the last refresh', icon: 'bi-arrow-left-right', open: true, blocks: [_bfUL(changes.items)] });
    sections.push(_bfSectionContext(S));
    sections.push(_bfSectionBreadth(S));
    sections.push(_bfSectionSentiment(S));
    // deep dives — core instruments + any opportunity name not already core
    var dive = _BF_CORE_NAMES.filter(function (n) { return S.instr[n] && n !== 'USDINR' || n === 'USDINR'; });
    (S.opps || []).filter(function (o) { return o.tier === 'A' || o.tier === 'B'; }).forEach(function (o) { if (dive.indexOf(o.name) === -1) dive.push(o.name); });
    var diveBlocks = [_bfP('Each card below merges everything the app knows about the instrument — price and level map, score anatomy, futures, option-chain structure, Max Pain/GEX, probabilities, all nine Master-Consensus engines, and the Context/Location/Confirmation verdict — and ends with a plain-English read-through.', 'muted')];
    var diveCards = dive.map(function (n) {
        var I = S.instr[n]; if (!I) return null;
        var c = I.consensus;
        return { name: n, chips: [
            c ? { x: c.outcome + (c.thin && c.voting > 0 ? ' ⚠thin' : ''), tone: _bfOutcomeTone(c.outcome) } : null,
            I.verdict ? { x: 'Verdict ' + I.verdict.label + (I.hc ? ' ★' : ''), tone: /^LONG$/.test(I.verdict.label) ? 'good' : /^SHORT$/.test(I.verdict.label) ? 'bad' : 'warn' } : null,
            I.cs ? { x: 'Score ' + _bfSg(I.cs.total, 1), tone: _bfTone(_bfSign(I.cs.total, 1)) } : null,
            I.pf && I.pf.ok ? { x: _bfFmt(I.pf.ltp) + (I.pf.changePct !== null ? ' (' + _bfPct(I.pf.changePct) + ')' : ''), tone: I.pf.changePct !== null ? _bfTone(_bfSign(I.pf.changePct, 0.02)) : null } : null,
        ].filter(Boolean), blocks: _bfNarrateInstrument(I, S) };
    }).filter(Boolean);
    sections.push({ id: 'dives', title: 'Instrument deep-dives', icon: 'bi-search', open: false, blocks: diveBlocks, cards: diveCards });
    sections.push(_bfSectionBoards(S));
    var pb = brief.playbook;
    sections.push({ id: 'playbook', title: 'Watch-levels & if-then playbook', icon: 'bi-signpost-split-fill', open: false,
        blocks: pb.length ? pb.map(function (p) { return { t: 'group', title: p.name, items: p.bullets }; }) : [_bfP('No level map is available yet (needs price + strike levels).', 'muted')] });
    sections.push({ id: 'risks', title: 'Risks & cautions', icon: 'bi-exclamation-triangle-fill', open: true,
        blocks: [_bfUL(brief.risks.map(function (r) { return { x: r.x, tone: r.sev >= 3 ? 'bad' : r.sev === 2 ? 'warn' : r.sev === 1 ? null : 'muted' }; }))] });
    sections.push(_bfCoverage(S));
    brief.sections = sections;
    brief.snap = changes.snap;
    return brief;
}
