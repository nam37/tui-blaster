import { createInitialState, stepGame } from "./game/engine.js"
import { autopilotInput } from "./game/autopilot.js"
import { renderGameFrame } from "./render/ascii.js"
import { createBattlezoneScene, syncBattlezoneScene } from "./three/scene.js"

const state = createInitialState(0xdecafbad)
const scene = createBattlezoneScene(state)

for (let frame = 0; frame < 900; frame += 1) {
  stepGame(state, autopilotInput(state), 1 / 30)
  syncBattlezoneScene(scene, state)
}

console.log(
  JSON.stringify(
    {
      status: state.status,
      wave: state.wave,
      score: state.player.score,
      kills: state.player.kills,
      armor: Math.round(state.player.armor),
      enemies: state.enemies.length,
      projectiles: state.projectiles.length,
      sceneChildren: scene.scene.children.length,
    },
    null,
    2,
  ),
)
console.log("")
console.log(renderGameFrame(state, scene, 96, 32))
