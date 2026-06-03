import { contextBridge, ipcRenderer } from 'electron'

function ipcBytesToUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return new Uint8Array(data)
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  }
  if (
    data &&
    typeof data === 'object' &&
    'type' in data &&
    (data as { type: string }).type === 'Buffer' &&
    Array.isArray((data as { data: number[] }).data)
  ) {
    return new Uint8Array((data as { data: number[] }).data)
  }
  throw new Error('Invalid model file data from main process')
}

const api = {
  openModelFile: async (_filters?: { name: string; extensions: string[] }[]) => {
    const result = await ipcRenderer.invoke('dialog:openModel')
    if (!result) return null
    const name = result.filePath.split(/[/\\]/).pop() ?? 'model.stl'
    const data = ipcBytesToUint8Array(result.data)
    return { name, data, filePath: result.filePath }
  },
  openProject: async () => {
    const result = await ipcRenderer.invoke('dialog:loadProject')
    if (!result) return null
    return { filePath: result.filePath, content: result.content }
  },
  saveProject: (json: string) => ipcRenderer.invoke('dialog:saveProject', json),
  saveImage: (base64: string) => ipcRenderer.invoke('dialog:saveImage', base64),
  saveBinary: (defaultName: string, base64: string) =>
    ipcRenderer.invoke('dialog:saveBinary', defaultName, base64),
  openModel: async () => {
    const r = await api.openModelFile()
    if (!r) return null
    return { name: r.name, data: r.data, filePath: r.filePath }
  },
  loadProject: () => api.openProject()
}

contextBridge.exposeInMainWorld('electronAPI', api)
