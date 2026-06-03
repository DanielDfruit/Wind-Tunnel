# Future OpenFOAM Backend Notes — Do Not Implement in Version 1

Official reference:
- OpenFOAM snappyHexMesh: https://www.openfoam.com/documentation/user-guide/4-mesh-generation-and-conversion/4.4-mesh-generation-with-the-snappyhexmesh-utility
- OpenFOAM snappyHexMesh geometry dictionary: https://doc.openfoam.com/2312/tools/pre-processing/mesh/generation/snappyhexmesh/geometry/

Purpose:
This document is only for future architecture. Do not build OpenFOAM integration in version 1.

Useful facts:
- snappyHexMesh can generate meshes from STL surface geometry.
- OpenFOAM geometry can be specified through STL surface files or bounding geometry entities.
- A real CFD backend would require:
  - geometry cleaning
  - domain generation
  - mesh generation
  - boundary conditions
  - solver selection
  - convergence monitoring
  - post-processing
  - validation

Future architecture suggestion:
- Keep app data structures solver-neutral.
- Add a future `solverBackends/` folder:
  - approximateVisualSolver.ts
  - openFoamBackend.ts
  - su2Backend.ts
- Version 1 should use `approximateVisualSolver.ts` only.

Do not let this document derail the app into a broken CFD wrapper.
