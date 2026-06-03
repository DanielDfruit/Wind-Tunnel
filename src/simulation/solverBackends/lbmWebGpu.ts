import type { ObstacleGrid } from './gridObstacle'
import { cellIndex } from './gridObstacle'

const Q = 19

export type GpuLbmStatus = 'unavailable' | 'ready' | 'error'

let device: GPUDevice | null = null
let adapterLabel = ''
let initPromise: Promise<GpuLbmStatus> | null = null
let status: GpuLbmStatus = 'unavailable'
let statusDetail = ''
const readyListeners = new Set<() => void>()

/** Fired once when WebGPU device becomes ready (e.g. to rebuild LBM on GPU). */
export function onWebGpuLbmReady(listener: () => void): () => void {
  readyListeners.add(listener)
  if (status === 'ready') listener()
  return () => readyListeners.delete(listener)
}

function notifyReady(): void {
  readyListeners.forEach((fn) => fn())
}

export function getWebGpuLbmStatus(): { status: GpuLbmStatus; detail: string } {
  return { status, detail: statusDetail }
}

export function isWebGpuLbmReady(): boolean {
  return status === 'ready' && device !== null
}

/** Request high-performance GPU adapter once per app session. */
export async function ensureWebGpuDevice(): Promise<GpuLbmStatus> {
  if (status === 'ready') return status
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      if (!navigator.gpu) {
        statusDetail = 'WebGPU not available in this environment'
        status = 'unavailable'
        return status
      }
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
      })
      if (!adapter) {
        statusDetail = 'No WebGPU adapter found'
        status = 'unavailable'
        return status
      }
      try {
        const info = await adapter.requestAdapterInfo()
        adapterLabel = info.device ?? info.description ?? 'GPU'
      } catch {
        adapterLabel = 'GPU'
      }
      const limits = adapter.limits
      device = await adapter.requestDevice({
        requiredLimits: {
          maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
          maxBufferSize: limits.maxBufferSize,
        },
      })
      statusDetail = adapterLabel
      status = 'ready'
      notifyReady()
      return status
    } catch (e) {
      statusDetail = e instanceof Error ? e.message : 'WebGPU init failed'
      status = 'error'
      device = null
      return status
    }
  })()

  return initPromise
}

const WGSL = /* wgsl */ `
struct Params {
  dims: vec4<u32>,
  flow: vec4<f32>,
  misc: vec4<f32>,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> solid: array<u32>;
@group(0) @binding(2) var<storage, read> inlet: array<u32>;
@group(0) @binding(3) var<storage, read> fIn: array<f32>;
@group(0) @binding(4) var<storage, read_write> fOut: array<f32>;
@group(0) @binding(5) var<storage, read_write> rho: array<f32>;
@group(0) @binding(6) var<storage, read_write> ux: array<f32>;
@group(0) @binding(7) var<storage, read_write> uy: array<f32>;
@group(0) @binding(8) var<storage, read_write> uz: array<f32>;

const Q: u32 = 19u;
const EX: array<i32, 19> = array<i32, 19>(
  0, 1,-1, 0, 0, 0, 0, 1,-1, 1,-1, 1,-1, 1,-1, 0, 0, 0, 0
);
const EY: array<i32, 19> = array<i32, 19>(
  0, 0, 0, 1,-1, 0, 0, 1, 1,-1,-1, 0, 0, 0, 0, 1,-1, 1,-1
);
const EZ: array<i32, 19> = array<i32, 19>(
  0, 0, 0, 0, 0, 1,-1, 0, 0, 0, 0, 1, 1,-1,-1, 1,-1, 1,-1
);
const W: array<f32, 19> = array<f32, 19>(
  1.0/3.0,
  1.0/18.0,1.0/18.0,1.0/18.0,1.0/18.0,1.0/18.0,1.0/18.0,
  1.0/36.0,1.0/36.0,1.0/36.0,1.0/36.0,1.0/36.0,1.0/36.0,1.0/36.0,1.0/36.0,
  1.0/36.0,1.0/36.0,1.0/36.0,1.0/36.0
);
const OPP: array<u32, 19> = array<u32, 19>(
  0u, 2u, 1u, 4u, 3u, 6u, 5u, 8u, 7u, 10u, 9u, 12u, 11u, 14u, 13u, 16u, 15u, 18u, 17u
);

fn idx3(i: u32, j: u32, k: u32) -> u32 {
  return i * params.dims.y * params.dims.z + j * params.dims.z + k;
}

fn feq(q: u32, rho: f32, uvx: f32, uvy: f32, uvz: f32) -> f32 {
  let eu = f32(EX[q]) * uvx + f32(EY[q]) * uvy + f32(EZ[q]) * uvz;
  let u2 = uvx * uvx + uvy * uvy + uvz * uvz;
  return W[q] * rho * (1.0 + 3.0 * eu + 4.5 * eu * eu - 1.5 * u2);
}

@compute @workgroup_size(4, 4, 4)
fn lbm_collide(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  let j = gid.y;
  let k = gid.z;
  if (i >= params.dims.x || j >= params.dims.y || k >= params.dims.z) {
    return;
  }
  let id = idx3(i, j, k);
  let omega = params.flow.x;

  if (solid[id] == 1u) {
    for (var q = 0u; q < Q; q++) {
      fOut[id * Q + q] = feq(q, 1.0, 0.0, 0.0, 0.0);
    }
    rho[id] = 1.0;
    ux[id] = 0.0;
    uy[id] = 0.0;
    uz[id] = 0.0;
    return;
  }

  var r = 0.0;
  var jx = 0.0;
  var jy = 0.0;
  var jz = 0.0;
  for (var q = 0u; q < Q; q++) {
    let fq = fIn[id * Q + q];
    r += fq;
    jx += fq * f32(EX[q]);
    jy += fq * f32(EY[q]);
    jz += fq * f32(EZ[q]);
  }
  let invR = 1.0 / r;
  let uvx = jx * invR;
  let uvy = jy * invR;
  let uvz = jz * invR;
  rho[id] = r;
  ux[id] = uvx;
  uy[id] = uvy;
  uz[id] = uvz;

  for (var q = 0u; q < Q; q++) {
    let fe = feq(q, r, uvx, uvy, uvz);
    fOut[id * Q + q] = fIn[id * Q + q] - omega * (fIn[id * Q + q] - fe);
  }
}

@compute @workgroup_size(4, 4, 4)
fn lbm_stream(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  let j = gid.y;
  let k = gid.z;
  if (i >= params.dims.x || j >= params.dims.y || k >= params.dims.z) {
    return;
  }
  let id = idx3(i, j, k);
  let nx = params.dims.x;
  let ny = params.dims.y;
  let nz = params.dims.z;
  let uxIn = params.flow.y;
  let uyIn = params.flow.z;
  let uzIn = params.flow.w;

  if (solid[id] == 1u) {
    return;
  }

  for (var q = 0u; q < Q; q++) {
    let si = i32(i) - EX[q];
    let sj = i32(j) - EY[q];
    let sk = i32(k) - EZ[q];
    if (si < 0 || sj < 0 || sk < 0 || si >= i32(nx) || sj >= i32(ny) || sk >= i32(nz)) {
      fOut[id * Q + q] = fIn[id * Q + q];
      continue;
    }
    let sid = idx3(u32(si), u32(sj), u32(sk));
    if (solid[sid] == 1u) {
      fOut[id * Q + q] = fIn[id * Q + OPP[q]];
    } else {
      fOut[id * Q + q] = fIn[sid * Q + q];
    }
  }

  if (inlet[id] == 1u) {
    for (var q = 0u; q < Q; q++) {
      fOut[id * Q + q] = feq(q, 1.0, uxIn, uyIn, uzIn);
    }
    ux[id] = uxIn;
    uy[id] = uyIn;
    uz[id] = uzIn;
  }
}
`

async function createValidatedComputePipeline(
  dev: GPUDevice,
  module: GPUShaderModule,
  layout: GPUBindGroupLayout,
  entryPoint: string
): Promise<GPUComputePipeline> {
  const info = await module.getCompilationInfo()
  const errors = info.messages.filter((m) => m.type === 'error')
  if (errors.length > 0) {
    const text = errors.map((m) => m.message).join('\n')
    console.error(`[LBM WGSL ${entryPoint}]`, errors)
    throw new Error(`WGSL compile failed (${entryPoint}): ${text}`)
  }
  return dev.createComputePipeline({
    layout: dev.createPipelineLayout({ bindGroupLayouts: [layout] }),
    compute: { module, entryPoint },
  })
}

export class WebGpuLbmEngine {
  private collidePipeline: GPUComputePipeline | null = null
  private streamPipeline: GPUComputePipeline | null = null
  private bindLayout: GPUBindGroupLayout | null = null
  private solidBuf: GPUBuffer | null = null
  private inletBuf: GPUBuffer | null = null
  private fA: GPUBuffer | null = null
  private fB: GPUBuffer | null = null
  private rhoBuf: GPUBuffer | null = null
  private uxBuf: GPUBuffer | null = null
  private uyBuf: GPUBuffer | null = null
  private uzBuf: GPUBuffer | null = null
  private paramsBuf: GPUBuffer | null = null
  private readUx: Float32Array | null = null
  private readUy: Float32Array | null = null
  private readUz: Float32Array | null = null
  private readRho: Float32Array | null = null
  private n = 0
  private pingA = true
  private grid: ObstacleGrid | null = null

  async setup(grid: ObstacleGrid, tau: number, uLattice: number): Promise<boolean> {
    const dev = device
    if (!dev || status !== 'ready') return false

    this.grid = grid
    const { nx, ny, nz, solid, inletMask, wind } = grid
    this.n = nx * ny * nz
    const fSize = this.n * Q * 4

    if (!this.collidePipeline || !this.streamPipeline) {
      const module = dev.createShaderModule({ code: WGSL, label: 'lbm-d3q19' })
      const layoutEntries: GPUBindGroupLayoutEntry[] = [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ]
      this.bindLayout = dev.createBindGroupLayout({ entries: layoutEntries })
      this.collidePipeline = await createValidatedComputePipeline(dev, module, this.bindLayout, 'lbm_collide')
      this.streamPipeline = await createValidatedComputePipeline(dev, module, this.bindLayout, 'lbm_stream')
    }

    const destroy = (b: GPUBuffer | null) => b?.destroy()
    destroy(this.solidBuf)
    destroy(this.inletBuf)
    destroy(this.fA)
    destroy(this.fB)
    destroy(this.rhoBuf)
    destroy(this.uxBuf)
    destroy(this.uyBuf)
    destroy(this.uzBuf)

    this.solidBuf = dev.createBuffer({ size: this.n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    this.inletBuf = dev.createBuffer({ size: this.n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    this.fA = dev.createBuffer({ size: fSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    this.fB = dev.createBuffer({ size: fSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    this.rhoBuf = dev.createBuffer({ size: this.n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
    this.uxBuf = dev.createBuffer({ size: this.n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
    this.uyBuf = dev.createBuffer({ size: this.n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
    this.uzBuf = dev.createBuffer({ size: this.n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })

    const solidU32 = new Uint32Array(solid)
    const inletU32 = new Uint32Array(inletMask)
    dev.queue.writeBuffer(this.solidBuf, 0, solidU32)
    dev.queue.writeBuffer(this.inletBuf, 0, inletU32)

    const fInit = this.buildInitialF(grid, uLattice)
    dev.queue.writeBuffer(this.fA, 0, fInit.buffer, fInit.byteOffset, fInit.byteLength)

    this.paramsBuf = dev.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    writeParamsUniform(dev, this.paramsBuf, nx, ny, nz, 1 / tau, wind.x * uLattice, wind.y * uLattice, wind.z * uLattice, uLattice)

    this.readUx = new Float32Array(this.n)
    this.readUy = new Float32Array(this.n)
    this.readUz = new Float32Array(this.n)
    this.readRho = new Float32Array(this.n)
    this.pingA = true
    return true
  }

  private buildInitialF(grid: ObstacleGrid, uLattice: number): Float32Array {
    const { solid, nx, ny, nz, wind } = grid
    const n = nx * ny * nz
    const f = new Float32Array(n * Q)
    const ux0 = wind.x * uLattice
    const uy0 = wind.y * uLattice
    const uz0 = wind.z * uLattice
    const EX = [0, 1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0]
    const EY = [0, 0, 0, 1, -1, 0, 0, 1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1]
    const EZ = [0, 0, 0, 0, 0, 1, -1, 0, 0, 0, 0, 1, 1, -1, -1, 1, -1, 1, -1]
    const W = [
      1 / 3,
      ...Array(6).fill(1 / 18),
      ...Array(12).fill(1 / 36),
    ]
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        for (let k = 0; k < nz; k++) {
          const id = cellIndex(i, j, k, ny, nz)
          const ux = solid[id] ? 0 : ux0
          const uy = solid[id] ? 0 : uy0
          const uz = solid[id] ? 0 : uz0
          for (let q = 0; q < Q; q++) {
            const eu = EX[q] * ux + EY[q] * uy + EZ[q] * uz
            const u2 = ux * ux + uy * uy + uz * uz
            f[id * Q + q] = W[q] * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * u2)
          }
        }
      }
    }
    return f
  }

  async runSteps(steps: number): Promise<void> {
    const dev = device
    if (!dev || !this.collidePipeline || !this.streamPipeline || !this.bindLayout || !this.grid) return

    const { nx, ny, nz } = this.grid
    const wgX = Math.ceil(nx / 4)
    const wgY = Math.ceil(ny / 4)
    const wgZ = Math.ceil(nz / 4)

    const makeBind = (fIn: GPUBuffer, fOut: GPUBuffer) =>
      dev.createBindGroup({
        layout: this.bindLayout!,
        entries: [
          { binding: 0, resource: { buffer: this.paramsBuf! } },
          { binding: 1, resource: { buffer: this.solidBuf! } },
          { binding: 2, resource: { buffer: this.inletBuf! } },
          { binding: 3, resource: { buffer: fIn } },
          { binding: 4, resource: { buffer: fOut } },
          { binding: 5, resource: { buffer: this.rhoBuf! } },
          { binding: 6, resource: { buffer: this.uxBuf! } },
          { binding: 7, resource: { buffer: this.uyBuf! } },
          { binding: 8, resource: { buffer: this.uzBuf! } },
        ],
      })

    for (let s = 0; s < steps; s++) {
      const fIn = this.pingA ? this.fA! : this.fB!
      const fMid = this.pingA ? this.fB! : this.fA!
      const enc = dev.createCommandEncoder()

      const collidePass = enc.beginComputePass()
      collidePass.setPipeline(this.collidePipeline)
      collidePass.setBindGroup(0, makeBind(fIn, fMid))
      collidePass.dispatchWorkgroups(wgX, wgY, wgZ)
      collidePass.end()

      const streamPass = enc.beginComputePass()
      streamPass.setPipeline(this.streamPipeline)
      streamPass.setBindGroup(0, makeBind(fMid, fIn))
      streamPass.dispatchWorkgroups(wgX, wgY, wgZ)
      streamPass.end()

      dev.queue.submit([enc.finish()])
    }
    await dev.queue.onSubmittedWorkDone()
  }

  async readMacroscopic(): Promise<{ ux: Float32Array; uy: Float32Array; uz: Float32Array; rho: Float32Array }> {
    const dev = device!
    const nBytes = this.n * 4
    const stage = dev.createBuffer({ size: nBytes * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })

    const enc = dev.createCommandEncoder()
    enc.copyBufferToBuffer(this.uxBuf!, 0, stage, 0, nBytes)
    enc.copyBufferToBuffer(this.uyBuf!, 0, stage, nBytes, nBytes)
    enc.copyBufferToBuffer(this.uzBuf!, 0, stage, nBytes * 2, nBytes)
    enc.copyBufferToBuffer(this.rhoBuf!, 0, stage, nBytes * 3, nBytes)
    dev.queue.submit([enc.finish()])
    await stage.mapAsync(GPUMapMode.READ)

    const mapped = new Float32Array(stage.getMappedRange())
    this.readUx!.set(mapped.subarray(0, this.n))
    this.readUy!.set(mapped.subarray(this.n, this.n * 2))
    this.readUz!.set(mapped.subarray(this.n * 2, this.n * 3))
    this.readRho!.set(mapped.subarray(this.n * 3, this.n * 4))
    stage.unmap()

    return { ux: this.readUx!, uy: this.readUy!, uz: this.readUz!, rho: this.readRho! }
  }

  getMacroscopicArrays(): { ux: Float32Array; uy: Float32Array; uz: Float32Array; rho: Float32Array } | null {
    if (!this.readUx) return null
    return { ux: this.readUx, uy: this.readUy!, uz: this.readUz!, rho: this.readRho! }
  }
}

function writeParamsUniform(
  dev: GPUDevice,
  buf: GPUBuffer,
  nx: number,
  ny: number,
  nz: number,
  omega: number,
  uxIn: number,
  uyIn: number,
  uzIn: number,
  uLattice: number
): void {
  const raw = new ArrayBuffer(48)
  const u32 = new Uint32Array(raw)
  const f32 = new Float32Array(raw)
  u32[0] = nx
  u32[1] = ny
  u32[2] = nz
  f32[4] = omega
  f32[5] = uxIn
  f32[6] = uyIn
  f32[7] = uzIn
  f32[8] = uLattice
  dev.queue.writeBuffer(buf, 0, raw)
}
