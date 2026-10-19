import { chromium } from 'playwright';
const measure = async (page) => page.evaluate(() => new Promise((res) => { const ts = []; let last = performance.now(); const f = (t) => { ts.push(t - last); last = t; if (ts.length < 240) requestAnimationFrame(f); else res(ts.reduce((a, b) => a + b, 0) / ts.length); }; requestAnimationFrame(f); }));
for (const args of [[], ['--enable-gpu', '--use-angle=metal', '--enable-unsafe-swiftshader']]) {
  const b = await chromium.launch({ args });
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.setContent('<canvas id=c style="width:100vw;height:100vh"></canvas><script>const c=document.getElementById("c");c.width=1688;c.height=780;const x=c.getContext("2d");(function f(){x.fillStyle="#123";x.fillRect(0,0,1688,780);requestAnimationFrame(f)})()</script>');
  const cdp = await ctx.newCDPSession(p);
  const a1 = await measure(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const a4 = await measure(p);
  console.log(JSON.stringify(args), 'empty-canvas frame avg: 1x', a1.toFixed(1), 'ms, 4x', a4.toFixed(1), 'ms');
  await b.close();
}
