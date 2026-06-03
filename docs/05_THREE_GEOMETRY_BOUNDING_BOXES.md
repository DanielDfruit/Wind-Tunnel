# Three.js Bounding Box and Geometry Measurement Notes

Official reference:
- BufferGeometry.computeBoundingBox: https://threejs.org/docs/

Relevant official note:
- `computeBoundingBox()` computes and updates the geometry's `boundingBox` member.
- The bounding box is not computed automatically by the engine; the application must compute it when needed.

Implementation uses:
- object dimensions
- characteristic length
- automatic scale normalization
- wind tunnel domain size
- projected frontal area proxy
- camera framing
- object center

Recommended functions:
- `computeObjectBounds(object3D)`
- `centerObject(object3D)`
- `normalizeObjectScale(object3D, targetMaxDimension)`
- `estimateCharacteristicLength(bounds)`
- `estimateFrontalAreaProxy(bounds, windVector)`

Frontal area warning:
- Version 1 can use a bounding-box projection proxy.
- Do not label it as exact frontal area unless a real mesh projection algorithm is implemented.
