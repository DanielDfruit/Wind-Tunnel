import * as THREE from 'three'
import { collectVisibleMeshes, computeWorldBounds, countMeshComplexity } from '../../utils/geometry'
import type { FlowSample } from '../flowModel'
import type { FlowSolverBackend, FlowSolverContext, FlowSolverParams, FluidProperties } from './types'

function cellIndex(i: number, j: number, k: number, ny: number, nz: number): number {
  return i * ny * nz + j * nz + k
}

/**
 * Cell-centered potential flow: solve ∇²φ = 0 on a 3D grid with no-penetration obstacle voxels.
 * Velocity u = ∇φ. Inviscid, irrotational — real fluid physics, not Navier-Stokes CFD.
 */
export class PotentialFlowSolver implements FlowSolverBackend {
  readonly id = 'potential' as const
  readonly label = 'Potential flow (inviscid)'
  readonly description = 'Laplace potential solver — no viscosity, no turbulence model'
  ready = false

  private nx = 30
  private ny = 22
  private nz = 30
  private solid = new Uint8Array(0)
  private phi = new Float32Array(0)
  private ux = new Float32Array(0)
  private uy = new Float32Array(0)
  private uz = new Float32Array(0)
  private inletMask = new Uint8Array(0)
  private origin = new THREE.Vector3()
  private cellSize = 0.1
  private wind = new THREE.Vector3(1, 0, 0)
  private baseSpeed = 10
  private obstacleCenter = new THREE.Vector3()
  private tmp = new THREE.Vector3()

  setGridResolution(nx: number, ny: number, nz: number): void {
    this.nx = nx
    this.ny = ny
    this.nz = nz
    this.ready = false
  }

  rebuildFromObject(
    object: THREE.Object3D,
    domainBox: THREE.Box3,
    wind: THREE.Vector3,
    baseSpeed: number,
    _fluid?: FluidProperties
  ): void {
    this.wind.copy(wind).normalize()
    this.baseSpeed = Math.max(baseSpeed, 1e-3)

    const box = domainBox
    const size = box.getSize(this.tmp)
    const maxDim = Math.max(size.x, size.y, size.z, 0.5)
    this.cellSize = maxDim / this.nx
    this.origin.copy(box.min)

    const n = this.nx * this.ny * this.nz
    if (this.solid.length !== n) {
      this.solid = new Uint8Array(n)
      this.phi = new Float32Array(n)
      this.ux = new Float32Array(n)
      this.uy = new Float32Array(n)
      this.uz = new Float32Array(n)
      this.inletMask = new Uint8Array(n)
    } else {
      this.solid.fill(0)
      this.inletMask.fill(0)
    }

    const meshes = collectVisibleMeshes(object)
    const { meshCount, vertexCount } = countMeshComplexity(object)
    const useCoarseObstacle = meshCount > 24 || vertexCount > 80_000
    const center = new THREE.Vector3()
    const obstacleBoxes: THREE.Box3[] = []

    if (useCoarseObstacle) {
      obstacleBoxes.push(computeWorldBounds(object))
    } else {
      for (const mesh of meshes) {
        const box = new THREE.Box3().setFromObject(mesh, true)
        if (!box.isEmpty()) obstacleBoxes.push(box)
      }
    }

    for (let i = 0; i < this.nx; i++) {
      for (let j = 0; j < this.ny; j++) {
        for (let k = 0; k < this.nz; k++) {
          const id = cellIndex(i, j, k, this.ny, this.nz)
          this.cellCenter(i, j, k, center)
          let isSolid = false
          for (const box of obstacleBoxes) {
            if (box.containsPoint(center)) {
              isSolid = true
              break
            }
          }
          this.solid[id] = isSolid ? 1 : 0
        }
      }
    }

    this.obstacleCenter.set(0, 0, 0)
    let solidCount = 0
    for (let i = 0; i < this.nx; i++) {
      for (let j = 0; j < this.ny; j++) {
        for (let k = 0; k < this.nz; k++) {
          const id = cellIndex(i, j, k, this.ny, this.nz)
          if (!this.solid[id]) continue
          this.cellCenter(i, j, k, center)
          this.obstacleCenter.add(center)
          solidCount++
        }
      }
    }
    if (solidCount > 0) this.obstacleCenter.multiplyScalar(1 / solidCount)

    this.markInletCells()
    this.initializePhi()
    const iterations = useCoarseObstacle ? 72 : 100
    this.solve(iterations)
    this.computeVelocityField()
    this.ready = true
  }

  refine(iterations: number): void {
    if (!this.ready || iterations <= 0) return
    this.solve(iterations)
    this.computeVelocityField()
  }

  sample(position: THREE.Vector3, ctx: FlowSolverContext, params: FlowSolverParams): FlowSample {
    if (!this.ready) {
      const v = ctx.wind.clone().normalize().multiplyScalar(params.baseSpeed)
      return { velocity: v, speedRatio: 1, inWake: false, pressureProxy: 0 }
    }

    const rel = position.clone().sub(ctx.obstacleCenter)
    const forward = rel.dot(this.wind)
    const dist = rel.length()

    const u = this.sampleVelocityTrilinear(position)
    if (this.isSolidAt(position)) {
      u.set(0, 0, 0)
    }

    const speed = u.length()
    const speedRatio = speed / Math.max(params.baseSpeed, 1e-6)

    const behind = forward > ctx.obstacleRadius * 0.2
    const inWake =
      behind && dist < ctx.obstacleRadius * 3.2 && speedRatio < 0.62 && !this.isSolidAt(position)

    if (inWake && params.turbulence > 0) {
      const noise =
        params.turbulence *
        (Math.sin(params.time * 3 + position.x * 2) * 0.4 +
          Math.cos(params.time * 2.5 + position.z * 2) * 0.4)
      u.y += noise * params.baseSpeed * 0.08
    }

    const pressureProxy = inWake
      ? -0.5 * (1 - speedRatio)
      : 0.25 * (1 - speedRatio) * Math.min(1, dist / (ctx.obstacleRadius * 4))

    return { velocity: u, speedRatio, inWake, pressureProxy }
  }

  private cellCenter(i: number, j: number, k: number, target: THREE.Vector3): THREE.Vector3 {
    return target.set(
      this.origin.x + (i + 0.5) * this.cellSize,
      this.origin.y + (j + 0.5) * this.cellSize,
      this.origin.z + (k + 0.5) * this.cellSize
    )
  }

  private windCoord(p: THREE.Vector3): number {
    return p.x * this.wind.x + p.y * this.wind.y + p.z * this.wind.z
  }

  private markInletCells(): void {
    let sMin = Infinity
    let sMax = -Infinity
    const p = new THREE.Vector3()
    for (let i = 0; i < this.nx; i++) {
      for (let j = 0; j < this.ny; j++) {
        for (let k = 0; k < this.nz; k++) {
          const id = cellIndex(i, j, k, this.ny, this.nz)
          if (this.solid[id]) continue
          this.cellCenter(i, j, k, p)
          const s = this.windCoord(p)
          sMin = Math.min(sMin, s)
          sMax = Math.max(sMax, s)
        }
      }
    }
    const band = Math.max((sMax - sMin) * 0.07, this.cellSize * 1.5)
    for (let i = 0; i < this.nx; i++) {
      for (let j = 0; j < this.ny; j++) {
        for (let k = 0; k < this.nz; k++) {
          const id = cellIndex(i, j, k, this.ny, this.nz)
          this.inletMask[id] = 0
          if (this.solid[id]) continue
          this.cellCenter(i, j, k, p)
          if (this.windCoord(p) < sMin + band) this.inletMask[id] = 1
        }
      }
    }
  }

  private initializePhi(): void {
    const p = new THREE.Vector3()
    let sMin = Infinity
    for (let i = 0; i < this.nx; i++) {
      for (let j = 0; j < this.ny; j++) {
        for (let k = 0; k < this.nz; k++) {
          const id = cellIndex(i, j, k, this.ny, this.nz)
          if (this.solid[id]) {
            this.phi[id] = 0
            continue
          }
          this.cellCenter(i, j, k, p)
          const s = this.windCoord(p)
          sMin = Math.min(sMin, s)
        }
      }
    }
    for (let i = 0; i < this.nx; i++) {
      for (let j = 0; j < this.ny; j++) {
        for (let k = 0; k < this.nz; k++) {
          const id = cellIndex(i, j, k, this.ny, this.nz)
          if (this.solid[id]) {
            this.phi[id] = 0
            continue
          }
          this.cellCenter(i, j, k, p)
          const s = this.windCoord(p)
          this.phi[id] = this.baseSpeed * (s - sMin)
        }
      }
    }
  }

  private solve(iterations: number): void {
    const nx = this.nx
    const ny = this.ny
    const nz = this.nz
    const phi = this.phi
    const solid = this.solid
    const inlet = this.inletMask

    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 1; i < nx - 1; i++) {
        for (let j = 1; j < ny - 1; j++) {
          for (let k = 1; k < nz - 1; k++) {
            const id = cellIndex(i, j, k, ny, nz)
            if (solid[id] || inlet[id]) continue

            let sum = 0
            let count = 0
            const neighbors = [
              cellIndex(i - 1, j, k, ny, nz),
              cellIndex(i + 1, j, k, ny, nz),
              cellIndex(i, j - 1, k, ny, nz),
              cellIndex(i, j + 1, k, ny, nz),
              cellIndex(i, j, k - 1, ny, nz),
              cellIndex(i, j, k + 1, ny, nz),
            ]
            for (const nid of neighbors) {
              if (solid[nid]) continue
              sum += phi[nid]
              count++
            }
            if (count > 0) phi[id] = sum / count
          }
        }
      }
    }
  }

  private computeVelocityField(): void {
    const h = this.cellSize
    const nx = this.nx
    const ny = this.ny
    const nz = this.nz

    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        for (let k = 0; k < nz; k++) {
          const id = cellIndex(i, j, k, ny, nz)
          if (this.solid[id]) {
            this.ux[id] = 0
            this.uy[id] = 0
            this.uz[id] = 0
            continue
          }
          const im = Math.max(i - 1, 0)
          const ip = Math.min(i + 1, nx - 1)
          const jm = Math.max(j - 1, 0)
          const jp = Math.min(j + 1, ny - 1)
          const km = Math.max(k - 1, 0)
          const kp = Math.min(k + 1, nz - 1)
          const dphidx =
            (this.phi[cellIndex(ip, j, k, ny, nz)] - this.phi[cellIndex(im, j, k, ny, nz)]) / (2 * h)
          const dphidy =
            (this.phi[cellIndex(i, jp, k, ny, nz)] - this.phi[cellIndex(i, jm, k, ny, nz)]) / (2 * h)
          const dphidz =
            (this.phi[cellIndex(i, j, kp, ny, nz)] - this.phi[cellIndex(i, j, km, ny, nz)]) / (2 * h)
          this.ux[id] = dphidx
          this.uy[id] = dphidy
          this.uz[id] = dphidz
        }
      }
    }
  }

  private worldToGrid(position: THREE.Vector3): { fi: number; fj: number; fk: number } {
    const fi = (position.x - this.origin.x) / this.cellSize - 0.5
    const fj = (position.y - this.origin.y) / this.cellSize - 0.5
    const fk = (position.z - this.origin.z) / this.cellSize - 0.5
    return { fi, fj, fk }
  }

  private isSolidAt(position: THREE.Vector3): boolean {
    const { fi, fj, fk } = this.worldToGrid(position)
    const i = Math.floor(fi)
    const j = Math.floor(fj)
    const k = Math.floor(fk)
    if (i < 0 || j < 0 || k < 0 || i >= this.nx || j >= this.ny || k >= this.nz) return false
    return this.solid[cellIndex(i, j, k, this.ny, this.nz)] === 1
  }

  private sampleVelocityTrilinear(position: THREE.Vector3): THREE.Vector3 {
    const { fi, fj, fk } = this.worldToGrid(position)
    const i0 = Math.floor(fi)
    const j0 = Math.floor(fj)
    const k0 = Math.floor(fk)
    if (i0 < 0 || j0 < 0 || k0 < 0 || i0 >= this.nx - 1 || j0 >= this.ny - 1 || k0 >= this.nz - 1) {
      return this.wind.clone().multiplyScalar(this.baseSpeed)
    }

    const tx = fi - i0
    const ty = fj - j0
    const tz = fk - k0

    const v = new THREE.Vector3()
    let weight = 0
    for (let di = 0; di <= 1; di++) {
      for (let dj = 0; dj <= 1; dj++) {
        for (let dk = 0; dk <= 1; dk++) {
          const i = i0 + di
          const j = j0 + dj
          const k = k0 + dk
          const id = cellIndex(i, j, k, this.ny, this.nz)
          const w = (di ? tx : 1 - tx) * (dj ? ty : 1 - ty) * (dk ? tz : 1 - tz)
          if (this.solid[id]) continue
          v.x += this.ux[id] * w
          v.y += this.uy[id] * w
          v.z += this.uz[id] * w
          weight += w
        }
      }
    }
    if (weight < 1e-6) return this.wind.clone().multiplyScalar(this.baseSpeed)
    v.multiplyScalar(1 / weight)

    const targetSpeed = this.baseSpeed
    const len = v.length()
    if (len > 1e-6 && Math.abs(len - targetSpeed) > 0.01) {
      v.multiplyScalar(targetSpeed / len)
    }
    return v
  }
}
