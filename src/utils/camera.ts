import * as THREE from 'three'
import { computeWorldBounds } from './geometry'

export type CameraViewPreset = 'iso' | 'front' | 'back' | 'top' | 'right' | 'left'

const VIEW_DIRS: Record<CameraViewPreset, THREE.Vector3> = {
  iso: new THREE.Vector3(1, 0.72, 1),
  front: new THREE.Vector3(1, 0.12, 0.35),
  back: new THREE.Vector3(-1, 0.12, -0.35),
  top: new THREE.Vector3(0.02, 1, 0.02),
  right: new THREE.Vector3(0.35, 0.12, 1),
  left: new THREE.Vector3(-0.35, 0.12, -1),
}

export interface OrbitControlsLike {
  target: THREE.Vector3
  update?: () => void
}

function resetCameraToDefault(camera: THREE.Camera, controls: OrbitControlsLike | null): void {
  const persp = camera as THREE.PerspectiveCamera
  camera.position.set(4, 3, 5)
  camera.lookAt(0, 0, 0)
  persp.updateProjectionMatrix?.()
  if (controls) {
    controls.target.set(0, 0, 0)
    controls.update?.()
  }
}

export function fitCameraToObject(
  camera: THREE.Camera,
  controls: OrbitControlsLike | null,
  object: THREE.Object3D,
  padding = 1.45
): void {
  const box = computeWorldBounds(object)
  if (box.isEmpty()) {
    resetCameraToDefault(camera, controls)
    return
  }

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 0.01)

  const persp = camera as THREE.PerspectiveCamera
  const fov = (persp.fov ?? 50) * (Math.PI / 180)
  const dist = (maxDim * padding) / (2 * Math.tan(fov / 2))

  const dir = VIEW_DIRS.iso.clone().normalize()
  camera.position.copy(center).add(dir.multiplyScalar(dist))
  camera.lookAt(center)
  persp.updateProjectionMatrix?.()

  if (controls) {
    controls.target.copy(center)
    controls.update?.()
  }
}

export function setCameraViewPreset(
  preset: CameraViewPreset,
  camera: THREE.Camera,
  controls: OrbitControlsLike | null,
  object: THREE.Object3D,
  padding = 1.45
): void {
  const box = computeWorldBounds(object)
  if (box.isEmpty()) {
    resetCameraToDefault(camera, controls)
    return
  }

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 0.01)

  const persp = camera as THREE.PerspectiveCamera
  const fov = (persp.fov ?? 50) * (Math.PI / 180)
  const dist = (maxDim * padding) / (2 * Math.tan(fov / 2))

  const dir = VIEW_DIRS[preset].clone().normalize()
  camera.position.copy(center).add(dir.multiplyScalar(dist))
  camera.lookAt(center)
  persp.updateProjectionMatrix?.()

  if (controls) {
    controls.target.copy(center)
    controls.update?.()
  }
}
