// Capture a strip of frames from a bot demo (for eyeballing bot/game behaviour).
import { chromium } from 'playwright';
const [out, query = 'demo=strong&mode=survival', n = '8', gap = '700', skip = '3000'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 450 } });
await page.goto('http://localhost:8080/?nosw&' + query);
await page.waitForTimeout(+skip);
for (let i = 0; i < +n; i++) { await page.screenshot({ path: `${out}/strip-${i}.png` }); await page.waitForTimeout(+gap); }
await browser.close();
