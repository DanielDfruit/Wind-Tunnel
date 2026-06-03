import { useSimulationStore } from '../store/simulationStore'
import { windFromYawPitch } from '../utils/geometry'
import type { DemoObjectId, SolverMode } from '../types/simulationTypes'
import { SOLVER_OPTIONS } from '../simulation/solverBackends'
import type { CameraViewPreset } from '../utils/camera'

const PRESETS: { label: string; yaw: number; pitch: number }[] = [
  { label: 'Front', yaw: 0, pitch: 0 },
  { label: 'Back', yaw: 180, pitch: 0 },
  { label: 'Left', yaw: -90, pitch: 0 },
  { label: 'Right', yaw: 90, pitch: 0 },
  { label: 'Top', yaw: 0, pitch: 89 },
  { label: 'Bottom', yaw: 0, pitch: -89 }
]

const DEMOS: { id: DemoObjectId; label: string }[] = [
  { id: 'sphere', label: 'Sphere' },
  { id: 'cube', label: 'Cube' },
  { id: 'cylinder', label: 'Cylinder' },
  { id: 'airfoil', label: 'Airfoil' },
  { id: 'vehicle', label: 'Vehicle' },
  { id: 'plane', label: 'Plane' }
]

const CAMERA_VIEWS: { preset: CameraViewPreset; label: string }[] = [
  { preset: 'iso', label: 'Iso' },
  { preset: 'front', label: 'Front' },
  { preset: 'back', label: 'Back' },
  { preset: 'top', label: 'Top' },
  { preset: 'left', label: 'Left' },
  { preset: 'right', label: 'Right' },
]

interface ControlPanelProps {
  resetViewRef: React.MutableRefObject<(() => void) | null>
  frameViewRef: React.MutableRefObject<(() => void) | null>
  cameraViewRef: React.MutableRefObject<((preset: CameraViewPreset) => void) | null>
  normalizeRef: React.MutableRefObject<(() => void) | null>
  orientUprightRef: React.MutableRefObject<(() => void) | null>
  rotateRef: React.MutableRefObject<((axis: 'x' | 'y' | 'z', deg: number) => void) | null>
}

export function ControlPanel({
  resetViewRef,
  frameViewRef,
  cameraViewRef,
  normalizeRef,
  orientUprightRef,
  rotateRef,
}: ControlPanelProps) {
  const env = useSimulationStore((s) => s.env)
  const wind = useSimulationStore((s) => s.wind)
  const toggles = useSimulationStore((s) => s.toggles)
  const setEnv = useSimulationStore((s) => s.setEnv)
  const setWind = useSimulationStore((s) => s.setWind)
  const setToggles = useSimulationStore((s) => s.setToggles)
  const setDemo = useSimulationStore((s) => s.setDemo)
  const solverMode = useSimulationStore((s) => s.solverMode)
  const solverInfo = useSimulationStore((s) => s.solverInfo)
  const setSolverMode = useSimulationStore((s) => s.setSolverMode)
  const exporting = useSimulationStore((s) => s.exporting)
  const paused = useSimulationStore((s) => s.paused)
  const togglePaused = useSimulationStore((s) => s.togglePaused)
  const model = useSimulationStore((s) => s.model)

  const applyPreset = (yaw: number, pitch: number) => {
    const v = windFromYawPitch(yaw, pitch)
    setWind({ yaw, pitch, vector: { x: v.x, y: v.y, z: v.z } })
  }

  return (
    <aside className="panel">
      <div className="section-title">Simulation</div>
      <button
        type="button"
        className={paused ? 'btn btn-primary' : 'btn'}
        disabled={exporting}
        onClick={togglePaused}
      >
        {paused ? 'Resume simulation' : 'Pause simulation'}
      </button>
      {paused && (
        <p style={{ fontSize: 10, color: 'var(--warn)', margin: '6px 0 0' }}>
          Paused — camera and model controls still work.
        </p>
      )}

      <div className="section-title">Physics Solver</div>
      <label>Solver mode</label>
      <select
        value={solverMode}
        disabled={exporting}
        onChange={(e) => setSolverMode(e.target.value as SolverMode)}
      >
        {SOLVER_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <p style={{ fontSize: 10, color: 'var(--muted)', margin: '6px 0 0', lineHeight: 1.35 }}>
        {solverInfo.description}
        {solverInfo.statusNote ? ` — ${solverInfo.statusNote}` : ''}
        {(solverMode === 'lbm' || solverMode === 'potential') && !solverInfo.ready
          ? ' — building flow grid…'
          : ''}
      </p>
      {solverMode === 'lbm' && solverInfo.computeBackend && (
        <p style={{ fontSize: 10, color: 'var(--accent)', margin: '4px 0 0' }}>
          Compute: {solverInfo.computeBackend}
        </p>
      )}

      <div className="section-title">Demo Objects</div>
      <div className="preset-grid">
        {DEMOS.map((d) => (
          <button key={d.id} type="button" className="btn" disabled={exporting} onClick={() => setDemo(d.id)}>
            {d.label}
          </button>
        ))}
      </div>

      <div className="section-title">Model &amp; Camera</div>
      <button type="button" className="btn" disabled={exporting} onClick={() => frameViewRef.current?.()}>
        Fit Model to View
      </button>
      <button type="button" className="btn" disabled={exporting} style={{ marginTop: 4 }} onClick={() => resetViewRef.current?.()}>
        Reset Camera
      </button>
      <button type="button" className="btn" disabled={exporting} style={{ marginTop: 4 }} onClick={() => orientUprightRef.current?.()}>
        Auto Stand Upright (Y-up)
      </button>
      <button type="button" className="btn" disabled={exporting} style={{ marginTop: 4 }} onClick={() => normalizeRef.current?.()}>
        Normalize Scale
      </button>
      {model?.meshSimplified && (
        <p style={{ fontSize: 10, color: 'var(--muted)', margin: '6px 0 0' }}>
          Mesh simplified for performance ({model.vertexCount?.toLocaleString()} verts).
        </p>
      )}
      {model?.heavyMesh && (
        <p style={{ fontSize: 10, color: 'var(--warn)', margin: '4px 0 0' }}>
          Large model: visual solver, fewer particles, streamlines off.
        </p>
      )}
      <div className="preset-grid" style={{ marginTop: 8 }}>
        {CAMERA_VIEWS.map((v) => (
          <button
            key={v.preset}
            type="button"
            className="btn"
            disabled={exporting}
            onClick={() => cameraViewRef.current?.(v.preset)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="section-title" style={{ marginTop: 10 }}>
        Rotate Model
      </div>
      <div className="preset-grid">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <button
            key={axis}
            type="button"
            className="btn"
            disabled={exporting}
            onClick={() => rotateRef.current?.(axis, 90)}
          >
            +{axis.toUpperCase()} 90°
          </button>
        ))}
      </div>
      <div className="preset-grid" style={{ marginTop: 4 }}>
        {(['x', 'y', 'z'] as const).map((axis) => (
          <button
            key={`${axis}-`}
            type="button"
            className="btn"
            disabled={exporting}
            onClick={() => rotateRef.current?.(axis, -90)}
          >
            −{axis.toUpperCase()} 90°
          </button>
        ))}
      </div>

      <div className="section-title">Wind Direction</div>
      <div className="preset-grid">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="btn" disabled={exporting} onClick={() => applyPreset(p.yaw, p.pitch)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="slider-row">
        <label>Yaw {wind.yaw.toFixed(0)}°</label>
        <input
          type="range"
          min={-180}
          max={180}
          value={wind.yaw}
          disabled={exporting}
          onChange={(e) => {
            const yaw = +e.target.value
            const v = windFromYawPitch(yaw, wind.pitch)
            setWind({ yaw, vector: { x: v.x, y: v.y, z: v.z } })
          }}
        />
      </div>
      <div className="slider-row">
        <label>Pitch {wind.pitch.toFixed(0)}°</label>
        <input
          type="range"
          min={-89}
          max={89}
          value={wind.pitch}
          disabled={exporting}
          onChange={(e) => {
            const pitch = +e.target.value
            const v = windFromYawPitch(wind.yaw, pitch)
            setWind({ pitch, vector: { x: v.x, y: v.y, z: v.z } })
          }}
        />
      </div>

      <div className="section-title">Environment</div>
      <label>Speed Unit</label>
      <select value={env.speedUnit} disabled={exporting} onChange={(e) => setEnv({ speedUnit: e.target.value as 'mph' | 'ms' })}>
        <option value="mph">mph</option>
        <option value="ms">m/s</option>
      </select>
      <div className="slider-row">
        <label>
          Air Speed <span className="value">{env.airSpeed.toFixed(1)}</span>
        </label>
        <input type="range" min={1} max={120} value={env.airSpeed} disabled={exporting} onChange={(e) => setEnv({ airSpeed: +e.target.value })} />
      </div>
      <div className="slider-row">
        <label>
          Air Density <span className="value">{env.airDensity.toFixed(3)}</span>
        </label>
        <input type="range" min={0.5} max={2} step={0.01} value={env.airDensity} disabled={exporting} onChange={(e) => setEnv({ airDensity: +e.target.value })} />
      </div>
      <div className="slider-row">
        <label>Cd Override</label>
        <input type="range" min={0.01} max={3} step={0.01} value={env.cdOverride} disabled={exporting} onChange={(e) => setEnv({ cdOverride: +e.target.value })} />
      </div>
      <div className="slider-row">
        <label>Object Scale</label>
        <input type="range" min={0.5} max={2} step={0.1} value={env.objectScale} disabled={exporting} onChange={(e) => setEnv({ objectScale: +e.target.value })} />
      </div>

      <div className="section-title">Visualization</div>
      <label>Quality</label>
      <select value={env.vizQuality} disabled={exporting} onChange={(e) => setEnv({ vizQuality: e.target.value as typeof env.vizQuality })}>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="ultra">Ultra</option>
      </select>
      <div className="slider-row">
        <label>Particle Density</label>
        <input type="range" min={0.1} max={1} step={0.05} value={env.particleDensity} disabled={exporting} onChange={(e) => setEnv({ particleDensity: +e.target.value })} />
      </div>
      <div className="slider-row">
        <label>Turbulence</label>
        <input type="range" min={0} max={1} step={0.05} value={env.turbulenceAmount} disabled={exporting} onChange={(e) => setEnv({ turbulenceAmount: +e.target.value })} />
      </div>
      <div className="slider-row">
        <label>Wake Persistence</label>
        <input type="range" min={0.1} max={1} step={0.05} value={env.wakePersistence} disabled={exporting} onChange={(e) => setEnv({ wakePersistence: +e.target.value })} />
      </div>

      <div className="section-title">Toggles</div>
      {(
        [
          ['particles', 'Particles'],
          ['streamlines', 'Streamlines'],
          ['pressureShell', 'Pressure Proxy'],
          ['velocityColorMode', 'Velocity Colors'],
          ['gridFloor', 'Grid Floor'],
          ['windTunnelWalls', 'Tunnel Walls'],
          ['wireframe', 'Wireframe'],
          ['windArrow', 'Wind Arrow'],
          ['showBoundingBox', 'Bounding Box']
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="toggle-row">
          <input
            type="checkbox"
            checked={toggles[key]}
            disabled={exporting}
            onChange={(e) => setToggles({ [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
    </aside>
  )
}
