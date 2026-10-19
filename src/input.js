// Input: floating virtual joysticks (Pointer Events, per-pointer ownership by
// screen half) + keyboard fallback (P1 = WASD, P2 = arrows).
import { CONFIG } from './config.js';

function makeStick() {
  return { pointerId: null, ox: 0, oy: 0, x: 0, y: 0, vx: 0, vy: 0, active: false, fade: 0, used: false };
}

export class Input {
  constructor(el) {
    this.el = el;
    this.layout = 'split';      // 'split' (same device) | 'single' (online: one stick, whole screen)
    this.sticks = [makeStick(), makeStick()];
    this.owners = new Map();
    this.keys = new Set();
    this.enabled = true;
    this.anyTouch = false;
    this.R = 60;
    const opts = { passive: false };
    el.addEventListener('pointerdown', (e) => this.down(e), opts);
    el.addEventListener('pointermove', (e) => this.move(e), opts);
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, (e) => this.up(e), opts);
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; this.keys.delete(k); });
    const reset = () => this.releaseAll();
    window.addEventListener('blur', reset);
    window.addEventListener('pagehide', reset);
    window.addEventListener('orientationchange', reset);
    document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const c = CONFIG.input;
    this.R = Math.max(c.radiusMin, Math.min(c.radiusMax, c.radiusFrac * Math.min(innerWidth, innerHeight)));
  }

  setLayout(l) { this.layout = l; this.releaseAll(); }

  releaseAll() {
    for (const s of this.sticks) { s.pointerId = null; s.active = false; s.vx = s.vy = 0; }
    this.owners.clear();
    this.keys.clear();
  }

  down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    this.anyTouch = this.anyTouch || e.pointerType === 'touch';
    const idx = this.layout === 'single' ? 0 : (e.clientX < innerWidth / 2 ? 0 : 1);
    const s = this.sticks[idx];
    if (s.pointerId !== null) return; // a second finger in your zone can't steal your stick
    const R = this.R, m = 8;
    const minX = this.layout === 'single' ? R + m : idx === 0 ? R + m : innerWidth / 2 + R * 0.3;
    const maxX = this.layout === 'single' ? innerWidth - R - m : idx === 0 ? innerWidth / 2 - R * 0.3 : innerWidth - R - m;
    s.pointerId = e.pointerId; s.active = true; s.used = true;
    s.ox = Math.min(Math.max(e.clientX, minX), maxX);
    s.oy = Math.min(Math.max(e.clientY, R + m), innerHeight - R - m);
    s.x = e.clientX; s.y = e.clientY;
    this.owners.set(e.pointerId, idx);
    try { this.el.setPointerCapture(e.pointerId); } catch { /* */ }
    this.compute(s);
  }

  move(e) {
    const idx = this.owners.get(e.pointerId);
    if (idx == null) return;
    e.preventDefault();
    const s = this.sticks[idx];
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    const last = evs && evs.length ? evs[evs.length - 1] : e;
    s.x = last.clientX; s.y = last.clientY;
    this.compute(s);
  }

  up(e) {
    const idx = this.owners.get(e.pointerId);
    if (idx == null) return;
    const s = this.sticks[idx];
    s.pointerId = null; s.active = false; s.vx = s.vy = 0;
    this.owners.delete(e.pointerId);
  }

  compute(s) {
    const R = this.R, dz = CONFIG.input.deadZone * R;
    let dx = s.x - s.ox, dy = s.y - s.oy;
    let d = Math.hypot(dx, dy);
    if (d > R) { // follow mode: drag the base along behind the finger
      const k = (d - R) / d;
      s.ox += dx * k; s.oy += dy * k;
      dx = s.x - s.ox; dy = s.y - s.oy; d = R;
    }
    if (d < dz) { s.vx = s.vy = 0; return; }
    const m = Math.min(1, (d - dz) / (R * 0.92 - dz)); // outer 8% saturates
    s.vx = (dx / d) * m; s.vy = (dy / d) * m;
  }

  keyVec(set) {
    const K = this.keys;
    let x = 0, y = 0;
    if (set === 0) { if (K.has('a')) x--; if (K.has('d')) x++; if (K.has('w')) y--; if (K.has('s')) y++; }
    else { if (K.has('ArrowLeft')) x--; if (K.has('ArrowRight')) x++; if (K.has('ArrowUp')) y--; if (K.has('ArrowDown')) y++; }
    const l = Math.hypot(x, y);
    return l ? [x / l, y / l] : [0, 0];
  }

  // Returns the stick vector for player slot i (0/1). In single layout, slot 0 is "me".
  get(i) {
    const s = this.sticks[i];
    if (this.layout === 'single') {
      if (i !== 0) return { x: 0, y: 0 };
      const a = this.keyVec(0), b = this.keyVec(1);
      const kx = a[0] + b[0], ky = a[1] + b[1];
      if (kx || ky) { const l = Math.hypot(kx, ky); return { x: kx / l, y: ky / l }; }
      return { x: s.vx, y: s.vy };
    }
    const k = this.keyVec(i);
    if (k[0] || k[1]) return { x: k[0], y: k[1] };
    return { x: s.vx, y: s.vy };
  }
}
