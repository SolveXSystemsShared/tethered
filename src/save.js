// Saved data: settings, progress and best scores in localStorage.
// Every access is wrapped — private mode / blocked storage must never break the game.
const KEY = 'tethered.save.v1';

const DEFAULTS = {
  v: 1,
  settings: { muted: false, shake: true, assist: false },
  progress: { tutorialDone: false },
  best: {
    survival: { stars: 0, score: 0, cleared: false, bestWave: 0 },
    endless: { score: 0, wave: 0, time: 0 },
  },
  plays: 0,
};

let data = null;

function merge(base, over) {
  if (!over || typeof over !== 'object') return structuredCloneSafe(base);
  const out = Array.isArray(base) ? [] : {};
  for (const k of Object.keys(base)) {
    out[k] = base[k] && typeof base[k] === 'object' ? merge(base[k], over[k]) : (over[k] ?? base[k]);
  }
  return out;
}
function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }

export function load() {
  if (data) return data;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { raw = null; }
  data = merge(DEFAULTS, raw);
  return data;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full or blocked */ }
}

export function settings() { return load().settings; }
export function setSetting(k, v) { load().settings[k] = v; save(); }
export function progress() { return load().progress; }
export function setProgress(k, v) { load().progress[k] = v; save(); }
export function best() { return load().best; }

// Records a finished run; returns { newBest: bool } flags for the UI.
export function recordRun(stats) {
  const d = load();
  d.plays++;
  const out = { newBestScore: false, newBestWave: false, newStars: false };
  if (stats.mode === 'survival') {
    const b = d.best.survival;
    if (stats.score > b.score) { b.score = stats.score; out.newBestScore = true; }
    if (stats.wave > b.bestWave) { b.bestWave = stats.wave; out.newBestWave = true; }
    if (stats.won) { b.cleared = true; if (stats.stars > b.stars) { b.stars = stats.stars; out.newStars = true; } }
  } else {
    const b = d.best.endless;
    if (stats.score > b.score) { b.score = stats.score; out.newBestScore = true; }
    if (stats.wavesSurvived > b.wave) { b.wave = stats.wavesSurvived; out.newBestWave = true; }
    if (stats.time > b.time) b.time = stats.time;
  }
  save();
  return out;
}

// Session-scoped data for rejoining an online game after a reload.
export function sessionGet(k) { try { return JSON.parse(sessionStorage.getItem('tethered.' + k) || 'null'); } catch { return null; } }
export function sessionSet(k, v) { try { sessionStorage.setItem('tethered.' + k, JSON.stringify(v)); } catch { /* ignore */ } }
export function sessionDel(k) { try { sessionStorage.removeItem('tethered.' + k); } catch { /* ignore */ } }
