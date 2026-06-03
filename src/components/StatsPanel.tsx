import { useSimulationStore } from '../store/simulationStore'
import { formatSpeed } from '../utils/units'

function StatCard({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit ? ` ${unit}` : ''}
      </div>
    </div>
  )
}

export function StatsPanel() {
  const stats = useSimulationStore((s) => s.stats)
  const env = useSimulationStore((s) => s.env)
  const model = useSimulationStore((s) => s.model)
  const solverInfo = useSimulationStore((s) => s.solverInfo)

  const disclaimer =
    solverInfo.id === 'lbm'
      ? 'Viscous LBM (Navier-Stokes limit) — coarse grid, educational use'
      : solverInfo.id === 'potential'
        ? 'Inviscid potential flow — not viscous CFD'
        : solverInfo.id === 'openfoam'
          ? 'OpenFOAM not connected — stats are approximate'
          : 'Visual approximate field — not validated CFD'

  return (
    <aside className="panel panel-right">
      <div className="section-title">Live Statistics</div>
      <p style={{ fontSize: 10, color: 'var(--warn)', margin: '0 0 4px' }}>{disclaimer}</p>
      <p style={{ fontSize: 10, color: 'var(--muted)', margin: '0 0 4px' }}>{solverInfo.label}</p>
      {solverInfo.id === 'lbm' && solverInfo.computeBackend ? (
        <p style={{ fontSize: 10, color: 'var(--accent)', margin: '0 0 8px' }}>
          Compute: {solverInfo.computeBackend}
        </p>
      ) : (
        <div style={{ marginBottom: 8 }} />
      )}
      <StatCard label="Air Speed" value={formatSpeed(stats.airSpeedMs, env.speedUnit)} />
      <StatCard label="Reynolds Number" value={stats.reynolds.toFixed(0)} />
      <StatCard label="Dynamic Pressure" value={stats.dynamicPressure.toFixed(2)} unit="Pa" />
      <StatCard label="Drag Force (est.)" value={stats.dragForce.toFixed(3)} unit="N" />
      <StatCard label="Cd" value={stats.cd.toFixed(2)} />
      <StatCard label="Frontal Area (proxy)" value={(model?.frontalAreaProxy ?? 0).toFixed(4)} unit="m²" />
      <StatCard label="Char. Length" value={(model?.characteristicLength ?? 0).toFixed(3)} unit="m" />
      <StatCard label="Wake Intensity" value={(stats.wakeIntensity * 100).toFixed(1)} unit="%" />
      <StatCard label="Turbulence Proxy" value={(stats.turbulenceProxy * 100).toFixed(1)} unit="%" />
      <StatCard label="Mean Particle Vel." value={stats.meanParticleVelocity.toFixed(2)} unit="m/s" />
      <StatCard label="Max Vel. Proxy" value={stats.maxVelocityProxy.toFixed(2)} unit="m/s" />
      <StatCard label="Min Vel. Proxy" value={stats.minVelocityProxy.toFixed(2)} unit="m/s" />
      <StatCard label="Active Particles" value={String(stats.activeParticles)} />
      <StatCard label="FPS" value={stats.fps.toFixed(0)} />
      {model?.meshSimplified && (
        <p style={{ fontSize: 10, color: 'var(--muted)', margin: '0 0 8px' }}>
          Imported mesh was decimated for real-time preview.
        </p>
      )}
      {model && (
        <StatCard
          label="Dimensions"
          value={`${model.dimensions.x.toFixed(2)} × ${model.dimensions.y.toFixed(2)} × ${model.dimensions.z.toFixed(2)}`}
          unit="m"
        />
      )}
      <StatCard label="Air Density" value={env.airDensity.toFixed(3)} unit="kg/m³" />
      <StatCard label="Viscosity" value={env.dynamicViscosity.toExponential(2)} unit="Pa·s" />
    </aside>
  )
}
