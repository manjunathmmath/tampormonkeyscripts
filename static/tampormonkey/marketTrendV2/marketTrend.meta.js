// ==UserScript==
// @name         marketTrend
// @namespace    marketTrend
// @version      2.0
// @description  Get the Market Trend
// @author       Manjunath
// @match        https://kite.zerodha.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_getClipboard
// @resource     BOOTSTRAP_CSS http://localhost:3000/dist/css/bootstrap.css
// @resource     DATATABLE_CSS http://localhost:3000/global/vendor/datatables/datatables.min.css
// @resource     BOOTSTRAP_ICON_CSS http://localhost:3000/dist/font/bootstrap-icons.css
// @resource     POPUP_WINDOW_CSS http://localhost:3000/tampormonkey/common/popupwindow/popupwindow.css
// @require      http://localhost:3000/global/vendor/jquery/jquery.js
// @require      http://localhost:3000/dist/js/bootstrap.js
// @require      http://localhost:3000/tampormonkey/common/toastify-js.js
// @require      http://localhost:3000/tampormonkey/common/popupwindow/popupwindow.js
// @require      http://localhost:3000/global/vendor/datatables/jquery.dataTables.min.js
// @require      http://localhost:3000/global/vendor/fusioncharts/fusioncharts.js
// @require      http://localhost:3000/global/vendor/fusioncharts/fusioncharts.charts.js
// @require      http://localhost:3000/global/vendor/fusioncharts/fusioncharts.powercharts.js
// @require      http://localhost:3000/global/vendor/fusioncharts/themes/fusioncharts.theme.fusion.js
// @require      http://localhost:3000/global/vendor/fusioncharts/fusioncharts.jqueryplugin.min.js
// @require      http://localhost:3000/tampormonkey/common/monkeyconfig.js
// @require      http://localhost:3000/tampormonkey/common/axios.min.js
// @require      http://localhost:3000/tampormonkey/common/qs-lite.min.js
// @require      http://localhost:3000/tampormonkey/common/moment.min.js
// @require      http://localhost:3000/tampormonkey/common/popper.min.js
// @require      http://localhost:3000/tampormonkey/common/tippy-bundle.umd.min.js
// @require      http://localhost:3000/tampormonkey/common/sweetalert2@11.js
// @require      http://localhost:3000/tampormonkey/common/toastify-js.js
// @resource     TOASTIFY_CSS http://localhost:3000/tampormonkey/common/toastify.min.css
// @resource     SACKBAR_CSS http://localhost:3000/tampormonkey/common/sackbar/js-snackbar.min.css
// @require      http://localhost:3000/tampormonkey/common/sackbar/js-snackbar.min.js
// @resource     COMMON_CSS http://localhost:3000/tampormonkey/marketTrendV2/commonStyle.css
// @require      http://localhost:3000/tampormonkey/common/betterCommon.js
// @require      http://localhost:3000/tampormonkey/marketTrendV2/alertSound.js
// @require      http://localhost:3000/tampormonkey/marketTrendV2/constants.js
// @require      http://localhost:3000/tampormonkey/marketTrendV2/script.js
// @require      http://localhost:3000/tampormonkey/marketTrendV2/showWeightageStocks.js
// @require      http://localhost:3000/tampormonkey/marketTrendV2/stockScanner.js
// @require      http://localhost:3000/tampormonkey/marketTrendV2/readTicksFromStorage.js
// @require      http://localhost:3000/tampormonkey/marketTrendV2/algoStockTrades.js
// @require      http://localhost:3000/tampormonkey/marketTrendV2/futures.js
// @downloadURL  http://localhost:3000/tampormonkey/marketTrendV2/marketTrend.user.js
// @updateURL    http://localhost:3000/tampormonkey/marketTrendV2/marketTrend.meta.js
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
