// ─────────────────────────────────────────────────────────────────────────────────────────────
// Data Recorder panel (v29.520). The recording is the replay in replayRecorder.js: it replays one past day through the dashboard's own logic and sends
// every metric of every 5-minute slot to the local recorder server (nodeserver, /api/snapshot). During a replay ALL price history comes from the OFFICIAL
// Kite Connect API (api.kite.trade) with the api_key + api_access_token from Settings, read by this browser tab and sent nowhere else; the /oms (enctoken)
// path is not used while a replay runs and is untouched otherwise. This file is the panel around it: server status, a one-call test of the official API
// from this browser (exactly the call the replay makes), the replay controls (replayRecorder.js `_rpPanelHtml`) and the list of replayed days.
// Opened from All Tools > Data Recorder. See docs/ai-data-plan.md.
// ─────────────────────────────────────────────────────────────────────────────────────────────

var _DR = { server: 'http://localhost:3000', poll: null, state: null };

function _drEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _drIst(ms) { var d = new Date((ms == null ? Date.now() : ms) + 19800000); return d.toISOString().slice(0, 10); }

function _drReq(method, path, body) {
    return new Promise(function (resolve) {
        if (typeof GM_xmlhttpRequest === 'undefined') { resolve({ ok: false, error: 'GM_xmlhttpRequest is not available' }); return; }
        GM_xmlhttpRequest({
            method: method, url: _DR.server + path, timeout: 30000, headers: { 'Content-Type': 'application/json' }, data: body ? JSON.stringify(body) : undefined,
            onload: function (r) { var j = null; try { j = JSON.parse(r.responseText); } catch (e) {} resolve(j || { ok: false, error: 'HTTP ' + r.status + ' (the recorder endpoints are missing: restart node server.js in the nodeserver folder)' }); },
            onerror: function () { resolve({ ok: false, error: 'The recorder server is not reachable at ' + _DR.server + '. Start node server.js in the nodeserver folder.' }); },
            ontimeout: function () { resolve({ ok: false, error: 'The recorder server timed out' }); }
        });
    });
}

function _drStateHtml(st) {
    var k = '', t = ''; try { k = String(g_config.get('api_key') || '').trim(); t = String(g_config.get('api_access_token') || '').trim(); } catch (e) {}
    var pair = (k && t) ? '<b style="color:var(--gtb-green);">set</b>' : '<b style="color:var(--gtb-red);">missing (Settings: api_key and api_access_token)</b>';
    var srv = (st && st.ok) ? '<b style="color:var(--gtb-green);">reachable</b>' : '<b style="color:var(--gtb-red);">not reachable</b> ' + _drEsc((st && st.error) || '');
    return '<div>Recorder server: ' + srv + ' &middot; API key and token in Settings: ' + pair + ' (read by this tab and sent only to api.kite.trade)' + (st && st.nowIst ? ' &middot; recorder clock (IST): ' + _drEsc(st.nowIst) : '') + '</div>';
}
function _drDaysHtml(days) {
    if (!days || !days.length) return '<div style="color:var(--gtb-muted);">Nothing recorded yet.</div>';
    var cell = function (x) { return x ? '<span style="color:' + (x.missing.length ? 'var(--gtb-amber)' : 'var(--gtb-green)') + ';">' + x.slots.length + ' / ' + x.expected + ' slots</span>, ' + x.mb + ' MB' + (x.errors ? ', <span style="color:var(--gtb-red);">' + x.errors + ' with errors</span>' : '') : '<span style="color:var(--gtb-muted);">-</span>'; };
    return '<table style="width:100%;border-collapse:collapse;font-size:.58rem;"><thead><tr style="color:var(--gtb-muted);text-align:left;font-size:.48rem;"><th>DAY</th><th>NSE</th><th>MCX</th><th></th></tr></thead><tbody>'
        + days.map(function (d) { var lk = function (sess, inner) { return '<a href="' + _DR.server + '/autoTrade/dataViewer.html?day=' + d.day + '&session=' + sess + '" target="_blank" rel="noopener" title="View this day" style="color:inherit;text-decoration:none;">' + inner + '</a>'; }; return '<tr style="border-top:1px solid var(--gtb-border);"><td style="padding:2px 4px;">' + lk(d.NSE ? 'NSE' : 'MCX', _drEsc(d.day) + ' <span style="color:var(--gtb-accent);">view</span>') + '</td><td>' + cell(d.NSE) + '</td><td>' + cell(d.MCX) + '</td><td><a href="#" class="dr-del" data-day="' + _drEsc(d.day) + '" style="color:var(--gtb-red);" title="Delete everything recorded for this day">delete</a></td></tr>'; }).join('') + '</tbody></table>';
}
async function _drRefresh() {
    var $s = jQ('#dr-state'); if (!$s.length) { if (_DR.poll) { clearInterval(_DR.poll); _DR.poll = null; } return; }
    var st = await _drReq('GET', '/api/rec/state');
    _DR.state = st;
    $s.html(_drStateHtml(st));
    if (st && st.ok) {
        jQ('#dr-days').html(_drDaysHtml(st.snapshots));
        var cd = st.candleDays || [];
        jQ('#dr-cache').html(cd.length ? cd.map(function (c) { return '<div>' + _drEsc(c.day) + ': ' + c.files + ' candle sets, ' + c.mb + ' MB <a href="#" class="dr-cclear" data-day="' + _drEsc(c.day) + '" style="color:var(--gtb-red);" title="Delete the stored candles of this day (a replay would fetch them from Kite again)">clear</a></div>'; }).join('') : '<span style="color:var(--gtb-muted);">Empty.</span>');
    }
}
function _drShowPopup() {
    var html = '<div style="padding:12px;background:var(--gtb-bg);color:var(--gtb-text);height:100%;overflow-x:hidden;overflow-y:auto;box-sizing:border-box;font-size:.64rem;line-height:1.45;overflow-wrap:anywhere;">'
        + '<div id="dr-state" style="margin-bottom:10px;">Connecting to the recorder&hellip;</div>'
        + (typeof _rpPanelHtml === 'function' ? _rpPanelHtml() : '')
        + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;"><button class="sv-pill-btn" id="dr-test" title="One history call to api.kite.trade from this browser, the same call a replay makes">Test the official API</button><button class="sv-pill-btn" id="dr-view" title="Opens a page with every recorded slot, charts and the full detail of each slot">Open the recorded data viewer</button></div>'
        + '<div id="dr-out" style="color:var(--gtb-muted);min-height:18px;margin-bottom:8px;"></div>'
        + '<div style="font-weight:800;font-size:.52rem;letter-spacing:.06em;color:var(--gtb-muted);margin-bottom:4px;">RECORDED DAYS (replayed snapshots)</div><div id="dr-days"></div>'
        + '<div style="font-weight:800;font-size:.52rem;letter-spacing:.06em;color:var(--gtb-muted);margin:12px 0 4px;">CANDLE CACHE (what the replay fetched from Kite; a rerun of the same day reuses it with no Kite calls)</div><div id="dr-cache" style="font-size:.58rem;"></div>'
        + '<div style="margin-top:10px;font-size:.52rem;color:var(--gtb-muted);">Snapshots are saved on this computer in nodeserver/data/snapshots (one line per 5-minute slot). Your API key and token stay in Settings: they are not sent to the recorder server.</div></div>';
    showPopUpWindow('data-recorder', html, 'Data Recorder', 640, 760);
    var cls = 'popup-custom-style-data-recorder';
    jQ('.' + cls).toggleClass('gtb-light', (localStorage.getItem('GTB_THEME') || 'dark') === 'light');
    jQ('.' + cls).find('.popupwindow_titlebar_text').html('<div style="display:flex;align-items:center;gap:6px;width:100%;"><span style="font-weight:800;font-size:.7rem;">DATA RECORDER</span>' + popupWinControls(cls) + '</div>');
    hideNativePopupButtons(cls);
    _drRefresh();
    try { _rpRenderState(); } catch (e) {}
    if (_DR.poll) clearInterval(_DR.poll);
    _DR.poll = setInterval(_drRefresh, 3000);
}
// the same call a replay makes: 5-minute candles of NIFTY 50 over the last days, from this browser with the Settings pair
jQ(document).on('click', '#dr-test', async function () {
    jQ('#dr-out').html('Calling api.kite.trade&hellip;');
    if (typeof _rpOfficial !== 'function') { jQ('#dr-out').html('<span style="color:var(--gtb-red);">The replay module is not loaded.</span>'); return; }
    var tok = 256265; try { tok = INSTRUMENT_TOKENS['NIFTY 50'] || 256265; } catch (e) {}
    var to = _drIst(), from = _drIst(Date.now() - 4 * 86400000);
    var r = await _rpOfficial(tok, '5minute', from + ' 09:00:00', to + ' 23:59:59');
    if (!r.ok) { jQ('#dr-out').html('<span style="color:var(--gtb-red);font-weight:700;">Official API failed.</span> ' + _drEsc(r.error)); return; }
    var last = r.candles[r.candles.length - 1];
    jQ('#dr-out').html('<span style="color:var(--gtb-green);font-weight:700;">Official API works.</span> ' + r.candles.length + ' five-minute candles of NIFTY 50 over the last days' + (last ? '; last: ' + _drEsc(last[0]) + ' close ' + _drEsc(last[4]) : '') + '. A candle row has ' + (last ? last.length : 0) + ' values' + (last && last.length > 6 ? ' (open interest included).' : '.'));
});

jQ(document).on('click', '#dr-view', function () { window.open(_DR.server + '/autoTrade/dataViewer.html', '_blank'); });

jQ(document).on('click', '.dr-del', async function (e) {
    e.preventDefault();
    var day = jQ(this).attr('data-day');
    if (!window.confirm('Delete everything recorded for ' + day + ' (NSE and MCX)?\n\nThis removes the saved snapshot files from this computer and cannot be undone.')) return;
    var r = await _drReq('POST', '/api/snapshot/delete', { day: day });
    jQ('#dr-out').html(r && r.ok ? '<span style="color:var(--gtb-green);">Deleted ' + _drEsc(day) + ' (' + _drEsc((r.removed || []).join(' + ') || 'nothing found') + ').</span>' : '<span style="color:var(--gtb-red);">' + _drEsc((r && r.error) || 'Could not delete') + '</span>');
    _drRefresh();
});

jQ(document).on('click', '.dr-cclear', async function (e) {
    e.preventDefault();
    var day = jQ(this).attr('data-day');
    if (!window.confirm('Delete the stored candles of ' + day + '?\n\nThe recorded snapshots are not touched. A new replay of that day would fetch the candles from Kite again.')) return;
    var r = await _drReq('POST', '/api/candles/delete', { day: day });
    jQ('#dr-out').html(r && r.ok ? '<span style="color:var(--gtb-green);">Cleared the candle cache of ' + _drEsc(day) + '.</span>' : '<span style="color:var(--gtb-red);">' + _drEsc((r && r.error) || 'Could not clear') + '</span>');
    _drRefresh();
});
