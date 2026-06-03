import { useMemo, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useSimulationStore } from '../store/simulationStore'
import {
  sweepDragVsSpeed,
  sweepReVsSpeed,
  sweepPressureVsSpeed,
  sweepWakeVsYaw,
  sweepAreaVsYaw
} from '../simulation/sweeps'
import { frontalAreaProxy, windFromYawPitch } from '../utils/geometry'
import * as THREE from 'three'

const LIVE_CHARTS = [
  { key: 'airSpeed', title: 'Air Speed (m/s)', color: '#58a6ff', series: 'airSpeed' },
  { key: 'drag', title: 'Drag Force (N)', color: '#f85149', series: 'drag' },
  { key: 'reynolds', title: 'Reynolds Number', color: '#a371f7', series: 'reynolds' },
  { key: 'pressure', title: 'Dynamic Pressure (Pa)', color: '#d29922', series: 'pressure' },
  { key: 'wake', title: 'Wake Intensity', color: '#ff7b72', series: 'wake' },
  { key: 'meanVel', title: 'Mean Particle Vel.', color: '#3fb950', series: 'meanVel' },
  { key: 'turbulence', title: 'Turbulence Proxy', color: '#79c0ff', series: 'turbulence' },
  { key: 'fps', title: 'FPS', color: '#8b949e', series: 'fps' }
] as const

function LiveChart({
  title,
  color,
  data
}: {
  title: string
  color: string
  data: { t: number; value: number }[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chartData = data.map((d) => ({ t: d.t.toFixed(1), value: d.value }))

  const exportPng = () => {
    const svg = ref.current?.querySelector('svg')
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    const rect = ref.current!.getBoundingClientRect()
    canvas.width = rect.width * 2
    canvas.height = rect.height * 2
    const ctx = canvas.getContext('2d')!
    const img = new Image()
    img.onload = () => {
      ctx.fillStyle = '#1c2128'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `${title.replace(/\s/g, '_')}.png`
      a.click()
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
  }

  return (
    <div className="chart-box" ref={ref}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4>{title}</h4>
        <button type="button" className="btn" style={{ padding: '2px 6px', fontSize: 10 }} onClick={exportPng}>
          PNG
        </button>
      </div>
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
          <XAxis dataKey="t" stroke="#8b949e" tick={{ fontSize: 9 }} />
          <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} width={40} />
          <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 11 }} />
          <Line type="monotone" dataKey="value" stroke={color} dot={false} strokeWidth={1.5} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function SweepChart({ title, data, color }: { title: string; data: { x: number; y: number }[]; color: string }) {
  return (
    <div className="chart-box">
      <h4>{title}</h4>
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
          <XAxis dataKey="x" stroke="#8b949e" tick={{ fontSize: 9 }} />
          <YAxis stroke="#8b949e" tick={{ fontSize: 9 }} width={40} />
          <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 11 }} />
          <Line type="monotone" dataKey="y" stroke={color} dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function GraphDashboard() {
  const [tab, setTab] = useState<'live' | 'sweep'>('live')
  const history = useSimulationStore((s) => s.history)
  const env = useSimulationStore((s) => s.env)
  const model = useSimulationStore((s) => s.model)
  const stats = useSimulationStore((s) => s.stats)

  const sweepData = useMemo(() => {
    const L = model?.characteristicLength ?? 1
    const A = model?.frontalAreaProxy ?? 1
    const speeds = Array.from({ length: 21 }, (_, i) => 5 + i * 5)
    const yaws = Array.from({ length: 19 }, (_, i) => -90 + i * 10)
    const box = model?.boundingBox ?? new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1))
    const areaAtYaw = (yaw: number) => frontalAreaProxy(box, windFromYawPitch(yaw, 0))

    return {
      drag: sweepDragVsSpeed(speeds, env.airDensity, env.dynamicViscosity, L, A, env.cdOverride),
      re: sweepReVsSpeed(speeds, env.airDensity, env.dynamicViscosity, L),
      pressure: sweepPressureVsSpeed(speeds, env.airDensity),
      wake: sweepWakeVsYaw(yaws, stats.wakeIntensity, areaAtYaw),
      area: sweepAreaVsYaw(yaws, areaAtYaw)
    }
  }, [env, model, stats.wakeIntensity])

  return (
    <section className="graph-dashboard">
      <div className="graph-tabs">
        <button type="button" className="btn" onClick={() => setTab('live')}>
          Live Graphs
        </button>
        <button type="button" className="btn" onClick={() => setTab('sweep')}>
          Parameter Sweeps
        </button>
      </div>
      <div className="graph-grid">
        {tab === 'live'
          ? LIVE_CHARTS.map((c) => (
              <LiveChart key={c.key} title={c.title} color={c.color} data={history[c.series]} />
            ))
          : (
            <>
              <SweepChart title="Drag vs Air Speed (mph)" data={sweepData.drag} color="#f85149" />
              <SweepChart title="Re vs Air Speed (mph)" data={sweepData.re} color="#a371f7" />
              <SweepChart title="Dynamic Pressure vs Speed" data={sweepData.pressure} color="#d29922" />
              <SweepChart title="Wake vs Yaw (°)" data={sweepData.wake} color="#ff7b72" />
              <SweepChart title="Frontal Area Proxy vs Yaw" data={sweepData.area} color="#58a6ff" />
            </>
          )}
      </div>
    </section>
  )
}
