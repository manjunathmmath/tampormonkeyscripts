// Day-level permutation test: if his BUY/SELL side were chosen at random each day, how often would a result this good happen?
const days = [
 ['09-17',  0.02, 0.17], ['09-18', -0.13, 0.01], ['09-21', 0.02, 0.04], ['09-22', -0.27, -0.56], ['09-23', 0.16, 0.18], ['09-24', -0.00, 0.64], ['09-25', -0.06, 0.20],
 ['09-28', 0.54, 0.78], ['09-29', 0.34, -0.10], ['09-30', 0.14, -0.06], ['10-01', -0.14, 0.60], ['10-05', -0.42, -0.24], ['10-06', 0.27, 0.67], ['10-07', 0.56, 0.10],
 ['10-08', 0.17, 0.99], ['10-09', -0.84, -0.93], ['10-12', -0.70, -0.81], ['10-13', 0.22, 1.03], ['10-14', 0.27, -0.19], ['10-15', 0.87, 1.14], ['10-16', 0.46, 0.66],
];
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
function perm(col, label) {
  const r = days.map(d => d[col]), act = mean(r), N = 200000; let ge = 0;
  for (let i = 0; i < N; i++) { let s = 0; for (const x of r) s += (Math.random() < 0.5 ? 1 : -1) * Math.abs(x); if (s / r.length >= act) ge++; }
  const t = act / (sd(r) / Math.sqrt(r.length));
  console.log(label, 'avg', act.toFixed(3) + '%', 'sd', sd(r).toFixed(3), 't=' + t.toFixed(2), 'permutation p(one-sided, random sides) =', (ge / N).toFixed(3));
}
perm(1, 'to 11:00:');
perm(2, 'to close:');
// worst/best day share
const r11 = days.map(d => d[1]).sort((a, b) => a - b);
console.log('best 3 days sum', r11.slice(-3).reduce((s, v) => s + v, 0).toFixed(2), '| total', r11.reduce((s, v) => s + v, 0).toFixed(2), '| total without best 3', r11.slice(0, -3).reduce((s, v) => s + v, 0).toFixed(2));
const rc = days.map(d => d[2]).sort((a, b) => a - b);
console.log('close: best 3 days sum', rc.slice(-3).reduce((s, v) => s + v, 0).toFixed(2), '| total', rc.reduce((s, v) => s + v, 0).toFixed(2), '| total without best 3', rc.slice(0, -3).reduce((s, v) => s + v, 0).toFixed(2));
