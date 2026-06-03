import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { countMeshComplexity } from './geometry'

export type MeshImportTier = 'normal' | 'heavy' | 'massive'

/** Display + physics caps by source model size (triangle/vertex count before simplify). */
function capsForInitialCount(initialVertices: number): {
  perMesh: number
  total: number
  tier: MeshImportTier
} {
  if (initialVertices > 350_000) {
    return { perMesh: 3_500, total: 9_000, tier: 'massive' }
  }
  if (initialVertices > 120_000) {
    return { perMesh: 6_000, total: 14_000, tier: 'massive' }
  }
  if (initialVertices > 40_000) {
    return { perMesh: 10_000, total: 22_000, tier: 'heavy' }
  }
  if (initialVertices > 18_000) {
    return { perMesh: 14_000, total: 32_000, tier: 'heavy' }
  }
  return { perMesh: 18_000, total: 42_000, tier: 'normal' }
}

export function decimateTriangles(geometry: THREE.BufferGeometry, maxVertices: number): THREE.BufferGeometry {
  const pos = geometry.getAttribute('position')
  if (!pos || pos.count <= maxVertices) return geometry

  const triCount = Math.floor(pos.count / 3)
  const maxTris = Math.max(1, Math.floor(maxVertices / 3))
  const stride = Math.max(1, Math.ceil(triCount / maxTris))
  const outTris = Math.ceil(triCount / stride)
  const arr = new Float32Array(outTris * 9)

  let o = 0
  for (let t = 0; t < triCount; t += stride) {
    const i = t * 3
    for (let v = 0; v < 3; v++) {
      arr[o++] = pos.getX(i + v)
      arr[o++] = pos.getY(i + v)
      arr[o++] = pos.getZ(i + v)
    }
  }

  if (o < 9) return geometry

  const next = new THREE.BufferGeometry()
  next.setAttribute('position', new THREE.BufferAttribute(arr.subarray(0, o), 3))
  next.computeVertexNormals()
  next.computeBoundingBox()
  return next
}

export interface MeshOptimizeResult {
  vertexCount: number
  initialVertexCount: number
  simplified: boolean
  heavy: boolean
  massive: boolean
  tier: MeshImportTier
}

/** Collapse many mesh draw calls into one (after decimation). */
function mergeVisibleMeshes(root: THREE.Object3D, material: THREE.Material): void {
  const geometries: THREE.BufferGeometry[] = []
  root.updateWorldMatrix(true, true)
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return
    const g = mesh.geometry.clone()
    g.applyMatrix4(mesh.matrixWorld)
    geometries.push(g)
  })
  if (geometries.length <= 1) return

  const merged = mergeGeometries(geometries, false)
  geometries.forEach((g) => g.dispose())
  if (!merged) return

  while (root.children.length) root.remove(root.children[0])
  const combined = new THREE.Mesh(merged, material)
  combined.castShadow = false
  combined.receiveShadow = false
  combined.frustumCulled = true
  root.add(combined)
}

export function optimizeImportedMeshes(root: THREE.Object3D): MeshOptimizeResult {
  let simplified = false
  const { vertexCount: initialCount, meshCount } = countMeshComplexity(root)
  const caps = capsForInitialCount(initialCount)
  const sharedMat = new THREE.MeshStandardMaterial({
    color: 0x8899aa,
    metalness: 0.3,
    roughness: 0.6,
  })

  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return

    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.frustumCulled = true
    if (!mesh.material || Array.isArray(mesh.material)) {
      mesh.material = sharedMat
    }

    const pos = mesh.geometry.getAttribute('position')
    if (!pos) return

    if (pos.count > caps.perMesh) {
      const old = mesh.geometry
      mesh.geometry = decimateTriangles(old, caps.perMesh)
      old.dispose()
      simplified = true
    }
  })

  let { vertexCount } = countMeshComplexity(root)
  if (vertexCount > caps.total) {
    const ratio = caps.total / vertexCount
    root.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh || !mesh.geometry) return
      const pos = mesh.geometry.getAttribute('position')
      if (!pos) return
      const target = Math.max(1200, Math.floor(pos.count * ratio))
      if (pos.count > target) {
        const old = mesh.geometry
        mesh.geometry = decimateTriangles(old, target)
        old.dispose()
        simplified = true
      }
    })
    vertexCount = countMeshComplexity(root).vertexCount
  }

  if (caps.tier !== 'normal' && meshCount > 4) {
    mergeVisibleMeshes(root, sharedMat)
    vertexCount = countMeshComplexity(root).vertexCount
    simplified = true
  }

  return {
    vertexCount,
    initialVertexCount: initialCount,
    simplified,
    heavy: caps.tier !== 'normal' || initialCount > 20_000,
    massive: caps.tier === 'massive',
    tier: caps.tier,
  }
}

/** Decimate STL/OBJ geometry immediately after parse (before scene graph work). */
export function simplifyParsedGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const count = geometry.getAttribute('position')?.count ?? 0
  if (count <= 40_000) return geometry
  const caps = capsForInitialCount(count)
  const target = Math.min(caps.total, caps.perMesh * 2)
  const next = decimateTriangles(geometry, target)
  if (next !== geometry) geometry.dispose()
  return next
}
