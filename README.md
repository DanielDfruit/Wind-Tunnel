# WindTunnel Studio

Real-time **educational** 3D airflow visualizer for Windows (Electron). Import STL/OBJ models, animate approximate flow particles, view live statistics and graphs, and export PNG snapshots or WebM video.

> **Visual / educational model. Results are approximate and not validated CFD.**

This is not OpenFOAM, SU2, ANSYS Fluent, or STAR-CCM+. Version 1 uses simplified flow deflection and standard drag/Reynolds formulas with proxy geometry values.

## Install

```bash
cd "Projects/Wind Tunnel"
npm install
```

## Run (development)

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Supported model formats

- STL
- OBJ
- GLTF / GLB

Built-in demo shapes: sphere, cube, cylinder, simple airfoil, vehicle block (see `test_models/` and `public/models/`).

## Features (v1)

- 3D viewport with orbit controls, wind tunnel box, wind arrow
- Approximate particle airflow and streamlines with wake behavior
- Wind direction presets, yaw/pitch, speed and environment sliders
- Live statistics (Re, dynamic pressure, estimated drag, etc.)
- Live charts and parameter sweeps
- PNG snapshot and WebM video export
- JSON project save/load (settings only — not embedded model binaries)

## Limitations

- No real CFD solver; pressure/wake fields are **proxies**
- Frontal area and Cd are user-estimated or override values
- Graph PNG export uses SVG capture per chart or OS screenshot
- MP4 export is not included (WebM only)

## Future path

The `simulation/` modules are structured so a real OpenFOAM or SU2 backend could replace `flowModel.ts` and feed the same statistics and visualization layer. See `docs/09_FUTURE_OPENFOAM_SNAPPYHEXMESH_NOT_FOR_V1.md`.

## Project docs

Specification and implementation notes live in `01_WINDTUNNEL_STUDIO_SPEC.md` and `docs/`.
