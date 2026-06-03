import type * as THREE from 'three'
import { sampleFlow, type FlowSample } from '../flowModel'
import type { FlowSolverBackend, FlowSolverContext, FlowSolverParams } from './types'

/**
 * Placeholder for external OpenFOAM / snappyHexMesh integration (see docs/09_*).
 * Falls back to visual sampling until a host-side runner is implemented.
 */
export class OpenFoamStubSolver implements FlowSolverBackend {
  readonly id = 'openfoam' as const
  readonly label = 'OpenFOAM (external)'
  readonly description = 'Requires OpenFOAM installed on the host — not bundled in v1'
  readonly ready = false
  statusNote =
    'OpenFOAM backend not connected. Install OpenFOAM and use case export (future). Using visual fallback for particles.'

  rebuildFromObject(): void {
    /* no-op until subprocess bridge exists */
  }

  refine(): void {
    /* no-op */
  }

  sample(position: THREE.Vector3, ctx: FlowSolverContext, params: FlowSolverParams): FlowSample {
    return sampleFlow(position, ctx.wind, ctx.obstacleCenter, ctx.obstacleRadius, {
      baseSpeed: params.baseSpeed,
      turbulence: params.turbulence,
      wakePersistence: params.wakePersistence,
      time: params.time,
    })
  }
}
