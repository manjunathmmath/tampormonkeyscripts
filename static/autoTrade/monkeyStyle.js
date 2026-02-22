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