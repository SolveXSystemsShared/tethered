// End-to-end tests (Playwright). Run: node tests/e2e.mjs [--only name] [--peer] [--base URL]
// Needs the dev server: node tools/serve.mjs 8080
import { chromium } from 'playwright';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:8080/';
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const WITH_PEER = args.includes('--peer');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

const results = [];
let browser;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(c, msg) { if (!c) throw new Error('Assertion failed: ' + msg); }

async function newPage(ctx, query = '') {
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/vibrate|AudioContext|favicon|ERR_|net::/.test(m.text())) page.errors.push(m.text()); });
  await page.goto(BASE + '?nosw' + (query ? '&' + query : ''));
  await page.waitForFunction(() => window.__tethered);
  return page;
}
const visible = (page, id) => page.evaluate((id) => document.getElementById(id)?.classList.contains('on'), id);
const click = (page, sel) => page.click(sel, { timeout: 5000 });
const game = (page, fn) => page.evaluate(fn);

// multi-touch via CDP: each finger {id, x0,y0,x1,y1}
async function touchDrag(page, fingers, ms = 600) {
  const cdp = await page.context().newCDPSession(page);
  const pts = (t) => fingers.map((f) => ({ x: f.x0 + (f.x1 - f.x0) * t, y: f.y0 + (f.y1 - f.y0) * t, id: f.id, radiusX: 8, radiusY: 8, force: 1 }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0) });
  const steps = 12;
  for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(i / steps) }); await sleep(ms / steps / 2); }
  return { cdp, end: async () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) };
}

async function test(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  const t0 = Date.now();
  try { await fn(); results.push([name, 'PASS', Date.now() - t0]); console.log('PASS', name); }
  catch (e) { results.push([name, 'FAIL', Date.now() - t0, e.message]); console.log('FAIL', name, '-', e.message.split('\n')[0]); }
}

browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'] });

await test('title screen loads without errors', async () => {
  const ctx = await browser.newContext(PHONE);
  const p = await newPage(ctx);
  await sleep(800);
  assert(await visible(p, 'scr-title'), 'title visible');
  assert(await p.isVisible('text=Play on this device'), 'local button');
  assert(await p.isVisible('text=Play on two phones'), 'online button');
  assert(p.errors.length === 0, 'errors: ' + p.errors.join(' | '));
  await ctx.close();
});

await test('same-device: first run shows tutorial, skip works, two touch sticks move both orbs', async () => {
  const ctx = await browser.newContext(PHONE);
  const p = await newPage(ctx);
  await click(p, 'text=Play on this device');
  assert(await visible(p, 'scr-mode'), 'mode screen');
  await click(p, '[data-act=mode-survival]');
  await sleep(300);
  assert(await game(p, () => !!window.__tethered.game.tut), 'tutorial auto-starts first time');
  assert(await p.isVisible('#btn-skip'), 'skip visible');
  await click(p, '#btn-skip');
  await sleep(300);
  const st = await game(p, () => ({ tut: !!window.__tethered.game.tut, wave: window.__tethered.game.wave, done: JSON.parse(localStorage.getItem('tethered.save.v1')).progress.tutorialDone }));
  assert(!st.tut && st.wave === 1 && st.done, 'skipped to wave 1 and remembered: ' + JSON.stringify(st));
  const before = await game(p, () => window.__tethered.game.players.map((q) => [q.x, q.y]));
  // P1 drags right on the left half, P2 drags up on the right half — simultaneously
  const d = await touchDrag(p, [{ id: 1, x0: 150, y0: 250, x1: 230, y1: 250 }, { id: 2, x0: 650, y0: 250, x1: 650, y1: 170 }]);
  await sleep(500);
  const mid = await game(p, () => window.__tethered.game.players.map((q) => [q.x, q.y]));
  await d.end();
  assert(mid[0][0] - before[0][0] > 60, 'P1 moved right: ' + JSON.stringify([before[0], mid[0]]));
  assert(before[1][1] - mid[1][1] > 60, 'P2 moved up: ' + JSON.stringify([before[1], mid[1]]));
  assert(p.errors.length === 0, 'errors: ' + p.errors.join(' | '));
  await ctx.close();
});

await test('tutorial: interactive steps complete (bot-driven) and lead into wave 1', async () => {
  const ctx = await browser.newContext(PHONE);
  const p = await newPage(ctx, 'demo=strong&mode=survival&tutorial=1');
  const steps = new Set();
  for (let i = 0; i < 150; i++) {
    const s = await game(p, () => window.__tethered.game.tut?.step || 'none:' + window.__tethered.game.wave);
    steps.add(s);
    if (s.startsWith('none')) break;
    await sleep(400);
  }
  const want = ['move', 'together', 'stretch', 'sweep', 'gem', 'danger', 'wave', 'done'];
  for (const w of want) assert(steps.has(w), `step ${w} seen (${[...steps]})`);
  assert(await game(p, () => window.__tethered.game.wave === 1 && window.__tethered.game.lives === window.__tethered.game.startLives), 'wave 1 with full lives');
  await ctx.close();
});

await test('keyboard fallback moves both players (WASD + arrows)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await newPage(ctx);
  await game(p, () => { localStorage.setItem('tethered.save.v1', JSON.stringify({ progress: { tutorialDone: true } })); });
  await p.reload(); await p.waitForFunction(() => window.__tethered);
  await click(p, 'text=Play on this device');
  await click(p, '[data-act=mode-endless]');
  await sleep(300);
  const b = await game(p, () => window.__tethered.game.players.map((q) => [q.x, q.y]));
  await p.keyboard.down('a'); await p.keyboard.down('ArrowDown');
  await sleep(500);
  await p.keyboard.up('a'); await p.keyboard.up('ArrowDown');
  const a = await game(p, () => window.__tethered.game.players.map((q) => [q.x, q.y]));
  assert(b[0][0] - a[0][0] > 50, 'P1 moved left');
  assert(a[1][1] - b[1][1] > 50, 'P2 moved down');
  await ctx.close();
});

await test('pause, resume, game over screen shows team stats, best score saved', async () => {
  const ctx = await browser.newContext(PHONE);
  const p = await newPage(ctx);
  await game(p, () => { localStorage.setItem('tethered.save.v1', JSON.stringify({ progress: { tutorialDone: true } })); });
  await p.reload(); await p.waitForFunction(() => window.__tethered);
  await click(p, 'text=Play on this device');
  await click(p, '[data-act=mode-endless]');
  await sleep(500);
  await click(p, '#btn-pause');
  assert(await visible(p, 'scr-pause'), 'pause screen');
  const t1 = await game(p, () => window.__tethered.game.tick); await sleep(400);
  assert(await game(p, () => window.__tethered.game.tick) === t1, 'sim frozen while paused');
  await click(p, '[data-act=resume]');
  await sleep(2200);
  assert(await game(p, () => window.__tethered.game.tick) > t1, 'sim resumed after countdown');
  await game(p, () => { const g = window.__tethered.game; g.score = 1234; for (let i = 0; i < 10; i++) { g.players[0].inv = 0; g.hurtPlayer(0, 'test'); } });
  await p.waitForSelector('#scr-end.on', { timeout: 6000 });
  const txt = await p.textContent('#end-stats');
  for (const k of ['Enemies cut', 'Hits taken', 'Best combo', 'Waves survived', 'Time played']) assert(txt.includes(k), 'stat ' + k);
  const best = await game(p, () => JSON.parse(localStorage.getItem('tethered.save.v1')).best.endless.score);
  assert(best >= 1234, 'endless best saved: ' + best);
  await ctx.close();
});

await test('survival victory screen shows stars', async () => {
  const ctx = await browser.newContext(PHONE);
  const p = await newPage(ctx);
  await game(p, () => { localStorage.setItem('tethered.save.v1', JSON.stringify({ progress: { tutorialDone: true } })); });
  await p.reload(); await p.waitForFunction(() => window.__tethered);
  await click(p, 'text=Play on this device');
  await click(p, '[data-act=mode-survival]');
  await sleep(300);
  // jump to the end of wave 10 with the boss defeated
  await game(p, () => { const g = window.__tethered.game; g.wave = 10; g.enemies.length = 0; g.portals.length = 0; g.boss = null; g.spawner.steps = []; g.spawner.groups = []; });
  await p.waitForSelector('#scr-end.on', { timeout: 9000 });
  assert((await p.textContent('#end-title')).includes('Victory'), 'victory title');
  assert((await p.locator('#end-stars .on').count()) >= 1, 'at least one star');
  assert(await game(p, () => JSON.parse(localStorage.getItem('tethered.save.v1')).best.survival.cleared), 'cleared saved');
  await ctx.close();
});

await test('portrait during play shows rotate prompt', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await newPage(ctx, 'demo=average&mode=endless');
  await sleep(500);
  assert(await p.isVisible('#rotate'), 'rotate overlay visible');
  const t = await game(p, () => window.__tethered.game.tick); await sleep(300);
  assert(await game(p, () => window.__tethered.game.tick) === t, 'sim holds while portrait');
  await ctx.close();
});

async function onlineFlow(makePages, label) {
  const [host, guest] = await makePages();
  await click(host, 'text=Play on two phones');
  await click(host, 'text=Host a game');
  await host.waitForFunction(() => /^[A-Z0-9]{5}$/.test(document.getElementById('room-code').textContent), null, { timeout: 25000 });
  const code = await host.textContent('#room-code');
  const link = await host.inputValue('#room-link');
  assert(link.includes('#join=' + code), 'link contains code');
  assert(await host.locator('#qr svg').count() === 1, 'QR rendered');
  await guest.goto(link.replace('?', '?nosw&'));
  await guest.waitForFunction(() => document.getElementById('scr-wait')?.classList.contains('on'), null, { timeout: 25000 });
  await host.waitForSelector('#scr-mode.on', { timeout: 10000 });
  await click(host, '[data-act=mode-endless]');
  await guest.waitForFunction(() => window.__tethered.app.running && window.__tethered.view, null, { timeout: 10000 });
  await sleep(1500);
  if (await host.evaluate(() => !!window.__tethered.game.tut)) { await click(guest, '#btn-skip'); await sleep(800); }
  assert(await host.evaluate(() => !window.__tethered.game.tut), 'tutorial skipped by guest request');
  // guest input moves P2 on the host
  const b = await host.evaluate(() => [window.__tethered.game.players[1].x, window.__tethered.game.players[1].y]);
  await guest.keyboard.down('ArrowLeft'); await sleep(700); await guest.keyboard.up('ArrowLeft');
  const a = await host.evaluate(() => [window.__tethered.game.players[1].x, window.__tethered.game.players[1].y]);
  assert(b[0] - a[0] > 60, `${label}: guest input moved P2 on host ${JSON.stringify([b, a])}`);
  // guest renders host state (same score/wave)
  const hs = await host.evaluate(() => window.__tethered.game.wave);
  const gs = await guest.evaluate(() => window.__tethered.view.wave);
  assert(hs === gs, 'guest sees host wave');
  // simulated drop: kill the guest's connection silently
  await host.evaluate(() => { window.__tethered.cfg.net.rejoinWindow = 4; });
  await guest.evaluate(() => window.__tethered.killLink());
  await host.waitForSelector('#scr-drop.on', { timeout: 15000 });
  assert(await host.evaluate(() => window.__tethered.app.paused), 'host paused on drop');
  // rejoin happens automatically (guest retries every 2s)
  await host.waitForFunction(() => !document.getElementById('scr-drop').classList.contains('on') && window.__tethered.app.session.state === 'connected', null, { timeout: 30000 });
  await sleep(2500);
  const t1 = await host.evaluate(() => window.__tethered.game.tick); await sleep(500);
  assert(await host.evaluate(() => window.__tethered.game.tick) > t1, 'game resumed after rejoin');
  assert(await guest.evaluate(() => window.__tethered.app.running && !document.getElementById('scr-drop').classList.contains('on')), 'guest back in game');
  // guest leaves for good -> after the window, host gets keep-waiting/menu options
  await guest.evaluate(() => { window.__tethered.app.session.close(); });
  await guest.close();
  await host.waitForSelector('#scr-drop.on', { timeout: 15000 });
  await host.waitForSelector('#drop-buttons:not([hidden])', { timeout: 15000 });
  assert(await host.isVisible('text=Keep waiting'), 'keep waiting offered');
  assert(host.errors.length === 0, 'host errors: ' + host.errors.join(' | '));
}

await test('online (local two-tab transport): host/QR/link join, play, drop + rejoin, timeout options', async () => {
  const ctx = await browser.newContext(PHONE);
  await onlineFlow(async () => [await newPage(ctx, 'net=local'), await (async () => { const g = await ctx.newPage(); g.errors = []; g.on('pageerror', (e) => g.errors.push(e.message)); return g; })()], 'local');
  await ctx.close();
});

if (WITH_PEER) {
  await test('online (PeerJS/WebRTC, two browser contexts): join via link, play, drop + rejoin', async () => {
    const c1 = await browser.newContext(PHONE), c2 = await browser.newContext(PHONE);
    await onlineFlow(async () => [await newPage(c1), await (async () => { const g = await c2.newPage(); g.errors = []; g.on('pageerror', (e) => g.errors.push(e.message)); return g; })()], 'peer');
    await c1.close(); await c2.close();
  });
}

await test('performance: busy late wave holds ~60fps with 4x CPU throttling', async () => {
  const ctx = await browser.newContext(PHONE);
  const p = await newPage(ctx);
  await game(p, () => { localStorage.setItem('tethered.save.v1', JSON.stringify({ progress: { tutorialDone: true } })); });
  await p.reload(); await p.waitForFunction(() => window.__tethered);
  await click(p, 'text=Play on this device');
  await click(p, '[data-act=mode-endless]');
  // jump to a dense late wave (no bots: this measures the real game, not the AI)
  await game(p, () => { const g = window.__tethered.game; g.lives = 999; g.wave = 14; g.enemies.length = 0; g.portals.length = 0; g.spawner.steps = []; g.spawner.groups = []; });
  // keep the orbs moving so the rope, cuts and particles are all active
  await p.evaluate(() => { const i = window.__tethered.input; let t = 0; setInterval(() => { t += 0.05; i.keys.clear(); if (Math.sin(t) > 0) i.keys.add('d'); else i.keys.add('a'); if (Math.cos(t * 1.3) > 0) i.keys.add('ArrowUp'); else i.keys.add('ArrowDown'); }, 50); });
  await p.waitForFunction(() => window.__tethered.game.wave === 15 && window.__tethered.game.enemies.length >= 10, null, { timeout: 30000 });
  await sleep(1000);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const fr = await p.evaluate(() => new Promise((res) => {
    const ts = []; let last = performance.now();
    const f = (t) => { ts.push(t - last); last = t; if (ts.length < 300) requestAnimationFrame(f); else res(ts); };
    requestAnimationFrame(f);
  }));
  const cost = await p.evaluate(() => {
    const T = window.__tethered, g = T.game, N = 60;
    let t0 = performance.now(); for (let i = 0; i < N; i++) T.renderer.draw(g, T.input, 1 / 60, {}); const r = (performance.now() - t0) / N;
    return { render: r };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const sorted = [...fr].sort((a, b) => a - b);
  const avg = fr.reduce((a, b) => a + b, 0) / fr.length;
  const p95 = sorted[Math.floor(0.95 * sorted.length)];
  const ents = await game(p, () => window.__tethered.game.enemies.length + window.__tethered.game.shots.length);
  console.log(`      perf @4x CPU: avg frame ${avg.toFixed(1)}ms (${(1000 / avg).toFixed(0)}fps) p95 ${p95.toFixed(1)}ms; draw() ${cost.render.toFixed(1)}ms; ${ents} enemies+shots; lowQuality=${await game(p, () => window.__tethered.renderer.lowQuality)}`);
  assert(avg < 18.5, 'average frame under 18.5ms');
  await ctx.close();
});

await test('PWA: service worker caches app; same-device mode works offline', async () => {
  const ctx = await browser.newContext(PHONE);
  const p = await ctx.newPage();
  await p.goto(BASE);
  await p.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
  await p.reload(); await sleep(1000);
  const ok = await p.evaluate(async () => !!(await caches.keys()).length);
  assert(ok, 'cache populated');
  await ctx.setOffline(true);
  await p.reload();
  await p.waitForFunction(() => window.__tethered, null, { timeout: 10000 });
  await p.click('text=Play on this device');
  await p.click('[data-act=mode-endless]');
  await sleep(500);
  assert(await p.evaluate(() => window.__tethered.app.running), 'game runs offline');
  const manifest = await p.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  assert(manifest.icons.length >= 2 && manifest.display, 'manifest ok');
  await ctx.close();
});

await test('download size under 1MB', async () => {
  const ship = ['index.html', 'style.css', 'manifest.webmanifest', 'sw.js', 'src', 'vendor', 'icons'];
  let total = 0;
  const walk = (p) => { const s = statSync(p); if (s.isDirectory()) for (const f of readdirSync(p)) walk(join(p, f)); else total += s.size; };
  for (const f of ship) walk(join(ROOT, f));
  console.log(`      total shipped bytes: ${total} (${(total / 1024).toFixed(0)} KB)`);
  assert(total < 1024 * 1024, 'under 1MB');
});

await browser.close();
const fails = results.filter((r) => r[1] === 'FAIL');
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
