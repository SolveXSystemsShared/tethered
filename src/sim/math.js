// Small math + deterministic RNG helpers shared by the simulation and bots.

export function makeRng(seed) {
  let a = seed >>> 0 || 0x9e3779b9;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + (hi - lo) * rng();
  rng.int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.state = () => a;
  rng.setState = (s) => { a = s >>> 0; };
  return rng;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const len = (x, y) => Math.sqrt(x * x + y * y);
export const dist = (ax, ay, bx, by) => Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
export const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

// Closest point on segment AB to P. Returns the distance; the segment parameter t
// is left in segT.t (no allocation: this runs thousands of times per frame).
export const segT = { t: 0 };
export function segDistT(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  segT.t = t;
  const cx = ax + dx * t - px, cy = ay + dy * t - py;
  return Math.sqrt(cx * cx + cy * cy);
}
// Convenience form: [distance, t]
export function segDist(px, py, ax, ay, bx, by) {
  const d = segDistT(px, py, ax, ay, bx, by);
  return [d, segT.t];
}

// Turn angle a toward b by at most maxStep radians.
export function turnToward(a, b, maxStep) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
