# TUI Blaster Plan

## Goal

Build a terminal-first, Battlezone-inspired tank combat game using OpenTUI for the application shell and Three.js for the 3D world model. The game should feel like a clean vector-tank homage rather than a branded clone.

## Product Direction

- Title: `TUI Blaster`
- Genre: first-person wireframe tank combat
- Tone: sparse green-on-black vector display with a tactical HUD
- Runtime target: Bun, because OpenTUI's current TypeScript API is Bun-first
- Verification target: Node-compatible game simulation tests for logic that does not require an interactive terminal

## Core Loop

1. Drive the player tank through a flat arena.
2. Track enemies on radar and in the forward viewport.
3. Rotate, advance, reverse, and fire shells.
4. Destroy enemy tanks before they land a shot.
5. Survive escalating waves while score, armor, reload, and wave state update in the HUD.

## Controls

- `W` / `Up`: move forward
- `S` / `Down`: reverse
- `A` / `Left`: rotate left
- `D` / `Right`: rotate right
- `Space`: fire
- `P`: pause or resume
- `R`: restart after game over
- `Q` / `Ctrl+C`: quit

## Architecture

- `src/game/`: deterministic game state, physics, AI, collisions, waves, and projection helpers
- `src/render/`: terminal viewport, HUD, radar, and OpenTUI adapter
- `src/three/`: Three.js scene construction helpers used by the OpenTUI-facing renderer
- `src/index.ts`: interactive application entrypoint
- `src/simulate.ts`: headless simulation for quick verification on machines without Bun/OpenTUI

## Rendering Strategy

The primary game view uses terminal-friendly wireframe projection:

- Horizon and scanline grid for depth cues
- Perspective-projected obstacle and tank silhouettes
- Projectile tracers
- Radar panel for nearby objects
- HUD for score, armor, reload, wave, enemy count, and status messages

Three.js owns the canonical 3D scene graph objects for terrain, obstacles, tanks, shells, and camera placement. The terminal renderer uses a lightweight projection layer so the gameplay stays readable even where native WebGPU terminal rendering is unavailable.

## MVP Features

- Player tank movement and heading
- Arena bounds with static pyramid/block obstacles
- Enemy tank AI with pursuit, strafing, and firing
- Player and enemy projectiles
- Collision with tanks, bounds, and obstacles
- Wave spawning and score progression
- Pause, restart, game-over state
- Terminal HUD, radar, and vector viewport
- Headless smoke test

## Stretch Features

- Flying saucer bonus target
- Multiple enemy archetypes
- Sound hooks or terminal bell effects
- High-score persistence
- Native `@opentui/three` render path once local Bun/WebGPU support is available

## Delivery Checklist

- Project metadata and scripts are present.
- The Markdown plan exists.
- The app has an interactive OpenTUI entrypoint.
- The game can be simulated headlessly.
- Basic tests or smoke checks pass.
- README explains setup, controls, and runtime requirements.
