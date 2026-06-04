# TUI Blaster

`TUI Blaster` is a Battlezone-inspired terminal tank game built around OpenTUI and Three.js. OpenTUI owns the terminal application loop and HUD, while the forward viewport is rendered from a real Three.js scene with a CPU dot-matrix rasterizer that projects Three.js camera rays, mesh triangles, and depth into terminal output.

## Requirements

- Bun 1.2 or newer for the interactive OpenTUI app
- Node 20 or newer for local simulation and tests
- Windows or macOS

OpenTUI's current TypeScript runtime is Bun-first. This project depends on platform-neutral npm packages so Windows and macOS installs pull the appropriate native OpenTUI and Bun optional packages. `npm run start` uses `scripts/run-bun.mjs` to prefer the locally installed Bun binary and fall back to a global `bun` command.

## Setup

```sh
npm install
npm run start
```

## Scripts

- `npm run start`: launch the interactive OpenTUI game
- `npm run start -- --demo-ms=750`: launch briefly and exit for a terminal smoke test
- `npm run simulate`: run a headless autopilot simulation and print a sample terminal frame
- `npm run smoke:bun`: verify Bun can import the OpenTUI app modules without launching fullscreen mode
- `npm run test`: run game smoke tests
- `npm run typecheck`: run TypeScript checks

## Controls

- `W` / `Up`: move forward
- `S` / `Down`: reverse
- `A` / `Left`: rotate left
- `D` / `Right`: rotate right
- `Space`: fire
- `P`: pause or resume
- `R`: restart
- `Q` / `Ctrl+C`: quit

## Project Layout

- `PLAN.md`: build plan and delivery checklist
- `src/game`: deterministic gameplay, AI, collisions, waves, and tests
- `src/render`: OpenTUI adapter and Three.js-backed terminal dot renderer
- `src/three`: Three.js scene construction and synchronization
- `src/simulate.ts`: Node-friendly headless verification path
