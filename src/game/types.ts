export interface Vec2 {
  x: number
  z: number
}

export interface Player {
  position: Vec2
  heading: number
  armor: number
  reload: number
  score: number
  kills: number
}

export interface EnemyTank {
  id: number
  position: Vec2
  heading: number
  armor: number
  reload: number
  strafePhase: number
}

export interface Projectile {
  id: number
  owner: "player" | "enemy"
  position: Vec2
  heading: number
  speed: number
  ttl: number
}

export interface Obstacle {
  id: number
  kind: "pyramid" | "block"
  position: Vec2
  radius: number
  height: number
}

export interface Explosion {
  id: number
  position: Vec2
  ttl: number
}

export interface StatusMessage {
  text: string
  ttl: number
}

export interface GameState {
  status: "playing" | "paused" | "gameOver"
  time: number
  rngSeed: number
  arenaRadius: number
  wave: number
  nextId: number
  player: Player
  enemies: EnemyTank[]
  projectiles: Projectile[]
  obstacles: Obstacle[]
  explosions: Explosion[]
  messages: StatusMessage[]
}

export interface InputState {
  forward: boolean
  reverse: boolean
  turnLeft: boolean
  turnRight: boolean
  fire: boolean
}
