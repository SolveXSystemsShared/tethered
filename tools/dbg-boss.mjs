// Boss-only runs: how often / how fast do bot pairs beat the Warden?
import { cloneConfig, applyOverrides } from '../src/config.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { Bot, pairBots } from '../src/sim/bots.js';
const skill = process.argv[2] || 'strong', runs = +(process.argv[3] || 20);
const ov = process.argv[4] ? JSON.parse(process.argv[4]) : {};
let wins = 0; const times = [], hpLeft = [], hits = {};
let openTime = 0, dmgTime = 0, total = 0;
for (let r = 0; r < runs; r++) {
  const cfg = applyOverrides(cloneConfig(), ov);
  const g = createGame(cfg, { mode: 'survival', seed: 100 + r, noHitstop: true, startWave: 10, lives: 6 });
  const bots = pairBots(new Bot(g, 0, skill, r), new Bot(g, 1, skill, r + 50));
  let n = 0, lastHp = 0;
  while (!g.over && n < 60 * 300) {
    stepGame(g, [bots[0].update(cfg.dt), bots[1].update(cfg.dt)]);
    for (const e of g.events) if (e.k === 'hurt') hits[e.src] = (hits[e.src] || 0) + 1;
    g.events.length = 0; n++;
    if (g.boss) { total++; if (g.boss.open > 0) openTime++; if (g.boss.hp < lastHp) dmgTime++; lastHp = g.boss.hp; }
  }
  if (g.won) { wins++; times.push(g.time | 0); } else hpLeft.push(g.boss ? (g.boss.hp | 0) : 0);
}
console.log(skill, 'boss wins', wins, '/', runs, 'win times', times.join(','), '| boss hp left on loss', hpLeft.join(','));
console.log('core open', (openTime / total * 100).toFixed(0) + '% of boss time, dealing damage', (dmgTime / total * 100).toFixed(1) + '%', '| hits', JSON.stringify(hits));
