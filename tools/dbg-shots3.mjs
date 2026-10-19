import { cloneConfig } from '../src/config.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { Bot, pairBots } from '../src/sim/bots.js';
const byWave = {}; let runs = 0;
for (let seed = 1000; seed < 1000 + 7 * 40; seed += 7) {
  const cfg = cloneConfig();
  const g = createGame(cfg, { mode: 'survival', seed, noHitstop: true });
  const bots = pairBots(new Bot(g, 0, 'strong', seed), new Bot(g, 1, 'strong', seed + 99991));
  let n = 0; runs++;
  while (!g.over && n < 60 * 1200) {
    stepGame(g, [bots[0].update(cfg.dt), bots[1].update(cfg.dt)]);
    for (const ev of g.events) if (ev.k === 'hurt') { const k = ev.src + '@' + g.wave; byWave[k] = (byWave[k] || 0) + 1; }
    g.events.length = 0; n++;
  }
}
console.log(runs, Object.entries(byWave).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k}:${v}`).join('  '));
