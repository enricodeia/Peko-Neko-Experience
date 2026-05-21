import React, { forwardRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'

/* ---------- procedural pink-spiral texture (centered on the cap) ---------- */
function makeNarutoTexture(pink, white, turns, lineWidth, spiralRadiusFrac) {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')

  ctx.fillStyle = white
  ctx.fillRect(0, 0, size, size)

  ctx.save()
  ctx.translate(size / 2, size / 2)
  ctx.strokeStyle = pink
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const steps = 800
  const maxR = (size / 2) * spiralRadiusFrac
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const ang = t * Math.PI * 2 * turns
    const r = t * maxR
    const x = Math.cos(ang) * r
    const y = Math.sin(ang) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()

  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 8
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

/* ---------- star/flower outline (smooth rounded scallops) ---------- */
function makeStarShape(numPoints, baseRadius, petalDepth, petalSharpness, segments) {
  const shape = new THREE.Shape()
  const half = petalDepth / 2
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const ang = t * Math.PI * 2
    const wave = 0.5 + 0.5 * Math.cos(numPoints * ang) // 0..1
    const shaped = Math.pow(wave, petalSharpness)
    const r = baseRadius - half + petalDepth * shaped
    const x = Math.cos(ang) * r
    const y = Math.sin(ang) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  return shape
}

/* ---------- factory: build geometry + materials + texture once ---------- */
export function useNarutomakiResources({
  pink = '#ff5c8a',
  white = '#fbfbf6',
  sideColor = '#fbfbf6',
  turns = 4.2,
  lineWidth = 22,
  spiralRadiusFrac = 0.62,
  points = 11,
  baseRadius = 0.46,
  petalDepth = 0.16,
  petalSharpness = 1.2,
  thickness = 0.13,
  bevelSize = 0.05,
  bevelThickness = 0.06,
  bevelSegments = 5,
  roughness = 0.5,
  metalness = 0.05,
}) {
  const resources = useMemo(() => {
    /* SAFE polycount: shape outline 96 (was 360), curveSegments 12 (was 64).
       Plenty smooth for backdrop particles; user can crank bevel sliders. */
    const shape = makeStarShape(points, baseRadius, petalDepth, petalSharpness, 96)
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness,
      bevelSize,
      bevelSegments,
      curveSegments: 12,
    })
    geometry.translate(0, 0, -thickness / 2)
    geometry.computeVertexNormals()

    /* texture: map shape-XY → texture-UV via repeat/offset trick.
       Total covered span = 2 * Rmax. */
    const Rmax = baseRadius + petalDepth / 2 + bevelSize
    const texSize = Rmax * 2
    const texture = makeNarutoTexture(pink, white, turns, lineWidth, spiralRadiusFrac)
    texture.center.set(0, 0)
    texture.repeat.set(1 / texSize, 1 / texSize)
    texture.offset.set(0.5, 0.5)

    const capMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness,
      metalness,
    })
    const sideMat = new THREE.MeshStandardMaterial({
      color: sideColor,
      roughness: Math.min(1, roughness + 0.05),
      metalness,
    })

    const colliderRadius = baseRadius * 0.88
    const colliderHalfHeight = thickness * 0.5 + bevelThickness * 0.5

    return { geometry, materials: [capMat, sideMat], colliderRadius, colliderHalfHeight }
  }, [
    pink,
    white,
    sideColor,
    turns,
    lineWidth,
    spiralRadiusFrac,
    points,
    baseRadius,
    petalDepth,
    petalSharpness,
    thickness,
    bevelSize,
    bevelThickness,
    bevelSegments,
    roughness,
    metalness,
  ])

  /* dispose the *previous* memo (heavy ExtrudeGeometry + CanvasTexture)
     when deps change or unmount — otherwise GPU memory blows up. */
  useEffect(() => {
    return () => {
      resources.geometry?.dispose?.()
      resources.materials?.forEach((m) => {
        m.map?.dispose?.()
        m.dispose?.()
      })
    }
  }, [resources])

  return resources
}

/* ---------- instance ---------- */
const Narutomaki = forwardRef(function Narutomaki({ resources }, ref) {
  if (!resources) return null
  return (
    <mesh
      ref={ref}
      geometry={resources.geometry}
      material={resources.materials}
      castShadow
      receiveShadow
    />
  )
})

export default Narutomaki
