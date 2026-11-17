// Expired option contracts for the Replay Recorder (a past day's weekly contract that Kite no longer lists).
// Reads the day files written by the separate fetch tool (..\dhan-expired-options\out, or EXPIRED_DIR): <UNDERLYING>/<UNDERLYING>_<day>.json (the nearest expiry that day, "code 1"),
// <UNDERLYING>_<day>_c2.json (the next expiry, "code 2") and expiries.json (the expired expiry dates per underlying). Nothing here knows or cares where the files came from.
//   GET /api/expired/meta?day=YYYY-MM-DD          -> which underlyings have an expired contract for that day: its expiry and the strikes that have data
//   GET /api/expired/candles?u&expiry&type&strike&interval&from&to   -> Kite-shaped candles [ISO+0530, o, h, l, c, v, oi] of ONE contract (interval 5minute or day)
//   GET /api/expired/state                         -> what is on disk
const fs = require('fs'), path = require('path');
const DIR = process.env.EXPIRED_DIR || path.join(__dirname, '..', 'dhan-expired-options', 'out');
const FILES = new Map();         // path -> parsed day file (a day file is about half a megabyte)
const okDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const okName = s => /^[A-Z0-9]{2,20}$/.test(String(s || ''));

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
function expiries() { return readJson(path.join(DIR, 'expiries.json')) || {}; }
function dayFile(u, day, code) {
  const f = path.join(DIR, u, u + '_' + day + (code === 1 ? '' : '_c' + code) + '.json');
  if (FILES.has(f)) return FILES.get(f);
  if (!fs.existsSync(f)) return null;
  const j = readJson(f); if (j) FILES.set(f, j); return j;
}
// the expiry of "code 1" (nearest) and "code 2" (next) on a day, from the list of expired expiry dates; null once the contract is not expired yet
function expiryOf(u, day, code) {
  const seq = (expiries()[u] || []).slice().sort(), i = seq.findIndex(e => e >= day);
  if (i < 0) return null;
  return seq[i + code - 1] || null;
}
function tradingDays(u) {
  try { return fs.readdirSync(path.join(DIR, u)).map(f => (/^[A-Z0-9]+_(\d{4}-\d{2}-\d{2})\.json$/.exec(f) || [])[1]).filter(Boolean).sort(); } catch (e) { return []; }
}
// the day file that holds contract `expiry` on `day`: code 1 when it is the nearest expiry that day, code 2 when it is the next one
function fileForContract(u, day, expiry) {
  for (const code of [1, 2]) if (expiryOf(u, day, code) === expiry) { const d = dayFile(u, day, code); if (d) return d; }
  return null;
}
function series(d, type, strike) {
  const s = d.strikes && d.strikes[type] && d.strikes[type][String(strike)]; if (!s) return null;
  const out = [];
  for (let i = 0; i < d.times.length; i++) {
    if (s.c[i] == null || d.times[i] >= '15:30') continue;         // no trade in that candle / the closing-session candles after 15:30 (Kite's last NSE candle starts at 15:25)
    out.push([d.day + 'T' + d.times[i] + ':00+0530', s.o[i], s.h[i], s.l[i], s.c[i], s.v[i] || 0, s.oi[i] == null ? 0 : s.oi[i]]);
  }
  return out;
}
function mount(app) {
  const hdr = res => res.set('Access-Control-Allow-Origin', '*');
  app.get('/api/expired/state', (req, res) => {
    hdr(res); const out = { dir: DIR, exists: fs.existsSync(DIR), underlyings: {} };
    try { for (const u of fs.readdirSync(DIR)) { const days = tradingDays(u); if (days.length) out.underlyings[u] = { days: days.length, first: days[0], last: days[days.length - 1], expired: expiries()[u] || [] }; } } catch (e) {}
    res.json(out);
  });
  app.get('/api/expired/meta', (req, res) => {
    hdr(res); const day = req.query.day; if (!okDay(day)) return res.status(400).json({ ok: false, error: 'day required' });
    const out = { ok: true, dir: DIR, day, underlyings: {} };
    try {
      for (const u of fs.readdirSync(DIR)) {
        if (!okName(u) || !fs.statSync(path.join(DIR, u)).isDirectory()) continue;
        const e = expiryOf(u, day, 1), d = e ? dayFile(u, day, 1) : null; if (!e || !d) continue;
        out.underlyings[u] = { expiry: e, strikes: { CE: Object.keys(d.strikes.CE).map(Number).sort((a, b) => a - b), PE: Object.keys(d.strikes.PE).map(Number).sort((a, b) => a - b) }, nextExpiry: expiryOf(u, day, 2) };
      }
    } catch (err) {}
    res.json(out);
  });
  app.get('/api/expired/candles', (req, res) => {
    hdr(res); const { u, expiry, type, strike, interval, from, to } = req.query;
    if (!okName(u) || !okDay(expiry) || !['CE', 'PE'].includes(type) || !isFinite(parseFloat(strike)) || !['5minute', 'day'].includes(interval) || !okDay(from) || !okDay(to)) return res.status(400).json({ ok: false, error: 'u, expiry, type, strike, interval, from and to are required' });
    const out = [];
    for (const day of tradingDays(u)) {
      if (day < from || day > to) continue;
      const d = fileForContract(u, day, expiry); if (!d) continue;
      const cs = series(d, type, parseFloat(strike)); if (!cs || !cs.length) continue;
      if (interval === '5minute') out.push(...cs);
      else out.push([day + 'T00:00:00+0530', cs[0][1], Math.max(...cs.map(c => c[2])), Math.min(...cs.map(c => c[3])), cs[cs.length - 1][4], cs.reduce((a, c) => a + (c[5] || 0), 0), cs[cs.length - 1][6]]);
    }
    res.json({ ok: true, candles: out });
  });
}
module.exports = { mount, _test: { expiryOf, series, fileForContract, DIR } };
