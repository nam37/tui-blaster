import { createCliRenderer, fg, StyledText, TextRenderable, type TextChunk } from "@opentui/core"
import { createInitialState, IDLE_INPUT, resetGame, stepGame, togglePause } from "../game/engine.js"
import type { GameState, InputState } from "../game/types.js"
import { renderGameFrameDetailed, type FrameColor, type RenderedFrame } from "./ascii.js"
import { createBattlezoneScene, syncBattlezoneScene } from "../three/scene.js"

interface TimedControls {
  forwardUntil: number
  reverseUntil: number
  leftUntil: number
  rightUntil: number
  fireUntil: number
}

const RAW_MOVE_REPEAT_BRIDGE_MS = 650
const RAW_TURN_REPEAT_BRIDGE_MS = 175
const RAW_FIRE_BRIDGE_MS = 220
const RELEASE_DRIVEN_HOLD_MS = 60_000
const FRAME_COLORS: Record<FrameColor, string> = {
  ui: "#00ff66",
  terrain: "#168f4a",
  obstacle: "#4dff88",
  enemy: "#ff3f5f",
  projectile: "#fff36a",
  explosion: "#ffffff",
  target: "#52ffd8",
  warning: "#ff3f5f",
}

export async function runOpenTuiGame(): Promise<void> {
  let state: GameState = createInitialState()
  let scene = createBattlezoneScene(state)
  const controls: TimedControls = {
    forwardUntil: 0,
    reverseUntil: 0,
    leftUntil: 0,
    rightUntil: 0,
    fireUntil: 0,
  }

  const renderer = await createCliRenderer({
    screenMode: "alternate-screen",
    targetFps: 30,
    maxFps: 60,
    exitOnCtrlC: false,
    consoleMode: "disabled",
    backgroundColor: "#000000",
    useKittyKeyboard: {
      disambiguate: true,
      alternateKeys: true,
      events: true,
    },
  })

  const demoMs = readNumberArg("--demo-ms")
  const screen = new TextRenderable(renderer, {
    id: "screen",
    content: "",
    position: "absolute",
    left: 0,
    top: 0,
    width: renderer.width,
    height: renderer.height,
    fg: "#00ff66",
    bg: "#000000",
    wrapMode: "none",
    truncate: true,
    selectable: false,
  })
  renderer.root.add(screen)

  const shutdown = (): void => {
    renderer.destroy()
  }

  renderer.keyInput.on("keypress", (key) => {
    const name = key.name.toLowerCase()
    const now = Date.now()
    const moveUntil = now + (key.source === "kitty" ? RELEASE_DRIVEN_HOLD_MS : RAW_MOVE_REPEAT_BRIDGE_MS)
    const turnUntil = now + (key.source === "kitty" ? RELEASE_DRIVEN_HOLD_MS : RAW_TURN_REPEAT_BRIDGE_MS)
    const fireUntil = now + (key.source === "kitty" ? RELEASE_DRIVEN_HOLD_MS : RAW_FIRE_BRIDGE_MS)

    if ((key.ctrl && name === "c") || name === "q") {
      shutdown()
      return
    }

    if (name === "p") {
      if (key.repeated) return
      togglePause(state)
      return
    }

    if (name === "r") {
      if (key.repeated) return
      state = resetGame()
      scene = createBattlezoneScene(state)
      return
    }

    applyControlPress(controls, name, key.sequence, moveUntil, turnUntil, fireUntil)
  })

  renderer.keyInput.on("keyrelease", (key) => {
    applyControlRelease(controls, key.name.toLowerCase(), key.sequence)
  })

  renderer.setFrameCallback(async (deltaTime) => {
    const dt = normalizeDeltaTime(deltaTime)
    stepGame(state, readInput(controls), dt)
    syncBattlezoneScene(scene, state)
    screen.width = renderer.width
    screen.height = renderer.height
    screen.content = frameToStyledText(renderGameFrameDetailed(state, scene, renderer.width, renderer.height))
  })

  renderer.start()

  if (demoMs !== null) {
    setTimeout(shutdown, demoMs)
  }
}

function frameToStyledText(frame: RenderedFrame): StyledText {
  const chunks: TextChunk[] = frame.chunks.map((chunk) => fg(FRAME_COLORS[chunk.color])(chunk.text))
  return new StyledText(chunks)
}

function applyControlPress(
  controls: TimedControls,
  name: string,
  sequence: string,
  moveUntil: number,
  turnUntil: number,
  fireUntil: number,
): void {
  if (name === "w" || name === "up") controls.forwardUntil = moveUntil
  if (name === "s" || name === "down") controls.reverseUntil = moveUntil
  if (name === "a" || name === "left") controls.leftUntil = turnUntil
  if (name === "d" || name === "right") controls.rightUntil = turnUntil
  if (name === "space" || sequence === " ") controls.fireUntil = fireUntil
}

function applyControlRelease(controls: TimedControls, name: string, sequence: string): void {
  if (name === "w" || name === "up") controls.forwardUntil = 0
  if (name === "s" || name === "down") controls.reverseUntil = 0
  if (name === "a" || name === "left") controls.leftUntil = 0
  if (name === "d" || name === "right") controls.rightUntil = 0
  if (name === "space" || sequence === " ") controls.fireUntil = 0
}

function readInput(controls: TimedControls): InputState {
  const now = Date.now()
  return {
    ...IDLE_INPUT,
    forward: controls.forwardUntil > now,
    reverse: controls.reverseUntil > now,
    turnLeft: controls.leftUntil > now,
    turnRight: controls.rightUntil > now,
    fire: controls.fireUntil > now,
  }
}

function normalizeDeltaTime(deltaTime: number): number {
  if (!Number.isFinite(deltaTime) || deltaTime <= 0) return 1 / 30
  return deltaTime > 1 ? deltaTime / 1000 : deltaTime
}

function readNumberArg(name: string): number | null {
  const prefix = `${name}=`
  const arg = process.argv.find((value) => value.startsWith(prefix))
  if (!arg) return null
  const parsed = Number(arg.slice(prefix.length))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}
