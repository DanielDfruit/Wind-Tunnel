# Basic Aerodynamics Formula Notes

Official references:
- NASA Glenn drag equation: https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/
- NASA Glenn drag coefficient: https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-coefficient/
- NASA Glenn Reynolds number: https://www.grc.nasa.gov/WWW/K-12/airplane/reynolds.html

Use these formulas for the statistics panel.

## Dynamic pressure

```txt
q = 0.5 * rho * v^2
```

Where:
- q = dynamic pressure
- rho = air density
- v = flow speed

## Drag force

```txt
D = Cd * 0.5 * rho * v^2 * A
```

Where:
- D = drag force
- Cd = drag coefficient
- rho = air density
- v = flow speed
- A = reference area / frontal area proxy

## Drag coefficient relationship

```txt
Cd = D / (q * A)
```

## Reynolds number

NASA gives Reynolds number in terms of velocity, characteristic length, and kinematic viscosity:

```txt
Re = V * L / nu
```

Since:

```txt
nu = mu / rho
```

The equivalent dynamic viscosity form is:

```txt
Re = rho * V * L / mu
```

Where:
- Re = Reynolds number
- rho = fluid density
- V = velocity
- L = characteristic length
- mu = dynamic viscosity
- nu = kinematic viscosity

## Implementation warning

These equations are real, but the app's frontal area, Cd, wake score, and pressure field are approximations in version 1. Label them clearly.
