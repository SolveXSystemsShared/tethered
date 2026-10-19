// Procedural audio: every sound is synthesised with the Web Audio API (no files).
// Master -> compressor -> destination; separate SFX and music buses; music ducks on hits.

const PENTA = [0, 2, 4, 7, 9];
let ctx = null, master, comp, sfxBus, musicBus, noiseBuf;
let muted = false;
const lastPlay = {};
let music = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // wait for a tap
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try { ctx = new AC(); } catch { ctx = null; return; }
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9;
  musicBus = ctx.createGain(); musicBus.gain.value = 0.32;
  sfxBus.connect(master); musicBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02);
}
export function isMuted() { return muted; }

function canPlay(name, gapMs) {
  if (!ctx || muted || ctx.state !== 'running') return false;
  const now = performance.now();
  if (now - (lastPlay[name] || 0) < gapMs) return false;
  lastPlay[name] = now;
  return true;
}

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(type, f0, f1, dur, peak = 0.3, attack = 0.004, bus = sfxBus, when = 0) {
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  o.detune.value = (Math.random() - 0.5) * 30;
  env(g, t, attack, peak, dur);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + attack + dur + 0.05);
}

function noise(dur, peak, filterType, f0, f1, when = 0, q = 1) {
  const t = ctx.currentTime + when;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = filterType; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); env(g, t, 0.003, peak, dur);
  s.connect(f); f.connect(g); g.connect(sfxBus);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

function duck() {
  if (!musicBus) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(0.12, t, 0.02);
  musicBus.gain.setTargetAtTime(0.32, t + 0.25, 0.3);
}

const semis = (n) => Math.pow(2, n / 12);
function comboFreq(combo) {
  const c = Math.min(combo, 15) - 1;
  const oct = Math.floor(c / 5), deg = PENTA[((c % 5) + 5) % 5];
  return 440 * semis(deg + oct * 12);
}

export const sfx = {
  cut(combo = 1) {
    if (!canPlay('cut', 28)) return;
    const f = comboFreq(Math.max(1, combo));
    tone('triangle', f * 1.5, f * 0.5, 0.09, 0.22);
    tone('sine', f, f, 0.12, 0.12, 0.002);
    noise(0.04, 0.12, 'highpass', 3000, 3000);
  },
  multi(n) { if (!canPlay('multi', 80)) return; for (let i = 0; i < Math.min(n, 4); i++) tone('square', 660 * semis(i * 4), 660 * semis(i * 4), 0.07, 0.07, 0.003, sfxBus, i * 0.05); },
  clank() { if (!canPlay('clank', 90)) return; tone('square', 180, 120, 0.08, 0.15); noise(0.06, 0.2, 'bandpass', 2400, 1800, 0, 6); },
  gem(kind) {
    if (!canPlay('gem', 35)) return;
    if (kind === 'heart') { [0, 4, 7, 12].forEach((s, i) => tone('sine', 523 * semis(s), 523 * semis(s), 0.12, 0.15, 0.004, sfxBus, i * 0.06)); return; }
    const b = kind === 'prism' ? 1046 : 880;
    tone('sine', b, b, 0.05, 0.13); tone('sine', b * 1.5, b * 1.5, 0.07, 0.11, 0.004, sfxBus, 0.045);
  },
  hurt() {
    if (!canPlay('hurt', 120)) return;
    duck();
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.4);
    f.type = 'lowpass'; f.frequency.setValueAtTime(2000, t); f.frequency.exponentialRampToValueAtTime(200, t + 0.4);
    env(g, t, 0.005, 0.35, 0.42);
    o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.5);
    noise(0.2, 0.25, 'lowpass', 1200, 200);
  },
  shieldPop() { if (!canPlay('shield', 100)) return; tone('sine', 900, 300, 0.25, 0.2); noise(0.15, 0.15, 'bandpass', 3000, 800, 0, 3); },
  dashwarn() { if (!canPlay('dashwarn', 120)) return; tone('sine', 300, 900, 0.8, 0.07, 0.05); },
  dash() { if (!canPlay('dash', 80)) return; noise(0.25, 0.18, 'bandpass', 600, 2400, 0, 2); },
  charge() { if (!canPlay('charge', 150)) return; tone('triangle', 400, 1200, 0.7, 0.05, 0.05); },
  shoot() { if (!canPlay('shoot', 80)) return; tone('square', 520, 260, 0.12, 0.08); },
  block() { if (!canPlay('block', 60)) return; tone('sine', 1500, 900, 0.06, 0.1); },
  spawn() { if (!canPlay('spawn', 120)) return; tone('sine', 200, 400, 0.15, 0.04, 0.02); },
  wave() { if (!canPlay('wave', 300)) return; [0, 7, 12].forEach((s, i) => tone('triangle', 330 * semis(s), 330 * semis(s), 0.35, 0.12, 0.01, sfxBus, i * 0.09)); },
  waveClear() { if (!canPlay('waveClear', 300)) return; [0, 4, 7, 12, 16].forEach((s, i) => tone('sine', 523 * semis(s), 523 * semis(s), 0.18, 0.1, 0.005, sfxBus, i * 0.07)); },
  capsule() { if (!canPlay('capsule', 200)) return; tone('sine', 700, 1400, 0.25, 0.1); },
  power(kind) {
    if (!canPlay('power', 150)) return;
    const base = { mega: 220, freeze: 880, shield: 440, nova: 330 }[kind] || 440;
    [0, 5, 10, 15].forEach((s, i) => tone('sawtooth', base * semis(s), base * semis(s), 0.12, 0.06, 0.005, sfxBus, i * 0.05));
  },
  nova() { if (!canPlay('nova', 200)) return; duck(); tone('sine', 120, 40, 0.8, 0.4, 0.005); noise(0.6, 0.3, 'lowpass', 4000, 100); },
  milestone() { if (!canPlay('milestone', 300)) return; [0, 4, 7, 11, 14].forEach((s, i) => tone('triangle', 660 * semis(s), 660 * semis(s), 0.12, 0.09, 0.004, sfxBus, i * 0.05)); },
  bossIn() { if (!canPlay('boss', 500)) return; duck(); tone('sawtooth', 55, 40, 1.6, 0.3, 0.2); noise(1.4, 0.2, 'lowpass', 300, 80); },
  bossTele() { if (!canPlay('btele', 300)) return; tone('sine', 200, 600, 0.9, 0.08, 0.1); },
  bossHit() { if (!canPlay('bhit', 90)) return; tone('square', 140, 90, 0.08, 0.12); noise(0.05, 0.12, 'bandpass', 1500, 900, 0, 4); },
  bossPhase() { duck(); tone('sawtooth', 80, 30, 1.0, 0.35, 0.02); noise(0.8, 0.3, 'lowpass', 2000, 100); },
  bossDie() { duck(); tone('sawtooth', 110, 20, 2.0, 0.4, 0.01); noise(1.6, 0.35, 'lowpass', 5000, 60); [0, 4, 7, 12].forEach((s, i) => tone('triangle', 392 * semis(s), 392 * semis(s), 0.5, 0.12, 0.01, sfxBus, 0.6 + i * 0.12)); },
  coreOpen() { if (!canPlay('core', 300)) return; tone('sine', 400, 800, 0.3, 0.12); tone('sine', 600, 1200, 0.3, 0.08, 0.004, sfxBus, 0.1); },
  beam() { if (!canPlay('beam', 300)) return; noise(1.8, 0.12, 'bandpass', 800, 1600, 0, 8); },
  win() { [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => tone('triangle', 392 * semis(s), 392 * semis(s), 0.25, 0.14, 0.01, sfxBus, i * 0.13)); },
  over() { [12, 7, 4, 0].forEach((s, i) => tone('triangle', 330 * semis(s), 330 * semis(s), 0.35, 0.13, 0.01, sfxBus, i * 0.2)); },
  ui() { if (!canPlay('ui', 40)) return; tone('sine', 880, 1100, 0.05, 0.08); },
  ring() { if (!canPlay('ring', 100)) return; tone('sine', 660, 990, 0.12, 0.1); },
  tick() { if (!canPlay('tick', 200)) return; tone('square', 1000, 1000, 0.04, 0.06); },
  crackle() { if (!canPlay('crackle', 160)) return; noise(0.05, 0.035, 'highpass', 5000, 5000); },
};

// ---- Music: a light generative pulse (bass + arpeggio), scheduled with lookahead ----
const SCALE = [0, 3, 5, 7, 10];
export function startMusic(intensity = 0) {
  if (!ctx) return;
  if (music) { music.intensity = intensity; return; }
  music = { step: 0, next: ctx.currentTime + 0.1, intensity, timer: null, bpm: 112 };
  const tick = () => {
    if (!music || !ctx) return;
    const spb = 60 / music.bpm / 2;
    while (music.next < ctx.currentTime + 0.2) {
      const s = music.step, t = music.next;
      const bar = Math.floor(s / 16) % 4;
      const root = [0, -4, 3, -2][bar];
      if (s % 4 === 0) schedTone('triangle', 55 * semis(root), 0.28, 0.16, t);
      if (s % 2 === 1 && music.intensity > 0.2) schedTone('sine', 110 * semis(root + 12), 0.12, 0.05, t);
      const deg = SCALE[(s * 3 + bar) % 5];
      if (s % 2 === 0 || music.intensity > 0.6) schedTone('square', 440 * semis(root + deg), 0.08, 0.025 + 0.02 * music.intensity, t);
      if (s % 8 === 4) schedNoise(0.05, 0.05, t);
      music.step++; music.next += spb;
    }
  };
  music.timer = setInterval(tick, 50);
  tick();
}
function schedTone(type, f, dur, peak, t) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = f;
  env(g, t, 0.005, peak, dur); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
}
function schedNoise(dur, peak, t) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
  const g = ctx.createGain(); env(g, t, 0.002, peak, dur);
  s.connect(f); f.connect(g); g.connect(musicBus); s.start(t); s.stop(t + dur + 0.05);
}
export function setMusicIntensity(i) { if (music) music.intensity = i; }
export function stopMusic() { if (music) { clearInterval(music.timer); music = null; } }
