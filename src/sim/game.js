// Core simulation: players, rope, cutting, scoring, pickups, wave flow.
// Pure logic — no DOM — so it runs identically in the browser and in Node (bots).
import { makeRng, clamp, len, dist, dist2, segDist } from './math.js';
import { makeEnemy, updateEnemy, makeBoss, updateBoss, damageBoss, bossNodesAlive } from './enemies.js';
import { Spawner, genEndlessWave, survivalSteps, SURVIVAL_COUNT } from './waves.js';
import { SURVIVAL_WAVES } from '../config.js';
import { createTutorial, updateTutorial } from './tutorial.js';

export const POWER_KINDS = ['mega', 'freeze', 'shield', 'nova'];

export function createGame(cfg, opts = {}) {
  const mode = opts.mode || 'survival';
  const rng = makeRng(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
  const startLives = (opts.lives ?? cfg.lives[mode]) + (opts.assist ? cfg.lives.assistBonus : 0);
  const { w, h } = cfg.arena;
  const S = cfg.rope.samples;
  const g = {
    cfg, mode, rng, assist: !!opts.assist,
    tick: 0, time: 0, waveTime: 0, hitstop: 0,
    players: [0, 1].map((i) => ({
      i, x: w / 2 + (i ? 1 : -1) * cfg.rope.rest * 0.5, y: h / 2, vx: 0, vy: 0,
      inv: 0, hits: 0, cuts: 0, ix: 0, iy: 0,
    })),
    rope: {
      mx: w / 2, my: h / 2, mvx: 0, mvy: 0, len: cfg.rope.rest,
      pts: new Float64Array((S + 1) * 2), prev: new Float64Array((S + 1) * 2), spd: new Float64Array(S + 1),
      flash: 0, maxLen: cfg.rope.max, width: cfg.rope.halfWidth,
    },
    enemies: [], shots: [], gems: [], capsules: [], portals: [],
    boss: null, bossCount: 0,
    nextId: 1,
    lives: startLives, startLives, maxLives: startLives + cfg.lives.capBonus,
    score: 0, combo: 0, comboTimer: 0, bestCombo: 0, mult: 1,
    multi: { count: 0, timer: 0, x: 0, y: 0 },
    power: { mega: 0, freeze: 0, shield: 0, nova: 0 },
    wave: 0, phase: 'start', phaseTimer: 0, waveHit: false, wavesCleared: 0,
    capsuleTimer: 0, eventId: 0,
    over: false, won: false, stars: 0, checkpoint: !!opts.checkpoint,
    tut: null,
    events: [],
    speedMul: 1,
  };
  g.spawner = new Spawner(g);

  // --- API used by enemies / spawner / tutorial ---
  g.addEnemy = (type, x, y) => { const e = makeEnemy(g, type, x, y); g.enemies.push(e); g.events.push({ k: 'spawn', x, y, type }); return e; };
  g.spawnBoss = () => {
    g.bossCount++;
    const scale = mode === 'endless' ? 1 + cfg.boss.endlessHpGrowth * (g.bossCount - 1) : 1;
    makeBoss(g, scale);
  };
  g.spawnGem = (x, y, kind, vx = 0, vy = 0) => {
    g.gems.push({ id: g.nextId++, x: clamp(x, 30, w - 30), y: clamp(y, 30, h - 30), vx, vy, kind, t: cfg.gems.life, mag: false });
  };
  g.spawnCapsule = (kind) => {
    // pick a spot in the central region away from enemies
    let best = null, bestScore = -1;
    for (let i = 0; i < 12; i++) {
      const x = rng.range(w * 0.25, w * 0.75), y = rng.range(h * 0.28, h * 0.72);
      let dmin = 1e9;
      for (const e of g.enemies) dmin = Math.min(dmin, dist(x, y, e.x, e.y));
      const dp = Math.min(dist(x, y, g.players[0].x, g.players[0].y), dist(x, y, g.players[1].x, g.players[1].y));
      const score = Math.min(dmin, 400) + Math.min(dp, 300) * 0.3;
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
    g.capsules.push({ id: g.nextId++, x: best[0], y: best[1], kind, t: cfg.capsules.life, claim: 0, in0: 0, in1: 0 });
    g.events.push({ k: 'capsule', x: best[0], y: best[1], kind });
  };
  g.addScore = (pts, flat = false) => { g.score += Math.round(flat ? pts : pts * g.mult); };
  g.addHitstop = (s) => { if (!opts.noHitstop) g.hitstop = Math.max(g.hitstop, s); };
  g.hurtPlayer = (i, src) => hurtPlayer(g, i, src);
  g.emit = (ev) => g.events.push(ev);

  if (opts.tutorial) {
    g.tut = createTutorial(g);
    g.phase = 'tutorial';
  } else {
    startWave(g, opts.startWave || 1);
  }
  updateRopeSamples(g, true);
  return g;
}

// ---------------- Wave flow ----------------
export function startWave(g, n) {
  g.wave = n; g.phase = 'fight'; g.phaseTimer = 0; g.waveTime = 0; g.waveHit = false;
  let steps, name, intro = null;
  if (g.mode === 'survival') {
    const def = SURVIVAL_WAVES[n - 1];
    steps = survivalSteps(n); name = def.name; intro = def.intro || null;
  } else {
    steps = genEndlessWave(g.cfg, n, g.rng, overtimeMin(g));
    name = n % g.cfg.endless.bossEvery === 0 ? 'The Warden returns' : '';
    const unlock = g.cfg.endless.unlock;
    for (const t in unlock) if (unlock[t] === n) intro = t;
    if (n % g.cfg.endless.bossEvery === 0 && g.bossCount === 0) intro = 'boss';
  }
  g.spawner.load(steps);
  g.events.push({ k: 'wave', n, name, intro, total: g.mode === 'survival' ? SURVIVAL_COUNT : 0 });
}

export function skipTutorial(g) {
  if (!g.tut) return;
  g.tut = null;
  g.enemies.length = 0; g.gems.length = 0; g.portals.length = 0; g.shots.length = 0;
  g.events.push({ k: 'tutDone' });
  startWave(g, 1);
}

function overtimeMin(g) {
  if (g.mode !== 'endless') return 0;
  return Math.max(0, (g.time - g.cfg.endless.overtimeStart) / 60);
}

function computeSpeedMul(g) {
  let m = g.assist ? g.cfg.assist.enemySpeed : 1;
  if (g.mode === 'survival') {
    const S = g.cfg.survival;
    m *= S.speed * (1 + S.speedRamp * Math.max(0, g.wave - 1));
  } else {
    const E = g.cfg.endless;
    m *= E.speed * (1 + E.speedLog * Math.log(1 + g.wave)) * (1 + E.overtimeSpeed * overtimeMin(g));
  }
  return m;
}

// ---------------- Main step ----------------
// inputs: [{x,y},{x,y}] stick vectors in [-1,1]
export function stepGame(g, inputs, dt = g.cfg.dt) {
  if (g.over) return;
  if (g.hitstop > 0) { g.hitstop -= dt; return; }
  const cfg = g.cfg;
  g.tick++;
  if (g.phase !== 'tutorial') g.time += dt;
  g.waveTime += dt;
  g.speedMul = computeSpeedMul(g);
  const freeze = g.power.freeze > 0 ? cfg.power.freeze.factor : 1;
  const edt = dt * g.speedMul * freeze;

  movePlayers(g, inputs, dt);
  updateRope(g, dt);

  // spawner / boss
  if (g.phase === 'fight') {
    g.spawner.update(dt, edt);
    if (g.mode === 'endless') {
      g.capsuleTimer += dt;
      if (g.capsuleTimer >= cfg.endless.capsuleEvery && g.capsules.length === 0) {
        g.capsuleTimer = 0;
        g.spawnCapsule(g.rng.pick(['mega', 'freeze', 'shield', 'nova']));
      }
    }
  } else if (g.phase === 'tutorial') {
    updateTutorial(g, dt);
    g.spawner.update(dt, edt);
    if (g.tut.finished) {
      g.tut = null; g.gems.length = 0;
      g.events.push({ k: 'tutDone' });
      startWave(g, 1);
    }
  }
  if (g.boss) updateBoss(g, edt, dt);

  for (const e of g.enemies) updateEnemy(g, e, edt);
  separateEnemies(g);
  updateShots(g, edt, dt);

  ropeCuts(g, dt);
  if (g.boss) bossCore(g, dt);
  playerContacts(g);
  updateGems(g, dt);
  updateCapsules(g, dt);
  updatePowers(g, dt);
  updateCombo(g, dt);

  for (const p of g.players) if (p.inv > 0) p.inv -= dt;
  if (g.rope.flash > 0) g.rope.flash -= dt;

  // wave completion
  if (g.phase === 'fight' && g.spawner.finished && g.enemies.length === 0 && g.portals.length === 0 && !g.boss) {
    waveCleared(g);
  } else if (g.phase === 'clear') {
    g.phaseTimer += dt;
    if (g.phaseTimer >= cfg.waves.breather) {
      if (g.mode === 'survival' && g.wave >= SURVIVAL_COUNT) victory(g);
      else startWave(g, g.wave + 1);
    }
  }
}

function waveCleared(g) {
  const cfg = g.cfg;
  g.phase = 'clear'; g.phaseTimer = 0; g.wavesCleared = g.wave;
  const bonus = cfg.score.waveBonus * g.wave + (g.waveHit ? 0 : cfg.score.noHitBonus);
  g.score += bonus;
  for (const gem of g.gems) gem.mag = true;
  g.shots.length = 0;
  g.capsules.length = 0;
  const heartWave = g.mode === 'endless' ? g.wave % cfg.endless.heartEvery === 0 : cfg.survival.hearts.includes(g.wave);
  if (heartWave && g.lives < g.maxLives) {
    g.spawnGem(cfg.arena.w / 2, cfg.arena.h / 2, 'heart');
    g.gems[g.gems.length - 1].mag = true;
  }
  g.events.push({ k: 'waveClear', n: g.wave, bonus, noHit: !g.waveHit });
}

function victory(g) {
  const cfg = g.cfg;
  g.score += cfg.score.lifeBonus * g.lives;
  g.over = true; g.won = true; g.phase = 'won';
  const left = g.lives - (g.startLives - cfg.lives.survival); // assist bonus lives don't count toward stars
  let stars = 1;
  if (left >= cfg.stars.twoLives) stars = 2;
  if (left >= cfg.stars.threeLives && g.score >= cfg.stars.threeScore) stars = 3;
  if (g.checkpoint) stars = 1;
  g.stars = stars;
  g.events.push({ k: 'win', stars });
}

function gameOver(g) {
  g.over = true; g.won = false; g.phase = 'over';
  g.events.push({ k: 'over' });
}

// ---------------- Players & rope ----------------
function movePlayers(g, inputs, dt) {
  const cfg = g.cfg, P = cfg.player, R = g.rope;
  const k = 1 - Math.exp(-P.response * dt);
  for (let i = 0; i < 2; i++) {
    const p = g.players[i];
    let ix = inputs[i]?.x || 0, iy = inputs[i]?.y || 0;
    const m = len(ix, iy);
    if (m > 1) { ix /= m; iy /= m; }
    p.ix = ix; p.iy = iy;
    p.vx += (ix * P.maxSpeed - p.vx) * k;
    p.vy += (iy * P.maxSpeed - p.vy) * k;
  }
  const [a, b] = g.players;
  // elastic pull beyond rest length
  let dx = b.x - a.x, dy = b.y - a.y, d = len(dx, dy) || 0.0001;
  const maxLen = R.maxLen;
  if (d > cfg.rope.rest) {
    const f = cfg.rope.spring * (d - cfg.rope.rest) * dt;
    const ux = dx / d, uy = dy / d;
    a.vx += ux * f; a.vy += uy * f; b.vx -= ux * f; b.vy -= uy * f;
  }
  const vmax = P.maxSpeed * 1.35;
  for (const p of g.players) {
    const s = len(p.vx, p.vy);
    if (s > vmax) { p.vx *= vmax / s; p.vy *= vmax / s; }
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  // hard max-length constraint
  dx = b.x - a.x; dy = b.y - a.y; d = len(dx, dy) || 0.0001;
  if (d > maxLen) {
    const ux = dx / d, uy = dy / d, ex = (d - maxLen) / 2;
    a.x += ux * ex; a.y += uy * ex; b.x -= ux * ex; b.y -= uy * ex;
    const rel = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
    if (rel > 0) { a.vx += ux * rel / 2; a.vy += uy * rel / 2; b.vx -= ux * rel / 2; b.vy -= uy * rel / 2; }
  }
  const { w, h } = cfg.arena, r = P.radius;
  for (const p of g.players) {
    if (p.x < r) { p.x = r; p.vx = Math.max(0, p.vx); }
    if (p.x > w - r) { p.x = w - r; p.vx = Math.min(0, p.vx); }
    if (p.y < r) { p.y = r; p.vy = Math.max(0, p.vy); }
    if (p.y > h - r) { p.y = h - r; p.vy = Math.min(0, p.vy); }
  }
}

function updateRope(g, dt) {
  const cfg = g.cfg, R = g.rope, [a, b] = g.players;
  const mega = g.power.mega > 0;
  R.maxLen = cfg.rope.max * (mega ? cfg.power.mega.length : 1);
  R.width = cfg.rope.halfWidth * (mega ? cfg.power.mega.width : 1);
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  const ax = (cx - R.mx) * cfg.rope.midStiffness - R.mvx * cfg.rope.midDamping;
  const ay = (cy - R.my) * cfg.rope.midStiffness - R.mvy * cfg.rope.midDamping;
  R.mvx += ax * dt; R.mvy += ay * dt;
  R.mx += R.mvx * dt; R.my += R.mvy * dt;
  R.len = dist(a.x, a.y, b.x, b.y);
  // keep the bow within a sane fraction of the rope length (taut rope bows less)
  const slack = Math.max(0.12, 0.4 - 0.28 * (R.len / R.maxLen));
  const maxBow = Math.max(8, R.len * slack);
  const bx = R.mx - cx, by = R.my - cy, bl = len(bx, by);
  if (bl > maxBow) { R.mx = cx + bx / bl * maxBow; R.my = cy + by / bl * maxBow; }
  updateRopeSamples(g, false, dt);
}

function updateRopeSamples(g, init, dt = 1 / 60) {
  const R = g.rope, [a, b] = g.players, S = g.cfg.rope.samples;
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  const qx = 2 * R.mx - cx, qy = 2 * R.my - cy; // control point so the curve passes through m at t=.5
  R.prev.set(R.pts);
  for (let k = 0; k <= S; k++) {
    const t = k / S, u = 1 - t;
    R.pts[k * 2] = u * u * a.x + 2 * u * t * qx + t * t * b.x;
    R.pts[k * 2 + 1] = u * u * a.y + 2 * u * t * qy + t * t * b.y;
  }
  if (init) R.prev.set(R.pts);
  for (let k = 0; k <= S; k++) {
    R.spd[k] = len(R.pts[k * 2] - R.prev[k * 2], R.pts[k * 2 + 1] - R.prev[k * 2 + 1]) / dt;
  }
}

// distance from point to rope polyline -> [d, tGlobal, speed]
export function ropeQuery(g, x, y) {
  const R = g.rope, S = g.cfg.rope.samples, P = R.pts;
  let best = 1e9, bt = 0, bk = 0;
  for (let k = 0; k < S; k++) {
    const [d, t] = segDist(x, y, P[k * 2], P[k * 2 + 1], P[k * 2 + 2], P[k * 2 + 3]);
    if (d < best) { best = d; bt = t; bk = k; }
  }
  const speed = R.spd[bk] * (1 - bt) + R.spd[bk + 1] * bt;
  return [best, (bk + bt) / S, speed];
}

function ropeCuts(g, dt) {
  const cfg = g.cfg, R = g.rope, mega = g.power.mega > 0;
  for (let i = g.enemies.length - 1; i >= 0; i--) {
    const e = g.enemies[i];
    if (e.born < 0.12 && e.type !== 'node') continue; // brief spawn grace
    const [d, t, speed] = ropeQuery(g, e.x, e.y);
    if (d > e.r + R.width) continue;
    const c = cfg.enemies[e.type];
    if (c.cutSpeed && !mega && speed < c.cutSpeed && e.armor > 0) {
      // armour: a slow rope bounces off and knocks a plate loose; fast swings cut straight through
      const n = ropeNormal(g, e.x, e.y);
      e.kx = n[0] * c.bounce; e.ky = n[1] * c.bounce;
      e.x += n[0] * (e.r + R.width - d + 1); e.y += n[1] * (e.r + R.width - d + 1);
      if (e.clank <= 0) { e.clank = 0.35; e.flash = 0.12; e.armor--; g.events.push({ k: 'clank', x: e.x, y: e.y, armor: e.armor }); }
      continue;
    }
    killEnemy(g, i, creditFor(g, t), 'rope');
  }
}

function ropeNormal(g, x, y) {
  const R = g.rope, S = g.cfg.rope.samples, P = R.pts;
  let best = 1e9, nx = 0, ny = -1;
  for (let k = 0; k < S; k++) {
    const ax = P[k * 2], ay = P[k * 2 + 1], bx = P[k * 2 + 2], by = P[k * 2 + 3];
    const [d, t] = segDist(x, y, ax, ay, bx, by);
    if (d < best) {
      best = d;
      const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      let dx = x - px, dy = y - py, l = len(dx, dy);
      if (l < 0.001) { dx = -(by - ay); dy = bx - ax; l = len(dx, dy) || 1; }
      nx = dx / l; ny = dy / l;
    }
  }
  return [nx, ny];
}

function creditFor(g, t) {
  const [a, b] = g.players;
  const c1 = (1 - t) * len(a.vx, a.vy), c2 = t * len(b.vx, b.vy);
  if (Math.abs(c1 - c2) < 1) return t < 0.5 ? 0 : 1;
  return c1 > c2 ? 0 : 1;
}

export function killEnemy(g, idx, by, cause) {
  const cfg = g.cfg, e = g.enemies[idx], c = cfg.enemies[e.type];
  g.enemies.splice(idx, 1);
  if (by === 0 || by === 1) g.players[by].cuts++;
  // combo
  g.combo = g.comboTimer > 0 ? g.combo + 1 : 1;
  g.comboTimer = cfg.score.comboWindow;
  if (g.combo > g.bestCombo) g.bestCombo = g.combo;
  g.mult = Math.min(cfg.score.comboMulMax, 1 + Math.floor(g.combo / cfg.score.comboStep) * cfg.score.comboMulStep);
  if (!e.tut) g.addScore(c.points);
  if (cfg.score.milestones.includes(g.combo)) g.events.push({ k: 'milestone', combo: g.combo });
  // multi-cut
  g.multi.count = g.multi.timer > 0 ? g.multi.count + 1 : 1;
  g.multi.timer = cfg.score.multiWindow; g.multi.x = e.x; g.multi.y = e.y;
  if (g.multi.count === 3) g.addHitstop(cfg.fx.hitstop.multi3);
  g.rope.flash = 0.12;
  // drops
  if (e.type !== 'mini' || g.rng() < 0.5) g.spawnGem(e.x, e.y, 'shard', g.rng.range(-60, 60), g.rng.range(-60, 60));
  if (e.type === 'splitter' || e.type === 'spitter' || e.type === 'brute' || e.type === 'node') g.spawnGem(e.x + 8, e.y - 8, 'prism', g.rng.range(-80, 80), g.rng.range(-80, 80));
  if (e.type === 'splitter') {
    const sc = cfg.enemies.splitter;
    for (let k = 0; k < sc.children; k++) {
      const a = (k / sc.children) * Math.PI * 2 + g.rng() * 0.6;
      const m = makeEnemy(g, 'mini', e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14);
      m.kx = Math.cos(a) * sc.childSpeed; m.ky = Math.sin(a) * sc.childSpeed; m.a = a;
      g.enemies.push(m);
    }
  }
  g.events.push({ k: 'cut', x: e.x, y: e.y, type: e.type, combo: g.combo, by, cause });
  if (g.tut) g.tut.onKill?.(e);
}

function bossCore(g, dt) {
  const b = g.boss, cfg = g.cfg, R = g.rope;
  if (b.open <= 0) return;
  const taut = R.len >= R.maxLen * cfg.rope.tautRatio;
  const [d, , speed] = ropeQuery(g, b.x, b.y);
  if (!taut || d > b.r * 0.9 || speed < 20) return;
  const amt = cfg.boss.coreDps * dt;
  if (damageBoss(g, amt)) {
    // boss defeated: everything on screen pops
    g.addScore(cfg.boss.points.kill, true);
    g.events.push({ k: 'bossDie', x: b.x, y: b.y });
    g.addHitstop(cfg.fx.hitstop.bossDie);
    for (let i = g.enemies.length - 1; i >= 0; i--) killEnemy(g, i, null, 'boss');
    g.portals.length = 0; g.shots.length = 0;
    g.boss = null;
    g.spawner.groups.length = 0;
  }
}

// ---------------- Contacts ----------------
function hurtPlayer(g, i, src) {
  const p = g.players[i], cfg = g.cfg;
  if (p.inv > 0 || g.over) return false;
  if (g.tut) { p.inv = 0.8; g.events.push({ k: 'hurtTut', p: i, x: p.x, y: p.y }); return true; }
  if (g.power.shield > 0) {
    g.power.shield = 0; p.inv = 1.0;
    g.events.push({ k: 'shieldPop', p: i, x: p.x, y: p.y });
    knockback(g, p);
    return true;
  }
  g.lives--; p.hits++; p.inv = cfg.player.invuln;
  g.combo = 0; g.comboTimer = 0; g.mult = 1; g.waveHit = true;
  g.events.push({ k: 'hurt', p: i, x: p.x, y: p.y, src, lives: g.lives });
  g.addHitstop(cfg.fx.hitstop.hurt);
  knockback(g, p);
  if (g.lives <= 0) gameOver(g);
  return true;
}

function knockback(g, p) {
  const P = g.cfg.player;
  for (const e of g.enemies) {
    if (e.type === 'node') continue;
    const dx = e.x - p.x, dy = e.y - p.y, d = len(dx, dy) || 1;
    if (d < P.knockRadius) {
      e.kx = dx / d * P.knockSpeed; e.ky = dy / d * P.knockSpeed;
      if (e.type === 'dasher' && e.st === 2) { e.st = 3; e.tm = 0; }
    }
  }
  for (const s of g.shots) if (dist(s.x, s.y, p.x, p.y) < P.knockRadius) s.dead = true;
}

function playerContacts(g) {
  const hr = g.cfg.player.hitRadius;
  for (let i = 0; i < 2; i++) {
    const p = g.players[i];
    if (p.inv > 0) continue;
    for (let j = g.enemies.length - 1; j >= 0; j--) {
      const e = g.enemies[j];
      if (e.born < g.cfg.enemies.hurtGrace) continue; // just spawned / just split: harmless for a moment
      if (e.type === 'node') continue;                  // boss shield nodes are armour, not weapons
      if (dist2(p.x, p.y, e.x, e.y) < (hr + e.r * 0.85) ** 2) {
        if (hurtPlayer(g, i, e.type)) {
          if (e.type !== 'node') {
            const k = g.enemies.indexOf(e);
            if (k >= 0) { g.enemies.splice(k, 1); g.events.push({ k: 'pop', x: e.x, y: e.y, type: e.type }); }
          }
        }
        break;
      }
    }
    if (g.boss && p.inv <= 0 && dist(p.x, p.y, g.boss.x, g.boss.y) < hr + g.boss.r * 0.78) hurtPlayer(g, i, 'boss');
  }
}

function separateEnemies(g) {
  const E = g.enemies, s = g.cfg.enemies.separation;
  for (let i = 0; i < E.length; i++) {
    const a = E[i];
    if (a.type === 'node') continue;
    for (let j = i + 1; j < E.length; j++) {
      const b = E[j];
      if (b.type === 'node') continue;
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2), push = (rr - d) * 0.5 * s;
      const ux = dx / d, uy = dy / d;
      a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
    }
  }
}

function updateShots(g, edt, dt) {
  const { w, h } = g.cfg.arena, R = g.rope, hr = g.cfg.player.hitRadius;
  for (const s of g.shots) {
    if (s.dead) continue;
    s.x += s.vx * edt; s.y += s.vy * edt; s.t -= edt;
    if (s.t <= 0 || s.x < -20 || s.x > w + 20 || s.y < -20 || s.y > h + 20) { s.dead = true; continue; }
    const [d] = ropeQuery(g, s.x, s.y);
    if (d < s.r + R.width) { s.dead = true; g.score += 2; g.events.push({ k: 'block', x: s.x, y: s.y }); continue; }
    for (let p = 0; p < 2; p++) {
      const pl = g.players[p];
      if (pl.inv <= 0 && dist2(pl.x, pl.y, s.x, s.y) < (hr + s.r) ** 2) {
        if (hurtPlayer(g, p, s.boss ? 'bossShot' : 'shot')) { s.dead = true; break; }
      }
    }
  }
  // (shots can also be removed by knockback during hurtPlayer, so filter once at the end)
  if (g.shots.some((s) => s.dead)) g.shots = g.shots.filter((s) => !s.dead);
}

// ---------------- Gems, capsules, powers ----------------
function updateGems(g, dt) {
  const cfg = g.cfg.gems;
  for (let i = g.gems.length - 1; i >= 0; i--) {
    const gm = g.gems[i];
    if (!g.tut) gm.t -= dt;
    if (gm.t <= 0) { g.gems.splice(i, 1); continue; }
    const d0 = dist2(gm.x, gm.y, g.players[0].x, g.players[0].y), d1 = dist2(gm.x, gm.y, g.players[1].x, g.players[1].y);
    const pi = d0 <= d1 ? 0 : 1, p = g.players[pi];
    if (gm.mag) {
      const dx = p.x - gm.x, dy = p.y - gm.y, d = len(dx, dy) || 1;
      gm.vx = dx / d * cfg.magnetSpeed; gm.vy = dy / d * cfg.magnetSpeed;
    } else {
      const f = Math.exp(-4 * dt); gm.vx *= f; gm.vy *= f;
    }
    gm.x += gm.vx * dt; gm.y += gm.vy * dt;
    if (Math.min(d0, d1) < cfg.pickupR ** 2 + (gm.mag ? 400 : 0)) {
      g.gems.splice(i, 1);
      if (gm.kind === 'heart') {
        if (g.lives < g.maxLives) g.lives++;
        else g.score += 100;
      } else {
        g.addScore(gm.kind === 'prism' ? cfg.prism : cfg.shard);
      }
      g.events.push({ k: 'gem', x: gm.x, y: gm.y, kind: gm.kind, p: pi });
      if (g.tut) g.tut.onGem?.(gm);
    }
  }
}

function updateCapsules(g, dt) {
  const C = g.cfg.capsules;
  for (let i = g.capsules.length - 1; i >= 0; i--) {
    const c = g.capsules[i];
    c.t -= dt;
    if (c.t <= 0) { g.capsules.splice(i, 1); g.events.push({ k: 'capsuleGone', x: c.x, y: c.y }); continue; }
    c.in0 = dist(c.x, c.y, g.players[0].x, g.players[0].y) < C.r ? 1 : 0;
    c.in1 = dist(c.x, c.y, g.players[1].x, g.players[1].y) < C.r ? 1 : 0;
    if (c.in0 && c.in1) c.claim += dt; else c.claim = Math.max(0, c.claim - dt * 0.5);
    if (c.claim >= C.claim) {
      g.capsules.splice(i, 1);
      activatePower(g, c.kind, c.x, c.y);
    }
  }
}

function activatePower(g, kind, x, y) {
  const P = g.cfg.power;
  if (kind === 'mega') g.power.mega = P.mega.time;
  else if (kind === 'freeze') g.power.freeze = P.freeze.time;
  else if (kind === 'shield') g.power.shield = P.shield.time;
  else if (kind === 'nova') g.power.nova = P.nova.arm;
  g.events.push({ k: 'power', kind, x, y });
}

function updatePowers(g, dt) {
  const pw = g.power, P = g.cfg.power;
  for (const k of POWER_KINDS) if (pw[k] > 0) { pw[k] -= dt; if (pw[k] <= 0) { pw[k] = 0; if (k !== 'nova') g.events.push({ k: 'powerEnd', kind: k }); } }
  if (pw.nova > 0) {
    const [a, b] = g.players;
    if (dist(a.x, a.y, b.x, b.y) < g.cfg.player.radius * 2 + P.nova.touch) {
      pw.nova = 0;
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      g.events.push({ k: 'nova', x, y, r: P.nova.radius });
      for (let i = g.enemies.length - 1; i >= 0; i--) {
        const e = g.enemies[i];
        if (e.type === 'node') continue;
        if (dist(e.x, e.y, x, y) < P.nova.radius + e.r) killEnemy(g, i, null, 'nova');
      }
      for (let i = g.shots.length - 1; i >= 0; i--) if (dist(g.shots[i].x, g.shots[i].y, x, y) < P.nova.radius) g.shots.splice(i, 1);
    }
  }
}

function updateCombo(g, dt) {
  const S = g.cfg.score;
  if (g.comboTimer > 0) { g.comboTimer -= dt; if (g.comboTimer <= 0) { g.combo = 0; g.mult = 1; } }
  if (g.multi.timer > 0) {
    g.multi.timer -= dt;
    if (g.multi.timer <= 0) {
      if (g.multi.count >= 2) {
        const bonus = (g.multi.count - 1) * S.multiBonus;
        g.addScore(bonus);
        g.events.push({ k: 'multi', n: g.multi.count, x: g.multi.x, y: g.multi.y });
        if (g.multi.count >= 3) g.spawnGem(g.multi.x, g.multi.y, 'prism');
      }
      g.multi.count = 0;
    }
  }
}

// ---------------- Stats ----------------
export function gameStats(g) {
  return {
    mode: g.mode, won: g.won, stars: g.stars, score: g.score,
    wave: g.wave, wavesSurvived: g.won ? g.wave : g.wavesCleared,
    time: g.time, bestCombo: g.bestCombo, lives: g.lives,
    cuts: [g.players[0].cuts, g.players[1].cuts],
    hits: [g.players[0].hits, g.players[1].hits],
    assist: g.assist, checkpoint: g.checkpoint,
  };
}

export { SURVIVAL_COUNT, bossNodesAlive };
