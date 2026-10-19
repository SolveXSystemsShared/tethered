// Wave 0: interactive tutorial. Each step completes only when players *do* the thing.
// Nothing can fail and no lives are lost (hurtPlayer checks g.tut).
import { dist } from './math.js';

// text keys are rendered by the UI (<= 8 words each)
export const TUT_TEXT = {
  move: 'Drag to move — each to your ring',
  together: 'Move together into the big ring',
  stretch: 'Now stretch the rope apart',
  sweep: 'Hit it with the rope!',
  gem: 'Grab the gem',
  capsule: 'Power-up! Both stand in the ring together',
  danger: "Don't let them touch you!",
  wave: 'Sweep them all!',
  done: 'Ready!',
};

export function createTutorial(g) {
  const tut = { step: 'move', t: 0, hold: 0, rings: [], finished: false, flags: {}, enemyId: 0 };
  const { w, h } = g.cfg.arena;
  tut.rings = [
    { x: w / 2 - g.cfg.rope.rest * 0.95, y: h * 0.3, r: 62, who: 0, done: false },
    { x: w / 2 + g.cfg.rope.rest * 0.95, y: h * 0.3, r: 62, who: 1, done: false },
  ];
  tut.onKill = (e) => { tut.flags.kills = (tut.flags.kills || 0) + 1; };
  tut.onGem = () => { tut.flags.gem = true; };
  g.events.push({ k: 'tutStep', step: 'move' });
  return tut;
}

function inRing(p, r) { return dist(p.x, p.y, r.x, r.y) < r.r; }

function go(g, step) {
  const tut = g.tut;
  tut.step = step; tut.t = 0; tut.hold = 0; tut.rings = [];
  g.events.push({ k: 'tutStep', step });
}

export function updateTutorial(g, dt) {
  const tut = g.tut, [a, b] = g.players, { w, h } = g.cfg.arena;
  tut.t += dt;
  switch (tut.step) {
    case 'move': {
      for (const r of tut.rings) if (!r.done && inRing(g.players[r.who], r)) { r.done = true; g.events.push({ k: 'ring', x: r.x, y: r.y }); }
      if (tut.rings.every((r) => r.done)) {
        tut.hold += dt;
        if (tut.hold > 0.5) {
          go(g, 'together');
          tut.rings = [{ x: w / 2, y: h * 0.7, r: 90, who: 2, done: false }];
        }
      }
      break;
    }
    case 'together': {
      const r = tut.rings[0];
      if (inRing(a, r) && inRing(b, r)) tut.hold += dt; else tut.hold = Math.max(0, tut.hold - dt);
      if (tut.hold > 0.5) {
        g.events.push({ k: 'ring', x: r.x, y: r.y });
        go(g, 'stretch');
      }
      break;
    }
    case 'stretch': {
      if (g.rope.len > g.rope.maxLen * 0.9) tut.hold += dt; else tut.hold = Math.max(0, tut.hold - dt * 0.5);
      if (tut.hold > 0.6) {
        go(g, 'sweep');
        // a sleepy drifter, placed away from the rope
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        const y = cy < h / 2 ? cy + h * 0.28 : cy - h * 0.28;
        const e = g.addEnemy('drifter', w / 2, y);
        e.tut = true; e.sleepy = true; tut.enemyId = e.id;
        tut.flags.kills = 0;
      }
      break;
    }
    case 'sweep':
      if (tut.flags.kills > 0) {
        tut.flags.gem = false; go(g, 'gem');
        // place the gem a short trip away from both orbs so grabbing it is a deliberate move
        g.gems.length = 0;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        g.spawnGem(mx < w / 2 ? mx + 300 : mx - 300, my < h / 2 ? my + 140 : my - 140, 'prism');
      }
      else if (!g.enemies.some((e) => e.id === tut.enemyId)) {
        // safety net: the target vanished without a rope cut -> bring a new one
        const e = g.addEnemy('drifter', w / 2, h / 2);
        e.tut = true; e.sleepy = true; tut.enemyId = e.id;
      }
      break;
    case 'gem':
      if (tut.flags.gem) {
        go(g, 'capsule');
        g.spawnCapsule('shield');
        g.capsules[g.capsules.length - 1].t = 9999;
      }
      break;
    case 'capsule':
      if (g.capsules.length === 0) {
        go(g, 'danger');
        const e = g.addEnemy('drifter', a.x < w / 2 ? w - 60 : 60, h / 2);
        e.tut = true; tut.enemyId = e.id;
      }
      break;
    case 'danger':
      if (!g.enemies.some((e) => e.id === tut.enemyId) && tut.t > 0.5) {
        go(g, 'wave');
        tut.flags.kills = 0;
        g.spawner.load([{ t: 0.8, n: 5, type: 'drifter', side: 'ring', gap: 0.35 }]);
      }
      break;
    case 'wave':
      for (const e of g.enemies) e.tut = true;
      if (g.spawner.finished && g.enemies.length === 0 && g.portals.length === 0 && tut.t > 2) go(g, 'done');
      break;
    case 'done':
      if (tut.t > 1.6) tut.finished = true;
      break;
  }
}
