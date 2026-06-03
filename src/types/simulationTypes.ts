import type * as THREE from 'three';

export type SpeedUnit = 'mph' | 'ms';
export type VizQuality = 'low' | 'medium' | 'high' | 'ultra';
export type DemoObjectId = 'sphere' | 'cube' | 'cylinder' | 'airfoil' | 'vehicle' | 'plane';
export type SolverMode = 'visual' | 'potential' | 'lbm' | 'openfoam';

export interface WindVector {
  x: number;
  y: number;
  z: number;
}

export interface WindSettings {
  vector: WindVector;
  yaw: number;
  pitch: number;
}

export interface EnvironmentSettings {
  airSpeed: number;
  speedUnit: SpeedUnit;
  airDensity: number;
  dynamicViscosity: number;
  cdOverride: number;
  particleDensity: number;
  streamlineLength: number;
  turbulenceAmount: number;
  wakePersistence: number;
  particleSpeedMultiplier: number;
  objectScale: number;
  vizQuality: VizQuality;
}

export interface VisualizationToggles {
  particles: boolean;
  streamlines: boolean;
  pressureShell: boolean;
  velocityColorMode: boolean;
  gridFloor: boolean;
  windTunnelWalls: boolean;
  wireframe: boolean;
  windArrow: boolean;
  showBoundingBox: boolean;
}

export interface ImportPayloadInput {
  name: string;
  ext: string;
  bytes: Uint8Array;
}

export interface ImportPayload extends ImportPayloadInput {
  /** Bumped on each import so loaders do not cancel each other. */
  loadId: number;
}

export type MeshImportTier = 'normal' | 'heavy' | 'massive';

export interface LoadedModel {
  object: THREE.Object3D;
  bounds: THREE.Box3;
  dimensions: [number, number, number];
  characteristicLength: number;
  frontalAreaProxy: number;
  vertexCount: number;
  initialVertexCount: number;
  meshSimplified: boolean;
  heavyMesh: boolean;
  massiveMesh: boolean;
  importTier: MeshImportTier;
}

export interface ModelInfo {
  source: 'demo' | 'import';
  demoId?: DemoObjectId;
  fileName?: string;
  dimensions: { x: number; y: number; z: number };
  frontalAreaProxy: number;
  characteristicLength: number;
  boundingBox: THREE.Box3 | null;
  vertexCount?: number;
  initialVertexCount?: number;
  heavyMesh?: boolean;
  massiveMesh?: boolean;
  importTier?: MeshImportTier;
  meshSimplified?: boolean;
}

export interface LiveStats {
  airSpeedMs: number;
  reynolds: number;
  dynamicPressure: number;
  dragForce: number;
  cd: number;
  wakeIntensity: number;
  turbulenceProxy: number;
  meanParticleVelocity: number;
  maxVelocityProxy: number;
  minVelocityProxy: number;
  activeParticles: number;
  fps: number;
}

export interface GraphPoint {
  t: number;
  value: number;
}

export interface ProjectFile {
  version: 1;
  solverMode?: SolverMode;
  wind: WindSettings;
  environment: EnvironmentSettings;
  visualization: VisualizationToggles;
  camera: { position: [number, number, number]; target: [number, number, number] };
  notes: string;
  modelMeta: { source: string; demoId?: string; fileName?: string };
  graphHistoryLength: number;
}

export interface ExportOptions {
  durationSec: number;
  fps: 30 | 60;
  width: number;
  height: number;
  mode: 'viewport' | 'viewport-stats' | 'viewport-graphs';
}

export const DEFAULT_ENV: EnvironmentSettings = {
  airSpeed: 30,
  speedUnit: 'mph',
  airDensity: 1.225,
  dynamicViscosity: 1.81e-5,
  cdOverride: 1.0,
  particleDensity: 0.6,
  streamlineLength: 1.2,
  turbulenceAmount: 0.35,
  wakePersistence: 0.5,
  particleSpeedMultiplier: 1.0,
  objectScale: 1.0,
  vizQuality: 'medium',
};

export const DEFAULT_WIND: WindSettings = {
  vector: { x: 1, y: 0, z: 0 },
  yaw: 0,
  pitch: 0,
};

export const DEFAULT_TOGGLES: VisualizationToggles = {
  particles: true,
  streamlines: true,
  pressureShell: false,
  velocityColorMode: true,
  gridFloor: true,
  windTunnelWalls: true,
  wireframe: false,
  windArrow: true,
  showBoundingBox: true,
};
