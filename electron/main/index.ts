import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { mkdirSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

/**
 * Chromium cache errors on Windows (cache_util_win / gpu_disk_cache) usually mean
 * the default profile dir is locked — often from a second Electron dev instance.
 */
const cacheRoot = join(
  app.getPath('temp'),
  'wind-tunnel-studio',
  process.env.ELECTRON_RENDERER_URL ? 'dev' : 'prod'
)
for (const dir of [
  cacheRoot,
  join(cacheRoot, 'userData'),
  join(cacheRoot, 'disk-cache'),
  join(cacheRoot, 'gpu-cache'),
]) {
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* ignore */
  }
}

app.setPath('userData', join(cacheRoot, 'userData'))
app.commandLine.appendSwitch('disk-cache-dir', join(cacheRoot, 'disk-cache'))
app.commandLine.appendSwitch('gpu-disk-cache-dir', join(cacheRoot, 'gpu-cache'))
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('dialog:openModel', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: '3D Models', extensions: ['stl', 'obj', 'gltf', 'glb'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const buffer = await readFile(filePath)
    return { filePath, data: Uint8Array.from(buffer) }
  })

  ipcMain.handle('dialog:saveProject', async (_e, json: string) => {
    const result = await dialog.showSaveDialog({
      filters: [{ name: 'WindTunnel Project', extensions: ['wtproj', 'json'] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, json, 'utf-8')
    return result.filePath
  })

  ipcMain.handle('dialog:loadProject', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'WindTunnel Project', extensions: ['wtproj', 'json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const content = await readFile(result.filePaths[0], 'utf-8')
    return { filePath: result.filePaths[0], content }
  })

  ipcMain.handle('dialog:saveImage', async (_e, base64: string) => {
    const result = await dialog.showSaveDialog({
      filters: [{ name: 'PNG Image', extensions: ['png'] }]
    })
    if (result.canceled || !result.filePath) return null
    const data = base64.replace(/^data:image\/png;base64,/, '')
    await writeFile(result.filePath, Buffer.from(data, 'base64'))
    return result.filePath
  })

  ipcMain.handle('dialog:saveBinary', async (_e, defaultName: string, base64: string) => {
    const ext = defaultName.split('.').pop() ?? 'bin'
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, Buffer.from(base64, 'base64'))
    return result.filePath
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
