# Tethered

Two orbs. One rope. Cut through everything — together.

Tethered is a 2-player co-op action game for phones. It runs as a static web app (installable PWA). There are two ways to play:

- **Same device:** two players share one phone or tablet, with one joystick each on their half of the screen.
- **Two phones:** one phone hosts; the other joins by QR code, link or room code. Connections are peer-to-peer over WebRTC via PeerJS.

There are two modes: **Survival** (10 waves, a boss and up to 3 stars) and **Endless**.

## Run locally

```bash
node tools/serve.mjs 8080
```

Open http://localhost:8080/.

You can also use any static server. Two-phone play over WebRTC needs HTTPS on real phones, but `localhost` works for testing.

**Local two-tab test of two-phone play:** open `http://localhost:8080/?net=local` in two tabs or windows. One tab hosts; paste the join link into the other. This uses BroadcastChannel, so it works offline.

**Watch bots play:** add `?demo=strong&mode=survival` to the URL. The `demo` level can be `weak`, `average` or `strong`; `mode` can be `survival` or `endless`.

## Tests and simulation

```bash
npm install
npx playwright install chromium
```

Then run any of these:

- **End-to-end tests:** `node tests/e2e.mjs`
  - Add `--peer` to also test real PeerJS between two browser contexts.
- **Difficulty simulation:** `node tools/sim.mjs --runs 200`
  - Bots play both modes at three skill levels.
  - Add `--override '{"enemies":{"drifter":{"speed":70}}}'` to try a tuning change without editing files.
- **Rebuild the Word documents:** `node tools/make-docs.mjs sim-out/sim-final.json <site-url>`

All tuning values are in `src/config.js`.

## Deploy (GitHub Pages)

The site is the repository root; no build step is needed.

1. Push this repository to GitHub.
2. Go to **Settings → Pages** and set the source to **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The game is served at `https://<user>.github.io/<repo>/`.

Netlify works too: drag the project folder onto https://app.netlify.com/drop.

Bump `VERSION` in `sw.js` on every deploy so installed copies update.

## Project layout

| Path | What it holds |
|---|---|
| `index.html`, `style.css`, `manifest.webmanifest`, `sw.js`, `icons/` | App shell and PWA files |
| `src/config.js` | All tuning values and the Survival wave scripts |
| `src/sim/` | Pure game logic (runs in Node too): game, enemies and boss, waves, tutorial, bots, snapshots |
| `src/render/` | Canvas renderer and effects |
| `src/input.js` | Input handling |
| `src/audio.js` | Web Audio synthesis |
| `src/net.js` | Transports and sessions |
| `src/ui.js` | Screens |
| `src/save.js` | Saved data |
| `src/platform.js` | Wake lock, fullscreen, haptics |
| `src/main.js` | App controller |
| `vendor/` | PeerJS 1.5.5 and qrcode-generator (both MIT) |
| `docs/` | Design document, research summary, simulation results |
| `deliverables/` | Word documents |
