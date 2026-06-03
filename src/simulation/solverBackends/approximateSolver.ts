import type * as THREE from 'three'
import { sampleFlow, type FlowSample } from '../flowModel'
import type { FlowSolverBackend, FlowSolverContext, FlowSolverParams } from './types'

/** Educational distance-field flow — original v1 visual model. */
export class ApproximateVisualSolver implements FlowSolverBackend {
  readonly id = 'visual' as const
  readonly label = 'Visual approximate'
  readonly description = 'Fast heuristic field for teaching — not a PDE solver'
  readonly ready = true

  rebuildFromObject(): void {
    /* stateless */
  }

  refine(): void {
    /* stateless */
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
