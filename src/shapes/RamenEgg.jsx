import React, { forwardRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'

/* --- Hügelschäffer egg profile (proper egg curve) ---
   t in [0, π]:   y = a·cos t   (top → bottom)
                  r = b·sin t · √(1 − e·cos t)  (asymmetric radius)
   Wider at the bottom (y<0), narrower/pointed at the top (y>0). */
function makeEggProfile(segments, lengthA, widthB, eggness) {
  const out = []
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI
    const y = lengthA * Math.cos(t)
    const r = widthB * Math.sin(t) * Math.sqrt(Math.max(0, 1 - eggness * Math.cos(t)))
    out.push(new THREE.Vector2(r, y))
  }
  return out
}

/* Shared geometry/material factory — runs ONCE per param set,
   not once per instance. */
export function useRamenEggResources({
  whiteColor,
  capColor,
  yolkColor,
  yolkEmissive,
  yolkEmissiveIntensity,
  yolkRoughness,
  roughness,
  metalness,
  lengthA,
  widthB,
  eggness,
  yolkRadius,
  yolkBulge,
  yolkOffsetY,
}) {
  const resources = useMemo(() => {
    const profile = makeEggProfile(64, lengthA, widthB, eggness)

    /* Dome (half-revolution lathe) — phiStart=π, phiLength=π
       puts the dome on the −Z half of space so the cut face is on +Z (camera). */
    const domeGeo = new THREE.LatheGeometry(profile, 48, Math.PI, Math.PI)
    domeGeo.computeVertexNormals()

    /* Cut-face cap — filled 2D egg outline in the XY plane.
       Default ShapeGeometry normal is +Z → faces the camera. */
    const right = profile
    const left = [...profile].slice(1, -1).reverse().map((p) => new THREE.Vector2(-p.x, p.y))
    const pts = [...right, ...left]
    const shape = new THREE.Shape()
    shape.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y)
    shape.closePath()
    const capGeo = new THREE.ShapeGeometry(shape, 64)

    /* Yolk half-dome (default occupies +Y).
       After rotation by +π/2 around X, it will occupy +Z → bulges toward the camera. */
    const yolkGeo = new THREE.SphereGeometry(yolkRadius, 36, 26, 0, Math.PI * 2, 0, Math.PI / 2)

    const whiteMat = new THREE.MeshStandardMaterial({
      color: whiteColor,
      roughness,
      metalness,
      side: THREE.DoubleSide,
    })
    const capMat = new THREE.MeshStandardMaterial({
      color: capColor,
      roughness: Math.min(1, roughness + 0.05),
      metalness,
      side: THREE.DoubleSide,
    })
    const yolkMat = new THREE.MeshStandardMaterial({
      color: yolkColor,
      emissive: yolkEmissive,
      emissiveIntensity: yolkEmissiveIntensity,
      roughness: yolkRoughness,
      metalness: 0,
    })

    /* World-radius for the physics collider — average half-extent. */
    const colliderRadius = (lengthA + widthB) * 0.5 * 0.85

    return {
      domeGeo,
      capGeo,
      yolkGeo,
      whiteMat,
      capMat,
      yolkMat,
      yolkBulge,
      yolkOffsetY,
      colliderRadius,
    }
  }, [
    whiteColor,
    capColor,
    yolkColor,
    yolkEmissive,
    yolkEmissiveIntensity,
    yolkRoughness,
    roughness,
    metalness,
    lengthA,
    widthB,
    eggness,
    yolkRadius,
    yolkBulge,
    yolkOffsetY,
  ])

  /* dispose the *previous* memoized resources when deps change or unmount.
     Without this, every slider tick leaks geometries + materials on the GPU
     until the WebGL context dies. */
  useEffect(() => {
    return () => {
      resources.domeGeo?.dispose?.()
      resources.capGeo?.dispose?.()
      resources.yolkGeo?.dispose?.()
      resources.whiteMat?.dispose?.()
      resources.capMat?.dispose?.()
      resources.yolkMat?.dispose?.()
    }
  }, [resources])

  return resources
}

const RamenEgg = forwardRef(function RamenEgg({ resources }, ref) {
  if (!resources) return null
  const { domeGeo, capGeo, yolkGeo, whiteMat, capMat, yolkMat, yolkBulge, yolkOffsetY } = resources

  return (
    <group ref={ref}>
      {/* dome on −Z side */}
      <mesh geometry={domeGeo} material={whiteMat} castShadow receiveShadow />
      {/* cap at z=0, normal facing +Z (camera) */}
      <mesh geometry={capGeo} material={capMat} />
      {/* yolk bulge — sits on the +Z side of the cap, scaled in Y (= +Z post-rotation) for bulge */}
      <mesh
        geometry={yolkGeo}
        material={yolkMat}
        position={[0, yolkOffsetY, 0.0015]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[1, yolkBulge, 1]}
        castShadow
      />
    </group>
  )
})

export default RamenEgg
