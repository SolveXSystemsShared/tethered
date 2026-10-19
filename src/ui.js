// DOM menus & screens. Screens are <section class="screen"> elements; buttons
// carry data-act attributes which are routed to the app's action handlers.
import { loadScript } from './net.js';

const $ = (id) => document.getElementById(id);
export { $ };

let current = null;
let toastTimer = 0;

export function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === 'scr-' + name);
  current = name;
  // move focus into the screen for keyboard users
  const first = name && document.querySelector(`#scr-${name} button:not([hidden]), #scr-${name} input`);
  if (first && matchMedia('(pointer: fine)').matches) setTimeout(() => first.focus({ preventScroll: true }), 30);
}
export function hideAll() { show(null); }
export function screen() { return current; }

export function bindActions(handler) {
  document.getElementById('ui').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    e.preventDefault();
    handler(b.dataset.act, b);
  });
}

export function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

export function setText(id, txt) { const el = $(id); if (el) el.textContent = txt; }

export function fmtTime(s) {
  s = Math.floor(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export async function renderQR(el, text) {
  try {
    await loadScript('vendor/qrcode.min.js');
    const qr = window.qrcode(0, 'M');
    qr.addData(text); qr.make();
    el.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  } catch {
    el.innerHTML = '<span style="color:#000;font:700 14px sans-serif;padding:8px">QR unavailable — use the code</span>';
  }
}

export function fillEnd(stats, info) {
  const won = stats.won;
  setText('end-title', won ? 'Victory!' : stats.mode === 'endless' ? 'Run over' : 'Game over');
  const starsEl = $('end-stars');
  if (stats.mode === 'survival' && won) {
    starsEl.innerHTML = [1, 2, 3].map((i) => `<span class="${i <= stats.stars ? 'on' : 'off'}">★</span>`).join('');
    starsEl.setAttribute('aria-label', `${stats.stars} of 3 stars`);
  } else { starsEl.innerHTML = ''; }
  setText('end-score', String(stats.score));
  const bits = [];
  if (info.newBestScore) bits.push('New best score!');
  else if (info.bestScore) bits.push(`Best ${info.bestScore}`);
  if (stats.mode === 'endless') bits.push(info.newBestWave ? 'New best wave!' : `Best wave ${info.bestWave}`);
  $('end-best').textContent = bits.join(' · ');
  let next = '';
  if (stats.mode === 'survival' && won && stats.stars < 3 && !stats.checkpoint) {
    next = stats.stars === 1 ? `2★: finish with ${info.twoLives}+ lives left` : `3★: ${info.threeLives}+ lives left and ${info.threeScore.toLocaleString()} points`;
  } else if (stats.mode === 'survival' && !won) {
    next = stats.wave >= 10 ? 'So close! Try the Warden again from the checkpoint.' : `You reached wave ${stats.wave} of 10.`;
  }
  setText('end-next', next);
  const rows = [
    ['', '<span class="p1">● Player 1</span>', '<span class="p2">◆ Player 2</span>'],
    ['Enemies cut', stats.cuts[0], stats.cuts[1]],
    ['Hits taken', stats.hits[0], stats.hits[1]],
  ];
  const team = [
    ['Best combo', stats.bestCombo],
    ['Waves survived', stats.wavesSurvived],
    ['Time played', fmtTime(stats.time)],
  ];
  $('end-stats').innerHTML =
    `<tr>${rows[0].map((c) => `<th>${c}</th>`).join('')}</tr>` +
    rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') +
    team.map(([k, v]) => `<tr><td>${k}</td><td colspan="2">${v}</td></tr>`).join('');
}

// Animated title logo: two orbs swinging a rope that spells the mood of the game.
export function startLogo() {
  const cv = $('logo'), ctx = cv.getContext('2d');
  let t = 0, raf = 0, last = performance.now();
  const draw = (now) => {
    raf = requestAnimationFrame(draw);
    if (!cv.offsetParent) return;
    t += Math.min(0.05, (now - last) / 1000); last = now;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.52;
    const a = Math.sin(t * 1.3) * 0.35;
    const L = 250 + Math.sin(t * 2.1) * 20;
    const ax = cx - Math.cos(a) * L, ay = cy - Math.sin(a) * L * 0.25 + 30;
    const bx = cx + Math.cos(a) * L, by = cy + Math.sin(a) * L * 0.25 + 30;
    const mx = cx, my = cy + 50 + Math.cos(t * 2.6) * 18;
    const g = ctx.createLinearGradient(ax, 0, bx, 0);
    g.addColorStop(0, '#56B4E9'); g.addColorStop(1, '#E69F00');
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.3; ctx.strokeStyle = g; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
    ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
    ctx.fillStyle = '#56B4E9'; ctx.beginPath(); ctx.arc(ax, ay, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ax, ay, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#E69F00'; ctx.beginPath(); ctx.moveTo(bx, by - 21); ctx.lineTo(bx + 21, by); ctx.lineTo(bx, by + 21); ctx.lineTo(bx - 21, by); ctx.closePath(); ctx.fill();
    ctx.font = `900 92px ui-rounded, 'SF Pro Rounded', 'Nunito', system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 10; ctx.strokeStyle = '#05070f'; ctx.strokeText('TETHERED', cx, H * 0.36);
    const tg = ctx.createLinearGradient(cx - 260, 0, cx + 260, 0);
    tg.addColorStop(0, '#bfe6ff'); tg.addColorStop(0.5, '#ffffff'); tg.addColorStop(1, '#ffd98a');
    ctx.fillStyle = tg; ctx.fillText('TETHERED', cx, H * 0.36);
  };
  raf = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(raf);
}
