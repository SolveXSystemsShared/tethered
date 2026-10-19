// Draws the app icon in a canvas (headless Chromium) and saves PNGs. No image assets.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch();
const page = await browser.newPage();
const draw = async (size, maskable) => page.evaluate(([size, maskable]) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const s = size / 512;
  g.scale(s, s);
  const bg = g.createRadialGradient(256, 230, 40, 256, 256, 360);
  bg.addColorStop(0, '#1b2260'); bg.addColorStop(1, '#0a0d1a');
  g.fillStyle = bg;
  if (maskable) g.fillRect(0, 0, 512, 512);
  else { g.beginPath(); g.roundRect(16, 16, 480, 480, 110); g.fill(); }
  const k = maskable ? 0.78 : 1; g.translate(256, 256); g.scale(k, k); g.translate(-256, -256);
  const ax = 120, ay = 320, bx = 392, by = 192, qx = 256, qy = 380;
  const grad = g.createLinearGradient(ax, 0, bx, 0); grad.addColorStop(0, '#56B4E9'); grad.addColorStop(1, '#E69F00');
  g.lineCap = 'round';
  g.globalAlpha = 0.35; g.strokeStyle = grad; g.lineWidth = 46; g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(qx, qy, bx, by); g.stroke();
  g.globalAlpha = 1; g.strokeStyle = '#fff'; g.lineWidth = 14; g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(qx, qy, bx, by); g.stroke();
  // enemy being cut
  g.strokeStyle = '#F08CD0'; g.fillStyle = 'rgba(204,121,167,0.35)'; g.lineWidth = 10;
  g.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r = i % 2 ? 34 : 50; g.lineTo(262 + Math.cos(a) * r, 300 + Math.sin(a) * r - 60 + 60 * 0); } g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#56B4E9'; g.beginPath(); g.arc(ax, ay, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0b1830'; g.beginPath(); g.arc(ax, ay, 28, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(ax, ay, 14, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#E69F00'; g.beginPath(); g.moveTo(bx, by - 74); g.lineTo(bx + 74, by); g.lineTo(bx, by + 74); g.lineTo(bx - 74, by); g.closePath(); g.fill();
  g.fillStyle = '#2a1800'; g.beginPath(); g.moveTo(bx, by - 34); g.lineTo(bx + 34, by); g.lineTo(bx, by + 34); g.lineTo(bx - 34, by); g.closePath(); g.fill();
  return c.toDataURL('image/png');
}, [size, maskable]);
for (const [name, size, mask] of [['icon-192', 192, false], ['icon-512', 512, false], ['maskable-512', 512, true]]) {
  const url = await draw(size, mask);
  writeFileSync(new URL(`../icons/${name}.png`, import.meta.url), Buffer.from(url.split(',')[1], 'base64'));
}
await browser.close();
console.log('icons written');
