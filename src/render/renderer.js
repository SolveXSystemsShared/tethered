// Canvas renderer. Draws a "view" (the host's game state, or the guest's
// interpolated copy of it — same shape) plus effects, HUD and joysticks.
// Everything is drawn in code; glow uses cached radial sprites + additive blending.
import { Particles, Floaters, Shake } from './fx.js';
import { TUT_TEXT } from '../sim/tutorial.js';

export const COLORS = {
  bg: '#0a0d1a', grid: 'rgba(120,140,255,0.06)', edge: 'rgba(150,170,255,0.35)',
  p: ['#56B4E9', '#E69F00'], pLight: ['#bfe6ff', '#ffd98a'],
  enemy: '#F08CD0', enemyFill: 'rgba(204,121,167,0.28)', enemyDark: '#3a1531',
  tele: '#F0E442', gem: '#2EE6A8', heart: '#ffffff', shot: '#FF6FB5', white: '#ffffff',
  freeze: '#9fd8ff',
};
const BG_PAD = 32; // px of background beyond the screen edge (room for screen shake)
const FONT = "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Segoe UI', system-ui, sans-serif";

const INTRO_HINT = {
  dasher: ['Dashers charge along the stripes', 'Step out of the lane!'],
  splitter: ['Splitters break into pieces', 'Sweep again to finish them!'],
  spitter: ['Spitters shoot at you', 'Your rope blocks their shots!'],
  brute: ['Brutes are armoured', 'Swing the rope FAST!'],
  boss: ['The Warden', 'Break the shields, then saw the core!'],
};
const POWER_LABEL = { mega: 'MEGA ROPE', freeze: 'FREEZE', shield: 'SHIELD', nova: 'NOVA' };

export class Renderer {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.particles = new Particles(500);
    this.floaters = new Floaters();
    this.shake = new Shake();
    this.glow = {};
    this.seen = new Map();          // entity id -> first-seen time (spawn pop-in)
    this.time = 0;
    this.banner = null;
    this.flash = 0;
    this.local = null;              // online: which player slot is "you"
    this.lowQuality = false;
    this.safe = { l: 0, r: 0, t: 0, b: 0 };
    this.showHint = 0;
    this.hatch = null;
    this.resize();
  }

  resize() {
    const dprCap = this.lowQuality ? 1 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    this.dpr = dpr;
    this.cw = innerWidth; this.ch = innerHeight;
    this.c.width = Math.round(this.cw * dpr); this.c.height = Math.round(this.ch * dpr);
    this.c.style.width = this.cw + 'px'; this.c.style.height = this.ch + 'px';
    const probe = document.getElementById('safe-probe');
    if (probe) {
      const cs = getComputedStyle(probe);
      this.safe = { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
    }
    this.bgCache = null;
  }

  // ---------- caches ----------
  glowSprite(color) {
    if (this.glow[color]) return this.glow[color];
    const s = 64, cv = document.createElement('canvas');
    cv.width = cv.height = s;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, color); gr.addColorStop(0.25, color + 'aa'); gr.addColorStop(1, color + '00');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    return (this.glow[color] = cv);
  }

  hatchPattern(ctx) {
    if (this.hatch) return this.hatch;
    const cv = document.createElement('canvas'); cv.width = cv.height = 16;
    const g = cv.getContext('2d');
    g.strokeStyle = COLORS.tele; g.lineWidth = 4;
    g.beginPath(); g.moveTo(-4, 20); g.lineTo(20, -4); g.moveTo(-4, 4); g.lineTo(4, -4); g.moveTo(12, 20); g.lineTo(20, 12); g.stroke();
    this.hatch = ctx.createPattern(cv, 'repeat');
    return this.hatch;
  }

  drawGlow(ctx, x, y, r, color, alpha = 1) {
    if (this.dbg?.noglow) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.glowSprite(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  // ---------- events -> effects ----------
  onEvent(ev, view) {
    const P = this.particles, F = this.floaters, fx = view.cfg.fx;
    switch (ev.k) {
      case 'cut': {
        const big = ev.type === 'brute' || ev.type === 'splitter' || ev.type === 'node';
        P.burst(ev.x, ev.y, big ? 18 : 11, COLORS.enemy, [150, big ? 520 : 420]);
        P.burst(ev.x, ev.y, 5, '#ffffff', [80, 220], [0.2, 0.35]);
        P.ring(ev.x, ev.y, big ? 60 : 40, COLORS.enemy, 0.25);
        this.shake.add(fx.trauma.cut);
        if (ev.combo >= 2) F.add(ev.x, ev.y - 26, ev.combo + 'x', ev.combo >= 10 ? COLORS.tele : '#ffffff', 18 + Math.min(14, ev.combo), 0.6);
        break;
      }
      case 'multi': {
        const words = { 2: 'DOUBLE SWEEP!', 3: 'TRIPLE SWEEP!' };
        F.add(ev.x, ev.y - 50, words[ev.n] || 'MEGA SWEEP!', COLORS.tele, 30, 1.1, -40);
        this.shake.add(fx.trauma.multi);
        break;
      }
      case 'milestone': {
        const w = { 10: 'NICE!', 25: 'GREAT!', 50: 'UNREAL!' }[ev.combo] || 'WOW!';
        this.setBanner(w, `${ev.combo} combo`, 1.2, COLORS.tele, true);
        break;
      }
      case 'clank': P.burst(ev.x, ev.y, 6, '#ffffff', [100, 260], [0.1, 0.25], [1, 2]); this.shake.add(fx.trauma.clank); break;
      case 'gem': {
        const col = ev.kind === 'heart' ? '#ffffff' : COLORS.gem;
        P.burst(ev.x, ev.y, ev.kind === 'shard' ? 4 : 10, col, [60, 200], [0.2, 0.4], [1.5, 3]);
        if (ev.kind === 'heart') F.add(ev.x, ev.y - 30, '+1 LIFE', '#ffffff', 26, 1.2);
        else if (ev.kind === 'prism') F.add(ev.x, ev.y - 20, '+' + view.cfg.gems.prism * (view.mult || 1), COLORS.gem, 20, 0.7);
        break;
      }
      case 'hurt': case 'hurtTut': {
        P.burst(ev.x, ev.y, 22, COLORS.p[ev.p], [200, 520], [0.3, 0.7], [2, 5]);
        P.ring(ev.x, ev.y, 110, '#ffffff', 0.35);
        this.flash = 0.18;
        this.shake.add(fx.trauma.hurt);
        if (ev.k === 'hurtTut') F.add(ev.x, ev.y - 40, 'OUCH! That costs a life', '#ffffff', 22, 1.6, -30);
        else this.hurtPulse = 0.6;
        break;
      }
      case 'pop': P.burst(ev.x, ev.y, 8, COLORS.enemy, [100, 300]); break;
      case 'shieldPop': P.ring(ev.x, ev.y, 130, COLORS.p[ev.p], 0.4); P.burst(ev.x, ev.y, 16, '#ffffff', [200, 400]); F.add(ev.x, ev.y - 40, 'SHIELD SAVED YOU!', '#ffffff', 22, 1.2); break;
      case 'block': P.burst(ev.x, ev.y, 6, COLORS.shot, [80, 200], [0.15, 0.3], [1.5, 2.5]); break;
      case 'spawn': break;
      case 'wave': {
        const total = ev.total ? ` / ${ev.total}` : '';
        const title = `WAVE ${ev.n}${total}`;
        const intro = ev.intro && INTRO_HINT[ev.intro];
        this.setBanner(title, ev.name || '', 2.2, '#ffffff');
        if (intro) this.introCard = { type: ev.intro, lines: intro, t: 4.5, max: 4.5 };
        if (ev.n === 1) this.showHint = 5;
        break;
      }
      case 'waveClear': this.setBanner('WAVE CLEAR', ev.noHit ? `No hits! +${ev.bonus}` : `+${ev.bonus}`, 2.0, COLORS.gem); break;
      case 'capsule': P.ring(ev.x, ev.y, 90, '#ffffff', 0.5); break;
      case 'capsuleGone': P.burst(ev.x, ev.y, 8, '#888888', [50, 150]); break;
      case 'power': {
        P.ring(ev.x, ev.y, 200, '#ffffff', 0.5);
        P.burst(ev.x, ev.y, 24, COLORS.tele, [200, 500]);
        const sub = { mega: 'Huge rope — cuts armour!', freeze: 'Enemies slowed!', shield: 'Next hit is blocked', nova: 'Touch orbs together to blast!' }[ev.kind];
        this.setBanner(POWER_LABEL[ev.kind], sub, 1.6, COLORS.tele, true);
        break;
      }
      case 'nova': P.ring(ev.x, ev.y, ev.r, '#ffffff', 0.5); P.ring(ev.x, ev.y, ev.r * 0.7, COLORS.tele, 0.4); P.burst(ev.x, ev.y, 40, COLORS.tele, [300, 800]); this.shake.add(fx.trauma.nova); this.flash = 0.12; break;
      case 'bossIn': this.shake.add(0.5); break;
      case 'coreOpen': this.setBanner('CORE OPEN!', 'Stretch the rope across it!', 1.6, COLORS.tele, true); break;
      case 'bossHit': P.burst(ev.x, ev.y, 4, '#ffffff', [100, 300], [0.15, 0.3]); break;
      case 'bossPhase': this.shake.add(fx.trauma.phase); P.ring(ev.x, ev.y, 260, '#ffffff', 0.6); this.setBanner('THE WARDEN IS ANGRY', ev.phase === 2 ? 'Last phase — watch the charge!' : 'New attack: the beam!', 2, '#ffffff', true); break;
      case 'bossDie': this.shake.add(fx.trauma.bossDie); P.burst(ev.x, ev.y, 80, COLORS.enemy, [200, 900], [0.5, 1.2], [2, 6]); P.burst(ev.x, ev.y, 40, '#ffffff', [100, 600], [0.4, 1]); P.ring(ev.x, ev.y, 400, '#ffffff', 0.8); this.flash = 0.3; break;
      case 'bossStun': P.burst(ev.x, ev.y, 20, '#ffffff', [100, 400]); this.shake.add(0.4); break;
      case 'tutStep': if (ev.step === 'done') this.setBanner('READY!', "Here they come…", 1.6, COLORS.gem); break;
      case 'ring': P.ring(ev.x, ev.y, 90, COLORS.gem, 0.4); break;
      case 'win': break;
    }
  }

  setBanner(title, sub, time, color = '#fff', small = false) {
    this.banner = { title, sub, t: time, max: time, color, small };
  }

  // ---------- frame ----------
  draw(view, input, dt, opts = {}) {
    const ctx = this.ctx, cfg = view.cfg;
    this.time += dt;
    this.particles.update(dt);
    this.floaters.update(dt);
    this.shake.update(dt, cfg.fx.shakeDecay);
    if (this.flash > 0) this.flash -= dt;
    if (this.hurtPulse > 0) this.hurtPulse -= dt;
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.introCard) { this.introCard.t -= dt; if (this.introCard.t <= 0) this.introCard = null; }
    if (this.showHint > 0) this.showHint -= dt;

    const { w, h } = cfg.arena;
    const s = Math.min(this.cw / w, this.ch / h);
    this.scale = s;
    const ox = (this.cw - w * s) / 2, oy = (this.ch - h * s) / 2;
    const dpr = this.dpr;
    const [sx, sy, sr] = this.shake.offset(cfg.fx.shakeMax, cfg.fx.shakeFreq);
    const D = this.dbg || {};
    // background: pre-rendered at device resolution and blitted 1:1 (scaled blits are slow)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!D.nobg) {
      const bg = this.background(view, s, ox, oy);
      ctx.drawImage(bg, Math.round(sx * s * dpr) - BG_PAD, Math.round(sy * s * dpr) - BG_PAD);
    } else { ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, this.c.width, this.c.height); }
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (ox + sx * s), dpr * (oy + sy * s));
    if (sr) { ctx.translate(w / 2, h / 2); ctx.rotate(sr); ctx.translate(-w / 2, -h / 2); }

    if (view.tut) this.drawTutorialWorld(ctx, view);
    this.drawPortals(ctx, view);
    this.drawCapsules(ctx, view);
    this.drawGems(ctx, view);
    this.drawTelegraphs(ctx, view);
    if (view.boss) this.drawBoss(ctx, view);
    if (!D.noenemies) this.drawEnemies(ctx, view);
    if (!D.norope) this.drawRope(ctx, view);
    this.drawPlayers(ctx, view);
    this.drawShots(ctx, view);
    if (!D.noparticles) this.particles.draw(ctx);
    if (!D.nofloat) this.floaters.draw(ctx, FONT);
    if (view.power.freeze > 0) { ctx.fillStyle = 'rgba(120,190,255,0.07)'; ctx.fillRect(0, 0, w, h); }

    // screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.35, this.flash * 2)})`; ctx.fillRect(0, 0, this.cw, this.ch); }
    if (input && !opts.hideSticks) this.drawSticks(ctx, input, view);
    if (opts.attract) { ctx.fillStyle = 'rgba(5,7,15,0.35)'; ctx.fillRect(0, 0, this.cw, this.ch); return; }
    if (!D.nohud) this.drawHUD(ctx, view, opts);
    if (!D.nohud) this.drawBanner(ctx, view);
  }

  background(view, s, ox, oy) {
    const W = this.c.width + BG_PAD * 2, H = this.c.height + BG_PAD * 2;
    if (this.bgCache && this.bgCache.width === W && this.bgCache.height === H) return this.bgCache;
    const { w, h } = view.cfg.arena, dpr = this.dpr;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { alpha: false });
    g.fillStyle = '#05070f'; g.fillRect(0, 0, W, H);
    g.setTransform(dpr * s, 0, 0, dpr * s, BG_PAD + dpr * ox, BG_PAD + dpr * oy);
    const gr = g.createRadialGradient(w / 2, h / 2, 100, w / 2, h / 2, w * 0.7);
    gr.addColorStop(0, '#11163a'); gr.addColorStop(1, COLORS.bg);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = COLORS.grid; g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= w; x += 75) { g.moveTo(x, 0); g.lineTo(x, h); }
    for (let y = 0; y <= h; y += 75) { g.moveTo(0, y); g.lineTo(w, y); }
    g.stroke();
    g.strokeStyle = COLORS.edge; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    return (this.bgCache = cv);
  }

  pop(id) {
    let t0 = this.seen.get(id);
    if (t0 === undefined) { t0 = this.time; this.seen.set(id, t0); if (this.seen.size > 2000) this.seen.clear(); }
    const t = (this.time - t0) / 0.18;
    if (t >= 1) return 1;
    // ease-out-back 0 -> 1.15 -> 1
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  }

  // ---------- rope ----------
  ropeCurve(view) {
    const [a, b] = view.players, R = view.rope;
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y, qx: 2 * R.mx - cx, qy: 2 * R.my - cy };
  }

  drawRope(ctx, view) {
    const R = view.rope, c = this.ropeCurve(view);
    const stretch = Math.min(1, Math.max(0, (R.len - view.cfg.rope.rest) / (R.maxLen - view.cfg.rope.rest)));
    const near = R.len > R.maxLen * 0.94;
    const width = R.width / view.cfg.rope.halfWidth;
    const path = () => {
      ctx.beginPath(); ctx.moveTo(c.ax, c.ay);
      if (near && !this.lowQuality) {
        // crackle: jittered polyline when at full stretch
        for (let i = 1; i <= 10; i++) {
          const t = i / 10, u = 1 - t;
          let x = u * u * c.ax + 2 * u * t * c.qx + t * t * c.bx, y = u * u * c.ay + 2 * u * t * c.qy + t * t * c.by;
          if (i < 10) { x += (Math.random() - 0.5) * 6; y += (Math.random() - 0.5) * 6; }
          ctx.lineTo(x, y);
        }
      } else ctx.quadraticCurveTo(c.qx, c.qy, c.bx, c.by);
    };
    ctx.lineCap = 'round';
    const grad = ctx.createLinearGradient(c.ax, c.ay, c.bx, c.by);
    grad.addColorStop(0, COLORS.p[0]); grad.addColorStop(1, COLORS.p[1]);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.22 + stretch * 0.15 + (R.flash > 0 ? 0.3 : 0);
    ctx.strokeStyle = grad; ctx.lineWidth = 18 * width; path(); ctx.stroke();
    ctx.globalAlpha = 0.6; ctx.lineWidth = 7 * width; path(); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = R.flash > 0 ? '#ffffff' : `rgba(255,255,255,${0.75 + stretch * 0.25})`;
    ctx.lineWidth = (R.flash > 0 ? 4.5 : 3) * width; path(); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    if (view.power.mega > 0) {
      ctx.setLineDash([10, 14]); ctx.lineDashOffset = -this.time * 80;
      ctx.strokeStyle = COLORS.tele; ctx.lineWidth = 2; path(); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // ---------- players ----------
  drawPlayers(ctx, view) {
    const r = view.cfg.player.radius;
    for (let i = 0; i < 2; i++) {
      const p = view.players[i], col = COLORS.p[i];
      if (p.inv > 0 && Math.floor(this.time * 10) % 2 === 0) continue;
      const sp = Math.hypot(p.vx, p.vy), st = Math.min(sp / view.cfg.player.maxSpeed, 1) * 0.22;
      const ang = Math.atan2(p.vy, p.vx);
      ctx.globalCompositeOperation = 'lighter';
      this.drawGlow(ctx, p.x, p.y, r * 3.2, col, 0.75);
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang); ctx.scale(1 + st, 1 / (1 + st)); ctx.rotate(-ang);
      if (i === 0) {
        // P1: round orb with solid core dot
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = COLORS.pLight[0]; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#0b1830'; ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fill();
      } else {
        // P2: diamond orb with hollow core + stripe
        const d = r * 1.18;
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -d); ctx.lineTo(d, 0); ctx.lineTo(0, d); ctx.lineTo(-d, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = COLORS.pLight[1]; ctx.lineWidth = 3; ctx.stroke();
        const k = d * 0.48;
        ctx.fillStyle = '#2a1800'; ctx.beginPath(); ctx.moveTo(0, -k); ctx.lineTo(k, 0); ctx.lineTo(0, k); ctx.lineTo(-k, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-k * 0.5, k * 0.5); ctx.lineTo(k * 0.5, -k * 0.5); ctx.stroke();
      }
      ctx.restore();
      if (view.power.shield > 0) {
        ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.3 * Math.sin(this.time * 6)})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 12, 0, Math.PI * 2); ctx.stroke();
      }
      if (view.power.nova > 0) {
        ctx.strokeStyle = COLORS.tele; ctx.lineWidth = 3;
        const pr = r + 10 + 6 * Math.sin(this.time * 12);
        this.star(ctx, p.x, p.y, pr + 8, pr - 2, 6, this.time * 2); ctx.stroke();
      }
      if (this.local != null && this.local === i) {
        ctx.fillStyle = '#ffffff'; ctx.font = `800 16px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText('YOU', p.x, p.y - r - 18);
      }
    }
    if (view.power.nova > 0) {
      const [a, b] = view.players;
      ctx.setLineDash([6, 10]); ctx.strokeStyle = COLORS.tele; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      this.label(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2 - 40, 'TOUCH ORBS TOGETHER!', COLORS.tele, 20);
    }
  }

  star(ctx, x, y, ro, ri, n, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i * Math.PI) / n, rr = i % 2 ? ri : ro;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  poly(ctx, x, y, r, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + (i * Math.PI * 2) / n;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  // ---------- enemies ----------
  drawEnemies(ctx, view) {
    const frozen = view.power.freeze > 0;
    ctx.globalCompositeOperation = 'lighter';
    if (!this.lowQuality) for (const e of view.enemies) this.drawGlow(ctx, e.x, e.y, e.r * 2.4, COLORS.enemy, 0.35);
    ctx.globalCompositeOperation = 'source-over';
    for (const e of view.enemies) {
      const sc = this.pop(e.id);
      const r = e.r * sc;
      const white = e.flash > 0;
      ctx.lineWidth = 3;
      ctx.strokeStyle = white ? '#ffffff' : frozen ? COLORS.freeze : COLORS.enemy;
      ctx.fillStyle = white ? '#ffffff' : COLORS.enemyFill;
      const t = this.time;
      switch (e.type) {
        case 'drifter': case 'mini':
          this.star(ctx, e.x, e.y, r * 1.15, r * 0.78, e.type === 'mini' ? 6 : 8, t * 2 + e.id);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = COLORS.enemy; ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.3, 0, Math.PI * 2); ctx.fill();
          break;
        case 'dasher': {
          ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.a);
          ctx.beginPath(); ctx.moveTo(r * 1.3, 0); ctx.lineTo(-r, r * 0.95); ctx.lineTo(-r * 0.45, 0); ctx.lineTo(-r, -r * 0.95); ctx.closePath();
          ctx.fill(); ctx.stroke(); ctx.restore();
          if (e.st === 1) this.label(ctx, e.x, e.y - r - 18, '!', COLORS.tele, 26);
          break;
        }
        case 'splitter':
          ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(t * 0.6 + e.id);
          ctx.beginPath(); ctx.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-r * 0.85, -r * 0.1); ctx.lineTo(-r * 0.2, r * 0.15); ctx.lineTo(r * 0.1, -r * 0.4); ctx.lineTo(r * 0.85, -r * 0.2);
          ctx.moveTo(-r * 0.2, r * 0.15); ctx.lineTo(0, r * 0.85); ctx.stroke(); ctx.restore();
          break;
        case 'spitter': {
          ctx.save(); ctx.translate(e.x, e.y);
          ctx.beginPath(); ctx.moveTo(0, -r * 1.25); ctx.lineTo(r * 1.05, 0); ctx.lineTo(0, r * 1.25); ctx.lineTo(-r * 1.05, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = COLORS.enemyDark; ctx.beginPath(); ctx.arc(Math.cos(e.a) * r * 0.2, Math.sin(e.a) * r * 0.2, r * 0.2, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          break;
        }
        case 'brute': case 'node': {
          const rot = e.type === 'node' ? e.a : t * 0.4 + e.id;
          this.poly(ctx, e.x, e.y, r * 1.1, 6, rot); ctx.fill(); ctx.stroke();
          // armour plates: thick white segments
          ctx.strokeStyle = white ? COLORS.tele : '#e8e8f0'; ctx.lineWidth = 5;
          for (let k = 0; k < 6; k += 2) {
            const a0 = rot + (k * Math.PI) / 3, a1 = rot + ((k + 1) * Math.PI) / 3;
            ctx.beginPath(); ctx.moveTo(e.x + Math.cos(a0) * r * 1.1, e.y + Math.sin(a0) * r * 1.1); ctx.lineTo(e.x + Math.cos(a1) * r * 1.1, e.y + Math.sin(a1) * r * 1.1); ctx.stroke();
          }
          ctx.fillStyle = COLORS.enemy; ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.35, 0, Math.PI * 2); ctx.fill();
          break;
        }
      }
    }
  }

  drawTelegraphs(ctx, view) {
    const cfg = view.cfg, pat = this.hatchPattern(ctx);
    const t = this.time;
    for (const e of view.enemies) {
      if (e.type === 'dasher' && e.st === 1) {
        const c = cfg.enemies.dasher, L = c.dashSpeed * c.dashTime + e.r;
        const prog = Math.min(1, e.tm / c.aim);
        const blink = Math.sin(t * (10 + prog * 30)) > -0.3;
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(Math.atan2(e.dy, e.dx));
        const wdt = e.r * 2 + 10;
        ctx.globalAlpha = blink ? 0.55 : 0.3;
        pat.setTransform?.(new DOMMatrix().translate(t * 40, 0));
        ctx.fillStyle = pat; ctx.fillRect(0, -wdt / 2, L, wdt);
        ctx.globalAlpha = 1; ctx.strokeStyle = COLORS.tele; ctx.lineWidth = 2;
        ctx.strokeRect(0, -wdt / 2, L, wdt);
        ctx.fillStyle = COLORS.tele; ctx.fillRect(0, -wdt / 2, L * prog, 4);
        ctx.restore();
      }
      if (e.type === 'spitter' && e.st === 1) {
        const c = cfg.enemies.spitter, prog = Math.min(1, (e.tm - (c.period - c.charge)) / c.charge);
        ctx.strokeStyle = COLORS.tele; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 10, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
        ctx.setLineDash([4, 10]); ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.dx * 320, e.y + e.dy * 320); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    }
    const b = view.boss;
    if (b) {
      const bc = cfg.boss;
      if (b.tele > 0) {
        const tot = bc.burstTele[b.phase], prog = 1 - b.tele / tot;
        ctx.strokeStyle = COLORS.tele; ctx.lineWidth = 4; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 30);
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 10 + prog * 40, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (b.beam && b.beam.st >= 1) {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.beam.ang);
        if (b.beam.st === 1) {
          ctx.globalAlpha = 0.5; pat.setTransform?.(new DOMMatrix().translate(t * 60, 0));
          ctx.fillStyle = pat; ctx.fillRect(b.r, -bc.beamWidth, 2000, bc.beamWidth * 2);
          ctx.globalAlpha = 1; ctx.strokeStyle = COLORS.tele; ctx.lineWidth = 2; ctx.strokeRect(b.r, -bc.beamWidth, 2000, bc.beamWidth * 2);
          // sweep direction arrow
          ctx.rotate(b.beam.dir * 0.25); ctx.setLineDash([8, 10]); ctx.beginPath(); ctx.moveTo(b.r, 0); ctx.lineTo(600, 0); ctx.stroke(); ctx.setLineDash([]);
        } else {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(240,228,66,0.35)'; ctx.fillRect(b.r, -bc.beamWidth * 1.6, 2000, bc.beamWidth * 3.2);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(b.r, -bc.beamWidth * 0.5, 2000, bc.beamWidth);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();
      }
      if (b.charge && b.charge.st === 1) {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.charge.dy, b.charge.dx));
        ctx.globalAlpha = 0.5; ctx.fillStyle = pat; ctx.fillRect(0, -b.r, 2000, b.r * 2);
        ctx.globalAlpha = 1; ctx.strokeStyle = COLORS.tele; ctx.lineWidth = 3; ctx.strokeRect(0, -b.r, 2000, b.r * 2);
        ctx.restore();
        this.label(ctx, b.x, b.y - b.r - 30, '!', COLORS.tele, 40);
      }
    }
  }

  drawBoss(ctx, view) {
    const b = view.boss, t = this.time, open = b.open > 0;
    ctx.globalCompositeOperation = 'lighter';
    this.drawGlow(ctx, b.x, b.y, b.r * 3, open ? '#ffffff' : COLORS.enemy, open ? 0.5 : 0.45);
    ctx.globalCompositeOperation = 'source-over';
    // tethers to shield nodes
    ctx.strokeStyle = 'rgba(240,140,208,0.35)'; ctx.lineWidth = 2;
    for (const e of view.enemies) if (e.type === 'node') { ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(e.x, e.y); ctx.stroke(); }
    const spikes = open ? 0.82 : 1.35 + 0.05 * Math.sin(t * 4);
    ctx.fillStyle = b.hitT > 0.07 ? '#ffffff' : COLORS.enemyDark;
    ctx.strokeStyle = COLORS.enemy; ctx.lineWidth = 5;
    this.star(ctx, b.x, b.y, b.r * spikes, b.r * 0.8, 10, t * 0.5); ctx.fill(); ctx.stroke();
    if (open) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.55 + 0.08 * Math.sin(t * 10)), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = COLORS.tele; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.32, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = COLORS.enemy; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e8e8f0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.48, 0, Math.PI * 2); ctx.stroke();
    }
    if (b.stun > 0) this.label(ctx, b.x, b.y - b.r - 20, 'STUNNED', '#ffffff', 18);
  }

  drawShots(ctx, view) {
    ctx.globalCompositeOperation = 'lighter';
    for (const s of view.shots) this.drawGlow(ctx, s.x, s.y, s.r * 3, COLORS.shot, 0.8);
    ctx.globalCompositeOperation = 'source-over';
    for (const s of view.shots) {
      ctx.fillStyle = COLORS.shot; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  drawPortals(ctx, view) {
    for (const p of view.portals) {
      const prog = 1 - p.t / p.max;
      ctx.strokeStyle = COLORS.enemy; ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]); ctx.lineDashOffset = this.time * 30;
      ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 30, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.lineWidth = 5; ctx.stroke();
      ctx.globalAlpha = 0.3 + prog * 0.4;
      ctx.fillStyle = COLORS.enemyFill; ctx.beginPath(); ctx.arc(p.x, p.y, 30 * prog, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  drawGems(ctx, view) {
    const t = this.time;
    ctx.globalCompositeOperation = 'lighter';
    for (const g of view.gems) this.drawGlow(ctx, g.x, g.y, g.kind === 'shard' ? 22 : 36, g.kind === 'heart' ? '#ffffff' : COLORS.gem, 0.55);
    ctx.globalCompositeOperation = 'source-over';
    for (const g of view.gems) {
      if (g.t < view.cfg.gems.blink && Math.floor(t * 8) % 2 === 0) continue;
      if (g.kind === 'heart') { this.heart(ctx, g.x, g.y, 15 + Math.sin(t * 6) * 1.5, '#ffffff'); continue; }
      const r = g.kind === 'prism' ? 15 : 9;
      ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(t * 2 + g.id);
      ctx.fillStyle = COLORS.gem; ctx.strokeStyle = '#d8fff0'; ctx.lineWidth = 2;
      if (g.kind === 'prism') { this.poly(ctx, 0, 0, r, 6, 0); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.lineTo(r, 0); ctx.lineTo(0, r * 1.3); ctx.lineTo(-r, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    }
  }

  heart(ctx, x, y, s, color, fill = true) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.4);
    ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
    ctx.closePath();
    if (fill) { ctx.fillStyle = color; ctx.fill(); } else { ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke(); }
  }

  drawCapsules(ctx, view) {
    const C = view.cfg.capsules, t = this.time;
    for (const c of view.capsules) {
      const blink = c.t < 3 && Math.floor(t * 6) % 2 === 0;
      ctx.globalAlpha = blink ? 0.4 : 1;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.setLineDash([12, 10]); ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); ctx.arc(c.x, c.y, C.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      // two half arcs: left = P1 (circle marker), right = P2 (diamond marker)
      ctx.lineWidth = 8;
      ctx.strokeStyle = c.in0 ? COLORS.p[0] : 'rgba(86,180,233,0.25)';
      ctx.beginPath(); ctx.arc(c.x, c.y, C.r + 8, Math.PI * 0.55, Math.PI * 1.45); ctx.stroke();
      ctx.strokeStyle = c.in1 ? COLORS.p[1] : 'rgba(230,159,0,0.25)';
      ctx.beginPath(); ctx.arc(c.x, c.y, C.r + 8, -Math.PI * 0.45, Math.PI * 0.45); ctx.stroke();
      ctx.fillStyle = c.in0 ? COLORS.p[0] : 'rgba(86,180,233,0.5)';
      ctx.beginPath(); ctx.arc(c.x - C.r - 26, c.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.in1 ? COLORS.p[1] : 'rgba(230,159,0,0.5)';
      const dx = c.x + C.r + 26; ctx.beginPath(); ctx.moveTo(dx, c.y - 10); ctx.lineTo(dx + 10, c.y); ctx.lineTo(dx, c.y + 10); ctx.lineTo(dx - 10, c.y); ctx.closePath(); ctx.fill();
      if (c.claim > 0) {
        ctx.strokeStyle = COLORS.tele; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(c.x, c.y, C.r - 8, -Math.PI / 2, -Math.PI / 2 + (c.claim / C.claim) * Math.PI * 2); ctx.stroke();
      }
      this.powerIcon(ctx, c.kind, c.x, c.y, 26);
      this.label(ctx, c.x, c.y + C.r + 26, 'BOTH IN!', '#ffffff', 16);
      ctx.globalAlpha = 1;
    }
  }

  powerIcon(ctx, kind, x, y, s) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = COLORS.tele; ctx.fillStyle = COLORS.tele; ctx.lineWidth = 4; ctx.lineCap = 'round';
    if (kind === 'mega') { ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-s * 0.8, s * 0.4); ctx.quadraticCurveTo(0, -s * 0.6, s * 0.8, s * 0.4); ctx.stroke(); }
    else if (kind === 'freeze') { for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-s * 0.8, 0); ctx.lineTo(s * 0.8, 0); ctx.stroke(); } }
    else if (kind === 'shield') { ctx.beginPath(); ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * 0.35, 0, Math.PI * 2); ctx.stroke(); }
    else if (kind === 'nova') { this.star(ctx, 0, 0, s * 0.85, s * 0.35, 5, -Math.PI / 2); ctx.fill(); }
    ctx.restore();
  }

  drawTutorialWorld(ctx, view) {
    const t = this.time;
    for (const r of view.tut.rings) {
      ctx.strokeStyle = r.done ? COLORS.gem : r.who === 2 ? '#ffffff' : COLORS.p[r.who];
      ctx.lineWidth = 4; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 30;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r + Math.sin(t * 4) * 3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      // marker shape for whose ring it is
      ctx.globalAlpha = 0.5;
      if (r.who === 0 || r.who === 2) { ctx.fillStyle = COLORS.p[0]; ctx.beginPath(); ctx.arc(r.x - (r.who === 2 ? 20 : 0), r.y, 10, 0, Math.PI * 2); ctx.fill(); }
      if (r.who === 1 || r.who === 2) { ctx.fillStyle = COLORS.p[1]; const x = r.x + (r.who === 2 ? 20 : 0); ctx.beginPath(); ctx.moveTo(x, r.y - 12); ctx.lineTo(x + 12, r.y); ctx.lineTo(x, r.y + 12); ctx.lineTo(x - 12, r.y); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    if (view.tut.step === 'stretch') {
      const [a, b] = view.players;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      ctx.strokeStyle = COLORS.tele; ctx.lineWidth = 4;
      for (const [p, sg] of [[a, -1], [b, 1]]) {
        const ux = dx / d * sg, uy = dy / d * sg, off = 40 + 10 * Math.sin(t * 6);
        const x = p.x + ux * off, y = p.y + uy * off;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ux * 40, y + uy * 40);
        ctx.lineTo(x + ux * 28 - uy * 12, y + uy * 28 + ux * 12); ctx.moveTo(x + ux * 40, y + uy * 40); ctx.lineTo(x + ux * 28 + uy * 12, y + uy * 28 - ux * 12); ctx.stroke();
      }
    }
  }

  label(ctx, x, y, text, color, size) {
    ctx.font = `800 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,7,15,0.85)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  // ---------- screen-space ----------
  drawSticks(ctx, input, view) {
    const R = input.R;
    const slots = input.layout === 'single' ? [0] : [0, 1];
    for (const i of slots) {
      const s = input.sticks[i];
      const pi = input.layout === 'single' ? (this.local ?? 0) : i;
      const col = COLORS.p[pi];
      if (s.active) {
        ctx.globalAlpha = 0.3; ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(s.ox, s.oy, R, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.12; ctx.fillStyle = col; ctx.fill();
        const kx = s.ox + s.vx * R, ky = s.oy + s.vy * R, kr = R * 0.42;
        ctx.globalAlpha = 0.75; ctx.fillStyle = col;
        if (pi === 0) { ctx.beginPath(); ctx.arc(kx, ky, kr, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(kx, ky - kr * 1.15); ctx.lineTo(kx + kr * 1.15, ky); ctx.lineTo(kx, ky + kr * 1.15); ctx.lineTo(kx - kr * 1.15, ky); ctx.closePath(); ctx.fill(); }
        ctx.globalAlpha = 1;
      } else if ((this.showHint > 0 || view.tut?.step === 'move') && input.anyTouch !== null && !s.used) {
        // ghost hint: a finger dragging in each zone
        const zx = input.layout === 'single' ? this.cw * 0.5 : (i === 0 ? this.cw * 0.22 : this.cw * 0.78);
        const zy = this.ch * 0.68, ph = (this.time * 0.8) % 1;
        ctx.globalAlpha = 0.35; ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(zx, zy, R, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.6; ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(zx + Math.sin(ph * Math.PI * 2) * R * 0.6, zy + Math.cos(ph * Math.PI * 2) * R * 0.3, R * 0.32, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.9;
        this.label(ctx, zx, zy + R + 22, input.layout === 'single' ? 'Drag anywhere' : (i === 0 ? 'Player 1: drag here' : 'Player 2: drag here'), '#ffffff', 15);
        ctx.globalAlpha = 1;
      }
    }
  }

  drawHUD(ctx, view, opts) {
    const S = this.safe, pad = 12;
    const L = S.l + pad, T = S.t + pad, Rr = this.cw - S.r - pad;
    const k = Math.max(0.75, Math.min(1.15, this.ch / 500));
    // lives
    if (!view.tut) {
      for (let i = 0; i < view.maxLives; i++) {
        const x = L + 14 * k + i * 30 * k, y = T + 14 * k;
        const pulse = this.hurtPulse > 0 && i === view.lives ? 1 + this.hurtPulse : 1;
        if (i < view.lives) this.heart(ctx, x, y, 10 * k * pulse, '#ffffff');
        else if (i < view.startLives || i < view.lives) this.heart(ctx, x, y, 10 * k, 'rgba(255,255,255,0.35)', false);
      }
    }
    // active powers
    let px = L + 10 * k;
    const py = T + 46 * k;
    for (const kind of ['mega', 'freeze', 'shield', 'nova']) {
      const v = view.power[kind];
      if (v > 0) {
        this.powerIcon(ctx, kind, px + 10 * k, py, 12 * k);
        ctx.font = `700 ${Math.round(12 * k)}px ${FONT}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left';
        ctx.fillText(Math.ceil(v) + 's', px + 26 * k, py + 4);
        px += 62 * k;
      }
    }
    // score + combo
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.font = `800 ${Math.round(24 * k)}px ${FONT}`; ctx.fillStyle = '#ffffff';
    ctx.fillText(String(view.score), Rr, T);
    if (view.combo >= 2) {
      ctx.font = `800 ${Math.round(16 * k)}px ${FONT}`; ctx.fillStyle = view.mult > 1 ? COLORS.tele : '#c8d0ff';
      ctx.fillText(`${view.combo} combo${view.mult > 1 ? '  ×' + view.mult : ''}`, Rr, T + 28 * k);
    }
    // wave label (top centre, beside the pause button)
    ctx.textAlign = 'center';
    if (!view.tut) {
      ctx.font = `700 ${Math.round(14 * k)}px ${FONT}`; ctx.fillStyle = 'rgba(220,226,255,0.8)';
      const total = view.mode === 'survival' ? ' / 10' : '';
      ctx.fillText(`WAVE ${view.wave}${total}`, this.cw / 2, T + 46 * k);
    } else {
      const txt = TUT_TEXT[view.tut.step] || '';
      this.label(ctx, this.cw / 2, T + 70 * k, txt, '#ffffff', Math.round(24 * k));
    }
    // boss hp
    if (view.boss) {
      const bw = Math.min(420, this.cw * 0.42), bx = this.cw / 2 - bw / 2, by = this.ch - S.b - 26;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 14);
      ctx.fillStyle = COLORS.enemy; ctx.fillRect(bx, by, bw * Math.max(0, view.boss.hp / view.boss.maxHp), 10);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + bw * 0.33, by, 2, 10); ctx.fillRect(bx + bw * 0.66, by, 2, 10);
      ctx.font = `800 ${Math.round(13 * k)}px ${FONT}`; ctx.textBaseline = 'bottom';
      ctx.fillText(view.boss.open > 0 ? 'CORE OPEN — SAW IT WITH A STRETCHED ROPE!' : 'THE WARDEN — cut the 3 armoured shields', this.cw / 2, by - 4);
    }
    if (opts.status) {
      ctx.textBaseline = 'bottom'; ctx.font = `700 ${Math.round(13 * k)}px ${FONT}`; ctx.fillStyle = COLORS.tele;
      ctx.fillText(opts.status, this.cw / 2, this.ch - S.b - 46);
    }
    ctx.textBaseline = 'alphabetic';
  }

  drawBanner(ctx, view) {
    const k = Math.max(0.7, Math.min(1.3, this.ch / 480));
    const b = this.banner;
    if (b) {
      const t = 1 - b.t / b.max;
      const a = Math.min(1, b.t * 3, t * 8);
      const sc = t < 0.1 ? 1.3 - t * 3 : 1;
      ctx.globalAlpha = a;
      const y = this.ch * (b.small ? 0.22 : 0.38);
      this.label(ctx, this.cw / 2, y, b.title, b.color, Math.round((b.small ? 34 : 48) * k * sc));
      if (b.sub) this.label(ctx, this.cw / 2, y + 40 * k, b.sub, '#dfe4ff', Math.round(20 * k));
      ctx.globalAlpha = 1;
    }
    const c = this.introCard;
    if (c) {
      const a = Math.min(1, c.t * 2, (c.max - c.t) * 4);
      const w = 300 * k, h = 92 * k, x = this.cw / 2 - w / 2, y = this.ch * 0.56;
      ctx.globalAlpha = a * 0.92;
      ctx.fillStyle = 'rgba(12,16,40,0.92)'; ctx.strokeStyle = COLORS.tele; ctx.lineWidth = 2;
      this.roundRect(ctx, x, y, w, h, 14); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = a;
      // pictogram: the enemy shape
      const fake = { id: -1, type: c.type === 'boss' ? 'node' : c.type, x: 0, y: 0, r: 20 * k, a: 0, st: 0, flash: 0 };
      ctx.save(); ctx.translate(x + 50 * k, y + h / 2);
      const view2 = { power: { freeze: 0 }, enemies: [fake] };
      this.seen.set(-1, -10);
      if (c.type === 'boss') { ctx.fillStyle = COLORS.enemyDark; ctx.strokeStyle = COLORS.enemy; ctx.lineWidth = 3; this.star(ctx, 0, 0, 30 * k, 20 * k, 10, this.time); ctx.fill(); ctx.stroke(); }
      else this.drawEnemies(ctx, view2);
      ctx.restore();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(17 * k)}px ${FONT}`; ctx.fillStyle = '#ffffff';
      ctx.fillText(c.lines[0], x + 92 * k, y + h * 0.36, w - 100 * k);
      ctx.font = `700 ${Math.round(15 * k)}px ${FONT}`; ctx.fillStyle = COLORS.tele;
      ctx.fillText(c.lines[1], x + 92 * k, y + h * 0.66, w - 100 * k);
      ctx.globalAlpha = 1;
    }
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
}
