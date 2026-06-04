import {
  addScaled,
  angleDelta,
  angleTo,
  clamp,
  cloneVec2,
  distance,
  distancePointToSegment,
  forwardVector,
  rotateToward,
  TAU,
  wrapAngle,
  rightVector,
} from "./math.js"
import type { EnemyTank, GameState, InputState, Obstacle, Projectile, Vec2 } from "./types.js"

const PLAYER_RADIUS = 1.35
const ENEMY_RADIUS = 1.45
const PLAYER_SPEED = 17
const PLAYER_REVERSE_SPEED = 9
const PLAYER_TURN_RATE = 2.55
const ENEMY_SPEED = 8.4
const ENEMY_TURN_RATE = 1.45
const PLAYER_RELOAD_SECONDS = 0.62
const ENEMY_RELOAD_SECONDS = 1.85
const FAR_RANGE = 96

export const IDLE_INPUT: InputState = {
  forward: false,
  reverse: false,
  turnLeft: false,
  turnRight: false,
  fire: false,
}

export function createInitialState(seed = 0x45f00d): GameState {
  const state: GameState = {
    status: "playing",
    time: 0,
    rngSeed: seed >>> 0 || 1,
    arenaRadius: 78,
    wave: 0,
    nextId: 1,
    player: {
      position: { x: 0, z: 0 },
      heading: 0,
      armor: 100,
      reload: 0,
      score: 0,
      kills: 0,
    },
    enemies: [],
    projectiles: [],
    obstacles: [],
    explosions: [],
    messages: [],
  }

  state.obstacles = createObstacles(state)
  beginNextWave(state)
  pushMessage(state, "Wave 1: hostile armor detected", 2.5)
  return state
}

export function resetGame(seed = Date.now()): GameState {
  return createInitialState(seed >>> 0)
}

export function togglePause(state: GameState): void {
  if (state.status === "gameOver") return
  state.status = state.status === "paused" ? "playing" : "paused"
  pushMessage(state, state.status === "paused" ? "Paused" : "Resumed", 1.25)
}

export function stepGame(state: GameState, input: InputState, dt: number): GameState {
  const step = clamp(dt, 0, 0.08)
  state.time += step
  updateTransientLists(state, step)

  if (state.status !== "playing") return state

  state.player.reload = Math.max(0, state.player.reload - step)
  updatePlayer(state, input, step)
  updateEnemies(state, step)
  updateProjectiles(state, step)

  if (state.player.armor <= 0) {
    state.player.armor = 0
    state.status = "gameOver"
    pushMessage(state, "Armor breached. Press R to restart.", 999)
    return state
  }

  if (state.enemies.length === 0) {
    beginNextWave(state)
    pushMessage(state, `Wave ${state.wave}: ${state.enemies.length} tanks inbound`, 2.25)
  }

  return state
}

export function nearestEnemy(state: GameState): EnemyTank | undefined {
  let best: EnemyTank | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const enemy of state.enemies) {
    const candidate = distance(state.player.position, enemy.position)
    if (candidate < bestDistance) {
      best = enemy
      bestDistance = candidate
    }
  }
  return best
}

function updatePlayer(state: GameState, input: InputState, dt: number): void {
  const turn = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0)
  state.player.heading = wrapAngle(state.player.heading + turn * PLAYER_TURN_RATE * dt)

  const forward = forwardVector(state.player.heading)
  const throttle = (input.forward ? PLAYER_SPEED : 0) - (input.reverse ? PLAYER_REVERSE_SPEED : 0)
  if (throttle !== 0) {
    state.player.position.x += forward.x * throttle * dt
    state.player.position.z += forward.z * throttle * dt
    constrainToArenaAndObstacles(state.player.position, PLAYER_RADIUS, state)
  }

  if (input.fire && state.player.reload <= 0) {
    spawnProjectile(state, {
      owner: "player",
      position: addScaled(state.player.position, forward, 2.2),
      heading: state.player.heading,
      speed: 52,
      ttl: 1.9,
    })
    state.player.reload = PLAYER_RELOAD_SECONDS
  }
}

function updateEnemies(state: GameState, dt: number): void {
  for (const enemy of state.enemies) {
    enemy.reload = Math.max(0, enemy.reload - dt)

    const targetHeading = angleTo(enemy.position, state.player.position)
    const range = distance(enemy.position, state.player.position)
    enemy.heading = rotateToward(enemy.heading, targetHeading, ENEMY_TURN_RATE * dt)

    const forward = forwardVector(enemy.heading)
    const side = rightVector(enemy.heading)
    const desiredMove = range > 32 ? 1 : range < 18 ? -0.55 : 0.18
    const weave = Math.sin(state.time * 0.9 + enemy.strafePhase) * 0.72

    enemy.position.x += (forward.x * desiredMove + side.x * weave) * ENEMY_SPEED * dt
    enemy.position.z += (forward.z * desiredMove + side.z * weave) * ENEMY_SPEED * dt
    constrainToArenaAndObstacles(enemy.position, ENEMY_RADIUS, state)

    const aimError = Math.abs(angleDelta(enemy.heading, targetHeading))
    if (range < 56 && aimError < 0.18 && enemy.reload <= 0 && hasLineOfFire(enemy.position, state.player.position, state.obstacles)) {
      spawnProjectile(state, {
        owner: "enemy",
        position: addScaled(enemy.position, forwardVector(enemy.heading), 2),
        heading: enemy.heading,
        speed: 34,
        ttl: 2.15,
      })
      enemy.reload = ENEMY_RELOAD_SECONDS + randomRange(state, 0, 0.9)
    }
  }
}

function updateProjectiles(state: GameState, dt: number): void {
  for (const projectile of state.projectiles) {
    projectile.ttl -= dt
    const direction = forwardVector(projectile.heading)
    projectile.position.x += direction.x * projectile.speed * dt
    projectile.position.z += direction.z * projectile.speed * dt

    if (Math.hypot(projectile.position.x, projectile.position.z) > state.arenaRadius + 4) {
      projectile.ttl = 0
      continue
    }

    const obstacle = state.obstacles.find((candidate) => distance(candidate.position, projectile.position) < candidate.radius)
    if (obstacle) {
      projectile.ttl = 0
      spawnExplosion(state, projectile.position, 0.45)
      continue
    }

    if (projectile.owner === "player") {
      const enemy = state.enemies.find((candidate) => distance(candidate.position, projectile.position) < ENEMY_RADIUS)
      if (enemy) {
        enemy.armor -= 55
        projectile.ttl = 0
        spawnExplosion(state, enemy.position, 0.7)
        if (enemy.armor <= 0) {
          state.player.kills += 1
          state.player.score += 100 * state.wave
          pushMessage(state, `Tank destroyed +${100 * state.wave}`, 1.4)
        }
      }
    } else if (distance(projectile.position, state.player.position) < PLAYER_RADIUS) {
      state.player.armor -= 24
      projectile.ttl = 0
      spawnExplosion(state, state.player.position, 0.75)
      pushMessage(state, "Direct hit", 1.15)
    }
  }

  state.projectiles = state.projectiles.filter((projectile) => projectile.ttl > 0)
  state.enemies = state.enemies.filter((enemy) => enemy.armor > 0)
}

function beginNextWave(state: GameState): void {
  state.wave += 1
  const count = clamp(1 + state.wave, 2, 8)
  const baseAngle = randomRange(state, 0, TAU)

  for (let index = 0; index < count; index += 1) {
    const angle = baseAngle + (index / count) * TAU + randomRange(state, -0.28, 0.28)
    const radius = randomRange(state, 42, state.arenaRadius - 8)
    const position = { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius }
    state.enemies.push({
      id: state.nextId++,
      position,
      heading: angleTo(position, state.player.position),
      armor: state.wave < 3 ? 55 : 75,
      reload: randomRange(state, 0.45, 1.8),
      strafePhase: randomRange(state, 0, TAU),
    })
  }
}

function createObstacles(state: GameState): Obstacle[] {
  const layout: Array<Omit<Obstacle, "id">> = [
    { kind: "pyramid", position: { x: -18, z: 24 }, radius: 4.5, height: 6 },
    { kind: "block", position: { x: 22, z: 28 }, radius: 5, height: 4 },
    { kind: "pyramid", position: { x: 34, z: -16 }, radius: 4, height: 5.5 },
    { kind: "block", position: { x: -30, z: -24 }, radius: 5.5, height: 4.5 },
    { kind: "pyramid", position: { x: 5, z: 50 }, radius: 4.5, height: 6 },
  ]

  for (let index = 0; index < 5; index += 1) {
    const angle = randomRange(state, 0, TAU)
    const radius = randomRange(state, 24, state.arenaRadius - 14)
    layout.push({
      kind: index % 2 === 0 ? "pyramid" : "block",
      position: { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius },
      radius: randomRange(state, 3.6, 5.8),
      height: randomRange(state, 3.8, 6.4),
    })
  }

  return layout.map((obstacle) => ({ ...obstacle, id: state.nextId++ }))
}

function spawnProjectile(state: GameState, projectile: Omit<Projectile, "id">): void {
  state.projectiles.push({ ...projectile, position: cloneVec2(projectile.position), id: state.nextId++ })
}

function spawnExplosion(state: GameState, position: Vec2, ttl: number): void {
  state.explosions.push({ id: state.nextId++, position: cloneVec2(position), ttl })
}

function updateTransientLists(state: GameState, dt: number): void {
  for (const message of state.messages) message.ttl -= dt
  for (const explosion of state.explosions) explosion.ttl -= dt
  state.messages = state.messages.filter((message) => message.ttl > 0)
  state.explosions = state.explosions.filter((explosion) => explosion.ttl > 0)
}

function constrainToArenaAndObstacles(position: Vec2, radius: number, state: GameState): void {
  const distanceFromCenter = Math.hypot(position.x, position.z)
  const maxDistance = state.arenaRadius - radius
  if (distanceFromCenter > maxDistance) {
    const scale = maxDistance / distanceFromCenter
    position.x *= scale
    position.z *= scale
  }

  for (const obstacle of state.obstacles) {
    const minDistance = obstacle.radius + radius
    const dx = position.x - obstacle.position.x
    const dz = position.z - obstacle.position.z
    const currentDistance = Math.hypot(dx, dz)
    if (currentDistance > 0 && currentDistance < minDistance) {
      const push = (minDistance - currentDistance) / currentDistance
      position.x += dx * push
      position.z += dz * push
    }
  }
}

function hasLineOfFire(from: Vec2, to: Vec2, obstacles: Obstacle[]): boolean {
  return obstacles.every((obstacle) => distancePointToSegment(obstacle.position, from, to) > obstacle.radius + 0.55)
}

function pushMessage(state: GameState, text: string, ttl: number): void {
  state.messages.unshift({ text, ttl })
  state.messages = state.messages.slice(0, 4)
}

function random01(state: GameState): number {
  state.rngSeed = (state.rngSeed + 0x6d2b79f5) >>> 0
  let value = state.rngSeed
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}

function randomRange(state: GameState, min: number, max: number): number {
  return min + (max - min) * random01(state)
}

export function getReloadRatio(state: GameState): number {
  return 1 - clamp(state.player.reload / PLAYER_RELOAD_SECONDS, 0, 1)
}

export function getFarRange(): number {
  return FAR_RANGE
}
