const fs = require('fs');
const S = __dirname + '/';
const raw = JSON.parse(fs.readFileSync(S + 'market_sessions.json', 'utf8')).rows;
const plans = JSON.parse(fs.readFileSync(S + 'plans.json', 'utf8')).plans;
const IDX = ['NIFTY', 'BANKNIFTY', 'SENSEX'];

// row: [d, prev, o915, c915, ent, p0955, p1055, p1155, close, hi11, lo11, dayHi, dayLo, n]
const FLAT = 0.15, BIG = 0.5;
function bucketOf(g) { return Math.abs(g) <= FLAT ? 'f' : g > 0 ? 'u' : (g >= -BIG ? 'ds' : 'db'); }
function mk(r) {
  const [d, prev, o, c915, ent, p10, p11, p12, cl, hi, lo, dh, dl] = r;
  if (!prev || !ent || !p11 || !cl) return null;
  const g = (o - prev) / prev * 100;
  return { d, g, b: bucketOf(g), ent, p11, cl, hi, lo, prev, o, c915, dh, dl };
}
function trade(x, dir) {
  const ret11 = dir * (x.p11 / x.ent - 1) * 100, retC = dir * (x.cl / x.ent - 1) * 100;
  const mfe = dir > 0 ? (x.hi - x.ent) / x.ent * 100 : (x.ent - x.lo) / x.ent * 100;
  const mae = dir > 0 ? (x.ent - x.lo) / x.ent * 100 : (x.hi - x.ent) / x.ent * 100;
  return { ret11, retC, mfe, mae };
}
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
const median = a => { if (!a.length) return NaN; const s = a.slice().sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function wilson(w, n) { if (!n) return [NaN, NaN]; const z = 1.96, p = w / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - m) / d, (c + m) / d]; }
function summ(ts) {
  const n = ts.length; if (!n) return null;
  const w11 = ts.filter(t => t.ret11 > 0).length, wC = ts.filter(t => t.retC > 0).length;
  const gw = ts.filter(t => t.ret11 > 0).reduce((s, t) => s + t.ret11, 0), gl = -ts.filter(t => t.ret11 < 0).reduce((s, t) => s + t.ret11, 0);
  const ci = wilson(w11, n);
  return { n, win11: (w11 / n * 100).toFixed(0) + '%', ci: (ci[0] * 100).toFixed(0) + '-' + (ci[1] * 100).toFixed(0) + '%', winClose: (wC / n * 100).toFixed(0) + '%',
    avg11: mean(ts.map(t => t.ret11)).toFixed(3), med11: median(ts.map(t => t.ret11)).toFixed(3), avgClose: mean(ts.map(t => t.retC)).toFixed(3),
    avgWin: (w11 ? gw / w11 : 0).toFixed(3), avgLoss: (n - w11 ? -gl / (n - w11) : 0).toFixed(3), pf11: gl ? (gw / gl).toFixed(2) : 'inf', mfe: mean(ts.map(t => t.mfe)).toFixed(2), mae: mean(ts.map(t => t.mae)).toFixed(2) };
}

const data = {};
IDX.forEach(k => { data[k] = raw[k].map(mk).filter(Boolean); });

// 1. Plan following
const rowsPlan = [];
IDX.forEach(k => data[k].forEach(x => {
  const p = plans[x.d]; if (!p) return;
  const side = p[x.b]; if (!side) return;
  const dir = side === 'BUY' ? 1 : -1;
  rowsPlan.push(Object.assign({ idx: k, b: x.b, side, g: x.g, d: x.d }, trade(x, dir), { rev11: -trade(x, dir).ret11 }));
}));
console.log('plan days covered:', [...new Set(rowsPlan.map(r => r.d))].length, 'trades:', rowsPlan.length);
console.log('ALL plan trades (entry 09:20 open, exit 11:00 / close), % of index:'); console.log(summ(rowsPlan));
console.log('\nBy index:'); IDX.forEach(k => console.log(k, JSON.stringify(summ(rowsPlan.filter(r => r.idx === k)))));
console.log('\nBy gap bucket (f=flat, u=gap-up, ds=small gap-down, db=big gap-down):'); ['f', 'u', 'ds', 'db'].forEach(b => console.log(b, JSON.stringify(summ(rowsPlan.filter(r => r.b === b)))));
console.log('\nBy side:'); ['BUY', 'SELL'].forEach(s => console.log(s, JSON.stringify(summ(rowsPlan.filter(r => r.side === s)))));
console.log('\nBucket x side:'); ['f', 'u', 'ds', 'db'].forEach(b => ['BUY', 'SELL'].forEach(s => { const t = rowsPlan.filter(r => r.b === b && r.side === s); if (t.length) console.log(b, s, JSON.stringify(summ(t))); }));

// day-level (average of 3 indices)
const byDay = {}; rowsPlan.forEach(r => { (byDay[r.d] = byDay[r.d] || []).push(r); });
const dayRet = Object.keys(byDay).sort().map(d => ({ d, ret11: mean(byDay[d].map(r => r.ret11)), retC: mean(byDay[d].map(r => r.retC)), b: byDay[d][0].b, side: byDay[d][0].side }));
console.log('\nDay-level (indices averaged), n days =', dayRet.length);
console.log('win@11:', dayRet.filter(x => x.ret11 > 0).length + '/' + dayRet.length, ' avg11:', mean(dayRet.map(x => x.ret11)).toFixed(3), ' win@close:', dayRet.filter(x => x.retC > 0).length + '/' + dayRet.length, ' avgClose:', mean(dayRet.map(x => x.retC)).toFixed(3));
dayRet.forEach(x => console.log(x.d, x.b.padEnd(2), x.side.padEnd(4), (x.ret11 >= 0 ? '+' : '') + x.ret11.toFixed(2) + '%@11', (x.retC >= 0 ? '+' : '') + x.retC.toFixed(2) + '%@close'));

// 2. Baselines on the SAME plan days / same trades count
function baseline(name, fn) {
  const t = []; IDX.forEach(k => data[k].forEach(x => { if (!plans[x.d]) return; const dir = fn(x); if (!dir) return; t.push(trade(x, dir)); }));
  console.log(name.padEnd(28), JSON.stringify(summ(t)));
}
console.log('\nBaselines on the same plan days:');
baseline('always BUY', () => 1);
baseline('always SELL', () => -1);
baseline('follow the gap (skip flat)', x => x.b === 'f' ? 0 : (x.g > 0 ? 1 : -1));
baseline('fade the gap (skip flat)', x => x.b === 'f' ? 0 : (x.g > 0 ? -1 : 1));
baseline('PLAN reversed', x => { const p = plans[x.d][x.b]; return p ? (p === 'BUY' ? -1 : 1) : 0; });

// 3. Inferring his rule: previous session direction vs the side he picks on a flat open
console.log('\nPrevious-session move (NIFTY, close vs 09:15 open) vs his flat-open side:');
const nd = data.NIFTY; const idxOf = {}; nd.forEach((x, i) => idxOf[x.d] = i);
const rows3 = [];
Object.keys(plans).sort().forEach(d => { const i = idxOf[d]; if (i == null || i < 1) return; const pv = nd[i - 1]; const pd = (pv.cl - pv.o) / pv.o * 100; rows3.push({ d, pd, f: plans[d].f, u: plans[d].u }); });
rows3.forEach(r => console.log(r.d, (r.pd >= 0 ? '+' : '') + r.pd.toFixed(2) + '% prev day', ' flat->', r.f, ' gapup->', r.u));
const up = rows3.filter(r => r.pd > 0), dn = rows3.filter(r => r.pd <= 0);
console.log('prev day UP  : flat SELL', up.filter(r => r.f === 'SELL').length, 'flat BUY', up.filter(r => r.f === 'BUY').length, '| gap-up BUY', up.filter(r => r.u === 'BUY').length, 'gap-up SELL', up.filter(r => r.u === 'SELL').length);
console.log('prev day DOWN: flat SELL', dn.filter(r => r.f === 'SELL').length, 'flat BUY', dn.filter(r => r.f === 'BUY').length, '| gap-up BUY', dn.filter(r => r.u === 'BUY').length, 'gap-up SELL', dn.filter(r => r.u === 'SELL').length);

// 4. Market base rates over ALL ~57 sessions (independent of his plans)
console.log('\nBase rates, all sessions (move from 09:20 open): share of sessions UP at 11:00 / at close, by gap bucket');
IDX.forEach(k => {
  console.log(k);
  ['f', 'u', 'ds', 'db'].forEach(b => {
    const t = data[k].filter(x => x.b === b); if (!t.length) return;
    const u11 = t.filter(x => x.p11 > x.ent).length, uC = t.filter(x => x.cl > x.ent).length;
    console.log('  ', b.padEnd(2), 'n=' + t.length, 'up@11 ' + (u11 / t.length * 100).toFixed(0) + '%', 'up@close ' + (uC / t.length * 100).toFixed(0) + '%', 'avg@11 ' + mean(t.map(x => (x.p11 / x.ent - 1) * 100)).toFixed(3) + '%');
  });
});
