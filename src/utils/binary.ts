/** Normalize file bytes from Electron IPC, FileReader, or upload. */
export function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) {
    return new Uint8Array(data)
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  }
  if (data && typeof data === 'object' && 'type' in data) {
    const nodeBuffer = data as unknown as { type: string; data: number[] }
    if (nodeBuffer.type === 'Buffer' && Array.isArray(nodeBuffer.data)) {
      return new Uint8Array(nodeBuffer.data)
    }
  }
  if (data && typeof data === 'object' && 'data' in data) {
    const wrapped = data as unknown as { data: number[] }
    if (Array.isArray(wrapped.data)) {
      return new Uint8Array(wrapped.data)
    }
  }
  throw new Error('Unsupported binary payload from file import')
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer as ArrayBuffer
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
