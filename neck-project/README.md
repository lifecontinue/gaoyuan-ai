# Neck Soccer 🤾

**Head the ball with your neck.** A browser game that uses your front camera
and face tracking to turn your head movements into the world's most relaxing
neck workout. No install, no account, fully client-side.

> Open `index.html` over **https** (or `localhost`) and allow the camera.
> If you skip the camera, it drops you into **Demo mode** (mouse control) so
> the game still works.

## How to play
- Your **head** is the paddle (a glowing ring on screen).
- **Move** left/right and up/down to get under the falling ball.
- **Nod / lift** into the ball for extra power and a bigger bounce.
- Keep the ball in the air. Let it fall past the bottom line and the round ends.
- Score points per save; build a **combo** for bonus points.

## Controls
| Mode | How |
|------|-----|
| Camera | Move your head; nod/lift for power |
| Demo (no camera) | Move the mouse to control the head |

- `G` toggles the debug overlay (head center, radius, collision state).

## Features
- Real-time face/head tracking via MediaPipe FaceMesh (468 landmarks).
- Whole-head collision body, not just the nose tip.
- Physics: gravity, bounce, momentum transfer, upward "heading" bias.
- Live HUD: score, combo, power, tracking status.
- Graceful fallback: camera busy / denied → automatic Demo mode.
- Everything runs **in your browser** — no video leaves the device.

## Tech
Single self-contained `index.html`: Canvas 2D rendering, MediaPipe FaceMesh
(`@mediapipe/face_mesh` via CDN), `getUserMedia`. No backend, no build step.

## Notes
- Requires a secure context for the camera: **https** or `localhost`.
  On plain http the camera is blocked and Demo mode is used automatically.
- Best in Chrome / Edge. "Not medical advice — just vibes."

## Project docs
Internal design / planning notes live in [`docs/`](docs/).
