import { useState } from 'react'
import { useSimulationStore } from '../store/simulationStore'
import { serializeProject, parseProject } from '../utils/projectIO'
import { captureCanvasPng, recordCanvasWebM, downloadDataUrl, downloadBlob } from '../utils/exportVideo'
import type { ExportOptions } from '../types/simulationTypes'
import { toUint8Array } from '../utils/binary'

interface TopBarProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  resetViewRef: React.MutableRefObject<(() => void) | null>
  normalizeRef: React.MutableRefObject<(() => void) | null>
  rotateRef: React.MutableRefObject<((axis: 'x' | 'y' | 'z', deg: number) => void) | null>
}

const RESOLUTIONS: Record<string, { w: number; h: number }> = {
  '720p': { w: 1280, h: 720 },
  '1080p': { w: 1920, h: 1080 },
  '1440p': { w: 2560, h: 1440 },
  '4k': { w: 3840, h: 2160 }
}

export function TopBar({ canvasRef }: TopBarProps) {
  const [duration, setDuration] = useState(10)
  const [quality, setQuality] = useState('1080p')
  const [fps, setFps] = useState<30 | 60>(30)
  const exporting = useSimulationStore((s) => s.exporting)
  const importError = useSimulationStore((s) => s.importError)
  const setImportError = useSimulationStore((s) => s.setImportError)
  const paused = useSimulationStore((s) => s.paused)
  const togglePaused = useSimulationStore((s) => s.togglePaused)
  const setExporting = useSimulationStore((s) => s.setExporting)
  const setImport = useSimulationStore((s) => s.setImport)
  const loadProject = useSimulationStore((s) => s.loadProject)
  const getProject = useSimulationStore((s) => s.getProject)

  const handleImport = async () => {
    setImportError(null)
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.openModel()
        if (!result) return
        const name = result.name ?? result.filePath.split(/[/\\]/).pop() ?? 'model'
        const ext = name.split('.').pop()?.toLowerCase() ?? ''
        if (!['stl', 'obj', 'gltf', 'glb'].includes(ext)) {
          setImportError('Unsupported format. Use STL, OBJ, or GLTF/GLB.')
          return
        }
        const bytes = toUint8Array(result.data)
        if (bytes.byteLength === 0) {
          setImportError('Selected file is empty.')
          return
        }
        setImport({ name, ext, bytes })
        return
      }
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.stl,.obj,.gltf,.glb'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return
        const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
        if (!['stl', 'obj', 'gltf', 'glb'].includes(ext)) {
          setImportError('Unsupported format.')
          return
        }
        const buffer = await file.arrayBuffer()
        setImport({ name: file.name, ext, bytes: new Uint8Array(buffer) })
      }
      input.click()
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed')
    }
  }

  const handleSaveProject = async () => {
    const project = getProject({ position: [4, 3, 5], target: [0, 0, 0] })
    const json = serializeProject(project)
    if (window.electronAPI) {
      await window.electronAPI.saveProject(json)
    } else {
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      downloadDataUrl(url, 'project.wtproj')
      URL.revokeObjectURL(url)
    }
  }

  const handleLoadProject = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.openProject()
      if (!result) return
      const project = parseProject(result.data)
      if (project) loadProject(project)
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.wtproj,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const project = parseProject(JSON.parse(await file.text()))
      if (project) loadProject(project)
    }
    input.click()
  }

  const handleSnapshot = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = await captureCanvasPng(canvas)
    if (window.electronAPI) {
      const base64 = dataUrl.split(',')[1]
      await window.electronAPI.saveFile(`windtunnel-snapshot-${Date.now()}.png`, base64, 'base64')
    } else {
      downloadDataUrl(dataUrl, 'windtunnel-snapshot.png')
    }
  }

  const handleExportVideo = async () => {
    const canvas = canvasRef.current
    if (!canvas || exporting) return
    setExporting(true, 'Starting export…')
    try {
      const opts: ExportOptions = {
        durationSec: duration,
        fps,
        width: RESOLUTIONS[quality]?.w ?? 1920,
        height: RESOLUTIONS[quality]?.h ?? 1080,
        mode: 'viewport'
      }
      const blob = await recordCanvasWebM(canvas, { durationSec: opts.durationSec, fps: opts.fps }, (p) =>
        setExporting(true, p.message)
      )
      if (window.electronAPI) {
        const reader = new FileReader()
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1]
          await window.electronAPI!.saveFile(`windtunnel-${duration}s.webm`, base64, 'base64')
        }
        reader.readAsDataURL(blob)
      } else {
        downloadBlob(blob, `windtunnel-${duration}s.webm`)
      }
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <header className="top-bar">
      <h1>WindTunnel Studio</h1>
      <button type="button" className="btn" disabled={exporting} onClick={handleImport}>
        Import Model
      </button>
      <button type="button" className="btn" disabled={exporting} onClick={handleSaveProject}>
        Save Project
      </button>
      <button type="button" className="btn" disabled={exporting} onClick={handleLoadProject}>
        Load Project
      </button>
      <button
        type="button"
        className={paused ? 'btn btn-primary' : 'btn'}
        disabled={exporting}
        onClick={togglePaused}
        title={paused ? 'Resume particle flow and statistics' : 'Pause particle flow and statistics'}
      >
        {paused ? 'Resume' : 'Pause'}
      </button>
      <div className="spacer" />
      <select value={duration} disabled={exporting} onChange={(e) => setDuration(+e.target.value)}>
        <option value={5}>5 sec</option>
        <option value={10}>10 sec</option>
        <option value={20}>20 sec</option>
        <option value={30}>30 sec</option>
        <option value={60}>60 sec</option>
      </select>
      <select value={quality} disabled={exporting} onChange={(e) => setQuality(e.target.value)}>
        <option value="720p">720p</option>
        <option value="1080p">1080p</option>
        <option value="1440p">1440p</option>
        <option value="4k">4K</option>
      </select>
      <select value={fps} disabled={exporting} onChange={(e) => setFps(+e.target.value as 30 | 60)}>
        <option value={30}>30 FPS</option>
        <option value={60}>60 FPS</option>
      </select>
      <button type="button" className="btn" disabled={exporting || !canvasRef.current} onClick={handleSnapshot}>
        Snapshot PNG
      </button>
      <button type="button" className="btn btn-primary" disabled={exporting || !canvasRef.current} onClick={handleExportVideo}>
        Export Video
      </button>
      <button
        type="button"
        className="btn"
        disabled={exporting}
        onClick={() => alert('Visual / educational model. Results are approximate and not validated CFD.\n\nFuture versions may connect to OpenFOAM or SU2.')}
      >
        About
      </button>
      {importError && (
        <div className="error-banner" style={{ position: 'absolute', top: 52, left: 12, right: 12 }}>
          {importError}
        </div>
      )}
    </header>
  )
}
