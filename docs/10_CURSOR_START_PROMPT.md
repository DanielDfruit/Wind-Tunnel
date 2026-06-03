# Cursor Start Prompt

Build the WindTunnel Studio app using the attached files.

Important:

1. `01_WINDTUNNEL_STUDIO_SPEC.md` is the controlling document.
2. Use the docs in `/docs` as implementation references.
3. Do not build a real CFD solver in version 1.
4. Do not pretend the results are validated CFD.
5. Build a polished approximate real-time 3D airflow visualizer with:
   - 3D object import
   - STL/OBJ support
   - animated airflow particles/streamlines
   - wind direction controls
   - speed and environment sliders
   - live statistics
   - live graphs and sweep graphs
   - PNG snapshot export
   - WebM video export
   - project save/load
   - built-in demo objects
6. Keep the code modular so a real OpenFOAM/SU2 backend could be added later.

Start by creating the project structure, package.json, and README. Then implement the minimum viable version before polishing.
