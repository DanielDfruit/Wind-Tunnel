/// <reference types="vite/client" />
/// <reference types="@webgpu/types" />

interface ElectronAPI {
  openModel: () => Promise<{ filePath: string; data: Uint8Array; name: string } | null>
  saveFile?: (defaultName: string, data: string, encoding: 'utf-8' | 'base64') => Promise<string | null>
  openProject: () => Promise<{ filePath: string; data: unknown } | null>
  saveProject: (json: string) => Promise<string | null>
  saveFile: (defaultName: string, data: string, encoding: 'utf-8' | 'base64') => Promise<string | null>
}

interface Window {
  electronAPI?: ElectronAPI
}
