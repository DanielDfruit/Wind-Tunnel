import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'
import {
  autoOrientModelUpright,
  centerObject,
  normalizeObjectScale,
  computeObjectBounds,
  estimateFrontalAreaProxy,
} from './geometry'
import { optimizeImportedMeshes, simplifyParsedGeometry } from './meshOptimize'
import type { LoadedModel } from '../types/simulationTypes'

function applyDefaultMaterial(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.material = new THREE.MeshStandardMaterial({
      color: 0x8899aa,
      metalness: 0.3,
      roughness: 0.6,
    })
    mesh.castShadow = false
    mesh.receiveShadow = false
  })
}

function assertHasVisibleGeometry(object: THREE.Object3D): void {
  let hasGeometry = false
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.isMesh && mesh.geometry?.attributes?.position?.count > 0) {
      hasGeometry = true
    }
  })
  if (!hasGeometry) {
    throw new Error('Model has no visible mesh geometry')
  }
}

export async function loadModelFromUrl(
  url: string,
  format: 'stl' | 'obj' | 'gltf'
): Promise<LoadedModel> {
  let object: THREE.Object3D

  if (format === 'stl') {
    const loader = new STLLoader()
    const geometry = await loader.loadAsync(url)
    geometry.computeVertexNormals()
    object = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.3, roughness: 0.6 })
    )
  } else if (format === 'obj') {
    object = await new OBJLoader().loadAsync(url)
    applyDefaultMaterial(object)
  } else {
    const gltf = await new GLTFLoader().loadAsync(url)
    object = gltf.scene
    applyDefaultMaterial(object)
  }

  return prepareModel(object)
}

export async function loadModelFromBuffer(
  data: ArrayBuffer,
  format: 'stl' | 'obj' | 'gltf',
  fileName: string
): Promise<LoadedModel> {
  let object: THREE.Object3D

  if (format === 'stl') {
    let geometry = new STLLoader().parse(data)
    if (!geometry.attributes.position?.count) {
      throw new Error('STL file is empty or invalid')
    }
    geometry = simplifyParsedGeometry(geometry)
    geometry.computeVertexNormals()
    object = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.3, roughness: 0.6 })
    )
  } else if (format === 'obj') {
    const text = new TextDecoder().decode(data)
    object = new OBJLoader().parse(text)
    applyDefaultMaterial(object)
  } else {
    const gltf = await new GLTFLoader().parseAsync(data, '')
    object = gltf.scene
    applyDefaultMaterial(object)
  }

  assertHasVisibleGeometry(object)
  void fileName
  return prepareModel(object)
}

function prepareModel(object: THREE.Object3D): LoadedModel {
  autoOrientModelUpright(object)
  centerObject(object)
  normalizeObjectScale(object, 2)
  const optimized = optimizeImportedMeshes(object)
  centerObject(object)
  const bounds = computeObjectBounds(object)
  const windDir = new THREE.Vector3(1, 0, 0)
  const frontalAreaProxy = estimateFrontalAreaProxy(bounds, windDir)

  return {
    object,
    bounds: bounds.box,
    dimensions: bounds.dimensions,
    characteristicLength: bounds.characteristicLength,
    frontalAreaProxy,
    vertexCount: optimized.vertexCount,
    initialVertexCount: optimized.initialVertexCount,
    meshSimplified: optimized.simplified,
    heavyMesh: optimized.heavy,
    massiveMesh: optimized.massive,
    importTier: optimized.tier,
  }
}

export function detectFormat(fileName: string): 'stl' | 'obj' | 'gltf' | null {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'stl') return 'stl'
  if (ext === 'obj') return 'obj'
  if (ext === 'gltf' || ext === 'glb') return 'gltf'
  return null
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}
