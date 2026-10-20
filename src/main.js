// App controller: screens, game loop, roles (local / host / guest), online flow.
import { cloneConfig } from './config.js';
import { createGame, stepGame, skipTutorial, gameStats } from './sim/game.js';
import { Bot, pairBots } from './sim/bots.js';
import { encodeSnapshot, Interpolator } from './sim/snapshot.js';
import { Renderer } from './render/renderer.js';
import { Input } from './input.js';
import * as audio from './audio.js';
import * as save from './save.js';
import * as plat from './platform.js';
import * as ui from './ui.js';
import { $ } from './ui.js';
import { HostSession, GuestSession, makeTransport, roomUrl, normaliseCode, loadScript } from './net.js';

const params = new URLSearchParams(location.search);
const LOCAL_NET = params.get('net') === 'local';
const cfg = cloneConfig();
const DT = cfg.dt;

const canvas = $('game');
const renderer = new Renderer(canvas);
const input = new Input(canvas);

const app = {
  role: null, game: null, mode: 'survival', running: false, paused: false, pauseReason: null,
  session: null, interp: null, guestInput: { x: 0, y: 0 }, bots: [null, null],
  acc: 0, snapT: 0, snapSeq: 0, inputT: 0, outEvents: [], inEvents: [],
  endShown: false, endT: 0, countdown: 0, dropDeadline: 0, partnerTutDone: true,
  attract: null, attractBots: null, lastStats: null, lastEnd: null, view: null, rotateHold: false,
  fps: 60, frameTimes: [], guestStarted: false, demo: null,
};
window.__tethered = { app, cfg, renderer, input, get game() { return app.game; }, killLink() { app.session?.killLink(); }, get view() { return app.view; } };

// ---------------- settings ----------------
function applySettings() {
  const s = save.settings();
  audio.setMuted(s.muted);
  renderer.shake.enabled = s.shake;
  for (const id of ['btn-mute', 'btn-mute2']) { const b = $(id); if (b) { b.textContent = s.muted ? '🔇' : '🔊'; b.setAttribute('aria-pressed', String(!s.muted)); } }
  $('set-sound').checked = !s.muted; $('set-shake').checked = s.shake; $('set-assist').checked = s.assist;
}
$('set-sound').addEventListener('change', (e) => { save.setSetting('muted', !e.target.checked); applySettings(); });
$('set-shake').addEventListener('change', (e) => { save.setSetting('shake', e.target.checked); applySettings(); });
$('set-assist').addEventListener('change', (e) => { save.setSetting('assist', e.target.checked); applySettings(); });

function refreshBests() {
  const b = save.best();
  const sv = b.survival, en = b.endless;
  $('survival-rules').textContent = `★ clear · ★★ ${cfg.stars.twoHits} hits or fewer · ★★★ no hits, under ${fmtClock(cfg.stars.threeTime)}`;
  $('best-survival').textContent = sv.cleared ? `${'★'.repeat(sv.stars)}${'☆'.repeat(3 - sv.stars)}  best ${sv.score}` : sv.bestWave ? `Best: wave ${sv.bestWave}` : '';
  $('best-endless').textContent = en.score ? `Best ${en.score} · wave ${en.wave}` : '';
  const parts = [];
  if (sv.cleared) parts.push(`Survival ${'★'.repeat(sv.stars)}`);
  if (en.score) parts.push(`Endless best ${en.score} (wave ${en.wave})`);
  $('title-best').textContent = parts.join('   ·   ');
}

const fmtClock = (t) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;

// ---------------- navigation ----------------
function goTitle() {
  stopGame();
  app.role = null;
  refreshBests();
  ui.show('title');
  plat.keepAwake(false);
}

function showModeSelect(forHost) {
  refreshBests();
  ui.setText('mode-title', forHost ? 'Partner connected!' : 'Choose a mode');
  ui.setText('mode-sub', forHost ? 'You pick the mode for both phones.' : 'Player 1 uses the left half of the screen, Player 2 the right.');
  $('mode-back').textContent = forHost ? 'Leave' : 'Back';
  ui.show('mode');
}

function message(title, sub, after = 'title') {
  ui.setText('msg-title', title); ui.setText('msg-sub', sub);
  app.msgAfter = after;
  ui.show('msg');
}

ui.bindActions((act) => {
  audio.initAudio();
  audio.sfx.ui();
  switch (act) {
    case 'local': app.role = 'local'; showModeSelect(false); break;
    case 'online': ui.show('online'); break;
    case 'howto': startLocal('survival', { tutorial: true, howto: true }); break;
    case 'settings': app.settingsFrom = ui.screen(); applySettings(); ui.show('settings'); break;
    case 'tut-play': app.paused = false; app.pauseReason = null; ui.hideAll(); app.countdown = 1.5; break;
    case 'mute': save.setSetting('muted', !save.settings().muted); applySettings(); break;
    case 'fullscreen': plat.toggleFullscreen(); break;
    case 'back': {
      const s = ui.screen();
      if (s === 'settings' && app.settingsFrom === 'pause') ui.show('pause');
      else if (s === 'mode' && app.role === 'host') leaveOnline();
      else if (s === 'join') ui.show('online');
      else goTitle();
      break;
    }
    case 'mode-survival': case 'mode-endless': {
      const mode = act.slice(5);
      if (app.role === 'host') hostStart(mode); else startLocal(mode);
      break;
    }
    case 'host': startHost(); break;
    case 'join': ui.setText('join-status', ''); ui.show('join'); setTimeout(() => $('join-code').focus(), 50); break;
    case 'copy': copyLink(); break;
    case 'share': navigator.share?.({ title: 'Tethered', text: `Join my Tethered game! Code ${app.session?.code}`, url: $('room-link').value }).catch(() => {}); break;
    case 'leave': leaveOnline(); break;
    case 'pause': requestPause(); break;
    case 'resume': requestResume(); break;
    case 'restart': restart(); break;
    case 'quit': quit(); break;
    case 'again': restart(); break;
    case 'retryboss': restart({ checkpoint: true }); break;
    case 'skip':
      if (app.role === 'guest') app.session?.send({ t: 'req', a: 'skip' });
      else if (app.game) { skipTutorial(app.game); save.setProgress('tutorialDone', true); }
      break;
    case 'waitmore': app.dropDeadline = performance.now() / 1000 + cfg.net.rejoinWindow; $('btn-waitmore').hidden = true; break;
    case 'msg-ok': if (app.msgAfter === 'join') ui.show('join'); else goTitle(); break;
  }
});

$('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = normaliseCode($('join-code').value);
  if (code.length !== cfg.net.codeLength) { ui.setText('join-status', `The code has ${cfg.net.codeLength} letters/numbers`); $('join-status').classList.add('err'); return; }
  startGuest(code);
});
$('join-code').addEventListener('input', (e) => { const v = normaliseCode(e.target.value); if (v !== e.target.value) e.target.value = v; });

function copyLink() {
  const v = $('room-link').value;
  (navigator.clipboard?.writeText(v) || Promise.reject()).then(() => ui.toast('Link copied')).catch(() => { $('room-link').select(); ui.toast('Select and copy the link'); });
}

// ---------------- game lifecycle ----------------
function stopGame() {
  app.running = false; app.paused = false; app.game = null; app.view = null; app.countdown = 0;
  $('hud-btns').hidden = true; $('countdown').hidden = true; $('rotate').hidden = true;
  audio.stopMusic();
}

function newGame(mode, opts = {}) {
  app.mode = mode;
  const tutorial = !!opts.tutorial;
  app.game = createGame(cfg, {
    mode, assist: save.settings().assist, tutorial,
    startWave: opts.checkpoint ? 10 : 1, checkpoint: !!opts.checkpoint, lives: opts.checkpoint ? 3 : undefined,
  });
  app.opts = opts;
  app.running = true; app.paused = false; app.endShown = false; app.endT = 0; app.acc = 0; app.countdown = 0;
  app.outEvents = [];
  resetRenderer();
  ui.hideAll();
  $('hud-btns').hidden = false;
  audio.initAudio(); audio.startMusic(0);
  plat.keepAwake(true);
  try { history.pushState({ g: 1 }, ''); } catch { /* */ }
}

function resetRenderer() {
  renderer.particles = new renderer.particles.constructor(cfg.fx.maxParticles);
  renderer.floaters.list.length = 0;
  renderer.banner = null; renderer.introCard = null; renderer.seen.clear(); renderer.shake.trauma = 0;
}

function startLocal(mode, opts = {}) {
  app.role = 'local';
  input.setLayout('split');
  renderer.local = null;
  const tutorial = opts.tutorial ?? !save.progress().tutorialDone;
  newGame(mode, { ...opts, tutorial: opts.checkpoint ? false : tutorial });
  const b1 = params.get('bots') || app.demo, b2 = params.get('bot2') || b1;
  app.bots = [b1 ? new Bot(app.game, 0, b1, 7) : null, b2 ? new Bot(app.game, 1, b2, 8) : null];
  if (app.bots[0] && app.bots[1]) pairBots(app.bots[0], app.bots[1]);
}

function restart(opts = {}) {
  if (app.role === 'guest') return;
  if (app.role === 'host') hostStart(app.mode, opts);
  else startLocal(app.mode, { ...opts, tutorial: false });
}

function quit() {
  if (app.role === 'guest') { leaveOnline(); return; }
  if (app.role === 'host') {
    stopGame();
    app.session?.send({ t: 'menu' });
    if (app.session?.state === 'connected') showModeSelect(true); else showHostLobby();
    return;
  }
  goTitle();
}

function requestPause(reason = 'user') {
  if (!app.running || app.game?.over && app.role !== 'guest') return;
  if (app.role === 'guest') { app.session?.send({ t: 'req', a: 'pause' }); return; }
  setPaused(true, reason);
}
function requestResume() {
  if (app.role === 'guest') { app.session?.send({ t: 'req', a: 'resume' }); return; }
  if (app.role === 'host' && app.session?.state !== 'connected') return;
  setPaused(false);
}

const PAUSE_TEXT = {
  user: '', partner: 'Your partner paused the game.', hidden: 'The game paused while the screen was away.',
  'partner-hidden': "Your partner's screen turned off or switched apps.", rotate: 'Your partner needs to turn their phone sideways.',
};

function setPaused(on, reason = 'user') {
  if (!app.running) return;
  if (on) {
    app.paused = true; app.pauseReason = reason;
    showPauseScreen(reason);
    plat.keepAwake(app.role !== 'local');
  } else {
    app.paused = false; app.pauseReason = null;
    ui.hideAll();
    app.countdown = 1.5; // quick 3-2-1 so nobody is caught off guard
    plat.keepAwake(true);
  }
  if (app.role === 'host') app.session?.send({ t: 'pause', on, reason, cd: on ? 0 : app.countdown });
}

function showPauseScreen(reason, fromHost = false) {
  ui.setText('pause-title', 'Paused');
  ui.setText('pause-sub', fromHost ? (reason === 'user' ? 'The host paused the game.' : reason === 'hidden' ? "The host's screen turned off." : PAUSE_TEXT[reason] && reason.startsWith('partner') ? 'Paused.' : PAUSE_TEXT[reason] || '') : PAUSE_TEXT[reason] || '');
  const guest = app.role === 'guest';
  $('btn-restart').hidden = guest;
  $('btn-quit').textContent = guest ? 'Leave game' : app.role === 'host' ? 'End game' : 'Main menu';
  ui.show('pause');
}

function showEnd(stats) {
  app.endShown = true;
  app.lastStats = stats;
  const recordable = !app.bots[0] && !app.bots[1];
  const info = recordable ? save.recordRun(stats) : {};
  const b = save.best();
  Object.assign(info, {
    bestScore: stats.mode === 'survival' ? b.survival.score : b.endless.score,
    bestWave: b.endless.wave, twoHits: cfg.stars.twoHits, threeTime: fmtClock(cfg.stars.threeTime),
  });
  ui.fillEnd(stats, info);
  const guest = app.role === 'guest';
  for (const btn of document.querySelectorAll('#end-buttons [data-act="again"]')) btn.hidden = guest;
  $('btn-retryboss').hidden = guest || !(stats.mode === 'survival' && !stats.won && stats.wave >= 10);
  document.querySelector('#end-buttons [data-act="quit"]').textContent = guest ? 'Leave' : app.role === 'host' ? 'Pick mode' : 'Main menu';
  $('end-wait').hidden = !guest;
  $('hud-btns').hidden = true;
  ui.show('end');
  try { if (stats.won) audio.sfx.win(); else audio.sfx.over(); } catch { /* audio is optional */ }
  audio.stopMusic();
  if (app.role === 'local') plat.keepAwake(false);
  if (app.role === 'host') { app.lastEnd = stats; app.session?.send({ t: 'end', stats }); }
}

// ---------------- events -> audio / haptics / fx ----------------
// A cosmetic failure (audio, effects) must never stop the simulation or rendering.
function handleEvent(ev, view) {
  try { handleEventInner(ev, view); } catch (e) { if (!handleEvent.warned) { handleEvent.warned = true; console.warn('effect error', e); } }
}
function handleEventInner(ev, view) {
  renderer.onEvent(ev, view);
  const S = audio.sfx;
  switch (ev.k) {
    case 'cut': S.cut(ev.combo); plat.buzz(8, 70); break;
    case 'multi': S.multi(ev.n); break;
    case 'clank': S.clank(); break;
    case 'gem': S.gem(ev.kind); break;
    case 'hurt': S.hurt(); plat.buzz([60, 40, 90]); break;
    case 'hurtTut': S.hurt(); plat.buzz(40); break;
    case 'pop': break;
    case 'shieldPop': S.shieldPop(); plat.buzz(40); break;
    case 'dashwarn': S.dashwarn(); break;
    case 'dash': S.dash(); break;
    case 'charge': S.charge(); break;
    case 'shoot': S.shoot(); break;
    case 'block': S.block(); break;
    case 'wave': S.wave(); plat.buzz(30); break;
    case 'waveClear': S.waveClear(); break;
    case 'capsule': S.capsule(); break;
    case 'power': S.power(ev.kind); plat.buzz(20); break;
    case 'nova': S.nova(); plat.buzz([30, 20, 60]); break;
    case 'milestone': S.milestone(); break;
    case 'bossIn': S.bossIn(); plat.buzz(80); break;
    case 'bossTele': case 'beamTele': case 'chargeTele': S.bossTele(); break;
    case 'bossHit': S.bossHit(); break;
    case 'bossPhase': S.bossPhase(); plat.buzz([40, 30, 40]); break;
    case 'bossDie': S.bossDie(); plat.buzz([80, 40, 120]); break;
    case 'coreOpen': S.coreOpen(); break;
    case 'beam': S.beam(); break;
    case 'ring': S.ring(); break;
    case 'tutDone':
      save.setProgress('tutorialDone', true);
      if (app.role === 'local' && app.opts?.howto) { app.paused = true; app.pauseReason = 'tutdone'; ui.show('tutdone'); }
      break;
  }
}

// ---------------- host ----------------
function showHostLobby() {
  ui.show('host');
}

function startHost() {
  leaveOnline(true);
  app.role = 'host';
  const s = new HostSession(makeTransport());
  app.session = s;
  loadScript('vendor/qrcode.min.js').catch(() => {}); // fetch the QR library while the room opens
  ui.setText('host-status', 'Starting…'); $('host-status').classList.remove('err');
  ui.setText('room-code', '·····'); $('room-link').value = ''; $('qr').innerHTML = '';
  $('btn-share').hidden = !navigator.share;
  ui.show('host');
  plat.keepAwake(true);
  s.on('ready', (code) => {
    ui.setText('room-code', code);
    const url = roomUrl(code);
    $('room-link').value = url;
    requestAnimationFrame(() => { $('room-link').scrollLeft = 1e4; });
    ui.renderQR($('qr'), url);
    ui.setText('host-status', 'Waiting for your partner…');
  });
  s.on('error', (kind) => {
    $('host-status').classList.add('err');
    ui.setText('host-status', kind === 'broker' || kind === 'load'
      ? "Can't reach the connection server. Check your internet, then tap Cancel and try again."
      : 'Something went wrong starting the game. Tap Cancel and try again.');
  });
  s.on('join', (meta) => {
    app.partnerTutDone = !!meta.tutDone;
    s.send({ t: 'welcome', state: 'lobby' });
    audio.sfx.ring(); plat.buzz(30);
    if (!app.running) showModeSelect(true);
  });
  s.on('rejoin', (meta) => {
    app.partnerTutDone = app.partnerTutDone || !!meta.tutDone;
    audio.sfx.ring(); plat.buzz(30);
    if (app.running && app.game && !app.game.over) {
      s.send({ t: 'welcome', state: 'game' });
      s.send({ t: 'start', mode: app.mode, resume: true });
      s.send({ t: 's', d: encodeSnapshot(app.game, ++app.snapSeq) });
      ui.toast('Partner is back!');
      if (app.pauseReason === 'drop' || app.paused) setPaused(false);
    } else if (app.endShown && app.lastEnd) {
      s.send({ t: 'welcome', state: 'end' });
      s.send({ t: 'end', stats: app.lastEnd });
      ui.toast('Partner is back!');
    } else {
      s.send({ t: 'welcome', state: 'lobby' });
      showModeSelect(true);
    }
  });
  s.on('drop', () => {
    app.guestInput = { x: 0, y: 0 };
    if (app.running && app.game && !app.game.over) {
      app.paused = true; app.pauseReason = 'drop';
      showDrop('Partner disconnected', 'Waiting for them to come back… (they can reopen the link)');
    } else if (ui.screen() === 'mode') {
      ui.show('host');
      ui.setText('host-status', 'Partner left — waiting for them to rejoin…');
    } else {
      ui.toast('Partner disconnected');
    }
  });
  s.on('unstable', (on) => { app.unstable = on; });
  s.on('msg', (m) => {
    if (m.t === 'i') { app.guestInput.x = m.x || 0; app.guestInput.y = m.y || 0; return; }
    if (m.t === 'req') {
      if (m.a === 'pause') setPaused(true, 'partner');
      else if (m.a === 'rotate') setPaused(true, 'rotate');
      else if (m.a === 'hidden') { if (app.running && !app.paused && !app.game?.over) setPaused(true, 'partner-hidden'); }
      else if (m.a === 'resume') setPaused(false);
      else if (m.a === 'skip' && app.game) { skipTutorial(app.game); }
      else if (m.a === 'leave' || m.a === 'gone') { s.dropped(); }
    }
  });
  s.start();
}

function hostStart(mode, opts = {}) {
  if (!app.session || app.session.state !== 'connected') { ui.toast('Your partner is not connected'); return; }
  input.setLayout('single');
  renderer.local = 0;
  const tutorial = !opts.checkpoint && (!save.progress().tutorialDone || !app.partnerTutDone);
  newGame(mode, { ...opts, tutorial });
  app.bots = [null, null];
  app.guestInput = { x: 0, y: 0 };
  app.lastEnd = null;
  app.session.send({ t: 'start', mode });
  app.session.send({ t: 's', d: encodeSnapshot(app.game, ++app.snapSeq) });
}

function showDrop(title, sub) {
  ui.setText('drop-title', title); ui.setText('drop-sub', sub);
  app.dropDeadline = performance.now() / 1000 + cfg.net.rejoinWindow;
  $('btn-waitmore').hidden = true;
  ui.show('drop');
}

// ---------------- guest ----------------
function startGuest(code, token) {
  leaveOnline(true);
  app.role = 'guest';
  const s = new GuestSession(makeTransport());
  app.session = s;
  app.interp = new Interpolator(cfg);
  app.guestStarted = false;
  ui.setText('join-status', `Connecting to ${code}…`); $('join-status').classList.remove('err');
  ui.show('join');
  $('join-code').value = code;
  plat.keepAwake(true);
  s.on('open', () => {
    save.sessionSet('guest', { code, token: s.token, ts: Date.now() });
    ui.setText('wait-title', 'Connected!'); ui.setText('wait-sub', 'Waiting for the host to pick a mode…');
    ui.show('wait');
    audio.sfx.ring(); plat.buzz(30);
  });
  s.on('rejoin', () => {
    app.notFound = 0;
    save.sessionSet('guest', { code, token: s.token, ts: Date.now() });
    ui.toast('Reconnected!');
    if (ui.screen() === 'drop') ui.show(app.running ? null : 'wait');
    if (!app.running && ui.screen() !== 'end') ui.show('wait');
  });
  s.on('error', (kind) => {
    const msg = {
      notfound: `Couldn't find game ${code}. Check the code, and make sure the host's screen is on.`,
      ice: "The phones couldn't connect directly. Put both phones on the same Wi-Fi — or turn on a hotspot on one phone and join it with the other — then try again.",
      broker: "Can't reach the connection server. Check your internet connection.",
      load: "Couldn't load online play. Check your internet connection.",
    }[kind] || 'Connection failed. Try again.';
    if (app.running || app.guestStarted) { message('Connection lost', msg); stopGame(); return; }
    ui.setText('join-status', msg); $('join-status').classList.add('err');
    ui.show('join');
  });
  s.on('drop', () => {
    showDrop('Connection lost', 'Reconnecting…');
  });
  app.notFound = 0;
  s.on('retryfail', (kind) => {
    // the broker says the room no longer exists: the host closed or reloaded the game
    if (kind === 'notfound' && ++app.notFound >= 2) {
      stopGame(); leaveOnline(true);
      message('The host left the game', 'The host closed or reloaded the game, so this room has ended. Ask them to host a new game.');
    }
  });
  s.on('unstable', (on) => { app.unstable = on; });
  s.on('msg', (m) => guestMsg(m));
  s.join(code, token, { tutDone: !!save.progress().tutorialDone });
}

function guestMsg(m) {
  const now = performance.now() / 1000;
  switch (m.t) {
    case 's': app.interp.push(m.d, now); app.snaps = (app.snaps || 0) + 1; break;
    case 'diag': {
      // support/diagnostics: the host can ask what this phone is doing
      const l = app.session?.link;
      app.session?.send({ t: 'diag', d: { running: app.running, paused: app.paused, view: !!app.view, buf: app.interp?.buf.length, snaps: app.snaps || 0, frames: app.frames || 0,
        screen: ui.screen(), vis: document.visibilityState, rotate: app.rotateHold, fast: l?.fast ? l.fast.readyState : 'none', w: innerWidth, h: innerHeight, ua: navigator.userAgent } });
      break;
    }
    case 'ev': for (const e of m.l) app.inEvents.push(e); break;
    case 'welcome':
      if (m.state === 'lobby' && !app.running) ui.show('wait');
      break;
    case 'start':
      app.mode = m.mode;
      if (!m.resume || !app.running) {
        app.interp.reset();
        app.inEvents = [];
        resetRenderer();
      } else app.interp.reset();
      app.running = true; app.guestStarted = true; app.paused = false; app.endShown = false;
      input.setLayout('single');
      renderer.local = 1;
      ui.hideAll();
      $('hud-btns').hidden = false;
      audio.initAudio(); audio.startMusic(0);
      plat.keepAwake(true);
      break;
    case 'pause':
      if (m.on) { app.paused = true; showPauseScreen(m.reason, true); }
      else { app.paused = false; if (ui.screen() === 'pause' || ui.screen() === 'drop') ui.hideAll(); app.countdown = m.cd || 0; }
      break;
    case 'end':
      if (!app.endShown) showEnd(m.stats);
      break;
    case 'menu':
      stopGame();
      ui.setText('wait-title', 'Connected'); ui.setText('wait-sub', 'The host is picking a mode…');
      ui.show('wait');
      break;
    case 'full':
      message('Game is full', 'That game already has two players.', 'join');
      app.session?.close(); app.session = null;
      break;
    case 'bye':
      stopGame();
      app.session?.close(); app.session = null; save.sessionDel('guest');
      message('The host left the game', 'The host closed or reloaded the game, so this room has ended. Ask them to host a new game.');
      break;
  }
}

function leaveOnline(silent = false) {
  const s = app.session;
  if (s) {
    try { s.send(app.role === 'host' ? { t: 'bye' } : { t: 'req', a: 'leave' }); } catch { /* */ }
    setTimeout(() => s.close(), 150);
  }
  app.session = null;
  save.sessionDel('guest');
  if (!silent) goTitle();
}

// ---------------- visibility / rotation ----------------
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || LOCAL_NET) return;
  if (!app.running || app.game?.over) return;
  if (app.role === 'guest') app.session?.send({ t: 'req', a: 'hidden' });
  else if (!app.paused) setPaused(true, 'hidden');
});
window.addEventListener('popstate', () => {
  if (app.running && !app.paused && app.role !== 'guest') { setPaused(true, 'user'); try { history.pushState({ g: 1 }, ''); } catch { /* */ } }
});
window.addEventListener('resize', () => { renderer.resize(); });
// tell the other phone straight away when this page goes away (closing / reloading)
window.addEventListener('pagehide', () => {
  if (!app.session) return;
  if (app.role === 'host') app.session.send({ t: 'bye' });
  else if (app.role === 'guest') app.session.send({ t: 'req', a: 'gone' });
});
window.addEventListener('keydown', (e) => {
  if (!app.running || (e.key !== 'Escape' && e.key.toLowerCase() !== 'p') || e.target.tagName === 'INPUT') return;
  if (ui.screen() === 'pause') requestResume(); else if (!ui.screen()) requestPause();
});

function checkRotate() {
  const portrait = plat.isPortrait() && app.running && !app.endShown;
  $('rotate').hidden = !portrait;
  if (portrait && !app.rotateHold) {
    app.rotateHold = true;
    if (app.role === 'guest') app.session?.send({ t: 'req', a: 'rotate' });
  } else if (!portrait && app.rotateHold) {
    app.rotateHold = false;
    if (app.role !== 'guest' && !app.paused) app.countdown = 1.5;
  }
}

// ---------------- main loop ----------------
let last = performance.now();
function frame(nowMs) {
  requestAnimationFrame(frame);
  app.frames = (app.frames || 0) + 1;
  const dt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  trackFps(dt);
  checkRotate();
  const now = nowMs / 1000;

  if (app.running && app.role !== 'guest') {
    const g = app.game;
    const holding = app.paused || app.rotateHold || app.countdown > 0;
    if (app.countdown > 0) app.countdown -= dt;
    if (!holding && !g.over) {
      app.acc += dt;
      let n = 0;
      while (app.acc >= DT && n < 5) {
        const ins = [
          app.bots[0] ? app.bots[0].update(DT) : input.get(0),
          app.role === 'host' ? app.guestInput : app.bots[1] ? app.bots[1].update(DT) : input.get(1),
        ];
        stepGame(g, ins, DT);
        if (g.events.length) {
          for (const ev of g.events) {
            handleEvent(ev, g);
            if (app.role === 'host') { ev.ht = g.tick * DT; app.outEvents.push(ev); }
          }
          g.events.length = 0;
        }
        app.acc -= DT; n++;
      }
      if (n === 5) app.acc = 0;
    }
    if (app.role === 'host' && app.session?.state === 'connected') {
      app.snapT += dt;
      const rate = holding || g.over ? 5 : cfg.net.snapshotHz;
      if (app.snapT >= 1 / rate) {
        app.snapT = 0;
        app.session.sendFast({ t: 's', d: encodeSnapshot(g, ++app.snapSeq) });
        if (app.outEvents.length) { app.session.send({ t: 'ev', l: app.outEvents }); app.outEvents = []; }
      }
    }
    if (g.over && !app.endShown) { app.endT += dt; if (app.endT > 1.4) showEnd(gameStats(g)); }
    $('btn-skip').hidden = !g.tut;
    if (g.enemies) audio.setMusicIntensity(Math.min(1, g.enemies.length / 18));
    app.view = g;
    showCountdown();
    const dim = !!ui.screen();
    $('hud-btns').hidden = dim || g.over;
    renderer.draw(g, input, dt, { hideHud: dim, status: app.role === 'host' && app.unstable ? 'Connection unstable…' : '' });
  } else if (app.running && app.role === 'guest') {
    if (app.countdown > 0) app.countdown -= dt;
    const v = app.interp.view(now);
    if (v) {
      // guest input + own-orb prediction
      const my = input.get(0);
      const live = !app.paused && !app.rotateHold && app.countdown <= 0 && v.phase !== 'over' && v.phase !== 'won';
      app.inputT += dt;
      if (app.inputT >= 1 / cfg.net.inputHz) {
        app.inputT = 0;
        app.session?.sendFast({ t: 'i', x: live ? +my.x.toFixed(3) : 0, y: live ? +my.y.toFixed(3) : 0 });
      }
      if (live) {
        const p = app.interp.predict(1, my, dt);
        if (p) v.players = [v.players[0], { ...v.players[1], x: p.x, y: p.y, vx: p.vx, vy: p.vy }];
      }
      // play host events in sync with the (delayed) interpolated picture
      while (app.inEvents.length && app.inEvents[0].ht <= (v.renderTime ?? Infinity)) handleEvent(app.inEvents.shift(), v);
      if (app.inEvents.length > 200) app.inEvents.splice(0, app.inEvents.length - 200);
      $('btn-skip').hidden = !v.tut;
      app.view = v;
      showCountdown();
      const dim = !!ui.screen();
      $('hud-btns').hidden = dim || v.phase === 'over' || v.phase === 'won';
      renderer.draw(v, input, dt, { hideHud: dim, status: app.unstable ? 'Connection unstable…' : '' });
    } else {
      renderer.ctx.setTransform(1, 0, 0, 1, 0, 0);
      renderer.ctx.fillStyle = '#05070f'; renderer.ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  } else {
    runAttract(dt);
  }
  // drop countdown
  if (ui.screen() === 'drop') {
    const left = Math.max(0, app.dropDeadline - now);
    if (left > 0) ui.setText('drop-count', String(Math.ceil(left)));
    else {
      ui.setText('drop-count', app.role === 'guest' ? "Still can't reach the host" : "They haven't come back yet");
      $('btn-waitmore').hidden = false;
    }
  }
}

function showCountdown() {
  const el = $('countdown');
  if (app.countdown > 0 && !app.paused) { el.hidden = false; el.textContent = String(Math.ceil(app.countdown / 0.5)); }
  else el.hidden = true;
}

// Background demo behind the menus: two strong bots playing Endless.
function runAttract(dt) {
  if (!app.attract || app.attract.over) {
    app.attract = createGame(cfg, { mode: 'endless', seed: (Math.random() * 1e9) | 0 });
    app.attractBots = pairBots(new Bot(app.attract, 0, 'strong', 3), new Bot(app.attract, 1, 'strong', 4));
  }
  const g = app.attract;
  app.acc += dt;
  let n = 0;
  while (app.acc >= DT && n < 3) {
    stepGame(g, [app.attractBots[0].update(DT), app.attractBots[1].update(DT)], DT);
    for (const ev of g.events) if (ev.k === 'cut' || ev.k === 'gem' || ev.k === 'hurt') renderer.onEvent(ev, g);
    g.events.length = 0;
    app.acc -= DT; n++;
  }
  if (n === 3) app.acc = 0;
  renderer.banner = null; renderer.introCard = null;
  renderer.draw(g, null, dt, { hideSticks: true, attract: true });
}

function trackFps(dt) {
  const f = app.frameTimes;
  f.push(dt);
  if (f.length > 120) f.shift();
  if (f.length === 120) {
    const avg = f.reduce((a, b) => a + b, 0) / f.length;
    app.fps = 1 / avg;
    // Drop to low quality only when frames are slow AND uneven. A steady 30fps (iPhone Low Power
    // Mode, some browsers) is a refresh cap, not the device struggling.
    const s = [...f].sort((a, b) => a - b), spread = s[Math.floor(s.length * 0.9)] - s[Math.floor(s.length * 0.1)];
    if (app.running && avg > 0.024 && spread > 0.006 && !renderer.lowQuality) { renderer.lowQuality = true; renderer.resize(); f.length = 0; }
  }
}

// ---------------- boot ----------------
function boot() {
  plat.suppressBrowserGestures();
  applySettings();
  refreshBests();
  ui.startLogo();
  if (!plat.fullscreenSupported()) $('btn-fs').hidden = true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone;
  if (ios && !standalone) { const h = $('install-hint'); h.hidden = false; h.textContent = 'Tip: tap Share → “Add to Home Screen” to play fullscreen.'; }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    const h = $('install-hint'); h.hidden = false; h.innerHTML = '';
    const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = 'Install app';
    b.onclick = () => { e.prompt(); h.hidden = true; };
    h.appendChild(b);
  });
  // first gesture unlocks audio
  window.addEventListener('pointerdown', () => audio.initAudio(), { once: true });

  // deep link: #join=CODE (from QR / shared link)
  const m = location.hash.match(/join=([A-Za-z0-9]+)/);
  const stored = save.sessionGet('guest');
  if (m) {
    const code = normaliseCode(m[1]);
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* */ }
    startGuest(code, stored && stored.code === code ? stored.token : undefined);
  } else if (stored && Date.now() - stored.ts < 10 * 60 * 1000) {
    startGuest(stored.code, stored.token); // reloaded mid-game: rejoin the same room
  } else if (params.get('demo')) {
    app.demo = params.get('demo');
    startLocal(params.get('mode') || 'endless', { tutorial: params.get('tutorial') === '1' });
  } else {
    ui.show('title');
  }
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !params.has('nosw')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
