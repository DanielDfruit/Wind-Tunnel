const MPH_TO_MS = 0.44704

export function mphToMs(mph: number): number {
  return mph * MPH_TO_MS
}

export function msToMph(ms: number): number {
  return ms / MPH_TO_MS
}

export function airSpeedToMs(speed: number, unit: 'mph' | 'ms'): number {
  return unit === 'mph' ? mphToMs(speed) : speed
}

export function speedToMs(speed: number, unit: 'mph' | 'ms'): number {
  return airSpeedToMs(speed, unit)
}

export function formatSpeed(speedMs: number, unit: 'mph' | 'ms'): string {
  return unit === 'mph' ? `${msToMph(speedMs).toFixed(1)} mph` : `${speedMs.toFixed(2)} m/s`
}

export function formatNumber(n: number, digits = 2): string {
  if (Math.abs(n) >= 1e6 || (Math.abs(n) < 0.001 && n !== 0)) return n.toExponential(digits)
  return n.toFixed(digits)
}

export function particleCountForQuality(quality: string, density: number): number {
  const base: Record<string, number> = { low: 280, medium: 600, high: 1100, ultra: 1800 }
  return Math.round((base[quality] ?? 600) * (0.45 + density * 0.55))
}
