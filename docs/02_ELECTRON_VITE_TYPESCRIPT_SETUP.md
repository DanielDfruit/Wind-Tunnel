# Electron + Vite + TypeScript Setup Notes

Use Electron + Vite + React + TypeScript.

Official reference:
- Electron Forge Vite + TypeScript template: https://www.electronforge.io/templates/vite-%2B-typescript
- Electron Forge Vite plugin: https://www.electronforge.io/config/plugins/vite

Useful facts:
- Electron Forge provides a Vite + TypeScript template with sane TypeScript defaults.
- Electron Forge is intended to package and distribute Electron apps.
- Keep Electron main, preload, and renderer logic separated.
- The renderer should hold React, Three.js, Recharts, and UI state.
- Main process should handle window lifecycle and safe file dialogs if needed.
- For version 1, local-only operation is preferred.

Implementation instruction:
- Use a clean Electron/Vite setup.
- Avoid unusual build tools unless necessary.
- The final app must support:
  - npm install
  - npm run dev
  - npm run build
