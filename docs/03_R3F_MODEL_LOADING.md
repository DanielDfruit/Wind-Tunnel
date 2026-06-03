# React Three Fiber Model Loading Notes

Official reference:
- React Three Fiber loading models: https://r3f.docs.pmnd.rs/tutorials/loading-models

Useful facts:
- React Three Fiber can load common model formats using Three.js loaders.
- R3F examples focus on GLTF, FBX, and OBJ.
- For this app, support STL and OBJ first. GLTF/GLB is a bonus.
- Use loaders inside clean React components.
- Handle load errors gracefully.

Implementation instruction:
- Build a `ModelImporter` component.
- Build a `Viewport3D` component.
- Keep geometry normalization in a utility, not mixed into UI code.
- After importing, center the model, compute bounding box, estimate dimensions, and normalize scale.
