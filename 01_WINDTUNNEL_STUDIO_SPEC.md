# WindTunnel Studio — Cursor Build Spec

Build a polished Windows desktop-style application called **WindTunnel Studio** that lets the user import a 3D object, choose a travel/airflow direction, animate airflow around it in 3D space, view calculated statistics, graph related attributes, and export a high-quality video of the simulation.

## Controlling principle

This first version must be a **real-time educational / visual airflow modeling tool**, not a validated engineering-grade CFD solver.

The app must clearly label outputs as:

> Visual / educational model. Results are approximate and not validated CFD.

Do not pretend the results are scientifically exact. The goal is to make a beautiful, useful, interactive wind-tunnel visualizer that can later be connected to OpenFOAM, SU2, or another real solver.

## Core concept

The user imports a 3D model, selects wind direction and speed, then sees animated airflow particles/streamlines moving around the object.

The app should calculate and display approximate statistics:
- Reynolds number
- Dynamic pressure
- Estimated drag force
- Estimated drag coefficient / user-set Cd
- Projected frontal area proxy
- Wake intensity proxy
- Turbulence proxy
- Mean particle velocity
- Maximum local velocity proxy
- Minimum local velocity proxy
- Object dimensions
- Current wind vector
- FPS

## Preferred tech stack

Use:
- Electron + Vite + React + TypeScript
- Three.js / React Three Fiber for 3D rendering
- Recharts for plots
- Local file import for 3D models
- Browser `canvas.captureStream()` + `MediaRecorder` for WebM video export
- PNG snapshot export

Do not require:
- cloud backend
- paid API
- real CFD solver in version 1
- massive architecture

The app should run locally with:
```bash
npm install
npm run dev
npm run build
```

## Main layout

- Top bar: app title, import model, save project, load project, export video, snapshot
- Left panel: model controls, wind direction, environmental sliders
- Center: 3D viewport
- Right panel: live statistics
- Bottom panel or tab: graphs and sweeps

## 1. 3D object import

Support:
- STL
- OBJ
- GLTF/GLB if practical

Features:
- Display the model in a 3D viewport.
- Automatically center and scale the object into a virtual wind tunnel.
- Show bounding box, approximate dimensions, and projected frontal area proxy.
- Allow rotate, zoom, pan, and inspect.
- Add a "Reset View" button.
- Add a "Normalize Scale" button.
- Add a "Flip / Rotate Model" tool if practical.
- Do not crash on messy imported geometry. Show a useful error.

## 2. Airflow direction controls

Controls:
- X/Y/Z vector inputs
- yaw/pitch sliders
- preset buttons: Front, Back, Left, Right, Top, Bottom

Scene elements:
- wind arrow
- translucent wind tunnel box
- optional wind tunnel bounds toggle

## 3. Speed and environment sliders

Include sliders for:
- air speed, mph or m/s, with unit toggle
- air density
- dynamic viscosity
- particle density
- streamline length
- turbulence amount
- wake persistence
- particle speed multiplier
- object scale
- visualization quality: Low / Medium / High / Ultra
- optional Cd override

Defaults:
- Air speed: 30 mph
- Air density: 1.225 kg/m^3
- Dynamic viscosity: 1.81e-5 Pa·s
- Cd: 1.0
- Characteristic length estimated from object bounding box

## 4. 3D airflow animation

Create a visually pleasing animated airflow system in 3D.

The airflow should:
- spawn particles or streamlines upstream of the object
- move particles in the selected airflow direction
- deflect particles around the object using an approximate obstruction field
- slow particles near the front/stagnation zone
- accelerate particles around edges
- create a visible wake zone behind the object
- add turbulence/noise in the wake region
- fade, respawn, and leave trails
- use color or brightness to indicate relative velocity or pressure proxy

Toggles:
- particles
- streamlines
- wake zone
- pressure shell / surface coloring
- velocity color mode
- grid floor
- wind tunnel walls
- object wireframe overlay

This does **not** need to be true CFD. Use an approximate model based on object bounding volume, distance fields if feasible, raycasting, projected area proxy, and procedural flow deflection.

## 5. Surface visualization

Add optional coloring on or near the object:
- estimated high-pressure region on windward side
- estimated low-pressure / wake region behind object
- velocity proxy color
- pressure proxy color
- surface-normal relation to wind direction

Label this as:
- "pressure proxy"
- "estimated pressure field"
- "visual model"

## 6. Statistics panel

Use correct formulas where possible:

```txt
dynamicPressure = 0.5 * rho * v^2
Re = rho * v * L / mu
Fd = 0.5 * rho * v^2 * Cd * A
```

Where:
- rho = air density
- v = air speed
- L = characteristic length
- mu = dynamic viscosity
- Cd = drag coefficient
- A = frontal area proxy

Display:
- air speed
- air density
- dynamic viscosity
- estimated characteristic length
- estimated frontal area
- Reynolds number
- dynamic pressure
- estimated drag force
- Cd
- wake intensity score
- turbulence proxy
- max/min/mean velocity proxy
- active particles
- object dimensions
- current wind vector
- current animation FPS

## 7. Graphing dashboard

Live graphs:
- air speed over time
- estimated drag force over time
- Reynolds number over time
- dynamic pressure over time
- wake intensity over time
- mean particle velocity over time
- turbulence proxy over time
- FPS / performance over time

Parameter sweep graphs:
- drag force vs air speed
- Reynolds number vs air speed
- dynamic pressure vs air speed
- wake intensity vs yaw angle
- frontal area proxy vs yaw angle

Add a "Run Sweep" button and export graphs as PNG.

## 8. Video export

Add "Export Video".

Options:
- duration: 5, 10, 20, 30, 60 seconds
- quality: 720p, 1080p, 1440p, 4K if feasible
- FPS: 30 or 60
- export mode:
  - 3D viewport only
  - 3D viewport + stats overlay
  - 3D viewport + graphs overlay

Requirements:
- Save as WebM at minimum.
- Do not promise MP4 unless actually implemented locally.
- Show progress.
- Disable controls during export.
- Include a "Snapshot PNG" button.

## 9. Project save/load

Save/load JSON settings:
- wind settings
- environment settings
- visualization settings
- camera position
- graph settings
- notes field
- model filename metadata

Do not attempt to store large model binaries in JSON in version 1.

## 10. UI design

Style:
- dark technical dashboard
- clean 3D viewport
- high contrast, but not neon overload
- subtle animated accents
- cards for statistics
- responsive sliders
- clear labels and units
- professional scientific-instrument feel
- not childish or toy-like

## 11. Accuracy warning

Persistent note:
> Visual/educational model. Results are approximate and not validated CFD.

Help/About panel:
- This app uses a real-time approximate flow visualization.
- It estimates basic fluid attributes using simplified formulas.
- It does not replace OpenFOAM, SU2, ANSYS Fluent, STAR-CCM+, or validated CFD.
- Future versions could connect to a real CFD solver.

## 12. Code structure

Use this structure:

```txt
src/
  components/
    Viewport3D.tsx
    ControlPanel.tsx
    StatsPanel.tsx
    GraphDashboard.tsx
    ExportPanel.tsx
    ModelImporter.tsx
  simulation/
    flowModel.ts
    particleSystem.ts
    statistics.ts
    sweeps.ts
  utils/
    units.ts
    geometry.ts
    exportVideo.ts
    projectIO.ts
  types/
    simulationTypes.ts
```

Use TypeScript types throughout.
Comment the main equations.
Avoid deeply nested spaghetti code.
Make it easy to later swap the approximate solver for real OpenFOAM/SU2 output.

## 13. Minimum viable version

First working version must include:
- STL/OBJ import
- 3D viewport
- wind direction and speed controls
- animated airflow particles
- approximate wake behavior
- live stats
- at least 4 live graphs
- PNG snapshot export
- WebM video export
- project settings save/load
- built-in demo objects

## 14. Built-in demo objects

Include:
- sphere
- cube
- cylinder
- simple airfoil-like shape
- rectangular vehicle-like block

## 15. Final deliverable

Produce complete runnable project files and a README with:
- install instructions
- run instructions
- build instructions
- supported file types
- limitations
- explanation of approximate model
- future path to real CFD backend
