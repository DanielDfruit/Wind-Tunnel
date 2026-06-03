import { airSpeedToMs } from '../utils/units'

export interface SweepPoint {
  x: number
  y: number
  label?: string
}

/** Drag vs air speed sweep using same formulas as statistics panel */
export function sweepDragVsSpeed(
  speedsMph: number[],
  rho: number,
  mu: number,
  L: number,
  A: number,
  Cd: number
): SweepPoint[] {
  return speedsMph.map((mph) => {
    const v = airSpeedToMs(mph, 'mph')
    const q = 0.5 * rho * v * v
    const drag = Cd * q * A
    return { x: mph, y: drag }
  })
}

export function sweepReVsSpeed(speedsMph: number[], rho: number, mu: number, L: number): SweepPoint[] {
  return speedsMph.map((mph) => {
    const v = airSpeedToMs(mph, 'mph')
    return { x: mph, y: (rho * v * L) / mu }
  })
}

export function sweepPressureVsSpeed(speedsMph: number[], rho: number): SweepPoint[] {
  return speedsMph.map((mph) => {
    const v = airSpeedToMs(mph, 'mph')
    return { x: mph, y: 0.5 * rho * v * v }
  })
}

export function sweepWakeVsYaw(
  yaws: number[],
  baseWake: number,
  frontalAtYaw: (yawDeg: number) => number
): SweepPoint[] {
  return yaws.map((yaw) => {
    const areaFactor = frontalAtYaw(yaw) / Math.max(frontalAtYaw(0), 1e-6)
    return { x: yaw, y: baseWake * (0.5 + 0.5 * areaFactor) }
  })
}

export function sweepAreaVsYaw(yaws: number[], areaFn: (yawDeg: number) => number): SweepPoint[] {
  return yaws.map((yaw) => ({ x: yaw, y: areaFn(yaw) }))
}
