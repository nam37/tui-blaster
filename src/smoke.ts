import { createInitialState, stepGame } from "./game/engine.js"
import { autopilotInput } from "./game/autopilot.js"
import { renderGameFrame } from "./render/ascii.js"
import { runOpenTuiGame } from "./render/opentui-app.js"
import { createBattlezoneScene, syncBattlezoneScene } from "./three/scene.js"

const state = createInitialState(2026)
const scene = createBattlezoneScene(state)

for (let frame = 0; frame < 30; frame += 1) {
  stepGame(state, autopilotInput(state), 1 / 30)
  syncBattlezoneScene(scene, state)
}

const frame = renderGameFrame(state, scene, 90, 28)

if (!frame.includes("TUI BLASTER")) {
  throw new Error("Smoke render did not include the game title")
}

if (typeof runOpenTuiGame !== "function") {
  throw new Error("OpenTUI entrypoint did not import")
}

console.log(`bun smoke ok: wave=${state.wave} enemies=${state.enemies.length} sceneChildren=${scene.scene.children.length}`)
