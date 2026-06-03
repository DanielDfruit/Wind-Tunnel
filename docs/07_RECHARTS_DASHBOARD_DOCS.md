# Recharts Dashboard Notes

Official reference:
- Recharts homepage/docs: https://recharts.org/

Useful facts:
- Recharts is a charting library built for React.
- It is suitable for line charts, area charts, bar charts, tooltips, and legends.
- It is a good fit for dashboard components in this app.

Implementation instruction:
- Use Recharts for live charts and parameter sweeps.
- Keep graph state separate from simulation state.
- Use a fixed-length rolling history for live charts so memory does not grow forever.
- Add export as PNG for graph panels if practical.

Required live graphs:
- air speed over time
- estimated drag force over time
- Reynolds number over time
- dynamic pressure over time
- wake intensity over time
- mean particle velocity over time
- turbulence proxy over time
- FPS over time

Required sweep graphs:
- drag force vs air speed
- Reynolds number vs air speed
- dynamic pressure vs air speed
- wake intensity vs yaw angle
- frontal area proxy vs yaw angle
