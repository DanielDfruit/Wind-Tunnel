import * as THREE from 'three'

export interface FlowSample {
  velocity: THREE.Vector3
  speedRatio: number
  inWake: boolean
  pressureProxy: number
}

/**
 * Approximate flow field — distance-based deflection, not CFD.
 * Designed so a real solver backend could replace this module later.
 */
export function sampleFlow(
  position: THREE.Vector3,
  wind: THREE.Vector3,
  obstacleCenter: THREE.Vector3,
  obstacleRadius: number,
  opts: {
    baseSpeed: number
    turbulence: number
    wakePersistence: number
    time: number
  }
): FlowSample {
  const windNorm = wind.clone().normalize()
  const rel = position.clone().sub(obstacleCenter)
  const dist = rel.length()
  const influence = obstacleRadius / Math.max(dist, obstacleRadius * 0.15)
  const clampedInfluence = Math.min(influence, 3)

  const velocity = windNorm.clone().multiplyScalar(opts.baseSpeed)

  const forward = rel.dot(windNorm)
  if (forward < 0 && dist < obstacleRadius * 2.5) {
    const stagnation = 1 - Math.exp(-dist / obstacleRadius) * 0.7
    velocity.multiplyScalar(0.3 + 0.7 * stagnation)
  }

  const lateral = rel.clone().sub(windNorm.clone().multiplyScalar(forward))
  if (dist < obstacleRadius * 2.2 && lateral.lengthSq() > 1e-8) {
    const push = lateral.normalize().multiplyScalar(opts.baseSpeed * 0.4 * clampedInfluence)
    velocity.add(push)
  }

  const behind = forward > obstacleRadius * 0.3
  const inWake = behind && dist < obstacleRadius * 3.5
  if (inWake) {
    const wakeFactor = opts.wakePersistence * (1 - Math.min(1, dist / (obstacleRadius * 4)))
    const noise =
      opts.turbulence *
      (Math.sin(opts.time * 4 + position.x * 3) * 0.5 + Math.cos(opts.time * 3 + position.z * 2) * 0.5)
    velocity.multiplyScalar(0.4 + 0.3 * (1 - wakeFactor))
    velocity.y += noise * opts.baseSpeed * 0.2
    velocity.x += noise * opts.baseSpeed * 0.15
  } else if (dist < obstacleRadius * 1.5) {
    velocity.multiplyScalar(1 + 0.25 * clampedInfluence)
  }

  const speedRatio = velocity.length() / Math.max(opts.baseSpeed, 1e-6)
  const dotWind = dist > 1e-6 ? rel.normalize().dot(windNorm) : 0
  const pressureProxy = inWake ? -0.6 * (1 - speedRatio) : 0.3 * dotWind * (1 - dist / (obstacleRadius * 4))

  return { velocity, speedRatio, inWake, pressureProxy }
}

export function spawnUpstreamPosition(
  wind: THREE.Vector3,
  tunnelHalf: number,
  rng: () => number
): THREE.Vector3 {
  const w = wind.clone().normalize()
  const up = Math.abs(w.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const right = new THREE.Vector3().crossVectors(w, up).normalize()
  const top = new THREE.Vector3().crossVectors(right, w).normalize()
  const u = (rng() - 0.5) * tunnelHalf * 1.6
  const v = (rng() - 0.5) * tunnelHalf * 1.6
  const upstream = -tunnelHalf * 1.2
  return w
    .clone()
    .multiplyScalar(upstream)
    .add(right.clone().multiplyScalar(u))
    .add(top.clone().multiplyScalar(v))
}

export function pressureToColor(pressure: number): THREE.Color {
  const t = Math.max(0, Math.min(1, pressure * 0.5 + 0.5))
  const color = new THREE.Color()
  color.setHSL(0.65 - t * 0.65, 0.85, 0.35 + t * 0.25)
  return color
}
