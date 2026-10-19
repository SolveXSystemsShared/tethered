// Debug: dump the situation just before each life lost.
import { cloneConfig } from '../src/config.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { Bot, pairBots } from '../src/sim/bots.js';
const skill = process.argv[2] || 'strong', SEED = +(process.argv[3] || 1);
const cfg = cloneConfig();
const g = createGame(cfg, { mode: 'survival', seed: SEED, noHitstop: true });
const bots = pairBots(new Bot(g, 0, skill, SEED), new Bot(g, 1, skill, SEED));
const hist = [];
let n = 0;
while (!g.over && n < 60 * 600) {
  const snap = { t: g.time.toFixed(2), p: g.players.map((p) => [p.x | 0, p.y | 0, p.vx | 0, p.vy | 0]), want: bots.map((b) => [b.want.x.toFixed(2), b.want.y.toFixed(2)]), e: g.enemies.map((e) => [e.type, e.x | 0, e.y | 0, e.st]), rope: g.rope.len | 0 };
  hist.push(snap); if (hist.length > 40) hist.shift();
  stepGame(g, [bots[0].update(cfg.dt), bots[1].update(cfg.dt)]);
  for (const ev of g.events) if (ev.k === 'hurt') {
    console.log(`--- HURT p${ev.p} by ${ev.src} at t=${g.time.toFixed(2)} wave ${g.wave}`);
    for (const s of [hist[0], hist[20], hist[39]]) {
      const me = s.p[ev.p];
      const near = s.e.map((e) => [e[0], e[1], e[2], e[3], Math.hypot(e[1] - me[0], e[2] - me[1]) | 0]).sort((a, b) => a[4] - b[4]).slice(0, 3);
      console.log(`  t=${s.t} me=${me} mate=${s.p[1 - ev.p]} want=${s.want[ev.p]} rope=${s.rope} near=${JSON.stringify(near)}`);
    }
  }
  g.events.length = 0; n++;
}
