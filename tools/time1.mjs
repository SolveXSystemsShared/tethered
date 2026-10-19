import { cloneConfig } from '../src/config.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { Bot, pairBots } from '../src/sim/bots.js';
const [mode='survival', skill='strong', seed='5'] = process.argv.slice(2);
const cfg = cloneConfig();
const g = createGame(cfg, { mode, seed: +seed, noHitstop: true });
const bots = pairBots(new Bot(g, 0, skill, +seed), new Bot(g, 1, skill, +seed+1));
const t0 = performance.now(); let n = 0;
while (!g.over && n < 60*60*20) { stepGame(g, [bots[0].update(cfg.dt), bots[1].update(cfg.dt)]); g.events.length = 0; n++; }
console.log(mode, skill, 'game time', g.time.toFixed(0), 's wave', g.wave, 'wall', ((performance.now()-t0)/1000).toFixed(2), 's', 'speedup x' + (g.time/((performance.now()-t0)/1000)).toFixed(0));
