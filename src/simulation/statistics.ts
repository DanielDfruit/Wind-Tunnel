import type { EnvironmentSettings, LiveStats } from '../types/simulationTypes'
import { airSpeedToMs } from '../utils/units'

export interface StatInputs {
  env: EnvironmentSettings
  characteristicLength: number
  frontalArea: number
  solverCd?: number
  solverDrag?: number
  wakeIntensity: number
  turbulenceProxy: number
  meanParticleVelocity: number
  maxVelocityProxy: number
  minVelocityProxy: number
  activeParticles: number
  fps: number
}

/** NASA-style approximations — educational model, not validated CFD */
export function computeStatistics(inputs: StatInputs): LiveStats {
  const rho = inputs.env.airDensity
  const mu = inputs.env.dynamicViscosity
  const v = airSpeedToMs(inputs.env.airSpeed, inputs.env.speedUnit)
  const L = inputs.characteristicLength
  const A = inputs.frontalArea
  const Cd =
    inputs.solverCd !== undefined && Number.isFinite(inputs.solverCd)
      ? inputs.solverCd
      : inputs.env.cdOverride

  // q = 0.5 * rho * v^2
  const dynamicPressure = 0.5 * rho * v * v

  // Re = rho * V * L / mu
  const reynolds = (rho * v * L) / mu

  // D from LBM estimate when available, else textbook formula
  const dragForce =
    inputs.solverDrag !== undefined && Number.isFinite(inputs.solverDrag)
      ? inputs.solverDrag
      : Cd * dynamicPressure * A

  return {
    airSpeedMs: v,
    reynolds,
    dynamicPressure,
    dragForce,
    cd: Cd,
    wakeIntensity: inputs.wakeIntensity,
    turbulenceProxy: inputs.turbulenceProxy,
    meanParticleVelocity: inputs.meanParticleVelocity,
    maxVelocityProxy: inputs.maxVelocityProxy,
    minVelocityProxy: inputs.minVelocityProxy,
    activeParticles: inputs.activeParticles,
    fps: inputs.fps
  }
}
