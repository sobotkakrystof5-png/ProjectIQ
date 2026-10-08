'use client'

import { useEffect, useState, type RefObject } from 'react'

/** Je prvek ve viewportu? Ukázky se mimo něj zastaví (brief § 4.1). */
export function useInView(ref: RefObject<Element | null>, { once = false, rootMargin = '0px', threshold = 0.2 } = {}) {
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting)
        if (entry.isIntersecting && once) observer.disconnect()
      },
      { rootMargin, threshold },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, once, rootMargin, threshold])

  return inView
}

/** Uživatel si v systému vypnul animace. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return reduced
}

/** Je záložka vidět? Cyklus ukázky na skryté záložce zbytečně běží. */
export function usePageVisible() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible')
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  return visible
}

/** Běží smyčka ukázky? Jen ve viewportu, na viditelné záložce a bez prefers-reduced-motion. */
export function useLoopActive(ref: RefObject<Element | null>) {
  const inView = useInView(ref, { threshold: 0.15 })
  const visible = usePageVisible()
  const reduced = useReducedMotion()
  return { active: inView && visible && !reduced, reduced, inView }
}

/**
 * Stav nájezdu při scrollu: `idle` = ukázat rovnou (bez JS, s prefers-reduced-motion, nebo je
 * prvek vidět už při načtení), `pending` = čeká pod ohybem schovaný, `shown` = právě přijel.
 */
export function useRevealState(ref: RefObject<Element | null>, threshold = 0.12) {
  const [state, setState] = useState<'idle' | 'pending' | 'shown'>('idle')

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return

    setState('pending')
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setState('shown')
        observer.disconnect()
      },
      { threshold },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, threshold])

  return state
}
