import React, { Suspense, useMemo, useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, Environment, OrbitControls, ContactShadows, Center, useProgress } from '@react-three/drei'

/* error boundary so a runtime error (postprocessing, rapier, gltf) doesn't
   silently blank the page — shows the message + lets you continue. */
class ErrorBoundary extends React.Component {
  constructor(p) {
    super(p)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('[PekoNeko] caught:', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: 'fixed', inset: 0, display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 24, background: '#000', color: '#fff',
            font: '13px/1.5 ui-monospace, monospace',
            textAlign: 'center', gap: 12, zIndex: 99999,
          }}
        >
          <div style={{ opacity: 0.6, letterSpacing: '0.2em' }}>RUNTIME ERROR</div>
          <pre style={{ maxWidth: 720, color: '#ff6e9c', whiteSpace: 'pre-wrap' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: '10px 24px', borderRadius: 999, background: '#fff', color: '#000',
              border: 'none', cursor: 'pointer', fontWeight: 700,
            }}
          >
            Try again
          </button>
          <div style={{ opacity: 0.4, fontSize: 11 }}>Full stack in DevTools console.</div>
        </div>
      )
    }
    return this.props.children
  }
}
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
  Noise,
  DepthOfField,
  BrightnessContrast,
  HueSaturation,
  ToneMapping,
  Pixelation,
  DotScreen,
  Glitch,
  Scanline,
  Sepia,
  ColorAverage,
} from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode, GlitchMode } from 'postprocessing'
import { Physics, RigidBody, BallCollider, CylinderCollider } from '@react-three/rapier'
import { useControls, folder, button } from 'leva'
import gsap from 'gsap'

import FallingField from './FallingField.jsx'
import RamenEgg, { useRamenEggResources } from './shapes/RamenEgg.jsx'
import Narutomaki, { useNarutomakiResources } from './shapes/Narutomaki.jsx'
import CoolButton from './CoolButton.jsx'
import { defaults as D } from './defaults.js'

useGLTF.preload('/models/peko-neko.glb')

/* ============================================================
   Hero rig — kinematic body w/ trimesh collider + tilt/idle bob
   + pointer handlers for long-press FX.
   ============================================================ */
function HeroRig({ hero, pressFx, pressState, onPress, playIntro }) {
  const rbRef = useRef(null)
  const { mouse } = useThree()
  const { scene } = useGLTF('/models/peko-neko.glb')
  const cloned = useMemo(() => scene.clone(true), [scene])
  const tilt = useRef({ x: 0, y: 0 })
  const _e = useRef(new THREE.Euler())
  const _q = useRef(new THREE.Quaternion())
  /* intro drop-in stays at +6 (offscreen) until `playIntro` flips true,
     then animates to 0 in 1.5s circ.out. */
  const intro = useRef({ y: 6 })

  useEffect(() => {
    if (!playIntro) return
    intro.current.y = 6
    const tw = gsap.to(intro.current, {
      y: 0,
      duration: 1.5,
      ease: 'circ.out',
      overwrite: true,
    })
    return () => tw.kill()
  }, [playIntro])

  useFrame((state, dt) => {
    if (!rbRef.current) return
    const t = state.clock.elapsedTime

    const tMaxX = THREE.MathUtils.degToRad(hero.tiltX)
    const tMaxY = THREE.MathUtils.degToRad(hero.tiltY)
    const wantX = -mouse.y * tMaxX * hero.tiltStrength
    const wantY = mouse.x * tMaxY * hero.tiltStrength
    const k = 1 - Math.pow(1 - hero.tiltDamping, dt * 60)
    tilt.current.x += (wantX - tilt.current.x) * k
    tilt.current.y += (wantY - tilt.current.y) * k

    const bobY = Math.sin(t * hero.idleFreq) * hero.idleAmpY
    const bobX = Math.sin(t * hero.idleFreq * 0.6 + 1.3) * hero.idleAmpX

    /* ─── press shake — modulated by pressState.progress.t (0..1) ─── */
    let shakePX = 0, shakePY = 0, shakePZ = 0
    let shakeRX = 0, shakeRY = 0, shakeRZ = 0
    if (pressFx.shakeOn) {
      const pt = pressState.current.progress.t
      const f = pressFx.shakeFreq
      const sw = pressFx.shakeSwing
      const n1 = Math.sin(t * f * 2.3) * Math.cos(t * f * 1.7 * sw)
      const n2 = Math.sin(t * f * 3.1) * Math.cos(t * f * 2.7 * sw)
      const n3 = Math.sin(t * f * 1.9) * Math.cos(t * f * 3.3 * sw)
      shakePX = n1 * pressFx.shakePosIntensity * pt
      shakePY = n2 * pressFx.shakePosIntensity * pt
      shakePZ = n3 * pressFx.shakePosIntensity * pt * 0.3
      shakeRX = n2 * pressFx.shakeRotIntensity * pt
      shakeRY = n3 * pressFx.shakeRotIntensity * pt
      shakeRZ = n1 * pressFx.shakeRotIntensity * pt * 0.5
    }

    rbRef.current.setNextKinematicTranslation({
      x: hero.posX + bobX + shakePX,
      y: hero.posY + bobY + intro.current.y + shakePY,
      z: hero.posZ + shakePZ,
    })
    _e.current.set(
      hero.rotX + tilt.current.x + shakeRX,
      hero.rotY + tilt.current.y + shakeRY,
      hero.rotZ + shakeRZ
    )
    _q.current.setFromEuler(_e.current)
    rbRef.current.setNextKinematicRotation(_q.current)
  })

  /* NB: no `key` based on scale — that would unmount + rebuild the trimesh
     from the 15 MB GLB on every slider step → crash/freeze. Collider is
     built once with a convex hull (cheap, scale-agnostic visual offset). */
  return (
    <RigidBody
      ref={rbRef}
      type="kinematicPosition"
      colliders="hull"
      friction={0.6}
      restitution={0.25}
    >
      <Center>
        <primitive
          object={cloned}
          scale={hero.scale}
          onPointerDown={(e) => {
            e.stopPropagation()
            onPress(true)
          }}
          onPointerUp={(e) => {
            e.stopPropagation()
            onPress(false)
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={(e) => {
            e.stopPropagation()
            document.body.style.cursor = ''
          }}
        />
      </Center>
    </RigidBody>
  )
}

/* ============================================================
   Custom GLB egg (clones per particle)
   ============================================================ */
function CustomGLBEgg({ path }) {
  const { scene } = useGLTF(path)
  const cloned = useMemo(() => scene.clone(true), [scene])
  return <primitive object={cloned} />
}

/* ============================================================
   Press FX — driven by `pressState.progress.t` (0..1 GSAP-tweened).
   Strategy:
     - Reactive React state `t` (throttled @ Δ > 0.01) → drives JSX
       props on effects that respect them (Pixelation.granularity,
       Sepia.intensity, Bloom.intensity, HueSaturation.saturation,
       ChromaticAberration.offset).
     - `blendMode.opacity` set via ref each frame as a safety net
       for effects whose props aren't reactive (DotScreen, Scanline).
   ============================================================ */
/* drives ALL active press effects each frame.
   `refs.current` is a map of { effectKey: instance } populated by callback refs.
   Each active effect gets its own per-key mutation; blendMode.opacity is the
   universal fade. NO useState — pure ref-mutation = no re-render loops. */
function usePressEffectDriver(refs, pressFx, pressState) {
  useFrame(() => {
    try {
      const t = THREE.MathUtils.clamp(pressState.current.progress.t * pressFx.maxStrength, 0, 1)

      const apply = (key, fn) => {
        const e = refs.current[key]
        if (!e) return
        if (e.blendMode && e.blendMode.opacity) e.blendMode.opacity.value = t
        try { fn(e, t) } catch {}
      }

      if (pressFx.pixelateOn)
        apply('pixelate', (e) => { if ('granularity' in e) e.granularity = 1 + t * 28 })
      if (pressFx.bloomburstOn)
        apply('bloomburst', (e) => { if ('intensity' in e) e.intensity = t * 3.2 })
      if (pressFx.dotscreenOn)
        apply('dotscreen', (e) => {
          const u = e.uniforms?.get?.('scale')
          if (u) u.value = 0.5 + t * 1.0
        })
      if (pressFx.scanlineOn)
        apply('scanline', (e) => { if ('density' in e) e.density = t * 1.6 })
      if (pressFx.desaturateOn)
        apply('desaturate', (e) => {
          const u = e.uniforms?.get?.('saturation')
          if (u) u.value = -t
        })
      if (pressFx.chromaburstOn)
        apply('chromaburst', (e) => {
          const o = e.uniforms?.get?.('offset')
          if (o?.value?.set) o.value.set(t * 0.012, t * 0.012)
        })
      if (pressFx.glitchOn)
        apply('glitch', (e) => {
          if ('mode' in e) e.mode = t > 0.08 ? GlitchMode.SPORADIC : GlitchMode.DISABLED
        })
      if (pressFx.sepiaOn) apply('sepia', () => {})
      if (pressFx.colorAverageOn) apply('colorAverage', () => {})
      if (pressFx.noiseBurstOn) apply('noiseBurst', () => {})
    } catch (err) {
      /* never crash the loop */
    }
  })
}

/* ============================================================
   Post FX — keyed by the SET of enabled effects so rebuilds
   cleanly when toggles change. Slider values stay reactive.
   ============================================================ */
function PostFX({ fx, pressFx, pressState }) {
  if (!fx.enabled) return null
  const pipelineKey = [
    fx.dofOn ? 'd' : '',
    fx.bloomOn ? 'b' : '',
    fx.chromaOn ? 'c' : '',
    fx.gradeOn ? 'g' : '',
    fx.vignetteOn ? 'v' : '',
    fx.noiseOn ? 'n' : '',
    pressFx.pixelateOn ? 'pP' : '',
    pressFx.dotscreenOn ? 'pD' : '',
    pressFx.glitchOn ? 'pG' : '',
    pressFx.scanlineOn ? 'pS' : '',
    pressFx.sepiaOn ? 'pSe' : '',
    pressFx.desaturateOn ? 'pDe' : '',
    pressFx.bloomburstOn ? 'pB' : '',
    pressFx.chromaburstOn ? 'pC' : '',
    pressFx.colorAverageOn ? 'pCa' : '',
    pressFx.noiseBurstOn ? 'pN' : '',
  ].join('|')

  /* per-effect callback refs — functions are skipped by JSON.stringify so
     they don't trigger the circular-structure crash inside the postprocessing
     generic effect wrapper. Stored in a single map for the driver to read. */
  const pressRefs = useRef({})
  const setters = useMemo(() => ({
    pixelate: (e) => { pressRefs.current.pixelate = e },
    dotscreen: (e) => { pressRefs.current.dotscreen = e },
    glitch: (e) => { pressRefs.current.glitch = e },
    scanline: (e) => { pressRefs.current.scanline = e },
    sepia: (e) => { pressRefs.current.sepia = e },
    desaturate: (e) => { pressRefs.current.desaturate = e },
    bloomburst: (e) => { pressRefs.current.bloomburst = e },
    chromaburst: (e) => { pressRefs.current.chromaburst = e },
    colorAverage: (e) => { pressRefs.current.colorAverage = e },
    noiseBurst: (e) => { pressRefs.current.noiseBurst = e },
  }), [])

  usePressEffectDriver(pressRefs, pressFx, pressState)

  return (
    <EffectComposer key={pipelineKey} multisampling={4} disableNormalPass>
      {fx.dofOn ? (
        <DepthOfField focusDistance={fx.dofFocus} focalLength={fx.dofLength} bokehScale={fx.dofBokeh} />
      ) : null}
      {fx.bloomOn ? (
        <Bloom
          intensity={fx.bloomIntensity}
          luminanceThreshold={fx.bloomThreshold}
          luminanceSmoothing={fx.bloomSmoothing}
          mipmapBlur
        />
      ) : null}
      {fx.chromaOn ? (
        <ChromaticAberration offset={[fx.chromaOffset, fx.chromaOffset]} blendFunction={BlendFunction.NORMAL} />
      ) : null}
      {fx.gradeOn ? <HueSaturation hue={fx.hueShift} saturation={fx.saturation} /> : null}
      {fx.gradeOn ? <BrightnessContrast brightness={fx.brightness} contrast={fx.contrast} /> : null}
      {fx.vignetteOn ? <Vignette eskil={false} offset={fx.vignetteOffset} darkness={fx.vignetteDark} /> : null}
      {fx.noiseOn ? <Noise opacity={fx.noiseOpacity} premultiply blendFunction={BlendFunction.OVERLAY} /> : null}

      {/* press effects — all can be active at the same time, blended */}
      {pressFx.pixelateOn ? <Pixelation ref={setters.pixelate} granularity={1} /> : null}
      {pressFx.dotscreenOn ? <DotScreen ref={setters.dotscreen} angle={1.57} scale={0.5} /> : null}
      {pressFx.glitchOn ? (
        <Glitch
          ref={setters.glitch}
          delay={[0.1, 0.4]}
          duration={[0.1, 0.25]}
          strength={[0.3, 0.7]}
          mode={GlitchMode.DISABLED}
          ratio={0.85}
          active
        />
      ) : null}
      {pressFx.scanlineOn ? (
        <Scanline ref={setters.scanline} density={0} blendFunction={BlendFunction.OVERLAY} />
      ) : null}
      {pressFx.sepiaOn ? <Sepia ref={setters.sepia} intensity={1} /> : null}
      {pressFx.desaturateOn ? <HueSaturation ref={setters.desaturate} saturation={0} /> : null}
      {pressFx.bloomburstOn ? (
        <Bloom ref={setters.bloomburst} intensity={0} luminanceThreshold={0.15} luminanceSmoothing={0.4} mipmapBlur />
      ) : null}
      {pressFx.chromaburstOn ? (
        <ChromaticAberration ref={setters.chromaburst} offset={[0, 0]} blendFunction={BlendFunction.NORMAL} />
      ) : null}
      {pressFx.colorAverageOn ? (
        <ColorAverage ref={setters.colorAverage} blendFunction={BlendFunction.NORMAL} />
      ) : null}
      {pressFx.noiseBurstOn ? (
        <Noise ref={setters.noiseBurst} opacity={0.6} premultiply blendFunction={BlendFunction.OVERLAY} />
      ) : null}

      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}

/* ============================================================
   App
   ============================================================ */
export default function App() {
  /* ─── Scene ─── */
  const scene = useControls('Scene', {
    bg: { value: D.scene.bg, label: 'background' },
    envPreset: {
      value: D.scene.envPreset,
      label: 'env',
      options: ['city', 'studio', 'sunset', 'dawn', 'night', 'warehouse', 'forest', 'apartment', 'park', 'lobby'],
    },
    envIntensity: { value: D.scene.envIntensity, min: 0, max: 3, step: 0.05, label: 'env intensity' },
    fov: { value: D.scene.fov, min: 15, max: 90, step: 1 },
    Shadows: folder(
      {
        showShadows: { value: D.scene.showShadows, label: 'enabled' },
        shadowOpacity: { value: D.scene.shadowOpacity, min: 0, max: 1, step: 0.01, label: 'opacity' },
        shadowBlur: { value: D.scene.shadowBlur, min: 0, max: 10, step: 0.1, label: 'blur' },
      },
      { collapsed: true }
    ),
  })

  /* ─── Background gradient ─── */
  const gradient = useControls('Background gradient', {
    enabled: { value: D.gradient.enabled, label: 'use gradient' },
    color1: { value: D.gradient.color1, label: 'color A' },
    color2: { value: D.gradient.color2, label: 'color B' },
    angle: { value: D.gradient.angle, min: 0, max: 360, step: 1, label: 'angle (°)' },
  })

  /* ─── Camera ─── */
  const orbit = useControls('Camera', {
    enabled: { value: D.orbit.enabled, label: 'orbit' },
    azimuthRangeDeg: { value: D.orbit.azimuthRangeDeg, min: 0, max: 180, step: 1, label: 'left ↔ right (°)' },
    polarRangeUpDeg: { value: D.orbit.polarRangeUpDeg, min: 0, max: 90, step: 1, label: 'up (°)' },
    polarRangeDownDeg: { value: D.orbit.polarRangeDownDeg, min: 0, max: 90, step: 1, label: 'down (°)' },
    damping: { value: D.orbit.damping, min: 0, max: 0.3, step: 0.005 },
    Auto: folder(
      {
        autoRotate: { value: D.orbit.autoRotate, label: 'auto-rotate' },
        autoRotateSpeed: { value: D.orbit.autoRotateSpeed, min: -4, max: 4, step: 0.05, label: 'speed' },
      },
      { collapsed: true }
    ),
  })

  /* ─── Hero ─── */
  const hero = useControls('Hero', {
    scale: { value: D.hero.scale, min: 0.05, max: 4, step: 0.005 },
    'Mouse parallax': folder({
      tiltX: { value: D.hero.tiltX, min: 0, max: 25, step: 0.5, label: 'tilt up/down (°)' },
      tiltY: { value: D.hero.tiltY, min: 0, max: 25, step: 0.5, label: 'tilt left/right (°)' },
      tiltStrength: { value: D.hero.tiltStrength, min: 0, max: 2, step: 0.01, label: 'strength' },
      tiltDamping: { value: D.hero.tiltDamping, min: 0.01, max: 0.3, step: 0.005, label: 'damping' },
    }),
    'Idle motion': folder({
      idleAmpY: { value: D.hero.idleAmpY, min: 0, max: 0.5, step: 0.005, label: 'amp ↕' },
      idleAmpX: { value: D.hero.idleAmpX, min: 0, max: 0.5, step: 0.005, label: 'amp ↔' },
      idleFreq: { value: D.hero.idleFreq, min: 0, max: 3, step: 0.01, label: 'speed' },
    }),
    Transform: folder(
      {
        posX: { value: D.hero.posX, min: -3, max: 3, step: 0.01 },
        posY: { value: D.hero.posY, min: -3, max: 3, step: 0.01 },
        posZ: { value: D.hero.posZ, min: -3, max: 3, step: 0.01 },
        rotX: { value: D.hero.rotX, min: -Math.PI, max: Math.PI, step: 0.01 },
        rotY: { value: D.hero.rotY, min: -Math.PI, max: Math.PI, step: 0.01 },
        rotZ: { value: D.hero.rotZ, min: -Math.PI, max: Math.PI, step: 0.01 },
      },
      { collapsed: true }
    ),
  })

  /* ─── Physics ─── */
  const physics = useControls('Physics', {
    enabled: { value: D.physics.enabled, label: 'enabled' },
    gravity: { value: D.physics.gravity, min: -12, max: 0, step: 0.05 },
    debug: { value: D.physics.debug, label: 'show colliders' },
  })

  /* ─── Press FX (multi-effect blend + hero shake) ─── */
  const pressFx = useControls('Press FX (long-press hero)', {
    maxStrength: { value: D.pressFx.maxStrength, min: 0, max: 2, step: 0.01, label: 'global strength' },
    durationIn: { value: D.pressFx.durationIn, min: 0.05, max: 6, step: 0.05, label: 'press circ.in (s)' },
    durationOut: { value: D.pressFx.durationOut, min: 0.05, max: 6, step: 0.05, label: 'release circ.out (s)' },
    Shake: folder({
      shakeOn: { value: D.pressFx.shakeOn, label: 'enabled' },
      shakePosIntensity: {
        value: D.pressFx.shakePosIntensity, min: 0, max: 0.5, step: 0.005, label: 'position amp',
        render: (get) => get('Press FX (long-press hero).Shake.shakeOn'),
      },
      shakeRotIntensity: {
        value: D.pressFx.shakeRotIntensity, min: 0, max: 0.5, step: 0.005, label: 'rotation amp',
        render: (get) => get('Press FX (long-press hero).Shake.shakeOn'),
      },
      shakeFreq: {
        value: D.pressFx.shakeFreq, min: 0.5, max: 30, step: 0.1, label: 'frequency',
        render: (get) => get('Press FX (long-press hero).Shake.shakeOn'),
      },
      shakeSwing: {
        value: D.pressFx.shakeSwing, min: 0.1, max: 4, step: 0.05, label: 'swing',
        render: (get) => get('Press FX (long-press hero).Shake.shakeOn'),
      },
    }),
    'Visual effects (toggle any combo)': folder({
      pixelateOn: { value: D.pressFx.pixelateOn, label: '🔲 pixelate' },
      dotscreenOn: { value: D.pressFx.dotscreenOn, label: '⚫ dot screen' },
      glitchOn: { value: D.pressFx.glitchOn, label: '⚡ glitch' },
      scanlineOn: { value: D.pressFx.scanlineOn, label: '📺 scanline' },
      sepiaOn: { value: D.pressFx.sepiaOn, label: '🟤 sepia' },
      desaturateOn: { value: D.pressFx.desaturateOn, label: '⚪ desaturate' },
      bloomburstOn: { value: D.pressFx.bloomburstOn, label: '✨ bloom burst' },
      chromaburstOn: { value: D.pressFx.chromaburstOn, label: '🌈 chroma burst' },
      colorAverageOn: { value: D.pressFx.colorAverageOn, label: '◐ color avg' },
      noiseBurstOn: { value: D.pressFx.noiseBurstOn, label: '🎞 noise burst' },
    }),
  })

  /* ─── Eggs ─── */
  const eggs = useControls('Eggs', {
    enabled: { value: D.eggs.enabled, label: 'enabled' },
    count: { value: D.eggs.count, min: 0, max: 60, step: 1 },
    shuffle: button(() => setEggSeed(Math.random())),
    'Custom GLB': folder(
      {
        useCustomGLB: { value: D.eggs.useCustomGLB, label: 'use custom mesh' },
        customGLBPath: { value: D.eggs.customGLBPath, label: 'path' },
        customColliderRadius: { value: D.eggs.customColliderRadius, min: 0.1, max: 2, step: 0.01, label: 'collider radius' },
      },
      { collapsed: true }
    ),
    'Fall / motion': folder({
      spreadX: { value: D.eggs.spreadX, min: 0, max: 12, step: 0.1 },
      spreadZ: { value: D.eggs.spreadZ, min: 0, max: 12, step: 0.1 },
      spawnTop: { value: D.eggs.spawnTop, min: 1, max: 12, step: 0.1, label: 'spawn ↑' },
      spawnBottom: { value: D.eggs.spawnBottom, min: -12, max: -0.5, step: 0.1, label: 'recycle ↓' },
      scaleMin: { value: D.eggs.scaleMin, min: 0.05, max: 2, step: 0.01 },
      scaleMax: { value: D.eggs.scaleMax, min: 0.05, max: 2, step: 0.01 },
      fallSpeedMin: { value: D.eggs.fallSpeedMin, min: 0, max: 2, step: 0.01, label: 'init fall ↓ min' },
      fallSpeedMax: { value: D.eggs.fallSpeedMax, min: 0, max: 2, step: 0.01, label: 'init fall ↓ max' },
      spinMin: { value: D.eggs.spinMin, min: 0, max: 4, step: 0.01, label: 'spin min' },
      spinMax: { value: D.eggs.spinMax, min: 0, max: 4, step: 0.01, label: 'spin max' },
    }),
    'Body / physics': folder(
      {
        restitution: { value: D.eggs.restitution, min: 0, max: 1, step: 0.01, label: 'bounce' },
        friction: { value: D.eggs.friction, min: 0, max: 2, step: 0.01 },
        mass: { value: D.eggs.mass, min: 0.01, max: 2, step: 0.01 },
        linearDamping: { value: D.eggs.linearDamping, min: 0, max: 2, step: 0.01, label: 'lin. damp' },
        angularDamping: { value: D.eggs.angularDamping, min: 0, max: 2, step: 0.01, label: 'ang. damp' },
      },
      { collapsed: true }
    ),
    'Shape (procedural)': folder(
      {
        lengthA: { value: D.eggs.lengthA, min: 0.2, max: 1.2, step: 0.01, label: 'length' },
        widthB: { value: D.eggs.widthB, min: 0.15, max: 0.9, step: 0.01, label: 'width' },
        eggness: { value: D.eggs.eggness, min: 0, max: 0.8, step: 0.01, label: 'asymmetry' },
        yolkRadius: { value: D.eggs.yolkRadius, min: 0.04, max: 0.4, step: 0.005, label: 'yolk radius' },
        yolkBulge: { value: D.eggs.yolkBulge, min: 0, max: 1.2, step: 0.01, label: 'yolk bulge' },
        yolkOffsetY: { value: D.eggs.yolkOffsetY, min: -0.4, max: 0.4, step: 0.005, label: 'yolk shift' },
      },
      { collapsed: true }
    ),
    'Material (procedural)': folder(
      {
        whiteColor: { value: D.eggs.whiteColor, label: 'white' },
        capColor: { value: D.eggs.capColor, label: 'cut face' },
        yolkColor: { value: D.eggs.yolkColor, label: 'yolk' },
        yolkEmissive: { value: D.eggs.yolkEmissive, label: 'yolk glow' },
        yolkEmissiveIntensity: { value: D.eggs.yolkEmissiveIntensity, min: 0, max: 2, step: 0.01, label: 'glow' },
        yolkRoughness: { value: D.eggs.yolkRoughness, min: 0, max: 1, step: 0.01, label: 'yolk rough' },
        roughness: { value: D.eggs.roughness, min: 0, max: 1, step: 0.01 },
        metalness: { value: D.eggs.metalness, min: 0, max: 1, step: 0.01 },
      },
      { collapsed: true }
    ),
  })

  /* ─── Narutomaki ─── */
  const naruto = useControls('Narutomaki', {
    enabled: { value: D.naruto.enabled, label: 'enabled' },
    count: { value: D.naruto.count, min: 0, max: 60, step: 1 },
    shuffle: button(() => setNarutoSeed(Math.random())),
    'Fall / motion': folder({
      spreadX: { value: D.naruto.spreadX, min: 0, max: 12, step: 0.1 },
      spreadZ: { value: D.naruto.spreadZ, min: 0, max: 12, step: 0.1 },
      spawnTop: { value: D.naruto.spawnTop, min: 1, max: 12, step: 0.1, label: 'spawn ↑' },
      spawnBottom: { value: D.naruto.spawnBottom, min: -12, max: -0.5, step: 0.1, label: 'recycle ↓' },
      scaleMin: { value: D.naruto.scaleMin, min: 0.05, max: 2, step: 0.01 },
      scaleMax: { value: D.naruto.scaleMax, min: 0.05, max: 2, step: 0.01 },
      fallSpeedMin: { value: D.naruto.fallSpeedMin, min: 0, max: 2, step: 0.01, label: 'init fall ↓ min' },
      fallSpeedMax: { value: D.naruto.fallSpeedMax, min: 0, max: 2, step: 0.01, label: 'init fall ↓ max' },
      spinMin: { value: D.naruto.spinMin, min: 0, max: 4, step: 0.01, label: 'spin min' },
      spinMax: { value: D.naruto.spinMax, min: 0, max: 4, step: 0.01, label: 'spin max' },
    }),
    'Body / physics': folder(
      {
        restitution: { value: D.naruto.restitution, min: 0, max: 1, step: 0.01, label: 'bounce' },
        friction: { value: D.naruto.friction, min: 0, max: 2, step: 0.01 },
        mass: { value: D.naruto.mass, min: 0.01, max: 2, step: 0.01 },
        linearDamping: { value: D.naruto.linearDamping, min: 0, max: 2, step: 0.01, label: 'lin. damp' },
        angularDamping: { value: D.naruto.angularDamping, min: 0, max: 2, step: 0.01, label: 'ang. damp' },
      },
      { collapsed: true }
    ),
    Shape: folder(
      {
        points: { value: D.naruto.points, min: 4, max: 20, step: 1, label: 'star points' },
        baseRadius: { value: D.naruto.baseRadius, min: 0.15, max: 1.2, step: 0.005, label: 'radius' },
        petalDepth: { value: D.naruto.petalDepth, min: 0, max: 0.5, step: 0.005, label: 'petal depth' },
        petalSharpness: { value: D.naruto.petalSharpness, min: 0.3, max: 4, step: 0.05, label: 'sharpness' },
        thickness: { value: D.naruto.thickness, min: 0.02, max: 0.4, step: 0.005 },
        bevelSize: { value: D.naruto.bevelSize, min: 0, max: 0.2, step: 0.002 },
        bevelThickness: { value: D.naruto.bevelThickness, min: 0, max: 0.2, step: 0.002 },
        bevelSegments: { value: D.naruto.bevelSegments, min: 1, max: 10, step: 1 },
      },
      { collapsed: true }
    ),
    'Spiral / material': folder(
      {
        spiralRadiusFrac: { value: D.naruto.spiralRadiusFrac, min: 0.1, max: 0.95, step: 0.01, label: 'spiral size' },
        turns: { value: D.naruto.turns, min: 1, max: 8, step: 0.1 },
        lineWidth: { value: D.naruto.lineWidth, min: 4, max: 60, step: 1, label: 'spiral width' },
        pink: { value: D.naruto.pink, label: 'spiral color' },
        white: { value: D.naruto.white, label: 'cap white' },
        sideColor: { value: D.naruto.sideColor, label: 'side' },
        roughness: { value: D.naruto.roughness, min: 0, max: 1, step: 0.01 },
        metalness: { value: D.naruto.metalness, min: 0, max: 1, step: 0.01 },
      },
      { collapsed: true }
    ),
  })

  /* ─── Lights ─── */
  const lights = useControls('Lights', {
    ambient: { value: D.lights.ambient, min: 0, max: 3, step: 0.01 },
    Key: folder({
      keyIntensity: { value: D.lights.keyIntensity, min: 0, max: 6, step: 0.05, label: 'intensity' },
      keyColor: { value: D.lights.keyColor, label: 'color' },
      keyX: { value: D.lights.keyX, min: -10, max: 10, step: 0.1, label: 'X' },
      keyY: { value: D.lights.keyY, min: -10, max: 10, step: 0.1, label: 'Y' },
      keyZ: { value: D.lights.keyZ, min: -10, max: 10, step: 0.1, label: 'Z' },
    }),
    Rim: folder({
      rimIntensity: { value: D.lights.rimIntensity, min: 0, max: 6, step: 0.05, label: 'intensity' },
      rimColor: { value: D.lights.rimColor, label: 'color' },
    }),
  })

  /* ─── Post FX ─── */
  const fx = useControls('Post FX', {
    enabled: { value: D.fx.enabled, label: 'master' },
    Bloom: folder({
      bloomOn: { value: D.fx.bloomOn, label: 'on' },
      bloomIntensity: {
        value: D.fx.bloomIntensity, min: 0, max: 3, step: 0.01, label: 'intensity',
        render: (get) => get('Post FX.Bloom.bloomOn'),
      },
      bloomThreshold: {
        value: D.fx.bloomThreshold, min: 0, max: 1, step: 0.01, label: 'threshold',
        render: (get) => get('Post FX.Bloom.bloomOn'),
      },
      bloomSmoothing: {
        value: D.fx.bloomSmoothing, min: 0, max: 1, step: 0.01, label: 'smoothing',
        render: (get) => get('Post FX.Bloom.bloomOn'),
      },
    }),
    'Depth of Field': folder({
      dofOn: { value: D.fx.dofOn, label: 'on' },
      dofFocus: {
        value: D.fx.dofFocus, min: 0, max: 0.05, step: 0.0005, label: 'focus depth',
        render: (get) => get('Post FX.Depth of Field.dofOn'),
      },
      dofLength: {
        value: D.fx.dofLength, min: 0, max: 0.15, step: 0.001, label: 'focal length',
        render: (get) => get('Post FX.Depth of Field.dofOn'),
      },
      dofBokeh: {
        value: D.fx.dofBokeh, min: 0, max: 12, step: 0.1, label: 'bokeh scale',
        render: (get) => get('Post FX.Depth of Field.dofOn'),
      },
    }),
    'Chromatic Aberration': folder({
      chromaOn: { value: D.fx.chromaOn, label: 'on' },
      chromaOffset: {
        value: D.fx.chromaOffset, min: 0, max: 0.012, step: 0.0001, label: 'offset',
        render: (get) => get('Post FX.Chromatic Aberration.chromaOn'),
      },
    }),
    Grade: folder({
      gradeOn: { value: D.fx.gradeOn, label: 'on' },
      brightness: {
        value: D.fx.brightness, min: -0.5, max: 0.5, step: 0.01,
        render: (get) => get('Post FX.Grade.gradeOn'),
      },
      contrast: {
        value: D.fx.contrast, min: -0.5, max: 0.5, step: 0.01,
        render: (get) => get('Post FX.Grade.gradeOn'),
      },
      saturation: {
        value: D.fx.saturation, min: -1, max: 1, step: 0.01,
        render: (get) => get('Post FX.Grade.gradeOn'),
      },
      hueShift: {
        value: D.fx.hueShift, min: -Math.PI, max: Math.PI, step: 0.01, label: 'hue',
        render: (get) => get('Post FX.Grade.gradeOn'),
      },
    }),
    Vignette: folder({
      vignetteOn: { value: D.fx.vignetteOn, label: 'on' },
      vignetteOffset: {
        value: D.fx.vignetteOffset, min: 0, max: 1, step: 0.01, label: 'offset',
        render: (get) => get('Post FX.Vignette.vignetteOn'),
      },
      vignetteDark: {
        value: D.fx.vignetteDark, min: 0, max: 1, step: 0.01, label: 'darkness',
        render: (get) => get('Post FX.Vignette.vignetteOn'),
      },
    }),
    Noise: folder({
      noiseOn: { value: D.fx.noiseOn, label: 'on' },
      noiseOpacity: {
        value: D.fx.noiseOpacity, min: 0, max: 0.4, step: 0.005, label: 'opacity',
        render: (get) => get('Post FX.Noise.noiseOn'),
      },
    }),
  })

  /* ─── Button ─── */
  const buttonStyle = useControls('Button', {
    label: { value: D.buttonStyle.label },
    bg: { value: D.buttonStyle.bg, label: 'background' },
    text: { value: D.buttonStyle.text, label: 'text' },
    border: { value: D.buttonStyle.border, label: 'border' },
    hoverBg: { value: D.buttonStyle.hoverBg, label: 'hover bg' },
    hoverText: { value: D.buttonStyle.hoverText, label: 'hover text' },
    fontSize: { value: D.buttonStyle.fontSize, min: 12, max: 40, step: 1, label: 'font size' },
    paddingX: { value: D.buttonStyle.paddingX, min: 16, max: 120, step: 1, label: 'pad X' },
    paddingY: { value: D.buttonStyle.paddingY, min: 8, max: 48, step: 1, label: 'pad Y' },
    radius: { value: D.buttonStyle.radius, min: 0, max: 999, step: 1, label: 'corner radius' },
    staggerEach: { value: D.buttonStyle.staggerEach, min: 0, max: 0.2, step: 0.005, label: 'stagger (s)' },
  })

  /* ─── Export ─── */
  const stateRef = useRef({})
  stateRef.current = { scene, gradient, orbit, hero, physics, eggs, naruto, lights, fx, pressFx, buttonStyle }

  useControls('Export', {
    'Copy JSON to clipboard': button(() => {
      const json = JSON.stringify(stateRef.current, null, 2)
      navigator.clipboard?.writeText(json).then(
        () => console.log('✓ copied\n' + json),
        () => console.log(json)
      )
    }),
    'Download JSON file': button(() => {
      const json = JSON.stringify(stateRef.current, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `peko-neko-${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }),
  })

  /* shared shape resources */
  const eggResources = useRamenEggResources({
    whiteColor: eggs.whiteColor, capColor: eggs.capColor,
    yolkColor: eggs.yolkColor, yolkEmissive: eggs.yolkEmissive,
    yolkEmissiveIntensity: eggs.yolkEmissiveIntensity,
    yolkRoughness: eggs.yolkRoughness,
    roughness: eggs.roughness, metalness: eggs.metalness,
    lengthA: eggs.lengthA, widthB: eggs.widthB, eggness: eggs.eggness,
    yolkRadius: eggs.yolkRadius, yolkBulge: eggs.yolkBulge, yolkOffsetY: eggs.yolkOffsetY,
  })
  const narutoResources = useNarutomakiResources({
    pink: naruto.pink, white: naruto.white, sideColor: naruto.sideColor,
    turns: naruto.turns, lineWidth: naruto.lineWidth, spiralRadiusFrac: naruto.spiralRadiusFrac,
    points: naruto.points, baseRadius: naruto.baseRadius,
    petalDepth: naruto.petalDepth, petalSharpness: naruto.petalSharpness,
    thickness: naruto.thickness, bevelSize: naruto.bevelSize,
    bevelThickness: naruto.bevelThickness, bevelSegments: naruto.bevelSegments,
    roughness: naruto.roughness, metalness: naruto.metalness,
  })

  const [eggSeed, setEggSeed] = useState(1)
  const [narutoSeed, setNarutoSeed] = useState(1)

  /* press tween */
  const pressState = useRef({ progress: { t: 0 } })
  const pressFxRef = useRef(pressFx)
  pressFxRef.current = pressFx
  const triggerPress = useMemo(
    () => (pressed) => {
      const cfg = pressFxRef.current
      gsap.killTweensOf(pressState.current.progress)
      gsap.to(pressState.current.progress, {
        t: pressed ? 1 : 0,
        duration: pressed ? cfg.durationIn : cfg.durationOut,
        ease: pressed ? 'circ.in' : 'circ.out',
        overwrite: true,
      })
    },
    []
  )

  /* truthful loading gate — uses drei's useProgress to know when ALL
     useLoader/useGLTF assets have actually resolved + first paint settled. */
  const { progress, active } = useProgress()
  const [overlayHidden, setOverlayHidden] = useState(false)
  const [playIntro, setPlayIntro] = useState(false)

  useEffect(() => {
    if (active || progress < 100) return
    /* small grace period so the GLB has reached the GPU + first frame painted */
    const tFade = setTimeout(() => setOverlayHidden(true), 250)
    /* start the intro AFTER the overlay starts fading so the user sees
       the cat drop from above against the now-visible scene */
    const tIntro = setTimeout(() => setPlayIntro(true), 750)
    return () => {
      clearTimeout(tFade)
      clearTimeout(tIntro)
    }
  }, [active, progress])

  /* global pointer-up so release fires even if user drags off the cat */
  useEffect(() => {
    const onUp = () => triggerPress(false)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('blur', onUp)
    return () => {
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('blur', onUp)
    }
  }, [triggerPress])


  const azR = THREE.MathUtils.degToRad(orbit.azimuthRangeDeg)
  const polUp = THREE.MathUtils.degToRad(orbit.polarRangeUpDeg)
  const polDown = THREE.MathUtils.degToRad(orbit.polarRangeDownDeg)

  const wrapperBg = gradient.enabled
    ? `linear-gradient(${gradient.angle}deg, ${gradient.color1} 0%, ${gradient.color2} 100%)`
    : scene.bg

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: wrapperBg,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
        overscrollBehavior: 'none',
      }}
    >

      <ErrorBoundary>
      <Canvas
        shadows
        camera={{ position: [0, 0.4, 5.2], fov: scene.fov }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            console.warn('WebGL context lost', e)
            e.preventDefault()
          })
          gl.domElement.addEventListener('webglcontextrestored', () => {
            console.warn('WebGL context restored')
          })
        }}
      >
        {!gradient.enabled && <color attach="background" args={[scene.bg]} />}

        <ambientLight intensity={lights.ambient} />
        <directionalLight
          position={[lights.keyX, lights.keyY, lights.keyZ]}
          intensity={lights.keyIntensity}
          color={lights.keyColor}
          castShadow
        />
        <directionalLight
          position={[-lights.keyX, lights.keyY * 0.6, -lights.keyZ]}
          intensity={lights.rimIntensity}
          color={lights.rimColor}
        />

        <Suspense fallback={null}>
          <Physics
            gravity={[0, physics.gravity, 0]}
            debug={physics.debug}
            paused={!physics.enabled}
            timeStep="vary"
          >
            <HeroRig hero={hero} pressFx={pressFx} pressState={pressState} onPress={triggerPress} playIntro={playIntro} />

            {eggs.enabled && (
              <FallingField
                count={eggs.count}
                spreadX={eggs.spreadX}
                spreadZ={eggs.spreadZ}
                spawnTop={eggs.spawnTop}
                spawnBottom={eggs.spawnBottom}
                scaleMin={eggs.scaleMin}
                scaleMax={eggs.scaleMax}
                initialFallSpeedMin={eggs.fallSpeedMin}
                initialFallSpeedMax={eggs.fallSpeedMax}
                spinMin={eggs.spinMin}
                spinMax={eggs.spinMax}
                restitution={eggs.restitution}
                friction={eggs.friction}
                mass={eggs.mass}
                linearDamping={eggs.linearDamping}
                angularDamping={eggs.angularDamping}
                renderItem={() =>
                  eggs.useCustomGLB ? <CustomGLBEgg path={eggs.customGLBPath} /> : <RamenEgg resources={eggResources} />
                }
                renderCollider={({ scale }) => (
                  <BallCollider
                    args={[
                      (eggs.useCustomGLB ? eggs.customColliderRadius : eggResources.colliderRadius) * scale,
                    ]}
                  />
                )}
                seed={eggSeed}
              />
            )}

            {naruto.enabled && (
              <FallingField
                count={naruto.count}
                spreadX={naruto.spreadX}
                spreadZ={naruto.spreadZ}
                spawnTop={naruto.spawnTop}
                spawnBottom={naruto.spawnBottom}
                scaleMin={naruto.scaleMin}
                scaleMax={naruto.scaleMax}
                initialFallSpeedMin={naruto.fallSpeedMin}
                initialFallSpeedMax={naruto.fallSpeedMax}
                spinMin={naruto.spinMin}
                spinMax={naruto.spinMax}
                restitution={naruto.restitution}
                friction={naruto.friction}
                mass={naruto.mass}
                linearDamping={naruto.linearDamping}
                angularDamping={naruto.angularDamping}
                renderItem={() => <Narutomaki resources={narutoResources} />}
                renderCollider={({ scale }) => (
                  <CylinderCollider
                    args={[narutoResources.colliderHalfHeight * scale, narutoResources.colliderRadius * scale]}
                  />
                )}
                seed={narutoSeed}
              />
            )}
          </Physics>

          <Environment preset={scene.envPreset} environmentIntensity={scene.envIntensity} />
          {scene.showShadows && (
            <ContactShadows position={[0, -1.1, 0]} opacity={scene.shadowOpacity} blur={scene.shadowBlur} scale={8} far={3} />
          )}
        </Suspense>

        {orbit.enabled && (
          <OrbitControls
            makeDefault
            enablePan={false}
            enableZoom={false}
            enableDamping
            dampingFactor={orbit.damping}
            autoRotate={orbit.autoRotate}
            autoRotateSpeed={orbit.autoRotateSpeed}
            minAzimuthAngle={-azR}
            maxAzimuthAngle={azR}
            minPolarAngle={Math.max(0.01, Math.PI / 2 - polUp)}
            maxPolarAngle={Math.min(Math.PI - 0.01, Math.PI / 2 + polDown)}
          />
        )}

        <PostFX fx={fx} pressFx={pressFx} pressState={pressState} />
      </Canvas>
      </ErrorBoundary>

      <CoolButton
        label={buttonStyle.label}
        bg={buttonStyle.bg}
        text={buttonStyle.text}
        border={buttonStyle.border}
        hoverBg={buttonStyle.hoverBg}
        hoverText={buttonStyle.hoverText}
        fontSize={buttonStyle.fontSize}
        paddingX={buttonStyle.paddingX}
        paddingY={buttonStyle.paddingY}
        radius={buttonStyle.radius}
        staggerEach={buttonStyle.staggerEach}
        onClick={() => window.open('https://pekoneko.superbexperience.com/reserve/guests', '_blank', 'noopener,noreferrer')}
      />

      {/* truthful loading overlay — opaque solid bg, real progress %.
         Stays up until ALL drei loaders resolve + a 250ms grace period,
         then fades 700ms. Pointer events stay locked while visible so
         tap-during-load can't desync the press FX. */}
      <div
        aria-hidden={overlayHidden}
        style={{
          position: 'fixed',
          inset: 0,
          background: scene.bg,
          opacity: overlayHidden ? 0 : 1,
          pointerEvents: overlayHidden ? 'none' : 'auto',
          transition: 'opacity 700ms cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99,
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,0.7)',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            fontSize: 12,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
          }}
        >
          {`Peko Neko · ${Math.round(progress)}%`}
        </div>
      </div>
    </div>
  )
}
