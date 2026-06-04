import assert from "node:assert/strict"
import { createInitialState, IDLE_INPUT, stepGame } from "./engine.js"

function runFrames(frames: number, state = createInitialState(1234)): ReturnType<typeof createInitialState> {
  for (let frame = 0; frame < frames; frame += 1) {
    stepGame(state, IDLE_INPUT, 1 / 30)
  }
  return state
}

{
  const state = createInitialState(42)
  assert.equal(state.status, "playing")
  assert.equal(state.wave, 1)
  assert.ok(state.enemies.length >= 2)
  assert.ok(state.obstacles.length >= 5)
}

{
  const state = createInitialState(7)
  state.enemies = [
    {
      id: 900,
      position: { x: 0, z: 9 },
      heading: Math.PI,
      armor: 45,
      reload: 99,
      strafePhase: 0,
    },
  ]
  state.projectiles = []
  stepGame(state, { ...IDLE_INPUT, fire: true }, 1 / 30)
  runFrames(18, state)
  assert.ok(state.player.kills >= 1)
  assert.ok(state.player.score >= 100)
}

{
  const state = createInitialState(9)
  state.enemies = []
  state.projectiles = [
    {
      id: 901,
      owner: "enemy",
      position: { x: 0, z: 5 },
      heading: Math.PI,
      speed: 24,
      ttl: 1,
    },
  ]
  runFrames(16, state)
  assert.ok(state.player.armor < 100)
}

{
  const state = createInitialState(11)
  const startingX = state.player.position.x
  stepGame(state, { ...IDLE_INPUT, forward: true, turnRight: true }, 0.5)
  assert.notEqual(state.player.position.x, startingX)
}

console.log("game smoke tests passed")
