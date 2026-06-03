# Three.js Loader Notes: STL / OBJ / GLTF

Official references:
- STLLoader: https://threejs.org/docs/pages/STLLoader.html
- OBJLoader: https://threejs.org/docs/pages/OBJLoader.html
- GLTFLoader: https://threejs.org/docs/pages/GLTFLoader.html

## STL

Three.js STLLoader:
- Loads STL files from CAD and 3D printing workflows.
- Supports binary and ASCII STL.
- Returns non-indexed `BufferGeometry`.

Use STL as the first priority because clean simple test models often use STL.

## OBJ

Three.js OBJLoader:
- Loads OBJ geometry.
- OBJ is a human-readable geometry format.
- Good for simple airfoil and block test objects.

## GLTF/GLB

Three.js GLTFLoader:
- Loads glTF 2.0.
- glTF is a modern web-friendly transmission format.
- Useful later, but not required for the first minimum version.

Implementation instruction:
- Support STL and OBJ first.
- Normalize all imported objects into a single internal representation that the viewport can center, scale, and measure.
- If GLTF is implemented, handle disposal carefully because textures/images can consume memory.
