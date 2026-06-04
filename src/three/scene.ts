import * as THREE from "three"
import type { EnemyTank, Explosion, GameState, Obstacle, Projectile } from "../game/types.js"

export interface BattlezoneScene {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  playerRig: THREE.Group
  enemyMeshes: Map<number, THREE.Object3D>
  projectileMeshes: Map<number, THREE.Object3D>
  obstacleMeshes: Map<number, THREE.Object3D>
  explosionMeshes: Map<number, THREE.Object3D>
}

export function createBattlezoneScene(state: GameState): BattlezoneScene {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)

  const camera = new THREE.PerspectiveCamera(62, 2, 0.1, 180)
  const playerRig = new THREE.Group()
  scene.add(playerRig)
  playerRig.add(camera)

  const grid = new THREE.GridHelper(state.arenaRadius * 2, 24, 0x00aa55, 0x003b22)
  grid.userData.tuiGlyph = "."
  grid.userData.tuiLayer = "grid"
  grid.userData.tuiSkip = true
  scene.add(grid)

  const bundle: BattlezoneScene = {
    scene,
    camera,
    playerRig,
    enemyMeshes: new Map(),
    projectileMeshes: new Map(),
    obstacleMeshes: new Map(),
    explosionMeshes: new Map(),
  }

  for (const obstacle of state.obstacles) {
    const mesh = createObstacleMesh(obstacle)
    bundle.obstacleMeshes.set(obstacle.id, mesh)
    scene.add(mesh)
  }

  syncBattlezoneScene(bundle, state)
  return bundle
}

export function syncBattlezoneScene(bundle: BattlezoneScene, state: GameState): void {
  bundle.playerRig.position.set(state.player.position.x, 1.8, state.player.position.z)
  bundle.playerRig.rotation.y = state.player.heading
  bundle.camera.position.set(0, 2.6, -0.8)
  bundle.camera.rotation.set(-0.08, Math.PI, 0)

  syncEntityMeshes(bundle.scene, bundle.enemyMeshes, state.enemies, createEnemyMesh, updateEnemyMesh)
  syncEntityMeshes(bundle.scene, bundle.projectileMeshes, state.projectiles, createProjectileMesh, updateProjectileMesh)
  syncEntityMeshes(bundle.scene, bundle.explosionMeshes, state.explosions, createExplosionMesh, updateExplosionMesh)
}

function syncEntityMeshes<T extends EnemyTank | Projectile | Explosion>(
  scene: THREE.Scene,
  meshes: Map<number, THREE.Object3D>,
  entities: T[],
  createMesh: (entity: T) => THREE.Object3D,
  updateMesh: (mesh: THREE.Object3D, entity: T) => void,
): void {
  const liveIds = new Set(entities.map((entity) => entity.id))
  for (const [id, mesh] of meshes) {
    if (!liveIds.has(id)) {
      scene.remove(mesh)
      meshes.delete(id)
    }
  }

  for (const entity of entities) {
    let mesh = meshes.get(entity.id)
    if (!mesh) {
      mesh = createMesh(entity)
      meshes.set(entity.id, mesh)
      scene.add(mesh)
    }
    updateMesh(mesh, entity)
  }
}

function createEnemyMesh(enemy: EnemyTank): THREE.Object3D {
  const group = new THREE.Group()
  group.userData.tuiGlyph = "="
  group.userData.tuiLayer = "enemy"
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff66 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1, 3), material)
  body.position.y = 0.7
  const turret = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 1.1), material)
  turret.position.y = 1.35
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 2.5), material)
  barrel.position.set(0, 1.35, 1.65)
  group.add(body, turret, barrel)
  updateEnemyMesh(group, enemy)
  return group
}

function updateEnemyMesh(mesh: THREE.Object3D, enemy: EnemyTank): void {
  mesh.position.set(enemy.position.x, 0, enemy.position.z)
  mesh.rotation.y = enemy.heading
}

function createProjectileMesh(projectile: Projectile): THREE.Object3D {
  const material = new THREE.MeshBasicMaterial({ color: projectile.owner === "player" ? 0xffffff : 0xff5555 })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), material)
  mesh.userData.tuiGlyph = projectile.owner === "player" ? "*" : "+"
  mesh.userData.tuiLayer = "projectile"
  updateProjectileMesh(mesh, projectile)
  return mesh
}

function updateProjectileMesh(mesh: THREE.Object3D, projectile: Projectile): void {
  mesh.position.set(projectile.position.x, 0.7, projectile.position.z)
}

function createObstacleMesh(obstacle: Obstacle): THREE.Object3D {
  const material = new THREE.MeshBasicMaterial({ color: 0x00aa55 })
  const geometry =
    obstacle.kind === "pyramid"
      ? new THREE.ConeGeometry(obstacle.radius, obstacle.height, 4)
      : new THREE.BoxGeometry(obstacle.radius * 1.8, obstacle.height, obstacle.radius * 1.8)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.tuiGlyph = obstacle.kind === "pyramid" ? "/" : "#"
  mesh.userData.tuiLayer = "obstacle"
  mesh.position.set(obstacle.position.x, obstacle.height / 2, obstacle.position.z)
  mesh.rotation.y = obstacle.kind === "pyramid" ? Math.PI / 4 : 0
  return mesh
}

function createExplosionMesh(explosion: Explosion): THREE.Object3D {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -1, 0, 0, 1, 0, 0,
        0, -1, 0, 0, 1, 0,
        0, 0, -1, 0, 0, 1,
        -0.7, -0.7, 0, 0.7, 0.7, 0,
        -0.7, 0.7, 0, 0.7, -0.7, 0,
      ],
      3,
    ),
  )
  const material = new THREE.LineBasicMaterial({ color: 0xffffff })
  const mesh = new THREE.LineSegments(geometry, material)
  mesh.userData.tuiGlyph = "*"
  mesh.userData.tuiLayer = "explosion"
  updateExplosionMesh(mesh, explosion)
  return mesh
}

function updateExplosionMesh(mesh: THREE.Object3D, explosion: Explosion): void {
  const scale = Math.max(0.5, explosion.ttl * 5)
  mesh.position.set(explosion.position.x, 1.1, explosion.position.z)
  mesh.scale.setScalar(scale)
}
