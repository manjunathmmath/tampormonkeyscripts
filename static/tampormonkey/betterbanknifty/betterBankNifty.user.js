// ==UserScript==
// @name         betterBankNifty
// @namespace    betterBankNifty
// @version      0.02
// @description  Introduces small features on top of Bank Nifty chart website
// @author       Manjunath Math
// @match        https://kite.zerodha.com/chart/ext/tvc/INDICES/NIFTY%20BANK/260105
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_setClipboard
// @grant        GM_getClipboard
// @grant        GM_registerMenuCommand
// @require      http://localhost:9080/global/vendor/jquery/jquery.js
// @require      http://localhost:9080/tampormonkey/common/monkeyconfig.js
// @require      http://localhost:9080/tampormonkey/common/waitForKeyElements.js
// @resource     STYLE_CSS http://localhost:9080/tampormonkey/betterbanknifty/style.css
// @require      http://localhost:9080/tampormonkey/betterbanknifty/script.js
// @downloadURL  http://localhost:9080/tampormonkey/betterbanknifty/betterBankNifty.user.js
// @updateURL    http://localhost:9080/tampormonkey/betterbanknifty/betterBankNifty.meta.js
// ==/UserScript==
