// Network snapshots: compact quantised encoding of the host's game state,
// decoding into a render "view", and guest-side interpolation + own-orb prediction.

const TYPES = ['drifter', 'mini', 'dasher', 'splitter', 'spitter', 'brute', 'node'];
const GEMS = ['shard', 'prism', 'heart'];
const POWERS = ['mega', 'freeze', 'shield', 'nova'];
const PHASES = ['start', 'tutorial', 'fight', 'clear', 'over', 'won'];
const STEPS = ['move', 'together', 'stretch', 'sweep', 'gem', 'capsule', 'danger', 'wave', 'done'];
const r1 = (v) => Math.round(v);
const r10 = (v) => Math.round(v * 10);
const r100 = (v) => Math.round(v * 100);

export function encodeSnapshot(g, seq) {
  const e = [];
  for (const en of g.enemies) e.push(en.id, TYPES.indexOf(en.type), r1(en.x), r1(en.y), r100(en.a), en.st, r100(en.tm), en.flash > 0 ? 1 : 0);
  const s = [];
  for (const sh of g.shots) s.push(sh.id, r1(sh.x), r1(sh.y), sh.r);
  const gm = [];
  for (const x of g.gems) gm.push(x.id, r1(x.x), r1(x.y), GEMS.indexOf(x.kind), r10(x.t));
  const c = [];
  for (const x of g.capsules) c.push(x.id, r1(x.x), r1(x.y), POWERS.indexOf(x.kind), r10(x.t), r100(x.claim), x.in0, x.in1);
  const o = [];
  for (const x of g.portals) o.push(x.id, r1(x.x), r1(x.y), r100(x.t), r100(x.max));
  const b = g.boss;
  const bs = b ? [r1(b.x), r1(b.y), b.r, r10(b.hp), r10(b.maxHp), b.phase, r10(b.open), r100(b.tele), b.hitT > 0.07 ? 1 : 0, b.stun > 0 ? 1 : 0,
    b.beam.st, r100(b.beam.ang), b.beam.dir, b.charge.st, r100(b.charge.dx), r100(b.charge.dy)] : 0;
  const [p, q] = g.players;
  const R = g.rope;
  const snap = {
    q: seq, t: Math.round(g.tick * g.cfg.dt * 1000) / 1000,
    p: [r1(p.x * 10) / 10, r1(p.y * 10) / 10, r1(p.vx), r1(p.vy), r10(p.inv), r1(q.x * 10) / 10, r1(q.y * 10) / 10, r1(q.vx), r1(q.vy), r10(q.inv)],
    r: [r1(R.mx), r1(R.my), r1(R.len), r1(R.maxLen), r10(R.width), R.flash > 0 ? 1 : 0],
    e, s, g: gm, c, o, b: bs,
    w: [r10(g.power.mega), r10(g.power.freeze), r10(g.power.shield), r10(g.power.nova), g.lives, g.maxLives, g.startLives, g.score, g.combo, r10(g.mult), g.wave, PHASES.indexOf(g.phase), g.mode === 'survival' ? 0 : 1],
    u: g.tut ? [STEPS.indexOf(g.tut.step), ...g.tut.rings.flatMap((rg) => [r1(rg.x), r1(rg.y), rg.r, rg.who, rg.done ? 1 : 0])] : 0,
  };
  return snap;
}

export function decodeSnapshot(cfg, s) {
  const v = { cfg, t: s.t, q: s.q };
  const P = s.p;
  v.players = [
    { x: P[0], y: P[1], vx: P[2], vy: P[3], inv: P[4] / 10 },
    { x: P[5], y: P[6], vx: P[7], vy: P[8], inv: P[9] / 10 },
  ];
  v.rope = { mx: s.r[0], my: s.r[1], len: s.r[2], maxLen: s.r[3], width: s.r[4] / 10, flash: s.r[5] ? 0.1 : 0 };
  v.enemies = [];
  for (let i = 0; i < s.e.length; i += 8) {
    const type = TYPES[s.e[i + 1]], a = s.e[i + 4] / 100;
    v.enemies.push({ id: s.e[i], type, x: s.e[i + 2], y: s.e[i + 3], a, st: s.e[i + 5], tm: s.e[i + 6] / 100, flash: s.e[i + 7] ? 0.1 : 0, r: cfg.enemies[type].r, dx: Math.cos(a), dy: Math.sin(a) });
  }
  v.shots = [];
  for (let i = 0; i < s.s.length; i += 4) v.shots.push({ id: s.s[i], x: s.s[i + 1], y: s.s[i + 2], r: s.s[i + 3] });
  v.gems = [];
  for (let i = 0; i < s.g.length; i += 5) v.gems.push({ id: s.g[i], x: s.g[i + 1], y: s.g[i + 2], kind: GEMS[s.g[i + 3]], t: s.g[i + 4] / 10 });
  v.capsules = [];
  for (let i = 0; i < s.c.length; i += 8) v.capsules.push({ id: s.c[i], x: s.c[i + 1], y: s.c[i + 2], kind: POWERS[s.c[i + 3]], t: s.c[i + 4] / 10, claim: s.c[i + 5] / 100, in0: s.c[i + 6], in1: s.c[i + 7] });
  v.portals = [];
  for (let i = 0; i < s.o.length; i += 5) v.portals.push({ id: s.o[i], x: s.o[i + 1], y: s.o[i + 2], t: s.o[i + 3] / 100, max: s.o[i + 4] / 100 });
  const b = s.b;
  v.boss = b ? { x: b[0], y: b[1], r: b[2], hp: b[3] / 10, maxHp: b[4] / 10, phase: b[5], open: b[6] / 10, tele: b[7] / 100, hitT: b[8] ? 0.1 : 0, stun: b[9],
    beam: { st: b[10], ang: b[11] / 100, dir: b[12] }, charge: { st: b[13], dx: b[14] / 100, dy: b[15] / 100 } } : null;
  const w = s.w;
  v.power = { mega: w[0] / 10, freeze: w[1] / 10, shield: w[2] / 10, nova: w[3] / 10 };
  v.lives = w[4]; v.maxLives = w[5]; v.startLives = w[6]; v.score = w[7]; v.combo = w[8]; v.mult = w[9] / 10; v.wave = w[10];
  v.phase = PHASES[w[11]]; v.mode = w[12] ? 'endless' : 'survival';
  if (s.u) {
    const u = s.u, rings = [];
    for (let i = 1; i < u.length; i += 5) rings.push({ x: u[i], y: u[i + 1], r: u[i + 2], who: u[i + 3], done: !!u[i + 4] });
    v.tut = { step: STEPS[u[0]], rings };
  } else v.tut = null;
  return v;
}

const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Guest-side buffer: holds decoded snapshots and produces an interpolated view.
export class Interpolator {
  constructor(cfg) {
    this.cfg = cfg;
    this.buf = [];
    this.offset = null;       // hostTime - localTime (s), smoothed
    this.delay = cfg.net.interpDelay;
    this.lastSeq = -1;
    this.pred = null;         // own-orb prediction {x,y,vx,vy}
  }

  reset() { this.buf.length = 0; this.offset = null; this.lastSeq = -1; this.pred = null; }

  push(snap, now) {
    if (snap.q <= this.lastSeq) return; // stale / duplicate (unordered channel)
    this.lastSeq = snap.q;
    const v = decodeSnapshot(this.cfg, snap);
    const off = v.t - now;
    // track the *largest* offset seen recently (least delayed packet), decaying slowly
    // (a packet >300 ms "late" means the host clock jumped, e.g. after a pause: resync)
    if (this.offset === null || off > this.offset || off < this.offset - 0.3) this.offset = off;
    else this.offset += (off - this.offset) * 0.02;
    this.buf.push(v);
    if (this.buf.length > 40) this.buf.shift();
  }

  get latest() { return this.buf[this.buf.length - 1] || null; }

  view(now) {
    const n = this.buf.length;
    if (!n) return null;
    if (n === 1) return this.buf[0];
    const rt = now + this.offset - this.delay;
    let i = n - 1;
    while (i > 0 && this.buf[i - 1].t > rt) i--;
    if (i === 0) return this.buf[0];
    const a = this.buf[i - 1], b = this.buf[i];
    let t = (rt - a.t) / Math.max(0.001, b.t - a.t);
    t = Math.max(0, Math.min(1.5, t)); // small extrapolation when starved
    const v = Object.assign({}, b);
    v.players = b.players.map((pb, k) => {
      const pa = a.players[k];
      return { x: lerp(pa.x, pb.x, t), y: lerp(pa.y, pb.y, t), vx: pb.vx, vy: pb.vy, inv: pb.inv };
    });
    v.rope = Object.assign({}, b.rope, { mx: lerp(a.rope.mx, b.rope.mx, t), my: lerp(a.rope.my, b.rope.my, t), len: lerp(a.rope.len, b.rope.len, t) });
    const amap = new Map(a.enemies.map((e) => [e.id, e]));
    v.enemies = b.enemies.map((eb) => {
      const ea = amap.get(eb.id);
      if (!ea) return eb;
      return Object.assign({}, eb, { x: lerp(ea.x, eb.x, t), y: lerp(ea.y, eb.y, t), a: lerpAngle(ea.a, eb.a, t), tm: lerp(ea.tm, eb.tm, Math.min(t, 1)) });
    });
    const smap = new Map(a.shots.map((s) => [s.id, s]));
    v.shots = b.shots.map((sb) => { const sa = smap.get(sb.id); return sa ? { ...sb, x: lerp(sa.x, sb.x, t), y: lerp(sa.y, sb.y, t) } : sb; });
    const gmap = new Map(a.gems.map((s) => [s.id, s]));
    v.gems = b.gems.map((gb) => { const ga = gmap.get(gb.id); return ga ? { ...gb, x: lerp(ga.x, gb.x, t), y: lerp(ga.y, gb.y, t) } : gb; });
    if (a.boss && b.boss) {
      v.boss = Object.assign({}, b.boss, { x: lerp(a.boss.x, b.boss.x, t), y: lerp(a.boss.y, b.boss.y, t), beam: { ...b.boss.beam, ang: lerpAngle(a.boss.beam.ang, b.boss.beam.ang, t) } });
    }
    v.renderTime = rt;
    return v;
  }

  // Own-orb prediction: integrate local input with the same movement model,
  // softly corrected toward the newest authoritative position.
  predict(slot, input, dt) {
    const L = this.latest;
    if (!L) return null;
    const P = this.cfg.player, auth = L.players[slot];
    if (!this.pred) this.pred = { x: auth.x, y: auth.y, vx: auth.vx, vy: auth.vy };
    const p = this.pred, k = 1 - Math.exp(-P.response * dt);
    p.vx += (input.x * P.maxSpeed - p.vx) * k;
    p.vy += (input.y * P.maxSpeed - p.vy) * k;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const ex = auth.x - p.x, ey = auth.y - p.y, err = Math.hypot(ex, ey);
    if (err > 140) { p.x = auth.x; p.y = auth.y; p.vx = auth.vx; p.vy = auth.vy; }
    else { const c = 1 - Math.exp(-7 * dt); p.x += ex * c; p.y += ey * c; }
    const { w, h } = this.cfg.arena, r = P.radius;
    p.x = Math.max(r, Math.min(w - r, p.x)); p.y = Math.max(r, Math.min(h - r, p.y));
    return p;
  }
}
