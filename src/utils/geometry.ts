import * as THREE from 'three'

export interface ObjectBounds {
  box: THREE.Box3
  center: THREE.Vector3
  size: THREE.Vector3
  dimensions: [number, number, number]
  characteristicLength: number
}

/** Tight axis-aligned bounds in world space (visible meshes, vertex-precise). */
export function computeWorldBounds(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true)
  const box = new THREE.Box3()
  const part = new THREE.Box3()
  let hasMesh = false

  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return
    part.makeEmpty()
    part.setFromObject(mesh, true)
    if (part.isEmpty()) return
    if (!hasMesh) {
      box.copy(part)
      hasMesh = true
    } else {
      box.union(part)
    }
  })

  if (!hasMesh) box.setFromObject(object, true)
  return box
}

const BOX_CORNERS = [
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
]

const EDGE_PAIRS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
]

/** 12 edges of an AABB as line-segment positions (world space). */
export function boxToEdgePositions(box: THREE.Box3, target: Float32Array, offset = 0): void {
  const { min, max } = box
  BOX_CORNERS[0].set(max.x, max.y, max.z)
  BOX_CORNERS[1].set(min.x, max.y, max.z)
  BOX_CORNERS[2].set(min.x, min.y, max.z)
  BOX_CORNERS[3].set(max.x, min.y, max.z)
  BOX_CORNERS[4].set(max.x, max.y, min.z)
  BOX_CORNERS[5].set(min.x, max.y, min.z)
  BOX_CORNERS[6].set(min.x, min.y, min.z)
  BOX_CORNERS[7].set(max.x, min.y, min.z)

  let i = offset
  for (const [a, b] of EDGE_PAIRS) {
    target[i++] = BOX_CORNERS[a].x
    target[i++] = BOX_CORNERS[a].y
    target[i++] = BOX_CORNERS[a].z
    target[i++] = BOX_CORNERS[b].x
    target[i++] = BOX_CORNERS[b].y
    target[i++] = BOX_CORNERS[b].z
  }
}

/** Each visible mesh in the model tree (for per-part bounds). */
export function countMeshComplexity(root: THREE.Object3D): { meshCount: number; vertexCount: number } {
  let meshCount = 0
  let vertexCount = 0
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return
    meshCount++
    const pos = mesh.geometry.attributes.position
    if (pos) vertexCount += pos.count
  })
  return { meshCount, vertexCount }
}

export function collectVisibleMeshes(root: THREE.Object3D): THREE.Mesh[] {
  root.updateWorldMatrix(true, true)
  const meshes: THREE.Mesh[] = []
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.isMesh && mesh.visible && mesh.geometry) meshes.push(mesh)
  })
  return meshes
}

export function paddedBox(box: THREE.Box3, factor: number): THREE.Box3 {
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const half = size.multiplyScalar(0.5 * factor)
  return new THREE.Box3(center.clone().sub(half), center.clone().add(half))
}

export function centerObject(object: THREE.Object3D): void {
  const box = computeWorldBounds(object)
  const center = box.getCenter(new THREE.Vector3())
  object.position.sub(center)
}

/**
 * Heuristic: many CAD/STL exports are Z-up; Three.js uses Y-up.
 * Rotates so the tallest axis becomes vertical (Y).
 */
export function autoOrientModelUpright(object: THREE.Object3D): void {
  object.updateWorldMatrix(true, true)
  let box = computeWorldBounds(object)
  let size = box.getSize(new THREE.Vector3())

  if (size.z > size.y * 1.12 && size.z >= size.x * 0.35) {
    object.rotation.x -= Math.PI / 2
  }

  object.updateWorldMatrix(true, true)
  box = computeWorldBounds(object)
  size = box.getSize(new THREE.Vector3())

  if (size.y < size.x * 0.18 && size.y < size.z * 0.18 && size.x > size.z) {
    object.rotation.z += Math.PI / 2
  }

  object.updateWorldMatrix(true, true)
}

export function resetModelOrientation(object: THREE.Object3D): void {
  object.rotation.set(0, 0, 0)
}

export function normalizeObjectScale(object: THREE.Object3D, targetSize = 2): void {
  const box = computeWorldBounds(object)
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6)
  object.scale.setScalar(targetSize / maxDim)
}

export function normalizeObject(object: THREE.Object3D, targetSize = 2): THREE.Box3 {
  centerObject(object)
  normalizeObjectScale(object, targetSize)
  return computeWorldBounds(object)
}

export function getDimensions(box: THREE.Box3): { x: number; y: number; z: number } {
  const s = box.getSize(new THREE.Vector3())
  return { x: s.x, y: s.y, z: s.z }
}

export function frontalAreaProxy(box: THREE.Box3, windDir: THREE.Vector3): number {
  const size = box.getSize(new THREE.Vector3())
  const n = windDir.clone().normalize()
  const ax = Math.abs(n.x) * size.y * size.z
  const ay = Math.abs(n.y) * size.x * size.z
  const az = Math.abs(n.z) * size.x * size.y
  return Math.max(ax, ay, az, 1e-6)
}

export function characteristicLength(box: THREE.Box3): number {
  const size = box.getSize(new THREE.Vector3())
  return Math.max(size.x, size.y, size.z, 1e-6)
}

export function windFromYawPitch(yawDeg: number, pitchDeg: number): THREE.Vector3 {
  const yaw = (yawDeg * Math.PI) / 180
  const pitch = (pitchDeg * Math.PI) / 180
  return new THREE.Vector3(
    Math.cos(pitch) * Math.cos(yaw),
    Math.sin(pitch),
    Math.cos(pitch) * Math.sin(yaw)
  ).normalize()
}

export function applyModelRotation(object: THREE.Object3D, axis: 'x' | 'y' | 'z', degrees: number): void {
  object.rotation[axis] += (degrees * Math.PI) / 180
}

export function computeObjectBounds(object: THREE.Object3D): ObjectBounds {
  const box = computeWorldBounds(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  return {
    box,
    center,
    size,
    dimensions: [size.x, size.y, size.z],
    characteristicLength: Math.max(size.x, size.y, size.z, 1e-6)
  }
}

export function estimateFrontalAreaProxy(bounds: ObjectBounds, windDir: THREE.Vector3): number {
  return frontalAreaProxy(bounds.box, windDir)
}

export function yawPitchToDirection(yawDeg: number, pitchDeg: number): THREE.Vector3 {
  return windFromYawPitch(yawDeg, pitchDeg)
}

export function directionToYawPitch(dir: THREE.Vector3): { yaw: number; pitch: number } {
  const n = dir.clone().normalize()
  const pitch = (Math.asin(THREE.MathUtils.clamp(n.y, -1, 1)) * 180) / Math.PI
  const yaw = (Math.atan2(n.z, n.x) * 180) / Math.PI
  return { yaw, pitch }
}

export function frontalAreaProxyAtYaw(objectSize: THREE.Vector3, yawDeg: number): number {
  const yaw = (yawDeg * Math.PI) / 180
  const dir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw))
  const n = dir.normalize()
  const ax = Math.abs(n.x) * objectSize.y * objectSize.z
  const ay = Math.abs(n.y) * objectSize.x * objectSize.z
  const az = Math.abs(n.z) * objectSize.x * objectSize.y
  return Math.max(ax, ay, az, 1e-6)
}
