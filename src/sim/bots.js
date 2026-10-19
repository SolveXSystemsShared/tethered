// Bot players for difficulty simulation (and the menu attract demo).
// Each bot controls one orb with a short-horizon planner: every decision it
// scores candidate stick directions by predicting where its orb, its partner,
// the rope and nearby threats will be, then picks the best (plus skill noise).
// Skill = human-like limits: decision rate, reaction lag, look-ahead, attention,
// safety margin, evaluation noise, distraction and partner coordination.
import { makeRng, len, dist, clamp } from './math.js';

// Calibrated as human models (fixed before tuning the game; see docs/sim-results.md):
//   reaction ~= half a decision interval + lag  ->  weak ~325 ms, average ~225 ms, strong ~150 ms
export const BOT_SKILLS = {
  weak: { // a beginner pair (e.g. two 10-year-olds on their first runs)
    hz: 4, lag: 0.2, horizon: 0.45, attention: 0.8, panic: 90, margin: 14, noise: 2.5, stick: 0.8,
    distract: 0.03, distractTime: [0.4, 1.0], coord: 0.25, lance: 0.3, lane: 0.45, shot: 0.4,
    gem: 0.6, capsule: 0.4, saw: 0.45, hunt: 0.6, dirs: 8, formation: 0.3,
  },
  average: { // a casual pair who have played a few times
    hz: 6, lag: 0.14, horizon: 0.55, attention: 0.9, panic: 120, margin: 24, noise: 1.5, stick: 0.9,
    distract: 0.015, distractTime: [0.3, 0.7], coord: 0.55, lance: 0.6, lane: 0.75, shot: 0.7,
    gem: 0.8, capsule: 0.75, saw: 0.75, hunt: 0.85, dirs: 12, formation: 0.7,
  },
  strong: { // an experienced, well-coordinated pair
    hz: 10, lag: 0.1, horizon: 0.65, attention: 0.97, panic: 150, margin: 32, noise: 0.8, stick: 1,
    distract: 0.004, distractTime: [0.2, 0.4], coord: 0.9, lance: 0.95, lane: 0.95, shot: 0.95,
    gem: 0.9, capsule: 0.95, saw: 0.95, hunt: 1, dirs: 16, formation: 1,
  },
};

const PRIORITY = { spitter: 1.6, dasher: 1.3, brute: 1.2, splitter: 1.2, drifter: 1, mini: 0.9, node: 1.5 };
const TAUS = [0.25, 0.5, 0.75, 1];
const HOMERS = { drifter: 1, mini: 1, splitter: 1, brute: 1 };

export class Bot {
  constructor(game, idx, skill, seed = 1) {
    this.g = game; this.i = idx;
    this.s = typeof skill === 'string' ? BOT_SKILLS[skill] : skill;
    this.rng = makeRng(seed * 7919 + idx * 104729 + 17);
    this.out = { x: 0, y: 0 };
    this.want = { x: 0, y: 0 };
    this.nextDecide = 0;
    this.distractUntil = -1;
    this.clock = 0;
    this.side = idx ? 1 : -1;
    this.partner = null;          // set by pairBots() so bots can share intentions
    this.noticed = new Map();     // enemy id -> noticed? (attention, re-rolled occasionally)
  }

  update(dt) {
    this.clock += dt;
    if (this.clock >= this.nextDecide) {
      this.nextDecide = this.clock + (1 / this.s.hz) * (0.8 + this.rng() * 0.4);
      this.decide();
    }
    const k = 1 - Math.exp(-dt / this.s.lag);
    this.out.x += (this.want.x - this.out.x) * k;
    this.out.y += (this.want.y - this.out.y) * k;
    return this.out;
  }

  decide() {
    const g = this.g, s = this.s, rng = this.rng;
    const me = g.players[this.i], mate = g.players[1 - this.i];
    if (g.phase === 'tutorial') return this.tutorial(me, mate);
    if (this.clock < this.distractUntil) return;
    if (rng() < s.distract) {
      this.distractUntil = this.clock + rng.range(s.distractTime[0], s.distractTime[1]);
      const a = rng() * Math.PI * 2, m = rng() < 0.5 ? 0 : 0.6;
      this.want.x = Math.cos(a) * m; this.want.y = Math.sin(a) * m;
      return;
    }
    // attention: which enemies has this player noticed right now?
    this.noticed.clear();
    for (const e of g.enemies) this.noticed.set(e.id, dist(e.x, e.y, me.x, me.y) < s.panic || rng() < s.attention);
    // awareness is rolled once per decision: you either noticed the beam/lane/shots or you didn't
    this.aware = { lance: rng() < s.lance, lane: rng() < s.lane, shot: rng() < s.shot };

    const goal = this.goal(me, mate);
    const coord = rng() < s.coord;
    // partner prediction: a coordinated player knows what the partner intends
    let mvx = mate.vx, mvy = mate.vy;
    if (coord && this.partner) { mvx = this.partner.want.x * g.cfg.player.maxSpeed; mvy = this.partner.want.y * g.cfg.player.maxSpeed; }

    let best = -1e9, bx = 0, by = 0;
    const n = s.dirs;
    for (let c = 0; c <= n; c++) {
      const dx = c === n ? 0 : Math.cos((c / n) * Math.PI * 2);
      const dy = c === n ? 0 : Math.sin((c / n) * Math.PI * 2);
      const sc = this.score(me, mate, mvx, mvy, dx, dy, goal) + (rng() - 0.5) * 2 * s.noise;
      if (sc > best) { best = sc; bx = dx; by = dy; }
    }
    this.want.x = bx * s.stick; this.want.y = by * s.stick;
  }

  // predicted displacement after tau seconds when steering in direction (dx,dy)
  // (the player's own reaction lag means the current velocity carries on briefly)
  predict(p, dx, dy, tau) {
    const P = this.g.cfg.player, k = P.response, ms = P.maxSpeed * this.s.stick;
    const l = Math.min(tau, this.s.lag * 0.5), t2 = tau - l;
    const x0 = p.x + p.vx * l, y0 = p.y + p.vy * l;
    const f = (1 - Math.exp(-k * t2)) / k;
    return [x0 + dx * ms * (t2 - f) + p.vx * f, y0 + dy * ms * (t2 - f) + p.vy * f];
  }

  score(me, mate, mvx, mvy, dx, dy, goal) {
    const g = this.g, s = this.s, cfg = g.cfg;
    const H = s.horizon, hit = cfg.player.hitRadius, R = g.rope;
    const { w, h } = cfg.arena;
    let danger = 0, sweep = 0;
    const counted = new Set();
    for (const tf of TAUS) {
      const tau = H * tf;
      let [px, py] = this.predict(me, dx, dy, tau);
      let qx = mate.x + mvx * tau, qy = mate.y + mvy * tau;
      px = clamp(px, 20, w - 20); py = clamp(py, 20, h - 20);
      qx = clamp(qx, 20, w - 20); qy = clamp(qy, 20, h - 20);
      // keep the predicted rope within its max length
      let rx = qx - px, ry = qy - py, rl = len(rx, ry) || 1;
      if (rl > R.maxLen) { const ex = (rl - R.maxLen) / 2; px += rx / rl * ex; py += ry / rl * ex; qx -= rx / rl * ex; qy -= ry / rl * ex; rx = qx - px; ry = qy - py; rl = R.maxLen; }
      const ux = rx / rl, uy = ry / rl;
      for (const e of g.enemies) {
        if (!this.noticed.get(e.id)) continue;
        const kf = (1 - Math.exp(-5 * tau)) / 5; // knockback impulse decays
        let ex, ey;
        if (HOMERS[e.type] && e.born >= 0.1) {
          // homing enemies chase the nearest orb: predict them closing on where I'll be
          const tgtMe = dist(e.x, e.y, me.x, me.y) <= dist(e.x, e.y, mate.x, mate.y);
          const tx = tgtMe ? px : qx, ty = tgtMe ? py : qy;
          const hx = tx - e.x, hy = ty - e.y, hl = len(hx, hy) || 1;
          const step = Math.min(hl, len(e.vx, e.vy) * tau);
          ex = e.x + hx / hl * step + e.kx * kf; ey = e.y + hy / hl * step + e.ky * kf;
        } else { ex = e.x + e.vx * tau + e.kx * kf; ey = e.y + e.vy * tau + e.ky * kf; }
        if (e.type === 'dasher' && e.st === 1 && e.tm + tau > cfg.enemies.dasher.aim) {
          const dt2 = e.tm + tau - cfg.enemies.dasher.aim;
          ex = e.x + e.dx * cfg.enemies.dasher.dashSpeed * Math.min(dt2, cfg.enemies.dasher.dashTime);
          ey = e.y + e.dy * cfg.enemies.dasher.dashSpeed * Math.min(dt2, cfg.enemies.dasher.dashTime);
        }
        // touching the rope during the horizon? -> a kill (counted once)
        const rd = segPointDist(ex, ey, px, py, qx, qy);
        const cuttable = true; // armour either breaks (fast rope) or loses a plate (slow rope): always progress
        // danger to my orb
        const d = dist(px, py, ex, ey);
        // (an enemy reaching my own end of the rope is a hit, not a cut)
        if (rd < e.r + R.width + 6 && d > hit + e.r + 40 && cuttable && !counted.has(e.id)) { counted.add(e.id); sweep += PRIORITY[e.type] || 1; }
        const Rs = hit + e.r + s.margin;
        if (d < Rs) {
          let f = (1 - d / Rs); f *= f;
          if (d < hit + e.r * 0.85 + 4) f += 1.5; // predicted collision
          // "lance": an enemy coming at me from along the rope gets cut before it reaches me
          const ax = ex - px, ay = ey - py, al = len(ax, ay) || 1;
          const cos = (ax * ux + ay * uy) / al;
          if (cos > 0.78 && al < rl && this.aware.lance && e.type !== 'node') f *= 0.15;
          danger += f * (e.type === 'node' ? 0.6 : 1);
        }
        // dasher lanes
        if (e.type === 'dasher' && (e.st === 1 || e.st === 2) && this.aware.lane) {
          const L = cfg.enemies.dasher.dashSpeed * cfg.enemies.dasher.dashTime;
          const ld = segPointDist(px, py, e.x, e.y, e.x + e.dx * L, e.y + e.dy * L);
          if (ld < e.r + hit + s.margin * 0.5) danger += 0.8;
        }
      }
      for (const sh of g.shots) {
        if (!this.aware.shot) continue;
        const sx = sh.x + sh.vx * tau, sy = sh.y + sh.vy * tau;
        const d = dist(px, py, sx, sy), Rs = hit + sh.r + s.margin * 0.7;
        if (d < Rs) {
          // a shot that meets the rope first is blocked (players learn to hide behind the rope)
          const blocked = this.aware.lance && segPointDist(sx, sy, px, py, qx, qy) < sh.r + R.width && d > hit + sh.r + 15;
          if (!blocked) { let f = 1 - d / Rs; f *= f; if (d < hit + sh.r + 3) f += 1.5; danger += f; }
        }
      }
      const b = g.boss;
      if (b) {
        const d = dist(px, py, b.x, b.y), Rs = hit + b.r + s.margin + 10;
        if (d < Rs) { const f = 1 - d / Rs; danger += f * f * 1.5; }
        if (b.beam.st >= 1 && this.aware.lane) {
          const ang = b.beam.ang + (b.beam.st === 2 ? b.beam.dir * cfg.boss.beamSpin * tau : 0);
          const ld = segPointDist(px, py, b.x, b.y, b.x + Math.cos(ang) * 2000, b.y + Math.sin(ang) * 2000);
          if (ld < cfg.boss.beamWidth + hit + s.margin) danger += b.beam.st === 2 ? 1.2 : 0.5;
        }
        if (b.charge.st >= 1 && this.aware.lane) {
          const ld = segPointDist(px, py, b.x, b.y, b.x + b.charge.dx * 2000, b.y + b.charge.dy * 2000);
          if (ld < b.r + hit + s.margin) danger += 1;
        }
      }
      // walls
      const wm = 40;
      if (px < wm || px > w - wm || py < wm || py > h - wm) danger += 0.05;
      if (tf === 1) {
        // goal attraction + formation
        this._end = [px, py, rl];
      }
    }
    const [ex, ey, rl] = this._end;
    let val = -danger * 60 + sweep * 9;
    if (goal) val -= dist(ex, ey, goal[0], goal[1]) * 0.02 * goal[2];
    if (rl < cfg.rope.rest * 0.55) val -= 3;
    // formation: skilled pairs keep the rope stretched wide (bigger sweep, enemies meet the rope first)
    val -= Math.abs(rl - R.maxLen * 0.82) * 0.02 * s.formation;
    // stay out of corners/edges where you can be pinned
    val -= (Math.max(0, 90 - Math.min(ex, w - ex)) + Math.max(0, 90 - Math.min(ey, h - ey))) * 0.02 * s.formation;
    if (g.boss && g.boss.open > 0 && rl > R.maxLen * cfg.rope.tautRatio) val += 1.5;
    return val;
  }

  // where this orb would like to be (x, y, weight), from the pair's plan
  goal(me, mate) {
    const g = this.g, s = this.s, rng = this.rng, R = g.rope;
    const mx = (me.x + mate.x) / 2, my = (me.y + mate.y) / 2;
    if (g.power.nova > 0 && g.enemies.length > 2 && rng() < s.capsule) return [mate.x, mate.y, 3];
    if (g.capsules.length && rng() < s.capsule) {
      const c = g.capsules[0];
      if (dist(c.x, c.y, mx, my) < 700) return [c.x + (this.i ? 25 : -25), c.y, 2.5];
    }
    const b = g.boss;
    if (b && b.open > 0 && rng() < s.saw) {
      const [p0, p1] = g.players;
      let ax = p0.x - p1.x, ay = p0.y - p1.y;
      const al = len(ax, ay) || 1; ax /= al; ay /= al;
      const sign = this.i === 0 ? 1 : -1, half = R.maxLen * 0.5;
      const saw = Math.sin(g.time * 3.2) * 150;
      return [b.x + ax * sign * half - ay * saw, b.y + ay * sign * half + ax * saw, 2.5];
    }
    if (g.gems.length && rng() < s.gem) {
      let best = null, bd = 260;
      for (const gm of g.gems) { const d = dist(gm.x, gm.y, me.x, me.y); if (d < bd) { bd = d; best = gm; } }
      if (best && dist(best.x, best.y, mate.x, mate.y) < R.maxLen * 0.95) return [best.x, best.y, 1.2];
    }
    if (rng() > s.hunt) return null;
    // hunt: put the target between us and run the rope through it
    let tgt = null, bs = 1e9;
    for (const e of g.enemies) {
      if (!this.noticed.get(e.id)) continue;
      const sc = dist(e.x, e.y, mx, my) / (PRIORITY[e.type] || 1);
      if (sc < bs) { bs = sc; tgt = e; }
    }
    if (!tgt) {
      const { w, h } = g.cfg.arena;
      return [w / 2 + this.side * R.rest * 0.7, h / 2, 0.5];
    }
    const Tx = tgt.x + tgt.vx * 0.3, Ty = tgt.y + tgt.vy * 0.3;
    let ux = Tx - mx, uy = Ty - my;
    const ud = len(ux, uy) || 1; ux /= ud; uy /= ud;
    const nx = -uy, ny = ux;
    let side = Math.sign((me.x - mx) * nx + (me.y - my) * ny) || this.side;
    const mateSide = Math.sign((mate.x - mx) * nx + (mate.y - my) * ny);
    if (mateSide === side) side = this.i ? 1 : -1;
    this.side = side;
    const half = R.maxLen * 0.42;
    return [Tx + nx * side * half + ux * 120, Ty + ny * side * half + uy * 120, 1];
  }

  tutorial(me, mate) {
    const g = this.g, tut = g.tut;
    if (!tut) return;
    let tx = me.x, ty = me.y;
    if (tut.rings.length) {
      const r = tut.rings.find((r) => r.who === this.i) || tut.rings.find((r) => r.who === 2) || tut.rings[0];
      tx = r.x; ty = r.y;
    } else if (tut.step === 'stretch') {
      tx = me.x + (me.x - mate.x); ty = me.y + (me.y - mate.y);
    } else if (tut.step === 'gem' && g.gems.length) {
      tx = g.gems[0].x; ty = g.gems[0].y;
    } else if (g.enemies.length) {
      const e = g.enemies[0];
      const mx = (me.x + mate.x) / 2, my = (me.y + mate.y) / 2;
      let ux = e.x - mx, uy = e.y - my; const ud = len(ux, uy) || 1; ux /= ud; uy /= ud;
      const side = this.i ? 1 : -1;
      tx = e.x - uy * side * 150 + ux * 100; ty = e.y + ux * side * 150 + uy * 100;
    }
    const dx = tx - me.x, dy = ty - me.y, d = len(dx, dy) || 1;
    const m = clamp(d / 50, 0, 1);
    this.want.x = (dx / d) * m; this.want.y = (dy / d) * m;
  }
}

export function pairBots(a, b) { a.partner = b; b.partner = a; return [a, b]; }

function segPointDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t - px, cy = ay + dy * t - py;
  return Math.sqrt(cx * cx + cy * cy);
}
