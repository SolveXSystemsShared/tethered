import { cloneConfig } from '../src/config.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { Bot, pairBots } from '../src/sim/bots.js';
const skill = process.argv[2] || 'strong';
let shown = 0;
for (let seed = 1; seed <= 20 && shown < 6; seed++) {
  const cfg = cloneConfig();
  const g = createGame(cfg, { mode: 'survival', seed, noHitstop: true, startWave: 6 });
  const bots = pairBots(new Bot(g, 0, skill, seed), new Bot(g, 1, skill, seed + 5));
  const hist = [];
  let n = 0;
  while (!g.over && n < 60 * 120) {
    hist.push({ t: g.time, p: g.players.map((p) => [p.x | 0, p.y | 0, p.vx | 0, p.vy | 0, +p.inv.toFixed(1)]), s: g.shots.map((s) => [s.x | 0, s.y | 0, s.vx | 0, s.vy | 0]), want: bots.map((b) => [+b.want.x.toFixed(2), +b.want.y.toFixed(2)]), aware: bots.map((b) => b.aware?.shot) });
    if (hist.length > 60) hist.shift();
    stepGame(g, [bots[0].update(cfg.dt), bots[1].update(cfg.dt)]);
    for (const ev of g.events) if (ev.k === 'hurt' && ev.src === 'shot' && shown < 6) {
      shown++;
      console.log(`--- shot hit p${ev.p} wave ${g.wave} t=${g.time.toFixed(2)}`);
      for (const k of [0, 30, 50, 59]) { const h = hist[k]; if (!h) continue; const me = h.p[ev.p]; const near = h.s.map((s) => [...s, Math.hypot(s[0] - me[0], s[1] - me[1]) | 0]).sort((a, b) => a[4] - b[4]).slice(0, 2); console.log(`  t=${h.t.toFixed(2)} me=${me} mate=${h.p[1 - ev.p]} want=${h.want[ev.p]} aware=${h.aware[ev.p]} shots=${JSON.stringify(near)}`); }
    }
    g.events.length = 0; n++;
  }
}
