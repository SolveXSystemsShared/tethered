// Tethered — every tuning value lives here. The simulator (tools/sim.mjs) can
// override any path via applyOverrides() to explore tunings without editing code.

export const CONFIG = {
  version: '1.0.0',
  arena: { w: 1500, h: 750, spawnMargin: 50, safeSpawnDist: 160 },
  dt: 1 / 60,

  player: {
    radius: 27,
    hitRadius: 21,          // orbs have tight hitboxes (forgiving)
    maxSpeed: 380,
    response: 13,           // velocity follows stick with 1-exp(-k dt)
    invuln: 1.4,
    knockRadius: 160,
    knockSpeed: 460,
  },

  rope: {
    rest: 170,
    max: 400,
    spring: 7,              // pull-together acceleration per unit of stretch
    midStiffness: 95,       // midpoint (whip) spring
    midDamping: 13,
    halfWidth: 8,
    samples: 8,
    tautRatio: 0.85,        // "taut" for boss core damage
  },

  lives: { survival: 5, endless: 5, assistBonus: 2, capBonus: 1 },
  assist: { enemySpeed: 0.85 },

  enemies: {
    drifter:  { r: 19, speed: 80,  turn: 2.6, points: 10, cost: 1 },
    mini:     { r: 13, speed: 104, turn: 3.2, points: 5,  cost: 0.5 },
    dasher:   { r: 20, speed: 74,  approach: 290, aim: 1.0, lock: 0.25, dashSpeed: 760, dashTime: 0.55, rest: 1.2, points: 20, cost: 2 },
    splitter: { r: 31, speed: 57,  turn: 1.8, children: 3, childSpeed: 160, points: 30, cost: 3 },
    spitter:  { r: 22, speed: 90,  rangeMin: 270, rangeMax: 400, panic: 200, retreat: 0.55, period: 4.0, charge: 1.0, shotSpeed: 140, shotR: 11, points: 30, cost: 3 },
    brute:    { r: 33, speed: 50,  turn: 1.5, cutSpeed: 250, armor: 2, bounce: 300, points: 50, cost: 4 },
    node:     { r: 21, points: 40 },
    separation: 0.6,
    spawnTime: 0.9,         // portal telegraph before an enemy appears
    hurtGrace: 0.45,        // newborn enemies (incl. splitter pieces) can't hurt you yet
  },

  boss: {
    r: 76,
    hp: 90,
    nodeOrbit: 140,
    nodeSpin: 1.1,
    nodes: 3,
    openTime: [6, 6, 5],    // core exposed seconds per phase
    coreDps: 16,            // hp per second while a taut rope crosses the open core
    contactDamage: true,
    drift: 34,
    burstEvery: [6.5, 5.6, 4.8],
    burstTele: [1.0, 0.95, 0.85],
    burstCount: [8, 9, 10],
    shotSpeed: 150,
    spawnEvery: [9, 8, 7],
    beamTele: 1.2, beamTime: 1.6, beamSpin: 0.7, beamEvery: 9, beamWidth: 14,
    chargeTele: 0.9, chargeSpeed: 600, chargeEvery: 7, stun: 2.2,
    points: { phase: 500, kill: 2000 },
    endlessHpGrowth: 0.35,
  },

  gems: {
    life: 9, blink: 2, r: 13,
    shard: 10, prism: 50,
    magnetSpeed: 800,
    pickupR: 34,
  },

  capsules: { r: 80, claim: 0.5, life: 12 },
  power: {
    mega: { time: 9, width: 2.2, length: 1.25 },
    freeze: { time: 6, factor: 0.3 },
    shield: { time: 25 },
    nova: { arm: 8, radius: 270, touch: 50 },
  },

  score: {
    comboWindow: 1.6,
    comboStep: 5, comboMulStep: 0.5, comboMulMax: 4,
    multiWindow: 0.25, multiBonus: 25,
    waveBonus: 50, noHitBonus: 150, lifeBonus: 400,
    milestones: [10, 25, 50],
  },

  stars: { twoLives: 3, threeLives: 5, threeScore: 23200 },

  waves: {
    breather: 3.5,
    introHold: 1.2,
  },

  survival: {
    speed: 0.85,            // global enemy speed factor in Survival
    speedRamp: 0.01,        // +x per wave after wave 1
    hearts: [3, 5, 6, 7, 8, 9], // a heart drops after clearing these waves (if below max lives)
  },

  endless: {
    budget: [3, 3.5, 0.18],          // b0 + b1 n + b2 n^2
    cap: [6, 0.9, 22],               // c0 + c1 n, max
    pulse: [3.4, -0.06, 1.6],        // seconds between pulses: max(min, a + b n)
    pulseSize: [3, 7],
    speed: 0.85,                     // base enemy speed factor in Endless
    speedLog: 0.1,
    unlock: { dasher: 2, splitter: 4, spitter: 5, brute: 7 },
    weights: { drifter: 5, dasher: 2.4, splitter: 1.4, spitter: 1.2, brute: 1.0 },
    bossEvery: 10,
    heartEvery: 2,
    capsuleEvery: 34,
    overtimeStart: 420,              // seconds of play before overtime pressure
    overtimeSpeed: 0.06,             // +x speed multiplier per overtime minute
    overtimeCap: 0.9,                // +x cap per overtime minute (enemies)
    overtimeBudget: 0.25,            // +x budget fraction per overtime minute
  },

  fx: {
    shakeMax: 12, shakeDecay: 1.6, shakeFreq: 18,
    trauma: { cut: 0.07, multi: 0.16, hurt: 0.55, phase: 0.7, bossDie: 1, clank: 0.05, nova: 0.6 },
    hitstop: { multi3: 0.03, hurt: 0.12, phase: 0.2, bossDie: 0.4 },
    maxParticles: 500,
  },

  net: {
    prefix: 'tethered-v1-',
    codeLength: 5,
    alphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
    snapshotHz: 20,
    inputHz: 30,
    interpDelay: 0.1,
    heartbeat: 0.5,
    unstableAfter: 2,
    dropAfter: 4,
    openTimeout: 10,
    iceTimeout: 12,
    rejoinWindow: 30,
    retryEvery: 2,
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
    ],
  },

  input: { deadZone: 0.12, radiusFrac: 0.12, radiusMin: 48, radiusMax: 90, centreStrip: 0.04 },
};

// Survival: 10 hand-designed waves. Each wave is a list of steps run in order.
// Step fields: t = delay (s) after the previous step was released,
//   wait = only release once alive enemies <= wait,
//   n/type/side/gap = spawn n enemies of type from side, gap seconds apart,
//   capsule = power-up type to drop, boss = spawn the Warden.
// Sides: L R T B (edges), LR / TB (both at once), any, ring (around the arena).
export const SURVIVAL_WAVES = [
  { name: 'First Contact', steps: [
    { t: 0.5, n: 2, type: 'drifter', side: 'L', gap: 0.4 },
    { t: 3.5, n: 2, type: 'drifter', side: 'R', gap: 0.4 },
    { t: 3.5, n: 2, type: 'drifter', side: 'T', gap: 0.4 },
    { t: 3.5, n: 2, type: 'drifter', side: 'B', gap: 0.4 },
    { t: 3.0, n: 2, type: 'drifter', side: 'LR', gap: 0.3 },
  ] },
  { name: 'Crowd Control', steps: [
    { t: 0.5, n: 4, type: 'drifter', side: 'LR', gap: 0.3 },
    { t: 4.0, n: 4, type: 'drifter', side: 'TB', gap: 0.3 },
    { t: 1.0, capsule: 'shield' },
    { t: 3.0, n: 3, type: 'drifter', side: 'L', gap: 0.25, wait: 4 },
    { t: 1.5, n: 3, type: 'drifter', side: 'R', gap: 0.25 },
    { t: 4.0, n: 4, type: 'drifter', side: 'ring', gap: 0.2, wait: 3 },
  ] },
  { name: 'Dash Lines', intro: 'dasher', steps: [
    { t: 0.8, n: 1, type: 'dasher', side: 'L' },
    { t: 3.0, n: 1, type: 'dasher', side: 'R' },
    { t: 3.0, n: 1, type: 'dasher', side: 'T', wait: 1 },
    { t: 3.0, n: 5, type: 'drifter', side: 'LR', gap: 0.3, wait: 1 },
    { t: 3.0, n: 2, type: 'dasher', side: 'TB', gap: 0.5 },
    { t: 4.0, n: 5, type: 'drifter', side: 'any', gap: 0.35 },
    { t: 3.0, n: 2, type: 'dasher', side: 'LR', gap: 0.5, wait: 4 },
  ] },
  { name: 'Pressure', steps: [
    { t: 0.5, n: 5, type: 'drifter', side: 'LR', gap: 0.25 },
    { t: 2.5, n: 2, type: 'dasher', side: 'T', gap: 0.4 },
    { t: 3.0, n: 5, type: 'drifter', side: 'TB', gap: 0.25 },
    { t: 1.0, capsule: 'freeze' },
    { t: 2.5, n: 3, type: 'dasher', side: 'any', gap: 0.6, wait: 6 },
    { t: 3.0, n: 6, type: 'drifter', side: 'ring', gap: 0.2 },
    { t: 3.0, n: 2, type: 'dasher', side: 'LR', gap: 0.4, wait: 5 },
  ] },
  { name: 'Split Up', intro: 'splitter', steps: [
    { t: 0.8, n: 1, type: 'splitter', side: 'L' },
    { t: 4.0, n: 2, type: 'splitter', side: 'R', gap: 1.0, wait: 2 },
    { t: 1.0, capsule: 'mega' },
    { t: 3.0, n: 5, type: 'drifter', side: 'LR', gap: 0.3, wait: 3 },
    { t: 2.0, n: 2, type: 'splitter', side: 'TB', gap: 0.8 },
    { t: 3.0, n: 2, type: 'dasher', side: 'any', gap: 0.6 },
    { t: 3.0, n: 2, type: 'splitter', side: 'any', gap: 0.8, wait: 6 },
    { t: 1.0, n: 5, type: 'drifter', side: 'ring', gap: 0.2 },
    { t: 2.0, n: 1, type: 'dasher', side: 'any' },
  ] },
  { name: 'Incoming Fire', intro: 'spitter', steps: [
    { t: 0.8, n: 1, type: 'spitter', side: 'T' },
    { t: 1.5, n: 3, type: 'drifter', side: 'B', gap: 0.5 },
    { t: 3.0, n: 1, type: 'spitter', side: 'B', wait: 1 },
    { t: 1.0, capsule: 'shield' },
    { t: 3.0, n: 5, type: 'drifter', side: 'LR', gap: 0.3, wait: 2 },
    { t: 2.0, n: 2, type: 'spitter', side: 'LR', gap: 0.8, wait: 4 },
    { t: 3.0, n: 3, type: 'dasher', side: 'any', gap: 0.6 },
    { t: 3.0, n: 6, type: 'drifter', side: 'ring', gap: 0.25, wait: 3 },
  ] },
  { name: 'Heavy Metal', intro: 'brute', steps: [
    { t: 0.8, n: 1, type: 'brute', side: 'L' },
    { t: 4.0, n: 1, type: 'brute', side: 'R', wait: 1 },
    { t: 2.0, n: 4, type: 'drifter', side: 'TB', gap: 0.4 },
    { t: 2.0, capsule: 'nova' },
    { t: 3.0, n: 2, type: 'brute', side: 'LR', gap: 0.8, wait: 3 },
    { t: 2.0, n: 4, type: 'drifter', side: 'any', gap: 0.3 },
    { t: 3.0, n: 1, type: 'spitter', side: 'T' },
    { t: 3.0, n: 2, type: 'brute', side: 'any', gap: 1.0, wait: 6 },
    { t: 1.0, n: 4, type: 'drifter', side: 'ring', gap: 0.25 },
  ] },
  { name: 'Mixed Signals', steps: [
    { t: 0.5, n: 6, type: 'drifter', side: 'LR', gap: 0.2 },
    { t: 1.5, n: 2, type: 'dasher', side: 'TB', gap: 0.5 },
    { t: 2.0, n: 2, type: 'splitter', side: 'any', gap: 0.8 },
    { t: 1.0, capsule: 'freeze' },
    { t: 3.0, n: 2, type: 'spitter', side: 'LR', gap: 0.6, wait: 6 },
    { t: 1.5, n: 2, type: 'brute', side: 'TB', gap: 0.8 },
    { t: 3.0, n: 6, type: 'drifter', side: 'ring', gap: 0.2, wait: 6 },
    { t: 1.0, capsule: 'mega' },
    { t: 2.0, n: 3, type: 'dasher', side: 'any', gap: 0.5 },
    { t: 2.5, n: 2, type: 'splitter', side: 'LR', gap: 0.6, wait: 6 },
    { t: 1.5, n: 2, type: 'brute', side: 'any', gap: 0.8 },
  ] },
  { name: 'The Gauntlet', steps: [
    { t: 0.5, n: 8, type: 'drifter', side: 'ring', gap: 0.15 },
    { t: 2.0, n: 3, type: 'dasher', side: 'LR', gap: 0.4 },
    { t: 2.0, n: 2, type: 'spitter', side: 'TB', gap: 0.6 },
    { t: 1.0, capsule: 'nova' },
    { t: 3.0, n: 2, type: 'brute', side: 'LR', gap: 0.6, wait: 8 },
    { t: 1.0, n: 6, type: 'drifter', side: 'any', gap: 0.2 },
    { t: 2.0, n: 2, type: 'splitter', side: 'TB', gap: 0.6 },
    { t: 3.0, n: 3, type: 'dasher', side: 'any', gap: 0.4, wait: 8 },
    { t: 1.0, capsule: 'shield' },
    { t: 1.5, n: 1, type: 'spitter', side: 'L' },
    { t: 2.0, n: 6, type: 'drifter', side: 'ring', gap: 0.15 },
    { t: 3.0, n: 2, type: 'brute', side: 'TB', gap: 0.6, wait: 8 },
    { t: 1.0, n: 2, type: 'splitter', side: 'any', gap: 0.6 },
    { t: 1.5, n: 2, type: 'dasher', side: 'any', gap: 0.4 },
    { t: 1.5, n: 6, type: 'drifter', side: 'ring', gap: 0.15 },
  ] },
  { name: 'The Warden', intro: 'boss', steps: [
    { t: 1.0, boss: true },
  ] },
];

export function applyOverrides(target, overrides) {
  for (const [k, v] of Object.entries(overrides || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof target[k] === 'object') applyOverrides(target[k], v);
    else target[k] = v;
  }
  return target;
}

export function cloneConfig() { return JSON.parse(JSON.stringify(CONFIG)); }
