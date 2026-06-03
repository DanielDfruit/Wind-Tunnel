import * as THREE from 'three'
import { countMeshComplexity } from './geometry'

const MAX_VERTICES_TOTAL = 48_000
const MAX_VERTICES_PER_MESH = 24_000

function decimateTriangles(geometry: THREE.BufferGeometry, maxVertices: number): THREE.BufferGeometry {
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
  simplified: boolean
  heavy: boolean
}

export function optimizeImportedMeshes(root: THREE.Object3D): MeshOptimizeResult {
  let simplified = false
  const { vertexCount: initialCount } = countMeshComplexity(root)

  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return

    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.frustumCulled = true

    const pos = mesh.geometry.getAttribute('position')
    if (!pos) return

    if (pos.count > MAX_VERTICES_PER_MESH) {
      mesh.geometry.dispose()
      mesh.geometry = decimateTriangles(mesh.geometry, MAX_VERTICES_PER_MESH)
      simplified = true
    }
  })

  let { vertexCount } = countMeshComplexity(root)
  if (vertexCount > MAX_VERTICES_TOTAL) {
    const ratio = MAX_VERTICES_TOTAL / vertexCount
    root.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh || !mesh.geometry) return
      const pos = mesh.geometry.getAttribute('position')
      if (!pos) return
      const target = Math.max(3000, Math.floor(pos.count * ratio))
      if (pos.count > target) {
        mesh.geometry.dispose()
        mesh.geometry = decimateTriangles(mesh.geometry, target)
        simplified = true
      }
    })
    vertexCount = countMeshComplexity(root).vertexCount
  }

  return {
    vertexCount,
    simplified,
    heavy: initialCount > 25_000 || vertexCount > 20_000,
  }
}
