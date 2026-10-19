// Which rendering layers cost the most? (headless, 4x CPU throttle)
import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
await p.goto('http://localhost:8080/?nosw');
await p.evaluate(() => localStorage.setItem('tethered.save.v1', JSON.stringify({ progress: { tutorialDone: true } })));
await p.reload(); await p.waitForFunction(() => window.__tethered);
await p.click('text=Play on this device'); await p.click('[data-act=mode-endless]');
await p.evaluate(() => { const g = window.__tethered.game; g.lives = 999; g.wave = 14; g.enemies.length = 0; g.portals.length = 0; g.spawner.steps = []; g.spawner.groups = []; });
await p.waitForFunction(() => window.__tethered.game.enemies.length >= 10, null, { timeout: 30000 });
await p.evaluate(() => { const i = window.__tethered.input; let t = 0; setInterval(() => { t += 0.05; i.keys.clear(); if (Math.sin(t) > 0) i.keys.add('d'); else i.keys.add('a'); if (Math.cos(t * 1.3) > 0) i.keys.add('ArrowUp'); else i.keys.add('ArrowDown'); }, 50); });
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const measure = () => p.evaluate(() => new Promise((res) => { const ts = []; let last = performance.now(); const f = (t) => { ts.push(t - last); last = t; if (ts.length < 150) requestAnimationFrame(f); else res(ts.reduce((a, b) => a + b, 0) / ts.length); }; requestAnimationFrame(f); }));
for (const [label, dbg, low] of [['full', {}, false], ['no hud+banner', { nohud: 1 }, false], ['no floaters', { nofloat: 1 }, false], ['no rope', { norope: 1 }, false], ['no enemies', { noenemies: 1 }, false], ['no glow', { noglow: 1 }, false], ['no particles', { noparticles: 1 }, false], ['nothing', { nohud: 1, nofloat: 1, norope: 1, noenemies: 1, noglow: 1, noparticles: 1, nobg: 1 }, false], ['lowQuality (DPR1)', {}, true]]) {
  await p.evaluate(([d, low]) => { const r = window.__tethered.renderer; r.dbg = d; r.lowQuality = low; r.resize(); window.__tethered.app.frameTimes.length = 0; }, [dbg, low]);
  console.log(label.padEnd(26), (await measure()).toFixed(1), 'ms');
}
await b.close();
