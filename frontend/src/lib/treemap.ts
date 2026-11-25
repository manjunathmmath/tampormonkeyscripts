export interface TreeItem { key: string; value: number }
export interface Rect { key: string; x: number; y: number; w: number; h: number }

/** Squarified treemap (Bruls, Huizing and van Wijk): tiles whose area is proportional to `value`, kept as close to squares as possible. Items with no value are dropped. */
export function squarify(items: TreeItem[], width: number, height: number): Rect[] {
  const list = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((a, i) => a + i.value, 0);
  if (!list.length || width <= 0 || height <= 0 || total <= 0) return [];
  const scale = (width * height) / total;
  const nodes = list.map((i) => ({ key: i.key, area: i.value * scale }));
  const out: Rect[] = [];
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;

  const worst = (row: { area: number }[], side: number): number => {
    const s = row.reduce((a, r) => a + r.area, 0);
    const max = Math.max(...row.map((r) => r.area));
    const min = Math.min(...row.map((r) => r.area));
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };
  const layout = (row: { key: string; area: number }[]): void => {
    const s = row.reduce((a, r) => a + r.area, 0);
    if (w >= h) {
      // a column on the left
      const cw = s / h;
      let cy = y;
      for (const r of row) { const rh = r.area / cw; out.push({ key: r.key, x, y: cy, w: cw, h: rh }); cy += rh; }
      x += cw;
      w -= cw;
    } else {
      const rh = s / w;
      let cx = x;
      for (const r of row) { const rw = r.area / rh; out.push({ key: r.key, x: cx, y, w: rw, h: rh }); cx += rw; }
      y += rh;
      h -= rh;
    }
  };

  let row: { key: string; area: number }[] = [];
  for (const n of nodes) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, n], side) <= worst(row, side)) row.push(n);
    else { layout(row); row = [n]; }
  }
  if (row.length) layout(row);
  return out;
}

/** Colour of a tile by its move: green for up, red for down, saturating at `full` percent; dark-neutral near zero. Returns an rgb() string that works on both themes. */
export function heatColor(pct: number | null, full = 3): string {
  if (pct == null || !Number.isFinite(pct)) return 'rgb(120,126,140)';
  const k = Math.min(1, Math.abs(pct) / full);
  const base = [96, 104, 120];
  const tgt = pct >= 0 ? [22, 163, 74] : [220, 38, 38];
  const c = base.map((b, i) => Math.round(b + (tgt[i]! - b) * (0.18 + 0.82 * k)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
