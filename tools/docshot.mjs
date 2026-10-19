// Render textutil-converted HTML of a .docx for a quick visual check.
import { chromium } from 'playwright';
const [file, out] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 800, height: 1100 } });
await p.goto('file://' + file);
await p.screenshot({ path: out, fullPage: true });
await b.close();
