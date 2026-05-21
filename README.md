# Peko Neko Experience

Interactive 3D landing page for **Peko Neko ramen** — a Three.js + React Three Fiber experience with physics-driven falling narutomaki, post-FX pipeline, and a long-press shake/visual effect combo on the hero model.

## Stack
- **Vite** + **React 19**
- **@react-three/fiber** + **@react-three/drei** (R3F renderer + helpers)
- **@react-three/rapier** (kinematic collider + dynamic falling particles)
- **@react-three/postprocessing** (Bloom, DOF, Vignette, DotScreen, Glitch, ...)
- **GSAP** (intro animations, press-FX easing, button micro-interactions)
- **Leva** (dev control panel — toggle with `C` once removed)

## Run

```bash
npm install
npm run dev          # http://localhost:5181
npm run build        # production bundle in /dist
npm run preview      # serve the built bundle
```

## Editing presets

All Leva-driven defaults live in [src/defaults.js](src/defaults.js).
Open `Export → Copy JSON` from the control panel, paste the JSON over the
`defaults` constant in that file, refresh.

## Key concepts

- **Hero** = `peko-neko.glb` mounted on a kinematic `<RigidBody>` driven each frame
  via `setNextKinematicTranslation/Rotation`. Mouse parallax + idle bob + press shake
  all compose into one transform.
- **Falling narutomaki** are dynamic rigid bodies with a `<CylinderCollider>`, recycled
  to the top when they pass `spawnBottom`.
- **Press FX** (long-press the cat) blends N postprocessing effects + a hero shake.
  Intensity is GSAP-tweened (`circ.in` on press → `circ.out` on release) and read
  via ref each frame (no React re-render per frame).
- **Button** opens the reservation page in a new tab.

## Deployed
[https://pekoneko.superbexperience.com/reserve/guests](https://pekoneko.superbexperience.com/reserve/guests) — booking target.
