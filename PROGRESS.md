# Tethered — Progress Log

Resumable log of the build. If the session is interrupted, read this first and continue from the first unchecked phase.

## Phases
- [ ] 1. Research (4 parallel subagents) → `docs/research-summary.md`
- [ ] 2. Plan → `docs/DESIGN.md`, all tuning in `src/config.js`
- [ ] 3. Build game + bots + simulation + tuning → `tools/sim.mjs`, `docs/sim-results.md`
- [ ] 4. Independent Playwright review + fixes + re-simulation
- [ ] 5. Deploy (GitHub Pages)
- [ ] 6. Word documents (player guide, design doc, pitch) → `deliverables/`
- [ ] 7. Delivery summary

## Decisions & assumptions
- Static ES-module web app, no build step. Vendored libs: PeerJS 1.5.5 (`vendor/peerjs.min.js`, 87KB) and qrcode-generator (`vendor/qrcode.min.js`, 20KB) so the app works without third-party CDNs and same-device mode works offline.
- Dev-only tooling (Playwright, docx) lives in `node_modules`; not shipped.

## Log
- 2026-10-16: Repo initialised, tooling installed, research agents launched.
