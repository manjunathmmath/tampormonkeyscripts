const my_css = GM_getResourceText("TOASTIFY_CSS");
const boot_css = GM_getResourceText("BOOTSTRAP_CSS");
const common_css = GM_getResourceText("COMMON_CSS");
const popup_window_css = GM_getResourceText("POPUP_WINDOW_CSS");
const sackbar_css = GM_getResourceText("SACKBAR_CSS");
const datatable_css = GM_getResourceText("DATATABLE_CSS");
const bootstrap_icon_css = GM_getResourceText("BOOTSTRAP_ICON_CSS");
const fixed_column_css = GM_getResourceText("FIXED_COLUMN_CSS");
const c3_css = GM_getResourceText("C3_CSS");

GM_addStyle(my_css);
GM_addStyle(sackbar_css);
GM_addStyle(boot_css);
GM_addStyle(datatable_css);
GM_addStyle(common_css);
GM_addStyle(popup_window_css);
GM_addStyle(bootstrap_icon_css);
GM_addStyle(fixed_column_css);
GM_addStyle(c3_css);

// ── Compact the MonkeyConfig Settings dialog ────────────────────────────────────
// Grown to 35+ fields (per-commodity MCX expiry dropdowns, NIFTY/SENSEX overrides, hedge
// diffs, etc.) — was rendering as one very tall AND very wide window (the container is
// `display:table`, so it auto-sizes to its widest row with no cap at all, e.g. the API
// Secret text value). MonkeyConfig opens its dialog in its OWN separate browser
// window/layer (not the page's own DOM), whose only stylesheet is the string in
// MonkeyConfig.res.stylesheets.main — appending to that string (before the dialog is
// ever opened) is the only way to restyle it, since GM_addStyle on the main page's
// document doesn't reach that separate context.
// Caps both height (internal scrollbar) AND width (fixed-width inputs/selects instead of
// auto-sizing to content), and shrinks row padding/font-size so more fields fit per screen.
// Real 2-column reflow via CSS multi-column layout: MonkeyConfig renders one flat
// <table> of <tr> field rows (label td + field td each) with a final buttons <tr> at the
// end — there's no way to change that markup from here, but CSS multi-column layout
// (column-count) can still wrap ordinary block-level content into columns. Each row is
// switched to display:inline-block (so column-count can flow it) except the LAST row
// (Save/Cancel/Defaults), which is forced full-width via column-span so it stays pinned
// as one bar under both columns instead of getting stranded mid-column.
if (typeof MonkeyConfig !== 'undefined' && MonkeyConfig.res && MonkeyConfig.res.stylesheets) {
    MonkeyConfig.res.stylesheets.main += '\
div.__MonkeyConfig_container {\
    max-height: 82vh !important;\
    max-width: 820px !important;\
    overflow-y: auto !important;\
    overflow-x: hidden !important;\
    font-size: 13px !important;\
}\
div.__MonkeyConfig_container table {\
    display: block !important;\
    width: 100% !important;\
}\
div.__MonkeyConfig_container table tbody {\
    display: block !important;\
    column-count: 2 !important;\
    column-gap: 1.2em !important;\
    column-fill: balance !important;\
}\
div.__MonkeyConfig_container table tr {\
    display: inline-block !important;\
    width: 100% !important;\
    break-inside: avoid !important;\
    -webkit-column-break-inside: avoid !important;\
}\
div.__MonkeyConfig_container table tr:last-child {\
    display: block !important;\
    column-span: all !important;\
    -webkit-column-span: all !important;\
    width: 100% !important;\
}\
div.__MonkeyConfig_container table td {\
    display: table-cell !important;\
    padding: 0.22em 0.35em !important;\
    font-size: 13px !important;\
    white-space: normal !important;\
}\
div.__MonkeyConfig_container table tr td:first-child {\
    width: 47% !important;\
}\
div.__MonkeyConfig_container input[type="text"],\
div.__MonkeyConfig_container select {\
    font-size: 13px !important;\
    padding: 3px 4px !important;\
    height: auto !important;\
    width: 170px !important;\
    max-width: 170px !important;\
    box-sizing: border-box !important;\
}\
div.__MonkeyConfig_container h1 {\
    font-size: 130% !important;\
    padding-bottom: 0.2em !important;\
}\
label[for="__MonkeyConfig_field_hdr_nse"],\
label[for="__MonkeyConfig_field_hdr_mcx"] {\
    font-weight: bold !important;\
    font-size: 105% !important;\
    letter-spacing: 0.03em !important;\
    display: block !important;\
    margin-top: 0.4em !important;\
    padding-top: 0.3em !important;\
    border-top: 1px solid #999 !important;\
}';
}