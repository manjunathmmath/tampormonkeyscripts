const my_css = GM_getResourceText("TOASTIFY_CSS");
const boot_css = GM_getResourceText("BOOTSTRAP_CSS");
const common_css = GM_getResourceText("COMMON_CSS");
const popup_window_css = GM_getResourceText("POPUP_WINDOW_CSS");
const sackbar_css = GM_getResourceText("SACKBAR_CSS");
const datatable_css = GM_getResourceText("DATATABLE_CSS");
const bootstrap_icon_css = GM_getResourceText("BOOTSTRAP_ICON_CSS");
const fixed_column_css = GM_getResourceText("FIXED_COLUMN_CSS");
const c3_css = GM_getResourceText("C3_CSS");

// ── Scope third-party library CSS to this app's own containers only ──────────────────
// GM_addStyle injects these stylesheets directly into kite.zerodha.com's page <head> with
// NO isolation (no shadow DOM, no iframe) — Bootstrap's own unscoped resets in particular
// (`*`, `h1`-`h6`, `p`, `table`, `button`, `input`, `select`, `textarea`, `img`, `label`,
// etc.) were overriding Zerodha's OWN native page styling site-wide, not just inside this
// app's own UI. _gtbScopeCss rewrites every selector to be prefixed with a descendant
// combinator off this app's own top-level containers (GTB_CSS_SCOPE_ROOTS, kept in sync by
// hand with the equivalent list in common.css's own former-:root blocks — see that file),
// so e.g. Bootstrap's `table { ... }` becomes `<app roots> table { ... }` and only ever
// applies to elements this app itself renders.
// Deliberately NOT applied to popup_window_css (its selectors are already `popupwindow_*`-
// prefixed by the library itself, and several of its own top-level selectors — e.g.
// `.popupwindow_container` — are THEMSELVES one of our scope roots; prefixing would turn
// `.popupwindow_container { ... }` into a self-referential descendant selector
// `.popupwindow_container .popupwindow_container { ... }` that no longer matches the single
// element it's meant to style) or to toastify/sackbar/bootstrap-icon CSS (already narrowly
// class-prefixed by their own libraries, negligible collision risk against Kite's own
// class names).
// Wrapped in :where(...) so the whole multi-root list acts as ONE compound selector when
// glued onto another selector with a descendant combinator below -- without this, gluing a
// comma-containing string directly onto "sel" and then comma-splitting the result would
// produce separate top-level selectors like "#gtb-popup-win" (matching that element BARE,
// not just its descendants) instead of one scoped "<root> sel" per original comma branch.
// :where() (not :is()) so this never adds specificity beyond what each rule already had.
var GTB_CSS_SCOPE_ROOTS = ':where(#gtb-popup-win, .popupwindow_container, #groot-maximize-overlay, '
    + '#gtb-chartgrid-overlay, #gtb-info-pop, #gtb-daychart-overlay, #gtb-combochart-overlay, #gtb-tools-flyout)';

// Splits a comma-separated selector list at TOP-LEVEL commas only (not inside parens, e.g.
// `:not(a, b)` or `:is(.x, .y)` must stay intact as one selector), prefixes each with the
// scope + a descendant combinator, and rejoins. `:root` is special-cased to become the scope
// itself (no extra descendant space) -- we want the app's OWN containers to carry any
// custom-property definitions, not some descendant of them (which may not exist).
function _gtbPrefixSelectorList(selectorList, scope) {
    var parts = [], depth = 0, cur = '';
    for (var i = 0; i < selectorList.length; i++) {
        var ch = selectorList[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; }
        else cur += ch;
    }
    parts.push(cur);
    return parts.map(function (sel) {
        sel = sel.trim();
        if (!sel) return '';
        if (sel === ':root') return scope;
        return scope + ' ' + sel;
    }).filter(function (s) { return s; }).join(', ');
}

// Walks the CSS text at the top level, isolating one rule (selector-list + { body }) at a
// time via paren-aware/brace-depth-aware scanning (no full CSS parser needed -- these library
// stylesheets are well-formed). @font-face/@keyframes/@page/@charset/@import/@viewport are
// copied through completely untouched (not element selectors -- prefixing them would break or
// no-op them); @media/@supports/@document keep their condition as-is and recurse into their
// body so nested rules still get scoped; everything else gets its selector list prefixed.
function _gtbScopeCss(css, scopeSelector) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, ''); // strip comments first so braces/parens inside them can't confuse the walker
    var out = '', i = 0, n = css.length;
    while (i < n) {
        var start = i, depth = 0, j = i;
        while (j < n && !(css[j] === '{' && depth === 0)) {
            if (css[j] === '(') depth++;
            else if (css[j] === ')') depth--;
            j++;
        }
        if (j >= n) { out += css.slice(start); break; } // trailing whitespace after the last rule
        var prelude = css.slice(start, j);
        var trimmedPrelude = prelude.trim();

        var braceDepth = 1, k = j + 1; // find this block's matching '}', honoring nested braces
        while (k < n && braceDepth > 0) {
            if (css[k] === '{') braceDepth++;
            else if (css[k] === '}') braceDepth--;
            k++;
        }
        var body = css.slice(j + 1, k - 1);

        if (/^@(font-face|keyframes|-webkit-keyframes|-moz-keyframes|-o-keyframes|page|charset|import|viewport|-ms-viewport)\b/i.test(trimmedPrelude)) {
            out += prelude + '{' + body + '}';
        } else if (/^@(media|supports|document|-moz-document)\b/i.test(trimmedPrelude)) {
            out += prelude + '{' + _gtbScopeCss(body, scopeSelector) + '}';
        } else if (!trimmedPrelude) {
            out += '{' + body + '}'; // defensive -- shouldn't occur in well-formed CSS
        } else {
            out += _gtbPrefixSelectorList(trimmedPrelude, scopeSelector) + '{' + body + '}';
        }
        i = k;
    }
    return out;
}

// Wrapped in try/catch with a fallback to the ORIGINAL unscoped CSS -- a scoping bug should
// never be able to break this app's own styling entirely; worst case it silently reverts to
// the pre-scoping behavior for that one stylesheet.
function _gtbScopeCssSafe(css, label) {
    try { return _gtbScopeCss(css, GTB_CSS_SCOPE_ROOTS); }
    catch (e) { console.warn('[Groot Bot] CSS scoping failed for', label, '-- using unscoped fallback', e); return css; }
}

GM_addStyle(my_css);
GM_addStyle(sackbar_css);
GM_addStyle(_gtbScopeCssSafe(boot_css, 'bootstrap.css'));
GM_addStyle(_gtbScopeCssSafe(datatable_css, 'datatables.css'));
GM_addStyle(common_css);
GM_addStyle(popup_window_css);
GM_addStyle(bootstrap_icon_css);
GM_addStyle(_gtbScopeCssSafe(fixed_column_css, 'fixedColumns.css'));
GM_addStyle(_gtbScopeCssSafe(c3_css, 'c3.css'));

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