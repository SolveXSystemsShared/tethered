// For each drifter hit: where did it come from relative to the rope, and what was the orb doing?
import { cloneConfig } from '../src/config.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { Bot, pairBots } from '../src/sim/bots.js';
const skill = process.argv[2] || 'strong';
const stats = { n: 0, angleBins: [0, 0, 0, 0, 0, 0], noticedLate: 0, mateHit: 0, orbSpeed: 0, nearWall: 0, crowd: 0, wantToward: 0 };
for (let seed = 1; seed <= 30; seed++) {
  const cfg = cloneConfig();
  const g = createGame(cfg, { mode: 'survival', seed, noHitstop: true });
  const bots = pairBots(new Bot(g, 0, skill, seed), new Bot(g, 1, skill, seed + 5));
  let prev = null, n = 0;
  while (!g.over && n < 60 * 600 && g.wave < 6) {
    prev = { p: g.players.map((p) => ({ ...p })), e: g.enemies.map((e) => ({ ...e })), want: bots.map((b) => ({ ...b.want })) };
    stepGame(g, [bots[0].update(cfg.dt), bots[1].update(cfg.dt)]);
    for (const ev of g.events) if (ev.k === 'hurt' && (ev.src === 'drifter')) {
      const me = prev.p[ev.p], mate = prev.p[1 - ev.p];
      // find the drifter closest to me in prev frame
      let best = null, bd = 1e9; for (const e of prev.e) { const d = Math.hypot(e.x - me.x, e.y - me.y); if (d < bd) { bd = d; best = e; } }
      const rx = mate.x - me.x, ry = mate.y - me.y, rl = Math.hypot(rx, ry) || 1;
      const ex = best.x - me.x, ey = best.y - me.y, el = Math.hypot(ex, ey) || 1;
      const ang = Math.acos(Math.max(-1, Math.min(1, (rx * ex + ry * ey) / (rl * el)))) * 180 / Math.PI;
      stats.n++; stats.angleBins[Math.min(5, Math.floor(ang / 30))]++;
      stats.orbSpeed += Math.hypot(me.vx, me.vy);
      if (me.x < 80 || me.x > 1420 || me.y < 80 || me.y > 670) stats.nearWall++;
      const crowd = prev.e.filter((e) => Math.hypot(e.x - me.x, e.y - me.y) < 200).length; if (crowd >= 3) stats.crowd++;
      const w = prev.want[ev.p]; if (w.x * ex + w.y * ey > 0) stats.wantToward++;
    }
    g.events.length = 0; n++;
  }
}
stats.orbSpeed = (stats.orbSpeed / stats.n) | 0;
console.log(skill, JSON.stringify(stats), '(angleBins: angle between rope dir and enemy dir, 0-30,30-60,...150-180 deg)');
