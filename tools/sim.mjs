// Headless difficulty simulation: bot pairs play many runs of each mode in parallel.
// Usage: node tools/sim.mjs [--runs 200] [--modes survival,endless] [--skills weak,average,strong]
//                           [--override '{"enemies":{"drifter":{"speed":70}}}'] [--json out.json] [--seed 1000]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { writeFileSync } from 'node:fs';
import { cloneConfig, applyOverrides } from '../src/config.js';
import { createGame, stepGame, gameStats } from '../src/sim/game.js';
import { Bot, pairBots } from '../src/sim/bots.js';

const MAX_TIME = { survival: 30 * 60, endless: 40 * 60 };

function runOne(mode, skill, seed, overrides) {
  const cfg = applyOverrides(cloneConfig(), overrides);
  const g = createGame(cfg, { mode, seed, noHitstop: true });
  const bots = pairBots(new Bot(g, 0, skill, seed), new Bot(g, 1, skill, seed + 99991));
  const hitsBy = {};
  const waveTimes = [];
  let lastWave = g.wave, waveStart = 0;
  const maxSteps = MAX_TIME[mode] / cfg.dt;
  for (let n = 0; !g.over && n < maxSteps; n++) {
    stepGame(g, [bots[0].update(cfg.dt), bots[1].update(cfg.dt)], cfg.dt);
    for (const e of g.events) if (e.k === 'hurt') hitsBy[e.src] = (hitsBy[e.src] || 0) + 1;
    g.events.length = 0;
    if (g.wave !== lastWave) { waveTimes.push(+(g.time - waveStart).toFixed(1)); waveStart = g.time; lastWave = g.wave; }
  }
  const st = gameStats(g);
  return { mode, skill, seed, won: st.won, stars: st.stars, score: st.score, wave: st.wave, waves: st.wavesSurvived, time: +st.time.toFixed(1), lives: st.lives, bestCombo: st.bestCombo, hitsBy, waveTimes, timeout: !g.over };
}

if (!isMainThread) {
  const { jobs, overrides } = workerData;
  const out = [];
  for (const j of jobs) out.push(runOne(j.mode, j.skill, j.seed, overrides));
  parentPort.postMessage(out);
} else {
  const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
  const runs = +(args.runs || 200);
  const modes = (args.modes || 'survival,endless').split(',');
  const skills = (args.skills || 'weak,average,strong').split(',');
  const overrides = args.override ? JSON.parse(args.override) : {};
  const seed0 = +(args.seed || 1000);
  const jobs = [];
  for (const mode of modes) for (const skill of skills) for (let r = 0; r < runs; r++) jobs.push({ mode, skill, seed: seed0 + r * 7 });
  const nw = Math.max(1, Math.min(cpus().length - 1, 12));
  const chunks = Array.from({ length: nw }, () => []);
  jobs.forEach((j, i) => chunks[i % nw].push(j));
  const t0 = Date.now();
  const results = (await Promise.all(chunks.map((c) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { jobs: c, overrides } });
    w.on('message', res); w.on('error', rej);
  })))).flat();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const report = summarise(results, modes, skills);
  console.log(report.text);
  console.log(`(${results.length} runs in ${secs}s on ${nw} workers)`);
  if (args.json) writeFileSync(args.json, JSON.stringify({ overrides, summary: report.summary, results }, null, 1));
}

function pct(arr, p) { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
function fmt(t) { return `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`; }

function summarise(results, modes, skills) {
  const lines = [], summary = {};
  for (const mode of modes) {
    lines.push(`\n=== ${mode.toUpperCase()} ===`);
    for (const skill of skills) {
      const R = results.filter((r) => r.mode === mode && r.skill === skill);
      if (!R.length) continue;
      const n = R.length;
      const hits = {};
      for (const r of R) for (const [k, v] of Object.entries(r.hitsBy)) hits[k] = (hits[k] || 0) + v;
      const hitStr = Object.entries(hits).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / n).toFixed(1)}`).join(', ');
      if (mode === 'survival') {
        const won = R.filter((r) => r.won).length;
        const stars = [1, 2, 3].map((s) => R.filter((r) => r.won && r.stars === s).length);
        const reach = Array.from({ length: 10 }, (_, i) => R.filter((r) => r.wave >= i + 1).length / n);
        const waveDist = Array.from({ length: 10 }, (_, i) => R.filter((r) => !r.won && r.wave === i + 1).length);
        const s = {
          n, clearRate: won / n, stars, reachWave4: reach[3], medianWave: pct(R.map((r) => r.wave), 0.5),
          medianTime: pct(R.map((r) => r.time), 0.5), winTime: won ? pct(R.filter((r) => r.won).map((r) => r.time), 0.5) : 0,
          medianScoreWin: won ? pct(R.filter((r) => r.won).map((r) => r.score), 0.5) : 0, p90ScoreWin: won ? pct(R.filter((r) => r.won).map((r) => r.score), 0.9) : 0,
          reach, waveDist, hits,
        };
        summary[`${mode}.${skill}`] = s;
        lines.push(`${skill.padEnd(8)} clear ${(s.clearRate * 100).toFixed(0)}%  stars 1/2/3 = ${stars.join('/')}  reach≥4 ${(s.reachWave4 * 100).toFixed(0)}%  median wave ${s.medianWave}  median time ${fmt(s.medianTime)}  win time ${fmt(s.winTime)}  win score med ${s.medianScoreWin} p90 ${s.p90ScoreWin}`);
        lines.push(`         died on wave 1..10: ${waveDist.join(' ')}   | hits/run: ${hitStr}`);
      } else {
        const times = R.map((r) => r.time), waves = R.map((r) => r.waves);
        const s = {
          n, medianTime: pct(times, 0.5), p10Time: pct(times, 0.1), p90Time: pct(times, 0.9),
          over15: R.filter((r) => r.time > 900).length / n, min3waves: R.filter((r) => r.waves >= 3).length / n,
          medianWaves: pct(waves, 0.5), p90Waves: pct(waves, 0.9), medianScore: pct(R.map((r) => r.score), 0.5), timeouts: R.filter((r) => r.timeout).length, hits,
        };
        summary[`${mode}.${skill}`] = s;
        lines.push(`${skill.padEnd(8)} time median ${fmt(s.medianTime)} (p10 ${fmt(s.p10Time)}, p90 ${fmt(s.p90Time)})  >15min ${(s.over15 * 100).toFixed(1)}%  ≥3 waves ${(s.min3waves * 100).toFixed(0)}%  waves median ${s.medianWaves} p90 ${s.p90Waves}  score med ${s.medianScore}${s.timeouts ? '  TIMEOUTS ' + s.timeouts : ''}`);
        lines.push(`         hits/run: ${hitStr}`);
      }
    }
  }
  return { text: lines.join('\n'), summary };
}
