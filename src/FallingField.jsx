import React, { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'

function rand(a, b) {
  return a + Math.random() * (b - a)
}

/**
 * Physics-driven falling field.
 *
 * Each particle is a dynamic RigidBody — it falls under gravity, collides with
 * the hero collider, and is recycled to the top once it passes `spawnBottom`.
 *
 * `renderItem({ scale })` returns the visual JSX (no transform — RigidBody owns it).
 * `renderCollider({ scale })` returns the collider JSX (BallCollider / CylinderCollider / etc).
 */
export default function FallingField({
  count,
  spreadX,
  spreadZ,
  spawnTop,
  spawnBottom,
  scaleMin,
  scaleMax,
  initialFallSpeedMin,
  initialFallSpeedMax,
  spinMin,
  spinMax,
  restitution,
  friction,
  mass,
  linearDamping,
  angularDamping,
  renderItem,
  renderCollider,
  seed = 1,
}) {
  const refs = useRef([])

  const data = useMemo(() => {
    const out = []
    const range = spawnTop - spawnBottom
    for (let i = 0; i < count; i++) {
      const axis = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize()
      const spin = rand(spinMin, spinMax) * (Math.random() < 0.5 ? -1 : 1)
      out.push({
        x0: rand(-spreadX, spreadX),
        z0: rand(-spreadZ, spreadZ),
        y0: spawnBottom + Math.random() * range,
        scale: rand(scaleMin, scaleMax),
        fallSpeed: rand(initialFallSpeedMin, initialFallSpeedMax),
        angVel: [axis.x * spin, axis.y * spin, axis.z * spin],
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    count,
    spreadX,
    spreadZ,
    spawnTop,
    spawnBottom,
    scaleMin,
    scaleMax,
    initialFallSpeedMin,
    initialFallSpeedMax,
    spinMin,
    spinMax,
    seed,
  ])

  /* seed the bodies on (re-)create */
  useEffect(() => {
    refs.current.forEach((rb, i) => {
      const d = data[i]
      if (!rb || !d) return
      rb.setTranslation({ x: d.x0, y: d.y0, z: d.z0 }, true)
      rb.setLinvel({ x: 0, y: -d.fallSpeed, z: 0 }, true)
      rb.setAngvel({ x: d.angVel[0], y: d.angVel[1], z: d.angVel[2] }, true)
    })
  }, [data])

  /* recycle when below threshold */
  useFrame(() => {
    for (let i = 0; i < refs.current.length; i++) {
      const rb = refs.current[i]
      if (!rb) continue
      const t = rb.translation()
      if (t.y < spawnBottom) {
        const d = data[i]
        rb.setTranslation(
          { x: rand(-spreadX, spreadX), y: spawnTop, z: rand(-spreadZ, spreadZ) },
          true
        )
        rb.setLinvel({ x: 0, y: -d.fallSpeed, z: 0 }, true)
        rb.setAngvel({ x: d.angVel[0], y: d.angVel[1], z: d.angVel[2] }, true)
      }
    }
  })

  return (
    <>
      {data.map((d, i) => (
        <RigidBody
          key={i}
          ref={(el) => (refs.current[i] = el)}
          colliders={false}
          mass={mass}
          friction={friction}
          restitution={restitution}
          linearDamping={linearDamping}
          angularDamping={angularDamping}
          ccd
        >
          <group scale={d.scale}>{renderItem({ scale: d.scale })}</group>
          {renderCollider({ scale: d.scale })}
        </RigidBody>
      ))}
    </>
  )
}
