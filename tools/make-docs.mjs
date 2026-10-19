// Builds the three Word documents in deliverables/ from the live config,
// the final simulation results (sim-out/sim-final.json) and docs/review.json.
// Usage: node tools/make-docs.mjs [simJson] [siteUrl]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType,
  AlignmentType, LevelFormat, BorderStyle, Footer, PageNumber, ExternalHyperlink,
} from 'docx';
import { CONFIG, SURVIVAL_WAVES } from '../src/config.js';
import { BOT_SKILLS } from '../src/sim/bots.js';

const simPath = process.argv[2] || 'sim-out/sim-final.json';
const SITE = process.argv[3] || 'https://<your-site>/';
const sim = existsSync(simPath) ? JSON.parse(readFileSync(simPath, 'utf8')) : null;
const review = existsSync('docs/review.json') ? JSON.parse(readFileSync('docs/review.json', 'utf8')) : { issues: [], rerun: null };
mkdirSync('deliverables', { recursive: true });

// ---------- tiny document DSL ----------
const FONT = 'Calibri';
const ACCENT = '1F4E79';
const runs = (text, base = {}) => {
  // **bold** segments
  const out = [];
  String(text).split(/(\*\*[^*]+\*\*)/).forEach((seg) => {
    if (!seg) return;
    if (seg.startsWith('**')) out.push(new TextRun({ text: seg.slice(2, -2), bold: true, ...base }));
    else out.push(new TextRun({ text: seg, ...base }));
  });
  return out;
};
const P = (text, opts = {}) => new Paragraph({ children: runs(text, opts.run || {}), spacing: { after: 120, line: 276 }, ...opts.para });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)], spacing: { before: 240, after: 120 } });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)], spacing: { before: 200, after: 80 } });
const B = (text, level = 0) => new Paragraph({ numbering: { reference: 'bullets', level }, children: runs(text), spacing: { after: 60, line: 264 } });
const N = (text) => new Paragraph({ numbering: { reference: 'steps', level: 0 }, children: runs(text), spacing: { after: 60, line: 264 } });
const TITLE = (t, sub) => [
  new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 48, color: ACCENT })], spacing: { after: 60 } }),
  ...(sub ? [new Paragraph({ children: [new TextRun({ text: sub, size: 24, color: '595959' })], spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT, space: 6 } } })] : []),
];

const PAGE_W = 11906 - 2 * 1134; // A4 width minus 2cm margins (DXA)
function T(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const ws = widths.map((w) => Math.round((w / total) * PAGE_W));
  ws[ws.length - 1] += PAGE_W - ws.reduce((a, b) => a + b, 0);
  const cell = (text, i, head) => new TableCell({
    width: { size: ws[i], type: WidthType.DXA },
    shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'DCE6F1' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: runs(String(text), head ? { bold: true, size: 19 } : { size: 19 }), spacing: { after: 0 } })],
  });
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: ws,
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }), ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i, false)) }))],
  });
}
const SP = () => new Paragraph({ children: [], spacing: { after: 80 } });

function doc(children, title) {
  return new Document({
    creator: 'Tethered', title,
    styles: {
      default: { document: { run: { font: FONT, size: 21 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, color: ACCENT, font: FONT }, paragraph: { outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, color: '2E2E2E', font: FONT }, paragraph: { outlineLevel: 1 } },
      ],
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } }, { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 800, hanging: 260 } } } }] },
        { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 300 } } } }] },
      ],
    },
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${title} · page `, size: 16, color: '808080' }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '808080' })] })] }) },
      children,
    }],
  });
}
async function save(d, file) { writeFileSync(file, await Packer.toBuffer(d)); console.log('wrote', file); }

// ---------- shared facts ----------
const C = CONFIG;
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
const pct = (x) => `${Math.round(x * 100)}%`;
const ENEMY_ROWS = [
  ['Drifter', 'Spiky circle', 'Drifts toward the nearest orb.', 'Any touch of the rope.'],
  ['Dasher', 'Arrowhead', 'Stops, shows a striped yellow lane with a "!", then charges along it.', 'Step out of the lane — or hold the rope across it.'],
  ['Splitter', 'Cracked square', 'Big and slow; breaks into three small pieces when cut.', 'Sweep again to finish the pieces.'],
  ['Spitter', 'Diamond with an eye', 'Keeps its distance and fires slow shots; holds fire when you get close.', 'Your rope blocks shots. Rush it together.'],
  ['Brute', 'Armoured hexagon', 'Heavy. A slow rope bounces off and knocks a plate loose.', 'Swing the rope fast (one anchors, one swings) — or hit it until the armour falls off.'],
];
const POWER_ROWS = [
  ['Mega Rope', 'Thick curve', `${C.power.mega.time} s: thicker, longer rope that cuts armour.`],
  ['Freeze', 'Snowflake', `${C.power.freeze.time} s: enemies and shots move at ${Math.round(C.power.freeze.factor * 100)}% speed.`],
  ['Shield', 'Double ring', `Blocks the next hit on either orb (lasts up to ${C.power.shield.time} s).`],
  ['Nova', 'Star', `Armed for ${C.power.nova.arm} s: touch your orbs together to blast every nearby enemy.`],
];

// ======================= 1. PLAYER GUIDE =======================
async function playerGuide() {
  const ch = [
    ...TITLE('Tethered — Player Guide', 'Two orbs. One rope. Cut through everything — together.'),
    P(`Tethered is a co-op action game for two players aged 10+. You each steer a glowing orb — **Player 1 is the blue circle**, **Player 2 is the orange diamond** — and the two orbs are joined by an elastic energy rope. **Enemies that touch the rope are destroyed. Enemies that touch an orb cost the team one shared life.** Move together to sweep the rope through enemies, grab gems and power-ups, and survive. A game lasts about 5–15 minutes.`),
    P(`Play in your browser: **${SITE}** — no download or account needed. Tip: add it to your home screen to play fullscreen (and offline on one device).`),
    H1('Controls'),
    H2('Same device (two players, one phone or tablet)'),
    B('Hold the phone sideways. **Player 1 uses the left half of the screen, Player 2 the right half.**'),
    B('Put your thumb down anywhere on your half and drag — a joystick appears under your thumb. Drag further to go faster. Let go to stop.'),
    B('Each joystick belongs to the thumb that started it, so crossing the middle of the screen is fine.'),
    B('On a computer: **Player 1 = W A S D, Player 2 = arrow keys.**'),
    H2('Two phones'),
    B('Each phone has one joystick: drag anywhere on the screen. Your orb is labelled **YOU**.'),
    H2('Buttons'),
    B('**Pause** (top middle). In two-phone games either player can pause; both phones see it.'),
    B('**Skip tutorial ›** (bottom right) appears during the tutorial.'),
    B('Title screen: **sound on/off** (remembered), **fullscreen** (where the phone supports it), **Settings** (sound, screen shake, Assist mode), **How to play** (replays the tutorial).'),
    H1('Two ways to play'),
    H2('1. On this device'),
    N('Tap **Play on this device**.'),
    N('Pick **Survival** or **Endless**.'),
    N('The first time, a short interactive tutorial starts. Do what it says — move into your ring, move together, stretch the rope, sweep an enemy, grab the gem. You can skip it.'),
    H2('2. On two phones'),
    N('Both phones open the game. Ideally both are on the **same Wi-Fi**.'),
    N('Phone A taps **Play on two phones → Host a game**. It shows a **QR code**, a **link** (Copy / Share) and a **5-letter code**.'),
    N('Phone B scans the QR code with its camera (or opens the shared link) and joins straight away. Or tap **Play on two phones → Join a game** and type the code.'),
    N('When “Partner connected!” appears, the host picks the mode. Both phones start together.'),
    H1('Game modes'),
    B(`**Survival** — ${SURVIVAL_WAVES.length} hand-designed waves. Each new enemy type arrives on its own first, with a picture card explaining it. Wave 10 is the boss, **The Warden**. You start with ${C.lives.survival} shared lives and pick up hearts between later waves. Clear it to win **1–3 stars**: ★ win · ★★ win with ${C.stars.twoLives}+ lives left · ★★★ win with ${C.stars.threeLives}+ lives left and ${C.stars.threeScore.toLocaleString()}+ points. Lost to the boss? **Retry the Warden** restarts at wave 10 (worth 1 star).`),
    B('**Endless** — the waves never stop and keep getting faster and busier. Aim for your best score and furthest wave (both are saved on the phone).'),
    H1('What’s on screen'),
    T(['Enemy', 'Looks like', 'What it does', 'How to beat it'], ENEMY_ROWS, [14, 16, 36, 34]),
    SP(),
    B('**The Warden (boss):** three armoured shields circle it. Cut all three to open its core. While the core is open the Warden stops attacking — **stretch the rope tight across the core** (stand on opposite sides) to damage it. Watch for yellow striped warnings: a swelling ring (burst of shots), a striped beam, and a striped lane (charge).'),
    B('**Yellow stripes and “!” always mean danger is coming** — get out of the striped area.'),
    B('**Gems** (green diamonds) drop from cut enemies — touch them with either orb for points. Big gems are worth more. **White hearts** give back a life. Gems blink before they vanish.'),
    B('**Link capsules** (white dashed ring with an icon): **both orbs must stand inside the ring** for a moment to unlock the power-up. The two half-arcs show who is inside.'),
    T(['Power-up', 'Icon', 'Effect'], POWER_ROWS, [18, 16, 66]),
    SP(),
    B('**Combos:** cut enemies quickly one after another to build a combo. Every 5 in a row raises your score multiplier (up to ×4). Getting hit resets it. Cutting 2+ enemies in one swing is a **Sweep** bonus.'),
    H1('Tips'),
    B('Keep the rope **stretched** — a long rope sweeps more space, and enemies coming at you along the rope get cut first.'),
    B('Talk! “I’ll stay still, you swing!” is how you beat armoured Brutes.'),
    B('Hide behind your rope: it blocks Spitter shots.'),
    B('Turn on **Assist mode** in Settings for +2 lives and slower enemies — great for younger players.'),
    H1('Troubleshooting'),
    T(['Problem', 'What to do'], [
      ['“Couldn’t find game XXXXX”', 'Check the code (letters and numbers only). Make sure the host phone is still on the host screen with its screen on.'],
      ['“The phones couldn’t connect directly”', 'Some mobile networks block direct phone-to-phone connections. Put both phones on the same Wi-Fi — or turn on a hotspot on one phone and connect the other phone to it — then try again.'],
      ['“Can’t reach the connection server”', 'Two-phone play needs internet to find each other. Check the connection, then tap Cancel and host again. (Same-device play works offline.)'],
      ['Partner disconnected', 'The game pauses automatically. The partner just reopens the link (or the game page) and rejoins within 30 seconds. After that you can choose Keep waiting or Main menu.'],
      ['Game paused by itself', 'It pauses when a phone’s screen turns off, switches apps, or is held upright. Turn the phone sideways and tap Resume.'],
      ['No sound', 'Tap the screen once (phones only allow sound after a tap), check the sound button on the title screen, and on iPhone check the silent switch.'],
      ['No vibration', 'Vibration only works on Android phones. iPhones do not allow websites to vibrate.'],
      ['No fullscreen button (iPhone)', 'iPhone Safari does not support fullscreen for games. Use Share → “Add to Home Screen” and open it from there.'],
      ['Screen goes to sleep', 'The game keeps the screen awake while you play. If your phone is in battery-saver mode, this may be blocked.'],
      ['Everything feels slow / choppy', 'Close other apps and tabs. The game automatically switches to a lighter graphics mode on slower phones.'],
    ], [32, 68]),
  ];
  await save(doc(ch, 'Tethered Player Guide'), 'deliverables/Tethered-Player-Guide.docx');
}

// ======================= 2. DESIGN DOCUMENT =======================
function waveRows() {
  return SURVIVAL_WAVES.map((w, i) => {
    const counts = {}; const caps = [];
    for (const s of w.steps) { if (s.capsule) caps.push(s.capsule); else if (s.boss) counts['The Warden'] = 1; else counts[s.type] = (counts[s.type] || 0) + s.n; }
    const content = Object.entries(counts).map(([k, v]) => (k === 'The Warden' ? 'The Warden (boss) + reinforcements' : `${v} ${k}${v > 1 ? 's' : ''}`)).join(', ');
    const intro = w.intro ? (w.intro === 'boss' ? 'Boss' : `New: ${w.intro}`) : '—';
    return [String(i + 1), w.name, intro, content, caps.length ? caps.join(', ') : '—'];
  });
}
function simTables() {
  if (!sim) return [P('(Simulation results not available — run tools/sim.mjs.)')];
  const S = sim.summary, out = [];
  const sv = (k) => S[`survival.${k}`], en = (k) => S[`endless.${k}`];
  out.push(H2('Survival (200 runs per skill level)'));
  out.push(T(['Pair', 'Reach wave 4', 'Clear rate', '★ / ★★ / ★★★ (of runs)', 'Median wave', 'Median run', 'Target'], [
    ['Weak', pct(sv('weak').reachWave4), pct(sv('weak').clearRate), sv('weak').stars.join(' / '), sv('weak').medianWave, fmt(sv('weak').medianTime), 'Usually reaches wave 4'],
    ['Average', pct(sv('average').reachWave4), pct(sv('average').clearRate), sv('average').stars.join(' / '), sv('average').medianWave, fmt(sv('average').medianTime), 'Clears 30–50%'],
    ['Strong', pct(sv('strong').reachWave4), pct(sv('strong').clearRate), sv('strong').stars.join(' / '), sv('strong').medianWave, fmt(sv('strong').medianTime), 'Clears most; rarely 3★'],
  ], [10, 13, 11, 18, 11, 11, 26]));
  out.push(SP());
  out.push(P('Where runs ended (number of failed runs per wave, waves 1–10):'));
  out.push(T(['Pair', ...Array.from({ length: 10 }, (_, i) => `W${i + 1}`)], ['weak', 'average', 'strong'].map((k) => [k[0].toUpperCase() + k.slice(1), ...sv(k).waveDist]), [16, ...Array(10).fill(8)]));
  out.push(H2('Endless (200 runs per skill level)'));
  out.push(T(['Pair', '≥ 3 waves', 'Median run', 'p10 – p90', 'Runs > 15 min', 'Median waves', 'Target'], [
    ['Weak', pct(en('weak').min3waves), fmt(en('weak').medianTime), `${fmt(en('weak').p10Time)} – ${fmt(en('weak').p90Time)}`, pct(en('weak').over15), en('weak').medianWaves, 'Survives ≥ 3 waves'],
    ['Average', pct(en('average').min3waves), fmt(en('average').medianTime), `${fmt(en('average').p10Time)} – ${fmt(en('average').p90Time)}`, pct(en('average').over15), en('average').medianWaves, 'Median 4–8 min'],
    ['Strong', pct(en('strong').min3waves), fmt(en('strong').medianTime), `${fmt(en('strong').p10Time)} – ${fmt(en('strong').p90Time)}`, pct(en('strong').over15), en('strong').medianWaves, 'Rarely past 15 min'],
  ], [10, 11, 12, 17, 13, 12, 25]));
  return out;
}

async function designDoc() {
  const E = C.enemies, R = C.rope, P2 = C.player, BO = C.boss, EN = C.endless;
  const ch = [
    ...TITLE('Tethered — Design Document', `Mechanics, waves, difficulty tuning and simulation results · v${C.version}`),
    H1('1. Pillars'),
    B('**The rope is the weapon; your partner is the handle.** Nobody can hurt anything alone — every kill comes from two players moving relative to each other.'),
    B('**Readable at a glance on a phone, for a 10-year-old.** Shapes before colours, telegraphs before attacks, no more than ~8 words on screen at once.'),
    B('**Short, escalating, forgiving.** 5–15 minute sessions, shared lives, brief invulnerability after a hit, hearts between waves, a boss checkpoint.'),
    P('Research basis (4 parallel studies; see research-summary.md): Snipperclips/Keep Talking (your partner is your tool), Overcooked (each new mechanic creates a new conversation; avoid star gates), Lovers in a Dangerous Spacetime (colour-locked pickups confused players → shared "both inside" capsules), Rayman/It Takes Two (never eliminate a player), PvZ and Mario 1-1 (teach by doing), Eiserloh/Nijman/Jonasson & Purho (game feel), L4D Director/Brotato/Vampire Survivors (sawtooth pacing, budgets, caps).'),
    H1('2. World, players and rope'),
    B(`Fixed logical arena **${C.arena.w}×${C.arena.h}** (2:1, fills modern phones), simulated at a fixed 60 Hz with a seeded RNG, so a run is deterministic and can be simulated headless.`),
    B(`Orbs: radius ${P2.radius} (hitbox ${P2.hitRadius} — deliberately forgiving), top speed ${P2.maxSpeed} u/s, stick response time constant ${Math.round(1000 / P2.response)} ms. After a hit: ${P2.invuln} s invulnerability and a knock-back that clears enemies within ${P2.knockRadius} u (no chain hits).`),
    B(`Rope: rest length ${R.rest}, maximum ${R.max}. Beyond the rest length a soft spring pulls the orbs together (you feel your partner); at maximum a hard constraint removes only separating velocity, so the rope never flings a player into danger.`),
    B(`A damped **midpoint mass** (stiffness ${R.midStiffness}, damping ${R.midDamping}) lags behind the centre, so a sweeping rope bows like a whip. The rope is a quadratic curve sampled as ${R.samples} segments for collision; cut half-width ${R.halfWidth}.`),
    B('Kill credit (for per-player stats) goes to whichever player’s motion contributed more at the contact point; **score is always team score.** The rope brightens with stretch and crackles near maximum length, teaching the limit without text.'),
    H1('3. Enemies and telegraphs'),
    P('All enemies share one hostile colour family (reddish purple) and are told apart by **shape**. Telegraphs always use **yellow + white diagonal hatching + blinking that speeds up + a rising tone** — never red/green. Every spawn is preceded by a 0.9 s portal ring, never within 160 u of an orb, and new enemies (including splitter pieces) are harmless for their first 0.45 s.'),
    T(['Enemy', 'Shape', 'Behaviour (tuned values)', 'Counter'], [
      ['Drifter', 'Spiky circle', `Homes on the nearest orb at ${E.drifter.speed} u/s, turn rate ${E.drifter.turn} rad/s.`, 'Any rope touch.'],
      ['Dasher', 'Arrowhead', `Approaches to ${E.dasher.approach} u, aims ${E.dasher.aim} s (direction locks ${E.dasher.lock} s before launch) showing a hatched lane, dashes ${E.dasher.dashSpeed} u/s for ${E.dasher.dashTime} s, rests ${E.dasher.rest} s.`, 'Leave the lane, or hold the rope across it.'],
      ['Splitter', 'Cracked square', `Slow (${E.splitter.speed} u/s), splits into ${E.splitter.children} minis flung at ${E.splitter.childSpeed} u/s.`, 'Follow-up sweep.'],
      ['Spitter', 'Diamond + eye', `Turret: holds a ${E.spitter.rangeMin}–${E.spitter.rangeMax} u band, strafes slowly, retreats at ${Math.round(E.spitter.retreat * 100)}% speed. Fires every ${E.spitter.period} s after a ${E.spitter.charge} s charge ring + dotted aim line; shots ${E.spitter.shotSpeed} u/s. Holds fire when an orb is within ${E.spitter.panic} u.`, 'Rope blocks shots; rush it together.'],
      ['Brute', 'Armoured hexagon', `Slow (${E.brute.speed} u/s), ${E.brute.armor} armour plates. Rope slower than ${E.brute.cutSpeed} u/s at the contact point bounces off and removes a plate; a fast rope (or no plates left) cuts it.`, 'Anchor + swing.'],
    ], [11, 13, 52, 24]),
    H1('4. The boss — The Warden'),
    B(`Core radius ${BO.r}, ${BO.hp} HP, three phases at 66% and 33%. ${BO.nodes} armoured shield nodes orbit at ${BO.nodeOrbit} u; any rope touch breaks a node; nodes do not hurt on contact (they are armour).`),
    B(`Breaking all nodes opens the core for ${BO.openTime.join(' / ')} s (by phase). **While open, the Warden launches no new attacks** — its vulnerability window is a recovery window. Damage (${BO.coreDps} HP/s) is dealt only while a **taut rope (≥ ${Math.round(R.tautRatio * 100)}% of max length) crosses the core** — physically this requires the two players on opposite sides of the boss, sawing back and forth.`),
    B(`Phase 1: radial bursts of ${BO.burstCount[0]} slow shots (${BO.shotSpeed} u/s) with a guaranteed gap, ${BO.burstTele[0]} s swelling-ring telegraph; reinforcements every ${BO.spawnEvery[0]} s.`),
    B(`Phase 2: adds a sweeping beam — ${BO.beamTele} s hatched telegraph, then ${BO.beamTime} s at ${BO.beamSpin} rad/s (a ${Math.round(BO.beamTime * BO.beamSpin * 57.3)}° arc, slow enough to outrun).`),
    B(`Phase 3: faster bursts (${BO.burstTele[2]} s telegraph) and a charge at the pair (hatched lane, ${BO.chargeTele} s); hitting the wall stuns it for ${BO.stun} s with the core open.`),
    B('Each phase change: 200 ms hit-stop, roar, arena hazards cleared, a heart drops. Losing on the boss offers **Retry the Warden** (checkpoint, 3 lives, max 1★).'),
    H1('5. Gems, power-ups, scoring and stars'),
    B(`Shard ${C.gems.shard} pts (every kill), Prism ${C.gems.prism} pts (splitters, spitters, brutes, nodes, 3+ sweeps), Heart +1 life (cap = starting lives + ${C.lives.capBonus}). Gems last ${C.gems.life} s; collected by orbs, not the rope (someone has to go and get them). After a wave clears, all gems fly to the nearest orb.`),
    B(`Link capsules: claimed only when both orbs are inside the ${C.capsules.r} u ring for ${C.capsules.claim} s. Survival places them at fixed wave moments; Endless every ~${EN.capsuleEvery} s.`),
    T(['Power-up', 'Icon', 'Effect'], POWER_ROWS, [18, 16, 66]),
    SP(),
    B(`Combo: each cut within ${C.score.comboWindow} s extends it; multiplier = 1 + ⌊combo/${C.score.comboStep}⌋ × ${C.score.comboMulStep}, max ×${C.score.comboMulMax}; any hit resets it. Multi-cut within ${C.score.multiWindow} s: +${C.score.multiBonus} per extra kill. Wave clear +${C.score.waveBonus}×wave, no-hit wave +${C.score.noHitBonus}, Survival clear +${C.score.lifeBonus} per life left.`),
    B(`Stars: ★ clear · ★★ clear with ≥ ${C.stars.twoLives} lives left · ★★★ clear with ≥ ${C.stars.threeLives} lives left **and** ≥ ${C.stars.threeScore.toLocaleString()} points. Assist-mode bonus lives don’t count toward stars. Stars are a goal to chase, never a gate.`),
    H1('6. Survival — the waves'),
    P(`Wave 0 is the tutorial (section 7). Starting lives ${C.lives.survival}. Global Survival enemy speed ×${C.survival.speed}, rising ${Math.round(C.survival.speedRamp * 100)}% per wave. A ${C.waves.breather} s breather follows each wave (gem magnet, banner); hearts drop after waves ${C.survival.hearts.join(', ')} if the team is below maximum. Each new enemy appears alone first, with a pictogram card, then is remixed in later waves.`),
    T(['#', 'Name', 'Introduces', 'Enemies (total)', 'Capsules'], waveRows(), [5, 17, 15, 46, 17]),
    H1('7. Wave 0 — the interactive tutorial'),
    P('Shown automatically the first time only (remembered in local storage); “Skip tutorial ›” is always visible; “How to play” replays it. Nothing can fail and no lives are lost. Each step advances only when the players do the thing:'),
    N('**Move** — ghost-finger hints on each half; each orb into its own ring (rings marked with the orb’s shape).'),
    N('**Together** — both orbs inside one big ring.'),
    N('**Stretch** — pull apart until the rope crackles at full length.'),
    N('**Sweep** — a sleepy drifter: hit it with the rope (only the rope can pop it).'),
    N('**Gem** — collect the gem it drops (placed a short trip away).'),
    N('**Danger** — a slow drifter approaches; touching it shows “Ouch! That costs a life” without costing one.'),
    N('**Mini-wave** — five drifters; then “Ready!” and wave 1 begins.'),
    H1('8. Endless — difficulty curve'),
    B(`Spawn budget per wave: B(n) = ${EN.budget[0]} + ${EN.budget[1]}·n + ${EN.budget[2]}·n² (costs: drifter 1, dasher 2, splitter 3, spitter 3, brute 4); concurrent cap C(n) = min(${EN.cap[0]} + ${EN.cap[1]}·n, ${EN.cap[2]}); enemies arrive in pulses of ${EN.pulseSize[0]}–${EN.pulseSize[1]}.`),
    B(`Enemy speed ×${EN.speed} × (1 + ${EN.speedLog}·ln(1+n)) — logarithmic, so it never becomes unreactable. Unlocks: dasher wave ${EN.unlock.dasher}, splitter ${EN.unlock.splitter}, spitter ${EN.unlock.spitter}, brute ${EN.unlock.brute}. Every ${EN.bossEvery}th wave the Warden returns (+${Math.round(BO.endlessHpGrowth * 100)}% HP each time). A heart every ${EN.heartEvery} waves.`),
    B(`**Overtime pressure** bounds run length: after ${EN.overtimeStart / 60} minutes, every minute adds +${Math.round(EN.overtimeSpeed * 100)}% enemy speed, +${EN.overtimeCap} to the cap and +${Math.round(EN.overtimeBudget * 100)}% budget. This is what keeps strong pairs from playing forever.`),
    H1('9. Two-phone netcode'),
    B('PeerJS 1.5.5 (vendored) over the public PeerJS broker; host peer id = tethered-v1-<5-char code> from an unambiguous alphabet. Join link = <site>/#join=CODE (the hash never reaches the server, so any static host works). The QR code encodes the link.'),
    B('**Host-authoritative:** the guest sends stick input at 30 Hz; the host simulates both orbs and sends quantised snapshots at 20 Hz on a pre-negotiated **unreliable** data channel (PeerJS’s own “unreliable” mode still retransmits). Control messages and one-shot events (sounds, particles, haptics) go on the reliable channel and are replayed in sync with the guest’s picture.'),
    B('Guest renders 100 ms in the past with interpolation; its own orb is predicted locally and softly corrected, so steering feels immediate.'),
    B('Liveness by our own heartbeats (“Connection unstable…” after 2 s, dropped after 4 s), because WebRTC “close” events are unreliable on phones. 10 s broker and 12 s ICE timeouts give clear messages (same Wi-Fi / hotspot advice). On a drop the host pauses and keeps the room open; the guest retries every 2 s (also after a page reload, using a session token); on rejoin the host sends a keyframe and a 3-2-1 resume. After 30 s both sides offer Keep waiting / Main menu.'),
    B('A BroadcastChannel transport (?net=local) lets two tabs play offline on one computer; it is used by the automated tests.'),
    H1('10. Difficulty tuning — method and decisions'),
    P('Bots play both orbs. Each bot is a short-horizon planner: several times a second it scores candidate stick directions by predicting its orb, its partner, the rope and every threat over a short look-ahead (homing enemies are predicted to chase, shots can be blocked by the rope, enemies approaching along the rope count as cut), plus goals (hunt a target so it passes between the orbs, keep the rope stretched, collect gems, claim capsules, saw the boss core). **The three skill profiles were fixed as human models before any game tuning**, so the game — not the bots — was tuned to the targets:'),
    T(['Profile', 'Reaction ≈', 'Look-ahead', 'Attention', 'Coordination', 'Knows tactics (rope as shield, lane dodge)'], ['weak', 'average', 'strong'].map((k) => {
      const s = BOT_SKILLS[k];
      return [k[0].toUpperCase() + k.slice(1), `${Math.round((0.5 / s.hz + s.lag) * 1000)} ms`, `${s.horizon} s`, `${Math.round(s.attention * 100)}%`, `${Math.round(s.coord * 100)}%`, `${Math.round(s.lance * 100)}% / ${Math.round(s.lane * 100)}%`];
    }), [12, 13, 13, 13, 15, 34]),
    SP(),
    P('Each change below was made because the simulation (1,200 runs in about 40 s across all cores) showed a specific failure; each was then re-measured.'),
    B('World rescaled to 1500×750 with bigger entities after screenshots showed 19 px orbs on a 390 px phone.'),
    B('Newborn enemies (incl. splitter pieces) harmless for 0.45 s — pieces flung at close range caused unavoidable hits.'),
    B('Boss shield nodes no longer hurt on contact; rotating beam slowed from 1.2 to 0.7 rad/s (at 1.2 its tip outran a player); the boss holds attacks while its core is open; core damage made a flat rate while a taut rope crosses it (sawing at a speed threshold was unreadable).'),
    B('Spitters redesigned as slow “turrets” within rope reach that hold fire up close; shots slowed from 215 to 140 u/s, fire interval 2.7 → 4 s; fewer spitters in waves 6–9. Before this, spitter waves lasted 60–90 s and shots were the #1 cause of lost lives.'),
    B('Brutes given 2 armour plates (slow hits chip them away) — previously they could stall a wave for 40 s.'),
    B(`Survival speed ×${C.survival.speed} with a gentle ramp, hearts after waves ${C.survival.hearts.join(', ')}, boss HP ${BO.hp}; Endless opening made as gentle as Survival’s and overtime pressure starting at ${EN.overtimeStart / 60} min.`),
    B('Allocation-free rope collision queries (garbage collection was costing frames under CPU throttling) and a pixel-aligned background blit: a busy late wave now holds 60 fps at 4× CPU throttling in headless Chromium.'),
    H1('11. Simulation results (final config)'),
    ...simTables(),
    ...(review.issues.length ? [
      H1('12. Independent review — issues found and fixed'),
      P(`A separate reviewer agent (no prior knowledge of the project) played the game with Playwright on mobile viewports with touch, both modes, the tutorial, and a two-browser-context PeerJS session with simulated disconnects. It reported ${review.issues.length} issues; all were addressed:`),
      T(['Severity', 'Issue', 'Fix'], review.issues.map((i) => [i.severity, i.issue, i.fix]), [12, 44, 44]),
      ...(review.rerun ? [SP(), P(review.rerun)] : []),
    ] : []),
    H1(review.issues.length ? '13. Architecture and extension points' : '12. Architecture and extension points'),
    B('Static ES modules, no build step; total download ≈ 0.37 MB (budget 1 MB). PWA: manifest + service worker precaching every file, so same-device play works offline.'),
    B('src/config.js — every tuning value and the Survival wave scripts. src/sim/* — pure game logic, bots and snapshots (runs in Node). src/render/* — canvas renderer and effects. input.js, audio.js (Web Audio synthesis, no sound files), net.js (transports + sessions), ui.js (screens), save.js (versioned localStorage, try/catch), platform.js (wake lock, fullscreen, haptics), main.js (app state machine).'),
    B('Extension seams for later (not built): new modes plug into waves.js/startWave; screens are data-act routed in ui.js; save.js has a versioned schema; net.js transports share one small interface (e.g. a future relay/TURN backend).'),
  ];
  await save(doc(ch, 'Tethered Design Document'), 'deliverables/Tethered-Design-Document.docx');
}

// ======================= 3. ONE-PAGE PITCH =======================
async function pitch() {
  const S = sim?.summary;
  const ch = [
    ...TITLE('Tethered', 'Two orbs. One rope. Cut through everything — together.'),
    P('**The pitch.** Tethered is a 5–15 minute co-op action game for two players aged 10+. Each player steers a glowing orb; the orbs are joined by an elastic energy rope that destroys every enemy it touches. You can’t win alone — every kill comes from two people moving together, so every round is full of “stay there — I’ll swing!” moments.'),
    P('**Play anywhere, instantly.** It runs in the browser on any phone: share one phone (each player gets a joystick on their half of the screen) or use two phones — one hosts, the other scans a QR code and is in the game in seconds. No install, no account; installable as an app, and same-device play works offline.'),
    H2('Why it works'),
    B('**Interdependence by design** — like Snipperclips and Keep Talking, your partner is your tool. Shared lives and power-ups that need both players in the same ring create constant, positive communication.'),
    B('**Instant to learn, deep to master** — a 60-second interactive tutorial teaches by doing; anchoring, swinging, lancing and sawing the boss give strong pairs real mastery to show off.'),
    B('**Juicy and readable** — screen shake, hit-stop, particles and synthesized sound; enemies differ by shape and every attack is telegraphed with yellow hatching, so it is colour-blind safe.'),
    B('**Two modes** — Survival: 10 hand-crafted waves, a cooperative boss and a 3-star rating. Endless: escalating waves and a best score to beat.'),
    H2('Proof it is tuned'),
    P(S ? `1,200 simulated runs per tuning pass with weak, average and strong bot pairs: a beginner pair reaches wave 4 in ${pct(S['survival.weak'].reachWave4)} of Survival runs, an average pair clears Survival ${pct(S['survival.average'].clearRate)} of the time, a strong pair ${pct(S['survival.strong'].clearRate)} (3 stars in only ${pct(S['survival.strong'].stars[2] / S['survival.strong'].n)}). Endless runs last a median ${fmt(S['endless.average'].medianTime)} for average pairs and almost never pass 15 minutes.` : 'Tuned with thousands of simulated bot runs at three skill levels.'),
    H2('Built for what comes next'),
    P('Under 0.4 MB, 60 fps on mid-range phones, modular code (game logic, rendering, input, audio, networking, menus and saved data are separate), so new modes, cosmetic rope skins, daily challenges, leaderboards or monetisation can be added without a rewrite.'),
    P(`**Play it:** ${SITE}`),
  ];
  await save(doc(ch, 'Tethered Pitch'), 'deliverables/Tethered-Pitch.docx');
}

await playerGuide();
await designDoc();
await pitch();
