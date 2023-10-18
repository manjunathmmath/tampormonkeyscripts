// ==UserScript==
// @name         betterKiteAI
// @namespace    betterKiteAI
// @version      1.0
// @description  Introduces small features on top of kite app
// @author       Manjunath
// @match        https://kite.zerodha.com/*
// @match        https://console.zerodha.com/*
// @match        https://insights.sensibull.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_getClipboard
// @resource     BOOTSTRAP_CSS http://localhost:3000/dist/css/bootstrap.css
// @require      http://localhost:3000/global/vendor/jquery/jquery.js
// @require      http://localhost:3000/dist/js/bootstrap.js

// @require      http://localhost:3000/global/vendor/jquery/jquery.js
// @require      http://localhost:3000/tampormonkey/common/monkeyconfig.js
// @require      http://localhost:3000/tampormonkey/common/axios.min.js
// @require      http://localhost:3000/tampormonkey/common/qs-lite.min.js
// @require      http://localhost:3000/tampormonkey/common/moment.min.js
// @require      http://localhost:3000/tampormonkey/common/popper.min.js
// @require      http://localhost:3000/tampormonkey/common/tippy-bundle.umd.min.js
// @require      http://localhost:3000/tampormonkey/common/sweetalert2@11.js
// @require      http://localhost:3000/tampormonkey/common/toastify-js.js
// @resource     TOASTIFY_CSS http://localhost:3000/tampormonkey/common/toastify.min.css
// @resource     COMMON_CSS http://localhost:3000/tampormonkey/betterkiteAI/commonStyle.css
// @require      http://localhost:3000/tampormonkey/common/betterCommon.js
// @require      http://localhost:3000/tampormonkey/betterkiteAI/nifty50Prediction.js
// @require      http://localhost:3000/tampormonkey/betterkiteAI/bankNiftyPrediction.js
// @require      http://localhost:3000/tampormonkey/betterkiteAI/script.js
// @require      http://localhost:3000/tampormonkey/betterkiteAI/stockPrediction.js
// @require      http://localhost:3000/tampormonkey/betterkiteAI/nifty50Adr.js
// @require      http://localhost:3000/tampormonkey/betterkiteAI/niftyBankAdr.js
// @require      http://localhost:3000/tampormonkey/betterkiteAI/niftyITAdr.js
// @require      http://localhost:3000/tampormonkey/betterkiteAI/niftyMetalAdr.js
// @require      http://localhost:3000/tampormonkey/betterkiteAI/niftyFinanceAdr.js
// @downloadURL  http://localhost:3000/tampormonkey/betterkiteAI/betterKiteAI.user.js
// @updateURL    http://localhost:3000/tampormonkey/betterkiteAI/betterKiteAI.meta.js
// ==/UserScript==

// This is free and unencumbered software released into the public domain.

// Anyone is free to copy, modify, publish, use, compile, sell, or
// distribute this software, either in source code form or as a compiled
// binary, for any purpose, commercial or non-commercial, and by any
// means.

// In jurisdictions that recognize copyright laws, the author or authors
// of this software dedicate any and all copyright interest in the
// software to the public domain. We make this dedication for the benefit
// of the public at large and to the detriment of our heirs and
// successors. We intend this dedication to be an overt act of
// relinquishment in perpetuity of all present and future rights to this
// software under copyright law.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
// OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
// ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
// OTHER DEALINGS IN THE SOFTWARE.

// For more information, please refer to <https://unlicense.org>
