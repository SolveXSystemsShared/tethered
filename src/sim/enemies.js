// Enemy + boss behaviours. Pure logic: operates on the game state object.
import { clamp, len, dist, turnToward, segDist } from './math.js';

// Enemy states (e.st) per type:
//  dasher: 0 approach, 1 aim (telegraph), 2 dash, 3 rest
//  spitter: 0 roam, 1 charging (telegraph)
export function makeEnemy(game, type, x, y) {
  const c = game.cfg.enemies[type];
  const e = {
    id: game.nextId++, type, x, y, vx: 0, vy: 0, kx: 0, ky: 0,
    r: c.r, a: 0, st: 0, tm: 0, clank: 0, flash: 0, born: 0,
    dx: 0, dy: 0, // dash direction / aim
    side: game.rng() < 0.5 ? -1 : 1,
    tut: false,
  };
  const t = nearestPlayer(game, x, y);
  e.a = Math.atan2(t.y - y, t.x - x);
  if (type === 'spitter') e.tm = game.rng() * 1.0;
  if (c.armor) e.armor = c.armor;
  return e;
}

export function nearestPlayer(game, x, y) {
  const [a, b] = game.players;
  return (a.x - x) ** 2 + (a.y - y) ** 2 <= (b.x - x) ** 2 + (b.y - y) ** 2 ? a : b;
}

function home(game, e, c, edt, speedScale = 1) {
  const t = nearestPlayer(game, e.x, e.y);
  const want = Math.atan2(t.y - e.y, t.x - e.x);
  e.a = turnToward(e.a, want, c.turn * edt);
  e.vx = Math.cos(e.a) * c.speed * speedScale;
  e.vy = Math.sin(e.a) * c.speed * speedScale;
}

export function updateEnemy(game, e, edt) {
  const cfg = game.cfg, c = cfg.enemies[e.type];
  e.born += edt;
  if (e.clank > 0) e.clank -= edt;
  if (e.flash > 0) e.flash -= edt;
  switch (e.type) {
    case 'drifter': case 'mini': case 'splitter': case 'brute':
      if (e.tut && e.sleepy) { e.vx = 0; e.vy = 0; break; }
      home(game, e, c, edt, e.tut ? 0.55 : 1);
      break;
    case 'dasher': updateDasher(game, e, c, edt); break;
    case 'spitter': updateSpitter(game, e, c, edt); break;
    case 'node': return; // positioned by boss
  }
  // knockback impulse decays
  const kd = Math.exp(-5 * edt);
  e.kx *= kd; e.ky *= kd;
  e.x += (e.vx + e.kx) * edt;
  e.y += (e.vy + e.ky) * edt;
  const { w, h } = cfg.arena;
  if (e.type === 'dasher' && e.st === 2) {
    if (e.x < e.r || e.x > w - e.r || e.y < e.r || e.y > h - e.r) { e.st = 3; e.tm = 0; }
  }
  e.x = clamp(e.x, e.r, w - e.r);
  e.y = clamp(e.y, e.r, h - e.r);
}

function updateDasher(game, e, c, edt) {
  e.tm += edt;
  const t = nearestPlayer(game, e.x, e.y);
  if (e.st === 0) {
    home(game, e, { speed: c.speed, turn: 3 }, edt);
    if (dist(e.x, e.y, t.x, t.y) < c.approach || e.tm > 4.5) {
      e.st = 1; e.tm = 0; e.vx = e.vy = 0;
      game.events.push({ k: 'dashwarn', x: e.x, y: e.y, id: e.id });
    }
  } else if (e.st === 1) {
    e.vx = e.vy = 0;
    if (e.tm < c.aim - c.lock) {
      e.a = turnToward(e.a, Math.atan2(t.y - e.y, t.x - e.x), 6 * edt);
    }
    e.dx = Math.cos(e.a); e.dy = Math.sin(e.a);
    if (e.tm >= c.aim) { e.st = 2; e.tm = 0; game.events.push({ k: 'dash', x: e.x, y: e.y }); }
  } else if (e.st === 2) {
    e.vx = e.dx * c.dashSpeed; e.vy = e.dy * c.dashSpeed;
    if (e.tm >= c.dashTime) { e.st = 3; e.tm = 0; }
  } else {
    e.vx *= Math.exp(-6 * edt); e.vy *= Math.exp(-6 * edt);
    if (e.tm >= c.rest) { e.st = 0; e.tm = 0; }
  }
}

function updateSpitter(game, e, c, edt) {
  e.tm += edt;
  const t = nearestPlayer(game, e.x, e.y);
  const dx = t.x - e.x, dy = t.y - e.y, d = len(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  e.a = Math.atan2(dy, dx);
  let mvx = 0, mvy = 0, inBand = false;
  if (d > c.rangeMax) { mvx = ux; mvy = uy; }
  else if (d < c.rangeMin) { mvx = -ux; mvy = -uy; }
  else inBand = true;
  // slow strafe (a turret that settles at range, so it can be caught)
  mvx += -uy * e.side * 0.35; mvy += ux * e.side * 0.35;
  const { w, h } = game.cfg.arena;
  if (e.x < 120 || e.x > w - 120 || e.y < 100 || e.y > h - 100) { if (game.rng() < edt * 2) e.side *= -1; }
  const ml = len(mvx, mvy) || 1;
  // too close: spitters panic — they flee instead of shooting (rewards charging them together)
  const panic = d < c.panic;
  if (panic && e.st === 1) { e.st = 0; e.tm = Math.min(e.tm, c.period - c.charge - 0.3); }
  const sp = e.st === 1 ? c.speed * 0.2 : inBand ? c.speed * 0.45 : d < c.rangeMin ? c.speed * c.retreat : c.speed;
  e.vx = (mvx / ml) * sp; e.vy = (mvy / ml) * sp;
  if (panic && e.tm >= c.period - c.charge - 0.3) e.tm = c.period - c.charge - 0.3;
  if (e.st === 0 && !panic && e.tm >= c.period - c.charge) { e.st = 1; game.events.push({ k: 'charge', x: e.x, y: e.y }); }
  if (e.st === 1) { e.dx = ux; e.dy = uy; }
  if (e.tm >= c.period) {
    e.st = 0; e.tm = 0;
    game.shots.push({ id: game.nextId++, x: e.x + ux * (e.r + 6), y: e.y + uy * (e.r + 6), vx: ux * c.shotSpeed, vy: uy * c.shotSpeed, r: c.shotR, t: 7 });
    game.events.push({ k: 'shoot', x: e.x, y: e.y });
  }
}

// ---------------- Boss: The Warden ----------------
export function makeBoss(game, hpScale = 1) {
  const bc = game.cfg.boss;
  const boss = {
    id: game.nextId++, x: game.cfg.arena.w / 2, y: 150, vx: 0, vy: 0, r: bc.r,
    hp: bc.hp * hpScale, maxHp: bc.hp * hpScale, phase: 0, open: 0, spin: 0,
    burstT: 0, tele: 0, spawnT: 0, hitT: 0, intro: 1.5,
    beam: { st: 0, t: 0, ang: 0, dir: 1, cd: 4 },
    charge: { st: 0, t: 0, dx: 0, dy: 0, cd: 3 },
    stun: 0, burstSkip: 0,
  };
  game.boss = boss;
  spawnNodes(game);
  game.events.push({ k: 'bossIn' });
  return boss;
}

function spawnNodes(game) {
  const b = game.boss, bc = game.cfg.boss;
  for (let i = 0; i < bc.nodes; i++) {
    const e = makeEnemy(game, 'node', b.x, b.y);
    e.slot = i;
    placeNode(game, e);
    game.enemies.push(e);
  }
}

function placeNode(game, e) {
  const b = game.boss, bc = game.cfg.boss;
  const a = b.spin + (e.slot * Math.PI * 2) / bc.nodes;
  e.x = b.x + Math.cos(a) * bc.nodeOrbit;
  e.y = b.y + Math.sin(a) * bc.nodeOrbit;
  e.a = a;
}

export function bossNodesAlive(game) {
  let n = 0;
  for (const e of game.enemies) if (e.type === 'node') n++;
  return n;
}

export function updateBoss(game, edt, dt) {
  const b = game.boss, bc = game.cfg.boss, { w, h } = game.cfg.arena;
  const [p1, p2] = game.players;
  const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
  if (b.hitT > 0) b.hitT -= dt;
  b.spin += bc.nodeSpin * edt * (b.phase === 1 ? -1 : 1);
  for (const e of game.enemies) if (e.type === 'node') placeNode(game, e);

  if (b.intro > 0) { b.intro -= dt; b.y += (h * 0.33 - b.y) * Math.min(1, dt * 2); return; }

  // movement
  if (b.charge.st === 2) {
    b.x += b.charge.dx * bc.chargeSpeed * edt; b.y += b.charge.dy * bc.chargeSpeed * edt;
    if (b.x < b.r + 10 || b.x > w - b.r - 10 || b.y < b.r + 10 || b.y > h - b.r - 10) {
      b.charge.st = 0; b.charge.cd = bc.chargeEvery; b.stun = bc.stun; b.open = Math.max(b.open, bc.stun);
      game.events.push({ k: 'bossStun', x: b.x, y: b.y });
    }
  } else if (b.stun > 0) {
    b.stun -= edt;
  } else if (b.charge.st !== 1) {
    const dx = mx - b.x, dy = my - b.y, d = len(dx, dy) || 1;
    const sp = d > 200 ? bc.drift : -bc.drift * 0.5;
    b.x += (dx / d) * sp * edt; b.y += (dy / d) * sp * edt;
  }
  b.x = clamp(b.x, b.r + 10, w - b.r - 10);
  b.y = clamp(b.y, b.r + 10, h - b.r - 10);

  // shield / core window
  const nodes = bossNodesAlive(game);
  if (b.open > 0) {
    b.open -= edt;
    if (b.open <= 0) {
      b.open = 0;
      if (nodes === 0) { spawnNodes(game); game.events.push({ k: 'shieldUp', x: b.x, y: b.y }); }
    }
  } else if (nodes === 0) {
    b.open = bc.openTime[b.phase];
    game.events.push({ k: 'coreOpen', x: b.x, y: b.y });
  }

  // While the core is open the Warden is stunned-open: no new attacks (the vulnerability window
  // is a recovery window, so sawing the core is never punished at the same moment).
  const calm = b.open > 0;
  // radial burst
  if (!calm) b.burstT += edt;
  const every = bc.burstEvery[b.phase], tele = bc.burstTele[b.phase];
  b.tele = b.burstT >= every - tele ? every - b.burstT : 0;
  if (b.burstT >= every - tele && b.burstT - edt < every - tele) game.events.push({ k: 'bossTele', x: b.x, y: b.y });
  if (b.burstT >= every) {
    b.burstT = 0; b.tele = 0;
    const n = bc.burstCount[b.phase];
    const off = game.rng() * Math.PI * 2;
    const gap = Math.floor(game.rng() * n);
    for (let i = 0; i < n; i++) {
      if (i === gap || i === (gap + 1) % n) continue; // guaranteed gap
      const a = off + (i * Math.PI * 2) / n;
      game.shots.push({ id: game.nextId++, x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r, vx: Math.cos(a) * bc.shotSpeed, vy: Math.sin(a) * bc.shotSpeed, r: 10, t: 8, boss: 1 });
    }
    game.events.push({ k: 'burst', x: b.x, y: b.y });
  }

  // sweeping beam (phase 2+)
  const bm = b.beam;
  if (b.phase >= 1) {
    if (bm.st === 0) {
      if (!calm) bm.cd -= edt;
      if (bm.cd <= 0 && b.charge.st === 0) {
        bm.st = 1; bm.t = bc.beamTele; bm.dir = game.rng() < 0.5 ? -1 : 1;
        bm.ang = Math.atan2(my - b.y, mx - b.x) - bm.dir * 0.9;
        game.events.push({ k: 'beamTele', x: b.x, y: b.y });
      }
    } else if (bm.st === 1) {
      bm.t -= edt;
      if (bm.t <= 0) { bm.st = 2; bm.t = bc.beamTime; game.events.push({ k: 'beam', x: b.x, y: b.y }); }
    } else {
      bm.t -= edt; bm.ang += bm.dir * bc.beamSpin * edt;
      const ex = b.x + Math.cos(bm.ang) * 2000, ey = b.y + Math.sin(bm.ang) * 2000;
      for (let i = 0; i < 2; i++) {
        const p = game.players[i];
        const [d] = segDist(p.x, p.y, b.x, b.y, ex, ey);
        if (d < bc.beamWidth + game.cfg.player.hitRadius) game.hurtPlayer(i, 'beam');
      }
      if (bm.t <= 0) { bm.st = 0; bm.cd = bc.beamEvery; }
    }
  }

  // charge (phase 3)
  const ch = b.charge;
  if (b.phase >= 2 && bm.st === 0 && b.stun <= 0) {
    if (ch.st === 0) {
      if (!calm) ch.cd -= edt;
      if (ch.cd <= 0) {
        ch.st = 1; ch.t = bc.chargeTele;
        const dx = mx - b.x, dy = my - b.y, d = len(dx, dy) || 1;
        ch.dx = dx / d; ch.dy = dy / d;
        game.events.push({ k: 'chargeTele', x: b.x, y: b.y });
      }
    } else if (ch.st === 1) {
      ch.t -= edt;
      if (ch.t <= 0) { ch.st = 2; game.events.push({ k: 'dash', x: b.x, y: b.y }); }
    }
  }

  // fodder
  b.spawnT += edt;
  if (b.spawnT >= bc.spawnEvery[b.phase]) {
    b.spawnT = 0;
    const types = b.phase === 0 ? ['drifter', 'drifter'] : b.phase === 1 ? ['dasher', 'drifter'] : ['dasher', 'drifter', 'drifter'];
    for (const t of types) game.spawner.portal(t, 'any');
  }
}

// Called when the boss loses hp; handles phase transitions + death.
export function damageBoss(game, amount) {
  const b = game.boss, bc = game.cfg.boss;
  b.hp -= amount;
  if (b.hitT <= 0) { b.hitT = 0.14; game.events.push({ k: 'bossHit', x: b.x, y: b.y }); }
  const frac = b.hp / b.maxHp;
  const phase = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
  if (b.hp <= 0) return true;
  if (phase !== b.phase) {
    b.phase = phase;
    b.open = 0; b.burstT = 0; b.tele = 0;
    b.beam.st = 0; b.beam.cd = 3; b.charge.st = 0; b.charge.cd = 2.5;
    game.shots.length = 0;
    game.addScore(bc.points.phase, true);
    game.spawnGem(b.x, b.y + b.r + 30, 'heart');
    if (bossNodesAlive(game) === 0) spawnNodes(game);
    game.events.push({ k: 'bossPhase', phase, x: b.x, y: b.y });
    game.addHitstop(game.cfg.fx.hitstop.phase);
  }
  return false;
}
