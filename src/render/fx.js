// Visual effects: pooled particles, floating text, trauma-based screen shake.

export class Particles {
  constructor(max) {
    this.max = max;
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', kind: 0, drag: 0.9 });
    this.cursor = 0;
  }
  spawn(x, y, vx, vy, life, size, color, kind = 0, drag = 4) {
    // ring buffer: reuse the oldest slot when full (never allocates)
    const q = this.p[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    q.on = true; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.life = life; q.max = life; q.size = size; q.color = color; q.kind = kind; q.drag = drag;
  }
  burst(x, y, n, color, speed = [150, 400], life = [0.3, 0.6], size = [2, 4]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed[0] + Math.random() * (speed[1] - speed[0]);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, life[0] + Math.random() * (life[1] - life[0]), size[0] + Math.random() * (size[1] - size[0]), color, 0);
    }
  }
  ring(x, y, r, color, life = 0.3) { this.spawn(x, y, r, 0, life, 3, color, 1, 0); }
  update(dt) {
    for (const q of this.p) {
      if (!q.on) continue;
      q.life -= dt;
      if (q.life <= 0) { q.on = false; continue; }
      if (q.kind === 0) {
        const f = Math.exp(-q.drag * dt);
        q.vx *= f; q.vy *= f; q.x += q.vx * dt; q.y += q.vy * dt;
      }
    }
  }
  draw(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const q of this.p) {
      if (!q.on) continue;
      const t = q.life / q.max;
      ctx.globalAlpha = Math.min(1, t * 1.6);
      if (q.kind === 0) {
        ctx.strokeStyle = q.color; ctx.lineWidth = q.size; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03); ctx.stroke();
      } else {
        const r = q.vx * (1 - t * t) + 4; // vx holds target radius
        ctx.strokeStyle = q.color; ctx.lineWidth = q.size * t + 1;
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

export class Floaters {
  constructor() { this.list = []; }
  add(x, y, text, color = '#fff', size = 22, life = 0.9, vy = -60) {
    if (this.list.length > 40) this.list.shift();
    this.list.push({ x, y, text, color, size, life, max: life, vy });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.life -= dt; f.y += f.vy * dt;
      if (f.life <= 0) this.list.splice(i, 1);
    }
  }
  draw(ctx, font) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of this.list) {
      const t = f.life / f.max;
      const pop = t > 0.85 ? 1 + (t - 0.85) * 3 : 1;
      ctx.globalAlpha = Math.min(1, t * 2.5);
      ctx.font = `800 ${Math.round(f.size * pop)}px ${font}`;
      ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(5,7,15,0.85)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
}

// Eiserloh-style trauma shake with smooth (sum-of-sines) noise.
export class Shake {
  constructor() { this.trauma = 0; this.t = 0; this.enabled = true; }
  add(a) { if (this.enabled) this.trauma = Math.min(1, this.trauma + a); }
  update(dt, decay) { this.t += dt; this.trauma = Math.max(0, this.trauma - decay * dt); }
  offset(max, freq) {
    const s = this.trauma * this.trauma;
    if (s <= 0) return [0, 0, 0];
    const t = this.t * freq;
    const n = (a, b) => Math.sin(t * a + b) * 0.6 + Math.sin(t * a * 2.3 + b * 1.7) * 0.4;
    return [max * s * n(1.0, 0.3), max * s * n(1.13, 2.1), 0.03 * s * n(0.91, 4.2)];
  }
}
