import { cloneConfig, applyOverrides } from '../src/config.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { Bot, pairBots } from '../src/sim/bots.js';
const skill = process.argv[2] || 'strong';
const life = { spitter: [], brute: [], dasher: [], drifter: [], splitter: [] };
for (let seed = 1; seed <= 20; seed++) {
  const cfg = cloneConfig();
  const g = createGame(cfg, { mode: 'survival', seed, noHitstop: true, startWave: 6, lives: 99 });
  const bots = pairBots(new Bot(g, 0, skill, seed), new Bot(g, 1, skill, seed + 5));
  const born = new Map(); let n = 0;
  while (n < 60 * 200 && g.wave <= 9) {
    stepGame(g, [bots[0].update(cfg.dt), bots[1].update(cfg.dt)]);
    for (const e of g.enemies) if (!born.has(e.id)) born.set(e.id, g.time);
    for (const ev of g.events) if (ev.k === 'cut' && life[ev.type]) {
      // find which id vanished: approximate via type lifetime list
    }
    const alive = new Set(g.enemies.map((e) => e.id));
    for (const [id, t] of born) if (!alive.has(id)) { const type = born.get('t' + id); if (type && life[type]) life[type].push(g.time - t); born.delete(id); born.delete('t' + id); }
    for (const e of g.enemies) if (!born.has('t' + e.id)) born.set('t' + e.id, e.type);
    g.events.length = 0; n++;
  }
}
const q = (a, p) => a.length ? [...a].sort((x, y) => x - y)[Math.floor(p * a.length)].toFixed(1) : '-';
for (const [k, a] of Object.entries(life)) console.log(skill, k.padEnd(9), 'n', a.length, 'lifetime p50', q(a, .5), 'p90', q(a, .9));
