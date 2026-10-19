import { cloneConfig } from '../src/config.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { Bot, pairBots } from '../src/sim/bots.js';
const cfg = cloneConfig();
const g = createGame(cfg, { mode: 'survival', seed: 3, noHitstop: true, tutorial: true });
const bots = pairBots(new Bot(g, 0, process.argv[2] || 'strong', 1), new Bot(g, 1, process.argv[2] || 'strong', 2));
let last = '', n = 0;
while (n < 60 * 120) {
  stepGame(g, [bots[0].update(cfg.dt), bots[1].update(cfg.dt)]); g.events.length = 0; n++;
  const s = g.tut ? g.tut.step : 'wave' + g.wave;
  if (s !== last) { console.log((n / 60).toFixed(1) + 's', s); last = s; if (!g.tut) break; }
  if (g.tut && g.tut.step === 'sweep' && n % 120 === 0) console.log('   players', g.players.map((p) => [p.x | 0, p.y | 0]), 'enemy', g.enemies.map((e) => [e.x | 0, e.y | 0, e.born.toFixed(1)]), 'rope', g.rope.len | 0, 'want', bots.map((b) => [b.want.x.toFixed(2), b.want.y.toFixed(2)]));
}
