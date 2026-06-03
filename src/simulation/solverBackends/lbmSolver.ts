import * as THREE from 'three'
import type { FlowSample } from '../flowModel'
import type { FlowSolverBackend, FlowSolverContext, FlowSolverParams, FluidProperties } from './types'
import { buildObstacleGrid, cellIndex, type ObstacleGrid } from './gridObstacle'
import { ensureWebGpuDevice, isWebGpuLbmReady, WebGpuLbmEngine } from './lbmWebGpu'

const Q = 19
const CS2 = 1 / 3

/** D3Q19 lattice (standard ordering). */
const EX = Int8Array.from([0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0])
const EY = Int8Array.from([0, 0, 0, 1, -1, 0, 0, 1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1])
const EZ = Int8Array.from([0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1, 1, -1, -1, 1, -1, 1, -1])
const W = Float32Array.from([
  1 / 3,
  1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18,
  1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36,
  1 / 36, 1 / 36, 1 / 36, 1 / 36,
])

const OPP = Int8Array.from([0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15, 18, 17])

/**
 * Incompressible Navier-Stokes via D3Q19 lattice Boltzmann (BGK).
 * Viscous, compressible LBM limit — real NS physics on a coarse grid (not validated CFD).
 */
export class LBMSolver implements FlowSolverBackend {
  readonly id = 'lbm' as const
  readonly label = 'Navier-Stokes (LBM)'
  description = 'Viscous flow — D3Q19 lattice Boltzmann with ρ and μ from environment'
  ready = false

  private gpu: WebGpuLbmEngine | null = null
  private usingGpu = false
  private refineTick = 0
  private gpuRefineInFlight = false
  private readonly gpuReadbackEvery = 10

  private grid: ObstacleGrid | null = null
  private f = new Float32Array(0)
  private fTmp = new Float32Array(0)
  private rho = new Float32Array(0)
  private ux = new Float32Array(0)
  private uy = new Float32Array(0)
  private uz = new Float32Array(0)
  private tau = 0.8
  private baseSpeed = 10
  private uLattice = 0.08
  private estimatedCd = 1
  private estimatedDrag = 0
  private frontalArea = 1

  setGridResolution(nx: number, ny: number, nz: number): void {
    this.grid = null
    void nx
    void ny
    void nz
  }

  getEstimatedCoefficients(): { cd: number; dragForce: number } {
    return { cd: this.estimatedCd, dragForce: this.estimatedDrag }
  }

  isUsingGpu(): boolean {
    return this.usingGpu
  }

  rebuildFromObject(
    object: THREE.Object3D,
    domainBox: THREE.Box3,
    wind: THREE.Vector3,
    baseSpeed: number,
    fluid?: FluidProperties
  ): void {
    void this.rebuildFromObjectAsync(object, domainBox, wind, baseSpeed, fluid)
  }

  async rebuildFromObjectAsync(
    object: THREE.Object3D,
    domainBox: THREE.Box3,
    wind: THREE.Vector3,
    baseSpeed: number,
    fluid?: FluidProperties
  ): Promise<void> {
    this.ready = false
    const nx = this.pendingNx
    const ny = this.pendingNy
    const nz = this.pendingNz
    this.grid = buildObstacleGrid(object, domainBox, wind, nx, ny, nz)
    this.baseSpeed = Math.max(baseSpeed, 1e-3)

    const rhoAir = fluid?.density ?? 1.225
    const mu = fluid?.dynamicViscosity ?? 1.81e-5
    this.applyFluidParams(rhoAir, mu)

    await ensureWebGpuDevice()
    if (isWebGpuLbmReady()) {
      try {
        this.gpu = this.gpu ?? new WebGpuLbmEngine()
        const ok = await this.gpu.setup(this.grid, this.tau, this.uLattice)
        if (ok) {
          const warmupNow = Math.min(this.pendingWarmup, 48)
          await this.gpu.runSteps(warmupNow)
          const macro = await this.gpu.readMacroscopic()
          if (this.ux.length !== macro.ux.length) this.ux = new Float32Array(macro.ux.length)
          if (this.uy.length !== macro.uy.length) this.uy = new Float32Array(macro.uy.length)
          if (this.uz.length !== macro.uz.length) this.uz = new Float32Array(macro.uz.length)
          if (this.rho.length !== macro.rho.length) this.rho = new Float32Array(macro.rho.length)
          this.ux.set(macro.ux)
          this.uy.set(macro.uy)
          this.uz.set(macro.uz)
          this.rho.set(macro.rho)
          void this.finishGpuWarmup(warmupNow, rhoAir)
          this.usingGpu = true
          this.description = 'Viscous D3Q19 LBM on GPU (WebGPU) — ρ and μ from environment'
          this.refineTick = 0
          this.estimateDrag(rhoAir)
          this.ready = true
          return
        }
      } catch (e) {
        console.warn('[LBM] WebGPU setup/run failed, using CPU:', e)
        this.usingGpu = false
        this.gpu = null
      }
    }

    this.usingGpu = false
    this.description = 'Viscous D3Q19 LBM on CPU — ρ and μ from environment'
    this.rebuildCpu(rhoAir)
    this.ready = true
  }

  private applyFluidParams(rhoAir: number, mu: number): void {
    if (!this.grid) return
    const dx = this.grid.cellSize
    const dt = (this.uLattice * dx) / this.baseSpeed
    const nuLattice = (mu / rhoAir) * dt / (dx * dx)
    this.tau = Math.max(0.55, Math.min(2, 3 * nuLattice + 0.5))
  }

  private rebuildCpu(rhoAir: number): void {
    if (!this.grid) return
    const { nx, ny, nz } = this.grid
    const n = nx * ny * nz
    if (this.f.length !== n * Q) {
      this.f = new Float32Array(n * Q)
      this.fTmp = new Float32Array(n * Q)
      this.rho = new Float32Array(n)
      this.ux = new Float32Array(n)
      this.uy = new Float32Array(n)
      this.uz = new Float32Array(n)
    }
    this.initUniform(this.grid.wind)
    const warmupNow = Math.min(this.pendingWarmup, 72)
    for (let s = 0; s < warmupNow; s++) this.step(this.grid)
    this.estimateDrag(rhoAir)
  }

  /** Continue LBM warmup on GPU without blocking the first ready frame. */
  private async finishGpuWarmup(done: number, rhoAir: number): Promise<void> {
    const remaining = this.pendingWarmup - done
    if (remaining <= 0 || !this.gpu) return
    const chunk = 20
    for (let left = remaining; left > 0; left -= chunk) {
      await this.gpu.runSteps(Math.min(chunk, left))
      this.refineTick++
      if (this.refineTick % this.gpuReadbackEvery === 0) {
        const macro = await this.gpu.readMacroscopic()
        this.ux.set(macro.ux)
        this.uy.set(macro.uy)
        this.uz.set(macro.uz)
        this.rho.set(macro.rho)
      }
      this.estimateDrag(rhoAir)
    }
  }

  private pendingNx = 22
  private pendingNy = 16
  private pendingNz = 22
  private pendingWarmup = 220

  configureGrid(nx: number, ny: number, nz: number, warmupSteps: number): void {
    this.pendingNx = nx
    this.pendingNy = ny
    this.pendingNz = nz
    this.pendingWarmup = warmupSteps
    this.ready = false
  }

  refine(iterations: number): void {
    if (!this.ready || !this.grid || iterations <= 0) return
    if (this.usingGpu && this.gpu) {
      if (this.gpuRefineInFlight) return
      this.gpuRefineInFlight = true
      void this.refineGpu(iterations)
      return
    }
    for (let s = 0; s < iterations; s++) this.step(this.grid)
  }

  private async refineGpu(iterations: number): Promise<void> {
    try {
      if (!this.gpu || !this.grid) return
      await this.gpu.runSteps(iterations)
      this.refineTick++
      if (this.ux.length > 0 && this.refineTick % this.gpuReadbackEvery === 0) {
        const macro = await this.gpu.readMacroscopic()
        this.ux.set(macro.ux)
        this.uy.set(macro.uy)
        this.uz.set(macro.uz)
        this.rho.set(macro.rho)
      }
    } finally {
      this.gpuRefineInFlight = false
    }
  }

  sample(position: THREE.Vector3, ctx: FlowSolverContext, params: FlowSolverParams): FlowSample {
    if (!this.ready || !this.grid) {
      const v = ctx.wind.clone().normalize().multiplyScalar(params.baseSpeed)
      return { velocity: v, speedRatio: 1, inWake: false, pressureProxy: 0 }
    }

    const rel = position.clone().sub(ctx.obstacleCenter)
    const forward = rel.dot(this.grid.wind)
    const dist = rel.length()
    const u = this.sampleVelocityTrilinear(position)
    if (this.isSolidAt(position)) u.set(0, 0, 0)

    const speed = u.length()
    const speedRatio = speed / Math.max(params.baseSpeed, 1e-6)
    const behind = forward > ctx.obstacleRadius * 0.2
    const inWake =
      behind && dist < ctx.obstacleRadius * 3.5 && speedRatio < 0.65 && !this.isSolidAt(position)

    const pressureProxy = inWake
      ? -0.55 * (1 - speedRatio)
      : 0.3 * (1 - speedRatio) * Math.min(1, dist / (ctx.obstacleRadius * 4))

    return { velocity: u, speedRatio, inWake, pressureProxy }
  }

  private initUniform(wind: THREE.Vector3): void {
    if (!this.grid) return
    const { solid, nx, ny, nz } = this.grid
    const n = nx * ny * nz
    const ux0 = wind.x * this.uLattice
    const uy0 = wind.y * this.uLattice
    const uz0 = wind.z * this.uLattice
    for (let idx = 0; idx < n; idx++) {
      const rho0 = solid[idx] ? 1 : 1
      const ux = solid[idx] ? 0 : ux0
      const uy = solid[idx] ? 0 : uy0
      const uz = solid[idx] ? 0 : uz0
      for (let q = 0; q < Q; q++) {
        this.f[idx * Q + q] = this.equilibrium(q, rho0, ux, uy, uz)
      }
    }
  }

  private equilibrium(q: number, rho: number, ux: number, uy: number, uz: number): number {
    const eu = EX[q] * ux + EY[q] * uy + EZ[q] * uz
    const u2 = ux * ux + uy * uy + uz * uz
    return W[q] * rho * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * u2)
  }

  private step(grid: ObstacleGrid): void {
    const { nx, ny, nz, solid, inletMask } = grid
    const n = nx * ny * nz
    const omega = 1 / this.tau

    for (let idx = 0; idx < n; idx++) {
      if (solid[idx]) continue
      let r = 0
      let jx = 0
      let jy = 0
      let jz = 0
      for (let q = 0; q < Q; q++) {
        const fq = this.f[idx * Q + q]
        r += fq
        jx += fq * EX[q]
        jy += fq * EY[q]
        jz += fq * EZ[q]
      }
      this.rho[idx] = r
      const inv = 1 / r
      this.ux[idx] = jx * inv
      this.uy[idx] = jy * inv
      this.uz[idx] = jz * inv

      const ux = this.ux[idx]
      const uy = this.uy[idx]
      const uz = this.uz[idx]
      for (let q = 0; q < Q; q++) {
        const feq = this.equilibrium(q, r, ux, uy, uz)
        const fi = this.f[idx * Q + q]
        this.f[idx * Q + q] = fi - omega * (fi - feq)
      }
    }

    this.fTmp.fill(0)
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        for (let k = 0; k < nz; k++) {
          const idx = cellIndex(i, j, k, ny, nz)
          if (solid[idx]) continue
          for (let q = 1; q < Q; q++) {
            const ii = i + EX[q]
            const jj = j + EY[q]
            const kk = k + EZ[q]
            if (ii < 0 || jj < 0 || kk < 0 || ii >= nx || jj >= ny || kk >= nz) {
              this.fTmp[idx * Q + q] += this.f[idx * Q + q]
              continue
            }
            const nidx = cellIndex(ii, jj, kk, ny, nz)
            if (solid[nidx]) {
              this.fTmp[idx * Q + OPP[q]] += this.f[idx * Q + q]
            } else {
              this.fTmp[nidx * Q + q] += this.f[idx * Q + q]
            }
          }
          this.fTmp[idx * Q] += this.f[idx * Q]
        }
      }
    }

    const tmp = this.f
    this.f = this.fTmp
    this.fTmp = tmp

    const uxIn = grid.wind.x * this.uLattice
    const uyIn = grid.wind.y * this.uLattice
    const uzIn = grid.wind.z * this.uLattice
    for (let idx = 0; idx < n; idx++) {
      if (solid[idx]) {
        for (let q = 0; q < Q; q++) this.f[idx * Q + q] = this.equilibrium(q, 1, 0, 0, 0)
        continue
      }
      if (inletMask[idx]) {
        for (let q = 0; q < Q; q++) this.f[idx * Q + q] = this.equilibrium(q, 1, uxIn, uyIn, uzIn)
      }
    }
  }

  private estimateDrag(rhoAir: number): void {
    if (!this.grid) return
    const { solid, nx, ny, nz, wind, cellSize, obstacleCenter } = this.grid
    const area = cellSize * cellSize
    let pressureDrag = 0
    let count = 0
    const p = new THREE.Vector3()

    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        for (let k = 0; k < nz; k++) {
          const idx = cellIndex(i, j, k, ny, nz)
          if (!solid[idx]) continue
          const rho = this.rho[idx]
          const pressure = rho * CS2
          p.set(i + 0.5, j + 0.5, k + 0.5)
          const nxw = Math.abs(wind.x)
          const nyw = Math.abs(wind.y)
          const nzw = Math.abs(wind.z)
          pressureDrag += pressure * area * (nxw + nyw + nzw) * 0.33
          count++
        }
      }
    }

    if (count === 0) return
    const q = 0.5 * rhoAir * this.baseSpeed * this.baseSpeed
    this.frontalArea = Math.max(area * Math.cbrt(count), 1e-6)
    this.estimatedDrag = pressureDrag * (this.baseSpeed / this.uLattice) ** 2 * 0.15
    this.estimatedCd = q > 1e-9 ? this.estimatedDrag / (q * this.frontalArea) : 1
    this.estimatedCd = Math.max(0.05, Math.min(3, this.estimatedCd))
    void obstacleCenter
  }

  private worldToGrid(position: THREE.Vector3): { fi: number; fj: number; fk: number } {
    const g = this.grid!
    return {
      fi: (position.x - g.origin.x) / g.cellSize - 0.5,
      fj: (position.y - g.origin.y) / g.cellSize - 0.5,
      fk: (position.z - g.origin.z) / g.cellSize - 0.5,
    }
  }

  private isSolidAt(position: THREE.Vector3): boolean {
    const g = this.grid!
    const { fi, fj, fk } = this.worldToGrid(position)
    const i = Math.floor(fi)
    const j = Math.floor(fj)
    const k = Math.floor(fk)
    if (i < 0 || j < 0 || k < 0 || i >= g.nx || j >= g.ny || k >= g.nz) return false
    return g.solid[cellIndex(i, j, k, g.ny, g.nz)] === 1
  }

  private sampleVelocityTrilinear(position: THREE.Vector3): THREE.Vector3 {
    const g = this.grid!
    const { fi, fj, fk } = this.worldToGrid(position)
    const i0 = Math.floor(fi)
    const j0 = Math.floor(fj)
    const k0 = Math.floor(fk)
    if (i0 < 0 || j0 < 0 || k0 < 0 || i0 >= g.nx - 1 || j0 >= g.ny - 1 || k0 >= g.nz - 1) {
      return g.wind.clone().multiplyScalar(this.baseSpeed)
    }

    const tx = fi - i0
    const ty = fj - j0
    const tz = fk - k0
    const v = new THREE.Vector3()
    let weight = 0
    const scale = this.baseSpeed / this.uLattice

    for (let di = 0; di <= 1; di++) {
      for (let dj = 0; dj <= 1; dj++) {
        for (let dk = 0; dk <= 1; dk++) {
          const i = i0 + di
          const j = j0 + dj
          const k = k0 + dk
          const idx = cellIndex(i, j, k, g.ny, g.nz)
          if (g.solid[idx]) continue
          const w = (di ? tx : 1 - tx) * (dj ? ty : 1 - ty) * (dk ? tz : 1 - tz)
          v.x += this.ux[idx] * w
          v.y += this.uy[idx] * w
          v.z += this.uz[idx] * w
          weight += w
        }
      }
    }
    if (weight < 1e-6) return g.wind.clone().multiplyScalar(this.baseSpeed)
    return v.multiplyScalar(scale / weight)
  }
}
