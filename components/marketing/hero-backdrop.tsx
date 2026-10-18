'use client'

import { useEffect, useRef } from 'react'
import { TileField } from '@/components/ws/brand'
import { useReducedMotion } from './use-in-view'

/** Poloměr světla pod kurzorem v px. */
const SPOT = 200

/**
 * Tmavá plocha úvodu. Kurzor (nebo prst) rozsvěcí dílky kolem sebe a posouvá světelný
 * záblesk; klik vyšle krátké vlnění. Ukazatel se nikdy nechytá, odkazy a tlačítka fungují dál.
 * Reduced motion: světlo jen přepíná bez pohybu a vlnění se nespouští.
 */
export function HeroBackdrop() {
  const plate = useRef<HTMLDivElement>(null)
  const lit = useRef<HTMLDivElement>(null)
  const glow = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const el = plate.current
    const litEl = lit.current
    const glowEl = glow.current
    if (!el || !litEl || !glowEl) return

    const show = (on: boolean) => {
      litEl.style.opacity = on ? '1' : '0'
    }

    const place = (x: number, y: number) => {
      el.style.setProperty('--zq-x', `${x}px`)
      el.style.setProperty('--zq-y', `${y}px`)
      glowEl.style.left = `${x}px`
      glowEl.style.top = `${y}px`
    }

    /** Souřadnice ukazatele vůči ploše; mimo plochu světlo zhasne. */
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      const inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height
      return inside ? { x, y } : null
    }

    const onMove = (e: PointerEvent) => {
      const p = local(e)
      show(p !== null)
      if (p) place(p.x, p.y)
    }

    const onLeave = (e: PointerEvent) => {
      if (!e.relatedTarget) show(false)
    }

    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') show(false)
    }

    const onDown = (e: PointerEvent) => {
      const p = local(e)
      if (!p || reduced) return
      const ring = document.createElement('span')
      ring.className = 'pointer-events-none absolute h-10 w-10 rounded-full border border-navy-200/40'
      ring.style.left = `${p.x - 20}px`
      ring.style.top = `${p.y - 20}px`
      el.appendChild(ring)
      const anim = ring.animate(
        [
          { transform: 'scale(0.4)', opacity: 0.7 },
          { transform: 'scale(9)', opacity: 0 },
        ],
        { duration: 1000, easing: 'cubic-bezier(.2,.8,.2,1)' },
      )
      anim.onfinish = () => ring.remove()
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerout', onLeave)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointerdown', onDown, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerout', onLeave)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [reduced])

  return (
    <div
      ref={plate}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 top-0 overflow-hidden rounded-b-hero bg-navy-950"
    >
      <TileField cols={32} rows={20} className="-left-2 -top-2" />

      {/* Rozsvícené dílky: stejná mřížka, zobrazená jen v kruhu kolem kurzoru. */}
      <div
        ref={lit}
        className={`absolute inset-0 opacity-0 [&_span]:border-navy-200/35 [&_span]:bg-navy-300/30 ${reduced ? '' : 'transition-opacity duration-300'}`}
        style={{
          maskImage: `radial-gradient(${SPOT}px circle at var(--zq-x, -999px) var(--zq-y, -999px), #000, transparent)`,
          WebkitMaskImage: `radial-gradient(${SPOT}px circle at var(--zq-x, -999px) var(--zq-y, -999px), #000, transparent)`,
        }}
      >
        <TileField cols={32} rows={20} className="-left-2 -top-2" />
      </div>

      <div
        ref={glow}
        className={`absolute h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 left-[38%] top-[34%] bg-[radial-gradient(closest-side,rgb(var(--navy-500)/0.32),transparent)] ${reduced ? '' : 'transition-[left,top] duration-500 ease-zq'}`}
      />
    </div>
  )
}
