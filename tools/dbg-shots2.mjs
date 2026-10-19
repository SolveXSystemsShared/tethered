import { cloneConfig } from '../src/config.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { Bot, pairBots } from '../src/sim/bots.js';
const skill = process.argv[2] || 'strong';
const ages = [], fired = [], perShot = { fired: 0, hit: 0, blocked: 0 };
for (let seed = 1; seed <= 25; seed++) {
  const cfg = cloneConfig();
  const g = createGame(cfg, { mode: 'survival', seed, noHitstop: true, startWave: 6, lives: 99 });
  const bots = pairBots(new Bot(g, 0, skill, seed), new Bot(g, 1, skill, seed + 5));
  let n = 0; const known = new Map();
  while (!g.over && n < 60 * 100) {
    const before = new Map(g.shots.map((s) => [s.id, { ...s }]));
    stepGame(g, [bots[0].update(cfg.dt), bots[1].update(cfg.dt)]);
    for (const s of g.shots) if (!known.has(s.id) && !s.boss) {
      const d = Math.min(...g.players.map((p) => Math.hypot(p.x - s.x, p.y - s.y)));
      known.set(s.id, { born: g.time }); fired.push(d | 0); perShot.fired++;
    }
    for (const ev of g.events) {
      if (ev.k === 'block') perShot.blocked++;
      if (ev.k === 'hurt' && ev.src === 'shot') {
        perShot.hit++;
        // which shot vanished?
        for (const [id, s] of before) if (!g.shots.find((x) => x.id === id) && known.has(id)) { ages.push(+(g.time - known.get(id).born).toFixed(2)); break; }
      }
    }
    g.events.length = 0; n++;
  }
}
const q = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(p * a.length)];
console.log(skill, perShot, 'hit age p10/50/90', q(ages, .1), q(ages, .5), q(ages, .9), '| fire distance p10/50/90', q(fired, .1), q(fired, .5), q(fired, .9));
