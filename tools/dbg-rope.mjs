// Debug: how do bots use the rope? (average length, length histogram, cause of hits)
import { cloneConfig } from '../src/config.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { Bot, pairBots } from '../src/sim/bots.js';
const mode = process.argv[2] || 'survival';
const SEED = +(process.argv[3] || 3);
for (const skill of ['weak', 'average', 'strong']) {
  const cfg = cloneConfig();
  const g = createGame(cfg, { mode, seed: SEED, noHitstop: true });
  const bots = pairBots(new Bot(g, 0, skill, SEED), new Bot(g, 1, skill, SEED));
  let n = 0, sum = 0;
  const hist = [0, 0, 0, 0, 0], src = {};
  while (!g.over && n < 60 * 600) {
    stepGame(g, [bots[0].update(cfg.dt), bots[1].update(cfg.dt)]);
    for (const e of g.events) if (e.k === 'hurt') src[e.src] = (src[e.src] || 0) + 1;
    g.events.length = 0; n++;
    sum += g.rope.len; hist[Math.min(4, Math.floor(g.rope.len / (cfg.rope.max / 4)))]++;
  }
  console.log(skill, 'avg rope', (sum / n).toFixed(0), 'of', cfg.rope.max, '| hist', hist.map((h) => (h / n * 100).toFixed(0) + '%').join(' '), '| wave', g.wave, 'time', g.time.toFixed(0), '| hits by', JSON.stringify(src));
}
