// Wave spawning: runs a list of steps (hand-designed Survival waves or
// generated Endless waves), with portal telegraphs before each enemy appears.
import { SURVIVAL_WAVES } from '../config.js';
import { dist } from './math.js';

export const SURVIVAL_COUNT = SURVIVAL_WAVES.length;

export class Spawner {
  constructor(game) {
    this.game = game;
    this.steps = [];
    this.idx = 0;
    this.timer = 0;
    this.groups = [];
    this.alt = 0;
  }

  load(steps) {
    this.steps = steps; this.idx = 0; this.timer = 0; this.groups = [];
  }

  get finished() {
    return this.idx >= this.steps.length && this.groups.length === 0;
  }

  // Portals use real game time but enemy-time for the telegraph (so Freeze slows spawns too).
  update(dt, edt) {
    const g = this.game;
    while (this.idx < this.steps.length) {
      const s = this.steps[this.idx];
      const alive = g.enemies.length + g.portals.length;
      if (this.timer < s.t || (s.wait != null && alive > s.wait)) break;
      this.idx++; this.timer = 0;
      if (s.capsule) g.spawnCapsule(s.capsule);
      else if (s.boss) g.spawnBoss();
      else this.groups.push({ type: s.type, side: s.side, left: s.n, gap: s.gap || 0, t: 0 });
    }
    this.timer += edt;
    for (let i = this.groups.length - 1; i >= 0; i--) {
      const gr = this.groups[i];
      gr.t -= edt;
      while (gr.left > 0 && gr.t <= 0) {
        this.portal(gr.type, gr.side, gr.ringIndex = (gr.ringIndex ?? -1) + 1, gr);
        gr.left--; gr.t += gr.gap;
      }
      if (gr.left <= 0) this.groups.splice(i, 1);
    }
    // portals
    for (let i = g.portals.length - 1; i >= 0; i--) {
      const p = g.portals[i];
      p.t -= edt;
      if (p.t <= 0) {
        g.portals.splice(i, 1);
        g.addEnemy(p.type, p.x, p.y);
      }
    }
  }

  portal(type, side, ringIndex = 0, group = null) {
    const g = this.game;
    const pos = this.pickPos(side, ringIndex, group);
    g.portals.push({ id: g.nextId++, type, x: pos[0], y: pos[1], t: g.cfg.enemies.spawnTime, max: g.cfg.enemies.spawnTime });
  }

  pickPos(side, ringIndex, group) {
    const g = this.game, rng = g.rng, { w, h, spawnMargin: m, safeSpawnDist } = g.cfg.arena;
    let s = side;
    if (s === 'LR') s = (this.alt++ % 2) ? 'R' : 'L';
    else if (s === 'TB') s = (this.alt++ % 2) ? 'B' : 'T';
    else if (s === 'any') s = rng.pick(['L', 'R', 'T', 'B']);
    let best = null, bestD = -1;
    for (let tries = 0; tries < 10; tries++) {
      let x, y;
      if (s === 'ring') {
        if (group && group.ringOff == null) group.ringOff = rng() * Math.PI * 2;
        const a = (group ? group.ringOff : 0) + ringIndex * 2.39996 + tries * 0.7; // golden angle spread
        x = w / 2 + Math.cos(a) * (w / 2 - m);
        y = h / 2 + Math.sin(a) * (h / 2 - m);
      } else if (s === 'L') { x = m; y = rng.range(110, h - 110); }
      else if (s === 'R') { x = w - m; y = rng.range(110, h - 110); }
      else if (s === 'T') { x = rng.range(160, w - 160); y = m; }
      else { x = rng.range(160, w - 160); y = h - m; }
      const d = Math.min(dist(x, y, g.players[0].x, g.players[0].y), dist(x, y, g.players[1].x, g.players[1].y));
      if (d >= safeSpawnDist) return [x, y];
      if (d > bestD) { bestD = d; best = [x, y]; }
      if (s !== 'ring' && tries === 4) s = rng.pick(['L', 'R', 'T', 'B']);
    }
    return best;
  }
}

// ---------- Endless wave generator ----------
export function endlessBudget(cfg, n, overtimeMin) {
  const [b0, b1, b2] = cfg.endless.budget;
  return (b0 + b1 * n + b2 * n * n) * (1 + cfg.endless.overtimeBudget * overtimeMin);
}

export function endlessCap(cfg, n, overtimeMin) {
  const [c0, c1, cmax] = cfg.endless.cap;
  return Math.min(c0 + c1 * n, cmax) + cfg.endless.overtimeCap * overtimeMin;
}

export function genEndlessWave(cfg, n, rng, overtimeMin = 0) {
  const E = cfg.endless, costs = cfg.enemies;
  const steps = [];
  const bossWave = n % E.bossEvery === 0;
  let budget = endlessBudget(cfg, n, overtimeMin) * (bossWave ? 0.3 : 1);
  const cap = Math.round(endlessCap(cfg, n, overtimeMin));
  const [pa, pb, pmin] = E.pulse;
  const interval = Math.max(pmin, pa + pb * n);
  const types = Object.keys(E.weights).filter((t) => t === 'drifter' || n >= E.unlock[t]);
  if (bossWave) steps.push({ t: 1, boss: true });
  const sides = n % 5 === 0 ? ['LR', 'TB', 'ring'] : ['L', 'R', 'T', 'B', 'LR', 'TB', 'ring', 'any'];
  let first = true;
  const minCost = Math.min(...types.map((t) => costs[t].cost));
  while (budget >= minCost) {
    const size = rng.int(E.pulseSize[0], E.pulseSize[1]);
    const side = rng.pick(sides);
    let left = size, firstInPulse = true;
    while (left > 0 && budget >= minCost) {
      // weighted pick among affordable types
      let tot = 0;
      for (const t of types) if (costs[t].cost <= budget) tot += E.weights[t];
      if (tot <= 0) break;
      let r = rng() * tot, type = 'drifter';
      for (const t of types) { if (costs[t].cost > budget) continue; r -= E.weights[t]; if (r <= 0) { type = t; break; } }
      const cost = costs[type].cost;
      const k = Math.max(1, Math.min(left, type === 'drifter' ? left : rng.int(1, 2)));
      const cnt = Math.min(k, Math.max(1, Math.floor(budget / cost)));
      steps.push({
        t: firstInPulse ? (first ? 0.6 : interval) : 0.2,
        n: cnt, type, side, gap: type === 'drifter' ? 0.18 : 0.45,
        wait: firstInPulse ? Math.max(0, cap - size) : undefined,
      });
      budget -= cnt * cost; left -= cnt; firstInPulse = false; first = false;
    }
  }
  return steps;
}

export function survivalSteps(n) {
  return SURVIVAL_WAVES[n - 1].steps;
}
