import { CONFIG, cloneConfig } from '../src/config.js';
import { createGame, stepGame, gameStats } from '../src/sim/game.js';
import { Bot } from '../src/sim/bots.js';
const [mode='survival', skill='average', seed='1', tut] = process.argv.slice(2);
const cfg = cloneConfig();
const g = createGame(cfg, { mode, seed: +seed, noHitstop: true, tutorial: tut==='tut' });
const bots = [new Bot(g, 0, skill, +seed), new Bot(g, 1, skill, +seed)];
let steps = 0, lastWave = 0; const t0 = performance.now();
const evCount = {};
while (!g.over && steps < 60*60*30) {
  stepGame(g, [bots[0].update(cfg.dt), bots[1].update(cfg.dt)]);
  for (const e of g.events) evCount[e.k] = (evCount[e.k]||0)+1;
  if (g.wave !== lastWave) { console.log(`t=${g.time.toFixed(1)} wave ${g.wave} lives ${g.lives} score ${g.score}`); lastWave = g.wave; }
  g.events.length = 0; steps++;
}
console.log(gameStats(g), ((performance.now()-t0)/1000).toFixed(2)+'s', evCount);
