// Print page errors for a URL query (quick debugging aid).
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 844, height: 390 } });
p.on('pageerror', (e) => console.log('pageerror:', e.message, e.stack?.split('\n')[1]));
p.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
await p.goto('http://localhost:8080/?nosw&' + (process.argv[2] || ''));
await p.waitForTimeout(+(process.argv[3] || 2000));
await b.close();
