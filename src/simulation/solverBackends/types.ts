import type * as THREE from 'three'
import type { FlowSample } from '../flowModel'

export type SolverMode = 'visual' | 'potential' | 'lbm' | 'openfoam'

export interface FluidProperties {
  density: number
  dynamicViscosity: number
}

export interface FlowSolverParams {
  baseSpeed: number
  turbulence: number
  wakePersistence: number
  time: number
}

export interface FlowSolverContext {
  wind: THREE.Vector3
  obstacleCenter: THREE.Vector3
  obstacleRadius: number
}

export interface FlowSolverBackend {
  readonly id: SolverMode
  readonly label: string
  readonly description: string
  readonly ready: boolean
  rebuildFromObject(
    object: THREE.Object3D,
    domainBox: THREE.Box3,
    wind: THREE.Vector3,
    baseSpeed: number,
    fluid?: FluidProperties
  ): void
  refine(iterations: number): void
  sample(position: THREE.Vector3, ctx: FlowSolverContext, params: FlowSolverParams): FlowSample
}

export interface SolverInfo {
  id: SolverMode
  label: string
  description: string
  ready: boolean
  statusNote?: string
  computeBackend?: string
}
