// ─────────────────────────────────────────────────────────────────────────────────────────────
// Raw market-data recorder (docs/ai-data-plan.md). Runs inside the node server and talks ONLY to the official Kite Connect API
// (https://api.kite.trade, api_key + access_token). It never uses the /oms (enctoken) path and does not depend on the browser being open.
//
// For one trading day and one session (NSE or MCX) it saves the 5-minute candles (with open interest) of:
//   NSE: NIFTY 50, NIFTY BANK, SENSEX, INDIA VIX (spot), the index futures, the index options around the day's range (nearest 2 expiries), and the
//        weighted stocks the browser sends (spot, nearest future, options around the day's range, nearest expiry).
//   MCX: GOLDM, SILVERM, CRUDEOILM futures and options around the day's range (nearest expiry).
// One API call per contract per day (the call covers the previous trading day too, so OI change can be computed). Calls are spaced by
// `delayMs` (default 10 s, never below 350 ms; Kite allows 3 history calls a second). Everything is saved raw: scores and features are computed
// offline from these candles, the same way for replayed and for live days.
// Files: data/raw/<day>_<session>.jsonl (one contract per line), data/raw/<day>_<session>.done.json (finished marker).
// Limits: Kite only lists contracts that have not expired, so options of an already-expired weekly expiry cannot be fetched (the nearest live expiries are
// recorded instead, and each line carries its expiry).
// ─────────────────────────────────────────────────────────────────────────────────────────────
const fs = require('fs')
const path = require('path')

const DATA = process.env.REC_DATA_DIR || path.join(__dirname, 'data')
const RAW = path.join(DATA, 'raw')
const CFG_FILE = path.join(DATA, 'recorder-config.json')
const BASE = process.env.KITE_BASE || 'https://api.kite.trade'
const MIN_GAP_MS = 350
const sleep = ms => new Promise(r => setTimeout(r, ms))

function readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) { return d } }
function writeJson(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 1)) }

let cfg = Object.assign({ apiKey: '', accessToken: '', tokenSavedAt: null, delayMs: 10000, auto: false, autoNse: false, autoMcx: false, stocks: [] }, readJson(CFG_FILE, {}))      // the raw candle recorder is not used from the panel any more: its automatic runs are off by default
function saveCfg() { writeJson(CFG_FILE, cfg) }

// ── time (IST) ──
function istNow(ms) {
  const t = ms == null ? Date.now() : ms
  const iso = new Date(t + 19800000).toISOString()
  return { day: iso.slice(0, 10), hm: iso.slice(11, 16), mins: +iso.slice(11, 13) * 60 + +iso.slice(14, 16), dow: new Date(t + 19800000).getUTCDay() }
}
function addDays(day, n) { return new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10) }
function prevWeekday(day) { let d = addDays(day, -1); while ([0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay())) d = addDays(d, -1); return d }
const okDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s))

// ── official API ──
async function kiteGet(pq) {
  if (!cfg.apiKey || !cfg.accessToken) { const e = new Error('No api_key / access_token saved in the recorder. Open the Data Recorder in the dashboard so it can send the pair.'); e.fatal = true; throw e }
  const r = await fetch(BASE + pq, { headers: { 'X-Kite-Version': '3', Authorization: 'token ' + cfg.apiKey + ':' + cfg.accessToken } })
  return { status: r.status, text: await r.text() }
}
function classify(status, text) {
  let j = null; try { j = JSON.parse(text) } catch (e) { /* not JSON */ }
  const msg = j && (j.message || j.error_type) ? (j.error_type ? j.error_type + ': ' : '') + (j.message || '') : 'HTTP ' + status
  const e = new Error(msg)
  if (/TokenException|Incorrect .*api_key|access_token/i.test(msg)) { e.fatal = true; e.message += ' (the access token expires every morning: log in again, paste the new pair in Settings and reopen the Data Recorder)' }
  else if (/insufficient permission|historical/i.test(msg)) { e.fatal = true; e.message += ' (the Historical Data add-on may not be active on this Kite Connect app)' }
  return e
}
// candles of one instrument: [[ts, o, h, l, c, v, (oi)], ...]
async function hist(token, interval, from, to, oi) {
  const pq = '/instruments/historical/' + token + '/' + interval + '?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + (oi ? '&oi=1' : '')
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await kiteGet(pq)
    if (r.status === 429) { await sleep(3000 * (attempt + 1)); continue }
    let j = null; try { j = JSON.parse(r.text) } catch (e) { /* handled below */ }
    if (r.status >= 200 && r.status < 300 && j && j.status === 'success') return (j.data && j.data.candles) || []
    throw classify(r.status, r.text)
  }
  throw new Error('rate limited by Kite (HTTP 429) after 4 attempts')
}

// ── instruments (official dump, cached for the day) ──
function splitCsv(line) {
  const out = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') q = !q
    else if (ch === ',' && !q) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur); return out
}
function parseInstruments(txt) {
  const out = [], lines = txt.split('\n')
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]; if (!l.trim()) continue
    const c = splitCsv(l.replace(/\r$/, ''))
    if (c.length < 12) continue
    out.push({ token: +c[0], symbol: c[2], name: c[3], expiry: c[5] || null, strike: c[6] ? +c[6] : null, lot: c[8] ? +c[8] : null, type: c[9], segment: c[10], exchange: (c[11] || '').trim() })
  }
  return out
}
let instCache = { day: '', rows: null }
async function instruments() {
  const day = istNow().day
  if (instCache.day === day && instCache.rows) return instCache.rows
  const f = path.join(DATA, 'instruments-' + day + '.csv')
  let txt
  if (fs.existsSync(f)) txt = fs.readFileSync(f, 'utf8')
  else {
    const r = await kiteGet('/instruments')
    if (r.status !== 200) throw classify(r.status, r.text)
    txt = r.text; fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(f, txt)
    try { fs.readdirSync(DATA).filter(x => /^instruments-.*\.csv$/.test(x) && x !== 'instruments-' + day + '.csv').forEach(x => fs.unlinkSync(path.join(DATA, x))) } catch (e) { /* old dumps are only a cache */ }
  }
  const rows = parseInstruments(txt)
  instCache = { day, rows }
  return rows
}

// ── choosing contracts ──
function nearestExpiries(rows, day, n) {
  return Array.from(new Set(rows.map(r => r.expiry).filter(e => e && e >= day))).sort().slice(0, n)
}
function strikeStep(strikes) {
  const s = Array.from(new Set(strikes)).sort((a, b) => a - b); let step = Infinity
  for (let i = 1; i < s.length; i++) { const d = s[i] - s[i - 1]; if (d > 0 && d < step) step = d }
  return isFinite(step) ? step : 1
}
// the strikes that cover the day's range plus a few steps on each side (capped)
function pickStrikes(rows, lo, hi, margin, cap) {
  const strikes = Array.from(new Set(rows.map(r => r.strike))).sort((a, b) => a - b)
  if (!strikes.length) return []
  const step = strikeStep(strikes)
  let a = lo - margin * step, b = hi + margin * step
  let sel = strikes.filter(s => s >= a && s <= b)
  if (sel.length > cap) { const mid = (lo + hi) / 2; sel = sel.sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid)).slice(0, cap).sort((x, y) => x - y) }
  return sel
}
function dayRange(candles, day) {
  let hi = -Infinity, lo = Infinity
  candles.forEach(c => { if (String(c[0]).slice(0, 10) === day) { hi = Math.max(hi, +c[2]); lo = Math.min(lo, +c[3]) } })
  return isFinite(hi) ? { hi, lo } : null
}

// ── job ──
let job = null
const autoFail = {}
function jobLog(m) { if (!job) return; job.log.push(new Date().toISOString().slice(11, 19) + ' ' + m); if (job.log.length > 40) job.log.shift() }
function rawFile(day, session) { return path.join(RAW, day + '_' + session + '.jsonl') }
function doneFile(day, session) { return path.join(RAW, day + '_' + session + '.done.json') }
function doneTokens(day, session, keep) {
  const f = rawFile(day, session), s = new Set()
  if (keep) keep.candles = {}
  if (!fs.existsSync(f)) return s
  fs.readFileSync(f, 'utf8').split('\n').forEach(l => { if (!l) return; try { const r = JSON.parse(l); if (r && r.token) { s.add(r.token); if (keep && (r.kind === 'SPOT' || r.kind === 'FUT')) keep.candles[r.token] = r.candles } } catch (e) { /* half-written line */ } })
  return s
}
async function fetchAndSave(c, ctx) {
  // one contract: candles from the previous trading day to the end of `day`
  if (job.stop) return false
  if (ctx.done.has(c.token)) { job.skipped++; ctx.lastCandles = ctx.keep.candles[c.token] || null; return true }
  try {
    const candles = await hist(c.token, '5minute', ctx.from + ' 09:00:00', ctx.day + ' 23:59:59', c.kind !== 'SPOT')
    fs.mkdirSync(RAW, { recursive: true })
    fs.appendFileSync(rawFile(ctx.day, ctx.session), JSON.stringify({ day: ctx.day, session: ctx.session, kind: c.kind, token: c.token, symbol: c.symbol, name: c.name, expiry: c.expiry || null, strike: c.strike == null ? null : c.strike, lot: c.lot || null, n: candles.length, candles }) + '\n')
    ctx.done.add(c.token); job.done++
    if (!candles.length) job.empty++
    ctx.lastCandles = candles
    return true
  } catch (e) {
    if (e.fatal) throw e
    job.failed++; job.failures.push(c.symbol + ': ' + e.message); jobLog('FAILED ' + c.symbol + ': ' + e.message)
    return false
  } finally {
    job.current = c.symbol
    await sleep(Math.max(MIN_GAP_MS, cfg.delayMs))
  }
}

async function recordSession(day, session, stocks) {
  const rows = await instruments()
  const prev = prevWeekday(day)
  const keep = {}
  const ctx = { day, session, from: prev, done: doneTokens(day, session, keep), keep }
  const spot = (ex, sym, seg) => rows.find(r => r.exchange === ex && r.symbol === sym && (!seg || r.segment === seg))
  const futs = (seg, name, n) => { const f = rows.filter(r => r.segment === seg && r.name === name && r.expiry && r.expiry >= day).sort((a, b) => a.expiry < b.expiry ? -1 : 1); return f.slice(0, n) }
  const opts = (seg, name) => rows.filter(r => r.segment === seg && r.name === name && r.expiry && r.expiry >= day && (r.type === 'CE' || r.type === 'PE'))
  const plan = []     // { under, spot?, fut?, optRows, expiries, margin, cap }
  if (session === 'NSE') {
    ;[['NIFTY 50', 'NSE', 'NIFTY 50', 'NFO', 'NIFTY', 2], ['NIFTY BANK', 'NSE', 'NIFTY BANK', 'NFO', 'BANKNIFTY', 2], ['SENSEX', 'BSE', 'SENSEX', 'BFO', 'SENSEX', 2]].forEach(u => {
      const s = spot(u[1], u[2], 'INDICES'); plan.push({ under: u[0], spot: s ? { kind: 'SPOT', token: s.token, symbol: s.symbol, name: u[0] } : null, fut: futs(u[3] + '-FUT', u[4], 1), opt: opts(u[3] + '-OPT', u[4]), nExp: u[5], margin: 4, cap: 70 })
    })
    const vix = spot('NSE', 'INDIA VIX', 'INDICES'); if (vix) plan.push({ under: 'INDIA VIX', spot: { kind: 'SPOT', token: vix.token, symbol: vix.symbol, name: 'INDIA VIX' }, fut: [], opt: [], nExp: 0 })
    ;(stocks || []).forEach(sym => {
      const s = spot('NSE', sym, 'NSE'); plan.push({ under: sym, spot: s ? { kind: 'SPOT', token: s.token, symbol: s.symbol, name: sym } : null, fut: futs('NFO-FUT', sym, 1), opt: opts('NFO-OPT', sym), nExp: 1, margin: 3, cap: 24 })
    })
  } else {
    ;['CRUDEOILM', 'GOLDM', 'SILVERM'].forEach(n => plan.push({ under: n, spot: null, fut: futs('MCX-FUT', n, 1), opt: opts('MCX-OPT', n), nExp: 1, margin: 4, cap: 40 }))
  }
  job.total = plan.reduce((a, p) => a + (p.spot ? 1 : 0) + p.fut.length + 0, 0)       // grows when the options are chosen
  jobLog(session + ' ' + day + ': ' + plan.length + ' underlyings, previous trading day ' + prev)
  for (const p of plan) {
    if (job.stop) break
    let range = null
    if (p.spot) { await fetchAndSave(p.spot, ctx); range = dayRange(ctx.lastCandles || [], day); ctx.lastCandles = null }
    for (const f of p.fut) {
      await fetchAndSave({ kind: 'FUT', token: f.token, symbol: f.symbol, name: p.under, expiry: f.expiry, lot: f.lot }, ctx)
      if (!range) range = dayRange(ctx.lastCandles || [], day)
      ctx.lastCandles = null
    }
    if (job.stop) break
    if (!p.opt.length) continue
    if (!range) { jobLog('no price range for ' + p.under + ', its options are skipped'); continue }
    for (const ex of nearestExpiries(p.opt, day, p.nExp)) {
      const rowsEx = p.opt.filter(r => r.expiry === ex), sel = new Set(pickStrikes(rowsEx, range.lo, range.hi, p.margin, p.cap))
      const list = rowsEx.filter(r => sel.has(r.strike)).sort((a, b) => a.strike - b.strike || (a.type < b.type ? -1 : 1))
      job.total += list.length
      jobLog(p.under + ' ' + ex + ': ' + list.length + ' option contracts between ' + Math.round(range.lo) + ' and ' + Math.round(range.hi))
      for (const o of list) { if (job.stop) break; await fetchAndSave({ kind: o.type, token: o.token, symbol: o.symbol, name: p.under, expiry: o.expiry, strike: o.strike, lot: o.lot }, ctx) }
    }
  }
  if (!job.stop) {
    writeJson(doneFile(day, session), { day, session, finishedAt: new Date().toISOString(), contracts: ctx.done.size, failed: job.failed, empty: job.empty, delayMs: cfg.delayMs, prevDay: prev })
    jobLog(session + ' ' + day + ' finished: ' + ctx.done.size + ' contracts saved, ' + job.failed + ' failed, ' + job.empty + ' empty')
  }
}

async function startJob(day, sessions, auto) {
  if (job && job.status === 'running') throw new Error('a recording is already running')
  if (!okDay(day)) throw new Error('day must be YYYY-MM-DD')
  job = { id: Date.now(), day, sessions, status: 'running', total: 0, done: 0, failed: 0, skipped: 0, empty: 0, failures: [], current: '', startedAt: Date.now(), endedAt: null, error: null, stop: false, log: [] }
  const j = job
  ;(async () => {
    try {
      for (const s of sessions) { if (j.stop) break; await recordSession(day, s, cfg.stocks) }
      j.status = j.stop ? 'stopped' : 'done'
    } catch (e) { j.status = 'error'; j.error = e.message; jobLog('STOPPED: ' + e.message) }
    j.endedAt = Date.now()
    if (auto && j.status === 'error') sessions.forEach(s => { autoFail[day + '|' + s] = { at: Date.now(), tokenSavedAt: cfg.tokenSavedAt } })      // see autoTick: no retry loop on a failed automatic run
  })()
  return job
}

// ── automatic runs: NSE after the close, MCX after midnight (for the day before) ──
function isDone(day, session) { return fs.existsSync(doneFile(day, session)) }
// A failed automatic run (an expired token, a missing permission) is not retried every minute: it waits until a NEW token has been saved, or 60 minutes.
function mayAutoRun(day, session) {
  if (isDone(day, session)) return false
  const f = autoFail[day + '|' + session]
  return !f || f.tokenSavedAt !== cfg.tokenSavedAt || Date.now() - f.at > 60 * 60000
}
function autoTick() {
  try {
    if (!cfg.auto || !cfg.apiKey || !cfg.accessToken || (job && job.status === 'running')) return
    const t = istNow()
    if (cfg.autoNse && t.dow >= 1 && t.dow <= 5 && t.mins >= 15 * 60 + 50 && mayAutoRun(t.day, 'NSE')) { startJob(t.day, ['NSE'], true).catch(() => {}); return }
    // MCX: the previous weekday, any time after 00:05 (so a server that was off at midnight catches up when it starts), as long as that day is not recorded
    if (cfg.autoMcx && t.mins >= 5) {
      const y = addDays(t.day, -1), yd = new Date(y + 'T00:00:00Z').getUTCDay()
      if (yd >= 1 && yd <= 5 && mayAutoRun(y, 'MCX')) startJob(y, ['MCX'], true).catch(() => {})
    }
  } catch (e) { /* never let the scheduler throw */ }
}
setInterval(autoTick, 60000)

// ── state for the browser ──
function days() {
  if (!fs.existsSync(RAW)) return []
  const by = {}
  fs.readdirSync(RAW).forEach(f => {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})_(NSE|MCX)\.(jsonl|done\.json)$/); if (!m) return
    const o = (by[m[1]] = by[m[1]] || {}); const s = (o[m[2]] = o[m[2]] || { contracts: 0, mb: 0, done: false })
    if (m[3] === 'jsonl') { s.mb = Math.round(fs.statSync(path.join(RAW, f)).size / 1e4) / 100; s.contracts = doneTokens(m[1], m[2]).size } else { const d = readJson(path.join(RAW, f), {}); s.done = true; s.failed = d.failed || 0; s.empty = d.empty || 0 }
  })
  return Object.keys(by).sort().reverse().map(d => ({ day: d, NSE: by[d].NSE || null, MCX: by[d].MCX || null }))
}
function state() {
  const saved = cfg.tokenSavedAt ? Date.parse(cfg.tokenSavedAt) : null, t = istNow()
  const six = Date.parse(t.day + 'T06:00:00+05:30') > Date.now() ? Date.parse(addDays(t.day, -1) + 'T06:00:00+05:30') : Date.parse(t.day + 'T06:00:00+05:30')   // the most recent 06:00 IST: tokens expire around then
  return { ok: true, hasToken: !!(cfg.apiKey && cfg.accessToken), tokenSavedAt: cfg.tokenSavedAt, tokenLikelyExpired: !!(saved && saved < six), delayMs: cfg.delayMs, auto: cfg.auto, autoNse: cfg.autoNse, autoMcx: cfg.autoMcx, stocks: cfg.stocks.length, job: job ? { id: job.id, day: job.day, sessions: job.sessions, status: job.status, total: job.total, done: job.done, failed: job.failed, skipped: job.skipped, empty: job.empty, current: job.current, startedAt: job.startedAt, endedAt: job.endedAt, error: job.error, log: job.log.slice(-14), failures: job.failures.slice(-8) } : null, days: days().slice(0, 14), snapshots: snapDays().slice(0, 8), candleDays: candleDays(), nowIst: t.day + ' ' + t.hm }
}

// ── per-slot snapshots (the dashboard's own metrics, replayed through the official API by the browser: see replayRecorder.js) ──
// One snapshot per 5-minute slot is appended as one line to data/snapshots/<day>_<session>.jsonl. The same slot can appear twice after a resume:
// a reader keeps the last line. Expected slots: NSE 09:20..15:30 (75), MCX 09:05..23:55 (179).
const SNAP = path.join(DATA, 'snapshots')
const okSession = s => s === 'NSE' || s === 'MCX'
const okSlot = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s))
function expectedSlots(session) {
  const out = [], from = session === 'NSE' ? 9 * 60 + 20 : 9 * 60 + 5, to = session === 'NSE' ? 15 * 60 + 30 : 23 * 60 + 55
  for (let m = from; m <= to; m += 5) out.push(('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2))
  return out
}
// One line per slot, ALWAYS: saving a slot that already exists REPLACES it (a rerun of a day overwrites, never duplicates); lines are kept in slot order and the
// file is replaced atomically (written to .tmp, then renamed), so a crash cannot leave a half-written file. A half-written or unreadable line is dropped.
function slotOfLine(l) { try { const r = JSON.parse(l); return r && r.slot ? r.slot : null } catch (e) { return null } }
function writeSlotFile(fp, entries) {
  entries.sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0))
  const tmp = fp + '.tmp'
  fs.writeFileSync(tmp, entries.map(x => x.line).join('\n') + (entries.length ? '\n' : ''))
  fs.renameSync(tmp, fp)
}
function upsertSnapshot(b) {
  fs.mkdirSync(SNAP, { recursive: true })
  const fp = path.join(SNAP, b.day + '_' + b.session + '.jsonl'), map = new Map()
  if (fs.existsSync(fp)) fs.readFileSync(fp, 'utf8').split('\n').forEach(l => { if (!l) return; const sl = slotOfLine(l); if (sl) map.set(sl, l) })     // later line wins
  const replaced = map.has(b.slot)
  map.set(b.slot, JSON.stringify(b))
  writeSlotFile(fp, Array.from(map.entries()).map(([slot, line]) => ({ slot, line })))
  return replaced
}
// files written by an earlier version may hold repeated slots: collapse them once at start-up (last line of a slot wins)
function compactSnapshots() {
  try {
    if (!fs.existsSync(SNAP)) return
    fs.readdirSync(SNAP).filter(f => /^\d{4}-\d{2}-\d{2}_(NSE|MCX)\.jsonl$/.test(f)).forEach(f => {
      const fp = path.join(SNAP, f), lines = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean), map = new Map()
      lines.forEach(l => { const sl = slotOfLine(l); if (sl) map.set(sl, l) })
      if (map.size !== lines.length) { writeSlotFile(fp, Array.from(map.entries()).map(([slot, line]) => ({ slot, line }))); console.log('[recorder] compacted ' + f + ': ' + lines.length + ' lines -> ' + map.size) }
    })
  } catch (e) { console.log('[recorder] compaction failed: ' + e.message) }
}
compactSnapshots()

function snapStatus(day, session) {
  const fp = path.join(SNAP, day + '_' + session + '.jsonl'), exp = expectedSlots(session)
  const o = { session, rows: 0, slots: [], missing: exp, expected: exp.length, mb: 0, sources: {}, errors: 0 }
  if (!fs.existsSync(fp)) return o
  const seen = new Set(); o.mb = Math.round(fs.statSync(fp).size / 1e4) / 100
  fs.readFileSync(fp, 'utf8').split('\n').forEach(l => { if (!l) return; try { const r = JSON.parse(l); o.rows++; seen.add(r.slot); o.sources[r.source || 'live'] = (o.sources[r.source || 'live'] || 0) + 1; if (r.errors && r.errors.length) o.errors++ } catch (e) { /* half-written line */ } })
  o.slots = Array.from(seen).sort(); o.missing = exp.filter(x => !seen.has(x))
  return o
}
function snapDays() {
  if (!fs.existsSync(SNAP)) return []
  const by = {}
  fs.readdirSync(SNAP).forEach(f => { const m = f.match(/^(\d{4}-\d{2}-\d{2})_(NSE|MCX)\.jsonl$/); if (m) (by[m[1]] = by[m[1]] || {})[m[2]] = snapStatus(m[1], m[2]) })
  return Object.keys(by).sort().reverse().slice(0, 14).map(d => ({ day: d, NSE: by[d].NSE || null, MCX: by[d].MCX || null }))
}

// ── candle cache for the replay (data/candles/<replay day>/<token>_<interval>_<from>_<to>.json) ──
// The replay fetches each instrument's candles once through the official API and stores them here, so a rerun, a restart after Stop or a second replay of the
// same day needs no Kite calls. A stored set is only served if it was fetched AFTER the last day it covers had ended (23:56 IST): a half-finished day is never reused.
const CND = path.join(DATA, 'candles')
const okToken = s => /^\d{1,12}$/.test(String(s))
const okInterval = s => /^(day|minute|\d{1,2}minute)$/.test(String(s))
function candleDays() {
  if (!fs.existsSync(CND)) return []
  return fs.readdirSync(CND).filter(d => okDay(d)).sort().reverse().slice(0, 14).map(d => {
    const fl = fs.readdirSync(path.join(CND, d)).filter(x => x.endsWith('.json'))
    return { day: d, files: fl.length, mb: Math.round(fl.reduce((a, x) => a + fs.statSync(path.join(CND, d, x)).size, 0) / 1e4) / 100 }
  })
}

function mount(app, express) {
  const json = express.json({ limit: '2mb' })
  app.get('/api/candles/get', (req, res) => {
    const { day, token, interval, from, to } = req.query
    if (!okDay(day) || !okToken(token) || !okInterval(interval) || !okDay(from) || !okDay(to)) return res.status(400).json({ ok: false, error: 'day, token, interval, from and to are required' })
    const dir = path.join(CND, day)
    if (!fs.existsSync(dir)) return res.json({ ok: false })
    for (const fn of fs.readdirSync(dir)) {
      if (fn.indexOf(token + '_' + interval + '_') !== 0) continue
      const m = fn.match(/^\d+_[a-z0-9]+_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.json$/)
      if (!m || m[1] > from || m[2] < to) continue
      try {
        const e = JSON.parse(fs.readFileSync(path.join(dir, fn), 'utf8'))
        if (e.fetchedAt >= Date.parse(e.to + 'T23:56:00+05:30')) return res.json({ ok: true, candles: e.candles, from: e.from, to: e.to })
      } catch (err) { /* unreadable file: treated as a miss */ }
    }
    res.json({ ok: false })
  })
  app.post('/api/candles/put', express.json({ limit: '20mb' }), (req, res) => {
    const b = req.body || {}
    if (!okDay(b.day) || !okToken(b.token) || !okInterval(b.interval) || !okDay(b.from) || !okDay(b.to) || !Array.isArray(b.candles)) return res.status(400).json({ ok: false, error: 'day, token, interval, from, to and candles are required' })
    try {
      const dir = path.join(CND, b.day); fs.mkdirSync(dir, { recursive: true })
      const fp = path.join(dir, b.token + '_' + b.interval + '_' + b.from + '_' + b.to + '.json'), tmp = fp + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify({ token: b.token, interval: b.interval, from: b.from, to: b.to, fetchedAt: Date.now(), candles: b.candles })); fs.renameSync(tmp, fp)
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }) }
  })
  app.get('/api/candles/status', (req, res) => res.json({ ok: true, days: candleDays() }))
  app.post('/api/candles/delete', json, (req, res) => {
    const b = req.body || {}
    if (!okDay(b.day)) return res.status(400).json({ ok: false, error: 'day (YYYY-MM-DD) is required' })
    try { const dir = path.join(CND, b.day); if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); res.json({ ok: true }) } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }) }
  })
  app.post('/api/snapshot', express.json({ limit: '40mb' }), (req, res) => {
    const b = req.body || {}
    if (!okDay(b.day) || !okSession(b.session) || !okSlot(b.slot)) return res.status(400).json({ ok: false, error: 'day (YYYY-MM-DD), session (NSE or MCX) and slot (HH:MM) are required' })
    try { res.json({ ok: true, replaced: upsertSnapshot(b) }) } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e) }) }
  })
  app.get('/api/snapshot/days', (req, res) => res.json({ ok: true, days: snapDays() }))
  // viewer: a one-row summary per slot, one full snapshot, and the whole day as a download
  app.get('/api/snapshot/slots', (req, res) => {
    const { day, session } = req.query, want = String(req.query.name || '')
    if (!okDay(day) || !okSession(session)) return res.status(400).json({ ok: false, error: 'day and session are required' })
    const fp = path.join(SNAP, day + '_' + session + '.jsonl'), rows = [], nameSet = {}
    if (fs.existsSync(fp)) fs.readFileSync(fp, 'utf8').split('\n').forEach(l => {
      if (!l) return
      try {
        const r = JSON.parse(l), names = Object.keys(r.inst || {}), n0 = (want && names.indexOf(want) >= 0) ? want : names[0], _nm = names.forEach(x => { nameSet[x] = 1 }), i0 = (r.inst || {})[n0] || {}
        rows.push({ slot: r.slot, capturedAt: r.capturedAt, kb: Math.round(l.length / 1024), errors: (r.errors || []).length, refreshMs: r.refreshMs || null, name: n0 || null, px: i0.px ? i0.px.ltp : null, score: i0.score ? i0.score.total : null, fut: i0.fut ? i0.fut.remark : null, cons: i0.cons ? i0.cons.out : null,
          comp: r.mkt && r.mkt.scores ? r.mkt.scores.composite : null, vix: (i0.vol) ? i0.vol.value : (r.mkt ? r.mkt.vix : null), chain: i0.chain ? i0.chain.length : 0, stocks: r.stocks ? Object.keys(r.stocks).length : 0, app: r.app || '' })
      } catch (e) { /* unreadable line */ }
    })
    rows.sort((a, b) => (a.slot < b.slot ? -1 : 1))
    res.json({ ok: true, day, session, expected: expectedSlots(session), names: Object.keys(nameSet), rows })
  })
  app.get('/api/snapshot/slot', (req, res) => {
    const { day, session, slot } = req.query
    if (!okDay(day) || !okSession(session) || !okSlot(slot)) return res.status(400).json({ ok: false, error: 'day, session and slot are required' })
    const fp = path.join(SNAP, day + '_' + session + '.jsonl')
    if (!fs.existsSync(fp)) return res.status(404).json({ ok: false, error: 'no data for that day' })
    for (const l of fs.readFileSync(fp, 'utf8').split('\n')) { if (!l) continue; try { const r = JSON.parse(l); if (r.slot === slot) return res.json({ ok: true, snapshot: r }) } catch (e) { /* skip */ } }
    res.status(404).json({ ok: false, error: 'that slot is not recorded' })
  })
  // delete the recorded snapshots of one day: { day, session? } (no session = NSE and MCX). Only data/snapshots/<day>_<session>.jsonl can be removed.
  app.post('/api/snapshot/delete', json, (req, res) => {
    const b = req.body || {}
    if (!okDay(b.day)) return res.status(400).json({ ok: false, error: 'day (YYYY-MM-DD) is required' })
    if (b.session && !okSession(b.session)) return res.status(400).json({ ok: false, error: 'session must be NSE or MCX' })
    const removed = []
    try {
      ;(b.session ? [b.session] : ['NSE', 'MCX']).forEach(sess => {
        const fp = path.join(SNAP, b.day + '_' + sess + '.jsonl')
        if (fs.existsSync(fp)) { fs.unlinkSync(fp); removed.push(sess) }
        if (fs.existsSync(fp + '.tmp')) fs.unlinkSync(fp + '.tmp')
      })
      res.json({ ok: true, removed })
    } catch (e) { res.status(500).json({ ok: false, error: String(e.message || e), removed }) }
  })
  app.get('/api/snapshot/export', (req, res) => {
    const { day, session } = req.query
    if (!okDay(day) || !okSession(session)) return res.status(400).send('day and session are required')
    const fp = path.join(SNAP, day + '_' + session + '.jsonl')
    if (!fs.existsSync(fp)) return res.status(404).send('no data for that day')
    res.setHeader('Content-Type', 'application/x-ndjson'); res.setHeader('Content-Disposition', 'attachment; filename="' + day + '_' + session + '.jsonl"')
    fs.createReadStream(fp).pipe(res)
  })
  app.post('/api/rec/token', json, (req, res) => {
    const b = req.body || {}
    if (!b.apiKey || !b.accessToken) return res.status(400).json({ ok: false, error: 'apiKey and accessToken are required' })
    if (b.apiKey !== cfg.apiKey || b.accessToken !== cfg.accessToken) cfg.tokenSavedAt = new Date().toISOString()
    cfg.apiKey = String(b.apiKey).trim(); cfg.accessToken = String(b.accessToken).trim()
    if (Array.isArray(b.stocks) && b.stocks.length) cfg.stocks = b.stocks.filter(s => /^[A-Z0-9&\-]{1,20}$/i.test(s)).slice(0, 60)
    saveCfg(); res.json({ ok: true })
  })
  app.post('/api/rec/config', json, (req, res) => {
    const b = req.body || {}
    if (b.delayMs != null) cfg.delayMs = Math.max(MIN_GAP_MS, Math.min(120000, +b.delayMs || 10000))
    ;['auto', 'autoNse', 'autoMcx'].forEach(k => { if (b[k] != null) cfg[k] = !!b[k] })
    saveCfg(); res.json(state())
  })
  app.get('/api/rec/state', (req, res) => res.json(state()))
  app.post('/api/rec/test', json, async (req, res) => {
    try {
      const to = istNow().day, from = addDays(to, -4)
      const c = await hist(256265, '5minute', from + ' 09:00:00', to + ' 23:59:59', false)     // NIFTY 50 spot
      res.json({ ok: true, count: c.length, last: c.length ? c[c.length - 1][0] + ' close ' + c[c.length - 1][4] : '' })
    } catch (e) { res.json({ ok: false, error: e.message }) }
  })
  app.post('/api/rec/start', json, async (req, res) => {
    const b = req.body || {}
    try { const sessions = (b.sessions || []).filter(s => s === 'NSE' || s === 'MCX'); if (!sessions.length) throw new Error('choose NSE and / or MCX'); await startJob(b.day, sessions); res.json(state()) }
    catch (e) { res.status(400).json({ ok: false, error: e.message }) }
  })
  app.post('/api/rec/stop', json, (req, res) => { if (job && job.status === 'running') job.stop = true; res.json(state()) })
  app.get('/api/rec/days', (req, res) => res.json({ ok: true, days: days() }))
}

module.exports = { mount, _test: { parseInstruments, pickStrikes, dayRange, prevWeekday, istNow, nearestExpiries, strikeStep, startJob, state, getJob: () => job, setCfg: o => Object.assign(cfg, o), instruments } }
