import type * as THREE from 'three'
import type { VizQuality } from '../../types/simulationTypes'
import { paddedBox } from '../../utils/geometry'
import { ApproximateVisualSolver } from './approximateSolver'
import { LBMSolver } from './lbmSolver'
import {
  ensureWebGpuDevice,
  getWebGpuLbmStatus,
  isWebGpuLbmReady,
} from './lbmWebGpu'
import { OpenFoamStubSolver } from './openFoamStub'
import { PotentialFlowSolver } from './potentialFlowSolver'
import type {
  FlowSolverBackend,
  FlowSolverContext,
  FlowSolverParams,
  FluidProperties,
  SolverInfo,
  SolverMode,
} from './types'

const visualSolver = new ApproximateVisualSolver()
const potentialSolver = new PotentialFlowSolver()
const lbmSolver = new LBMSolver()
const openFoamSolver = new OpenFoamStubSolver()

const solvers: Record<SolverMode, FlowSolverBackend> = {
  visual: visualSolver,
  potential: potentialSolver,
  lbm: lbmSolver,
  openfoam: openFoamSolver,
}

let activeMode: SolverMode = 'lbm'

function gridForQuality(quality: VizQuality): { nx: number; ny: number; nz: number } {
  switch (quality) {
    case 'low':
      return { nx: 22, ny: 16, nz: 22 }
    case 'medium':
      return { nx: 28, ny: 20, nz: 28 }
    case 'high':
      return { nx: 34, ny: 24, nz: 34 }
    case 'ultra':
      return { nx: 40, ny: 28, nz: 40 }
    default:
      return { nx: 28, ny: 20, nz: 28 }
  }
}

function lbmGridCpu(quality: VizQuality): { nx: number; ny: number; nz: number; warmup: number } {
  switch (quality) {
    case 'low':
      return { nx: 18, ny: 14, nz: 18, warmup: 160 }
    case 'medium':
      return { nx: 22, ny: 16, nz: 22, warmup: 220 }
    case 'high':
      return { nx: 26, ny: 18, nz: 26, warmup: 280 }
    case 'ultra':
      return { nx: 30, ny: 20, nz: 30, warmup: 340 }
    default:
      return { nx: 22, ny: 16, nz: 22, warmup: 220 }
  }
}

function lbmGridGpu(quality: VizQuality): { nx: number; ny: number; nz: number; warmup: number } {
  switch (quality) {
    case 'low':
      return { nx: 24, ny: 18, nz: 24, warmup: 120 }
    case 'medium':
      return { nx: 32, ny: 22, nz: 32, warmup: 160 }
    case 'high':
      return { nx: 40, ny: 26, nz: 40, warmup: 200 }
    case 'ultra':
      return { nx: 48, ny: 30, nz: 48, warmup: 240 }
    default:
      return { nx: 32, ny: 22, nz: 32, warmup: 160 }
  }
}

function lbmGridForQuality(quality: VizQuality): { nx: number; ny: number; nz: number; warmup: number } {
  return isWebGpuLbmReady() ? lbmGridGpu(quality) : lbmGridCpu(quality)
}

export { ensureWebGpuDevice, getWebGpuLbmStatus, isWebGpuLbmReady }

export function getLbmComputeLabel(): string {
  if (activeMode !== 'lbm') return ''
  if (lbmSolver.isUsingGpu()) {
    const { detail } = getWebGpuLbmStatus()
    return detail ? `WebGPU (${detail})` : 'WebGPU'
  }
  const { status, detail } = getWebGpuLbmStatus()
  if (status === 'ready' && !lbmSolver.ready) return 'WebGPU (initializing…)'
  return detail ? `CPU fallback (${detail})` : 'CPU fallback'
}

export function getSolverMode(): SolverMode {
  return activeMode
}

export function setSolverMode(mode: SolverMode): FlowSolverBackend {
  activeMode = mode
  return solvers[mode]
}

export function getActiveSolver(): FlowSolverBackend {
  return solvers[activeMode]
}

export function getSolverInfo(): SolverInfo {
  const s = getActiveSolver()
  const info: SolverInfo = {
    id: s.id,
    label: s.label,
    description: s.description,
    ready: s.ready,
  }
  if (s.id === 'openfoam' && openFoamSolver instanceof OpenFoamStubSolver) {
    info.statusNote = openFoamSolver.statusNote
  }
  if (s.id === 'lbm') {
    info.computeBackend = getLbmComputeLabel()
    if (!s.ready) {
      info.statusNote = 'Building viscous flow field…'
    }
  }
  return info
}

/** Drag coefficient estimated from the active LBM field (when ready). */
export function getSolverDragEstimate(): { cd: number; dragForce: number } | null {
  if (activeMode !== 'lbm' || !lbmSolver.ready) return null
  return lbmSolver.getEstimatedCoefficients()
}

export async function rebuildFlowSolver(
  object: THREE.Object3D,
  modelBox: THREE.Box3,
  wind: THREE.Vector3,
  baseSpeed: number,
  vizQuality: VizQuality,
  fluid?: FluidProperties
): Promise<void> {
  const solver = getActiveSolver()
  if (solver.id === 'potential') {
    const g = gridForQuality(vizQuality)
    potentialSolver.setGridResolution(g.nx, g.ny, g.nz)
  }
  if (solver.id === 'lbm') {
    const g = lbmGridForQuality(vizQuality)
    lbmSolver.configureGrid(g.nx, g.ny, g.nz, g.warmup)
  }
  const domain = paddedBox(modelBox, 2.4)
  if (solver.id === 'lbm') {
    await lbmSolver.rebuildFromObjectAsync(object, domain, wind, baseSpeed, fluid)
  } else {
    solver.rebuildFromObject(object, domain, wind, baseSpeed, fluid)
  }
}

let rebuildQueued = false
let rebuildInFlight = false
let pendingRebuild: (() => void) | null = null

/** Run heavy grid rebuild off the render hot path so imports stay responsive. */
export function scheduleFlowSolverRebuild(
  object: THREE.Object3D,
  modelBox: THREE.Box3,
  wind: THREE.Vector3,
  baseSpeed: number,
  vizQuality: VizQuality,
  fluid?: FluidProperties,
  onDone?: () => void
): void {
  const run = () => {
    if (rebuildInFlight) {
      pendingRebuild = run
      return
    }
    rebuildQueued = true
    rebuildInFlight = true
    void (async () => {
      try {
        await rebuildFlowSolver(object, modelBox, wind, baseSpeed, vizQuality, fluid)
        onDone?.()
      } finally {
        rebuildQueued = false
        rebuildInFlight = false
        const next = pendingRebuild
        pendingRebuild = null
        if (next) next()
      }
    })()
  }

  if (rebuildQueued || rebuildInFlight) {
    pendingRebuild = run
    return
  }

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 200 })
  } else {
    setTimeout(run, 0)
  }
}

export function refineFlowSolver(iterations: number): void {
  if (rebuildQueued || rebuildInFlight) return
  getActiveSolver().refine(iterations)
}

export function refineFlowSolverLive(iterations: number): void {
  if (rebuildQueued || rebuildInFlight) return
  const id = getActiveSolver().id
  if (id === 'lbm' || id === 'potential') refineFlowSolver(iterations)
}

export function sampleFlowField(
  position: THREE.Vector3,
  ctx: FlowSolverContext,
  params: FlowSolverParams
) {
  return getActiveSolver().sample(position, ctx, params)
}

export const SOLVER_OPTIONS: { id: SolverMode; label: string }[] = [
  { id: 'lbm', label: 'Navier-Stokes (LBM)' },
  { id: 'potential', label: 'Potential flow (inviscid)' },
  { id: 'visual', label: 'Visual approximate' },
  { id: 'openfoam', label: 'OpenFOAM (external)' },
]
