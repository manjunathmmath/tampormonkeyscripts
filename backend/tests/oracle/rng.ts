/** Small seeded random numbers so a failing case can be reproduced. */
export function rng(seed: number): { next(): number; int(a: number, b: number): number; pick<T>(xs: readonly T[]): T; chance(p: number): boolean; range(a: number, b: number): number } {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (xs) => xs[Math.floor(next() * xs.length)]!,
    chance: (p) => next() < p,
    range: (a, b) => a + next() * (b - a),
  };
}
