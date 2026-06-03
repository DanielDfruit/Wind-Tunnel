import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useSimulationStore } from '../store/simulationStore';
import {
  applyModelRotation,
  centerObject,
  characteristicLength,
  boxToEdgePositions,
  paddedBox,
  collectVisibleMeshes,
  computeWorldBounds,
  frontalAreaProxy,
  getDimensions,
  normalizeObject,
  windFromYawPitch,
} from '../utils/geometry';
import { airSpeedToMs, particleCountForQuality } from '../utils/units';
import { createParticles, stepParticles, type Particle } from '../simulation/particleSystem';
import {
  ensureWebGpuDevice,
  scheduleFlowSolverRebuild,
  refineFlowSolverLive,
} from '../simulation/solverBackends';
import { toArrayBuffer } from '../utils/binary';
import { detectFormat, loadModelFromBuffer } from '../utils/modelLoader';
import { fitCameraToObject, setCameraViewPreset, type CameraViewPreset } from '../utils/camera';
import {
  autoOrientModelUpright,
  resetModelOrientation,
} from '../utils/geometry';
import type { DemoObjectId } from '../types/simulationTypes';

const TUNNEL_HALF = 3;

const DEMO_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#6e7681',
  metalness: 0.35,
  roughness: 0.45,
});

function demoMaterial(): THREE.MeshStandardMaterial {
  return DEMO_MATERIAL.clone();
}

/** Simple aircraft aligned with wind along +X (nose at +X). */
function buildPlaneModel(): THREE.Group {
  const group = new THREE.Group();

  const fuselage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.2, 1.6, 16),
    demoMaterial()
  );
  fuselage.rotation.z = Math.PI / 2;
  group.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.35, 16), demoMaterial());
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 0.95;
  group.add(nose);

  // Span along Z, chord along X, thin in Y — main wings clearly visible from side view
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 2.4), demoMaterial());
  wing.position.set(0.05, 0, 0);
  group.add(wing);

  const tailPlane = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.85), demoMaterial());
  tailPlane.position.set(-0.78, 0.06, 0);
  group.add(tailPlane);

  const verticalStab = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 0.05), demoMaterial());
  verticalStab.position.set(-0.82, 0.22, 0);
  group.add(verticalStab);

  return group;
}

function DemoMesh({ id }: { id: DemoObjectId }) {
  const content = useMemo(() => {
    if (id === 'plane') {
      return { kind: 'group' as const, object: buildPlaneModel() };
    }
    let geom: THREE.BufferGeometry;
    switch (id) {
      case 'sphere':
        geom = new THREE.SphereGeometry(0.8, 32, 32);
        break;
      case 'cube':
        geom = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        break;
      case 'cylinder':
        geom = new THREE.CylinderGeometry(0.5, 0.5, 1.6, 32);
        break;
      case 'airfoil': {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(0.5, 0.15, 1.2, 0);
        shape.quadraticCurveTo(0.5, -0.08, 0, 0);
        geom = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
        break;
      }
      case 'vehicle':
        geom = new THREE.BoxGeometry(2, 0.6, 0.9);
        break;
      default:
        geom = new THREE.SphereGeometry(0.8, 24, 24);
    }
    geom.computeBoundingBox();
    return { kind: 'mesh' as const, geometry: geom };
  }, [id]);

  useEffect(() => {
    if (content.kind === 'group') {
      content.object.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry?.computeBoundingBox();
      });
    }
  }, [content]);

  if (content.kind === 'group') {
    return <primitive object={content.object} castShadow receiveShadow />;
  }
  return (
    <mesh geometry={content.geometry} castShadow receiveShadow material={DEMO_MATERIAL} />
  );
}

export interface ImportReadyMeta {
  vertexCount: number;
  heavyMesh: boolean;
  meshSimplified: boolean;
}

function ImportedModel({
  bytes,
  ext,
  loadId,
  onReady,
  onError,
}: {
  bytes: Uint8Array;
  ext: string;
  loadId: number;
  onReady: (meta: ImportReadyMeta) => void;
  onError: (message: string) => void;
}) {
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const bytesRef = useRef(bytes);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;
  bytesRef.current = bytes;

  useEffect(() => {
    let cancelled = false;
    setObject(null);

    const format = detectFormat(`model.${ext}`);
    if (!format) {
      onErrorRef.current(`Unsupported file type: .${ext}`);
      return;
    }

    const fileBytes = bytesRef.current;
    if (!fileBytes?.byteLength) {
      onErrorRef.current('Model file is empty');
      return;
    }

    const buffer = toArrayBuffer(fileBytes);

    void (async () => {
      try {
        const loaded = await loadModelFromBuffer(buffer, format, `import.${ext}`);
        if (cancelled) return;
        setObject(loaded.object);
        // Wait for R3F to attach the primitive before fitting camera / marking ready.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (cancelled) return;
            onReadyRef.current({
              vertexCount: loaded.vertexCount,
              heavyMesh: loaded.heavyMesh,
              meshSimplified: loaded.meshSimplified,
            });
          });
        });
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to parse model file';
          console.error('[ImportedModel]', err);
          onErrorRef.current(msg);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadId, ext]);

  if (!object) return null;
  return <primitive object={object} />;
}

const TUNNEL_PADDING = 1.04;
const BOUNDS_PADDING = 1.01;
const MAX_BOUNDS_MESHES = 48;
const VERTS_PER_BOX = 24;

/** One tight box per mesh part (fuselage, each wing, tail, etc.) — not one giant rectangle. */
function CompoundBoundsEdgeLines({
  targetRef,
  revision,
  color,
  padding,
  opacity = 1,
  throttleFrames = 1,
}: {
  targetRef: React.RefObject<THREE.Group>;
  revision: string;
  color: string;
  padding: number;
  opacity?: number;
  throttleFrames?: number;
}) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const partBox = useMemo(() => new THREE.Box3(), []);
  const frameRef = useRef(0);

  useEffect(() => {
    const target = targetRef.current;
    meshesRef.current = target ? collectVisibleMeshes(target) : [];
  }, [revision, targetRef]);

  useFrame(() => {
    frameRef.current++;
    if (throttleFrames > 1 && frameRef.current % throttleFrames !== 0) return;

    const target = targetRef.current;
    const line = lineRef.current;
    if (!line) return;
    if (target && frameRef.current % (throttleFrames * 4) === 0) {
      meshesRef.current = collectVisibleMeshes(target);
    }
    const meshes = meshesRef.current;
    if (meshes.length === 0) return;

    const vertCount = Math.min(meshes.length, MAX_BOUNDS_MESHES) * VERTS_PER_BOX;
    const attr = line.geometry.attributes.position as THREE.BufferAttribute;
    let positions = attr.array as Float32Array;

    if (positions.length < vertCount * 3) {
      positions = new Float32Array(MAX_BOUNDS_MESHES * VERTS_PER_BOX * 3);
      line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    }

    let written = 0;
    for (let m = 0; m < meshes.length && m < MAX_BOUNDS_MESHES; m++) {
      partBox.makeEmpty();
      partBox.setFromObject(meshes[m], true);
      if (partBox.isEmpty()) continue;
      boxToEdgePositions(paddedBox(partBox, padding), positions, written * VERTS_PER_BOX * 3);
      written++;
    }

    line.geometry.setDrawRange(0, written * VERTS_PER_BOX);
    attr.needsUpdate = true;
  });

  return (
    <lineSegments ref={lineRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={MAX_BOUNDS_MESHES * VERTS_PER_BOX}
          array={new Float32Array(MAX_BOUNDS_MESHES * VERTS_PER_BOX * 3)}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={false} />
    </lineSegments>
  );
}

const MAX_STREAMLINES = 28;
const STREAMLINE_STRIDE = 14;
const MAX_TRAIL_SEGS = 18;

function StreamlineLines({ particlesRef }: { particlesRef: React.RefObject<Particle[]> }) {
  const ref = useRef<THREE.LineSegments>(null);
  const positions = useMemo(() => new Float32Array(MAX_STREAMLINES * MAX_TRAIL_SEGS * 6), []);

  useFrame(() => {
    const line = ref.current;
    const particles = particlesRef.current;
    if (!line || !particles || !particles.length) return;

    let ptr = 0;
    let drawn = 0;
    for (let i = 0; i < particles.length && drawn < MAX_STREAMLINES; i += STREAMLINE_STRIDE) {
      const trail = particles[i].trail;
      if (trail.length < 2) continue;
      const start = Math.max(0, trail.length - MAX_TRAIL_SEGS - 1);
      for (let t = start; t < trail.length - 1; t++) {
        if (ptr + 6 > positions.length) break;
        const a = trail[t];
        const b = trail[t + 1];
        positions[ptr++] = a.x;
        positions[ptr++] = a.y;
        positions[ptr++] = a.z;
        positions[ptr++] = b.x;
        positions[ptr++] = b.y;
        positions[ptr++] = b.z;
      }
      drawn++;
    }

    const attr = line.geometry.attributes.position as THREE.BufferAttribute;
    attr.needsUpdate = true;
    line.geometry.setDrawRange(0, ptr / 3);
  });

  return (
    <lineSegments ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#79c0ff" transparent opacity={0.35} />
    </lineSegments>
  );
}

function WindArrow({ dir }: { dir: THREE.Vector3 }) {
  const arrow = useMemo(() => {
    const d = dir.clone().normalize();
    return new THREE.ArrowHelper(d, d.clone().multiplyScalar(-2.2), 1.6, 0x58a6ff, 0.22, 0.1);
  }, [dir.x, dir.y, dir.z]);
  return <primitive object={arrow} />;
}

function SceneInner({
  modelRef,
  resetViewRef,
  frameViewRef,
  cameraViewRef,
  normalizeRef,
  orientUprightRef,
  rotateRef,
}: {
  modelRef: React.RefObject<THREE.Group>;
  resetViewRef: React.MutableRefObject<(() => void) | null>;
  frameViewRef: React.MutableRefObject<(() => void) | null>;
  cameraViewRef: React.MutableRefObject<((preset: CameraViewPreset) => void) | null>;
  normalizeRef: React.MutableRefObject<(() => void) | null>;
  orientUprightRef: React.MutableRefObject<(() => void) | null>;
  rotateRef: React.MutableRefObject<((axis: 'x' | 'y' | 'z', deg: number) => void) | null>;
}) {
  const env = useSimulationStore((s) => s.env);
  const wind = useSimulationStore((s) => s.wind);
  const toggles = useSimulationStore((s) => s.toggles);
  const demoId = useSimulationStore((s) => s.demoId);
  const importPayload = useSimulationStore((s) => s.importPayload);
  const setModelInfo = useSimulationStore((s) => s.setModelInfo);
  const tickSimulation = useSimulationStore((s) => s.tickSimulation);
  const solverMode = useSimulationStore((s) => s.solverMode);
  const paused = useSimulationStore((s) => s.paused);
  const refreshSolverInfo = useSimulationStore((s) => s.refreshSolverInfo);
  const setImportLoading = useSimulationStore((s) => s.setImportLoading);
  const setImport = useSimulationStore((s) => s.setImport);
  const setImportError = useSimulationStore((s) => s.setImportError);
  const setSolverMode = useSimulationStore((s) => s.setSolverMode);
  const setEnv = useSimulationStore((s) => s.setEnv);
  const setToggles = useSimulationStore((s) => s.setToggles);
  const { camera, controls } = useThree();
  const solverSigRef = useRef('');
  const modelReadyRef = useRef(true);
  const heavyModelRef = useRef(false);
  const [heavyModel, setHeavyModel] = useState(false);
  const boundsBoxRef = useRef(new THREE.Box3());
  const boundsDirtyRef = useRef(true);
  const controlsObj = controls as { target: THREE.Vector3; update?: () => void } | null;

  const frameCamera = useCallback(() => {
    if (!modelRef.current) return;
    fitCameraToObject(camera, controlsObj, modelRef.current);
  }, [camera, controlsObj, modelRef]);

  const handleImportError = useCallback(
    (message: string) => {
      modelReadyRef.current = true;
      setImportLoading(false);
      setImport(null);
      setImportError(message);
    },
    [setImportLoading, setImport, setImportError]
  );

  useEffect(() => {
    if (!importPayload) {
      modelReadyRef.current = true;
      setHeavyModel(false);
      heavyModelRef.current = false;
      return;
    }
    modelReadyRef.current = false;
    setHeavyModel(false);
    heavyModelRef.current = false;
  }, [importPayload?.loadId]);

  const windVec = useMemo(() => windFromYawPitch(wind.yaw, wind.pitch), [wind.yaw, wind.pitch]);

  useEffect(() => {
    void ensureWebGpuDevice().then((st) => {
      if (st === 'ready') {
        solverSigRef.current = '';
        refreshSolverInfo();
      }
    });
  }, [refreshSolverInfo]);

  const fluid = useMemo(
    () => ({ density: env.airDensity, dynamicViscosity: env.dynamicViscosity }),
    [env.airDensity, env.dynamicViscosity]
  );
  const particlesRef = useRef<Particle[]>([]);
  const pointsRef = useRef<THREE.Points>(null);
  const timeRef = useRef(0);
  const fpsRef = useRef({ frames: 0, last: performance.now(), fps: 60 });
  const count = particleCountForQuality(env.vizQuality, env.particleDensity);
  const positions = useMemo(() => new Float32Array(count * 3), [count]);
  const colors = useMemo(() => new Float32Array(count * 3), [count]);

  useEffect(() => {
    particlesRef.current = createParticles(count, windVec, TUNNEL_HALF);
  }, [count, windVec.x, windVec.y, windVec.z]);

  const updateMeta = useCallback(() => {
    if (!modelRef.current) return;
    const box = computeWorldBounds(modelRef.current);
    boundsBoxRef.current.copy(box);
    setModelInfo({
      source: importPayload ? 'import' : 'demo',
      demoId: importPayload ? undefined : demoId,
      fileName: importPayload?.name,
      dimensions: getDimensions(box),
      frontalAreaProxy: frontalAreaProxy(box, windVec),
      characteristicLength: characteristicLength(box),
      boundingBox: box.clone(),
      heavyMesh: heavyModelRef.current,
    });
  }, [modelRef, setModelInfo, importPayload, demoId, windVec]);

  const handleImportReady = useCallback(
    (meta: ImportReadyMeta) => {
      modelReadyRef.current = true;
      heavyModelRef.current = meta.heavyMesh;
      setHeavyModel(meta.heavyMesh);
      setImportLoading(false);
      solverSigRef.current = '';
      boundsDirtyRef.current = true;

      if (meta.heavyMesh) {
        setSolverMode('lbm');
        setEnv({ vizQuality: 'low', particleDensity: 0.35 });
        setToggles({ streamlines: false });
      }

      requestAnimationFrame(() => {
        frameCamera();
        if (modelRef.current) {
          const box = computeWorldBounds(modelRef.current);
          boundsBoxRef.current.copy(box);
          setModelInfo({
            source: 'import',
            fileName: importPayload?.name,
            dimensions: getDimensions(box),
            frontalAreaProxy: frontalAreaProxy(box, windVec),
            characteristicLength: characteristicLength(box),
            boundingBox: box.clone(),
            heavyMesh: meta.heavyMesh,
            vertexCount: meta.vertexCount,
            meshSimplified: meta.meshSimplified,
          });
        }
      });
    },
    [
      setImportLoading,
      setSolverMode,
      setEnv,
      setToggles,
      frameCamera,
      modelRef,
      setModelInfo,
      importPayload?.name,
      windVec,
    ]
  );

  useEffect(() => {
    const t = setTimeout(updateMeta, 80);
    return () => clearTimeout(t);
  }, [updateMeta, importPayload, demoId]);

  const markBoundsDirty = useCallback(() => {
    boundsDirtyRef.current = true;
    solverSigRef.current = '';
  }, []);

  resetViewRef.current = () => frameCamera();
  frameViewRef.current = () => frameCamera();
  cameraViewRef.current = (preset: CameraViewPreset) => {
    if (modelRef.current) setCameraViewPreset(preset, camera, controlsObj, modelRef.current);
  };
  normalizeRef.current = () => {
    if (modelRef.current) {
      normalizeObject(modelRef.current, 2);
      markBoundsDirty();
      frameCamera();
      updateMeta();
    }
  };
  orientUprightRef.current = () => {
    if (!modelRef.current) return;
    resetModelOrientation(modelRef.current);
    autoOrientModelUpright(modelRef.current);
    centerObject(modelRef.current);
    markBoundsDirty();
    frameCamera();
    updateMeta();
  };
  rotateRef.current = (axis, deg) => {
    if (modelRef.current) {
      applyModelRotation(modelRef.current, axis, deg);
      markBoundsDirty();
      updateMeta();
    }
  };

  const frameCounter = useRef(0);

  useFrame((_, delta) => {
    if (!modelRef.current) return;
    frameCounter.current++;
    const recomputeBounds =
      boundsDirtyRef.current ||
      frameCounter.current % (heavyModelRef.current ? 24 : 8) === 0;
    if (recomputeBounds) {
      boundsBoxRef.current.copy(computeWorldBounds(modelRef.current));
      boundsDirtyRef.current = false;
    }
    const box = boundsBoxRef.current;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.55;
    const tunnelHalf = Math.max(size.x, size.y, size.z) * 0.55 + 0.35;
    const baseSpeed = airSpeedToMs(env.airSpeed, env.speedUnit);

    if (paused) return;

    timeRef.current += delta;

    const sig = [
      solverMode,
      demoId,
      importPayload?.name ?? '',
      env.vizQuality,
      env.airDensity,
      env.dynamicViscosity,
      wind.yaw,
      wind.pitch,
      box.min.toArray().join(','),
      box.max.toArray().join(','),
    ].join('|');
    if (!modelReadyRef.current) return;

    if (sig !== solverSigRef.current) {
      scheduleFlowSolverRebuild(
        modelRef.current,
        box,
        windVec,
        baseSpeed,
        env.vizQuality,
        fluid,
        () => {
          solverSigRef.current = sig;
          refreshSolverInfo();
        }
      );
    } else if (solverMode === 'lbm' || solverMode === 'potential') {
      refineFlowSolverLive(solverMode === 'lbm' ? 4 : 1);
    }

    const metrics = stepParticles(particlesRef.current, windVec, center, radius, delta, {
      baseSpeed,
      multiplier: env.particleSpeedMultiplier,
      turbulence: env.turbulenceAmount,
      wakePersistence: env.wakePersistence,
      tunnelHalf,
      trailLen: Math.round(env.streamlineLength * 12),
      time: timeRef.current,
    });

    if (toggles.particles && pointsRef.current) {
      const colorTmp = new THREE.Color();
      particlesRef.current.forEach((p, i) => {
        positions[i * 3] = p.position.x;
        positions[i * 3 + 1] = p.position.y;
        positions[i * 3 + 2] = p.position.z;
        const ratio = p.velocity.length() / Math.max(baseSpeed, 1e-6);
        if (toggles.velocityColorMode) {
          colorTmp.setHSL(0.55 - ratio * 0.35, 0.9, 0.45);
          colors[i * 3] = colorTmp.r;
          colors[i * 3 + 1] = colorTmp.g;
          colors[i * 3 + 2] = colorTmp.b;
        } else {
          colors[i * 3] = 0.345;
          colors[i * 3 + 1] = 0.651;
          colors[i * 3 + 2] = 1;
        }
      });
      const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const colAttr = pointsRef.current.geometry.attributes.color as THREE.BufferAttribute;
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }

    fpsRef.current.frames++;
    const now = performance.now();
    if (now - fpsRef.current.last >= 500) {
      fpsRef.current.fps = (fpsRef.current.frames * 1000) / (now - fpsRef.current.last);
      fpsRef.current.frames = 0;
      fpsRef.current.last = now;
    }

    tickSimulation({
      wakeIntensity: metrics.wakeHits,
      turbulenceProxy: env.turbulenceAmount * (0.5 + metrics.wakeHits),
      meanParticleVelocity: metrics.meanSpeed,
      maxVelocityProxy: metrics.maxSpeed,
      minVelocityProxy: metrics.minSpeed,
      activeParticles: toggles.particles ? particlesRef.current.length : 0,
      fps: fpsRef.current.fps,
    });
  });

  const boundsRevision = `${demoId}-${importPayload?.loadId ?? 'demo'}-${env.objectScale}`;
  const boundsThrottle = heavyModel ? 24 : 8;

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 10, 4]} intensity={1.1} />
      <OrbitControls makeDefault enableDamping />
      <group ref={modelRef} scale={env.objectScale}>
        {importPayload ? (
          <ImportedModel
            key={importPayload.loadId}
            bytes={importPayload.bytes}
            ext={importPayload.ext}
            loadId={importPayload.loadId}
            onReady={handleImportReady}
            onError={handleImportError}
          />
        ) : (
          <DemoMesh id={demoId} />
        )}
      </group>
      {toggles.gridFloor && <Grid infiniteGrid fadeDistance={18} cellColor="#30363d" sectionColor="#484f58" />}
      {toggles.windTunnelWalls && (
        <CompoundBoundsEdgeLines
          targetRef={modelRef}
          revision={boundsRevision}
          color="#58a6ff"
          padding={TUNNEL_PADDING}
          opacity={0.35}
          throttleFrames={boundsThrottle}
        />
      )}
      {toggles.windArrow && <WindArrow dir={windVec} />}
      {toggles.showBoundingBox && (
        <CompoundBoundsEdgeLines
          targetRef={modelRef}
          revision={boundsRevision}
          color="#58a6ff"
          padding={BOUNDS_PADDING}
          throttleFrames={boundsThrottle}
        />
      )}
      {toggles.particles && (
        <points ref={pointsRef}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
            <bufferAttribute attach="attributes-color" count={count} array={colors} itemSize={3} />
          </bufferGeometry>
          <pointsMaterial size={0.06} vertexColors sizeAttenuation />
        </points>
      )}
      {toggles.streamlines && !heavyModel && (
        <StreamlineLines particlesRef={particlesRef} />
      )}
      {toggles.pressureShell && (
        <mesh>
          <boxGeometry args={[0.01, 0.01, 0.01]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
    </>
  );
}

interface Viewport3DProps {
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  resetViewRef: React.MutableRefObject<(() => void) | null>;
  frameViewRef: React.MutableRefObject<(() => void) | null>;
  cameraViewRef: React.MutableRefObject<((preset: CameraViewPreset) => void) | null>;
  normalizeRef: React.MutableRefObject<(() => void) | null>;
  orientUprightRef: React.MutableRefObject<(() => void) | null>;
  rotateRef: React.MutableRefObject<((axis: 'x' | 'y' | 'z', deg: number) => void) | null>;
}

export function Viewport3D({
  canvasRef,
  resetViewRef,
  frameViewRef,
  cameraViewRef,
  normalizeRef,
  orientUprightRef,
  rotateRef,
}: Viewport3DProps) {
  const modelRef = useRef<THREE.Group>(null!);
  const toggles = useSimulationStore((s) => s.toggles);
  const paused = useSimulationStore((s) => s.paused);
  const solverMode = useSimulationStore((s) => s.solverMode);

  return (
    <div className="viewport-wrap">
      <Canvas
        style={{ width: '100%', height: '100%', display: 'block' }}
        camera={{ position: [4, 3, 5], fov: 50, near: 0.1, far: 500 }}
        gl={{ preserveDrawingBuffer: true, antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
        onCreated={({ gl }) => {
          gl.setClearColor('#0a0e14');
          canvasRef.current = gl.domElement;
          void ensureWebGpuDevice().then(() => {
            useSimulationStore.getState().refreshSolverInfo();
          });
        }}
      >
        <SceneInner
          modelRef={modelRef}
          resetViewRef={resetViewRef}
          frameViewRef={frameViewRef}
          cameraViewRef={cameraViewRef}
          normalizeRef={normalizeRef}
          orientUprightRef={orientUprightRef}
          rotateRef={rotateRef}
        />
      </Canvas>
      {paused && <div className="viewport-badge" style={{ top: 8, bottom: 'auto', color: 'var(--warn)' }}>Paused</div>}
      {toggles.pressureShell && <div className="viewport-badge">Pressure proxy — visual model only</div>}
      <div className="viewport-badge disclaimer">
        {solverMode === 'lbm'
          ? 'Navier-Stokes (LBM) — coarse grid, educational'
          : 'Educational flow model — not wind-tunnel validated'}
      </div>
    </div>
  );
}
