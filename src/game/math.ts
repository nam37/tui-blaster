import type { Vec2 } from "./types.js"

export const TAU = Math.PI * 2

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function wrapAngle(angle: number): number {
  const wrapped = angle % TAU
  return wrapped < 0 ? wrapped + TAU : wrapped
}

export function angleDelta(from: number, to: number): number {
  let delta = wrapAngle(to - from)
  if (delta > Math.PI) delta -= TAU
  return delta
}

export function rotateToward(current: number, target: number, maxStep: number): number {
  const delta = angleDelta(current, target)
  if (Math.abs(delta) <= maxStep) return wrapAngle(target)
  return wrapAngle(current + Math.sign(delta) * maxStep)
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function angleTo(from: Vec2, to: Vec2): number {
  return wrapAngle(Math.atan2(to.x - from.x, to.z - from.z))
}

export function forwardVector(heading: number): Vec2 {
  return { x: Math.sin(heading), z: Math.cos(heading) }
}

export function rightVector(heading: number): Vec2 {
  return { x: Math.cos(heading), z: -Math.sin(heading) }
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z
}

export function addScaled(origin: Vec2, direction: Vec2, amount: number): Vec2 {
  return { x: origin.x + direction.x * amount, z: origin.z + direction.z * amount }
}

export function cloneVec2(value: Vec2): Vec2 {
  return { x: value.x, z: value.z }
}

export function distancePointToSegment(point: Vec2, a: Vec2, b: Vec2): number {
  const ab = { x: b.x - a.x, z: b.z - a.z }
  const ap = { x: point.x - a.x, z: point.z - a.z }
  const lengthSq = ab.x * ab.x + ab.z * ab.z
  if (lengthSq === 0) return distance(point, a)
  const t = clamp(dot(ap, ab) / lengthSq, 0, 1)
  return distance(point, { x: a.x + ab.x * t, z: a.z + ab.z * t })
}
