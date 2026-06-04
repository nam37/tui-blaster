import * as THREE from "three"
import { clamp, dot, forwardVector, rightVector } from "../game/math.js"
import { getFarRange, getReloadRatio } from "../game/engine.js"
import type { GameState, Vec2 } from "../game/types.js"
import type { BattlezoneScene } from "../three/scene.js"

const LIGHT_DIRECTION = new THREE.Vector3(-0.35, 0.8, 0.45).normalize()
const edgeGeometryBySource = new Map<string, THREE.EdgesGeometry>()

export type FrameColor = "ui" | "terrain" | "obstacle" | "enemy" | "projectile" | "explosion" | "target" | "warning"

export interface FrameChunk {
  text: string
  color: FrameColor
}

export interface RenderedFrame {
  text: string
  chunks: FrameChunk[]
}

class TextCanvas {
  private cells: string[][]
  private colors: FrameColor[][]

  constructor(
    readonly width: number,
    readonly height: number,
    fill = " ",
    color: FrameColor = "ui",
  ) {
    this.cells = Array.from({ length: height }, () => Array.from({ length: width }, () => fill))
    this.colors = Array.from({ length: height }, () => Array.from({ length: width }, () => color))
  }

  put(x: number, y: number, char: string, color: FrameColor = "ui"): void {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return
    this.cells[iy][ix] = char[0] ?? " "
    this.colors[iy][ix] = color
  }

  text(x: number, y: number, value: string, color: FrameColor = "ui"): void {
    for (let index = 0; index < value.length; index += 1) {
      this.put(x + index, y, value[index], color)
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, char = "#", color: FrameColor = "ui"): void {
    let ax = Math.round(x0)
    let ay = Math.round(y0)
    const bx = Math.round(x1)
    const by = Math.round(y1)
    const dx = Math.abs(bx - ax)
    const sx = ax < bx ? 1 : -1
    const dy = -Math.abs(by - ay)
    const sy = ay < by ? 1 : -1
    let err = dx + dy

    while (true) {
      this.put(ax, ay, char, color)
      if (ax === bx && ay === by) break
      const e2 = err * 2
      if (e2 >= dy) {
        err += dy
        ax += sx
      }
      if (e2 <= dx) {
        err += dx
        ay += sy
      }
    }
  }

  box(x: number, y: number, width: number, height: number, title?: string, color: FrameColor = "ui"): void {
    if (width < 2 || height < 2) return
    this.text(x, y, `+${"-".repeat(width - 2)}+`, color)
    for (let row = 1; row < height - 1; row += 1) {
      this.put(x, y + row, "|", color)
      this.put(x + width - 1, y + row, "|", color)
    }
    this.text(x, y + height - 1, `+${"-".repeat(width - 2)}+`, color)
    if (title) this.text(x + 2, y, ` ${title.slice(0, Math.max(0, width - 6))} `, color)
  }

  toString(): string {
    return this.cells.map((row) => row.join("").replace(/\s+$/u, "")).join("\n")
  }

  toChunks(): FrameChunk[] {
    const chunks: FrameChunk[] = []
    const append = (text: string, color: FrameColor): void => {
      if (text.length === 0) return
      const previous = chunks[chunks.length - 1]
      if (previous && previous.color === color) {
        previous.text += text
      } else {
        chunks.push({ text, color })
      }
    }

    for (let y = 0; y < this.height; y += 1) {
      let end = this.width - 1
      while (end >= 0 && this.cells[y][end] === " ") end -= 1
      for (let x = 0; x <= end; x += 1) append(this.cells[y][x], this.colors[y][x])
      if (y < this.height - 1) append("\n", "ui")
    }

    return chunks
  }
}

interface ScreenPoint {
  x: number
  y: number
  ndcX: number
  ndcY: number
  depth: number
}

class DotBuffer {
  private chars: string[]
  private colors: FrameColor[]
  private depths: Float64Array

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.chars = Array.from({ length: width * height }, () => " ")
    this.colors = Array.from({ length: width * height }, () => "terrain")
    this.depths = new Float64Array(width * height)
    this.depths.fill(Number.POSITIVE_INFINITY)
  }

  put(x: number, y: number, depth: number, char: string, color: FrameColor = "terrain"): void {
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return
    const index = iy * this.width + ix
    if (depth >= this.depths[index]) return
    this.depths[index] = depth
    this.chars[index] = char[0] ?? "."
    this.colors[index] = color
  }

  flushTo(canvas: TextCanvas, offsetX: number, offsetY: number): void {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = y * this.width + x
        const char = this.chars[index]
        if (char !== " ") canvas.put(offsetX + x, offsetY + y, char, this.colors[index])
      }
    }
  }
}

export function renderGameFrame(state: GameState, battlezone: BattlezoneScene, width: number, height: number): string {
  return renderGameFrameDetailed(state, battlezone, width, height).text
}

export function renderGameFrameDetailed(
  state: GameState,
  battlezone: BattlezoneScene,
  width: number,
  height: number,
): RenderedFrame {
  const safeWidth = Math.max(70, Math.floor(width || 100))
  const safeHeight = Math.max(24, Math.floor(height || 32))
  const canvas = new TextCanvas(safeWidth, safeHeight)
  const radarWidth = Math.min(25, Math.max(18, Math.floor(safeWidth * 0.24)))
  const footerHeight = 3
  const hudHeight = 3
  const viewWidth = safeWidth - radarWidth - 1
  const viewHeight = safeHeight - hudHeight - footerHeight

  drawHud(canvas, state, safeWidth)
  drawThreeView(canvas, state, battlezone, 0, hudHeight, viewWidth, viewHeight)
  drawRadar(canvas, state, viewWidth + 1, hudHeight, radarWidth, viewHeight)
  drawFooter(canvas, state, 0, safeHeight - footerHeight, safeWidth, footerHeight)
  return { text: canvas.toString(), chunks: canvas.toChunks() }
}

function drawHud(canvas: TextCanvas, state: GameState, width: number): void {
  const armor = bar(state.player.armor / 100, 18)
  const reload = bar(getReloadRatio(state), 12)
  const compass = headingLabel(state.player.heading)
  const first = `TUI BLASTER  SCORE ${state.player.score.toString().padStart(6, "0")}  WAVE ${state.wave}  ARMOR ${armor}  GUN ${reload}`
  canvas.text(0, 0, first.slice(0, width))
  canvas.text(0, 1, `HDG ${compass}  ENEMIES ${state.enemies.length}  SHELLS ${state.projectiles.length}  STATUS ${state.status.toUpperCase()}`.slice(0, width))
  const message = state.messages[0]?.text ?? "Three.js camera online"
  canvas.text(0, 2, `MSG ${message}`.slice(0, width))
}

function drawThreeView(canvas: TextCanvas, state: GameState, battlezone: BattlezoneScene, x: number, y: number, width: number, height: number): void {
  canvas.box(x, y, width, height, "THREE DOT VIEW")
  const innerX = x + 1
  const innerY = y + 1
  const innerWidth = width - 2
  const innerHeight = height - 2
  const centerX = innerX + Math.floor(innerWidth / 2)

  battlezone.camera.aspect = innerWidth / Math.max(1, innerHeight * 2)
  battlezone.camera.updateProjectionMatrix()
  battlezone.scene.updateMatrixWorld(true)
  battlezone.camera.updateMatrixWorld(true)

  const dots = new DotBuffer(innerWidth, innerHeight)
  renderGroundDots(dots, state, battlezone.camera)
  renderThreeDots(dots, battlezone)
  dots.flushTo(canvas, innerX, innerY)

  const targetY = innerY + innerHeight - 1
  canvas.text(centerX - 7, targetY, "\\___ TARGET ___/", "target")
  canvas.put(centerX, innerY + Math.floor(innerHeight * 0.52), "+", "target")
}

function renderGroundDots(dots: DotBuffer, state: GameState, camera: THREE.PerspectiveCamera): void {
  const cameraPosition = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)
  const cameraSpace = new THREE.Vector3()
  const worldPoint = new THREE.Vector3()
  const rayTarget = new THREE.Vector3()

  for (let y = 0; y < dots.height; y += 1) {
    for (let x = 0; x < dots.width; x += 1) {
      if (!shouldSampleGroundCell(x, y)) continue

      const ndcX = (x / Math.max(1, dots.width - 1)) * 2 - 1
      const ndcY = 1 - (y / Math.max(1, dots.height - 1)) * 2
      rayTarget.set(ndcX, ndcY, 0.35).unproject(camera)
      const direction = rayTarget.sub(cameraPosition).normalize()
      if (direction.y >= -0.001) continue

      const t = -cameraPosition.y / direction.y
      if (t <= 0) continue

      worldPoint.copy(cameraPosition).addScaledVector(direction, t)
      const distanceFromCenter = Math.hypot(worldPoint.x, worldPoint.z)
      if (distanceFromCenter > state.arenaRadius) continue

      cameraSpace.copy(worldPoint).applyMatrix4(camera.matrixWorldInverse)
      const depth = -cameraSpace.z
      if (depth <= camera.near || depth >= camera.far) continue

      const distanceFade = clamp(1 - depth / getFarRange(), 0.05, 1)
      const density = 0.22 + distanceFade * 0.48
      if (hash2(x, y) > density) continue

      dots.put(x, y, depth + 0.05, "\u00b7", "terrain")
    }
  }
}

function shouldSampleGroundCell(x: number, y: number): boolean {
  return (x + y) % 2 === 0 || y % 5 === 0
}

function renderThreeDots(dots: DotBuffer, battlezone: BattlezoneScene): void {
  const camera = battlezone.camera

  battlezone.scene.traverse((object) => {
    if (!object.visible || object === battlezone.playerRig || object === battlezone.camera) return
    if (object.userData.tuiSkip) return

    if (object instanceof THREE.Mesh && object.geometry instanceof THREE.BufferGeometry) {
      rasterizeMesh(object, camera, dots)
    } else if (object instanceof THREE.LineSegments && object.geometry instanceof THREE.BufferGeometry) {
      rasterizeLineSegments(object, camera, dots)
    }
  })
}

function rasterizeMesh(
  mesh: THREE.Mesh<THREE.BufferGeometry>,
  camera: THREE.PerspectiveCamera,
  dots: DotBuffer,
): void {
  const geometry = mesh.geometry
  const position = geometry.getAttribute("position")
  if (!position) return

  const layer = layerForObject(mesh)
  if (layer === "grid") return

  const index = geometry.index
  const triangleCount = index ? index.count / 3 : position.count / 3

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const ia = index ? index.getX(triangle * 3) : triangle * 3
    const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1
    const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2
    const worldA = readWorldVertex(position, ia, mesh.matrixWorld)
    const worldB = readWorldVertex(position, ib, mesh.matrixWorld)
    const worldC = readWorldVertex(position, ic, mesh.matrixWorld)
    rasterizeTriangle(worldA, worldB, worldC, layer, camera, dots)
  }

  if (layer === "enemy" || layer === "obstacle") {
    rasterizeMeshEdges(mesh, layer, camera, dots)
  }
}

function rasterizeMeshEdges(
  mesh: THREE.Mesh<THREE.BufferGeometry>,
  layer: string,
  camera: THREE.PerspectiveCamera,
  dots: DotBuffer,
): void {
  let edgeGeometry = edgeGeometryBySource.get(mesh.geometry.uuid)
  if (!edgeGeometry) {
    edgeGeometry = new THREE.EdgesGeometry(mesh.geometry, 12)
    edgeGeometryBySource.set(mesh.geometry.uuid, edgeGeometry)
  }

  rasterizeGeometryLineSegments(edgeGeometry, mesh.matrixWorld, layer, camera, dots)
}

function rasterizeTriangle(
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
  worldC: THREE.Vector3,
  layer: string,
  camera: THREE.PerspectiveCamera,
  dots: DotBuffer,
): void {
  const a = projectWorldPoint(worldA, camera, dots.width, dots.height)
  const b = projectWorldPoint(worldB, camera, dots.width, dots.height)
  const c = projectWorldPoint(worldC, camera, dots.width, dots.height)
  if (!a || !b || !c) return
  if (outsideTriangle(a, b, c)) return

  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)))
  const maxX = Math.min(dots.width - 1, Math.ceil(Math.max(a.x, b.x, c.x)))
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)))
  const maxY = Math.min(dots.height - 1, Math.ceil(Math.max(a.y, b.y, c.y)))
  const area = edge(a.x, a.y, b.x, b.y, c.x, c.y)
  if (Math.abs(area) < 0.05) return

  const normal = new THREE.Vector3().subVectors(worldB, worldA).cross(new THREE.Vector3().subVectors(worldC, worldA)).normalize()
  const shade = clamp(normal.dot(LIGHT_DIRECTION) * 0.5 + 0.55, 0.18, 1)
  const color = colorForLayer(layer)

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const sampleX = x + 0.5
      const sampleY = y + 0.5
      const wa = edge(b.x, b.y, c.x, c.y, sampleX, sampleY) / area
      const wb = edge(c.x, c.y, a.x, a.y, sampleX, sampleY) / area
      const wc = edge(a.x, a.y, b.x, b.y, sampleX, sampleY) / area
      if (wa < -0.001 || wb < -0.001 || wc < -0.001) continue

      const depth = wa * a.depth + wb * b.depth + wc * c.depth
      const density = densityForLayer(layer, depth, shade)
      if (hash2(x + Math.floor(depth), y + layer.length * 13) > density) continue
      dots.put(x, y, depth, glyphForLayer(layer, depth, shade), color)
    }
  }
}

function rasterizeLineSegments(
  lineSegments: THREE.LineSegments<THREE.BufferGeometry>,
  camera: THREE.PerspectiveCamera,
  dots: DotBuffer,
): void {
  const layer = layerForObject(lineSegments)
  if (layer === "grid") return

  const position = lineSegments.geometry.getAttribute("position")
  if (!position) return

  rasterizeGeometryLineSegments(lineSegments.geometry, lineSegments.matrixWorld, layer, camera, dots)
}

function rasterizeGeometryLineSegments(
  geometry: THREE.BufferGeometry,
  matrixWorld: THREE.Matrix4,
  layer: string,
  camera: THREE.PerspectiveCamera,
  dots: DotBuffer,
): void {
  const position = geometry.getAttribute("position")
  if (!position) return

  const color = colorForLayer(layer)
  for (let index = 0; index + 1 < position.count; index += 2) {
    const a = projectWorldPoint(readWorldVertex(position, index, matrixWorld), camera, dots.width, dots.height)
    const b = projectWorldPoint(readWorldVertex(position, index + 1, matrixWorld), camera, dots.width, dots.height)
    if (!a || !b || outsideSameSide(a, b)) continue
    drawDotLine(dots, a, b, glyphForLayer(layer, Math.min(a.depth, b.depth), 1), color)
  }
}

function drawDotLine(dots: DotBuffer, a: ScreenPoint, b: ScreenPoint, glyph: string, color: FrameColor): void {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)))
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    dots.put(a.x + dx * t, a.y + dy * t, a.depth + (b.depth - a.depth) * t, glyph, color)
  }
}

function readWorldVertex(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, index: number, matrixWorld: THREE.Matrix4): THREE.Vector3 {
  return new THREE.Vector3(attribute.getX(index), attribute.getY(index), attribute.getZ(index)).applyMatrix4(matrixWorld)
}

function projectWorldPoint(
  worldPoint: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): ScreenPoint | null {
  const cameraPoint = worldPoint.clone().applyMatrix4(camera.matrixWorldInverse)
  const depth = -cameraPoint.z
  if (depth <= camera.near || depth >= camera.far) return null

  const ndc = cameraPoint.applyMatrix4(camera.projectionMatrix)
  if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y) || !Number.isFinite(ndc.z)) return null
  if (ndc.z < -1 || ndc.z > 1) return null

  return {
    // The camera looks down +Z via a 180-degree yaw, which mirrors its projected X axis.
    // Flip X back so player-space left/right matches the terminal view.
    x: (0.5 - ndc.x * 0.5) * (width - 1),
    y: (1 - (ndc.y * 0.5 + 0.5)) * (height - 1),
    ndcX: ndc.x,
    ndcY: ndc.y,
    depth,
  }
}

function outsideSameSide(a: ScreenPoint, b: ScreenPoint): boolean {
  return (
    (a.ndcX < -1 && b.ndcX < -1) ||
    (a.ndcX > 1 && b.ndcX > 1) ||
    (a.ndcY < -1 && b.ndcY < -1) ||
    (a.ndcY > 1 && b.ndcY > 1)
  )
}

function outsideTriangle(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): boolean {
  return (
    (a.ndcX < -1 && b.ndcX < -1 && c.ndcX < -1) ||
    (a.ndcX > 1 && b.ndcX > 1 && c.ndcX > 1) ||
    (a.ndcY < -1 && b.ndcY < -1 && c.ndcY < -1) ||
    (a.ndcY > 1 && b.ndcY > 1 && c.ndcY > 1)
  )
}

function layerForObject(object: THREE.Object3D): string {
  let current: THREE.Object3D | null = object
  while (current) {
    const layer = current.userData.tuiLayer
    if (typeof layer === "string" && layer.length > 0) return layer
    current = current.parent
  }
  return "mesh"
}

function densityForLayer(layer: string, depth: number, shade: number): number {
  if (layer === "projectile" || layer === "explosion") return 1
  const distanceFade = clamp(1 - depth / getFarRange(), 0.15, 1)
  const base = layer === "enemy" ? 0.96 : layer === "obstacle" ? 0.88 : 0.7
  return clamp(base * distanceFade + shade * 0.42, 0.35, 1)
}

function glyphForLayer(layer: string, depth: number, shade: number): string {
  if (layer === "projectile") return "\u25cf"
  if (layer === "explosion") return "*"
  if (depth < 16 && shade > 0.55) return "\u25cf"
  if (depth < 38 || shade > 0.72) return "\u2022"
  return "\u00b7"
}

function colorForLayer(layer: string): FrameColor {
  if (layer === "enemy") return "enemy"
  if (layer === "projectile") return "projectile"
  if (layer === "explosion") return "explosion"
  if (layer === "obstacle") return "obstacle"
  return "terrain"
}

function edge(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (px - ax) * (by - ay) - (py - ay) * (bx - ax)
}

function hash2(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return value - Math.floor(value)
}

function drawRadar(canvas: TextCanvas, state: GameState, x: number, y: number, width: number, height: number): void {
  const radarSize = Math.min(width, height, 25)
  canvas.box(x, y, radarSize, radarSize, "RADAR")
  const cx = x + Math.floor(radarSize / 2)
  const cy = y + Math.floor(radarSize / 2)
  const range = state.arenaRadius
  const scale = (radarSize - 4) / (range * 2)
  const forward = forwardVector(state.player.heading)
  const right = rightVector(state.player.heading)

  canvas.line(cx, y + 2, cx, y + radarSize - 3, ".", "terrain")
  canvas.line(x + 2, cy, x + radarSize - 3, cy, ".", "terrain")
  canvas.put(cx, cy, "A", "target")

  for (const obstacle of state.obstacles) {
    drawRadarBlip(canvas, obstacle.position, state.player.position, forward, right, scale, cx, cy, "#", "obstacle")
  }
  for (const enemy of state.enemies) {
    drawRadarBlip(canvas, enemy.position, state.player.position, forward, right, scale, cx, cy, "T", "enemy")
  }
  for (const projectile of state.projectiles) {
    drawRadarBlip(canvas, projectile.position, state.player.position, forward, right, scale, cx, cy, ".", "projectile")
  }

  const infoY = y + radarSize + 1
  if (infoY + 4 < y + height) {
    canvas.text(x, infoY, `KILLS ${state.player.kills}`)
    canvas.text(x, infoY + 1, `RANGE ${Math.round(getFarRange())}`)
    canvas.text(x, infoY + 2, "LEGEND A YOU")
    canvas.put(x + 7, infoY + 2, "A", "target")
    canvas.text(x, infoY + 3, "T ENEMY # ROCK")
    canvas.put(x, infoY + 3, "T", "enemy")
    canvas.put(x + 8, infoY + 3, "#", "obstacle")
  }
}

function drawFooter(canvas: TextCanvas, state: GameState, x: number, y: number, width: number, height: number): void {
  canvas.line(x, y, x + width - 1, y, "-")
  canvas.text(x, y + 1, "WASD/ARROWS drive  SPACE fire  P pause  R restart  Q quit".slice(0, width))
  const warning = state.status === "gameOver" ? "SYSTEM OFFLINE" : state.player.armor < 35 ? "ARMOR CRITICAL" : "SYSTEM READY"
  canvas.text(x, y + height - 1, warning.slice(0, width), warning === "SYSTEM READY" ? "ui" : "warning")
}

function drawRadarBlip(
  canvas: TextCanvas,
  position: Vec2,
  playerPosition: Vec2,
  forward: Vec2,
  right: Vec2,
  scale: number,
  cx: number,
  cy: number,
  char: string,
  color: FrameColor = "ui",
): void {
  const relative = { x: position.x - playerPosition.x, z: position.z - playerPosition.z }
  const rx = dot(relative, right)
  const rz = dot(relative, forward)
  canvas.put(cx + rx * scale, cy - rz * scale, char, color)
}

function bar(ratio: number, width: number): string {
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * width)
  return `[${"#".repeat(filled)}${".".repeat(width - filled)}]`
}

function headingLabel(heading: number): string {
  const degrees = Math.round((heading * 180) / Math.PI) % 360
  const normalized = degrees < 0 ? degrees + 360 : degrees
  return normalized.toString().padStart(3, "0")
}
