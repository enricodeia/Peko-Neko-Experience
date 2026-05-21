import React, { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'

/* Marquee-letter stagger hover:
   • Each char is a 1-line viewport containing two stacked copies (top + bottom).
   • Hover  → inner column slides up −50% (= 1 line) so the bottom copy appears;
              stagger starts from index 0 (left → right).
   • Leave  → inner column slides back to 0; stagger starts from the last index
              (right → left). */

export default function CoolButton({
  label = 'Prenota un tavolo',
  onClick,
  bg = '#ffffff',
  text = '#0a0a0a',
  border = '#ffffff',
  hoverBg = '#0a0a0a',
  hoverText = '#ffffff',
  fontSize = 20,
  paddingX = 64,
  paddingY = 24,
  radius = 999,
  staggerEach = 0.03,
}) {
  const wrapRef = useRef(null)
  const btnRef = useRef(null)
  const innerRefs = useRef([])
  const [hover, setHover] = useState(false)

  const chars = Array.from(label)

  /* intro: rise from below with elastic settle, slightly delayed so it
     enters after the hero's landing animation. */
  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.6 })
    tl.fromTo(
      wrapRef.current,
      { y: 140, opacity: 0 },
      { y: 0, opacity: 1, duration: 1.6, ease: 'elastic.out(1, 0.55)' }
    )
    return () => tl.kill()
  }, [])

  function rollIn() {
    gsap.to(innerRefs.current, {
      yPercent: -50,
      duration: 0.45,
      ease: 'power3.out',
      stagger: { from: 'start', each: staggerEach },
      overwrite: true,
    })
  }
  function rollOut() {
    gsap.to(innerRefs.current, {
      yPercent: 0,
      duration: 0.45,
      ease: 'power3.out',
      stagger: { from: 'end', each: staggerEach },
      overwrite: true,
    })
  }

  function onEnter() {
    setHover(true)
    rollIn()
    gsap.to(btnRef.current, { scale: 1.04, duration: 0.35, ease: 'power3.out' })
  }
  function onLeave() {
    setHover(false)
    rollOut()
    gsap.to(btnRef.current, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)' })
  }

  function onMove(e) {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    gsap.to(btnRef.current, {
      x: dx * 0.18,
      y: dy * 0.35,
      duration: 0.4,
      ease: 'power3.out',
      overwrite: 'auto',
    })
  }
  function handleLeaveFull() {
    onLeave()
    gsap.to(btnRef.current, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' })
  }

  function handleClick(e) {
    gsap.fromTo(
      btnRef.current,
      { scale: hover ? 1.04 : 1 },
      {
        scale: hover ? 1.1 : 1.05,
        duration: 0.12,
        yoyo: true,
        repeat: 1,
        ease: 'power2.inOut',
      }
    )
    onClick?.(e)
  }

  const cellStyle = {
    display: 'inline-block',
    overflow: 'hidden',
    height: '1em',
    lineHeight: 1,
    verticalAlign: 'top',
  }
  const innerStyle = {
    display: 'block',
    willChange: 'transform',
  }
  const copyStyle = { display: 'block', lineHeight: 1, height: '1em' }

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 'max(56px, env(safe-area-inset-bottom))',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      <button
        ref={btnRef}
        onClick={handleClick}
        onMouseEnter={onEnter}
        onMouseMove={onMove}
        onMouseLeave={handleLeaveFull}
        style={{
          pointerEvents: 'auto',
          position: 'relative',
          padding: `${paddingY}px ${paddingX}px`,
          borderRadius: radius,
          border: `1.5px solid ${border}`,
          background: hover ? hoverBg : bg,
          color: hover ? hoverText : text,
          fontSize,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          cursor: 'pointer',
          overflow: 'hidden',
          willChange: 'transform',
          transition: 'background 300ms ease, color 300ms ease',
          boxShadow: hover
            ? `0 30px 80px ${hoverBg}33, inset 0 1px 0 ${hoverBg}55`
            : `0 18px 48px ${bg}33, inset 0 1px 0 #ffffff`,
        }}
      >
        <span style={{ display: 'inline-flex', lineHeight: 1 }}>
          {chars.map((c, i) => (
            <span key={i} style={cellStyle}>
              <span
                ref={(el) => (innerRefs.current[i] = el)}
                style={innerStyle}
              >
                <span style={copyStyle}>{c === ' ' ? ' ' : c}</span>
                <span style={copyStyle}>{c === ' ' ? ' ' : c}</span>
              </span>
            </span>
          ))}
        </span>
      </button>
    </div>
  )
}
