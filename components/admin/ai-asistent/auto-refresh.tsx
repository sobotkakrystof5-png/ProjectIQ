'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Obnoví data na obrazovce každých `seconds` sekund, jen když je karta vidět
 * (R-120): hovor, který robot právě dokončil, se objeví bez ručního obnovení.
 * Nic nekreslí. `router.refresh()` zachová stav formulářů i rozbalené části.
 */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    const timer = window.setInterval(tick, seconds * 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router, seconds])
  return null
}
