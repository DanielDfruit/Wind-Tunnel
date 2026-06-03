import { create } from 'zustand';
import type {
  DemoObjectId,
  EnvironmentSettings,
  GraphPoint,
  ImportPayload,
  ImportPayloadInput,
  LiveStats,
  ModelInfo,
  ProjectFile,
  SolverMode,
  VisualizationToggles,
  WindSettings,
} from '../types/simulationTypes';
import { DEFAULT_ENV, DEFAULT_TOGGLES, DEFAULT_WIND } from '../types/simulationTypes';
import { computeStatistics } from '../simulation/statistics';
import { getSolverDragEstimate, getSolverInfo, setSolverMode as applySolverMode } from '../simulation/solverBackends';
import type { SolverInfo } from '../simulation/solverBackends/types';

const HISTORY_LEN = 120;
let lastGraphHistoryMs = 0;
let nextImportLoadId = 0;

function emptyHistory(): Record<string, GraphPoint[]> {
  return {
    airSpeed: [],
    drag: [],
    reynolds: [],
    pressure: [],
    wake: [],
    meanVel: [],
    turbulence: [],
    fps: [],
  };
}

function pushHistory(series: GraphPoint[], value: number, t: number): GraphPoint[] {
  const next = [...series, { t, value }];
  return next.length > HISTORY_LEN ? next.slice(-HISTORY_LEN) : next;
}

const defaultStats: LiveStats = {
  airSpeedMs: 0,
  reynolds: 0,
  dynamicPressure: 0,
  dragForce: 0,
  cd: 1,
  wakeIntensity: 0,
  turbulenceProxy: 0,
  meanParticleVelocity: 0,
  maxVelocityProxy: 0,
  minVelocityProxy: 0,
  activeParticles: 0,
  fps: 60,
};

interface SimulationStore {
  env: EnvironmentSettings;
  wind: WindSettings;
  toggles: VisualizationToggles;
  solverMode: SolverMode;
  solverInfo: SolverInfo;
  model: ModelInfo | null;
  demoId: DemoObjectId;
  importPayload: ImportPayload | null;
  importLoading: boolean;
  importError: string | null;
  stats: LiveStats;
  history: Record<string, GraphPoint[]>;
  notes: string;
  exporting: boolean;
  exportMessage: string;
  paused: boolean;
  time: number;
  setEnv: (partial: Partial<EnvironmentSettings>) => void;
  setWind: (partial: Partial<WindSettings>) => void;
  setToggles: (partial: Partial<VisualizationToggles>) => void;
  setSolverMode: (mode: SolverMode) => void;
  refreshSolverInfo: () => void;
  setDemo: (id: DemoObjectId) => void;
  setImport: (payload: ImportPayloadInput | null) => void;
  setImportLoading: (loading: boolean) => void;
  setImportError: (message: string | null) => void;
  setModelInfo: (info: ModelInfo | null) => void;
  setNotes: (n: string) => void;
  setExporting: (v: boolean, msg?: string) => void;
  setPaused: (paused: boolean) => void;
  togglePaused: () => void;
  tickSimulation: (inputs: {
    wakeIntensity: number;
    turbulenceProxy: number;
    meanParticleVelocity: number;
    maxVelocityProxy: number;
    minVelocityProxy: number;
    activeParticles: number;
    fps: number;
  }) => void;
  loadProject: (p: ProjectFile) => void;
  getProject: (camera: ProjectFile['camera']) => ProjectFile;
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  env: { ...DEFAULT_ENV },
  wind: { ...DEFAULT_WIND },
  toggles: { ...DEFAULT_TOGGLES },
  solverMode: 'lbm',
  solverInfo: getSolverInfo(),
  model: null,
  demoId: 'sphere',
  importPayload: null,
  importLoading: false,
  importError: null,
  stats: defaultStats,
  history: emptyHistory(),
  notes: '',
  exporting: false,
  exportMessage: '',
  paused: false,
  time: 0,
  setEnv: (partial) => set((s) => ({ env: { ...s.env, ...partial } })),
  setWind: (partial) => set((s) => ({ wind: { ...s.wind, ...partial } })),
  setToggles: (partial) => set((s) => ({ toggles: { ...s.toggles, ...partial } })),
  setSolverMode: (mode) => {
    applySolverMode(mode);
    set({ solverMode: mode, solverInfo: getSolverInfo() });
  },
  refreshSolverInfo: () => set({ solverInfo: getSolverInfo() }),
  setDemo: (id) =>
    set({ demoId: id, importPayload: null, importLoading: false, importError: null }),
  setImport: (payload) => {
    if (!payload) {
      set({ importPayload: null, importLoading: false, importError: null });
      return;
    }
    nextImportLoadId += 1;
    set({
      importPayload: {
        name: payload.name,
        ext: payload.ext,
        bytes: new Uint8Array(payload.bytes),
        loadId: nextImportLoadId,
      },
      importLoading: true,
      importError: null,
    });
  },
  setImportLoading: (loading) => set({ importLoading: loading }),
  setImportError: (message) => set({ importError: message }),
  setModelInfo: (info) => set({ model: info }),
  setNotes: (n) => set({ notes: n }),
  setExporting: (v, msg = '') => set({ exporting: v, exportMessage: msg }),
  setPaused: (paused) => set({ paused }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  tickSimulation: (inputs) => {
    if (get().paused) return;
    const state = get();
    const model = state.model;
    const dragEst = getSolverDragEstimate()
    const stats = computeStatistics({
      env: state.env,
      characteristicLength: model?.characteristicLength ?? 1,
      frontalArea: model?.frontalAreaProxy ?? 1,
      solverCd: dragEst?.cd,
      solverDrag: dragEst?.dragForce,
      ...inputs,
    });
    const t = state.time + 1 / 60;
    const now = performance.now();
    const recordHistory = now - lastGraphHistoryMs >= 500;
    if (recordHistory) lastGraphHistoryMs = now;

    const h = state.history;
    set({
      stats,
      time: t,
      history: recordHistory
        ? {
            airSpeed: pushHistory(h.airSpeed, stats.airSpeedMs, t),
            drag: pushHistory(h.drag, stats.dragForce, t),
            reynolds: pushHistory(h.reynolds, stats.reynolds, t),
            pressure: pushHistory(h.pressure, stats.dynamicPressure, t),
            wake: pushHistory(h.wake, stats.wakeIntensity, t),
            meanVel: pushHistory(h.meanVel, stats.meanParticleVelocity, t),
            turbulence: pushHistory(h.turbulence, stats.turbulenceProxy, t),
            fps: pushHistory(h.fps, stats.fps, t),
          }
        : h,
    });
  },
  loadProject: (p) => {
    const mode = p.solverMode ?? 'lbm';
    applySolverMode(mode);
    set({
      wind: p.wind,
      env: p.environment,
      toggles: p.visualization,
      solverMode: mode,
      solverInfo: getSolverInfo(),
      notes: p.notes,
      demoId: (p.modelMeta.demoId as DemoObjectId) ?? 'sphere',
      importPayload: null,
    });
  },
  getProject: (camera) => {
    const s = get();
    return {
      version: 1,
      solverMode: s.solverMode,
      wind: s.wind,
      environment: s.env,
      visualization: s.toggles,
      camera,
      notes: s.notes,
      modelMeta: {
        source: s.importPayload ? 'import' : 'demo',
        demoId: s.demoId,
        fileName: s.importPayload?.name,
      },
      graphHistoryLength: HISTORY_LEN,
    };
  },
}));
