import { angleDelta, angleTo } from "./math.js"
import type { GameState, InputState } from "./types.js"
import { IDLE_INPUT } from "./engine.js"

export function autopilotInput(state: GameState): InputState {
  const target = state.enemies[0]
  if (!target) return IDLE_INPUT
  const desired = angleTo(state.player.position, target.position)
  const delta = angleDelta(state.player.heading, desired)
  return {
    forward: Math.abs(delta) < 0.35,
    reverse: false,
    turnLeft: delta < -0.04,
    turnRight: delta > 0.04,
    fire: Math.abs(delta) < 0.1,
  }
}
