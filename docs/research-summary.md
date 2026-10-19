# Tethered: Research Summary

This summary combines four parallel research reports:
- (a) co-op game design
- (b) mobile touch controls
- (c) PeerJS/WebRTC netcode
- (d) game feel, wave pacing, bosses, tutorials and accessibility

Sources are cited in the agent reports. The key ones are listed at the end.

## A. Mechanics to borrow

| From | Mechanic | How Tethered uses it |
|---|---|---|
| Snipperclips, Keep Talking | Your partner's body or actions are your tool, so neither player can succeed alone | The rope only exists between the two orbs. Every kill is a joint action. |
| Overcooked | Difficulty comes from communication, not controls. Each new mechanic "prompts a fresh conversation" | One new enemy per wave, and each one changes the conversation: Dasher means "get out of the lane", Spitter means "shield me", Brute means "you anchor, I swing". |
| Lovers in a Dangerous Spacetime | Colour-coded, player-specific pickups *confused* players and were cut | Link capsules need **both orbs inside one ring**. There are no per-player colour locks. |
| It Takes Two | Alternate who gets the hero moment | Kill credit goes to whoever is swinging. Anchor/swing roles flip moment to moment. |
| Rayman Origins / It Takes Two | Keep a failed player in the game | Nobody is ever eliminated. Lives are shared and a hit only means a short blink. |
| Unrailed, Keep Talking | Short escalating runs with breathers, about 5-minute units | Waves of 30–70 s with a 3.5 s breather and a gem magnet. A Survival run takes about 8–12 minutes. |
| Overcooked (criticism) | Star *gates* frustrate players | Stars are only a score to chase. Nothing is locked behind them. |
| Overcooked: All You Can Eat / Celeste | Assist mode without shame | An "Assist" toggle gives +2 lives and 15% slower enemies, worded neutrally. |
| PvZ, Mario 1-1 | Teach by doing, ≤8 words on screen, the hazard only after its solution is available | Wave 0 is a scripted tutorial. Each new enemy first appears alone, with a pictogram card. |
| L4D Director, Vampire Survivors, Brotato | Sawtooth intensity, spawn budgets, concurrent caps, endless that eventually outscales the player | The spawner uses a budget plus a concurrency cap, delivered in pulses. Endless speed scales logarithmically, with overtime pressure on top. |
| BrambleLash (the closest analogue) | Players were confused about *why* they won or lost | Every hit is legible: hit-stop, a flash, the culprit shown, and a heart-loss animation. |

## B. Technical approaches

**Input**
- Floating joysticks in follow mode. R = clamp(48, 0.12·min(w,h), 90) CSS px, with a 12% radial dead zone and the magnitude rescaled after it.
- Pointer Events with `setPointerCapture`. The owner is decided on `pointerdown` by which half of the screen was touched, with a centre dead strip. Fingers are released on `pointercancel`, `lostpointercapture`, `blur` and `visibilitychange`.
- Browser gestures are suppressed:
  - `touch-action:none`, `overscroll-behavior:none`, `user-select:none` and `-webkit-touch-callout:none`.
  - `preventDefault` on `gesturestart` (iOS pinch) and on `touchmove` with `{passive:false}`.

**Platform**
- Use `viewport-fit=cover` and keep the HUD inside `env(safe-area-inset-*)`.
- Size from `innerWidth`/`innerHeight` (not `100vh`), and cap the device pixel ratio at 2.
- A single "start" tap does several things:
  - unlocks the AudioContext
  - requests fullscreen and `screen.orientation.lock('landscape')`, both in try/catch
  - requests the Wake Lock, which is re-acquired on `visibilitychange`
- The fullscreen button is hidden where unsupported (iPhone). A rotate overlay is shown in portrait.
- `navigator.vibrate` is feature-detected. It doesn't exist on iOS, which is fine because haptics are a bonus.

**Netcode**
- PeerJS 1.5.5 is vendored.
- **Wait for `peer.open` before `connect()`** (#1373).
- Peer ID is `tethered-v1-<code>`, with a 5-character code from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.
- Channels:
  - A reliable JSON DataConnection carries control messages and events.
  - A **pre-negotiated unreliable channel** (`negotiated:true, id:100, ordered:false, maxRetransmits:0`) carries snapshots and inputs. PeerJS's own `reliable:false` is still retransmitted. If it is unavailable, everything falls back to the reliable channel.
- The host sends snapshots at 20 Hz. The guest renders 100 ms behind the host clock with interpolation, and predicts its own orb.
- Inputs are sent at 30 Hz.
- Liveness comes from our own heartbeats, not from `close`, which is unreliable on mobile. After 2 s of silence the game shows "unstable"; after 4 s the connection counts as dropped.
- Timeouts are ours: 10 s for the broker `open` and 12 s for ICE. Each produces a clear message suggesting the same Wi-Fi or a hotspot.
- ICE servers:
  - Google STUN
  - Cloudflare STUN
  - PeerJS's TURN entries, kept because a custom `config` would otherwise drop them
- Rejoining:
  - The host never destroys its peer while a guest is missing.
  - The guest retries with backoff and carries a session token in sessionStorage, so it gets the same slot back.
  - The host sends a keyframe and a 3-2-1 countdown.
  - Background tabs: the host pauses when either side is hidden. This is disabled in local two-tab test mode.
- QR codes use qrcode-generator (vendored, 20 KB) with error-correction level M. The URL format is `#join=CODE`, read on load and then stripped with `history.replaceState`.
- Testing:
  - Two Playwright contexts work with headless Chromium WebRTC.
  - The broker can be swapped with `?peer=localhost:9000` (a local `peer` server) so tests don't depend on 0.peerjs.com.
  - Drops are simulated by closing the `RTCPeerConnection` or closing the guest page.

**Feel**
- Screen shake is trauma-based: shake = trauma², maximum about 14 world units, decaying at about 1.6/s, driven by smooth noise.
- Hit-stop durations:
  - 0 ms for a single kill
  - 30 ms for 3+ kills in one sweep
  - 120 ms for a life lost
  - 200 ms for a boss phase change
  - 400 ms for the boss death
- Glow is drawn as pre-rendered sprites with `lighter` blending. `shadowBlur` is not used.
- Particles come from a pool of about 500 and live for 0.3–0.6 s.
- Audio:
  - Master compressor, with separate SFX and music buses. The music is ducked on hits.
  - Combo pitch climbs a pentatonic scale, capped at 2 octaves.
  - Envelopes are exponential. Retriggers are limited to 3 voices with 30 ms spacing.

**Readability and colourblind safety**
- Colours come from the Okabe-Ito palette:
  - P1: sky blue, round
  - P2: orange, diamond
  - Enemies: reddish purple, told apart by shape
  - Gems: bluish green
  - Telegraphs: yellow, with hatching and blinking that speeds up
- Nothing relies on red versus green. The concurrent enemy count stays at or below about 28. Death particles fade quickly so debris is never mistaken for threats. Shake can be turned off.

## C. Pitfalls to avoid

1. **Blame dynamics with shared lives.** Hit feedback describes the situation, not the person. The user requires per-player stats on the end screen, so they are shown neutrally, framed as "team stats", next to the team's best combo.
2. **One player carrying the other.** A stationary partner still makes a useful anchor. Brutes and boss shields require *relative* motion, so both players matter.
3. **Physics frustration** (Chained Together). The spring is soft and the maximum stretch is clamped. The constraint only removes separating velocity, so it never flings a player into an enemy. Rope hitboxes are generous and orb hitboxes are tight.
4. **Unreadable failure** (BrambleLash). Hits get hit-stop, the culprit flashes, and the heart icon visibly breaks.
5. **Cramped twin sticks on one phone** (Snipperclips criticism). Sticks are floating and spawn anywhere on each half. There is a dead strip at the centre, and the top band is kept for the HUD.
6. **PeerJS traps:**
   - `connect()` called before `open`
   - no ICE timeout
   - `close` not firing on mobile
   - a custom ICE `config` dropping the default TURN entries
   - `reliable:false` not actually being unreliable
   - the broker taking minutes to open (handled with a 10 s timeout and a retry)
7. **Mobile networks.** Carrier-grade NAT means some 4G-to-4G pairs will never connect without a paid TURN server. The game says so clearly and recommends the same Wi-Fi or a hotspot.
8. **iPhone has no element fullscreen and no vibration.** Both are feature-detected and hidden. Installing as a PWA gives a chrome-free view.
9. **Hidden tabs freeze `requestAnimationFrame`.** The game pauses on hide in online play. Local two-tab testing uses two windows, or the local transport with the visibility pause disabled.
10. **Photosensitivity.** There are no large full-screen flashes faster than 3 Hz, and the damage flash is a white overlay at 0.35 alpha, never red.

## D. Key sources

**Netcode**
- PeerJS API and issues (#1373, #1350, #1336, #1281)
- Gaffer on Games, "Snapshot Interpolation"
- Valve, "Source Multiplayer Networking"
- Gambetta, "Client-Server Game Architecture"
- Metered Open Relay and Cloudflare Realtime TURN pricing

**Platform**
- MDN: Pointer Events, `touch-action`, Screen Wake Lock
- WebKit bugs 254545 (wake lock in standalone mode) and 206854 (iPhone fullscreen)
- caniuse: `orientation.lock`

**Game feel and design**
- Eiserloh, "Juicing Your Cameras With Math" (GDC 2016)
- Nijman, "The Art of Screenshake"
- Jonasson & Purho, "Juice It or Lose It"
- George Fan, "How I Got My Mom to Play Through PvZ"
- Valve, L4D2 Director scripts
- Brotato wiki
- Okabe-Ito palette, Xbox Accessibility Guidelines 103

**Co-op design**
- Ghost Town Games interviews and postmortem
- Game Developer, "Co-op communication in Lovers in a Dangerous Spacetime"
- Steel Crate Games GDC talk
- Reviews of It Takes Two, Snipperclips, Unrailed, BrambleLash and Unravel Two
