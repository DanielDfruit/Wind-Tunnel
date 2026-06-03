import { useRef } from 'react';
import { TopBar } from './components/TopBar';
import { ControlPanel } from './components/ControlPanel';
import { Viewport3D } from './components/Viewport3D';
import type { CameraViewPreset } from './utils/camera';
import { StatsPanel } from './components/StatsPanel';
import { GraphDashboard } from './components/GraphDashboard';
import { useSimulationStore } from './store/simulationStore';
import './styles/global.css';
import './styles/app.css';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const frameViewRef = useRef<(() => void) | null>(null);
  const cameraViewRef = useRef<((preset: CameraViewPreset) => void) | null>(null);
  const normalizeRef = useRef<(() => void) | null>(null);
  const orientUprightRef = useRef<(() => void) | null>(null);
  const rotateRef = useRef<((axis: 'x' | 'y' | 'z', deg: number) => void) | null>(null);
  const exporting = useSimulationStore((s) => s.exporting);
  const exportMessage = useSimulationStore((s) => s.exportMessage);
  const importLoading = useSimulationStore((s) => s.importLoading);
  const setNotes = useSimulationStore((s) => s.setNotes);
  const notesVal = useSimulationStore((s) => s.notes);

  return (
    <div className={`app-root ${exporting ? 'exporting' : ''}`}>
      <TopBar canvasRef={canvasRef} resetViewRef={resetViewRef} normalizeRef={normalizeRef} rotateRef={rotateRef} />
      <div className="app-body">
        <ControlPanel
          resetViewRef={resetViewRef}
          frameViewRef={frameViewRef}
          cameraViewRef={cameraViewRef}
          normalizeRef={normalizeRef}
          orientUprightRef={orientUprightRef}
          rotateRef={rotateRef}
        />
        <main className="app-main">
          <Viewport3D
            canvasRef={canvasRef}
            resetViewRef={resetViewRef}
            frameViewRef={frameViewRef}
            cameraViewRef={cameraViewRef}
            normalizeRef={normalizeRef}
            orientUprightRef={orientUprightRef}
            rotateRef={rotateRef}
          />
        </main>
        <StatsPanel />
      </div>
      <GraphDashboard />
      <div className="notes-bar">
        <label>Project notes</label>
        <textarea value={notesVal} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes for this project…" />
      </div>
      {importLoading && (
        <div className="export-overlay">
          <p>Loading model and building flow field…</p>
        </div>
      )}
      {exporting && (
        <div className="export-overlay">
          <p>{exportMessage || 'Exporting…'}</p>
        </div>
      )}
    </div>
  );
}
