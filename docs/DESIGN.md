# Tethered — Game Design (Plan)

Status: living document. Numbers below are the *initial* plan values; the tuned values live in
`src/config.js` (the single source of truth) and the final tuning is recorded in `docs/sim-results.md`.

## 1. Pillars
1. **The rope is the weapon, the partner is the handle.** You can't hurt anything alone — every kill is made by the two of you moving relative to each other.
2. **Readable at a glance, on a phone, for a 10-year-old.** Shapes over colours, telegraphs over surprises, ≤8 words on screen at once.
3. **Short, escalating, forgiving.** A Survival run is ~8–12 minutes; shared lives, invulnerability after a hit, a boss checkpoint.

## 2. World & players
- Fixed logical arena **1600 × 900** world units (16:9). Rendered scaled-to-fit with a soft vignette outside; identical on every device so online play is consistent.
- Fixed simulation step **1/60 s**, seeded RNG (mulberry32) → deterministic, bot-simulatable in Node.
- **Player 1 "Sol"**: sky blue `#56B4E9`, **round orb** with a solid core dot. **Player 2 "Luna"**: orange `#E69F00`, **diamond orb** (rotated square) with a hollow core and stripe. Shape + pattern + colour → colourblind safe. Joysticks and HUD stats use the same shapes.
- Movement: analog input `[-1,1]²` → target velocity `input × maxSpeed (430 u/s)`; acceleration 2600 u/s², friction to stop. Radius 22.
- Squash/stretch along velocity (render only).

## 3. Rope physics
- Endpoints are the two orbs. A **midpoint mass** follows the centre of the segment through a damped spring (stiffness 90, damping 12) → when the pair sweeps, the rope bows behind them like a whip. The rope is a quadratic curve p1 → m → p2; collision samples it as 8 segments.
- **Rest length 200**, **max length 470**. Between rest and max, a spring (k = 7/s²) pulls both orbs toward each other (you feel your partner). At max length a hard positional constraint plus velocity projection — you drag your partner rather than escape.
- **Cutting**: any regular enemy whose circle touches the rope (distance ≤ enemyR + ropeHalfWidth 6) is destroyed. The rope's local speed at the contact point = lerp(v1, v2, t) + bow velocity.
- **Kill credit** (for per-player stats): contribution of P1 = (1−t)·|v1|, P2 = t·|v2| at contact parameter t; the larger takes the credit (ties → closer end). The *score* is always team score.
- **Tension glow**: rope brightens as it stretches; near max length it crackles (visual + subtle sound) so players learn the limit.
- Rope never hits terrain (there is none) and never flings players into hazards — the spring is soft, the constraint only removes separating velocity.

## 4. Enemies (each introduced alone first)
All enemies are magenta/pink family (`#CC79A7` body, white outline) on the dark background, **distinguished by shape**. Telegraphs are **yellow `#F0E442` + white hatching + blinking that speeds up + rising tone** — never red/green. Spawns are announced by a **portal ring** (dashed circle that fills in 0.9 s) before the enemy appears, so nothing spawns unseen on top of you (and no spawn within 150 u of a player).

| Type | Shape | Behaviour | Telegraph | Counter |
|---|---|---|---|---|
| **Drifter** | spiky circle | Homes on nearest orb, 95 u/s, gentle turning | — | Any rope touch |
| **Dasher** | arrowhead | Approaches to ~330 u, stops, aims for 1.0 s, dashes 900 u/s along a fixed line for ~0.55 s, rests 1.2 s | Yellow hatched lane + blinking "!" + whine; locks direction 0.25 s before launch | Step out of the lane; hold the rope across the lane — dashers die on it |
| **Splitter** | cracked square, large | Slow homing (70 u/s); when cut, splits into 3 mini-drifters flung outward | Crack lines | Sweep again to clean up the minis |
| **Spitter** | diamond with eye | Keeps 380–520 u range, strafes; every 2.6 s charges 0.9 s then fires a slow orb (260 u/s) at the nearest player | Charge ring fills + dotted aim line | **The rope blocks/destroys shots**; sweep the spitter when it's busy charging |
| **Brute** | armoured hexagon | Slow (60 u/s), heavy; rope only cuts it if the rope is moving faster than **520 u/s** at the contact point. A slow rope just bounces it (clank, sparks, armour flashes) | Armour plates glow while the rope is "fast enough" near it | **One anchors, the other swings** (or both swing in opposite directions) |

Hit rules: an enemy touching an orb costs **1 shared life**, is destroyed, the hit orb gets **1.4 s invulnerability** (blinks), and nearby enemies are knocked back (radius 160) — no chain hits.

## 5. Boss — "The Warden" (Survival wave 10, Endless every 10th wave)
A big core (radius 64) with **3 orbiting shield nodes**. Health 100 "core points".
- **Shielded state**: core is immune; shield nodes orbit at radius 120. Each node is cut like a Brute (needs a fast rope). Breaking all three **opens the core for 6 s** (5 s in phase 3): the core's spikes retract and a white ring pulses.
- **Damaging the core** requires the rope to cross the core **while taut** (length ≥ 85 % of max) — physically this needs the two players on opposite sides of the boss, sawing back and forth. Damage = rope speed × dt × factor, capped per second. Shields regrow when the window closes.
- **Phase 1 (100–66)**: slow drift toward the players' midpoint; every 6 s a radial burst of 10 slow shots with a 1.0 s swelling telegraph and a guaranteed gap. Spawns 2 drifters every 8 s.
- **Phase 2 (66–33)**: adds a **sweeping beam** — a hatched yellow wedge for 1.1 s, then a rotating beam for 2 s; spawns dashers.
- **Phase 3 (33–0)**: faster bursts (0.75 s telegraph), the boss **charges** at the player midpoint (hatched lane telegraph 0.9 s) and is stunned 2 s if it hits the wall (its core opens briefly without needing the shields).
- Phase change: hit-stop 200 ms, arena hazards cleared, roar, heart gem drops.
- The boss body itself hurts orbs on touch like any enemy (but survives the contact).

## 6. Gems & pickups
- **Shard** (small green-teal diamond, `#2EE6A8`) – dropped by every kill, 10 pts × combo multiplier.
- **Prism** (large faceted gem) – dropped by Splitters, Spitters, Brutes and multi-kills ≥3; 50 pts × multiplier.
- **Heart** (white heart) – +1 life (cap = starting lives + 1); dropped at boss phase changes; rare in Endless (every 3rd wave, 1 heart if below cap).
- Gems linger 9 s (blink in the last 2 s). Any orb collects them; the rope does not (so someone has to go get them — risk/reward).
- After a wave is cleared all remaining gems are magnet-pulled to the nearest orb (breather reward).

## 7. Team power-ups ("Link capsules")
A capsule appears in a white ring (radius 70) with an icon. It is claimed only when **both orbs are inside the ring at the same time for 0.5 s** — the pair must meet up (often through danger). The ring shows two half-arcs that fill (one per player, by shape) so it's clear who's missing. Capsules spawn at set wave moments (Survival) or every ~35 s (Endless), last 12 s.

| Power-up | Icon | Effect | Teamwork |
|---|---|---|---|
| **Mega Rope** | thick line | 9 s: rope 2.2× thicker, max length +25 %, cuts Brutes/shield nodes at any speed | meet to claim |
| **Freeze** | snowflake | 6 s: enemies and enemy shots at 30 % speed | meet to claim |
| **Shield** | ring | Team bubble absorbs the next hit on either orb (lasts 25 s) | meet to claim |
| **Nova** | star | Arms for 8 s: bring the two orbs **together (touching)** to detonate a shockwave (radius 300 around the meeting point) that destroys all regular enemies in range | meet to claim, then meet *again* to fire |

## 8. Scoring, combos, stars
- Kill points: Drifter 10, mini 5, Dasher 20, Splitter 30, Spitter 30, Brute 50, shield node 40, boss phase 500, boss kill 2000.
- **Combo**: each cut within 1.6 s of the previous one increments the combo. Multiplier = 1 + floor(combo/5) × 0.5, max ×4. Hit → combo resets. Combo shown near the rope midpoint; milestones at 10/25/50 ("NICE!", "GREAT!", "UNREAL!").
- **Multi-cut**: ≥2 kills within 0.25 s = "DOUBLE/TRIPLE/MEGA SWEEP" bonus +25 pts per extra kill × multiplier.
- Wave clear bonus 50 × wave; **no-hit wave** bonus +150.
- Survival clear: +400 per life left.
- **Stars (Survival)**: ★ clear. ★★ clear with ≥3 lives left. ★★★ clear with ≥4 lives left **and** score ≥ 3-star threshold (tuned so strong pairs rarely get it). Shown with the threshold on the victory screen so players know what to chase.

## 9. Survival — the 10 waves (+ tutorial)
Starting lives **5**. Between waves: 3.5 s breather (gem magnet, "WAVE n" banner + one-line hint when a new enemy appears, with a pictogram card).

| # | Name | Content (spawn groups) | New idea | Pickup |
|---|---|---|---|---|
| 0 | Tutorial | scripted (see §10) | rope basics | — |
| 1 | First Contact | 10 Drifters in pairs from alternating sides | sweeping | — |
| 2 | Crowd Control | 18 Drifters in groups of 3–4 from two sides at once | pincer — turn the rope | Shield |
| 3 | Dash Lines | 3 Dashers alone, then 10 Drifters + 4 Dashers | telegraphed lanes | — |
| 4 | Pressure | 16 Drifters + 7 Dashers, faster pulses | — | Freeze |
| 5 | Split Up | 3 Splitters alone, then 4 Splitters + 10 Drifters + 3 Dashers | follow-up sweeps | Mega Rope |
| 6 | Incoming Fire | 2 Spitters + Drifters, then 4 Spitters + 10 Drifters + 3 Dashers | the rope is a shield | Shield |
| 7 | Heavy Metal | 2 Brutes alone, then 4 Brutes + 12 Drifters + 2 Spitters | anchor & swing | Nova |
| 8 | Mixed Signals | every type, 4 pulses, two-sided | remix | Freeze + Mega Rope |
| 9 | The Gauntlet | densest wave: 26 Drifters, 8 Dashers, 4 Splitters, 4 Spitters, 4 Brutes | peak | Nova + Shield |
| 10 | The Warden | boss (§5) + fodder | cooperation | Hearts at phase change |

If the pair loses on wave 10, the game-over screen offers **"Retry the Warden"** (checkpoint: restart wave 10 with 3 lives; a checkpoint clear is capped at ★). Difficulty-simulation numbers use first attempts only.

## 10. Wave 0 — interactive tutorial (teach by doing, ≤ 90 s)
Shown automatically only the first time (flag in localStorage); **Skip** button always visible; replayable from the menu ("How to play"). Nothing can fail; no lives lost.
1. **Move** — ghost-finger animations on each half; two rings appear, one per orb shape. Each player moves their orb into their ring. ("Drag to move")
2. **Together** — one big ring; both orbs inside at once. ("Move together")
3. **Stretch** — two far-apart rings; rope crackles at full stretch. ("Stretch the rope")
4. **Sweep** — a sleepy Drifter floats in the middle. Cut it with the rope. ("Hit it with the rope!")
5. **Gem** — it drops a gem; collect it. ("Grab the gem")
6. **Danger** — a slow Drifter approaches an orb; touching it shows the heart flash ("Don't touch them!") without costing a life; the step completes when it's cut or touches.
7. **Mini-wave** — 5 drifters; clear them → "Ready!" → Wave 1 starts (Survival) or the chosen mode starts.

## 11. Endless — difficulty curve
Waves are generated from a **spawn budget**; each type has a cost (Drifter 1, Dasher 2, Splitter 3, Spitter 3, Brute 4) and an unlock wave (Dasher 2, Splitter 4, Spitter 5, Brute 7).
- Budget `B(n) = b0 + b1·n + b2·n²`; concurrent cap `C(n) = min(c0 + c1·n, cMax)`; pulse interval shrinks with n.
- Enemy speed multiplier `1 + s·ln(1+n)` (log — never unreactable), plus **overtime pressure**: after `T₀` minutes of play every enemy gains +x % speed per minute and the cap grows — this bounds strong runs to ~15 minutes.
- Every 5th wave is a "pulse wave" (two-sided ambushes); every 10th wave the Warden returns with +35 % HP per appearance.
- Hearts: one per 3 waves if below cap. Capsules every ~35 s.
- Best score and best wave are saved locally.

## 12. Screens & menus
Title (animated rope logo) → **Play here** (same device) / **Two phones** → mode select (Survival with best stars, Endless with best score/wave) → (tutorial if first time) → game.
- Settings row on title: mute (remembered), fullscreen (hidden where unsupported, e.g. iPhone), screen-shake on/off, Assist mode (+2 lives, enemies 15 % slower; best scores tagged), "How to play".
- Two phones: **Host** → room screen: QR code, link (Copy / Share), 5-character room code, "Waiting for partner…" → when connected, host picks mode, guest sees "Host is picking a mode". **Join** → code field (auto-uppercase) → Join. Opening the link/QR (`#join=CODE`) skips straight to connecting.
- In game: HUD top-left lives (heart shapes) + shield badge; top-centre wave & enemies left; top-right score & combo; pause button (top centre, 48 px). Rotate-device overlay in portrait.
- Pause: Resume / Restart / Main menu (+ mute). Online: either player can pause; both see it.
- Game over / victory: score, best, stars (Survival), **team stats** — enemies cut per player, best combo, hits taken per player, waves survived, time played — Play again / Menu (+ Retry the Warden).
- Disconnect overlay (see §13).

## 13. Netcode
- Transport: PeerJS (WebRTC data channel) via the public PeerJS broker; vendored `peerjs.min.js`. Host peer id = `tethered-v1-<code>` (5 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`). Collision (`unavailable-id`) → new code. Always wait for `peer.open` before `connect()` (PeerJS #1373). ICE list = Google + Cloudflare STUN + PeerJS's own TURN (re-added, since a custom config drops them).
- Channels: the PeerJS DataConnection (reliable, ordered, JSON) carries control + events + keyframes; a **pre-negotiated unreliable RTCDataChannel** (`id:100, ordered:false, maxRetransmits:0`) carries snapshots and inputs (PeerJS's `reliable:false` is still retransmitted). Falls back to the reliable channel if unavailable.
- Link: `https://<site>/#join=<CODE>`; QR encodes the link. Hash fragment never hits the server → works on any static host and offline cache.
- **Host-authoritative**: guest sends input `{t:'i', s:seq, x, y}` at 30 Hz (each packet repeats nothing — input is a level, not an edge, so loss is harmless); host simulates both orbs at 60 Hz, using the guest's latest input.
- Host sends **snapshots at 20 Hz** (quantised integers, JSON): players, rope midpoint, enemies (id, type, x, y, angle, state, timer), shots, gems, capsules, boss, HUD numbers, plus one-shot **events** (sound/particles/shake/haptics), each with an increasing event id so duplicates are dropped.
- Guest renders **interpolated** at (latest host time − 100 ms); the guest's own orb uses light **prediction** (local movement integration, softly corrected toward the authoritative position) so it feels responsive.
- **Heartbeats** every 500 ms both ways; "connection unstable" after 2 s of silence; 4 s ⇒ considered dropped (our own liveness — `close` is unreliable on mobile). Broker `open` timeout 10 s; ICE timeout 12 s (also on `close`/ICE `failed`).
- **Drop handling**: host pauses the game, shows "Partner disconnected – waiting 0:30"; host keeps its peer id registered. Guest retries connecting every 2 s (stored room code survives reload via sessionStorage). On reconnect the host sends a full snapshot, both see a 3-2-1 resume. After 30 s both sides offer **Keep waiting** / **Main menu**.
- **Local test mode**: `?net=local` swaps PeerJS for a BroadcastChannel transport so two tabs on one computer can play offline (also used by automated tests).
- Mode select / restart / pause are host-driven control messages on the same reliable channel.
- Failure messages: broker unreachable → "Can't reach the matchmaking server – check internet"; ICE fails within 12 s → "Phones couldn't connect directly. Try both on the same Wi-Fi, or turn on a hotspot on one phone."

## 14. Feel (juice) budget
Trauma-based screen shake (trauma², max 14 u, decay 1.6/s; toggle in settings). Hit-stop: life lost 120 ms, multi-cut ≥3 30 ms, boss phase 200 ms, boss death 400 ms + slow-mo. Pooled particles (≤500). Glow via pre-rendered sprites with additive blending (no shadowBlur). Rope draws as a wide faint stroke + bright core, flashes on kills. Audio: synthesized (oscillator + noise + envelopes), pentatonic pitch rise with combo, compressor on master, music bus ducked on hits. Haptics: cut 8 ms (throttled), life lost [60,40,90], wave start 30 ms, boss phase [40,30,40].

## 15. Architecture
```
index.html, style.css, manifest.webmanifest, sw.js, icons/
src/config.js        all tuning values (single object)
src/sim/*            pure game logic (no DOM): rng, math, game, enemies, boss, waves, tutorial, bots, snapshot
src/render/*         canvas renderer, fx (particles/shake), sprite cache
src/input.js         touch joysticks + keyboard
src/audio.js         Web Audio synth + music
src/net.js           transports (PeerJS / BroadcastChannel) + host/guest session protocol
src/ui.js            DOM screens & menus
src/save.js          localStorage wrapper
src/platform.js      wake lock, fullscreen, orientation, haptics
src/main.js          app state machine + game loop
tools/sim.mjs        headless bot simulation (worker threads)
tests/               Playwright tests
```
Extension seams (for later, not built): `ui.js` screen registry, `save.js` versioned schema, mode definitions in `waves.js`, transport interface in `net.js`.
