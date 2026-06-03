import * as THREE from 'three'
import { spawnUpstreamPosition } from './flowModel'
import { sampleFlowField } from './solverBackends'
import type { FlowSolverContext, FlowSolverParams } from './solverBackends/types'

export interface Particle {
  position: THREE.Vector3
  velocity: THREE.Vector3
  age: number
  trail: THREE.Vector3[]
}

export function createParticles(count: number, wind: THREE.Vector3, tunnelHalf: number): Particle[] {
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    particles.push({
      position: spawnUpstreamPosition(wind, tunnelHalf, Math.random),
      velocity: wind.clone(),
      age: Math.random() * 2,
      trail: []
    })
  }
  return particles
}

export function stepParticles(
  particles: Particle[],
  wind: THREE.Vector3,
  obstacleCenter: THREE.Vector3,
  obstacleRadius: number,
  dt: number,
  opts: {
    baseSpeed: number
    multiplier: number
    turbulence: number
    wakePersistence: number
    tunnelHalf: number
    trailLen: number
    time: number
  }
): { meanSpeed: number; maxSpeed: number; minSpeed: number; wakeHits: number } {
  let speedSum = 0
  let maxSpeed = 0
  let minSpeed = Infinity
  let wakeHits = 0

  const ctx: FlowSolverContext = { wind, obstacleCenter, obstacleRadius }
  const params: FlowSolverParams = {
    baseSpeed: opts.baseSpeed * opts.multiplier,
    turbulence: opts.turbulence,
    wakePersistence: opts.wakePersistence,
    time: opts.time,
  }

  for (const p of particles) {
    const flow = sampleFlowField(p.position, ctx, params)

    p.velocity.lerp(flow.velocity, 0.35)
    p.position.addScaledVector(p.velocity, dt)
    p.age += dt

    const speed = p.velocity.length()
    speedSum += speed
    maxSpeed = Math.max(maxSpeed, speed)
    minSpeed = Math.min(minSpeed, speed)
    if (flow.inWake) wakeHits++

    p.trail.push(p.position.clone())
    if (p.trail.length > opts.trailLen) p.trail.shift()

    const distFromCenter = p.position.length()
    if (distFromCenter > opts.tunnelHalf * 2.5 || p.age > 6) {
      p.position.copy(spawnUpstreamPosition(wind, opts.tunnelHalf, Math.random))
      p.velocity.copy(wind)
      p.age = 0
      p.trail.length = 0
    }
  }

  const n = particles.length || 1
  return {
    meanSpeed: speedSum / n,
    maxSpeed,
    minSpeed: minSpeed === Infinity ? 0 : minSpeed,
    wakeHits: wakeHits / n
  }
}
