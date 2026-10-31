'use client'

import { useEffect, useRef } from 'react'
import { TileField } from '@/components/ws/brand'
import { useReducedMotion } from './use-in-view'

const SPOT = 200

/**
 * Interaktivní pole Dílků v hero. Světlo sleduje jemně myš a mřížka se nepatrně
 * nakloní do perspektivy; klik vytvoří krátkou vlnu. Samotný motiv nic nezakrývá.
 */
export function HeroBackdrop() {
  const plate = useRef<HTMLDivElement>(null)
  const plane = useRef<HTMLDivElement>(null)
  const lit = useRef<HTMLDivElement>(null)
  const glow = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const el = plate.current
    const planeEl = plane.current
    const litEl = lit.current
    const glowEl = glow.current
    if (!el || !planeEl || !litEl || !glowEl) return

    let frame = 0
    let latest: PointerEvent | null = null

    const show = (on: boolean) => {
      litEl.style.opacity = on && !reduced ? '1' : '0'
    }

    const resetPlane = () => {
      planeEl.style.setProperty('--zq-rotate-x', '0deg')
      planeEl.style.setProperty('--zq-rotate-y', '0deg')
      glowEl.style.transform = 'translate3d(0, 0, 0) translate(-50%, -50%)'
      show(false)
    }

    const update = () => {
      frame = 0
      const event = latest
      if (!event) return

      const rect = el.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height
      if (!inside || reduced) {
        resetPlane()
        return
      }

      show(true)
      el.style.setProperty('--zq-x', `${x}px`)
      el.style.setProperty('--zq-y', `${y}px`)
      glowEl.style.transform = `translate3d(${x - rect.width * 0.38}px, ${y - rect.height * 0.34}px, 0) translate(-50%, -50%)`

      if (event.pointerType !== 'touch') {
        const nx = x / rect.width - 0.5
        const ny = y / rect.height - 0.5
        planeEl.style.setProperty('--zq-rotate-x', `${-ny * 3}deg`)
        planeEl.style.setProperty('--zq-rotate-y', `${nx * 4}deg`)
      }
    }

    const onMove = (event: PointerEvent) => {
      latest = event
      if (!frame) frame = requestAnimationFrame(update)
    }

    const onLeaveWindow = (event: PointerEvent) => {
      if (event.relatedTarget === null) resetPlane()
    }

    const onUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch') resetPlane()
    }

    const onDown = (event: PointerEvent) => {
      if (reduced) return
      const rect = el.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return

      const ring = document.createElement('span')
      ring.className = 'pointer-events-none absolute h-10 w-10 rounded-full border border-navy-200/40'
      ring.style.left = `${x - 20}px`
      ring.style.top = `${y - 20}px`
      el.appendChild(ring)
      const animation = ring.animate(
        [{ transform: 'scale(0.4)', opacity: 0.7 }, { transform: 'scale(9)', opacity: 0 }],
        { duration: 900, easing: 'cubic-bezier(.16,1,.3,1)' },
      )
      animation.onfinish = () => ring.remove()
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerout', onLeaveWindow)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointerdown', onDown, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerout', onLeaveWindow)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointerdown', onDown)
      cancelAnimationFrame(frame)
    }
  }, [reduced])

  return (
    <div
      ref={plate}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 top-0 overflow-hidden rounded-b-hero bg-navy-950"
    >
      <div ref={plane} className="hero-tile-plane absolute inset-0">
        <TileField cols={32} rows={20} className="-left-2 -top-2" />

        <div
          ref={lit}
          className="absolute inset-0 opacity-0 [&_span]:border-navy-200/35 [&_span]:bg-navy-300/30"
          style={{
            maskImage: `radial-gradient(${SPOT}px circle at var(--zq-x, -999px) var(--zq-y, -999px), #000, transparent)`,
            WebkitMaskImage: `radial-gradient(${SPOT}px circle at var(--zq-x, -999px) var(--zq-y, -999px), #000, transparent)`,
            transition: reduced ? 'none' : 'opacity 300ms ease',
          }}
        >
          <TileField cols={32} rows={20} className="-left-2 -top-2" />
        </div>
      </div>

      <div
        ref={glow}
        className="absolute left-[38%] top-[34%] h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,rgb(var(--navy-500)/0.32),transparent)]"
        style={{ transition: reduced ? 'none' : 'transform 500ms cubic-bezier(.16,1,.3,1)' }}
      />
    </div>
  )
}
