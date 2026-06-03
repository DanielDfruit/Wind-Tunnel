import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const mainEntry = resolve(__dirname, 'electron/main/index.ts')
const preloadEntry = resolve(__dirname, 'electron/preload/index.ts')
const rendererHtml = resolve(__dirname, 'index.html')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: mainEntry
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: preloadEntry
      }
    }
  },
  renderer: {
    root: __dirname,
    build: {
      rollupOptions: {
        input: rendererHtml
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src')
      }
    },
    plugins: [react()],
    publicDir: resolve('public'),
    assetsInclude: ['**/*.stl', '**/*.obj']
  }
})
