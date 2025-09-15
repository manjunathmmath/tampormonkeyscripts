// ==UserScript==
// @name         commoditiesMarketTrend
// @namespace    commoditiesMarketTrend
// @version      1.0
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
// @resource     BOOTSTRAP_CSS http://localhost:3000/autoTradeCommodities/dist/css/bootstrap.css
// @resource     DATATABLE_CSS http://localhost:3000/autoTradeCommodities/global/vendor/datatables/datatables.min.css
// @resource     BOOTSTRAP_ICON_CSS http://localhost:3000/autoTradeCommodities/dist/font/bootstrap-icons.css
// @resource     POPUP_WINDOW_CSS http://localhost:3000/autoTradeCommodities/common/popupwindow/popupwindow.css
// @resource     FIXED_COLUMN_CSS http://localhost:3000/autoTradeCommodities/global/vendor/datatables/fixedColumns.dataTables.min.css

// @require      http://localhost:3000/autoTradeCommodities/global/vendor/jquery/jquery.js
// @require      http://localhost:3000/autoTradeCommodities/dist/js/bootstrap.js
// @require      http://localhost:3000/autoTradeCommodities/common/toastify-js.js
// @require      http://localhost:3000/autoTradeCommodities/common/popupwindow/popupwindow.js
// @require      http://localhost:3000/autoTradeCommodities/global/vendor/datatables/jquery.dataTables.min.js
// @require      http://localhost:3000/autoTradeCommodities/global/vendor/datatables/dataTables.fixedColumns.min.js
// @require      http://localhost:3000/autoTradeCommodities/global/vendor/datatables/fixedColumns.dataTables.js
// @require      http://localhost:3000/autoTradeCommodities/global/vendor/datatables/dataTables.buttons.min.js

// @require      http://localhost:3000/autoTradeCommodities/global/vendor/buttons/buttons.html5.min.js
// @require      http://localhost:3000/autoTradeCommodities/global/vendor/buttons/buttons.print.min.js
// @require      http://localhost:3000/autoTradeCommodities/global/vendor/buttons/jszip.min.js

// @require      http://localhost:3000/autoTradeCommodities/global/vendor/fusioncharts/fusioncharts.js
// @require      http://localhost:3000/autoTradeCommodities/global/vendor/fusioncharts/fusioncharts.charts.js
// @require      http://localhost:3000/autoTradeCommodities/global/vendor/fusioncharts/fusioncharts.powercharts.js
// @require      http://localhost:3000/autoTradeCommodities/global/vendor/fusioncharts/themes/fusioncharts.theme.fusion.js
// @require      http://localhost:3000/autoTradeCommodities/global/vendor/fusioncharts/fusioncharts.jqueryplugin.min.js


// @require      http://localhost:3000/autoTradeCommodities/common/monkeyconfig.js
// @require      http://localhost:3000/autoTradeCommodities/common/axios.min.js
// @require      http://localhost:3000/autoTradeCommodities/common/qs-lite.min.js
// @require      http://localhost:3000/autoTradeCommodities/common/moment.min.js
// @require      http://localhost:3000/autoTradeCommodities/common/popper.min.js
// @require      http://localhost:3000/autoTradeCommodities/common/tippy-bundle.umd.min.js
// @require      http://localhost:3000/autoTradeCommodities/common/sweetalert2@11.js
// @require      http://localhost:3000/autoTradeCommodities/common/toastify-js.js
// @resource     TOASTIFY_CSS http://localhost:3000/autoTradeCommodities/common/toastify.min.css
// @resource     SACKBAR_CSS http://localhost:3000/autoTradeCommodities/common/sackbar/js-snackbar.min.css
// @require      http://localhost:3000/autoTradeCommodities/common/sackbar/js-snackbar.min.js
// @resource     COMMON_CSS http://localhost:3000/autoTradeCommodities/common.css
// @require      http://localhost:3000/autoTradeCommodities/common/common.js
// @require      http://localhost:3000/autoTradeCommodities/common/alertSound.js
// @require      http://localhost:3000/autoTradeCommodities/constants.js
// @require      http://localhost:3000/autoTradeCommodities/optionStrike.js
// @require      http://localhost:3000/autoTradeCommodities/config.js
// @require      http://localhost:3000/autoTradeCommodities/monkeyStyle.js
// @require      http://localhost:3000/autoTradeCommodities/utils.js
// @require      http://localhost:3000/autoTradeCommodities/script.js
// @require      http://localhost:3000/autoTradeCommodities/oiViewer.js
// @downloadURL  http://localhost:3000/autoTradeCommodities/autoTradeCommodities.user.js
// @updateURL    http://localhost:3000/autoTradeCommodities/autoTradeCommodities.meta.js
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
