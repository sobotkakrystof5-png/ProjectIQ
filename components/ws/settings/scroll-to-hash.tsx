'use client'

import { useEffect } from 'react'

/**
 * Staré adresy Nastavení přesměrují na sekci (`…/objednavky#web`). Prohlížeč
 * ke kotvě neodroluje, protože obsah dorazí až po kostře z loading.tsx.
 */
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }, [])
  return null
}
