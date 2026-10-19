# Tethered — Progress Log

Resumable log of the build. If the session is interrupted, read this first and continue from the first unchecked phase.

## Phases
- [x] 1. Research (4 parallel subagents) → `docs/research-summary.md`
- [x] 2. Plan → `docs/DESIGN.md`, all tuning in `src/config.js`
- [~] 3. Build game + bots + simulation + tuning → `tools/sim.mjs`, `docs/sim-results.md`
  - [x] sim core, enemies, boss, waves, tutorial, scoring
  - [x] renderer, input, audio, net (PeerJS + BroadcastChannel), UI, PWA
  - [x] bots (planner, 3 human-model profiles) + parallel sim harness
  - [x] tuning v1 meets all targets (sim-out/sim-v1.txt)
  - [ ] browser verification of all flows, perf check, size check
- [ ] 4. Independent Playwright review + fixes + re-simulation
- [ ] 5. Deploy (GitHub Pages)
- [ ] 6. Word documents (player guide, design doc, pitch) → `deliverables/`
- [ ] 7. Delivery summary

## Decisions & assumptions
- Static ES-module web app, no build step. Vendored libs: PeerJS 1.5.5 (`vendor/peerjs.min.js`, 87KB) and qrcode-generator (`vendor/qrcode.min.js`, 20KB) so the app works without third-party CDNs and same-device mode works offline.
- Dev-only tooling (Playwright, docx) lives in `node_modules`; not shipped.

## Log
- 2026-10-16: Repo initialised, tooling installed, research agents launched.

- 2026-10-19: World rescaled to 1500x750 (2:1, fills modern phones; entities larger on small screens).
- Bot redesign: short-horizon planner (scores candidate stick directions by predicted danger, rope sweeps, goals). Bot skill profiles fixed as human models BEFORE game tuning (weak ~325ms reaction, average ~225ms, strong ~150ms).
- Design changes driven by simulation: newborn enemies harmless for 0.45s; boss shield nodes don't hurt on touch; boss beam slower (0.7 rad/s, 64deg arc); boss holds attacks while core is open; flat core damage while taut rope crosses it; spitters are slow 'turrets' (hold fire when an orb is within 200); brutes have 2 armour plates (slow hit = lose a plate, fast hit = kill); survival hearts after waves 3,5-9.
- Tuning v1 (200 runs/skill/mode): Survival weak reach>=4 70%, average clear 40%, strong clear 95% (3* 5.5%). Endless weak >=3 waves 98%, average median 5:32, strong median 10:21, >15min 0%.
