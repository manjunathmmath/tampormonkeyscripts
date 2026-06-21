// ==UserScript==
// @name         Triple Edge System
// @namespace    TripleEdgeSystem
// @version      1.2
// @description  Institutional intraday trading system (TA + SMC + Market Profile + Live OI + AI + Risk) + F&O Mastery (Greeks, 4-box OI chain, strategy selector, expiry manual). Runs on Kite.
// @author       Manjunath
// @match        https://kite.zerodha.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @require      http://localhost:3000/autoTrade/global/vendor/jquery/jquery.js
// @require      http://localhost:3000/tripleEdge/tes-tokens.js
// @require      http://localhost:3000/autoTrade/optionStrike.js
// @require      http://localhost:3000/tripleEdge/tes-engine.js
// @require      http://localhost:3000/tripleEdge/tes-fno.js
// @require      http://localhost:3000/tripleEdge/tes-oi.js
// @require      http://localhost:3000/tripleEdge/tes-app.js
// @downloadURL  http://localhost:3000/tripleEdge/tes.user.js
// @updateURL    http://localhost:3000/tripleEdge/tes.user.js
// ==/UserScript==

// Triple Edge System — standalone from Groot Bot.
// A floating "TES" button (bottom-right of kite.zerodha.com) opens the dashboard.
//
// Curriculum -> code mapping (see tes-engine.js):
//   M2  Candle psychology & VSA          -> behavior.candles / behavior.vsa
//   M3  Structure / trends / gaps / MTF  -> struct.swings / dowTrend / gaps
//   M4  Indicators & regime              -> ind.* / regime
//   M6/M7 Smart Money Concepts           -> struct.orderBlocks / fvg / liquidity / bosChoch
//   M8  Volume / Market Profile          -> profile.volumeProfile
//   M9  Confluence A+ scoring            -> confluence
//   M11 Risk / position sizing           -> risk
//   M12 Journal + AI review prompt       -> tes-app journal / aiPrompt
