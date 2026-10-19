// Platform helpers: wake lock, fullscreen, orientation lock, haptics, gesture suppression.
// Everything feature-detects and fails silently.

let wakeLock = null;
let wantWake = false;

export async function keepAwake(on) {
  wantWake = on;
  if (!on) { try { await wakeLock?.release(); } catch { /* */ } wakeLock = null; return; }
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { wakeLock = null; }
}
export function wakeLockActive() { return !!wakeLock; }

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantWake) keepAwake(true);
});

export function fullscreenSupported() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen) && document.fullscreenEnabled !== false;
}
export function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

export async function toggleFullscreen() {
  try {
    if (isFullscreen()) { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); return false; }
    const el = document.documentElement;
    await (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
    try { await screen.orientation?.lock?.('landscape'); } catch { /* not supported (iOS) or not allowed */ }
    return true;
  } catch { return false; }
}

// Haptics. navigator.vibrate is Android-only; iOS silently has none.
let lastBuzz = 0;
export function buzz(pattern, minGap = 0) {
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  const now = performance.now();
  if (now - lastBuzz < minGap) return;
  lastBuzz = now;
  try { navigator.vibrate?.(pattern); } catch { /* */ }
}

export function suppressBrowserGestures() {
  const stop = (e) => e.preventDefault();
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, stop, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
  document.addEventListener('contextmenu', stop);
  // block scroll/zoom on the game surface, but allow normal touches on form fields/buttons
  document.addEventListener('touchmove', (e) => { if (!e.target.closest?.('.scroll')) e.preventDefault(); }, { passive: false });
}

export function isPortrait() { return window.innerHeight > window.innerWidth * 1.05; }
export function isTouch() { return (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window; }
