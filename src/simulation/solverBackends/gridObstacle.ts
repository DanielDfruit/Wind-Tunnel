import * as THREE from 'three'
import { collectVisibleMeshes, computeWorldBounds, countMeshComplexity } from '../../utils/geometry'

export interface ObstacleGrid {
  nx: number
  ny: number
  nz: number
  solid: Uint8Array
  inletMask: Uint8Array
  origin: THREE.Vector3
  cellSize: number
  obstacleCenter: THREE.Vector3
  wind: THREE.Vector3
}

export function cellIndex(i: number, j: number, k: number, ny: number, nz: number): number {
  return i * ny * nz + j * nz + k
}

function cellCenter(
  i: number,
  j: number,
  k: number,
  origin: THREE.Vector3,
  cellSize: number,
  target: THREE.Vector3
): THREE.Vector3 {
  return target.set(
    origin.x + (i + 0.5) * cellSize,
    origin.y + (j + 0.5) * cellSize,
    origin.z + (k + 0.5) * cellSize
  )
}

function windCoord(p: THREE.Vector3, wind: THREE.Vector3): number {
  return p.x * wind.x + p.y * wind.y + p.z * wind.z
}

export function buildObstacleGrid(
  object: THREE.Object3D,
  domainBox: THREE.Box3,
  wind: THREE.Vector3,
  nx: number,
  ny: number,
  nz: number
): ObstacleGrid {
  const windN = wind.clone().normalize()
  const size = domainBox.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 0.5)
  const cellSize = maxDim / nx
  const origin = domainBox.min.clone()

  const n = nx * ny * nz
  const solid = new Uint8Array(n)
  const inletMask = new Uint8Array(n)
  const center = new THREE.Vector3()
  const p = new THREE.Vector3()

  const meshes = collectVisibleMeshes(object)
  const { meshCount, vertexCount } = countMeshComplexity(object)
  const useCoarseObstacle = meshCount > 6 || vertexCount > 12_000
  const obstacleBoxes: THREE.Box3[] = []

  if (useCoarseObstacle) {
    obstacleBoxes.push(computeWorldBounds(object))
  } else {
    for (const mesh of meshes) {
      const box = new THREE.Box3().setFromObject(mesh, true)
      if (!box.isEmpty()) obstacleBoxes.push(box)
    }
  }

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        const id = cellIndex(i, j, k, ny, nz)
        cellCenter(i, j, k, origin, cellSize, center)
        let isSolid = false
        for (const box of obstacleBoxes) {
          if (box.containsPoint(center)) {
            isSolid = true
            break
          }
        }
        solid[id] = isSolid ? 1 : 0
      }
    }
  }

  const obstacleCenter = new THREE.Vector3()
  let solidCount = 0
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        const id = cellIndex(i, j, k, ny, nz)
        if (!solid[id]) continue
        cellCenter(i, j, k, origin, cellSize, center)
        obstacleCenter.add(center)
        solidCount++
      }
    }
  }
  if (solidCount > 0) obstacleCenter.multiplyScalar(1 / solidCount)

  let sMin = Infinity
  let sMax = -Infinity
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        const id = cellIndex(i, j, k, ny, nz)
        if (solid[id]) continue
        cellCenter(i, j, k, origin, cellSize, p)
        const s = windCoord(p, windN)
        sMin = Math.min(sMin, s)
        sMax = Math.max(sMax, s)
      }
    }
  }
  const band = Math.max((sMax - sMin) * 0.07, cellSize * 1.5)
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        const id = cellIndex(i, j, k, ny, nz)
        inletMask[id] = 0
        if (solid[id]) continue
        cellCenter(i, j, k, origin, cellSize, p)
        if (windCoord(p, windN) < sMin + band) inletMask[id] = 1
      }
    }
  }

  return {
    nx,
    ny,
    nz,
    solid,
    inletMask,
    origin,
    cellSize,
    obstacleCenter,
    wind: windN,
  }
}
